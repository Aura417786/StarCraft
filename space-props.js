"use strict";

// Compact original 3D meshes for near scenery and neutral cover. Gameplay keeps
// its authored cover bounds; this renderer only receives poses and materials.
const spacePropMeshes = new Map();
const spacePropCpuMeshes = new Map();
const spacePropLights = [
  [[.92, .98, 1], [.13, .24, .37]],
  [[1, .90, .73], [.20, .26, .32]],
  [[1, .82, .65], [.23, .23, .28]],
  [[.73, .91, 1], [.15, .24, .30]],
  [[.79, .70, 1], [.21, .17, .35]],
];
let spacePropDevice;

function spacePropNoise(index, seed) {
  const n = Math.sin(index * 127.1 + seed * 83.17) * 43758.5453;
  return n - Math.floor(n);
}
function spacePropUnit(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}
function spacePropNormal(a, b, c) {
  const x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2];
  const u = c[0] - a[0], v = c[1] - a[1], w = c[2] - a[2];
  return spacePropUnit(y * w - z * v, z * u - x * w, x * v - y * u);
}
function spacePropBuilder() {
  const data = [];
  return {
    data,
    triangle(a, b, c, paint, material = 1, origin = [0, 0, 0], inward = false, vertexNormals) {
      let normal = spacePropNormal(a, b, c);
      if (normal.every(value => value === 0)) return;
      const outward = normal.reduce((dot, value, axis) => dot + value * ((a[axis] + b[axis] + c[axis]) / 3 - origin[axis]), 0);
      if ((outward < 0) !== inward) { [b, c] = [c, b]; normal = normal.map(value => -value); }
      for (const point of [a, b, c]) {
        const n = vertexNormals?.get(point) ?? normal;
        data.push(...point, ...n, ...(typeof paint === "function" ? paint(point) : paint), material);
      }
    },
    quad(a, b, c, d, paint, material, origin, inward) {
      this.triangle(a, b, c, paint, material, origin, inward);
      this.triangle(a, c, d, paint, material, origin, inward);
    },
  };
}
function spacePropConnect(builder, rings, colors, material = 1, caps = [true, true], origin = [0, 0, 0], inward = false) {
  for (let row = 0; row < rings.length - 1; row++) {
    const first = rings[row], second = rings[row + 1];
    for (let i = 0; i < first.length; i++) {
      const j = (i + 1) % first.length;
      const base = colors[(row + (i % 3 === 0 ? 1 : 0)) % colors.length];
      builder.quad(first[i], first[j], second[j], second[i], base, material, origin, inward);
    }
  }
  for (let end = 0; end < 2; end++) {
    if (!caps[end]) continue;
    const ring = rings[end ? rings.length - 1 : 0];
    const center = ring.reduce((sum, point) => sum.map((value, axis) => value + point[axis] / ring.length), [0, 0, 0]);
    for (let i = 0; i < ring.length; i++) builder.triangle(center, ring[i], ring[(i + 1) % ring.length], colors[end % colors.length], material, origin, inward);
  }
}
function spacePropRings(sections, segments, offsetY = 0, offsetZ = 0, torn = 0) {
  return sections.map(([x, height, depth], row) => Array.from({ length: segments }, (_, index) => {
    const angle = (index + .5) / segments * Math.PI * 2;
    const edge = row === sections.length - 1 && torn ? (spacePropNoise(index + 4, torn) - .5) * .13 : 0;
    return [x + edge, offsetY + height * Math.sin(angle), offsetZ + depth * Math.cos(angle)];
  }));
}
function spacePropTube(builder, sections, count, colors, material, offsetY = 0, offsetZ = 0, torn = 0, caps) {
  const origin = [(sections[0][0] + sections.at(-1)[0]) / 2, offsetY, offsetZ];
  const rings = spacePropRings(sections, count, offsetY, offsetZ, torn);
  spacePropConnect(builder, rings, colors, material, caps, origin);
  return rings;
}
function spacePropStrut(builder, start, end, width, paint, material = 1) {
  const d = end.map((value, axis) => value - start[axis]);
  const side = Math.abs(d[0]) < Math.abs(d[1]) ? spacePropUnit(0, -d[2], d[1]) : spacePropUnit(-d[2], 0, d[0]);
  const other = spacePropUnit(d[1] * side[2] - d[2] * side[1], d[2] * side[0] - d[0] * side[2], d[0] * side[1] - d[1] * side[0]);
  const ring = center => [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([u, v]) => center.map((value, axis) => value + width * (side[axis] * u + other[axis] * v)));
  spacePropConnect(builder, [ring(start), ring(end)], [paint], material, undefined, start.map((value, axis) => (value + end[axis]) / 2));
}

