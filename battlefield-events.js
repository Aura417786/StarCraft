"use strict";

// 中立物件和运输舰使用有效战斗时钟；暂停、首领预警和进化不会偷走反应时间。
const battlefieldEvents = { objects: [], fragments: [], nextObject: 16, nextTransport: 52,
  objectCount: 0, transport: null, notice: "", noticeTime: 0, clock: 0 };
function resetBattlefieldEvents(resetProgress = true) {
  battlefieldEvents.objects.length = 0;
  battlefieldEvents.fragments.length = 0;
  battlefieldEvents.transport = null;
  battlefieldEvents.notice = ""; battlefieldEvents.noticeTime = 0;
  if (resetProgress) {
    battlefieldEvents.nextObject = 16; battlefieldEvents.nextTransport = 52;
    battlefieldEvents.objectCount = 0; battlefieldEvents.clock = 0;
  } else {
    battlefieldEvents.nextObject = Math.max(battlefieldEvents.nextObject, battleTime + 10);
    battlefieldEvents.nextTransport = Math.max(battlefieldEvents.nextTransport, battleTime + 25);
  }
}
function battlefieldEventBlocksWaves() {
  return !!battlefieldEvents.transport && enemies.includes(battlefieldEvents.transport);
}
function announceBattlefieldEvent(text, duration = 4) {
  battlefieldEvents.notice = text; battlefieldEvents.noticeTime = duration;
  statusMessage.textContent = text;
}
function spawnBattlefieldObject(kind, journeyCover = false) {
  if (battlefieldEvents.objects.length >= 3 || viewport.width < 420 || viewport.height < 360) return null;
  if (!kind) {
    const sector = battlefieldSectors[battlefieldState.sector]?.id;
    kind = sector === "belt" ? "asteroid" : sector === "wreck" || battlefieldEvents.objectCount % 3 === 1 ? "wreck" : "cell";
  }
  const width = kind !== "cell" ? Math.min(112, player.width * 0.72) : Math.min(62, player.width * 0.43);
  const lane = [0.3, 0.68, 0.48][battlefieldEvents.objectCount % 3];
  const y = flightBounds.top + (flightBounds.bottom - flightBounds.top) * lane;
  const x = viewport.width + width;
  const object = { kind, x, previousX: x, y, previousY: y, width, height: width * (kind === "wreck" ? 0.65 : 0.72),
    hp: 1, maxHp: 1, healthLog: progressionReferenceDpsLog(battleTime) + Math.log(kind === "cell" ? .45 : 1.3),
    speed: kind === "cell" ? 86 : kind === "asteroid" ? 93 : 62, hitFlash: 0, phase: battlefieldEvents.objectCount * 1.7, age: 0 };
  battlefieldEvents.objects.push(object);
  if (journeyCover) return object;
  battlefieldEvents.objectCount++;
  if (battlefieldEvents.objectCount <= 2 || kind === "asteroid") announceBattlefieldEvent(kind === "cell"
    ? tr("能源罐 · 射爆可清除附近敌弹，并炸伤敌军", "Energy canister · Shoot to clear nearby bullets and damage enemies")
    : kind === "asteroid"
      ? tr("可击碎陨石 · 碎石会飞向敌机", "Fracturable asteroid · Shards can strike enemies")
      : tr("漂浮残骸 · 可挡普通敌弹，也会挡住主炮", "Drifting wreckage · Blocks enemy shots and your main gun"));
  return object;
}
function spawnSupplyTransport() {
  if (aceBlocksWaves() || gravityTideBusy()) return null;
  if (enemies.length > enemyRules.maxOnScreen - 3 || viewport.width < 520 || viewport.height < 380) return null;
  const width = Math.min(155, player.width * 0.96), x = viewport.width + width;
  const y = flightBounds.top + (flightBounds.bottom - flightBounds.top) * (battlefieldEvents.objectCount % 2 ? 0.35 : 0.65);
  const target = { kind: "transport", x, previousX: x, y, previousY: y, baseY: y, width, height: width * 0.61,
    hp: 1, maxHp: 1, displayHp: 1, healthLog: progressionReferenceDpsLog(battleTime) + Math.log(2.6) + enemyDurabilityLog(battleTime),
    fireProtection: enemyProtectionAtBirth("transport"),
    speed: Math.min(145, 82 + battleTime * 0.045), hitFlash: 0, age: 0, points: 600 };
  enemies.push(target); battlefieldEvents.transport = target;
  for (const side of [-1, 1]) {
    if (enemies.length >= enemyRules.maxOnScreen) break;
    spawnEnemy("scout");
    const escort = enemies[enemies.length - 1];
    escort.x = escort.previousX = x + width * 0.38;
    escort.y = escort.previousY = escort.baseY = clamp(y + side * width * 0.55, flightBounds.top, flightBounds.bottom);
    escort.speed = target.speed * 1.2; escort.waveAmplitude = Math.min(12, escort.waveAmplitude);
  }
  announceBattlefieldEvent(tr("截获补给运输舰 · 击毁获得三色补给，逃脱无惩罚", "Supply transport · Shoot it down for three pickups. No penalty if it escapes."), 5);
  return target;
}
function updateSupplyTransport(enemy, seconds) {
  enemy.previousX = enemy.x; enemy.previousY = enemy.y;
  enemy.age += seconds; enemy.x -= enemy.speed * seconds;
  enemy.y = clamp(enemy.baseY + Math.sin(enemy.age * 0.9) * 10, flightBounds.top, flightBounds.bottom);
}
function onBattlefieldEnemyDefeated(enemy) {
  if (enemy.kind !== "transport") return;
  battlefieldEvents.transport = null;
  for (const [index, type] of ["blue", "yellow", "red"].entries()) {
    if (powerups.length >= powerupRules.maxOnScreen) break;
    const x = clamp(enemy.x, powerupRules.radius, viewport.width - powerupRules.radius);
    powerups.push({ x, previousX: x, y: clamp(enemy.y + (index - 1) * 56, flightBounds.top, flightBounds.bottom),
      radius: powerupRules.radius, type });
  }
  announceBattlefieldEvent(tr("运输舰截获成功 · 射击散落的蓝、黄、红补给", "Transport intercepted · Shoot the blue, yellow, and red pickups"), 4);
}
function updateBattlefieldEvents(seconds) {
  if (!isBattleActive() || seconds <= 0) return;
  battlefieldEvents.clock += seconds;
  battlefieldEvents.noticeTime = Math.max(0, battlefieldEvents.noticeTime - seconds);
  if (bossBlocksWaves()) {
    if (battlefieldEvents.objects.length || battlefieldEvents.transport || battlefieldEvents.fragments.length)
      resetBattlefieldEvents(false);
    battlefieldEvents.nextObject = Math.max(battlefieldEvents.nextObject, battleTime + 8);
    battlefieldEvents.nextTransport = Math.max(battlefieldEvents.nextTransport, battleTime + 25);
    return;
  }
  if (battlefieldEvents.transport && !enemies.includes(battlefieldEvents.transport)) battlefieldEvents.transport = null;
  updateFieldFragments(seconds);
  for (let i = battlefieldEvents.objects.length - 1; i >= 0; i--) {
    const object = battlefieldEvents.objects[i];
    object.previousX = object.x; object.previousY = object.y;
    object.x -= object.speed * seconds; object.age += seconds;
    object.hitFlash = Math.max(0, object.hitFlash - seconds);
    if (object.x + object.width < 0) battlefieldEvents.objects.splice(i, 1);
  }
  if (battleTime >= battlefieldEvents.nextObject && !journeyReservesCover()) {
    spawnBattlefieldObject(); battlefieldEvents.nextObject = battleTime + 18;
  }
  if (battleTime >= battlefieldEvents.nextTransport && !journeyBlocksNewEncounters() && !battlefieldEventBlocksWaves()
      && !aceBlocksWaves() && !gravityTideBusy()
      && !(typeof formationsBlockWaves === "function" && formationsBlockWaves())) {
    if (spawnSupplyTransport()) battlefieldEvents.nextTransport = battleTime + 76;
    else battlefieldEvents.nextTransport = battleTime + 3;
  }
}
function destroyBattlefieldObject(object, source) {
  const index = battlefieldEvents.objects.indexOf(object);
  if (index < 0) return;
  battlefieldEvents.objects.splice(index, 1);
  const rock = isFieldAsteroid(object);
  const color = object.kind === "cell" ? "#8effe5" : rock ? "#ffcc8c" : "#ffad79";
  combatBurst(object.x, object.y, object.kind === "cell" ? 2.6 : 1.25, color, true);
  if (object.kind !== "cell") {
    spawnFieldFragments(object, source, rock);
    gameAudio.fieldCue?.(rock ? "rock-shatter" : "cover-hit", object.x, object.y);
  }
  gameAudio.explode(false, object.x, object.y);
  if (object.kind !== "cell") return;
  const radius = Math.min(230, viewport.height * 0.38);
  addEvolutionPulse(object.x, object.y, radius, "#8effe5", 0.5);
  for (const list of [enemyProjectiles, bossProjectiles]) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (Math.hypot(list[i].x - object.x, list[i].y - object.y) <= radius + list[i].radius) list.splice(i, 1);
    }
  }
  const shot = { source: "blast", damageLog: weaponDamageLog() + Math.log(weapon.lanes / weapon.interval * 1.8), x: object.x, y: object.y };
  for (const enemy of [...enemies]) {
    if (!enemies.includes(enemy) || Math.hypot(enemy.x - object.x, enemy.y - object.y) > radius + enemy.width * 0.3) continue;
    applyEnemyHit(enemy, shot);
    if (enemy.hp <= 0) defeatEnemy(enemies.indexOf(enemy), shot);
  }
}
function hitBattlefieldObject(object, shot) {
  if (!battlefieldEvents.objects.includes(object)) return;
  object.hp = Math.max(0, object.hp - Math.exp(Math.min(0, (shot.damageLog ?? Math.log(shot.damage ?? 1)) - object.healthLog)));
  object.hitFlash = 0.12; recordCombatImpact(object, shot);
  if (object.hp < 1e-10) destroyBattlefieldObject(object, shot);
}
function resolveBattlefieldCover() {
  if (!isBattleActive()) return;
  for (const list of [enemyProjectiles, bossProjectiles]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const shot = list[i];
      let cover = null, firstTime = Infinity;
      const sx=(shot.previousX ?? shot.x)-(player.previousX ?? player.x);
      const sy=(shot.previousY ?? shot.y)-(player.previousY ?? player.y);
      const playerTime=projectileCircleEntry(sx,sy,shot.x-player.x-sx,shot.y-player.y-sy,0,0,player.height*.16+shot.radius);
      for (const object of battlefieldEvents.objects) {
        if (object.kind !== "wreck" && object.kind !== "asteroid") continue;
        const ox = (shot.previousX ?? shot.x) - object.previousX;
        const oy = (shot.previousY ?? shot.y) - object.previousY;
        const t = projectileBoxEntry(ox, oy, shot.x - object.x - ox, shot.y - object.y - oy,
          -object.width * 0.45 - shot.radius, object.width * 0.45 + shot.radius,
          -object.height * 0.4 - shot.radius, object.height * 0.4 + shot.radius);
        if (Number.isFinite(t) && t < firstTime && t < playerTime) { firstTime=t; cover=object; }
      }
      if (!cover) continue;
      list.splice(i, 1);
      cover.hp = Math.max(0, cover.hp - (isFieldAsteroid(cover) ? .13 : .105));
      if (cover.hitFlash <= 0) {
        gameAudio.fieldCue?.("cover-hit", cover.x, cover.y);
        combatBurst(shot.x, shot.y, .2, "#ffb287");
      }
      cover.hitFlash = .10;
      if(cover.hp<1e-10)destroyBattlefieldObject(cover);
    }
  }
}
function resolveUltimateBattlefieldObjects(shot) {
  for (const object of [...battlefieldEvents.objects]) {
    if (shot.hitTargets.has(object) || !ultimateHitsTarget(shot, object)) continue;
    shot.hitTargets.add(object); destroyBattlefieldObject(object, shot);
  }
}
function drawSupplyTransport(enemy) {
  const age = reducedMotion.matches ? 0 : enemy.age;
  drawSpaceProp(context, "transport", {
    x: enemy.x, y: enemy.y, width: enemy.width * 1.24, height: enemy.height * 1.83,
    pitch: -.19 + Math.sin(age * .38) * .075, yaw: -.24 + Math.sin(age * .29) * .12,
    roll: Math.sin(age * .65) * .06, flash: Math.min(.8, enemy.hitFlash * 6), alpha: 1,
  });
}
function isFieldAsteroid(object) {
  return object.kind === "asteroid" || object.journeyCover === "asteroid";
}

