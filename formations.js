"use strict";

// 编队占用普通刷怪预算，不叠加一套额外的敌潮。所有时间只由有效战斗推进。
const formationRules = { firstArrival: 24, interval: 17, warning: 1.35, disruption: 1.5 };
const formationState = { nextTime: 24, sequence: 0, nextId: 1, warning: null, active: null,
  suppression: 0, notice: "", noticeTime: 0 };

function resetFormations(resetClock = true) {
  formationState.warning = null;
  formationState.active = null;
  formationState.suppression = 0;
  formationState.notice = "";
  formationState.noticeTime = 0;
  if (resetClock) {
    formationState.nextTime = formationRules.firstArrival;
    formationState.sequence = 0;
    formationState.nextId = 1;
  } else formationState.nextTime = Math.max(formationState.nextTime, battleTime + 9);
  for (const enemy of enemies) {
    if (!enemy.formationId) continue;
    enemy.formationId = null;
    enemy.formationLeader = false;
    enemy.baseY = enemy.y;
    enemy.waveAmplitude = 0;
    if (enemy.kind === "gunner") { enemy.gunPhase = "entry"; enemy.gunTime = 0; }
  }
}

function formationsBlockWaves() {
  return !!formationState.warning || formationState.suppression > 0;
}

function formationPlan(kind) {
  const top = flightBounds.top + 15, bottom = flightBounds.bottom - 15;
  const middle = (top + bottom) / 2, span = Math.max(1, bottom - top);
  const unit = Math.min(100, player.width * 0.65);
  const spacing = Math.min(unit * 0.9, span * 0.19);
  const safeCenter = clamp(player.y, top + spacing * 1.5, bottom - spacing * 1.5);
  if (kind === "escort") {
    return { kind, title: "护航编队", hint: "绕过前卫，切入后排", color: "#f2c685", centerY: safeCenter,
      speed: enemySpeedForTime() * 0.66,
      slots: [
        { kind: "armored", x: 0, y: 0, leader: true },
        { kind: "scout", x: unit * 0.9, y: -spacing },
        { kind: "scout", x: unit * 0.9, y: spacing },
        { kind: battleTime >= enemyCombatRules.gunnerArrival ? "gunner" : "scout", x: unit * 1.75, y: 0 },
      ] };
  }
  if (kind === "command") {
    const centerY = clamp(player.y, top + spacing * 1.75, bottom - spacing * 1.75);
    return { kind, title: "指挥楔队", hint: "击毁金色前卫，打乱整支编队", color: "#92dffc", centerY,
      speed: enemySpeedForTime() * 0.82,
      slots: [
        { kind: "armored", x: 0, y: 0, leader: true },
        { kind: "scout", x: unit * 0.78, y: -spacing * 0.8 },
        { kind: "scout", x: unit * 0.78, y: spacing * 0.8 },
        { kind: "scout", x: unit * 1.56, y: -spacing * 1.6 },
        { kind: "scout", x: unit * 1.56, y: spacing * 1.6 },
      ] };
  }
  // 上下两条航线始终留在中心走廊外。低矮窗口减少编队规模，不挤占出口。
  const halfGap = Math.min(span * 0.32, Math.max(player.height * 0.72, 74));
  const offset = Math.min(span * 0.42, halfGap + unit * 0.23);
  return { kind: "pincer", title: "双翼包抄", hint: "上下夹击，中央航道保持畅通", color: "#a3b9ff", centerY: middle,
    safeTop: middle - Math.max(20, offset - unit * 0.32),
    safeBottom: middle + Math.max(20, offset - unit * 0.32),
    speed: enemySpeedForTime() * 0.96,
    slots: [
      { kind: "scout", x: 0, y: -offset }, { kind: "scout", x: unit * 1.35, y: -offset },
      { kind: "scout", x: 0, y: offset }, { kind: "scout", x: unit * 1.35, y: offset },
    ] };
}

function trySpawnFormation(kind) {
  if (!isBattleActive() || bossBlocksWaves() || battleTime < formationRules.firstArrival
    || formationState.warning || formationState.active) return false;
  if (typeof battlefieldEventBlocksWaves === "function" && battlefieldEventBlocksWaves()) return false;
  const kinds = ["escort", "command", "pincer"];
  const plan = formationPlan(kind || kinds[formationState.sequence % kinds.length]);
  // 窄矮窗口放不下上下侧翼和完整机身时，延后包抄，不挤压安全通道。
  if (plan.kind === "pincer" && plan.safeBottom - plan.safeTop < player.height + 24) return false;
  if (enemies.length + plan.slots.length > enemyRules.maxOnScreen) return false;
  formationState.warning = { ...plan, remaining: formationRules.warning };
  formationState.notice = plan.title + " · " + plan.hint;
  formationState.noticeTime = formationRules.warning + 2.4;
  statusMessage.textContent = formationState.notice;
  return true;
}

