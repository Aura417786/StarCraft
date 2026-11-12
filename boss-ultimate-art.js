"use strict";

// These silhouettes follow the mechanics' geometry; textures never determine hits.
const bossUltimateArtKinds = ["tideWalls", "boneNova", "magmaRift", "silkCage", "pincer", "mirrorArray", "stormRing", "sporeBloom", "voidCollapse", "neuralGrid", "fusion"];
const ultimateSurfaceCache = new Map();

function drawUltimateFragment(ctx, particle, x, y, alpha, materialName) {
  const mat = signatureMaterials[materialName];
  const size = particle.size;
  if (!mat) return false;
  ctx.save(); ctx.translate(x, y); ctx.rotate(particle.rotation);
  ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = alpha * .85;
  if (materialName === "magma" || materialName === "spore") {
    ctx.drawImage(ultimateNodeTexture(materialName, materialName === "magma" ? "rock" : "orb"), -size * 2, -size * 2, size * 4, size * 4);
  } else if (materialName === "water") {
    ctx.fillStyle = mat.mid; ctx.beginPath(); ctx.ellipse(0, 0, size * 1.8, size * .7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = mat.spark; ctx.lineWidth = .7; ctx.beginPath(); ctx.ellipse(0, 0, size * 1.8, size * .7, 0, Math.PI, Math.PI * 1.85); ctx.stroke();
  } else if (materialName === "silk" || materialName === "nerve" || materialName === "plasma") {
    ctx.strokeStyle = mat.rim; ctx.lineWidth = materialName === "nerve" ? 1.5 : .7;
    ctx.beginPath(); ctx.moveTo(-size * 3, 0); ctx.bezierCurveTo(-size, -size, size, size * 2, size * 3, 0); ctx.stroke();
  } else if (materialName === "glass") {
    ultimateCrystal(ctx, 0, 0, size * 2, 0, mat, alpha);
  } else if (materialName === "bone") {
    ultimateBone(ctx, -size * 2, 0, size * 4, size, 0, mat, alpha);
  } else {
    ctx.fillStyle = materialName === "void" ? mat.dark : mat.mid;
    ctx.beginPath(); ctx.moveTo(-size * 1.8, 0); ctx.lineTo(size, -size * .65); ctx.lineTo(size * .5, size); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = mat.rim; ctx.lineWidth = .8; ctx.stroke();
  }
  ctx.restore();
  return true;
}

function ultimateMaterial(target) {
  return signatureMaterials[pressureMaterialNames[target.type] || "fusion"];
}

function ultimateNodeTexture(materialName, shape = "orb") {
  const key = materialName + shape;
  if (ultimateSurfaceCache.has(key)) return ultimateSurfaceCache.get(key);
  const mat = signatureMaterials[materialName];
  const surface = document.createElement("canvas");
  surface.width = surface.height = 160;
  const brush = surface.getContext("2d");
  brush.translate(80, 80);
  const shading = brush.createRadialGradient(-19, -23, 2, 4, 9, 65);
  shading.addColorStop(0, mat.spark); shading.addColorStop(.12, mat.rim);
  shading.addColorStop(.37, mat.mid); shading.addColorStop(.72, mat.dark); shading.addColorStop(1, "#010309");
  brush.fillStyle = shading;
  brush.beginPath();
  if (shape === "rock") {
    for (let i = 0; i <= 12; i++) {
      const a = i / 12 * Math.PI * 2, r = 57 + Math.sin(i * 4.3) * 9;
      if (!i) brush.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else brush.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
  } else brush.ellipse(0, 0, 59, 63, .13, 0, Math.PI * 2);
  brush.closePath(); brush.fill();
  brush.strokeStyle = mat.rim; brush.globalAlpha = .48; brush.lineWidth = 1.8; brush.stroke();
  brush.save(); brush.clip();
  if (typeof getBossVfxMaterial === "function") {
    const surfaceTexture = getBossVfxMaterial(materialName);
    if (surfaceTexture) {
      brush.globalCompositeOperation = "soft-light"; brush.globalAlpha = .75;
      brush.drawImage(surfaceTexture, -72, -72, 144, 144);
      brush.globalCompositeOperation = "source-over";
    }
  }
  // Surface grain is baked once; mineral pores are lit from the same upper left.
  for (let grain = 0; grain < (shape === "rock" ? 1800 : 480); grain++) {
    const gx = (grain * 73.213 % 124) - 62, gy = (grain * 41.731 % 128) - 64;
    const light = Math.sin(grain * 13.17) > .12;
    brush.fillStyle = light ? mat.rim : "#010309";
    brush.globalAlpha = (light ? .10 : .23) * (shape === "rock" ? 1 : .42);
    const grainSize = shape === "rock" ? .8 + grain % 4 * .55 : .8;
    brush.fillRect(gx, gy, grainSize * 1.4, grainSize);
  }
  for (let vein = 0; vein < 12; vein++) {
    brush.beginPath();
    const a = vein * 2.39996, r = 16 + vein * 7 % 33;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    brush.moveTo(x, y);
    brush.bezierCurveTo(x + 22, y - 28, x - 17, y + 8, x + 34, y + 27);
    brush.lineWidth = shape === "rock" ? 3 : 1;
    brush.strokeStyle = vein % 3 ? mat.rim : mat.dark;
    brush.globalAlpha = shape === "rock" ? .78 : .42;
    brush.stroke();
  }
  brush.restore();
  // Small asymmetrical highlight, never a luminous flat disc.
  brush.globalAlpha = .25; brush.fillStyle = mat.spark;
  brush.beginPath(); brush.ellipse(-21, -26, 18, 7, -.65, 0, Math.PI * 2); brush.fill();
  ultimateSurfaceCache.set(key, surface);
  return surface;
}

function ultimateDrawNode(ctx, x, y, radius, matName, alpha = 1, shape = "orb", rotation = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
  ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = alpha;
  ctx.drawImage(ultimateNodeTexture(matName, shape), -radius, -radius, radius * 2, radius * 2);
  ctx.restore();
}

function ultimateCrystal(ctx, x, y, size, angle, mat, alpha = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = alpha;
  ctx.fillStyle = mat.dark;
  ctx.beginPath(); ctx.moveTo(-size * .27, -size); ctx.lineTo(size * .48, -size * .32);
  ctx.lineTo(size * .33, size * .72); ctx.lineTo(-size * .1, size); ctx.lineTo(-size * .58, size * .18); ctx.closePath(); ctx.fill();
  const face = ctx.createLinearGradient(-size * .6, -size * .3, size * .3, size * .4);
  face.addColorStop(0, "#090e24"); face.addColorStop(.27, mat.mid); face.addColorStop(.42, mat.rim);
  face.addColorStop(.46, "#f2f7ff"); face.addColorStop(.5, mat.mid); face.addColorStop(.8, mat.dark); face.addColorStop(1, "#080c1d");
  ctx.fillStyle = face;
  ctx.beginPath(); ctx.moveTo(-size * .27, -size); ctx.lineTo(size * .05, -size * .05);
  ctx.lineTo(-size * .1, size); ctx.lineTo(-size * .58, size * .18); ctx.closePath(); ctx.fill();
  if (typeof getBossVfxMaterial === "function") {
    const ice = getBossVfxMaterial("glass");
    if (ice) { ctx.save(); ctx.clip(); ctx.globalCompositeOperation = "soft-light"; ctx.globalAlpha = alpha * .48;
      ctx.drawImage(ice, -size, -size, size * 2, size * 2); ctx.restore(); }
  }
  const bevel = ctx.createLinearGradient(-size * .27, -size, size * .48, 0);
  bevel.addColorStop(0, mat.spark); bevel.addColorStop(.12, mat.rim); bevel.addColorStop(.5, mat.dark); bevel.addColorStop(1, "#060a18");
  ctx.fillStyle = bevel; ctx.globalAlpha = alpha * .9;
  ctx.beginPath(); ctx.moveTo(-size * .27, -size); ctx.lineTo(size * .48, -size * .32);
  ctx.lineTo(size * .05, -size * .05); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = alpha; ctx.strokeStyle = mat.spark; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(-size * .27, -size); ctx.lineTo(size * .05, -size * .05); ctx.lineTo(-size * .1, size); ctx.stroke();
  ctx.globalAlpha = alpha * .24; ctx.strokeStyle = mat.rim; ctx.lineWidth = .6;
  for (let fracture = 0; fracture < 4; fracture++) {
    const y = size * (-.55 + fracture * .36);
    ctx.beginPath(); ctx.moveTo(-size * .36, y); ctx.lineTo(size * .03, y + size * .14); ctx.lineTo(size * .25, y - size * .12); ctx.stroke();
  }
  ctx.restore();
}

function ultimateBone(ctx, x, y, length, width, angle, mat, alpha = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = alpha;
  ctx.fillStyle = mat.dark;
  ctx.beginPath(); ctx.moveTo(-length * .12, width * .54);
  ctx.bezierCurveTo(length * .32, width * .85, length * .72, width * .48, length, 0);
  ctx.bezierCurveTo(length * .63, width * .02, length * .33, -width * .64, 0, -width * .32);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = mat.mid;
  ctx.beginPath(); ctx.moveTo(0, -width * .32);
  ctx.bezierCurveTo(length * .33, -width * .64, length * .63, width * .02, length, 0);
  ctx.bezierCurveTo(length * .66, width * .32, length * .36, width * .09, 0, -width * .08); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = mat.rim; ctx.lineWidth = 1.7;
  ctx.beginPath(); ctx.moveTo(0, -width * .32); ctx.bezierCurveTo(length * .33, -width * .64, length * .63, width * .02, length, 0); ctx.stroke();
  ctx.strokeStyle = mat.dark; ctx.globalAlpha = alpha * .55; ctx.lineWidth = 2;
  for (let band = 1; band < 6; band++) {
    const bx = length * band / 8;
    ctx.beginPath(); ctx.moveTo(bx, -width * .28); ctx.lineTo(bx + width * .12, width * .38); ctx.stroke();
  }
  ctx.restore();
}

function appendUltimateArcPath(ctx, x1, y1, x2, y2, seed) {
  const dx = x2 - x1, dy = y2 - y1, length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length, ny = dx / length;
  for (let step = 0; step <= 14; step++) {
    const t = step / 14;
    const jitter = Math.sin(step * 7.1 + seed) * Math.sin(t * Math.PI) * Math.min(19, length * .09);
    const x = x1 + dx * t + nx * jitter, y = y1 + dy * t + ny * jitter;
    if (!step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
}

function strokeUltimateArcPath(ctx, mat, width, alpha) {
  ctx.strokeStyle = mat.mid; ctx.lineWidth = width * 3; ctx.globalAlpha = alpha * .25; ctx.stroke();
  ctx.strokeStyle = mat.rim; ctx.lineWidth = width; ctx.globalAlpha = alpha * .8; ctx.stroke();
  ctx.strokeStyle = mat.spark; ctx.lineWidth = Math.max(.7, width * .25); ctx.globalAlpha = alpha; ctx.stroke();
}

function ultimateArc(ctx, x1, y1, x2, y2, seed, mat, width, alpha) {
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  ctx.beginPath();
  appendUltimateArcPath(ctx, x1, y1, x2, y2, seed);
  strokeUltimateArcPath(ctx, mat, width, alpha);
  ctx.restore();
}

function drawUltimateInterference(ctx, x, y, radius, charge, time, name, material) {
  const high = visualQuality.id === "high";
  const gap = radius * (.56 - charge * .24);
  ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
  // Two wave sources overlap around the charge point. Narrow, broken fronts
  // show the buildup without turning the field into an opaque flash.
  for (let side = -1; side <= 1; side += 2) {
    ctx.beginPath();
    const cy = y + side * radius * .16, cx = x + side * gap;
    const bands = high ? 11 : 7;
    const pulse = (time * .64 + (side < 0 ? .27 : 0)) % 1;
    for (let ring = 0; ring < bands; ring++) {
      const r = radius * (.13 + (ring + pulse) / bands * .92);
      const a = ring * 1.92 + time * side * .38;
      ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * .72);
      ctx.ellipse(cx, cy, r, r * .72, 0, a, a + 3.9);
    }
    strokeSignatureCurrent(ctx, material, .16 + charge * .28, .72);
  }
  ctx.restore();
  const field = { x, y, radius: radius * 1.48, innerRadius: radius * .18 };
  drawSignatureOrbit(ctx, field, name, time * 1.8, .50 + charge * .32, .69, high ? 46 : 30);
  const glow = typeof pressureArtGlow === "function" ? pressureArtGlow(material.rim, true) : null;
  if (glow) {
    const r = radius * (.31 + charge * .24);
    ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = .28 + charge * .39;
    ctx.drawImage(glow, x - r, y - r * .72, r * 2, r * 1.44); ctx.restore();
  }
}

// Element-specific anticipation: identifiable even before a hazard exists.
function drawUltimateChargeIdentity(ctx, target, scene) {
  const charge = clamp(scene.age / Math.max(.01, scene.warning), 0, 1);
  const mat = ultimateMaterial(target), name = pressureMaterialNames[target.type];
  const kind = scene.ultimateKind || bossUltimateArtKinds[target.type];
  const quiet = quietCombatMotion(), time = quiet ? 0 : scene.age;
  const cx = target.x - target.width * .27, cy = target.y, r = viewport.height * (.15 + charge * .10);
  const fade = .3 + charge * .7;
  ctx.save();
  if (!quiet && visualQuality.id !== "low") {
    drawUltimateInterference(ctx, cx - r * .38, cy, r, charge, time, name, mat);
  }
  if (kind === "boneNova") {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * .55 + i * Math.PI * .112;
      ultimateBone(ctx, cx + Math.cos(a) * r * .32, cy + Math.sin(a) * r * .32, r * (.9 + i % 3 * .14), r * .17, a, mat, fade * .9);
    }
  } else if (kind === "magmaRift") {
    for (let i = 0; i < 11; i++) {
      const a = i * 2.39996 + time * .14, orbit = r * (.43 + i % 3 * .23);
      ultimateDrawNode(ctx, cx + Math.cos(a) * orbit, cy + Math.sin(a) * orbit * .7, r * (.18 + i % 3 * .05), name, fade, "rock", a + time * .3);
    }
  } else if (kind === "pincer") {
    for (const side of [-1, 1]) {
      const a = side * (.75 - charge * .15) + Math.PI;
      for (let claw = 0; claw < 5; claw++) ultimateBone(ctx, cx + Math.cos(a) * r * .15, cy + side * r * (.47 + claw * .08), r * (1.2 - claw * .1), r * .24, a + side * claw * .1, mat, fade * (1 - claw * .09));
    }
  } else if (kind === "mirrorArray") {
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + time * .25;
      ultimateCrystal(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r * .7, r * .38, -a + time * .13, mat, fade);
    }
  } else if (kind === "sporeBloom") {
    for (let i = 0; i < 13; i++) {
      const a = i * 2.39996, orbit = r * (.14 + i / 15);
      const pulse = 1 + .065 * Math.sin(time * 3 + i);
      ultimateDrawNode(ctx, cx + Math.cos(a) * orbit, cy + Math.sin(a) * orbit * .7, r * (.16 + i % 3 * .07) * pulse, name, fade);
    }
  } else if (kind === "voidCollapse") {
    ctx.fillStyle = "#010207"; ctx.globalAlpha = .96 * fade;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * .65, r * .49, -.2, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 12; i++) {
      ctx.strokeStyle = i % 3 ? mat.mid : mat.rim; ctx.globalAlpha = fade * (.1 + i % 3 * .14);
      ctx.lineWidth = 2 + i % 3 * 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, r * (.7 + i * .044), r * (.15 + i * .036), -.25, i * .7 + time, i * .7 + time + 3); ctx.stroke();
    }
  } else if (kind === "silkCage" || kind === "neuralGrid" || kind === "stormRing") {
    const count = kind === "neuralGrid" ? 7 : kind === "silkCage" ? 10 : 12;
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2, b = a + Math.PI * .72;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * .8;
      const x2 = cx + Math.cos(b) * r, y2 = cy + Math.sin(b) * r * .8;
      if (kind === "stormRing") ultimateArc(ctx, x, y, x2, y2, Math.floor(time * 12) + i, mat, 1.7, fade * .7);
      else {
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = fade * .7;
        ctx.strokeStyle = mat.dark; ctx.lineWidth = kind === "silkCage" ? 5 : 8;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(cx + Math.sin(i) * r * .25, cy, x2, y2); ctx.stroke();
        ctx.strokeStyle = mat.rim; ctx.lineWidth = kind === "silkCage" ? .8 : 1.3; ctx.stroke();
      }
      if (kind !== "silkCage") ultimateDrawNode(ctx, x, y, r * (kind === "stormRing" ? .055 : .11), name, fade);
    }
  } else {
    // Water's dark curling lips enclose an exposed, brightly lit meniscus.
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(i * 1.256 + time * .16);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = fade * .84;
      ctx.fillStyle = mat.dark; ctx.beginPath(); ctx.moveTo(r * .15, 0);
      ctx.bezierCurveTo(r * 1.4, -r * .9, r * 1.3, r * .6, r * .12, r * .21);
      ctx.bezierCurveTo(r * .82, r * .3, r * .8, -r * .37, r * .15, 0); ctx.fill();
      ctx.strokeStyle = mat.rim; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r * .15, 0);
      ctx.bezierCurveTo(r * 1.4, -r * .9, r * 1.3, r * .6, r * .12, r * .21); ctx.stroke(); ctx.restore();
    }
  }
  ctx.restore();
}

