"""Build Delphi's standalone glTF 2.0, sprite, note and preview assets."""
import json
import math
import random
import struct
import subprocess
import tempfile
import wave
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAU = math.tau
WHITE = (0.95, 0.98, 1.0)
ICE = (0.31, 0.56, 0.84)
SILVER = (0.67, 0.84, 0.98)
PALETTE = [(0.72, 0.88, 1), (0.70, 0.94, 1), (0.83, 0.81, 1),
           (0.96, 0.93, 0.83), (0.70, 0.96, 0.94)]
SOCKETS = [(-18, 8, 1), (-9, -9, 5), (0, 13, 0), (9, -5, 6), (18, 6, -1)]
NOTES = ["C5", "D5", "E5", "G5", "A5"]
SIGNALS = {}
FACES = ((0,2,4),(4,2,1),(1,2,5),(5,2,0),
         (4,3,0),(1,3,4),(5,3,1),(0,3,5))


class Mesh:
    def __init__(self):
        self.groups = {}
        self.sparks = []
        self.lines = []

    def face(self, color, vertices):
        self.groups.setdefault(color, []).extend(vertices)

    def gem(self, center, size, color, angle=0, aspect=(1, 1, 1)):
        x, y, z = center
        rx, ry, rz = (size * value for value in aspect)
        c, s = math.cos(angle), math.sin(angle)
        vertices = [(x+c*u-s*v, y+s*u+c*v, z+w)
                    for u,v,w in [(rx,0,0),(-rx,0,0),(0,ry,0),(0,-ry,0),
                                  (0,0,rz),(0,0,-rz)]]
        for face in FACES:
            self.face(color, [vertices[i] for i in face])
        self.sparks.append((center, rx, ry, angle, color))

    def ray(self, a, b, width, color, preview=True):
        delta = [q-p for p,q in zip(a,b)]
        xy = math.hypot(delta[0], delta[1])
        ux, uy = (-delta[1]/xy, delta[0]/xy) if xy else (1,0)
        for offset in ((ux*width,uy*width,0),(0,0,width)):
            upper, lower = ([p+direction*d for p,d in zip(end,offset)]
                            for end,direction in [(a,1),(a,-1)])
            upper_b, lower_b = ([p+direction*d for p,d in zip(b,offset)]
                                for direction in (1,-1))
            self.face(color, [upper,lower,upper_b,upper_b,lower,lower_b])
        if preview:
            self.lines.append((a,b,width,color))

    def save(self, name):
        binary = bytearray()
        views, accessors, materials, primitives = [], [], [], []
        all_points = []
        for color, vertices in self.groups.items():
            points = [tuple(v / 100 for v in p) for p in vertices]
            all_points.extend(points)
            normals = []
            for a,b,c in zip(points[::3],points[1::3],points[2::3]):
                u = [q-p for p,q in zip(a,b)]
                v = [q-p for p,q in zip(a,c)]
                cross = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
                length = math.sqrt(sum(n*n for n in cross))
                normals.extend([tuple(n/length for n in cross) if length else (0,0,1)]*3)
            attributes = {}
            for label, data in (("POSITION",points),("NORMAL",normals)):
                view = {"buffer":0,"byteOffset":len(binary),"byteLength":12*len(data),
                        "target":34962}
                binary.extend(b"".join(struct.pack("<3f",*point) for point in data))
                accessor = {"bufferView":len(views),"componentType":5126,
                            "count":len(data),"type":"VEC3"}
                if label == "POSITION":
                    # Round through float32 to match the stored bounds exactly.
                    values = list(struct.iter_unpack("<3f",binary[view["byteOffset"]:]))
                    accessor["min"] = [min(axis) for axis in zip(*values)]
                    accessor["max"] = [max(axis) for axis in zip(*values)]
                attributes[label] = len(accessors)
                views.append(view)
                accessors.append(accessor)
            materials.append({"name":f"{name}_Emissive_{len(materials)+1}",
                              "doubleSided":True,"emissiveFactor":list(color),
                              "pbrMetallicRoughness":{"baseColorFactor":[0,0,0,1],
                                                      "metallicFactor":0,"roughnessFactor":1}})
            primitives.append({"attributes":attributes,"material":len(materials)-1})
        gltf = {"asset":{"version":"2.0","generator":"Delphi"},
                "scene":0,"scenes":[{"nodes":[0]}],"nodes":[{"name":name,"mesh":0}],
                "meshes":[{"name":name,"primitives":primitives}],"materials":materials,
                "accessors":accessors,"bufferViews":views,
                "buffers":[{"byteLength":len(binary)}]}
        encoded = json.dumps(gltf,separators=(",",":")).encode()
        encoded += b" " * (-len(encoded)%4)
        header = struct.pack("<4sIIII",b"glTF",2,28+len(encoded)+len(binary),len(encoded),0x4E4F534A)
        (ROOT/"Models"/f"{name}.glb").write_bytes(header+encoded+struct.pack("<II",len(binary),0x004E4942)+binary)
        SIGNALS[name] = {
            "size_cm":[round((max(axis)-min(axis))*100, 2) for axis in zip(*all_points)],
            "triangles":len(all_points)//3,
            "materials":len(materials)}
        return self


