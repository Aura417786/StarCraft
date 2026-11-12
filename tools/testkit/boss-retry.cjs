"use strict";

// Browser regression for the death-screen checkpoint. Fixtures stage an encounter,
// then use production death, DOM clicks, keyboard events and production frames.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { chromium } = require("playwright");

const game = path.resolve(process.argv[2] || ".");
const output = path.resolve(process.argv[3] || "boss-retry-results");
const origin = "https://star-breaker-boss-retry.invalid";
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".ogg": "audio/ogg", ".wasm": "application/wasm" };

function installHeldClock() {
  const raf = window.requestAnimationFrame.bind(window);
  let frame = null, tick = 1000;
  window.requestAnimationFrame = callback => {
    if (callback.name !== "drawFrame") return raf(callback);
    frame = callback;
    return -1;
  };
  window.retryTestFrame = (seconds = 1 / 60) => {
    if (!frame) throw new Error("Game frame has not been scheduled");
    tick += seconds * 1000;
    frame(tick);
  };
}

async function open(browser, errors, held = true) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", error => errors.push(error.stack || error.message));
  page.on("response", response => {
    if (response.status() >= 400 && response.url().startsWith(origin) && !response.url().endsWith("favicon.ico"))
      errors.push(response.status() + " " + response.url());
  });
  await page.addInitScript(() => {
    localStorage.setItem("star-breaker-guide-seen", "1");
    localStorage.setItem("star-breaker-flight-training", "1");
    localStorage.setItem("star-breaker-opening-seen", "1");
    localStorage.setItem("star-breaker-muted", "true");
  });
  if (held) await page.addInitScript(installHeldClock);
  await page.route(origin + "/**", route => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(game, name);
    if (!file.startsWith(game + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
      return route.fulfill({ status: 404 });
    return route.fulfill({ path: file, contentType: mime[path.extname(file)] || "application/octet-stream" });
  });
  await page.goto(origin);
  await page.bringToFront();
  await page.waitForFunction(() => typeof showScreen === "function");
  const guide = page.locator(".flight-guide-actions button").first();
  if (await guide.isVisible()) await guide.click();
  await page.evaluate(() => {
    window.retryTestStats = () => ({
      fighter: sortieFighter,
      weapon: { ...weapon },
      evolution: { route: evolution.route, level: evolution.level, cooldown: evolution.cooldown,
        frozenRemaining: evolution.frozenRemaining,
        pierce: evolution.pierce, blast: evolution.blast, aegis: evolution.aegis,
        capstone: evolution.capstone, resetUsed: evolution.resetUsed, reassignments: evolution.reassignments,
        links: { ...evolution.links }, refits: evolution.refits },
      lives: player.lives, maxLives: player.maxLives, speed: player.speed,
      ultimate: { charges: ultimate.charges, energy: ultimate.energy },
      shield: { charges: shield.charges, energy: shield.energy },
      momentum: structuredClone(momentum),
      cooldowns: { lance: evolutionWeapons.lanceCooldown, drone: evolutionWeapons.droneCooldown,
        intercept: evolutionWeapons.interceptCooldown, red: fighterCombat.redCooldown,
        capacitor: fighterCombat.capacitor },
      fireMode: firingStyle.mode,
      score, kills, battleTime, bossDefeated,
      spawn: { enemyCooldown, enemySpawnCount, powerupCooldown, powerupSpawnCount },
      run: { mode: sortieStats.mode, difficulty: sortieStats.difficulty, seed: sortieStats.seed,
        bossType: sortieStats.bossType, daily: sortieStats.daily, week: sortieStats.week,
        rules: { ...sortieStats.rules }, upgrades: { ...sortieStats.upgrades },
        guardReady: sortieStats.guardReady, hitDebt: sortieStats.hitDebt, hitsTaken: sortieStats.hitsTaken,
        bossRecords: structuredClone(sortieStats.bossRecords), unlocks: [...sortieStats.unlocks] }
    });
    window.retryTestDie = () => {
      clearPause();
      // Staging skips cinematic invulnerability; actual damage/settlement is
      // still production code and the restored encounter must replay entry.
      resetBossPresentation();
      canvas.focus();
      bossHitGrace = 0;
      shield.remaining = 0;
      player.lives = 1;
      sortieStats.guardReady = false;
      sortieStats.hitDebt = 2;
      const damaged = damagePlayer("Checkpoint regression hit");
      if (!damaged || state !== "over") throw new Error("Production damage did not reach the death screen");
    };
    window.retryTestMutate = () => {
      applyPowerup("red"); applyPowerup("blue"); applyPowerup("yellow");
      evolution.pierce = 3; evolution.blast = 3; evolution.aegis = 3;
      evolution.links.falcon = !evolution.links.falcon;
      weapon.damage = 999; weapon.interval = .01;
      player.maxLives += 8; ultimate.charges = 0; ultimate.energy = 0;
      shield.charges = 0; shield.energy = 0;
      momentum.count += 10; momentum.remaining = 1;
      fighterCombat.capacitor = .01;
      score += 12345; kills += 23; battleTime += 38;
      firingStyle.mode = firingStyle.mode === "focus" ? "spread" : "focus";
      for (let n = 0; n < 19; n++) sortieRandom();
      bullets.push({ x: 10, y: 10, damage: 1 });
      bossProjectiles.push({ x: 30, y: 30, vx: 0, vy: 0 });
      bossHazards.push({ kind: "stale-test" });
    };
  });
  return page;
}

