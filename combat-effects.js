"use strict";

// 视觉效果有独立容量和时钟，不参与命中、伤害或敌人刷新。
const combatEffects = { clock: 0, particles: [], impacts: [], wrecks: [], shockwaves: [],
  detonations: [], contacts: [], shake: 0, shakeTime: 0, light: null,
  directionalHit: null, hitPause: 0, nextHeavyPause: 0, nextContact: 0 };
const spareDetonations = Array.from({ length: 8 }, () => ({}));
const spareCombatParticles = Array.from({ length: 180 }, () => ({}));
const detonationVolumes = new Map();
const detonationStrands = Array.from({ length: 72 }, (_, i) => ({
  angle: i * 2.39996322973,
  depth: ((i + .5) * .75487766625) % 1,
  onset: ((i + .5) * .61803398875) % 1,
}));
const detonationMaterials = {
  metal: { core: "#fff0c4", glow: "#ff9e62", haze: "#643933", axis: 1, life: .54 },
  water: { core: "#e0ffff", glow: "#73cff9", haze: "#236e96", axis: .67, life: 1.02 },
  bone: { core: "#fff9dd", glow: "#c5a67b", haze: "#594657", axis: 1.1, life: .94 },
  thermal: { core: "#fff3b8", glow: "#ff7b45", haze: "#63322a", axis: .77, life: 1.12 },
  silk: { core: "#faeeff", glow: "#c39bff", haze: "#514778", axis: .79, life: .91 },
  keratin: { core: "#fff5cd", glow: "#a6d882", haze: "#4c603a", axis: 1.18, life: .93 },
  glass: { core: "#effbff", glow: "#88dae8", haze: "#3e5683", axis: .87, life: .86 },
  charge: { core: "#e3fcff", glow: "#5d9cff", haze: "#274a7b", axis: .67, life: .87 },
  spores: { core: "#f6ffd7", glow: "#b9ee76", haze: "#4a5630", axis: 1.14, life: 1.04 },
  void: { core: "#392448", glow: "#f395bb", haze: "#211232", axis: .70, life: 1.21 },
  neural: { core: "#fff2f7", glow: "#ff83ce", haze: "#693450", axis: .87, life: .94 },
  fusion: { core: "#fff3fc", glow: "#ba9efd", haze: "#342659", axis: .93, life: 1.20 },
};
const bossDetonationMaterials = ["water", "bone", "thermal", "silk", "keratin", "glass", "charge", "spores", "void", "neural", "fusion"];
const ultimateDetonationMaterials = { red: "thermal", blue: "charge", yellow: "keratin" };
const combatLightProfiles = {
  hit: { life: .24, strength: .31, rank: 1 },
  impact: { life: .29, strength: .48, rank: 2 },
  ultimate: { life: .42, strength: .69, rank: 3 },
  collapse: { life: .46, strength: .85, rank: 4 },
};
const impactProfiles = {
  hit: { color: "#ffddb0", size: 8, duration: .13, sparks: 3 },
  critical: { color: "#ffbb73", size: 15, duration: .22, sparks: 5, hold: .034, cue: "impact-critical" },
  weak: { color: "#a1f2ff", size: 17, duration: .23, sparks: 4, hold: .038, cue: "impact-weak" },
  ultimate: { color: "#ff9c89", size: 24, duration: .3, sparks: 7, hold: .04 },
  shell: { color: "#ffe4b6", size: 42, duration: .45, sparks: 7, hold: .045, shake: 3.4 },
  guard: { color: "#b9fff4", size: 39, duration: .36, sparks: 5, hold: .034, shake: 2.5 },
  finale: { color: "#f2ccff", size: 48, duration: .53, sparks: 6, hold: .044, shake: 3.8, cue: "impact-finale" },
};
let reduceCombatMotion = false;
try { reduceCombatMotion = window.localStorage.getItem("star-breaker-reduce-combat-motion") === "true"; }
catch { /* 仅应用系统设置。 */ }
const combatMotionRoot = typeof document !== "undefined" ? document.getElementById?.("game-app") : null;
combatMotionRoot?.toggleAttribute?.("data-reduce-motion", reduceCombatMotion);

function quietCombatMotion() { return reduceCombatMotion || reducedMotion.matches; }
function toggleCombatMotion() {
  reduceCombatMotion = !reduceCombatMotion;
  combatMotionRoot?.toggleAttribute?.("data-reduce-motion", reduceCombatMotion);
  try { window.localStorage.setItem("star-breaker-reduce-combat-motion", String(reduceCombatMotion)); }
  catch { /* 当前会话仍有效。 */ }
  if (typeof syncSortieEligibility === "function") syncSortieEligibility();
}

function pulseCombatLight(x, y, radius, color, kind) {
  if (!Number.isFinite(x + y + radius) || !(radius > 0)) return;
  const profile = combatLightProfiles[kind];
  const old = combatEffects.light;
  if (old && combatLightProfiles[old.kind].rank > profile.rank && old.age < .09) return;
  combatEffects.light = { x, y, radius, color, kind, age: 0 };
}
function activeCombatLight() {
  const light = combatEffects.light;
  if (!light || state !== "battle" || evolution.pending) return null;
  const profile = combatLightProfiles[light.kind];
  if (light.age >= profile.life) return null;
  const fade = (1 - light.age / profile.life) ** 2;
  return { ...light, strength: fade * profile.strength * (quietCombatMotion() ? .33 : 1) };
}

