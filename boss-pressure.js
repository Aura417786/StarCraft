"use strict";

// Each short combo has two authored, independently telegraphed contacts.
// Complex arena signatures keep their full choreography between these attacks.
const bossPressureCombos = [
  [
    ["返潮涡心", "Undertow Heart", "wave-vortex", t => tideTell(t, { material:"water", gapY:t.gapY, thick:.40, bend:.22 }),
      t => vortexTell(t, {at:.3,material:"water",x:t.comboAnchor.x,y:t.comboAnchor.y,duration:.35,strength:165,core:.42})],
    ["深压回环", "Pressure Rebound", "vortex-ring", t => vortexTell(t,{material:"water",x:t.lockX,y:t.lockY,duration:.7,strength:155,core:.25}),
      t => ringTell(t,{material:"water",at:.3,x:t.comboAnchor.x,y:t.comboAnchor.y,duration:.35,radius:1.1})],
  ],
  [
    ["骨笼落冠", "Caged Crownfall", "cage-bonefall", t => ribCageTell(t,0,true),
      t => mechanicAt(t,"bonefall",.3,.35,{x:t.comboAnchor.x,y:t.comboAnchor.y,width:player.width*.5,height:player.height*1.5,color:alienSignatureColors.bone,sound:"burst"})],
    ["猎颅穿刺", "Hunting Skewer", "bone-ring-filament", t => ringTell(t,{material:"bone",at:0,x:t.lockX,y:t.lockY,duration:.7,close:true}),
      t => edgeFilament(t,"bone",.3,{y:t.comboAnchor.y,anchorX:t.comboAnchor.x,tilt:-.32,duration:.35,thickness:.4})],
  ],
  [
    ["熔壳回火", "Crust Backdraft", "cover-eruption", t => magmaCoverTell(t),
      t => zoneTell(t,.3,t.comboAnchor.x,t.comboAnchor.y,.56,"magma")],
    ["炉脊爆环", "Furnace Detonation", "furnace-ring", t => edgeFilament(t,"magma",0,{y:t.lockY,tilt:.08,duration:.7,thickness:.55,flare:true}),
      t => ringTell(t,{material:"magma",at:.3,x:t.comboAnchor.x,y:t.comboAnchor.y,duration:.35,radius:1.3})],
  ],
  [
    ["缚网收魂", "Loom Snare", "loom-bind", t => loomTell(t,0,true),
      t => ringTell(t,{material:"silk",at:.3,x:t.comboAnchor.x,y:t.comboAnchor.y,duration:.35,close:true,radius:1.15})],
    ["剪丝合围", "Shearing Cocoon", "silk-cross", t => edgeFilament(t,"silk",0,{y:t.lockY,tilt:.48,duration:.7}),
      t => edgeFilament(t,"silk",.3,{y:t.comboAnchor.y,anchorX:t.comboAnchor.x,flip:true,tilt:-.48,duration:.35,thickness:.35})],
  ],
  [
    ["双钳断层", "Pincer Fault", "pincer-seam", t => pincerTell(t,0,true),
      t => queueAlienHazard(t,"seam",t.telegraphDuration+.3,{x:t.comboAnchor.x,thickness:player.width*.35,duration:.35,color:alienSignatureColors.chitin,sound:"beam"})],
    ["锚核震荡", "Anchor Shock", "anchor-ring", t => vortexTell(t,{material:"chitin",x:t.lockX,y:t.lockY,strength:150,core:.25,duration:.7,spin:0}),
      t => ringTell(t,{material:"chitin",at:.3,x:t.comboAnchor.x,y:t.comboAnchor.y,duration:.35,radius:1.1})],
  ],
  [
    ["折镜夹光", "Reflection Crossfire", "mirror-portals", t => {mirrorShieldTell(t);beamTell(t,0,t.lockY,.7,.36);},
      t => {portalTell(t,t.telegraphDuration+.3,-1,{...t.comboAnchor,radius:14});portalTell(t,t.telegraphDuration+.3,1,{x:t.comboAnchor.x,y:clamp(2*t.lockY-t.comboAnchor.y,alienLane(.08),alienLane(.92)),radius:14});}],
    ["虚像刺镜", "Decoy Refraction", "decoys-beam", t => {mirrorDecoyTell(t,0,true);const h=bossHazards.at(-1);h.thickness*=1.5;for(const n of h.nodes)n.health=n.maxHealth=4;},
      t => beamTell(t,.3,t.comboAnchor.y,.35,.65)],
  ],
  [
    ["尾雷贯流", "Conduit Surge", "conduit-plasma-tide", t => tailConduitTell(t),
      t => tideTell(t,{material:"plasma",at:.3,gapY:t.comboAnchor.y,thick:.35,shift:.06})],
    ["逆电回路", "Countercurrent Arc", "plasma-tide-filament", t => tideTell(t,{material:"plasma",gapY:t.gapY,bend:.24,thick:.35}),
      t => edgeFilament(t,"plasma",.3,{y:t.comboAnchor.y,anchorX:t.comboAnchor.x,flip:true,tilt:.3,duration:.35,thickness:.3})],
  ],
  [
    ["孢巢疫环", "Germination Halo", "nests-pollen-ring", t => sporeNestsTell(t,0,true),
      t => ringTell(t,{material:"spore",at:.3,x:t.comboAnchor.x,y:t.comboAnchor.y,duration:.35,radius:1.2})],
    ["寄生洄游", "Parasitic Undertow", "spore-vortex-tide", t => vortexTell(t,{material:"spore",x:t.lockX,y:t.lockY,strength:108,core:.3,duration:.7}),
      t => tideTell(t,{material:"spore",at:.3,gapY:t.comboAnchor.y,direction:1,thick:.4})],
  ],
  [
    ["折界断星", "Folded Star", "rift-seam", t => riftFoldTell(t,0,true),
      t => queueAlienHazard(t,"seam",t.telegraphDuration+.3,{x:t.comboAnchor.x,thickness:player.width*.30,duration:.35,color:alienSignatureColors.void,sound:"beam"})],
    ["引力吞环", "Singularity Collapse", "void-well-ring", t => vortexTell(t,{material:"void",x:t.lockX,y:t.lockY,strength:170,core:.22,duration:.7,spin:-1}),
      t => ringTell(t,{material:"void",at:.3,x:t.comboAnchor.x,y:t.comboAnchor.y,duration:.35,close:true,radius:1.25})],
  ],
  [
    ["神经回授", "Synaptic Feedback", "relay-nerve-tide", t => {neuralRelayTell(t,0,true);bossHazards.at(-1).thickness*=1.4;},
      t => tideTell(t,{material:"nerve",at:.3,gapY:t.comboAnchor.y,thick:.35,bend:.35})],
    ["记忆错相", "Mnemonic Desync", "nerve-ring-scan", t => ringTell(t,{material:"nerve",at:0,x:t.lockX,y:t.lockY,duration:.7,close:true}),
      t => edgeFilament(t,"nerve",.3,{y:t.comboAnchor.y,anchorX:t.comboAnchor.x,tilt:.18,duration:.35,thickness:.4,flip:true})],
  ],
];

