"use strict";

const progressionRules = Object.freeze({ maxDamage: 60, maxRate: 12, maxLanes: 5, maxDamageLevel: 24, maxRateLevel: 11 });
const damageBreakpoints = [[1, 2.2], [3, 6], [6, 12], [10, 20], [15, 30], [24, 60]];
const campaignWeaponFloors = [
  [3, 2, 1], [5, 3, 1], [7, 4, 1], [9, 5, 2], [11, 6, 2], [13, 7, 2],
  [15, 8, 3], [17, 9, 3], [19, 10, 3], [21, 10, 3], [23, 11, 3],
];
// Body HP only. The separate finale HP/defences remain specific to each encounter.
const bossBalanceBodies = [690, 1070, 1550, 2130, 2320, 2760, 3790, 4340, 4650, 5650, 6450];

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
function bossBalanceHealth(type, { level, difficultyScale = 1 } = {}) {
  const index = Math.max(0, Math.min(bossBalanceBodies.length - 1, type | 0));
  const preset = progressionPresetForBoss(index);
  // Lock at spawn; skilled upgrade collection never increases the boss's life.
  // Modest grace keeps a missed stretch of pickups from turning into a health wall.
  const shortage = Math.max(0, preset.damageLevel - progressionRank(level ?? preset.damageLevel, progressionRules.maxDamageLevel));
  return Math.round(bossBalanceBodies[index] * (1 - Math.min(.12, shortage * .025)) * difficultyScale);
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
