"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

function exercise({ seed, difficulty, late }) {
  showScreen("battle", { seed, difficulty, mode: "campaign" });
  nextBossTime = Infinity;
  player.lives = player.maxLives = 10000;
  player.y = player.previousY = flightBounds.top;
  if (late) { battleTime = 180; bossDefeated = 9; }
  const start = battleTime;
  const formed = new Set();
  let peak = 0, projectilePeak = 0, sum = 0, intervals = 0, telegraphedScouts = 0;
  const suspects = new Set();
  const interval = enemyIntervalForTime();
  for (let index = 0; index < 60 * 120; index++) {
    updateEncounter(1 / 60);
    updatePlayerDamage(1 / 60);
    updateEnemyProjectileDamage();
    updateEliteMines(1 / 60);
    if (formationState.active) formed.add(formationState.active.kind);
    for (const enemy of enemies) {
      if (enemy.scoutIntercept?.blast && !suspects.has(enemy)) {
        suspects.add(enemy);
        telegraphedScouts++;
      }
    }
    peak = Math.max(peak, enemies.length);
    projectilePeak = Math.max(projectilePeak, enemyProjectiles.length);
    sum += enemies.length;
    intervals++;
  }
  return { seed, difficulty, late, seconds: Math.round(battleTime - start), interval, waves: enemySpawnCount,
    enemiesMean: sum / intervals, peak, projectilePeak, formed: [...formed], telegraphedScouts,
    elite: Object.values(eliteDirector.spawned).reduce((total, count) => total + count, 0),
    eliteInterval: eliteEncounterInterval(eliteRules.interval), breaches: sortieStats.enemyBreaches ?? 0,
    capacity: enemyWaveCapacity(), projectileCapacity: enemyProjectileCapacity() };
}

function defenseContracts() {
  showScreen("battle", { mode: "campaign", difficulty: "nightmare", seed: 676 });
  player.lives = player.maxLives = 9;
  const result = {};
  const hull = { x: -22, previousX: -18, y: viewport.height * .68, width: 40, height: 20,
    defenseExposure: nightmareWaveRules.minimumExposure, hp: 1 };
  const attempt = (changes = {}) => recordDefenseBreach({ ...hull, ...changes });
  result.outsideSpawn = attempt({ defenseExposure: 0 });
  result.unmarked = attempt({ defenseExposure: undefined });
  result.partial = attempt({ x: -18, previousX: -17 });
  result.dead = attempt({ hp: 0 });
  result.fromOutside = attempt({ previousX: -21 });
  result.insufficient = attempt({ defenseExposure: nightmareWaveRules.minimumExposure - .04 });
  pauseView = "menu";
  result.paused = attempt();
  pauseView = null;
  shield.remaining = 99;
  bossHitGrace = 99;
  enemies.push(hull);
  updatePlayerDamage(1 / 60);
  result.removed = !enemies.includes(hull);
  result.lives = player.lives;
  result.breaches = sortieStats.enemyBreaches;
  result.repeat = recordDefenseBreach(hull);
  result.message = statusMessage.textContent;

  showScreen("battle", { mode: "campaign", difficulty: "hard", seed: 676 });
  result.hardUnchanged = !attempt();
  showScreen("battle", { mode: "campaign", difficulty: "nightmare", seed: 676 });
  player.lives = 1;
  const fatal = { ...hull, defenseBreached: false };
  enemies.push(fatal);
  updatePlayerDamage(1 / 60);
  result.lethal = player.lives === 0 && state === "over" && sortieStats.result?.breaches === 1;
  return result;
}

function attackContracts() {
  showScreen("battle", { mode: "campaign", difficulty: "nightmare", seed: 3002 });
  nextBossTime = Infinity;
  battleTime = 60;
  player.x = player.previousX = flightBounds.left;
  player.y = player.previousY = (flightBounds.top + flightBounds.bottom) / 2;

  spawnEnemy("scout");
  const scout = enemies.at(-1);
  scout.sacrificialScout = true;
  scout.x = scout.previousX = viewport.width * .74;
  scout.y = scout.previousY = scout.baseY = player.y;
  updateEnemyMovement(scout, 1 / 60);
  const blast = scout.scoutIntercept?.blast;
  const windup = scout.scoutIntercept?.windup;
  for (let index = 0; index < 120 && !scout.scoutDetonation; index++) updateEnemyMovement(scout, 1 / 60);
  const contact = scout.scoutDetonation;
  const lives = player.lives;
  updatePlayerDamage(1 / 60);
  const safelyDetonated = !enemies.includes(scout) && lives === player.lives && contact === blast;

  spawnEnemy("gunner");
  const gunner = enemies.at(-1);
  gunner.x = gunner.previousX = gunner.holdX = viewport.width * .75;
  beginEnemyAim(gunner);
  const initialAim = gunner.aimY;
  player.y += 55;
  for (let index = 0; index < 22; index++) {
    updateEnemyMovement(gunner, 1 / 60);
    player.previousY = player.y;
  }
  const adjusted = gunner.aimY;
  gunner.gunTime = gunner.gunWarning * .48;
  player.y += 60;
  updateEnemyMovement(gunner, 1 / 60);
  const locked = adjusted === gunner.aimY;

  resetFormations();
  const cross = formationPlan("crossfire");
  const pursuit = formationPlan("pursuit");
  launchFormation(cross);
  const offscreen = formationState.active.members.filter(enemy => enemy.y < 0 || enemy.y > viewport.height).length;
  const formationTimes = [];
  let oldCue;
  for (let index = 0; index < 60 * 18; index++) {
    const group = formationState.active;
    updateFormations(1 / 60);
    for (const enemy of group.members) updateEnemyMovement(enemy, 1 / 60);
    const cue = group.coordination?.cue;
    if (cue && cue !== oldCue) formationTimes.push({ time: index / 60, warned: cue.warning, shots: cue.shots.length });
    oldCue = cue;
  }
  const fanned = makeFormationCue(pursuit, 1, formationState.active.members).shots.length;
  resetFormations();
  enemies.length = 0;
  eliteDirector.next = battleTime - .1;
  eliteDirector.order = 1;
  launchFormation(pursuit);
  const eliteLeader = formationState.active.members.find(enemy => enemy.formationLeader)?.kind;
  const exitIntervals = [...formationState.active.members]
    .map(enemy => (enemy.formationSlotX + enemy.width * .5) / formationState.active.speed)
    .sort((a, b) => a - b);
  const stagger = Math.min(...exitIntervals.slice(1).map((time, index) => time - exitIntervals[index]));
  resetFormations();
  enemies.length = 0;
  const supply = spawnSupplyTransport();
  const transportEscorts = enemies.filter(enemy => enemy !== supply);
  const eligibility = transportEscorts.every(enemy => enemy.defenseExposure === 0) && supply.defenseExposure === undefined;
  const escortSpacing = (transportEscorts[1].x - transportEscorts[0].x) / transportEscorts[0].speed;
  return { blast, windup, safelyDetonated, adjusted: adjusted > initialAim, locked, offscreen, formationTimes, fanned,
    eliteLeader, stagger, supplyEscortCount: transportEscorts.length, eligibility, escortSpacing };
}

