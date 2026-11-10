"use strict";

const bossRules = { firstArrival: 90, interval: 75, warning: 5, entry: 1.5,
  recovery: 0.65, grace: 1.1, maxProjectiles: 260 };
const bossTypes = [
  { name: "苍穹霸主", enName: "Sky Sovereign", color: "#69cfff", attacks: ["半月星弧", "侧翼扫射", "舰队召唤"], enAttacks: ["Crescent Arc", "Flank Sweep", "Fleet Call"] },
  { name: "赤焰裁决", enName: "Crimson Judgment", color: "#ff747f", attacks: ["五向追瞄炮", "交替焚烧", "破片核心"], enAttacks: ["Five-Way Volley", "Alternating Scorch", "Fragment Core"] },
  { name: "紫电幽影", enName: "Violet Wraith", color: "#c58aff", attacks: ["折线电矢", "交错弹墙", "锁点雷击"], enAttacks: ["Zigzag Bolts", "Staggered Walls", "Targeted Strike"] },
  { name: "翡翠蜂后", enName: "Jade Hive Queen", color: "#71efa7", attacks: ["蜂群追猎", "荆棘旋涡", "护卫编队"], enAttacks: ["Hunting Swarm", "Thorn Vortex", "Escort Formation"] },
  { name: "熔金堡垒", enName: "Molten Bastion", color: "#ffd16f", attacks: ["重炮齐射", "缺口弹幕", "聚能光束"], enAttacks: ["Heavy Barrage", "Gapped Salvo", "Charged Beam"] },
];
function bossTypeName(type) { return tr(bossTypes[type].name, bossTypes[type].enName); }
let boss = null;
let nextBossTime = bossRules.firstArrival;
let bossDefeated = 0;
let bossBag = [];
let lastBossType = -1;
let pendingBossType = null;
// 普通敌机碰撞与 Boss 弹幕共用受伤保护时间。
let bossHitGrace = 0;
const bossProjectiles = [];
const bossHazards = [];

