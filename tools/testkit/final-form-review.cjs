"use strict";
// Sample the production renderer at advancing game times. Encodes actual frames;
// only encounter selection, pilot protection and the cut between phases are staged.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { chromium } = require("playwright");
const { open } = require("./boss-retry.cjs");

async function run() {
  const out = path.resolve(process.argv[3]);
  const ids = (process.argv[4] || "2,3,4,5,6,7,8,9,10,11").split(",").map(Number);
  const clips = process.argv.includes("--video");
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:["--use-angle=d3d11"]});
  const errors=[],report={samples:[],errors,method:"Staged production gameplay; held RAF, high quality, 1280x720. Captured at 24 frames per simulated second. Pilot protected. Silent."};
  try {
    const page=await open(browser,errors);
    await page.locator("#start-button").click();
    for (const id of ids) {
      const name=String(id).padStart(2,"0");
      await page.evaluate(async type => {
        showScreen("battle",{seed:4225,difficulty:"hard"}); setVisualQuality("high",false);
        enemyCooldown=powerupCooldown=nextBossTime=Infinity;
        formationState.nextTime=battlefieldEvents.nextObject=battlefieldEvents.nextTransport=aceEncounter.nextTime=Infinity;
        spawnBoss(type);resetBossPresentation();Object.assign(boss,bossArena(type));boss.phase="recover";boss.phaseTime=0;
        boss.enraged=true;boss.hp=boss.displayHp=.48;boss.pressureAttackCount=0;
        shotCooldown=Infinity;bossHitGrace=1000;shield.charges=1;
        player.x=player.previousX=flightBounds.left+mechanicRoom().width*.36;
        player.y=player.previousY=alienLane(.5);
        preloadStarBreakerModel(type,true);preloadBossFinaleArt(type);
        if(typeof BossLivingMaterials!=="undefined"){
          const tex=new Image();tex.src="assets/vfx/nextgen/living-organs.webp";await tex.decode();
        }
        retryTestFrame();prepareAlienAttack(boss,false);
      },id-1);
      await page.waitForFunction(id=>!!starBreakerModelCache.get(id-1)?.model,id,{timeout:45000});
      const row={id,frames:0,shots:[]};
      let enc,done;
      if(clips){
        enc=spawn(process.env.FFMPEG_PATH||"ffmpeg",["-hide_banner","-loglevel","error","-y","-f","image2pipe",
          "-framerate","24","-vcodec","mjpeg","-i","pipe:0","-an","-c:v","libx264","-preset","veryfast",
          "-crf","20","-pix_fmt","yuv420p","-movflags","+faststart",path.join(out,name+".mp4")],{windowsHide:true,stdio:["pipe","ignore","inherit"]});
        done=once(enc,"close"); done.catch(()=>{});
      }
      try {
        for(const phase of ["regular","finale"]) {
          const times=await page.evaluate(phase=>{
            if(phase==="finale"){
              beginBossFinale(boss);resetBossPresentation();boss.hp=boss.displayHp=.65;
              boss.finale.age=boss.finale.transform;boss.finale.next=boss.finale.age;
              updateBossFinale(boss,.001);
            }
            const list=phase==="regular"?bossHazards:boss.finale.hazards;
            const selected=phase==="regular"?list.find(h=>h.kind==="resonance"):list.find(h=>h.comboStage===0)||list[0];
            if(!selected)throw Error("No representative attack in "+phase);
            const begin=Math.max(0,selected.warning-.44-selected.age);
            const end=phase==="regular"?selected.warning+selected.duration+.13:
              Math.max(...list.map(h=>h.warning+h.duration))+.16;
            for(let t=0;t+1/30<=begin;t+=1/30)retryTestFrame(1/30);
            const followup=phase==="finale"?list.find(h=>h.comboStage===2):null;
            return {start:begin,duration:end-begin,impact:selected.warning+selected.duration*.43-begin,
              followup:followup?followup.warning+followup.duration*.44-begin:null,
              kind:selected.kind||selected.type,stage:phase==="finale"?boss.finale.mode:boss.phase};
          },phase);
          const step=clips?1/24:1/12;
          let captured=false,followupCaptured=false;
          for(let i=0; i < Math.ceil(times.duration/step); i++) {
            const frame=await page.evaluate(({step,clips})=>{
              retryTestFrame(step*.5);retryTestFrame(step*.5);
              return clips?canvas.toDataURL("image/jpeg",.88).split(",")[1]:null;
            },{step,clips});
            if(clips){
              if(!enc.stdin.write(Buffer.from(frame,"base64")))await once(enc.stdin,"drain");
              row.frames++;
            }
            if(!captured && i*step>=times.impact) {
              await page.screenshot({path:path.join(out,name+"-"+phase+".jpg"),type:"jpeg",quality:92});captured=true;
            }
            if(times.followup!==null && !followupCaptured && i*step>=times.followup) {
              await page.screenshot({path:path.join(out,name+"-followup.jpg"),type:"jpeg",quality:92});followupCaptured=true;
            }
          }
          assert.ok(captured && (times.followup===null || followupCaptured));row.shots.push({phase,...times});
        }
      }finally{if(enc){enc.stdin.end();const [code]=await done;assert.equal(code,0);}}
      report.samples.push(row);fs.writeFileSync(path.join(out,"capture.json"),JSON.stringify(report,null,2));
      console.log(id,row.shots.map(x=>x.kind).join("/"),row.frames);
      assert.deepEqual(errors,[]);
    }
  } finally {await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
