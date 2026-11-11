#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

async function main() {
  const [root, output] = process.argv.slice(2);
  if (!root || !output) throw new Error("Usage: node training.cjs <Game folder> <evidence folder>");
  const game = path.resolve(root), evidence = path.resolve(output);
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || chromium.executablePath(), headless: true });
  try {
    const { page, errors } = await createPage(browser, game, false, { flightTraining: true });
    const start = Date.now();
    await page.locator("#start-button").click();
    await page.waitForFunction(() => flightTutorial?.stage === 1 && flightTutorial.cue);
    const original = await page.evaluate(() => ({ lives: player.lives, seed: sortieStats.seed, profile: JSON.stringify(sortieProfile.data) }));
    const shieldRefund = { zh: { instructions: await page.locator("#flight-training-copy").textContent() } };
    assert.match(shieldRefund.zh.instructions, /完美格挡会返还本次护盾/);
    await page.screenshot({ path: path.join(evidence, "training-shield.png") });
    // Deliberately accept the first shot. The actual collision offers corrective feedback without recording damage.
    await page.waitForFunction(() => flightTutorial?.hint === "guardLate");
    const noDamage = await page.evaluate(lives => player.lives === lives && !sortieStats.hitsTaken && battleTime === 0, original.lives);
    await page.waitForFunction(() => {
      const shot = flightTutorial?.projectile;
      if (!shot) return false;
      const time = (shot.x - player.x - player.width * .60 - shot.radius) / -shot.vx;
      return time <= .17 && time > .06;
    });
    await page.keyboard.press("v");
    await page.waitForFunction(() => shield.perfectUsed);
    shieldRefund.zh.feedback = await page.evaluate(() => ({ charges: shield.charges, energy: shield.energy,
      remaining: shield.remaining, count: shieldCount.textContent, label: shieldLabel.textContent,
      title: shieldPanel.title, status: statusMessage.textContent }));
    assert.equal(shieldRefund.zh.feedback.charges, 1, "The real V-key parry must refund the one training shield");
    assert.equal(shieldRefund.zh.feedback.count, "1 / 2");
    assert.match(shieldRefund.zh.feedback.label, /已返还护盾/);
    assert.match(shieldRefund.zh.feedback.status, /返还 1 次护盾/);
    assert.match(shieldRefund.zh.feedback.title, /返还本次护盾/);
    assert.ok(shieldRefund.zh.feedback.remaining > 0 && shieldRefund.zh.feedback.remaining <= 2);
    await page.screenshot({ path: path.join(evidence, "training-refund-zh.png") });
    await page.waitForFunction(() => flightTutorial?.stage === 2);
    const caught = await page.evaluate(() => shield.perfectUsed && shield.charges === 1
      && !sortieStats.hitsTaken && ultimate.charges === 1);
    await page.screenshot({ path: path.join(evidence, "training-special.png") });
    await page.keyboard.press("Space");
    await page.waitForFunction(() => flightTutorial?.stage === 3 && evolution.pending);
    const specialHit = await page.evaluate(() => flightTutorial.hitTarget && !enemies.includes(flightTutorial.target));
    await page.waitForTimeout(240);
    await page.screenshot({ path: path.join(evidence, "training-evolution.png") });
    await page.keyboard.press("1");
    await page.waitForFunction(() => !flightTutorial && battleTime > 0);
    const completed = await page.evaluate(original => !evolution.pending && !evolution.pierce && player.lives === original.lives && !score && !kills
      && sortieStats.seed === original.seed && JSON.stringify(sortieProfile.data) === original.profile && localStorage.getItem(flightTrainingKey) === "1", original);
    const elapsedSeconds = (Date.now() - start) / 1000;

    await page.reload({ waitUntil: "load" });
    await page.locator("#start-button").click();
    await page.waitForFunction(() => state === "battle" && battleTime > .2);
    const noRepeat = await page.evaluate(() => !flightTutorial);
    await page.evaluate(() => showScreen("menu"));
    await page.locator('[data-sortie-console="settings"]').click();
    await page.locator(".sortie-difficulty-table tbody tr").first().waitFor();
    const difficultyRows = await page.locator(".sortie-difficulty-table tbody tr").allTextContents();
    await page.getByRole("button", { name: /重玩实战训练|Replay flight training/ }).click();
    await page.waitForFunction(() => flightTutorial?.replay === true);
    await page.locator("#flight-training-skip").click();
    const replaySkip = await page.evaluate(() => state === "menu" && !flightTutorial && document.querySelector("#flight-training").hidden);

    await page.setViewportSize({ width: 640, height: 360 });
    await page.evaluate(() => { setGameLanguage("en"); startBattleWithSound({ flightTraining: "replay" }); });
    await page.waitForFunction(() => flightTutorial?.cue);
    shieldRefund.en = { instructions: await page.locator("#flight-training-copy").textContent() };
    assert.match(shieldRefund.en.instructions, /A Perfect Guard refunds this shield use/);
    await page.screenshot({ path: path.join(evidence, "training-compact-en.png") });
    await page.waitForFunction(() => {
      const shot = flightTutorial?.projectile;
      if (!shot) return false;
      const time = (shot.x - player.x - player.width * .60 - shot.radius) / -shot.vx;
      return time <= .17 && time > .06;
    });
    await page.keyboard.press("v");
    await page.waitForFunction(() => shield.perfectUsed);
    shieldRefund.en.feedback = await page.evaluate(() => ({ charges: shield.charges, energy: shield.energy,
      remaining: shield.remaining, count: shieldCount.textContent, label: shieldLabel.textContent,
      title: shieldPanel.title, status: statusMessage.textContent }));
    assert.equal(shieldRefund.en.feedback.charges, 1, "The English replay must refund the actual V-key shield use too");
    assert.equal(shieldRefund.en.feedback.count, "1 / 2");
    assert.match(shieldRefund.en.feedback.label, /Shield refunded/);
    assert.match(shieldRefund.en.feedback.status, /One shield use refunded/);
    assert.match(shieldRefund.en.feedback.title, /refund this shield use/);
    assert.doesNotMatch(Object.values(shieldRefund.en.feedback).join(" "), /[\u3400-\u9fff]/);
    await page.screenshot({ path: path.join(evidence, "training-refund-en.png") });
    await page.waitForFunction(() => flightTutorial?.stage === 2);
    shieldRefund.en.retainedInNextStep = await page.evaluate(() => shield.charges === 1);
    assert.equal(shieldRefund.en.retainedInNextStep, true);
    await page.locator("#flight-training-skip").focus();
    await page.keyboard.press("Enter");
    const keyboardSkip = await page.evaluate(() => state === "menu" && !flightTutorial);

    const modes = await page.evaluate(() => {
      flightTrainingSeen = false;
      const isolation = [];
      for (const mode of ["rush", "practice", "daily"]) {
        startBattleWithSound({ mode });
        isolation.push(sortieMode() === mode && !flightTutorial);
      }
      showScreen("battle", { difficulty: "abyss" });
      saveSortieSetting("extended", true);
      saveSortieSetting("extended", false);
      shakePreference = "off"; syncSortieEligibility(); shakePreference = "low"; syncSortieEligibility();
      toggleCombatMotion(); toggleCombatMotion();
      const result = completeSortie({ abandoned: true });
      return { isolation, assisted: result.assisted, flags: result.assists, abyssWarning: sortieWarningBonus() };
    });
    const result = { noDamage, caught, shieldRefund, specialHit, completed, elapsedSeconds, noRepeat, replaySkip, keyboardSkip, difficultyRows, ...modes };
    for (const key of ["noDamage", "caught", "specialHit", "completed", "noRepeat", "replaySkip", "keyboardSkip", "assisted"]) assert.equal(result[key], true, key);
    assert.ok(elapsedSeconds < 180);
    assert.equal(difficultyRows.length, 3);
    assert.deepEqual(result.isolation, [true, true, true]);
    assert.deepEqual(result.flags, { extendedWarning: true, noScreenShake: true, reducedMotion: true });
    assert.equal(result.abyssWarning, 0);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(evidence, "training.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
