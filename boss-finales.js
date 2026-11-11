"use strict";

// Identity, second health pool, recovery cadence and the counter visible in the HUD.
const bossFinaleStages = [
  { mode: "egg", hp: .72, interval: 4.40, name: ["深渊胚卵", "Abyssal Egg"], hint: ["进入泄压缺口避开浪峰", "Hold in the relief gap"] },
  { mode: "bones", hp: .48, interval: 3.40, name: ["髓骨祭骸", "Marrow Reliquary"], hint: ["击破上下两根发光骨柱", "Break both glowing bone anchors"] },
  { mode: "furnace", hp: .53, interval: 3.55, name: ["无壳炉心", "Uncased Furnace"], hint: ["躲开喷发再攻击炉心", "Dodge the vents, then strike"] },
  { mode: "web", hp: .46, interval: 3.60, name: ["断弦织心", "Unstrung Heart"], hint: ["飞过亮点解开保护壳", "Cross the glowing knot to expose the heart"] },
  { mode: "claws", hp: .52, interval: 3.70, name: ["双螯断锁", "Double Lock"], hint: ["飞入双螯之间的缺口", "Fly into the gap between the claws"] },
  { mode: "mirror", hp: .44, interval: 3.45, name: ["镜棺回照", "Mirror Sepulcher"], hint: ["瞄准菱形标出的真像", "Aim at the diamond-marked reflection"] },
  { mode: "coil", hp: .57, interval: 3.52, name: ["沉雷断尾", "Severed Thunder"], hint: ["避开扩张电环再反击", "Clear the expanding ring, then strike"] },
  { mode: "spores", hp: .52, interval: 3.74, name: ["临终孢巢", "Last Spore Nest"], hint: ["先击破孢囊阻止爆炸", "Break the sacs to stop their blasts"] },
  { mode: "void", hp: .58, interval: 3.65, name: ["噬界奇点", "World-Eater Singularity"], hint: ["向外飞离黑洞的引力", "Fly out against the pull"] },
  { mode: "synapse", hp: .53, interval: 3.58, name: ["神经王冠断路", "Broken Neural Crown"], hint: ["按亮起的次序击断节点", "Break the nodes in lit order"] },
  { mode: "fusion", hp: .66, interval: 3.74, name: ["群渊末日核", "Confluence Extinction Core"], hint: ["沿缺口躲开横竖封锁", "Follow the gap through both axes"] },
];

let bossFinaleEggImage;

function bossFinaleStageLabel(type) { return tr(...bossFinaleStages[type].name); }
function bossFinaleHint(type) { return tr(...bossFinaleStages[type].hint); }

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
  const transform = bossPresentationDuration(target, "transform");
  const nodeCount = profile.mode === "bones" || profile.mode === "mirror" ? 2
    : profile.mode === "spores" || profile.mode === "synapse" ? 3 : 0;
  target.finale = {
    mode: profile.mode, age: 0, transform, beat: 0, next: transform + .54, openUntil: 0,
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
  if (typeof recordCombatFeedback === "function") recordCombatFeedback("finale", target);
  clearBossFinaleAttacks();
  bossHitGrace = Math.max(bossHitGrace, .65);
  preloadBossFinaleArt(target.type);
  setBossMessage(bossStageTitle(target), bossFinaleHint(target.type));
  statusMessage.textContent = bossFinaleStageLabel(target.type) + " · " + bossFinaleHint(target.type);
  playFinaleTransform(target);
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
  const f = target.finale;
  f.warningBeats ??= Object.create(null);
  const first = (f.warningBeats[type] ??= f.beat) === f.beat;
  const broad = ["tide", "vent", "pincer", "well"].includes(type);
  const bonus = typeof sortieWarningBonus === "function" ? sortieWarningBonus() : 0;
  const warning = Math.max(broad ? 1.64 : 1.4, (values.warning ?? 1.03) + .4) + (first ? .4 : 0) + bonus;
  const travels = type === "tide" || type === "ring" || type === "pincer";
  const duration = (values.duration ?? .36) / (travels ? target.scaling?.speedMul ?? 1 : 1);
  const hazard = { type, age: 0, color: target.color, ...values, warning, duration };
  if (f.hazards.length < 12) f.hazards.push(hazard);
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
  const hazard = finaleHazard(target, "vent", { gap, warning: 1.05, duration: .57, color: "#ffa456" });
  target.finale.ventOpenAt = target.finale.age + hazard.warning + hazard.duration;
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
  const hazard = finaleHazard(target, "pincer", { gap, warning: 1.16, duration: .66, color: "#a5e991" });
  target.finale.ventOpenAt = target.finale.age + hazard.warning + hazard.duration;
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
  const hazard = finaleHazard(target, "ring", { x, y, radius, width: Math.max(10, player.width * .095),
    warning: 1.0, duration: .92, color: "#77d7ff" });
  target.finale.ventOpenAt = target.finale.age + hazard.warning;
  target.finale.openUntil = target.finale.ventOpenAt + 1.7;
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
  const hazard = finaleHazard(target, "well", { x: player.x, y: player.y, radius, warning: 1.42,
    duration: .40, color: "#f49372" });
  target.finale.ventOpenAt = target.finale.age + hazard.warning + hazard.duration;
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
  const firstHazard = f.hazards.length;
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
  const lastImpact = f.hazards.slice(firstHazard).reduce(
    (latest, hazard) => Math.max(latest, hazard.warning + hazard.duration), 0);
  f.ventOpenAt = f.age + lastImpact;
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
    gameAudio.bossAttack("hatch", f.gate.x, f.gate.y);
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
      gameAudio.bossAttack(hazard.type === "tide" ? "surge" : hazard.type === "well" ? "burst" : "beam",
        target.x, target.y);
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
  const lastImpact = f.hazards.reduce(
    (latest, hazard) => Math.max(latest, hazard.warning + hazard.duration - hazard.age), 0);
  const cadence = bossFinaleStages[target.type].interval - (target.hp < .4 ? .24 : 0);
  const protectedInterval = Math.max(cadence / (target.scaling?.tempoMul ?? 1), lastImpact + .8, f.openUntil - f.age + .12);
  const tempo = typeof sortieRules === "function" ? sortieRules().attackTempo : 1;
  f.attackInterval = Math.max(protectedInterval / tempo, lastImpact + .8, f.openUntil - f.age + .12);
  f.next = f.age + f.attackInterval;
  gameAudio.bossAttack("coil", target.x, target.y);
}

