"use strict";

// 三种普通敌机共用时间成长基线，出生后不随玩家强化而补血。
const enemyTypes = {
  scout: { name: "突击机", health: 1, speed: 1.22, width: 0.82, height: 0.58, points: 100 },
  armored: { name: "重甲机", health: 2.8, speed: 0.65, width: 1.18, height: 0.72, points: 200 },
  gunner: { name: "炮击机", health: 1.5, speed: 0.8, width: 1.03, height: 0.62, points: 150 },
};
const enemyCombatRules = { armorArrival: 18, gunnerArrival: 40, maxGunners: 2,
  warning: 0.9, recovery: 0.65, shotsPerGunner: 2, maxProjectiles: 20, projectileLife: 8 };
const enemyProjectiles = [];
const enemyIntroduced = new Set();

function chooseEnemyKind(roll = Math.random()) {
  const gunnerAvailable = battleTime >= enemyCombatRules.gunnerArrival
    && enemies.filter(enemy => enemy.kind === "gunner").length < enemyCombatRules.maxGunners;
  if (gunnerAvailable && !enemyIntroduced.has("gunner")) return "gunner";
  if (battleTime >= enemyCombatRules.armorArrival && !enemyIntroduced.has("armored")) return "armored";
  if (battleTime < enemyCombatRules.armorArrival) return "scout";
  if (battleTime < enemyCombatRules.gunnerArrival) return roll < 0.65 ? "scout" : "armored";
  return roll < 0.5 ? "scout" : roll < 0.8 ? "armored" : gunnerAvailable ? "gunner" : "scout";
}
function resetEnemyCombat(resetIntroductions = true) {
  if (typeof resetFormations === "function") resetFormations(resetIntroductions);
  enemyProjectiles.length = 0;
  for (const enemy of enemies) {
    if (enemy.kind === "gunner" && enemy.gunPhase === "warning") enemy.gunPhase = "retreat";
  }
  if (resetIntroductions) enemyIntroduced.clear();
}
function enemyGunMuzzle(enemy) { return { x: enemy.x - enemy.width * 0.5, y: enemy.y }; }
function beginEnemyAim(enemy) {
  const muzzle = enemyGunMuzzle(enemy);
  const tooClose = Math.hypot(player.x - muzzle.x, player.y - muzzle.y) < Math.max(120, player.width * 0.9);
  // 玩家贴近或已经绕到炮台后方时直接撤离，不突然掉头开炮。
  if (tooClose || player.x >= muzzle.x - 55) { enemy.gunPhase = "retreat"; return; }
  enemy.gunPhase = "warning";
  enemy.gunTime = 0;
  enemy.aimX = player.x;
  enemy.aimY = player.y;
}
function fireEnemyGun(enemy) {
  if (enemyProjectiles.length >= enemyCombatRules.maxProjectiles) return;
  const muzzle = enemyGunMuzzle(enemy);
  const distance = Math.hypot(enemy.aimX - muzzle.x, enemy.aimY - muzzle.y);
  const speed = Math.min(480, 280 + battleTime * 0.15);
  enemyProjectiles.push({ x: muzzle.x, y: muzzle.y, previousX: muzzle.x, previousY: muzzle.y,
    vx: (enemy.aimX - muzzle.x) / Math.max(1, distance) * speed,
    vy: (enemy.aimY - muzzle.y) / Math.max(1, distance) * speed,
    radius: 6, age: 0 });
  gameAudio.bossAttack("volley");
}
function updateEnemyMovement(enemy, seconds) {
  enemy.previousX = enemy.x;
  enemy.previousY = enemy.y;
  if (updateAceMovement(enemy, seconds)) return;
  if (!enemy.kind || enemy.summoned) { enemy.x -= enemy.speed * seconds; return; }
  if (typeof formationControlsEnemy === "function" && formationControlsEnemy(enemy, seconds)) return;
  enemy.age = (enemy.age ?? 0) + seconds;
  if (enemy.kind === "scout") {
    enemy.x -= enemy.speed * seconds;
    enemy.y = enemy.baseY + Math.sin(enemy.age * 2.35) * enemy.waveAmplitude;
  } else if (enemy.kind === "gunner") {
    enemy.gunTime += seconds;
    if (enemy.gunPhase === "entry") {
      enemy.x = Math.max(enemy.holdX, enemy.x - enemy.speed * seconds);
      if (enemy.x <= enemy.holdX) beginEnemyAim(enemy);
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
  if (consumeEvolutionShieldProjectile(shot)) return true;
  // 用双方相对移动检测擦身而过，避免低帧率时穿过战机却不受伤。
  const x0 = shot.previousX - (player.previousX ?? player.x);
  const y0 = shot.previousY - (player.previousY ?? player.y);
  const x1 = shot.x - player.x, y1 = shot.y - player.y;
  const dx = x1 - x0, dy = y1 - y0, squared = dx * dx + dy * dy;
  const t = squared ? clamp(-(x0 * dx + y0 * dy) / squared, 0, 1) : 0;
  return Math.hypot(x0 + dx * t, y0 + dy * t) <= player.height * 0.16 + shot.radius;
}
function updateEnemyProjectileDamage() {
  if (!isBattleActive()) return;
  let hit = false;
  for (let index = enemyProjectiles.length - 1; index >= 0; index--) {
    if (enemyShotHitsPlayer(enemyProjectiles[index])) { enemyProjectiles.splice(index, 1); hit = true; }
  }
  if (hit) { tryPerfectShield(); damagePlayer("被炮击机命中"); }
}
function drawEnemyThreats() {
  context.save();
  for (const enemy of enemies) {
    if (enemy.kind !== "gunner" || enemy.gunPhase !== "warning") continue;
    const muzzle = enemyGunMuzzle(enemy);
    const dx = enemy.aimX - muzzle.x, dy = enemy.aimY - muzzle.y;
    const length = Math.hypot(dx, dy) || 1;
    context.strokeStyle = "#ff9bc9";
    context.globalAlpha = 0.45 + Math.min(1, enemy.gunTime / enemyCombatRules.warning) * 0.35;
    context.lineWidth = 1.5;
    context.setLineDash([7, 7]);
    context.beginPath(); context.moveTo(muzzle.x, muzzle.y);
    context.lineTo(muzzle.x + dx / length * viewport.width * 1.5,
      muzzle.y + dy / length * viewport.width * 1.5); context.stroke();
    context.setLineDash([]);
    context.beginPath(); context.arc(enemy.aimX, enemy.aimY, 13, 0, Math.PI * 2); context.stroke();
    context.fillStyle = "#ffd7e7";
    context.beginPath(); context.arc(muzzle.x, muzzle.y, 4 + 4 * Math.min(1, enemy.gunTime / enemyCombatRules.warning), 0, Math.PI * 2); context.fill();
  }
  context.globalAlpha = 1;
  context.lineCap = "round";
  context.shadowColor = "#ff428b";
  context.shadowBlur = reducedMotion.matches ? 0 : 10;
  for (const shot of enemyProjectiles) {
    const length = Math.hypot(shot.vx, shot.vy) || 1;
    context.strokeStyle = "#ff528c"; context.lineWidth = shot.radius * 2;
    context.beginPath(); context.moveTo(shot.x - shot.vx / length * 13, shot.y - shot.vy / length * 13);
    context.lineTo(shot.x, shot.y); context.stroke();
    context.fillStyle = "#fff1d9";
    context.beginPath(); context.arc(shot.x, shot.y, shot.radius * 0.48, 0, Math.PI * 2); context.fill();
  }
  context.restore();
}