async function stage(page, fixture) {
  return page.evaluate(fixture => {
    showScreen("battle", fixture);
    if (typeof clearFlightTutorial === "function") clearFlightTutorial();
    const type = sortieStats.bossType ?? fixture.type;
    battleTime = 73 + type * 40;
    bossDefeated = sortieMode() === "practice" || sortieMode() === "daily" ? 0 : type;
    score = 4100 + type * 100; kills = 19 + type;
    weapon.damageLevel = 7; weapon.speedLevel = 5; weapon.damage = 14.75;
    weapon.interval = .173; weapon.lanes = 4; weapon.tier = 3;
    Object.assign(evolution, { pierce: 2, blast: 1, aegis: 2, capstone: "", resetUsed: true, reassignments: 1, refits: 1 });
    Object.assign(evolution, { route: { red: "ember", blue: "frost", yellow: "rewind" }[sortieFighter],
      level: 7, cooldown: 6.75, frozenRemaining: 0 });
    evolution.links.falcon = true;
    player.lives = 4; player.maxLives = 7;
    ultimate.charges = 3; ultimate.energy = 37.25;
    shield.charges = sortieRules().noShield ? 0 : 1;
    shield.energy = sortieRules().noShield ? 0 : 9.5;
    Object.assign(momentum, { count: 37, best: 42, remaining: 3.4, elapsed: 1.2, nextRageAt: 40 });
    momentum.rewardQueue.push("red");
    evolutionWeapons.lanceCooldown = 2.2; evolutionWeapons.droneCooldown = .32;
    evolutionWeapons.interceptCooldown = 4.2;
    fighterCombat.redCooldown = .19; fighterCombat.capacitor = .63;
    firingStyle.mode = "focus";
    enemyCooldown = .37; enemySpawnCount = 23;
    powerupCooldown = 1.75; powerupSpawnCount = 9;
    sortieStats.guardReady = true; sortieStats.hitDebt = .37; sortieStats.hitsTaken = 2;
    if (type > 0 && (sortieMode() === "campaign" || sortieMode() === "rush"))
      sortieStats.bossRecords.push({ type: 0, seconds: 43.25, hitCount: 1, builds: [] });
    for (let n = 0; n < 11; n++) sortieRandom();
    const expected = retryTestStats();
    spawnBoss(type);
    return { expected, type, rngAfterSpawn: sortieStats.random.getState(),
      health: { hp: boss.hp, baseHealth: boss.baseHealth, healthLog: boss.healthLog, scaling: boss.scaling } };
  }, fixture);
}

async function readRestored(page) {
  return page.evaluate(() => ({
    stats: retryTestStats(), state, paused: pauseView, focused: document.activeElement.id,
    retried: sortieStats.retried, boss: { type: boss?.type, phase: boss?.phase, finale: !!boss?.finale,
      hp: boss?.hp, baseHealth: boss?.baseHealth, healthLog: boss?.healthLog, scaling: boss?.scaling },
    rng: sortieStats.random.getState(),
    transients: { bossShots: bossProjectiles.length, bossHazards: bossHazards.length, bullets: bullets.length,
      enemies: enemies.length, ultimatePhase: ultimate.phase },
    profile: structuredClone(sortieProfile.data)
  }));
}

