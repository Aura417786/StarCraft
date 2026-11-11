#!/usr/bin/env node
"use strict";

// Freeze only the review clock. The unmodified renderer, GLBs, simulation and
// collision functions still run in Chrome. These are fixtures, not a playthrough.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

async function main() {
  const root = path.resolve(process.argv[2]);
  const output = path.resolve(process.argv[3]);
  const baseline = process.argv.includes("--baseline");
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    const reviewBrowser = { newPage: async options => {
      const page = await browser.newPage(options);
      await page.addInitScript(() => {
        const raf = requestAnimationFrame;
        window.requestAnimationFrame = callback => {
          if (callback.name === "drawFrame") { window.__reviewDraw = callback; return 0; }
          return raf(callback);
        };
      });
      return page;
    } };
    const { page, errors } = await createPage(reviewBrowser, root, false);
    await page.locator("#start-button").click();
    const framing = [];
    for (const size of [{ width: 640, height: 360 }, { width: 1280, height: 720 }, { width: 1920, height: 945 }]) {
      await page.setViewportSize(size);
      await page.evaluate(() => { resizeBattlefield(); canvas.focus(); });
      for (let type = 0; type < 11; type++) {
        await page.evaluate(type => { resetBossPresentation(); spawnBoss(type); }, type);
        await page.waitForFunction(type => starBreakerModelCache.get(type)?.model, type);
        for (const moment of ["entry", "settled", "windup", "rupture"]) {
          const frame = await page.evaluate(({ type, moment }) => {
            resetBossPresentation();
            spawnBoss(type);
            const target = boss;
            target.age = 2.4;
            if (moment !== "entry") {
              resetBossPresentation(); Object.assign(target, bossArena(type));
              if (moment === "windup") {
                prepareAlienAttack(target); target.phaseTime = target.telegraphDuration - .02;
                for (let tick = 0; tick < 40; tick++) updateAlienBossPose(target, 1 / 120);
              } else if (moment === "rupture") {
                playRupture(target); target.phase = "rupture";
                bossPresentation.age = bossPresentation.duration * .5;
              } else target.phase = "recover";
            }
            const margin = 500;
            const surface = document.createElement("canvas");
            surface.width = viewport.width + margin * 2; surface.height = viewport.height + margin * 2;
            const ctx = surface.getContext("2d", { willReadFrequently: true });
            ctx.translate(margin, margin);
            // Capture the actual body only, excluding intentionally unbounded
            // fog/fragments. Use the real presentation transforms and camera.
            const material = drawPresentationMaterial, fragments = drawPresentationFragments, core = drawPresentationCore;
            drawPresentationMaterial = drawPresentationFragments = drawPresentationCore = () => {};
            const camera = applyBossPresentationCamera;
            camera(ctx);
            if (activeBossPresentation()) drawBossPresentationBody(ctx, activeBossPresentation(), false);
            else drawBossShip(ctx, target, false);
            drawPresentationMaterial = material; drawPresentationFragments = fragments; drawPresentationCore = core;
            const pixels = ctx.getImageData(0, 0, surface.width, surface.height).data;
            let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity, count = 0, visible = 0;
            for (let y = 0; y < surface.height; y++) for (let x = 0; x < surface.width; x++) {
              if (pixels[(y * surface.width + x) * 4 + 3] <= 32) continue;
              const px = x - margin, py = y - margin;
              left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py); count++;
              if (px >= 0 && px < viewport.width && py >= 0 && py < viewport.height) visible++;
            }
            return { type: type + 1, moment, viewport: { ...viewport }, left, right, top, bottom, count,
              visibleFraction: count ? visible / count : 0, centerX: target.x, width: target.width,
              image: surface.toDataURL() };
          }, { type, moment });
          if (type === 0 && moment !== "windup") {
            fs.writeFileSync(path.join(output, `boss1-${size.width}-${moment}.png`), Buffer.from(frame.image.split(",")[1], "base64"));
          }
          delete frame.image;
          framing.push(frame);
        }
      }
    }
    fs.writeFileSync(path.join(output, "framing.json"), JSON.stringify({ baseline, framing, errors }, null, 2));
    if (!baseline) {
      for (const f of framing) {
        assert.ok(f.count > 100, `Boss ${f.type} ${f.moment} model rendered`);
        if (f.moment === "entry") assert.ok(f.visibleFraction >= .4, `Boss ${f.type} entry visible ${f.visibleFraction}`);
        else assert.ok(f.right <= f.viewport.width - 16, `Boss ${f.type} ${f.moment} right ${f.right} in ${f.viewport.width}`);
      }
      assert.deepEqual(errors, []);
      await page.setViewportSize({ width: 1280, height: 720 });
      const counters = await page.evaluate(() => {
        resizeBattlefield(); canvas.focus();
        const checks = [];
        const cases = [[3, "weaverWeb", "loom"], [5, "mirrorDecoy", "mirrorDecoys"], [6, "wyrmPulse", "tailConduit"],
          [7, "sporeField", "sporeNests"], [9, "neuralSynapse", "neuralRelay"], [10, "fusionBind", "fusionLimbs"]];
        for (const [type, pattern, kind] of cases) {
          resetBossPresentation(); spawnBoss(type); resetBossPresentation();
          Object.assign(boss, bossArena(type)); boss.age = 3; boss.hp = .9;
          boss.attackIndex = bossTypes[type].patterns.indexOf(pattern) - 1;
          prepareAlienAttack(boss); boss.phase = "attack";
          const h = bossHazards.find(hazard => hazard.kind === kind);
          h.age = h.warning + h.duration * .1;
          const hit = () => {
            boss.hp = .9; boss.damageBudget = undefined; boss.damageBudgetAt = undefined;
            applyBossHit({ damageLog: boss.healthLog + Math.log(.006), noEnergy: true });
            return .9 - boss.hp;
          };
          const ordinary = hit();
          const nodes = kind === "fusionLimbs" ? h.nodes.slice(0, 1) : h.nodes;
          for (const node of nodes) {
            const n = node.maxHealth;
            for (let i = 0; i < n; i++) interceptAlienRound({ x: node.x + 1, previousX: node.x - 1,
              y: node.y, previousY: node.y, vx: 800, vy: 0, halfHeight: 2.5 });
          }
          const active = bossCounterActive(boss), end = boss.counterUntil;
          const reward = hit();
          boss.age += .2;
          rewardAlienCounter(boss);
          const cannotExtend = boss.counterUntil === end;
          const count = boss.counterCount;
          boss.age = end + .01;
          checks.push({ type: type + 1, pattern, kind, active, ordinary, reward,
            benefit: reward / ordinary, cannotExtend, count, expired: !bossCounterActive(boss) });
        }
        // Real phase protection remains; only invisible timed HP floors go.
        resetBossPresentation(); spawnBoss(0);
        const target = boss; applyBossHit({ damage: 1e12 });
        const entryProtected = target.hp === 1;
        resetBossPresentation(); target.phase = "attack"; target.hp = .51; target.age = 0;
        applyBossHit({ source: "ultimate", damage: 1e12 });
        const shellTransition = target.enraged && target.hp === .5 && target.phase === "rupture";
        applyBossHit({ source: "ultimate", damage: 1e12 });
        const ruptureProtected = target.hp === .5;
        resetBossPresentation(); target.phase = "attack"; target.hp = .01;
        applyBossHit({ source: "ultimate", damage: 1e12 });
        const finaleStarted = target.finale?.mode === "egg" && target.hp === 1;
        applyBossHit({ source: "ultimate", damage: 1e12 });
        const transformProtected = target.hp === 1;
        resetBossPresentation(); target.finale.age = target.finale.transform; target.hp = .01;
        applyBossHit({ source: "ultimate", damage: 1e12 });
        const lethalReallyKills = boss === null;
        return { checks, entryProtected, shellTransition, ruptureProtected, finaleStarted, transformProtected, lethalReallyKills };
      });
      fs.writeFileSync(path.join(output, "counters.json"), JSON.stringify(counters, null, 2));
      for (const c of counters.checks) {
        assert.ok(c.active && c.expired && c.cannotExtend && c.count === 1, `${c.pattern} bounded counter window`);
        assert.ok(c.benefit > 1.7 && c.benefit < 2, `${c.pattern} changes actual damage ${c.benefit}`);
      }
      for (const [name, value] of Object.entries(counters)) if (name !== "checks") assert.equal(value, true, name);
    }
    console.log(JSON.stringify({ framing: framing.length, clipped: framing.filter(f => f.moment !== "entry" && f.right > f.viewport.width - 16).length,
      invisibleEntrances: framing.filter(f => f.moment === "entry" && f.visibleFraction < .4).length, errors }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
