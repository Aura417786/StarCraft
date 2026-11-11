"use strict";

// Diagnostic fixtures only. Never use this sampler as natural-play evidence.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { performance } = require("node:perf_hooks");

function summarize(values) {
  if (!values.length) return { count: 0, mean: null, p50: null, p95: null, p99: null, max: null, total: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const round = value => Number(value.toFixed(4));
  const at = q => round(sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]);
  const total = values.reduce((sum, value) => sum + value, 0);
  return { count: values.length, mean: round(total / values.length), p50: at(.5), p95: at(.95),
    p99: at(.99), max: at(1), total: round(total) };
}

// Installs timing wrappers, not a synthetic RAF or a replacement simulation.
// drawFrame includes advanceCombatStep: the two CPU totals must not be added.
function installProbes() {
  const probe = window.finalPerf = { sample: null, completed: [], fixture: null, inputEvents: [], pendingInput: null, modelDraws: 0 };
  const originalFrame = drawFrame, originalStep = advanceCombatStep, originalWater = drawHadalSurface;
  const originalModel = drawStarBreakerModel;
  drawStarBreakerModel = function finalPerformanceModel(...args) {
    const rendered = originalModel(...args);
    if (rendered) probe.modelDraws++;
    return rendered;
  };
  const activeSample = () => {
    const sample = probe.sample;
    return sample && performance.now() <= sample.endsAt ? sample : null;
  };
  drawFrame = function finalPerformanceFrame(time) {
    const sample = activeSample(), start = performance.now();
    try { return originalFrame(time); }
    finally { if (sample) sample.drawCpu.push({ at: start - sample.startedAt, ms: performance.now() - start }); }
  };
  advanceCombatStep = function finalPerformanceStep(seconds) {
    const sample = activeSample(), start = performance.now(), x = player.x, y = player.y;
    try { return originalStep(seconds); }
    finally {
      const end = performance.now();
      if (sample) sample.physicsCpu.push({ at: start - sample.startedAt, ms: end - start });
      const input = probe.pendingInput;
      if (input && (player.x !== x || player.y !== y)) {
        input.physicsLatencyMs = end - input.receivedAt;
        input.physicsCompletedAt = end;
        input.before = { x, y }; input.after = { x: player.x, y: player.y };
        probe.pendingInput = null;
      }
    }
  };
  drawHadalSurface = function finalPerformanceWater(...args) {
    const sample = activeSample(), start = performance.now();
    const ready = !!hadalWaterDevice?.composited && canUseHadalWater() && args[3] > 0 && args[4] > 0;
    try { return originalWater(...args); }
    finally { if (sample) sample.waterCpu.push({ at: start - sample.startedAt, ms: performance.now() - start, ready }); }
  };
  document.addEventListener("keydown", event => {
    if (!event.isTrusted || !["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown"].includes(event.code)) return;
    const sample = activeSample();
    const input = { code: event.code, trusted: event.isTrusted, receivedAt: performance.now(),
      sinceSampleStartMs: sample ? performance.now() - sample.startedAt : null,
      activeAtReceipt: isBattleActive(), physicsLatencyMs: null };
    probe.inputEvents.push(input); probe.pendingInput = input;
  }, true);

  probe.begin = (name, milliseconds) => {
    assertIdle();
    const startedAt = performance.now();
    probe.sample = { name, startedAt, endsAt: startedAt + milliseconds, milliseconds,
      firstBattleTime: battleTime, lastBattleTime: battleTime, firstModelDraws: probe.modelDraws,
      raf: [], drawCpu: [], physicsCpu: [], waterCpu: [], fixtureCpu: [],
      loads: [], activeFrames: 0, inactiveFrames: 0 };
  };
  function assertIdle() { if (probe.sample) throw new Error("Previous performance sample is still active"); }
  const fillFusion = () => {
    // Preserve a 120-round steady load through the real update/collision/draw
    // path. Replacements enter after each rendered frame; report its CPU cost.
    while (bossProjectiles.length < 120) {
      const i = probe.fixture.round++;
      const x = 700 + (i % 15) * 27, y = 150 + Math.floor(i % 120 / 15) * 59;
      bossProjectiles.push({ x, y, previousX: x, previousY: y, vx: -65 - i % 7 * 9,
        vy: (i % 5 - 2) * 7, radius: 4 + i % 4, age: 0, life: 30, color: "#b38cf1", shape: "circle" });
    }
  };
  const maintain = () => {
    if (!probe.fixture) return;
    if (probe.fixture.kind === "fusion") fillFusion();
    else if (boss && boss.phase === "recover") {
      // Repeat the production tsunami plan at its production warning/cadence.
      // This is an isolated water workload, not a campaign pattern sequence.
      boss.attackIndex = bossTypes[0].patterns.indexOf("broodArc") - 1;
    }
  };
  const collect = timestamp => {
    const sample = probe.sample;
    if (sample) {
      const now = performance.now();
      if (now <= sample.endsAt) {
        if (sample.previousRaf !== undefined) sample.raf.push({ at: now - sample.startedAt, ms: timestamp - sample.previousRaf });
        sample.previousRaf = timestamp;
        sample.lastBattleTime = battleTime;
        if (isBattleActive()) sample.activeFrames++; else sample.inactiveFrames++;
        const render = starBreakerModelStage?.renderer.info;
        sample.loads.push({ at: now - sample.startedAt, bullets: bullets.length,
          bossProjectiles: bossProjectiles.length, enemyProjectiles: enemyProjectiles.length,
          particles: combatEffects.particles.length, spareParticles: spareCombatParticles.length,
          hazards: bossHazards.length, bossPhase: boss?.phase ?? null,
          waterHazards: bossHazards.filter(h => h.material === "water").length,
          modelDrawCallsLatest: render?.render.calls ?? null,
          modelTrianglesLatest: render?.render.triangles ?? null,
          modelGeometries: render?.memory.geometries ?? null, modelTextures: render?.memory.textures ?? null });
      } else {
        sample.observedWallMs = now - sample.startedAt;
        sample.modelDraws = probe.modelDraws - sample.firstModelDraws;
        sample.inputEvents = probe.inputEvents.filter(input => input.receivedAt >= sample.startedAt && input.receivedAt <= sample.endsAt);
        probe.completed.push(sample); probe.sample = null;
      }
    }
    const start = performance.now();
    maintain();
    if (sample && performance.now() <= sample.endsAt) sample.fixtureCpu.push(performance.now() - start);
    requestAnimationFrame(collect);
  };
  requestAnimationFrame(collect);
}

