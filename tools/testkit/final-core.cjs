"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

async function main() {
  const root = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  const report = { checks: [], input: "Chrome keyboard events; focus loss dispatch tests exercise handlers, not a human Alt-Tab." };
  try {
    const { page, errors } = await createPage(browser, root, false);
    await page.locator("#start-button").click();
    await page.waitForFunction(() => battleTime > .1);
    const initial = await page.evaluate(() => ({ y: player.y, hp: player.lives }));
    await page.keyboard.down("ArrowUp"); await page.waitForTimeout(130); await page.keyboard.up("ArrowUp");
    assert.ok(await page.evaluate(y => player.y < y - 8, initial.y));
    await page.keyboard.down("KeyC"); await page.waitForTimeout(210);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForFunction(() => pauseView === "menu" && !pauseScreen.hidden);
    const frozen = await page.evaluate(() => ({ at: battleTime, x: player.x, y: player.y, hp: player.lives,
      enemies: enemies.map(e => ({ x: e.x, y: e.y, hp: e.hp })), keys: pressedKeys.size, charge: fighterCombat.redHeld }));
    assert.equal(frozen.keys, 0); assert.equal(frozen.charge, false);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => battleTime), frozen.at, "refocusing must not resume without confirmation");
    assert.deepEqual(await page.evaluate(() => enemies.map(e => ({ x: e.x, y: e.y, hp: e.hp }))), frozen.enemies);
    assert.match(await page.locator("#pause-description").textContent(), /自动暂停|automatically/);
    await page.screenshot({ path: path.join(out, "focus-paused.png") });
    await page.locator("#pause-resume").click();
    await page.keyboard.up("KeyC");
    await page.waitForFunction(time => battleTime > time + .1, frozen.at);
    report.checks.push({ focusPause: true, resumedByButton: true, frozen, stuckKeys: false });

    await page.keyboard.press("Escape");
    await page.locator("#pause-settings").click();
    await page.locator("#pause-controls").click();
    await page.locator("#flight-controls-reset").click();
    await page.evaluate(() => setGameLanguage("en"));
    assert.equal(await page.locator("#flight-binding-status").textContent(), "Default keys restored.");
    await page.locator('[data-flight-binding="shield"]').click();
    await page.keyboard.press("KeyJ");
    assert.match(await page.locator("#flight-binding-status").textContent(), /Main weapon/);
    await page.evaluate(() => setGameLanguage("zh-CN"));
    assert.match(await page.locator("#flight-binding-status").textContent(), /主武器/);
    await page.keyboard.press("Escape");
    await page.locator("#flight-controls-close").click();
    report.checks.push({ noticeRetranslates: true, conflictAndCancel: true });

    const eligible = await page.evaluate(() => {
      showScreen("menu");
      shakePreference = "off"; reduceCombatMotion = true; sortieSettings.extended = false;
      startBattleWithSound({ mode: "campaign", difficulty: "veteran", seed: 4225 });
      const fresh = { assisted: sortieStats.assisted, flags: { ...sortieStats.assists } };
      syncSortieEligibility();
      const during = sortieStats.assisted;
      sortieSettings.extended = true; syncSortieEligibility();
      const assistedOn = sortieStats.assisted;
      sortieSettings.extended = false; syncSortieEligibility();
      const remains = sortieStats.assisted;
      return { fresh, during, assistedOn, remains };
    });
    assert.equal(eligible.fresh.assisted, false); assert.equal(eligible.during, false);
    assert.equal(eligible.fresh.flags.reducedMotion, true); assert.equal(eligible.fresh.flags.noScreenShake, true);
    assert.equal(eligible.assistedOn, true); assert.equal(eligible.remains, true);
    report.checks.push({ eligibility: eligible });

    const oldRecord = await page.evaluate(() => {
      showScreen("menu");
      const old = JSON.stringify(sortieProfile.data.assisted);
      startBattleWithSound({ mode: "campaign", difficulty: "veteran", seed: 4225 });
      const formal = !sortieStats.assisted;
      return { formal, oldPreserved: JSON.stringify(sortieProfile.data.assisted) === old };
    });
    assert.equal(oldRecord.formal, true); assert.equal(oldRecord.oldPreserved, true);
    report.checks.push({ oldRecord });

    await page.evaluate(() => {
      window.finalPad = { index: 0, connected: true, mapping: "standard", axes: [.7, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
      Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [window.finalPad] });
    });
    await page.waitForFunction(() => flightPad.index === 0 && flightPad.x > 0);
    await page.evaluate(() => { window.finalPad = null; });
    await page.waitForFunction(() => pauseView === "menu");
    assert.equal(await page.evaluate(() => flightPad.x), 0);
    assert.match(await page.locator("#pause-description").textContent(), /断开|disconnected/);
    await page.locator("#pause-resume").click();
    await page.keyboard.down("ArrowDown"); await page.waitForTimeout(100); await page.keyboard.up("ArrowDown");
    assert.equal(await page.evaluate(() => isBattleActive()), true);
    report.checks.push({ simulatedControllerLoss: "paused; keyboard resume works", physicalController: "not available / not tested" });
    assert.deepEqual(errors, []);
    report.errors = errors;
    fs.writeFileSync(path.join(out, "final-core.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
