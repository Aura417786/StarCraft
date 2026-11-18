"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");
const { serveOpeningFilms } = require("./opening-media-route.cjs");

async function main() {
  const game = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true,
    args: ["--disable-gpu", "--disable-webgl"] });
  try {
    const { page, errors } = await createPage(browser, game, false, { campaignOpening: true });
    const failed = [];
    await page.route("**/assets/intro/performances/*.mp4", route => {
      failed.push(path.basename(new URL(route.request().url()).pathname));
      return route.fulfill({ status: 404, body: "" });
    });
    await page.addInitScript(() => {
      const videos = [], plates = new Set();
      window.fallbackVideos = videos;
      window.fallbackPlates = plates;
      const make = document.createElement.bind(document);
      document.createElement = function(tag, options) {
        const node = make(tag, options);
        if (node instanceof HTMLVideoElement) videos.push(node);
        return node;
      };
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
        if (this.canvas.matches(".opening-stage") && image instanceof HTMLImageElement)
          plates.add(image.src.split("/").pop());
        return draw.call(this, image, ...args);
      };
    });
    await page.goto(new URL("?qa=1", page.url()).href);
    const guide = page.locator(".flight-guide-actions button").first();
    if (await guide.isVisible()) await guide.click();
    await page.locator("#start-button").click();
    await page.locator("#campaign-opening").waitFor();
    const shots = [[40,"briefing","command"],[64,"resolve","command"],[110,"witnesses","crew"],
      [124,"helmet-lift","lookback"],[128,"seal-check","helmet"]];
    const samples = [];
    for (const [time, film, plate] of shots) {
      await page.evaluate(t => { fallbackPlates.clear(); campaignOpening.seekForQa(t); }, time);
      await page.waitForFunction(({film,plate}) => {
        const active = fallbackVideos.find(v => v.src.endsWith("/"+film+".mp4"));
        return !!active?.error && fallbackPlates.has(plate+".webp") && !campaignOpening.inspectForQa().decodedFilm;
      },{film,plate});
      samples.push({ film, fallbackPlate: plate, decoded: false });
    }
    await page.evaluate(() => { fallbackPlates.clear(); campaignOpening.seekForQa(141); });
    const noWebGL = await page.evaluate(() => !document.createElement("canvas").getContext("webgl")
      && !campaignOpening.inspectForQa().dimensionalHull);
    assert.ok(noWebGL);
    const litSamples = await page.evaluate(() => {
      const canvas = document.querySelector(".opening-stage"), ctx = canvas.getContext("2d");
      const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let lit = 0;
      for (let i=0;i<data.length;i+=128) if (data[i]+data[i+1]+data[i+2]>150) lit++;
      return lit;
    });
    assert.ok(litSamples>400, "The software-rendered formation must still show the fleet");
    await page.locator(".opening-pause").click();
    assert.ok(await page.evaluate(() => campaignOpening.inspectForQa().paused));
    await page.locator(".opening-pause").click();
    await page.evaluate(() => campaignOpening.seekForQa(146));
    await page.waitForFunction(() => state==="battle" && !campaignOpening.active && !document.querySelector(".opening-handoff"));
    const cleanup = await page.evaluate(() => {
      const stage = document.querySelector(".opening-stage");
      return { count: fallbackVideos.length, sourcesRemoved: fallbackVideos.every(v=>!v.hasAttribute("src") && v.paused),
        listenersRemoved: fallbackVideos.every(v=>!v.onseeked && !v.onloadeddata),
        stage: [stage.width,stage.height], state, handoff: !!document.querySelector(".opening-handoff") };
    });
    assert.deepEqual(cleanup, {count:5,sourcesRemoved:true,listenersRemoved:true,stage:[1,1],state:"battle",handoff:false});
    await page.unroute("**/assets/intro/performances/*.mp4");
    await serveOpeningFilms(page,game);
    await page.evaluate(() => showScreen("menu"));
    await page.locator("#hangar-manual").click();
    await page.locator("#replay-intro-button").click();
    await page.locator("#campaign-opening").waitFor();
    await page.locator(".opening-pause").click();
    await page.evaluate(() => campaignOpening.seekForQa(63));
    await page.waitForFunction(() => campaignOpening.inspectForQa()?.decodedFilm);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.activeElement?.id === "replay-intro-button");
    const replay = await page.evaluate(() => ({
      count: fallbackVideos.length,
      released: fallbackVideos.every(v => v.paused && !v.hasAttribute("src") && !v.onseeked && !v.onloadeddata),
      canvasWidth: document.querySelector(".opening-stage").width,
      state,
    }));
    assert.deepEqual(replay,{count:6,released:true,canvasWidth:1,state:"menu"});
    const unexpected = errors.filter(e => !e.startsWith("404 ") || !e.includes("/assets/intro/performances/"));
    assert.deepEqual(unexpected,[]);
    assert.deepEqual([...new Set(failed)].sort(),shots.map(s=>s[1]+".mp4").sort());
    fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,"opening-fallback.json"),JSON.stringify({noWebGL,samples,failed,cleanup,replay,unexpected},null,2));
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