function buildBossPressureCombo(target) {
  const ordinal = target.pressureComboIndex = (target.pressureComboIndex ?? -1) + 1;
  const [cn,en,key,first,second] = bossPressureCombos[target.type][ordinal % 2];
  const id = target.type + ":" + ordinal + ":" + key;
  const begin = bossHazards.length;
  first(target);
  const firstHazards = bossHazards.slice(begin);
  const primary = firstHazards[0];
  target.comboAnchor = {x:primary.x ?? target.lockX, y:primary.gapY ?? primary.y ?? target.gapY};
  if(primary.kind==="magmaCover")target.comboAnchor.x=primary.x-player.width;
  if(primary.kind==="mirrorShield")target.comboAnchor={x:target.lockX,y:target.gapY};
  const split = bossHazards.length;
  second(target);
  const secondHazards = bossHazards.slice(split);
  for (const h of firstHazards) {h.comboId=id;h.comboRole="first";}
  const secondaryColors=["#bcefff","#f2dfbc","#ffcc80","#e5baff","#ffc39a","#b8dcff","#c3f4ff","#d6fca2","#edc8ff","#ffd0df"];
  const secondarySounds=["coil","whip","burst","beam","beam","volley","beam","hatch","beam","burst"];
  for (const h of secondHazards) {
    h.comboId=id;h.comboRole="second";h.comboAnchor={...target.comboAnchor};h.duration=Math.min(h.duration,.35);
    h.color=secondaryColors[target.type];h.sound=secondarySounds[target.type];
  }
  const secondStart = Math.min(...secondHazards.map(h=>h.warning));
  // The primary zone stays active while the linked contact begins. This is
  // authored overlap, not a cancelled follow-up or a late invisible lock.
  for (const h of firstHazards) if(h.warning+h.duration<secondStart+.16) h.duration=secondStart+.16-h.warning;
  const hints=typeof bossComboHints !== "undefined" ? bossComboHints[key] : null;
  target.attackLabel=[cn,en,...(hints??["观察主攻击与连锁预警","Read the main and linked tells"])];
  const record={id,type:target.type,index:ordinal%2,at:battleTime,firstKind:primary.kind,
    secondKind:secondHazards.map(h=>h.kind).join("+"),lockX:target.lockX,lockY:target.lockY,
    gapY:target.gapY,anchor:{...target.comboAnchor},firstWarning:primary.warning,secondWarning:secondStart,
    firstEnd:Math.max(...firstHazards.map(h=>h.warning+h.duration)),secondStart,
    overlap:Math.max(...firstHazards.map(h=>h.warning+h.duration))-secondStart};
  target.attackEndFloor=Math.max(.4,...bossHazards.slice(begin).map(h=>h.warning+h.duration+.12-target.telegraphDuration));
  const log=target.comboLog??=[];if(log.length>=120)log.shift();log.push(record);
  logBossPressure(target,"combo",record);
  return [];
}

