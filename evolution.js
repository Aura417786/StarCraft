"use strict";

// 路线等级、跨路线联动和超限整备只在本局有效。
const evolution = { pierce: 0, blast: 0, aegis: 0, pending: false, choice: "", pulses: [],
  links: { falcon: false, phalanx: false, lance: false }, overclock: 0, refits: 0 };
const evolutionScreen = document.querySelector("#evolution-screen");
const evolutionTitle = document.querySelector("#evolution-title");
const evolutionDescription = document.querySelector("#evolution-description");
const evolutionReadout = document.querySelector("#evolution-readout");
const evolutionKeys = ["pierce", "blast", "aegis"];
const evolutionCards = evolutionKeys.map((kind) => document.querySelector("#evolution-card-" + kind));
const evolutionNames = { pierce: "破阵翼刃", blast: "星隼僚机", aegis: "赤金壁垒" };
const evolutionEnglishNames = { pierce: "Piercing Wings", blast: "Falcon Wingman", aegis: "Crimson Aegis" };
const evolutionLinks = {
  falcon: { name: "锋隼联动", nameEn: "Falcon Pierce Link", effect: "两架星隼的射击伤害提高 15%，并可多穿透一个目标。",
    effectEn: "Both Falcons deal 15% more damage and pierce one extra target.", art: "翼刃校准星隼火控，齐射可击穿前排。",
    artEn: "Piercing Wings tune the Falcons' guns to shoot through the front line.", tone: "blast" },
  phalanx: { name: "隼盾联动", nameEn: "Falcon Shield Link", effect: "开盾后 2.4 秒内，两架星隼每轮都发射三连齐射。",
    effectEn: "Both Falcons fire triple bursts for 2.4 seconds after you activate your shield.", art: "利用护盾争取一段集中反攻时间。",
    artEn: "Use your shield to open a short window for concentrated fire.", tone: "aegis" },
  lance: { name: "锋盾联动", nameEn: "Aegis Lance Link", effect: "吸收后发射的反击弹变为穿甲矛，伤害提高 50%，额外穿透两个目标。",
    effectEn: "Absorbed shots fire back as lances that deal 50% more damage and pierce two extra targets.",
    art: "金色反击矛沿前方弹道贯穿。", artEn: "Golden lances pierce enemies ahead.", tone: "pierce" },
};
const evolutionRefits = {
  "refit-fire": { name: "火力整备", nameEn: "Firepower Refit", factor: 1.08, effect: "本局辅助武器伤害提高 8%。",
    effectEn: "Deal 8% more auxiliary weapon damage this run.", tone: "blast" },
  "refit-heal": { name: "战地修复", nameEn: "Field Repairs", factor: 1.04, effect: "恢复 1 点生命，本局辅助武器伤害提高 4%。",
    effectEn: "Restore one life and deal 4% more auxiliary weapon damage this run.", tone: "heal" },
  "refit-shield": { name: "护盾整备", nameEn: "Shield Refit", factor: 1.04, effect: "补充 1 次护盾，本局辅助武器伤害提高 4%。",
    effectEn: "Gain one shield charge and deal 4% more auxiliary weapon damage this run.", tone: "aegis" },
};
const evolutionBackground = new Map();

