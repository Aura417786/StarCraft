"""Build the alien lineup with Blender's mesh, animation, lighting and glTF exporters.

blender -b -t 8 --python-exit-code 1 --python build_boss_models.py -- [--only 1 12] [--review-dir PATH]
"""

import argparse
from math import cos, pi, sin
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
from boss_sculpt import Sculpt, TAU
from boss_finale_sculpt import FINALES


PALETTES = [
    ((.017, .027, .063), (.18, .32, .45), (.98, .10, .42)),
    ((.044, .035, .078), (.58, .51, .63), (.50, .23, 1)),
    ((.038, .018, .014), (.26, .080, .043), (1, .21, .025)),
    ((.022, .019, .069), (.40, .25, .55), (.72, .18, 1)),
    ((.012, .043, .034), (.25, .39, .23), (.45, 1, .28)),
    ((.025, .047, .088), (.32, .59, .73), (.25, .71, 1)),
    ((.016, .032, .082), (.13, .27, .44), (.1, .49, 1)),
    ((.017, .039, .030), (.28, .47, .18), (.69, 1, .22)),
    ((.043, .016, .022), (.39, .16, .13), (1, .31, .15)),
    ((.039, .021, .051), (.44, .23, .44), (1, .14, .51)),
    ((.025, .018, .049), (.40, .25, .43), (.90, .37, .99)),
    ((.015, .058, .089), (.25, .60, .68), (.99, .19, .41)),
]


def brood(s):
    # Mantle wraps behind the front organs and leaves voids between the three heavy tendrils.
    s.lobe((.37, .13, .38), (1.36, .67, .64), angle=-.17, ridge=12, motion=(.4, 1), segment=40, rings=22)
    s.lobe((-.24, -.33, .10), (.72, .32, .47), "membrane", angle=-.19, motion=(.7, 1), ridge=7)
    s.lobe((.17, -.47, .40), (.36, .22, .30), "signal", angle=-.47, ridge=9, wrinkle=.46)
    s.ring((.18, -.51, .38), (.43, .34), "membrane", thick=.071, warp=.11)
    for vessel in range(5):
        angle = TAU * vessel / 5
        x, z = cos(angle), sin(angle)
        s.limb([(.17 + .15 * x, -.69, .40 + .13 * z), (.17 + .31 * x, -.62, .40 + .24 * z),
                (.15 + .43 * x, -.54, .42 + .32 * z), (.09 + .68 * x, -.48, .43 + .36 * z)],
               .032, "rib", steps=19, sides=8, motion=(.12, 1.1))
    s.lobe((.39, -.52, .27), (.18, .13, .24), "membrane", angle=.31, ridge=6)
    for i in range(7):
        u = (i - 3) / 3
        root = (.81 + .35 * u, .21 + .13 * u, .78 - .18 * abs(u))
        peak = (.34 + .37 * u, -.42 + .13 * u, 1.00 - .14 * abs(u))
        shoulder = (-.32 + .23 * i, -.55 - .10 * cos(i), .65 - .12 * i)
        blade = (-.70 + .39 * i, -.44 + .057 * i, .09 - .08 * i)
        s.limb([root, peak, shoulder, blade], .21 - i * .012, "carapace",
               flatten=.59, motion=(.38, 1.6), ridge=4)
        s.limb([peak, shoulder, blade], .027, "rib", motion=(.38, 1.6), sides=6)
        if i < 4:
            s.limb([(.20 + i * .15, -.63, .40), shoulder, blade], .011, "signal",
                   motion=(.38, 1.6), steps=17, sides=5)
    for i in range(8):
        z = .02 - i * .062 + .075 * cos(i * 1.57)
        y = -.40 + i * .122
        x = -.37 + .12 * i
        reach = 1.78 + .13 * sin(i * 1.94) - .063 * i
        roll = .18 * sin(i * 1.44)
        points = [(x, y, z), (x - .38, y - .09, z - .39 - .1 * sin(i)),
                  (x - .60 - reach * .15, y + .07, z - .57 - i * .04),
                  (x - reach * .82, y - .11 + .19 * cos(i), z - .52 - i * .07 + roll),
                  (x - reach, y - .09 + .12 * cos(i), z - .49 - i * .05 + roll),
                  (x - reach - .06, y - .03, z - .34 - i * .08 + roll)]
        s.limb(points, .185 - i * .014, flatten=.65, motion=(1.15 + i * .11, 1.1), steps=34, sides=12)
        if i in (0, 2, 5):
            vessel = [(u, v - .07, w + .046) for u, v, w in points[:-1]]
            s.limb(vessel, .020, "signal", motion=(1.15 + i * .11, 1.1), steps=22, sides=6)
    for i in range(6):
        s.limb([(.60 + i * .14, .1 - .08 * i, .28 - i * .1), (1.40, .12, -.20 - .05 * i),
                (1.68 + .15 * sin(i), .15, -.37 - .13 * i), (1.97, .21, -.49 - .10 * i)],
               .059 + .009 * i, "rib" if i % 2 else "membrane", steps=20, motion=(1.4, 1.05))


