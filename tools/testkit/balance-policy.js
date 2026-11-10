"use strict";

// Loaded in the benchmark browser only. Movement goes through the regular
// pressed-key input set and attacks go through the game's input handlers.
const balancePolicyVersion = "telegraph-pilot/4";
const balancePolicyDirections = [
  [0, 0], [1, 0], [-1, 0], [0, -1], [0, 1],
  [1, -1], [1, 1], [-1, -1], [-1, 1],
];

function balancePress(code, type = "keydown") {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
}

function balanceTap(code) {
  balancePress(code);
  balancePress(code, "keyup");
}

function balanceMove(horizontal, vertical) {
  for (const key of movementKeys) pressedKeys.delete(key);
  if (horizontal) pressedKeys.add(horizontal > 0 ? "ArrowRight" : "ArrowLeft");
  if (vertical) pressedKeys.add(vertical > 0 ? "ArrowDown" : "ArrowUp");
}

function balanceAimTarget() {
  if (!boss) {
    const ahead = target => target.x > muzzlePosition().x && target.x < viewport.width;
    const orb = powerups.filter(ahead).sort((a, b) =>
      Math.abs(player.y - a.y) - Math.abs(player.y - b.y) + (a.x - b.x) * .25)[0];
    if (orb) return orb;
    return enemies.filter(ahead).sort((a, b) =>
      (a.x - b.x) * .28 + (Math.abs(a.y - player.y) - Math.abs(b.y - player.y)) * .95)[0];
  }
  if (!boss.finale) return boss;
  const finale = boss.finale;
  if (finale.gate && !finale.gate.cut) return { ...finale.gate, cross: true };
  const node = finale.mode === "synapse" || finale.mode === "mirror"
    ? finale.nodes[finale.activeNode] : finale.nodes.find(candidate => candidate.hp > 0);
  return node?.hp > 0 ? finaleNodeGeometry(boss, node) : finaleCoreGeometry(boss);
}

function balanceProjectiles() {
  const limitX = player.speed * .65 + player.width;
  const limitY = player.speed * .65 + player.height;
  return [...bossProjectiles, ...enemyProjectiles].filter(shot =>
    Math.abs(player.x - shot.x) < limitX + Math.abs(shot.vx) * .65
    && Math.abs(player.y - shot.y) < limitY + Math.abs(shot.vy) * .65);
}

function balanceHazardRisk(x, y, horizon, shots) {
  let risk = 0;
  const position = [player.x, player.y, player.previousX, player.previousY];
  player.x = player.previousX = x;
  player.y = player.previousY = y;
  try {
    for (const hazard of bossHazards) {
      const age = hazard.age;
      const projected = age + horizon;
      if (hazard.hitPlayer || projected >= hazard.warning + hazard.duration) continue;
      hazard.age = projected;
      try { if (alienHazardHitsPlayer(hazard)) risk += 115; }
      finally { hazard.age = age; }
    }
    if (boss?.finale) {
      const finale = boss.finale;
      const hazards = finale.hazards;
      finale.hazards = hazards.flatMap(hazard => {
        const age = hazard.age + horizon;
        if (age < hazard.warning || age >= hazard.warning + hazard.duration) return [];
        return [{ ...hazard, age, previousAge: Math.max(hazard.warning, age - 1 / 60) }];
      });
      try { if (bossFinaleHitsPlayer(boss)) risk += 140; }
      finally { finale.hazards = hazards; }
    }
  } finally {
    [player.x, player.y, player.previousX, player.previousY] = position;
  }
  const hull = player.height * .16;
  for (const shot of shots) {
    const radius = (shot.radius ?? 5) * (shot.glyph === "thread" ? 1.65 : 1);
    const wave = shot.wave
      ? (Math.sin((shot.age + horizon) * 5 + shot.wavePhase) - Math.sin(shot.age * 5 + shot.wavePhase)) * shot.wave
      : 0;
    const distance = Math.hypot(x - (shot.x + shot.vx * horizon), y - (shot.y + shot.vy * horizon + wave));
    if (distance < radius + hull + 10) risk += 55;
    else if (distance < radius + hull + 30) risk += 7;
  }
  for (const enemy of enemies) {
    const stopped = enemy.kind === "gunner" && enemy.gunPhase !== "entry" && enemy.gunPhase !== "retreat";
    const nextX = stopped ? enemy.x : enemy.x - (enemy.speed || 0) * horizon;
    const nextY = enemy.kind === "scout"
      ? (enemy.baseY ?? enemy.y) + Math.sin((enemy.age + horizon) * 2.35) * (enemy.waveAmplitude || 0)
      : enemy.y;
    const dx = (x - nextX) / (player.width * .37 + enemy.width * .42 + 6);
    const dy = (y - nextY) / (player.height * .30 + enemy.height * .35 + 6);
    if (dx * dx + dy * dy < 1) risk += 110;
  }
  if (typeof eliteDirector === "object") {
    for (const mine of eliteDirector.mines) {
      const countdown = eliteRules.mineWarning - mine.age;
      if (horizon + .09 < countdown || horizon - .08 > countdown) continue;
      if (Math.hypot(x - mine.x + 16 * horizon, y - mine.y) < mine.blastRadius + hull + 5) risk += 105;
    }
  }
  return risk;
}

