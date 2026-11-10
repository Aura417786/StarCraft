"use strict";

const bossRules = { firstArrival: 65, interval: 31, warning: 5, artLead: 20,
  recovery: .78, grace: 1.1, maxProjectiles: 240, fusionSpecialMultiplier: .78, shellThreshold: .5 };
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
let prefetchedBossType = null;
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
  app.dataset.bossFinale = String(visible && !!boss?.finale);
  app.dataset.bossPhase = !visible ? "" : !boss ? "warning" : boss.finale ? "finale"
    : boss.phase === "enter" ? "entry" : boss.phase === "rupture" ? "rupture"
    : boss.phase === "recover" && boss.alienAttack ? "recover" : boss.enraged ? "frenzy" : "hunt";
}

function bossHealthStage(target) {
  if (target.finale) return tr("III · 终局形态", "III · Final form");
  if (target.phase === "rupture") return tr("II · 外壳破裂", "II · Shell rupture");
  if (!target.enraged) return tr("I · 护壳防御", "I · Armored");
  return target.phase === "recover" && target.alienAttack ? tr("II · 核心外露", "II · Core exposed")
    : tr("II · 狂暴核心", "II · Frenzied core");
}

function updateBossHealthHud() {
  const health = document.querySelector("#boss-health");
  if (!health) return;
  const stage = document.querySelector("#boss-stage");
  const hidden = !boss;
  if (health.hidden !== hidden) health.hidden = hidden;
  if (stage.hidden !== hidden) stage.hidden = hidden;
  if (!boss) return;
  const track = document.querySelector("#boss-track");
  const life = clamp(boss.hp, 0, 1);
  const lag = clamp(boss.displayHp ?? life, life, 1);
  const phase = bossHealthStage(boss);
  const finale = !!boss.finale;
  const percentOf = ratio => Math.ceil(clamp(ratio, 0, 1) * 100 - 1e-9);
  const core = percentOf(life / bossRules.shellThreshold);
  const shell = percentOf((life - bossRules.shellThreshold) / (1 - bossRules.shellThreshold));
  const percent = percentOf(life);
  const feedback = boss.hitFlash > 0;
  const key = [phase, gameLanguage, finale, life, lag.toFixed(3), feedback].join("/");
  if (track.dataset.valueKey === key) return;
  track.dataset.valueKey = key;
  health.dataset.finale = String(finale);
  health.dataset.hit = String(feedback);
  track.style.setProperty("--boss-break", bossRules.shellThreshold * 100 + "%");
  track.style.setProperty("--boss-hp", life * 100 + "%");
  track.style.setProperty("--boss-lag", lag * 100 + "%");
  stage.textContent = phase;
  const coreText = finale ? tr("终局核心", "Finale core") + " " + percent + "%" : tr("核心", "Core") + " " + core + "%";
  const shellText = tr("护壳", "Shell") + " " + shell + "%";
  document.querySelector("#boss-core-life").textContent = coreText;
  const shellLabel = document.querySelector("#boss-shell-life");
  shellLabel.hidden = finale;
  shellLabel.textContent = shellText;
  document.querySelector("#boss-finale-label").textContent = finale ? tr("终局", "FINALE") : tr("◇ 终局待开启", "◇ Finale ahead");
  track.setAttribute("aria-valuenow", String(percent));
  track.setAttribute("aria-valuetext", phase + " · " + coreText + (finale ? "" : " · " + shellText));
}

function clearAlienThreats() {
  bossProjectiles.length = 0;
  bossHazards.length = 0;
}

function clearBossFinaleAttacks() {
  clearAlienThreats();
  enemyProjectiles.length = 0;
  bullets.length = 0;
  pendingShots = 0;
  muzzleFlash = 0;
  clearEvolutionWeaponTransients();
  if (ultimate.phase !== "idle") cancelUltimate(true);
}