function ultimateWaterWall(ctx, box, mat, time, alpha, direction = -1) {
  if (!(box.width > 0 && box.height > 0)) return;
  if (typeof drawWaterSection === "function") {
    const center = box.x + box.width / 2;
    const top = box.y <= flightBounds.top + 1 ? 0 : box.y;
    const bottom = box.y + box.height >= flightBounds.bottom - 1 ? viewport.height : box.y + box.height;
    drawWaterSection(ctx, () => center, top, bottom, direction, time, box.width / 2, mat, alpha < .7, quietCombatMotion());
    if (typeof getBossVfxMaterial === "function") {
      const water = getBossVfxMaterial("water");
      if (water) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, top, viewport.width, bottom - top); ctx.clip();
        ctx.globalCompositeOperation = "soft-light"; ctx.globalAlpha = alpha * .5;
        const trailX = center - direction * box.width * .8;
        ctx.drawImage(water, trailX - box.width * 1.2, top, box.width * 2.4, bottom - top);
        ctx.restore();
      }
    }
    return;
  }
  ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.width, box.height); ctx.clip();
  const vertical = box.height > box.width;
  const depth = vertical ? box.width : box.height;
  const gradient = ctx.createLinearGradient(box.x, box.y, box.x + (vertical ? depth : 0), box.y + (vertical ? 0 : depth));
  gradient.addColorStop(0, mat.dark); gradient.addColorStop(.22, "#061827");
  gradient.addColorStop(.67, mat.mid); gradient.addColorStop(1, mat.rim);
  ctx.globalAlpha = alpha * .9; ctx.fillStyle = gradient; ctx.fillRect(box.x, box.y, box.width, box.height);
  const long = vertical ? box.height : box.width;
  const crests = visualQuality.id === "low" ? 8 : 16;
  for (let wave = 0; wave < crests; wave++) {
    const along = (wave + .5) * long / crests;
    const roll = Math.sin(time * 3.5 + wave * .8) * depth * .06;
    ctx.save();
    ctx.translate(box.x + (vertical ? depth * .72 + roll : along), box.y + (vertical ? along : depth * .72 + roll));
    if (!vertical) ctx.rotate(Math.PI / 2);
    const r = Math.min(45, Math.max(15, depth * .24));
    ctx.fillStyle = mat.dark; ctx.globalAlpha = alpha * .84;
    ctx.beginPath(); ctx.moveTo(-r * 2.2, r * .6);
    ctx.bezierCurveTo(-r * .2, -r * 1.6, r * 1.3, -r, r * .74, r * .25);
    ctx.bezierCurveTo(r * .35, -r * .6, -r * .5, -r * .55, -r * 2.2, r * .6); ctx.fill();
    ctx.strokeStyle = mat.spark; ctx.globalAlpha = alpha * .75; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-r * 2.2, r * .6); ctx.bezierCurveTo(-r * .2, -r * 1.6, r * 1.3, -r, r * .74, r * .25); ctx.stroke();
    ctx.strokeStyle = mat.rim; ctx.lineWidth = 8; ctx.globalAlpha = alpha * .15; ctx.stroke();
    for (let spray = 0; spray < 5; spray++) {
      const sx = r * (.3 + spray * .19), sy = -r * (.65 + .22 * Math.sin(wave * 7 + spray + time * 3));
      ctx.globalAlpha = alpha * .55; ctx.fillStyle = mat.spark;
      ctx.beginPath(); ctx.ellipse(sx, sy, 1.2 + spray % 2, 2.6, .4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

function ultimateLavaFissure(ctx, line, mat, time, alpha) {
  const dx = line.x2 - line.x1, dy = line.y2 - line.y1, length = Math.hypot(dx, dy);
  const width = Math.max(3, line.width);
  ctx.save(); ctx.translate(line.x1, line.y1); ctx.rotate(Math.atan2(dy, dx));
  // Cold opaque basalt contains a rolling, uneven molten river. No rectangular glow.
  const wave = x => Math.sin(x * .013 + time * .7) * width * .12 + Math.sin(x * .039 - time) * width * .04;
  const heat = ctx.createLinearGradient(0, -width * .58, 0, width * .58);
  heat.addColorStop(0, "#100e16"); heat.addColorStop(.16, "#31121a");
  heat.addColorStop(.32, "#a32e16"); heat.addColorStop(.46, "#f38b36");
  heat.addColorStop(.53, "#ffd37a"); heat.addColorStop(.64, "#d95122");
  heat.addColorStop(.81, "#47131c"); heat.addColorStop(1, "#100d15");
  const half = width * .51;
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const x = length * i / 48, turbulence = 1 + Math.sin(x * .071 + time * 2) * .13;
    if (!i) ctx.moveTo(x, wave(x) - half * turbulence); else ctx.lineTo(x, wave(x) - half * turbulence);
  }
  for (let i = 48; i >= 0; i--) {
    const x = length * i / 48, turbulence = 1 + Math.sin(x * .047 - time * 1.5) * .15;
    ctx.lineTo(x, wave(x) + half * turbulence);
  }
  ctx.closePath(); ctx.globalAlpha = alpha; ctx.fillStyle = heat; ctx.fill();
  if (typeof getBossVfxMaterial === "function") {
    const crust = getBossVfxMaterial("magma");
    if (crust) {
      ctx.save(); ctx.clip();
      // Keep density and normal-lighting ABOVE the hot substrate. Overlapping
      // soft tiles make moving crust pockets without a visible repeating frame.
      const span = Math.max(width * 2.2, 100), count = Math.ceil(length / (span * .64)) + 1;
      for (let tile = 0; tile < count; tile++) {
        const px = tile * span * .64 - span * .12 + Math.sin(time * .5 + tile * 1.7) * span * .035;
        const py = wave(px) - width * (.81 + tile % 2 * .12);
        ctx.globalAlpha = alpha * .78;
        ctx.drawImage(crust, px, py, span, width * 1.8);
      }
      ctx.globalCompositeOperation = "soft-light"; ctx.globalAlpha = alpha * .46;
      ctx.drawImage(crust, -width * .2, -width, length + width * .4, width * 2);
      ctx.restore();
    }
  }
  const blocks = visualQuality.id === "low" ? 11 : 22;
  const rock = ultimateNodeTexture("magma", "rock");
  for (let i = 0; i < blocks; i++) {
    const x = length * (i * .618034 % 1), side = i % 2 ? 1 : -1;
    const size = width * (.14 + (i * .371 % 1) * .16), y = wave(x) + side * width * (.32 + (i * .13 % .1));
    ctx.save(); ctx.translate(x, y); ctx.rotate(i * 2.4 + Math.sin(time + i) * .08);
    ctx.globalAlpha = alpha * .9; ctx.drawImage(rock, -size, -size * .7, size * 2, size * 1.4); ctx.restore();
  }
  // Fine convection seams slide with the river, and embers follow its direction.
  ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = mat.spark; ctx.lineWidth = 1;
  for (let seam = 0; seam < 14; seam++) {
    const x = (seam * .618034 + time * .045) % 1 * length;
    ctx.globalAlpha = alpha * (.3 + seam % 3 * .12); ctx.beginPath(); ctx.moveTo(x, wave(x));
    ctx.bezierCurveTo(x + 12, wave(x) - width * .07, x + 18, wave(x) + width * .08, x + 38, wave(x + 38)); ctx.stroke();
  }
  ctx.restore();
}

function ultimatePincerPlate(ctx, rect, mat, time, alpha, upper) {
  if (!(rect.width > 0 && rect.height > 0)) return;
  const lip = upper ? rect.y + rect.height : rect.y, side = upper ? -1 : 1;
  const x = rect.x, w = rect.width, depth = rect.height;
  ctx.save(); ctx.beginPath(); ctx.rect(x, rect.y, w, depth); ctx.clip();
  const shell = ctx.createLinearGradient(x, lip, x + w * .08, lip + side * depth);
  shell.addColorStop(0, mat.rim); shell.addColorStop(.13, mat.mid); shell.addColorStop(.3, "#263d32");
  shell.addColorStop(.69, "#091519"); shell.addColorStop(1, mat.dark);
  ctx.fillStyle = shell; ctx.globalAlpha = alpha;
  ctx.beginPath(); ctx.moveTo(x, lip);
  ctx.bezierCurveTo(x - w * .02, lip + side * depth * .6, x + w * .38, lip + side * depth * .98, x + w * 1.05, lip + side * depth * .87);
  ctx.lineTo(x + w * 1.05, lip + side * depth * .16);
  ctx.bezierCurveTo(x + w * .66, lip + side * depth * .03, x + w * .21, lip + side * depth * .45, x, lip); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.clip();
  if (typeof getBossVfxMaterial === "function") {
    const shellTexture = getBossVfxMaterial("chitin");
    if (shellTexture) { ctx.globalAlpha = alpha * .58; ctx.drawImage(shellTexture, x, rect.y, w, depth); }
  }
  // A few wide, asymmetric sutures follow one continuous mandible, not tiled plates.
  ctx.strokeStyle = "#030b10"; ctx.lineWidth = 7; ctx.globalAlpha = alpha * .78;
  for (let suture = 0; suture < 4; suture++) {
    const sx = x + w * (.16 + suture * .23);
    ctx.beginPath(); ctx.moveTo(sx, lip + side * depth);
    ctx.bezierCurveTo(sx - w * .13, lip + side * depth * .65, sx + w * .03, lip + side * depth * .4, sx + w * .1, lip + side * depth * .08); ctx.stroke();
  }
  ctx.restore();
  const toothCount = 6;
  for (let tooth = 0; tooth < toothCount; tooth++) {
    const t = .04 + tooth * .155, tx = x + w * t;
    const reach = depth * (.22 + .16 * Math.sin(tooth * 1.7 + .4));
    const span = w * (.06 + tooth % 3 * .013);
    const enamel = ctx.createLinearGradient(tx, lip, tx + span, lip + side * reach);
    enamel.addColorStop(0, mat.spark); enamel.addColorStop(.16, mat.rim); enamel.addColorStop(.44, mat.mid); enamel.addColorStop(1, mat.dark);
    ctx.fillStyle = enamel; ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.moveTo(tx - span * .35, lip + side * reach);
    ctx.bezierCurveTo(tx - span * .3, lip + side * reach * .3, tx + span * .12, lip + side * 2, tx + span * .7, lip);
    ctx.bezierCurveTo(tx + span * .15, lip + side * reach * .6, tx + span * .7, lip + side * reach, tx - span * .35, lip + side * reach); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function ultimateOssuaryRing(ctx, circle, mat, time, alpha) {
  const inner = Math.max(0, circle.innerRadius || 0), radius = Math.max(1, circle.radius);
  ctx.save(); ctx.beginPath(); ctx.arc(circle.x, circle.y, radius, 0, Math.PI * 2);
  if (inner) ctx.arc(circle.x, circle.y, inner, 0, Math.PI * 2, true);
  ctx.clip(); ctx.fillStyle = mat.dark; ctx.globalAlpha = alpha;
  ctx.fillRect(circle.x - radius, circle.y - radius, radius * 2, radius * 2);
  const count = visualQuality.id === "low" ? 16 : 28;
  const mid = (radius + inner) / 2, thick = Math.max(4, radius - inner);
  for (let piece = 0; piece < count; piece++) {
    const a = piece / count * Math.PI * 2 + time * .06;
    ultimateBone(ctx, circle.x + Math.cos(a) * mid, circle.y + Math.sin(a) * mid,
      Math.max(20, mid * Math.PI * 2 / count * 1.5), thick * 1.7, a + Math.PI / 2, mat, alpha);
  }
  ctx.restore();
}

function ultimateSilkLine(ctx, line, mat, time, alpha, nerve = false) {
  const dx = line.x2 - line.x1, dy = line.y2 - line.y1, length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length, ny = dx / length;
  const threads = visualQuality.id === "low" ? 3 : 5;
  ctx.save();
  ctx.strokeStyle = mat.dark; ctx.lineWidth = line.width + (nerve ? 7 : 3); ctx.globalAlpha = alpha * .9;
  ctx.beginPath(); ctx.moveTo(line.x1, line.y1); ctx.lineTo(line.x2, line.y2); ctx.stroke();
  for (let thread = 0; thread < threads; thread++) {
    ctx.beginPath();
    for (let step = 0; step <= 22; step++) {
      const t = step / 22, twist = Math.sin(t * 30 + thread * 1.4 + time * (nerve ? 4 : 1.7)) * line.width * .28;
      const offset = twist + (thread / Math.max(1, threads - 1) - .5) * line.width * .5;
      const x = line.x1 + dx * t + nx * offset, y = line.y1 + dy * t + ny * offset;
      if (!step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = thread % 2 ? mat.rim : mat.mid; ctx.globalAlpha = alpha * (thread % 2 ? .7 : .9);
    ctx.lineWidth = nerve ? 2.5 : 1; ctx.stroke();
  }
  ctx.globalCompositeOperation = "lighter";
  for (let pulse = 0; pulse < (nerve ? 4 : 2); pulse++) {
    const t = (time * (nerve ? .7 : .22) + pulse / (nerve ? 4 : 2)) % 1;
    const x = line.x1 + dx * t, y = line.y1 + dy * t;
    ctx.globalAlpha = alpha * .9; ctx.fillStyle = mat.spark;
    ctx.beginPath(); ctx.ellipse(x, y, nerve ? 6 : 2, nerve ? 3 : 1, Math.atan2(dy, dx), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function ultimatePrismBeam(ctx, line, mat, alpha) {
  const key = "mirror-beam";
  let beam = ultimateSurfaceCache.get(key);
  if (!beam) {
    beam = document.createElement("canvas"); beam.width = 128; beam.height = 64;
    const brush = beam.getContext("2d"), spread = brush.createLinearGradient(0, 0, 0, 64);
    spread.addColorStop(0, "#74adff00"); spread.addColorStop(.25, "#5486df09");
    spread.addColorStop(.42, "#7cc9ff42"); spread.addColorStop(.49, "#dcf6ffb8");
    spread.addColorStop(.5, "#ffffffec"); spread.addColorStop(.51, "#d4e6ffb8");
    spread.addColorStop(.58, "#a08ee642"); spread.addColorStop(.75, "#757cdb09"); spread.addColorStop(1, "#74adff00");
    brush.fillStyle = spread; brush.fillRect(0, 0, 128, 64);
    ultimateSurfaceCache.set(key, beam);
  }
  const length = Math.hypot(line.x2 - line.x1, line.y2 - line.y1), width = Math.max(8, line.width);
  ctx.save(); ctx.translate(line.x1, line.y1); ctx.rotate(Math.atan2(line.y2 - line.y1, line.x2 - line.x1));
  ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = alpha * .9;
  ctx.drawImage(beam, 0, -width * 1.3, length, width * 2.6);
  ctx.strokeStyle = mat.spark; ctx.lineWidth = 1; ctx.globalAlpha = alpha * .75;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(length, 0); ctx.stroke();
  ctx.restore();
}

function ultimateCloud(ctx, circle, mat, time, alpha, vacuum = false) {
  const radius = Math.max(1, circle.radius), inner = circle.innerRadius || 0;
  ctx.save();
  ctx.beginPath(); ctx.arc(circle.x, circle.y, radius, 0, Math.PI * 2);
  if (inner > 0) ctx.arc(circle.x, circle.y, inner, 0, Math.PI * 2, true);
  ctx.clip();
  ctx.fillStyle = vacuum ? "#010207" : mat.dark; ctx.globalAlpha = alpha * (vacuum ? .98 : .73);
  ctx.fillRect(circle.x - radius, circle.y - radius, radius * 2, radius * 2);
  if (typeof getBossVfxMaterial === "function") {
    const cloud = getBossVfxMaterial(vacuum ? "void" : "spore");
    if (cloud) { ctx.globalAlpha = alpha * .8; ctx.drawImage(cloud, circle.x - radius, circle.y - radius, radius * 2, radius * 2); }
  }
  if (vacuum) {
    for (let ring = 0; ring < 10; ring++) {
      const r = radius * (.4 + ring * .06), lineWidth = 2 + ring % 3;
      // The rotated ellipse is inside radius r; retain stroke and antialias margins.
      if (inner > 0 && r + lineWidth * .5 + 2 <= inner) continue;
      ctx.strokeStyle = ring % 3 ? mat.mid : mat.rim; ctx.globalAlpha = alpha * (.12 + ring % 3 * .13); ctx.lineWidth = lineWidth;
      ctx.beginPath(); ctx.ellipse(circle.x, circle.y, r, r * .36, -.2, ring * .6 + time, ring * .6 + time + 3.7); ctx.stroke();
    }
    ctx.fillStyle = "#000106"; ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(circle.x, circle.y, Math.max(inner, radius * .37), 0, Math.PI * 2); ctx.fill();
  } else {
    const count = visualQuality.id === "low" ? 7 : 15;
    for (let puff = 0; puff < count; puff++) {
      const a = puff * 2.39996 + time * .07, orbit = radius * (.15 + (puff * 7 % 11) / 14);
      const size = radius * (.23 + puff % 3 * .07);
      ctx.globalAlpha = alpha * .65;
      ctx.drawImage(pressureArtMist(mat.rim), circle.x + Math.cos(a) * orbit - size,
        circle.y + Math.sin(a) * orbit - size, size * 2, size * 2);
    }
  }
  ctx.restore();
}

function ultimateClipDanger(ctx, hazard) {
  if (!hazard.noShield) return;
  const top = clamp(hazard.gapY - hazard.gapSize / 2, 0, viewport.height);
  const bottom = clamp(hazard.gapY + hazard.gapSize / 2, 0, viewport.height);
  ctx.beginPath(); ctx.rect(0, 0, viewport.width, top);
  ctx.rect(0, bottom, viewport.width, viewport.height - bottom); ctx.clip();
}

function drawBossUltimateGeometry(ctx, hazard, geometry, target) {
  const mat = ultimateMaterial(target), name = pressureMaterialNames[target.type];
  const time = quietCombatMotion() ? 0 : hazard.age;
  const active = hazard.age >= hazard.warning;
  const alpha = active ? .88 : .19 + Math.min(1, hazard.age / hazard.warning) * .2;
  const kind = hazard.ultimateKind;
  const flowing = !quietCombatMotion() && visualQuality.id !== "low";
  const high = visualQuality.id === "high";
  ctx.save(); ctx.globalCompositeOperation = "source-over";
  ctx.save(); ultimateClipDanger(ctx, hazard);
  let rectIndex = 0;
  for (const rect of geometry.rects || []) {
    if (kind === "tideWalls") ultimateWaterWall(ctx, rect, mat, time, alpha, rectIndex < 2 ? -1 : 1);
    else if (kind === "pincer") ultimatePincerPlate(ctx, rect, mat, time, alpha, rect.y < hazard.gapY);
    else if (kind === "magmaRift") {
      const vertical = rect.height > rect.width;
      ultimateLavaFissure(ctx, { x1: rect.x + (vertical ? rect.width / 2 : 0), y1: rect.y + (vertical ? 0 : rect.height / 2),
        x2: rect.x + (vertical ? rect.width / 2 : rect.width), y2: rect.y + (vertical ? rect.height : rect.height / 2), width: vertical ? rect.width : rect.height }, mat, time, alpha);
    } else {
      ctx.globalAlpha = alpha * .8; ctx.fillStyle = mat.dark; ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
    if (flowing && kind !== "tideWalls" && rect.width > 6 && rect.height > 6) {
      const vertical = rect.height > rect.width;
      const x1 = rect.x + (vertical ? rect.width * .5 : 0);
      const y1 = rect.y + (vertical ? 0 : rect.height * .5);
      drawSignatureStream(ctx, { x1, y1, x2: x1 + (vertical ? 0 : rect.width),
        y2: y1 + (vertical ? rect.height : 0), width: vertical ? rect.width : rect.height },
        name, time, alpha * .67, high ? 24 : 12);
    }
    rectIndex++;
  }
  let segmentIndex = 0;
  for (const line of geometry.segments || []) {
    const angle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1), length = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
    if (kind === "boneNova") ultimateBone(ctx, line.x1, line.y1, length, line.width * 1.3, angle, mat, alpha);
    else if (kind === "magmaRift") ultimateLavaFissure(ctx, line, mat, time, alpha);
    else if (kind === "silkCage" || kind === "neuralGrid") ultimateSilkLine(ctx, line, mat, time, alpha, kind === "neuralGrid");
    else if (kind === "pincer") {
      ultimateBone(ctx, line.x1, line.y1, length, line.width * 2.2, angle, mat, alpha);
      for (let tooth = 1; tooth < 7; tooth++) {
        const t = tooth / 8, side = segmentIndex % 2 ? 1 : -1;
        ultimateBone(ctx, line.x1 + (line.x2 - line.x1) * t, line.y1 + (line.y2 - line.y1) * t,
          line.width * 1.3, line.width * .25, angle + side * 1.2, mat, alpha);
      }
    } else if (kind === "mirrorArray") ultimatePrismBeam(ctx, line, mat, alpha);
    else if (kind === "stormRing") ultimateArc(ctx, line.x1, line.y1, line.x2, line.y2, Math.floor(time * 13) + segmentIndex, mat, Math.max(2, line.width * .42), alpha);
    else ultimateSilkLine(ctx, line, mat, time, alpha, true);
    if (flowing && segmentIndex < (high ? 13 : 7)) {
      drawSignatureStream(ctx, line, name, time + segmentIndex * .03, alpha * .73, high ? 12 : 7);
    }
    segmentIndex++;
  }
  let circleIndex = 0;
  for (const circle of geometry.circles || []) {
    if (kind === "boneNova") ultimateOssuaryRing(ctx, circle, mat, time, alpha);
    else if (kind === "sporeBloom" || kind === "voidCollapse") ultimateCloud(ctx, circle, mat, time, alpha, kind === "voidCollapse");
    else if (kind === "magmaRift") ultimateDrawNode(ctx, circle.x, circle.y, circle.radius, name, alpha, "rock", time * .16);
    else if (kind === "stormRing") {
      const radius = circle.radius, inner = circle.innerRadius || Math.max(0, radius - 14);
      ctx.strokeStyle = mat.dark; ctx.globalAlpha = alpha; ctx.lineWidth = radius - inner;
      ctx.beginPath(); ctx.arc(circle.x, circle.y, (radius + inner) / 2, 0, Math.PI * 2); ctx.stroke();
      const pieces = visualQuality.id === "low" ? 12 : 22;
      // Preserve every subpath and sample; submit the ring's three light layers once.
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.beginPath();
      for (let i = 0; i < pieces; i++) {
        const a = i / pieces * Math.PI * 2, b = (i + 1) / pieces * Math.PI * 2;
        const r = (radius + inner) / 2;
        appendUltimateArcPath(ctx, circle.x + Math.cos(a) * r, circle.y + Math.sin(a) * r,
          circle.x + Math.cos(b) * r, circle.y + Math.sin(b) * r, i + Math.floor(time * 13));
      }
      strokeUltimateArcPath(ctx, mat, 2.5, alpha);
      ctx.restore();
    } else ultimateDrawNode(ctx, circle.x, circle.y, circle.radius, name, alpha);
    if (flowing && circleIndex++ < (high ? 8 : 4)) {
      const innerRadius = circle.innerRadius || circle.radius * (kind === "voidCollapse" ? .62 : .18);
      drawSignatureOrbit(ctx, { ...circle, innerRadius }, name, time, alpha * .72, 1, high ? 20 : 12);
    }
  }
  ctx.restore();
  for (const node of geometry.nodes || []) {
    if (node.health !== undefined && node.health <= 0) continue;
    const r = node.radius || 18;
    if (kind === "mirrorArray") ultimateCrystal(ctx, node.x, node.y, r * 2.0, (node.angle || 0) + Math.sin(time) * .06, mat, .95);
    else ultimateDrawNode(ctx, node.x, node.y, r * 1.6, name, .93, kind === "magmaRift" ? "rock" : "orb");
  }
  ctx.restore();
}

function drawBossUltimateArt(ctx, target, scene, layer) {
  if (layer !== "back" || !scene?.ultimateKind || typeof bossUltimateGeometry !== "function") return;
  if (scene.stage === "charge") drawUltimateChargeIdentity(ctx, target, scene);
  for (const hazard of bossHazards) {
    if (hazard.kind !== "ultimate" || hazard.age >= hazard.warning + hazard.duration) continue;
    drawBossUltimateGeometry(ctx, hazard, bossUltimateGeometry(hazard), target);
  }
}

function drawBossUltimateAftershock(ctx, scene) {
  if (!scene?.ultimateKind || pressureArt.burstAge < 0 || pressureArt.burstAge > .7) return false;
  const mat = signatureMaterials[pressureArt.material], age = pressureArt.burstAge;
  const quiet = quietCombatMotion(), h = viewport.height, w = viewport.width;
  const fade = (1 - age / .7) ** 1.6, travel = 1 - Math.exp(-age * 7.8);
  const cx = pressureArt.coreX * w, cy = pressureArt.coreY * h, front = cx - travel * w * 1.17;
  ctx.save();
  if (!scene.fullSeal) ultimateClipDanger(ctx, { noShield: true, gapY: scene.gapY, gapSize: scene.gapSize });
  const name = pressureArt.material;
  const texture = typeof getBossVfxMaterial === "function" ? getBossVfxMaterial(name) : null;
  const cloud = texture || pressureArtMist(mat.rim);
  const folds = visualQuality.id === "low" ? 6 : 11;
  for (let fold = 0; fold < folds; fold++) {
    const y = (fold + .27) * h / folds;
    const x = front + Math.sin(fold * 2.37) * h * .04 + ((y - cy) / h) ** 2 * w * .12;
    const radius = h * (.13 + (fold * .37 % .1));
    // Overlapping normal-lit, irregular density surfaces have no rectangular frame.
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(fold * 1.7) * .23);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = fade * (name === "void" ? .9 : .56);
    ctx.drawImage(cloud, -radius * .55, -radius, radius * 1.8, radius * 2);
    ctx.restore();
    if (name === "bone") ultimateBone(ctx, x + radius * .5, y, radius * .72, radius * .10, Math.PI + .12 * Math.sin(fold), mat, fade * .8);
    else if (name === "magma") ultimateDrawNode(ctx, x + radius * .33, y, radius * .19, name, fade * .82, "rock", fold + age * 2);
    else if (name === "glass") ultimateCrystal(ctx, x + radius * .4, y, radius * .24, fold * 1.3 + age * .5, mat, fade * .85);
    else if (name === "chitin") ultimateBone(ctx, x + radius * .6, y, radius * .7, radius * .22, Math.PI + (fold % 2 ? .2 : -.2), mat, fade * .7);
    else if (name === "plasma") ultimateArc(ctx, x, y - radius * .65, x + radius * .17, y + radius * .65, fold + (quiet ? 0 : Math.floor(age * 15)), mat, 2.3, fade * .85);
    else if (name === "silk" || name === "nerve") {
      const line = {x1:x + radius * .2,y1:y - radius * .6,x2:x + radius * .5,y2:y + radius * .6,width:name === "nerve" ? 9 : 5};
      ultimateSilkLine(ctx, line, mat, quiet ? 0 : age, fade * .65, name === "nerve");
    } else if (name === "water") {
      ctx.strokeStyle = mat.spark; ctx.lineWidth = 1.6; ctx.globalAlpha = fade * .8;
      ctx.beginPath(); ctx.moveTo(x + radius * .3, y - radius * .6);
      ctx.bezierCurveTo(x - radius * .13, y - radius * .2, x + radius * .35, y + radius * .2, x + radius * .08, y + radius * .6); ctx.stroke();
    }
  }
  if (!quiet && visualQuality.id !== "low") {
    const high = visualQuality.id === "high";
    const count = high ? 40 : 24;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const seed = signatureFlowSeeds[i];
      const y = h * seed.start;
      const span = w * (.024 + seed.depth * .098) * (1 + travel * .42);
      const x = front + (seed.depth - .5) * span * 2.6 + ((y - cy) / h) ** 2 * w * .12;
      const curl = Math.sin(seed.phase + age * 5) * span * .33;
      if (x + span < 0 || x - span > w) continue;
      ctx.moveTo(x + span, y - curl * .16);
      ctx.bezierCurveTo(x + span * .47, y - curl * .48, x - span * .22, y + curl, x - span * .31, y + curl * .24);
    }
    ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    strokeSignatureCurrent(ctx, mat, fade * .82, .94);
  }
  // White-hot release is local; the arena never becomes an opaque white rectangle.
  ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = Math.max(0, 1 - age / .25) * .8;
  const glow = pressureArtGlow(mat.rim, true), size = h * (.18 + age * .6);
  ctx.drawImage(glow, cx - size, cy - size * .6, size * 2, size * 1.2);
  ctx.restore();
  return true;
}

function drawBossUltimateHazard(ctx, hazard, quiet) {
  if (!boss || typeof bossUltimateGeometry !== "function") return;
  const active = hazard.age >= hazard.warning;
  let geometry = bossUltimateGeometry(hazard);
  if (!active && (hazard.ultimateKind === "magmaRift" || hazard.ultimateKind === "pincer" || hazard.ultimateKind === "silkCage" || hazard.ultimateKind === "neuralGrid")) {
    // Delayed inner contacts are visible throughout the charge, not at damage time.
    if (!hazard.ultimateArtPreview) {
      hazard.ultimateArtPreview = bossUltimateGeometry({ ...hazard, age: hazard.warning + hazard.duration * .5 });
      if (hazard.ultimateKind === "neuralGrid") {
        for (const p of [.12, .84]) {
          const slice = bossUltimateGeometry({ ...hazard, age: hazard.warning + hazard.duration * p });
          for (const segment of slice.segments) if (segment.x1 === segment.x2) hazard.ultimateArtPreview.segments.push(segment);
        }
      }
    }
    geometry = hazard.ultimateArtPreview;
  }
  const mat = ultimateMaterial(boss);
  ctx.save(); ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = active ? mat.spark : "#c4b7a6";
  ctx.lineWidth = active ? 1.4 : 1.3; ctx.globalAlpha = active ? .76 : .58;
  ctx.save(); ultimateClipDanger(ctx, hazard);
  if (!active) ctx.setLineDash([6, 5]);
  for (const rect of geometry.rects || []) {
    if (!active) ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    else {
      ctx.globalAlpha = .38;
      ctx.beginPath();
      if (hazard.ultimateKind === "tideWalls") {
        ctx.moveTo(rect.x, rect.y); ctx.lineTo(rect.x, rect.y + rect.height);
        ctx.moveTo(rect.x + rect.width, rect.y); ctx.lineTo(rect.x + rect.width, rect.y + rect.height);
      } else {
        ctx.moveTo(rect.x, rect.y); ctx.lineTo(rect.x + rect.width, rect.y);
        ctx.moveTo(rect.x, rect.y + rect.height); ctx.lineTo(rect.x + rect.width, rect.y + rect.height);
      }
      ctx.stroke(); ctx.globalAlpha = .76;
    }
  }
  for (const circle of geometry.circles || []) {
    ctx.beginPath(); ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2); ctx.stroke();
    if (circle.innerRadius > 0) { ctx.beginPath(); ctx.arc(circle.x, circle.y, circle.innerRadius, 0, Math.PI * 2); ctx.stroke(); }
  }
  for (const line of geometry.segments || []) {
    const dx = line.x2 - line.x1, dy = line.y2 - line.y1, d = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / d * line.width / 2, ny = dx / d * line.width / 2;
    if (active && hazard.ultimateKind === "mirrorArray") ctx.globalAlpha = .24;
    ctx.beginPath(); ctx.moveTo(line.x1 + nx, line.y1 + ny); ctx.lineTo(line.x2 + nx, line.y2 + ny);
    ctx.moveTo(line.x1 - nx, line.y1 - ny); ctx.lineTo(line.x2 - nx, line.y2 - ny); ctx.stroke();
    if (active) ctx.globalAlpha = .76;
  }
  ctx.restore(); ctx.setLineDash([]);
  ctx.strokeStyle = "#81d6c9"; ctx.globalAlpha = active ? .38 : .74;
  for (const safe of geometry.safe || []) {
    ctx.strokeRect(safe.x, safe.y, safe.width, safe.height);
    const x = safe.x + safe.width / 2, y = safe.y + safe.height / 2;
    ctx.beginPath(); ctx.moveTo(x - 7, y - 3); ctx.lineTo(x, y + 3); ctx.lineTo(x + 7, y - 3); ctx.stroke();
  }
  // Exposed, attackable nodes are foreground silhouettes, with a physical health arc.
  for (const node of geometry.nodes || []) {
    if (node.health !== undefined && node.health <= 0) continue;
    const r = node.radius || 18;
    if (hazard.ultimateKind === "mirrorArray") ultimateCrystal(ctx, node.x, node.y, r * 1.7, node.angle || 0, mat, .97);
    else ultimateDrawNode(ctx, node.x, node.y, r * 1.3, pressureMaterialNames[boss.type], .95);
    if (node.maxHealth > 0) {
      ctx.globalAlpha = .9; ctx.strokeStyle = mat.spark; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(node.x, node.y, r * 1.45, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(node.health / node.maxHealth, 0, 1)); ctx.stroke();
    }
  }
  ctx.restore();
}
