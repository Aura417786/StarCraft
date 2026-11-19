"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

function sampleEncounter({ type, difficulty, finale }) {
  const seed = 4225;
  balanceStart({ seed, bossType: type, difficulty, fighter: "red",
    mode: "campaign", build: "stock", policy: "pilot", fixture: "preset" });
  const target = boss;
  bossPresentation = null;
  Object.assign(target, bossArena(type));
  const bounds = finaleBounds();
  const activeWidth = Math.max(1, bounds.width);
  const activeHeight = Math.max(1, bounds.height);
  function place(x, y) {
    player.previousX = player.x;
    player.previousY = player.y;
    player.x = bounds.left + activeWidth * x;
    player.y = bounds.top + activeHeight * y;
  }
  place(.53, .53);
  let hazards, contact;
  if (finale) {
    beginBossFinale(target);
    target.finale.beat = 1;
    target.finale.age = target.finale.transform + .04;
    buildBossFinaleCombo(target, bounds, 1);
    hazards = target.finale.hazards;
    contact = () => bossFinaleContact(target) === move;
  } else {
    target.pressureComboIndex = 0;
    prepareAlienAttack(target, false);
    hazards = bossHazards;
    contact = () => alienHazardHitsPlayer(move);
  }
  const move = hazards.find(hazard => (hazard.kind ?? hazard.type) === "mobility");
  if (!move) throw new Error("No mobility challenge from production scheduler");
  if (type === 9) {
    const begin = move.tellAt ?? 0;
    for (let i = 0; i < 6; i++) {
      place(.22 + .081 * i, .25 + .080 * i);
      move.age = begin + i * .131;
      BossMobility.advance(move);
    }
  }
  // Select just the new technique when quantifying collision coverage. The
  // nightmare-bosses suite separately searches routes through full overlaps.
  hazards.splice(0, hazards.length, move);
  const marks = new Set();
  let struck = 0, escaped = 0, premature = 0;
  for (const progress of [-.2, .03, .19, .34, .52, .67, .79, .90]) {
    move.age = move.warning + move.duration * progress;
    const row = [];
    for (let x = 1; x < 15; x++) {
      for (let y = 1; y < 19; y++) {
        place(x / 15, y / 19);
        if (contact()) {
          if (progress < 0) premature++;
          else { row.push(x * 20 + y); struck++; }
        } else if (progress >= 0) escaped++;
      }
    }
    if (progress >= 0) marks.add(row.join(","));
  }
  return { type: type + 1, difficulty, finale, warning: move.warning - (move.tellAt ?? 0),
    duration: move.duration, struck, escaped, premature, changingStages: marks.size,
    width: activeWidth, height: activeHeight };
}

