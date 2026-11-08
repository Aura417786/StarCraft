"use strict";

// 王牌只有固定出生血量；真正的交锋节奏来自有限闪避、锁线突进和反击空档。
const aceRules = { firstArrival: 36, interval: 65, warning: 1.35, lifetime: 20,
  strafe: 1.9, feint: 0.9, dash: 0.52, fire: 0.8, recover: 1.4, retreat: 1.0,
  dodgeCooldown: 1.9, dodgeSpeed: 175, moveSpeed: 205, dashSpeed: 410 };
const aceEncounter = { nextTime: 36, warning: 0, target: null, warningY: 0,
  sequence: 0, notice: "", noticeTime: 0 };

function clearAceProjectiles() {
  for (let index = enemyProjectiles.length - 1; index >= 0; index--) {
    if (enemyProjectiles[index].source === "ace") enemyProjectiles.splice(index, 1);
  }
}
function resetAceEncounter() {
  clearAceProjectiles();
  for (let index = enemies.length - 1; index >= 0; index--) {
    if (enemies[index].kind === "ace") enemies.splice(index, 1);
  }
  Object.assign(aceEncounter, { nextTime: aceRules.firstArrival, warning: 0, target: null,
    warningY: 0, sequence: 0, notice: "", noticeTime: 0 });
}
function aceBlocksWaves() {
  return aceEncounter.warning > 0 || !!aceEncounter.target && enemies.includes(aceEncounter.target);
}
function aceBossIsNear() {
  return bossBlocksWaves() || (typeof wingBoss !== "undefined" && !!wingBoss)
    || (typeof duoEncounter !== "undefined" && !!duoEncounter)
    || battleTime >= nextBossTime - bossRules.warning - aceRules.retreat - 0.25;
}
function aceHasEncounterConflict() {
  return aceBossIsNear()
    || (typeof gravityTideBusy === "function" && gravityTideBusy())
    || (typeof formationState !== "undefined" && (!!formationState.warning || !!formationState.active))
    || (typeof battlefieldEventBlocksWaves === "function" && battlefieldEventBlocksWaves())
    || (typeof battlefieldEvents !== "undefined" && !!battlefieldEvents.transportWarning);
}
function announceAce(text, duration = 2.5) {
  aceEncounter.notice = text; aceEncounter.noticeTime = duration;
  statusMessage.textContent = text;
}
function aceArena(enemy) {
  const top = Math.max(enemy.height * 0.55 + 10, flightBounds.top);
  const bottom = Math.max(top, Math.min(viewport.height - enemy.height * 0.55 - 10, flightBounds.bottom));
  const right = Math.max(enemy.width * 0.6, viewport.width - enemy.width * 0.6 - 14);
  const left = Math.min(right, Math.max(enemy.width * 0.6 + 12, viewport.width * 0.47));
  return { top, bottom, left, right };
}
function aceSetPhase(enemy, phase) {
  enemy.acePhase = phase; enemy.acePhaseTime = 0;
}
function aceMoveTo(enemy, x, y, speed, seconds) {
  const dx = x - enemy.x, dy = y - enemy.y, distance = Math.hypot(dx, dy);
  const step = Math.min(distance, speed * seconds);
  if (distance > 0) { enemy.x += dx / distance * step; enemy.y += dy / distance * step; }
  return distance <= Math.max(1, speed * seconds);
}
function spawnAceEnemy() {
  if (aceHasEncounterConflict() || enemies.length >= enemyRules.maxOnScreen) return null;
  const width = player.width * 0.8, height = width * 0.58;
  const enemy = { kind: "ace", width, height, x: viewport.width + width * 0.6,
    y: aceEncounter.warningY, previousX: viewport.width + width * 0.6, previousY: aceEncounter.warningY,
    hp: 1, maxHp: 1, displayHp: 1, hitFlash: 0, points: 800,
    healthLog: Math.max(enemyHealthLogForTime() + Math.log(3),
      weaponDamageLog() + Math.log(weapon.lanes / weapon.interval) + Math.log(4.5)),
    age: 0, speed: aceRules.moveSpeed, acePhase: "entry", acePhaseTime: 0,
    aceCycle: 0, aceDodgeCooldown: 0.85, aceDodgeTime: 0, aceSettled: false,
    aceRoute: null, aceAim: null };
  const arena = aceArena(enemy);
  enemy.y = enemy.previousY = clamp(enemy.y, arena.top, arena.bottom);
  enemy.aceAnchorX = clamp(viewport.width * 0.81, arena.left, arena.right);
  enemy.aceAnchorY = enemy.y;
  enemy.aceTargetX = enemy.aceAnchorX; enemy.aceTargetY = enemy.y;
  enemies.push(enemy); aceEncounter.target = enemy; aceEncounter.sequence++;
  announceAce("敌方王牌进入战区 · 追踪闪避后的航线，抓住冷却空档", 3.5);
  return enemy;
}
function finishAceEncounter(enemy, defeated = false, announce = true) {
  if (!enemy || enemy.aceSettled) return false;
  enemy.aceSettled = true;
  if (aceEncounter.target === enemy) aceEncounter.target = null;
  aceEncounter.warning = 0; aceEncounter.nextTime = battleTime + aceRules.interval;
  clearAceProjectiles();
  if (announce) announceAce(defeated ? "王牌击落 · +800" : "敌方王牌脱离战区", 2.5);
  return true;
}
function onAceDefeated(enemy) {
  if (enemy?.kind !== "ace") return false;
  // 分数、击杀和爆炸仍由 defeatEnemy 统一结算，本钩子只结算遭遇一次。
  return finishAceEncounter(enemy, true);
}
function beginAceRetreat(enemy, bossApproaching = false) {
  if (enemy.acePhase === "retreat") return;
  aceSetPhase(enemy, "retreat"); enemy.aceRoute = null; enemy.aceAim = null;
  enemy.aceDodgeTime = 0; clearAceProjectiles();
  if (!bossApproaching) announceAce("王牌正在撤离 · 最后一次集火机会", 1);
}
function removeEscapedAce(enemy) {
  const index = enemies.indexOf(enemy);
  if (index >= 0) enemies.splice(index, 1);
  finishAceEncounter(enemy, false, !aceBossIsNear());
}
function updateAceEncounter(seconds) {
  if (!isBattleActive() || seconds <= 0) return;
  aceEncounter.noticeTime = Math.max(0, aceEncounter.noticeTime - seconds);
  const enemy = aceEncounter.target;
  if (enemy && !enemies.includes(enemy)) finishAceEncounter(enemy, false, false);
  if (aceBossIsNear()) {
    if (aceEncounter.warning > 0) {
      aceEncounter.warning = 0; aceEncounter.nextTime = battleTime + aceRules.interval;
    }
    if (aceEncounter.target) beginAceRetreat(aceEncounter.target, true);
    clearAceProjectiles();
    return;
  }
  if (aceEncounter.target) return;
  if (aceEncounter.warning > 0) {
    if (aceHasEncounterConflict()) {
      aceEncounter.warning = 0; aceEncounter.nextTime = battleTime + 3; return;
    }
    aceEncounter.warning = Math.max(0, aceEncounter.warning - seconds);
    if (aceEncounter.warning <= 0 && !spawnAceEnemy()) aceEncounter.nextTime = battleTime + 3;
    return;
  }
  if (battleTime < aceEncounter.nextTime || aceHasEncounterConflict()) return;
  if (enemies.length >= enemyRules.maxOnScreen || viewport.width < 420 || viewport.height < 320) {
    aceEncounter.nextTime = battleTime + 3; return;
  }
  aceEncounter.warning = aceRules.warning;
  const lane = aceEncounter.sequence % 2 ? 0.7 : 0.3;
  aceEncounter.warningY = flightBounds.top + (flightBounds.bottom - flightBounds.top) * lane;
  announceAce("敌方王牌接近 · 短暂闪避后会露出反击空档", aceRules.warning + 1.5);
}