def stalker(s):
    s.lobe((.35, .11, .0), (1.26, .63, .59), ridge=7, angle=.13)
    s.lobe((-.75, -.10, .26), (.66, .47, .40), "rib", angle=.22, ridge=5)
    for sign in (-1, 1):
        s.limb([(-.02, sign * .41, .08), (-.61, sign * .56, .67), (-1.06, sign * .40, .81),
                (-1.64, sign * .30, .36)], .21, "rib", motion=(.55, 1.45))
        s.limb([(-.68, sign * .35, .14), (-.95, sign * .41, -.45), (-1.58, sign * .32, -.44),
                (-1.80, sign * .20, -.17)], .16, "rib", motion=(.46, 1.4))
    for i in range(7):
        x = -.39 + i * .30
        s.limb([(x, -.09, .45), (x + .08, -.50, .30), (x + .12, -.64, -.26),
                (x + .36, -.30, -.61)], .105 - i * .005, "rib", motion=(.36, .92))
        s.lobe((x + .05, .08, .50), (.17, .16, .35 + i * .018), "carapace", angle=.59, segment=16, rings=10)
    s.lobe((-1.08, -.52, .23), (.16, .06, .085), "signal", ridge=4)
    s.limb([(1.08, .2, -.1), (1.55, .14, -.28), (2.03, .16, -.13), (2.24, .09, .31)], .24, "membrane")


def furnace(s):
    s.lobe((.42, .18, -.02), (1.46, .80, .79), ridge=11, wrinkle=.24, segment=36)
    s.lobe((-.49, -.37, .05), (.69, .41, .62), "signal", ridge=7, wrinkle=.43)
    for i in range(8):
        t = TAU * i / 8
        z = cos(t) * .71
        y = sin(t) * .61
        s.limb([(.84, y * .74, z * .72), (.41, y, z), (-.20, y * 1.12, z * 1.1),
                (-.76, y, z * .94), (-1.45, y * .65, z * .55)], .22, "carapace",
               flatten=.72, motion=(.42, 1.45), ridge=5)
        s.limb([(.46, y * 1.07, z * 1.07), (-.05, y * 1.16, z * 1.18), (-.77, y, z)],
               .022, "signal", sides=5)
    for z in (-.62, .58):
        s.limb([(.48, -.33, z * .55), (.10, -.43, z * 1.1), (-.55, -.41, z),
                (-1.42, -.27, z * .51)], .19, "rib", motion=(.32, 1.4))
    s.limb([(.97, .18, 0), (1.51, .16, -.16), (1.99, .23, .18), (2.19, .23, .64)], .27)


