#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

async function main() {
  const [gameArg, evidenceArg] = process.argv.slice(2);
  if (!gameArg || !evidenceArg) throw new Error("Usage: node field.cjs <Game folder> <evidence folder>");
  const game = path.resolve(gameArg), evidence = path.resolve(evidenceArg);
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || chromium.executablePath(), headless: true });
  try {
    const { page, errors } = await createPage(browser, game, true);
    const fixtures = await page.evaluate(() => {
      function setup(options = {}) {
        showScreen("battle", { seed: 8871, ...options });
        enemyCooldown = powerupCooldown = nextBossTime = Infinity;
        battlefieldEvents.nextObject = battlefieldEvents.nextTransport = Infinity;
        formationState.nextTime = aceEncounter.nextTime = Infinity;
        shotCooldown = Infinity;
        bossHitGrace = 0;
      }
      function place(kind, x, y) {
        spawnEnemy(kind);
        const enemy = enemies.at(-1);
        Object.assign(enemy, { x, y, baseY: y, previousX: x, previousY: y, speed: 0, waveAmplitude: 0 });
        return enemy;
      }
      function shot(x, y, damage, previousX) {
        return { x, previousX, y, previousY: y, length: 24, halfHeight: 3, damage, damageLog: Math.log(damage),
          angle: 0, piercesLeft: 0, hitTargets: new Set() };
      }
      function frames(count) {
        for (let i = 0; i < count; i++) window.__balanceClock.tick(1 / 60);
      }

      setup();
      const layer = place("minelayer", viewport.width * .75, player.y + 150);
      for (let i = 0; i < 74; i++) updateEnemyMovement(layer, 1 / 60);
      const deployed = eliteDirector.mines.length;
      const mine = eliteDirector.mines[0];
      bullets.push(shot(mine.x + 2, mine.y, mine.hp * 2, mine.x - 96));
      resolveProjectileHits();
      const defused = !eliteDirector.mines.includes(mine);
      const trap = eliteDirector.mines[0];
      eliteDirector.mines.splice(1);
      player.x = player.previousX = trap.x;
      player.y = player.previousY = trap.y;
      const target = place("scout", trap.x + trap.blastRadius * .72, trap.y);
      const lives = player.lives;
      updateEliteMines(1.19);
      const safeBeforeFuse = player.lives === lives && target.hp === 1;
      // Keep the fixture's pilot in the hazard's displayed blast area.
      player.x = trap.x;
      updateEliteMines(.015);
      const mineBlast = { deployed, defused, safeBeforeFuse, playerDamage: lives - player.lives,
        enemyDamaged: target.hp < 1, liveMines: eliteDirector.mines.length,
        hostileProjectiles: enemyProjectiles.length };

      setup();
      const guard = place("shield-guard", 670, player.y + 35);
      const escorted = place("scout", 715, player.y);
      refreshEliteEscortShields(1 / 60);
      const shieldHp = escorted.escortShield?.hp ?? 0;
      applyEnemyHit(escorted, { damage: 2, x: 500, y: player.y });
      const shieldedHull = escorted.hp, damagedShield = escorted.escortShield?.hp;
      applyEnemyHit(escorted, { damage: shieldHp - 2, x: 500, y: player.y });
      const shieldBroken = escorted.escortShield?.hp === 0 && escorted.hp === 1;
      const other = place("scout", 680, player.y - 45);
      refreshEliteEscortShields(1 / 60);
      const removedOnGuardKill = other.escortShield?.hp > 0;
      defeatEnemy(enemies.indexOf(guard));
      const guards = { shieldHp, damagedShield, shieldedHull, shieldBroken,
        removedOnGuardKill: removedOnGuardKill && !other.escortShield && !escorted.escortShield };

      setup();
      const parent = place("splitter", 820, player.y);
      defeatEnemy(enemies.indexOf(parent));
      const children = enemies.filter(enemy => enemy.kind === "splitling");
      frames(22);
      const split = { count: children.length, ratios: children.map(enemy => Math.exp(enemy.healthLog - parent.healthLog)),
        separating: children[0].y < parent.y && children[1].y > parent.y, hostileProjectiles: enemyProjectiles.length };

      setup();
      const wreck = spawnBattlefieldObject("wreck");
      Object.assign(wreck, { x: 585, previousX: 585, y: player.y, previousY: player.y, speed: 0 });
      enemyProjectiles.push({ x: player.x, previousX: 680, y: player.y, previousY: player.y, vx: -700, vy: 0, radius: 5 });
      resolveBattlefieldCover();
      const blocked = enemyProjectiles.length === 0 && wreck.hp < 1 && player.lives === 3;
      const wreckDamage = 1 - wreck.hp;
      hitBattlefieldObject(wreck, { damage: Math.exp(wreck.healthLog) });
      const wreckDestroyed = !battlefieldEvents.objects.includes(wreck) && battlefieldEvents.fragments.length > 0;

      const rock = spawnBattlefieldObject("asteroid");
      Object.assign(rock, { x: 540, previousX: 540, y: player.y, previousY: player.y, speed: 0 });
      const ahead = place("scout", 685, player.y);
      const oldKills = kills;
      bullets.push(shot(rock.x + 2, rock.y, Math.exp(rock.healthLog) * 2, rock.x - 126));
      resolveProjectileHits();
      const rockDestroyed = !battlefieldEvents.objects.includes(rock);
      frames(65);
      const terrain = { blocked, wreckDamage, wreckDestroyed, rockDestroyed,
        shrapnelHit: ahead.hp < 1, shrapnelKill: kills > oldKills && !enemies.includes(ahead) };

      setup();
      battlefieldState.clock = sceneryRules.interval * 4 + 19;
      scenerySyncJourney();
      journeyState.seen.add("rift");
      startGravityWarning();
      const gravityBefore = gravityPlayerVector();
      const warning = gravityTide.phase === "warning";
      updateGravityTide(gravityRules.warning);
      updateGravityTide(.6);
      player.x = gravityTide.centerX - gravityTide.radiusX * .40;
      player.y = gravityTide.centerY - gravityTide.radiusY * .20;
      const drift = gravityPlayerVector(), x = player.x, y = player.y;
      updatePlayer(.4);
      const afterDrift = { x: player.x - x, y: player.y - y };
      pressedKeys.add("ArrowLeft");
      const driftX = player.x;
      updatePlayer(.1);
      pressedKeys.clear();
      const gravity = { warning, gravityBefore, drift, afterDrift,
        counterSteering: player.x < driftX, bounded: Math.hypot(drift.x, drift.y) <= player.speed * .24 };

      setup();
      const scene = { id: "citadel", elapsed: 7.5, previousElapsed: 7.49, events: new Set(), duration: 30 };
      journeyState.scene = scene;
      updateJourneyEncounter(scene, 7.49);
      const railX = player.x;
      updatePlayer(.2);
      const railMotion = player.x - railX;
      const guarded = bossHitGrace > 0;
      pressedKeys.add("ArrowLeft");
      const beforeControl = player.x;
      updatePlayer(.2);
      pressedKeys.clear();
      const catapult = { triggered: scene.events.has("alliedCatapult"),
        railMotion, protected: guarded, pilotControl: player.x < beforeControl };

      const isolation = {};
      for (const mode of ["rush", "practice", "daily"]) {
        setup({ mode });
        eliteDirector.next = 0;
        isolation[mode] = eliteWaveKind() === null && !eliteDirector.mines.length;
      }
      return { mineBlast, guards, split, terrain, gravity, catapult, isolation };
    });
    assert.deepEqual(fixtures.mineBlast, { deployed: 6, defused: true, safeBeforeFuse: true,
      playerDamage: 1, enemyDamaged: true, liveMines: 0, hostileProjectiles: 0 });
    assert.equal(fixtures.guards.shieldedHull, 1);
    assert.equal(fixtures.guards.shieldHp - fixtures.guards.damagedShield, 2);
    assert.ok(fixtures.guards.shieldBroken && fixtures.guards.removedOnGuardKill);
    assert.deepEqual(fixtures.split, { count: 2, ratios: [.4, .4], separating: true, hostileProjectiles: 0 });
    assert.ok(fixtures.terrain.blocked && fixtures.terrain.wreckDamage > 0 && fixtures.terrain.wreckDestroyed);
    assert.ok(fixtures.terrain.rockDestroyed && fixtures.terrain.shrapnelHit && fixtures.terrain.shrapnelKill);
    assert.ok(fixtures.gravity.warning && fixtures.gravity.afterDrift.x > 0 && fixtures.gravity.afterDrift.y > 0);
    assert.ok(fixtures.gravity.counterSteering && fixtures.gravity.bounded);
    assert.deepEqual(fixtures.gravity.gravityBefore, { x: 0, y: 0 });
    assert.ok(fixtures.catapult.triggered && fixtures.catapult.railMotion > 0 && fixtures.catapult.protected && fixtures.catapult.pilotControl);
    assert.ok(Object.values(fixtures.isolation).every(Boolean));

    // Exercise all sectors here. The release matrix also keeps the old 314159
    // seed, which can defeat this pilot before it reaches the late terrain.
    const natural = await page.evaluate(() => runBalanceFixture({
      label: "terrain-and-elites-natural", mode: "campaign", fighter: "red", build: "wings", seed: 4225,
      bossType: null, fixture: "natural", seconds: 1300, policy: "pilot", difficulty: "veteran",
    }));
    assert.ok(natural.won, "Natural trajectory must reach the final encounter");
    assert.ok(Object.values(natural.elite_spawns).every(count => count >= 3), JSON.stringify(natural.elite_spawns));
    assert.ok(["wreck", "asteroid", "gravity-tide", "allied-catapult"]
      .every(feature => natural.field_features.includes(feature)), JSON.stringify(natural.field_features));
    assert.deepEqual(errors, []);
    await page.close();

    const live = await createPage(browser, game, false);
    await live.page.locator("#start-button").click();
    await live.page.waitForFunction(() => state === "battle");
    const snapshots = [];
    const prepare = source => live.page.evaluate(code => {
      showScreen("battle", { seed: 314159 });
      enemyCooldown = nextBossTime = powerupCooldown = Infinity;
      battlefieldEvents.nextObject = battlefieldEvents.nextTransport = Infinity;
      formationState.nextTime = aceEncounter.nextTime = Infinity;
      shotCooldown = Infinity;
      battleTime = 120;
      updateDifficultyDisplay();
      movementHint.hidden = true;
      Function(code)();
    }, source);
    async function screenshot(name) {
      await live.page.waitForTimeout(240);
      const file = name + ".png";
      await live.page.screenshot({ path: path.join(evidence, file) });
      snapshots.push(file);
    }
    await prepare(`
      setGameLanguage("en");battlefieldState.clock=sceneryRules.interval+16;scenerySyncJourney();
      function place(kind,x,y,speed){spawnEnemy(kind);Object.assign(enemies.at(-1),{x,previousX:x,y,previousY:y,baseY:y,speed,waveAmplitude:0});}
      place("minelayer",980,212,155);place("shield-guard",910,440,40);
      place("scout",746,407,45);place("splitter",1060,475,36);
      const wreck=spawnBattlefieldObject("wreck");Object.assign(wreck,{x:578,y:362,previousX:578,previousY:362,speed:8,hp:.73});
    `);
    await live.page.waitForFunction(() => eliteDirector.mines.length >= 2);
    await screenshot("field-elites-live");
    const liveFrameIntervals = await live.page.evaluate(() => new Promise(resolve => {
      const samples = [];
      let last;
      function frame(time) {
        if (last !== undefined) samples.push(time - last);
        last = time;
        if (samples.length >= 120) {
          samples.sort((a, b) => a - b);
          const p = position => samples[Math.floor((samples.length - 1) * position)];
          resolve({ sampleCount: samples.length, p50: p(.5), p95: p(.95), max: samples.at(-1) });
        } else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }));
    await prepare(`
      battlefieldState.clock=sceneryRules.interval*4+15;scenerySyncJourney();journeyState.seen.add("rift");
      startGravityWarning();
    `);
    await screenshot("field-gravity-warning");
    await live.page.waitForFunction(() => gravityTide.phase === "active" && gravityTide.strength > .75);
    await screenshot("field-gravity-active");
    await prepare(`
      battlefieldState.clock=sceneryRules.interval*3+18;scenerySyncJourney();
      journeyState.scene={id:"citadel",leg:3,elapsed:7.49,previousElapsed:7.47,events:new Set(),duration:30,blend:0};
    `);
    await live.page.waitForFunction(() => journeyState.scene?.catapult > .4);
    await screenshot("field-catapult");
    await prepare(`
      battlefieldState.clock=sceneryRules.interval+18;scenerySyncJourney();
      const rock=spawnBattlefieldObject("asteroid"), y=player.y+88;
      Object.assign(rock,{x:680,y,previousX:680,previousY:y,speed:8});
      raiseWeaponFloor(progressionPresetForBoss(2));shotCooldown=0;
    `);
    const rockY = await live.page.evaluate(() => battlefieldEvents.objects.find(isFieldAsteroid).y);
    await live.page.keyboard.down("ArrowDown");
    await live.page.waitForFunction(y => player.y >= y - 6, rockY);
    await live.page.keyboard.up("ArrowDown");
    await live.page.waitForFunction(() => battlefieldEvents.fragments.some(part => part.rock && part.damage > 0));
    await screenshot("field-asteroid-shards");
    assert.deepEqual(live.errors, []);
    const report = { fixtures, natural, snapshots, errors, liveErrors: live.errors, liveFrameIntervals, liveKeyboardRockBreak: true };
    fs.writeFileSync(path.join(evidence, "field.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ fixtures, eliteSpawns: natural.elite_spawns, snapshots }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
