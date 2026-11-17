"""Original v35 elemental motion plates, authored/rendered in Blender.

Run Blender --background --factory-startup --python-exit-code 1 -P this.py
  -- --out <D-drive-work> --size 384 --frames 16
Each element owns its own geometry/material/motion. No external artwork is used.
"""
import bpy, math, random, argparse, sys, json
from pathlib import Path
from mathutils import Vector, noise

args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--size',type=int,default=384);p.add_argument('--frames',type=int,default=16);p.add_argument('--only',default='water,magma,void')
opt=p.parse_args(args);out=Path(opt.out);out.mkdir(parents=True,exist_ok=True)
random.seed(352025)

def mat(name,color,metal=0,rough=.35,emission=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    n=m.node_tree.nodes;bs=n.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    if emission:bs.inputs['Emission Color'].default_value=(*color,1);bs.inputs['Emission Strength'].default_value=emission
    return m

def texture(m,scale,colors,strength=.2):
    n=m.node_tree.nodes;l=m.node_tree.links;bs=n.get('Principled BSDF')
    tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=scale;tex.inputs['Detail'].default_value=5;tex.inputs['Roughness'].default_value=.72
    ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements.remove(ramp.color_ramp.elements[1])
    for i,(pos,col) in enumerate(colors):
        el=ramp.color_ramp.elements[0] if i==0 else ramp.color_ramp.elements.new(pos);el.position=pos;el.color=(*col,1)
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=strength;bump.inputs['Distance'].default_value=.11
    l.new(tex.outputs['Fac'],ramp.inputs['Fac']);l.new(ramp.outputs['Color'],bs.inputs['Base Color']);l.new(tex.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],bs.inputs['Normal'])
    return tex,ramp

def mesh(name,verts,faces,material):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.data.materials.append(material)
    for face in me.polygons:face.use_smooth=True
    return o

def ribbon(name,pts,width,material):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=width;cu.bevel_resolution=2
    s=cu.splines.new('POLY');s.points.add(len(pts)-1)
    for p,xyz in zip(s.points,pts):p.co=(*xyz,1)
    o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);o.data.materials.append(material);return o

def orb(name,pos,scale,material,detail=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=detail,radius=1,location=pos)
    o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(material)
    for f in o.data.polygons:f.use_smooth=True
    return o

def setup(kind):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.cycles.max_bounces=4;scene.cycles.transparent_max_bounces=4
    try:
        pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='OPTIX';pref.get_devices()
        for dev in pref.devices:dev.use=dev.type!='CPU'
        if any(dev.use for dev in pref.devices):scene.cycles.device='GPU'
    except Exception:pass
    scene.render.resolution_x=scene.render.resolution_y=opt.size;scene.render.resolution_percentage=100;scene.render.film_transparent=True
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.image_settings.color_depth='8'
    scene.world.color=(.08,.10,.14);scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
    bpy.ops.object.camera_add(location=(5.0,-8.5,4.2) if kind=='water' else (4,-8,6));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=7.4 if kind=='water' else 6.8;scene.camera=cam
    for name,pos,color,power,size in [('key',(-4,-4,6),(.58,.78,1),950,5),('rim',(1,4,3),(.3,.65,1),1250,3),('fill',(4,-1,0),(.8,.92,1),400,4)]:
        if kind=='magma':color=(1,.3,.055) if name=='rim' else (.6,.67,.8)
        if kind=='void':color=(.57,.18,1) if name=='rim' else (.3,.55,1)
        bpy.ops.object.light_add(type='AREA',location=pos);lamp=bpy.context.object;lamp.name=name;lamp.data.color=color;lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size;lamp.rotation_euler=(-lamp.location).to_track_quat('-Z','Y').to_euler()
    return scene

