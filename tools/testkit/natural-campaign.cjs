#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

async function main() {
  const [root, output, seedArg = "4225"] = process.argv.slice(2);
  if (!root || !output) throw new Error("Usage: node natural-campaign.cjs <Game folder> <evidence folder> [seed]");
  const game = path.resolve(root), evidence = path.resolve(output), seed = Number(seedArg);
  assert.ok(Number.isInteger(seed));
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true,
    args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
  try {
    const { page, errors } = await createPage(browser, game, false);
    await page.addScriptTag({ path: path.join(__dirname, "balance-policy.js") });
    await page.evaluate(seed => {
      const start = startBattleWithSound;
      startBattleWithSound = options => {
        startBattleWithSound = start;
        start({ ...options, seed });
      };
      balanceMove = (horizontal, vertical) => {
        for (const [key, wanted] of [["ArrowRight", horizontal > 0], ["ArrowLeft", horizontal < 0],
          ["ArrowDown", vertical > 0], ["ArrowUp", vertical < 0]]) {
          if (pressedKeys.has(key) !== wanted) balancePress(key, wanted ? "keydown" : "keyup");
        }
      };
    }, seed);
    await page.locator("#start-button").click();
    await page.waitForFunction(() => state === "battle" && battleTime > .10);
    await page.evaluate(() => {
      const controls = { build: "wings", shiftHeld: false, shiftSince: 0, nextLance: 0, nextFalcon: 0,
        nextHeavy: 0, shields: 0, specials: 0 };
      const probe = window.naturalProbe = { start: { fighter: sortieFighter, seed: sortieStats.seed, lives: player.lives,
        difficulty: sortieStats.difficulty, refits: { ...sortieStats.upgrades }, simulationHz: 1 / combatStepSeconds }, milestones: [], phases: [], picks: [],
        seen: [], hits: [], lastHit: 0, controls };
      window.setInterval(() => {
        if (state !== "battle") return;
        if (evolution.pending) {
          const options = evolutionChoiceOptions().filter(kind => !evolutionCardDetails(kind).disabled);
          const choice = ["pierce", "blast", "aegis", "refit-heal", "refit-shield", ...options].find(kind => options.includes(kind));
          const card = evolutionCards.find(item => item.dataset.choice === choice);
          if (card) { probe.picks.push({ choice, at: battleTime }); card.click(); }
          return;
        }
        balanceChooseAction(controls, "pilot");
        if (boss && !probe.seen.includes(boss.type)) {
          probe.seen.push(boss.type);
          probe.milestones.push({ kind: "enter", type: boss.type, at: battleTime, lives: player.lives });
        }
        for (let i = probe.phases.length; i < sortieStats.bossRecords.length; i++) {
          const item = { ...sortieStats.bossRecords[i], at: battleTime, lives: player.lives };
          probe.phases.push(item);
          probe.milestones.push({ kind: "clear", ...item });
        }
        if (sortieStats.hitsTaken > probe.lastHit) {
          probe.lastHit = sortieStats.hitsTaken;
          probe.hits.push({ type: boss?.type ?? null, at: battleTime, lives: player.lives, reason: lastDamageMessage });
        }
      }, 67);
    });
    const timeline = [];
    const start = performance.now();
    let lastReported = -Infinity;
    let lastMilestones = 0;
    while (true) {
      const wall = (performance.now() - start) / 1000;
      const sample = await page.evaluate(() => ({ ...window.naturalProbe, battleTime, state, lives: player.lives, score,
        shots: bullets.length, hostiles: bossProjectiles.length + enemyProjectiles.length, boss: boss?.type ?? null,
        phase: boss?.phase ?? null, bossHp: boss?.hp ?? null, finale: boss?.finale?.mode ?? null,
        clearCount: bossDefeated, victory: campaignVictory?.stage ?? null, result: sortieStats.result,
        eliteSpawns: { ...eliteDirector.spawned }, activity: isBattleActive() }));
      const done = sample.victory === "report" || (sample.state === "over" && !sample.result?.won);
      if (wall - lastReported >= 45 || done || sample.milestones.length > lastMilestones || wall > 28 * 60) {
        const { controls, result, hits, milestones, phases, picks, ...summary } = sample;
        timeline.push({ wall: Math.round(wall), ...summary });
        fs.writeFileSync(path.join(evidence, "natural-campaign.json"), JSON.stringify({
          setup: `Normal start button, fresh Chrome storage. Tutorial marked seen in the test context. Explicit launch seed only. Browser rendering and fixed ${sample.start.simulationHz} Hz simulation use production real-time RAF. Pilot reads simulated hazards, dispatches keyboard events, and clicks existing evolution cards. No gameplay patches, no extra lives, no injected waves, no clock overrides.`,
          browser: browser.version(), errors, milestones, phases, hits, picks, controls, result, timeline,
        }, null, 2));
        for (const entry of milestones.slice(lastMilestones)) console.log(`${Math.round(wall)}s · ${entry.kind} ${entry.type + 1} · ${entry.at.toFixed(1)} active s · ${entry.lives} lives`);
        console.log(`${Math.round(wall)}s wall · ${sample.battleTime.toFixed(1)} active · ${sample.clearCount}/11 clears · ${sample.lives} lives`);
        lastReported = wall; lastMilestones = milestones.length;
      }
      assert.deepEqual(errors, []);
      if (done || wall > 28 * 60) break;
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
    await page.screenshot({ path: path.join(evidence, "natural-campaign-final.png") });
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
