"""Render our actors' hand-keyed performances from their original portrait materials.

Install numpy, opencv-python-headless, pillow and imageio-ffmpeg in a production
environment. This is a build tool; the shipped game only decodes the finished films.
All rig locations are measured in a common 640 by 360 camera gate.
"""
import argparse
import math
from pathlib import Path
import subprocess

import cv2
import imageio_ffmpeg
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
INTRO = ROOT / "assets/intro"
OUT = INTRO / "performances"
FPS = 24
SIZE = (1440, 810)
GW, GH = 480, 270
U, V = np.meshgrid(np.linspace(0, 640, GW, dtype=np.float32),
                   np.linspace(0, 360, GH, dtype=np.float32))
X, Y = np.meshgrid(np.arange(SIZE[0], dtype=np.float32),
                   np.arange(SIZE[1], dtype=np.float32))
S = SIZE[0] / 640
cv2.setNumThreads(3)


def load(name):
    return cv2.resize(np.asarray(Image.open(INTRO / (name + ".webp")).convert("RGB")), SIZE,
                      interpolation=cv2.INTER_AREA)


def ease(a, b, t):
    x = np.clip((t-a)/(b-a), 0, 1)
    return x*x*(3-2*x)


def keys(t, stops):
    for (a, v), (b, w) in zip(stops, stops[1:]):
        if t <= b:
            return v + (w-v)*float(ease(a, b, t))
    return stops[-1][1]


def tissue(x, y, rx, ry):
    r2 = ((U-x)/rx)**2 + ((V-y)/ry)**2
    return np.maximum(1-r2, 0)**2


def mask(points, blur=1.1):
    result=np.zeros(SIZE[::-1], np.uint8)
    cv2.fillPoly(result, [np.rint(np.array(points)*S).astype(np.int32)], 255,
                 lineType=cv2.LINE_AA)
    return cv2.GaussianBlur(result,(0,0),blur*S)


def lerp_layers(back, front, coverage):
    return cv2.blendLinear(back, front, 1-coverage, coverage)


# eye corners are (inside left-to-right image x); lid motion compresses the
# underlying iris while bringing the photographed skin down from the brow.
class Head:
    def __init__(self, x, y, w, h, eyes, mouth, shoulder, seed):
        self.x, self.y, self.w, self.h = x,y,w,h
        self.face=tissue(x,y,w*.75,h*.77)
        self.skull=tissue(x,y,w*.98,h*1.04)
        self.chest=tissue(*shoulder)
        self.neck=tissue(x-4,y+h*.69,w*.70,h*.55)
        self.eyes=eyes
        self.mouth=mouth
        self.seed=seed

    def move(self, dx, dy, t, yaw, pitch, lean, speech, smile, blinks):
        x,y,w,h=self.x,self.y,self.w,self.h
        breathe=math.sin(t*1.51+self.seed)*.95
        # The nose projects farther than the temples during a head turn.
        depth=np.exp(-(((U-x-w*.15)/(w*.58))**2+((V-y)/(h*.63))**2))
        dx += self.skull*yaw*w*(.092+.18*depth) + self.neck*yaw*w*.045
        dy += self.skull*(pitch*h*.103 + yaw*(U-x)*.024)
        dx += self.chest*lean*w*.095
        dy += (self.chest + self.neck*.3)*(breathe-pitch*.7)*h*.03
        dy += self.skull*lean*(U-x)*.055
        blink=max((max(0,1-abs(t-b)/.112)**.63 for b in blinks),default=0)
        for ex,ey,ew,eh in self.eyes:
            # Inverse optical transport of the eyelid. Leave inner corners pinned.
            dx += tissue(ex,ey,ew*1.4,eh*2.3)*(yaw*ew*.063 + math.sin(t*1.5)*ew*.014)
            dy += tissue(ex,ey-eh*.52,ew*1.24,eh*2.45)*(blink*eh*1.25)
            dy += tissue(ex,ey-eh*2.7,ew*1.5,eh*2.0)*(pitch*eh*.38-smile*eh*.43)
        mx,my,mw,mh=self.mouth
        dy += tissue(mx,my+mh*.96,mw*1.28,mh*2.2)*(speech*mh*.82+pitch*.20)
        dy -= (tissue(mx-mw*.82,my,mw*.50,mh*1.5)+
               tissue(mx+mw*.82,my,mw*.50,mh*1.5))*smile*mh*.81
        dx += (U-mx)/mw*tissue(mx,my,mw*1.26,mh*1.75)*smile*mw*.12


