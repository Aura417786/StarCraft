"use strict";

// Session-only battle history. It contains combat data, never the persistent
// profile, DOM, renderer, audio graph, or this history itself.
const battleRewindRules = Object.freeze({ sampleStep: .1, denseSeconds: 10,
  maxSamples: 240, maxBytes: 24 * 1024 * 1024 });
const battleRewind = { history: [], bytes: 0, accumulator: 0, cooldown: 0,
  availableSeconds: 0, lastRewound: 0, segment: "", reason: "", error: "",
  samplesTaken: 0, maxCaptureMs: 0 };

function resetBattleRewind(reason = "segment", resetCooldown = false) {
  battleRewind.history.length = 0;
  battleRewind.bytes = 0;
  battleRewind.accumulator = 0;
  battleRewind.availableSeconds = 0;
  battleRewind.segment = "";
  battleRewind.reason = reason;
  if (resetCooldown) { battleRewind.cooldown = 0; battleRewind.lastRewound = 0; }
}

function battleRewindSegment() {
  return [boss?.type ?? "waves", boss?.enraged ? "ruptured" : "shell", boss?.finale?.mode ?? "body",
    bossDefeated, evolution.route, evolution.level, viewport.width, viewport.height].join("/");
}

function battleRewindState() {
  const { random, result, ...run } = sortieStats;
  return {
    player, weapon, shield, ultimate, cannonLink, momentum, firingStyle, fighterCombat, evolutionWeapons,
    enemies, bullets, powerups, enemyProjectiles, bossProjectiles, bossHazards, boss,
    eliteDirector, formationState, aceEncounter, gravityTide, battlefieldEvents, battlefieldState, journeyState,
    // Metadata is always detached from live account and run records; only
    // battlefield entities need identity retention for pending attack closures.
    introduced: enemyIntroduced, run: structuredClone(run), randomState: random.getState(),
    scalars: { battleTime, score, kills, shotCooldown, muzzleFlash, enemyCooldown, enemySpawnCount,
      powerupCooldown, powerupSpawnCount, nextBossTime, bossDefeated, pendingBossType, prefetchedBossType,
      bossHitGrace, lastDamageMessage, upgradeNoticeTime },
    evolutionTransient: { frozenRemaining: evolution.frozenRemaining, skillFlash: evolution.skillFlash }
  };
}

// A graph copy with an identity table, rather than JSON/structuredClone. Boss
// event closures refer to their original Boss: restore that entity in place so
// delayed attacks still address the actual opponent. Weak hit/mark registries
// are rebuilt against the same live entities, preventing repeated penetration.
function captureBattleRewindGraph(root) {
  const nodes = [], originals = [], ids = new Map();
  let bytes = 0;
  const encode = value => {
    if (value === null || typeof value !== "object") {
      // Conservative retained-size accounting includes JS wrapper/entry
      // overhead, not just numeric payloads. It remains an estimate of heap.
      bytes += typeof value === "string" ? 48 + value.length * 2 : typeof value === "function" ? 128 : 40;
      return { value };
    }
    if (ids.has(value)) { bytes += 32; return { ref: ids.get(value) }; }
    const id = nodes.length;
    ids.set(value, id); originals.push(value);
    const node = { kind: "", entries: [] };
    nodes.push(node); bytes += 160;
    if (value instanceof WeakMap) node.kind = "weakmap";
    else if (value instanceof WeakSet) node.kind = "weakset";
    else if (value instanceof Map) {
      node.kind = "map";
      for (const [key, item] of value) node.entries.push([encode(key), encode(item)]);
    } else if (value instanceof Set) {
      node.kind = "set";
      for (const item of value) node.entries.push(encode(item));
    } else if (value instanceof Date) { node.kind = "date"; node.time = value.getTime(); }
    else if (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
      node.kind = Array.isArray(value) ? "array" : "object";
      node.frozen = Object.isFrozen(value);
      for (const [key, item] of Object.entries(value)) {
        bytes += 80 + key.length * 2;
        node.entries.push([key, encode(item)]);
      }
    } else throw new TypeError("Rewind cannot capture non-combat object: " + value.constructor?.name);
    return { ref: id };
  };
  const rootValue = encode(root);
  // Object identities absent from this reachable graph have no live hitbox and
  // do not need to remain in WeakSets. WeakMap values can extend the graph.
  for (let id = 0; id < nodes.length; id++) {
    const node = nodes[id], original = originals[id];
    if (node.kind !== "weakmap" && node.kind !== "weakset") continue;
    for (let keyId = 0; keyId < originals.length; keyId++) {
      const key = originals[keyId];
      if (!original.has(key)) continue;
      bytes += 80;
      node.entries.push(node.kind === "weakmap" ? [{ ref: keyId }, encode(original.get(key))] : { ref: keyId });
    }
  }
  return { nodes, originals, root: rootValue, bytes };
}