function buildSpaceAsteroid(builder, seed, low) {
  const bands = low ? 8 : 18, segments = low ? 13 : 32;
  const rings = Array.from({ length: bands + 1 }, (_, row) => Array.from({ length: segments }, (_, column) => {
    const phi = Math.PI * row / bands, theta = Math.PI * 2 * column / segments;
    const x = Math.sin(phi) * Math.cos(theta), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(theta);
    const craterAxis = x * -.23 + y * .38 + z * .896;
    const secondAxis = x * .66 + y * .49 - z * .56;
    const trough = .29 * Math.max(0, (craterAxis - .76) / .24) ** 1.15
      + .16 * Math.max(0, (secondAxis - .80) / .20);
    const ridge = .084 * Math.sin(8 * x + 4 * z + seed) * Math.sin(7 * y - 3 * x)
      + .037 * Math.sin(14 * z + y * 9 + seed * .77) + .023 * Math.sin(27 * y + 16 * z - 24 * x);
    const radial = 1 + .18 * Math.sin(3.6 * x + 2 * y + seed * .7) * Math.cos(4.2 * z - y) + ridge - trough;
    const elongation = Math.sin(seed * 2.15) * .05;
    return [((.46 + elongation) * x + y * .06) * radial, ((.336 - elongation) * y + z * .055 - x * .057) * radial, z * .35 * radial];
  }));
  const normals = new Map();
  for (let row = 0; row <= bands; row++) for (let column = 0; column < segments; column++) {
    const point = rings[row][column];
    const before = rings[row][(column + segments - 1) % segments];
    const after = rings[row][(column + 1) % segments];
    const down = rings[Math.min(bands, row + 1)][column];
    const up = rings[Math.max(0, row - 1)][column];
    const normal = row === 0 || row === bands ? [0, row ? -1 : 1, 0] :
      spacePropNormal([0, 0, 0], after.map((v, i) => v - before[i]), down.map((v, i) => v - up[i]));
    normals.set(point, normal.reduce((dot, value, axis) => dot + value * point[axis], 0) < 0 ? normal.map(value => -value) : normal);
  }
  const stone = ([x, y, z]) => {
    const band = Math.sin(y * 34 + z * 12 + x * 14 + Math.sin(x * 11 - z * 20) * .8) * .030;
    const shelf = Math.sin(z * 17 + x * 9 - y * 21 + seed) * .04;
    return [.44 + band + shelf, .37 + band + shelf, .32 + band + shelf];
  };
  for (let row = 0; row < bands; row++) for (let column = 0; column < segments; column++) {
    const next = (column + 1) % segments;
    if (row) builder.triangle(rings[row][column], rings[row + 1][column], rings[row][next], stone, 0, undefined, false, normals);
    if (row + 1 < bands) builder.triangle(rings[row][next], rings[row + 1][column], rings[row + 1][next], stone, 0, undefined, false, normals);
  }
}