function evolutionName(kind) { return tr(evolutionNames[kind], evolutionEnglishNames[kind]); }
function evolutionPierceCount() { return evolution.pierce; }
function evolutionMainDamageMultiplier() { return [1, 1.25, 1.45, 1.65][evolution.pierce]; }
function evolutionShieldChargeTime() { return [25, 20, 17, 14][evolution.aegis]; }
function evolutionAllComplete() { return evolutionKeys.every((kind) => evolution[kind] >= 3); }
function evolutionChoiceOptions() {
  if (!evolutionAllComplete()) return evolutionKeys;
  const links = Object.keys(evolutionLinks);
  return links.every(kind => evolution.links[kind]) ? Object.keys(evolutionRefits) : links;
}
function updateEvolutionDisplay() {
  const selected = evolutionKeys.filter(kind => evolution[kind] > 0)
    .map(kind => evolutionName(kind) + tr(" " + evolution[kind] + "级", " Lv. " + evolution[kind]));
  const linked = Object.values(evolution.links).filter(Boolean).length;
  if (linked) selected.push(tr("联动 " + linked + "/3", "Links " + linked + "/3"));
  if (evolution.refits) selected.push(tr("超限 " + evolution.refits + " 次", "Refits " + evolution.refits));
  evolutionReadout.hidden = !selected.length;
  evolutionReadout.textContent = selected.join("  ·  ");
}
function evolutionCardDetails(kind) {
  const link = evolutionLinks[kind];
  if (link) return { ...link, name: tr(link.name, link.nameEn), effect: tr(link.effect, link.effectEn), art: tr(link.art, link.artEn),
    level: tr("双路线联动", "Evolution link"), disabled: evolution.links[kind], unavailable: tr("已激活", "Activated") };
  const refit = evolutionRefits[kind];
  if (refit) {
    const healing = kind === "refit-heal", shielding = kind === "refit-shield";
    const disabled = (healing && player.lives >= playerRules.maxLives) || (shielding && shield.charges >= shieldRules.maxCharges);
    const damage = progressionFormatLog(evolution.overclock);
    return { ...refit, name: tr(refit.name, refit.nameEn), effect: tr(refit.effect, refit.effectEn),
      level: tr("超限整备 · " + (evolution.refits + 1), "Overlimit Refit · " + (evolution.refits + 1)),
      art: tr("当前辅助伤害 ×" + damage + "，提升可持续叠加。", "Current auxiliary damage ×" + damage + ". Bonuses stack."),
      disabled, unavailable: healing ? tr("生命已满", "Full health") : tr("已储满", "Fully charged") };
  }
  const current = evolution[kind], next = Math.min(3, current + 1), complete = current >= 3;
  const level = complete ? tr("已达最高 · 3级", "Max level · Lv. 3")
    : tr(current + "级 → " + next + "级", "Lv. " + current + " → " + next);
  const details = { name: evolutionName(kind), level, tone: kind, disabled: complete, unavailable: tr("本路线已完成", "Path complete") };
  if (kind === "pierce") return { ...details,
    effect: ["", tr("展开双翼副炮，持续向前齐射。", "Deploy two wing cannons that fire forward continuously."),
      tr("双翼定期蓄能，发射可穿过多架敌机的重型穿甲弹。", "Wing cannons periodically charge and fire heavy shots that pierce multiple enemies."),
      tr("双翼重射更频繁，穿甲弹火力与穿透提升。", "Heavy wing shots fire more often, hit harder, and pierce more enemies.")][next],
    art: tr("主炮伤害 +" + [0, 25, 45, 65][next] + "% · 额外穿透 " + next + " 个目标。",
      "Main gun +" + [0, 25, 45, 65][next] + "% damage · Pierces " + next + (next === 1 ? " extra target" : " extra targets")) };
  if (kind === "blast") return { ...details,
    effect: ["", tr("一架星隼伴飞，自动瞄准前方敌人。", "One Falcon follows you and automatically targets enemies ahead."),
      tr("两架星隼从上下两侧协同射击。", "Two Falcons fire together from above and below your fighter."),
      tr("双星隼每三轮触发一次三连齐射。", "Both Falcons fire triple bursts every third volley.")][next],
    art: tr("僚机无碰撞判定，跟随战机移动。", "Wingmen follow your fighter and cannot collide with other ships.") };
  return { ...details,
    effect: tr("护盾接住最多 " + [0, 3, 5, 8][next] + " 发实体敌弹，结束时化为金色反击齐射。",
      "Absorb up to " + [0, 3, 5, 8][next] + " enemy projectiles and fire them back when the shield ends."),
    art: tr("立即补充 1 次护盾 · " + [25, 20, 17, 14][next] + " 秒充能 · 保留开盾清弹与反击。",
      "+1 shield charge · " + [25, 20, 17, 14][next] + "s recharge · Clears bullets and counters on activation.") };
}
function focusEvolutionCard(preferred = evolution.choice) {
  const card = evolutionCards.find((entry) => entry.dataset.choice === preferred && !entry.disabled)
    || evolutionCards.find((entry) => !entry.disabled);
  if (card) card.focus({ preventScroll: true });
}
function refreshEvolutionChoice() {
  if (!evolution.pending) return;
  const options = evolutionChoiceOptions();
  if (options === evolutionKeys) {
    evolutionTitle.textContent = tr("首领击破，选择战机进化", "Boss defeated. Choose an evolution.");
    evolutionDescription.textContent = tr("每条路线最多 3 级，能力可以叠加。战斗已暂停，选好再出发。",
      "Each path has three levels. Abilities stack. Choose one to resume combat.");
  } else if (options[0] === "falcon") {
    evolutionTitle.textContent = tr("三路线满级，选择联动", "All paths maxed. Choose a link.");
    evolutionDescription.textContent = tr("每种联动可激活一次，效果持续到本局结束。", "Each link can be activated once and lasts for the rest of the run.");
  } else {
    evolutionTitle.textContent = tr("超限整备", "Overlimit Refit");
    evolutionDescription.textContent = tr("每次整备都会继续强化辅助武器。", "Each refit further boosts your auxiliary weapons.");
  }
  evolutionCards.forEach((card, index) => {
    const kind = options[index];
    const details = evolutionCardDetails(kind);
    card.dataset.choice = kind;
    card.dataset.tone = details.tone;
    card.disabled = details.disabled;
    card.querySelector(".evolution-card-level").textContent = details.level;
    card.querySelector(".evolution-card-title").textContent = details.name;
    card.querySelector(".evolution-card-effect").textContent = details.effect;
    card.querySelector(".evolution-card-art").textContent = details.art;
    card.querySelector(".evolution-card-action").textContent = details.disabled ? details.unavailable : tr("选择", "Select");
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
  clearEvolutionWeaponTransients();
  movementHint.hidden = true;
  evolutionScreen.hidden = false;
  setEvolutionBackgroundInert(true);
  refreshEvolutionChoice();
  updatePauseHint();
  statusMessage.textContent = tr("首领已击破，战斗暂停。请选择一项战机进化。", "Boss defeated. Combat paused. Choose a fighter evolution.");
  return true;
}
function chooseEvolution(kind) {
  if (!evolution.pending || !evolutionChoiceOptions().includes(kind)) return false;
  if (evolutionCardDetails(kind).disabled) return false;
  // 先关闭待选状态，双击或按键连发不会重复领取。
  evolution.pending = false;
  evolution.choice = kind;
  let message;
  if (evolutionKeys.includes(kind)) {
    const shieldProgress = shield.energy / evolutionShieldChargeTime();
    evolution[kind]++;
    if (kind === "aegis") {
      shield.charges = Math.min(shieldRules.maxCharges, shield.charges + 1);
      shield.energy = shield.charges === shieldRules.maxCharges ? 0 : shieldProgress * evolutionShieldChargeTime();
      updateShieldDisplay();
    }
    updateWeaponDisplay();
    onEvolutionUpgrade(kind);
    message = evolutionName(kind) + tr("进化至 " + evolution[kind] + " 级", " reached level " + evolution[kind]);
  } else if (evolutionLinks[kind]) {
    evolution.links[kind] = true;
    const link = evolutionLinks[kind];
    message = tr(link.name + "已激活", link.nameEn + " activated");
  } else {
    const refit = evolutionRefits[kind];
    evolution.overclock += Math.log(refit.factor);
    evolution.refits++;
    if (kind === "refit-heal") {
      player.lives = Math.min(playerRules.maxLives, player.lives + 1);
      updateLifeDisplay();
    } else if (kind === "refit-shield") {
      shield.charges = Math.min(shieldRules.maxCharges, shield.charges + 1);
      if (shield.charges === shieldRules.maxCharges) shield.energy = 0;
      updateShieldDisplay();
    }
    message = tr(refit.name + " · " + refit.effect, refit.nameEn + " · " + refit.effectEn);
  }
  evolutionScreen.hidden = true;
  setEvolutionBackgroundInert(false);
  clearMovement();
  // 战后弹幕已清空，短暂保护保证恢复焦点时有准备空间。
  bossHitGrace = Math.max(bossHitGrace, 1.5);
  updateEvolutionDisplay();
  powerupNotice.textContent = message;
  powerupNotice.dataset.type = kind === "pierce" || kind === "lance" ? "blue" : kind === "refit-heal" ? "heal" : "red";
  powerupNotice.hidden = false;
  upgradeNoticeTime = 3;
  statusMessage.textContent = message + tr("。战斗继续。", " Combat resumes.");
  canvas.focus({ preventScroll: true });
  updatePauseHint();
  return true;
}
function resetEvolution() {
  evolution.pending = false;
  evolution.pierce = 0; evolution.blast = 0; evolution.aegis = 0;
  evolution.choice = ""; evolution.pulses.length = 0;
  for (const kind of Object.keys(evolution.links)) evolution.links[kind] = false;
  evolution.overclock = 0; evolution.refits = 0;
  resetEvolutionWeapons();
  evolutionScreen.hidden = true;
  setEvolutionBackgroundInert(false);
  updateEvolutionDisplay();
}
function addEvolutionPulse(x, y, radius, color, duration) {
  if (evolution.pulses.length >= 16) evolution.pulses.shift();
  evolution.pulses.push({ x, y, radius, color, age: 0, duration });
}
function onEvolutionShield() {
  if (!evolution.aegis) return;
  if (evolution.links.phalanx) {
    evolutionWeapons.shieldLinkRemaining = 2.4;
    evolutionWeapons.droneCooldown = Math.min(evolutionWeapons.droneCooldown, .08);
  }
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
