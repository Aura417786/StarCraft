"use strict";

// These silhouettes follow the mechanics' geometry; textures never determine hits.
const bossUltimateArtKinds = ["tideWalls", "boneNova", "magmaRift", "silkCage", "pincer", "mirrorArray", "stormRing", "sporeBloom", "voidCollapse", "neuralGrid", "fusion"];
const ultimateSurfaceCache = new Map();

// Cropped transparent material plates. Each caster animates its own physical
// parts. Fallback painters remain available during network/decode latency.
const BossSpellMatter = (() => {
  const parts = Object.freeze({ rib: 0, vent: 1, spindle: 2, claw: 3, prism: 4,
    streamer: 5, pod: 6, accretion: 7, synapse: 8, lance: 9 });
  const plate = new Image();
  plate.decoding = "async";
  plate.src = "assets/vfx/nextgen/spell-matter.webp";
  const cell = 416;
  function draw(ctx, name, x, y, width, height, angle = 0, flipX = false, flipY = false) {
    if (!plate.complete || plate.naturalWidth !== cell * 5 || width <= 0 || height <= 0) return false;
    const pos = parts[name];
    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);
    if (flipX || flipY) ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(plate, pos % 5 * cell, Math.floor(pos / 5) * cell, cell, cell,
      -width * .5, -height * .5, width, height);
    ctx.restore();
    return true;
  }
  return { draw };
})();

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
  // A narrow, saturated aperture appears only at the end of charge.
  const opening = Math.max(0, (charge - .40) / .60);
  if (opening > 0) {
    const size = radius * (.10 + .14 * opening);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(.50, 1);
    const aperture = ctx.createRadialGradient(-size * .18, -size * .16, 0, 0, 0, size);
    aperture.addColorStop(0, material.spark + "cd");
    aperture.addColorStop(.27, material.rim + "97");
    aperture.addColorStop(.55, material.mid + "46");
    aperture.addColorStop(1, material.mid + "00");
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = .82 * opening * opening;
    ctx.fillStyle = aperture;
    ctx.fillRect(-size, -size, 2 * size, 2 * size);
    ctx.restore();
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
  if (bossElementalVfx(target.type)?.charge?.(ctx, target, scene, {x:cx, y:cy, radius:r, charge, time, quiet, material:mat})) return;
  if (typeof NextgenVfx !== "undefined" && ["tideWalls", "magmaRift", "voidCollapse"].includes(kind)) {
    if (kind === "magmaRift") {
      if (!NextgenVfx.drawCinderCharge(ctx, cx, cy, r, charge, time, quiet)) {
        NextgenVfx.drawEruption(ctx, { x: cx, y: cy, radius: r * .85 }, mat, time, fade * .80);
      }
    }
    else if (kind === "voidCollapse") {
      ctx.save();ctx.translate(cx,cy);ctx.rotate(-.18);ctx.scale(1,.62);
      NextgenVfx.drawVoid(ctx, { x: 0, y: 0, radius: r }, mat, time, fade * .92);ctx.restore();
    } else NextgenVfx.drawVoid(ctx, { x: cx, y: cy, radius: r }, mat, time, fade * .82, true);
    return;
  }
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

function ultimateClipDanger(ctx, hazard) {
  if (!hazard.noShield) return;
  const top = clamp(hazard.gapY - hazard.gapSize / 2, 0, viewport.height);
  const bottom = clamp(hazard.gapY + hazard.gapSize / 2, 0, viewport.height);
  ctx.beginPath(); ctx.rect(0, 0, viewport.width, top);
  ctx.rect(0, bottom, viewport.width, viewport.height - bottom); ctx.clip();
}

let bossLaneFringe;

function drawBossUltimateGeometry(ctx,hazard,geometry,target) {
  if (!hazard.noShield || typeof ctx.getTransform!=="function") {
    paintBossUltimateGeometry(ctx,hazard,geometry,target);
    return;
  }
  const m=ctx.getTransform();
  if (m.a<=0 || m.d<=0 || Math.abs(m.b)+Math.abs(m.c)>.001) {
    paintBossUltimateGeometry(ctx,hazard,geometry,target);
    return;
  }
  // The regular renderer supplies the completed world before painting the
  // spell, so sunlight, additive emission, refraction, and soft-light interact
  // with the true scene. Preview canvases can take their own one-frame copy.
  const supplied=NextgenVfx.getSuppliedWorld(ctx);
  const world=supplied || NextgenVfx.refractionSource(ctx);
  if(!supplied)NextgenVfx.supplyWorldSource(ctx,world);
  try { paintBossUltimateGeometry(ctx,hazard,geometry,target); }
  finally { if(!supplied)NextgenVfx.supplyWorldSource(null,null); }
  const band=Math.max(8,Math.min(22,viewport.height*.028));
  const top=hazard.gapY-hazard.gapSize*.5, bottom=hazard.gapY+hazard.gapSize*.5;
  const w=Math.ceil(viewport.width*m.a), h=Math.ceil(band*m.d);
  if (!bossLaneFringe) {
    const surface=document.createElement("canvas");
    bossLaneFringe={surface,paint:surface.getContext("2d"),mask:null};
  }
  const fringe=bossLaneFringe,{surface,paint}=fringe;
  // The tide's charge camera changes the pixel width almost every frame.
  // Reserve backing pixels separately from the exact visible strip below.
  const tide=hazard.ultimateKind==="tideWalls";
  const bufferWidth=tide ? Math.ceil(w/256)*256 : w;
  const bufferHeight=tide ? Math.ceil(h*2/16)*16 : h*2;
  if (!fringe.mask || surface.width!==bufferWidth || surface.height!==bufferHeight || fringe.rows!==h) {
    if(surface.width!==bufferWidth) surface.width=bufferWidth;
    if(surface.height!==bufferHeight) surface.height=bufferHeight;
    fringe.rows=h;
    fringe.mask=paint.createLinearGradient(0,0,0,h*2);
    for(const [stop,alpha] of [[0,0],[.15,.09],[.38,.73],[.5,1],[.62,.73],[.85,.09],[1,0]])
      fringe.mask.addColorStop(stop,"rgba(0,0,0,"+alpha+")");
  }
  paint.clearRect(0,0,w,h*2);
  paint.drawImage(world,m.e,(top-band)*m.d+m.f,viewport.width*m.a,band*m.d,0,0,w,h);
  paint.drawImage(world,m.e,bottom*m.d+m.f,viewport.width*m.a,band*m.d,0,h,w,h);
  paint.globalCompositeOperation="destination-in";
  paint.fillStyle=fringe.mask;paint.fillRect(0,0,w,h*2);
  paint.globalCompositeOperation="source-over";
  ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";
  ctx.drawImage(surface,0,0,w,h,0,top-band,viewport.width,band);
  ctx.drawImage(surface,0,h,w,h,0,bottom,viewport.width,band);ctx.restore();
}
function paintBossUltimateGeometry(ctx, hazard, geometry, target) {
  const quiet = quietCombatMotion();
  const time = quiet ? 0 : hazard.age;
  const active = hazard.age >= hazard.warning;
  const alpha = active ? .96 : .20 + Math.min(1, hazard.age / hazard.warning) * .19;
  const kind = hazard.ultimateKind;
  const mat = ultimateMaterial(target);
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ultimateClipDanger(ctx, hazard);
  if (bossElementalVfx(target.type)?.ultimate?.(ctx, hazard, geometry, target, { active, quiet, alpha })) {
    ctx.restore();
    return;
  }
  if (kind === "magmaRift") {
    const room = mechanicRoom();
    const layout = active ? geometry : bossUltimateGeometry({ ...hazard, age: hazard.warning + hazard.duration * .5 });
    if (NextgenVfx.drawCinderRift(ctx, layout, hazard, room.height * .31, quiet)) {
      ctx.restore();
      return;
    }
  }
  if (BossCreatureVfx.drawUltimate(ctx, hazard, geometry, target, { active, quiet, alpha })
      || BossEnergyVfx.drawUltimate(ctx, hazard, geometry, quiet)) {
    ctx.restore();
    return;
  }
  for (const [index, rect] of geometry.rects.entries()) {
    if (kind === "tideWalls") {
      const x = rect.x + rect.width / 2;
      NextgenVfx.drawWaterSection(ctx, () => x, rect.y, rect.y + rect.height,
        index < 2 ? -1 : 1, time, rect.width / 2, mat, !active, quiet);
    } else if (kind === "magmaRift") {
      const y = rect.y + rect.height / 2;
      NextgenVfx.drawMagmaFissure(ctx,
        { x1: rect.x, y1: y, x2: rect.x + rect.width, y2: y, width: rect.height },
        mat, time, alpha);
    } else if (kind === "fusion") {
      BossConfluenceVfx.column(ctx, rect, time, alpha, quiet);
    }
  }
  for (const line of geometry.segments) {
    const style = kind === "fusion" ? "lance" : "void";
    if (kind === "fusion" || kind === "voidCollapse") {
      BossConfluenceVfx.beam(ctx, line, time, alpha, style, quiet);
      if (kind === "voidCollapse" && active) {
        BossConfluenceVfx.ring(ctx, { x: hazard.lockX, y: hazard.lockY,
          radius: line.width * 2.8, innerRadius: line.width * 1.4 },
          time * 1.7, .84, "void", quiet);
      }
    }
  }
  for (const circle of geometry.circles) {
    if (kind === "magmaRift") NextgenVfx.drawEruption(ctx, circle, mat, time, alpha);
    else if (kind === "sporeBloom") NextgenVfx.drawSporeCloud(ctx, circle, time, alpha);
    else if (kind === "voidCollapse") {
      if (!circle.innerRadius) NextgenVfx.drawVoid(ctx, circle, mat, time, alpha);
      BossConfluenceVfx.ring(ctx, circle.innerRadius ? circle : { ...circle, innerRadius: circle.radius * .82 },
        time, alpha, "void", quiet);
    } else if (kind === "fusion") {
      BossConfluenceVfx.ring(ctx, circle, -time, alpha, "siphon", quiet);
    }
  }
  ctx.restore();
}

function drawBossUltimateArt(ctx, target, scene, layer, chargeDrawn = false) {
  if (layer !== "back" || !scene?.ultimateKind || typeof bossUltimateGeometry !== "function") return;
  if (!chargeDrawn && scene.stage === "charge") drawUltimateChargeIdentity(ctx, target, scene);
  for (const hazard of bossHazards) {
    if (hazard.kind !== "ultimate" || hazard.age < (hazard.tellAt || 0) || hazard.age >= hazard.warning + hazard.duration) continue;
    if (hazard.age < hazard.warning && (hazard.ultimateKind === "boneNova" || hazard.ultimateKind === "pincer")) continue;
    drawBossUltimateGeometry(ctx, hazard, bossUltimateGeometry(hazard), target);
  }
  if (scene.ultimateKind === "magmaRift") drawCinderCoolingAsh(ctx, scene);
}

// Render-only wake following the 2.3s environmental attack. It has no hazard
// entry, collision callback or impact cue and finishes before the seal pulse.
function drawCinderCoolingAsh(ctx, scene) {
  const cooling = scene.age - (scene.warning + scene.activeDuration);
  if (!(cooling > 0 && cooling < .65)) return;
  const room = mechanicRoom();
  const tail = { ultimateKind: "magmaRift", warning: scene.warning, duration: scene.activeDuration,
    age: scene.warning + scene.activeDuration * .895 + cooling * .14, gapY: scene.gapY, gapSize: scene.gapSize,
    noShield: !scene.fullSeal };
  ctx.save();
  ultimateClipDanger(ctx, tail);
  NextgenVfx.drawCinderRift(ctx, bossUltimateGeometry(tail), tail, room.height * .31, quietCombatMotion(), cooling / .65);
  ctx.restore();
}

function drawBossUltimateAftershock(ctx, scene) {
  if (!scene?.ultimateKind || pressureArt.burstAge < 0 || pressureArt.burstAge > .7) return false;
  const mat = signatureMaterials[pressureArt.material], age = pressureArt.burstAge;
  const quiet = quietCombatMotion(), h = viewport.height, w = viewport.width;
  const fade = (1 - age / .7) ** 1.6, travel = 1 - Math.exp(-age * 7.8);
  const cx = pressureArt.coreX * w, cy = pressureArt.coreY * h, front = cx - travel * w * 1.17;
  ctx.save();
  if (!scene.fullSeal) ultimateClipDanger(ctx, { noShield: true, gapY: scene.gapY, gapSize: scene.gapSize });
  if (bossElementalVfx(boss?.type)?.aftershock?.(ctx, scene, {x:cx, y:cy, width:w, height:h, age, quiet, material:mat})) {
    ctx.restore();
    return true;
  }
  if (scene.ultimateKind === "magmaRift" && NextgenVfx.drawCinderAftershock(ctx, cx, cy, w, h, age, quiet)) {
    ctx.restore();
    return true;
  }
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
    // Moving light grazes the leading folds; the wake keeps its darker tint.
    // This follows the visual shockfront inside the existing danger clip.
    const edge = h * .085;
    if (front + w * .12 + edge > 0) {
      const crest = ctx.createLinearGradient(front - edge, 0, front + edge * 1.8, 0);
      crest.addColorStop(0, mat.dark + "00");
      crest.addColorStop(.29, mat.rim + "56");
      crest.addColorStop(.42, mat.spark + "80");
      crest.addColorStop(.56, mat.rim + "44");
      crest.addColorStop(1, mat.mid + "00");
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = fade * (name === "void" ? .25 : .56);
      ctx.fillStyle = crest;
      ctx.beginPath();
      ctx.moveTo(front - edge, 0);
      ctx.quadraticCurveTo(front - edge * 1.22, cy, front - edge, h);
      ctx.lineTo(front + edge * 1.8, h);
      ctx.quadraticCurveTo(front + edge * .56, cy, front + edge * 1.8, 0);
      ctx.closePath();
      ctx.fill();
    }
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
  // Keep the emission core brighter than the broad, colored spill.
  const flash = Math.max(0, 1 - age / .25);
  if (flash > 0) {
    const size = h * (.18 + age * .6);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = flash * (quiet ? .3 : .57);
    ctx.drawImage(pressureArtGlow(mat.rim), cx - size, cy - size * .55, size * 2, size * 1.1);
    if (!quiet && visualQuality.id !== "low") {
      ctx.globalAlpha = flash * .74;
      ctx.drawImage(pressureArtGlow(mat.rim, true), cx - size * .52, cy - size * .43, size * 1.04, size * .86);
    }
  }
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
  // Telegraphs show the real extents. Active effects own their silhouettes.
  if (!active) {
    ctx.save();
    ultimateClipDanger(ctx, hazard);
    const armoredTelegraph = (hazard.ultimateKind === "boneNova" || hazard.ultimateKind === "pincer")
      && bossElementalVfx(boss.type)?.ultimate?.(ctx, hazard, geometry, boss,
        { active: false, quiet, alpha: .62 + .20 * clamp(hazard.age / hazard.warning, 0, 1) });
    if (!armoredTelegraph) {
      ctx.strokeStyle = "#e7d8c2";
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = .68;
      ctx.setLineDash([7, 6]);
      for (const rect of geometry.rects) {
        const { x, y, width, height } = rect;
        ctx.save();
        const charge = clamp(hazard.age / Math.max(.01,hazard.warning),0,1);
        drawBossFieldWash(ctx,x,y,width,height,mat.rim,.48+.32*charge,quiet?0:hazard.age);
        ctx.globalAlpha=.52+.22*charge;
        bossRangeMarks(ctx,x,y,width,height,mat.rim,height>width);
        ctx.restore();
      }
      for (const circle of geometry.circles) {
        ctx.beginPath(); ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2); ctx.stroke();
        if (circle.innerRadius > 0) {
          ctx.beginPath(); ctx.arc(circle.x, circle.y, circle.innerRadius, 0, Math.PI * 2); ctx.stroke();
        }
      }
      for (const line of geometry.segments) {
        const dx=line.x2-line.x1, dy=line.y2-line.y1, length=Math.hypot(dx,dy);
        ctx.save();ctx.translate(line.x1,line.y1);ctx.rotate(Math.atan2(dy,dx));
        drawBossFieldWash(ctx,0,-line.width*.5,length,line.width,mat.rim,.79);
        bossRangeMarks(ctx,0,-line.width*.5,length,line.width,mat.rim);
        ctx.restore();
      }
    }
    ctx.restore();
  }
  ctx.save();
  ultimateClipDanger(ctx,hazard);
  BossResonance.ultimateImpact(ctx,boss,hazard,geometry,quiet);
  ctx.restore();
  const time = quiet ? 0 : hazard.age;
  // The no-shield gap is already marked by the seal warning on this frame.
  if (hazard.noShield) {
    if (active) BossConfluenceVfx.safeContact(ctx, geometry, hazard.gapY, hazard.gapSize, mat.rim, time);
  } else {
    for (const safe of geometry.safe) {
      BossConfluenceVfx.safeGuide(ctx, safe.x, safe.y, safe.width, safe.height, active, time);
    }
  }
  const elementalNodes = bossElementalVfx(boss.type)?.ultimateNodes?.(ctx, hazard, geometry, quiet);
  if (!elementalNodes && !BossEnergyVfx.drawUltimateNodes(ctx, hazard, geometry, quiet)) {
    // Keep target silhouettes above the danger material and outside the gap clip.
    for (const node of geometry.nodes) {
      if (node.health <= 0) continue;
      const r = node.radius;
      if (hazard.ultimateKind === "fusion") {
        BossConfluenceVfx.fusionNode(ctx, node, node.role, time, .96, quiet);
        continue;
      }
      if (hazard.ultimateKind === "sporeBloom") NextgenVfx.drawSporePod(ctx, node, time, .96);
      else if (hazard.ultimateKind === "mirrorArray") {
        BossCreatureVfx.drawPrismNode(ctx, node, mat, time, .96, quiet);
      }
      if (node.maxHealth > 0 && node.health < node.maxHealth) {
        ctx.globalAlpha = .92;
        ctx.strokeStyle = mat.spark;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 1.19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * node.health / node.maxHealth);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
