"use strict";

const firingStyle = { mode: "spread", lastInterval: 0.2 };
const stanceButton = document.querySelector("#stance-button");
function updateFiringStyleDisplay() {
  const focus = firingStyle.mode === "focus";
  const lance = typeof evolution !== "undefined" && evolution.pierce >= 3;
  stanceButton.textContent = (focus ? tr("聚焦 · 集中火力", "Focused fire") : tr("扩散 · 覆盖射击", "Spread fire")) + "  ⇧ Shift";
  if (lance) stanceButton.title = tr("轻按 Shift 切换，长按并松开 Shift 发射翼刃", "Tap Shift to switch. Hold and release for a lance.");
  else stanceButton.removeAttribute("title");
  stanceButton.dataset.mode = firingStyle.mode;
  stanceButton.setAttribute("aria-pressed", String(focus));
  stanceButton.setAttribute("aria-label", focus ? tr("当前聚焦射击，切换为扩散，快捷键 Shift", "Focused fire active. Press Shift to switch to spread fire.")
    : tr("当前扩散射击，切换为聚焦，快捷键 Shift", "Spread fire active. Press Shift to switch to focused fire."));
}
function resetFiringStyle() { firingStyle.mode = "spread"; updateFiringStyleDisplay(); }
function toggleFiringStyle() {
  if (state !== "battle" || pauseView || evolution.pending || isBossPresentationPlaying() || !windowActive || document.hidden) return false;
  firingStyle.mode = firingStyle.mode === "spread" ? "focus" : "spread";
  updateFiringStyleDisplay();
  updateWeaponDisplay();
  statusMessage.textContent = firingStyle.mode === "focus"
    ? tr("聚焦射击：已有弹道火力合并到机头正前方。", "Focused fire combines your shots into one lane ahead of the ship.")
    : tr("扩散射击：弹道向上下对称展开，覆盖更大范围。", "Spread fire covers a wider area above and below the ship.");
  return true;
}
stanceButton.addEventListener("click", () => {
  if (state !== "battle" || pauseView || evolution.pending) return;
  toggleFiringStyle();
  canvas.focus({ preventScroll: true });
  updatePauseHint();
});
function firingLanes() {
  const count = weapon.lanes;
  if (firingStyle.mode === "focus") return [{ offset: 0, angle: 0, weight: 1 + .16 * (count - 1) }];
  const spacing = Math.min(player.height * 0.18, player.height * 0.9 / Math.max(1, count - 1));
  const yellow = typeof fighterProfile === "function" && fighterProfile().id === "yellow";
  const fan = yellow ? .32 : .24;
  const weight = (1 + (yellow ? .42 : .22) * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    offset: (index - (count - 1) / 2) * spacing,
    angle: count === 1 ? 0 : (index / (count - 1) - 0.5) * fan,
    weight,
  }));
}
function effectiveShotInterval() { return Math.max(1 / 12, weapon.interval / shotRateMultiplier()); }
function reconcileShotCadence() {
  const interval = effectiveShotInterval();
  if (interval !== firingStyle.lastInterval) {
    // 保留当前发射周期进度，避免切换增益时补发或多等一个完整周期。
    shotCooldown *= interval / firingStyle.lastInterval;
    firingStyle.lastInterval = interval;
  }
  return interval;
}
function projectileBoxEntry(x, y, dx, dy, lowX, highX, lowY, highY) {
  let enter = 0, leave = 1;
  for (const [origin, delta, low, high] of [[x, dx, lowX, highX], [y, dy, lowY, highY]]) {
    if (Math.abs(delta) < 1e-12) { if (origin < low || origin > high) return Infinity; }
    else {
      const a = (low - origin) / delta, b = (high - origin) / delta;
      enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
      if (enter > leave) return Infinity;
    }
  }
  return enter;
}
function projectileCircleEntry(x, y, dx, dy, cx, cy, radius) {
  const ox = x - cx, oy = y - cy, c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a < 1e-18) return Infinity;
  const b = 2 * (ox * dx + oy * dy), discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return Infinity;
  const enter = (-b - Math.sqrt(discriminant)) / (2 * a);
  return enter >= 0 && enter <= 1 ? enter : Infinity;
}
function projectileEnemyEntry(bullet, target) {
  const angle = bullet.angle ?? 0, length = bullet.length ?? weapon.length;
  const radius = bullet.halfHeight ?? 2.5;
  const cx = Math.cos(angle), sy = Math.sin(angle);
  const x0 = (bullet.previousX ?? bullet.x) + cx * length / 2 - (target.previousX ?? target.x);
  const y0 = (bullet.previousY ?? bullet.y) + sy * length / 2 - (target.previousY ?? target.y);
  const dx = bullet.x + cx * length / 2 - target.x - x0;
  const dy = bullet.y + sy * length / 2 - target.y - y0;
  const halfWidth = target.width * 0.45 + Math.abs(cx) * length / 2 + Math.abs(sy) * radius;
  const halfHeight = target.height * 0.4 + Math.abs(sy) * length / 2 + Math.abs(cx) * radius;
  return projectileBoxEntry(x0, y0, dx, dy, -halfWidth, halfWidth, -halfHeight, halfHeight);
}
function projectileOrbEntry(bullet, orb) {
  // 将相对路径转到子弹自身坐标，检测圆球与旋转长条的圆角扩张区域。
  const angle = bullet.angle ?? 0, cx = Math.cos(angle), sy = Math.sin(angle);
  const oldX = (orb.previousX ?? orb.x) - (bullet.previousX ?? bullet.x);
  const oldY = (orb.previousY ?? orb.y) - (bullet.previousY ?? bullet.y);
  const newX = orb.x - bullet.x, newY = orb.y - bullet.y;
  const x = oldX * cx + oldY * sy, y = -oldX * sy + oldY * cx;
  const dx = newX * cx + newY * sy - x, dy = -newX * sy + newY * cx - y;
  const length = bullet.length ?? weapon.length, half = bullet.halfHeight ?? 2.5, r = orb.radius;
  let first = Math.min(
    projectileBoxEntry(x, y, dx, dy, -r, length + r, -half, half),
    projectileBoxEntry(x, y, dx, dy, 0, length, -half - r, half + r));
  for (const edge of [0, length]) for (const side of [-half, half]) {
    first = Math.min(first, projectileCircleEntry(x, y, dx, dy, edge, side, r));
  }
  return first;
}
