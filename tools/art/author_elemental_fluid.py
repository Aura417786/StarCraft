"""Bake the original water, spore and seed pod material plates."""

from pathlib import Path
import argparse
import numpy as np
from PIL import Image


SIZE = 256
AXIS = (np.arange(SIZE) + .5) / SIZE * 2 - 1
X, Y = np.meshgrid(AXIS, AXIS)
R = np.hypot(X, Y)
ANGLE = np.arctan2(Y, X)


def smooth(v, lower, upper):
    t = np.clip((v - lower) / (upper - lower), 0, 1)
    return t * t * (3 - 2 * t)


def cloud_field(rng, resolution):
    noise = rng.random((resolution, resolution), dtype=np.float32)
    return np.asarray(Image.fromarray(noise).resize((SIZE, SIZE), Image.Resampling.BICUBIC))


def rgb(value, low, high):
    t = np.clip(value, 0, 1)[..., None]
    return (1 - t) * np.array(low) + t * np.array(high)


def rgba(colors, alpha):
    data = np.zeros((SIZE, SIZE, 4), dtype=np.uint8)
    data[..., :3] = np.clip(colors, 0, 255).astype(np.uint8)
    data[..., 3] = np.round(np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    return Image.fromarray(data)


def liquid(rng, index):
    b = cloud_field(rng, 6) * .56 + cloud_field(rng, 19) * .3 + cloud_field(rng, 43) * .14
    warp = Y * (33+index*6) + 13 * X + b * 15 + np.sin(X * (9 + index)) * 2.4
    surface = .5 + .5 * np.sin(warp) * np.cos(13*Y - 16*X + b * 7)
    foamy = smooth(surface, .63, .99) * smooth(b, .37, .63)
    wrinkle = .28 * smooth(b, .41, .66) + foamy * .72
    mask = 1 - smooth(R, .49, .955)
    return rgba(rgb(wrinkle, (8,53,78), (197,242,252)), mask * (.24+.62*foamy))


def dust(rng, index):
    core = np.exp(-((X+.17)**2 + (Y-.03)**2) * 2.1)
    outer = np.exp(-((X-.32)**2*3.6 + (Y+.30)**2*2.9))
    fields = [cloud_field(rng, r) for r in (6, 12, 28, 58)]
    density = .35 * core + .21 * outer + fields[0]*.34 + fields[1]*.24 + fields[2]*.13 + fields[3]*.08
    edge = smooth(density, .49 + index*.025, .87)
    body = smooth(density, .42, .76)
    mask = 1 - smooth(R, .47, .94)
    return rgba(rgb(body*.34+edge*.66, (14,28,17), (199,231,104)), mask * body * (.41 + .46*edge))


def pod(rng, index):
    b = cloud_field(rng, 12) * .6 + cloud_field(rng, 42) * .4
    segmented = np.sin(ANGLE * (8 + index) + R*5 + b*2)
    asym = np.hypot(X*.91, Y*1.25) * (1+.14*segmented)
    seam = smooth(segmented,.78,.994) * smooth(asym,.27,.8)
    chamber = np.exp(-((X+.12)**2+(Y+.09)**2)*4.6) * (.48+.47*b)
    grain = .32*chamber + .59*seam + .18*b
    return rgba(rgb(grain, (23,37,15), (247,246,117)), 1-smooth(asym,.70,.91))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    options = parser.parse_args()
    sheet = Image.new("RGBA", (SIZE * 3, SIZE * 3))
    for row, author in enumerate((liquid, dust, pod)):
        for variation in range(3):
            tile = author(np.random.default_rng(5711 + row * 37 + variation), variation)
            assert tile.getpixel((0,0))[3] == 0
            sheet.paste(tile, (SIZE * variation, SIZE * row))
    options.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(options.output, quality=88, method=6)


if __name__ == "__main__":
    main()
