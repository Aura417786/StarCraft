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
const battlefieldState = { sector: 0, previous: 0, completed: 0, clock: 0, transition: 0, titleTime: 5, driftX: 0, driftY: 0 };
const sceneryCache = new Map();
let sceneryForeground = null;
const sceneryStars = Array.from({ length: 48 }, (_, i) => ({
  x: sceneryHash(i * 13.4 + 1), y: sceneryHash(i * 7.9 + 18), depth: 0.2 + sceneryHash(i * 17.8 + 3) * 0.8,
}));
const sceneryDust = Array.from({ length: 12 }, (_, i) => ({
  x: sceneryHash(i * 8.41 + 3), y: sceneryHash(i * 6.19 + 9), depth: sceneryHash(i * 19.1 + 2),
}));
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
  while (sceneryCache.size > sceneryRules.maxImages) {
    const oldKey = sceneryCache.keys().next().value;
    sceneryCache.delete(oldKey);
  }
  return record;
}
function sceneryLoadForeground() {
  if (sceneryForeground) return sceneryForeground;
  if (typeof Image === "undefined") return null;
  const image = new Image();
  sceneryForeground = { image, ready: false, failed: false };
  const record = sceneryForeground;
  image.decoding = "async";
  image.onload = () => { record.ready = !!image.naturalWidth; };
  image.onerror = () => { record.failed = true; };
  image.src = "assets/scenery/foreground-rock.png";
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
  Object.assign(battlefieldState, { sector: 0, previous: 0, completed: 0, clock: 0, transition: 0, titleTime: 5, driftX: 0, driftY: 0 });
  sceneryLayer(0); sceneryLayer(1); sceneryLoadForeground();
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
}
function updateBattlefield(seconds) {
  if (state !== "menu" && (typeof isBattleActive !== "function" || !isBattleActive())) return;
  const dt = Math.max(0, Math.min(Number.isFinite(seconds) ? seconds : 0, 0.1));
  // The menu is a quiet orbit preview; a fresh run starts this journey from zero.
  if (state === "battle") battlefieldState.clock += dt;
  battlefieldState.titleTime = Math.max(0, battlefieldState.titleTime - dt);
  const ease = 1 - Math.exp(-dt * 1.6), quiet = reducedMotion.matches;
  const x = state === "battle" && !quiet ? (player.x / Math.max(1, viewport.width) - 0.5) * 5 : 0;
  const y = state === "battle" && !quiet ? (player.y / Math.max(1, viewport.height) - 0.5) * 6 : 0;
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
  } else if (alpha === 1) { ctx.fillStyle = battlefieldSectors[sector].dark; ctx.fillRect(0, 0, w, h); }
  ctx.restore();
}
function sceneryDrawParticles() {
  const ctx = context, w = viewport.width, h = viewport.height, quiet = reducedMotion.matches;
  const clock = quiet ? 0 : battlefieldState.clock;
  for (const star of sceneryStars) {
    const span = w + 30;
    const x = ((star.x * span - clock * (1.2 + star.depth * star.depth * 5)) % span + span) % span - 15;
    ctx.fillStyle = `rgba(169,188,217,${0.06 + star.depth * 0.10})`;
    ctx.beginPath(); ctx.arc(x, star.y * h - battlefieldState.driftY * star.depth, 0.28 + star.depth * 0.35, 0, Math.PI * 2); ctx.fill();
  }
  if (quiet) return;
  for (const particle of sceneryDust) {
    const span = w + 60, speed = 10 + particle.depth * 13;
    const x = ((particle.x * span - clock * speed) % span + span) % span - 30;
    const y = particle.y * h - battlefieldState.driftY * (1 + particle.depth * 1.3);
    ctx.fillStyle = `rgba(142,164,197,${0.025 + particle.depth * 0.045})`;
    ctx.beginPath(); ctx.arc(x, y, 0.5 + particle.depth * 0.55, 0, Math.PI * 2); ctx.fill();
  }
  const journey = sceneryJourney();
  // Near debris belongs to the belt/fleet sectors and fades with the same journey.
  const foregroundWeight = battlefieldSectors[journey.current].foreground * (1 - journey.blend)
    + battlefieldSectors[journey.next].foreground * journey.blend;
  const foreground = sceneryLoadForeground();
  if (foregroundWeight > 0 && foreground && foreground.ready) {
    for (let i = 0; i < 2; i++) {
      const size = (i === 1 ? 156 : 112) * Math.min(1.28, Math.max(0.6, h / 720));
      const span = w + size * 3, speed = 35 + i * 16;
      const x = ((sceneryHash(i * 7.4 + 12) * span - clock * speed) % span + span) % span - size * 1.5;
      const y = i === 1 ? size * 0.16 : h - size * 0.16;
      ctx.save(); ctx.translate(x - battlefieldState.driftX * 2, y - battlefieldState.driftY * 2);
      ctx.rotate(i * 1.7 + Math.sin(clock * 0.10 + i) * 0.12);
      ctx.globalAlpha = foregroundWeight;
      ctx.drawImage(foreground.image, -size / 2, -size / 3, size, size * 2 / 3);
      ctx.restore();
    }
  }
}
function drawBattlefield() {
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
  const vignette = ctx.createLinearGradient(0, 0, 0, h);
  vignette.addColorStop(0, "#02040b40"); vignette.addColorStop(0.12, "#02040b18"); vignette.addColorStop(0.24, "#02040b00");
  vignette.addColorStop(0.78, "#02040b00"); vignette.addColorStop(1, "#02040b24");
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
  if (state === "battle" && w > 740 && h > 460) {
    const theme = battlefieldSectors[battlefieldState.sector], x = Math.round(w * 0.034), y = w <= 1000 ? 160 : 132;
    const emphasis = battlefieldState.titleTime > 0 ? Math.min(1, battlefieldState.titleTime / 1.2) : 0;
    ctx.globalAlpha = 0.55 + emphasis * 0.3; ctx.fillStyle = theme.color;
    ctx.fillRect(x, y - 10, 2, 27); ctx.font = "11px Consolas, Microsoft YaHei, sans-serif";
    ctx.fillText(tr(theme.name, theme.enName), x + 11, y); ctx.font = "8px Consolas, monospace"; ctx.globalAlpha *= 0.7;
    ctx.fillText(theme.subtitle, x + 11, y + 14);
  }
  ctx.restore();
}