CAST = {
    "command":[Head(201,90,78,90,[(215,82,11,3.0),(253,87,7,2.4)],(235,130,13,3.2),(165,240,154,119),0),
               Head(425,222,36,37,[(419,216,4,1.7),(436,218,3,1.6)],(424,240,7,2.1),(407,278,54,59),2.1)],
    "crew":[Head(180,127,30,34,[(180,119,4,1.6),(195,119,3.1,1.4)],(188,132,6,1.8),(179,191,42,54),1.4),
            Head(249,77,25,28,[(245,74,3.1,1.5),(258,73,2.8,1.5)],(255,88,4.5,1.2),(251,142,42,61),3.7),
            Head(328,123,31,38,[(322,114,4.2,1.8),(339,113,3.5,1.6)],(334,134,7.1,2.0),(325,205,53,69),2.2),
            Head(454,106,31,35,[(452,102,3.8,1.3),(468,99,3.2,1.3)],(464,117,5.6,1.9),(470,185,64,69),.9)],
    "lookback":[Head(184,95,83,91,[(207,98,11,3),(246,90,7,2.3)],(233,142,16,3.0),(198,250,170,111),1.1)],
    "helmet":[Head(202,124,66,77,[(199,112,10,2.5),(239,108,7,2.5)],(215,158,15,2.8),(188,258,170,101),1.3)]
}
CREW_HAND=tissue(202,184,22,35)
HELMET_LEFT=tissue(126,159,55,76)
HELMET_RIGHT=tissue(281,166,45,71)
PROP_POINTS=[(82,359),(105,337),(118,320),(125,303),(128,279),(141,260),(152,248),
             (170,245),(185,232),(202,222),(226,214),(245,211),(263,211),(285,214),
             (302,223),(319,237),(329,252),(337,271),(341,288),(353,289),(365,299),
             (370,314),(375,332),(366,337),(337,342),(300,348),(242,352),(185,357)]
PROP_MASK = mask(PROP_POINTS,.82).astype(np.float32)/255
# The cockpit rim hides the lower part of the gloves in the pickup frame.
# Trace the hanging object itself for the air pass, excluding that straight rim.
HELD_MASK = mask([(119,319),(124,306),*PROP_POINTS[3:24],(373,329),(366,336),
                  (354,338),(343,336),(334,332),(322,330),(312,336),(296,341),
                  (279,345),(256,346),(237,343),(218,336),(204,326),(197,316),
                  (186,319),(175,330),(159,339),(146,338),(132,332)],.75)


def helmet_parts(image, seated):
    # The same cockpit after the helmet has been seated supplies jacket cloth
    # behind the lifting prop. No empty painted silhouette is exposed.
    src=np.float32([(160,235),(261,235),(180,335)])
    dst=np.float32([(116,230),(309,236),(147,354)])
    lining=cv2.warpAffine(seated,cv2.getAffineTransform(src*S,dst*S),SIZE,
                          borderMode=cv2.BORDER_REFLECT_101)
    back=lerp_layers(image,lining,PROP_MASK)
    held=cv2.merge((*cv2.split(image),HELD_MASK))
    # A two-link arm needs a forearm between the original shoulder and the
    # moving glove. Register the photographed sleeves from the reverse angle.
    arms=[]
    for points,elbow,wrist in [
        ([(0,343),(24,288),(56,242),(91,200),(111,200),(125,214),
          (110,246),(79,287),(47,329),(22,351)], (31,316),(105,208)),
        ([(263,208),(293,192),(313,210),(336,244),(371,282),
          (401,315),(367,330),(332,295),(296,261),(278,237)],(370,306),(282,205))]:
        arms.append((cv2.merge((*cv2.split(seated),mask(points))),np.array(elbow),np.array(wrist)))
    return back, (held,arms)


