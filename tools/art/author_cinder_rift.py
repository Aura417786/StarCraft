"""Bake original basalt relief, ember masks, crater and ash for Cinder Maw.

Usage: python author-cinder-rift.py OUTPUT.webp
Requires NumPy and Pillow. Color and alpha are packed in horizontal material
plates. The game composites only the plates, never evaluates noise per frame.
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


WIDTH, DEPTH = 1536, 320
SPRITE = 256


def ramp(value, start, end):
    t = np.clip((value - start) / (end - start), 0, 1)
    return t * t * (3 - 2 * t)


def noise(rng, x, z, scale):
    gx, gz = x / scale, z / scale
    ix, iz = np.floor(gx).astype(np.int32), np.floor(gz).astype(np.int32)
    ix -= ix.min()
    iz -= iz.min()
    fx = ramp(gx % 1, 0, 1)
    fz = ramp(gz % 1, 0, 1)
    grid = rng.random((iz.max() + 2, ix.max() + 2), dtype=np.float32)
    a = grid[iz, ix] * (1 - fx) + grid[iz, ix + 1] * fx
    b = grid[iz + 1, ix] * (1 - fx) + grid[iz + 1, ix + 1] * fx
    return a * (1 - fz) + b * fz


def plates(rng, x, z, size):
    gx, gz = x / size, z / size
    ix, iz = np.floor(gx).astype(np.int32), np.floor(gz).astype(np.int32)
    ix -= ix.min() - 1
    iz -= iz.min() - 1
    dx, dz = gx % 1, gz % 1
    grid = rng.random((iz.max() + 2, ix.max() + 2, 3), dtype=np.float32)
    near = np.full_like(x, 10)
    runner = near.copy()
    elevation = near.copy()
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            cell = grid[iz + oy, ix + ox]
            d = (ox + .18 + cell[..., 0] * .64 - dx) ** 2 + (oy + .18 + cell[..., 1] * .64 - dz) ** 2
            closer = d < near
            runner = np.where(closer, near, np.minimum(runner, d))
            near = np.minimum(near, d)
            elevation = np.where(closer, cell[..., 2], elevation)
    edge = (runner - near) * size * .50
    return edge, elevation


def palette(strength, *colors):
    result = []
    for channel in range(3):
        result.append(np.interp(strength, np.linspace(0, 1, len(colors)), [c[channel] for c in colors]))
    return np.stack(result, axis=-1)


def image(rgb, alpha):
    return Image.fromarray(np.dstack((np.clip(rgb, 0, 255), np.clip(alpha * 255, 0, 255))).astype(np.uint8))


def geology(x, y, rng, crater=False):
    broad = noise(rng, x, y, 90)
    middle = noise(rng, x, y, 27)
    mineral = noise(rng, x, y, 9)
    pores = noise(rng, x, y, 2.7)
    grain = rng.random(x.shape, dtype=np.float32)
    warped_x = x + (middle - .5) * 22 + (broad - .5) * 86
    warped_y = y * 1.48 + (middle - .5) * 24 + (broad - .5) * 43
    edge, slab = plates(rng, warped_x, warped_y, 35 if crater else 73)
    secondary, _ = plates(rng, warped_x, warped_y, 24)
    joint = ramp(edge, 0, 7.5)
    near_split = 1 - ramp(edge, 1.6, 4.4 + middle * 3.3)
    if crater:
        sx, sy = (x - SPRITE / 2) / (SPRITE / 2), (y - SPRITE / 2) / (SPRITE / 2)
        radius = np.hypot(sx, sy)
        wall = np.exp(-((radius - .54 + (middle - .5) * .18) / (.17 + broad * .17)) ** 2)
        pool = (1 - ramp(radius, .10, .43)) * (.26 + broad * .74)
        ember = np.maximum(pool, near_split * (.18 + wall * .82) * (1 - ramp(radius, .53, .80)))
        alpha = (1 - ramp(radius + (middle - .5) * .21, .77, .95)) * ramp(radius, .07, .28)
    else:
        pos = y / DEPTH
        crest = (.76 + .16 * np.sin(x * .011 + broad * 2) +
                 .085 * np.cos(x * .023 + middle * 4) + (slab - .5) * .11)
        edge_dist = crest - pos
        wall = ramp(edge_dist, -.015, .13) * (1 - ramp(edge_dist, .16, .70))
        river = .39 + .10 * np.sin(x * .008 + broad * 2.8) + .028 * np.sin(x * .035 + 1.45)
        neck = np.abs(pos - river + (middle - .50) * .12)
        breadth = .020 + .040 * np.maximum(0, np.sin(x * .016 - 1.2)) + .028 * mineral
        pool = (1 - ramp(neck, breadth * .55, breadth)) * (.35 + broad * .65)
        heat = ramp(broad * .62 + middle * .28 + slab * .10, .24, .76)
        feeders = 1 - ramp(neck, .035, .25 + broad * .15)
        tributaries = (1 - ramp(secondary, .5, 1.4 + mineral)) * heat * feeders * .49
        ember = np.maximum(pool, near_split * (.25 + feeders * .74) * (.38 + heat * .62))
        ember = np.maximum(ember, tributaries)
        alpha = ramp(edge_dist, -.03, .027) * ramp(x, 8, 54) * (1 - ramp(x, WIDTH - 61, WIDTH - 10))
        alpha *= ramp(pos, .015, .12)

    # Height derives from detached plates, a raised far bank and fine breakage.
    height = (wall * 17 + broad * 15 + middle * 7 + mineral * 3.1 + pores * .7)
    height *= .57 + joint * .70 + slab * .39
    height -= pool * 14
    dz, dx = np.gradient(height)
    facing = (-dx * .43 + dz * .75 + 1) / np.sqrt(1 + dx * dx + dz * dz)
    occlusion = .37 + joint * .63
    bore = ramp(pores * .65 + mineral * .35, .15, .43)
    spec = ramp(facing, .94, 1.12) * bore * (.16 + mineral * .53)
    luminance = (8 + np.maximum(0, facing) * (14 + slab * 24 + wall * 23) + spec * 39)
    luminance += (grain - .5) * (4 + bore * 7)
    luminance *= occlusion * (.51 + bore * .49)
    lit = np.maximum(0, 1 - edge / 13) * (.17 + ember * .72) * (1 - near_split * .5)
    stone = np.stack((luminance * 1.12 + lit * 46, luminance * .96 + lit * 16, luminance + lit * 6), axis=-1)
    cool_melt = palette(ember, (8, 6, 9), (42, 13, 14), (91, 24, 11), (166, 53, 21))
    stone = stone * (1 - ember[..., None] * .86) + cool_melt * ember[..., None] * .86
    hot = palette(ember, (31, 6, 8), (139, 25, 10), (236, 66, 14), (255, 134, 37), (255, 230, 117))
    flame_alpha = np.minimum(alpha, ramp(ember, .13, .93) * (.66 + grain * .31))
    if crater:
        alpha = np.maximum(alpha, pool * .78)
        flame_alpha = np.maximum(flame_alpha, .88 * pool ** 2)
    return image(stone, alpha), image(hot, flame_alpha)


def ash(rng, x, y):
    sx = (x - SPRITE / 2) / (SPRITE / 2)
    sy = (y - SPRITE / 2) / (SPRITE / 2)
    broad = noise(rng, x, y, 48)
    middle = noise(rng, x, y, 17)
    fine = noise(rng, x, y, 6)
    reach = np.hypot(sx * 1.02, sy)
    density = (1 - ramp(reach + (broad - .5) * .34, .18, .90))
    density *= ramp(broad * .52 + middle * .35 + fine * .13, .28, .76)
    light = ramp(broad * .59 + middle * .41, .26, .76)
    return image(palette(light, (20, 21, 30), (55, 46, 51), (108, 76, 57)), density * .86)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    atlas = Image.new("RGBA", (WIDTH, DEPTH * 4 + SPRITE))
    y, x = np.mgrid[0:DEPTH, 0:WIDTH].astype(np.float32)
    for lane, seed in enumerate((347221, 18061)):
        base, incandescent = geology(x, y, np.random.default_rng(seed))
        atlas.paste(base, (0, lane * DEPTH * 2))
        atlas.paste(incandescent, (0, (lane * 2 + 1) * DEPTH))
    y, x = np.mgrid[0:SPRITE, 0:SPRITE].astype(np.float32)
    crater, lava = geology(x, y, np.random.default_rng(223914), crater=True)
    atlas.paste(crater, (0, DEPTH * 4))
    atlas.paste(lava, (SPRITE, DEPTH * 4))
    atlas.paste(ash(np.random.default_rng(334263), x, y), (SPRITE * 2, DEPTH * 4))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(args.output, "WEBP", quality=88, alpha_quality=100, method=6)
    print(f"{atlas.width}x{atlas.height}, {args.output.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
