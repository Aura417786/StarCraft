"use strict";

// 三种大招共享储能。只有普通武器实际造成的伤害为大招充能。
const ultimateRules = { maxCharges: 5, energyPerCharge: 100, enemyEnergy: 12, bossEnergy: 180,
  chargeTime: 0.85, bossDamageCap: 0.18 };
const ultimateProfiles = {
  red: { name: "赤焰贯星炮", enName: "Crimson Beam", fire: "贯穿发射", enFire: "Piercing beam firing" },
  blue: { name: "离子猎群", enName: "Ion Swarm", fire: "追踪离子已出舱", enFire: "Homing ions launched" },
  yellow: { name: "日冕弹幕", enName: "Corona Barrage", fire: "全屏弹幕推进中", enFire: "Screen-wide barrage active" },
};
const ionSwarmRules = { count: 5, interval: 0.095, damageShare: 0.28, bossHitCap: 0.03, maxFlight: 1.4 };
const coronaRules = { count: 3, interval: 0.22, damageShare: 0.37, bossHitCap: 0.027 };
const ultimate = { charges: 0, energy: 0, phase: "idle", elapsed: 0, kind: null, shot: null, audioActive: false };
// 连携只缩短下一次成功消费的蓄力；时长在按下空格时锁定，不追溯改变正在蓄力的炮。
const cannonLink = { remaining: 0, chargeDuration: ultimateRules.chargeTime, chargingLinked: false };
const cannonLinkRules = { duration: 3, chargeTime: 0.45 };
const ultimatePanel = document.querySelector("#ultimate-hud");
const ultimateHeading = document.querySelector("#ultimate-name");
const ultimateCount = document.querySelector("#ultimate-count");
const ultimateMeter = document.querySelector("#ultimate-meter");
const ultimateFill = document.querySelector("#ultimate-fill");
const ultimateLabel = document.querySelector("#ultimate-label");
const ultimateSlots = document.querySelectorAll(".ultimate-slot");