function chooseBossType() {
  if (!bossBag.length) {
    bossBag = [0, 1, 2, 3, 4];
    for (let index = bossBag.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [bossBag[index], bossBag[other]] = [bossBag[other], bossBag[index]];
    }
    if (bossBag[0] === lastBossType) [bossBag[0], bossBag[1]] = [bossBag[1], bossBag[0]];
  }
  lastBossType = bossBag.shift();
  return lastBossType;
}
function bossArena() {
  const width = Math.min(player.width * 1.48, viewport.width * 0.32);
  const height = width * 0.74;
  const top = Math.min(viewport.height / 2, Math.max(height * 0.54 + 10, flightBounds.top + height * 0.15));
  const bottom = Math.max(top, Math.min(viewport.height - height * 0.54 - 10, flightBounds.bottom - height * 0.15));
  return { width, height, x: viewport.width - width * 0.6 - 18,
    y: clamp(viewport.height / 2, top, bottom), top, bottom };
}
function bossPlayerRight() {
  const targets = activeBosses();
  if (!targets.length) return flightBounds.right;
  const edge = Math.min(...targets.map(target => (duoEncounter ? duoArena(target.slot).x : bossArena().x) - target.width * 0.6));
  return Math.max(flightBounds.left, edge - player.width * 0.55 - 16);
}
function setBossMessage(title, action, visible = true) {
  const panel = document.querySelector("#boss-hud");
  panel.hidden = !visible;
  document.querySelector("#boss-name").textContent = title;
  document.querySelector("#boss-action").textContent = action;
  app.dataset.bossActive = String(visible);
}
function resetBossEncounter() {
  if (typeof resetBossComponents === "function") resetBossComponents();
  resetDuoEncounter();
  boss = null;
  nextBossTime = bossRules.firstArrival;
  bossDefeated = 0;
  bossBag = [];
  lastBossType = -1;
  pendingBossType = null;
  bossHitGrace = 0;
  bossProjectiles.length = 0;
  bossHazards.length = 0;
  setBossMessage("", "", false);
  setBossWarning();
}
function resizeBossEncounter() {
  if (typeof resetBossComponents === "function") resetBossComponents();
  if (duoEncounter && boss) { resizeDuoEncounter(); return; }
  bossProjectiles.length = 0;
  bossHazards.length = 0;
  if (!boss) return;
  Object.assign(boss, bossArena());
  boss.previousX = boss.x;
  boss.previousY = boss.y;
  boss.phase = "recover";
  boss.phaseTime = 0;
  bossHitGrace = bossRules.grace;
  player.x = Math.min(player.x, bossPlayerRight());
}
function bossBlocksWaves() { return !!boss || battleTime >= nextBossTime - bossRules.warning; }
function weaponDamageLog() { return progressionPacketDamageLog(); }
function bossAttackSpeed(base) {
  const screenScale = clamp(viewport.width / 1280, 0.7, 1.05);
  const encounterScale = 1 + Math.min(0.25, bossDefeated * 0.035);
  return base * screenScale * encounterScale * (boss && boss.enraged ? 1.2 : 1);
}
function bossTelegraphTime() { return boss && boss.enraged ? 0.7 : 0.9; }
function spawnBoss(type = chooseBossType(), partnerType = null) {
  if (partnerType !== null) { spawnDuoEncounter(type, partnerType); return; }
  resetDuoEncounter();
  const arena = bossArena();
  const data = bossTypes[type];
  const endurance = Math.min(85, 55 + bossDefeated * 5);
  // 按独立的战斗阶段生成，玩家升级不会立即换来同步增厚的首领。
  const healthLog = progressionBossHealthLog(battleTime, endurance);
  boss = { ...arena, type, color: data.color, name: bossTypeName(type), hp: 1, maxHp: 1, displayHp: 1,
    healthLog, endurance, x: viewport.width + arena.width / 2, previousX: viewport.width + arena.width / 2,
    phase: "enter", phaseTime: 0, age: 0, hitFlash: 0, attackIndex: -1, fired: 0, targetY: player.y,
    enraged: false, attackEvents: Object.create(null) };
  if (typeof ensureBossComponents === "function") ensureBossComponents(boss);
  enemies.length = 0; resetEnemyCombat(false);
  bossProjectiles.length = 0;
  bossHazards.length = 0;
  pendingBossType = null;
  bossHitGrace = 2;
  setBossWarning();
  player.x = Math.min(player.x, bossPlayerRight());
  movementHint.hidden = true;
  setBossMessage(boss.name, tr("旗舰抵达 · 瞄准上下炮组可拆毁武器，直击中轴更快击破", "Flagship arriving · Destroy gun mounts or fire at the core"));
  statusMessage.textContent = tr(boss.name + "出现，普通敌机暂停生成。", boss.name + " has arrived. Regular enemy spawns are paused.");
}
function startBossAttack() {
  if (!boss) return;
  boss.attackIndex = (boss.attackIndex + 1) % 3;
  // 炮组损毁后不再假装发射；保留第三种舰体技能作为最后的抵抗。
  if (typeof bossWeaponOnline === "function") {
    for (let skipped = 0; skipped < 2 && boss.attackIndex < 2
      && !bossWeaponOnline(boss, boss.attackIndex === 0 ? -1 : 1); skipped++) {
      boss.attackIndex = (boss.attackIndex + 1) % 3;
    }
  }
  boss.phase = "telegraph";
  boss.phaseTime = 0;
  boss.fired = 0;
  boss.attackEvents = Object.create(null);
  boss.telegraphDuration = bossTelegraphTime();
  boss.targetY = player.y;
  boss.sweepFrom = Math.random() < 0.5 ? bossArena().top : bossArena().bottom;
  boss.gapY = clamp(player.y, flightBounds.top + 30, flightBounds.bottom - 30);
  const advice = [
    [tr("寻找弧形间隙", "Find a gap in the arc"), tr("闪避横向扫射", "Dodge the sweep"), tr("拦截召唤的敌机", "Intercept summoned enemies")],
    [tr("移动避开锁定点", "Move away from the aim point"), tr("离开红色标线", "Clear the red lines"), tr("避开闪烁核心与碎片", "Avoid the core and fragments")],
    [tr("留意折线轨迹", "Watch the zigzag paths"), tr("穿过弹墙缺口", "Fly through a gap"), tr("离开紫色圆圈", "Clear the purple circles")],
    [tr("诱导追踪弹，再转向", "Lure the homing shots, then turn"), tr("从旋涡空隙穿过", "Slip through the vortex gaps"), tr("优先拦截护卫机", "Intercept the escorts first")],
    [tr("避开三排重炮", "Dodge the three rows"), tr("对准弹墙缺口", "Line up with the gap"), tr("离开金色标线", "Clear the gold line")],
  ];
  const { attacks, enAttacks } = bossTypes[boss.type];
  setBossMessage(boss.name, (boss.enraged ? tr("狂暴 · ", "Enraged · ") : "") + tr(attacks[boss.attackIndex], enAttacks[boss.attackIndex]) + " · " + advice[boss.type][boss.attackIndex]);
  if (boss.type === 1 && boss.attackIndex === 1) {
    createRedBeamGroup(0, boss.telegraphDuration);
  }
  if (boss.type === 2 && boss.attackIndex === 2) {
    createBossLightning(0, boss.telegraphDuration);
  }
  if (boss.type === 4 && boss.attackIndex === 2) {
    addBossHazard("beam", { y: player.y, thickness: boss.enraged ? 38 : 30, warning: boss.telegraphDuration, duration: 0.65 });
  }
}
function createRedBeamGroup(index, warning = bossTelegraphTime()) {
  const offsets = index % 2 ? [0, player.y < bossArena().y ? 1.65 : -1.65] : [-0.7, 0.7];
  for (const offset of offsets) addBossHazard("beam", {
    y: clamp(player.y + offset * player.height, flightBounds.top, flightBounds.bottom),
    thickness: boss.enraged ? 26 : 21, warning, duration: 0.6,
  });
}
function createBossLightning(index, warning = bossTelegraphTime()) {
  addBossHazard("zone", { x: player.x, y: player.y, radius: player.height * (boss.enraged ? 0.5 : 0.43), warning, duration: 0.4 });
  if (boss.enraged && index % 2 === 1) addBossHazard("zone", {
    x: clamp(player.x + player.width * 0.8, flightBounds.left, bossPlayerRight()),
    y: clamp(player.y + (player.y < bossArena().y ? 90 : -90), flightBounds.top, flightBounds.bottom),
    radius: player.height * 0.36, warning: warning + 0.18, duration: 0.35,
  });
}
function addBossHazard(kind, options) {
  bossHazards.push({ kind, age: 0, color: boss.color, right: boss.x - boss.width * 0.35, ...options });
}
function addBossProjectile(x, y, vx, vy, options = {}) {
  if (bossProjectiles.length >= bossRules.maxProjectiles) return;
  gameAudio.bossAttack("volley");
  bossProjectiles.push({ x, y, previousX: x, previousY: y, vx, vy, age: 0, radius: 7,
    color: boss ? boss.color : "#ffb66f", ...options });
}
function fireBossArc(count = 11, angleOffset = 0, halfAngle = Math.PI / 2, speed = 350) {
  const radius = boss.width * 0.56;
  const velocity = bossAttackSpeed(speed);
  for (let index = 0; index < count; index++) {
    const angle = angleOffset - halfAngle + halfAngle * 2 * index / (count - 1);
    const dx = -Math.cos(angle), dy = Math.sin(angle);
    addBossProjectile(boss.x + radius * dx, boss.y + radius * dy, velocity * dx, velocity * dy);
  }
}
function fireAimedBossShot(offset = 0, radius = 8) {
  if (boss?.attackIndex === 2 && typeof bossWeaponOnline === "function"
    && !bossWeaponOnline(boss, offset < 0 ? -1 : 1)) return;
  const x = boss.x - boss.width * 0.58, y = boss.y;
  const angle = Math.atan2(player.y - y, player.x - x) + offset;
  const speed = bossAttackSpeed(405);
  addBossProjectile(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, { radius });
}
function fireBossWall(gapY, color = boss.color) {
  const safeGap = Math.max(90, player.height * (boss.enraged ? 1.02 : 1.2));
  const step = Math.max(24, (flightBounds.bottom - flightBounds.top) / 16);
  for (let y = flightBounds.top; y <= flightBounds.bottom + 0.01; y += step) {
    if (Math.abs(y - gapY) < safeGap / 2) continue;
    addBossProjectile(boss.x - boss.width * 0.6, y, -bossAttackSpeed(315), 0, { radius: 7, color });
  }
}
function summonBossEnemy(index, armored = false) {
  if (typeof bossWeaponOnline === "function" && !bossWeaponOnline(boss, 1) && index % 2 === 1) return;
  if (enemies.length >= 9) return;
  gameAudio.bossAttack("summon");
  const lanes = armored ? [0.26, 0.5, 0.74, 0.38, 0.62] : [0.2, 0.36, 0.52, 0.68, 0.8, 0.46];
  const y = flightBounds.top + (flightBounds.bottom - flightBounds.top) * lanes[index % lanes.length];
  const width = player.width * (armored ? 0.52 : 0.43);
  const healthLog = enemyHealthLogForTime() + Math.log(armored ? 1.6 : 1.2);
  const x = boss.x - boss.width * 0.61;
  enemies.push({ x, previousX: x, y, width, height: width * 0.64,
    hp: 1, maxHp: 1, displayHp: 1, healthLog, hitFlash: 0,
    fireProtection: enemyProtectionAtBirth(armored ? "armored" : "scout"),
    speed: enemySpeedForTime() * (armored ? 1 : 0.9), summoned: true });
}
function runBossAttack(seconds) {
  const time = boss.phaseTime;
  const id = boss.type * 3 + boss.attackIndex;
  const rage = boss.enraged;
  const origin = boss.x - boss.width * 0.6;
  if (!boss.attackEvents) boss.attackEvents = Object.create(null);
  // 每条攻击分支独立计数；预警和扫射不会互相抢占、重复触发。
  const pulse = (key, interval, limit, action, start = 0) => {
    if (boss.attackIndex === 2 && typeof bossWeaponOnline === "function"
      && !bossWeaponOnline(boss, -1) && !bossWeaponOnline(boss, 1)) limit = Math.max(1, Math.ceil(limit * 0.55));
    const gap = interval / (rage ? 1.2 : 1);
    let fired = boss.attackEvents[key] || 0;
    while (fired < limit && time + 0.000001 >= start + fired * gap) {
      action(fired++);
    }
    boss.attackEvents[key] = fired;
    boss.fired = Math.max(boss.fired, fired);
  };
  switch (id) {
    case 0:
      pulse("arc", 0.74, rage ? 8 : 6, () => fireBossArc(rage ? 13 : 11));
      pulse("aim", 1.2, 4, () => { fireAimedBossShot(-0.08, 6); fireAimedBossShot(0.08, 6); }, 0.38);
      break;
    case 1: {
      const arena = bossArena();
      boss.y = boss.sweepFrom + (arena.y - boss.sweepFrom) * Math.min(1, time / 4.5);
      pulse("sweep", 0.16, rage ? 35 : 29, () => {
        for (const lane of [-1, 0, 1]) addBossProjectile(origin, boss.y + lane * player.height * 0.25,
          -bossAttackSpeed(430), 0, { radius: 6.5 });
      });
      pulse("aim", 1.3, 4, () => fireAimedBossShot(0, 7), 0.45);
      break;
    }
    case 2:
      pulse("fleet", 0.55, rage ? 7 : 6, index => summonBossEnemy(index));
      pulse("cover", 0.8, 5, () => fireBossArc(3, 0, 0.58, 320), 0.28);
      break;
    case 3:
      pulse("cannon", 0.5, rage ? 11 : 9, () => {
        for (const offset of [-0.3, -0.15, 0, 0.15, 0.3]) fireAimedBossShot(offset, 7);
      });
      break;
    case 4:
      pulse("laser", 1.2, 3, index => createRedBeamGroup(index + 1), 0.42);
      pulse("cover", 1.1, 4, () => fireAimedBossShot(0, 6), 0.65);
      break;
    case 5:
      pulse("core", 0.77, rage ? 6 : 5, index => addBossProjectile(origin,
        clamp(boss.y + Math.sin(index * 1.7) * boss.height * 0.5, flightBounds.top, flightBounds.bottom),
        -bossAttackSpeed(300), 0, { radius: 16, burstAt: 0.95, burstCount: 12, fragmentSpeed: bossAttackSpeed(340) }));
      pulse("aim", 1.3, 3, () => fireAimedBossShot(0, 7), 0.5);
      break;
    case 6:
      pulse("snake", 0.4, rage ? 13 : 11, index => {
        const amplitude = Math.min(48, Math.max(20, player.height * 0.34));
        for (const lane of [-1, 0, 1]) {
          const baseY = boss.y + lane * boss.height * 0.4;
          const phaseOffset = index * 1.5 + lane * 2.1;
          addBossProjectile(origin, baseY + Math.sin(phaseOffset) * amplitude, -bossAttackSpeed(360), 0,
            { zigzag: true, baseY, phaseOffset, amplitude, radius: 6 });
        }
      });
      break;
    case 7:
      pulse("wall", 0.9, rage ? 6 : 5, index => {
        const arena = bossArena();
        const shift = (arena.bottom - arena.top) * (index % 2 ? 0.22 : -0.22);
        fireBossWall(clamp(boss.gapY + shift, arena.top + 25, arena.bottom - 25));
      });
      pulse("side", 1.15, 4, () => fireAimedBossShot(0, 6), 0.48);
      break;
    case 8:
      pulse("lightning", 0.93, rage ? 5 : 4, index => createBossLightning(index + 1), 0.25);
      pulse("aim", 1.2, 3, () => fireBossArc(3, 0, 0.45, 340), 0.6);
      break;
    case 9:
      pulse("bees", 0.47, rage ? 12 : 10, index => {
        for (const side of [-1, 1]) addBossProjectile(origin, boss.y + side * boss.height * 0.22,
          -bossAttackSpeed(330), side * 30, { homing: true, homingUntil: rage ? 1.65 : 1.35,
            turnRate: 1.65, radius: 7, phaseOffset: index });
      });
      break;
    case 10:
      pulse("spiral", 0.35, rage ? 16 : 13, index => fireBossArc(rage ? 7 : 5,
        Math.sin(index * 0.8) * 0.35, 0.88, 330));
      break;
    case 11:
      pulse("guards", 0.72, rage ? 6 : 5, index => summonBossEnemy(index, true));
      pulse("cover", 0.8, 6, () => { fireAimedBossShot(-0.12, 6); fireAimedBossShot(0.12, 6); }, 0.3);
      break;
    case 12:
      pulse("heavy", 0.76, rage ? 7 : 6, index => {
        for (const lane of [-1, 0, 1]) addBossProjectile(origin,
          boss.y + lane * boss.height * 0.4 + (index % 2 ? 18 : -18), -bossAttackSpeed(350), 0,
          { radius: 11, burstAt: index % 2 === 1 ? 1.05 : 0, burstCount: 8,
            fragmentSpeed: bossAttackSpeed(310) });
      });
      break;
    case 13:
      pulse("moving-gap", 0.7, rage ? 8 : 6, index => {
        const arena = bossArena();
        fireBossWall(arena.top + (arena.bottom - arena.top) * (0.5 + Math.sin(index * 0.8) * 0.32));
      });
      break;
    case 14:
      pulse("beam", 1.13, 3, () => addBossHazard("beam", { y: player.y,
        thickness: rage ? 38 : 30, warning: bossTelegraphTime(), duration: 0.65 }), 0.38);
      pulse("pincer", 0.85, 5, () => { fireAimedBossShot(-0.21, 7); fireAimedBossShot(0.21, 7); }, 0.55);
      break;
  }
}
function updateBossProjectiles(seconds) {
  for (let index = bossProjectiles.length - 1; index >= 0; index--) {
    const shot = bossProjectiles[index];
    shot.previousX = shot.x; shot.previousY = shot.y; shot.age += seconds;
    if (shot.homing && shot.age < (shot.homingUntil ?? 1.35)) {
      const targetAngle = Math.atan2(player.y - shot.y, player.x - shot.x);
      let turn = targetAngle - Math.atan2(shot.vy, shot.vx);
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      const maxTurn = seconds * (shot.turnRate ?? 1.65);
      const angle = Math.atan2(shot.vy, shot.vx) + clamp(turn, -maxTurn, maxTurn);
      const speed = Math.hypot(shot.vx, shot.vy);
      shot.vx = Math.cos(angle) * speed; shot.vy = Math.sin(angle) * speed;
    }
    shot.x += shot.vx * seconds;
    shot.y = shot.zigzag ? shot.baseY + Math.sin(shot.age * 5 + shot.phaseOffset) * (shot.amplitude ?? 38) : shot.y + shot.vy * seconds;
    if (shot.burstAt && shot.age >= shot.burstAt) {
      bossProjectiles.splice(index, 1);
      gameAudio.bossAttack("burst");
      const count = shot.burstCount || 12;
      const speed = shot.fragmentSpeed || bossAttackSpeed(330);
      for (let part = 0; part < count; part++) {
        const angle = part * Math.PI * 2 / count;
        addBossProjectile(shot.x, shot.y, Math.cos(angle) * speed, Math.sin(angle) * speed, { radius: 6, color: shot.color });
      }
    } else if (shot.x < -40 || shot.x > viewport.width + 40 || shot.y < -40 || shot.y > viewport.height + 40 || shot.age > 12) {
      bossProjectiles.splice(index, 1);
    }
  }
  for (let index = bossHazards.length - 1; index >= 0; index--) {
    const hazard = bossHazards[index];
    const wasWarning = hazard.age < hazard.warning;
    hazard.age += seconds;
    if (wasWarning && hazard.age >= hazard.warning) gameAudio.bossAttack("beam");
    if (hazard.age >= hazard.warning + hazard.duration) bossHazards.splice(index, 1);
  }
}
function updateBossEncounter(seconds) {
  if (!isBattleActive()) return;
  bossHitGrace = Math.max(0, bossHitGrace - seconds);
  updateBossProjectiles(seconds);
  if (duoEncounter && boss) { updateDuoEncounter(seconds); return; }
  if (!boss) {
    if (battleTime >= nextBossTime - bossRules.warning) {
      if (pendingBossType === null) {
        pendingBossType = chooseBossType();
        pendingWingType = bossDefeated >= duoRules.afterDefeats ? chooseBossPartner(pendingBossType) : null;
        enemies.length = 0; resetEnemyCombat(false);
        gameAudio.warning();
      }
      const names = bossTypeName(pendingBossType) + (pendingWingType === null ? "" : " × " + bossTypeName(pendingWingType));
      setBossWarning(names);
      const arrivalSeconds = Math.max(0, Math.ceil(nextBossTime - battleTime));
      const arrival = pendingWingType === null ? tr("旗舰接近", "Flagship incoming") : tr("双舰协同接近", "Boss duo incoming");
      setBossMessage(names, arrival + " · " + tr(arrivalSeconds + " 秒后抵达", "ETA " + arrivalSeconds + " s"));
      if (battleTime >= nextBossTime) spawnBoss(pendingBossType, pendingWingType);
    }
    return;
  }
  boss.age += seconds;
  boss.phaseTime += seconds;
  boss.previousX = boss.x;
  boss.previousY = boss.y;
  boss.hitFlash = Math.max(0, boss.hitFlash - seconds);
  boss.displayHp += (boss.hp - boss.displayHp) * (reducedMotion.matches ? 1 : 1 - Math.exp(-seconds * 12));
  const arena = bossArena();
  if (boss.phase === "enter") {
    const progress = Math.min(1, boss.phaseTime / bossRules.entry);
    boss.x = viewport.width + boss.width / 2 + (arena.x - viewport.width - boss.width / 2) * (1 - Math.pow(1 - progress, 3));
    if (progress === 1) { boss.phase = "recover"; boss.phaseTime = 0; }
  } else if (boss.phase === "recover") {
    boss.y += (arena.y - boss.y) * Math.min(1, seconds * 6);
    if (boss.phaseTime >= (boss.enraged ? 0.4 : bossRules.recovery)) { boss.y = arena.y; startBossAttack(); }
  } else if (boss.phase === "telegraph") {
    if (boss.type === 0 && boss.attackIndex === 1) boss.y += (boss.sweepFrom - boss.y) * Math.min(1, seconds * 7);
    if (boss.phaseTime >= (boss.telegraphDuration ?? bossTelegraphTime())) { boss.phase = "attack"; boss.phaseTime = 0; }
  } else {
    runBossAttack(seconds);
    if (boss.phaseTime >= (boss.type === 0 && boss.attackIndex === 1 ? 4.8 : 4.5)) {
      boss.phase = "recover"; boss.phaseTime = 0;
    }
  }
}
function bossCanTakeDamage(target = boss) { return !!target && activeBosses().includes(target) && target.phase !== "enter"; }
const bossFireProtection = { hit: 0.05, burst: 0.06, refill: 0.10 };

