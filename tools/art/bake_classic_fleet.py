"""Bake the original 3 fighter paintings onto sculpted, bankable relief hulls.

python tools/art/bake_classic_fleet.py --blender <Blender 4.5 executable> --work <temporary folder>
The artist's registration points are in the uncropped, original image coordinates.
Only the resulting hangar portraits, game atlases and anchor catalog are shipped.
"""
import argparse
import json
import math
from pathlib import Path
import subprocess
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/fighters/classic"
SCR = "assets/fighters/classic/"
BANKS = [-27, -13.5, 0, 13.5, 27]
FRAME = (672, 432)
HANGAR_FRAME = (2048, 1234)
LENS = 1.095
SHIPS = {
    "red": {
        "source": "assets/ships/crimson-sleek.webp", "crop": [69,122,1415,800],
        "nose": [1482,494.5], "engines": [[96,400],[94,580]],
        "reflections": [[[279,141],[393,178],[509,235],[642,307],[770,375]],
                        [[165,890],[284,840],[407,761],[542,664],[685,566]]],
        "canopy": [.418,.750,.347,.423,.077],
    },
    "blue": {
        "source": "assets/fighters/azure.webp", "crop": [42,76,892,496],
        "nose": [929.5,308.5], "engines": [[60,255],[61,364]],
        "reflections": [[[145,91],[200,104],[250,124],[313,163],[385,205],[440,224]],
                        [[116,547],[167,524],[225,489],[285,440],[345,399],[421,357]]],
        "canopy": [.406,.724,.35,.423,.076],
    },
    "yellow": {
        "source": "assets/fighters/auric.webp", "crop": [37,46,884,548],
        "nose": [915.5,311], "engines": [[58,259],[58,374]],
        "reflections": [[[106,62],[175,63],[246,91],[329,133],[418,176],[490,214]],
                        [[107,569],[167,568],[225,538],[285,501],[345,468],[414,422]]],
        "canopy": [.418,.781,.401,.461,.080],
    }
}


def bell(v):
    return np.exp(-v*v)


def ease(v):
    v=np.clip(v,0,1)
    return v*v*(3-2*v)


def elevation(ship, u, v):
    """Camber, engine nacelles and a raised canopy, in units of full ship length."""
    x0,y0,w,h=ship["crop"]
    center=(ship["nose"][1]-y0)/h-.012*(1-u)
    beam=.027+.143*(1-u)**.75
    spine=.065*np.maximum(0,1-((v-center)/beam)**2)**1.15*ease((1.022-u)/.26)
    # The wing's root and spar are crowned; its remote tip bends down. The
    # leading and trailing surfaces have different curvature.
    span=np.abs(v-center)
    chord=.5-.83*span
    foil=.009+.037*bell((u-chord)/.27)*bell(span/.51)-.013*ease(span/.55)
    eng=np.zeros_like(u)
    for ex,ey in ship["engines"]:
        sy=(ey-y0)/h
        axis=sy+(center-sy)*.22*ease((u-.13)/.23)
        radius=.107*(1-.28*ease(u/.31))
        taper=ease((.41-u)/.29)
        eng=np.maximum(eng,.075*np.maximum(0,1-((v-axis)/radius)**2)**1.18*taper)
    l,r,top,tip,half=ship["canopy"]
    t=np.clip((u-l)/(r-l),0,1)
    cy=top+(tip-top)*t
    canopy=np.maximum(0,1-((v-cy)/half)**2-(2*t-1)**2)**1.02*((u>=l)&(u<=r))
    return np.maximum(np.maximum(foil,spine),eng)+.071*canopy


