"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("playwright");
const {createPage}=require("./balance.cjs");

function installPilot({seed,route}){
  __balanceClock.seed(seed);
  const launch=startBattleWithSound;
  startBattleWithSound=opts=>{startBattleWithSound=launch;launch({...opts,seed});};
  balanceMove=(horizontal,vertical)=>{
    for(const [key,wanted] of [["ArrowRight",horizontal>0],["ArrowLeft",horizontal<0],
      ["ArrowDown",vertical>0],["ArrowUp",vertical<0]]){
      if(pressedKeys.has(key)!==wanted)balancePress(key,wanted?"keydown":"keyup");
    }
  };
  const controls={build:route,shields:0,specials:0,routeSkills:0};
  const events=[],attempts=Array(11).fill(0);
  let frames=0,activeBoss=null,seenHits=0;
  const mark=(event,details={})=>events.push({event,frame:frames,at:balanceRound(battleTime),lives:player.lives,...details});
  window.campaignBatch=()=>{
    for(let n=0;n<3600;n++,frames++){
      if(campaignVictory?.stage==="sequence")document.querySelector("#campaign-epilogue-skip").click();
      if(campaignVictory?.stage==="report")break;
      if(state==="over"){
        const retry=document.querySelector("#boss-retry-button");
        if(retry.hidden||!boss||attempts[boss.type]>=10)break;
        mark("retry",{boss:boss.type+1,cause:lastDamageMessage});
        retry.click();activeBoss=null;seenHits=sortieStats.hitsTaken;
        Object.assign(controls,{shiftHeld:false,chargeHeld:false,nextHeavy:0});
        canvas.focus();
      }
      if(evolution.pending){
        const card=evolutionCards.find(item=>item.dataset.choice===route && !item.disabled);
        if(!card)throw Error("Missing natural evolution choice "+route);
        card.click();mark("evolve",{route,rank:evolution.level});
      }
      if(boss && activeBoss!==boss){
        activeBoss=boss;attempts[boss.type]++;
        mark("enter",{boss:boss.type+1,attempt:attempts[boss.type],power:boss.scaling.power,hp:boss.baseHealth});
      }
      const cadence=activeBoss?2+(attempts[activeBoss.type]-1)%4:3;
      if(frames%cadence===0 && state==="battle")balanceChooseAction(controls,"pilot");
      __balanceClock.tick(1/60);
      if(sortieStats.hitsTaken>seenHits){
        seenHits=sortieStats.hitsTaken;
        mark("hit",{boss:boss?boss.type+1:null,cause:lastDamageMessage});
      }
      if(activeBoss && !boss && bossDefeated===activeBoss.type+1){
        mark("defeat",{boss:activeBoss.type+1});activeBoss=null;
      }
    }
    const deathMetric=[...document.querySelectorAll("#campaign-report-content .sortie-metric")]
      .find(node=>["本局阵亡","Deaths this run"].includes(node.querySelector("span")?.textContent));
    return {frames,seconds:balanceRound(frames/60),battleTime:balanceRound(battleTime),state,lives:player.lives,
      score,cleared:bossDefeated,mode:sortieStats.mode,difficulty:sortieStats.difficulty,seed:sortieStats.seed,
      victory:campaignVictory?.stage,won:sortieStats.result?.won??false,retired:state==="over" && !sortieStats.result?.won,
      cards:document.querySelectorAll(".campaign-boss-card[data-cleared='true']").length,
      displayedDeaths:deathMetric?Number(deathMetric.querySelector("strong").textContent):null,controls,attempts,events};
  };
}

async function main(){
  const [game,outArg,difficulty="hard",fighter="blue",route="frost",seedArg="4225"]=process.argv.slice(2);
  const seed=Number(seedArg),out=path.resolve(outArg);
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  try{
    const {page,errors}=await createPage(browser,path.resolve(game),true);
    await page.locator("#hangar-loadout").click();
    await page.locator('#fighter-picker label[data-fighter="'+fighter+'"]').click();
    await page.locator('#hangar-difficulty label:has(input[value="'+difficulty+'"])').click();
    await page.locator("#hangar-back-loadout").click();
    await page.evaluate(installPilot,{seed,route});
    await page.locator("#start-button").click();
    const start=await page.evaluate(()=>({state,lives:player.lives,hp:player.maxLives,fighter:sortieFighter,
      weapon:balanceGunState(),upgrades:{...sortieStats.upgrades},difficulty:sortieStats.difficulty}));
    assert.equal(start.state,"battle");assert.equal(start.lives,3);assert.equal(start.fighter,fighter);
    assert.equal(start.difficulty,difficulty);assert.deepEqual(start.upgrades,{firepower:0,survival:0,mobility:0});
    const timer=Date.now();
    let latest;
    do{
      latest=await page.evaluate(()=>window.campaignBatch());
      const report={setup:"Fresh browser, normal launch button, campaign waves and drops. Inputs are synthetic keyboard events and existing evolution/retry buttons. Real fixed-step gameplay clock driven at 60 Hz in accelerated wall time. No combat rendering, injected enemies, HP, equipment, invulnerability, scripted clears, or resource grants. Sequence skip uses the epilogue button.",start,errors,
        wallSeconds:(Date.now()-timer)/1000,browser:browser.version(),...latest};
      fs.writeFileSync(path.join(out,"natural-campaign.json"),JSON.stringify(report,null,2)+"\n");
      console.log(latest.seconds+" simulated seconds, "+latest.cleared+"/11, "+latest.lives+" lives, "+latest.state);
      assert.deepEqual(errors,[]);
    }while(!latest.retired && !latest.won && latest.frames<180000);
    if(latest.victory!=="report" && latest.won)latest=await page.evaluate(()=>window.campaignBatch());
    await page.screenshot({path:path.join(out,"result.png")});
    assert.ok(latest.won && latest.victory==="report" && latest.cleared===11 && latest.cards===11,"Campaign did not reach the full victory report");
    assert.equal(latest.displayedDeaths,latest.events.filter(event=>event.event==="retry").length,"Final deaths must include every checkpoint retry");
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
