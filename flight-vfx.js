"use strict";

const flightVfxTau = Math.PI * 2;
const flightVfxSpectrum = ["#9de4f1", "#efbe90", "#c9a3d8", "#86baf8", "#f5b6c7"];
const flightWakeColors = { red: "#ff8058", blue: "#71d8ff", yellow: "#ffd47c" };
const flightProjectileShapes = new Map();
const flightProjectileGlows = new Map();
const flightDustAlpha = [.16, .28, .52];
const flightSkyArcs = [
  { y: .81, arc: -.40, lean: -.15, color: "#9cd4ec" },
  { y: .79, arc: -.31, lean: .19, color: "#e6b790" },
  { y: .14, arc: .32, lean: -.13, color: "#cbb9f0" },
  { y: .82, arc: -.41, lean: .23, color: "#a9e3ff" },
  { y: .25, arc: .52, lean: -.29, color: "#f0b8ad" },
];

function flightVfxNoise(index) {
  let n = Math.imul(index + 137, 0x85ebca6b);
  n = Math.imul(n ^ n >>> 13, 0xc2b2ae35);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
}

const flightVfxDust = Array.from({ length: 182 }, (_, i) => {
  const z = flightVfxNoise(i * 5 + 2), layer = i % 3;
  const wobble = flightVfxNoise(i * 5 + 3) * flightVfxTau;
  return { x: flightVfxNoise(i * 5), y: flightVfxNoise(i * 5 + 1), z, sinWobble: Math.sin(wobble), cosWobble: Math.cos(wobble),
    speed: (4 + 31 * z ** 2) * (layer * .28 + .58), radius: .38 + z ** 3 * (layer === 2 ? 1.28 : .77),
    band: flightVfxNoise(i * 5 + 4) };
});
const flightSkyField = { width: 0, height: 0, sector: -1, haze: null, shine: null };

function flightVfxTier() { return visualQuality.meshDetail; }
function flightVfxStill() { return typeof quietCombatMotion === "function" ? quietCombatMotion() : reducedMotion.matches; }
function flightVfxWrap(value, width) { return (value % width + width) % width; }

function drawCosmicFlightVfx(ctx, world, field) {
  const { width, height } = world;
  const quiet = flightVfxStill(), tier = flightVfxTier();
  const count = quiet ? 32 : [48, 108, 182][tier];
  const clock = quiet ? 0 : field.clock + field.ambientClock;
  const tint = flightVfxSpectrum[field.sector % flightVfxSpectrum.length] ?? flightVfxSpectrum[0];
  ctx.save();
  if (width !== flightSkyField.width || height !== flightSkyField.height || field.sector !== flightSkyField.sector) {
    const glowX = width * .77, glowY = height * .36;
    const haze = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, width * .56);
    haze.addColorStop(0, tint + "19"); haze.addColorStop(.36, tint + "08"); haze.addColorStop(1, tint + "00");
    const orbit = flightSkyArcs[field.sector] ?? flightSkyArcs[0];
    const shine = ctx.createLinearGradient(width * .08, 0, width * .08 + width * .98, 0);
    shine.addColorStop(0, orbit.color + "00"); shine.addColorStop(.44, orbit.color + "05");
    shine.addColorStop(.74, orbit.color + "3c"); shine.addColorStop(1, orbit.color + "00");
    Object.assign(flightSkyField, { width, height, sector: field.sector, haze, shine });
  }
  ctx.fillStyle = flightSkyField.haze;
  ctx.fillRect(0, 0, width, height);
  if (tier && !quiet) drawFlightSkyArcs(ctx, width, height, clock, field.sector, flightSkyField.shine);
  // Dust sits at three depths. Paths are batched and the animated seeds never
  // consume the sortie random stream or accumulate during a pause or rewind.
  const skySin = Math.sin(clock * .22), skyCos = Math.cos(clock * .22);
  for (let layer = 0; layer < 3; layer++) {
    ctx.fillStyle = layer === 2 ? "#fff3db" : tint;
    ctx.globalAlpha = (quiet ? .60 : 1) * flightDustAlpha[layer];
    ctx.beginPath();
    for (let i = layer; i < count; i += 3) {
      const speck = flightVfxDust[i];
      const x = flightVfxWrap(speck.x * width - clock * speck.speed, width);
      const y = speck.y * height + (skySin * speck.cosWobble + skyCos * speck.sinWobble) * speck.z * 9;
      const r = speck.radius;
      if (!quiet && tier && layer === 2 && speck.band > .75) {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x - 4.5 - speck.z * 12, y - r * .28);
        ctx.lineTo(x - 2, y + r * .52); ctx.closePath();
      } else {
        ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, flightVfxTau);
      }
    }
    ctx.fill();
  }
  if (tier && !quiet) {
    ctx.globalAlpha = .18;
    ctx.strokeStyle = tint;
    ctx.lineWidth = .62;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const speck = flightVfxDust[31 + i * 9];
      const x = flightVfxWrap(speck.x * width - clock * (9 + 8 * speck.z), width);
      const y = speck.y * height;
      const r = 1.6 + speck.z * 2.5;
      ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r * .62); ctx.lineTo(x, y + r * .62);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawFlightSkyArcs(ctx, width, height, clock, sector, shine) {
  const orbit = flightSkyArcs[sector] ?? flightSkyArcs[0];
  const x0 = width * .08, span = width * .98;
  ctx.strokeStyle = shine;
  for (let lane = 0; lane < 6; lane++) {
    const shift = lane * height * .014;
    const warp = Math.sin(clock * .135 + lane * .42) * height * .025;
    ctx.lineWidth = lane % 2 ? .78 : 1.25;
    ctx.beginPath();
    ctx.moveTo(x0, height * orbit.y + shift);
    ctx.bezierCurveTo(x0 + span * .30, height * (orbit.y + orbit.arc) + shift * 1.1,
      x0 + span * .76, height * (orbit.y + orbit.arc * .33) + shift + warp,
      x0 + span, height * (orbit.y + orbit.lean) + shift * 1.42);
    ctx.stroke();
  }
}

