"use strict";

// 视觉效果有独立容量和时钟，不参与命中、伤害或敌人刷新。
const combatEffects = { clock: 0, particles: [], impacts: [], wrecks: [], shockwaves: [],
  shake: 0, shakeTime: 0, light: null };
const combatLightProfiles = {
  hit: { life: .24, strength: .31, rank: 1 },
  impact: { life: .29, strength: .48, rank: 2 },
  ultimate: { life: .42, strength: .69, rank: 3 },
  collapse: { life: .46, strength: .85, rank: 4 },
};
let reduceCombatMotion = false;
try { reduceCombatMotion = window.localStorage.getItem("star-breaker-reduce-combat-motion") === "true"; }
catch { /* 仅应用系统设置。 */ }

function quietCombatMotion() { return reduceCombatMotion || reducedMotion.matches; }
function toggleCombatMotion() {
  reduceCombatMotion = !reduceCombatMotion;
  try { window.localStorage.setItem("star-breaker-reduce-combat-motion", String(reduceCombatMotion)); }
  catch { /* 当前会话仍有效。 */ }
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
      ctx.globalAlpha = strength * .21;
      for (const step of [1.025, 1.075, 1.13]) {
        const span = radius * step;
        ctx.drawImage(sample, x - span, y - span, span * 2, span * 2);
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
  for (const name of ["particles", "impacts", "wrecks", "shockwaves"]) combatEffects[name].length = 0;
  combatEffects.clock = 0; combatEffects.shake = 0; combatEffects.shakeTime = 0; combatEffects.light = null;
  resetBossPresentation();
}
function resizeCombatEffects(oldWidth, oldHeight) {
  for (const name of ["particles", "impacts", "shockwaves"]) combatEffects[name].length = 0;
  combatEffects.shake = 0; combatEffects.shakeTime = 0;
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
function addCombatShake(strength) {
  if (quietCombatMotion() || shakePreference === "off") return;
  combatEffects.shake = Math.max(combatEffects.shake, strength);
  combatEffects.shakeTime = 0.23;
}
function combatShakeOffset() {
  if (quietCombatMotion() || shakePreference === "off" || combatEffects.shakeTime <= 0) return { x: 0, y: 0 };
  const strength = Math.min(shakePreference === "full" ? 6 : 2.5,
    combatEffects.shake * (shakePreference === "full" ? 1 : 0.42)) * combatEffects.shakeTime / 0.23;
  return { x: Math.sin(combatEffects.clock * 109) * strength,
    y: Math.cos(combatEffects.clock * 83) * strength * 0.7 };
}
function combatBurst(x, y, size = 1, color = "#ffb569", armor = false) {
  const quiet = reducedMotion.matches;
  pushCombatEffect(combatEffects.shockwaves, { x, y, age: 0, duration: quiet ? 0.3 : 0.5,
    radius: 32 * size, color }, 16);
  const count = quiet ? 3 : armor ? 14 : 10;
  for (let i = 0; i < count; i++) {
    const angle = Math.PI * 2 * i / count + Math.random() * 0.28;
    const speed = quiet ? 0 : (55 + Math.random() * 135) * Math.sqrt(size);
    pushCombatEffect(combatEffects.particles, { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      age: 0, duration: quiet ? 0.25 : 0.35 + Math.random() * 0.48, size: (armor ? 3 : 1.5) + Math.random() * 3,
      angle, spin: quiet ? 0 : (Math.random() - 0.5) * 8, color: armor && i % 3 === 0 ? "#77889d" : color,
      armor: armor && i % 3 === 0, smoke: i % 4 === 0 }, 180);
  }
}
function recordCombatImpact(target, bullet, bossHit = false) {
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return;
  const ultimateHit = bullet.source === "ultimate";
  if (!ultimateHit && (target.fxNextImpact ?? -1) > combatEffects.clock) return;
  target.fxNextImpact = combatEffects.clock + 0.07;
  gameAudio.hit?.(bossHit, bullet.source);
  const x = target.x - (target.width || 80) * 0.31;
  const y = Number.isFinite(bullet.y) ? clamp(bullet.y, target.y - target.height * 0.3, target.y + target.height * 0.3) : target.y;
  pushCombatEffect(combatEffects.impacts, { x, y, age: 0, duration: ultimateHit ? 0.3 : 0.13,
    color: ultimateHit ? "#ff9c89" : "#ffddb0", size: ultimateHit ? 24 : 8 }, 32);
  if (!reducedMotion.matches) {
    for (let i = 0; i < (ultimateHit ? 9 : 3); i++) {
      const angle = Math.PI * (0.7 + Math.random() * 0.6), speed = 65 + Math.random() * 150;
      pushCombatEffect(combatEffects.particles, { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        age: 0, duration: 0.15 + Math.random() * 0.15, size: 1.6, angle, spin: 0,
        color: "#ffd6a5", armor: false, smoke: false }, 180);
    }
  }
  if (ultimateHit && bossHit) {
    pushCombatEffect(combatEffects.shockwaves, { x, y, age: 0, duration: 0.48,
      radius: Math.min(155, target.width * 0.7), color: "#ff867a" }, 16);
    addCombatShake(5);
    pulseCombatLight(x, y, Math.max(80, target.width * .68), "#ff867a", "impact");
  }
}
function recordCombatDestruction(target, isBoss = false) {
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return;
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
  if (combatEffects.light) {
    combatEffects.light.age += seconds;
    if (combatEffects.light.age >= combatLightProfiles[combatEffects.light.kind].life) combatEffects.light = null;
  }
  combatEffects.shakeTime = Math.max(0, combatEffects.shakeTime - seconds);
  if (!combatEffects.shakeTime) combatEffects.shake = 0;
  for (const name of ["particles", "impacts", "shockwaves"]) {
    const list = combatEffects[name];
    for (let i = list.length - 1; i >= 0; i--) {
      const effect = list[i]; effect.age += seconds;
      if (effect.vx !== undefined) { effect.x += effect.vx * seconds; effect.y += effect.vy * seconds; }
      if (effect.age >= effect.duration) list.splice(i, 1);
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
      if (wreck.isBoss && !reducedMotion.matches) gameAudio.explode(final);
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
      if (!reducedMotion.matches) {
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
    context.save(); context.globalAlpha = (1 - progress) * (reducedMotion.matches ? 0.25 : 0.65);
    context.strokeStyle = wave.color; context.lineWidth = 1.5 + 3 * (1 - progress);
    context.beginPath(); context.arc(wave.x, wave.y, wave.radius * (reducedMotion.matches ? 0.6 : 0.18 + progress), 0, Math.PI * 2); context.stroke();
    if (!reducedMotion.matches && progress < 0.5) {
      const glow = context.createRadialGradient(wave.x, wave.y, 0, wave.x, wave.y, wave.radius * 0.65);
      glow.addColorStop(0, "#fff0c855"); glow.addColorStop(0.25, "#ff7b3540"); glow.addColorStop(1, "#ff551000");
      context.fillStyle = glow; context.beginPath(); context.arc(wave.x, wave.y, wave.radius * 0.65, 0, Math.PI * 2); context.fill();
    }
    context.restore();
  }
  for (const impact of combatEffects.impacts) {
    const progress = impact.age / impact.duration;
    context.save(); context.globalAlpha = (1 - progress) * (reducedMotion.matches ? 0.35 : 0.85);
    context.fillStyle = impact.color; context.translate(impact.x, impact.y);
    context.beginPath(); context.moveTo(-impact.size, 0); context.lineTo(0, -impact.size * 0.45);
    context.lineTo(impact.size * 0.5, 0); context.lineTo(0, impact.size * 0.45); context.closePath(); context.fill(); context.restore();
  }
  for (const particle of combatEffects.particles) {
    const progress = particle.age / particle.duration;
    context.save(); context.translate(particle.x, particle.y); context.rotate(particle.angle + particle.spin * particle.age);
    context.globalAlpha = (1 - progress) * (particle.smoke ? 0.25 : 0.9);
    if (particle.smoke) {
      context.fillStyle = "#8e7267"; context.beginPath(); context.arc(0, 0, particle.size * (1 + progress * 3), 0, Math.PI * 2); context.fill();
    } else if (particle.armor) {
      context.fillStyle = particle.color; context.strokeStyle = "#d0ad85"; context.lineWidth = 0.7;
      context.beginPath(); context.moveTo(-particle.size, -particle.size); context.lineTo(particle.size * 1.5, -particle.size * 0.4);
      context.lineTo(particle.size * 0.6, particle.size); context.lineTo(-particle.size * 0.8, particle.size * 0.8); context.closePath(); context.fill(); context.stroke();
    } else {
      context.strokeStyle = particle.color; context.lineWidth = particle.size * (1 - progress * 0.5);
      context.beginPath(); context.moveTo(0, 0); context.lineTo(-particle.size * 4 * (1 - progress), 0); context.stroke();
    }
    context.restore();
  }
}
