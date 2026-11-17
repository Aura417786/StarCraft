"""Bake a fine filament curtain and suspended aerosol for the Confluence."""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


def bake(output):
    width, height = 320, 640
    y, x = np.mgrid[0:height, 0:width].astype(np.float32)
    x = x / (width - 1) * 2 - 1
    y = y / (height - 1)
    drift = .12 * np.sin(y * 29 + 1.4) + .058 * np.cos(y * 57 - .4)
    edge = np.clip((1 - abs(x - drift)) * 1.4, 0, 1)
    fog = (.51 + .23 * np.sin(y * 43 + x * 12 + .8 * np.sin(y * 29))
           + .14 * np.sin(y * 171 - x * 42) + .09 * np.cos(y * 343 + x * 82))
    fine = np.zeros_like(x)
    core = np.zeros_like(x)
    for i, center in enumerate((-.68, -.45, -.22, -.053, .087, .254, .469, .70)):
        axis = center + drift * (.73 + i * .04) + np.sin(y * (41 + i * 3.7) + i * 1.45) * .072
        d = (x - axis) / (.016 + (i % 3) * .009)
        power = .41 + .48 * np.sin(y * (28 + i * 1.9) + .8 + i * 1.1) ** 2
        fine += np.exp(-d * d * .17) * power
        core += np.exp(-d * d * 1.7) * power ** 4
    fine, core = np.clip(fine, 0, 1), np.clip(core, 0, 1)
    density = np.clip(fog * edge * .64 + fine * .47 + core * .28, 0, .93)
    tone = np.clip(density * (.38 + fog * .5) + core * .45, 0, 1)
    rgb = np.stack((22 + tone * 156, 8 + tone * 76, 39 + tone * 181), axis=-1)
    alpha = 255 * edge * density
    pixels = np.dstack((rgb, alpha)).clip(0, 255).astype(np.uint8)
    output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(pixels, "RGBA").save(output, "WEBP", quality=88, method=6)


if __name__ == "__main__":
    args = argparse.ArgumentParser()
    args.add_argument("output", type=Path)
    bake(args.parse_args().output)
