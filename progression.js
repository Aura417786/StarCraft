"use strict";

// Player gains and the enemy schedule are deliberately independent. Extra pickups
// and evolution can put the player ahead of this fixed, time-based reference.
const progressionRules = { tierBonus: 1.12, redMultiplier: 1.12, blueMultiplier: 1.08,
  maxPhysicalRate: 200, stageSeconds: 30 };
function progressionLogSum(a, b) {
  const high = Math.max(a, b), low = Math.min(a, b);
  return high + Math.log1p(Math.exp(low - high));
}
function progressionBaseDamageLog() { return Math.log(weapon.damage) + (weapon.damageOverflow || 0); }
function progressionPacketDamageLog() {
  return progressionBaseDamageLog() + (weapon.tier - 1) * Math.log(maxWeaponLanes * progressionRules.tierBonus)
    + (weapon.rateOverflow || 0);
}
function progressionGrowDamage(gain) {
  const before = progressionBaseDamageLog();
  const next = Math.max(progressionLogSum(before, Math.log(gain)), before + gain * Math.log(progressionRules.redMultiplier));
  const stored = Math.min(next, Math.log(1e100));
  weapon.damage = Math.exp(stored); weapon.damageOverflow = Math.max(0, next - stored);
  return { before, after: next };
}
function progressionGrowRate(gain) {
  const before = -Math.log(weapon.interval) + (weapon.rateOverflow || 0);
  const next = Math.max(progressionLogSum(before, Math.log(firingRules.ratePerLevel * gain)),
    before + gain * Math.log(progressionRules.blueMultiplier));
  const physical = Math.min(next, Math.log(progressionRules.maxPhysicalRate));
  weapon.interval = Math.exp(-physical); weapon.rateOverflow = Math.max(0, next - physical);
  return { before, after: next };
}
function progressionFormatLog(logarithm) {
  if (logarithm < Math.log(1e6)) return String(Number(Math.exp(logarithm).toFixed(2)));
  const exponent = Math.floor(logarithm / Math.LN10);
  return Number(Math.exp(logarithm - exponent * Math.LN10).toFixed(2)) + "×10^" + exponent;
}
function progressionExpectedGain(time, step) {
  const t = Math.max(0, time - 12), periods = Math.floor(t / step), remainder = t % step;
  // Average one pickup of each color every 27 seconds, with the same time gains.
  return (step * periods * (periods + 1) / 2 + remainder * (periods + 1)) / 27;
}
function progressionReferenceAt(time) {
  const red = progressionExpectedGain(time, 180), blue = red;
  const yellow = progressionExpectedGain(time, 360), whole = Math.floor(yellow), fraction = yellow - whole;
  const laneLog = level => Math.floor(level / 4) * Math.log(4 * progressionRules.tierBonus) + Math.log(level % 4 + 1);
  const damageLog = Math.log(1 + Math.min(9, red)) + Math.max(0, red - 9) * Math.log(progressionRules.redMultiplier);
  const rateLog = Math.log(5 + .75 * Math.min(10, blue)) + Math.max(0, blue - 10) * Math.log(progressionRules.blueMultiplier);
  return damageLog + rateLog + laneLog(whole) * (1 - fraction) + laneLog(whole + 1) * fraction;
}
function progressionReferenceDpsLog(time = battleTime) {
  const t = Math.max(0, Number.isFinite(time) ? time : 0), period = progressionRules.stageSeconds;
  const start = Math.floor(t / period) * period, mix = (t - start) / period;
  return progressionReferenceAt(start) * (1 - mix) + progressionReferenceAt(start + period) * mix;
}
function progressionEnemyHealthLog(time = battleTime) {
  const t = Math.max(0, time), baseline = enemyHealthForTime(t);
  if (t < 20) return Math.log(baseline);
  return Math.max(Math.log(baseline), progressionReferenceDpsLog(t) + Math.log(.38 + Math.min(.35, t / 1200)));
}
function progressionBossHealthLog(time, endurance) {
  return progressionReferenceDpsLog(time) + Math.log(endurance);
}