function aceVisibleIncomingBullet(enemy) {
  for (const bullet of bullets) {
    if (bullet.x < 0 || bullet.x > viewport.width || bullet.y < 0 || bullet.y > viewport.height) continue;
    const vx = bullet.vx ?? weapon.speed;
    if (vx <= 0 || bullet.x >= enemy.x - enemy.width * 0.22) continue;
    const eta = (enemy.x - enemy.width * 0.42 - bullet.x) / vx;
    if (eta < 0.08 || eta > 0.43) continue;
    const projectedY = bullet.y + (bullet.vy ?? 0) * eta;
    if (Math.abs(projectedY - enemy.y) < enemy.height * 0.4 + (bullet.halfHeight ?? 3)) return bullet;
  }
  return null;
}
function aceTryDodge(enemy, arena) {
  if (enemy.aceDodgeCooldown > 0 || enemy.aceDodgeTime > 0 || !aceVisibleIncomingBullet(enemy)) return;
  const roomUp = enemy.y - arena.top, roomDown = arena.bottom - enemy.y;
  const direction = roomUp < 40 ? 1 : roomDown < 40 ? -1
    : player.y <= enemy.y ? 1 : -1;
  const target = clamp(enemy.y + direction * Math.min(68, (arena.bottom - arena.top) * 0.22), arena.top, arena.bottom);
  if (Math.abs(target - enemy.y) < 20) return;
  enemy.aceTargetY = target; enemy.aceDodgeTime = 0.42;
  enemy.aceDodgeCooldown = aceRules.dodgeCooldown;
}
function beginAceFeint(enemy, arena) {
  enemy.aceRoute = null; enemy.aceAim = null;
  const safety = Math.max(140, player.width * 1.2);
  const desired = Math.min(aceRules.dashSpeed * aceRules.dash, viewport.width * 0.16);
  // 矮窗没有额外机动层，不安排突进。终点同时受水平净距和完整机身约束。
  if (arena.bottom - arena.top >= Math.max(150, enemy.height * 2.2)) {
    const endX = Math.max(arena.left, player.x + safety, enemy.x - desired);
    const direction = enemy.y < (arena.top + arena.bottom) / 2 ? 1 : -1;
    const endY = clamp(enemy.y + direction * Math.min(48, (arena.bottom - arena.top) * 0.12), arena.top, arena.bottom);
    if (enemy.x - endX >= 50 && Math.hypot(endX - player.x, endY - player.y) >= safety) {
      enemy.aceRoute = { startX: enemy.x, startY: enemy.y, endX, endY,
        playerX: player.x, playerY: player.y };
    }
  }
  if (!enemy.aceRoute) { beginAceFire(enemy); return; }
  aceSetPhase(enemy, "feint");
}
function aceDashRemainsSafe(enemy) {
  const route = enemy.aceRoute;
  if (!route) return false;
  const safety = Math.max(140, player.width * 1.2);
  if (Math.hypot(route.endX - player.x, route.endY - player.y) < safety) return false;
  // 玩家在预警期间主动进入已锁航线时取消突进，不追踪修改路线。
  const dx = route.endX - route.startX, dy = route.endY - route.startY;
  const length = dx * dx + dy * dy;
  const t = length ? clamp(((player.x - route.startX) * dx + (player.y - route.startY) * dy) / length, 0, 1) : 0;
  return Math.hypot(route.startX + dx * t - player.x, route.startY + dy * t - player.y)
    > Math.max(85, player.width * 0.55 + enemy.width * 0.42);
}
function beginAceFire(enemy) {
  enemy.aceRoute = null;
  const muzzleX = enemy.x - enemy.width * 0.5;
  const dx = player.x - muzzleX, dy = player.y - enemy.y, distance = Math.hypot(dx, dy);
  if (dx >= -55 || distance < Math.max(140, player.width * 1.2)) {
    enemy.aceAim = null; aceSetPhase(enemy, "recover"); return;
  }
  const spread = clamp(Math.atan2(player.height * 0.4 + 22, distance), 0.12, 0.32);
  const offsets = enemy.aceCycle % 2 ? [-spread, spread, spread * 1.85] : [-spread, spread];
  enemy.aceAim = { x: player.x, y: player.y, angle: Math.atan2(dy, dx), offsets };
  aceSetPhase(enemy, "fire");
}
function fireAceVolley(enemy) {
  const aim = enemy.aceAim;
  if (!aim) return;
  const x = enemy.x - enemy.width * 0.5, y = enemy.y;
  if (player.x >= x - 55 || Math.hypot(player.x - x, player.y - y) < Math.max(140, player.width * 1.2)) return;
  const speed = Math.min(340, 275 + battleTime * 0.08);
  let fired = false;
  for (const offset of aim.offsets) {
    if (enemyProjectiles.length >= enemyCombatRules.maxProjectiles) break;
    const angle = aim.angle + offset;
    enemyProjectiles.push({ source: "ace", x, y, previousX: x, previousY: y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 5, age: 0 });
    fired = true;
  }
  if (fired) gameAudio.bossAttack("volley");
}
function updateAceMovement(enemy, seconds) {
  if (enemy.kind !== "ace") return false;
  enemy.previousX = enemy.x; enemy.previousY = enemy.y;
  if (!isBattleActive() || seconds <= 0 || enemy.aceSettled) return true;
  enemy.age += seconds; enemy.acePhaseTime += seconds;
  enemy.aceDodgeCooldown = Math.max(0, enemy.aceDodgeCooldown - seconds);
  const arena = aceArena(enemy);
  if (aceBossIsNear() || enemy.age >= aceRules.lifetime - aceRules.retreat) beginAceRetreat(enemy, aceBossIsNear());
  if (enemy.acePhase === "retreat") {
    enemy.x += Math.min(360, aceRules.moveSpeed * 1.65) * seconds;
    if (enemy.acePhaseTime >= aceRules.retreat || enemy.x - enemy.width / 2 > viewport.width) removeEscapedAce(enemy);
  } else if (enemy.acePhase === "entry") {
    if (aceMoveTo(enemy, enemy.aceAnchorX, enemy.aceAnchorY, aceRules.moveSpeed * 1.2, seconds)) aceSetPhase(enemy, "strafe");
  } else if (enemy.acePhase === "strafe") {
    aceTryDodge(enemy, arena);
    if (enemy.aceDodgeTime > 0) {
      enemy.aceDodgeTime = Math.max(0, enemy.aceDodgeTime - seconds);
      aceMoveTo(enemy, enemy.aceAnchorX, enemy.aceTargetY, aceRules.dodgeSpeed, seconds);
    } else {
      const span = arena.bottom - arena.top;
      const targetY = clamp(enemy.aceAnchorY + Math.sin(enemy.age * 1.5) * Math.min(46, span * 0.12), arena.top, arena.bottom);
      aceMoveTo(enemy, enemy.aceAnchorX, targetY, aceRules.moveSpeed * 0.48, seconds);
    }
    if (enemy.acePhaseTime >= aceRules.strafe) beginAceFeint(enemy, arena);
  } else if (enemy.acePhase === "feint") {
    if (enemy.acePhaseTime >= aceRules.feint) {
      if (aceDashRemainsSafe(enemy)) aceSetPhase(enemy, "dash");
      else { enemy.aceRoute = null; beginAceFire(enemy); }
    }
  } else if (enemy.acePhase === "dash") {
    const route = enemy.aceRoute;
    if (!aceDashRemainsSafe(enemy)) {
      enemy.aceRoute = null; enemy.aceAim = null; aceSetPhase(enemy, "recover");
    } else if (!route || aceMoveTo(enemy, route.endX, route.endY, aceRules.dashSpeed, seconds)
        || enemy.acePhaseTime >= aceRules.dash) beginAceFire(enemy);
  } else if (enemy.acePhase === "fire") {
    if (enemy.acePhaseTime >= aceRules.fire) {
      fireAceVolley(enemy); enemy.aceAim = null; aceSetPhase(enemy, "recover");
    }
  } else if (enemy.acePhase === "recover" && enemy.acePhaseTime >= aceRules.recover) {
    enemy.aceCycle++;
    enemy.aceAnchorY = clamp(arena.top + (arena.bottom - arena.top) * (enemy.aceCycle % 2 ? 0.7 : 0.3), arena.top, arena.bottom);
    enemy.aceAnchorX = clamp(viewport.width * 0.81, arena.left, arena.right);
    aceSetPhase(enemy, "strafe");
  }
  return true;
}

