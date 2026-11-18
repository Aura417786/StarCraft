"use strict";

// node tools/testkit/published-release.cjs <trusted public Game URL> <frozen manifest.json> <evidence directory>
// Uses a new browser profile. All interactions follow the visible visitor UI.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const required = [
  "index.html", "boss-mimicry.js", "evolution-preview.js", "ship-renderer.js", "fighter-atlas-data.js",
  "fighter-variants.js", "opening-story.js", "battlefield.js", "journey.js", "journey-art.js", "boss-attack-art.js", "boss-confluence-vfx.js", "boss-pressure-art.js", "boss-ultimate-art.js",
  "elemental-armored-vfx.js", "elemental-cosmic-vfx.js", "nextgen-elemental-vfx.js",
  "assets/vfx/nextgen/tidal-breaker.webp", "assets/vfx/nextgen/void-inclined-horizon.webp",
  "assets/vfx/nextgen/void-collapse-front.webp", "assets/vfx/nextgen/void-shear.webp", "boss-vfx-materials.js",
  "boss-resonance.js", "alien-attacks.js", "alien-models.js", "alien-pressure.js", "boss-creature-vfx.js",
  "boss-finales.js", "boss-mechanics.js", "boss-pressure.js", "bosses.js", "elemental-fluid-vfx.js",
  "evolution-weapons.js", "evolution.js", "flight-vfx.js", "game.js", "player-vfx.js", "scene-lighting.js",
  "shield.js", "sortie-ui.js", "space-props.js", "tactical-system.js", "ultimate.js", "audio.js", "audio-catalog.js",
  "tactical-hangar.css", "tactical-hud.css", "tactical-system.css",
  "assets/scenery/orbital-material.png", "assets/vfx/nextgen/water-atlas.webp",
  "assets/vfx/nextgen/boss-organs.webp", "assets/vfx/nextgen/boss-ejecta.webp",
  "assets/vfx/fighters/crimson.webp", "assets/vfx/fighters/azure.webp", "assets/vfx/fighters/auric.webp",
  ...["red", "blue", "yellow"].flatMap(id =>
    ["hangar", "body", "atlas"].map(view => `assets/fighters/classic/${id}-${view}.webp`)),
  "assets/audio/encounters/manifest.json", "assets/audio/encounters/enc_water_signature.ogg",
  "assets/audio/encounters/enc_victory.ogg",
];

