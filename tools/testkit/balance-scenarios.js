"use strict";

const balanceStep = 1 / 60;
const balanceBuilds = {
  stock: [0, 0, 0],
  wings: [3, 1, 1],
  falcon: [1, 3, 1],
  aegis: [1, 1, 3],
};
function balanceRound(number) { return Math.round(number * 1000) / 1000; }

function balanceStart(fixture) {
  window.__balanceClock.seed(fixture.seed);
  // The fixture uses the normal initialization path. It then stages gear and
  // arrival without changing health, damage, collision or completion rules.
  selectedFighter = fixture.fighter;
  showScreen("battle", {
    mode: fixture.mode === "rush" ? "rush" : "campaign",
    difficulty: fixture.difficulty,
    seed: fixture.seed,
  });
  canvas.focus({ preventScroll: true });
  if (!isBattleActive()) throw new Error("Fixture could not focus combat");
  if (fixture.bossType === null) return;
  const type = fixture.bossType;
  // Compare firepower across the entire fight, including for a pilot who
  // would run out of hull in an ordinary sortie. Hits still resolve normally.
  if (fixture.fixture === "timing") while (player.maxLives < 14) grantPlayerLife(true);
  if (typeof progressionPresetForBoss === "function") {
    raiseWeaponFloor(progressionPresetForBoss(type));
  } else {
    for (let index = 0; index < 2 + type; index++) applyPowerup("red");
    for (let index = 0; index < 1 + Math.floor(type / 2); index++) applyPowerup("blue");
    for (let index = 0; index < Math.floor(type / 3); index++) applyPowerup("yellow");
  }
  const ranks = balanceBuilds[fixture.build];
  for (const [index, route] of ["pierce", "blast", "aegis"].entries()) {
    evolution[route] = ranks[index];
    if (ranks[index]) onEvolutionUpgrade(route);
  }
  if (Object.hasOwn(evolution, "capstone")) {
    evolution.capstone = fixture.build === "wings" ? "pierce"
      : fixture.build === "falcon" ? "blast" : fixture.build === "aegis" ? "aegis" : "";
  }
  if (fixture.fixture === "stress") {
    for (let index = 0; index < 64; index++) {
      applyPowerup("red");
      applyPowerup("yellow");
      applyPowerup("blue");
    }
  }
  enemyCooldown = powerupCooldown = nextBossTime = Infinity;
  formationState.nextTime = Infinity;
  battlefieldEvents.nextObject = Infinity;
  battlefieldEvents.nextTransport = Infinity;
  aceEncounter.nextTime = Infinity;
  bossDefeated = type;
  spawnBoss(type);
  // Rush, practice and the live campaign have their own starting rules.
  // Standard encounter comparison always begins with the same basic stock.
  ultimate.charges = 0;
  ultimate.energy = 0;
  shield.charges = 0;
  shield.energy = 0;
}

function balanceGunState() {
  return {
    damage: balanceRound(weapon.damage),
    rate: balanceRound(1 / effectiveShotInterval()),
    lanes: weapon.lanes,
    visibleLanes: shotLanes().length,
    tier: weapon.tier,
  };
}

