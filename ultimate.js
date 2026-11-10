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
      speed, damageLog, source: "ultimate", linked, hitTargets: new WeakSet() };
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
function resolveUltimateHits(shot = ultimate.shot, bossCap) {
  if (!shot) return;
  resolveUltimateBattlefieldObjects(shot);
  for (let index = enemies.length - 1; index >= 0; index--) {
    const enemy = enemies[index];
    if (shot.hitTargets.has(enemy) || !ultimateHitsTarget(shot, enemy)) continue;
    shot.hitTargets.add(enemy);
    applyEnemyHit(enemy, shot);
    if (enemy.hp <= 0) defeatEnemy(index, shot);
  }
  for (const target of activeBosses()) {
    if (!bossCanTakeDamage(target) || shot.hitTargets.has(target) || !ultimateHitsTarget(shot, target)) continue;
    shot.hitTargets.add(target);
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
  for (const missile of shot.missiles) {
    if (!missile.active || missile.done) continue;
    const oldest = missile.trail[0];
    if (oldest.x < missile.x) {
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
  }
}
function drawCoronaBarrage(shot) {
  const rows = clamp(Math.ceil(viewport.height / 25), 10, 44);
  const gap = viewport.height / rows;
  for (const [index, wave] of shot.waves.entries()) {
    if (wave.x <= 0 || wave.x - wave.length >= viewport.width) continue;
    const front = wave.x;
    const tail = Math.max(0, front - wave.length);
    const trail = context.createLinearGradient(tail, 0, front, 0);
    trail.addColorStop(0, "#cf642000");
    trail.addColorStop(0.62, "#ffa536bb");
    trail.addColorStop(1, shot.linked ? "#fffaf0" : "#fff8be");
    context.fillStyle = trail;
    for (let row = -1; row < rows; row++) {
      const y = gap * (row + 0.34 + (index * 0.28 + row % 2 * 0.16) % 0.7);
      const size = row % 3 === 0 ? 4.6 : 2.5;
      const drift = Math.min(front - tail, wave.length * (0.02 + 0.19 * (1 + Math.sin(row * 1.7 + index)) / 2));
      context.fillRect(tail, y - size, front - tail - drift, size * 2);
    }
    context.strokeStyle = "#ffe29256";
    context.lineWidth = 1;
    context.beginPath(); context.moveTo(front, 0); context.lineTo(front, viewport.height); context.stroke();
  }
}
function drawUltimate() {
  if (state !== "battle") return;
  context.save();
  if (ultimate.phase === "charging") {
    const muzzle = muzzlePosition();
    const progress = clamp(ultimate.elapsed / cannonLink.chargeDuration, 0, 1);
    const radius = 8 + progress * Math.min(32, player.height * 0.26);
    const color = ultimate.kind === "blue" ? ["#e6ffff", "#6ad8ff", "#1989ffbb", "#1481ff00", "#7ceaff"]
      : ultimate.kind === "yellow" ? ["#fff9d1", "#ffd054", "#ffaf24bb", "#ffb01b00", "#ffde72"]
      : ["#fff1df", "#ff7b77", "#ff254fbb", "#ff143600", "#ff7a88"];
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
    if (!reducedMotion.matches) {
      for (let index = 0; index < 10; index++) {
        const angle = index * Math.PI / 5 + ultimate.elapsed * 2;
        const distance = radius + 22 + (1 - (progress * 3 + index / 10) % 1) * 32;
        context.globalAlpha = 0.35 + progress * 0.55;
        context.beginPath(); context.moveTo(muzzle.x + Math.cos(angle) * distance, muzzle.y + Math.sin(angle) * distance);
        context.lineTo(muzzle.x + Math.cos(angle) * (distance - 12), muzzle.y + Math.sin(angle) * (distance - 12)); context.stroke();
      }
    }
  } else if (ultimate.phase === "firing" && ultimate.kind === "blue") {
    drawIonSwarm(ultimate.shot);
  } else if (ultimate.phase === "firing" && ultimate.kind === "yellow") {
    drawCoronaBarrage(ultimate.shot);
  } else if (ultimate.phase === "firing" && ultimate.shot) {
    const shot = ultimate.shot;
    const left = Math.max(shot.startX, shot.x - shot.length), right = Math.min(viewport.width + shot.radius, shot.x);
    const radius = shot.radius;
    if (right > left) {
      context.shadowColor = "#ff172a"; context.shadowBlur = reducedMotion.matches ? 0 : 25;
      const body = context.createLinearGradient(0, shot.y - radius, 0, shot.y + radius);
      body.addColorStop(0, "#b70e24dd"); body.addColorStop(0.18, "#ff2339");
      body.addColorStop(0.46, shot.linked ? "#ffe9e0" : "#ffab94"); body.addColorStop(0.5, shot.linked ? "#ffffff" : "#ffe6cf");
      body.addColorStop(0.65, "#ff695d"); body.addColorStop(1, "#bf1029dd");
      context.fillStyle = body;
      context.fillRect(left, shot.y - radius, right - left, radius * 2);
      context.beginPath(); context.ellipse(left, shot.y, radius * 0.24, radius, 0, 0, Math.PI * 2); context.fill();
      context.beginPath(); context.ellipse(right, shot.y, radius * 0.32, radius, 0, 0, Math.PI * 2); context.fill();
      context.shadowBlur = 0; context.strokeStyle = "#ffd3c6aa"; context.lineWidth = 1.5;
      const offset = reducedMotion.matches ? 0 : ultimate.elapsed * 90 % 75;
      for (let x = left + 15 + offset; x < right - 10; x += 75) {
        context.beginPath(); context.ellipse(x, shot.y, radius * 0.24, radius * 0.9, 0, -Math.PI / 2, Math.PI / 2); context.stroke();
      }
      context.strokeStyle = "#fff2df"; context.lineWidth = 2;
      context.beginPath(); context.ellipse(right, shot.y, radius * 0.32, radius, 0, 0, Math.PI * 2); context.stroke();
      if (shot.linked) {
        context.strokeStyle = "#c1f4ff"; context.lineWidth = 2;
        context.beginPath(); context.ellipse(right, shot.y, radius * 0.4, radius * 1.08, 0, 0, Math.PI * 2); context.stroke();
      }
    }
  }
  context.restore();
}
