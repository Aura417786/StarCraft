"use strict";

// 三种普通敌机共用时间成长基线，出生后不随玩家强化而补血。
const enemyTypes = {
  scout: { name: "突击机", health: 1, speed: 1.22, width: 0.82, height: 0.58, points: 100 },
  armored: { name: "重甲机", health: 2.8, speed: 0.65, width: 1.18, height: 0.72, points: 200 },
  gunner: { name: "炮击机", health: 1.5, speed: 0.8, width: 1.03, height: 0.62, points: 150 },
};
const enemyCombatRules = { armorArrival: 14, gunnerArrival: 30, maxGunners: 2, minSpawnInterval: .32, spawnRampSeconds: 105,
  fireProtectionTime: 60, warning: .9, recovery: .57, shotsPerGunner: 2, maxProjectiles: 20, projectileLife: 8 };
const nightmareWaveRules = { firstCap: 18, maxCap: 24, gunnerCap: 3, projectileCap: 26, eliteRate: 1.3,
  intervalScale: .75, escalation: .015, minimumExposure: 1.2, breachFeedback: 2.2, scoutArrival: 38 };
const scoutTactics = { arrival: 96, windup: .86, dive: .67, tint: "#ffc084" };
const gunnerTactics = { relayArrival: 55, leadArrival: 48, relayDelay: .32, leadTint: "#82e5ff", relayTint: "#ffc37c" };
const enemyFireProtection = {
  scout: { hit: 0.72, burst: 0.80, refill: 1.30 },
  gunner: { hit: 0.58, burst: 0.70, refill: 1.25 },
  armored: { hit: 0.44, burst: 0.62, refill: 0.83 },
  ace: { hit: 0.36, burst: 0.52, refill: 0.54 },
  transport: { hit: 0.36, burst: 0.52, refill: 0.54 },
};
function enemyProtectionAtBirth(kind) {
  return battleTime >= enemyCombatRules.fireProtectionTime ? enemyFireProtection[kind] : undefined;
}
const enemyProjectiles = [];
const enemyIntroduced = new Set();

function enemyIntervalForTime() {
  const minimum = enemyCombatRules.minSpawnInterval;
  const interval = minimum + (enemyRules.interval - minimum) * Math.exp(-battleTime / enemyCombatRules.spawnRampSeconds);
  if (isAbyssalNightmare()) return interval * (nightmareWaveRules.intervalScale - nightmareWaveRules.escalation * nightmareWaveTier());
  return interval / sortieRules().attackTempo;
}

function nightmareWaveTier() { return Math.min(3, Math.floor(bossDefeated / 3)); }
function enemyWaveCapacity() {
  if (!isAbyssalNightmare()) return enemyRules.maxOnScreen;
  return Math.min(nightmareWaveRules.maxCap, nightmareWaveRules.firstCap + nightmareWaveTier() * 2);
}
function enemyGunnerCapacity() { return isAbyssalNightmare() ? nightmareWaveRules.gunnerCap : enemyCombatRules.maxGunners; }
function enemyProjectileCapacity() { return isAbyssalNightmare() ? nightmareWaveRules.projectileCap : enemyCombatRules.maxProjectiles; }
function eliteEncounterInterval(interval) { return isAbyssalNightmare() ? interval / nightmareWaveRules.eliteRate : interval; }
function nightmareSplitReserve() { return Number(isAbyssalNightmare() && enemies.some(enemy => enemy.kind === "splitter")); }

