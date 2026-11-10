"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const output = path.resolve(process.argv[2] || path.join(root, "work", "world-time-evidence"));
const origin = "https://world-time-qa.invalid";
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".mp3": "audio/mpeg", ".ogg": "audio/ogg" };

async function run() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 },
      recordVideo: { dir: output, size: { width: 1280, height: 720 } } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route(origin + "/**", route => {
      const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
      const file = path.resolve(root, name);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        return route.fulfill({ status: 404, body: "" });
      }
      return route.fulfill({ contentType: mime[path.extname(file)] || "application/octet-stream", path: file });
    });
    await page.goto(origin);
    await page.locator(".flight-guide-actions button").first().click();
    await page.locator("#start-button").click();
    await page.evaluate(() => {
      window.clockSamples = [];
      const pass = drawCombatPostProcessing;
      window.postProcessCosts = [];
      drawCombatPostProcessing = ctx => {
        if (!activeCombatLight()) return pass(ctx);
        const start = performance.now();
        pass(ctx);
        postProcessCosts.push(performance.now() - start);
      };
      function sample(time) {
        const scene = activeBossPresentation();
        if (scene) clockSamples.push({ kind: scene.kind, time, age: scene.age, real: scene.realAge,
          sky: battlefieldState.ambientClock, ship: shipVisuals.clock, lives: player.lives });
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
      nextBossTime = enemyCooldown = powerupCooldown = Infinity;
      ultimate.charges = 1;
      updateUltimateDisplay();
    });
    await page.keyboard.press("Space");
    await page.waitForFunction(() => ultimate.phase === "firing");
    await page.screenshot({ path: path.join(output, "ultimate-backdrop.png") });
    await page.waitForFunction(() => ultimate.phase === "idle");
    await page.evaluate(() => {
      battleTime = 65;
      shotCooldown = Infinity;
      spawnBoss(2);
    });
    await page.waitForFunction(() => boss && boss.phase === "recover");
    await page.evaluate(() => {
      // These existing shots are close enough to illustrate inert motion during the cue.
      for (let i = 0; i < 5; i++) addBossProjectile(boss.x - 125 - i * 60, boss.y - 110 + i * 45, -140, 20 - i * 8, { radius: 6 });
      beginAlienRupture(boss);
    });
    await page.waitForFunction(() => bossPresentation?.impact);
    await page.screenshot({ path: path.join(output, "rupture-spotlight.png") });
    await page.waitForFunction(() => !activeBossPresentation());
    await page.evaluate(() => { beginBossFinale(boss); });
    await page.waitForFunction(() => boss?.finale && !activeBossPresentation());
    await page.evaluate(() => { defeatBoss(boss); });
    await page.waitForFunction(() => bossPresentation?.impact);
    await page.screenshot({ path: path.join(output, "furnace-collapse.png") });
    await page.waitForFunction(() => evolution.pending);
    const report = await page.evaluate(() => {
      const ratios = {};
      for (const kind of ["rupture", "death"]) {
        const samples = clockSamples.filter(sample => sample.kind === kind);
        const slowFrames = [];
        for (let i = 1; i < samples.length; i++) {
          const before = samples[i - 1], after = samples[i];
          const delta = after.real - before.real;
          const ratio = (after.age - before.age) / delta;
          if (delta > 0 && Math.abs(ratio - .30) < 1e-5) {
            slowFrames.push({ ratio, sky: (after.sky - before.sky) / delta,
              ship: (after.ship - before.ship) / delta, lives: after.lives, delta });
          }
        }
        ratios[kind] = slowFrames;
      }
      const sorted = postProcessCosts.slice().sort((a, b) => a - b);
      return { ratios, postProcess: { frames: sorted.length, medianMs: sorted[Math.floor(sorted.length * .5)],
        p95Ms: sorted[Math.floor(sorted.length * .95)] } };
    });
    for (const slowFrames of Object.values(report.ratios)) {
      assert.ok(slowFrames.length >= 2);
      assert.ok(slowFrames.reduce((sum, frame) => sum + frame.delta, 0) > .23);
      for (const frame of slowFrames) {
        assert.ok(Math.abs(frame.sky - .30) < 1e-5 && Math.abs(frame.ship - .30) < 1e-5);
        assert.equal(frame.lives, 3);
      }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "native-raf-timing.json"), JSON.stringify(report, null, 2));
    const recording = page.video();
    await context.close();
    await recording.saveAs(path.join(output, "boss-world-time.webm"));
    console.log(JSON.stringify({ slowFrames: Object.fromEntries(Object.entries(report.ratios).map(([kind, frames]) => [kind, frames.length])),
      postProcess: report.postProcess, errors: errors.length }));
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
