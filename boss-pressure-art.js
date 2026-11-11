"use strict";

// Presentation follows the combat clock. Its particles never enter collision lists.
const pressureMaterialNames = ["water", "bone", "magma", "silk", "chitin", "glass", "plasma", "spore", "void", "nerve", "fusion"];
const pressureParticlePool = Array.from({ length: 216 }, () => ({ life: 0 }));
const pressureArt = { target: null, sequence: -1, burst: false, clock: 0, spawned: 0, peak: 0,
  coreX: 0, coreY: 0, color: "#87ddff", light: "#eaffff", material: "water", burstAge: 10,
  armored: false, releaseAge: 1 };
const pressureGlowCache = new Map();
const pressureMistCache = new Map();
const pressureFrontCache = new Map();

function clearBossPressureArt() {
  for (const particle of pressureParticlePool) particle.life = 0;
  pressureArt.target = null;
  pressureArt.sequence = -1;
  pressureArt.burst = false;
  pressureArt.burstAge = 10;
  pressureArt.spawned = 0;
  pressureArt.peak = 0;
  pressureArt.clock = 0;
  pressureArt.armored = false;
  pressureArt.releaseAge = 1;
}

function pressureArtGlow(color, core = false) {
  const key = color + (core ? "core" : "haze");
  if (pressureGlowCache.has(key)) return pressureGlowCache.get(key);
  const surface = document.createElement("canvas");
  surface.width = 192;
  surface.height = 192;
  const brush = surface.getContext("2d");
  const gradient = brush.createRadialGradient(96, 96, 0, 96, 96, 96);
  gradient.addColorStop(0, core ? "#fffff4" : color + "9a");
  gradient.addColorStop(core ? .08 : .24, color + (core ? "e8" : "4a"));
  gradient.addColorStop(.52, color + "24");
  gradient.addColorStop(1, color + "00");
  brush.fillStyle = gradient;
  brush.fillRect(0, 0, 192, 192);
  pressureGlowCache.set(key, surface);
  return surface;
}

function pressureArtMist(color) {
  if (pressureMistCache.has(color)) return pressureMistCache.get(color);
  const surface = document.createElement("canvas");
  surface.width = 192;
  surface.height = 192;
  const brush = surface.getContext("2d");
  for (let fold = 0; fold < 28; fold++) {
    const angle = fold * 2.399963;
    const radius = 12 + (fold * 23 % 61);
    const x = 96 + Math.cos(angle) * radius * .7;
    const y = 96 + Math.sin(angle) * radius * .64;
    const size = 15 + fold % 7 * 5;
    const mist = brush.createRadialGradient(x, y, 0, x, y, size);
    mist.addColorStop(0, fold % 3 ? color + "20" : "#02071068");
    mist.addColorStop(.45, fold % 3 ? color + "0d" : "#02071024");
    mist.addColorStop(1, "#02071000");
    brush.fillStyle = mist;
    brush.fillRect(x - size, y - size, size * 2, size * 2);
  }
  pressureMistCache.set(color, surface);
  return surface;
}