function restoreBattleRewindGraph(snapshot) {
  const { nodes, originals } = snapshot;
  const targets = nodes.map((node, index) => node.kind === "weakmap" ? new WeakMap()
    : node.kind === "weakset" ? new WeakSet() : originals[index]);
  const decode = item => Object.hasOwn(item, "ref") ? targets[item.ref] : item.value;
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index], target = targets[index];
    if (node.frozen) continue;
    if (node.kind === "object" || node.kind === "array") {
      if (node.kind === "array") target.length = 0;
      else for (const key of Object.keys(target)) delete target[key];
      for (const [key, value] of node.entries) target[key] = decode(value);
    } else if (node.kind === "map" || node.kind === "weakmap") {
      target.clear?.();
      for (const [key, value] of node.entries) target.set(decode(key), decode(value));
    } else if (node.kind === "set" || node.kind === "weakset") {
      target.clear?.();
      for (const value of node.entries) target.add(decode(value));
    } else if (node.kind === "date") target.setTime(node.time);
  }
  return decode(snapshot.root);
}

function trimBattleRewindHistory(now) {
  const history = battleRewind.history;
  const remove = index => { battleRewind.bytes -= history[index].graph.bytes; history.splice(index, 1); };
  while (history.length > battleRewindRules.maxSamples || battleRewind.bytes > battleRewindRules.maxBytes) {
    if (history.length <= 2) {
      // A single exceptional state must not evade the memory limit.
      remove(history.length - 1);
      if (!history.length) break;
      continue;
    }
    let best = -1, density = Infinity;
    // Keep the oldest endpoint. Thin old history by removing the most redundant
    // interior sample; recent history is thinned only under memory pressure.
    for (const olderOnly of [true, false]) {
      for (let index = 1; index < history.length - 1; index++) {
        if (olderOnly && now - history[index].time <= battleRewindRules.denseSeconds) continue;
        const spacing = history[index + 1].time - history[index - 1].time;
        if (spacing < density) { best = index; density = spacing; }
      }
      if (best >= 0) break;
    }
    remove(best);
  }
  battleRewind.bytes = Math.max(0, battleRewind.bytes);
  battleRewind.availableSeconds = history.length ? Math.max(0, now - history[0].time) : 0;
}

function stepBattleRewind(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0 || !isBattleActive()) return;
  battleRewind.cooldown = Math.max(0, battleRewind.cooldown - seconds);
  if (evolution.route !== "rewind" || !(evolution.level > 0) || !sortieStats) return;
  const segment = battleRewindSegment();
  if (battleRewind.segment && battleRewind.segment !== segment) resetBattleRewind("phase-or-layout");
  battleRewind.segment = segment;
  battleRewind.accumulator += seconds;
  if (battleRewind.history.length && battleRewind.accumulator + 1e-9 < battleRewindRules.sampleStep) {
    battleRewind.availableSeconds = Math.max(0, battleTime - battleRewind.history[0].time);
    return;
  }
  battleRewind.accumulator %= battleRewindRules.sampleStep;
  const started = performance.now();
  try {
    const graph = captureBattleRewindGraph(battleRewindState());
    battleRewind.history.push({ time: battleTime, graph });
    battleRewind.bytes += graph.bytes;
    battleRewind.samplesTaken++;
    battleRewind.error = "";
    trimBattleRewindHistory(battleTime);
  } catch (error) {
    // Unsupported future combat types fail closed without breaking gameplay.
    resetBattleRewind("capture-failed");
    battleRewind.error = error.message;
  }
  battleRewind.maxCaptureMs = Math.max(battleRewind.maxCaptureMs, performance.now() - started);
}

