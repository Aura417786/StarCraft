"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
function arena() {
  const hud = new Map();
  const sound = [];
  const sandbox = vm.createContext({
    document: {
      querySelector(id) {
        if (!hud.has(id)) hud.set(id, { textContent: "", dataset: {}, style: {}, setAttribute() {}, addEventListener() {} });
        return hud.get(id);
      },
      querySelectorAll: () => [],
    },
    gameAudio: { muted: false, chargeUltimate: (...args) => sound.push(["charge", ...args]),
      fireUltimate: (...args) => sound.push(["fire", ...args]), stopUltimate: () => sound.push(["stop"]) },
  });
  const run = code => vm.runInContext(code, sandbox);
  run(`
    const tr = (chinese, english) => english;
    const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
    const viewport = { width: 1280, height: 720 };
    const player = { x: 230, y: 360, width: 180, height: 120 };
    const weapon = { lanes: 1, interval: .25, length: 24 };
    const enemyTypes = { armored: { health: 3 } };
    const movementHint = {}, statusMessage = {}, evolution = { pending: false };
    const enemies = [], bosses = [], hitLog = [];
    let fighter = "red", battleTime = 200, state = "battle", paused = false, pendingShots = 1, muzzleFlash = 1;
    const isBattleActive = () => state === "battle" && !paused;
    const isBossDeathPlaying = () => false;
    const fighterProfile = () => ({ id: fighter });
    const muzzlePosition = () => ({ x: player.x + 80, y: player.y });
    const weaponDamageLog = () => Math.log(12);
    const enemyHealthLogForTime = () => Math.log(12);
    const activeBosses = () => bosses;
    const bossCanTakeDamage = target => bosses.includes(target) && target.hp > 0;
    const applyBossHit = (shot, target) => {
      const fraction = Math.min(ultimateRules.bossDamageCap, Math.exp(shot.damageLog - target.healthLog));
      target.hp -= fraction;
      hitLog.push({ id: target.id, fraction });
    };
    function projectileAlienBossHit(missile, boss) {
      const time = projectileEnemyEntry(missile, boss);
      return Number.isFinite(time) ? { time } : null;
    }
    const applyEnemyHit = (enemy, shot) => {
      const fraction = Math.exp(shot.damageLog - enemy.healthLog);
      hitLog.push({ id: enemy.id, fraction });
      enemy.hp -= fraction;
    };
    const defeatEnemy = index => enemies.splice(index, 1);
    const resolveUltimateBattlefieldObjects = () => {};
    function place(id, x, y, health = 10, boss = false) {
      const target = { id, x, y, width: boss ? 170 : 45, height: boss ? 90 : 30,
        hp: 1, healthLog: Math.log(health) };
      (boss ? bosses : enemies).push(target);
      return target;
    }
    function advance(seconds, step = .016) {
      const frames = Math.ceil(seconds / step);
      for (let i = 0; i < frames; i++) updateUltimate(seconds / frames);
    }
  `);
  run(source("fire-control.js"));
  run(source("ultimate.js"));
  return { run, hud, sound };
}

test("Ion Swarm bends toward an off-axis target, then picks a new target after impact", () => {
  const { run, hud, sound } = arena();
  run(`fighter = "blue";
    place("first", 495, 303); place("second", 942, 182); place("behind", 112, 360);
    ultimate.charges = 1; requestUltimate(); advance(.95);`);
  assert.equal(hud.get("#ultimate-name").textContent, "Ion Swarm");
  assert.equal(run("ultimate.shot.missiles.length"), 5);
  assert.ok(run("ultimate.shot.missiles.some(missile => missile.angle < -.35)"));
  run("advance(1.3);");
  assert.equal(run("enemies.length"), 1);
  assert.equal(run("enemies[0].id"), "behind");
  assert.equal(run("ultimate.phase"), "idle");
  assert.equal(run("ultimate.energy"), 0);
  assert.deepEqual(sound.find(event => event[0] === "fire"), ["fire", "blue"]);
});

test("Corona Barrage sweeps all heights and both sides of the ship in three timed waves", () => {
  const { run, hud } = arena();
  run(`fighter = "yellow";
    place("top-left", 111, 80, 10000); place("bottom-right", 970, 663, 10000);
    ultimate.charges = 1; requestUltimate(); advance(.85); advance(.15);`);
  assert.equal(hud.get("#ultimate-name").textContent, "Corona Barrage");
  assert.equal(run("hitLog.length"), 1);
  assert.equal(run("hitLog[0].id"), "top-left");
  assert.equal(run("ultimate.shot.waves[1].x"), 0);
  run("advance(1.4);");
  for (const id of ["top-left", "bottom-right"]) {
    assert.equal(run(`hitLog.filter(hit => hit.id === "${id}").length`), 3);
  }
  assert.equal(run("ultimate.phase"), "idle");
  assert.equal(run("ultimate.energy"), 0);
});

test("a whole cast cannot one-shot a Boss even with heavily upgraded weapons", () => {
  for (const [id, expected] of [["red", 0.18], ["blue", 0.15], ["yellow", 0.081]]) {
    const { run } = arena();
    run(`fighter = "${id}";
      const target = place("boss", 1030, 360, .01, true);
      ultimate.charges = 1; requestUltimate(); advance(2.5);`);
    assert.ok(Math.abs(run("1 - target.hp") - expected) < 1e-9, id);
  }
});

test("Perfect Link, pause and refund work identically for both alternate casts", () => {
  for (const id of ["blue", "yellow"]) {
    const { run, sound } = arena();
    run(`fighter = "${id}"; ultimate.charges = 2; armCannonLink();
      requestUltimate(); advance(.15); paused = true; syncUltimateAudio(false); advance(2);`);
    assert.equal(run("ultimate.phase"), "charging");
    assert.equal(run("ultimate.charges"), 1);
    assert.equal(run("cannonLink.remaining"), 0);
    assert.ok(Math.abs(run("ultimate.elapsed") - .15) < 1e-9);
    run("paused = false; syncUltimateAudio(true);");
    assert.deepEqual(sound.filter(event => event[0] === "charge").at(-1).slice(2), [id]);
    assert.ok(Math.abs(sound.filter(event => event[0] === "charge").at(-1)[1] - .3) < 1e-9);
    run("cancelUltimate(true);");
    assert.equal(run("ultimate.charges"), 2);
    assert.equal(run("requestUltimate()"), true);
    run("advance(.86); cancelUltimate(true);");
    assert.equal(run("ultimate.charges"), 1);
    assert.equal(run("ultimate.phase"), "idle");
    assert.equal(run("ultimate.shot"), null);
  }
});