function applyBossHit(shot, target = boss, component = null) {
  if (!bossCanTakeDamage(target)) return;
  const before = target.hp;
  const damageLog = shot.damageLog ?? Math.log(shot.damage ?? weapon.damage);
  const fraction = shot.source === "ultimate"
    ? Math.exp(Math.min(Math.log(ultimateRules.bossDamageCap), damageLog - target.healthLog))
    : progressionHitFraction(target, damageLog, bossFireProtection);
  if (fraction <= 0) return;
  const hitsComponent = component && !component.destroyed && target.components?.includes(component)
    && shot.source !== "ultimate" && shot.source !== "blast";
  target.hp = Math.max(0, target.hp - fraction * (hitsComponent ? bossComponentRules.hullTransfer : 1));
  if (hitsComponent) damageBossComponent(target, component, fraction);
  target.hitFlash = 0.08;
  recordCombatImpact(target, shot, true);
  if (!shot.noEnergy && shot.source !== "ultimate" && shot.source !== "blast") gainUltimateEnergy(before - target.hp, "boss");
  if (target.hp <= 0.000000000001) { defeatBoss(target); return; }
  else if (target.hp <= 0.5 && !target.enraged) {
    target.enraged = true;
    gameAudio.bossEnrage();
    if (!duoEncounter) setBossMessage(target.name, tr("狂暴模式 · 攻势加速，保持移动", "Enraged · Attacks speed up. Keep moving."));
    statusMessage.textContent = tr(target.name + "进入狂暴模式。", target.name + " is enraged. ") + (duoEncounter
      ? tr("协同攻击仍保留安全通道和反击空档。", "Coordinated attacks still leave a safe lane and openings to strike.")
      : tr("弹幕速度和密度提升。", "Projectiles are faster and denser."));
  }
}
function defeatBoss(target = boss) {
  if (!target || !activeBosses().includes(target)) return;
  const fallen = target;
  if (target === boss) { boss = wingBoss; wingBoss = null; } else wingBoss = null;
  bossDefeated++;
  score += 2000; kills++;
  registerMomentumKill();
  scoreDisplay.textContent = String(score).padStart(6, "0");
  createExplosion(fallen, 2000);
  player.lives = Math.min(playerRules.maxLives, player.lives + 1); updateLifeDisplay();
  bossProjectiles.length = 0; bossHazards.length = 0; enemies.length = 0; resetEnemyCombat(false);
  bossHitGrace = boss ? duoRules.breakRecovery : 1.5;
  setBossWarning();
  for (const [index, type] of ["blue", "yellow", "red"].entries()) {
    powerups.push({ x: fallen.x, previousX: fallen.x, y: clamp(fallen.y + (index - 1) * 75, flightBounds.top, flightBounds.bottom), radius: powerupRules.radius, type });
  }
  powerupNotice.textContent = tr(fallen.name + "已击破 · +2000分 · 恢复1点生命", fallen.name + " defeated · +2,000 points · +1 life");
  powerupNotice.dataset.type = "yellow"; powerupNotice.hidden = false; upgradeNoticeTime = 3;
  statusMessage.textContent = powerupNotice.textContent;
  if (boss) { startDuoRecovery(duoRules.breakRecovery); return; }
  resetDuoEncounter();
  nextBossTime = battleTime + bossRules.interval; enemyCooldown = 2;
  setBossMessage("", "", false);
  startBossDeathPresentation(fallen);
}
function bossShotHitsPlayer(shot) {
  if (consumeEvolutionShieldProjectile(shot)) return true;
  const radius = player.height * 0.16 + shot.radius;
  const dx = shot.x - shot.previousX, dy = shot.y - shot.previousY;
  const distance = dx * dx + dy * dy;
  const progress = distance ? clamp(((player.x - shot.previousX) * dx + (player.y - shot.previousY) * dy) / distance, 0, 1) : 0;
  return Math.hypot(player.x - shot.previousX - progress * dx, player.y - shot.previousY - progress * dy) <= radius;
}
function updateBossDamage() {
  if (!isBattleActive()) return;
  let hit = false;
  for (let index = bossProjectiles.length - 1; index >= 0; index--) {
    if (bossShotHitsPlayer(bossProjectiles[index])) { bossProjectiles.splice(index, 1); hit = true; }
  }
  if (hit) tryPerfectShield();
  for (const hazard of bossHazards) {
    if (hazard.age < hazard.warning) continue;
    if (hazard.kind === "beam") {
      if (player.x < hazard.right && Math.abs(player.y - hazard.y) < hazard.thickness / 2 + player.height * 0.16) hit = true;
    } else if (Math.hypot(player.x - hazard.x, player.y - hazard.y) < hazard.radius + player.height * 0.16) hit = true;
  }
  if (hit) damagePlayer(tr("被 Boss 攻击命中", "Hit by a boss attack"));
}
function drawBossBattle() {
  drawDuoGuidance();
  if (typeof drawBossComponentWrecks === "function") drawBossComponentWrecks(context, reducedMotion.matches);
  for (const hazard of bossHazards) {
    if (hazard.duo && hazard.kind === "beam") { drawDuoBeam(hazard); continue; }
    const active = hazard.age >= hazard.warning;
    context.save();
    context.strokeStyle = hazard.color;
    context.fillStyle = hazard.color;
    context.globalAlpha = active ? 0.85 : 0.65;
    context.lineWidth = active ? 3 : 2;
    context.shadowColor = hazard.color;
    context.shadowBlur = reducedMotion.matches ? 0 : active ? 22 : 7;
    if (hazard.kind === "beam") {
      context.globalAlpha = active ? 0.75 : 0.13;
      context.fillRect(0, hazard.y - hazard.thickness / 2, hazard.right, hazard.thickness);
      context.globalAlpha = active ? 0.95 : 0.75;
      if (!active) context.setLineDash([10, 7]);
      context.beginPath(); context.moveTo(0, hazard.y); context.lineTo(hazard.right, hazard.y); context.stroke();
      if (active) {
        context.shadowBlur = 0;
        context.fillStyle = "#fff4dd";
        context.fillRect(0, hazard.y - hazard.thickness * 0.13, hazard.right, hazard.thickness * 0.26);
      } else {
        context.setLineDash([]);
        const offset = reducedMotion.matches ? 0 : (hazard.age * 65) % 55;
        for (let x = 18 + offset; x < hazard.right; x += 55) {
          context.beginPath(); context.moveTo(x + 7, hazard.y - 6);
          context.lineTo(x, hazard.y); context.lineTo(x + 7, hazard.y + 6); context.stroke();
        }
      }
    } else {
      if (!active) context.setLineDash([7, 5]);
      context.beginPath(); context.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2);
      if (active) context.fill(); else context.stroke();
      context.setLineDash([]);
      context.globalAlpha = active ? 0.9 : 0.65;
      context.beginPath(); context.arc(hazard.x, hazard.y, hazard.radius * (active ? 0.44 : 1.12),
        -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, hazard.age / hazard.warning)); context.stroke();
      context.beginPath(); context.moveTo(hazard.x - 10, hazard.y); context.lineTo(hazard.x + 10, hazard.y);
      context.moveTo(hazard.x, hazard.y - 10); context.lineTo(hazard.x, hazard.y + 10); context.stroke();
    }
    context.restore();
  }
  for (const target of activeBosses()) {
    drawBossShip(context, target, reducedMotion.matches);
    const width = target.width * 0.85, y = target.y - target.height * 0.58 - 9;
    context.save(); context.fillStyle = "#111c30"; context.beginPath();
    context.roundRect(target.x - width / 2, y, width, 7, 3.5); context.fill();
    const filled = width * clamp(target.displayHp, 0, 1);
    if (filled > 0) {
      context.fillStyle = target.color; context.beginPath();
      context.roundRect(target.x - width / 2, y, filled, 7, Math.min(3.5, filled / 2)); context.fill();
    }
    context.restore();
  }
  for (const shot of bossProjectiles) {
    context.save(); context.fillStyle = shot.color; context.strokeStyle = shot.color; context.shadowColor = shot.color;
    const dx = shot.x - shot.previousX, dy = shot.y - shot.previousY;
    const length = Math.hypot(dx, dy);
    const speed = Math.hypot(shot.vx, shot.vy) || 1;
    const directionX = length ? dx / length : shot.vx / speed;
    const directionY = length ? dy / length : shot.vy / speed;
    if (!reducedMotion.matches) {
      context.globalAlpha = 0.42;
      context.lineWidth = shot.radius * 1.1;
      context.lineCap = "round";
      context.beginPath(); context.moveTo(shot.x, shot.y);
      context.lineTo(shot.x - directionX * shot.radius * 4, shot.y - directionY * shot.radius * 4); context.stroke();
      context.globalAlpha = 1;
    }
    context.shadowBlur = reducedMotion.matches ? 0 : shot.burstAt ? 22 : 13;
    context.beginPath(); context.arc(shot.x, shot.y, shot.radius, 0, Math.PI * 2); context.fill();
    context.shadowBlur = 0; context.fillStyle = "#f4f7ff";
    context.beginPath(); context.arc(shot.x, shot.y, shot.radius * 0.4, 0, Math.PI * 2); context.fill();
    if (shot.burstAt) {
      context.strokeStyle = "#ffe5b3";
      context.lineWidth = 1.5;
      context.globalAlpha = 0.85;
      context.beginPath(); context.arc(shot.x, shot.y, shot.radius * 1.48, 0, Math.PI * 2); context.stroke();
      const rotation = reducedMotion.matches ? 0 : shot.age * 2;
      for (let index = 0; index < 6; index++) {
        const angle = rotation + index * Math.PI / 3;
        context.beginPath();
        context.moveTo(shot.x + Math.cos(angle) * shot.radius * 1.35, shot.y + Math.sin(angle) * shot.radius * 1.35);
        context.lineTo(shot.x + Math.cos(angle) * shot.radius * 1.8, shot.y + Math.sin(angle) * shot.radius * 1.8); context.stroke();
      }
    }
    context.restore();
  }
  if (bossHitGrace > 0 && boss && state === "battle") {
    context.save(); context.strokeStyle = "#c5e7ff"; context.globalAlpha = 0.45;
    context.lineWidth = 1.5; context.beginPath(); context.arc(player.x, player.y, player.height * 0.21, 0, Math.PI * 2); context.stroke(); context.restore();
  }
}
