"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

// Reproduce the Azure loadout visible in the playtest screenshots. All three
// pilots have the same stock, five hull points, and the previous boss imprint.
function screenshotEncounter({ type, policy }) {
  const originalStart = balanceStart, originalAction = balanceChooseAction;
  let target;
  balanceStart = function (fixture) {
    originalStart(fixture);
    target = boss;
    while (player.maxLives < 5) grantPlayerLife(true);
    if (type > 0) rememberDefeatedBoss(type - 1);
    shield.charges = 2;
    ultimate.charges = 5;
  };
  balanceChooseAction = function (controls, mode) {
    if (mode === "pilot" || evolution.pending) return originalAction(controls, mode);
    if (!isBattleActive()) return;
    if (mode === "spam-shield" && shield.charges && !shieldIsActive()) {
      balanceTap("KeyV");
      controls.shields++;
    }
    if (boss && bossCanTakeDamage(boss) && ultimate.phase === "idle" && ultimate.charges) {
      balanceTap("Space");
      controls.specials++;
    }
    if (boss && evolution.cooldown <= 0 && Number.isInteger(evolution.lastDefeatedBoss)) balanceTap("KeyF");
  };
  try {
    const sample = runBalanceFixture({ seed: 4225, label: "azure-" + policy, fighter: "blue", policy,
      bossType: type, weaponPreset: { damageLevel: 24, rateLevel: 11, laneLevel: 5 },
      difficulty: "hard", mode: "campaign", build: type ? "mimic" : "stock", evolutionLevel: type,
      seconds: 155, fixture: "preset" });
    return { boss: type+1, policy, weapon:sample.starting_weapon, power: target.scaling.power, k:target.scaling.k,
      bodyHp:target.baseHealth, won:sample.won, ttk:sample.ttk_seconds, seconds:sample.survival_seconds,
      livesLost:sample.lives_lost, livesLeft:sample.lives_left, shieldUses:sample.shields_used,
      specials:sample.specials_used, firstHit:sample.first_hit, failure:sample.failure_reason,
      bodyChains:target.comboLog?.length ?? 0, ultimates:target.pressureSequence ?? 0,
      signatureImpacts:(target.pressureLog??[]).filter(event=>event.event==="impact").length,
      signatureTimeline:(target.pressureLog??[]).filter(event=>event.event==="charge"||event.event==="impact")
        .map(event=>({event:event.event,seconds:balanceRound(event.at),fullSeal:event.fullSeal})),
      bodyIntervals:(target.comboLog??[]).slice(1).map((entry,i)=>balanceRound(entry.at-target.comboLog[i].at)),
      finaleChains:target.finale?.comboLog?.length ?? 0 };
  } finally { balanceStart=originalStart; balanceChooseAction=originalAction; }
}

function measureCast({fighter, type}) {
  balanceStart({seed:4225, bossType:type, mode:"campaign", build:"stock", policy:"pilot", difficulty:"hard",
    fighter, weaponPreset:{damageLevel:24,rateLevel:11,laneLevel:5}, fixture:"preset"});
  const target = boss;
  Object.assign(target, bossArena(type), {phase:"attack", alienAttack:"pressure", age:100, enraged:true});
  target.previousX=target.x; target.previousY=target.y;
  player.y = player.previousY = target.y;
  ultimate.charges=1;
  const before=target.hp;
  balanceTap("Space");
  for (let i=0;i<390;i++) {battleTime+=1/120; updateUltimate(1/120);}
  return {fighter,boss:type+1, bodyHp:target.baseHealth, rawDamage:balanceRound((before-target.hp)*target.baseHealth),
    percent:balanceRound((before-target.hp)*100), cooldownComplete:ultimate.phase==="idle"};
}

function encounterContracts() {
  const scaling=[];
  for (let type=0; type<11; type++) {
    const builds=[];
    for (const preset of [progressionPresetForBoss(type),{damageLevel:24,rateLevel:11,laneLevel:5}]) {
      const cases=[];
      for (const difficulty of ["easy","normal","hard"]) {
        balanceStart({seed:4225,bossType:type,mode:"campaign",build:"stock",policy:"pilot",
          fighter:"blue",difficulty,fixture:"preset",weaponPreset:preset});
        const captured=boss.scaling;
        cases.push({difficulty,power:captured.power,k:captured.k,bodyHp:boss.baseHealth,
          tempo:sortieRules().attackTempo,speed:sortieRules().projectileSpeed});
      }
      builds.push(cases);
    }
    const [low,full]=builds;
    scaling.push({boss:type+1,low,full,
      passed:builds.every(cases=>cases.every(row=>row.bodyHp===cases[0].bodyHp && row.power===cases[0].power)
        && cases[0].tempo<cases[1].tempo && cases[1].tempo<cases[2].tempo)
        && full[0].bodyHp>low[0].bodyHp && full[0].power>low[0].power});
  }
  const severed=[];
  for (const [type,kind] of [[6,"tailConduit"],[7,"sporeNests"],[9,"neuralRelay"],[10,"fusionLimbs"]]) {
    const target=nextgenStage(type,{variant:0,enraged:false});
    prepareAlienAttack(target,false);
    const device=bossHazards.find(h=>h.kind===kind);
    const remaining=()=>bossHazards.filter(h=>h.comboId===device.comboId && h.comboStage===2).length;
    const before=remaining();
    const parts=kind==="fusionLimbs"?[device.nodes[1]]:device.nodes;
    for(let pass=0;pass<10 && parts.some(node=>node.health>0);pass++){
      for (const node of parts) if(node.health>0) interceptAlienRound({x:node.x,y:node.y,previousX:node.x,
        previousY:node.y,halfHeight:1,piercesShield:true});
    }
    severed.push({boss:type+1,kind,before,after:remaining(),broken:parts.every(node=>node.health<=0)});
  }
  const ringContacts=[];
  for (const difficulty of ["easy","normal","hard"]) {
    balanceStart({seed:4225,bossType:6,mode:"campaign",build:"stock",policy:"pilot",fighter:"blue",
      difficulty,fixture:"preset",weaponPreset:{damageLevel:24,rateLevel:11,laneLevel:5}});
    const target=boss;
    Object.assign(target,bossArena(6));
    prepareAlienAttack(target,false);
    const interval=target.attackInterval;
    ringTell(target,{material:"plasma",at:0,x:target.x,y:target.y,duration:1.25});
    const body=bossHazards[bossHazards.length-1];
    function firstContact(hazard,hits) {
      player.x=player.previousX=hazard.x-hazard.radius*.72;
      player.y=player.previousY=hazard.y;
      for(let step=0;step/240<hazard.duration;step++){
        hazard.age=hazard.warning+step/240;
        if(hits())return step/240;
      }
      return null;
    }
    const bodyContact=firstContact(body,()=>alienHazardHitsPlayer(body));
    beginBossFinale(target);
    const f=target.finale;f.age=f.transform+.01;
    const finale=finaleCoil(target,finaleBounds(),1);
    const finaleContact=firstContact(finale,()=>bossFinaleHitsPlayer(target));
    ringContacts.push({difficulty,hp:target.baseHealth,interval,
      bodySecondsFromFlash:bodyContact,finaleSecondsFromFlash:finaleContact,
      bodyTravelSeconds:body.duration,finaleTravelSeconds:finale.duration});
  }
  return {scaling,severed,ringContacts};
}