function checkActions() {
  const stance = (type) => {
    balanceStart({ seed: 4225, bossType: type, difficulty: "nightmare", fighter: "red",
      mode: "campaign", build: "stock", policy: "pilot", fixture: "preset" });
    Object.assign(boss, bossArena(type));
    bossPresentation = null;
    const room = mechanicRoom();
    player.x = player.previousX = room.left + room.width * .38;
    player.y = player.previousY = room.top + room.height * .50;
    boss.pressureComboIndex = -1;
    prepareAlienAttack(boss, false);
    const hazard = bossHazards.find(hazard => hazard.kind === "mobility");
    if (!hazard) throw new Error("Mobility hazard missing on the first Nightmare chain");
    bossHazards.splice(0, bossHazards.length, hazard);
    return { room, hazard };
  };
  const trough = stance(0);
  trough.hazard.age = trough.hazard.warning + .27 * trough.hazard.duration;
  const pull = alienCurrentVector();
  trough.hazard.age = trough.hazard.warning + .72 * trough.hazard.duration;
  const reverse = alienCurrentVector();
  const root = stance(7);
  const seedX = root.room.left + root.room.width * .57;
  const seedY = root.room.top + root.room.height * (root.hazard.side === 1 ? .69 : .31);
  player.x = player.previousX = seedX;
  player.y = player.previousY = seedY;
  root.hazard.age = root.hazard.warning + .06 * root.hazard.duration;
  updateBossProjectiles(1 / 60);
  root.hazard.age = root.hazard.warning + .30 * root.hazard.duration;
  const sporeCoverage = () => {
    let hits = 0;
    for (let step = -9; step <= 9; step++) {
      player.y = seedY + step * root.room.height * .024;
      if (alienHazardHitsPlayer(root.hazard)) hits++;
    }
    return hits > 0;
  };
  const hatching = sporeCoverage();
  const intercepted = interceptAlienRound({ previousX: seedX - 16, x: seedX + 16, y: seedY });
  const afterShot = sporeCoverage();

  const prism = stance(5);
  prism.hazard.age = prism.hazard.warning + .12 * prism.hazard.duration;
  player.x = player.previousX = prism.room.left;
  const mirrorX = prism.room.left + prism.room.width * .73;
  const mirrorY = prism.room.top + prism.room.height * (prism.hazard.side === 1 ? .70 : .30);
  const count = bossProjectiles.length;
  const returned = interceptAlienRound({ previousX: mirrorX - 11, x: mirrorX + 11, y: mirrorY });
  const reflection = bossProjectiles.length === count + 1 ? bossProjectiles.at(-1) : null;

  const tape = stance(9);
  const begin = tape.hazard.tellAt ?? 0;
  player.x = tape.room.left + tape.room.width * .11;
  player.y = tape.room.top + tape.room.height * .22;
  for (let i = 0; i < 6; i++) {
    tape.hazard.age = begin + i * .14;
    updateBossProjectiles(1 / 60);
  }
  tape.hazard.age = tape.hazard.warning + .5 * tape.hazard.duration;
  const onTape = alienHazardHitsPlayer(tape.hazard);
  player.x += tape.room.width * .35;
  player.y += tape.room.height * .31;
  const offTape = alienHazardHitsPlayer(tape.hazard);
  return { pull: pull.x, reverse: reverse.x, hatching, intercepted, afterShot, returned,
    reflection: reflection ? { turning: Math.abs(reflection.vy) > 120, facingPlayer: reflection.vx < 0 } : null,
    onTape, offTape };
}

async function main() {
  const game = path.resolve(process.argv[2] ?? ".");
  const reportFile = process.argv[3];
  const rows = [];
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 412, height: 915 }]) {
      const { page, errors } = await createPage(browser, game, true, { pageOptions: { viewport } });
      for (const difficulty of ["easy", "normal", "hard", "nightmare"]) {
        for (let type = 0; type < 11; type++) {
          for (const finale of [false, true]) {
            const row = await page.evaluate(sampleEncounter, { type, difficulty, finale });
            assert.ok(row.warning >= 1.35 && row.premature === 0, JSON.stringify(row));
            // Dense hazards may occupy half the sampled strip during
            // portrait play. Its full movement route is checked separately.
            assert.ok(row.struck > 0 && row.escaped > row.struck / 3 && row.changingStages >= 3, JSON.stringify(row));
            rows.push({ viewport, ...row });
          }
        }
      }
      await page.context().close();
      assert.deepEqual(errors, []);
    }
    const { page, errors } = await createPage(browser, game, true);
    const interactions = await page.evaluate(checkActions);
    assert.ok(interactions.pull < -30 && interactions.reverse > 30, JSON.stringify(interactions));
    assert.ok(interactions.hatching && interactions.intercepted && !interactions.afterShot, JSON.stringify(interactions));
    assert.deepEqual(interactions.reflection, { turning: true, facingPlayer: true });
    assert.ok(interactions.returned && interactions.onTape && !interactions.offTape, JSON.stringify(interactions));
    assert.deepEqual(errors, []);
    const report = { rows, interactions };
    if (reportFile) fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");
    console.log(`${rows.length} movement samples passed, including proximity spores, reflected fire, live currents and recorded flight contact`);
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
