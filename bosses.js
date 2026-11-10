"use strict";

const bossRules = { firstArrival: 65, interval: 31, warning: 5, entry: 1.65,
  recovery: .78, grace: 1.1, maxProjectiles: 240, fusionSpecialMultiplier: .78 };
const bossTypes = [
  { name: "渊潮母体", enName: "Abyssal Broodmother", color: "#79e7f3", patterns: ["broodSweep", "broodArc", "broodSpawn"] },
  { name: "骨冠猎兽", enName: "Ossuary Stalker", color: "#dfa5e6", patterns: ["boneSpears", "boneRibs", "bonePounce"] },
  { name: "灼核吞星兽", enName: "Cinder Maw", color: "#ffc279", patterns: ["cinderLava", "cinderHeart", "cinderFurnace"] },
  { name: "裂隙织母", enName: "Rift Weaver", color: "#b99bff", patterns: ["weaverCross", "weaverWeb", "weaverSnare"] },
  { name: "锁脉巨螯", enName: "Synapse Binder", color: "#90e5bc", patterns: ["binderClaw", "binderPin", "binderSpines"] },
  { name: "星尘镜魟", enName: "Mirror Ray", color: "#9db8ff", patterns: ["mirrorPrism", "mirrorBlades", "mirrorDecoy"] },
  { name: "沉渊震鳗", enName: "Tidal Wyrm", color: "#79c8ff", patterns: ["wyrmPulse", "wyrmCurrent", "wyrmStreak"] },
  { name: "裂梦孢皇", enName: "Spore Regent", color: "#cee689", patterns: ["sporeSwarm", "sporeField", "sporePollen"] },
  { name: "维度噬口", enName: "Rift Devourer", color: "#ff9b76", patterns: ["mawEclipse", "mawScars", "mawFragments"] },
  { name: "无昼神经王", enName: "Noctilucent Leviathan", color: "#f7a4cf", patterns: ["neuralSynapse", "neuralPulse", "neuralRupture"] },
  { name: "群渊合生体", enName: "Abyssal Confluence", color: "#eb97ff", patterns: ["fusionBind", "fusionCorridor", "fusionPrism"] },
];
const finalAlienType = bossTypes.length - 1;
let boss = null;
let nextBossTime = bossRules.firstArrival;
let bossDefeated = 0;
let pendingBossType = null;
// 普通敌机碰撞与 Boss 弹幕共用受伤保护时间。
let bossHitGrace = 0;
const bossProjectiles = [];
const bossHazards = [];

function activeBosses() { return boss ? [boss] : []; }
function bossTypeName(type) { return tr(bossTypes[type].name, bossTypes[type].enName); }
function chooseBossType() { return bossDefeated < bossTypes.length ? bossDefeated : null; }

function bossArena(type = boss?.type ?? 0) {
  const final = type === finalAlienType;
  const width = Math.min(player.width * (final ? 1.82 : 1.55 + type * .018), viewport.width * .34);
  const aspect = [.86, .74, .79, .86, .8, .69, .7, .9, .79, .78, .91][type];
  const height = width * aspect;
  const top = Math.min(viewport.height / 2, Math.max(height * .57 + 13, flightBounds.top + height * .1));
  const bottom = Math.max(top, Math.min(viewport.height - height * .57 - 13, flightBounds.bottom - height * .1));
  return { width, height, x: viewport.width - width * .63 - 18, y: (top + bottom) / 2, top, bottom };
}

function bossPlayerRight() {
  if (!boss) return flightBounds.right;
  const arena = bossArena();
  const edge = arena.x - arena.width * .69 - Math.min(26, arena.width * .14);
  return clamp(edge - player.width * .48 - 12, flightBounds.left, flightBounds.right);
}

function setBossMessage(title, action, visible = true) {
  const panel = document.querySelector("#boss-hud");
  panel.hidden = !visible;
  document.querySelector("#boss-name").textContent = title;
  document.querySelector("#boss-action").textContent = action;
  app.dataset.bossActive = String(visible);
}

function clearAlienThreats() {
  bossProjectiles.length = 0;
  bossHazards.length = 0;
}

function resetBossEncounter() {
  boss = null;
  nextBossTime = bossRules.firstArrival;
  bossDefeated = 0;
  pendingBossType = null;
  bossHitGrace = 0;
  clearAlienThreats();
  setBossMessage("", "", false);
  setBossWarning();
}

