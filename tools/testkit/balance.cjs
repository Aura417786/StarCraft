#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { chromium } = require("playwright");

const origin = "https://star-breaker-balance.invalid";
const mime = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".mp3": "audio/mpeg", ".ogg": "audio/ogg" };
const referenceSeeds = [4225, 8871, 314159];
const windowSize = { width: 1280, height: 720 };
const browserCode = ["balance-policy.js", "balance-scenarios.js"]
  .map(file => fs.readFileSync(path.join(__dirname, file), "utf8")).join("\n");

function options() {
  const [game, report, ...flags] = process.argv.slice(2);
  if (!game || !report) throw new Error("Usage: node balance.cjs <Game folder> <report.json> [--quick | --cases prefix[,prefix] | --release-matrix] [--trace] [--strict] [--no-live]");
  const selection = flags.indexOf("--cases");
  return { game: path.resolve(game), report: path.resolve(report),
    quick: flags.includes("--quick"), trace: flags.includes("--trace"),
    strict: flags.includes("--strict"), live: !flags.includes("--no-live"), release: flags.includes("--release-matrix"),
    cases: selection >= 0 ? flags[selection + 1]?.split(",") : null };
}

function fixtures(config) {
  const make = (label, bossType, fighter, extras = {}) => ({ label, bossType, fighter,
    seconds: 125, build: "stock", policy: "pilot", mode: "campaign", fixture: "preset",
    difficulty: "veteran", trace: config.trace, ...extras });
  const matrix = Array.from({ length: 11 }, (_, type) => make("boss-" + (type + 1), type, "red"));
  for (let type = 0; type < 11; type++) {
    matrix.push(make("timing-red-" + (type + 1), type, "red", { fixture: "timing" }));
  }
  for (const [fighter, caseName] of [["blue", "azure"], ["yellow", "auric"]]) {
    for (const type of [0, 2, 7, 10]) {
      matrix.push(make(caseName + "-" + (type + 1), type, fighter));
      matrix.push(make("timing-" + fighter + "-" + (type + 1), type, fighter, { fixture: "timing" }));
    }
  }
  for (const [build, fighter] of [["wings", "red"], ["falcon", "blue"], ["aegis", "yellow"]]) {
    matrix.push(make("build-" + build, 2, fighter, { build }));
    matrix.push(make("pressure-" + build, 7, fighter,
      { build, difficulty: "abyss", policy: "stationary" }));
  }
  for (const [build, fighter] of [["hunter", "blue"], ["guardbreaker", "red"], ["intercept", "yellow"]]) {
    matrix.push(make("build-" + build, 5, fighter, { build }));
  }
  for (const difficulty of ["recruit", "abyss"]) matrix.push(make("difficulty-" + difficulty, 2, "red", { difficulty }));
  matrix.push(make("stress", 10, "red", { build: "wings", fixture: "stress" }));
  for (const [fighter, build] of [["red", "wings"], ["blue", "falcon"], ["yellow", "aegis"]]) {
    matrix.push(make("campaign-" + fighter, null, fighter, { seconds: 1300, build, fixture: "natural" }));
  }
  matrix.push(make("rush", null, "red", { seconds: 1100, build: "wings", mode: "rush", fixture: "natural" }));
  if (config.release) {
    for (const difficulty of ["recruit", "veteran", "abyss"]) {
      for (const fighter of ["red", "blue", "yellow"]) {
        for (let type = 0; type < 11; type++) {
          matrix.push(make(`release-${difficulty}-${fighter}-${type + 1}`, type, fighter,
            { difficulty, fixture: "timing", seeds: [referenceSeeds[0]] }));
        }
      }
    }
  }
  const selected = config.cases ? matrix.filter(scenario => config.cases.some(prefix => scenario.label.startsWith(prefix)))
    : config.quick ? matrix.filter(scenario => ["boss-1", "boss-3", "azure-3", "auric-3"].includes(scenario.label))
      : matrix;
  assert.ok(selected.length, "No fixtures match --cases");
  return selected.flatMap(scenario => (scenario.seeds ?? referenceSeeds).map(seed => ({ ...scenario, seed })));
}

function installFixedClock() {
  let frame = null, tick = 1000, state = 1, draws = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => {
    if (callback.name !== "drawFrame") return raf(callback);
    frame = callback;
    return -1;
  };
  Math.random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    draws++;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
  window.__balanceClock = {
    seed(seed) { state = seed | 0; draws = 0; tick = 1000; },
    randomDraws: () => draws,
    tick(seconds) {
      if (!frame) throw new Error("Production frame was not scheduled");
      tick += seconds * 1000;
      frame(tick);
    },
  };
}

