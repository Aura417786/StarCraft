"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

const game = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const primaryEntries = [
  "#start-button", "#hangar-loadout", '[data-sortie-console="challenges"]',
  "#hangar-records", "#hangar-manual", '[data-sortie-console="settings"]',
];
const nestedEntries = [
  "#fighter-picker", "#hangar-difficulty", "#guide-button", "#replay-intro-button",
  '[data-sortie-console="upgrades"]', '[data-sortie-console="archive"]', '[data-sortie-console="awards"]',
];

async function focusIs(page, selector) {
  await page.waitForFunction(target => document.activeElement?.matches(target), selector);
}

async function pageIs(page, name) {
  await page.waitForFunction(value => document.querySelector("#start-screen").dataset.hangarPage === value, name);
}

async function verifyRoot(page) {
  await pageIs(page, "home");
  for (const selector of primaryEntries) assert.ok(await page.locator(selector).isVisible(), selector);
  for (const selector of nestedEntries) assert.equal(await page.locator(selector).isVisible(), false, selector);
  for (const selector of ["#shake-button", "#sound-button", "#fullscreen-button", "#language-button", "#render-quality"])
    assert.equal(await page.locator(selector).isVisible(), false, selector);
  return page.evaluate(() => {
    const launch = document.querySelector("#start-button");
    const root = document.querySelector("#start-screen");
    const r = launch.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { horizontalOverflow: root.scrollWidth - root.clientWidth, launchHit: launch.contains(hit),
      width: innerWidth, height: innerHeight, language: document.documentElement.lang };
  });
}

async function returnFromBattle(page) {
  await page.locator("#menu-button").click();
  await page.locator("#pause-confirm").click();
  await pageIs(page, "home");
  await focusIs(page, "#start-button");
}

async function checkNavigation(page) {
  await page.locator("#start-button").focus();
  await page.keyboard.press("ArrowDown");
  await focusIs(page, "#hangar-loadout");
  await page.keyboard.press("Enter");
  await pageIs(page, "loadout");
  assert.ok(await page.locator("#fighter-picker").isVisible());
  assert.equal(await page.locator("#start-button").isVisible(), false);
  assert.equal(await page.locator("#hangar-manual-panel").isVisible(), false);
  await page.locator('#fighter-picker label[data-fighter="blue"]').click();
  await page.locator('#hangar-difficulty label:has(input[value="easy"])').click();
  await page.screenshot({ path: path.join(output, "loadout.png") });
  await page.keyboard.press("Escape");
  await pageIs(page, "home");
  await focusIs(page, "#hangar-loadout");
  assert.equal(await page.locator("#hangar-loadout-summary").textContent(), "苍电 · 简单");

  await page.locator("#hangar-records").click();
  await pageIs(page, "records");
  await page.screenshot({ path: path.join(output, "records.png") });
  for (const [section, title] of [["upgrades", "改装"], ["archive", "战役档案"], ["awards", "徽章墙"]]) {
    const entry = `[data-sortie-console="${section}"]`;
    await page.locator(entry).click();
    assert.equal(await page.locator("#sortie-console-title").textContent(), title);
    await page.keyboard.press("Escape");
    await page.locator("#sortie-console").waitFor({ state: "hidden" });
    await pageIs(page, "records");
    await focusIs(page, entry);
  }
  await page.locator("#hangar-back-records").click();
  await pageIs(page, "home");
  await focusIs(page, "#hangar-records");

  await page.locator("#hangar-manual").click();
  await pageIs(page, "manual");
  await page.locator("#guide-button").click();
  await page.locator("#flight-guide").waitFor();
  await page.keyboard.press("Escape");
  await page.locator("#flight-guide").waitFor({ state: "hidden" });
  await focusIs(page, "#guide-button");
  await page.locator("#replay-intro-button").click();
  await page.locator("#campaign-opening").waitFor();
  await page.keyboard.press("Escape");
  await page.locator("#campaign-opening").waitFor({ state: "hidden" });
  await focusIs(page, "#replay-intro-button");
  await page.locator("#hangar-back-manual").click();
  await pageIs(page, "home");
  await focusIs(page, "#hangar-manual");

  await page.locator('[data-sortie-console="challenges"]').click();
  assert.equal(await page.locator("#sortie-console-title").textContent(), "挑战");
  await page.locator("#sortie-console-close").click();
  await pageIs(page, "home");
}

