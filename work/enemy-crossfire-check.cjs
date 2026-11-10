"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "enemies.js"), "utf8");
function sandbox(width = 1280, height = 720) {
  const world = vm.createContext({ width, height });
  const run = code => vm.runInContext(code, world);
  run(`
    const viewport = { width, height };
    const hull = Math.min(180, width * .24, height * .28);
    const flightBounds = { top: Math.min(height / 2, (width <= 740 ? Math.min(200, height * .49) : 90) + hull / 3 + 8),
      bottom: height - Math.min(65, height * .18) - hull / 3 - 8 };
    const span = flightBounds.bottom - flightBounds.top;
    const startY = flightBounds.top + span * .43;
    const player = { x: width * .17, y: startY, previousY: startY, width: hull, height: hull * 2 / 3, lives: 3 };
    let battleTime = 84, formationState = { warning: null, active: null }, activeAce = false, bossWarning = false;
    const enemies = [], played = [];
    const gameAudio = { bossAttack(sound) { played.push(sound); } };
    const reducedMotion = { matches: false };
    const clamp = (n, low, high) => Math.max(low, Math.min(n, high));
    const tr = value => value;
    const isBattleActive = () => true;
    const aceBlocksWaves = () => activeAce;
    const bossBlocksWaves = () => bossWarning;
    const applyGravityTide = () => {};
    const consumeEvolutionShieldProjectile = () => false;
    const tryPerfectShield = () => {};
    const updateAceMovement = () => false;
    const damagePlayer = () => { player.lives--; };
    function createGunner(x, y, gunPhase, gunTime = 0) {
      const enemy = { kind: "gunner", x, y, width: hull * .55, height: hull * .36,
        holdX: x, speed: 110, gunPhase, gunTime, gunShots: 0 };
      enemies.push(enemy);
      return enemy;
    }
    const pointAt = ratio => flightBounds.top + span * ratio;
    const lead = createGunner(width * .75, pointAt(.22), "entry");
    const wing = createGunner(width * .80, pointAt(.77), "recover");
    wing.gunShots = 1;
    const moves = [];
    const context = new Proxy({}, { get: (_, name) => (...args) => moves.push([name, ...args]) });
  `);
  run(source);
  return run;
}

test("a paired gunner waits for the pin shot, leads the escape and uses the shown trajectory", () => {
  const run = sandbox();
  run('updateEnemyMovement(lead, 0); updateEnemyMovement(lead, .899);');
  assert.equal(run('enemyProjectiles.length'), 0);
  assert.equal(run('wing.gunPhase'), "recover");
  run('updateEnemyMovement(lead, .001);');
  assert.equal(run('enemyProjectiles.length'), 1);
  assert.equal(run('wing.gunPhase'), "relay");
  run('player.y=pointAt(.66); updateEnemyMovement(wing, .319);');
  assert.equal(run('enemyProjectiles.length'), 1);
  assert.equal(run('wing.gunPhase'), "relay");
  run('updateEnemyMovement(wing, .001);');
  assert.equal(run('wing.gunAimKind'), "relay");
  assert.ok(run('wing.aimY > player.y && wing.aimY > lead.aimY'));
  const targetY = run('wing.aimY');
  run('player.y=pointAt(.22); drawEnemyThreats(); updateEnemyMovement(wing, .899);');
  assert.equal(run('wing.aimY'), targetY);
  assert.equal(run('enemyProjectiles.length'), 1);
  assert.ok(run('moves.some(move=>move[0]==="setLineDash" && move[1].length===4)'));
  run('updateEnemyMovement(wing, .001);');
  assert.equal(run('enemyProjectiles.length'), 2);
  assert.ok(run(`(() => {
    const shot = enemyProjectiles[1];
    const targetSlope = (wing.aimY - shot.y) / (wing.aimX - shot.x);
    return Math.abs(shot.vy / shot.vx - targetSlope) < 1e-8 && shot.tint === gunnerTactics.relayTint;
  })()`));
  assert.equal(run('wing.gunShots'), 2);
});

