"use strict";
const path=require("node:path"),fs=require("node:fs"),assert=require("node:assert/strict");
const {chromium}=require("playwright");
const root=path.resolve(process.argv[2]||".");
const {createPage}=require("./balance.cjs");
const output=path.resolve(process.argv[3]||"mimic-attack-results");
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:["--disable-gpu"]});
 try {
  const {page,errors}=await createPage(browser,root,false,{pageOptions:{viewport:{width:1280,height:720}}});
  await page.locator("#start-button").click();
  const rows=await page.evaluate(()=>{
   const rows=[],nativeCue=playAlienHazardCue;
   let cues=[];
   playAlienHazardCue=function(h,phase,source) { if(h.owner==="player") cues.push(phase); return nativeCue(h,phase,source); };
   for(let type=0;type<11;type++)for(const [x,y] of [[.81,.32],[.86,.52],[.82,.74]]) {
    showScreen("battle",{seed:4225,difficulty:"veteran"});spawnBoss(2);resetBossPresentation();
    Object.assign(boss,bossArena(2));boss.phase="recover";boss.hp=.87;boss.enraged=true;
    boss.x=viewport.width*x;boss.y=viewport.height*y;
    const before=boss.hp,life=player.lives,shieldCount=shield.charges,hostile=bossHazards.length;
    clearBossMimic(); cues=[];
    if(!startBossMimic(type,3))throw Error("cast refused "+type);
    const skill=friendlyBossMimic.h.ultimateKind;
    const cap=friendlyBossMimic.bossCap;
    let firstHit=null,drawn=0;
    for(let tick=0;tick<188;tick++) {
     battleTime+=1/60;stepBossMimic(1/60);
     if(boss.hp<before && firstHit===null) firstHit=tick;
     if(x===.86 && (tick===18 || tick===95 || tick===144)) {drawBossMimic(context);drawn++;}
    }
    rows.push({type:type+1,skill,targetNormalized:[x,y],bossDamage:before-boss.hp,cap,firstHit,drawn,cues:[...cues],
     playerLivesDelta:player.lives-life,shieldsDelta:shield.charges-shieldCount,hostileCountDelta:bossHazards.length-hostile,cleared:friendlyBossMimic===null});
   }
   playAlienHazardCue=nativeCue;
   return rows;
  });
  fs.writeFileSync(path.join(output,"mimic-attacks.json"),JSON.stringify({method:"Production cast, damage and draw functions. Fixed 60Hz ticks against a live boss at 3 typical right-hand positions. No enemy AI advances during hit isolation.",rows,errors},null,2));
  for(const row of rows) {
   assert.ok(row.bossDamage>0 && row.bossDamage<=row.cap+1e-10,JSON.stringify(row));
   assert.equal(row.playerLivesDelta,0); assert.equal(row.shieldsDelta,0); assert.equal(row.hostileCountDelta,0);
   assert.deepEqual(row.cues,["tell","active","tail"]);assert.ok(row.cleared);
  }
  assert.deepEqual(errors,[]);
  console.log(rows.length+" passed");
 }finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
