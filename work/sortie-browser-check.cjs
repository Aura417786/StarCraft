"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const output = process.argv[2] ? path.resolve(process.argv[2]) : null;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "star-breaker-sortie-"));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".mp3": "audio/mpeg", ".ogg": "audio/ogg" };
const observations = {};
const errors = [];

async function openContext(origin, realClock = false) {
  const browser = await chromium.launchPersistentContext(userData, { executablePath: process.env.CHROME_PATH, headless: true,
    viewport: { width: 1280, height: 720 },
    ...(realClock ? { recordVideo: { dir: path.join(userData, "clips"), size: { width: 1280, height: 720 } } } : {}) });
  const [page] = browser.pages();
  page.on("pageerror", error => errors.push(error.stack ?? error.message));
  if (!realClock) await page.addInitScript(() => {
    let tick;
    let time = 1000;
    window.requestAnimationFrame = next => { tick = next; return 1; };
    window.stepFlight = (frames, ms = 25) => {
      for (let index = 0; index < frames; index++) { time += ms; tick(time); }
    };
  });
  await page.goto(origin);
  if (await page.locator("#flight-guide").evaluate(node => node.open)) {
    await page.locator(".flight-guide-actions button").first().click();
  }
  return { browser, page };
}
const profileOf = page => page.evaluate(() => sortieProfile.data);
const consoleButton = (page, section) => page.locator(`[data-sortie-console="${section}"]`);
const closeConsole = page => page.locator("#sortie-console-close").click();
const screenshot = (page, name) => output ? page.screenshot({ path: path.join(output, name) }) : undefined;

async function defeatFixture(page, type, seconds = 40) {
  return page.evaluate(({ type, seconds }) => {
    if (boss?.type !== type) spawnBoss(type);
    battleTime += seconds;
    defeatBoss();
    advanceBossDeathPresentation(100);
    return { state, defeated: sortieStats.bossRecords.at(-1), pending: evolution.pending };
  }, { type, seconds });
}

async function selectEvolution(page) {
  await page.locator(".evolution-card:enabled").first().click();
  assert.equal(await page.evaluate(() => evolution.pending), false);
}

async function firstSession(page) {
  await consoleButton(page, "upgrades").click();
  assert.equal(await page.locator("[data-refit='firepower']").isDisabled(), true);
  await closeConsole(page);
  await page.locator("#start-button").click();
  await page.keyboard.down("ArrowRight");
  const move = await page.evaluate(() => {
    const start = player.x;
    stepFlight(6);
    return player.x - start;
  });
  await page.keyboard.up("ArrowRight");
  assert.ok(move > 10);
  const first = await defeatFixture(page, 0);
  assert.equal(first.pending, true);
  assert.equal(first.defeated.hitCount, 0);
  await selectEvolution(page);

  await page.evaluate(() => {
    spawnBoss(1);
    resetBossPresentation();
    bossHitGrace = 0;
    damagePlayer(tr("定点受击", "Fixture hit"));
  });
  const second = await defeatFixture(page, 1, 43);
  assert.equal(second.defeated.hitCount, 1);
  await selectEvolution(page);
  await page.evaluate(() => endGame(false));
  assert.match(await page.locator("#sortie-result-summary").innerText(), /刷新纪录/);
  const saved = await profileOf(page);
  assert.equal(saved.points, 4);
  assert.equal(saved.campaign.bosses[0].clean, 1);
  assert.equal(saved.campaign.bosses[1].clean, 0);
  assert.equal(saved.campaign.bestScore, 4000);
  await page.locator("#result-menu-button").click();

  await consoleButton(page, "upgrades").click();
  await page.locator("[data-refit='firepower']").click();
  await page.locator("[data-refit='survival']").click();
  await screenshot(page, "refits-zh-1280.png");
  await closeConsole(page);
  await page.locator("#language-button").click();
  await consoleButton(page, "archive").click();
  assert.equal(await page.locator("#sortie-console-title").innerText(), "Campaign Archive");
  assert.equal(await page.locator(".sortie-archive-table tbody tr").count(), 11);
  await screenshot(page, "archive-en-1280.png");
  observations.campaign = { first, second, saved: { points: saved.points, score: saved.campaign.bestScore, move } };
}