def refit_finish(key,ship,master,glass,u,v):
    """Registered flush hatches, shoulder inlays and two titanium exhaust collars."""
    from PIL import Image, ImageDraw
    w,h=master.size
    rgba=np.asarray(master).astype(float)/255
    rgb=rgba[:,:,:3]
    # The canopy's aft half reflects the cool hangar roof. A soft copper
    # return along its lower half retains the pilot's near/far orientation.
    roof=bell((v-(.326+.146*(u-.45)))/.082)
    rgb[...,0]*=1-glass*.105;rgb[...,1]*=1+glass*.055
    rgb[...,2]+=glass*(.015+.072*roof)*(1-rgb[...,2])
    rgb[...,1]+=glass*.033*roof*(1-rgb[...,1])
    base=Image.fromarray(np.uint8(np.clip(rgba,0,1)*255+.5))
    scale=2
    layers=Image.new("RGBA",(w*scale,h*scale))
    brush=ImageDraw.Draw(layers)
    def points(path):
        return [(round(x*w*scale),round(y*h*scale)) for x,y in path]
    def stroke(path,fill,thickness):
        brush.line(points(path),fill=fill,width=max(1,round(thickness*w*scale)),joint="curve")
    def poly(path,fill): brush.polygon(points(path),fill=fill)
    # Subtle raised machining on the upper edge, black occlusion just beneath.
    # Nothing is allowed outside the source silhouette.
    def recess(path,base_tint=(17,19,25,180),line=.0019):
        stroke([(x,y+.0023) for x,y in path],(193,196,205,118),line*.68)
        stroke(path,base_tint,line)
    upper=[(.211,.110),(.26,.142),(.342,.229),(.319,.230),(.281,.208),(.235,.168)]
    lower=[(.190,.841),(.254,.777),(.336,.695),(.305,.696),(.243,.760),(.203,.811)]
    # Gold's original armor already has its service panels and intakes.
    if key!="yellow":
        for panel in [upper,lower]:
            poly(panel,(20,25,37,21));recess(panel+[panel[0]],line=.00155)
        for x,y,side in [(.279,.181,-1),(.254,.763,1)]:
            poly([(x-.021,y-.007*side),(x+.013,y+.021*side),(x+.021,y+.020*side),(x-.008,y-.008*side)],(24,29,39,195))
            for j in range(3):
                dx=j*.007
                stroke([(x-.009+dx,y+.002*side+dx*side),(x-.005+dx,y+.009*side+dx*side)],(153,165,176,143),.0015)
    # Shoulder rails butt into a panel break. Their swept section follows
    # the nacelle to the root of the canopy rather than outlining the wing.
    for path in [
        [(.128,.368),(.225,.349),(.306,.320),(.365,.305),(.405,.308)],
        [(.151,.552),(.227,.557),(.301,.546),(.365,.521),(.407,.507)],
    ]:
        recess(path,line=.0025)
        stroke([(x,y-.0025) for x,y in path],(199,209,218,105),.0015)
    # Ceramic thermal breaks and fasteners live on the actual cylindrical
    # exhaust assemblies. The face in front remains exposed for the live plume.
    left,top,_,_=ship["crop"]
    for ex,ey in ship["engines"]:
        axis=(ey-top)/h
        for dx,tone in ((.050,(11,16,25,185)),(.056,(164,165,158,128)),(.066,(33,35,40,176))):
            profile=[(dx-.009,axis-.072),(dx-.001,axis-.057),(dx+.005,axis-.026),
                     (dx+.006,axis+.011),(dx+.001,axis+.046),(dx-.008,axis+.067)]
            stroke(profile,tone,.0026)
    # A single recessed avionics insert in the shoulder, with one short
    # colored glass element, is still legible when scaled to game size.
    insert=[(.307,.411),(.353,.401),(.361,.404),(.344,.414),(.311,.422)]
    poly(insert,(16,20,28,210));recess(insert+[insert[0]],line=.0013)
    color={"red":(252,151,101,204),"blue":(105,220,255,216),"yellow":(255,208,110,206)}[key]
    stroke([(.320,.414),(.342,.407)],color,.00165)
    overlay=np.asarray(layers.resize((w,h),Image.Resampling.LANCZOS),dtype=float)/255
    mix=overlay[:,:,3:4]
    result=np.asarray(base).copy()
    result[:,:,:3]=(result[:,:,:3]*(1-mix)+255*overlay[:,:,:3]*mix).astype("uint8")
    return Image.fromarray(result)


