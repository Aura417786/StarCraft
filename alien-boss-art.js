"use strict";

// Coordinates run from -0.5 to 0.5 across the sprite, relative to its center.
// The rigid region holds the torso in place while the anatomy around it flexes.
const alienArtProfiles = [
  // Broodmother: a slow canopy breath with a quicker double beat underneath it.
  { core: [-0.08, -0.24], rigid: -0.07, flex: 0.97, fins: 5, tempo: 2.24 },
  // Stalker: mostly rigid bone, with a loose tail. Maw: a slow furnace breath.
  { core: [-0.27, -0.05], rigid: -0.06, flex: 0.44, fins: 2, tempo: 2.7,
    columns: { waves: 0.85, sway: 0.047, swell: 0.021, tail: true } },
  { core: [-0.29, -0.04], rigid: 0.02, flex: 0.76, fins: 3, tempo: 1.68, fold: 0.032 },
  // Weaver: lifted legs on alternating beats. Binder: opens its hooked claws.
  { core: [-0.13, -0.03], rigid: -0.02, flex: 0.9, fins: 7, tempo: 3.05, fold: 0.038 },
  { core: [-0.26, -0.09], rigid: -0.08, flex: 0.48, fins: 4, tempo: 1.8,
    columns: { waves: 0.7, sway: 0.019, swell: 0.026, jaws: 0.108 } },
  // Ray: broad wing folds. Wyrm: a swim stroke that grows toward the tail.
  { core: [-0.23, -0.12], rigid: 0.04, flex: 1.13, fins: 6, tempo: 1.94, fold: 0.116 },
  { core: [-0.05, -0.19], rigid: 0.01, flex: 0.56, fins: 3, tempo: 3.5,
    columns: { waves: 1.12, sway: 0.075, swell: 0.052, tail: true } },
  // Regent: uneven contractions across the mantle and the exposed spore sacs.
  { core: [-0.16, 0.18], rigid: -0.13, flex: 1.05, fins: 8, tempo: 1.41, fold: 0.064,
    sacs: [[-0.31, 0.13], [-0.06, 0.20], [0.18, 0.10]] },
  // Devourer: peristalsis moves from the mouth to tail, with separate jaw motion.
  { core: [-0.31, 0.04], rigid: -0.04, flex: 0.83, fins: 5, tempo: 3.05,
    columns: { waves: 1.42, sway: 0.032, swell: 0.137, jaws: 0.177 } },
  { core: [-0.19, -0.08], rigid: -0.11, flex: 0.37, fins: 4, tempo: 4.3,
    columns: { waves: 1.74, sway: 0.039, swell: 0.049, tail: true } },
  { core: [-0.13, -0.02], rigid: -0.03, flex: 0.81, fins: 9, tempo: 1.62, fold: 0.074,
    sacs: [[-0.13, -0.03], [0.02, -0.19], [0.12, 0.19]] },
];
const alienArtAssets = Array(alienArtProfiles.length).fill(null);
const alienArtSize = 448;
const alienArtPadding = 36;
let alienArtFrame;
let alienBroodmotherEnraged;

function loadAlienArt(path) {
  const image = new Image();
  image.decoding = "async";
  image.src = path;
  return { image, texture: null };
}

function preloadAlienBossArt(type) {
  if (!alienArtProfiles[type] || typeof Image !== "function") return null;
  alienArtAssets[type] ??= loadAlienArt(`assets/aliens/boss-${String(type + 1).padStart(2, "0")}.webp`);
  if (type === 0) alienBroodmotherEnraged ??= loadAlienArt("assets/aliens/boss-01-enraged.webp");
  return alienArtAssets[type];
}

function alienArtCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function alienArtTexture(asset) {
  if (!asset?.image.complete || !asset.image.naturalWidth) return null;
  if (!asset.texture) {
    const scale = alienArtSize / Math.max(asset.image.naturalWidth, asset.image.naturalHeight);
    const texture = alienArtCanvas(Math.max(1, Math.round(asset.image.naturalWidth * scale)),
      Math.max(1, Math.round(asset.image.naturalHeight * scale)));
    texture.getContext("2d").drawImage(asset.image, 0, 0, texture.width, texture.height);
    asset.texture = texture;
  }
  return asset.texture;
}


function alienArtTint(color, alpha) {
  return color + Math.round(alpha * 255).toString(16).padStart(2, "0");
}

