"use strict";

const firingStyle = { mode: "spread", lastInterval: 0.2 };
const stanceButton = document.querySelector("#stance-button");
function updateFiringStyleDisplay() {
  const focus = firingStyle.mode === "focus";
  const key = typeof controlBindingLabel === "function" ? controlBindingLabel("stance") : "Shift";
  const lance = typeof evolution !== "undefined" && evolution.pierce >= 3;
  const hint = tr(`轻点 ${key} 切换射击姿态，长按加速`, `Tap ${key} to switch fire modes. Hold to boost.`);
  stanceButton.textContent = (focus ? tr("聚焦 · 集中火力", "Focused fire") : tr("扩散 · 覆盖射击", "Spread fire")) + "  " + key;
  stanceButton.title = hint + (lance ? tr("。松开可发射蓄力翼刃。", " Release to fire a charged wing lance.") : "");
  stanceButton.dataset.mode = firingStyle.mode;
  stanceButton.setAttribute("aria-pressed", String(focus));
  stanceButton.setAttribute("aria-label", (focus ? tr("当前聚焦射击。", "Focused fire active. ")
    : tr("当前扩散射击。", "Spread fire active. ")) + stanceButton.title);
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
  if (Math.abs(dx) < 1e-12) {
    if (x < lowX || x > highX) return Infinity;
  } else {
    const a = (lowX - x) / dx, b = (highX - x) / dx;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return Infinity;
  }
  if (Math.abs(dy) < 1e-12) {
    if (y < lowY || y > highY) return Infinity;
  } else {
    const a = (lowY - y) / dy, b = (highY - y) / dy;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return Infinity;
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
  return Math.min(
    projectileBoxEntry(x, y, dx, dy, -r, length + r, -half, half),
    projectileBoxEntry(x, y, dx, dy, 0, length, -half - r, half + r),
    projectileCircleEntry(x, y, dx, dy, 0, -half, r),
    projectileCircleEntry(x, y, dx, dy, 0, half, r),
    projectileCircleEntry(x, y, dx, dy, length, -half, r),
    projectileCircleEntry(x, y, dx, dy, length, half, r));
}

// Swept hulls mark cells with enemy-array indices. The normal enemy limit is
// 14, so one 32-bit mask per cell deduplicates intersecting cells and preserves
// the existing order for shots that hit multiple targets at the same instant.
const projectileEnemyGrid = { cellSize: 128, cells: new Uint32Array(0), columns: 0, rows: 0, ready: false };

function invalidateProjectileEnemyGrid() { projectileEnemyGrid.ready = false; }

function projectileGridCell(position, count) {
  return clamp(Math.floor(position / projectileEnemyGrid.cellSize), 0, count - 1);
}

function rebuildProjectileEnemyGrid() {
  const grid = projectileEnemyGrid;
  grid.columns = Math.max(1, Math.ceil(viewport.width / grid.cellSize));
  grid.rows = Math.max(1, Math.ceil(viewport.height / grid.cellSize));
  const cellCount = grid.columns * grid.rows;
  if (grid.cells.length < cellCount) grid.cells = new Uint32Array(cellCount);
  else grid.cells.fill(0, 0, cellCount);
  for (let index = 0; index < enemies.length; index++) {
    const enemy = enemies[index];
    const oldX = enemy.previousX ?? enemy.x, oldY = enemy.previousY ?? enemy.y;
    const halfWidth = enemy.width * .45, halfHeight = enemy.height * .40;
    const left = projectileGridCell(Math.min(oldX, enemy.x) - halfWidth, grid.columns);
    const right = projectileGridCell(Math.max(oldX, enemy.x) + halfWidth, grid.columns);
    const top = projectileGridCell(Math.min(oldY, enemy.y) - halfHeight, grid.rows);
    const bottom = projectileGridCell(Math.max(oldY, enemy.y) + halfHeight, grid.rows);
    const enemyBit = 1 << index;
    for (let row = top; row <= bottom; row++) {
      const offset = row * grid.columns;
      for (let column = left; column <= right; column++) grid.cells[offset + column] |= enemyBit;
    }
  }
  grid.ready = true;
}

function projectileEnemyCandidates(bullet) {
  // The scan is cheaper for sparse waves. Larger scripted encounters can still
  // use the original scan if they exceed a single cell mask's capacity.
  if (enemies.length < 5 || enemies.length > 32 || bullets.length < 10) return null;
  const grid = projectileEnemyGrid;
  if (!grid.ready) rebuildProjectileEnemyGrid();
  const angle = bullet.angle ?? 0;
  const length = (bullet.length ?? weapon.length) / 2;
  const radius = bullet.halfHeight ?? 2.5;
  const cx = Math.cos(angle), sy = Math.sin(angle);
  const centerX = cx * length, centerY = sy * length;
  const halfX = Math.abs(centerX) + Math.abs(sy) * radius;
  const halfY = Math.abs(centerY) + Math.abs(cx) * radius;
  const oldX = bullet.previousX ?? bullet.x, oldY = bullet.previousY ?? bullet.y;
  const epsilon = .000001; // Keep boundary touches despite unrelated arithmetic round-off.
  const left = projectileGridCell(Math.min(oldX, bullet.x) + centerX - halfX - epsilon, grid.columns);
  const right = projectileGridCell(Math.max(oldX, bullet.x) + centerX + halfX + epsilon, grid.columns);
  const top = projectileGridCell(Math.min(oldY, bullet.y) + centerY - halfY - epsilon, grid.rows);
  const bottom = projectileGridCell(Math.max(oldY, bullet.y) + centerY + halfY + epsilon, grid.rows);
  let candidates = 0;
  for (let row = top; row <= bottom; row++) {
    const offset = row * grid.columns;
    for (let column = left; column <= right; column++) candidates |= grid.cells[offset + column];
  }
  return candidates;
}

function findProjectileEnemyHit(bullet) {
  let candidates = projectileEnemyCandidates(bullet);
  let target = null, best = Infinity;
  for (let index = 0; index < enemies.length; index++) {
    if (candidates !== null) {
      if (!candidates) break;
      index = 31 - Math.clz32(candidates & -candidates);
      candidates &= candidates - 1;
    }
    const enemy = enemies[index];
    if (bullet.hitTargets.has(enemy) || enemy.x - enemy.width / 2 >= viewport.width) continue;
    const time = projectileEnemyEntry(bullet, enemy);
    if (time < best) { target = enemy; best = time; }
  }
  return target ? { kind: "enemy", target, time: best } : null;
}

const projectilePoolSlots = new WeakMap();
const sparePlayerProjectiles = [];
const spareHostileProjectiles = [];
const retiredCombatProjectiles = [];

function makeProjectileSlot(pool, friendly) {
  const shot = {};
  const slot = { shot, pool, hits: friendly ? new Set() : null,
    seeker: friendly ? { retarget: 0, target: null } : null };
  projectilePoolSlots.set(shot, slot);
  return slot;
}

for (let index = 0; index < 128; index++) sparePlayerProjectiles.push(makeProjectileSlot(sparePlayerProjectiles, true));
for (let index = 0; index < 260; index++) spareHostileProjectiles.push(makeProjectileSlot(spareHostileProjectiles, false));

function acquirePlayerRound(x, y, angle, vx, vy, halfHeight, length, color, core) {
  const spare = sparePlayerProjectiles.pop();
  const shot = spare?.shot ?? {};
  shot.x = shot.previousX = x;
  shot.y = shot.previousY = y;
  shot.angle = angle;
  shot.vx = vx;
  shot.vy = vy;
  shot.halfHeight = halfHeight;
  shot.length = length;
  shot.color = color;
  shot.core = core;
  shot.hitTargets = spare?.hits ?? new Set();
  return shot;
}

function acquirePlayerRoundSeeker(shot) {
  return projectilePoolSlots.get(shot)?.seeker ?? { retarget: 0, target: null };
}

function acquireHostileRound(x, y, vx, vy, radius) {
  const spare = spareHostileProjectiles.pop();
  const shot = spare?.shot ?? {};
  shot.x = shot.previousX = x;
  shot.y = shot.previousY = y;
  shot.vx = vx;
  shot.vy = vy;
  shot.radius = radius;
  shot.age = 0;
  return shot;
}

function queueCombatRoundForRecycle(shot) {
  const slot = projectilePoolSlots.get(shot);
  if (!slot) return;
  if (slot.hits || !evolutionWeapons.absorbed.includes(shot)) retiredCombatProjectiles.push(slot);
}

function retireCombatRound(list, index) {
  if (index < 0 || index >= list.length) return;
  queueCombatRoundForRecycle(list[index]);
  for (let cursor = index + 1; cursor < list.length; cursor++) list[cursor - 1] = list[cursor];
  list.length--;
}

function clearCombatRounds(list) {
  for (const shot of list) queueCombatRoundForRecycle(shot);
  list.length = 0;
}

function recycleCombatRounds() {
  // Hits and bursts can still read a retired projectile during this sim step.
  // Only reset fields at the next step, when those consumers have returned.
  for (const slot of retiredCombatProjectiles) {
    const shot = slot.shot;
    for (const key in shot) delete shot[key];
    slot.hits?.clear();
    if (slot.seeker) {
      slot.seeker.retarget = 0;
      slot.seeker.target = null;
    }
    slot.pool.push(slot);
  }
  retiredCombatProjectiles.length = 0;
}

function makeCombatExplosion() {
  return { x: 0, y: 0, age: 0, points: 0, duration: 0,
    particles: Array.from({ length: 12 }, () => ({ vx: 0, vy: 0 })) };
}
const spareCombatExplosionLimit = 24;
const spareCombatExplosions = Array.from({ length: spareCombatExplosionLimit }, makeCombatExplosion);

function addCombatExplosion(x, y, points, duration) {
  const explosion = spareCombatExplosions.pop() ?? makeCombatExplosion();
  explosion.x = x;
  explosion.y = y;
  explosion.age = 0;
  explosion.points = points;
  explosion.duration = duration;
  for (let index = 0; index < explosion.particles.length; index++) {
    const angle = index / 12 * Math.PI * 2 + Math.random() * 0.3;
    const speed = 45 + Math.random() * 95;
    const particle = explosion.particles[index];
    particle.vx = Math.cos(angle) * speed;
    particle.vy = Math.sin(angle) * speed;
  }
  explosions.push(explosion);
}

function advanceCombatExplosions(seconds) {
  let retained = 0;
  for (const explosion of explosions) {
    explosion.age += seconds;
    if (explosion.age >= explosion.duration) {
      if (spareCombatExplosions.length < spareCombatExplosionLimit) spareCombatExplosions.push(explosion);
    }
    else explosions[retained++] = explosion;
  }
  explosions.length = retained;
}

function clearCombatExplosions() {
  for (const explosion of explosions) {
    if (spareCombatExplosions.length === spareCombatExplosionLimit) break;
    spareCombatExplosions.push(explosion);
  }
  explosions.length = 0;
}