function resizeBossFinale(target) {
  const f = target.finale;
  f.hazards.length = 0;
  f.gate = null;
  if (f.age >= f.transform) {
    f.startX = target.x;
    f.startY = target.y;
  }
  f.next = Math.max(f.transform + .54, f.age + .8);
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
      gameAudio.bossAttack("burst", g.x, g.y);
      if (mode === "synapse") f.activeNode = f.nodes.find(part => part.hp > 0)?.index ?? -1;
    }
    return .18;
  }
  const remaining = f.nodes.reduce((sum, part) => sum + Number(part.hp > 0), 0);
  // Bone anchors and the neural sequence are the actual finale objective.
  // Blindly firing into the middle used to retain over half normal damage,
  // making their stated counter optional even with an ordinary late build.
  if (mode === "synapse") return remaining ? .12 + (3 - remaining) * .12 : 1.23;
  if (mode === "bones") return remaining ? .12 + (f.nodes.length - remaining) * .24 : 1.20;
  return remaining ? .53 + (f.nodes.length - remaining) * .17 : 1.20;
}

function finaleEllipse(ctx, x, y, rx, ry, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(.5, rx), Math.max(.5, ry), rotation, 0, Math.PI * 2);
}

function drawFinaleTide(ctx, hazard, quiet) {
  const warning = hazard.age < hazard.warning;
  const halfWidth = hazard.width * .42;
  const crestAt = warning
    ? y => hazard.x + hazard.width - halfWidth * waveRoll(y, hazard.age) * .29
    : y => finaleTideX(hazard, y, hazard.age);
  const material = hazard.purge ? signatureMaterials.water : signatureMaterials.fusion;
  drawWaterWall(ctx, { crestAt, gap: hazard.gap.center, size: hazard.gap.half * 2,
    direction: -1, halfWidth, age: hazard.age, warning, material }, quiet);
}

function drawFinaleVent(ctx, hazard, active, progress, quiet) {
  const closing = hazard.type === "pincer"
    ? viewport.height * .43 * (active ? 1 - progress : 0) : 0;
  const top = clamp(hazard.gap.center - hazard.gap.half - closing, 0, viewport.height);
  const bottom = clamp(hazard.gap.center + hazard.gap.half + closing, 0, viewport.height);
  signatureGuide(ctx, (top + bottom) / 2, bottom - top, active);
  const serrated = hazard.type === "pincer";
  const material = signatureMaterials[serrated ? "chitin" : "magma"];
  const charge = active ? 1 : .45 + progress * .33;
  for (const [edge, height, side] of [[top, top, -1], [bottom, viewport.height - bottom, 1]]) {
    if (height < 1) continue;
    const depth = Math.min(height, quiet ? 78 : 142);
    const heat = ctx.createLinearGradient(0, edge, 0, edge + side * depth);
    heat.addColorStop(0, material.rim);
    heat.addColorStop(.22, material.mid);
    heat.addColorStop(.61, material.dark);
    heat.addColorStop(1, "transparent");
    ctx.globalAlpha = charge * .64;
    ctx.fillStyle = heat;
    ctx.fillRect(0, edge + (side < 0 ? -depth : 0), viewport.width, depth);
    ctx.globalAlpha = charge;
    ctx.strokeStyle = material.rim;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, edge); ctx.lineTo(viewport.width, edge); ctx.stroke();
    ctx.lineWidth = quiet ? 1.35 : 2.15;
    const points = quiet ? 18 : 30;
    ctx.beginPath(); ctx.moveTo(0, edge);
    for (let i = 1; i <= points; i++) {
      const x = viewport.width * i / points;
      const step = viewport.width / points;
      const curl = quiet ? .34 : .34 + .34 * Math.sin(i * 1.58 - hazard.age * 13);
      if (serrated) {
        ctx.quadraticCurveTo(x - step * .82, edge + side * depth * curl, x - step * .24, edge);
        ctx.lineTo(x, edge + side * depth * .12);
      } else {
        ctx.bezierCurveTo(x - step * .81, edge + side * depth * .72,
          x - step * .43, edge + side * depth * curl, x, edge + side * depth * .04);
      }
    }
    ctx.stroke();
  }
}

