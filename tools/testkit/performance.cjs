// Run with an unmodified browser clock and a hardware WebGL renderer.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const origin = "https://star-breaker-perf.invalid";
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav" };

async function sample(page, size) {
  return page.evaluate(size => new Promise(resolve => {
    let previous, peak = { bullets: 0, hostiles: 0, particles: 0 };
    const times = [];
    const collect = time => {
      if (previous !== undefined) times.push(time - previous);
      previous = time;
      peak.bullets = Math.max(peak.bullets, bullets.length);
      peak.hostiles = Math.max(peak.hostiles, bossProjectiles.length + enemyProjectiles.length);
      peak.particles = Math.max(peak.particles, combatEffects.particles.length);
      if (times.length < size) return requestAnimationFrame(collect);
      const sorted = [...times].sort((a, b) => a - b);
      const at = p => Number(sorted[Math.ceil(p * size) - 1].toFixed(3));
      resolve({ frames: size, mean: Number((times.reduce((s, n) => s + n, 0) / size).toFixed(3)),
        p50: at(.5), p95: at(.95), p99: at(.99), max: at(1), over33ms: times.filter(n => n > 33.3).length, peak });
    };
    requestAnimationFrame(collect);
  }), size);
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
    const errors = [], missing = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => {
      if (response.status() >= 400 && response.url().startsWith(origin) && !response.url().endsWith("/favicon.ico")) missing.push(response.url());
    });
    await page.route(origin + "/**", route => {
      const uri = new URL(route.request().url());
      const file = path.resolve(root, decodeURIComponent(uri.pathname.slice(1) || "index.html"));
      return file.startsWith(root + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()
        ? route.fulfill({ path: file, contentType: mime[path.extname(file)] }) : route.fulfill({ status: 404 });
    });
    await page.goto(origin);
    await page.locator(".flight-guide-actions button").first().click();
    await page.locator("#start-button").click();
    await page.evaluate(() => {
      nextBossTime = enemyCooldown = powerupCooldown = Infinity;
      battlefieldState.clock = 330;
      scenerySyncJourney();
      spawnBoss(10); resetBossPresentation();
      Object.assign(boss, bossArena(10), { phase: "recover", phaseTime: -200, age: 3 });
      player.lives = 99; player.invulnerable = 40;
      shotCooldown = Infinity;
    });
    await page.waitForFunction(() => starBreakerModelCache.get(10)?.model && starBreakerModelStage.current === starBreakerModelCache.get(10).model);
    const gpu = await page.evaluate(() => {
      const gl = starBreakerModelStage.renderer.getContext(), extension = gl.getExtension("WEBGL_debug_renderer_info");
      return gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    });
    const tiers = {};
    for (const quality of ["low", "medium", "high"]) {
      await page.evaluate(quality => {
        setVisualQuality(quality, false);
        bossProjectiles.length = 0;
        // Production projectile update/drawing, positioned so the sample starts
        // from the same load on all three graphics tiers.
        for (let i = 0; i < 120; i++) {
          const x = 495 + (i % 15) * 37, y = 150 + Math.floor(i / 15) * 59;
          bossProjectiles.push({ x, y, previousX: x, previousY: y, vx: -65 - i % 7 * 9,
            vy: (i % 5 - 2) * 7, radius: 4 + i % 4, age: 0, life: 12, color: "#b38cf1", shape: "circle" });
        }
      }, quality);
      await page.waitForTimeout(275);
      const resolution = await page.evaluate(() => [starBreakerModelStage.renderer.domElement.width, starBreakerModelStage.renderer.domElement.height]);
      tiers[quality] = { resolution, ...await sample(page, 600) };
      await page.screenshot({ path: path.join(output, `confluence-${quality}.png`) });
    }
    const result = { browser: browser.version(), gpu, viewport: [1280, 720], dpr: 1.5,
      fixture: "Confluence animated body, void scenery, 120 starting projectiles (real time, warm cache)",
      tiers, errors, missing };
    fs.writeFileSync(path.join(output, "performance.json"), JSON.stringify(result, null, 2));
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
    assert.ok(tiers.high.resolution[0] > tiers.low.resolution[0]);
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
