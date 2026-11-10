"use strict";

// Original generated cinematic plates, animated as a continuous leftward journey.
// No backdrop object participates in collision. Preserve open, readable combat lanes.
const battlefieldSectors = [
  { id: "orbit", name: "曙光轨道", enName: "Dawn Orbit", subtitle: "DAWN / LOW ORBIT", color: "#78c8f4", dark: "#030610", asset: "assets/scenery/orbit-galaxy.webp", anchorY: 0.51, foreground: 0 },
  { id: "belt", name: "碎星航道", enName: "Shattered Passage", subtitle: "SHATTERED / ASTEROID BELT", color: "#c9a680", dark: "#060710", asset: "assets/scenery/belt-galaxy.webp", anchorY: 0.20, foreground: 0.24 },
  { id: "wreck", name: "余烬墓场", enName: "Ember Graveyard", subtitle: "AFTERMATH / FLEET GRAVEYARD", color: "#ed9d70", dark: "#070610", asset: "assets/scenery/wreck-galaxy.webp", anchorY: 0.30, foreground: 0.18 },
  { id: "citadel", name: "深空壁垒", enName: "Deep-Space Citadel", subtitle: "CITADEL / CAPITAL SHIP", color: "#82bfc8", dark: "#030810", asset: "assets/scenery/citadel-galaxy.webp", anchorY: 0.62, foreground: 0.08 },
  { id: "rift", name: "虚空之眼", enName: "Eye of the Void", subtitle: "BEYOND / EVENT HORIZON", color: "#ad9af4", dark: "#050513", asset: "assets/scenery/rift-galaxy.webp", anchorY: 0.16, foreground: 0 },
];
const sceneryRules = { interval: 75, blend: 10, zoom: 1.28, maxImages: 3 };
const battlefieldState = { sector: 0, previous: 0, completed: 0, clock: 0, ambientClock: 0, transition: 0, titleTime: 5, driftX: 0, driftY: 0 };
const sceneryCache = new Map();
let orbitSurfaceMask;
let orbitSurfaceLayer;
const sceneryStars = Array.from({ length: 48 }, (_, i) => ({
  x: sceneryHash(i * 13.4 + 1), y: sceneryHash(i * 7.9 + 18), depth: 0.2 + sceneryHash(i * 17.8 + 3) * 0.8,
}));
const sceneryDust = Array.from({ length: 12 }, (_, i) => ({
  x: sceneryHash(i * 8.41 + 3), y: sceneryHash(i * 6.19 + 9), depth: sceneryHash(i * 19.1 + 2),
}));
const sceneryDustTints = ["142,173,205", "197,164,123", "207,137,104", "116,179,192", "162,143,206"];
function sceneryHash(n) { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return value - Math.floor(value); }
function sceneryClamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function sceneryLayer(sector, menu = false) {
  const index = ((sector % battlefieldSectors.length) + battlefieldSectors.length) % battlefieldSectors.length;
  const key = menu ? "menu" : index;
  if (sceneryCache.has(key)) return sceneryCache.get(key);
  if (typeof Image === "undefined") return null;
  const image = new Image();
  const asset = menu ? "assets/scenery/orbit-silent.png" : battlefieldSectors[index].asset;
  const record = { image, ready: false, failed: false, width: 0, height: 0, asset };
  sceneryCache.set(key, record);
  image.decoding = "async";
  image.onload = () => {
    if (!image.naturalWidth || !image.naturalHeight) { record.failed = true; return; }
    record.width = image.naturalWidth; record.height = image.naturalHeight;
    record.ready = true;
  };
  image.onerror = () => { record.failed = true; record.ready = false; };
  image.src = record.asset;
  if (index === 0 && !menu && !orbitSurfaceMask) {
    orbitSurfaceMask = new Image();
    orbitSurfaceMask.decoding = "async";
    orbitSurfaceMask.src = "assets/scenery/orbit-surface-mask.png";
  }
  while (sceneryCache.size > sceneryRules.maxImages) {
    const oldKey = sceneryCache.keys().next().value;
    sceneryCache.delete(oldKey);
  }
  return record;
}
function sceneryJourney(clock = battlefieldState.clock) {
  const duration = sceneryRules.interval, blend = sceneryRules.blend;
  const leg = Math.floor(Math.max(0, clock) / duration), phase = Math.max(0, clock) % duration;
  const current = leg % battlefieldSectors.length, next = (current + 1) % battlefieldSectors.length;
  const raw = sceneryClamp((phase - (duration - blend)) / blend, 0, 1);
  return { leg, current, next, phase, currentAge: phase + blend, nextAge: Math.max(0, phase - (duration - blend)), blend: raw * raw * (3 - 2 * raw) };
}
function resetBattlefield() {
  Object.assign(battlefieldState, { sector: 0, previous: 0, completed: 0, clock: 0, ambientClock: 0, transition: 0, titleTime: 5, driftX: 0, driftY: 0 });
  sceneryLayer(0); sceneryLayer(1);
}
function resizeScenery() {
  // Full-resolution images remain usable at every viewport size; no reload/texture stall.
  battlefieldState.driftX = 0; battlefieldState.driftY = 0;
}
function advanceBattlefield() {
  // Manual QA/navigation only. Production transitions use effective flight time, not kills.
  const next = Math.floor(battlefieldState.clock / sceneryRules.interval) + 1;
  battlefieldState.clock = next * sceneryRules.interval;
  scenerySyncJourney();
}
function scenerySyncJourney() {
  const journey = sceneryJourney();
  if (battlefieldState.completed !== journey.leg) battlefieldState.titleTime = 6;
  battlefieldState.completed = journey.leg;
  battlefieldState.previous = journey.current;
  battlefieldState.sector = journey.blend >= 0.5 ? journey.next : journey.current;
  battlefieldState.transition = journey.blend > 0 ? sceneryRules.interval - journey.phase : 0;
  sceneryLayer(journey.current); sceneryLayer(journey.next);
  if (battlefieldSectors[journey.next].id === "citadel") loadJourneyCitadelImage();
}
function updateBattlefield(seconds, cinematic = false) {
  if (state !== "menu" && !cinematic && (typeof isBattleActive !== "function" || !isBattleActive())) return;
  const dt = Math.max(0, Math.min(Number.isFinite(seconds) ? seconds : 0, 0.1));
  if (cinematic) {
    // Preserve sector timing and advance only depth layers with the presentation clock.
    battlefieldState.ambientClock += dt;
    return;
  }
  // The menu is a quiet orbit preview; a fresh run starts this journey from zero.
  if (state === "battle") battlefieldState.clock += dt;
  battlefieldState.titleTime = Math.max(0, battlefieldState.titleTime - dt);
  const ease = 1 - Math.exp(-dt * 1.6), quiet = reducedMotion.matches;
  const x = state === "battle" && !quiet ? (player.x / Math.max(1, viewport.width) - 0.5) * 11 : 0;
  const y = state === "battle" && !quiet ? (player.y / Math.max(1, viewport.height) - 0.5) * 9 : 0;
  battlefieldState.driftX += (x - battlefieldState.driftX) * ease;
  battlefieldState.driftY += (y - battlefieldState.driftY) * ease;
  scenerySyncJourney();
}
function sceneryFrame(imageWidth, imageHeight, age, sector) {
  const w = viewport.width, h = viewport.height;
  const quiet = reducedMotion.matches;
  const menu = state === "menu";
  const travel = quiet ? 0.55 : sceneryClamp(age / (sceneryRules.interval + sceneryRules.blend), 0, 1);
  const cover = Math.max(w / imageWidth, h / imageHeight);
  // A slight approach complements the faster movement of the nearby rock layer.
  const approach = sceneryClamp((age - sceneryRules.blend) / sceneryRules.interval, 0, 1);
  const scale = cover * (quiet ? 1.06 : sceneryRules.zoom + (menu ? 0 : approach * 0.045));
  const width = imageWidth * scale, height = imageHeight * scale;
  const marginX = Math.max(0, width - w), marginY = Math.max(0, height - h);
  // Image content keeps travelling left until it is fully crossfaded out at age 85 s.
  const anchorY = menu ? 0.66 : battlefieldSectors[sector].anchorY;
  const x = sceneryClamp(-marginX * travel - battlefieldState.driftX, -marginX, 0);
  const y = sceneryClamp(-marginY * anchorY - battlefieldState.driftY, -marginY, 0);
  return { x, y, width, height, travel };
}

