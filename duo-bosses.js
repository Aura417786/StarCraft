"use strict";

const duoRules = { afterDefeats: 3, healthShare: 0.62, warning: 1.35, attack: 2.6,
  recovery: 1.6, breakRecovery: 2, maxProjectiles: 100 };
let wingBoss = null;
let pendingWingType = null;
let duoEncounter = null;
function activeBosses() { return [boss, wingBoss].filter(Boolean); }
function resetDuoEncounter() { wingBoss = null; pendingWingType = null; duoEncounter = null; }
function chooseBossPartner(first) {
  let second = chooseBossType();
  if (second === first) second = chooseBossType();
  return second === first ? (first + 1) % bossTypes.length : second;
}
function duoArena(slot = 0) {
  const span = Math.max(1, flightBounds.bottom - flightBounds.top);
  const width = Math.min(player.width * 1.18, viewport.width * 0.28, Math.max(18, span * 0.5 / 0.74));
  const height = width * 0.74;
  const y = flightBounds.top + span * (slot ? 0.8 : 0.2);
  return { width, height, x: viewport.width - width * 0.6 - 18, y,
    top: flightBounds.top, bottom: flightBounds.bottom };
}
function clearDuoAttacks() { bossProjectiles.length = 0; bossHazards.length = 0; }
function duoTitle() { return activeBosses().map(target => target.name).join(" × "); }
function spawnDuoEncounter(first, second) {
  const endurance = Math.min(85, 55 + bossDefeated * 5) * duoRules.healthShare;
  const healthLog = weaponDamageLog() + Math.log(weapon.lanes / weapon.interval) + Math.log(endurance);
  const make = (type, slot) => {
    const arena = duoArena(slot), data = bossTypes[type];
    return { ...arena, type, slot, color: data.color, name: data.name,
      x: viewport.width + arena.width / 2, previousX: viewport.width + arena.width / 2, previousY: arena.y,
      hp: 1, maxHp: 1, displayHp: 1, healthLog, endurance, phase: "enter", phaseTime: 0,
      age: 0, hitFlash: 0, attackIndex: 0, fired: 0, enraged: false, attackEvents: Object.create(null) };
  };
  boss = make(first, 0); wingBoss = make(second, 1);
  ensureBossComponents(boss); ensureBossComponents(wingBoss);
  duoEncounter = { phase: "enter", time: 0, attackIndex: -1, fired: 0, safeY: player.y, safeWidth: 0 };
  pendingBossType = pendingWingType = null;
  enemies.length = 0; resetEnemyCombat(false); clearDuoAttacks(); setBossWarning();
  bossHitGrace = 2;
  player.lives = Math.min(playerRules.maxLives, player.lives + 1); updateLifeDisplay();
  shield.charges = Math.max(shield.charges, 1); updateShieldDisplay();
  player.x = Math.min(player.x, bossPlayerRight());
  player.previousX = player.x; player.previousY = player.y;
  movementHint.hidden = true;
  setBossMessage(duoTitle(), "双舰协同 · 恢复1点生命 / 至少1次护盾");
  statusMessage.textContent = "双首领抵达。观察绿色通道，避开夹击；间歇期间瞄准上方或下方首领反击。";
}
function resizeDuoEncounter() {
  clearDuoAttacks();
  for (const target of activeBosses()) {
    Object.assign(target, duoArena(target.slot));
    target.previousX = target.x; target.previousY = target.y;
    target.phase = "recover"; target.phaseTime = 0;
  }
  duoEncounter.phase = "recover"; duoEncounter.time = 0; duoEncounter.safeWidth = 0;
  duoEncounter.rest = duoRules.breakRecovery;
  bossHitGrace = bossRules.grace;
  player.x = Math.min(player.x, bossPlayerRight());
  setBossMessage(duoTitle(), "阵型调整 · 趁机反击");
}
function beginDuoAttack() {
  const fight = duoEncounter;
  clearDuoAttacks();
  fight.attackIndex = (fight.attackIndex + 1) % 3;
  fight.phase = "telegraph"; fight.time = 0; fight.fired = 0;
  const span = Math.max(0, flightBounds.bottom - flightBounds.top);
  fight.safeWidth = Math.min(span, Math.max(120, player.height * 1.35));
  // 即使正在蓄力减速，1.35 秒预警也足够到达新通道；通道锁定后不会追着玩家移动。
  const shift = Math.min(span * 0.23, player.speed * 0.55) * (fight.attackIndex % 2 ? 1 : -1);
  fight.safeY = clamp(player.y + shift, flightBounds.top + fight.safeWidth / 2,
    flightBounds.bottom - fight.safeWidth / 2);
  for (const target of activeBosses()) { target.phase = "telegraph"; target.phaseTime = 0; target.attackIndex = fight.attackIndex; }
  const name = ["交错弹墙", "双翼封锁", "外侧集火"][fight.attackIndex];
  setBossMessage(duoTitle(), name + " · 移入绿色通道，随后寻找反击机会");
}
function duoShotIsOutsideLane(y, radius) {
  return Math.abs(y - duoEncounter.safeY) > duoEncounter.safeWidth / 2 + radius + player.height * 0.16 + 4;
}
function fireDuoShot(target, y, speed, radius = 7) {
  if (!bossWeaponOnline(target, y < target.y ? -1 : 1)) return;
  if (!duoShotIsOutsideLane(y, radius) || bossProjectiles.length >= duoRules.maxProjectiles) return;
  addBossProjectile(target.x - target.width * 0.53, y, -speed, 0,
    { radius, color: target.color, duo: true });
}
function fireDuoWave() {
  const fight = duoEncounter, targets = activeBosses();
  const screenScale = clamp(viewport.width / 1280, 0.5, 1.05);
  const travel = Math.max(...targets.map(target => target.x - target.width * 0.53 - flightBounds.left));
  // 宽屏也能在清场前抵达左侧；按横向距离调节，不让宽屏玩家躲在射程外。
  const speed = Math.max((fight.attackIndex === 2 ? 380 : 330) * screenScale, travel / 1.85);
  if (fight.attackIndex === 0) {
    const step = Math.max(25, player.height * 0.23);
    for (let y = flightBounds.top; y <= flightBounds.bottom; y += step) {
      const source = targets.length === 1 ? targets[0] : targets[y < (flightBounds.top + flightBounds.bottom) / 2 ? 0 : 1];
      // 两翼交替铺开弹墙，全部保留同一通道。
      if (targets.length === 1 || source.slot === fight.fired % 2) fireDuoShot(source, y, speed);
    }
  } else if (fight.attackIndex === 1) {
    if (fight.fired === 0) {
      const padding = player.height * 0.16 + 4;
      const limits = [[flightBounds.top - player.height, fight.safeY - fight.safeWidth / 2 - padding],
        [fight.safeY + fight.safeWidth / 2 + padding, flightBounds.bottom + player.height]];
      limits.forEach(([low, high], index) => {
        if (high <= low) return;
        const source = targets[index % targets.length];
        if (!bossWeaponOnline(source, index === 0 ? -1 : 1)) return;
        bossHazards.push({ kind: "beam", age: 0, warning: 0, duration: duoRules.attack,
          y: (low + high) / 2, thickness: high - low, color: source.color,
          right: source.x - source.width * 0.53, duo: true });
      });
      gameAudio.bossAttack("beam");
    }
  } else {
    for (const target of targets) {
      for (const offset of [-0.42, -0.14, 0.14, 0.42]) {
        fireDuoShot(target, target.y + target.height * offset, speed, 8);
      }
    }
  }
  fight.fired++;
}
function updateDuoEncounter(seconds) {
  const fight = duoEncounter;
  if (!fight || !boss) return;
  fight.time += seconds;
  for (const target of activeBosses()) {
    target.previousX = target.x; target.previousY = target.y;
    target.age += seconds; target.phaseTime += seconds;
    target.hitFlash = Math.max(0, target.hitFlash - seconds);
    target.displayHp += (target.hp - target.displayHp) * (reducedMotion.matches ? 1 : 1 - Math.exp(-seconds * 12));
  }
  if (fight.phase === "enter") {
    const progress = Math.min(1, fight.time / bossRules.entry);
    for (const target of activeBosses()) {
      const arena = duoArena(target.slot), start = viewport.width + arena.width / 2;
      target.x = start + (arena.x - start) * (1 - Math.pow(1 - progress, 3));
    }
    if (progress === 1) startDuoRecovery();
  } else if (fight.phase === "recover") {
    if (fight.time + 1e-9 >= (fight.rest ?? duoRules.recovery)) beginDuoAttack();
  } else if (fight.phase === "telegraph") {
    if (fight.time + 1e-9 >= duoRules.warning) {
      fight.phase = "attack"; fight.time = 0;
      for (const target of activeBosses()) { target.phase = "attack"; target.phaseTime = 0; }
      fireDuoWave();
    }
  } else {
    const interval = fight.attackIndex === 0 ? 0.6 : 0.38;
    if (fight.attackIndex !== 1 && fight.time < duoRules.attack
      && fight.time + 1e-9 >= fight.fired * interval) fireDuoWave();
    if (fight.time + 1e-9 >= duoRules.attack) startDuoRecovery();
  }
}
function startDuoRecovery(duration = duoRules.recovery) {
  clearDuoAttacks();
  Object.assign(duoEncounter, { phase: "recover", time: 0, rest: duration, safeWidth: 0 });
  for (const target of activeBosses()) { target.phase = "recover"; target.phaseTime = 0; }
  setBossMessage(duoTitle(), "武器冷却 · 移动瞄准，集中火力反击");
}
function drawDuoBeam(hazard) {
  // 大面积封锁用半透明能量场表达，保留生命、技能和安全通道的可读性。
  const top = hazard.y - hazard.thickness / 2, bottom = top + hazard.thickness;
  context.save();
  const glow = context.createLinearGradient(0, top, 0, bottom);
  glow.addColorStop(0, hazard.color + "a6"); glow.addColorStop(0.08, hazard.color + "55");
  glow.addColorStop(0.5, hazard.color + "22"); glow.addColorStop(0.92, hazard.color + "55");
  glow.addColorStop(1, hazard.color + "a6");
  context.fillStyle = glow; context.fillRect(0, top, hazard.right, hazard.thickness);
  context.strokeStyle = hazard.color; context.lineWidth = 2;
  context.shadowColor = hazard.color; context.shadowBlur = reducedMotion.matches ? 0 : 12;
  for (const y of [top + 2, hazard.y, bottom - 2]) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(hazard.right, y); context.stroke();
  }
  context.shadowBlur = 0; context.globalAlpha = 0.3; context.lineWidth = 1;
  const shift = reducedMotion.matches ? 0 : hazard.age * 140 % 90;
  for (let x = -90 + shift; x < hazard.right; x += 90) {
    context.beginPath(); context.moveTo(x, top + 7); context.lineTo(Math.min(hazard.right, x + 25), bottom - 7); context.stroke();
  }
  context.restore();
}
function drawDuoGuidance() {
  const fight = duoEncounter;
  if (!fight || !boss || !fight.safeWidth || !["telegraph", "attack"].includes(fight.phase)) return;
  const left = flightBounds.left - player.width / 2;
  const right = Math.max(left, bossPlayerRight() + player.width / 2);
  const top = fight.safeY - fight.safeWidth / 2;
  context.save();
  context.fillStyle = "#65efbd0e";
  context.fillRect(left, top, right - left, fight.safeWidth);
  context.strokeStyle = "#78ecc38c"; context.lineWidth = 1;
  context.setLineDash([10, 9]);
  for (const y of [top, top + fight.safeWidth]) {
    context.beginPath(); context.moveTo(left, y); context.lineTo(right, y); context.stroke();
  }
  context.setLineDash([]); context.fillStyle = "#a5f6d4";
  context.font = "11px Microsoft YaHei, sans-serif"; context.textAlign = "left";
  context.fillText(fight.phase === "telegraph" ? "协同攻击预警 · 移入此通道" : "安全通道", left + 14, top + 17);
  context.restore();
}