function compareRelease(previous,current) {
  assert.equal(previous.seed,current.seed);
  const casts=current.casts.map((next,i)=>{
    const old=previous.casts[i];
    assert.equal(old.boss,next.boss);
    assert.equal(old.fighter,next.fighter);
    assert.ok(next.rawDamage<old.rawDamage && next.percent<old.percent,"Full-cast damage went up");
    return {boss:next.boss,fighter:next.fighter,oldDamage:old.rawDamage,newDamage:next.rawDamage,
      oldPercent:old.percent,newPercent:next.percent};
  });
  const bosses=current.encounters.filter(row=>row.policy==="pilot").map(next=>{
    const sameBoss=row=>row.boss===next.boss;
    const old=previous.encounters.find(row=>sameBoss(row) && row.policy==="pilot");
    const [still,shield]=current.encounters.filter(row=>sameBoss(row) && row.policy!=="pilot");
    assert.deepEqual(next.weapon,old.weapon);
    assert.ok(next.bodyHp>old.bodyHp && next.signatureImpacts>0,"Health or released signature missing");
    assert.ok(!shield.won && !still.won,"A fixed-position strategy won this seeded encounter");
    return {boss:next.boss,oldHp:old.bodyHp,hp:next.bodyHp,oldK:old.k,k:next.k,
      oldTtk:old.ttk,ttk:next.ttk,oldLivesLost:old.livesLost,livesLost:next.livesLost,
      oldSignatureImpacts:old.signatureImpacts,signatureImpacts:next.signatureImpacts,
      stationarySurvival:still.seconds,shieldSpamSurvival:shield.seconds,pilotSurvival:next.seconds};
  });
  assert.equal(bosses.length,11);
  const rings=current.contracts.ringContacts;
  for(const key of ["interval","bodySecondsFromFlash","finaleSecondsFromFlash"]){
    assert.ok(rings[2][key]>0 && rings[0][key]>rings[1][key] && rings[1][key]>rings[2][key],key);
  }
  assert.ok(rings.every(row=>row.hp===rings[0].hp));
  assert.ok(current.contracts.severed.every(row=>row.broken && row.before>0 && row.after===0),"Counter failed to sever its finisher");
  return {casts,bosses};
}

async function main() {
  const [game, output, baseline] = process.argv.slice(2);
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  try {
    const {page,errors} = await createPage(browser,path.resolve(game),true);
    await page.addScriptTag({path:path.resolve(__dirname,"nextgen-combat-scenarios.js")});
    const report={seed:4225, methodology:"Three fixed input policies, five hull, two shields, five stored ultimates, real firing/collision at 60 Hz and the same 24/11/5 Azure loadout. Spell stock and lives are staged. This is not a human clear rate.",
      casts:[], encounters:[], errors};
    report.contracts=await page.evaluate(encounterContracts);
    assert.ok(report.contracts.scaling.every(row=>row.passed),"Per-fighter spawn HP or difficulty cadence regressed");
    for (const fighter of ["red","blue","yellow"])
      for (const type of [0,4,9]) report.casts.push(await page.evaluate(measureCast,{fighter,type}));
    assert.ok(report.casts.every(row=>row.percent>0 && row.cooldownComplete));
    for(let type=0;type<11;type++) {
      for(const policy of ["stationary","spam-shield","pilot"]) {
        const row=await page.evaluate(screenshotEncounter,{type,policy});
        assert.equal(row.weapon.lanes,5);
        assert.equal(row.weapon.rate,12);
        assert.ok(Math.abs(row.weapon.damage-40.264)<.001);
        report.encounters.push(row);
      }
      fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
      fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");
      console.log("Boss",type+1,report.encounters.slice(-3).map(r=>[r.won,r.livesLost,r.ttk]));
    }
    assert.deepEqual(errors,[]);
    if(baseline){
      report.comparison=compareRelease(JSON.parse(fs.readFileSync(baseline,"utf8")),report);
      fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");
    }
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