function assertRestored(actual, before, message) {
  assert.deepEqual(actual.stats, before.expected, message + ": pre-encounter stats changed");
  assert.equal(actual.state, "battle", message);
  assert.equal(actual.paused, "", message);
  assert.equal(actual.focused, "game-canvas", message);
  assert.equal(actual.retried, true, message);
  assert.deepEqual(actual.boss, { type: before.type, phase: "enter", finale: false, ...before.health }, message + ": Boss did not restart from body entrance");
  assert.equal(actual.rng, before.rngAfterSpawn, message + ": seeded random state was not restored");
  assert.deepEqual(actual.transients, { bossShots: 0, bossHazards: 0, bullets: 0, enemies: 0, ultimatePhase: "idle" }, message + ": stale attacks leaked");
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const errors = [], evidence = { schema: "star-breaker-boss-retry/1", fixtures: [], allPassed: false,
    methodology: "Fixtures stage encounters and loadouts, then use production damagePlayer, DOM controls and unmodified game scripts. Main assertions hold the game RAF to inspect the precise restoration instant; a separate real-RAF smoke checks keyboard input and normal advancement. This is not a natural full-campaign clear or hardware gamepad test." };
  const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
  const fingerprint = createHash("sha256");
  for (const file of ["index.html", ...[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1])])
    fingerprint.update(file).update(fs.readFileSync(path.join(game, file)));
  evidence.sourceFingerprint = fingerprint.digest("hex");
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true,
    args: ["--disable-renderer-backgrounding", "--disable-background-timer-throttling"] });
  evidence.browser = browser.version();
  let page;
  try {
    page = await open(browser, errors);
    const dailyDays = await page.evaluate(() => {
      const days = Array.from({ length: 28 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
      return [days.find(day => dailySortie(day).rules.includes("sealed-shield")),
        days.find(day => !dailySortie(day).rules.includes("sealed-shield"))];
    });
    const fixtures = [
      { mode: "campaign", fighter: "red", type: 0, seed: 4225, difficulty: "veteran" },
      { mode: "campaign", fighter: "blue", type: 5, seed: 8234, difficulty: "abyss", finale: true },
      { mode: "campaign", fighter: "yellow", type: 10, seed: 9191, difficulty: "recruit", finale: true },
      { mode: "rush", fighter: "red", type: 1, seed: 4211, difficulty: "veteran" },
      { mode: "rush", fighter: "blue", type: 6, seed: 4212, difficulty: "abyss", finale: true },
      { mode: "rush", fighter: "yellow", type: 9, seed: 4213, difficulty: "recruit" },
      { mode: "practice", bossType: 2, seed: 4214 },
      { mode: "daily", day: dailyDays[0] },
      { mode: "daily", day: dailyDays[1], finale: true },
      { mode: "rush", fighter: "blue", type: 3, week: "2026-11-09" }
    ];
    for (const [index, fixture] of fixtures.entries()) {
      const before = await stage(page, fixture);
      await page.evaluate(finale => {
        if (finale) beginBossFinale(boss);
        retryTestMutate(); retryTestDie();
      }, !!fixture.finale);
      assert.equal(await page.locator("#boss-retry-button").isVisible(), true, "Boss death must offer retry");
      const profileAfterFirstDeath = await page.evaluate(() => structuredClone(sortieProfile.data));
      if (index === 0) {
        await page.evaluate(() => setGameLanguage("zh-CN"));
        evidence.chineseLabel = await page.locator("#boss-retry-button").textContent();
        assert.match(evidence.chineseLabel, /首领|Boss|BOSS/);
        await page.evaluate(() => retryTestFrame());
        await page.screenshot({ path: path.join(output, "boss-death-retry-zh.png") });
        await page.evaluate(() => setGameLanguage("en"));
        evidence.englishLabel = await page.locator("#boss-retry-button").textContent();
        assert.match(evidence.englishLabel, /boss/i);
        assert.doesNotMatch(evidence.englishLabel, /[\u4e00-\u9fff]/);
        await page.screenshot({ path: path.join(output, "boss-death-retry-en.png") });
        // Native Enter activation, not calling the implementation directly.
        await page.locator("#boss-retry-button").focus();
        await page.keyboard.press("Enter");
      } else await page.locator("#boss-retry-button").click();
      const restored = await readRestored(page);
      assertRestored(restored, before, `Fixture ${index + 1}`);
      assert.deepEqual(restored.profile, profileAfterFirstDeath, "Retry must not rewind account progress or add settlement rewards");
      await page.evaluate(() => { retryTestMutate(); retryTestDie(); });
      assert.deepEqual(await page.evaluate(() => structuredClone(sortieProfile.data)), profileAfterFirstDeath,
        "Death after retry must not duplicate the already-settled kills, Boss records, attempts or awards");
      await page.locator("#boss-retry-button").click();
      assertRestored(await readRestored(page), before, `Repeated retry ${index + 1}`);
      evidence.fixtures.push({ fixture, before, restored: { ...restored, profile: undefined }, repeatedRetry: true, noDuplicateSettlement: true });
      console.log(`PASS ${index + 1}: ${fixture.mode}, ${before.expected.fighter}, Boss ${before.type + 1}${fixture.finale ? " finale" : " body"}`);
    }

    // Arrival already clears in-flight attacks and refunds an interrupted charge.
    // Compare against the ORIGINAL post-arrival state, not an invented behavior:
    // each retry must refund exactly the same one charge, never accumulate more.
    evidence.activeSkills = [];
    for (const fighter of ["red", "blue", "yellow"]) for (const phase of ["charging", "firing"]) {
      const before = await page.evaluate(({ fighter, phase }) => {
        showScreen("battle", { mode: "campaign", fighter, seed: 6427 });
        battleTime = 65;
        ultimate.charges = 4; ultimate.energy = 29.5;
        shield.charges = 2; shield.energy = 0;
        if (!requestShield() || !requestUltimate()) throw new Error("Could not stage active skills");
        if (phase === "firing") fireUltimate();
        // Exercise stale WeakSet registries (red/yellow) and enemy refs (blue).
        if (ultimate.kind === "blue" && ultimate.shot)
          ultimate.shot.missiles[0].target = { x: 800, y: 300, hp: 1 };
        fighterCombat.field = { x: 350, y: 290, remaining: .3, radius: 100 };
        evolutionWeapons.armorRoundRemaining = .4;
        spawnBoss(0);
        return { expected: retryTestStats(), type: 0, rngAfterSpawn: sortieStats.random.getState(),
          health: { hp: boss.hp, baseHealth: boss.baseHealth, healthLog: boss.healthLog, scaling: boss.scaling },
          active: { shield: structuredClone(shield), ultimatePhase: ultimate.phase, cannonLink: { ...cannonLink },
            field: fighterCombat.field, armorRound: evolutionWeapons.armorRoundRemaining } };
      }, { fighter, phase });
      for (let attempt = 1; attempt <= 2; attempt++) {
        await page.evaluate(() => { retryTestMutate(); retryTestDie(); });
        await page.locator("#boss-retry-button").click();
        assertRestored(await readRestored(page), before, `${fighter} ${phase} retry ${attempt}`);
        assert.deepEqual(await page.evaluate(() => ({ shield: structuredClone(shield), ultimatePhase: ultimate.phase,
          cannonLink: { ...cannonLink }, field: fighterCombat.field, armorRound: evolutionWeapons.armorRoundRemaining })),
        before.active, `${fighter} ${phase}: initial cleanup/refund or active shield changed on retry`);
      }
      evidence.activeSkills.push({ fighter, phaseAtArrival: phase, stateAfterArrival: before.active,
        expectedCharges: before.expected.ultimate.charges, repeatedRetry: true });
      console.log(`PASS active skill: ${fighter} ${phase}`);
    }

    // A newly entered Boss replaces the old checkpoint; retrying the old one does not.
    await stage(page, { mode: "campaign", fighter: "yellow", type: 3, seed: 5150 });
    const next = await page.evaluate(() => {
      boss = null; bossDefeated = 4; battleTime += 46; weapon.damage = 23.75;
      ultimate.charges = 2; shield.energy = 4.75; player.lives = 3;
      const expected = retryTestStats();
      spawnBoss(4);
      return { expected, type: 4, rngAfterSpawn: sortieStats.random.getState(),
        health: { hp: boss.hp, baseHealth: boss.baseHealth, healthLog: boss.healthLog, scaling: boss.scaling } };
    });
    await page.evaluate(() => { retryTestMutate(); retryTestDie(); });
    await page.setViewportSize({ width: 960, height: 540 });
    await page.locator("#boss-retry-button").click();
    const afterResize = await readRestored(page);
    assertRestored(afterResize, next, "New encounter after resizing result screen");
    evidence.newBossAndResize = { type: afterResize.boss.type, width: 960, height: 540, checkpointReplaced: true };
    assert.ok(await page.evaluate(() => Number.isFinite(player.x) && Number.isFinite(player.y)
      && player.x >= flightBounds.left && player.x <= bossPlayerRight()
      && player.y >= flightBounds.top && player.y <= flightBounds.bottom), "Restored player is outside current viewport bounds");

    await page.evaluate(() => retryTestDie());
    evidence.layouts = [];
    for (const size of [{ width: 640, height: 360 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(size);
      for (const language of ["zh-CN", "en"]) {
        await page.evaluate(language => setGameLanguage(language), language);
        await page.locator("#boss-retry-button").focus();
        await page.locator("#boss-retry-button").scrollIntoViewIfNeeded();
        const box = await page.locator("#boss-retry-button").boundingBox();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width + 1
          && box.y + box.height <= size.height + 1, "Retry button is inaccessible at " + JSON.stringify({ ...size, language }));
        evidence.layouts.push({ ...size, language, accessible: true });
        if (size.width === 640 && language === "en")
          await page.screenshot({ path: path.join(output, "boss-retry-640-en.png") });
      }
    }
    await page.locator("#boss-retry-button").click();

    // Winning/ordinary deaths and explicit restart/menu must not offer stale checkpoints.
    await page.evaluate(() => { boss = null; retryTestDie(); });
    assert.equal(await page.locator("#boss-retry-button").isVisible(), false);
    await page.locator("#restart-button").click();
    assert.equal(await page.evaluate(() => boss), null);
    assert.equal(await page.evaluate(() => battleTime), 0);
    await page.evaluate(() => retryTestDie());
    assert.equal(await page.locator("#boss-retry-button").isVisible(), false);
    await stage(page, { mode: "practice", bossType: 7, seed: 5151 });
    await page.evaluate(() => endGame(true));
    assert.equal(await page.locator("#boss-retry-button").isVisible(), false);
    await page.locator("#result-menu-button").click();
    await page.locator("#start-button").click();
    await page.evaluate(() => retryTestDie());
    assert.equal(await page.locator("#boss-retry-button").isVisible(), false);
    evidence.gating = { ordinaryDeath: true, win: true, restartClears: true, menuClears: true };

    // Settlement remains disabled after a retried run wins; first-time campaign
    // progression uses the existing idempotent Boss award, never a save rollback.
    await stage(page, { mode: "campaign", fighter: "red", type: 8, seed: 5152 });
    await page.evaluate(() => retryTestDie());
    await page.locator("#boss-retry-button").click();
    evidence.unlock = await page.evaluate(() => {
      const before = sortieProfile.data.points;
      sortieBossCleared(boss);
      const first = sortieProfile.data.points;
      const unlocked = sortieProfile.data.unlocked.includes(boss.type);
      // Simulate an identical duplicate event as a defence-in-depth assertion.
      sortieBossCleared(boss);
      const repeated = sortieProfile.data.points;
      const profile = structuredClone(sortieProfile.data);
      endGame(true);
      return { before, first, repeated, unlocked, profile, after: structuredClone(sortieProfile.data) };
    });
    assert.equal(evidence.unlock.unlocked, true);
    assert.ok(evidence.unlock.first >= evidence.unlock.before);
    assert.equal(evidence.unlock.repeated, evidence.unlock.first);
    assert.deepEqual(evidence.unlock.after, evidence.unlock.profile, "Retried victory must not create ranked/achievement duplicates");

    // Independent unmodified real-RAF smoke: recovery actually runs, accepts a
    // keyboard direction, fires and advances past the entry phase.
    await page.close();
    page = await open(browser, errors, false);
    await page.evaluate(() => {
      showScreen("battle", { mode: "practice", bossType: 0, seed: 6225 });
      spawnBoss(0); retryTestDie();
    });
    await page.locator("#boss-retry-button").click();
    await page.waitForFunction(() => state === "battle" && boss?.phase !== "enter" && battleTime > 1, null, { timeout: 15000 });
    const startY = await page.evaluate(() => player.y);
    await page.keyboard.down("ArrowUp");
    await page.waitForFunction(y => player.y < y - 30, startY);
    await page.keyboard.up("ArrowUp");
    evidence.live = await page.evaluate(() => ({ state, type: boss?.type, phase: boss?.phase, time: battleTime,
      lives: player.lives, movedY: player.y, bullets: bullets.length, focused: document.activeElement.id, retried: sortieStats.retried }));
    assert.equal(evidence.live.state, "battle");
    assert.ok(evidence.live.lives > 0);
    assert.equal(evidence.live.focused, "game-canvas");
    assert.ok(evidence.live.bullets > 0, "Restored battle no longer fires");
    await page.screenshot({ path: path.join(output, "boss-retry-live.png") });
    assert.deepEqual(errors, [], "Browser/runtime/resource errors");
    evidence.allPassed = true;
  } catch (error) {
    evidence.failure = error.stack || String(error);
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
    throw error;
  } finally {
    evidence.errors = errors;
    fs.writeFileSync(path.join(output, "boss-retry.json"), JSON.stringify(evidence, null, 2) + "\n");
    await browser.close();
  }
  console.log(`Boss retry checks passed. Evidence: ${output}`);
}

module.exports = { open, installHeldClock };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
