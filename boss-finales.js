"use strict";

// Identity, second health pool, recovery cadence and the counter visible in the HUD.
const bossFinaleStages = [
  { mode: "egg", hp: .72, interval: 4.40, name: ["深渊胚卵", "Abyssal Egg"], hint: ["进入青色泄压带，浪峰过后打击卵壳", "Enter the cyan relief lane, then fire after the crest"] },
  { mode: "bones", hp: .48, interval: 3.40, name: ["髓骨祭骸", "Marrow Reliquary"], hint: ["打断上下两根发光骨柱，削弱骨矛齐射", "Break both marrow anchors to reduce the spear volleys"] },
  { mode: "furnace", hp: .53, interval: 3.55, name: ["无壳炉心", "Uncased Furnace"], hint: ["躲过熔炉喷口，趁蓝色冷却裂纹亮起集火", "Escape the vents and strike during blue cooldown"] },
  { mode: "web", hp: .46, interval: 3.60, name: ["断弦织心", "Unstrung Heart"], hint: ["穿过青色断弦结，打开织心外壳", "Cross the cyan knot to unravel the heart's armor"] },
  { mode: "claws", hp: .52, interval: 3.70, name: ["双螯断锁", "Double Lock"], hint: ["螯壁从上下合拢，沿中间缺口突入反击", "Meet the two claws at their gap, then counter"] },
  { mode: "mirror", hp: .44, interval: 3.45, name: ["镜棺回照", "Mirror Sepulcher"], hint: ["瞄准带菱形标记的真像，留意诱饵反射", "Aim at the marked reflection and watch decoy rebounds"] },
  { mode: "coil", hp: .57, interval: 3.52, name: ["沉雷断尾", "Severed Thunder"], hint: ["绕过扩张的电环，追打游走的断尾", "Clear the expanding electrical ring and track the tail"] },
  { mode: "spores", hp: .52, interval: 3.74, name: ["临终孢巢", "Last Spore Nest"], hint: ["打掉孢囊可阻止下一轮定点萌爆", "Pop the sacs to prevent their next germination blast"] },
  { mode: "void", hp: .58, interval: 3.65, name: ["噬界奇点", "World-Eater Singularity"], hint: ["逆着吸力离开黑洞边界，塌缩后反击", "Escape against the pull and counter after implosion"] },
  { mode: "synapse", hp: .53, interval: 3.58, name: ["神经王冠断路", "Broken Neural Crown"], hint: ["按点亮顺序打断三个神经结，躲开折线放电", "Sever the lit synapses in order and dodge the discharge"] },
  { mode: "fusion", hp: .66, interval: 3.74, name: ["群渊末日核", "Confluence Extinction Core"], hint: ["预读横纵封锁，抓住三重防线交替的空档", "Read both axes and strike between the three defenses"] },
];

let bossFinaleEggImage;

function bossFinaleStageLabel(type) { return tr(...bossFinaleStages[type].name); }
function bossFinaleHint(type) { return tr(...bossFinaleStages[type].hint); }
function bossFinaleCollapseDuration() { return 2.05; }

function preloadBossFinaleArt(type) {
  if (typeof preloadStarBreakerModel === "function") {
    preloadStarBreakerModel(type);
    preloadStarBreakerModel(starBreakerFinaleModelIndex(type));
  }
  if (type === 0 && typeof preloadHadalSurface === "function") preloadHadalSurface();
  if (type !== 0 || typeof Image !== "function" || bossFinaleEggImage) return;
  bossFinaleEggImage = new Image();
  bossFinaleEggImage.src = "assets/aliens/broodmother-egg.webp";
}

function beginBossFinale(target) {
  const profile = bossFinaleStages[target.type];
  const nodeCount = profile.mode === "bones" || profile.mode === "mirror" ? 2
    : profile.mode === "spores" || profile.mode === "synapse" ? 3 : 0;
  target.finale = {
    mode: profile.mode, age: 0, transform: 1.16, beat: 0, next: 1.7, openUntil: 0,
    startX: target.x, startY: target.y, hazards: [],
    nodes: Array.from({ length: nodeCount }, (_, index) => ({ index, hp: 1 })), activeNode: 0,
    gate: null, reflectedBeat: -1,
  };
  target.phase = "finale";
  target.phaseTime = 0;
  target.healthLog += Math.log(profile.hp);
  target.hp = target.displayHp = 1;
  target.damageBudget = undefined;
  target.damageBudgetAt = undefined;
  target.lashPulse = 0;
  target.alienAttack = null;
  clearBossFinaleAttacks();
  bossHitGrace = Math.max(bossHitGrace, .65);
  gameAudio.bossAttack("surge");
  addCombatShake(4.5);
  preloadBossFinaleArt(target.type);
  setBossMessage(bossStageTitle(target), bossFinaleStageLabel(target.type) + " · " + bossFinaleHint(target.type));
  statusMessage.textContent = bossFinaleStageLabel(target.type) + " · " + bossFinaleHint(target.type);
}

