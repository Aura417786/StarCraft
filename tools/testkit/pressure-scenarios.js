"use strict";

// This file is injected only by the diagnostic harness. Production damage,
// scheduler, collision and shield functions remain in use throughout.
function runPressureFight(input) {
  const originalSpawn = spawnBoss, originalUpdate = updateBossEncounter;
  const originalStep = advanceCombatStep, originalHit = applyBossHit;
  let target, samples = 0, safeSamples = 0, shieldSamples = 0;
  let peak = 0, backgroundPeak = 0;
  let damageableSeconds = 0, lastPrimaryHit = -Infinity;
  const outputWindows = { stationary: [], defenseFree: [] };
  const open = { stationary: null, defenseFree: null };
  const closeWindow = kind => {
    const window = open[kind];
    if (window) outputWindows[kind].push({ ...window, duration: balanceRound(window.end - window.start),
      counted: window.end - window.start >= .5 - 1e-6 });
    open[kind] = null;
  };
  const sampleWindow = (kind, eligible, from, to) => {
    if (!eligible) return closeWindow(kind);
    if (!open[kind]) open[kind] = { start: from, end: to };
    else open[kind].end = to;
  };
  applyBossHit = function (shot, current = boss) {
    const hp = current?.hp;
    const result = originalHit(shot, current);
    if (current === target && current?.hp < hp && !shot.auxiliary
      && !["ultimate", "blast"].includes(shot.source)) lastPrimaryHit = battleTime;
    return result;
  };
  advanceCombatStep = function (seconds) {
    const from = battleTime;
    const result = originalStep(seconds);
    const dt = battleTime - from;
    if (dt <= 0) return result;
    const damageable = boss === target && boss && bossCanTakeDamage(boss);
    if (damageable) damageableSeconds += dt;
    const output = damageable && !boss.pressureArmor && !shieldIsActive() && bossHitGrace <= 0
      && battleTime - lastPrimaryHit <= Math.max(.3, effectiveShotInterval() * 1.5);
    const moving = [...movementKeys].some(code => pressedKeys.has(code));
    sampleWindow("defenseFree", output, from, battleTime);
    sampleWindow("stationary", output && !moving, from, battleTime);
    return result;
  };
  spawnBoss = function (...args) {
    const result = originalSpawn(...args);
    target = boss;
    return result;
  };
  updateBossEncounter = function (seconds) {
    const result = originalUpdate(seconds);
    if (boss === target && boss && bossCanTakeDamage(boss)) {
      samples++;
      if (boss.pressureArmor) shieldSamples++;
      if (!boss.pressureArmor && balanceHazardRisk(player.x, player.y, .35, balanceProjectiles()) === 0) safeSamples++;
      peak = Math.max(peak, bossProjectiles.length + enemyProjectiles.length);
      backgroundPeak = Math.max(backgroundPeak, bossProjectiles.filter(shot => shot.backgroundPressure).length);
    }
    return result;
  };
  let fight;
  try { fight = runBossScalingFixture(input); }
  finally {
    spawnBoss = originalSpawn; updateBossEncounter = originalUpdate;
    advanceCombatStep = originalStep; applyBossHit = originalHit;
    closeWindow("stationary"); closeWindow("defenseFree");
  }
  const continuousOutput = { damageableSeconds: balanceRound(damageableSeconds), minimumWindowSeconds: .5,
    definition: "Recorded real combat intervals with primary shots actually reducing boss HP within 1.5 firing periods (minimum 0.3s), boss damageable and without pressure armor, and player without shield or hit grace. Count only uninterrupted intervals of >=0.5s. Stationary additionally requires no movement key. Defensive-free allows movement. Neither estimates all possible safe trajectories; movement targeting can lower stationary scores. Baseline must use this identical sampler.",
    windows: outputWindows };
  for (const kind of ["stationary", "defenseFree"]) {
    const seconds = outputWindows[kind].filter(window => window.counted).reduce((sum, window) => sum + window.end - window.start, 0);
    continuousOutput[kind] = { seconds: balanceRound(seconds), fraction: damageableSeconds ? seconds / damageableSeconds : null };
  }
  return { ...fight, pressure: {
    samples, safeOutputFraction: samples ? safeSamples / samples : null,
    armorFraction: samples ? shieldSamples / samples : null, hostilePeak: peak, backgroundPeak,
    events: target?.pressureLog ?? [], combos: target?.comboLog ?? [], continuousOutput,
    safeOutputDefinition: "Fraction of damageable fixed steps with no pressure armor and zero existing pilot risk at the current position 0.35 seconds ahead. Uses the same pilot risk heuristic, not a proof of all future trajectories.",
  } };
}

