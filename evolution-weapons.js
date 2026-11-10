"use strict";

// Combat-time resources freeze with the sortie. Cosmetic drones have no hitbox.
const evolutionWeaponRules = { maxAuxiliary: 64, lanceCharge: .7, lanceCooldown: 5.8, shiftTap: .22,
  droneInterval: [0, .85, .86, .86], droneDamage: [0, .16, .13, .13],
  absorbLimit: [0, 0, 4, 6], counterDamage: [0, 0, .16, .20], interceptCooldown: 17 };
const evolutionWeapons = { clock: 0, lanceCooldown: 0, lanceCharge: 0, lanceCharging: false,
  splitCooldown: 0, droneCooldown: .15, droneFlash: 0, drones: [], focus: null,
  interceptCooldown: 0, grounded: 0, absorbed: [], armorRoundRemaining: 0 };

function evolutionBaseDpsLog() {
  return weaponDamageLog() + Math.log((1 + .16 * (weapon.lanes - 1)) / weapon.interval);
}
function fighterHitProtection(target, shot) {
  const protection = target.fireProtection;
  if (!protection || !shot.armorPiercing) return protection;
  return { hit: protection.hit * 1.75, burst: protection.burst * 1.2, refill: protection.refill * 1.25 };
}
function getEvolutionWingMuzzles(ship = player) {
  return [-1, 1].map(side => ({ x: ship.x + ship.width * .20,
    y: ship.y + side * ship.height * .30, side }));
}
function getEvolutionDronePositions(ship = player, level = evolution.blast) {
  if (!(level > 0)) return [];
  const count = level === 1 ? 1 : 2, width = ship.width * .30, height = ship.height * .30;
  return Array.from({ length: count }, (_, slot) => {
    let x = ship.x - ship.width * .32, y = ship.y + (slot === 0 ? -1 : 1) * ship.height * .78;
    if (ship === player) {
      x = clamp(x, width * .55 + 6, Math.max(width * .55 + 6, viewport.width - width * .55 - 6));
      y = clamp(y, height * .6 + 10, Math.max(height * .6 + 10, viewport.height - height * .6 - 10));
    }
    return { x, y, width, height, slot, muzzleX: x + width * .465, muzzleY: y };
  });
}
function resetEvolutionWeapons() {
  Object.assign(evolutionWeapons, { clock: 0, lanceCooldown: 0, lanceCharge: 0, lanceCharging: false,
    splitCooldown: 0, droneCooldown: .15, droneFlash: 0, focus: null,
    interceptCooldown: 0, grounded: 0, armorRoundRemaining: 0 });
  evolutionWeapons.drones.length = 0;
  evolutionWeapons.absorbed.length = 0;
}
function clearEvolutionWeaponTransients() {
  beginEvolutionShieldCapture();
  cancelEvolutionLance();
  evolutionWeapons.focus = null;
  evolutionWeapons.armorRoundRemaining = 0;
  evolutionWeapons.droneFlash = 0;
}
function onEvolutionUpgrade(kind) {
  if (kind === "blast") evolutionWeapons.droneCooldown = Math.min(evolutionWeapons.droneCooldown, .15);
  evolutionWeapons.drones = getEvolutionDronePositions();
}
function resizeEvolutionWeapons(scaleX = 1, _scaleY = 1, resizeY = y => y) {
  // Positions are derived from the resized player, not an independently advanced
  // formation. Resizing cannot release stored projectiles or refresh a cadence.
  evolutionWeapons.drones = getEvolutionDronePositions();
  if (fighterCombat.field) {
    fighterCombat.field.x *= scaleX;
    fighterCombat.field.y = resizeY(fighterCombat.field.y);
  }
  fighterCombat.arcs.length = 0;
}
function evolutionVisibleTargets(origin) {
  return [...enemies.filter(target => target.hp > 0 && target.x - target.width * .5 < viewport.width
    && target.x + target.width * .5 > 0), ...activeBosses().filter(bossCanTakeDamage)]
    .filter(target => target.x > origin.x + 8 && target.x < viewport.width + target.width * .5);
}
function evolutionAim(origin, slot = 0) {
  const targets = evolutionVisibleTargets(origin);
  const focus = evolutionWeapons.focus;
  if (focus && targets.includes(focus)) return targetAim(focus, origin, .82);
  targets.sort((a, b) => (a.x - origin.x + Math.abs(a.y - origin.y) * .8)
    - (b.x - origin.x + Math.abs(b.y - origin.y) * .8));
  const target = targets[Math.min(slot, targets.length - 1)];
  return target ? targetAim(target, origin, .65) : 0;
}
function targetAim(target, origin, limit) {
  return clamp(Math.atan2(target.y - origin.y, target.x - origin.x), -limit, limit);
}
function spawnEvolutionRound(origin, visual, damageSeconds, options = {}) {
  if (!isBattleActive() || bullets.reduce((count, shot) => count + Number(!!shot.auxiliary), 0) >= evolutionWeaponRules.maxAuxiliary) return false;
  const angle = options.angle ?? 0, speed = visual === "lance" ? 1080 : 850;
  const colors = visual === "drone" ? ["#9ce9e2", "#edfffa"] : visual === "counter" ? ["#ffc987", "#fff1d5"] : ["#9edfff", "#f1fcff"];
  const damageLog = Math.min(Math.log(850), evolutionBaseDpsLog() + Math.log(Math.max(.001, damageSeconds)));
  bullets.push({ x: origin.x, y: origin.y, previousX: origin.x, previousY: origin.y,
    angle, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    halfHeight: visual === "lance" ? 6 : visual === "counter" ? 3 : 2,
    length: visual === "lance" ? 62 : visual === "counter" ? 32 : 19,
    damage: Math.exp(damageLog), damageLog, color: colors[0], core: colors[1],
    source: "evolution-" + visual, visual, auxiliary: true, noEnergy: !!options.noEnergy,
    armorPiercing: visual === "lance", piercesShield: visual === "lance", critical: visual === "lance", piercesLeft: options.pierces ?? 0, hitTargets: new Set(), overdrive: false });
  return true;
}
function beginEvolutionLance() {
  if (evolution.pierce < 3 || fighterCombat.redHeld) return false;
  evolutionWeapons.lanceCharging = true;
  evolutionWeapons.lanceCharge = 0;
  return true;
}
function cancelEvolutionLance() {
  evolutionWeapons.lanceCharging = false;
  evolutionWeapons.lanceCharge = 0;
}
function evolutionLanceActive() {
  return evolutionWeapons.lanceCharging && evolutionWeapons.lanceCharge >= evolutionWeaponRules.shiftTap
    && evolutionWeapons.lanceCooldown <= 0 && !ultimateSuppressesFire();
}
function releaseEvolutionLance() {
  const held = evolutionWeapons.lanceCharge;
  const active = evolutionLanceActive();
  const charging = evolutionWeapons.lanceCharging;
  cancelEvolutionLance();
  if (!charging || !isBattleActive()) return false;
  if (held < evolutionWeaponRules.shiftTap) return toggleFiringStyle();
  if (!active) return false;
  const muzzle = muzzlePosition();
  const fraction = clamp(held / evolutionWeaponRules.lanceCharge, .3, 1);
  if (!spawnEvolutionRound(muzzle, "lance", .9 + 1.65 * fraction, { pierces: 5 })) return false;
  evolutionWeapons.lanceCooldown = evolutionWeaponRules.lanceCooldown;
  addEvolutionPulse(muzzle.x, muzzle.y, 58, "#9edfff", .23);
  gameAudio.bossAttack?.("cannon", muzzle.x, muzzle.y, false);
  addCombatShake(2);
  return true;
}
function splitEvolutionImpact(shot, target) {
  if (!shot.armorPiercing || shot.auxiliary || evolution.pierce < 2 || evolutionWeapons.splitCooldown > 0) return;
  const origin = { x: target.x, y: target.y };
  const targets = evolutionVisibleTargets({ x: target.x - 20, y: target.y })
    .filter(other => other !== target && Math.hypot(other.x - origin.x, other.y - origin.y) <= 250)
    .sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y));
  if (!targets.length) return;
  for (const other of targets.slice(0, 2)) {
    const angle = targetAim(other, origin, 1.44);
    if (spawnEvolutionRound(origin, "wing", .17, { angle, noEnergy: true })) bullets.at(-1).hitTargets.add(target);
  }
  evolutionWeapons.splitCooldown = .65;
  addEvolutionPulse(origin.x, origin.y, 22, "#9edfff", .2);
}
function fireEvolutionDrones() {
  const level = evolution.blast;
  if (evolutionWeapons.grounded > 0) return;
  let fired = false;
  evolutionWeapons.drones.forEach((drone, index) => {
    const muzzle = { x: drone.muzzleX, y: drone.muzzleY };
    fired = spawnEvolutionRound(muzzle, "drone", evolutionWeaponRules.droneDamage[level], {
      angle: evolutionAim(muzzle, index),
    }) || fired;
  });
  if (fired) { evolutionWeapons.droneFlash = .12; gameAudio.shoot?.(false); }
}
function evolutionTryIntercept() {
  if (!isBattleActive() || evolution.blast < 2 || evolutionWeapons.grounded > 0) return false;
  const focus = evolutionWeapons.focus;
  if (focus && !evolutionVisibleTargets(muzzlePosition()).includes(focus)) evolutionWeapons.focus = null;
  if (!evolutionWeapons.focus) {
    const targets = evolutionVisibleTargets(muzzlePosition()).filter(target => Math.abs(target.y - player.y) <= 180);
    targets.sort((a, b) => Math.abs(a.y - player.y) - Math.abs(b.y - player.y) || a.x - b.x);
    evolutionWeapons.focus = targets[0] ?? null;
    if (!evolutionWeapons.focus) return false;
    addEvolutionPulse(evolutionWeapons.focus.x, evolutionWeapons.focus.y, 44, "#9ce9e2", .31);
    gameAudio.shoot?.(false);
    statusMessage.textContent = tr("星隼 · 已锁定目标", "Falcon · Target locked");
    return true;
  }
  if (evolution.blast < 3 || evolutionWeapons.interceptCooldown > 0) {
    evolutionWeapons.focus = null;
    return true;
  }
  // Commit the escorts to one physical volley. Stay in position long enough to
  // place the wingmen in its path; unrelated shots and persistent terrain remain.
  const candidates = [];
  for (const shots of [enemyProjectiles, bossProjectiles]) {
    for (const shot of shots) {
      const dx = shot.x - player.x, dy = shot.y - player.y;
      if (dx >= -38 && dx < 390 && Math.abs(dy) < 140 && dx * shot.vx + dy * shot.vy < 0) {
        candidates.push({ shot, shots, distance: Math.hypot(dx, dy) });
      }
    }
  }
  if (!candidates.length) {
    evolutionWeapons.focus = null;
    return true;
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const leader = candidates[0].shot;
  const packet = candidates.filter(({ shot }) => shot.owner === leader.owner
    && Math.abs((shot.age ?? 0) - (leader.age ?? 0)) <= .24).slice(0, 18);
  for (const { shot, shots } of packet) {
    shots.splice(shots.indexOf(shot), 1);
    addEvolutionPulse(shot.x, shot.y, 32, "#9ce9e2", .29);
  }
  if (evolution.links.phalanx) gainShieldEnergy(evolutionShieldChargeTime() * .32);
  evolutionWeapons.interceptCooldown = evolutionWeaponRules.interceptCooldown;
  evolutionWeapons.grounded = 4;
  evolutionWeapons.focus = null;
  gameAudio.perfectShield?.();
  statusMessage.textContent = evolution.links.phalanx
    ? tr("星隼拦截 · 护盾充能 +32% · 僚机重整 4 秒", "Falcon intercept · +32% shield energy · Recovering for 4s")
    : tr("星隼拦截 · 僚机重整 4 秒", "Falcon intercept · Recovering for 4s");
  return true;
}
function beginEvolutionShieldCapture() {
  evolutionWeapons.absorbed.length = 0;
}
function captureEvolutionProjectile(shot) {
  const limit = evolutionWeaponRules.absorbLimit[evolution.aegis];
  if (!limit || !shot || typeof shot !== "object" || !isBattleActive() || !shieldIsActive()
    || evolutionWeapons.absorbed.length >= limit || evolutionWeapons.absorbed.includes(shot)) return false;
  evolutionWeapons.absorbed.push(shot);
  updateShieldDisplay();
  return true;
}
function finishEvolutionShieldCapture() {
  const stored = evolutionWeapons.absorbed.length;
  beginEvolutionShieldCapture();
  if (!stored || !isBattleActive()) return 0;
  let fired = 0;
  const origin = muzzlePosition(), aim = evolutionAim(origin);
  for (let index = 0; index < stored; index++) {
    const angle = aim + (index - (stored - 1) / 2) * .038;
    if (spawnEvolutionRound({ x: origin.x + 4, y: origin.y }, "counter",
      evolutionWeaponRules.counterDamage[evolution.aegis], { angle, noEnergy: true,
        pierces: 0 })) fired++;
  }
  if (fired) gameAudio.shoot?.(true);
  return fired;
}
function updateEvolutionWeapons(seconds) {
  if (state !== "battle" || evolution.pending || isBossDeathPlaying()) { clearEvolutionWeaponTransients(); return; }
  if (!isBattleActive() || !Number.isFinite(seconds) || seconds <= 0) return;
  const dt = Math.min(seconds, .1);
  evolutionWeapons.clock += dt;
  for (const key of ["droneFlash", "armorRoundRemaining", "lanceCooldown", "splitCooldown", "interceptCooldown", "grounded"])
    evolutionWeapons[key] = Math.max(0, evolutionWeapons[key] - dt);
  if (evolutionWeapons.lanceCharging) evolutionWeapons.lanceCharge = Math.min(2, evolutionWeapons.lanceCharge + dt);
  if (evolutionWeapons.focus && !evolutionVisibleTargets(muzzlePosition()).includes(evolutionWeapons.focus)) evolutionWeapons.focus = null;
  evolutionWeapons.drones = getEvolutionDronePositions();
  if (evolution.blast) {
    evolutionWeapons.droneCooldown = Math.max(0, evolutionWeapons.droneCooldown - dt);
    if (evolutionWeapons.droneCooldown <= 1e-9) {
      fireEvolutionDrones();
      evolutionWeapons.droneCooldown = evolutionWeaponRules.droneInterval[evolution.blast];
    }
  }
}
function drawEvolutionWeapons(ctx = context) {
  if (state !== "battle") return;
  const quiet = reducedMotion.matches, time = evolutionWeapons.clock;
  if (evolutionWeapons.grounded <= 0) for (const drone of getEvolutionDronePositions()) {
    if (typeof drawEvolutionDroneBody === "function") drawEvolutionDroneBody(ctx, drone, evolution.blast, quiet, time);
    else if (typeof drawShipPBR === "function") drawShipPBR(ctx, drone, "crimson", null, quiet, time);
    if (evolutionWeapons.droneFlash > 0) {
      ctx.save(); ctx.fillStyle = "#d9fff5"; ctx.globalAlpha = Math.min(1, evolutionWeapons.droneFlash / .12);
      ctx.beginPath(); ctx.ellipse(drone.muzzleX + 3, drone.muzzleY, 5, 2.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  const focus = evolutionWeapons.focus;
  if (focus) {
    ctx.save(); ctx.strokeStyle = "#9ce9e2"; ctx.globalAlpha = .7;
    ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.arc(focus.x, focus.y, focus.height * .51 + 6, 0, 2 * Math.PI); ctx.stroke();
    ctx.restore();
  }
  if (evolutionWeapons.lanceCharging && evolutionWeapons.lanceCooldown <= 0) {
    const muzzle = muzzlePosition(), progress = clamp(evolutionWeapons.lanceCharge / evolutionWeaponRules.lanceCharge, .03, 1);
    ctx.save(); ctx.strokeStyle = "#a5eaff"; ctx.lineWidth = 1; ctx.globalAlpha = .4;
    ctx.beginPath(); ctx.arc(muzzle.x, muzzle.y, 8 + progress * 14, 0, 2 * Math.PI); ctx.stroke();
    ctx.lineWidth = 2; ctx.globalAlpha = .5 + progress * .5;
    ctx.beginPath(); ctx.arc(muzzle.x, muzzle.y, 8 + progress * 14, -.5 * Math.PI, (2 * progress - .5) * Math.PI); ctx.stroke();
    ctx.restore();
  }
  if (shieldIsActive()) for (let index = 0; index < evolutionWeapons.absorbed.length; index++) {
    const amount = evolutionWeapons.absorbed.length;
    const angle = -1.1 + (amount === 1 ? 1.1 : index / (amount - 1) * 2.2);
    const x = player.x + Math.cos(angle) * player.width * .7;
    const y = player.y + Math.sin(angle) * player.height * .72;
    ctx.save(); ctx.fillStyle = "#ffd5a0"; ctx.shadowColor = "#ff8059"; ctx.shadowBlur = quiet ? 0 : 7;
    ctx.beginPath(); ctx.ellipse(x, y, 3.6, 2.5, angle, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}

// These resources are separate from the shared Space special. Steer off the
// firing line to dodge, or hold your position long enough to use your weapon's rhythm.
const fighterCombatRules = Object.freeze({
  redCharge: .72, redMinCharge: .20, redCycle: .55,
  ionStacks: 3, ionRadius: 235, ionMarkTime: 1.6,
  auricRadius: 132, auricPulsePeriod: .33, auricRegen: .37, auricGuard: .14,
});
const fighterCombat = { stability: 0, redHeld: false, redCooldown: 0, redFlash: 0,
  marked: null, stacks: 0, marks: new WeakMap(), capacitor: 1, field: null, arcs: [] };

function resetFighterCombat() {
  Object.assign(fighterCombat, { stability: 0, redHeld: false, redCooldown: 0, redFlash: 0,
    marked: null, stacks: 0, marks: new WeakMap(), capacitor: 1, field: null, arcs: [] });
  updateFighterSystemsHud();
}
function clearFighterCombatTransients() {
  cancelFighterCharge();
  fighterCombat.marked = null;
  fighterCombat.stacks = 0;
  fighterCombat.marks = new WeakMap();
  fighterCombat.field = null;
  fighterCombat.arcs.length = 0;
}
function beginFighterCharge() {
  if (!isBattleActive() || fighterProfile().id !== "red" || fighterCombat.redHeld
    || fighterCombat.redCooldown > 0 || evolutionWeapons.lanceCharging || ultimateSuppressesFire()) return false;
  fighterCombat.redHeld = true;
  fighterCombat.stability = 0;
  const muzzle = muzzlePosition();
  addEvolutionPulse(muzzle.x, muzzle.y, 26, "#ffad96", .18);
  gameAudio.shoot?.(false, 1, "red");
  updateFighterSystemsHud();
  return true;
}
function cancelFighterCharge() {
  fighterCombat.redHeld = false;
  fighterCombat.stability = 0;
}
function releaseFighterCharge() {
  const held = fighterCombat.redHeld;
  const power = fighterCombat.stability;
  cancelFighterCharge();
  if (!held || !isBattleActive() || ultimateSuppressesFire()
    || power + 1e-7 < fighterCombatRules.redMinCharge / fighterCombatRules.redCharge) return false;
  const muzzle = muzzlePosition();
  const damage = Math.min(850, Math.exp(evolutionBaseDpsLog()) * (.18 + .77 * power));
  const start = muzzle.x + 2, color = "#ff9a82";
  const shot = { x: start, y: muzzle.y, previousX: start, previousY: muzzle.y, vx: 1120, vy: 0,
    angle: 0, length: 36 + 34 * power, halfHeight: 4 + 3 * power, color, core: "#fff0d5",
    damage, damageLog: Math.log(damage), visual: "lance", source: "crimson-heavy",
    armorPiercing: true, critical: power >= .96, piercesLeft: power >= .96 ? 4 : 2, hitTargets: new Set() };
  applyGuardPiercingRound(shot);
  bullets.push(shot);
  fighterCombat.redCooldown = fighterCombatRules.redCycle;
  fighterCombat.redFlash = .18;
  muzzleFlash = .09;
  addEvolutionPulse(muzzle.x, muzzle.y, 48 + 24 * power, color, .22);
  gameAudio.shoot?.(true, weapon.tier, "red");
  if (power >= .96) addCombatShake(1.7);
  updateFighterSystemsHud();
  return true;
}
function fighterMovementScale() {
  return fighterCombat.redHeld ? .64 : evolutionLanceActive() ? .69 : 1;
}
function directFighterHit(target, shot, fraction, source) {
  const value = Math.min(850, (shot.damage ?? Math.exp(shot.damageLog)) * fraction);
  if (!isBattleActive() || !(value > 0)) return;
  const hit = { damage: value, damageLog: Math.log(value), source, x: target.x, y: target.y, noEnergy: true };
  if (source === "azure-chain" && shot.hitTargets?.has(target)) hit.finaleNode = shot.finaleNode;
  if (enemies.includes(target) && target.hp > 0) {
    applyEnemyHit(target, hit);
    if (target.hp <= 0) defeatEnemy(enemies.indexOf(target), hit);
  } else if (activeBosses().includes(target) && bossCanTakeDamage(target)) {
    applyBossHit(hit, target);
  }
}
function updateFighterCombat(seconds) {
  if (!isBattleActive()) return;
  fighterCombat.redFlash = Math.max(0, fighterCombat.redFlash - seconds);
  fighterCombat.redCooldown = Math.max(0, fighterCombat.redCooldown - seconds);
  if (fighterCombat.redHeld) {
    if (ultimateSuppressesFire()) cancelFighterCharge();
    else fighterCombat.stability = Math.min(1, fighterCombat.stability + seconds / fighterCombatRules.redCharge);
  }
  const field = fighterCombat.field;
  if (fighterProfile().id === "yellow" && !field) {
    const multiplier = firingStyle.mode === "focus" ? 1 : .58;
    fighterCombat.capacitor = Math.min(1, fighterCombat.capacitor + seconds * fighterCombatRules.auricRegen * multiplier);
  }
  for (const arc of fighterCombat.arcs) arc.remaining -= seconds;
  while (fighterCombat.arcs[0]?.remaining <= 0) fighterCombat.arcs.shift();
  if (field) {
    field.age += seconds;
    if (field.age >= field.nextPulse && field.pulses < 3) {
      field.pulses++;
      field.nextPulse += fighterCombatRules.auricPulsePeriod;
      const radius = fighterCombatRules.auricRadius;
      addEvolutionPulse(field.x, field.y, radius, "#ffce79", .30);
      for (const target of [...enemies, ...activeBosses()]) {
        const dx = target.x - field.x, dy = target.y - field.y;
        if (Math.hypot(dx, dy) <= radius + target.height * .30) directFighterHit(target, field, 1, "auric-field");
      }
      for (const mine of [...eliteDirector.mines]) {
        if (Math.hypot(mine.x - field.x, mine.y - field.y) <= radius) defuseEliteMine(mine, field);
      }
    }
    if (field.age > 1.1) fighterCombat.field = null;
  }
  updateFighterSystemsHud();
}
function prepareFighterVolley() {
  const kind = fighterProfile().id;
  if (kind === "yellow") return firingStyle.mode === "spread" ? "auric-spread" : "auric-focus";
  return kind === "blue" ? "azure-seeker" : "";
}
function applyGuardPiercingRound(bullet) {
  if (!(evolutionWeapons.armorRoundRemaining > 0)) return;
  evolutionWeapons.armorRoundRemaining = 0;
  bullet.piercesShield = true;
  bullet.armorPiercing = true;
  bullet.critical = true;
  bullet.piercesLeft = Math.max(2, bullet.piercesLeft);
  bullet.color = "#ffe5af";
  bullet.core = "#fff9e1";
  bullet.halfHeight *= 1.25;
}
function armEvolutionGuardPierce() {
  if (evolution.links.lance) evolutionWeapons.armorRoundRemaining = 4.2;
}
function spawnFighterRound(bullet, volley, primary) {
  bullet.armorPiercing = evolution.pierce > 0;
  if (volley === "azure-seeker") {
    bullet.seeker = { retarget: 0, target: null };
    bullet.color = "#75d6fb"; bullet.core = "#e3fcff";
    bullet.length *= .76;
  } else if (volley.startsWith("auric-")) {
    bullet.auric = volley;
    bullet.color = "#ffb957"; bullet.core = "#fff4c9";
    bullet.halfHeight *= 1.12;
  }
  bullet.launchX = bullet.x;
  bullet.damage = Math.min(850, bullet.damage);
  bullet.damageLog = Math.log(bullet.damage);
  if (primary) applyGuardPiercingRound(bullet);
  return bullet;
}
function auricCloseRange() { return clamp(viewport.width * .29, 175, 380); }
function isAuricCloseShot(shot, target) {
  return target.x - (target.width ?? 0) * .34 - shot.launchX <= auricCloseRange();
}
function fighterProjectileDamage(shot, target) {
  if (shot.source === "evolution-drone" && evolution.links.falcon && evolutionWeapons.focus === target) {
    const damage = Math.min(850, shot.damage * 1.46);
    return { ...shot, damage, damageLog: Math.log(damage), armorPiercing: true };
  }
  if (shot.seeker) {
    // Seeker guidance stabilizes in transit; higher-rank ion emitters gain
    // extra coherence on long shots instead of a flat increase at all ranges.
    const flight = Math.max(0, target.x - shot.launchX);
    const long = clamp((flight - viewport.width * .27) / (viewport.width * .25), 0, 1);
    const emitter = clamp((weapon.damageLevel - 2) / 5, 0, 1);
    if (!long || !emitter) return shot;
    const damage = Math.min(850, shot.damage * (1 + .065 * long * emitter));
    return { ...shot, damage, damageLog: Math.log(damage) };
  }
  if (!shot.auric) return shot;
  const close = isAuricCloseShot(shot, target);
  const damage = Math.min(850, shot.damage * (close ? 1.19 : .86));
  return { ...shot, damage, damageLog: Math.log(damage) };
}
function steerFighterRound(bullet, seconds) {
  const seeker = bullet.seeker;
  if (!seeker) return;
  seeker.retarget -= seconds;
  if (seeker.retarget <= 0) {
    seeker.retarget = .105;
    let best = Infinity;
    seeker.target = null;
    const inSight = (target, distance) => target.x > bullet.x + 12 && distance < viewport.width * .7;
    for (const orb of powerups) {
      const dx = orb.x - bullet.x, dy = orb.y - bullet.y;
      if (Math.abs(dy) <= orb.radius + 12 && inSight(orb, dx) && dx < best) {
        seeker.target = orb; best = dx;
      }
    }
    for (const target of evolutionVisibleTargets(bullet)) {
      if (bullet.hitTargets.has(target)) continue;
      const dx = target.x - bullet.x, dy = target.y - bullet.y;
      const offset = Math.abs(targetAim(target, bullet, Math.PI) - bullet.angle);
      const score = dx + Math.abs(dy) * 2.7;
      if (inSight(target, dx) && offset < .42 && score < best) { seeker.target = target; best = score; }
      if (bullet.mode !== "focus" || !target.finale || target.finale.age < target.finale.transform) continue;
      // Concentrated ions prefer exposed parts, giving the pilot a way to
      // trade broad pack coverage for a clean lock onto a finale weak point.
      for (const part of target.finale.nodes) {
        if (!(part.hp > 0) || (["mirror", "synapse"].includes(target.finale.mode) && part.index !== target.finale.activeNode)) continue;
        const node = finaleNodeGeometry(target, part);
        const nodeDx = node.x - bullet.x, nodeDy = node.y - bullet.y;
        const angle = Math.abs(targetAim(node, bullet, Math.PI) - bullet.angle);
        const nodeScore = (nodeDx + Math.abs(nodeDy) * 2.5) * .68;
        if (inSight(node, nodeDx) && angle < .39 && nodeScore < best) { seeker.target = node; best = nodeScore; }
      }
    }
  }
  if (!seeker.target || seeker.target.x <= bullet.x + 12) return;
  const aim = targetAim(seeker.target, bullet, .64);
  const speed = Math.hypot(bullet.vx, bullet.vy);
  bullet.angle += clamp(aim - bullet.angle, -seconds * 1.9, seconds * 1.9);
  bullet.vx = Math.cos(bullet.angle) * speed;
  bullet.vy = Math.sin(bullet.angle) * speed;
}
function onFighterProjectileImpact(shot, target) {
  if (!isBattleActive()) return;
  splitEvolutionImpact(shot, target);
  if (shot.auric === "auric-spread" && !fighterCombat.field && fighterCombat.capacitor >= .999
    && isAuricCloseShot(shot, target)) {
    fighterCombat.capacitor = 0;
    fighterCombat.field = { x: target.x, y: target.y, age: 0, nextPulse: .04, pulses: 0,
      damage: Math.min(220, Math.exp(evolutionBaseDpsLog()) * .21) };
    gameAudio.shoot?.(true, 1, "yellow");
  }
  if (!shot.seeker) return;
  const status = fighterCombat.marks.get(target);
  const count = status && battleTime - status.time < fighterCombatRules.ionMarkTime ? status.count + 1 : 1;
  fighterCombat.marks.set(target, { count: count >= fighterCombatRules.ionStacks ? 0 : count, time: battleTime });
  fighterCombat.marked = target;
  fighterCombat.stacks = count % fighterCombatRules.ionStacks;
  if (count < fighterCombatRules.ionStacks) return;
  const neighbors = [...enemies, ...activeBosses()].filter(other => other !== target && other.hp > 0
    && Math.hypot(other.x - target.x, other.y - target.y) <= fighterCombatRules.ionRadius)
    .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y));
  // Discharge the marked target first, then arc through two nearby enemies.
  // If the pack has fewer bodies, the spare arcs return to the mark.
  const destinations = [target, neighbors[0] ?? target, neighbors[1] ?? neighbors[0] ?? target];
  let origin = { x: shot.x, y: shot.y - 8 };
  for (const [index, destination] of destinations.entries()) {
    directFighterHit(destination, shot, [.52, .34, .32][index], "azure-chain");
    if (fighterCombat.arcs.length >= 12) fighterCombat.arcs.shift();
    fighterCombat.arcs.push({ x: origin.x, y: origin.y,
      toX: destination.x, toY: destination.y + (index - 1) * 9, remaining: .19 });
    origin = { x: destination.x, y: destination.y + (index - 1) * 9 };
    addEvolutionPulse(destination.x, destination.y, 25, "#88e6ff", .23);
  }
}
function fighterWeaponCopy(kind = fighterProfile().id) {
  if (kind === "red") return tr("按住蓄力键，松手打出穿透重炮", "Hold the charge key, then release a piercing slug");
  if (kind === "blue") return tr("远距追踪 · 三次命中触发三连爆 · 聚焦追弱点", "Long-range seekers · Triple chain on 3 hits · Focus tracks weak points");
  return tr("近距扩散布下三脉冲力场 · 聚焦加快充能", "Close spread fire plants a three-pulse field · Focus charges faster");
}

const fighterSystemsReadout = document.createElement("span");
fighterSystemsReadout.className = "fighter-systems-readout";
fighterSystemsReadout.setAttribute("role", "meter");
fighterSystemsReadout.setAttribute("aria-valuemin", "0");
fighterSystemsReadout.setAttribute("aria-valuemax", "100");
document.querySelector(".weapon-readout")?.append?.(fighterSystemsReadout);
let fighterSystemsDisplayKey = "";
function updateFighterSystemsHud() {
  const id = fighterProfile().id;
  const { redHeld, redCooldown, stability, capacitor, field, marked, stacks } = fighterCombat;
  const charged = Math.round(stability * 10) * 10;
  const validMark = marked?.hp > 0
    && battleTime - (fighterCombat.marks.get(marked)?.time ?? 0) < fighterCombatRules.ionMarkTime;
  const markCount = validMark ? stacks : 0;
  const aura = Math.floor(capacitor * 10 + .0001) * 10;
  const chargeKey = typeof controlBindingLabel === "function" ? controlBindingLabel("charge") || "C" : "C";
  const value = id === "red" ? charged : id === "blue" ? Math.round(markCount / 3 * 100) : aura;
  const label = id === "red"
    ? redHeld ? tr("重炮蓄力 " + charged + "%", "Heavy cannon " + charged + "%")
      : redCooldown > 0 ? tr("重炮冷却", "Cannon cycling") : tr(chargeKey + " 蓄重炮", chargeKey + " charge")
    : id === "blue" ? tr("离子标记 " + markCount + "/3", "Ion marks " + markCount + "/3")
      : field ? tr("压制场 " + field.pulses + "/3", "Field pulses " + field.pulses + "/3")
        : tr("压制电容 " + aura + "%", "Suppression cap " + aura + "%");
  const link = evolutionWeapons.armorRoundRemaining > 0 ? tr(" · 穿盾弹就绪", " · Shieldbreak ready") : "";
  const key = [id, value, label, link].join("|");
  if (key === fighterSystemsDisplayKey) return;
  fighterSystemsDisplayKey = key;
  fighterSystemsReadout.dataset.fighter = id;
  fighterSystemsReadout.textContent = label + link;
  fighterSystemsReadout.setAttribute("aria-label", label + link);
  fighterSystemsReadout.setAttribute("aria-valuenow", String(value));
}
function drawFighterCombat(ctx = context) {
  if (state !== "battle") return;
  const { field, arcs, marked, stacks, stability, capacitor, redFlash } = fighterCombat;
  const id = fighterProfile().id;
  ctx.save();
  if (field) {
    const radius = fighterCombatRules.auricRadius;
    ctx.strokeStyle = "#efbd7170"; ctx.lineWidth = 1.6;
    ctx.fillStyle = "#ffaa3510"; ctx.beginPath(); ctx.arc(field.x, field.y, radius, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.arc(field.x, field.y, radius - 7, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const arc of arcs) {
    ctx.globalAlpha = clamp(arc.remaining / .19, 0, 1) * (quietCombatMotion() ? .56 : 1);
    ctx.strokeStyle = "#8ae8ff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(arc.x, arc.y);
    ctx.lineTo(arc.x + (arc.toX - arc.x) * .38 - 5, arc.y + (arc.toY - arc.y) * .38 + 9);
    ctx.lineTo(arc.x + (arc.toX - arc.x) * .73 + 5, arc.y + (arc.toY - arc.y) * .73 - 7);
    ctx.lineTo(arc.toX, arc.toY); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (marked?.hp > 0 && stacks > 0 && battleTime - (fighterCombat.marks.get(marked)?.time ?? 0) < 1.6) {
    ctx.fillStyle = "#92e6ff";
    for (let index = 0; index < stacks; index++) ctx.fillRect(marked.x - 7 + index * 8, marked.y + marked.height * .48 + 6, 5, 2);
  }
  if (id === "red" && (fighterCombat.redHeld || redFlash > 0)) {
    const tip = muzzlePosition(), charge = Math.max(stability, redFlash / .18);
    ctx.strokeStyle = "#ff9d81";
    ctx.lineWidth = 1 + charge * 2;
    ctx.beginPath();
    ctx.arc(tip.x + 5, tip.y, 8 + charge * 13, -.85, .85);
    ctx.stroke();
  }
  if (id === "red" && (fighterCombat.redHeld || redFlash > 0) || id === "yellow") {
    const progress = id === "red" ? Math.max(stability, redFlash / .18) : capacitor;
    const x = player.x - 22, y = player.y + player.height * .54 + 6;
    ctx.fillStyle = "#0d1828c9"; ctx.fillRect(x, y, 44, 4);
    ctx.fillStyle = id === "red" ? "#ff9b82" : "#f0cb75";
    ctx.fillRect(x, y + 1, 44 * progress, 2);
  }
  ctx.restore();
}