function alienArtGlow(ctx, x, y, radius, color, strength) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, alienArtTint(color, strength));
  gradient.addColorStop(0.46, alienArtTint(color, strength * 0.35));
  gradient.addColorStop(1, alienArtTint(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function broodmotherArtRelease(elapsed, at, decay) {
  return elapsed < at ? 0 : Math.exp(-(elapsed - at) * decay);
}

function broodmotherArtPose(target, time, charge, quiet) {
  const enraged = !!target.enraged;
  const warning = target.phase === "telegraph";
  const attacking = target.phase === "attack";
  const elapsed = target.phaseTime || 0;
  const cycle = (time * (enraged ? 0.45 : 0.35) + 0.1) % 1;
  const pulse = Math.exp(-(((cycle - 0.21) / 0.038) ** 2)) * 0.78
    + Math.exp(-(((cycle - 0.32) / 0.05) ** 2)) * 0.41;
  const breath = quiet ? 0 : Math.sin(cycle * Math.PI * 2 - 0.3);
  const pose = { enraged, cycle, breath, canopy: (enraged ? 0.59 : 0.04) + breath * 0.22,
    coil: 0, thrust: 0, dip: 0, turn: 0, pulse: quiet ? 0.22 : pulse,
    lash: 0, side: (warning ? target.side : target.lashSide) || -1 };
  if (quiet) return pose;
  switch (target.alienAttack) {
    case "broodArc":
      pose.coil = warning ? charge : 0;
      if (attacking) pose.thrust = Math.max(broodmotherArtRelease(elapsed, 0, 4.1),
        enraged ? broodmotherArtRelease(elapsed, target.attackEvents?.[1]?.at ?? 0.63, 5.1) : 0);
      pose.canopy += 0.38 * pose.thrust - 0.24 * pose.coil;
      pose.turn = 0.1 * pose.coil - 0.055 * pose.thrust;
      break;
    case "broodSweep":
      pose.lash = attacking ? Math.min(1, target.lashPulse || 0) : charge * 0.25;
      pose.coil = warning ? 0.54 * charge : 0;
      pose.turn = pose.side * (pose.coil * -0.13 + pose.lash * 0.13);
      pose.canopy += 0.33 * pose.lash;
      break;
    case "broodSpawn":
      pose.dip = warning ? charge : 0;
      if (attacking) pose.dip = Math.max(broodmotherArtRelease(elapsed, 0, 2.7),
        enraged ? broodmotherArtRelease(elapsed, target.attackEvents?.[1]?.at ?? 0.75, 3.4) * 0.83 : 0);
      pose.canopy += pose.dip * 0.42;
      pose.turn = 0.105 * pose.dip;
      break;
  }
  return pose;
}

function alienArtStripY(y, height, pose, fold) {
  const upperCanopy = Math.max(0, 1 - y / (height * 0.63));
  const edge = y / height * 2 - 1;
  return y + height * (edge * Math.abs(edge) * fold - 0.075 * (pose?.canopy || 0) * upperCanopy ** 1.3);
}

function paintAlienArtColumns(fx, texture, profile, time, charge) {
  const { width, height } = texture;
  const { waves, sway, swell, tail, jaws } = profile.columns;
  const phase = time * profile.tempo;
  const spine = Math.round(height * 0.5);
  const columns = 28;
  const pad = alienArtPadding;
  const mapX = u => width * (u + swell * 0.12 * Math.sin(u * Math.PI) * Math.sin(u * Math.PI * 2 * waves - phase));
  for (let column = 0; column < columns; column++) {
    const from = Math.floor(column * width / columns);
    const to = Math.floor((column + 1) * width / columns);
    const pos = (from + to) * 0.5 / width;
    const wave = Math.sin(pos * Math.PI * 2 * waves - phase);
    const amplitude = tail ? pos ** 1.8 : Math.sin(pos * Math.PI) ** 0.6;
    const centerY = pad + spine + height * sway * amplitude * wave;
    const swellScale = 1 + swell * amplitude * wave;
    const jawInfluence = Math.max(0, 1 - pos / 0.48) ** 1.1 * (jaws || 0);
    const upperJaw = jawInfluence * (Math.sin(phase * 0.64 + 0.45) * 0.67 + charge * 0.3);
    const lowerJaw = jawInfluence * (Math.sin(phase * 0.64 - 0.36) + charge * 0.44);
    const upperHeight = spine * (swellScale + upperJaw);
    const lowerHeight = (height - spine) * (swellScale + lowerJaw);
    const x = Math.round(mapX(from / width));
    const band = Math.round(mapX(to / width)) - x;
    if (band <= 0 || to <= from) continue;
    fx.drawImage(texture, from, 0, to - from, spine, pad + x, centerY - upperHeight, band, upperHeight);
    fx.drawImage(texture, from, spine, to - from, height - spine, pad + x, centerY, band, lowerHeight);
  }
}

function paintBroodmotherArtVessels(fx, width, height, pose) {
  const pad = alienArtPadding;
  const heart = [pad + width * 0.42, pad + height * 0.26];
  const vessels = [
    [[0.47, 0.25], [0.55, 0.28], [0.61, 0.44]],
    [[0.49, 0.29], [0.63, 0.4], [0.69, 0.54]],
    [[0.51, 0.27], [0.63, 0.22], [0.76, 0.17]],
  ];
  fx.lineWidth = Math.max(0.9, width * 0.0034);
  for (const [index, vessel] of vessels.entries()) {
    const path = vessel.flatMap(([x, y]) => [pad + x * width, pad + y * height]);
    const wave = Math.exp(-(((pose.cycle - 0.28 - index * 0.034) / 0.06) ** 2));
    const light = fx.createLinearGradient(...heart, path[4], path[5]);
    const tissue = pose.enraged ? "#ffb7d2" : "#efadd3";
    light.addColorStop(0, alienArtTint(tissue, 0.05 + pose.pulse * 0.19));
    light.addColorStop(0.63, alienArtTint(tissue, 0.035 + wave * 0.16));
    light.addColorStop(1, alienArtTint(tissue, 0));
    fx.strokeStyle = light;
    fx.beginPath();
    fx.moveTo(...heart);
    fx.bezierCurveTo(...path);
    fx.stroke();
  }
}

function paintAlienArtFrame(texture, profile, target, color, time, charge, quiet, pose) {
  const { width, height } = texture;
  const pad = alienArtPadding;
  const frameWidth = width + 2 * pad, frameHeight = height + 2 * pad;
  alienArtFrame ??= alienArtCanvas(frameWidth, frameHeight);
  if (alienArtFrame.width !== frameWidth) alienArtFrame.width = frameWidth;
  if (alienArtFrame.height !== frameHeight) alienArtFrame.height = frameHeight;
  const fx = alienArtFrame.getContext("2d");
  fx.clearRect(0, 0, frameWidth, frameHeight);
  if ((quiet && !pose?.enraged) || target.disabled) fx.drawImage(texture, pad, pad);
  else if (profile.columns) paintAlienArtColumns(fx, texture, profile, time, charge);
  else {
    // Adjacent strips sample the same alpha silhouette. The restrained warp gives
    // fins and membranes independent travel while keeping the torso over its hitbox.
    const strips = 20;
    const fold = quiet ? 0 : (profile.fold || 0) * Math.sin(time * profile.tempo);
    for (let row = 0; row < strips; row++) {
      const y = Math.floor(row * height / strips);
      const band = Math.floor((row + 1) * height / strips) - y;
      if (band === 0) continue;
      const relativeY = (y + band * 0.5) / height - 0.5;
      const articulation = Math.abs(relativeY - profile.rigid) ** 1.6;
      const flex = quiet ? 0 : Math.sin(time * profile.tempo - relativeY * 6) + charge * relativeY;
      const shift = width * 0.085 * profile.flex * articulation * flex;
      const stretch = quiet ? 0 : width * 0.048 * profile.flex * articulation * Math.sin(time * profile.tempo * 0.78 + relativeY * 4);
      const warpedTop = Math.round(alienArtStripY(y, height, pose, fold));
      const warpedBottom = Math.round(alienArtStripY(y + band, height, pose, fold));
      fx.drawImage(texture, 0, y, width, band, pad + shift - stretch * 0.5, pad + warpedTop,
        width + stretch, warpedBottom - warpedTop);
    }
  }

  // Mask the light to the body, leaving the sprite's original transparency intact.
  fx.globalCompositeOperation = "source-atop";
  const shade = fx.createLinearGradient(pad, pad, pad + width * 0.48, pad + height);
  shade.addColorStop(0, "#a3dcf832");
  shade.addColorStop(0.42, "#819dd800");
  shade.addColorStop(1, "#0a142e46");
  fx.fillStyle = shade;
  fx.fillRect(0, 0, frameWidth, frameHeight);
  if (target.disabled) {
    fx.fillStyle = "#130d1b80";
    fx.fillRect(0, 0, frameWidth, frameHeight);
  } else {
    const pulse = quiet ? 0.5 : 0.5 + Math.sin(time * profile.tempo - 0.6) * 0.5;
    const coreX = pad + width * (0.5 + profile.core[0]);
    const coreY = pad + height * (0.5 + profile.core[1]);
    alienArtGlow(fx, coreX, coreY, width * 0.4, color,
      0.12 + pulse * 0.08 + charge * 0.28 + (target.enraged ? 0.08 : 0));
    if (pose) {
      const tissue = pose.enraged ? "#ff8abf" : "#de7dc3";
      alienArtGlow(fx, coreX, coreY, width * (0.16 + 0.044 * pose.pulse), tissue,
        0.11 + pose.pulse * 0.31 + pose.canopy * 0.15 + charge * 0.15);
      for (const [x, y] of [[0.11, -0.06], [0.19, 0.04]]) {
        alienArtGlow(fx, pad + width * (0.5 + x), pad + height * (0.5 + y), width * 0.11,
          tissue, 0.08 + pose.pulse * 0.08 + pose.dip * 0.24 + pose.lash * 0.27);
      }
      paintBroodmotherArtVessels(fx, width, height, pose);
    }
    if (profile.sacs) for (const [index, [x, y]] of profile.sacs.entries()) {
      const glow = 0.06 + 0.19 * (quiet ? 0.4 : (0.5 + 0.5 * Math.sin(time * profile.tempo - index * 1.6)) ** 3);
      alienArtGlow(fx, pad + width * (0.5 + x), pad + height * (0.5 + y), width * 0.15, color, glow);
    }
    if (target.alienFinal) alienArtGlow(fx, pad + width * 0.72, pad + height * 0.35,
      width * 0.32, "#81d8ff", 0.17 + 0.1 * charge);
    if (target.hitFlash > 0 && !quiet) {
      fx.fillStyle = alienArtTint("#ffe3cd", Math.min(0.18, target.hitFlash * 1.75));
      fx.fillRect(0, 0, frameWidth, frameHeight);
    }
  }
  fx.globalCompositeOperation = "source-over";
  return alienArtFrame;
}

function fillBroodmotherRibbon(ctx, top, bottom, material) {
  ctx.fillStyle = material;
  ctx.beginPath();
  ctx.moveTo(...top[0]);
  for (const point of top) ctx.lineTo(...point);
  for (let i = bottom.length - 1; i >= 0; i--) ctx.lineTo(...bottom[i]);
  ctx.closePath();
  ctx.fill();
}

function drawBroodmotherTendrils(ctx, width, height, target, pose, time) {
  const count = pose.enraged ? 5 : 3;
  const active = (target.lashIndex || 0) % count;
  for (let limb = 0; limb < count; limb++) {
    const spread = (limb + 0.5) / count * 2 - 1;
    const strike = pose.lash * (limb === active ? 1 : 0.23);
    const rootX = width * (0.11 + (limb % 2) * 0.075);
    const rootY = height * (-0.065 + limb * 0.025);
    const length = width * (0.47 + 0.08 * (1 - Math.abs(spread)) + 0.11 * pose.canopy + 0.2 * strike);
    const restingTip = spread * (0.33 + pose.canopy * 0.09) + pose.side * strike * 0.23 + pose.dip * 0.1;
    const aim = Number.isFinite(target.lashY) ? Math.max(-0.54, Math.min(0.54, (target.lashY - target.y) / height)) : restingTip;
    const tipY = height * (restingTip + (aim - restingTip) * strike * 0.75);
    const segments = 18;
    const sections = [];
    for (let step = 0; step <= segments; step++) {
      const t = step / segments;
      const envelope = Math.sin(t * Math.PI);
      const curve = Math.sin(time * 3.3 - t * 5.5 + limb * 1.4) * 0.09;
      sections.push({
        x: rootX - length * t + width * envelope * pose.coil * 0.11,
        y: rootY + (tipY - rootY) * t + height * envelope * (curve + pose.side * strike * 0.2),
      });
    }
    const silhouette = ctx.createLinearGradient(rootX, rootY, rootX - length, tipY);
    silhouette.addColorStop(0, pose.enraged ? "#362435" : "#233241");
    silhouette.addColorStop(0.42, pose.enraged ? "#513950e3" : "#3f6371b0");
    silhouette.addColorStop(0.82, pose.enraged ? "#805c809e" : "#597e9293");
    silhouette.addColorStop(1, pose.enraged ? "#c485ac38" : "#87c7d333");
    const upper = [], lower = [], surface = [];
    for (let step = 0; step <= segments; step++) {
      const { x, y } = sections[step];
      const before = sections[Math.max(0, step - 1)], after = sections[Math.min(segments, step + 1)];
      const dx = after.x - before.x, dy = after.y - before.y;
      const t = step / segments;
      const ribs = 1 + Math.sin(t * 21 + limb) * 0.11;
      const radius = width * (0.023 + strike * 0.008) * (1 - t) ** 0.84 * ribs;
      const scale = radius / Math.max(1, Math.hypot(dx, dy));
      upper.push([x - dy * scale, y + dx * scale]);
      surface.push([x - dy * scale * 0.25, y + dx * scale * 0.25]);
      lower.push([x + dy * scale, y - dx * scale]);
    }
    fillBroodmotherRibbon(ctx, upper, lower, silhouette);
    const reflection = ctx.createLinearGradient(rootX, rootY, rootX - length, tipY);
    reflection.addColorStop(0, "#a0c1de08");
    reflection.addColorStop(0.46, pose.enraged ? "#ae9bbd46" : "#abdbeb39");
    reflection.addColorStop(1, "#bac8d900");
    fillBroodmotherRibbon(ctx, upper, surface, reflection);

    // The pale side of the tube faces the light. The nerve travels down it
    // just before the lash releases, and dims again during recovery.
    const lit = pose.enraged ? "#fca7d4" : "#b1eaf5";
    const steady = 0.13 + pose.pulse * 0.08;
    if (strike > 0.04) {
      const travel = Math.min(0.88, Math.max(0.12, strike * 0.8 + 0.1));
      const nerve = ctx.createLinearGradient(rootX, rootY, rootX - length, tipY);
      nerve.addColorStop(0, alienArtTint(lit, steady));
      nerve.addColorStop(travel - 0.12, alienArtTint(lit, steady));
      nerve.addColorStop(travel, alienArtTint(lit, steady + strike * 0.59));
      nerve.addColorStop(travel + 0.12, alienArtTint(lit, steady));
      nerve.addColorStop(1, alienArtTint(lit, steady));
      ctx.strokeStyle = nerve;
    } else ctx.strokeStyle = alienArtTint(lit, steady);
    ctx.lineWidth = Math.max(0.8, width * (0.004 + strike * 0.006));
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(...surface[0]);
    for (const point of surface) ctx.lineTo(...point);
    ctx.stroke();
  }
}

function drawAlienArtFallback(ctx, width, height, profile, color, time, charge, disabled) {
  ctx.save();
  ctx.scale(width, height);
  const flesh = ctx.createLinearGradient(-0.2, -0.44, 0.17, 0.42);
  flesh.addColorStop(0, disabled ? "#393341" : color);
  flesh.addColorStop(0.29, "#263140");
  flesh.addColorStop(0.68, "#181624");
  flesh.addColorStop(1, "#090d18");
  for (let i = 0; i < profile.fins; i++) {
    const bias = (i + 0.5) / profile.fins * 2 - 1;
    const tip = bias * 0.54 + Math.sin(time * 2.4 + i) * 0.035 * profile.flex;
    ctx.fillStyle = flesh;
    ctx.beginPath();
    ctx.moveTo(0.14, bias * 0.19);
    ctx.bezierCurveTo(0.4, bias * 0.25, 0.35, tip * 0.9, 0.52, tip);
    ctx.bezierCurveTo(0.22, tip * 1.14, 0.03, bias * 0.35, -0.02, bias * 0.17);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = flesh;
  ctx.beginPath();
  ctx.moveTo(-0.49, 0.06);
  ctx.bezierCurveTo(-0.36, -0.39, -0.09, -0.51 + profile.rigid * 0.25, 0.19, -0.28);
  ctx.bezierCurveTo(0.42, -0.17, 0.34, 0.19, 0.14, 0.31);
  ctx.bezierCurveTo(-0.14, 0.44, -0.23, 0.22, -0.49, 0.06);
  ctx.fill();
  if (!disabled) alienArtGlow(ctx, ...profile.core, 0.18, color, 0.32 + charge * 0.43);
  ctx.restore();
}

function drawBossShip(ctx, target, reduceMotion = false) {
  if (typeof drawStarBreakerBoss === "function" && drawStarBreakerBoss(ctx, target, reduceMotion)) {
    preloadAlienBossArt(target.type + 1);
    return;
  }
  const profile = alienArtProfiles[target.type] || alienArtProfiles[0];
  const asset = preloadAlienBossArt(target.type);
  preloadAlienBossArt(target.type + 1);
  const texture = alienArtTexture(asset);
  const enragedTexture = target.type === 0 && target.enraged ? alienArtTexture(alienBroodmotherEnraged) : null;
  const transition = enragedTexture && texture && !target.disabled && !reduceMotion && Number.isFinite(target.enragedAt)
    ? Math.max(0, Math.min(1, ((target.age ?? target.enragedAt) - target.enragedAt) / 0.55)) : 1;
  const layers = [];
  if (texture && (!enragedTexture || transition < 1)) layers.push([texture, enragedTexture ? 1 - transition : 1]);
  if (enragedTexture && transition > 0) layers.push([enragedTexture, transition]);
  const color = /^#[0-9a-f]{6}$/i.test(target.color) ? target.color : "#79d9ed";
  const time = reduceMotion || target.disabled ? 0 : target.age || 0;
  const action = bossActionPose(target, reduceMotion);
  const charge = target.cinematicPose?.charge ?? action.charge;
  const reference = texture || enragedTexture;
  const aspect = reference ? reference.width / reference.height : target.width / target.height;
  const width = Math.min(target.width * 1.04, target.height * 1.04 * aspect);
  const height = width / aspect;
  const recoil = target.phase === "attack" && !reduceMotion ? 0.026 * Math.exp(-(target.phaseTime || 0) * 6) : 0;
  const pose = target.type === 0 && !target.disabled ? broodmotherArtPose(target, time, charge, reduceMotion) : null;
  const breath = pose ? pose.breath * 0.056 + pose.pulse * 0.027 : Math.sin(time * profile.tempo) * 0.018 * profile.flex;
  const postureX = pose ? pose.coil * 0.037 - pose.thrust * 0.072 + pose.dip * 0.017 - pose.lash * 0.022 : 0;
  const postureY = pose ? pose.dip * 0.05 + pose.side * pose.lash * 0.025 : 0;

  ctx.save();
  ctx.translate(target.x + (target.disabled ? 0 : width * (recoil + postureX + action.x)),
    target.y + height * (postureY + (target.disabled ? 0 : action.y)));
  if (!target.disabled) {
    ctx.rotate(Math.sin(time * 1.12) * 0.026 * profile.flex + (pose?.turn || 0) + action.bank);
    ctx.scale(action.scaleX * (1 + breath * (pose ? 0.64 : -0.45) - charge * 0.018 + (pose ? pose.thrust * 0.035 - pose.coil * 0.04 : 0)),
      action.scaleY * (1 + breath + charge * 0.025 + (pose ? pose.coil * 0.04 - pose.thrust * 0.03 : 0)));
  }
  if (!target.disabled) {
    alienArtGlow(ctx, width * 0.07, 0, Math.max(width, height) * 0.67, pose?.enraged ? "#d755a6" : color,
      (0.06 + 0.09 * action.core + (target.enraged ? 0.035 : 0)) * (1 - action.slack * .72));
  }
  if (pose && (pose.enraged || pose.lash > 0.06 || pose.thrust > 0.2)) {
    drawBroodmotherTendrils(ctx, width, height, target, pose, time);
  }
  if (!layers.length) drawAlienArtFallback(ctx, width, height, profile, color, time, charge, target.disabled);
  for (const [layer, opacity] of layers) {
    const drawWidth = Math.min(width, height * layer.width / layer.height);
    const drawHeight = drawWidth * layer.height / layer.width;
    const frame = paintAlienArtFrame(layer, profile, target, color, time, charge, reduceMotion, pose);
    const pad = drawWidth * alienArtPadding / layer.width;
    ctx.save();
    ctx.globalAlpha *= opacity;
    ctx.drawImage(frame, -drawWidth * 0.5 - pad, -drawHeight * 0.5 - pad, drawWidth + 2 * pad, drawHeight + 2 * pad);
    ctx.restore();
  }
  ctx.restore();
}

preloadAlienBossArt(0);
