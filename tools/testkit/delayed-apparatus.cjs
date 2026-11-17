"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {createPage}=require('./balance.cjs');
(async()=>{
 const game=path.resolve(process.argv[2]||'.'),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 const report={schema:'delayed-boss-apparatus/1',cases:[]};
 try{
  const {page,errors}=await createPage(browser,game,true);
  await page.addScriptTag({path:path.join(__dirname,'nextgen-combat-scenarios.js')});
  report.cases=await page.evaluate(()=>{
   const cases=[];
   for(const weaponKind of ['ordinary','evolution-pierce','red','yellow','blue']){
    const target=nextgenStage(3,{variant:1});prepareAlienAttack(target,false);
    let h;
    if(weaponKind==='ordinary'||weaponKind==='evolution-pierce')h=bossHazards.find(h=>h.kind==='loom'&&h.comboStage===2);
    else {
     bossHazards.length=0;target.pressureAttackCount=6;prepareAlienAttack(target,true);
     h=bossHazards.find(h=>h.kind==='ultimate');h.tellAt=.5;
    }
    const node=h.nodes[0],before=node.health;
    h.age=h.tellAt-.01;
    let shot,resolve;
    if(weaponKind==='ordinary'||weaponKind==='evolution-pierce'){
     bullets.length=0;shotCooldown=0;updateShooting(0);shot=bullets[0];shotCooldown=Infinity;
     if(weaponKind==='evolution-pierce'){shot.piercesShield=true;shot.visual='lance';}
     shot.x=shot.previousX=node.x;shot.y=shot.previousY=node.y;
     resolve=()=>updateShooting(0);
    }else{
     ultimate.kind=weaponKind;fireUltimate();
     shot=weaponKind==='blue'?ultimate.shot.missiles[0]:weaponKind==='yellow'?ultimate.shot.waves[0]:ultimate.shot;
     shot.x=shot.previousX=node.x;shot.y=shot.previousY=node.y;
     if(weaponKind!=='blue')shot.startX=Math.min(shot.startX,node.x-20);
     resolve=weaponKind==='blue'?()=>resolveIonHit(shot,[],0):()=>resolveUltimateHits(shot);
    }
    resolve();const hidden={health:node.health,consumed:weaponKind==='ordinary'&&!bullets.includes(shot),registered:!!(shot.hitMechanicNodes?.has(node)||shot.ultimateNodeHits?.has(node))};
    h.age=h.tellAt;resolve();
    cases.push({weapon:weaponKind,kind:h.kind,tellAt:h.tellAt,warning:h.warning,before,hidden,visible:{health:node.health,consumed:weaponKind==='ordinary'&&!bullets.includes(shot)}});
   }
   showScreen('menu');return cases;
  });
  for(const c of report.cases){
   assert.equal(c.hidden.health,c.before,`${c.weapon}: unrevealed apparatus must not take damage`);
   assert.equal(c.hidden.consumed,false,`${c.weapon}: unrevealed apparatus must not consume a packet`);
   assert.equal(c.hidden.registered,false,`${c.weapon}: unrevealed apparatus must not register a hit`);
   assert.ok(c.visible.health<c.before,`${c.weapon}: apparatus must be hittable as soon as the tell appears`);
   if(c.weapon==='ordinary')assert.equal(c.visible.consumed,true);
  }
  assert.deepEqual(errors,[]);report.status='passed';console.log('Delayed apparatus: 5 weapon paths passed');
 }catch(e){report.status='failed';report.error=e.stack;throw e;}
 finally{fs.writeFileSync(path.join(out,'delayed-apparatus.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