function setupPressureDiagnostic(type, noShield = false, activeShield = 0) {
  balanceStart({ label: "pressure-contract", seed: 4225, bossType: type, fighter: "red",
    difficulty: "veteran", mode: "campaign", policy: "pilot", build: "stock", fixture: "timing" });
  boss.phase = "recover";
  boss.phaseTime = .8;
  boss.pressureAttackCount = 6;
  resetBossPresentation();
  bossHitGrace = 0;
  sortieStats.rules.noShield = noShield;
  shield.remaining = shield.charges = shield.energy = 0;
  shield.remaining = activeShield;
  bullets.length = bossProjectiles.length = bossHazards.length = 0;
  shotCooldown = Infinity;
  prepareAlienAttack(boss, true);
  const hazard = bossHazards.find(item => item.kind === "pressureSeal");
  if (!hazard || !boss.pressureState) throw new Error("Pressure scheduler did not create its seal: " + JSON.stringify({
    type, phase: boss.phase, attack: boss.alienAttack, count: boss.pressureAttackCount,
    sequence: boss.pressureSequence, state: boss.pressureState, hazards: bossHazards.map(h => h.kind) }));
  return hazard;
}

function runPressureContracts() {
  const coverage = [];
  for (let type = 0; type < 10; type++) {
    const hazard = setupPressureDiagnostic(type);
    const start = { charges: shield.charges, warning: hazard.warning, duration: hazard.duration };
    hazard.age = hazard.warning + .01;
    const points = [];
    for (const fx of [.1, .5, .9]) for (const fy of [.1, .5, .9]) {
      player.x = player.previousX = flightBounds.left + (bossPlayerRight() - flightBounds.left) * fx;
      player.y = player.previousY = flightBounds.top + (flightBounds.bottom - flightBounds.top) * fy;
      points.push({ fx, fy, hit: alienHazardHitsPlayer(hazard) });
    }
    bossProjectiles.length = 0;
    const livesBefore = player.lives;
    updateBossDamage();
    const damage = livesBefore - player.lives;
    const guardHazard = setupPressureDiagnostic(type);
    requestShield();
    guardHazard.age = guardHazard.warning + .01;
    const guardBefore = player.lives;
    updateBossDamage();
    coverage.push({ boss: type + 1, ...start, points, damage, guardedDamage: guardBefore - player.lives });
  }
  const fallback = setupPressureDiagnostic(0, true);
  fallback.age = fallback.warning + .01;
  player.x = player.previousX = flightBounds.left + 150;
  player.y = player.previousY = boss.pressureState.gapY;
  const safeGap = !alienHazardHitsPlayer(fallback);
  player.y = player.previousY = flightBounds.top + 5;
  const outsideGap = alienHazardHitsPlayer(fallback);
  const noShield = { safeGap, outsideGap, charges: shield.charges, fullSeal: boss.pressureState.fullSeal };
  setupPressureDiagnostic(0, false, .1);
  const expiringShieldSupplied = shield.charges > 0;
  setupPressureDiagnostic(0, false, 4);
  const sufficientShieldNotRefilled = shield.charges === 0;
  setupPressureDiagnostic(0);
  const armoredBefore = boss.hp;
  applyBossHit({ damage: .01, noEnergy: true });
  const armoredDamage = armoredBefore - boss.hp;
  setupPressureDiagnostic(0);
  boss.pressureArmor = false;
  const normalBefore = boss.hp;
  applyBossHit({ damage: .01, noEnergy: true });
  const armorRatio = armoredDamage / (normalBefore - boss.hp);
  // Background lattice follows ordinary update/collision timing. Probe its
  // advertised corridor after both updates rather than only at spawn.
  setupPressureDiagnostic(0);
  let corridorViolations = 0, backgroundPeak = 0;
  for (let frame = 0; frame < 900; frame++) {
    boss.age += 1 / 60;
    updateBossPressure(boss, 1 / 60);
    updateBossProjectiles(1 / 60);
    const shots = bossProjectiles.filter(shot => shot.backgroundPressure);
    backgroundPeak = Math.max(backgroundPeak, shots.length);
    for (const shot of shots) if (Math.abs(shot.y - boss.pressureGapY) < boss.pressureGapSize / 2 + shot.radius) corridorViolations++;
  }
  showScreen("menu");
  const cleanup = { boss: boss === null, projectiles: bossProjectiles.length, hazards: bossHazards.length,
    pressureParticles: pressureParticlePool.filter(particle => particle.life > 0).length, pressureTarget: pressureArt.target === null };
  const transitions = [];
  for (const stage of ["rupture", "finale"]) {
    setupPressureDiagnostic(0);
    if (stage === "rupture") beginAlienRupture(boss);
    else beginBossFinale(boss);
    transitions.push({ stage, pressureStateCleared: boss.pressureState === null,
      pressureArmorCleared: !boss.pressureArmor,
      ultimateHazardsCleared: !bossHazards.some(hazard => ["ultimate", "pressureSeal"].includes(hazard.kind)) });
  }
  showScreen("menu");
  return { coverage, noShield, expiringShieldSupplied, sufficientShieldNotRefilled, armorRatio,
    background: { peak: backgroundPeak, corridorViolations }, cleanup, transitions };
}

