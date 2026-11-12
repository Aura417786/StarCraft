"use strict";

const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {chromium}=require("playwright");
const {createPage}=require("./balance.cjs");
const {selectHangarFighter}=require("./hangar-test-controls.cjs");

async function main(){
  const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  const results={input:"Chrome keyboard events; staged targets; real-time rendering; not human play",ships:[],errors:[]};
  try{
    for(const fighter of ["red","blue","yellow"]){
      const {page,errors}=await createPage(browser,root,false);
      try{
        await selectHangarFighter(page, fighter);
        await page.locator("#start-button").click();
        await page.evaluate(fighter=>{
          enemyCooldown=nextBossTime=powerupCooldown=Infinity;
          formationState.nextTime=battlefieldEvents.nextObject=battlefieldEvents.nextTransport=aceEncounter.nextTime=Infinity;
          enemies.length=bullets.length=0;
          flightControls.autofire=fighter!=="red";
          battleTime=120; raiseWeaponFloor(progressionPresetForBoss(3));
          firingStyle.mode=fighter==="yellow"?"spread":"focus";
          spawnEnemy("armored");
          const enemy=enemies.at(-1);
          Object.assign(enemy,{x:720,previousX:720,y:player.y,previousY:player.y,baseY:player.y,speed:0,hp:1,maxHp:1,healthLog:Math.log(20000),fireProtection:undefined});
          window.__verbTarget=enemy;
          window.__verbLog={chargeStart:null,firstCharge:null,firstChain:null,firstField:null,range:null};
          window.addEventListener("keydown",event=>{
            if(event.code==="KeyC"&&!event.repeat)__verbLog.chargeStart=performance.now();
          });
          const original=updateFighterCombat;
          updateFighterCombat=function(dt){
            original(dt);
            if(fighterCombat.redHeld&&__verbLog.firstCharge===null)__verbLog.firstCharge=performance.now();
            if(fighterCombat.arcs.length&&__verbLog.firstChain===null)__verbLog.firstChain=performance.now();
            if(fighterCombat.field&&__verbLog.firstField===null)__verbLog.firstField={x:player.x,at:performance.now()};
          };
          canvas.focus({preventScroll:true});
        },fighter);
        // Separate steady-state input feedback from first-sortie resource load.
        // Cold-load frame costs are measured by the release performance suite.
        await page.waitForTimeout(1200);
        if(fighter==="red"){
          await page.keyboard.down("c");
          await page.waitForFunction(()=>fighterCombat.stability>.99);
          await page.screenshot({path:path.join(out,"red-full-charge.png")});
          await page.keyboard.up("c");
          await page.waitForFunction(()=>__verbTarget.hp<1);
        }else if(fighter==="blue"){
          await page.waitForFunction(()=>fighterCombat.arcs.length>0);
          await page.screenshot({path:path.join(out,"blue-chain.png")});
        }else{
          await page.waitForTimeout(600);
          assert.equal(await page.evaluate(()=>__verbLog.firstField),null,"Auric should not deploy while outside range");
          await page.screenshot({path:path.join(out,"yellow-approach-cue.png")});
          await page.keyboard.down("ArrowRight");
          await page.waitForFunction(()=>!!fighterCombat.field);
          await page.keyboard.up("ArrowRight");
          await page.screenshot({path:path.join(out,"yellow-in-range-field.png")});
        }
        const proof=await page.evaluate(()=>({fighter:sortieFighter,log:__verbLog,hp:__verbTarget.hp,
          status:fighterSystemsReadout.textContent,player:{x:player.x,y:player.y},
          phase:state,field:!!fighterCombat.field,chainCount:fighterCombat.arcs.length}));
        results.ships.push(proof);results.errors.push(...errors);
      }finally{await page.close();}
    }
    assert.deepEqual(results.errors,[]);
    fs.writeFileSync(path.join(out,"gameplay-live.json"),JSON.stringify(results,null,2));
    console.log(JSON.stringify(results,null,2));
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
