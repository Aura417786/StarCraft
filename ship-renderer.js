"use strict";

// 预渲染的立体舰体 + 独立的喷流、受光和侧倾。所有数值只用于绘制。
// tip 为素材机鼻坐标；将它固定到原枪口，侧倾也不会让弹道偏离机头。
const shipRenderSources = {
  crimson: { src: "assets/ships/crimson-sleek.webp", atlas: "red", crop: [69, 122, 1415, 800], tip: [1482, 494.5],
    engines: [[96, 400], [94, 580]], direction: 1, color: "#b1e7f2" },
  scout: { src: "assets/ships/scout-sleek.webp", crop: [39, 102, 1431, 819], tip: [40, 508],
    engines: [[1442, 401], [1443, 587]], direction: -1, color: "#b1e7f2" },
  armored: { src: "assets/ships/armored-sleek.webp", crop: [47, 85, 1398, 856], tip: [48, 510],
    engines: [[1415, 388], [1415, 600]], direction: -1, color: "#b1e7f2" },
  gunner: { src: "assets/ships/gunner-sleek.webp", crop: [68, 126, 1404, 774], tip: [69, 512.5],
    engines: [[1447, 399], [1447, 577]], direction: -1, color: "#b1e7f2" },
  fairing: { src: "assets/ships/fairing-sleek.webp", crop: [52, 118, 2067, 501], tip: [2110, 410],
    engines: [], direction: 1, color: "#b1e7f2" },
  rail: { src: "assets/ships/rail-sleek.webp", crop: [40, 361, 1457, 314], tip: [1488, 523],
    engines: [], direction: 1, color: "#b1e7f2" },
};
function createShipRenderAsset(source, eager = true) {
  const asset = { ...source, image: null, ready: false, cache: new Map() };
  if (eager) loadShipRenderAsset(asset);
  return asset;
}
function loadShipRenderAsset(asset) {
  if (!asset || asset.image || typeof Image !== "function") return;
  asset.image = new Image();
  asset.image.decoding = "async";
  asset.image.onload = () => { asset.ready = asset.image.naturalWidth > 0; asset.cache.clear(); };
  asset.image.onerror = () => { asset.ready = false; asset.cache.clear(); };
  asset.image.src = asset.src;
}
const shipRenderAssets = Object.fromEntries(Object.entries(shipRenderSources).map(([kind, source]) =>
  [kind, createShipRenderAsset(source, kind === "crimson")]));
const shipVisuals = { clock: 0, bank: 0 };
const fighterAtlasImages = new Map();
// Rim and canopy glints follow existing highlights on the original crimson texture.
const crimsonReflectionSurfaces = [
  { side: -1, weight: 1, points: [[330, 130], [400, 146], [520, 213], [640, 293], [700, 332]] },
  { side: 1, weight: 1, points: [[325, 882], [400, 841], [520, 758], [640, 670], [740, 614]] },
  { side: 0, weight: 0.55, points: [[703, 384], [777, 366], [871, 369], [963, 392], [1046, 425]] },
];
// Positive values light the lower wing, as with the planet in the first sector.
const shipReflectionLights = {
  orbit: { channels: [82, 179, 255], side: 0.72 },
  belt: { channels: [255, 178, 72], side: -0.7 },
  wreck: { channels: [255, 132, 126], side: -0.3 },
  citadel: { channels: [96, 218, 216], side: 0.6 },
  rift: { channels: [179, 139, 255], side: -0.48 },
};

function shipReflectionLight() {
  const { current, next, blend } = sceneryJourney();
  const from = shipReflectionLights[battlefieldSectors[current].id];
  const to = shipReflectionLights[battlefieldSectors[next].id];
  const mix = (a, b) => a + (b - a) * blend;
  const channels = from.channels.map((value, index) => mix(value, to.channels[index]));
  const side = mix(from.side, to.side);
  const scene = journeyState.scene;
  const cinematic = journeyArtLight(scene);
  if (!cinematic) return { channels: channels.map(Math.round), side };
  const weight = cinematic.amount * (1 - scene.blend);
  return { channels: channels.map((value, index) => Math.round(value + (cinematic.channels[index] - value) * weight)),
    side: side + (cinematic.side - side) * weight, intensity: 1 + (cinematic.intensity - 1) * weight };
}

