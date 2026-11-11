"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

async function main() {
  const game = path.resolve(process.argv[2]);
  const output = path.resolve(process.argv[3]);
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  try {
    const { page, errors } = await createPage(browser, game, false);
    const overlay = page.locator("#boss-scaling-qa");
    assert.equal(await overlay.isVisible(), false, "The standard URL does not display the overlay");
    await page.goto(new URL("?qa=1", page.url()).href);
    await overlay.waitFor({ state: "visible" });
    assert.equal(await overlay.textContent(), "POWER — k — HP×— TEMPO÷— SPD×— TTK —");
    await page.locator("#start-button").click();
    const scaling = await page.evaluate(() => {
      raiseWeaponFloor({ damageLevel: 19, rateLevel: 9, laneLevel: 4 });
      spawnBoss(5);
      return boss.scaling;
    });
    assert.ok(scaling.k > 1);
    const prefix = `POWER ${scaling.power.toFixed(0)} k ${scaling.k.toFixed(2)} HP×${scaling.hpMul.toFixed(2)} TEMPO÷${scaling.tempoMul.toFixed(2)} SPD×${scaling.speedMul.toFixed(2)} TTK `;
    await page.waitForFunction(prefix => document.querySelector("#boss-scaling-qa").textContent.startsWith(prefix), prefix);
    await page.waitForFunction(() => boss?.phase === "telegraph");
    const running = await overlay.textContent();
    assert.equal(await overlay.getAttribute("data-state"), "running");
    await page.screenshot({ path: path.join(output, "boss-scaling-overlay.png") });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => pauseView === "menu");
    const pausedAt = await page.evaluate(() => battleTime);
    await page.waitForTimeout(240);
    assert.equal(await page.evaluate(() => battleTime), pausedAt);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !pauseView);

    // Exercise the real clear-record hook with a staged clock. The separate
    // combat fixture measures actual fights and never uses this staged TTK.
    const recorded = await page.evaluate(() => {
      battleTime = boss.sortieStart.time + 41.24;
      defeatBoss(boss);
      return sortieStats.bossRecords.at(-1).seconds;
    });
    const finalLine = prefix + recorded.toFixed(1) + "s";
    await page.waitForFunction(line => document.querySelector("#boss-scaling-qa").textContent === line, finalLine);
    assert.equal(await overlay.getAttribute("data-state"), "cleared");
    await page.setViewportSize({ width: 320, height: 360 });
    const box = await overlay.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 320, "The QA row fits a 320px viewport");
    await page.evaluate(() => showScreen("menu"));
    await page.waitForFunction(() => document.querySelector("#boss-scaling-qa").dataset.state === "idle");
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "boss-scaling-overlay.json"), JSON.stringify({
      standardHidden: true, running, finalLine, stagedClearRecord: recorded, pauseFreezesClock: true, narrowViewportFits: true, errors,
    }, null, 2) + "\n");
    console.log(finalLine);
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
