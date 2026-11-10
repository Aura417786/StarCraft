"use strict";

// One capstone per sortie. Earlier ranks can be mixed freely.
const evolution = { pierce: 0, blast: 0, aegis: 0, capstone: "", resetUsed: false,
  reassignments: 0, resetConfirm: false, pending: false, choice: "", pulses: [],
  links: { falcon: false, phalanx: false, lance: false }, refits: 0 };
const evolutionScreen = document.querySelector("#evolution-screen");
const evolutionTitle = document.querySelector("#evolution-title");
const evolutionDescription = document.querySelector("#evolution-description");
const evolutionReadout = document.querySelector("#evolution-readout");
const evolutionKeys = ["pierce", "blast", "aegis"];
const evolutionCards = evolutionKeys.map(kind => document.querySelector("#evolution-card-" + kind));
const evolutionNames = { pierce: "破碎翼刃", blast: "星隼僚机", aegis: "赤金壁垒" };
const evolutionEnglishNames = { pierce: "Piercing Wings", blast: "Falcon Wingman", aegis: "Crimson Aegis" };
const evolutionRankCopy = {
  pierce: [
    ["主武器多穿透一架敌机，并削弱护甲对高速齐射的吸收。", "Your main shots pierce one extra enemy and cut through rapid-fire armor."],
    ["每 0.65 秒，命中时向附近两个敌人各分出一枚翼刃。", "Once per 0.65s, a hit launches up to two shards at nearby targets."],
    ["按住 Shift 蓄力，松开释放贯穿重炮。蓄力时主炮停火，战机变慢。", "Hold Shift, then release to fire a lance. Main fire pauses and your ship slows while charging."],
  ],
  blast: [
    ["一架星隼跟随战机，主动追打前方敌人。", "A Falcon escorts you and seeks enemies ahead."],
    ["双星隼出动。按 F 锁定瞄准线附近的目标，再按解除。", "Two Falcons escort you. Press F to focus a target near your sights, and again to release it."],
    ["锁定后再按 F 拦截迎面实体敌弹。僚机拦截后需离队重整。", "Press F again while locked to intercept approaching projectiles. Falcons leave formation to recover."],
  ],
  aegis: [
    ["护盾充能加快；选卡时获得一次护盾。", "The shield recharges faster. Gain a charge when you select this rank."],
    ["护盾吸收实体敌弹，结束时将其反射。受伤时也会向来袭方向还击。", "The shield absorbs projectiles and returns them when it expires. Taking damage also triggers a countershot."],
    ["完美格挡返还 30% 大招充能，并把无敌延长 0.6 秒。", "A Perfect Guard restores 30% special energy and extends protection by 0.6s."],
  ],
};
const evolutionRefits = {
  "refit-fire": { name: "大招整备", nameEn: "Special Refit", effect: "补充半格大招能量。",
    effectEn: "Recover half a special charge.", tone: "blast" },
  "refit-heal": { name: "战地修复", nameEn: "Field Repairs", effect: "恢复 1 点生命。",
    effectEn: "Restore one life.", tone: "heal" },
  "refit-shield": { name: "护盾整备", nameEn: "Shield Refit", effect: "补充 1 次护盾。",
    effectEn: "Gain one shield charge.", tone: "aegis" },
};
const evolutionBackground = new Map();
const evolutionResetButton = document.createElement("button");
evolutionResetButton.type = "button";
evolutionResetButton.className = "evolution-reset";
evolutionResetButton.hidden = true;
evolutionScreen.querySelector(".evolution-controls")?.after(evolutionResetButton);