// The narrow bright head remains in the original collision silhouette. This
// attenuated filament extends behind it to describe speed and direction.
function drawFlightBoltWake(ctx, length, half, tint, index, time, hostile = false, bullet = null) {
  const tier = flightVfxTier();
  if (!tier || flightVfxStill()) return;
  if (!hostile) {
    const fighter = typeof selectedFighter === "string" ? selectedFighter : "red";
    const auxiliary = !!bullet?.auxiliary, lance = bullet?.visual === "lance" || bullet?.visual === "counter";
    const span = Math.min(auxiliary ? 32 : lance ? 92 : 66, length * (lance ? 2.2 : 1.5) + 10);
    ctx.save(); ctx.strokeStyle = tint; ctx.fillStyle = tint; ctx.globalAlpha *= auxiliary ? .32 : .52;
    if (lance || fighter === "red") {
      const glow = ctx.createLinearGradient(-span,0,length*.20,0);glow.addColorStop(0,tint+"00");glow.addColorStop(.68,tint+"57");glow.addColorStop(1,tint+"c4");
      ctx.fillStyle=glow;ctx.beginPath();ctx.moveTo(length*.20,-half*.52);ctx.lineTo(-span*.30,-half*.72);ctx.lineTo(-span,0);ctx.lineTo(-span*.30,half*.72);ctx.lineTo(length*.20,half*.52);ctx.closePath();ctx.fill();
      if(lance){ctx.strokeStyle="#ffe8c5";ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(-span*.64,0);ctx.lineTo(length*.32,0);ctx.stroke();}
    } else if (fighter === "blue") {
      ctx.lineWidth=.75;
      for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(-span,0);ctx.bezierCurveTo(-span*.66,side*half,-span*.22,-side*half*.25,length*.23,side*half*.28);ctx.stroke();}
      if(!auxiliary){ctx.strokeStyle="#d7fbff";ctx.globalAlpha*=.65;const x=-span*((time*3+index*.37)%1);ctx.beginPath();ctx.moveTo(x-3,-half*.4);ctx.lineTo(x+2,0);ctx.lineTo(x-3,half*.4);ctx.stroke();}
    } else {
      ctx.lineWidth=.8;
      for(let i=0;i<(auxiliary?2:4);i++){const x=-span*(i+.5)/4,w=3+half*.6,h=half*(1-i*.15);ctx.beginPath();ctx.moveTo(x-w,0);ctx.lineTo(x,-h);ctx.lineTo(x+w,0);ctx.lineTo(x,h);ctx.closePath();ctx.stroke();}
    }
    ctx.restore(); return;
  }
  const span = Math.min(hostile ? 33 : 66, length * 1.45 + 8);
  const phase = time * 24 + index * 2.39;
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * (hostile ? .25 : .37);
  ctx.strokeStyle = tint;
  ctx.lineWidth = .72 + Math.min(1.35, half * .26);
  ctx.beginPath();
  ctx.moveTo(-span, Math.sin(phase) * half * .48);
  ctx.bezierCurveTo(-span * .63, -half * .55, -span * .30, half * .55, length * .42, 0);
  ctx.stroke();
  if (tier === 2) {
    ctx.globalAlpha = alpha * (hostile ? .18 : .39);
    ctx.fillStyle = "#fff3df";
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const u = flightVfxWrap(phase * .085 + i / 3, 1);
      const x = -2 - span * u, y = Math.sin(phase + i * 2.16) * half * u;
      ctx.rect(x, y, (1 - u) * 3 + .8, .75);
    }
    ctx.fill();
  }
  ctx.globalAlpha = alpha;
}

