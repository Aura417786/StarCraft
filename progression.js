"use strict";

const progressionRules = Object.freeze({ maxDamage: 60, maxRate: 12, maxLanes: 5, maxDamageLevel: 24, maxRateLevel: 11 });
const damageBreakpoints = [[1, 2.2], [3, 6], [6, 12], [10, 20], [15, 30], [24, 60]];
const campaignWeaponFloors = [
  [3, 2, 1], [5, 3, 1], [7, 4, 1], [9, 5, 2], [11, 6, 2], [13, 7, 2],
  [15, 8, 3], [17, 9, 3], [19, 10, 3], [21, 10, 3], [23, 11, 3],
];
// Body HP only. The separate finale HP/defences remain specific to each encounter.
const bossBalanceBodies = [710, 1460, 2170, 2890, 3480, 3950, 5530, 6210, 6800, 8150, 9650];

// [target seconds, exposure budget, body share]. Each finale has a different
// amount of side-target or weak-point work. Its share is paid from the same
// encounter budget instead of adding a second independently scaled pool.
const nightmareBossHealthProfiles = [
  [70, .97, .60], [78, .94, .70], [86, .84, .67],
  [96, 1.03, .70], [104, 1.01, .72], [112, 1.02, .72],
  [128, 1.07, .72], [137, 1.04, .68], [150, 1.12, .69],
  [166, .96, .75], [202, 1.08, .67],
];
const nightmareBossStageHealth = [1, 1.015, 1.03, 1.055];
// Seeker tracking assists large moving silhouettes. Its measured follow-up
// contact falls on fights that repeatedly move the hittable region or require
// switching targets. Estimate that loss before setting the entrance budget.
const nightmareSeekerContact = [.96, .90, .77, .88, .82, .79, .84, .77, .70, .66, .71];

function nightmareBossHealth(type) {
  const [targetSeconds, bossFactor, bodyShare] = nightmareBossHealthProfiles[type];
  const stageFactor = nightmareBossStageHealth[type < 3 ? 0 : type < 6 ? 1 : type < 10 ? 2 : 3];
  const fighter = fighterProfile();
  const rate = Math.min(progressionRules.maxRate, 1 / weapon.interval);
  const lanes = Math.max(1, Math.min(progressionRules.maxLanes, weapon.lanes));
  const base = weapon.damage * rate;
  // Estimate the appropriate boss-fight stance rather than the stance that
  // happened to be selected at spawn. Spread pellets don't all hit one core.
  const focus = base * (1 + .16 * (lanes - 1));
  const spread = base * (1 + (fighter.id === "yellow" ? .42 : .22) * (lanes - 1));
  let main, support;
  if (fighter.id === "blue") {
    const seeker = 1 + .065 * .70 * Math.min(1, Math.max(0, (weapon.damageLevel - 2) / 5));
    main = (.79 * focus + .11 * spread) * seeker * nightmareSeekerContact[type];
    // Every third seeker hit sends three packets. Boss fights generally
    // return most of those packets to the marked target.
    support = main * (1.18 / fighterCombatRules.ionStacks) * .80;
  } else if (fighter.id === "yellow") {
    main = focus * .72 + spread * .08;
    // Close spread activates three field pulses; reaching the boss while
    // keeping enough time on target makes only some recharges productive.
    support = Math.min(220, focus * .21) * 3 * fighterCombatRules.auricRegen * .58;
  } else {
    // A heavy charge takes time away from primary fire. Penetration makes
    // a single larger packet useful, but cannot hit the same core twice.
    const heavyCadence = 4.8;
    main = focus * .83 * (1 - fighterCombatRules.redCharge / heavyCadence);
    support = Math.min(850, focus * .95) * .76 / heavyCadence;
  }

  // Legacy saved builds may still carry wing/lance ranks. The normal
  // exclusive routes do not gain these contributions unless the ranks exist.
  const drone = Math.min(3, evolution.blast | 0);
  if (drone > 0) support += focus * evolutionWeaponRules.droneDamage[drone]
    * (drone > 1 ? 2 : 1) / evolutionWeaponRules.droneInterval[drone]
    * (evolution.links.falcon ? 1.46 : 1) * .70;
  if (evolution.pierce >= 3) support += focus * (2.55 * .72 - evolutionWeaponRules.lanceCharge)
    / (evolutionWeaponRules.lanceCooldown + evolutionWeaponRules.lanceCharge);

  const spec = evolutionSkillSpec();
  let evolutionDps = 0;
  if (evolution.route === "ember") {
    const intendedStacks = Math.max(1, Math.min(spec.stacks, rate * spec.cooldown * .20));
    const cast = spec.seconds * intendedStacks / 4 * focus;
    const poolCap = (main + support) * targetSeconds * .52 * spec.bossCap;
    evolutionDps = Math.min(cast, poolCap) * .72 / spec.cooldown;
  } else if (evolution.route === "mimic" && Number.isInteger(evolution.lastDefeatedBoss)
      && bossUltimateKinds[evolution.lastDefeatedBoss]) {
    // Allow for partial geometry contact and missed casts in moving fights.
    evolutionDps = focus * (1.6 + .64 * 2) * spec.power * .70 / spec.cooldown;
  } else if (evolution.route === "frost") {
    main *= 1 + spec.duration / spec.cooldown * .24;
  }

  // Damage to the two pools recharges roughly three Space specials. Reserve
  // a modest part of starting stock and subtract the gun time lost charging.
  const stock = Math.min(2, ultimate.charges + ultimate.energy / ultimateRules.energyPerCharge);
  const casts = Math.min(3, 2 * ultimateRules.bossEnergy / ultimateRules.energyPerCharge - 1) + .55 * stock;
  const focusSeconds = fighter.id === "red" ? 5.1
    : fighter.id === "blue" ? 4.05 * ionSwarmRules.count * ionSwarmRules.damageShare : 4.35 * coronaRules.count * coronaRules.damageShare;
  const special = Math.max(0, focus * focusSeconds * .79 - main * ultimateRules.chargeTime)
    * casts / targetSeconds;
  const effectiveDps = main + support + special + evolutionDps;
  const encounterHealth = Math.max(2, Math.round(effectiveDps * targetSeconds * bossFactor * stageFactor));
  const bodyHealth = Math.max(1, Math.min(encounterHealth - 1, Math.round(encounterHealth * bodyShare)));
  return Object.freeze({ mainDps: main, supportDps: support, specialDps: special, evolutionDps, effectiveDps,
    targetSeconds, bossFactor, stageFactor, bodyHealth, finaleHealth: encounterHealth - bodyHealth, encounterHealth });
}

