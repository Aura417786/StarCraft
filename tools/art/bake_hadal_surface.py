"""Bake the actual Blender Ocean modifier into a browser normal/foam flipbook."""

from array import array
from math import isqrt
from pathlib import Path
import sys

import bpy


def clamp(value):
    return min(1, max(0, value))


def bake(output):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_plane_add()
    ocean = bpy.context.object
    ocean.name = "Hadal Water - spectral ocean source"
    surface = ocean.modifiers.new("Depth wind and chop", "OCEAN")
    surface.geometry_mode = "GENERATE"
    surface.resolution = 8
    surface.viewport_resolution = 8
    surface.spatial_size = 24
    surface.depth = 43
    surface.wind_velocity = 19
    surface.wave_scale = 1.35
    surface.choppiness = 1.47
    surface.use_normals = True
    surface.random_seed = 73
    depsgraph = bpy.context.evaluated_depsgraph_get()
    tile = 96
    columns, rows = 4, 3
    width, height = columns * tile, rows * tile
    pixels = array("f", [1]) * (width * height * 4)
    total_vertices = 0
    for frame in range(columns * rows):
        surface.time = 1.8 + frame * .10
        bpy.context.view_layer.update()
        evaluated = ocean.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        total_vertices = len(mesh.vertices)
        count = isqrt(total_vertices)
        assert count * count == total_vertices and count >= 32, f"Unexpected ocean grid: {total_vertices}"
        positions = [vertex.co.copy() for vertex in mesh.vertices]
        for row in range(tile):
            yy = min(count - 2, round(row * (count - 2) / (tile - 1)))
            for col in range(tile):
                xx = min(count - 2, round(col * (count - 2) / (tile - 1)))
                vertex = yy * count + xx
                a, b, c = positions[vertex], positions[vertex + 1], positions[vertex + count]
                normal = (b - a).cross(c - a).normalized()
                if normal.z < 0:
                    normal.negate()
                det = abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
                expected = (surface.spatial_size / (count - 1)) ** 2
                foam = clamp((1.06 - det / expected) * 1.12) * clamp((a.z + .30) * 1.17)
                i = (((frame // columns) * tile + row) * width + (frame % columns) * tile + col) * 4
                pixels[i] = clamp(.5 + normal.x * .49)
                pixels[i + 1] = clamp(.5 + normal.y * .49)
                pixels[i + 2] = foam
        evaluated.to_mesh_clear()
    image = bpy.data.images.new("Hadal normals / foam", width=width, height=height, alpha=False)
    image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_set(pixels)
    image.file_format = "PNG"
    image.filepath_raw = str(output)
    image.save()
    print(f"OCEAN {columns * rows} sampled frames, {total_vertices} Blender evaluated vertices per frame, {width}x{height} atlas", flush=True)


if __name__ == "__main__":
    path = Path(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else (
        Path(__file__).resolve().parents[2] / "assets" / "models" / "hadal-surface.png")
    path.parent.mkdir(parents=True, exist_ok=True)
    bake(path)
