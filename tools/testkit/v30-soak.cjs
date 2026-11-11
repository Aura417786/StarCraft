"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { chromium } = require("playwright");
const { open } = require("./boss-retry.cjs");

const game = path.resolve(process.argv[2] || ".");
const output = path.resolve(process.argv[3] || "soak-v30");
const secondsPerRoute = 30;
const summarize = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = ratio => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? null;
  return { n: sorted.length, median: at(.5), p95: at(.95), max: sorted.at(-1) ?? null };
};
function fingerprint() {
  const html = fs.readFileSync(path.join(game, "index.html"), "utf8"), hash = createHash("sha256");
  for (const file of ["index.html", ...[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1])])
    hash.update(file).update(fs.readFileSync(path.join(game, file)));
  return hash.digest("hex");
}
function installFrameSampler() {
  const raf = window.requestAnimationFrame.bind(window);
  window.soakSamples = { active: false, intervals: [], cpu: [], last: 0, frames: 0, paused: 0,
    peakBossShots: 0, peakPlayerShots: 0, peakHazards: 0, peakHistoryBytes: 0 };
  window.requestAnimationFrame = callback => {
    if (callback.name !== "drawFrame") return raf(callback);
    return raf(time => {
      const start = performance.now();
      callback(time);
      const duration = performance.now() - start, stats = window.soakSamples;
      if (!stats.active) return;
      stats.frames++;
      if (typeof state !== "undefined" && (state !== "battle" || !!pauseView)) stats.paused++;
      if (stats.last) stats.intervals.push(time - stats.last);
      stats.last = time;
      stats.cpu.push(duration);
      stats.peakBossShots = Math.max(stats.peakBossShots, bossProjectiles.length);
      stats.peakPlayerShots = Math.max(stats.peakPlayerShots, bullets.length);
      stats.peakHazards = Math.max(stats.peakHazards, bossHazards.length);
      stats.peakHistoryBytes = Math.max(stats.peakHistoryBytes, battleRewind.bytes);
    });
  };
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const errors = [], report = { schema: "star-breaker-v30-real-raf-soak/1", allPassed: false,
    sourceFingerprint: fingerprint(), viewport: { width: 1920, height: 1080 }, graphics: "high",
    browserMode: "headless Chrome, real RAF with video recording", secondsPerRoute,
    host: { platform: os.platform(), cpu: os.cpus()[0].model }, routes: [],
    methodology: "Three 30-second real-time browser encounters, using genuine keyboard movement/F/Space/V. Staged Bosses 1/6/11 begin in an enraged body phase; fixture-only 120s damage grace and 100x Boss health keep the scene alive for measurement. These are presentation/performance checks, not natural clears or balance evidence. Frame intervals measure RAF scheduling; drawFrame CPU includes JS simulation/draw submission, not GPU completion. Browser MediaRecorder captures the actual game canvas; clips omit DOM HUD/audio, provided separately in screenshots. Encoding/headless execution can affect performance. CDP heap data includes the recorder and is JS heap, not total process/GPU memory." };
  const save = () => fs.writeFileSync(path.join(output, "soak.json"), JSON.stringify(report, null, 2) + "\n");
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true,
    args: ["--use-angle=d3d11", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"] });
  report.browser = browser.version();
  let page;
  try {
    for (const fixture of [{ route: "ember", fighter: "red", type: 0 },
      { route: "frost", fighter: "blue", type: 5 }, { route: "rewind", fighter: "yellow", type: 10 }]) {
      page = await open({ newPage: async options => {
        const created = await browser.newPage({ ...options, viewport: report.viewport });
        await created.addInitScript(installFrameSampler);
        return created;
      } }, errors, false);
      const cdp = await page.context().newCDPSession(page);
      await page.evaluate(fixture => {
        setGameLanguage("zh-CN"); setVisualQuality("high", false);
        showScreen("battle", { mode: "campaign", fighter: fixture.fighter, difficulty: "hard", seed: 7631 });
        evolution.route = fixture.route; evolution.level = 3; evolution.cooldown = 0;
        battleTime = 65 + fixture.type * 50; bossDefeated = fixture.type;
        raiseWeaponFloor(progressionPresetForBoss(fixture.type));
        ultimate.charges = 5; shield.charges = 2;
        spawnBoss(fixture.type);
        boss.healthLog += Math.log(100); boss.baseHealth *= 100;
        boss.enraged = true; bossHitGrace = 120;
        updateEvolutionDisplay(); updateUltimateDisplay(); updateShieldDisplay();
        window.soakInputs = { F: { attempts: 0, successful: 0 }, Space: { attempts: 0, successful: 0 }, V: { attempts: 0, successful: 0 } };
        const actualEvolutionSkill = requestEvolutionSkill, actualUltimate = requestUltimate, actualShield = requestShield;
        requestEvolutionSkill = function (...args) {
          soakInputs.F.attempts++; const success = actualEvolutionSkill(...args);
          if (success) soakInputs.F.successful++; return success;
        };
        requestUltimate = function (...args) {
          soakInputs.Space.attempts++; const success = actualUltimate(...args);
          if (success) soakInputs.Space.successful++; return success;
        };
        requestShield = function (...args) {
          soakInputs.V.attempts++; const success = actualShield(...args);
          if (success) soakInputs.V.successful++; return success;
        };
      }, fixture);
      await page.waitForFunction(() => state === "battle" && !isBossPresentationPlaying() && boss?.phase !== "enter", null, { timeout: 15000 });
      const heapBefore = await cdp.send("Runtime.getHeapUsage");
      const initial = await page.evaluate(() => {
        const stream = canvas.captureStream(30);
        const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8"].find(type => MediaRecorder.isTypeSupported(type));
        const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4500000 });
        const chunks = [];
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        window.finishSoakCapture = () => new Promise(resolve => {
          recorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(",")[1]);
            reader.readAsDataURL(new Blob(chunks, { type: mime }));
          };
          recorder.stop();
        });
        recorder.start(250);
        soakSamples.active = true;
        return { battleTime, lives: player.lives, type: boss.type, width: viewport.width, height: viewport.height, quality: visualQuality.id };
      });
      const started = Date.now();
      let step = 0, screenshotTaken = false;
      while (Date.now() - started < secondsPerRoute * 1000) {
        const elapsed = (Date.now() - started) / 1000;
        const direction = step % 2 ? "ArrowDown" : "ArrowUp";
        await page.keyboard.down(direction);
        await page.waitForTimeout(180);
        await page.keyboard.up(direction);
        if (step % 2 === 0 && elapsed > 3) await page.keyboard.press("f");
        if ([1, 5, 9, 13].includes(step)) await page.keyboard.press("Space");
        if ([0, 6, 12].includes(step)) await page.keyboard.press("v");
        if (!screenshotTaken && elapsed > 8) {
          await page.screenshot({ path: path.join(output, fixture.route + "-live.png") });
          screenshotTaken = true;
        }
        const remain = secondsPerRoute * 1000 - (Date.now() - started);
        if (remain > 0) await page.waitForTimeout(Math.min(1800, remain));
        step++;
      }
      const measuredWallSeconds = (Date.now() - started) / 1000;
      const final = await page.evaluate(() => {
        soakSamples.active = false;
        return { samples: soakSamples, inputs: soakInputs, state, pause: pauseView,
          time: battleTime, bossType: boss?.type, bossPhase: boss?.phase, lives: player.lives,
          rewindHistory: { count: battleRewind.history.length, bytes: battleRewind.bytes,
            availableSeconds: battleRewind.availableSeconds, lastRewound: battleRewind.lastRewound, error: battleRewind.error } };
      });
      const heapAfter = await cdp.send("Runtime.getHeapUsage");
      const row = { ...fixture, initial, measuredWallSeconds, frameMs: summarize(final.samples.intervals),
        drawFrameCpuMs: summarize(final.samples.cpu), heapBefore, heapAfter,
        heapUsedGrowth: heapAfter.usedSize - heapBefore.usedSize, final,
        recording: fixture.route + "-live.webm" };
      report.routes.push(row);
      assert.equal(initial.width, 1920); assert.equal(initial.height, 1080); assert.equal(initial.quality, "high");
      assert.equal(final.state, "battle"); assert.equal(final.pause, ""); assert.equal(final.samples.paused, 0);
      assert.equal(final.bossType, fixture.type);
      assert.ok(final.inputs.F.successful > 0, `${fixture.route}: real F never successfully activated`);
      assert.ok(final.inputs.Space.successful > 0 && final.inputs.V.successful > 0);
      assert.equal(final.rewindHistory.error, "");
      assert.ok(row.frameMs.n > 100, "Not enough actual RAF samples");
      save();
      console.log(`${fixture.route}: ${measuredWallSeconds.toFixed(1)}s, frame p95 ${row.frameMs.p95.toFixed(2)}ms, CPU p95 ${row.drawFrameCpuMs.p95.toFixed(2)}ms, F ${final.inputs.F.successful}/${final.inputs.F.attempts}`);
      const videoData = await page.evaluate(() => finishSoakCapture());
      fs.writeFileSync(path.join(output, row.recording), Buffer.from(videoData, "base64"));
      row.videoBytes = fs.statSync(path.join(output, row.recording)).size;
      await page.close();
      save();
    }
    // Separate actual death/retry, deliberately excluded from perf samples.
    page = await open(browser, errors, false);
    await page.setViewportSize(report.viewport);
    await page.evaluate(() => {
      showScreen("battle", { mode: "practice", bossType: 5, seed: 7632 });
      evolution.route = "rewind"; evolution.level = 2;
      player.lives = 2; ultimate.charges = 3; shield.charges = 1;
      spawnBoss(5); resetBossPresentation(); boss.phase = "recover";
      bossHitGrace = 0; shield.remaining = 0; player.lives = 1;
      sortieStats.guardReady = false; sortieStats.hitDebt = 2;
      damagePlayer("首领夹击命中，回到本场重试。");
    });
    assert.equal(await page.locator("#boss-retry-button").isVisible(), true);
    await page.screenshot({ path: path.join(output, "death-retry-1920.png") });
    await page.locator("#boss-retry-button").click();
    report.deathRetry = await page.evaluate(() => ({ state, bossType: boss?.type, lives: player.lives,
      route: evolution.route, level: evolution.level, ultimate: ultimate.charges, shield: shield.charges,
      focus: document.activeElement.id, retried: sortieStats.retried }));
    assert.deepEqual(report.deathRetry, { state: "battle", bossType: 5, lives: 2, route: "rewind", level: 2,
      ultimate: 3, shield: 1, focus: "game-canvas", retried: true });
    report.sourceFingerprintAtEnd = fingerprint();
    assert.equal(report.sourceFingerprintAtEnd, report.sourceFingerprint, "Runtime sources changed during the soak; rerun against a stable version");
    assert.deepEqual(errors, []);
    report.allPassed = true;
  } catch (error) {
    report.failure = error.stack || String(error);
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
    throw error;
  } finally {
    report.errors = errors; save();
    await browser.close();
  }
  const clips = report.routes.map(row => `<h2>${row.route} / Boss ${row.type + 1}</h2><video controls preload="metadata" width="960" src="${row.recording}"></video>`).join("\n");
  fs.writeFileSync(path.join(output, "index.html"), `<!doctype html><meta charset="utf-8"><title>v30 staged gameplay observations</title><style>body{margin:32px;background:#080d19;color:#e0e8f4;font:16px system-ui}video{max-width:100%}p{max-width:960px;line-height:1.7}</style><h1>v30 实机观察：三条进化路线</h1><p>1920×1080 高画质，真实键盘/RAF，每路约30秒。用于视听表现与性能观察的夹具：Boss血量×100、临时无敌、第二形态；不是自然通关或平衡证明。录屏只含实际游戏画布，无DOM界面和音频，完整界面见同目录截图；视频编码会影响帧率。</p>${clips}`);
  console.log("Soak and separate death/retry passed: " + output);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
