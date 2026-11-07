/* 五艘原创 PBR 舰体：透明精灵、破损状态缓存与同源脱落零件。舰首始终朝左。 */
const bossSpriteSources = [
  { src: "assets/bosses/boss-0.png", crop: [16, 89, 1545, 807] },
  { src: "assets/bosses/boss-1.png", crop: [40, 103, 1513, 786] },
  { src: "assets/bosses/boss-2.png", crop: [34, 74, 1509, 842] },
  { src: "assets/bosses/boss-3.png", crop: [36, 65, 1499, 867] },
  { src: "assets/bosses/boss-4.png", crop: [34, 65, 1518, 861] },
];
const bossSpriteAssets = bossSpriteSources.map(source => {
  const asset = { ...source, image: null, ready: false, failed: false, cache: new Map() };
  if (typeof Image !== "function") return asset;
  const image = new Image(); asset.image = image;
  image.decoding = "async";
  image.onload = () => { asset.ready = image.naturalWidth > 0; asset.failed = !asset.ready; asset.cache.clear(); };
  image.onerror = () => { asset.failed = true; asset.ready = false; asset.cache.clear(); };
  image.src = source.src;
  return asset;
});
function bossSpriteReady(type) { return !!bossSpriteAssets[type]?.ready; }
function bossSpriteCanvas(width, height) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  if (typeof document.createElement !== "function") return null;
  const surface = document.createElement("canvas"); surface.width = width; surface.height = height;
  return surface;
}
function bossSpriteDamagePath(ctx, box) {
  // 沿炮舱机械接缝撕开的轮廓，既切掉前炮管，也露出后方承重机匣。
  const points = [[-.67,-.2],[-.57,-.58],[-.22,-.64],[.03,-.5],[.34,-.58],[.61,-.3],
    [.56,-.08],[.66,.18],[.42,.51],[.12,.6],[-.08,.46],[-.36,.61],[-.64,.31]];
  ctx.beginPath();points.forEach(([x,y],i)=> i ? ctx.lineTo(box.x+x*box.width,box.y+y*box.height)
    : ctx.moveTo(box.x+x*box.width,box.y+y*box.height));ctx.closePath();
}
function bossSpriteSourceRect(asset, target, box) {
  const [sx,sy,sw,sh] = asset.crop;
  return [sx + (box.x-target.x+target.width*.6)/(target.width*1.2)*sw,
    sy + (box.y-target.y+target.height*.52)/(target.height*1.04)*sh,
    box.width/(target.width*1.2)*sw,box.height/(target.height*1.04)*sh];
}
function paintBossSprite(ctx, target, asset, mask) {
  const w=target.width,h=target.height;
  ctx.save();
  // 非零绕组孔洞：破损部件不再保留一层完好的旧炮贴图。
  if(mask){
    ctx.beginPath();ctx.rect(target.x-w*.64,target.y-h*.57,w*1.28,h*1.14);
    for(let i=0;i<2;i++) if(mask&(1<<i)) {
      const box=bossComponentBounds(target,{side:i===0?-1:1});
      const points=[[-.67,-.2],[-.57,-.58],[-.22,-.64],[.03,-.5],[.34,-.58],[.61,-.3],
        [.56,-.08],[.66,.18],[.42,.51],[.12,.6],[-.08,.46],[-.36,.61],[-.64,.31]];
      points.forEach(([x,y],j)=>j?ctx.lineTo(box.x+x*box.width,box.y+y*box.height):ctx.moveTo(box.x+x*box.width,box.y+y*box.height));ctx.closePath();
    }
    ctx.clip("evenodd");
  }
  ctx.drawImage(asset.image,...asset.crop,target.x-w*.6,target.y-h*.52,w*1.2,h*1.04);ctx.restore();
  for(let i=0;i<2;i++) if(mask&(1<<i)) {
    const box=bossComponentBounds(target,{side:i===0?-1:1});
    ctx.save();bossSpriteDamagePath(ctx,box);ctx.clip();
    const cavity=ctx.createRadialGradient(box.x-box.width*.1,box.y,1,box.x,box.y,box.width*.7);
    cavity.addColorStop(0,"#010205");cavity.addColorStop(.6,"#080c10");cavity.addColorStop(1,"#3b3a34");
    ctx.fillStyle=cavity;ctx.fillRect(box.x-box.width,box.y-box.height,box.width*2,box.height*2);
    // 炮管离开后露出后部发动机同源的机匣、金属肋条和管路；纹理占断口约八成。
    // 只把向左敞开的前端压暗，不能把整个模块画成黑色多边形。
    const texture={x:box.x-box.width*.43,y:box.y-box.height*.63,width:box.width*1.12,height:box.height*1.27};
    const sample={x:target.x+target.width*.22,y:target.y-target.height*.21,width:target.width*.30,height:target.height*.42};
    ctx.save();ctx.filter="brightness(0.64) saturate(0.55) contrast(1.08)";
    ctx.drawImage(asset.image,...bossSpriteSourceRect(asset,target,sample),texture.x,texture.y,texture.width,texture.height);ctx.restore();
    const depth=ctx.createLinearGradient(box.x-box.width*.68,box.y,box.x+box.width*.64,box.y);
    depth.addColorStop(0,"#010305ef");depth.addColorStop(.18,"#020508d9");
    depth.addColorStop(.37,"#03070b45");depth.addColorStop(.66,"#080b1008");depth.addColorStop(1,"#12181e20");
    ctx.fillStyle=depth;ctx.fillRect(box.x-box.width*.7,box.y-box.height*.7,box.width*1.4,box.height*1.4);
    ctx.restore();
    // 窄金属撕裂截面跟随原炮舱轮廓，不再用几条直线代替整个内腔。
    bossSpriteDamagePath(ctx,box);ctx.strokeStyle="#10171b";ctx.lineWidth=Math.max(1.4,w*.008);ctx.stroke();
    ctx.save();ctx.translate(-w*.0015,-h*.002);
    bossSpriteDamagePath(ctx,box);ctx.strokeStyle="#6e6b58";ctx.lineWidth=Math.max(.55,w*.0025);ctx.stroke();ctx.restore();
  }
}
function drawBossSprite(ctx, target, reduceMotion = false) {
  const asset=bossSpriteAssets[target.type];
  if(!asset?.ready||!asset.image) return false;
  const mask=(target.components||[]).reduce((bits,part)=>bits|(part.destroyed?(1<<part.index):0),0);
  const ratio=Math.min(2,Math.max(1,typeof window.devicePixelRatio==="number"?window.devicePixelRatio:1));
  const width=Math.ceil(target.width*1.2*ratio),height=Math.ceil(target.height*1.04*ratio),key=width+"x"+height+":"+mask;
  let surface=asset.cache.get(key);
  if(!surface){
    try{
      surface=bossSpriteCanvas(width,height);
      if(surface){
        const painter=surface.getContext("2d");
        paintBossSprite(painter,{...target,x:width/2,y:height/2,width:width/1.2,height:height/1.04},asset,mask);
        if(asset.cache.size>=8) asset.cache.delete(asset.cache.keys().next().value);
        asset.cache.set(key,surface);
      }
    }catch{surface=null;}
  }
  ctx.save();
  if(target.hitFlash>0&&!reduceMotion)ctx.filter="brightness(1.45)";
  if(surface)ctx.drawImage(surface,target.x-target.width*.6,target.y-target.height*.52,target.width*1.2,target.height*1.04);
  else paintBossSprite(ctx,target,asset,mask);
  ctx.restore();
  if(!reduceMotion&&!target.disabled) for(const part of target.components||[]) {
    if(!part.destroyed)continue;
    const box=bossComponentBounds(target,part),age=part.damagedAge||0;
    ctx.save();
    for(let k=0;k<3;k++){
      const t=(age*.6+k*.33)%1;ctx.globalAlpha=(1-t)*.2;
      const x=box.x+box.width*(.03+t*.4),y=box.y-box.height*(.08+t*.8),r=box.width*(.03+t*.12);
      const smoke=ctx.createRadialGradient(x,y,0,x,y,r);smoke.addColorStop(0,"#84817a");smoke.addColorStop(1,"#41433e00");
      ctx.fillStyle=smoke;ctx.beginPath();ctx.ellipse(x,y,r,r*.65,-.45,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  return true;
}
function drawBossSpriteWreck(ctx,piece) {
  const asset=bossSpriteAssets[piece.type];if(!asset?.ready||!asset.image)return false;
  const layout=bossComponentLayouts[piece.type],w=piece.width/layout.width,h=piece.height/layout.height;
  const target={x:0,y:0,width:w,height:h};
  const box={x:layout.x*w,y:piece.side*layout.y*h,width:piece.width,height:piece.height};
  const sourceBox={x:box.x-piece.width*.69,y:box.y-piece.height*.66,width:piece.width*1.38,height:piece.height*1.32};
  ctx.save();
  bossSpriteDamagePath(ctx,{x:0,y:0,width:piece.width,height:piece.height});ctx.clip();
  ctx.drawImage(asset.image,...bossSpriteSourceRect(asset,target,sourceBox),-piece.width*.69,-piece.height*.66,piece.width*1.38,piece.height*1.32);
  ctx.restore();return true;
}
function drawBossShip(ctx, boss, reduceMotion = false) {
  if(!boss||!(boss.width>0)||!(boss.height>0))return;
  if(drawBossSprite(ctx,boss,reduceMotion))return;
  drawBossShipFallback(ctx,boss,reduceMotion);
}
/* 图片缺失或浏览器尚未完成解码时的兼容回退，不作为正常舰体外观。 */
function drawBossShipFallback(ctx, boss, reduceMotion = false) {
  if (!boss || !(boss.width > 0) || !(boss.height > 0)) return;
  const type = ((boss.type || 0) % 5 + 5) % 5;
  const palettes = [
    { glow: "#57caff", pale: "#c9eeff", steel: "#293c51", edge: "#7c97ae" },
    { glow: "#ff4d58", pale: "#ffd2ac", steel: "#482a32", edge: "#ab8588" },
    { glow: "#b677ff", pale: "#e9d5ff", steel: "#362d49", edge: "#9585b0" },
    { glow: "#51eba0", pale: "#c4ffe4", steel: "#253e38", edge: "#81a79b" },
    { glow: "#ffc15a", pale: "#ffebbc", steel: "#453b29", edge: "#b1a07a" }
  ];
  const p = palettes[type], w = boss.width, h = boss.height;
  const rage = !!boss.enraged, glow = rage ? "#ff8b46" : (boss.color || p.glow);
  const coreColor = rage ? "#fff0b7" : p.pale;
  const age = reduceMotion ? 0 : (boss.age || 0);
  const breathe = boss.disabled ? 0.12 : reduceMotion ? 0.86 : 0.86 + Math.sin(age * (rage ? 5 : 2.2)) * 0.07;
  const hit = boss.hitFlash > 0 && !reduceMotion;
  const black = "#070a10", dark = "#101720", steel = p.steel;
  ctx.save(); ctx.translate(boss.x, boss.y); ctx.lineJoin = "round"; ctx.lineCap = "round";
  function path(points) {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)); ctx.closePath();
  }
  function line(points, color = p.edge, width = 0.8) {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h));
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }
  function poly(points, fill, edge = black, thickness = 1) {
    path(points); ctx.fillStyle = fill; ctx.fill();
    if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = thickness; ctx.stroke(); }
  }
  function mirror(points, s) { return points.map(([x, y]) => [x, y * s]); }
  function hex(x, y, rx, ry, rotation = 0) {
    return Array.from({ length: 6 }, (_, i) => {
      const a = i * Math.PI / 3 + rotation; return [x + Math.cos(a) * rx, y + Math.sin(a) * ry];
    });
  }
  function inset(points, factor) {
    const x = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const y = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    return points.map(([px, py]) => [x + (px - x) * factor, y + (py - y) * factor]);
  }
  function armor(points, tone = steel, bright = false) {
    // 真正相连的侧向厚度、顶部粗糙金属和窄边高光，避免扁平贴片感。
    const ys = points.map(point => point[1]);
    const metal = ctx.createLinearGradient(0, Math.min(...ys) * h, w * 0.12, Math.max(...ys) * h);
    metal.addColorStop(0, bright ? p.edge : "#687784"); metal.addColorStop(0.15, tone);
    metal.addColorStop(0.5, bright ? "#3d4651" : "#222a34"); metal.addColorStop(0.55, "#141b24"); metal.addColorStop(1, "#070c13");
    poly(points.map(([x, y]) => [x + 0.005, y + 0.018]), black, "#020408", 2.5);
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const face = [a, b, [b[0] + 0.012, b[1] + 0.035], [a[0] + 0.012, a[1] + 0.035]];
      poly(face, b[0] > a[0] ? "#0b121d" : "#283744", "#070c13", 0.45);
    }
    poly(points, metal, p.edge, 0.85);
    const upper = ctx.createLinearGradient(-w * 0.2, Math.min(...ys) * h, w * 0.2, Math.max(...ys) * h);
    upper.addColorStop(0, bright ? "#637d90" : tone); upper.addColorStop(0.36, tone);
    upper.addColorStop(0.8, "#172330"); upper.addColorStop(1, "#0c1520");
    poly(inset(points, 0.8), upper, "#060b11", 1.1);
    const inner = inset(points, 0.78);
    line(inner.slice(0, Math.max(2, Math.ceil(inner.length / 2))), "#86939e", 0.55);
  }
  function glowLine(points, width = 1.5, color = glow) {
    ctx.save(); ctx.shadowBlur = reduceMotion ? 2 : (rage ? 8 : 5); ctx.shadowColor = color; ctx.globalAlpha = breathe;
    line(points, color, width); ctx.restore();
  }
  function rivet(x, y, size = 1.2) {
    ctx.fillStyle = "#02060b"; ctx.beginPath(); ctx.arc(x * w, y * h, size + 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#a0a7ae"; ctx.beginPath(); ctx.arc(x * w - 0.25, y * h - 0.3, size * 0.55, 0, Math.PI * 2); ctx.fill();
  }
  function vents(x, y, count, s = 1, hot = false) {
    for (let i = 0; i < count; i++) {
      const xx = x + i * 0.02;
      line([[xx, y * s], [xx + 0.01, (y + 0.043) * s]], "#03080d", 3);
      if (hot) glowLine([[xx + 0.003, (y + 0.008) * s], [xx + 0.009, (y + 0.033) * s]], 0.8);
    }
  }
  function engine(x, y, size = 1) {
    const tail = Math.min(0.59, x + (0.095 + (reduceMotion ? 0 : Math.sin(age * 14 + y * 13) * 0.008)) * size);
    const flame = ctx.createLinearGradient(x * w, 0, tail * w, 0);
    flame.addColorStop(0, "#fcf6dc"); flame.addColorStop(0.24, glow); flame.addColorStop(1, "#11182700");
    if (!boss.disabled) poly([[x - 0.01, y - 0.041 * size], [tail, y - 0.004], [tail - 0.014, y], [tail, y + 0.004], [x - 0.01, y + 0.041 * size]], flame, null);
    armor([[x - 0.12, y - 0.061 * size], [x - 0.018, y - 0.05 * size], [x + 0.007, y - 0.03 * size],
      [x + 0.007, y + 0.03 * size], [x - 0.018, y + 0.05 * size], [x - 0.12, y + 0.061 * size]], dark);
    for (let i = 0; i < 3; i++) line([[x - 0.072 + i * 0.017, y - 0.033 * size], [x - 0.072 + i * 0.017, y + 0.033 * size]], "#526170", 1.2);
    glowLine([[x + 0.004, y - 0.027 * size], [x + 0.004, y + 0.027 * size]], 2.4);
  }
  function barrel(x, y, length = 0.13, size = 1) {
    const left = Math.max(-0.59, x - length), half = 0.017 * size;
    poly([[left, y - half], [x, y - half * 1.4], [x + 0.025, y], [x, y + half * 1.4], [left, y + half]], "#1c2530", "#020509", 1.7);
    line([[left + 0.004, y - half], [x - 0.018, y - half]], "#bbc2c7", 1.1);
    line([[left + 0.013, y + half * 0.8], [x, y + half * 0.8]], "#020407", 1.5);
    for (const d of [0.024, 0.047]) line([[left + d, y - half], [left + d, y + half]], "#778089", 0.9);
    poly([[left - 0.005, y - half * 1.25], [left + 0.017, y - half * 1.25], [left + 0.017, y + half * 1.25], [left - 0.005, y + half * 1.25]], black, p.edge, 0.8);
    glowLine([[left - 0.003, y - half * 0.7], [left - 0.003, y + half * 0.7]], 1.4);
  }
  function turret(x, y, size = 1, twin = true) {
    // 主炮舱由可拆部件绘制；其底座与舰体结构共享位置，损毁后不留下完整旧炮。
    if (boss.components && typeof bossComponentLayouts !== "undefined") {
      const layout = bossComponentLayouts[type];
      if (Math.abs(x - layout.turretX) < 0.008 && Math.abs(Math.abs(y) - layout.turretY) < 0.008) return;
    }
    armor(hex(x, y, 0.079 * size, 0.082 * size), dark);
    if (twin) { barrel(x - 0.027 * size, y - 0.027 * size, 0.15 * size, size); barrel(x - 0.027 * size, y + 0.027 * size, 0.15 * size, size); }
    else barrel(x - 0.03 * size, y, 0.18 * size, size * 1.45);
    armor(hex(x + 0.008 * size, y, 0.044 * size, 0.056 * size), steel, true);
    glowLine([[x - 0.008 * size, y - 0.02 * size], [x + 0.024 * size, y - 0.02 * size]], 1.3);
    rivet(x + 0.026 * size, y + 0.027 * size, 1);
  }
  function reactor(x, y, size = 1, sides = 8) {
    const rx = 0.068 * size, ry = 0.09 * size;
    const points = Array.from({ length: sides }, (_, i) => { const a = Math.PI * 2 * i / sides; return [x + Math.cos(a) * rx, y + Math.sin(a) * ry]; });
    armor(inset(points, 1.22), dark); poly(points, "#020709", p.edge, 1.2);
    for (let i = 0; i < sides; i++) {
      const a = Math.PI * 2 * (i + 0.5) / sides;
      line([[x + Math.cos(a) * rx, y + Math.sin(a) * ry], [x + Math.cos(a) * rx * 0.67, y + Math.sin(a) * ry * 0.67]], p.edge, 2.4);
    }
    const field = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, rx * w * 0.78);
    field.addColorStop(0, coreColor); field.addColorStop(0.2, coreColor); field.addColorStop(0.6, glow); field.addColorStop(1, "#06131a");
    ctx.save(); ctx.shadowColor = glow; ctx.shadowBlur = reduceMotion ? 4 : (rage ? 15 : 8); ctx.globalAlpha = breathe;
    poly(inset(points, 0.61), field, glow, 1); ctx.restore();
    line([[x - rx * 0.56, y], [x + rx * 0.56, y]], "#2a3541", 2);
    rivet(x - rx * 0.88, y, 1); rivet(x + rx * 0.88, y, 1);
  }
  function spine(points) { armor(points, "#38434d", true); poly(inset(points, 0.7), "#0c1119", p.edge, 0.6); }

  if (type === 0) {
    // 苍穹霸主：重装双肩、六管舰炮、中央破城舰艏。
    engine(0.47, -0.31, 1.05); engine(0.48, 0, 1.22); engine(0.47, 0.31, 1.05);
    for (const s of [-1, 1]) {
      armor(mirror([[-0.49, 0.35], [-0.31, 0.5], [0.13, 0.48], [0.39, 0.36], [0.4, 0.14], [0.2, 0.08], [-0.19, 0.13]], s), dark);
      armor(mirror([[-0.44, 0.35], [-0.29, 0.44], [-0.02, 0.405], [0.24, 0.29], [0.18, 0.15], [-0.19, 0.185]], s), steel, true);
      armor(mirror([[0.06, 0.34], [0.16, 0.43], [0.34, 0.335], [0.32, 0.23]], s), "#242e3c");
      glowLine(mirror([[-0.4, 0.365], [-0.28, 0.415], [-0.1, 0.39]], s), 1.7);
      vents(0.095, 0.27, 5, s, rage); turret(-0.13, s * 0.28, 1.1); turret(0.22, s * 0.385, 0.57, false);
      rivet(-0.31, s * 0.36); rivet(0.27, s * 0.32);
    }
    spine([[-0.59, 0], [-0.35, -0.09], [-0.12, -0.14], [0.33, -0.13], [0.43, 0], [0.33, 0.13], [-0.12, 0.14], [-0.35, 0.09]]);
    armor([[-0.48, 0], [-0.19, -0.065], [-0.06, 0], [-0.19, 0.065]], "#667483");
    glowLine([[-0.51, 0], [-0.31, 0], [-0.22, -0.026]], 1.8); reactor(0.095, 0, 1.05);
    for (const s of [-1, 1]) glowLine([[0.2, s * 0.048], [0.35, s * 0.048]], 1.8);
  } else if (type === 1) {
    // 赤焰裁决：獠牙双叉舰艏、红热重炮与黑色反应炉。
    engine(0.47, -0.28, 1.2); engine(0.47, 0.28, 1.2); engine(0.42, 0, 0.85);
    for (const s of [-1, 1]) {
      armor(mirror([[-0.59, 0.265], [-0.4, 0.42], [-0.14, 0.35], [0.22, 0.49], [0.39, 0.43], [0.33, 0.31],
        [0.46, 0.18], [0.29, 0.07], [-0.14, 0.125], [-0.24, 0.215], [-0.39, 0.19]], s), dark);
      armor(mirror([[-0.55, 0.27], [-0.38, 0.35], [-0.17, 0.29], [0.12, 0.37], [0.21, 0.29], [0.25, 0.16], [-0.09, 0.16], [-0.22, 0.25]], s), steel, true);
      armor(mirror([[0.1, 0.31], [0.225, 0.45], [0.33, 0.41], [0.26, 0.26]], s), "#3f3338");
      poly(mirror([[-0.34, 0.2], [-0.25, 0.11], [-0.19, 0.21]], s), "#62707b", black, 1.3);
      poly(mirror([[-0.17, 0.155], [-0.065, 0.075], [-0.065, 0.18]], s), "#475761", black, 1.3);
      glowLine(mirror([[-0.48, 0.28], [-0.3, 0.31], [-0.16, 0.25]], s), 2.1);
      turret(-0.17, s * 0.3, 0.95); vents(0.08, 0.23, 5, s, true); rivet(0.21, s * 0.375); rivet(-0.38, s * 0.29);
    }
    spine([[-0.32, 0], [-0.12, -0.15], [0.29, -0.155], [0.425, 0], [0.29, 0.155], [-0.12, 0.15]]);
    turret(-0.2, 0, 0.82, false); reactor(0.15, 0, 1.23);
    for (const s of [-1, 1]) glowLine([[0.245, s * 0.08], [0.315, s * 0.048]], 2);
  } else if (type === 2) {
    // 紫电幽影：厚刃镰翼、分叉刀尖与狭长穿甲舰艏。
    engine(0.39, -0.19, 0.85); engine(0.39, 0.19, 0.85); engine(0.48, 0, 1.08);
    for (const s of [-1, 1]) {
      armor(mirror([[-0.57, 0.44], [-0.34, 0.355], [-0.13, 0.145], [0.16, 0.11], [0.43, 0.31], [0.42, 0.46],
        [0.3, 0.505], [0.12, 0.43], [-0.055, 0.275], [-0.26, 0.37]], s), dark);
      armor(mirror([[-0.535, 0.429], [-0.295, 0.335], [-0.09, 0.17], [0.115, 0.15], [0.355, 0.32], [0.36, 0.415],
        [0.265, 0.45], [0.135, 0.37], [-0.04, 0.235]], s), steel, true);
      armor(mirror([[-0.39, 0.315], [-0.27, 0.25], [-0.12, 0.06], [0.07, 0.1], [0.035, 0.21], [-0.175, 0.24]], s), "#383344");
      poly(mirror([[-0.27, 0.39], [-0.34, 0.49], [-0.035, 0.28]], s), "#394454", p.edge, 0.9);
      glowLine(mirror([[-0.495, 0.412], [-0.285, 0.334], [-0.085, 0.19], [0.095, 0.173], [0.3, 0.32]], s), 1.8);
      turret(-0.055, s * 0.205, 0.67); vents(0.205, 0.305, 4, s, rage); rivet(0.315, s * 0.385); rivet(-0.13, s * 0.205);
    }
    spine([[-0.59, 0], [-0.29, -0.063], [-0.1, -0.115], [0.23, -0.12], [0.43, 0], [0.23, 0.12], [-0.1, 0.115], [-0.29, 0.063]]);
    poly([[-0.55, 0], [-0.15, -0.035], [-0.055, 0], [-0.15, 0.035]], "#697386", black, 1.2);
    glowLine([[-0.43, 0], [-0.17, 0]], 1.7); reactor(0.1, 0, 0.93, 6);
    armor([[0.2, -0.034], [0.35, 0], [0.2, 0.034]], "#576174");
  } else if (type === 3) {
    // 翡翠蜂后：包覆黑铁装甲、六个发射舱与四门近防炮。
    for (const y of [-0.32, 0, 0.32]) engine(0.47, y, y === 0 ? 1.15 : 0.85);
    armor([[-0.49, -0.14], [-0.33, -0.39], [-0.035, -0.51], [0.285, -0.465], [0.43, -0.29], [0.49, 0],
      [0.43, 0.29], [0.285, 0.465], [-0.035, 0.51], [-0.33, 0.39], [-0.49, 0.14]], dark);
    for (const s of [-1, 1]) {
      armor(mirror([[-0.395, 0.16], [-0.27, 0.335], [-0.02, 0.435], [0.24, 0.4], [0.34, 0.26], [0.22, 0.13], [-0.14, 0.1]], s), steel, true);
      armor(mirror([[-0.27, 0.37], [-0.01, 0.47], [0.23, 0.43], [0.18, 0.355], [-0.005, 0.36]], s), "#2c3639");
      for (const [x, y] of [[-0.165, 0.235], [-0.008, 0.32], [0.17, 0.28]]) {
        const cell = hex(x, y * s, 0.062, 0.075, Math.PI / 6);
        armor(inset(cell, 1.14), "#414c4b"); poly(inset(cell, 0.82), "#030a0b", p.edge, 0.7);
        const inner = inset(cell, 0.6); glowLine(inner.concat([inner[0]]), 1.1);
        for (const offset of [-0.017, 0.017]) {
          ctx.fillStyle = "#697b78"; ctx.beginPath(); ctx.ellipse((x + offset) * w, y * s * h, w * 0.01, h * 0.025, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      turret(-0.31, s * 0.145, 0.61); turret(0.24, s * 0.4, 0.5, false);
      glowLine(mirror([[-0.21, 0.402], [0.0, 0.475], [0.2, 0.435]], s), 1.6); rivet(-0.265, s * 0.325); rivet(0.29, s * 0.31);
    }
    spine([[-0.55, 0], [-0.31, -0.115], [0.22, -0.14], [0.4, 0], [0.22, 0.14], [-0.31, 0.115]]);
    armor([[-0.48, 0], [-0.3, -0.055], [-0.09, 0], [-0.3, 0.055]], "#4c625f"); reactor(0.045, 0, 1.23, 6);
    glowLine([[-0.42, 0], [-0.25, 0]], 1.8); for (const s of [-1, 1]) vents(0.19, 0.035, 5, s, true);
  } else {
    // 熔金堡垒：宽厚矩形堡垒、侧舷炮塔与贯穿全舰的攻城炮。
    for (const y of [-0.325, -0.105, 0.105, 0.325]) engine(0.475, y, 0.82);
    armor([[-0.42, -0.25], [-0.3, -0.465], [0.3, -0.47], [0.465, -0.27], [0.465, 0.27], [0.3, 0.47], [-0.3, 0.465], [-0.42, 0.25]], dark);
    for (const s of [-1, 1]) {
      armor(mirror([[-0.375, 0.185], [-0.265, 0.42], [0.25, 0.425], [0.39, 0.27], [0.265, 0.145]], s), steel, true);
      armor(mirror([[-0.23, 0.275], [-0.145, 0.39], [0.22, 0.36], [0.265, 0.25]], s), "#3b3b37");
      armor(mirror([[-0.315, 0.18], [-0.26, 0.29], [0.295, 0.245], [0.35, 0.15]], s), "#20262b");
      turret(-0.13, s * 0.31, 1.05); turret(0.225, s * 0.26, 0.67, false); vents(-0.005, 0.37, 7, s, true);
      glowLine(mirror([[-0.23, 0.427], [0.185, 0.427], [0.27, 0.38]], s), 1.7);
      for (const x of [-0.28, 0.285]) rivet(x, s * 0.34, 1.5);
    }
    spine([[-0.43, -0.105], [-0.27, -0.165], [0.28, -0.15], [0.4, 0], [0.28, 0.15], [-0.27, 0.165], [-0.43, 0.105]]);
    armor([[-0.58, -0.048], [-0.16, -0.082], [0.14, -0.068], [0.21, 0], [0.14, 0.068], [-0.16, 0.082], [-0.58, 0.048]], "#414a4f", true);
    for (const s of [-1, 1]) { line([[-0.545, s * 0.034], [-0.15, s * 0.06]], "#92968b", 1.5); glowLine([[-0.5, s * 0.023], [-0.105, s * 0.035]], 1.4); }
    for (const x of [-0.48, -0.37, -0.26]) armor([[x - 0.014, -0.057], [x + 0.015, -0.06], [x + 0.015, 0.06], [x - 0.014, 0.057]], "#3d4447");
    poly([[-0.589, -0.048], [-0.55, -0.058], [-0.55, 0.058], [-0.589, 0.048]], "#03080b", p.edge, 1.1);
    glowLine([[-0.584, -0.032], [-0.584, 0.032]], 3.5); reactor(0.205, 0, 0.95);
  }
  // 狂暴热量沿装甲缝隙泄出；光只局限在机体，不遮盖战场。
  if (rage) for (const s of [-1, 1]) {
    glowLine([[0.07, s * 0.105], [0.16, s * 0.135], [0.22, s * 0.1], [0.32, s * 0.14]], 1.7, "#ff763d");
    line([[0.12, s * 0.107], [0.18, s * 0.119]], "#fff0bc", 0.8);
  }
  ctx.restore();
  if (typeof drawBossComponents === "function") drawBossComponents(ctx, boss, reduceMotion);
}
