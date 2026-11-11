"use strict";

// Old numeric fields remain zero for archived build/render compatibility.
// New sorties choose exactly one route; only its rank may then increase.
const evolution = { route: "", level: 0, cooldown: 0, frozenRemaining: 0, skillFlash: 0,
  pierce: 0, blast: 0, aegis: 0, capstone: "", resetUsed: false, reassignments: 0,
  resetConfirm: false, pending: false, choice: "", pulses: [],
  links: { falcon: false, phalanx: false, lance: false }, refits: 0 };
const evolutionScreen = document.querySelector("#evolution-screen");
const evolutionTitle = document.querySelector("#evolution-title");
const evolutionDescription = document.querySelector("#evolution-description");
const evolutionReadout = document.querySelector("#evolution-readout");
const evolutionKeys = ["ember", "frost", "rewind"];
const evolutionCards = ["pierce", "blast", "aegis"].map(kind => document.querySelector("#evolution-card-" + kind));
const evolutionNames = { ember: "烬火焚心", frost: "极寒风暴", rewind: "时隙回溯" };
const evolutionEnglishNames = { ember: "Heartfire Detonation", frost: "Absolute Blizzard", rewind: "Temporal Recall" };
const evolutionColors = { ember: "#ff754c", frost: "#7eeaff", rewind: "#c0a0ff" };
const evolutionBackground = new Map();
const evolutionResetButton = document.createElement("button");
evolutionResetButton.hidden = true;
const evolutionRefits = {};

