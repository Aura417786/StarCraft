"use strict";

// 三条进化路线可叠加；成长上限与本局的基础武器强化互相独立。
const evolution = { pierce: 0, blast: 0, aegis: 0, pending: false, choice: "", pulses: [] };
const evolutionScreen = document.querySelector("#evolution-screen");
const evolutionTitle = document.querySelector("#evolution-title");
const evolutionDescription = document.querySelector("#evolution-description");
const evolutionReadout = document.querySelector("#evolution-readout");
const evolutionKeys = ["pierce", "blast", "aegis"];
const evolutionCards = evolutionKeys.map((kind) => document.querySelector("#evolution-card-" + kind));
const evolutionNames = { pierce: "破阵翼刃", blast: "焚星爆破", aegis: "赤金壁垒" };
const evolutionBackground = new Map();
let evolutionBlastCooldown = 0;

function evolutionPierceCount() { return evolution.pierce; }
function evolutionMainDamageMultiplier() { return [1, 1.25, 1.45, 1.65][evolution.pierce]; }
function evolutionShieldChargeTime() { return [25, 20, 17, 14][evolution.aegis]; }
function evolutionAllComplete() { return evolutionKeys.every((kind) => evolution[kind] >= 3); }
function updateEvolutionDisplay() {
  const selected = evolutionKeys.filter((kind) => evolution[kind] > 0);
  evolutionReadout.hidden = !selected.length;
  evolutionReadout.textContent = selected.map((kind) => evolutionNames[kind] + " " + evolution[kind] + "级").join("  ·  ");
}
function evolutionCardDetails(kind) {
  if (kind === "heal") return { name: "紧急修复", level: "战后补给", effect: "恢复 1 点生命，最多 3 点。", art: "让赤焰战机重新投入战斗。", disabled: player.lives >= playerRules.maxLives };
  if (kind === "shield") return { name: "护盾补给", level: "战后补给", effect: "获得 1 次护盾，最多储存 2 次。", art: "为下一轮联合攻势预留一次保护。", disabled: shield.charges >= shieldRules.maxCharges };
  if (kind === "red") return { name: "火力补给", level: "战后补给", effect: "立即获得一次红色能量球的伤害强化。", art: "强化幅度随当前战斗时间成长。", disabled: false };
  const current = evolution[kind], next = Math.min(3, current + 1), complete = current >= 3;
  const level = complete ? "已达最高 · 3级" : current + "级 → " + next + "级";
  if (kind === "pierce") return { name: evolutionNames[kind], level, effect: "主炮伤害提高 " + [0, 25, 45, 65][next] + "%，额外穿透 " + next + " 个敌人，沿途伤害不衰减。", art: "青白翼刃逐级展开，3 级成为修长的破阵终式。", disabled: complete };
  if (kind === "blast") return { name: evolutionNames[kind], level, effect: "命中触发 " + [0, 1, 1.5, 2][next] + " 倍子弹伤害的范围爆破；击杀爆破提高至 " + (next + 1) + " 倍。", art: "共享冷却 " + [0, .65, .55, .45][next] + " 秒，范围 " + (85 + next * 20) + "。首领单次上限 " + [0, 1, 1.25, 1.5][next] + "%；重炮机身逐级展开。", disabled: complete };
  return { name: evolutionNames[kind], level, effect: "立即获得 1 次护盾，充能缩短至 " + [25, 20, 17, 14][next] + " 秒；开盾清弹并向前反击。", art: "清弹范围 " + (130 + next * 50) + "，反击造成基础主炮每秒伤害的 " + [0, 55, 80, 105][next] + "%，首领上限 " + [0, 3, 4, 5][next] + "%。激光与雷区不被清除。", disabled: complete };
}
function focusEvolutionCard(preferred = evolution.choice) {
  const card = evolutionCards.find((entry) => entry.dataset.choice === preferred && !entry.disabled)
    || evolutionCards.find((entry) => !entry.disabled);
  if (card) card.focus({ preventScroll: true });
}
function refreshEvolutionChoice() {
  if (!evolution.pending) return;
  const allComplete = evolutionAllComplete();
  evolutionTitle.textContent = allComplete ? "进化已完成，整备再出击" : "首领击破，选择战机进化";
  evolutionDescription.textContent = allComplete
    ? "选择一份战后补给。战斗已暂停，准备好后继续突围。"
    : "本局效果可以叠加，每条路线最多 3 级。战斗已暂停，选好再出发。";
  evolutionCards.forEach((card, index) => {
    const kind = allComplete ? ["heal", "shield", "red"][index] : evolutionKeys[index];
    const details = evolutionCardDetails(kind);
    card.dataset.choice = kind;
    card.dataset.tone = allComplete ? ["heal", "aegis", "blast"][index] : kind;
    card.disabled = details.disabled;
    card.querySelector(".evolution-card-level").textContent = details.level;
    card.querySelector(".evolution-card-title").textContent = details.name;
    card.querySelector(".evolution-card-effect").textContent = details.effect;
    card.querySelector(".evolution-card-art").textContent = details.art;
    card.querySelector(".evolution-card-action").textContent = details.disabled ? (allComplete ? (kind === "heal" ? "生命已满" : "已储满") : "本路线已完成") : "选择";
  });
  if (!evolutionScreen.contains(document.activeElement) || document.activeElement.disabled) focusEvolutionCard();
}
function setEvolutionBackgroundInert(inert) {
  if (inert) {
    for (const selector of ["#game-canvas", ".masthead", "#battle-screen", "#start-screen", "#game-over-screen", ".lesson-note"]) {
      const element = document.querySelector(selector);
      if (element) { evolutionBackground.set(element, element.inert); element.inert = true; }
    }
  } else {
    for (const [element, previous] of evolutionBackground) element.inert = previous;
    evolutionBackground.clear();
  }
}
function openEvolutionChoice() {
  if (state !== "battle" || evolution.pending) return false;
  evolution.pending = true;
  evolution.choice = "";
  clearMovement();
  cancelUltimate(true);
  bullets.length = 0;
  bossProjectiles.length = 0;
  bossHazards.length = 0;
  enemyProjectiles.length = 0;
  evolution.pulses.length = 0;
  movementHint.hidden = true;
  evolutionScreen.hidden = false;
  setEvolutionBackgroundInert(true);
  refreshEvolutionChoice();
  updatePauseHint();
  statusMessage.textContent = "首领已击破，战斗暂停。请选择一项战机进化。";
  return true;
}
function chooseEvolution(kind) {
  if (!evolution.pending) return false;
  const complete = evolutionAllComplete();
  if (complete ? !["heal", "shield", "red"].includes(kind) : !evolutionKeys.includes(kind)) return false;
  if (evolutionCardDetails(kind).disabled) return false;
  // 先关闭待选状态，双击或按键连发不会重复领取。
  evolution.pending = false;
  evolution.choice = kind;
  let message;
  if (!complete) {
    const shieldProgress = shield.energy / evolutionShieldChargeTime();
    evolution[kind]++;
    if (kind === "aegis") {
      shield.charges = Math.min(shieldRules.maxCharges, shield.charges + 1);
      shield.energy = shield.charges === shieldRules.maxCharges ? 0 : shieldProgress * evolutionShieldChargeTime();
      updateShieldDisplay();
    }
    updateWeaponDisplay();
    message = evolutionNames[kind] + "进化至 " + evolution[kind] + " 级";
  } else if (kind === "heal") {
    player.lives = Math.min(playerRules.maxLives, player.lives + 1);
    updateLifeDisplay();
    message = "战后修复 · 恢复 1 点生命";
  } else if (kind === "shield") {
    shield.charges = Math.min(shieldRules.maxCharges, shield.charges + 1);
    if (shield.charges === shieldRules.maxCharges) shield.energy = 0;
    updateShieldDisplay();
    message = "战后补给 · 护盾次数 +1";
  } else {
    applyPowerup("red");
    message = "战后补给 · 火力强化完成";
  }
  evolutionScreen.hidden = true;
  setEvolutionBackgroundInert(false);
  clearMovement();
  // 战后弹幕已清空，短暂保护保证恢复焦点时有准备空间。
  bossHitGrace = Math.max(bossHitGrace, 1.5);
  updateEvolutionDisplay();
  powerupNotice.textContent = message;
  powerupNotice.dataset.type = kind === "pierce" ? "blue" : kind === "heal" ? "heal" : "red";
  powerupNotice.hidden = false;
  upgradeNoticeTime = 3;
  statusMessage.textContent = message + "。战斗继续。";
  canvas.focus({ preventScroll: true });
  updatePauseHint();
  return true;
}
function resetEvolution() {
  evolution.pending = false;
  evolution.pierce = 0; evolution.blast = 0; evolution.aegis = 0;
  evolution.choice = ""; evolution.pulses.length = 0;
  evolutionBlastCooldown = 0;
  evolutionScreen.hidden = true;
  setEvolutionBackgroundInert(false);
  updateEvolutionDisplay();
}
function addEvolutionPulse(x, y, radius, color, duration) {
  if (evolution.pulses.length >= 16) evolution.pulses.shift();
  evolution.pulses.push({ x, y, radius, color, age: 0, duration });
}
function triggerEvolutionBlast(center, bullet, multiplier, excluded = null) {
  if (!evolution.blast || evolutionBlastCooldown > 0 || !bullet || bullet.source === "ultimate" || bullet.source === "blast") return false;
  evolutionBlastCooldown = [0, .65, .55, .45][evolution.blast];
  const radius = 85 + evolution.blast * 20;
  const damageLog = (bullet.damageLog ?? Math.log(bullet.damage ?? projectileDamage())) + Math.log(multiplier);
  const blastShot = { source: "blast", damageLog, x: center.x, y: center.y };
  addEvolutionPulse(center.x, center.y, radius, "#ff914f", 0.38);
  // 对象快照配合重新取下标，连锁击杀改变数组时仍只结算一次。
  const targets = enemies.filter((enemy) => enemy !== excluded && enemy.hp > 0 && Math.hypot(enemy.x - center.x, enemy.y - center.y) <= radius);
  for (const enemy of targets) {
    if (!enemies.includes(enemy)) continue;
    applyEnemyHit(enemy, blastShot);
    if (enemy.hp <= 0) defeatEnemy(enemies.indexOf(enemy), blastShot);
  }
  const bossCap = [0, .01, .0125, .015][evolution.blast];
  for (const target of activeBosses()) {
    const edgeDistance = Math.hypot(target.x - center.x, target.y - center.y) - Math.min(target.width, target.height) * 0.3;
    if (target.hp > 0 && edgeDistance <= radius) applyBossHit({ ...blastShot, damageLog: Math.min(damageLog, target.healthLog + Math.log(bossCap)) }, target);
  }
  return true;
}
function applyEvolutionBlast(fallen, bullet) {
  return triggerEvolutionBlast(fallen, bullet, evolution.blast + 1, fallen);
}
function onEvolutionHit(target, bullet) {
  if (!target || target.hp <= 0) return false;
  return triggerEvolutionBlast(target, bullet, [0, 1, 1.5, 2][evolution.blast]);
}
function onEvolutionShield() {
  if (!evolution.aegis) return;
  const radius = 130 + evolution.aegis * 50;
  for (const shots of [bossProjectiles, enemyProjectiles]) {
    for (let index = shots.length - 1; index >= 0; index--) {
      if (Math.hypot(shots[index].x - player.x, shots[index].y - player.y) <= radius) shots.splice(index, 1);
    }
  }
  addEvolutionPulse(player.x, player.y, radius, "#ffd09c", 0.45);
  const halfHeight = 110 + evolution.aegis * 20;
  const counterLog = weaponDamageLog() + Math.log(weapon.lanes) - Math.log(weapon.interval) + Math.log([0, .55, .8, 1.05][evolution.aegis]);
  const counter = { source: "blast", damageLog: counterLog, x: player.x, y: player.y };
  const inFront = (target) => target.x + target.width * .4 >= player.x && target.x - target.width * .4 <= viewport.width && Math.abs(target.y - player.y) <= halfHeight + target.height * .33;
  addEvolutionPulse(player.x, player.y, halfHeight, "#ffd687", .32);
  Object.assign(evolution.pulses[evolution.pulses.length - 1], { direction: "front", length: Math.max(0, viewport.width - player.x) });
  for (const enemy of enemies.filter(target => target.hp > 0 && inFront(target))) {
    if (!enemies.includes(enemy)) continue;
    applyEnemyHit(enemy, counter);
    if (enemy.hp <= 0) defeatEnemy(enemies.indexOf(enemy), counter);
  }
  const bossCap = [0, .03, .04, .05][evolution.aegis];
  for (const target of activeBosses()) {
    if (target.hp > 0 && inFront(target)) applyBossHit({ ...counter, damageLog: Math.min(counterLog, target.healthLog + Math.log(bossCap)) }, target);
  }
}
function updateEvolution(seconds) {
  if (!isBattleActive() || !Number.isFinite(seconds) || seconds <= 0) return;
  evolutionBlastCooldown = Math.max(0, evolutionBlastCooldown - seconds);
  for (let index = evolution.pulses.length - 1; index >= 0; index--) {
    evolution.pulses[index].age += seconds;
    if (evolution.pulses[index].age >= evolution.pulses[index].duration) evolution.pulses.splice(index, 1);
  }
}
function drawEvolution() {
  if (state !== "battle") return;
  for (const pulse of evolution.pulses) {
    const progress = Math.min(1, pulse.age / pulse.duration);
    context.save();
    context.globalAlpha = (1 - progress) * (reducedMotion.matches ? 0.35 : 0.7);
    context.strokeStyle = pulse.color; context.lineWidth = 2.5 - progress;
    if (pulse.direction === "front") {
      // 反击波完整覆盖前方判定带；亮边向右推进，范围不随动画改变。
      context.globalAlpha *= reducedMotion.matches ? .5 : .7;
      context.fillStyle = pulse.color;
      context.fillRect(pulse.x, pulse.y - pulse.radius, pulse.length, pulse.radius * 2);
      context.globalAlpha = (1 - progress) * .75;
      const edge = pulse.x + pulse.length * (reducedMotion.matches ? .65 : progress);
      context.beginPath(); context.moveTo(edge, pulse.y - pulse.radius); context.quadraticCurveTo(edge + 25, pulse.y, edge, pulse.y + pulse.radius); context.stroke();
    } else {
      context.beginPath(); context.arc(pulse.x, pulse.y, pulse.radius * (0.22 + progress * 0.78), 0, Math.PI * 2); context.stroke();
    }
    context.restore();
  }
}

