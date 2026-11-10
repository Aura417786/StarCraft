const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const output = path.resolve(process.argv[3] || path.join(root, "work", "round4-lookdev"));
const baseline = process.argv.includes("--baseline");
const origin = "https://star-breaker-lookdev.invalid";
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".jpg": "image/jpeg",
  ".glb": "model/gltf-binary", ".mp3": "audio/mpeg", ".ogg": "audio/ogg" };
const names = ["broodmother", "cinder-maw", "dimension-maw", "abyssal-confluence"];

async function open(browser, record = false) {
  const context = await browser.newContext({ viewport: {width: 1280, height: 720}, deviceScaleFactor: 1.5,
    ...(record && { recordVideo: { dir: output, size: {width: 1280, height: 720} } }) });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", entry => {
    if (entry.type() === "error" && /shader|webglprogram/i.test(entry.text())) errors.push(entry.text());
  });
  await page.route(origin + "/**", async route => {
    const url = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
    const file = path.resolve(root, url);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      if (url !== "favicon.ico") errors.push("Missing " + url);
      return route.fulfill({status:404, body:""});
    }
    return route.fulfill({path:file, contentType:types[path.extname(file)]});
  });
  await page.goto(origin);
  await page.locator(".flight-guide-actions button").first().click();
  await page.locator("#start-button").click();
  return {page, context, errors};
}

async function sample(page, frames = 180) {
  return page.evaluate(frames => new Promise(resolve => {
    let previous;
    const values = [];
    function tick(time) {
      if (previous !== undefined) values.push(time - previous);
      previous = time;
      if (values.length < frames) requestAnimationFrame(tick);
      else {
        values.sort((a, b) => a - b);
        resolve({ frames, p50: values[Math.floor(frames * .5)], p95: values[Math.floor(frames * .95)],
          max: values.at(-1), long: values.filter(ms => ms > 33).length });
      }
    }
    requestAnimationFrame(tick);
  }), frames);
}

async function run() {
  fs.mkdirSync(output, {recursive:true});
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH, headless:true});
  try {
    const {page, context, errors} = await open(browser);
    const gpu = await page.evaluate(() => {
      const gl = bossModelStage()?.renderer.getContext();
      const renderer = gl?.getExtension("WEBGL_debug_renderer_info");
      return renderer && gl.getParameter(renderer.UNMASKED_RENDERER_WEBGL);
    });
    assert.ok(gpu, "This proof requires a hardware WebGL renderer");
    await page.evaluate(() => {
      window.setLookdev = type => {
        resetBossEncounter();
        resetCombatEffects();
        nextBossTime = enemyCooldown = powerupCooldown = Infinity;
        shotCooldown = Infinity;
        battleTime = 14;
        battlefieldState.clock = [0, 0, 84, 0, 0, 0, 0, 0, 309, 0, 331][type];
        scenerySyncJourney();
        spawnBoss(type);
        resetBossPresentation();
        Object.assign(boss, bossArena(type), {phase:"recover", phaseTime:-100, age:2});
      };
    });
    const quality = [];
    for (const [index, type] of [0, 2, 8, 10].entries()) {
      await page.evaluate(type => setLookdev(type), type);
      await page.waitForFunction(type => !!starBreakerModelCache.get(type)?.model
        && starBreakerModelStage.current === starBreakerModelCache.get(type).model, type);
      if (!baseline) await page.waitForFunction(() => starBreakerModelStage.sectorMaps.get(sceneryJourney().current)?.texture);
      for (const tier of type === 2 ? ["low", "medium", "high"] : ["high"]) {
        await page.evaluate(tier => setVisualQuality(tier, false), tier);
        await page.waitForTimeout(380);
        await page.screenshot({path:path.join(output, names[index] + "-" + tier + ".png")});
        if (tier === "high") {
          const portrait = await page.evaluate(type => {
            const surface = document.createElement("canvas");
            surface.width = 720; surface.height = 480;
            const context = surface.getContext("2d");
            context.fillStyle = "#090e1a"; context.fillRect(0, 0, 720, 480);
            drawStarBreakerModel(context, type, 360, 240, 640, 375, {time:2.3, charge:.45,
              ruptured:.22, hit:0, recoil:0, quiet:true, color:boss.color});
            return surface.toDataURL("image/png").split(",")[1];
          }, type);
          fs.writeFileSync(path.join(output, names[index] + "-detail.png"), Buffer.from(portrait, "base64"));
        }
        if (type === 2) {
          const width = await page.evaluate(() => canUseStarBreakerModels() ? starBreakerModelStage.renderer.domElement.width : 0);
          quality.push({tier, width, ...await sample(page)});
        }
      }
    }
    if (!baseline) {
      await page.evaluate(() => setLookdev(2));
      await page.waitForFunction(() => starBreakerModelStage.current === starBreakerModelCache.get(2)?.model);
      const practical = await page.evaluate(() => {
        const stage = starBreakerModelStage;
        const surface = document.createElement("canvas");
        surface.width = 640; surface.height = 400;
        const context = surface.getContext("2d", {willReadFrequently:true});
        const pose = {time:2, charge:.75, ruptured:.6, hit:0, recoil:0, quiet:true, color:boss.color};
        const draw = () => {
          context.clearRect(0, 0, 640, 400);
          drawStarBreakerModel(context, 2, 320, 200, 585, 340, pose);
          return context.getImageData(0, 0, 640, 400).data;
        };
        const lit = draw();
        const scene = stage.scene;
        scene.remove(stage.emitter);
        const unlit = draw();
        scene.add(stage.emitter);
        let brightened = 0;
        for (let i = 0; i < lit.length; i += 4) {
          if (lit[i + 3] > 247 && lit[i] > unlit[i] + 10) brightened++;
        }
        return {brightened, intensity:stage.emitter.intensity, environment:stage.sectorMaps.get(1)?.texture === scene.environment};
      });
      assert.ok(practical.brightened > 100 && practical.intensity > 0 && practical.environment, JSON.stringify(practical));
      fs.writeFileSync(path.join(output, "cinder-practical.json"), JSON.stringify(practical, null, 2));
    }
    assert.deepEqual(errors, []);
    await context.close();
    if (!baseline) {
      const scenic = await open(browser, !!process.env.RECORD_VFX);
      await scenic.page.evaluate(() => {
        nextBossTime = enemyCooldown = powerupCooldown = shotCooldown = Infinity;
        movementHint.hidden = true;
      });
      await scenic.page.waitForFunction(() => sceneryCache.get(0)?.ready && battlefieldState.clock > 1);
      await scenic.page.screenshot({path:path.join(output, "orbit-00s.png")});
      await scenic.page.waitForTimeout(10000);
      await scenic.page.screenshot({path:path.join(output, "orbit-10s.png")});
      await scenic.page.evaluate(() => {
        battlefieldState.clock = 156;
        scenerySyncJourney();
        journeyState.scene = {id:"wreck", elapsed:12, duration:24, blend:0};
      });
      await scenic.page.waitForFunction(() => sceneryCache.get(2)?.ready);
      await scenic.page.screenshot({path:path.join(output, "wreck-parallax.png")});
      assert.deepEqual(scenic.errors, []);
      const video = scenic.page.video();
      await scenic.context.close();
      if (video) await video.saveAs(path.join(output, "sector-parallax.webm"));
    }
    fs.writeFileSync(path.join(output, "render-performance.json"), JSON.stringify({baseline, gpu, dpr:1.5, quality}, null, 2));
    console.log(JSON.stringify({baseline, gpu, quality, errors:errors.length}));
  } finally { await browser.close(); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