function drawPlayerReflection(ctx, geometry, bank, surfaces) {
  const light = shipReflectionLight(), color = light.channels.join(",");
  const alpha = ctx.globalAlpha * (light.intensity ?? 1);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const surface of surfaces) {
    const points = surface.points.map(geometry.point);
    const first = points[0], last = points.at(-1);
    const gradient = ctx.createLinearGradient(first.x, first.y, last.x, last.y);
    gradient.addColorStop(0, `rgba(${color},0)`);
    gradient.addColorStop(0.34, `rgba(${color},0.9)`);
    gradient.addColorStop(0.74, `rgba(${color},0.48)`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    const weight = surface.weight * (0.75 + surface.side * (light.side * 0.30 + bank * 0.14));
    ctx.strokeStyle = gradient;
    ctx.beginPath(); ctx.moveTo(first.x, first.y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.globalAlpha = alpha * weight * 0.25;
    ctx.lineWidth = geometry.width * 0.024; ctx.stroke();
    ctx.globalAlpha = alpha * weight * 0.76;
    ctx.lineWidth = geometry.width * 0.0085; ctx.stroke();
  }
  ctx.restore();
}

function resetShipVisuals() { shipVisuals.clock = 0; shipVisuals.bank = 0; }
function updateShipVisuals(seconds, cinematic = false) {
  if ((!cinematic && !isBattleActive()) || !Number.isFinite(seconds) || seconds <= 0) return;
  shipVisuals.clock += seconds;
  const velocity = cinematic ? 0 : (player.y - (player.previousY ?? player.y)) / (player.speed * seconds);
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
function preloadFighterAtlas(id) {
  if (typeof fighterAtlasCatalog === "undefined" || !fighterAtlasCatalog[id] || typeof Image !== "function") return null;
  if (fighterAtlasImages.has(id)) return fighterAtlasImages.get(id);
  const image = new Image();
  image.decoding = "async";
  image.src = `assets/fighters/atlas/${id}.webp`;
  fighterAtlasImages.set(id, image);
  return image;
}
function fighterAtlasPose(asset, ship, bank) {
  if (visualQuality.meshDetail === 0 || typeof fighterAtlasCatalog === "undefined" || !asset.atlas) return null;
  const art = fighterAtlasCatalog[asset.atlas];
  if (!art) return null;
  const image = preloadFighterAtlas(asset.atlas);
  if (!image?.complete || image.naturalWidth !== art.width * art.frames.length) return null;
  const position = (clamp(bank, -1, 1) + 1) * (art.frames.length - 1) / 2;
  const index = Math.round(position);
  const pose = art.frames[index];
  const scale = Math.min(ship.width * .945 / art.bodyWidth, ship.height * .955 / art.bodyHeight);
  const width = art.width * scale, height = art.height * scale;
  return { image, sourceX: index * art.width, sourceWidth: art.width, sourceHeight: art.height,
    width, height, anchorX: ship.x + ship.width * .465, anchorY: ship.y,
    x: -pose.nose[0] * width, y: -pose.nose[1] * height,
    residual: position - index,
    engines: pose.engines, reflections: pose.reflections,
    point: ([x, y]) => ({ x: (x - pose.nose[0]) * width, y: (y - pose.nose[1]) * height }) };
}
function drawShipJet(ctx, x, y, direction, length, radius, color, quiet, phase) {
  ctx.save(); ctx.translate(x, y); ctx.scale(direction, 1);
  const glow = quiet ? 0 : visualQuality.glow;
  if (glow && radius > 1.5) {
    const sheath = ctx.createLinearGradient(0, 0, length * 1.4, 0);
    sheath.addColorStop(0, color + "60"); sheath.addColorStop(.31, color + "33"); sheath.addColorStop(1, color + "00");
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * glow;
    ctx.fillStyle = sheath;
    ctx.beginPath(); ctx.moveTo(0, -radius * 1.22);
    ctx.bezierCurveTo(length * .30, -radius * 2.45, length * .87, -radius * .8, length * 1.4, 0);
    ctx.bezierCurveTo(length * .87, radius * .8, length * .30, radius * 2.45, 0, radius * 1.22); ctx.fill();
    ctx.globalAlpha = alpha;
  }
  const flow = ctx.createLinearGradient(0, 0, length, 0);
  flow.addColorStop(0, "#effcffdf"); flow.addColorStop(0.16, color + "c4");
  flow.addColorStop(0.72, color + "38"); flow.addColorStop(1, color + "00");
  ctx.fillStyle = flow;
  ctx.beginPath(); ctx.moveTo(0, -radius);
  ctx.bezierCurveTo(length * 0.38, -radius * 0.9, length * 0.7, -radius * 0.35, length, 0);
  ctx.bezierCurveTo(length * 0.7, radius * 0.35, length * 0.38, radius * 0.9, 0, radius); ctx.fill();
  ctx.fillStyle = "#effcff";
  ctx.beginPath(); ctx.ellipse(radius * 0.45, 0, radius * 0.8, radius * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  if (glow && radius > 1.4) {
    ctx.strokeStyle = "#f2feffb8";
    ctx.lineWidth = Math.max(.6, radius * .16);
    ctx.beginPath();
    const knots = visualQuality.meshDetail === 2 ? 3 : 2;
    for (let index = 0; index < knots; index++) {
      const t = .19 + index * .20 + (Math.sin(phase * 24 + index) + 1) * .025;
      const edge = radius * (1 - t);
      ctx.moveTo(length * (t - .04), -edge);
      ctx.lineTo(length * (t + .055), 0);
      ctx.lineTo(length * (t - .04), edge);
    }
    ctx.stroke();
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
function drawShipModule(ctx, part, x, y, width, height, tint) {
  if (tint) { ctx.save(); ctx.filter = tint; }
  ctx.drawImage(part.image, ...part.crop, x, y, width, height);
  if (tint) ctx.restore();
}
function drawShipEvolutionModules(ctx, ship, upgrades, asset, quiet, foreground) {
  const rank = key => clamp(Number(upgrades?.[key]) || 0, 0, 3);
  const pierce = rank("pierce"), blast = rank("blast"), aegis = rank("aegis");
  if (!(pierce || blast || aegis)) return;
  const fairing = shipRenderAssets.fairing;
  loadShipRenderAsset(fairing);
  const module = (part, x, y, width) => {
    if (!part.ready) return false;
    const height = width * part.crop[3] / part.crop[2];
    drawShipModule(ctx, part, x, y - height / 2, width, height, asset.moduleTint);
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
      // Low-profile launch fairings replace the former explosive gun barrels.
      const span = 20 + blast * 2;
      if (!module(fairing, -67, span, 43 + blast * 4)) shipModulePlate(ctx, -42, span, 34, 8, "#a94046");
      ctx.fillStyle = blast === 3 ? "#bce7ff" : "#92b8d0";
      for (let slot = 0; slot < Math.min(2, blast); slot++) {
        ctx.beginPath(); ctx.ellipse(-36 - slot * 7, span - 1, 1.5, .7, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  ctx.restore();
  }
  ctx.restore();
}
function drawShipPBR(ctx, ship, kind, upgrades = null, quiet = false, time = 0, asset = shipRenderAssets[kind]) {
  loadShipRenderAsset(asset);
  if (!asset?.ready || !asset.image || !(ship.width > 0 && ship.height > 0)) return false;
  const playerShip = kind === "crimson";
  const clock = quiet ? 0 : time;
  const bank = quiet || ship.disabled ? 0 : Number.isFinite(ship.visualBank) ? ship.visualBank : playerShip ? shipVisuals.bank : Math.sin((ship.age ?? clock) * 1.7) * 0.22;
  const atlas = playerShip && ship === player ? fighterAtlasPose(asset, ship, bank) : null;
  const geometry = atlas ?? shipRenderGeometry(asset, ship, playerShip);
  const cached = atlas ? null : shipRenderSurface(asset, geometry.width, geometry.height);
  ctx.save(); ctx.translate(geometry.anchorX, geometry.anchorY);
  if (atlas) ctx.transform(1, 0, atlas.residual * .035, 1, 0, 0);
  else ctx.transform(1, 0, bank * 0.09, 1 - Math.abs(bank) * 0.10, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  if (!ship.disabled) {
    const boost = playerShip && (typeof flightMovementVector === "function" ? flightMovementVector().x > .2 : (pressedKeys.has("ArrowRight") || pressedKeys.has("KeyD")));
    const throttle = boost ? 1.45 : playerShip ? 1.16 : .89;
    for (const engine of (atlas?.engines ?? asset.engines)) {
      const nozzle = geometry.point(engine);
      let length = ship.width * (playerShip ? 0.19 : 0.14) * throttle * (1 + Math.sin(clock * 32 + engine[1]) * 0.06);
      if (playerShip) length = Math.min(length, Math.max(6, geometry.anchorX + nozzle.x - 8));
      drawShipJet(ctx, nozzle.x, nozzle.y, -asset.direction, length, ship.height * (boost ? .030 : .023), asset.color, quiet, clock);
    }
  }
  if (playerShip) drawShipEvolutionModules(ctx, ship, upgrades, asset, quiet, false);
  ctx.save();
  if (ship.disabled) ctx.filter = "brightness(0.55) saturate(0.45)";
  else if (ship.hitFlash > 0 && !quiet) ctx.filter = "brightness(1.25) saturate(0.65)";
  if (atlas) ctx.drawImage(atlas.image, atlas.sourceX, 0, atlas.sourceWidth, atlas.sourceHeight,
    atlas.x, atlas.y, atlas.width, atlas.height);
  else if (cached) ctx.drawImage(cached.body, geometry.x, geometry.y, geometry.width, geometry.height);
  else ctx.drawImage(asset.image, ...asset.crop, geometry.x, geometry.y, geometry.width, geometry.height);
  ctx.restore();
  if (playerShip && ship === player && !ship.disabled && !(ship.hitFlash > 0)) {
    const reflections = atlas ? atlas.reflections.map((points, index) => ({ points, side: index ? 1 : -1, weight: .59 }))
      : asset.reflections ?? crimsonReflectionSurfaces;
    drawPlayerReflection(ctx, geometry, bank, reflections);
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
  if (playerShip && upgrades?.pierce) drawEvolutionWingCannons(ctx, ship, upgrades.pierce, quiet, time, asset.moduleTint);
  return true;
}

function drawEvolutionWingCannons(ctx, ship, level, quiet = false, time = 0, tint) {
  const rank = Math.max(0, Math.min(3, Number(level) || 0));
  if (!rank || !(ship.width > 0 && ship.height > 0)) return;
  const muzzles = typeof getEvolutionWingMuzzles === "function" ? getEvolutionWingMuzzles(ship)
    : [-1, 1].map(side => ({ x: ship.x + ship.width * .20, y: ship.y + side * ship.height * .30, side }));
  const rail = shipRenderAssets.rail, length = ship.width * (.26 + rank * .028);
  loadShipRenderAsset(rail);
  ctx.save();
  for (const muzzle of muzzles) {
    if (rail.ready && rail.image) {
      const scale = length / rail.crop[2];
      drawShipModule(ctx, rail, muzzle.x - (rail.tip[0] - rail.crop[0]) * scale,
        muzzle.y - (rail.tip[1] - rail.crop[1]) * scale, length, rail.crop[3] * scale, tint);
    } else {
      shipModulePlate(ctx, muzzle.x - length * .5, muzzle.y, length, ship.height * .065, "#8b9ba8");
    }
    ctx.fillStyle = rank === 3 ? "#c2f8ff" : "#83d6e2";
    ctx.beginPath(); ctx.ellipse(muzzle.x, muzzle.y, Math.max(.8, ship.width * .006), Math.max(.6, ship.height * .009), 0, 0, Math.PI * 2); ctx.fill();
    if (rank >= 2) {
      ctx.strokeStyle = "#98d8e1"; ctx.lineWidth = Math.max(.5, ship.width * .003);
      ctx.beginPath(); ctx.moveTo(muzzle.x - length * .70, muzzle.y - ship.height * .026);
      ctx.lineTo(muzzle.x - length * .24, muzzle.y - ship.height * .026); ctx.stroke();
    }
  }
  ctx.restore();
}

// The same unmodified crimson raster gives companions a real, coherent hull.
function drawEvolutionDroneBody(ctx, drone, level = 1, quiet = false, time = 0) {
  if (!drone || !(drone.width > 0 && drone.height > 0)) return false;
  const ship = { ...drone, visualBank: 0, disabled: false };
  const drawn = drawShipPBR(ctx, ship, "crimson", null, quiet, time);
  if (!drawn) {
    const source = shipRenderSources.crimson;
    if (typeof fighterImage === "undefined" || !fighterImage?.complete || !fighterImage.naturalWidth) return false;
    const geometry = shipRenderGeometry(source, ship, true);
    ctx.drawImage(fighterImage, ...source.crop, geometry.anchorX + geometry.x, geometry.anchorY + geometry.y, geometry.width, geometry.height);
  }
  if (level >= 3) {
    const x = drone.x - drone.width * .12;
    ctx.save(); ctx.strokeStyle = "#9ccedf"; ctx.globalAlpha *= .55; ctx.lineWidth = Math.max(.6, drone.width * .012);
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(x - drone.width * .1, drone.y + side * drone.height * .28);
      ctx.lineTo(x + drone.width * .15, drone.y + side * drone.height * .22); ctx.stroke();
    }
    ctx.restore();
  }
  return true;
}