function buildSpaceMoon(builder, low) {
  const rings = low ? 10 : 24, segments = low ? 18 : 44;
  const globe = Array.from({ length: rings + 1 }, (_, latitude) => Array.from({ length: segments }, (_, longitude) => {
    const theta = longitude / segments * Math.PI * 2;
    const phi = latitude / rings * Math.PI;
    return [.54 * Math.cos(theta) * Math.sin(phi), .54 * Math.cos(phi), .54 * Math.sin(theta) * Math.sin(phi)];
  }));
  const normals = new Map(globe.flat().map(point => [point, point.map(value => value / .54)]));
  const pigment = ([x, y, z]) => {
    const band = Math.sin(y * 40 + 2 * Math.sin(x * 8 + z * 10));
    return [.27 + band * .08, .33 + band * .08, .44 + band * .06];
  };
  for (let row = 0; row < rings; row++) {
    for (let column = 0; column < segments; column++) {
      const next = (column + 1) % segments;
      if (row) builder.triangle(globe[row][column], globe[row + 1][column], globe[row][next], pigment, 3, undefined, false, normals);
      if (row + 1 < rings) builder.triangle(globe[row][next], globe[row + 1][column], globe[row + 1][next], pigment, 3, undefined, false, normals);
    }
  }
}

function buildSpaceWreck(builder, seed, low) {
  const armor = [[.24, .29, .32], [.17, .22, .27], [.32, .35, .36], [.24, .27, .30]];
  const interior = [[.088, .10, .11], [.24, .16, .13], [.13, .15, .17]];
  const segments = low ? 8 : 14;
  const outer = spacePropRings([[-.51, .082, .11], [-.39, .151, .186], [-.29, .209, .229],
    [-.10, .225, .22], [.12, .26, .255], [.32, .222, .19], [.43, .207, .18]], segments, 0, 0, seed);
  const inside = spacePropRings([[-.34, .089, .10], [.15, .202, .199], [.31, .180, .151], [.41, .178, .15]], segments, 0, 0, seed);
  const armorOrigin = [0, 0, 0];
  const fracture = Math.floor(spacePropNoise(10, seed) * segments);
  const panel = (a, b, c, d, u, v, raised = 0) => a.map((value, axis) => {
    const along = value + (b[axis] - value) * u;
    const inner = c[axis] + (d[axis] - c[axis]) * u;
    return (along + (inner - along) * v) * (axis ? 1 + raised : 1);
  });
  for (let row = 0; row < outer.length - 1; row++) {
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      const a = outer[row][i], b = outer[row + 1][i], c = outer[row][j], d = outer[row + 1][j];
      const gap = row >= 4 && (i - fracture + segments) % segments < (row === 4 ? 1 : 3);
      if (gap) continue;
      const paint = armor[(row + (i % 4 === 0 ? 1 : 0)) % armor.length];
      builder.quad(a, b, d, c, paint, 1, armorOrigin);
      if (row <= 1 || (low && i % 2)) continue;
      const edge = row === 5 ? .68 + spacePropNoise(i + 9, seed) * .25 : .92;
      const q1 = panel(a, b, c, d, .14, .13, .055), q2 = panel(a, b, c, d, edge, .13, .055);
      const q3 = panel(a, b, c, d, edge, .84, .055), q4 = panel(a, b, c, d, .14, .84, .055);
      builder.quad(q1, q2, q3, q4, armor[(row + i + 1) % armor.length], 1, armorOrigin);
      if (low) continue;
      spacePropStrut(builder, panel(a, b, c, d, .17, .11, .057), panel(a, b, c, d, .17, .89, .057), .0053, armor[i % 3 === 0 ? 2 : 0]);
      if ((i + row) % 3 === 0) spacePropStrut(builder, panel(a, b, c, d, .30, .25, .065),
        panel(a, b, c, d, .50, .25, .065), .004, [.44, .28, .19]);
    }
  }
  spacePropConnect(builder, inside, interior, 1, [true, false], [0, 0, 0], true);
  const lip = outer.at(-1), cavity = inside.at(-1);
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    if ((i - fracture + segments) % segments >= 3)
      builder.quad(lip[i], lip[j], cavity[j], cavity[i], interior[i % interior.length], 1, armorOrigin);
    if ((i + seed) % (low ? 3 : 2) === 0) {
      const root = lip[i], inner = cavity[i];
      const torn = [.47 + .15 * spacePropNoise(i + 1, seed), root[1] * 1.21, root[2] * 1.19];
      const split = [.41, inner[1] * 1.13, inner[2] * .94];
      spacePropStrut(builder, inner, split, .009 + .009 * spacePropNoise(i, seed + 7), interior[1]);
      spacePropStrut(builder, split, torn, .007 + .012 * spacePropNoise(i + 5, seed), armor[(i + 1) % armor.length]);
      if (!low && i % 3 === 0) spacePropStrut(builder, split, [.51, root[1] * .80, root[2] * 1.24], .006, [.29, .16, .10]);
    }
  }
  for (const y of [-.195, .193]) {
    spacePropTube(builder, [[-.40, .027, .034], [-.32, .044, .052], [.041, .050, .053], [.17, .026, .038]], 6, armor, 1, y, .172);
    const truss = [.37, y * .93, .12];
    spacePropStrut(builder, [-.30, y, .20], truss, .016, interior[2]);
    spacePropStrut(builder, [-.20, y * .67, .27], [.21, y * 1.23, .19], .010, armor[2]);
    if (!low) {
      for (let i = 0; i < 5; i++) {
        const x = -.25 + i * .11;
        spacePropStrut(builder, [x, y, .19], [x + .045, y * 1.22, .272], .009, armor[i % 3]);
      }
      spacePropStrut(builder, truss, [.53, y * 1.12, .17], .011, [.40, .22, .12]);
      spacePropStrut(builder, [.53, y * 1.12, .17], [.62, y * .88, .13], .007, [.37, .20, .10]);
    }
  }
  spacePropTube(builder, [[-.47, .10, .129], [-.40, .123, .144], [-.34, .107, .130]], segments, interior, 1, 0, 0, 0, [true, false]);
  for (const x of [-.27, -.07, .13]) {
    spacePropStrut(builder, [x, -.06, .245], [x + .037, -.06, .245], .0045, [.39, .24, .12], 2);
  }
}

