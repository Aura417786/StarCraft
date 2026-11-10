"use strict";

// Choreography by identity: approach, phase timing and the motion of fractured material.
const bossPresentationProfiles = [
  { ink: "#83ddff", light: "#d5fbff", approach: [.98, .23, -.14], timing: [2.26, 1.44, 2.14, 3.70], drift: [-.32, -.63], order: "inward" },
  { ink: "#d0c0ee", light: "#f3e9ff", approach: [.79, -.34, .19], timing: [2.18, 1.37, 1.94, 3.17], drift: [.35, .83], order: "tail" },
  { ink: "#ff9c62", light: "#ffe3ac", approach: [1.02, .05, -.10], timing: [2.15, 1.28, 1.87, 3.35], drift: [-.31, -.41], order: "inward" },
  { ink: "#bf9aff", light: "#f0dfff", approach: [.56, -.54, .33], timing: [2.30, 1.48, 2.10, 3.38], drift: [.04, -1.05], order: "fall" },
  { ink: "#a7f49a", light: "#e7ffc1", approach: [.97, .17, -.29], timing: [2.15, 1.37, 1.89, 3.27], drift: [.27, .21], order: "split" },
  { ink: "#97e1fb", light: "#ebfcff", approach: [.70, -.26, .24], timing: [2.26, 1.56, 2.02, 3.60], drift: [.02, .13], order: "split" },
  { ink: "#79b5ff", light: "#c8eaff", approach: [1.13, .37, -.34], timing: [2.20, 1.38, 1.96, 3.32], drift: [-.42, .37], order: "tail" },
  { ink: "#d3f47f", light: "#f3ffd3", approach: [.76, .33, -.18], timing: [2.26, 1.54, 2.06, 3.60], drift: [.04, -.64], order: "outward" },
  { ink: "#ff8098", light: "#ffd3d9", approach: [.87, -.15, .28], timing: [2.36, 1.62, 2.16, 3.83], drift: [-.20, -.20], order: "inward" },
  { ink: "#ff8fcd", light: "#ffdafa", approach: [.90, -.28, .17], timing: [2.24, 1.46, 2.06, 3.62], drift: [.33, -.38], order: "tail" },
  { ink: "#c9a7ff", light: "#ffe5fb", approach: [1.21, .13, -.31], timing: [2.54, 1.70, 2.28, 4.36], drift: [-.22, -.48], order: "outward" },
];

const bossPresentationTiming = { entry: 0, rupture: 1, transform: 2, death: 3 };
const presentationImpactAt = { entry: .63, rupture: .44, transform: .44, death: .39 };
const presentationSlowScale = .30;
const presentationSlowDuration = .35;
const bossCameraProfiles = {
  entry: { zoom: .046, panX: -16, panY: 7, delay: .16, push: .99, release: .62 },
  rupture: { zoom: .034, panX: -11, panY: 3, delay: .00, push: .36, release: .38 },
  transform: { zoom: .037, panX: -13, panY: 4, delay: .10, push: .88, release: .62 },
  death: { zoom: .063, panX: -22, panY: 8, delay: .11, push: 1.46, release: .93 },
};
let bossPresentation = null;

function bossPresentationDuration(target, kind) {
  if (kind === "death" && !target.finale) return 1.25;
  return bossPresentationProfiles[target.type].timing[bossPresentationTiming[kind]];
}

function activeBossPresentation() {
  const scene = bossPresentation;
  if (!scene) return null;
  const { kind, target } = scene;
  if (kind === "death") return scene;
  // A restarted or replaced encounter cannot retain a prior cinematic.
  if (target !== boss || (kind === "transform" ? (!target.finale || target.finale.age >= target.finale.transform)
    : target.phase !== (kind === "entry" ? "enter" : kind))) return null;
  return scene;
}

function isBossPresentationPlaying() { return !!activeBossPresentation(); }
function isBossDeathPlaying() { return bossPresentation?.kind === "death"; }
function resetBossPresentation() {
  bossPresentation = null;
  app.dataset.bossPresentation = "";
}

function captureBossPresentationMotion() {
  if (quietCombatMotion()) return null;
  const projectiles = [];
  for (const list of [bossProjectiles, enemyProjectiles, bullets]) {
    for (const shot of list.slice(-8)) {
      if (!Number.isFinite(shot.x + shot.y + shot.vx + shot.vy)) continue;
      projectiles.push({ x: shot.x, y: shot.y, vx: shot.vx, vy: shot.vy,
        radius: Math.max(1.4, Math.min(5, shot.radius ?? shot.halfHeight ?? 2)),
        color: list === bullets ? "#efd4ab" : "#adc4d1" });
    }
  }
  return { projectiles, enemies: enemies.slice(0, 8).map(enemy => ({ ...enemy, hitFlash: 0 })) };
}

function startBossPresentation(kind, target, motion = null) {
  const duration = bossPresentationDuration(target, kind);
  const slowed = kind === "rupture" || (kind === "death" && !!target.finale);
  bossPresentation = {
    kind, target, age: 0, duration, realAge: 0,
    slowFrom: slowed ? duration * presentationImpactAt[kind] - .036 : null,
    motion: slowed ? motion ?? captureBossPresentationMotion() : null,
    profile: bossPresentationProfiles[target.type], impact: false,
  };
  app.dataset.bossPresentation = kind;
  pressedKeys.clear();
  // Even the first post-cinematic tick must not resolve a projectile from the previous phase.
  clearBossFinaleAttacks();
  if (kind === "death") resetCannonLink();
  updatePauseHint();
}