def weaver(s):
    s.lobe((.54, .18, .09), (1.13, .64, .65), "membrane", ridge=9)
    s.lobe((-.54, -.08, -.07), (.53, .49, .42), ridge=10)
    s.lobe((-.70, -.52, -.03), (.24, .10, .18), "signal", ridge=6)
    for sign in (-1, 1):
        for i in range(4):
            start = (.68 - .30 * i, -.31 + .12 * i, sign * .10)
            joint = (1.15 - .49 * i, -.35 + .17 * i, sign * (.72 + i * .12))
            claw = (.97 - .67 * i, -.33 + .18 * i, sign * (.97 + i * .035))
            tip = (.69 - .81 * i, -.14 + .12 * i, sign * (.77 + .09 * sin(i)))
            s.limb([start, joint, claw, tip], .125, "carapace", motion=(.85, 1.35), ridge=3)
            s.lobe(joint, (.10, .11, .105), "rib", segment=12, rings=8)
            s.limb([joint, claw, tip], .014, "signal", steps=16, sides=5, motion=(.85, 1.35))
    for i in range(7):
        s.ring((.34 + i * .14, .06, .02), (.27, .45 - i * .028), "rib", thick=.024, axis="nose")


def binder(s):
    s.lobe((.46, .21, -.01), (1.04, .73, .66), ridge=9, angle=.13)
    s.lobe((-.52, -.32, .09), (.51, .39, .41), "membrane", ridge=11)
    s.lobe((-.75, -.62, .14), (.22, .085, .106), "signal", angle=-.37)
    for sign in (-1, 1):
        z = sign * .60
        y = -.45 if sign > 0 else .05
        s.limb([(.14, .20, z * .38), (-.40, y + .07, z * .85), (-1.05, y, z)],
               .29, "membrane", taper=.82, motion=(.46, 1.5))
        s.lobe((-1.02, y, z), (.50, .32, .34), "carapace", ridge=6, angle=sign * .2)
        s.limb([(-1.03, y, z), (-1.49, y, z * 1.44), (-1.88, y, z * 1.38), (-2.12, y, z * .82)],
               .21, "rib", motion=(.44, 1.8))
        s.limb([(-1.07, y, z), (-1.50, y - .05, z * .53), (-1.76, y, z * .46), (-1.96, y, z * .77)],
               .15, "carapace", motion=(.53, 1.8))
    for i in range(6):
        x = .30 + .23 * i
        s.limb([(x, .19, -.10), (x + .06, -.46, -.34), (x + .42, -.28, -.82)], .08, "rib")
    s.limb([(1.08, .23, .10), (1.53, .27, .34), (1.82, .18, .71), (1.91, -.03, .52)], .23, motion=(.8, 1))


def ray(s):
    s.lobe((-.10, .09, .01), (1.10, .54, .36), ridge=8)
    s.lobe((-.67, -.39, .05), (.42, .15, .19), "signal", ridge=6, angle=-.20)
    for sign in (-1, 1):
        for i in range(5):
            x = .09 + i * .14
            z = sign * (.48 + .09 * i)
            s.limb([(x - .38, -.19 + .08 * i, z * .23),
                    (x - .33, -.26 + .10 * i, z * .96),
                    (x + .08, -.04 + .11 * i, z * 1.43),
                    (x + .92, .08 + .08 * i, z * 1.68)],
                   .205 - i * .021, "carapace", flatten=.65, motion=(.77, 1.45), steps=27)
            s.limb([(x - .32, -.30 + .10 * i, z), (x + .08, -.14 + .11 * i, z * 1.44),
                    (x + .91, .02 + .08 * i, z * 1.68)], .017, "signal", sides=5, motion=(.77, 1.45))
    s.limb([(.65, .05, .03), (1.18, .15, -.21), (1.86, .26, -.34), (2.15, .12, .01)], .18, motion=(1.2, 1.12))