function progressionRank(level, max) {
  return Math.min(max, Math.max(1, Math.floor(Number(level) || 1)));
}
function progressionDamageForLevel(level, base = 2.2) {
  const rank = progressionRank(level, progressionRules.maxDamageLevel);
  for (let index = 1; index < damageBreakpoints.length; index++) {
    const [end, value] = damageBreakpoints[index];
    if (rank > end) continue;
    const [start, previous] = damageBreakpoints[index - 1];
    const delta = (rank - start) * (value - previous) / (end - start);
    // Rapid-fire and area fighters share upgrade thresholds, but not heavy-cannon damage.
    const scale = base >= 2 ? 1 : .68;
    return Math.min(progressionRules.maxDamage, base + (previous - 2.2 + delta) * scale);
  }
  return progressionRules.maxDamage;
}
function progressionRateForLevel(level, base = 3.6) {
  const rank = progressionRank(level, progressionRules.maxRateLevel);
  return Math.min(progressionRules.maxRate, base + (12 - base) * (rank - 1) / 10);
}
function progressionPresetForBoss(type) {
  const [damageLevel, rateLevel, laneLevel] = campaignWeaponFloors[Math.max(0, Math.min(campaignWeaponFloors.length - 1, type | 0))];
  return { damageLevel, rateLevel, laneLevel };
}
function combatPowerForLoadout(damage, rate, lanes) {
  return damage * rate * (1 + .35 * (lanes - 1));
}
function sortieCombatPower() {
  const rate = progressionRateForLevel(weapon.speedLevel, fighterProfile().rate);
  return combatPowerForLoadout(weapon.damage, rate, weapon.lanes)
    * (typeof evolutionPowerMultiplier === "function" ? evolutionPowerMultiplier() : 1);
}
function baselinePowerForBoss(type) {
  const fighter = fighterProfile();
  const preset = progressionPresetForBoss(type);
  const lanes = Math.min(progressionRules.maxLanes, fighter.lanes + preset.laneLevel - 1);
  return combatPowerForLoadout(progressionDamageForLevel(preset.damageLevel, fighter.damage),
    progressionRateForLevel(preset.rateLevel, fighter.rate), lanes);
}
function bossPowerIndex(type, power = sortieCombatPower()) {
  return Math.min(3.2, Math.max(.85, power / baselinePowerForBoss(type)));
}
function bossScaling(type) {
  const power = sortieCombatPower();
  const k = bossPowerIndex(type, power);
  // A fully outfitted fighter can exceed an early campaign floor by over 30x.
  // Give the shell a bounded reserve without accelerating projectiles beyond their tells.
  const excess = Math.max(1, power / (3.2 * baselinePowerForBoss(type)));
  const reserve = 1 + Math.min(.48, .22 * Math.log(excess));
  const normal = { power, k, hpMul: k ** .85 * reserve, tempoMul: k ** .35, speedMul: k ** .22 };
  if (typeof isAbyssalNightmare !== "function" || !isAbyssalNightmare()) return Object.freeze(normal);
  const index = Math.max(0, Math.min(bossBalanceBodies.length - 1, type | 0));
  const nightmare = nightmareBossHealth(index);
  return Object.freeze({ ...normal, hpMul: nightmare.bodyHealth / bossBalanceBodies[index], nightmare });
}
function bossBalanceHealth(type, { scaling = bossScaling(type), difficultyScale = 1 } = {}) {
  if (scaling.nightmare) return scaling.nightmare.bodyHealth;
  const index = Math.max(0, Math.min(bossBalanceBodies.length - 1, type | 0));
  return Math.round(bossBalanceBodies[index] * scaling.hpMul * difficultyScale);
}
function progressionGrowDamage(gain) {
  const before = weapon.damage;
  weapon.damageLevel = progressionRank((weapon.damageLevel ?? 1) + gain, progressionRules.maxDamageLevel);
  weapon.damage = progressionDamageForLevel(weapon.damageLevel, fighterProfile().damage);
  return { before, after: weapon.damage };
}
function progressionGrowRate(gain) {
  const before = 1 / weapon.interval;
  weapon.speedLevel = progressionRank(weapon.speedLevel + gain, progressionRules.maxRateLevel);
  const after = progressionRateForLevel(weapon.speedLevel, fighterProfile().rate);
  weapon.interval = 1 / after;
  return { before, after };
}
function raiseWeaponFloor(preset) {
  const fighter = fighterProfile();
  progressionGrowDamage(Math.max(0, preset.damageLevel - (weapon.damageLevel ?? 1)));
  progressionGrowRate(Math.max(0, preset.rateLevel - weapon.speedLevel));
  weapon.tier = Math.min(6, Math.max(weapon.tier, preset.laneLevel));
  weapon.lanes = Math.min(progressionRules.maxLanes, Math.max(weapon.lanes, fighter.lanes + preset.laneLevel - 1));
  reconcileShotCadence();
  updateWeaponDisplay();
}
// Keep log encoding at the collision boundary: legacy attackers compare against
// normalized HP pools. No time or weapon tier exponent feeds the health curve.
function progressionBaseDamageLog() { return Math.log(weapon.damage); }
function progressionPacketDamageLog() { return progressionBaseDamageLog(); }
function progressionFormatLog(logarithm) { return String(Number(Math.exp(logarithm).toFixed(2))); }
function progressionReferenceDpsLog(time = battleTime) {
  return Math.log(10 + Math.min(1200, Math.max(0, time)) * .18);
}
function enemyDurabilityLog() { return 0; }
function progressionEnemyHealthLog(time = battleTime) {
  return Math.log(enemyHealthForTime(time));
}
function progressionHitFraction(target, damageLog, protection) {
  const relative = damageLog - target.healthLog;
  if (!protection) return Math.exp(Math.min(0, relative));
  const knee = protection.hit / 2;
  const raw = Math.exp(Math.min(12, relative));
  const hit = raw <= knee ? raw : knee - knee * Math.expm1(-(raw - knee) / knee);
  const elapsed = Math.max(0, battleTime - (target.damageBudgetAt ?? battleTime));
  const available = Math.min(protection.burst, (target.damageBudget ?? protection.burst) + elapsed * protection.refill);
  const applied = Math.min(available, hit);
  target.damageBudget = available - applied;
  target.damageBudgetAt = battleTime;
  return applied;
}
