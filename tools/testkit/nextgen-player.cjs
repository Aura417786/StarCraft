#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const {createPage}=require('./balance.cjs');
async function main(){
  const game=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--use-angle=d3d11']});
  const report={method:'Protected visual fixture with real Space/V keyboard presses, production renderer, 3 fighters × 3 quality tiers; not natural victories.',cases:[]};
  try{
    const {page,errors}=await createPage(browser,game,false,{pageOptions:{viewport:{width:1440,height:900}}});
    for(const fighter of (process.argv.includes('--motion-only')?[]:['red','blue','yellow']))for(const quality of ['low','medium','high']){
      await page.evaluate(({fighter,quality})=>{
        selectedFighter=fighter;showScreen('battle',{seed:4225,difficulty:'veteran'});setVisualQuality(quality,false);
        enemyCooldown=powerupCooldown=nextBossTime=Infinity;shotCooldown=Infinity;
        formationState.nextTime=battlefieldEvents.nextObject=battlefieldEvents.nextTransport=aceEncounter.nextTime=Infinity;
        ultimate.charges=5;shield.charges=2;bossHitGrace=1000;canvas.focus();
        const stream=canvas.captureStream(30);const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9'}),chunks=[];
        recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
        window.__playerFinish=()=>new Promise(resolve=>{recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const r=new FileReader();r.onloadend=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};recorder.stop();});recorder.start(250);
      },{fighter,quality});
      await page.keyboard.press('Space');await page.waitForTimeout(400);
      await page.screenshot({path:path.join(out,`${fighter}-${quality}-charge.png`)});
      await page.waitForFunction(()=>ultimate.phase==='firing');
      await page.waitForTimeout(140);
      const invariant=await page.evaluate(()=>{
        const state=()=>JSON.stringify({player,ultimate:ultimate,shield,weapon,battleTime,bullets:bullets.length});
        const before=state();PlayerVfx.draw(context);return before===state();
      });assert.ok(invariant,'VFX must not mutate gameplay');
      await page.screenshot({path:path.join(out,`${fighter}-${quality}-release.png`)});
      await page.waitForFunction(()=>ultimate.phase==='idle');
      await page.keyboard.press('KeyV');await page.waitForTimeout(250);
      await page.screenshot({path:path.join(out,`${fighter}-${quality}-shield.png`)});
      await page.waitForTimeout(1000);
      const video=await page.evaluate(()=>__playerFinish());fs.writeFileSync(path.join(out,`${fighter}-${quality}.webm`),Buffer.from(video,'base64'));
      const result=await page.evaluate(()=>({fighter:currentUltimateId(),charges:ultimate.charges,shield:shield.charges,phase:ultimate.phase}));
      assert.equal(result.fighter,fighter);assert.equal(result.charges,4);assert.equal(result.phase,'idle');assert.equal(result.shield,1);
      report.cases.push({fighter,quality,invariant,...result});console.log(`${fighter} ${quality} passed`);
    }
    report.motionPreference=await page.evaluate(()=>{
      showScreen('battle',{fighter:'red',seed:4225});
      ultimate.kind='red';ultimate.phase='firing';
      ultimate.shot={startX:100,x:700,y:350,length:400,radius:45,contacts:[],linked:false};
      const c=document.createElement('canvas');c.width=900;c.height=600;const paint=c.getContext('2d',{willReadFrequently:true});
      const snap=t=>{paint.clearRect(0,0,900,600);ultimate.elapsed=t;PlayerVfx.draw(paint);return paint.getImageData(0,0,900,600).data;};
      const same=(a,b)=>a.every((v,i)=>v===b[i]);
      reduceCombatMotion=true;const quiet=same(snap(1),snap(1.1));
      reduceCombatMotion=false;const animated=!same(snap(1),snap(1.1));
      cancelUltimate();return{quiet,animated};
    });
    assert.deepEqual(report.motionPreference,{quiet:true,animated:true});
    report.errors=errors;fs.writeFileSync(path.join(out,'player.json'),JSON.stringify(report,null,2));assert.deepEqual(errors,[]);
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