function buildSpaceCanister(builder, low) {
  const casePaint = [[.22, .33, .34], [.39, .48, .48], [.14, .23, .26]];
  const crystal = [[.11, .62, .50], [.19, .44, .40], [.13, .55, .46]];
  const trim = [[.48, .51, .40], [.28, .33, .32]];
  const segments = low ? 8 : 12;
  spacePropTube(builder, [[-.37, .13, .13], [-.29, .234, .20], [.28, .234, .20], [.37, .128, .13]], segments, crystal, 2);
  for (const side of [-1, 1]) {
    const center = side * .35;
    spacePropTube(builder, [[center - .07, .19, .17], [center - .052, .254, .21], [center + .046, .254, .21], [center + .07, .18, .15]], segments, trim, 1);
  }
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3, y = Math.sin(a) * .22, z = Math.cos(a) * .185;
    spacePropStrut(builder, [-.31, y, z], [.32, y, z], .017, casePaint[i % casePaint.length]);
  }
}

function buildSpaceTransport(builder, low) {
  const hull = [[.40, .47, .51], [.26, .32, .37], [.52, .53, .47], [.31, .38, .41]];
  const cargo = [[.62, .46, .28], [.39, .29, .20], [.51, .36, .23]];
  spacePropTube(builder, [[-.48, .075, .08], [-.37, .18, .13], [-.24, .19, .20], [.30, .18, .18], [.47, .12, .14]], 8, hull, 1);
  for (const y of [-.20, .20]) {
    spacePropTube(builder, [[-.28, .066, .091], [-.22, .102, .12], [.29, .100, .12], [.39, .080, .10]], 8, cargo, 1, y, .065);
    spacePropTube(builder, [[.36, .074, .071], [.48, .07, .070]], 8, hull, 1, y, -.045, 0, [true, false]);
    spacePropTube(builder, [[.47, .039, .039], [.491, .052, .052]], 8, [[.90, .51, .17]], 2, y, -.045);
    if (!low) for (let i = 0; i < 4; i++) {
      const x = -.18 + i * .13;
      spacePropStrut(builder, [x, y - .092, .155], [x, y + .085, .165], .010, hull[i]);
      spacePropStrut(builder, [x + .018, y, .182], [x + .061, y, .182], .006, [.55, .40, .14], 2);
    }
  }
  spacePropStrut(builder, [-.385, -.053, .124], [-.31, .053, .149], .022, [.18, .56, .57], 2);
}

