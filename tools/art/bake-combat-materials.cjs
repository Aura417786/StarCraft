"use strict";
// Bake the runtime's deterministic fallback materials losslessly before shipping.
// Run from any directory with Node and Python/Pillow available.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const repo = path.resolve(__dirname, "../..");
const output = path.join(repo, "assets/vfx/materials");
fs.mkdirSync(output, { recursive: true });
const documentShim = {
  createElement() {
    const tile = {};
    tile.getContext = () => ({
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w*h*4) }),
      putImageData: image => { tile.pixels = image.data; }
    });
    return tile;
  }
};
const material = fs.readFileSync(path.join(repo, "boss-vfx-materials.js"), "utf8");
const raw = fs.readFileSync(path.join(repo, "nextgen-elemental-vfx.js"), "utf8");
const start = "return Object.freeze({ beginFrame, phase,";
if (raw.split(start).length !== 2) throw Error("Review the NextgenVfx export seam");
const elemental = raw.replace(start,
  "return Object.freeze({ waterNormalTexture, waterFoamTexture, basaltTexture, magmaTexture, sporeMistTexture, beginFrame, phase,");
const collect = `
const tiles = {};
for (const name of Object.keys(bossVfxPalettes)) tiles["organ-"+name] = getBossVfxMaterial(name);
for (const [label, method] of [["current","waterNormalTexture"], ["foam","waterFoamTexture"],
    ["basalt","basaltTexture"], ["melt","magmaTexture"], ["mist","sporeMistTexture"]]) tiles[label] = NextgenVfx[method]();
return tiles;`;
const render = new Function("document", "Image", material+"\n"+elemental+"\n"+collect);
const encodeAndVerify = `
import sys
from PIL import Image
w,h = map(int,sys.argv[1:3])
raw = sys.stdin.buffer.read()
im = Image.frombytes("RGBA",(w,h),raw)
im.save(sys.argv[3],format="WEBP",lossless=True,method=6,exact=True)
with Image.open(sys.argv[3]) as decoded:
    assert decoded.convert("RGBA").tobytes()==raw, sys.argv[3]
`;
for(const [name, tile] of Object.entries(render(documentShim, undefined))) {
  const dest = path.join(output,name+".webp");
  execFileSync("python", ["-c", encodeAndVerify, String(tile.width),String(tile.height),dest],
    {input:Buffer.from(tile.pixels),stdio:["pipe","inherit","inherit"]});
  console.log(name, tile.width, tile.height, fs.statSync(dest).size);
}