// 调用者已映射普通 x/y；这里只映射王牌独有的锚点，绝不重建生命值。
function resizeAceEncounter(scaleX, scaleY, mapY) {
  clearAceProjectiles();
  if (Number.isFinite(aceEncounter.warningY)) aceEncounter.warningY = mapY(aceEncounter.warningY);
  const enemy = aceEncounter.target;
  if (!enemy || !enemies.includes(enemy)) return;
  for (const key of ["aceAnchorX", "aceTargetX"]) if (Number.isFinite(enemy[key])) enemy[key] *= scaleX;
  for (const key of ["aceAnchorY", "aceTargetY"]) if (Number.isFinite(enemy[key])) enemy[key] = mapY(enemy[key]);
  enemy.width = player.width * 0.8; enemy.height = enemy.width * 0.58;
  const arena = aceArena(enemy);
  enemy.x = clamp(enemy.x, arena.left, arena.right); enemy.y = clamp(enemy.y, arena.top, arena.bottom);
  enemy.aceAnchorX = clamp(enemy.aceAnchorX, arena.left, arena.right);
  enemy.aceAnchorY = clamp(enemy.aceAnchorY, arena.top, arena.bottom);
  enemy.aceTargetY = clamp(enemy.aceTargetY, arena.top, arena.bottom);
  enemy.previousX = enemy.x; enemy.previousY = enemy.y;
  // 旧航线和瞄准一并作废；留出完整冷却，再从新场地重新预警。
  enemy.aceRoute = null; enemy.aceAim = null; enemy.aceDodgeTime = 0;
  enemy.aceDodgeCooldown = Math.max(enemy.aceDodgeCooldown, 0.85);
  if (enemy.acePhase !== "retreat") aceSetPhase(enemy, "recover");
}

