"""Blender 4.5: --background --factory-startup -P this.py -- <output-directory>.

Render independent orthographic meshes on film transparency. Twelve discrete
views make each cyclic rotation loop with no repeated terminal frame. The PNG
frames are input to pack_fighter_emitters.py and can be regenerated offline.
"""
from pathlib import Path
from math import sin, cos, tau
import sys
import bpy
from mathutils import Vector

out = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
out.mkdir(exist_ok=True, parents=True)
scene = bpy.context.scene
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
scene.render.engine = "CYCLES"
scene.cycles.samples = 7
scene.cycles.max_bounces = 2
scene.cycles.use_denoising = True
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for device in prefs.devices:
        device.use = device.type == "OPTIX"
    if any(device.use for device in prefs.devices):
        scene.cycles.device = "GPU"
except (RuntimeError, TypeError):
    pass
scene.render.resolution_x = scene.render.resolution_y = 224
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.world.color = (.09, .08, .10)
scene.view_settings.view_transform = "AgX"
bpy.ops.object.camera_add(location=(0, -8, .02))
cam = bpy.context.object
cam.rotation_euler = (-cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.type = "ORTHO"
cam.data.ortho_scale = 3.14
scene.camera = cam
for pos, tint, power in [((-3,-4,4), (1,.87,.72), 570), ((2,2,1), (.49,.74,1), 850)]:
    bpy.ops.object.light_add(type="AREA", location=pos)
    light = bpy.context.object
    light.rotation_euler = (-light.location).to_track_quat("-Z", "Y").to_euler()
    light.data.color = tint
    light.data.size = 3
    light.data.energy = power

def material(name, color, emission, metal):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value = (*color, 1)
    bs.inputs["Metallic"].default_value = metal
    bs.inputs["Roughness"].default_value = .29
    bs.inputs["Emission Color"].default_value = (*color, 1)
    bs.inputs["Emission Strength"].default_value = emission
    return mat

def curve(parent, name, points, width, mat):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.bevel_depth = width
    data.bevel_resolution = 2
    strip = data.splines.new('POLY')
    strip.points.add(len(points)-1)
    for node, point in zip(strip.points, points):
        node.co = (*point, 1)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(mat)

def group(name):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    return obj

def crimson(root):
    copper = material("Ceramic copper", (.27,.026,.007), .43, .72)
    hot = material("Exposed molten channel", (1,.107,.009), 3.1, .14)
    for ring, radius in enumerate((.83, 1.16, .66)):
        for quadrant in range(4):
            axis = (ring-1)*.42
            for offset, thickness, mat in [(0,.091,copper), (.083,.021,hot)]:
                points = []
                for i in range(24):
                    a = (quadrant + .08 + .80*i/23 + ring*.11)*tau/4
                    points.append((axis + .24*cos(a), radius*sin(a), (radius+offset)*cos(a)))
                curve(root, "Induction jaw", points, thickness, mat)

def azure(root):
    cobalt = material("Indigo corona", (.025,.13,.72), 1.5, .38)
    tip = material("Ion avalanche", (.18,.83,1), 3.9, .08)
    for arm in range(5):
        phase = tau*arm/5
        points = []
        for i in range(17):
            t = i/16
            a = phase + 1.38*t + .12*sin(i*3.4 + arm)
            r = .07 + .93*sin(t*2.47)
            points.append((1.1-2.24*t, r*cos(a), r*sin(a)))
        curve(root, "Electric streamer", points, .029, cobalt)
        curve(root, "Current channel", points[3:14], .013, tip)
        for k in (5,10):
            x,y,z = points[k]
            curve(root,"Fork",[(x,y,z),(x-.16,y*1.16,z*1.12),(x-.10,y*1.35,z*1.34)],.013,tip)

def auric(root):
    bronze = material("Dark gold electrode", (.45,.157,.014), .31, .68)
    rim = material("Amber optical seam", (1,.54,.10), 2.0, .39)
    for row, latitude in enumerate((-.94,-.66,-.36,-.06,.24,.54,.84)):
        count = 12
        for col in range(count):
            points = []
            for dx, dy in [(-.24,-.46),(.24,-.46),(.49,0),(.24,.46),(-.24,.46),(-.49,0),(-.24,-.46)]:
                a = (col + .5*(row%2) + dx)*tau/count
                b = latitude + dy*.28
                points.append((1.24*cos(b)*cos(a),1.24*cos(b)*sin(a),1.24*sin(b)))
            curve(root, "Faceted shell electrode", points, .021, bronze)
            curve(root, "Illuminated facet edge", points[1:4], .015, rim)

for name, build, axis in [("crimson",crimson,0),("azure",azure,0),("auric",auric,2)]:
    root = group(name)
    build(root)
    for frame in range(12):
        # Repeating symmetry allows continuous movement at modest frame rates.
        root.rotation_euler[axis] = tau*frame/(12*{"crimson":4,"azure":5,"auric":12}[name])
        if name == "crimson":
            root.rotation_euler.y = -.12
            root.rotation_euler.z = -.25
        scene.render.filepath = str(out / f"{name}-{frame:02}.png")
        bpy.ops.render.render(write_still=True)
    for obj in list(root.children):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.objects.remove(root, do_unlink=True)
