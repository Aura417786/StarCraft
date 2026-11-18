"""Blender background script. Bake relief and microsurface response into two spare channels.

Run blender -b --factory-startup --python-exit-code 1 -P tools/art/bake-orbital-material.py.
R preserves the existing photographic detail. G is cavity/edge relief. B is roughness.
"""
from pathlib import Path
import math

import bpy
from mathutils import Vector, noise

root = Path(__file__).resolve().parents[2]
folder = root / "assets" / "scenery"
base = bpy.data.images.load(str(folder / "prop-material-detail.webp"))
base.colorspace_settings.name = "Non-Color"
width, height = base.size
atlas = bpy.data.images.new("Orbital surface response", width=width, height=height, alpha=False)
atlas.colorspace_settings.name = "Non-Color"
pixels = list(base.pixels[:])
for y in range(height):
    for x in range(width):
        i = 4 * (x + y * width)
        u, v = x / width, (y % (height // 2)) / (height // 2)
        patch = noise.noise(Vector((u * 5, v * 5, 1.73)))
        if y >= height // 2:  # upper image half, rock (WebGL uploads without FLIP_Y)
            distances, _ = noise.voronoi(Vector((u * 10 + patch * .35, v * 10, .7)))
            joint = min(1, (distances[1] - distances[0]) * 6.5)
            cavity = .14 + .72 * joint + .10 * patch
            roughness = .88 - .22 * joint + .12 * patch
        else:
            # Drawn metal carries a directional grain, polished on exposed ridges.
            brush = noise.noise(Vector((u * 13, v * 89, 4.2)))
            score = abs(math.sin(v * 73 + .8 * patch + .35 * math.sin(u * 8)))
            cavity = .45 + .35 * min(1, score * 3) + .15 * brush
            roughness = .36 + .21 * brush + .16 * patch + .25 * (1 - min(1, score * 3))
        pixels[i+1:i+4] = [max(0, min(1, cavity)), max(.08, min(.98, roughness)), 1]
atlas.pixels.foreach_set(pixels)
atlas.filepath_raw = str(folder / "orbital-material.png")
atlas.file_format = "PNG"
atlas.save()
print("Baked", atlas.filepath_raw, width, height)
