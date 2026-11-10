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
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--use-angle=d3d11", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [], observations = {};
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("star-breaker-language", "en");
    // Observe the real input and next painted combat state without influencing time.
    window.loadoutInputProof = {};
    addEventListener("keydown", event => {
      if (["ShiftLeft", "KeyC"].includes(event.code) && !event.repeat) {
        window.loadoutInputProof = { pressedAt: performance.now(), visibleAt: null };
        requestAnimationFrame(() => {
          if (evolutionWeapons.lanceCharging || fighterCombat.redHeld) window.loadoutInputProof.visibleAt = performance.now();
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
      if (typeof skipFlightTutorial === "function") skipFlightTutorial();
    });
    assert.equal(await page.evaluate(() => sortieFighter), fighter);
    await page.waitForFunction(() => battleTime >= .55);
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
    await page.keyboard.down("c");
    await page.waitForFunction(() => fighterCombat.redHeld && fighterCombat.stability >= .98);
    const redCharging = await page.evaluate(() => ({
      moveScale: fighterMovementScale(), resource: fighterCombat.stability,
      responseMs: loadoutInputProof.visibleAt - loadoutInputProof.pressedAt,
    }));
    await page.keyboard.up("c");
    await page.waitForFunction(() => bullets.some(shot => shot.source === "crimson-heavy"));
    observations.crimson = await page.evaluate(() => ({
      heavy: bullets.find(shot => shot.source === "crimson-heavy")?.damage,
      pierces: bullets.find(shot => shot.source === "crimson-heavy")?.piercesLeft,
    }));
    Object.assign(observations.crimson, redCharging);
    assert.ok(observations.crimson.heavy >= 4 && observations.crimson.pierces >= 2);
    assert.ok(observations.crimson.moveScale < 1 && observations.crimson.responseMs >= 0 && observations.crimson.responseMs < 100, JSON.stringify(observations.crimson));
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
      penetratesShield: bullets.find(shot => shot.source === "evolution-lance")?.piercesShield,
      responseMs: loadoutInputProof.visibleAt - loadoutInputProof.pressedAt }));
    assert.ok(observations.lance.cooldown > 5 && observations.lance.penetratesShield);
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
    await page.evaluate(() => openEvolutionChoice());
    await page.keyboard.press("3");
    assert.equal(await page.evaluate(() => evolution.links.phalanx), true);
    await fixture({ x: 600, y: 0 });
    await page.evaluate(() => { shield.charges = 0; shield.energy = 0; });
    await page.keyboard.press("f");
    await page.waitForFunction(() => !!evolutionWeapons.focus);
    await page.evaluate(() => {
      for (const offset of [-40, 0, 40]) enemyProjectiles.push({
        x: player.x + 184, y: player.y + offset, vx: -100, vy: 0,
        radius: 7, tint: "#ffa18b", age: 0, visual: "orb", owner: "packet",
      });
      enemyProjectiles.push({ x: player.x + 300, y: player.y + 100, vx: -40, vy: 0,
        radius: 7, tint: "#ffa18b", age: 0, visual: "orb", owner: "other" });
    });
    await page.keyboard.press("f");
    observations.falcon = await page.evaluate(() => ({ threats: enemyProjectiles.length, cooldown: evolutionWeapons.interceptCooldown,
      grounded: evolutionWeapons.grounded, shieldGain: shield.energy / evolutionShieldChargeTime() }));
    assert.equal(observations.falcon.threats, 1);
    assert.ok(observations.falcon.shieldGain >= .32 && observations.falcon.shieldGain < .40);
    assert.ok(observations.falcon.grounded > 3.75);
    await page.screenshot({ path: path.join(output, "04-falcon-intercept.png") });

    await start("blue");
    await fixture({ x: 690, y: 45, otherY: 150 });
    await page.waitForFunction(() => fighterCombat.arcs.length >= 3);
    observations.azure = await page.evaluate(() => ({ firstDamage: 1000 - enemies[0].hp, chainedDamage: 1000 - enemies[1].hp,
      arcs: fighterCombat.arcs.length, angledShots: bullets.filter(shot => shot.seeker && Math.abs(shot.vy) > 12).length }));
    assert.ok(observations.azure.firstDamage > 0 && observations.azure.chainedDamage > 0 && observations.azure.angledShots > 0);
    await page.screenshot({ path: path.join(output, "05-azure-chain.png") });

    await start("yellow");
    await fixture({ x: 850, y: 0, shipX: 170 });
    await page.waitForFunction(() => enemies[0]?.hp < 999.8);
    assert.equal(await page.evaluate(() => fighterCombat.field), null);
    assert.equal(await page.evaluate(() => fighterCombat.capacitor), 1);
    await fixture({ x: 704, y: 0, otherY: 100, shipX: 405 });
    await page.waitForFunction(() => fighterCombat.field?.pulses >= 2);
    observations.auric = await page.evaluate(() => ({ capacitor: fighterCombat.capacitor,
      fieldPulses: fighterCombat.field.pulses, areaDamage: 1000 - enemies[1].hp }));
    assert.ok(observations.auric.capacitor < 1 && observations.auric.areaDamage > 0);
    await page.screenshot({ path: path.join(output, "06-auric-zone.png") });

    await start("red");
    for (const key of ["1", "1", "3", "3", "3"]) {
      await page.evaluate(() => openEvolutionChoice());
      await page.keyboard.press(key);
    }
    await page.evaluate(() => {
      enemies.length = bullets.length = 0;
      ultimate.energy = ultimate.charges = 0;
      shield.charges = 1; shield.energy = 0; bossHitGrace = 0;
      enemyProjectiles.push({ x: player.x + player.width * .54, y: player.y, vx: -100, vy: 0,
        radius: 7, tint: "#ffa18b", age: 0, visual: "orb" });
    });
    await page.keyboard.press("v");
    observations.guardbreaker = await page.evaluate(() => ({
      guard: shield.perfectUsed, time: shield.duration, energy: ultimate.energy,
      piercing: evolutionWeapons.armorRoundRemaining > 0 || bullets.some(shot => shot.piercesShield),
    }));
    assert.equal(observations.guardbreaker.guard, true);
    assert.equal(observations.guardbreaker.time, 3);
    assert.equal(observations.guardbreaker.energy, 50);
    assert.equal(observations.guardbreaker.piercing, true);
    await page.waitForFunction(() => bullets.some(shot => shot.piercesShield));
    await page.screenshot({ path: path.join(output, "07-guardbreaker.png") });

    await start("blue");
    for (const key of ["1", "1", "2", "2"]) {
      await page.evaluate(() => openEvolutionChoice());
      await page.keyboard.press(key);
    }
    await fixture({ x: 760, y: 0 });
    await page.keyboard.press("f");
    await page.waitForFunction(() => !!evolutionWeapons.focus);
    observations.falconBreach = await page.evaluate(() => {
      const focus = evolutionWeapons.focus;
      const round = { source: "evolution-drone", damage: 10, damageLog: Math.log(10) };
      const adjusted = fighterProjectileDamage(round, focus);
      return { enabled: evolution.links.falcon, base: round.damage, focused: adjusted.damage, armor: adjusted.armorPiercing };
    });
    assert.ok(observations.falconBreach.enabled && observations.falconBreach.armor
      && observations.falconBreach.focused > observations.falconBreach.base);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "loadout-browser.json"), JSON.stringify({ observations, errors }, null, 2));
    console.log(JSON.stringify(observations));
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
