"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const expectedVersion = process.argv[4] || "v23-rc1";
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".ogg": "audio/ogg" };

function handle(request, response) {
  const name = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname.slice(1)) || "index.html";
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "Content-Type": mime[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
}

async function main() {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const server = http.createServer(handle);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    const missing = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => {
      if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) missing.push(response.url());
    });
    await page.goto(origin, { waitUntil: "load" });
    await page.bringToFront();
    await page.waitForFunction(() => windowActive && !document.hidden);
    assert.equal(await page.evaluate(() => starBreakerVersion), expectedVersion);
    const guide = page.locator(".flight-guide-actions button").first();
    if (await guide.isVisible()) await guide.click();
    await page.locator("#start-button").click();
    const skip = page.locator("#flight-training-skip");
    if (await skip.isVisible()) await skip.click();
    else await page.evaluate(() => skipFlightTutorial());
    // Losing focus now opens a real pause menu. A launch test must explicitly
    // resume that UI instead of silently changing windowActive/pauseView.
    const bootAutoPauseResumed = await page.locator("#pause-resume").isVisible();
    if (bootAutoPauseResumed) await page.locator("#pause-resume").click();
    await page.waitForFunction(() => isBattleActive());
    const previous = await page.evaluate(() => player.y);
    await page.keyboard.down("ArrowUp");
    await page.waitForFunction(y => player.y < y - 12, previous);
    await page.keyboard.up("ArrowUp");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => pauseView === "menu");
    const pausedAt = await page.evaluate(() => battleTime);
    await page.waitForTimeout(220);
    assert.equal(await page.evaluate(() => battleTime), pausedAt);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !pauseView && isBattleActive());
    await page.screenshot({ path: path.join(path.dirname(output), "frozen-http-start.png") });
    const modelPathEligibleAtStart = await page.evaluate(() => canUseStarBreakerModels());
    if (modelPathEligibleAtStart) {
      await page.evaluate(() => {
        window.packageModelDraws = 0;
        const original = drawStarBreakerModel;
        drawStarBreakerModel = function (...args) {
          const rendered = original(...args);
          if (rendered) packageModelDraws++;
          return rendered;
        };
        // A separate rendering fixture after the normal input/pause checks.
        // Loading a GLB alone does not prove a hardware 3D frame was drawn.
        spawnBoss(0);
      });
      await page.waitForFunction(() => packageModelDraws > 0 || !canUseStarBreakerModels(), null, { timeout: 20000 });
    }
    const graphics = await page.evaluate(() => {
      const gl = starBreakerModelStage?.renderer.getContext(), extension = gl?.getExtension("WEBGL_debug_renderer_info");
      const renderer = gl && !gl.isContextLost()
        ? gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : null;
      return { actualModelRendered: (window.packageModelDraws ?? 0) > 0,
        modelDraws: window.packageModelDraws ?? 0, loadedModel: !!starBreakerModelCache.get(0)?.model,
        modelUnavailable: starBreakerModelsUnavailable, renderer,
        softwareRenderer: renderer ? /swiftshader|llvmpipe|software|microsoft basic render/i.test(renderer) : null };
    });
    await page.screenshot({ path: path.join(path.dirname(output), "frozen-http-model.png") });
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
    fs.writeFileSync(output, JSON.stringify({ browser: browser.version(), origin, version: expectedVersion,
      firstVisit: true, normalKeyboard: true, pauseClock: true, bootAutoPauseResumed, modelPathEligibleAtStart,
      modelFixture: "spawnBoss(0) after normal keyboard/pause checks; no clock stepping",
      ...graphics, errors, missing }, null, 2));
    console.log(JSON.stringify({ expectedVersion, ...graphics, errors, missing }));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
