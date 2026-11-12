"use strict";

const eliteKinds = ["minelayer", "shield-guard", "splitter"];
const eliteCopy = {
  minelayer: ["布雷舰", "Minelayer", "前方航线即将布雷 · 换道或射毁感应雷", "Mines incoming on your route · Change lanes or shoot them", "#ffac65"],
  "shield-guard": ["护盾卫", "Shield Guard", "优先为正在瞄准的炮击机撑盾", "Protects charging gunners first · Break the guard", "#67efd5"],
  splitter: ["分裂体", "Splitter", "贴身击破会受到双路夹击 · 保持距离", "Offspring fan out on defeat · Kill it from a distance", "#d8a4ff"],
};
Object.assign(enemyTypes, {
  minelayer: { health: 1.92, speed: .76, width: 1.22, height: .64, points: 240 },
  "shield-guard": { health: .82, speed: .88, width: .95, height: .58, points: 230 },
  splitter: { health: 1.64, speed: 1.02, width: 1.04, height: .67, points: 240 },
  splitling: { health: .656, speed: 1.20, width: .58, height: .55, points: 45 },
});
const eliteRules = { first: 27, interval: 19, capacity: 6, mineWarning: 1.2, mineWindup: .34, mineDrop: .166,
  guardRange: 210, guardRetarget: .43, splitGrace: .23 };
const eliteDirector = { next: eliteRules.first, order: 0, mines: [],
  spawned: { minelayer: 0, "shield-guard": 0, splitter: 0 } };

function resetEliteEncounters(resetProgress = true) {
  eliteDirector.mines.length = 0;
  for (const enemy of enemies) delete enemy.escortShield;
  if (resetProgress) {
    eliteDirector.next = eliteRules.first;
    eliteDirector.order = 0;
    for (const kind of eliteKinds) eliteDirector.spawned[kind] = 0;
  }
}

function eliteWaveKind() {
  if (battleTime < eliteDirector.next || !sortieAllowsWaves() || bossBlocksWaves()
    || gravityTideBusy() || enemies.some(enemy => eliteKinds.includes(enemy.kind))) return null;
  const kind = eliteKinds[eliteDirector.order % eliteKinds.length];
  if (kind === "minelayer" && eliteDirector.mines.length) return null;
  if (kind === "splitter" && enemies.length > enemyRules.maxOnScreen - 2) return null;
  return kind;
}

function beginEliteEnemy(enemy) {
  const { kind } = enemy;
  if (!eliteKinds.includes(kind)) return;
  eliteDirector.spawned[kind]++;
  eliteDirector.order++;
  eliteDirector.next = battleTime + eliteRules.interval;
  if (kind === "minelayer") Object.assign(enemy, { mineClock: 0, minesDropped: 0 });
  const [label, english, prompt, hint] = eliteCopy[kind];
  announceBattlefieldEvent(tr(label + " · " + prompt, english + " · " + hint), 3.5);
}

function dropEliteMine(enemy) {
  const i = enemy.minesDropped++;
  // Three pairs fence the locked route from alternating sides. A route stays committed for the full drop.
  const lane = enemy.mineRouteY ?? enemy.y;
  const reach = Math.min(44, player.height * .37);
  const offset = (i % 2 === 0 ? -1 : 1) * reach * (1 - Math.floor(i / 2) * .19);
  const y = clamp(lane + offset, flightBounds.top, flightBounds.bottom);
  const x = enemy.x + enemy.width * .32;
  const radius = clamp(player.height * .56, 36, 72);
  const hp = Math.min(87, 4 + enemyHealthForTime() * .37);
  eliteDirector.mines.push({ x, y, previousX: x, previousY: y,
    radius: 12, blastRadius: radius, age: 0, hp, maxHp: hp, hitFlash: 0 });
}

