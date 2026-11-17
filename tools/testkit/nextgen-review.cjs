#!/usr/bin/env node
"use strict";
// Production rendering and real RAF. Staged, protected effect review, NOT a
// natural victory or balance proof. Combat tests live in separate fixtures.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createPage } = require('./balance.cjs');
async function main() {
  const [gameArg, outArg, mode = 'baseline'] = process.argv.slice(2);
  if (!gameArg || !outArg) throw new Error('nextgen-review <Game> <Out> [baseline|full]');
  const game = path.resolve(gameArg), out = path.resolve(outArg);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless:true,
    args:['--use-angle=d3d11','--disable-renderer-backgrounding','--disable-background-timer-throttling'] });
  const report = { method:'Staged production-render review: real RAF, protected player, no main weapon, no balance claim.', captures:[], errors:[] };
  try {
    const { page, errors } = await createPage(browser,game,false,{pageOptions:{viewport:{width:1440,height:900}}});
    await page.screenshot({path:path.join(out,'hangar.png')});
    // Tee the real master output into the recording; leave speaker playback
    // and the game's gain graph unchanged. This hook is test-only.
    await page.evaluate(()=>{
      const connect=AudioNode.prototype.connect;
      AudioNode.prototype.connect=function(destination,...args){
        if(destination===this.context.destination){
          const sink=this.context.__reviewSink??=this.context.createMediaStreamDestination();
          window.__reviewAudio=sink.stream;connect.call(this,sink,...args);
        }
        return connect.call(this,destination,...args);
      };
    });
    await page.locator('#start-button').click();
    const types = mode === 'full' ? Array.from({length:11},(_,i)=>i) : [0,2,8];
    for (const type of types) {
      await page.evaluate(type=>{
        showScreen('battle',{seed:4225,difficulty:'veteran'}); setVisualQuality('high',false);
        enemyCooldown=powerupCooldown=nextBossTime=Infinity;
        formationState.nextTime=battlefieldEvents.nextObject=battlefieldEvents.nextTransport=aceEncounter.nextTime=Infinity;
        spawnBoss(type); shotCooldown=Infinity; bossHitGrace=1000;
      },type);
      await page.waitForFunction(()=>boss && !isBossPresentationPlaying());
      await page.waitForTimeout(1000);
      await page.evaluate(()=>{
        resetBossPresentation(); boss.phase='recover'; boss.phaseTime=.8; boss.pressureAttackCount=6;
        shield.charges=0;
        window.__ngFrames=[];window.__ngCollect=true;let last=performance.now();
        const sample=now=>{if(!window.__ngCollect)return;window.__ngFrames.push(now-last);last=now;requestAnimationFrame(sample);};requestAnimationFrame(sample);
        const stream=canvas.captureStream(30), chunks=[];
        for(const track of window.__reviewAudio?.getAudioTracks()||[])stream.addTrack(track.clone());
        const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus',videoBitsPerSecond:4000000});
        recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
        window.__ngFinish=()=>new Promise(resolve=>{recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const reader=new FileReader();reader.onloadend=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};recorder.stop();});
        recorder.start(250); prepareAlienAttack(boss,true);
      });
      for (const [phase, delay] of [['tell',650],['release',1450],['impact',1200]]) {
        await page.waitForTimeout(delay);
        await page.screenshot({path:path.join(out,`boss-${type+1}-${phase}.png`)});
      }
      await page.waitForTimeout(2200);
      if(mode==='full'){
        await page.evaluate(()=>{bossHazards.length=0;boss.pressureState=null;boss.pressureAttackCount=0;boss.phase='recover';boss.phaseTime=0;prepareAlienAttack(boss,false);});
        await page.waitForTimeout(4500);
        await page.screenshot({path:path.join(out,`boss-${type+1}-chain.png`)});
        await page.waitForTimeout(4000);
        await page.evaluate(()=>{beginBossFinale(boss);resetBossPresentation();bossHitGrace=1000;});
        await page.waitForTimeout(6500);
        await page.screenshot({path:path.join(out,`boss-${type+1}-finale.png`)});
        await page.waitForTimeout(3500);
      }
      const video=await page.evaluate(()=>__ngFinish());
      fs.writeFileSync(path.join(out,`boss-${type+1}.webm`),Buffer.from(video,'base64'));
      const data=await page.evaluate(()=>{
        window.__ngCollect=false;
        const a=__ngFrames.filter(n=>n>0).sort((a,b)=>a-b),q=p=>a[Math.min(a.length-1,Math.floor(p*a.length))];
        return {audioTracks:window.__reviewAudio?.getAudioTracks().length??0,boss:boss?.type,frameCount:a.length,frameMs:{p50:q(.5),p95:q(.95),p99:q(.99),max:a.at(-1)},
          heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null,
          renderer:typeof alienModelDiagnostics==='function'?alienModelDiagnostics():null,
          nextgen:typeof NextgenVfx!=='undefined' && NextgenVfx.diagnostics?NextgenVfx.diagnostics():null,
          hazards:bossHazards.map(h=>({kind:h.kind,material:h.material,warning:h.warning,age:h.age}))};
      });
      report.captures.push({type,...data});fs.writeFileSync(path.join(out,'review.json'),JSON.stringify(report,null,2));
      console.log('Recorded boss '+(type+1));
    }
    report.errors=errors;
    fs.writeFileSync(path.join(out,'review.json'),JSON.stringify(report,null,2));
    if(errors.length)throw new Error(errors.join('\n'));
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
