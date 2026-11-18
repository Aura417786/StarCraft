"use strict";

// Usage: node tools/testkit/boss-release-frames.cjs <game folder> <evidence folder> [1,2,...]
// Each boss is tested with a stocked shield as well as with an empty one.
// Sample only frames actually submitted while the ultimate is dealing damage.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

function distribution(frameTimes) {
  const sorted = frameTimes.slice().sort((a,b) => a-b);
  const at = q => +sorted[Math.ceil(sorted.length*q)-1].toFixed(2);
  return {frames: sorted.length, p50: at(.5), p95: at(.95), p99: at(.99), max: at(1),
    above33ms: sorted.filter(t => t>33.4).length, above50ms: sorted.filter(t => t>50).length};
}

async function measure(page, type) {
  await page.locator("#start-button").click();
  await page.evaluate(type => {
    showScreen("battle",{seed:77135,difficulty:"veteran"});
    setVisualQuality("high",false);
    enemyCooldown=powerupCooldown=nextBossTime=Infinity;
    formationState.nextTime=battlefieldEvents.nextObject=battlefieldEvents.nextTransport=aceEncounter.nextTime=Infinity;
    spawnBoss(type); resetBossPresentation(); Object.assign(boss,bossArena(type));
    shotCooldown=Infinity; player.invulnerable=500; bossHitGrace=1000;
    const normalFrame=drawFrame;
    let previous=0, wasActive=false;
    drawFrame = function(t) {
      const sample=window.releaseSample, begin=performance.now();
      normalFrame(t);
      if (sample && !sample.done) {
        const h=bossHazards.find(item=>item.kind==="ultimate");
        if (wasActive && t>previous) sample.raf.push(t-previous);
        const active=!!h && h.age>=h.warning && h.age<h.warning+h.duration;
        if (active) sample.submit.push(performance.now()-begin);
        if (wasActive && !active) sample.done=true;
        wasActive=active;
      } else wasActive=false;
      previous=t;
    };
  },type);
  await page.waitForFunction(type=>!!starBreakerModelCache.get(type)?.model,type,{timeout:25000});
  const runs=[];
  for (const charges of [2,0]) {
    await page.evaluate(charges=>{
      resetBossPresentation(); boss.phase="recover"; boss.phaseTime=0; boss.enraged=true;
      boss.hp=boss.displayHp=.44; boss.pressureAttackCount=6;
      bossHazards.length=bossProjectiles.length=0; boss.ultimateCooldown=0;
      shield.charges=charges; prepareAlienAttack(boss,true);
      const h=bossHazards.find(item=>item.kind==="ultimate");
      if (!h || !!h.noShield !== (charges===0)) throw Error("Unexpected ultimate or escape route");
      window.releaseSample={kind:h.ultimateKind,damageSeconds:h.duration,done:false,raf:[],submit:[]};
    },charges);
    await page.waitForFunction(()=>window.releaseSample.done,null,{timeout:25000});
    const s=await page.evaluate(()=>window.releaseSample);
    assert.ok(s.raf.length>=5 && s.submit.length>=5,"Insufficient active frames");
    runs.push({boss:type+1,charges,attack:s.kind,damageSeconds:s.damageSeconds,rafMs:distribution(s.raf),submitMs:distribution(s.submit)});
  }
  return runs;
}

(async()=>{
  const [game,evidence,subset]=process.argv.slice(2);
  const root=path.resolve(game),out=path.resolve(evidence);
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,
    args:["--use-angle=d3d11","--disable-renderer-backgrounding","--disable-background-timer-throttling"]});
  const ids=subset?subset.split(",").map(Number):Array.from({length:11},(_,i)=>i+1);
  const report={method:"Stocked shield then empty shield, staged live boss after model load; high quality, 1440x900, no video or audio encoder. Counts are active-window browser frame intervals.",seed:77135,cpu:os.cpus()[0].model,browser:browser.version(),runs:[]};
  report.runtimeSha256={};
  for (const name of ["game.js","nextgen-elemental-vfx.js","elemental-fluid-vfx.js","boss-ultimate-art.js","assets/vfx/nextgen/void-inclined-horizon.webp"]) {
    report.runtimeSha256[name]=crypto.createHash("sha256").update(fs.readFileSync(path.join(root,name))).digest("hex");
  }
  try {
    const device=await browser.newBrowserCDPSession();
    const gpu=(await device.send("SystemInfo.getInfo")).gpu;
    report.graphics={devices:gpu.devices.map(({deviceString,vendorString})=>({deviceString,vendorString})),features:gpu.featureStatus};
    await device.detach();
    for(const id of ids){
      const {page,errors}=await createPage(browser,root,false,{pageOptions:{viewport:{width:1440,height:900}}});
      try {
        report.runs.push(...await measure(page,id-1));
        assert.deepEqual(errors,[]);
        fs.writeFileSync(path.join(out,"all-boss-release-frames.json"),JSON.stringify(report,null,2));
        console.log(id,report.runs.slice(-2).map(r=>r.rafMs.p95));
      }finally{await page.context().close();}
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
