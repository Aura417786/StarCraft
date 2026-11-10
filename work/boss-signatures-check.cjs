"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function signatureArena() {
  const sandbox = vm.createContext({});
  const run = code => vm.runInContext(code, sandbox);
  run(`
    const viewport = { width: 1280, height: 720 };
    const flightBounds = { left: 62, right: 1062, top: 86, bottom: 633 };
    const player = { x: 310, y: 348, width: 180, height: 120, speed: 300 };
    const tr = (zh, en) => en;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const gameAudio = { bossAttack() {} };
    const addCombatShake = () => {};
    const consumeEvolutionShieldProjectile = () => false;
    const document = { querySelector: () => ({ addEventListener() {} }) };
    function positionBoss(type, enraged = false, pattern = 0, pressure = false) {
      clearAlienThreats();
      boss = { x: viewport.width * .84, y: viewport.height * .48, width: 252, height: 190,
        color: bossTypes[type].color, type, enraged, pressureCycle: 0, attackIndex: pattern - 1 };
      prepareAlienAttack(boss, pressure);
      return boss;
    }
    function playSignature(type, pattern, enraged, pressure = false) {
      positionBoss(type, enraged, pattern, pressure);
      let peak = 0;
      let threatensStationary = false;
      let readable = true;
      const kinds = new Set(bossHazards.map(hazard => hazard.kind));
      for (let time = 0; time <= 9; time += 1 / 60) {
        const dt = 1 / 60;
        if (time >= boss.telegraphDuration) {
          boss.phase = "attack";
          boss.phaseTime = time - boss.telegraphDuration;
          runAlienAttack(boss);
        }
        updateBossProjectiles(dt);
        for (const hazard of bossHazards) {
          kinds.add(hazard.kind);
          readable &&= hazard.warning >= (hazard.kind === "tide" ? 1.6 : 1.4);
          threatensStationary ||= alienHazardHitsPlayer(hazard);
        }
        threatensStationary ||= bossProjectiles.some(bossShotHitsPlayer);
        peak = Math.max(peak, bossProjectiles.length);
      }
      return { peak, kinds: [...kinds], threatensStationary, readable, name: boss.attackLabel[1] };
    }
  `);
  for (const file of ["bosses.js", "hostile-projectiles.js", "fire-control.js", "alien-attacks.js", "alien-pressure.js", "boss-finales.js"]) {
    run(fs.readFileSync(path.join(__dirname, "..", file), "utf8"));
  }
  // The production HUD writes to DOM. These checks only exercise the simulation.
  run("setBossMessage = () => {}");
  return run;
}

test("all eleven identities can execute every regular and enraged attack timeline", () => {
  const run = signatureArena();
  for (let type = 0; type < 11; type++) {
    const bodyKinds = new Set();
    for (const enraged of [false, true]) {
      for (let pattern = 0; pattern < 3; pattern++) {
        const result = run(`playSignature(${type}, ${pattern}, ${enraged})`);
        assert.ok(result.kinds.length || result.peak > 0, `type ${type} attack ${pattern}`);
        assert.ok(result.peak <= 240);
        result.kinds.forEach(kind => bodyKinds.add(kind));
        assert.equal(run("bossHazards.length"), 0);
      }
    }
    assert.ok(bodyKinds.size >= 2, `type ${type} distinct threat shapes`);
  }
});

test("each new attack has a teaching window and a single concise action", () => {
  const run = signatureArena();
  const result = run(`(() => {
    const warnings = [];
    for (let type = 0; type < bossTypes.length; type++) {
      for (const pressure of [false, true]) {
        for (const pattern of pressure ? [0] : [0, 1, 2]) {
          const target = positionBoss(type, pressure, pattern, pressure);
          const first = target.telegraphDuration;
          const [name, enName, hint, enHint] = target.attackLabel;
          const wide = pressure ? widePressureMaterials.has(alienPressurePlans[type].material)
            : wideAlienPatterns.has(target.alienAttack);
          target.attackIndex = pattern - 1;
          target.pressureCycle = 0;
          prepareAlienAttack(target, pressure);
          warnings.push({ first, repeat: target.telegraphDuration, hint, enHint, wide });
        }
      }
    }
    return { warnings, finales: bossFinaleStages.map(stage => stage.hint) };
  })()`);
  assert.equal(result.warnings.length, 44);
  for (const { first, repeat, hint, enHint, wide } of result.warnings) {
    assert.ok(Math.abs(first - repeat - .4) < 1e-8);
    assert.ok(repeat >= (wide ? 1.6 : 1.4) && first <= 2.2);
    assert.ok(hint.length >= 8 && hint.length <= 14 && enHint.length < 52, hint);
  }
  for (const [hint, enHint] of result.finales) {
    assert.ok(hint.length >= 8 && hint.length <= 14 && enHint.length < 52, hint);
  }
});

test("the Broodmother's wall travels across the field and the painted cyan trough is safe", () => {
  const run = signatureArena();
  const result = run(`(() => {
    positionBoss(0, false, 1);
    const wave = bossHazards.find(hazard => hazard.kind === "tide");
    const first = alienTideX(wave, 200, 0);
    const last = alienTideX(wave, 200, 1);
    const warningSafe = !alienHazardHitsPlayer(wave);
    wave.age = wave.warning + wave.duration * .47;
    player.y = alienTideGap(wave, .47);
    player.x = alienTideX(wave, player.y, .47);
    const troughSafe = !alienHazardHitsPlayer(wave);
    player.y -= wave.gapSize * .78;
    player.x = alienTideX(wave, player.y, .47);
    const crestHits = alienHazardHitsPlayer(wave);
    player.x += wave.thickness * 2;
    return { first, last, warningSafe, troughSafe, crestHits, behindSafe: !alienHazardHitsPlayer(wave) };
  })()`);
  assert.ok(result.first > 1280 && result.last < 0);
  assert.ok(result.warningSafe && result.troughSafe && result.crestHits && result.behindSafe);
});