function currentUltimateId() {
  const id = typeof fighterProfile === "function" ? fighterProfile().id : "red";
  return Object.hasOwn(ultimateProfiles, id) ? id : "red";
}
function ultimateName(id = currentUltimateId()) {
  const profile = ultimateProfiles[id];
  return tr(profile.name, profile.enName);
}
function updateUltimateDisplay() {
  const kind = ultimate.kind ?? currentUltimateId();
  const profile = ultimateProfiles[kind];
  const name = ultimateName(kind);
  if (ultimateHeading && ultimateHeading.textContent !== name) ultimateHeading.textContent = name;
  ultimatePanel.setAttribute("aria-label", tr(name + "状态", name + " status"));
  ultimatePanel.dataset.fighter = kind;
  const full = ultimate.charges === ultimateRules.maxCharges;
  const progress = full ? 100 : ultimate.energy;
  ultimateCount.textContent = ultimate.charges + " / " + ultimateRules.maxCharges;
  ultimateFill.style.width = progress + "%";
  ultimateMeter.setAttribute("aria-valuenow", String(Math.floor(progress)));
  ultimateMeter.setAttribute("aria-valuetext", full ? tr("已储满 5 次", "All 5 shots stored")
    : tr("积能 " + Math.floor(progress) + "%", "Energy " + Math.floor(progress) + "%"));
  ultimatePanel.dataset.ready = String(ultimate.charges > 0);
  ultimatePanel.dataset.phase = ultimate.phase;
  ultimatePanel.dataset.linked = String(cannonLink.remaining > 1e-9 || cannonLink.chargingLinked);
  ultimateSlots.forEach((slot, index) => { slot.dataset.filled = String(index < ultimate.charges); });
  const countdown = (Math.ceil(cannonLink.remaining * 10) / 10).toFixed(1);
  const opportunity = cannonLink.remaining > 1e-9;
  ultimateLabel.textContent = ultimate.phase === "charging" ? (cannonLink.chargingLinked ? tr("完美连携速蓄 · 保持瞄准", "Perfect Link · Quick charge")
      : opportunity ? tr("蓄力中 · 连携保留 " + countdown + " 秒", "Charging · Link " + countdown + "s") : tr("蓄力中 · 保持瞄准", "Charging · Keep aiming"))
    : ultimate.phase === "firing" ? (cannonLink.chargingLinked ? tr("完美连携 · " + profile.fire, "Perfect Link · Firing")
      : opportunity ? tr(profile.fire + " · 连携 " + countdown + " 秒", "Firing · Link " + countdown + "s") : tr(profile.fire, profile.enFire))
    : opportunity ? tr("完美连携 " + countdown + " 秒 · " + (ultimate.charges ? "空格速蓄" : "需已存炮弹"),
      "Perfect Link " + countdown + "s · " + (ultimate.charges ? "Space" : "Needs ammo"))
    : full ? tr("储能已满 · 空格释放", "Fully stocked · Space")
    : ultimate.charges ? tr("空格释放 · 命中继续积能", "Space to fire · Hit to charge") : tr("命中敌军积能", "Hit enemies to charge");
}
function armCannonLink() {
  if (!isBattleActive()) return false;
  cannonLink.remaining = cannonLinkRules.duration;
  updateUltimateDisplay();
  return true;
}
function resetCannonLink() {
  cannonLink.remaining = 0;
  updateUltimateDisplay();
}
function updateCannonLink(seconds) {
  // 暂停和隐藏只冻结窗口；战斗结束、Boss 解体或选卡会彻底清除机会。
  if (state !== "battle" || evolution.pending || isBossDeathPlaying()) {
    if (cannonLink.remaining) resetCannonLink();
    return;
  }
  if (!isBattleActive() || !Number.isFinite(seconds) || seconds <= 0 || cannonLink.remaining <= 0) return;
  cannonLink.remaining = Math.max(0, cannonLink.remaining - seconds);
  if (cannonLink.remaining < 1e-9) cannonLink.remaining = 0;
  updateUltimateDisplay();
}
function gainUltimateEnergy(fraction, kind = "enemy") {
  if (state !== "battle" || !Number.isFinite(fraction) || fraction <= 0 || ultimate.charges >= ultimateRules.maxCharges) return;
  const amount = clamp(fraction, 0, 1) * (kind === "boss" ? ultimateRules.bossEnergy : ultimateRules.enemyEnergy);
  const total = ultimate.energy + amount;
  const gained = Math.floor((total + 1e-9) / ultimateRules.energyPerCharge);
  ultimate.charges = Math.min(ultimateRules.maxCharges, ultimate.charges + gained);
  ultimate.energy = ultimate.charges === ultimateRules.maxCharges ? 0 : Math.max(0, total - gained * ultimateRules.energyPerCharge);
  updateUltimateDisplay();
  if (gained) statusMessage.textContent = tr(ultimateName() + "就绪，已储存 " + ultimate.charges + " 次。按空格蓄力发射。",
    ultimateName() + " ready. Uses stored: " + ultimate.charges + ". Press Space to charge and fire.");
}
function ultimateDamageLog() {
  // 相当于数秒完整火力，并保证能贯穿同期小怪。对数计算兼容无上限的武器阶数。
  const equivalentSeconds = 8 + 4 * Math.log1p(battleTime / 90);
  return Math.max(weaponDamageLog() + Math.log(weapon.lanes / weapon.interval) + Math.log(equivalentSeconds),
    enemyHealthLogForTime() + Math.log(enemyTypes.armored.health));
}
function ultimateSuppressesFire() { return ultimate.phase === "charging" || ultimate.phase === "firing"; }
function requestUltimate() {
  if (!isBattleActive() || ultimate.phase !== "idle" || ultimate.charges <= 0) return false;
  cannonLink.chargingLinked = cannonLink.remaining > 1e-9;
  cannonLink.chargeDuration = cannonLink.chargingLinked ? cannonLinkRules.chargeTime : ultimateRules.chargeTime;
  if (cannonLink.chargingLinked) cannonLink.remaining = 0;
  ultimate.charges--;
  ultimate.phase = "charging";
  ultimate.kind = currentUltimateId();
  ultimate.elapsed = 0;
  ultimate.shot = null;
  pendingShots = 0;
  muzzleFlash = 0;
  movementHint.hidden = true;
  gameAudio.chargeUltimate(cannonLink.chargeDuration, ultimate.kind);
  ultimate.audioActive = !gameAudio.muted;
  updateUltimateDisplay();
  const name = ultimateName(ultimate.kind);
  statusMessage.textContent = cannonLink.chargingLinked
    ? tr("完美连携！" + name + " 0.45 秒速蓄，随后自动发射。", "Perfect Link! " + name + " fires after a 0.45-second charge.")
    : tr(name + "蓄力中，随后自动发射。", name + " is charging and will fire automatically.");
  return true;
}
function syncUltimateAudio(active) {
  const audible = active && !gameAudio.muted;
  if (ultimate.audioActive && !audible) gameAudio.stopUltimate();
  if (!ultimate.audioActive && audible && ultimate.phase === "charging") {
    gameAudio.chargeUltimate(Math.max(0.02, cannonLink.chargeDuration - ultimate.elapsed), ultimate.kind);
  }
  ultimate.audioActive = audible;
}
function cancelUltimate(refundCharge = false) {
  if (refundCharge && ultimate.phase === "charging") {
    ultimate.charges = Math.min(ultimateRules.maxCharges, ultimate.charges + 1);
    if (ultimate.charges === ultimateRules.maxCharges) ultimate.energy = 0;
  }
  ultimate.phase = "idle";
  ultimate.kind = null;
  ultimate.elapsed = 0;
  ultimate.shot = null;
  ultimate.audioActive = false;
  cannonLink.chargeDuration = ultimateRules.chargeTime;
  cannonLink.chargingLinked = false;
  if (state !== "battle" || evolution.pending || isBossDeathPlaying()) cannonLink.remaining = 0;
  gameAudio.stopUltimate();
  updateUltimateDisplay();
}
function resetUltimate() {
  ultimate.charges = 0;
  ultimate.energy = 0;
  cannonLink.remaining = 0;
  cancelUltimate();
}
function fireUltimate() {
  const muzzle = muzzlePosition();
  const speed = Math.max(1600, viewport.width * 1.65);
  ultimate.phase = "firing";
  ultimate.elapsed = 0;
  const damageLog = ultimateDamageLog();
  const linked = cannonLink.chargingLinked;
  if (ultimate.kind === "blue") {
    const spacing = Math.min(11, player.height * 0.09);
    const missiles = Array.from({ length: ionSwarmRules.count }, (_, index) => {
      const side = index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 ? -1 : 1);
      const y = muzzle.y + side * spacing;
      return { x: muzzle.x, previousX: muzzle.x, y, previousY: y, angle: side * 0.24,
        delay: index * ionSwarmRules.interval, length: 23, halfHeight: 5,
        trail: [{ x: muzzle.x, y }],
        target: null, done: false, active: false, source: "ultimate",
        damageLog: damageLog + Math.log(ionSwarmRules.damageShare) };
    });
    ultimate.shot = { missiles, bursts: [], linked, aimY: muzzle.y };
  } else if (ultimate.kind === "yellow") {
    const waves = Array.from({ length: coronaRules.count }, (_, index) => ({
      x: 0, previousX: 0, startX: 0, y: viewport.height * 0.5, radius: viewport.height * 0.5,
      delay: index * coronaRules.interval, speed: Math.max(1250, viewport.width * 1.68),
      length: clamp(viewport.width * 0.047, 33, 94), damageLog: damageLog + Math.log(coronaRules.damageShare),
      source: "ultimate", hitTargets: new WeakSet(),
    }));
    ultimate.shot = { waves, linked };
  } else {
    ultimate.shot = { x: muzzle.x, previousX: muzzle.x, startX: muzzle.x, y: muzzle.y,
      radius: Math.min(40, player.height * 0.28 + 8), length: clamp(viewport.width * 0.56, 360, 900),
      speed, damageLog, source: "ultimate", linked, hitTargets: new WeakSet(), contacts: [] };
  }
  gameAudio.stopUltimate();
  gameAudio.fireUltimate(ultimate.kind);
  updateUltimateDisplay();
}
function ultimateHitsTarget(shot, target) {
  // 求炮身与移动目标同时重叠的时间，避免波浪机在一帧内穿过炮身却漏判。
  if (target.x - target.width * 0.45 > viewport.width) return false;
  const oldX = target.previousX ?? target.x, oldY = target.previousY ?? target.y;
  const halfWidth = target.width * 0.45, halfHeight = shot.radius + target.height * 0.4;
  const relativeX = shot.previousX - oldX;
  let enter = 0, leave = 1;
  for (const [origin, delta, low, high] of [
    [relativeX, shot.x - target.x - relativeX, -halfWidth, shot.length + halfWidth],
    [oldX, target.x - oldX, shot.startX - halfWidth, Infinity],
    [shot.y - oldY, oldY - target.y, -halfHeight, halfHeight],
  ]) {
    if (Math.abs(delta) < 1e-12) { if (origin < low || origin > high) return false; }
    else {
      const a = (low - origin) / delta, b = (high - origin) / delta;
      enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
      if (enter > leave) return false;
    }
  }
  return true;
}
function hitUltimateBoss(target, shot, cap) {
  const damageLog = cap ? Math.min(shot.damageLog, target.healthLog + Math.log(cap)) : shot.damageLog;
  applyBossHit({ source: "ultimate", damageLog, y: shot.y, finaleNode: shot.finaleNode }, target);
}
function markCrimsonContact(shot, target) {
  if (!shot.contacts) return;
  if (shot.contacts.length >= 10) shot.contacts.shift();
  shot.contacts.push({ x: clamp(target.x - target.width * .3, shot.startX, viewport.width),
    y: clamp(target.y, shot.y - shot.radius, shot.y + shot.radius), time: ultimate.elapsed });
}
function resolveUltimateHits(shot = ultimate.shot, bossCap) {
  if (!shot) return;
  resolveUltimateBattlefieldObjects(shot);
  for (let index = enemies.length - 1; index >= 0; index--) {
    const enemy = enemies[index];
    if (shot.hitTargets.has(enemy) || !ultimateHitsTarget(shot, enemy)) continue;
    shot.hitTargets.add(enemy);
    markCrimsonContact(shot, enemy);
    applyEnemyHit(enemy, shot);
    if (enemy.hp <= 0) defeatEnemy(index, shot);
  }
  for (const target of activeBosses()) {
    if (!bossCanTakeDamage(target) || shot.hitTargets.has(target) || !ultimateHitsTarget(shot, target)) continue;
    shot.hitTargets.add(target);
    markCrimsonContact(shot, target);
    hitUltimateBoss(target, shot, bossCap);
    if (!isBattleActive()) return;
  }
}
function ionTargetVisible(target, missile) {
  return target.x - target.width * 0.45 <= viewport.width && target.x + target.width * 0.45 >= missile.x;
}
function selectIonTarget(missile, aimY) {
  const boss = activeBosses().find(target => bossCanTakeDamage(target) && ionTargetVisible(target, missile));
  if (boss) return boss;
  let selected = null;
  let best = Infinity;
  for (const enemy of enemies) {
    if (!ionTargetVisible(enemy, missile)) continue;
    const score = Math.abs(enemy.y - aimY) * 1.3 + Math.abs(enemy.y - missile.y) + Math.max(0, enemy.x - missile.x) * 0.34;
    if (score < best) { selected = enemy; best = score; }
  }
  return selected;
}
function resolveIonHit(missile, bursts, age) {
  let time = Infinity;
  let index = -1;
  let boss = null;
  for (let enemyIndex = 0; enemyIndex < enemies.length; enemyIndex++) {
    const enemy = enemies[enemyIndex];
    const entry = projectileEnemyEntry(missile, enemy);
    if (enemy.x - enemy.width * 0.45 <= viewport.width && entry < time) { time = entry; index = enemyIndex; }
  }
  for (const target of activeBosses()) {
    if (!bossCanTakeDamage(target)) continue;
    const entry = projectileAlienBossHit(missile, target);
    if (entry && entry.time < time) { time = entry.time; boss = target; }
  }
  if (!Number.isFinite(time)) return;
  missile.done = true;
  bursts.push({
    x: missile.previousX + (missile.x - missile.previousX) * time,
    y: missile.previousY + (missile.y - missile.previousY) * time, age,
  });
  if (boss) {
    hitUltimateBoss(boss, missile, ionSwarmRules.bossHitCap);
  } else {
    const enemy = enemies[index];
    applyEnemyHit(enemy, missile);
    if (enemy.hp <= 0) defeatEnemy(index, missile);
  }
}
function updateIonSwarm(shot, before, after) {
  for (const missile of shot.missiles) {
    if (missile.done || missile.delay >= after) continue;
    const seconds = Math.min(after, missile.delay + ionSwarmRules.maxFlight) - Math.max(before, missile.delay);
    if (seconds <= 0) { missile.done = true; continue; }
    missile.active = true;
    missile.previousX = missile.x;
    missile.previousY = missile.y;
    if (missile.target && (!ionTargetVisible(missile.target, missile)
      || (!enemies.includes(missile.target) && !bossCanTakeDamage(missile.target)))) missile.target = null;
    missile.target ??= selectIonTarget(missile, shot.aimY);
    const target = missile.target;
    if (target) {
      const aim = Math.atan2(target.y - missile.y, Math.max(32, target.x - missile.x));
      const turn = clamp(aim - missile.angle, -seconds * 7, seconds * 7);
      missile.angle = clamp(missile.angle + turn, -1.17, 1.17);
    }
    const speed = Math.max(1110, viewport.width * 1.27);
    missile.x += Math.cos(missile.angle) * speed * seconds;
    missile.y = clamp(missile.y + Math.sin(missile.angle) * speed * seconds, 1, viewport.height - 1);
    const tail = missile.trail.at(-1);
    if (Math.hypot(missile.x - tail.x, missile.y - tail.y) >= 21) {
      missile.trail.push({ x: missile.x, y: missile.y });
      if (missile.trail.length > 8) missile.trail.shift();
    }
    resolveIonHit(missile, shot.bursts, after);
    if (!isBattleActive() || ultimate.shot !== shot) return false;
    if (missile.x >= viewport.width + 20 || after >= missile.delay + ionSwarmRules.maxFlight) missile.done = true;
  }
  return shot.missiles.every(missile => missile.done);
}
function updateCoronaBarrage(shot, before, after) {
  for (const wave of shot.waves) {
    const seconds = after - Math.max(before, wave.delay);
    if (seconds <= 0 || wave.x - wave.length >= viewport.width) continue;
    wave.previousX = wave.x;
    wave.x = Math.min(viewport.width + wave.length, wave.x + wave.speed * seconds);
    resolveUltimateHits(wave, coronaRules.bossHitCap);
    if (!isBattleActive() || ultimate.shot !== shot) return false;
  }
  return shot.waves.every(wave => wave.x - wave.length >= viewport.width);
}
function finishUltimate() {
  // 发射结束同帧恢复可用，没有额外后摇或冷却。
  ultimate.phase = "idle";
  ultimate.kind = null;
  ultimate.elapsed = 0;
  ultimate.shot = null;
  cannonLink.chargeDuration = ultimateRules.chargeTime;
  cannonLink.chargingLinked = false;
  gameAudio.stopUltimate();
  updateUltimateDisplay();
}
function updateUltimate(seconds) {
  if (!isBattleActive() || seconds <= 0 || ultimate.phase === "idle") return;
  let remaining = seconds;
  if (ultimate.phase === "charging") {
    const used = Math.min(remaining, Math.max(0, cannonLink.chargeDuration - ultimate.elapsed));
    ultimate.elapsed += used;
    remaining -= used;
    if (ultimate.elapsed + 1e-9 < cannonLink.chargeDuration) return;
    fireUltimate();
  }
  if (ultimate.phase === "firing") {
    const shot = ultimate.shot;
    if (ultimate.kind !== "red") {
      const before = ultimate.elapsed;
      ultimate.elapsed += remaining;
      const done = ultimate.kind === "blue" ? updateIonSwarm(shot, before, ultimate.elapsed)
        : updateCoronaBarrage(shot, before, ultimate.elapsed);
      if (done) finishUltimate();
      return;
    }
    const untilExit = Math.max(0, (viewport.width + shot.length + shot.radius - shot.x) / shot.speed);
    const used = Math.min(remaining, untilExit);
    shot.previousX = shot.x;
    shot.x += shot.speed * used;
    ultimate.elapsed += used;
    if (used > 0) resolveUltimateHits();
    if (ultimate.shot !== shot || used + 1e-9 < untilExit) return;
    finishUltimate();
  }
}
function drawIonSwarm(shot) {
  const glow = shot.linked ? "#e7fdff" : "#91eaff";
  const detail = reducedMotion.matches ? 0 : visualQuality.meshDetail;
  for (const missile of shot.missiles) {
    if (!missile.active || missile.done) continue;
    const oldest = missile.trail[0];
    if (detail && oldest.x < missile.x) {
      const vapor = context.createLinearGradient(oldest.x, oldest.y, missile.x, missile.y);
      vapor.addColorStop(0, "#116bf100");
      vapor.addColorStop(0.52, "#2b89ff82");
      vapor.addColorStop(1, "#63d7ffe2");
      context.strokeStyle = vapor;
      context.lineWidth = 5;
      context.lineCap = "round";
      context.beginPath(); context.moveTo(oldest.x, oldest.y);
      for (const sample of missile.trail.slice(1)) context.lineTo(sample.x, sample.y);
      context.lineTo(missile.x, missile.y); context.stroke();
    }
    context.save();
    context.translate(missile.x, missile.y);
    context.rotate(missile.angle);
    const trail = context.createLinearGradient(-63, 0, 18, 0);
    trail.addColorStop(0, "#116bf100");
    trail.addColorStop(0.5, "#2b89ff99");
    trail.addColorStop(1, glow);
    context.strokeStyle = trail;
    context.lineWidth = 4;
    context.beginPath(); context.moveTo(-60, 0);
    context.quadraticCurveTo(-22, 11 * Math.sin(missile.angle), 14, 0); context.stroke();
    context.fillStyle = "#2272d7";
    context.beginPath(); context.moveTo(21, 0); context.lineTo(-3, -6); context.lineTo(-15, 0);
    context.lineTo(-3, 6); context.closePath(); context.fill();
    context.fillStyle = glow; context.fillRect(-5, -1.5, 21, 3);
    context.strokeStyle = "#d9f9ffbd"; context.lineWidth = 1;
    context.beginPath(); context.moveTo(-9, -2); context.lineTo(-3, -5.3); context.lineTo(16, -.6);
    context.moveTo(-9, 2); context.lineTo(-3, 5.3); context.lineTo(16, .6); context.stroke();
    context.restore();
  }
  for (const burst of shot.bursts) {
    const age = ultimate.elapsed - burst.age;
    if (age >= 0.25) continue;
    context.globalAlpha = Math.max(0, 1 - age * 4);
    context.strokeStyle = glow;
    context.lineWidth = 1.5;
    const radius = reducedMotion.matches ? 12 : 5 + age * 89;
    context.beginPath(); context.arc(burst.x, burst.y, radius, 0, Math.PI * 2); context.stroke();
    if (detail) {
      context.beginPath();
      for (let ray = 0; ray < (detail === 2 ? 8 : 4); ray++) {
        const angle = ray * Math.PI / (detail === 2 ? 4 : 2) + burst.y * .01;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        context.moveTo(burst.x + dx * radius * .65, burst.y + dy * radius * .65);
        context.lineTo(burst.x + dx * radius * 1.25, burst.y + dy * radius * 1.25);
      }
      context.stroke();
    }
  }
}
function drawCoronaBarrage(shot) {
  const detail = reducedMotion.matches ? 0 : visualQuality.meshDetail;
  const rows = clamp(Math.ceil(viewport.height / (detail ? 24 : 36)), 10, 44);
  const gap = viewport.height / rows;
  for (const [index, wave] of shot.waves.entries()) {
    if (wave.x <= 0 || wave.x - wave.length >= viewport.width) continue;
    const front = wave.x;
    const tail = Math.max(0, front - wave.length);
    const trail = context.createLinearGradient(tail, 0, front, 0);
    trail.addColorStop(0, "#cf642000");
    trail.addColorStop(0.62, "#ffa536bb");
    trail.addColorStop(1, shot.linked ? "#fffaf0" : "#fff8be");
    context.fillStyle = trail; context.beginPath();
    for (let row = -1; row < rows; row++) {
      const y = gap * (row + 0.34 + (index * 0.28 + row % 2 * 0.16) % 0.7);
      const size = row % 3 === 0 ? 4.6 : 2.5;
      const drift = Math.min(front - tail, wave.length * (0.02 + 0.19 * (1 + Math.sin(row * 1.7 + index)) / 2));
      const tip = front - drift;
      const shoulder = Math.max(tail, tip - 9);
      context.moveTo(tail, y); context.lineTo(shoulder, y - size); context.lineTo(tip, y);
      context.lineTo(shoulder, y + size); context.closePath();
    }
    context.fill();
    context.strokeStyle = "#ffe29256";
    context.lineWidth = 1;
    context.beginPath(); context.moveTo(front, 0); context.lineTo(front, viewport.height); context.stroke();
    if (detail) {
      const lens = context.createLinearGradient(Math.max(0, front - 34), 0, front + 9, 0);
      lens.addColorStop(0, "#f98c2a00"); lens.addColorStop(.78, "#ffbe5133"); lens.addColorStop(1, "#fff1a300");
      context.fillStyle = lens; context.fillRect(front - 34, 0, 43, viewport.height);
    }
  }
}
function drawCrimsonCharge(muzzle, progress, linked) {
  const radius = 9 + progress * Math.min(29, player.height * .25);
  const time = reducedMotion.matches ? 0 : ultimate.elapsed;
  context.globalCompositeOperation = "screen";
  const lens = context.createRadialGradient(muzzle.x, muzzle.y, 0, muzzle.x, muzzle.y, radius * 2);
  lens.addColorStop(0, "#fff8d5f0");
  lens.addColorStop(.15, "#ffb58ec4");
  lens.addColorStop(.34, "#ff473a85");
  lens.addColorStop(.62, "#e3265933");
  lens.addColorStop(1, "#d51a4300");
  context.fillStyle = lens;
  context.beginPath(); context.arc(muzzle.x, muzzle.y, radius * 2, 0, Math.PI * 2); context.fill();
  context.lineWidth = 1.3;
  for (let index = 0; index < 3; index++) {
    context.strokeStyle = linked && index === 2 ? "#c1f4ff" : "#ffad8d86";
    const roll = radius * (1.36 - ((progress * 2.2 + index / 3) % 1) * .63);
    const start = index * 2.1 + time * 4;
    context.beginPath();
    context.ellipse(muzzle.x, muzzle.y, roll * .54, roll, -.22, start, start + 2.9);
    context.stroke();
  }
  if (reducedMotion.matches) return;
  context.strokeStyle = "#ff8d73a0";
  context.beginPath();
  for (let index = 0; index < Math.min(visualQuality.particles, 12); index++) {
    const angle = index * 2.4 + time * 2;
    const distance = radius + 10 + (1 - (progress * 2.5 + index * .17) % 1) * 42;
    context.moveTo(muzzle.x + Math.cos(angle) * distance, muzzle.y + Math.sin(angle) * distance);
    context.quadraticCurveTo(muzzle.x + Math.cos(angle + .22) * distance * .67,
      muzzle.y + Math.sin(angle + .22) * distance * .67,
      muzzle.x + Math.cos(angle + .37) * radius * .36, muzzle.y + Math.sin(angle + .37) * radius * .36);
  }
  context.stroke();
}

