"use strict";

// Player gains and the enemy schedule are deliberately independent. Extra pickups
// and evolution can put the player ahead of this fixed, time-based reference.
const progressionRules = { tierBonus: 1.12, redMultiplier: 1.09, blueMultiplier: 1.065,
  rateOverflowWeight: 0.35, maxPhysicalRate: 200, stageSeconds: 30 };
function progressionLogSum(a, b) {
  const high = Math.max(a, b), low = Math.min(a, b);
  return high + Math.log1p(Math.exp(low - high));
}
function progressionBaseDamageLog() { return Math.log(weapon.damage) + (weapon.damageOverflow || 0); }
function progressionPacketDamageLog() {
  return progressionBaseDamageLog() + (weapon.tier - 1) * Math.log(maxWeaponLanes * progressionRules.tierBonus)
    + (weapon.rateOverflow || 0) * progressionRules.rateOverflowWeight;
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
function progressionLaneLog(gain) {
  const whole = Math.floor(gain), fraction = gain - whole;
  const laneLog = level => Math.floor(level / maxWeaponLanes) * Math.log(maxWeaponLanes * progressionRules.tierBonus)
    + Math.log(level % maxWeaponLanes + 1);
  return laneLog(whole) * (1 - fraction) + laneLog(whole + 1) * fraction;
}
function progressionEffectiveRateLog(rateLog) {
  const physicalLimit = Math.log(progressionRules.maxPhysicalRate);
  return Math.min(rateLog, physicalLimit) + Math.max(0, rateLog - physicalLimit) * progressionRules.rateOverflowWeight;
}
function progressionReferenceAt(time) {
  // Bosses, the ace and transports retain their existing encounter reference.
  const red = progressionExpectedGain(time, 180), blue = red;
  const yellow = progressionExpectedGain(time, 360);
  const damageLog = Math.log(1 + Math.min(9, red)) + Math.max(0, red - 9) * Math.log(1.12);
  const rateLog = Math.log(5 + .75 * Math.min(10, blue)) + Math.max(0, blue - 10) * Math.log(1.08);
  return damageLog + progressionEffectiveRateLog(rateLog) + progressionLaneLog(yellow);
}
function progressionReferenceDpsLog(time = battleTime) {
  const t = Math.max(0, Number.isFinite(time) ? time : 0), period = progressionRules.stageSeconds;
  const start = Math.floor(t / period) * period, mix = (t - start) / period;
  return progressionReferenceAt(start) * (1 - mix) + progressionReferenceAt(start + period) * mix;
}
function progressionWaveReferenceAt(time) {
  // Account for the extra RGB orbs supplied by combos, transports and Boss clears.
  const extraGain = step => Math.max(0, progressionExpectedGain(time, step) - progressionExpectedGain(45, step)) * 27 / 145;
  const red = progressionExpectedGain(time, 180) + extraGain(180);
  const yellow = progressionExpectedGain(time, 360) + extraGain(360);
  const weaponLog = (gain, base, increment, multiplier) => {
    const additiveLevels = Math.floor(1 / (multiplier - 1) - base / increment) + 1;
    return Math.log(base + increment * Math.min(gain, additiveLevels))
      + Math.max(0, gain - additiveLevels) * Math.log(multiplier);
  };
  const rateLog = weaponLog(red, firingRules.baseRate, firingRules.ratePerLevel, progressionRules.blueMultiplier);
  return weaponLog(red, 1, 1, progressionRules.redMultiplier) + progressionEffectiveRateLog(rateLog) + progressionLaneLog(yellow);
}
function progressionEnemyHealthLog(time = battleTime) {
  const t = Math.max(0, time), baseline = Math.log(enemyHealthForTime(t));
  if (t < 20) return baseline;
  const endurance = .38 + Math.min(.35, t / 1200);
  const reference = progressionReferenceDpsLog(t);
  if (t <= 55) return Math.max(baseline, reference + Math.log(endurance));
  const period = progressionRules.stageSeconds;
  const start = Math.floor(t / period) * period, mix = (t - start) / period;
  const waveReference = progressionWaveReferenceAt(start) * (1 - mix) + progressionWaveReferenceAt(start + period) * mix;
  const ramp = 1 - Math.exp(-(t - 55) / 70);
  return Math.max(baseline, reference + Math.log(endurance),
    reference + (waveReference - reference) * Math.min(1, (t - 55) / 35) + Math.log(endurance + .88 * ramp));
}
function progressionBossHealthLog(time, endurance, healthShare = 1) {
  const growth = -Math.expm1(-Math.max(0, time - 90) / 90);
  const baseline = progressionReferenceDpsLog(time) + Math.log(endurance * (1 + 0.55 * growth));
  if (growth === 0) return baseline;
  return Math.max(baseline, progressionEnemyHealthLog(time) + Math.log(9 * growth * healthShare));
}

function progressionHitFraction(target, damageLog, protection) {
  const relative = damageLog - target.healthLog;
  if (!protection) return Math.exp(Math.min(0, relative));
  const knee = protection.hit / 2;
  const raw = Math.exp(Math.min(12, relative));
  // Below the knee the full hit counts. Overkill tapers smoothly toward the per-hit limit.
  const hit = raw <= knee ? raw : knee - knee * Math.expm1(-(raw - knee) / knee);
  // One shared budget per target covers grouped rounds, extra lanes and auxiliary fire.
  const elapsed = Math.max(0, battleTime - (target.damageBudgetAt ?? battleTime));
  const available = Math.min(protection.burst, (target.damageBudget ?? protection.burst) + elapsed * protection.refill);
  const applied = Math.min(available, hit);
  target.damageBudget = available - applied;
  target.damageBudgetAt = battleTime;
  return applied;
}
