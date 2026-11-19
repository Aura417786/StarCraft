"use strict";

// Original generated cinematic plates, animated as a continuous leftward journey.
// No backdrop object participates in collision. Preserve open, readable combat lanes.
const sceneryRoute = [
  { id: "orbit", name: "曙光轨道", enName: "Dawn Orbit", subtitle: "DAWN / LOW ORBIT", color: "#78c8f4", dark: "#030610", asset: "assets/scenery/orbit-galaxy.webp", anchorY: 0.51, foreground: 0 },
  { id: "belt", name: "碎星航道", enName: "Shattered Passage", subtitle: "SHATTERED / ASTEROID BELT", color: "#c9a680", dark: "#060710", asset: "assets/scenery/belt-galaxy.webp", anchorY: 0.20, foreground: 0.24 },
  { id: "wreck", name: "余烬墓场", enName: "Ember Graveyard", subtitle: "AFTERMATH / FLEET GRAVEYARD", color: "#ed9d70", dark: "#070610", asset: "assets/scenery/wreck-galaxy.webp", anchorY: 0.30, foreground: 0.18 },
  { id: "citadel", name: "深空壁垒", enName: "Deep-Space Citadel", subtitle: "CITADEL / CAPITAL SHIP", color: "#82bfc8", dark: "#030810", asset: "assets/scenery/citadel-galaxy.webp", anchorY: 0.62, foreground: 0.08 },
  { id: "rift", name: "虚空之眼", enName: "Eye of the Void", subtitle: "BEYOND / EVENT HORIZON", color: "#ad9af4", dark: "#050513", asset: "assets/scenery/rift-galaxy.webp", anchorY: 0.16, foreground: 0 },
];
const battlefieldSectors = sceneryRoute.concat([
  { id: "cinder", name: "赤熔断层", enName: "Cinder Scar", subtitle: "VOLCANIC / BASALT FRACTURE", color: "#ed9974", dark: "#110805",
    asset: "assets/scenery/arenas/cinder.webp", anchorY: .72, composition: .94, foreground: 0, environment: 2,
    light: { x: .74, y: .87, key: 0xff9659, fill: 0xb17b78, shade: 0x200d15, strength: .77, bounce: .48 },
    reflect: { channels: [237, 129, 75], side: .72 } },
  { id: "silk", name: "丝芒星云", enName: "Silk Nebula", subtitle: "FILAMENT / ROSE MOLECULAR CLOUD", color: "#d6a2d6", dark: "#0c0715",
    asset: "assets/scenery/arenas/silk.webp", anchorY: .34, composition: .86, foreground: 0, environment: 4,
    light: { x: .23, y: .18, key: 0xedb3d2, fill: 0x8266bc, shade: 0x170f29, strength: .68, bounce: .47 },
    reflect: { channels: [197, 112, 204], side: -.56 } },
  { id: "prism", name: "寒晶地平线", enName: "Cryoprism Horizon", subtitle: "CRYOGENIC / ICE DWARF LIMB", color: "#9acdf1", dark: "#030b18",
    asset: "assets/scenery/arenas/prism.webp", anchorY: .72, composition: .96, foreground: 0, environment: 0,
    light: { x: .40, y: .85, key: 0xb7e8ff, fill: 0x4c87d3, shade: 0x0e192b, strength: .83, bounce: .61 },
    reflect: { channels: [107, 164, 255], side: .73 } },
  { id: "tempest", name: "雷暴冠层", enName: "Tempest Canopy", subtitle: "STORM / IONIZED CLOUD TOP", color: "#92a9f1", dark: "#05071a",
    asset: "assets/scenery/arenas/tempest.webp", anchorY: .15, composition: .92, foreground: 0, environment: 4,
    light: { x: .27, y: .20, key: 0xb4d7ff, fill: 0x596bce, shade: 0x13182c, strength: .72, bounce: .43 },
    reflect: { channels: [102, 129, 242], side: -.80 } },
  { id: "bloom", name: "翡翠星育场", enName: "Viridian Nursery", subtitle: "VIRIDIAN / STELLAR NURSERY", color: "#93c9a9", dark: "#030f10",
    asset: "assets/scenery/arenas/bloom.webp", anchorY: .76, composition: .94, foreground: 0, environment: 3,
    light: { x: .25, y: .76, key: 0xb3ebbe, fill: 0x50a197, shade: 0x0e211c, strength: .73, bounce: .55 },
    reflect: { channels: [92, 195, 143], side: .65 } },
  { id: "confluence", name: "双星河汇流", enName: "Twin-Galaxy Confluence", subtitle: "CONFLUENCE / TIDAL CROSSING", color: "#e0b0da", dark: "#070715",
    asset: "assets/scenery/arenas/confluence.webp", anchorY: .35, composition: .92, foreground: 0, environment: 4,
    light: { x: .74, y: .18, key: 0xffb8a4, fill: 0xae90dc, shade: 0x19152d, strength: .85, bounce: .53 },
    reflect: { channels: [190, 138, 217], side: -.53 } },
]);
const bossScenerySectors = [0, 2, 5, 6, 1, 7, 8, 9, 4, 3, 10];
const sceneryRules = { interval: 75, blend: 10, arenaFadeSeconds: 1.28, zoom: 1.28, maxImages: 3 };
const battlefieldState = { sector: 0, previous: 0, completed: 0, clock: 0, ambientClock: 0, transition: 0, titleTime: 5, driftX: 0, driftY: 0,
  arena: null, arenaBlend: 0, arenaAge: 0 };
