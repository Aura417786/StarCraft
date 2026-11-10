"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const output = process.argv[2] && path.resolve(process.argv[2]);
const files = {
  ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css",
  ".glb": "model/gltf-binary", ".webp": "image/webp", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml",
};
const models = [
  "broodmother", "marrow-stalker", "cinder-maw", "rift-weaver", "pulse-binder",
  "mirror-ray", "thunder-wyrm", "spore-regent", "dimension-maw", "neural-king",
  "abyssal-confluence", "abyssal-egg", "marrow-reliquary", "uncased-furnace", "unstrung-heart",
  "double-lock", "mirror-sepulcher", "severed-thunder", "last-spore-nest", "world-eater",
  "neural-crown", "extinction-core",
];

function checkModelArchive() {
  for (const model of models) {
    const file = fs.readFileSync(path.join(root, "assets/models", model + ".glb"));
    assert.equal(file.readUInt32LE(0), 0x46546c67);
    assert.equal(file.readUInt32LE(4), 2);
    assert.equal(file.readUInt32LE(8), file.length);
    const json = JSON.parse(file.toString("utf8", 20, 20 + file.readUInt32LE(12)));
    assert.ok(json.meshes.length >= 3 && json.meshes.length <= 4, model + " material batches");
    assert.ok(json.animations?.length > 0, model + " missing Blender-authored animation");
    assert.ok(json.images?.length >= 4 && json.images.every(image => Number.isInteger(image.bufferView)),
      model + " missing embedded PBR maps");
    for (const mesh of json.meshes) {
      assert.deepEqual(mesh.extras.targetNames, ["Pulse", "Attack", "Unfurl"]);
      for (const primitive of mesh.primitives) {
        assert.ok(primitive.attributes.TEXCOORD_0 >= 0, model + " missing UV coordinates");
        const material = json.materials[primitive.material];
        assert.ok(material.pbrMetallicRoughness.baseColorTexture && material.pbrMetallicRoughness.metallicRoughnessTexture
          && material.normalTexture && material.occlusionTexture && material.emissiveTexture, model + " incomplete PBR material");
      }
    }
    assert.ok(file.length <= 15_000_000, model + " exceeds streaming budget");
  }
}