async function createPage(browser, game, deterministic, { flightTraining = false, campaignOpening = false, pageOptions = {} } = {}) {
  const page = await browser.newPage({ viewport: windowSize, deviceScaleFactor: 1, reducedMotion: "no-preference", ...pageOptions });
  const errors = [];
  page.on("pageerror", error => errors.push(error.stack ?? error.message));
  page.on("response", response => {
    if (response.status() >= 400 && response.url().startsWith(origin) && !response.url().endsWith("/favicon.ico"))
      errors.push(response.status() + " " + response.url());
  });
  await page.route(origin + "/**", async route => {
    const request = new URL(route.request().url());
    const name = decodeURIComponent(request.pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(game, name);
    if (!file.startsWith(game + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
      return route.fulfill({ status: 404, body: "" });
    const contentType = mime[path.extname(file)] ?? "application/octet-stream";
    if (deterministic && name === "game.js") {
      const source = fs.readFileSync(file, "utf8");
      const renderStart = "  const showCombat = ";
      assert.equal(source.split(renderStart).length, 2, "Review fixed-step render boundary after changing drawFrame");
      const boundary = "  if (window.__balanceClock) { window.requestAnimationFrame(drawFrame); return; }\n";
      return route.fulfill({ contentType, body: source.replace(renderStart, boundary + renderStart) });
    }
    // The fixed-step clock is synthetic and can request all 22 models in a
    // few seconds. Rendering is covered by the independent unmodified smoke.
    if (deterministic && name === "vendor/three-starbreaker.min.js") return route.fulfill({ contentType, body: "" });
    return route.fulfill({ contentType, path: file });
  });
  if (deterministic) await page.addInitScript(installFixedClock);
  if (!flightTraining) await page.addInitScript(() => localStorage.setItem("star-breaker-flight-training", "1"));
  if (!campaignOpening) await page.addInitScript(() => localStorage.setItem("star-breaker-opening-seen", "1"));
  await page.goto(origin + "/", { waitUntil: "load" });
  await page.bringToFront();
  const guide = page.locator(".flight-guide-actions button").first();
  if (await guide.isVisible()) await guide.click();
  if (deterministic) await page.addScriptTag({ content: browserCode });
  await page.waitForFunction(() => typeof showScreen === "function" && windowActive && !document.hidden);
  return { page, errors };
}

async function liveSmoke(browser, game, report) {
  const { page, errors } = await createPage(browser, game, false);
  try {
    await page.locator("#start-button").click();
    await page.waitForFunction(() => state === "battle" && battleTime > .3);
    const before = await page.evaluate(() => player.y);
    await page.keyboard.down("ArrowUp");
    await page.waitForFunction(y => player.y < y - 12, before);
    await page.keyboard.up("ArrowUp");
    await page.keyboard.press("Shift");
    await page.waitForFunction(() => firingStyle.mode === "focus");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !!pauseView);
    const pausedAt = await page.evaluate(() => battleTime);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => battleTime), pausedAt, "Combat clock must freeze while paused");
    await page.keyboard.press("Escape");
    await page.waitForFunction(time => battleTime > time + .1, pausedAt);
    const evidence = report.replace(/\.json$/i, "") + "-live.png";
    await page.screenshot({ path: evidence });
    assert.deepEqual(errors, [], "Live smoke errors");
    return { viewport: windowSize, screenshot: path.basename(evidence),
      movement: true, shiftStance: true, pauseFreeze: true, resumed: true, runtimeErrors: errors };
  } finally {
    await page.close();
  }
}

const round = value => Number(value.toFixed(3));
function resultsByCase(runs) {
  const grouped = new Map();
  for (const run of runs) {
    if (!grouped.has(run.case)) grouped.set(run.case, []);
    grouped.get(run.case).push(run);
  }
  return Object.fromEntries([...grouped].map(([label, entries]) => {
    const times = entries.map(run => run.ttk_seconds).filter(Number.isFinite).sort((a, b) => a - b);
    const mean = times.reduce((sum, value) => sum + value, 0) / times.length;
    return [label, { samples: entries.length, wins: entries.filter(run => run.won).length, ttk_samples: times,
      mean_ttk_seconds: times.length ? round(mean) : null,
      ttk_variation_percent: times.length > 1 ? round(100 * (times.at(-1) - times[0]) / mean) : null,
      boss_reached: entries.map(run => run.reached_stage), lives_lost: entries.map(run => run.lives_lost),
      mean_effective_dps: round(entries.reduce((sum, run) => sum + run.effective_damage_per_second, 0) / entries.length) }];
  }));
}