function spawnFieldFragments(object, source, rock) {
  const particles = battlefieldEvents.fragments;
  const phase = object.phase || 0;
  const baseDamage = Math.min(180, 10 + Math.exp(Math.min(5.3, object.healthLog)) * .44);
  for (let i = 0; i < (rock ? 7 : 6); i++) {
    const x = object.x + Math.cos(phase + i) * object.width * .17;
    const y = object.y + Math.sin(phase + i) * object.height * .28;
    const angle = rock ? (i - 3) * .22 : i * Math.PI / 3 + phase;
    const speed = rock ? 225 + i * 28 : 74 + i * 13;
    if (particles.length >= 28) particles.shift();
    particles.push({ x, y, age: 0, life: rock ? 1.52 : 1.14, spin: (i % 2 ? -1 : 1) * (2.7 + i * .55),
      angle: phase + i, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: 4 + (i % 4) * 2.8, damage: rock && source ? baseDamage * (i === 3 ? 1.25 : 1) : 0, rock });
  }
}

function updateFieldFragments(seconds) {
  const particles = battlefieldEvents.fragments;
  for (let i = particles.length - 1; i >= 0; i--) {
    const part = particles[i];
    const previousX = part.x, previousY = part.y;
    part.age += seconds;
    part.x += part.vx * seconds;
    part.y += part.vy * seconds;
    part.vy += (part.rock ? 27 : 42) * seconds;
    if (part.age >= part.life || part.x > viewport.width + 36 || part.x < -36) {
      particles.splice(i, 1);
      continue;
    }
    if (!part.damage) continue;
    let target = null, first = Infinity;
    for (const enemy of enemies) {
      if (enemy.hp <= 0 || enemy.x - enemy.width / 2 > viewport.width) continue;
      const x = previousX - (enemy.previousX ?? enemy.x);
      const y = previousY - (enemy.previousY ?? enemy.y);
      const time = projectileCircleEntry(x, y, part.x - enemy.x - x, part.y - enemy.y - y,
        0, 0, part.size * .6 + enemy.height * .4);
      if (time < first) { first = time; target = enemy; }
    }
    if (!target) continue;
    const hit = { source: "terrain-shard", noEnergy: true, damage: part.damage,
      damageLog: Math.log(part.damage), x: part.x, y: part.y };
    applyEnemyHit(target, hit);
    if (target.hp <= 0) defeatEnemy(enemies.indexOf(target), hit);
    part.damage = 0;
    part.vx *= .28;
    part.life = Math.min(part.life, part.age + .16);
  }
}

