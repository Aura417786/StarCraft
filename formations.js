"use strict";

// 编队占用普通刷怪预算，不叠加一套额外的敌潮。所有时间只由有效战斗推进。
const formationRules = { firstArrival: 24, interval: 17, warning: 1.35, disruption: 1.5 };
const formationTactics = {
  escort: {
    opening: ["双翼交叉锁点 · 离开红色交会点", "Escorts crossing · Leave the marked target"],
    follow: ["后卫补枪 · 再换一次位置", "Rear guard follows · Move again"],
    tint: "#ffb789",
  },
  command: {
    opening: ["横向封锁 · 击破封锁机可打开本列", "Lane blockade · Destroy a jammer to open its lane"],
    follow: ["剩余封锁机交叉射击 · 离开通道中线", "Surviving jammers cross-fire · Leave the lane center"],
    tint: "#ff92c5",
  },
  pincer: {
    opening: ["V 字包夹 · 从中间击破领航机", "V pincer · Strike the spotter from the center"],
    follow: ["领航机标记中线 · 两翼即将夹击", "Spotter locked the center · Both flanks are converging"],
    tint: "#b6a9ff",
  },
};
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
  const group = formationState.active;
  return !!formationState.warning || formationState.suppression > 0
    || !!(group && !group.broken && group.coordination && group.coordination.beat < 2);
}

function resizePincerFormation(plan) {
  if (plan.kind !== "pincer" || plan.broken) return;
  const members = plan.members || [];
  const scoutHeight = Math.min(100, player.width * 0.65) * enemyTypes.scout.width * enemyTypes.scout.height;
  const halfBody = Math.max(scoutHeight, ...members.map(enemy => enemy.height)) / 2;
  const halfGap = player.height / 2 + 12;
  const minimumOffset = halfGap + halfBody;
  const currentOffset = Math.min(...plan.slots.filter(slot => slot.role === "flank").map(slot => Math.abs(slot.y)));
  const maximumOffset = Math.max(minimumOffset, Math.abs(formationPlan("pincer").slots[0].y));
  const closing = 1 - (plan.coordination?.flankClose ?? 0) * .28;
  const offset = clamp(currentOffset * closing, minimumOffset, maximumOffset);
  const minimumCenter = offset * 1.18 + halfBody;
  const maximumCenter = viewport.height - minimumCenter;
  plan.centerY = minimumCenter <= maximumCenter
    ? clamp(plan.centerY, minimumCenter, maximumCenter) : viewport.height / 2;
  plan.safeTop = plan.centerY - (offset - halfBody);
  plan.safeBottom = plan.centerY + (offset - halfBody);
  for (const slot of plan.slots) if (slot.role === "flank") slot.y = Math.sign(slot.y) * offset / closing * (slot.x > 0 ? 1.18 : 1);
  members.forEach((enemy, index) => {
    if (!enemies.includes(enemy)) return;
    enemy.formationSlotY = plan.slots[index].y;
    enemy.y = plan.centerY + enemy.formationSlotY * closing;
    enemy.previousY = enemy.y;
    enemy.baseY = enemy.y;
  });
}

