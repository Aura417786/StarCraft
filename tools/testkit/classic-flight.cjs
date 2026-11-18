"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

const game = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const ids = ["red", "blue", "yellow"];
const variants = [
  { label: "desktop", width: 1440, height: 900, dpr: 2 },
  { label: "mobile", width: 390, height: 844, dpr: 3, mobile: true },
  { label: "landscape", width: 844, height: 390, dpr: 3, mobile: true },
];

async function choose(page, id) {
  await page.locator(".fighter-option[data-fighter='" + id + "']").click();
  await page.waitForFunction(key => {
    const image = document.querySelector("#fighter-art");
    return image.complete && image.naturalWidth > 0 && image.currentSrc.endsWith("/" + key + "-hangar.webp");
  }, id);
}

function inspectPortrait() {
  const image = document.querySelector("#fighter-art");
  const rect = image.getBoundingClientRect();
  const aspect = image.naturalWidth / image.naturalHeight;
  const width = Math.min(rect.width, rect.height * aspect);
  const height = width / aspect;
  const x = rect.left + (rect.width - width) / 2;
  const y = rect.top + (rect.height - height) / 2;
  const visibleWidth = Math.max(0, Math.min(innerWidth, x + width) - Math.max(0, x));
  const visibleHeight = Math.max(0, Math.min(innerHeight, y + height) - Math.max(0, y));
  return { path: new URL(image.currentSrc).pathname, native: [image.naturalWidth, image.naturalHeight],
    display: [width, height], visibleFraction: (visibleWidth * visibleHeight) / (width * height),
    sourcePixelRatio: image.naturalWidth / (width * devicePixelRatio), dpr: devicePixelRatio };
}

// Invoke the production player renderer once. Capture the transforms actually
// delivered to the hull and to the two material emitters in that same pass.
function inspectPass() {
  const id = fighterProfile().id;
  const art = fighterAtlasCatalog[id];
  const emitters = [];
  let mesh = null;
  const baseline = context.getTransform().inverse();
  const material = drawFlightExhaustMaterial;
  const shade = shadeSceneShip;
  drawFlightExhaustMaterial = function (ctx, palette, length, radius, phase, opacity, ...rest) {
    if (opacity > 0.05 && ctx === context) {
      const m = baseline.multiply(ctx.getTransform());
      emitters.push([m.e, m.f]);
    }
    return material(ctx, palette, length, radius, phase, opacity, ...rest);
  };
  shadeSceneShip = function (ctx, ship, texture, crop, geo, affected) {
    if (ship === player) {
      const transform = baseline.multiply(ctx.getTransform());
      const frame = crop && texture === preloadFighterAtlas(id) ? crop[0] / art.width : null;
      const sockets = frame === null ? fighterVariantArt[id].engines : art.frames[frame].engines;
      const toScreen = point => {
        const p = transform.transformPoint(geo.point(point));
        return [p.x, p.y];
      };
      mesh = { frame, sockets: sockets.map(toScreen), muzzle: [transform.e, transform.f] };
    }
    return shade.apply(this, arguments);
  };
  try { drawPlayer(1); } finally {
    drawFlightExhaustMaterial = material;
    shadeSceneShip = shade;
  }
  const errors = mesh?.sockets.map(([x,y], i) =>
    Math.hypot(x - emitters[i][0], y - emitters[i][1]));
  return { id, bank: shipVisuals.bank, mesh, emitters, errors,
    tipError: mesh ? Math.hypot(mesh.muzzle[0] - muzzlePosition().x, mesh.muzzle[1] - muzzlePosition().y) : null };
}

async function checkPass(page, id, expectedFrame, label) {
  const pass = await page.evaluate(inspectPass);
  assert.equal(pass.id, id);
  assert.equal(pass.mesh?.frame, expectedFrame, JSON.stringify(pass));
  assert.ok(pass.emitters.length >= 3 && pass.errors.every(d => d < 1.1), JSON.stringify(pass));
  assert.ok(pass.tipError < 0.01);
  assert.ok(Math.abs(pass.mesh.sockets[0][1] - pass.mesh.sockets[1][1]) > 3);
  const shot = await page.locator("#game-canvas").screenshot({ type: "jpeg", quality: 85, scale: "css" });
  fs.writeFileSync(path.join(output, id + "-" + label + ".jpg"), shot);
  return pass;
}

async function visit(browser, options, report) {
  const pageOptions = { viewport: { width: options.width, height: options.height },
    deviceScaleFactor: options.dpr, isMobile: !!options.mobile, hasTouch: !!options.mobile };
  const { page, errors } = await createPage(browser, game, false, { pageOptions });
  try {
    for (const id of ids) {
      await page.locator("#hangar-loadout").click();
      await choose(page, id);
      await page.locator("#hangar-back-loadout").click();
      const frame = await page.evaluate(inspectPortrait);
      report.menus.push({ layout: options.label, id, ...frame });
      assert.equal(frame.path, "/assets/fighters/classic/" + id + "-hangar.webp");
      assert.ok(frame.visibleFraction > .96, JSON.stringify(frame));
      assert.ok(frame.sourcePixelRatio >= 1, "Hangar render was upscaled: " + JSON.stringify(frame));
      if (id === "red") await page.screenshot({ path: path.join(output, options.label + "-home.jpg"),
        type: "jpeg", quality: 89, scale: "css" });
      if (options.mobile) continue;
      await page.evaluate(() => setVisualQuality("high", false));
      await page.locator("#start-button").click();
      await page.waitForFunction(key => state === "battle" && sortieFighter === key
        && fighterVariantArt[key].ready && preloadFighterAtlas(key)?.complete, id);
      await page.locator("#game-canvas").focus();
      const passes = [await checkPass(page, id, 2, "level")];
      for (const [key, index, label] of [["ArrowUp", 0, "port"], ["ArrowDown", 4, "starboard"]]) {
        await page.keyboard.down(key);
        try {
          await page.waitForFunction(polarity => polarity * shipVisuals.bank > .81, index ? 1 : -1);
          passes.push(await checkPass(page, id, index, label));
        } finally { await page.keyboard.up(key); }
      }
      await page.evaluate(() => setVisualQuality("low", false));
      await page.waitForFunction(() => Math.abs(shipVisuals.bank) < .02);
      passes.push(await checkPass(page, id, null, "fallback"));
      report.battles.push({ id, passes });
      await page.reload({ waitUntil: "load" });
    }
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  const report = { browser: browser.version(), menus: [], battles: [] };
  try {
    for (const options of variants) await visit(browser, options, report);
    report.passed = true;
  } finally {
    fs.writeFileSync(path.join(output, "classic-flight.json"), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log("All 9 hangar selections and 12 combat/engine passes succeeded.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
