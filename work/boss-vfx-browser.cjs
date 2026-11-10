const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const game = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const output = path.resolve(process.argv[3] || path.join(game, "work", "v19-r3-vfx-qa"));
const types = {".html":"text/html",".js":"text/javascript",".css":"text/css",".glb":"model/gltf-binary",".webp":"image/webp",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",".mp3":"audio/mpeg",".ogg":"audio/ogg"};
fs.mkdirSync(output,{recursive:true});

(async () => {
  const browser = await chromium.launch({ executablePath:process.env.CHROME_PATH, headless:true });
  let context;
  try {
    context = await browser.newContext({ viewport:{width:1440,height:810},
      ...(process.env.RECORD_VFX && {recordVideo:{dir:output,size:{width:1280,height:720}}}) });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", err => errors.push(err.message));
    await page.addInitScript(() => {
      let draw, time = 500;
      window.requestAnimationFrame = callback => { draw = callback; return 1; };
      window.stepVfx = (frames = 1) => {
        for (let i = 0; i < frames; i++) { time += 25; draw(time); }
      };
    });
    await page.route("https://vfx-qa.invalid/**", route => {
      const local = path.resolve(game, decodeURIComponent(new URL(route.request().url()).pathname).slice(1) || "index.html");
      if (!local.startsWith(game + path.sep) || !fs.existsSync(local)) return route.fulfill({status:404,body:""});
      return route.fulfill({contentType:types[path.extname(local)],body:fs.readFileSync(local)});
    });
    await page.goto("https://vfx-qa.invalid/");
    await page.locator(".flight-guide-actions button").click();
    await page.locator("#start-button").click();
    await page.evaluate(() => {
      window.vfxSetup = async (type, pattern, egg = false) => {
        resetBossEncounter(); resetCombatEffects();
        battleTime = 45 + type * 52;
        enemyCooldown = powerupCooldown = nextBossTime = Infinity;
        shotCooldown = Infinity;
        Object.assign(player, {lives:3, invulnerable:0, x:flightBounds.left + 235, y:alienLane(.16)});
        player.previousX = player.x; player.previousY = player.y;
        spawnBoss(type);
        if (typeof resetBossPresentation === "function") resetBossPresentation();
        Object.assign(boss, bossArena(type), {age:4, phase:"recover", phaseTime:0, attackIndex:pattern-1});
        if (typeof preloadAlienBossArt === "function") await preloadAlienBossArt(type).image.decode();
        if (egg) beginBossFinale(boss); else prepareAlienAttack(boss);
        bossHitGrace = 0;
        stepVfx(1);
      };
      window.findWave = egg => (egg ? boss.finale.hazards.find(h => h.type === "tide")
        : bossHazards.find(h => h.kind === "tide"));
      window.stepUntilWave = (wave, progress) => {
        if (!wave) throw new Error("Expected a tide fixture");
        const time = wave.warning + wave.duration * progress;
        for (let frame = 0; frame < 300 && wave.age < time - 1e-9; frame++) stepVfx(1);
        if (wave.age < time - 1e-9) throw new Error("Tide did not progress to the target frame");
      };
      window.sampleWave = (egg, width, quiet) => {
        const wave = findWave(egg);
        const shot = {...wave, age:wave.warning + wave.duration * .48};
        const sample = document.createElement("canvas");
        sample.width = viewport.width; sample.height = viewport.height;
        const ctx = sample.getContext("2d", {willReadFrequently:true});
        if (egg) drawFinaleHazard(ctx, shot, quiet); else drawAlienSignatureHazard(ctx, shot, quiet);
        const progress = signatureProgress(shot);
        const safeY = egg ? shot.gap.center : alienTideGap(shot, progress);
        const edgeY = Math.max(32, safeY - width * .76);
        const atX = egg ? finaleTideX(shot, edgeY, shot.age) : alienTideX(shot, edgeY, progress);
        const rgba = (x, y) => [...ctx.getImageData(Math.round(x), Math.round(y),1,1).data];
        return { danger:rgba(atX, edgeY), safe:rgba(atX,safeY), away:rgba(atX-210,edgeY) };
      };
    });
    await page.evaluate(() => vfxSetup(0,1));
    await page.evaluate(() => stepVfx(13));
    await page.screenshot({path:path.join(output,"01-water-approach.png")});
    const initial = await page.evaluate(() => ({y:player.y,gap:findWave(false).gapY,lives:player.lives}));
    assert.ok(initial.gap > initial.y);
    await page.keyboard.down("ArrowDown");
    for (let i=0;i<24;i++) {
      if (await page.evaluate(y => {stepVfx(1);return player.y >= y - 5;},initial.gap)) break;
    }
    await page.keyboard.up("ArrowDown");
    await page.evaluate(() => stepUntilWave(findWave(false), .43));
    const normal = await page.evaluate(() => [false,true].map(q => sampleWave(false,findWave(false).gapSize,q)));
    for (const sample of normal) {
      assert.ok(sample.danger[3]>100,JSON.stringify(sample));
      assert.equal(sample.safe[3],0,JSON.stringify(sample));
      assert.equal(sample.away[3],0,JSON.stringify(sample));
    }
    await page.screenshot({path:path.join(output,"02-water-crossing.png")});
    if (process.env.RECORD_VFX) {
      for (let i=0;i<23;i++) {await page.evaluate(() => stepVfx(2));await page.waitForTimeout(48);}
    }
    assert.equal(await page.evaluate(() => player.lives),initial.lives);

    for (const [type,pattern,label] of [[1,1,"bone-cage"],[3,0,"silk"],[8,1,"void"],[9,0,"neural"],[5,1,"beam"],[2,1,"impact"]]) {
      await page.evaluate(([type,pattern])=>vfxSetup(type,pattern),[type,pattern]);
      await page.evaluate(() => stepVfx(33));
      await page.screenshot({path:path.join(output,"tell-"+label+".png")});
      if (process.env.RECORD_VFX) {
        for (let i=0;i<14;i++) {await page.evaluate(()=>stepVfx(2));await page.waitForTimeout(45);}
      }
    }

    await page.evaluate(() => vfxSetup(0,0,true));
    const finale = await page.evaluate(() => {
      for (let frame = 0; frame < 300 && !findWave(true); frame++) stepVfx(1);
      const wave = findWave(true);
      if (!wave) throw new Error("Finale did not reach its first tide");
      return { gap:wave.gap.center, y:player.y, lives:player.lives,
        samples:[false,true].map(q => sampleWave(true,wave.gap.half*2,q)) };
    });
    for (const sample of finale.samples) {
      assert.ok(sample.danger[3]>100,JSON.stringify(sample));
      assert.equal(sample.safe[3],0,JSON.stringify(sample));
      assert.equal(sample.away[3],0,JSON.stringify(sample));
    }
    await page.keyboard.down(finale.y < finale.gap ? "ArrowDown" : "ArrowUp");
    for (let i=0;i<36;i++) {
      if (await page.evaluate(y => {stepVfx(1);return Math.abs(player.y-y)<10;},finale.gap)) break;
    }
    await page.keyboard.up(finale.y < finale.gap ? "ArrowDown" : "ArrowUp");
    await page.evaluate(() => stepUntilWave(findWave(true), .48));
    await page.screenshot({path:path.join(output,"03-egg-wall.png")});
    if (process.env.RECORD_VFX) {
      for (let i=0;i<22;i++) {await page.evaluate(()=>stepVfx(2));await page.waitForTimeout(45);}
    }
    const egg = await page.evaluate(() => {
      const wave = findWave(true);
      if (wave) stepUntilWave(wave, 1);
      return player.lives;
    });
    assert.equal(egg,finale.lives);
    assert.deepEqual(errors,[]);
    const video = page.video();
    await context.close();
    context = null;
    if (video) await video.saveAs(path.join(output,"boss-warning-and-water.webm"));
    console.log(JSON.stringify({normal,finale,egg,screenshots:9,video:!!video}));
  } finally {
    await context?.close();
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