def dialogue(t, lines):
    envelope=max((float(ease(a,a+.17,t)*(1-ease(b-.2,b,t))) for a,b in lines),default=0)
    return envelope*(.14+.52*abs(math.sin(t*9.1+.2))+
                     .27*max(0,math.sin(t*15.5-1)))


def perform(art, shot, t, image, prop):
    dx=np.zeros((GH,GW),np.float32)
    dy=np.zeros_like(dx)
    cast=CAST[art]
    if art=="command":
        replying=shot=="resolve"
        yaw=keys(t,[(0,-.22),(1.2,-.36),(2.8,.54),(4.5,.72),(6.3,.62),(8.0,-.48),(10.7,-.33),(12,.08)])
        pitch=keys(t,[(0,-.15),(2,.06),(3.2,.36),(5.6,-.22),(7.2,.25),(9.1,-.47),(11.9,-.15)])
        if replying:
            yaw=-yaw
            pitch+=keys(t,[(0,.29),(4,.15),(6.5,-.24),(10,-.36)])
        cast[0].move(dx,dy,t,yaw,pitch,.65*math.sin(t*.33),
            dialogue(t,[(7.1,11.8)] if replying else [(.8,6.6)]),.08,[1.18,5.22,8.62,11.12])
        cast[1].move(dx,dy,t,-yaw*.52,-pitch*.82,-.42,
            dialogue(t,[(2.2,6.6)] if replying else [(7.1,11.5)]),0,[2.6,6.88,10.14])
    elif art=="crew":
        for i,actor in enumerate(cast):
            delay=[.0,1.4,.55,2.2][i]
            yaw=keys(t-delay,[(0,-.42),(1.75,-.61),(3.5,.59),(5.8,.37),(8.1,.73),(10.2,-.15),(12.8,-.08)])
            pitch=keys(t-delay,[(0,.33),(2,.12),(3.7,-.75),(6.5,-.32),(9,-.58),(11.9,-.27)])
            actor.move(dx,dy,t,yaw,pitch,.68*math.sin(t*.47+i),
                       dialogue(t,[(1.6,7.1)]) if i==2 else 0,0,[2.1+delay,6.3+delay,10.8+delay])
        hand=keys(t,[(0,-.2),(2,.05),(4,1),(7.2,.75),(10.1,.20),(13,-.12)])
        dx-=CREW_HAND*hand*3.6
        dy-=CREW_HAND*hand*6.8
    elif art=="lookback":
        yaw=keys(t,[(0,-.62),(1.65,.62),(2.8,.71),(4.05,-.64),(6,-.84)])
        pitch=keys(t,[(0,.17),(1.2,-.12),(2.6,.25),(3.2,-.30),(4.5,.44),(6,.63)])
        smile=keys(t,[(0,0),(1.15,.15),(2.4,1),(3.22,.95),(4.05,.06)])
        cast[0].move(dx,dy,t,yaw,pitch,.44,0,smile,[.62,3.53])
    else:
        grip=keys(t,[(0,.15),(.48,1),(1.5,.90),(1.97,.35),(2.7,.77),(3.5,.60),(4.8,-.50),(7.3,-.76)])
        dx+=HELMET_LEFT*(grip*6);dy-=HELMET_LEFT*(grip*4.9)
        dx-=HELMET_RIGHT*(grip*5.6);dy-=HELMET_RIGHT*(grip*4.2)
        cast[0].move(dx,dy,t,-.13+.28*math.sin(t*.95),
                     keys(t,[(0,-.22),(.65,.80),(1.4,.42),(2.1,-.25),(3.1,.13),(5,-.40),(7,-.30)]),
                     .16,0,0,[.29,2.32,5.6])
    # Upsample the inverse skinning field, retaining full-resolution texture.
    xx=X-cv2.resize(dx,SIZE,interpolation=cv2.INTER_CUBIC)*S
    yy=Y-cv2.resize(dy,SIZE,interpolation=cv2.INTER_CUBIC)*S
    out=cv2.remap(image,xx,yy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT_101)
    if prop is not None:
        held,arms=prop
        lift=float(ease(3.30,5.94,t)); preload=float(ease(2.78,3.34,t)*(1-ease(3.34,3.9,t)))
        pivot=(235*S,283*S)
        affine=cv2.getRotationMatrix2D(pivot,-8*lift+2*preload,1-.105*lift)
        affine[0,2]+=(-54*lift+2*preload)*S
        affine[1,2]+=(-224*lift+4*preload)*S
        if lift > 0:
            for (sleeve,src_elbow,src_wrist),low_elbow,low_wrist,swing in zip(
                    arms,[(38,365),(416,355)],[(126,316),(355,314)],[(12,-74),(-23,-63)]):
                elbow=np.array(low_elbow)+lift*np.array(swing)
                wrist=(affine[:,:2]@(np.array(low_wrist)*S)+affine[:,2])/S
                def joints(a,b,thickness):
                    vec=b-a
                    n=np.array([-vec[1],vec[0]])/np.linalg.norm(vec)
                    return np.float32([a,b,(a+b)/2+n*thickness])*S
                matrix=cv2.getAffineTransform(joints(src_elbow,src_wrist,21),joints(elbow,wrist,20))
                limb=cv2.warpAffine(sleeve,matrix,SIZE)
                out=lerp_layers(out,limb[:,:,:3],limb[:,:,3].astype(np.float32)/255*float(ease(0,.20,lift)))
        carried=cv2.warpAffine(held,affine,SIZE,flags=cv2.INTER_LINEAR)
        out=lerp_layers(out,carried[:,:,:3],carried[:,:,3].astype(np.float32)/255)
    return out


