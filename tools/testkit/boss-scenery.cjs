"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

const root = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
const expected = ["orbit", "wreck", "cinder", "silk", "belt", "prism", "tempest", "bloom", "rift", "citadel", "confluence"];

async function waitForArena(page, type) {
  await page.waitForFunction(id => boss?.type === id && battlefieldState.arenaBlend === 1
    && sceneryActiveSector() === bossScenerySectors[id], type, { timeout: 20000 });
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const { page, errors } = await createPage(browser, root, false, {
      pageOptions: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    });
    const records = [];
    for (let type = 0; type < expected.length; type++) {
      await page.evaluate(type => {
        const options = type === 0 ? { mode: "campaign" } : type === 6
          ? { mode: "rush", rushStart: type } : { mode: "practice", bossType: type };
        showScreen("battle", options);
        setVisualQuality("high", false);
        shotCooldown = enemyCooldown = powerupCooldown = Infinity;
        battleTime = Math.max(0, nextBossTime - .25);
      }, type);
      await waitForArena(page, type);
      await page.waitForFunction(() => !isBossPresentationPlaying(), null, { timeout: 12000 });
      const scene = await page.evaluate(() => {
        const index = sceneryActiveSector();
        const { id, name, asset } = battlefieldSectors[index];
        const ready = sceneryCache.get(index)?.ready ?? false;
        return { id, name, asset, ready, index, boss: boss.name, mode: sortieStats.mode };
      });
      assert.equal(scene.id, expected[type]);
      assert.equal(scene.ready, true);
      const filename = `${String(type + 1).padStart(2, "0")}-${scene.id}.png`;
      await page.screenshot({ path: path.join(out, filename) });
      const result = await page.evaluate(type => {
        battlefieldState.clock = (type + 6) * sceneryRules.interval + 70;
        scenerySyncJourney();
        const before = { sector: sceneryJourney().current, next: sceneryJourney().next, blend: sceneryJourney().blend };
        const skin = sceneryActiveSector();
        const size = sceneryCache.size;
        beginBossFinale(boss);
        return { stage: boss.finale ? sceneryActiveSector() : null, skin, before, size, limit: sceneryRules.maxImages };
      }, type);
      assert.equal(result.skin, scene.index, "Flight time should not replace the Boss's backdrop");
      assert.equal(result.stage, scene.index, "Finale should keep the same backdrop");
      assert.ok(result.before.sector < 5 && result.before.next < 5 && result.before.blend === .5,
        "Physical itinerary must retain its original five sectors and crossfade clock");
      assert.ok(result.size <= result.limit);
      const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, scene.asset))).digest("hex");
      records.push({ ...scene, screenshot: filename, sha256: hash, ...result });
    }
    assert.equal(new Set(records.map(record => record.sha256)).size, expected.length, "Each boss must have a unique panorama");

    const retryType = 7;
    await page.evaluate(type => {
      showScreen("battle", { mode: "practice", bossType: type });
      battleTime = Math.max(0, nextBossTime - .25);
    }, retryType);
    await waitForArena(page, retryType);
    await page.waitForFunction(() => !isBossPresentationPlaying());
    await page.keyboard.press("Escape");
    await page.locator(".pause-sector-route [aria-current=location]").waitFor({ state: "visible" });
    assert.equal(await page.locator(".pause-sector-route [aria-current=location]").textContent(), records[retryType].name);
    await page.waitForTimeout(120);
    const pausedAt = await page.evaluate(() => battlefieldState.arenaAge);
    await page.waitForTimeout(160);
    assert.equal(await page.evaluate(() => battlefieldState.arenaAge), pausedAt);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !pauseView);
    await page.evaluate(() => { player.lives = 0; endGame(); });
    await page.locator("#boss-retry-button").click();
    await waitForArena(page, retryType);
    assert.equal(await page.evaluate(() => battlefieldSectors[sceneryActiveSector()].id), expected[retryType]);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, "boss-scenery.json"), JSON.stringify({
      records, checks: { uniquePlates: true, preservedFlightRoute: true, pauseRetainsArena: true, retryMatches: true },
      errors,
    }, null, 2) + "\n");
    console.log("Boss scenery: 11 unique rendered arenas; campaign, practice, Rush, finale, pause and retry verified.");
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