function spacePropMesh(kind, variant, low = false) {
  const cache = low ? spacePropCpuMeshes : spacePropMeshes;
  const key = `${kind}:${variant}`;
  if (cache.has(key)) return cache.get(key);
  const builder = spacePropBuilder(), seed = variant + 2;
  if (kind === "rock") buildSpaceAsteroid(builder, seed, low);
  else if (kind === "moon") buildSpaceMoon(builder, low);
  else if (kind === "wreck") buildSpaceWreck(builder, seed, low);
  else if (kind === "cell") buildSpaceCanister(builder, low);
  else buildSpaceTransport(builder, low);
  const mesh = { data: new Float32Array(builder.data), buffer: null };
  cache.set(key, mesh);
  return mesh;
}
function spacePropRotation(pitch, yaw, roll) {
  const cx = Math.cos(pitch), sx = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cz = Math.cos(roll), sz = Math.sin(roll);
  return [cz * cy, sz * cy, -sy, cz * sy * sx - sz * cx, sz * sy * sx + cz * cx, cy * sx,
    cz * sy * cx + sz * sx, sz * sy * cx - cz * sx, cy * cx];
}

const spacePropVertex = `
attribute vec3 position;
attribute vec3 normal;
attribute vec4 material;
uniform mediump mat3 pose;
uniform vec2 extent;
varying mediump vec3 surface;
varying mediump vec3 facing;
varying mediump vec3 surfaceNormal;
varying mediump vec4 finish;
void main() {
  vec3 p = pose * position;
  gl_Position = vec4(p.xy * extent, -p.z * .55, 1.0 - p.z * .27);
  surface = position;
  facing = pose * normal;
  surfaceNormal = normal;
  finish = material;
}`;
const spacePropFragment = `
precision mediump float;
varying vec3 surface;
varying vec3 facing;
varying vec3 surfaceNormal;
varying vec4 finish;
uniform mat3 pose;
uniform vec3 keyTint;
uniform vec3 bounceTint;
uniform vec2 environment;
uniform sampler2D detailAtlas;
float hash(vec3 p) {
  p = fract(p * .3183099 + vec3(.17, .31, .43)) * 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 p) {
  vec3 i = floor(p), u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), u.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), u.x), u.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), u.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), u.x), u.y), u.z);
}
float materialSample(vec2 p, float rock) {
  vec2 mirror = 1.0 - abs(fract(p * .5) * 2.0 - 1.0);
  return texture2D(detailAtlas, vec2(.009 + mirror.x * .982, .509 - rock * .5 + mirror.y * .482)).r;
}
float materialDetail(vec3 p, float rock) {
  vec3 weights = pow(abs(normalize(surfaceNormal)), vec3(5.0));
  weights /= weights.x + weights.y + weights.z;
  vec3 samples = vec3(materialSample(p.zy + vec2(.31,.57), rock), materialSample(p.xz + vec2(.73,.23), rock),
    materialSample(p.xy + vec2(.56,.33), rock));
  return dot(samples, weights) - .5;
}
void main() {
  vec3 p = surface;
  if (finish.a > 2.5) {
    vec3 n = normalize(facing);
    float day = smoothstep(-.22, .9, dot(n, normalize(vec3(-.77, .32, .54))));
    float weather = noise(vec3(p.x * 7.0, p.y * 22.0, p.z * 7.0));
    float bands = .5 + .5 * sin(p.y * 44.0 + weather * 3.4 + sin(p.x * 7.0 + p.z * 5.0));
    float wisps = noise(p * vec3(21.0, 51.0, 21.0) + weather * .6);
    float haze = smoothstep(.28, .82, bands * .40 + weather * .44 + wisps * .19);
    vec3 tint = mix(vec3(.16,.25,.38), vec3(.60,.64,.69), haze);
    float atmosphere = pow(1.0 - max(0.0, n.z), 4.0);
    vec3 globe = tint * (.065 + day * .62) + vec3(.16,.30,.45) * atmosphere * (.14 + day * .45);
    gl_FragColor = vec4(globe, 1.0);
    return;
  }
  float rock = 1.0 - step(.5, finish.a);
  float emit = step(1.5, finish.a);
  float large = noise(p * 9.0), grain = noise(p * 53.0), fine = hash(floor(p * 241.0));
  float stratum = .5 + .5 * sin((p.y + p.z * .24 + (large - .5) * .11) * 103.0);
  float seam = smoothstep(.78, .98, stratum) * smoothstep(.35, .65, large);
  float scratches = smoothstep(.70, .90, noise(p * vec3(11.0, 184.0, 140.0)));
  float stone = noise(p * 24.0 + (large - .5) * .61), rubble = noise(p * 88.0);
  float textureValue = materialDetail(p * mix(vec3(1.65, 2.95, 2.75), vec3(1.42), rock), rock);
  float fracture = abs(stone - .49);
  float fissure = (1.0 - smoothstep(.015, .052, fracture)) * smoothstep(.41, .65, large);
  float lip = smoothstep(.038, .085, fracture) * (1.0 - smoothstep(.087, .13, fracture)) * smoothstep(.45, .69, large);
  vec3 detail = pose * vec3(grain - .5 + textureValue * .42, (fine - .5) * .50, stone - .5 - textureValue * .46);
  vec3 n = normalize(facing + detail * mix(.20, .51, rock));
  vec3 l = normalize(vec3(-.43, .69, .59));
  vec3 v = vec3(0, 0, 1);
  float key = max(0.0, dot(n, l));
  float fill = max(0.0, dot(n, normalize(vec3(.63, -.30, .31))));
  float rim = pow(1.0 - max(0.0, n.z), 3.0) * max(0.0, dot(n, normalize(vec3(-.48, .63, .04))));
  float gloss = pow(max(0.0, dot(n, normalize(l + v))), mix(19.0, 6.0, rock)) * mix(.31, .055, rock);
  vec3 shade = finish.rgb * (.22 + keyTint * key * .86 + bounceTint * fill * .72);
  shade *= mix(.68 + large * .36 + grain * .12 - scratches * .22 + textureValue * 1.93,
    .51 + large * .42 + grain * .16 + rubble * .16 + fine * .07 - seam * .19 - fissure * .18 + lip * .12 + textureValue * 2.39, rock);
  shade += gloss * keyTint * (.55 + grain * .55 + textureValue * .7);
  // Metallic edges take on the local key instead of an artificial blue edge.
  vec3 edgeTint = mix(keyTint * vec3(.48, .43, .39), vec3(.44, .56, .63), rock);
  shade += edgeTint * (rim * mix(.16, .13, rock) + fill * .11);
  shade += vec3(.10,.039,.013) * smoothstep(.56, .83, large * .82 + grain * .18) * (1.0 - rock) * key;
  shade += finish.rgb * emit * (.42 + large * .3);
  shade = mix(shade, bounceTint * .68, environment.x);
  shade = mix(shade, vec3(.95, .87, .69), environment.y * .48);
  gl_FragColor = vec4(clamp(shade, 0.0, 1.0), 1.0);
}`;