function balanceChooseAction(controls, mode) {
  if (evolution.pending) {
    const options = evolutionChoiceOptions().filter(kind => !evolutionCardDetails(kind).disabled);
    const priority = controls.build === "falcon" ? ["blast", "pierce", "aegis"]
      : controls.build === "aegis" ? ["aegis", "pierce", "blast"]
      : ["pierce", "blast", "aegis"];
    const choice = [...priority, "refit-heal", "refit-shield", ...options].find(kind => options.includes(kind));
    if (choice) chooseEvolution(choice);
  }
  if (!isBattleActive() || mode === "stationary") return;
  const target = balanceAimTarget();
  const preferredStance = boss && (sortieFighter !== "yellow"
    || (typeof fighterCombat === "object" && (fighterCombat.capacitor < .999 || fighterCombat.field)))
    ? "focus" : "spread";
  if (firingStyle.mode !== preferredStance && !controls.shiftHeld) balanceTap("ShiftLeft");
  const right = bossPlayerRight();
  const horizontalAnchor = { red: .24, blue: .15, yellow: .52 }[sortieFighter];
  let aimX = clamp(target?.cross ? target.x : viewport.width * horizontalAnchor, flightBounds.left, right);
  const middleY = (flightBounds.top + flightBounds.bottom) / 2;
  let aimY = clamp(target?.y ?? middleY, flightBounds.top, flightBounds.bottom);
  const visibleTide = bossHazards.find(hazard => hazard.kind === "tide" && hazard.material === "water"
    && hazard.age + .45 > hazard.warning && hazard.age < hazard.warning + hazard.duration * .8);
  const finaleGap = boss?.finale?.hazards.find(hazard => hazard.gap && hazard.age + .50 > hazard.warning
    && hazard.age < hazard.warning + hazard.duration * .8);
  if (finaleGap) aimY = finaleGap.gap.center;
  else if (visibleTide) aimY = alienTideGap(visibleTide, signatureProgress(visibleTide));
  // The well telegraph locks a position, then pulls inward. Escape laterally
  // during its warning before recommitting to the exposed core.
  const well = boss?.finale?.hazards.find(hazard => hazard.type === "well")
    ?? bossHazards.find(hazard => hazard.kind === "vortex" && hazard.material === "void" && hazard.strength);
  if (well) {
    const clearance = (well.type === "well" ? well.radius * 1.5 : well.radius * 1.13) + player.width * .18;
    const edge = well.x - flightBounds.left >= right - well.x ? -1 : 1;
    aimX = clamp(well.x + edge * clearance, flightBounds.left, right);
    if (Math.abs(aimX - well.x) < clearance * .65) {
      aimY = clamp(well.y + (well.y > middleY ? -1 : 1) * clearance, flightBounds.top, flightBounds.bottom);
    }
  }
  const current = alienCurrentVector();
  if (typeof gravityPlayerVector === "function") {
    const gravity = gravityPlayerVector();
    current.x += gravity.x + journeyCatapultVector();
    current.y += gravity.y;
  }
  const speed = player.speed * alienMovementScale() * (ultimate.phase === "charging" ? .65 : 1)
    * (typeof fighterMovementScale === "function" ? fighterMovementScale() : 1);
  const nearby = balanceProjectiles();
  const horizons = [.017, .033, .052, .084, .125, .17, .23, .31, .41, .55, .68];
  const moveX = (vx, time) => clamp(player.x + (vx * speed + current.x) * time, flightBounds.left, right);
  const moveY = (vy, time) => clamp(player.y + (vy * speed + current.y) * time, flightBounds.top, flightBounds.bottom);
  let best = null;
  const trace = controls.trace && [];
  for (const [horizontal, vertical] of balancePolicyDirections) {
    const length = Math.hypot(horizontal, vertical) || 1;
    const vx = horizontal / length, vy = vertical / length;
    const danger = horizons.reduce((total, time) => total
      + balanceHazardRisk(moveX(vx, time), moveY(vy, time), time, nearby) * (1.2 - time) / 1.5, 0);
    const aim = Math.abs(aimY - moveY(vy, .15)) * .20
      + Math.abs(aimX - moveX(vx, .15)) * (target?.cross || well ? .30 : .062);
    const cost = danger * (shieldIsActive() ? .20 : 1) + aim + .8 * length;
    trace?.push([horizontal, vertical, Math.round(cost * 100) / 100]);
    if (!best || cost < best.cost) best = { horizontal, vertical, vx, vy, cost };
  }
  if (trace && controls.trace.length < 240) controls.trace.push({
    at: Math.round(battleTime * 1000) / 1000, x: Math.round(player.x), y: Math.round(player.y),
    lives: player.lives, bossHp: boss?.hp, alternatives: trace, direction: [best.horizontal, best.vertical],
    rngDraws: window.__balanceClock?.randomDraws(),
  });
  balanceMove(best.horizontal, best.vertical);
  const aligned = Math.abs((target?.y ?? middleY) - player.y) < Math.max(24, player.height * .35);
  const wantsLance = evolution.pierce >= 3 && evolutionWeapons.lanceCooldown <= 0 && (boss?.phase === "recover" || boss?.finale)
    && aligned && best.cost < 24;
  if (controls.shiftHeld && (!wantsLance || battleTime - controls.shiftSince > .74)) {
    balancePress("ShiftLeft", "keyup");
    controls.shiftHeld = false;
    controls.nextLance = battleTime + .4;
  } else if (wantsLance && !controls.shiftHeld && battleTime >= controls.nextLance) {
    balancePress("ShiftLeft");
    controls.shiftHeld = true;
    controls.shiftSince = battleTime;
  }
  const imminent = [.017, .045, .075, .105, .16].some(time =>
    balanceHazardRisk(moveX(best.vx, time), moveY(best.vy, time), time, nearby) > 45);
  if (evolution.blast >= 2 && boss && battleTime >= controls.nextFalcon) {
    balanceTap("KeyF");
    controls.nextFalcon = battleTime + (imminent && evolution.blast >= 3 ? .12 : 6);
  }
  if (shield.charges > 0 && !shieldIsActive() && bossHitGrace <= .02 && imminent) {
    balanceTap("KeyV");
    controls.shields++;
  }
  if (ultimate.charges > 0 && ultimate.phase === "idle" && boss && !target?.cross
    && aligned && best.cost < 26) {
    balanceTap("Space");
    controls.specials++;
  }
}
