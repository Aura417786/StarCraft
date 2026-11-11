"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

async function main() {
  const root = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
  const minutes = Number(process.argv[4] || 30);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true,
    args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
  const report = { setup: "Unmodified production renderer/clock. Fresh store, zero refits, normal lives/rewards. Fixed seed only. State-reading pilot sends trusted Chrome keyboard events via Playwright; it is not human play. No injected enemies, HP, wins, clock steps or clears. Full uninterrupted video includes every attempt, ending and menus.",
    rounds: [], minutes: [], keys: 0, physicalGamepad: false };
  let video;
  try {
    const { page, errors } = await createPage(browser, root, false, { pageOptions: { recordVideo: { dir: out, size: { width: 1280, height: 720 } } } });
    video = page.video();
    await page.addScriptTag({ path: path.join(__dirname, "balance-policy.js") });
    await page.evaluate(() => {
      window.enduranceKeys = [];
      window.enduranceTrusted = 0;
      document.addEventListener("keydown", e => { if (e.isTrusted) enduranceTrusted++; });
      balancePress = (code, type = "keydown") => enduranceKeys.push({ code, type });
      balanceMove = (horizontal, vertical) => {
        for (const [code, wanted] of [["ArrowRight", horizontal > 0], ["ArrowLeft", horizontal < 0],
          ["ArrowDown", vertical > 0], ["ArrowUp", vertical < 0]]) {
          if (pressedKeys.has(code) !== wanted) balancePress(code, wanted ? "keydown" : "keyup");
        }
      };
      window.enduranceControls = {};
      window.enduranceFrame = { samples: 0, max: 0, slow50: 0, recent: [] };
      let before;
      const monitor = time => {
        if (before && state === "battle") {
          const dt = time - before;
          enduranceFrame.samples++; enduranceFrame.max = Math.max(enduranceFrame.max, dt);
          if (dt > 50) enduranceFrame.slow50++;
          enduranceFrame.recent.push(dt); if (enduranceFrame.recent.length > 1200) enduranceFrame.recent.shift();
        }
        before = time; requestAnimationFrame(monitor);
      };
      requestAnimationFrame(monitor);
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const keyName = code => code === "KeyC" ? "c" : code === "KeyV" ? "v" : code === "KeyF" ? "f" : code === "ShiftLeft" ? "Shift" : code;
    const held = new Set();
    const release = async () => { for (const key of held) await page.keyboard.up(key); held.clear(); };
    async function startRound(index) {
      await release();
      const fighter = ["red", "blue", "yellow"][index % 3];
      const seed = [4225, 8871, 314159][index % 3];
      if (index) {
        const victoryReturn = page.locator("#campaign-report-hangar");
        await (await victoryReturn.isVisible() ? victoryReturn : page.locator("#result-menu-button")).click();
      }
      await page.locator(`#fighter-picker input[value="${fighter}"]`).check();
      await page.evaluate(({ seed, fighter }) => {
        const original = startBattleWithSound;
        startBattleWithSound = options => { startBattleWithSound = original; original({ ...options, seed, difficulty: "veteran" }); };
        enduranceControls = { build: fighter === "blue" ? "falcon" : fighter === "yellow" ? "aegis" : "wings",
          nextLance: 0, nextFalcon: 0, nextHeavy: 0, shields: 0, specials: 0 };
      }, { seed, fighter });
      await page.locator("#start-button").click();
      const initial = await page.evaluate(() => ({ lives: player.lives, upgrades: { ...sortieStats.upgrades }, fighter: sortieFighter, seed: sortieStats.seed }));
      assert.equal(initial.lives, 3); assert.deepEqual(initial.upgrades, { firepower: 0, survival: 0, mobility: 0 });
      report.rounds.push({ initial, sightings: [], phases: [], hits: [], picks: [] });
    }
    await startRound(0);
    const started = performance.now();
    let lastMinute = -1, lastLog = -60, lastBoss = "", hitCount = 0;
    let lastProgress = { round: 1, battle: 0, wall: 0 };
    while (true) {
      const wall = (performance.now() - started) / 1000;
      const current = report.rounds.at(-1);
      report.wallSeconds = wall;
      const sample = await page.evaluate(() => {
        enduranceKeys.length = 0;
        enduranceControls.chargeHeld = fighterCombat.redHeld;
        if (!evolution.pending) balanceChooseAction(enduranceControls, "pilot");
        let choice = null;
        if (evolution.pending) {
          const choices = evolutionChoiceOptions().filter(k => !evolutionCardDetails(k).disabled);
          const priority = enduranceControls.build === "falcon" ? ["blast", "pierce", "aegis"] : enduranceControls.build === "aegis" ? ["aegis", "pierce", "blast"] : ["pierce", "blast", "aegis"];
          choice = [...priority, "refit-heal", "refit-shield", ...choices].find(k => choices.includes(k));
        }
        return { keys: [...enduranceKeys], choice, state, battleTime, hp: player.lives, hits: sortieStats.hitsTaken,
          lastDamageMessage, clearCount: bossDefeated, boss: boss ? { type: boss.type, phase: boss.phase, finale: !!boss.finale, hp: boss.hp } : null,
          victory: campaignVictory?.stage, result: sortieStats.result, phases: sortieStats.bossRecords,
          active: isBattleActive(), paused: pauseView, trusted: enduranceTrusted };
      });
      if (lastProgress.round !== report.rounds.length || sample.battleTime > lastProgress.battle + .1) {
        lastProgress = { round: report.rounds.length, battle: sample.battleTime, wall };
      }
      assert.ok(sample.state !== "battle" || sample.choice || wall - lastProgress.wall < 30,
        "Battle clock stopped advancing for 30 real seconds; do not count paused wall time as a soak");
      for (const { code, type } of sample.keys) {
        const key = keyName(code);
        if (type === "keyup") { await page.keyboard.up(key); held.delete(key); }
        else if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
        report.keys++;
      }
      if (sample.choice) {
        await release();
        await page.locator(`[data-choice="${sample.choice}"]`).click();
        current.picks.push({ choice: sample.choice, at: sample.battleTime });
      }
      const bossKey = sample.boss && `${sample.boss.type}-${sample.boss.finale ? "finale" : sample.boss.phase === "enter" ? "enter" : "battle"}`;
      if (bossKey && bossKey !== lastBoss && !current.sightings.some(v => v.key === bossKey)) {
        lastBoss = bossKey; current.sightings.push({ key: bossKey, ...sample.boss, time: sample.battleTime });
        await page.screenshot({ path: path.join(out, `round${report.rounds.length}-boss${bossKey}.png`) });
      }
      if (sample.hits > hitCount) { current.hits.push({ at: sample.battleTime, hp: sample.hp, reason: sample.lastDamageMessage }); hitCount = sample.hits; }
      current.phases = sample.phases; current.last = { wall, ...sample, keys: undefined, phases: undefined };
      if (Math.floor(wall / 60) > lastMinute) {
        lastMinute = Math.floor(wall / 60);
        if (lastMinute % 5 === 0) await cdp.send("HeapProfiler.collectGarbage");
        const { metrics } = await cdp.send("Performance.getMetrics");
        const selected = Object.fromEntries(metrics.filter(m => ["JSHeapUsedSize", "Nodes", "Documents", "JSEventListeners", "TaskDuration", "ScriptDuration", "LayoutDuration"].includes(m.name)).map(m => [m.name, m.value]));
        const pools = await page.evaluate(() => ({ models: starBreakerModelCache.size, maps: starBreakerModelStage?.sectorMaps.size ?? 0,
          particles: combatEffects.particles.length, spare: spareCombatParticles.length, bullets: bullets.length,
          frame: { ...enduranceFrame, recent: undefined, p95: [...enduranceFrame.recent].sort((a,b)=>a-b)[Math.floor(enduranceFrame.recent.length*.95)] } }));
        report.minutes.push({ wall, round: report.rounds.length, activeTime: sample.battleTime,
          active: sample.active, paused: sample.paused, lastProgressSecondsAgo: wall - lastProgress.wall,
          collectedGarbage: lastMinute % 5 === 0, ...selected, ...pools });
      }
      const ended = sample.state === "over" && sample.victory !== "sequence";
      if (wall - lastLog > 45 || ended) {
        console.log(JSON.stringify({ wall: Math.round(wall), round: report.rounds.length, battle: sample.battleTime, hp: sample.hp, clears: sample.clearCount, ended })); lastLog = wall;
        report.errors = errors; report.wallSeconds = wall;
        fs.writeFileSync(path.join(out, "final-endurance.json"), JSON.stringify(report, null, 2));
      }
      assert.deepEqual(errors, []);
      if (ended) {
        current.result = sample.result;
        current.profile = await page.evaluate(() => JSON.parse(JSON.stringify(sortieProfile.data)));
        await page.screenshot({ path: path.join(out, `round${report.rounds.length}-result.png`) });
        if (wall < minutes * 60) { await startRound(report.rounds.length); hitCount = 0; lastBoss = ""; }
      }
      if (wall >= minutes * 60) break;
      await page.waitForTimeout(65);
    }
    await release();
    await page.keyboard.press("Escape");
    report.campaignClears = report.rounds.filter(r => r.result?.won && r.phases.length === 11).length;
    report.errors = errors;
    fs.writeFileSync(path.join(out, "final-endurance.json"), JSON.stringify(report, null, 2));
    assert.ok(report.campaignClears >= 1, "Need a completed natural campaign; failures are retained");
  } finally {
    // Resolve the local capture while the browser connection is alive. Closing
    // it flushes FFmpeg; saveAs after close is rejected by current Playwright.
    const recording = video ? await video.path() : null;
    await browser.close();
    if (recording) fs.copyFileSync(recording, path.join(out, "final-natural-and-endurance.webm"));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
