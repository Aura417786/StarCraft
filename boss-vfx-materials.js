"use strict";

// Deterministic, cached density/height textures. Never consume gameplay RNG and
// never allocate or evaluate noise per particle or per rendered frame.
const bossVfxMaterialCache = new Map();
const bossVfxPalettes = {
  water: [[3, 21, 31], [24, 96, 118], [193, 238, 237]],
  magma: [[12, 7, 9], [69, 26, 13], [255, 178, 67]],
  spore: [[10, 20, 13], [59, 83, 26], [201, 225, 136]],
  void: [[10, 6, 20], [45, 23, 75], [165, 112, 223]],
  silk: [[16, 9, 28], [75, 48, 99], [204, 176, 231]],
  plasma: [[3, 17, 31], [21, 71, 110], [159, 230, 255]],
  nerve: [[23, 6, 20], [93, 30, 59], [246, 167, 197]],
  bone: [[24, 19, 16], [117, 95, 68], [239, 220, 185]],
  chitin: [[9, 19, 16], [36, 70, 50], [159, 197, 157]],
  glass: [[10, 23, 38], [42, 80, 113], [190, 229, 248]],
};

function bossVfxNoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const hash = (a, b) => {
    let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) + seed * 1013904223;
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967295;
  };
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

function bossVfxDensity(x, y, seed) {
  return bossVfxNoise(x, y, seed) * .53 + bossVfxNoise(x * 2.07 + 9, y * 2.07, seed + 7) * .27
    + bossVfxNoise(x * 4.13, y * 4.13 + 17, seed + 11) * .14
    + bossVfxNoise(x * 8.31 + 31, y * 8.31, seed + 23) * .06;
}

function getBossVfxMaterial(name) {
  if (bossVfxMaterialCache.has(name)) return bossVfxMaterialCache.get(name);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext?.("2d");
  const size = 256;
  canvas.width = canvas.height = size;
  const image = ctx?.createImageData?.(size, size);
  if (!image?.data) return null;
  const palette = bossVfxPalettes[name] || bossVfxPalettes.void;
  const seed = Object.keys(bossVfxPalettes).indexOf(name) + 13;
  const magma = name === "magma", water = name === "water";
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (x + .5 - size / 2) / (size * .47), ny = (y + .5 - size / 2) / (size * .47);
    const warp = bossVfxNoise(nx * 2.2 + 5, ny * 2.2 + 5, seed) - .5;
    const px = nx * (water ? 5.1 : 3.2) + warp * 1.5, py = ny * (water ? 2.8 : 3.7) - warp;
    const density = bossVfxDensity(px + 17, py + 31, seed);
    const radius = Math.hypot(nx, ny);
    // Irregular soft silhouette, with no opaque square edge when enlarged.
    const mask = Math.max(0, Math.min(1, (1 - radius + (density - .5) * .28) * 8));
    if (mask === 0) continue;
    const right = bossVfxDensity(px + 17.04, py + 31, seed);
    const down = bossVfxDensity(px + 17, py + 31.04, seed);
    const zx = nx * .55 + (density - right) * 9, zy = ny * .55 + (density - down) * 9;
    const zz = Math.sqrt(Math.max(.03, 1 - Math.min(.96, radius * radius)));
    const normal = Math.hypot(zx, zy, zz);
    const light = Math.max(0, (-zx * .46 - zy * .61 + zz * .64) / normal);
    const volume = Math.max(0, Math.min(1, density * .64 + light * .47 - .12));
    const crack = magma ? Math.max(0, 1 - Math.abs(density - .48) / .025) ** 2 : 0;
    const foam = water ? Math.max(0, (density - .60) * 5.5) * light : 0;
    const glow = Math.min(1, crack * .98 + foam * .80);
    const shadow = .5 + light * .5;
    const offset = (y * size + x) * 4;
    for (let channel = 0; channel < 3; channel++) {
      const body = (palette[0][channel] * (1 - volume) + palette[1][channel] * volume) * shadow;
      const specular = water ? light ** 18 * palette[2][channel] * .37 : 0;
      image.data[offset + channel] = Math.min(255, body * (1 - glow) + palette[2][channel] * glow + specular);
    }
    image.data[offset + 3] = Math.round(255 * mask * (magma ? .96 : Math.min(.94, .25 + density * .9)));
  }
  ctx.putImageData(image, 0, 0);
  bossVfxMaterialCache.set(name, canvas);
  return canvas;
}

function warmBossVfxMaterial(type) {
  const names = ["water", "bone", "magma", "silk", "chitin", "glass", "plasma", "spore", "void", "nerve"];
  const name = names[type];
  if (name) getBossVfxMaterial(name);
}
