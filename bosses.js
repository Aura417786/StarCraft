"use strict";

const bossRules = { firstArrival: 65, interval: 31, warning: 5, artLead: 20,
  recovery: .78, grace: 1.1, maxProjectiles: 240, fusionSpecialMultiplier: .78, shellThreshold: .5,
  armoredMinimum: 0, exposedWindow: 2.4, coreMinimum: 0, finaleMinimum: 0, counterWindow: 1.5 };
const bossTypes = [
  { name: "渊潮母体", enName: "Abyssal Broodmother", color: "#79e7f3", fireRefill: .042,
    patterns: ["broodSweep", "broodArc", "broodSpawn"] },
  { name: "骨冠猎兽", enName: "Ossuary Stalker", color: "#dfa5e6", patterns: ["boneSpears", "boneRibs", "bonePounce"] },
  { name: "灼核吞星兽", enName: "Cinder Maw", color: "#ffc279", patterns: ["cinderLava", "cinderHeart", "cinderFurnace"] },
  { name: "裂隙织母", enName: "Rift Weaver", color: "#b99bff", patterns: ["weaverCross", "weaverWeb", "weaverSnare"] },
  { name: "锁脉巨螯", enName: "Synapse Binder", color: "#90e5bc", patterns: ["binderClaw", "binderPin", "binderSpines"] },
  { name: "星尘镜魟", enName: "Mirror Ray", color: "#9db8ff", fireRefill: .058,
    patterns: ["mirrorPrism", "mirrorBlades", "mirrorDecoy"] },
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
const bossHud = {
  panel: document.querySelector("#boss-hud"), name: document.querySelector("#boss-name"),
  action: document.querySelector("#boss-action"), health: document.querySelector("#boss-health"),
  stage: document.querySelector("#boss-stage"), track: document.querySelector("#boss-track"),
  core: document.querySelector("#boss-core-life"), shell: document.querySelector("#boss-shell-life"),
  finale: document.querySelector("#boss-finale-label"),
};

function activeBosses() { return boss ? [boss] : []; }
function bossTypeName(type) { return tr(bossTypes[type].name, bossTypes[type].enName); }
function chooseBossType() {
  const fixed = typeof sortieStats !== "undefined" ? sortieStats?.bossType : null;
  if (fixed != null) return bossDefeated ? null : fixed;
  return bossDefeated < bossTypes.length ? bossDefeated : null;
}

function bossArena(type = boss?.type ?? 0) {
  const final = type === finalAlienType;
  const width = Math.min(player.width * (final ? 1.82 : 1.55 + type * .018), viewport.width * .34);
  const aspect = [.86, .74, .79, .86, .8, .69, .7, .9, .79, .78, .91][type];
  const height = width * aspect;
  const top = Math.min(viewport.height / 2, Math.max(height * .57 + 13, flightBounds.top + height * .1));
  const bottom = Math.max(top, Math.min(viewport.height - height * .57 - 13, flightBounds.bottom - height * .1));
  // The renderer occupies 1.14 x the collision body. Reserve room for its
  // wind-up, rupture bank and breathing, rather than framing only the hitbox.
  return { width, height, x: viewport.width - width * .78 - 24, y: (top + bottom) / 2, top, bottom };
}

function bossEntryPosition(arena, type) {
  const [reach, lift] = bossPresentationProfiles[type].approach;
  // Arrive from the edge with the creature already visible. Distance depends
  // on its visual size, not monitor width, so widescreen entry is not a blank.
  return { x: Math.min(viewport.width - arena.width * .17, arena.x + arena.width * .62 * reach),
    y: clamp(arena.y + arena.height * lift, arena.top, arena.bottom) };
}

function bossPlayerRight() {
  if (!boss) return flightBounds.right;
  const arena = bossArena();
  const edge = arena.x - arena.width * .69 - Math.min(26, arena.width * .14);
  return clamp(edge - player.width * .48 - 12, flightBounds.left, flightBounds.right);
}

function setBossMessage(title, action, visible = true) {
  if (bossHud.panel.hidden === visible) bossHud.panel.hidden = !visible;
  if (bossHud.name.textContent !== title) bossHud.name.textContent = title;
  if (bossHud.action.textContent !== action) bossHud.action.textContent = action;
  const active = String(visible), finale = String(visible && !!boss?.finale);
  const phase = !visible ? "" : !boss ? "warning" : boss.finale ? "finale"
    : boss.phase === "enter" ? "entry" : boss.phase === "rupture" ? "rupture"
    : boss.phase === "recover" && (boss.alienAttack || boss.ruptureWindow) ? "recover" : boss.enraged ? "frenzy" : "hunt";
  if (app.dataset.bossActive !== active) app.dataset.bossActive = active;
  if (app.dataset.bossFinale !== finale) app.dataset.bossFinale = finale;
  if (app.dataset.bossPhase !== phase) app.dataset.bossPhase = phase;
}

function bossHealthStage(target) {
  if (target.finale) return tr("III · 终局形态", "III · Final form");
  if (target.phase === "rupture") return tr("II · 外壳破裂", "II · Shell rupture");
  if (bossCounterActive(target)) return tr("破招成功 · 核心失衡", "Countered · Core destabilized");
  if (!target.enraged) return tr("I · 护壳防御", "I · Armored");
  return target.phase === "recover" && (target.alienAttack || target.ruptureWindow) ? tr("II · 核心外露", "II · Core exposed")
    : tr("II · 狂暴核心", "II · Frenzied core");
}

function bossCounterActive(target) {
  return !!target && !target.finale && (target.counterUntil ?? 0) > target.age;
}

function rewardAlienCounter(target = boss) {
  if (!target || target.finale || target.counterTriggered || !bossCanTakeDamage(target)) return;
  target.counterTriggered = true;
  target.counterUntil = target.age + bossRules.counterWindow;
  target.counterCount = (target.counterCount ?? 0) + 1;
  target.hitFlash = .18;
  setBossMessage(bossStageTitle(target), tr("破招成功 · 抓住金色破绽反击", "Counter successful · Strike the golden breach"));
  pulseCombatLight(target.x, target.y, target.width * .95, "#ffe2a0", "impact");
  gameAudio.bossAttack("hatch", target.x, target.y);
}

function updateBossHealthHud() {
  const { health, stage, track, core: coreLabel, shell: shellLabel, finale: finaleLabel } = bossHud;
  if (!health) return;
  const hidden = !boss;
  if (health.hidden !== hidden) health.hidden = hidden;
  if (stage.hidden !== hidden) stage.hidden = hidden;
  if (!boss) return;
  const life = clamp(boss.hp, 0, 1);
  const lag = clamp(boss.displayHp ?? life, life, 1);
  const phase = bossHealthStage(boss);
  const finale = !!boss.finale;
  const percentOf = ratio => Math.ceil(clamp(ratio, 0, 1) * 100 - 1e-9);
  const core = percentOf(life / bossRules.shellThreshold);
  const shell = percentOf((life - bossRules.shellThreshold) / (1 - bossRules.shellThreshold));
  const percent = percentOf(life);
  const feedback = boss.hitFlash > 0;
  const key = `${phase}/${gameLanguage}/${finale}/${life.toFixed(3)}/${lag.toFixed(3)}/${feedback}`;
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
  coreLabel.textContent = coreText;
  shellLabel.hidden = finale;
  shellLabel.textContent = shellText;
  finaleLabel.textContent = finale ? tr("终局", "FINALE") : tr("◇ 终局待开启", "◇ Finale ahead");
  track.setAttribute("aria-valuenow", String(percent));
  track.setAttribute("aria-valuetext", phase + " · " + coreText + (finale ? "" : " · " + shellText));
}

function clearAlienThreats() {
  bossProjectiles.length = 0;
  bossHazards.length = 0;
  if (boss) { boss.pressureState = null; boss.pressureArmor = false; }
}

function clearBossFinaleAttacks() {
  clearAlienThreats();
  enemyProjectiles.length = 0;
  bullets.length = 0;
  muzzleFlash = 0;
  clearEvolutionWeaponTransients();
  clearFighterCombatTransients();
  if (ultimate.phase !== "idle") cancelUltimate(true);
}

function resetBossEncounter() {
  boss = null;
  nextBossTime = typeof sortieAllowsWaves === "function" && !sortieAllowsWaves() ? sortieBossDelay() : bossRules.firstArrival;
  bossDefeated = typeof sortieStats !== "undefined" ? sortieStats?.rushStart ?? 0 : 0;
  pendingBossType = null;
  prefetchedBossType = null;
  bossHitGrace = 0;
  if (typeof resetFlightRadio === "function") resetFlightRadio();
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
    if (boss.pressureState) {
      boss.pressureState.gapY = resizeY(boss.pressureState.gapY);
      boss.pressureState.gapSize *= scaleY;
    }
    for (const shot of bossProjectiles) {
      shot.x = shot.previousX = shot.x * scaleX;
      shot.y = shot.previousY = resizeY(shot.y);
      shot.vx *= scaleX;
      shot.vy *= scaleY;
      if (shot.wave) shot.wave *= scaleY;
      shot.radius *= widthScale;
    }
    for (const hazard of bossHazards) {
      if (hazard.kind === "ultimate") {
        hazard.lockX *= scaleX;hazard.lockY = resizeY(hazard.lockY);
        hazard.originX *= scaleX;hazard.originY = resizeY(hazard.originY);
        hazard.gapY = resizeY(hazard.gapY);hazard.gapSize *= scaleY;
        for(const node of hazard.nodes) {node.x *= scaleX;node.y=resizeY(node.y);node.radius *= widthScale;}
        continue;
      }
      if (hazard.kind === "pressureSeal") {
        hazard.gapY = resizeY(hazard.gapY); hazard.gapSize *= scaleY;
        continue;
      }
      if (resizeAlienSignatureHazard(hazard, scaleX, scaleY, resizeY)
        || resizeAlienMechanic(hazard, scaleX, scaleY, resizeY)) continue;
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
  // Per-Boss limits preserve attack cycles against sustained, over-cap firepower.
  const refill = bossTypes[type].fireRefill ?? .09 - .03 * escalation;
  return { hit: .05, burst: .06 - .014 * escalation, refill };
}

function spawnBoss(type = chooseBossType()) {
  if (!Number.isInteger(type) || !bossTypes[type]) return;
  if (typeof warmBossVfxMaterial === "function" && type < 10) warmBossVfxMaterial(type);
  const arena = bossArena(type);
  const entry = bossEntryPosition(arena, type);
  const data = bossTypes[type];
  const alienFinal = type === finalAlienType;
  const scaling = bossScaling(type);
  const baseHealth = bossBalanceHealth(type, { scaling,
    difficultyScale: typeof sortieRules === "function" ? sortieRules().bossHealth : 1 });
  const healthLog = Math.log(baseHealth);
  boss = { ...arena, type, alien: true, alienFinal, color: data.color, name: bossTypeName(type),
    hp: 1, maxHp: 1, displayHp: 1, healthLog, baseHealth, scaling, fireProtection: bossFireProtectionFor(type),
    x: entry.x, y: entry.y, previousX: entry.x, previousY: entry.y,
    phase: "enter", phaseTime: 0, age: 0, hitFlash: 0, attackIndex: -1,
    alienAttack: null, attackLabel: null, pressureCycle: 0, enraged: false, lockX: player.x, lockY: player.y, gapY: player.y, gapSize: 0,
    lashPulse: 0, lashSide: 1, lashIndex: 0 };
  if (typeof sortieBossEntered === "function") sortieBossEntered(boss);
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
  const maxX = viewport.width - target.width * .67 - 20;
  target.x += (Math.min(maxX, arena.x + swayX * quiet) - target.x) * follow;
  target.y += (clamp(arena.y + swayY * quiet, arena.top, arena.bottom) - target.y) * follow;
}

function updateBossEncounter(seconds) {
  if (advanceLivingBossPresentation(seconds) || !isBattleActive()) return;
  bossHitGrace = Math.max(0, bossHitGrace - seconds);
  updateBossProjectiles(seconds);
  if (!boss) {
    const upcoming = chooseBossType();
    // Start streaming the upcoming body before the five-second encounter warning.
    if (battleTime >= nextBossTime - bossRules.artLead && prefetchedBossType !== upcoming) {
      prefetchedBossType = upcoming;
      if (prefetchedBossType !== null && typeof preloadStarBreakerModel === "function") {
        preloadStarBreakerModel(prefetchedBossType);
      }
      if (prefetchedBossType !== null && typeof preloadAlienBossArt === "function") preloadAlienBossArt(prefetchedBossType);
      if (prefetchedBossType !== null) gameAudio.preloadBossScore?.(prefetchedBossType);
      if (prefetchedBossType === 0 && typeof preloadHadalSurface === "function") preloadHadalSurface();
    }
    if (battleTime < nextBossTime - bossRules.warning) return;
    if (pendingBossType === null) {
      pendingBossType = upcoming;
      if (pendingBossType === null) return;
      if (typeof preloadAlienBossArt === "function") preloadAlienBossArt(pendingBossType);
      if (typeof warmBossVfxMaterial === "function" && pendingBossType < 10) warmBossVfxMaterial(pendingBossType);
      preloadBossFinaleArt(pendingBossType);
      enemies.length = 0;
      resetEnemyCombat(false);
      gameAudio.warning();
    }
    const name = bossTypeName(pendingBossType);
    setBossWarning(name);
    const remaining = nextBossTime - battleTime;
    if (remaining > 0 && remaining <= 3 && typeof beginFlightRadio === "function") {
      beginFlightRadio("incoming", pendingBossType, remaining);
    }
    const eta = Math.max(0, Math.ceil(nextBossTime - battleTime));
    setBossMessage(bossStageTitle({ type: pendingBossType, name }),
      tr("异形接近 · " + eta + " 秒后抵达", "Alien incoming · ETA " + eta + " s"));
    if (battleTime >= nextBossTime) spawnBoss(pendingBossType);
    return;
  }
  boss.age += seconds;
  if (boss.counterUntil && boss.age >= boss.counterUntil) {
    boss.counterUntil = 0;
    if (boss.attackLabel && (boss.phase === "attack" || boss.phase === "telegraph")) {
      setBossMessage(bossStageTitle(boss), tr(boss.attackLabel[2], boss.attackLabel[3]));
    }
  }
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
  if (typeof updateBossPressure === "function") updateBossPressure(boss, seconds);
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
  return target.phase === "rupture";
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
    : progressionHitFraction(target, damageLog, shot.armorPiercing ? fighterHitProtection(target, shot) : target.fireProtection);
  // The attacking shell absorbs part of the incoming damage, but no attack is invulnerable.
  const ruptureWindow = target.phase === "recover" && target.ruptureWindow;
  const countered = bossCounterActive(target);
  const exposed = countered || target.phase === "recover" && (target.alienAttack || ruptureWindow);
  const attackingShell = countered ? 1.42 : ruptureWindow ? 1.32 : exposed ? 1.18 : target.phase !== "attack" ? 1
    : target.alienAttack === "pressure" ? .71 : target.alienFinal && target.enraged ? .62 : .78;
  const specialMultiplier = special && target.alienFinal ? bossRules.fusionSpecialMultiplier : 1;
  const pressureMultiplier = target.pressureArmor ? .15 : 1;
  const fraction = rawFraction * attackingShell * specialMultiplier * finaleMultiplier * pressureMultiplier;
  if (fraction <= 0) return;
  target.hp = Math.max(bossHealthFloor(target), target.hp - fraction);
  target.hitFlash = .08;
  recordCombatImpact(target, shot, true, exposed && !target.finale ? "weak" : undefined);
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

function bossHealthFloor(target) {
  // Only the visible shell transition stops a single hit crossing two phases.
  // Do not discard landed damage to satisfy an invisible survival timer.
  return !target.finale && !target.enraged ? bossRules.shellThreshold : 0;
}

function defeatBoss(target = boss) {
  if (!target || target !== boss) return;
  const fallen = target;
  if (typeof sortieBossCleared === "function") sortieBossCleared(fallen);
  const motion = fallen.finale ? captureBossPresentationMotion() : null;
  boss = null;
  bossDefeated = Math.max(bossDefeated, fallen.type + 1);
  const points = fallen.alienFinal ? 6000 : 2000;
  score += points;
  kills++;
  registerMomentumKill();
  if (!fallen.finale) createExplosion(fallen, points);
  const recovered = player.lives;
  const mode = typeof sortieMode === "function" ? sortieMode() : "campaign";
  if (!fallen.alienFinal && (mode === "campaign" || mode === "rush")) {
    raiseWeaponFloor(progressionPresetForBoss(bossDefeated));
  }
  if (!fallen.alienFinal && (mode === "campaign" || mode === "rush") && bossDefeated % 3 === 0) grantPlayerLife();
  clearAlienThreats();
  enemies.length = 0;
  resetEnemyCombat(false);
  bossHitGrace = 1.5;
  setBossWarning();
  if (!fallen.alienFinal && mode === "campaign") {
    for (const [index, type] of ["blue", "yellow", "red"].entries()) {
      powerups.push({ x: fallen.x, previousX: fallen.x, y: clamp(fallen.y + (index - 1) * 75, flightBounds.top, flightBounds.bottom),
        radius: powerupRules.radius, type });
    }
  }
  const healed = player.lives > recovered;
  const reward = tr(fallen.name + "已击破 · +" + points + "分" + (healed ? " · 恢复1点生命" : ""),
    fallen.name + " defeated · +" + points + " points" + (healed ? " · +1 life" : ""));
  powerupNotice.hidden = true;
  const endsRun = fallen.alienFinal || mode === "practice" || mode === "daily";
  const nextDelay = mode === "rush" ? sortieBossDelay() : Math.max(18, bossRules.interval - (bossDefeated - 1) * 1.5);
  nextBossTime = endsRun ? Infinity : battleTime + nextDelay;
  enemyCooldown = 2;
  setBossMessage("", "", false);
  startBossDeathPresentation(fallen, reward, motion);
  if (typeof beginFlightRadio === "function") beginFlightRadio("cleared", fallen.type, 2.75);
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
  const seal = bossHazards.find(area => area.kind === "pressureSeal" && !area.pressureLogged && alienHazardHitsPlayer(area));
  if (seal && boss) {
    seal.pressureLogged = true;
    logBossPressure(boss, shieldIsActive() ? "guard" : bossHitGrace > 0 ? "grace" : "hit", { x: player.x, y: player.y, fullSeal: seal.fullSeal });
  }
  const finale = boss?.finale && bossFinaleHitsPlayer(boss) ? boss : null;
  if (contact || hazard || finale) {
    // Lingering areas can hit once each. Repeated, newly telegraphed attacks
    // still damage the player even when they originate from the same move.
    const damaged = damagePlayer(alienDamageExplanation(contact || hazard || {}, finale), contact || hazard || finale);
    if (damaged && hazard && !contact) hazard.hitPlayer = true;
  }
}

function drawBossBattle() {
  updateBossHealthHud();
  const quiet = reducedMotion.matches || (typeof visualQuality !== "undefined" && visualQuality.id === "low");
  const scene = activeBossPresentation();
  if (scene && scene.kind !== "death") drawBossPresentationBody(context, scene, quiet);
  else if (boss?.finale) drawBossFinale(context, boss, quiet);
  else if (boss) drawBossShip(context, boss, quiet);
  if (bossCounterActive(boss)) drawBossCounterCue(context, boss);
  if (typeof drawSceneryOcclusion === "function") drawSceneryOcclusion(context, boss ?? scene?.target);
  if (typeof drawBossPressureArt === "function") drawBossPressureArt("front");
  for (const hazard of bossHazards) {
    drawAlienHazard(context, hazard, quiet);
    if (typeof drawFlightDangerPattern === "function") drawFlightDangerPattern(context, hazard);
  }
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

function drawBossCounterCue(ctx, target) {
  const left = target.x - target.width * .48, right = target.x + target.width * .32;
  const top = target.y - target.height * .31, bottom = target.y + target.height * .31;
  const remaining = clamp((target.counterUntil - target.age) / bossRules.counterWindow, 0, 1);
  ctx.save();
  ctx.strokeStyle = "#ffe2a0"; ctx.fillStyle = "#ffe2a0"; ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [x, dx] of [[left, 1], [right, -1]]) for (const [y, dy] of [[top, 1], [bottom, -1]]) {
    ctx.moveTo(x, y + dy * 10); ctx.lineTo(x, y); ctx.lineTo(x + dx * 10, y);
  }
  ctx.stroke();
  const width = Math.min(92, target.width * .43);
  ctx.fillRect(target.x - width / 2, bottom + 9, width * remaining, 2);
  ctx.font = "600 11px system-ui"; ctx.textAlign = "center";
  ctx.fillText(tr("破绽", "BREACH"), target.x, bottom + 25);
  ctx.restore();
}
