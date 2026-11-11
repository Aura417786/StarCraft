import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { encodeToKTX2 } from 'ktx2-encoder';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const meshopt = 'EXT_meshopt_compression';
const basis = 'KHR_texture_basisu';
const jsonChunk = 0x4E4F534A;
const binChunk = 0x004E4942;
const align4 = (size) => Math.ceil(size / 4) * 4;
const components = { SCALAR: 1, VEC2: 2, VEC3: 3 };

function readGlb(file) {
  assert.equal(file.readUInt32LE(0), 0x46546C67, 'Expected GLB magic');
  assert.equal(file.readUInt32LE(4), 2, 'Expected GLB version 2');
  assert.equal(file.readUInt32LE(8), file.length, 'Invalid GLB length');
  const jsonEnd = 20 + file.readUInt32LE(12);
  assert.equal(file.readUInt32LE(16), jsonChunk);
  assert.equal(file.readUInt32LE(jsonEnd + 4), binChunk);
  assert.equal(jsonEnd + 8 + file.readUInt32LE(jsonEnd), file.length);
  return {
    gltf: JSON.parse(file.subarray(20, jsonEnd)),
    bin: file.subarray(jsonEnd + 8)
  };
}

function writeGlb(gltf, bin) {
  const json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonLength = align4(json.length);
  const binLength = align4(bin.length);
  const file = Buffer.alloc(28 + jsonLength + binLength);
  file.writeUInt32LE(0x46546C67, 0);
  file.writeUInt32LE(2, 4);
  file.writeUInt32LE(file.length, 8);
  file.writeUInt32LE(jsonLength, 12);
  file.writeUInt32LE(jsonChunk, 16);
  file.fill(0x20, 20, 20 + jsonLength);
  json.copy(file, 20);
  file.writeUInt32LE(binLength, 20 + jsonLength);
  file.writeUInt32LE(binChunk, 24 + jsonLength);
  bin.copy(file, 28 + jsonLength);
  return file;
}

async function encodeTexture(image, source) {
  const isNormalMap = image.name.endsWith('-Normal');
  const isColor = image.name === 'Albedo' || image.name.endsWith('-Emission');
  const maxTextureSize = image.name === 'Albedo' ? 1024 : 512;
  assert.ok(isColor || isNormalMap || image.name.endsWith('-ORM'), `Unknown texture role: ${image.name}`);
  const metadata = await sharp(source).metadata();
  assert.equal(metadata.width % 4, 0, 'Basis textures require widths divisible by 4');
  assert.equal(metadata.height % 4, 0, 'Basis textures require heights divisible by 4');
  const data = await encodeToKTX2(source, {
    imageDecoder: async (buffer) => {
      const { data: rgba, info } = await sharp(buffer)
        .resize({ width: maxTextureSize, height: maxTextureSize, fit: 'inside', withoutEnlargement: true })
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return { data: rgba, width: info.width, height: info.height };
    },
    isKTX2File: true,
    isUASTC: !isColor,
    isPerceptual: isColor,
    isSetKTX2SRGBTransferFunc: isColor,
    isNormalMap,
    generateMipmap: true,
    qualityLevel: 235,
    compressionLevel: 2,
    uastcLDRQualityLevel: 1,
    needSupercompression: !isColor,
    enableRDO: !isColor,
    rdoQualityLevel: isNormalMap ? 1.0 : 1.8
  });
  assert.ok(data.length > 80, `No KTX2 data returned for ${image.name}`);
  const header = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = header.getUint32(20, true);
  const height = header.getUint32(24, true);
  assert.ok(width > 0 && width % 4 === 0 && height > 0 && height % 4 === 0, 'Invalid KTX2 dimensions for glTF');
  return {
    data,
    metrics: {
      image: image.name,
      codec: isColor ? 'ETC1S' : 'UASTC',
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      width,
      height,
      sourceBytes: source.length,
      outputBytes: data.length
    }
  };
}