test("advanced independent gunners show a fixed interception line when the player is moving", () => {
  const run = sandbox();
  run('enemies.length=0; wing.gunShots=0; player.previousY=player.y-6; beginEnemyAim(wing);');
  assert.equal(run('wing.gunAimKind'), "lead");
  assert.ok(run('wing.aimY > player.y'));
  run('player.y=pointAt(.10); updateEnemyMovement(wing, .9);');
  assert.equal(run('enemyProjectiles[0].tint'), "#82e5ff");
  assert.equal(run('wing.gunShots'), 1);
});

test("formations, aces, Boss warnings and reset prevent stale follow-up shots", () => {
  for (const busy of ['formationState.active={};', 'activeAce=true;', 'bossWarning=true;', 'battleTime=54;']) {
    const run = sandbox();
    run(busy + 'updateEnemyMovement(lead, 0); updateEnemyMovement(lead, .9);');
    assert.equal(run('enemyProjectiles.length'), 1);
    assert.equal(run('wing.gunPhase'), "recover");
  }
  const run = sandbox();
  run('updateEnemyMovement(lead, 0); updateEnemyMovement(lead, .9); resetEnemyCombat(false);');
  assert.equal(run('wing.gunPhase'), "retreat");
  run('updateEnemyMovement(wing, 2);');
  assert.equal(run('enemyProjectiles.length'), 0);
});

test("pin and relay punish a stationary pilot but permit reacting to both marks on three window sizes", () => {
  for (const [width, height] of [[640, 360], [1280, 720], [1920, 1080]]) {
    for (const reacts of [false, true]) {
      const run = sandbox(width, height);
      run(`updateEnemyMovement(lead, 0);
        let relaySeen = false;
        for (let frame=0; frame<420; frame++) {
          const dt=1/60;
          battleTime += dt;
          player.previousY=player.y;
          if (${reacts}) {
            const desired = relaySeen ? pointAt(.025) : pointAt(.82);
            player.y += clamp(desired-player.y,-300*dt,300*dt);
          }
          updateEnemyProjectiles(dt);
          if (!lead.gunShots) updateEnemyMovement(lead, dt);
          if (wing.gunPhase === "relay" || wing.gunPhase === "warning") updateEnemyMovement(wing, dt);
          relaySeen ||= wing.gunAimKind === "relay";
          updateEnemyProjectileDamage();
        }`);
      assert.ok(run('relaySeen && wing.gunShots===2'), `missing relay at ${width}×${height}`);
      assert.equal(run('player.lives'), reacts ? 3 : 2, `incorrect result at ${width}×${height}`);
    }
  }
});
test("late scouts announce a fixed intercept route, then only the marked scout dives", () => {
  const run = sandbox();
  run(`battleTime = scoutTactics.arrival;
    enemies.length = 0;
    function makeScout(ratio) {
      const scout = { kind: "scout", x: width * ratio, y: pointAt(.23),
        width: hull * .55, height: hull * .36, speed: 165, age: 1,
        baseY: pointAt(.23), waveAmplitude: 0 };
      enemies.push(scout);
      return scout;
    }
    const diver = makeScout(.71), backup = makeScout(.74);
    updateEnemyMovement(diver, .001); updateEnemyMovement(backup, .001);
  `);
  const target = run("scoutInterceptRoute(diver)");
  assert.ok(run("diver.scoutIntercept && !backup.scoutIntercept"));
  assert.ok(run("diver.y < scoutInterceptRoute(diver).y"));
  run("player.y=pointAt(.80); updateEnemyMovement(diver, scoutTactics.windup - .01); drawEnemyThreats();");
  assert.equal(run("diver.scoutIntercept.start"), null);
  assert.ok(run("moves.some(move => move[0] === 'lineTo' && move[2] === scoutInterceptRoute(diver).y)"));
  assert.equal(run("scoutInterceptRoute(diver).y"), target.y);
  run("updateEnemyMovement(diver, scoutTactics.dive + .02);");
  assert.equal(run("diver.scoutIntercept"), null);
  assert.equal(run("diver.y"), target.y);
  assert.equal(run("diver.x"), target.x);
  run("updateEnemyMovement(diver, .1);");
  assert.equal(run("diver.scoutIntercept"), null);
  run("updateEnemyMovement(backup, .001); activeAce = true; updateEnemyMovement(backup, .1);");
  assert.equal(run("backup.scoutIntercept"), null);
});