function drawFinaleWire(ctx, hazard, active, progress, quiet) {
  const half = hazard.width / 2;
  drawMaterialRay(ctx, { x1: hazard.ax, y1: hazard.ay, x2: hazard.bx, y2: hazard.by,
    left: half, right: half, kind: hazard.material === "prism" ? "glass" : hazard.material,
    active, phase: progress, age: hazard.age }, quiet);
}

function drawFinaleHazard(ctx, hazard, quiet) {
  const active = hazard.age >= hazard.warning;
  const progress = active ? clamp((hazard.age - hazard.warning) / hazard.duration, 0, 1)
    : clamp(hazard.age / hazard.warning, 0, 1);
  ctx.save();
  ctx.lineWidth = active ? 2.7 : 1.7;
  ctx.strokeStyle = hazard.color;
  ctx.fillStyle = hazard.color + (active ? "55" : "1b");
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
      const material = signatureMaterials[hazard.type === "well" ? "void"
        : hazard.type === "ring" ? "plasma" : hazard.node === undefined ? "fusion" : "spore"];
      if (hazard.type === "ring") {
        const radius = active ? hazard.radius * progress : hazard.radius;
        ctx.globalAlpha = active ? .40 : .57;
        ctx.strokeStyle = material.rim;
        ctx.lineWidth = active ? Math.max(1.5, hazard.width * 2) : 1.5;
        ctx.beginPath(); ctx.arc(hazard.x, hazard.y, Math.max(1, radius), 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 2;
        ctx.globalAlpha = .92;
        ctx.strokeStyle = material.spark;
        const pulse = active ? radius : radius * (.12 + progress * .83);
        ctx.beginPath(); ctx.arc(hazard.x, hazard.y, Math.max(1, pulse), 0, Math.PI * 2); ctx.stroke();
      } else {
        drawSignatureImpact(ctx, hazard, material, active, active ? progress : 0, quiet);
      }
      break;
    }
    case "seam": {
      const half = hazard.width / 2;
      drawMaterialRay(ctx, { x1: hazard.x, y1: 0, x2: hazard.x, y2: viewport.height,
        left: half, right: half, kind: "void", active, phase: progress, age: hazard.age }, quiet);
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
  const action = bossActionPose(target, quiet);
  ctx.save();
  if (action.loss > 0) {
    ctx.translate(action.x * w, action.y * h);
    ctx.rotate(action.bank);
    ctx.scale(action.scaleX, action.scaleY);
    ctx.globalAlpha *= 1 - action.slack * .35;
  }
  drawFinaleShellBody(ctx, target, w, h, quiet, action);
  ctx.restore();
}

function drawFinaleShellBody(ctx, target, w, h, quiet, action) {
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
      time: age, charge: (lit ? .14 : .37 + .23 * Math.sin(age * 2.7)) * (1 - action.slack),
      ruptured: lit ? 1 : .16 + .4 * (1 - clamp(target.hp, 0, 1)),
      hit: target.hitFlash ? 1 : 0, recoil: 0, quiet, color, cooling: lit,
      action: { slack: action.slack },
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
  for (const hazard of f.hazards) {
    drawFinaleHazard(ctx, hazard, quiet);
    if (typeof drawFlightDangerPattern === "function") drawFlightDangerPattern(ctx, hazard);
  }
  if (f.gate && !f.gate.cut) {
    ctx.save();
    ctx.lineWidth = 1.7; ctx.strokeStyle = "#aaffec"; ctx.fillStyle = "#46efc82a"; ctx.setLineDash([5, 6]);
    finaleEllipse(ctx, f.gate.x, f.gate.y, f.gate.radius, f.gate.radius);
    ctx.fill(); ctx.stroke(); ctx.restore();
  }
  ctx.save();
  const glow = ctx.createRadialGradient(target.x, target.y, 0, target.x, target.y, Math.max(2, target.width * .65));
  glow.addColorStop(0, target.color + "2d"); glow.addColorStop(1, target.color + "00");
  ctx.fillStyle = glow;
  finaleEllipse(ctx, target.x, target.y, target.width * .65, target.width * .65);
  ctx.fill();
  ctx.translate(target.x, target.y);
  drawFinaleShell(ctx, target, g.width, g.height, quiet);
  ctx.restore();
  drawFinaleNodes(ctx, target, quiet);
}
