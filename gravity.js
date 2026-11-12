"use strict";

const gravityRules = { warning: 2.4, duration: 6, cooldown: 12, firstDelay: 3,
  acceleration: 410, maxTurn: 0.30 };
const gravityTide = { phase: "idle", elapsed: 0, strength: 0, centerX: 0, centerY: 0,
  radiusX: 0, radiusY: 0, sequence: 0 };
function gravityTideBusy() { return gravityTide.phase === "warning" || gravityTide.phase === "active"; }
function gravityTideEligible() {
  return state === "battle" && !evolution.pending && !isBossDeathPlaying()
    && (typeof sortieAllowsWaves !== "function" || sortieAllowsWaves())
    && battlefieldState.sector === 4 && !battlefieldState.transition && !bossBlocksWaves()
    && !formationState.active && !formationState.warning && !battlefieldEventBlocksWaves()
    && !(typeof aceBlocksWaves === "function" && aceBlocksWaves())
    && viewport.width >= 520 && flightBounds.bottom - flightBounds.top >= player.height * 1.4;
}
function clearGravityEnemyShots() {
  for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
    if (enemyProjectiles[i].gravityAffected) enemyProjectiles.splice(i, 1);
  }
}
function resetGravityTide() {
  clearGravityEnemyShots();
  Object.assign(gravityTide, { phase: "idle", elapsed: 0, strength: 0, centerX: 0, centerY: 0,
    radiusX: 0, radiusY: 0, sequence: 0 });
}
function suspendGravityTide() {
  if (gravityTideBusy()) clearGravityEnemyShots();
  gravityTide.phase = "idle"; gravityTide.elapsed = 0; gravityTide.strength = 0;
}
function startGravityWarning() {
  const span = flightBounds.bottom - flightBounds.top;
  gravityTide.centerX = viewport.width * 0.60;
  gravityTide.centerY = flightBounds.top + span * (gravityTide.sequence++ % 2 ? 0.36 : 0.64);
  gravityTide.radiusX = viewport.width * 0.32;
  gravityTide.radiusY = Math.max(75, span * 0.48);
  gravityTide.phase = "warning"; gravityTide.elapsed = 0; gravityTide.strength = 0;
  statusMessage.textContent = tr("引力潮汐预警。箭头指向引力核心，2.4 秒后战机和普通弹道将被牵引。",
    "Gravity tide warning. Arrows point to the core. In 2.4 seconds, it pulls ships and standard shots.");
}
function updateGravityTide(seconds) {
  if (state !== "battle" || evolution.pending || isBossDeathPlaying()) { suspendGravityTide(); return; }
  if (!isBattleActive() || !Number.isFinite(seconds) || seconds <= 0) return;
  if (!gravityTideEligible()) { suspendGravityTide(); return; }
  gravityTide.elapsed += seconds;
  const t = gravityTide.elapsed;
  if (gravityTide.phase === "idle" && t + 1e-9 >= gravityRules.firstDelay && journeyGravityCanWarn()) startGravityWarning();
  else if (gravityTide.phase === "warning" && t + 1e-9 >= gravityRules.warning) {
    // 保留完整的生效时长，长帧不会跳过预警或直接结算整次潮汐。
    gravityTide.phase = "active"; gravityTide.elapsed = 0;
    gameAudio.fieldCue?.("gravity-tide", gravityTide.centerX, gravityTide.centerY);
    statusMessage.textContent = tr("引力潮汐生效。顺势加速，或按反方向抵消牵引。",
      "Gravity tide active. Ride the pull or steer against it.");
  } else if (gravityTide.phase === "active") {
    gravityTide.strength = Math.max(0, Math.min(1, t / 0.55, (gravityRules.duration - t) / 0.55));
    if (t + 1e-9 >= gravityRules.duration) {
      gravityTide.phase = "rest"; gravityTide.elapsed = 0; gravityTide.strength = 0;
      statusMessage.textContent = tr("引力潮汐平息。", "The gravity tide has subsided.");
    }
  } else if (gravityTide.phase === "rest" && t + 1e-9 >= gravityRules.cooldown && journeyGravityCanWarn()) startGravityWarning();
}
function gravityPlayerVector() {
  const g = gravityTide;
  if (g.phase !== "active" || !g.strength || !gravityTideEligible()) return { x: 0, y: 0 };
  const dx = g.centerX - player.x, dy = g.centerY - player.y;
  const distance = Math.hypot(dx, dy);
  const ellipse = Math.hypot(dx / g.radiusX, dy / g.radiusY);
  if (distance < 1 || ellipse >= 1) return { x: 0, y: 0 };
  // Leave most of the ship's steering speed available even at peak pull.
  const drift = Math.min(72, player.speed * .24) * g.strength * Math.sin(Math.PI * ellipse);
  return { x: dx / distance * drift, y: dy / distance * drift };
}
function applyGravityTide(shot, seconds, kind = "player") {
  if (!isBattleActive() || gravityTide.phase !== "active" || !gravityTideEligible()
    || !Number.isFinite(seconds) || seconds <= 0 || shot.source === "ultimate") return false;
  const vx = shot.vx ?? (kind === "player" ? weapon.speed : 0), vy = shot.vy ?? 0;
  const speed = Math.hypot(vx, vy);
  if (!Number.isFinite(speed) || speed <= 1 || Math.abs(vx) < 1) return false;
  const nx = (shot.x - gravityTide.centerX) / gravityTide.radiusX;
  const ny = (shot.y - gravityTide.centerY) / gravityTide.radiusY;
  const influence = Math.max(0, 1 - nx * nx - ny * ny);
  if (!influence || !gravityTide.strength) return false;
  const base = shot.gravityBaseAngle ?? Math.atan2(vy, vx);
  const pull = clamp((gravityTide.centerY - shot.y) / gravityTide.radiusY, -1, 1);
  const desired = Math.atan2(vy + pull * gravityRules.acceleration * gravityTide.strength * influence * seconds, vx);
  const turn = Math.atan2(Math.sin(desired - base), Math.cos(desired - base));
  const angle = base + clamp(turn, -gravityRules.maxTurn, gravityRules.maxTurn);
  const nextX = Math.cos(angle) * speed;
  // 不让原本朝前的弹突然倒转，亦不改变子弹的标量速度或伤害快照。
  if (nextX * vx <= 0) return false;
  shot.gravityBaseAngle = base; shot.gravityAffected = true;
  shot.vx = nextX; shot.vy = Math.sin(angle) * speed;
  if (kind === "player") shot.angle = angle;
  return true;
}
function resizeGravityTide(scaleX, mapY) {
  gravityTide.centerX *= scaleX;
  gravityTide.centerY = mapY(gravityTide.centerY);
  gravityTide.radiusX = viewport.width * 0.32;
  gravityTide.radiusY = Math.max(75, (flightBounds.bottom - flightBounds.top) * 0.48);
  if (gravityTideBusy()) {
    clearGravityEnemyShots();
    gravityTide.phase = "warning"; gravityTide.elapsed = 0; gravityTide.strength = 0;
  }
}
function drawGravityTide() {
  if (state !== "battle" || !gravityTideBusy()) return;
  const g = gravityTide, warning = g.phase === "warning", quiet = quietCombatMotion();
  const color = warning ? "#d0b2ff" : "#b7a0ff";
  if (typeof drawFlightLattice === "function")
    drawFlightLattice(context, g.centerX, g.centerY, g.radiusX * .88, g.radiusY * .91,
      color, quiet ? 0 : -g.elapsed * .85, warning ? .29 : .34 + g.strength * .24, .58);
  context.save();
  const field = context.createRadialGradient(g.centerX, g.centerY, 0, g.centerX, g.centerY, g.radiusX);
  field.addColorStop(0, "#aa7eff12"); field.addColorStop(1, "#8367db00");
  context.fillStyle = field;
  context.fillRect(g.centerX - g.radiusX, g.centerY - g.radiusY, g.radiusX * 2, g.radiusY * 2);
  context.strokeStyle = color; context.lineWidth = 1;
  context.globalAlpha = warning ? 0.24 : 0.18;
  context.setLineDash(warning ? [7, 12] : []);
  context.beginPath(); context.ellipse(g.centerX, g.centerY, g.radiusX, g.radiusY, 0, 0, Math.PI * 2); context.stroke();
  context.setLineDash([]);
  // 低对比弧线用于提前说明弯曲方向，不遮盖实弹或改变碰撞范围。
  for (const side of [-1, 1]) {
    for (const row of [0.35, 0.65]) {
      const y = g.centerY + g.radiusY * row * side;
      context.beginPath(); context.moveTo(g.centerX - g.radiusX * 0.78, y);
      context.quadraticCurveTo(g.centerX, g.centerY, g.centerX + g.radiusX * 0.78, y - side * g.radiusY * 0.2); context.stroke();
    }
  }
  const arrowCount = 10;
  for (let index = 0; index < arrowCount; index++) {
    const angle = index * Math.PI * 2 / arrowCount;
    const reach = index % 2 ? .77 : .52;
    const x = g.centerX + Math.cos(angle) * g.radiusX * reach;
    const y = g.centerY + Math.sin(angle) * g.radiusY * reach;
    const aim = Math.atan2(g.centerY - y, g.centerX - x);
    const length = warning ? 15 : 20 + g.strength * 5;
    context.save();
    context.translate(x, y); context.rotate(aim);
    context.globalAlpha = warning ? .54 : .32 + g.strength * .33;
    context.lineWidth = 1.5; context.beginPath();
    context.moveTo(-length / 2, 0); context.lineTo(length / 2, 0);
    context.lineTo(length / 2 - 5, -4); context.moveTo(length / 2, 0);
    context.lineTo(length / 2 - 5, 4); context.stroke();
    context.restore();
  }
  if (!warning && !quiet) {
    const count = visualQuality.id === "low" ? 14 : 24;
    context.fillStyle = "#dccaff";
    for (let index = 0; index < count; index++) {
      const angle = index * 2.39996;
      const progress = (index * .471 + g.elapsed * (.23 + (index % 3) * .065)) % 1;
      const distance = 1 - progress;
      const x = g.centerX + Math.cos(angle) * g.radiusX * distance;
      const y = g.centerY + Math.sin(angle) * g.radiusY * distance;
      context.globalAlpha = .13 + Math.sin(progress * Math.PI) * .42 * g.strength;
      context.fillRect(x, y, index % 5 === 0 ? 2.5 : 1.5, 1.5);
    }
  }
  context.globalAlpha = 0.6;
  const pulse = quiet ? 1 : 1 + Math.sin(g.elapsed * 3) * 0.08;
  context.beginPath(); context.ellipse(g.centerX, g.centerY, 12 * pulse, 6 * pulse, -0.35, 0, Math.PI * 2); context.stroke();
  context.globalAlpha = 0.9; context.fillStyle = "#0b1220e8";
  const seconds = Math.max(1, Math.ceil(gravityRules.warning - g.elapsed));
  const label = warning ? tr("引力潮汐预警 · " + seconds + " 秒", "Gravity tide warning · " + seconds + " s")
    : tr("引力潮汐 · 战机与弹道向核心偏移", "Gravity tide · Ships and shots pulled inward");
  const y = Math.min(150, viewport.height * 0.22);
  context.beginPath(); context.roundRect(viewport.width / 2 - 154, y - 16, 308, 31, 6); context.fill();
  context.fillStyle = color; context.textAlign = "center"; context.font = "12px Microsoft YaHei,sans-serif";
  context.fillText(label, viewport.width / 2, y + 4);
  context.restore();
}
