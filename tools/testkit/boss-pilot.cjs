"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

function runFlight({ type, difficulty, mode, enabled = true }) {
  const readMobility = BossMobility.enabled;
  BossMobility.enabled = () => enabled && readMobility();
  try {
    balanceStart({ seed: 4225, bossType: type, difficulty, fighter: "blue",
      mode: "campaign", build: "stock", policy: "pilot", fixture: "preset" });
    const target = boss;
    Object.assign(target, bossArena(type), { phase: "recover", phaseTime: 20 });
    resetBossPresentation();
    shotCooldown = Infinity;
    player.lives = player.maxLives = 32;
    const bounds = finaleBounds();
    player.x = player.previousX = bounds.left + bounds.width * .46;
    player.y = player.previousY = bounds.top + bounds.height * .49;
    const controls = { build: "stock", shields: 0, specials: 0, routeSkills: 0, longLookahead: true };
    let horizontalDistance = 0, verticalDistance = 0, maneuverChanges = 0, previousControl = "";
    const seconds = 27;
    for (let tick = 0; tick < seconds * 60 && isBattleActive(); tick++) {
      shield.charges = 0;
      ultimate.charges = 0;
      if (mode === "pilot" && tick % 7 === 0) {
        balanceChooseAction(controls, "pilot");
        const choice = [...pressedKeys].filter(key => /^Arrow/.test(key)).sort().join("-");
        if (choice !== previousControl) maneuverChanges++;
        previousControl = choice;
      }
      const { x, y } = player;
      __balanceClock.tick(1 / 60);
      horizontalDistance += Math.abs(player.x - x);
      verticalDistance += Math.abs(player.y - y);
    }
    const combos = (target.comboLog ?? []).filter(chain => chain.at + chain.stageStarts.at(-1) < battleTime);
    return { type: type + 1, difficulty, mode, enabled,
      simulatedSeconds: Math.round(battleTime * 100) / 100,
      contacts: sortieStats.hitsTaken, lives: player.lives,
      horizontalDistance: Math.round(horizontalDistance), verticalDistance: Math.round(verticalDistance),
      dirChanges: maneuverChanges,
      completedCombos: combos.length,
      activeStages: combos.reduce((count, chain) => count + chain.stages, 0),
      bespokeStages: combos.reduce((count, chain) => count + Number((chain.thirdKind ?? "").includes("mobility")
        || chain.fourthKind === "mobility"), 0) };
  } finally {
    BossMobility.enabled = readMobility;
  }
}

async function main() {
  const game = path.resolve(process.argv[2] ?? ".");
  const out = process.argv[3];
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const { page, errors } = await createPage(browser, game, true);
    const rows = [];
    for (const difficulty of ["easy", "normal", "hard", "nightmare"]) {
      // Match the same early, mid, and final opponent, seed, fighter and HP.
      for (const type of [1, 4, 10]) {
        for (const mode of ["stationary", "pilot"]) rows.push(await page.evaluate(runFlight, { type, difficulty, mode }));
      }
    }
    const baseline = [];
    for (const type of [1, 4, 10]) {
      for (const mode of ["stationary", "pilot"]) baseline.push(await page.evaluate(runFlight, { type, difficulty: "hard", mode, enabled: false }));
    }
    assert.deepEqual(errors, []);
    assert.ok(rows.every(result => result.simulatedSeconds >= 26));
    const summary = {};
    for (const difficulty of ["easy", "normal", "hard", "nightmare", "previousHard"]) {
      const selected = difficulty === "previousHard" ? baseline : rows.filter(row => row.difficulty === difficulty);
      const totals = (mode) => {
        const values = selected.filter(row => row.mode === mode);
        return {
          contacts: values.reduce((score, row) => score + row.contacts, 0),
          stages: values.reduce((score, row) => score + row.activeStages, 0),
          horizontalDistance: values.reduce((score, row) => score + row.horizontalDistance, 0),
          verticalDistance: values.reduce((score, row) => score + row.verticalDistance, 0),
          dirChanges: values.reduce((score, row) => score + row.dirChanges, 0),
        };
      };
      summary[difficulty] = { stationary: totals("stationary"), pilot: totals("pilot") };
    }
    const report = { summary, rows, baseline,
      method: "Fixed seed, the same early/mid/final first forms, Azure, and 27 seconds per encounter. The game uses real movement and damage. Weapons and shields are held out so firing progress does not shorten the movement comparison. Extra lives provide an observation window. Baseline disables bespoke scheduling only." };
    if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(summary));
    assert.ok(summary.hard.pilot.contacts < summary.hard.stationary.contacts);
    assert.ok(summary.nightmare.pilot.contacts < summary.nightmare.stationary.contacts);
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