def serpentine(s, lightning):
    head_x = -1.42
    s.lobe((head_x, -.14, .25), (.68, .56, .49), "carapace", ridge=8, angle=-.32)
    s.lobe((head_x - .29, -.53, .28), (.26, .13, .13), "signal", angle=-.25, wrinkle=.22)
    for i in range(15):
        t = i / 14
        x = head_x + .41 + 3.10 * t
        z = .16 + sin(t * TAU * .88) * .72
        depth = .23 * sin(t * TAU * .6)
        r = .50 * (1 - .79 * t)
        s.lobe((x, depth, z), (r * .92 + .11, r, r * .82), "carapace" if i % 2 == 0 else "membrane",
               ridge=9, segment=20, rings=12, motion=(.8 + t, .75))
        if lightning:
            s.limb([(x - r * .28, depth, z + r * .30), (x, depth - r * .38, z + r * .79),
                    (x + .21, depth - r * .41, z + r * 1.48)], r * .22,
                   "rib", motion=(.9 + t, .78), steps=12, sides=7)
            s.lobe((x, depth - r * .89, z + .05), (r * .25, r * .23, r * .23), "signal",
                   ridge=5, segment=12, rings=8, motion=(.8 + t, .75))
    for side in (-1, 1):
        if lightning:
            s.limb([(-1.26, -.15, .25), (-.78, -.28, .30 + side * .54),
                    (-.42, -.15, .30 + side * .48)], .125, "rib")
        else:
            s.limb([(-.98, side * .23, .14), (-1.31, side * .52, -.31),
                    (-1.97, side * .43, -.27), (-2.10, side * .21, -.05)], .20, "rib", motion=(.37, 1.54))
            s.ring((-1.56, side * .13, .08), (.40, .43), "rib", thick=.10, axis="nose")
            for tooth in range(7):
                u = TAU * tooth / 7
                s.limb([(-1.68, .37 * cos(u), .08 + .37 * sin(u)),
                        (-1.90, .32 * cos(u), .08 + .27 * sin(u)),
                        (-2.03, .20 * cos(u), .08 + .20 * sin(u))], .081, "rib", steps=10, sides=7)
    if not lightning:
        # Pitch the funnel partly toward the camera, so the throat still reads in side flight.
        s.lobe((-1.55, -.63, .13), (.37, .17, .40), "carapace",
               ridge=9, angle=.22, wrinkle=.17, albedo=.10)
        s.ring((-1.57, -.74, .13), (.39, .43), "membrane", thick=.12, warp=.092, motion=(.34, 1.51))
        s.ring((-1.59, -.79, .14), (.28, .32), "signal", thick=.034, warp=.085, motion=(.34, 1.51))
        for tooth in range(13):
            a = TAU * tooth / 13
            x, z = cos(a), sin(a)
            s.limb([(-1.57 + .40 * x, -.74, .13 + .43 * z), (-1.58 + .32 * x, -.84, .12 + .34 * z),
                    (-1.56 + .23 * x, -.88, .13 + .24 * z)], .064, "rib",
                   steps=12, sides=7, motion=(.34, 1.51))


def spores(s):
    s.lobe((.22, .13, .45), (1.50, .69, .46), "carapace", angle=-.22, ridge=12, wrinkle=.19)
    s.lobe((-.24, .02, .02), (.98, .59, .40), "membrane", ridge=9)
    for i in range(11):
        t = (i - 5) / 5
        s.limb([(.48 + .35 * t, .15, .70), (.26 + .72 * t, -.28 - .10 * cos(i), .55),
                (-.14 + 1.11 * t, -.46 + .1 * sin(i), .22),
                (-.47 + 1.02 * t, -.25, -.03)], .135, "rib", flatten=.52, motion=(.30, 1.3))
    for i in range(8):
        x = -.94 + i * .29
        y = -.36 + .25 * cos(i)
        z = -.30 - .14 * sin(i)
        s.lobe((x, y, z - .16), (.22, .24, .37 - .045 * cos(i)), "membrane", ridge=10)
        s.lobe((x - .02, y - .20, z - .17), (.12, .075, .145), "signal", segment=16, rings=12)
        s.limb([(x, y, z), (x - .10, y, z - .45), (x + .07, y + .1, z - .64),
                (x - .22, y + .18, z - .81)], .085, motion=(1.27, .96))


