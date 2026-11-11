"use strict";

// One bounded, session-local checkpoint. Never restore the persistent profile:
// it may contain unlocks, purchases or changes made by another tab since arrival.
let bossRetryCheckpoint = null;
let bossRetryAvailable = false;
let restoringBossCheckpoint = false;
const bossRetryButton = document.querySelector("#boss-retry-button");
const bossRetryNote = document.querySelector("#boss-retry-note");

function bossRetryFields(object, names) {
  return structuredClone(Object.fromEntries(names.map(name => [name, object[name]])));
}

// Active special shots can contain WeakSets and references to discarded enemies.
// Their numeric flight state survives; hit registries and homing targets do not.
function bossRetryShotCopy(shot) {
  if (!shot) return null;
  return JSON.parse(JSON.stringify(shot, (key, value) => {
    if (key === "target") return null;
    if (value instanceof WeakSet || value instanceof WeakMap) return undefined;
    return value;
  }));
}

function clearBossRetryCheckpoint() {
  bossRetryCheckpoint = null;
  bossRetryAvailable = false;
  refreshBossRetryUI();
}

function captureBossRetryCheckpoint(type) {
  if (restoringBossCheckpoint || state !== "battle" || !sortieStats || player.lives <= 0) return;
  const { random, result, ...run } = sortieStats;
  bossRetryCheckpoint = {
    type, run: structuredClone(run), randomState: random.getState(), fighter: sortieFighter,
    viewport: { ...viewport }, bounds: { ...flightBounds },
    time: battleTime, score, kills, bossDefeated, nextBossTime,
    enemyCooldown, enemySpawnCount, powerupCooldown, powerupSpawnCount, shotCooldown,
    player: bossRetryFields(player, ["x", "y", "speed", "lives", "maxLives", "hitFlash"]),
    weapon: { ...weapon }, firingStyle: { ...firingStyle },
    evolution: structuredClone({ ...evolution, pending: false, resetConfirm: false, choice: "", pulses: [] }),
    shield: structuredClone(shield),
    ultimate: { ...ultimate, audioActive: false, shot: bossRetryShotCopy(ultimate.shot) },
    cannonLink: { ...cannonLink }, momentum: structuredClone(momentum),
    fighterCombat: bossRetryFields(fighterCombat, ["stability", "redCooldown", "capacitor", "field"]),
    evolutionWeapons: bossRetryFields(evolutionWeapons, ["clock", "lanceCooldown", "splitCooldown", "droneCooldown",
      "interceptCooldown", "grounded", "armorRoundRemaining"]),
    absorbed: evolutionWeapons.absorbed.map(bossRetryShotCopy),
    battlefield: { ...battlefieldState }, journey: structuredClone(journeyState),
    events: bossRetryFields(battlefieldEvents, ["clock", "nextObject", "nextTransport", "objectCount"]),
    ace: bossRetryFields(aceEncounter, ["nextTime", "sequence"]),
    elite: bossRetryFields(eliteDirector, ["next", "order", "spawned"]),
    gravitySequence: gravityTide.sequence,
    formations: bossRetryFields(formationState, ["nextTime", "sequence", "nextId"]),
    introduced: [...enemyIntroduced], powerups: structuredClone(powerups)
  };
  bossRetryAvailable = false;
}

function prepareBossRetryResult(won) {
  bossRetryAvailable = !won && player.lives === 0 && !!boss
    && !!bossRetryCheckpoint && boss.type === bossRetryCheckpoint.type;
}

function refreshBossRetryUI() {
  if (!bossRetryButton || !bossRetryNote) return;
  const available = bossRetryAvailable && !!bossRetryCheckpoint;
  bossRetryButton.hidden = !available;
  bossRetryNote.hidden = !available;
  bossRetryButton.textContent = tr("从本场 Boss 重新挑战", "Retry this Boss");
  bossRetryNote.textContent = available
    ? tr(`回到「${bossTypeName(bossRetryCheckpoint.type)}」入场时。恢复当时的战机、进化、生命和技能储备；本局后续不计正式纪录与成就。检查点仅保留在当前页面。`,
      `Return to ${bossTypeName(bossRetryCheckpoint.type)}'s arrival with your original fighter, build, lives and skill reserves. Further play is unranked and earns no achievements. Checkpoint lasts for this page only.`)
    : "";
}

