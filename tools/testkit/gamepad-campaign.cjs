"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const origin = "https://star-breaker-controller-campaign.invalid";
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".glb": "model/gltf-binary",
  ".ogg": "audio/ogg", ".mp3": "audio/mpeg" };

async function run() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true,
    args: ["--use-angle=d3d11", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.text().startsWith("CONTROLLER ")) console.log(message.text());
  });
  await page.route(origin + "/**", route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
      return route.fulfill({ status: 404 });
    return route.fulfill({ contentType: mime[path.extname(file)] ?? "application/octet-stream", path: file });
  });
  await page.addInitScript(() => {
    localStorage.setItem("star-breaker-language", "en");
    localStorage.setItem("star-breaker-guide-seen", "1");
    localStorage.setItem("star-breaker-flight-training", "1");
    localStorage.setItem("star-breaker-opening-seen", "1");
    const device = { index: 0, mapping: "standard", connected: true, axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    Object.defineProperty(navigator, "getGamepads", { value: () => [device] });
    window.liveFlightPad = device;
  });
  const policy = fs.readFileSync(path.join(root, "tools/testkit/balance-policy.js"), "utf8");
  const replacements = [
    ["function balancePress(code, type = \"keydown\") {", "function balancePress(code, type = \"keydown\") { window.controllerPilot.press(code, type); return;"],
    ["function balanceMove(horizontal, vertical) {", "function balanceMove(horizontal, vertical) { window.controllerPilot.move(horizontal, vertical); return;"],
    ["if (choice) chooseEvolution(choice);", "if (choice) window.controllerPilot.select(choice);"],
  ];
  let bridgePolicy = policy;
  for (const [before, after] of replacements) {
    assert.ok(bridgePolicy.includes(before), "Pilot entry needs to be updated");
    bridgePolicy = bridgePolicy.replace(before, after);
  }
  const wall = Date.now();
  try {
    await page.goto(origin);
    await page.bringToFront();
    await page.locator("#start-button").waitFor();
    await page.waitForFunction(() => !document.querySelector("#start-button").disabled);
    await page.addScriptTag({ content: bridgePolicy });
    await page.evaluate(() => {
      const device = liveFlightPad;
      const controls = { build: "wings", shiftHeld: false, shiftSince: 0, nextLance: 0, nextFalcon: 0, shields: 0, specials: 0 };
      const status = { started: false, active: true, clears: [], choices: [], frames: 0, damage: 0, pilotActions: 0 };
      const indices = { KeyC: 6, ShiftLeft: 4, KeyV: 2, Space: 3, KeyF: 5 };
      function button(index, pressed) {
        const target = device.buttons[index];
        if (!target) throw Error("Unmapped controller action");
        target.pressed = pressed;
        target.value = Number(pressed);
        pollFlightGamepad();
      }
      function tap(index) { button(index, true); button(index, false); }
      function focusSelector(selector) {
        for (let index = 0; index < 40; index++) {
          if (document.activeElement?.matches(selector)) return true;
          tap(13);
        }
        return false;
      }
      window.controllerPilot = {
        status, tap, controls,
        press(code, type) { button(indices[code], type === "keydown"); status.pilotActions++; },
        move(horizontal, vertical) { device.axes[0] = horizontal; device.axes[1] = vertical; pollFlightGamepad(); },
        select(kind) {
          const card = '.evolution-card[data-choice="' + kind + '"]';
          if (!focusSelector(card)) throw Error("Evolution card unreachable on controller: " + kind);
          tap(0); status.choices.push(kind);
        },
      };
      if (!focusSelector("#start-button")) throw Error("Start unreachable on controller");
      tap(0);
      status.started = state === "battle";
      let nextDecision = 0;
      const loop = now => {
        status.frames++;
        if (state !== "battle") {
          status.end = state;
          status.playTime = battleTime;
          status.damage = sortieStats?.hitsTaken ?? 0;
          if (campaignVictory?.stage === "sequence") {
            requestAnimationFrame(loop);
            return;
          }
          status.campaign = campaignVictory?.stage ?? null;
          status.won = !!sortieStats?.result?.won;
          status.reportCards = document.querySelectorAll(".campaign-boss-card[data-cleared='true']").length;
          status.active = false;
          console.log("CONTROLLER final " + JSON.stringify(status));
          return;
        }
        if (bossDefeated > status.clears.length) {
          status.clears.push({ boss: bossDefeated, time: Math.round(battleTime * 10) / 10, lives: player.lives });
          console.log("CONTROLLER boss " + bossDefeated + " at " + battleTime.toFixed(1) + "s; hull " + player.lives);
        }
        if (now >= nextDecision || evolution.pending) {
          balanceChooseAction(controls, "pilot");
          nextDecision = now + 1000 / 15;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.waitForFunction(() => !controllerPilot.status.active, null, { timeout: 35 * 60 * 1000, polling: 1000 });
    const result = await page.evaluate(() => ({ ...controllerPilot.status, mode: sortieStats?.mode, difficulty: sortieStats?.difficulty,
      assist: sortieStats?.assisted, seed: sortieStats?.seed, lives: player.lives }));
    fs.writeFileSync(path.join(output, "gamepad-campaign.json"), JSON.stringify({
      browser: browser.version(), result, realSeconds: (Date.now() - wall) / 1000, errors,
      input: "Synthetic standard Gamepad device through the production poller. Full rendered campaign at normal speed.",
    }, null, 2) + "\n");
    await page.screenshot({ path: path.join(output, "gamepad-campaign-result.png") });
    assert.deepEqual(errors, []);
    assert.equal(result.started, true);
    assert.equal(result.won, true, JSON.stringify(result));
    assert.equal(result.reportCards, 11);
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