function playEntrance(target) { startBossPresentation("entry", target); }
function playRupture(target) { startBossPresentation("rupture", target); }
function playFinaleTransform(target) { startBossPresentation("transform", target); }
function playDeath(target, reward, motion) {
  startBossPresentation("death", target, motion);
  bossPresentation.reward = reward;
}

function presentationEase(value, start, end) {
  const t = clamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
}

// Split each frame at the slow window edges. At any frame rate the window spans
// the same real time, and the same scaled delta drives every world animation.
function bossPresentationFrameSeconds(scene, seconds) {
  if (!canAnimateCombatEffects() || !Number.isFinite(seconds) || seconds <= 0) return 0;
  scene.realAge += seconds;
  if (scene.slowFrom === null || quietCombatMotion()) return seconds;
  const outsideBefore = clamp(scene.slowFrom - scene.age, 0, seconds);
  const slowEnd = scene.slowFrom + presentationSlowDuration * presentationSlowScale;
  const inside = clamp((slowEnd - Math.max(scene.age, scene.slowFrom)) / presentationSlowScale, 0, seconds - outsideBefore);
  return seconds - inside * (1 - presentationSlowScale);
}

function drawBossPresentationMotion(ctx, scene) {
  if (!scene?.motion || quietCombatMotion()) return;
  const t = scene.age;
  const coast = (1 - Math.exp(-t * 1.7)) / 1.7;
  const clearAt = scene.slowFrom + presentationSlowDuration * presentationSlowScale;
  const opacity = (1 - presentationEase(t, clearAt, clearAt + .24)) * .46;
  if (opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha *= opacity;
  for (const enemy of scene.motion.enemies) {
    drawEnemyHull({ ...enemy, x: enemy.x - (enemy.speed ?? 0) * coast });
  }
  for (const shot of scene.motion.projectiles) {
    const x = shot.x + shot.vx * coast, y = shot.y + shot.vy * coast;
    const speed = Math.max(1, Math.hypot(shot.vx, shot.vy));
    ctx.fillStyle = shot.color;
    ctx.strokeStyle = shot.color + "65";
    ctx.lineWidth = shot.radius;
    ctx.beginPath(); ctx.moveTo(x - shot.vx / speed * 16, y - shot.vy / speed * 16); ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, shot.radius, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function advanceLivingBossPresentation(seconds) {
  const scene = activeBossPresentation();
  if (!scene || scene.kind === "death") return false;
  if (!canAnimateCombatEffects() || !(seconds > 0)) return true;
  const { target, kind, duration, profile } = scene;
  const next = scene.age + seconds;
  scene.age = next >= duration - 1e-9 ? duration : next;
  target.age += seconds;
  target.phaseTime = scene.age;
  if (kind === "entry") {
    const arena = bossArena();
    const progress = scene.age / duration;
    const arrival = presentationEase(progress, .12, 1);
    const [reach, lift] = profile.approach;
    target.x = arena.x + (viewport.width - arena.x + arena.width * .44) * reach * (1 - arrival);
    target.y = clamp(arena.y + arena.height * lift * (1 - arrival), arena.top, arena.bottom);
  } else if (kind === "transform") {
    target.finale.age = scene.age;
    const arena = bossArena();
    const settle = presentationEase(scene.age / duration, 0, .91);
    target.x = target.finale.startX + (arena.x - target.finale.startX) * settle;
    target.y = target.finale.startY + (arena.y - target.finale.startY) * settle;
  }
  target.previousX = target.x;
  target.previousY = target.y;
  if (!scene.impact && scene.age >= duration * presentationImpactAt[kind]) {
    scene.impact = true;
    if (kind === "rupture") gameAudio.bossEnrage();
    gameAudio.bossPresentationCue?.(kind, target.type, target.x, target.y);
    addCombatShake(kind === "entry" ? 2 : 4.5);
    if (kind === "rupture") pulseCombatLight(target.x, target.y, target.width * 1.75, profile.ink, "impact");
  }
  if (scene.age >= duration - 1e-9) {
    resetBossPresentation();
    bossHitGrace = Math.max(bossHitGrace, .38);
    if (kind === "entry") {
      beginAlienRecovery(target);
      setBossMessage(bossStageTitle(target), tr("敌体进入战区", "Hostile in sector"));
    } else if (kind === "rupture") {
      target.ruptureWindow = true;
      beginAlienRecovery(target);
      setBossMessage(bossStageTitle(target), tr("护壳破裂 · 核心外露 6.5 秒", "Shell ruptured · Core exposed for 6.5 s"));
    }
  }
  return true;
}

function advanceBossDeathPresentation(seconds) {
  const scene = bossPresentation;
  if (!scene || scene.kind !== "death") return;
  scene.age = Math.min(scene.duration, scene.age + seconds);
  if (scene.target.finale && !scene.impact && scene.age >= scene.duration * presentationImpactAt.death) {
    scene.impact = true;
    gameAudio.explode(true, scene.target.x, scene.target.y);
    gameAudio.bossPresentationCue?.("death", scene.target.type, scene.target.x, scene.target.y);
    addCombatShake(scene.target.alienFinal ? 7 : 5.5);
    pulseCombatLight(scene.target.x, scene.target.y, scene.target.width * 2.4, scene.profile.ink, "collapse");
    recordCombatDetonation(scene.target, { kind: "boss", type: scene.target.type, size: scene.target.width * .82 });
  }
  if (scene.age >= scene.duration - 1e-9) {
    resetBossPresentation();
    scoreDisplay.textContent = String(score).padStart(6, "0");
    if (scene.target.alienFinal || (typeof sortiePresentationEndsRun === "function" && sortiePresentationEndsRun(scene.target))) endGame(true);
    else {
      if (scene.reward) {
        powerupNotice.textContent = scene.reward;
        powerupNotice.dataset.type = "yellow";
        powerupNotice.hidden = false;
        upgradeNoticeTime = 3;
        statusMessage.textContent = scene.reward;
      }
      openEvolutionChoice();
    }
  }
}

function applyBossPresentationCamera(ctx) {
  const scene = activeBossPresentation();
  const factor = cinemaMotionFactor();
  if (!factor) return;
  if (!scene) {
    const detonation = combatEffects.detonations.find(effect => effect.rank === 2 && effect.age < .17);
    if (detonation) {
      const punch = factor * (1 - presentationEase(detonation.age, .022, .17));
      frameCinematicCamera(ctx, viewport.width * .52, viewport.height * .48, punch * .009, -punch * 4, 0);
    }
    return;
  }
  const { delay, push, release, zoom, panX, panY } = bossCameraProfiles[scene.kind];
  const pushEnd = Math.min(delay + push, scene.duration * .58);
  const releaseFrom = Math.max(pushEnd, scene.duration - release);
  const envelope = presentationEase(scene.age, delay, pushEnd) * (1 - presentationEase(scene.age, releaseFrom, scene.duration));
  const x = clamp(scene.target.x, viewport.width * .30, viewport.width * .79);
  const y = clamp(scene.target.y, viewport.height * .25, viewport.height * .75);
  frameCinematicCamera(ctx, x, y, factor * envelope * zoom, factor * envelope * panX, factor * envelope * panY);
}

function cinemaMotionFactor() {
  if (shakePreference === "off") return 0;
  return quietCombatMotion() ? .14 : 1;
}
function frameCinematicCamera(ctx, x, y, extra, panX, panY) {
  // Limit panning to the overscan created by the zoom, including ultrawide/portrait resize.
  const dx = clamp(panX, -(viewport.width - x) * extra, x * extra);
  const dy = clamp(panY, -(viewport.height - y) * extra, y * extra);
  ctx.translate(dx - x * extra, dy - y * extra);
  ctx.scale(1 + extra, 1 + extra);
}
function applyCampaignReturnCamera(ctx, age) {
  const factor = cinemaMotionFactor() * (1 - presentationEase(age, 10.4, 13.4));
  if (!factor) return;
  frameCinematicCamera(ctx, viewport.width * .56, viewport.height * .47, factor * .056, -factor * 12, factor * 5);
}

function drawBossPresentationBackdrop(ctx) {
  const scene = activeBossPresentation();
  if (!scene) return;
  const p = scene.age / scene.duration;
  const strength = presentationEase(p, 0, .27) * (1 - presentationEase(p, .72, 1));
  const x = Math.min(scene.target.x, viewport.width * .89);
  const y = scene.target.y;
  const glow = ctx.createRadialGradient(x, y, 4, x, y, Math.max(8, viewport.width * .74));
  glow.addColorStop(0, scene.profile.ink + "34");
  glow.addColorStop(.32, "#08172a22");
  glow.addColorStop(1, scene.kind === "transform" ? "#020411d3" : "#0204118f");
  ctx.save();
  ctx.globalAlpha = strength * (reducedMotion.matches ? .48 : .91);
  if (scene.kind === "death" && scene.target.alienFinal) {
    ctx.fillStyle = "#010207";
    ctx.globalAlpha = presentationEase(p, .70, .93) * .61;
    ctx.fillRect(-100, -100, viewport.width + 200, viewport.height + 200);
    ctx.globalAlpha = strength * .91;
  }
  ctx.fillStyle = glow;
  ctx.fillRect(-100, -100, viewport.width + 200, viewport.height + 200);
  ctx.restore();
}

function presentationEllipse(ctx, x, y, width, height, turn = 0, from = 0, to = Math.PI * 2) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(1, width), Math.max(1, height), turn, from, to);
}

function drawPresentationCore(ctx, x, y, size, profile, strength, shade = false) {
  const radius = Math.max(3, size);
  const glow = ctx.createRadialGradient(x, y, radius * .08, x, y, radius);
  glow.addColorStop(0, shade ? "#02040b" : profile.light);
  glow.addColorStop(.31, shade ? "#080410" : profile.ink + "a8");
  glow.addColorStop(.61, profile.ink + (shade ? "76" : "35"));
  glow.addColorStop(1, profile.ink + "00");
  ctx.save();
  ctx.globalAlpha *= strength;
  ctx.fillStyle = glow;
  presentationEllipse(ctx, x, y, radius, radius);
  ctx.fill();
  ctx.restore();
}

// Identity motifs are built at the body scale so they stay connected to the creature during camera motion.
function drawPresentationMaterial(ctx, scene, spread, strength, quiet, front = false) {
  if (strength <= .003) return;
  const { target, profile, age, kind } = scene;
  const r = target.width * (.31 + spread * .35);
  const w = kind === "death" && target.type === 0 ? 1.45 : 1;
  const moving = quiet ? 0 : age;
  ctx.save();
  ctx.globalAlpha *= strength;
  ctx.strokeStyle = front ? profile.light : profile.ink;
  ctx.fillStyle = profile.ink + "48";
  ctx.lineWidth = front ? 1.45 : 2.7;
  const loops = quiet ? 3 : 6;
  switch (target.type) {
    case 0: // Refraction bands curl around the mantle; their near halves cross in front of the egg.
      for (let i = 0; i < loops; i++) {
        const phase = moving * (1.9 + i * .16) + i * 2.13;
        const height = r * (.24 + .16 * Math.cos(phase));
        const center = r * (i / (loops - 1) - .5) * .47;
        const d = front ? Math.PI : 0;
        if (kind === "transform" && !quiet) {
          const caustic = ctx.createLinearGradient(-r, center - height, r, center + height);
          caustic.addColorStop(0, "#3675cb00");
          caustic.addColorStop(.43, "#2f97d243");
          caustic.addColorStop(.69, "#a8faffb0");
          caustic.addColorStop(1, "#35b1ff00");
          ctx.strokeStyle = caustic;
          ctx.lineWidth = r * .067;
          presentationEllipse(ctx, -r * .065, center, r * (1.25 - i * .078) * w,
            height, Math.sin(phase) * .28, d, d + Math.PI);
          ctx.stroke();
        }
        ctx.strokeStyle = front ? profile.light + "8a" : profile.ink + "94";
        ctx.lineWidth = (front ? 1 : 2.7) * (1 + i % 3 * .35);
        presentationEllipse(ctx, -r * .065, center, r * (1.25 - i * .078) * w,
          height, Math.sin(phase) * .28, d, d + Math.PI);
        ctx.stroke();
      }
      break;
    case 1: // Rib cages torque at staggered intervals.
      for (let i = 0; i < loops; i++) {
        const x = r * (i / (loops - 1) - .5) * 1.65;
        const bend = Math.cos(i * 1.7 + moving * 2.2) * .27;
        presentationEllipse(ctx, x, 0, r * .22, r * (.72 - i * .039), bend, .29, Math.PI * 1.69);
        ctx.stroke();
      }
      break;
    case 2: // Furnace jets shear upwards along a heated wake.
      for (let i = 0; i < loops; i++) {
        const x = r * (i / (loops - 1) - .5);
        const height = r * (.53 + .33 * Math.cos(i * 2.7 + moving * 5));
        const jet = ctx.createLinearGradient(x, -height, x, r * .30);
        jet.addColorStop(0, profile.ink + "00"); jet.addColorStop(1, profile.ink + "95");
        ctx.fillStyle = jet;
        ctx.beginPath(); ctx.moveTo(x - r * .13, r * .29);
        ctx.quadraticCurveTo(x + r * .12, -.31 * height, x - r * .45, -height);
        ctx.quadraticCurveTo(x + r * .34, -height * .25, x + r * .12, r * .31);
        ctx.fill();
      }
      break;
    case 3: // Suspended threads gather into a single heart.
      ctx.beginPath();
      for (let i = 0; i < loops + 2; i++) {
        const x = (i - (loops + 1) / 2) * r * .33;
        const y = -r * (1.30 + i % 2 * .29);
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x * .62, r * -.18, Math.cos(i + moving) * r * .34, r * .26, x * -.42, r * .54);
      }
      ctx.stroke();
      break;
    case 4: // Two articulated pincer walls peel in opposite directions.
      for (const sign of [-1, 1]) {
        const curl = .13 * Math.sin(moving * 2.8) + spread * .34;
        ctx.beginPath(); ctx.moveTo(-r * .98, sign * r * (.40 + curl));
        ctx.bezierCurveTo(-r * .47, sign * r * 1.19, r * .49, sign * r * (.93 + curl), r * 1.12, sign * r * .13);
        ctx.lineTo(r * .75, sign * r * .30);
        ctx.bezierCurveTo(r * .25, sign * r * .62, -r * .51, sign * r * .78, -r * .98, sign * r * (.40 + curl));
        ctx.fill(); ctx.stroke();
      }
      break;
    case 5: // Twin reflections separate and split into geometric planes.
      for (const sign of [-1, 1]) {
        ctx.save(); ctx.translate(sign * r * (.42 + .36 * spread), 0);
        ctx.rotate(sign * (.29 + moving * .19));
        ctx.beginPath(); ctx.moveTo(0, -r * .90); ctx.lineTo(r * .34, -r * .16);
        ctx.lineTo(r * .16, r * .86); ctx.lineTo(-r * .38, r * .12); ctx.closePath();
        ctx.fill(); ctx.stroke(); ctx.restore();
      }
      break;
    case 6: // The discharge travels through a bent chain rather than radiating from its center.
      ctx.beginPath();
      for (let i = 0; i <= 18; i++) {
        const x = r * (i / 9 - 1) * 1.18;
        const y = r * (.40 * Math.sin(i * .39 - moving * 7) + (i % 2 ? .08 : -.08));
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      break;
    case 7: // Pressure blisters inflate and vent individually.
      for (let i = 0; i < loops + 3; i++) {
        const angle = i * 2.4;
        const size = r * (.08 + (i % 3) * .06) * (1 + .17 * Math.sin(moving * 2.3 + i));
        const radius = r * (.50 + i % 4 * .16);
        presentationEllipse(ctx, Math.cos(angle) * radius, Math.sin(angle) * radius * .68 - spread * r * .36, size, size * .85);
        ctx.fill(); ctx.stroke();
      }
      break;
    case 8: // Gravitational lensing winds inward along curved debris tracks.
      for (let i = 0; i < loops; i++) {
        const phi = i * Math.PI * 2 / loops + moving * 2.0;
        ctx.beginPath();
        for (let j = 0; j <= 16; j++) {
          const a = j / 16, angle = phi + a * 2.7;
          const x = Math.cos(angle) * r * (1.6 - a * 1.37);
          const y = Math.sin(angle) * r * (.66 - a * .54);
          if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    case 9: // Sequential neural nodes close electrical paths into the crown.
      for (let i = 0; i < loops; i++) {
        const a = i * Math.PI * 2 / loops;
        const x = Math.cos(a) * r, y = Math.sin(a) * r * .71;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(x * .4 - y * .18, y * .31); ctx.lineTo(x * .62 + y * .13, y * .58);
        ctx.lineTo(x, y); ctx.stroke();
        if (quiet || Math.cos(moving * 6 - i) > -.1) drawPresentationCore(ctx, x, y, r * .18, profile, .87);
      }
      break;
    case 10: // The Confluence breaks into three organs, then draws their energy through one seam.
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3 + .16 * Math.sin(moving * 1.8);
        const color = ["#ff9fcd", "#bdb4ff", "#87e5ff"][i];
        const x = Math.cos(a) * r * (spread + .36), y = Math.sin(a) * r * (.42 + spread * .56);
        ctx.strokeStyle = color;
        presentationEllipse(ctx, x, y, r * .58, r * .31, a + .35);
        ctx.stroke();
        drawPresentationCore(ctx, x, y, r * .32, { ink: color, light: profile.light }, .86);
      }
      break;
  }
  ctx.restore();
}

function presentationFragmentDelay(order, x, y) {
  if (order === "tail") return (.5 - x) * .25;
  if (order === "fall") return (.5 + y) * .26;
  if (order === "split") return (.50 - Math.abs(y)) * .22;
  const distance = clamp(Math.hypot(x, y) / .61, 0, 1);
  return (order === "inward" ? 1 - distance : distance) * .22;
}

const bossCollapseLabels = [
  ["深海压力释放", "ABYSSAL PRESSURE RELEASE"], ["骨节崩裂", "VERTEBRAL FRACTURE"],
  ["熔核内爆", "FURNACE IMPLOSION"], ["裂网垂坠", "WEB UNRAVELLING"],
  ["巨螯断裂", "CLAW SEVERANCE"], ["镜面碎裂", "MIRROR SHATTER"],
  ["断尾放电", "TAIL DISCHARGE"], ["卵囊喷裂", "SPORE BURST"],
  ["奇点吞噬", "SINGULARITY INGESTION"], ["神经断电", "NEURAL BLACKOUT"],
  ["群渊核心坍缩", "CONFLUENCE COLLAPSE"],
];
function deathFragmentTravel(type, x, y, depth, t, index) {
  const fall = t * t, wave = Math.sin(t * Math.PI), side = Math.sign(y || 1);
  const ejection = .55 + depth * .95;
  switch (type) {
    case 0: return [x * (1 - wave * .65) - t * .56, y * (1 + t * 1.62) + fall * .61];
    case 1: return [x + (x * .79 + .34) * t, y + (.15 - depth * .63) * t + fall * 1.12];
    case 2: return [x * (1 - wave * .84 + fall * 1.9), y * (1 - wave * .56 + fall * 2) + fall * .60];
    case 3: return [x * (1 - t * .44) + (index % 3 - 1) * wave * .14, y - .34 * wave + fall * 1.72];
    case 4: return [x + t * (.22 + x * .5), y + side * ejection * t + fall * .56];
    case 5: return [x + (x * 1.18 + side * .47) * t, y + (y * .64 - x * .57) * t + fall * .24];
    case 6: return [x + (.73 + x * .68) * t, y + Math.sin(x * 8 - t * 5) * wave * .35 + fall * .49];
    case 7: return [x * (1 + ejection * t), y + (y * .70 - .97) * t + fall * .37];
    case 8: return [x * (1 - fall) - y * wave * .81, y * (1 - fall) + x * wave * .64 + fall * .08];
    case 9: return [x * (1 + .64 * t) + (index % 3 - 1) * t * .29, y - depth * .50 * t + fall * .85];
    default: {
      const organ = index % 3 * 2.094 + .35;
      return [x * (1 + t * .62) + Math.cos(organ) * wave * .73,
        y * (1 + t * .73) + Math.sin(organ) * wave * .67 + fall * .47];
    }
  }
}

const bossDebrisGravity = [1.88, 2.46, 2.27, 3.05, 2.65, 1.53, 2.34, 1.76, 0, 2.18, 2.38];

function presentationDebrisPosition(type, x, y, depth, index, t, lifespan, w, h) {
  // The singularity pulls its own shell in. Every other collapse releases
  // chunks at an identity-specific angle, then gravity takes over.
  if (type === 8) {
    const [sx, sy] = deathFragmentTravel(type, x, y, depth, t, index);
    return [w * sx, h * sy];
  }
  const [outX, outY] = deathFragmentTravel(type, x, y, depth, .38, index);
  const seconds = t * lifespan;
  const mass = .82 + depth * .9 + (index % 4) * .05;
  const vx = w * ((outX - x) * 1.13 + x * .46) / mass;
  const vy = h * ((outY - y) * .84 + y * .28 - .24) / mass;
  const gravity = h * bossDebrisGravity[type] * (.93 + depth * .13);
  return [w * x + vx * seconds, h * y + vy * seconds + .5 * gravity * seconds * seconds];
}

function drawPresentationChip(ctx, edge, w, h, thickness, yaw, pitch, frontColor, sideColor, rim) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const offsetX = sy * thickness * .5, offsetY = -cy * sp * thickness * .5;
  const front = [], back = [];
  for (let j = 0; j < edge.length; j += 2) {
    const x = edge[j] * w, y = edge[j + 1] * h;
    const px = x * cy, py = y * cp + x * sy * sp;
    front.push([px + offsetX, py + offsetY]);
    back.push([px - offsetX, py - offsetY]);
  }
  const face = cy * cp >= 0 ? front : back;
  const underside = face === front ? back : front;
  const trace = points => {
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      if (!i) ctx.moveTo(...points[i]); else ctx.lineTo(...points[i]);
    }
    ctx.closePath();
  };
  trace(underside); ctx.fillStyle = sideColor; ctx.fill();
  ctx.beginPath();
  for (let j = 0; j < face.length; j++) {
    const next = (j + 1) % face.length;
    const [a, b] = [face[j], face[next]];
    const [c, d] = [underside[next], underside[j]];
    ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.lineTo(...d); ctx.closePath();
  }
  ctx.fill();
  trace(face);
  ctx.fillStyle = face === front ? frontColor : sideColor; ctx.fill();
  ctx.strokeStyle = rim; ctx.lineWidth = .55; ctx.stroke();
}

