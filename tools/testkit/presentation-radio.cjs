// Isolated real-Chrome proof; no test controls are shipped in the game.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(process.argv[2] || path.join(__dirname, "../.."));
const out = path.resolve(process.argv[3]);
const baseline = process.argv.includes("--baseline");
const origin = "https://star-breaker-presentation.invalid";
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".mp3": "audio/mpeg", ".ogg": "audio/ogg" };
const save = (name, data) => fs.writeFileSync(path.join(out, name), Buffer.from(data.split(",").at(-1), "base64"));

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route(origin + "/**", route => {
      const uri = new URL(route.request().url());
      const file = path.resolve(root, decodeURIComponent(uri.pathname.slice(1) || "index.html"));
      return file.startsWith(root + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()
        ? route.fulfill({ path: file, contentType: mime[path.extname(file)] }) : route.fulfill({ status: 404 });
    });
    await page.goto(origin);
    await page.locator(".flight-guide-actions button").first().click();
    await page.locator("#start-button").click();
    await page.evaluate(() => {
      nextBossTime = enemyCooldown = powerupCooldown = shotCooldown = Infinity;
      battlefieldState.clock = 86;
      scenerySyncJourney();
      spawnBoss(2);
      resetBossPresentation();
      Object.assign(boss, bossArena(2), { phase: "recover", phaseTime: -900, age: 1 });
    });
    await page.waitForFunction(() => starBreakerModelCache.get(2)?.model && bossModelStage()?.sectorMaps.size);
    const { on, off, contact, flash, ...light } = await page.evaluate(() => {
      const surface = document.createElement("canvas");
      surface.width = 640; surface.height = 400;
      const ctx = surface.getContext("2d", { willReadFrequently: true });
      const paint = () => {
        ctx.fillStyle = "#242a35"; ctx.fillRect(0, 0, 640, 400);
        drawStarBreakerModel(ctx, 2, 320, 200, 585, 340, { time: 1, charge: 0, ruptured: 0,
          hit: 0, recoil: 0, quiet: true, color: boss.color });
        return { data: ctx.getImageData(0, 0, 640, 400).data, uri: surface.toDataURL() };
      };
      const lit = paint(), emitter = bossEmitterLights[2];
      const strength = emitter[3]; emitter[3] = 0;
      const unlit = paint(); emitter[3] = strength;
      const previous = combatEffects.light;
      combatEffects.light = null;
      pulseCombatLight(166, 174, 480, "#ff7850", "ultimate");
      const litByFlash = paint();
      combatEffects.light = previous;
      let delta = 0, bright = 0, saturated = 0, flashDelta = 0, flashClipping = 0, n = 0;
      for (let y = 55; y < 344; y++) for (let x = 42; x < 600; x++) {
        const i = (y * 640 + x) * 4;
        const d = (Math.abs(lit.data[i] - unlit.data[i]) + Math.abs(lit.data[i + 1] - unlit.data[i + 1])
          + Math.abs(lit.data[i + 2] - unlit.data[i + 2])) / 3;
        delta += d; n++; if (d >= 8) bright++; if (lit.data[i] >= 250 && lit.data[i + 1] >= 250 && lit.data[i + 2] >= 250) saturated++;
        flashDelta += (Math.abs(lit.data[i] - litByFlash.data[i]) + Math.abs(lit.data[i + 1] - litByFlash.data[i + 1])
          + Math.abs(lit.data[i + 2] - litByFlash.data[i + 2])) / 3;
        if (litByFlash.data[i] >= 250 && litByFlash.data[i + 1] >= 250 && litByFlash.data[i + 2] >= 250) flashClipping++;
      }
      ctx.fillStyle = "#8791a6"; ctx.fillRect(0, 0, 640, 400);
      drawBossContactShadow(ctx, 320, 140, 320, 180);
      return { meanDelta: delta / n, brightenedShare: bright / n, clippingShare: saturated / n, strength,
        flashDelta: flashDelta / n, flashClippingShare: flashClipping / n, flash: litByFlash.uri,
        shadowRed: ctx.getImageData(335, 206, 1, 1).data[0], on: lit.uri, off: unlit.uri, contact: surface.toDataURL() };
    });
    save("cinder-emitter-on.png", on); save("cinder-emitter-off.png", off); save("contact-shadow-isolated.png", contact);
    save("cinder-special-spill.png", flash);
    assert.ok(baseline || (light.meanDelta >= 8 && light.clippingShare < .03), JSON.stringify(light));
    const { frames, tracks } = await page.evaluate(() => {
      spawnBoss(0); resetBossPresentation(); beginBossFinale(boss);
      const target = { ...boss, finale: { ...boss.finale, age: 6 }, x: 630, y: 318, width: 310, height: 246 };
      const surface = document.createElement("canvas");
      surface.width = 1100; surface.height = 720;
      const ctx = surface.getContext("2d");
      const duration = bossPresentationDuration(target, "death");
      const frames = [.46, .56, .66, .78, .90].map(fraction => {
        ctx.fillStyle = "#111a27"; ctx.fillRect(0, 0, 1100, 720);
        drawBossPresentationBody(ctx, { target, duration, age: duration * fraction,
          kind: "death", profile: bossPresentationProfiles[0] }, false);
        return surface.toDataURL();
      });
      const tracks = typeof presentationDebrisPosition === "function" ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(type => {
        const [x, y, depth] = bossFragmentAtlas[type + 11][7];
        return [.1, .3, .5, .7, .9].map(t => presentationDebrisPosition(type, x, y, depth, 7, t, 1.9, 320, 220));
      }) : [];
      return { frames, tracks };
    });
    frames.forEach((frame, i) => save(`broodmother-fragments-${i + 1}.png`, frame));
    if (!baseline) assert.ok(tracks.every((path, i) => i === 8 || path[4][1] - 2 * path[3][1] + path[2][1] > 12));
    const radio = {};
    if (!baseline) {
      for (const [lang, size] of [["zh", [1280, 720]], ["en", [640, 360]]]) {
        await page.setViewportSize({ width: size[0], height: size[1] });
        await page.evaluate(lang => {
          setGameLanguage(lang);
          startBattleWithSound();
          shotCooldown = enemyCooldown = powerupCooldown = Infinity;
          nextBossTime = battleTime + 3.3;
        }, lang);
        await page.waitForFunction(() => flightRadio?.kind === "incoming" && flightRadio.age > .25);
        const status = await page.evaluate(() => {
          const panel = document.getElementById("flight-radio"), line = panel.querySelector(".radio-line");
          return { full: panel.querySelector(".radio-announcement").textContent, typed: line.textContent,
            pointer: getComputedStyle(panel).pointerEvents, lines: Math.round(line.getBoundingClientRect().height / parseFloat(getComputedStyle(line).lineHeight)),
            unique: new Set(flightRadioLines.flat(1).map(row => row[1])).size };
        });
        assert.ok(status.full.length > status.typed.length && status.lines <= 2 && status.unique === 22 && status.pointer === "none");
        await page.keyboard.down("ArrowDown");
        await page.waitForTimeout(450);
        await page.keyboard.up("ArrowDown");
        await page.screenshot({ path: path.join(out, `radio-incoming-${lang}.png`) });
        await page.evaluate(() => {
          nextBossTime = Infinity;
          spawnBoss(0); resetBossPresentation(); beginBossFinale(boss); resetBossPresentation();
          defeatBoss(boss);
        });
        await page.waitForFunction(() => flightRadio?.kind === "cleared" && flightRadio.age > 1.6);
        await page.screenshot({ path: path.join(out, `radio-cleared-${lang}.png`) });
        await page.evaluate(() => saveSortieSetting("radio", false));
        await page.waitForFunction(() => document.getElementById("flight-radio").hidden);
        await page.evaluate(() => saveSortieSetting("radio", true));
        radio[lang] = status;
      }
    }
    assert.deepEqual(errors, []);
    const result = { baseline, light, tracks, radio, errors };
    fs.writeFileSync(path.join(out, "presentation-radio.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ light, radio, errors }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