async function checkSettings(page) {
  const entry = page.locator('[data-sortie-console="settings"]');
  await entry.click();
  await page.locator("#sortie-language").selectOption("en");
  await page.locator("#sortie-quality").selectOption("low");
  await page.locator("#sortie-sound").uncheck();
  const fullscreen = page.locator("#sortie-fullscreen");
  const fullscreenAvailable = await fullscreen.isVisible() && await fullscreen.isEnabled();
  if (fullscreenAvailable) {
    await page.bringToFront();
    await fullscreen.click();
    await page.waitForFunction(() => document.fullscreenElement?.id === "game-app");
    await fullscreen.click();
    await page.waitForFunction(() => !document.fullscreenElement);
  }
  await page.screenshot({ path: path.join(output, "settings.png") });
  await page.keyboard.press("Escape");
  await page.locator("#sortie-console").waitFor({ state: "hidden" });
  await focusIs(page, '[data-sortie-console="settings"]');
  await entry.click();
  await page.getByRole("button", { name: "Open flight manual" }).click();
  await page.locator("#flight-guide").waitFor();
  await page.keyboard.press("Escape");
  await page.locator("#flight-guide").waitFor({ state: "hidden" });
  assert.ok(await page.evaluate(() => document.activeElement?.getClientRects().length > 0), "Guide must restore a visible focus target");
  await page.reload();
  await page.locator("#start-button").waitFor();
  const preferences = await page.evaluate(() => ({
    language: document.documentElement.lang, quality: visualQuality.id, muted: gameAudio.muted,
  }));
  assert.deepEqual(preferences, { language: "en", quality: "low", muted: true });
  return { ...preferences, fullscreenAvailable };
}

async function checkLaunchPaths(page) {
  const results = [];
  for (const launch of ["#hangar-confirm-launch", "#start-button"]) {
    if (launch === "#hangar-confirm-launch") {
      await page.locator("#hangar-loadout").click();
      await pageIs(page, "loadout");
      assert.equal(await page.locator("#fighter-picker input:checked").inputValue(), "blue");
      assert.equal(await page.locator("#hangar-difficulty input:checked").inputValue(), "easy");
    }
    await page.locator(launch).click();
    await page.waitForFunction(() => state === "battle");
    await focusIs(page, "#game-canvas");
    const configuration = await page.evaluate(() => ({ fighter: sortieFighter, difficulty: sortieStats.difficulty }));
    assert.deepEqual(configuration, { fighter: "blue", difficulty: "easy" });
    results.push({ launch, ...configuration });
    await returnFromBattle(page);
  }
  return results;
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true,
    args: ["--use-angle=d3d11", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"] });
  try {
    const { page, errors } = await createPage(browser, game, false);
    const layouts = [];
    for (const [width, height, lang] of [[1280, 720, "zh-CN"], [640, 360, "en"], [1920, 1080, "en"], [390, 844, "zh-CN"]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(language => setGameLanguage(language), lang);
      const layout = await verifyRoot(page);
      assert.equal(layout.language, lang);
      assert.ok(layout.horizontalOverflow <= 1, JSON.stringify(layout));
      assert.ok(layout.launchHit, JSON.stringify(layout));
      layouts.push(layout);
      await page.screenshot({ path: path.join(output, `home-${width}-${lang}.png`) });
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await checkNavigation(page);
    const settings = await checkSettings(page);
    const launch = await checkLaunchPaths(page);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "menu-navigation.json"), JSON.stringify({ layouts, settings, launch, errors }, null, 2));
    console.log("Grouped hangar menu navigation passed");
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