function summarizeSample(raw) {
  const range = key => {
    const values = raw.loads.map(load => load[key]).filter(Number.isFinite);
    return values.length ? { min: Math.min(...values), max: Math.max(...values),
      mean: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(3)) } : null;
  };
  return { name: raw.name, requestedMs: raw.milliseconds, observedWallMs: raw.observedWallMs,
    battleSeconds: raw.lastBattleTime - raw.firstBattleTime,
    rafIntervalMs: { ...summarize(raw.raf.map(v => v.ms)),
      over33ms: raw.raf.filter(v => v.ms > 33.3).length, over50ms: raw.raf.filter(v => v.ms > 50).length },
    drawFrameJsMs: summarize(raw.drawCpu.map(v => v.ms)),
    advanceCombatStepJsMs: summarize(raw.physicsCpu.map(v => v.ms)),
    waterSurfaceJsMs: summarize(raw.waterCpu.map(v => v.ms)),
    waterCompositedCalls: raw.waterCpu.filter(v => v.ready).length,
    fixtureMaintenanceJsMs: summarize(raw.fixtureCpu),
    activeFrames: raw.activeFrames, inactiveFrames: raw.inactiveFrames,
    actualModelRendered: raw.modelDraws > 0, modelDraws: raw.modelDraws,
    inputEvents: raw.inputEvents,
    loads: Object.fromEntries(["bullets", "bossProjectiles", "enemyProjectiles", "particles", "spareParticles", "hazards", "waterHazards",
      "modelDrawCallsLatest", "modelTrianglesLatest", "modelGeometries", "modelTextures"].map(key => [key, range(key)])) };
}