function drawPresentationFragments(ctx, scene, progress, quiet, finale = false) {
  if (progress <= 0 || progress >= 1) return;
  const { target, profile, kind } = scene;
  const key = target.type + (finale ? 11 : 0);
  const pieces = bossFragmentAtlas[key];
  const g = finale ? finaleCoreGeometry(target) : target;
  const w = g.width * .88, h = g.height * .87;
  const death = kind === "death";
  ctx.save();
  for (let i = 0; i < pieces.length; i += quiet ? 3 : 1) {
    const [x, y, depth, light, ...edge] = pieces[i];
    const delay = presentationFragmentDelay(profile.order, x, y);
    const t = clamp((progress - delay) / (1 - delay), 0, 1);
    if (t <= 0) continue;
    const opacity = presentationEase(t, 0, .11) * (1 - presentationEase(t, death ? .57 : .48, 1));
    const yaw = (i % 2 ? -1 : 1) * (.7 + depth * 3.4) * t;
    const pitch = (i % 2 ? 1 : -1) * (.38 + Math.abs(y) * 2.75 + depth) * t;
    const roll = (i % 3 === 0 ? -1 : 1) * (.5 + Math.abs(x) * 2.9) * t;
    const force = t * (.65 + depth * .64);
    const lifespan = scene.duration * .60 * (1 - delay);
    const at = u => death ? presentationDebrisPosition(target.type, x, y, depth, i, u, lifespan, w, h)
      : [w * (x + x * force + profile.drift[0] * u * u * .46),
        h * (y + y * force + (.28 + profile.drift[1] * .24) * u * u)];
    const [travelX, travelY] = at(t);
    const range = quiet ? .25 : death ? 1 : .60;
    const sx = w * x + (travelX - w * x) * range;
    const freeY = h * y + (travelY - h * y) * range;
    const floor = viewport.height - g.y + h * .055;
    const sy = Math.min(floor, freeY);
    const landing = 1 - presentationEase(freeY, floor - h * .10, floor + h * .11);
    if (landing <= 0) continue;
    ctx.save();
    ctx.globalAlpha *= opacity * landing * (quiet ? .71 : .94);
    if (!quiet && t > .10) {
      const [previousX, previousY] = at(Math.max(0, t - (death ? .061 / lifespan : .09)));
      const tailX = w * x + (previousX - w * x) * range;
      const tailY = h * y + (previousY - h * y) * range;
      if (Math.hypot(sx - tailX, sy - tailY) > 2) {
        const tail = ctx.createLinearGradient(tailX, tailY, sx, sy);
        tail.addColorStop(0, profile.ink + "00"); tail.addColorStop(1, profile.ink + (target.type === 5 ? "84" : "35"));
        ctx.strokeStyle = tail; ctx.lineWidth = Math.max(.6, w * .006);
        ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(sx, sy); ctx.stroke();
      }
    }
    ctx.translate(sx, sy);
    ctx.rotate(quiet ? 0 : roll);
    const chipScale = kind === "rupture" ? .57 + (i % 5) * .076 : .68 + (i % 5) * .081;
    ctx.scale(chipScale, chipScale);
    const thickness = Math.max(1.4, w * (.013 + depth * .053) * (target.type === 5 ? .37 : 1));
    const gradient = ctx.createLinearGradient(-w * .067, -h * .076, w * .073, h * .068);
    gradient.addColorStop(0, profile.light + (light > .42 ? "a2" : "68"));
    gradient.addColorStop(.18 + light * .17, profile.ink + (i % 3 ? "73" : "a1"));
    gradient.addColorStop(.57, target.type === 2 ? "#422823" : "#30394e");
    gradient.addColorStop(1, "#101422");
    const sideColor = target.type === 2 ? "#482824" : target.type === 1 ? "#524938" : "#1a283c";
    drawPresentationChip(ctx, edge, w, h, thickness, quiet ? .48 : yaw, quiet ? .40 : pitch,
      gradient, sideColor, profile.ink + "69");
    ctx.restore();
  }
  ctx.restore();
}