// A small reused image of the scenery is enough for soft radial streaks.
// This pass runs behind projectile shapes and never samples the HUD or warnings.
let combatBlurSurface;
function combatBackdropSample(ctx, x, y, radius, tint) {
  const transform = ctx.getTransform?.();
  if (!transform || !(transform.a > 0 && transform.d > 0)) return null;
  combatBlurSurface ??= shipRenderCanvas(176, 176);
  const pass = combatBlurSurface?.getContext("2d");
  if (!pass) return null;
  const sx = Math.floor((x - radius) * transform.a + transform.e);
  const sy = Math.floor((y - radius) * transform.d + transform.f);
  const sw = Math.max(1, Math.ceil(radius * 2 * transform.a));
  const sh = Math.max(1, Math.ceil(radius * 2 * transform.d));
  pass.clearRect(0, 0, 176, 176);
  pass.drawImage(canvas, sx, sy, sw, sh, 0, 0, 176, 176);
  if (tint) {
    pass.globalCompositeOperation = "multiply";
    pass.fillStyle = tint; pass.fillRect(0, 0, 176, 176);
  }
  pass.globalCompositeOperation = "destination-in";
  const fade = pass.createRadialGradient(88, 88, 11, 88, 88, 88);
  fade.addColorStop(0, "#000000"); fade.addColorStop(.68, "#000000a0"); fade.addColorStop(1, "#00000000");
  pass.fillStyle = fade; pass.fillRect(0, 0, 176, 176);
  pass.globalCompositeOperation = "source-over";
  return combatBlurSurface;
}
function drawCombatPostProcessing(ctx) {
  drawCombatDetonations(ctx);
  const light = activeCombatLight();
  if (!light || light.strength < .017) return;
  const { x, y, color, strength, kind } = light;
  const radius = Math.min(light.radius, Math.min(viewport.width, viewport.height) * .51);
  const quiet = quietCombatMotion();
  const detail = visualQuality.id;
  ctx.save();
  if (!quiet && detail === "high" && (kind === "ultimate" || kind === "collapse")) {
    const sample = combatBackdropSample(ctx, x, y, radius);
    if (sample) {
      const material = combatEffects.detonations.find(effect => effect.rank > 1)?.material;
      ctx.globalAlpha = strength * .17;
      for (let i = 1; i <= 3; i++) {
        const warm = material === "thermal";
        const span = radius * (1 + i * (material === "void" ? -.043 : .035));
        const lift = warm ? Math.sin(light.age * 28 + i * 1.4) * i * 2 : 0;
        ctx.drawImage(sample, x - span + lift, y - span - (warm ? i * 2 : 0), span * 2, span * 2);
      }
    }
  }
  if (!quiet && detail === "high" && kind === "hit") {
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = strength * .46;
    for (const [shift, tint] of [[-2, "#ff1212"], [2, "#12d3ff"]]) {
      const sample = combatBackdropSample(ctx, x, y, radius, tint);
      if (sample) ctx.drawImage(sample, x - radius + shift, y - radius, radius * 2, radius * 2);
    }
  }
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = strength * (detail === "low" ? .30 : .62);
  const bloom = ctx.createRadialGradient(x, y, 0, x, y, radius);
  bloom.addColorStop(0, color + "c0"); bloom.addColorStop(.24, color + "7a");
  bloom.addColorStop(.62, color + "2e"); bloom.addColorStop(1, color + "00");
  ctx.fillStyle = bloom;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

  if (!quiet && detail !== "low" && (kind === "hit" || kind === "collapse")) {
    ctx.globalAlpha = strength * .42;
    ctx.globalCompositeOperation = "source-over";
    const edge = ctx.createRadialGradient(viewport.width * .5, viewport.height * .5,
      Math.min(viewport.width, viewport.height) * .22, viewport.width * .5, viewport.height * .5,
      Math.hypot(viewport.width, viewport.height) * .53);
    edge.addColorStop(0, "#11081700"); edge.addColorStop(.67, "#17081939");
    edge.addColorStop(1, kind === "hit" ? "#73203a9c" : "#0b0819ce");
    ctx.fillStyle = edge; ctx.fillRect(0, 0, viewport.width, viewport.height);
  }
  ctx.restore();
}

function releaseCombatDetonation(index) {
  const list = combatEffects.detonations;
  spareDetonations.push(list[index]);
  list.splice(index, 1);
}

function recordCombatDetonation(target, { kind = "ordinary", type, size } = {}) {
  if (!target || !Number.isFinite(target.x + target.y)) return;
  const list = combatEffects.detonations;
  const rank = kind === "boss" ? 3 : kind === "ultimate" ? 2 : 1;
  if (!spareDetonations.length) {
    let weakest = 0;
    for (let i = 1; i < list.length; i++) if (list[i].rank < list[weakest].rank) weakest = i;
    if (list[weakest].rank > rank) return;
    releaseCombatDetonation(weakest);
  }
  const material = kind === "boss" ? bossDetonationMaterials[type] : kind === "ultimate" ? ultimateDetonationMaterials[type] : "metal";
  const profile = detonationMaterials[material] ?? detonationMaterials.metal;
  const radius = Math.min(Math.min(viewport.width, viewport.height) * .31, Math.max(24, size ?? (target.width || 64) * .49));
  const effect = spareDetonations.pop();
  Object.assign(effect, { x: target.x, y: target.y, radius, age: 0, life: profile.life, rank, profile,
    material: material || "metal", seed: (target.x * .069 + target.y * .137) % Math.PI });
  list.push(effect);
}

function detonationGlow(ctx, x, y, radius, core, rim, alpha) {
  if (radius <= 1 || alpha <= .006) return;
  const fog = ctx.createRadialGradient(x - radius * .15, y - radius * .20, radius * .025, x, y, radius);
  fog.addColorStop(0, core); fog.addColorStop(.42, rim); fog.addColorStop(1, rim.slice(0, 7) + "00");
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fog;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
}

