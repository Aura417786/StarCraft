"use strict";

// Each chain commits its geometry at the first tell. The three authored
// stages establish a constraint, intercept its exit, then punish a stale
// position. Node interactions remove real geometry; a clear recovery follows.
const bossPressureCombos = [
  [
    ["返潮深压", "Undertow Reversal", "离开涡心，穿过浪墙，再横移躲开高压水柱", "Leave the well, cross the tide gap, then strafe off the pressure column",
      t => vortexTell(t,{material:"water",x:t.lockX,y:t.lockY,duration:2.25,strength:145,core:.35}),
      t => tideTell(t,{material:"water",gapY:t.gapY,direction:t.enraged?1:-1,thick:.66,bend:.28}),
      t => queueAlienHazard(t,"seam",t.telegraphDuration,{x:t.lockX,thickness:player.width*.48,duration:1.1,material:"water",sound:"surge"})],
    ["潮汐囚涡", "Tidal Undertow", "进浪墙缺口，横移脱离涡心，再换高度避开触须", "Enter the tide gap, strafe out of its well, then change altitude off the tentacle",
      t => tideTell(t,{material:"water",gapY:t.gapY,direction:t.enraged?1:-1,thick:.56,bend:.34}),
      t => vortexTell(t,{material:"water",x:t.lockX,y:t.gapY,duration:1.7,strength:150,core:.34}),
      t => broodLash(t,t.gapY,t.telegraphDuration,t.side,1)],
  ],
  [
    ["骨笼猎冠", "Cage and Crown", "从骨笼两端脱身，避开落骨后离开斜向骨矛", "Exit a rib end, clear the falling crown, then leave the diagonal skewer",
      t => ribCageTell(t,0,t.enraged),
      t => mechanicAt(t,"bonefall",0,1.15,{x:t.lockX,y:t.gapY,width:player.width*.65,height:player.height*1.6}),
      t => edgeFilament(t,"bone",0,{y:t.gapY,anchorX:t.lockX,tilt:-t.side*.38,duration:1.1,thickness:.42})],
    ["猎颅迁笼", "Hunting Reliquary", "冲出合拢骨环，绕过骨笼，再离开起始落点", "Escape the jaw ring, flank the ribs, then clear the original crownfall marker",
      t => ringTell(t,{material:"bone",at:0,x:t.lockX,y:t.lockY,duration:1.8,close:true}),
      t => ribCageTell(t,0,t.enraged),
      t => {bonefallTell(t,0,true);if(t.enraged)ringTell(t,{material:"bone",at:.45,x:t.lockX,y:t.lockY,duration:1.2,radius:.9});}],
  ],
  [
    ["熔壳回火", "Crust Backdraft", "借石脊挡热浪，离开背面喷发，再躲开炉口喷流", "Use the crust shadow, escape its eruption, then clear the furnace plume",
      t => magmaCoverTell(t,0,true),
      t => zoneTell(t,0,t.lockX,t.lockY,.6,"magma"),
      t => t.enraged ? ringTell(t,{material:"magma",at:0,x:t.lockX,y:t.gapY,duration:1.5,radius:1.3})
        : edgeFilament(t,"magma",0,{y:t.gapY,anchorX:t.lockX,tilt:t.side*.12,duration:1.2,thickness:.66,flare:true})],
    ["炉脊升压", "Rising Furnace", "躲开喷流，利用新石脊，最后离开藏身处", "Clear the plume, use the new crust, then abandon its shelter",
      t => edgeFilament(t,"magma",0,{y:t.lockY,tilt:0,duration:1.5,thickness:.64,flare:true}),
      t => magmaCoverTell({...t,lockY:t.gapY},0,true),
      t => zoneTell(t,0,t.lockX,t.gapY,.64,"magma")],
  ],
  [
    ["经纬收魂", "Closing Loom", "割断丝结，冲出收紧的丝环，避开最后的剪线", "Cut a knot, escape the closing ring, then cross away from the final shear",
      t => loomTell(t,0,t.enraged),
      t => ringTell(t,{material:"silk",at:0,x:t.lockX,y:t.lockY,duration:1.85,close:true,radius:1.15}),
      t => edgeFilament(t,"silk",0,{y:t.gapY,anchorX:t.lockX,tilt:-t.side*.56,duration:1.05,thickness:.3,flip:true})],
    ["结丝截径", "Cocoon Interception", "离开黏丝，横穿斜线，射断新丝结避开落点", "Leave the bind, cross the strand, then sever the new knots and clear the marker",
      t => bindTell(t,0,t.lockX,t.lockY,1.9,.64),
      t => edgeFilament(t,"silk",0,{y:t.gapY,anchorX:t.lockX,tilt:t.side*.48,duration:1.4,thickness:.35}),
      t => {loomTell(t,0,t.enraged);zoneTell(t,0,t.lockX,t.gapY,.43,"silk");}],
  ],
  [
    ["双钳断层", "Pincer Fault", "穿过钳口，横移离开断层，再躲开扩张震环", "Cross the jaw gap, strafe off the fault, then skirt the expanding shock ring",
      t => pincerTell(t,0,t.enraged),
      t => queueAlienHazard(t,"seam",t.telegraphDuration,{x:t.lockX,thickness:player.width*.38,duration:1.1}),
      t => ringTell(t,{material:"chitin",at:0,x:t.lockX,y:t.gapY,duration:1.4,radius:1.2})],
    ["锚链绞杀", "Anchor Winch", "挣脱锚点，绕过钳壁，离开钳口高度", "Escape the anchor, flank the jaws, then leave their open altitude",
      t => vortexTell(t,{material:"chitin",x:t.lockX,y:t.lockY,strength:140,core:.3,duration:2.1,spin:0}),
      t => pincerTell(t,0,t.enraged),
      t => edgeFilament(t,"chitin",0,{y:t.gapY,anchorX:t.lockX,tilt:0,duration:1.2,thickness:.42})],
  ],
  [
    ["三镜折光", "Triptych Refraction", "换高度避开镜盾，击碎假影，躲开反向镜光", "Change altitude off the mirror, shatter the decoys, then clear the reverse ray",
      t => {mirrorShieldTell(t);beamTell(t,0,t.lockY,1.1,.38);},
      t => {mirrorDecoyTell({...t,lockY:t.gapY},0,true);if(t.enraged)mirrorShieldTell(t);},
      t => edgeFilament(t,"glass",0,{y:t.gapY,anchorX:t.lockX,flip:true,tilt:t.side*.4,duration:1.05,thickness:.43})],
    ["虚像截光", "Decoy Interception", "打碎汇聚假影，横移躲开镜缝，再换射击角度", "Break the converging decoys, strafe off the mirror seam, then change firing angle",
      t => mirrorDecoyTell(t,0,true),
      t => queueAlienHazard(t,"seam",t.telegraphDuration,{x:t.lockX,thickness:player.width*.31,duration:1.2}),
      t => {mirrorShieldTell(t);edgeFilament(t,"glass",0,{y:t.gapY,anchorX:t.lockX,tilt:-t.side*.33,duration:1.1,thickness:.4});}],
  ],
  [
    ["尾雷贯流", "Conduit Surge", "射断电极或让雷段先过，跟住电潮缺口，再避开电环", "Cut the electrode or let the pulse pass, track the tide gap, then clear the ring",
      t => tailConduitTell(t),
      t => {tideTell(t,{material:"plasma",gapY:t.gapY,thick:.42,shift:t.side*.06});if(t.enraged)tailConduitTell(t,.65,true);},
      t => ringTell(t,{material:"plasma",at:0,x:t.lockX,y:t.gapY,duration:1.45,radius:1.2})],
    ["逆电回路", "Countercurrent", "穿过电潮，射断下侧电极，变向避开回弧", "Cross the current, sever the lower electrode, then turn off the return arc",
      t => tideTell(t,{material:"plasma",gapY:t.gapY,bend:.24,thick:.38}),
      t => tailConduitTell(t,0,true),
      t => edgeFilament(t,"plasma",0,{y:t.gapY,anchorX:t.lockX,flip:true,tilt:t.side*.36,duration:1.1,thickness:.34})],
  ],
  [
    ["孢巢换气", "Germination Front", "打碎孢囊，离开新生菌毯，迎向后方孢浪缺口", "Break the sacs, escape the new bloom, then enter the rear pollen gap",
      t => sporeNestsTell(t,0,t.enraged),
      t => vortexTell(t,{material:"spore",x:t.lockX,y:t.lockY,duration:1.8,strength:0,core:.72,grow:true}),
      t => tideTell(t,{material:"spore",gapY:t.gapY,direction:1,thick:.62,bend:.18})],
    ["寄生回巢", "Parasitic Return", "离开孢粉环，击破新孢囊，避开原地寄生爆发", "Leave the pollen ring, break new sacs, then clear the original infection burst",
      t => ringTell(t,{material:"spore",at:0,x:t.lockX,y:t.lockY,duration:1.6,radius:1.05}),
      t => sporeNestsTell(t,0,t.enraged),
      t => mechanicAt(t,"sporeBlight",0,1.25,{x:t.lockX,y:t.lockY,radius:player.height*.9})],
  ],
  [
    ["折界吞星", "Folded Star", "逆流绕开折界，横移越过裂缝，冲出坍缩环", "Flank against the pull, strafe off the seam, then escape the collapsing ring",
      t => riftFoldTell(t,0,t.enraged),
      t => queueAlienHazard(t,"seam",t.telegraphDuration,{x:t.lockX,thickness:player.width*.34,duration:1.1}),
      t => ringTell(t,{material:"void",at:0,x:t.lockX,y:t.gapY,duration:1.6,close:true,radius:1.3})],
    ["无光回剪", "Lightless Shear", "挣脱引力心，穿过倾斜裂界，离开反向空间切线", "Escape the singularity, cross the folded seams, then leave the reverse spatial cut",
      t => vortexTell(t,{material:"void",x:t.lockX,y:t.lockY,strength:160,core:.32,duration:1.9,spin:-1}),
      t => riftFoldTell({...t,lockY:t.gapY},0,t.enraged),
      t => edgeFilament(t,"void",0,{y:t.gapY,anchorX:t.lockX,flip:true,tilt:-t.side*.6,duration:1.15,thickness:.37})],
  ],
  [
    ["神经回授", "Synaptic Feedback", "按序拆节点，先横移再停稳躲扫描，离开爆发环", "Sever nodes in order, strafe then hold through the scan, and clear the pulse ring",
      t => neuralRelayTell(t,0,t.enraged),
      t => queueAlienHazard(t,"seam",t.telegraphDuration,{x:t.lockX,thickness:player.width*.32,duration:.85}),
      t => ringTell(t,{material:"nerve",at:0,x:t.lockX,y:t.gapY,duration:1.3,radius:1.15})],
    ["记忆错相", "Mnemonic Desync", "先退出神经环，再拆节点，最后离开记忆射线", "Exit the neural ring, sever the circuit, then leave the remembered ray",
      t => ringTell(t,{material:"nerve",at:0,x:t.lockX,y:t.lockY,duration:1.7,close:true}),
      t => neuralRelayTell({...t,lockY:t.gapY},0,false),
      t => beamTell(t,0,t.gapY,1.15,.48)],
  ],
  [
    ["群渊三相", "Confluence Triad", "先拆牵引肢和尖刺肢，沿潮汐缺口移动，再横移避开断层", "Sever siphon and lance limbs, move through the tide gap, then strafe off the fault",
      t => fusionLimbsTell(t,0,t.enraged),
      t => tideTell(t,{material:"fusion",gapY:t.gapY,direction:1,thick:.54,bend:.26}),
      t => queueAlienHazard(t,"seam",t.telegraphDuration,{x:t.lockX,thickness:player.width*.42,duration:1.2})],
    ["合生围猎", "Confluence Hunt", "离开牵引涡，拆除处刑肢，再转入未封锁高度", "Leave the siphon well, sever the execution limbs, then enter the unsealed altitude",
      t => vortexTell(t,{material:"fusion",x:t.lockX,y:t.lockY,strength:140,core:.28,duration:1.9}),
      t => fusionLimbsTell({...t,lockY:t.gapY},0,t.enraged),
      t => {bandTell(t,0,1.25);queueAlienHazard(t,"seam",t.telegraphDuration+.55,{x:t.lockX,thickness:player.width*.26,duration:.7});}],
  ],
];