function evolutionName(kind) { return tr(evolutionNames[kind], evolutionEnglishNames[kind]); }
function evolutionPierceCount() { return evolution.pierce > 0 ? 1 : 0; }
function evolutionShieldChargeTime() {
  const factor = typeof sortieRules === "function" ? sortieRules().shieldRate ?? 1 : 1;
  return [25, 20, 18, 17][evolution.aegis] * factor;
}
function evolutionRanksSpent() { return evolution.pierce + evolution.blast + evolution.aegis; }
function evolutionRankBlocked(kind) {
  return evolution[kind] >= 3 || (evolution[kind] === 2 && !!evolution.capstone && evolution.capstone !== kind);
}
function evolutionChoiceOptions() {
  return evolutionKeys.every(evolutionRankBlocked) ? Object.keys(evolutionRefits) : evolutionKeys;
}
function canRespecEvolution() {
  return evolution.pending && !evolution.resetUsed && !evolution.reassignments && evolutionRanksSpent() > 0;
}
function refreshEvolutionLinks() {
  evolution.links.falcon = evolution.pierce >= 2 && evolution.blast >= 2;
  evolution.links.phalanx = evolution.blast >= 2 && evolution.aegis >= 2;
  evolution.links.lance = evolution.pierce >= 2 && evolution.aegis >= 2;
}
function updateEvolutionDisplay() {
  const selected = evolutionKeys.filter(kind => evolution[kind] > 0).map(kind => {
    const suffix = kind === evolution.capstone ? " ◆" : "";
    return evolutionName(kind) + tr(" " + evolution[kind] + "级", " Lv. " + evolution[kind]) + suffix;
  });
  if (evolution.blast >= 2) selected.push(tr("F 星隼", "F Falcon"));
  if (evolution.pierce >= 3) selected.push(tr("长按 Shift 蓄翼刃", "Hold Shift for lance"));
  evolutionReadout.hidden = !selected.length;
  evolutionReadout.textContent = selected.join("  ·  ");
}
function evolutionCardDetails(kind) {
  const refit = evolutionRefits[kind];
  if (refit) {
    const noShield = typeof sortieRules === "function" && sortieRules().noShield;
    const stocked = kind === "refit-fire" && ultimate.charges >= ultimateRules.maxCharges;
    const disabled = (kind === "refit-heal" && player.lives >= player.maxLives)
      || (kind === "refit-shield" && (shield.charges >= shieldRules.maxCharges || noShield));
    return { ...refit, name: stocked ? tr("继续出击", "Continue sortie") : tr(refit.name, refit.nameEn),
      effect: stocked ? tr("大招库存已满，继续当前航程。", "Specials are fully stocked. Continue your sortie.") : tr(refit.effect, refit.effectEn),
      level: tr("战地补给", "Field supply"), art: tr("即时生效 · 仅限本局", "Immediate · This sortie"),
      disabled, unavailable: tr("无需补给", "Unavailable") };
  }
  const current = evolution[kind], next = Math.min(3, current + 1);
  const complete = current >= 3, disabled = evolutionRankBlocked(kind);
  const level = complete ? tr("已达最高 · 3级", "Max level · Lv. 3")
    : tr(current + "级 → " + next + "级", "Lv. " + current + " → " + next);
  const links = {
    pierce: tr("与星隼 2 级联动：僚机射击可穿透。", "Falcon II link: escort rounds gain penetration."),
    blast: tr("与壁垒 2 级联动：开盾后短暂加速齐射。", "Aegis II link: shielding briefly speeds up escort volleys."),
    aegis: tr("与翼刃 2 级联动：反射弹可穿透。", "Wings II link: reflected shots gain penetration."),
  };
  return { name: evolutionName(kind), level, tone: kind, disabled,
    effect: tr(...evolutionRankCopy[kind][next - 1]),
    art: next === 3 ? tr("本局只可选一个 3 级专精。", "One rank III specialization per sortie.") : links[kind],
    unavailable: complete ? tr("本路线已完成", "Path complete") : tr("已选择其他专精", "Another specialization is active") };
}
function focusEvolutionCard(preferred = evolution.choice) {
  const card = evolutionCards.find(entry => entry.dataset.choice === preferred && !entry.disabled)
    || evolutionCards.find(entry => !entry.disabled);
  card?.focus({ preventScroll: true });
}
function refreshEvolutionChoice() {
  if (!evolution.pending) return;
  const options = evolutionChoiceOptions();
  const refitting = options !== evolutionKeys;
  evolutionTitle.textContent = refitting ? tr("首领击破，选择战地补给", "Boss defeated. Choose a field supply.")
    : tr("首领击破，选择战机进化", "Boss defeated. Choose an evolution.");
  evolutionDescription.textContent = evolution.resetConfirm
    ? tr("确认后会收回已分配的等级。你可以在此重新分配，每局仅一次。", "Confirm to reclaim all spent ranks and assign them again here. Once per sortie.")
    : evolution.reassignments
    ? tr("剩余可分配点数 " + evolution.reassignments, "Unspent ranks: " + evolution.reassignments)
    : tr("可混搭三条路线。第一个 3 级会锁定本局专精。", "Mix paths freely. Your first rank III locks your specialization for the sortie.");
  evolutionResetButton.hidden = !canRespecEvolution();
  evolutionResetButton.dataset.confirm = String(evolution.resetConfirm);
  evolutionResetButton.textContent = evolution.resetConfirm ? tr("确认重新分配", "Confirm respec") : tr("重新分配 · 每局一次", "Respec · Once per sortie");
  evolutionCards.forEach((card, index) => {
    const kind = options[index], details = evolutionCardDetails(kind);
    card.dataset.choice = kind;
    card.dataset.tone = details.tone;
    card.disabled = details.disabled;
    card.querySelector(".evolution-card-level").textContent = details.level;
    card.querySelector(".evolution-card-title").textContent = details.name;
    card.querySelector(".evolution-card-effect").textContent = details.effect;
    card.querySelector(".evolution-card-art").textContent = details.art;
    card.querySelector(".evolution-card-action").textContent = details.disabled ? details.unavailable : tr("选择", "Select");
  });
  if (!evolutionScreen.contains(document.activeElement) || document.activeElement.disabled || document.activeElement.hidden) focusEvolutionCard();
}
function respecEvolution() {
  if (!canRespecEvolution() || !evolution.resetConfirm) return false;
  const shieldProgress = shield.energy / evolutionShieldChargeTime();
  evolution.reassignments = evolutionRanksSpent();
  evolution.resetUsed = true;
  evolution.resetConfirm = false;
  for (const kind of evolutionKeys) evolution[kind] = 0;
  evolution.capstone = "";
  refreshEvolutionLinks();
  resetEvolutionWeapons();
  shield.energy = shieldProgress * evolutionShieldChargeTime();
  updateEvolutionDisplay();
  updateShieldDisplay();
  refreshEvolutionChoice();
  evolutionScreen.scrollTop = 0;
  focusEvolutionCard();
  return true;
}
evolutionResetButton.addEventListener("click", () => {
  if (!canRespecEvolution()) return;
  if (evolution.resetConfirm) respecEvolution();
  else { evolution.resetConfirm = true; refreshEvolutionChoice(); }
});
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
  clearFighterCombatTransients();
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
  const reassigning = evolution.reassignments > 0;
  evolution.resetConfirm = false;
  evolution.choice = kind;
  let message;
  if (evolutionKeys.includes(kind)) {
    const shieldProgress = shield.energy / evolutionShieldChargeTime();
    evolution[kind]++;
    if (evolution[kind] === 3) evolution.capstone = kind;
    refreshEvolutionLinks();
    if (kind === "aegis") {
      if (!reassigning && evolution.aegis === 1 && !(typeof sortieRules === "function" && sortieRules().noShield)) {
        shield.charges = Math.min(shieldRules.maxCharges, shield.charges + 1);
      }
      shield.energy = shield.charges === shieldRules.maxCharges ? 0 : shieldProgress * evolutionShieldChargeTime();
      updateShieldDisplay();
    }
    updateWeaponDisplay();
    onEvolutionUpgrade(kind);
    updateFiringStyleDisplay();
    message = evolutionName(kind) + tr("进化至 " + evolution[kind] + " 级", " reached level " + evolution[kind]);
  } else {
    const refit = evolutionRefits[kind];
    evolution.refits++;
    if (kind === "refit-heal") grantPlayerLife();
    else if (kind === "refit-shield") {
      shield.charges = Math.min(shieldRules.maxCharges, shield.charges + 1);
      if (shield.charges === shieldRules.maxCharges) shield.energy = 0;
      updateShieldDisplay();
    } else restoreUltimateEnergy(ultimateRules.energyPerCharge * .5);
    message = tr(refit.name + " · " + refit.effect, refit.nameEn + " · " + refit.effectEn);
  }
  if (reassigning) {
    evolution.reassignments--;
    updateEvolutionDisplay();
    refreshEvolutionChoice();
    evolutionScreen.scrollTop = 0;
    return true;
  }
  evolution.pending = false;
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
  evolution.capstone = ""; evolution.resetUsed = false; evolution.resetConfirm = false;
  evolution.reassignments = 0; evolution.refits = 0;
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
  addEvolutionPulse(player.x, player.y, player.width * .74, "#ffd09c", .38);
}
function onEvolutionDamaged(origin) {
  if (evolution.aegis < 2 || !player.lives) return;
  const muzzle = muzzlePosition();
  let angle = evolutionAim(muzzle);
  if (origin?.vx < -1 && Number.isFinite(origin.vy)) {
    angle = clamp(Math.atan2(-origin.vy, -origin.vx), -.9, .9);
  } else if (origin?.x > muzzle.x && Number.isFinite(origin.y)) {
    angle = targetAim(origin, muzzle, .9);
  }
  if (spawnEvolutionRound(muzzle, "counter", .75, { angle, noEnergy: true, pierces: evolution.links.lance ? 1 : 0 })) {
    addEvolutionPulse(player.x, player.y, player.width * .62, "#ffc987", .27);
    gameAudio.shoot?.(true);
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
    context.beginPath(); context.arc(pulse.x, pulse.y, pulse.radius * (0.22 + progress * 0.78), 0, Math.PI * 2); context.stroke();
    context.restore();
  }
}

