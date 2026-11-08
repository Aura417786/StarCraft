"use strict";

// 预渲染的立体舰体 + 独立的喷流、受光和侧倾。所有数值只用于绘制。
// tip 为素材机鼻坐标；将它固定到原枪口，侧倾也不会让弹道偏离机头。
const shipRenderSources = {
  crimson: { src: "assets/ships/crimson-pbr.png", crop: [35, 36, 1480, 953], tip: [1506, 481.5],
    engines: [[74, 342], [85, 646]], direction: 1, color: "#ff9946" },
  scout: { src: "assets/ships/scout-pbr.png", crop: [36, 100, 1455, 829], tip: [45, 510],
    engines: [[1470, 395], [1470, 650]], direction: -1, color: "#6ce9ff" },
  armored: { src: "assets/ships/armored-pbr.png", crop: [29, 98, 1471, 831], tip: [38, 511],
    engines: [[1480, 358], [1480, 661]], direction: -1, color: "#ffb65c" },
  gunner: { src: "assets/ships/gunner-pbr.png", crop: [15, 50, 1488, 926], tip: [24, 502],
    engines: [[1480, 350], [1480, 655]], direction: -1, color: "#d991ff" },
  aegisPod: { src: "assets/ships/aegis-pod.png", crop: [44, 279, 1450, 467], tip: [1485, 503],
    engines: [], direction: 1, color: "#e8b878" },
};
const shipRenderAssets = Object.fromEntries(Object.entries(shipRenderSources).map(([kind, source]) => {
  const asset = { ...source, image: null, ready: false, cache: new Map() };
  if (typeof Image === "function") {
    asset.image = new Image(); asset.image.decoding = "async";
    asset.image.onload = () => { asset.ready = asset.image.naturalWidth > 0; asset.cache.clear(); };
    asset.image.onerror = () => { asset.ready = false; asset.cache.clear(); };
    asset.image.src = source.src;
  }
  return [kind, asset];
}));
const shipVisuals = { clock: 0, bank: 0 };
function resetShipVisuals() { shipVisuals.clock = 0; shipVisuals.bank = 0; }
function updateShipVisuals(seconds) {
  if (!isBattleActive() || !Number.isFinite(seconds) || seconds <= 0) return;
  shipVisuals.clock += seconds;
  const velocity = (player.y - (player.previousY ?? player.y)) / (player.speed * seconds);
  const target = reducedMotion.matches ? 0 : clamp(velocity, -1, 1);
  shipVisuals.bank += (target - shipVisuals.bank) * (1 - Math.exp(-seconds * 9));
}
function shipRenderCanvas(width, height) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  if (typeof document.createElement !== "function") return null;
  const surface = document.createElement("canvas"); surface.width = width; surface.height = height;
  return surface;
}
function shipRenderSurface(asset, width, height) {
  const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const pw = Math.max(1, Math.ceil(width * ratio)), ph = Math.max(1, Math.ceil(height * ratio));
  const key = pw + "x" + ph;
  if (asset.cache.has(key)) return asset.cache.get(key);
  const body = shipRenderCanvas(pw, ph);
  if (!body) return null;
  const painter = body.getContext("2d");
  painter.imageSmoothingEnabled = true; painter.imageSmoothingQuality = "high";
  painter.drawImage(asset.image, ...asset.crop, 0, 0, pw, ph);
  const lights = ["#9acfff", "#ffd0a1"].map(color => {
    const surface = shipRenderCanvas(pw, ph), light = surface.getContext("2d");
    light.drawImage(body, 0, 0);
    light.globalCompositeOperation = "source-in";
    const gradient = light.createLinearGradient(0, 0, pw * 0.3, ph);
    gradient.addColorStop(0, color + "9c"); gradient.addColorStop(0.38, color + "25");
    gradient.addColorStop(0.66, color + "00"); gradient.addColorStop(1, color + "49");
    light.fillStyle = gradient; light.fillRect(0, 0, pw, ph);
    return surface;
  });
  const cached = { body, cool: lights[0], warm: lights[1] };
  if (asset.cache.size >= 6) asset.cache.delete(asset.cache.keys().next().value);
  asset.cache.set(key, cached);
  return cached;
}
function shipRenderGeometry(asset, ship, playerShip) {
  const [sx, sy, sw, sh] = asset.crop;
  const width = ship.width * 0.94, height = ship.height * 0.96;
  const scaleX = width / sw, scaleY = height / sh;
  return { width, height, scaleX, scaleY,
    x: (sx - asset.tip[0]) * scaleX, y: (sy - asset.tip[1]) * scaleY,
    anchorX: ship.x + ship.width * (playerShip ? 0.465 : -0.485), anchorY: ship.y,
    point: ([x, y]) => ({ x: (x - asset.tip[0]) * scaleX, y: (y - asset.tip[1]) * scaleY }) };
}
function drawShipJet(ctx, x, y, direction, length, radius, color, quiet) {
  ctx.save(); ctx.translate(x, y); ctx.scale(direction, 1);
  const haze = ctx.createRadialGradient(length * 0.22, 0, 0, length * 0.22, 0, length * 0.7);
  haze.addColorStop(0, color + "38"); haze.addColorStop(1, color + "00");
  ctx.fillStyle = haze; ctx.fillRect(-radius * 2, -radius * 4, length * 1.3, radius * 8);
  const flow = ctx.createLinearGradient(0, 0, length, 0);
  flow.addColorStop(0, "#fff5dfea"); flow.addColorStop(0.16, color + "dc");
  flow.addColorStop(0.65, color + "55"); flow.addColorStop(1, color + "00");
  ctx.fillStyle = flow;
  ctx.beginPath(); ctx.moveTo(0, -radius);
  ctx.bezierCurveTo(length * 0.38, -radius * 0.9, length * 0.7, -radius * 0.35, length, 0);
  ctx.bezierCurveTo(length * 0.7, radius * 0.35, length * 0.38, radius * 0.9, 0, radius); ctx.fill();
  ctx.fillStyle = "#fff4dc";
  ctx.beginPath(); ctx.ellipse(radius * 0.6, 0, radius * 1.8, radius * 0.46, 0, 0, Math.PI * 2); ctx.fill();
  if (!quiet) {
    ctx.globalAlpha *= 0.38; ctx.fillStyle = color;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath(); ctx.ellipse(length * i * 0.18, 0, radius * 0.75, radius * (1 - i * 0.16), 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
function shipModulePlate(ctx, x, y, width, height, color) {
  // 用分离的顶面、厚侧壁与高光倒角表现附加装甲的厚度。
  const shade = ctx.createLinearGradient(x, y - height / 2, x, y + height / 2);
  shade.addColorStop(0, "#d7c8b8"); shade.addColorStop(0.14, color);
  shade.addColorStop(0.58, "#691f2c"); shade.addColorStop(1, "#17202b");
  ctx.fillStyle = "#0a111a";
  ctx.beginPath(); ctx.roundRect(x - width / 2, y - height / 2 + 3, width, height, height * 0.2); ctx.fill();
  ctx.fillStyle = shade;
  ctx.beginPath(); ctx.roundRect(x - width / 2, y - height / 2, width, height - 3, height * 0.18); ctx.fill();
  ctx.strokeStyle = "#c98f76"; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(x - width * 0.4, y - height * 0.36); ctx.lineTo(x + width * 0.35, y - height * 0.36); ctx.stroke();
}
function drawShipEvolutionModules(ctx, ship, upgrades, asset, quiet, foreground) {
  const rank = key => clamp(Number(upgrades?.[key]) || 0, 0, 3);
  const pierce = rank("pierce"), blast = rank("blast"), aegis = rank("aegis");
  if (!(pierce || blast || aegis)) return;
  ctx.save(); ctx.scale(ship.width / 200, ship.height / 136);
  // 此处原点仍是机鼻；所有模块保持在原机鼻之后，枪口对称轴不动。
  ctx.translate(-93, 0);
  for (const side of [-1, 1]) {
    ctx.save(); ctx.scale(1, side);
    if (!foreground && pierce) {
      const span = 30 + pierce * 7;
      ctx.save(); ctx.translate(-10, span); ctx.rotate(-0.10);
      ctx.drawImage(asset.image, 175, 735, 530, 250, -63, -14, 95 + pierce * 7, 30 + pierce * 3);
      ctx.restore();
      // 识别灯嵌在翼根里，不用漂浮的长发光描边代替实体翼刃。
      ctx.fillStyle = "#74b9c7";
      for (let i = 0; i < pierce; i++) ctx.fillRect(-36 + i * 5, span + 4, 2, 1.2);
    }
    if (foreground && aegis) {
      const span = 24 + aegis * 5;
      const pod = shipRenderAssets.aegisPod;
      if (pod.ready) ctx.drawImage(pod.image, ...pod.crop, -73, span - 10, 73 + aegis * 6, 22 + aegis * 3);
      else shipModulePlate(ctx, -27, span + 6, 46 + aegis * 6, 18, "#b64a3f");
    }
    if (foreground && blast) {
      const gun = shipRenderAssets.gunner;
      const rows = blast === 3 ? [24, 38] : [27 + blast * 2];
      for (const y of rows) {
        shipModulePlate(ctx, -25, y, 35, 13, "#a63235");
        const length = 60 + blast * 9;
        if (gun.ready) {
          ctx.save(); ctx.translate(length - 26, y); ctx.scale(-1, 1); ctx.filter = "saturate(0.25)";
          ctx.drawImage(gun.image, 208, 225, 450, 112, 0, -6, length, 12); ctx.restore();
        } else shipModulePlate(ctx, 7, y, length, 9, "#84939f");
        ctx.fillStyle = "#ffb368"; ctx.beginPath(); ctx.ellipse(length - 26, y, 1.2, 2.3, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  ctx.restore();
  }
  ctx.restore();
}
function drawShipPBR(ctx, ship, kind, upgrades = null, quiet = false, time = 0) {
  const asset = shipRenderAssets[kind];
  if (!asset?.ready || !asset.image || !(ship.width > 0 && ship.height > 0)) return false;
  const playerShip = kind === "crimson", geometry = shipRenderGeometry(asset, ship, playerShip);
  const clock = quiet ? 0 : time;
  const bank = quiet || ship.disabled ? 0 : playerShip ? shipVisuals.bank : Math.sin((ship.age ?? clock) * 1.7) * 0.22;
  const cached = shipRenderSurface(asset, geometry.width, geometry.height);
  ctx.save(); ctx.translate(geometry.anchorX, geometry.anchorY);
  ctx.transform(1, 0, bank * 0.09, 1 - Math.abs(bank) * 0.10, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  if (!ship.disabled) {
    const throttle = playerShip && (pressedKeys.has("ArrowRight") || pressedKeys.has("KeyD")) ? 1.22 : 1;
    for (const engine of asset.engines) {
      const nozzle = geometry.point(engine);
      let length = ship.width * (playerShip ? 0.25 : 0.20) * throttle * (1 + Math.sin(clock * 32 + engine[1]) * 0.06);
      if (playerShip) length = Math.min(length, Math.max(6, geometry.anchorX + nozzle.x - 8));
      drawShipJet(ctx, nozzle.x, nozzle.y, -asset.direction, length, ship.height * 0.038, asset.color, quiet);
    }
  }
  if (playerShip) drawShipEvolutionModules(ctx, ship, upgrades, asset, quiet, false);
  ctx.save();
  if (ship.disabled) ctx.filter = "brightness(0.55) saturate(0.45)";
  else if (ship.hitFlash > 0 && !quiet) ctx.filter = "brightness(1.45) saturate(0.65)";
  else if (!playerShip) ctx.filter = "brightness(1.12)";
  if (cached) ctx.drawImage(cached.body, geometry.x, geometry.y, geometry.width, geometry.height);
  else ctx.drawImage(asset.image, ...asset.crop, geometry.x, geometry.y, geometry.width, geometry.height);
  ctx.restore();
  if (cached && !ship.disabled) {
    const sector = typeof battlefieldState !== "undefined" ? battlefieldState.sector : 0;
    const warm = sector === 1 || sector === 2;
    ctx.save(); ctx.globalAlpha *= warm ? 0.13 : 0.11;
    ctx.drawImage(warm ? cached.warm : cached.cool, geometry.x, geometry.y, geometry.width, geometry.height);
    ctx.restore();
    if (playerShip && ((typeof muzzleFlash !== "undefined" && muzzleFlash > 0) || (typeof shieldIsActive === "function" && shieldIsActive()))) {
      ctx.save(); ctx.globalAlpha *= muzzleFlash > 0 ? 0.28 : 0.10;
      ctx.drawImage(cached.warm, geometry.x, geometry.y, geometry.width, geometry.height); ctx.restore();
    }
  }
  if (playerShip) drawShipEvolutionModules(ctx, ship, upgrades, asset, quiet, true);
  if (!playerShip && ship.formationLeader && !ship.disabled) {
    for (const side of [-1, 1]) {
      const x = geometry.x + geometry.width * 0.62, y = geometry.height * 0.28 * side;
      shipModulePlate(ctx, x, y, ship.width * 0.18, ship.height * 0.09, "#c6a15d");
    }
  }
  if (!playerShip && kind === "gunner" && ship.gunPhase === "warning" && !ship.disabled) {
    const charge = clamp(ship.gunTime / enemyCombatRules.warning, 0, 1);
    ctx.save(); ctx.globalAlpha *= 0.3 + charge * 0.6;
    ctx.fillStyle = "#f5b3ff"; ctx.shadowColor = "#db78ff"; ctx.shadowBlur = quiet ? 0 : 9;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(ship.width * 0.12, side * ship.height * 0.255, 1.4 + charge * 2, 2 + charge * 2, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  if (!playerShip && ship.formationDisoriented > 0 && !ship.disabled) {
    ctx.save(); ctx.strokeStyle = "#a7d5ed"; ctx.lineWidth = 1; ctx.globalAlpha *= 0.5;
    ctx.beginPath(); ctx.arc(geometry.width * 0.65, 0, ship.height * 0.22, -0.8, 0.8); ctx.stroke();
    ctx.beginPath(); ctx.arc(geometry.width * 0.65, 0, ship.height * 0.3, 2.2, 3.8); ctx.stroke(); ctx.restore();
  }
  ctx.restore();
  return true;
}