const escortableKinds = new Set(["scout", "armored", "gunner"]);
function eliteEscortPriority(enemy, guard) {
  const committed = enemy.kind === "gunner" && (enemy.gunPhase === "warning" || enemy.gunPhase === "relay");
  const category = committed ? 0 : enemy.kind === "gunner" || enemy.formationLeader ? 1 : 2;
  return category * 320 + Math.hypot(enemy.x - guard.x, enemy.y - guard.y);
}
function keepEliteEscortPosition(guard, seconds) {
  guard.escortTimer = (guard.escortTimer ?? 0) - seconds;
  let ally = guard.escortAnchor;
  if (!ally || !enemies.includes(ally) || guard.escortTimer <= 0) {
    let priority = Infinity;
    ally = null;
    for (const enemy of enemies) {
      if (!escortableKinds.has(enemy.kind) || enemy.hp <= 0 || enemy.x < player.x + player.width * .75
        || Math.hypot(enemy.x - guard.x, enemy.y - guard.y) > eliteRules.guardRange * 1.5) continue;
      const rank = eliteEscortPriority(enemy, guard);
      if (rank < priority) { ally = enemy; priority = rank; }
    }
    guard.escortAnchor = ally;
    guard.escortTimer = eliteRules.guardRetarget;
  }
  if (!ally) {
    guard.x -= guard.speed * seconds;
    guard.y = clamp(guard.y + clamp(guard.baseY - guard.y, -90 * seconds, 90 * seconds),
      flightBounds.top, flightBounds.bottom);
    return;
  }
  const x = ally.x + guard.width * .76;
  const side = ally.y > (flightBounds.top + flightBounds.bottom) / 2 ? -1 : 1;
  const y = clamp(ally.y + side * guard.height * .9, flightBounds.top, flightBounds.bottom);
  // Escort behind the defended target and match speed without teleporting or running backwards.
  const advance = clamp(-((x - guard.x) * 2) + ally.speed * .76, 0, guard.speed * 1.42);
  guard.x -= advance * seconds;
  guard.y += clamp(y - guard.y, -130 * seconds, 130 * seconds);
}

function updateEliteEnemy(enemy, seconds) {
  if (!eliteKinds.includes(enemy.kind) && enemy.kind !== "splitling") return false;
  enemy.age += seconds;
  if (enemy.kind === "shield-guard") { keepEliteEscortPosition(enemy, seconds); return true; }
  enemy.x -= enemy.speed * seconds;
  if (enemy.kind === "minelayer") {
    if (enemy.mineRouteY === undefined && enemy.x < viewport.width * .86) {
      const drift = (player.y - (player.previousY ?? player.y)) / Math.max(seconds, 1 / 120);
      const reach = Math.min(95, (flightBounds.bottom - flightBounds.top) * .27);
      const lead = clamp(player.y + drift * .24, enemy.y - reach, enemy.y + reach);
      enemy.mineRouteY = clamp(lead, flightBounds.top, flightBounds.bottom);
      enemy.mineClock = eliteRules.mineWindup;
      gameAudio.fieldCue?.("mine-arm", enemy.x, enemy.mineRouteY);
    }
    const y = (enemy.mineRouteY ?? enemy.baseY) + Math.sin(enemy.age * 2) * 10;
    enemy.y = clamp(enemy.y + clamp(y - enemy.y, -110 * seconds, 110 * seconds), flightBounds.top, flightBounds.bottom);
    if (enemy.minesDropped < eliteRules.capacity && enemy.mineRouteY !== undefined) {
      enemy.mineClock -= seconds;
      if (enemy.mineClock <= 0 && eliteDirector.mines.length < eliteRules.capacity) {
        enemy.mineClock += eliteRules.mineDrop;
        dropEliteMine(enemy);
      }
    }
  } else if (enemy.kind === "splitter") {
    enemy.y = clamp(enemy.baseY + Math.sin(enemy.age * 2.6) * 19, flightBounds.top, flightBounds.bottom);
  } else {
    const drift = enemy.splitDrift || 0;
    enemy.y = clamp(enemy.baseY + drift * (1 - Math.exp(-enemy.age * 3))
      + Math.sin(enemy.age * 4.6) * 9, flightBounds.top, flightBounds.bottom);
  }
  return true;
}