function pressureFrontTexture(materialName) {
  if (pressureFrontCache.has(materialName)) return pressureFrontCache.get(materialName);
  const material = signatureMaterials[materialName];
  const surface = document.createElement("canvas");
  surface.width = 256;
  surface.height = 512;
  const brush = surface.getContext("2d");
  const glass = materialName === "glass";
  const magma = materialName === "magma";
  const edge = y => 41 + Math.sin(y * .036) * 13 + Math.sin(y * .091 + 1.8) * 5 + Math.sin(y * .223) * 2;
  // Opaque shadow folds sit under luminous edges, giving the moving front mass.
  for (let fold = 7; fold >= 0; fold--) {
    const offset = fold * 15;
    brush.beginPath();
    for (let y = 0; y <= 512; y += 4) {
      const x = edge(y + fold * 17) + offset;
      if (!y) brush.moveTo(x, y); else brush.lineTo(x, y);
    }
    for (let y = 512; y >= 0; y -= 4) brush.lineTo(edge(y + fold * 17) + offset + 31 + Math.sin(y * .055 + fold) * 9, y);
    brush.closePath();
    brush.fillStyle = fold % 2 ? material.dark + "d9" : material.mid + "b0";
    brush.globalAlpha = 1 - fold * .09;
    brush.fill();
    brush.strokeStyle = material.rim;
    brush.lineWidth = fold === 0 ? 2.5 : 1.1;
    brush.globalAlpha = fold === 0 ? .92 : .11;
    brush.stroke();
  }
  brush.globalCompositeOperation = "lighter";
  for (let streak = 0; streak < 55; streak++) {
    const y = streak * 9.4;
    const x = edge(y) + 4 + streak % 5 * 5;
    const length = 15 + streak * 19 % 45;
    brush.globalAlpha = .18 + streak % 4 * .12;
    brush.strokeStyle = streak % 3 ? material.rim : material.spark;
    brush.lineWidth = streak % 4 ? .8 : 1.8;
    brush.beginPath(); brush.moveTo(x, y);
    if (glass) {
      brush.lineTo(x + length, y - length * .22); brush.lineTo(x + length * .8, y + 8);
    } else if (magma) {
      brush.lineTo(x + length * .35, y + 7); brush.lineTo(x + length * .65, y - 4); brush.lineTo(x + length, y + 10);
    } else {
      brush.bezierCurveTo(x + length * .35, y - 13, x + length * .68, y + 18, x + length, y + 2);
    }
    brush.stroke();
  }
  // Break up the ridge with deterministic spray, flecks and glass facets.
  for (let fleck = 0; fleck < 200; fleck++) {
    const y = fleck * 197 % 512;
    const x = edge(y) + (fleck * 71 % 107) - 20;
    brush.fillStyle = material.spark;
    brush.globalAlpha = .09 + (fleck % 6) * .08;
    const size = .5 + fleck % 4 * .45;
    brush.fillRect(x, y, glass ? size * 4 : size, size);
  }
  pressureFrontCache.set(materialName, surface);
  return surface;
}

function emitPressureBurst(target) {
  const quality = visualQuality.id;
  const quiet = quietCombatMotion();
  const count = quiet ? 36 : quality === "low" ? 60 : quality === "medium" ? 84 : 120;
  const width = viewport.width, height = viewport.height;
  let emitted = 0;
  for (const particle of pressureParticlePool) {
    if (particle.life > 0) continue;
    const index = emitted++;
    const angle = index * 2.3999632297 + target.type * .71;
    const spread = .28 + (index * 37 % 101) / 101;
    const speed = quiet ? .05 : .16 + spread * .54;
    particle.x = pressureArt.coreX + Math.cos(angle) * .018;
    particle.y = pressureArt.coreY + Math.sin(angle) * .025;
    particle.previousX = particle.x;
    particle.previousY = particle.y;
    // The discharge travels toward the player. Debris inherits that momentum;
    // water spray is strongly advected rather than exploding in all directions.
    const water = pressureArt.material === "water";
    particle.vx = -(water ? .82 + Math.abs(Math.cos(angle)) * .22 : .24 + Math.abs(Math.cos(angle)) * .67) * speed * height / width;
    particle.vy = Math.sin(angle) * speed * (water ? .17 : .42);
    if (pressureArt.material === "magma") particle.vy += speed * .12;
    particle.life = .7 + (index % 11) * .055;
    particle.duration = particle.life;
    particle.size = .9 + (index % 5) * .7;
    particle.rotation = Math.atan2(particle.vy, particle.vx * width / height);
    particle.spin = quiet ? 0 : (index % 2 ? 1 : -1) * (1 + index % 4);
    particle.kind = index % 3;
    particle.drag = particle.kind === 2 ? 3.1 : 1.05;
    if (emitted >= count) break;
  }
  pressureArt.spawned = emitted;
}

