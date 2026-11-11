"use strict";

const evolutionPreview = { elapsed: 0, lastTime: null, lastPaint: -Infinity, signature: "" };
const evolutionPreviewColors = { ember: "#ff9b69", frost: "#a3efff", rewind: "#c9b0ff" };

function previewPulse(ctx, x, y, length, width, color, angle = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(-length, -width / 2, length, width, width / 2); ctx.fill(); ctx.restore();
}
function previewTarget(ctx, x, y, color) {
  ctx.save(); ctx.translate(x,y); ctx.fillStyle="#162531"; ctx.strokeStyle=color; ctx.lineWidth=1.3;
  ctx.beginPath(); ctx.ellipse(0,0,10,17,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(-3,0,2.5,6,0,0,Math.PI*2);ctx.fill();ctx.restore();
}
function previewBaseShip(ctx, ship, opacity = 1) {
  ctx.save(); ctx.globalAlpha *= opacity;
  if (!drawFighterVariant(ctx,ship,fighterProfile().id,null,true,0)) {
    ctx.fillStyle="#d67a85";ctx.beginPath();ctx.moveTo(ship.x+ship.width*.46,ship.y);
    ctx.lineTo(ship.x-ship.width*.36,ship.y-ship.height*.32);ctx.lineTo(ship.x-ship.width*.2,ship.y);
    ctx.lineTo(ship.x-ship.width*.36,ship.y+ship.height*.32);ctx.closePath();ctx.fill();
  }
  ctx.restore();
}
function previewEmber(ctx, ship, level, time, quiet) {
  const cycle=quiet ? 1.7 : time%2.4, targetX=128, radius=12+Math.min(6,Math.log2(level+1)*2);
  previewTarget(ctx,targetX,ship.y,"#f0a17b");
  const marks=Math.min(8,2+Math.floor(cycle*3));
  for(let i=0;i<marks;i++) {
    const a=i*Math.PI*2/8;
    ctx.fillStyle="#ffae71";ctx.beginPath();ctx.arc(targetX+Math.cos(a)*radius,ship.y+Math.sin(a)*radius*1.12,1.6,0,Math.PI*2);ctx.fill();
  }
  if(cycle<1.72) {
    const flight=(cycle%.30)/.30;
    previewPulse(ctx,ship.x+ship.width*.4+flight*37,ship.y,9,2.2,"#ffb482");
  } else {
    const burst=quiet ? .46 : (cycle-1.72)/.68;
    ctx.globalAlpha*=1-burst*.6;ctx.strokeStyle="#ffd1a2";ctx.lineWidth=2;
    for(let ring=0;ring<2;ring++) {
      ctx.beginPath();ctx.ellipse(targetX,ship.y,8+burst*21+ring*5,10+burst*27+ring*5,0,0,Math.PI*2);ctx.stroke();
    }
    ctx.fillStyle="#fff0d0";ctx.beginPath();ctx.ellipse(targetX,ship.y,4,9,0,0,Math.PI*2);ctx.fill();
  }
}
function previewFrost(ctx, ship, level, time, quiet) {
  const frozen=quiet || time%3.1>.75, strength=Math.min(1.6,1+Math.log2(level)*.12);
  previewTarget(ctx,128,ship.y,frozen?"#b4f4ff":"#ac839a");
  for(let i=0;i<4;i++) {
    const x=frozen?97+i*13:152-((time*.6+i*.22)%1)*70,y=ship.y+(i%2?1:-1)*(10+i*2);
    previewPulse(ctx,x,y,5,2,frozen?"#b6f5ff":"#df9ca6",Math.PI);
    if(frozen) {
      ctx.strokeStyle="#77d3ef70";ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.stroke();
    }
  }
  if(frozen) {
    ctx.strokeStyle="#9beaff";ctx.lineWidth=1;
    for(let i=0;i<6;i++) {
      const a=i*Math.PI/3,x=128+Math.cos(a)*22*strength,y=ship.y+Math.sin(a)*22*strength;
      ctx.beginPath();ctx.moveTo(128,ship.y);ctx.lineTo(x,y);ctx.lineTo(x-Math.cos(a-.7)*6,y-Math.sin(a-.7)*6);ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(a+.7)*6,y-Math.sin(a+.7)*6);ctx.stroke();
    }
  }
  const flight=quiet?.45:time%.4/.4;
  previewPulse(ctx,ship.x+ship.width*.4+flight*35,ship.y,8,2,"#fff0bd");
}
function previewRewind(ctx, ship, level, time, quiet) {
  const p=quiet?.52:(time%2.6)/2.6;
  const path=[{x:47,y:ship.y+12},{x:64,y:ship.y-12},{x:83,y:ship.y}];
  ctx.strokeStyle="#b7a4f86b";ctx.setLineDash([3,3]);ctx.beginPath();
  for(let i=0;i<path.length;i++){if(!i)ctx.moveTo(path[i].x,path[i].y);else ctx.lineTo(path[i].x,path[i].y);}ctx.stroke();ctx.setLineDash([]);
  for(let i=0;i<path.length;i++) previewBaseShip(ctx,{...ship,...path[i],width:ship.width*.62,height:ship.height*.62},.13+i*.13);
  const destination=path[0],current=path[2],back=Math.min(1,p*1.4);
  previewBaseShip(ctx,{...ship,x:current.x+(destination.x-current.x)*back,y:current.y+(destination.y-current.y)*back,width:ship.width*.82,height:ship.height*.82},.9);
  ctx.strokeStyle="#d1b7ff";ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(127,ship.y,15,-.25,Math.PI*1.65);ctx.stroke();
  ctx.beginPath();ctx.moveTo(132,ship.y-15);ctx.lineTo(123,ship.y-17);ctx.lineTo(126,ship.y-9);ctx.stroke();
  ctx.beginPath();ctx.moveTo(127,ship.y);ctx.lineTo(127,ship.y-8);ctx.moveTo(127,ship.y);ctx.lineTo(133,ship.y+4);ctx.stroke();
}
function previewEvolutionMetric(route, level) {
  if(!level)return tr("尚未选择路线","No route selected");
  if(route==="ember")return tr((8+Math.floor(3*Math.log2(level)))+" 层 · 12 秒冷却",(8+Math.floor(3*Math.log2(level)))+" marks · 12s CD");
  if(route==="frost")return tr("冻结 "+(1.8+.9*Math.log2(level)).toFixed(1)+" 秒",(1.8+.9*Math.log2(level)).toFixed(1)+"s freeze");
  return tr("回溯 "+(3+.5*(level-1)).toFixed(1)+" 秒",(3+.5*(level-1)).toFixed(1)+"s recall");
}
function paintEvolutionPreviewPane(ctx, choice, right, time, quiet) {
  const route=Object.hasOwn(evolutionPreviewColors,choice)?choice:null;
  const current=evolution.route===route?Math.max(0,evolution.level||0):0;
  const level=current+Number(right&&!!route),color=evolutionPreviewColors[route]||"#93b5ca";
  ctx.save();ctx.translate(right?160:0,0);ctx.beginPath();ctx.rect(0,0,160,148);ctx.clip();
  const bg=ctx.createLinearGradient(0,0,160,148);bg.addColorStop(0,right?"#1c263e":"#131d2c");bg.addColorStop(1,"#080e19");
  ctx.fillStyle=bg;ctx.fillRect(0,0,160,148);ctx.fillStyle=color;ctx.globalAlpha=right?.6:.2;ctx.fillRect(0,0,160,2);ctx.globalAlpha=1;
  ctx.strokeStyle="#88a8cb16";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(9,71);ctx.lineTo(151,71);ctx.stroke();
  const ship={x:47,y:68,width:73,height:49,visualBank:0};
  if(route!=="rewind"||!level)previewBaseShip(ctx,ship);
  if(level&&route==="ember")previewEmber(ctx,ship,level,time,quiet);
  else if(level&&route==="frost")previewFrost(ctx,ship,level,time,quiet);
  else if(level&&route==="rewind")previewRewind(ctx,ship,level,time,quiet);
  else {previewTarget(ctx,128,ship.y,"#7b8da4");const p=quiet?.48:time%.5/.5;previewPulse(ctx,80+p*40,ship.y,8,2,"#eed1a0");}
  ctx.globalAlpha=1;ctx.fillStyle=right?color:"#9caec2";ctx.font="600 11px system-ui,sans-serif";
  ctx.fillText((right?tr("升级后","Upgraded"):tr("当前","Current"))+" · Lv "+level,10,119,145);
  ctx.fillStyle="#a8b7ca";ctx.font="10px system-ui,sans-serif";ctx.fillText(previewEvolutionMetric(route,level),10,136,145);ctx.restore();
}
function drawEvolutionChoicePreviews(now) {
  if(!evolution.pending){evolutionPreview.elapsed=0;evolutionPreview.lastTime=null;evolutionPreview.lastPaint=-Infinity;evolutionPreview.signature="";return;}
  if(document.hidden||!windowActive||!Number.isFinite(now)){evolutionPreview.lastTime=null;return;}
  const quiet=typeof quietCombatMotion==="function"?quietCombatMotion():reducedMotion.matches;
  if(evolutionPreview.lastTime!==null&&!quiet)evolutionPreview.elapsed+=Math.max(0,Math.min(.05,(now-evolutionPreview.lastTime)/1000));
  evolutionPreview.lastTime=now;
  const signature=[quiet,shipRenderAssets.crimson.ready,evolution.route,evolution.level,gameLanguage,...evolutionCards.map(card=>card.dataset.choice)].join("/");
  if(signature===evolutionPreview.signature&&(quiet||now-evolutionPreview.lastPaint<1000/30))return;
  evolutionPreview.signature=signature;evolutionPreview.lastPaint=now;
  for(const card of evolutionCards){
    const preview=card.querySelector(".evolution-card-preview"),ctx=preview?.getContext?.("2d");if(!ctx)continue;
    ctx.setTransform(preview.width/320,0,0,preview.height/148,0,0);
    paintEvolutionPreviewPane(ctx,card.dataset.choice,false,evolutionPreview.elapsed,quiet);
    paintEvolutionPreviewPane(ctx,card.dataset.choice,true,evolutionPreview.elapsed,quiet);
    ctx.fillStyle="#80a9c43d";ctx.fillRect(159.5,0,1,148);ctx.fillStyle="#cde9f9";ctx.font="600 13px system-ui,sans-serif";
    ctx.textAlign="center";ctx.fillText("›",160,77);ctx.textAlign="start";
  }
}