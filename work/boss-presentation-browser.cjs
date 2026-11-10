"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const output = process.argv[2] && path.resolve(process.argv[2]);
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".mp3": "audio/mpeg", ".ogg": "audio/ogg" };
const labels = ["entry", "rupture", "transform", "death"];
const frames = [.75, .63, .58, .72];

async function fixture(browser, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    let now = 1000, callback;
    window.requestAnimationFrame = next => { callback = next; return 1; };
    window.flightStep = (seconds = .025) => { now += seconds * 1000; callback(now); };
  });
  await page.route("https://presentation-qa.invalid/**", route => {
    const key = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
    const file = path.resolve(root, key);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return route.fulfill({ status: 404, body: "" });
    }
    return route.fulfill({ contentType: mime[path.extname(file)] || "application/octet-stream", path: file });
  });
  await page.goto("https://presentation-qa.invalid/");
  await page.locator(".flight-guide-actions button").click();
  await page.locator("#start-button").click();
  await page.evaluate(() => {
    window.setPresentationFixture = async type => {
      showScreen("battle");
      canvas.focus();
      nextBossTime = Infinity;
      battleTime = 65 + type * 64;
      shotCooldown = powerupCooldown = enemyCooldown = Infinity;
      shield.charges = ultimate.charges = 1;
      await preloadAlienBossArt(type).image.decode();
      spawnBoss(type);
      return boss.name;
    };
    window.runPresentationFrame = (kind, fraction) => {
      if (bossPresentation?.kind !== kind) throw new Error("Wrong fixture phase: " + kind);
      const start = performance.now();
      const scene = bossPresentation;
      const mark = scene.duration * fraction;
      const count = Math.max(0, Math.ceil((mark - scene.age) / .025));
      for (let i = 0; i < count; i++) flightStep();
      return (performance.now() - start) / Math.max(1, count);
    };
    window.finishPresentationFixture = kind => {
      const time = battleTime;
      const ship = [player.x, player.y, player.lives, shield.charges, ultimate.charges];
      if (isBattleActive()) throw new Error("Cinematic allowed battle steps");
      const scene = bossPresentation;
      const hp = boss?.hp;
      if (boss) applyBossHit({ damageLog: boss.healthLog + 10 });
      if (hp !== boss?.hp) throw new Error("Damage bypassed phase protection");
      if (requestShield() || requestUltimate() || toggleFiringStyle()) throw new Error("Cinematic allowed an ability or stance change");
      for (let frame = 0; frame < 220 && activeBossPresentation(); frame++) flightStep();
      if (activeBossPresentation()) throw new Error("Cinematic did not complete");
      if (battleTime !== time || ship.some((value, i) => value !== [player.x, player.y, player.lives, shield.charges, ultimate.charges][i])) {
        throw new Error("Cinematic advanced combat state");
      }
      if (kind === "entry") {
        if (boss.phase !== "recover") throw new Error("Missing normal fight");
        boss.hp = .501;
        applyBossHit({ damageLog: boss.healthLog + Math.log(.02) });
      } else if (kind === "rupture") {
        if (boss.phase !== "telegraph" || boss.alienAttack !== "pressure") throw new Error("Missing counterplay telegraph");
        if (bossHazards.some(hazard => hazard.age > 0) || bossProjectiles.length) throw new Error("Rupture did not hand off a clean warning");
        // Begin from a legal damageable recovery window after the phase's combat.
        boss.phase = "recover";
        boss.hp = .001;
        boss.damageBudgetAt = undefined;
        applyBossHit({ source: "ultimate", damageLog: boss.healthLog });
      } else if (kind === "transform") {
        if (!boss.finale || boss.finale.hazards.length || !isBattleActive()) throw new Error("Bad finale boundary");
        boss.hp = .000001;
        applyBossHit({ source: "ultimate", damageLog: boss.healthLog, finaleNode: boss.finale.activeNode });
        if (scoreDisplay.textContent === String(score).padStart(6, "0")) throw new Error("Reward revealed before collapse");
      } else {
        if (boss || bossDefeated !== scene.target.type + 1 || Number(scoreDisplay.textContent) !== score) throw new Error("Reward did not settle");
        if (scene.target.alienFinal ? state !== "over" : !evolution.pending) throw new Error("Wrong post-death screen");
      }
    };
  });
  return { context, page, errors };
}