function loadSpacePropDetail(gl, uniform) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.uniform1i(uniform, 0);
  const atlas = new Image();
  atlas.decoding = "async";
  atlas.onload = () => {
    if (gl.isContextLost()) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.generateMipmap(gl.TEXTURE_2D);
  };
  atlas.src = "assets/scenery/prop-material-detail.webp";
  return atlas;
}

function spacePropGraphics() {
  if (spacePropDevice !== undefined) return spacePropDevice;
  spacePropDevice = null;
  if (typeof document.createElement !== "function") return null;
  try {
    const surface = document.createElement("canvas");
    surface.width = surface.height = 416;
    const gl = surface.getContext("webgl", { alpha: true, antialias: true, depth: true, premultipliedAlpha: true, failIfMajorPerformanceCaveat: true });
    if (!gl || typeof gl.createShader !== "function") return null;
    const diagnostics = gl.getExtension("WEBGL_debug_renderer_info");
    if (diagnostics && /swiftshader|llvmpipe|software rasterizer/i.test(gl.getParameter(diagnostics.UNMASKED_RENDERER_WEBGL))) {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return null;
    }
    const shaders = [];
    const program = gl.createProgram();
    for (const [kind, source] of [[gl.VERTEX_SHADER, spacePropVertex], [gl.FRAGMENT_SHADER, spacePropFragment]]) {
      const shader = gl.createShader(kind);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      shaders.push(shader); gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return null; }
    gl.useProgram(program);
    const attributes = ["position", "normal", "material"].map(name => gl.getAttribLocation(program, name));
    for (const attribute of attributes) gl.enableVertexAttribArray(attribute);
    const uniforms = Object.fromEntries(["pose", "extent", "keyTint", "bounceTint", "environment"].map(name => [name, gl.getUniformLocation(program, name)]));
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 0);
    surface.addEventListener("webglcontextlost", () => { spacePropDevice = null; });
    const detail = loadSpacePropDetail(gl, gl.getUniformLocation(program, "detailAtlas"));
    spacePropDevice = { gl, surface, attributes, uniforms, detail };
  } catch { /* The same meshes retain a lighted Canvas fallback. */ }
  return spacePropDevice;
}

