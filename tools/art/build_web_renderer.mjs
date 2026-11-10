import path from "node:path";
import { createRequire } from "node:module";
import { copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../..");
const toolchain = path.resolve(process.argv[2] ?? directory);
const requireTool = createRequire(path.join(toolchain, "package.json"));
const { build } = requireTool("esbuild");
const source = `
export {
  WebGLRenderer, Scene, Group, OrthographicCamera, DirectionalLight, HemisphereLight, PointLight,
  AnimationMixer, Vector3, Color, Box3, AgXToneMapping, SRGBColorSpace,
  CanvasTexture, DataTexture, FloatType, RGBAFormat, LinearSRGBColorSpace, EquirectangularReflectionMapping, PMREMGenerator,
  Mesh, PlaneGeometry, ShaderMaterial, Vector2, NormalBlending
} from 'three';
export { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
`;
await build({
  stdin: { contents: source, sourcefile: "star-breaker-3d.js", resolveDir: toolchain },
  bundle: true, minify: true, format: "iife", globalName: "StarBreaker3D",
  target: ["es2022"], legalComments: "inline",
  outfile: path.join(root, "vendor/three-starbreaker.min.js")
});
await copyFile(path.join(toolchain, "node_modules/three/LICENSE"), path.join(root, "vendor/THREE-LICENSE.txt"));
