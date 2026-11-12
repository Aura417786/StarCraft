"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");
const { openHangarPage, closeHangarPage } = require("./hangar-test-controls.cjs");

const root = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);

async function testOpening(browser, fighter) {
  const withTraining = fighter === "red";
  const { page, errors } = await createPage(browser, root, false, { campaignOpening: true, flightTraining: withTraining });
  try {
    await page.goto(new URL("?qa=1", page.url()).href);
    await page.bringToFront();
    const intro = page.locator("#campaign-opening");
    const start = page.locator("#start-button");
    const replay = page.locator("#replay-intro-button");
    const language = fighter === "blue" ? "en" : "zh-CN";
    const difficulty = { red: "easy", blue: "normal", yellow: "hard" }[fighter];
    await page.evaluate(value => {
      setGameLanguage(value);
      flightControls.autofire = false;
    }, language);
    await openHangarPage(page, "loadout");
    await page.locator(`#fighter-picker label[data-fighter="${fighter}"]`).click();
    await page.locator(`#hangar-difficulty label:has(input[value="${difficulty}"])`).click();
    await closeHangarPage(page, "loadout");
    await start.click();
    await intro.waitFor({ state: "visible" });
    assert.deepEqual(await page.evaluate(() => ({ state, battleTime, active: campaignOpening.active })), {
      state: "menu", battleTime: 0, active: true,
    });

    await page.evaluate(() => campaignOpening.seekForQa(10000));
    await page.waitForFunction(() => state === "battle" && ultimate.shot?.presentationOnly);
    const launch = await page.evaluate(() => ({
      fighter: sortieFighter,
      difficulty: sortieStats.difficulty,
      kind: ultimate.kind,
      shots: ultimate.shot?.missiles?.length ?? ultimate.shot?.waves?.length ?? Number(!!ultimate.shot),
      phase: ultimate.phase,
      lives: player.lives,
      score,
      charges: ultimate.charges,
      training: flightTutorial?.stage ?? null,
      focus: document.activeElement?.id,
      seen: localStorage.getItem("star-breaker-opening-seen"),
      suppressesPrimary: ultimateSuppressesFire(),
      movementPromptHidden: movementHint.hidden,
    }));
    assert.equal(launch.fighter, fighter);
    assert.equal(launch.difficulty, difficulty);
    assert.equal(launch.kind, fighter);
    assert.equal(launch.shots, { red: 1, blue: 5, yellow: 3 }[fighter]);
    assert.equal(launch.phase, "firing");
    assert.equal(launch.charges, 0);
    assert.equal(launch.score, 0);
    assert.equal(launch.lives, await page.evaluate(() => startingPlayerLives));
    assert.equal(launch.training, withTraining ? 1 : null);
    assert.equal(launch.focus, "game-canvas");
    assert.equal(launch.seen, "1");
    assert.equal(launch.suppressesPrimary, false);
    assert.equal(launch.movementPromptHidden, true);

    const targetHp = await page.evaluate(() => {
      nextBossTime = enemyCooldown = powerupCooldown = Infinity;
      spawnEnemy("armored");
      const target = enemies.at(-1);
      const x = viewport.width * .65, y = player.y;
      Object.assign(target, { x, previousX: x, y, previousY: y, baseY: y, speed: 0 });
      return target.hp;
    });
    const y = await page.evaluate(() => player.y);
    await page.keyboard.down("ArrowUp");
    await page.waitForFunction(before => player.y < before - 10, y);
    await page.keyboard.up("ArrowUp");
    await page.waitForFunction(() => ultimate.phase === "idle");
    assert.equal(await page.evaluate(() => enemies.at(-1)?.hp), targetHp);
    assert.equal(await page.evaluate(() => score), 0);
    await intro.waitFor({ state: "hidden" });

    await page.evaluate(() => showScreen("menu"));
    await openHangarPage(page, "manual");
    await replay.click();
    await intro.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await intro.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => state), "menu");
    await page.waitForFunction(() => document.activeElement?.id === "replay-intro-button");
    await closeHangarPage(page, "manual");
    await start.click();
    await page.waitForFunction(() => state === "battle");
    assert.equal(await intro.isVisible(), false);
    assert.deepEqual(errors, []);
    return { launch, controlsDuringHandoff: true, noTargetDamage: true, replayReturnsToMenu: true, replayIsOptional: true };
  } finally { await page.close(); }
}

async function testFirstSkip(browser) {
  const { page, errors } = await createPage(browser, root, false, { campaignOpening: true, flightTraining: true });
  try {
    const intro = page.locator("#campaign-opening");
    await page.locator("#start-button").click();
    await intro.waitFor({ state: "visible" });
    const pause = intro.locator(".opening-pause");
    await pause.click();
    assert.equal(await intro.getAttribute("data-paused"), "");
    await pause.click();
    assert.equal(await intro.getAttribute("data-paused"), null);
    await intro.locator(".opening-finish").click();
    await page.waitForFunction(() => state === "battle");
    assert.deepEqual(await page.evaluate(() => ({
      active: campaignOpening.active, seen: localStorage.getItem("star-breaker-opening-seen"),
      flightStage: flightTutorial?.stage, phase: ultimate.phase,
    })), { active: false, seen: "1", flightStage: 1, phase: "idle" });
    await page.reload();
    await page.locator("#start-button").click();
    await page.waitForFunction(() => state === "battle");
    assert.equal(await intro.isVisible(), false);
    assert.deepEqual(errors, []);
    return true;
  } finally { await page.close(); }
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const result = { fighters: {} };
    for (const fighter of ["red", "blue", "yellow"]) {
      result.fighters[fighter] = await testOpening(browser, fighter);
      console.log(fighter + " opening handoff passed");
    }
    result.firstSkip = await testFirstSkip(browser);
    fs.writeFileSync(path.join(out, "campaign-opening.json"), JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
