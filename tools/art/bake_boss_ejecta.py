"""Bake the side-lit ejected material volumes. A 24-slice front-to-back march
integrates density, cavity, temperature and a directional scatter approximation.
Rebuild with Python, NumPy and Pillow from the repository root.
"""
from pathlib import Path
import numpy as np
from PIL import Image

N = 192
SLICES = 24
axis = np.linspace(-1.16,1.16,N,dtype=np.float32)
X,Y = np.meshgrid(axis,axis)
profiles = [
    # shadow, scattering albedo, internal emission; bend, lobe count, turbulence, density, vertical squash
    ("164052","d0f4ec","a4e9e4",-.29,9,.38,2.0,.71),
    ("4e3b32","d4b99c","a18b76",.17,8,.32,1.2,.57),
    ("27252c","907066","ff8330",-.39,7,.39,3.3,.74),
    ("38273f","a787a2","d3bfd7",.34,6,.43,.80,.33),
    ("273b3c","97af99","a8e3b6",-.15,5,.36,1.2,.57),
    ("394661","b6d0e1","edcaed",.18,4,.34,.55,.45),
    ("243653","6786b4","aeecfc",-.24,7,.47,1.1,.50),
    ("222f20","a9ae76","ced278",-.11,11,.35,2.8,.85),
    ("141323","65516f","b990a5",.31,6,.37,1.6,.51),
    ("482638","b87d8b","f3b9b3",-.24,9,.45,1.1,.43),
    ("31383b","a99a93","e8c191",.31,8,.36,1.65,.67),
]

def rgb(hexcolor):
    return np.array([int(hexcolor[i:i+2],16)/255 for i in (0,2,4)],dtype=np.float32)

def noise(grid,x,y,z,f):
    xx=(x+4.1)*f; yy=(y+3.3)*f; zz=(z+5.7)*f
    ix=np.floor(xx).astype("i"); iy=np.floor(yy).astype("i"); iz=np.floor(zz).astype("i")
    dx=xx-ix;dy=yy-iy;dz=zz-iz
    dx=dx*dx*(3-2*dx);dy=dy*dy*(3-2*dy);dz=dz*dz*(3-2*dz)
    g=lambda a,b,c:grid[(ix+a)%32,(iy+b)%32,(iz+c)%32]
    low=(g(0,0,0)*(1-dx)+g(1,0,0)*dx)*(1-dy)+(g(0,1,0)*(1-dx)+g(1,1,0)*dx)*dy
    high=(g(0,0,1)*(1-dx)+g(1,0,1)*dx)*(1-dy)+(g(0,1,1)*(1-dx)+g(1,1,1)*dx)*dy
    return low*(1-dz)+high*dz

def bake(kind,params):
    dark,light,glow,bend,count,ruffle,thickness,squash=params
    rng=np.random.default_rng(1209+kind*7919);grid=rng.random((32,32,32),dtype=np.float32)
    lobes=[]
    for j in range(count):
        t=j/(count-1);x=-.66+t*1.33;y=bend*np.sin(t*np.pi)+rng.uniform(-.16,.16)
        lobes.append((x,y,rng.uniform(-.13,.13),.13+.20*np.sin(t*np.pi)**.65+rng.uniform(.01,.10)))
    shade,lit,ember=rgb(dark),rgb(light),rgb(glow)
    color=np.zeros((N,N,3),np.float32);trans=np.ones((N,N),np.float32)
    for z in np.linspace(.78,-.75,SLICES):
        a=noise(grid,X,Y,z,3.6);b=noise(grid,X+.15*a,Y-.12*a,z+.12*a,8)
        c=noise(grid,X,Y,z,19);d=noise(grid,X,Y,z,47)
        yy=Y/squash;dist=np.full((N,N),9.,np.float32)
        for cx,cy,cz,rad in lobes:
            dist=np.minimum(dist,np.sqrt(((X-cx)*.93)**2+(yy-cy)**2+((z-cz)*1.08)**2)-rad)
        disturb=(a-.5)*1.25+(b-.5)*.68+(c-.5)*.36+(d-.5)*.14
        density=np.clip((-dist+ruffle*disturb)*5.5,0,1)
        opacity=(1-np.exp(-density*thickness*.22))*(1-.26*c)
        gy,gx=np.gradient(density)
        luminance=np.clip(.48+.25*z+.68*(a-.43)+1.4*(gx+gy)+.28*(c-.5),0,1)
        heat=np.zeros_like(luminance)
        if kind==2:heat=np.clip((.17-np.abs(yy+.16)-.13*X+disturb*.20)*4,0,1)**1.4
        if kind in (0,6,7,9,10):heat=np.clip((b+.25*c-.81)*2.2,0,1)*(.54 if kind==0 else .34)
        col=shade+(lit-shade)*luminance[...,None]
        col=col+(ember-col)*heat[...,None]
        color+=col*(trans*opacity)[...,None];trans*=1-opacity
    alpha=1-trans
    result=np.dstack([color/np.maximum(alpha[...,None],.001),alpha])
    return Image.fromarray(np.uint8(np.clip(result,0,1)*255))

out=Path("assets/vfx/nextgen/boss-ejecta.webp")
atlas=Image.new("RGBA",(4*N,3*N))
for i,profile in enumerate(profiles):
    atlas.paste(bake(i,profile),(i%4*N,i//4*N))
atlas.save(out,quality=91,method=6)
print(out,out.stat().st_size)
