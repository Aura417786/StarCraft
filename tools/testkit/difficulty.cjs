"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");
const game = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const profile = require(path.join(game, "profile.js"));
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const store = profile.createStore(storage);
  const run = { mode: "campaign", won: true, score: 1234, seconds: 88, kills: 10,
    bossRecords: [{ type: 0, seconds: 20, hitCount: 0 }], fighter: "red" };
  for (const [index, difficulty] of ["recruit", "veteran", "abyss"].entries())
    store.finish({ ...run, difficulty, score: 1234 + index });
  const legacy = structuredClone(store.data.campaign.byDifficulty);
  store.rememberRush({ boss: 4, seed: 4225, difficulty: "abyss", fighter: "blue" });
  const loaded = profile.createStore(storage);
  assert.deepEqual(profile.difficulties, ["easy", "normal", "hard"]);
  for (const id of profile.legacyDifficulties) assert.deepEqual(loaded.data.campaign.byDifficulty[id], legacy[id]);
  for (const id of profile.difficulties) assert.equal(loaded.data.campaign.byDifficulty[id].attempts, 0);
  loaded.finish({ ...run, difficulty: "hard" });
  assert.equal(loaded.data.campaign.byDifficulty.hard.attempts, 1);
  for (const id of profile.legacyDifficulties) assert.deepEqual(loaded.data.campaign.byDifficulty[id], legacy[id]);
  assert.equal(loaded.data.rushResume.difficulty, "abyss", "Legacy resume is retained until launch normalizes its input");

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const { page, errors } = await createPage(browser, game, true);
    const cases = await page.evaluate(() => {
      const cases = [];
      for (const fighter of ["red", "blue", "yellow"]) for (const type of [0, 5, 10]) {
        for (const upgraded of [false, true]) for (const difficulty of ["easy", "normal", "hard"]) {
          showScreen("battle", { fighter, difficulty, seed: 4225 });
          raiseWeaponFloor(upgraded ? { damageLevel: 24, rateLevel: 11, laneLevel: 5 } : progressionPresetForBoss(type));
          spawnBoss(type);
          resetBossPresentation();
          Object.assign(boss, bossArena(type), { phase: "recover" });
          prepareAlienAttack(boss);
          const hp = boss.baseHealth, power = boss.scaling.power, k = boss.scaling.k;
          const tell = boss.telegraphDuration, recovery = alienRecoveryDuration(boss), active = boss.attackDuration;
          const originalHardRecovery = Math.max(boss.alienAttack ? .8 : .35,
            Math.max(.42, bossRules.recovery + (boss.alienAttack === "pressure" ? .28 : 0) - boss.type * .029
              - (boss.enraged && boss.alienAttack !== "pressure" ? .16 : 0))
            / (1 + (Math.max(1, boss.scaling.hpMul) - 1) * .26));
          const interval = boss.attackInterval;
          bossProjectiles.length = 0;
          addBossProjectile(boss.x, boss.y, -500, 0);
          const projectileSpeed = Math.hypot(bossProjectiles[0].vx, bossProjectiles[0].vy);
          let lattice = null;
          if (type !== finalAlienType) {
            boss.pressureFireTime = 0;
            bossProjectiles.length = 0;
            for (let tick = 1; tick <= 300; tick++) {
              updateBossPressure(boss, 1 / 120);
              if (bossProjectiles.length) { lattice = tick / 120; break; }
            }
          }
          applyPowerup("red");
          const locked = boss.baseHealth === hp && boss.scaling.power === power && boss.scaling.k === k;
          beginBossFinale(boss);
          resetBossPresentation();
          const finaleHp = boss.baseHealth;
          const final = boss.finale;
          for (let tick = 0; tick < 1200 && !(final.attackInterval > 0); tick++) updateBossFinale(boss, 1 / 120);
          cases.push({ fighter, type, upgraded, difficulty, power, k, hp, locked, tell, active, recovery, originalHardRecovery, interval,
            projectileSpeed, lattice, finaleHp, finaleInterval: final.attackInterval, rules: { ...sortieRules() } });
        }
      }
      return cases;
    });
    for (let i = 0; i < cases.length; i += 3) {
      const [easy, normal, hard] = cases.slice(i, i + 3);
      for (const sample of [easy, normal, hard]) {
        assert.equal(sample.hp, hard.hp);
        assert.equal(sample.power, hard.power);
        assert.equal(sample.k, hard.k);
        assert.equal(sample.locked, true);
        assert.equal(sample.tell, hard.tell);
        assert.equal(sample.active, hard.active, "Difficulty must not retime an active attack");
        assert.equal(sample.rules.damage, 1);
        assert.equal(sample.rules.bossHealth, 1);
      }
      for (const field of ["recovery", "interval", "finaleInterval"])
        assert.ok(easy[field] > normal[field] && normal[field] > hard[field], JSON.stringify({ field, easy, normal, hard }));
      assert.ok(easy.projectileSpeed < normal.projectileSpeed && normal.projectileSpeed < hard.projectileSpeed);
      assert.ok(Math.abs(hard.recovery - hard.originalHardRecovery) < 1e-10, "Hard recovery must match the original v29 formula");
      assert.ok(Math.abs(easy.interval - hard.interval / .62) < 1e-8, "Easy should slow complete attack cycles to 62% frequency");
      assert.ok(Math.abs(normal.interval - hard.interval / .80) < 1e-8, "Normal should slow complete attack cycles to 80% frequency");
      if (hard.type !== 10) assert.ok(easy.lattice > normal.lattice && normal.lattice > hard.lattice);
    }
    const liveCadence = await page.evaluate(() => ["easy", "normal", "hard"].map(difficulty => {
      showScreen("battle", { difficulty, seed: 4225 });
      raiseWeaponFloor(progressionPresetForBoss(5));
      spawnBoss(5); resetBossPresentation();
      Object.assign(boss, bossArena(5), { phase: "recover", phaseTime: 0 });
      const starts = [];
      for (let tick = 0; tick < 120 * 120 && starts.length < 5; tick++) {
        const before = boss.phase;
        battleTime += 1 / 120;
        updateBossEncounter(1 / 120);
        if (before !== "telegraph" && boss.phase === "telegraph") starts.push(battleTime);
      }
      return { difficulty, starts, measuredMeanInterval: (starts.at(-1) - starts[0]) / (starts.length - 1) };
    }));
    assert.ok(liveCadence.every(item => item.starts.length === 5));
    assert.ok(liveCadence[0].measuredMeanInterval > liveCadence[1].measuredMeanInterval
      && liveCadence[1].measuredMeanInterval > liveCadence[2].measuredMeanInterval,
      "The production Boss scheduler must really leave more time on lower difficulties");
    const migration = [];
    for (const [old, current] of [["recruit", "easy"], ["veteran", "hard"], ["abyss", "hard"]]) {
      await page.evaluate(old => localStorage.setItem(sortieSettingsKey, JSON.stringify({ difficulty: old, rushDifficulty: old })), old);
      await page.reload();
      const result = await page.evaluate(old => {
        newSortie({ difficulty: old });
        const direct = sortieStats.difficulty;
        newSortie(sortieRushResumeOptions({ boss: 4, difficulty: old, fighter: "blue", seed: 4225 }));
        return { settings: { ...sortieSettings }, direct, resumed: sortieStats.difficulty };
      }, old);
      assert.equal(result.settings.difficulty, current);
      assert.equal(result.settings.rushDifficulty, current);
      assert.equal(result.direct, current);
      assert.equal(result.resumed, current);
      migration.push({ old, current, ...result });
    }
    const daily = await page.evaluate(() => {
      let day;
      for (let i = 1; i <= 28; i++) {
        const candidate = `2026-11-${String(i).padStart(2, "0")}`;
        if (dailySortie(candidate).rules.includes("thick-shell")) { day = candidate; break; }
      }
      newSortie({ mode: "daily", day });
      return { day, difficulty: sortieStats.difficulty, rules: { ...sortieRules() } };
    });
    assert.ok(daily.day);
    assert.equal(daily.difficulty, "hard");
    assert.equal(daily.rules.bossHealth, 1);
    assert.equal(daily.rules.attackTempo, 1.12);
    const ui = await page.evaluate(() => {
      showScreen("menu");
      openSortieConsole("settings");
      return { values: [...document.querySelector("#sortie-difficulty").options].map(item => item.value),
        rows: [...document.querySelectorAll(".sortie-difficulty-table tbody tr")].map(row => row.textContent) };
    });
    assert.deepEqual(ui.values, ["easy", "normal", "hard"]);
    assert.equal(ui.rows.length, 3);
    await page.locator(".sortie-difficulty-table").scrollIntoViewIfNeeded();
    assert.ok((await page.locator(".sortie-difficulty-scroll").boundingBox()).height > 100,
      "The difficulty comparison must not collapse inside the scrollable settings grid");
    await page.screenshot({ path: path.join(out, "difficulty-zh.png") });
    await page.evaluate(() => setGameLanguage("en"));
    await page.locator(".sortie-difficulty-table").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, "difficulty-en.png") });
    assert.deepEqual(errors, []);
    const result = { allPassed: true, cases, liveCadence, migration, daily, ui, legacyRecordsRetained: true,
      limits: "Deterministic production-logic fixtures, not subjective difficulty playtesting or a performance benchmark." };
    fs.writeFileSync(path.join(out, "difficulty.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ allPassed: true, cases: cases.length, legacyRecordsRetained: true }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
