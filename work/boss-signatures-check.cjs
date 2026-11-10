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
    function positionBoss(type, enraged = false, pattern = 0) {
      clearAlienThreats();
      boss = { x: viewport.width * .84, y: viewport.height * .48, width: 252, height: 190,
        color: bossTypes[type].color, type, enraged, attackIndex: pattern - 1 };
      prepareAlienAttack(boss);
      return boss;
    }
    function playSignature(type, pattern, enraged) {
      positionBoss(type, enraged, pattern);
      let peak = 0;
      const kinds = new Set(bossHazards.map(hazard => hazard.kind));
      for (let time = 0; time <= 7; time += 1 / 60) {
        const dt = 1 / 60;
        if (time >= boss.telegraphDuration) {
          boss.phase = "attack";
          boss.phaseTime = time - boss.telegraphDuration;
          runAlienAttack(boss);
        }
        updateBossProjectiles(dt);
        for (const hazard of bossHazards) kinds.add(hazard.kind);
        peak = Math.max(peak, bossProjectiles.length);
      }
      return { peak, kinds: [...kinds] };
    }
  `);
  for (const file of ["bosses.js", "alien-attacks.js"]) {
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
