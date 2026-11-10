const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const [repo, destination, baseline] = process.argv.slice(2);
const root = path.resolve(repo);
const out = path.resolve(destination);
const origin = "https://star-breaker-test.invalid";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".glb": "model/gltf-binary" };

async function run() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 },
    recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
  const page = await context.newPage();
  const video = page.video();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
  });
  await page.route(origin + "/**", async route => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
      return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ contentType: types[path.extname(file)], path: file });
  });
  try {
    await page.goto(origin);
    await page.locator(".flight-guide-actions button").first().click();
    await page.locator("#start-button").click();
    await page.evaluate(() => {
      battleTime = 17;
      nextBossTime = Infinity;
      ultimate.charges = 2;
      spawnEnemy("gunner");
      const enemy = enemies.at(-1);
      enemy.x = enemy.previousX = 480;
      enemy.y = enemy.previousY = enemy.baseY = player.y + 23;
      enemy.speed = 0;
      enemy.gunPhase = "recover";
      const muzzle = muzzlePosition();
      enemyProjectiles.push({ x: 400, y: muzzle.y + 17, vx: -130, vy: 0, radius: 5,
        tint: "#65dcff", age: 0, previousX: 400, previousY: muzzle.y + 17 });
      drawFrame(1000);
    });
    await page.screenshot({ path: path.join(out, "01-before-shot.png") });
    await page.keyboard.press("Space");
    await page.evaluate(() => { updateUltimate(.5); drawFrame(1000); });
    await page.screenshot({ path: path.join(out, "02-charging.png") });
    const flight = await page.evaluate(() => {
      updateUltimate(.35);
      updateUltimate(.195);
      drawFrame(1000);
      const shot = ultimate.shot;
      const isolated = document.createElement("canvas");
      isolated.width = canvas.width; isolated.height = canvas.height;
      const copy = isolated.getContext("2d");
      const sample = (x, y) => Array.from(copy.getImageData(x, y, 1, 1).data);
      copy.drawImage(canvas, 0, 0);
      const scale = canvas.width / viewport.width;
      const pixel = sample(Math.round(404 * scale), Math.round((shot.y + 17) * scale));
      return { phase: ultimate.phase, x: shot.x, y: shot.y, contacts: shot.contacts?.length ?? null,
        enemyBullet: pixel, radius: shot.radius, target: enemies.map(enemy => ({ x: enemy.x, y: enemy.y, hp: enemy.hp })) };
    });
    assert.equal(flight.phase, "firing");
    if (!baseline) {
      assert.ok(flight.contacts >= 1, JSON.stringify(flight));
      assert.ok(flight.enemyBullet[2] > flight.enemyBullet[0] + 30, JSON.stringify(flight));
    }
    await page.screenshot({ path: path.join(out, "03-firing-and-contact.png") });
    for (let frame = 1; frame <= 30; frame++) {
      await page.evaluate(time => drawFrame(time), 1000 + frame * 30);
      if (frame === 17) await page.screenshot({ path: path.join(out, "04-dissipating.png") });
      await page.waitForTimeout(24);
    }
    assert.equal(await page.evaluate(() => ultimate.phase), "idle");
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, "beam.json"), JSON.stringify({ baseline: !!baseline, flight, errors }, null, 2));
  } finally {
    await context.close();
    await video.saveAs(path.join(out, "beam-session.webm"));
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
