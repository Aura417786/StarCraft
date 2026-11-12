"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const origin = "https://star-breaker-controls.invalid";
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".glb": "model/gltf-binary" };

async function run() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true,
    args: ["--use-angle=d3d11", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [], evidence = {};
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("star-breaker-language", "en");
    localStorage.setItem("star-breaker-guide-seen", "1");
    localStorage.setItem("star-breaker-flight-training", "1");
    localStorage.setItem("star-breaker-opening-seen", "1");
    const device = { index: 0, mapping: "standard", connected: false, axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    Object.defineProperty(navigator, "getGamepads", { value: () => device.connected ? [device] : [] });
    window.testFlightPad = device;
  });
  await page.route(origin + "/**", route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
      return route.fulfill({ status: 404 });
    return route.fulfill({ contentType: mime[path.extname(file)] ?? "application/octet-stream", path: file });
  });

  const setPad = (index, pressed) => page.evaluate(([index, pressed]) => {
    testFlightPad.buttons[index].pressed = pressed;
    testFlightPad.buttons[index].value = Number(pressed);
  }, [index, pressed]);
  const tap = async index => {
    await setPad(index, true);
    await page.waitForFunction(index => flightPad.previous[index] === true, index);
    await setPad(index, false);
    await page.waitForFunction(index => flightPad.previous[index] === false, index);
  };
  const focusIs = selector => page.waitForFunction(selector => document.activeElement?.matches(selector), selector);
  const openControls = async () => {
    await page.locator('[data-sortie-console="settings"]').focus();
    await page.keyboard.press("Enter");
    await page.locator("#sortie-control-settings").focus();
    await page.keyboard.press("Enter");
    await page.locator("#flight-controls[open]").waitFor();
  };
  const bind = async (action, key) => {
    await page.locator('[data-flight-binding="' + action + '"]').focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press(key);
  };

  try {
    await page.goto(origin);
    await page.bringToFront();
    await openControls();
    await bind("charge", "v");
    evidence.conflict = await page.locator("#flight-binding-status").textContent();
    assert.match(evidence.conflict, /already assigned.*Shield/);
    await page.keyboard.press("h");
    await bind("pause", "p");
    await page.locator("#flight-setting-autofire").uncheck();
    await page.locator("#flight-setting-colorAssist").check();
    await page.locator("#flight-setting-ui").selectOption("115");
    await page.locator("#flight-setting-subtitle").selectOption("130");
    await page.screenshot({ path: path.join(output, "controls-english.png") });
    await page.reload();
    evidence.reload = await page.evaluate(() => ({
      key: controlBindingLabel("charge"), pause: controlBindingLabel("pause"), autofire: flightControls.autofire,
      ui: document.body.dataset.uiScale, subtitle: document.body.dataset.subtitleScale, pattern: document.body.dataset.colorAssist,
    }));
    assert.deepEqual(evidence.reload, { key: "H", pause: "P", autofire: false, ui: "115", subtitle: "130", pattern: "true" });

    await page.evaluate(() => { testFlightPad.connected = true; });
    await page.locator('#fighter-picker input[value="red"]').focus();
    for (let step = 0; step < 16 && !(await page.evaluate(() => document.activeElement.id === "start-button")); step++)
      await tap(13);
    await focusIs("#start-button");
    await tap(0);
    await page.waitForFunction(() => state === "battle" && battleTime > .35);
    await page.evaluate(() => { enemyCooldown = powerupCooldown = nextBossTime = Infinity; bullets.length = 0; });
    assert.equal(await page.evaluate(() => bullets.length), 0);
    await page.keyboard.down("j");
    await page.waitForFunction(() => bullets.length > 0);
    await page.keyboard.up("j");
    await page.keyboard.down("h");
    await page.waitForFunction(() => fighterCombat.redHeld && fighterCombat.stability > .48);
    await page.keyboard.up("h");
    await page.waitForFunction(() => bullets.some(shot => shot.source === "crimson-heavy"));

    await page.keyboard.press("p");
    await focusIs("#pause-resume");
    await tap(13); await tap(13);
    await focusIs("#pause-settings");
    await tap(0);
    await focusIs("#pause-sound");
    assert.equal(await page.evaluate(() => pauseView), "settings");
    await tap(1);
    await focusIs("#pause-resume");
    await tap(0);
    await focusIs("#game-canvas");

    const y0 = await page.evaluate(() => player.y);
    await page.evaluate(() => { testFlightPad.axes[1] = .52; });
    await page.waitForFunction(y => player.y > y + 12, y0);
    await page.evaluate(() => { testFlightPad.axes[1] = 0; });
    const y1 = await page.evaluate(() => player.y);
    await page.evaluate(() => { shield.charges = 1; ultimate.charges = 1; });
    await tap(2);
    await page.waitForFunction(() => shieldIsActive());
    await tap(3);
    await page.waitForFunction(() => ultimate.phase !== "idle");
    await page.waitForFunction(() => ultimate.phase === "idle");
    await setPad(6, true);
    await page.waitForFunction(() => fighterCombat.redHeld && fighterCombat.stability > .86);
    await setPad(6, false);
    await page.waitForFunction(() => bullets.some(shot => shot.source === "crimson-heavy"));
    evidence.gamepad = { analogDeltaY: y1 - y0, shield: true, special: true, heavy: true };

    const changed = await page.evaluate(() => {
      const scratch = document.createElement("canvas"); scratch.width = viewport.width; scratch.height = viewport.height;
      const c = scratch.getContext("2d", { willReadFrequently: true });
      const hazard = { kind: "band", y: Math.round(viewport.height / 2), right: viewport.width, thickness: 115, age: .5, warning: 1, duration: 1 };
      drawAlienHazard(c, { ...hazard, color: "#fea075" }, true);
      const baseline = c.getImageData(0, 0, scratch.width, scratch.height).data;
      drawFlightDangerPattern(c, hazard);
      const marked = c.getImageData(0, 0, scratch.width, scratch.height).data;
      let pixels = 0;
      for (let i = 0; i < baseline.length; i += 4) if (baseline[i] !== marked[i] || baseline[i + 3] !== marked[i + 3]) pixels++;
      const aperturePixel = marked[((hazard.y * scratch.width + Math.floor(scratch.width / 2)) * 4) + 3];
      return { pixels, aperturePixel };
    });
    assert.ok(changed.pixels > 50);
    assert.equal(changed.aperturePixel, 0);
    evidence.pattern = changed;
    await page.evaluate(() => {
      spawnBoss(0);
      boss.phase = "recover"; boss.phaseTime = 0; bossHazards.length = 0;
      addBossHazard("band", { y: player.y, right: viewport.width, thickness: 148, warning: 3, duration: .4, color: "#fea075" });
    });
    await page.waitForFunction(() => bossHazards.some(hazard => hazard.kind === "band" && hazard.age > .03));
    await page.screenshot({ path: path.join(output, "hazard-pattern.png") });

    await page.evaluate(() => {
      shield.remaining = 0; bossHitGrace = 0; player.lives = 1; damagePlayer("Test terminal");
    });
    await page.waitForFunction(() => state === "over");
    await tap(1);
    await page.waitForFunction(() => state === "menu");
    await page.setViewportSize({ width: 640, height: 360 });
    await openControls();
    await page.screenshot({ path: path.join(output, "controls-compact.png") });
    await page.locator("#flight-controls-reset").focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => flightControls.bindings.charge), "KeyC");
    assert.equal(await page.evaluate(() => flightControls.bindings.pause), "Escape");
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "controls-browser.json"), JSON.stringify({ evidence, errors }, null, 2) + "\n");
    console.log(JSON.stringify(evidence));
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
