"""Render five banks from each approved Kestrel Blender source."""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


WIDTH, HEIGHT = 576, 384
BANKS = (-28, -14, 0, 14, 28)
MODELS = {
    "red": ("crimson", "Crimson | X-09 Breaker", (4.16, 0, .082)),
    "blue": ("azure", "Azure | X-07 Fork Interceptor", (3.21, 0, .13)),
    "yellow": ("auric", "Auric | X-12 Solar Battery", (3.21, 0, .13)),
}
ENGINE = (-3.94, 0, -.16)


def configure(model, cpu):
    scene = bpy.context.scene
    camera = scene.objects["03 | Game camera"]
    scene.camera = camera
    for item in bpy.data.collections["03 Studio stage"].objects:
        if item.type == "MESH":
            item.hide_render = True
    render = scene.render
    render.resolution_x = WIDTH
    render.resolution_y = HEIGHT
    render.resolution_percentage = 100
    render.film_transparent = True
    render.image_settings.file_format = "PNG"
    render.image_settings.color_mode = "RGBA"
    scene.view_settings.exposure = .06
    scene.use_nodes = False
    scene.cycles.samples = 30
    scene.cycles.adaptive_threshold = .036
    if not cpu:
        try:
            preferences = bpy.context.preferences.addons["cycles"].preferences
            preferences.compute_device_type = "OPTIX"
            preferences.refresh_devices()
            for device in preferences.devices:
                device.use = device.type == "OPTIX"
            if any(device.use for device in preferences.devices):
                scene.cycles.device = "GPU"
        except (KeyError, RuntimeError, TypeError):
            scene.cycles.device = "CPU"
    return scene, camera, scene.objects[model]


def set_bank(pivot, bank):
    pivot.rotation_euler.x = math.radians(bank)
    bpy.context.view_layer.update()


def fit_camera(scene, camera, pivot):
    camera.data.ortho_scale = 10
    points = []
    for bank in BANKS:
        set_bank(pivot, bank)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        for item in pivot.children:
            evaluated = item.evaluated_get(depsgraph)
            points.extend(world_to_camera_view(scene, camera, evaluated.matrix_world @ Vector(point))
                          for point in evaluated.bound_box)
    x0, x1 = min(p.x for p in points), max(p.x for p in points)
    y0, y1 = min(p.y for p in points), max(p.y for p in points)
    width = camera.data.ortho_scale
    view_offset = Vector((((x0 + x1) / 2 - .5) * width,
                          ((y0 + y1) / 2 - .5) * width * HEIGHT / WIDTH, 0))
    camera.location += camera.rotation_euler.to_quaternion() @ view_offset
    camera.data.ortho_scale *= max(x1 - x0, y1 - y0) / .89
    bpy.context.view_layer.update()


def project(scene, camera, pivot, vertex):
    point = world_to_camera_view(scene, camera, pivot.matrix_world @ Vector(vertex))
    return [round(point.x, 6), round(1 - point.y, 6)]


def reflection_paths(id_):
    spar = [(-1.58, 2.68, .46), (-.74, 2.77, .524), (.65, 2.76, .474),
            (1.85, 2.74, .364), (2.72, 2.69, .282)]
    if id_ == "red":
        spar = [(x * .70 - .42, y, z) for x, y, z in spar]
    return [[(x, y * side, z) for x, y, z in spar] for side in (-1, 1)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("models", type=Path, help="Directory containing the named Kestrel .blend sources")
    parser.add_argument("output", type=Path, help="Directory for five poses per fighter and metadata")
    parser.add_argument("--cpu", action="store_true", help="Render with Cycles CPU")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    args.output.mkdir(parents=True, exist_ok=True)
    frames = {}
    for id_, (variant, model, nose) in MODELS.items():
        bpy.ops.wm.open_mainfile(filepath=str((args.models / f"kestrel-{variant}.blend").resolve()))
        scene, camera, pivot = configure(model, args.cpu)
        fit_camera(scene, camera, pivot)
        frames[id_] = []
        for bank in BANKS:
            set_bank(pivot, bank)
            destination = args.output / f"{id_}_{bank:+03d}.png"
            scene.render.filepath = str(destination.resolve())
            bpy.ops.render.render(write_still=True)
            frames[id_].append({
                "file": destination.name,
                "nose": project(scene, camera, pivot, nose),
                "engines": [project(scene, camera, pivot, ENGINE)],
                "reflections": [[project(scene, camera, pivot, point) for point in path]
                                for path in reflection_paths(id_)],
            })
    (args.output / "fighter-frames.json").write_text(json.dumps(frames, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