function finaleBounds() {
  const left = flightBounds.left;
  const right = Math.max(left, bossPlayerRight());
  const top = flightBounds.top;
  const bottom = Math.max(top, flightBounds.bottom);
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

function finaleGap(bounds, side, min = 32) {
  if (bounds.height < player.height * .5) {
    return { center: player.y, half: bounds.height + player.height * .18 };
  }
  const half = Math.min(bounds.height * .34, Math.max(min, player.height * .56));
  const reach = player.speed * .56;
  const center = clamp(clamp(player.y + side * Math.min(bounds.height * .25, reach),
    bounds.top + half, bounds.bottom - half), player.y - reach, player.y + reach);
  return { center, half };
}

function finaleHazard(target, type, values) {
  const hazard = { type, age: 0, warning: 1.03, duration: .36, color: target.color, ...values };
  if (target.finale.hazards.length < 12) target.finale.hazards.push(hazard);
  return hazard;
}

function finaleNodeGeometry(target, node) {
  const f = target.finale;
  const lane = f.nodes.length === 3 ? (node.index - 1) : node.index ? 1 : -1;
  const flutter = Math.sin(f.age * 2.1 + node.index * 2.4);
  const radius = Math.max(11, target.width * (f.mode === "mirror" ? .165 : .125));
  const offsetX = f.mode === "mirror" ? (node.index ? .055 : -.20) : -.31 + .075 * flutter;
  const offsetY = lane * (f.mode === "mirror" ? .31 : .43);
  return { x: target.x + offsetX * target.width,
    y: target.y + offsetY * target.height + flutter * target.height * .034, radius };
}

function finaleCoreGeometry(target) {
  const mode = target.finale.mode;
  const width = target.width * (mode === "egg" ? .69 : mode === "coil" ? .78 : .64);
  return { x: target.x, y: target.y, width, height: target.height * (mode === "egg" ? 1.04 : .71) };
}

function finaleTide(target, bounds, side) {
  const gap = finaleGap(bounds, side, 31);
  const width = Math.min(90, Math.max(32, player.width * .46));
  finaleHazard(target, "tide", { x: target.x, gap, width, warning: 1.22,
    duration: target.hp < .38 ? 1.42 : 1.62, purge: true, color: "#7eeaff" });
}

function finaleBones(target, bounds, side) {
  const live = target.finale.nodes.filter(node => node.hp > 0);
  for (const node of live) {
    const source = finaleNodeGeometry(target, node);
    finaleHazard(target, "wire", { ax: source.x, ay: source.y,
      bx: bounds.left - 12, by: clamp(player.y + (node.index ? side : 0) * bounds.height * .17,
        bounds.top, bounds.bottom), width: 13, warning: 1.05 + node.index * .22, node: node.index, material: "bone" });
  }
  if (!live.length) finaleHazard(target, "blast", { x: player.x, y: player.y,
    radius: Math.min(68, Math.max(26, bounds.height * .18)), warning: 1.18 });
}

function finaleFurnace(target, bounds, side) {
  const gap = finaleGap(bounds, side);
  finaleHazard(target, "vent", { gap, warning: 1.05, duration: .57, color: "#ffa456" });
  target.finale.ventOpenAt = target.finale.age + 1.62;
  target.finale.openUntil = target.finale.ventOpenAt + 1.17;
}

function finaleWeb(target, bounds, side) {
  if (bounds.width < 75) {
    target.finale.openUntil = target.finale.age + 2.15;
    finaleHazard(target, "blast", { x: player.x, y: player.y,
      radius: Math.max(14, Math.min(44, bounds.height * .22)), warning: 1.13 });
    return;
  }
  const direction = player.x < (bounds.left + bounds.right) / 2 ? 1 : -1;
  const x = clamp(player.x + direction * Math.min(bounds.width * .34, player.speed * .43), bounds.left, bounds.right);
  const y = clamp(player.y + side * Math.min(bounds.height * .12, 48), bounds.top, bounds.bottom);
  const radius = Math.max(23, Math.min(player.height * .37, 51));
  target.finale.gate = { x, y, radius, until: target.finale.age + 2.2, cut: false };
  finaleHazard(target, "wire", { ax: target.x, ay: bounds.top, bx: bounds.left - 10,
    by: clamp(player.y, bounds.top, bounds.bottom), width: 19, warning: 1.19, material: "silk" });
  finaleHazard(target, "wire", { ax: target.x, ay: bounds.bottom, bx: bounds.left - 10,
    by: clamp(player.y, bounds.top, bounds.bottom), width: 19, warning: 1.19, material: "silk" });
}

function finaleClaws(target, bounds, side) {
  const gap = finaleGap(bounds, side);
  finaleHazard(target, "pincer", { gap, warning: 1.16, duration: .66, color: "#a5e991" });
  target.finale.ventOpenAt = target.finale.age + 1.82;
  target.finale.openUntil = target.finale.ventOpenAt + 1.03;
}

function finaleMirror(target, bounds) {
  target.finale.activeNode = target.finale.beat % 2;
  const height = Math.min(bounds.height * .18, 78);
  const y = player.y;
  for (const [index, sign] of [[0, -1], [1, 1]]) {
    finaleHazard(target, "wire", { ax: index ? target.x : bounds.left - 24,
      ay: clamp(y + height * sign, bounds.top - 18, bounds.bottom + 18),
      bx: index ? bounds.left - 30 : bounds.right + 32, by: clamp(y - height * sign, bounds.top, bounds.bottom),
      width: 16, warning: 1.08 + index * .32, color: "#c5bdff", material: "prism" });
  }
}

function finaleCoil(target, bounds, side) {
  const x = clamp(player.x + side * Math.min(90, bounds.width * .19), bounds.left, bounds.right);
  const y = player.y;
  const radius = Math.min(210, Math.max(43, Math.hypot(bounds.width, bounds.height) * .31));
  finaleHazard(target, "ring", { x, y, radius, width: Math.max(10, player.width * .095),
    warning: 1.0, duration: .92, color: "#77d7ff" });
  target.finale.ventOpenAt = target.finale.age + 1.0;
  target.finale.openUntil = target.finale.age + 2.7;
}

function finaleSpores(target, bounds, side) {
  for (const node of target.finale.nodes) {
    if (node.hp <= 0) continue;
    const x = clamp(player.x + (node.index - 1) * bounds.width * .22, bounds.left, bounds.right);
    const y = clamp(player.y + side * (node.index - 1) * bounds.height * .19, bounds.top, bounds.bottom);
    finaleHazard(target, "blast", { x, y, radius: Math.min(76, Math.max(22, bounds.height * .16)),
      warning: 1.13 + node.index * .26, node: node.index, color: "#cfdf73" });
  }
  if (target.finale.nodes.every(node => node.hp <= 0)) {
    finaleHazard(target, "ring", { x: player.x, y: player.y,
      radius: Math.max(25, bounds.height * .36), width: 12, warning: 1.15, duration: .74 });
  }
}

function finaleVoid(target, bounds) {
  const radius = Math.min(155, Math.max(23, Math.hypot(bounds.width, bounds.height) * .19));
  finaleHazard(target, "well", { x: player.x, y: player.y, radius, warning: 1.42,
    duration: .40, color: "#f49372" });
  target.finale.ventOpenAt = target.finale.age + 1.82;
  target.finale.openUntil = target.finale.ventOpenAt + 1.05;
}

function finaleSynapse(target, bounds, side) {
  const f = target.finale;
  const lit = f.nodes.find(node => node.hp > 0);
  f.activeNode = lit?.index ?? -1;
  if (lit) {
    const source = finaleNodeGeometry(target, lit);
    const relayX = bounds.left + bounds.width * .51;
    const relayY = clamp(player.y + side * bounds.height * .22, bounds.top, bounds.bottom);
    const width = Math.max(13, player.width * .11);
    finaleHazard(target, "wire", { ax: source.x, ay: source.y, bx: relayX, by: relayY,
      width, warning: 1.06, node: lit.index, material: "nerve" });
    finaleHazard(target, "wire", { ax: relayX, ay: relayY, bx: bounds.left - 22,
      by: clamp(player.y, bounds.top, bounds.bottom), width, warning: 1.28, node: lit.index, material: "nerve" });
  } else {
    finaleHazard(target, "seam", { x: player.x, width: Math.max(10, Math.min(52, bounds.width * .2)), warning: 1.12 });
  }
}

function finaleFusion(target, bounds, side) {
  const f = target.finale;
  const gap = finaleGap(bounds, side, 37);
  const horizontalRoom = bounds.width > Math.max(66, player.width * .62);
  const form = (f.beat - 1) % 3;
  if (form === 0) {
    finaleHazard(target, "vent", { gap, warning: 1.10, duration: 1.05, color: "#bca5fa" });
    if (horizontalRoom) finaleHazard(target, "seam", { x: player.x,
      width: Math.min(76, bounds.width * .19), warning: 1.74, duration: .44, color: "#ffac6a" });
  } else if (form === 1) {
    const radius = Math.min(118, Math.max(25, bounds.height * .22));
    finaleHazard(target, "well", { x: player.x, y: player.y, radius, warning: 1.28, duration: .30 });
    if (horizontalRoom) finaleHazard(target, "wire", { ax: bounds.left - 13, ay: gap.center,
      bx: bounds.right + 26, by: gap.center + side * 30, width: 14, warning: 2.05, color: "#ffb17c", material: "nerve" });
  } else {
    finaleHazard(target, "tide", { x: target.x, gap, width: Math.max(24, player.width * .37),
      warning: 1.13, duration: 1.28, color: "#bca5fa" });
    finaleHazard(target, "blast", { x: player.x, y: player.y, radius: Math.max(16, Math.min(57, bounds.height * .17)),
      warning: 2.55, color: "#ff8e9c" });
  }
  f.ventOpenAt = f.age + 2.38;
  f.openUntil = f.ventOpenAt + .89;
}

const bossFinalePlans = {
  egg: finaleTide, bones: finaleBones, furnace: finaleFurnace, web: finaleWeb,
  claws: finaleClaws, mirror: finaleMirror, coil: finaleCoil, spores: finaleSpores,
  void: finaleVoid, synapse: finaleSynapse, fusion: finaleFusion,
};

function updateBossFinale(target, seconds) {
  const f = target.finale;
  if (!(seconds > 0)) return;
  f.age += seconds;
  const arena = bossArena(target.type);
  const t = clamp(f.age / f.transform, 0, 1);
  const ease = 1 - Math.pow(1 - t, 3);
  const wide = f.mode === "coil" || f.mode === "mirror";
  const bob = Math.sin(f.age * (wide ? 1.73 : .9)) * Math.min(arena.height * (wide ? .24 : .07), (arena.bottom - arena.top) * .29);
  const easeX = wide ? Math.cos(f.age * 1.07) * arena.width * .065 : 0;
  target.x = f.startX + (arena.x + easeX - f.startX) * ease;
  target.y = f.startY + (clamp(arena.y + bob, arena.top, arena.bottom) - f.startY) * ease;
  if (f.gate && !f.gate.cut && f.age <= f.gate.until
    && Math.hypot(player.x - f.gate.x, player.y - f.gate.y) <= f.gate.radius) {
    f.gate.cut = true;
    f.openUntil = f.age + 2.0;
    gameAudio.bossAttack("hatch");
    combatBurst(f.gate.x, f.gate.y, .62, "#a5f4ff");
  }
  if (f.gate && f.age > f.gate.until) f.gate = null;
  for (const hazard of f.hazards) {
    const crossed = hazard.age < hazard.warning && hazard.age + seconds >= hazard.warning;
    hazard.previousAge = hazard.age;
    hazard.age += seconds;
    if (hazard.type === "well" && hazard.age < hazard.warning) {
      const dx = hazard.x - player.x, dy = hazard.y - player.y, distance = Math.hypot(dx, dy);
      if (distance > 1 && distance < hazard.radius * 1.64) {
        const strength = seconds * player.speed * .24 * (1 - distance / (hazard.radius * 1.64));
        player.x = clamp(player.x + dx / distance * strength, flightBounds.left, bossPlayerRight());
        player.y = clamp(player.y + dy / distance * strength, flightBounds.top, flightBounds.bottom);
      }
    }
    if (crossed) {
      if (hazard.purge) clearBossFinaleAttacks();
      gameAudio.bossAttack(hazard.type === "tide" ? "surge" : hazard.type === "well" ? "burst" : "beam");
      if (hazard.purge || hazard.type === "well") addCombatShake(hazard.purge ? 6.7 : 4.5);
    }
  }
  f.hazards = f.hazards.filter(hazard => hazard.age < hazard.warning + hazard.duration
    && (hazard.node === undefined || f.nodes[hazard.node]?.hp > 0));
  if (f.age < f.next) return;
  f.beat++;
  const side = f.beat % 2 ? (player.y < (flightBounds.top + flightBounds.bottom) / 2 ? 1 : -1)
    : (player.y > (flightBounds.top + flightBounds.bottom) / 2 ? -1 : 1);
  bossFinalePlans[f.mode](target, finaleBounds(), side);
  f.next = f.age + bossFinaleStages[target.type].interval - (target.hp < .4 ? .24 : 0);
  gameAudio.bossAttack("coil");
}

function resizeBossFinale(target) {
  const f = target.finale;
  f.hazards.length = 0;
  f.gate = null;
  f.startX = target.x;
  f.startY = target.y;
  f.next = f.age + .8;
}

function finaleSegmentDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const distance = dx * dx + dy * dy;
  const t = distance > 0 ? clamp(((x - ax) * dx + (y - ay) * dy) / distance, 0, 1) : 0;
  return Math.hypot(x - ax - dx * t, y - ay - dy * t);
}