function launchFormation(plan) {
  if (bossBlocksWaves() || enemies.length + plan.slots.length > enemyRules.maxOnScreen) return false;
  if (plan.kind === "pincer" && plan.safeBottom - plan.safeTop < player.height + 24) return false;
  const group = { ...plan, id: formationState.nextId++, x: viewport.width + 84, age: 0,
    broken: false, disruption: 0, members: [] };
  for (const slot of plan.slots) {
    let kind = slot.kind;
    if (kind === "gunner" && enemies.filter(enemy => enemy.kind === "gunner").length >= enemyCombatRules.maxGunners) kind = "scout";
    spawnEnemy(kind);
    const enemy = enemies[enemies.length - 1];
    enemy.formationId = group.id;
    enemy.formationLeader = !!slot.leader;
    enemy.formationSlotX = slot.x;
    enemy.formationSlotY = slot.y;
    enemy.x = group.x + slot.x;
    enemy.y = clamp(plan.centerY + slot.y, flightBounds.top + enemy.height * 0.2, flightBounds.bottom - enemy.height * 0.2);
    enemy.previousX = enemy.x;
    enemy.previousY = enemy.y;
    enemy.baseY = enemy.y;
    enemy.waveAmplitude = 0;
    enemy.age = 0;
    group.members.push(enemy);
  }
  formationState.active = group;
  formationState.sequence++;
  // 四/五架编队替代对应数量的普通刷怪机会；不积累补刷债务。
  formationState.suppression = group.members.length * enemyIntervalForTime();
  enemyCooldown = Math.max(enemyCooldown, enemyIntervalForTime());
  formationState.nextTime = battleTime + formationRules.interval;
  return true;
}

function disruptFormation(group) {
  if (!group || group.broken) return;
  group.broken = true;
  group.disruption = formationRules.disruption;
  formationState.notice = "指挥链中断 · 编队失序";
  formationState.noticeTime = 1.8;
  for (const member of group.members) {
    if (!enemies.includes(member)) continue;
    member.formationDisoriented = formationRules.disruption;
    member.formationDrift = member.formationSlotY < 0 ? -24 : member.formationSlotY > 0 ? 24 : 0;
    if (member.kind === "gunner") { member.gunPhase = "recover"; member.gunTime = 0; }
  }
}

function onFormationEnemyDefeated(enemy) {
  const group = formationState.active;
  if (enemy?.formationLeader && group && enemy.formationId === group.id) disruptFormation(group);
}

function updateFormations(seconds) {
  if (!isBattleActive()) return;
  formationState.noticeTime = Math.max(0, formationState.noticeTime - seconds);
  formationState.suppression = Math.max(0, formationState.suppression - seconds);
  if (bossBlocksWaves()) {
    if (formationState.active || formationState.warning) resetFormations(false);
    formationState.nextTime = Math.max(formationState.nextTime, battleTime + 9);
    return;
  }
  const group = formationState.active;
  if (group) {
    group.age += seconds;
    group.x -= group.speed * seconds;
    group.disruption = Math.max(0, group.disruption - seconds);
    const survivors = group.members.filter(enemy => enemies.includes(enemy));
    if (!survivors.length) formationState.active = null;
    else if (!group.broken && group.members.some(member => member.formationLeader) && !survivors.some(member => member.formationLeader)) disruptFormation(group);
  }
  if (formationState.warning) {
    formationState.warning.remaining -= seconds;
    if (formationState.warning.remaining <= 0) {
      const plan = formationState.warning;
      formationState.warning = null;
      if (!launchFormation(plan)) formationState.nextTime = battleTime + 3;
    }
  } else if (typeof battlefieldEventBlocksWaves === "function" && battlefieldEventBlocksWaves()) {
    formationState.nextTime = Math.max(formationState.nextTime, battleTime + 3);
  } else if (!formationState.active && battleTime >= formationState.nextTime) {
    if (!trySpawnFormation()) formationState.nextTime = battleTime + 2;
  }
}

