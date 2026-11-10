"use strict";

const sortieProfile = StarBreakerProfile.createStore({
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value)
});
const sortieSettingsKey = "star-breaker-sortie-settings";
const sortieSettings = { difficulty: "veteran", rushDifficulty: "veteran", extended: false, radio: true };
const sortieDifficulty = {
  recruit: { bossHealth: .85, warning: .3, attackTempo: .86, projectileSpeed: .93, damage: .75 },
  veteran: { bossHealth: 1, warning: 0, attackTempo: 1, projectileSpeed: 1, damage: 1 },
  abyss: { bossHealth: 1.12, warning: 0, attackTempo: 1.18, projectileSpeed: 1.1, damage: 1.25 }
};
try {
  const saved = JSON.parse(window.localStorage.getItem(sortieSettingsKey));
  if (Object.hasOwn(sortieDifficulty, saved?.difficulty)) sortieSettings.difficulty = saved.difficulty;
  if (Object.hasOwn(sortieDifficulty, saved?.rushDifficulty)) sortieSettings.rushDifficulty = saved.rushDifficulty;
  sortieSettings.extended = saved?.extended === true;
  sortieSettings.radio = saved?.radio !== false;
} catch { /* The default sortie settings work without storage. */ }

const sortieBaseline = { ...sortieDifficulty.veteran, noShield: false, shieldRate: 1, movement: 1, drift: 0 };
let sortieStats = null;

function saveSortieSetting(key, value) {
  if ((key === "difficulty" || key === "rushDifficulty") && Object.hasOwn(sortieDifficulty, value)) sortieSettings[key] = value;
  if (key === "extended") sortieSettings.extended = value === true;
  if (key === "radio") sortieSettings.radio = value !== false;
  try { window.localStorage.setItem(sortieSettingsKey, JSON.stringify(sortieSettings)); }
  catch { /* Still applies in this session. */ }
  syncSortieEligibility();
}

function sortieGenerator(seed) {
  let n = seed >>> 0;
  return () => {
    n = (n + 0x6D2B79F5) >>> 0;
    let sample = Math.imul(n ^ n >>> 15, n | 1);
    sample ^= sample + Math.imul(sample ^ sample >>> 7, sample | 61);
    return ((sample ^ sample >>> 14) >>> 0) / 4294967296;
  };
}

function sortieDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function sortieSeed(label) {
  let seed = 2166136261;
  for (const char of label) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return seed;
}
function weeklyRush(date = new Date()) {
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return weeklyRushRules(sortieDay(monday));
}

function weeklyRushRules(week) {
  const seed = sortieSeed("weekly-rush:" + week);
  const random = sortieGenerator(seed);
  const route = ["updraft", "downdraft", "heavy-thrusters"];
  const defense = ["fast-shots", "slow-recharge"];
  return { week, seed, rules: [route[Math.floor(random() * route.length)], defense[Math.floor(random() * defense.length)]] };
}
function dailySortie(day = sortieDay()) {
  const seed = sortieSeed(day);
  const random = sortieGenerator(seed);
  const choose = choices => choices[Math.floor(random() * choices.length)];
  return { day, seed, fighter: choose(["red", "blue", "yellow"]),
    bossType: Math.floor(random() * StarBreakerProfile.bossCount),
    rules: [
      choose(["fast-shots", "thick-shell"]),
      choose(["updraft", "downdraft", "heavy-thrusters"]),
      choose(["sealed-shield", "slow-recharge"])
    ] };
}

function sortieRandom() { return sortieStats ? sortieStats.random() : Math.random(); }
function sortieRules() { return sortieStats?.rules ?? sortieBaseline; }
function sortieMode() { return sortieStats?.mode ?? "campaign"; }
function sortieAllowsWaves() { return sortieMode() === "campaign"; }
function sortieAllowsPickups() { return sortieMode() === "campaign"; }
function sortieBossDelay() { return sortieMode() === "rush" ? 3.2 : 4.2; }
function sortieAssistFlags() {
  return { extendedWarning: sortieSettings.extended, noScreenShake: shakePreference === "off", reducedMotion: quietCombatMotion() };
}

function syncSortieEligibility() {
  if (!sortieStats || sortieStats.result) return;
  const flags = sortieAssistFlags();
  for (const key of Object.keys(flags)) {
    if (!flags[key]) continue;
    (sortieStats.assists ??= {})[key] = true;
    sortieStats.assisted = true;
  }
}