function resetBossEncounter() {
  boss = null;
  nextBossTime = bossRules.firstArrival;
  bossDefeated = 0;
  pendingBossType = null;
  prefetchedBossType = null;
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
    if (boss.finale && boss.finale.age < boss.finale.transform) {
      boss.finale.startX *= scaleX;
      boss.finale.startY = resizeY(boss.finale.startY);
    }
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
      if (resizeAlienSignatureHazard(hazard, scaleX, scaleY, resizeY)) continue;
      if (hazard.x !== undefined) hazard.x *= scaleX;
      if (hazard.y !== undefined) hazard.y = resizeY(hazard.y);
      if (hazard.radius !== undefined) hazard.radius *= widthScale;
      if (hazard.thickness !== undefined) hazard.thickness *= hazard.kind === "seam" ? scaleX : scaleY;
      if (hazard.originX !== undefined) {
        hazard.originX *= scaleX;
        hazard.originY = resizeY(hazard.originY);
      }
      hazard.right = bossPlayerRight() + (hazard.kind === "guide" ? 0 : player.width * .22);
    }
  } else if (!boss.finale) {
    clearAlienThreats();
    boss.phase = "recover";
    boss.phaseTime = 0;
  }
  boss.previousX = boss.x;
  boss.previousY = boss.y;
  if (boss.finale) resizeBossFinale(boss);
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
    alienAttack: null, attackLabel: null, pressureCycle: 0, enraged: false, lockX: player.x, lockY: player.y, gapY: player.y, gapSize: 0,
    lashPulse: 0, lashSide: 1, lashIndex: 0 };
  if (typeof preloadAlienBossArt === "function") preloadAlienBossArt(type);
  preloadBossFinaleArt(type);
  enemies.length = 0;
  resetEnemyCombat(false);
  if (battlefieldEvents.objects.length || battlefieldEvents.transport) resetBattlefieldEvents(false);
  clearAlienThreats();
  pendingBossType = null;
  bossHitGrace = 1.7;
  setBossWarning();
  player.x = Math.min(player.x, bossPlayerRight());
  movementHint.hidden = true;
  setBossMessage(bossStageTitle(boss), tr("异形正在现身 · 留意攻击预警", "Alien emerging · Watch for attack warnings"));
  statusMessage.textContent = tr(boss.name + "出现，普通敌机暂停生成。", boss.name + " has arrived. Regular enemy spawns are paused.");
  playEntrance(boss);
}

