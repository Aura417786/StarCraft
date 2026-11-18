"use strict";
// Production RAF, renderer, inputs, and audio mix. The fixture accelerates only
// encounter setup: it selects each boss, skips entry, and protects the hull.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

(async()=>{
  const root=path.resolve(process.argv[2]||"."),out=path.resolve(process.argv[3]||"../GPT62-Evidence/Boss");
  const ultimate=process.argv.includes("--ultimate"), prefix=ultimate?"ultimate":"cast";
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,
    args:["--disable-renderer-backgrounding","--disable-background-timer-throttling","--use-angle=d3d11"]});
  const report={method:"Production RAF and renderer; protected pilot, staged enraged encounters. Natural combat balance is tested independently.",captures:[]};
  try{
    const {page,errors}=await createPage(browser,root,false,{pageOptions:{viewport:{width:1280,height:720}}});
    await page.addInitScript(()=>{
      const connect=AudioNode.prototype.connect;
      AudioNode.prototype.connect=function(destination,...args){
        if(destination===this.context.destination){
          this.context.__bossRecorderSink??=this.context.createMediaStreamDestination();
          window.__bossDemoAudio=this.context.__bossRecorderSink.stream;
          connect.call(this,this.context.__bossRecorderSink,...args);
        }
        return connect.call(this,destination,...args);
      };
    });
    await page.reload({waitUntil:"load"});
    const guide=page.locator(".flight-guide-actions button").first();
    if(await guide.isVisible())await guide.click();
    await page.locator("#start-button").click();
    await page.evaluate(async()=>{await gameAudio.unlock();gameAudio.setMuted(false);});
    await page.waitForFunction(()=>window.__bossDemoAudio?.getAudioTracks().length===1);
    const ids=(process.argv.find(v=>v.startsWith("--types="))?.slice(8)||"1,2,3,4,5,6,7,8,9,10,11").split(",").map(Number);
    for(const id of ids){
      const type=id-1;
      await page.evaluate(type=>{
        showScreen("battle",{seed:4225,difficulty:"veteran"});
        setVisualQuality("high",false);
        enemyCooldown=powerupCooldown=nextBossTime=Infinity;
        formationState.nextTime=battlefieldEvents.nextObject=battlefieldEvents.nextTransport=aceEncounter.nextTime=Infinity;
        preloadStarBreakerModel(type,true);
        gameAudio.preloadBossScore(type);
      },type);
      // WebGL bodies stream asynchronously. Start the cast only after its real
      // model is ready, so a fallback silhouette cannot enter the first shot.
      await page.waitForFunction(type=>!!starBreakerModelCache.get(type)?.model,type,{timeout:60000});
      const row=await page.evaluate(({type,ultimate})=>{
        window.__bossClipKind=ultimate?"ultimate":"resonance";
        spawnBoss(type);resetBossPresentation();Object.assign(boss,bossArena(type));boss.phase="recover";boss.phaseTime=0;
        boss.enraged=true;boss.hp=boss.displayHp=.44;boss.pressureAttackCount=ultimate?6:0;shield.charges=ultimate?1:0;shield.remaining=0;shotCooldown=Infinity;bossHitGrace=1000;
        player.x=player.previousX=flightBounds.left+mechanicRoom().width*.36;
        player.y=player.previousY=alienLane(.52);
        window.__bossFrameIntervals=[];window.__bossInput=[];
        const frame=document.createElement("canvas");frame.width=1152;frame.height=648;
        const g=frame.getContext("2d",{alpha:false});
        const stream=frame.captureStream(24);
        const audio=window.__bossDemoAudio?.getAudioTracks()[0];
        if(audio)stream.addTrack(audio.clone());
        const chunks=[],recorder=new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp8,opus",videoBitsPerSecond:3200000});
        let painting=true,prev;
        const stamp=now=>{
          if(!painting)return;
          if(prev)window.__bossFrameIntervals.push(now-prev);prev=now;
          g.drawImage(canvas,0,0,frame.width,frame.height);
          const h=bossHazards.find(h=>h.kind===window.__bossClipKind);
          const phase=h&&h.age>=h.warning?"RELEASE":h&&h.age>=h.tellAt?"TELEGRAPH":"OPENING";
          const gradient=g.createLinearGradient(0,548,0,648);
          gradient.addColorStop(0,"#050a1300");gradient.addColorStop(.50,"#050a13aa");gradient.addColorStop(1,"#050a13ed");
          g.fillStyle=gradient;g.fillRect(0,548,1152,100);
          g.font='600 15px system-ui';g.fillStyle=signatureMaterials[alienPressurePlans[type].material].rim;
          g.fillText(String(type+1).padStart(2,"0")+" / 11    "+phase,40,591);
          g.font='500 25px "Microsoft YaHei", sans-serif';g.fillStyle="#f1f6fa";
          const labels=ultimate?bossUltimateNames[type]:BossResonance.names[type];
          g.fillText(bossTypeName(type)+"    "+labels[0]+"  /  "+labels[1],40,625);
          requestAnimationFrame(stamp);
        };
        recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
        window.__endBossClip=()=>new Promise(resolve=>{
          recorder.onstop=()=>{painting=false;stream.getTracks().forEach(track=>track.stop());
            const reader=new FileReader();reader.onloadend=()=>resolve(reader.result.split(",")[1]);
            reader.readAsDataURL(new Blob(chunks,{type:"video/webm"}));};
          recorder.stop();
        });
        window.__bossClipStarted=performance.now();recorder.start(200);requestAnimationFrame(stamp);prepareAlienAttack(boss,false);
        const h=bossHazards.find(h=>h.kind===window.__bossClipKind);
        if(!h)throw Error("Staged attack missing");
        return {type:type+1,name:bossTypeName(type),skill:(ultimate?bossUltimateNames[type]:BossResonance.names[type])[0],audio:!!audio,modelReady:!!starBreakerModelCache.get(type)?.model,warning:h.warning,lead:h.warning-(h.tellAt??0)};
      },{type,ultimate});
      const waitForAge=limit=>page.waitForFunction(limit=>{
        const h=bossHazards.find(h=>h.kind===window.__bossClipKind);return h && h.age>=h.warning+limit*h.duration;
      },limit,{timeout:45000});
      row.timestamps={};
      const imageFrame=async label=>{
        row.timestamps[label]=await page.evaluate(()=>(performance.now()-window.__bossClipStarted)/1000);
        await page.screenshot({path:path.join(out,prefix+"-"+String(type+1).padStart(2,"0")+"-"+label+".jpg"),type:"jpeg",quality:90});
      };
      // Move the real ship before lock release. Neither the field nor the camera follows this escape.
      if(!ultimate){
        await page.waitForFunction(()=>bossHazards.some(h=>h.comboStage===0 && h.age>h.warning+h.duration*.34));
        await imageFrame("opener");
      }
      await waitForAge(ultimate?-.48:-.79);
      await imageFrame("windup");
      await page.keyboard.down(type%2?"ArrowDown":"ArrowUp");
      await page.waitForTimeout(580);
      await page.keyboard.up(type%2?"ArrowDown":"ArrowUp");
      await waitForAge(.14);await imageFrame("break");
      await waitForAge(.40);row.timestamps.middle=await page.evaluate(()=>(performance.now()-window.__bossClipStarted)/1000);
      await page.screenshot({path:path.join(out,(ultimate?"seal-":"boss-")+String(type+1).padStart(2,"0")+".jpg"),type:"jpeg",quality:86});
      await waitForAge(.78);await imageFrame("sustain");
      if(ultimate){
        await page.waitForFunction(()=>boss.pressureState && boss.pressureState.age>boss.pressureState.pulseAt-.36);
        await page.keyboard.press("KeyV");
        await page.waitForTimeout(450);
      }
      const buffer=await page.evaluate(()=>__endBossClip());
      fs.writeFileSync(path.join(out,prefix+"-"+String(type+1).padStart(2,"0")+".webm"),Buffer.from(buffer,"base64"));
      const metrics=await page.evaluate(()=>{
        const a=window.__bossFrameIntervals.filter(x=>x>0).sort((a,b)=>a-b),q=p=>a[Math.min(a.length-1,Math.floor(a.length*p))];
        return {frames:a.length,frameMs:{p50:q(.5),p95:q(.95),p99:q(.99)},controls:"direction key press for 580 ms",active:state==="battle"};
      });
      report.captures.push({...row,...metrics});
      fs.writeFileSync(path.join(out,"browser-"+prefix+"-demo.json"),JSON.stringify({...report,errors},null,2));
      console.log("Captured "+(type+1));
    }
    if(errors.length)throw Error(errors.join("\n"));
  } finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