function resizeBossEncounter(oldWidth, oldHeight, oldBounds) {
  if (!boss) return;
  const oldBossX = boss.x;
  const oldBossY = boss.y;
  const arena = bossArena();
  Object.assign(boss, arena);
  if (oldWidth > 0 && oldHeight > 0 && oldBounds) {
    const scaleX = viewport.width / oldWidth;
    const oldSpan = oldBounds.bottom - oldBounds.top;
    const span = flightBounds.bottom - flightBounds.top;
    const scaleY = oldSpan > 0 && span > 0 ? span / oldSpan : viewport.height / oldHeight;
    const resizeY = y => oldSpan > 0 && span > 0 ? flightBounds.top + (y - oldBounds.top) * scaleY : y * scaleY;
    const widthScale = Math.min(scaleX, scaleY);
    boss.x = oldBossX * scaleX;
    boss.y = clamp(resizeY(oldBossY), arena.top, arena.bottom);
    boss.lockX *= scaleX;
    boss.lockY = resizeY(boss.lockY);
    boss.gapY = resizeY(boss.gapY);
    boss.gapSize *= scaleY;
    for (const shot of bossProjectiles) {
      shot.x = shot.previousX = shot.x * scaleX;
      shot.y = shot.previousY = resizeY(shot.y);
      shot.vx *= scaleX;
      shot.vy *= scaleY;
      if (shot.wave) shot.wave *= scaleY;
      shot.radius *= widthScale;
    }
    for (const hazard of bossHazards) {
      if (hazard.x !== undefined) hazard.x *= scaleX;
      hazard.y = resizeY(hazard.y);
      if (hazard.radius !== undefined) hazard.radius *= widthScale;
      if (hazard.thickness !== undefined) hazard.thickness *= scaleY;
      if (hazard.originX !== undefined) {
        hazard.originX *= scaleX;
        hazard.originY = resizeY(hazard.originY);
      }
      hazard.right = bossPlayerRight() + (hazard.kind === "guide" ? 0 : player.width * .22);
    }
  } else {
    clearAlienThreats();
    boss.phase = "recover";
    boss.phaseTime = 0;
  }
  boss.previousX = boss.x;
  boss.previousY = boss.y;
  bossHitGrace = Math.max(bossHitGrace, bossRules.grace);
  player.x = Math.min(player.x, bossPlayerRight());
}

function bossBlocksWaves() { return !!boss || battleTime >= nextBossTime - bossRules.warning; }
function weaponDamageLog() { return progressionPacketDamageLog(); }
function bossStageTitle(target) {
  return (target.type + 1) + "/" + bossTypes.length + " · " + target.name;
}

function bossFireProtectionFor(type) {
  if (type === finalAlienType) return { hit: .04, burst: .04, refill: .05 };
  const escalation = type / (finalAlienType - 1);
  return { hit: .05, burst: .06 - .014 * escalation, refill: .09 - .03 * escalation };
}

function spawnBoss(type = chooseBossType()) {
  if (!Number.isInteger(type) || !bossTypes[type]) return;
  const arena = bossArena(type);
  const data = bossTypes[type];
  const alienFinal = type === finalAlienType;
  const endurance = alienFinal ? 124 : 68 + type * 4.2;
  const healthLog = progressionBossHealthLog(battleTime, endurance);
  boss = { ...arena, type, alien: true, alienFinal, color: data.color, name: bossTypeName(type),
    hp: 1, maxHp: 1, displayHp: 1, healthLog, endurance, fireProtection: bossFireProtectionFor(type),
    x: viewport.width + arena.width / 2, previousX: viewport.width + arena.width / 2, previousY: arena.y,
    phase: "enter", phaseTime: 0, age: 0, hitFlash: 0, attackIndex: -1,
    alienAttack: null, enraged: false, lockX: player.x, lockY: player.y, gapY: player.y, gapSize: 0,
    lashPulse: 0, lashSide: 1, lashIndex: 0 };
  if (typeof preloadAlienBossArt === "function") preloadAlienBossArt(type);
  enemies.length = 0;
  resetEnemyCombat(false);
  clearAlienThreats();
  pendingBossType = null;
  bossHitGrace = 1.7;
  setBossWarning();
  player.x = Math.min(player.x, bossPlayerRight());
  movementHint.hidden = true;
  setBossMessage(bossStageTitle(boss), tr("异形正在现身 · 留意攻击预警", "Alien emerging · Watch for attack warnings"));
  statusMessage.textContent = tr(boss.name + "出现，普通敌机暂停生成。", boss.name + " has arrived. Regular enemy spawns are paused.");
}

