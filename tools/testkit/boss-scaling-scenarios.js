"use strict";

function scalingFixturePresets(type) {
  const low = progressionPresetForBoss(type);
  const full = {
    damageLevel: progressionRules.maxDamageLevel,
    rateLevel: progressionRules.maxRateLevel,
    laneLevel: progressionRules.maxLanes,
  };
  const medium = Object.fromEntries(Object.keys(low).map(key => [key, Math.round((low[key] + full[key]) / 2)]));
  return { low, medium, full };
}

function scalingMedian(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (!sorted.length) return null;
  return sorted.length % 2 ? sorted[mid] : balanceRound((sorted[mid - 1] + sorted[mid]) / 2);
}

function scalingIntervals(events) {
  return events.slice(1).map((event, index) => {
    const previous = events[index];
    return {
      from: previous.attack,
      to: event.attack,
      seconds: balanceRound(event.at - previous.at),
      minimumSeconds: balanceRound(previous.warningSeconds + .4),
      scheduledSeconds: previous.scheduledSeconds,
      ruptureBetween: event.enraged !== previous.enraged,
    };
  });
}

function runBossScalingFixture({ seed, type, gear }) {
  const loadout = scalingFixturePresets(type)[gear];
  const body = [], finale = [];
  let spawned;
  const realSpawn = spawnBoss;
  const realPrepare = prepareAlienAttack;
  const realRecover = beginAlienRecovery;
  const realFinale = updateBossFinale;
  spawnBoss = function (...args) {
    const result = realSpawn(...args);
    if (boss?.type === type) spawned = { scale: boss.scaling, bodyHealth: boss.baseHealth };
    return result;
  };
  prepareAlienAttack = function (target, ...args) {
    const recoverySeconds = target.phase === "recover" && !target.ruptureWindow ? target.phaseTime : null;
    const result = realPrepare(target, ...args);
    if (target === boss && target.type === type) {
      const previous = body.at(-1);
      if (previous && recoverySeconds !== null) previous.observedRecoverySeconds = balanceRound(recoverySeconds);
      body.push({ attack: target.alienAttack, at: balanceRound(battleTime), enraged: target.enraged,
        warningSeconds: balanceRound(target.telegraphDuration),
        activeSeconds: balanceRound(target.attackDuration),
        recoverySeconds: balanceRound(alienRecoveryDuration(target)),
        scheduledSeconds: balanceRound(target.attackInterval), observedRecoverySeconds: null });
    }
    return result;
  };
  beginAlienRecovery = function (target, ...args) {
    const endedAttack = target.phase === "attack";
    const result = realRecover(target, ...args);
    const current = body.at(-1);
    if (endedAttack && target === boss && target.type === type && current) {
      current.activeSeconds = balanceRound(target.attackDuration);
      current.scheduledSeconds = balanceRound(target.attackInterval);
    }
    return result;
  };
  updateBossFinale = function (target, seconds) {
    const phase = target.finale;
    const beat = phase.beat;
    const result = realFinale(target, seconds);
    if (target === boss && target.type === type && phase.beat > beat) {
      const warnings = phase.hazards.filter(hazard => hazard.age === 0).map(hazard => balanceRound(hazard.warning));
      const latestImpact = phase.hazards.reduce((end, hazard) => Math.max(end, hazard.warning + hazard.duration - hazard.age), 0);
      const scheduledSeconds = phase.attackInterval ?? phase.next - phase.age;
      finale.push({ attack: phase.mode + ":" + phase.beat, at: balanceRound(battleTime),
        warningSeconds: warnings.length ? Math.max(...warnings) : 0, warnings,
        latestImpactSeconds: balanceRound(latestImpact),
        scheduledSeconds: balanceRound(scheduledSeconds), recoverySeconds: balanceRound(scheduledSeconds - latestImpact) });
    }
    return result;
  };
  let sample;
  try {
    sample = runBalanceFixture({ label: `scaling-${type + 1}-${gear}`, seed, bossType: type,
      fighter: "red", difficulty: "veteran", mode: "campaign", policy: "pilot", build: "stock",
      seconds: 150, fixture: "timing", weaponPreset: loadout });
  } finally {
    spawnBoss = realSpawn;
    prepareAlienAttack = realPrepare;
    beginAlienRecovery = realRecover;
    updateBossFinale = realFinale;
  }
  if (!spawned?.scale) throw new Error("The production boss.scaling snapshot was absent at spawn");
  const record = sortieStats.bossRecords.find(record => record.type === type);
  const bodyIntervals = scalingIntervals(body), finaleIntervals = scalingIntervals(finale);
  const observedBody = bodyIntervals.map(entry => entry.seconds);
  const observedFinale = finaleIntervals.map(entry => entry.seconds);
  return {
    seed, boss: { number: type + 1, name: bossTypeName(type) }, gear,
    loadout: { ...loadout, ...sample.starting_weapon },
    ...spawned.scale,
    health: { body: spawned.bodyHealth, finale: sample.health[0]?.finale ?? null },
    ttk_seconds: record ? balanceRound(record.seconds) : null,
    active_ttk_seconds: sample.ttk_seconds,
    attack_interval_seconds: {
      body: scalingMedian(observedBody),
      finale: scalingMedian(observedFinale),
    },
    timing: { body, finale, bodyIntervals, finaleIntervals },
    won: sample.won, failureReason: sample.failure_reason,
    startingLives: sample.starting_lives, livesLeft: sample.lives_left, livesLost: sample.lives_lost,
    hostileProjectilesPeak: sample.max_hostile_projectiles,
    policy: sample.policy,
  };
}

function checkBossScalingContract(seed) {
  const type = 5;
  const start = difficulty => balanceStart({ label: "scaling-contract", seed, bossType: type,
    fighter: "red", difficulty, mode: "campaign", policy: "pilot", build: "stock", fixture: "preset" });
  start("veteran");
  const target = boss;
  const before = { health: target.baseHealth, healthLog: target.healthLog, ...target.scaling };
  const snapshot = () => JSON.stringify({ weapon, boss: boss.scaling, healthLog: boss.healthLog, battleTime,
    randomDraws: window.__balanceClock.randomDraws() });
  const serialized = snapshot();
  const repeatedIndices = Array.from({ length: 100 }, () => bossPowerIndex(type));
  const pure = snapshot() === serialized && repeatedIndices.every(value => value === before.k);
  const clamped = { low: bossPowerIndex(type, 0), high: bossPowerIndex(type, baselinePowerForBoss(type) * 10) };
  applyPowerup("red");
  applyPowerup("blue");
  applyPowerup("yellow");
  const after = { health: target.baseHealth, healthLog: target.healthLog, ...target.scaling, currentPower: sortieCombatPower() };
  const lockAfterPickups = after.currentPower > before.power && Object.isFrozen(target.scaling)
    && Object.keys(before).every(key => before[key] === after[key]);
  const difficulty = ["recruit", "veteran", "abyss"].map(name => {
    start(name);
    const expected = Math.round(bossBalanceBodies[type] * before.hpMul * sortieRules().bossHealth);
    return { name, health: boss.baseHealth, expected, k: boss.scaling.k, healthScale: sortieRules().bossHealth };
  });
  return { pure, repeatCount: repeatedIndices.length,
    clamp: { ...clamped, passed: clamped.low === .85 && clamped.high === 3.2 },
    spawnLock: { before, after, passed: lockAfterPickups },
    difficulty: { cases: difficulty, passed: difficulty.every(entry => entry.health === entry.expected && entry.k === before.k) } };
}