function detonationVolumeSprite(profile) {
  if (detonationVolumes.has(profile)) return detonationVolumes.get(profile);
  if (typeof shipRenderCanvas !== "function") return null;
  const surface = shipRenderCanvas(144, 144);
  const ctx = surface?.getContext?.("2d");
  if (!ctx) return null;
  // The left face is lit from the blast; the right face carries the smoke's
  // density. Bake both faces once, then turn each cloud toward the source.
  for (let i = 0; i < 21; i++) {
    const grain = detonationStrands[i];
    const spread = 10 + 34 * grain.depth;
    const x = 72 + Math.cos(grain.angle) * spread, y = 72 + Math.sin(grain.angle) * spread * .8;
    const radius = 12 + grain.onset * 21;
    const cell = ctx.createRadialGradient(x + radius * .24, y + radius * .08, 0, x, y, radius);
    cell.addColorStop(0, "#070910d8");
    cell.addColorStop(.46, profile.haze + "ba");
    cell.addColorStop(.73, profile.haze + "4d");
    cell.addColorStop(1, profile.haze + "00");
    ctx.fillStyle = cell;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    const scatter = ctx.createRadialGradient(x - radius * .54, y - radius * .15, 0,
      x - radius * .14, y, radius * .75);
    scatter.addColorStop(0, profile.glow + "7a");
    scatter.addColorStop(.41, profile.haze + "69");
    scatter.addColorStop(1, profile.haze + "00");
    ctx.fillStyle = scatter;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  detonationVolumes.set(profile, surface);
  return surface;
}

function drawDetonationVolume(ctx, effect, p, volume, quality) {
  const { profile, radius, rank, seed, material } = effect;
  const sprite = detonationVolumeSprite(profile);
  if (!sprite) return;
  const retreat = material === "void";
  const lobes = quality === "high" ? (rank > 1 ? 6 : 3) : (rank > 1 ? 3 : 2);
  const spread = radius * (retreat ? 1 - p * .6 : .25 + .9 * p);
  const drift = retreat ? -1 : 1;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < lobes; i++) {
    const seedPoint = detonationStrands[i + 11];
    const phase = seed + seedPoint.angle + p * drift * .92;
    const x = Math.cos(phase) * spread * (.12 + seedPoint.depth * .55);
    const y = Math.sin(phase) * spread * profile.axis * .65 + p * p * radius * (material === "spores" ? -.34 : .17);
    const span = radius * (.14 + seedPoint.onset * .22 + .50 * p);
    ctx.globalAlpha = volume * (.49 + seedPoint.depth * .37);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(y, x));
    ctx.drawImage(sprite, -span, -span, span * 2, span * 2);
    ctx.restore();
  }
  ctx.restore();
}

