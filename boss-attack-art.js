"use strict";

const signatureMaterials = {
  water: { dark: "#051c38", mid: "#0a6b89", rim: "#70e8ff", spark: "#dfffff" },
  bone: { dark: "#332132", mid: "#8c6d5e", rim: "#e4ccab", spark: "#fff1d4" },
  magma: { dark: "#391122", mid: "#bd401e", rim: "#ffa057", spark: "#fff4b0" },
  silk: { dark: "#2d1350", mid: "#713a91", rim: "#d3a6ff", spark: "#f3deff" },
  chitin: { dark: "#102737", mid: "#386448", rim: "#afffbe", spark: "#e5fff5" },
  glass: { dark: "#14264b", mid: "#456ca8", rim: "#9ed6ff", spark: "#edf7ff" },
  plasma: { dark: "#101740", mid: "#195899", rim: "#55caff", spark: "#e6fbff" },
  spore: { dark: "#233122", mid: "#678338", rim: "#cdea7c", spark: "#efffc4" },
  void: { dark: "#090916", mid: "#462d65", rim: "#cf9fff", spark: "#f5d9ff" },
  nerve: { dark: "#331033", mid: "#8d316b", rim: "#fa8fba", spark: "#ffd9e8" },
  fusion: { dark: "#1d1247", mid: "#693aab", rim: "#ec9cff", spark: "#e9f7ff" },
};

