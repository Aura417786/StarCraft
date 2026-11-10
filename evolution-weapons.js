"use strict";

// Combat-time resources freeze with the sortie. Cosmetic drones have no hitbox.
const evolutionWeaponRules = { maxAuxiliary: 64, lanceCharge: .7, lanceCooldown: 5.8, shiftTap: .22,
  droneInterval: [0, .85, .86, .86], droneDamage: [0, .16, .13, .13],
  absorbLimit: [0, 0, 4, 6], counterDamage: [0, 0, .16, .20], interceptCooldown: 17 };
const evolutionWeapons = { clock: 0, lanceCooldown: 0, lanceCharge: 0, lanceCharging: false,
  splitCooldown: 0, droneCooldown: .15, droneFlash: 0, drones: [], focus: null,
  interceptCooldown: 0, grounded: 0, absorbed: [], shieldLinkRemaining: 0 };

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
    interceptCooldown: 0, grounded: 0, shieldLinkRemaining: 0 });
  evolutionWeapons.drones.length = 0;
  evolutionWeapons.absorbed.length = 0;
}
function clearEvolutionWeaponTransients() {
  beginEvolutionShieldCapture();
  cancelEvolutionLance();
  evolutionWeapons.focus = null;
  evolutionWeapons.shieldLinkRemaining = 0;
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
    armorPiercing: visual === "lance", piercesLeft: options.pierces ?? 0, hitTargets: new Set(), overdrive: false });
  return true;
}
function beginEvolutionLance() {
  if (evolution.pierce < 3) return false;
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
      angle: evolutionAim(muzzle, index), pierces: evolution.links.falcon ? 1 : 0,
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
  // Each sortie command intercepts one nearby packet of incoming physical shots.
  const candidates = [];
  for (const shots of [enemyProjectiles, bossProjectiles]) {
    for (const shot of shots) {
      const dx = shot.x - player.x, dy = shot.y - player.y;
      if (dx >= -35 && dx < 290 && Math.abs(dy) < 105 && dx * shot.vx + dy * shot.vy < 0) {
        candidates.push({ shot, shots, distance: Math.hypot(dx, dy) });
      }
    }
  }
  if (!candidates.length) {
    evolutionWeapons.focus = null;
    return true;
  }
  candidates.sort((a, b) => a.distance - b.distance);
  for (const { shot, shots } of candidates.slice(0, 9)) {
    shots.splice(shots.indexOf(shot), 1);
    addEvolutionPulse(shot.x, shot.y, 32, "#9ce9e2", .29);
  }
  evolutionWeapons.interceptCooldown = evolutionWeaponRules.interceptCooldown;
  evolutionWeapons.grounded = 4;
  evolutionWeapons.focus = null;
  gameAudio.perfectShield?.();
  statusMessage.textContent = tr("星隼拦截 · 僚机重整 4 秒", "Falcon intercept · Recovering for 4s");
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
        pierces: evolution.links.lance ? 1 : 0 })) fired++;
  }
  if (fired) gameAudio.shoot?.(true);
  return fired;
}
function updateEvolutionWeapons(seconds) {
  if (state !== "battle" || evolution.pending || isBossDeathPlaying()) { clearEvolutionWeaponTransients(); return; }
  if (!isBattleActive() || !Number.isFinite(seconds) || seconds <= 0) return;
  const dt = Math.min(seconds, .1);
  evolutionWeapons.clock += dt;
  for (const key of ["droneFlash", "shieldLinkRemaining", "lanceCooldown", "splitCooldown", "interceptCooldown", "grounded"])
    evolutionWeapons[key] = Math.max(0, evolutionWeapons[key] - dt);
  if (evolutionWeapons.lanceCharging) evolutionWeapons.lanceCharge = Math.min(2, evolutionWeapons.lanceCharge + dt);
  if (evolutionWeapons.focus && !evolutionVisibleTargets(muzzlePosition()).includes(evolutionWeapons.focus)) evolutionWeapons.focus = null;
  evolutionWeapons.drones = getEvolutionDronePositions();
  if (evolution.blast) {
    evolutionWeapons.droneCooldown = Math.max(0, evolutionWeapons.droneCooldown - dt);
    if (evolutionWeapons.droneCooldown <= 1e-9) {
      fireEvolutionDrones();
      evolutionWeapons.droneCooldown = evolutionWeaponRules.droneInterval[evolution.blast] * (evolutionWeapons.shieldLinkRemaining > 0 ? .68 : 1);
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
const fighterCombatRules = { redCharge: .72, ionStacks: 3, ionRadius: 235,
  auricRadius: 128, auricRange: 465, auricPulsePeriod: .36, auricRegen: .36 };
const fighterCombat = { stability: 0, marked: null, stacks: 0, marks: new WeakMap(),
  capacitor: 1, field: null, arcs: [], redFlash: 0 };

function resetFighterCombat() {
  Object.assign(fighterCombat, { stability: 0, marked: null, stacks: 0, marks: new WeakMap(),
    capacitor: 1, field: null, arcs: [], redFlash: 0 });
}
function clearFighterCombatTransients() {
  fighterCombat.marked = null;
  fighterCombat.stacks = 0;
  fighterCombat.marks = new WeakMap();
  fighterCombat.field = null;
  fighterCombat.arcs.length = 0;
}
function fighterMovementScale() { return evolutionLanceActive() ? .69 : 1; }
function directFighterHit(target, shot, fraction, source) {
  const value = Math.min(850, (shot.damage ?? Math.exp(shot.damageLog)) * fraction);
  const hit = { damage: value, damageLog: Math.log(value), source, y: target.y, noEnergy: true };
  if (!isBattleActive() || !(value > 0)) return;
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
  if (fighterProfile().id === "red" && !ultimateSuppressesFire()) {
    const climbing = Math.abs(player.y - (player.previousY ?? player.y)) > 90 * seconds;
    fighterCombat.stability = clamp(fighterCombat.stability + seconds * (climbing ? -3.4 : 1 / fighterCombatRules.redCharge), 0, 1);
  }
  if (fighterProfile().id === "yellow") {
    const multiplier = firingStyle.mode === "focus" ? 1.6 : 1;
    fighterCombat.capacitor = Math.min(1, fighterCombat.capacitor + seconds * fighterCombatRules.auricRegen * multiplier);
  }
  for (const arc of fighterCombat.arcs) arc.remaining -= seconds;
  while (fighterCombat.arcs[0]?.remaining <= 0) fighterCombat.arcs.shift();
  const field = fighterCombat.field;
  if (!field) return;
  field.age += seconds;
  if (field.age >= field.nextPulse && field.pulses < 3) {
    field.pulses++;
    field.nextPulse += fighterCombatRules.auricPulsePeriod;
    const radius = fighterCombatRules.auricRadius;
    addEvolutionPulse(field.x, field.y, radius, "#ffce79", .30);
    for (const target of [...enemies, ...activeBosses()]) {
      const dx = target.x - field.x, dy = target.y - field.y;
      if (Math.hypot(dx, dy) <= radius + target.height * .30) directFighterHit(target, field, .95, "auric-field");
    }
  }
  if (field.age > 1.16) fighterCombat.field = null;
}
function prepareFighterVolley() {
  const kind = fighterProfile().id;
  if (kind === "red" && fighterCombat.stability >= .999) {
    fighterCombat.stability = 0;
    fighterCombat.redFlash = .16;
    return "crimson-heavy";
  }
  if (kind === "yellow" && firingStyle.mode === "spread" && fighterCombat.capacitor >= .999 && !fighterCombat.field) {
    fighterCombat.capacitor = 0;
    return "auric-carrier";
  }
  return kind === "blue" ? "azure-seeker" : "";
}
function spawnFighterRound(bullet, volley, primary) {
  bullet.armorPiercing = evolution.pierce > 0;
  if (volley === "crimson-heavy") {
    bullet.damage *= primary ? 2.0 : 1.12;
    bullet.piercesLeft = Math.max(1, bullet.piercesLeft);
    bullet.length *= 1.45;
    bullet.halfHeight *= 1.32;
    bullet.color = "#ff9a82"; bullet.core = "#fff0d5";
    bullet.visual = "lance";
  } else if (volley === "azure-seeker") {
    bullet.seeker = { retarget: 0, target: null };
    bullet.color = "#75d6fb"; bullet.core = "#e3fcff";
    bullet.length *= .76;
  } else if (volley === "auric-carrier" && primary) {
    bullet.fieldOrigin = bullet.x;
    bullet.fieldCarrier = true;
    bullet.color = "#ffb957"; bullet.core = "#fff4c9";
    bullet.halfHeight *= 1.5;
  }
  bullet.damage = Math.min(850, bullet.damage);
  bullet.damageLog = Math.log(bullet.damage);
  return bullet;
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
  if (shot.fieldCarrier && !fighterCombat.field && shot.x - shot.fieldOrigin <= fighterCombatRules.auricRange) {
    shot.fieldCarrier = false;
    fighterCombat.field = { x: target.x, y: target.y, age: 0, nextPulse: .06, pulses: 0,
      damage: Math.min(220, shot.damage * (1 + .18 * (weapon.lanes - 1))) };
    gameAudio.shoot?.(true, 1, "yellow");
  }
  if (!shot.seeker) return;
  const status = fighterCombat.marks.get(target);
  const count = status && battleTime - status.time < 1.6 ? status.count + 1 : 1;
  fighterCombat.marks.set(target, { count: count >= fighterCombatRules.ionStacks ? 0 : count, time: battleTime });
  fighterCombat.marked = target;
  fighterCombat.stacks = count % fighterCombatRules.ionStacks;
  if (count < fighterCombatRules.ionStacks) return;
  let neighbor = null, distance = fighterCombatRules.ionRadius;
  for (const other of [...enemies, ...activeBosses()]) {
    if (other === target || other.hp <= 0) continue;
    const gap = Math.hypot(other.x - target.x, other.y - target.y);
    if (gap < distance) { distance = gap; neighbor = other; }
  }
  const destination = neighbor ?? target;
  const recoil = .91 + Math.min(.15, Math.max(0, (weapon.damageLevel - 3) * .015));
  directFighterHit(destination, shot, neighbor ? 1.2 : recoil, "azure-chain");
  if (fighterCombat.arcs.length >= 12) fighterCombat.arcs.shift();
  fighterCombat.arcs.push({ x: neighbor ? target.x : shot.x, y: neighbor ? target.y : shot.y,
    toX: destination.x, toY: destination.y, remaining: .19 });
  addEvolutionPulse(destination.x, destination.y, 25, "#88e6ff", .23);
}
function fighterWeaponCopy(kind = fighterProfile().id) {
  if (kind === "red") return tr("稳住高度蓄重炮", "Hold altitude to charge");
  if (kind === "blue") return tr("远距追踪 · 三次命中连锁", "Ranged seekers · Chain on 3 hits");
  return tr("近距扩散布下力场", "Close spread fire deploys a field");
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
  if (id === "red" || id === "yellow") {
    const progress = id === "red" ? Math.max(stability, redFlash * 6.25) : capacitor;
    const x = player.x - 22, y = player.y + player.height * .54 + 6;
    ctx.fillStyle = "#0d1828c9"; ctx.fillRect(x, y, 44, 4);
    ctx.fillStyle = id === "red" ? "#ff9b82" : "#f0cb75";
    ctx.fillRect(x, y + 1, 44 * progress, 2);
  }
  ctx.restore();
}