function refreshEliteEscortShields(seconds) {
  const guard = enemies.find(enemy => enemy.kind === "shield-guard" && enemy.x < viewport.width && enemy.hp > 0);
  for (const enemy of enemies) {
    const shield = enemy.escortShield;
    if (!shield) continue;
    if (shield.guard !== guard || Math.hypot(enemy.x - guard.x, enemy.y - guard.y) > eliteRules.guardRange + 28) {
      if (shield.hp < shield.maxHp) (shield.guard.exhaustedLinks ??= new WeakSet()).add(enemy);
      delete enemy.escortShield;
    } else shield.flash = Math.max(0, shield.flash - seconds);
  }
  if (!guard) return;
  const allies = enemies.filter(enemy => !enemy.escortShield && !guard.exhaustedLinks?.has(enemy) && escortableKinds.has(enemy.kind)
    && Math.hypot(enemy.x - guard.x, enemy.y - guard.y) <= eliteRules.guardRange);
  allies.sort((a, b) => eliteEscortPriority(a, guard) - eliteEscortPriority(b, guard));
  const connected = enemies.filter(enemy => enemy.escortShield?.guard === guard);
  let slots = 3 - connected.length;
  if (!slots && allies.length && eliteEscortPriority(allies[0], guard) < eliteRules.guardRange) {
    const substitute = connected.find(enemy => eliteEscortPriority(enemy, guard) >= 320);
    if (substitute) {
      const shield = substitute.escortShield;
      if (shield.hp < shield.maxHp) (guard.exhaustedLinks ??= new WeakSet()).add(substitute);
      delete substitute.escortShield;
      slots = 1;
    }
  }
  for (const ally of allies.slice(0, Math.max(0, slots))) {
    const maxHp = Math.min(140, Math.max(7, Math.exp(Math.min(6, ally.healthLog)) * .32));
    ally.escortShield = { hp: maxHp, maxHp, guard, flash: 0 };
    if (!guard.linkedOnce) {
      guard.linkedOnce = true;
      gameAudio.fieldCue?.("guard-link", guard.x, guard.y);
    }
  }
}

function absorbEliteEscortShield(enemy, shot) {
  const shield = enemy.escortShield;
  if (shot.piercesShield || !shield || shield.hp <= 0 || !enemies.includes(shield.guard)) return shot;
  const amount = shot.damageLog === undefined ? shot.damage ?? weapon.damage : Math.exp(Math.min(15, shot.damageLog));
  const absorbed = Math.min(shield.hp, amount * (shot.armorPiercing ? .62 : 1));
  shield.hp -= absorbed;
  shield.flash = .14;
  recordCombatImpact(enemy, shot);
  if (shield.hp <= 1e-9) {
    shield.hp = 0;
    addEvolutionPulse(enemy.x, enemy.y, enemy.width * .64, "#67efd5", .28);
    gameAudio.fieldCue?.("cover-hit", enemy.x, enemy.y);
  }
  const remaining = amount - absorbed;
  return remaining > 1e-8 ? { ...shot, damage: remaining, damageLog: Math.log(remaining) } : null;
}

function onEliteEnemyDefeated(enemy) {
  if (enemy.kind === "shield-guard") {
    for (const ally of enemies) if (ally.escortShield?.guard === enemy) delete ally.escortShield;
    return;
  }
  if (enemy.kind !== "splitter") return;
  const nearSide = player.y < enemy.y ? -1 : 1;
  for (const direction of [-1, 1]) {
    const pursuit = direction === nearSide;
    const x = enemy.x + enemy.width * (pursuit ? -.14 : .20);
    const y = clamp(enemy.y + direction * enemy.height * .18, flightBounds.top, flightBounds.bottom);
    enemies.push({ kind: "splitling", x, previousX: x, y, previousY: y, baseY: y, age: 0,
      width: enemy.width * .57, height: enemy.height * .55, hitFlash: .18,
      hp: 1, maxHp: 1, displayHp: 1, healthLog: enemy.healthLog + Math.log(.4),
      speed: enemy.speed * (pursuit ? 1.28 : .89), splitDrift: direction * enemy.height * (pursuit ? .68 : 1.14),
      points: enemyTypes.splitling.points });
  }
  gameAudio.fieldCue?.("splitter", enemy.x, enemy.y);
  addEvolutionPulse(enemy.x, enemy.y, enemy.width * .62, "#d8a4ff", .33);
}

function defuseEliteMine(mine, shot) {
  const index = eliteDirector.mines.indexOf(mine);
  if (index < 0) return false;
  mine.hp -= shot.damage ?? Math.exp(Math.min(15, shot.damageLog ?? Math.log(weapon.damage)));
  mine.hitFlash = .12;
  if (mine.hp > 0) return false;
  eliteDirector.mines.splice(index, 1);
  addEvolutionPulse(mine.x, mine.y, 24, "#bce9ff", .25);
  gameAudio.fieldCue?.("mine-defuse", mine.x, mine.y);
  return true;
}

function resolveUltimateMines(shot) {
  for (const mine of [...eliteDirector.mines]) {
    if (shot.hitTargets.has(mine)) continue;
    const target = { ...mine, width: mine.radius * 2, height: mine.radius * 2 };
    if (ultimateHitsTarget(shot, target)) {
      shot.hitTargets.add(mine);
      defuseEliteMine(mine, shot);
    }
  }
}

