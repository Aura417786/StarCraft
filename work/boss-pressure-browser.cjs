"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const output = process.argv[2] ? path.resolve(process.argv[2]) : null;
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".jpg": "image/jpeg" };

async function play(browser, width, height, steering) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.stack));
  await page.addInitScript(() => {
    let scheduled, now = 1000;
    window.requestAnimationFrame = callback => { scheduled = callback; return 1; };
    window.stepFlight = frames => {
      for (let index = 0; index < frames; index++) {
        now += 1000 / 40;
        scheduled(now);
      }
    };
  });
  await page.route("https://pressure-qa.invalid/**", route => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
    const file = path.resolve(root, pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return route.fulfill({ status: 404, body: "" });
    }
    return route.fulfill({ contentType: mime[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) });
  });
  await page.goto("https://pressure-qa.invalid/");
  await page.locator(".flight-guide-actions button").click();
  await page.locator("#start-button").click();
  await page.evaluate(async () => {
    await preloadAlienBossArt(0).image.decode();
    battleTime = 65;
    nextBossTime = 65;
    enemyCooldown = powerupCooldown = Infinity;
    updateBossEncounter(0);
    Object.assign(boss, bossArena(0), { phase: "recover", age: 5, phaseTime: 0, hp: .51 });
    player.y = player.previousY = alienLane(.10);
    bossHitGrace = 0;
    shotCooldown = 999;
    applyBossHit({ damageLog: boss.healthLog + Math.log(.03) });
    stepFlight(21);
  });
  assert.equal(await page.locator("#game-app").getAttribute("data-boss-phase"), "rupture");
  if (output && width === 1280 && steering) {
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, "commercial-brood-rupture.png") });
  }
  await page.evaluate(() => stepFlight(29));
  assert.equal(await page.locator("#game-app").getAttribute("data-boss-phase"), "frenzy");
  const opening = await page.evaluate(() => {
    const tide = bossHazards.find(hazard => hazard.kind === "tide");
    return { bossHP: boss.hp, guarded: alienRuptureGuard(boss), gap: tide.gapY, y: player.y };
  });
  assert.equal(opening.guarded, true);
  assert.ok(opening.bossHP < .5 && opening.gap > opening.y);
  if (steering) {
    await page.keyboard.down("ArrowDown");
    for (let step = 0; step < 34; step++) {
      const reached = await page.evaluate(y => { stepFlight(1); return player.y >= y - 6; }, opening.gap);
      if (reached) break;
    }
    await page.keyboard.up("ArrowDown");
  }
  await page.evaluate(() => {
    while (boss.phase === "telegraph" || boss.phaseTime < .53) stepFlight(1);
  });
  if (steering) {
    await page.keyboard.down("ArrowRight");
    await page.evaluate(() => stepFlight(34));
    await page.keyboard.up("ArrowRight");
  } else await page.evaluate(() => stepFlight(34));
  if (output && width === 1280 && steering)
    await page.screenshot({ path: path.join(output, "commercial-brood-countercurrent.png") });
  const result = await page.evaluate(() => {
    const split = bossHazards.some(area => area.kind === "tide" && area.direction === 1)
      && bossHazards.some(area => area.kind === "tide" && area.direction === -1);
    while (boss.phase === "attack") stepFlight(1);
    return { split, lives: player.lives, phase: boss.phase, visible: app.dataset.bossPhase };
  });
  assert.equal(result.phase, "recover");
  assert.equal(result.visible, "recover");
  assert.equal(result.split, true);
  assert.deepEqual(errors, []);
  await page.close();
  return result.lives;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  try {
    for (const [width, height] of [[1280, 720], [640, 450], [640, 360]]) {
      const saved = await play(browser, width, height, true);
      const lost = await play(browser, width, height, false);
      assert.equal(saved, 3, `${width}×${height} moving into the corridor avoids damage`);
      assert.ok(lost < saved, `${width}×${height} the same cast punishes standing still`);
      console.log(`${width}×${height}: after both tidal fronts, stationary pilot ${lost} lives, steering pilot ${saved} lives`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

