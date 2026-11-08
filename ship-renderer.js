"use strict";

// 预渲染的立体舰体 + 独立的喷流、受光和侧倾。所有数值只用于绘制。
// tip 为素材机鼻坐标；将它固定到原枪口，侧倾也不会让弹道偏离机头。
const shipRenderSources = {
  crimson: { src: "assets/ships/crimson-sleek.png", crop: [69, 122, 1415, 800], tip: [1482, 494.5],
    engines: [[96, 400], [94, 580]], direction: 1, color: "#b1e7f2" },
  scout: { src: "assets/ships/scout-sleek.png", crop: [39, 102, 1431, 819], tip: [40, 508],
    engines: [[1442, 401], [1443, 587]], direction: -1, color: "#b1e7f2" },
  armored: { src: "assets/ships/armored-sleek.png", crop: [47, 85, 1398, 856], tip: [48, 510],
    engines: [[1415, 388], [1415, 600]], direction: -1, color: "#b1e7f2" },
  gunner: { src: "assets/ships/gunner-sleek.png", crop: [68, 126, 1404, 774], tip: [69, 512.5],
    engines: [[1447, 399], [1447, 577]], direction: -1, color: "#b1e7f2" },
  fairing: { src: "assets/ships/fairing-sleek.png", crop: [52, 118, 2067, 501], tip: [2110, 410],
    engines: [], direction: 1, color: "#b1e7f2" },
  rail: { src: "assets/ships/rail-sleek.png", crop: [40, 361, 1457, 314], tip: [1488, 523],
    engines: [], direction: 1, color: "#b1e7f2" },
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
  const cached = { body };
  if (asset.cache.size >= 6) asset.cache.delete(asset.cache.keys().next().value);
  asset.cache.set(key, cached);
  return cached;
}
function shipRenderGeometry(asset, ship, playerShip) {
  const [sx, sy, sw, sh] = asset.crop;
  const scale = Math.min(ship.width * 0.94 / sw, ship.height * 0.96 / sh);
  const width = sw * scale, height = sh * scale;
  const scaleX = scale, scaleY = scale;
  return { width, height, scaleX, scaleY,
    x: (sx - asset.tip[0]) * scaleX, y: (sy - asset.tip[1]) * scaleY,
    anchorX: ship.x + ship.width * (playerShip ? 0.465 : -0.485), anchorY: ship.y,
    point: ([x, y]) => ({ x: (x - asset.tip[0]) * scaleX, y: (y - asset.tip[1]) * scaleY }) };
}
function drawShipJet(ctx, x, y, direction, length, radius, color, quiet) {
  ctx.save(); ctx.translate(x, y); ctx.scale(direction, 1);
  const flow = ctx.createLinearGradient(0, 0, length, 0);
  flow.addColorStop(0, "#effcffdf"); flow.addColorStop(0.16, color + "c4");
  flow.addColorStop(0.72, color + "38"); flow.addColorStop(1, color + "00");
  ctx.fillStyle = flow;
  ctx.beginPath(); ctx.moveTo(0, -radius);
  ctx.bezierCurveTo(length * 0.38, -radius * 0.9, length * 0.7, -radius * 0.35, length, 0);
  ctx.bezierCurveTo(length * 0.7, radius * 0.35, length * 0.38, radius * 0.9, 0, radius); ctx.fill();
  ctx.fillStyle = "#effcff";
  ctx.beginPath(); ctx.ellipse(radius * 0.45, 0, radius * 0.8, radius * 0.45, 0, 0, Math.PI * 2); ctx.fill();
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
  const fairing = shipRenderAssets.fairing, rail = shipRenderAssets.rail;
  const module = (part, x, y, width) => {
    if (!part.ready) return false;
    const height = width * part.crop[3] / part.crop[2];
    ctx.drawImage(part.image, ...part.crop, x, y - height / 2, width, height);
    return true;
  };
  ctx.save(); ctx.scale(ship.width / 200, ship.height / 136);
  // 此处原点仍是机鼻；所有模块保持在原机鼻之后，枪口对称轴不动。
  ctx.translate(-93, 0);
  for (const side of [-1, 1]) {
    ctx.save(); ctx.scale(1, side);
    if (!foreground && pierce) {
      const span = 24 + pierce * 4;
      ctx.save(); ctx.translate(-19, span); ctx.rotate(0.18 + pierce * 0.06);
      module(fairing, -48, 0, 64 + pierce * 8);
      ctx.restore();
    }
    if (foreground && aegis) {
      const span = 25 + aegis * 4;
      if (!module(fairing, -70, span, 64 + aegis * 5)) shipModulePlate(ctx, -32, span, 54, 13, "#b64a3f");
    }
    if (foreground && blast) {
      const rows = blast === 3 ? [24, 38] : [27 + blast * 2];
      for (const y of rows) {
        const length = 57 + blast * 6;
        if (!module(rail, -32, y, length)) shipModulePlate(ctx, 0, y, length, 9, "#84939f");
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
      let length = ship.width * (playerShip ? 0.16 : 0.14) * throttle * (1 + Math.sin(clock * 32 + engine[1]) * 0.06);
      if (playerShip) length = Math.min(length, Math.max(6, geometry.anchorX + nozzle.x - 8));
      drawShipJet(ctx, nozzle.x, nozzle.y, -asset.direction, length, ship.height * 0.022, asset.color, quiet);
    }
  }
  if (playerShip) drawShipEvolutionModules(ctx, ship, upgrades, asset, quiet, false);
  ctx.save();
  if (ship.disabled) ctx.filter = "brightness(0.55) saturate(0.45)";
  else if (ship.hitFlash > 0 && !quiet) ctx.filter = "brightness(1.25) saturate(0.65)";
  if (cached) ctx.drawImage(cached.body, geometry.x, geometry.y, geometry.width, geometry.height);
  else ctx.drawImage(asset.image, ...asset.crop, geometry.x, geometry.y, geometry.width, geometry.height);
  ctx.restore();
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
    for (const position of [[85, 450], [85, 574]]) {
      const p = geometry.point(position);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 1 + charge * 1.5, 1 + charge * 1.5, 0, 0, Math.PI * 2); ctx.fill();
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
