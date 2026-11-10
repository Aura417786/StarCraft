const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(process.argv[2]);
const resultPath = process.argv[3];
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg",
  ".glb": "model/gltf-binary", ".mp3": "audio/mpeg", ".ogg": "audio/ogg" };
const origin = "https://frozen-star-breaker.invalid";

async function run() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const filePage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const fileErrors = [];
    filePage.on("pageerror", error => fileErrors.push(error.message));
    await filePage.goto(pathToFileURL(path.join(root, "index.html")).href);
    await filePage.locator(".flight-guide-actions button").first().click();
    await filePage.locator("#start-button").click();
    await filePage.waitForFunction(() => state === "battle" && battleTime > .05);
    const fileShip = await filePage.evaluate(() => player.x);
    await filePage.keyboard.down("ArrowRight");
    await filePage.waitForFunction(x => player.x > x + 8, fileShip);
    await filePage.keyboard.up("ArrowRight");
    if (await filePage.locator("#pause-button").count()) {
      await filePage.keyboard.press("Escape");
      await filePage.locator("#pause-screen").waitFor({ state: "visible" });
      const stopped = await filePage.evaluate(() => battleTime);
      await filePage.waitForTimeout(400);
      assert.equal(await filePage.evaluate(() => battleTime), stopped);
      await filePage.keyboard.press("Escape");
      await filePage.waitForFunction(time => battleTime > time, stopped);
    }
    assert.deepEqual(fileErrors, []);
    await filePage.close();

    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [], missing = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error" && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
    });
    page.on("response", response => {
      if (response.status() >= 400 && response.url().startsWith(origin)) missing.push(response.url());
    });
    await page.route(origin + "/**", async route => {
      const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
      const file = path.resolve(root, name);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
        return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ contentType: mime[path.extname(file)], path: file });
    });
    await page.goto(origin);
    await page.locator(".flight-guide-actions button").first().click();
    await page.locator("#render-quality").selectOption("high");
    await page.locator("#start-button").click();
    await page.waitForFunction(() => battleTime > .12);
    await page.evaluate(() => {
      nextBossTime = enemyCooldown = powerupCooldown = Infinity;
      shotCooldown = 1e6;
      spawnBoss(0);
      Object.assign(boss, bossArena(0), { phase: "recover", phaseTime: -500, age: 1 });
    });
    const renderer = await page.evaluate(() => {
      const gl = bossModelStage()?.renderer.getContext();
      if (!gl) return "Canvas 2D fallback";
      const vendor = gl.getExtension("WEBGL_debug_renderer_info");
      return gl.getParameter(vendor ? vendor.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    });
    if (renderer !== "Canvas 2D fallback") {
      await page.waitForFunction(() => starBreakerModelCache.get(0)?.model && starBreakerModelStage.current === starBreakerModelCache.get(0).model);
    }
    await page.waitForTimeout(700);
    const metrics = await page.evaluate(() => new Promise(resolve => {
      const samples = [];
      let previous;
      function sample(time) {
        if (previous !== undefined) samples.push(time - previous);
        previous = time;
        if (samples.length < 180) return requestAnimationFrame(sample);
        samples.sort((a, b) => a - b);
        resolve({ frames: samples.length, p50: samples[89], p95: samples[170], max: samples.at(-1),
          mean: samples.reduce((sum, value) => sum + value, 0) / samples.length });
      }
      requestAnimationFrame(sample);
    }));
    assert.deepEqual(missing.filter(url => !url.endsWith("/favicon.ico")), []);
    assert.deepEqual(errors, []);
    const result = { compatibility: "file:// boot, keyboard movement, and pause when present",
      renderer, viewport: "1280×720", quality: "high", sample: "Broodmother idle in recover", metrics, missing, errors };
    console.log(JSON.stringify(result, null, 2));
    if (resultPath) fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