function updateScheduledEnemyWaves(seconds) {
  const nightmare = isAbyssalNightmare();
  const supplyEncounter = battlefieldEventBlocksWaves();
  const aceEncounterActive = aceBlocksWaves();
  if ((supplyEncounter || aceEncounterActive) && !nightmare) return;
  // Signature encounters retain their own fire rhythm. A small scout patrol fills the quiet gaps.
  if (aceEncounter.warning > 0) return;
  const reinforcements = supplyEncounter || aceEncounterActive;
  enemyCooldown -= seconds;
  if (enemyCooldown > 1e-8) return;
  const reserve = Number(enemies.some(enemy => enemy.kind === "splitter"));
  const capacity = (reinforcements ? 5 + nightmareWaveTier() : enemyWaveCapacity()) - reserve;
  const interval = reinforcements ? 2.05 - nightmareWaveTier() * .15 : enemyIntervalForTime();
  if (enemies.length < capacity) {
    const elite = reinforcements ? null : eliteWaveKind();
    spawnEnemy(elite ?? (reinforcements ? "scout" : undefined));
    if (nightmare) {
      const lead = enemies.at(-1);
      markDefenseIntruder(lead);
      const pairEvery = 5 - Number(nightmareWaveTier() >= 2);
      if (!reinforcements && enemySpawnCount % pairEvery === 0 && enemies.length + Number(lead.kind === "splitter") < capacity) {
        spawnEnemy("scout");
        const wing = enemies.at(-1);
        markDefenseIntruder(wing);
        wing.x += wing.speed * interval * .42;
        wing.previousX = wing.x;
        const span = flightBounds.bottom - flightBounds.top;
        wing.y = wing.baseY = flightBounds.top + span * (lead.y < flightBounds.top + span * .5 ? .77 : .23);
        wing.previousY = wing.y;
        wing.sacrificialScout = true;
      }
    }
  }
  enemyCooldown += interval;
}

function markDefenseIntruder(enemy) {
  if (!isAbyssalNightmare()) return;
  enemy.defenseExposure = 0;
  enemy.speed = Math.min(enemy.speed, viewport.width / 2.8);
}

function trackDefenseIntruder(enemy, seconds) {
  if (enemy.defenseExposure === undefined || enemy.defenseExposure >= nightmareWaveRules.minimumExposure) return;
  const halfWidth = enemy.width * .5;
  if (enemy.x - halfWidth >= 0 && enemy.x + halfWidth <= viewport.width
    && enemy.y - enemy.height * .5 >= 0 && enemy.y + enemy.height * .5 <= viewport.height) enemy.defenseExposure += seconds;
}

function drawImminentDefenseThreat() {
  if (!isAbyssalNightmare()) return;
  const lastMuzzleX = flightBounds.left + player.width * .465;
  let target = null;
  let urgency = Infinity;
  for (const enemy of enemies) {
    if (enemy.hp <= 0 || enemy.defenseExposure === undefined || enemy.x < 0 || enemy.y < 0 || enemy.y > viewport.height) continue;
    const lastShotX = lastMuzzleX + enemy.width * .34;
    const seconds = (enemy.x - lastShotX) / Math.max(70, enemy.speed);
    if (seconds > 1.28 || seconds >= urgency) continue;
    target = enemy;
    urgency = seconds;
  }
  if (!target) return;
  const size = Math.max(5, target.height * .09);
  const x = target.x - target.width * .52, y = target.y - target.height * .54;
  context.save();
  context.strokeStyle = urgency > 0 ? "#ffc291" : "#ff907b";
  context.globalAlpha = .82;
  context.lineWidth = 1.8;
  context.beginPath();
  context.moveTo(x + size, y - size); context.lineTo(x, y); context.lineTo(x + size, y + size);
  context.moveTo(x + size * 2, y - size); context.lineTo(x + size, y); context.lineTo(x + size * 2, y + size);
  context.moveTo(7, target.y - 10); context.lineTo(7, target.y + 10);
  context.stroke();
  context.restore();
}

function recordDefenseBreach(enemy) {
  if (!isAbyssalNightmare() || !isBattleActive() || enemy.hp <= 0 || enemy.defenseBreached
    || !(enemy.defenseExposure >= nightmareWaveRules.minimumExposure)) return false;
  const halfWidth = enemy.width * .5;
  if (enemy.x + halfWidth >= 0 || (enemy.previousX ?? enemy.x) + halfWidth < 0) return false;
  if (!damagePlayer(tr("敌机突破防线", "Enemy breached the defense line"), enemy, { defenseBreach: true })) return false;
  enemy.defenseBreached = true;
  sortieStats.enemyBreachAt = battleTime;
  sortieStats.enemyBreachY = enemy.y;
  addEvolutionPulse(7, enemy.y, 54, "#ff8d75", .52);
  addCombatShake(1.7);
  return true;
}