test("a compact arena leaves a dodge at the edge and no spray in the marked trough", () => {
  const run = signatureArena();
  const result = run(`(() => {
    Object.assign(viewport, {width:640,height:450});
    Object.assign(flightBounds, {left:44,right:620,top:225,bottom:335});
    Object.assign(player, {x:80,y:227,width:95,height:56});
    positionBoss(0, false, 1);
    const wave = bossHazards.find(hazard => hazard.kind === "tide");
    wave.age = wave.warning + wave.duration * .47;
    player.x = alienTideX(wave, player.y, .47);
    const crestHits = alienHazardHitsPlayer(wave);
    const trough = alienTideGap(wave, .47);
    player.y = trough;
    const troughSafe = !alienHazardHitsPlayer(wave);
    addBossProjectile(90, trough, -100, 0);
    addBossProjectile(90, 80, -100, 0);
    updateBossProjectiles(1 / 60);
    return { crestHits, troughSafe, remaining: bossProjectiles.map(shot => shot.y) };
  })()`);
  assert.ok(result.crestHits && result.troughSafe);
  assert.deepEqual([...result.remaining], [80]);
});

test("an active vortex pulls and damages only at its eye, with real safe space outside the field", () => {
  const run = signatureArena();
  const result = run(`(() => {
    positionBoss(0, false, 2);
    const vortex = bossHazards.find(hazard => hazard.kind === "vortex");
    player.x = vortex.x + vortex.radius * .67;
    player.y = vortex.y;
    const idle = alienCurrentVector();
    vortex.age = vortex.warning + .2;
    const pull = alienCurrentVector();
    const rimSafe = !alienHazardHitsPlayer(vortex);
    player.x = vortex.x;
    const eyeHits = alienHazardHitsPlayer(vortex);
    player.x += vortex.radius + 25;
    const outside = alienCurrentVector();
    return { idle, pull, rimSafe, eyeHits, outside };
  })()`);
  assert.equal(result.idle.x, 0);
  assert.ok(result.pull.x < 0 && result.pull.y < 0);
  assert.ok(result.rimSafe && result.eyeHits);
  assert.equal(result.outside.x, 0);
  assert.equal(result.outside.y, 0);
});

test("diagonal filaments share geometry with their real hit and remap with the playfield", () => {
  const run = signatureArena();
  const result = run(`(() => {
    positionBoss(3, false, 0);
    const silk = bossHazards.find(hazard => hazard.kind === "filament");
    const oldOrigin = silk.originX;
    const warningSafe = !alienHazardHitsPlayer(silk);
    silk.age = silk.warning + .08;
    const before = alienHazardHitsPlayer(silk);
    player.y += 99;
    const movedSafe = !alienHazardHitsPlayer(silk);
    const mapped = resizeAlienSignatureHazard(silk, .65, .7, y => y * .7 + 12);
    return { oldOrigin, origin: silk.originX, mapped, before, movedSafe, warningSafe };
  })()`);
  assert.ok(result.mapped && result.before && result.movedSafe && result.warningSafe);
  assert.ok(Math.abs(result.origin / result.oldOrigin - .65) < 1e-9);
});


test("eleven rupture combos have distinct labels, sufficient tells, and real stationary damage", () => {
  const run = signatureArena();
  const labels = new Set();
  for (let type = 0; type < 11; type++) {
    const result = run(`playSignature(${type}, 0, true, true)`);
    assert.equal(run("boss.alienAttack"), "pressure");
    assert.ok(result.readable, `type ${type} warns before collision`);
    assert.ok(result.threatensStationary, `type ${type} threatens a pilot that stays still`);
    assert.ok(result.kinds.length >= 2, `type ${type} layers distinguishable hazard geometry`);
    assert.equal(run("bossHazards.length"), 0);
    labels.add(result.name);
  }
  assert.equal(labels.size, 11);
});

test("the reverse tide leaves the same reachable escape corridor and remaps it after resizing", () => {
  const run = signatureArena();
  const result = run(`(() => {
    Object.assign(viewport, { width: 640, height: 450 });
    Object.assign(flightBounds, { left: 44, right: 620, top: 225, bottom: 335 });
    Object.assign(player, { x: 80, y: 227, width: 95, height: 56 });
    positionBoss(0, true, 0, true);
    const first = bossHazards[0];
    boss.phase = "attack";
    boss.phaseTime = 1.27;
    runAlienAttack(boss);
    const last = bossHazards.find(hazard => hazard.kind === "tide" && hazard.direction === 1);
    last.age = last.warning + last.duration * .47;
    player.y = alienTideGap(last, .47);
    player.x = alienTideX(last, player.y, .47);
    return {
      firstDirection: first.direction, lastDirection: last.direction, centerTravel: Math.abs(last.gapY - first.gapY),
      safe: !alienHazardHitsPlayer(last), warning: last.warning,
      reach: player.speed * first.warning,
    };
  })()`);
  assert.equal(result.firstDirection, -1);
  assert.equal(result.lastDirection, 1);
  assert.ok(result.safe && result.warning >= 1.6 && result.centerTravel <= result.reach);
});