async function laterSession(page) {
  const reopened = await profileOf(page);
  assert.equal(reopened.points, 2);
  assert.equal(reopened.upgrades.firepower, 1);
  assert.equal(reopened.upgrades.survival, 1);
  assert.equal(reopened.campaign.bestScore, 4000);
  await page.locator("#start-button").click();
  const equipment = await page.evaluate(() => ({ level: weapon.damageLevel, shieldEnergy: shield.energy, lives: player.lives }));
  assert.deepEqual(equipment, { level: 2, shieldEnergy: 5, lives: 3 });
  await page.keyboard.press("Escape");
  await page.locator("#pause-exit").click();
  await page.locator("#pause-confirm").click();

  await consoleButton(page, "challenges").click();
  assert.equal(await page.locator(".sortie-practice-grid button:enabled").count(), 2);
  await screenshot(page, "challenges-en-1280.png");
  await page.locator(".sortie-practice-grid button").first().click();
  assert.deepEqual(await page.evaluate(() => [sortieMode(), sortieFighter, player.lives,
    weapon.damageLevel === progressionPresetForBoss(0).damageLevel]), ["practice", "red", 3, true]);
  const practice = await defeatFixture(page, 0);
  assert.equal(practice.state, "over");
  assert.equal(practice.pending, false);
  const afterPractice = await profileOf(page);
  assert.equal(afterPractice.campaign.bestScore, 4000);
  assert.equal(afterPractice.practice[0].clears, 1);
  await page.locator("#result-menu-button").click();

  await consoleButton(page, "challenges").click();
  await page.getByRole("button", { name: "Launch Daily" }).click();
  const daily = await page.evaluate(() => ({ ...sortieStats.daily, rolls: Array.from({ length: 12 }, sortieRandom) }));
  assert.equal(daily.rules.length, 3);
  await defeatFixture(page, daily.bossType);
  assert.ok((await profileOf(page)).daily[daily.day].bestScore > 0);
  await page.locator("#restart-button").click();
  assert.deepEqual(await page.evaluate(() => ({ ...sortieStats.daily, rolls: Array.from({ length: 12 }, sortieRandom) })), daily);
  await page.keyboard.press("Escape");
  await page.locator("#pause-exit").click();
  await page.locator("#pause-confirm").click();

  await consoleButton(page, "challenges").click();
  await page.getByRole("button", { name: "Launch Boss Rush" }).click();
  const sequence = [];
  for (let type = 0; type < 11; type++) {
    const initial = await page.evaluate(() => {
      battleTime = nextBossTime;
      updateEncounter(.02);
      updateBossEncounter(.02);
      return { type: boss.type, enemies: enemies.length, pickups: powerups.length };
    });
    assert.deepEqual(initial, { type, enemies: 0, pickups: 0 });
    sequence.push(initial.type);
    const ended = await defeatFixture(page, type);
    assert.equal(ended.pending, type < 10);
    if (type < 10) await selectEvolution(page);
    else assert.equal(ended.state, "over");
  }
  const rush = await profileOf(page);
  assert.equal(rush.rush.clears, 1);
  assert.equal(rush.rush.furthest, 11);
  assert.equal(rush.campaign.bestScore, 4000);
  await page.locator("#restart-button").click();
  assert.equal(await page.evaluate(() => sortieMode()), "rush");
  await page.evaluate(() => { player.lives = 1; damagePlayer("Fixture loss"); });
  assert.equal((await profileOf(page)).rush.deaths, 1);
  await page.locator("#result-menu-button").click();
  observations.modeIsolation = { practice: afterPractice.practice[0], daily, rushSequence: sequence, equipment };
}

