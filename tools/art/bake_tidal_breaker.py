"""Bake four illustrated wave poses into a motion-compensated RGBA flipbook."""
from pathlib import Path

import numpy as np
from PIL import Image


ART = Path(__file__).resolve().parent
SOURCE = ART / "sources" / "tidal-breaker-poses.webp"
DEST = ART.parents[1] / "assets" / "vfx" / "nextgen" / "tidal-breaker.webp"
CELL = (480, 320)
SMALL = (120, 80)


def box_mean(a, radius):
    padded = np.pad(a, radius, mode="edge")
    integral = np.pad(padded, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    n = 2 * radius + 1
    return (integral[n:, n:] - integral[:-n, n:] -
            integral[n:, :-n] + integral[:-n, :-n]) / (n * n)


def displacements(first, second):
    """Estimate the local travel of each crest/foam cluster on a small grid."""
    def features(pose):
        pixels = np.asarray(pose.resize(SMALL, Image.Resampling.BOX), dtype=np.float32) / 255
        alpha = pixels[:, :, 3]
        luminance = pixels[:, :, :3] @ np.array([.21, .72, .07], dtype=np.float32)
        return np.stack((luminance, alpha * .73), axis=-1)

    a, b = features(first), features(second)
    y, x = np.indices(a.shape[:2])
    best = np.full(y.shape, np.inf)
    fx, fy = np.zeros_like(best), np.zeros_like(best)
    for dy in range(-12, 13, 2):
        for dx in range(-16, 17, 2):
            other = b[np.clip(y + dy, 0, y.shape[0]-1), np.clip(x + dx, 0, x.shape[1]-1)]
            error = box_mean(abs(other - a).mean(2), 4) + .00065 * (abs(dx) + abs(dy))
            win = error < best
            fx[win], fy[win], best[win] = dx, dy, error[win]
    def enlarge(flow):
        small = Image.fromarray(box_mean(flow, 2).astype(np.float32))
        return np.asarray(small.resize(CELL, Image.Resampling.BILINEAR)) * (CELL[0] / SMALL[0])
    return enlarge(fx), enlarge(fy)


def advect(rgba, flow, t, x, y):
    u = np.clip(x - flow[0] * t, 0, rgba.shape[1] - 1)
    v = np.clip(y - flow[1] * t, 0, rgba.shape[0] - 1)
    i, j = u.astype(int), v.astype(int)
    ii, jj = np.minimum(i + 1, rgba.shape[1] - 1), np.minimum(j + 1, rgba.shape[0] - 1)
    du, dv = (u-i)[:, :, None], (v-j)[:, :, None]
    return ((1-du) * rgba[j, i] + du * rgba[j, ii]) * (1-dv) + ((1-du) * rgba[jj, i] + du * rgba[jj, ii]) * dv


def bake():
    master = Image.open(SOURCE).convert("RGBA")
    halfw, halfh = master.width // 2, master.height // 2
    poses = []
    for i in range(4):
        x, y = (i % 2)*halfw, (i // 2)*halfh
        pose = master.crop((x, y, x+halfw, y+halfh)).convert("RGBa").resize(CELL, Image.Resampling.LANCZOS)
        poses.append(pose)
    atlas = Image.new("RGBA", (CELL[0]*4, CELL[1]*4))
    y, x = np.indices(CELL[::-1], dtype=np.float32)
    for row, a in enumerate(poses):
        b = poses[(row+1) % len(poses)]
        forward, back = displacements(a, b), displacements(b, a)
        pa, pb = np.asarray(a, dtype=np.float32), np.asarray(b, dtype=np.float32)
        for col in range(4):
            t = col / 4
            rgba = (1-t)*advect(pa, forward, t, x, y) + t*advect(pb, back, 1-t, x, y)
            rgb = rgba[:, :, :3] * 255 / np.maximum(rgba[:, :, 3:4], 1)
            rgba[:, :, :3] = rgb
            frame = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8))
            atlas.paste(frame, (col*CELL[0], row*CELL[1]))
    atlas.save(DEST, "WEBP", quality=88, method=6)
    print(f"{DEST.name}: {atlas.width} x {atlas.height}, 16 frames, {DEST.stat().st_size} bytes")


if __name__ == "__main__":
    bake()