function resizeFieldFragments(scaleX, scaleY, mapY) {
  for (const part of battlefieldEvents.fragments) {
    part.x *= scaleX;
    part.y = mapY(part.y);
    part.vx *= scaleX;
    part.vy *= scaleY;
  }
}

function drawFieldFragments() {
  for (const part of battlefieldEvents.fragments) {
    const age = part.age / part.life;
    const angle = part.angle + part.age * part.spin;
    const size = part.size * (.64 + .36 * Math.abs(Math.cos(part.age * 8 + part.angle)));
    context.save();
    context.globalAlpha = Math.min(1, (1 - age) * 3);
    if (part.damage && !quietCombatMotion()) {
      context.strokeStyle = "#ffbc6a85"; context.lineWidth = 1.4;
      context.beginPath(); context.moveTo(part.x, part.y);
      context.lineTo(part.x - part.vx * .056, part.y - part.vy * .056); context.stroke();
    }
    context.translate(part.x, part.y);
    context.rotate(angle);
    context.fillStyle = part.rock ? "#a98b73" : "#8f9ca7";
    context.beginPath();
    context.moveTo(size, -size * .12); context.lineTo(0, -size * .55);
    context.lineTo(-size * .77, -size * .1); context.lineTo(-size * .47, size * .58);
    context.lineTo(size * .46, size * .52); context.closePath(); context.fill();
    context.fillStyle = part.rock ? "#554032" : "#293d50";
    context.beginPath(); context.moveTo(size, -size * .12); context.lineTo(-size * .77, -size * .1);
    context.lineTo(-size * .47, size * .58); context.lineTo(size * .46, size * .52); context.closePath(); context.fill();
    context.restore();
  }
}