async function graphicsSnapshot(page) {
  return page.evaluate(() => {
    const identify = gl => {
      if (!gl || gl.isContextLost()) return null;
      const extension = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
      return { renderer, vendor: gl.getParameter(extension ? extension.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
        version: gl.getParameter(gl.VERSION), shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        software: /swiftshader|llvmpipe|software|microsoft basic render/i.test(renderer),
        contextAttributes: gl.getContextAttributes() };
    };
    // Probe once outside timed intervals when production rejected WebGL.
    let available = null;
    if (!starBreakerModelStage && !hadalWaterDevice) {
      const scratch = document.createElement("canvas"), gl = scratch.getContext("webgl2");
      available = identify(gl); gl?.getExtension("WEBGL_lose_context")?.loseContext();
    }
    return { dpr: devicePixelRatio, quality: { ...visualQuality }, canvas: [canvas.width, canvas.height],
      model: identify(starBreakerModelStage?.renderer.getContext()),
      modelResolution: starBreakerModelStage ? [starBreakerModelStage.renderer.domElement.width, starBreakerModelStage.renderer.domElement.height] : null,
      modelPathEligible: canUseStarBreakerModels(), modelUnavailable: starBreakerModelsUnavailable, modelCache: starBreakerModelCache.size,
      water: identify(hadalWaterDevice?.gl), waterResolution: hadalWaterDevice ? [hadalWaterDevice.canvas.width, hadalWaterDevice.canvas.height] : null,
      waterUnavailable: hadalWaterUnavailable, waterComposited: hadalWaterDevice?.composited ?? false,
      availableFallbackRenderer: available, userAgent: navigator.userAgent, logicalProcessors: navigator.hardwareConcurrency,
      deviceMemoryGiB: navigator.deviceMemory ?? null };
  });
}

async function cdpMetrics(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(metrics.map(metric => [metric.name, metric.value]));
}
function metricDelta(before, after, wallMs) {
  const names = ["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "LayoutCount", "RecalcStyleCount"];
  return { wallMs, deltas: Object.fromEntries(names.map(key => [key, after[key] - before[key]])),
    taskDurationPercentOfWall: (after.TaskDuration - before.TaskDuration) * 100000 / wallMs,
    heapBefore: before.JSHeapUsedSize, heapAfter: after.JSHeapUsedSize,
    nodesBefore: before.Nodes, nodesAfter: after.Nodes,
    scope: "CDP renderer-main-thread counters over the enclosing interval; includes probes/fixture/automation overhead and is not GPU time." };
}

async function main() {
  const [game, output, secondsArg] = process.argv.slice(2);
  if (!game || !output) throw new Error("Usage: node final-performance.cjs <Game folder> <output folder> [seconds-per-case >= 10]");
  const seconds = Number(secondsArg || 10);
  assert.ok(Number.isFinite(seconds) && seconds >= 10, "Each warm sample must run for at least 10 seconds");
  const root = path.resolve(game), out = path.resolve(output);
  fs.mkdirSync(out, { recursive: true });
  const { chromium } = require("playwright");
  const { createPage } = require("./balance.cjs");
  const launchArgs = ["--disable-background-timer-throttling", "--disable-renderer-backgrounding"];
  const report = { startedAt: new Date().toISOString(), completedAt: null, viewport: [1280, 720], dpr: 1.5,
    sampleSeconds: seconds, executable: process.env.CHROME_PATH || "Playwright default Chromium", launchArgs,
    host: { platform: os.platform(), release: os.release(), architecture: os.arch(),
      cpuModels: [...new Set(os.cpus().map(cpu => cpu.model))], logicalProcessors: os.cpus().length,
      totalMemoryBytes: os.totalmem(), freeMemoryBytesAtStart: os.freemem(), nodeVersion: process.version },
    limitations: ["RAF intervals measure presentation scheduling, not CPU or GPU execution time.",
      "JS durations are synchronous wall-clock time around production functions, including driver stalls and probe overhead; not thread CPU or GPU timers.",
      "drawFrame includes physics; do not add drawFrame and advanceCombatStep totals.",
      "No GPU timer query or GPU performance claim. WebGL renderer identity/calls/triangles are diagnostic metadata.",
      "Fresh isolated browser context and first sortie, not an OS/disk/shader-cache cold boot.",
      "Warm cases use controlled seeded Boss fixtures, invulnerability, disabled player fire and extra replenished projectiles; not natural play or difficulty evidence.",
      "No forced garbage collection during this test. CDP includes automation/probe overhead.",
      "Headless Chromium on this one host; this is not a broad hardware compatibility benchmark."], cases: [] };
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: launchArgs });
  let errors = [];
  const save = () => fs.writeFileSync(path.join(out, "final-performance.json"), JSON.stringify(report, null, 2));
  try {
    report.browserVersion = browser.version();
    report.playwrightVersion = require("playwright/package.json").version;
    const browserCdp = await browser.newBrowserCDPSession();
    try { report.browserCommandLine = (await browserCdp.send("Browser.getBrowserCommandLine")).arguments; }
    catch (error) { report.commandLineUnavailable = error.message; }
    try { report.systemInfo = await browserCdp.send("SystemInfo.getInfo"); }
    catch (error) { report.systemInfoUnavailable = error.message; }
    const opened = await createPage(browser, root, false, { pageOptions: { deviceScaleFactor: 1.5 } });
    const page = opened.page; errors = opened.errors;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    await page.evaluate(installProbes);
    await page.evaluate(() => {
      const original = startBattleWithSound;
      startBattleWithSound = options => {
        startBattleWithSound = original;
        finalPerf.begin("cold-first-sortie-2s", 2000);
        const startedAt = performance.now();
        try { return original(options); }
        finally { finalPerf.startBattleJsMs = performance.now() - startedAt; }
      };
    });
    const coldBefore = await cdpMetrics(cdp), coldWall = performance.now();
    await page.locator("#start-button").click();
    const dispatch = [];
    for (const key of ["ArrowRight", "ArrowUp", "ArrowLeft"]) {
      const start = performance.now();
      await page.keyboard.down(key);
      dispatch.push({ key, hostDispatchRoundTripMs: performance.now() - start });
      await page.waitForTimeout(180); await page.keyboard.up(key);
      await page.waitForTimeout(90);
    }
    await page.waitForFunction(() => finalPerf.completed.length >= 1, null, { timeout: 20000 });
    const coldAfter = await cdpMetrics(cdp);
    const coldRaw = await page.evaluate(() => finalPerf.completed.shift());
    report.cold = { ...summarizeSample(coldRaw), keyboardDispatch: dispatch,
      startBattleJsMs: await page.evaluate(() => finalPerf.startBattleJsMs),
      cdp: metricDelta(coldBefore, coldAfter, performance.now() - coldWall) };
    fs.writeFileSync(path.join(out, "cold-first-sortie-2s.samples.json"), JSON.stringify(coldRaw, null, 2));
    await page.screenshot({ path: path.join(out, "cold-first-sortie.png") });
    assert.ok(report.cold.inputEvents.some(input => input.trusted && input.activeAtReceipt
      && input.sinceSampleStartMs <= 2000 && Number.isFinite(input.physicsLatencyMs)), "No trusted key-to-physics movement captured during first two seconds");
    save();

    for (const quality of ["low", "medium", "high"]) for (const fixture of ["water", "fusion"]) {
      const name = `${quality}-${fixture}`;
      await page.evaluate(({ quality, fixture }) => {
        finalPerf.fixture = null;
        setVisualQuality(quality, false);
        nextBossTime = enemyCooldown = powerupCooldown = shotCooldown = Infinity;
        bullets.length = enemies.length = enemyProjectiles.length = bossProjectiles.length = bossHazards.length = 0;
        battlefieldState.clock = fixture === "water" ? 60 : 330; scenerySyncJourney();
        spawnBoss(fixture === "water" ? 0 : 10); resetBossPresentation();
        Object.assign(boss, bossArena(boss.type), { phase: "recover", phaseTime: fixture === "water" ? 0 : -1000, age: 3 });
        player.lives = 99; player.invulnerable = 10000;
        finalPerf.fixture = { kind: fixture, round: 0 };
        if (fixture === "water") {
          boss.attackIndex = bossTypes[0].patterns.indexOf("broodArc") - 1;
          prepareAlienAttack(boss);
        }
      }, { quality, fixture });
      await page.waitForFunction(() => {
        if (!canUseStarBreakerModels()) return true;
        const entry = starBreakerModelCache.get(boss.type), stage = starBreakerModelStage;
        return !!entry?.model && stage?.current === entry.model && entry.warming === false && !stage.warmEntry
          && !stage.queuedWarm && [...stage.sectorMaps.values()].every(Boolean);
      }, null, { timeout: 30000 });
      // Low deliberately disables the water device, not the Boss model path.
      // Medium/high preload asynchronously, then warm on the actual battle
      // canvas; waiting only for the offscreen device is not enough.
      await page.waitForFunction(() => !canUseHadalWater() || hadalWaterUnavailable
        || (hadalWaterDevice?.composited && hadalWaterDevice.battleComposite), null, { timeout: 30000 });
      await page.waitForTimeout(1500);
      const graphics = await graphicsSnapshot(page);
      const before = await cdpMetrics(cdp), wall = performance.now();
      await page.evaluate(({ name, duration }) => finalPerf.begin(name, duration), { name, duration: seconds * 1000 });
      await page.waitForFunction(() => finalPerf.completed.length >= 1, null, { timeout: seconds * 1000 + 30000 });
      const after = await cdpMetrics(cdp);
      const raw = await page.evaluate(() => finalPerf.completed.shift());
      const result = { ...summarizeSample(raw), graphics, cdp: metricDelta(before, after, performance.now() - wall) };
      report.cases.push(result);
      fs.writeFileSync(path.join(out, `${name}.samples.json`), JSON.stringify(raw, null, 2));
      await page.screenshot({ path: path.join(out, `${name}.png`) });
      assert.ok(result.observedWallMs >= 10000 && result.rafIntervalMs.count > 0, "Warm sample must measure at least 10 real seconds");
      assert.ok(result.activeFrames > 0 && result.advanceCombatStepJsMs.count > 0 && result.inactiveFrames === 0, "The benchmark paused or stopped simulating");
      if (graphics.modelPathEligible) assert.ok(result.actualModelRendered, "Loaded model never completed a production WebGL/composite draw");
      if (fixture === "fusion") assert.equal(result.loads.bossProjectiles.max, 120, "Fusion fixture did not reach its 120-projectile load");
      if (fixture === "water") assert.ok(result.loads.waterHazards.max > 0, "Water fixture did not exercise water attacks");
      assert.deepEqual(errors, []);
      save();
      console.log(JSON.stringify({ name, wallMs: result.observedWallMs, rafP95: result.rafIntervalMs.p95,
        drawJsP95: result.drawFrameJsMs.p95, physicsJsP95: result.advanceCombatStepJsMs.p95,
        taskPercent: result.cdp.taskDurationPercentOfWall, renderer: graphics.model?.renderer ?? graphics.availableFallbackRenderer?.renderer ?? null }));
    }
    await page.evaluate(() => { finalPerf.fixture = null; });
    report.completedAt = new Date().toISOString(); report.errors = errors; report.status = "complete";
    const instructions = ["# Final performance evidence", "", `Recorded ${report.startedAt} to ${report.completedAt}.`, "",
      "- 1280 × 720 CSS pixels, DPR 1.5, headless Chromium. Browser version, exact flags, renderer and host hardware are in final-performance.json.",
      "- Cold case: first sortie in a fresh isolated browser context. First two seconds are sampled from the real Start handler; trusted arrow keys are timed until the first production physics step that moves the craft.",
      "- Warm cases: low/medium/high × Broodmother tsunami and Confluence with a target load of 120 replenished projectiles. Each case is measured for at least 10 real seconds after asset/shader readiness and a 1.5-second warmup.",
      "- The warm fixtures disable player firing/waves, grant invulnerability and repeat the production tsunami or hold the fusion creature in its animated recovery pose. They measure controlled rendering/physics load, not win rate or human playability.",
      "- *.samples.json contains actual per-frame intervals, function duration samples, resource populations and input observations. PNGs are captured after each timed interval, so screenshot encoding is excluded.",
      "- RAF = presentation scheduling interval. drawFrameJsMs = synchronous JS wall duration including nested physics; advanceCombatStepJsMs is reported separately and must not be added to it. CDP TaskDuration includes renderer work plus instrumentation and fixture overhead.",
      "- No GPU execution timing is measured. WebGL calls/triangles are Three renderer's latest-frame counters, not summed whole-game GPU work. Software fallback is reported as observed; it is not passed off as hardware 3D.",
      "- No forced garbage collection. Heap snapshots are point samples, not a memory-leak verdict; consult the separate endurance run.",
      "- No numerical performance pass threshold is fabricated. Complete means all six workloads and cold input were captured, the game stayed active, and no page/resource errors occurred. Review the measured values against the target experience.", ""];
    fs.writeFileSync(path.join(out, "performance-methodology.md"), instructions.join("\n"));
    save();
  } catch (error) {
    report.status = "failed"; report.error = error.stack; report.errors = errors; report.completedAt = new Date().toISOString(); save(); throw error;
  } finally { await browser.close(); }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { summarize, summarizeSample, metricDelta };
