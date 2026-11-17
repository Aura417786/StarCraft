#!/usr/bin/env node
"use strict";
// Isolated geometry checks + production-renderer frames. These are staged visual
// fixtures, not evidence of a natural boss win or complete gameplay balance.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");
async function main() {
  const root = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH,
    args: ["--use-angle=d3d11", "--disable-renderer-backgrounding"] });
  const report = { method: "Isolated alpha masks plus staged production-renderer frames; no balance or natural-play claim", geometry: [], frames: [] };
  try {
    const frozen = { newPage: async options => {
      const page = await browser.newPage(options);
      await page.addInitScript(() => {
        const raf = requestAnimationFrame;
        window.requestAnimationFrame = fn => fn.name === "drawFrame" ? (window.__vfxReviewDraw = fn, 0) : raf(fn);
      }); return page;
    } };
    const { page, errors } = await createPage(frozen, root, false);
    if (!await page.evaluate(() => typeof NextgenVfx !== "undefined")) await page.addScriptTag({ path: path.join(root, "nextgen-elemental-vfx.js") });
    const geometry = await page.evaluate(() => {
      const output = [];
      for (const quality of ["low", "medium", "high"]) for (const quiet of [false, true]) {
        setVisualQuality(quality, false); reduceCombatMotion = quiet;
        const checks = [
          { name: "water", draw: c => NextgenVfx.drawWaterSection(c, () => 180, 30, 280, -1, 1.3, 40, signatureMaterials.water, false, quiet), inside: (x,y) => x >= 139 && x <= 221 && y >= 29 && y <= 281 },
          { name: "magma", draw: c => NextgenVfx.drawMagmaFissure(c, {x1:30,y1:160,x2:320,y2:160,width:90}, signatureMaterials.magma, 1.3,.9), inside: (x,y) => x >=29 && x <=321 && y>=114 && y<=206 },
          { name: "void-annulus", draw: c => NextgenVfx.drawVoid(c, {x:180,y:160,radius:110,innerRadius:64},signatureMaterials.void,1.3,.9), inside:(x,y) => Math.hypot(x-180,y-160)>=62.5 && Math.hypot(x-180,y-160)<=111.5 },
          { name: "eruption", draw: c => NextgenVfx.drawEruption(c,{x:180,y:160,radius:90},signatureMaterials.magma,1.3,.9), inside:(x,y) => Math.hypot(x-180,y-160)<=91.5 },
        ];
        for (const test of checks) {
          const c = document.createElement("canvas"); c.width=360;c.height=320; const ctx=c.getContext("2d",{willReadFrequently:true});
          NextgenVfx.beginFrame(); test.draw(ctx);
          const pixels=ctx.getImageData(0,0,360,320).data; let lit=0,outside=0;
          for(let y=0;y<320;y++) for(let x=0;x<360;x++) if(pixels[(y*360+x)*4+3]>12) {lit++;if(!test.inside(x+.5,y+.5))outside++;}
          const diagnostics=NextgenVfx.diagnostics();
          output.push({quality,quiet,name:test.name,lit,outside,diagnostics});
        }
      }
      const phases=[0,.25,.65,.90,1.01,1.15,1.71,1.90].map(age=>NextgenVfx.phase({age,warning:1,duration:1}).name);
      return {output,phases};
    });
    report.geometry=geometry.output; report.phases=geometry.phases;
    assert.deepEqual(geometry.phases,["tell","gather","charge","release","contact","sustain","fracture","residue"]);
    for(const row of geometry.output) {assert.ok(row.lit>100,row.name+" must render");assert.equal(row.outside,0,row.name+" must preserve authoritative primitive and holes");assert.ok(row.diagnostics.facets<=row.diagnostics.budget.facets);if(row.quiet)assert.equal(row.diagnostics.samples,0);}
    await page.locator("#start-button").click();
    for(const quality of ["high","low"]) for(const type of [0,2,8]) {
      await page.evaluate(({quality,type})=>{
        selectedFighter="red";showScreen("battle",{seed:4225,difficulty:"veteran"}); canvas.focus(); setVisualQuality(quality,false);reduceCombatMotion=false;
        nextBossTime=enemyCooldown=powerupCooldown=shotCooldown=Infinity;formationState.nextTime=battlefieldEvents.nextObject=battlefieldEvents.nextTransport=aceEncounter.nextTime=Infinity;
        enemies.length=bullets.length=0;spawnBoss(type);resetBossPresentation();Object.assign(boss,bossArena(type),{phase:"recover",phaseTime:1,age:100});boss.previousX=boss.x;boss.previousY=boss.y;
        bossHitGrace=1000;boss.pressureAttackCount=6;prepareAlienAttack(boss,true);
      },{quality,type});
      await page.waitForFunction(type=>starBreakerModelCache.get(type)?.model,type);
      for(const moment of ["charge","release","residue"]) {
        const row=await page.evaluate(({quality,type,moment})=>{
          const scene=boss.pressureState;if(!scene)throw new Error("No pressure state");
          const duration=scene.activeDuration || bossHazards.find(h=>h.kind==="ultimate")?.duration || 1.6;
          const age=moment==="charge"?scene.warning*.77:scene.warning+duration*(moment==="release"?.35:.90);
          scene.age=age;scene.stage=moment==="charge"?"charge":"attack";
          for(const h of bossHazards)h.age=age;
          updateBossPressureArt(1/120);pressureArt.burstAge=moment==="charge"?10:duration*(moment==="release"?.35:.90);
          previousTime=performance.now();__vfxReviewDraw(previousTime);
          const samples=[];for(let i=0;i<12;i++){const a=performance.now();__vfxReviewDraw(previousTime);samples.push(performance.now()-a);}
          return {quality,type,moment,diagnostics:NextgenVfx.diagnostics(),renderMs:samples,geometry:bossHazards.filter(h=>h.kind==="ultimate").map(bossUltimateGeometry)};
        },{quality,type,moment});
        await page.waitForTimeout(120);
        await page.evaluate(()=>{previousTime=performance.now();__vfxReviewDraw(previousTime);});
        const file=`boss-${type+1}-${quality}-${moment}.png`;await page.screenshot({path:path.join(out,file)});
        report.frames.push({...row,file});
      }
    }
    // All eleven families and all three routine weapons are exercised through
    // their production drawing entry points in one explicitly isolated gallery.
    report.gallery = await page.evaluate(() => {
      setVisualQuality("high",false);reduceCombatMotion=false;NextgenVfx.beginFrame();
      const gallery=document.createElement("canvas");gallery.width=1280;gallery.height=720;const ctx=gallery.getContext("2d");
      ctx.fillStyle="#090e18";ctx.fillRect(0,0,1280,720);ctx.font="16px sans-serif";
      const names=Object.keys(signatureMaterials);
      for(let i=0;i<names.length;i++){
        const x=(i%4)*320+20,y=Math.floor(i/4)*190+42;
        ctx.fillStyle="#d9e3ed";ctx.fillText(names[i],x,y);
        drawMaterialRay(ctx,{x1:x,y1:y+70,x2:x+275,y2:y+45,left:19,right:30,kind:names[i],active:true,phase:.4,age:1.8},false);
      }
      const diagnostic=NextgenVfx.diagnostics();
      const weapons=[];
      for(const [i,fighter]of["red","blue","yellow"].entries()){
        selectedFighter=fighter;
        drawFlightEngineWake(ctx,{x:220+i*400,y:660,width:125,height:70},fighter,1.3,true);
        ctx.save();ctx.translate(290+i*400,660);drawFlightBoltWake(ctx,42,5,flightWakeColors[fighter],i,1.3,false,{auxiliary:false});ctx.restore();
        weapons.push(fighter);
      }
      return {data:gallery.toDataURL("image/png").split(",")[1],names,weapons,diagnostic};
    });
    fs.writeFileSync(path.join(out,"material-and-flight-gallery.png"),Buffer.from(report.gallery.data,"base64"));delete report.gallery.data;
    assert.equal(report.gallery.names.length,11);assert.ok(report.gallery.diagnostic.facets<=report.gallery.diagnostic.budget.facets);
    const shake=await page.evaluate(()=>{
      reduceCombatMotion=false;shakePreference="full";combatEffects.shake=combatEffects.shakeTime=0;
      addCombatShake(5);combatEffects.clock+=.03;addCombatShake(5);
      let max=0;for(let i=0;i<31;i++){combatEffects.clock+=.01;combatEffects.shakeTime=Math.max(0,combatEffects.shakeTime-.01);const o=combatShakeOffset();max=Math.max(max,Math.abs(o.x),Math.abs(o.y));}
      const rest=combatShakeOffset();reduceCombatMotion=true;addCombatShake(5);return{max,rest,quiet:combatShakeOffset()};
    });
    assert.ok(shake.max<=6);assert.deepEqual(shake.rest,{x:0,y:0});assert.deepEqual(shake.quiet,{x:0,y:0});report.shake=shake;
    // Quiet mode is a distinct real production frame, not a CSS-only claim.
    await page.evaluate(()=>{setVisualQuality("high",false);reduceCombatMotion=true;previousTime=performance.now();__vfxReviewDraw(previousTime);});
    await page.screenshot({path:path.join(out,"void-reduced-motion.png")});
    report.errors=errors.filter(e=>!e.includes("404 ")||!e.includes("/assets/vfx/nextgen/"));
    report.missingAtlases=errors.filter(e=>e.includes("404 ")&&e.includes("/assets/vfx/nextgen/"));
    fs.writeFileSync(path.join(out,"report.json"),JSON.stringify(report,null,2));
    assert.deepEqual(report.errors,[]);
    console.log(JSON.stringify({geometryChecks:report.geometry.length,frames:report.frames.length,errors:report.errors,missingAtlases:report.missingAtlases},null,2));
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