function flightProjectileShape(half, length, lance) {
  const key = `${half}/${length}/${lance}`;
  const cached = flightProjectileShapes.get(key);
  if (cached) return cached;
  const body = new Path2D(), core = new Path2D();
  if (lance) {
    body.moveTo(0, -half * .65); body.lineTo(length * .78, -half);
    body.lineTo(length, 0); body.lineTo(length * .78, half); body.lineTo(0, half * .65);
  } else {
    body.moveTo(0, -half * .32);
    body.lineTo(length * .24, -half * .76);
    body.quadraticCurveTo(length * .86, -half * 1.38, length, 0);
    body.quadraticCurveTo(length * .86, half * 1.38, length * .24, half * .76);
    body.lineTo(0, half * .32);
  }
  body.closePath(); core.moveTo(length * .17, 0);
  core.lineTo(length * .75, -half * .48);
  core.quadraticCurveTo(length * .94, -half * .42, length * .96, 0);
  core.quadraticCurveTo(length * .94, half * .42, length * .75, half * .48);
  core.closePath();
  if (flightProjectileShapes.size >= 36) flightProjectileShapes.delete(flightProjectileShapes.keys().next().value);
  const shape = { key, body, core };
  flightProjectileShapes.set(key, shape);
  return shape;
}

function strokeFlightProjectile(ctx, body, color, half, glow, crowded) {
  ctx.strokeStyle = color; ctx.lineJoin = "round";
  ctx.globalAlpha = .18 * glow;
  ctx.lineWidth = half * 2.3; ctx.stroke(body);
  if (!crowded) {
    ctx.globalAlpha = .38 * glow;
    ctx.lineWidth = half * .8; ctx.stroke(body);
  }
  ctx.globalAlpha = 1;
}

function flightProjectileGlowTile(shape, color, half, length, glow) {
  const key = `${shape.key}/${color}/${glow}`;
  const cached = flightProjectileGlows.get(key);
  if (cached) return cached;
  const x = Math.ceil(half * 1.2 + 2), y = Math.ceil(half * 2.7 + 2);
  const width = Math.ceil(length) + 2 * x, height = 2 * y;
  if (width > 160 || height > 56 || typeof shipRenderCanvas !== "function") return null;
  const ratio = 3;
  const surface = shipRenderCanvas(width * ratio, height * ratio);
  const paint = surface?.getContext("2d");
  if (!paint) return null;
  paint.setTransform(ratio, 0, 0, ratio, x * ratio, y * ratio);
  strokeFlightProjectile(paint, shape.body, color, half, glow, false);
  if (flightProjectileGlows.size >= 64) flightProjectileGlows.delete(flightProjectileGlows.keys().next().value);
  const entry = { surface, x, y, width, height };
  flightProjectileGlows.set(key, entry);
  return entry;
}

