"use strict";
function nextgenStage(type,{charges=0,disabled=false,finale=false,enraged=false,variant=0}={}) {
  balanceStart({label:"nextgen",seed:4225,bossType:type,fighter:"red",difficulty:"veteran",mode:"campaign",policy:"pilot",build:"stock",fixture:"timing"});
  resetBossPresentation();Object.assign(boss,bossArena(type));boss.phase="recover";boss.phaseTime=0;
  boss.enraged=enraged;boss.pressureAttackCount=0;boss.pressureComboIndex=variant-1;
  bossHitGrace=0;shotCooldown=Infinity;bullets.length=bossProjectiles.length=bossHazards.length=0;
  shield.charges=charges;shield.energy=shield.remaining=0;sortieStats.rules.noShield=disabled;
  player.x=player.previousX=viewport.width*.24;player.y=player.previousY=alienLane(.5);
  if(finale){beginBossFinale(boss);resetBossPresentation();boss.finale.age=boss.finale.transform;boss.finale.next=boss.finale.age;}
  return boss;
}
function nextgenSealContracts() {
  const results=[];
  for(let type=0;type<11;type++)for(const condition of ["empty","stored","disabled","expiring","long-active"]){
    const target=nextgenStage(type,{charges:condition==="stored"?1:0,disabled:condition==="disabled"});
    shield.remaining=condition==="expiring"?.2:condition==="long-active"?8:0;
    target.pressureAttackCount=6;prepareAlienAttack(target,true);
    const seal=bossHazards.find(h=>h.kind==="pressureSeal"),ultimate=bossHazards.find(h=>h.kind==="ultimate");
    const full=seal.fullSeal;const charges=shield.charges;
    const gap=[seal.gapY,seal.gapSize];
    shield.charges=full?0:2;updateBossPressure(target,.01);
    const stable=full===seal.fullSeal&&gap[0]===seal.gapY&&gap[1]===seal.gapSize;
    const gapSafety=[];const finite=[];let threat=0;
    for(const fraction of [.1,.4,.7,.95]){
      ultimate.age=ultimate.warning+ultimate.duration*fraction;
      const g=bossUltimateGeometry(ultimate);
      finite.push([...g.rects,...g.segments,...g.circles].every(v=>Object.values(v).every(Number.isFinite)));
      player.y=seal.gapY;player.x=flightBounds.left+mechanicRoom().width*.5;
      gapSafety.push(!bossUltimateHitsPlayer(ultimate));
      for(const fy of [.1,.3,.5,.7,.9])for(const fx of [.1,.3,.5,.7,.9]){
        player.x=flightBounds.left+mechanicRoom().width*fx;player.y=alienLane(fy);
        if(bossUltimateHitsPlayer(ultimate))threat++;
      }
    }
    results.push({boss:type+1,condition,charges,full,stable,gapSafety,finite,threat,
      quietSeconds:seal.warning-(ultimate.warning+ultimate.duration)});
  }
  // A real late environmental hit is followed by the production quiet beat.
  const target=nextgenStage(0);target.pressureAttackCount=6;prepareAlienAttack(target,true);
  const seal=bossHazards.find(h=>h.kind==="pressureSeal"),u=bossHazards.find(h=>h.kind==="ultimate");
  const lateAt=u.warning+u.duration-1/60;
  for(const h of bossHazards)h.age=lateAt;
  target.pressureState.age=lateAt;target.phase="attack";target.phaseTime=lateAt-target.telegraphDuration;
  shield.charges=shield.remaining=0;damagePlayer("fixture late graze",u);
  const afterGraze=player.lives;
  player.y=player.previousY=flightBounds.top;
  for(let i=0;i<90&&boss;i++){updateBossEncounter(1/60);updateBossDamage();}
  const lateGrace={afterGraze,afterSeal:player.lives,events:target.pressureLog};
  const guardTarget=nextgenStage(0,{charges:1});guardTarget.pressureAttackCount=6;prepareAlienAttack(guardTarget,true);
  const guardSeal=bossHazards.find(h=>h.kind==="pressureSeal");
  requestShield();const before=player.lives;guardSeal.age=guardSeal.warning+.01;updateBossDamage();
  const environmentGuard={charges:shield.charges,damage:before-player.lives,perfect:shield.perfectUsed};
  nextgenStage(0,{charges:1});enemyProjectiles.push({x:player.x,y:player.y,previousX:player.x,previousY:player.y,radius:5,vx:-200,vy:0});
  requestShield();const ordinaryGuard={charges:shield.charges,perfect:shield.perfectUsed};
  const fusion=nextgenStage(10);fusion.pressureAttackCount=6;prepareAlienAttack(fusion,true);
  const fusionUltimate=bossHazards.find(h=>h.kind==="ultimate");
  fusionUltimate.age=fusionUltimate.warning+fusionUltimate.duration*.8;
  const burst=fusionUltimate.nodes[2],beforeShapes=bossUltimateGeometry(fusionUltimate).rects.length;
  for(let i=0;i<burst.maxHealth;i++)interceptAlienRound({x:burst.x,y:burst.y,previousX:burst.x-20,previousY:burst.y,halfHeight:3});
  const fusionApparatus={beforeShapes,afterShapes:bossUltimateGeometry(fusionUltimate).rects.length,health:burst.health};
  showScreen("menu");return {results,lateGrace,environmentGuard,ordinaryGuard,fusionApparatus};
}
function nextgenComboContracts() {
  const results=[];
  for(let type=0;type<11;type++)for(const enraged of [false,true])for(const variant of [0,1]){
    const target=nextgenStage(type,{enraged,variant});prepareAlienAttack(target,false);
    const record=target.comboLog.at(-1);
    const snapshots=bossHazards.map(h=>({kind:h.kind,stage:h.comboStage,warning:h.warning,tell:h.tellAt??0,duration:h.duration,
      x:h.x,y:h.y,gapY:h.gapY,originX:h.originX,originY:h.originY,endX:h.endX,endY:h.endY,nodes:h.nodes?.length??0}));
    const before=JSON.stringify(snapshots.map(({x,y,gapY,originX,originY,endX,endY})=>({x,y,gapY,originX,originY,endX,endY})));
    player.x=flightBounds.left;player.y=flightBounds.top;updateBossProjectiles(.01);
    const after=JSON.stringify(bossHazards.map(({x,y,gapY,originX,originY,endX,endY})=>({x,y,gapY,originX,originY,endX,endY})));
    let minSafe=Infinity,observedStages=new Set();
    const total=target.telegraphDuration+target.attackDuration;
    // Contact geometry is sampled on a 9x7 grid, without claiming a path proof.
    for(let t=0;t<total;t+=.12){
      let safe=0;
      for(const h of bossHazards){h.age=t;if(t>=h.warning&&t<h.warning+h.duration)observedStages.add(h.comboStage);}
      for(let ix=0;ix<9;ix++)for(let iy=0;iy<7;iy++){
        player.x=player.previousX=flightBounds.left+mechanicRoom().width*ix/8;
        player.y=player.previousY=alienLane(iy/6);
        if(!bossHazards.some(h=>alienHazardHitsPlayer(h)))safe++;
      }
      minSafe=Math.min(minSafe,safe);
    }
    for(const h of bossHazards)h.age=0;
    for(let i=0;i<500;i++){updateBossPressure(target,1/60);updateBossProjectiles(1/60);}
    results.push({boss:type+1,enraged,variant,stages:[...observedStages],snapshots,record,
      fixedLocks:before===after,minSafeGridPoints:minSafe,projectiles:bossProjectiles.length});
  }
  const finales=[];
  for(let type=0;type<11;type++){
    const target=nextgenStage(type,{finale:true});updateBossFinale(target,.01);
    const f=target.finale;
    finales.push({boss:type+1,mode:f.mode,nodes:f.nodes.length,gate:!!f.gate,
      stages:[...new Set(f.hazards.map(h=>h.comboStage))],interval:f.attackInterval,
      hazards:f.hazards.map(h=>({type:h.type,warning:h.warning,duration:h.duration,stage:h.comboStage})),
      projectiles:bossProjectiles.length});
  }
  const target=nextgenStage(8,{finale:true});
  target.finale.next=Infinity;
  const lingering=finaleHazard(target,"well",{x:player.x,y:player.y,radius:80,duration:3});
  lingering.age=lingering.warning+.1;
  const before=player.lives;updateBossDamage();bossHitGrace=0;updateBossDamage();
  const oncePerFinaleContact={lost:before-player.lives,consumed:lingering.hitPlayer};
  showScreen("menu");return {results,finales,oncePerFinaleContact};
}
function nextgenMove(avoid) {
  const position=[player.x,player.y,player.previousX,player.previousY];
  const current=alienCurrentVector();
  const speed=player.speed*alienMovementScale()*fighterMovementScale();
  const right=bossPlayerRight(),horizons=[.04,.12,.25,.45,.7,1.0];
  const visible=bossHazards.filter(h=>h.age>=(h.tellAt??0)&&!h.hitPlayer);
  const finale=boss?.finale,finalHazards=finale?.hazards;
  let aimY=boss?.y??alienLane(.5),aimX=viewport.width*.24;
  const lane=visible.find(h=>h.kind==="tide"||h.kind==="band"||h.kind==="pressureSeal"&&!h.fullSeal);
  const finalLane=finalHazards?.find(h=>h.gap&&h.age>=(h.tellAt??0));
  if(lane)aimY=lane.gapY??lane.y;
  if(finalLane)aimY=finalLane.gap.center;
  const risk=(x,y,at,vx,vy)=>{
    player.x=x;player.y=y;player.previousX=x-vx*speed/60;player.previousY=y-vy*speed/60;
    let value=0;
    for(const h of visible){const age=h.age;h.age+=at;try{if(alienHazardHitsPlayer(h))value+=100;}finally{h.age=age;}}
    if(finale){finale.hazards=finalHazards.filter(h=>h.age>=(h.tellAt??0)).map(h=>({...h,age:h.age+at,previousAge:h.age+at-1/60}));
      try{if(bossFinaleHitsPlayer(boss))value+=100;}finally{finale.hazards=finalHazards;}}
    return value;
  };
  let best=null;
  try{
    for(const [dx,dy] of avoid?balancePolicyDirections:[[0,0]]){
      const len=Math.hypot(dx,dy)||1,vx=dx/len,vy=dy/len;
      let danger=0;
      for(const at of horizons){const x=clamp(position[0]+(vx*speed+current.x)*at,flightBounds.left,right),y=clamp(position[1]+(vy*speed+current.y)*at,flightBounds.top,flightBounds.bottom);
        danger+=risk(x,y,at,vx,vy)*(1.5-at);}
      const x=position[0]+vx*speed*.2,y=position[1]+vy*speed*.2;
      const cost=danger+Math.abs(y-aimY)*.055+Math.abs(x-aimX)*.015+((dx||dy)? .3:0);
      if(!best||cost<best.cost)best={dx,dy,vx,vy,cost};
    }
    const imminent=horizons.slice(0,2).some(at=>risk(clamp(position[0]+(best.vx*speed+current.x)*at,flightBounds.left,right),
      clamp(position[1]+(best.vy*speed+current.y)*at,flightBounds.top,flightBounds.bottom),at,best.vx,best.vy)>0);
    [player.x,player.y,player.previousX,player.previousY]=position;
    balanceMove(best.dx,best.dy);
    if(imminent&&shield.charges>0&&!shieldIsActive()&&bossHitGrace<=.02)balanceTap("KeyV");
  }finally{[player.x,player.y,player.previousX,player.previousY]=position;}
}
function nextgenRehearsal(type,finale,avoid,seconds=36) {
  const target=nextgenStage(type,{finale,charges:2});
  if(!finale)prepareAlienAttack(target,false);
  const starting=player.lives;let maxProjectiles=0,shields=0,moved=0;
  for(let frame=0;frame<seconds*60&&isBattleActive();frame++){
    if(frame%4===0){const charges=shield.charges;nextgenMove(avoid);if(charges>shield.charges)shields++;}
    const x=player.x,y=player.y;shotCooldown=Infinity;
    window.__balanceClock.tick(1/60);
    moved+=Math.hypot(player.x-x,player.y-y);
    maxProjectiles=Math.max(maxProjectiles,bossProjectiles.length);
  }
  const result={boss:type+1,phase:finale?"finale":"body",policy:avoid?"visible-tell-moving-V":"stationary-V",seconds:battleTime,
    livesLost:starting-player.lives,livesRemaining:player.lives,shields,moved:Math.round(moved),maxProjectiles,
    combos:finale?target.finale.comboLog?.length??0:target.comboLog?.length??0,seals:target.pressureSequence??0};
  showScreen("menu");return result;
}