function finaleTideX(hazard, y, time) {
  const p = clamp((time - hazard.warning) / hazard.duration, 0, 1);
  const arc = Math.cos((y / viewport.height - .5) * Math.PI) * Math.min(60, viewport.width * .06);
  const swell = (Math.sin(y * .026 - time * 6) + .44 * Math.sin(y * .061 + time * 9)) * hazard.width * .14;
  return hazard.x + hazard.width + arc + swell - (hazard.x + hazard.width * 2.7 + Math.min(70, viewport.width * .06)) * p;
}

function bossFinaleHitsPlayer(target) {
  const radius = player.height * .16;
  return target.finale.hazards.some(hazard => {
    if (hazard.age < hazard.warning) return false;
    if (hazard.type === "tide") {
      if (Math.abs(player.y - hazard.gap.center) <= Math.max(0, hazard.gap.half - radius)) return false;
      const delta = player.x - finaleTideX(hazard, player.y, hazard.age);
      const oldX = player.previousX ?? player.x, oldY = player.previousY ?? player.y;
      const previous = oldX - finaleTideX(hazard, oldY, hazard.previousAge ?? hazard.age);
      const reach = hazard.width * .42 + radius;
      return Math.min(previous, delta) <= reach && Math.max(previous, delta) >= -reach;
    }
    if (hazard.type === "vent" || hazard.type === "pincer") {
      const gap = Math.max(0, hazard.gap.half - radius);
      const spread = hazard.type === "pincer" ? viewport.height * .43 * (1 - (hazard.age - hazard.warning) / hazard.duration) : 0;
      return Math.abs(player.y - hazard.gap.center) > gap + spread;
    }
    if (hazard.type === "blast" || hazard.type === "well") return Math.hypot(player.x - hazard.x, player.y - hazard.y) < hazard.radius + radius;
    if (hazard.type === "seam") return Math.abs(player.x - hazard.x) < hazard.width / 2 + radius;
    if (hazard.type === "ring") {
      const edge = hazard.radius * (hazard.age - hazard.warning) / hazard.duration;
      return Math.abs(Math.hypot(player.x - hazard.x, player.y - hazard.y) - edge) < hazard.width + radius;
    }
    return finaleSegmentDistance(player.x, player.y, hazard.ax, hazard.ay, hazard.bx, hazard.by) < hazard.width / 2 + radius;
  });
}

function projectileBossFinaleHit(bullet, target) {
  const core = finaleCoreGeometry(target);
  const shiftX = (target.previousX ?? target.x) - target.x;
  const shiftY = (target.previousY ?? target.y) - target.y;
  const hitTime = region => projectileEnemyEntry(bullet, {
    ...region, previousX: region.x + shiftX, previousY: region.y + shiftY,
  });
  let nearest = hitTime(core), part = -1;
  for (const node of target.finale.nodes) {
    if (node.hp <= 0) continue;
    const g = finaleNodeGeometry(target, node);
    const t = hitTime({ x: g.x, y: g.y, width: g.radius * 2, height: g.radius * 2 });
    if (t < nearest) { nearest = t; part = node.index; }
  }
  if (!Number.isFinite(nearest)) return null;
  bullet.finaleNode = part;
  return { time: nearest };
}