function updateAlienBossPose(target, seconds) {
  const arena = bossArena();
  const quiet = reducedMotion.matches ? .32 : 1;
  const wake = target.age * (target.enraged ? 1.17 : 1) + target.type * .54;
  const room = arena.bottom - arena.top;
  let swayX = (Math.sin(wake * 1.44) + Math.sin(wake * 2.28) * .33) * Math.min(14, target.width * .05);
  let swayY = (Math.sin(wake * 1.7) + Math.cos(wake * .87) * .32) * Math.min(38, room * .11);
  if (target.phase === "enter") {
    const progress = clamp(target.phaseTime / bossRules.entry, 0, 1);
    target.x = arena.x + (viewport.width + arena.width / 2 - arena.x) * Math.pow(1 - progress, 3);
    target.y = clamp(arena.y + swayY * quiet, arena.top, arena.bottom);
    return;
  }
  if (target.phase === "telegraph" || target.phase === "attack") {
    const warming = target.phase === "telegraph";
    const progress = target.phaseTime / (warming ? target.telegraphDuration : target.attackDuration);
    const envelope = warming ? progress : 1 - progress;
    if (target.attackMotion === "lunge") {
      swayX += warming ? 16 * progress : -30 * Math.sin(Math.PI * clamp(progress * 2, 0, 1));
      swayY += clamp(target.lockY - arena.y, -room * .19, room * .19) * envelope;
    } else if (target.attackMotion === "sweep") {
      swayY += Math.sin(Math.PI * (warming ? progress * .4 : .4 + progress * 1.4))
        * Math.min(73, room * .19) * target.side;
      swayX -= Math.min(18, target.width * .12) * envelope;
    } else if (target.attackMotion === "coil") {
      swayX += Math.min(23, target.width * .11) * envelope;
      swayY += Math.sin(Math.PI * progress) * Math.min(30, room * .12) * target.side;
    } else if (target.attackMotion === "recoil") {
      swayX += Math.min(26, target.width * .14) * Math.sin(Math.PI * progress) * (warming ? -1 : 1);
      swayY -= Math.min(35, room * .11) * envelope * target.side;
    }
  }
  if (target.lashPulse > 0) {
    swayX -= 24 * target.lashPulse;
    swayY += Math.min(18, room * .065) * target.lashPulse * target.lashSide;
  }
  const follow = 1 - Math.exp(-seconds * 7);
  target.x += (arena.x + swayX * quiet - target.x) * follow;
  target.y += (clamp(arena.y + swayY * quiet, arena.top, arena.bottom) - target.y) * follow;
}

function updateBossEncounter(seconds) {
  if (!isBattleActive()) return;
  bossHitGrace = Math.max(0, bossHitGrace - seconds);
  updateBossProjectiles(seconds);
  if (!boss) {
    if (battleTime < nextBossTime - bossRules.warning) return;
    if (pendingBossType === null) {
      pendingBossType = chooseBossType();
      if (pendingBossType === null) return;
      if (typeof preloadAlienBossArt === "function") preloadAlienBossArt(pendingBossType);
      enemies.length = 0;
      resetEnemyCombat(false);
      gameAudio.warning();
    }
    const name = bossTypeName(pendingBossType);
    setBossWarning(name);
    const eta = Math.max(0, Math.ceil(nextBossTime - battleTime));
    setBossMessage(bossStageTitle({ type: pendingBossType, name }),
      tr("异形接近 · " + eta + " 秒后抵达", "Alien incoming · ETA " + eta + " s"));
    if (battleTime >= nextBossTime) spawnBoss(pendingBossType);
    return;
  }
  boss.age += seconds;
  boss.phaseTime += seconds;
  boss.lashPulse = Math.max(0, boss.lashPulse - seconds / .48);
  boss.previousX = boss.x;
  boss.previousY = boss.y;
  boss.hitFlash = Math.max(0, boss.hitFlash - seconds);
  boss.displayHp += (boss.hp - boss.displayHp) * (reducedMotion.matches ? 1 : 1 - Math.exp(-seconds * 12));
  updateAlienBossPose(boss, seconds);
  if (boss.phase === "enter" && boss.phaseTime >= bossRules.entry) {
    boss.phase = "recover";
    boss.phaseTime = 0;
  } else if (boss.phase === "recover") {
    const recovery = Math.max(.43, bossRules.recovery - boss.type * .027 - (boss.enraged ? .13 : 0));
    if (boss.phaseTime >= recovery) prepareAlienAttack(boss);
  } else if (boss.phase === "telegraph" && boss.phaseTime >= boss.telegraphDuration) {
    boss.phase = "attack";
    boss.phaseTime -= boss.telegraphDuration;
    runAlienAttack(boss);
  } else if (boss.phase === "attack") {
    runAlienAttack(boss);
    if (boss.phaseTime >= boss.attackDuration) {
      boss.phase = "recover";
      boss.phaseTime = 0;
    }
  }
}