function narrowApproach() {
  showScreen("battle", { mode: "campaign", difficulty: "nightmare", seed: 676 });
  nextBossTime = Infinity;
  battleTime = 250;
  bossDefeated = 9;
  spawnEnemy("scout");
  const scout = enemies.at(-1);
  scout.scoutIntercepted = true;
  markDefenseIntruder(scout);
  const shootableX = flightBounds.left + player.width * .465 + scout.width * .34;
  let opportunities = 0;
  for (let step = 0; step < 60 * 12; step++) {
    const seconds = 1 / 60;
    updateEnemyMovement(scout, seconds);
    trackDefenseIntruder(scout, seconds);
    if (scout.x - scout.width * .5 >= shootableX && scout.x + scout.width * .5 <= viewport.width) opportunities += seconds;
    if (scout.x + scout.width * .5 < 0) break;
  }
  return { width: viewport.width, opportunities, entered: scout.defenseExposure >= nightmareWaveRules.minimumExposure,
    crossed: recordDefenseBreach(scout), lives: player.lives };
}

async function main() {
  const game = path.resolve(process.argv[2] ?? path.join(__dirname, "../.."));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  try {
    const { page, errors } = await createPage(browser, game, true);
    const samples = [];
    for (const seed of [4225, 8871, 314159]) {
      for (const late of [false, true]) {
        for (const difficulty of ["hard", "nightmare"]) samples.push(await page.evaluate(exercise, { seed, late, difficulty }));
      }
    }
    const defense = await page.evaluate(defenseContracts);
    const behavior = await page.evaluate(attackContracts);
    await page.setViewportSize({ width: 464, height: 500 });
    await page.evaluate(() => resizeBattlefield());
    const narrow = await page.evaluate(narrowApproach);
    console.log(JSON.stringify({ samples, defense, behavior, narrow }, null, 2));
    for (const [index, base] of samples.entries()) {
      if (base.difficulty !== "hard") continue;
      const hard = samples[index + 1];
      assert.ok(hard.interval / base.interval <= .750001, "the spawn interval should be at least 25% shorter");
      assert.ok(hard.waves > base.waves && hard.enemiesMean > base.enemiesMean, "more ships should actually enter and stay on screen");
      assert.ok(hard.peak <= hard.capacity && hard.projectilePeak <= hard.projectileCapacity, "nightmare keeps both budgets");
      assert.ok(hard.breaches > 0 && base.breaches === 0, "only nightmare deducts real escape penalties");
      assert.ok(Math.abs(base.eliteInterval / hard.eliteInterval - 1.3) < 1e-8, "elite wave closes its cooldown by a rate of 30%");
    }
    for (const key of ["outsideSpawn", "unmarked", "partial", "dead", "fromOutside", "insufficient", "paused", "repeat"]) {
      assert.equal(defense[key], false, `false breach: ${key}`);
    }
    assert.equal(defense.removed, true);
    assert.equal(defense.hardUnchanged, true);
    assert.equal(defense.lethal, true);
    assert.equal(defense.lives, 8, "an enemy crossing the entire boundary costs exactly one life even with extended shield/grace");
    assert.equal(defense.breaches, 1);
    assert.match(defense.message, /敌机突破防线|breached the defense line/i);
    assert.ok(behavior.blast >= 30 && behavior.windup >= 1 && behavior.safelyDetonated);
    assert.ok(behavior.adjusted && behavior.locked);
    assert.equal(behavior.offscreen, 2);
    assert.equal(behavior.formationTimes.length, 2);
    assert.ok(behavior.fanned >= 2);
    assert.equal(behavior.eliteLeader, "shield-guard");
    assert.ok(behavior.stagger >= .2399);
    assert.equal(behavior.supplyEscortCount, 2);
    assert.equal(behavior.eligibility, true);
    assert.ok(behavior.escortSpacing >= .2399);
    assert.ok(narrow.width < 520 && narrow.opportunities > 1.3 && narrow.entered && narrow.crossed && narrow.lives === 2);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
