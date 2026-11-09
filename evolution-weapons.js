"use strict";

// All support weapons share the production projectile/collision path. Timers are
// combat-time only; cosmetic drones have no hitbox and cannot collect supplies.
const evolutionWeaponRules = { maxAuxiliary: 96, lanceCharge: 0.48,
  wingInterval: [0, .9, .85, .8], wingDamage: [0, .12, .13, .14],
  lanceInterval: [0, 0, 3.4, 2.8], lanceDamage: [0, 0, .65, .8],
  droneInterval: [0, .9, .95, .95], droneDamage: [0, .26, .22, .16],
  absorbLimit: [0, 3, 5, 8], counterDamage: [0, .10, .11, .12] };
const evolutionWeapons = { clock: 0, wingCooldown: .12, wingFlash: 0,
  lanceCooldown: .8, lanceCharge: 0, lanceCharging: false,
  droneCooldown: .15, droneVolley: 0, droneFlash: 0, drones: [],
  absorbed: [], shieldLinkRemaining: 0 };

function evolutionAuxDamageLog() { return Number.isFinite(evolution.overclock) ? evolution.overclock : 0; }
function evolutionBaseDpsLog() { return weaponDamageLog() + Math.log(weapon.lanes / weapon.interval); }
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
  Object.assign(evolutionWeapons, { clock: 0, wingCooldown: .12, wingFlash: 0,
    lanceCooldown: .8, lanceCharge: 0, lanceCharging: false,
    droneCooldown: .15, droneVolley: 0, droneFlash: 0,
    shieldLinkRemaining: 0 });
  evolutionWeapons.drones.length = 0; evolutionWeapons.absorbed.length = 0;
}
function clearEvolutionWeaponTransients() {
  if (evolutionWeapons.absorbed.length) beginEvolutionShieldCapture();
  evolutionWeapons.lanceCharge = 0; evolutionWeapons.lanceCharging = false;
  evolutionWeapons.shieldLinkRemaining = 0; evolutionWeapons.wingFlash = 0;
  evolutionWeapons.droneFlash = 0;
}
function onEvolutionUpgrade(kind) {
  if (kind === "pierce") {
    evolutionWeapons.wingCooldown = Math.min(evolutionWeapons.wingCooldown, .12);
    if (evolution.pierce >= 2) evolutionWeapons.lanceCooldown = Math.min(evolutionWeapons.lanceCooldown, .7);
  }
  if (kind === "blast") evolutionWeapons.droneCooldown = Math.min(evolutionWeapons.droneCooldown, .15);
  evolutionWeapons.drones = getEvolutionDronePositions();
}
function resizeEvolutionWeapons() {
  // Positions are derived from the resized player, not an independently advanced
  // formation. Resizing cannot release stored projectiles or refresh a cadence.
  evolutionWeapons.drones = getEvolutionDronePositions();
}
function evolutionVisibleTargets(origin) {
  return [...enemies.filter(target => target.hp > 0 && target.x - target.width * .5 < viewport.width
    && target.x + target.width * .5 > 0), ...activeBosses().filter(bossCanTakeDamage)]
    .filter(target => target.x > origin.x + 8 && target.x < viewport.width + target.width * .5);
}
function evolutionAim(origin, slot = 0) {
  const targets = evolutionVisibleTargets(origin).sort((a, b) =>
    (a.x - origin.x + Math.abs(a.y - origin.y) * .45) - (b.x - origin.x + Math.abs(b.y - origin.y) * .45));
  const target = targets[Math.min(slot, targets.length - 1)];
  return target ? clamp(Math.atan2(target.y - origin.y, target.x - origin.x), -.65, .65) : 0;
}
function spawnEvolutionRound(origin, visual, damageSeconds, options = {}) {
  if (!isBattleActive() || bullets.reduce((count, shot) => count + Number(!!shot.auxiliary), 0) >= evolutionWeaponRules.maxAuxiliary) return false;
  const angle = options.angle ?? 0, speed = options.speed ?? (visual === "lance" ? 1020 : visual === "counter" ? 900 : 820);
  const shieldLance = visual === "counter" && evolution.links.lance;
  const colors = visual === "drone" ? ["#9ce9e2", "#edfffa"] : visual === "counter" ? ["#ffc987", "#fff1d5"] : ["#9edfff", "#f1fcff"];
  const damageLog = evolutionBaseDpsLog() + Math.log(Math.max(.001, damageSeconds))
    + evolutionAuxDamageLog() + Math.log(options.multiplier ?? 1);
  bullets.push({ x: origin.x, y: origin.y, previousX: origin.x, previousY: origin.y,
    angle, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    halfHeight: visual === "lance" ? 4 : shieldLance ? 3.8 : 2,
    length: visual === "lance" ? 52 : shieldLance ? 46 : visual === "counter" ? 29 : 19,
    damage: Math.exp(Math.min(690, damageLog)), damageLog, color: colors[0], core: colors[1],
    source: "evolution-" + visual, visual, auxiliary: true, noEnergy: !!options.noEnergy,
    piercesLeft: options.pierces ?? 0, hitTargets: new Set(), overdrive: false });
  return true;
}
function fireEvolutionWings() {
  let fired = false;
  for (const muzzle of getEvolutionWingMuzzles()) fired = spawnEvolutionRound(muzzle, "wing",
    evolutionWeaponRules.wingDamage[evolution.pierce], { pierces: evolution.pierce - 1 }) || fired;
  if (fired) { evolutionWeapons.wingFlash = .10; gameAudio.shoot?.(false); }
}
function fireEvolutionLance() {
  let fired = false;
  for (const muzzle of getEvolutionWingMuzzles()) fired = spawnEvolutionRound(muzzle, "lance",
    evolutionWeaponRules.lanceDamage[evolution.pierce] / 2, { pierces: evolution.pierce + 1 }) || fired;
  if (fired) { evolutionWeapons.wingFlash = .16; gameAudio.bossAttack?.("cannon"); }
}
function fireEvolutionDrones() {
  const level = evolution.blast, linked = evolutionWeapons.shieldLinkRemaining > 0;
  evolutionWeapons.droneVolley++;
  const salvo = (level >= 3 && evolutionWeapons.droneVolley % 3 === 0) || linked;
  let fired = false;
  evolutionWeapons.drones.forEach((drone, index) => {
    const muzzle = { x: drone.muzzleX, y: drone.muzzleY }, aim = evolutionAim(muzzle, index);
    const offsets = salvo ? [-.065, 0, .065] : [0];
    for (const offset of offsets) fired = spawnEvolutionRound(muzzle, "drone",
      evolutionWeaponRules.droneDamage[level], { angle: aim + offset,
        multiplier: evolution.links.falcon ? 1.15 : 1, pierces: evolution.links.falcon ? 1 : 0 }) || fired;
  });
  if (fired) { evolutionWeapons.droneFlash = .12; gameAudio.shoot?.(false); }
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
        multiplier: evolution.links.lance ? 1.5 : 1, pierces: evolution.links.lance ? 2 : 0 })) fired++;
  }
  if (fired) gameAudio.shoot?.(true);
  return fired;
}
function updateEvolutionWeapons(seconds) {
  if (state !== "battle" || evolution.pending || isBossDeathPlaying()) { clearEvolutionWeaponTransients(); return; }
  if (!isBattleActive() || !Number.isFinite(seconds) || seconds <= 0) return;
  const dt = Math.min(seconds, .1);
  evolutionWeapons.clock += dt;
  for (const key of ["wingFlash", "droneFlash", "shieldLinkRemaining"])
    evolutionWeapons[key] = Math.max(0, evolutionWeapons[key] - dt);
  evolutionWeapons.drones = getEvolutionDronePositions();
  if (evolution.pierce) {
    evolutionWeapons.wingCooldown = Math.max(0, evolutionWeapons.wingCooldown - dt);
    if (!ultimateSuppressesFire() && evolutionWeapons.wingCooldown <= 1e-9) {
      fireEvolutionWings(); evolutionWeapons.wingCooldown = evolutionWeaponRules.wingInterval[evolution.pierce];
    }
    if (evolution.pierce >= 2 && !ultimateSuppressesFire()) {
      if (evolutionWeapons.lanceCharging) {
        evolutionWeapons.lanceCharge = Math.min(1, evolutionWeapons.lanceCharge + dt / evolutionWeaponRules.lanceCharge);
        if (evolutionWeapons.lanceCharge >= 1 - 1e-9) {
          fireEvolutionLance(); evolutionWeapons.lanceCharging = false; evolutionWeapons.lanceCharge = 0;
          evolutionWeapons.lanceCooldown = evolutionWeaponRules.lanceInterval[evolution.pierce];
        }
      } else {
        evolutionWeapons.lanceCooldown = Math.max(0, evolutionWeapons.lanceCooldown - dt);
        if (evolutionWeapons.lanceCooldown <= 1e-9) { evolutionWeapons.lanceCharging = true; evolutionWeapons.lanceCharge = .001; }
      }
    }
  }
  if (evolution.blast) {
    evolutionWeapons.droneCooldown = Math.max(0, evolutionWeapons.droneCooldown - dt);
    if (evolutionWeapons.droneCooldown <= 1e-9) {
      fireEvolutionDrones(); evolutionWeapons.droneCooldown = evolutionWeaponRules.droneInterval[evolution.blast];
    }
  }
}
function drawEvolutionWeapons(ctx = context) {
  if (state !== "battle") return;
  const quiet = reducedMotion.matches, time = evolutionWeapons.clock;
  for (const drone of getEvolutionDronePositions()) {
    if (typeof drawEvolutionDroneBody === "function") drawEvolutionDroneBody(ctx, drone, evolution.blast, quiet, time);
    else if (typeof drawShipPBR === "function") drawShipPBR(ctx, drone, "crimson", null, quiet, time);
    if (evolutionWeapons.droneFlash > 0) {
      ctx.save(); ctx.fillStyle = "#d9fff5"; ctx.globalAlpha = Math.min(1, evolutionWeapons.droneFlash / .12);
      ctx.beginPath(); ctx.ellipse(drone.muzzleX + 3, drone.muzzleY, 5, 2.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  if (evolution.pierce) for (const muzzle of getEvolutionWingMuzzles()) {
    if (evolutionWeapons.wingFlash > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, evolutionWeapons.wingFlash / .1); ctx.fillStyle = "#d8f5ff";
      ctx.beginPath(); ctx.ellipse(muzzle.x + 3, muzzle.y, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    if (evolutionWeapons.lanceCharge > 0) {
      ctx.save(); ctx.strokeStyle = "#9bd8ef"; ctx.lineWidth = 1.4; ctx.globalAlpha = .3 + evolutionWeapons.lanceCharge * .65;
      ctx.beginPath(); ctx.arc(muzzle.x, muzzle.y, 4 + evolutionWeapons.lanceCharge * 8, -.5 * Math.PI,
        -.5 * Math.PI + evolutionWeapons.lanceCharge * Math.PI * 2); ctx.stroke(); ctx.restore();
    }
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