function updateAlienBossPose(target, seconds) {
  const arena = bossArena();
  const quiet = reducedMotion.matches ? .32 : 1;
  const wake = target.age * (target.enraged ? 1.17 : 1) + target.type * .54;
  const room = arena.bottom - arena.top;
  let swayX = (Math.sin(wake * 1.44) + Math.sin(wake * 2.28) * .33) * Math.min(14, target.width * .05);
  let swayY = (Math.sin(wake * 1.7) + Math.cos(wake * .87) * .32) * Math.min(38, room * .11);
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
  if (advanceLivingBossPresentation(seconds) || !isBattleActive()) return;
  bossHitGrace = Math.max(0, bossHitGrace - seconds);
  updateBossProjectiles(seconds);
  if (!boss) {
    // Start streaming the upcoming body before the five-second encounter warning.
    if (battleTime >= nextBossTime - bossRules.artLead && prefetchedBossType !== bossDefeated) {
      prefetchedBossType = chooseBossType();
      if (prefetchedBossType !== null && typeof preloadStarBreakerModel === "function") {
        preloadStarBreakerModel(prefetchedBossType);
      }
      if (prefetchedBossType === 0 && typeof preloadHadalSurface === "function") preloadHadalSurface();
    }
    if (battleTime < nextBossTime - bossRules.warning) return;
    if (pendingBossType === null) {
      pendingBossType = chooseBossType();
      if (pendingBossType === null) return;
      if (typeof preloadAlienBossArt === "function") preloadAlienBossArt(pendingBossType);
      preloadBossFinaleArt(pendingBossType);
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
  if (boss.finale) {
    updateBossFinale(boss, seconds);
    return;
  }
  updateAlienBossPose(boss, seconds);
  if (boss.phase === "recover") {
    if (boss.phaseTime >= alienRecoveryDuration(boss)) prepareAlienAttack(boss, true);
  } else if (boss.phase === "telegraph" && boss.phaseTime >= boss.telegraphDuration) {
    boss.phase = "attack";
    boss.phaseTime -= boss.telegraphDuration;
    runAlienAttack(boss);
  } else if (boss.phase === "attack") {
    runAlienAttack(boss);
    if (boss.phaseTime >= boss.attackDuration) beginAlienRecovery(boss);
  }
}

function alienRuptureGuard(target) {
  return target.phase === "rupture"
    || (target.phase === "telegraph" && target.alienAttack === "pressure" && target.pressureCycle === 1);
}
function bossCanTakeDamage(target = boss) {
  return !!target && target === boss && !isBossPresentationPlaying() && target.phase !== "enter" && !alienRuptureGuard(target);
}

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
  if (target.finale) return projectileBossFinaleHit(bullet, target);
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
  const finaleMultiplier = target.finale ? bossFinaleDamageMultiplier(target, shot) : 1;
  if (!(finaleMultiplier > 0)) return;
  const before = target.hp;
  const damageLog = shot.damageLog ?? Math.log(shot.damage ?? weapon.damage);
  const special = shot.source === "ultimate";
  const rawFraction = special
    ? Math.exp(Math.min(Math.log(ultimateRules.bossDamageCap), damageLog - target.healthLog))
    : progressionHitFraction(target, damageLog, target.fireProtection);
  // The attacking shell absorbs part of the incoming damage, but no attack is invulnerable.
  const exposed = target.phase === "recover" && target.alienAttack;
  const attackingShell = exposed ? 1.18 : target.phase !== "attack" ? 1
    : target.alienAttack === "pressure" ? .71 : target.alienFinal && target.enraged ? .62 : .78;
  const specialMultiplier = special && target.alienFinal ? bossRules.fusionSpecialMultiplier : 1;
  const fraction = rawFraction * attackingShell * specialMultiplier * finaleMultiplier;
  if (fraction <= 0) return;
  target.hp = Math.max(0, target.hp - fraction);
  target.hitFlash = .08;
  recordCombatImpact(target, shot, true);
  if (!shot.noEnergy && shot.source !== "ultimate" && shot.source !== "blast") gainUltimateEnergy(before - target.hp, "boss");
  if (target.hp <= 1e-12) {
    if (target.finale) defeatBoss(target);
    else {
      enemies.length = 0;
      resetEnemyCombat(false);
      beginBossFinale(target);
    }
  } else if (!target.finale && target.hp <= bossRules.shellThreshold && !target.enraged) {
    beginAlienRupture(target);
  }
}

function defeatBoss(target = boss) {
  if (!target || target !== boss) return;
  const fallen = target;
  const motion = fallen.finale ? captureBossPresentationMotion() : null;
  boss = null;
  bossDefeated = Math.max(bossDefeated, fallen.type + 1);
  const points = fallen.alienFinal ? 6000 : 2000;
  score += points;
  kills++;
  registerMomentumKill();
  if (!fallen.finale) createExplosion(fallen, points);
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
  const reward = tr(fallen.name + "已击破 · +" + points + "分" + (healed ? " · 恢复1点生命" : ""),
    fallen.name + " defeated · +" + points + " points" + (healed ? " · +1 life" : ""));
  powerupNotice.hidden = true;
  nextBossTime = fallen.alienFinal ? Infinity : battleTime + Math.max(18, bossRules.interval - (bossDefeated - 1) * 1.5);
  enemyCooldown = 2;
  setBossMessage("", "", false);
  startBossDeathPresentation(fallen, reward, motion);
}

function bossShotHitsPlayer(shot) {
  return consumeEvolutionShieldProjectile(shot) || hostileShotHitsHull(shot, player);
}

function updateBossDamage() {
  if (!isBattleActive()) return;
  let contact;
  for (let index = bossProjectiles.length - 1; index >= 0; index--) {
    const shot = bossProjectiles[index];
    if (bossShotHitsPlayer(shot)) {
      bossProjectiles.splice(index, 1);
      contact = shot;
    }
  }
  if (contact) tryPerfectShield();
  if (!isBattleActive()) return;
  const hazard = bossHazards.find(area => !area.hitPlayer && alienHazardHitsPlayer(area));
  const finale = boss?.finale && bossFinaleHitsPlayer(boss) ? boss : null;
  if (contact || hazard || finale) {
    // Lingering areas can hit once each. Repeated, newly telegraphed attacks
    // still damage the player even when they originate from the same move.
    const damaged = damagePlayer(alienDamageExplanation(contact || hazard || {}, finale));
    if (damaged && hazard && !contact) hazard.hitPlayer = true;
  }
}

function drawBossBattle() {
  updateBossHealthHud();
  const quiet = reducedMotion.matches || (typeof visualQuality !== "undefined" && visualQuality.id === "low");
  for (const hazard of bossHazards) drawAlienHazard(context, hazard, quiet);
  const scene = activeBossPresentation();
  if (scene && scene.kind !== "death") drawBossPresentationBody(context, scene, quiet);
  else if (boss?.finale) drawBossFinale(context, boss, quiet);
  else if (boss) drawBossShip(context, boss, quiet);
  for (const shot of bossProjectiles) drawHostileProjectile(context, shot, shot.color, quiet);
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