function drawBattlefieldObjects() {
  for (const object of battlefieldEvents.objects) {
    if (object.x + object.width < 0 || object.x - object.width > viewport.width) continue;
    const age = reducedMotion.matches ? 0 : object.age;
    const seed = object.phase ?? 0;
    const kind = isFieldAsteroid(object) ? "rock" : object.kind;
    const side = object.journeySide || 1;
    drawSpaceProp(context, kind, {
      x: object.x, y: object.y, width: object.width * 1.25, height: object.height * (kind === "rock" ? 1.56 : 1.88),
      pitch: side * .26 + Math.sin(age * .62 + seed) * .32, yaw: -.40 + Math.sin(age * .45 + seed) * .24,
      roll: side * .16 + Math.sin(age * .52 + seed) * .19, flash: Math.min(.8, object.hitFlash * 6),
      variant: Math.floor(seed * 2 + side + 1), alpha: 1,
    });
    if (object.hp < 1 || object.kind !== "cell") {
      const y = object.y - object.height * .67 - 8;
      const color = kind === "rock" ? "#e3aa70" : "#a0c9dd";
      for (let segment = 0; segment < 3; segment++) {
        const x = object.x - 26 + segment * 18;
        context.fillStyle = "#101c28"; context.fillRect(x, y, 16, 3);
        context.fillStyle = color; context.fillRect(x, y, 16 * clamp(object.hp * 3 - segment, 0, 1), 3);
      }
    }
  }
  drawFieldFragments();
}
function drawBattlefieldEventNotice() {
  if (state !== "battle" || battlefieldEvents.noticeTime <= 0 || bossBlocksWaves() || viewport.width < 620 || viewport.height < 560) return;
  context.save();
  context.globalAlpha = Math.min(1, battlefieldEvents.noticeTime);
  context.font = "12px system-ui, sans-serif"; context.textAlign = "center";
  const x=viewport.width/2, y=viewport.height-230, w=Math.min(480,viewport.width-120);
  context.fillStyle = "#07131eb8"; context.beginPath(); context.roundRect(x-w/2,y-17,w,34,6); context.fill();
  context.strokeStyle = "#badaab55"; context.stroke(); context.fillStyle = "#d9e8cf";
  context.fillText(battlefieldEvents.notice, x, y+4, w-20);
  context.restore();
}