function gameUrl(input) {
  const url = new URL(input);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  assert.ok(url.protocol === "https:" || (local && url.protocol === "http:"), "Use HTTPS or loopback HTTP");
  assert.ok(!url.username && !url.password && !url.search && !url.hash, "Pass the game URL without credentials, query or fragment");
  if (url.pathname.endsWith("/index.html")) return new URL("./", url);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

async function verifyAssets(page, base, manifest, report) {
  const selected = new Map();
  const rows = new Map(manifest.files.map(row => [row.path, row]));
  for (const name of required) {
    assert.ok(rows.has(name), "Release manifest omits " + name);
    selected.set(name, rows.get(name));
  }
  for (const row of manifest.files) {
    if (row.path.startsWith("assets/fighters/classic/") || row.path.startsWith("assets/vfx/nextgen/") || row.path.startsWith("assets/audio/encounters/") || row.path.startsWith("assets/vfx/materials/")) selected.set(row.path, row);
  }
  const files = Array.from(selected.values()).sort((a, b) => a.path.localeCompare(b.path));
  for (let start = 0; start < files.length; start += 4) {
    const results = await Promise.all(files.slice(start, start + 4).map(async file => {
      assert.ok(file.path.split("/").every(segment => /^[a-z0-9_.-]+$/i.test(segment) && ![".", ".."].includes(segment)), file.path);
      const canonical = new URL(file.path === "index.html" ? "./" : file.path, base);
      const target = report.entry.resources.find(href => {
        const resource = new URL(href);
        return resource.origin === canonical.origin && resource.pathname === canonical.pathname;
      }) ?? canonical.href;
      const row = { path: file.path, requested: target, expectedBytes: file.bytes, expectedSha256: file.sha256 };
      try {
        const response = await page.request.get(target, { maxRedirects: 0, timeout: 30000 });
        try {
          const data = await response.body();
          row.status = response.status();
          row.bytes = data.length;
          row.sha256 = crypto.createHash("sha256").update(data).digest("hex");
          row.ok = row.status === 200 && row.bytes === file.bytes && row.sha256 === file.sha256;
        } finally { await response.dispose(); }
      } catch (error) { row.error = error.message; row.ok = false; }
      return row;
    }));
    report.assets.push(...results);
  }
  const failed = report.assets.filter(row => !row.ok);
  assert.deepEqual(failed.map(row => row.path), [], "Published content differs from the frozen release");
}

async function visitor(page, base, out, report) {
  const navigation = await page.goto(base.href, {waitUntil: "domcontentloaded", timeout: 45000});
  assert.ok(navigation?.ok(), "Game entry failed to load");
  assert.equal(new URL(page.url()).origin, base.origin, "Game entry changed origin");
  await page.waitForFunction(() => document.querySelector("#start-button")?.disabled === false);
  const guide = page.locator(".flight-guide-actions button[type=submit]");
  if (await guide.isVisible()) await guide.click();
  report.entry = await page.evaluate(() => ({
    title: document.title, heading: document.querySelector("#start-screen h1")?.textContent.trim(),
    canvas: !!document.querySelector("canvas#game-canvas"),
    version: document.querySelector('meta[name="application-version"]')?.content,
    bossStageBeacons: document.querySelectorAll(".boss-phase-beacons i").length,
    resources: Array.from(document.querySelectorAll("script[src],link[rel=stylesheet]"), tag => tag.src || tag.href),
  }));
  assert.ok(report.entry.title.includes(report.version));
  assert.equal(report.entry.version, report.version.slice(1));
  assert.equal(report.entry.bossStageBeacons, 3);
  assert.match(report.entry.heading, /星际突围|Star\s*Breaker/i);
  assert.ok(report.entry.canvas);
  const referenced = new Set(report.entry.resources);
  for (const entry of ["boss-mimicry.js","boss-resonance.js","audio.js","audio-catalog.js","tactical-hud.css","tactical-hangar.css"].map(file => file + "?v=" + report.entry.version)) {
    assert.ok(referenced.has(new URL(entry,base).href), "Homepage omits release resource "+entry);
  }
  await page.screenshot({path:path.join(out,"visitor-hangar.png")});
  await page.locator("#start-button").click();
  await page.waitForFunction(() => document.querySelector("#campaign-opening")?.open || document.querySelector("#start-screen").hidden);
  const skip = page.locator("#campaign-opening .opening-finish");
  if (await skip.isVisible()) await skip.click();
  await page.locator("#start-screen").waitFor({state:"hidden"});
  const training = page.locator("#flight-training-skip");
  if (await training.isVisible()) await training.click();
  await page.locator("#game-canvas").click({position:{x:165,y:200}});
  await page.waitForFunction(() => typeof battleTime === "number" && battleTime > .10);
  await page.keyboard.down("ArrowDown");
  try { await page.waitForTimeout(250); } finally { await page.keyboard.up("ArrowDown"); }
  report.battle = await page.evaluate(() => ({state, seconds:battleTime, fighter:sortieFighter, lives:player.lives}));
  assert.equal(report.battle.state,"battle");
  await page.screenshot({path:path.join(out,"visitor-battle.png")});
  await page.locator("#pause-button").click();
  await page.locator("#pause-resume").waitFor({state:"visible"});
  report.pause = await page.evaluate(() => ({mode:pauseView, title:document.querySelector("#pause-title").textContent}));
  assert.equal(report.pause.mode,"menu");
  await page.screenshot({path:path.join(out,"visitor-paused.png")});
}

async function main() {
  const [input, manifestPath, evidenceDir] = process.argv.slice(2);
  assert.ok(input && manifestPath && evidenceDir, "Usage: node published-release.cjs BASE_URL MANIFEST_JSON EVIDENCE_DIR");
  const base = gameUrl(input), out = path.resolve(evidenceDir);
  const manifest = JSON.parse(fs.readFileSync(manifestPath,"utf8").replace(/^\uFEFF/,""));
  assert.ok(Array.isArray(manifest.files) && /^v36(?:$|[-.])/i.test(manifest.version), "Expected a v36 frozen manifest");
  fs.mkdirSync(out,{recursive:true});
  const report = {baseUrl:base.href, version:manifest.version, commit:manifest.commit, tag:manifest.tag,
    checkedAt:new Date().toISOString(), assets:[], runtimeErrors:[], failedResponses:[], passed:false};
  let browser, page;
  try {
    browser = await chromium.launch({executablePath:process.env.CHROME_PATH, headless:true});
    report.browser = browser.version();
    const context = await browser.newContext({viewport:{width:1440,height:900}, locale:"zh-CN"});
    page = await context.newPage();
    page.setDefaultTimeout(18000);
    page.on("pageerror", error => report.runtimeErrors.push(error.message));
    page.on("response", response => {
      const url = new URL(response.url());
      if (url.origin === base.origin && !url.pathname.endsWith("/favicon.ico") && response.status() >= 400) {
        report.failedResponses.push({path:url.pathname,status:response.status()});
      }
    });
    await visitor(page,base,out,report);
    await verifyAssets(page,base,manifest,report);
    assert.deepEqual(report.runtimeErrors,[]);
    assert.deepEqual(report.failedResponses,[]);
    report.passed = true;
    console.log(JSON.stringify({status:"PASS",url:base.href,files:report.assets.length,version:report.version,output:out}));
  } catch (error) {
    report.error = error.message;
    if (page && !page.isClosed()) await page.screenshot({path:path.join(out,"visitor-failure.png"), timeout:4000}).catch(()=>{});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out,"published-release.json"),JSON.stringify(report,null,2)+"\n");
    if (browser) await browser.close();
  }
}

main().catch(error => {console.error(error.message); process.exitCode = 1;});