evolutionCards.forEach((card) => {
  card.addEventListener("click", () => chooseEvolution(card.dataset.choice));
  card.addEventListener("focus", () => { if (evolution.pending) evolution.choice = card.dataset.choice; });
});
document.addEventListener("keydown", (event) => {
  if (!evolution.pending || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === "Escape") { event.preventDefault(); return; }
  if (event.repeat && ["Enter", "Space", "Digit1", "Digit2", "Digit3", "Numpad1", "Numpad2", "Numpad3"].includes(event.code)) { event.preventDefault(); return; }
  if (["Digit1", "Digit2", "Digit3", "Numpad1", "Numpad2", "Numpad3"].includes(event.code)) {
    event.preventDefault();
    const card = evolutionCards[Number(event.code.slice(-1)) - 1];
    if (!card.disabled) chooseEvolution(card.dataset.choice);
  } else if (event.code === "Tab") {
    event.preventDefault();
    const enabled = evolutionCards.filter((card) => !card.disabled);
    const current = enabled.indexOf(document.activeElement);
    const next = current < 0 ? 0 : (current + (event.shiftKey ? -1 : 1) + enabled.length) % enabled.length;
    enabled[next]?.focus({ preventScroll: true });
  }
}, true);
document.addEventListener("focusin", (event) => {
  if (evolution.pending && !evolutionScreen.contains(event.target)) focusEvolutionCard();
});
