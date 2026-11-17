const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash}=require('node:crypto');
const { chromium } = require('playwright');
const { createPage } = require('./balance.cjs');
(async () => {
  const game=path.resolve(process.argv[2]), output=path.resolve(process.argv[3]);
  fs.mkdirSync(output,{recursive:true});
  const files=['boss-pressure.js','boss-finales.js','boss-mechanics.js','bosses.js','alien-attacks.js','alien-pressure.js','shield.js'];
  const digest=()=>{const h=createHash('sha256');for(const f of files)h.update(f).update(fs.readFileSync(path.join(game,f)));return h.digest('hex');};
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
  const report={schema:'star-breaker-nextgen-combat/1',sourceSha256:digest(),methodology:'Deterministic browser production scheduler and collision contracts. The 36s no-fire rehearsals stage 14 hull points and 2 shield charges, run production movement/forces/damage, and compare stationary V with a visible-tell heuristic that uses no hidden future tells. Grid samples establish available space, not an exhaustive reachable-path proof. This is not rendered gameplay or human-play evidence.',rehearsals:[]};
  const save=()=>fs.writeFileSync(path.join(output,'nextgen-combat.json'),JSON.stringify(report,null,2));
  try {
    const {page,errors}=await createPage(browser,game,true);
    await page.addScriptTag({path:path.join(__dirname,'nextgen-combat-scenarios.js')});
    report.seals=await page.evaluate(()=>nextgenSealContracts());
    for(const e of report.seals.results){
      assert.equal(e.charges,e.condition==='stored'?1:0,'Seal must not create or consume shield stock');
      assert.equal(e.full,['stored','long-active'].includes(e.condition),'Full coverage requires actual usable capacity at the tell');
      assert.ok(e.stable,'Capacity changes after the tell must not rewrite the safe route');
      assert.ok(e.finite.every(Boolean),'Ultimate collision geometry must be finite');
      assert.ok(e.threat>0,`Boss ${e.boss}: ultimate must have actual collision`);
      assert.ok(e.quietSeconds>=1.2,'Previous contact grace must expire before the seal');
      if(!e.full)assert.ok(e.gapSafety.every(Boolean),'No-shield path must remain safe throughout the ultimate');
    }
    assert.equal(report.seals.lateGrace.afterGraze-report.seals.lateGrace.afterSeal,1,'The seal must hit after a real late graze');
    assert.deepEqual(report.seals.environmentGuard,{charges:0,damage:0,perfect:false},'Environmental guard costs a shield without refund');
    assert.deepEqual(report.seals.ordinaryGuard,{charges:1,perfect:true},'Ordinary enemy perfect guard must refund');
    assert.equal(report.seals.fusionApparatus.health,0,'Ordinary rounds must sever the fusion ultimate apparatus');
    assert.ok(report.seals.fusionApparatus.afterShapes<report.seals.fusionApparatus.beforeShapes,'Severed fusion limbs remove real collision');
    report.combos=await page.evaluate(()=>nextgenComboContracts());
    assert.deepEqual(report.combos.oncePerFinaleContact,{lost:1,consumed:true},'One prolonged finale contact must not deal damage twice');
    for(const e of report.combos.results){
      assert.deepEqual(e.stages,[0,1,2],`Boss ${e.boss} must execute three real stages`);
      assert.ok(e.record.activeDuration>=3.5);
      assert.ok(e.fixedLocks,'Already telegraphed targets must not track the player');
      assert.ok(e.minSafeGridPoints>0,'No body combo may cover the entire sampled arena');
      assert.ok(e.snapshots.every(h=>h.warning-h.tell>=1.29),'Every stage needs a visible warning');
      assert.equal(e.projectiles,0,'Authored pressure must not generate generic shots');
    }
    for(const e of report.combos.finales){
      assert.deepEqual(e.stages,[0,1,2],`Finale ${e.boss} needs its full sequence`);
      assert.equal(e.projectiles,0);
      assert.ok(e.interval>=Math.max(...e.hazards.map(h=>h.warning+h.duration))+.79,'Finale recovery must follow the entire sequence');
    }
    const identities=Array.from({length:11},(_,type)=>report.combos.results.filter(e=>e.boss===type+1&&!e.enraged).map(e=>e.snapshots.map(h=>[h.stage,h.kind,h.nodes])));
    assert.equal(new Set(identities.map(x=>JSON.stringify(x))).size,11,'Bosses must differ in geometry and apparatus, not colour');
    report.layouts=[];
    for(const size of [{width:960,height:540},{width:1920,height:1080}]){
      await page.setViewportSize(size);
      const probe=await page.evaluate(()=>nextgenComboContracts());
      assert.ok(probe.results.every(e=>e.minSafeGridPoints>0&&e.fixedLocks),'Each tested viewport must retain safe space and locked tells');
      report.layouts.push({size,bodyChains:probe.results.length,minSafeGridPoints:Math.min(...probe.results.map(e=>e.minSafeGridPoints))});
    }
    await page.setViewportSize({width:1280,height:720});
    save();console.log('55 seal cases, 132 body chains across 3 viewports and 33 finale sequences passed');
    if(!process.argv.includes('--contracts')){
      for(let type=0;type<11;type++)for(const finale of [false,true])for(const avoid of [false,true]){
        const e=await page.evaluate(({type,finale,avoid})=>nextgenRehearsal(type,finale,avoid),{type,finale,avoid});
        report.rehearsals.push(e);save();console.log(JSON.stringify(e));
      }
      const losses=policy=>report.rehearsals.filter(e=>e.policy===policy).reduce((sum,e)=>sum+e.livesLost,0);
      report.policyTotals={stationaryV:losses('stationary-V'),movingV:losses('visible-tell-moving-V')};
      assert.ok(report.policyTotals.movingV<report.policyTotals.stationaryV,'Visible-tell maneuvering should outperform stationary guarding');
      assert.ok(report.rehearsals.every(e=>e.maxProjectiles===0),'Every rehearsed phase must remain free of generic Boss shots');
    }
    assert.deepEqual(errors,[]);assert.equal(digest(),report.sourceSha256,'Source changed during verification');
    report.errors=errors;report.status='passed';
  } catch(e){report.status='failed';report.error=e.stack;throw e;}
  finally {save();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