function orbitLimb(frame, x) {
  const u = (x - frame.x) / frame.width;
  return frame.y + frame.height * (.90 - .77 * u + .27 * u * u);
}

function drawOrbitSurface(ctx, plate, frame, age) {
  const { width, height } = viewport;
  if (reducedMotion.matches || state === "menu") return;
  const time = age + battlefieldState.ambientClock;
  if (orbitSurfaceMask?.complete && orbitSurfaceMask.naturalWidth) {
    const resolution = [576, 768, 1024][visualQuality.meshDetail];
    if (!orbitSurfaceLayer || orbitSurfaceLayer.canvas.width !== resolution) {
      const canvas = orbitSurfaceLayer?.canvas ?? document.createElement("canvas");
      canvas.width = resolution;
      canvas.height = Math.round(canvas.width * plate.height / plate.width);
      orbitSurfaceLayer = {canvas, ctx:canvas.getContext("2d"), tick: NaN};
    }
    const layer = orbitSurfaceLayer;
    const tick = Math.floor(time * 18);
    if (layer.ctx && layer.tick !== tick) {
      const {width: w, height: h} = layer.canvas;
      const shift = w * (.025 + .022 * Math.sin(tick / 18 * .061));
      layer.ctx.clearRect(0, 0, w, h);
      layer.ctx.globalCompositeOperation = "source-over";
      layer.ctx.drawImage(plate.image, -shift, shift * .20, w + shift * 1.36, h + shift * .21);
      layer.ctx.globalCompositeOperation = "destination-in";
      layer.ctx.drawImage(orbitSurfaceMask, 0, 0, w, h);
      layer.tick = tick;
    }
    if (layer.ctx) ctx.drawImage(layer.canvas, frame.x, frame.y, frame.width, frame.height);
  }
  if (visualQuality.meshDetail === 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, orbitLimb(frame, 0) + frame.height * .012);
  for (let index = 1; index <= 24; index++) {
    const x = width * index / 24;
    ctx.lineTo(x, orbitLimb(frame, x) + frame.height * .012);
  }
  ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.closePath(); ctx.clip();
  ctx.globalCompositeOperation = "screen";
  for (let index = 0; index < visualQuality.meshDetail + 1; index++) {
    const x = width * (.76 - index * .30) - time * (1.42 + index * .18) % (width * .41);
    const y = orbitLimb(frame, x) + frame.height * (.082 + index * .036);
    const span = width * (.19 + index * .028);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-.23 + index * .08); ctx.scale(1, .16);
    const cloud = ctx.createRadialGradient(0, 0, 0, 0, 0, span);
    cloud.addColorStop(0, "#9ed5ff38");
    cloud.addColorStop(.42, "#95bfd322");
    cloud.addColorStop(1, "#8cb2ce00");
    ctx.fillStyle = cloud;
    ctx.fillRect(-span, -span, span * 2, span * 2);
    ctx.restore();
  }
  ctx.restore();
}