def water():
    m=mat('Deep pressure water',(.014,.19,.24),.28,.16);texture(m,6,[(.22,(.004,.025,.047)),(.5,(.015,.21,.27)),(.78,(.16,.51,.57))],.32)
    foam=mat('Salt foam',(.73,.91,.91),0,.56)
    spray=mat('Mist droplets',(.24,.66,.73),.12,.2)
    nu,nv=68,100;faces=[]
    def points(t):
        v=[]
        for j in range(nv+1):
            y=-2.45+4.9*j/nv
            for i in range(nu+1):
                s=i/nu;a=-math.pi/2+s*math.pi*1.36
                pulse=math.sin(y*3.1+t)*.055+math.sin(y*7.4-t*2)*.025
                x=.3+1.5*math.cos(a)+pulse;z=1.26*math.sin(a)+pulse*math.sin(a)*2
                z+=.06*math.sin(y*12+s*31+t*2)*s
                v.append((x,y,z))
        return v
    for j in range(nv):
        for i in range(nu):
            a=j*(nu+1)+i;faces.append((a,a+1,a+nu+2,a+nu+1))
    o=mesh('Curling wave volume',points(0),faces,m);solid=o.modifiers.new('Water thickness','SOLIDIFY');solid.thickness=.055
    foam_curves=[]
    for i in range(40):
        y=-2.35+4.7*i/39;s=.64+random.random()*.35;a=-math.pi/2+s*math.pi*1.36
        pts=[(.3+1.52*math.cos(a+k*.012),y+k*.025,1.28*math.sin(a+k*.012)+.015*math.sin(k*.8+i)) for k in range(15)]
        foam_curves.append((ribbon('Foam crest filaments',pts,.014+random.random()*.023,foam),y,s))
    droplets=[]
    for i in range(150):
        y=random.uniform(-2.5,2.5);seed=random.random();r=random.uniform(.009,.035)
        droplets.append((orb('Aerated spray',(-.65,y,1.1),(r,r,r*1.9),foam if i%3 else spray),y,seed))
    def animate(t):
        for v,co in zip(o.data.vertices,points(t)):v.co=co
        for obj,y,s in foam_curves:obj.location.x=.035*math.sin(t+y*4);obj.location.z=.04*math.sin(t*2+y*3)
        for obj,y,seed in droplets:
            u=(seed+t/(2*math.pi))%1;obj.location=(-.4-u*.95,y+math.sin(seed*30+t)*.09,1.1+math.sin(u*math.pi)*.55-u*.8)
            obj.scale*=1 # constant-size physical droplets
    return animate