def neural(s):
    s.lobe((.40, .06, .09), (1.10, .64, .51), "membrane", ridge=10)
    s.lobe((-.56, -.13, .14), (.70, .49, .46), "carapace", ridge=8, angle=-.29)
    for i in range(9):
        x = -.81 + .27 * i
        z = .59 + .12 * sin(i)
        s.limb([(x + .15, .07, .18), (x, -.13, z), (x + .39, -.21, z + .28), (x + .61, -.04, z + .10)],
               .16 - .008 * i, "rib", motion=(.42, 1.6), flatten=.70)
        s.limb([(x + .04, -.58, .34), (x + .28, -.63, .03), (x + .46, -.55, -.16),
                (x + .62, -.36, -.37)], .044, "signal", motion=(.34, 1.1))
    for i in range(3):
        s.lobe((-.75 + .55 * i, -.62, .20 - .24 * i), (.23, .16, .16), "signal", ridge=5)
    for i in range(5):
        s.limb([(.76, -.18 + i * .09, -.09), (1.25, -.16 + i * .10, -.34),
                (1.88, -.04 + i * .08, -.63 + .17 * i), (2.20, .11 + i * .09, -.48 + .17 * i)],
               .10 - .01 * i, motion=(1.13, 1.25))


def fusion(s):
    s.lobe((.38, .23, .04), (1.19, .77, .83), ridge=9, angle=-.17, wrinkle=.26, segment=36)
    s.lobe((-.49, -.33, .18), (.83, .47, .55), "membrane", ridge=11)
    for i, (x, z) in enumerate([(-.70, .11), (.13, .47), (.21, -.39)]):
        s.lobe((x, -.56, z), (.34, .27, .24), "signal", ridge=8, wrinkle=.32)
        s.ring((x, -.61, z), (.39, .29), "rib", thick=.051, warp=.095)
        s.limb([(x + .32, -.45, z), (x + .70, -.44, z * 1.54), (x + .92, -.30, z * 1.89)],
               .082, "membrane", motion=(.65, 1.5))
    for sign in (-1, 1):
        for i in range(4):
            z = sign * (.37 + i * .20)
            s.limb([(.62 - .12 * i, .04, z * .37), (.48 - .45 * i, -.28 + i * .1, z),
                    (.04 - .43 * i, -.17 + i * .14, z * 1.37),
                    (.46 - .60 * i, .10 + i * .12, z * .99)], .195, "carapace",
                   flatten=.67, motion=(.67, 1.63))
            s.limb([(.30 - .45 * i, -.37 + i * .10, z), (.04 - .43 * i, -.23 + i * .14, z * 1.36),
                    (.46 - .60 * i, .04 + i * .12, z)], .023, "signal", sides=5, motion=(.67, 1.63))
    s.limb([(1.10, .23, -.16), (1.59, .11, -.46), (2.03, .11, -.26), (2.16, .20, .28)],
           .32, "rib", motion=(1.1, .85))


def egg(s):
    s.lobe((0, .04, .03), (.66, .48, 1.16), "membrane", ridge=11, wrinkle=.18, segment=36, rings=28)
    s.lobe((-.06, -.39, .21), (.24, .11, .35), "signal", ridge=9, angle=.44, wrinkle=.40)
    for i in range(5):
        z = .54 - i * .20
        s.limb([(-.25, -.40, z + .06), (-.16, -.47, z), (.09, -.47, z - .09), (.29, -.38, z - .21)],
               .042, "rib", steps=16, sides=7, motion=(.10, 1.22))
    for i in range(9):
        u = TAU * i / 9
        points = []
        for j in range(8):
            p = j / 7
            v = -.43 * pi + p * .89 * pi
            a = u + v * .75
            points.append((.65 * cos(v) * cos(a), .04 + .52 * cos(v) * sin(a),
                           .055 + 1.18 * sin(v) + .045 * cos(5 * a)))
        s.limb(points, lambda t: (.076 + .037 * sin(i * 2.2)) * sin(pi * t) + .012, "carapace",
               steps=28, sides=10, flatten=.62, motion=(.14, 1.38))
        if i % 2 == 0:
            s.limb(points[1:-1], .025, "rib", steps=24, motion=(.14, 1.38))
    for i in range(4):
        s.limb([(-.33 + i * .21, -.19, -.66), (-.36 + i * .20, -.15, -.96),
                (-.18 + i * .13, -.19, -1.27), (-.25 + i * .13, -.16, -1.38)],
               .09, "membrane", motion=(.48, .51))