function spacePropRenderGpu(device, mesh, matrix, pose, key, bounce, resolution) {
  const { gl, uniforms, attributes, surface } = device;
  if (!mesh.buffer) {
    mesh.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.data, gl.STATIC_DRAW);
  } else gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
  gl.viewport(0, surface.height - resolution, resolution, resolution);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.vertexAttribPointer(attributes[0], 3, gl.FLOAT, false, 40, 0);
  gl.vertexAttribPointer(attributes[1], 3, gl.FLOAT, false, 40, 12);
  gl.vertexAttribPointer(attributes[2], 4, gl.FLOAT, false, 40, 24);
  gl.uniformMatrix3fv(uniforms.pose, false, matrix);
  gl.uniform2f(uniforms.extent, 1.7, 1.7);
  gl.uniform3fv(uniforms.keyTint, key); gl.uniform3fv(uniforms.bounceTint, bounce);
  gl.uniform2f(uniforms.environment, pose.haze || 0, pose.flash || 0);
  gl.drawArrays(gl.TRIANGLES, 0, mesh.data.length / 10);
}

function spacePropRenderCanvas(ctx, mesh, matrix, pose, key, bounce) {
  const m = matrix, data = mesh.data, faces = [];
  const softness = 1 - (pose.haze || 0) * .38, flash = (pose.flash || 0) * .34;
  const vertexColor = (i, material) => {
    const nx = data[i + 3], ny = data[i + 4], nz = data[i + 5];
    const x = m[0] * nx + m[3] * ny + m[6] * nz;
    const y = m[1] * nx + m[4] * ny + m[7] * nz;
    const z = m[2] * nx + m[5] * ny + m[8] * nz;
    const diffuse = Math.max(0, -.43 * x + .69 * y + .59 * z) * .87;
    const fill = Math.max(0, .72 * x - .55 * y + .33 * z) * .32;
    const gloss = Math.max(0, -.24 * x + .40 * y + .885 * z) ** (material ? 18 : 6) * (material ? .18 : .045);
    const emission = material === 2 ? .43 : 0;
    return key.map((channel, j) => Math.round(Math.min(255,
      (data[i + 6 + j] * (.24 + diffuse * channel + fill * bounce[j] + emission) + gloss * channel) * 255 * softness + flash * 255)));
  };
  for (let i = 0; i < data.length; i += 30) {
    const vertices = [i, i + 10, i + 20].map(at => {
      const x = data[at], y = data[at + 1], z = data[at + 2];
      const depth = m[2] * x + m[5] * y + m[8] * z;
      const perspective = .85 / (1 - depth * .27);
      return [(m[0] * x + m[3] * y + m[6] * z) * perspective * pose.width,
        -(m[1] * x + m[4] * y + m[7] * z) * perspective * pose.height, depth];
    });
    const [a, b, c] = vertices;
    const area = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
    if (area <= 0) continue;
    const material = data[i + 9];
    const colors = (!material && area > 8 ? [i, i + 10, i + 20] : [i]).map(at => vertexColor(at, material));
    faces.push({ vertices, depth: (a[2] + b[2] + c[2]) / 3, colors });
  }
  faces.sort((a, b) => a.depth - b.depth);
  ctx.translate(pose.x, pose.y);
  ctx.lineWidth = .52;
  for (const face of faces) {
    const [a, b, c] = face.vertices;
    let color = `rgb(${face.colors[0].join(",")})`;
    if (face.colors.length > 1) {
      const shadeOrder = face.colors.map((rgb, index) => ({ rgb, index })).sort((a, b) => a.rgb[1] - b.rgb[1]);
      if (shadeOrder[2].rgb[1] - shadeOrder[0].rgb[1] > 5) {
        const from = face.vertices[shadeOrder[0].index], to = face.vertices[shadeOrder[2].index];
        const gradient = ctx.createLinearGradient(from[0], from[1], to[0], to[1]);
        gradient.addColorStop(0, `rgb(${shadeOrder[0].rgb.join(",")})`);
        gradient.addColorStop(1, `rgb(${shadeOrder[2].rgb.join(",")})`);
        color = gradient;
      }
    }
    ctx.fillStyle = ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

function drawSpaceProp(ctx, kind, pose) {
  if (pose.alpha <= 0 || pose.width <= 0 || pose.height <= 0) return;
  const variant = kind === "rock" || kind === "wreck" ? ((pose.variant || 0) % 4 + 4) % 4 : 0;
  const matrix = spacePropRotation(pose.pitch || 0, pose.yaw || 0, pose.roll || 0);
  const sector = pose.sector ?? battlefieldState.sector;
  const [key, bounce] = spacePropLights[sector] || spacePropLights[0];
  const device = spacePropGraphics();
  ctx.save();
  ctx.globalAlpha *= pose.alpha;
  if (device) {
    const budget = typeof visualQuality === "undefined" ? null : visualQuality;
    const resolution = Math.min(device.surface.width,
      Math.max(48, Math.round(Math.max(pose.width, pose.height) * (budget?.propScale ?? .78))));
    spacePropRenderGpu(device, spacePropMesh(kind, variant, budget?.meshDetail === 0), matrix, pose, key, bounce, resolution);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const x = pose.x - pose.width / 2, y = pose.y - pose.height / 2;
    if (pose.streak && budget?.meshDetail !== 0) {
      const alpha = ctx.globalAlpha;
      ctx.globalAlpha *= .12;
      ctx.drawImage(device.surface, 0, 0, resolution, resolution, x + pose.streak, y, pose.width, pose.height);
      ctx.globalAlpha = alpha;
    }
    ctx.drawImage(device.surface, 0, 0, resolution, resolution, x, y, pose.width, pose.height);
  } else spacePropRenderCanvas(ctx, spacePropMesh(kind, variant, true), matrix, pose, key, bounce);
  ctx.restore();
}
