"use strict";

// Coordinates are in boss body units. The depth projection gives the light
// paths and dust the same foreshortening even when the arena is resized.
const bossArrivalPalettes = [
  { body: "#35d8e5", edge: "#a7fff1", echo: "#7c74f2", shadow: "#08243d", tilt: -.23 },
  { body: "#c4b5eb", edge: "#fff2d8", echo: "#ac6d95", shadow: "#221633", tilt: .17 },
  { body: "#ff7134", edge: "#ffe49a", echo: "#ef3568", shadow: "#391223", tilt: -.14 },
  { body: "#9e80ff", edge: "#efdfff", echo: "#46c7ff", shadow: "#1b1642", tilt: .28 },
  { body: "#7eeb95", edge: "#efffb5", echo: "#23cbb2", shadow: "#092e2b", tilt: -.18 },
  { body: "#67cafa", edge: "#effcff", echo: "#e9a6ed", shadow: "#142647", tilt: .15 },
  { body: "#51a2ff", edge: "#c8fdff", echo: "#887af8", shadow: "#0b2145", tilt: -.30 },
  { body: "#c2ed62", edge: "#fffcca", echo: "#2cd6bb", shadow: "#233624", tilt: -.21 },
  { body: "#ed6748", edge: "#fff0cb", echo: "#ad44ac", shadow: "#230b29", tilt: -.05 },
  { body: "#f17acb", edge: "#ffdff2", echo: "#7b9aff", shadow: "#29143e", tilt: -.20 },
  { body: "#be9efa", edge: "#fff1d8", echo: "#ffc37b", shadow: "#24134c", tilt: -.12 },
];
const bossArrivalTau = Math.PI * 2;
const bossArrivalHaloSprites = [];
const bossArrivalDust = (() => {
  let seed = 0x1cb2a7d3;
  const values = new Float32Array(960 * 5);
  for (let i = 0; i < values.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    values[i] = seed / 4294967296;
  }
  return values;
})();

function bossArrivalEase(start, end, t) {
  const f = Math.min(1, Math.max(0, (t - start) / (end - start)));
  return f * f * (3 - 2 * f);
}

function setBossArrivalPoint(out, x, y, z) {
  const lens = 1 / (1 + z * .27);
  out.x = x * lens + z * .19;
  out.y = y * lens;
  out.z = z;
}