function drawDetonationSparks(ctx, effect, p, quality) {
  const { rank, radius, profile, material, seed } = effect;
  const count = quality === "high" ? (rank > 1 ? 64 : 23) : (rank > 1 ? 32 : 13);
  const inward = material === "void";
  const ease = 1 - (1 - p) ** 2.75;
  const momentum = inward ? 1 - ease * .82 : .10 + ease;
  const fall = material === "spores" ? -.43 : material === "water" ? .29 : .13;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let layer = 0; layer < 3; layer++) {
    ctx.beginPath();
    for (let i = layer; i < count; i += 3) {
      const strand = detonationStrands[i];
      if (p < strand.onset * .15) continue;
      const angle = strand.angle + seed + (layer - 1) * p * (inward ? -1.8 : .60);
      const distance = radius * momentum * (.36 + strand.depth * (rank > 1 ? 1.1 : .94));
      const dx = Math.cos(angle), dy = Math.sin(angle);
      const x = dx * distance, y = dy * distance * profile.axis + p * p * radius * fall;
      const length = radius * (.018 + strand.depth * (layer === 0 ? .16 : .07)) * (.42 + (1 - p) * .58);
      const turn = length * (inward ? -.54 : .25) * Math.sin(strand.angle + p * 4);
      const heading = inward ? -1 : 1;
      ctx.moveTo(x - dx * length * heading, y - dy * length * heading);
      ctx.quadraticCurveTo(x - dx * length * heading * .45 - dy * turn, y - dy * length * heading * .45 + dx * turn, x, y);
    }
    ctx.strokeStyle = layer === 0 ? profile.glow : layer === 1 ? profile.core : profile.glow;
    ctx.lineWidth = layer === 0 ? 1.7 : layer === 1 ? .95 : .55;
    ctx.globalAlpha = (1 - p) ** (layer === 2 ? 1.1 : 1.76) * (layer === 0 ? .72 : .91);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDetonationMaterial(ctx, effect, p, quiet, quality) {
  const { material, profile, rank, radius, seed } = effect;
  const ionized = material === "charge" || material === "neural";
  const inward = material === "void";
  const opacity = (1 - p) ** (material === "spores" ? 1.22 : 1.65);
  const travel = quiet ? .48 : 1 - (1 - p) ** 2;
  const span = radius * (inward ? 1 - travel * .82 : .13 + travel);
  ctx.strokeStyle = profile.glow;
  ctx.lineWidth = rank === 3 ? 2.3 : 1.6;
  ctx.globalAlpha = opacity * .65;
  ctx.beginPath();
  if (material === "water") {
    // A pressure sheet has a foamed leading lip and a shaded trailing body, with no flame silhouette.
    for (let i = 0; i < 2; i++) {
      const w = span * (1 - i * .25), h = w * (.47 - i * .08), shift = i * -span * .30;
      const veil = ctx.createLinearGradient(-w, -h, w * .58, h * .8);
      veil.addColorStop(0, "#e5ffff90"); veil.addColorStop(.31, "#71d3f580"); veil.addColorStop(1, "#17508a00");
      ctx.fillStyle = veil;
      ctx.beginPath(); ctx.moveTo(-w + shift, -h * .42);
      ctx.bezierCurveTo(-w * .52 + shift, -h * 1.31, w * .42 + shift, -h * 1.20, w + shift, -h * .10);
      ctx.bezierCurveTo(w * .42 + shift, -h * .64, -w * .36 + shift, -h * .72, -w * .78 + shift, h * .47);
      ctx.bezierCurveTo(-w * .94 + shift, h * .14, -w + shift, -h * .06, -w + shift, -h * .42);
      ctx.fill(); ctx.stroke();
    }
  } else if (inward) {
    const edge = span * .66;
    detonationGlow(ctx, 0, 0, edge, "#03040d", "#1a092eae", opacity * .78);
    ctx.globalAlpha = opacity * .71;
    for (let i = 0; i < 2; i++) {
      const scale = 1 - i * .29;
      ctx.beginPath(); ctx.ellipse(span * i * .16, span * i * .12, span * scale, span * profile.axis * scale,
        seed + p * 2.4 + i * Math.PI, i * 2.5, 4.4 + i * 2.5);
      ctx.stroke();
    }
  } else if (ionized) {
    // Uneven branch lengths and alternating angles read as an electrical release.
    for (let i = 0; i < 5; i++) {
      const angle = seed + i * 1.26;
      const x = Math.cos(angle) * span * (i % 2 ? .69 : 1), y = Math.sin(angle) * span * .68;
      ctx.moveTo(x * .2, y * .2); ctx.lineTo(x * .46 - y * .12, y * .46 + x * .09);
      ctx.lineTo(x * .62 + y * .15, y * .59 - x * .09); ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else if (material === "thermal") {
    const edge = span * .87;
    ctx.save();
    ctx.rotate(seed * .19 - .36);
    ctx.scale(1, .74);
    detonationGlow(ctx, -edge * .11, edge * .14, edge, "#ffd192", "#ed5a368a", opacity * .72);
    if (!quiet && quality !== "low") {
      // Unclosed, tapering seams trace the rolling front. Overlapping gas
      // hides the rear surface and leaves only a few hot folds exposed.
      const seam = ctx.createLinearGradient(-edge, -edge * .45, edge, edge * .37);
      seam.addColorStop(0, "#ff4d3100");
      seam.addColorStop(.32, "#ff7a4595");
      seam.addColorStop(.48, "#ffdd91df");
      seam.addColorStop(.65, "#fd753e83");
      seam.addColorStop(1, "#7c293900");
      ctx.strokeStyle = seam;
      ctx.globalCompositeOperation = "screen";
      ctx.lineCap = "round";
      ctx.lineWidth = 2;
      ctx.globalAlpha = opacity * (1 - p * .65);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = seed + i * 1.62 + p * .9;
        const side = i % 2 ? 1 : -1, r = edge * (.49 + i * .14);
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        ctx.moveTo(x * .34 - y * .26 * side, y * .34 + x * .26 * side);
        ctx.bezierCurveTo(x * .92 - y * .54 * side, y * .92 + x * .54 * side,
          x * 1.17 - y * .29 * side, y * 1.17 + x * .29 * side, x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  } else if (material === "metal") {
    ctx.ellipse(0, 0, span, span * profile.axis, -.14, 0, Math.PI * 2); ctx.stroke();
  }

  // Embers carry momentum after the core and volume have dimmed. The material sets drag, fall and silhouettes.
  const ash = Math.max(0, (p - .16) / .84);
  if (ash <= 0 || quiet || quality === "low") return;
  const count = rank === 1 ? 3 : quality === "high" ? 8 : 5;
  ctx.globalAlpha = Math.sin(Math.PI * ash) * (rank === 1 ? .49 : .76);
  ctx.fillStyle = profile.core;
  const hard = material === "bone" || material === "glass" || material === "keratin";
  for (let i = 0; i < count; i++) {
    const angle = seed + i * 2.39996, speed = .44 + (i % 5) * .137;
    const out = span * speed * (1 + ash * .43);
    const x = Math.cos(angle) * out;
    const fall = material === "water" ? .34 : material === "bone" ? .52 : material === "spores" ? -.35 : .17;
    const y = Math.sin(angle) * out * profile.axis + radius * ash * ash * fall;
    const grain = Math.max(1.4, (1 - ash * .74) * (hard ? 5 : 3));
    ctx.beginPath();
    if (inward) {
      ctx.moveTo(x + grain * Math.cos(angle) * 4, y + grain * Math.sin(angle) * 4);
      ctx.lineTo(x, y); ctx.stroke(); continue;
    } else if (hard) {
      ctx.moveTo(x - grain, y + grain * .56); ctx.lineTo(x + grain, y); ctx.lineTo(x + grain * .40, y - grain); ctx.closePath();
    } else if (material === "silk") {
      ctx.moveTo(x, y); ctx.quadraticCurveTo(x - grain * 4, y + grain * 3, x - grain * 7, y + grain);
      ctx.stroke(); continue;
    } else ctx.ellipse(x, y, grain * (material === "water" ? 1.62 : 1), grain, angle, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCombatDetonations(ctx) {
  const quiet = quietCombatMotion(), quality = visualQuality.id;
  for (const effect of combatEffects.detonations) {
    const { x, y, radius, age, life, profile, rank } = effect;
    const p = age / life;
    ctx.save();
    ctx.translate(x, y);
    // A short core flash, a slower expanding volume, then fading directional debris.
    const flash = Math.max(0, 1 - age / (rank > 1 ? .14 : .085));
    const volume = Math.min(1, p * 6) * (1 - p) ** 2.45;
    const cloud = radius * (.21 + p * .83);
    detonationGlow(ctx, 0, 0, cloud, profile.glow, profile.haze + "8a", volume * (quiet ? .19 : rank > 1 ? .58 : .37));
    if (!quiet && quality !== "low") drawDetonationVolume(ctx, effect, p, volume, quality);
    detonationGlow(ctx, 0, 0, radius * .46, profile.glow, profile.glow + "65", flash * (quiet ? .17 : .51));
    detonationGlow(ctx, 0, 0, radius * .16, profile.core, profile.glow + "ad", flash * (quiet ? .19 : .78));
    drawDetonationMaterial(ctx, effect, p, quiet, quality);
    if (!quiet && quality !== "low") drawDetonationSparks(ctx, effect, p, quality);
    ctx.restore();
  }
}
let shakePreference = "low";
const shakeButton = document.querySelector("#shake-button");
try {
  const saved = window.localStorage.getItem("star-breaker-shake");
  if (["off", "low", "full"].includes(saved)) shakePreference = saved;
} catch { /* 本地文件禁用存储时仍可切换。 */ }
function updateShakeButton() {
  if (!shakeButton) return;
  const name = { off: tr("关", "Off"), low: tr("轻", "Low"), full: tr("强", "High") }[shakePreference];
  shakeButton.textContent = tr("震动：" + name, "Shake: " + name);
  shakeButton.setAttribute("aria-label", tr("画面震动：" + name + "，点击切换", "Screen shake: " + name + ". Click to change."));
  shakeButton.title = tr("切换画面震动：关闭 / 轻微 / 较强；系统减少动态效果时始终关闭",
    "Cycle screen shake through Off, Low, and High. Reduced motion always disables shake.");
}
function cycleShakePreference() {
  const choices = ["off", "low", "full"];
  shakePreference = choices[(choices.indexOf(shakePreference) + 1) % choices.length];
  try { window.localStorage.setItem("star-breaker-shake", shakePreference); } catch { /* 不影响本次选择。 */ }
  updateShakeButton();
  if (typeof syncSortieEligibility === "function") syncSortieEligibility();
}
if (shakeButton) shakeButton.addEventListener("click", () => {
  cycleShakePreference();
  if (state === "battle" && !pauseView && !evolution.pending) canvas.focus({ preventScroll: true });
});
updateShakeButton();
function canAnimateCombatEffects() {
  return battleHasFocus();
}
function resetCombatEffects() {
  for (const particle of combatEffects.particles) spareCombatParticles.push(particle);
  for (const name of ["particles", "impacts", "wrecks", "shockwaves", "contacts"]) combatEffects[name].length = 0;
  while (combatEffects.detonations.length) releaseCombatDetonation(combatEffects.detonations.length - 1);
  combatEffects.clock = 0; combatEffects.shake = 0; combatEffects.shakeTime = 0; combatEffects.light = null;
  combatEffects.directionalHit = null; combatEffects.hitPause = 0;
  combatEffects.nextHeavyPause = 0; combatEffects.nextContact = 0;
  resetBossPresentation();
}
function resizeCombatEffects(oldWidth, oldHeight) {
  for (const particle of combatEffects.particles) spareCombatParticles.push(particle);
  for (const name of ["particles", "impacts", "shockwaves", "contacts"]) combatEffects[name].length = 0;
  while (combatEffects.detonations.length) releaseCombatDetonation(combatEffects.detonations.length - 1);
  combatEffects.shake = 0; combatEffects.shakeTime = 0;
  combatEffects.directionalHit = null; combatEffects.hitPause = 0;
  combatEffects.light = null;
  if (!isBossDeathPlaying()) { combatEffects.wrecks.length = 0; return; }
  const finale = bossPresentation.target;
  if (finale?.finale) {
    const scale = Math.min(viewport.width / oldWidth, viewport.height / oldHeight);
    finale.width *= scale;
    finale.height *= scale;
    finale.x = clamp(finale.x / oldWidth * viewport.width, finale.width * .5, viewport.width - finale.width * .5);
    finale.y = clamp(finale.y / oldHeight * viewport.height, finale.height * .5, viewport.height - finale.height * .5);
  }
  for (const wreck of combatEffects.wrecks) {
    wreck.x = clamp(wreck.x / oldWidth * viewport.width, wreck.width * 0.5, viewport.width - wreck.width * 0.5);
    wreck.y = clamp(wreck.y / oldHeight * viewport.height, wreck.height * 0.5, viewport.height - wreck.height * 0.5);
  }
}
function pushCombatEffect(list, item, limit) {
  if (list.length >= limit) list.shift();
  list.push(item);
}
function spawnCombatParticle(x, y, angle, speed, duration, size, spin, color, armor, smoke) {
  const particles = combatEffects.particles;
  const particle = spareCombatParticles.pop() ?? particles.shift();
  particle.x = x; particle.y = y;
  particle.vx = Math.cos(angle) * speed; particle.vy = Math.sin(angle) * speed;
  particle.age = 0; particle.duration = duration; particle.size = size;
  particle.angle = angle; particle.spin = spin; particle.color = color;
  particle.armor = armor; particle.smoke = smoke;
  particles.push(particle);
}
function addCombatShake(strength) {
  if (quietCombatMotion() || shakePreference === "off") return;
  combatEffects.shake = Math.max(combatEffects.shake, strength);
  combatEffects.shakeTime = 0.23;
}
function combatShakeOffset() {
  if (quietCombatMotion() || shakePreference === "off") return { x: 0, y: 0 };
  const maximum = shakePreference === "full" ? 6 : 2.5;
  const strength = Math.min(maximum,
    combatEffects.shake * (shakePreference === "full" ? 1 : 0.42)) * combatEffects.shakeTime / 0.23;
  const hit = combatEffects.directionalHit;
  const kick = hit ? Math.cos(hit.age * 48) * Math.exp(-hit.age * 22)
    * hit.strength * (shakePreference === "full" ? 1 : .42) : 0;
  return { x: clamp(Math.sin(combatEffects.clock * 109) * strength + (hit?.x ?? 0) * kick, -maximum, maximum),
    y: clamp(Math.cos(combatEffects.clock * 83) * strength * .7 + (hit?.y ?? 0) * kick, -maximum, maximum) };
}

// Called once per simulation step, before advancing the shared combat clock.
// The whole simulation waits together, so projectiles cannot cross an unmoving
// player. A single cannon can hold at most 24 ms in any 600 ms combat window.
function combatImpactFrameSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  if (quietCombatMotion() || !canAnimateCombatEffects() || isBossPresentationPlaying()) {
    combatEffects.hitPause = 0;
    return seconds;
  }
  const held = Math.min(seconds, combatEffects.hitPause);
  combatEffects.hitPause = Math.max(0, combatEffects.hitPause - held);
  return seconds - held;
}

function recordSurfaceContact(target, bullet, bossHit, heavy) {
  if (!heavy && combatEffects.clock < combatEffects.nextContact) return;
  combatEffects.nextContact = combatEffects.clock + .035;
  const w = target.width || 80, h = target.height || 60;
  const angle = Number.isFinite(bullet.vx) && Number.isFinite(bullet.vy)
    ? Math.atan2(bullet.vy, bullet.vx) : Number.isFinite(bullet.angle) ? bullet.angle : 0;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const x = target.x - Math.sign(dx || 1) * w * .31;
  const y = Number.isFinite(bullet.y) ? clamp(bullet.y, target.y - h * .34, target.y + h * .34) : target.y;
  const material = bossHit ? bossDetonationMaterials[target.type] : "metal";
  const palette = detonationMaterials[material] ?? detonationMaterials.metal;
  const quiet = quietCombatMotion();
  pushCombatEffect(combatEffects.contacts, { x, y, angle, age: 0, duration: heavy ? .29 : .16,
    radius: Math.min(h * .32, heavy ? 44 : bossHit ? 18 : 13), heavy,
    color: palette.glow, core: palette.core }, 20);
  if (heavy && !quiet) {
    combatEffects.directionalHit = { x: dx, y: dy, strength: bossHit ? 3.4 : 1.8, age: 0 };
    if (combatEffects.clock >= combatEffects.nextHeavyPause) {
      combatEffects.hitPause = bossHit ? .024 : .014;
      combatEffects.nextHeavyPause = combatEffects.clock + .6;
    }
  }
}

function drawSurfaceContacts() {
  const quiet = quietCombatMotion();
  const detail = typeof visualQuality === "undefined" ? "low" : visualQuality.id;
  for (const hit of combatEffects.contacts) {
    const p = Math.min(1, hit.age / hit.duration), fade = (1 - p) ** 2;
    const radius = hit.radius * (quiet ? .65 : .45 + p * 1.2);
    context.save();
    context.translate(hit.x, hit.y); context.rotate(hit.angle);
    context.globalAlpha = fade * (quiet ? .38 : .82);
    context.strokeStyle = hit.color; context.lineWidth = hit.heavy ? 2.3 : 1.3;
    // A compressed shell ripple follows the incoming axis instead of a large
    // screen flash. Its centre stays small enough to leave danger tells visible.
    context.beginPath(); context.ellipse(radius * .13, 0, radius * .36, radius, 0, -.92 * Math.PI, .92 * Math.PI);
    context.stroke();
    if (hit.heavy && !quiet) {
      context.globalAlpha = fade * .42;
      context.beginPath(); context.ellipse(radius * .23, 0, radius * .62, radius * 1.32, 0, -.76 * Math.PI, .76 * Math.PI);
      context.stroke();
    }
    const flash = Math.max(0, 1 - hit.age / (hit.heavy ? .068 : .041));
    if (hit.heavy && !quiet && detail !== "low") {
      const spill = hit.radius * .87;
      context.globalCompositeOperation = "screen";
      detonationGlow(context, -spill * .19, 0, spill, hit.color, hit.color + "4d", flash * .52);
      context.globalCompositeOperation = "source-over";
    }
    context.globalAlpha = flash * (quiet ? .30 : .89);
    context.fillStyle = hit.core;
    context.beginPath(); context.ellipse(0, 0, hit.radius * .18, hit.radius * .59, 0, 0, Math.PI * 2);
    context.fill();
    if (!quiet && detail !== "low") {
      // A fast compression crest and several narrow side jets read even in a
      // crowded volley. The finest strands last longer than the contact flash.
      context.globalCompositeOperation = "lighter";
      context.lineCap = "round";
      const count = hit.heavy ? (detail === "high" ? 13 : 8) : 5;
      context.beginPath();
      for (let i = 0; i < count; i++) {
        const strand = detonationStrands[i];
        const sign = i % 2 ? -1 : 1;
        const width = radius * (.30 + strand.depth * .85);
        const side = sign * radius * (.14 + .79 * strand.onset);
        const back = -width * (.45 + p * .64);
        context.moveTo(back, side);
        context.quadraticCurveTo(back + width * .46, side * .77, back + width * .72, side * .21);
      }
      context.strokeStyle = hit.color; context.lineWidth = hit.heavy ? 3.6 : 2.2; context.globalAlpha = fade * .24; context.stroke();
      context.strokeStyle = hit.core; context.lineWidth = hit.heavy ? 1.15 : .74; context.globalAlpha = fade * .82; context.stroke();
    }
    context.restore();
  }
}
function combatBurst(x, y, size = 1, color = "#ffb569", armor = false) {
  const quiet = quietCombatMotion();
  pushCombatEffect(combatEffects.shockwaves, { x, y, age: 0, duration: quiet ? 0.3 : 0.5,
    radius: 32 * size, color }, 16);
  const count = quiet ? 3 : armor ? 14 : 10;
  for (let i = 0; i < count; i++) {
    const angle = Math.PI * 2 * i / count + Math.random() * 0.28;
    const speed = quiet ? 0 : (55 + Math.random() * 135) * Math.sqrt(size);
    const fragment = armor && i % 3 === 0;
    spawnCombatParticle(x, y, angle, speed, quiet ? .25 : .35 + Math.random() * .48,
      (armor ? 3 : 1.5) + Math.random() * 3, quiet ? 0 : (Math.random() - .5) * 8,
      fragment ? "#77889d" : color, fragment, i % 4 === 0);
  }
}
function recordCombatFeedback(kind, target, bullet = null) {
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return;
  const profile = impactProfiles[kind];
  if (!profile) return;
  const w = target.width || 80, h = target.height || 60;
  const x = bullet ? target.x - w * .31 : target.x;
  const y = Number.isFinite(bullet?.y) ? clamp(bullet.y, target.y - h * .3, target.y + h * .3) : target.y;
  const quiet = quietCombatMotion();
  const hold = quiet ? 0 : profile.hold ?? 0;
  pushCombatEffect(combatEffects.impacts, { x, y, age: 0, duration: profile.duration + hold, hold,
    color: profile.color, size: bullet ? profile.size : Math.min(profile.size, h * .59), kind }, 32);
  if (!quiet) {
    for (let i = 0; i < profile.sparks; i++) {
      const angle = bullet ? Math.PI * (.7 + Math.random() * .6) : i * Math.PI * 2 / profile.sparks + .1;
      const speed = 65 + Math.random() * 150;
      spawnCombatParticle(x, y, angle, speed, .15 + Math.random() * .15, 1.6, 0,
        profile.color, kind === "shell" && i % 2 === 0, false);
    }
  }
  if (profile.cue && !bullet) gameAudio.fieldCue?.(profile.cue, x, y);
  if (profile.shake) addCombatShake(profile.shake);
  if (kind === "shell" || kind === "finale") pulseCombatLight(x, y, Math.max(85, w * .61), profile.color, "impact");
}

function recordCombatImpact(target, bullet, bossHit = false, category) {
  if (!target || !bullet || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return;
  const ultimateHit = bullet.source === "ultimate";
  const heavy = ultimateHit || bullet.source === "crimson-heavy" || bullet.source === "evolution-lance" || bullet.source === "evolution-ember";
  const kind = ultimateHit ? "ultimate" : category ?? (heavy || bullet.critical ? "critical" : "hit");
  const next = kind === "hit" ? "fxNextImpact" : "fxNextSpecialImpact";
  if ((target[next] ?? -1) > combatEffects.clock) return;
  target[next] = combatEffects.clock + (kind === "hit" ? .07 : .19);
  // Damage is already applied when this hook runs. Keep the visual contact on
  // a fatal blow, but leave its sound to the enemy explosion / final collapse.
  // A Boss body reaching zero still has its final form, so it gets a body hit.
  const finalKill = Number.isFinite(target.hp) && target.hp <= 1e-12 && (!bossHit || !!target.finale);
  if (!finalKill) gameAudio.hit?.(bossHit, bullet.source, target.x, target.y);
  recordCombatFeedback(kind, target, bullet);
  recordSurfaceContact(target, bullet, bossHit, heavy);
}

function drawCombatImpact(impact) {
  // Hold only the marker's shape for two to three 60 Hz frames. Collision and input keep updating.
  const progress = Math.max(0, impact.age - impact.hold) / (impact.duration - impact.hold);
  const quiet = quietCombatMotion();
  const size = impact.size * (quiet ? 1 : 1 + progress * .33);
  context.save();
  context.globalAlpha = (1 - progress) * (quiet ? .60 : .86);
  context.fillStyle = context.strokeStyle = impact.color;
  context.translate(impact.x, impact.y);
  context.lineWidth = 2;
  context.beginPath();
  if (impact.kind === "hit" || impact.kind === "critical" || impact.kind === "ultimate") {
    const tall = size * (impact.kind === "critical" ? .83 : .38);
    context.moveTo(-size, 0); context.lineTo(0, -tall); context.lineTo(size * .64, 0);
    context.lineTo(0, tall); context.closePath();
    if (impact.kind === "critical") context.stroke(); else context.fill();
  } else if (impact.kind === "weak") {
    const inner = size * .40;
    for (let i = 0; i < 4; i++) {
      context.moveTo(inner, 0); context.lineTo(size, 0); context.rotate(Math.PI / 2);
    }
    context.stroke();
  } else if (impact.kind === "guard") {
    for (let i = 0; i < 6; i++) {
      const angle = (i + .5) * Math.PI / 3;
      const x = Math.cos(angle) * size, y = Math.sin(angle) * size;
      if (i) context.lineTo(x, y); else context.moveTo(x, y);
    }
    context.closePath(); context.stroke();
  } else {
    const count = impact.kind === "shell" ? 3 : 4;
    for (let i = 0; i < count; i++) {
      if (impact.kind === "shell") {
        context.moveTo(size * .62, -size * .48); context.lineTo(size * .91, -size * .20);
        context.lineTo(size * .82, size * .03); context.lineTo(size, size * .32);
      } else {
        context.moveTo(size * .82, -size * .26); context.lineTo(size, 0); context.lineTo(size * .82, size * .26);
        context.moveTo(size * .66, -size * .15); context.lineTo(size * .77, 0); context.lineTo(size * .66, size * .15);
      }
      context.rotate(Math.PI * 2 / count);
    }
    context.stroke();
  }
  context.restore();
}
function recordCombatDestruction(target, isBoss = false) {
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return;
  recordCombatDetonation(target, isBoss ? { kind: "boss", type: target.type, size: target.width * .75 } : undefined);
  if (isBoss || target.kind === "armored") {
    pushCombatEffect(combatEffects.wrecks, { ...target, hp: 0, hitFlash: 0, disabled: true,
      age: 0, stage: 0, duration: isBoss ? 1.25 : 0.65, isBoss }, 12);
  } else combatBurst(target.x, target.y, 1, target.kind === "gunner" ? "#d6a6ff" : "#ffb569");
  if (isBoss) addCombatShake(4);
  if (isBoss || target.kind === "armored") {
    pulseCombatLight(target.x, target.y, Math.max(80, target.width * (isBoss ? 1.7 : 1.1)), "#ffaf79", "impact");
  }
}
function startBossDeathPresentation(target, reward, motion) {
  if (state !== "battle" || isBossDeathPlaying()) return;
  playDeath(target, reward, motion);
  movementHint.hidden = true;
  statusMessage.textContent = target.alienFinal
    ? tr("群渊合生体正在瓦解。", "The Abyssal Confluence is collapsing.")
    : tr(target.name + "正在解体，随后选择战机进化。", target.name + " is breaking apart. Choose an evolution next.");
  updatePauseHint();
}
function updateCombatEffects(seconds) {
  if (!canAnimateCombatEffects() || !Number.isFinite(seconds) || seconds <= 0) return;
  const cinematic = isBossDeathPlaying();
  combatEffects.clock += seconds;
  if (combatEffects.directionalHit) {
    combatEffects.directionalHit.age += seconds;
    if (combatEffects.directionalHit.age >= .19) combatEffects.directionalHit = null;
  }
  if (combatEffects.light) {
    combatEffects.light.age += seconds;
    if (combatEffects.light.age >= combatLightProfiles[combatEffects.light.kind].life) combatEffects.light = null;
  }
  combatEffects.shakeTime = Math.max(0, combatEffects.shakeTime - seconds);
  if (!combatEffects.shakeTime) combatEffects.shake = 0;
  for (let i = combatEffects.detonations.length - 1; i >= 0; i--) {
    const detonation = combatEffects.detonations[i];
    detonation.age += seconds;
    if (detonation.age >= detonation.life) releaseCombatDetonation(i);
  }
  const calm = quietCombatMotion();
  const particleDrag = Math.exp(-seconds * 2.9);
  for (const name of ["particles", "impacts", "shockwaves", "contacts"]) {
    const list = combatEffects[name];
    for (let i = list.length - 1; i >= 0; i--) {
      const effect = list[i]; effect.age += seconds;
      if (name === "particles" && !calm) {
        effect.x += effect.vx * seconds;
        effect.y += effect.vy * seconds;
        effect.vx *= particleDrag;
        effect.vy = effect.vy * particleDrag + seconds * (effect.smoke ? -27 : effect.armor ? 72 : 17);
      }
      if (effect.age >= effect.duration) {
        if (name === "particles") spareCombatParticles.push(effect);
        list.splice(i, 1);
      }
    }
  }
  for (let i = combatEffects.wrecks.length - 1; i >= 0; i--) {
    const wreck = combatEffects.wrecks[i]; wreck.age += seconds;
    const sequence = wreck.isBoss ? [0.08, 0.25, 0.46, 0.7] : [0.13, 0.28];
    while (wreck.stage < sequence.length && wreck.age >= sequence[wreck.stage]) {
      const final = wreck.stage === sequence.length - 1;
      const offset = final ? 0 : (wreck.stage % 2 ? 1 : -1);
      const x = wreck.x + offset * wreck.width * 0.22, y = wreck.y + offset * wreck.height * 0.23;
      combatBurst(x, y, final ? (wreck.isBoss ? 2.4 : 1.4) : 0.65, "#ffb56a", final);
      if (wreck.isBoss && !reducedMotion.matches) gameAudio.explode(final, x, y);
      if (final && wreck.isBoss) addCombatShake(6);
      wreck.stage++;
    }
    if (wreck.age >= wreck.duration) combatEffects.wrecks.splice(i, 1);
  }
  if (cinematic) {
    for (let i = explosions.length - 1; i >= 0; i--) {
      explosions[i].age += seconds;
      if (explosions[i].age >= explosions[i].duration) explosions.splice(i, 1);
    }
    advanceBossDeathPresentation(seconds);
  }
}
function drawCombatEffects() {
  if (state !== "battle") return;
  const calm = quietCombatMotion();
  const detail = typeof visualQuality === "undefined" ? "low" : visualQuality.id;
  if (isBossDeathPlaying()) {
    const quiet = reducedMotion.matches || (typeof visualQuality !== "undefined" && visualQuality.id === "low");
    drawBossPresentationBody(context, bossPresentation, quiet);
  }
  for (const wreck of combatEffects.wrecks) {
    const progress = wreck.age / wreck.duration;
    const split = Math.max(0, (wreck.age - (wreck.isBoss ? 0.35 : 0.08)) / wreck.duration);
    // 三段残骸来自同一副机身，关闭引擎后沿裂缝分离。
    for (let section = -1; section <= 1; section++) {
      context.save();
      context.translate(wreck.x, wreck.y);
      if (!calm) {
        context.translate(split * (section ? -14 : 24), section * split * wreck.height * 0.65);
        context.rotate(section * split * 0.26);
      }
      context.globalAlpha = Math.min(1, (1 - progress) * 2.6);
      context.beginPath();
      context.rect(-wreck.width * 0.65, (section - 0.5) * wreck.height * 0.4,
        wreck.width * 1.3, wreck.height * 0.4);
      context.clip();
      const snapshot = { ...wreck, x: 0, y: 0 };
      if (wreck.isBoss) drawBossShip(context, snapshot, true); else drawEnemyHull(snapshot);
      context.restore();
    }
  }
  for (const wave of combatEffects.shockwaves) {
    const progress = wave.age / wave.duration;
    const r = wave.radius * (calm ? .6 : .18 + progress);
    context.save(); context.globalAlpha = (1 - progress) * (calm ? .25 : .56);
    context.strokeStyle = wave.color; context.lineWidth = calm ? 1.5 : 1.2 + 1.8 * (1 - progress);
    context.beginPath(); context.arc(wave.x, wave.y, r, 0, Math.PI * 2); context.stroke();
    if (!calm && detail !== "low") {
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = (1 - progress) ** 1.5 * .57;
      context.lineWidth = 1;
      context.strokeStyle = "#fff5d3";
      context.beginPath();
      const parts = detail === "high" ? 7 : 4;
      for (let i = 0; i < parts; i++) {
        const seed = detonationStrands[i + 31];
        const edge = r * (.71 + .26 * seed.depth);
        const a = seed.angle + progress * .6;
        context.moveTo(wave.x + Math.cos(a) * edge, wave.y + Math.sin(a) * edge);
        context.arc(wave.x, wave.y, edge, a, a + .30 + seed.onset * .61);
      }
      context.stroke();
    }
    if (!calm && progress < .5) {
      const glow = context.createRadialGradient(wave.x, wave.y, 0, wave.x, wave.y, wave.radius * 0.65);
      glow.addColorStop(0, "#fff0c855"); glow.addColorStop(0.25, "#ff7b3540"); glow.addColorStop(1, "#ff551000");
      context.fillStyle = glow; context.beginPath(); context.arc(wave.x, wave.y, wave.radius * 0.65, 0, Math.PI * 2); context.fill();
    }
    context.restore();
  }
  for (const impact of combatEffects.impacts) drawCombatImpact(impact);
  drawSurfaceContacts();
  for (const particle of combatEffects.particles) {
    const progress = particle.age / particle.duration;
    context.save(); context.translate(particle.x, particle.y);
    const angle = particle.armor ? particle.angle + particle.spin * particle.age : Math.atan2(particle.vy, particle.vx);
    context.rotate(calm ? particle.angle : angle);
    context.globalAlpha = (1 - progress) * (particle.smoke ? 0.25 : 0.9);
    if (particle.smoke) {
      const span = particle.size * (calm ? 1.4 : 1.2 + progress * 3.4);
      const sprite = detail === "low" || calm ? null : detonationVolumeSprite(detonationMaterials.metal);
      if (sprite) context.drawImage(sprite, -span, -span, span * 2, span * 2);
      else {
        context.fillStyle = "#8e7267"; context.beginPath(); context.arc(0, 0, span, 0, Math.PI * 2); context.fill();
      }
    } else if (particle.armor) {
      context.fillStyle = particle.color; context.strokeStyle = "#d0ad85"; context.lineWidth = 0.7;
      context.beginPath(); context.moveTo(-particle.size, -particle.size); context.lineTo(particle.size * 1.5, -particle.size * 0.4);
      context.lineTo(particle.size * 0.6, particle.size); context.lineTo(-particle.size * 0.8, particle.size * 0.8); context.closePath(); context.fill(); context.stroke();
      context.fillStyle = "#d6a17b"; context.globalAlpha *= .6;
      context.beginPath(); context.moveTo(-particle.size, -particle.size); context.lineTo(particle.size * 1.5, -particle.size * .4);
      context.lineTo(particle.size * .43, particle.size * .08); context.closePath(); context.fill();
    } else {
      const trail = calm ? particle.size : Math.min(20, particle.size * 1.7 + Math.hypot(particle.vx, particle.vy) * .057);
      context.lineCap = "round"; context.strokeStyle = particle.color; context.lineWidth = particle.size * (1 - progress * .62);
      context.beginPath(); context.moveTo(0, 0); context.lineTo(-trail, 0); context.stroke();
      if (!calm && detail !== "low") {
        context.strokeStyle = "#fff3ce"; context.globalAlpha *= .67; context.lineWidth = Math.max(.55, particle.size * .45);
        context.beginPath(); context.moveTo(0, 0); context.lineTo(-trail * .37, 0); context.stroke();
      }
    }
    context.restore();
  }
}