function detonateEliteMine(mine) {
  const radius = mine.blastRadius;
  const damage = Math.min(220, 9 + enemyHealthForTime() * .72);
  const hit = { damage, damageLog: Math.log(damage), noEnergy: true, source: "mine-burst", x: mine.x, y: mine.y };
  combatBurst(mine.x, mine.y, 1.1, "#ffaf66", true);
  addEvolutionPulse(mine.x, mine.y, radius, "#ffb579", .3);
  gameAudio.fieldCue?.("mine-burst", mine.x, mine.y);
  for (const enemy of [...enemies]) {
    if (!enemies.includes(enemy) || enemy.hp <= 0 || Math.hypot(enemy.x - mine.x, enemy.y - mine.y) > radius + enemy.height * .28) continue;
    applyEnemyHit(enemy, hit);
    if (enemy.hp <= 0) defeatEnemy(enemies.indexOf(enemy), hit);
  }
  if (Math.hypot(player.x - mine.x, player.y - mine.y) <= radius + player.height * .16) {
    damagePlayer(tr("感应雷引爆 · 离开橙色预警圈或提前射毁", "Mine blast · Leave the orange ring or shoot the mine"), mine);
  }
}

function updateEliteMines(seconds) {
  if (!isBattleActive() || !sortieAllowsWaves()) return;
  if (bossBlocksWaves()) { eliteDirector.mines.length = 0; return; }
  const mines = eliteDirector.mines;
  for (let index = mines.length - 1; index >= 0; index--) {
    const mine = mines[index];
    mine.age += seconds;
    mine.previousX = mine.x; mine.previousY = mine.y;
    mine.x -= seconds * 16;
    mine.hitFlash = Math.max(0, mine.hitFlash - seconds);
    if (mine.age + 1e-9 < eliteRules.mineWarning) continue;
    mines.splice(index, 1);
    detonateEliteMine(mine);
    if (!isBattleActive()) break;
  }
}

function resizeEliteMines(scaleX, scaleY, mapY) {
  for (const enemy of enemies) if (enemy.mineRouteY !== undefined) enemy.mineRouteY = mapY(enemy.mineRouteY);
  for (const mine of eliteDirector.mines) {
    mine.x *= scaleX;
    mine.previousX = mine.x;
    mine.y = mapY(mine.y);
    mine.previousY = mine.y;
    mine.blastRadius = clamp(mine.blastRadius * Math.min(scaleX, scaleY), 36, 72);
  }
}

function drawEliteMines() {
  for (const enemy of enemies) {
    if (enemy.kind !== "minelayer" || enemy.minesDropped >= eliteRules.capacity || enemy.mineRouteY === undefined) continue;
    const y = enemy.mineRouteY;
    const x = enemy.x + enemy.width * .28;
    const length = Math.min(viewport.width * .22, enemy.speed * (eliteRules.mineWindup + eliteRules.capacity * eliteRules.mineDrop));
    context.save();
    context.lineWidth = 1.5;
    context.strokeStyle = "#ffc18a";
    context.globalAlpha = enemy.minesDropped ? .35 : .66;
    context.setLineDash([4, 7]);
    context.beginPath(); context.moveTo(x, y); context.lineTo(x - length, y); context.stroke();
    context.setLineDash([]);
    for (let n = 1; n <= 3; n++) {
      const mark = x - length * n / 3;
      context.beginPath(); context.moveTo(mark + 5, y - 5); context.lineTo(mark, y);
      context.lineTo(mark + 5, y + 5); context.stroke();
    }
    context.restore();
  }
  for (const mine of eliteDirector.mines) {
    const p = clamp(mine.age / eliteRules.mineWarning, 0, 1);
    const radius = mine.blastRadius;
    context.save();
    context.translate(mine.x, mine.y);
    context.fillStyle = p > .65 ? "#ec7d362f" : "#ec7d3615";
    context.strokeStyle = "#ffb568";
    context.lineWidth = 1.4;
    context.beginPath(); context.arc(0, 0, radius, 0, Math.PI * 2); context.fill();
    context.setLineDash([5, 6]); context.globalAlpha = .43; context.stroke(); context.setLineDash([]);
    context.globalAlpha = .9;
    context.beginPath(); context.arc(0, 0, radius, -Math.PI / 2, (p * 2 - .5) * Math.PI); context.stroke();
    context.rotate(.78);
    const gradient = context.createLinearGradient(-10, -10, 10, 10);
    gradient.addColorStop(0, "#657b8c"); gradient.addColorStop(.48, "#2c4555"); gradient.addColorStop(1, "#0d1521");
    context.fillStyle = gradient;
    context.beginPath(); context.roundRect(-8, -8, 16, 16, 3); context.fill(); context.stroke();
    context.fillStyle = mine.hitFlash > 0 ? "#dcf7ff" : p > .76 ? "#fff4ca" : "#ffb568";
    context.fillRect(-2, -2, 4, 4);
    context.restore();
    if (typeof drawFlightLattice === "function")
      drawFlightLattice(context, mine.x, mine.y, radius * (.69 + p * .17), radius * (.69 + p * .17),
        "#ffc389", p * 2.8, .24 + p * .32, .22);
  }
}