SHOTS=[("briefing","command",11.8),("resolve","command",12),("witnesses","crew",13),
       ("helmet-lift","lookback",6),("seal-check","helmet",7.3)]


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--shot",choices=[s[0] for s in SHOTS])
    args=p.parse_args()
    OUT.mkdir(exist_ok=True)
    for shot,art,duration in SHOTS:
        if args.shot and shot!=args.shot: continue
        image=load(art)
        prop=None
        if art=="lookback": image,prop=helmet_parts(image,load("helmet"))
        target=OUT/(shot+".mp4")
        temp=target.with_suffix(".partial.mp4")
        encoder=subprocess.Popen([imageio_ffmpeg.get_ffmpeg_exe(),"-hide_banner","-loglevel","error","-y",
             "-f","rawvideo","-pix_fmt","rgb24","-s",f"{SIZE[0]}x{SIZE[1]}","-r",str(FPS),
             "-i","-","-an","-c:v","libx264","-preset","fast","-crf","18","-pix_fmt","yuv420p",
             "-threads","3","-g","24","-movflags","+faststart",str(temp)],stdin=subprocess.PIPE)
        try:
            for i in range(math.ceil(duration*FPS)):
                encoder.stdin.write(perform(art,shot,i/FPS,image,prop).tobytes())
        finally:
            encoder.stdin.close()
        if encoder.wait(): raise RuntimeError(f"Encoding {shot} failed")
        temp.replace(target)
        print(shot, math.ceil(duration*FPS), target.stat().st_size, flush=True)


if __name__=="__main__": main()
