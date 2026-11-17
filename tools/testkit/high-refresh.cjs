"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

const rates = [60, 120, 144, 240];

async function testSimulation(browser, game) {
  const { page, errors } = await createPage(browser, game, true);
  try {
    const samples = [];
    for (const hz of rates) {
      samples.push(await page.evaluate(rate => {
        showScreen("battle", { seed: 77135, fighter: "yellow", difficulty: "hard" });
        canvas.focus();
        enemyCooldown = powerupCooldown = nextBossTime = Infinity;
        formationState.nextTime = battlefieldEvents.nextObject = battlefieldEvents.nextTransport = aceEncounter.nextTime = Infinity;
        window.__balanceClock.tick(0);
        pressedKeys.add("KeyD");
        pressedKeys.add("KeyW");
        for (let frame = 0; frame < rate * 2; frame++) {
          if (frame === rate / 2) pressedKeys.clear();
          window.__balanceClock.tick(1 / rate);
        }
        const round = Math.fround;
        return {
          time: round(battleTime), x: round(player.x), y: round(player.y), cooldown: round(shotCooldown),
          shots: bullets.map(bullet => [round(bullet.x), round(bullet.y), round(bullet.damage)]),
          lives: player.lives, charge: ultimate.charges,
        };
      }, hz));
    }
    for (const [index, sample] of samples.entries()) {
      assert.equal(sample.time, 2, `${rates[index]} Hz simulation clock`);
      assert.deepEqual(sample, samples[0], `${rates[index]} Hz must match ${rates[0]} Hz`);
    }
    const catchup = await page.evaluate(() => {
      const before = battleTime;
      window.__balanceClock.tick(2);
      return battleTime - before;
    });
    assert.ok(Math.abs(catchup - .05) < 1e-9, `Two-second gap advanced ${catchup} simulated seconds`);
    assert.deepEqual(errors, []);
    return { rateSamples: samples.length, simulationSeconds: samples[0].time, caughtUpSeconds: catchup };
  } finally { await page.close(); }
}

async function testRender(browser, game) {
  const { page, errors } = await createPage(browser, game, false);
  try {
    const result = await page.evaluate(() => {
      showScreen("battle", { seed: 77135, difficulty: "hard" });
      canvas.focus();
      const requestFrame = window.requestAnimationFrame;
      const drawShotLayer = drawBullets;
      const alphaSamples = [];
      const submittedRates = [];
      try {
        // Supply display timestamps while exercising the actual render entry point.
        window.requestAnimationFrame = () => 0;
        drawBullets = alpha => { alphaSamples.push(alpha); drawShotLayer(alpha); };
        for (const rate of [60, 120, 144, 240]) {
          const start = alphaSamples.length;
          previousTime = 0;
          for (let frame = 0; frame <= 12; frame++) drawFrame(1000 + frame * 1000 / rate);
          submittedRates.push({ hz: rate, callbacks: alphaSamples.length - start });
        }
      } finally {
        window.requestAnimationFrame = requestFrame;
        drawBullets = drawShotLayer;
        previousTime = 0;
      }
      const body = { previousX: 6, x: 14, previousY: 20, y: 12 };
      return { submittedRates, alphaSamples, midpoint: [flightRenderX(body, .5), flightRenderY(body, .5)] };
    });
    assert.deepEqual(result.submittedRates, rates.map(hz => ({ hz, callbacks: 13 })));
    assert.ok(result.alphaSamples.every(alpha => alpha >= 0 && alpha <= 1));
    assert.ok(result.alphaSamples.some(alpha => alpha > .01 && alpha < .99), "Fast frames need intermediate render positions");
    assert.deepEqual(result.midpoint, [10, 16]);
    assert.deepEqual(errors, []);
    return result.submittedRates;
  } finally { await page.close(); }
}

async function main() {
  const game = path.resolve(process.argv[2] || ".");
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const simulation = await testSimulation(browser, game);
    const renders = await testRender(browser, game);
    console.log(JSON.stringify({ simulation, renders }));
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