function bossFinaleDamageMultiplier(target, shot) {
  const f = target.finale;
  if (f.age < f.transform) return 0;
  const mode = f.mode;
  const open = f.age >= (f.ventOpenAt ?? 0) && f.age < f.openUntil;
  if (mode === "egg") return 1;
  if (mode === "furnace" || mode === "claws" || mode === "void") return open ? 1.36 : .50;
  if (mode === "web") return open ? 1.45 : .39;
  if (mode === "coil") return open ? 1.14 : .70;
  if (mode === "fusion") return open ? 1.25 : .64;
  let node = f.nodes[shot.finaleNode];
  if ((!node || node.hp <= 0) && Number.isFinite(shot.y)) {
    node = f.nodes.find(part => {
      if (part.hp <= 0) return false;
      const g = finaleNodeGeometry(target, part);
      return Math.abs(shot.y - g.y) <= g.radius + (shot.source === "ultimate" ? 18 : 3);
    });
  }
  if (mode === "mirror") {
    if (node?.index === f.activeNode) return 1.24;
    if (node && f.reflectedBeat !== f.beat && f.hazards.length < 8) {
      f.reflectedBeat = f.beat;
      const g = finaleNodeGeometry(target, node);
      finaleHazard(target, "wire", { ax: g.x, ay: g.y, bx: player.x, by: player.y,
        width: 12, warning: .92, duration: .21, color: "#efb5ff", material: "prism" });
    }
    return node ? .13 : .56;
  }
  if (node && node.hp > 0 && (mode !== "synapse" || node.index === f.activeNode)) {
    const log = shot.damageLog ?? Math.log(shot.damage ?? weapon.damage);
    const hit = Math.exp(Math.min(Math.log(.35), log - target.healthLog + Math.log(3.7)));
    node.hp = Math.max(0, node.hp - hit);
    if (!node.hp) {
      const g = finaleNodeGeometry(target, node);
      combatBurst(g.x, g.y, .82, target.color, true);
      gameAudio.bossAttack("burst");
      if (mode === "synapse") f.activeNode = f.nodes.find(part => part.hp > 0)?.index ?? -1;
    }
    return .18;
  }
  const remaining = f.nodes.reduce((sum, part) => sum + Number(part.hp > 0), 0);
  if (mode === "synapse") return remaining ? .34 + (3 - remaining) * .14 : 1.23;
  return remaining ? .53 + (f.nodes.length - remaining) * .17 : 1.20;
}

function finaleEllipse(ctx, x, y, rx, ry, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(.5, rx), Math.max(.5, ry), rotation, 0, Math.PI * 2);
}

function finaleGuide(ctx, gap) {
  const top = gap.center - gap.half, bottom = gap.center + gap.half;
  ctx.fillStyle = "#43d7c526";
  ctx.fillRect(0, top, viewport.width, bottom - top);
  ctx.strokeStyle = "#a0fae6aa";
  ctx.lineWidth = 1.7;
  ctx.setLineDash([10, 9]);
  ctx.beginPath();
  ctx.moveTo(0, top); ctx.lineTo(viewport.width, top);
  ctx.moveTo(0, bottom); ctx.lineTo(viewport.width, bottom);
  ctx.stroke();
  ctx.setLineDash([]);
}

function finaleCrestPath(ctx, hazard, top, bottom, width) {
  const edge = y => finaleTideX(hazard, y, hazard.age);
  const lanes = Math.max(2, Math.ceil((bottom - top) / 10));
  ctx.beginPath();
  for (let i = 0; i <= lanes; i++) {
    const y = top + (bottom - top) * i / lanes;
    if (!i) ctx.moveTo(edge(y), y);
    else ctx.lineTo(edge(y), y);
  }
  if (width) {
    for (let i = lanes; i >= 0; i--) {
      const y = top + (bottom - top) * i / lanes;
      ctx.lineTo(edge(y) + width * (.89 + .11 * Math.sin(y * .016 - hazard.age * 5)), y);
    }
    ctx.closePath();
  }
}