function retryBossFromCheckpoint() {
  if (state !== "over" || !bossRetryAvailable || !bossRetryCheckpoint) return false;
  const checkpoint = bossRetryCheckpoint;
  const retryCount = (sortieStats?.retryCount ?? 0) + 1;
  // Clone on every retry. The stored checkpoint is never a live gameplay object.
  const saved = structuredClone(checkpoint);
  gameAudio.unlock();
  showScreen("battle", { ...saved.run, day: saved.run.daily?.day });
  // Sync the real canvas dimensions first: the result screen may have been resized.
  resizeBattlefield();
  sortieStats = { ...saved.run, random: sortieGenerator(saved.run.seed, saved.randomState),
    result: null, retried: true, retryCount };
  sortieFighter = saved.fighter;
  battleTime = saved.time; score = saved.score; kills = saved.kills;
  bossDefeated = saved.bossDefeated; nextBossTime = saved.nextBossTime;
  enemyCooldown = saved.enemyCooldown; enemySpawnCount = saved.enemySpawnCount;
  powerupCooldown = saved.powerupCooldown; powerupSpawnCount = saved.powerupSpawnCount;
  Object.assign(weapon, saved.weapon);
  Object.assign(evolution, saved.evolution);
  Object.assign(momentum, saved.momentum);
  Object.assign(firingStyle, saved.firingStyle);
  Object.assign(battlefieldState, saved.battlefield);
  Object.assign(journeyState, saved.journey);
  Object.assign(battlefieldEvents, saved.events);
  Object.assign(aceEncounter, saved.ace);
  Object.assign(eliteDirector, saved.elite);
  gravityTide.sequence = saved.gravitySequence;
  Object.assign(formationState, saved.formations);
  for (const kind of saved.introduced) enemyIntroduced.add(kind);

  const scaleX = viewport.width / saved.viewport.width;
  const oldSpan = saved.bounds.bottom - saved.bounds.top;
  const scaleY = oldSpan > 0 ? (flightBounds.bottom - flightBounds.top) / oldSpan : 1;
  const resizeY = y => flightBounds.top + (y - saved.bounds.top) * scaleY;
  const resizeAttack = object => {
    if (!object || typeof object !== "object") return;
    for (const [key, value] of Object.entries(object)) {
      if (typeof value === "number") {
        if (["x", "previousX", "startX"].includes(key)) object[key] *= scaleX;
        else if (["y", "previousY", "aimY"].includes(key)) object[key] = resizeY(value);
      } else resizeAttack(value);
    }
  };
  Object.assign(player, saved.player);
  player.x = clamp(saved.player.x * scaleX, flightBounds.left, flightBounds.right);
  player.y = clamp(resizeY(saved.player.y), flightBounds.top, flightBounds.bottom);
  player.previousX = player.x; player.previousY = player.y;
  // Clear held keys before restoring resources. This must not cancel a restored charge.
  clearMovement();
  Object.assign(fighterCombat, saved.fighterCombat);
  resizeAttack(fighterCombat.field);
  Object.assign(evolutionWeapons, saved.evolutionWeapons);
  evolutionWeapons.absorbed = saved.absorbed;
  evolutionWeapons.drones = getEvolutionDronePositions();
  Object.assign(shield, saved.shield);
  resizeAttack(shield.effect);
  Object.assign(ultimate, saved.ultimate);
  if (ultimate.shot) {
    resizeAttack(ultimate.shot);
    if (ultimate.kind === "red") ultimate.shot.hitTargets = new WeakSet();
    if (ultimate.kind === "yellow") for (const wave of ultimate.shot.waves) wave.hitTargets = new WeakSet();
  }
  Object.assign(cannonLink, saved.cannonLink);
  shotCooldown = saved.shotCooldown;
  for (const orb of saved.powerups) { resizeAttack(orb); powerups.push(orb); }
  bossRetryCheckpoint = checkpoint;
  bossRetryAvailable = false;
  restoringBossCheckpoint = true;
  try { spawnBoss(saved.type); }
  finally { restoringBossCheckpoint = false; }
  player.previousX = player.x; player.previousY = player.y;
  combatStepRemainder = 0; previousTime = 0;
  lastDifficultySecond = -1;
  scoreDisplay.textContent = String(score).padStart(6, "0");
  updateDifficultyDisplay();
  updateWeaponDisplay(); updateLifeDisplay(); updateFiringStyleDisplay();
  updateEvolutionDisplay(); updateMomentumDisplay(); updateShieldDisplay(); updateUltimateDisplay();
  updateFighterSystemsHud(); refreshSortieHud(); refreshBossRetryUI();
  canvas.focus({ preventScroll: true });
  updatePauseHint();
  statusMessage.textContent = tr(`已回到${bossTypeName(saved.type)}入场时的状态。本局后续不计正式成绩。`,
    `Restored your state at ${bossTypeName(saved.type)}'s arrival. Further play is unranked.`);
  return true;
}

bossRetryButton?.addEventListener("click", retryBossFromCheckpoint);
