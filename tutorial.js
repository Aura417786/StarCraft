"use strict";

const flightTrainingKey = "star-breaker-flight-training";
const flightTrainingPanel = document.querySelector("#flight-training");
const flightTrainingStep = document.querySelector("#flight-training-step");
const flightTrainingTitle = document.querySelector("#flight-training-title");
const flightTrainingCopy = document.querySelector("#flight-training-copy");
const flightTrainingSkip = document.querySelector("#flight-training-skip");
const flightTrainingEvolutionSkip = document.querySelector("#flight-training-evolution-skip");
let flightTutorial = null;
let flightTrainingSeen = false;
try { flightTrainingSeen = window.localStorage.getItem(flightTrainingKey) === "1"; } catch { /* Session fallback. */ }

function flightTrainingControl(action, fallback) {
  return typeof controlBindingLabel === "function" ? controlBindingLabel(action) || fallback : fallback;
}

function refreshFlightTutorial() {
  if (!flightTutorial || !flightTrainingPanel) return;
  const { stage, hint } = flightTutorial;
  const shieldKey = flightTrainingControl("shield", "V") + tr(" / 手柄 X", " / gamepad X");
  const specialKey = flightTrainingControl("special", tr("空格", "Space")) + tr(" / 手柄 Y", " / gamepad Y");
  flightTrainingPanel.hidden = stage === 3;
  flightTrainingPanel.dataset.step = String(stage);
  app.dataset.flightTraining = String(stage);
  flightTrainingStep.textContent = tr(`模拟训练 ${stage} / 3`, `SIMULATION ${stage} / 3`);
  flightTrainingTitle.textContent = stage === 1 ? tr("用护盾接住训练弹", "Block the training round") : tr("用大招击中标靶", "Hit the target with your special");
  const messages = {
    shield: tr(`守住标记航线。弹头靠近时按 ${shieldKey} 开盾。完美格挡会返还本次护盾。`, `Hold the marked lane. Press ${shieldKey} as the round approaches. A Perfect Guard refunds this shield use.`),
    guardHit: tr("收到！护盾接住了实弹。", "Block confirmed. Your shield caught the round."),
    guardLate: tr(`弹头撞到机身。再试一次，在弹头碰到椭圆护盾前按 ${shieldKey}。`, `The round reached the hull. Try ${shieldKey} just before the round touches the shield ellipse.`),
    guardMiss: tr(`弹头掠过了机身。留在虚线航道上，再用 ${shieldKey} 接住它。`, `The round passed your ship. Stay on the dotted lane and catch it with ${shieldKey}.`),
    special: tr(`准星标出标靶高度。按 ${specialKey} 蓄力发射，保持对准直到命中。`, `Line up with the target reticle. Press ${specialKey} to charge your special and keep aim until it hits.`),
    specialMiss: tr(`这发没有击中。已经补充一次大招，移动到标靶高度再按 ${specialKey}。`, `That shot missed. A new charge is ready. Align with the target, then press ${specialKey}.`),
    specialHit: tr("标靶命中。准备选择一次模拟进化。", "Direct hit. Get ready to choose a training evolution."),
  };
  flightTrainingCopy.textContent = messages[hint] ?? "";
  flightTrainingSkip.textContent = flightTrainingEvolutionSkip.textContent = tr("跳过训练", "Skip training");
  flightTrainingEvolutionSkip.hidden = stage !== 3;
  if (stage === 3 && evolution.pending) {
    evolutionTitle.textContent = tr("模拟训练 3 / 3 · 选择战机进化", "Simulation 3 / 3 · Choose an evolution");
    evolutionDescription.textContent = tr("试选任一路线。正式出击后，击败首领才能保留本局进化。",
      "Try any path here. In the campaign, defeat a boss to earn an evolution for the current sortie.");
  }
}

function beginFlightTutorial(options) {
  const replay = options.flightTraining === "replay";
  if (!flightTrainingPanel || sortieMode() !== "campaign" || (flightTrainingSeen && !replay)) return false;
  flightTutorial = { stage: 1, hint: "shield", wait: .55, cue: null, projectile: null, outcome: 0, spentSpecial: false,
    target: null, hitTarget: false, replay, options: { difficulty: sortieStats.difficulty, fighter: sortieStats.fighter, seed: sortieStats.seed } };
  movementHint.hidden = true;
  shield.charges = 1;
  ultimate.charges = 0;
  powerupCooldown = Infinity;
  bossHitGrace = 0;
  updateShieldDisplay();
  updateUltimateDisplay();
  refreshFlightTutorial();
  return true;
}

function clearFlightTutorial() {
  if (!flightTutorial) return false;
  flightTutorial = null;
  delete app.dataset.flightTraining;
  flightTrainingPanel.hidden = true;
  flightTrainingEvolutionSkip.hidden = true;
  return true;
}

function finishFlightTutorial() {
  const training = flightTutorial;
  if (!training) return false;
  flightTrainingSeen = true;
  try { window.localStorage.setItem(flightTrainingKey, "1"); } catch { /* Session fallback. */ }
  // `showScreen` discards the simulated sortie and starts with the original campaign equipment and seed.
  if (training.replay) showScreen("menu");
  else showScreen("battle", training.options);
  return true;
}
function skipFlightTutorial() { return finishFlightTutorial(); }
function completeFlightTutorialEvolution() {
  if (flightTutorial?.stage === 3) finishFlightTutorial();
}

function noteFlightTutorialContact(shot, blocked) {
  const training = flightTutorial;
  if (training?.stage !== 1 || training.projectile !== shot) return;
  training.projectile = null;
  training.hint = blocked ? "guardHit" : "guardLate";
  if (blocked) training.outcome = .56;
  else training.wait = .80;
  refreshFlightTutorial();
}

