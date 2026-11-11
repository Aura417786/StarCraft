"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {chromium}=require("playwright");
const {createPage}=require("./balance.cjs");
async function main(){
  const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),baseline=process.argv.includes("--baseline");
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  try{
    const {page,errors}=await createPage(browser,root,true);
    const rows=await page.evaluate(()=>{
      const rows=[];
      for(const fighter of ["yellow","blue"]){
        for(const scenario of [{type:1},{type:5},{type:7},{type:9},{type:9,weakFirst:true}]){
          const {type,weakFirst=false}=scenario;
          selectedFighter=fighter;showScreen("battle",{seed:4225,difficulty:"veteran"});canvas.focus({preventScroll:true});
          battleTime=120; nextBossTime=enemyCooldown=powerupCooldown=shotCooldown=Infinity;
          raiseWeaponFloor(progressionPresetForBoss(type));
          spawnBoss(type);Object.assign(boss,bossArena(type),{phase:"recover",age:100});
          boss.previousX=boss.x;boss.previousY=boss.y;
          beginBossFinale(boss);boss.finale.age=boss.finale.transform+10;
          if(weakFirst)boss.finale.nodes[0].hp=.05;
          const target=boss; const originalNodes=target.finale.nodes.map(n=>n.hp);
          const originalHit=hitUltimateBoss;const hits=[];
          hitUltimateBoss=function(b,s,cap,...rest){
            const before=b.hp, nodes=b.finale.nodes.map(n=>n.hp);
            originalHit(b,s,cap,...rest);
            const contact=rest[0]??s;
            hits.push({node:contact.finaleNode??null, aim:s.aimNode??null,y:contact.y,
              cap,damage:before-b.hp,nodeDamage:b.finale.nodes.map((n,i)=>nodes[i]-n.hp)});
          };
          ultimate.charges=1;requestUltimate();
          const traces=[];
          for(let i=0;i<330;i++){
            battleTime+=1/120;updateUltimate(1/120);
            if(ultimate.shot?.missiles&&i%12===0)traces.push(ultimate.shot.missiles.filter(m=>m.active&&!m.done).map(m=>({x:m.x,y:m.y,angle:m.angle,targetBoss:m.target===target,aim:m.aimNode??null})));
          }
          hitUltimateBoss=originalHit;
          rows.push({fighter,type,weakFirst,mode:target.finale.mode,activeNode:target.finale.activeNode,
            bodyDamage:1-target.hp,nodeDamage:target.finale.nodes.map((n,i)=>originalNodes[i]-n.hp),hits,
            nodeGeometry:target.finale.nodes.map(n=>finaleNodeGeometry(target,n)),
            trails:traces,phase:ultimate.phase,energy:ultimate.energy});
        }
      }
      return rows;
    });
    fs.writeFileSync(path.join(out,"ultimate-finales.json"),JSON.stringify({baseline,rows,errors},null,2));
    assert.deepEqual(errors,[]);
    if(!baseline){
      for(const row of rows){
        assert.equal(row.phase,"idle");assert.equal(row.energy,0);
        assert.ok(row.hits.length<=(row.fighter==="yellow"?3:5),"No duplicate boss packet per wave or missile");
        if(row.mode!=="mirror")assert.ok(row.nodeDamage.some(d=>d>0),`${row.fighter} ${row.mode} must strike a real finale node`);
        if(row.mode==="synapse")assert.ok(row.nodeDamage[0]>0,"Initially active synapse 0 must receive actual damage");
        if(row.weakFirst)assert.ok(row.nodeDamage[1]>0,"Remaining shots must follow the next active node after the first node breaks");
        if(row.fighter==="yellow"&&["bones","spores"].includes(row.mode))assert.ok(row.nodeDamage.every(d=>d>0),"Three full-height waves must cover all live nodes without tripling each wave's damage");
        assert.ok(row.hits.every(hit=>hit.nodeDamage.filter(d=>d>0).length<=1),"One packet must never damage multiple nodes");
        assert.ok(row.hits.every(hit=>hit.damage<=hit.cap*1.24+1e-10),"Existing per-packet cap plus existing weakpoint multiplier must be respected");
      }
    }
    console.log(JSON.stringify(rows.map(({hits,trails,nodeGeometry,...row})=>row),null,2));
    await page.close();
    if(!baseline){
      const live=[];
      for(const fighter of ["yellow","blue"]){
        const {page:visible,errors:renderErrors}=await createPage(browser,root,false);
        await visible.locator(`#fighter-picker input[value="${fighter}"]`).check();
        await visible.locator("#start-button").click();
        await visible.evaluate(()=>{
          battleTime=120;nextBossTime=enemyCooldown=powerupCooldown=shotCooldown=Infinity;
          formationState.nextTime=battlefieldEvents.nextObject=battlefieldEvents.nextTransport=aceEncounter.nextTime=Infinity;
          enemies.length=bullets.length=0;flightControls.autofire=false;
          raiseWeaponFloor(progressionPresetForBoss(9));spawnBoss(9);
          Object.assign(boss,bossArena(9),{phase:"recover",age:100});
          boss.previousX=boss.x;boss.previousY=boss.y;beginBossFinale(boss);
          boss.finale.age=boss.finale.transform+1;boss.finale.next=Infinity;
          window.__ultLive={initial:boss.finale.nodes.map(n=>n.hp),hits:[],inputTrusted:false};
          const hit=hitUltimateBoss;
          hitUltimateBoss=function(target,shot,cap,contact=shot){
            const before=target.finale.nodes.map(n=>n.hp);hit(target,shot,cap,contact);
            __ultLive.hits.push({node:contact.finaleNode??null,y:contact.y,
              damage:target.finale.nodes.map((n,i)=>before[i]-n.hp)});
          };
          window.addEventListener("keydown",event=>{if(event.code==="Space")__ultLive.inputTrusted=event.isTrusted;});
          ultimate.charges=1;canvas.focus({preventScroll:true});
        });
        await visible.waitForTimeout(1000);
        await visible.keyboard.press("Space");
        await visible.waitForFunction(()=>ultimate.phase==="firing");
        await visible.waitForTimeout(200);
        await visible.screenshot({path:path.join(out,`${fighter}-ultimate-live.png`)});
        await visible.waitForFunction(()=>ultimate.phase==="idle");
        const result=await visible.evaluate(()=>({...__ultLive,energy:ultimate.energy,remaining:ultimate.charges,
          nodes:boss.finale.nodes.map(n=>n.hp),age:boss.finale.age}));
        assert.ok(result.inputTrusted);assert.equal(result.remaining,0);assert.equal(result.energy,0);
        assert.ok(result.nodes[0]<result.initial[0],"Real keyboard cast must hit the moving legal neural node");
        assert.deepEqual(renderErrors,[]);live.push({fighter,...result,errors:renderErrors});
        await visible.close();
      }
      fs.writeFileSync(path.join(out,"ultimate-live.json"),JSON.stringify({kind:"Staged finale, real frame loop and Chrome keyboard events; not a natural playthrough",live},null,2));
    }
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