def note_star(mesh, center, radius, color):
    mesh.gem(center,radius*0.14,WHITE)
    # Fine axes taper into a hot center. Offsets keep the flare visible in 3D.
    mesh.gem(center,radius,color,aspect=(0.10,1,0.08))
    mesh.gem(center,radius*0.67,color,math.pi/2,aspect=(0.11,1,0.065))
    x,y,z = center
    mesh.ray((x,y-radius,z),(x,y+radius,z),radius*0.049,color,False)
    rng = random.Random(91)
    for _ in range(18):
        angle = rng.uniform(0,TAU)
        r = radius*rng.uniform(0.17,0.95)
        pos = (x+r*math.cos(angle),y+r*math.sin(angle),z+rng.gauss(0,radius*0.24))
        mesh.gem(pos,radius*rng.uniform(0.022,0.052),WHITE if rng.random()<0.33 else color)


def stream(arm, t):
    phase = arm * 1.59
    theta = phase + 0.7 + 5.8 * t + 0.23*math.sin(t*TAU + phase)
    r = 2.4 + 23 * t
    x = math.cos(theta)*r
    y = math.sin(theta)*r*0.54 + 0.17*x + 2.1*math.sin(8*t+phase)
    z = 7.5*math.sin(theta)*t + 5.4*math.sin(t*5.4+phase)
    return (x,y,z)


def cluster():
    rng = random.Random(15154)
    mesh = Mesh()
    mist = (0.17,0.31,0.50)
    filament = (0.34,0.55,0.78)
    for arm in range(4):
        for strand in range(3):
            previous = None
            for i in range(93):
                t = 0.12+0.86*i/92
                x,y,z = stream(arm,t)
                deviation = strand-1
                point = (x+0.68*deviation*math.sin(10*t), y+0.63*deviation*math.cos(12*t),
                         z+0.90*deviation)
                if previous and abs(math.sin(t*12+strand+arm)) > 0.19:
                    taper = math.sin(math.pi*i/93)**0.6
                    mesh.ray(previous,point,0.021+0.052*taper,
                             filament if strand==1 else mist)
                previous = point
        for i in range(330):
            t = rng.random()**0.82
            x,y,z = stream(arm,t)
            spread = 0.34+1.9*t
            point=(x+rng.gauss(0,spread),y+rng.gauss(0,spread*0.72),z+rng.gauss(0,spread))
            light=rng.random()
            radius=rng.uniform(0.038,0.102)*(1.65 if light>.95 else 1)
            mesh.gem(point,radius,WHITE if light>.85 else SILVER if light>.36 else ICE,
                     rng.uniform(0,TAU),(1.0,1.0,0.88))
    for i in range(360):
        theta=rng.uniform(0,TAU)
        radius=rng.uniform(2,29)
        point=(math.cos(theta)*radius,math.sin(theta)*radius*0.55,rng.uniform(-11,11))
        mesh.gem(point,rng.uniform(0.035,0.096),mist if i%3 else SILVER)
    return mesh.save("Stardust_Cluster")


def constellation(name, points, edges, hero):
    mesh = Mesh()
    for i,j in edges:
        mesh.ray(points[i],points[j],0.047,ICE)
    for index,point in enumerate(points):
        note_star(mesh,point,1.22 if index==hero else 0.78,SILVER)
    return mesh.save(name)