function drawBossPresentationBody(ctx, scene, quiet) {
  quiet ||= quietCombatMotion();
  const { kind, target, profile, age, duration } = scene;
  const p = clamp(age / duration, 0, 1);
  const bank = quiet ? 0 : profile.approach[2];
  const wrap = presentationEase(p, .12, .68);
  const endFade = 1 - presentationEase(p, .74, 1);
  const g = target.finale && finaleCoreGeometry(target);
  ctx.save();
  ctx.translate(target.x, target.y);
  if (kind === "entry") {
    const approach = presentationEase(p, .06, .88);
    drawPresentationMaterial(ctx, scene, .67 - approach * .51, endFade * .69, quiet);
    ctx.save();
    ctx.globalAlpha *= .40 + approach * .60;
    ctx.rotate(bank * (1 - approach));
    ctx.scale(.74 + approach * .26, .82 + approach * .18);
    drawBossShip(ctx, { ...target, x: 0, y: 0, cinematicPose: {
      turn: bank * (1 - approach) * 1.6, charge: (1 - approach) * .36, unfurl: approach * .34,
    } }, quiet);
    ctx.restore();
    drawPresentationMaterial(ctx, scene, .58 - approach * .45, .43 * endFade, quiet, true);
  } else if (kind === "rupture") {
    const crack = presentationEase(p, .19, .52);
    const recoil = crack * endFade;
    drawPresentationMaterial(ctx, scene, .17 + recoil * .63, recoil * .82, quiet);
    ctx.save();
    ctx.translate(recoil * target.width * .06, 0);
    ctx.rotate(-bank * recoil * .55);
    ctx.scale(1 + recoil * .09, 1 - recoil * .055);
    drawBossShip(ctx, { ...target, x: 0, y: 0, cinematicPose: {
      turn: bank * recoil, charge: .28 + .54 * recoil, unfurl: crack, intensity: recoil * .65,
    } }, quiet);
    ctx.restore();
    drawPresentationCore(ctx, -target.width * .06, -target.height * .05, target.width * (.13 + recoil * .10),
      profile, recoil * .83, target.type === 8);
    ctx.save();
    ctx.globalAlpha *= recoil * .86;
    ctx.strokeStyle = profile.light;
    ctx.lineWidth = quiet ? 1.1 : 1.65;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = i * 1.256 + target.type * .27;
      const size = target.width * (.12 + crack * (.12 + i % 2 * .06));
      const x = Math.cos(angle) * size, y = Math.sin(angle) * size * .66;
      ctx.moveTo(-target.width * .06, -target.height * .05);
      ctx.lineTo(x * .52 - y * .22, y * .36 + x * .18);
      ctx.lineTo(x * .69 + y * .21, y * .74);
      ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.restore();
    drawPresentationFragments(ctx, scene, (p - .26) / .74, quiet);
    drawPresentationMaterial(ctx, scene, .22 + recoil * .45, recoil * .65, quiet, true);
  } else if (kind === "transform") {
    const gather = presentationEase(p, .06, .62);
    const newBody = presentationEase(p, .40, .88);
    const veil = Math.sin(Math.PI * wrap);
    drawPresentationMaterial(ctx, scene, .70 * (1 - gather), .86 * veil + .16 * endFade, quiet);
    if (newBody < .997) {
      ctx.save();
      ctx.globalAlpha *= (1 - newBody) ** .62;
      ctx.rotate(bank * gather);
      ctx.scale(1 - .60 * gather, 1 - .36 * gather);
      drawBossShip(ctx, { ...target, x: 0, y: 0, phase: "recover", cinematicPose: {
        turn: bank * gather * 2.2, charge: .26 + gather * .45, unfurl: 1 - gather,
      } }, quiet);
      ctx.restore();
    }
    if (newBody > .002) {
      ctx.save();
      ctx.globalAlpha *= newBody;
      ctx.rotate(-bank * veil * .4);
      ctx.scale(.61 + .39 * newBody, .78 + .22 * newBody);
      drawFinaleShell(ctx, { ...target, x: 0, y: 0 }, g.width, g.height, quiet);
      ctx.restore();
    }
    drawPresentationCore(ctx, 0, 0, target.width * (.12 + .10 * veil), profile, veil * .57, target.type === 8);
    drawPresentationMaterial(ctx, scene, .35 * (1 - gather), veil * .81, quiet, true);
  } else if (g) {
    const squeeze = presentationEase(p, 0, .39);
    const release = presentationEase(p, .38, .69);
    const radius = g.width * (.21 + release * 1.15);
    const material = (.45 + squeeze * .48) * (1 - presentationEase(p, .46, .90));
    drawPresentationMaterial(ctx, scene, release, material, quiet);
    if (release < .99) {
      ctx.save();
      ctx.globalAlpha *= 1 - release;
      ctx.rotate(bank * squeeze);
      ctx.scale(1 - squeeze * (profile.order === "inward" ? .36 : .18),
        1 - squeeze * (profile.order === "inward" ? .30 : .12));
      drawFinaleShell(ctx, { ...target, x: 0, y: 0, cinematicPose: { loss: squeeze }, finale: { ...target.finale, age: target.finale.age + age } },
        g.width, g.height, quiet);
      ctx.restore();
    }
    drawPresentationCore(ctx, 0, -release * g.height * .11, radius, profile,
      (.18 + squeeze * .56) * (1 - presentationEase(p, .47, .86)), target.type === 8);
    drawPresentationFragments(ctx, scene, (p - .35) / .60, quiet, true);
    drawPresentationMaterial(ctx, scene, release, material * .76, quiet, true);
    if (target.type === 0 && release > 0) {
      const wake = target.width * (.3 + release * 1.47);
      ctx.save();
      ctx.strokeStyle = profile.light;
      ctx.globalAlpha *= (1 - presentationEase(p, .58, .88)) * release * .62;
      ctx.lineWidth = 2.4;
      presentationEllipse(ctx, 0, -release * g.height * .17, wake, wake * .39, -.12);
      ctx.stroke();
      ctx.restore();
    }
    if (p > .64 && !target.alienFinal) {
      for (const [index, color] of ["#77ddff", "#ffe593", "#ff8f9c"].entries()) {
        const delivery = presentationEase(p, .64 + index * .027, .93 + index * .027);
        const glow = Math.sin(delivery * Math.PI) * .76;
        drawPresentationCore(ctx, -target.width * .13 * Math.sin(delivery * Math.PI),
          (index - 1) * 75 * delivery, target.width * .09, { ink: color, light: "#ffffff" }, glow);
      }
    }
  }
  ctx.restore();
}

