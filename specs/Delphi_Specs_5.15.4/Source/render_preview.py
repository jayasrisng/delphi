"""Project the generated dust geometry into a preview sheet. Requires Pillow."""
import json
import math
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

import build_assets as assets

WIDTH, HEIGHT = 1440, 980
ink = Image.new("RGB",(WIDTH,HEIGHT))
dot = ImageDraw.Draw(ink)
background = Image.new("RGB",(WIDTH,HEIGHT))
field = background.load()
for y in range(HEIGHT):
    for x in range(WIDTH):
        r = math.hypot((x-770)/880,(y-312)/550)
        light = math.exp(-r*r*2.2)
        field[x,y] = (int(4+6*light),int(8+15*light),int(18+29*light))


def color(rgb, light=1):
    return tuple(min(255,round(c*255*light)) for c in rgb)


def spark(x,y,rgb,sx,sy):
    if max(sx,sy) < 0.75:
        dot.point((round(x),round(y)),fill=color(rgb,0.49+0.56*max(sx,sy)))
    else:
        dot.ellipse((x-sx,y-sy,x+sx,y+sy),fill=color(rgb))


def project(mesh, x, y, s):
    def point(p):
        return (x+(p[0]+0.13*p[2])*s, y-(p[1]-0.11*p[2])*s)
    for a,b,halfwidth,rgb in mesh.lines:
        dot.line([point(a),point(b)],fill=color(rgb,0.60 if halfwidth<0.072 else 0.83),
                 width=max(1,round(halfwidth*s)))
    for p,rx,ry,angle,rgb in mesh.sparks:
        px,py=point(p)
        if max(rx,ry) > 0.30:
            end_x,end_y=-math.sin(angle)*ry*s,-math.cos(angle)*ry*s
            dot.line([(px-end_x,py-end_y),(px+end_x,py+end_y)],fill=color(rgb,0.85),width=1)
            spark(px,py,rgb,rx*s*0.25,rx*s*0.25)
        else:
            spark(px,py,rgb,rx*s,ry*s)


cloud=assets.cluster()
project(cloud,430,417,10.8)
for slot,tint in zip(assets.SOCKETS,assets.PALETTE):
    mesh=assets.Mesh()
    assets.note_star(mesh,slot,1.78,tint)
    project(mesh,430,417,10.8)

samples=json.load(open(sys.argv[1]))
for x,y,z,radius,tint in sorted(samples,key=lambda value:value[0]):
    px=1144+(z+0.30+x*0.40)*178
    py=407-(y+x*0.28)*178+(z+0.3)*20
    rgb=(0.91,0.97,1) if tint==3 else (0.47,0.69,0.94)
    spark(px,py,rgb,radius*215,radius*215)

patterns=[
    assets.constellation("Delphinus",[(-15,-11,0),(-5,-2,0),(3,7,0),(12,10,0),
                          (17,3,0),(7,0,0)],[(0,1),(1,2),(2,3),(3,4),(4,5),(5,2)],2),
    assets.constellation("Leo",[(-23,-4,0),(-13,5,0),(-8,-8,0),(7,-8,0),
                          (11,1,0),(17,5,0),(22,12,0),(17,18,0),(10,15,0)],
                          [(0,1),(1,2),(2,0),(2,3),(1,4),(3,4),(4,5),(5,6),(6,7),(7,8)],3)
]
project(patterns[0],965,794,4.3)
project(patterns[1],1245,801,4.3)
for i,tint in enumerate(assets.PALETTE):
    piece=assets.Mesh()
    assets.note_star(piece,(0,0,0),1.78,tint)
    project(piece,125+i*135,800,21)

wide=ink.filter(ImageFilter.GaussianBlur(13)).point(lambda x:min(255,int(x*2.5)))
bloom=ink.filter(ImageFilter.GaussianBlur(2.6)).point(lambda x:min(255,int(x*1.4)))
out=ImageChops.add(ImageChops.add(ImageChops.add(background,wide),bloom),ink)
draw=ImageDraw.Draw(out)
regular="/System/Library/Fonts/Helvetica.ttc"
serif="/System/Library/Fonts/Supplemental/Georgia.ttf"


def text(x,y,value,size,fill,font=regular):
    draw.text((x,y),value,font=ImageFont.truetype(font,size),fill=fill,anchor="ls")


white="#eef6ff"
muted="#93b5d8"
text(66,54,"D E L P H I    /    S P E C S",14,muted)
text(66,136,"Celestial sound",71,white,serif)
text(68,170,"Stardust assets for Lens Studio 5.15.4",21,muted)
draw.line((68,201,1372,201),fill="#2c415b")
text(68,610,"Stardust cluster",30,white,serif)
text(68,637,"Silver dust and strands coil around five playable sparks.",17,muted)
text(825,610,"Patronus dolphin",30,white,serif)
text(825,637,"Luminous dust follows the rig through its swim cycle.",17,muted)
draw.line((68,675,1372,675),fill="#2c415b")
text(68,726,"Playable sparks",26,white,serif)
text(825,726,"Constellation guides",26,white,serif)
for i,note in enumerate(assets.NOTES):
    text(114+i*135,873,note,15,muted)
text(908,896,"Delphinus",16,muted)
text(1230,896,"Leo",16,muted)
text(68,947,"Geometry preview with illustrative bloom. On-device brightness will vary with room lighting.",15,muted)
out.save(assets.ROOT/"Preview.png",optimize=True)
