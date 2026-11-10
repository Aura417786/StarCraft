"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const output = process.argv[2] ? path.resolve(process.argv[2]) : null;
const record = output && process.argv.includes("--record");
const site = "https://flight-ui-qa.invalid/";
const mime = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".jpg": "image/jpeg", ".mp3": "audio/mpeg",
};

async function openFlight(page) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.stack));
  await page.addInitScript(() => {
    let callback, now = 1000;
    window.requestAnimationFrame = draw => { callback = draw; return 1; };
    window.stepFlight = (frames, milliseconds = 25) => {
      for (let index = 0; index < frames; index++) { now += milliseconds; callback(now); }
    };
  });
  await page.route(site + "**", route => {
    const key = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
    const file = path.resolve(root, key);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return route.fulfill({ status: 404, body: "" });
    }
    return route.fulfill({ contentType: mime[path.extname(file)] || "application/octet-stream", path: file });
  });
  await page.goto(site);
  await page.locator(".flight-guide-actions button").click();
  return errors;
}

const battleSnapshot = page => page.evaluate(() => ({
  state, time: battleTime, score, ship: [player.x, player.y, player.lives],
  boss: boss && [boss.x, boss.y, boss.age, boss.phaseTime],
  enemies: enemies.map(item => [item.x, item.y]),
  bullets: bullets.map(item => [item.x, item.y]),
  clock: combatEffects.clock,
  particles: combatEffects.particles.map(item => [item.x, item.y, item.age]),
}));

async function screenshot(page, name) {
  if (output) await page.screenshot({ path: path.join(output, name), animations: "disabled" });
}

async function checkPause(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ...(record ? { recordVideo: { dir: output, size: { width: 1280, height: 720 } } } : {}),
  });
  const page = await context.newPage();
  const video = page.video();
  try {
    const errors = await openFlight(page);
    await page.locator("#start-button").click();
    await page.evaluate(() => {
      battleTime = 55;
      score = 4200;
      scoreDisplay.textContent = String(score).padStart(6, "0");
      spawnBoss(0);
      Object.assign(boss, bossArena(0), { phase: "recover", phaseTime: 0 });
      spawnEnemy("armored");
      combatBurst(680, 430, 2.3);
      stepFlight(8);
    });
    const before = await battleSnapshot(page);
    assert.ok(before.boss && before.enemies.length && before.bullets.length && before.particles.length);
    if (record) await page.waitForTimeout(700);
    await page.locator("#menu-button").click();
    assert.equal(await page.locator("#pause-title").innerText(), "返回机库？");
    assert.match(await page.locator("#pause-description").innerText(), /进度将丢失/);
    assert.equal(await page.locator("#pause-cancel").evaluate(button => document.activeElement === button), true);
    await screenshot(page, "round1-exit-confirmation.png");
    if (record) await page.waitForTimeout(900);
    await page.evaluate(() => stepFlight(40));
    assert.deepEqual(await battleSnapshot(page), before);
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.locator("#pause-confirm").evaluate(button => document.activeElement === button), true);
    await page.keyboard.press("Tab");
    assert.equal(await page.locator("#pause-cancel").evaluate(button => document.activeElement === button), true);
    await page.locator("#pause-cancel").click();
    assert.equal(await page.locator("#pause-screen").isVisible(), false);
    assert.equal(await page.locator("#game-canvas").evaluate(canvas => document.activeElement === canvas), true);
    await page.evaluate(() => stepFlight(1, 8000));
    assert.deepEqual(await battleSnapshot(page), before);
    await page.evaluate(() => stepFlight(1));
    assert.ok(Math.abs((await battleSnapshot(page)).time - (before.time + .025)) < .0001);

    await page.keyboard.down("ArrowDown");
    await page.evaluate(() => stepFlight(3));
    await page.keyboard.press("Escape");
    const paused = await battleSnapshot(page);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("blur"));
      stepFlight(12);
      window.dispatchEvent(new Event("focus"));
      stepFlight(12);
    });
    assert.deepEqual(await battleSnapshot(page), paused);
    await screenshot(page, "round1-pause-menu.png");
    if (record) await page.waitForTimeout(900);
    await page.locator("#pause-settings").click();
    await page.locator("#pause-quality").selectOption("medium");
    assert.equal(await page.locator("#game-app").getAttribute("data-quality"), "medium");
    await page.locator("#pause-sound").click();
    assert.equal(await page.locator("#pause-sound").getAttribute("aria-pressed"), "false");
    await page.locator("#pause-shake").click();
    assert.match(await page.locator("#pause-shake").innerText(), /强/);
    assert.deepEqual(await battleSnapshot(page), paused);
    await screenshot(page, "round1-pause-settings.png");
    if (record) await page.waitForTimeout(900);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#pause-menu").isVisible(), true);
    await page.keyboard.press("Escape");
    await page.keyboard.up("ArrowDown");
    await page.evaluate(() => stepFlight(2));
    assert.deepEqual((await battleSnapshot(page)).ship, paused.ship);

    await page.keyboard.press("Escape");
    await page.locator("#pause-restart").click();
    assert.equal(await page.locator("#pause-confirm").innerText(), "确认重开");
    await page.locator("#pause-confirm").click();
    const restarted = await battleSnapshot(page);
    assert.equal(restarted.state, "battle");
    assert.equal(restarted.time, 0);
    assert.equal(restarted.score, 0);
    await page.locator("#pause-button").click();
    await page.locator("#pause-exit").click();
    assert.equal(await page.evaluate(() => state), "battle");
    await page.locator("#pause-confirm").click();
    assert.equal(await page.locator("#start-screen").isVisible(), true);
    if (record) await page.waitForTimeout(700);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    if (video) {
      const file = await video.path();
      fs.renameSync(file, path.join(output, "round1-pause-flow.webm"));
    }
  }
}