function buildBossPressureCombo(target) {
  const ordinal = target.pressureComboIndex = (target.pressureComboIndex ?? -1) + 1;
  const previous = target.comboLog?.at(-1);
  const room = mechanicRoom();
  const aggressive = player.x > room.left + room.width * .72;
  // Crossing into close range provokes the trapping opener. A long retreat
  // instead draws the pressure front. Neither decision changes an existing tell.
  const retreating = previous && previous.lockX-player.x>room.width*.18;
  const rushIn = previous && aggressive && !target.lastPressureAdvance;
  const variant = rushIn ? 1 : retreating ? 0 : ordinal % 2;
  target.lastPressureAdvance = aggressive;
  const responseTurn = target.enraged
    ? (target.fractureResponseIndex = (target.fractureResponseIndex ?? -1) + 1) % 2 === 0
    : ordinal % 3 === 1;
  const [cn,en,hint,enHint,...stages] = bossPressureCombos[target.type][variant];
  const material = alienPressurePlans[target.type].material;
  const id = target.type + ":" + ordinal;
  const begin = bossHazards.length;
  const reply = BossResonance.names[target.type];
  target.attackLabel = responseTurn ? [cn + " · " + reply[0], en + " / " + reply[1],
    hint.split("，")[0] + "。第三拍 · " + reply[2],
    enHint.split(",")[0] + ". Third beat · " + reply[3]] : [cn,en,hint,enHint];
  target.attackMotion=["coil","lunge","recoil","sweep","lunge","sweep","sweep","recoil","coil","recoil","coil"][target.type];
  const offsets = target.type===9 ? [0,1.08,3.65] : target.enraged ? [0,1.24,3.32] : [0,1.42,3.65];
  const stageEnds=[];
  for(let stage=0;stage<3;stage++) {
    const start=bossHazards.length;
    if (stage === 2 && responseTurn) {
      const values = BossResonance.cast(target);
      queueAlienHazard(target, "resonance", target.telegraphDuration, values);
    } else stages[stage](target);
    const added=bossHazards.slice(start);
    for(const h of added) {
      h.warning += offsets[stage];
      // Preserve the mechanic's full travel/interaction time. The old .35s
      // truncation made an entire tide cross the screen between reactions.
      if(stage===0 && h.duration>2.8)h.duration=2.8;
      if(h.kind==="zone"||h.kind==="beam"||h.kind==="bonefall")h.duration=Math.max(h.duration,stage===2?1.05:.85);
      h.comboId=id;h.comboStage=stage;h.comboRole=["setup","intercept","punish"][stage];
      h.material??=material;h.color=alienSignatureColors[h.material];
      h.tellAt=Math.max(0,h.warning-(stage===0?target.telegraphDuration:1.5));
      h.attackLabel=target.attackLabel;
      h.lockedAt=battleTime;
    }
    stageEnds.push(Math.max(...added.map(h=>h.warning+h.duration)));
  }
  target.comboAnchor={x:target.lockX,y:target.gapY};
  target.attackEndFloor=Math.max(...stageEnds)+.18-target.telegraphDuration;
  target.attackDuration=target.attackEndFloor;
  const hazards=bossHazards.slice(begin);
  const record={id,type:target.type,index:variant,at:battleTime,stages:3,
    firstKind:hazards.find(h=>h.comboStage===0).kind,
    secondKind:hazards.filter(h=>h.comboStage===1).map(h=>h.kind).join("+"),
    thirdKind:hazards.filter(h=>h.comboStage===2).map(h=>h.kind).join("+"),
    lockX:target.lockX,lockY:target.lockY,gapY:target.gapY,anchor:{...target.comboAnchor},
    stageStarts:offsets.map(at=>at+target.telegraphDuration),stageEnds,
    activeDuration:target.attackDuration};
  const log=target.comboLog??=[];if(log.length>=120)log.shift();log.push(record);
  logBossPressure(target,"combo",record);
  return [];
}

