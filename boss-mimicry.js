"use strict";

// A cast owns its own hazard, apparatus and hit ledger. Only hostile actors
// enter its contact pass; the enemy hazard manager never sees a friendly spell.
let friendlyBossMimic = null;

function clearBossMimic() {
  friendlyBossMimic = null;
}

function startBossMimic(type, rank) {
  if (!isBattleActive() || friendlyBossMimic || !Number.isInteger(type)
      || type < 0 || type >= bossUltimateKinds.length || !Number.isFinite(rank) || rank < 1) return false;
  const room = mechanicRoom();
  let aim = bossCanTakeDamage(boss) ? boss : null;
  if (!aim) {
    let nearest = Infinity;
    for (const enemy of enemies) {
      if (enemy.hp <= 0 || enemy.x < 0 || enemy.x > viewport.width) continue;
      const distance = Math.hypot(enemy.x-player.x, enemy.y-player.y);
      if (distance < nearest) { nearest = distance; aim = enemy; }
    }
  }
  const aimX = clamp(aim?.x ?? viewport.width*.78,0,viewport.width);
  const aimY = clamp(aim?.y ?? player.y,room.top,room.bottom);
  // The enemy versions stage their fight in the pilot's restricted half of
  // the arena. Reproject the cast and its collision as one rigid body.
  const anchorX=[0,0,.77,.58,.73,.84,.84,.58,.58,.58,.68][type];
  const lockX=type<2 ? aimX : room.left+room.width*anchorX;
  const lockY=(type===5 || type===6) ? alienLane(.5) : aimY;
  const dx=type===1 ? player.x-(viewport.width-room.right) : aimX-lockX;
  const dy=aimY-lockY;
  const gapSize = Math.max(player.height*1.55, room.height*.19);
  const away = lockY < room.top+room.height*.5 ? 1 : -1;
  const caster = {
    type, x:player.x+player.width*.75, y:player.y, width:player.width, height:player.height,
    lockX, lockY, gapSize,
    gapY:type===2 ? lockY+room.height*.13
      : clamp(lockY+away*room.height*.31, room.top+gapSize*.5, room.bottom-gapSize*.5),
    pressureSequence:Math.floor(battleTime*60), attackLabel:bossUltimateNames[type], enraged:true
  };
  const h = makeBossUltimate(caster,.72,false,null);
  h.owner="player"; h.duration=2.3;
  h.x=aimX;h.y=aimY;
  const power=evolutionSkillSpec("mimic",rank).power;
  const cast = {
    caster,h,dx,dy,geometry:null,targets:new WeakMap(),pullPoint:{x:0,y:0},arenaW:viewport.width,arenaH:viewport.height,
    damageLog:evolutionBaseDpsLog()+Math.log(power), bossCap:Math.min(.18,.11*power)
  };
  if (type === 7 || type === 9) {
    // Seed one of the distributed spore sacs / neurons at the acquired contact.
    // The other members retain their authored constellation and firing order.
    let best=h.nodes[0];
    for (const node of h.nodes)
      if (Math.hypot(node.x-lockX,node.y-lockY)<Math.hypot(best.x-lockX,best.y-lockY)) best=node;
    best.x=lockX; best.y=lockY;
  }
  NextgenVfx.warmMaterial(h.material);
  caster.x-=dx; caster.y-=dy;
  cast.geometry=mimicGeometry(h);
  friendlyBossMimic=cast;
  playAlienHazardCue(h,"tell",caster);
  return true;
}

function mimicGeometry(h) {
  const g=bossUltimateGeometry(h);
  if (h.ultimateKind==="tideWalls") {
    for (const water of g.rects) water.x=viewport.width-water.x-water.width;
  } else if (h.ultimateKind==="boneNova") {
    // The copied skeleton fires from the player's side of the arena.
    for (const line of g.segments) { line.x1=viewport.width-line.x1; line.x2=viewport.width-line.x2; }
    for (const ring of g.circles) ring.x=viewport.width-ring.x;
  }
  return g;
}

function mimicTouches(g,x,y,radius) {
  for(const a of g.rects)
    if(Math.hypot(x-clamp(x,a.x,a.x+a.width),y-clamp(y,a.y,a.y+a.height))<=radius) return true;
  for(const a of g.segments)
    if(mechanicDistance(x,y,a.x1,a.y1,a.x2,a.y2)<=a.width*.5+radius) return true;
  for(const a of g.circles) {
    const d=Math.hypot(x-a.x,y-a.y);
    if(d<=a.radius+radius && (!a.innerRadius || d+radius>=a.innerRadius)) return true;
  }
  return false;
}

function mimicBossContact(cast,target) {
  const g=cast.geometry,dx=cast.dx,dy=cast.dy;
  if(target.finale) {
    for (const node of target.finale.nodes) {
      if(node.hp<=0) continue;
      const part=finaleNodeGeometry(target,node);
      if(mimicTouches(g,part.x-dx,part.y-dy,part.radius)) return {x:part.x,y:part.y,finaleNode:node.index};
    }
    const core=finaleCoreGeometry(target);
    if(mimicTouches(g,core.x-dx,core.y-dy,Math.min(core.width,core.height)*.42))
      return {x:core.x,y:core.y,finaleNode:-1};
  } else {
    for(const [ox,oy,w,h] of alienBodyRegions[target.type]) {
      const x=target.x+target.width*ox, y=target.y+target.height*oy;
      if(mimicTouches(g,x-dx,y-dy,Math.min(w*target.width,h*target.height)*.5)) return {x,y};
    }
  }
  return null;
}