function drawFlightProjectileBody(ctx, bullet, half, length, glow, crowded) {
  const shape = flightProjectileShape(half, length, bullet.visual === "lance" || bullet.visual === "counter");
  if (glow && half >= 2) {
    const tile = !crowded && ctx.globalCompositeOperation === "source-over" && ctx.filter === "none"
      && flightProjectileGlowTile(shape, bullet.color, half, length, glow);
    if (tile) {
      ctx.globalAlpha = 1;
      ctx.drawImage(tile.surface, -tile.x, -tile.y, tile.width, tile.height);
    } else strokeFlightProjectile(ctx, shape.body, bullet.color, half, glow, crowded);
  }
  ctx.fillStyle = bullet.color; ctx.fill(shape.body);
  ctx.fillStyle = bullet.core; ctx.fill(shape.core);
}

const flightExhaustProfiles = {
  red: { length: .52, radius: .10, split: .20, seed: 15, heat: [255, 242, 202],
    color: [255, 106, 45], shade: [159, 27, 33], sparks: flightWakeColors.red },
  blue: { length: .59, radius: .088, split: .30, seed: 83, heat: [221, 253, 255],
    color: [65, 193, 255], shade: [55, 59, 167], sparks: flightWakeColors.blue },
  yellow: { length: .47, radius: .105, split: .24, seed: 151, heat: [255, 247, 205],
    color: [255, 194, 62], shade: [149, 64, 28], sparks: flightWakeColors.yellow },
  nitrous: { length: .52, radius: .070, split: .24, seed: 217, heat: [225, 253, 255],
    color: [132, 119, 255], shade: [48, 74, 184], sparks: "#a7b2ff" },
};
const flightExhaustCell = { width: 160, height: 56, count: 5 };
const flightExhaustAtlases = new Map();
const flightExhaustNoise = Float32Array.from({ length: 1024 }, (_, i) => flightVfxNoise(i + 4189));
const flightExhaustFlow = { kind: "", time: 0, battleClock: 0, phase: 0, rage: 0, cast: 0, boost: 0 };

function resetFlightExhaust() {
  flightExhaustFlow.kind = "";
  flightExhaustFlow.time = flightExhaustFlow.rage = flightExhaustFlow.cast = flightExhaustFlow.boost = 0;
  flightExhaustFlow.battleClock = flightExhaustFlow.phase = 0;
}

function flightExhaustGrain(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const u = flightExhaustNoise[(ix + iy * 41 + seed) & 1023];
  const v = flightExhaustNoise[(ix + iy * 41 + seed + 1) & 1023];
  const a = flightExhaustNoise[(ix + iy * 41 + seed + 41) & 1023];
  const b = flightExhaustNoise[(ix + iy * 41 + seed + 42) & 1023];
  return (u + (v - u) * sx) * (1 - sy) + (a + (b - a) * sx) * sy;
}