def prepare(work):
    from PIL import Image
    for key,ship in SHIPS.items():
        x,y,w,h=ship["crop"]
        art=Image.open(ROOT/ship["source"]).convert("RGBA").crop((x,y,x+w,y+h))
        raw=np.array(art)
        # Remove original nearly invisible matte noise beyond the authored edge.
        raw[:,:,3]=np.rint(np.clip((raw[:,:,3].astype(float)-6)/249,0,1)*255).astype("uint8")
        master=Image.fromarray(raw)

        nx,ny=233,145
        v,u=np.indices((ny,nx),dtype=float);u/=nx-1;v/=ny-1
        alpha=np.asarray(master.getchannel("A").resize((nx,ny),Image.Resampling.BOX))/255
        z=elevation(ship,u,v)
        # Taper top and bottom into a shared perimeter. This gives the near
        # wing and the cockpit visible parallax, even against transparent space.
        edge=.14+.86*ease(alpha/.89)
        z*=edge
        np.savez(work/(key+".npz"),z=z,depth=-edge*(.008+.35*z),u=u,v=v,alpha=alpha)
        # The black canopy is a separate coating. The metal around it keeps a
        # wider, softer light response than the dark curved glass.
        rgb=raw[:,:,:3].astype(float)/255
        yy,xx=np.indices(raw.shape[:2],dtype=float);xx/=w;yy/=h
        l,r,top,tip,half=ship["canopy"]
        t=np.clip((xx-l)/(r-l),0,1);cy=top+(tip-top)*t
        oval=ease((1-((yy-cy)/(half*1.13))**2-(2*t-1)**2)/.28)*((xx>l)&(xx<r))
        chroma=(rgb.max(2)-rgb.min(2))/np.maximum(.025,rgb.max(2))
        glass=oval*(1-ease((chroma-.24)/.34))
        refit_finish(key,ship,master,glass,xx,yy).save(work/(key+"-paint.png"))
        Image.fromarray(np.uint8(glass*255)).save(work/(key+"-glass.png"))


