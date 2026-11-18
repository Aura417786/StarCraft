"""Track photographed features in the delivery encodes at a fixed camera position.

Run with the same OpenCV authoring environment as bake_opening_performance.py.
Background drift detects a re-exported pan/zoom, while the helmet/upper body
separation checks that the prop leaves the torso by a significant distance.
"""
from pathlib import Path
import json
import sys
import cv2
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
CLIPS={
    "briefing":((143,36,260,158),(489,18,627,117),2.7),
    "resolve":((143,36,260,158),(489,18,627,117),2.7),
    "witnesses":((296,84,351,153),(539,11,628,96),1.0),
    "helmet-lift":((198,228,322,309),(488,15,627,78),130.),
    "seal-check":((95,107,298,215),(488,15,627,78),1.5),
}

def track(path,rois):
    movie=cv2.VideoCapture(str(path))
    count=0
    travel=[[],[]]
    prev=None
    while True:
        ok,rgb=movie.read()
        if not ok: break
        gray=cv2.cvtColor(cv2.resize(rgb,(640,360),interpolation=cv2.INTER_AREA),cv2.COLOR_BGR2GRAY)
        if prev is None:
            groups=[]
            for box in rois:
                x,y,r,b=box
                m=np.zeros(gray.shape,np.uint8);m[y:b,x:r]=255
                p=cv2.goodFeaturesToTrack(gray,55,.016,3,mask=m)
                groups.append(len(p))
                if len(groups)==1: points=p
                else: points=np.concatenate([points,p])
            starts=points.copy();alive=np.ones(len(points),bool)
        else:
            nxt,status,_=cv2.calcOpticalFlowPyrLK(prev,gray,points,None,winSize=(19,19),maxLevel=3)
            alive &= status[:,0].astype(bool)
            displacement=np.linalg.norm(nxt[:,0,:]-starts[:,0,:],axis=1)
            for j,sl in enumerate((slice(None,groups[0]),slice(groups[0],None))):
                good=displacement[sl][alive[sl]]
                if len(good)>5:travel[j].append(float(np.median(good)))
            points=nxt
        count+=1;prev=gray
    movie.release()
    return count,[round(max(v),3) for v in travel]

def main():
    rows=[]
    cv2.setNumThreads(2)
    for name,(actor,background,minimum) in CLIPS.items():
        frames,(motion,drift)=track(ROOT/"assets/intro/performances"/(name+".mp4"),[actor,background])
        record={"clip":name,"decodedFrames":frames,"actorMedianPeakPx":motion,"backgroundMedianPeakPx":drift,
                "actorRegion":actor,"backgroundRegion":background,"minimumActorPx":minimum}
        rows.append(record)
        print(name,frames,motion,drift,flush=True)
        assert frames>=140 and motion>minimum and drift<1.0,record
    dest=Path(sys.argv[1]);dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps({"method":"Sparse optical tracking on decoded 640x360 frames. Each peak is the largest median displacement of still-tracked landmarks in the designated region since frame zero. No opening camera transform is applied to these performance materials.","clips":rows},indent=2),encoding="utf8")

if __name__=="__main__":main()
