"""Bake linear sector lighting into log-radiance PNGs with Blender 4.5.

Run: blender -b --factory-startup --python tools/art/bake_sector_light.py
Each PNG stores log2(1 + radiance) / 4 per channel. The browser decodes to
linear float before making a PMREM; the PNG is a transport container.
"""

from array import array
from math import acos, cos, exp, log2, pi, sin
from pathlib import Path

import bpy
from mathutils import Vector


SCENERY = Path(__file__).resolve().parents[2] / "assets" / "scenery"
WIDTH, HEIGHT = 256, 128
# Exposure, broad-light direction, and the photographed source's linear tint.
SECTORS = {
    "orbit": (3.4, (.68, .64, .58), (.63, .79, 1.0)),
    "belt": (2.8, (-.73, .43, .64), (1.0, .72, .46)),
    "wreck": (2.5, (.58, .52, .67), (1.0, .56, .41)),
    "citadel": (2.9, (.51, -.43, .68), (.55, .87, .91)),
    "rift": (2.1, (-.55, .48, .71), (.76, .58, 1.0)),
}


def linear_srgb(channel):
    return channel / 12.92 if channel <= .04045 else ((channel + .055) / 1.055) ** 2.4


def bake(name, config):
    exposure, aim, tint = config
    plate = bpy.data.images.load(str(SCENERY / f"{name}-galaxy.webp"), check_existing=False)
    # Sample the source's code values and convert once into the lighting space.
    plate.colorspace_settings.name = "Non-Color"
    source_width, source_height = plate.size
    pixels = array("f", [0.0]) * (source_width * source_height * 4)
    plate.pixels.foreach_get(pixels)
    source = Vector(aim).normalized()
    # Two soft emitters are tied to the photographic highlights and opposite diffuse bounce.
    bounce = Vector((-.36 * source.x, -.74, -.33)).normalized()
    radiance = array("f")
    for y in range(HEIGHT):
        latitude = ((y + .5) / HEIGHT - .5) * pi
        for x in range(WIDTH):
            longitude = ((x + .5) / WIDTH - .5) * 2 * pi
            direction = Vector((cos(latitude) * cos(longitude), sin(latitude), cos(latitude) * sin(longitude)))
            angle = acos(max(-1, min(1, direction.dot(source))))
            lobe = exposure * (.78 * exp(-angle * angle / .095) + .22 * exp(-angle * angle / .65))
            return_light = max(0, direction.dot(bounce)) ** 4 * .23
            # Project the panorama into the broad facing hemisphere; diffuse it over nine samples.
            u = .5 + longitude * .37 / pi
            v = .5 + latitude * .81 / pi
            sampled = [0.0, 0.0, 0.0]
            for dv in (-.021, 0, .021):
                for du in (-.016, 0, .016):
                    px = min(source_width - 1, max(0, int((u + du) * source_width)))
                    py = min(source_height - 1, max(0, int((v + dv) * source_height)))
                    offset = 4 * (py * source_width + px)
                    for channel in range(3):
                        sampled[channel] += linear_srgb(pixels[offset + channel])
            for channel in range(3):
                light = .018 + sampled[channel] * .095 + lobe * tint[channel]
                light += return_light * (.41 + tint[channel] * .42)
                radiance.append(min(1.0, log2(1 + light) / 4))
            radiance.append(1.0)
    output = bpy.data.images.new(f"{name}-sector-light", WIDTH, HEIGHT, alpha=False)
    output.colorspace_settings.name = "Non-Color"
    output.pixels.foreach_set(radiance)
    output.filepath_raw = str(SCENERY / f"sector-light-{name}.png")
    output.file_format = "PNG"
    output.save()
    bpy.data.images.remove(output)
    bpy.data.images.remove(plate)


for sector, settings in SECTORS.items():
    bake(sector, settings)


def bake_orbit_mask():
    """Feather the moving surface beneath the original atmospheric limb."""
    width, height = 576, 324
    pixels = array("f")
    for y in range(height):
        v = 1 - (y + .5) / height
        for x in range(width):
            u = (x + .5) / width
            limb = .90 - .77 * u + .27 * u * u
            fade = min(1, max(0, (v - limb - .046) / .094))
            pixels.extend((1, 1, 1, fade * fade * (3 - 2 * fade)))
    mask = bpy.data.images.new("Orbit surface feather", width, height, alpha=True)
    mask.colorspace_settings.name = "Non-Color"
    mask.pixels.foreach_set(pixels)
    mask.filepath_raw = str(SCENERY / "orbit-surface-mask.png")
    mask.file_format = "PNG"
    mask.save()


bake_orbit_mask()