function flightExhaustAtlas(name) {
  if (flightExhaustAtlases.has(name)) return flightExhaustAtlases.get(name);
  const profile = flightExhaustProfiles[name];
  const { width, height, count } = flightExhaustCell;
  const atlas = shipRenderCanvas(width, height * count);
  const paint = atlas?.getContext("2d");
  if (!paint) return null;
  const image = paint.createImageData(width, height * count);
  for (let cell = 0; cell < count; cell++) {
    const turn = cell / count * flightVfxTau;
    const flowX = 1.9 * Math.sin(turn), flowY = .8 * Math.cos(turn);
    for (let px = 0; px < width; px++) {
      const u = (px + .5) / width, tail = 1 - u;
      const lift = Math.sin(turn + u * 12.5) * u * .14 + Math.sin(turn * 2 + u * 20) * u * .055;
      const phase = turn * 1.0 - u * 23;
      const widthPulse = .89 + Math.sin(phase) * .11 + Math.sin(phase * 2 + .8) * .07;
      const sheath = (.46 + .75 * Math.sin(Math.PI * u) ** .72) * tail ** .63 * widthPulse;
      const split = profile.split * u ** .70 * (.89 + .22 * Math.sin(phase + .55));
      const passage = Math.max(.035, (.19 + .06 * Math.sin(phase + .7)) * tail ** .72);
      const luminous = tail ** 1.42 * (.89 + .11 * Math.cos(phase));
      const terminalFade = Math.min(1, tail * 22);
      for (let py = 0; py < height; py++) {
        const v = (py + .5) / height * 2 - 1;
        const localY = v - lift;
        const haze = flightExhaustGrain(u * 15 + flowX, localY * 7.5 + flowY, profile.seed);
        const detail = flightExhaustGrain(u * 34 + flowX * 2.2 + v * 3, v * 19 + flowY * 1.7, profile.seed + 288);
        const turbulentEdge = sheath * (.76 + .58 * haze + .18 * detail);
        const band = Math.max(0, 1 - Math.abs(localY) / turbulentEdge);
        const nearest = Math.min(Math.abs(localY - split), Math.abs(localY + split * .78));
        const core = Math.exp(-2.4 * (nearest / passage) ** 2) * luminous * (.61 + .39 * detail);
        const plasma = band ** 1.10 * (.46 + .43 * haze + .31 * detail);
        const heat = Math.min(1, core ** .83 * (1.02 + .20 * detail));
        const color = Math.min(1, (.12 + plasma * 1.35) * (.74 + .26 * tail));
        const margin = Math.min(1, Math.max(0, (.94 - Math.abs(v)) * 9));
        const alpha = Math.min(1, plasma * .94 * tail ** .48 + core * .84) * margin;
        const k = 4 * ((cell * height + py) * width + px);
        for (let channel = 0; channel < 3; channel++) {
          const falloff = profile.shade[channel] + (profile.color[channel] - profile.shade[channel]) * color;
          image.data[k + channel] = falloff + (profile.heat[channel] - falloff) * heat;
        }
        image.data[k + 3] = Math.round(alpha * terminalFade * 255);
      }
    }
  }
  paint.putImageData(image, 0, 0);
  flightExhaustAtlases.set(name, atlas);
  return atlas;
}

function drawFlightExhaustMaterial(ctx, palette, length, radius, phase, opacity, still, tier) {
  if (opacity <= .005) return;
  const { width, height, count } = flightExhaustCell;
  const atlas = flightExhaustAtlas(palette);
  if (!atlas) return;
  const position = still ? 0 : flightVfxWrap(phase, count);
  const frame = Math.floor(position), blend = tier ? position - frame : 0;
  ctx.globalAlpha = opacity * (1 - blend);
  ctx.drawImage(atlas, 0, frame * height, width, height, 0, -radius, length, radius * 2);
  if (blend > .005) {
    ctx.globalAlpha = opacity * blend;
    ctx.drawImage(atlas, 0, ((frame + 1) % count) * height, width, height, 0, -radius, length, radius * 2);
  }
}

function flightCastThrust(kind) {
  if (typeof ultimate === "undefined" || ultimate.kind !== kind) return 0;
  if (ultimate.phase === "charging") {
    const progress = clamp(ultimate.elapsed / Math.max(.001, cannonLink.chargeDuration), 0, 1);
    return .30 + progress * .71;
  }
  if (ultimate.phase === "firing" && !ultimate.shot?.presentationOnly) {
    return .84 + .57 * Math.exp(-ultimate.elapsed * 7.8);
  }
  return 0;
}

function drawFlightExhaustSparks(ctx, profile, length, radius, clock, throttle, tier, opacity, boost) {
  const count = Math.min(tier === 2 ? 19 : 11, Math.round((3 + throttle * 9) * tier * .62));
  ctx.strokeStyle = profile.sparks;
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    const id = i + profile.seed * 13;
    const speed = flightVfxNoise(id + 18), side = i % 2 ? -1 : 1;
    const u = flightVfxWrap(clock * (.68 + speed * .85) + flightVfxNoise(id), 1);
    const x = length * (.08 + .92 * u);
    const drift = radius * (.18 + flightVfxNoise(id + 73) * 1.31);
    const y = side * drift * (.44 + u * .88) + Math.sin(clock * 5 + id) * radius * .11 * u;
    const reach = 1.7 + speed * (5 + 9 * boost) + throttle * 2.3;
    ctx.globalAlpha = opacity * Math.sin(Math.PI * u) * (.35 + speed * .40);
    ctx.lineWidth = .55 + speed * .65;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x - reach, y * .88); ctx.stroke();
  }
}

