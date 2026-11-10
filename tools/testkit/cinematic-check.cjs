#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

async function main() {
  const [root, output] = process.argv.slice(2);
  if (!root || !output) throw new Error("Usage: node cinematic-check.cjs <Game folder> <evidence folder>");
  const game = path.resolve(root), evidence = path.resolve(output);
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || chromium.executablePath(), headless: true });
  try {
    const { page, errors } = await createPage(browser, game, true);
    const result = await page.evaluate(() => {
      showScreen("battle", { seed: 8871 });
      const origin = { x: viewport.width * .72, y: viewport.height * .46, width: 160 };
      const materials = [];
      for (let type = 0; type < 11; type++) {
        recordCombatDetonation(origin, { kind: "boss", type });
        materials.push(combatEffects.detonations.at(-1).material);
      }
      const poolFull = combatEffects.detonations.length === 8 && spareDetonations.length === 0;
      const before = combatEffects.detonations[0];
      recordCombatDetonation(origin);
      const priority = combatEffects.detonations[0] === before;
      updateCombatEffects(1.5);
      const expired = combatEffects.detonations.length === 0 && spareDetonations.length === 8;

      const transform = (draw) => {
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        draw(context);
        const matrix = context.getTransform();
        context.restore();
        return [matrix.a, matrix.e, matrix.f];
      };
      const returnNear = transform(ctx => applyCampaignReturnCamera(ctx, 10.4));
      const returnFar = transform(ctx => applyCampaignReturnCamera(ctx, 13.4));
      reduceCombatMotion = true;
      const returnCalm = transform(ctx => applyCampaignReturnCamera(ctx, 10.4));
      reduceCombatMotion = false;
      const settings = Object.entries(bossCameraProfiles).map(([phase, values]) => ({ phase, ...values }));
      const peak = settings.map(setting => {
        const target = { ...origin, type: 2, phase: setting.phase === "entry" ? "enter" : setting.phase,
          finale: setting.phase === "transform" || setting.phase === "death" ? { age: 0, transform: 5 } : null };
        boss = target;
        startBossPresentation(setting.phase, target);
        bossPresentation.age = Math.min(setting.delay + setting.push, bossPresentation.duration * .58);
        const sample = transform(applyBossPresentationCamera);
        resetBossPresentation();
        return sample;
      });
      return { materials, poolFull, priority, expired, returnNear, returnFar, returnCalm, settings, peak };
    });
    assert.equal(new Set(result.materials).size, 11);
    for (const key of ["poolFull", "priority", "expired"]) assert.equal(result[key], true, key);
    assert.ok(Math.abs(result.returnNear[0] - 1.056) < 1e-6);
    assert.equal(result.returnFar[0], 1);
    assert.ok(Math.abs((result.returnCalm[0] - 1) / (result.returnNear[0] - 1) - .14) < .001);
    for (let i = 0; i < result.peak.length; i++) assert.ok(Math.abs(result.peak[i][0] - 1 - result.settings[i].zoom) < 1e-6);
    assert.deepEqual(errors, []);

    const live = await createPage(browser, game, false);
    await live.page.evaluate(() => {
      const advance = updateCombatEffects;
      updateCombatEffects = seconds => { if (!window.__stillDetonation) advance(seconds); };
      window.__stillDetonation = true;
    });
    const previews = [["water", 0], ["cinder", 2], ["singularity", 8]];
    for (const [name, type] of previews) {
      await live.page.evaluate(type => {
        showScreen("battle", { seed: 8871 });
        nextBossTime = enemyCooldown = powerupCooldown = shotCooldown = Infinity;
        movementHint.hidden = true; // Keep captured phase samples still while the production renderer runs.
        for (const [index, p] of [.025, .29, .61].entries()) {
          recordCombatDetonation({ x: viewport.width * (.26 + index * .28), y: viewport.height * .46 }, { kind: "boss", type, size: 166 });
          const effect = combatEffects.detonations.at(-1);
          effect.age = effect.life * p;
        }
      }, type);
      await live.page.screenshot({ path: path.join(evidence, `detonation-${name}.png`) });
    }
    await live.page.evaluate(() => {
      window.__stillDetonation = false;
      showScreen("battle", { seed: 8871, fighter: "red" });
      nextBossTime = enemyCooldown = powerupCooldown = shotCooldown = Infinity;
      movementHint.hidden = true;
      ultimate.charges = 1;
      updateUltimateDisplay();
      canvas.focus({ preventScroll: true });
    });
    await live.page.keyboard.press("Space");
    await live.page.waitForFunction(() => ultimate.phase === "firing" && combatEffects.detonations.some(effect => effect.rank === 2), null, { timeout: 5000 });
    await live.page.screenshot({ path: path.join(evidence, "detonation-crimson-live.png") });
    result.liveCrimsonLaunch = true;
    assert.deepEqual(live.errors, []);
    fs.writeFileSync(path.join(evidence, "cinematic.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
