"""Turn Delphi's rigged dolphin into a luminous dust surface, preserving its swim rig."""
import bisect
import json
import math
import random
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent/"dolphin.glb"
TARGET = ROOT/"Models"/"Dolphin.glb"
rng = random.Random(15154)
raw = SOURCE.read_bytes()
size, = struct.unpack_from("<I",raw,12)
doc = json.loads(raw[20:20+size])
blob = raw[28+size:]

formats = {5121:"B",5123:"H",5125:"I",5126:"f"}
widths = {"SCALAR":1,"VEC3":3,"VEC4":4}


def read_accessor(index):
    a = doc["accessors"][index]
    view = doc["bufferViews"][a["bufferView"]]
    pattern = "<"+formats[a["componentType"]]*widths[a["type"]]
    stride = view.get("byteStride",struct.calcsize(pattern))
    offset = view.get("byteOffset",0)+a.get("byteOffset",0)
    return [struct.unpack_from(pattern,blob,offset+i*stride) for i in range(a["count"])]


body = doc["meshes"][0]["primitives"][0]
attrs = body["attributes"]
positions = read_accessor(attrs["POSITION"])
joints = read_accessor(attrs["JOINTS_0"])
weights = read_accessor(attrs["WEIGHTS_0"])
indices = [value[0] for value in read_accessor(body["indices"])]
triangle_indices = list(zip(indices[::3],indices[1::3],indices[2::3]))
cumulative = []
area = 0
for i,j,k in triangle_indices:
    a,b,c = positions[i],positions[j],positions[k]
    u = [q-p for p,q in zip(a,b)]
    v = [q-p for p,q in zip(a,c)]
    cross = (u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])
    area += math.sqrt(sum(x*x for x in cross))
    cumulative.append(area)

# Drop inherited textures from the new materials. Retain their source document
# layout so the remaining skin and animation references stay intact.
doc.pop("textures",None)
doc.pop("images",None)
doc.pop("samplers",None)
image_views = set()
for image in json.loads(raw[20:20+size]).get("images",[]):
    if "bufferView" in image:
        image_views.add(image["bufferView"])
output = bytearray()
for i,view in enumerate(doc["bufferViews"]):
    if i in image_views:
        view["byteOffset"] = 0
        view["byteLength"] = 4
        continue
    offset = view.get("byteOffset",0)
    view["byteOffset"] = len(output)
    output.extend(blob[offset:offset+view["byteLength"]])
    output.extend(b"\0"*(-len(output)%4))


def add_accessor(values,component_type,kind,target,bounds=False):
    pattern = "<"+formats[component_type]*widths[kind]
    encoded = b"".join(struct.pack(pattern,*value) for value in values)
    doc["bufferViews"].append({"buffer":0,"byteOffset":len(output),
                              "byteLength":len(encoded),"target":target})
    output.extend(encoded)
    output.extend(b"\0"*(-len(output)%4))
    accessor = {"bufferView":len(doc["bufferViews"])-1,"componentType":component_type,
                "count":len(values),"type":kind}
    if bounds:
        floats = list(struct.iter_unpack(pattern,encoded))
        accessor["min"] = [min(axis) for axis in zip(*floats)]
        accessor["max"] = [max(axis) for axis in zip(*floats)]
    doc["accessors"].append(accessor)
    return len(doc["accessors"])-1


def material(name,emission,opacity):
    result = {"name":name,"emissiveFactor":emission,"doubleSided":True,
              "pbrMetallicRoughness":{"baseColorFactor":[0,0,0,opacity],
                                      "metallicFactor":0,"roughnessFactor":1}}
    if opacity<1:
        result["alphaMode"] = "BLEND"
    return result


doc["materials"] = [
    material("Patronus / thin blue veil",[0.22,0.48,0.73],0.13),
    material("Patronus / faint eye light",[0.42,0.66,0.87],0.32),
    material("Patronus / silver dust",[0.47,0.69,0.94],1),
    material("Patronus / bright sparks",[0.91,0.97,1],1)]
for primitive in [body,doc["meshes"][1]["primitives"][0]]:
    for attribute in ("TEXCOORD_0","TEXCOORD_1"):
        primitive["attributes"].pop(attribute,None)