function bossArrivalCurve(out, type, u, lane, time) {
  const sin = Math.sin, cos = Math.cos;
  const a = lane * bossArrivalTau;
  const side = lane < .5 ? -1 : 1;
  const fold = sin(Math.PI * u);
  let x, y, z, angle, radius;
  switch (type) {
    case 0: // Shells of a spiral tide, folding toward its blue eye.
      angle = a + u * 6.4 + time * .91;
      radius = .19 + u * (1.32 + .15 * sin(a * 3));
      x = radius * cos(angle) - .41 * u * u;
      y = radius * sin(angle) * (.79 + .10 * cos(a * 2)) + .07 * sin(u * 18 + time * 4);
      z = .67 * sin(angle + .66) * u;
      break;
    case 1: { // Paired ribs curve forward from the spine into ivory points.
      const rib = Math.floor((lane * 2 % 1) * 11) / 10;
      const fine = lane * 22 % 1;
      angle = u * Math.PI * 1.05;
      x = .68 - rib * 1.88 + (.42 + rib * .51) * (1 - cos(angle)) - .38 * u * u + .072 * fine;
      y = side * (.15 + (.31 + .62 * sin((rib * .86 + .08) * Math.PI)) * sin(angle) + .1 * u);
      z = .42 * sin(angle * .76 + rib * 3 + side * .3) + .045 * cos(time * 2);
      break;
    }
    case 2: { // Stretched bands curl around two convecting pockets.
      const lobe = Math.floor(lane * 2);
      const strand = lane * 2 % 1;
      angle = a + u * (3.85 + strand * 1.9) - .93 * time + .53 * sin(u * 7 + a);
      radius = .12 + u * (1.06 + .26 * sin(a * 4 + u * 11));
      x = radius * cos(angle) - u * u * .75 + .14 * sin(time * 3.5 + u * 10 + a) - lobe * .33;
      y = radius * sin(angle) + .26 * sin(u * 6 + a) * u + (lobe - .5) * .41;
      z = .61 * sin(angle + .61) * u + lobe * .1;
      break;
    }
    case 3: { // Twenty swept strands and their scalloped cross threads.
      const spoke = Math.floor(lane * 20);
      const line = lane * 20 % 1;
      const net = spoke * bossArrivalTau / 20;
      angle = line < .62 ? net + u * .31 : net + u * bossArrivalTau;
      radius = line < .62 ? .16 + 1.52 * u : .28 + 3.18 * (line - .62) - .075 * (1 - cos(angle * 14));
      const lean = .89 + .20 * cos(angle * 3 + 1.1);
      x = radius * cos(angle) * lean - .20 * radius * radius;
      y = radius * sin(angle) * lean + .045 * sin(time * 2 + radius * 8 + angle);
      z = .44 * sin(angle + radius * 1.35) * Math.min(1, radius);
      break;
    }
    case 4: { // Twin claws and fine contact arcs between their inner hooks.
      const claw = lane * 2 % 1;
      angle = u * Math.PI * (1.02 + claw * .22) + .12 * claw;
      x = .74 - (1.02 + claw * .45) * (1 - cos(angle)) * .77;
      y = side * ((.32 + claw * .18) + (.59 + claw * .23) * sin(angle) - .15 * u);
      z = .6 * cos(angle + claw * .58) + .055 * sin(time * 3.4 + side);
      break;
    }
    case 5: { // The ray's wings unfold as paired, mirrored crystal facets.
      const facet = lane * 2 % 1;
      const corner = Math.floor(u * 6);
      const f = Math.min(1, u * 6 - corner);
      const wave = (corner % 2 ? 1 - f : f) - .5;
      const span = .33 + facet * .68;
      x = .68 - 2.19 * u + wave * .31 * span;
      y = side * (.14 + span * (fold * .92 + wave * .42));
      z = .54 * cos(a + u * 2.4 + time * .4) + .16 * wave;
      break;
    }
    case 6: // A coherent S-shaped current with braided trails in its wake.
      angle = 5.8 * u + a + time * 1.9;
      radius = (.09 + .28 * fold) * (.65 + .35 * lane);
      x = .85 - 2.62 * u + radius * sin(angle) * .32;
      y = .44 * sin(u * 7.7 - time * 1.1) * (.4 + .6 * u) + radius * cos(angle);
      z = radius * sin(angle) * 1.42 + .22 * sin(u * 8);
      break;
    case 7: { // Spores sprout branching cups and release a veil of pollen.
      const branch = Math.floor(lane * 13) * bossArrivalTau / 13;
      const twig = lane * 13 % 1;
      angle = branch + twig * .13 + fold * (.32 + twig * .44) + .04 * sin(time * 2.3 + branch);
      radius = .15 + 1.51 * u + .1 * sin(twig * 12) * u;
      const cup = Math.pow(u, 4) * sin(twig * bossArrivalTau) * .33;
      x = radius * cos(angle + cup) - .22 * u;
      y = radius * sin(angle + cup) * .91 + Math.pow(u, 5) * sin(u * 23 + twig * 7) * .09;
      z = .55 * sin(angle + .8) + .17 * cos(u * 6);
      break;
    }
    case 8: { // A hot flat disk, bent vertically around a dark horizon.
      const lensBand = lane < .58;
      const band = lensBand ? lane / .58 : (lane - .58) / .42;
      angle = u * (bossArrivalTau + .25) + time * .49 + a * .7;
      radius = lensBand ? .61 + .67 * Math.pow(band, 1.8) : .78 + .88 * band;
      x = radius * cos(angle) * (lensBand ? 1.06 : 1.26);
      y = radius * sin(angle) * (lensBand ? .79 - band * .46 : .17 + band * .24);
      z = .58 * sin(angle + .47) * (.38 + band * .62);
      break;
    }
    case 9: { // Fine dendrites branch from twelve axial neural paths.
      const branch = Math.floor(lane * 12) * bossArrivalTau / 12;
      const twig = (lane * 12 % 1 - .5) * 2;
      angle = branch + twig * (.13 + u * u * .48) + .1 * sin(u * 6 + branch);
      radius = .13 + u * (1.47 + .18 * cos(branch * 3));
      x = radius * cos(angle) - .31 * u + .024 * sin(u * 49 + branch + time * 2.8);
      y = radius * sin(angle) * .83 + .032 * sin(u * 41 - a + time * 3) * u;
      z = .51 * cos(branch - u * 2.6) * u;
      break;
    }
    default: { // Three interlocked rings form the Confluence's moving seal.
      const orbit = Math.floor(lane * 3);
      const strand = lane * 3 % 1;
      const bank = orbit * Math.PI / 3 + .10 * sin(time + orbit);
      angle = u * (bossArrivalTau + .26) + time * (.58 + orbit * .12) + a;
      radius = .70 + strand * .49 + .14 * sin(angle * 3 + a);
      const major = radius * cos(angle);
      const minor = radius * sin(angle) * (.44 + strand * .17);
      x = major * cos(bank) - minor * sin(bank) - .18 * u;
      y = major * sin(bank) + minor * cos(bank);
      z = .67 * sin(angle + orbit * .65);
      break;
    }
  }
  setBossArrivalPoint(out, x, y, z);
}