function runBalanceFixture(fixture) {
  balanceStart(fixture);
  const controls = {
    build: fixture.build, shiftHeld: false, shiftSince: 0, nextLance: 0,
    nextFalcon: 0, shields: 0, specials: 0, trace: fixture.trace ? [] : null,
  };
  const telemetry = { ordinaryShots: 0, maxShotDamage: 0, weaponPeak: balanceGunState(),
    maxFriendly: 0, maxHostile: 0, attacks: new Set(), seenPhases: new Set(), times: [], damageDealt: 0,
    hitsTaken: 0, unitsLost: 0, bossHealth: [], bodyTTK: null, finaleTTK: null,
    encounterTime: null, firstFailure: null, fieldFeatures: new Set() };
  const start = balanceGunState();
  const startingLives = player.lives;
  let aliveFrames = 0, previousLives = player.lives;
  let encounter = null, bodyStartedAt = null, finaleStartedAt = null, clearedAt = null, simSeconds = 0;
  let stagesSeen = 0;
  const push = bullets.push;
  bullets.push = function (...shots) {
    for (const shot of shots) {
      if (shot.auxiliary || shot.source === "ultimate" || shot.source === "blast") continue;
      const amount = shot.damage ?? Math.exp(shot.damageLog ?? Math.log(weapon.damage));
      telemetry.ordinaryShots++;
      telemetry.maxShotDamage = Math.max(telemetry.maxShotDamage, amount);
    }
    return push.apply(this, shots);
  };
  try {
    for (let frame = 0; frame < fixture.seconds / balanceStep; frame++) {
      if (state !== "battle") break;
      if (fixture.bossType !== null && clearedAt !== null && !isBossPresentationPlaying()) break;
      if (frame % 4 === 0 || evolution.pending) balanceChooseAction(controls, fixture.policy);
      const before = boss;
      const oldHp = before?.hp;
      const oldHealth = before?.healthLog;
      const oldFinale = !!before?.finale;
      window.__balanceClock.tick(balanceStep);
      simSeconds = (frame + 1) * balanceStep;
      if (player.lives > 0) aliveFrames++;
      if (player.lives < previousLives) {
        telemetry.hitsTaken++;
        telemetry.unitsLost += previousLives - player.lives;
        telemetry.firstFailure ??= { at: balanceRound(battleTime), boss: before?.type ?? null, message: lastDamageMessage };
      }
      previousLives = player.lives;
      if (boss && boss !== encounter) {
        encounter = boss;
        stagesSeen = Math.max(stagesSeen, boss.type + 1);
        telemetry.bossHealth.push({ type: boss.type, body: balanceRound(boss.baseHealth ?? Math.exp(boss.healthLog)), finale: null });
        bodyStartedAt = null;
        finaleStartedAt = null;
      }
      if (boss && bossCanTakeDamage(boss)) {
        if (!boss.finale && bodyStartedAt === null) bodyStartedAt = battleTime;
        if (boss.finale && boss.finale.age >= boss.finale.transform && finaleStartedAt === null) finaleStartedAt = battleTime;
      }
      if (boss) {
        telemetry.seenPhases.add(boss.phase);
        if (boss.phase === "telegraph" && boss.alienAttack) telemetry.attacks.add(boss.alienAttack);
      }
      if (before && Number.isFinite(oldHealth)) {
        const changedPool = !oldFinale && before.finale;
        const hpAfter = changedPool ? 0 : before.hp;
        telemetry.damageDealt += Math.max(0, oldHp - hpAfter) * Math.exp(oldHealth);
        if (changedPool) {
          telemetry.bossHealth.at(-1).finale = balanceRound(Math.exp(before.healthLog));
          telemetry.bodyTTK = bodyStartedAt === null ? null : balanceRound(battleTime - bodyStartedAt);
        }
        if (!boss && bossDefeated >= before.type + 1) {
          telemetry.finaleTTK = finaleStartedAt === null ? null : balanceRound(battleTime - finaleStartedAt);
          const elapsed = bodyStartedAt === null ? null : balanceRound(battleTime - bodyStartedAt);
          telemetry.times.push({ type: before.type, bodyTTK: telemetry.bodyTTK, finaleTTK: telemetry.finaleTTK, activeTTK: elapsed });
          if (fixture.bossType !== null) {
            clearedAt = battleTime;
            telemetry.encounterTime = elapsed;
          }
        }
      }
      if (frame % 6 === 0) {
        const current = balanceGunState();
        for (const key of Object.keys(current)) telemetry.weaponPeak[key] = Math.max(telemetry.weaponPeak[key], current[key]);
      }
      telemetry.maxFriendly = Math.max(telemetry.maxFriendly, bullets.length);
      telemetry.maxHostile = Math.max(telemetry.maxHostile, bossProjectiles.length + enemyProjectiles.length);
      if (fixture.fixture === "natural" && frame % 6 === 0) {
        if (gravityTide.phase === "active") telemetry.fieldFeatures.add("gravity-tide");
        if (journeyState.scene?.catapult > 0 || journeyState.catapult > 0) telemetry.fieldFeatures.add("allied-catapult");
        for (const object of battlefieldEvents.objects) telemetry.fieldFeatures.add(object.journeyCover ?? object.kind);
      }
    }
  } finally {
    bullets.push = push;
    if (controls.shiftHeld) balancePress("ShiftLeft", "keyup");
  }
  const end = balanceGunState();
  for (const key of Object.keys(end)) telemetry.weaponPeak[key] = Math.max(telemetry.weaponPeak[key], end[key]);
  const won = fixture.bossType === null ? bossDefeated === bossTypes.length && player.lives > 0 : clearedAt !== null;
  return {
    case: fixture.label, seed: fixture.seed, policy: fixture.policy === "stationary" ? "stationary-fire/1" : balancePolicyVersion,
    mode: fixture.mode, fixture: fixture.fixture, difficulty: fixture.difficulty, fighter: fixture.fighter, build: fixture.build,
    won, reached_stage: stagesSeen, score, duration_seconds: balanceRound(battleTime), simulated_seconds: balanceRound(simSeconds),
    survival_seconds: balanceRound(aliveFrames * balanceStep), ttk_seconds: telemetry.encounterTime,
    effective_damage_per_second: balanceRound(telemetry.damageDealt / Math.max(.01, telemetry.encounterTime ?? battleTime)),
    health: telemetry.bossHealth, times: telemetry.times, hits_taken: telemetry.hitsTaken, starting_lives: startingLives,
    lives_lost: telemetry.unitsLost, lives_left: player.lives, shields_used: controls.shields, specials_used: controls.specials,
    starting_weapon: start, peak_weapon: telemetry.weaponPeak, final_weapon: end, normal_shots: telemetry.ordinaryShots,
    max_normal_shot_damage: balanceRound(telemetry.maxShotDamage), max_friendly_projectiles: telemetry.maxFriendly,
    max_hostile_projectiles: telemetry.maxHostile, phases: [...telemetry.seenPhases], attacks: [...telemetry.attacks],
    elite_spawns: typeof eliteDirector === "object" ? { ...eliteDirector.spawned } : undefined,
    field_features: [...telemetry.fieldFeatures],
    failure_reason: won ? null : player.lives <= 0 ? "pilot-death" : "fixture-time-limit", first_hit: telemetry.firstFailure,
    final_boss_hp: boss?.hp ?? null, final_boss_phase: boss?.phase ?? null,
    trace: controls.trace ?? undefined,
  };
}