def effect(name, shape):
    rng = random.Random(name)
    mesh = Mesh()
    for i in range(78):
        angle = i*TAU/78
        point, rotation = shape(i,angle,rng)
        mesh.gem(point,rng.uniform(0.047,0.139),WHITE if i%4==0 else SILVER,
                 rotation,(1.3,0.82,0.73))
    return mesh.save(name)


def sprite(name, flare):
    size=96
    rgba=bytearray()
    for y in range(size):
        rgba.append(0)
        for x in range(size):
            u,v=[(p+0.5-size/2)/(size/2) for p in (x,y)]
            r=math.hypot(u,v)
            alpha=math.exp(-10*r*r)
            if flare:
                alpha += 0.82*math.exp(-abs(u)*9-v*v*260)+0.52*math.exp(-abs(v)*7-u*u*260)
            alpha *= max(0,min(1,(0.98-r)*9))
            rgba.extend((232,246,255,round(min(alpha,1)*255)))
    def chunk(tag,content):
        return struct.pack(">I",len(content))+tag+content+struct.pack(">I",zlib.crc32(tag+content))
    png=b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",size,size,8,6,0,0,0))
    (ROOT/"Textures"/f"{name}.png").write_bytes(png+chunk(b"IDAT",zlib.compress(rgba))+chunk(b"IEND",b""))


def audio():
    sample_rate=44100
    with tempfile.TemporaryDirectory() as temp:
        source=Path(temp)/"note.wav"
        for i,(label,midi) in enumerate(zip(NOTES,[72,74,76,79,81])):
            root=440*2**((midi-69)/12)
            samples=[]
            for frame in range(int(sample_rate*0.9)):
                t=frame/sample_rate
                attack=min(1,t/0.011)
                end=min(1,(0.9-t)/0.11)
                sample=sum(gain*math.exp(-t*decay)*math.sin(TAU*root*ratio*t)
                           for ratio,gain,decay in [(1,.51,4.7),(2.003,.23,7),(3.01,.13,11),(4.16,.07,19)])
                samples.append(round(22500*sample*attack*end))
            with wave.open(str(source),"wb") as out:
                out.setparams((1,2,sample_rate,0,"NONE","not compressed"))
                out.writeframes(struct.pack(f"<{len(samples)}h",*samples))
            subprocess.run(["ffmpeg","-nostdin","-loglevel","error","-y","-i",str(source),
                            "-codec:a","libmp3lame","-b:a","96k",
                            str(ROOT/"Audio"/f"Note_{i+1:02}_{label}.mp3")],check=True)


def main():
    cluster()
    for i,color in enumerate(PALETTE):
        piece=Mesh()
        note_star(piece,(0,0,0),1.78,color)
        piece.save(f"Star_{i+1:02}_{NOTES[i]}")
    for name, points, edges, hero in [
        ("Delphinus",[(-15,-11,0),(-5,-2,0),(3,7,0),(12,10,0),
                                  (17,3,0),(7,0,0)],
                      [(0,1),(1,2),(2,3),(3,4),(4,5),(5,2)],2),
        ("Leo",[(-23,-4,0),(-13,5,0),(-8,-8,0),(7,-8,0),
                             (11,1,0),(17,5,0),(22,12,0),(17,18,0),(10,15,0)],
                      [(0,1),(1,2),(2,0),(2,3),(1,4),(3,4),
                       (4,5),(5,6),(6,7),(7,8)],3)]:
        constellation(name, points, edges, hero)
    for name, shape in [
        ("Place_Burst",lambda i,a,r: ((math.cos(a)*r.uniform(2.3,5),math.sin(a)*r.uniform(2.3,5),r.uniform(-3,3)),a)),
        ("Note_Pulse",lambda i,a,r: ((5.3*math.cos(a),5.3*math.sin(a),0.75*math.sin(a*3)),a+math.pi/2)),
        ("Held_Trail",lambda i,a,r: ((-i*.105,math.cos(a*2)*i*.021+r.gauss(0,.28),math.sin(a*2)*i*.021+r.gauss(0,.28)),-0.24))]:
        effect(name, shape)
    sprite("Dust_Soft",False)
    sprite("Dust_Flare",True)
    audio()
    (ROOT/"asset_manifest.json").write_text(json.dumps(
        {"target":"Lens Studio 5.15.4","model_units":"meters","scene_units":"centimeters",
         "star_order":NOTES,"socket_positions_cm":SOCKETS,"models":SIGNALS},indent=2)+"\n")


if __name__ == "__main__":
    main()
