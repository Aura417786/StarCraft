"use strict";

// Each pursuit supplies its own movement rule. Collision and the painted
// contact surfaces read the same geometry, built once per simulation sample.
const BossMobility = (() => {
  const TAU = Math.PI * 2;
  const labels = [
    ["逆潮回流", "Riptide Reversal", "逆着回流移向两条水脊之间", "Strafe against the return current and cross between the water ridges"],
    ["骸骨猎步", "Marrow Stalker", "离开头骨前方，从甩尾的内侧折返", "Clear the skull's approach and cut inside its turning tail"],
    ["玄武岩接力", "Basalt Relay", "沿冷岩背风面换位，离开滚烫的岩脊", "Trade basalt shadows before the hot front rolls through"],
    ["旋茧织径", "Spindle Maze", "穿过丝墙缺口，预判下一扇门的位置", "Thread one moving door and line up the next"],
    ["回钳接力", "Counterclaw Relay", "先避第一只钳尖，再垂直换位躲反向突进", "Slip the first claw's reach, then change altitude for the return bite"],
    ["镜面翻阶", "Shifting Reflections", "跟着未被镜面覆盖的一侧换边", "Change sides through the uncovered mirror angle"],
    ["跃电环路", "Arc Relay", "让电荷先跑过交叉点，再穿越断开的支路", "Let the charge pass a junction before crossing a broken branch"],
    ["活孢伏地", "Hatching Minefield", "绕开会被近身惊醒的孢卵，避开弹起的孢冠", "Leave room around touch-sensitive eggs and dodge their hatching caps"],
    ["双极牵引", "Binary Slingshot", "借切向加速绕开引力脊，从两极间横切", "Use the transverse current to cross the gap between the poles"],
    ["神经复写", "Neural Playback", "离开自己刚才的航迹，避开回放的神经影", "Leave your recorded flight route before the echo retraces it"],
    ["进化轮猎", "Confluence Relay", "侧切骨猎，抬高躲开菌冠，再从低处穿过牵引缺口", "Cut inside the bone hunter, climb past the brood cap, then thread the low current"],
  ];
  // Profiles are interpreted in the playable box so a resize or portrait
  // layout keeps the same route. Widths stay in game units, like hull radii.
  const durations = [1.59, 1.43, 1.44, 1.65, 1.47, 1.48, 1.60, 1.79, 1.59, 1.58, 1.80];
  const colorMap = ["water", "bone", "magma", "silk", "chitin", "glass", "plasma", "spore", "void", "nerve", "fusion"];
  const geometryStride = 6;
  const maxSurfaces = 42;

  function enabled() {
    // The real runtime always supplies sortieStats. The fallback supports
    // encounter-only fixtures that intentionally omit the sortie system.
    return typeof sortieStats !== "undefined" && !!sortieStats;
  }

  function options(target, room, { side = target.side, volley = false, strong = false } = {}) {
    const x = (target.lockX ?? player.x) - room.left;
    const y = (target.lockY ?? player.y) - room.top;
    const species = target.type;
    const nightmare = isAbyssalNightmare();
    const difficulty = typeof sortieStats === "undefined" ? "hard" : sortieStats?.difficulty;
    return {
      material: colorMap[species], species,
      side: side === -1 ? -1 : 1,
      ax: clamp(x / Math.max(1, room.width), .13, .87),
      ay: clamp(y / Math.max(1, room.height), .18, .82),
      fromFinale: volley, strong: strong || nightmare,
      difficulty,
      duration: durations[species] * (difficulty === "easy" ? .89 : 1) * (strong ? .91 : 1),
      sound: species === 8 || species === 9 ? "coil" : "surge",
      surfaceBuffer: new Float32Array(geometryStride * maxSurfaces),
      trail: new Float32Array(14), trailCount: 0, nextSample: 0,
      awakened: [-1, -1, -1], seedAlive: [true, true, true],
    };
  }

  function span(h, x, y, u, v, radius, style = 0) {
    if (h.surfaceCount === maxSurfaces) return;
    const i = h.surfaceCount++ * geometryStride;
    const b = h.surfaceBuffer;
    b[i] = x; b[i + 1] = y; b[i + 2] = u; b[i + 3] = v; b[i + 4] = radius; b[i + 5] = style;
  }

  function point(h, x, y, radius, style) { span(h, x, y, x, y, radius, style); }

  function chain(h, points, radius, style, taper = 1) {
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1], to = points[i];
      span(h, from[0], from[1], to[0], to[1], radius * (1 - (1 - taper) * i / points.length), style);
    }
  }

  function current(h, room, p, width) {
    const braid = h.ay + h.side * .105 * Math.sin(p * Math.PI * 1.35);
    const x = .94 - p * .80;
    for (const side of [-1, 1]) {
      const y = braid + side * .20;
      chain(h, [[x + .17, y + side * .11], [x + .08, y + side * .012], [x, y],
        [x - .075, y + side * .03], [x - .10, y + side * .095]], width, 1, .42);
    }
  }

  function stalker(h, room, p, width) {
    const x = h.ax + .34 * Math.cos(p * Math.PI * 1.55);
    const y = h.ay + h.side * .26 * Math.sin(p * TAU);
    const heading = p > .64 ? 1 : -1;
    const tail = [[x, y], [x - heading * .085, y + .07 * h.side],
      [x - heading * .17, y + .13 * h.side], [x - heading * .25, y + .11 * h.side]];
    point(h, x, y, width * 1.18, 2);
    chain(h, tail, width * .73, 2, .30);
  }

  function furnace(h, room, p, width) {
    const sector = h.ax < .5 ? 1 : -1;
    const y = clamp(h.ay + h.side * (.19 - .33 * p), .23, .77);
    const x = clamp(h.ax + sector * (.25 - .22 * p), .21, .80);
    // Basalt leaves a genuine gap in the venting arc. It widens toward the
    // back of the arena. The rock then rolls back through one edge of it.
    const narrow = room.width < player.width;
    const top = narrow ? y - .33 : -.08, bottom = narrow ? y + .33 : 1.08;
    chain(h, [[x + sector * .17, top], [x, y - .22], [x - sector * .14, y - .17]], width * 1.1, 3);
    chain(h, [[x - sector * .14, y + .17], [x, y + .22], [x + sector * .17, bottom]], width * 1.1, 3);
    if (p > .43) {
      const travel = (p - .43) / .57;
      point(h, x + sector * (.16 - .49 * travel), y + h.side * (.21 - .075 * Math.sin(travel * Math.PI)), width * 1.22, 3);
    }
  }

  function loom(h, room, p, width) {
    const orient = h.side;
    const narrow = room.width < player.width;
    for (let i = 0; i < 2; i++) {
      if (narrow && Number(p >= .52) !== i) continue;
      const x = loomAxis(h, p, i);
      const door = loomDoor(p, i, orient);
      const tilt = .13 * Math.cos(p * Math.PI + i);
      const half = narrow ? .21 : .16;
      span(h, x - tilt, narrow ? door - .37 : -.10, x + tilt * (door - half - .50), door - half, width * .55, 4);
      span(h, x + tilt * (door + half - .50), door + half, x + tilt, narrow ? door + .37 : 1.10, width * .55, 4);
    }
  }

  function loomAxis(h, p, i) { return clamp(h.ax + (i ? .21 : -.16) + .10 * Math.sin(p * TAU + i), .15, .85); }
  function loomDoor(p, i, side) { return clamp(.50 + side * (i ? -.24 : .21) * Math.sin(p * TAU + .8), .24, .76); }

  function claws(h, room, p, width) {
    const first = p < .51;
    const t = first ? p / .51 : (p - .51) / .49;
    const direction = first ? 1 : -1;
    const side = h.side * direction;
    const y = clamp((first ? h.ay : h.clawExitY ?? h.ay) + side * (.24 - .26 * t), .05, .95);
    const x = direction > 0 ? .93 - t * .65 : .09 + t * .60;
    const tip = x - direction * .13;
    chain(h, [[x + direction * .30, y + side * .215], [x + direction * .085, y + side * .105],
      [x, y + side * .018], [tip, y - side * .048]], width, 5, .32);
    span(h, x + direction * .09, y - side * .060, tip, y - side * .048, width * .52, 5);
  }

  function prisms(h, room, p, width) {
    const lane = Math.floor(p * 3.999);
    const direction = h.side * (lane % 2 ? -1 : 1);
    const reveal = (p * 4) % 1;
    const x = lane < 2 ? .73 : .26;
    const y = clamp(h.ay + direction * .20, .20, .80);
    const reach = .2 + reveal * .40;
    const apex = x + (lane < 2 ? -reach : reach);
    span(h, x, y - .15, apex, y - direction * .085, width * .67, 6);
    span(h, apex, y - direction * .085, x, y + .15, width * .67, 6);
    if (h.strong) span(h, x, y + .15, x, y - .15, width * .50, 6);
  }

  const electrodes = [[.83,.18],[.57,.4],[.30,.18],[.39,.76],[.16,.57],[.74,.85]];
  const links = [[0,1],[1,2],[2,0],[1,3],[3,4],[4,1],[3,5],[5,1]];

  function circuit(h, room, p, width) {
    const time = p * 8.2;
    for (let edge = 0; edge < links.length; edge++) {
      const release = time - edge;
      if (release < 0 || release > 1.37) continue;
      const [a, b] = links[edge], from = electrodes[a], to = electrodes[b];
      const tail = clamp(release - (h.strong ? .60 : .41), 0, 1), head = Math.min(1, release + .13);
      const offset = (edge % 2 ? -.8 : 1) * h.side;
      const ax = from[0] + (to[0] - from[0]) * tail;
      const ay = .50 + (from[1] - .50 + (to[1] - from[1]) * tail) * h.side;
      const bx = from[0] + (to[0] - from[0]) * head;
      const by = .50 + (from[1] - .50 + (to[1] - from[1]) * head) * h.side;
      chain(h, [[ax, ay], [(ax + bx) / 2, (ay + by) / 2 + offset * .058], [bx, by]], width * .66, 7);
    }
  }

  function egg(h, index) {
    const x = clamp(h.ax + (index === 0 ? .19 : index === 1 ? -.18 : .03), .13, .87);
    const y = clamp(h.ay + h.side * (index === 0 ? .19 : index === 1 ? -.18 : -.30), .11, .89);
    return [x, y];
  }

  function spores(h, room, p, width) {
    for (let index = 0; index < (h.strong ? 3 : 2); index++) {
      if (!h.seedAlive[index]) continue;
      const [x, y] = egg(h, index);
      const awake = h.awakened[index];
      const release = awake >= 0 ? p - awake - .19 : p - (.48 + index * .14);
      if (release < 0 || release > .32) continue;
      const up = index % 2 ? -h.side : h.side;
      const height = .22 * Math.sin(release / .32 * Math.PI);
      const head = width * (1.04 + release * .88);
      span(h, x - .065, y + up * height, x + .065, y + up * (height + .022), head, 8);
    }
  }

  function tides(h, room, p, width) {
    const x = clamp(h.ax + .12 * h.side * Math.sin(p * TAU), .19, .81);
    const y = clamp(h.ay + .19 * Math.cos(p * TAU), .18, .82);
    const widthRatio = room.width < player.width ? .66 : 1;
    for (const side of [-1, 1]) {
      const phase = p * TAU + side * Math.PI / 2;
      const bx = x + side * Math.cos(phase) * .31;
      const by = y + side * .22;
      chain(h, [[bx, by], [x + side * Math.cos(phase) * .17, by + side * .11],
        [x - side * Math.sin(phase) * .11, by + side * .16]], width * widthRatio, 9, .68);
    }
  }

  function playback(h, room, p, width) {
    if (h.trailCount < 2) return;
    const flight = p * (h.trailCount - 1);
    const i = Math.min(h.trailCount - 2, Math.floor(flight));
    const a = i * 2, b = a + 2, t = flight - i;
    const x = h.trail[a] + (h.trail[b] - h.trail[a]) * t;
    const y = h.trail[a + 1] + (h.trail[b + 1] - h.trail[a + 1]) * t;
    span(h, h.trail[a], h.trail[a + 1], x, y, width * 1.15, 10);
    if (h.strong && i > 0) span(h, h.trail[a - 2], h.trail[a - 1], h.trail[a], h.trail[a + 1], width * .60, 10);
  }

  function confluence(h, room, p, width) {
    if (p < .36) {
      stalker(h, room, p / .45, width * .94);
    } else if (p < .66) {
      const t = (p - .36) / .30;
      const y = clamp(h.ay + h.side * (.27 - .39 * t), .15, .85);
      const x = .83 - .65 * t;
      span(h, x - .075, y, x + .12, y + h.side * .032, width * 1.08, 8);
      span(h, x + .14, y - h.side * .14, x + .30, y - h.side * .095, width * .65, 8);
    } else {
      tides(h, room, (p - .66) / .36, width * 1.04);
    }
  }

  const patterns = [current, stalker, furnace, loom, claws, prisms, circuit, spores, tides, playback, confluence];

  function getProgress(h) { return clamp((h.age - h.warning) / Math.max(.01, h.duration), 0, .999999); }

  function pose(h, room, p) {
    const base = Math.max(4, Math.min(player.height * .32, room.height * .065, player.speed * .062));
    const radius = base * (h.fromFinale ? 1.04 : 1) * (h.difficulty === "easy" ? .68 : h.difficulty === "normal" ? .86 : h.strong ? 1.08 : 1);
    if (h.lastPose === p && h.lastExtent === radius && h.lastTrailCount === h.trailCount
        && h.roomWidth === room.width && h.roomHeight === room.height) return;
    h.lastPose = p; h.lastExtent = radius; h.lastTrailCount = h.trailCount;
    h.roomWidth = room.width; h.roomHeight = room.height;
    h.surfaceCount = 0;
    patterns[h.species](h, room, p, radius);
  }

  function advance(h) {
    if (![2, 3, 4, 7, 9].includes(h.species)) return;
    const room = mechanicRoom();
    if (h.species === 9 && h.age >= (h.tellAt ?? 0) && h.age < h.warning - .36
        && h.trailCount < h.trail.length / 2 && h.age >= h.nextSample) {
      const i = h.trailCount++ * 2;
      h.trail[i] = clamp((player.x - room.left) / Math.max(1, room.width), 0, 1);
      h.trail[i + 1] = clamp((player.y - room.top) / Math.max(1, room.height), 0, 1);
      h.nextSample = h.age + .125;
    }
    if (h.age < h.warning) return;
    const p = getProgress(h);
    if (h.species === 4 && h.clawExitY === undefined && p >= .18) {
      const pilotY = (player.y - room.top) / Math.max(1, room.height);
      h.clawExitY = clamp(h.ay + clamp((pilotY - h.ay) * .67, -.15, .15), .18, .82);
    }
    if (h.species === 2 && !h.counter && p > .29 && p < .50) {
      const x = (player.x - room.left) / Math.max(1, room.width);
      const y = (player.y - room.top) / Math.max(1, room.height);
      const flow = h.ax < .5 ? 1 : -1;
      const rockX = clamp(h.ax + flow * (.25 - .22 * p), .21, .80);
      const rockY = clamp(h.ay + h.side * (.19 - .33 * p), .23, .77);
      if ((x - rockX) * flow < -.09 && Math.abs(y - rockY) < .10) counter(h);
    }
    if (h.species === 3 && !h.counter && room.width > player.width) {
      const relativeX = (player.x - room.left) / room.width;
      const lastX = ((player.previousX ?? player.x) - room.left) / room.width;
      const y = (player.y - room.top) / Math.max(1, room.height);
      for (let i = 0; i < 2; i++) {
        const wall = loomAxis(h, p, i);
        if ((relativeX - wall) * (lastX - wall) <= 0 && Math.abs(relativeX - lastX) > .001
            && Math.abs(y - loomDoor(p, i, h.side)) < .10) counter(h);
      }
    }
    if (h.species !== 7) return;
    for (let index = 0; index < (h.strong ? 3 : 2); index++) {
      if (!h.seedAlive[index] || h.awakened[index] >= 0 || p >= .48 + index * .14) continue;
      const [x, y] = egg(h, index);
      if (Math.hypot(room.left + x * room.width - player.x, room.top + y * room.height - player.y)
          < Math.max(18, player.height * .72)) {
        h.awakened[index] = p;
        h.lastPose = -1;
      }
    }
  }

  function counter(h) {
    h.counter = true;
    if (boss?.finale) {
      const f = boss.finale;
      f.previousVentUntil = Math.max(f.previousVentUntil ?? 0, f.age + 1.1);
      combatBurst(boss.x, boss.y, .46, "#ffe6a2");
      gameAudio.bossAttack("hatch", boss.x, boss.y);
    } else rewardAlienCounter();
  }

  function projectiles(h, bullet) {
    if ((h.species !== 5 && h.species !== 7) || h.age < (h.tellAt ?? 0)
        || h.age >= h.warning + h.duration) return false;
    const room = mechanicRoom();
    if (h.species === 7) {
      for (let index = 0; index < (h.strong ? 3 : 2); index++) {
        if (!h.seedAlive[index]) continue;
        const [x, y] = egg(h, index);
        const px = room.left + x * room.width, py = room.top + y * room.height;
        if (!roundTouchesMechanic(bullet, px, py, Math.max(11, player.height * .34))) continue;
        h.seedAlive[index] = false;
        h.lastPose = -1;
        combatBurst(px, py, .47, signatureMaterials.spore.rim);
        gameAudio.bossAttack("hatch", px, py);
        if (!h.counter && h.seedAlive.slice(0, h.strong ? 3 : 2).every(alive => !alive)) counter(h);
        return !bullet.piercesShield;
      }
      return false;
    }
    if (h.age < h.warning || bullet.piercesShield || h.age < (h.nextReflection ?? 0)) return false;
    const beat = Math.floor(getProgress(h) * 3.999);
    const x = room.left + (beat < 2 ? .73 : .26) * room.width;
    const y = room.top + clamp(h.ay + h.side * (beat % 2 ? -.20 : .20), .20, .80) * room.height;
    if (x - player.x < player.width * 1.25 || (bullet.previousX ?? bullet.x) > x || bullet.x < x
        || Math.abs(bullet.y - y) > room.height * .13) return false;
    h.nextReflection = h.age + .70;
    const velocity = h.side * (beat % 2 ? -1 : 1) * 170;
    addBossProjectile(x - 3, bullet.y, -310, velocity, {
      color: signatureMaterials.glass.spark, glyph: "prism", radius: 7, attackLabel: h.attackLabel ?? BossMobility.labels[h.species],
    });
    combatBurst(x, bullet.y, .35, signatureMaterials.glass.rim);
    return true;
  }

  function hits(h, pilot) {
    if (h.age < h.warning || h.age >= h.warning + h.duration) return false;
    const room = mechanicRoom();
    pose(h, room, getProgress(h));
    const b = h.surfaceBuffer;
    const hull = pilot.height * .16;
    for (let i = 0; i < h.surfaceCount * geometryStride; i += geometryStride) {
      const x = room.left + b[i] * room.width, y = room.top + b[i + 1] * room.height;
      const u = room.left + b[i + 2] * room.width, v = room.top + b[i + 3] * room.height;
      const dx = u - x, dy = v - y;
      const t = clamp(((pilot.x - x) * dx + (pilot.y - y) * dy) / Math.max(1, dx * dx + dy * dy), 0, 1);
      if (Math.hypot(pilot.x - x - dx * t, pilot.y - y - dy * t) < hull + b[i + 4]) return true;
    }
    return false;
  }

  function vector(h, pilot, force) {
    if ((h.species !== 0 && h.species !== 8 && h.species !== 10) || h.age < h.warning
        || h.age >= h.warning + h.duration) return;
    const p = getProgress(h);
    if (h.species === 10 && p < .66) return;
    const room = mechanicRoom();
    const cx = room.left + room.width * h.ax, cy = room.top + room.height * h.ay;
    if (h.species === 0) {
      const distance = Math.abs(pilot.y - cy) / Math.max(1, room.height);
      force.x += (p < .47 ? -1 : 1) * (h.strong ? 76 : 57) * Math.max(0, 1 - distance * 2.1);
      return;
    }
    const dx = cx - pilot.x, dy = cy - pilot.y;
    const distance = Math.hypot(dx, dy);
    const reach = Math.max(1, Math.min(room.width * .74, room.height * .66));
    if (distance > 1 && distance < reach) {
      const pull = (h.strong ? 115 : 87) * (1 - distance / reach) / distance;
      force.x += (dx - dy * h.side * .81) * pull;
      force.y += (dy + dx * h.side * .81) * pull;
    }
  }

  function drawEggs(ctx, h, room, active, quiet, color) {
    for (let i = 0; i < (h.strong ? 3 : 2); i++) {
      if (!h.seedAlive[i]) continue;
      const [x, y] = egg(h, i);
      const radius = Math.max(12, player.height * .35);
      const px = room.left + x * room.width, py = room.top + y * room.height;
      const glow = typeof pressureArtGlow === "function" ? pressureArtGlow(color) : null;
      ctx.globalAlpha = h.awakened[i] >= 0 ? .85 : active ? .53 : .31;
      if (glow) ctx.drawImage(glow, px - radius * 2, py - radius * 2, 4 * radius, 4 * radius);
      if (typeof NextgenVfx !== "undefined" && active) {
        NextgenVfx.drawSporePod(ctx, { x: px, y: py, radius }, quiet ? 0 : h.age, .91, radius * .69);
      }
      ctx.strokeStyle = color;
      ctx.fillStyle = "#1c271c";
      ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.ellipse(px, py, radius * .79, radius, .22 * h.side, 0, TAU); ctx.fill(); ctx.stroke();
      for (let j = 0; j < (quiet ? 3 : 5); j++) {
        const a = quiet ? j * 2 : j * 2.399 + h.age * .6;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(px + Math.cos(a) * radius * .59, py + Math.sin(a) * radius * .73, 1.7, 0, TAU); ctx.fill();
      }
    }
  }

  function drawTrace(ctx, h, room, color) {
    if (h.trailCount < 1) return;
    ctx.strokeStyle = color;
    ctx.globalAlpha = .66;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 7]); ctx.beginPath();
    for (let i = 0; i < h.trailCount * 2; i += 2) {
      const x = room.left + h.trail[i] * room.width, y = room.top + h.trail[i + 1] * room.height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.setLineDash([]);
  }

  function drawApparatus(ctx, h, room, p, active, quiet, tint) {
    const age = quiet ? 0 : h.age;
    const worldX = x => room.left + x * room.width;
    const worldY = y => room.top + y * room.height;
    if (h.species === 2 && typeof NextgenVfx !== "undefined") {
      const direction = h.ax < .5 ? 1 : -1;
      const x = worldX(clamp(h.ax + direction * (.25 - .22 * p), .21, .80));
      const y = worldY(clamp(h.ay + h.side * (.19 - .33 * p), .23, .77));
      const size = Math.min(45, Math.max(14, player.height * .77));
      ctx.globalAlpha = active ? .79 : .51;
      // Soft reflected light shows the protected, downstream side.
      const shade = ctx.createLinearGradient(x - direction * size * 3.5, y, x, y);
      shade.addColorStop(0, tint.spark + "00");
      shade.addColorStop(1, "#b4eff66a");
      ctx.fillStyle = shade;
      ctx.beginPath(); ctx.moveTo(x, y - size * .30);
      ctx.quadraticCurveTo(x - direction * size * 2, y - size * .51, x - direction * size * 3.5, y);
      ctx.quadraticCurveTo(x - direction * size * 2, y + size * .51, x, y + size * .30);
      ctx.closePath(); ctx.fill();
      NextgenVfx.rock(ctx, x, y, size, -.32 + age * .24, age, active ? .94 : .65, false);
    }
    if (h.species === 3) {
      for (let i = 0; i < 2; i++) {
        const px = worldX(loomAxis(h, p, i)), py = worldY(loomDoor(p, i, h.side));
        const reach = h.counter ? 12 : 7.6;
        ctx.globalAlpha = h.counter ? .97 : .72;
        ctx.strokeStyle = h.counter ? "#ffe9ac" : "#9cf1fa";
        ctx.lineWidth = 1.75;
        ctx.beginPath(); ctx.moveTo(px - reach, py - reach); ctx.lineTo(px, py);
        ctx.lineTo(px - reach, py + reach); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px + reach, py - reach); ctx.lineTo(px, py);
        ctx.lineTo(px + reach, py + reach); ctx.stroke();
      }
    }
    if (h.species === 6) {
      const turn = Math.floor(p * 8.2);
      const next = links[turn]?.[1] ?? 0;
      for (let i = 0; i < electrodes.length; i++) {
        const [x, y] = electrodes[i];
        const px = worldX(x), py = worldY(.5 + (y - .5) * h.side);
        const r = Math.max(5, player.height * .10);
        ctx.globalAlpha = i === next ? .95 : .44;
        ctx.lineWidth = i === next ? 1.3 : .85;
        ctx.strokeStyle = i === next ? tint.spark : tint.rim;
        ctx.beginPath(); ctx.moveTo(px, py - r); ctx.lineTo(px + r * 1.20, py);
        ctx.lineTo(px, py + r); ctx.lineTo(px - r * 1.20, py); ctx.closePath(); ctx.stroke();
      }
    }
    if (h.species === 9 && active && h.trailCount > 1) {
      const lead = Math.min(h.trailCount - 1, Math.floor(p * h.trailCount));
      const size = Math.max(12, player.width * .21);
      for (let ghost = Math.max(0, lead - 2); ghost <= lead; ghost++) {
        const x = worldX(h.trail[ghost * 2]), y = worldY(h.trail[ghost * 2 + 1]);
        ctx.globalAlpha = ghost === lead ? .46 : .14;
        ctx.fillStyle = "#5b264f";
        ctx.strokeStyle = tint.spark;
        ctx.lineWidth = 1.15;
        ctx.beginPath(); ctx.moveTo(x + size, y); ctx.lineTo(x, y - size * .16);
        ctx.lineTo(x - size * .70, y - size * .42); ctx.lineTo(x - size * .35, y);
        ctx.lineTo(x - size * .70, y + size * .42); ctx.lineTo(x, y + size * .16); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    }
    if (h.species === 0 || h.species === 8 || h.species === 10 && p >= .66) {
      const cx = worldX(h.ax), cy = worldY(h.ay);
      const sweep = Math.min(room.height * .27, room.width * .42);
      if (sweep < 12) return;
      const water = h.species === 0;
      for (let i = 0; i < (quiet ? 7 : 22); i++) {
        const t = (i * .61803 + age * (water ? .34 : .54)) % 1;
        const a = (i * 2.399963 + age * .82) * h.side;
        const x = water ? room.left + t * room.width : cx + Math.cos(a) * sweep * (1 - t);
        const y = water ? cy + Math.sin(a) * sweep * .45 : cy + Math.sin(a) * sweep * (1 - t) * .72;
        ctx.globalAlpha = (.20 + Math.sin(t * Math.PI) * .43) * (active ? 1 : .6);
        ctx.strokeStyle = i % 4 ? tint.rim : tint.spark;
        ctx.lineWidth = 1 + t * .64;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + (water ? 6 : -Math.sin(a) * 9), y + (water ? 2 : Math.cos(a) * 6),
          x + (water ? (p < .47 ? -17 : 17) : -Math.sin(a) * 16), y + (water ? 0 : Math.cos(a) * 10));
        ctx.stroke();
      }
    }
  }

  function drawPhysicalMaterial(ctx, style, x, y, dx, dy, length, width, age, quiet, tint, index) {
    if (typeof NextgenVfx === "undefined" || typeof BossLivingMaterials === "undefined") return false;
    const kind = style === 2 ? "bone" : style === 4 ? "silk" : style === 5 ? "chitin"
      : style === 6 ? "glass" : style === 7 ? "plasma" : style === 9 ? "void" : style === 10 ? "nerve" : null;
    ctx.globalAlpha = 1;
    if (style === 2 && length < .4) {
      return BossLivingMaterials.organ(ctx, "bone", x, y, width * 4.7, width * 3.2, -.22);
    }
    if (kind && length > 6) {
      // Caps communicate the next collision segment but do not flatten its
      // texture. Cable and electric detail is light enough to paint both arcs.
      return BossLivingMaterials.ray(ctx, kind, x, y, x + dx, y + dy, width * .79, age, true, .88, quiet);
    }
    if (style === 1) {
      if (length < 7 || index % 2) return false;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx));
      NextgenVfx.drawWaterJet(ctx, length, width * .65, width * .54, age, .74, { quiet });
      ctx.restore();
      return true;
    }
    if (style === 3) {
      if (length < .4) NextgenVfx.rock(ctx, x, y, width * 1.6, age * 7, age, .92, true);
      else if (index % 2 === 0) {
        NextgenVfx.drawMagmaFissure(ctx, { x1: x, y1: y, x2: x + dx, y2: y + dy, width: width * 1.78 }, tint, age, .72);
      } else return false;
      return true;
    }
    if (style === 8) {
      NextgenVfx.drawSporeCloud(ctx, { x: x + dx * .48, y: y + dy * .48, radius: width * 1.8 }, age, .84);
      return true;
    }
    return false;
  }

  function drawSurfaces(ctx, h, room, age, quiet, active, tint) {
    const b = h.surfaceBuffer;
    for (let i = 0; i < h.surfaceCount * geometryStride; i += geometryStride) {
      const x = room.left + b[i] * room.width, y = room.top + b[i + 1] * room.height;
      const dx = (b[i + 2] - b[i]) * room.width, dy = (b[i + 3] - b[i + 1]) * room.height;
      const length = Math.hypot(dx, dy);
      const width = b[i + 4];
      const style = b[i + 5];
      const material = style === 2 ? signatureMaterials.bone : style === 8 ? signatureMaterials.spore
        : style === 9 ? signatureMaterials.void : tint;
      const diffuse = material.rim, core = material.spark;
      // Spray and glow reveal width without drawing a neon contour around
      // each connected segment. The strongest light belongs to the material.
      const alpha = active ? (style === 9 ? .36 : .48) : .56;
      ctx.strokeStyle = ctx.fillStyle = diffuse;
      for (const [factor, intensity] of surfaceLayers) {
        ctx.globalAlpha = intensity * alpha;
        ctx.lineWidth = width * factor;
        ctx.beginPath();
        if (length < .4) ctx.arc(x, y, ctx.lineWidth * .64, 0, TAU);
        else { ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); }
        if (length < .4) ctx.fill(); else ctx.stroke();
      }
      if (style === 4 || !active && (style === 6 || style === 9)) {
        ctx.lineWidth = Math.max(1, width * .19);
        ctx.globalAlpha = active ? .53 : .43;
        ctx.strokeStyle = core;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
      }
      if (active && (style === 4 || style === 7 || i % (geometryStride * 2) === 0)) {
        drawPhysicalMaterial(ctx, style, x, y, dx, dy, length, width, age, quiet, material, i / geometryStride);
      }
      if (!active || quiet) continue;
      for (let n = 0; n < (style === 5 || style === 2 || style === 1 ? 7 : 4); n++) {
        const seed = i * .0618 + n * .38197, life = (age * (style === 7 ? 4.6 : 2.1) + seed) % 1;
        const side = n % 2 ? 1 : -1, lengthInv = 1 / Math.max(1, length);
        const drift = (side * width) * (.50 + life * 1.50);
        const px = x + dx * life - dy * lengthInv * drift;
        const py = y + dy * life + dx * lengthInv * drift;
        ctx.globalAlpha = (1 - life) * (.48 + .11 * (n % 3));
        ctx.lineWidth = 1 + (n % 3) * .55;
        ctx.strokeStyle = n % 2 ? core : diffuse;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        if (style === 8 || style === 3 && n % 2 === 0) {
          ctx.arc(px + life * width * .45, py + (style === 8 ? life * width * .52 : -life * width), 1.35 + (n % 3) * .38, 0, TAU);
          ctx.fill();
        } else {
          ctx.moveTo(px, py);
          if (style === 1 || style === 4 || style === 9) {
            ctx.quadraticCurveTo(px - width * .22, py + side * width * .38,
              px - width * (.18 + life * .52), py + side * width * .58);
          } else {
            ctx.lineTo(px - width * (.13 + life * .36), py + side * width * .28);
          }
          ctx.stroke();
        }
      }
    }
  }

  const surfaceLayers = [[3.8, .08], [2.18, .13], [1.25, .26], [.40, .67]];

  function drawReturnClaw(ctx, h, room, p, tint) {
    if (p < .22 || p >= .51) return;
    // After the first rake commits the second jaw, show its exact starting
    // silhouette and the direction of the return before it reaches the pilot.
    pose(h, room, .52);
    ctx.setLineDash([4, 9]);
    drawSurfaces(ctx, h, room, 0, true, false, tint);
    ctx.setLineDash([]);
  }

  function draw(ctx, h, quiet) {
    if (h.age < (h.tellAt ?? 0) || h.age >= h.warning + h.duration) return;
    const room = mechanicRoom();
    const active = h.age >= h.warning;
    const tint = signatureMaterials[h.material];
    const age = quiet ? 0 : h.age;
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    drawApparatus(ctx, h, room, active ? getProgress(h) : 0, active, quiet, tint);
    if (h.species === 7) drawEggs(ctx, h, room, active, quiet, tint.spark);
    if (h.species === 9 && !active) drawTrace(ctx, h, room, tint.spark);
    if (h.species === 4 && active) drawReturnClaw(ctx, h, room, getProgress(h), tint);
    if (!active && h.species !== 7 && h.species !== 9) {
      pose(h, room, .56);
      ctx.setLineDash([5, 9]);
      drawSurfaces(ctx, h, room, age, quiet, false, tint);
      ctx.setLineDash([]);
    }
    pose(h, room, active ? getProgress(h) : 0);
    drawSurfaces(ctx, h, room, age, quiet, active, tint);
    ctx.restore();
  }

  return { labels, enabled, options, advance, hits, vector, projectiles, draw };
})();
