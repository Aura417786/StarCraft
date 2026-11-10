"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
const origin = "https://star-breaker-scene.invalid";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".ogg": "audio/ogg", ".mp4": "video/mp4" };

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true,
    args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out } });
    const video = page.video();
    const errors = [];
    page.on("pageerror", error => errors.push(error.stack));
    await page.route(origin + "/**", route => {
      const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
      const file = path.resolve(root, name);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        if (name !== "favicon.ico") errors.push("Missing " + name);
        return route.fulfill({ status: 404 });
      }
      return route.fulfill({ path: file, contentType: types[path.extname(file)] });
    });
    const shot = name => page.screenshot({ path: path.join(out, name + ".png") });
    await page.addInitScript(() => {
      localStorage.setItem("star-breaker-guide-seen", "1");
      localStorage.setItem("star-breaker-flight-training", "1");
    });
    await page.goto(origin);
    const guide = page.locator(".flight-guide-actions button").first();
    if (await guide.isVisible()) await guide.click();
    await page.locator("#start-button").click();
    await page.evaluate(() => {
      if (typeof skipFlightTutorial === "function") skipFlightTutorial();
      battlefieldState.clock = 71;
      scenerySyncJourney();
      nextBossTime = enemyCooldown = shotCooldown = powerupCooldown = Infinity;
      spawnBoss(2);
      resetBossPresentation();
      Object.assign(boss, bossArena(2), { phase: "recover", phaseTime: -900, age: 1 });
      beginFlightRadio("incoming", 0, 3.05);
    });
    const starting = await page.evaluate(() => battlefieldState.clock);
    const sampled = [];
    for (let index = 0; index < 6; index++) {
      if (index) await page.waitForFunction(time => battlefieldState.clock > time, starting + index * 2);
      const sample = await page.evaluate(() => {
        const location = sceneryJourney();
        return { time: battlefieldState.clock, current: location.current, blend: location.blend,
          next: location.next, radio: document.querySelector(".radio-speaker").textContent,
          loaded: [...sceneryCache.values()].filter(asset => asset.ready).map(asset => asset.asset) };
      });
      sampled.push(sample);
      await shot("scene-" + index);
    }
    assert.ok(sampled.at(-1).time - starting >= 10);
    assert.equal(sampled.at(-1).current, 1);
    assert.ok(sampled.some(sample => sample.radio.includes("母巢")));
    assert.ok(sampled.some(sample => sample.radio.includes("救援")));
    await page.evaluate(() => {
      sortieStats.bossRecords = bossTypes.map((_, type) => ({ type, seconds: 42, hitCount: Number(type % 4 === 0) }));
      endGame(true);
    });
    await page.waitForFunction(() => campaignVictory?.age > 5.7);
    await shot("epilogue-1-gate");
    await page.waitForFunction(() => campaignVictory?.age > 8.6);
    await shot("epilogue-2-crossing");
    await page.waitForFunction(() => campaignVictory?.age > 14.4);
    await shot("epilogue-3-star-map");
    await page.locator("#campaign-victory-report").waitFor();
    assert.equal(await page.locator(".campaign-boss-card[data-cleared='true']").count(), 11);
    assert.equal(await page.locator("#battle-screen").isVisible(), false);
    assert.equal(await page.locator("#game-over-screen").isVisible(), false);
    await shot("epilogue-4-report");
    assert.deepEqual(errors, []);
    await page.close();
    await video.saveAs(path.join(out, "scene-epilogue.webm"));
    fs.writeFileSync(path.join(out, "scene.json"), JSON.stringify({ sampled,
      routeNodes: 11, reportCards: 11, runtimeErrors: errors, browser: browser.version() }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
