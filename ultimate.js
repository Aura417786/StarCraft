"use strict";

// 赤焰贯星炮：实际造成的伤害积能；大招不为自身充能。
const ultimateRules = { maxCharges: 5, energyPerCharge: 100, enemyEnergy: 12, bossEnergy: 180,
  chargeTime: 0.85, bossDamageCap: 0.18 };
const ultimate = { charges: 0, energy: 0, phase: "idle", elapsed: 0, shot: null, audioActive: false };
// 连携只缩短下一次成功消费的蓄力；时长在按下空格时锁定，不追溯改变正在蓄力的炮。
const cannonLink = { remaining: 0, chargeDuration: ultimateRules.chargeTime, chargingLinked: false };
const cannonLinkRules = { duration: 3, chargeTime: 0.45 };
const ultimatePanel = document.querySelector("#ultimate-hud");
const ultimateCount = document.querySelector("#ultimate-count");
const ultimateMeter = document.querySelector("#ultimate-meter");
const ultimateFill = document.querySelector("#ultimate-fill");
const ultimateLabel = document.querySelector("#ultimate-label");
const ultimateSlots = document.querySelectorAll(".ultimate-slot");

function updateUltimateDisplay() {
  const full = ultimate.charges === ultimateRules.maxCharges;
  const progress = full ? 100 : ultimate.energy;
  ultimateCount.textContent = ultimate.charges + " / " + ultimateRules.maxCharges;
  ultimateFill.style.width = progress + "%";
  ultimateMeter.setAttribute("aria-valuenow", String(Math.floor(progress)));
  ultimateMeter.setAttribute("aria-valuetext", full ? "已储满 5 次" : "积能 " + Math.floor(progress) + "%");
  ultimatePanel.dataset.ready = String(ultimate.charges > 0);
  ultimatePanel.dataset.phase = ultimate.phase;
  ultimatePanel.dataset.linked = String(cannonLink.remaining > 1e-9 || cannonLink.chargingLinked);
  ultimateSlots.forEach((slot, index) => { slot.dataset.filled = String(index < ultimate.charges); });
  const countdown = (Math.ceil(cannonLink.remaining * 10) / 10).toFixed(1);
  const opportunity = cannonLink.remaining > 1e-9;
  ultimateLabel.textContent = ultimate.phase === "charging" ? (cannonLink.chargingLinked ? "完美连携速蓄 · 保持瞄准"
      : opportunity ? "蓄力中 · 连携保留 " + countdown + " 秒" : "蓄力中 · 保持瞄准")
    : ultimate.phase === "firing" ? (cannonLink.chargingLinked ? "完美连携 · 贯穿发射"
      : opportunity ? "贯穿发射 · 连携 " + countdown + " 秒" : "贯穿发射")
    : opportunity ? "完美连携 " + countdown + " 秒 · " + (ultimate.charges ? "空格速蓄" : "需已存炮弹")
    : full ? "储能已满 · 空格释放"
    : ultimate.charges ? "空格释放 · 命中继续积能" : "命中敌军积能";
}
function armCannonLink() {
  if (!isBattleActive()) return false;
  cannonLink.remaining = cannonLinkRules.duration;
  updateUltimateDisplay();
  return true;
}
function resetCannonLink() {
  cannonLink.remaining = 0;
  updateUltimateDisplay();
}
function updateCannonLink(seconds) {
  // 暂停和隐藏只冻结窗口；战斗结束、Boss 解体或选卡会彻底清除机会。
  if (state !== "battle" || evolution.pending || isBossDeathPlaying()) {
    if (cannonLink.remaining) resetCannonLink();
    return;
  }
  if (!isBattleActive() || !Number.isFinite(seconds) || seconds <= 0 || cannonLink.remaining <= 0) return;
  cannonLink.remaining = Math.max(0, cannonLink.remaining - seconds);
  if (cannonLink.remaining < 1e-9) cannonLink.remaining = 0;
  updateUltimateDisplay();
}
function gainUltimateEnergy(fraction, kind = "enemy") {
  if (state !== "battle" || !Number.isFinite(fraction) || fraction <= 0 || ultimate.charges >= ultimateRules.maxCharges) return;
  const amount = clamp(fraction, 0, 1) * (kind === "boss" ? ultimateRules.bossEnergy : ultimateRules.enemyEnergy);
  const total = ultimate.energy + amount;
  const gained = Math.floor((total + 1e-9) / ultimateRules.energyPerCharge);
  ultimate.charges = Math.min(ultimateRules.maxCharges, ultimate.charges + gained);
  ultimate.energy = ultimate.charges === ultimateRules.maxCharges ? 0 : Math.max(0, total - gained * ultimateRules.energyPerCharge);
  updateUltimateDisplay();
  if (gained) statusMessage.textContent = "赤焰贯星炮就绪，已储存 " + ultimate.charges + " 次。按空格蓄力发射。";
}
function ultimateDamageLog() {
  // 相当于数秒完整火力，并保证能贯穿同期小怪。对数计算兼容无上限的武器阶数。
  const equivalentSeconds = 8 + 4 * Math.log1p(battleTime / 90);
  return Math.max(weaponDamageLog() + Math.log(weapon.lanes / weapon.interval) + Math.log(equivalentSeconds),
    enemyHealthLogForTime() + Math.log(enemyTypes.armored.health));
}
function ultimateSuppressesFire() { return ultimate.phase === "charging" || ultimate.phase === "firing"; }
function requestUltimate() {
  if (!isBattleActive() || ultimate.phase !== "idle" || ultimate.charges <= 0) return false;
  cannonLink.chargingLinked = cannonLink.remaining > 1e-9;
  cannonLink.chargeDuration = cannonLink.chargingLinked ? cannonLinkRules.chargeTime : ultimateRules.chargeTime;
  if (cannonLink.chargingLinked) cannonLink.remaining = 0;
  ultimate.charges--;
  ultimate.phase = "charging";
  ultimate.elapsed = 0;
  ultimate.shot = null;
  pendingShots = 0;
  muzzleFlash = 0;
  movementHint.hidden = true;
  gameAudio.chargeUltimate(cannonLink.chargeDuration);
  ultimate.audioActive = !gameAudio.muted;
  updateUltimateDisplay();
  statusMessage.textContent = cannonLink.chargingLinked ? "完美连携！赤焰贯星炮 0.45 秒速蓄，对准目标，随后自动发射。"
    : "赤焰贯星炮蓄力中，对准目标，随后自动发射。";
  return true;
}
function syncUltimateAudio(active) {
  const audible = active && !gameAudio.muted;
  if (ultimate.audioActive && !audible) gameAudio.stopUltimate();
  if (!ultimate.audioActive && audible && ultimate.phase === "charging") {
    gameAudio.chargeUltimate(Math.max(0.02, cannonLink.chargeDuration - ultimate.elapsed));
  }
  ultimate.audioActive = audible;
}
function cancelUltimate(refundCharge = false) {
  if (refundCharge && ultimate.phase === "charging") {
    ultimate.charges = Math.min(ultimateRules.maxCharges, ultimate.charges + 1);
    if (ultimate.charges === ultimateRules.maxCharges) ultimate.energy = 0;
  }
  ultimate.phase = "idle";
  ultimate.elapsed = 0;
  ultimate.shot = null;
  ultimate.audioActive = false;
  cannonLink.chargeDuration = ultimateRules.chargeTime;
  cannonLink.chargingLinked = false;
  if (state !== "battle" || evolution.pending || isBossDeathPlaying()) cannonLink.remaining = 0;
  gameAudio.stopUltimate();
  updateUltimateDisplay();
}
function resetUltimate() {
  ultimate.charges = 0;
  ultimate.energy = 0;
  cannonLink.remaining = 0;
  cancelUltimate();
}
function fireUltimate() {
  const muzzle = muzzlePosition();
  const speed = Math.max(1600, viewport.width * 1.65);
  ultimate.phase = "firing";
  ultimate.elapsed = 0;
  ultimate.shot = { x: muzzle.x, previousX: muzzle.x, startX: muzzle.x, y: muzzle.y,
    radius: Math.min(40, player.height * 0.28 + 8), length: clamp(viewport.width * 0.56, 360, 900),
    speed, damageLog: ultimateDamageLog(), source: "ultimate", linked: cannonLink.chargingLinked, hitTargets: new WeakSet() };
  gameAudio.stopUltimate();
  gameAudio.fireUltimate();
  updateUltimateDisplay();
}
function ultimateHitsTarget(shot, target) {
  // 求炮身与移动目标同时重叠的时间，避免波浪机在一帧内穿过炮身却漏判。
  if (target.x - target.width * 0.45 > viewport.width) return false;
  const oldX = target.previousX ?? target.x, oldY = target.previousY ?? target.y;
  const halfWidth = target.width * 0.45, halfHeight = shot.radius + target.height * 0.4;
  const relativeX = shot.previousX - oldX;
  let enter = 0, leave = 1;
  for (const [origin, delta, low, high] of [
    [relativeX, shot.x - target.x - relativeX, -halfWidth, shot.length + halfWidth],
    [oldX, target.x - oldX, shot.startX - halfWidth, Infinity],
    [shot.y - oldY, oldY - target.y, -halfHeight, halfHeight],
  ]) {
    if (Math.abs(delta) < 1e-12) { if (origin < low || origin > high) return false; }
    else {
      const a = (low - origin) / delta, b = (high - origin) / delta;
      enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
      if (enter > leave) return false;
    }
  }
  return true;
}
function resolveUltimateHits() {
  const shot = ultimate.shot;
  if (!shot) return;
  resolveUltimateBattlefieldObjects(shot);
  for (let index = enemies.length - 1; index >= 0; index--) {
    const enemy = enemies[index];
    if (shot.hitTargets.has(enemy) || !ultimateHitsTarget(shot, enemy)) continue;
    shot.hitTargets.add(enemy);
    applyEnemyHit(enemy, shot);
    if (enemy.hp <= 0) defeatEnemy(index, shot);
  }
  for (const target of activeBosses()) {
    if (!bossCanTakeDamage(target) || shot.hitTargets.has(target) || !ultimateHitsTarget(shot, target)) continue;
    shot.hitTargets.add(target);
    applyBossHit({ source: "ultimate", damageLog: Math.min(shot.damageLog, target.healthLog + Math.log(ultimateRules.bossDamageCap)) }, target);
    if (!isBattleActive()) return;
  }
}
function updateUltimate(seconds) {
  if (!isBattleActive() || seconds <= 0 || ultimate.phase === "idle") return;
  let remaining = seconds;
  if (ultimate.phase === "charging") {
    const used = Math.min(remaining, Math.max(0, cannonLink.chargeDuration - ultimate.elapsed));
    ultimate.elapsed += used;
    remaining -= used;
    if (ultimate.elapsed + 1e-9 < cannonLink.chargeDuration) return;
    fireUltimate();
  }
  if (ultimate.phase === "firing") {
    const shot = ultimate.shot;
    const untilExit = Math.max(0, (viewport.width + shot.length + shot.radius - shot.x) / shot.speed);
    const used = Math.min(remaining, untilExit);
    shot.previousX = shot.x;
    shot.x += shot.speed * used;
    ultimate.elapsed += used;
    remaining -= used;
    if (used > 0) resolveUltimateHits();
    if (used + 1e-9 < untilExit) return;
    // 炮弹发射结束同帧恢复可用，没有额外后摇或冷却。
    ultimate.phase = "idle";
    ultimate.elapsed = 0;
    ultimate.shot = null;
    cannonLink.chargeDuration = ultimateRules.chargeTime;
    cannonLink.chargingLinked = false;
    gameAudio.stopUltimate();
    updateUltimateDisplay();
  }
}
function drawUltimate() {
  if (state !== "battle") return;
  context.save();
  if (ultimate.phase === "charging") {
    const muzzle = muzzlePosition();
    const progress = clamp(ultimate.elapsed / cannonLink.chargeDuration, 0, 1);
    const radius = 8 + progress * Math.min(32, player.height * 0.26);
    const halo = context.createRadialGradient(muzzle.x, muzzle.y, 0, muzzle.x, muzzle.y, radius * 2.1);
    halo.addColorStop(0, "#fff1df"); halo.addColorStop(0.22, "#ff7b77");
    halo.addColorStop(0.5, "#ff254fbb"); halo.addColorStop(1, "#ff143600");
    context.fillStyle = halo;
    context.beginPath(); context.arc(muzzle.x, muzzle.y, radius * 2.1, 0, Math.PI * 2); context.fill();
    context.strokeStyle = "#ff7a88"; context.lineWidth = 2;
    context.beginPath(); context.ellipse(muzzle.x, muzzle.y, radius * 0.4, radius * 1.3, 0, 0, Math.PI * 2); context.stroke();
    if (cannonLink.chargingLinked) {
      context.strokeStyle = "#c1f4ff"; context.lineWidth = 2.5;
      context.beginPath(); context.ellipse(muzzle.x, muzzle.y, radius * 0.55, radius * 1.55, 0, 0, Math.PI * 2); context.stroke();
    }
    if (!reducedMotion.matches) {
      for (let index = 0; index < 10; index++) {
        const angle = index * Math.PI / 5 + ultimate.elapsed * 2;
        const distance = radius + 22 + (1 - (progress * 3 + index / 10) % 1) * 32;
        context.globalAlpha = 0.35 + progress * 0.55;
        context.beginPath(); context.moveTo(muzzle.x + Math.cos(angle) * distance, muzzle.y + Math.sin(angle) * distance);
        context.lineTo(muzzle.x + Math.cos(angle) * (distance - 12), muzzle.y + Math.sin(angle) * (distance - 12)); context.stroke();
      }
    }
  } else if (ultimate.phase === "firing" && ultimate.shot) {
    const shot = ultimate.shot;
    const left = Math.max(shot.startX, shot.x - shot.length), right = Math.min(viewport.width + shot.radius, shot.x);
    const radius = shot.radius;
    if (right > left) {
      context.shadowColor = "#ff172a"; context.shadowBlur = reducedMotion.matches ? 0 : 25;
      const body = context.createLinearGradient(0, shot.y - radius, 0, shot.y + radius);
      body.addColorStop(0, "#b70e24dd"); body.addColorStop(0.18, "#ff2339");
      body.addColorStop(0.46, shot.linked ? "#ffe9e0" : "#ffab94"); body.addColorStop(0.5, shot.linked ? "#ffffff" : "#ffe6cf");
      body.addColorStop(0.65, "#ff695d"); body.addColorStop(1, "#bf1029dd");
      context.fillStyle = body;
      context.fillRect(left, shot.y - radius, right - left, radius * 2);
      context.beginPath(); context.ellipse(left, shot.y, radius * 0.24, radius, 0, 0, Math.PI * 2); context.fill();
      context.beginPath(); context.ellipse(right, shot.y, radius * 0.32, radius, 0, 0, Math.PI * 2); context.fill();
      context.shadowBlur = 0; context.strokeStyle = "#ffd3c6aa"; context.lineWidth = 1.5;
      const offset = reducedMotion.matches ? 0 : ultimate.elapsed * 90 % 75;
      for (let x = left + 15 + offset; x < right - 10; x += 75) {
        context.beginPath(); context.ellipse(x, shot.y, radius * 0.24, radius * 0.9, 0, -Math.PI / 2, Math.PI / 2); context.stroke();
      }
      context.strokeStyle = "#fff2df"; context.lineWidth = 2;
      context.beginPath(); context.ellipse(right, shot.y, radius * 0.32, radius, 0, 0, Math.PI * 2); context.stroke();
      if (shot.linked) {
        context.strokeStyle = "#c1f4ff"; context.lineWidth = 2;
        context.beginPath(); context.ellipse(right, shot.y, radius * 0.4, radius * 1.08, 0, 0, Math.PI * 2); context.stroke();
      }
    }
  }
  context.restore();
}
