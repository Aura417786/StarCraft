# Rebuild the compressed Boss models

Use the uncompressed `assets/models` from the `v23-rc1` Git tag or the matching archived build as the input directory. Install the pinned offline tools and give the compressor separate input and output directories.

```powershell
npm ci --prefix tools/art/model-compression
node tools/art/model-compression/pack-models.mjs ../original-models ../packed-models
```

To encode individual models, append their filenames after the output directory. The final JSON line for each model reports its input and output sizes, texture dimensions, and codec choices. The 22 compressed files total 30,767,176 bytes, down from 112,272,368 bytes.

The packer applies Meshopt to packed vertex, index, morph target and animation data. It verifies the decoded bytes before writing each model. Normal and material maps use UASTC with Zstandard, while base color and emissive maps use ETC1S. Texture dimensions are capped at 1024 for base color and 512 for the other maps. All textures include mipmaps.

The game loads these files with the Meshopt decoder and KTX2 transcoder in the bundled Three.js renderer. Both run from the game's own assets. See `../build_web_renderer.mjs` for the runtime bundle.
