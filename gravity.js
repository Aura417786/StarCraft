"use strict";

const gravityRules = { warning: 2.4, duration: 6, cooldown: 12, firstDelay: 3,
  acceleration: 410, maxTurn: 0.30 };
const gravityTide = { phase: "idle", elapsed: 0, strength: 0, centerX: 0, centerY: 0,
  radiusX: 0, radiusY: 0, sequence: 0 };
function gravityTideBusy() { return gravityTide.phase === "warning" || gravityTide.phase === "active"; }
function gravityTideEligible() {
  return state === "battle" && !evolution.pending && !isBossDeathPlaying()
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
  statusMessage.textContent = "引力潮汐预警，2.4 秒后区域内双方普通子弹将弯向引力核心。";
}
function updateGravityTide(seconds) {
  if (state !== "battle" || evolution.pending || isBossDeathPlaying()) { suspendGravityTide(); return; }
  if (!isBattleActive() || !Number.isFinite(seconds) || seconds <= 0) return;
  if (!gravityTideEligible()) { suspendGravityTide(); return; }
  gravityTide.elapsed += seconds;
  const t = gravityTide.elapsed;
  if (gravityTide.phase === "idle" && t + 1e-9 >= gravityRules.firstDelay) startGravityWarning();
  else if (gravityTide.phase === "warning" && t + 1e-9 >= gravityRules.warning) {
    // 保留完整的生效时长，长帧不会跳过预警或直接结算整次潮汐。
    gravityTide.phase = "active"; gravityTide.elapsed = 0;
    statusMessage.textContent = "引力潮汐生效，双方普通弹道向紫色核心弯曲；可调整位置借势射击。";
  } else if (gravityTide.phase === "active") {
    gravityTide.strength = Math.max(0, Math.min(1, t / 0.55, (gravityRules.duration - t) / 0.55));
    if (t + 1e-9 >= gravityRules.duration) {
      gravityTide.phase = "rest"; gravityTide.elapsed = 0; gravityTide.strength = 0;
      statusMessage.textContent = "引力潮汐平息。";
    }
  } else if (gravityTide.phase === "rest" && t + 1e-9 >= gravityRules.cooldown) startGravityWarning();
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
  const g = gravityTide, warning = g.phase === "warning", quiet = reducedMotion.matches;
  const color = warning ? "#d0b2ff" : "#b7a0ff";
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
  context.globalAlpha = 0.6;
  const pulse = quiet ? 1 : 1 + Math.sin(g.elapsed * 3) * 0.08;
  context.beginPath(); context.ellipse(g.centerX, g.centerY, 12 * pulse, 6 * pulse, -0.35, 0, Math.PI * 2); context.stroke();
  context.globalAlpha = 0.9; context.fillStyle = "#0b1220e8";
  const label = warning ? "引力潮汐预警 · " + Math.max(1, Math.ceil(gravityRules.warning - g.elapsed)) + " 秒"
    : "引力潮汐 · 双方普通弹道弯曲";
  const y = Math.min(150, viewport.height * 0.22);
  context.beginPath(); context.roundRect(viewport.width / 2 - 154, y - 16, 308, 31, 6); context.fill();
  context.fillStyle = color; context.textAlign = "center"; context.font = "12px Microsoft YaHei,sans-serif";
  context.fillText(label, viewport.width / 2, y + 4);
  context.restore();
}