const quickAlienPlans = Object.fromEntries(Object.keys(alienPatterns).filter(key=>!key.startsWith("fusion")).map(key=>[key,buildBossPressureCombo]));


function makeBossUltimate(target, warning, noShield) {
  if(target.type>=10)return null;
  const room=mechanicRoom(),color=alienSignatureColors[alienPressurePlans[target.type].material];
  const h={kind:"ultimate",ultimateKind:bossUltimateKinds[target.type],age:0,warning,duration:1.6,
    lockX:target.lockX,lockY:target.lockY,gapY:target.gapY,gapSize:target.gapSize,
    noShield,color,seed:target.pressureSequence,originX:room.right,originY:target.y,
    nodes:[],sound:["surge","burst","surge","coil","burst","beam","beam","hatch","coil","beam"][target.type],
    attackLabel:target.attackLabel};
  const r=Math.max(12,player.height*.29);
  if(target.type===3){
    const cx=clamp(target.lockX+room.width*.16,room.left+room.width*.28,room.right-room.width*.24),cy=clamp(target.lockY,alienLane(.3),alienLane(.7));
    h.nodes=[[-.20,-.26],[.20,-.26],[.20,.26],[-.20,.26]].map(([x,y])=>mechanicNode(cx+x*room.width,cy+y*room.height,r,6,"knot"));
  }else if(target.type===5){
    h.nodes=[[.44,.19],[.84,.5],[.44,.81]].map(([x,y])=>mechanicNode(room.left+x*room.width,alienLane(y),r*1.2,10,"mirror"));
  }else if(target.type===7){
    h.nodes=[[.28,.24],[.61,.18],[.76,.66],[.35,.79]].map(([x,y])=>mechanicNode(room.left+x*room.width,alienLane(y),r*1.6,8,"spore"));
  }else if(target.type===9){
    h.nodes=[[.28,.22],[.55,.77],[.82,.28]].map(([x,y])=>mechanicNode(room.left+x*room.width,alienLane(y),r,7,"neuron"));
  }
  bossHazards.push(h);return h;
}

