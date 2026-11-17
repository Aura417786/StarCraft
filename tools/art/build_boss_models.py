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
from cinder_maw_sculpt import furnace
import elemental_fluid_sculpts
import elemental_armored_sculpts
import elemental_cosmic_sculpts
import elemental_confluence_sculpt

ELEMENTAL_GROUPS = (elemental_fluid_sculpts, elemental_armored_sculpts,
                    elemental_cosmic_sculpts, elemental_confluence_sculpt)
ELEMENTAL_SCULPTS = {i: sculpt for group in ELEMENTAL_GROUPS for i, sculpt in group.SCULPTS.items()}
ELEMENTAL_PALETTES = {i: palette for group in ELEMENTAL_GROUPS for i, palette in getattr(group, "PALETTES", {}).items()}


CINDER_MAW_PALETTE = ((.015, .021, .030), (.085, .098, .114), (1, .225, .022))


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


MODEL_NAMES = (
    "broodmother", "marrow-stalker", "cinder-maw", "rift-weaver", "pulse-binder",
    "mirror-ray", "thunder-wyrm", "spore-regent", "dimension-maw", "neural-king",
    "abyssal-confluence",
)
MODELS = [
    *((name, furnace if i == 2 else ELEMENTAL_SCULPTS[i]) for i, name in enumerate(MODEL_NAMES)),
    ("abyssal-egg", egg),
    *FINALES,
]


def model_palette(index):
    if index == 2:
        return CINDER_MAW_PALETTE
    return ELEMENTAL_PALETTES.get(index, PALETTES[index if index < 12 else index - 11])


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
    palette = model_palette(index)
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