function newSortie(options = {}) {
  const mode = ["campaign", "rush", "practice", "daily"].includes(options.mode) ? options.mode : "campaign";
  const daily = mode === "daily" ? dailySortie(options.day) : null;
  const resumed = mode === "rush" && Number.isInteger(options.rushStart) && options.rushStart >= 0
    && options.rushStart < StarBreakerProfile.bossCount;
  const week = mode === "rush" && !resumed && /^\d{4}-\d{2}-\d{2}$/.test(options.week ?? "") ? options.week : null;
  const weekly = week ? weeklyRushRules(week) : null;
  const practiceType = Math.max(0, Math.min(StarBreakerProfile.bossCount - 1, Math.floor(options.bossType || 0)));
  const difficulty = mode === "daily" || mode === "practice" || week ? "veteran"
    : Object.hasOwn(sortieDifficulty, options.difficulty) ? options.difficulty
    : mode === "rush" ? sortieSettings.rushDifficulty : sortieSettings.difficulty;
  const rules = { ...sortieBaseline, ...sortieDifficulty[difficulty] };
  const upgrades = mode === "campaign" ? sortieProfile.data.upgrades : { firepower: 0, survival: 0, mobility: 0 };
  const seed = daily?.seed ?? weekly?.seed
    ?? (Number.isInteger(options.seed) ? options.seed >>> 0 : (Math.random() * 4294967296) >>> 0);
  rules.shieldRate = upgrades.survival >= 5 ? .90 : upgrades.survival >= 3 ? .95 : 1;
  for (const modifier of daily?.rules ?? weekly?.rules ?? []) {
    if (modifier === "fast-shots") rules.projectileSpeed *= 1.2;
    if (modifier === "thick-shell") rules.bossHealth *= 1.12;
    if (modifier === "updraft") rules.drift = -.11;
    if (modifier === "downdraft") rules.drift = .11;
    if (modifier === "heavy-thrusters") rules.movement = .88;
    if (modifier === "sealed-shield") rules.noShield = true;
    if (modifier === "slow-recharge") rules.shieldRate = 1.3;
  }
  const picked = Object.hasOwn(fighterProfiles, options.fighter) ? options.fighter : selectedFighter;
  const fighter = daily?.fighter ?? (mode === "practice" ? "red" : picked);
  sortieStats = { mode, difficulty, daily, rules, upgrades, fighter, seed, random: sortieGenerator(seed),
    bossType: daily?.bossType ?? (mode === "practice" ? practiceType : null),
    resumed, rushStart: resumed ? options.rushStart : 0, week, weekly,
    guardReady: upgrades.survival >= 4, hitDebt: 0, hitsTaken: 0, bossRecords: [], unlocks: [],
    assisted: false, assists: sortieAssistFlags(), result: null };
  sortieStats.assisted = Object.values(sortieStats.assists).some(Boolean);
  return sortieStats;
}

function sortieReplayOptions() {
  if (!sortieStats) return {};
  const { mode, difficulty, fighter, bossType, daily, week, resumed, rushStart, seed } = sortieStats;
  return { mode, difficulty, fighter, bossType, day: daily?.day, week,
    ...(resumed ? { rushStart, seed } : {}) };
}

function sortieRushResumeOptions(resume) {
  return { mode: "rush", rushStart: resume.boss, difficulty: resume.difficulty, seed: resume.seed, fighter: resume.fighter };
}

function sortieStartingUpgrades() {
  const run = sortieStats;
  if (run && run.mode !== "campaign") return progressionPresetForBoss(run.bossType ?? run.rushStart);
  const level = run?.upgrades.firepower ?? 0;
  return { damageLevel: 1 + Number(level >= 1) + Number(level >= 4), rateLevel: level >= 2 ? 2 : 1, laneLevel: 1 };
}

function applySortieStartingEquipment() {
  if (!sortieStats) return;
  const { mode, upgrades, rules } = sortieStats;
  if (mode === "rush" || mode === "practice" || mode === "daily") {
    shield.charges = rules.noShield ? 0 : 1;
    ultimate.charges = 1;
  } else {
    shield.charges = upgrades.survival >= 2 ? 1 : 0;
    shield.energy = upgrades.survival === 1 ? 5 : 0;
    ultimate.energy = upgrades.firepower >= 5 ? 42 : upgrades.firepower >= 3 ? 24 : 0;
  }
  updateShieldDisplay();
  updateUltimateDisplay();
}

function sortieWarningBonus() { return sortieRules().warning + (sortieSettings.extended ? .35 : 0); }

function sortiePlayerSpeed() {
  const level = sortieStats?.upgrades.mobility ?? 0;
  const acceleration = player.hitFlash > 0 && level >= 5 ? 1.08 : 1;
  return (1 + level * .018) * acceleration * sortieRules().movement;
}