evolutionCards.forEach((card) => {
  card.addEventListener("click", () => chooseEvolution(card.dataset.choice));
  card.addEventListener("focus", () => { if (evolution.pending) evolution.choice = card.dataset.choice; });
});
document.addEventListener("keydown", (event) => {
  if (!evolution.pending || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === "Escape") {
    event.preventDefault();
    if (evolution.resetConfirm) { evolution.resetConfirm = false; refreshEvolutionChoice(); }
    return;
  }
  if (event.repeat && ["Enter", "Space", "Digit1", "Digit2", "Digit3", "Numpad1", "Numpad2", "Numpad3"].includes(event.code)) { event.preventDefault(); return; }
  if (["Digit1", "Digit2", "Digit3", "Numpad1", "Numpad2", "Numpad3"].includes(event.code)) {
    event.preventDefault();
    const card = evolutionCards[Number(event.code.slice(-1)) - 1];
    if (!card.disabled) chooseEvolution(card.dataset.choice);
  } else if (event.code === "Tab") {
    event.preventDefault();
    const enabled = evolutionCards.filter(card => !card.disabled);
    if (!evolutionResetButton.hidden) enabled.push(evolutionResetButton);
    const current = enabled.indexOf(document.activeElement);
    const next = current < 0 ? 0 : (current + (event.shiftKey ? -1 : 1) + enabled.length) % enabled.length;
    enabled[next]?.focus({ preventScroll: true });
  }
}, true);
document.addEventListener("focusin", (event) => {
  if (evolution.pending && !evolutionScreen.contains(event.target)) focusEvolutionCard();
});
