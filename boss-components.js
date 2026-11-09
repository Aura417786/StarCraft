"use strict";

// 可拆武器是舰体的一部分。其耐久不额外增加 Boss 总生命，毁伤只结算一次。
const bossComponentRules = { durability: 0.13, hullTransfer: 0.8, maxWrecks: 10 };
const bossComponentLayouts = [
  { x: -0.17, y: 0.29, width: 0.35, height: 0.23, turretX: -0.13, turretY: 0.28, shape: "cannon", labels: ["星弧炮组", "扫射炮组"], enLabels: ["Arc Guns", "Sweep Guns"] },
  { x: -0.23, y: 0.30, width: 0.35, height: 0.23, turretX: -0.17, turretY: 0.30, shape: "fork", labels: ["追瞄炮组", "焚烧阵列"], enLabels: ["Tracking Guns", "Scorch Array"] },
  { x: -0.13, y: 0.235, width: 0.31, height: 0.19, turretX: -0.055, turretY: 0.205, shape: "blade", labels: ["电矢发射器", "弹墙阵列"], enLabels: ["Bolt Launcher", "Projectile Wall Array"] },
  { x: -0.12, y: 0.29, width: 0.34, height: 0.235, turretX: -0.31, turretY: 0.145, shape: "hive", labels: ["追猎蜂巢", "旋涡发生器"], enLabels: ["Hunter Hive", "Vortex Generator"] },
  { x: -0.17, y: 0.31, width: 0.35, height: 0.235, turretX: -0.13, turretY: 0.31, shape: "siege", labels: ["重炮炮组", "弹幕发生器"], enLabels: ["Heavy Guns", "Barrage Generator"] },
];
const bossComponentWrecks = [];
function ensureBossComponents(target) {
  if (!target) return [];
  if (!target.components) {
    const layout = bossComponentLayouts[target.type] || bossComponentLayouts[0];
    target.components = [-1, 1].map((side, index) => ({ side, index, name: tr(layout.labels[index], layout.enLabels[index]),
      hp: bossComponentRules.durability, maxHp: bossComponentRules.durability,
      destroyed: false, hitFlash: 0, recoil: 0, damagedAge: 0 }));
  }
  return target.components;
}
function bossWeaponOnline(target, side) {
  const part = ensureBossComponents(target).find(item => item.side === (side < 0 ? -1 : 1));
  return !!part && !part.destroyed;
}
function bossComponentBounds(target, component) {
  const layout = bossComponentLayouts[target.type] || bossComponentLayouts[0];
  return { x: target.x + layout.x * target.width, y: target.y + component.side * layout.y * target.height,
    previousX: (target.previousX ?? target.x) + layout.x * target.width,
    previousY: (target.previousY ?? target.y) + component.side * layout.y * target.height,
    width: target.width * layout.width, height: target.height * layout.height };
}
function projectileBossHit(bullet, target) {
  if (!bossCanTakeDamage(target)) return null;
  // 主脊与两侧炮舱使用各自的扫掠路径；空白翼间不再有整块矩形空气墙。
  const hull = { ...target, width: target.width * 1.16, height: target.height * 0.34 };
  let time = projectileEnemyEntry(bullet, hull);
  let hit = Number.isFinite(time) ? { time, component: null } : null;
  for (const part of ensureBossComponents(target)) {
    const bounds = bossComponentBounds(target, part);
    // projectileEnemyEntry 内部缩放为 0.45/0.4；还原出实际炮舱的可见尺寸。
    time = projectileEnemyEntry(bullet, { ...bounds, width: bounds.width / 0.9, height: bounds.height / 0.8 });
    if (Number.isFinite(time) && (!hit || time < hit.time)) hit = { time, component: part.destroyed ? null : part };
  }
  return hit;
}
function resetBossComponents() { bossComponentWrecks.length = 0; }
function damageBossComponent(target, part, damageFraction) {
  if (!part || part.destroyed || !ensureBossComponents(target).includes(part) || !(damageFraction > 0)) return;
  part.hp = Math.max(0, part.hp - damageFraction); part.hitFlash = 0.16; part.recoil = 1;
  if (part.hp > 1e-12) return;
  part.hp = 0; part.destroyed = true;
  const bounds = bossComponentBounds(target, part);
  const layout = bossComponentLayouts[target.type] || bossComponentLayouts[0];
  const quiet = reducedMotion.matches;
  if (bossComponentWrecks.length >= bossComponentRules.maxWrecks) bossComponentWrecks.shift();
  bossComponentWrecks.push({ x: bounds.x, y: bounds.y, vx: quiet ? 0 : -45,
    vy: quiet ? 0 : part.side * 42, width: bounds.width, height: bounds.height,
    side: part.side, type: target.type, color: target.color, shape: layout.shape,
    age: 0, duration: quiet ? 0.35 : 1.6, spin: quiet ? 0 : part.side * 0.7 });
  if (typeof combatBurst === "function") combatBurst(bounds.x, bounds.y, 0.85, "#ffbd79", true);
  if (typeof addCombatShake === "function") addCombatShake(2.4);
  gameAudio.explode(true);
  // 已经飞出的子弹继续飞行，只取消失去发射器后尚未发生的攻击。
  if (!duoEncounter && target === boss && target.attackIndex === part.index) {
    target.phase = "recover"; target.phaseTime = 0;
    for (let i = bossHazards.length - 1; i >= 0; i--) {
      const hazard = bossHazards[i];
      if (hazard.age < hazard.warning) bossHazards.splice(i, 1);
    }
  }
  powerupNotice.textContent = target.name + " · " + part.name + tr("已摧毁", " destroyed");
  powerupNotice.dataset.type = "yellow"; powerupNotice.hidden = false; upgradeNoticeTime = 2.1;
  statusMessage.textContent = powerupNotice.textContent + tr("，对应武器停止工作。", ". Its weapon is offline.");
}
function updateBossComponents(seconds) {
  if (!(seconds >= 0) || !Number.isFinite(seconds)) return;
  for (const target of activeBosses()) for (const part of ensureBossComponents(target)) {
    part.hitFlash = Math.max(0, part.hitFlash - seconds);
    part.recoil *= Math.exp(-seconds * 13);
    if (part.destroyed || part.hp < part.maxHp * 0.45) part.damagedAge += seconds;
  }
  for (let i = bossComponentWrecks.length - 1; i >= 0; i--) {
    const piece = bossComponentWrecks[i]; piece.age += seconds;
    piece.x += piece.vx * seconds; piece.y += piece.vy * seconds;
    if (piece.age >= piece.duration) bossComponentWrecks.splice(i, 1);
  }
}
function drawBossComponentPod(ctx, width, height, type, color, status, quiet = false) {
  const w = width, h = height, shape = bossComponentLayouts[type].shape;
  const opacity = typeof ctx.globalAlpha === "number" ? ctx.globalAlpha : 1;
  const broken = status.destroyed, damaged = broken ? 1 : 1 - status.hp / status.maxHp;
  const path = points => { ctx.beginPath(); points.forEach(([x,y],i) => i ? ctx.lineTo(x*w,y*h) : ctx.moveTo(x*w,y*h)); ctx.closePath(); };
  const plate = [[-.53,-.14],[-.33,-.46],[.26,-.46],[.49,-.23],[.48,.27],[.2,.46],[-.34,.37],[-.53,.12]];
  // 阴影、暗面、顶部装甲的投影分离，底座嵌进舰体、顶盖向屏幕外凸起。
  ctx.save(); ctx.translate(w*.035,h*.17); path(plate);
  ctx.fillStyle = "#01050bcb"; ctx.fill(); ctx.restore();
  path(plate); ctx.fillStyle = "#080d14"; ctx.fill(); ctx.strokeStyle = "#526271"; ctx.lineWidth = 1.1; ctx.stroke();
  if (broken) {
    const socket = ctx.createRadialGradient(-w*.12,-h*.05,0,0,0,w*.47);
    socket.addColorStop(0,"#010207"); socket.addColorStop(.72,"#080d13"); socket.addColorStop(1,"#3b4045");
    path(plate.map(([x,y],i)=>[x*(i%2?.89:.78),y*(i%2?.76:.9)]));ctx.fillStyle=socket;ctx.fill();
    ctx.strokeStyle="#8c7664";ctx.lineWidth=2;
    for(let i=0;i<5;i++){const y=(-.29+i*.13)*h;ctx.beginPath();ctx.moveTo(w*.32,y);ctx.lineTo(w*(.04+(i%2)*.13),y+h*.06);ctx.stroke();}
    ctx.strokeStyle="#ff8b4d";ctx.lineWidth=1.15;ctx.beginPath();ctx.moveTo(-w*.32,-h*.3);ctx.lineTo(-w*.19,-h*.19);ctx.lineTo(-w*.25,h*.02);ctx.stroke();
    ctx.fillStyle="#ffd39a";ctx.beginPath();ctx.ellipse(-w*.19,-h*.19,2,1.2,0,0,Math.PI*2);ctx.fill();
    if(!quiet){
      for(let i=0;i<3;i++){const t=(status.damagedAge*.6+i*.34)%1;ctx.globalAlpha=opacity*(1-t)*.3;ctx.fillStyle="#77818a";ctx.beginPath();ctx.ellipse(w*(.04+t*.28),-h*(.1+t*.5),w*(.04+t*.09),h*(.08+t*.13),-.5,0,Math.PI*2);ctx.fill();}
      ctx.globalAlpha=opacity;
    }
    return;
  }
  const recoil = quiet ? 0 : status.recoil * w * .025;
  ctx.save(); ctx.translate(recoil,-h*.09);
  const metal=ctx.createLinearGradient(-w*.4,-h*.5,w*.3,h*.5);
  metal.addColorStop(0,"#b2c0cb");metal.addColorStop(.13,"#5a6b79");metal.addColorStop(.4,"#303e4d");metal.addColorStop(.63,"#151e29");metal.addColorStop(1,"#070c15");
  path(plate.map(([x,y])=>[x*.88,y*.9]));ctx.fillStyle=metal;ctx.fill();ctx.strokeStyle="#9baab6";ctx.lineWidth=.8;ctx.stroke();
  const crown=ctx.createLinearGradient(0,-h*.36,0,h*.32);crown.addColorStop(0,"#647482");crown.addColorStop(.43,"#303c49");crown.addColorStop(1,"#101923");
  path([[-.26,-.29],[.19,-.3],[.37,-.12],[.27,.23],[-.22,.25],[-.38,.05]]);ctx.fillStyle=crown;ctx.fill();
  ctx.strokeStyle="#02060b";ctx.lineWidth=1.4;ctx.stroke();
  // 蜂巢舱使用凹陷发射孔，其余型号使用有圆形截面的金属炮管。
  if(shape==="hive"){
    for(const [x,y] of [[-.27,-.18],[-.08,-.2],[.12,-.17],[-.23,.12],[-.02,.11],[.18,.09]]){
      const lip=ctx.createRadialGradient(x*w-1,y*h-1,0,x*w,y*h,w*.075);lip.addColorStop(0,"#02070b");lip.addColorStop(.6,"#05090e");lip.addColorStop(.8,"#678579");lip.addColorStop(1,"#101b20");
      ctx.fillStyle=lip;ctx.beginPath();ctx.ellipse(x*w,y*h,w*.065,h*.13,-.2,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=color;ctx.globalAlpha=opacity*.6;ctx.beginPath();ctx.ellipse((x-.018)*w,y*h,w*.018,h*.045,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=opacity;
    }
  }else{
    const lanes=shape==="siege"?[-.2,0,.2]:[-.17,.17];
    for(const y of lanes){
      const start=(shape==="blade"?-.49:-.55)*w, end=w*.06, radius=h*(shape==="siege"?.065:.078);
      const tube=ctx.createLinearGradient(0,y*h-radius,0,y*h+radius);tube.addColorStop(0,"#101a25");tube.addColorStop(.22,"#c2d2dd");tube.addColorStop(.5,"#687b8e");tube.addColorStop(.72,"#29384a");tube.addColorStop(1,"#080e18");
      ctx.fillStyle=tube;ctx.fillRect(start,y*h-radius,end-start,radius*2);
      ctx.strokeStyle="#040a12";ctx.lineWidth=1.2;ctx.strokeRect(start,y*h-radius,end-start,radius*2);
      ctx.fillStyle="#02060b";ctx.beginPath();ctx.ellipse(start,y*h,radius*.65,radius*1.05,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#9aaebd";ctx.lineWidth=.9;ctx.stroke();
      ctx.fillStyle=color;ctx.globalAlpha=opacity*(.9-damaged*.5);ctx.beginPath();ctx.ellipse(start-.5,y*h,radius*.28,radius*.56,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=opacity;
      for(const x of [-.38,-.22]){ctx.strokeStyle="#1b293a";ctx.beginPath();ctx.moveTo(x*w,y*h-radius);ctx.lineTo(x*w,y*h+radius);ctx.stroke();}
    }
  }
  path([[.04,-.22],[.24,-.2],[.31,-.07],[.26,.18],[.02,.2],[-.06,.05]]);ctx.fillStyle=crown;ctx.fill();ctx.strokeStyle="#7c8e9e";ctx.lineWidth=.8;ctx.stroke();
  ctx.strokeStyle=color;ctx.globalAlpha=opacity*(.82-damaged*.5);ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(-w*.27,-h*.31);ctx.lineTo(w*.19,-h*.31);ctx.lineTo(w*.3,-h*.21);ctx.stroke();ctx.globalAlpha=opacity;
  if(damaged>.32){ctx.strokeStyle="#05090f";ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(w*.17,-h*.27);ctx.lineTo(w*.06,-h*.03);ctx.lineTo(w*.2,h*.06);ctx.lineTo(w*.08,h*.26);ctx.stroke();ctx.strokeStyle="#dd743b";ctx.lineWidth=.6;ctx.stroke();}
  if(status.hitFlash>0){ctx.globalAlpha=opacity*Math.min(.4,status.hitFlash*2);path(plate);ctx.fillStyle="#fff1c9";ctx.fill();ctx.globalAlpha=opacity;}
  ctx.restore();
}
function drawBossComponents(ctx, target, quiet = false) {
  if (!target.components) return;
  for (const part of target.components) {
    const box = bossComponentBounds(target,part);
    ctx.save();ctx.translate(box.x,box.y);
    drawBossComponentPod(ctx,box.width,box.height,target.type,target.color,part,quiet);ctx.restore();
  }
}
function drawBossComponentWrecks(ctx, quiet = false) {
  for(const piece of bossComponentWrecks){
    ctx.save();ctx.translate(piece.x,piece.y);ctx.rotate(piece.spin*piece.age);
    ctx.globalAlpha=Math.max(0,1-piece.age/piece.duration);const scale=1-piece.age*.12;ctx.scale(scale,scale);
    if(typeof drawBossSpriteWreck!=="function"||!drawBossSpriteWreck(ctx,piece))
      drawBossComponentPod(ctx,piece.width,piece.height,piece.type,piece.color,{hp:0.04,maxHp:.13,hitFlash:0,recoil:0,damagedAge:piece.age},quiet);
    ctx.restore();
  }
}
