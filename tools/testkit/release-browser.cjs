"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
const origin = "https://star-breaker-release.invalid";
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".ogg": "audio/ogg" };

async function open(profileDir, errors) {
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: process.env.CHROME_PATH, headless: true, viewport: { width: 1280, height: 720 }
  });
  await context.route(origin + "/**", route => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      if (name !== "favicon.ico") errors.push("Missing " + name);
      return route.fulfill({ status: 404 });
    }
    return route.fulfill({ path: file, contentType: mime[path.extname(file)] });
  });
  const [page] = context.pages();
  page.on("pageerror", error => errors.push(error.stack));
  await page.goto(origin);
  await page.bringToFront();
  const guide = page.locator(".flight-guide-actions button").first();
  if (await guide.isVisible()) await guide.click();
  return { context, page };
}

async function openPanel(page, section) {
  const entry = page.locator(`[data-sortie-console="${section}"]`);
  await entry.focus();
  await page.keyboard.press("Enter");
  await page.locator("#sortie-console").waitFor();
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "star-breaker-release-"));
  const errors = [];
  const results = {};
  let session = await open(profileDir, errors);
  try {
    let { page } = session;
    const seeded = await page.evaluate(() => {
      // Stage a complete battle log to test settlement, without waiting on the combat matrix.
      const bossRecords = bossTypes.map((_, type) => ({ type, seconds: 41, hitCount: 0,
        builds: type === 4 ? ["build-falcon", "build-escort"] : [] }));
      for (const row of bossRecords) sortieProfile.awardBoss(row.type, "abyss");
      return sortieProfile.finish({ mode: "campaign", won: true, difficulty: "abyss", score: 98000,
        seconds: 842, kills: 190, hits: 0, fighter: "red", bossRecords });
    });
    assert.ok(seeded.newAwards.includes("fly-red"));
    assert.ok(seeded.newAwards.includes("build-escort"));
    await openPanel(page, "awards");
    assert.equal(await page.locator(".award-badge").count(), 38);
    assert.equal(await page.locator(".award-boss[data-earned='true']").count(), 11);
    await page.locator("#award-skin").selectOption("frost");
    await page.locator("#award-theme").selectOption("archive");
    await page.screenshot({ path: path.join(out, "award-wall-zh.png") });
    fs.writeFileSync(path.join(out, "before-relaunch.json"), JSON.stringify(await page.evaluate(() => ({
      primary: localStorage.getItem("star-breaker-profile"), backup: localStorage.getItem("star-breaker-profile-backup"),
      current: sortieProfile.data, status: sortieProfile.status,
    })), null, 2));
    await session.context.close();
    session = await open(profileDir, errors);
    ({ page } = session);
    const saved = await page.evaluate(() => ({
      appearance: sortieProfile.data.awards.active, points: sortieProfile.data.points,
      badge: sortieProfile.data.awards.badges.includes("fly-red"),
      filter: document.querySelector("#fighter-art").style.filter,
    }));
    fs.writeFileSync(path.join(out, "after-relaunch.json"), JSON.stringify(await page.evaluate(() => ({
      primary: localStorage.getItem("star-breaker-profile"), backup: localStorage.getItem("star-breaker-profile-backup"),
      current: sortieProfile.data, status: sortieProfile.status,
    })), null, 2));
    assert.deepEqual(saved.appearance, { skin: "frost", theme: "archive" });
    assert.ok(saved.filter.includes("grayscale"));
    assert.ok(saved.badge);
    results.crossProcessSave = saved;
    await page.evaluate(() => localStorage.setItem(StarBreakerProfile.key, "{broken"));
    await session.context.close();
    session = await open(profileDir, errors);
    ({ page } = session);
    assert.equal(await page.evaluate(() => sortieProfile.status), "backup");
    assert.equal(await page.evaluate(() => sortieProfile.data.points), saved.points);
    results.backupRecovery = true;

    const dimensions = [];
    for (const [width, height, lang] of [[640, 360, "en"], [1280, 720, "zh-CN"], [1920, 1080, "en"]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(language => setGameLanguage(language), lang);
      await openPanel(page, "settings");
      const bounds = await page.locator("#sortie-console").boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1);
      const scroll = await page.locator("#sortie-console-body").evaluate(body => ({
        client: body.clientWidth, scroll: body.scrollWidth, height: body.scrollHeight,
      }));
      assert.ok(scroll.scroll <= scroll.client + 2, JSON.stringify({ width, height, scroll }));
      await page.screenshot({ path: path.join(out, `settings-${lang}-${width}.png`) });
      await page.keyboard.press("Escape");
      await page.locator("#sortie-console").waitFor({ state: "hidden" });
      dimensions.push({ width, height, lang, bounds, scroll });
    }
    results.dimensions = dimensions;

    await page.setViewportSize({ width: 1280, height: 720 });
    await openPanel(page, "challenges");
    await page.locator(".sortie-practice-grid button").first().click();
    await page.waitForFunction(() => battleTime > .2);
    const fullscreen = page.locator("#fullscreen-button");
    if (await fullscreen.isVisible()) {
      await page.evaluate(() => {
        enemyCooldown = nextBossTime = Infinity;
        if (typeof spawnEnemy === "function") spawnEnemy();
        if (!enemies.length) throw Error("Fixture requires one existing enemy");
      });
      const before = await page.evaluate(() => enemies.length);
      // Chrome 157 can reject native fullscreen for an inactive browser tab
      // even when document.hasFocus() and transient activation both say true.
      // Activate the actual tab; still exercise the real click and fullscreen API.
      await page.bringToFront();
      await fullscreen.click();
      await page.waitForFunction(() => Boolean(document.fullscreenElement));
      assert.equal(await page.evaluate(() => enemies.length), before);
      await fullscreen.click();
      await page.waitForFunction(() => !document.fullscreenElement);
      assert.equal(await page.evaluate(() => enemies.length), before);
      results.fullscreenRetained = before;
    }
    await page.evaluate(() => { player.lives = 0; endGame(false); });
    await page.locator("#game-over-screen").waitFor();
    assert.equal(await page.locator("#campaign-victory-report").isVisible(), false);
    assert.equal(await page.locator("#restart-button").evaluate(button => document.activeElement === button), true);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => state === "battle" && sortieMode() === "practice");
    await page.goto(pathToFileURL(path.join(root, "index.html")).href);
    if (await page.locator(".flight-guide-actions button").first().isVisible())
      await page.locator(".flight-guide-actions button").first().click();
    await page.locator("#start-button").click();
    await page.evaluate(() => { if (typeof skipFlightTutorial === "function") skipFlightTutorial(); });
    const y = await page.evaluate(() => player.y);
    await page.keyboard.down("ArrowUp");
    await page.waitForFunction(value => player.y < value - 12, y);
    await page.keyboard.up("ArrowUp");
    results.compatibilityFileLaunch = true;
    assert.deepEqual(errors, []);
  } finally {
    await session.context.close();
  }
  results.runtimeErrors = errors;
  fs.writeFileSync(path.join(out, "release-browser.json"), JSON.stringify(results, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