def render(work, selection, samples, hangar_only):
    import bpy
    from mathutils import Vector
    from bpy_extras.object_utils import world_to_camera_view

    def surface(k, under):
        mat=bpy.data.materials.new(k+(" underside" if under else " clear coated paint"))
        mat.use_nodes=True
        nodes=mat.node_tree.nodes;links=mat.node_tree.links
        nodes.clear()
        def make(name): return nodes.new(name)
        def wire(source,target): links.new(source,target)
        tex=make("ShaderNodeTexImage");tex.image=bpy.data.images.load(str(work/(k+"-paint.png")),check_existing=True)
        tex.extension="CLIP"
        glass=make("ShaderNodeTexImage");glass.image=bpy.data.images.load(str(work/(k+"-glass.png")),check_existing=True)
        glass.image.colorspace_settings.name="Non-Color";glass.extension="CLIP"
        shaded=make("ShaderNodeBsdfPrincipled");wire(tex.outputs["Color"],shaded.inputs["Base Color"])
        shaded.inputs["Metallic"].default_value=.62 if not under else .78
        shaded.inputs["Coat Weight"].default_value=.34 if not under else .10
        shaded.inputs["Coat Roughness"].default_value=.19
        rough=make("ShaderNodeMapRange");rough.inputs["To Min"].default_value=.32;rough.inputs["To Max"].default_value=.12
        wire(glass.outputs["Color"],rough.inputs["Value"]);wire(rough.outputs["Result"],shaded.inputs["Roughness"])
        emission=make("ShaderNodeEmission");wire(tex.outputs["Color"],emission.inputs["Color"])
        emission.inputs["Strength"].default_value=.35 if under else .975
        mix=make("ShaderNodeMixShader");mix.inputs[0].default_value=.245 if not under else .48
        wire(emission.outputs[0],mix.inputs[1]);wire(shaded.outputs[0],mix.inputs[2])
        transparent=make("ShaderNodeBsdfTransparent");cutout=make("ShaderNodeMixShader")
        wire(tex.outputs["Alpha"],cutout.inputs[0]);wire(transparent.outputs[0],cutout.inputs[1]);wire(mix.outputs[0],cutout.inputs[2])
        wire(cutout.outputs[0],make("ShaderNodeOutputMaterial").inputs["Surface"])
        return mat

    for key in selection:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene=bpy.context.scene;scene.render.engine="CYCLES";scene.cycles.device="CPU"
        scene.cycles.samples=samples;scene.cycles.use_denoising=True
        scene.cycles.max_bounces=1;scene.cycles.transparent_max_bounces=6
        scene.render.film_transparent=True;scene.render.image_settings.color_mode="RGBA"
        scene.render.image_settings.file_format="PNG";scene.render.image_settings.compression=20
        scene.view_settings.view_transform="Standard"
        scene.world=bpy.data.worlds.new("Hangar fill");scene.world.use_nodes=True
        bg=scene.world.node_tree.nodes["Background"];bg.inputs[0].default_value=(.65,.76,.93,1);bg.inputs[1].default_value=.46
        ship=SHIPS[key];x0,y0,w,h=ship["crop"];aspect=h/w
        camera_data=bpy.data.cameras.new("Orthographic game camera");camera_data.type="ORTHO";camera_data.ortho_scale=LENS
        camera=bpy.data.objects.new("Camera",camera_data);scene.collection.objects.link(camera)
        camera.location=(0,0,3);scene.camera=camera
        def light(name,loc,energy,color,size,size_y):
            data=bpy.data.lights.new(name,"AREA");data.energy=energy;data.color=color;data.shape="RECTANGLE";data.size=size;data.size_y=size_y
            obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc
            obj.rotation_euler=(-Vector(loc)).to_track_quat("-Z","Y").to_euler()
        light("Overhead hangar door",(-.50,1.28,1.13),25,(.85,.93,1),1.45,.19)
        light("Curved canopy strip",(.20,.76,.89),8,(.9,.96,1),.78,.044)
        light("Warm deck bounce",(.24,-1.26,.72),13,(1,.70,.52),.95,.33)
        light("Blue aft rim",(-1.04,-.29,.52),15,(.56,.76,1),.56,.18)
        geo=np.load(work/(key+".npz"));u,v,z,d,alpha=[geo[k] for k in ("u","v","z","depth","alpha")]
        ny,nx=u.shape
        pivot=bpy.data.objects.new("Classic "+key,None);scene.collection.objects.link(pivot)
        for under,height in ((False,z),(True,d)):
            coords=np.stack([u-.5,(.5-v)*aspect,height],axis=-1).reshape(-1,3)
            faces=[]
            for j in range(ny-1):
                for i in range(nx-1):
                    if alpha[j:j+2,i:i+2].max()==0: continue
                    k=j*nx+i;face=(k,k+nx,k+nx+1,k+1)
                    faces.append(face[::-1] if under else face)
            mesh=bpy.data.meshes.new(key+" formed shell");mesh.from_pydata(coords.tolist(),[],faces);mesh.update()
            uv=mesh.uv_layers.new(name="Original painting")
            indices=np.empty(len(mesh.loops),dtype=np.int32)
            mesh.loops.foreach_get("vertex_index",indices)
            texture_uv=np.stack([u,1-v],axis=-1).reshape(-1,2)
            uv.data.foreach_set("uv",np.asarray(texture_uv[indices],dtype=np.float32).ravel())
            mesh.polygons.foreach_set("use_smooth",np.ones(len(mesh.polygons),dtype=bool))
            obj=bpy.data.objects.new(key+(" keel" if under else " flight surfaces"),mesh)
            scene.collection.objects.link(obj);obj.parent=pivot;obj.data.materials.append(surface(key,under))
        def project(point):
            u=(point[0]-x0)/w;v=(point[1]-y0)/h
            # Use the mesh node's exact relief at the anchor. All offsets go
            # through the same camera as the actual painterly emissive mouths.
            zz=float(z[min(ny-1,round(v*(ny-1))),min(nx-1,round(u*(nx-1)))])
            p=world_to_camera_view(scene,camera,pivot.matrix_world@Vector((u-.5,(.5-v)*aspect,zz)))
            return [round(p.x,7),round(1-p.y,7)]
        frames=[]
        for label,bank,size in ([("hangar",-11,HANGAR_FRAME)] if hangar_only else
              [(str(i),angle,FRAME) for i,angle in enumerate(BANKS)]+[("hangar",-11,HANGAR_FRAME)]):
            pivot.rotation_euler.x=math.radians(bank);bpy.context.view_layer.update()
            scene.render.resolution_x,scene.render.resolution_y=size;scene.render.resolution_percentage=100
            scene.render.filepath=str(work/f"{key}-{label}.png")
            bpy.ops.render.render(write_still=True)
            if label!="hangar":
                frames.append({"nose":project(ship["nose"]),"engines":[project(point) for point in ship["engines"]],
                               "reflections":[[project(point) for point in line] for line in ship["reflections"]]})
        if frames:(work/(key+"-camera.json")).write_text(json.dumps(frames),encoding="utf8")


