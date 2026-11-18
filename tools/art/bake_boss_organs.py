"""Blender 4.5 production bake. Four columns of 192 px orthographic organ reliefs.
blender -b -P tools/art/bake_boss_organs.py -- /absolute/path/to/boss-organs.png
"""
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

TAU = math.tau
scene = bpy.context.scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
origin = Vector((0, 0, 0))
surfaces = {}


def material(color):
    if color not in surfaces:
        mat = bpy.data.materials.new("tissue-" + color)
        rgb = [int(color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        mat.diffuse_color = tuple(channel ** 2.2 for channel in rgb) + (1,)
        mat.metallic = .28
        mat.roughness = .27
        surfaces[color] = mat
    return surfaces[color]


def bulb(pt, scale, color, tilt=0, facets=False):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2 if facets else 3, radius=1, location=origin + Vector(pt))
    obj = bpy.context.object
    obj.scale = scale
    obj.rotation_euler.z = tilt
    obj.data.materials.append(material(color))
    for poly in obj.data.polygons:
        poly.use_smooth = not facets


def tube(points, radii, color, sides=8, smooth=True):
    pts = [Vector(p) for p in points]
    verts, faces = [], []
    for i, pt in enumerate(pts):
        tangent = (pts[min(len(pts) - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
        lateral = tangent.cross(Vector((0, 0, 1))).normalized()
        normal = tangent.cross(lateral).normalized()
        for j in range(sides):
            a = j * TAU / sides
            verts.append(origin + pt + radii[i] * (math.cos(a) * lateral + math.sin(a) * normal))
            if i:
                k = i * sides + j
                following = i * sides + (j + 1) % sides
                faces.append((k - sides, following - sides, following, k))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple(range(len(verts) - sides, len(verts))))
    mesh = bpy.data.meshes.new("organic-ribbon")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("organic-ribbon", mesh)
    scene.collection.objects.link(obj)
    mesh.materials.append(material(color))
    for poly in mesh.polygons:
        poly.use_smooth = smooth


def polar(a, radius, z=0):
    return (radius * math.cos(a), radius * math.sin(a), z)


for species in range(11):
    origin = Vector(((species % 4 - 1.5) * 3, (1 - species // 4) * 3, 0))
    if species == 0:
        # Three rolled crest lips fold around a visible low-pressure eye.
        for j in range(3):
            pts, widths = [], []
            for i in range(36):
                t = i / 35
                a = j * TAU / 3 + t * 3.7
                pts.append(polar(a, .21 + .86 * t, .13 + .28 * math.sin(math.pi * t)))
                widths.append(.025 + .12 * math.sin(math.pi * t) ** .7)
            tube(pts, widths, ["55c4c7", "297f9b", "aee9dd"][j])
    elif species == 1:
        for side in (-1, 1):
            for j in range(4):
                y = -.64 + j * .38
                tube([(side*.1,y,-.08),(side*.54,y+.07,.05),(side*(.94-j*.06),y+.31,.18),(side*.53,y+.49,.3)],
                     [.13,.15,.09,.008], ["d1b58a","efdbaf"][j%2],7,False)
        bulb((0,0,.05),(.23,.95,.18),"997452")
    elif species == 2:
        bulb((0,0,0),(.67,.67,.35),"ff9e34",facets=True)
        for j in range(8):
            a = j * TAU/8
            bulb(polar(a,.59,.19),(.49,.24,.28+(j%3)*.06),["41303a","6c4340","855044"][j%3],a+.45,True)
        for j in range(3):
            bulb(polar(j*2.05,.28,.39),(.24,.13,.16),"ffba4e",j,True)
    elif species == 3:
        for j in range(6):
            a=j*TAU/6
            tube([polar(a,.14,0),polar(a+.2,.5,.24),polar(a+.35,1.1,0)],[.12,.07,.006],"a17aaf")
            for r in (.43,.66,.9):
                tube([polar(a+.22,r,.17),polar(a+.61,r*.79,.02),polar(a+1.25,r,.17)],[.021,.014,.021],"d5bedd")
        bulb((0,0,.28),(.26,.53,.3),"8c4a72",tilt=.43)
    elif species == 4:
        for sign in (-1,1):
            tube([(sign*.12,-.62,0),(sign*.51,-.62,.11),(sign*.78,-.22,.26),(sign*.78,.43,.3),(sign*.34,.92,.21)],
                 [.16,.29,.26,.155,.007],"629581",8,False)
            tube([(sign*.66,-.22,.28),(sign*.30,.10,.34),(sign*.38,.40,.25)],[.16,.095,.006],"b8c69c",7,False)
        bulb((0,-.67,.15),(.32,.26,.20),"3d6862",facets=True)
    elif species == 5:
        for j in range(5):
            a=j*TAU/5+.12
            tube([polar(a,.1,.05),polar(a+.10,.61,.26),polar(a,1.1,.12)],[.03,.23,.004],["89b1da","a9dbef","8582c9"][j%3],4,False)
        bulb((0,0,.3),(.29,.31,.23),"dbd5fd",facets=True)
    elif species == 6:
        for j in range(8):
            t=j/7
            x=(t-.5)*1.85
            y=math.sin(t*5.5)*.44
            bulb((x,y,.10),(.22,.18,.15),"508ba0",t,True)
            tube([(x,y,.14),(x-.065,y+.29,.22),(x-.10,y+.42,.15)],[.075,.044,.005],"a3e7dd",6,False)
    elif species == 7:
        for j in range(7):
            a=j*TAU/7
            r=.51+.10*(j%2)
            tube([polar(a,.14,-.02),polar(a+.15,r*.7,.14),polar(a,r,.25)],[.065,.045,.028],"95aa75")
            bulb(polar(a,r,.22),(.30,.26,.25),["a2bf68","d2c781","748f69"][j%3],a)
            bulb(polar(a,r+.05,.42),(.086,.073,.054),"e4d690")
        bulb((0,0,.22),(.31,.34,.29),"aac56d")
    elif species == 8:
        for j in range(3):
            points=[]; widths=[]
            for i in range(55):
                a=i/54*TAU
                r=.7+.09*math.sin(a*3+j)
                points.append((math.cos(a)*r*(1+.14*j),math.sin(a)*r*(1-.18*j)+math.cos(a)*(.20*j-.18),.21+j*.09+.065*math.sin(a*2)))
                widths.append(.052+.035*(1+math.cos(a-.6))/2)
            tube(points,widths,["685489","c395b6","8698cf"][j],8)
        bulb((0,0,.12),(.48,.48,.24),"221f36")
    elif species == 9:
        for j in range(7):
            a=j*TAU/7
            pts=[polar(a,.1,.1),polar(a+.23,.41,.17),polar(a+.05,.69,.08),polar(a+.35,1.04,.17)]
            tube(pts,[.075,.053,.036,.015],"c68a96")
            tube([pts[2],polar(a-.19,.83,.12),polar(a-.24,.97,.21)],[.04,.025,.009],"9f6b91")
            bulb(pts[1],(.098,.096,.09),"e5a6a9")
        bulb((0,0,.17),(.31,.26,.20),"b96886")
    else:
        for j in range(3):
            a=j*TAU/3
            for k in range(3):
                pts=[polar(a,.14,.02),polar(a+.06*k,.58,.16),polar(a+.20+.12*k,.93,.25),polar(a+.54+.12*k,.95,.35)]
                tube(pts,[.13,.16-.03*k,.085,.012],["657481","ae7e88","d7a584"][k],7)
        bulb((0,0,.31),(.36,.35,.26),"efc29c",facets=True)

bpy.ops.object.camera_add(location=(0,0,12))
camera = bpy.context.object
camera.rotation_euler=(0,0,0)
camera.data.type='ORTHO'
camera.data.ortho_scale=12
scene.camera=camera
scene.render.engine='BLENDER_WORKBENCH'
display=scene.display.shading
display.light='STUDIO'
display.color_type='MATERIAL'
display.show_shadows=True
display.show_cavity=True
display.cavity_type='WORLD'
display.cavity_ridge_factor=1.4
display.cavity_valley_factor=1.25
display.show_specular_highlight=True
scene.render.film_transparent=True
scene.display.render_aa='16'
scene.view_settings.view_transform='Standard'
scene.render.resolution_x=768
scene.render.resolution_y=576
scene.render.resolution_percentage=100
scene.render.image_settings.color_mode='RGBA'
scene.render.filepath=str(Path(sys.argv[sys.argv.index('--')+1]).resolve())
bpy.ops.render.render(write_still=True)
