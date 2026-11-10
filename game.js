"use strict";

// 四种增益球：射击获得攻速、弹道、伤害或生命。大招只靠攻击积能。
const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");
const app = document.querySelector("#game-app");
const startScreen = document.querySelector("#start-screen");
const battleScreen = document.querySelector("#battle-screen");
const startButton = document.querySelector("#start-button");
const menuButton = document.querySelector("#menu-button");
const pauseButton = document.querySelector("#pause-button");
const hangarLink = document.querySelector(".masthead .brand");
const fullscreenButton = document.querySelector("#fullscreen-button");
const soundButton = document.querySelector("#sound-button");
const bossWarning = document.querySelector("#boss-warning");
const bossWarningName = document.querySelector("#boss-warning-name");
const movementHint = document.querySelector("#movement-hint");
const pauseHint = document.querySelector("#pause-hint");
const pauseScreen = document.querySelector("#pause-screen");
const pauseMenu = document.querySelector("#pause-menu");
const pauseSettings = document.querySelector("#pause-settings-panel");
const pauseConfirmPanel = document.querySelector("#pause-confirm-panel");
const pauseResumeButton = document.querySelector("#pause-resume");
const pauseCancelButton = document.querySelector("#pause-cancel");
const pauseConfirmButton = document.querySelector("#pause-confirm");
const pauseSoundButton = document.querySelector("#pause-sound");
const pauseShakeButton = document.querySelector("#pause-shake");
const pauseQualityControl = document.querySelector("#pause-quality");
const pauseBackground = new Map();
const statusMessage = document.querySelector("#status");
const fighterImage = document.querySelector("#fighter-art");
const hangarVariantImage = document.querySelector("#hangar-variant-art");
const fighterOptions = document.querySelector("#fighter-picker")?.querySelectorAll?.("input") ?? [];
const scoreDisplay = document.querySelector("#score");
const battleClock = document.querySelector("#battle-clock");
const lifeDisplay = document.querySelector("#player-lives");
const gameOverScreen = document.querySelector("#game-over-screen");
const restartButton = document.querySelector("#restart-button");
const resultMenuButton = document.querySelector("#result-menu-button");
const finalScore = document.querySelector("#final-score");
const finalTime = document.querySelector("#final-time");
const finalKills = document.querySelector("#final-kills");
const speedDisplay = document.querySelector("#weapon-speed");
const lanesDisplay = document.querySelector("#weapon-lanes");
const damageDisplay = document.querySelector("#weapon-damage");
const powerupNotice = document.querySelector("#powerup-notice");
const assetStatus = document.querySelector("#asset-status");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let state = "menu";
let previousTime = 0;
let windowActive = true;
let pauseView = "";
let pauseConfirmFromMenu = false;
const fighterProfiles = {
  red: { id: "red", rate: 3.6, lanes: 1, damage: 2.2,
    label: ["赤焰 · 重装突击型", "Crimson · Heavy assault"], code: "CRIMSON / ASSAULT FIGHTER",
    special: ["蓄力发射高伤害贯穿炮，适合集中打击。", "Fire a high-damage piercing beam for concentrated strikes."] },
  blue: { id: "blue", rate: 8, lanes: 2, damage: 0.48,
    label: ["苍电 · 高速截击型", "Azure · Rapid interceptor"], code: "AZURE / INTERCEPTOR",
    special: ["发射五枚追踪离子弹，优先集火瞄准方向的强敌。", "Launch five homing ion shots that concentrate on threats in your line of fire."] },
  yellow: { id: "yellow", rate: 4, lanes: 3, damage: 0.65,
    label: ["曜金 · 广域压制型", "Auric · Area suppression"], code: "AURIC / AREA SUPPRESSION",
    special: ["三轮弹幕横扫全屏，连机身后方的敌机也能打到。", "Send three waves across the entire screen, hitting enemies even behind your ship."] },
};
let selectedFighter = "red";
let sortieFighter = "red";
try {
  const savedFighter = window.localStorage.getItem("star-breaker-fighter");
  if (Object.hasOwn(fighterProfiles, savedFighter)) selectedFighter = savedFighter;
} catch { /* 无本地存储时仍可在机库选择。 */ }
function fighterProfile() { return fighterProfiles[sortieFighter]; }

// interval 是发射间隔（秒），speed 是子弹每秒前进的距离。
const weapon = { interval: 1 / fighterProfiles.red.rate, speed: 720, length: 26,
  damage: fighterProfiles.red.damage, speedLevel: 1, lanes: fighterProfiles.red.lanes, tier: 1, damageOverflow: 0, rateOverflow: 0 };