function sortieDrift() {
  // A steady daily vector, disclosed before entering and in the sortie HUD.
  return sortieRules().drift * player.speed;
}

function sortieDamageTaken() {
  if (!sortieStats) return 1;
  const run = sortieStats;
  run.hitsTaken++;
  if (run.guardReady) {
    run.guardReady = false;
    return 0;
  }
  const retained = run.hitDebt + sortieRules().damage;
  const lost = Math.floor(retained + 1e-9);
  run.hitDebt = Math.max(0, retained - lost);
  return lost;
}

function sortieBossEntered(target) {
  if (!sortieStats) return;
  const run = sortieStats;
  target.sortieStart = { time: battleTime, hits: run.hitsTaken };
  if (run.mode === "rush" && !run.resumed) {
    sortieProfile.rememberRush({ boss: target.type, seed: run.seed, difficulty: run.difficulty, fighter: run.fighter });
  }
}

function sortieBossCleared(target) {
  if (!sortieStats) return;
  const run = sortieStats;
  if (run.bossRecords.some(record => record.type === target.type)) return;
  const start = target.sortieStart ?? { time: battleTime, hits: run.hitsTaken };
  const builds = typeof StarBreakerAwards === "undefined" ? [] : StarBreakerAwards.buildsFor(evolution.pierce, evolution.blast, evolution.aegis);
  run.bossRecords.push({ type: target.type, seconds: Math.max(.001, battleTime - start.time), hitCount: run.hitsTaken - start.hits, builds });
  if (run.mode === "campaign") {
    const award = sortieProfile.awardBoss(target.type, run.difficulty);
    if (award?.unlocked) run.unlocks.push(target.type);
  }
}

function sortiePresentationEndsRun(target) {
  return target.alienFinal || sortieMode() === "practice" || sortieMode() === "daily";
}

function sortieLaunchHint() {
  const controls = tr("上下移动瞄准。空格使用大招，V 开盾。", "Move up or down to aim. Space uses your special; V shields.");
  if (sortieStats?.resumed) return tr("连战续练 · 从中断首领开始，独立于正式纪录。", "Rush practice · resumes at the interrupted boss and is unranked.") + " " + controls;
  if (sortieStats?.week) return tr("每周连战 · 老兵难度与本周航线规则。", "Weekly Rush · Veteran with this week's route rules.") + " " + controls;
  if (sortieMode() === "rush") return tr("首领连战开始。11 场连续对决，击破后有一次进化选择。", "Boss Rush has begun. Fight 11 bosses in order and evolve after each duel.") + " " + controls;
  if (sortieMode() === "practice") return tr("开始单首领练习。装备固定，共有三条生命。", "Boss Practice has begun. Your equipment is fixed and you have three lives.") + " " + controls;
  if (sortieMode() === "daily") {
    const extra = sortieRules().noShield
      ? tr("本次禁用护盾，注意预警并换位。", "Shields are disabled. Read the warning and move out of danger.")
      : controls;
    return tr("每日挑战开始。战机、对手和规则固定。", "Daily Challenge has begun. Your fighter, target, and rules are fixed.") + " " + extra;
  }
  return tr(`${tr(...fighterProfile().label)}出击。上下移动瞄准，空格释放${ultimateName()}，V 开盾。绿球恢复生命，满血时增加生命上限。依次击败十只异形，再挑战群渊合生体。`,
    `${tr(...fighterProfile().label)} launched. Move up or down to aim. Space uses ${ultimateName()}; V shields. Green orbs restore a life or raise capacity at full health. Defeat ten aliens, then face the Abyssal Confluence.`);
}

function completeSortie({ won = false, died = false, abandoned = false } = {}) {
  if (!sortieStats || sortieStats.result) return sortieStats?.result;
  syncSortieEligibility();
  const run = sortieStats;
  const summary = { won, died, abandoned, mode: run.mode, difficulty: run.difficulty, assisted: run.assisted, assists: { ...run.assists },
    seconds: battleTime, score, kills, combo: momentum.best, hits: run.hitsTaken, bossRecords: run.bossRecords.slice(),
    unlocks: run.unlocks.slice(), day: run.daily?.day, week: run.week, resumed: run.resumed,
    currentBoss: !won && run.mode === "rush" ? Math.min(StarBreakerProfile.bossCount - 1, boss?.type ?? pendingBossType ?? bossDefeated) : null,
    seed: run.seed, fighter: run.fighter };
  run.result = { ...summary, ...sortieProfile.finish(summary) };
  return run.result;
}