function drawFinaleTide(ctx, hazard, quiet) {
  finaleGuide(ctx, hazard.gap);
  const bounds = [[0, Math.max(0, hazard.gap.center - hazard.gap.half)],
    [Math.min(viewport.height, hazard.gap.center + hazard.gap.half), viewport.height]];
  if (hazard.age < hazard.warning) {
    const p = hazard.age / hazard.warning;
    const mist = ctx.createLinearGradient(viewport.width, 0, viewport.width * .73, 0);
    mist.addColorStop(0, "#35bbffa6"); mist.addColorStop(.45, "#266cac30"); mist.addColorStop(1, "#101a3400");
    ctx.save();
    ctx.globalAlpha *= .24 + .76 * p * p;
    for (const [top, bottom] of bounds) {
      ctx.fillStyle = mist;
      ctx.fillRect(viewport.width * .73, top, viewport.width * .27, bottom - top);
      ctx.strokeStyle = "#adfaffbb";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 7]);
      finaleCrestPath(ctx, hazard, top, bottom, 0);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const edge = finaleTideX(hazard, viewport.height / 2, hazard.age);
  const width = hazard.width * (quiet ? 2 : 3.6);
  const liquid = ctx.createLinearGradient(edge - 42, 0, edge + width, 0);
  liquid.addColorStop(0, "#f0ffffe6");
  liquid.addColorStop(.12, "#a6fbfff2");
  liquid.addColorStop(.33, hazard.color + "a6");
  liquid.addColorStop(.56, "#1766a381");
  liquid.addColorStop(.77, "#3584b93a");
  liquid.addColorStop(1, "#07527b00");
  for (const [top, bottom] of bounds) {
    if (bottom <= top) continue;
    finaleCrestPath(ctx, hazard, top, bottom, width);
    ctx.fillStyle = liquid;
    ctx.fill();
    finaleCrestPath(ctx, hazard, top, bottom, 0);
    ctx.lineWidth = quiet ? 1.7 : 2.4;
    ctx.strokeStyle = "#dcffffed";
    if (!quiet) { ctx.shadowColor = "#79eaff"; ctx.shadowBlur = 11; }
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (!quiet) {
      ctx.save();
      finaleCrestPath(ctx, hazard, top, bottom, width);
      ctx.clip();
      if (typeof drawHadalSurface === "function")
        drawHadalSurface(ctx, edge - hazard.width * .58, top, width + hazard.width, bottom - top, hazard.age);
      const flows = ["#c8fcffc7", "#75d6f17d", "#b6e1f543"];
      for (const [layer, color] of flows.entries()) {
        ctx.beginPath();
        for (let y = top + 6 + layer * 5; y < bottom; y += 18) {
          const x = finaleTideX(hazard, y, hazard.age) + layer * width * .19;
          const roll = Math.sin(y * .081 + hazard.age * 17 + layer);
          const length = width * (.19 + layer * .095 + .10 * roll);
          ctx.moveTo(x + 2, y);
          ctx.bezierCurveTo(x + length * .25, y - 19 * roll, x + length * .60, y + 15 * roll, x + length, y - 5 * roll);
          if (layer === 0) {
            ctx.moveTo(x + 7, y - 3);
            ctx.bezierCurveTo(x + 15, y - 11 - 6 * roll, x + 26, y + 8, x + 17, y + 9 * roll);
          }
        }
        ctx.lineWidth = layer ? 1.2 : 1.65;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

function drawFinaleVent(ctx, hazard, active, progress, quiet) {
  finaleGuide(ctx, hazard.gap);
  const closing = hazard.type === "pincer"
    ? viewport.height * .43 * (active ? 1 - progress : 0) : 0;
  const top = clamp(hazard.gap.center - hazard.gap.half - closing, 0, viewport.height);
  const bottom = clamp(hazard.gap.center + hazard.gap.half + closing, 0, viewport.height);
  const heat = ctx.createLinearGradient(viewport.width, 0, 0, 0);
  heat.addColorStop(0, hazard.color + (active ? "ad" : "35"));
  heat.addColorStop(.47, hazard.color + (active ? "66" : "22"));
  heat.addColorStop(1, hazard.color + (active ? "36" : "10"));
  ctx.fillStyle = heat;
  ctx.fillRect(0, 0, viewport.width, top);
  ctx.fillRect(0, bottom, viewport.width, viewport.height - bottom);
  if (!active) return;
  const serrated = hazard.type === "pincer";
  ctx.lineWidth = quiet ? 2 : 4;
  ctx.strokeStyle = hazard.color;
  for (const [y, side] of [[top, -1], [bottom, 1]]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= viewport.width; x += 28) {
      const offset = quiet ? 0 : (serrated ? x % 56 === 0 ? 0 : 10 : Math.sin(x * .031 + progress * 26) * 5 + 6) * side;
      ctx.lineTo(x, y + offset);
    }
    ctx.stroke();
  }
}

function drawFinaleWire(ctx, hazard, active, progress, quiet) {
  const dx = hazard.bx - hazard.ax, dy = hazard.by - hazard.ay;
  const length = Math.hypot(dx, dy);
  const half = hazard.width * .5;
  ctx.translate(hazard.ax, hazard.ay);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(length, 0);
  if (!active) {
    ctx.stroke();
    return;
  }
  const layer = ctx.createLinearGradient(0, -half, 0, half);
  layer.addColorStop(0, hazard.color + "00"); layer.addColorStop(.29, hazard.color + "88");
  layer.addColorStop(.5, hazard.color + "cb"); layer.addColorStop(.71, hazard.color + "88");
  layer.addColorStop(1, hazard.color + "00");
  ctx.fillStyle = layer;
  ctx.fillRect(0, -half, length, hazard.width);
  ctx.strokeStyle = "#fff5f5";
  ctx.lineWidth = 1.55;
  if (quiet || !hazard.material) {
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  const steps = Math.max(2, Math.min(80, Math.ceil(length / 16)));
  if (hazard.material === "silk") {
    for (const sign of [-1, 1]) {
      for (let i = 0; i <= steps; i++) {
        const x = i * length / steps;
        const y = sign * (half * .35 + Math.sin(x * .063 - progress * 20) * half * .29);
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    }
  } else {
    const amplitude = half * (hazard.material === "nerve" ? .71 : .56);
    ctx.moveTo(0, 0);
    for (let i = 1; i <= steps; i++) {
      const x = i * length / steps;
      if (hazard.material === "bone") {
        ctx.lineTo(x - 5, i % 2 ? amplitude : -amplitude);
        ctx.lineTo(x, 0);
      } else if (hazard.material === "prism") {
        ctx.lineTo(x, i % 4 < 2 ? -amplitude : amplitude);
      } else {
        const shock = Math.sin(i * 4.7 - progress * 26) * amplitude;
        ctx.lineTo(x, shock);
        if (i % 5 === 0 && i < steps) { ctx.lineTo(x + 8, -shock); ctx.moveTo(x, shock); }
      }
    }
  }
  ctx.stroke();
}

function drawFinaleHazard(ctx, hazard, quiet) {
  const active = hazard.age >= hazard.warning;
  const progress = active ? clamp((hazard.age - hazard.warning) / hazard.duration, 0, 1)
    : clamp(hazard.age / hazard.warning, 0, 1);
  ctx.save();
  ctx.lineWidth = active ? 2.7 : 1.7;
  ctx.strokeStyle = hazard.color;
  ctx.fillStyle = hazard.color + (active ? "55" : "1b");
  if (!active) ctx.setLineDash([8, 7]);
  switch (hazard.type) {
    case "tide":
      drawFinaleTide(ctx, hazard, quiet);
      break;
    case "vent":
    case "pincer":
      drawFinaleVent(ctx, hazard, active, progress, quiet);
      break;
    case "blast":
    case "well":
    case "ring": {
      const ring = hazard.type === "ring";
      const well = hazard.type === "well";
      const radius = ring && active ? hazard.radius * progress : hazard.radius;
      if (!ring) {
        const glow = ctx.createRadialGradient(hazard.x, hazard.y, 0, hazard.x, hazard.y, Math.max(2, radius));
        glow.addColorStop(0, well ? "#040412ef" : hazard.color + (active ? "d9" : "16"));
        glow.addColorStop(.7, well ? "#131022bf" : hazard.color + (active ? "4f" : "10"));
        glow.addColorStop(1, hazard.color + (active ? "ba" : "50"));
        ctx.fillStyle = glow;
      } else ctx.lineWidth = active ? Math.max(3, hazard.width) : 2;
      finaleEllipse(ctx, hazard.x, hazard.y, radius, radius);
      if (!ring) ctx.fill();
      ctx.stroke();
      if (well && !quiet) {
        ctx.setLineDash([]);
        ctx.globalAlpha = .55;
        for (let i = 0; i < 4; i++) {
          const turn = i * Math.PI / 2 + hazard.age * 1.9;
          ctx.beginPath();
          ctx.arc(hazard.x, hazard.y, radius * (.57 + i * .11), turn, turn + Math.PI * .69);
          ctx.stroke();
        }
      }
      break;
    }
    case "seam": {
      const left = hazard.x - hazard.width / 2, right = hazard.x + hazard.width / 2;
      const light = ctx.createLinearGradient(left, 0, right, 0);
      light.addColorStop(0, "#00000000");
      light.addColorStop(.5, hazard.color + (active ? "b4" : "25"));
      light.addColorStop(1, "#00000000");
      ctx.fillStyle = light;
      ctx.fillRect(left, 0, hazard.width, viewport.height);
      ctx.beginPath();
      ctx.moveTo(left, 0); ctx.lineTo(left, viewport.height);
      ctx.moveTo(right, 0); ctx.lineTo(right, viewport.height);
      ctx.stroke();
      if (active) {
        ctx.beginPath();
        ctx.moveTo(hazard.x, 0);
        for (let y = 0; y <= viewport.height; y += 20) {
          ctx.lineTo(hazard.x + (quiet ? 0 : Math.sin(y * .13 + progress * 20) * hazard.width * .27), y);
        }
        ctx.strokeStyle = "#fff5e0";
        ctx.stroke();
      }
      break;
    }
    default:
      drawFinaleWire(ctx, hazard, active, progress, quiet);
      break;
  }
  ctx.restore();
}

function finaleVolume(ctx, x, y, rx, ry, color, light = 1, rotation = 0) {
  const tone = ctx.createRadialGradient(x - rx * .32, y - ry * .26, Math.max(1, rx * .02), x, y, Math.max(2, rx, ry));
  tone.addColorStop(0, light > 1 ? "#fffbdc" : color);
  tone.addColorStop(.26, color + "d1");
  tone.addColorStop(.60, "#202637");
  tone.addColorStop(1, "#050910");
  ctx.fillStyle = tone;
  finaleEllipse(ctx, x, y, rx, ry, rotation);
  ctx.fill();
  ctx.strokeStyle = color + "99";
  ctx.lineWidth = Math.max(.8, rx * .027);
  ctx.stroke();
}

function drawFinaleEgg(ctx, w, h, age, hp, quiet) {
  if (typeof drawStarBreakerModel === "function" && drawStarBreakerModel(ctx, 11, 0, 0, w, h, {
    time: quiet ? 0 : age, charge: .36 + .26 * Math.sin(age * 3.1),
    ruptured: 1 - clamp(hp, 0, 1), hit: 0, recoil: 0, quiet, color: "#78dbed",
  })) return;
  const pulse = quiet ? 1 : 1 + .023 * Math.sin(age * 4.4);
  ctx.save();
  ctx.scale(pulse, 1 / pulse);
  if (bossFinaleEggImage?.complete && bossFinaleEggImage.naturalWidth) {
    const width = h * bossFinaleEggImage.naturalWidth / bossFinaleEggImage.naturalHeight;
    ctx.drawImage(bossFinaleEggImage, -width / 2, -h / 2, width, h);
  } else {
    finaleVolume(ctx, 0, 0, w * .46, h * .5, "#89eaff", 1.1, .12);
    ctx.strokeStyle = "#d6faff66";
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-w * .31, i * h * .12 + h * .11);
      ctx.bezierCurveTo(-w * .14, i * h * .12, w * .12, i * h * .12, w * .30, i * h * .12 - h * .12);
      ctx.stroke();
    }
  }
  if (hp < .79) {
    const roots = hp < .4 ? [-2, -1, 0, 1, 2] : [-1, 1];
    ctx.lineWidth = hp < .4 ? 1.7 : 1.2;
    ctx.strokeStyle = hp < .4 ? "#d2fbff" : "#acdeefb3";
    ctx.beginPath();
    for (const seed of roots) {
      ctx.moveTo(seed * w * .07, h * .08);
      for (let i = 1; i <= 5; i++) {
        const y = h * (.08 - i * .076);
        const x = w * (seed * (.07 + i * .016) + Math.sin(seed * 14 + i * 2.1) * .032);
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

function finaleVein(ctx, x, y, u, v, width, color) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo((x + u) / 2 - width * 2.4, (y + v) / 2, u, v);
  ctx.lineWidth = width;
  ctx.strokeStyle = "#0c1222";
  ctx.stroke();
  ctx.lineWidth = Math.max(1, width * .26);
  ctx.strokeStyle = color;
  ctx.stroke();
}

function finaleShard(ctx, x, y, size, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const face = ctx.createLinearGradient(-size * .7, -size, size, size);
  face.addColorStop(0, "#e7eff8");
  face.addColorStop(.24, color);
  face.addColorStop(1, "#0b1022");
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.moveTo(-size * .64, -size * .67); ctx.lineTo(size * .72, -size * .28);
  ctx.lineTo(size * .45, size * .72); ctx.lineTo(-size * .8, size * .32);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFinaleShell(ctx, target, w, h, quiet) {
  const f = target.finale;
  const mode = f.mode;
  const age = quiet ? 0 : f.age;
  const lit = f.age >= (f.ventOpenAt ?? 0) && f.age < f.openUntil;
  const color = lit ? "#b8f4ff" : target.color;
  const rx = w * .43, ry = h * .44;
  if (mode === "egg") {
    drawFinaleEgg(ctx, w, h, age, target.hp, quiet);
    return;
  }
  if (typeof drawStarBreakerModel === "function"
    && drawStarBreakerModel(ctx, starBreakerFinaleModelIndex(target.type), 0, 0, w, h, {
      time: age, charge: lit ? .14 : .37 + .23 * Math.sin(age * 2.7),
      ruptured: lit ? 1 : .16 + .4 * (1 - clamp(target.hp, 0, 1)),
      hit: target.hitFlash ? 1 : 0, recoil: 0, quiet, color, cooling: lit,
    })) {
    if (lit) {
      ctx.strokeStyle = "#b8f4ffab";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 6]);
      finaleEllipse(ctx, 0, 0, rx * 1.14, ry * 1.05);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    return;
  }
  if (mode === "bones") {
    for (let i = -3; i <= 3; i++) {
      const bend = Math.sin(i * .95) * rx;
      const y = i * ry * .30;
      finaleVein(ctx, rx * .43, y - ry * .16, -rx * .76 + bend * .19, y + Math.sign(i) * ry * .35,
        w * (.10 - Math.abs(i) * .011), "#d5c3b8");
    }
    finaleVolume(ctx, rx * .18, 0, rx * .64, ry * .65, "#cbb5aa", .8, .16);
    finaleEllipse(ctx, -rx * .22, -ry * .16, rx * .22, ry * .30, .28);
    ctx.fillStyle = "#080c15"; ctx.fill();
    return;
  }
  if (mode === "furnace") {
    finaleVolume(ctx, 0, 0, rx, ry, lit ? "#9ef2ff" : "#fda448", 1.25);
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7 + age * .37;
      const radius = lit ? 1.10 : .85;
      finaleShard(ctx, Math.cos(angle) * rx * radius, Math.sin(angle) * ry * radius,
        Math.min(rx, ry) * .39, angle * .61 + i, lit ? "#557383" : "#e07f49");
    }
    return;
  }
  if (mode === "web") {
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7 + age * .15;
      finaleVein(ctx, Math.cos(angle) * rx * 1.22, Math.sin(angle) * ry * 1.15, 0, 0, w * .026, color + "a0");
    }
    for (let i = 1; i <= 3; i++) {
      finaleEllipse(ctx, 0, 0, rx * i * .32, ry * i * .34, age * .14);
      ctx.lineWidth = 1.5; ctx.strokeStyle = color + "88"; ctx.stroke();
    }
    finaleVolume(ctx, 0, 0, rx * .54, ry * .61, color, lit ? 1.3 : 1);
    return;
  }
  if (mode === "claws") {
    finaleVolume(ctx, rx * .14, 0, rx * .76, ry * .79, color, 1);
    for (const sign of [-1, 1]) {
      ctx.save();
      ctx.rotate(sign * (lit ? -.43 : -.12 + Math.sin(age * 3.1) * .08));
      const grad = ctx.createLinearGradient(0, -ry, 0, ry);
      grad.addColorStop(0, "#b5d59c"); grad.addColorStop(.4, "#354736"); grad.addColorStop(1, "#0a151d");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(rx * .36, sign * ry * .52);
      ctx.bezierCurveTo(-rx * .21, sign * ry * 1.20, -rx * 1.04, sign * ry * .92, -rx * 1.19, sign * ry * .10);
      ctx.quadraticCurveTo(-rx * .67, sign * ry * .56, -rx * .17, sign * ry * .26);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#b4e8aa96"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    }
    return;
  }
  if (mode === "mirror") {
    finaleVolume(ctx, rx * .22, 0, rx * .68, ry, "#9ba6dc", 1, age * .32);
    for (let i = -2; i <= 2; i++) finaleShard(ctx, i * rx * .17, i * ry * .26, rx * .30, i * .46 + age * .20, "#99a7d5");
    return;
  }
  if (mode === "coil") {
    for (let i = 8; i >= 0; i--) {
      const p = i / 8;
      const angle = age * 1.3 + p * Math.PI * 1.48;
      const x = (p - .5) * w * .83;
      const y = Math.sin(angle) * ry * (.7 - p * .13);
      finaleVolume(ctx, x, y, rx * (.37 - p * .22), ry * (.42 - p * .26),
        i % 2 ? color : "#4a9ac7", i === 0 && lit ? 1.4 : 1, Math.cos(angle) * .28);
    }
    return;
  }
  if (mode === "spores") {
    finaleVolume(ctx, rx * .09, ry * .17, rx * .86, ry * .71, "#939e4b", .8);
    for (let i = 0; i < 6; i++) {
      const angle = i * 2.399 + age * .17;
      const radius = (1 + Math.sin(age * 2.2 + i)) * .045;
      finaleVolume(ctx, Math.cos(angle) * rx * .76, Math.sin(angle) * ry * .81,
        rx * (.24 + radius), ry * (.30 + radius), "#b7cf58", i === 1 ? 1.25 : .7, angle * .4);
    }
    return;
  }
  if (mode === "void") {
    ctx.save(); ctx.rotate(-.41 + Math.sin(age * .8) * .08);
    for (let i = 5; i > 0; i--) {
      finaleEllipse(ctx, 0, 0, rx * (1 + i * .08), ry * (.35 + i * .10));
      ctx.strokeStyle = i === 1 ? "#ffb983" : "#f770774e";
      ctx.lineWidth = i === 1 ? 3 : 1.1; ctx.stroke();
    }
    finaleVolume(ctx, 0, 0, rx * .58, ry * .68, "#33203e", .5);
    ctx.restore();
    return;
  }
  if (mode === "synapse") {
    for (let i = -2; i <= 2; i++) {
      const y = i * ry * .46;
      finaleVein(ctx, -rx * .8, y, rx * .61, y * .53 - ry * .15, rx * .13, i % 2 ? "#f397c1" : "#cc66ac");
    }
    finaleVolume(ctx, rx * .13, 0, rx * .68, ry * .87, "#c978be", 1);
    return;
  }
  const colors = ["#83e5f8", "#f0a179", "#c8abff"];
  for (let i = 0; i < 3; i++) {
    const angle = (i * 2.094 + age * .38);
    finaleVolume(ctx, Math.cos(angle) * rx * .43, Math.sin(angle) * ry * .44,
      rx * .52, ry * .56, colors[(f.beat + i) % 3], lit ? 1.4 : 1, angle * .46);
  }
  finaleVolume(ctx, 0, 0, rx * .34, ry * .32, color, lit ? 1.4 : .8);
}

function drawFinaleNodes(ctx, target, quiet) {
  const f = target.finale;
  for (const node of f.nodes) {
    if (node.hp <= 0) continue;
    const g = finaleNodeGeometry(target, node);
    const marked = f.mode !== "mirror" && f.mode !== "synapse" || node.index === f.activeNode;
    const color = marked ? (f.mode === "bones" ? "#ffe0b7" : "#ffd4ea") : "#58718d";
    finaleVein(ctx, target.x, target.y, g.x, g.y, g.radius * .52, color + "79");
    finaleVolume(ctx, g.x, g.y, g.radius * .83, g.radius, color, marked ? 1.2 : .8, .28);
    if (f.mode === "mirror" && !marked) continue;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.radius * 1.10, -Math.PI / 2, Math.PI * 2 * node.hp - Math.PI / 2);
    ctx.stroke();
    if (f.mode === "mirror" || f.mode === "synapse") {
      const x = g.x, y = g.y - g.radius * (quiet ? 1.50 : 1.51 + Math.sin(f.age * 6) * .12);
      ctx.fillStyle = "#fff2df";
      ctx.beginPath();
      ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 4, y);
      ctx.closePath(); ctx.fill();
    }
  }
}

function drawBossFinale(ctx, target, quiet) {
  const f = target.finale;
  const g = finaleCoreGeometry(target);
  for (const hazard of f.hazards) drawFinaleHazard(ctx, hazard, quiet);
  if (f.gate && !f.gate.cut) {
    ctx.save();
    ctx.lineWidth = 1.7; ctx.strokeStyle = "#aaffec"; ctx.fillStyle = "#46efc82a"; ctx.setLineDash([5, 6]);
    finaleEllipse(ctx, f.gate.x, f.gate.y, f.gate.radius, f.gate.radius);
    ctx.fill(); ctx.stroke(); ctx.restore();
  }
  const t = clamp(f.age / f.transform, 0, 1);
  ctx.save();
  const glow = ctx.createRadialGradient(target.x, target.y, 0, target.x, target.y, Math.max(2, target.width * .65));
  glow.addColorStop(0, target.color + "2d"); glow.addColorStop(1, target.color + "00");
  ctx.fillStyle = glow;
  finaleEllipse(ctx, target.x, target.y, target.width * .65, target.width * .65);
  ctx.fill();
  ctx.translate(target.x, target.y);
  if (t < 1 && typeof drawBossShip === "function") {
    ctx.save();
    ctx.globalAlpha = 1 - t;
    const scale = 1 - t * .50;
    ctx.scale(scale, scale);
    drawBossShip(ctx, { ...target, x: 0, y: 0, age: target.age, phase: "recover" }, quiet);
    ctx.restore();
  }
  ctx.globalAlpha = Math.min(1, t * 1.25);
  ctx.scale(.62 + .38 * t, .79 + .21 * t);
  drawFinaleShell(ctx, target, g.width, g.height, quiet);
  ctx.restore();
  if (t > .6) drawFinaleNodes(ctx, target, quiet);
  const width = target.width * .82;
  const x = target.x - width / 2;
  const y = target.y - target.height * .60 - 12;
  ctx.save();
  ctx.fillStyle = "#172238";
  ctx.fillRect(x, y, width, 8);
  const life = ctx.createLinearGradient(x, 0, x + width, 0);
  life.addColorStop(0, target.color); life.addColorStop(1, "#e5f8ff");
  ctx.fillStyle = life;
  ctx.fillRect(x, y, width * clamp(target.displayHp, 0, 1), 8);
  ctx.strokeStyle = "#e8f7ffa9"; ctx.lineWidth = 1;
  ctx.strokeRect(x - 1, y - 1, width + 2, 10);
  ctx.restore();
}

function finaleDeathRing(ctx, radius, flatten, alpha, color, angle = 0) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6 + alpha * 4;
  finaleEllipse(ctx, 0, 0, radius, radius * flatten, angle);
  ctx.stroke();
  ctx.restore();
}

function finaleDeathShards(ctx, size, progress, color, count, lift = 0) {
  for (let i = 0; i < count; i++) {
    const angle = i * 2.39996;
    const radius = size * (.22 + progress * (.48 + i % 4 * .24));
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius * .57 - size * lift * progress;
    finaleShard(ctx, x, y, size * (.035 + i % 4 * .013) * (1 - .59 * progress),
      angle + (i % 2 ? 1 : -1) * progress * 2.8, color);
  }
}

function collapseFinaleEgg(ctx, target, size, phase, quiet) {
  const h = target.height * 1.04;
  const release = 1 - Math.pow(1 - phase, 2.2);
  const cut = [[.05, -.53], [.02, -.36], [.065, -.26], [-.015, -.16], [.012, -.09],
    [-.047, .018], [.028, .115], [-.031, .22], [.017, .34], [-.033, .52]];
  const vaporRadius = size * (.21 + release * .69);
  const vapor = ctx.createRadialGradient(0, -size * phase * .11, 0, 0, -size * phase * .11, vaporRadius);
  vapor.addColorStop(0, "#e5ffffe0"); vapor.addColorStop(.18, "#a5faffb8");
  vapor.addColorStop(.46, "#368fd85c"); vapor.addColorStop(1, "#163a8200");
  ctx.save();
  ctx.globalAlpha *= (1 - phase) ** 2 * (quiet ? .4 : .88);
  ctx.fillStyle = vapor;
  finaleEllipse(ctx, 0, -size * phase * .11, vaporRadius, vaporRadius * .84);
  ctx.fill();
  ctx.restore();
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * size * release * .28, size * (phase * phase * .24 - release * .12));
    ctx.rotate(side * (release * .19 + phase * .35));
    ctx.beginPath();
    for (const [i, [x, y]] of cut.entries()) {
      if (!i) ctx.moveTo(x * size, y * h);
      else ctx.lineTo(x * size, y * h);
    }
    ctx.lineTo(side * size, h * .52);
    ctx.lineTo(side * size, -h * .53);
    ctx.closePath();
    ctx.clip();
    drawFinaleEgg(ctx, size * .69, h, 0, 0, true);
    ctx.beginPath();
    for (let i = 1; i < cut.length - 2; i++) {
      const [x, y] = cut[i];
      if (i === 1) ctx.moveTo(x * size, y * h);
      else ctx.lineTo(x * size, y * h);
    }
    ctx.lineWidth = 2.7 * (1 - phase);
    ctx.strokeStyle = "#c0ffffe3";
    ctx.stroke();
    ctx.restore();
  }
  const front = (phase * viewport.width * .66 + size * .1);
  finaleDeathRing(ctx, front, .49, (1 - phase) * .72, "#a7faff");
  finaleDeathRing(ctx, front * .89, .56, (1 - phase) * .30, "#56bcf6");
  if (!quiet) {
    for (let i = 0; i < 11; i++) {
      const angle = i * 2.39996;
      const velocity = .23 + (i % 5) * .12;
      const x = Math.cos(angle) * release * size * velocity;
      const y = Math.sin(angle) * release * size * velocity * .61 + phase * phase * size * .24;
      const droplet = size * (.012 + (i % 4) * .007) * (1 - phase * .70);
      finaleVolume(ctx, x, y, droplet * 1.6, droplet, "#80e8ff", .71, angle);
    }
    ctx.strokeStyle = "#c9faffb0";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 13; i++) {
      const angle = i * 2.39996, r = front * (.32 + i % 5 * .12);
      const x = Math.cos(angle) * r, y = Math.sin(angle) * r * .48;
      ctx.moveTo(x, y); ctx.quadraticCurveTo(x * .77, y * .52, x * .51, y * .46);
    }
    ctx.stroke();
  }
}