function drawDefenseBreach(quiet) {
  if (!isAbyssalNightmare() || sortieStats.enemyBreachAt === undefined) return;
  const age = battleTime - sortieStats.enemyBreachAt;
  const remaining = nightmareWaveRules.breachFeedback - age;
  if (age < 0 || remaining <= 0) return;
  const labelY = clamp(sortieStats.enemyBreachY, 148, Math.max(148, viewport.height - 135));
  context.save();
  context.globalAlpha = quiet ? .92 : Math.min(.98, remaining * 2.5);
  context.strokeStyle = "#ff987d";
  context.fillStyle = "#ffe2ca";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(10, labelY - 14); context.lineTo(10, labelY + 14);
  context.moveTo(20, labelY - 6); context.lineTo(14, labelY); context.lineTo(20, labelY + 6);
  context.stroke();
  context.font = "700 13px system-ui, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(tr("敌机突破防线 · 生命 −1", "Defense breached · Life −1"), 28, labelY, Math.max(120, viewport.width * .37));
  context.restore();
}

function chooseEnemyKind(roll = typeof combatRandom === "function" ? combatRandom() : Math.random()) {
  const gunnerAvailable = battleTime >= enemyCombatRules.gunnerArrival
    && enemies.filter(enemy => enemy.kind === "gunner").length < enemyGunnerCapacity();
  if (gunnerAvailable && !enemyIntroduced.has("gunner")) return "gunner";
  if (battleTime >= enemyCombatRules.armorArrival && !enemyIntroduced.has("armored")) return "armored";
  if (battleTime < enemyCombatRules.armorArrival) return "scout";
  if (battleTime < enemyCombatRules.gunnerArrival) return roll < .58 ? "scout" : "armored";
  const gunnerCutoff = battleTime >= 120 ? .68 : .74;
  return roll < .43 ? "scout" : roll < gunnerCutoff ? "armored" : gunnerAvailable ? "gunner" : "scout";
}
function resetEnemyCombat(resetIntroductions = true) {
  if (typeof resetEliteEncounters === "function") resetEliteEncounters(resetIntroductions);
  if (typeof resetFormations === "function") resetFormations(resetIntroductions);
  clearCombatRounds(enemyProjectiles);
  for (const enemy of enemies) {
    if (enemy.kind === "gunner" && (enemy.gunPhase === "warning" || enemy.gunPhase === "relay")) enemy.gunPhase = "retreat";
  }
  if (resetIntroductions) enemyIntroduced.clear();
}
function enemyGunMuzzle(enemy) { return { x: enemy.x - enemy.width * 0.5, y: enemy.y }; }
function enemyCanLockOn({ x, y }) {
  return player.x < x - 55 && Math.hypot(player.x - x, player.y - y) >= Math.max(120, player.width * .9);
}
function gunnerTacticsOpen() {
  return flightBounds.bottom - flightBounds.top >= (player.height * .16 + 6) * 3.4
    && !(typeof bossBlocksWaves === "function" && bossBlocksWaves())
    && !(typeof formationState !== "undefined" && (formationState.warning || formationState.active))
    && !(typeof aceBlocksWaves === "function" && aceBlocksWaves());
}
function beginEnemyAim(enemy, relay = false) {
  // 玩家贴近或已经绕到炮台后方时直接撤离，不突然掉头开炮。
  if (!enemyCanLockOn(enemyGunMuzzle(enemy))) { enemy.gunPhase = "retreat"; return; }
  enemy.gunPhase = "warning";
  enemy.gunTime = 0;
  enemy.gunWarning = enemyCombatRules.warning + (typeof sortieWarningBonus === "function" ? sortieWarningBonus() * .55 : 0);
  enemy.aimX = player.x;
  enemy.aimY = player.y;
  enemy.gunAimKind = "direct";
  enemy.gunSpread = !relay && battleTime >= 120 && enemy.gunShots % 2 === 1 ? .14 : 0;
  if (relay) {
    const span = flightBounds.bottom - flightBounds.top;
    const pinY = flightBounds.top + enemy.gunRelayLane * span;
    const lead = Math.min(82, span * .24);
    const escaped = player.y - pinY;
    const longerSide = flightBounds.bottom - pinY >= pinY - flightBounds.top ? 1 : -1;
    const side = Math.abs(escaped) >= lead * .32 ? Math.sign(escaped) : longerSide;
    enemy.aimY = clamp(player.y + side * lead, flightBounds.top, flightBounds.bottom);
    if (Math.abs(enemy.aimY - pinY) < lead) enemy.aimY = pinY + longerSide * lead;
    enemy.gunAimKind = "relay";
  } else if (!enemy.formationId && battleTime >= gunnerTactics.leadArrival && enemy.gunShots === 0
    && enemy.holdX > viewport.width * .775 && gunnerTacticsOpen()) {
    const drift = player.y - (player.previousY ?? player.y);
    if (Math.abs(drift) >= 1.25) {
      const reach = Math.min(72, (flightBounds.bottom - flightBounds.top) * .24);
      enemy.aimY = clamp(player.y + Math.sign(drift) * reach, flightBounds.top, flightBounds.bottom);
      enemy.gunAimKind = "lead";
    }
  }
}
function queueGunnerRelay(leader) {
  if (leader.formationId || leader.gunAimKind === "relay" || leader.gunShots !== 0
    || battleTime < gunnerTactics.relayArrival || !gunnerTacticsOpen()) return;
  const span = flightBounds.bottom - flightBounds.top;
  const altitude = Math.min(player.height * .6, span * .24);
  const partner = enemies.find(enemy => enemy !== leader && enemy.kind === "gunner" && !enemy.formationId
    && !enemy.summoned && enemy.gunShots < enemyCombatRules.shotsPerGunner
    && Math.abs(enemy.y - leader.y) >= altitude
    && enemy.x <= viewport.width - enemy.width * .5
    && enemyCanLockOn(enemyGunMuzzle(enemy))
    && ((enemy.gunPhase === "warning" && enemy.gunTime < .45) || enemy.gunPhase === "recover"
      || (enemy.gunPhase === "entry" && enemy.x <= enemy.holdX + enemy.speed * .35)));
  if (!partner) return;
  partner.gunRelayLane = clamp((leader.aimY - flightBounds.top) / span, 0, 1);
  partner.gunPhase = "relay";
  partner.gunTime = 0;
}
function enemyGunAngles(enemy) { return enemy.gunSpread ? [0, -enemy.gunSpread, enemy.gunSpread] : [0]; }
function gunnerAimTint(kind) {
  return kind === "relay" ? gunnerTactics.relayTint : kind === "lead" ? gunnerTactics.leadTint : null;
}
function fireEnemyGun(enemy) {
  const capacity = enemyProjectileCapacity();
  if (enemyProjectiles.length >= capacity) return;
  const muzzle = enemyGunMuzzle(enemy);
  if (isAbyssalNightmare() && !enemyCanLockOn(muzzle)) return;
  const heading = Math.atan2(enemy.aimY - muzzle.y, enemy.aimX - muzzle.x);
  const speed = Math.min(625, 335 + battleTime * .42 + (enemy.gunAimKind === "relay" ? 75 : 0))
    * (typeof sortieRules === "function" ? sortieRules().projectileSpeed : 1);
  for (const spread of enemyGunAngles(enemy)) {
    if (enemyProjectiles.length >= capacity) break;
    const shot = acquireHostileRound(muzzle.x, muzzle.y,
      Math.cos(heading + spread) * speed, Math.sin(heading + spread) * speed, 6);
    shot.aimKind = enemy.gunAimKind;
    shot.tint = gunnerAimTint(enemy.gunAimKind);
    enemyProjectiles.push(shot);
  }
  gameAudio.bossAttack(enemy.gunAimKind === "relay" ? "burst" : "volley", enemy.x, enemy.y, false);
  queueGunnerRelay(enemy);
}
function scoutInterceptRoute(enemy) {
  const cue = enemy.scoutIntercept;
  const span = flightBounds.bottom - flightBounds.top;
  return { x: cue.endX * viewport.width, y: flightBounds.top + cue.endY * span };
}