const crimsonBands = [
  { scale: 1.34, edge: "#c2174000", shoulder: "#ff204225", center: "#ff313e38" },
  { scale: 1, edge: "#f5224300", shoulder: "#ff3a5430", center: "#ff634745" },
  { scale: .62, edge: "#ff542a00", shoulder: "#ff684037", center: "#ffa46452" },
  { scale: .19, edge: "#ff9e6100", shoulder: "#ffc98353", center: "#fff1b58f" },
];
function drawCrimsonBeam(shot) {
  const front = shot.x;
  const tail = front - shot.length;
  const left = Math.max(shot.startX, tail), right = Math.min(viewport.width + shot.radius, front);
  const age = ultimate.elapsed;
  const animate = !reducedMotion.matches;
  const time = animate ? age : 0;
  const radius = shot.radius;
  const y = shot.y;
  context.globalCompositeOperation = "screen";
  if (right > left) {
    const samples = Math.max(2, Math.ceil((right - left) / (animate ? 13 : 28)));
    const profile = Array.from({ length: samples + 1 }, (_, index) => {
      const x = left + (right - left) * index / samples;
      const nearTail = clamp((x - tail) / (shot.length * .29), 0, 1);
      const nearFront = clamp((front - x) / (radius * 2.3), 0, 1);
      const muzzleFalloff = clamp((x - shot.startX) / (radius * .82), .17, 1);
      const taper = Math.pow(nearTail * nearFront * muzzleFalloff, .42);
      const wave = x * .027 - time * 38;
      return { x, wave, drift: radius * .09 * Math.sin(wave * .66 + .5) * taper,
        half: radius * taper * (.81 + Math.sin(wave) * .13 + Math.sin(wave * 2.3) * .055) };
    });
    for (const band of crimsonBands) {
      const spread = radius * band.scale * .86;
      const light = context.createLinearGradient(0, y - spread, 0, y + spread);
      light.addColorStop(0, band.edge); light.addColorStop(.26, band.shoulder);
      light.addColorStop(.5, band.center); light.addColorStop(.74, band.shoulder); light.addColorStop(1, band.edge);
      context.fillStyle = light; context.beginPath();
      for (const sample of profile) {
        const ripple = .95 + Math.sin(sample.wave + band.scale * 2) * .05;
        context.lineTo(sample.x, y + sample.drift - sample.half * band.scale * ripple);
      }
      for (let index = profile.length - 1; index >= 0; index--) {
        const sample = profile[index];
        const ripple = .95 + Math.cos(sample.wave * 1.5 + band.scale * 2) * .05;
        context.lineTo(sample.x, y + sample.drift + sample.half * band.scale * ripple);
      }
      context.closePath(); context.fill();
    }
    context.lineWidth = 1.35;
    for (const side of [-1, 1]) {
      context.strokeStyle = shot.linked && side === -1 ? "#c1f4ff" : "#ff906e69";
      context.beginPath();
      let previous;
      for (const sample of profile) {
        const spiral = Math.sin(sample.x * .044 - time * 48 + side * 1.8);
        const py = y + sample.drift + sample.half * (side * .58 + spiral * .23);
        if (previous) context.quadraticCurveTo(previous.x, previous.y, (previous.x + sample.x) * .5, (previous.y + py) * .5);
        else context.moveTo(sample.x, py);
        previous = { x: sample.x, y: py };
      }
      context.stroke();
    }
    if (animate && visualQuality.glow) {
      context.strokeStyle = "#ffb9778c"; context.lineWidth = 1;
      context.beginPath();
      const count = Math.min(visualQuality.particles, 15);
      for (let index = 0; index < count; index++) {
        const u = (time * 2.4 + index * .618) % 1;
        const offset = radius * Math.sin(index * 1.3 + time * 13) * .83;
        const x = left + (right - left) * u;
        context.moveTo(Math.max(left, x - 7 - index % 6 * 4), y + offset * .91);
        context.lineTo(x, y + offset);
      }
      context.stroke();
    }
  }
  if (age < .23) {
    const expansion = animate ? age / .23 : .3;
    context.globalAlpha = 1 - age / .23;
    context.strokeStyle = "#ffa68d";
    context.lineWidth = 2;
    context.beginPath();
    context.ellipse(shot.startX, y, radius * (.2 + expansion * .83), radius * (.46 + expansion * 1.05),
      0, -.92 * Math.PI, .92 * Math.PI);
    context.stroke();
  }
  for (const contact of shot.contacts ?? []) {
    const elapsed = (age - contact.time) / .22;
    if (elapsed < 0 || elapsed >= 1) continue;
    context.globalAlpha = (1 - elapsed) ** 2;
    context.strokeStyle = "#ffd49e"; context.lineWidth = 1.4;
    const reach = animate ? 8 + elapsed * 36 : 14;
    context.beginPath();
    for (let ray = 0; ray < 6; ray++) {
      const direction = (ray - 2.5) * .49;
      context.moveTo(contact.x + Math.cos(direction) * reach * .4, contact.y + Math.sin(direction) * reach * .4);
      context.lineTo(contact.x + Math.cos(direction) * reach, contact.y + Math.sin(direction) * reach);
    }
    context.stroke();
  }
}