function requestBattleRewind(secondsAgo, cooldownSeconds = 18) {
  if (!isBattleActive() || evolution.route !== "rewind" || !(evolution.level > 0)
    || !Number.isFinite(secondsAgo) || secondsAgo <= 0 || battleRewind.cooldown > 1e-8
    || !battleRewind.history.length || battleRewind.segment !== battleRewindSegment()) return false;
  const beforeTime = battleTime, desiredTime = beforeTime - secondsAgo;
  let chosen = battleRewind.history[0];
  for (const snapshot of battleRewind.history) {
    if (snapshot.time > desiredTime + 1e-8) break;
    chosen = snapshot;
  }
  if (beforeTime - chosen.time < .05) return false;
  const hits = sortieStats.hitsTaken, assists = { ...sortieStats.assists };
  const bossRecords = sortieStats.bossRecords, unlocks = sortieStats.unlocks;
  const retryMeta = { retried: sortieStats.retried, retryCount: sortieStats.retryCount };
  gameAudio.stopUltimate();
  resetCombatEffects();
  if (typeof clearBossPressureArt === "function") clearBossPressureArt();
  clearMovement();
  const saved = restoreBattleRewindGraph(chosen.graph);
  ({ battleTime, score, kills, shotCooldown, muzzleFlash, enemyCooldown, enemySpawnCount,
    powerupCooldown, powerupSpawnCount, nextBossTime, bossDefeated, pendingBossType, prefetchedBossType,
    bossHitGrace, lastDamageMessage, upgradeNoticeTime } = saved.scalars);
  boss = saved.boss;
  sortieStats = { ...saved.run, ...retryMeta, random: sortieGenerator(saved.run.seed, saved.randomState), result: null,
    hitsTaken: Math.max(hits, saved.run.hitsTaken), assisted: true,
    assists: { ...saved.run.assists, ...assists, timeRewind: true }, bossRecords, unlocks };
  // Route, rank and all skill cooldowns are outside the snapshot. Active freeze
  // is a battlefield effect, so its remaining duration follows the battlefield.
  evolution.frozenRemaining = saved.evolutionTransient.frozenRemaining ?? 0;
  evolution.skillFlash = saved.evolutionTransient.skillFlash ?? 0;
  // Physical keys were released; never continue a held charge after rewinding.
  fighterCombat.redHeld = false;
  evolutionWeapons.lanceCharging = false;
  ultimate.audioActive = false;
  explosions.length = 0;
  evolution.pulses.length = 0;
  powerupNotice.hidden = true;
  upgradeNoticeTime = 0;
  previousTime = 0; combatStepRemainder = 0; lastDifficultySecond = -1;
  battleRewind.cooldown = Number.isFinite(cooldownSeconds) ? Math.max(0, cooldownSeconds) : 18;
  battleRewind.lastRewound = Math.max(0, beforeTime - chosen.time);
  battleRewind.accumulator = 0;
  const keep = battleRewind.history.indexOf(chosen) + 1;
  battleRewind.history.splice(keep);
  battleRewind.bytes = battleRewind.history.reduce((sum, entry) => sum + entry.graph.bytes, 0);
  battleRewind.availableSeconds = battleTime - battleRewind.history[0].time;
  scoreDisplay.textContent = String(score).padStart(6, "0");
  updateDifficultyDisplay(); updateWeaponDisplay(); updateLifeDisplay(); updateFiringStyleDisplay();
  updateShieldDisplay(); updateUltimateDisplay(); updateMomentumDisplay(); updateEvolutionDisplay();
  updateFighterSystemsHud(); updateBossHealthHud(); refreshSortieHud();
  if (boss) setBossMessage(bossStageTitle(boss), boss.attackLabel ? tr(...boss.attackLabel.slice(2))
    : boss.finale ? bossFinaleHint(boss.type) : tr("时隙回溯 · 战场已恢复", "Temporal rewind · Battlefield restored"));
  canvas.focus({ preventScroll: true });
  updatePauseHint();
  statusMessage.textContent = tr(`战场已回溯 ${battleRewind.lastRewound.toFixed(1)} 秒。生命、敌军和弹幕一起恢复；技能冷却继续。`,
    `Battlefield rewound ${battleRewind.lastRewound.toFixed(1)} seconds. Lives, enemies and attacks restored; skill cooldown continues.`);
  return true;
}
