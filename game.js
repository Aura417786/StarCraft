"use strict";

// 第 1 步只负责切换画面。之后逐步加入移动、射击和碰撞。
const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");
const startScreen = document.querySelector("#start-screen");
const battleScreen = document.querySelector("#battle-screen");
const startButton = document.querySelector("#start-button");
const menuButton = document.querySelector("#menu-button");
const statusMessage = document.querySelector("#status");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// state 表示游戏目前在哪个画面：menu 是开始画面，battle 是战场。
let state = "menu";
let previousTime = 0;
const stars = Array.from({ length: 95 }, () => ({
  x: Math.random() * canvas.width,
  y: Math.random() * canvas.height,
  radius: Math.random() * 1.1 + 0.3,
  speed: Math.random() * 18 + 7,
  alpha: Math.random() * 0.6 + 0.2,
}));

function showScreen(nextState) {
  state = nextState;
  const inBattle = state === "battle";
  startScreen.hidden = inBattle;
  battleScreen.hidden = !inBattle;
  statusMessage.textContent = inBattle
    ? "已进入战场。当前为第 1 步，移动和射击尚未开放。"
    : "已返回开始画面。";
  (inBattle ? menuButton : startButton).focus({ preventScroll: true });
}

startButton.addEventListener("click", () => showScreen("battle"));
menuButton.addEventListener("click", () => showScreen("menu"));

// 用简单图形画出玩家飞机，后续可以替换为图片素材。
function drawPlayer() {
  const x = canvas.width / 2;
  const y = canvas.height - 96;
  context.save();
  context.translate(x, y);
  context.globalAlpha = state === "battle" ? 1 : 0.36;

  context.fillStyle = "#55cfff";
  context.shadowColor = "#4bcaff";
  context.shadowBlur = 18;
  context.beginPath();
  context.moveTo(-6, 22);
  context.lineTo(0, 43);
  context.lineTo(6, 22);
  context.fill();
  context.shadowBlur = 0;

  context.fillStyle = "#b8d4e9";
  context.beginPath();
  context.moveTo(0, -36);
  context.lineTo(12, 2);
  context.lineTo(32, 23);
  context.lineTo(12, 18);
  context.lineTo(7, 27);
  context.lineTo(-7, 27);
  context.lineTo(-12, 18);
  context.lineTo(-32, 23);
  context.lineTo(-12, 2);
  context.closePath();
  context.fill();

  context.fillStyle = "#f3fbff";
  context.beginPath();
  context.moveTo(0, -36);
  context.lineTo(5, 19);
  context.lineTo(-5, 19);
  context.closePath();
  context.fill();
  context.fillStyle = "#27a6d9";
  context.beginPath();
  context.ellipse(0, -7, 4, 11, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawFrame(time) {
  // 限制离开标签页后的时间差，避免回来时背景突然跳动。
  const seconds = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
  previousTime = time;
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const star of stars) {
    if (!reducedMotion.matches) star.y = (star.y + star.speed * seconds) % canvas.height;
    context.globalAlpha = star.alpha;
    context.fillStyle = "#c3e3ff";
    context.beginPath();
    context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
  drawPlayer();
  window.requestAnimationFrame(drawFrame);
}

window.requestAnimationFrame(drawFrame);