function drawBossPresentationOverlay(ctx) {
  const scene = activeBossPresentation();
  if (!scene) return;
  const { kind, target, profile } = scene;
  const p = scene.age / scene.duration;
  if (kind === "death") {
    const { width, height } = viewport;
    const cx = width * .61, cy = height * .50;
    const strength = presentationEase(p, .13, .61) * (1 - presentationEase(p, .84, 1));
    const edge = ctx.createRadialGradient(cx, cy, Math.min(width, height) * .23, cx, cy, Math.hypot(width, height) * .62);
    edge.addColorStop(0, "#01041000"); edge.addColorStop(.54, "#0104101e"); edge.addColorStop(1, "#010410ce");
    ctx.save(); ctx.globalAlpha = strength * (quietCombatMotion() ? .30 : .77);
    ctx.fillStyle = edge; ctx.fillRect(0, 0, width, height); ctx.restore();
  }
  const titleTime = Math.max(p, (scene.realAge || 0) / scene.duration);
  const opacity = presentationEase(titleTime, .08, .25) * (1 - presentationEase(titleTime, .73, .99));
  const head = {
    entry: ["异形信号锁定", "HOSTILE CONTACT"],
    rupture: ["外壳裂变", "CARAPACE FRACTURE"],
    transform: ["终局形态", "TERMINAL METAMORPHOSIS"],
    death: bossCollapseLabels[target.type],
  };
  const title = kind === "transform" ? bossFinaleStageLabel(target.type) : target.name;
  const size = clamp(viewport.width * .025, 16, 29);
  const y = viewport.height * .71;
  const bar = Math.min(viewport.width * .72, 460);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const gradient = ctx.createLinearGradient((viewport.width - bar) / 2, 0, (viewport.width + bar) / 2, 0);
  gradient.addColorStop(0, "#070b1700"); gradient.addColorStop(.5, "#070b17d8"); gradient.addColorStop(1, "#070b1700");
  ctx.fillStyle = gradient;
  ctx.fillRect((viewport.width - bar) / 2, y - size * 1.22, bar, size * 2.68);
  ctx.strokeStyle = profile.ink + "9f";
  ctx.beginPath(); ctx.moveTo(viewport.width / 2 - bar * .25, y - size * 1.25);
  ctx.lineTo(viewport.width / 2 + bar * .25, y - size * 1.25); ctx.stroke();
  ctx.fillStyle = profile.ink;
  ctx.font = "600 " + Math.max(11, size * .39) + "px sans-serif";
  ctx.fillText(tr(...head[kind]), viewport.width / 2, y - size * .62, bar * .91);
  ctx.fillStyle = "#f0f6ff";
  ctx.font = "700 " + size + "px sans-serif";
  ctx.fillText(title, viewport.width / 2, y + size * .43, bar * .94);
  ctx.restore();
}