function runUltimateContracts() {
  if (typeof bossUltimateGeometry !== "function") return { available: false, cases: [] };
  const cases = [];
  for (let type = 0; type < 10; type++) {
    setupPressureDiagnostic(type);
    const hazard = bossHazards.find(h => h.kind === "ultimate");
    if (!hazard) throw new Error(`Boss ${type + 1} lacks actual ultimate collision hazard`);
    const entry = { boss: type + 1, kind: hazard.ultimateKind, warning: hazard.warning, frames: [] };
    for (const fraction of [.1, .5, .9]) {
      hazard.age = hazard.warning + hazard.duration * fraction;
      const shape = bossUltimateGeometry(hazard);
      const points = [];
      for (let x = 0; x <= 20; x++) for (let y = 0; y <= 10; y++) {
        player.x = player.previousX = flightBounds.left + (bossPlayerRight() - flightBounds.left) * x / 20;
        player.y = player.previousY = flightBounds.top + (flightBounds.bottom - flightBounds.top) * y / 10;
        points.push({ x: player.x, y: player.y, hit: alienHazardHitsPlayer(hazard) });
      }
      entry.frames.push({ fraction, shape, points, hitCount: points.filter(point => point.hit).length });
    }
    setupPressureDiagnostic(type, true);
    const fallback = bossHazards.find(h => h.kind === "ultimate");
    const gapChecks = [];
    for (const fraction of [.1, .5, .9]) for (const x of [.1, .5, .9]) {
      fallback.age = fallback.warning + fallback.duration * fraction;
      player.x = player.previousX = flightBounds.left + (bossPlayerRight() - flightBounds.left) * x;
      player.y = player.previousY = fallback.gapY;
      gapChecks.push({ fraction, x, safe: !alienHazardHitsPlayer(fallback) });
    }
    entry.noShieldGap = gapChecks;
    cases.push(entry);
  }
  showScreen("menu");
  return { available: true, cases };
}

function pressureResizeSnapshot() {
  const span = flightBounds.bottom - flightBounds.top;
  const norm = point => ({ x: point.x / viewport.width, y: (point.y - flightBounds.top) / span });
  const hazard = bossHazards.find(h => h.kind === "ultimate");
  return { boss: boss.type, phase: boss.phase, sequence: boss.pressureSequence,
    age: boss.pressureState.age, health: boss.hp, kind: hazard.ultimateKind,
    hazardAge: hazard.age, lock: norm({ x: hazard.lockX, y: hazard.lockY }),
    gapFraction: (hazard.gapY - flightBounds.top) / span,
    nodePositions: hazard.nodes.map(node => ({ ...norm(node), health: node.health })),
    finite: [...bossUltimateGeometry(hazard).rects, ...bossUltimateGeometry(hazard).segments,
      ...bossUltimateGeometry(hazard).circles].every(shape => Object.values(shape).every(Number.isFinite)),
  };
}