// This same geometry is consumed by collision, the fixture, and the renderer.
// Shapes have actual volume in the arena; particles never add hidden damage.
function bossUltimateGeometry(h) {
  const room=mechanicRoom(),w=room.width,hg=room.height;
  const p=clamp((h.age-h.warning)/h.duration,0,1),cx=h.lockX,cy=h.lockY;
  const g={rects:[],segments:[],circles:[],safe:[],nodes:h.nodes||[],progress:p};
  const rect=(x,y,width,height)=>{if(width>0&&height>0)g.rects.push({x,y,width,height});};
  const line=(x1,y1,x2,y2,width)=>g.segments.push({x1,y1,x2,y2,width});
  const circle=(x,y,radius,innerRadius=0)=>g.circles.push({x,y,radius,innerRadius});
  const band=(x,width,gap,size)=>{rect(x,room.top,width,Math.max(0,gap-size/2-room.top));rect(x,gap+size/2,width,Math.max(0,room.bottom-gap-size/2));};
  if(h.ultimateKind==="tideWalls") {
    const gap=h.gapY+Math.sin(p*Math.PI*2)*Math.min(h.gapSize*.24,hg*.055);
    const x=viewport.width*(1-p*1.13),thick=Math.max(33,player.width*.58);
    band(x,thick,gap,h.gapSize*.9);
    if(p>.30)band(viewport.width*((p-.30)/.70)-thick,thick*.72,gap,h.gapSize*.9);
    g.safe.push({x:0,y:gap-h.gapSize*.45,width:viewport.width,height:h.gapSize*.9});
  }else if(h.ultimateKind==="boneNova") {
    const ox=room.right,oy=h.originY;
    for(let i=0;i<8;i++){
      const a=Math.PI+(-1.12+i*.32)+Math.sin(p*Math.PI)*.20;
      line(ox,oy,ox+Math.cos(a)*viewport.width*1.2,oy+Math.sin(a)*viewport.width*1.2,Math.max(10,player.height*.23));
    }
    const radius=viewport.width*(.08+p*.9);circle(ox,oy,radius,radius-Math.max(15,player.height*.3));
  }else if(h.ultimateKind==="magmaRift") {
    const rise=Math.sin(p*Math.PI)*hg*.31;
    rect(room.left,room.top,w,rise);rect(room.left,room.bottom-rise,w,rise);
    for(let i=0;i<3;i++){
      const x=room.left+w*(.23+i*.27),r=Math.max(24,player.width*.46)*(Math.sin(p*Math.PI)*.7+.3);
      if(p>.16+i*.13)circle(x,h.gapY+(i%2?1:-1)*hg*.13,r);
    }
  }else if(h.ultimateKind==="silkCage") {
    const nodes=h.nodes;
    for(let i=0;i<nodes.length;i++){
      const a=nodes[i],b=nodes[(i+1)%nodes.length];
      if(a.health>0&&b.health>0)line(a.x,a.y,b.x,b.y,Math.max(8,player.height*.22));
      if(p>.32&&a.health>0)line(a.x,a.y,cx,cy,Math.max(6,player.height*.15));
    }
  }else if(h.ultimateKind==="pincer") {
    const gap=Math.max(player.height*1.15,hg*.19),advance=clamp(p*2.4,0,1);
    const width=w*(.27+advance*.43),left=room.right-width;
    band(left,width,h.gapY,gap);
    if(p>.42)line(room.left,h.gapY,room.right,h.gapY,Math.max(9,player.height*.2));
  }else if(h.ultimateKind==="mirrorArray") {
    for(let i=0;i<h.nodes.length;i++){
      const a=h.nodes[i],b=h.nodes[(i+1)%h.nodes.length];
      if(a.health<=0)continue;
      if(b.health>0)line(a.x,a.y,b.x,b.y,Math.max(7,player.height*.2));
      const sweep=(i%2?1:-1)*Math.sin(p*Math.PI)*hg*.22;
      line(a.x,a.y,room.left,clamp(h.lockY+sweep,room.top,room.bottom),Math.max(20,player.height*.44));
    }
  }else if(h.ultimateKind==="stormRing") {
    const ox=room.left+w*.66,oy=alienLane(.5),radius=Math.max(w,hg)*(.12+p*.64);
    circle(ox,oy,radius,Math.max(0,radius-Math.max(12,player.height*.22)));
    circle(ox,oy,Math.max(28,radius*.64),Math.max(0,radius*.64-11));
    for(let i=0;i<3;i++){const a=p*Math.PI*.70+i*Math.PI*2/3;line(ox,oy,ox+Math.cos(a)*w,oy+Math.sin(a)*w,Math.max(8,player.height*.18));}
  }else if(h.ultimateKind==="sporeBloom") {
    for(let i=0;i<h.nodes.length;i++){
      const n=h.nodes[i];if(n.health<=0)continue;
      const radius=n.radius*(1.1+Math.max(0,p-i*.10)*3.4);
      circle(n.x,n.y,radius,p>.65?radius*.63:0);
    }
  }else if(h.ultimateKind==="voidCollapse") {
    const radius=Math.min(w*.42,hg*.47)*(1-p*.76);
    circle(cx,cy,radius,Math.max(0,radius-Math.max(15,player.height*.35)));
    if(p>.55)circle(cx,cy,Math.min(w*.20,hg*.25)*((p-.55)/.45));
    const a=-.75+p*1.5;line(cx+Math.cos(a)*w,cy+Math.sin(a)*w,cx-Math.cos(a)*w,cy-Math.sin(a)*w,Math.max(8,player.height*.18));
  }else if(h.ultimateKind==="neuralGrid") {
    const index=Math.min(2,Math.floor(p*3));
    for(let i=0;i<h.nodes.length;i++){
      const n=h.nodes[i];if(n.health<=0)continue;
      if(i===index)line(n.x,room.top,n.x,room.bottom,Math.max(14,player.width*.25));
      if(i<=index)line(room.left,n.y,room.right,n.y,Math.max(8,player.height*.18));
    }
  }
  if(h.noShield)g.safe.push({x:0,y:h.gapY-h.gapSize/2,width:viewport.width,height:h.gapSize});
  return g;
}