function formationPlan(kind) {
  const top = flightBounds.top + 15, bottom = flightBounds.bottom - 15;
  const middle = (top + bottom) / 2, span = Math.max(1, bottom - top);
  const unit = Math.min(100, player.width * 0.65);
  const spacing = Math.min(unit * 0.9, span * 0.19);
  const safeCenter = clamp(player.y, top + spacing * 1.5, bottom - spacing * 1.5);
  if (kind === "escort") {
    return { kind, title: tr("护航编队", "Escort Formation"), hint: tr("侧翼先锁点，后卫随后追击", "Escorts mark first, rear guard follows"), color: "#f2c685", centerY: safeCenter,
      speed: enemySpeedForTime() * 0.66,
      slots: [
        { kind: "armored", x: 0, y: 0, leader: true },
        { kind: "scout", x: unit * 0.9, y: -spacing },
        { kind: "scout", x: unit * 0.9, y: spacing },
        { kind: battleTime >= enemyCombatRules.gunnerArrival ? "gunner" : "scout", x: unit * 1.75, y: 0 },
      ] };
  }
  if (kind === "command") {
    const top = flightBounds.top + 2, bottom = flightBounds.bottom - 2;
    const span = Math.max(1, bottom - top);
    const halfGap = Math.min(span * .17, Math.max(20, player.height * .28));
    const clearance = player.height * .16 + 10;
    const bias = Math.min(span * .21, player.speed * .48, Math.max(0, span / 2 - halfGap - clearance - 2));
    const safeY = middle + (player.y < middle ? 1 : -1) * bias;
    const safeTop = safeY - halfGap, safeBottom = safeY + halfGap;
    const laneYs = [top, safeTop - clearance, safeBottom + clearance, bottom];
    return { kind, title: tr("横向封锁阵", "Lane Blockade"), hint: tr("每架封锁机只负责一条航线", "Each jammer owns a single lane"), color: "#92dffc", centerY: middle,
      safeTop, safeBottom,
      speed: enemySpeedForTime() * 0.82,
      slots: [
        { kind: "armored", x: unit * .86, y: safeY - middle, leader: true, role: "command" },
        ...laneYs.map(y => ({ kind: "scout", x: 0, y: y - middle, role: "jammer" })),
      ] };
  }
  // 上下两条航线始终留在中心走廊外。低矮窗口减少编队规模，不挤占出口。
  const halfGap = Math.min(span * 0.32, Math.max(player.height * 0.72, 74));
  const offset = Math.min(span * 0.42, halfGap + unit * 0.23);
  return { kind: "pincer", title: tr("V 字包夹", "V Pincer"), hint: tr("击破中间领航机可打断夹击", "Break the center spotter to interrupt the pincer"), color: "#a3b9ff", centerY: middle,
    safeTop: middle - Math.max(20, offset - unit * 0.32),
    safeBottom: middle + Math.max(20, offset - unit * 0.32),
    speed: enemySpeedForTime() * 0.96,
    slots: [
      { kind: "scout", x: 0, y: -offset, role: "flank" },
      { kind: "scout", x: unit * .93, y: -offset * 1.18, role: "flank" },
      { kind: "scout", x: 0, y: offset, role: "flank" },
      { kind: "scout", x: unit * .93, y: offset * 1.18, role: "flank" },
      { kind: "armored", x: -unit * .82, y: 0, leader: true, role: "spotter" },
    ] };
}

function trySpawnFormation(kind) {
  if (aceBlocksWaves() || gravityTideBusy()) return false;
  if (!isBattleActive() || bossBlocksWaves() || battleTime < formationRules.firstArrival
    || formationState.warning || formationState.active) return false;
  if (typeof battlefieldEventBlocksWaves === "function" && battlefieldEventBlocksWaves()) return false;
  const kinds = ["escort", "command", "pincer"];
  const plan = formationPlan(kind || kinds[formationState.sequence % kinds.length]);
  if (plan.kind === "command" && flightBounds.bottom - flightBounds.top < player.height * .90) return false;
  // 窄矮窗口放不下上下侧翼和完整机身时，延后包抄，不挤压安全通道。
  if (plan.kind === "pincer" && plan.safeBottom - plan.safeTop < player.height * .60 + 24) return false;
  if (enemies.length + plan.slots.length > enemyRules.maxOnScreen) return false;
  formationState.warning = { ...plan, remaining: formationRules.warning };
  formationState.notice = plan.title + " · " + plan.hint;
  formationState.noticeTime = formationRules.warning + 2.4;
  statusMessage.textContent = formationState.notice;
  return true;
}