function beginSpecialTraining(training) {
  training.stage = 2;
  training.hint = "special";
  training.outcome = 0;
  enemyProjectiles.length = 0;
  bullets.length = 0;
  resetCannonLink();
  ultimate.charges = 1;
  updateUltimateDisplay();
  spawnEnemy("armored");
  const dummy = enemies.at(-1);
  const x = viewport.width * .77;
  const y = clamp(player.y, flightBounds.top, flightBounds.bottom);
  Object.assign(dummy, { x, y, previousX: x, previousY: y, baseY: y, hp: 1, maxHp: 1,
    displayHp: 1, healthLog: Math.log(.75), speed: 0, points: 0 });
  training.target = dummy;
  refreshFlightTutorial();
}

function flightTutorialAllowsHit(target, shot) {
  const training = flightTutorial;
  if (training?.target !== target) return true;
  if (shot.source !== "ultimate") return false;
  if (!training.hitTarget) {
    training.hitTarget = true;
    training.hint = "specialHit";
    training.outcome = .72;
    refreshFlightTutorial();
  }
  return true;
}

function updateShieldTraining(training, seconds) {
  if (training.outcome > 0) {
    training.outcome -= seconds;
    if (training.outcome <= 0) beginSpecialTraining(training);
    return;
  }
  if (training.projectile) {
    if (!enemyProjectiles.includes(training.projectile)) {
      training.projectile = null;
      training.hint = "guardMiss";
      training.wait = .62;
      refreshFlightTutorial();
    }
    return;
  }
  if (training.cue) {
    training.cue.remaining -= seconds;
    if (training.cue.remaining > 0) return;
    const { x, y } = training.cue;
    training.projectile = { x, y, previousX: x, previousY: y, vx: -Math.max(350, viewport.width * .45), vy: 0,
      radius: 9, age: 0, source: "flight-training", tint: "#ffbe8e" };
    training.cue = null;
    enemyProjectiles.push(training.projectile);
    return;
  }
  training.wait -= seconds;
  if (training.wait > 0 || shieldIsActive()) return;
  if (shield.charges === 0) { shield.charges = 1; updateShieldDisplay(); }
  const x = Math.min(viewport.width - 36, player.x + Math.min(340, viewport.width * .42));
  // Keep a readably long travel even if a pilot flies almost to the right edge before the warning.
  const minTravel = player.width * .65 + 45;
  if (x - player.x < minTravel) {
    training.wait = .35;
    flightTrainingCopy.textContent = tr("向左留出一段距离，让训练弹能进入画面。", "Move left to leave room for the training round.");
    return;
  }
  training.cue = { x, y: player.y, remaining: .92 };
  refreshFlightTutorial();
}

function updateFlightTutorial(seconds) {
  const training = flightTutorial;
  if (!training) return false;
  if (!isBattleActive() || !(seconds > 0) || training.stage === 3) return true;
  updateCombatEffects(seconds);
  updateShield(seconds);
  updateCannonLink(seconds);
  updatePlayer(seconds);
  updateShipVisuals(seconds);
  updateBattlefield(seconds);
  if (training.stage === 1) {
    updateShieldTraining(training, seconds);
    updateEnemyProjectiles(seconds);
    updateEnemyProjectileDamage();
  } else {
    updateFighterCombat(seconds);
    updateShooting(seconds);
    updatePowerups(seconds);
    if (ultimate.phase !== "idle") training.spentSpecial = true;
    updateUltimate(seconds);
    if (training.hitTarget) {
      training.outcome -= seconds;
      if (training.outcome <= 0 && ultimate.phase === "idle") {
        training.stage = 3;
        openEvolutionChoice();
        refreshFlightTutorial();
      }
    } else if (training.spentSpecial && ultimate.phase === "idle") {
      training.spentSpecial = false;
      training.hint = "specialMiss";
      ultimate.charges = 1;
      updateUltimateDisplay();
      refreshFlightTutorial();
    }
  }
  return true;
}

function resizeFlightTutorial(scaleX, resizeY) {
  const cue = flightTutorial?.cue;
  if (cue) { cue.x *= scaleX; cue.y = resizeY(cue.y); }
}
function drawFlightTutorial(ctx) {
  const training = flightTutorial;
  if (!training || state !== "battle") return;
  const cue = training.cue ?? (training.stage === 1 ? training.projectile : null);
  const target = training.stage === 2 && !training.hitTarget ? training.target : null;
  if (!cue && !target) return;
  ctx.save();
  if (cue) {
    ctx.strokeStyle = "#ffc590"; ctx.lineWidth = 1.5; ctx.globalAlpha = training.projectile ? .32 : .71;
    ctx.setLineDash([12, 7]);
    ctx.beginPath(); ctx.moveTo(0, cue.y); ctx.lineTo(cue.x, cue.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(cue.x, cue.y, 13, 0, 2 * Math.PI); ctx.stroke();
  } else {
    const width = target.width * .56;
    const height = target.height * .56;
    ctx.strokeStyle = "#9fe5f6"; ctx.lineWidth = 2;
    ctx.beginPath();
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      ctx.moveTo(target.x + x * width, target.y + y * height * .52);
      ctx.lineTo(target.x + x * width, target.y + y * height);
      ctx.lineTo(target.x + x * width * .65, target.y + y * height);
    }
    ctx.stroke();
  }
  ctx.restore();
}

flightTrainingSkip?.addEventListener("mousedown", event => { if (event.button === 0) event.preventDefault(); });
flightTrainingSkip?.addEventListener("click", skipFlightTutorial);
flightTrainingEvolutionSkip?.addEventListener("click", skipFlightTutorial);