async function run() {
  if (output) fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  try {
    const video = output && process.env.PRESENTATION_VIDEO === "1";
    const normal = await fixture(browser, { viewport: { width: 1280, height: 720 },
      ...(video ? { recordVideo: { dir: output, size: { width: 960, height: 540 } } } : {}) });
    const measured = [];
    for (let type = 0; type < 11; type++) {
      const { page } = normal;
      const name = await page.evaluate(type => setPresentationFixture(type), type);
      for (const [stage, kind] of labels.entries()) {
        if (video) {
          for (let frame = 1; frame <= 7; frame++) {
            await page.evaluate(([label, progress]) => runPresentationFrame(label, progress), [kind, frame * .08]);
            await page.waitForTimeout(40);
          }
        }
        const drawMs = await page.evaluate(([label, progress]) => runPresentationFrame(label, progress), [kind, frames[stage]]);
        const pathName = String(type + 1).padStart(2, "0") + "-" + kind + ".png";
        if (output && !video) await page.screenshot({ path: path.join(output, pathName) });
        if (video) {
          await page.waitForTimeout(75);
          for (const frame of [.76, .85, .94]) {
            await page.evaluate(([label, progress]) => runPresentationFrame(label, progress), [kind, frame]);
            await page.waitForTimeout(50);
          }
        }
        const timing = await page.evaluate(() => bossPresentation.duration);
        measured.push({ name, kind, seconds: timing, drawMs: +drawMs.toFixed(3) });
        await page.evaluate(kind => finishPresentationFixture(kind), kind);
      }
    }
    assert.deepEqual(normal.errors, []);
    const recording = normal.page.video();
    await normal.context.close();
    if (recording) await recording.saveAs(path.join(output, "boss-four-stage-review.webm"));

    const quiet = await fixture(browser, { viewport: { width: 640, height: 360 }, reducedMotion: "reduce" });
    await quiet.page.evaluate(() => {
      setVisualQuality("low", false);
      return setPresentationFixture(0);
    });
    await quiet.page.evaluate(() => runPresentationFrame("entry", .32));
    const initial = await quiet.page.evaluate(() => ({ age: bossPresentation.age, time: battleTime }));
    await quiet.page.locator("#sound-button").focus();
    await quiet.page.evaluate(() => { for (let i = 0; i < 75; i++) flightStep(); });
    assert.deepEqual(await quiet.page.evaluate(() => ({ age: bossPresentation.age, time: battleTime })), initial);
    await quiet.page.setViewportSize({ width: 800, height: 450 });
    await quiet.page.waitForFunction(() => viewport.width === 800);
    await quiet.page.locator("#game-canvas").focus();
    const state = await quiet.page.evaluate(() => {
      const before = context.getTransform();
      applyBossPresentationCamera(context);
      const after = context.getTransform();
      for (let i = 0; i < 5; i++) flightStep();
      return { sameCamera: before.a === after.a && before.e === after.e, age: bossPresentation.age,
        time: battleTime, width: viewport.width, arcs: bossFragmentAtlas.every(group => group.length === 24) };
    });
    assert.ok(state.age > initial.age);
    assert.deepEqual([state.sameCamera, state.time, state.width, state.arcs], [true, initial.time, 800, true]);
    const mode = await quiet.page.evaluate(() => firingStyle.mode);
    await quiet.page.locator("#stance-button").click();
    await quiet.page.evaluate(() => { flightStep(); flightStep(); });
    assert.equal(await quiet.page.evaluate(() => firingStyle.mode), mode);
    const playing = await quiet.page.evaluate(() => bossPresentation.age);
    assert.ok(playing > state.age);
    await quiet.page.keyboard.press("Escape");
    await quiet.page.locator("#pause-screen").waitFor({ state: "visible" });
    await quiet.page.evaluate(() => { for (let i = 0; i < 75; i++) flightStep(); });
    assert.equal(await quiet.page.evaluate(() => bossPresentation.age), playing);
    await quiet.page.keyboard.press("Escape");
    await quiet.page.evaluate(() => { flightStep(); flightStep(); });
    assert.ok(await quiet.page.evaluate(() => bossPresentation.age) > playing);
    await quiet.page.evaluate(() => showScreen("menu"));
    assert.equal(await quiet.page.evaluate(() => activeBossPresentation()), null);
    assert.deepEqual(quiet.errors, []);
    await quiet.context.close();

    if (output && !video) fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(measured, null, 2));
    console.log(JSON.stringify({ scenes: measured.length, reducedMotionPauseResize: true,
      drawMs: measured.map(item => item.drawMs).sort((a, b) => a - b).slice(-6), errors: 0 }));
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