points_for_preview = []
tail_vertex = min(range(len(positions)),key=lambda i: abs(positions[i][2]+1.53)+abs(positions[i][0]))
tail = positions[tail_vertex]
for material_index,body_count,wake_count in [(2,2700,640),(3,720,120)]:
    count = body_count+wake_count
    dots, normals, dot_joints, dot_weights, dot_indices = [], [], [], [], []
    for sample in range(count):
        verts = triangle_indices[bisect.bisect_right(cumulative,rng.random()*area)]
        r = math.sqrt(rng.random())
        s = rng.random()
        mix = (1-r,r*(1-s),r*s)
        point = tuple(sum(mix[k]*positions[verts[k]][axis] for k in range(3)) for axis in range(3))
        influences = {}
        for fraction,vertex in zip(mix,verts):
            for joint,weight in zip(joints[vertex],weights[vertex]):
                if weight:
                    influences[joint] = influences.get(joint,0)+weight*fraction
        if sample >= body_count:
            t = rng.random()**1.24
            strand = rng.randrange(3)
            phase = math.tau*strand/3
            scatter = 0.013+0.047*t
            point = (tail[0]+(0.05+0.18*t)*math.cos(8*t+phase)+rng.gauss(0,scatter),
                     tail[1]+0.26*t+0.13*math.sin(9*t+phase)*math.sin(math.pi*t/1.4)
                     +rng.gauss(0,scatter),
                     tail[2]-1.05*t+rng.gauss(0,scatter))
            influences = {joint:weight for joint,weight in zip(joints[tail_vertex],weights[tail_vertex]) if weight}
        strongest = sorted(influences.items(),key=lambda entry:-entry[1])[:4]
        mass = sum(weight for _,weight in strongest)
        strongest += [(0,0)]*(4-len(strongest))
        radius = rng.uniform(0.0012,0.0031) if material_index==2 else rng.uniform(0.0015,0.0041)
        if sample >= body_count:
            radius *= 0.96-0.53*t
        points_for_preview.append((*point,radius,material_index))
        offset = len(dots)
        for x,y,z in ((1,1,1),(1,-1,-1),(-1,1,-1),(-1,-1,1)):
            dots.append((point[0]+x*radius,point[1]+y*radius,point[2]+z*radius))
            normals.append(tuple(v/math.sqrt(3) for v in (x,y,z)))
            dot_joints.append(tuple(joint for joint,_ in strongest))
            dot_weights.append(tuple(weight/mass for _,weight in strongest))
        dot_indices.extend((offset+i,) for i in (0,1,2,0,3,1,0,2,3,1,3,2))
    doc["meshes"][0]["primitives"].append({
        "attributes":{"POSITION":add_accessor(dots,5126,"VEC3",34962,True),
                      "NORMAL":add_accessor(normals,5126,"VEC3",34962),
                      "JOINTS_0":add_accessor(dot_joints,5121,"VEC4",34962),
                      "WEIGHTS_0":add_accessor(dot_weights,5126,"VEC4",34962)},
        "indices":add_accessor(dot_indices,5123,"SCALAR",34963),
        "material":material_index})

# Repack only buffer views still referenced by the original rig or new meshes.
used_accessors = set()
for mesh in doc["meshes"]:
    for primitive in mesh["primitives"]:
        used_accessors.update(primitive["attributes"].values())
        used_accessors.add(primitive["indices"])
for clip in doc["animations"]:
    for sampler in clip["samplers"]:
        used_accessors.update((sampler["input"],sampler["output"]))
for skin in doc["skins"]:
    used_accessors.add(skin["inverseBindMatrices"])
accessor_map = {index:new for new,index in enumerate(sorted(used_accessors))}
doc["accessors"] = [doc["accessors"][index] for index in sorted(used_accessors)]
for mesh in doc["meshes"]:
    for primitive in mesh["primitives"]:
        primitive["attributes"] = {key:accessor_map[value] for key,value in primitive["attributes"].items()}
        primitive["indices"] = accessor_map[primitive["indices"]]
for clip in doc["animations"]:
    for sampler in clip["samplers"]:
        for field in ("input","output"):
            sampler[field] = accessor_map[sampler[field]]
for skin in doc["skins"]:
    skin["inverseBindMatrices"] = accessor_map[skin["inverseBindMatrices"]]
used_views = sorted({a["bufferView"] for a in doc["accessors"]})
view_map = {index:new for new,index in enumerate(used_views)}
doc["bufferViews"] = [doc["bufferViews"][index] for index in used_views]
packed = bytearray()
for view in doc["bufferViews"]:
    offset = view["byteOffset"]
    view["byteOffset"] = len(packed)
    packed.extend(output[offset:offset+view["byteLength"]])
    packed.extend(b"\0"*(-len(packed)%4))
for a in doc["accessors"]:
    a["bufferView"] = view_map[a["bufferView"]]
doc["buffers"][0]["byteLength"] = len(packed)
doc["asset"]["generator"] = "Delphi patronus from original swim rig"
encoded = json.dumps(doc,separators=(",",":")).encode()
encoded += b" "*(-len(encoded)%4)
header = struct.pack("<4sIIII",b"glTF",2,28+len(encoded)+len(packed),len(encoded),0x4E4F534A)
TARGET.write_bytes(header+encoded+struct.pack("<II",len(packed),0x004E4942)+packed)
if len(sys.argv) > 2:
    Path(sys.argv[2]).write_text(json.dumps(points_for_preview))