function signatureGlow(ctx, x, y, radius, material, alpha) {
  const light = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, radius));
  light.addColorStop(0, material.rim);
  light.addColorStop(.52, material.mid);
  light.addColorStop(1, "transparent");
  ctx.globalAlpha = alpha;
  ctx.fillStyle = light;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function signatureGuide(ctx, y, size, active) {
  const top = y - size / 2;
  ctx.globalAlpha = active ? .08 : .15;
  const guide = ctx.createLinearGradient(0, top, 0, top + size);
  guide.addColorStop(0, "#54e5dc");
  guide.addColorStop(.50, "transparent");
  guide.addColorStop(1, "#54e5dc");
  ctx.fillStyle = guide;
  ctx.fillRect(0, top, viewport.width, size);
  ctx.strokeStyle = "#a7fff2";
  ctx.globalAlpha = active ? .50 : .77;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  for (const edge of [top, top + size]) {
    ctx.moveTo(0, edge);
    ctx.lineTo(viewport.width, edge);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function traceSignatureFront(ctx, hazard, progress, top, bottom, offset) {
  const steps = 14;
  for (let index = 0; index <= steps; index++) {
    const y = top + (bottom - top) * index / steps;
    const x = alienTideX(hazard, y, progress) + offset;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

function waterCrestX(hazard, progress, y, offset, curl) {
  const phase = y / 41 + progress * 26;
  const turbulence = curl * (Math.sin(phase) * .65 + Math.sin(phase * 2.38 + 3.4) * .35);
  return alienTideX(hazard, y, progress) + offset + turbulence;
}

function traceWaterFront(ctx, hazard, progress, top, bottom, offset, curl) {
  const samples = 30;
  for (let i = 0; i <= samples; i++) {
    const y = top + (bottom - top) * i / samples;
    const x = waterCrestX(hazard, progress, y, offset, curl);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

function traceWaterShore(ctx, x, rear, y, inward, amplitude, progress, reverse = false) {
  for (let i = 0; i <= 18; i++) {
    const t = reverse ? (18 - i) / 18 : i / 18;
    const phase = t * 24 - progress * 27;
    const ripple = .34 + Math.sin(phase) * .22 + Math.cos(phase * 2.46) * .14;
    ctx.lineTo(x + (rear - x) * t, y + inward * amplitude * ripple * Math.sin(Math.PI * t));
  }
}

function drawWaterFront(ctx, hazard, progress, top, bottom, material, quiet) {
  const depth = hazard.thickness;
  const direction = hazard.direction;
  const edge = direction * depth * .5;
  const curl = depth * (quiet ? .026 : .09);
  const gapBelow = top === 0;
  const shoreY = gapBelow ? bottom : top;
  const shoreX = waterCrestX(hazard, progress, shoreY, edge, curl);
  const shoreRear = alienTideX(hazard, shoreY, progress) - direction * depth * 2.15;
  const inward = gapBelow ? -1 : 1;
  const shoreWidth = Math.min(quiet ? 7 : 20, (bottom - top) * .6);
  const center = alienTideX(hazard, (top + bottom) / 2, progress);
  const water = ctx.createLinearGradient(center - direction * depth * 2.1, 0,
    center + direction * depth * .55, 0);
  water.addColorStop(0, "transparent");
  water.addColorStop(.25, "#071731");
  water.addColorStop(.54, "#103b60");
  water.addColorStop(.72, "#1688a1");
  water.addColorStop(.88, "#39bac6");
  water.addColorStop(.96, "#9df2ee");
  water.addColorStop(1, "#dcfff9");
  ctx.fillStyle = water;
  ctx.globalAlpha = .90;
  ctx.beginPath();
  traceWaterFront(ctx, hazard, progress, top, bottom, edge, curl);
  if (gapBelow) traceWaterShore(ctx, shoreX, shoreRear, shoreY, inward, shoreWidth, progress);
  ctx.lineTo(alienTideX(hazard, bottom, progress) - direction * depth * 2.15, bottom);
  ctx.lineTo(alienTideX(hazard, top, progress) - direction * depth * 2.15, top);
  if (!gapBelow) traceWaterShore(ctx, shoreX, shoreRear, shoreY, inward, shoreWidth, progress, true);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (!quiet && typeof drawHadalSurface === "function") {
    const left = direction < 0 ? center - depth * .74 : center - depth * 2.32;
    drawHadalSurface(ctx, left, top, depth * 3.06, bottom - top, hazard.age, direction > 0);
  }
  ctx.strokeStyle = "#03223a";
  ctx.globalAlpha = .34;
  ctx.lineWidth = depth * .28;
  ctx.beginPath();
  traceWaterFront(ctx, hazard, progress, top, bottom, edge - direction * depth * .71, curl * 1.7);
  ctx.stroke();

  const foam = ctx.createLinearGradient(shoreX, 0, shoreRear, 0);
  foam.addColorStop(0, "#e3fff7");
  foam.addColorStop(.36, "#90e4db");
  foam.addColorStop(1, "transparent");
  ctx.strokeStyle = foam;
  ctx.globalAlpha = .65;
  ctx.lineWidth = quiet ? 4 : 8;
  ctx.beginPath();
  ctx.moveTo(shoreX, shoreY);
  traceWaterShore(ctx, shoreX, shoreRear, shoreY, inward, shoreWidth, progress);
  ctx.stroke();

  if (!quiet) {
    ctx.lineCap = "round";
    for (let i = 0; i < 22; i++) {
      const r = (i * .618034) % 1;
      const y = top + (bottom - top) * (i + .35) / 22;
      const crest = alienTideX(hazard, y, progress);
      const phase = progress * 43 + i * 2.38;
      const lift = (8 + 23 * r) * (1 + .28 * Math.sin(phase));
      const tip = crest + direction * depth * (.33 + .16 * Math.cos(phase));
      const tail = tip - direction * depth * (.63 + 1.1 * r);
      ctx.strokeStyle = r > .50 ? material.spark : "#5cc2c9";
      ctx.globalAlpha = .14 + .39 * r;
      ctx.lineWidth = .7 + r * 2.6;
      ctx.beginPath();
      ctx.moveTo(tail, y + lift * .32);
      ctx.bezierCurveTo(tip - direction * depth * .84, y + lift * .59,
        tip - direction * depth * .56, y - lift * 1.2, tip, y - lift * .29);
      ctx.stroke();
    }
  }
  ctx.restore();

  ctx.strokeStyle = "#c9fff6";
  ctx.lineWidth = quiet ? 1.4 : 2.7;
  ctx.globalAlpha = .83;
  ctx.beginPath();
  traceWaterFront(ctx, hazard, progress, top, bottom, edge, curl);
  ctx.stroke();

  if (quiet) return;
  ctx.lineCap = "round";
  for (let i = 0; i < 38; i++) {
    const r = (i * .618034) % 1;
    const t = (progress * (1.38 + r) + r) % 1;
    const y = top + (bottom - top) * (i + .5) / 38;
    const x = alienTideX(hazard, y, progress) + edge + direction * depth * (.02 + t * .32);
    ctx.globalAlpha = .64 * (1 - t) ** 1.2;
    ctx.strokeStyle = i % 4 ? "#a1e3e3" : "#effffa";
    ctx.lineWidth = .6 + r * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + direction * (4 + 9 * r) * (1 - t), y - 1 - 5 * t);
    ctx.stroke();
  }
}

function fillSignatureFront(ctx, hazard, progress, top, bottom, material, quiet) {
  if (hazard.material === "water") {
    drawWaterFront(ctx, hazard, progress, top, bottom, material, quiet);
    return;
  }
  const half = hazard.thickness / 2;
  const front = hazard.direction * half;
  const back = -front;
  const middle = (top + bottom) / 2;
  const x = alienTideX(hazard, middle, progress);
  const fill = ctx.createLinearGradient(x + back * 1.9, 0, x + front * 1.12, 0);
  fill.addColorStop(0, "transparent");
  fill.addColorStop(.33, material.dark);
  fill.addColorStop(.67, material.mid);
  fill.addColorStop(.88, material.rim);
  fill.addColorStop(1, "transparent");
  ctx.globalAlpha = .79;
  ctx.fillStyle = fill;
  ctx.beginPath();
  traceSignatureFront(ctx, hazard, progress, top, bottom, front);
  const steps = 14;
  for (let index = steps; index >= 0; index--) {
    const y = top + (bottom - top) * index / steps;
    ctx.lineTo(alienTideX(hazard, y, progress) + back * 1.73, y);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = material.rim;
  ctx.globalAlpha = quiet ? .84 : .94;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  traceSignatureFront(ctx, hazard, progress, top, bottom, front);
  ctx.stroke();
  if (quiet) return;

  // Depth is indicated by darker creases behind the leading edge, followed by
  // a few bright crests on top. Their density stays fixed with window size.
  ctx.globalAlpha = .40;
  ctx.strokeStyle = material.spark;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (let index = 0; index < 5; index++) {
    traceSignatureFront(ctx, hazard, progress, top, bottom,
      front - hazard.direction * hazard.thickness * (.14 + .19 * index));
  }
  ctx.stroke();
  for (let index = 0; index < 13; index++) {
    const y = top + (bottom - top) * (index + .35) / 13;
    const crest = alienTideX(hazard, y, progress);
    const depth = .61 + .38 * Math.sin(index * 3.9 + progress * 15);
    const lateral = hazard.direction * hazard.thickness;
    const tip = crest + lateral * (.24 + depth * .37);
    const tail = crest - lateral * (.42 + depth * .41);
    ctx.globalAlpha = .34 + depth * .52;
    ctx.fillStyle = index % 3 ? material.mid : material.rim;
    ctx.strokeStyle = index % 3 ? material.rim : material.spark;
    ctx.beginPath();
    ctx.moveTo(tail, y + 4);
    if (hazard.material === "bone" || hazard.material === "chitin") {
      ctx.bezierCurveTo(crest, y - 13, tip, y - 16, tip, y + 4);
      ctx.quadraticCurveTo(crest, y + 14, tail, y + 8);
    } else if (hazard.material === "silk" || hazard.material === "nerve" || hazard.material === "plasma") {
      ctx.lineTo(crest - lateral * .10, y - 9);
      ctx.lineTo(crest + lateral * .19, y + 6);
      ctx.lineTo(tip, y - 2);
    } else {
      ctx.bezierCurveTo(crest - lateral * .32, y - 10, crest + lateral * .22, y + 14, tip, y - 4);
      ctx.quadraticCurveTo(crest, y + 11, tail, y + 4);
    }
    if (hazard.material !== "plasma") ctx.fill();
    ctx.stroke();
  }
}

function drawSignatureTide(ctx, hazard, material, active, progress, quiet) {
  const gap = alienTideGap(hazard, progress);
  signatureGuide(ctx, gap, hazard.gapSize, active);
  const edge = hazard.direction < 0 ? viewport.width : 0;
  if (!active) {
    const reach = Math.min(viewport.width * .20, 130);
    const gradient = ctx.createLinearGradient(edge, 0, edge + hazard.direction * reach, 0);
    gradient.addColorStop(0, material.mid);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.globalAlpha = .38;
    ctx.fillRect(Math.min(edge, edge + hazard.direction * reach), 0, reach, viewport.height);
    ctx.globalAlpha = .84;
    ctx.strokeStyle = material.rim;
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 9]);
    ctx.beginPath();
    ctx.moveTo(edge + hazard.direction * 16, 0);
    ctx.lineTo(edge + hazard.direction * 16, viewport.height);
    ctx.stroke();
    return;
  }
  const top = Math.max(0, gap - hazard.gapSize / 2);
  const bottom = Math.min(viewport.height, gap + hazard.gapSize / 2);
  if (top > 0) fillSignatureFront(ctx, hazard, progress, 0, top, material, quiet);
  if (bottom < viewport.height) fillSignatureFront(ctx, hazard, progress, bottom, viewport.height, material, quiet);
}

function drawSignatureFilament(ctx, hazard, material, active, progress, quiet) {
  const { x1, y1, x2, y2 } = alienFilamentPose(hazard, progress);
  const length = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
  const nx = -(y2 - y1) / length;
  const ny = (x2 - x1) / length;
  const a = hazard.thickness / 2 * (hazard.flare ? .58 : 1);
  const b = hazard.thickness / 2 * (hazard.flare ? 1.33 : 1);
  const bloom = ctx.createLinearGradient(x1 + nx * a, y1 + ny * a, x1 - nx * a, y1 - ny * a);
  bloom.addColorStop(0, material.dark);
  bloom.addColorStop(.18, material.mid);
  bloom.addColorStop(.52, material.rim);
  bloom.addColorStop(.75, material.mid);
  bloom.addColorStop(1, material.dark);
  ctx.globalAlpha = active ? .78 : .14;
  ctx.fillStyle = bloom;
  ctx.strokeStyle = material.rim;
  ctx.beginPath();
  ctx.moveTo(x1 + nx * a, y1 + ny * a);
  ctx.lineTo(x2 + nx * b, y2 + ny * b);
  ctx.lineTo(x2 - nx * b, y2 - ny * b);
  ctx.lineTo(x1 - nx * a, y1 - ny * a);
  ctx.closePath();
  ctx.fill();
  if (!active) ctx.setLineDash([12, 8]);
  ctx.globalAlpha = active ? .58 : .8;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.setLineDash([]);
  if (!active) {
    if (hazard.swingY) {
      const farEdge = alienFilamentPose(hazard, .5);
      ctx.globalAlpha = .32;
      ctx.fillStyle = material.mid;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(farEdge.x2, farEdge.y2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = .62;
      ctx.setLineDash([6, 9]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(farEdge.x2, farEdge.y2);
      ctx.stroke();
    }
    return;
  }

  ctx.strokeStyle = material.spark;
  ctx.globalAlpha = .94;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  const points = 20;
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const offset = quiet ? 0 : Math.sin(i * 12.5 + progress * 14) * (a + (b - a) * t) * .56;
    const x = x1 + (x2 - x1) * t + nx * offset;
    const y = y1 + (y2 - y1) * t + ny * offset;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  if (!quiet && x1 >= 0) signatureGlow(ctx, x1, y1, 80, material, .32);
}

function drawSignatureVortex(ctx, hazard, material, active, progress, quiet) {
  const { x, y, radius } = hazard;
  const core = alienVortexCore(hazard, progress);
  const field = ctx.createRadialGradient(x - radius * .12, y - radius * .12, 0, x, y, radius * 1.05);
  field.addColorStop(0, material.dark);
  field.addColorStop(.35, material.mid);
  field.addColorStop(.64, material.dark);
  field.addColorStop(1, "transparent");
  ctx.globalAlpha = active ? .91 : .27;
  ctx.fillStyle = field;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = active ? .5 : .9;
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = material.rim;
  ctx.setLineDash(active ? [] : [10, 7]);
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = material.dark;
  ctx.globalAlpha = active ? .84 : .26;
  ctx.beginPath(); ctx.arc(x, y, core, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = .94;
  ctx.strokeStyle = material.spark;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  if (quiet) return;

  const gradient = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
  gradient.addColorStop(0, material.rim);
  gradient.addColorStop(.53, material.mid);
  gradient.addColorStop(.72, material.spark);
  gradient.addColorStop(1, material.rim);
  const spin = progress * Math.PI * (hazard.spin || 1);
  const water = hazard.material === "water";
  for (let arm = 0; arm < 7; arm++) {
    const angle = arm * Math.PI * 2 / 7 + spin;
    ctx.strokeStyle = gradient;
    ctx.globalAlpha = active ? .66 : .38;
    ctx.lineWidth = arm % 3 ? 2.5 : 5;
    ctx.beginPath();
    for (let step = 0; step <= 14; step++) {
      const ratio = step / 14;
      const turn = angle + ratio * (hazard.spin === 0 ? .46 : 2.4);
      const radial = core * .93 + (radius * .99 - core * .93) * ratio ** 1.4;
      const px = x + Math.cos(turn) * radial;
      const py = y + Math.sin(turn) * radial;
      if (step === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    if (!water || !active) continue;
    ctx.strokeStyle = material.spark;
    ctx.lineWidth = 1;
    ctx.globalAlpha = .44;
    ctx.beginPath();
    for (let step = 0; step < 9; step++) {
      const ratio = (progress * (1.6 + arm * .12) + step / 9) % 1;
      const turn = angle + ratio * 2.4 + .05 + Math.sin(step * 2.4) * .07;
      const radial = core + (radius * .93 - core) * ratio ** 1.4;
      const px = x + Math.cos(turn) * radial;
      const py = y + Math.sin(turn) * radial;
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.sin(turn) * (2 + step % 4), py - Math.cos(turn) * (2 + step % 4));
    }
    ctx.stroke();
  }
}

function drawSignatureRing(ctx, hazard, material, active, progress, quiet) {
  const { x, y } = hazard;
  const radius = alienRingRadius(hazard, progress);
  if (!active) signatureGlow(ctx, x, y, hazard.radius * 1.06, material, .23);
  ctx.strokeStyle = material.rim;
  ctx.globalAlpha = active ? .30 : .72;
  ctx.lineWidth = active ? hazard.thickness * 1.02 : 1.8;
  ctx.setLineDash(active ? [] : [8, 9]);
  ctx.beginPath(); ctx.arc(x, y, active ? radius : hazard.radius, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = .96;
  ctx.strokeStyle = active ? material.spark : material.rim;
  ctx.lineWidth = active ? 3 : 1.5;
  if (active && !quiet) {
    ctx.shadowBlur = 12;
    ctx.shadowColor = material.rim;
  }
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowBlur = 0;
  if (quiet || !active) return;
  ctx.globalAlpha = .55;
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = material.rim;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8 + progress * .4;
    const size = (6 + i % 4 * 4) * Math.sin(progress * Math.PI);
    ctx.moveTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    ctx.lineTo(x + Math.cos(angle) * (radius + size), y + Math.sin(angle) * (radius + size));
  }
  ctx.stroke();
}

function drawSignatureImpact(ctx, hazard, material, active, progress, quiet) {
  const { x, y, radius } = hazard;
  signatureGlow(ctx, x, y, radius * 1.36, material, active ? .62 * (1 - progress * .66) : .25);
  ctx.strokeStyle = material.rim;
  ctx.globalAlpha = .90;
  ctx.lineWidth = active ? 3 : 1.7;
  ctx.setLineDash(active ? [] : [10, 6]);
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = material.spark;
  ctx.globalAlpha = .81;
  const amount = active ? .22 + .76 * Math.sqrt(progress) : .79;
  ctx.beginPath(); ctx.arc(x, y, radius * amount, 0, Math.PI * 2); ctx.stroke();
  if (!active || quiet) return;
  ctx.globalAlpha = .68 * (1 - progress);
  ctx.beginPath();
  for (let i = 0; i < 15; i++) {
    const angle = i * Math.PI * 2 / 15;
    const r = radius * (.23 + progress * .56 + (i % 4) * .048);
    ctx.moveTo(x + Math.cos(angle) * r * .78, y + Math.sin(angle) * r * .78);
    ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }
  ctx.stroke();
}

function drawAlienSignatureHazard(ctx, hazard, quiet) {
  const material = signatureMaterials[hazard.material];
  if (!material) return false;
  const active = hazard.age >= hazard.warning;
  const progress = signatureProgress(hazard);
  ctx.save();
  if (hazard.kind === "tide") drawSignatureTide(ctx, hazard, material, active, progress, quiet);
  else if (hazard.kind === "vortex") drawSignatureVortex(ctx, hazard, material, active, progress, quiet);
  else if (hazard.kind === "filament") drawSignatureFilament(ctx, hazard, material, active, progress, quiet);
  else if (hazard.kind === "ring") drawSignatureRing(ctx, hazard, material, active, progress, quiet);
  else if (hazard.kind === "zone") drawSignatureImpact(ctx, hazard, material, active, progress, quiet);
  else { ctx.restore(); return false; }
  ctx.restore();
  return true;
}