function drawBossFinaleCollapse(ctx, target, progress, quiet) {
  const size = target.width;
  const charge = clamp(progress / .22, 0, 1);
  const phase = clamp((progress - .22) / .78, 0, 1);
  const fade = 1 - Math.pow(phase, 1.48);
  const color = target.color;
  const mode = target.finale.mode;
  ctx.save();
  ctx.translate(target.x, target.y);
  if (progress < .22) {
    ctx.save();
    const bend = quiet ? .98 : 1 - .18 * charge * charge;
    ctx.scale(bend, 1 + (1 - bend) * .68);
    const g = finaleCoreGeometry(target);
    drawFinaleShell(ctx, target, g.width, g.height, true);
    ctx.restore();
    const light = ctx.createRadialGradient(0, 0, 0, 0, 0, size * .53);
    light.addColorStop(0, "#fff9dedd"); light.addColorStop(.28, color + "a2"); light.addColorStop(1, color + "00");
    ctx.globalAlpha = charge * charge * (quiet ? .42 : .77);
    ctx.fillStyle = light;
    finaleEllipse(ctx, 0, 0, size * .53, size * .53);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.globalAlpha = fade * (quiet ? .74 : 1);
  switch (mode) {
    case "egg":
      collapseFinaleEgg(ctx, target, size, phase, quiet);
      break;
    case "bones":
      // Each rib loses support at a different time and drops into the void.
      for (let i = 0; i < 7; i++) {
        const fall = Math.max(0, phase - i * .042);
        const angle = i * .74 - 2.34 + fall * 2;
        const y = (i - 3) * size * .064 + fall * fall * size * .60;
        ctx.save();
        ctx.translate((i - 3) * size * .035 + Math.sin(angle) * size * .22 * fall, y);
        ctx.rotate(angle);
        finaleVein(ctx, -size * .093, 0, size * .15, size * .022, size * .045, "#dbc0a9");
        ctx.restore();
      }
      if (!quiet) finaleDeathShards(ctx, size, phase, "#d4b5a7", 8, -.17);
      break;
    case "furnace":
      for (let i = 0; i < 8; i++) {
        const angle = i * .79 + .17;
        const motion = Math.sqrt(phase) * (i % 3 * .12 + .38);
        finaleVolume(ctx, Math.cos(angle) * size * motion, Math.sin(angle) * size * motion * .69,
          size * (.076 - phase * .049), size * (.043 - phase * .023), "#ffae58", phase < .35 ? 1.25 : .5, angle);
      }
      finaleDeathRing(ctx, size * (.14 + phase * 1.25), .43, fade * .75, "#ffaf66");
      break;
    case "web":
      ctx.lineWidth = 1.65;
      ctx.strokeStyle = "#d5c0ffca";
      ctx.beginPath();
      for (let i = 0; i < 11; i++) {
        const angle = i * 2.39996;
        const length = size * (.18 + phase * (.24 + i % 4 * .12));
        const x = Math.cos(angle) * length, y = Math.sin(angle) * length;
        const slack = phase * (i % 2 ? .37 : -.37);
        ctx.moveTo(x * phase * .42, y * phase * .27);
        ctx.bezierCurveTo(x * (.44 + slack), y * .12, x * .78, y * (.56 - slack), x, y);
      }
      ctx.stroke();
      break;
    case "claws":
      for (const sign of [-1, 1]) {
        ctx.save();
        ctx.translate(size * phase * .28, sign * size * (.08 + phase * .47));
        ctx.rotate(sign * (phase * 1.4 + .2));
        finaleVein(ctx, size * .13, 0, -size * .26, sign * size * .11, size * .08, "#c2e19e");
        finaleShard(ctx, -size * .12, sign * size * .044, size * .12, sign * .67, "#698858");
        ctx.restore();
      }
      finaleDeathRing(ctx, size * (.19 + phase * .50), .71, fade * .64, "#d0f0ad");
      break;
    case "mirror":
      finaleDeathShards(ctx, size, phase * 1.12, "#c6d3ff", quiet ? 8 : 17);
      finaleDeathRing(ctx, size * (.12 + phase * .82), .23, fade * .65, "#e8edff", phase * .85);
      break;
    case "coil":
      ctx.strokeStyle = "#a6e9ff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 15; i++) {
        const p = i / 14;
        const x = (p - .5) * size * (.81 + phase * 1.28);
        const y = Math.sin(p * 5.9 + phase * 4.2) * size * (.26 - phase * .19) + p * phase * size * .15;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      finaleDeathRing(ctx, size * (.18 + phase * 1.13), .66, fade * .43, "#7bdbff");
      break;
    case "spores":
      for (let i = 0; i < (quiet ? 6 : 13); i++) {
        const r = size * (.038 + (i % 4) * .017) * (1 + phase * .62);
        const x = Math.sin(i * 2.39996) * size * (.22 + phase * .35);
        const y = Math.cos(i * 2.39996) * size * .22 - Math.pow(phase, .73) * size * (.24 + i % 5 * .10);
        finaleVolume(ctx, x, y, r, r * (1 + phase * .47), "#bacf60", .6);
      }
      break;
    case "void":
      for (let i = 0; i < 5; i++) finaleDeathRing(ctx, size * (1.12 - phase) * (.4 + i * .15),
        .32 + phase * .49, fade * (.28 + i * .08), "#f39b83", -.53 + phase * .68);
      if (phase > .66) {
        ctx.strokeStyle = "#fff1d1"; ctx.lineWidth = 1.7;
        ctx.beginPath(); ctx.moveTo(-size * phase, 0); ctx.lineTo(size * phase, 0); ctx.stroke();
      }
      break;
    case "synapse":
      for (let i = 0; i < 7; i++) {
        if (phase > .35 + i * .07) continue;
        const y = (i - 3) * size * (.069 + phase * .024);
        const x = size * (.25 + phase * .46);
        finaleVein(ctx, x, y * .43, -x, y, size * .022, i % 2 ? "#ef92c4" : "#f9d4ef");
      }
      break;
    default:
      for (const [i, hue] of ["#7fe6ff", "#ffc28d", "#d5b2ff"].entries()) {
        const spread = Math.abs(.55 - phase) + .13;
        finaleDeathRing(ctx, size * spread * (1 + i * .28), .46 + i * .19,
          fade * .85, hue, (i - 1) * (1.12 - phase));
      }
      if (phase > .48) finaleDeathShards(ctx, size, phase - .35, "#e2c2fa", quiet ? 4 : 10);
      break;
  }
  ctx.restore();
}
