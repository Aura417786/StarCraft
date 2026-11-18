"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

// Frames come from the full unmodified game renderer + DOM HUD. The clock
// advances 1/24 s per frame; capture speed is independent of encoding speed.
async function main() {
  const game=path.resolve(process.argv[2]), out=path.resolve(process.argv[3]), ffmpeg=process.argv[4];
  fs.mkdirSync(out,{recursive:true});
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH,
    args:["--use-angle=d3d11","--disable-renderer-backgrounding"]});
  const report={method:"Staged stationary combat targets. Actual keyboard C/Space/V and autofire, 120 Hz production simulation. 24 fps full browser frames, silent video.",ships:[]};
  try {
    for(const id of ["red","blue","yellow"]){
      const adapter={newPage:async options=>{
        const page=await browser.newPage(options);
        await page.addInitScript(()=>{
          const native=requestAnimationFrame;
          window.requestAnimationFrame=callback=>callback.name==="drawFrame"?(window.renderTestFrame=callback,0):native(callback);
        });
        return page;
      }};
      const {page,errors}=await createPage(adapter,game,false,{pageOptions:{viewport:{width:1280,height:720}}});
      let encoder;
      try {
        await page.locator("#start-button").click();
        await page.evaluate(async id=>{
          selectedFighter=id;showScreen("battle",{fighter:id,seed:4225,difficulty:"veteran"});
          setVisualQuality("high",false);reduceCombatMotion=false;shakePreference="off";
          flightControls.autofire=id!=="red"; battleTime=18;
          firingStyle.mode=id==="yellow"?"spread":"focus";
          nextBossTime=enemyCooldown=powerupCooldown=1e6;
          formationState.nextTime=battlefieldEvents.nextTransport=battlefieldEvents.nextObject=aceEncounter.nextTime=1e6;
          enemies.length=bullets.length=0;
          shield.charges=2;ultimate.charges=3;bossHitGrace=0;movementHint.hidden=true;
          updateShieldDisplay();updateUltimateDisplay();
          const locs=id==="red"?[[.44,0],[.65,0],[.84,0]]:id==="blue"?[[.56,16],[.65,-67],[.71,77]]:[[.40,0],[.49,-49],[.52,58]];
          locs.forEach(([u,v],i)=>{
            spawnEnemy(i===1?"gunner":"armored");
            const e=enemies.at(-1);
            Object.assign(e,{x:viewport.width*u,previousX:viewport.width*u,y:player.y+v,previousY:player.y+v,
              baseY:player.y+v,speed:0,waveAmplitude:0,summoned:true,hp:1,maxHp:1,displayHp:1,healthLog:Math.log(1600),fireProtection:undefined});
          });
          const paint=document.createElement("canvas").getContext("2d");
          FighterMaterialFx.emitter(paint,id,{x:0,y:0},10,0,1);
          await Promise.all(["crimson","azure","auric"].map(key=>{const image=new Image();image.src="assets/vfx/fighters/"+key+".webp";return image.decode();}));
          canvas.focus();window.captureClock=performance.now();previousTime=captureClock;
        },id);
        await page.waitForTimeout(300);
        const output=path.join(out,id+"-skills.mp4");
        encoder=spawn(ffmpeg,["-hide_banner","-loglevel","error","-y","-f","image2pipe","-c:v","mjpeg","-framerate","24","-i","pipe:0","-an","-c:v","libx264","-preset","fast","-crf","20","-pix_fmt","yuv420p","-movflags","+faststart",output],{stdio:["pipe","ignore","inherit"]});
        const finished=once(encoder,"close");const frames=[];const snapshots={};
        const steps=132;
        for(let i=0;i<steps;i++){
          if(i===4 && id==="red")await page.keyboard.down("c");
          if(i===29 && id==="red")await page.keyboard.up("c");
          if(i===50)await page.keyboard.press("Space");
          if(i===103){
            await page.evaluate(()=>{
              bossHitGrace=0;
              enemyProjectiles.push({x:player.x+player.width*.46,previousX:player.x+player.width*.56,y:player.y-player.height*.12,
                vx:-160,vy:0,radius:5,age:0,color:"#fa9b62"});
            });
            await page.keyboard.press("v");
          }
          if(i===119)await page.evaluate(()=>{
            enemyProjectiles.push({x:player.x+player.width*.46,previousX:player.x+player.width*.56,y:player.y+player.height*.15,
              vx:-160,vy:0,radius:5,age:0,color:"#fa9b62"});
          });
          const stats=await page.evaluate(()=>{
            renderTestFrame(captureClock+=1000/24);
            return {fighter:sortieFighter,phase:ultimate.phase,full:fighterCombat.stability>=.99,
              heavy:bullets.some(b=>b.source==="crimson-heavy"),chain:fighterCombat.arcs.length,stacks:fighterCombat.stacks,
              conducting:fighterCombat.arcs.some(link=>link.index===2&&link.remaining<.27&&link.remaining>.22),
              pulse:fighterCombat.field?.pulses??0,guard:shield.perfectUsed,shield:shieldIsActive(),hp:enemies.map(e=>e.hp),
              charge:ultimate.charges,time:battleTime};
          });
          frames.push(stats);
          const buffer=await page.screenshot({type:"jpeg",quality:85});
          if(!encoder.stdin.write(buffer))await once(encoder.stdin,"drain");
          const key = id==="red" && stats.full&&!snapshots.full?"full":id==="blue"&&stats.conducting&&!snapshots.chain?"chain":
            id==="yellow"&&stats.pulse===2&&!snapshots.field?"field":i===80?"ultimate":i===105?"parry":null;
          if(key){fs.writeFileSync(path.join(out,id+"-"+key+".jpg"),buffer);snapshots[key]=i;}
        }
        encoder.stdin.end();const [code]=await finished;assert.equal(code,0);
        const r={id,frames:frames.length,video:path.basename(output),screens:snapshots,
          charged:frames.some(f=>f.full),heavy:frames.some(f=>f.heavy),chain:Math.max(...frames.map(f=>f.chain)),
          pulses:Math.max(...frames.map(f=>f.pulse)),parried:frames.some(f=>f.guard),fired:frames.some(f=>f.phase==="firing"),
          damaged:frames.at(-1).hp.filter(h=>h<1).length,errors};
        console.log(r);report.ships.push(r);
        fs.writeFileSync(path.join(out,"fighter-combat.json"),JSON.stringify(report,null,2));
        assert.equal(r.id,frames[0].fighter);assert.deepEqual(errors,[]);assert.ok(r.parried&&r.fired&&r.damaged>0);
        if(id==="red")assert.ok(r.heavy&&r.charged);
        if(id==="blue")assert.ok(r.chain>=3);
        if(id==="yellow")assert.equal(r.pulses,3);
      } finally { if(encoder&&!encoder.stdin.destroyed)encoder.stdin.destroy();await page.close(); }
    }
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