function formationControlsEnemy(enemy, seconds) {
  const group = formationState.active;
  if (!enemy.formationId || !group || enemy.formationId !== group.id) return false;
  enemy.age = (enemy.age ?? 0) + seconds;
  if (group.broken) {
    const stunned = enemy.formationDisoriented > 0;
    enemy.formationDisoriented = Math.max(0, (enemy.formationDisoriented ?? 0) - seconds);
    enemy.x -= enemy.speed * (stunned ? 0.36 : 1) * seconds;
    enemy.y = clamp(enemy.y + (stunned ? enemy.formationDrift : 0) * seconds,
      flightBounds.top + 10, flightBounds.bottom - 10);
    if (!stunned) {
      enemy.formationId = null;
      enemy.baseY = enemy.y;
      enemy.waveAmplitude = 0;
      if (enemy.kind === "gunner") { enemy.gunPhase = "retreat"; enemy.gunTime = 0; }
    }
    return true;
  }
  enemy.x = group.x + enemy.formationSlotX;
  const bob = group.kind === "pincer" ? 0 : Math.sin(group.age * 1.25) * Math.min(12, player.height * 0.08);
  enemy.y = clamp(group.centerY + enemy.formationSlotY + bob,
    flightBounds.top + enemy.height * 0.2, flightBounds.bottom - enemy.height * 0.2);
  if (enemy.kind === "gunner") {
    // 不从屏幕外开火，不因编队移动缩短原有的锁定预警。
    if (enemy.x > viewport.width - enemy.width * 0.6) return true;
    enemy.gunTime += seconds;
    if (enemy.gunPhase === "entry") beginEnemyAim(enemy);
    else if (enemy.gunPhase === "warning" && enemy.gunTime + 1e-9 >= enemyCombatRules.warning) {
      const muzzle = enemyGunMuzzle(enemy);
      if (player.x >= muzzle.x - 55 || Math.hypot(player.x - muzzle.x, player.y - muzzle.y) < Math.max(120, player.width * 0.9)) enemy.gunPhase = "retreat";
      else { fireEnemyGun(enemy); enemy.gunShots++; enemy.gunPhase = "recover"; enemy.gunTime = 0; }
    } else if (enemy.gunPhase === "recover" && enemy.gunTime >= enemyCombatRules.recovery) {
      if (enemy.gunShots >= enemyCombatRules.shotsPerGunner) enemy.gunPhase = "retreat";
      else beginEnemyAim(enemy);
    }
  }
  return true;
}

function drawFormationSignals() {
  if (state !== "battle" || bossBlocksWaves()) return;
  const warning = formationState.warning;
  context.save();
  if (warning) {
    const progress = 1 - warning.remaining / formationRules.warning;
    context.strokeStyle = warning.color;
    context.lineWidth = 1;
    context.globalAlpha = 0.24 + progress * 0.17;
    context.setLineDash([8, 12]);
    const drawn = new Set();
    for (const slot of warning.slots) {
      const y = warning.centerY + slot.y;
      if (drawn.has(y)) continue;
      drawn.add(y);
      context.beginPath(); context.moveTo(viewport.width - 12, y);
      context.lineTo(Math.max(viewport.width * 0.55, player.x + player.width), y); context.stroke();
      context.setLineDash([]);
      context.beginPath(); context.moveTo(viewport.width - 20, y - 5);
      context.lineTo(viewport.width - 27, y); context.lineTo(viewport.width - 20, y + 5); context.stroke();
      context.setLineDash([8, 12]);
    }
    context.setLineDash([]);
    if (warning.kind === "pincer") {
      context.fillStyle = "#6af3b6"; context.globalAlpha = 0.035;
      context.fillRect(viewport.width * 0.5, warning.safeTop, viewport.width * 0.5, warning.safeBottom - warning.safeTop);
    }
  }
  if (formationState.noticeTime > 0 && viewport.width >= 720 && viewport.height >= 480) {
    const alpha = Math.min(1, formationState.noticeTime * 2);
    const x = viewport.width / 2, y = Math.max(156, flightBounds.top + 13);
    context.globalAlpha = alpha * 0.9;
    context.fillStyle = "#07101fd9";
    context.beginPath(); context.roundRect(x - 170, y - 16, 340, 28, 5); context.fill();
    context.fillStyle = warning?.color || "#cbddec";
    context.font = '500 12px "Microsoft YaHei", sans-serif';
    context.textAlign = "center"; context.textBaseline = "middle";
    context.fillText(formationState.notice, x, y - 2);
  }
  context.restore();
}