async function settingsAndRecovery(page) {
  const difficulties = await page.evaluate(() => ["recruit", "veteran", "abyss"].map(difficulty => {
    showScreen("battle", { mode: "campaign", difficulty, seed: 22 });
    spawnBoss(0);
    resetBossPresentation();
    prepareAlienAttack(boss);
    const lives = player.lives;
    bossHitGrace = 0;
    damagePlayer("Fixture hit");
    return { difficulty, rules: sortieRules(), tell: boss.telegraphDuration, health: Math.exp(boss.healthLog),
      lost: lives - player.lives, debt: sortieStats.hitDebt, recovery: alienRecoveryDuration(boss) };
  }));
  assert.ok(difficulties[0].health < difficulties[1].health && difficulties[1].health < difficulties[2].health);
  assert.ok(difficulties[0].tell > difficulties[1].tell && difficulties[1].tell > difficulties[2].tell);
  assert.ok(difficulties[0].recovery > difficulties[1].recovery && difficulties[1].recovery > difficulties[2].recovery);
  assert.deepEqual(difficulties.map(difficulty => difficulty.lost), [0, 1, 1]);
  await page.evaluate(() => showScreen("menu"));
  await page.locator("#start-button").click();
  assert.equal(await page.evaluate(() => sortieStats.assisted), false);
  // A mid-run assist is still an assisted run after the player turns it back off.
  for (const mode of ["full", "off", "low"]) {
    await page.locator("#shake-button").click();
    assert.equal(await page.evaluate(() => shakePreference), mode);
  }
  assert.equal(await page.evaluate(() => sortieStats.assisted), true);
  await page.evaluate(() => showScreen("menu"));
  await page.setViewportSize({ width: 640, height: 360 });
  await consoleButton(page, "settings").click();
  await page.locator("#sortie-difficulty").selectOption("abyss");
  await page.locator("#sortie-extended").check();
  await page.locator("#sortie-reduce-shake").selectOption("off");
  await page.locator("#sortie-reduce-motion").check();
  await page.locator("#sortie-radio").uncheck();
  await page.locator("#sortie-quality").selectOption("medium");
  await page.locator("#sortie-sound").uncheck();
  await page.locator("#sortie-volume").evaluate(input => {
    input.value = "37";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await screenshot(page, "settings-en-640.png");
  await closeConsole(page);
  await page.reload();
  await consoleButton(page, "settings").click();
  assert.equal(await page.locator("#sortie-difficulty").inputValue(), "abyss");
  assert.ok(await page.locator("#sortie-extended").isChecked());
  assert.equal(await page.locator("#sortie-reduce-shake").inputValue(), "off");
  assert.ok(await page.locator("#sortie-reduce-motion").isChecked());
  assert.equal(await page.locator("#sortie-quality").inputValue(), "medium");
  assert.equal(await page.locator("#sortie-volume").inputValue(), "37");
  assert.equal(await page.locator("#sortie-radio").isChecked(), false);
  assert.equal(await page.locator("#sortie-sound").isChecked(), false);
  await closeConsole(page);
  await page.locator("#start-button").click();
  await page.evaluate(() => { score = 50_000; endGame(); });
  const assisted = await profileOf(page);
  assert.equal(assisted.assisted.bestScore, 50_000);
  assert.equal(assisted.campaign.bestScore, 26_000);

  await page.evaluate(() => localStorage.setItem(StarBreakerProfile.key, "{corrupted"));
  await page.reload();
  assert.equal(await page.evaluate(() => sortieProfile.status), "recovered");
  assert.equal((await profileOf(page)).points, 0);
  observations.settings = { difficulties, assisted: assisted.assisted.bestScore,
    assistCannotBeUndoneMidRun: true, corruptionRecovery: "passed" };
}

async function guideAndVictory(page) {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.locator("#guide-button").click();
  for (let index = 0; index < 3; index++) await page.locator("#guide-next").click();
  const count = await page.locator("#guide-page-count").innerText();
  assert.equal(count, "Page 4 of 4");
  const pageItems = await page.locator("[data-guide-page]:visible li").count();
  assert.equal(pageItems, 5);
  assert.match(await page.locator("[data-guide-page]:visible").innerText(), /Return to the hangar/);
  const scrollable = await page.locator("#flight-guide-pages").evaluate(node => node.scrollHeight > node.clientHeight + 2);
  assert.ok(scrollable);
  assert.equal(await page.locator("#guide-scroll-hint").evaluate(node => getComputedStyle(node).visibility), "visible");
  await page.locator("#flight-guide-pages").hover();
  await page.mouse.wheel(0, 500);
  await page.waitForFunction(() => {
    const scroll = document.querySelector("#flight-guide-pages");
    const last = document.querySelector("[data-guide-page]:not([hidden]) li:last-child");
    return scroll.scrollTop > 0 && last.getBoundingClientRect().bottom <= scroll.getBoundingClientRect().bottom + 2;
  }, null, { polling: 50 });
  await screenshot(page, "guide-last-en-640.png");
  await page.locator(".flight-guide-actions button").click();

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator("#start-button").click();
  await page.evaluate(() => {
    for (let type = 0; type < 10; type++) {
      spawnBoss(type);
      battleTime += 39 + type;
      defeatBoss();
      resetBossPresentation();
    }
  });
  await defeatFixture(page, 10, 51);
  assert.ok(await page.locator("#campaign-epilogue").isVisible());
  assert.equal(await page.locator("#game-over-screen").isVisible(), false);
  assert.equal(await page.locator("#battle-screen").isVisible(), false);
  await page.evaluate(() => { campaignVictory.age = 7.7; stepFlight(3); });
  await screenshot(page, "epilogue-stargate-en-1280.png");
  await page.evaluate(() => { campaignVictory.age = 14.96; stepFlight(4); });
  assert.ok(await page.locator("#campaign-victory-report").isVisible());
  assert.equal(await page.locator("#campaign-report-grade").innerText(), "S");
  assert.equal(await page.locator(".campaign-boss-card[data-cleared='true']").count(), 11);
  await screenshot(page, "victory-report-en-1280.png");
  const result = await page.evaluate(() => ({ score: sortieStats.result.score, hits: sortieStats.result.hits,
    count: sortieStats.result.bossRecords.length, time: sortieStats.result.seconds, duration: campaignEpilogueDuration }));
  assert.equal(result.score, 26_000);
  assert.equal(result.duration, 15);
  await page.locator("#campaign-report-retry").click();
  assert.equal(await page.evaluate(() => sortieMode()), "campaign");
  await defeatFixture(page, 10, 52);
  await page.locator("#campaign-epilogue-skip").click();
  assert.ok(await page.locator("#campaign-victory-report").isVisible());
  await page.locator("#campaign-report-challenges").click();
  assert.ok(await page.locator("#sortie-console").isVisible());
  await closeConsole(page);
  observations.campaignVictory = { result, guidePages: 4, scrollable, skipped: true };
}

async function verifyRealEpilogue(origin) {
  const { browser, page } = await openContext(origin, true);
  const videoPath = await page.video().path();
  try {
    await page.locator("#language-button").click();
    assert.equal(await page.evaluate(() => gameLanguage), "zh-CN");
    await page.locator("#guide-button").click();
    assert.equal(await page.locator("#guide-page-count").innerText(), "第 1 / 4 页");
    await page.locator(".flight-guide-actions button").click();
    await page.evaluate(() => {
      if (reduceCombatMotion) toggleCombatMotion();
      if (gameAudio.muted) toggleGameSound();
      if (gameAudio.volume < .5) gameAudio.setVolume(.6);
    });
    await page.locator("#start-button").click();
    const started = await page.evaluate(() => {
      sortieStats.bossRecords = Array.from({ length: 10 }, (_, type) => ({ type, seconds: 42 + type, hitCount: type % 3 ? 0 : 1 }));
      sortieStats.hitsTaken = 4;
      battleTime = 479;
      score = 20_000;
      spawnBoss(10);
      return performance.now();
    });
    await defeatFixture(page, 10, 46);
    await page.locator("#campaign-victory-report").waitFor({ state: "visible", timeout: 22_000 });
    const elapsed = await page.evaluate(at => (performance.now() - at) / 1000, started);
    assert.ok(elapsed >= 14.8 && elapsed <= 21, `Real epilogue elapsed ${elapsed.toFixed(2)}s`);
    assert.equal(await page.locator("#campaign-report-title").innerText(), "异形战役通关");
    await screenshot(page, "victory-report-zh-1280.png");
    observations.campaignVictory.realSeconds = elapsed;
  } finally {
    await browser.close();
  }
  fs.copyFileSync(videoPath, path.join(output, "epilogue-real-time-zh.webm"));
}

async function main() {
  if (output) fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((request, response) => {
    const name = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname.slice(1)) || "index.html";
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const origin = `http://127.0.0.1:${server.address().port}/`;
  let session;
  try {
    session = await openContext(origin);
    await firstSession(session.page);
    await session.page.reload();
    assert.equal((await profileOf(session.page)).points, 2);
    await session.page.waitForTimeout(1200);
    await session.browser.close();
    session = await openContext(origin);
    await laterSession(session.page);
    await guideAndVictory(session.page);
    await settingsAndRecovery(session.page);
    if (output && process.argv.includes("--epilogue-video")) {
      await session.browser.close();
      await verifyRealEpilogue(origin);
    }
    assert.deepEqual(errors, []);
    observations.pageErrors = errors;
    console.log(JSON.stringify(observations, null, 2));
    if (output) fs.writeFileSync(path.join(output, "sortie-browser.json"), JSON.stringify(observations, null, 2));
  } finally {
    await session?.browser.close();
    server.close();
    const temp = fs.realpathSync(os.tmpdir());
    const target = fs.realpathSync(userData);
    if (path.dirname(target) === temp && path.basename(target).startsWith("star-breaker-sortie-"))
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 3 });
  }
}

main().catch(error => { console.error(error, errors); process.exitCode = 1; });
