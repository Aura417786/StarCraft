"""Bake carved bone, spiraled silk and undercut chitin for the armored trio."""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


WIDTH, HEIGHT = 512, 224


def mix(a, b, weight):
    t = np.clip(weight, 0, 1)[..., None]
    return np.asarray(a, dtype=np.float32) * (1 - t) + np.asarray(b, dtype=np.float32) * t


def detail(rng, shape):
    height, width = shape
    layers = np.zeros(shape)
    for size, weight in ((8, .42), (21, .28), (53, .17), (167, .13)):
        samples = Image.fromarray(rng.integers(0, 255, (size, size), dtype=np.uint8))
        layers += np.asarray(samples.resize((width, height), Image.Resampling.BICUBIC)) / 255 * weight
    return layers


def image(color, coverage):
    return Image.fromarray(np.dstack((np.clip(color, 0, 255),
                                      np.clip(coverage, 0, 1) * 255)).astype(np.uint8), "RGBA")


def ivory(x, y, grain, shift):
    spine = -.26 + .56 * x ** 1.87 - .04 * np.sin(x * 6 + shift)
    width = (.32 * (1 - x) ** .87 + .027) * (.91 + .09 * np.sin(x * 31 + shift))
    cross = (y - spine) / width
    ridge = np.sqrt(np.clip(1 - cross ** 2, 0, 1))
    grainline = np.sin(x * 145 + cross * 9.5 + grain * 14)
    chip = np.maximum(0, np.sin(x * 178 + grain * 7)) ** 9 * (grain > .61)
    light = .22 + ridge * .56 - cross * .13 + grain * .29 + grainline * .059 - chip * .26
    color = mix((50, 31, 26), (247, 221, 179), light)
    color = mix(color, (255, 239, 206), np.exp(-((cross + .48) / .14)**2) * .29)
    cap = np.clip((x - .022) * 75, 0, 1) * np.clip((.987 - x) * 90, 0, 1)
    return image(color, np.clip((1 - np.abs(cross)) * 9, 0, 1) * cap)


def cocoon(x, y, grain, shift):
    u = (x - .50) * 2.64
    v = y * 1.34 - u * .27
    radius = np.sqrt(u ** 2 + v ** 2)
    angle = np.arctan2(v, u)
    seams = np.sin((v + .085 * np.sin(u * 6 + shift) + .071 * grain) * 64 + angle * 1.5)
    hair = np.sin(u * 109 + seams * 1.37 + v * 126)
    relief = np.sqrt(np.clip(1 - radius ** 2, 0, 1))
    contrast = relief * .46 + seams * .20 + hair * .059 + grain * .38 - .07
    color = mix((18, 8, 32), (196, 134, 232), contrast)
    veins = (np.maximum(0, np.cos(v * 26 + angle * 2.1 - grain * 3)) ** 11 * relief) * .43
    color = mix(color, (222, 170, 251), veins)
    outline = radius + .061 * np.sin(angle * 13 + shift) + grain * .056
    return image(color, np.clip((1.01 - outline) * 17, 0, 1))


def chitin(x, y, grain, shift):
    spine = -.49 + x * .83 - .26 * np.sin(x * 4.24 + shift * .23)
    width = (.37 * x ** .52 + .012) * (.89 + .11 * np.sin(x * 23 + shift))
    cross = (y - spine) / width
    ridge = np.sqrt(np.clip(1 - cross ** 2, 0, 1))
    joints = np.sin(x * 35.8 + cross * 2.1 + grain * 3.4 + shift)
    scutes = np.sin(x * 93 + cross ** 2 * 18 + grain * 14)
    light = .23 + ridge * .48 - cross * .18 + grain * .21 + joints * .09 + scutes * .035
    color = mix((11, 24, 23), (119, 160, 88), light)
    color = mix(color, (209, 215, 154), np.exp(-((cross + .63) / .13)**2) * .37)
    color = mix(color, (153, 227, 90), np.maximum(0, joints) ** 14 * grain * .21 * (cross < -.11))
    cap = np.clip((x - .015) * 105, 0, 1) * np.clip((.982 - x) * 30, 0, 1)
    return image(color, np.clip((1 - np.abs(cross)) * 10, 0, 1) * cap)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    y, x = np.mgrid[-1:1:complex(HEIGHT), 0:1:complex(WIDTH)]
    rng = np.random.default_rng(47203)
    output = Image.new("RGBA", (WIDTH * 3, HEIGHT * 2))
    for kind, material in enumerate((ivory, cocoon, chitin)):
        for variation in range(2):
            row = material(x, y, detail(rng, x.shape), variation * 2.14)
            bounds = row.getbbox()
            assert bounds and bounds[0] > 0 and bounds[1] > 0 and bounds[2] < WIDTH and bounds[3] < HEIGHT
            output.paste(row, (kind * WIDTH, variation * HEIGHT))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.save(args.output, "WEBP", quality=91, alpha_quality=100, method=6, exact=True)


if __name__ == "__main__":
    main()