const quickAlienPlans = Object.fromEntries(Object.keys(alienPatterns).map(key=>[key,buildBossPressureCombo]));


function makeBossUltimate(target, warning, noShield) {
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
  if(target.type===10)h.nodes=[
    mechanicNode(room.right,alienLane(.22),r*1.2,7,"siphon"),
    mechanicNode(room.right,alienLane(.78),r*1.2,7,"lance"),
    mechanicNode(room.left+room.width*.68,alienLane(.5),r*1.1,6,"burst")];
  h.material=alienPressurePlans[target.type].material;
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
    const x=viewport.width*(1-p*1.13),thick=Math.max(hg*.12,player.width*.85);
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
  if(h.ultimateKind==="fusion") {
    const [siphon,lance,burst]=h.nodes;
    if(siphon?.health>0)circle(cx,cy,Math.max(22,hg*.20)*(1-p*.45),Math.max(5,hg*.20*(1-p*.45)-14));
    if(lance?.health>0&&p>.25)line(lance.x,lance.y,room.left,h.gapY,Math.max(12,player.height*.28));
    if(burst?.health>0&&p>.62){
      const width=Math.max(24,player.width*.42);
      rect(cx-width/2,room.top,width,Math.max(0,h.gapY-h.gapSize/2-room.top));
      rect(cx-width/2,h.gapY+h.gapSize/2,width,Math.max(0,room.bottom-h.gapY-h.gapSize/2));
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
  const disabled = typeof shieldDisabledForSortie === "function" && shieldDisabledForSortie();
  const warning = 1.4 + (typeof sortieWarningBonus === "function" ? sortieWarningBonus() : 0);
  const color = alienPressurePlans[target.type].material;
  const activeDuration = 2.3;
  // Separate the environmental attack from the seal by a readable breath.
  // A late graze can no longer make the announced seal harmless through grace.
  const pulseAt = warning + activeDuration + bossRules.grace + .12;
  const noShield = disabled || !(shield.charges > 0 || shield.remaining >= pulseAt + .22);
  // Capacity and route are committed when the tell begins; charging/spending
  // a shield later never silently changes an already advertised safe region.
  const supplied = false;
  target.quickAttack = false;
  target.alienAttack = "pressureSeal";
  target.attackMotion = "coil";
  target.telegraphDuration = warning;
  target.attackDuration = pulseAt + .34 - warning;
  target.phase = "telegraph";
  target.phaseTime = 0;
  target.attackEvents = [];
  target.nextEvent = 0;
  target.lockX = player.x;
  target.lockY = player.y;
  target.side = player.y < alienLane(.5) ? 1 : -1;
  const span = flightBounds.bottom - flightBounds.top;
  target.gapSize = Math.max(player.height * 1.55, span * .19);
  const reach = Math.min(span * .25, player.speed * (warning - .25) * .65);
  target.gapY = clamp(player.y + target.side * reach, flightBounds.top + target.gapSize / 2,
    flightBounds.bottom - target.gapSize / 2);
  target.pressureState = { stage: "charge", age: 0, warning, duration: warning + target.attackDuration, armorDuration: warning + .6, pulseAt, activeDuration, ultimateKind:bossUltimateKinds[target.type],
    gapY: target.gapY, gapSize: target.gapSize, fullSeal: !noShield,
    color: alienSignatureColors[color], sequence: target.pressureSequence };
  target.pressureArmor = true;
  const key = typeof controlBindingLabel === "function" ? controlBindingLabel("shield") : "V";
  const cn = noShield ? "封域冲击 · 跟住发光缺口" : "全域封锁 · 冲击前按 " + key + " 开盾";
  const en = noShield ? "Seal surge · Hold the marked gap" : "Arena seal · Press " + key + " before impact";
  const names=typeof bossUltimateNames !== "undefined" ? bossUltimateNames[target.type]??["封域冲击","Arena Seal"] : ["封域冲击","Arena Seal"];
  target.attackLabel = [names[0], names[1], cn, en];
  bossHazards.length = 0;
  const ultimate = makeBossUltimate(target, warning, noShield);
  if (ultimate) ultimate.duration = activeDuration;
  addBossHazard("pressureSeal", { warning:pulseAt, duration: .22, color: target.pressureState.color,
    gapY: target.gapY, gapSize: target.gapSize, fullSeal: !noShield, sound: "surge" });
  updateAlienAttackInterval(target);
  setBossMessage(bossStageTitle(target), tr(cn, en));
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
      logBossPressure(target, "impact", { x: player.x, y: player.y, fullSeal: seal.fullSeal });
    }
    if (target.pressureArmor && seal.age >= seal.armorDuration) {
      target.pressureArmor = false;
      gameAudio.bossAttack("burst", target.x, target.y);
      logBossPressure(target, "armor-break");
    }
    if (seal.age >= seal.duration) target.pressureState = null;
  }
  // Arena pressure comes from the authored combo geometry. No ambient
  // lattice or idle projectile emitter runs during tells, recovery or finales.
}