function updateScoutIntercept(enemy, seconds) {
  const cue = enemy.scoutIntercept;
  if (!cue) {
    const sacrificial = isAbyssalNightmare() && enemy.sacrificialScout;
    const eligible = !enemy.scoutIntercepted && !enemy.formationId && battleTime >= (sacrificial ? nightmareWaveRules.scoutArrival : scoutTactics.arrival)
      && enemy.x <= viewport.width * .76 && enemy.x >= player.x + Math.max(235, player.width * 1.5)
      && gunnerTacticsOpen() && !enemies.some(wing => wing.scoutIntercept);
    if (!eligible) return false;
    const span = flightBounds.bottom - flightBounds.top;
    if (span < player.height * 1.6) return false;
    const reach = Math.min(span * .24, 112);
    const aimY = clamp(player.y, enemy.y - reach, enemy.y + reach);
    const landingX = Math.max(-enemy.width * .45, enemy.x - enemy.speed * 1.42);
    const blast = sacrificial && landingX > flightBounds.left + Math.max(48, player.width * .66)
      ? clamp(player.height * .62, 30, 57) : 0;
    enemy.scoutIntercepted = true;
    enemy.scoutIntercept = { time: 0, start: null, blast, windup: scoutTactics.windup + (blast ? .22 : 0),
      endX: landingX / viewport.width, endY: clamp((aimY - flightBounds.top) / span, 0, 1) };
    gameAudio.bossAttack("coil", enemy.x, enemy.y, false);
    return false;
  }
  if (!cue.start && !gunnerTacticsOpen()) {
    enemy.scoutIntercept = null;
    return false;
  }
  cue.time += seconds;
  const windup = cue.windup ?? scoutTactics.windup;
  if (cue.time < windup) {
    enemy.x -= enemy.speed * .52 * seconds;
    return true;
  }
  const { x, y } = scoutInterceptRoute(enemy);
  const span = flightBounds.bottom - flightBounds.top;
  if (!cue.start) {
    cue.start = { x: enemy.x / viewport.width, y: clamp((enemy.y - flightBounds.top) / Math.max(1, span), 0, 1) };
    gameAudio.bossAttack("volley", enemy.x, enemy.y, false);
  }
  const progress = clamp((cue.time - windup) / scoutTactics.dive, 0, 1);
  const ease = progress * progress * (3 - 2 * progress);
  const fromX = cue.start.x * viewport.width, fromY = flightBounds.top + cue.start.y * span;
  enemy.x = fromX + (x - fromX) * ease;
  enemy.y = fromY + (y - fromY) * ease;
  if (progress >= 1) {
    enemy.baseY = enemy.y - Math.sin(enemy.age * 2.35) * enemy.waveAmplitude;
    enemy.scoutIntercept = null;
    if (cue.blast) enemy.scoutDetonation = cue.blast;
  }
  return true;
}