function bossCanTakeDamage(target = boss) { return !!target && target === boss && target.phase !== "enter"; }

// Measured in visible sprite fractions. A central body and two appendage regions
// let aimed shots graze organic outlines without treating the whole frame as solid.
const alienBodyRegions = [
  [[0, -.08, .84, .5], [.04, -.3, .55, .25], [.03, .29, .57, .28]],
  [[0, 0, .92, .43], [.11, -.27, .58, .28], [.07, .27, .58, .26]],
  [[0, 0, .91, .52], [.09, -.29, .62, .24], [.03, .25, .66, .26]],
  [[0, 0, .89, .43], [.06, -.27, .69, .27], [.04, .27, .66, .27]],
  [[0, 0, .93, .46], [-.05, -.27, .71, .29], [-.05, .27, .71, .29]],
  [[0, 0, .88, .45], [.13, -.29, .56, .23], [.13, .29, .56, .23]],
  [[0, 0, .91, .48], [.15, -.25, .55, .25], [-.13, .27, .52, .22]],
  [[0, 0, .86, .48], [.03, -.29, .64, .31], [.1, .29, .54, .29]],
  [[0, 0, .96, .52], [.06, -.3, .65, .26], [.06, .29, .68, .27]],
  [[0, 0, .96, .5], [.06, -.29, .7, .29], [.06, .29, .7, .29]],
  [[0, 0, .97, .52], [.05, -.32, .75, .31], [.05, .32, .75, .31]],
];

function projectileAlienBossHit(bullet, target) {
  if (!bossCanTakeDamage(target)) return null;
  let first = Infinity;
  for (const [x, y, width, height] of alienBodyRegions[target.type]) {
    const offsetX = x * target.width, offsetY = y * target.height;
    const region = { x: target.x + offsetX, y: target.y + offsetY,
      previousX: target.previousX + offsetX, previousY: target.previousY + offsetY,
      width: width * target.width / .9, height: height * target.height / .8 };
    first = Math.min(first, projectileEnemyEntry(bullet, region));
  }
  return Number.isFinite(first) ? { time: first, component: null } : null;
}

function applyBossHit(shot, target = boss) {
  if (!bossCanTakeDamage(target)) return;
  const before = target.hp;
  const damageLog = shot.damageLog ?? Math.log(shot.damage ?? weapon.damage);
  const special = shot.source === "ultimate";
  const rawFraction = special
    ? Math.exp(Math.min(Math.log(ultimateRules.bossDamageCap), damageLog - target.healthLog))
    : progressionHitFraction(target, damageLog, target.fireProtection);
  // The attacking shell absorbs part of the incoming damage, but no attack is invulnerable.
  const attackingShell = target.phase !== "attack" ? 1 : target.alienFinal && target.enraged ? .62 : .78;
  const specialMultiplier = special && target.alienFinal ? bossRules.fusionSpecialMultiplier : 1;
  const fraction = rawFraction * attackingShell * specialMultiplier;
  if (fraction <= 0) return;
  target.hp = Math.max(0, target.hp - fraction);
  target.hitFlash = .08;
  recordCombatImpact(target, shot, true);
  if (!shot.noEnergy && shot.source !== "ultimate" && shot.source !== "blast") gainUltimateEnergy(before - target.hp, "boss");
  if (target.hp <= 1e-12) {
    defeatBoss(target);
  } else if (target.hp <= .5 && !target.enraged) {
    target.enraged = true;
    target.enragedAt = target.age;
    gameAudio.bossEnrage();
    if (target.type === 0) {
      clearAlienThreats();
      target.phase = "recover";
      target.phaseTime = 0;
      target.lashPulse = 0;
      target.attackIndex = -1;
      bossHitGrace = Math.max(bossHitGrace, .6);
    }
    setBossMessage(bossStageTitle(target), target.type === 0
      ? tr("外壳脱落 · 多重触须正在展开", "Shell ruptured · Multiple tendrils unfolding")
      : tr("狂暴模式 · 攻势加速，保持移动", "Enraged · Attacks speed up. Keep moving."));
    statusMessage.textContent = tr(target.name + "进入狂暴模式。", target.name + " is enraged.");
  }
}