function pressureSealHitsPlayer(hazard) {
  return hazard.fullSeal || Math.abs(player.y - hazard.gapY) > hazard.gapSize / 2 - player.height * .16;
}

// Heavy weapons can sever the visible ultimate apparatus as well as bullets.
// A packet touches each node once; node damage does not multiply Boss HP damage.
function damageBossUltimateNodes(shot, missile = false) {
  if(!shot)return;
  for(const hazard of bossHazards){
    if(hazard.kind!=="ultimate"||hazard.age<(hazard.tellAt??0))continue;
    for(const node of hazard.nodes){
      if(node.health<=0||shot.ultimateNodeHits?.has(node))continue;
      const hit=missile?roundTouchesMechanic(shot,node.x,node.y,node.radius)
        :ultimateHitsTarget(shot,{x:node.x,y:node.y,width:node.radius*2,height:node.radius*2});
      if(!hit)continue;
      (shot.ultimateNodeHits??=new WeakSet()).add(node);
      node.health=Math.max(0,node.health-(missile?2:Number.isInteger(shot.waveIndex)?2:6));
      if(!node.health){BossResonance.sever(boss,node.x,node.y,node.radius);combatBurst(node.x,node.y,.55,hazard.color);gameAudio.bossAttack("burst",node.x,node.y);}
    }
  }
}