def magma():
    rock=mat('Basalt shell',(.025,.021,.026),.13,.7);texture(rock,8,[(.15,(.008,.009,.013)),(.53,(.07,.045,.035)),(.85,(.22,.12,.07))],.85)
    molten=mat('Molten interior',(.9,.035,.002),.05,.4,.7);texture(molten,6,[(.1,(.12,.006,.001)),(.54,(.9,.04,.002)),(.8,(1,.44,.015))],.2)
    shell=mat('Fissured volcanic crust',(.065,.022,.011),.12,.64)
    nodes=shell.node_tree.nodes;links=shell.node_tree.links;bs=nodes.get('Principled BSDF')
    vor=nodes.new('ShaderNodeTexVoronoi');vor.feature='DISTANCE_TO_EDGE';vor.inputs['Scale'].default_value=5.6
    crack=nodes.new('ShaderNodeValToRGB');crack.color_ramp.elements[0].position=.012;crack.color_ramp.elements[0].color=(1,.38,.008,1);crack.color_ramp.elements[1].position=.075;crack.color_ramp.elements[1].color=(.013,.009,.007,1)
    mid=crack.color_ramp.elements.new(.034);mid.color=(.42,.025,.001,1)
    links.new(vor.outputs['Distance'],crack.inputs['Fac']);links.new(crack.outputs['Color'],bs.inputs['Base Color']);links.new(crack.outputs['Color'],bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=1.8
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.7;bump.inputs['Distance'].default_value=.17;links.new(vor.outputs['Distance'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bs.inputs['Normal'])
    plume=[]
    for i in range(9):
        a=i*2.39996;r=.2+random.random()*.85
        o=orb('Obsidian spire',(math.cos(a)*r,math.sin(a)*r,-.35),(random.uniform(.28,.48),random.uniform(.2,.38),random.uniform(.65,1.35)),rock,2)
        o.rotation_euler=(random.uniform(-.35,.35),random.uniform(-.35,.35),a)
        plume.append((o,o.location.copy(),o.scale.copy(),i))
    ribbons=[]
    for i in range(4):
        o=orb('Erupting molten crust',((i-1.5)*.42,.05*math.sin(i),-.35+i*.33),(.65,.63,.85),shell,4)
        for v in o.data.vertices:v.co*=1+.18*noise.noise_vector(v.co*4+Vector((i*7,2,3))).x
        ribbons.append(o)
    chunks=[]
    for i in range(85):
        a=random.random()*math.tau;seed=random.random();r=random.uniform(.025,.095)
        chunks.append((orb('Ballistic basalt', (0,0,0),(r,r*.8,r*1.3),rock if i%4 else shell,1),a,seed))
    def animate(t):
        for o,pos,scale,i in plume:o.location=pos+Vector((0,0,.10*math.sin(t*1.5+i)));o.scale=scale*(1+.025*math.sin(t*2+i))
        for i,o in enumerate(ribbons):o.rotation_euler.z=.10*math.sin(t+i);o.rotation_euler.y=.09*math.sin(t*2+i)
        for o,a,seed in chunks:
            u=(seed+t/math.tau)%1;r=.5+u*1.6;o.location=(math.cos(a)*r,math.sin(a)*r,-.8+3.8*u-2.9*u*u);o.rotation_euler=(a+t*2,t,a)
    return animate

def void():
    dark=mat('Event horizon',(.0001,.0001,.0003),0,1)
    bs=dark.node_tree.nodes.get('Principled BSDF');bs.inputs['Specular IOR Level'].default_value=0
    blue=mat('Ionized blue rim',(.016,.08,.42),.15,.55,.65)
    violet=mat('Accretion violet',(.12,.008,.32),.1,.55,.65)
    silver=mat('Lensed dust',(.16,.25,.65),.15,.5,.7)
    disk=mat('Dense differential accretion',(.045,.003,.11),.15,.55)
    tex,ramp=texture(disk,5,[(.12,(.002,.001,.012)),(.48,(.025,.004,.12)),(.68,(.16,.016,.39)),(.86,(.15,.15,.5))],.16)
    bs=disk.node_tree.nodes.get('Principled BSDF');disk.node_tree.links.new(ramp.outputs['Color'],bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=.55
    verts=[];faces=[];nu=144;nv=28
    for j in range(nv+1):
        radius=.72+j/nv*1.4
        for i in range(nu+1):
            a=i/nu*math.tau;r=radius+.018*math.sin(a*11+j*.7);verts.append((math.cos(a)*r,math.sin(a)*r,.012*math.sin(a*5+j*.85)))
    for j in range(nv):
        for i in range(nu):
            a=j*(nu+1)+i;faces.append((a,a+1,a+nu+2,a+nu+1))
    diskobj=mesh('Continuous warped accretion disk',verts,faces,disk)
    orb('Opaque event horizon',(0,0,0),(.67,.67,.67),dark,4)
    curves=[]
    for i in range(14):
        a=i*2.39996;radius=.76+(i%12)*.10
        pts=[]
        for k in range(65):
            th=a+k*.052;r=radius+k*.0015;pts.append((math.cos(th)*r,math.sin(th)*r,.04*math.sin(th*4+i)+.035*(i%7)))
        o=ribbon('Accretion differential stream',pts,.004+(i%4)*.003,blue if i%4==0 else violet if i%3 else silver);curves.append((o,i))
    # Lensing halo above/below disk rather than a filled glowing ball.
    for i in range(2):
        pts=[(.85*math.cos(k*math.tau/100),.22*math.sin(k*math.tau/100),.85*math.sin(k*math.tau/100)) for k in range(101)]
        o=ribbon('Gravitational lens ring',pts,.006+i*.003,blue);o.rotation_euler.z=i*.06;curves.append((o,i))
    dust=[]
    for i in range(230):
        a=random.random()*math.tau;r=random.uniform(.8,2.1);size=random.uniform(.005,.02)
        dust.append((orb('Orbiting stellar dust',(0,0,0),(size,size,size),silver if i%5==0 else violet),a,r,i))
    def animate(t):
        diskobj.rotation_euler.z=t*.23
        for o,i in curves:o.rotation_euler.z=t*(.26+(i%9)*.018)
        for o,a,r,i in dust:
            th=a+t*(.6/r);o.location=(math.cos(th)*r,math.sin(th)*r,.08*math.sin(th*2+i));o.scale.z=1 # original sphere z-scale set below
            o.scale.z=o.scale.x
    return animate

manifest={'authoring':'Blender original geometry, shaders and procedural per-frame transforms','blender':bpy.app.version_string,'frames':opt.frames,'tile':opt.size,'assets':[]}
for kind in opt.only.split(','):
    scene=setup(kind);animate={'water':water,'magma':magma,'void':void}[kind]();folder=out/kind;folder.mkdir(exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/(kind+'.blend')))
    for f in range(opt.frames):
        animate(f*math.tau/opt.frames);scene.render.filepath=str(folder/f'{f:02d}.png');bpy.ops.render.render(write_still=True)
    manifest['assets'].append({'element':kind,'frames':opt.frames,'triangles':sum(len(o.data.polygons)*2 for o in scene.objects if o.type=='MESH'),'source':kind+'.blend'})
(out/'authoring-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8');print('NEXTGEN_RENDER_COMPLETE '+json.dumps(manifest))
