"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { open } = require("./boss-retry.cjs");
const output = path.resolve(process.argv[3] || "evolution-route-results");

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const errors = [], evidence = { schema: "star-breaker-three-routes/1", allPassed: false, routes: [],
    methodology: "Production choice dialog activated through DOM buttons; production F-key input dispatch; deterministic production frames inspect actual resource and hostile-state changes. Fixtures are staged, not natural progression." };
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  let page;
  try {
    page = await open(browser, errors);
    for (const route of ["ember", "frost", "rewind"]) {
      await page.evaluate(() => { showScreen("battle", { seed: 5021 }); openEvolutionChoice(); });
      await page.locator(`[data-choice="${route}"]`).click();
      const first = await page.evaluate(() => ({ route: evolution.route, level: evolution.level, pending: evolution.pending,
        focus: document.activeElement.id }));
      assert.deepEqual(first, { route, level: 1, pending: false, focus: "game-canvas" });
      await page.evaluate(() => openEvolutionChoice());
      for (const other of ["ember", "frost", "rewind"].filter(value => value !== route))
        assert.equal(await page.locator(`[data-choice="${other}"]`).isDisabled(), true, "Route switching was still allowed");
      assert.equal(await page.evaluate(other => chooseEvolution(other), route === "ember" ? "frost" : "ember"), false);
      await page.locator(`[data-choice="${route}"]`).click();
      assert.equal(await page.evaluate(() => evolution.level), 2);
      await page.evaluate(() => { evolution.level = 99; openEvolutionChoice(); });
      await page.locator(`[data-choice="${route}"]`).click();
      assert.equal(await page.evaluate(() => evolution.level), 100);
      evidence.routes.push({ route, exclusive: true, levelAfterUpgrade: 100,
        spec1: await page.evaluate(route => evolutionSkillSpec(route, 1), route),
        spec2: await page.evaluate(route => evolutionSkillSpec(route, 2), route),
        spec100: await page.evaluate(route => evolutionSkillSpec(route, 100), route) });
    }
    const rewind = evidence.routes.find(item => item.route === "rewind");
    assert.equal(rewind.spec1.duration, 3);
    assert.equal(rewind.spec2.duration, 3.5);
    assert.equal(rewind.spec100.duration, 52.5);
    assert.ok(evidence.routes.find(item => item.route === "frost").spec100.duration > 7);
    assert.ok(evidence.routes.find(item => item.route === "ember").spec100.stacks > 8);

    // Actual F event restores both player and enemies, and cannot refund its CD.
    const beforeF = await page.evaluate(() => {
      showScreen("battle", { mode: "campaign", fighter: "red", seed: 5022 });
      openEvolutionChoice(); chooseEvolution("rewind");
      battleTime = 10; spawnEnemy("gunner");
      enemies[0].x = 900; enemies[0].y = 230; enemies[0].hp = .7;
      player.lives = 4; player.y = 330; score = 800;
      stepBattleRewind(0);
      const expected = { time: battleTime, y: player.y, lives: player.lives, enemyX: enemies[0].x, enemyHp: enemies[0].hp, score };
      battleTime = 13.2; enemies[0].x = 600; enemies[0].hp = .25;
      player.lives = 1; player.y = 480; score = 900;
      stepBattleRewind(.1);
      return expected;
    });
    await page.keyboard.press("f");
    evidence.rewindF = await page.evaluate(() => ({ time: battleTime, y: player.y, lives: player.lives,
      enemyX: enemies[0].x, enemyHp: enemies[0].hp, score, cooldown: evolution.cooldown,
      internalCooldown: battleRewind.cooldown, assisted: sortieStats.assisted, key: controlBindingLabel("focus") }));
    const { cooldown, internalCooldown, assisted, key, ...restored } = evidence.rewindF;
    assert.deepEqual(restored, beforeF);
    assert.equal(cooldown, 18); assert.equal(internalCooldown, 18); assert.equal(assisted, true); assert.equal(key, "F");
    await page.keyboard.press("f");
    assert.equal(await page.evaluate(() => evolution.cooldown), 18);
    await page.evaluate(() => { for (let i = 0; i < 35; i++) retryTestFrame(1 / 60); });
    await page.screenshot({ path: path.join(output, "rewind-F-restored.png") });

    // Actual F freezes positions and attack timers; the player's projectiles and
    // movement remain live. No stat-only assertion can substitute for this.
    const frozen = await page.evaluate(() => {
      showScreen("battle", { mode: "campaign", fighter: "blue", seed: 5023 });
      openEvolutionChoice(); chooseEvolution("frost");
      spawnEnemy("gunner");
      enemies[0].x = 1150; enemies[0].y = 230; enemies[0].healthLog = 20;
      enemyProjectiles.push({ x: 600, y: 230, previousX: 600, previousY: 230, vx: -250, vy: 0, radius: 6, age: 0 });
      enemyCooldown = 30; powerupCooldown = 30;
      return { enemyX: enemies[0].x, enemyAge: enemies[0].age, shotX: enemyProjectiles[0].x, shotAge: enemyProjectiles[0].age, playerY: player.y };
    });
    await page.keyboard.press("f");
    await page.keyboard.down("ArrowUp");
    await page.evaluate(() => { for (let i = 0; i < 45; i++) retryTestFrame(1 / 60); });
    await page.keyboard.up("ArrowUp");
    evidence.frostF = await page.evaluate(() => ({ enemyX: enemies[0].x, enemyAge: enemies[0].age,
      shotX: enemyProjectiles[0].x, shotAge: enemyProjectiles[0].age, playerY: player.y,
      playerBullets: bullets.length, frozenRemaining: evolution.frozenRemaining, cooldown: evolution.cooldown }));
    assert.equal(evidence.frostF.enemyX, frozen.enemyX);
    assert.equal(evidence.frostF.enemyAge, frozen.enemyAge);
    assert.equal(evidence.frostF.shotX, frozen.shotX);
    assert.equal(evidence.frostF.shotAge, frozen.shotAge);
    assert.ok(evidence.frostF.playerY < frozen.playerY - 30);
    assert.ok(evidence.frostF.playerBullets > 0);
    assert.ok(evidence.frostF.frozenRemaining > 0 && evidence.frostF.frozenRemaining < 1.8);
    await page.screenshot({ path: path.join(output, "frost-F-active.png") });
    await page.evaluate(() => { for (let i = 0; i < 120; i++) retryTestFrame(1 / 60); });
    assert.ok(await page.evaluate(x => enemies[0].x < x, frozen.enemyX), "Frozen enemies never resumed");

    // Real primary-hit stack accumulation and F detonation on two live targets.
    evidence.emberBefore = await page.evaluate(() => {
      showScreen("battle", { mode: "campaign", fighter: "yellow", seed: 5024 });
      openEvolutionChoice(); chooseEvolution("ember");
      spawnEnemy("gunner"); spawnEnemy("scout");
      for (const target of enemies) { target.healthLog = 14; target.x = 900; }
      for (let i = 0; i < 8; i++) {
        battleTime += .13;
        for (const target of enemies) applyEnemyHit(target, { damage: 1, noEnergy: true, source: "primary" });
      }
      return enemies.map(target => ({ hp: target.hp, stacks: target.emberStacks }));
    });
    assert.ok(evidence.emberBefore.every(target => target.stacks === 8));
    await page.keyboard.press("f");
    evidence.emberAfter = await page.evaluate(() => ({ cooldown: evolution.cooldown,
      targets: enemies.map(target => ({ hp: target.hp, stacks: target.emberStacks })) }));
    assert.equal(evidence.emberAfter.cooldown, 12);
    assert.ok(evidence.emberAfter.targets.every((target, index) => target.stacks === 0 && target.hp < evidence.emberBefore[index].hp));
    await page.evaluate(() => retryTestFrame());
    await page.screenshot({ path: path.join(output, "ember-F-detonated.png") });
    await page.keyboard.press("f");
    assert.deepEqual(await page.evaluate(() => enemies.map(target => ({ hp: target.hp, stacks: target.emberStacks }))), evidence.emberAfter.targets);
    await page.evaluate(() => { evolution.cooldown = 0; });
    await page.keyboard.press("f");
    assert.equal(await page.evaluate(() => evolution.cooldown), 0, "Empty detonation consumed cooldown");

    // Stress the authored per-cast Boss cap across all bodies and final phases
    // at early, mid and extreme ranks. Use actual practice gear for each Boss;
    // stage a full mark stack, then call the production activation/damage path.
    evidence.emberBossMatrix = await page.evaluate(() => {
      const rows = [];
      for (const level of [1, 5, 100]) for (let type = 0; type < 11; type++) for (const finale of [false, true]) {
        showScreen("battle", { mode: "practice", bossType: type, seed: 7331 });
        evolution.route = "ember"; evolution.level = level; evolution.cooldown = 0;
        spawnBoss(type); resetBossPresentation(); boss.phase = "attack"; boss.phaseTime = 0; boss.age = 10;
        if (finale) {
          beginBossFinale(boss); resetBossPresentation();
          boss.finale.age = boss.finale.transform + 1;
          boss.finale.ventOpenAt = 0; boss.finale.openUntil = boss.finale.age + 5;
          // Node-based finales keep their live nodes and resist blind central
          // hits; the result reports that genuine mechanic rather than bypassing it.
        }
        const target = boss, spec = evolutionSkillSpec();
        target.emberStacks = spec.stacks; target.emberUntil = battleTime + 8;
        const hpBefore = target.hp, nodesBefore = target.finale?.nodes.map(node => node.hp) ?? [];
        const fired = requestEvolutionSkill(), hpAfter = target.hp;
        const cooldown = evolution.cooldown, stacksAfter = target.emberStacks;
        const repeatedRejected = !requestEvolutionSkill() && target.hp === hpAfter;
        evolution.cooldown = 0;
        const emptyRejected = !requestEvolutionSkill() && evolution.cooldown === 0 && target.hp === hpAfter;
        rows.push({ type, name: bossTypes[type].enName, level, phase: finale ? target.finale.mode : "body",
          stacks: spec.stacks, configuredCap: spec.bossCap, fired, damageFraction: hpBefore - hpAfter,
          hpBefore, hpAfter, alive: boss === target && target.hp > 0, cooldown, stacksAfter,
          repeatedRejected, emptyRejected, nodesBefore, nodesAfter: target.finale?.nodes.map(node => node.hp) ?? [] });
      }
      return rows;
    });
    assert.equal(evidence.emberBossMatrix.length, 66);
    for (const row of evidence.emberBossMatrix) {
      assert.equal(row.fired, true, JSON.stringify(row));
      assert.ok(row.damageFraction > 0 && row.damageFraction < .4, "Explosion ineffective or excessive: " + JSON.stringify(row));
      assert.equal(row.alive, true, "Explosion one-shot a fresh Boss pool: " + JSON.stringify(row));
      assert.equal(row.cooldown, 12);
      assert.equal(row.stacksAfter, 0);
      assert.equal(row.repeatedRejected, true);
      assert.equal(row.emptyRejected, true);
    }
    evidence.emberWindows = await page.evaluate(() => {
      const rows = [];
      for (const window of ["shell", "pressureArmor", "recover", "counter"]) {
        showScreen("battle", { mode: "practice", bossType: 0, seed: 7332 });
        evolution.route = "ember"; evolution.level = 5; evolution.cooldown = 0;
        spawnBoss(0); resetBossPresentation(); boss.phase = window === "recover" ? "recover" : "attack";
        boss.age = 10; boss.alienAttack = "broodSweep";
        boss.pressureArmor = window === "pressureArmor";
        boss.counterUntil = window === "counter" ? 11 : 0;
        boss.emberStacks = evolutionSkillSpec().stacks; boss.emberUntil = battleTime + 8;
        const before = boss.hp;
        requestEvolutionSkill();
        rows.push({ window, damageFraction: before - boss.hp });
      }
      return rows;
    });
    const windowDamage = Object.fromEntries(evidence.emberWindows.map(row => [row.window, row.damageFraction]));
    assert.ok(windowDamage.pressureArmor < windowDamage.shell && windowDamage.shell < windowDamage.recover
      && windowDamage.recover < windowDamage.counter, "Ember ignored shell/pressure/counter mechanics");
    assert.ok(Math.abs(windowDamage.pressureArmor / windowDamage.shell - .15) < 1e-8);
    evidence.frostDutyCycle = await page.evaluate(() => [1, 10, 100].map(level => {
      const spec = evolutionSkillSpec("frost", level);
      return { level, duration: spec.duration, cooldown: spec.cooldown, dutyCycle: spec.duration / spec.cooldown };
    }));
    for (const [index, row] of evidence.frostDutyCycle.entries()) {
      assert.ok(row.duration > 0 && row.cooldown > row.duration && row.dutyCycle < .5,
        "Freeze can lock out the whole fight: " + JSON.stringify(row));
      if (index) {
        assert.ok(row.duration > evidence.frostDutyCycle[index - 1].duration);
        assert.ok(row.cooldown > evidence.frostDutyCycle[index - 1].cooldown);
      }
    }
    assert.deepEqual(errors, []);
    evidence.allPassed = true;
  } catch (error) {
    evidence.failure = error.stack || String(error);
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
    throw error;
  } finally {
    evidence.errors = errors;
    fs.writeFileSync(path.join(output, "evolution-routes.json"), JSON.stringify(evidence, null, 2) + "\n");
    await browser.close();
  }
  console.log("Evolution route and F-key tests passed: " + output);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