const sceneryCache = new Map();
let sceneryCacheUse = 0;
let sceneryJourneyClock = -1, sceneryJourneyFrame;
const sceneryArenaView = { current: 0, next: 0, currentAge: 0, nextAge: 0, blend: 0 };
let sceneryVignetteHeight = 0, sceneryVignette;
const sceneryStars = Array.from({ length: 48 }, (_, i) => ({
  x: sceneryHash(i * 13.4 + 1), y: sceneryHash(i * 7.9 + 18), depth: 0.2 + sceneryHash(i * 17.8 + 3) * 0.8,
}));
const sceneryDust = Array.from({ length: 12 }, (_, i) => ({
  x: sceneryHash(i * 8.41 + 3), y: sceneryHash(i * 6.19 + 9), depth: sceneryHash(i * 19.1 + 2),
}));
const sceneryDustTints = ["142,173,205", "197,164,123", "207,137,104", "116,179,192", "162,143,206",
  "209,119,89", "181,115,185", "123,186,227", "128,141,217", "108,180,139", "190,140,183"];
function sceneryHash(n) { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return value - Math.floor(value); }
function sceneryClamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function sceneryLayer(sector, menu = false) {
  const index = ((sector % battlefieldSectors.length) + battlefieldSectors.length) % battlefieldSectors.length;
  const key = menu ? "menu" : index;
  const cached = sceneryCache.get(key);
  if (cached) {
    cached.lastUse = ++sceneryCacheUse;
    return cached;
  }
  if (typeof Image === "undefined") return null;
  const image = new Image();
  const asset = menu ? "assets/scenery/orbit-silent.webp" : battlefieldSectors[index].asset;
  const record = { image, ready: false, failed: false, width: 0, height: 0, asset, lastUse: ++sceneryCacheUse };
  sceneryCache.set(key, record);
  image.decoding = "async";
  image.onload = () => {
    if (!image.naturalWidth || !image.naturalHeight) { record.failed = true; return; }
    record.width = image.naturalWidth; record.height = image.naturalHeight;
    record.ready = true;
  };
  image.onerror = () => { record.failed = true; record.ready = false; };
  image.src = record.asset;
  if (sceneryCache.size > sceneryRules.maxImages) {
    let oldKey, oldest = Infinity;
    for (const [key, entry] of sceneryCache) if (entry.lastUse < oldest) {
      oldKey = key;
      oldest = entry.lastUse;
    }
    sceneryCache.delete(oldKey);
  }
  return record;
}
function sceneryJourney(clock = battlefieldState.clock) {
  if (clock === sceneryJourneyClock && sceneryJourneyFrame) return sceneryJourneyFrame;
  const duration = sceneryRules.interval, blend = sceneryRules.blend;
  const leg = Math.floor(Math.max(0, clock) / duration), phase = Math.max(0, clock) % duration;
  const current = leg % sceneryRoute.length, next = (current + 1) % sceneryRoute.length;
  const raw = sceneryClamp((phase - (duration - blend)) / blend, 0, 1);
  const frame = { leg, current, next, phase, currentAge: phase + blend,
    nextAge: Math.max(0, phase - (duration - blend)), blend: raw * raw * (3 - 2 * raw) };
  // Explicit look-ahead samples must not evict the shared current frame.
  if (clock === battlefieldState.clock) {
    sceneryJourneyClock = clock;
    sceneryJourneyFrame = frame;
  }
  return frame;
}
function sceneryView() {
  const route = sceneryJourney();
  const { arena, arenaAge, arenaBlend } = battlefieldState;
  if (arena === null || arenaBlend <= 0) return route;
  const entering = route.blend < .5;
  const routeSector = entering ? route.current : route.next;
  const routeAge = entering ? route.currentAge : route.nextAge;
  const settled = arenaBlend >= 1;
  sceneryArenaView.current = settled ? arena : routeSector;
  sceneryArenaView.next = arena;
  sceneryArenaView.currentAge = settled ? arenaAge : routeAge;
  sceneryArenaView.nextAge = arenaAge;
  sceneryArenaView.blend = settled ? 0 : arenaBlend ** 2 * (3 - 2 * arenaBlend);
  return sceneryArenaView;
}
function sceneryActiveSector() {
  const view = sceneryView();
  return view.blend >= .5 ? view.next : view.current;
}
function sceneryEnvironmentSector(index) {
  return battlefieldSectors[index].environment ?? index;
}
function updateSceneryArena(seconds) {
  if (state !== "battle") return;
  const presentationTarget = typeof bossPresentation === "undefined" ? null : bossPresentation?.target;
  const type = boss?.type ?? pendingBossType ?? presentationTarget?.type;
  const sector = bossScenerySectors[type];
  if (sector === undefined) {
    if (prefetchedBossType !== null && battleTime >= nextBossTime - bossRules.artLead) {
      sceneryLayer(bossScenerySectors[prefetchedBossType]);
    }
    battlefieldState.arenaBlend = Math.max(0, battlefieldState.arenaBlend - seconds / sceneryRules.arenaFadeSeconds);
    if (!battlefieldState.arenaBlend) battlefieldState.arena = null;
    return;
  }
  if (!sceneryLayer(sector)?.ready) return;
  if (sector !== battlefieldState.arena) {
    const route = sceneryJourney();
    battlefieldState.titleTime = 6;
    battlefieldState.arena = sector;
    battlefieldState.arenaAge = sector === route.current ? route.currentAge : sector === route.next ? route.nextAge : 11;
    battlefieldState.arenaBlend = 0;
  }
  battlefieldState.arenaBlend = Math.min(1, battlefieldState.arenaBlend + seconds / sceneryRules.arenaFadeSeconds);
  battlefieldState.arenaAge += seconds;
}
function resetBattlefield(inBattle = false) {
  Object.assign(battlefieldState, { sector: 0, previous: 0, completed: 0, clock: 0, ambientClock: 0, transition: 0, titleTime: 5, driftX: 0, driftY: 0,
    arena: null, arenaBlend: 0, arenaAge: 0 });
  for (const key of sceneryCache.keys()) if (key !== "menu" && (!inBattle || key !== 0)) sceneryCache.delete(key);
  if (inBattle) sceneryLayer(0);
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
  if (state === "menu") return;
  sceneryLayer(journey.current);
  if (journey.phase >= sceneryRules.interval - sceneryRules.blend - 12) {
    sceneryLayer(journey.next);
    if (battlefieldSectors[journey.next].id === "citadel") loadJourneyCitadelImage();
  }
}
function updateBattlefield(seconds, cinematic = false) {
  if (state !== "menu" && !cinematic && (typeof isBattleActive !== "function" || !isBattleActive())) return;
  const dt = Math.max(0, Math.min(Number.isFinite(seconds) ? seconds : 0, 0.1));
  updateSceneryArena(dt);
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
function sceneryFrame(imageWidth, imageHeight, age, sector, menu = state === "menu") {
  const w = viewport.width, h = viewport.height;
  const quiet = reducedMotion.matches;
  const travel = quiet ? 0.55 : sceneryClamp(age / (sceneryRules.interval + sceneryRules.blend), 0, 1);
  const cover = Math.max(w / imageWidth, h / imageHeight);
  // A slight approach complements the faster movement of the nearby rock layer.
  const approach = sceneryClamp((age - sceneryRules.blend) / sceneryRules.interval, 0, 1);
  const composition = battlefieldSectors[sector].composition ?? 1;
  const scale = cover * Math.max(1.05, (quiet ? 1.06 : sceneryRules.zoom + (menu ? 0 : approach * 0.045)) * composition);
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

function sceneryDrawSector(sector, alpha, age, ctx = context) {
  if (alpha <= 0) return;
  const w = viewport.width, h = viewport.height;
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
function sceneryDrawParticles(ctx = context, journey = sceneryView()) {
  const w = viewport.width, h = viewport.height, quiet = reducedMotion.matches;
  const clock = quiet ? 0 : battlefieldState.clock + battlefieldState.ambientClock;
  for (const star of sceneryStars) {
    const span = w + 30;
    const x = ((star.x * span - clock * (1.2 + star.depth * star.depth * 5)) % span + span) % span - 15;
    ctx.fillStyle = `rgba(169,188,217,${0.06 + star.depth * 0.10})`;
    ctx.beginPath(); ctx.arc(x, star.y * h - battlefieldState.driftY * star.depth, 0.28 + star.depth * 0.35, 0, Math.PI * 2); ctx.fill();
  }
  if (quiet) return;
  const dustBudget = [5, 8, 12][visualQuality.meshDetail];
  const dustTint = sceneryDustTints[journey.blend >= .5 ? journey.next : journey.current];
  for (let index = 0; index < dustBudget; index++) {
    const particle = sceneryDust[index];
    const span = w + 60, speed = 15 + particle.depth * 29;
    const x = ((particle.x * span - clock * speed) % span + span) % span - 30;
    const y = particle.y * h - battlefieldState.driftY * (1 + particle.depth * 1.3);
    ctx.fillStyle = `rgba(${dustTint},${0.046 + particle.depth * 0.057})`;
    const wake = sampleCastWake(x,y,.72 + particle.depth);
    ctx.beginPath(); ctx.arc(x+wake.x, y+wake.y, 0.5 + particle.depth * 0.55, 0, Math.PI * 2); ctx.fill();
  }
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
      const wake = sampleCastWake(x,y,i ? .32 : .61);
      drawSpaceProp(ctx, kind, {
        x: x + wake.x - battlefieldState.driftX * (1.8 + i * .55), y: y + wake.y - battlefieldState.driftY * (1.8 + i * .55),
        width: size, height: size * (kind === "rock" ? .93 : .76), variant: i + index,
        pitch: -.23 + clock * (.071 + i * .012), yaw: -.52 - clock * .094 + i * .81, roll: i * 1.7 + clock * .068 + wake.roll,
        alpha: strength * (i ? 2.52 : 1.72), haze: i ? .16 : .42, sector: index,
      });
    }
  }
}
function drawSceneryMoon(ctx, journey) {
  if (state === "menu") return;
  const strength = (journey.current === 1 ? 1 - journey.blend : 0) + (journey.next === 1 ? journey.blend : 0);
  if (strength < .015) return;
  const time = battlefieldState.clock + battlefieldState.ambientClock;
  const motion = typeof quietCombatMotion === "function" ? !quietCombatMotion() : !reducedMotion.matches;
  const size = Math.min(viewport.width * .16, viewport.height * .245);
  const age = journey.current === 1 ? journey.currentAge : journey.nextAge;
  const x = viewport.width * (.91 - sceneryClamp(age / 85, 0, 1) * .26) - battlefieldState.driftX * .35;
  const y = viewport.height * .22 - battlefieldState.driftY * .35;
  drawSpaceProp(ctx, "moon", { x, y, width: size, height: size, pitch: -.14, yaw: motion ? time * .055 : .5,
    roll: .15, alpha: strength * .74, haze: .16, sector: 1 });
}

function drawSceneryOcclusion(ctx, target) {
  if (!target || state !== "battle" || target.phase === "enter" || visualQuality.meshDetail === 0
    || (typeof quietCombatMotion === "function" ? quietCombatMotion() : reducedMotion.matches)) return;
  const sector = sceneryActiveSector();
  if (sector !== 1 && sector !== 2) return;
  const time = battlefieldState.clock + battlefieldState.ambientClock;
  const pass = (time * .061) % 1;
  const radius = Math.min(96, target.width * .39);
  const alpha = Math.sin(pass * Math.PI) ** 2 * .82;
  const x = viewport.width + radius - pass * (viewport.width - target.x + radius * 2);
  const y = target.y + target.height * .29 - pass * target.height * .77;
  // Let a near silhouette pass only behind the combat bounds. Projectiles and
  // warnings render over this layer so a rim crossing cannot hide a tell.
  ctx.save();
  const clipLeft = Math.max(bossPlayerRight() + player.width * .57, target.x + target.width * .11);
  ctx.beginPath();
  ctx.rect(clipLeft, 0, Math.max(0, viewport.width - clipLeft), viewport.height);
  ctx.clip();
  if (x + radius > clipLeft && x - radius < viewport.width)
    drawSpaceProp(ctx, sector === 2 ? "wreck" : "rock", { x, y, width: radius, height: radius * .86,
      variant: sector, pitch: time * .33, yaw: time * .55, roll: -time * .27, alpha, haze: .08, sector });
  ctx.restore();
}

function drawBattlefield(showHud = true, ctx = context) {
  const w = viewport.width, h = viewport.height, journey = sceneryView();
  ctx.save(); ctx.fillStyle = "#03060c"; ctx.fillRect(0, 0, w, h);
  const backdrop = journey === sceneryArenaView && journey.blend > 0 ? sceneryJourney() : journey;
  sceneryDrawSector(backdrop.current, 1, backdrop.currentAge, ctx);
  if (backdrop.blend > 0) sceneryDrawSector(backdrop.next, backdrop.blend, backdrop.nextAge, ctx);
  if (backdrop !== journey) sceneryDrawSector(journey.next, journey.blend, journey.nextAge, ctx);
  // Dim the blended scenery once so the landmarks stay visible and combat effects read clearly.
  if (state !== "menu") {
    ctx.fillStyle = "#03060c66";
    ctx.fillRect(0, 0, w, h);
  }
  drawSceneryMoon(ctx, journey);
  sceneryDrawParticles(ctx, journey);
  drawActiveJourney("back", ctx);
  if (h !== sceneryVignetteHeight) {
    sceneryVignette = ctx.createLinearGradient(0, 0, 0, h);
    sceneryVignette.addColorStop(0, "#02040b40"); sceneryVignette.addColorStop(0.12, "#02040b18");
    sceneryVignette.addColorStop(0.24, "#02040b00"); sceneryVignette.addColorStop(0.78, "#02040b00");
    sceneryVignette.addColorStop(1, "#02040b24");
    sceneryVignetteHeight = h;
  }
  ctx.fillStyle = sceneryVignette; ctx.fillRect(0, 0, w, h);
  if (showHud && state === "battle" && w > 740 && h > 460) {
    const theme = battlefieldSectors[journey.blend >= .5 ? journey.next : journey.current];
    const x = Math.round(w * 0.034), y = w <= 1000 ? 160 : 132;
    const emphasis = battlefieldState.titleTime > 0 ? Math.min(1, battlefieldState.titleTime / 1.2) : 0;
    ctx.globalAlpha = 0.55 + emphasis * 0.3; ctx.fillStyle = theme.color;
    ctx.fillRect(x, y - 10, 2, 27); ctx.font = "11px Consolas, Microsoft YaHei, sans-serif";
    ctx.fillText(tr(theme.name, theme.enName), x + 11, y); ctx.font = "8px Consolas, monospace"; ctx.globalAlpha *= 0.7;
    ctx.fillText(theme.subtitle, x + 11, y + 14);
  }
  ctx.restore();
}