// 攻速仍持续成长；过密的连续射击合并伤害，每轮最多绘制 4 条弹道。
const firingRules = { ratePerLevel: 1, renderInterval: 0.05 };
const maxWeaponLanes = 4;
// 第四阶再次使用绿色；红色之后从黄色继续循环，阶数不封顶。
const weaponPalettes = [
  { name: "黄色", english: "Yellow", color: "#ffe16a", core: "#fff8d4" },
  { name: "绿色", english: "Green", color: "#6df59b", core: "#e3ffea" },
  { name: "紫色", english: "Purple", color: "#c58aff", core: "#f4e6ff" },
  { name: "绿色", english: "Green", color: "#6df59b", core: "#e3ffea" },
  { name: "蓝色", english: "Blue", color: "#55bdff", core: "#e2f5ff" },
  { name: "红色", english: "Red", color: "#ff6676", core: "#ffe4e8" },
];
let pendingShots = 0;
let renderShotCooldown = 0;
let burstStep = 0;
const highRateBurstSpacing = [0.055, 0.055, 0.115];
const powerupRules = { interval: 7, speed: 110, radius: 18, maxOnScreen: 7 };
const powerups = [];
let powerupCooldown = 3;
let powerupSpawnCount = 0;
let upgradeNoticeTime = 0;
const powerupTypes = {
  blue: { color: "#55bdff", label: "攻速", english: "Fire rate", symbol: "»" },
  yellow: { color: "#ffe16a", label: "弹道", english: "Lanes", symbol: "Ⅲ" },
  red: { color: "#ff6676", label: "伤害", english: "Damage", symbol: "+" },
  heal: { color: "#70f0b0", label: "生命", english: "Life", symbol: "♥" },
};
const powerupWeights = [ ["blue", 32], ["yellow", 32], ["red", 32], ["heal", 4] ];
function choosePowerupType(roll = Math.random()) {
  let remaining = roll * 100;
  for (const [type, weight] of powerupWeights) {
    remaining -= weight;
    if (remaining < 0) return type;
  }
  return "heal";
}
const bullets = [];
let shotCooldown = 0;
let muzzleFlash = 0;
const enemyRules = { interval: 1.2, speed: 125, points: 100, maxOnScreen: 14, healthStep: 20 };
const enemies = [];
const explosions = [];
let enemyCooldown = 0.6;
let enemySpawnCount = 0;
let score = 0;
let kills = 0;
let battleTime = 0;
let lastDamageMessage = "";
let lastDifficultySecond = -1;
const pressedKeys = new Set();
const movementKeys = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "KeyW", "KeyA", "KeyS", "KeyD",
]);
// viewport 使用屏幕像素作为坐标；高清画布另按设备像素密度绘制。
const viewport = { width: 1280, height: 720 };
let battlefieldInitialized = false;
const player = { x: 200, y: 360, width: 180, height: 120, speed: 300,
  lives: startingPlayerLives, maxLives: startingPlayerLives, hitFlash: 0 };
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
function setBossWarning(name = "") {
  bossWarning.hidden = !name;
  bossWarningName.textContent = name ? tr(name + "即将出现", name + " incoming") : "";
}
function syncGameAudio() {
  const active = isBattleActive();
  const cinematic = isBossDeathPlaying();
  gameAudio.sync(active || (cinematic && canAnimateCombatEffects()), !!boss, activeBosses().some(target => target.enraged),
    { paused: !!pauseView && windowActive && !document.hidden, combo: momentum.count, overdrive: isOverdriveActive(), warning: pendingBossType !== null || (!boss && battleTime >= nextBossTime - bossRules.warning), cinematic,
      bossType: boss?.type ?? pendingBossType ?? combatEffects.choiceTarget?.type, bossPhase: boss?.phase, lives: player.lives });
  syncUltimateAudio(active);
}
function updateSoundButton() {
  soundButton.textContent = gameAudio.muted ? tr("声音：关", "Sound: Off") : tr("声音：开", "Sound: On");
  soundButton.setAttribute("aria-pressed", String(!gameAudio.muted));
}
try { gameAudio.setMuted(window.localStorage.getItem("star-breaker-muted") === "true"); } catch { /* 本地文件也能使用声音，无法记忆设置时忽略。 */ }
updateSoundButton();
function toggleGameSound() {
  gameAudio.unlock();
  gameAudio.setMuted(!gameAudio.muted);
  updateSoundButton();
  try { window.localStorage.setItem("star-breaker-muted", String(gameAudio.muted)); } catch { /* 不影响本次设置。 */ }
  syncGameAudio();
}
soundButton.addEventListener("click", () => {
  toggleGameSound();
  if (state === "battle" && !pauseView && !evolution.pending) canvas.focus({ preventScroll: true });
});
function resetPlayer() {
  player.x = clamp(viewport.width * 0.17, flightBounds.left, flightBounds.right);
  player.y = (flightBounds.top + flightBounds.bottom) / 2;
  player.previousX = player.x; player.previousY = player.y;
}
function resizeBattlefield() {
  const rect = canvas.getBoundingClientRect();
  // 浏览器切换显示模式时可能短暂报告零尺寸，等布局稳定后再适配。
  if (rect.width <= 0 || rect.height <= 0) return;
  const oldWidth = viewport.width;
  const oldHeight = viewport.height;
  const oldBounds = { ...flightBounds };
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * pixelRatio);
  const pixelHeight = Math.round(height * pixelRatio);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  // 全屏通常连续发出 resize 和 fullscreenchange，同尺寸不重复调整战斗。
  if (battlefieldInitialized && width === oldWidth && height === oldHeight) return;
  viewport.width = width;
  viewport.height = height;
  player.width = Math.min(180, viewport.width * 0.24, viewport.height * 0.28);
  player.height = player.width * 2 / 3;
  // HUD 和底部按钮之外，整架战机（包含尾焰）都应留在战场内。
  flightBounds.left = Math.min(viewport.width / 2, player.width / 2 + 12);
  flightBounds.right = Math.max(flightBounds.left, viewport.width - player.width / 2 - 12);
  const topBar = viewport.width <= 740 ? Math.min(200, viewport.height * 0.49) : Math.min(90, viewport.height * 0.22);
  const bottomBar = Math.min(65, viewport.height * 0.18);
  flightBounds.top = Math.min(viewport.height / 2, topBar + player.height / 2 + 8);
  flightBounds.bottom = Math.max(flightBounds.top, viewport.height - bottomBar - player.height / 2 - 8);
  const scaleX = width / oldWidth;
  // 尺寸改变只清除格挡的瞬时演出，不重新授予完美窗口或退还已消费的机会。
  shield.effect = null; shield.flash = 0; shield.slowRemaining = 0;
  const oldSpan = oldBounds.bottom - oldBounds.top;
  const scaleY = oldSpan > 0 ? (flightBounds.bottom - flightBounds.top) / oldSpan : height / oldHeight;
  const resizeY = y => oldSpan > 0 ? flightBounds.top + (y - oldBounds.top) * scaleY : y * scaleY;
  player.x = clamp(player.x * scaleX, flightBounds.left, flightBounds.right);
  player.y = clamp(resizeY(player.y), flightBounds.top, flightBounds.bottom);
  if (state === "menu") resetPlayer();
  player.previousX = player.x; player.previousY = player.y;
  cancelUltimate(true);
  resetWeapons();
  resizeEncounter(scaleX, scaleY, resizeY);
  const previousGrace = bossHitGrace;
  resizeBossEncounter(oldWidth, oldHeight, oldBounds);
  // 缩小可飞区域可能暂时挤近机身，给玩家重新走位的时间。
  bossHitGrace = Math.max(previousGrace, bossHitGrace, bossRules.grace);
  player.previousX = player.x; player.previousY = player.y;
  resizeCombatEffects(oldWidth, oldHeight);
  resizeScenery();
  clearMovement();
  refreshEvolutionChoice();
  battlefieldInitialized = true;
}

function resizeEncounter(scaleX, scaleY, resizeY) {
  // 保留实体及其血量、事件归属和刷新进度，只转换到新战场的坐标。
  for (const entity of [...enemies, ...powerups, ...battlefieldEvents.objects]) {
    entity.x *= scaleX;
    entity.y = resizeY(entity.y);
    entity.previousX = entity.x;
    entity.previousY = entity.y;
    if (entity.journeyCover) resizeJourneyCover(entity);
  }
  for (const enemy of enemies) {
    if (Number.isFinite(enemy.baseY)) enemy.baseY = resizeY(enemy.baseY);
    if (Number.isFinite(enemy.waveAmplitude)) enemy.waveAmplitude *= scaleY;
    if (Number.isFinite(enemy.holdX)) enemy.holdX *= scaleX;
    if (Number.isFinite(enemy.aimX)) enemy.aimX *= scaleX;
    if (Number.isFinite(enemy.aimY)) enemy.aimY = resizeY(enemy.aimY);
    if (Number.isFinite(enemy.formationSlotX)) enemy.formationSlotX *= scaleX;
    if (Number.isFinite(enemy.formationSlotY)) enemy.formationSlotY *= scaleY;
    if (Number.isFinite(enemy.formationDrift)) enemy.formationDrift *= scaleY;
    if (enemy.kind === "gunner" && enemy.gunPhase === "warning") enemy.gunTime = 0;
  }
  for (const plan of [formationState.warning, formationState.active]) {
    if (!plan) continue;
    if (Number.isFinite(plan.x)) plan.x *= scaleX;
    plan.centerY = resizeY(plan.centerY);
    if (Number.isFinite(plan.safeTop)) plan.safeTop = resizeY(plan.safeTop);
    if (Number.isFinite(plan.safeBottom)) plan.safeBottom = resizeY(plan.safeBottom);
    for (const slot of plan.slots) {
      slot.x *= scaleX;
      slot.y *= scaleY;
    }
    resizePincerFormation(plan);
    resizeFormationTactics(plan);
  }
  // 重建尺寸后重新预警，避免旧弹道或激光在新位置立即命中玩家。
  resizeAceEncounter(scaleX, scaleY, resizeY);
  resizeGravityTide(scaleX, resizeY);
  resizeEvolutionWeapons(scaleX, scaleY, resizeY);
  enemyProjectiles.length = 0;
  explosions.length = 0;
}