function drawFlightEngineWake(ctx, ship, kind, time, overdrive, nitrous = false) {
  if (ship.disabled || !(ship.width > 0 && ship.height > 0)) return;
  const actualShip = typeof player !== "undefined" && ship === player;
  const origin = actualShip && typeof fighterWakeOrigin === "function"
    ? fighterWakeOrigin(ship, kind) : { x: ship.x - ship.width * .40, y: ship.y };
  const palette = Object.hasOwn(flightExhaustProfiles, kind) ? kind : "red";
  const profile = flightExhaustProfiles[palette];
  const still = flightVfxStill(), tier = flightVfxTier();
  const cast = actualShip ? flightCastThrust(kind) : 0;
  let rage = overdrive ? 1 : 0, boost = nitrous ? 1 : 0, thrust = cast;
  const flow = flightExhaustFlow;
  let elapsed = 0;
  if (actualShip) {
    const battleClock = typeof battleTime === "number" ? battleTime : time;
    if (flow.kind !== kind || time < flow.time || battleClock < flow.battleClock) resetFlightExhaust();
    elapsed = flow.kind ? clamp(time - flow.time, 0, .07) : 1 / 60;
    flow.kind = kind;
    flow.time = time;
    flow.battleClock = battleClock;
    const blend = 1 - Math.exp(-elapsed * 24);
    flow.rage += (rage - flow.rage) * blend;
    flow.boost += (boost - flow.boost) * blend;
    flow.cast += (thrust - flow.cast) * blend;
    rage = flow.rage; boost = flow.boost; thrust = flow.cast;
  }
  const energy = Math.max(rage, thrust, boost * 1.15) + Math.min(boost, Math.max(rage, thrust)) * .16;
  const clock = still ? 0 : time;
  const pace = 16 + 6 * energy;
  if (actualShip) flow.phase = flightVfxWrap(flow.phase + elapsed * pace, flightExhaustCell.count);
  const phase = still ? 0 : actualShip ? flow.phase : clock * pace;
  const tremor = Math.sin(clock * 27) * .035 * (1 + energy * .83);
  const length = ship.width * (profile.length + energy * .67 + tremor) * (still ? .88 : 1);
  const radius = ship.height * (profile.radius + (.10 + .018 * rage) * energy) * (still ? .81 : 1);
  const opacity = ctx.globalAlpha * (still ? .73 : .99);
  ctx.save();
  ctx.translate(origin.x + 2, origin.y);
  if (actualShip && !still) ctx.rotate(shipVisuals.bank * .064);
  ctx.scale(-1, 1);
  ctx.globalCompositeOperation = "source-over";
  drawFlightExhaustMaterial(ctx, palette, length, radius, phase, opacity * (1 - boost), still, tier);
  drawFlightExhaustMaterial(ctx, "nitrous", length, radius, phase, opacity * boost, still, tier);
  if (!still && tier) drawFlightExhaustSparks(ctx, boost > .5 ? flightExhaustProfiles.nitrous : profile,
    length, radius, clock, energy, tier, opacity, boost);
  ctx.restore();
}

function drawFlightLattice(ctx, x, y, rx, ry, tint, time, alpha = 1, scale = 1) {
  const quiet = flightVfxStill(), tier = flightVfxTier();
  if (!(alpha > 0 && rx > 0 && ry > 0)) return;
  const turn = quiet ? .4 : time * .88;
  ctx.save(); ctx.translate(x, y);
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = tint;
  ctx.lineWidth = Math.min(1.35, Math.max(.55, rx * .017));
  ctx.beginPath();
  const layers = quiet ? 2 : [2, 3, 5][tier];
  for (let i = 0; i < layers; i++) {
    const start = turn + i * 2.11;
    const ridge = 1 + (i - 1) * .055 * scale;
    ctx.moveTo(Math.cos(start) * rx * ridge, Math.sin(start) * ry * ridge);
    ctx.ellipse(0, 0, rx * ridge, ry * ridge, 0, start, start + (i % 2 ? .96 : 1.56));
  }
  ctx.stroke();
  if (!quiet && tier) {
    ctx.beginPath();
    ctx.fillStyle = "#fff4df";
    const count = tier === 2 ? 21 : 11;
    for (let i = 0; i < count; i++) {
      const d = flightVfxDust[i + 92];
      const a = d.wobble + turn * (.55 + d.z);
      const r = 1 + d.band * .32 * scale;
      const px = Math.cos(a) * rx * r, py = Math.sin(a) * ry * r;
      ctx.rect(px, py, .65 + d.z * 1.45, .65 + d.z * .85);
    }
    ctx.fill();
  }
  ctx.restore();
}