function paintBossArrivalHalo(ctx, palette, type) {
  const outer = ctx.createRadialGradient(-.21, .02, .1, -.21, .02, 2.45);
  outer.addColorStop(0, palette.body + "31");
  outer.addColorStop(.28, palette.shadow + "a6");
  outer.addColorStop(.61, palette.echo + "20");
  outer.addColorStop(1, palette.body + "00");
  ctx.fillStyle = outer;
  ctx.fillRect(-2.68, -2.5, 4.92, 5);
  // An off-axis source creates a backlit opening instead of exposing the
  // whole portal evenly. The event horizon is drawn over this light.
  ctx.save();
  ctx.scale(1, .46);
  const spill = ctx.createRadialGradient(.39, -.11, .025, .32, -.04, 1.75);
  spill.addColorStop(0, palette.edge + (type === 8 ? "31" : "95"));
  spill.addColorStop(.17, palette.body + (type === 8 ? "26" : "77"));
  spill.addColorStop(.47, palette.body + "25");
  spill.addColorStop(1, palette.echo + "00");
  ctx.fillStyle = spill;
  ctx.fillRect(-1.45, -1.80, 3.55, 3.55);
  ctx.restore();
  const aperture = ctx.createRadialGradient(.07, -.05, .035, .07, -.05, type === 8 ? 1.1 : .87);
  aperture.addColorStop(0, type === 8 ? "#03030aef" : palette.body + "45");
  aperture.addColorStop(.28, type === 8 ? "#06030ced" : palette.shadow + "53");
  aperture.addColorStop(.57, type === 8 ? palette.shadow + "d8" : palette.body + "20");
  aperture.addColorStop(.72, palette.body + "48");
  aperture.addColorStop(1, palette.body + "00");
  ctx.fillStyle = aperture;
  ctx.fillRect(-1.35, -1.25, 2.7, 2.5);
}

function drawBossArrivalHalo(ctx, palette, strength, type, pulse) {
  if (!bossArrivalHaloSprites[type] && typeof OffscreenCanvas === "function") {
    const sprite = new OffscreenCanvas(160, 160);
    const paint = sprite.getContext("2d");
    if (paint) {
      paint.scale(32, 32);
      paint.translate(2.68, 2.5);
      paintBossArrivalHalo(paint, palette, type);
      bossArrivalHaloSprites[type] = sprite;
    }
  }
  ctx.globalAlpha *= strength * (.86 + pulse * .14);
  const sprite = bossArrivalHaloSprites[type];
  if (sprite) ctx.drawImage(sprite, -2.68, -2.5, 5, 5);
  else paintBossArrivalHalo(ctx, palette, type);
}

function bossArrivalOccluded(type, point) {
  if (type !== 8 || point.z <= 0) return false;
  const x = point.x / .59, y = point.y / .44;
  return x * x + y * y < 1;
}

function drawBossArrivalHorizon(ctx, strength) {
  ctx.save();
  const shade = ctx.createRadialGradient(-.08, -.06, .04, 0, 0, .64);
  shade.addColorStop(0, "#010106");
  shade.addColorStop(.68, "#03030b");
  shade.addColorStop(1, "#20112c");
  ctx.globalAlpha *= strength;
  ctx.beginPath();
  ctx.ellipse(0, 0, .59, .44, 0, 0, bossArrivalTau);
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.restore();
}

