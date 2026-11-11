#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

const seed = 4225;
const types = [0, 5, 9];
const gears = ["low", "medium", "full"];
const tolerance = .002;

function timingChecks(run) {
  const { body, finale, bodyIntervals, finaleIntervals } = run.timing;
  const recovery = body.map(event => event.observedRecoverySeconds).filter(Number.isFinite);
  return {
    cleared: run.won && Number.isFinite(run.ttk_seconds),
    observedAttackIntervals: bodyIntervals.length > 0 && finaleIntervals.length > 0,
    telegraphMinimum: body.length > 0 && finale.length > 0
      && [...body.map(event => event.warningSeconds), ...finale.flatMap(event => event.warnings)].every(seconds => seconds >= .9 - tolerance),
    attackIntervalMinimum: [...body, ...finale].every(event => event.scheduledSeconds >= event.warningSeconds + .4 - tolerance)
      && [...bodyIntervals, ...finaleIntervals].every(interval => interval.seconds >= interval.minimumSeconds - tolerance),
    recoveryMinimum: recovery.length > 0 && recovery.every(seconds => seconds >= .8 - tolerance)
      && [...body, ...finale].every(event => event.recoverySeconds >= .8 - tolerance),
  };
}

function compareLoadouts(runs) {
  return types.map((type, index) => {
    const [low, medium, full] = runs.slice(index * gears.length, (index + 1) * gears.length);
    const relativeGap = low.won && full.won ? (full.ttk_seconds - low.ttk_seconds) / low.ttk_seconds : null;
    const firstWarning = [low, medium, full].map(run => run.timing.body[0]?.warningSeconds);
    return { boss: type + 1, relativeGap,
      lowTtk35to50: low.ttk_seconds >= 35 && low.ttk_seconds <= 50,
      fullTtk32to45: full.ttk_seconds >= 32 && full.ttk_seconds <= 45,
      lowFullTtkGapUnder25Percent: relativeGap !== null && Math.abs(relativeGap) < .25,
      fullAtMost20PercentFaster: relativeGap !== null && relativeGap >= -.20,
      firstWarningUnchangedByGear: firstWarning.every(seconds => Number.isFinite(seconds) && seconds === firstWarning[0]),
    };
  });
}

async function main() {
  const [gameArgument, outputArgument, ...flags] = process.argv.slice(2);
  if (!gameArgument || !outputArgument || flags.some(flag => flag !== "--strict")) {
    throw new Error("Usage: node boss-scaling.cjs <Game folder> <report.json> [--strict]");
  }
  const game = path.resolve(gameArgument), output = path.resolve(outputArgument);
  const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
  const sourceFiles = ["index.html", ...[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1])];
  const fingerprint = createHash("sha256");
  for (const file of sourceFiles) fingerprint.update(file).update(fs.readFileSync(path.join(game, file)));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  try {
    const { page, errors } = await createPage(browser, game, true);
    await page.addScriptTag({ path: path.join(__dirname, "boss-scaling-scenarios.js") });
    const fixtures = types.flatMap(type => gears.map(gear => ({ seed, type, gear })));
    const execute = input => page.evaluate(fixture => runBossScalingFixture(fixture), input);
    const runs = [];
    for (const fixture of fixtures) {
      const run = await execute(fixture);
      runs.push(run);
      console.log(`Boss ${run.boss.number} ${run.gear}: TTK ${run.ttk_seconds}s, k ${run.k.toFixed(3)}, HP ${run.health.body}/${run.health.finale}, intervals ${run.attack_interval_seconds.body}/${run.attack_interval_seconds.finale}s`);
    }
    for (const [index, fixture] of fixtures.entries()) {
      assert.deepEqual(await execute(fixture), runs[index], "Fixed seed and gear changed on repeat: " + JSON.stringify(fixture));
    }
    const acceptance = runs.map(run => ({ boss: run.boss.number, gear: run.gear, ...timingChecks(run) }));
    const loadoutComparisons = compareLoadouts(runs);
    const contract = await page.evaluate(value => checkBossScalingContract(value), seed);
    const allPassed = !errors.length && contract.pure && contract.clamp.passed && contract.spawnLock.passed && contract.difficulty.passed
      && [...acceptance, ...loadoutComparisons].every(row => !Object.values(row).includes(false));
    const report = {
      schema: "star-breaker-boss-scaling/1", sourceFingerprint: fingerprint.digest("hex"), sourceFiles,
      seed, browser: browser.version(), fighter: "red", difficulty: "veteran", deterministicRepeat: true,
      methodology: {
        gear: "Low uses each Boss's campaign floor, medium is the rounded level midpoint from floor to cap, full uses global 24/11/5.",
        inputs: "Production combat with the same telegraph pilot, 60 Hz clock, stock evolution, and 14 fixture-only lives. Ordinary damage, collision, and phase transitions apply.",
        ttk: "Seconds from production sortieStats.bossRecords, including both health pools. active_ttk_seconds starts when the body first accepts damage.",
        intervals: "Medians of actual elapsed combat seconds between consecutive body telegraph starts and finale beat starts. Raw observations and production schedule are in timing.",
        limitations: "Fixed pilot and fixture life pool can affect TTK; this comparison does not establish human clear rates or three-life survivability.",
      },
      runs, acceptance, loadoutComparisons, contract, errors, allPassed,
    };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
    console.log(`Wrote ${output}. Spec acceptance: ${allPassed ? "PASS" : "FAIL"}.`);
    assert.deepEqual(errors, [], "Runtime errors in scaling fixture");
    if (flags.includes("--strict")) assert.ok(allPassed, "Boss scaling specification checks failed. See the written report.");
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