function drawFlightEnergyCrystal(ctx, radius, tint, time) {
  const angle = flightVfxStill() ? 0 : time * 1.65;
  const r = radius * .91;
  const material = ctx.createRadialGradient(-r * .2, -r * .26, 0, 0, 0, r * 1.16);
  material.addColorStop(0, tint + "7a");
  material.addColorStop(.44, tint + "32");
  material.addColorStop(.88, "#07111ef8");
  material.addColorStop(1, "#04070e");
  ctx.fillStyle = material;
  ctx.strokeStyle = tint;
  ctx.lineWidth = 1.35;
  ctx.beginPath();
  for (let j = 0; j < 6; j++) {
    const a = angle + j * Math.PI / 3, px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  drawFlightLattice(ctx, 0, 0, radius * 1.13, radius * 1.13, tint, time, .66);
}

function drawFlightBeamFibers(ctx, left, right, y, radius, tint, clock) {
  const tier = flightVfxTier();
  if (!tier || flightVfxStill() || right <= left) return;
  const span = right - left, count = tier === 2 ? 7 : 4;
  const time = clock * 23;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.lineWidth = .85;
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? -1 : 1;
    const drift = .38 + i / count * .77;
    ctx.strokeStyle = i % 3 ? tint : "#ffe6ba";
    ctx.globalAlpha = .30 + (i % 3) * .09;
    ctx.beginPath();
    for (let j = 0; j <= 27; j++) {
      const u = j / 27, taper = Math.sin(Math.PI * u) ** .36;
      const xx = left + span * u;
      const yy = y + side * radius * taper * drift * (.8 + .24 * Math.sin(u * 17 - time + i * 2.1)
        + .12 * Math.sin(u * 38 + time * .7 + i));
      if (j) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = .62;
  ctx.fillStyle = "#fff2cb";
  ctx.beginPath();
  for (let i = 0; i < (tier === 2 ? 70 : 32); i++) {
    const d = flightVfxDust[i + 10], u = flightVfxWrap(d.x + clock * (.6 + d.z * 2.5), 1);
    const xx = left + span * u;
    const yy = y + (d.y - .5) * radius * (1.4 + d.z * .85) * Math.sin(Math.PI * u);
    ctx.rect(xx, yy, 1 + d.z ** 2 * Math.min(17, span * .08), .6 + d.z * .8);
  }
  ctx.fill(); ctx.restore();
}

function drawFlightSkillVeil(ctx, world, anchor, tint, age, strength, reverse = false) {
  const quiet = flightVfxStill(), tier = flightVfxTier();
  if (!(strength > 0) || !tint) return;
  const extent = Math.max(world.width, world.height) * .82;
  const veil = ctx.createRadialGradient(anchor.x, anchor.y, 0, anchor.x, anchor.y, extent);
  veil.addColorStop(0, tint + "3c");
  veil.addColorStop(.42, tint + "15");
  veil.addColorStop(1, tint + "00");
  ctx.save();
  ctx.globalAlpha *= strength * (quiet ? .4 : .92);
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, world.width, world.height);
  const distance = quiet ? world.height * .24 : world.height * (.11 + (reverse ? 1 - age : age) * .79);
  drawFlightLattice(ctx, anchor.x, anchor.y, distance * 1.44, distance * .83, tint,
    age * (reverse ? -3 : 3), strength * .86, 1.55);
  if (tier && !quiet) drawFlightLattice(ctx, anchor.x, anchor.y, distance * 1.13, distance * .63,
    "#ffe8bd", age * (reverse ? 4 : -4), strength * .46);
  ctx.restore();
}
