"use strict";

const shieldRules = { maxCharges: 2, chargeTime: 25, duration: 2, perfectWindow: 0.25,
  refundFraction: 0.25, counterSeconds: 0.65, bossDamageCap: 0.03, slowDuration: 0.16, slowScale: 0.4 };
// energy 以有效战斗秒数计量；储满后停止，不能暗中囤积第三次。
const shield = { charges: 0, energy: 0, remaining: 0, perfectRemaining: 0, perfectUsed: false,
  flash: 0, slowRemaining: 0, effect: null };
const shieldPanel = document.querySelector("#shield-hud");
const shieldCount = document.querySelector("#shield-count");
const shieldMeter = document.querySelector("#shield-meter");
const shieldFill = document.querySelector("#shield-fill");
const shieldLabel = document.querySelector("#shield-label");
const shieldSlots = document.querySelectorAll(".shield-slot");
let shieldDisplayKey = "";

function shieldIsActive() { return shield.remaining > 0; }
function gainShieldEnergy(amount) {
  if (shield.charges >= shieldRules.maxCharges || !Number.isFinite(amount) || amount <= 0) return 0;
  const chargeTime = evolutionShieldChargeTime();
  const total = shield.energy + amount;
  const gained = Math.floor((total + 1e-9) / chargeTime);
  shield.charges = Math.min(shieldRules.maxCharges, shield.charges + gained);
  shield.energy = shield.charges === shieldRules.maxCharges ? 0 : Math.max(0, total - gained * chargeTime);
  return gained;
}
function shieldInterceptsProjectile(shot, swept = true) {
  if (!shieldIsActive()) return false;
  // 与可见的透明椭球一致；相对扫掠兼顾高速弹与玩家的移动。
  const rx = player.width * 0.60 + (shot.radius ?? 0), ry = player.height * 0.65 + (shot.radius ?? 0);
  const x0 = ((swept ? shot.previousX ?? shot.x : shot.x) - (swept ? player.previousX ?? player.x : player.x)) / rx;
  const y0 = ((swept ? shot.previousY ?? shot.y : shot.y) - (swept ? player.previousY ?? player.y : player.y)) / ry;
  const dx = (shot.x - player.x) / rx - x0, dy = (shot.y - player.y) / ry - y0;
  const length = dx * dx + dy * dy;
  const t = length ? clamp(-(x0 * dx + y0 * dy) / length, 0, 1) : 0;
  return Math.hypot(x0 + dx * t, y0 + dy * t) <= 1;
}
function consumeEvolutionShieldProjectile(shot, swept = true) {
  if (!shieldInterceptsProjectile(shot, swept)) return false;
  captureEvolutionProjectile(shot);
  return true;
}
function consumeShieldContacts() {
  let intercepted = false;
  for (const shots of [enemyProjectiles, bossProjectiles]) {
    for (let index = shots.length - 1; index >= 0; index--) {
      // 开盾只检查此刻接触，过去一帧已经飞过的弹不会补判。
      if (consumeEvolutionShieldProjectile(shots[index], false)) { shots.splice(index, 1); intercepted = true; }
    }
  }
  if (intercepted) tryPerfectShield();
}
function tryPerfectShield() {
  if (!isBattleActive() || !shieldIsActive() || shield.perfectRemaining <= 1e-9 || shield.perfectUsed || bossHitGrace > 0) return false;
  // 先消费机会，再结算伤害。击杀 Boss 可能清空弹幕并开始解体演出。
  shield.perfectUsed = true;
  shield.perfectRemaining = 0;
  armCannonLink();
  shield.flash = 0.65;
  shield.slowRemaining = reducedMotion.matches ? 0 : shieldRules.slowDuration;
  gainShieldEnergy(evolutionShieldChargeTime() * shieldRules.refundFraction);
  const halfHeight = Math.max(95, player.height * 1.1);
  shield.effect = { x: player.x, y: player.y, halfHeight, length: Math.max(0, viewport.width - player.x) };
  gameAudio.perfectShield();
  addCombatShake(2.5);
  const counterLog = weaponDamageLog() + Math.log(weapon.lanes / weapon.interval) + Math.log(shieldRules.counterSeconds);
  const counter = { source: "blast", damageLog: counterLog, x: player.x, y: player.y };
  const inFront = target => target.x + target.width * 0.4 >= player.x
    && target.x - target.width * 0.4 < viewport.width && target.x > player.x
    && Math.abs(target.y - player.y) <= halfHeight + target.height * 0.33;
  for (const enemy of enemies.filter(target => target.hp > 0 && inFront(target))) {
    if (!enemies.includes(enemy)) continue;
    applyEnemyHit(enemy, counter);
    if (enemy.hp <= 0) defeatEnemy(enemies.indexOf(enemy), counter);
  }
  for (const target of activeBosses()) {
    if (target.hp > 0 && inFront(target)) applyBossHit({ ...counter,
      damageLog: Math.min(counterLog, target.healthLog + Math.log(shieldRules.bossDamageCap)) }, target);
  }
  updateShieldDisplay();
  if (isBattleActive()) statusMessage.textContent = tr("完美格挡！返还 25% 护盾充能，3 秒内可消耗已存贯星炮速蓄连携。",
    "Perfect Guard! Restored 25% shield charge. Use a stored Crimson Beam shot within 3 seconds to charge it faster.");
  else { shield.slowRemaining = 0; resetCannonLink(); }
  return true;
}
function shieldFrameSeconds(realSeconds) {
  if (state !== "battle" || evolution.pending || isBossDeathPlaying()) shield.slowRemaining = 0;
  if (!isBattleActive() || !Number.isFinite(realSeconds) || realSeconds <= 0) return realSeconds;
  if (reducedMotion.matches) { shield.slowRemaining = 0; return realSeconds; }
  const slowed = Math.min(realSeconds, shield.slowRemaining);
  shield.slowRemaining = Math.max(0, shield.slowRemaining - realSeconds);
  return realSeconds - slowed + slowed * shieldRules.slowScale;
}
function updateShieldDisplay() {
  const full = shield.charges === shieldRules.maxCharges;
  const chargeTime = evolutionShieldChargeTime();
  const percent = full ? 100 : clamp(shield.energy / chargeTime * 100, 0, 100);
  const remaining = Math.ceil(shield.remaining * 10) / 10;
  const perfect = shield.flash > 0;
  const ready = shield.perfectRemaining > 1e-9 && !shield.perfectUsed;
  const absorbLimit = evolutionWeaponRules.absorbLimit[evolution.aegis];
  const absorbed = evolutionWeapons.absorbed.length;
  const key = [gameLanguage, shield.charges, percent.toFixed(1), remaining, perfect, ready, absorbLimit, absorbed].join("/");
  if (key === shieldDisplayKey) return;
  shieldDisplayKey = key;
  shieldCount.textContent = shield.charges + " / " + shieldRules.maxCharges;
  shieldFill.style.width = percent.toFixed(1) + "%";
  shieldMeter.setAttribute("aria-valuenow", String(Math.floor(percent)));
  shieldMeter.setAttribute("aria-valuetext", full ? tr("护盾已储满 2 次", "Both shield charges stored")
    : tr("护盾充能 " + Math.floor(percent) + "%", "Shield charge " + Math.floor(percent) + "%"));
  shieldPanel.dataset.ready = String(shield.charges > 0);
  shieldPanel.dataset.active = String(shieldIsActive());
  shieldPanel.dataset.perfect = String(perfect);
  shieldSlots.forEach((slot, index) => { slot.dataset.filled = String(index < shield.charges); });
  shieldLabel.textContent = perfect ? tr("完美格挡 · 返还 25% 充能", "Perfect Guard · 25% back")
    : ready ? tr("完美窗口 · 迎击敌弹", "Perfect Guard window")
    : shieldIsActive() && absorbLimit ? tr("吸收弹药 " + absorbed + "/" + absorbLimit + " · " + remaining.toFixed(1) + " 秒",
      "Absorbed " + absorbed + "/" + absorbLimit + " · " + remaining.toFixed(1) + "s")
    : shieldIsActive() ? tr("无敌保护 · " + remaining.toFixed(1) + " 秒", "Protected · " + remaining.toFixed(1) + "s")
    : full ? tr("储能已满 · V 迎弹反击", "Fully charged · V to guard")
    : shield.charges ? tr("V 迎弹格挡 · 2 秒无敌", "V to guard · 2s protection")
    : tr("自动充能 · " + Math.ceil(chargeTime - shield.energy) + " 秒", "Recharging · " + Math.ceil(chargeTime - shield.energy) + "s");
  shieldPanel.title = tr("敌弹触盾前按 V，最初 0.25 秒可完美格挡，触发反击并返还 25% 充能。",
    "Press V just before a shot reaches you. Block within 0.25 seconds to counter and restore 25% shield charge.")
    + (absorbLimit ? tr(" 当前壁垒可吸收 " + absorbLimit + " 发接触护盾的敌弹，并在护盾结束时释放。",
      " Your Aegis absorbs up to " + absorbLimit + " shots it blocks and releases them when the shield ends.") : "");
}
function requestShield() {
  if (!isBattleActive() || shield.charges <= 0 || shieldIsActive()) return false;
  shield.charges--;
  shield.remaining = shieldRules.duration;
  shield.perfectRemaining = shieldRules.perfectWindow;
  shield.perfectUsed = false;
  shield.flash = 0; shield.slowRemaining = 0; shield.effect = null;
  beginEvolutionShieldCapture();
  consumeShieldContacts();
  if (isBattleActive()) onEvolutionShield();
  player.hitFlash = 0;
  movementHint.hidden = true;
  updateShieldDisplay();
  if (!shield.perfectUsed) statusMessage.textContent = tr("赤焰护盾开启，2 秒内无敌；最初 0.25 秒挡住敌弹可完美反击，剩余 " + shield.charges + " 次。",
    "Crimson Shield active for 2 seconds. Block within the first 0.25 seconds for a Perfect Guard. Charges left: " + shield.charges + ".");
  return true;
}
function updateShield(seconds) {
  if (!isBattleActive() || !Number.isFinite(seconds) || seconds <= 0) return;
  const wasActive = shieldIsActive();
  shield.remaining = Math.max(0, shield.remaining - seconds);
  if (shield.remaining < 1e-9) shield.remaining = 0;
  if (wasActive && !shieldIsActive()) finishEvolutionShieldCapture();
  shield.perfectRemaining = Math.max(0, shield.perfectRemaining - seconds);
  shield.flash = Math.max(0, shield.flash - seconds);
  if (!shield.flash) shield.effect = null;
  if (shield.charges < shieldRules.maxCharges) {
    const gained = gainShieldEnergy(seconds);
    if (gained) statusMessage.textContent = tr("护盾充能完成，已储存 " + shield.charges + " 次。按 V 开启 2 秒无敌。",
      "Shield ready. Charges stored: " + shield.charges + ". Press V for 2 seconds of protection.");
  }
  updateShieldDisplay();
}
function resetShield() {
  shield.charges = 0;
  shield.energy = 0;
  shield.remaining = 0;
  shield.perfectRemaining = 0; shield.perfectUsed = false;
  shield.flash = 0; shield.slowRemaining = 0; shield.effect = null;
  beginEvolutionShieldCapture();
  updateShieldDisplay();
}
function drawShield() {
  if (state !== "battle" || !shieldIsActive()) return;
  const x = player.x, y = player.y;
  const rx = player.width * 0.60, ry = player.height * 0.65;
  const age = shieldRules.duration - shield.remaining;
  const fade = reducedMotion.matches ? 1 : Math.min(1, age / 0.12 + 0.25, shield.remaining / 0.18);
  context.save();
  context.translate(x, y);
  context.scale(rx, ry);
  const skin = context.createRadialGradient(-0.18, -0.2, 0.06, 0, 0, 1);
  skin.addColorStop(0, "#ffbdab0d"); skin.addColorStop(0.68, "#ff28391c");
  skin.addColorStop(0.9, "#ff354444"); skin.addColorStop(1, "#ff647965");
  context.globalAlpha = fade;
  context.fillStyle = skin;
  context.beginPath(); context.arc(0, 0, 1, 0, Math.PI * 2); context.fill();
  context.restore();
  context.save();
  context.globalAlpha = fade;
  context.strokeStyle = "#ff6d7bc4";
  context.lineWidth = 1.6;
  context.shadowColor = "#ff1839";
  context.shadowBlur = reducedMotion.matches ? 0 : 13;
  context.beginPath(); context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); context.stroke();
  context.shadowBlur = 0;
  context.strokeStyle = "#ffa49a55";
  context.lineWidth = 1;
  context.beginPath(); context.ellipse(x, y, rx * 0.36, ry, 0, 0, Math.PI * 2); context.stroke();
  context.beginPath(); context.ellipse(x, y, rx, ry * 0.32, 0, 0, Math.PI * 2); context.stroke();
  context.strokeStyle = "#ffe2d399";
  context.lineWidth = 2;
  context.beginPath(); context.ellipse(x - rx * 0.03, y, rx * 0.93, ry * 0.9, 0, Math.PI * 1.07, Math.PI * 1.58); context.stroke();
  context.restore();
  drawPerfectShield();
}