function bossUltimateHitsPlayer(h) {
  const radius=player.height*.16;
  if(h.noShield&&Math.abs(player.y-h.gapY)<h.gapSize/2-radius)return false;
  const g=bossUltimateGeometry(h);
  return g.rects.some(r=>Math.hypot(player.x-clamp(player.x,r.x,r.x+r.width),player.y-clamp(player.y,r.y,r.y+r.height))<radius)
    || g.segments.some(s=>mechanicDistance(player.x,player.y,s.x1,s.y1,s.x2,s.y2)<s.width/2+radius)
    || g.circles.some(c=>{const d=Math.hypot(player.x-c.x,player.y-c.y);return d<c.radius+radius&&(!(c.innerRadius>0)||d>Math.max(0,c.innerRadius-radius));});
}

function bossUltimateVector(h,pilot) {
  if(h.age<h.warning||h.age>h.warning+h.duration)return {x:0,y:0};
  if(h.ultimateKind==="tideWalls")return {x:-90,y:Math.sin(signatureProgress(h)*Math.PI*2)*50};
  if(h.ultimateKind!=="voidCollapse")return {x:0,y:0};
  const dx=h.lockX-pilot.x,dy=h.lockY-pilot.y,d=Math.hypot(dx,dy)||1;
  const strength=Math.max(0,1-d/Math.max(viewport.width*.6,viewport.height*.7))*160;
  return {x:dx/d*strength,y:dy/d*strength};
}

function logBossPressure(target, event, details = {}) {
  const log = target.pressureLog ??= [];
  if (log.length >= 120) log.shift();
  log.push({ event, at: battleTime, sequence: target.pressureState?.sequence ?? target.pressureSequence ?? 0, ...details });
}

