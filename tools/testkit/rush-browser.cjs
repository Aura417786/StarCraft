"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(process.argv[2]);
const evidence = path.resolve(process.argv[3]);
const origin = "https://star-breaker-rush.invalid";
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".ogg": "audio/ogg" };

async function main() {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route(origin + "/**", route => {
      const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
      const file = path.resolve(root, name);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        if (name !== "favicon.ico") errors.push("Missing " + name);
        return route.fulfill({ status: 404 });
      }
      return route.fulfill({ path: file, contentType: mime[path.extname(file)] });
    });
    await page.addInitScript(() => localStorage.setItem("star-breaker-language", "en"));
    await page.goto(origin);
    const guide = page.locator(".flight-guide-actions button").first();
    if (await guide.isVisible()) await guide.click();
    const openChallenges = () => page.locator('[data-sortie-console="challenges"]').click();
    await openChallenges();
    await page.locator("#rush-difficulty").selectOption("hard");
    await page.screenshot({ path: path.join(evidence, "rush-challenges.png") });
    const weeks = await page.evaluate(() => [
      weeklyRush(new Date("2026-11-09T00:00:00Z")),
      weeklyRush(new Date("2026-11-15T23:59:59Z")),
      weeklyRush(new Date("2026-11-16T00:00:00Z"))
    ]);
    assert.deepEqual(weeks[0], weeks[1]);
    assert.notEqual(weeks[0].seed, weeks[2].seed);

    await page.getByRole("button", { name: "Launch this week's seed" }).click();
    assert.equal(await page.evaluate(() => sortieStats.difficulty), "hard");
    assert.equal(await page.evaluate(() => sortieStats.seed), await page.evaluate(() => weeklyRush().seed));
    assert.deepEqual(await page.evaluate(() => sortieStats.weekly.rules), await page.evaluate(() => weeklyRush().rules));
    assert.equal(await page.evaluate(() => sortieStats.rules.drift !== 0 || sortieStats.rules.movement !== 1), true);
    await page.evaluate(() => showScreen("menu"));

    await openChallenges();
    await page.getByRole("button", { name: "Launch Boss Rush" }).click();
    assert.equal(await page.evaluate(() => sortieStats.difficulty), "hard");
    // Stage a loss at boss five, then continue entirely through the public menu.
    await page.evaluate(() => { bossDefeated = 4; pendingBossType = 4; player.lives = 0; endGame(false); });
    await page.getByRole("button", { name: "Practice from this boss (unranked)" }).waitFor();
    await page.reload();
    await openChallenges();
    const rankedBefore = await page.evaluate(() => sortieProfile.data.rushByDifficulty.hard);
    await page.getByRole("button", { name: /Practice from .*unranked/ }).click();
    await page.waitForFunction(() => boss?.type === 4, null, { timeout: 12000 });
    assert.deepEqual(await page.evaluate(() => ({ resumed: sortieStats.resumed, start: sortieStats.rushStart,
      waves: sortieAllowsWaves(), pickups: sortieAllowsPickups() })), { resumed: true, start: 4, waves: false, pickups: false });
    await page.screenshot({ path: path.join(evidence, "rush-resumed-boss-five.png") });
    await page.evaluate(() => { player.lives = 0; endGame(false); });
    assert.deepEqual(await page.evaluate(() => sortieProfile.data.rushByDifficulty.hard), rankedBefore);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(evidence, "rush.json"), JSON.stringify({ weeks, rankedBefore,
      resumedBoss: 5, resumeAfterReload: true, continuationUnranked: true, errors }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