function drawUltimate() {
  if (state !== "battle") return;
  context.save();
  if (ultimate.phase === "charging" && ultimate.kind === "red") {
    drawCrimsonCharge(muzzlePosition(), clamp(ultimate.elapsed / cannonLink.chargeDuration, 0, 1), cannonLink.chargingLinked);
  } else if (ultimate.phase === "charging") {
    const muzzle = muzzlePosition();
    const progress = clamp(ultimate.elapsed / cannonLink.chargeDuration, 0, 1);
    const radius = 8 + progress * Math.min(32, player.height * 0.26);
    const color = ultimate.kind === "blue" ? ["#e6ffff", "#6ad8ff", "#1989ffbb", "#1481ff00", "#7ceaff"]
      : ["#fff9d1", "#ffd054", "#ffaf24bb", "#ffb01b00", "#ffde72"];
    const halo = context.createRadialGradient(muzzle.x, muzzle.y, 0, muzzle.x, muzzle.y, radius * 2.1);
    halo.addColorStop(0, color[0]); halo.addColorStop(0.22, color[1]);
    halo.addColorStop(0.5, color[2]); halo.addColorStop(1, color[3]);
    context.fillStyle = halo;
    context.beginPath(); context.arc(muzzle.x, muzzle.y, radius * 2.1, 0, Math.PI * 2); context.fill();
    context.strokeStyle = color[4]; context.lineWidth = 2;
    context.beginPath(); context.ellipse(muzzle.x, muzzle.y, radius * 0.4, radius * 1.3, 0, 0, Math.PI * 2); context.stroke();
    if (cannonLink.chargingLinked) {
      context.strokeStyle = "#c1f4ff"; context.lineWidth = 2.5;
      context.beginPath(); context.ellipse(muzzle.x, muzzle.y, radius * 0.55, radius * 1.55, 0, 0, Math.PI * 2); context.stroke();
    }
    if (!reducedMotion.matches && visualQuality.glow) {
      const count = visualQuality.particles;
      for (let index = 0; index < count; index++) {
        const angle = index * Math.PI * 2 / count + ultimate.elapsed * 2;
        const distance = radius + 22 + (1 - (progress * 3 + index / count) % 1) * 32;
        context.globalAlpha = 0.35 + progress * 0.55;
        context.beginPath(); context.moveTo(muzzle.x + Math.cos(angle) * distance, muzzle.y + Math.sin(angle) * distance);
        context.quadraticCurveTo(muzzle.x + Math.cos(angle + .07) * (distance - 6), muzzle.y + Math.sin(angle + .07) * (distance - 6),
          muzzle.x + Math.cos(angle + .14) * (distance - 12), muzzle.y + Math.sin(angle + .14) * (distance - 12)); context.stroke();
      }
    }
  } else if (ultimate.phase === "firing" && ultimate.kind === "blue") {
    drawIonSwarm(ultimate.shot);
  } else if (ultimate.phase === "firing" && ultimate.kind === "yellow") {
    drawCoronaBarrage(ultimate.shot);
  } else if (ultimate.phase === "firing" && ultimate.shot) {
    drawCrimsonBeam(ultimate.shot);
  }
  context.restore();
}