function evolutionName(kind) { return tr(evolutionNames[kind] ?? kind, evolutionEnglishNames[kind] ?? kind); }
function evolutionPierceCount() { return 0; }
function evolutionShieldChargeTime() { return 25 * (typeof sortieRules === "function" ? sortieRules().shieldRate ?? 1 : 1); }
function evolutionRanksSpent() { return evolution.level; }
function evolutionRankBlocked(kind) { return !!evolution.route && evolution.route !== kind; }
function evolutionChoiceOptions() { return evolutionKeys; }
function canRespecEvolution() { return false; }
function respecEvolution() { return false; }
function refreshEvolutionLinks() { for (const key of Object.keys(evolution.links)) evolution.links[key] = false; }
function evolutionSkillSpec(route = evolution.route, rank = evolution.level) {
  const level = Math.max(1, Number(rank) || 1), growth = Math.log2(level);
  if (route === "ember") return { cooldown: 12, stacks: 8 + Math.floor(3 * growth),
    seconds: 3.2 + .7 * growth, bossCap: .075 + .145 * (1 - Math.exp(-growth / 5)) };
  if (route === "frost") {
    const duration = 1.8 + .9 * growth;
    return { duration, cooldown: 16 + 2 * duration };
  }
  const duration = 3 + (level - 1) * .5;
  return { duration, cooldown: Math.max(18, 8 + duration * 2.5) };
}
function evolutionPowerMultiplier() {
  return !evolution.route ? 1 : 1 + Math.log2(1 + evolution.level) * (evolution.route === "ember" ? .10 : .055);
}
function evolutionIsFrozen() { return evolution.frozenRemaining > 1e-8; }
function evolutionSkillKey() { return typeof controlBindingLabel === "function" ? controlBindingLabel("focus") : "F"; }
function updateEvolutionDisplay() {
  evolutionReadout.hidden = !evolution.route;
  if (!evolution.route) { evolutionReadout.textContent = ""; return; }
  const cd = Math.ceil(evolution.cooldown * 10) / 10;
  const label = cd > 0 ? tr("冷却 " + cd.toFixed(1) + " 秒", "Cooldown " + cd.toFixed(1) + "s")
    : tr(evolutionSkillKey() + " 释放", evolutionSkillKey() + " ready");
  const freeze = evolutionIsFrozen() ? tr(" · 冰封 " + evolution.frozenRemaining.toFixed(1) + " 秒",
    " · Frozen " + evolution.frozenRemaining.toFixed(1) + "s") : "";
  const text = evolutionName(evolution.route) + " · Lv " + evolution.level + " · " + label + freeze;
  if (evolutionReadout.textContent !== text) evolutionReadout.textContent = text;
  evolutionReadout.dataset.route = evolution.route;
}
function evolutionCardDetails(kind) {
  const current = evolution.route === kind ? evolution.level : 0, next = current + 1;
  const spec = evolutionSkillSpec(kind, next), key = evolutionSkillKey();
  const effect = kind === "ember"
    ? tr("命中叠焰，最多 " + spec.stacks + " 层。" + key + " 引爆所有标记目标，层数越高爆发越强；冷却 12 秒。",
      "Hits stack up to " + spec.stacks + " flames. " + key + " detonates marked enemies; damage grows with stacks. 12s cooldown.")
    : kind === "frost"
    ? tr(key + " 冻结全场敌军与攻击 " + spec.duration.toFixed(1) + " 秒，自己可移动和开火；冷却 " + spec.cooldown.toFixed(1) + " 秒。",
      key + " freezes all hostiles and attacks for " + spec.duration.toFixed(1) + "s. You can move and fire; " + spec.cooldown.toFixed(1) + "s cooldown.")
    : tr(key + " 将当前战斗片段回溯 " + spec.duration.toFixed(1) + " 秒，恢复场面与生命；冷却 " + spec.cooldown.toFixed(1) + " 秒。",
      key + " rewinds this combat segment by " + spec.duration.toFixed(1) + "s, restoring the battlefield and lives; " + spec.cooldown.toFixed(1) + "s cooldown.");
  return { name: evolutionName(kind), level: tr(current + "级 → " + next + "级", "Lv " + current + " → " + next),
    effect, tone: kind, disabled: evolutionRankBlocked(kind),
    art: kind === "rewind" ? tr("每级 +0.5 秒。限本阶段；不返还冷却，使用后计辅助纪录。", "Each rank adds 0.5s. Phase boundaries apply; no cooldown refund. Assisted records after use.")
      : tr("本局只选一条路线 · 等级无上限 · 成长逐渐放缓", "One route per sortie · Unlimited ranks · Diminishing growth"),
    unavailable: tr("本局已锁定其他路线", "Another route is locked in") };
}
function focusEvolutionCard(preferred = evolution.choice) {
  (evolutionCards.find(card => card.dataset.choice === preferred && !card.disabled)
    || evolutionCards.find(card => !card.disabled))?.focus({ preventScroll: true });
}
function refreshEvolutionChoice() {
  if (!evolution.pending) return;
  evolutionTitle.textContent = evolution.route ? tr("首领击破，强化专属路线", "Boss defeated. Upgrade your route.")
    : tr("首领击破，选择专属路线", "Boss defeated. Choose your route.");
  evolutionDescription.textContent = tr("本局只能选择一条进化路线，后续继续升级该路线，等级无上限。按 " + evolutionSkillKey() + " 使用专属技能。",
    "Choose one route for this sortie. Future evolutions upgrade it without a rank cap. " + evolutionSkillKey() + " activates its skill.");
  evolutionCards.forEach((card, index) => {
    const kind = evolutionKeys[index], details = evolutionCardDetails(kind);
    card.dataset.choice = kind; card.dataset.tone = kind; card.disabled = details.disabled;
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
  } else { for (const [element, previous] of evolutionBackground) element.inert = previous; evolutionBackground.clear(); }
}
function openEvolutionChoice() {
  if (state !== "battle" || evolution.pending) return false;
  if (typeof resetBattleRewind === "function") resetBattleRewind("evolution");
  evolution.pending = true; evolution.choice = evolution.route;
  clearMovement(); cancelUltimate(true);
  bullets.length = bossProjectiles.length = bossHazards.length = enemyProjectiles.length = 0;
  evolution.pulses.length = 0;
  clearEvolutionWeaponTransients(); clearFighterCombatTransients();
  movementHint.hidden = true; evolutionScreen.hidden = false;
  setEvolutionBackgroundInert(true); refreshEvolutionChoice(); updatePauseHint();
  statusMessage.textContent = tr("战斗暂停。选择或强化本局唯一的进化路线。", "Combat paused. Choose or upgrade your one evolution route.");
  return true;
}
function chooseEvolution(kind) {
  if (!evolution.pending || !evolutionKeys.includes(kind) || evolutionRankBlocked(kind)) return false;
  evolution.route = kind; evolution.level++; evolution.choice = kind;
  evolution.pending = false; evolutionScreen.hidden = true;
  setEvolutionBackgroundInert(false); clearMovement();
  bossHitGrace = Math.max(bossHitGrace, 1.5);
  updateEvolutionDisplay(); updateFiringStyleDisplay(); updateWeaponDisplay();
  powerupNotice.textContent = evolutionName(kind) + tr(" 升至 " + evolution.level + " 级", " upgraded to Lv " + evolution.level);
  powerupNotice.dataset.type = kind === "frost" ? "blue" : "red";
  powerupNotice.hidden = false; upgradeNoticeTime = 3; statusMessage.textContent = powerupNotice.textContent;
  if (typeof resetBattleRewind === "function") resetBattleRewind("evolution");
  canvas.focus({ preventScroll: true }); updatePauseHint();
  if (typeof completeFlightTutorialEvolution === "function") completeFlightTutorialEvolution();
  return true;
}
function resetEvolution() {
  Object.assign(evolution, { route: "", level: 0, cooldown: 0, frozenRemaining: 0, skillFlash: 0,
    pending: false, pierce: 0, blast: 0, aegis: 0, choice: "", capstone: "", resetUsed: false,
    resetConfirm: false, reassignments: 0, refits: 0 });
  evolution.pulses.length = 0; refreshEvolutionLinks(); resetEvolutionWeapons();
  evolutionScreen.hidden = true; setEvolutionBackgroundInert(false); updateEvolutionDisplay();
}
function addEvolutionPulse(x, y, radius, color, duration) {
  if (evolution.pulses.length >= 16) evolution.pulses.shift();
  evolution.pulses.push({ x, y, radius, color, age: 0, duration });
}
function onEvolutionShield() {}
function onEvolutionDamaged() {}
function registerEvolutionHit(target, shot) {
  if (evolution.route !== "ember" || target.hp <= 0 || shot.source === "evolution-ember") return;
  if (battleTime < (target.emberNext ?? -1)) return;
  target.emberStacks = Math.min(evolutionSkillSpec().stacks, (target.emberStacks ?? 0) + 1);
  target.emberNext = battleTime + .12; target.emberUntil = battleTime + 8;
}
function requestEvolutionSkill() {
  if (!isBattleActive() || !evolution.route || evolution.cooldown > 1e-8) return false;
  const spec = evolutionSkillSpec();
  if (evolution.route === "ember") {
    const targets = [...enemies, ...(boss ? [boss] : [])].filter(target => target.hp > 0
      && target.emberStacks > 0 && target.emberUntil > battleTime && (target !== boss || bossCanTakeDamage(target)));
    if (!targets.length) {
      statusMessage.textContent = tr("先命中敌人叠加火焰，再使用引爆。", "Hit enemies to stack flames before detonating.");
      return false;
    }
    evolution.cooldown = spec.cooldown;
    for (const target of targets) {
      const stacks = target.emberStacks; target.emberStacks = 0;
      const damageLog = evolutionBaseDpsLog() + Math.log(spec.seconds * stacks / 4);
      const shot = { source: "evolution-ember", damageLog, noEnergy: true, y: target.y, x: target.x,
        emberCap: spec.bossCap * Math.min(1, stacks / 8), color: evolutionColors.ember };
      if (target === boss) applyBossHit(shot, target);
      else { applyEnemyHit(target, shot); if (target.hp <= 0) defeatEnemy(enemies.indexOf(target)); }
      combatBurst(target.x, target.y, target === boss ? 1.3 : .65, evolutionColors.ember, true);
      addEvolutionPulse(target.x, target.y, target.width * .65, "#ffc280", .5);
    }
  } else if (evolution.route === "frost") {
    evolution.cooldown = spec.cooldown; evolution.frozenRemaining = spec.duration;
    gameAudio.perfectShield?.();
  } else {
    if (typeof requestBattleRewind !== "function" || !requestBattleRewind(spec.duration, spec.cooldown)) {
      statusMessage.textContent = tr("当前阶段尚未积累可回溯的战场记录。", "No rewind history is available in this combat phase yet.");
      return false;
    }
    evolution.cooldown = spec.cooldown; gameAudio.perfectShield?.();
  }
  evolution.skillFlash = .7; updateEvolutionDisplay();
  statusMessage.textContent = evolutionName(evolution.route) + tr("已释放", " activated");
  return true;
}
function updateEvolution(seconds) {
  if (!isBattleActive() || seconds <= 0) return;
  evolution.cooldown = Math.max(0, evolution.cooldown - seconds);
  evolution.frozenRemaining = Math.max(0, evolution.frozenRemaining - seconds);
  evolution.skillFlash = Math.max(0, evolution.skillFlash - seconds);
  for (const target of [...enemies, ...(boss ? [boss] : [])])
    if (target.emberUntil <= battleTime) target.emberStacks = 0;
  for (let index = evolution.pulses.length - 1; index >= 0; index--) {
    evolution.pulses[index].age += seconds;
    if (evolution.pulses[index].age >= evolution.pulses[index].duration) evolution.pulses.splice(index, 1);
  }
  updateEvolutionDisplay();
}
function drawEvolution() {
  if (state !== "battle") return;
  context.save();
  for (const target of [...enemies, ...(boss ? [boss] : [])]) {
    if (target.emberStacks > 0 && target.emberUntil > battleTime) {
      const r = target.height * .38;
      context.strokeStyle = "#ff8b53"; context.lineWidth = 2;
      for (let i = 0; i < Math.min(8, target.emberStacks); i++) {
        const a = i / 8 * Math.PI * 2 + battleTime * (reducedMotion.matches ? 0 : .6);
        const x = target.x + Math.cos(a) * r * 1.3, y = target.y + Math.sin(a) * r;
        context.beginPath(); context.moveTo(x - 3, y + 5);
        context.quadraticCurveTo(x + 6, y - 4, x, y - 12); context.stroke();
      }
    }
    if (evolutionIsFrozen()) {
      context.fillStyle = "#8addff30"; context.strokeStyle = "#beefffa0"; context.lineWidth = 1.5;
      context.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3, x = target.x + Math.cos(a) * target.width * .53, y = target.y + Math.sin(a) * target.height * .62;
        if (!i) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.closePath(); context.fill(); context.stroke();
    }
  }
  if (evolution.skillFlash > 0) {
    context.globalAlpha = Math.min(reducedMotion.matches ? .04 : .12, evolution.skillFlash * .2);
    context.fillStyle = evolutionColors[evolution.route];
    context.fillRect(0, 0, viewport.width, viewport.height); context.globalAlpha = 1;
  }
  for (const pulse of evolution.pulses) {
    const progress = Math.min(1, pulse.age / pulse.duration);
    context.globalAlpha = (1 - progress) * (reducedMotion.matches ? .3 : .7);
    context.strokeStyle = pulse.color; context.lineWidth = 2.5 - progress;
    context.beginPath(); context.arc(pulse.x, pulse.y, pulse.radius * (.22 + progress * .78), 0, Math.PI * 2); context.stroke();
  }
  context.restore();
}
evolutionCards.forEach(card => {
  card.addEventListener("click", () => chooseEvolution(card.dataset.choice));
  card.addEventListener("focus", () => { if (evolution.pending) evolution.choice = card.dataset.choice; });
});
document.addEventListener("keydown", event => {
  if (!evolution.pending || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === "Escape") { event.preventDefault(); return; }
  if (event.repeat && ["Enter", "Space", "Digit1", "Digit2", "Digit3"].includes(event.code)) { event.preventDefault(); return; }
  if (/^(Digit|Numpad)[123]$/.test(event.code)) {
    event.preventDefault(); const card = evolutionCards[Number(event.code.slice(-1)) - 1];
    if (!card.disabled) chooseEvolution(card.dataset.choice);
  } else if (event.code === "Tab") {
    event.preventDefault(); const enabled = evolutionCards.filter(card => !card.disabled);
    const skip = document.querySelector("#flight-training-evolution-skip");
    if (skip && !skip.hidden) enabled.push(skip);
    const current = enabled.indexOf(document.activeElement);
    enabled[(current + (event.shiftKey ? -1 : 1) + enabled.length) % enabled.length]?.focus({ preventScroll: true });
  }
}, true);
document.addEventListener("focusin", event => {
  if (evolution.pending && !evolutionScreen.contains(event.target)) focusEvolutionCard();
});
