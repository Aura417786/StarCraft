"""Pack original Blender renders; verify alpha margins and animation diversity."""
from pathlib import Path
from PIL import Image, ImageChops, ImageStat, ImageDraw
import json,hashlib,argparse
p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('output');opt=p.parse_args()
src=Path(opt.source);dst=Path(opt.output);dst.mkdir(parents=True,exist_ok=True)
manifest={'version':1,'license':'Original artwork for Star Breaker; generated with project authoring scripts.','layout':{'columns':4,'rows':4,'frames':16,'fps':12},'assets':[]}
sheet=Image.new('RGB',(1152,1152),(6,13,22));draw=ImageDraw.Draw(sheet)
for row,kind in enumerate(['water','magma','void']):
    paths=sorted((src/kind).glob('*.png'));assert len(paths)==16,(kind,len(paths))
    frames=[Image.open(path).convert('RGBA') for path in paths];size=frames[0].width;assert all(im.size==(size,size) for im in frames)
    margins=[];diffs=[]
    for i,im in enumerate(frames):
        alpha=im.getchannel('A');box=alpha.point(lambda v:255 if v>16 else 0).getbbox();assert box,(kind,i,'empty')
        margin=min(box[0],box[1],size-box[2],size-box[3]);margins.append(margin);assert margin>=4,(kind,i,'clipped',box)
        if i:diffs.append(sum(ImageStat.Stat(ImageChops.difference(im,frames[i-1])).mean)/4)
    assert min(diffs)>.05,(kind,'duplicate animation')
    atlas=Image.new('RGBA',(size*4,size*4))
    for i,im in enumerate(frames):atlas.paste(im,((i%4)*size,(i//4)*size))
    target=dst/f'{kind}-atlas.webp';atlas.save(target,'WEBP',quality=90,method=6,exact=True)
    manifest['assets'].append({'element':kind,'file':target.name,'tile':size,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'minimumAlphaMargin':min(margins),'frameDifferenceRange':[min(diffs),max(diffs)]})
    for col,i in enumerate([0,5,10]):
        thumb=frames[i].resize((384,384));sheet.paste(thumb,(col*384,row*384),thumb);draw.text((col*384+14,row*384+14),f'{kind} / {i:02}',fill=(200,218,228))
sheet.save(src/'contact-sheet.jpg',quality=94)
(dst/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8');print(json.dumps(manifest,indent=2))