async function checkHeadings(page, headingSelector, introSelector) {
  const title = await page.locator(headingSelector).boundingBox();
  const intro = await page.locator(introSelector).boundingBox();
  assert.ok(title && intro);
  const gap = intro.y - title.y - title.height;
  assert.ok(gap >= 16 && gap <= 24, JSON.stringify({ title, intro, gap }));
}

async function checkLayout(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    const errors = await openFlight(page);
    await page.evaluate(() => {
      const draw = drawBossBattle;
      window.bossHudPaints = 0;
      drawBossBattle = () => { bossHudPaints++; draw(); };
    });
    for (const language of ["zh-CN", "en"]) {
      for (const [width, height] of [[1440, 900], [1280, 720], [1024, 576]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(lang => setGameLanguage(lang), language);
        await page.locator("#start-button").click();
        const labels = await page.evaluate(() => {
          spawnBoss(0);
          Object.assign(boss, bossArena(0), { phase: "recover", phaseTime: 0 });
          stepFlight(2);
          setBossWarning("TEST");
          return { hud: bossHudPaints, card: !document.querySelector("#boss-hud").hidden };
        });
        assert.ok(labels.hud > 0 && labels.card);
        await page.keyboard.press("Escape");
        assert.equal(await page.locator("#pause-title").innerText(), language === "en" ? "Combat paused" : "战斗暂停");
        await page.locator("#pause-settings").click();
        assert.equal(await page.locator("#pause-quality option[value=medium]").innerText(), language === "en" ? "Medium" : "中");
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await page.evaluate(() => { openEvolutionChoice(); stepFlight(2); });
        await checkHeadings(page, "#evolution-title", "#evolution-description");
        assert.match(await page.locator("#evolution-title").innerText(), language === "en" ? /evolution/i : /进化/);
        for (const selector of [".masthead", ".lesson-note", "#boss-hud", "#boss-warning", "#battle-screen"]) {
          assert.equal(await page.locator(selector).isVisible(), false);
        }
        assert.equal(await page.evaluate(() => bossHudPaints), labels.hud);
        assert.equal(await page.locator(".evolution-card").count(), 3);
        for (const preview of await page.locator(".evolution-card-preview").all()) {
          const bounds = await preview.boundingBox();
          assert.ok(bounds && Math.abs(bounds.width - 260) <= 4 && Math.abs(bounds.height - 120) <= 4,
            JSON.stringify({ width, language, bounds }));
          assert.deepEqual(await preview.evaluate(canvas => [canvas.width, canvas.height]), [520, 240]);
        }
        await screenshot(page, "round1-evolution-" + language + "-" + width + ".png");
        await page.locator("#evolution-card-pierce").click();
        assert.equal(await page.evaluate(() => evolution.pierce), 1);
        const beforeResult = await page.evaluate(() => {
          stepFlight(1);
          endGame();
          stepFlight(2);
          return bossHudPaints;
        });
        assert.equal(beforeResult, labels.hud + 1);
        await checkHeadings(page, "#game-over-title", ".result-intro");
        assert.equal(await page.locator("#game-over-title").innerText(), language === "en" ? "Game Over" : "游戏结束");
        for (const selector of [".masthead", ".lesson-note", "#boss-hud", "#boss-warning", "#battle-screen"]) {
          assert.equal(await page.locator(selector).isVisible(), false);
        }
        await screenshot(page, "round1-results-" + language + "-" + width + ".png");
        await page.locator("#result-menu-button").click();
        assert.equal(await page.locator("#start-screen").isVisible(), true);
        console.log(language + " " + width + "px: evolution and results layouts passed");
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

(async () => {
  if (output) fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  try {
    await checkPause(browser);
    await checkLayout(browser);
    console.log("Pause/exit flows and six bilingual layout combinations passed.");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
