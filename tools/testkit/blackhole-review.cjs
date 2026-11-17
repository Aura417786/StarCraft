#!/usr/bin/env node
"use strict";
// Regression for the real riftFold dispatch, not only the isolated void helper.
// Staged render inspection; no claim of natural play or gameplay balance.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createPage}=require('./balance.cjs');
async function main(){
  const [rootArg,outArg,mode='current']=process.argv.slice(2);
  const root=path.resolve(rootArg),out=path.resolve(outArg);fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,
    args:['--use-angle=d3d11','--disable-renderer-backgrounding']});
  const report={method:'Staged production drawAlienHazard / drawFrame; protected player; no natural-play claim',mode,frames:[],performance:[]};
  try{
    const adapter={newPage:async options=>{
      const page=await browser.newPage(options);
      await page.addInitScript(()=>{
        const raf=requestAnimationFrame;
        window.requestAnimationFrame=fn=>fn.name==='drawFrame'?(window.__holeDraw=fn,0):raf(fn);
      });return page;
    }};
    const {page,errors}=await createPage(adapter,root,false,{pageOptions:{viewport:{width:1440,height:900}}});
    await page.locator('#start-button').click();
    await page.evaluate(()=>{
      selectedFighter='red';showScreen('battle',{seed:4225,difficulty:'veteran'});
      nextBossTime=enemyCooldown=powerupCooldown=shotCooldown=Infinity;
      formationState.nextTime=battlefieldEvents.nextObject=battlefieldEvents.nextTransport=aceEncounter.nextTime=Infinity;
      enemies.length=bullets.length=bossHazards.length=0;
      spawnBoss(8);resetBossPresentation();Object.assign(boss,bossArena(8),{phase:'recover',phaseTime:1e8,age:100});
      boss.previousX=boss.x;boss.previousY=boss.y;bossHitGrace=1e8;
      const room=mechanicRoom();player.x=room.left+room.width*.15;player.y=(room.top+room.bottom)/2;
      window.__hole={kind:'riftFold',x:room.left+room.width*.44,y:(room.top+room.bottom)/2,
        radius:Math.max(player.height,Math.min(room.width*.33,room.height*.36)),split:false,side:-1,
        thickness:Math.max(7,player.height*.20),color:alienSignatureColors.void,sound:'coil',warning:1.4,duration:2.5,age:.6,tellAt:0};
      bossHazards.push(__hole);
      window.__holeFrame=()=>{previousTime=performance.now();__holeDraw(previousTime);};
    });
    await page.waitForFunction(()=>starBreakerModelCache.get(8)?.model);
    if(mode!=='baseline')await page.waitForFunction(()=>BlackHoleSurface.diagnostics().ready);
    await page.evaluate(()=>__holeFrame());await page.waitForTimeout(1200);
    for(const quality of ['high','medium','low']){
      for(const [name,age,split]of[['tell',.6,false],['pull',1.7,false],['seams',3.15,true]]){
        const data=await page.evaluate(({quality,age,split})=>{
          setVisualQuality(quality,false);reduceCombatMotion=false;Object.assign(__hole,{age,split});__holeFrame();
          return{kind:__hole.kind,age,split,diagnostics:typeof BlackHoleSurface==='undefined'?null:BlackHoleSurface.diagnostics()};
        },{quality,age,split});
        await page.screenshot({path:path.join(out,`${quality}-${name}.png`)});
        report.frames.push({quality,name,...data});
      }
    }
    if(mode!=='baseline' && mode!=='frames'){
      report.masks=await page.evaluate(()=>{
        const rows=[];setVisualQuality('high',false);reduceCombatMotion=false;
        for(const innerRadius of[0,64,110]){
          const c=document.createElement('canvas');c.width=c.height=320;const ctx=c.getContext('2d',{willReadFrequently:true});
          NextgenVfx.beginFrame();NextgenVfx.drawVoid(ctx,{x:160,y:160,radius:120,innerRadius},signatureMaterials.void,2,1);
          const pix=ctx.getImageData(0,0,320,320).data;let inside=0,outside=0,core=[...pix.slice((160*320+160)*4,(160*320+160)*4+4)];
          for(let y=0;y<320;y++)for(let x=0;x<320;x++){
            const d=Math.hypot(x+.5-160,y+.5-160);if(pix[(y*320+x)*4+3]>12){inside++;if(d>121.5||d<innerRadius-1.5)outside++;}
          }rows.push({innerRadius,inside,outside,core});
        }
        return rows;
      });
      for(const row of report.masks){assert.ok(row.inside>1000);assert.equal(row.outside,0);}
      assert.ok(report.masks[0].core[3]>=254);assert.ok(Math.max(...report.masks[0].core.slice(0,3))<12);
      assert.equal(report.masks[1].core[3],0);
      assert.equal(report.masks[2].core[3],0);
      assert.ok(report.masks[2].inside>Math.PI*(120**2-110**2)*.85,'thin damaging ring retains visible material');
      report.zeroAlpha=await page.evaluate(()=>{
        const c=document.createElement('canvas');c.width=c.height=50;
        const ctx=c.getContext('2d');NextgenVfx.beginFrame();
        NextgenVfx.drawVoid(ctx,{x:25,y:25,radius:20},signatureMaterials.void,1,0);
        return ctx.getImageData(25,25,1,1).data[3];
      });assert.equal(report.zeroAlpha,0,'invisible fade must not leave an opaque core');
      report.quiet=await page.evaluate(()=>{
        reduceCombatMotion=true;const hash=age=>{
          const c=document.createElement('canvas');c.width=c.height=400;const ctx=c.getContext('2d');
          const h={...__hole,x:200,y:200,radius:160,age};NextgenVfx.beginFrame();drawAlienHazard(ctx,h,false);return c.toDataURL();
        };return hash(1.6)===hash(2.3);
      });assert.equal(report.quiet,true,'reduced-motion pull phase must stay still');
      await page.evaluate(()=>{__hole.age=1.7;__hole.split=false;__holeFrame();});
      await page.screenshot({path:path.join(out,'reduced-motion.png')});
      for(const quality of['low','medium','high']){
        const data=await page.evaluate(async quality=>{
          setVisualQuality(quality,false);reduceCombatMotion=false;const cpu=[],raf=[];let last=0,start=performance.now();
          return await new Promise(resolve=>{
            function frame(now){
              if(last)raf.push(now-last);last=now;__hole.age=1.4+(now-start)/1000%1.5;
              const before=performance.now();__holeFrame();cpu.push(performance.now()-before);
              if(now-start<4500)requestAnimationFrame(frame);else{
                const metrics=a=>{a.sort((x,y)=>x-y);return{p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)}};
                resolve({quality,frames:cpu.length,cpuMs:metrics(cpu),rafMs:metrics(raf),diagnostics:BlackHoleSurface.diagnostics(),heap:performance.memory?.usedJSHeapSize});
              }
            }requestAnimationFrame(frame);
          });
        },quality);report.performance.push(data);
      }
      // A real keyboard move still reaches gameplay on an unmodified update.
      const x=await page.evaluate(()=>player.x);await page.keyboard.down('d');
      await page.evaluate(()=>{previousTime=performance.now()-32;__holeDraw(performance.now());});await page.keyboard.up('d');
      report.keyboardMoved=await page.evaluate(x=>player.x>x,x);assert.equal(report.keyboardMoved,true);
      // No-GL fallback must retain the authored disk, not return to thin rings.
      await page.evaluate(()=>{
        const get=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='webgl2'?null:get.call(this,kind,...args)};
      });
      // The separate fresh page makes fallback initialization real.
      const fallbackAdapter={newPage:async options=>{
        const p=await adapter.newPage(options);await p.addInitScript(()=>{
          const get=HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='webgl2'?null:get.call(this,kind,...args)};
        });return p;
      }};
      const fallback=await createPage(fallbackAdapter,root,false);
      await fallback.page.waitForFunction(()=>BlackHoleSurface.diagnostics().ready);
      await fallback.page.evaluate(()=>{
        const c=document.createElement('canvas');c.width=800;c.height=700;c.style='position:fixed;inset:0;z-index:99999';document.body.append(c);
        const ctx=c.getContext('2d');ctx.fillStyle='#050814';ctx.fillRect(0,0,800,700);
        NextgenVfx.beginFrame();NextgenVfx.drawVoid(ctx,{x:400,y:350,radius:300},signatureMaterials.void,1.7,.98);
      });await fallback.page.waitForTimeout(200);
      report.fallback=await fallback.page.evaluate(()=>BlackHoleSurface.diagnostics());assert.equal(report.fallback.mode,'canvas-texture');
      await fallback.page.screenshot({path:path.join(out,'webgl-disabled.png')});
      assert.deepEqual(fallback.errors,[]);await fallback.page.close();
      // Short production-canvas motion clip, with staged age but real draw code.
      const movie=await page.evaluate(async()=>{
        setVisualQuality('high',false);reduceCombatMotion=false;__hole.split=false;
        const stream=canvas.captureStream(30),chunks=[],rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});
        rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.start();
        let start=performance.now();await new Promise(resolve=>{
          function f(now){__hole.age=1.4+((now-start)/1000)%2.5;__holeFrame();if(now-start<7000)requestAnimationFrame(f);else resolve();}requestAnimationFrame(f);
        });
        return await new Promise(resolve=>{rec.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const r=new FileReader();r.onloadend=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};rec.stop();});
      });fs.writeFileSync(path.join(out,'black-hole-motion.webm'),Buffer.from(movie,'base64'));
    }
    report.errors=errors;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));assert.deepEqual(errors,[]);
    console.log(JSON.stringify({frames:report.frames.length,masks:report.masks,quiet:report.quiet,performance:report.performance,errors},null,2));
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