function prepareBossPressureSeal(target) {
  const contacts=target.pressureAttackCount??0;
  const threshold = target.pressureSequence ? (contacts%2 ? 5 : 6) : 6;
  if (contacts < threshold) return false;
  target.pressureAttackCount = 0;
  target.pressureSequence = (target.pressureSequence ?? 0) + 1;
  const noShield = typeof shieldDisabledForSortie === "function" && shieldDisabledForSortie();
  const warning = 1.3 + (typeof sortieWarningBonus === "function" ? sortieWarningBonus() : 0);
  const color = alienPressurePlans[target.type].material;
  const pulseAt = warning + (target.type < 10 ? 1.58 : 0);
  let supplied = false;
  if (!noShield && !shield.charges && shield.remaining < pulseAt + .22) {
    supplied = gainShieldEnergy(evolutionShieldChargeTime()) > 0;
    updateShieldDisplay();
  }
  target.quickAttack = false;
  target.alienAttack = "pressureSeal";
  target.attackMotion = "coil";
  target.telegraphDuration = warning;
  target.attackDuration = target.type < 10 ? 1.8 : .6;
  target.phase = "telegraph";
  target.phaseTime = 0;
  target.attackEvents = [];
  target.nextEvent = 0;
  target.lockX = player.x;
  target.lockY = player.y;
  target.side = player.y < alienLane(.5) ? 1 : -1;
  target.gapY = clamp(player.y, alienLane(.2), alienLane(.8));
  target.gapSize = Math.max(player.height * 2.2, (flightBounds.bottom - flightBounds.top) * .25);
  target.pressureState = { stage: "charge", age: 0, warning, duration: warning + target.attackDuration, armorDuration: 1.9, pulseAt, activeDuration:1.6, ultimateKind:bossUltimateKinds[target.type],
    gapY: target.gapY, gapSize: target.gapSize, fullSeal: !noShield,
    color: alienSignatureColors[color], sequence: target.pressureSequence };
  target.pressureArmor = true;
  const key = typeof controlBindingLabel === "function" ? controlBindingLabel("shield") : "V";
  const cn = noShield ? "封域冲击 · 跟住发光缺口" : "全域封锁 · 冲击前按 " + key + " 开盾" + (supplied ? " · 应急护盾已充能" : "");
  const en = noShield ? "Seal surge · Hold the marked gap" : "Arena seal · Press " + key + " before impact" + (supplied ? " · Emergency shield charged" : "");
  const names=typeof bossUltimateNames !== "undefined" ? bossUltimateNames[target.type]??["封域冲击","Arena Seal"] : ["封域冲击","Arena Seal"];
  target.attackLabel = [names[0], names[1], cn, en];
  bossHazards.length = 0;
  makeBossUltimate(target, warning, noShield);
  addBossHazard("pressureSeal", { warning:pulseAt, duration: .22, color: target.pressureState.color,
    gapY: target.gapY, gapSize: target.gapSize, fullSeal: !noShield, sound: "surge" });
  updateAlienAttackInterval(target);
  setBossMessage(bossStageTitle(target), tr(cn, en));
  gameAudio.bossAttack("coil", target.x, target.y);
  logBossPressure(target, "charge", { warning, pulseAt, armorDuration:target.pressureState.armorDuration, ultimateKind:target.pressureState.ultimateKind, gapY: target.gapY, gapSize: target.gapSize, fullSeal: !noShield, shieldSupplied: supplied, triggerAttackCount: contacts, attackContacts: target.attackContacts ?? 0, comboCycles: target.completedComboCycles ?? 0 });
  return true;
}