function drawPerfectShield() {
  if (shield.perfectRemaining > 1e-9 && !shield.perfectUsed) {
    context.save();
    context.strokeStyle = "#ffe7d4"; context.lineWidth = 3;
    context.shadowColor = "#ff3d54"; context.shadowBlur = reducedMotion.matches ? 0 : 20;
    context.beginPath(); context.ellipse(player.x, player.y, player.width * 0.62, player.height * 0.68,
      0, -Math.PI * 0.55, Math.PI * 0.55); context.stroke(); context.restore();
  }
  if (!shield.effect || shield.flash <= 0) return;
  const effect = shield.effect, progress = clamp(1 - shield.flash / 0.65, 0, 1);
  const alpha = 1 - progress;
  const edge = effect.x + effect.length * (reducedMotion.matches ? 0.4 : 1 - Math.pow(1 - progress, 3));
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = "#ff5369"; context.lineWidth = 3;
  context.shadowColor = "#ff173f"; context.shadowBlur = reducedMotion.matches ? 0 : 22;
  context.beginPath(); context.ellipse(effect.x, effect.y, player.width * (0.65 + progress * 0.8),
    player.height * (0.7 + progress * 0.7), 0, 0, Math.PI * 2); context.stroke();
  // 弧形亮边和窄光带表现前向反击，不遮住整个战场。
  const light = context.createLinearGradient(edge - 90, 0, edge + 24, 0);
  light.addColorStop(0, "#ff284500"); light.addColorStop(0.8, "#ff284522"); light.addColorStop(1, "#ffd5c366");
  context.fillStyle = light;
  context.fillRect(edge - 90, effect.y - effect.halfHeight, 114, effect.halfHeight * 2);
  context.strokeStyle = "#ffe8de"; context.lineWidth = 2;
  context.beginPath(); context.moveTo(edge - 20, effect.y - effect.halfHeight);
  context.quadraticCurveTo(edge + 40, effect.y, edge - 20, effect.y + effect.halfHeight); context.stroke();
  context.shadowBlur = 0;
  context.font = "700 18px Microsoft YaHei, sans-serif"; context.textAlign = "center";
  context.fillStyle = "#ffe5d7";
  context.fillText(tr("完美格挡", "PERFECT GUARD"), player.x, player.y - player.height * 0.9 - (reducedMotion.matches ? 0 : progress * 18));
  context.restore();
}
