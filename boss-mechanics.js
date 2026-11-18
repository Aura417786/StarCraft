"use strict";

// Arena interactions for alien signatures. The same geometry drives the art,
// player collision, and gunfire, so a bright boundary never lies about safety.
const alienMechanicKinds = new Set([
  "ribCage", "bonefall", "magmaCover", "loom", "pincerLock", "mirrorShield",
  "mirrorDecoys", "tailConduit", "sporeNests", "sporeBlight", "riftFold", "neuralRelay", "fusionLimbs",
]);
const fusionLimbColors = ["#a7f5fc", "#ffe3cc", "#ffbce9"];

function mechanicRoom() {
  const left = flightBounds.left, right = bossPlayerRight();
  const top = flightBounds.top, bottom = flightBounds.bottom;
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

function mechanicAt(target, kind, at, duration, values) {
  queueAlienHazard(target, kind, signatureWarning(target, at), { duration, ...values });
  return bossHazards[bossHazards.length - 1];
}

function mechanicNode(x, y, radius, health, role = "") {
  return { x, y, radius, health, maxHealth: health, role };
}

function mechanicActive(hazard) { return hazard.age >= hazard.warning; }

function ribCageTell(target, at = 0, tight = false) {
  const room = mechanicRoom();
  const half = Math.max(player.height * 1.10, room.height * .22);
  const clearance = Math.min(room.height * .46, half);
  const y = clamp(target.lockY + target.side * room.height * .10, room.top + clearance, room.bottom - clearance);
  return mechanicAt(target, "ribCage", at, tight ? 2.55 : 2.2, {
    x: clamp(target.lockX, room.left + room.width * .18, room.right - room.width * .18), y,
    width: room.width * (tight ? .57 : .50), height: room.height, gap: half, thickness: Math.max(9, player.height * .22),
    color: alienSignatureColors.bone, sound: "burst",
  });
}

function bonefallTell(target, at = 0, wide = false) {
  const room = mechanicRoom();
  const radius = Math.min(room.width * .16, player.width * (wide ? .56 : .42));
  mechanicAt(target, "bonefall", at, .73, { x: player.x, y: player.y, width: radius,
    height: Math.min(room.height * .30, player.height * 1.6), color: alienSignatureColors.bone, sound: "burst" });
}

function magmaCoverTell(target, at = 0, wide = false) {
  const room = mechanicRoom();
  const radius = Math.max(12, Math.min(player.width * .39, room.width * .085));
  const half = Math.max(radius * 1.14, Math.min(room.height * .17, player.height * (wide ? 1.38 : .91)));
  const x = clamp(target.lockX + player.width * 1.04, room.left + room.width * .31, room.right - radius);
  const y = clamp(target.lockY, room.top + Math.min(half, room.height * .47), room.bottom - Math.min(half, room.height * .47));
  mechanicAt(target, "magmaCover", at, wide ? 2.8 : 2.3, { x, y, width: radius, height: half,
    coverHalf: Math.max(player.height * .36, half * .62), color: alienSignatureColors.magma, sound: "surge" });
}

function loomTell(target, at = 0, dense = false) {
  const room = mechanicRoom();
  const x = room.left + room.width * .58, radius = Math.max(9, player.height * .23);
  const nodes = [
    mechanicNode(room.left + room.width * .22, alienLane(.26), radius, 2, "knot"),
    mechanicNode(x, alienLane(.72), radius, 2, "knot"),
    mechanicNode(room.left + room.width * .88, alienLane(.32), radius, 2, "knot"),
  ];
  const links = dense ? [[0, 1], [1, 2], [0, 2]] : [[0, 1], [1, 2]];
  mechanicAt(target, "loom", at, dense ? 3.15 : 2.75, { nodes, links,
    thickness: Math.max(5, player.height * .18), color: alienSignatureColors.silk, sound: "coil" });
}

function pincerTell(target, at = 0, shock = false) {
  const room = mechanicRoom();
  const gap = Math.max(player.height * .72, room.height * .13);
  const reach = Math.min(player.speed * .45, room.height * .18);
  const y = clamp(target.lockY + target.side * reach, room.top + Math.min(gap, room.height / 2),
    room.bottom - Math.min(gap, room.height / 2));
  mechanicAt(target, "pincerLock", at, shock ? 2.5 : 1.65, { x: target.lockX, y, gap,
    width: Math.max(13, Math.min(room.width * .14, player.width * .62)), height: room.height,
    shock, color: alienSignatureColors.chitin, sound: "burst" });
}

function mirrorShieldTell(target, at = 0) {
  const room = mechanicRoom();
  const x = target.x - target.width * .55;
  mechanicAt(target, "mirrorShield", at, 1.75, { x, y: target.y,
    height: Math.min(room.height * .24, target.height * .69), nextReflect: 0,
    color: alienSignatureColors.glass, sound: "beam" });
}

function mirrorDecoyTell(target, at = 0, shielded = false) {
  const room = mechanicRoom();
  const radius = Math.max(11, player.height * .29);
  const nodes = [mechanicNode(room.left + room.width * .80, alienLane(.22), radius, 2, "decoy"),
    mechanicNode(room.left + room.width * .68, alienLane(.77), radius, 2, "decoy")];
  mechanicAt(target, "mirrorDecoys", at, shielded ? 2.9 : 2.4, { nodes,
    aimX: target.lockX, aimY: target.lockY, thickness: Math.max(7, player.height * .21),
    color: alienSignatureColors.glass, sound: "coil" });
}

function tailConduitTell(target, at = 0, lower = false) {
  const room = mechanicRoom();
  const y = lower ? alienLane(.76) : clamp(target.lockY, alienLane(.21), alienLane(.67));
  const node = mechanicNode(room.right + player.width * .31, y, Math.max(12, player.height * .27), 4, "tail");
  const endY = clamp(y + (lower ? -1 : 1) * room.height * .22, room.top, room.bottom);
  mechanicAt(target, "tailConduit", at, 1.26, { nodes: [node], x: room.left - player.width * .3, y: endY,
    bend: room.height * (lower ? -.10 : .13), width: Math.max(player.width, room.width * .16),
    thickness: Math.max(8, player.height * .23), color: alienSignatureColors.plasma, sound: "beam" });
}

function sporeNestsTell(target, at = 0, dense = false) {
  const room = mechanicRoom();
  const radius = Math.min(room.width * .16, Math.max(player.height * .78, room.height * .14));
  const nodes = [mechanicNode(room.left + room.width * .57, alienLane(.25), radius, 3, "spore"),
    mechanicNode(room.left + room.width * .72, alienLane(.72), radius, 3, "spore")];
  if (dense) nodes.push(mechanicNode(room.left + room.width * .37, alienLane(.48), radius * .76, 2, "spore"));
  mechanicAt(target, "sporeNests", at, dense ? 3.3 : 2.9, { nodes, infection: 0,
    color: alienSignatureColors.spore, sound: "hatch" });
}

function riftFoldTell(target, at = 0, split = false) {
  const room = mechanicRoom();
  const radius = Math.max(player.height, Math.min(room.width * .33, room.height * .36));
  const x = clamp(target.lockX + room.width * (split ? .14 : .18), room.left, room.right);
  const y = clamp(target.lockY + target.side * room.height * .09, room.top, room.bottom);
  mechanicAt(target, "riftFold", at, 2.5, { x, y, radius, split, side: target.side,
    thickness: Math.max(7, player.height * .20), color: alienSignatureColors.void, sound: "coil" });
}

function neuralRelayTell(target, at = 0, reverse = false) {
  const room = mechanicRoom();
  const radius = Math.max(11, player.height * .26);
  const nodes = [mechanicNode(room.left + room.width * .56, alienLane(.24), radius, 2, "neuron"),
    mechanicNode(room.left + room.width * .79, alienLane(.51), radius, 3, "neuron"),
    mechanicNode(room.left + room.width * .62, alienLane(.78), radius, 2, "neuron")];
  if (reverse) nodes.reverse();
  mechanicAt(target, "neuralRelay", at, 2.55, { nodes, x: room.left, y: target.lockY,
    thickness: Math.max(10, player.height * .24), color: alienSignatureColors.nerve, sound: "beam" });
}

function fusionLimbsTell(target, at = 0, combined = false) {
  const room = mechanicRoom(), radius = Math.max(12, player.height * .26);
  const y = clamp(target.lockY, alienLane(.17), alienLane(.83));
  const nodes = [
    mechanicNode(room.right + player.width * .32, alienLane(.22), radius, 3, "siphon"),
    mechanicNode(room.right + player.width * .19, alienLane(.77), radius, 4, "lance"),
  ];
  if (combined || target.enraged) nodes.push(mechanicNode(room.right + player.width * .36, alienLane(.50), radius, 3, "burst"));
  mechanicAt(target, "fusionLimbs", at, 3.03, { nodes, x: target.lockX, y, thickness: Math.max(8, player.height * .28),
    radius: Math.max(player.height * .5, Math.min(room.width * .19, room.height * .23)), color: alienSignatureColors.fusion, sound: "surge" });
}

function mechanicDistance(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = clamp(((x - x1) * dx + (y - y1) * dy) / Math.max(1, dx * dx + dy * dy), 0, 1);
  return Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
}

function cageBars(hazard, progress = signatureProgress(hazard)) {
  const rest = 1 - clamp(progress * 1.7, 0, 1);
  const top = hazard.y - hazard.gap, bottom = hazard.y + hazard.gap;
  return [top - Math.max(0, top - flightBounds.top) * rest,
    bottom + Math.max(0, flightBounds.bottom - bottom) * rest];
}

function pincerGap(hazard, progress = signatureProgress(hazard)) {
  return hazard.gap + hazard.height * .44 * (1 - clamp(progress * 2.1, 0, 1));
}

function tailPosition(hazard, t) {
  const node = hazard.nodes[0];
  return { x: node.x + (hazard.x - node.x) * t, y: node.y + (hazard.y - node.y) * t + Math.sin(Math.PI * t) * hazard.bend };
}

function riftSeams(hazard) {
  const x = hazard.x, y = hazard.y, r = hazard.radius, s = hazard.side;
  const main = [x - r * .94, y - s * r * .62, x + r * .87, y + s * r * .57];
  return hazard.split ? [main, [x - r * .26, y + s * r * .81, x + r * .51, y - s * r * .82]] : [main];
}

function liveLoomLinks(hazard) {
  return hazard.links.filter(([a, b]) => hazard.nodes[a].health > 0 && hazard.nodes[b].health > 0);
}

function activeRelayNode(hazard) { return hazard.nodes.find(node => node.health > 0); }

function resizeAlienMechanic(hazard, scaleX, scaleY, resizeY) {
  if (!alienMechanicKinds.has(hazard.kind)) return false;
  const scale = Math.min(scaleX, scaleY);
  for (const field of ["x", "aimX", "width"]) if (Number.isFinite(hazard[field])) hazard[field] *= scaleX;
  for (const field of ["y", "aimY"]) if (Number.isFinite(hazard[field])) hazard[field] = resizeY(hazard[field]);
  for (const field of ["height", "gap", "coverHalf", "bend"]) if (Number.isFinite(hazard[field])) hazard[field] *= scaleY;
  for (const field of ["radius", "thickness"]) if (Number.isFinite(hazard[field])) hazard[field] *= scale;
  for (const node of hazard.nodes || []) { node.x *= scaleX; node.y = resizeY(node.y); node.radius *= scale; }
  return true;
}

function constrainAlienPlayer(pilot, fromX, fromY) {
  const margin = pilot.height * .16;
  for (const hazard of bossHazards) {
    if (!mechanicActive(hazard)) continue;
    if (hazard.kind === "ribCage" && Math.abs(pilot.x - hazard.x) < hazard.width / 2) {
      const clearance = hazard.thickness * .5 + margin;
      for (const y of cageBars(hazard)) {
        if (fromY < y - clearance && pilot.y >= y - clearance) pilot.y = y - clearance;
        if (fromY > y + clearance && pilot.y <= y + clearance) pilot.y = y + clearance;
      }
    }
    if (hazard.kind === "pincerLock" && Math.abs(pilot.y - hazard.y) > pincerGap(hazard) - margin) {
      const edge = hazard.width + margin;
      if (fromX < hazard.x - edge && pilot.x > hazard.x - edge) pilot.x = hazard.x - edge;
      if (fromX > hazard.x + edge && pilot.x < hazard.x + edge) pilot.x = hazard.x + edge;
    }
  }
}

function alienMechanicVector(hazard, pilot) {
  if (!mechanicActive(hazard)) return null;
  const dx = hazard.x - pilot.x, dy = hazard.y - pilot.y;
  if (hazard.kind === "tide" && hazard.material === "water") {
    const p = signatureProgress(hazard);
    const behind = hazard.direction * (alienTideX(hazard, pilot.y, p) - pilot.x);
    if (behind < 0 || behind >= hazard.thickness * 3.5) return null;
    const strength = pilot.speed * .21 * (1 - behind / (hazard.thickness * 3.5));
    return { x: hazard.direction * strength, y: -Math.sign(dy || alienTideGap(hazard, p) - pilot.y) * strength * .19 };
  }
  if (hazard.kind === "riftFold") {
    const distance = Math.hypot(dx, dy);
    if (distance < 1 || distance > hazard.radius || signatureProgress(hazard) > .79) return null;
    const force = pilot.speed * (.19 + .21 * (1 - distance / hazard.radius));
    return { x: (dx + dy * hazard.side * .33) * force / distance,
      y: (dy - dx * hazard.side * .33) * force / distance };
  }
  if (hazard.kind === "fusionLimbs" && hazard.nodes[0].health > 0 && signatureProgress(hazard) < .5) {
    const distance = Math.hypot(dx, dy);
    if (distance < 1 || distance > hazard.radius * 2.1) return null;
    const strength = pilot.speed * .24 * (1 - distance / (hazard.radius * 2.1));
    return { x: dx / distance * strength, y: dy / distance * strength };
  }
  return null;
}

function alienMechanicSlow(hazard, pilot) {
  if (hazard.kind !== "loom" || !mechanicActive(hazard)) return 1;
  for (const [a, b] of liveLoomLinks(hazard)) {
    const one = hazard.nodes[a], two = hazard.nodes[b];
    if (mechanicDistance(pilot.x, pilot.y, one.x, one.y, two.x, two.y) < hazard.thickness + pilot.height * .19) return .52;
  }
  return 1;
}

function alienMechanicHits(hazard, pilot) {
  const p = signatureProgress(hazard), r = pilot.height * .16;
  const dx = Math.abs(pilot.x - hazard.x), dy = Math.abs(pilot.y - hazard.y);
  switch (hazard.kind) {
    case "ribCage": return dx < hazard.width / 2 && cageBars(hazard).some(y => Math.abs(pilot.y - y) < hazard.thickness / 2 + r);
    case "bonefall": return p > .36 && dx < hazard.width + r && dy < hazard.height + r;
    case "magmaCover": {
      const protectedByRock = pilot.x < hazard.x - hazard.width && dy < hazard.coverHalf - r * .45;
      return dy < hazard.height + r && !protectedByRock;
    }
    case "pincerLock": {
      const atClaw = dx < hazard.width + r && dy > pincerGap(hazard) - r;
      return atClaw || (hazard.shock && p > .78 && dx < hazard.width * 1.7 + r && dy > hazard.gap + r);
    }
    case "mirrorDecoys": return p > .61 && p < .82 && hazard.nodes.some(node => node.health > 0
      && mechanicDistance(pilot.x, pilot.y, node.x, node.y, hazard.aimX, hazard.aimY) < hazard.thickness + r);
    case "tailConduit": {
      const node = hazard.nodes[0];
      if (node.health <= 0) return false;
      const head = tailPosition(hazard, p), tail = tailPosition(hazard, Math.max(0, p - .18));
      return mechanicDistance(pilot.x, pilot.y, head.x, head.y, tail.x, tail.y) < hazard.thickness + r;
    }
    case "sporeBlight": return p > .18 && Math.hypot(dx, dy) < hazard.radius + r;
    case "riftFold": return p > .68 && riftSeams(hazard).some(seam => mechanicDistance(pilot.x, pilot.y, ...seam) < hazard.thickness + r);
    case "neuralRelay": {
      const node = activeRelayNode(hazard);
      const moving = Math.hypot(pilot.x - (pilot.previousX ?? pilot.x), pilot.y - (pilot.previousY ?? pilot.y)) > .45;
      return !!node && moving && p > .57 && mechanicDistance(pilot.x, pilot.y, node.x, node.y, hazard.x, hazard.y) < hazard.thickness + r;
    }
    case "fusionLimbs": {
      const lance = hazard.nodes[1], burst = hazard.nodes[2];
      const onLance = lance.health > 0 && p > .43 && p < .61
        && mechanicDistance(pilot.x, pilot.y, lance.x, lance.y, mechanicRoom().left, hazard.y) < hazard.thickness + r;
      const onBurst = burst?.health > 0 && p > .71 && Math.hypot(dx, dy) < hazard.radius + r;
      return onLance || onBurst;
    }
    default: return false;
  }
}

function updateAlienMechanic(hazard, seconds) {
  if (hazard.kind !== "sporeNests" || hazard.released || !mechanicActive(hazard)) return;
  const inside = hazard.nodes.some(node => node.health > 0 && Math.hypot(player.x - node.x, player.y - node.y) < node.radius);
  hazard.infection = clamp(hazard.infection + seconds * (inside ? 1.75 : -.8), 0, 1);
  if (hazard.infection < 1 || !boss) return;
  hazard.released = true;
  mechanicAt(boss, "sporeBlight", .85, .64, { x: player.x, y: player.y, radius: Math.max(24, player.height * .81),
    color: alienSignatureColors.spore, sound: "burst" });
}

function roundTouchesMechanic(bullet, x, y, radius) {
  return mechanicDistance(x, y, bullet.previousX ?? bullet.x, bullet.previousY ?? bullet.y, bullet.x, bullet.y)
    < radius + (bullet.halfHeight ?? 2.5);
}

function interceptAlienRound(bullet) {
  for (const hazard of bossHazards) {
    // Future combo apparatus does not exist for weapons until its tell is visible.
    if (hazard.age < (hazard.tellAt ?? 0)) continue;
    if (hazard.kind === "magmaCover" && mechanicActive(hazard) && !bullet.piercesShield
      && roundTouchesMechanic(bullet, hazard.x, hazard.y, hazard.width * .87)) return true;
    if (hazard.kind === "mirrorShield" && mechanicActive(hazard) && !bullet.piercesShield
      && (bullet.previousX ?? bullet.x) <= hazard.x && bullet.x >= hazard.x && Math.abs(bullet.y - hazard.y) < hazard.height) {
      if (hazard.age >= hazard.nextReflect && boss) {
        hazard.nextReflect = hazard.age + 1.5;
        // Reflection is an announced sheet of light, never a generic packet.
        // Its captured incident lane stays fixed during the warning.
        queueAlienHazard(boss,"filament",1.4,{originX:hazard.x,originY:bullet.y,
          endX:flightBounds.left-12,endY:bullet.y,thickness:Math.max(12,player.height*.26),
          swingY:0,duration:.65,material:"glass",color:hazard.color,sound:"beam",
          reflection:true,attackLabel:hazard.attackLabel});
      }
      return true;
    }
    if (hazard.kind === "riftFold" && mechanicActive(hazard) && bullet.lastFold !== hazard
      && roundTouchesMechanic(bullet, hazard.x, hazard.y, hazard.radius)) {
      bullet.lastFold = hazard;
      bullet.vy = (bullet.vy ?? 0) + hazard.side * 135;
    }
    for (const node of hazard.nodes || []) {
      if (node.health <= 0 || bullet.hitMechanicNodes?.has(node)) continue;
      const hitRadius = node.role === "spore" ? node.radius * .36 : node.radius;
      if (!roundTouchesMechanic(bullet, node.x, node.y, hitRadius)) continue;
      if (hazard.kind !== "neuralRelay" || node === activeRelayNode(hazard)) {
        if (bullet.piercesShield) (bullet.hitMechanicNodes ??= new Set()).add(node);
        node.health = Math.max(0, node.health - (bullet.piercesShield || bullet.visual === "lance" ? 2 : 1));
        if (!node.health) {
          BossResonance.sever(boss,node.x,node.y,node.radius);
          combatBurst(node.x, node.y, .46, hazard.color);
          gameAudio.bossAttack("burst", node.x, node.y);
          // Cutting the attack apparatus creates an actual, short payoff.
          // At most one opening per move, even with simultaneous area fire.
          if (hazard.kind === "fusionLimbs" || hazard.nodes.every(part => part.health <= 0)) rewardAlienCounter();
        }
      }
      return !bullet.piercesShield;
    }
  }
  return false;
}

function drawMechanicLine(ctx, x1, y1, x2, y2, width = 1) {
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function mechanicDiamond(ctx, x, y, r, fill = true) {
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
  if (fill) ctx.fill();
  ctx.stroke();
}

function drawMechanicZone(ctx, x, y, width, height, color, active, quiet) {
  drawBossFieldWash(ctx,x,y,width,height,color,active ? .96 : .59,quiet ? 0 : battleTime);
  ctx.save(); ctx.globalAlpha *= active ? .62 : .78;
  bossRangeMarks(ctx,x,y,width,height,color,height>width);
  ctx.restore();
}

function drawMagmaCover(ctx, hazard, active, quiet) {
  const { x, y, width, height, coverHalf } = hazard;
  const left = x - width;
  const right = Math.max(x + width, (boss?.x ?? viewport.width) - (boss?.width ?? 0) * .15);
  const time = quiet ? 0 : hazard.age;
  function drawLane(start, end, top, depth) {
    if (depth < 2 || end - start < 2) return;
    if (active) {
      const cy = top + depth / 2;
      NextgenVfx.drawMagmaFissure(ctx, { x1: start, y1: cy, x2: end, y2: cy, width: depth },
        signatureMaterials.magma, time, .91);
    } else {
      drawMechanicZone(ctx, start, top, end - start, depth, hazard.color, false, quiet);
    }
  }
  drawLane(left, right, y - height, height * 2);
  drawLane(0, left, y - height, height - coverHalf);
  drawLane(0, left, y + coverHalf, height - coverHalf);
  BossConfluenceVfx.safeGuide(ctx, 0, y - coverHalf, left, coverHalf * 2, active, time);
  NextgenVfx.drawMagmaShell(ctx, x, y, width, coverHalf, time, active ? 1 : .55);
}

function drawFusionLimbs(ctx, hazard, active, progress, quiet) {
  const { x, y, nodes, radius, thickness } = hazard;
  const [siphon, lance, burst] = nodes;
  const time = quiet ? 0 : hazard.age;
  if (siphon.health > 0 && progress < .5) {
    const fieldRadius = radius * (1.98 - progress * .44);
    BossConfluenceVfx.ring(ctx, { x, y, radius: fieldRadius, innerRadius: fieldRadius * .68 },
      -time, active ? .93 : .6, "siphon", quiet);
    BossConfluenceVfx.beam(ctx, { x1: siphon.x, y1: siphon.y, x2: x, y2: y, width: 7 },
      time, active ? .68 : .31, "siphon", quiet);
  }
  if (lance.health > 0 && progress < .61) {
    const line = { x1: lance.x, y1: lance.y, x2: mechanicRoom().left, y2: y,
      width: thickness * 2 };
    if (active && progress > .43) BossConfluenceVfx.beam(ctx, line, time, 1, "lance", quiet);
    else {
      ctx.strokeStyle = "#ffd7b78a";
      ctx.setLineDash([10, 7]);
      drawMechanicLine(ctx, line.x1, line.y1, line.x2, line.y2, 1.75);
      ctx.setLineDash([]);
    }
  }
  if (burst?.health > 0) {
    const live = active && progress > .71;
    if (live) BossConfluenceVfx.ring(ctx, { x, y, radius, innerRadius: 0 },
      time, .94, "burst", quiet);
    else {
      ctx.strokeStyle = "#ffaee4";
      ctx.setLineDash([6, 7]);
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  for (const [index, node] of nodes.entries()) {
    BossConfluenceVfx.tether(ctx, node, index, boss, time, quiet);
    BossConfluenceVfx.fusionNode(ctx, node, node.role, time, active ? 1 : .7, quiet, index + 1);
  }
}

function drawAlienMechanic(ctx, hazard, quiet) {
  const { kind, x, y, color } = hazard;
  const active = mechanicActive(hazard), p = signatureProgress(hazard);
  const elemental = !boss?.finale && typeof bossElementalVfx === "function" ? bossElementalVfx(boss?.type) : null;
  if (elemental?.mechanic?.(ctx, hazard, { active, progress: p, quiet })) return;
  if (BossEnergyVfx.drawMechanic(ctx, hazard, quiet)) return;
  if (BossCreatureVfx.drawMechanic(ctx, hazard, { active, progress: p, quiet })) return;
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
  switch (kind) {
    case "magmaCover": drawMagmaCover(ctx, hazard, active, quiet); break;
    case "mirrorShield": {
      const h = hazard.height, w = 13;
      const surface = ctx.createLinearGradient(x - w, y - h, x + w, y + h);
      surface.addColorStop(0, "#f6fcff"); surface.addColorStop(.3, "#4f8cc5a0");
      surface.addColorStop(.59, "#cdf8ff"); surface.addColorStop(1, "#7d60b4e0");
      ctx.fillStyle = surface; ctx.globalAlpha = active ? .88 : .42;
      ctx.beginPath(); ctx.moveTo(x + w, y - h); ctx.lineTo(x - w, y - h * .76);
      ctx.lineTo(x - w, y + h * .72); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill(); ctx.stroke();
      for (let i = -2; i <= 2; i++) {
        const mark = y + i * h * .28;
        ctx.beginPath(); ctx.moveTo(x + 4, mark - 5); ctx.lineTo(x - 4, mark); ctx.lineTo(x + 4, mark + 5); ctx.stroke();
      }
      break;
    }
    case "sporeNests": {
      for (const node of hazard.nodes) {
        if (node.health <= 0) continue;
        const time = quiet ? 0 : hazard.age;
        NextgenVfx.drawSporeCloud(ctx, node, time, active ? .84 : .42);
        NextgenVfx.drawSporePod(ctx, node, time, active ? 1 : .67, node.radius * .42);
      }
      if (hazard.infection > 0) {
        ctx.lineWidth = 2.5; ctx.strokeStyle = "#f2f7b8";
        ctx.beginPath(); ctx.arc(player.x, player.y, player.height * .37, -Math.PI / 2,
          -Math.PI / 2 + hazard.infection * Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case "sporeBlight": {
      NextgenVfx.drawSporeCloud(ctx, hazard, quiet ? 0 : hazard.age, active ? .91 : .36);
      if (!active) {
        ctx.strokeStyle = color;
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(x, y, hazard.radius, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case "riftFold": {
      const r = hazard.radius;
      ctx.globalAlpha = 1;
      const time = quiet ? 0 : hazard.age;
      NextgenVfx.drawVoid(ctx, {x, y, radius:r}, signatureMaterials.void,
        time, active ? .98 : .8);
      if (active) BossConfluenceVfx.accretionWake(ctx, x, y, r, time, quiet);
      // The disk pulls but is not a solid damage area. Only these late seams hit.
      for (const seam of riftSeams(hazard)) {
        const live = p > .68;
        if (live) {
          ctx.setLineDash([]);
          NextgenVfx.drawRift(ctx, {x1:seam[0],y1:seam[1],x2:seam[2],y2:seam[3],width:hazard.thickness*2},
            signatureMaterials.void, quiet ? 0 : hazard.age, .95);
        } else {
          ctx.setLineDash([6,5]);ctx.strokeStyle=color+"bd";
          drawMechanicLine(ctx,...seam,1.4);
        }
      }
      break;
    }
    case "fusionLimbs": drawFusionLimbs(ctx, hazard, active, p, quiet); break;
  }
  ctx.restore();
}