function readyFighter() {
  const image = !fighterOptions.length || selectedFighter === "red" ? fighterImage : hangarVariantImage;
  startButton.disabled = !image.complete || !image.naturalWidth;
  assetStatus.hidden = !image.complete || !!image.naturalWidth;
}
function updateFighterSelection() {
  if (!fighterOptions.length) return;
  const fighter = fighterProfiles[selectedFighter];
  const isRed = fighter.id === "red";
  startScreen.dataset.fighter = fighter.id;
  for (const option of fighterOptions) option.checked = option.value === fighter.id;
  const preview = fighterVariantArt[fighter.id];
  if (!isRed && hangarVariantImage.getAttribute("src") !== preview.src) hangarVariantImage.src = preview.src;
  hangarVariantImage.alt = tr(...fighter.label);
  hangarVariantImage.hidden = isRed;
  fighterImage.hidden = !isRed;
  document.querySelector("#fighter-label").textContent = tr(...fighter.label);
  document.querySelector("#fighter-code").textContent = fighter.code;
  document.querySelector("#fighter-rate").textContent = tr(`${fighter.rate} 次/秒`, `${fighter.rate}/s`);
  document.querySelector("#fighter-lanes").textContent = String(fighter.lanes);
  document.querySelector("#fighter-damage").textContent = String(fighter.damage);
  document.querySelector("#fighter-ultimate").textContent = ultimateName(fighter.id);
  document.querySelector("#fighter-ultimate-detail").textContent = tr(...fighter.special);
  readyFighter();
}
for (const option of fighterOptions) option.addEventListener("change", () => {
  if (state !== "menu" || !option.checked || !Object.hasOwn(fighterProfiles, option.value)) return;
  selectedFighter = option.value;
  try { window.localStorage.setItem("star-breaker-fighter", selectedFighter); } catch { /* 仅保存偏好。 */ }
  updateFighterSelection();
});
fighterImage.addEventListener("load", readyFighter);
fighterImage.addEventListener("error", readyFighter);
hangarVariantImage?.addEventListener("load", readyFighter);
hangarVariantImage?.addEventListener("error", readyFighter);
if (fighterImage.complete) readyFighter();
updateFighterSelection();

