"use strict";

// 三种普通敌机共用时间成长基线，出生后不随玩家强化而补血。
const enemyTypes = {
  scout: { name: "突击机", health: 1, speed: 1.22, width: 0.82, height: 0.58, points: 100 },
  armored: { name: "重甲机", health: 2.8, speed: 0.65, width: 1.18, height: 0.72, points: 200 },
  gunner: { name: "炮击机", health: 1.5, speed: 0.8, width: 1.03, height: 0.62, points: 150 },
};
const enemyCombatRules = { armorArrival: 14, gunnerArrival: 30, maxGunners: 2, minSpawnInterval: .32, spawnRampSeconds: 105,
  fireProtectionTime: 60, warning: .9, recovery: .57, shotsPerGunner: 2, maxProjectiles: 20, projectileLife: 8 };
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
  return minimum + (enemyRules.interval - minimum) * Math.exp(-battleTime / enemyCombatRules.spawnRampSeconds);
}

function chooseEnemyKind(roll = Math.random()) {
  const gunnerAvailable = battleTime >= enemyCombatRules.gunnerArrival
    && enemies.filter(enemy => enemy.kind === "gunner").length < enemyCombatRules.maxGunners;
  if (gunnerAvailable && !enemyIntroduced.has("gunner")) return "gunner";
  if (battleTime >= enemyCombatRules.armorArrival && !enemyIntroduced.has("armored")) return "armored";
  if (battleTime < enemyCombatRules.armorArrival) return "scout";
  if (battleTime < enemyCombatRules.gunnerArrival) return roll < .58 ? "scout" : "armored";
  const gunnerCutoff = battleTime >= 120 ? .68 : .74;
  return roll < .43 ? "scout" : roll < gunnerCutoff ? "armored" : gunnerAvailable ? "gunner" : "scout";
}
function resetEnemyCombat(resetIntroductions = true) {
  if (typeof resetFormations === "function") resetFormations(resetIntroductions);
  enemyProjectiles.length = 0;
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
  if (enemyProjectiles.length >= enemyCombatRules.maxProjectiles) return;
  const muzzle = enemyGunMuzzle(enemy);
  const heading = Math.atan2(enemy.aimY - muzzle.y, enemy.aimX - muzzle.x);
  const speed = Math.min(625, 335 + battleTime * .42 + (enemy.gunAimKind === "relay" ? 75 : 0));
  for (const spread of enemyGunAngles(enemy)) {
    if (enemyProjectiles.length >= enemyCombatRules.maxProjectiles) break;
    enemyProjectiles.push({ x: muzzle.x, y: muzzle.y, previousX: muzzle.x, previousY: muzzle.y,
      vx: Math.cos(heading + spread) * speed, vy: Math.sin(heading + spread) * speed,
      radius: 6, age: 0, aimKind: enemy.gunAimKind, tint: gunnerAimTint(enemy.gunAimKind) });
  }
  gameAudio.bossAttack(enemy.gunAimKind === "relay" ? "burst" : "volley");
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
    const eligible = !enemy.scoutIntercepted && !enemy.formationId && battleTime >= scoutTactics.arrival
      && enemy.x <= viewport.width * .76 && enemy.x >= player.x + Math.max(235, player.width * 1.5)
      && gunnerTacticsOpen() && !enemies.some(wing => wing.scoutIntercept);
    if (!eligible) return false;
    const span = flightBounds.bottom - flightBounds.top;
    if (span < player.height * 1.6) return false;
    const reach = Math.min(span * .24, 112);
    const aimY = clamp(player.y, enemy.y - reach, enemy.y + reach);
    const landingX = Math.max(-enemy.width * .45, enemy.x - enemy.speed * 1.42);
    enemy.scoutIntercepted = true;
    enemy.scoutIntercept = { time: 0, start: null,
      endX: landingX / viewport.width, endY: clamp((aimY - flightBounds.top) / span, 0, 1) };
    gameAudio.bossAttack("coil");
    return false;
  }
  if (!cue.start && !gunnerTacticsOpen()) {
    enemy.scoutIntercept = null;
    return false;
  }
  cue.time += seconds;
  if (cue.time < scoutTactics.windup) {
    enemy.x -= enemy.speed * .52 * seconds;
    return true;
  }
  const { x, y } = scoutInterceptRoute(enemy);
  const span = flightBounds.bottom - flightBounds.top;
  if (!cue.start) {
    cue.start = { x: enemy.x / viewport.width, y: clamp((enemy.y - flightBounds.top) / Math.max(1, span), 0, 1) };
    gameAudio.bossAttack("volley");
  }
  const progress = clamp((cue.time - scoutTactics.windup) / scoutTactics.dive, 0, 1);
  const ease = progress * progress * (3 - 2 * progress);
  const fromX = cue.start.x * viewport.width, fromY = flightBounds.top + cue.start.y * span;
  enemy.x = fromX + (x - fromX) * ease;
  enemy.y = fromY + (y - fromY) * ease;
  if (progress >= 1) {
    enemy.baseY = enemy.y - Math.sin(enemy.age * 2.35) * enemy.waveAmplitude;
    enemy.scoutIntercept = null;
  }
  return true;
}

