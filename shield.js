"use strict";

const shieldRules = { maxCharges: 2, chargeTime: 25, duration: 2 };
// energy 以有效战斗秒数计量；储满后停止，不能暗中囤积第三次。
const shield = { charges: 0, energy: 0, remaining: 0 };
const shieldPanel = document.querySelector("#shield-hud");
const shieldCount = document.querySelector("#shield-count");
const shieldMeter = document.querySelector("#shield-meter");
const shieldFill = document.querySelector("#shield-fill");
const shieldLabel = document.querySelector("#shield-label");
const shieldSlots = document.querySelectorAll(".shield-slot");
let shieldDisplayKey = "";

function shieldIsActive() { return shield.remaining > 0; }
function updateShieldDisplay() {
  const full = shield.charges === shieldRules.maxCharges;
  const chargeTime = evolutionShieldChargeTime();
  const percent = full ? 100 : clamp(shield.energy / chargeTime * 100, 0, 100);
  const remaining = Math.ceil(shield.remaining * 10) / 10;
  const key = [shield.charges, percent.toFixed(1), remaining].join("/");
  if (key === shieldDisplayKey) return;
  shieldDisplayKey = key;
  shieldCount.textContent = shield.charges + " / " + shieldRules.maxCharges;
  shieldFill.style.width = percent.toFixed(1) + "%";
  shieldMeter.setAttribute("aria-valuenow", String(Math.floor(percent)));
  shieldMeter.setAttribute("aria-valuetext", full ? "护盾已储满 2 次" : "护盾充能 " + Math.floor(percent) + "%");
  shieldPanel.dataset.ready = String(shield.charges > 0);
  shieldPanel.dataset.active = String(shieldIsActive());
  shieldSlots.forEach((slot, index) => { slot.dataset.filled = String(index < shield.charges); });
  shieldLabel.textContent = shieldIsActive() ? "无敌保护 · " + remaining.toFixed(1) + " 秒"
    : full ? "储能已满 · V 开启"
    : shield.charges ? "V 开启 · 2 秒无敌" : "自动充能 · " + Math.ceil(chargeTime - shield.energy) + " 秒";
}
function requestShield() {
  if (!isBattleActive() || shield.charges <= 0 || shieldIsActive()) return false;
  shield.charges--;
  shield.remaining = shieldRules.duration;
  onEvolutionShield();
  player.hitFlash = 0;
  movementHint.hidden = true;
  updateShieldDisplay();
  statusMessage.textContent = "赤焰护盾开启，2 秒内无敌，剩余 " + shield.charges + " 次。";
  return true;
}
function updateShield(seconds) {
  if (!isBattleActive() || !Number.isFinite(seconds) || seconds <= 0) return;
  shield.remaining = Math.max(0, shield.remaining - seconds);
  if (shield.remaining < 1e-9) shield.remaining = 0;
  if (shield.charges < shieldRules.maxCharges) {
    const chargeTime = evolutionShieldChargeTime();
    const total = shield.energy + seconds;
    const gained = Math.floor((total + 1e-9) / chargeTime);
    shield.charges = Math.min(shieldRules.maxCharges, shield.charges + gained);
    shield.energy = shield.charges === shieldRules.maxCharges ? 0 : Math.max(0, total - gained * chargeTime);
    if (gained) statusMessage.textContent = "护盾充能完成，已储存 " + shield.charges + " 次。按 V 开启 2 秒无敌。";
  }
  updateShieldDisplay();
}
function resetShield() {
  shield.charges = 0;
  shield.energy = 0;
  shield.remaining = 0;
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
}
