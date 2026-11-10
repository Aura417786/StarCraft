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

function signatureGuide(ctx, y, size, active, direction = -1, right = viewport.width) {
  const top = y - size / 2, bottom = y + size / 2;
  ctx.save();
  const edgeLight = ctx.createLinearGradient(0, 0, right, 0);
  edgeLight.addColorStop(0, "transparent");
  edgeLight.addColorStop(.19, "#72e7d6");
  edgeLight.addColorStop(.81, "#72e7d6");
  edgeLight.addColorStop(1, "transparent");
  ctx.strokeStyle = edgeLight;
  ctx.globalAlpha = active ? .56 : .83;
  ctx.lineWidth = active ? 1 : 1.6;
  ctx.beginPath();
  for (const [edge, inward] of [[top, 1], [bottom, -1]]) {
    ctx.moveTo(0, edge);
    ctx.lineTo(right, edge);
    for (const x of [right * .16, right * .48, right * .80]) {
      ctx.moveTo(x - 10, edge + inward * 10);
      ctx.lineTo(x, edge + inward * 3);
      ctx.lineTo(x + 10, edge + inward * 10);
    }
  }
  ctx.stroke();
  if (!active && size > 30) {
    // The arrows show the approaching front's direction from inside the gap.
    ctx.globalAlpha = .68;
    ctx.beginPath();
    for (let mark = 0; mark < 3; mark++) {
      const x = right * .78 - direction * mark * 15;
      ctx.moveTo(x - direction * 6, y - 7);
      ctx.lineTo(x, y);
      ctx.lineTo(x - direction * 6, y + 7);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function traceSignatureFront(ctx, crestAt, top, bottom, offset) {
  const steps = 14;
  for (let index = 0; index <= steps; index++) {
    const y = top + (bottom - top) * index / steps;
    const x = crestAt(y) + offset;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

function waveRoll(y, age) {
  const large = Math.sin(y * .031 - age * 8.1);
  const small = Math.sin(y * .087 + age * 12.5) * .38;
  const ripples = Math.sin(y * .19 - age * 17) * .17;
  return (large + small + ripples) / 1.55;
}

function traceWaveEdge(ctx, crestAt, top, bottom, direction, age, width, offset, amplitude, reverse = false) {
  const steps = Math.max(3, Math.min(44, Math.ceil((bottom - top) / 12)));
  for (let step = 0; step <= steps; step++) {
    const t = reverse ? 1 - step / steps : step / steps;
    const y = top + (bottom - top) * t;
    const x = crestAt(y) + direction * width * (offset + waveRoll(y, age) * amplitude);
    if (!step && !reverse) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
}

function traceWaveShore(ctx, crestAt, y, direction, age, width, inward, reverse) {
  const center = crestAt(y);
  const rear = -3.5 + waveRoll(y, age + .37) * .65;
  for (let step = 0; step <= 12; step++) {
    const t = reverse ? 1 - step / 12 : step / 12;
    const roll = .54 + .32 * Math.sin(t * 22 - age * 11) + .11 * Math.sin(t * 47 + age * 7);
    const lift = width * .66 * Math.sin(t * Math.PI) * roll;
    ctx.lineTo(center + direction * width * (1 + (rear - 1) * t), y + inward * lift);
  }
}

function drawWaterSection(ctx, crestAt, top, bottom, direction, age, width, material, warning, quiet) {
  const midY = (top + bottom) / 2;
  const center = crestAt(midY);
  const frontX = center + direction * width;
  const rearX = center - direction * width * 3.8;
  if (Math.max(frontX, rearX) < -width || Math.min(frontX, rearX) > viewport.width + width) return;

  // The collision band is drawn at its true width. Low-alpha wake can trail beyond it.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, viewport.width, bottom - top);
  ctx.clip();
  const volume = ctx.createLinearGradient(rearX, 0, frontX, 0);
  volume.addColorStop(0, "transparent");
  volume.addColorStop(.27, material.dark);
  volume.addColorStop(.52, "#0b3e62");
  volume.addColorStop(.70, material.mid);
  volume.addColorStop(.87, "#167f9c");
  volume.addColorStop(.97, material.rim);
  volume.addColorStop(1, "transparent");
  ctx.globalAlpha = warning ? .52 : .93;
  ctx.fillStyle = volume;
  ctx.beginPath();
  traceWaveEdge(ctx, crestAt, top, bottom, direction, age, width, 1, 0);
  if (bottom < viewport.height) traceWaveShore(ctx, crestAt, bottom, direction, age, width, -1, false);
  traceWaveEdge(ctx, crestAt, top, bottom, direction, age + .37, width, -3.5, .65, true);
  if (top > 0) traceWaveShore(ctx, crestAt, top, direction, age, width, 1, true);
  ctx.closePath();
  ctx.fill();

  // Moving surface normals come from the Blender Ocean atlas on supported GPUs.
  ctx.save();
  ctx.clip();
  if (!quiet && typeof drawHadalSurface === "function") {
    drawHadalSurface(ctx, Math.min(frontX, rearX), top, Math.abs(frontX - rearX),
      bottom - top, age, direction > 0);
  }
  ctx.strokeStyle = material.dark;
  ctx.lineWidth = width * .45;
  ctx.globalAlpha = warning ? .22 : .48;
  for (const offset of [-1.8, -.64]) {
    ctx.beginPath();
    traceWaveEdge(ctx, crestAt, top, bottom, direction, age + offset * .16, width, offset, .28);
    ctx.stroke();
  }
  ctx.restore();

  const swell = ctx.createLinearGradient(center - direction * width * 1.55, 0, frontX, 0);
  swell.addColorStop(0, "transparent");
  swell.addColorStop(.53, material.rim);
  swell.addColorStop(.82, material.spark);
  swell.addColorStop(1, material.rim);
  ctx.strokeStyle = swell;
  ctx.globalAlpha = warning ? .44 : .64;
  ctx.lineWidth = quiet ? 1.4 : 3.3;
  const shore = top > 0 ? top : bottom < viewport.height ? bottom : null;
  if (shore !== null) {
    ctx.beginPath();
    ctx.moveTo(crestAt(shore) + direction * width, shore);
    traceWaveShore(ctx, crestAt, shore, direction, age, width, top > 0 ? 1 : -1, false);
    ctx.stroke();
  }
  ctx.globalAlpha = warning ? .58 : .91;
  ctx.lineWidth = quiet ? 2 : 3.6;
  ctx.beginPath();
  traceWaveEdge(ctx, crestAt, top, bottom, direction, age, width, .67, .28);
  ctx.stroke();
  ctx.globalAlpha = warning ? .38 : .65;
  ctx.strokeStyle = material.rim;
  ctx.lineWidth = 1.45;
  ctx.beginPath();
  traceWaveEdge(ctx, crestAt, top, bottom, direction, age, width, 1, 0);
  ctx.stroke();
  ctx.beginPath();
  traceWaveEdge(ctx, crestAt, top, bottom, direction, age, width, -1, 0);
  ctx.stroke();

  if (!quiet) {
    // Curling foam ribbons with alternating high specular and deep water behind them.
    const strands = Math.min(18, Math.max(3, Math.ceil((bottom - top) / 23)));
    for (let i = 0; i < strands; i++) {
      const t = (i * .618034) % 1;
      const y = top + (bottom - top) * (i + .45) / strands;
      const roll = waveRoll(y, age + t * .16);
      const lift = 8 + 26 * t;
      const x = crestAt(y) + direction * width * (.60 + .26 * roll);
      ctx.globalAlpha = (warning ? .30 : .60) * (.27 + t * .73);
      ctx.strokeStyle = i % 3 ? swell : material.spark;
      ctx.lineWidth = .7 + t * 2.1;
      ctx.beginPath();
      ctx.moveTo(x - direction * width * (1.1 + t * 1.78), y + lift * .47);
      ctx.bezierCurveTo(x - direction * width * .96, y + lift * .75,
        x - direction * width * .19, y - lift, x, y);
      ctx.bezierCurveTo(x + direction * width * .06, y + lift * .11,
        x - direction * width * .15, y + lift * .57, x - direction * width * .57, y + lift * .40);
      ctx.stroke();
    }

    // Foreground spray is thin and soft, leaving the two exact danger edges visible.
    const drops = Math.min(23, Math.max(4, Math.ceil((bottom - top) / 18)));
    ctx.lineCap = "round";
    for (let i = 0; i < drops; i++) {
      const r = (i * .618034) % 1;
      const t = (age * (.66 + r * .51) + r) % 1;
      const y = top + (bottom - top) * (i + .5) / drops + Math.sin(i * 2.4) * t * 14;
      const x = crestAt(y) + direction * width * (.55 + t * 1.35);
      ctx.globalAlpha = (warning ? .39 : .66) * (1 - t) ** 1.6;
      ctx.strokeStyle = i % 4 ? material.rim : material.spark;
      ctx.lineWidth = .7 + r * 2.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + direction * (5 + 16 * r) * (1 - t), y - (2 + 7 * r) * t);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawWaterWall(ctx, { crestAt, gap, size, direction, halfWidth, age, warning, material }, quiet) {
  signatureGuide(ctx, gap, size, !warning, direction);
  const bounds = [[0, Math.max(0, gap - size / 2)],
    [Math.min(viewport.height, gap + size / 2), viewport.height]];
  for (const [top, bottom] of bounds) {
    if (bottom > top) drawWaterSection(ctx, crestAt, top, bottom, direction, age, halfWidth, material, warning, quiet);
  }
  // A short lens mist follows the impact near the pilot without covering the gap.
  if (quiet || warning) return;
  const distance = Math.abs(player.x - crestAt(player.y));
  const strength = .18 * Math.max(0, 1 - distance / Math.max(120, halfWidth * 3));
  if (strength <= 0) return;
  const waterFilm = ctx.createLinearGradient(0, 0, 0, viewport.height);
  waterFilm.addColorStop(0, material.rim);
  waterFilm.addColorStop(.13, "transparent");
  waterFilm.addColorStop(.87, "transparent");
  waterFilm.addColorStop(1, material.rim);
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.fillStyle = waterFilm;
  for (const [top, bottom] of bounds) ctx.fillRect(0, top, viewport.width, Math.max(0, bottom - top));
  ctx.restore();
}

function fillSignatureFront(ctx, hazard, crestAt, phase, top, bottom, material, active, quiet) {
  const half = hazard.thickness / 2;
  const front = hazard.direction * half;
  const back = -front;
  const middle = (top + bottom) / 2;
  const x = crestAt(middle);
  const fill = ctx.createLinearGradient(x + back * 1.9, 0, x + front * 1.12, 0);
  fill.addColorStop(0, "transparent");
  fill.addColorStop(.33, material.dark);
  fill.addColorStop(.67, material.mid);
  fill.addColorStop(.88, material.rim);
  fill.addColorStop(1, "transparent");
  ctx.globalAlpha = active ? .79 : .48;
  ctx.fillStyle = fill;
  ctx.beginPath();
  traceSignatureFront(ctx, crestAt, top, bottom, front);
  const steps = 14;
  for (let index = steps; index >= 0; index--) {
    const y = top + (bottom - top) * index / steps;
    ctx.lineTo(crestAt(y) + back * 1.73, y);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = material.rim;
  ctx.globalAlpha = quiet ? .84 : .94;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  traceSignatureFront(ctx, crestAt, top, bottom, front);
  ctx.stroke();


  // Depth is indicated by darker creases behind the leading edge, followed by
  // a few bright crests on top. Their density stays fixed with window size.
  ctx.globalAlpha = active ? .40 : .28;
  ctx.strokeStyle = material.spark;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (let index = 0; index < 5; index++) {
    traceSignatureFront(ctx, crestAt, top, bottom,
      front - hazard.direction * hazard.thickness * (.14 + .19 * index));
  }
  ctx.stroke();
  for (let index = 0; index < (quiet ? 7 : 13); index++) {
    const y = top + (bottom - top) * (index + .35) / (quiet ? 7 : 13);
    const crest = crestAt(y);
    const depth = .61 + .38 * Math.sin(index * 3.9 + phase);
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
    } else if (hazard.material === "silk") {
      ctx.bezierCurveTo(crest - lateral * .40, y - 20, crest + lateral * .16, y + 19, tip, y - 3);
      ctx.bezierCurveTo(crest + lateral * .15, y + 17, crest - lateral * .35, y - 15, tail, y + 4);
    } else if (hazard.material === "nerve" || hazard.material === "plasma") {
      ctx.lineTo(crest - lateral * .10, y - 9);
      ctx.lineTo(crest + lateral * .19, y + 6);
      ctx.lineTo(tip, y - 2);
    } else {
      ctx.bezierCurveTo(crest - lateral * .32, y - 10, crest + lateral * .22, y + 14, tip, y - 4);
      ctx.quadraticCurveTo(crest, y + 11, tail, y + 4);
    }
    if (!["plasma", "silk", "nerve"].includes(hazard.material)) ctx.fill();
    ctx.stroke();
  }
}

function drawSignatureTide(ctx, hazard, material, active, progress, quiet) {
  const gap = alienTideGap(hazard, progress);
  const edge = hazard.direction < 0 ? viewport.width : 0;
  if (hazard.material === "water") {
    const halfWidth = hazard.thickness / 2;
    const approach = clamp(hazard.age / hazard.warning, 0, 1);
    const crestAt = active ? y => alienTideX(hazard, y, progress)
      : y => edge + hazard.direction * halfWidth * (.62 + approach * .65 + .25 * waveRoll(y, hazard.age));
    drawWaterWall(ctx, { crestAt, gap, size: hazard.gapSize, direction: hazard.direction,
      halfWidth, age: hazard.age, warning: !active, material }, quiet);
    return;
  }
  signatureGuide(ctx, gap, hazard.gapSize, active, hazard.direction);
  const warningTravel = clamp(hazard.age / hazard.warning, 0, 1);
  const crestAt = active ? y => alienTideX(hazard, y, progress)
    : y => edge + hazard.direction * hazard.thickness * (.37 + .41 * warningTravel
      + .14 * Math.sin(y * .028 - hazard.age * 6));
  const top = Math.max(0, gap - hazard.gapSize / 2);
  const bottom = Math.min(viewport.height, gap + hazard.gapSize / 2);
  if (top > 0) fillSignatureFront(ctx, hazard, crestAt, hazard.age * 7, 0, top, material, active, quiet);
  if (bottom < viewport.height) fillSignatureFront(ctx, hazard, crestAt, hazard.age * 7, bottom,
    viewport.height, material, active, quiet);
}

function drawRayOrganic(ctx, kind, material, length, left, right, age, quiet) {
  const points = quiet ? 13 : Math.max(20, Math.min(48, Math.ceil(length / 19)));
  const time = quiet ? 0 : age;
  ctx.strokeStyle = material.spark;
  ctx.lineWidth = 1.4;
  ctx.fillStyle = material.mid;
  ctx.beginPath();
  if (kind === "bone" || kind === "chitin") {
    const pieces = quiet ? 9 : 18;
    for (let i = 0; i < pieces; i++) {
      const t = i / pieces;
      const x = length * t;
      const plate = length / pieces;
      const half = left + (right - left) * t;
      const side = i % 2 ? -1 : 1;
      const tilt = quiet ? 0 : .3 * Math.sin(i * .83 - age * 13);
      ctx.moveTo(x, half * -.37 * side);
      ctx.quadraticCurveTo(x + plate * .23, half * (-.9 + tilt) * side, x + plate * .89, half * .7 * side);
      ctx.quadraticCurveTo(x + plate * .33, half * (.94 + tilt) * side, x, half * -.37 * side);
      ctx.closePath();
    }
    ctx.fill();
  } else if (kind === "silk" || kind === "water") {
    const strands = quiet ? 3 : 5;
    for (let strand = 0; strand < strands; strand++) {
      for (let i = 0; i <= points; i++) {
        const t = i / points;
        const half = left + (right - left) * t;
        const twist = Math.sin(t * (kind === "silk" ? 13 : 8) - time * 8 + strand * .91);
        const weave = (strand / (strands - 1) - .5) * 1.12 + twist * .36;
        const y = half * weave * Math.sin(Math.PI * t) ** .35;
        if (i) ctx.lineTo(length * t, y); else ctx.moveTo(0, y);
      }
    }
  } else if (kind === "void") {
    for (const sign of [-1, 1]) {
      for (let i = 0; i <= points; i++) {
        const t = i / points;
        const half = left + (right - left) * t;
        const yaw = .57 + .30 * Math.sin(i * 2.7 - time * 8);
        if (i) ctx.lineTo(length * t, yaw * half * sign);
        else ctx.moveTo(0, yaw * half * sign);
      }
    }
  } else {
    for (let i = 0; i <= points; i++) {
      const t = i / points;
      const x = length * t;
      const half = left + (right - left) * t;
      const jagged = kind === "nerve" || kind === "glass";
      const phase = jagged ? i * 2.76 : t * 17;
      const y = half * (jagged ? .48 : .22) * Math.sin(phase - time * 15);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(0, y);
      if (kind === "nerve" && i % 4 === 2) {
        ctx.lineTo(x + length / points * .52, -y * .83);
        ctx.moveTo(x, y);
      }
    }
  }
  ctx.stroke();
}

function drawMaterialRay(ctx, { x1, y1, x2, y2, left, right, kind, active, phase, age }, quiet) {
  const dx = x2 - x1, dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const material = signatureMaterials[kind] || signatureMaterials.plasma;
  ctx.save();
  ctx.translate(x1, y1);
  ctx.rotate(Math.atan2(dy, dx));
  const width = Math.max(left, right, 1);
  const depth = ctx.createLinearGradient(0, -width, 0, width);
  depth.addColorStop(0, material.rim);
  depth.addColorStop(.24, material.dark);
  depth.addColorStop(.5, kind === "void" ? "#020108" : material.mid);
  depth.addColorStop(.76, material.dark);
  depth.addColorStop(1, material.rim);
  ctx.globalAlpha = active ? .82 : .24 + phase * .27;
  ctx.fillStyle = depth;
  ctx.beginPath();
  ctx.moveTo(0, -left);
  ctx.lineTo(length, -right);
  ctx.lineTo(length, right);
  ctx.lineTo(0, left);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = material.rim;
  ctx.lineWidth = active ? 1.5 : 1.1;
  ctx.globalAlpha = active ? .83 : .53 + phase * .28;
  ctx.stroke();

  ctx.save();
  ctx.clip();
  ctx.globalAlpha = active ? .94 : .48 + phase * .42;
  if (kind) {
    drawRayOrganic(ctx, kind, material, length, left, right, age, quiet);
  } else {
    const scan = active ? length : phase * length;
    const trace = ctx.createLinearGradient(0, 0, Math.max(1, scan), 0);
    trace.addColorStop(0, material.rim);
    trace.addColorStop(.73, material.rim);
    trace.addColorStop(1, material.spark);
    ctx.lineWidth = active ? Math.min(8, width * .58) : 2.7;
    ctx.strokeStyle = trace;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(scan, 0); ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(scan, -width); ctx.lineTo(scan, width); ctx.stroke();
  }
  ctx.restore();

  // Luminous apertures are separate from the track and mark its actual endpoints.
  if (!kind || kind === "plasma" || kind === "glass") {
    const cap = Math.min(8, width * .66);
    ctx.globalAlpha = active ? .94 : .64 + .26 * phase;
    ctx.fillStyle = material.spark;
    ctx.strokeStyle = material.rim;
    for (const x of [0, length]) {
      ctx.beginPath();
      ctx.ellipse(x, 0, cap * .56, cap, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawSignatureFilament(ctx, hazard, active, progress, quiet) {
  const pose = alienFilamentPose(hazard, progress);
  const left = hazard.thickness / 2 * (hazard.flare ? .58 : 1);
  const right = hazard.thickness / 2 * (hazard.flare ? 1.33 : 1);
  const phase = active ? progress : clamp(hazard.age / hazard.warning, 0, 1);
  if (!active && hazard.swingY) {
    const far = alienFilamentPose(hazard, .5);
    ctx.globalAlpha = .24;
    ctx.fillStyle = signatureMaterials[hazard.material].mid;
    ctx.beginPath();
    ctx.moveTo(pose.x1, pose.y1);
    ctx.lineTo(pose.x2, pose.y2);
    ctx.lineTo(far.x2, far.y2);
    ctx.closePath();
    ctx.fill();
    ctx.setLineDash([5, 8]);
    ctx.lineWidth = 1.45;
    ctx.strokeStyle = signatureMaterials[hazard.material].rim;
    ctx.beginPath(); ctx.moveTo(pose.x1, pose.y1); ctx.lineTo(far.x2, far.y2); ctx.stroke();
    ctx.setLineDash([]);
  }
  drawMaterialRay(ctx, { ...pose, left, right, kind: hazard.material, active, phase, age: hazard.age }, quiet);
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
  ctx.lineWidth = active ? hazard.thickness : 1.8;
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
  const warning = active ? 1 : clamp(hazard.age / hazard.warning, 0, 1);
  const well = hazard.type === "well";
  if (well) {
    const depth = ctx.createRadialGradient(x, y, 0, x, y, radius);
    depth.addColorStop(0, "#03020c");
    depth.addColorStop(.62, "#0c061b");
    depth.addColorStop(.84, material.mid);
    depth.addColorStop(1, "transparent");
    ctx.fillStyle = depth;
    ctx.globalAlpha = active ? .99 : .76;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  } else {
    signatureGlow(ctx, x, y, radius * 1.15, material, active ? .63 * (1 - progress * .55) : .23 + warning * .16);
  }
  ctx.strokeStyle = material.rim;
  ctx.globalAlpha = .87;
  ctx.lineWidth = active ? 2.65 : 1.65;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();

  const pulse = active ? .18 + .80 * Math.sqrt(progress) : 1 - .79 * warning;
  ctx.strokeStyle = material.spark;
  ctx.globalAlpha = .72;
  ctx.lineWidth = 1.65;
  ctx.beginPath(); ctx.arc(x, y, radius * pulse, 0, Math.PI * 2); ctx.stroke();
  const marks = quiet ? 4 : 12;
  ctx.strokeStyle = material.rim;
  ctx.globalAlpha = active ? .62 * (1 - progress) : .58 + warning * .23;
  ctx.beginPath();
  for (let i = 0; i < marks; i++) {
    const angle = i * Math.PI * 2 / marks + (well && !quiet ? hazard.age * .68 : 0);
    const r = radius * (active ? Math.min(.96, pulse + .11 + (i % 4) * .032) : .98);
    const cut = radius * (well ? .27 : .10) * (i % 2 ? .62 : 1);
    ctx.moveTo(x + Math.cos(angle) * (r - cut), y + Math.sin(angle) * (r - cut));
    ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }
  ctx.stroke();
}

function drawAlienSignatureHazard(ctx, hazard, quiet) {
  const material = signatureMaterials[hazard.material] || signatureMaterials.fusion;
  const active = hazard.age >= hazard.warning;
  const progress = signatureProgress(hazard);
  ctx.save();
  if (hazard.kind === "tide") drawSignatureTide(ctx, hazard, material, active, progress, quiet);
  else if (hazard.kind === "vortex") drawSignatureVortex(ctx, hazard, material, active, progress, quiet);
  else if (hazard.kind === "filament") drawSignatureFilament(ctx, hazard, active, progress, quiet);
  else if (hazard.kind === "ring") drawSignatureRing(ctx, hazard, material, active, progress, quiet);
  else if (hazard.kind === "zone") drawSignatureImpact(ctx, hazard, material, active, progress, quiet);
  else if (hazard.kind === "guide") signatureGuide(ctx, hazard.y, hazard.thickness, active, -1, hazard.right);
  else if (hazard.kind === "beam" || hazard.kind === "seam") {
    const vertical = hazard.kind === "seam";
    const half = hazard.thickness / 2;
    const phase = active ? progress : clamp(hazard.age / hazard.warning, 0, 1);
    const kind = hazard.material || (vertical ? "void" : null);
    drawMaterialRay(ctx, { x1: vertical ? hazard.x : hazard.right, y1: vertical ? 0 : hazard.y,
      x2: vertical ? hazard.x : 0, y2: vertical ? viewport.height : hazard.y, left: half, right: half,
      active, phase, kind, age: hazard.age }, quiet);
  } else { ctx.restore(); return false; }
  ctx.restore();
  return true;
}