function runUltimateNodeContracts() {
  const cases = [];
  for (const type of [3, 5, 7, 9]) for (const weaponKind of ["ordinary", "pierce", "red", "yellow", "blue"]) {
    setupPressureDiagnostic(type);
    const hazard = bossHazards.find(h => h.kind === "ultimate");
    hazard.age = hazard.warning + hazard.duration * .55;
    const node = hazard.nodes[0];
    const countShapes = () => {
      const geometry = bossUltimateGeometry(hazard);
      return geometry.rects.length + geometry.segments.length + geometry.circles.length;
    };
    const beforeShapes = countShapes();
    const initialHealth = node.health;
    let afterFirst, afterRepeat, ordinaryConsumed = null, packets = 0;
    const makePacket = () => {
      cancelUltimate();
      if (weaponKind === "ordinary" || weaponKind === "pierce") {
        bullets.length = 0; shotCooldown = 0;
        updateShooting(0);
        const shot = bullets[0];
        if (!shot) throw new Error("Production shooting did not create the ordinary diagnostic packet");
        shot.x = shot.previousX = node.x;
        shot.y = shot.previousY = node.y;
        if (weaponKind === "pierce") shot.piercesShield = true;
        shotCooldown = Infinity;
        return { shot, resolve: () => updateShooting(0) };
      }
      ultimate.kind = weaponKind;
      fireUltimate();
      const shot = weaponKind === "blue" ? ultimate.shot.missiles[0]
        : weaponKind === "yellow" ? ultimate.shot.waves[0] : ultimate.shot;
      shot.x = shot.previousX = node.x;
      shot.y = shot.previousY = node.y;
      if (weaponKind !== "blue") shot.startX = Math.min(shot.startX, node.x - 20);
      return { shot, resolve: weaponKind === "blue" ? () => resolveIonHit(shot, [], 0) : () => resolveUltimateHits(shot) };
    };
    const first = makePacket();
    first.resolve(); packets++;
    afterFirst = node.health;
    if (weaponKind === "ordinary") ordinaryConsumed = !bullets.includes(first.shot);
    first.resolve();
    afterRepeat = node.health;
    while (node.health > 0 && packets < 20) { const packet = makePacket(); packet.resolve(); packets++; }
    cases.push({ boss: type + 1, weapon: weaponKind, initialHealth, afterFirst, afterRepeat,
      ordinaryConsumed, packets, finalHealth: node.health, beforeShapes, afterShapes: countShapes() });
  }
  setupPressureDiagnostic(7);
  const spore = bossHazards.find(h => h.kind === "ultimate");
  spore.age = spore.warning + spore.duration * .1;
  const circle = bossUltimateGeometry(spore).circles.find(shape => !shape.innerRadius);
  player.x = player.previousX = circle.x;
  player.y = player.previousY = circle.y;
  const solidCircleCenter = alienHazardHitsPlayer(spore);
  showScreen("menu");
  return { cases, solidCircleCenter };
}

function runPressureIdentity() {
  const identities = [];
  for (let type = 0; type < 11; type++) {
    const attacks = [];
    for (const key of bossTypes[type].patterns) {
      balanceStart({ label: "pressure-identity", seed: 4225, bossType: type, fighter: "red",
        difficulty: "veteran", mode: "campaign", policy: "pilot", build: "stock", fixture: "timing" });
      resetBossPresentation();
      boss.phase = "recover";
      boss.phaseTime = .8;
      boss.pressureAttackCount = 0;
      boss.attackIndex = bossTypes[type].patterns.indexOf(key) - 1;
      bossHazards.length = bossProjectiles.length = 0;
      prepareAlienAttack(boss, false);
      const stagedEvents = boss.attackEvents.map(event => event.at);
      // Execute the authored contact functions without substituting their
      // geometry; this is a descriptor probe, not a combat completion claim.
      boss.phase = "attack";
      for (const event of boss.attackEvents) {
        boss.phaseTime = event.at;
        event.fire(boss);
      }
      const hazards = bossHazards.map(hazard => ({ kind: hazard.kind,
        flags: Object.keys(hazard).filter(name => !["color", "material", "sound", "id", "age"].includes(name)
          && typeof hazard[name] === "boolean" && hazard[name]).sort(),
        keys: Object.keys(hazard).filter(name => !["color", "material", "sound", "id", "age"].includes(name)).sort(),
      }));
      const shots = bossProjectiles.map(shot => ({ glyph: shot.glyph,
        homing: !!shot.homingUntil, burst: !!shot.burstAt, wave: !!shot.wave,
        reverse: shot.vx > 0 }));
      attacks.push({ key, quick: boss.quickAttack, stagedEvents, hazards,
        projectiles: shots, motion: boss.attackMotion ?? null });
    }
    // Ignore names, colours, material, scalar speed/health and launch count.
    // Unique sets of collision families and projectile behaviours are required.
    const mechanics = [...new Set(attacks.flatMap(attack => attack.hazards.map(hazard =>
      `hazard:${hazard.kind}:${hazard.flags.join(",")}`)
      .concat(attack.projectiles.map(shot => `shot:${shot.glyph}:${shot.homing}:${shot.burst}:${shot.wave}:${shot.reverse}`))))].sort();
    identities.push({ boss: type + 1, name: bossTypeName(type), attacks, mechanics });
  }
  showScreen("menu");
  return identities;
}

