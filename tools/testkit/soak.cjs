#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

async function main() {
  const root = path.resolve(process.argv[2]);
  const out = path.resolve(process.argv[3]);
  const minutes = Number(process.argv[4] ?? 30);
  assert.ok(minutes >= 1 && Number.isFinite(minutes));
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true,
    args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
  try {
    const { page, errors } = await createPage(browser, root, false);
    await page.addScriptTag({ path: path.join(__dirname, "balance-policy.js") });
    await page.locator("#start-button").click();
    const skip = page.locator("#tutorial-skip");
    if (await skip.isVisible()) await skip.click();
    await page.evaluate(() => {
      if (typeof skipFlightTutorial === "function") skipFlightTutorial();
      const fresh = () => ({ build: "wings", shields: 0, specials: 0, nextLance: 0, nextFalcon: 0, nextHeavy: 0 });
      const probe = window.soakProbe = { controls: fresh(), rounds: 1, cleared: 0, furthest: 0, seen: [], sampleCount: 0,
        worst: 0, slow: 0, totalActive: 0, lastBattle: 0 };
      // Reserve lives to exercise the late assets and modes; regular enemies,
      // attack decisions, progression, and render clocks keep normal timing.
      const reserveLives = () => { player.lives = Math.max(player.lives, 12); updateLifeDisplay(); };
      reserveLives();
      window.setInterval(() => {
        if (campaignVictory?.stage === "sequence") return;
        if (campaignVictory?.stage === "report" || state === "over") {
          probe.rounds++;
          startBattleWithSound({ mode: probe.rounds % 2 ? "campaign" : "rush", difficulty: "veteran" });
          probe.controls = fresh(); probe.lastBattle = 0;
          reserveLives();
        }
        if (battleTime >= probe.lastBattle) probe.totalActive += battleTime - probe.lastBattle;
        probe.lastBattle = battleTime;
        probe.furthest = Math.max(probe.furthest, bossDefeated);
        if (boss && !probe.seen.includes(boss.type + 1)) probe.seen.push(boss.type + 1);
        balanceChooseAction(probe.controls, "pilot");
      }, 80);
      let frame;
      const sample = time => {
        if (frame != null) {
          const ms = time - frame;
          probe.sampleCount++;
          probe.worst = Math.max(ms, probe.worst);
          if (ms > 33.3) probe.slow++;
        }
        frame = time;
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const start = performance.now();
    const timeline = [];
    while (true) {
      const elapsed = (performance.now() - start) / 1000;
      const due = timeline.length === 0 || elapsed >= timeline.length * 60 || elapsed >= minutes * 60;
      if (due) {
        if (timeline.length % 5 === 0 || elapsed >= minutes * 60) await cdp.send("HeapProfiler.collectGarbage");
        const { metrics } = await cdp.send("Performance.getMetrics");
        const selected = Object.fromEntries(metrics.filter(metric => ["JSHeapUsedSize", "JSHeapTotalSize", "Nodes",
          "Documents", "JSEventListeners", "LayoutCount"].includes(metric.name)).map(metric => [metric.name, metric.value]));
        const game = await page.evaluate(() => {
          const { controls, ...probe } = window.soakProbe;
          return { ...probe, battleTime, active: isBattleActive(), state, lives: player.lives, quality: visualQuality.id,
            models: starBreakerModelCache.size, sectorMaps: starBreakerModelStage?.sectorMaps.size ?? 0,
            particles: combatEffects.particles.length, spareParticles: spareCombatParticles.length,
            bullets: bullets.length, hostile: bossProjectiles.length + enemyProjectiles.length,
            hadal: hadalWaterDevice?.composited ?? null };
        });
        timeline.push({ elapsed: Math.round(elapsed * 100) / 100, ...selected, ...game });
        fs.writeFileSync(path.join(out, "soak.json"), JSON.stringify({ requestedMinutes: minutes, browser: browser.version(),
          fixture: "Real foreground Chrome, natural campaign then Rush with spare lives and live control policy. Forced GC every 5 min.",
          errors, timeline }, null, 2));
        console.log(`${Math.round(elapsed)}s · ${game.totalActive.toFixed(1)} combat s · Bosses seen ${game.seen.join(',')} · ${Math.round(selected.JSHeapUsedSize / 1048576)} MiB JS`);
        assert.deepEqual(errors, []);
        assert.ok(game.models <= 3 && game.particles + game.spareParticles === 180 && selected.Documents >= 1);
      }
      if (elapsed >= minutes * 60) break;
      await new Promise(resolve => setTimeout(resolve, Math.min(5000, (minutes * 60 - elapsed) * 1000)));
    }
    assert.ok(timeline.at(-1).totalActive >= minutes * 60 * .66, "The game must actually advance, not merely keep a tab open");
    await page.screenshot({ path: path.join(out, "soak-final.png") });
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