function settleScoutDetonation(enemy) {
  const radius = enemy.scoutDetonation;
  combatBurst(enemy.x, enemy.y, .9, scoutTactics.tint, true);
  addEvolutionPulse(enemy.x, enemy.y, radius, scoutTactics.tint, .33);
  gameAudio.fieldCue?.("mine-burst", enemy.x, enemy.y);
  if (Math.hypot(player.x - enemy.x, player.y - enemy.y) <= radius + player.height * .16) {
    damagePlayer(tr("被突击机自爆波及 · 远离橙色落点", "Scout detonation · Leave the amber impact zone"), enemy);
  }
}

function updateEnemyMovement(enemy, seconds) {
  enemy.previousX = enemy.x;
  enemy.previousY = enemy.y;
  if (updateAceMovement(enemy, seconds)) return;
  if (!enemy.kind || enemy.summoned) { enemy.x -= enemy.speed * seconds; return; }
  if (typeof formationControlsEnemy === "function" && formationControlsEnemy(enemy, seconds)) return;
  if (typeof updateEliteEnemy === "function" && updateEliteEnemy(enemy, seconds)) return;
  enemy.age = (enemy.age ?? 0) + seconds;
  if (enemy.kind === "scout") {
    if (updateScoutIntercept(enemy, seconds)) return;
    enemy.x -= enemy.speed * seconds;
    enemy.y = enemy.baseY + Math.sin(enemy.age * 2.35) * enemy.waveAmplitude;
  } else if (enemy.kind === "gunner") {
    enemy.gunTime += seconds;
    if (enemy.gunPhase === "entry") {
      enemy.x = Math.max(enemy.holdX, enemy.x - enemy.speed * seconds);
      if (enemy.x <= enemy.holdX) beginEnemyAim(enemy);
    } else if (enemy.gunPhase === "relay") {
      if (enemy.x > enemy.holdX) enemy.x = Math.max(enemy.holdX, enemy.x - enemy.speed * seconds);
      if (enemy.gunTime + 1e-9 >= gunnerTactics.relayDelay && enemy.x <= enemy.holdX)
        beginEnemyAim(enemy, gunnerTacticsOpen());
    } else if (enemy.gunPhase === "warning") {
      if (isAbyssalNightmare() && enemy.gunAimKind === "direct" && enemy.gunTime < enemy.gunWarning * .44) {
        const span = flightBounds.bottom - flightBounds.top;
        const drift = (player.y - (player.previousY ?? player.y)) / Math.max(seconds, 1 / 120);
        const target = clamp(player.y + clamp(drift * .12, -span * .17, span * .17), flightBounds.top, flightBounds.bottom);
        enemy.aimY += clamp(target - enemy.aimY, -230 * seconds, 230 * seconds);
      }
      if (enemy.gunTime + 1e-9 >= (enemy.gunWarning ?? enemyCombatRules.warning)) {
        fireEnemyGun(enemy);
        enemy.gunShots++;
        enemy.gunPhase = "recover";
        enemy.gunTime = 0;
      }
    } else if (enemy.gunPhase === "recover") {
      const tempo = typeof sortieRules === "function" ? sortieRules().attackTempo : 1;
      if (enemy.gunTime + 1e-9 >= enemyCombatRules.recovery / tempo) {
        if (enemy.gunShots >= enemyCombatRules.shotsPerGunner) enemy.gunPhase = "retreat";
        else beginEnemyAim(enemy);
      }
    } else enemy.x -= enemy.speed * seconds;
  } else enemy.x -= enemy.speed * seconds;
}
function updateEnemyProjectiles(seconds) {
  if (!isBattleActive()) return;
  for (let index = enemyProjectiles.length - 1; index >= 0; index--) {
    const shot = enemyProjectiles[index];
    shot.previousX = shot.x; shot.previousY = shot.y;
    applyGravityTide(shot, seconds, "enemy");
    shot.x += shot.vx * seconds; shot.y += shot.vy * seconds; shot.age += seconds;
    if (shot.age >= enemyCombatRules.projectileLife || shot.x < -40 || shot.x > viewport.width + 40
      || shot.y < -40 || shot.y > viewport.height + 40) retireCombatRound(enemyProjectiles, index);
  }
}
function enemyShotHitsPlayer(shot) {
  return consumeEvolutionShieldProjectile(shot) || hostileShotHitsHull(shot, player);
}
function updateEnemyProjectileDamage() {
  if (!isBattleActive()) return;
  let contact;
  for (let index = enemyProjectiles.length - 1; index >= 0; index--) {
    const shot = enemyProjectiles[index];
    if (enemyShotHitsPlayer(shot)) { retireCombatRound(enemyProjectiles, index); contact = shot; }
  }
  if (!contact) return;
  tryPerfectShield();
  const message = contact.source === "ace" ? tr("被王牌炮火命中 · 第二次锁定后再变向", "Hit by the ace · Turn after the second lock")
    : contact.aimKind === "relay" ? tr("被接力炮火命中 · 躲开第二条橙色射线", "Hit by relay fire · Leave the second orange line")
    : tr("被炮击机命中", "Hit by a gunship");
  damagePlayer(message, contact);
}
function drawEnemyThreats(bossShotCount = 0, detailStride = 1, quietShots = reducedMotion.matches, alpha = 1) {
  context.save();
  for (const enemy of enemies) {
    const intercept = enemy.scoutIntercept;
    if (intercept && (!intercept.start || intercept.blast)) {
      const progress = clamp(intercept.time / (intercept.windup ?? scoutTactics.windup), 0, 1);
      const end = scoutInterceptRoute(enemy);
      context.globalAlpha = .5 + progress * .32;
      context.strokeStyle = scoutTactics.tint;
      context.lineWidth = 2;
      context.setLineDash([10, 6]);
      if (!intercept.start) {
        context.beginPath(); context.moveTo(enemy.x, enemy.y); context.lineTo(end.x, end.y); context.stroke();
      }
      context.setLineDash([]);
      context.beginPath();
      context.arc(end.x, end.y, intercept.blast || 13 + progress * 6, 0, Math.PI * 2);
      if (intercept.blast) { context.fillStyle = "#ff9a3826"; context.fill(); }
      context.stroke();
    }
    if (enemy.kind !== "gunner") continue;
    if (enemy.gunPhase === "relay") {
      const muzzle = enemyGunMuzzle(enemy);
      const progress = clamp(enemy.gunTime / gunnerTactics.relayDelay, 0, 1);
      context.strokeStyle = gunnerTactics.relayTint;
      context.globalAlpha = .62 + progress * .25;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(muzzle.x, muzzle.y, 9 + progress * 10, 0, Math.PI * 2);
      context.stroke();
      continue;
    }
    if (enemy.gunPhase !== "warning") continue;
    const muzzle = enemyGunMuzzle(enemy);
    const heading = Math.atan2(enemy.aimY - muzzle.y, enemy.aimX - muzzle.x);
    const tint = gunnerAimTint(enemy.gunAimKind);
    context.strokeStyle = tint || "#ff9bc9";
    const warningProgress = Math.min(1, enemy.gunTime / (enemy.gunWarning ?? enemyCombatRules.warning));
    context.globalAlpha = 0.45 + warningProgress * 0.35;
    context.lineWidth = tint ? 2 : 1.5;
    context.setLineDash(enemy.gunAimKind === "relay" ? [14, 4, 3, 4] : [7, 7]);
    context.beginPath();
    for (const spread of enemyGunAngles(enemy)) {
      context.moveTo(muzzle.x, muzzle.y);
      context.lineTo(muzzle.x + Math.cos(heading + spread) * viewport.width * 1.5,
        muzzle.y + Math.sin(heading + spread) * viewport.width * 1.5);
    }
    context.stroke();
    context.setLineDash([]);
    context.beginPath(); context.arc(enemy.aimX, enemy.aimY, 13, 0, Math.PI * 2); context.stroke();
    if (typeof drawFlightLattice === "function")
      drawFlightLattice(context, enemy.aimX, enemy.aimY, 17 - warningProgress * 3, 17 - warningProgress * 3,
        tint || "#ffb2d0", warningProgress * 2, .66, .34);
    context.fillStyle = tint || "#ffd7e7";
    context.beginPath(); context.arc(muzzle.x, muzzle.y, 4 + 4 * warningProgress, 0, Math.PI * 2); context.fill();
  }
  context.globalAlpha = 1;
  const hostileCount = bossShotCount + enemyProjectiles.length;
  for (let index = 0; index < enemyProjectiles.length; index++) {
    const shot = enemyProjectiles[index];
    drawHostileProjectile(context, shot, shot.formationTint || shot.tint || "#ff528c", quietShots,
      (bossShotCount + index) % detailStride === 0, hostileCount > 96, alpha);
  }
  context.restore();
  drawImminentDefenseThreat();
  drawDefenseBreach(quietShots);
}