function runComboContracts() {
  if (typeof bossPressureCombos === "undefined") return { available: false, cases: [] };
  const cases = [];
  for (let type = 0; type < 10; type++) for (let index = 0; index < 2; index++) {
    balanceStart({ label: "combo-contract", seed: 4225, bossType: type, fighter: "red",
      difficulty: "veteran", mode: "campaign", policy: "pilot", build: "stock", fixture: "timing" });
    resetBossPresentation();
    boss.phase = "recover";
    boss.phaseTime = .8;
    boss.pressureAttackCount = 0;
    boss.pressureComboIndex = index - 1;
    shotCooldown = Infinity;
    bullets.length = bossProjectiles.length = bossHazards.length = 0;
    prepareAlienAttack(boss, false);
    const record = boss.comboLog.at(-1);
    const snapshot = hazard => Object.fromEntries(Object.entries(hazard).filter(([key, value]) =>
      !["mesh", "texture", "sprite"].includes(key) && typeof value !== "function"));
    const first = bossHazards.filter(hazard => hazard.comboId === record.id && hazard.comboRole === "first");
    const second = bossHazards.filter(hazard => hazard.comboId === record.id && hazard.comboRole === "second");
    const firstSnapshot = first.map(snapshot), secondSnapshot = second.map(snapshot);
    const anchor = record.anchor;
    const linked = second[0];
    let targetMatch;
    if (linked.kind === "filament") {
      const fraction = (anchor.x - linked.originX) / (linked.endX - linked.originX);
      targetMatch = { axis: "line-at-anchor-x", expected: anchor.y,
        actual: linked.originY + (linked.endY - linked.originY) * fraction };
    } else if (linked.kind === "seam") targetMatch = { axis: "x", expected: anchor.x, actual: linked.x };
    else if (linked.kind === "tide") targetMatch = { axis: "gap-y", expected: anchor.y, actual: linked.gapY };
    else if (linked.kind === "beam") targetMatch = { axis: "y", expected: anchor.y, actual: linked.y };
    else targetMatch = { axis: "point", expected: [anchor.x, anchor.y], actual: [linked.x, linked.y] };
    targetMatch.maximumError = Math.max(...[targetMatch.expected].flat().map((expected, i) =>
      Math.abs(expected - [targetMatch.actual].flat()[i])));
    const sample = { boss: type + 1, index, record, first: firstSnapshot, second: secondSnapshot,
      targetMatch, observedSecondOnset: null };
    for (let frame = 0; frame < 240; frame++) {
      window.__balanceClock.tick(1 / 60);
      const active = role => bossHazards.filter(hazard => hazard.comboId === record.id && hazard.comboRole === role
        && hazard.age >= hazard.warning && hazard.age < hazard.warning + hazard.duration);
      const secondActive = active("second");
      if (!secondActive.length) continue;
      sample.observedSecondOnset = { at: battleTime, firstActive: active("first").map(snapshot),
        secondActive: secondActive.map(snapshot), phase: boss?.phase };
      break;
    }
    cases.push(sample);
  }
  showScreen("menu");
  return { available: true, cases };
}