function updateBossPressureArt(seconds) {
  if (!(seconds > 0) || !Number.isFinite(seconds)) return;
  if (state !== "battle" || !boss || boss.finale || boss.hp <= 0) {
    clearBossPressureArt();
    return;
  }
  if (pressureArt.target && pressureArt.target !== boss) clearBossPressureArt();
  pressureArt.clock += seconds;
  pressureArt.spawned = 0;
  pressureArt.burstAge += seconds;
  pressureArt.releaseAge += seconds;
  if (pressureArt.armored && !boss.pressureArmor) pressureArt.releaseAge = 0;
  pressureArt.armored = !!boss.pressureArmor;
  const scene = boss.pressureState;
  if (scene) {
    if (pressureArt.target !== boss || pressureArt.sequence !== scene.sequence) {
      pressureArt.target = boss;
      pressureArt.sequence = scene.sequence;
      pressureArt.burst = false;
      pressureArt.material = pressureMaterialNames[boss.type];
      const material = signatureMaterials[pressureArt.material];
      pressureArt.color = material.rim;
      pressureArt.light = material.spark;
    }
    pressureArt.coreX = (boss.x - boss.width * .27) / viewport.width;
    pressureArt.coreY = boss.y / viewport.height;
    const burstAt = Number.isFinite(scene.pulseAt) ? scene.pulseAt : scene.warning;
    if (scene.age >= burstAt && !pressureArt.burst) {
      pressureArt.burst = true;
      pressureArt.burstAge = scene.age - burstAt;
      emitPressureBurst(boss);
      if (!quietCombatMotion()) addCombatShake(4);
    }
  }
  let active = 0;
  for (const particle of pressureParticlePool) {
    if (particle.life <= 0) continue;
    particle.life = Math.max(0, particle.life - seconds);
    particle.previousX = particle.x;
    particle.previousY = particle.y;
    const friction = Math.exp(-seconds * particle.drag);
    particle.vx *= friction;
    particle.vy *= friction;
    if (particle.kind === 0) particle.vy += .07 * seconds;
    particle.x += particle.vx * seconds;
    particle.y += particle.vy * seconds;
    particle.rotation += particle.spin * seconds;
    active++;
  }
  pressureArt.peak = Math.max(pressureArt.peak, active);
}

function bossPressureCameraScale() {
  const scene = boss?.pressureState;
  if (!scene || quietCombatMotion()) return 1;
  const charge = Math.min(1, scene.age / scene.warning);
  const release = scene.age <= scene.warning ? 1 : Math.max(0, 1 - (scene.age - scene.warning) / .12);
  return 1 + .04 * charge * charge * release;
}

