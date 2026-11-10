"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const output = process.argv[2] && path.resolve(process.argv[2]);
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".mp3": "audio/mpeg", ".ogg": "audio/ogg" };
const configurations = [[1440, 900, "zh-CN"], [1280, 720, "en"], [640, 450, "zh-CN"], [640, 360, "en"]];

async function run() {
  if (output) fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  const measurements = [];
  try {
    for (const [width, height, locale] of configurations) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.addInitScript(language => {
        localStorage.setItem("star-breaker-language", language);
        window.requestAnimationFrame = () => 0;
      }, locale);
      await page.route("https://combat-readability.invalid/**", route => {
        const key = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
        const file = path.resolve(root, key);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
          return route.fulfill({ status: 404, body: "" });
        return route.fulfill({ contentType: mime[path.extname(file)] || "application/octet-stream", path: file });
      });
      await page.goto("https://combat-readability.invalid/");
      await page.locator(".flight-guide-actions button").click();
      await page.locator("#start-button").click();
      await page.evaluate(async () => {
        await preloadAlienBossArt(5).image.decode();
        spawnBoss(5);
        resetBossPresentation();
        Object.assign(boss, bossArena(), { phase: "recover", phaseTime: 0, hp: .79, displayHp: .92, hitFlash: .08 });
        bossHitGrace = 0;
        setBossMessage(bossStageTitle(boss), tr("激光蓄力 · 离开扫描路径", "Beam charging · Leave the scan path"));
        addBossProjectile(viewport.width * .45, viewport.height * .58, -500, 0, { glyph: "orb", radius: 12 });
        addBossProjectile(viewport.width * .54, viewport.height * .50, -520, 125, { glyph: "thread", radius: 12 });
        addBossProjectile(viewport.width * .63, viewport.height * .44, -570, -60, { glyph: "prism", radius: 12, reflect: true });
        addBossHazard("beam", { y: viewport.height * .68, right: viewport.width * .87,
          thickness: 20, warning: 1.8, duration: .45, age: 1.45 });
        addBossHazard("ring", { x: viewport.width * .80, y: viewport.height * .65,
          radius: viewport.height * .19, thickness: 16, warning: 1.4, duration: .8, age: 1.74, material: "glass" });
        drawFrame(1000);
      });
      const layout = await page.evaluate(() => {
        const dock = document.querySelector("#boss-hud").getBoundingClientRect();
        const track = document.querySelector("#boss-track");
        const intersection = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
          * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const occupied = Array.from(document.querySelectorAll(".hud > div, .weapon-readout, .brand, .header-actions"));
        return { language: document.documentElement.lang, x: dock.x, y: dock.y, w: dock.width,
          h: dock.height, meterHeight: track.offsetHeight, overlaps: occupied.map(node => intersection(dock, node.getBoundingClientRect())),
          actionOverlap: intersection(document.querySelector(".battle-actions").getBoundingClientRect(),
            document.querySelector(".momentum-hud").getBoundingClientRect()),
          stage: document.querySelector("#boss-stage").textContent, shell: document.querySelector("#boss-shell-life").textContent,
          core: document.querySelector("#boss-core-life").textContent, hit: document.querySelector("#boss-health").dataset.hit };
      });
      assert.equal(layout.language, locale);
      assert.ok(layout.y + layout.h < height / 2 && layout.x >= 0 && layout.x + layout.w <= width, JSON.stringify(layout));
      assert.ok(Math.abs(layout.x + layout.w / 2 - width / 2) < 1);
      assert.ok(layout.meterHeight >= 12);
      assert.deepEqual(layout.overlaps, [0, 0, 0, 0, 0], JSON.stringify(layout));
      assert.equal(layout.actionOverlap, 0, JSON.stringify(layout));
      assert.match(layout.shell, /58%/);
      assert.match(layout.core, /100%/);
      assert.equal(layout.hit, "true");
      if (output) await page.screenshot({ path: path.join(output, `armor-${width}x${height}-${locale}.png`) });

      const geometry = await page.evaluate(() => {
        const sample = document.createElement("canvas");
        sample.width = sample.height = 81;
        const ctx = sample.getContext("2d", { willReadFrequently: true });
        const stats = [];
        for (const glyph of ["orb", "thread", "prism"]) {
          ctx.clearRect(0, 0, sample.width, sample.height);
          const shot = { glyph, x: 40, y: 40, vx: -460, vy: 110, radius: 12 };
          drawHostileProjectile(ctx, shot, "#67dcff", true);
          const pixels = ctx.getImageData(0, 0, sample.width, sample.height).data;
          let classified = 0, same = 0;
          for (let y = 10; y <= 70; y++) for (let x = 10; x <= 70; x++) {
            const alpha = pixels[(x + y * sample.width) * 4 + 3];
            if (alpha >= 8 && alpha <= 247) continue; // Canvas antialiasing is a transition pixel.
            const point = { x: x + .5, y: y + .5, height: .001 };
            same += Number(hostileShotHitsHull(shot, point) === (alpha > 247));
            classified++;
          }
          stats.push({ glyph, classified, agreement: same / classified });
        }
        const swept = { glyph: "thread", radius: 10, previousX: 140, previousY: 100,
          x: 60, y: 100, vx: -1200, vy: 0 };
        const moving = { x: 100, y: 140, previousX: 100, previousY: 60, height: 10 };
        const crossing = hostileShotHitsHull(swept, moving);
        moving.previousY = moving.y = 109;
        const nearMiss = !hostileShotHitsHull(swept, moving);
        const beam = bossHazards[0], ring = bossHazards[1];
        player.x = beam.right / 2; player.y = beam.y;
        const chargingSafe = !alienHazardHitsPlayer(beam);
        beam.age = beam.warning + .1;
        const beamCenter = alienHazardHitsPlayer(beam);
        player.x = beam.right + player.height * .16 + 1;
        const beamEndpoint = !alienHazardHitsPlayer(beam);
        player.x = ring.x; player.y = ring.y;
        const safeRingCenter = !alienHazardHitsPlayer(ring);
        player.x += alienRingRadius(ring, signatureProgress(ring));
        const ringBoundary = alienHazardHitsPlayer(ring);
        player.x = player.previousX = viewport.width * .3;
        player.y = player.previousY = viewport.height * .5;
        const initialLives = player.lives;
        const hullRadius = player.height * .16;
        clearAlienThreats();
        addBossProjectile(player.x, player.y + hullRadius + 7.5, -500, 0, { glyph: "thread", radius: 10 });
        updateBossDamage();
        const liveMiss = player.lives === initialLives;
        clearAlienThreats();
        addBossProjectile(player.x + hullRadius + 15, player.y, -500, 0, { glyph: "thread", radius: 10 });
        updateBossDamage();
        const liveHit = player.lives === initialLives - 1;
        return { stats, crossing, nearMiss, chargingSafe, beamCenter, beamEndpoint, safeRingCenter, ringBoundary, liveMiss, liveHit };
      });
      for (const sample of geometry.stats) assert.ok(sample.agreement >= .99, JSON.stringify(sample));
      assert.ok(Object.entries(geometry).filter(([key]) => key !== "stats").every(([, value]) => value === true), JSON.stringify(geometry));

      await page.evaluate(() => {
        clearAlienThreats();
        Object.assign(boss, { hp: .24, displayHp: .3, hitFlash: 0, enraged: true, alienAttack: "pressure" });
        setBossMessage(bossStageTitle(boss), tr("核心外露 · 反击窗口", "Core exposed · Counter window"));
        drawFrame(1000);
      });
      assert.match(await page.locator("#boss-core-life").textContent(), /48%/);
      assert.match(await page.locator("#boss-stage").textContent(), /^II ·/);
      if (output && width === 1280) await page.screenshot({ path: path.join(output, "exposed-core.png") });
      await page.evaluate(() => {
        beginBossFinale(boss);
        boss.finale.age = boss.finale.transform;
        resetBossPresentation();
        boss.hp = .68;
        drawFrame(1000);
      });
      assert.match(await page.locator("#boss-stage").textContent(), /^III ·/);
      assert.match(await page.locator("#boss-core-life").textContent(), /68%/);
      assert.equal(await page.locator("#boss-shell-life").isVisible(), false);
      if (output && width === 1280) await page.screenshot({ path: path.join(output, "finale-core.png") });
      assert.deepEqual(errors, []);
      measurements.push({ width, height, layout, geometry, errors });
      await page.close();
    }
    if (output) fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(measurements, null, 2));
    console.log(JSON.stringify(measurements));
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
