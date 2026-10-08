"use strict";

// 第 4 步扩展：敌机血量随有效战斗时间增加，玩家受伤之后加入。
const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");
const app = document.querySelector("#game-app");
const startScreen = document.querySelector("#start-screen");
const battleScreen = document.querySelector("#battle-screen");
const startButton = document.querySelector("#start-button");
const menuButton = document.querySelector("#menu-button");
const fullscreenButton = document.querySelector("#fullscreen-button");
const movementHint = document.querySelector("#movement-hint");
const pauseHint = document.querySelector("#pause-hint");
const statusMessage = document.querySelector("#status");
const fighterImage = document.querySelector("#fighter-art");
const scoreDisplay = document.querySelector("#score");
const battleClock = document.querySelector("#battle-clock");
const enemyStrength = document.querySelector("#enemy-strength");
const assetStatus = document.querySelector("#asset-status");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let state = "menu";
let previousTime = 0;
let windowActive = true;
// interval 是发射间隔（秒），speed 是子弹每秒前进的距离。
const weapon = { interval: 0.2, speed: 720, length: 26, damage: 1 };
const bullets = [];
let shotCooldown = 0;
let muzzleFlash = 0;
const enemyRules = { interval: 1.2, speed: 110, points: 100, maxOnScreen: 14, healthStep: 20, maxHp: 5 };
const enemies = [];
const explosions = [];
let enemyCooldown = 0.6;
let enemySpawnCount = 0;
let score = 0;
let battleTime = 0;
let lastDifficultySecond = -1;
const pressedKeys = new Set();
const movementKeys = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "KeyW", "KeyA", "KeyS", "KeyD",
]);
// viewport 使用屏幕像素作为坐标；高清画布另按设备像素密度绘制。
const viewport = { width: 1280, height: 720 };
const player = { x: 200, y: 360, width: 180, height: 120, speed: 300 };
const flightBounds = { left: 0, right: 0, top: 0, bottom: 0 };
const stars = Array.from({ length: 150 }, () => ({
  x: Math.random(), y: Math.random(),
  radius: Math.random() * 1.15 + 0.3,
  speed: Math.random() * 32 + 12,
  alpha: Math.random() * 0.55 + 0.15,
}));

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
function resetPlayer() {
  player.x = clamp(viewport.width * 0.17, flightBounds.left, flightBounds.right);
  player.y = (flightBounds.top + flightBounds.bottom) / 2;
}
function resizeBattlefield() {
  const rect = canvas.getBoundingClientRect();
  const oldWidth = viewport.width;
  const oldHeight = viewport.height;
  viewport.width = Math.max(1, Math.round(rect.width));
  viewport.height = Math.max(1, Math.round(rect.height));
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(viewport.width * pixelRatio);
  canvas.height = Math.round(viewport.height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  player.width = Math.min(180, viewport.width * 0.24, viewport.height * 0.28);
  player.height = player.width * 2 / 3;
  // HUD 和底部按钮之外，整架战机（包含尾焰）都应留在战场内。
  flightBounds.left = Math.min(viewport.width / 2, player.width / 2 + 12);
  flightBounds.right = Math.max(flightBounds.left, viewport.width - player.width / 2 - 12);
  const topBar = viewport.width <= 520 ? 140 : Math.min(90, viewport.height * 0.22);
  const bottomBar = Math.min(65, viewport.height * 0.18);
  flightBounds.top = Math.min(viewport.height / 2, topBar + player.height / 2 + 8);
  flightBounds.bottom = Math.max(flightBounds.top, viewport.height - bottomBar - player.height / 2 - 8);
  player.x = clamp(player.x / oldWidth * viewport.width, flightBounds.left, flightBounds.right);
  player.y = clamp(player.y / oldHeight * viewport.height, flightBounds.top, flightBounds.bottom);
  if (state === "menu") resetPlayer();
  resetWeapons();
  resetEncounter(false);
  clearMovement();
}

function readyFighter() {
  startButton.disabled = !fighterImage.naturalWidth;
  assetStatus.hidden = !!fighterImage.naturalWidth;
}
fighterImage.addEventListener("load", readyFighter);
fighterImage.addEventListener("error", readyFighter);
if (fighterImage.complete) readyFighter();

function showScreen(nextState) {
  clearMovement();
  resetWeapons();
  resetEncounter();
  resetPlayer();
  state = nextState;
  const inBattle = state === "battle";
  startScreen.hidden = inBattle;
  battleScreen.hidden = !inBattle;
  movementHint.hidden = false;
  canvas.tabIndex = inBattle ? 0 : -1;
  canvas.setAttribute("aria-label", inBattle
    ? "可操作的横向星空战场。红色战机自动向右射击，方向键或 WASD 按屏幕方向移动。"
    : "横向星空战场。点击开始游戏后，红色战机从左侧出发。");
  statusMessage.textContent = inBattle
    ? "已进入横向战场。上下移动瞄准敌机，机头自动向右射击。敌机初始一击击毁，每 20 秒新敌机血量增加，最高 5 点。击毁得 100 分，当前训练不会受伤。"
    : "已返回开始画面。";
  (inBattle ? canvas : startButton).focus({ preventScroll: true });
  updatePauseHint();
}
startButton.addEventListener("click", () => showScreen("battle"));
menuButton.addEventListener("click", () => showScreen("menu"));

// 浏览器要求由用户点击按钮才能进入真正的全屏；默认已铺满页面。
fullscreenButton.hidden = !document.fullscreenEnabled || !app.requestFullscreen;
fullscreenButton.addEventListener("click", async () => {
  clearMovement();
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await app.requestFullscreen();
  } catch {
    statusMessage.textContent = "浏览器未允许全屏。战场仍铺满当前窗口，也可以使用 F11。";
  }
  if (state === "battle") canvas.focus({ preventScroll: true });
});
document.addEventListener("fullscreenchange", () => {
  const isFullscreen = document.fullscreenElement === app;
  fullscreenButton.textContent = isFullscreen ? "⛶ 退出全屏" : "⛶ 全屏";
  fullscreenButton.setAttribute("aria-pressed", String(isFullscreen));
  resizeBattlefield();
  if (state === "battle") canvas.focus({ preventScroll: true });
});
window.addEventListener("resize", resizeBattlefield);
window.addEventListener("keydown", (event) => {
  if (!isBattleActive()) return;
  if (event.altKey || event.ctrlKey || event.metaKey || !movementKeys.has(event.code)) return;
  event.preventDefault();
  pressedKeys.add(event.code);
});
window.addEventListener("keyup", (event) => {
  pressedKeys.delete(event.code);
  if (state === "battle" && document.activeElement === canvas && movementKeys.has(event.code)) event.preventDefault();
});
function clearMovement() {
  pressedKeys.clear();
  previousTime = 0;
}
// 切走窗口、切到其他按钮时，暂停整个战场，恢复后不补发积压子弹。
function isBattleActive() {
  return state === "battle" && windowActive && !document.hidden && document.activeElement === canvas;
}
function updatePauseHint() {
  pauseHint.hidden = state !== "battle" || isBattleActive();
}
window.addEventListener("blur", () => {
  windowActive = false;
  clearMovement();
  updatePauseHint();
});
window.addEventListener("focus", () => {
  windowActive = true;
  previousTime = 0;
  updatePauseHint();
});
document.addEventListener("visibilitychange", () => {
  clearMovement();
  updatePauseHint();
});
canvas.addEventListener("blur", () => {
  clearMovement();
  updatePauseHint();
});
canvas.addEventListener("focus", () => {
  previousTime = 0;
  updatePauseHint();
});
canvas.addEventListener("pointerdown", () => {
  if (state === "battle") canvas.focus({ preventScroll: true });
});
function updatePlayer(seconds) {
  if (!isBattleActive()) return;
  const horizontal = Number(pressedKeys.has("ArrowRight") || pressedKeys.has("KeyD"))
    - Number(pressedKeys.has("ArrowLeft") || pressedKeys.has("KeyA"));
  const vertical = Number(pressedKeys.has("ArrowDown") || pressedKeys.has("KeyS"))
    - Number(pressedKeys.has("ArrowUp") || pressedKeys.has("KeyW"));
  if (horizontal === 0 && vertical === 0) return;
  const length = Math.hypot(horizontal, vertical);
  player.x = clamp(player.x + horizontal / length * player.speed * seconds, flightBounds.left, flightBounds.right);
  player.y = clamp(player.y + vertical / length * player.speed * seconds, flightBounds.top, flightBounds.bottom);
  movementHint.hidden = true;
}
function resetWeapons() {
  bullets.length = 0;
  shotCooldown = 0;
  muzzleFlash = 0;
}
function muzzlePosition() {
  // 透明图片的机头位于中心右侧约 46.5% 机身宽度处。
  return { x: player.x + player.width * 0.465, y: player.y };
}
function updateShooting(seconds) {
  if (!isBattleActive()) return;
  for (let index = bullets.length - 1; index >= 0; index--) {
    const bullet = bullets[index];
    bullet.previousX = bullet.x;
    bullet.x += weapon.speed * seconds;
  }
  muzzleFlash = Math.max(0, muzzleFlash - seconds);
  shotCooldown -= seconds;
  if (shotCooldown <= 0.00000001) {
    const muzzle = muzzlePosition();
    bullets.push({ x: muzzle.x + 3, previousX: muzzle.x + 3, y: muzzle.y });
    shotCooldown += weapon.interval;
    muzzleFlash = 0.055;
  }
}
function resetEncounter(resetScore = true) {
  enemies.length = 0;
  explosions.length = 0;
  enemyCooldown = 0.6;
  enemySpawnCount = 0;
  if (resetScore) {
    score = 0;
    battleTime = 0;
    lastDifficultySecond = -1;
  }
  updateDifficultyDisplay();
  scoreDisplay.textContent = String(score).padStart(6, "0");
}
function enemyHealthForTime() {
  // 浮点数计算可能略小于整秒，微小容差确保分界点准时升级。
  return Math.min(enemyRules.maxHp, 1 + Math.floor((battleTime + 0.00000001) / enemyRules.healthStep));
}
function updateDifficultyDisplay() {
  const wholeSeconds = Math.floor(battleTime + 0.00000001);
  if (wholeSeconds === lastDifficultySecond) return;
  lastDifficultySecond = wholeSeconds;
  const minutes = Math.floor(wholeSeconds / 60);
  battleClock.textContent = String(minutes).padStart(2, "0") + ":" + String(wholeSeconds % 60).padStart(2, "0");
  enemyStrength.textContent = enemyHealthForTime() + " HP";
}
function spawnEnemy() {
  const width = Math.min(100, player.width * 0.65);
  const lanes = [0.5, 0.22, 0.78, 0.36, 0.64];
  // 第一架出现在中间，方便新手立即体验命中；之后分布到不同高度。
  const lane = lanes[enemySpawnCount % lanes.length];
  const jitter = enemySpawnCount === 0 ? 0 : (Math.random() - 0.5) * 24;
  const y = clamp(flightBounds.top + (flightBounds.bottom - flightBounds.top) * lane + jitter,
    flightBounds.top, flightBounds.bottom);
  const x = viewport.width + width / 2 + 4;
  const maxHp = enemyHealthForTime();
  enemies.push({ x, previousX: x, y, width, height: width * 0.64, hp: maxHp, maxHp, hitFlash: 0,
    speed: enemyRules.speed * (0.9 + Math.random() * 0.2) });
  enemySpawnCount++;
}
function createExplosion(enemy) {
  explosions.push({ x: enemy.x, y: enemy.y, age: 0,
    duration: reducedMotion.matches ? 0.2 : 0.55,
    particles: Array.from({ length: 12 }, (_, index) => {
      const angle = index / 12 * Math.PI * 2 + Math.random() * 0.3;
      const speed = 45 + Math.random() * 95;
      return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
    }),
  });
}
function bulletHitsEnemy(bullet, enemy) {
  const halfWidth = enemy.width * 0.45;
  const halfHeight = enemy.height * 0.4;
  if (Math.abs(bullet.y - enemy.y) > halfHeight + 2.5) return false;
  // 检查上一帧到这一帧走过的整段路径，避免高速子弹穿过敌机却没有命中。
  const previousLeft = bullet.previousX - enemy.previousX;
  const currentRight = bullet.x + weapon.length - enemy.x;
  return previousLeft <= halfWidth && currentRight >= -halfWidth;
}
function updateEncounter(seconds) {
  if (!isBattleActive()) return;
  battleTime += seconds;
  updateDifficultyDisplay();
  for (let index = explosions.length - 1; index >= 0; index--) {
    explosions[index].age += seconds;
    if (explosions[index].age >= explosions[index].duration) explosions.splice(index, 1);
  }
  for (let index = enemies.length - 1; index >= 0; index--) {
    const enemy = enemies[index];
    enemy.hitFlash = Math.max(0, enemy.hitFlash - seconds);
    enemy.previousX = enemy.x;
    enemy.x -= enemy.speed * seconds;
    if (enemy.x + enemy.width / 2 < 0) enemies.splice(index, 1);
  }
  enemyCooldown -= seconds;
  if (enemyCooldown <= 0.00000001) {
    if (enemies.length < enemyRules.maxOnScreen) spawnEnemy();
    enemyCooldown += enemyRules.interval;
  }
  for (let bulletIndex = bullets.length - 1; bulletIndex >= 0; bulletIndex--) {
    const bullet = bullets[bulletIndex];
    let hitIndex = -1;
    // 选择弹道上先遇到的敌机。一颗子弹造成一次伤害，不会穿透整排。
    for (let enemyIndex = 0; enemyIndex < enemies.length; enemyIndex++) {
      const enemy = enemies[enemyIndex];
      if (enemy.x - enemy.width / 2 >= viewport.width || !bulletHitsEnemy(bullet, enemy)) continue;
      if (hitIndex < 0 || enemy.x < enemies[hitIndex].x) hitIndex = enemyIndex;
    }
    if (hitIndex >= 0) {
      const enemy = enemies[hitIndex];
      bullets.splice(bulletIndex, 1);
      enemy.hp = Math.max(0, enemy.hp - weapon.damage);
      enemy.hitFlash = 0.08;
      if (enemy.hp === 0) {
        createExplosion(enemy);
        enemies.splice(hitIndex, 1);
        score += enemyRules.points;
        scoreDisplay.textContent = String(score).padStart(6, "0");
        movementHint.hidden = true;
      }
    }
  }
  // 碰撞判定后再清理出界子弹，确保靠近右边缘的命中也能算分。
  for (let index = bullets.length - 1; index >= 0; index--) {
    if (bullets[index].x > viewport.width) bullets.splice(index, 1);
  }
}
function drawEnemies() {
  for (const enemy of enemies) {
    context.save();
    context.translate(enemy.x, enemy.y);
    const w = enemy.width, h = enemy.height;
    const polygon = (points, color) => {
      context.beginPath();
      points.forEach(([x, y], index) => {
        if (index === 0) context.moveTo(x * w, y * h);
        else context.lineTo(x * w, y * h);
      });
      context.closePath();
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = "#8cabc9";
      context.lineWidth = 1;
      context.stroke();
    };
    // 敌方拦截机朝左，冷色装甲与红色玩家战机形成区别。
    polygon([[-0.5,0],[-0.12,-0.19],[0.25,-0.5],[0.38,-0.45],[0.24,-0.1],
      [0.45,-0.1],[0.5,0],[0.45,0.1],[0.24,0.1],[0.38,0.45],[0.25,0.5],[-0.12,0.19]], "#34475f");
    polygon([[-0.5,0],[-0.02,-0.14],[0.35,-0.11],[0.43,0],[0.35,0.11],[-0.02,0.14]], enemy.hitFlash > 0 && !reducedMotion.matches ? "#e5f1ff" : "#8399b2");
    polygon([[-0.2,-0.07],[0.25,-0.07],[0.32,0],[-0.2,0.07]], "#1d293e");
    context.fillStyle = "#ff6d77";
    context.beginPath();
    context.ellipse(-w * 0.1, 0, w * 0.09, h * 0.055, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#7bd7ff";
    context.shadowColor = "#54c6ff";
    context.shadowBlur = reducedMotion.matches ? 0 : 9;
    context.fillRect(w * 0.29, -h * 0.23, w * 0.16, h * 0.065);
    context.fillRect(w * 0.29, h * 0.165, w * 0.16, h * 0.065);
    // 血条与数值同时显示：例如 2/3 表示还剩 2 点，需要再命中两次。
    context.shadowBlur = 0;
    const barWidth = w * 0.64;
    const barY = -h / 2 - 12;
    context.fillStyle = "#142135";
    context.fillRect(-barWidth / 2, barY, barWidth, 4);
    context.fillStyle = enemy.hp < enemy.maxHp ? "#ffb45f" : "#8bd8f2";
    context.fillRect(-barWidth / 2, barY, barWidth * enemy.hp / enemy.maxHp, 4);
    context.strokeStyle = "#70859a";
    context.strokeRect(-barWidth / 2, barY, barWidth, 4);
    context.fillStyle = "#142135";
    for (let segment = 1; segment < enemy.maxHp; segment++) {
      context.fillRect(-barWidth / 2 + barWidth * segment / enemy.maxHp, barY, 1, 4);
    }
    context.fillStyle = "#cfdfed";
    context.font = "11px Consolas, monospace";
    context.textAlign = "center";
    context.fillText(enemy.hp + "/" + enemy.maxHp, 0, barY - 5);
    context.restore();
  }
}
function drawExplosions() {
  for (const explosion of explosions) {
    const progress = explosion.age / explosion.duration;
    context.save();
    context.globalAlpha = 1 - progress;
    context.strokeStyle = "#ffb864";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(explosion.x, explosion.y, reducedMotion.matches ? 13 : 8 + progress * 40, 0, Math.PI * 2);
    context.stroke();
    if (!reducedMotion.matches) {
      context.fillStyle = "#ff8d4c";
      for (const particle of explosion.particles) {
        context.fillRect(explosion.x + particle.vx * explosion.age - 2,
          explosion.y + particle.vy * explosion.age - 2, 4 * (1 - progress) + 1, 3);
      }
    }
    context.fillStyle = "#ffe3a5";
    context.font = "600 16px Consolas, monospace";
    context.textAlign = "center";
    context.fillText("+" + enemyRules.points, explosion.x,
      explosion.y - 28 - (reducedMotion.matches ? 0 : progress * 24));
    context.restore();
  }
}
function drawBullets() {
  context.save();
  context.shadowColor = "#ff793e";
  context.shadowBlur = reducedMotion.matches ? 0 : 12;
  for (const bullet of bullets) {
    context.fillStyle = "#ff8846";
    context.fillRect(bullet.x, bullet.y - 2.5, weapon.length, 5);
    context.fillStyle = "#fff0bb";
    context.fillRect(bullet.x + 3, bullet.y - 1, weapon.length - 4, 2);
  }
  context.restore();
}
function drawMuzzleFlash() {
  if (state !== "battle" || muzzleFlash <= 0 || reducedMotion.matches) return;
  const muzzle = muzzlePosition();
  context.save();
  context.globalAlpha = muzzleFlash / 0.055;
  context.fillStyle = "#ffdf9d";
  context.shadowColor = "#ff8a4a";
  context.shadowBlur = 14;
  context.beginPath();
  context.ellipse(muzzle.x + 3, muzzle.y, 8, 4, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}
function drawPlayer() {
  if (state !== "battle" || !fighterImage.complete || !fighterImage.naturalWidth) return;
  context.drawImage(fighterImage, player.x - player.width / 2, player.y - player.height / 2, player.width, player.height);
}
function drawFrame(time) {
  const seconds = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
  previousTime = time;
  updatePlayer(seconds);
  updateShooting(seconds);
  updateEncounter(seconds);
  context.clearRect(0, 0, viewport.width, viewport.height);
  for (const star of stars) {
    // 原来的向下滚动顺时针转 90 度，变成从右向左滚动。
    if (!reducedMotion.matches) star.x = (star.x - star.speed * seconds / viewport.width + 1) % 1;
    context.globalAlpha = star.alpha;
    context.fillStyle = "#c3d3ef";
    context.beginPath();
    context.arc(star.x * viewport.width, star.y * viewport.height, star.radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
  drawEnemies();
  drawBullets();
  drawPlayer();
  drawMuzzleFlash();
  drawExplosions();
  window.requestAnimationFrame(drawFrame);
}
resizeBattlefield();
window.requestAnimationFrame(drawFrame);




