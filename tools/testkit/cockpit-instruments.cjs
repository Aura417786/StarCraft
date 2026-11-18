"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

async function main() {
  const game = path.resolve(process.argv[2] || ".");
  const out = path.resolve(process.argv[3]);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true,
    args: ["--use-angle=d3d11"] });
  const results = [];
  try {
    const { page, errors } = await createPage(browser, game, false);
    for (const [width, height, fighter, language] of [[1440,900,"red","zh-CN"],[844,390,"blue","en"],[390,844,"yellow","zh-CN"]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(({ fighter, language }) => {
        setGameLanguage(language);
        selectedFighter = fighter;
        showScreen("battle", { seed: 77135, difficulty: "hard" });
        canvas.focus();
        player.invulnerable = 100;
        spawnBoss(2);
        resetBossPresentation();
        Object.assign(boss, bossArena(2), { phase: "recover", phaseTime: .8, pressureAttackCount: 6 });
        prepareAlienAttack(boss, true);
      }, { fighter, language });
      const resource = page.locator(".tactical-loadout .fighter-systems-readout");
      await resource.waitFor({ state: "visible" });
      assert.equal(await resource.getAttribute("data-fighter"), fighter);
      assert.equal(await page.locator("#boss-hud").getAttribute("data-life-phase"), "1");
      const box = await resource.boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1);
      await page.screenshot({ path: path.join(out, fighter + "-cockpit.png") });
      await page.keyboard.press("Escape");
      const location = page.locator(".pause-sector-route [aria-current=location]");
      await location.waitFor({ state: "visible" });
      const sector = await location.innerText();
      assert.equal(sector, language === "en" ? "Dawn Orbit" : "曙光轨道");
      await page.screenshot({ path: path.join(out, fighter + "-pause.png") });
      await page.locator("#pause-resume").click();
      assert.equal(await page.locator("#pause-screen").isVisible(), false);
      const material = await page.evaluate(async () => {
        const device = spacePropGraphics();
        if (!device) return { renderer: "Canvas fallback" };
        await device.detail.decode();
        return { renderer: "WebGL", width: device.detail.naturalWidth, height: device.detail.naturalHeight,
          linked: device.gl.getProgramParameter(device.gl.getParameter(device.gl.CURRENT_PROGRAM), device.gl.LINK_STATUS) };
      });
      if (material.renderer === "WebGL") assert.deepEqual([material.width,material.height,material.linked],[256,512,true]);
      results.push({ fighter,width,height,language,sector,box,material });
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, "cockpit.json"), JSON.stringify({ results, errors }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
