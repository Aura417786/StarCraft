"use strict";

// 中立物件和运输舰使用有效战斗时钟；暂停、首领预警和进化不会偷走反应时间。
const battlefieldEvents = { objects: [], nextObject: 16, nextTransport: 52,
  objectCount: 0, transport: null, notice: "", noticeTime: 0, clock: 0 };
function resetBattlefieldEvents(resetProgress = true) {
  battlefieldEvents.objects.length = 0;
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
  kind = kind || (battlefieldEvents.objectCount % 3 === 1 ? "wreck" : "cell");
  const width = kind === "wreck" ? Math.min(112, player.width * 0.72) : Math.min(62, player.width * 0.43);
  const lane = [0.3, 0.68, 0.48][battlefieldEvents.objectCount % 3];
  const y = flightBounds.top + (flightBounds.bottom - flightBounds.top) * lane;
  const x = viewport.width + width;
  const object = { kind, x, previousX: x, y, previousY: y, width, height: width * (kind === "wreck" ? 0.65 : 0.72),
    hp: 1, maxHp: 1, healthLog: progressionReferenceDpsLog(battleTime) + Math.log(kind === "wreck" ? 1.3 : .45),
    speed: kind === "wreck" ? 62 : 86, hitFlash: 0, phase: battlefieldEvents.objectCount * 1.7, age: 0 };
  battlefieldEvents.objects.push(object);
  if (journeyCover) return object;
  battlefieldEvents.objectCount++;
  if (battlefieldEvents.objectCount <= 2) announceBattlefieldEvent(kind === "cell"
    ? tr("能源罐 · 射爆可清除附近敌弹，并炸伤敌军", "Energy canister · Shoot to clear nearby bullets and damage enemies")
    : tr("漂浮残骸 · 可挡普通敌弹，也会挡住主炮", "Drifting wreckage · Blocks enemy shots and your main gun"));
  return object;
}
function spawnSupplyTransport() {
  if (aceBlocksWaves() || gravityTideBusy()) return null;
  if (enemies.length > enemyRules.maxOnScreen - 3 || viewport.width < 520 || viewport.height < 380) return null;
  const width = Math.min(155, player.width * 0.96), x = viewport.width + width;
  const y = flightBounds.top + (flightBounds.bottom - flightBounds.top) * (battlefieldEvents.objectCount % 2 ? 0.35 : 0.65);
  const target = { kind: "transport", x, previousX: x, y, previousY: y, baseY: y, width, height: width * 0.61,
    hp: 1, maxHp: 1, displayHp: 1, healthLog: progressionReferenceDpsLog(battleTime) + Math.log(2.6),
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
    if (battlefieldEvents.objects.length || battlefieldEvents.transport) resetBattlefieldEvents(false);
    battlefieldEvents.nextObject = Math.max(battlefieldEvents.nextObject, battleTime + 8);
    battlefieldEvents.nextTransport = Math.max(battlefieldEvents.nextTransport, battleTime + 25);
    return;
  }
  if (battlefieldEvents.transport && !enemies.includes(battlefieldEvents.transport)) battlefieldEvents.transport = null;
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
function destroyBattlefieldObject(object) {
  const index = battlefieldEvents.objects.indexOf(object);
  if (index < 0) return;
  battlefieldEvents.objects.splice(index, 1);
  combatBurst(object.x, object.y, object.kind === "cell" ? 2.6 : 1.25, object.kind === "cell" ? "#8effe5" : "#ffca91", true);
  gameAudio.explode(false);
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
  if (object.hp < 1e-10) destroyBattlefieldObject(object);
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
        if (object.kind !== "wreck") continue;
        const ox = (shot.previousX ?? shot.x) - object.previousX;
        const oy = (shot.previousY ?? shot.y) - object.previousY;
        const t = projectileBoxEntry(ox, oy, shot.x - object.x - ox, shot.y - object.y - oy,
          -object.width * 0.45 - shot.radius, object.width * 0.45 + shot.radius,
          -object.height * 0.4 - shot.radius, object.height * 0.4 + shot.radius);
        if (Number.isFinite(t) && t < firstTime && t < playerTime) { firstTime=t; cover=object; }
      }
      if (!cover) continue;
      list.splice(i,1);cover.hp=Math.max(0,cover.hp-.085);cover.hitFlash=.1;
      if(cover.hp<1e-10)destroyBattlefieldObject(cover);
    }
  }
}
function resolveUltimateBattlefieldObjects(shot) {
  for (const object of [...battlefieldEvents.objects]) {
    if (shot.hitTargets.has(object) || !ultimateHitsTarget(shot, object)) continue;
    shot.hitTargets.add(object); destroyBattlefieldObject(object);
  }
}
function eventMetalShape(points, top = "#8c9da8", bottom = "#172537") {
  const paint = context.createLinearGradient(0, -40, 0, 45);
  paint.addColorStop(0, top); paint.addColorStop(0.43, "#425366"); paint.addColorStop(0.52, "#263747"); paint.addColorStop(1, bottom);
  context.fillStyle = paint; context.strokeStyle = "#9dc0d04d"; context.lineWidth = 1;
  context.beginPath(); points.forEach(([x,y], i) => i ? context.lineTo(x,y) : context.moveTo(x,y));
  context.closePath(); context.fill(); context.stroke();
}
function drawSupplyTransport(enemy) {
  context.save(); context.translate(enemy.x, enemy.y); context.scale(enemy.width / 150, enemy.height / 92);
  const glow = context.createRadialGradient(78, 0, 0, 78, 0, 44); glow.addColorStop(0, "#ffcc8580"); glow.addColorStop(1, "#ff9a3d00");
  context.fillStyle = glow; context.fillRect(60, -46, 65, 92);
  eventMetalShape([[-72, -19],[-47, -33],[50,-33],[72,-15],[72,25],[40,37],[-47,33],[-72,19]], "#adb9b9", "#242f39");
  for (const side of [-1,1]) {
    context.save(); context.translate(5, side * 29);
    eventMetalShape([[-40,-9],[42,-9],[51,0],[42,12],[-40,12],[-48,3]], "#d1b077", "#4b3829");
    context.fillStyle = "#08131d"; context.fillRect(-30,-4,57,10);
    context.fillStyle = "#f2ce7c"; for(let i=0;i<4;i++) context.fillRect(-26+i*14,-2,7,5);
    context.restore();
    context.fillStyle = "#ffe0a3"; context.fillRect(68, side*17-4,12,8);
  }
  eventMetalShape([[-73,-13],[-51,-21],[-25,-14],[-20,14],[-51,21],[-73,13]], "#667d8d", "#0c1d2b");
  context.fillStyle = "#7ce0e6"; context.fillRect(-58,-7,13,14);
  context.strokeStyle = "#d8b978"; context.lineWidth = 2; context.beginPath(); context.moveTo(-10,-15); context.lineTo(20,0); context.lineTo(-10,15); context.stroke();
  if (enemy.hitFlash > 0) { context.globalAlpha = Math.min(0.4, enemy.hitFlash * 3); context.fillStyle = "#ffe7b6"; context.fillRect(-48,-22,90,44); }
  context.restore();
}
function drawBattlefieldObjects() {
  for (const object of battlefieldEvents.objects) {
    context.save(); context.translate(object.x, object.y);
    context.scale(object.width / 100, object.height / 65);
    if (object.journeyCover) drawJourneyCoverShape(object);
    else if (object.kind === "wreck") {
      eventMetalShape([[-49,-9],[-30,-30],[19,-28],[48,-11],[37,21],[12,30],[-33,19]], "#79848d", "#151e2a");
      context.strokeStyle = "#101c29"; context.lineWidth = 5;
      context.beginPath(); context.moveTo(-24,-25); context.lineTo(-10,0); context.lineTo(-26,22); context.moveTo(6,-26); context.lineTo(19,4); context.lineTo(40,15); context.stroke();
      context.strokeStyle = "#d5a565"; context.lineWidth = 2; context.beginPath(); context.moveTo(-39,-9); context.lineTo(-29,-17); context.moveTo(-31,-5); context.lineTo(-21,-13); context.stroke();
    } else {
      const paint = context.createLinearGradient(0,-25,0,25);
      paint.addColorStop(0,"#305a68"); paint.addColorStop(0.35,"#a6eadb"); paint.addColorStop(0.5,"#327879"); paint.addColorStop(1,"#112c3b");
      context.fillStyle = paint; context.beginPath(); context.roundRect(-37,-22,74,44,6); context.fill();
      for(const x of [-36,30]) { eventMetalShape([[x-7,-25],[x+7,-25],[x+11,-16],[x+11,16],[x+7,25],[x-7,25],[x-11,16],[x-11,-16]],"#b3b7a7","#364454"); }
      context.fillStyle = "#0a2730"; context.fillRect(-21,-12,38,24);
      context.fillStyle = "#95ffe2"; context.shadowColor = "#66ffce"; context.shadowBlur = reducedMotion.matches ? 0 : 10;
      for(let i=0;i<3;i++) context.fillRect(-17+i*12,-8,6,16);
    }
    context.restore();
    if (object.hp < 1) {
      context.fillStyle = "#0b1526"; context.fillRect(object.x-24,object.y-object.height*0.5-8,48,3);
      context.fillStyle = "#9caeae"; context.fillRect(object.x-24,object.y-object.height*0.5-8,48*object.hp,3);
    }
  }
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