function compareFighters(groups) {
  return [1, 3, 8, 11].flatMap(boss => [
    { fixture: "preset", cases: ["boss-", "azure-", "auric-"] },
    { fixture: "timing", cases: ["timing-red-", "timing-blue-", "timing-yellow-"] },
  ].flatMap(({ fixture, cases }) => {
    const values = cases.map(fighter => groups[fighter + boss]?.mean_ttk_seconds);
    if (!values.every(Number.isFinite)) return [];
    const slowest = Math.max(...values), fastest = Math.min(...values);
    return [{ boss, fixture, crimson: values[0], azure: values[1], auric: values[2],
      gap_percent: round((slowest / fastest - 1) * 100) }];
  }));
}

async function main() {
  const config = options();
  assert.ok(fs.existsSync(path.join(config.game, "index.html")), "Game folder must contain index.html");
  const scenarios = fixtures(config);
  const executablePath = process.env.CHROME_PATH || chromium.executablePath();
  const browser = await chromium.launch({ executablePath, headless: true,
    args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
  fs.mkdirSync(path.dirname(config.report), { recursive: true });
  try {
    const smoke = config.live ? await liveSmoke(browser, config.game, config.report) : null;
    const { page, errors } = await createPage(browser, config.game, true);
    const runs = [];
    for (const fixture of scenarios) {
      const sample = await page.evaluate(input => runBalanceFixture(input), fixture);
      runs.push(sample);
      console.log([fixture.label, fixture.seed, sample.won ? "clear" : sample.failure_reason,
        "TTK", sample.ttk_seconds, "boss", sample.reached_stage, "life", sample.lives_left].join(" "));
    }
    const repeat = await page.evaluate(input => runBalanceFixture(input), scenarios[0]);
    assert.deepEqual(repeat, runs[0], "Same fixture and seed changed between passes");
    const groups = resultsByCase(runs);
    const caps = { damage: 60, rate: 12.001, lanes: 5, ordinaryShot: 999.999 };
    const violations = runs.filter(run => run.peak_weapon.damage > caps.damage || run.peak_weapon.rate > caps.rate
      || run.peak_weapon.lanes > caps.lanes || run.peak_weapon.visibleLanes > caps.lanes
      || run.max_normal_shot_damage > caps.ordinaryShot);
    const html = fs.readFileSync(path.join(config.game, "index.html"), "utf8");
    const digestFiles = ["index.html", ...[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1])];
    const revisionFingerprint = createHash("sha256");
    for (const file of digestFiles) revisionFingerprint.update(file).update(fs.readFileSync(path.join(config.game, file)));
    const commit = spawnSync("git", ["-C", config.game, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true });
    const repo = commit.status === 0 ? commit.stdout.trim() : null;
    const policyFingerprint = createHash("sha256").update(browserCode).digest("hex");
    const payload = { schema: "star-breaker-balance/1", capturedUtc: new Date().toISOString(), browser: browser.version(),
      gitHead: repo, sourceFingerprint: revisionFingerprint.digest("hex"), sourceFingerprintFiles: digestFiles, viewport: windowSize,
      simulation: { tickHz: 60, pairedSeeds: referenceSeeds, deterministicRepeat: true, caps,
        policyFingerprint,
        units: "TTK starts once the body can take damage, includes both pools, and uses active combat seconds",
        limitations: "A fixed policy uses visible positions and forecasts game collision. It can miss viable responses. No-render fixed-step is not a visual, frame-time or human balance test." },
      smoke, errors, groups, fighterComparisons: compareFighters(groups),
      capViolations: violations.map(run => [run.case, run.seed]), runs };
    fs.writeFileSync(config.report, JSON.stringify(payload, null, 2) + "\n");
    fs.writeFileSync(config.report.replace(/\.json$/i, "") + ".jsonl", runs.map(run => JSON.stringify(run)).join("\n") + "\n");
    assert.deepEqual(errors, [], "Runtime errors in deterministic scenarios");
    if (config.strict) assert.deepEqual(payload.capViolations, [], "Weapon caps regressed");
    console.log("Wrote " + config.report);
  } finally {
    await browser.close();
  }
}

module.exports = { createPage };
if (require.main === module) main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