function defeatBoss(target = boss) {
  if (!target || target !== boss) return;
  const fallen = target;
  boss = null;
  bossDefeated = Math.max(bossDefeated, fallen.type + 1);
  const points = fallen.alienFinal ? 6000 : 2000;
  score += points;
  kills++;
  registerMomentumKill();
  scoreDisplay.textContent = String(score).padStart(6, "0");
  createExplosion(fallen, points);
  const recovered = player.lives;
  if (!fallen.alienFinal && bossDefeated % 3 === 0) grantPlayerLife();
  clearAlienThreats();
  enemies.length = 0;
  resetEnemyCombat(false);
  bossHitGrace = 1.5;
  setBossWarning();
  if (!fallen.alienFinal) {
    for (const [index, type] of ["blue", "yellow", "red"].entries()) {
      powerups.push({ x: fallen.x, previousX: fallen.x, y: clamp(fallen.y + (index - 1) * 75, flightBounds.top, flightBounds.bottom),
        radius: powerupRules.radius, type });
    }
  }
  const healed = player.lives > recovered;
  powerupNotice.textContent = tr(fallen.name + "已击破 · +" + points + "分" + (healed ? " · 恢复1点生命" : ""),
    fallen.name + " defeated · +" + points + " points" + (healed ? " · +1 life" : ""));
  powerupNotice.dataset.type = "yellow";
  powerupNotice.hidden = false;
  upgradeNoticeTime = 3;
  statusMessage.textContent = powerupNotice.textContent;
  nextBossTime = fallen.alienFinal ? Infinity : battleTime + Math.max(18, bossRules.interval - (bossDefeated - 1) * 1.5);
  enemyCooldown = 2;
  setBossMessage("", "", false);
  startBossDeathPresentation(fallen);
}

function bossShotHitsPlayer(shot) {
  if (consumeEvolutionShieldProjectile(shot)) return true;
  const radius = player.height * .16 + shot.radius;
  const x0 = shot.previousX - (player.previousX ?? player.x);
  const y0 = shot.previousY - (player.previousY ?? player.y);
  const dx = shot.x - player.x - x0, dy = shot.y - player.y - y0;
  const distance = dx * dx + dy * dy;
  const progress = distance ? clamp(-(x0 * dx + y0 * dy) / distance, 0, 1) : 0;
  return Math.hypot(x0 + progress * dx, y0 + progress * dy) <= radius;
}

function updateBossDamage() {
  if (!isBattleActive()) return;
  let hit = false;
  for (let index = bossProjectiles.length - 1; index >= 0; index--) {
    if (bossShotHitsPlayer(bossProjectiles[index])) {
      bossProjectiles.splice(index, 1);
      hit = true;
    }
  }
  if (hit) tryPerfectShield();
  if (hit || bossHazards.some(alienHazardHitsPlayer)) damagePlayer(tr("被异形 Boss 攻击命中", "Hit by an alien boss attack"));
}

function drawBossBattle() {
  const quiet = reducedMotion.matches;
  for (const hazard of bossHazards) drawAlienHazard(context, hazard, quiet);
  if (boss) {
    drawBossShip(context, boss, quiet);
    const width = boss.width * .85, y = boss.y - boss.height * .58 - 9;
    context.save();
    context.fillStyle = "#111c30";
    context.beginPath();
    context.roundRect(boss.x - width / 2, y, width, 7, 3.5);
    context.fill();
    const filled = width * clamp(boss.displayHp, 0, 1);
    if (filled > 0) {
      context.fillStyle = boss.enraged ? "#ff8e98" : boss.color;
      context.beginPath();
      context.roundRect(boss.x - width / 2, y, filled, 7, Math.min(3.5, filled / 2));
      context.fill();
    }
    if (boss.phase === "attack") {
      context.strokeStyle = "#cfdeffd9";
      context.lineWidth = 1;
      context.setLineDash([3, 3]);
      context.beginPath();
      context.moveTo(boss.x - width / 2, y - 3);
      context.lineTo(boss.x + width / 2, y - 3);
      context.stroke();
    }
    context.restore();
  }
  for (const shot of bossProjectiles) drawAlienProjectile(context, shot, quiet);
  if (bossHitGrace > 0 && boss && state === "battle") {
    context.save();
    context.strokeStyle = "#c5e7ff";
    context.globalAlpha = .45;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(player.x, player.y, player.height * .21, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }
}
