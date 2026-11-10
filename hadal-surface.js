"use strict";

const hadalWaterVertex = `#version 300 es
out vec2 uv;
void main() {
  uv = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(uv * 2. - 1., 0., 1.);
}`;

const hadalWaterFragment = `#version 300 es
precision highp float;
uniform sampler2D atlas;
uniform float age;
uniform float detail;
in vec2 uv;
out vec4 surface;

vec3 field(vec2 p, float frame) {
  vec2 local = (fract(p) * 93. + 1.5) / 96.;
  vec2 tile = vec2(mod(frame, 4.), 2. - floor(frame / 4.));
  return texture(atlas, (tile + local) / vec2(4.,3.)).rgb;
}

void main() {
  float roll = (sin(uv.y * 19. + age * 4.2) + sin(uv.y * 47. - age * 5.)) * .035;
  vec2 p = vec2(uv.x * 1.38 + roll, (1. - uv.y) * 2.8) + age * vec2(.18, -.09);
  float k = (1. - cos(age * 3.3)) * 5.499;
  float blend = fract(k);
  vec3 a = mix(field(p, floor(k)), field(p, ceil(k)), blend);
  vec3 b = field(p * 2.36 + vec2(.14, -.32), floor(k));
  vec2 slope = (a.rg - .5) * 1.62 + (b.rg - .5) * .62;
  vec3 n = normalize(vec3(slope, .42 + .63 * (1. - uv.x)));
  vec3 L = normalize(vec3(-.59, .43, .65));
  float specular = pow(max(dot(n, L), 0.), 7.);
  float glints = pow(max(dot(n, vec3(.27, .31, .91)), 0.), 26.);
  float crest = pow(clamp(1. - uv.x + roll, 0., 1.), .84);
  float foam = smoothstep(.32, .72, a.b * .79 + b.b * .28 + crest * .20);
  vec3 depths = mix(vec3(.029, .137, .26), vec3(.12, .65, .73), crest);
  vec3 light = depths + specular * vec3(.04,.40,.52) + glints * vec3(.08,.21,.27);
  light = mix(light, vec3(.72, .95, .97), foam * (.31 + crest * .58));
  float alpha = clamp((.07 + specular * .39 + foam * .48 + crest * .22) * detail, 0., .72);
  alpha *= smoothstep(0., .06, uv.x) * (1. - smoothstep(.78, 1., uv.x));
  surface = vec4(light, alpha);
}`;

let hadalWaterImage;
let hadalWaterDevice;
let hadalWaterUnavailable = false;

function canUseHadalWater() {
  return typeof visualQuality !== "undefined" && visualQuality.modelScale > 0
    && typeof location !== "undefined" && /^https?:$/.test(location.protocol);
}

function hadalWaterSetup() {
  if (!canUseHadalWater() || hadalWaterUnavailable) return null;
  if (hadalWaterDevice) return hadalWaterDevice;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const gl = canvas.getContext("webgl2", { alpha: true, depth: false, antialias: false,
    premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  if (!gl) {
    hadalWaterUnavailable = true;
    return null;
  }
  const renderer = gl.getExtension("WEBGL_debug_renderer_info");
  if (renderer && /swiftshader|llvmpipe|software rasterizer/i.test(gl.getParameter(renderer.UNMASKED_RENDERER_WEBGL))) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    hadalWaterUnavailable = true;
    return null;
  }
  const program = gl.createProgram();
  for (const [kind, source] of [[gl.VERTEX_SHADER, hadalWaterVertex], [gl.FRAGMENT_SHADER, hadalWaterFragment]]) {
    const shader = gl.createShader(kind);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    hadalWaterUnavailable = true;
    return null;
  }
  gl.useProgram(program);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hadalWaterImage);
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    hadalWaterUnavailable = true;
    hadalWaterDevice = null;
  });
  hadalWaterDevice = { canvas, gl, age: gl.getUniformLocation(program, "age"),
    detail: gl.getUniformLocation(program, "detail"), sample: NaN };
  return hadalWaterDevice;
}

function preloadHadalSurface() {
  if (!canUseHadalWater() || hadalWaterImage || typeof Image !== "function") return;
  hadalWaterImage = new Image();
  hadalWaterImage.onload = () => {
    window.requestIdleCallback?.(hadalWaterSetup, { timeout: 1500 });
  };
  hadalWaterImage.src = "assets/models/hadal-surface.png";
}

function drawHadalSurface(ctx, x, y, width, height, age, reverse = false) {
  if (!canUseHadalWater()) return;
  preloadHadalSurface();
  if (!hadalWaterImage?.complete || !hadalWaterImage.naturalWidth || height <= 0 || width <= 0) return;
  const device = hadalWaterSetup();
  if (!device) return;
  if (device.sample !== age) {
    const { gl } = device;
    gl.uniform1f(device.age, age);
    gl.uniform1f(device.detail, visualQuality.modelScale);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    device.sample = age;
  }
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = .83;
  if (reverse) { ctx.translate(x + width, y); ctx.scale(-1, 1); ctx.drawImage(device.canvas, 0, 0, width, height); }
  else ctx.drawImage(device.canvas, x, y, width, height);
  ctx.restore();
}