function drawBossArrivalRibbons(ctx, type, palette, time, strength, quality, quiet, pulse) {
  const point = { x: 0, y: 0, z: 0 };
  const count = quality === "high" ? 23 : quality === "low" ? 9 : 16;
  const segments = quality === "high" ? 36 : quality === "low" ? 18 : 25;
  const flow = ctx.createLinearGradient(-1.94, .26, 1.18, -.39);
  flow.addColorStop(0, palette.echo + "14");
  flow.addColorStop(.23, palette.body + "62");
  flow.addColorStop(.51, palette.body + "a4");
  flow.addColorStop(.67, palette.edge + "d8");
  flow.addColorStop(1, palette.echo + "60");
  const glint = ctx.createLinearGradient(-1.6, -.4, .99, .39);
  glint.addColorStop(0, palette.body + "12");
  glint.addColorStop(.28, palette.echo + "75");
  glint.addColorStop(.53, palette.edge + "b5");
  glint.addColorStop(.68, palette.body + "d4");
  glint.addColorStop(1, palette.echo + "2c");
  const base = ctx.globalAlpha;
  ctx.lineJoin = "bevel";
  ctx.lineCap = "butt";
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (let i = pass; i < count; i += 2) {
      const lane = (i + .27) / count;
      const extent = type === 3 || type === 8 ? .88 + .12 * bossArrivalDust[i * 5 + 1] : .73 + .27 * bossArrivalDust[i * 5 + 1];
      let startsSubpath = true;
      for (let j = 0; j <= segments; j++) {
        bossArrivalCurve(point, type, j / segments * extent, lane, time);
        if (bossArrivalOccluded(type, point)) {
          startsSubpath = true;
          continue;
        }
        if (startsSubpath) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
        startsSubpath = false;
      }
    }
    ctx.globalAlpha = base * strength * (quiet ? .24 : .14 + pulse * .11);
    ctx.strokeStyle = pass ? palette.echo : palette.body;
    ctx.lineWidth = pass ? .027 : .043;
    ctx.stroke();
    ctx.globalAlpha = base * strength * (pass ? .44 : .76);
    ctx.strokeStyle = pass ? glint : flow;
    ctx.lineWidth = pass ? .0075 : .0095;
    ctx.stroke();
  }
  ctx.globalAlpha = base;
}

function drawBossArrivalDust(ctx, type, palette, time, strength, quality, quiet, expansion, pulse) {
  const count = quality === "high" ? 760 : quality === "low" ? 145 : 390;
  const point = { x: 0, y: 0, z: 0 };
  const base = ctx.globalAlpha;
  const colors = [palette.echo, palette.body, palette.edge, palette.body, palette.edge];
  for (let layer = 0; layer < colors.length; layer++) {
    ctx.beginPath();
    for (let i = layer; i < count; i += colors.length) {
      const offset = i * 5;
      const lane = bossArrivalDust[offset];
      const noise = bossArrivalDust[offset + 1];
      const age = bossArrivalDust[offset + 2] + time * (.075 + noise * .11);
      const u = age % 1;
      const size = bossArrivalDust[offset + 3];
      const spread = bossArrivalDust[offset + 4];
      bossArrivalCurve(point, type, u, lane, time);
      if (bossArrivalOccluded(type, point)) continue;
      const twinkle = .77 + .23 * Math.cos(time * (4 + noise * 12) + spread * 19);
      const dustRadius = (.0027 + size * size * .0108) * (1.04 - point.z * .38) * twinkle;
      const drift = (spread - .5) * (.12 + .31 * u);
      const direction = lane * bossArrivalTau + time * (.32 + noise * .4);
      const depthScale = 1 + expansion * (layer < 2 ? .48 : .29) * (noise * .8 + .2);
      const air = layer === 0 ? .31 + spread * .42 : 0;
      const px = point.x * depthScale + Math.cos(direction) * (drift + air) - expansion * u * (.46 + noise * .60);
      const py = point.y * depthScale + Math.sin(direction) * (drift + air);
      if (layer === 3 && !quiet) {
        const length = dustRadius * (2.8 + expansion * 14 + u * 2.6);
        const bx = Math.cos(direction + .8) * length - expansion * length * 1.28;
        const by = Math.sin(direction + .8) * length;
        ctx.moveTo(px - bx, py - by);
        ctx.lineTo(px + dustRadius, py - dustRadius * .48);
        ctx.lineTo(px + bx, py + by);
        ctx.lineTo(px - dustRadius, py + dustRadius * .48);
        ctx.closePath();
      } else if (layer === 4 && size > .54 && quality !== "low") {
        const r = dustRadius * 1.9;
        ctx.moveTo(px - r * 1.26, py);
        ctx.quadraticCurveTo(px - dustRadius * .31, py - dustRadius * .12, px, py - r);
        ctx.quadraticCurveTo(px + dustRadius * .31, py - dustRadius * .12, px + r * 1.26, py);
        ctx.quadraticCurveTo(px + dustRadius * .31, py + dustRadius * .12, px, py + r);
        ctx.quadraticCurveTo(px - dustRadius * .31, py + dustRadius * .12, px - r * 1.26, py);
      } else {
        ctx.moveTo(px + dustRadius, py);
        ctx.arc(px, py, dustRadius, 0, bossArrivalTau);
      }
    }
    ctx.fillStyle = colors[layer];
    ctx.globalAlpha = base * strength * ([.22, .39, .56, .45, .84][layer] + pulse * .055);
    ctx.fill();
  }
  ctx.globalAlpha = base;
}