function launchFormation(plan) {
  if (aceBlocksWaves() || gravityTideBusy()) return false;
  if (bossBlocksWaves() || enemies.length + plan.slots.length > enemyRules.maxOnScreen) return false;
  if (plan.kind === "command" && flightBounds.bottom - flightBounds.top < player.height * .90) return false;
  if (plan.kind === "pincer" && plan.safeBottom - plan.safeTop < player.height * .60 + 24) return false;
  const group = { ...plan, id: formationState.nextId++, x: viewport.width + 84, age: 0,
    broken: false, disruption: 0, members: [], coordination: null };
  for (const slot of plan.slots) {
    let kind = slot.kind;
    if (kind === "gunner" && enemies.filter(enemy => enemy.kind === "gunner").length >= enemyCombatRules.maxGunners) kind = "scout";
    spawnEnemy(kind);
    const enemy = enemies[enemies.length - 1];
    enemy.formationId = group.id;
    enemy.formationLeader = !!slot.leader;
    enemy.formationRole = slot.role;
    enemy.formationSlotX = slot.x;
    enemy.formationSlotY = slot.y;
    enemy.x = group.x + slot.x;
    enemy.y = plan.kind === "pincer" ? plan.centerY + slot.y
      : clamp(plan.centerY + slot.y, flightBounds.top + enemy.height * 0.2, flightBounds.bottom - enemy.height * 0.2);
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
  if (group.coordination) group.coordination.cue = null;
  group.disruption = formationRules.disruption;
  formationState.notice = tr("指挥链中断 · 编队失序", "Command lost · Formation broken");
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

function formationEmitterVisible(member) {
  const muzzle = enemyGunMuzzle(member);
  return muzzle.x >= 60 && muzzle.x <= viewport.width - 18;
}

function blockadePassage(rails, preferred, targetY, clearance, maxTravel) {
  const center = (preferred.top + preferred.bottom) / 2;
  if (Math.abs(center - targetY) <= maxTravel) return preferred;
  // A fast pilot can change altitude between approach and firing. Advertise the nearest real
  // passage if the planned one is no longer reachable, keeping all rails tied to their emitters.
  let bottom = flightBounds.top;
  let best = preferred, distance = Math.abs(center - targetY);
  for (const y of [...rails.map(shot => shot.y).sort((a, b) => a - b), flightBounds.bottom + clearance]) {
    const edge = y - clearance;
    if (edge - bottom >= 10) {
      const delta = Math.abs((edge + bottom) / 2 - targetY);
      if (delta < distance) { best = { top: bottom, bottom: edge }; distance = delta; }
    }
    bottom = Math.max(bottom, y + clearance);
  }
  return best;
}

function makeFormationCue(group, beat, members) {
  const rule = formationTactics[group.kind];
  const leftmostMuzzle = Math.min(...members.map(member => enemyGunMuzzle(member).x));
  const target = { x: Math.min(player.x, leftmostMuzzle - 40), y: player.y };
  const spread = Math.max(24, player.height * .33);
  const radius = 7;
  const clearance = player.height * .16 + radius + 1;
  const speed = clamp(viewport.width * .64, 440, 1180);
  const warning = (beat ? .90 : 1.10) + (typeof sortieWarningBonus === "function" ? sortieWarningBonus() * .55 : 0);
  const cue = { target, gap: null, shots: [], remaining: warning, warning, tint: rule.tint, poseAge: group.age,
    text: tr(...(beat ? rule.follow : rule.opening)) };
  const front = members[0];
  const rear = members.at(-1);
  const wings = members.filter(member => (group.kind === "command" ? member.formationRole === "jammer"
    : Math.abs(member.formationSlotY) > 1));
  const upper = wings.reduce((best, member) => member.y < best.y ? member : best, wings[0] || front);
  const lower = wings.reduce((best, member) => member.y > best.y ? member : best, wings[0] || rear);
  const aim = (member, x, y) => {
    const muzzle = enemyGunMuzzle(member);
    const angle = Math.atan2(y - muzzle.y, Math.min(x, muzzle.x - 40) - muzzle.x);
    cue.shots.push({ member, x: muzzle.x, y: muzzle.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius });
  };
  const rail = (member, y) => {
    cue.shots.push({ member, x: enemyGunMuzzle(member).x, y, vx: -speed, vy: 0, radius });
  };
  if (beat) {
    if (group.kind === "escort") {
      aim(rear, target.x, target.y);
      aim(rear, target.x, target.y + (target.y > viewport.height / 2 ? spread : -spread));
    } else {
      aim(upper, target.x, target.y);
      if (lower !== upper) aim(lower, target.x, target.y);
    }
  } else if (group.kind === "escort") {
    aim(upper, target.x, target.y);
    if (lower !== upper) aim(lower, target.x, target.y);
  } else if (group.kind === "pincer") {
    const topWing = wings.filter(member => member.formationSlotY < 0);
    const bottomWing = wings.filter(member => member.formationSlotY > 0);
    cue.gap = { top: topWing.length ? Math.max(...topWing.map(member => member.y)) + clearance : flightBounds.top,
      bottom: bottomWing.length ? Math.min(...bottomWing.map(member => member.y)) - clearance : flightBounds.bottom };
    for (const member of wings) rail(member, member.y);
  } else {
    cue.gap = { top: group.safeTop, bottom: group.safeBottom };
    // Every hazard belongs to a visible ship. Destroying the emitter opens its lane immediately.
    const outsideGap = y => y <= group.safeTop - clearance || y >= group.safeBottom + clearance;
    for (const member of wings) {
      if (!outsideGap(member.y)) continue;
      rail(member, member.y);
      const extra = member.y + Math.sign(member.y - (group.safeTop + group.safeBottom) / 2) * spread * .45;
      if (extra > flightBounds.top && extra < flightBounds.bottom) rail(member, extra);
    }
    cue.gap = blockadePassage(cue.shots, cue.gap, target.y, clearance, player.speed * warning * .60);
  }
  return cue;
}

function updateFormationTactics(group, members, seconds) {
  if (!Object.hasOwn(formationTactics, group.kind) || group.broken) return;
  const ready = members.filter(formationEmitterVisible);
  let rhythm = group.coordination;
  if (!rhythm) {
    // 发射点必须可见。侧翼协同时等两个角度都进入画面。
    if (flightBounds.bottom - flightBounds.top < player.height * .67
        || ready.length < Math.min(3, members.length)
        || group.x < viewport.width * .42) return;
    group.coordination = rhythm = { beat: 0, wait: 0, cue: null, passage: null, flankClose: 0 };
  }
  if (rhythm.beat >= 2) return;
  if (rhythm.cue) {
    const cue = rhythm.cue;
    cue.remaining -= seconds;
    if (cue.remaining > 0) return;
    let travel = 0;
    let fired = false;
    for (const { member, x, y, vx, vy, radius } of cue.shots) {
      if (!enemies.includes(member) || enemyProjectiles.length >= enemyCombatRules.maxProjectiles) continue;
      enemyProjectiles.push({ x, y, previousX: x, previousY: y, vx, vy, radius, age: 0,
        formationAttack: true, formationTint: cue.tint });
      travel = Math.max(travel, (x - flightBounds.left) / -vx);
      fired = true;
    }
    if (fired) gameAudio.bossAttack("volley", cue.shots[0].x, cue.shots[0].y, false);
    rhythm.beat++;
    rhythm.wait = Math.max(.28, travel - .23);
    rhythm.passage = fired ? cue.gap : null;
    rhythm.cue = null;
  } else {
    rhythm.wait -= seconds;
    if (group.kind === "pincer" && rhythm.beat === 1) rhythm.flankClose = Math.min(1, rhythm.flankClose + seconds * 1.3);
    if (rhythm.wait > 0) return;
    if (!ready.length) { rhythm.beat = 2; rhythm.passage = null; return; }
    rhythm.passage = null;
    rhythm.cue = makeFormationCue(group, rhythm.beat, ready);
    formationState.notice = rhythm.cue.text;
    formationState.noticeTime = rhythm.cue.warning + .38;
    movementHint.hidden = true;
    statusMessage.textContent = formationState.notice;
  }
}

function resizeFormationTactics(group) {
  const rhythm = group.coordination;
  if (!rhythm) return;
  rhythm.passage = null;
  if (!rhythm.cue) return;
  const members = group.members.filter(member => enemies.includes(member) && formationEmitterVisible(member));
  rhythm.cue = members.length ? makeFormationCue(group, rhythm.beat, members) : null;
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
    const coordinating = group.coordination && group.coordination.beat < 2 && !group.broken;
    const approachSpeed = coordinating ? (group.coordination.cue ? 0 : .16) : 1;
    group.x -= group.speed * approachSpeed * seconds;
    group.disruption = Math.max(0, group.disruption - seconds);
    const survivors = group.members.filter(enemy => enemies.includes(enemy));
    if (!survivors.length) formationState.active = null;
    else if (!group.broken && group.members.some(member => member.formationLeader) && !survivors.some(member => member.formationLeader)) disruptFormation(group);
    else updateFormationTactics(group, survivors, seconds);
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
  } else if (!formationState.active && battleTime >= formationState.nextTime && !journeyBlocksNewEncounters()) {
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
  const poseAge = group.coordination?.cue?.poseAge ?? group.age;
  const bob = group.kind === "pincer" ? 0 : Math.sin(poseAge * 1.25) * Math.min(12, player.height * 0.08);
  // 已在场的包抄队在窄窗借用上下边缘，不让旧玩家飞行边界把两翼挤回中央。
  if (group.kind === "pincer") enemy.y = group.centerY + enemy.formationSlotY * (1 - (group.coordination?.flankClose ?? 0) * .28);
  else if (group.kind === "command") enemy.y = clamp(group.centerY + enemy.formationSlotY, enemy.height * .5, viewport.height - enemy.height * .5);
  else enemy.y = clamp(group.centerY + enemy.formationSlotY + bob,
    flightBounds.top + enemy.height * .2, flightBounds.bottom - enemy.height * .2);
  if (enemy.kind === "gunner" && !Object.hasOwn(formationTactics, group.kind)) {
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
  const rhythm = formationState.active?.coordination;
  const cue = rhythm?.cue;
  const gap = cue?.gap ?? rhythm?.passage;
  if (gap && gap.bottom > gap.top) {
    context.globalAlpha = .15;
    context.fillStyle = "#77f5d7";
    context.fillRect(0, gap.top, viewport.width * .62, gap.bottom - gap.top);
    context.globalAlpha = .55;
    context.strokeStyle = "#a2fff1";
    context.setLineDash([10, 8]);
    context.beginPath();
    for (const y of [gap.top, gap.bottom]) {
      context.moveTo(0, y); context.lineTo(viewport.width * .62, y);
    }
    context.stroke();
    context.setLineDash([]);
  }
  if (cue) {
    const flash = 1 - cue.remaining / cue.warning;
    context.globalAlpha = .45 + flash * .38;
    context.strokeStyle = cue.tint;
    context.lineWidth = 1.5;
    context.setLineDash(formationState.active?.kind === "command" ? [13, 4, 3, 4] : [7, 9]);
    context.beginPath();
    for (const shot of cue.shots) {
      if (!enemies.includes(shot.member)) continue;
      context.moveTo(shot.x, shot.y);
      context.lineTo(0, shot.y - shot.x / shot.vx * shot.vy);
    }
    context.stroke();
    context.setLineDash([]);
    if (!cue.gap) {
      const { x, y } = cue.target;
      context.beginPath(); context.arc(x, y, 14 + 8 * (1 - flash), 0, Math.PI * 2); context.stroke();
    }
  }
  const group = formationState.active;
  if (group && !group.broken && (group.kind === "pincer" || group.kind === "command")) {
    const leader = group.members.find(member => member.formationLeader);
    if (leader && enemies.includes(leader) && leader.x < viewport.width - 15 && leader.x > 10) {
      const size = 7, y = leader.y - leader.height * .5 - 24;
      context.globalAlpha = .82;
      context.strokeStyle = group.color;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(leader.x, y - size); context.lineTo(leader.x + size, y);
      context.lineTo(leader.x, y + size); context.lineTo(leader.x - size, y); context.closePath();
      context.stroke();
      context.globalAlpha = cue ? .25 : .16;
      context.lineWidth = 1;
      context.setLineDash(group.kind === "pincer" ? [4, 8] : [2, 7]);
      context.beginPath();
      for (const member of group.members) {
        if (member === leader || !enemies.includes(member)) continue;
        context.moveTo(leader.x, leader.y); context.lineTo(member.x, member.y);
      }
      context.stroke(); context.setLineDash([]);
    }
  }
  if (formationState.noticeTime > 0 && viewport.width >= 540 && viewport.height >= 340) {
    const alpha = Math.min(1, formationState.noticeTime * 2);
    const x = viewport.width / 2, y = viewport.height < 480 ? 145 : Math.max(156, flightBounds.top + 13);
    context.globalAlpha = alpha * 0.9;
    context.fillStyle = "#07101fd9";
    context.beginPath(); context.roundRect(x - 170, y - 16, 340, 28, 5); context.fill();
    context.fillStyle = cue?.tint || warning?.color || "#cbddec";
    context.font = '500 12px "Microsoft YaHei", sans-serif';
    context.textAlign = "center"; context.textBaseline = "middle";
    context.fillText(formationState.notice, x, y - 2);
  }
  context.restore();
}