function drawEliteEscortShield(enemy) {
  const shield = enemy.escortShield;
  if (!shield || shield.hp <= 0 || !enemies.includes(shield.guard)) return;
  const hue = shield.hp < shield.maxHp * .36 ? "#bcecc8" : "#65e7d2";
  context.save();
  context.fillStyle = "#59e8ce16";
  context.strokeStyle = hue;
  context.globalAlpha = .58 + (shield.flash > 0 ? .35 : 0);
  context.lineWidth = 1.6;
  context.beginPath(); context.ellipse(enemy.x, enemy.y, enemy.width * .62, enemy.height * .74, 0, 0, Math.PI * 2);
  context.fill(); context.stroke();
  if (!quietCombatMotion()) {
    context.globalAlpha = .24;
    context.setLineDash([3, 9]);
    context.beginPath(); context.moveTo(shield.guard.x, shield.guard.y);
    context.lineTo(enemy.x, enemy.y); context.stroke();
  }
  context.restore();
  if (typeof drawFlightLattice === "function")
    drawFlightLattice(context, enemy.x, enemy.y, enemy.width * .62, enemy.height * .74, hue, enemy.age, .44, .4);
}

function drawEliteHull(enemy) {
  const { kind, width, height } = enemy;
  if (!eliteKinds.includes(kind) && kind !== "splitling") return false;
  const x = enemy.x, y = enemy.y;
  const palette = eliteCopy[kind]?.[4] ?? "#e3c4ff";
  const poseAge = quietCombatMotion() ? 0 : enemy.age;
  if (kind === "minelayer") {
    drawSpaceProp(context, "transport", { x, y, width: width * 1.22, height: height * 1.45,
      pitch: -.18 + Math.sin(poseAge * 1.9) * .095, yaw: -.34, roll: Math.sin(poseAge * 1.7) * .06,
      flash: Math.min(.8, enemy.hitFlash * 6), alpha: 1 });
  } else if (kind === "splitter") {
    // Two interlocked body halves separate under load as the membrane thins.
    const separation = height * (.10 + .085 * Math.sin(poseAge * 3.4));
    for (const side of [-1, 1]) drawEnemyHull({ ...enemy, kind: "armored", y: y + separation * side, height: height * .74 });
  } else drawEnemyHull({ ...enemy, kind: kind === "shield-guard" ? "gunner" : "scout" });
  context.save();
  context.translate(x, y);
  context.strokeStyle = palette;
  context.fillStyle = palette;
  context.lineWidth = 2;
  if (kind === "minelayer") {
    for (let index = 0; index < eliteRules.capacity - (enemy.minesDropped ?? 0); index++)
      context.fillRect(width * (.04 + index * .064), -height * .30, width * .038, height * .12);
  } else if (kind === "shield-guard") {
    context.globalAlpha = .82;
    for (const side of [-1, 1]) {
      context.beginPath(); context.ellipse(width * .12, 0, width * .39, height * .57, 0,
        side === 1 ? .22 : Math.PI + .22, side === 1 ? Math.PI - .22 : Math.PI * 2 - .22);
      context.stroke();
    }
  } else {
    const scale = kind === "splitter" ? .15 : .11;
    for (const side of [-1, 1]) {
      context.beginPath(); context.moveTo(-width * .06, side * height * scale);
      context.lineTo(width * .18, side * height * scale); context.stroke();
    }
    if (kind === "splitter" && enemy.hp < .50) {
      // Two arrows preview the two escape angles while the membrane is still intact.
      context.globalAlpha = .66;
      for (const side of [-1, 1]) {
        context.beginPath(); context.moveTo(-width * .43, side * height * .22);
        context.lineTo(-width * .62, side * height * .60);
        context.lineTo(-width * .59, side * height * .33); context.stroke();
      }
    }
  }
  context.restore();
  drawEliteEscortShield(enemy);
  return true;
}