function drawBossArrivalWake(ctx, type, palette, p, strength, quality) {
  const reveal = bossArrivalEase(.02, .31, p);
  const visible = bossArrivalEase(.02, .18, p) * (1 - bossArrivalEase(.34, .79, p));
  if (visible <= 0) return;
  const edge = .44 + 2.03 * reveal;
  const gradient = ctx.createLinearGradient(-edge * 1.28, 0, -.22, 0);
  gradient.addColorStop(0, palette.body + "00");
  gradient.addColorStop(.26, palette.edge + "b5");
  gradient.addColorStop(.46, palette.body + "69");
  gradient.addColorStop(1, palette.echo + "00");
  ctx.beginPath();
  const lines = quality === "high" ? 6 : 4;
  for (let lane = 0; lane < lines; lane++) {
    const phase = lane / lines;
    for (let k = 0; k <= 32; k++) {
      const f = k / 32;
      const angle = (f - .5) * Math.PI * 1.4;
      const curl = .07 * Math.cos(angle * (type === 2 ? 7 : 3) + phase * 6 + p * 8);
      const x = -(edge + .15 * phase) * Math.cos(angle) - curl;
      const y = Math.sin(angle) * (.32 + reveal * .79 + phase * .26) + curl * Math.sin(phase * 6);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * strength * visible * .21;
  ctx.strokeStyle = gradient;
  ctx.lineWidth = .059;
  ctx.stroke();
  ctx.globalAlpha = alpha * strength * visible * .74;
  ctx.lineWidth = .012;
  ctx.stroke();
  ctx.globalAlpha = alpha;
}

function drawBossArrivalVfx(ctx, options) {
  const { type, x, y, width, height, progress, phase } = options;
  const palette = bossArrivalPalettes[type];
  if (!palette || !Number.isFinite(x + y + width + height + progress) || width <= 0 || height <= 0) return;
  const p = Math.max(0, Math.min(1, progress));
  const warning = phase === "warning";
  const entry = phase === "entry";
  const primary = warning || entry;
  const qualityId = options.quality?.id ?? options.quality ?? "high";
  const quiet = !!options.quiet;
  const quality = quiet ? "low" : qualityId;
  // The warning and reveal sample the same field on either side of the cut.
  // Reduced motion keeps the geometry fixed and uses a gradual exposure fade.
  const time = quiet ? 1.18 : warning ? p * 1.16 : entry ? 1.16 + p * 2.43 : 1.28 + p * 1.12;
  const expand = quiet ? 0 : entry ? bossArrivalEase(.12, .78, p) : phase === "death" ? p * .76 : 0;
  const entryFade = 1 - bossArrivalEase(.59, 1, p);
  const secondary = bossArrivalEase(.09, .47, p) * (1 - bossArrivalEase(.67, 1, p));
  const strength = (warning ? bossArrivalEase(.01, .63, p) * .84
    : entry ? (.84 + .16 * bossArrivalEase(0, .22, p)) * entryFade
    : secondary * (phase === "death" ? .80 : .62)) * (quiet ? .69 : 1);
  if (strength <= .005) return;
  const pulse = quiet ? 0 : warning ? bossArrivalEase(.56, 1, p) * .28
    : entry ? (1 - bossArrivalEase(0, .30, p)) * .28
      + Math.sin(Math.PI * bossArrivalEase(.02, .63, p)) * .72 : secondary * .55;
  const formation = quiet ? 1 : warning ? .72 + .28 * bossArrivalEase(.05, 1, p) : 1 + expand * .12;
  const scaleX = width * .62 * formation;
  const scaleY = height * .68 * formation;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(palette.tilt);
  ctx.scale(scaleX, scaleY);
  ctx.save();
  drawBossArrivalHalo(ctx, palette, strength * (primary ? 1 : .73), type, pulse);
  ctx.restore();
  if (type === 8) drawBossArrivalHorizon(ctx, strength * .94);
  ctx.globalCompositeOperation = "lighter";
  drawBossArrivalRibbons(ctx, type, palette, time, strength, quality, quiet, pulse);
  if (entry && !quiet) drawBossArrivalWake(ctx, type, palette, p, strength, quality);
  drawBossArrivalDust(ctx, type, palette, time, strength, quality, quiet, expand, pulse);
  ctx.restore();
}
