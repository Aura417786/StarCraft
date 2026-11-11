#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");
const { summarize } = require("./final-performance.cjs");

async function main() {
  const game = path.resolve(process.argv[2]);
  const output = path.resolve(process.argv[3]);
  fs.mkdirSync(output, { recursive: true });
  const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
  const sourceFiles = ["index.html", ...[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1])];
  const fingerprintGame = () => {
    const fingerprint = createHash("sha256");
    for (const file of sourceFiles) fingerprint.update(file).update(fs.readFileSync(path.join(game, file)));
    return fingerprint.digest("hex");
  };
  const report = { schema: "star-breaker-pressure/1", seed: 4225, viewport: [1280, 720],
    sourceSha256: fingerprintGame(), sourceFiles, game,
    methodology: "Fixed-step production combat for nine loadouts and isolated seal collision contracts. Screenshot scenes stage boss arrival, 14 lives and disable player fire, then wait for the unchanged production attack scheduler and press a trusted V key during charge; they are not full natural campaign completion evidence. Real RAF warm samples repeat production seal encounters with disabled player fire and fixture-only damage grace. RAF intervals measure presentation scheduling, JS frame samples include physics and draw submission.",
    host: { platform: os.platform(), cpu: os.cpus()[0].model }, runs: [], performance: [], screenshots: [] };
  const save = () => fs.writeFileSync(path.join(output, "pressure.json"), JSON.stringify(report, null, 2) + "\n");
  const checkAcceptance = () => {
    report.acceptancePassed = Object.values(report.pressureGoals.checks).every(Boolean);
    if (process.argv.includes("--acceptance")) assert.ok(report.acceptancePassed,
      "Pressure targets failed: " + Object.entries(report.pressureGoals.checks).filter(([, passed]) => !passed).map(([name]) => name).join(", "));
  };
  const checkSource = () => {
    report.sourceSha256AtEnd = fingerprintGame();
    assert.equal(report.sourceSha256AtEnd, report.sourceSha256, "Runtime source changed during the test; rerun against frozen files");
  };
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true,
    args: ["--use-angle=d3d11", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"] });
  report.browser = browser.version();
  try {
    const fixed = await createPage(browser, game, true);
    await fixed.page.addScriptTag({ path: path.join(__dirname, "boss-scaling-scenarios.js") });
    await fixed.page.addScriptTag({ path: path.join(__dirname, "pressure-scenarios.js") });
    for (const type of [0, 5, 9]) for (const gear of ["low", "medium", "full"]) {
      const run = await fixed.page.evaluate(input => runPressureFight(input), { seed: 4225, type, gear });
      report.runs.push(run);
      save();
    }
    if (process.argv.includes("--baseline")) {
      assert.deepEqual(fixed.errors, []);
      checkSource();
      report.status = "baseline-complete";
      save();
      await fixed.page.close();
      return;
    }
    const measuredSeconds = report.runs.reduce((sum, run) => sum + run.pressure.continuousOutput.damageableSeconds, 0);
    const defensiveFreeSeconds = report.runs.reduce((sum, run) => sum + run.pressure.continuousOutput.defenseFree.seconds, 0);
    report.pressureGoals = {
      livesLost: report.runs.reduce((sum, run) => sum + run.livesLost, 0),
      defenseFreeOutputFraction: defensiveFreeSeconds / measuredSeconds,
      semantics: "Output target uses the documented continuous, actual primary-hit, unshielded and unarmored window sampler. It is not the legacy near-player heuristic or a proof that every uncounted instant was unsafe.",
      checks: {
        allBodyMediansAtMost2_6: report.runs.every(run => run.attack_interval_seconds.body <= 2.6),
        allHostilePeaksAtLeast40: report.runs.every(run => run.hostileProjectilesPeak >= 40),
        livesLostAtLeast27: report.runs.reduce((sum, run) => sum + run.livesLost, 0) >= 27,
        defenseFreeOutputAtMostHalf: defensiveFreeSeconds / measuredSeconds <= .5,
        atLeastThreeCombosPerFight: report.runs.every(run => run.pressure.combos.length >= 3),
        atLeastTwoFirstActionsPerFight: report.runs.every(run => new Set(run.pressure.combos.map(combo => combo.firstKind)).size >= 2),
      },
    };
    report.contracts = await fixed.page.evaluate(() => runPressureContracts());
    for (const entry of report.contracts.coverage) {
      assert.ok(entry.warning >= 1.2);
      assert.ok(entry.charges >= 1);
      assert.ok(entry.points.every(point => point.hit), "A full arena seal must cover every sampled point");
      assert.ok(entry.damage > 0, "Unshielded arena seal must actually deal damage");
      assert.equal(entry.guardedDamage, 0, "Shield must protect against the actual seal hit");
    }
    assert.ok(report.contracts.noShield.safeGap && report.contracts.noShield.outsideGap);
    assert.equal(report.contracts.noShield.charges, 0);
    assert.ok(report.contracts.expiringShieldSupplied);
    assert.ok(report.contracts.sufficientShieldNotRefilled);
    assert.ok(Math.abs(report.contracts.armorRatio - .15) < 1e-6);
    assert.equal(report.contracts.background.corridorViolations, 0);
    assert.ok(report.contracts.background.peak > 0);
    assert.deepEqual(report.contracts.cleanup, { boss: true, projectiles: 0, hazards: 0, pressureParticles: 0, pressureTarget: true });
    assert.ok(report.contracts.transitions.every(entry => entry.pressureStateCleared && entry.pressureArmorCleared && entry.ultimateHazardsCleared));
    report.identities = await fixed.page.evaluate(() => runPressureIdentity());
    assert.equal(new Set(report.identities.map(entry => JSON.stringify(entry.mechanics))).size, 11,
      "Boss mechanics must differ after removing labels, colours and scalar tuning");
    report.comboContracts = await fixed.page.evaluate(() => runComboContracts());
    if (report.comboContracts.available) for (const entry of report.comboContracts.cases) {
      assert.ok(entry.first.length && entry.second.length, "Combo needs actual first and second hazards");
      assert.ok([...entry.first, ...entry.second].every(hazard => hazard.warning >= .9 - 1e-6));
      assert.ok(entry.observedSecondOnset?.firstActive.length > 0,
        `Boss ${entry.boss}, combo ${entry.index}: first hazard must stay active through real second onset`);
      assert.ok(entry.targetMatch.maximumError < 1e-6,
        `Boss ${entry.boss}, combo ${entry.index}: primary second contact must aim at the captured first destination`);
    }
    for (let type = 1; type <= 10; type++) assert.equal(new Set(report.comboContracts.cases
      .filter(entry => entry.boss === type).map(entry => entry.record.firstKind)).size, 2,
      `Boss ${type} needs two physically distinct opening actions`);
    report.ultimateContracts = await fixed.page.evaluate(() => runUltimateContracts());
    if (report.ultimateContracts.available) {
      const geometries = [];
      for (const entry of report.ultimateContracts.cases) {
        for (const frame of entry.frames) for (const shape of [...frame.shape.rects, ...frame.shape.segments, ...frame.shape.circles]) {
          assert.ok(Object.values(shape).every(Number.isFinite), "Ultimate collision geometry must remain finite");
        }
        assert.ok(entry.frames.some(frame => frame.hitCount > 0), `Boss ${entry.boss}: ultimate must actually threaten a player`);
        assert.ok(entry.noShieldGap.every(point => point.safe), `Boss ${entry.boss}: no-shield gap must stay open`);
        geometries.push(entry.frames.map(frame => [frame.shape.rects.length, frame.shape.segments.length,
          frame.shape.circles.length, frame.shape.nodes.length]));
      }
      assert.equal(new Set(geometries.map(shape => JSON.stringify(shape))).size, 10,
        "Ten ultimates must have distinct collision families across time, not just different colours");
    }
    report.nodeContracts = await fixed.page.evaluate(() => runUltimateNodeContracts());
    for (const entry of report.nodeContracts.cases) {
      assert.ok(entry.afterFirst < entry.initialHealth, `${entry.weapon} must hit Boss ${entry.boss} apparatus`);
      assert.equal(entry.afterRepeat, entry.afterFirst, "A single packet must not damage the same node twice");
      assert.equal(entry.finalHealth, 0);
      assert.ok(entry.afterShapes < entry.beforeShapes, "Destroyed apparatus must remove real dangerous geometry");
      if (entry.weapon === "ordinary") assert.equal(entry.ordinaryConsumed, true);
    }
    assert.ok(report.nodeContracts.solidCircleCenter, "A solid hazard's center must cause a real collision");
    report.resizeContracts = [];
    for (let type = 0; type < 10; type++) {
      await fixed.page.setViewportSize({ width: 1280, height: 720 });
      const before = await fixed.page.evaluate(type => {
        setupPressureDiagnostic(type);
        boss.pressureState.age = boss.pressureState.warning + .8;
        bossHazards.find(h => h.kind === "ultimate").age = boss.pressureState.age;
        return pressureResizeSnapshot();
      }, type);
      await fixed.page.setViewportSize({ width: 960, height: 540 });
      const after = await fixed.page.evaluate(() => pressureResizeSnapshot());
      const coordinateError = Math.max(Math.abs(before.lock.x - after.lock.x), Math.abs(before.lock.y - after.lock.y),
        Math.abs(before.gapFraction - after.gapFraction), ...before.nodePositions.flatMap((point, i) =>
          [Math.abs(point.x - after.nodePositions[i].x), Math.abs(point.y - after.nodePositions[i].y)]));
      for (const key of ["boss", "phase", "sequence", "age", "health", "kind", "hazardAge"]) assert.equal(after[key], before[key]);
      assert.ok(coordinateError < 1e-6 && before.finite && after.finite);
      assert.deepEqual(before.nodePositions.map(node => node.health), after.nodePositions.map(node => node.health));
      report.resizeContracts.push({ boss: type + 1, before, after, coordinateError });
    }
    assert.deepEqual(fixed.errors, []);
    await fixed.page.close();
    if (process.argv.includes("--logic")) {
      checkSource();
      checkAcceptance();
      report.status = "logic-complete";
      save();
      return;
    }
    save();
    const live = await createPage(browser, game, false);
    const page = live.page;
    await page.evaluate(() => {
      const realFrame = drawFrame;
      window.pressurePerf = { current: null };
      drawFrame = function pressureMeasuredFrame(time) {
        const start = performance.now();
        const current = pressurePerf.current;
        try { return realFrame(time); }
        finally {
          if (current) {
            current.js.push(performance.now() - start);
            if (current.previous !== null) current.raf.push(time - current.previous);
            current.previous = time;
            current.frames++;
            current.peakProjectiles = Math.max(current.peakProjectiles, bossProjectiles.length);
            current.peakParticles = Math.max(current.peakParticles, combatEffects.particles.length);
            const pressureCount = pressureParticlePool.filter(particle => particle.life > 0).length;
            current.peakPressureParticles = Math.max(current.peakPressureParticles, pressureCount);
            current.peakTotalParticles = Math.max(current.peakTotalParticles, pressureCount + combatEffects.particles.length);
            current.peakNewPressureParticles = Math.max(current.peakNewPressureParticles, pressureArt.spawned);
            if (!isBattleActive()) current.inactive++;
            if (boss?.phase === "recover") boss.pressureAttackCount = 6;
          }
        }
      };
      window.stagePressure = (type, quality, damageGrace = false) => {
        showScreen("battle", { seed: 4225, difficulty: "veteran" });
        setVisualQuality(quality, false);
        canvas.focus();
        enemyCooldown = powerupCooldown = nextBossTime = Infinity;
        formationState.nextTime = battlefieldEvents.nextObject = battlefieldEvents.nextTransport = aceEncounter.nextTime = Infinity;
        spawnBoss(type);
        shotCooldown = Infinity;
        bossHitGrace = damageGrace ? 1000 : 0;
        while (player.maxLives < 14) grantPlayerLife(true);
        shield.charges = 0;
        shield.energy = 0;
      };
      window.armPressure = () => {
        resetBossPresentation();
        boss.phase = "recover";
        boss.phaseTime = .8;
        boss.pressureAttackCount = 6;
        prepareAlienAttack(boss, true);
      };
    });
    report.liveTriggers = [];
    for (const type of Array.from({ length: 10 }, (_, index) => index)) {
      await page.evaluate(type => stagePressure(type, "high"), type);
      await page.waitForFunction(() => boss && !isBossPresentationPlaying());
      await page.waitForFunction(() => boss?.pressureState?.stage === "charge" && boss.pressureState.age > .95,
        null, { timeout: 30000 });
      const beforeGuard = await page.evaluate(() => ({ boss: boss.type + 1, sequence: boss.pressureSequence,
        lives: player.lives, shieldCharges: shield.charges, seal: { ...boss.pressureState },
        pressureLog: boss.pressureLog, comboLog: boss.comboLog ?? [] }));
      const charge = `boss-${type + 1}-charge.png`;
      await page.screenshot({ path: path.join(output, charge) });
      await page.waitForFunction(() => boss?.pressureState && boss.pressureState.age >= boss.pressureState.warning - .10);
      await page.keyboard.press("v");
      const guardStart = await page.evaluate(() => ({ active: shieldIsActive(), lives: player.lives,
        age: boss.pressureState.age, remaining: shield.remaining }));
      assert.ok(guardStart.active, "Trusted V key must activate the supplied shield");
      await page.waitForFunction(() => boss?.pressureState?.stage === "active" && boss.pressureState.age >= boss.pressureState.warning + .85);
      const active = `boss-${type + 1}-active.png`;
      await page.screenshot({ path: path.join(output, active) });
      await page.waitForFunction(() => boss?.pressureState?.stage === "burst" && boss.pressureState.age >= boss.pressureState.pulseAt + .04,
        null, { timeout: 15000 });
      const burst = `boss-${type + 1}-burst.png`;
      await page.screenshot({ path: path.join(output, burst) });
      const afterGuard = await page.evaluate(() => ({ lives: player.lives, shieldActive: shieldIsActive(),
        seal: boss.pressureState && { ...boss.pressureState } }));
      assert.equal(afterGuard.lives, guardStart.lives, "Trusted shield use must survive the ultimate impact without hull loss");
      report.liveTriggers.push({ beforeGuard, guardStart, afterGuard });
      report.screenshots.push(charge, active, burst);
      save();
    }
    await page.evaluate(() => stagePressure(0, "high"));
    await page.waitForFunction(() => boss && !isBossPresentationPlaying());
    await page.evaluate(() => armPressure());
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => pauseView === "menu");
    const beforePause = await page.evaluate(() => boss.pressureState?.age);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => boss.pressureState?.age), beforePause);
    const beforeSize = await page.evaluate(() => ({
      type: boss.type, sequence: boss.pressureSequence, age: boss.pressureState.age }));
    await page.setViewportSize({ width: 960, height: 540 });
    const afterSize = await page.evaluate(() => ({ type: boss.type, sequence: boss.pressureSequence, age: boss.pressureState.age }));
    assert.deepEqual(afterSize, beforeSize);
    report.liveContracts = { pauseFreezesSeal: true, resizePreservesSeal: true };
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.keyboard.press("Escape");
    for (const quality of ["low", "medium", "high"]) {
      await page.evaluate(quality => stagePressure(0, quality, true), quality);
      await page.waitForFunction(() => boss && !isBossPresentationPlaying());
      await page.waitForTimeout(1500);
      await page.evaluate(() => {
        armPressure();
        pressurePerf.current = { previous: null, raf: [], js: [], frames: 0, inactive: 0, peakProjectiles: 0,
          peakParticles: 0, peakPressureParticles: 0, peakTotalParticles: 0, peakNewPressureParticles: 0 };
      });
      await page.waitForTimeout(12000);
      const raw = await page.evaluate(() => { const result = pressurePerf.current; pressurePerf.current = null; return result; });
      const graphics = await page.evaluate(() => {
        const gl = starBreakerModelStage?.renderer.getContext();
        const ext = gl?.getExtension("WEBGL_debug_renderer_info");
        return { renderer: gl ? gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : null,
          quality: visualQuality.id, modelReady: !!starBreakerModelStage,
          modelCalls: starBreakerModelStage?.renderer.info.render.calls ?? 0,
          materialStats: typeof bossVfxMaterialStats === "function" ? bossVfxMaterialStats()
            : typeof bossVfxMaterialStats === "object" ? bossVfxMaterialStats : null };
      });
      assert.equal(raw.inactive, 0);
      assert.ok(raw.frames > 100);
      fs.writeFileSync(path.join(output, `pressure-${quality}.samples.json`), JSON.stringify(raw, null, 2));
      const sample = { quality, rafMs: summarize(raw.raf), jsFrameMs: summarize(raw.js), frames: raw.frames,
        peakProjectiles: raw.peakProjectiles, peakCombatParticles: raw.peakParticles,
        peakPressureParticles: raw.peakPressureParticles, peakTotalParticles: raw.peakTotalParticles,
        peakNewPressureParticles: raw.peakNewPressureParticles, graphics };
      report.performance.push(sample);
      console.log(JSON.stringify(sample));
      save();
      if (quality === "low") {
        await page.evaluate(() => armPressure());
        await page.waitForFunction(() => boss?.pressureState?.stage === "active" && boss.pressureState.age >= boss.pressureState.warning + .85);
        await page.screenshot({ path: path.join(output, "boss-1-low-active.png") });
        report.screenshots.push("boss-1-low-active.png");
      }
    }
    report.errors = live.errors;
    assert.deepEqual(live.errors, []);
    report.pressureGoals.checks.highRafP95AtMost16_7 = report.performance.find(sample => sample.quality === "high").rafMs.p95 <= 16.7;
    report.pressureGoals.checks.totalParticlesAtMost600 = report.performance.every(sample => sample.peakTotalParticles <= 600);
    report.pressureGoals.checks.newPressureParticlesAtMost120 = report.performance.every(sample => sample.peakNewPressureParticles <= 120);
    checkSource();
    checkAcceptance();
    report.status = "complete";
    save();
  } catch (error) { report.status = "failed"; report.error = error.stack; save(); throw error; }
  finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
