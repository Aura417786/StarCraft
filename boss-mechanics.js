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
    if (hazard.kind === "magmaCover" && mechanicActive(hazard) && !bullet.piercesShield
      && roundTouchesMechanic(bullet, hazard.x, hazard.y, hazard.width * .87)) return true;
    if (hazard.kind === "mirrorShield" && mechanicActive(hazard) && !bullet.piercesShield
      && (bullet.previousX ?? bullet.x) <= hazard.x && bullet.x >= hazard.x && Math.abs(bullet.y - hazard.y) < hazard.height) {
      if (hazard.age >= hazard.nextReflect) {
        hazard.nextReflect = hazard.age + .34;
        const speed = Math.max(215, Math.min(370, Math.abs(bullet.vx ?? 400) * .52));
        // A violet return packet follows the incident lane. Leave that lane instead of feeding the mirror.
        addBossProjectile(hazard.x, bullet.y, -speed, clamp((bullet.vy ?? 0) * .72, -130, 130),
          { color: hazard.color, glyph: "prism", radius: 8, attackLabel: hazard.attackLabel });
        gameAudio.bossAttack("coil", hazard.x, bullet.y);
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
          combatBurst(node.x, node.y, .46, hazard.color);
          gameAudio.bossAttack("burst", node.x, node.y);
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
  const fill = ctx.createLinearGradient(0, y, 0, y + height);
  fill.addColorStop(0, color + (active ? "62" : "28"));
  fill.addColorStop(.48, color + (active ? "30" : "08"));
  fill.addColorStop(1, color + (active ? "74" : "25"));
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = color;
  ctx.setLineDash(active ? [] : [7, 6]);
  ctx.strokeRect(x, y, width, height);
  if (active || !quiet) {
    ctx.save();
    ctx.globalAlpha *= active ? .28 : .18;
    ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
    const step = Math.max(24, width / 26);
    for (let i = -height; i < width; i += step) drawMechanicLine(ctx, x + i, y, x + i + height, y + height);
    ctx.restore();
  }
  ctx.setLineDash([]);
}

function drawBoneRib(ctx, x, y, width, thickness, direction, color, active) {
  if (!active) {
    ctx.setLineDash([9, 5]);
    ctx.strokeStyle = color;
    drawMechanicLine(ctx, x - width / 2, y, x + width / 2, y, 2);
    ctx.setLineDash([]);
    return;
  }
  const tooth = width / 9;
  const surface = ctx.createLinearGradient(0, y - thickness * direction, 0, y + thickness * direction);
  surface.addColorStop(0, "#372939"); surface.addColorStop(.51, "#9e796e"); surface.addColorStop(1, "#ffedd0");
  ctx.strokeStyle = color;
  ctx.fillStyle = surface;
  ctx.lineWidth = 1.5;
  for (let index = 0; index < 9; index++) {
    const start = x - width / 2 + tooth * index;
    const tip = start + tooth * (.61 + Math.sin(index * 3.7) * .10);
    ctx.beginPath(); ctx.moveTo(start, y - thickness * direction * .72);
    ctx.quadraticCurveTo(start + tooth * .55, y - thickness * direction, start + tooth, y - thickness * direction * .53);
    ctx.quadraticCurveTo(start + tooth * .87, y + thickness * direction * .11, tip, y + thickness * direction * .52);
    ctx.quadraticCurveTo(start + tooth * .27, y + thickness * direction * .14, start, y - thickness * direction * .72);
    ctx.fill(); ctx.stroke();
  }
}

function drawMagmaLane(ctx, x, y, width, height, hazard, active, quiet) {
  drawMechanicZone(ctx, x, y, width, height, hazard.color, active, quiet);
  if (!active || quiet || width <= 2 || height <= 2) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
  const tide = hazard.age * 11;
  const lava = ctx.createLinearGradient(0, y, 0, y + height);
  lava.addColorStop(0, "#ff9953b0"); lava.addColorStop(.26, "#d748316f");
  lava.addColorStop(.55, "#ffc57712"); lava.addColorStop(.84, "#ffb15a76");
  lava.addColorStop(1, "#a54436d0");
  ctx.fillStyle = lava;
  ctx.fillRect(x, y, width, height);
  for (let stream = 0; stream < 5; stream++) {
    const center = y + height * (.16 + stream * .17), amp = height * (.055 + stream % 3 * .021);
    ctx.strokeStyle = stream % 2 ? "#ffe1aa83" : "#742937a0";
    ctx.lineWidth = 1.4 + stream % 3;
    ctx.beginPath();
    for (let i = 0; i <= 9; i++) {
      const sx = x + width * i / 9;
      const sy = center + amp * (Math.sin(i * .9 + tide + stream) + .41 * Math.sin(i * 2.4 + tide * .81));
      if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawMagmaCover(ctx, hazard, active, quiet) {
  const { x, y, width, height, coverHalf } = hazard;
  const right = Math.max(x + width, (boss?.x ?? viewport.width) - (boss?.width ?? 0) * .15), left = x - width;
  drawMagmaLane(ctx, left, y - height, right - left, 2 * height, hazard, active, quiet);
  drawMagmaLane(ctx, 0, y - height, left, height - coverHalf, hazard, active, quiet);
  drawMagmaLane(ctx, 0, y + coverHalf, left, height - coverHalf, hazard, active, quiet);
  ctx.fillStyle = "#211d23b8";
  ctx.fillRect(0, y - coverHalf, left, coverHalf * 2);
  ctx.strokeStyle = "#c6d9dd";
  ctx.setLineDash([5, 5]);
  drawMechanicLine(ctx, 0, y - coverHalf, left, y - coverHalf);
  drawMechanicLine(ctx, 0, y + coverHalf, left, y + coverHalf);
  ctx.setLineDash([]);
  for (let mark = 1; mark < 5; mark++) {
    const mx = left * mark / 5;
    ctx.beginPath(); ctx.moveTo(mx + 4, y - 5); ctx.lineTo(mx - 3, y); ctx.lineTo(mx + 4, y + 5); ctx.stroke();
  }
  const stone = ctx.createLinearGradient(x - width, y - coverHalf, x + width, y + coverHalf);
  stone.addColorStop(0, "#b76842"); stone.addColorStop(.24, "#453642"); stone.addColorStop(.58, "#272531"); stone.addColorStop(1, "#ef8a48");
  ctx.fillStyle = active ? stone : "#65575d8c";
  ctx.strokeStyle = active ? "#ffc082" : "#ffe0af";
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(x - width * .68, y - coverHalf * .86); ctx.lineTo(x + width * .29, y - coverHalf);
  ctx.lineTo(x + width, y - coverHalf * .30); ctx.lineTo(x + width * .84, y + coverHalf * .51);
  ctx.lineTo(x + width * .13, y + coverHalf); ctx.lineTo(x - width * .88, y + coverHalf * .71);
  ctx.lineTo(x - width, y - coverHalf * .28); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#120f1b70";
  ctx.beginPath(); ctx.moveTo(x - width, y - coverHalf * .28); ctx.lineTo(x - width * .17, y - coverHalf * .10);
  ctx.lineTo(x + width * .13, y + coverHalf); ctx.lineTo(x - width * .88, y + coverHalf * .71); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = active ? "#ffb97690" : "#c38c6e70";
  ctx.beginPath(); ctx.moveTo(x - width * .68, y - coverHalf * .86);
  ctx.lineTo(x - width * .17, y - coverHalf * .10); ctx.lineTo(x + width * .18, y + coverHalf * .04);
  ctx.lineTo(x + width * .13, y + coverHalf); ctx.moveTo(x + width * .29, y - coverHalf);
  ctx.lineTo(x + width * .36, y - coverHalf * .22); ctx.lineTo(x + width * .18, y + coverHalf * .04);
  ctx.lineTo(x + width * .67, y + coverHalf * .32); ctx.stroke();
}

function drawArenaNode(ctx, node, color, live = true, number = null, showRadius = false) {
  if (!node.health) return;
  const r = showRadius ? node.radius * .36 : node.radius;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = live ? 2.2 : 1.15;
  if (showRadius) {
    const glow = ctx.createRadialGradient(node.x, node.y, r, node.x, node.y, Math.max(r + 1, node.radius));
    glow.addColorStop(0, color + "5d"); glow.addColorStop(1, color + "10");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2); ctx.fill();
    ctx.setLineDash([4, 5]); ctx.stroke(); ctx.setLineDash([]);
  }
  if (node.role !== "decoy") {
    const core = ctx.createRadialGradient(node.x - r * .21, node.y - r * .29, r * .03, node.x, node.y, r * .85);
    core.addColorStop(0, live ? "#f9fcf4" : color + "b8");
    core.addColorStop(.29, live ? color : "#413a56");
    core.addColorStop(.66, live ? color + "8a" : "#242434");
    core.addColorStop(1, "#171426");
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.ellipse(node.x, node.y, r * .68, r * .76, -.33, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color + "9a";
    ctx.lineWidth = Math.max(1.4, r * .075);
    for (let rib = 0; rib < 5; rib++) {
      const b = rib - 2;
      ctx.beginPath(); ctx.moveTo(node.x - r * .46, node.y + b * r * .16);
      ctx.quadraticCurveTo(node.x + r * .02, node.y + (b * .24 - .23) * r, node.x + r * .51, node.y + (b * .15 - .14) * r);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = live ? 1.85 : 1.15;
  ctx.setLineDash(live ? [] : [4, 4]);
  mechanicDiamond(ctx, node.x, node.y, r, false);
  ctx.setLineDash([]);
  const progress = node.health / node.maxHealth;
  if (progress < 1) {
    ctx.fillStyle = color;
    ctx.fillRect(node.x - r * .58, node.y + r + 4, r * 1.16 * progress, 2);
  }
  if (number !== null) {
    ctx.fillStyle = "#15111f";
    ctx.beginPath(); ctx.arc(node.x, node.y, 6.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = live ? "#fafff8" : color;
    ctx.font = "bold 9px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(number), node.x, node.y + .25);
  }
  ctx.restore();
}

function drawFusionTether(ctx, node, index, color, quiet) {
  if (!boss || node.health <= 0) return;
  const anchorX = boss.x - boss.width * .31, anchorY = boss.y + (index - 1) * boss.height * .19;
  const length = anchorX - node.x;
  const bend = quiet ? 0 : Math.sin(boss.age * 3.3 + index * 1.6) * node.radius * .28;
  ctx.save();
  ctx.lineCap = "round";
  const shell = ctx.createLinearGradient(node.x, node.y, anchorX, anchorY);
  shell.addColorStop(0, color + "b0"); shell.addColorStop(.50, "#413054d9"); shell.addColorStop(1, "#33243e");
  ctx.beginPath(); ctx.moveTo(node.x + node.radius * .37, node.y);
  ctx.bezierCurveTo(node.x + length * .24, node.y - bend, anchorX - length * .21, anchorY + bend, anchorX, anchorY);
  ctx.strokeStyle = shell; ctx.lineWidth = node.radius * .62; ctx.stroke();
  ctx.strokeStyle = color + "63"; ctx.lineWidth = node.radius * .18; ctx.stroke();
  ctx.restore();
}

function drawClawLock(ctx, hazard, active, p, quiet) {
  const { x, y, width, color } = hazard;
  const gap = active ? pincerGap(hazard, p) : hazard.gap;
  const edge = p > .73 && hazard.shock ? width * 1.7 : width;
  for (const side of [-1, 1]) {
    const tip = y + gap * side, end = side < 0 ? 0 : viewport.height;
    const height = Math.abs(end - tip);
    drawMechanicZone(ctx, x - edge, Math.min(end, tip), edge * 2, height, color, active && p > .48, quiet);
    if (!active) continue;
    ctx.fillStyle = "#183b39";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - width, end); ctx.lineTo(x + width, end);
    ctx.lineTo(x + width, tip + side * width); ctx.quadraticCurveTo(x, tip + side * width * .36, x - width * .37, tip);
    ctx.quadraticCurveTo(x - width * 1.14, tip + side * width * .51, x - width, tip + side * width * 1.63);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Keep the center passage readable even when the warning's distant jaws
  // start behind the top or bottom HUD. These rails mark the final opening.
  const marker = Math.min(12, Math.max(6, width * .27));
  ctx.strokeStyle = "#e5ffde";
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    const rail = y + side * hazard.gap * .69;
    ctx.beginPath();
    ctx.moveTo(x - width - marker, rail + marker * side);
    ctx.lineTo(x - width - marker, rail);
    ctx.lineTo(x + width + marker, rail);
    ctx.lineTo(x + width + marker, rail + marker * side);
    ctx.stroke();
  }
}

function drawAlienMechanic(ctx, hazard, quiet) {
  const { kind, x, y, color } = hazard;
  const active = mechanicActive(hazard), p = signatureProgress(hazard);
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
  switch (kind) {
    case "ribCage": {
      const [top, bottom] = cageBars(hazard, active ? p : 1);
      drawBoneRib(ctx, x, top, hazard.width, hazard.thickness, 1, color, active);
      drawBoneRib(ctx, x, bottom, hazard.width, hazard.thickness, -1, color, active);
      break;
    }
    case "bonefall": {
      const { width, height } = hazard;
      drawMechanicZone(ctx, x - width, y - height, width * 2, height * 2, color, active && p > .36, quiet);
      if (active) {
        const head = y - height - Math.max(0, .45 - p) * viewport.height * .49;
        ctx.beginPath(); ctx.moveTo(x - width * .58, head - height); ctx.lineTo(x + width * .40, head - height);
        ctx.lineTo(x + width * .62, head); ctx.lineTo(x, head + height * .77); ctx.lineTo(x - width * .46, head); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case "magmaCover": drawMagmaCover(ctx, hazard, active, quiet); break;
    case "loom": {
      for (const [a, b] of liveLoomLinks(hazard)) {
        const one = hazard.nodes[a], two = hazard.nodes[b];
        ctx.setLineDash(active ? [] : [5, 5]);
        ctx.globalAlpha = active ? .35 : .64;
        drawMechanicLine(ctx, one.x, one.y, two.x, two.y, active ? hazard.thickness * 2 : 1.4);
        ctx.globalAlpha = .86;
        if (active) for (const offset of [-3, 3]) drawMechanicLine(ctx, one.x, one.y + offset, two.x, two.y - offset);
      }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      for (const node of hazard.nodes) drawArenaNode(ctx, node, color);
      break;
    }
    case "pincerLock": drawClawLock(ctx, hazard, active, p, quiet); break;
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
    case "mirrorDecoys": {
      for (const node of hazard.nodes) {
        if (!node.health) continue;
        const hot = active && p > .61 && p < .82;
        ctx.globalAlpha = hot ? .9 : .42;
        ctx.setLineDash(hot ? [] : [4, 7]);
        drawMechanicLine(ctx, node.x, node.y, hazard.aimX, hazard.aimY, hot ? hazard.thickness * 1.6 : 1.5);
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(node.x, node.y, node.radius * 1.64, node.radius * .72, -.18, 0, Math.PI * 2); ctx.stroke();
        drawArenaNode(ctx, node, color, false);
      }
      if (boss) { ctx.fillStyle = "#fff4cf"; mechanicDiamond(ctx, boss.x, boss.y - boss.height * .38, 7); }
      break;
    }
    case "tailConduit": {
      if (!hazard.nodes[0].health) break;
      const segments = quiet ? 10 : 22;
      for (let i = 0; i < segments; i++) {
        const t = (i + .5) / segments, hot = active && t <= p && t >= p - .18;
        ctx.globalAlpha = hot ? 1 : .41;
        const a = tailPosition(hazard, i / segments), b = tailPosition(hazard, (i + .68) / segments);
        if (hot) {
          ctx.strokeStyle = color + "70";
          drawMechanicLine(ctx, a.x, a.y, b.x, b.y, hazard.thickness * 1.8);
        }
        ctx.strokeStyle = hot ? "#f4fcff" : color;
        drawMechanicLine(ctx, a.x, a.y, b.x, b.y, hot ? 3.2 : 1.25);
      }
      ctx.globalAlpha = 1; drawArenaNode(ctx, hazard.nodes[0], color);
      break;
    }
    case "sporeNests": {
      for (const node of hazard.nodes) drawArenaNode(ctx, node, color, true, null, true);
      if (hazard.infection > 0) {
        ctx.lineWidth = 2.5; ctx.strokeStyle = "#f2f7b8";
        ctx.beginPath(); ctx.arc(player.x, player.y, player.height * .37, -Math.PI / 2,
          -Math.PI / 2 + hazard.infection * Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case "sporeBlight": {
      ctx.fillStyle = color + (active ? "60" : "16"); ctx.setLineDash(active ? [] : [4, 5]);
      ctx.beginPath(); ctx.arc(x, y, hazard.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    }
    case "riftFold": {
      const r = hazard.radius;
      const depth = ctx.createRadialGradient(x, y, 3, x, y, r);
      depth.addColorStop(0, "#180a23a0"); depth.addColorStop(.8, "#ad6ee72c"); depth.addColorStop(1, "#e69cff07");
      ctx.fillStyle = depth;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (let index = 0; index < 5; index++) {
        const a = index * Math.PI * .4 + (quiet ? 0 : p * 1.7) * hazard.side;
        ctx.globalAlpha = active ? .63 : .35;
        ctx.beginPath(); ctx.arc(x, y, r * (.32 + index * .12), a, a + 1.9); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const seam of riftSeams(hazard)) {
        const live = p > .68;
        ctx.setLineDash(live ? [] : [6, 5]);
        ctx.strokeStyle = color + (live ? "88" : "8a");
        drawMechanicLine(ctx, ...seam, live ? hazard.thickness * 2 : 1.4);
        if (live) { ctx.strokeStyle = "#fde1ff"; drawMechanicLine(ctx, ...seam, 2.8); }
      }
      break;
    }
    case "neuralRelay": {
      const live = activeRelayNode(hazard);
      if (!live) break;
      ctx.setLineDash(active && p > .57 ? [] : [4, 6]);
      drawMechanicLine(ctx, live.x, live.y, x, y, active && p > .57 ? hazard.thickness * 1.6 : 1.3);
      ctx.setLineDash([]);
      const iconX = (x + live.x) * .5, iconY = (y + live.y) * .5;
      ctx.fillStyle = "#160c24"; ctx.fillRect(iconX - 12, iconY - 12, 24, 24);
      ctx.strokeRect(iconX - 12, iconY - 12, 24, 24);
      ctx.fillStyle = "#fff2f5"; ctx.fillRect(iconX - 5, iconY - 5, 3, 10); ctx.fillRect(iconX + 2, iconY - 5, 3, 10);
      for (const [index, node] of hazard.nodes.entries()) drawArenaNode(ctx, node, color, live === node, index + 1);
      break;
    }
    case "fusionLimbs": {
      const [siphon, lance, burst] = hazard.nodes;
      for (const [index, node] of hazard.nodes.entries()) drawFusionTether(ctx, node, index, fusionLimbColors[index], quiet);
      if (siphon.health > 0 && p < .5) {
        ctx.strokeStyle = "#a7f5fc";
        ctx.setLineDash([4, 7]);
        drawMechanicLine(ctx, siphon.x, siphon.y, x, y, 2);
        ctx.beginPath(); ctx.arc(x, y, hazard.radius * (1.98 - p * .44), 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (lance.health > 0 && p < .61) {
        ctx.strokeStyle = "#ffe3cc";
        ctx.setLineDash(p > .43 ? [] : [10, 5]);
        drawMechanicLine(ctx, lance.x, lance.y, mechanicRoom().left, y, p > .43 ? hazard.thickness * 1.8 : 1.9);
        ctx.setLineDash([]);
      }
      if (burst?.health > 0) {
        ctx.strokeStyle = "#ffbce9"; ctx.fillStyle = p > .71 ? "#ffbce96b" : "#ffbce913";
        ctx.setLineDash(p > .71 ? [] : [3, 5]);
        ctx.beginPath(); ctx.arc(x, y, hazard.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);
      }
      for (const [index, node] of hazard.nodes.entries()) drawArenaNode(ctx, node, fusionLimbColors[index], true, index + 1);
      break;
    }
  }
  ctx.restore();
}