function drawPressureConvergence(ctx, target, scene, color, quiet) {
  const charge = clamp(scene.age / scene.warning, 0, 1);
  const cx = target.x - target.width * .27, cy = target.y;
  const reach = viewport.height * (.32 + charge * .11);
  const time = quiet ? 0 : scene.age;
  const count = visualQuality.id === "low" ? 6 : 11;
  ctx.save();
  ctx.lineCap = "round";
  const mist = pressureArtMist(color);
  for (let strand = 0; strand < count; strand++) {
    const angle = strand * Math.PI * 2 / count + time * .16;
    const outer = reach * (1 + .19 * Math.sin(strand * 3.2));
    const twist = .38 + .3 * charge;
    if (visualQuality.id !== "low") {
      ctx.globalCompositeOperation = "source-over";
      for (let fold = 0; fold < 5; fold++) {
        const t = (fold + .5) / 5;
        const radius = outer * (1 - t) + 9;
        const bend = angle + t * twist;
        const x = cx + Math.cos(bend) * radius * 1.27;
        const y = cy + Math.sin(bend) * radius * .73;
        const size = 55 + 30 * Math.sin(t * Math.PI);
        ctx.globalAlpha = charge * .75;
        ctx.drawImage(mist, x - size, y - size * .7, size * 2, size * 1.4);
      }
    }
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    for (let segment = 0; segment <= 22; segment++) {
      const t = segment / 22;
      const radius = outer * (1 - t) + 9;
      const bend = angle + t * twist + Math.sin(t * 9 + strand) * .055;
      const x = cx + Math.cos(bend) * radius * 1.27;
      const y = cy + Math.sin(bend) * radius * .73;
      if (segment === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.globalAlpha = (.03 + charge * .07) * (strand % 2 ? .65 : 1);
    ctx.lineWidth = 10 + charge * 15;
    ctx.stroke();
    ctx.globalAlpha = .14 + charge * .36;
    ctx.lineWidth = .65 + charge * .7;
    ctx.stroke();
    // Motes accelerate toward the throat along the visible flow lines.
    for (let mote = 0; mote < 3; mote++) {
      const t = (time * (.43 + charge * .5) + mote / 3 + strand * .127) % 1;
      const radius = outer * (1 - t) + 9;
      const bend = angle + t * twist + Math.sin(t * 9 + strand) * .055;
      const x = cx + Math.cos(bend) * radius * 1.27;
      const y = cy + Math.sin(bend) * radius * .73;
      ctx.globalAlpha = Math.sin(t * Math.PI) * (.25 + charge * .55);
      ctx.fillStyle = pressureArt.light;
      ctx.beginPath(); ctx.ellipse(x, y, 1.6 + charge, .8 + charge * .35, bend, 0, Math.PI * 2); ctx.fill();
    }
  }
  const halo = pressureArtGlow(color, true);
  ctx.globalAlpha = .5 + charge * .45;
  const radius = viewport.height * (.22 + charge * .12);
  ctx.drawImage(halo, cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.globalAlpha = .5 + charge * .4;
  ctx.drawImage(halo, cx - radius * .22, cy - radius * .13, radius * .44, radius * .26);
  // Small orbital streaks collapse onto the bright nucleus at staggered depths.
  ctx.strokeStyle = pressureArt.light;
  for (let orbit = 0; orbit < 7; orbit++) {
    const r = (14 + orbit * 5) * (1.5 - charge * .45);
    ctx.globalAlpha = charge * (.2 + (orbit % 3) * .14);
    ctx.lineWidth = orbit % 2 ? .7 : 1.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.3, r * .34, orbit * .51 + time * .37, orbit, orbit + 2.1);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPressureArmor(ctx, target, scene, color) {
  const charge = Math.min(1, scene.age / scene.warning);
  const fade = Math.min(1, Math.max(0, scene.duration - scene.age) * 6);
  const rx = target.width * (.59 + charge * .025), ry = target.height * .62;
  const time = quietCombatMotion() ? 0 : scene.age;
  ctx.save();
  ctx.translate(target.x, target.y);
  ctx.rotate(Math.sin(time * 1.8) * .025);
  ctx.globalCompositeOperation = "lighter";
  for (let band = 0; band < 7; band++) {
    const angle = band * .93 + time * .22;
    ctx.strokeStyle = band % 2 ? pressureArt.light : color;
    ctx.lineWidth = band % 2 ? 1.2 : 3.4;
    ctx.globalAlpha = (.13 + charge * .16) * fade;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx + band * 1.6, ry + band * 1.2, 0, angle, angle + .46);
    ctx.stroke();
  }
  // Small oriented facets light the near side of a curved shield volume.
  for (let facet = 0; facet < 12; facet++) {
    const angle = facet * 2.39996 + time * .08;
    const x = Math.cos(angle) * rx * .9, y = Math.sin(angle) * ry * .9;
    const size = 4 + facet % 3 * 2;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle);
    ctx.globalAlpha = (.11 + charge * .2) * fade;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(-size, -size * .8); ctx.lineTo(size, -size * .3);
    ctx.lineTo(size * .7, size * .9); ctx.lineTo(-size * .75, size * .45); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawPressureShockfront(ctx, scene, color) {
  const age = pressureArt.burstAge;
  if (age < 0 || age > .7) return;
  if (typeof drawBossUltimateAftershock === "function" && drawBossUltimateAftershock(ctx, scene)) return;
  const quiet = quietCombatMotion();
  const width = viewport.width, height = viewport.height;
  const cx = pressureArt.coreX * width, cy = pressureArt.coreY * height;
  const travel = 1 - Math.exp(-age * 7.8);
  const front = cx - travel * (width * 1.17);
  const fade = (1 - age / .7) ** 1.4;
  ctx.save();
  if (scene && !scene.fullSeal) {
    const top = scene.gapY - scene.gapSize / 2, bottom = scene.gapY + scene.gapSize / 2;
    ctx.beginPath(); ctx.rect(0, 0, width, Math.max(0, top)); ctx.rect(0, bottom, width, height - bottom); ctx.clip();
  }
  ctx.globalCompositeOperation = "lighter";
  const haze = pressureArtGlow(color);
  ctx.globalAlpha = fade * .32;
  ctx.drawImage(haze, front - width * .28, -height * .4, width * .56, height * 1.8);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = fade * .84;
  const frontWidth = height * .36;
  ctx.drawImage(pressureFrontTexture(pressureArt.material), front - frontWidth * .18, 0, frontWidth, height);
  ctx.globalCompositeOperation = "lighter";
  const flare = Math.max(0, 1 - age / .26);
  ctx.globalAlpha = flare * .8;
  const core = pressureArtGlow(color, true);
  const coreSize = height * (.17 + age * .8);
  ctx.drawImage(core, cx - coreSize, cy - coreSize * .6, coreSize * 2, coreSize * 1.2);
  if (visualQuality.id !== "low") {
    const mist = pressureArtMist(color);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = fade * .9;
    for (let fold = 0; fold < 12; fold++) {
      const y = (fold + .3) * height / 12;
      const bend = ((y - cy) / height) ** 2 * width * .13;
      const size = height * (.11 + fold % 3 * .02);
      ctx.drawImage(mist, front + bend - size * .4, y - size, size * 2.5, size * 2);
    }
    ctx.globalCompositeOperation = "lighter";
  }
  const layers = visualQuality.id === "low" ? 4 : 8;
  for (let layer = 0; layer < layers; layer++) {
    const distance = layer * (quiet ? 4 : 11);
    ctx.beginPath();
    for (let point = 0; point <= 36; point++) {
      const y = height * point / 36;
      const bend = ((y - cy) / height) ** 2 * width * .13;
      const turbulence = quiet ? 0 : Math.sin(y * .024 + layer * .87 - age * 14) * (4 + layer * 1.8);
      const x = front + bend + distance + turbulence;
      if (point === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.globalAlpha = fade * (layer === 0 ? .74 : .22 / (1 + layer * .25));
    ctx.strokeStyle = layer === 0 ? pressureArt.light : color;
    ctx.lineWidth = layer === 0 ? 2.6 : 11 + layer * 3;
    ctx.stroke();
  }
  // Refracted ribbons trail the shockfront and preserve large dark spaces.
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.1;
  ctx.globalAlpha = fade * .34;
  for (let ray = 0; ray < 13; ray++) {
    const y = (ray + .5) * height / 13;
    ctx.beginPath(); ctx.moveTo(front + 8, y);
    ctx.bezierCurveTo(front + width * .1, y - 18, cx - 60, cy + (y - cy) * .22, cx, cy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPressureParticles(ctx) {
  const width = viewport.width, height = viewport.height;
  const haze = pressureArtGlow(pressureArt.color);
  ctx.save();
  for (const particle of pressureParticlePool) {
    if (particle.life <= 0) continue;
    const alpha = Math.min(1, particle.life / particle.duration * 1.4);
    const x = particle.x * width, y = particle.y * height;
    if (particle.kind === 2) {
      const radius = (2 - particle.life / particle.duration) * particle.size * 12;
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = alpha * .23;
      ctx.drawImage(haze, x - radius, y - radius, radius * 2, radius * 2);
    } else if (particle.kind === 1) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * .8;
      ctx.strokeStyle = pressureArt.light;
      ctx.lineWidth = Math.max(.6, particle.size * .4);
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x - particle.vx * width * .035, y - particle.vy * height * .035); ctx.stroke();
    } else if (typeof drawUltimateFragment === "function" && drawUltimateFragment(ctx, particle, x, y, alpha, pressureArt.material)) {
      // Material fragments use the same pooled physics and expiry as all other motes.
    } else {
      ctx.save(); ctx.translate(x, y); ctx.rotate(particle.rotation);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = alpha * .85;
      ctx.fillStyle = pressureArt.color;
      const size = particle.size;
      ctx.beginPath(); ctx.moveTo(-size * 1.8, 0); ctx.lineTo(size, -size * .5);
      ctx.lineTo(size * .5, size * .8); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = pressureArt.light; ctx.lineWidth = .6; ctx.stroke(); ctx.restore();
    }
  }
  ctx.restore();
}

function drawBossPressureArt(layer) {
  if (state !== "battle" || !boss || boss.finale || boss.hp <= 0 || evolution.pending) return;
  const scene = boss.pressureState;
  if (!scene && pressureArt.burstAge > 1.3 && pressureArt.releaseAge > .3) return;
  const ctx = context;
  const color = pressureArt.color;
  ctx.save();
  if (layer === "back") {
    if (scene) {
      const strength = scene.stage === "charge" ? Math.min(1, scene.age / scene.warning)
        : scene.ultimateKind ? .72 : Math.max(0, 1 - (scene.age - scene.warning) / .5);
      ctx.fillStyle = "#02040b";
      ctx.globalAlpha = strength * .25;
      ctx.fillRect(0, 0, viewport.width, viewport.height);
      ctx.globalAlpha = 1;
      if (scene.stage === "charge") drawPressureConvergence(ctx, boss, scene, color, quietCombatMotion());
    }
    if (typeof drawBossUltimateArt === "function") drawBossUltimateArt(ctx, boss, scene, "back");
    if (pressureArt.burstAge < .2 && visualQuality.id !== "low" && !quietCombatMotion()) {
      const x = pressureArt.coreX * viewport.width, y = pressureArt.coreY * viewport.height;
      const radius = viewport.height * .36;
      const sample = combatBackdropSample(ctx, x, y, radius, color);
      if (sample) {
        ctx.globalAlpha = (1 - pressureArt.burstAge / .2) * .18;
        ctx.drawImage(sample, x - radius - 8, y - radius, radius * 2 + 16, radius * 2);
        ctx.globalAlpha = 1;
      }
    }
    drawPressureShockfront(ctx, scene, color);
  } else if (layer === "front") {
    if (scene && boss.pressureArmor) drawPressureArmor(ctx, boss, scene, color);
    drawPressureParticles(ctx);
    if (pressureArt.releaseAge < .3) {
      const progress = pressureArt.releaseAge / .3;
      const motion = quietCombatMotion() ? 0 : progress;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = (1 - progress) * (quietCombatMotion() ? .18 : .56);
      ctx.strokeStyle = pressureArt.light;
      ctx.lineWidth = 1.5;
      for (let fragment = 0; fragment < 10; fragment++) {
        const angle = fragment * Math.PI * .2;
        ctx.beginPath();
        ctx.ellipse(boss.x, boss.y, boss.width * (.61 + motion * .12),
          boss.height * (.64 + motion * .12), 0, angle, angle + .28);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    }
    // Only the edge afterglow is layered above actors. Telegraphs are drawn later.
    if (pressureArt.burstAge < .3 && visualQuality.id !== "low") {
      const fade = (1 - pressureArt.burstAge / .3) * .14;
      ctx.globalAlpha = fade;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, viewport.width - 4, viewport.height - 4);
    }
  }
  ctx.restore();
}

function drawPressureSealWarning(ctx, hazard, quiet) {
  const active = hazard.age >= hazard.warning;
  const progress = clamp(hazard.age / Math.max(.01, hazard.warning), 0, 1);
  const width = viewport.width;
  const top = flightBounds.top, bottom = flightBounds.bottom;
  const left = Math.max(6, flightBounds.left - player.width * .25);
  const right = width - 9;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.lineWidth = active ? 2.6 : 1.5;
  ctx.strokeStyle = active ? "#fff4e7" : "#c7b9ad";
  ctx.fillStyle = "#b9927e";
  ctx.globalAlpha = active ? .075 : .035 + progress * .025;
  if (hazard.fullSeal) {
    ctx.fillRect(left, top, right - left, bottom - top);
    ctx.globalAlpha = .8;
    ctx.strokeRect(left, top, right - left, bottom - top);
    // Closing corner brackets make the arena-wide extent readable without text.
    const length = 13 + progress * 24;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(left, top + length); ctx.lineTo(left, top); ctx.lineTo(left + length, top);
    ctx.moveTo(right - length, top); ctx.lineTo(right, top); ctx.lineTo(right, top + length);
    ctx.moveTo(left, bottom - length); ctx.lineTo(left, bottom); ctx.lineTo(left + length, bottom);
    ctx.moveTo(right - length, bottom); ctx.lineTo(right, bottom); ctx.lineTo(right, bottom - length);
    ctx.stroke();
  } else {
    const gapTop = hazard.gapY - hazard.gapSize / 2;
    const gapBottom = hazard.gapY + hazard.gapSize / 2;
    ctx.fillRect(left, top, right - left, Math.max(0, gapTop - top));
    ctx.fillRect(left, gapBottom, right - left, Math.max(0, bottom - gapBottom));
    signatureGuide(ctx, hazard.gapY, hazard.gapSize, active, -1, right);
  }
  const key = typeof controlBindingLabel === "function" ? controlBindingLabel("shield") : "V";
  const seconds = Math.max(0, hazard.warning - hazard.age).toFixed(1);
  const title = hazard.fullSeal
    ? active ? tr("冲击 · 护盾抵挡", "IMPACT · SHIELD") : tr("全域冲击 " + seconds + "s · " + key + " 开盾", "ARENA SEAL " + seconds + "s · " + key + " SHIELD")
    : active ? tr("保持在缺口内", "HOLD THE GAP") : tr("冲击 " + seconds + "s · 进入缺口", "IMPACT " + seconds + "s · ENTER GAP");
  const fontSize = width < 600 ? 11 : 14;
  ctx.font = "700 " + fontSize + "px system-ui";
  const labelWidth = Math.min(width - 24, ctx.measureText(title).width + 32);
  const labelX = (width - labelWidth) * .5;
  const labelY = Math.max(top + 16, viewport.height * .31);
  ctx.globalAlpha = .94;
  ctx.fillStyle = "#0b1019";
  ctx.fillRect(labelX, labelY - 16, labelWidth, 34);
  ctx.strokeStyle = "#b8b0a9";
  ctx.lineWidth = 1;
  ctx.strokeRect(labelX, labelY - 16, labelWidth, 34);
  ctx.fillStyle = active ? "#fff5dc" : "#ece8e3";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, width * .5, labelY, labelWidth - 14);
  ctx.fillStyle = "#d8c1a1";
  ctx.fillRect(labelX, labelY + 16, labelWidth * progress, 2);
  ctx.restore();
}
