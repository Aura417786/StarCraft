"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { open } = require("./boss-retry.cjs");
const game = path.resolve(process.argv[2] || ".");
const output = path.resolve(process.argv[3] || "battle-rewind-results");

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const errors = [], result = { schema: "star-breaker-temporal-rewind/1", allPassed: false,
    methodology: "Unmodified production runtime in Chrome; staged deterministic battlefield histories exercise full-state restoration, entity identity/weak hit registries, Boss attack closures, boundary isolation and bounded sparse history. This does not claim a natural campaign or manual play." };
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  let page;
  try {
    page = await open(browser, errors);
    if (!await page.evaluate(() => typeof requestBattleRewind === "function"))
      await page.addScriptTag({ path: path.join(game, "battle-rewind.js") });
    await page.evaluate(() => {
      window.beginRewindFixture = (type = null) => {
        showScreen("battle", { mode: "campaign", fighter: "blue", seed: 7582 });
        evolution.route = "rewind"; evolution.level = 1; evolution.cooldown = 0;
        if (type !== null) { spawnBoss(type); resetBossPresentation(); boss.phase = "recover"; }
        resetBattleRewind("fixture", true);
        battleTime = 10;
        canvas.focus();
      };
      window.rewindStats = () => ({ time: battleTime, score, kills, lives: player.lives,
        x: player.x, y: player.y, weapon: { ...weapon },
        shield: { charges: shield.charges, energy: shield.energy },
        ultimate: { charges: ultimate.charges, energy: ultimate.energy },
        enemies: enemies.map(e => ({ kind: e.kind, x: e.x, y: e.y, hp: e.hp })),
        bullets: bullets.map(b => ({ x: b.x, y: b.y, damage: b.damage })),
        enemyShots: enemyProjectiles.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy })),
        rng: sortieStats.random.getState() });
    });
    result.fullBattle = await page.evaluate(() => {
      beginRewindFixture();
      spawnEnemy("gunner");
      const original = enemies[0];
      original.x = 800; original.y = 270; original.hp = .8;
      fighterCombat.marked = original; fighterCombat.marks.set(original, { stacks: 2, expires: 12 });
      bullets.push({ x: 580, y: 270, vx: 0, vy: 0, damage: 4, hitTargets: new WeakSet([original]) });
      enemyProjectiles.push({ x: 450, y: 320, vx: -300, vy: 0, radius: 6, age: 0 });
      player.lives = 4; player.maxLives = 5; player.y = 330;
      ultimate.charges = 3; ultimate.energy = 41;
      shield.charges = 1; shield.energy = 8;
      score = 400; kills = 4;
      const expected = rewindStats(), profile = JSON.stringify(sortieProfile.data);
      stepBattleRewind(0);
      defeatEnemy(0);
      spawnEnemy("scout");
      player.lives = 1; player.y = 500; ultimate.charges = 0; shield.charges = 0;
      bullets.length = 0; enemyProjectiles.length = 0;
      evolution.cooldown = 7; sortieStats.hitsTaken = 3;
      battleTime = 13.2; stepBattleRewind(.1);
      const success = requestBattleRewind(3, 18);
      return { success, expected, actual: rewindStats(),
        originalRestored: enemies[0] === original && fighterCombat.marked === enemies[0],
        weakHitRetained: bullets[0]?.hitTargets.has(enemies[0]), marks: fighterCombat.marks.get(enemies[0]),
        hits: sortieStats.hitsTaken, assisted: sortieStats.assisted, flag: sortieStats.assists.timeRewind,
        sameProfile: profile === JSON.stringify(sortieProfile.data), cooldown: battleRewind.cooldown,
        evolutionCooldown: evolution.cooldown, actualSeconds: battleRewind.lastRewound,
        secondCastRejected: !requestBattleRewind(3, 18), error: battleRewind.error };
    });
    assert.equal(result.fullBattle.success, true);
    assert.deepEqual(result.fullBattle.actual, result.fullBattle.expected);
    for (const key of ["originalRestored", "weakHitRetained", "assisted", "flag", "sameProfile", "secondCastRejected"])
      assert.equal(result.fullBattle[key], true, key);
    assert.deepEqual(result.fullBattle.marks, { stacks: 2, expires: 12 });
    assert.equal(result.fullBattle.hits, 3);
    assert.equal(result.fullBattle.cooldown, 18);
    assert.equal(result.fullBattle.evolutionCooldown, 7);
    assert.equal(result.fullBattle.error, "");

    result.profileAlias = await page.evaluate(() => {
      beginRewindFixture();
      const initial = sortieStats.upgrades.firepower;
      stepBattleRewind(0);
      // A concurrent legitimate account purchase must never be undone by
      // restoring detached sortie metadata.
      sortieProfile.awardBoss(0, "hard");
      if (!sortieProfile.spendUpgrade("firepower")) throw new Error("Fixture purchase failed");
      const saved = JSON.stringify(sortieProfile.data);
      battleTime += 3.2; stepBattleRewind(.1);
      const success = requestBattleRewind(3, 18);
      return { success, initial, runUpgrade: sortieStats.upgrades.firepower,
        profileUpgrade: sortieProfile.data.upgrades.firepower,
        untouched: JSON.stringify(sortieProfile.data) === saved };
    });
    assert.equal(result.profileAlias.success, true);
    assert.equal(result.profileAlias.runUpgrade, result.profileAlias.initial);
    assert.equal(result.profileAlias.profileUpgrade, result.profileAlias.initial + 1);
    assert.equal(result.profileAlias.untouched, true);

    result.closure = await page.evaluate(() => {
      beginRewindFixture(0);
      const target = boss;
      target.phase = "attack"; target.phaseTime = .25; target.hp = .8;
      target.attackEvents = [{ at: 1, fire: () => { target.rewindClosureCount = (target.rewindClosureCount ?? 0) + 1; } }];
      target.nextEvent = 0;
      stepBattleRewind(0);
      target.phaseTime = 1; runAlienAttack(target);
      const first = target.rewindClosureCount;
      target.hp = .3; battleTime = 13.1; stepBattleRewind(.1);
      const success = requestBattleRewind(3, 18);
      const restored = { identity: boss === target, hp: boss.hp, nextEvent: boss.nextEvent, phaseTime: boss.phaseTime,
        count: boss.rewindClosureCount ?? 0 };
      boss.phaseTime = 1; runAlienAttack(boss);
      return { success, first, restored, second: boss.rewindClosureCount, error: battleRewind.error };
    });
    assert.deepEqual(result.closure, { success: true, first: 1, restored: { identity: true, hp: .8, nextEvent: 0,
      phaseTime: .25, count: 0 }, second: 1, error: "" });

    result.bosses = [];
    for (let type = 0; type < 11; type++) for (const finale of [false, true]) {
      const row = await page.evaluate(({ type, finale }) => {
        beginRewindFixture(type);
        if (finale) { beginBossFinale(boss); resetBossPresentation(); boss.finale.age = boss.finale.transform + 1; updateBossFinale(boss, .01); }
        else prepareAlienAttack(boss);
        stepBattleRewind(0);
        const first = battleRewind.history[0];
        const hp = boss.hp, phase = boss.phase, projectiles = bossProjectiles.length, hazards = bossHazards.length;
        boss.hp = .21; battleTime += 3.2; stepBattleRewind(.1);
        const success = requestBattleRewind(3, 18);
        return { type, finale, success, matched: boss.hp === hp && boss.phase === phase
          && bossProjectiles.length === projectiles && bossHazards.length === hazards,
          bytes: first?.graph.bytes, nodes: first?.graph.nodes.length, error: battleRewind.error };
      }, { type, finale });
      assert.equal(row.success, true, JSON.stringify(row));
      assert.equal(row.matched, true, JSON.stringify(row));
      assert.equal(row.error, "");
      result.bosses.push(row);
    }

    result.boundaries = await page.evaluate(() => {
      beginRewindFixture();
      stepBattleRewind(0); battleTime += 4; stepBattleRewind(.1);
      spawnBoss(3); resetBossPresentation(); boss.phase = "recover";
      stepBattleRewind(.1);
      const blockedAtNewBoss = !requestBattleRewind(3, 18);
      battleTime += 2; stepBattleRewind(.1);
      const successWithShortHistory = requestBattleRewind(999, 18), seconds = battleRewind.lastRewound;
      resetBattleRewind("fixture phase");
      const cooldownKept = battleRewind.cooldown;
      resetBattleRewind("run", true);
      return { blockedAtNewBoss, successWithShortHistory, seconds, cooldownKept,
        cooldownNewRun: battleRewind.cooldown, emptyHistory: battleRewind.history.length === 0 };
    });
    assert.deepEqual(result.boundaries, { blockedAtNewBoss: true, successWithShortHistory: true,
      seconds: 2, cooldownKept: 18, cooldownNewRun: 0, emptyHistory: true });

    result.longHistory = await page.evaluate(() => {
      beginRewindFixture();
      const start = performance.now();
      for (let i = 0; i < 3200; i++) { battleTime = 10 + i * .1; stepBattleRewind(.1); }
      const elapsed = performance.now() - start;
      const history = battleRewind.history, length = history.length, bytes = battleRewind.bytes;
      const oldest = history[0].time, newest = history.at(-1).time;
      const recent = history.filter(entry => newest - entry.time < 9.9).length;
      const success = requestBattleRewind(200, 600);
      return { length, bytes, oldest, newest, recent, elapsedMs: elapsed,
        success, actualSeconds: battleRewind.lastRewound, error: battleRewind.error,
        bounded: length <= battleRewindRules.maxSamples && bytes <= battleRewindRules.maxBytes };
    });
    assert.equal(result.longHistory.bounded, true);
    assert.equal(result.longHistory.oldest, 10);
    assert.ok(result.longHistory.recent >= 90, "Recent ten seconds lost normal-density samples");
    assert.ok(result.longHistory.actualSeconds >= 199 && result.longHistory.actualSeconds < 205,
      "A high-rank 200-second request was silently capped");
    assert.equal(result.longHistory.error, "");

    result.pressureMemory = await page.evaluate(() => {
      beginRewindFixture(9); prepareAlienAttack(boss);
      for (let index = 0; index < 240; index++) bossProjectiles.push({
        x: 500 + index, y: 160 + index % 300, previousX: 501 + index,
        previousY: 160 + index % 300, vx: -300, vy: 0, radius: 6, age: 0,
        color: "#aa88ff", source: "boss", damage: 1, backgroundPressure: true,
        pressureLane: index / 240, pressureSide: index % 2 ? -1 : 1
      });
      const samples = [];
      for (let index = 0; index < 300; index++) {
        battleTime = 10 + index * .1;
        const before = performance.now(); stepBattleRewind(.1); samples.push(performance.now() - before);
      }
      samples.sort((a, b) => a - b);
      return { estimatedBytes: battleRewind.bytes, samples: battleRewind.history.length,
        captureP95Ms: samples[Math.floor(samples.length * .95)], captureMaxMs: samples.at(-1),
        firstTime: battleRewind.history[0]?.time, lastTime: battleRewind.history.at(-1)?.time,
        bounded: battleRewind.bytes <= battleRewindRules.maxBytes && battleRewind.history.length <= battleRewindRules.maxSamples,
        error: battleRewind.error };
    });
    assert.equal(result.pressureMemory.bounded, true);
    assert.equal(result.pressureMemory.firstTime, 10);
    assert.ok(result.pressureMemory.lastTime > 39);
    assert.equal(result.pressureMemory.error, "");

    // Production frame integration after restoration: live hostile movement,
    // player fire and cooldown progression must continue without stale graphs.
    result.frames = await page.evaluate(() => {
      beginRewindFixture(0); prepareAlienAttack(boss); stepBattleRewind(0);
      battleTime += 3.2; stepBattleRewind(.1);
      const success = requestBattleRewind(3, 18);
      const time = battleTime;
      for (let i = 0; i < 90; i++) retryTestFrame(1 / 60);
      return { success, state, timeAdvanced: battleTime - time, bossAge: boss?.age,
        cooldown: battleRewind.cooldown, bullets: bullets.length, error: battleRewind.error };
    });
    assert.equal(result.frames.success, true);
    assert.equal(result.frames.state, "battle");
    assert.ok(result.frames.timeAdvanced > 1);
    assert.ok(result.frames.cooldown < 18 && result.frames.cooldown > 16, "Production frame hook did not advance the external rewind cooldown");
    assert.equal(result.frames.error, "");
    await page.screenshot({ path: path.join(output, "rewind-restored-battle.png") });
    assert.deepEqual(errors, []);
    result.allPassed = true;
  } catch (error) {
    result.failure = error.stack || String(error);
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
    throw error;
  } finally {
    result.errors = errors;
    fs.writeFileSync(path.join(output, "battle-rewind.json"), JSON.stringify(result, null, 2) + "\n");
    await browser.close();
  }
  console.log("Temporal rewind checks passed: " + output);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
