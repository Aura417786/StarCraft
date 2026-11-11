"use strict";

// Final release audit M-05 / M-08 / M-09. No profile or combat cheats are used.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const baseline = process.argv.includes("--baseline");
const origin = "https://star-breaker-final-layout.invalid";
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".glb": "model/gltf-binary" };

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  const page = await browser.newPage();
  const results = { description: "Chrome real render, existing menu controls; bounds before any click/scroll", hangar: [], hud: [], bossHud: [], errors: [], warnings: [] };
  page.on("pageerror", e => results.errors.push(e.message));
  page.on("console", e => { if (["warning", "error"].includes(e.type())) results.warnings.push(e.text()); });
  await page.route(origin + "/**", route => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ path: file, contentType: mime[path.extname(file)] || "application/octet-stream" });
  });
  await page.addInitScript(() => {
    localStorage.setItem("star-breaker-guide-seen", "1");
    localStorage.setItem("star-breaker-flight-training", "1");
  });
  try {
    await page.goto(origin);
    await page.bringToFront();
    await page.waitForFunction(() => !document.querySelector("#start-button").disabled);
    for (const [width, height] of [[640, 360], [1280, 720], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      for (const language of ["zh-CN", "en"]) {
        for (const ui of ["90", "100", "115"]) {
          await page.evaluate(([language, ui]) => {
            showScreen("menu");
            setGameLanguage(language);
            flightControls.ui = ui;
            applyFlightDisplaySettings();
            document.querySelector("#start-screen").scrollTop = 0;
          }, [language, ui]);
          for (const fighter of ["red", "blue", "yellow"]) {
            await page.locator(`#fighter-picker label[data-fighter="${fighter}"]`).click();
            await page.evaluate(() => { document.querySelector("#start-screen").scrollTop = 0; });
            const bounds = await page.evaluate(() => {
              const button = document.querySelector("#start-button"), screen = document.querySelector("#start-screen");
              const r = button.getBoundingClientRect(), s = screen.getBoundingClientRect();
              const inside = r.left >= Math.max(s.left, 0) && r.top >= Math.max(s.top, 0)
                && r.right <= Math.min(s.right, innerWidth) + 1 && r.bottom <= Math.min(s.bottom, innerHeight) + 1;
              const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              const brief = document.querySelector("#fighter-brief").getBoundingClientRect();
              const overlap = r.left < brief.right && r.right > brief.left && r.top < brief.bottom && r.bottom > brief.top;
              return { x: r.x, y: r.y, width: r.width, height: r.height, inside,
                clickable: !!hit && button.contains(hit), briefOverlap: overlap, scrollTop: screen.scrollTop,
                screenWidth: screen.clientWidth, contentWidth: screen.scrollWidth };
            });
            results.hangar.push({ width, height, language, ui, fighter, ...bounds });
          }
          await page.screenshot({ path: path.join(output, `hangar-${width}-${language}-${ui}.png`) });
        }
        // A coordinate click cannot quietly scroll a hidden launch control into view.
        const last = results.hangar.at(-1);
        if (last.inside && last.clickable) {
          await page.mouse.click(last.x + last.width / 2, last.y + last.height / 2);
          await page.waitForFunction(() => state === "battle" && battleTime > .1);
          const hud = await page.evaluate(() => {
            const rect = selector => {
              const r = document.querySelector(selector).getBoundingClientRect();
              return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
            };
            return { equipment: rect(".weapon-readout"), life: rect(".life"), actions: rect(".header-actions"),
              equipmentScrollWidth: document.querySelector(".weapon-readout").scrollWidth,
              equipmentWidth: document.querySelector(".weapon-readout").clientWidth,
              state, fighter: selectedFighter };
          });
          results.hud.push({ width, height, language, ...hud });
          await page.screenshot({ path: path.join(output, `battle-${width}-${language}.png`) });
          await page.evaluate(() => showScreen("menu"));
        }
      }
    }
    if (!baseline) for (const language of ["zh-CN", "en"]) {
      await page.setViewportSize({ width: 640, height: 360 });
      await page.evaluate(language => { showScreen("menu"); setGameLanguage(language); }, language);
      await page.locator('[data-sortie-console="challenges"]').click();
      await page.getByRole("button", { name: /^(?:开始首领连战|Launch Boss Rush)$/ }).click();
      await page.waitForFunction(() => boss && boss.phase !== "enter" && !bossPresentation);
      const b = await page.evaluate(() => {
        const result = {};
        for (const [key, selector] of Object.entries({ boss: "#boss-hud", life: ".life", score: "#score", mode: ".difficulty-readout", gear: ".weapon-readout" })) {
          const r = document.querySelector(selector).getBoundingClientRect();
          result[key] = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        }
        return result;
      });
      results.bossHud.push({ language, ...b });
      await page.screenshot({ path: path.join(output, `boss-640-${language}-115.png`) });
    }
    results.preloadRemoved = await page.locator('link[rel="preload"][href*="orbit-galaxy"]').count() === 0;
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    results.failures = results.hangar.filter(x => !x.inside || !x.clickable || x.briefOverlap || x.contentWidth > x.screenWidth + 2);
    results.desktopHudPass = results.hud.filter(x => x.width >= 1001).every(x =>
      !overlaps(x.equipment, x.life) && !overlaps(x.equipment, x.actions)
      && x.equipment.right <= x.width - 16 && x.equipmentScrollWidth <= x.equipmentWidth + 2);
    results.smallBossHudPass = results.bossHud.every(x => !overlaps(x.boss, x.life) && !overlaps(x.boss, x.score)
      && !overlaps(x.boss, x.gear) && !overlaps(x.boss, x.mode));
    fs.writeFileSync(path.join(output, "layout.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ cases: results.hangar.length, failures: results.failures.length,
      preloadRemoved: results.preloadRemoved, desktopHudPass: results.desktopHudPass, errors: results.errors, warnings: results.warnings }, null, 2));
    if (!baseline) {
      assert.deepEqual(results.failures, []);
      assert.equal(results.preloadRemoved, true);
      assert.equal(results.desktopHudPass, true);
      assert.equal(results.smallBossHudPass, true);
      assert.deepEqual(results.errors, []);
      assert.deepEqual(results.warnings, []);
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