function updateEnemyMovement(enemy, seconds) {
  enemy.previousX = enemy.x;
  enemy.previousY = enemy.y;
  if (updateAceMovement(enemy, seconds)) return;
  if (!enemy.kind || enemy.summoned) { enemy.x -= enemy.speed * seconds; return; }
  if (typeof formationControlsEnemy === "function" && formationControlsEnemy(enemy, seconds)) return;
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
      if (enemy.gunTime + 1e-9 >= enemyCombatRules.warning) {
        fireEnemyGun(enemy);
        enemy.gunShots++;
        enemy.gunPhase = "recover";
        enemy.gunTime = 0;
      }
    } else if (enemy.gunPhase === "recover") {
      if (enemy.gunTime + 1e-9 >= enemyCombatRules.recovery) {
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
      || shot.y < -40 || shot.y > viewport.height + 40) enemyProjectiles.splice(index, 1);
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
    if (enemyShotHitsPlayer(shot)) { enemyProjectiles.splice(index, 1); contact = shot; }
  }
  if (!contact) return;
  tryPerfectShield();
  const message = contact.source === "ace" ? tr("被王牌炮火命中 · 第二次锁定后再变向", "Hit by the ace · Turn after the second lock")
    : contact.aimKind === "relay" ? tr("被接力炮火命中 · 躲开第二条橙色射线", "Hit by relay fire · Leave the second orange line")
    : tr("被炮击机命中", "Hit by a gunship");
  damagePlayer(message);
}
function drawEnemyThreats() {
  context.save();
  for (const enemy of enemies) {
    if (enemy.scoutIntercept && !enemy.scoutIntercept.start) {
      const progress = clamp(enemy.scoutIntercept.time / scoutTactics.windup, 0, 1);
      const end = scoutInterceptRoute(enemy);
      context.globalAlpha = .5 + progress * .32;
      context.strokeStyle = scoutTactics.tint;
      context.lineWidth = 2;
      context.setLineDash([10, 6]);
      context.beginPath();
      context.moveTo(enemy.x, enemy.y);
      context.lineTo(end.x, end.y);
      context.stroke();
      context.setLineDash([]);
      context.beginPath();
      context.arc(end.x, end.y, 13 + progress * 6, 0, Math.PI * 2);
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
    context.globalAlpha = 0.45 + Math.min(1, enemy.gunTime / enemyCombatRules.warning) * 0.35;
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
    context.fillStyle = tint || "#ffd7e7";
    context.beginPath(); context.arc(muzzle.x, muzzle.y, 4 + 4 * Math.min(1, enemy.gunTime / enemyCombatRules.warning), 0, Math.PI * 2); context.fill();
  }
  context.globalAlpha = 1;
  for (const shot of enemyProjectiles) {
    drawHostileProjectile(context, shot, shot.formationTint || shot.tint || "#ff528c", reducedMotion.matches);
  }
  context.restore();
}