function updateBossPressure(target, seconds) {
  if (target.finale || target.phase === "enter" || target.phase === "rupture") {
    target.pressureState = null;
    target.pressureArmor = false;
    return;
  }
  const seal = target.pressureState;
  if (seal) {
    const previous = seal.age;
    seal.age += seconds;
    seal.stage = seal.age < seal.warning ? "charge" : seal.age < seal.pulseAt ? "active" : seal.age < seal.pulseAt + .22 ? "burst" : "afterglow";
    if (previous < seal.pulseAt && seal.age >= seal.pulseAt) {
      gameAudio.bossAttack("surge", target.x, target.y);
      logBossPressure(target, "impact", { x: player.x, y: player.y, fullSeal: seal.fullSeal });
    }
    if (target.pressureArmor && seal.age >= seal.armorDuration) {
      target.pressureArmor = false;
      gameAudio.bossAttack("burst", target.x, target.y);
      logBossPressure(target, "armor-break");
    }
    if (seal.age >= seal.duration) target.pressureState = null;
  }
  // The fusion encounter keeps its bespoke limb/corridor contract. It is not
  // one of the ten ordinary bosses receiving the ambient lattice.
  if (target.type === finalAlienType) return;
  // A slow, deterministic lattice persists between attacks. Its gap is shared
  // by every live column, so crossing columns never creates accidental closure.
  target.pressureFireTime = (target.pressureFireTime ?? 0) + seconds;
  const span = flightBounds.bottom - flightBounds.top;
  const gapY = seal?.fullSeal === false ? seal.gapY : alienLane(.5 + Math.sin(target.age * .82 + target.type * .4) * .36);
  const gapSize = seal?.fullSeal === false ? seal.gapSize : Math.max(player.height * .84, span * .11);
  target.pressureGapY = gapY;
  target.pressureGapSize = gapSize;
  for (const shot of bossProjectiles) {
    if (!shot.backgroundPressure) continue;
    const edge = gapY + shot.pressureSide * (gapSize / 2 + 8);
    const boundary = shot.pressureSide < 0 ? flightBounds.top : flightBounds.bottom;
    shot.y = edge + (boundary - edge) * shot.pressureLane;
  }
  const fireInterval = .48 / (typeof sortieRules === "function" ? sortieRules().attackTempo : 1);
  if (target.pressureFireTime < fireInterval) return;
  target.pressureFireTime %= fireInterval;
  const count = Math.round(10 + 3 * Math.max(1, target.scaling?.hpMul ?? 1));
  const activeCount = bossProjectiles.filter(shot => shot.backgroundPressure).length;
  if (activeCount >= 76) return;
  const x = Math.min(viewport.width - 10, target.x + target.width * .25);
  const rows = Math.ceil(count / 2);
  for (const side of [-1, 1]) for (let i = 0; i < rows; i++) {
    const fraction = (i + .5) / rows;
    const edge = gapY + side * (gapSize / 2 + 8);
    const boundary = side < 0 ? flightBounds.top : flightBounds.bottom;
    const y = edge + (boundary - edge) * fraction;
    addBossProjectile(x, y, -Math.max(150, viewport.width * .32), 0,
      { backgroundPressure: true, pressureLane: fraction, pressureSide: side, radius: 5, glyph: "orb",
        color: alienSignatureColors[alienPressurePlans[target.type].material] });
  }
}

function pressureSealHitsPlayer(hazard) {
  return hazard.fullSeal || Math.abs(player.y - hazard.gapY) > hazard.gapSize / 2 - player.height * .16;
}

// Heavy weapons can sever the visible ultimate apparatus as well as bullets.
// A packet touches each node once; node damage does not multiply Boss HP damage.
function damageBossUltimateNodes(shot, missile = false) {
  if(!shot)return;
  for(const hazard of bossHazards){
    if(hazard.kind!=="ultimate")continue;
    for(const node of hazard.nodes){
      if(node.health<=0||shot.ultimateNodeHits?.has(node))continue;
      const hit=missile?roundTouchesMechanic(shot,node.x,node.y,node.radius)
        :ultimateHitsTarget(shot,{x:node.x,y:node.y,width:node.radius*2,height:node.radius*2});
      if(!hit)continue;
      (shot.ultimateNodeHits??=new WeakSet()).add(node);
      node.health=Math.max(0,node.health-(missile?2:Number.isInteger(shot.waveIndex)?2:6));
      if(!node.health){combatBurst(node.x,node.y,.55,hazard.color);gameAudio.bossAttack("burst",node.x,node.y);}
    }
  }
}
