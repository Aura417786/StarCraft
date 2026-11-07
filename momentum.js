"use strict";

const momentumRules = {
  decayDelay: 4, decayStep: 0.65, rewardStep: 10, maxQueuedRewards: 3, rewardInterval: 0.8,
  rageThreshold: 20, rageDuration: 8, rageKillExtension: 0.35, rageMaxDuration: 14, shotRate: 1.6,
};
const momentum = {
  count: 0, best: 0, idle: 0, decay: 0, supplyMilestone: 0, rewardQueue: [],
  remaining: 0, elapsed: 0, nextRageAt: 20, rewardCooldown: 0, suppliesReleased: 0, rageStartCount: 0,
};
const momentumPanel = document.querySelector("#momentum-hud");
const comboCount = document.querySelector("#combo-count");
const comboBest = document.querySelector("#combo-best");
const comboMeter = document.querySelector("#combo-meter");
const comboFill = document.querySelector("#combo-fill");
const comboCaption = document.querySelector("#combo-caption");
const rageLabel = document.querySelector("#rage-label");
const finalCombo = document.querySelector("#final-combo");
let momentumDisplayKey = "";

function isOverdriveActive() { return momentum.remaining > 0; }
function shotRateMultiplier() { return isOverdriveActive() ? momentumRules.shotRate : 1; }
function momentumDecayIsFrozen() {
  return activeBosses().length > 0 || pendingBossType !== null
    || battleTime >= nextBossTime - bossRules.warning;
}
function updateMomentumDisplay() {
  const active = isOverdriveActive();
  const frozen = state === "battle" && momentumDecayIsFrozen();
  const remaining = Math.ceil(momentum.remaining * 10) / 10;
  const untilRage = Math.max(0, momentum.nextRageAt - momentum.count);
  const percent = active
    ? momentum.remaining / Math.max(momentumRules.rageDuration, momentum.elapsed + momentum.remaining) * 100
    : Math.max(0, momentumRules.rageThreshold - untilRage) / momentumRules.rageThreshold * 100;
  const key = [momentum.count, momentum.best, remaining, untilRage, percent.toFixed(1), active, frozen].join("/");
  if (key === momentumDisplayKey) return;
  momentumDisplayKey = key;
  comboCount.textContent = String(momentum.count);
  comboBest.textContent = "最高 " + momentum.best;
  finalCombo.textContent = String(momentum.best);
  comboFill.style.width = clamp(percent, 0, 100).toFixed(1) + "%";
  comboMeter.setAttribute("aria-valuenow", String(Math.floor(clamp(percent, 0, 100))));
  comboMeter.setAttribute("aria-label", active ? "暴走剩余时间" : "下一次暴走进度");
  comboMeter.setAttribute("aria-valuetext", active ? "暴走剩余 " + remaining.toFixed(1) + " 秒" : "再增加 " + untilRage + " 连击进入暴走");
  momentumPanel.dataset.overdrive = String(active);
  momentumPanel.dataset.frozen = String(frozen);
  comboCaption.textContent = frozen ? "连击保护 · 首领战" : "连击 / COMBO";
  rageLabel.textContent = active ? "暴走 " + remaining.toFixed(1) + " 秒 · 攻速 ×1.6"
    : "再增加 " + untilRage + " 连击进入暴走";
}
function resetMomentum() {
  Object.assign(momentum, {
    count: 0, best: 0, idle: 0, decay: 0, supplyMilestone: 0, remaining: 0, elapsed: 0,
    nextRageAt: momentumRules.rageThreshold, rewardCooldown: 0, suppliesReleased: 0, rageStartCount: 0,
  });
  momentum.rewardQueue.length = 0;
  momentumDisplayKey = "";
  updateMomentumDisplay();
}
function registerMomentumKill() {
  if (!isBattleActive()) return;
  momentum.count++;
  momentum.best = Math.max(momentum.best, momentum.count);
  momentum.idle = 0;
  momentum.decay = 0;
  const milestone = Math.floor(momentum.count / momentumRules.rewardStep);
  if (milestone > momentum.supplyMilestone) {
    // 已发过的档位即使衰减后再次跨过，也不会重复发奖。
    momentum.supplyMilestone = milestone;
    if (momentum.rewardQueue.length < momentumRules.maxQueuedRewards) {
      momentum.rewardQueue.push(["blue", "yellow", "red"][(milestone - 1) % 3]);
    }
  }
  if (isOverdriveActive()) {
    momentum.remaining = Math.max(0, Math.min(momentum.remaining + momentumRules.rageKillExtension,
      momentumRules.rageMaxDuration - momentum.elapsed));
  } else if (momentum.count >= momentum.nextRageAt) {
    momentum.remaining = momentumRules.rageDuration;
    momentum.elapsed = 0;
    momentum.rageStartCount = momentum.count;
    updateWeaponDisplay();
    gameAudio.overdrive?.();
    statusMessage.textContent = "连击暴走！普通射击速度提升，继续击杀可延长时间。";
  }
  updateMomentumDisplay();
}
function updateMomentum(seconds) {
  if (!isBattleActive() || !Number.isFinite(seconds) || seconds <= 0) return;
  let rageEnded = false;
  if (isOverdriveActive()) {
    const elapsed = Math.min(seconds, momentum.remaining);
    momentum.elapsed += elapsed;
    momentum.remaining = Math.max(0, momentum.remaining - seconds);
    if (momentum.remaining < 1e-9) {
      momentum.remaining = 0;
      rageEnded = true;
      updateWeaponDisplay();
    }
  }
  if (momentum.count > 0 && !momentumDecayIsFrozen()) {
    const previousIdle = momentum.idle;
    momentum.idle += seconds;
    momentum.decay += Math.max(0, momentum.idle - momentumRules.decayDelay)
      - Math.max(0, previousIdle - momentumRules.decayDelay);
    const lost = Math.floor((momentum.decay + 1e-9) / momentumRules.decayStep);
    if (lost > 0) {
      momentum.count = Math.max(0, momentum.count - lost);
      momentum.decay = Math.max(0, momentum.decay - lost * momentumRules.decayStep);
      if (momentum.count === 0) {
        momentum.idle = 0;
        momentum.decay = 0;
        momentum.supplyMilestone = 0;
        momentum.nextRageAt = momentumRules.rageThreshold;
      }
    }
  }
  if (rageEnded) momentum.nextRageAt = momentum.count + momentumRules.rageThreshold;
  momentum.rewardCooldown = Math.max(0, momentum.rewardCooldown - seconds);
  if (momentum.rewardQueue.length && momentum.rewardCooldown === 0 && powerups.length < powerupRules.maxOnScreen) {
    const type = momentum.rewardQueue.shift();
    const radius = powerupRules.radius;
    const x = viewport.width + radius + 4;
    const lane = [0.36, 0.64, 0.5][momentum.suppliesReleased % 3];
    const y = flightBounds.top + (flightBounds.bottom - flightBounds.top) * lane;
    powerups.push({ x, previousX: x, y, radius, type });
    momentum.suppliesReleased++;
    momentum.rewardCooldown = momentumRules.rewardInterval;
  }
  updateMomentumDisplay();
}
function endMomentumBattle() {
  momentum.remaining = 0;
  momentum.elapsed = 0;
  momentum.rewardQueue.length = 0;
  updateWeaponDisplay();
  updateMomentumDisplay();
}
function drawOverdrive() {
  if (state !== "battle" || !isOverdriveActive()) return;
  // 双喷口关于机头中心线对称；装饰不会改变战机或子弹的受击范围。
  const pulse = reducedMotion.matches ? 1 : 0.94 + Math.sin(momentum.elapsed * 29) * 0.06;
  const exhaustX = player.x - player.width * 0.4;
  const length = player.width * 0.7 * pulse;
  context.save();
  context.globalAlpha = 0.85;
  context.shadowColor = "#ff3928";
  context.shadowBlur = reducedMotion.matches ? 0 : 16;
  for (const side of [-1, 1]) {
    const y = player.y + side * player.height * 0.17;
    const fire = context.createLinearGradient(exhaustX - length, y, exhaustX, y);
    fire.addColorStop(0, "#ff231500"); fire.addColorStop(0.45, "#ff462d88");
    fire.addColorStop(0.8, "#ffb96dde"); fire.addColorStop(1, "#fff1d9");
    context.fillStyle = fire;
    context.beginPath();
    context.moveTo(exhaustX, y - player.height * 0.08);
    context.quadraticCurveTo(exhaustX - length * 0.45, y - player.height * 0.045, exhaustX - length, y);
    context.quadraticCurveTo(exhaustX - length * 0.45, y + player.height * 0.045, exhaustX, y + player.height * 0.08);
    context.closePath(); context.fill();
  }
  context.restore();
}