def pack_portrait(work, key):
    from PIL import Image

    with Image.open(work / f"{key}-hangar.png") as source:
        portrait = source.convert("RGBA")
    left, top, right, bottom = portrait.getchannel("A").point(lambda a: 255 if a > 6 else 0).getbbox()
    box = (max(0, left - 10), max(0, top - 10), min(portrait.width, right + 10), min(portrait.height, bottom + 10))
    portrait.crop(box).save(OUT / f"{key}-hangar.webp", quality=96, alpha_quality=100, method=6, exact=True)


def pack(work):
    from PIL import Image
    OUT.mkdir(parents=True,exist_ok=True);catalog={}
    for key in SHIPS:
        pose=json.loads((work/(key+"-camera.json")).read_text())
        imgs=[Image.open(work/f"{key}-{i}.png").convert("RGBA") for i in range(len(BANKS))]
        sheet=Image.new("RGBA",(FRAME[0]*len(BANKS),FRAME[1]))
        widths=[];heights=[]
        for i,(im,coords) in enumerate(zip(imgs,pose)):
            bounds=im.getchannel("A").point(lambda a:255 if a>64 else 0).getbbox()
            if min(bounds[0],bounds[1],FRAME[0]-bounds[2],FRAME[1]-bounds[3])<3:raise ValueError((key,i,bounds))
            muzzle=np.array(coords["nose"])*FRAME
            widths.append(muzzle[0]-bounds[0]);heights.append(2*max(muzzle[1]-bounds[1],bounds[3]-muzzle[1]))
            sheet.paste(im,(i*FRAME[0],0))
        sheet.save(OUT/f"{key}-atlas.webp",quality=94,alpha_quality=100,method=6,exact=True)
        neutral=imgs[2];bounds=neutral.getchannel("A").point(lambda a:255 if a>12 else 0).getbbox()
        l,t,r,b=(bounds[0]-3,bounds[1]-3,bounds[2]+3,bounds[3]+3)
        body=neutral.crop((l,t,r,b));body.save(OUT/f"{key}-body.webp",quality=95,alpha_quality=100,method=6,exact=True)
        def absolute(point):return [round(point[0]*FRAME[0]-l,4),round(point[1]*FRAME[1]-t,4)]
        fallback={"src":SCR+key+"-body.webp","crop":[0,0,*body.size],"tip":absolute(pose[2]["nose"]),
                  "engines":[absolute(q) for q in pose[2]["engines"]],
                  "reflections":[{"side":side,"weight":.64,"points":[absolute(q) for q in points]}
                                 for side,points in zip((-1,1),pose[2]["reflections"])]}
        pack_portrait(work, key)
        catalog[key]={"width":FRAME[0],"height":FRAME[1],"bodyWidth":round(max(widths),3),"bodyHeight":round(max(heights),3),
                      "frames":pose,"src":SCR+key+"-atlas.webp","hangar":SCR+key+"-hangar.webp","fallback":fallback}
    (ROOT/"fighter-atlas-data.js").write_text('"use strict";\n\n// Generated by tools/art/bake_classic_fleet.py.\nconst fighterAtlasCatalog = '+json.dumps(catalog,indent=2)+';\n',encoding="utf8")


if __name__=="__main__":
    if "--" in sys.argv and "--blender-render" in sys.argv:
        args=sys.argv[sys.argv.index("--")+1:];render(Path(args[1]),args[2].split(","),int(args[3]),args[4]=="portraits")
    else:
        cli=argparse.ArgumentParser(description=__doc__);cli.add_argument("--blender",type=Path)
        cli.add_argument("--work",type=Path,required=True);cli.add_argument("--prepare",action="store_true")
        cli.add_argument("--pack",action="store_true");cli.add_argument("--ships",default="red,blue,yellow")
        cli.add_argument("--samples",type=int,default=28);cli.add_argument("--portraits",action="store_true")
        a=cli.parse_args();work=a.work.resolve();work.mkdir(parents=True,exist_ok=True)
        if not a.pack:prepare(work)
        if a.blender and not a.pack:
            subprocess.run([str(a.blender),"-b","-t","8","--python-exit-code","1","-P",str(Path(__file__).resolve()),"--",
                "--blender-render",str(work),a.ships,str(a.samples),"portraits" if a.portraits else "all"],check=True)
        if a.portraits and a.blender:
            OUT.mkdir(parents=True, exist_ok=True)
            for key in a.ships.split(","):
                pack_portrait(work, key)
        elif a.pack or (a.blender and set(a.ships.split(",")) == set(SHIPS)):
            pack(work)