function sceneryDrawSector(sector, alpha, age) {
  if (alpha <= 0) return;
  const ctx = context, w = viewport.width, h = viewport.height;
  const layer = sceneryLayer(sector, state === "menu");
  // Keep the menu's orbit visible while the first battle panorama downloads.
  const backdrop = layer?.ready ? layer : alpha === 1 ? sceneryCache.get("menu") : null;
  ctx.save(); ctx.globalAlpha = alpha;
  if (backdrop?.ready) {
    const frame = sceneryFrame(backdrop.width, backdrop.height, age, sector);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(backdrop.image, frame.x, frame.y, frame.width, frame.height);
    if (sector === 0 && backdrop === layer) drawOrbitSurface(ctx, backdrop, frame, age);
  } else if (alpha === 1) { ctx.fillStyle = battlefieldSectors[sector].dark; ctx.fillRect(0, 0, w, h); }
  ctx.restore();
}
function sceneryDrawParticles() {
  const ctx = context, w = viewport.width, h = viewport.height, quiet = reducedMotion.matches;
  const clock = quiet ? 0 : battlefieldState.clock + battlefieldState.ambientClock;
  for (const star of sceneryStars) {
    const span = w + 30;
    const x = ((star.x * span - clock * (1.2 + star.depth * star.depth * 5)) % span + span) % span - 15;
    ctx.fillStyle = `rgba(169,188,217,${0.06 + star.depth * 0.10})`;
    ctx.beginPath(); ctx.arc(x, star.y * h - battlefieldState.driftY * star.depth, 0.28 + star.depth * 0.35, 0, Math.PI * 2); ctx.fill();
  }
  if (quiet) return;
  for (const particle of sceneryDust.slice(0, visualQuality.meshDetail === 0 ? 5 : visualQuality.meshDetail === 1 ? 8 : 12)) {
    const span = w + 60, speed = 15 + particle.depth * 29;
    const x = ((particle.x * span - clock * speed) % span + span) % span - 30;
    const y = particle.y * h - battlefieldState.driftY * (1 + particle.depth * 1.3);
    ctx.fillStyle = `rgba(${sceneryDustTints[battlefieldState.sector]},${0.046 + particle.depth * 0.057})`;
    ctx.beginPath(); ctx.arc(x, y, 0.5 + particle.depth * 0.55, 0, Math.PI * 2); ctx.fill();
  }
  const journey = sceneryJourney();
  // A light cone and velocity gradient separate mid-distance mesh silhouettes from the distant plate.
  for (const [index, weight] of [[journey.current, 1 - journey.blend], [journey.next, journey.blend]]) {
    const strength = battlefieldSectors[index].foreground * weight;
    if (strength < .018) continue;
    const kind = index === 2 ? "wreck" : "rock";
    for (let i = 0; i < (visualQuality.meshDetail === 0 ? 1 : 2); i++) {
      const size = (i ? 196 : 103) * Math.min(1.28, Math.max(.6, h / 720));
      const span = w + size * 3, speed = (i ? 79 : 28) * Math.min(1.6, Math.max(.6, w / 1280));
      const x = ((sceneryHash(i * 7.4 + 12) * span - clock * speed) % span + span) % span - size * 1.5;
      const y = i ? size * .15 : h - size * .13;
      if (x + size * .68 < 0 || x - size * .68 > w) continue;
      drawSpaceProp(ctx, kind, {
        x: x - battlefieldState.driftX * (1.8 + i * .55), y: y - battlefieldState.driftY * (1.8 + i * .55),
        width: size, height: size * (kind === "rock" ? .93 : .76), variant: i + index,
        pitch: -.23 + clock * (.071 + i * .012), yaw: -.52 - clock * .094 + i * .81, roll: i * 1.7 + clock * .068,
        alpha: strength * (i ? 2.52 : 1.72), haze: i ? .16 : .42, sector: index,
      });
    }
  }
}
function drawBattlefield(showHud = true) {
  const ctx = context, w = viewport.width, h = viewport.height, journey = sceneryJourney();
  ctx.save(); ctx.fillStyle = "#03060c"; ctx.fillRect(0, 0, w, h);
  sceneryDrawSector(journey.current, 1, journey.currentAge);
  if (journey.blend > 0) sceneryDrawSector(journey.next, journey.blend, journey.nextAge);
  // Dim the blended scenery once so the landmarks stay visible and combat effects read clearly.
  if (state !== "menu") {
    ctx.fillStyle = "#03060c66";
    ctx.fillRect(0, 0, w, h);
  }
  sceneryDrawParticles();
  drawActiveJourney("back");
  const vignette = ctx.createLinearGradient(0, 0, 0, h);
  vignette.addColorStop(0, "#02040b40"); vignette.addColorStop(0.12, "#02040b18"); vignette.addColorStop(0.24, "#02040b00");
  vignette.addColorStop(0.78, "#02040b00"); vignette.addColorStop(1, "#02040b24");
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
  if (showHud && state === "battle" && w > 740 && h > 460) {
    const theme = battlefieldSectors[battlefieldState.sector], x = Math.round(w * 0.034), y = w <= 1000 ? 160 : 132;
    const emphasis = battlefieldState.titleTime > 0 ? Math.min(1, battlefieldState.titleTime / 1.2) : 0;
    ctx.globalAlpha = 0.55 + emphasis * 0.3; ctx.fillStyle = theme.color;
    ctx.fillRect(x, y - 10, 2, 27); ctx.font = "11px Consolas, Microsoft YaHei, sans-serif";
    ctx.fillText(tr(theme.name, theme.enName), x + 11, y); ctx.font = "8px Consolas, monospace"; ctx.globalAlpha *= 0.7;
    ctx.fillText(theme.subtitle, x + 11, y + 14);
  }
  ctx.restore();
}
