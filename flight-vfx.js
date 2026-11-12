"use strict";

const flightVfxTau = Math.PI * 2;
const flightVfxSpectrum = ["#9de4f1", "#efbe90", "#c9a3d8", "#86baf8", "#f5b6c7"];
const flightWakeColors = { red: "#ff8058", blue: "#71d8ff", yellow: "#ffd47c" };
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

const flightVfxDust = Array.from({ length: 182 }, (_, i) => ({
  x: flightVfxNoise(i * 5), y: flightVfxNoise(i * 5 + 1),
  z: flightVfxNoise(i * 5 + 2), wobble: flightVfxNoise(i * 5 + 3) * flightVfxTau,
  band: flightVfxNoise(i * 5 + 4),
}));

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
  const glowX = width * .77, glowY = height * .36;
  const haze = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, width * .56);
  haze.addColorStop(0, tint + "19");
  haze.addColorStop(.36, tint + "08");
  haze.addColorStop(1, tint + "00");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);
  if (tier && !quiet) drawFlightSkyArcs(ctx, width, height, clock, field.sector);
  // Dust sits at three depths. Paths are batched and the animated seeds never
  // consume the sortie random stream or accumulate during a pause or rewind.
  for (let layer = 0; layer < 3; layer++) {
    ctx.fillStyle = layer === 2 ? "#fff3db" : tint;
    ctx.globalAlpha = (quiet ? .60 : 1) * flightDustAlpha[layer];
    ctx.beginPath();
    for (let i = layer; i < count; i += 3) {
      const speck = flightVfxDust[i];
      const speed = (4 + 31 * speck.z ** 2) * (layer * .28 + .58);
      const x = flightVfxWrap(speck.x * width - clock * speed, width);
      const y = speck.y * height + Math.sin(clock * .22 + speck.wobble) * speck.z * 9;
      const r = .38 + speck.z ** 3 * (layer === 2 ? 1.28 : .77);
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

function drawFlightSkyArcs(ctx, width, height, clock, sector) {
  const orbit = flightSkyArcs[sector] ?? flightSkyArcs[0];
  const x0 = width * .08, span = width * .98;
  const shine = ctx.createLinearGradient(x0, 0, x0 + span, 0);
  shine.addColorStop(0, orbit.color + "00");
  shine.addColorStop(.44, orbit.color + "05");
  shine.addColorStop(.74, orbit.color + "3c");
  shine.addColorStop(1, orbit.color + "00");
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
function drawFlightBoltWake(ctx, length, half, tint, index, time, hostile = false) {
  const tier = flightVfxTier();
  if (!tier || flightVfxStill()) return;
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

function drawFlightEngineWake(ctx, ship, kind, time, boost) {
  if (flightVfxStill()) return;
  const tier = flightVfxTier(), color = flightWakeColors[kind] ?? flightWakeColors.red;
  const x = ship.x - ship.width * .40, y = ship.y;
  const extent = ship.width * (boost ? 1.49 : .96);
  const half = ship.height * (boost ? .15 : .10);
  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = "screen";
  const fade = ctx.createLinearGradient(-extent, 0, 18, 0);
  fade.addColorStop(0, color + "00");
  fade.addColorStop(.52, color + "22");
  fade.addColorStop(.86, color + "87");
  fade.addColorStop(1, "#fff6db00");
  ctx.strokeStyle = fade;
  const strands = [2, 4, 7][tier];
  for (let i = 0; i < strands; i++) {
    const offset = (i / (strands - 1) - .5) * half * 1.5;
    const drift = Math.sin(time * 5 + i * 1.46) * half * .9;
    ctx.lineWidth = i % 2 ? 1.4 : 3.2;
    ctx.beginPath(); ctx.moveTo(-extent, offset * 1.6 + drift);
    ctx.bezierCurveTo(-extent * .54, offset * 1.8 - drift, -extent * .18, offset * .45 + drift * .25, 17, offset * .4);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.globalAlpha = boost ? .73 : .46;
  ctx.beginPath();
  const count = [6, 15, 27][tier];
  for (let i = 0; i < count; i++) {
    const d = flightVfxDust[i + 40];
    const u = flightVfxWrap(d.x + time * (.8 + d.z * 1.6), 1);
    const yy = (d.y - .5) * half * (1 + u * 2) + Math.sin(u * 5 + d.wobble) * u * half * .72;
    const xx = -u * extent;
    ctx.rect(xx, yy, (1 - u) * 5 * d.z + .5, .6 + d.z * .7);
  }
  ctx.fill();
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