function compressGeometry(view, accessors, source) {
  // The Blender export stores each attribute, index and animation accessor
  // in its own packed view. Reject new layouts instead of guessing a stride.
  assert.equal(accessors.length, 1, 'Expected exactly one packed accessor');
  const accessor = accessors[0];
  assert.ok(!accessor.sparse && !accessor.byteOffset);
  const isIndex = view.target === 34963;
  const stride = isIndex ? 2 : components[accessor.type] * 4;
  assert.equal(accessor.componentType, isIndex ? 5123 : 5126);
  assert.ok(!isIndex || accessor.type === 'SCALAR');
  assert.ok(!view.byteStride || view.byteStride === stride);
  assert.equal(source.length, accessor.count * stride);
  const mode = isIndex ? 'INDICES' : 'ATTRIBUTES';
  const encoded = MeshoptEncoder.encodeGltfBuffer(source, accessor.count, stride, mode, 0);
  const decoded = Buffer.alloc(source.length);
  MeshoptDecoder.decodeGltfBuffer(decoded, accessor.count, stride, encoded, mode);
  assert.ok(decoded.equals(source), 'Geometry or animation changed after meshopt round trip');
  return { encoded, mode, stride, count: accessor.count };
}

async function compressModel(file) {
  const { gltf, bin } = readGlb(file);
  assert.equal(gltf.buffers.length, 1);
  assert.ok(!gltf.buffers[0].uri, 'Expected an embedded BIN buffer');
  assert.ok(!gltf.extensionsUsed?.length, 'Expected the original Blender export');
  const imageViews = new Map(gltf.images.map((image) => [image.bufferView, image]));
  const chunks = [];
  const textures = [];
  let length = 0;
  let fallbackLength = 0;
  let packedGeometryBytes = 0;
  function append(bytes) {
    const offset = length;
    chunks.push(bytes);
    const padding = align4(bytes.length) - bytes.length;
    if (padding) chunks.push(Buffer.alloc(padding));
    length += bytes.length + padding;
    return offset;
  }
  for (const [index, view] of gltf.bufferViews.entries()) {
    assert.equal(view.buffer, 0);
    const offset = view.byteOffset ?? 0;
    const source = bin.subarray(offset, offset + view.byteLength);
    assert.equal(source.length, view.byteLength);
    const image = imageViews.get(index);
    if (image) {
      const { data, metrics } = await encodeTexture(image, source);
      image.mimeType = 'image/ktx2';
      view.byteOffset = append(data);
      view.byteLength = data.length;
      textures.push(metrics);
      continue;
    }
    const accessors = gltf.accessors.filter((accessor) => accessor.bufferView === index);
    const { encoded, mode, stride, count } = compressGeometry(view, accessors, source);
    if (encoded.length >= source.length) {
      view.byteOffset = append(source);
      packedGeometryBytes += source.length;
      continue;
    }
    view.extensions = {
      [meshopt]: { buffer: 0, byteOffset: append(encoded), byteLength: encoded.length, byteStride: stride, count, mode }
    };
    view.buffer = 1;
    view.byteOffset = fallbackLength;
    fallbackLength += align4(view.byteLength);
    packedGeometryBytes += encoded.length;
  }
  for (const texture of gltf.textures) {
    assert.equal(typeof texture.source, 'number');
    texture.extensions = { [basis]: { source: texture.source } };
    delete texture.source;
  }
  assert.ok(fallbackLength > 0, 'Expected compressible geometry');
  gltf.buffers = [
    { byteLength: length },
    { byteLength: fallbackLength, extensions: { [meshopt]: { fallback: true } } }
  ];
  gltf.extensionsUsed = [meshopt, basis];
  gltf.extensionsRequired = [meshopt, basis];
  const output = writeGlb(gltf, Buffer.concat(chunks, length));
  assert.ok(output.length < file.length, 'Packed model exceeds original size');
  return { output, metrics: { sourceBytes: file.length, outputBytes: output.length, packedGeometryBytes, textures } };
}

const [, , sourceArgument, outputArgument, ...requested] = process.argv;
assert.ok(sourceArgument && outputArgument, 'Usage: node pack-models.mjs <original-model-directory> <new-model-directory> [file.glb ...]');
const sourceDir = await realpath(resolve(sourceArgument));
await mkdir(resolve(outputArgument), { recursive: true });
const outputDir = await realpath(resolve(outputArgument));
assert.notEqual(outputDir.toLowerCase(), sourceDir.toLowerCase(), 'Source directory must remain intact');
const names = requested.length ? requested : (await readdir(sourceDir)).filter((name) => name.endsWith('.glb')).sort();
assert.ok(names.length > 0, 'No GLB files found');
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
for (const name of names) {
  assert.ok(basename(name) === name && name.endsWith('.glb'), `Expected an individual .glb filename: ${name}`);
  const { output, metrics } = await compressModel(await readFile(join(sourceDir, name)));
  await writeFile(join(outputDir, name), output);
  console.log(JSON.stringify({ file: name, ...metrics }));
}