function showScreen(nextState) {
  clearPause();
  if (nextState === "battle") sortieFighter = selectedFighter;
  lastDamageMessage = "";
  resetShipVisuals();
  resetBattlefield();
  resetJourneyScenes();
  resetCombatEffects();
  resetEvolution();
  resetMomentum();
  resetFiringStyle();
  clearMovement();
  resetWeapons(false);
  resetEncounter();
  resetPlayer();
  resetPlayerLives();
  player.hitFlash = 0;
  updateLifeDisplay();
  gameOverScreen.hidden = true;
  delete gameOverScreen.dataset.victory;
  menuButton.hidden = false;
  state = nextState;
  const inBattle = state === "battle";
  startScreen.hidden = inBattle;
  battleScreen.hidden = !inBattle;
  movementHint.hidden = false;
  canvas.tabIndex = inBattle ? 0 : -1;
  updateGameCanvasLabel();
  statusMessage.textContent = inBattle
    ? tr(`${tr(...fighterProfile().label)}出击。上下移动瞄准，空格释放${ultimateName()}，V 开盾。绿球恢复生命，满血时增加生命上限。依次击败十只异形，再挑战群渊合生体。`,
      `${tr(...fighterProfile().label)} launched. Move up or down to aim. Space uses ${ultimateName()}; V shields. Green orbs restore a life or raise capacity at full health. Defeat ten aliens, then face the Abyssal Confluence.`)
    : tr("已返回开始画面。", "Returned to the main menu.");
  (inBattle ? canvas : startButton).focus({ preventScroll: true });
  updatePauseHint();
}
function startBattleWithSound() { gameAudio.unlock(); showScreen("battle"); }
startButton.addEventListener("click", startBattleWithSound);
for (const control of [pauseButton, menuButton, hangarLink]) {
  control?.addEventListener("mousedown", (event) => {
    if (event.button === 0 && battleHasFocus()) event.preventDefault();
  });
}
hangarLink?.addEventListener("click", (event) => {
  if (state !== "battle" || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  pauseGame("exit");
});
menuButton.addEventListener("click", () => {
  if (state === "battle") pauseGame("exit");
  else showScreen("menu");
});
restartButton.addEventListener("click", startBattleWithSound);
resultMenuButton.addEventListener("click", () => showScreen("menu"));

// 浏览器要求由用户点击按钮才能进入真正的全屏；默认已铺满页面。
fullscreenButton.hidden = !document.fullscreenEnabled || !app.requestFullscreen;
fullscreenButton.addEventListener("click", async () => {
  clearMovement();
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await app.requestFullscreen();
  } catch {
    statusMessage.textContent = tr("浏览器未允许全屏。战场仍铺满当前窗口，也可以使用 F11。", "Fullscreen is unavailable. The game still fills this window, or you can press F11.");
  }
  if (evolution.pending) refreshEvolutionChoice();
  else if (state === "battle" && !pauseView) canvas.focus({ preventScroll: true });
});
function updateFullscreenDisplay() {
  const isFullscreen = document.fullscreenElement === app;
  fullscreenButton.textContent = isFullscreen ? tr("⛶ 退出全屏", "⛶ Exit fullscreen") : tr("⛶ 全屏", "⛶ Fullscreen");
  fullscreenButton.setAttribute("aria-pressed", String(isFullscreen));
}
document.addEventListener("fullscreenchange", () => {
  updateFullscreenDisplay();
  resizeBattlefield();
  if (evolution.pending) refreshEvolutionChoice();
  else if (state === "battle" && !pauseView) canvas.focus({ preventScroll: true });
});
window.addEventListener("resize", resizeBattlefield);
window.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === "Escape" && state === "battle" && !evolution.pending && windowActive && !document.hidden) {
    event.preventDefault();
    if (event.repeat) return;
    if (pauseView === "settings" || (pauseConfirmFromMenu && pauseView)) pauseGame("menu");
    else if (pauseView) resumeGame();
    else pauseGame();
    return;
  }
  if (!isBattleActive()) return;
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
    event.preventDefault();
    if (!event.repeat && !pressedKeys.has("ShiftLeft") && !pressedKeys.has("ShiftRight")) toggleFiringStyle();
    pressedKeys.add(event.code);
    return;
  }
  if (event.code === "KeyV") {
    event.preventDefault();
    if (!event.repeat && !pressedKeys.has("KeyV")) requestShield();
    pressedKeys.add("KeyV");
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
    if (!event.repeat && !pressedKeys.has("Space")) { gameAudio.unlock(); requestUltimate(); }
    pressedKeys.add("Space");
    return;
  }
  if (!movementKeys.has(event.code)) return;
  if (!event.repeat) gameAudio.unlock();
  event.preventDefault();
  pressedKeys.add(event.code);
});
window.addEventListener("keyup", (event) => {
  pressedKeys.delete(event.code);
  if (state === "battle" && document.activeElement === canvas && (movementKeys.has(event.code) || event.code === "Space" || event.code === "KeyV" || event.code === "ShiftLeft" || event.code === "ShiftRight")) event.preventDefault();
});
function clearMovement() {
  pressedKeys.clear();
  previousTime = 0;
}
// 主动暂停由菜单控制。切走窗口时也会冻结，只有焦点回到战场才恢复。
function battleHasFocus() {
  return state === "battle" && !pauseView && !evolution.pending && windowActive && !document.hidden && document.activeElement === canvas;
}
function isBattleActive() {
  return battleHasFocus() && !isBossDeathPlaying();
}
function refreshPauseCopy() {
  if (!pauseScreen || !pauseView) return;
  const copy = {
    menu: [tr("战斗暂停", "Combat paused"), tr("本局已暂停。准备好后可继续战斗。", "Your sortie is on hold. Resume when ready.")],
    settings: [tr("战斗设置", "Combat settings"), tr("设置会立即保存，战斗保持暂停。", "Settings save immediately. Combat remains paused.")],
    exit: [tr("返回机库？", "Return to hangar?"), tr("退出会结束本局，得分和战斗进度将丢失。", "Leaving ends this sortie. Its score and progress will be lost.")],
    restart: [tr("重新开始？", "Restart sortie?"), tr("重新开始会放弃本局得分和战斗进度。", "Restarting discards this sortie's score and progress.")],
  };
  const [title, description] = copy[pauseView];
  document.querySelector("#pause-title").textContent = title;
  document.querySelector("#pause-description").textContent = description;
  pauseConfirmButton.textContent = pauseView === "restart" ? tr("确认重开", "Confirm restart") : tr("确认退出", "Confirm exit");
  pauseSoundButton.textContent = soundButton.textContent;
  pauseSoundButton.setAttribute("aria-pressed", String(!gameAudio.muted));
  pauseShakeButton.textContent = shakeButton?.textContent ?? "";
  pauseQualityControl.value = visualQuality.id;
  if (pauseQualityControl.options) {
    const labels = { low: tr("低", "Low"), medium: tr("中", "Medium"), high: tr("高", "High") };
    for (const option of pauseQualityControl.options) option.textContent = labels[option.value];
  }
}
function pauseGame(view = "menu") {
  if (state !== "battle" || evolution.pending) return;
  const wasPaused = !!pauseView;
  pauseConfirmFromMenu = (view === "exit" || view === "restart") && pauseView === "menu";
  pauseView = view;
  if (!wasPaused) {
    for (const element of [canvas, battleScreen, document.querySelector(".masthead")]) {
      if (!element) continue;
      pauseBackground.set(element, element.inert);
      element.inert = true;
    }
  }
  clearMovement();
  if (pauseScreen) {
    pauseMenu.hidden = view !== "menu";
    pauseSettings.hidden = view !== "settings";
    pauseConfirmPanel.hidden = view !== "exit" && view !== "restart";
    refreshPauseCopy();
    pauseScreen.hidden = false;
    const focusTarget = view === "menu" ? pauseResumeButton : view === "settings" ? pauseSoundButton : pauseCancelButton;
    focusTarget.focus({ preventScroll: true });
  }
  updatePauseHint();
}
function clearPause() {
  pauseView = "";
  pauseConfirmFromMenu = false;
  if (pauseScreen) pauseScreen.hidden = true;
  for (const [element, previous] of pauseBackground) element.inert = previous;
  pauseBackground.clear();
}
function resumeGame() {
  clearPause();
  clearMovement();
  canvas.focus({ preventScroll: true });
  updatePauseHint();
}
pauseButton?.addEventListener("click", () => pauseGame());
pauseResumeButton?.addEventListener("click", resumeGame);
pauseCancelButton?.addEventListener("click", resumeGame);
document.querySelector("#pause-settings")?.addEventListener("click", () => pauseGame("settings"));
document.querySelector("#pause-back")?.addEventListener("click", () => pauseGame());
document.querySelector("#pause-restart")?.addEventListener("click", () => pauseGame("restart"));
document.querySelector("#pause-exit")?.addEventListener("click", () => pauseGame("exit"));
pauseConfirmButton?.addEventListener("click", () => {
  if (pauseView === "exit") showScreen("menu");
  else if (pauseView === "restart") startBattleWithSound();
});
pauseSoundButton?.addEventListener("click", () => { toggleGameSound(); refreshPauseCopy(); });
pauseShakeButton?.addEventListener("click", () => { cycleShakePreference(); refreshPauseCopy(); });
pauseQualityControl?.addEventListener("change", () => setVisualQuality(pauseQualityControl.value));
pauseScreen?.addEventListener("keydown", (event) => {
  if (event.code !== "Tab") return;
  const panel = pauseView === "menu" ? pauseMenu : pauseView === "settings" ? pauseSettings : pauseConfirmPanel;
  const controls = panel.querySelectorAll("button, select");
  const first = controls[0], last = controls[controls.length - 1];
  if (event.shiftKey ? document.activeElement !== first : document.activeElement !== last) return;
  event.preventDefault();
  (event.shiftKey ? last : first).focus({ preventScroll: true });
});
function updatePauseHint() {
  app.dataset.overlay = state === "over" ? "result" : evolution.pending ? "evolution" : pauseView ? "pause" : "";
  pauseHint.hidden = state !== "battle" || !!pauseView || evolution.pending || battleHasFocus();
  syncGameAudio();
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
  if (state === "battle" && !pauseView) { gameAudio.unlock(); canvas.focus({ preventScroll: true }); syncGameAudio(); }
});
function updatePlayer(seconds) {
  player.previousX = player.x; player.previousY = player.y;
  if (!isBattleActive()) return;
  const horizontal = Number(pressedKeys.has("ArrowRight") || pressedKeys.has("KeyD"))
    - Number(pressedKeys.has("ArrowLeft") || pressedKeys.has("KeyA"));
  const vertical = Number(pressedKeys.has("ArrowDown") || pressedKeys.has("KeyS"))
    - Number(pressedKeys.has("ArrowUp") || pressedKeys.has("KeyW"));
  const current = alienCurrentVector();
  if (!(horizontal || vertical || current.x || current.y)) return;
  const length = Math.hypot(horizontal, vertical) || 1;
  const speed = player.speed * (ultimate.phase === "charging" ? 0.65 : 1) * alienMovementScale();
  player.x = clamp(player.x + (horizontal / length * speed + current.x) * seconds, flightBounds.left, bossPlayerRight());
  player.y = clamp(player.y + (vertical / length * speed + current.y) * seconds, flightBounds.top, flightBounds.bottom);
  movementHint.hidden = true;
}
function resetWeapons(preserveUpgrades = true) {
  bullets.length = 0;
  shotCooldown = 0;
  muzzleFlash = 0;
  pendingShots = 0;
  renderShotCooldown = 0;
  burstStep = 0;
  if (!preserveUpgrades) {
    const fighter = fighterProfile();
    weapon.speedLevel = 1;
    weapon.lanes = fighter.lanes;
    weapon.tier = 1;
    weapon.damage = fighter.damage;
    weapon.damageOverflow = 0; weapon.rateOverflow = 0;
    weapon.interval = 1 / fighter.rate;
  }
  firingStyle.lastInterval = effectiveShotInterval();
  updateWeaponDisplay();
}
function updateWeaponDisplay() {
  const rate = progressionFormatLog(-Math.log(effectiveShotInterval()) + (weapon.rateOverflow || 0));
  const lanes = weapon.lanes + "/" + maxWeaponLanes;
  speedDisplay.textContent = tr(weapon.speedLevel + "级 · " + rate + "次/秒", "Lv " + weapon.speedLevel + " · " + rate + "/s") + (isOverdriveActive() ? tr(" · 暴走", " · Overdrive") : "");
  lanesDisplay.textContent = tr(weapon.tier + "阶 · " + lanes + "条", "T" + weapon.tier + " · " + lanes);
  damageDisplay.textContent = formattedProjectileDamage(firingStyle.mode === "focus" ? weapon.lanes : 1) + tr("点/发", "/shot");
}
function weaponPalette() { return weaponPalettes[(weapon.tier - 1) % weaponPalettes.length]; }
function projectileDamage() { return Math.exp(Math.min(690, weaponDamageLog())); }
function formattedProjectileDamage(weight = 1) {
  weight *= evolutionMainDamageMultiplier();
  return progressionFormatLog(weaponDamageLog() + Math.log(weight));
}
function shotLanes() { return firingLanes(); }
function shotOffsets() { return shotLanes().map(lane => lane.offset); }
function powerupGainForTime(type = "red") {
  // 黄色球影响指数倍率，因此比攻速和基础伤害更慢成长，仍然没有等级上限。
  return 1 + Math.floor((battleTime + 0.00000001) / (type === "yellow" ? 360 : 180));
}
function applyPowerup(type) {
  const details = powerupTypes[type];
  if (!details) return false;
  if (type === "heal") {
    powerupNotice.textContent = collectPlayerLifePowerup();
    powerupNotice.dataset.type = type;
    powerupNotice.hidden = false;
    upgradeNoticeTime = 2;
    statusMessage.textContent = powerupNotice.textContent;
    return true;
  }
  const gain = powerupGainForTime(type);
  const previousTier = weapon.tier, previousLanes = weapon.lanes;
  let boost = 0;
  if (type === "blue") {
    weapon.speedLevel += gain;
    const growth = progressionGrowRate(gain);
    boost = growth.after - growth.before;
    reconcileShotCadence();
  } else if (type === "yellow") {
    // 按单次 +1 依次进位：4 条再加一次变为下一阶 1 条，不丢弃批量增益的余数。
    const progress = weapon.lanes - 1 + gain;
    weapon.tier += Math.floor(progress / maxWeaponLanes);
    weapon.lanes = progress % maxWeaponLanes + 1;
  } else if (type === "red") {
    const growth = progressionGrowDamage(gain);
    boost = growth.after - growth.before;
  }
  updateWeaponDisplay();
  const palette = weaponPalette();
  const multiplier = progressionFormatLog(boost);
  if (type === "yellow" && weapon.tier > previousTier) {
    const extra = progressionFormatLog(Math.log(weapon.lanes / previousLanes)
      + (weapon.tier - previousTier) * Math.log(maxWeaponLanes * progressionRules.tierBonus));
    powerupNotice.textContent = tr(`弹幕晋升 · ${palette.name} · 火力 ×${extra} · ${lanesDisplay.textContent}`,
      `Tier up · ${palette.english} · Power ×${extra} · ${lanesDisplay.textContent}`);
  } else if (type === "yellow") {
    powerupNotice.textContent = tr(`弹道 ${previousLanes} → ${weapon.lanes} 条`, `Lanes ${previousLanes} → ${weapon.lanes}`);
  } else if (type === "blue") {
    powerupNotice.textContent = tr("攻速 ×", "Fire rate ×") + multiplier + " · " + speedDisplay.textContent;
  } else {
    powerupNotice.textContent = tr("单发伤害 ×", "Damage per shot ×") + multiplier + " · " + damageDisplay.textContent;
  }
  const muzzle = muzzlePosition();
  combatBurst(muzzle.x, muzzle.y, .65, details.color);
  powerupNotice.dataset.type = type;
  powerupNotice.hidden = false;
  upgradeNoticeTime = 2;
  statusMessage.textContent = powerupNotice.textContent;
  return true;
}
function muzzlePosition() {
  // 透明图片的机头位于中心右侧约 46.5% 机身宽度处。
  return { x: player.x + player.width * 0.465, y: player.y };
}
function updateShooting(seconds) {
  if (!isBattleActive()) return;
  for (let index = bullets.length - 1; index >= 0; index--) {
    const bullet = bullets[index];
    bullet.previousX = bullet.x; bullet.previousY = bullet.y;
    applyGravityTide(bullet, seconds, "player");
    bullet.x += (bullet.vx ?? weapon.speed) * seconds;
    bullet.y += (bullet.vy ?? 0) * seconds;
  }
  const interval = reconcileShotCadence();
  muzzleFlash = Math.max(0, muzzleFlash - seconds);
  // 聚能时暂停普通发射，已在飞行的子弹继续前进；不积压射击次数。
  if (ultimateSuppressesFire()) { pendingShots = 0; shotCooldown = interval; return; }
  shotCooldown -= seconds;
  renderShotCooldown -= seconds;
  if (shotCooldown <= 0.00000001) {
    const due = 1 + Math.floor(Math.max(0, -shotCooldown + 0.00000001) / interval);
    pendingShots += due;
    shotCooldown += due * interval;
  }
  if (pendingShots > 0 && renderShotCooldown <= 0.00000001) {
    const muzzle = muzzlePosition();
    const palette = weaponPalette();
    // High rates group visible volleys. Damage held during each gap goes into the next packet.
    const grouped = weapon.speedLevel >= 8 && interval <= .10;
    const packetStrength = grouped ? Math.min(0.22, Math.log2(pendingShots) * .05) : 0;
    const damageStrength = .26 * (1 - Math.exp(-progressionBaseDamageLog() / 2));
    for (const lane of shotLanes()) {
      const angle = lane.angle, overdrive = isOverdriveActive();
      const tierShape = Math.min(4, weapon.tier - 1);
      const halfHeight = (firingStyle.mode === "focus" ? 2.5 + Math.log2(weapon.lanes) * 0.65 : 2.5) * (1 + tierShape * .12) * (overdrive ? 1.5 : 1) * (1 + packetStrength + damageStrength);
      bullets.push({ x: muzzle.x + 3, previousX: muzzle.x + 3, y: muzzle.y + lane.offset, previousY: muzzle.y + lane.offset,
        angle, vx: Math.cos(angle) * weapon.speed, vy: Math.sin(angle) * weapon.speed,
        halfHeight, length: weapon.length * (1 + packetStrength + damageStrength) + tierShape * 5, overdrive, mode: firingStyle.mode, tier: weapon.tier,
        piercesLeft: evolutionPierceCount(), hitTargets: new Set(),
        damage: projectileDamage() * pendingShots * lane.weight * evolutionMainDamageMultiplier(),
        damageLog: weaponDamageLog() + Math.log(pendingShots) + Math.log(lane.weight) + Math.log(evolutionMainDamageMultiplier()), color: palette.color, core: palette.core });
    }
    pendingShots = 0;
    const burstTempo = 0.92 + 0.8 * interval;
    renderShotCooldown = grouped ? highRateBurstSpacing[burstStep] * burstTempo : firingRules.renderInterval;
    burstStep = grouped ? (burstStep + 1) % highRateBurstSpacing.length : 0;
    muzzleFlash = 0.055;
    gameAudio.shoot(isOverdriveActive(), weapon.tier, sortieFighter);
  }
}
function resetEncounter(resetScore = true) {
  if (resetScore) resetAceEncounter();
  resetGravityTide();
  resetBattlefieldEvents(resetScore);
  resetEnemyCombat(resetScore);
  if (resetScore) resetBossEncounter();
  else resizeBossEncounter();
  enemies.length = 0;
  explosions.length = 0;
  enemyCooldown = 0.6;
  enemySpawnCount = 0;
  powerups.length = 0;
  if (resetScore) {
    resetUltimate();
    resetShield();
    powerupCooldown = 3;
    powerupSpawnCount = 0;
    upgradeNoticeTime = 0;
    powerupNotice.hidden = true;
    score = 0;
    kills = 0;
    battleTime = 0;
    lastDifficultySecond = -1;
  }
  updateDifficultyDisplay();
  scoreDisplay.textContent = String(score).padStart(6, "0");
}
function enemyStage(time = battleTime) { return Math.floor((time + 0.00000001) / enemyRules.healthStep); }
function enemyHealthForTime(time = battleTime) {
  const stage = enemyStage(time);
  return stage === 0 ? 1 : Math.ceil(1 + 1.7 * stage + 1.6 * stage * stage + 0.12 * stage * stage * stage);
}
function enemyHealthLogForTime() {
  return progressionEnemyHealthLog(battleTime);
}
function enemySpeedForTime() {
  return enemyRules.speed + 235 * (1 - Math.exp(-battleTime / 300)) + Math.sqrt(battleTime) * 1.8;
}
function applyEnemyHit(enemy, bullet) {
  const before = enemy.hp;
  if (enemy.healthLog !== undefined) {
    const damageLog = bullet.damageLog ?? Math.log(bullet.damage ?? weapon.damage);
    const protection = bullet.source === "ultimate" ? undefined : enemy.fireProtection;
    enemy.hp = Math.max(0, enemy.hp - progressionHitFraction(enemy, damageLog, protection));
    if (enemy.hp < 1e-12) enemy.hp = 0;
  } else {
    const damage = bullet.damage ?? (bullet.damageLog !== undefined
      ? Math.exp(Math.min(Math.log(enemy.hp), bullet.damageLog)) : weapon.damage);
    enemy.hp = Math.max(0, enemy.hp - damage);
    if (enemy.hp < 1e-12) enemy.hp = 0;
  }
  enemy.hitFlash = 0.08;
  recordCombatImpact(enemy, bullet);
  if (!bullet.noEnergy && bullet.source !== "ultimate" && bullet.source !== "blast") gainUltimateEnergy((before - enemy.hp) / enemy.maxHp, "enemy");
}
function defeatEnemy(index) {
  if (index < 0) return;
  const enemy = enemies[index];
  if (!enemy) return;
  onFormationEnemyDefeated(enemy);
  onBattlefieldEnemyDefeated(enemy);
  onAceDefeated(enemy);
  createExplosion(enemy);
  enemies.splice(index, 1);
  score += enemy.points ?? enemyRules.points;
  kills++;
  registerMomentumKill();
  scoreDisplay.textContent = String(score).padStart(6, "0");
}
function updateDifficultyDisplay() {
  const wholeSeconds = Math.floor(battleTime + 0.00000001);
  if (wholeSeconds === lastDifficultySecond) return;
  lastDifficultySecond = wholeSeconds;
  const minutes = Math.floor(wholeSeconds / 60);
  battleClock.textContent = String(minutes).padStart(2, "0") + ":" + String(wholeSeconds % 60).padStart(2, "0");
}
function spawnEnemy(kind = chooseEnemyKind()) {
  if (!enemyTypes[kind]) kind = "scout";
  const type = enemyTypes[kind];
  const width = Math.min(100, player.width * 0.65) * type.width;
  const lanes = [0.5, 0.22, 0.78, 0.36, 0.64];
  const lane = lanes[enemySpawnCount % lanes.length];
  const jitter = enemySpawnCount === 0 ? 0 : (Math.random() - 0.5) * 24;
  const waveAmplitude = kind === "scout" && enemySpawnCount > 0
    ? Math.min(38, (flightBounds.bottom - flightBounds.top) * 0.13) : 0;
  const y = clamp(flightBounds.top + (flightBounds.bottom - flightBounds.top) * lane + jitter,
    flightBounds.top + waveAmplitude, flightBounds.bottom - waveAmplitude);
  const x = viewport.width + width / 2 + 4;
  const healthLog = enemyHealthLogForTime() + Math.log(type.health);
  // 第一架突击机居中直飞，方便新手体验命中；后续同类开始波浪飞行。
  enemies.push({ kind, x, previousX: x, y, previousY: y, baseY: y, waveAmplitude, age: 0,
    width, height: width * type.height, hp: 1, maxHp: 1, displayHp: 1, healthLog, hitFlash: 0,
    fireProtection: enemyProtectionAtBirth(kind),
    points: type.points, speed: enemySpeedForTime() * type.speed * (0.9 + Math.random() * 0.2),
    gunPhase: "entry", gunTime: 0, gunShots: 0, holdX: viewport.width * (0.72 + lane * 0.1) });
  enemyIntroduced.add(kind);
  enemySpawnCount++;
}
function createExplosion(enemy, points = enemy.points ?? enemyRules.points) {
  gameAudio.explode(points >= 2000);
  recordCombatDestruction(enemy, points >= 2000);
  explosions.push({ x: enemy.x, y: enemy.y, age: 0, points,
    duration: reducedMotion.matches ? 0.2 : 0.55,
    particles: Array.from({ length: 12 }, (_, index) => {
      const angle = index / 12 * Math.PI * 2 + Math.random() * 0.3;
      const speed = 45 + Math.random() * 95;
      return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
    }),
  });
}
function bulletHitsEnemy(bullet, enemy) { return Number.isFinite(projectileEnemyEntry(bullet, enemy)); }
function updateEncounter(seconds) {
  if (!isBattleActive()) return;
  battleTime += seconds;
  updateJourneyScene(seconds);
  updateDifficultyDisplay();
  updateAceEncounter(seconds);
  updateBattlefieldEvents(seconds);
  updateFormations(seconds);
  const scene = journeyState.scene;
  if (scene && seconds > 0) updateJourneyEncounter(scene, scene.previousElapsed);
  updateEnemyProjectiles(seconds);
  for (let index = explosions.length - 1; index >= 0; index--) {
    explosions[index].age += seconds;
    if (explosions[index].age >= explosions[index].duration) explosions.splice(index, 1);
  }
  for (let index = enemies.length - 1; index >= 0; index--) {
    const enemy = enemies[index];
    enemy.hitFlash = Math.max(0, enemy.hitFlash - seconds);
    if (enemy.kind === "transport") updateSupplyTransport(enemy, seconds);
    else updateEnemyMovement(enemy, seconds);
    const displayed = enemy.displayHp ?? enemy.hp;
    enemy.displayHp = reducedMotion.matches ? enemy.hp : displayed + (enemy.hp - displayed) * (1 - Math.exp(-seconds * 14));
  }
  if (!bossBlocksWaves() && !formationsBlockWaves() && !battlefieldEventBlocksWaves()
    && !aceBlocksWaves() && !journeyBlocksWaves()) {
    enemyCooldown -= seconds;
    if (enemyCooldown <= 0.00000001) {
      if (enemies.length < enemyRules.maxOnScreen) spawnEnemy();
      enemyCooldown += enemyIntervalForTime();
    }
  }

}
function spawnPowerup() {
  const radius = powerupRules.radius;
  // 第一颗仍是蓝球，之后按权重随机；生命球最稀有。
  const type = powerupSpawnCount === 0 ? "blue" : choosePowerupType();
  const x = viewport.width + radius + 4;
  // 在不同高度出现，让球能被看见，也让玩家有机会选择瞄准哪种效果。
  const lanes = [0.36, 0.64, 0.22, 0.78, 0.5];
  const lane = lanes[powerupSpawnCount % lanes.length];
  const y = flightBounds.top + (flightBounds.bottom - flightBounds.top) * lane;
  powerups.push({ x, previousX: x, y, radius, type });
  powerupSpawnCount++;
}
function bulletHitsPowerup(bullet, orb) { return Number.isFinite(projectileOrbEntry(bullet, orb)); }
function updatePowerups(seconds) {
  if (!isBattleActive()) return;
  upgradeNoticeTime = Math.max(0, upgradeNoticeTime - seconds);
  powerupNotice.hidden = upgradeNoticeTime <= 0;
  for (let index = powerups.length - 1; index >= 0; index--) {
    const orb = powerups[index];
    orb.previousX = orb.x;
    orb.x -= powerupRules.speed * seconds;
    if (orb.x + orb.radius < 0) powerups.splice(index, 1);
  }
  powerupCooldown -= seconds;
  if (powerupCooldown <= 0.00000001) {
    const limit = powerupRules.maxOnScreen - (journeyReservesPickup() ? 1 : 0);
    if (powerups.length < limit) spawnPowerup();
    powerupCooldown += powerupRules.interval;
  }
  resolveProjectileHits();
  for (let index = bullets.length - 1; index >= 0; index--) {
    if (bullets[index].x > viewport.width || bullets[index].y < -60 || bullets[index].y > viewport.height + 60) bullets.splice(index, 1);
  }
}
function resolveProjectileHits() {
  for (let bulletIndex = bullets.length - 1; bulletIndex >= 0; bulletIndex--) {
    const bullet = bullets[bulletIndex];
    if (!bullet.hitTargets) bullet.hitTargets = new Set();
    let consumed = false;
    // 每轮重新寻找最近目标；爆破或击破首领可能移除其他目标。
    while (!consumed) {
      let hit = null;
      for (const enemy of enemies) {
        if (bullet.hitTargets.has(enemy) || enemy.x - enemy.width / 2 >= viewport.width) continue;
        const time = projectileEnemyEntry(bullet, enemy);
        if (Number.isFinite(time) && (!hit || time < hit.time)) hit = { kind: "enemy", target: enemy, time };
      }
      for (const orb of bullet.auxiliary ? [] : powerups) {
        if (orb.x - orb.radius >= viewport.width) continue;
        const time = projectileOrbEntry(bullet, orb);
        if (Number.isFinite(time) && (!hit || time < hit.time)) hit = { kind: "orb", target: orb, time };
      }
      for (const target of activeBosses()) {
        if (bullet.hitTargets.has(target) || !bossCanTakeDamage(target)) continue;
        const entry = projectileAlienBossHit(bullet, target);
        if (entry && (!hit || entry.time < hit.time)) hit = { kind: "boss", target, time: entry.time };
      }
      for (const object of battlefieldEvents.objects) {
        if (bullet.hitTargets.has(object) || object.x - object.width / 2 >= viewport.width) continue;
        const time = projectileEnemyEntry(bullet, object);
        if (Number.isFinite(time) && (!hit || time < hit.time)) hit = { kind: "object", target: object, time };
      }
      if (!hit) break;
      bullet.hitTargets.add(hit.target);
      if (hit.kind === "orb") {
        powerups.splice(powerups.indexOf(hit.target), 1); applyPowerup(hit.target.type);
      } else if (hit.kind === "boss") applyBossHit(bullet, hit.target);
      else if (hit.kind === "object") hitBattlefieldObject(hit.target, bullet);
      else {
        applyEnemyHit(hit.target, bullet);
        if (hit.target.hp === 0) defeatEnemy(enemies.indexOf(hit.target), bullet);
      }
      movementHint.hidden = true;
      if (!isBattleActive() || bullets[bulletIndex] !== bullet) return;
      if (hit.kind === "orb" || hit.kind === "object" || !(bullet.piercesLeft > 0)) {
        bullets.splice(bulletIndex, 1); consumed = true;
      } else bullet.piercesLeft--;
    }
  }
}
function drawPowerups() {
  for (const orb of powerups) {
    const details = powerupTypes[orb.type];
    context.save();
    context.translate(orb.x, orb.y);
    context.strokeStyle = details.color;
    context.fillStyle = "#101e35";
    context.lineWidth = 2;
    context.shadowColor = details.color;
    context.shadowBlur = reducedMotion.matches ? 0 : 16;
    context.beginPath();
    context.arc(0, 0, orb.radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.shadowBlur = 0;
    context.fillStyle = details.color;
    context.textAlign = "center";
    context.font = "700 20px Consolas, monospace";
    context.fillText(details.symbol, 0, 7);
    context.font = "11px Microsoft YaHei, sans-serif";
    context.fillText(tr(details.label, details.english), 0, -orb.radius - 8);
    context.restore();
  }
}
function enemyTouchesPlayer(enemy) {
  if (enemy.journeyLaunchUntil > battleTime) return false;
  // 主机身的椭圆碰撞区不包含图片透明边缘；用双方相对移动路径检测高速交错。
  const rx = player.width * 0.37 + enemy.width * 0.42;
  const ry = player.height * 0.30 + enemy.height * 0.35;
  const x0 = ((enemy.previousX ?? enemy.x) - (player.previousX ?? player.x)) / rx;
  const y0 = ((enemy.previousY ?? enemy.y) - (player.previousY ?? player.y)) / ry;
  const x1 = (enemy.x - player.x) / rx, y1 = (enemy.y - player.y) / ry;
  const dx = x1 - x0, dy = y1 - y0, length = dx * dx + dy * dy;
  const along = length ? clamp(-(x0 * dx + y0 * dy) / length, 0, 1) : 0;
  return Math.hypot(x0 + dx * along, y0 + dy * along) <= 1;
}
function damagePlayer(message) {
  // 小怪碰撞与 Boss 弹幕共享受伤保护，避免同帧连续扣命。
  if (!isBattleActive() || bossHitGrace > 0 || shieldIsActive()) return false;
  lastDamageMessage = message;
  gameAudio.hurt?.();
  player.lives = Math.max(0, player.lives - 1);
  player.hitFlash = 0.35;
  bossHitGrace = bossRules.grace;
  movementHint.hidden = true;
  updateLifeDisplay();
  statusMessage.textContent = tr(message + "，剩余 " + player.lives + " 点生命。", message + ". Lives remaining: " + player.lives + ".");
  if (!player.lives) endGame();
  return true;
}
function updatePlayerDamage(seconds) {
  if (!isBattleActive()) return;
  player.hitFlash = Math.max(0, player.hitFlash - seconds);
  for (let index = enemies.length - 1; index >= 0; index--) {
    const enemy = enemies[index];
    if (enemyTouchesPlayer(enemy)) {
      enemies.splice(index, 1);
      createExplosion(enemy, 0);
      damagePlayer(enemy.scoutIntercept?.start !== undefined
        ? tr("被突击机拦截 · 看见橙色航线后换高度", "Intercepted by a scout · Change altitude when the orange route appears")
        : tr("撞到敌机", "Crashed into an enemy"));
      if (state !== "battle") break;
    } else if (enemy.x + enemy.width / 2 < 0) {
      // 安全飞过玩家的敌机继续向左飞，离屏再清理，不扣血也不计分。
      enemies.splice(index, 1);
    }
  }
}
function updateResultCopy(won) {
  const title = document.querySelector("#game-over-title");
  const intro = gameOverScreen.querySelector(".result-intro");
  title.textContent = won ? tr("异形战役通关", "Campaign Cleared") : tr("游戏结束", "Game Over");
  intro.textContent = won ? tr("群渊合生体已击破。", "The Abyssal Confluence has fallen.")
    : (lastDamageMessage || tr("调整航线，再次突围。", "Plot a new course and try again."));
}
function endGame(won = false) {
  clearPause();
  state = "over";
  battleScreen.hidden = true;
  gameOverScreen.dataset.victory = String(won);
  updateResultCopy(won);
  resetGravityTide();
  resetCombatEffects();
  endMomentumBattle();
  resetEnemyCombat(false);
  cancelUltimate();
  shield.remaining = 0;
  resetEvolutionWeapons();
  shield.perfectRemaining = 0; shield.perfectUsed = false;
  shield.flash = 0; shield.slowRemaining = 0; shield.effect = null;
  updateShieldDisplay();
  setBossWarning();
  updatePauseHint();
  clearMovement();
  resetWeapons();
  player.hitFlash = 0;
  updateLifeDisplay();
  canvas.tabIndex = -1;
  updateGameCanvasLabel();
  movementHint.hidden = true;
  pauseHint.hidden = true;
  powerupNotice.hidden = true;
  menuButton.hidden = true;
  finalScore.textContent = String(score).padStart(6, "0");
  finalTime.textContent = battleClock.textContent;
  finalKills.textContent = String(kills);
  document.querySelector("#final-combo").textContent = String(momentum.best);
  gameOverScreen.hidden = false;
  statusMessage.textContent = won ? tr(`异形战役通关。本局得分 ${score}。`, `Campaign cleared. Score: ${score}.`)
    : tr(`游戏结束。本局得分 ${score}，击毁 ${kills} 架敌机。`, `Game over. Score: ${score}. Enemies destroyed: ${kills}.`);
  restartButton.focus({ preventScroll: true });
}
function drawEnemies() {
  for (const enemy of enemies) {
    if (enemy.kind === "transport") drawSupplyTransport(enemy);
    else drawEnemyHull(enemy);
    context.save();
    context.translate(enemy.x, enemy.y);
    const w = enemy.width, h = enemy.height;
    // 完整圆角血条：仅用连续长度表达剩余血量，不绘制分段或文字。
    context.shadowBlur = 0;
    const barWidth = w * 0.76;
    const barY = -h / 2 - 12;
    const ratio = clamp((enemy.displayHp ?? enemy.hp) / enemy.maxHp, 0, 1);
    context.fillStyle = "#101929e6";
    context.beginPath();
    context.roundRect(-barWidth / 2 - 1, barY - 1, barWidth + 2, 8, 4);
    context.fill();
    if (ratio > 0) {
      context.fillStyle = ratio > 0.5 ? "#74d6df" : ratio > 0.25 ? "#ffc479" : "#ff657b";
      context.shadowColor = context.fillStyle;
      context.shadowBlur = reducedMotion.matches ? 0 : 5;
      context.beginPath();
      context.roundRect(-barWidth / 2, barY, barWidth * ratio, 6, Math.min(3, barWidth * ratio / 2));
      context.fill();
    }
    context.restore();
  }
}
function drawExplosions() {
  for (const explosion of explosions) {
    const progress = explosion.age / explosion.duration;
    context.save();
    context.globalAlpha = 1 - progress;
    context.fillStyle = "#ffe3a5";
    context.font = "600 16px Consolas, monospace";
    context.textAlign = "center";
    if (explosion.points > 0) {
      context.fillText("+" + explosion.points, clamp(explosion.x, 30, viewport.width - 30),
        explosion.y - 28 - (reducedMotion.matches ? 0 : progress * 24));
    }
    context.restore();
  }
}
function drawBullets() {
  context.save();
  const glow = reducedMotion.matches ? 0 : visualQuality.glow;
  for (const bullet of bullets) {
    context.save(); context.translate(bullet.x, bullet.y); context.rotate(bullet.angle ?? 0);
    const half = bullet.halfHeight ?? 2.5, length = bullet.length ?? weapon.length;
    context.fillStyle = bullet.color;
    context.beginPath();
    if (bullet.visual === "lance" || bullet.visual === "counter") {
      context.moveTo(0, -half * .65); context.lineTo(length * .78, -half);
      context.lineTo(length, 0); context.lineTo(length * .78, half); context.lineTo(0, half * .65); context.closePath();
    } else {
      context.moveTo(0, -half * .32);
      context.lineTo(length * .24, -half * .76);
      context.quadraticCurveTo(length * .86, -half * 1.38, length, 0);
      context.quadraticCurveTo(length * .86, half * 1.38, length * .24, half * .76);
      context.lineTo(0, half * .32); context.closePath();
    }
    if (glow && half >= 2) {
      context.strokeStyle = bullet.color;
      context.lineJoin = "round";
      context.globalAlpha = .18 * glow;
      context.lineWidth = half * 2.3; context.stroke();
      context.globalAlpha = .38 * glow;
      context.lineWidth = half * .8; context.stroke();
      context.globalAlpha = 1;
    }
    context.fill();
    context.fillStyle = bullet.core;
    context.beginPath(); context.moveTo(length * .17, 0);
    context.lineTo(length * .75, -half * .48);
    context.quadraticCurveTo(length * .94, -half * .42, length * .96, 0);
    context.quadraticCurveTo(length * .94, half * .42, length * .75, half * .48);
    context.closePath(); context.fill();
    context.restore();
  }
  context.restore();
}
function drawMuzzleFlash() {
  if (state !== "battle" || muzzleFlash <= 0 || reducedMotion.matches) return;
  const muzzle = muzzlePosition();
  const glow = visualQuality.glow;
  const intensity = muzzleFlash / .055;
  const palette = weaponPalette();
  context.save();
  context.globalAlpha = intensity;
  context.fillStyle = palette.core;
  context.shadowColor = palette.color;
  context.shadowBlur = 8 * glow;
  for (const offset of shotOffsets()) {
    const y = muzzle.y + offset;
    if (glow) {
      context.strokeStyle = palette.color; context.lineWidth = 1.5;
      context.globalAlpha = intensity * glow * .8;
      context.beginPath(); context.moveTo(muzzle.x + 2, y);
      context.lineTo(muzzle.x + 17 + 9 * intensity, y);
      context.moveTo(muzzle.x + 3, y - 6 * intensity);
      context.lineTo(muzzle.x + 9, y);
      context.lineTo(muzzle.x + 3, y + 6 * intensity); context.stroke();
      context.globalAlpha = intensity;
    }
    context.beginPath();
    context.ellipse(muzzle.x + 3, y, 4 + 4 * intensity, 1 + 3 * intensity, 0, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}
function drawPlayer() {
  if (state !== "battle") return;
  context.save();
  if (player.hitFlash > 0) {
    context.strokeStyle = "#ff657b";
    context.lineWidth = 2;
    context.globalAlpha = reducedMotion.matches ? 0.8 : 0.65 + Math.sin(player.hitFlash * 20) * 0.15;
    context.beginPath();
    context.ellipse(player.x, player.y, player.width * 0.55, player.height * 0.6, 0, 0, Math.PI * 2);
    context.stroke();
  }
  context.globalAlpha = 1;
  if (!drawEvolvedPlayer(context, player, evolution, reducedMotion.matches, battleTime)
    && !drawFighterVariant(context, player, fighterProfile().id, null, reducedMotion.matches, shipVisuals.clock)
    && fighterImage.complete && fighterImage.naturalWidth)
    context.drawImage(fighterImage, player.x - player.width / 2, player.y - player.height / 2, player.width, player.height);
  context.restore();
}
function drawFrame(time) {
  const realSeconds = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
  previousTime = time;
  syncGameAudio();
  if (!pauseView) {
    const seconds = shieldFrameSeconds(realSeconds);
    updateCombatEffects(seconds);
    updateMomentum(seconds);
    updateEvolution(seconds);
    updateShield(seconds);
    updateCannonLink(seconds);
    updatePlayer(seconds);
    updateShipVisuals(seconds);
    updateGravityTide(seconds);
    updateShooting(seconds);
    updateEvolutionWeapons(seconds);
    updateEncounter(seconds);
    updateBossEncounter(seconds);
    updateBattlefield(seconds);
    updatePowerups(seconds);
    updateUltimate(seconds);
    resolveBattlefieldCover();
    updatePlayerDamage(seconds);
    updateEnemyProjectileDamage();
    updateBossDamage();
  }
  const showCombat = state !== "over" && !evolution.pending;
  context.clearRect(0, 0, viewport.width, viewport.height);
  context.save();
  applyBossCollapseCamera(context);
  drawBattlefield(showCombat);
  drawActiveJourney("front");
  context.globalAlpha = 1;
  if (showCombat) {
    const cameraOffset = combatShakeOffset();
    context.translate(cameraOffset.x, cameraOffset.y);
    drawGravityTide();
    drawFormationSignals();
    drawBattlefieldObjects();
    drawEnemies();
    drawAceThreats(context);
    drawEnemyThreats();
    drawBossBattle();
    if (!isBossDeathPlaying()) drawPowerups();
    drawBullets();
    drawOverdrive();
    drawPlayer();
    drawEvolutionWeapons(context);
    drawEvolution();
    drawShield();
    drawMuzzleFlash();
    drawUltimate();
    drawCombatEffects();
    drawExplosions();
  }
  context.restore();
  if (showCombat) drawBattlefieldEventNotice();
  drawEvolutionChoicePreviews(time);
  window.requestAnimationFrame(drawFrame);
}
function updateGameCanvasLabel() {
  const label = state === "over"
    ? tr("本局已结束，战场已停止。选择重新开始可再玩一局。", "The run is over. Select Restart to play again.")
    : state === "battle"
    ? tr("可操作的横向星空战场。战机自动向右射击，方向键或 WASD 移动，空格蓄力大招，V 开启护盾，Shift 切换射击姿态，Esc 暂停。", "Playable space battlefield. The fighter fires automatically. Move with arrows or WASD, use Space for your charged special, V to shield, Shift to switch firing modes, and Esc to pause.")
    : tr("横向星空战场。先在机库选择战机，再开始游戏。", "Side-scrolling space battlefield. Choose a fighter in the hangar and start the game.");
  canvas.setAttribute("aria-label", label);
}
function refreshGameLanguage() {
  updateFighterSelection();
  if (state === "over") updateResultCopy(gameOverScreen.dataset.victory === "true");
  updateGameCanvasLabel();
  updateFullscreenDisplay();
  updateSoundButton();
  updateWeaponDisplay();
  updateLifeDisplay();
  updateFiringStyleDisplay();
  updateShakeButton();
  updateMomentumDisplay();
  updateShieldDisplay();
  updateUltimateDisplay();
  updateEvolutionDisplay();
  refreshEvolutionChoice();
  refreshPauseCopy();
  if (state === "menu") statusMessage.textContent = tr("开始画面已就绪。", "Ready to start.");
}
updateLifeDisplay();
resizeBattlefield();
window.requestAnimationFrame(drawFrame);