function drawAceThreats(ctx = context) {
  if (state !== "battle") return;
  const enemy = aceEncounter.target && enemies.includes(aceEncounter.target) ? aceEncounter.target : null;
  if (!enemy && aceEncounter.warning <= 0 && aceEncounter.noticeTime <= 0) return;
  ctx.save();
  if (aceEncounter.warning > 0) {
    ctx.strokeStyle = "#ffd391"; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.65;
    ctx.setLineDash([8, 10]);
    ctx.beginPath(); ctx.moveTo(viewport.width - 12, aceEncounter.warningY);
    ctx.lineTo(viewport.width * 0.72, aceEncounter.warningY); ctx.stroke(); ctx.setLineDash([]);
  }
  if (enemy) {
    const recover = enemy.acePhase === "recover";
    ctx.strokeStyle = recover ? "#97ecd4" : "#ffd391"; ctx.lineWidth = recover ? 1.8 : 1.1;
    ctx.globalAlpha = recover ? 0.85 : 0.48;
    ctx.beginPath(); ctx.ellipse(enemy.x, enemy.y, enemy.width * 0.56, enemy.height * 0.63, 0, 0, Math.PI * 2); ctx.stroke();
    if (enemy.acePhase === "feint" && enemy.aceRoute) {
      const route = enemy.aceRoute;
      ctx.globalAlpha = 0.07 + Math.min(1, enemy.acePhaseTime / aceRules.feint) * 0.08;
      ctx.strokeStyle = "#ffb765"; ctx.lineWidth = enemy.height * 0.78;
      ctx.beginPath(); ctx.moveTo(route.startX, route.startY); ctx.lineTo(route.endX, route.endY); ctx.stroke();
      ctx.globalAlpha = 0.8; ctx.lineWidth = 1.5; ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.moveTo(route.startX, route.startY); ctx.lineTo(route.endX, route.endY); ctx.stroke();
      ctx.setLineDash([]); ctx.beginPath(); ctx.arc(route.endX, route.endY, 8, 0, Math.PI * 2); ctx.stroke();
    }
    if (enemy.acePhase === "fire" && enemy.aceAim) {
      const aim = enemy.aceAim, muzzleX = enemy.x - enemy.width * 0.5;
      ctx.strokeStyle = "#ffb58e"; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.62; ctx.setLineDash([5, 8]);
      for (const offset of aim.offsets) {
        const angle = aim.angle + offset;
        ctx.beginPath(); ctx.moveTo(muzzleX, enemy.y);
        ctx.lineTo(muzzleX + Math.cos(angle) * viewport.width, enemy.y + Math.sin(angle) * viewport.width); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }
  // 独立的一行状态提示，避开机体血条与底部姿态/大招控件。
  const phaseHints = { entry: "王牌入场 · 跟随航线集火", strafe: "王牌侧移 · 闪避后仍有追击机会",
    feint: "王牌锁线 · 离开橙色突进航线", dash: "王牌突进 · 随后准备反击",
    fire: "王牌蓄射 · 虚线之间留有空隙", recover: "王牌冷却 · 现在集中火力", retreat: "王牌撤离 · 最后一次集火机会" };
  const hint = aceEncounter.warning > 0 ? "敌方王牌接近 · 观察机动，抓住冷却空档"
    : enemy ? phaseHints[enemy.acePhase] : aceEncounter.notice;
  if (hint && !bossBlocksWaves()) {
    ctx.globalAlpha = enemy || aceEncounter.warning > 0 ? 0.94 : Math.min(0.94, aceEncounter.noticeTime);
    ctx.fillStyle = enemy?.acePhase === "recover" ? "#b1ffe3" : "#ffe3ad";
    ctx.font = `${viewport.width < 620 ? 11 : 12}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const y = Math.max(106, flightBounds.top - player.height * 0.43);
    ctx.fillText(hint, viewport.width / 2, Math.min(viewport.height - 100, y), Math.max(200, viewport.width - 40));
  }
  ctx.restore();
}