const server = http.createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname); }
  catch { return response.writeHead(400).end(); }
  const file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return response.writeHead(404).end();
  }
  response.writeHead(200, { "content-type": files[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
});

async function checkInBrowser(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const missing = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", entry => {
    if (entry.type() === "error" && /shader|webglprogram/i.test(entry.text())) errors.push(entry.text());
  });
  page.on("response", response => { if (response.status() >= 400) missing.push(response.url()); });
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.locator(".flight-guide-actions button").click();
  await page.locator("#render-quality").selectOption("high");
  await page.locator("#start-button").click();
  await page.evaluate(() => {
    window.inspectBossModel = type => {
      showScreen("battle");
      battleTime = 66 + type * 34;
      nextBossTime = enemyCooldown = powerupCooldown = Infinity;
      spawnBoss(type);
      resetBossPresentation();
      Object.assign(boss, bossArena(type), { phase: "recover", age: .5, phaseTime: -1e5 });
      boss.previousX = boss.x;
      boss.previousY = boss.y;
      bossHitGrace = 100;
      shotCooldown = 1e6;
      movementHint.hidden = true;
    };
  });
  let gpu = await page.evaluate(() => {
    const stage = bossModelStage();
    if (!stage) return null;
    const gl = stage.renderer.getContext();
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  if (!gpu) {
    assert.equal(await page.evaluate(() => starBreakerModelsUnavailable), true);
    assert.deepEqual(errors, []);
    console.log("PASS GLB archive checks and functional Canvas fallback");
    if (process.env.REQUIRE_WEBGL === "1") assert.fail("Hardware WebGL 2 is required for this run");
    return;
  }
  for (let type = 0; type < 11; type++) {
    await page.evaluate(index => inspectBossModel(index), type);
    await page.waitForFunction(index => !!starBreakerModelCache.get(index)?.model && starBreakerModelStage.current === starBreakerModelCache.get(index).model, type);
    if (type === 0) await page.waitForFunction(() => starBreakerModelStage.sectorMaps.get(0), null, { timeout: 15000 });
    const visual = await page.evaluate(() => {
      const current = starBreakerModelStage.current;
      return {
        triangles: starBreakerModelStage.renderer.info.render.triangles,
        draws: starBreakerModelStage.renderer.info.render.calls,
        cache: starBreakerModelCache.size,
        influences: current.animatedMeshes.length,
        materials: current.animatedMeshes.every(({node}) => node.material.map && node.material.normalMap
          && node.material.aoMap && node.material.roughnessMap && node.material.metalnessMap),
      };
    });
    assert.ok(visual.triangles > 1000 && visual.triangles < 29000 && visual.draws <= 4);
    assert.ok(visual.cache <= 3 && visual.influences >= 3 && visual.materials);
    if (output && [0,2,5,8,10].includes(type)) {
      await page.screenshot({ path: path.join(output, "commercial-boss-" + models[type] + ".png") });
    }
  }
  for (let type = 1; type < 11; type++) {
    await page.evaluate(index => {
      inspectBossModel(index);
      beginBossFinale(boss);
      boss.finale.age = boss.finale.transform + .01;
      resetBossPresentation();
    }, type);
    await page.waitForFunction(index => !!starBreakerModelCache.get(11 + index)?.model && starBreakerModelStage.current === starBreakerModelCache.get(11 + index).model, type);
  }
  await page.evaluate(() => {
    inspectBossModel(0);
    beginBossFinale(boss);
    boss.finale.age = boss.finale.transform + .01;
    resetBossPresentation();
  });
  await page.waitForFunction(() => !!starBreakerModelCache.get(11)?.model && starBreakerModelStage.current === starBreakerModelCache.get(11).model);
  await page.waitForFunction(() => !!hadalWaterDevice, null, { timeout: 15000 });
  const diagnostics = await page.context().newCDPSession(page);
  await diagnostics.send("Performance.enable");
  const before = await diagnostics.send("Performance.getMetrics");
  const performance = await page.evaluate(() => new Promise(resolve => {
    let prev;
    const times = [];
    function sample(time) {
      if (prev) times.push(time - prev);
      prev = time;
      if (times.length < 180) requestAnimationFrame(sample);
      else {
        times.sort((a,b) => a - b);
        const average = times.reduce((sum, value) => sum + value, 0) / times.length;
        resolve({ p50: times[90], p95: times[171], largest: times[179], average });
      }
    }
    requestAnimationFrame(sample);
  }));
  if (output) {
    await page.evaluate(() => {
      const wave = boss.finale.hazards.find(h => h.type === "tide");
      if (wave) wave.age = wave.warning + wave.duration * .47;
    });
    await page.screenshot({ path: path.join(output, "commercial-boss-egg-ocean.png") });
    const portrait = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 480; canvas.height = 740;
      drawStarBreakerModel(canvas.getContext("2d"), 11, 240, 370, 433, 670, {
        time: 1.2, charge: .4, ruptured: .36, hit: 0, recoil: 0, quiet: true, color: "#78dbed",
      });
      return canvas.toDataURL("image/png").split(",")[1];
    });
    fs.writeFileSync(path.join(output, "commercial-egg-portrait.png"), Buffer.from(portrait, "base64"));
  }
  const after = await diagnostics.send("Performance.getMetrics");
  const metric = (run, name) => run.metrics.find(item => item.name === name)?.value ?? 0;
  const cpuTaskMs = Math.round(1000 * (metric(after, "TaskDuration") - metric(before, "TaskDuration")));
  const drawBudget = await page.evaluate(() => {
    const {renderer} = starBreakerModelStage;
    return { cache: starBreakerModelCache.size, geometries: renderer.info.memory.geometries };
  });
  assert.ok(drawBudget.cache <= 3 && drawBudget.geometries <= 12, JSON.stringify(drawBudget));
  const qualityProof = [];
  for (const [quality, minimum] of [["low", 320], ["medium", 384], ["high", 448]]) {
    await page.evaluate(quality => setVisualQuality(quality, false), quality);
    await page.evaluate(() => inspectBossModel(2));
    await page.waitForFunction(() => starBreakerModelStage.current === starBreakerModelCache.get(2)?.model
      && !!starBreakerModelCache.get(2)?.model);
    const state = await page.evaluate(() => ({
      width: starBreakerModelStage.renderer.domElement.width,
      environment: starBreakerModelStage.scene.environment === starBreakerModelStage.sectorMaps.get(0).texture,
      emitter: starBreakerModelStage.emitter.intensity,
    }));
    assert.ok(state.width >= minimum && state.environment && state.emitter > 0, JSON.stringify(state));
    qualityProof.push({quality, ...state});
    if (output) await page.screenshot({path: path.join(output, "cinder-" + quality + ".png")});
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(missing.filter(url => !url.endsWith("favicon.ico")), []);
  console.log(JSON.stringify({ models: models.length, gpu, performance, cpuTaskMs, drawBudget, qualityProof, pageErrors: errors.length }));
  await page.close();
}

(async () => {
  if (output) fs.mkdirSync(output, { recursive: true });
  checkModelArchive();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    headless: true,
  });
  try { await checkInBrowser(browser); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