MODELS = [
    ("broodmother", brood), ("marrow-stalker", stalker), ("cinder-maw", furnace),
    ("rift-weaver", weaver), ("pulse-binder", binder), ("mirror-ray", ray),
    ("thunder-wyrm", lambda s: serpentine(s, True)), ("spore-regent", spores),
    ("dimension-maw", lambda s: serpentine(s, False)), ("neural-king", neural),
    ("abyssal-confluence", fusion), ("abyssal-egg", egg),
    *FINALES,
]


def preview_scene(scene, bounds):
    center, span = bounds

    def aim(obj):
        obj.rotation_euler = (center - obj.location).to_track_quat("-Z", "Y").to_euler()

    camera = bpy.data.objects.new("Inspection camera", bpy.data.cameras.new("Orthographic review"))
    scene.collection.objects.link(camera)
    camera.location = center + Vector((-.42, -8.4, 1.12))
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = span * 1.16
    aim(camera)
    scene.camera = camera
    for name, offset, power, size, color in (
        ("Softbox key", (-3, -4, 5), 480, 4, (.62, .83, 1)),
        ("Motivated bounce", (2, -3, -3), 210, 3, (1, .31, .48)),
        ("Blue rim", (2, 2, 3), 780, 2.5, (.27, .79, 1)),
    ):
        light = bpy.data.lights.new(name, "AREA")
        light.energy, light.shape, light.size, light.color = power, "DISK", size, color
        obj = bpy.data.objects.new(name, light)
        scene.collection.objects.link(obj)
        obj.location = center + Vector(offset)
        aim(obj)
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y = 880, 700
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.frame_set(22)


def build(index, out, review):
    name, model = MODELS[index]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, 88
    scene.render.fps = 24
    palette = PALETTES[index if index < 12 else index - 11]
    sculpt = Sculpt(palette[:2], palette[2])
    model(sculpt)
    organs = sculpt.organs(name)
    for obj in organs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = organs[0]
    scene.frame_set(1)
    file = out / f"{name}.glb"
    bpy.ops.export_scene.gltf(filepath=str(file), export_format="GLB", use_selection=True,
                             export_morph=True, export_morph_animation=True, export_animation_mode="SCENE",
                             export_cameras=False, export_lights=False, export_vertex_color="MATERIAL")
    vertices = [v.co for obj in organs for v in obj.data.vertices]
    lo = Vector(tuple(min(p[i] for p in vertices) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in vertices) for i in range(3)))
    triangles = sum(len(f.vertices) - 2 for obj in organs for f in obj.data.polygons)
    print(f"ASSET {name} {len(vertices)} vertices {triangles} triangles {file.stat().st_size} bytes", flush=True)
    if review:
        preview_scene(scene, ((lo + hi) / 2, max((hi - lo).x, (hi - lo).z * 1.25)))
        if index in (0, 11):
            bpy.ops.wm.save_as_mainfile(filepath=str(review / f"{name}.blend"))
        scene.render.filepath = str(review / f"{name}.png")
        bpy.ops.render.render(write_still=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[2] / "assets" / "models")
    parser.add_argument("--review-dir", type=Path)
    parser.add_argument("--only", type=int, nargs="+", choices=range(1, len(MODELS) + 1), default=range(1, len(MODELS) + 1))
    opts = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    opts.output.mkdir(parents=True, exist_ok=True)
    if opts.review_dir:
        opts.review_dir.mkdir(parents=True, exist_ok=True)
    for item in opts.only:
        build(item - 1, opts.output, opts.review_dir)


if __name__ == "__main__":
    main()
