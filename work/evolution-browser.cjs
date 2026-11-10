"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.resolve(process.argv[2]);
const origin = "https://star-breaker-loadout.invalid";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".glb": "model/gltf-binary" };

async function run() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [], observations = {};
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("star-breaker-language", "en");
    // Observe the real input and next painted combat state without influencing time.
    window.loadoutInputProof = {};
    addEventListener("keydown", event => {
      if (event.code === "ShiftLeft" && !event.repeat) {
        window.loadoutInputProof = { pressedAt: performance.now(), visibleAt: null };
        requestAnimationFrame(() => {
          if (evolutionWeapons.lanceCharging) window.loadoutInputProof.visibleAt = performance.now();
        });
      }
    });
  });
  await page.route(origin + "/**", route => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404 });
    return route.fulfill({ contentType: types[path.extname(file)], path: file });
  });
  async function start(fighter) {
    await page.evaluate(() => { if (state !== "menu") showScreen("menu"); });
    await page.locator('#fighter-picker label:has(input[value="' + fighter + '"])').click();
    await page.locator("#start-button").click();
    await page.evaluate(() => {
      enemies.length = 0;
      enemyCooldown = powerupCooldown = nextBossTime = formationState.nextTime = aceEncounter.nextTime = Infinity;
    });
    assert.equal(await page.evaluate(() => sortieFighter), fighter);
  }
  async function fixture(spec) {
    await page.evaluate(({ x, y, otherY, shipX = player.x }) => {
      player.x = player.previousX = shipX;
      enemies.length = 0; bullets.length = 0;
      const mock = (position, height) => ({ kind: "scout", x: position, previousX: position,
        y: height, previousY: height, baseY: height, width: 78, height: 47,
        age: 0, hp: 1000, maxHp: 1000, displayHp: 1000, speed: 0, waveAmplitude: 0, hitFlash: 0 });
      enemies.push(mock(x, player.y + y));
      if (otherY !== undefined) enemies.push(mock(x + 98, player.y + otherY));
    }, spec);
  }
  try {
    await page.goto(origin);
    await page.bringToFront();
    const closeGuide = page.locator(".flight-guide-actions button").first();
    if (await closeGuide.isVisible()) await closeGuide.click();
    await start("red");
    await fixture({ x: 750, y: 0 });
    await page.waitForFunction(() => bullets.some(shot => shot.visual === "lance" && !shot.auxiliary));
    observations.crimson = await page.evaluate(() => ({ resource: fighterCombat.stability,
      heavy: bullets.find(shot => shot.visual === "lance" && !shot.auxiliary)?.damage }));
    assert.ok(observations.crimson.heavy >= 4);
    await page.screenshot({ path: path.join(output, "01-crimson-slug.png") });
    for (let level = 0; level < 3; level++) {
      await page.evaluate(() => openEvolutionChoice());
      await page.keyboard.press("1");
    }
    await page.keyboard.press("Shift");
    assert.equal(await page.evaluate(() => firingStyle.mode), "focus");
    await page.keyboard.down("Shift");
    await page.waitForFunction(() => evolutionLanceActive());
    await page.waitForFunction(() => evolutionWeapons.lanceCharge >= .70);
    await page.screenshot({ path: path.join(output, "02-wings-charge.png") });
    await page.keyboard.up("Shift");
    await page.waitForFunction(() => bullets.some(shot => shot.source === "evolution-lance"));
    observations.lance = await page.evaluate(() => ({ cooldown: evolutionWeapons.lanceCooldown,
      responseMs: loadoutInputProof.visibleAt - loadoutInputProof.pressedAt }));
    assert.ok(observations.lance.cooldown > 5);
    assert.ok(observations.lance.responseMs >= 0 && observations.lance.responseMs < 100);
    await page.screenshot({ path: path.join(output, "03-wings-release.png") });

    await page.evaluate(() => openEvolutionChoice());
    const respec = page.locator(".evolution-reset");
    await respec.click();
    assert.equal(await page.evaluate(() => evolution.pierce), 3);
    await respec.click();
    assert.equal(await page.evaluate(() => evolution.reassignments), 3);
    await page.keyboard.press("2"); await page.keyboard.press("2"); await page.keyboard.press("2");
    assert.equal(await page.evaluate(() => evolution.pending), true);
    await page.keyboard.press("3");
    assert.equal(await page.evaluate(() => evolution.capstone), "blast");
    await fixture({ x: 600, y: 0 });
    await page.keyboard.press("f");
    await page.waitForFunction(() => !!evolutionWeapons.focus);
    await page.evaluate(() => enemyProjectiles.push({ x: player.x + 184, y: player.y, vx: -100, vy: 0,
      radius: 7, tint: "#ffa18b", age: 0, visual: "orb" }));
    await page.keyboard.press("f");
    observations.falcon = await page.evaluate(() => ({ threats: enemyProjectiles.length, cooldown: evolutionWeapons.interceptCooldown,
      grounded: evolutionWeapons.grounded }));
    assert.equal(observations.falcon.threats, 0);
    assert.ok(observations.falcon.grounded > 3.75);
    await page.screenshot({ path: path.join(output, "04-falcon-intercept.png") });

    await start("blue");
    await fixture({ x: 690, y: 45, otherY: 150 });
    await page.waitForFunction(() => fighterCombat.arcs.length > 0);
    observations.azure = await page.evaluate(() => ({ firstDamage: 1000 - enemies[0].hp, chainedDamage: 1000 - enemies[1].hp,
      angledShots: bullets.filter(shot => shot.seeker && Math.abs(shot.vy) > 12).length }));
    assert.ok(observations.azure.firstDamage > 0 && observations.azure.chainedDamage > 0 && observations.azure.angledShots > 0);
    await page.screenshot({ path: path.join(output, "05-azure-chain.png") });

    await start("yellow");
    await fixture({ x: 704, y: 0, otherY: 100, shipX: 405 });
    await page.waitForFunction(() => fighterCombat.field?.pulses >= 2);
    observations.auric = await page.evaluate(() => ({ capacitor: fighterCombat.capacitor,
      fieldPulses: fighterCombat.field.pulses, areaDamage: 1000 - enemies[1].hp }));
    assert.ok(observations.auric.capacitor < 1 && observations.auric.areaDamage > 0);
    await page.screenshot({ path: path.join(output, "06-auric-zone.png") });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "loadout-browser.json"), JSON.stringify({ observations, errors }, null, 2));
    console.log(JSON.stringify(observations));
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