function strikeWithMimic(cast,target,point,isBoss) {
  let ledger=cast.targets.get(target);
  if (!ledger) { ledger={next:0,spent:0};cast.targets.set(target,ledger); }
  if (cast.h.age<ledger.next || (isBoss && ledger.spent>=cast.bossCap)) return;
  const secondsOfFire=ledger.next===0 ? 1.6 : .64;
  ledger.next=cast.h.age+.32;
  const shot={source:"evolution-mimic",x:point.x,y:point.y,finaleNode:point.finaleNode,
    noEnergy:true,color:cast.h.color,damageLog:cast.damageLog+Math.log(secondsOfFire)};
  if (!isBoss) { applyEnemyHit(target,shot);return; }
  const previous=target.hp, phase=target.finale;
  // Raw log damage is bounded before armor and finale multipliers. The
  // strongest existing vulnerability combination is below this 2.2 factor.
  shot.damageLog=Math.min(shot.damageLog,target.healthLog+Math.log((cast.bossCap-ledger.spent)/2.2));
  applyBossHit(shot,target);
  ledger.spent=phase!==target.finale ? cast.bossCap : ledger.spent+Math.max(0,previous-target.hp);
}

function resizeBossMimic(cast) {
  if(cast.arenaW===viewport.width && cast.arenaH===viewport.height) return;
  const sx=viewport.width/cast.arenaW,sy=viewport.height/cast.arenaH,h=cast.h;
  cast.dx*=sx;cast.dy*=sy;h.x*=sx;h.y*=sy;
  h.lockX*=sx; h.originX*=sx; h.lockY*=sy; h.originY*=sy; h.gapY*=sy; h.gapSize*=sy;
  for(const n of h.nodes) { n.x*=sx; n.y*=sy; n.radius*=Math.min(sx,sy); }
  cast.arenaW=viewport.width;cast.arenaH=viewport.height;
}

function stepBossMimic(dt) {
  const cast=friendlyBossMimic;
  if(!cast || !isBattleActive() || !(dt>0)) return;
  resizeBossMimic(cast);
  const h=cast.h, before=h.age;
  h.age+=dt;
  cast.caster.x=player.x+player.width*.75-cast.dx;
  cast.caster.y=player.y-cast.dy;
  cast.caster.width=player.width;
  cast.caster.height=player.height;
  if(before<h.warning && h.age>=h.warning) playAlienHazardCue(h,"active",cast.caster);
  if(h.age>=h.warning+h.duration) {
    playAlienHazardCue(h,"tail",cast.caster);
    clearBossMimic();
    return;
  }
  cast.geometry=mimicGeometry(h);
  if(h.age<h.warning) return;
  for(let i=enemies.length-1;i>=0;i--) {
    const enemy=enemies[i];
    if(enemy.hp<=0 || enemy.x>viewport.width+enemy.width*.5) continue;
    if(h.ultimateKind==="voidCollapse") {
      cast.pullPoint.x=enemy.x-cast.dx;cast.pullPoint.y=enemy.y-cast.dy;
      const pull=bossUltimateVector(h,cast.pullPoint);
      enemy.x+=pull.x*dt; enemy.y+=pull.y*dt;
    }
    if(!mimicTouches(cast.geometry,enemy.x-cast.dx,enemy.y-cast.dy,Math.min(enemy.width,enemy.height)*.41)) continue;
    strikeWithMimic(cast,enemy,enemy,false);
    if(enemy.hp<=0) defeatEnemy(i);
  }
  for(const target of activeBosses()) {
    if(!bossCanTakeDamage(target)) continue;
    const contact=mimicBossContact(cast,target);
    if(contact) strikeWithMimic(cast,target,contact,true);
  }
}

function drawBossMimic(ctx) {
  const cast=friendlyBossMimic;
  if(!cast) return;
  const {h,geometry,caster}=cast, quiet=quietCombatMotion();
  ctx.save();
  ctx.translate(cast.dx,cast.dy);
  if(h.age<h.warning) drawUltimateChargeIdentity(ctx,caster,h);
  drawBossUltimateGeometry(ctx,h,geometry,caster);
  BossResonance.ultimateImpact(ctx,caster,h,geometry,quiet);
  if(geometry.nodes.length && !bossElementalVfx(caster.type)?.ultimateNodes?.(ctx,h,geometry,quiet)
      && !BossEnergyVfx.drawUltimateNodes(ctx,h,geometry,quiet)) {
    for(const n of geometry.nodes) {
      if(h.ultimateKind==="fusion") BossConfluenceVfx.fusionNode(ctx,n,n.role,quiet?0:h.age,.96,quiet);
      if(h.ultimateKind==="sporeBloom") NextgenVfx.drawSporePod(ctx,n,quiet?0:h.age,.96);
    }
  }
  ctx.restore();
}
