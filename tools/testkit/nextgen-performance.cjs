"use strict";
// Actual RAF/render measurement of sustained v35 boss workloads. Protected,
// staged encounters, not player victories. No video encoder during samples.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createPage}=require('./balance.cjs');
const stats=a=>{a=a.slice().sort((x,y)=>x-y);return {count:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1),over33:a.filter(x=>x>33.4).length};};
(async()=>{
 const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--use-angle=d3d11','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
 const report={method:'Production RAF, 10 seconds per case after warmup; protected staged bosses; no main gun, no recording. CPU includes game submission, not GPU completion. Forced GC only between cases. No universal 60fps claim.',cpu:os.cpus()[0].model,browser:browser.version(),cases:[],errors:[]};
 try{
  const {page,errors}=await createPage(browser,root,false,{pageOptions:{viewport:{width:1440,height:900}}});
  await page.locator('#start-button').click();
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
  await page.evaluate(()=>{
   window.__perf=null;const frame=drawFrame;
   drawFrame=function measuredFrame(t){const start=performance.now();try{return frame(t)}finally{if(__perf)__perf.cpu.push(performance.now()-start)}};
   let last;function sample(t){if(__perf){if(last!=null)__perf.raf.push(t-last);__perf.hazards=Math.max(__perf.hazards,bossHazards.length);__perf.orbs=Math.max(__perf.orbs,bossProjectiles.length);}last=t;requestAnimationFrame(sample)}requestAnimationFrame(sample);
  });
  for(const quality of ['low','medium','high'])for(const type of [0,2,8,10].filter(t=>!process.argv[4]||t+1===Number(process.argv[4]))){
   await page.evaluate(({quality,type})=>{
    showScreen('battle',{seed:77135,difficulty:'veteran'});setVisualQuality(quality,false);
    enemyCooldown=powerupCooldown=nextBossTime=Infinity;formationState.nextTime=battlefieldEvents.nextObject=battlefieldEvents.nextTransport=aceEncounter.nextTime=Infinity;
    spawnBoss(type);shotCooldown=Infinity;bossHitGrace=1000;shield.charges=0;
   },{quality,type});
   await page.waitForFunction(()=>boss&&!isBossPresentationPlaying());await page.waitForTimeout(1200);
   await cdp.send('HeapProfiler.collectGarbage');
   await page.evaluate(()=>{resetBossPresentation();boss.phase='recover';boss.phaseTime=.8;boss.pressureAttackCount=6;prepareAlienAttack(boss,true);window.__perf={cpu:[],raf:[],hazards:0,orbs:0,start:battleTime};});
   await page.waitForTimeout(10000);
   const sample=await page.evaluate(()=>{const p=__perf;__perf=null;return {...p,elapsed:battleTime-p.start,modelReady:!!starBreakerModelStage?.renderer,quality:visualQuality.id,fx:NextgenVfx.diagnostics(),state,lives:player.lives,pause:pauseView,active:isBattleActive(),cinematic:isBossPresentationPlaying(),audio:gameAudio.diagnostics}});
   await cdp.send('HeapProfiler.collectGarbage');const metrics=await cdp.send('Performance.getMetrics');
   const row={quality,boss:type+1,elapsed:sample.elapsed,rafMs:stats(sample.raf),frameSubmitMs:stats(sample.cpu),maxHazards:sample.hazards,maxBossOrbs:sample.orbs,fx:sample.fx,state:sample.state,lives:sample.lives,pause:sample.pause,active:sample.active,cinematic:sample.cinematic,audio:sample.audio,heap:metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value};
   report.errors=errors;report.cases.push(row);fs.writeFileSync(path.join(out,'performance.json'),JSON.stringify(report,null,2));console.log(quality,type+1,'p95',row.rafMs.p95,'CPU',row.frameSubmitMs.p95);
   assert.deepEqual(errors,[]);assert.ok(sample.elapsed>7,JSON.stringify(row));assert.equal(sample.orbs,0,'generic Boss orbs returned');assert.ok(sample.cpu.length>30);
  }
  report.errors=errors;fs.writeFileSync(path.join(out,'performance.json'),JSON.stringify(report,null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
