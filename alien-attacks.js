"use strict";

const alienPatterns = {
  broodArc: ["孵化新月", "Hatching Crescent", 2.75, "在弧线之间找空隙", "Slip through the gaps in the crescent",
    t => {
      t.attackMotion = "coil";
      return t.enraged
        ? [fan(0, 8, .78, 450, "orb", { arc: true, offsetY: -.22, sound: "surge" }),
          fan(.63, 9, .83, 485, "orb", { arc: true, offsetY: .22, sound: "surge" }),
          fan(1.28, 5, .41, 510, "orb", { arc: true, aim: true, sound: "surge" })]
        : [fan(0, 7, .68, 400, "orb", { arc: true, sound: "surge" }),
          fan(.7, 6, .68, 415, "orb", { arc: true, offsetY: .12, sound: "surge" })];
    }],
  broodSweep: ["触须扫潮", "Tentacle Tide", 2.8, "沿预警红线的上下两侧闪避", "Evade above or below each marked lash",
    t => {
      t.attackMotion = "sweep";
      t.lashIndex = 0;
      broodLash(t, t.lockY, t.telegraphDuration, t.side, 0);
      return t.enraged ? [beat(.24, x => broodLash(x, player.y, .68, -x.side, 1)),
        beat(1.13, x => broodLash(x, player.y, .7, x.side, 2)),
        fan(2.18, 5, .45, 460, "orb", { aim: true })]
        : [fan(.58, 3, .25, 430, "orb", { aim: true })];
    }],
  broodSpawn: ["幼体孵化", "Larval Hatch", 3.05, "引开幼体，再穿过它们之间的空隙", "Lure the larvae, then pass through their gaps",
    t => {
      t.attackMotion = "recoil";
      return t.enraged
        ? [fan(0, 6, .6, 365, "spore", { homingUntil: 1.1, radius: 11, sound: "hatch" }),
          fan(.75, 4, .37, 395, "spore", { offsetY: .24, homingUntil: .87, radius: 10, sound: "hatch" }),
          fan(1.43, 7, .49, 480, "orb", { aim: true })]
        : [fan(0, 5, .52, 325, "spore", { homingUntil: .94, radius: 11, sound: "hatch" }),
          fan(1.15, 3, .3, 425, "orb", { aim: true })];
    }],

  boneSpears: ["倒钩三连", "Barbed Triplets", 2.7, "引开骨刺后转向", "Bait the spears and turn",
    t => [aimTell(t, 0), fan(0, 3, .13, 510, "shard", { lock: true }), fan(.53, 3, .18, 490, "shard", { aim: true }), fan(1.08, 4, .28, 500, "shard", { aim: true })]],
  boneRibs: ["肋笼围猎", "Ribcage Hunt", 2.9, "穿过青色缺口", "Take the cyan opening",
    t => [laneTell(t, 0, 1.7), wall(0, 410, "shard"), wall(.84, 450, "shard")]],
  bonePounce: ["折颚扑击", "Jaw Pounce", 3.1, "避开红线，留意上下夹击", "Clear the red line and watch both jaws",
    t => { t.attackMotion = "lunge"; return [beamTell(t, 0, t.lockY, .31), fan(.2, 3, .22, 430, "shard", { offsetY: -.26, angle: .24 }), fan(.57, 3, .22, 430, "shard", { offsetY: .26, angle: -.24 })]; }],

  cinderLava: ["熔脉喷发", "Magma Vein", 3.0, "离开熔岩预警圈", "Leave the magma circles",
    t => [zoneTell(t, 0, t.lockX, t.lockY, .34), beat(.74, x => zoneTell(x, .8, player.x, player.y, .29)), fan(1.43, 5, .62, 430, "ember", { aim: true })]],
  cinderHeart: ["熔心裂弹", "Splitting Cinders", 3.2, "拉开距离，避开炸开的火星", "Keep space around the splitting cinders",
    t => [fan(0, 3, .44, 275, "ember", { burstAt: .72, burstCount: 7, radius: 12 }), fan(1.14, 2, .22, 315, "ember", { aim: true, burstAt: .7, burstCount: 8, radius: 12 })]],
  cinderFurnace: ["双焰炉口", "Twin Furnace", 2.9, "连续避开两条热浪", "Dodge both heat waves in sequence",
    t => [beamTell(t, 0, t.lockY, .34), beamTell(t, .8, alienOffsetLane(t.lockY, t.side * .21), .31), fan(1.36, 5, .52, 475, "ember", { aim: true })]],

  weaverCross: ["虚空织线", "Void Weft", 3.1, "从两列波纹之间穿过去", "Thread the gaps between the ripples",
    t => [fan(0, 5, .44, 455, "shard", { wave: 29 }), fan(.56, 5, .47, 480, "shard", { wave: -31 }), fan(1.17, 4, .35, 485, "shard", { aim: true, wave: 34 })]],
  weaverWeb: ["折叠蛛网", "Folded Web", 3.0, "青色通道内可通行", "The cyan corridor stays open",
    t => [laneTell(t, 0, 1.75), bandTell(t, 0, .42), wall(.44, 440, "thread"), wall(1.12, 480, "thread")]],
  weaverSnare: ["结丝伏击", "Silk Ambush", 3.1, "先离开网域，再闪避追瞄", "Leave the web, then dodge the aimed shots",
    t => [bindTell(t, 0, t.lockX, t.lockY, 1.25, .77), fan(.65, 3, .17, 545, "thread", { lock: true }), fan(1.44, 4, .32, 460, "thread", { aim: true })]],

  binderClaw: ["共振巨螯", "Resonant Claws", 2.8, "避开锁定线后改变方向", "Clear the locked line, then change direction",
    t => { t.attackMotion = "lunge"; return [beamTell(t, 0, t.lockY, .38), fan(.66, 5, .5, 465, "shard", { aim: true }), fan(1.24, 5, .5, 475, "shard", { aim: true })]; }],
  binderPin: ["棘链爆破", "Spine Chain", 3.2, "在红圈亮起前离开减速区", "Escape the slowing field before the red circle detonates",
    t => [bindTell(t, 0, t.lockX, t.lockY, 1.7, .72), zoneTell(t, .77, t.lockX, t.lockY, .43), fan(1.32, 4, .46, 475, "shard")]],
  binderSpines: ["脊刺闭合", "Closing Spines", 3.1, "靠近缺口，再避开延迟骨刺", "Find the opening before the delayed spears",
    t => [laneTell(t, 0, 1.7), wall(0, 515, "shard"), wall(.62, 540, "shard"), fan(1.44, 3, .25, 545, "shard", { aim: true })]],

  mirrorPrism: ["三棱反照", "Prismatic Reflection", 2.9, "预判镜像弹的折返", "Watch for the ricochets",
    t => [fan(0, 6, .78, 510, "prism", { reflect: true }), fan(.57, 5, .62, 520, "prism", { reflect: true, aim: true }), fan(1.16, 4, .46, 545, "prism", { reflect: true })]],
  mirrorBlades: ["双翼折光", "Refracted Wings", 3.0, "移动到两片光翼外", "Move outside the two wings of light",
    t => [beamTell(t, 0, alienOffsetLane(t.lockY, -.11), .21), beamTell(t, .22, alienOffsetLane(t.lockY, .11), .21), fan(.9, 5, .56, 515, "prism", { aim: true, wave: 24 })]],
  mirrorDecoy: ["镜域回落", "Mirrored Strike", 3.1, "避开亮圈，再躲反弹晶体", "Clear the bright rings, then dodge the crystal ricochets",
    t => [zoneTell(t, 0, t.lockX, t.lockY, .38), zoneTell(t, .35, t.lockX, flightBounds.top + flightBounds.bottom - t.lockY, .3), fan(.67, 5, .8, 535, "prism", { reflect: true })]],

  wyrmPulse: ["长脊雷潮", "Spinal Tide", 3.0, "留意在弹幕中摆动的电弧", "Watch the arcs weaving through the volley",
    t => { t.attackMotion = "sweep"; return [fan(0, 6, .53, 535, "thread", { wave: 41 }), fan(.44, 5, .52, 510, "thread", { wave: -39 }), fan(.99, 5, .55, 555, "thread", { aim: true, wave: 29 })]; }],
  wyrmCurrent: ["断潮走廊", "Broken Current", 3.1, "进入青色缺口，等两道雷潮过去", "Hold in the cyan gap until both tides pass",
    t => [laneTell(t, 0, 1.95), bandTell(t, 0, .38), wall(.43, 520, "thread"), wall(.97, 540, "thread")]],
  wyrmStreak: ["跃渊雷击", "Leaping Abyss", 3.2, "连续闪避三次锁点", "Keep moving through three lock-on strikes",
    t => { t.attackMotion = "lunge"; return [zoneTell(t, 0, t.lockX, t.lockY, .41), beat(.53, x => zoneTell(x, .69, player.x, player.y, .36)), beat(1.17, x => zoneTell(x, .69, player.x, player.y, .36)), fan(1.88, 5, .53, 550, "thread")]; }],

  sporeSwarm: ["裂梦孢群", "Dreamspore Swarm", 3.3, "引开孢子后横向闪避", "Lure the spores, then cut sideways",
    t => [fan(0, 5, .72, 395, "spore", { homingUntil: 1, radius: 11 }), fan(.72, 4, .51, 430, "spore", { homingUntil: .84, radius: 10 }), fan(1.46, 5, .63, 545, "orb", { aim: true })]],
  sporeField: ["菌毯侵袭", "Mycelium Bloom", 3.2, "优先离开浅绿菌毯", "Leave the pale green spore field first",
    t => [bindTell(t, 0, t.lockX, t.lockY, 2.02, .68), zoneTell(t, .82, t.lockX, t.lockY, .44), fan(.32, 3, .5, 355, "spore", { burstAt: .91, burstCount: 7, radius: 12 })]],
  sporePollen: ["孢浪换气", "Pollen Front", 3.1, "等青色通道安全再反击", "Stay in the cyan opening before firing back",
    t => [laneTell(t, 0, 1.78), wall(0, 510, "spore"), wall(.55, 550, "spore"), beamTell(t, 1.37, t.lockY, .29, .32)]],

  mawEclipse: ["重力蚀口", "Gravitic Eclipse", 3.3, "脱离减速环，避开延迟引爆", "Escape the slowing ring before the delayed blast",
    t => [bindTell(t, 0, t.lockX, t.lockY, 1.92, .67), zoneTell(t, .93, t.lockX, t.lockY, .5), fan(1.38, 5, .6, 555, "ember", { aim: true })]],
  mawScars: ["坍缩裂痕", "Collapse Scars", 3.3, "利用两次裂痕之间的空档", "Use the openings between each collapse",
    t => [beamTell(t, 0, t.lockY, .39), beamTell(t, .65, alienOffsetLane(t.lockY, t.side * .21), .38), beat(1.0, x => zoneTell(x, .73, player.x, player.y, .36))]],
  mawFragments: ["噬界碎浪", "Devouring Shrapnel", 3.2, "穿过首波弧线，留意裂弹", "Slip through the arc and watch for split shots",
    t => [fan(0, 8, .83, 560, "ember", { arc: true }), fan(.67, 3, .44, 340, "ember", { burstAt: .81, burstCount: 8, radius: 12 }), fan(1.42, 6, .6, 565, "shard", { aim: true })]],

  neuralSynapse: ["零光突触", "Zero-Light Synapse", 3.25, "错开两次高速追瞄", "Change course between the fast aimed volleys",
    t => [aimTell(t, 0), fan(0, 5, .29, 620, "prism", { lock: true }), fan(.45, 5, .34, 565, "prism", { aim: true, reflect: true }), fan(.97, 6, .61, 580, "thread", { wave: 31 }), fan(1.51, 4, .25, 620, "shard", { aim: true })]],
  neuralPulse: ["神经风暴", "Neural Storm", 3.25, "穿过青色缺口，再闪避追击", "Use the cyan corridor, then evade the pursuit",
    t => [laneTell(t, 0, 1.7), bandTell(t, 0, .4), wall(.32, 550, "prism"), wall(.81, 580, "thread"), fan(1.47, 5, .37, 600, "prism", { aim: true })]],
  neuralRupture: ["王巢坏死", "Royal Rupture", 3.45, "保持移动，远离已锁定的圆心", "Keep moving away from the locked centers",
    t => [zoneTell(t, 0, t.lockX, t.lockY, .42), beat(.56, x => zoneTell(x, .82, player.x, player.y, .42)), beat(1.15, x => zoneTell(x, .81, player.x, player.y, .44)), fan(1.45, 3, .48, 370, "spore", { homingUntil: .8, radius: 11 })]],

  fusionBind: ["群渊处刑", "Confluence Execution", 3.62, "离开减速区，红圈将在原地引爆", "Escape the slowing field before the locked red circle detonates",
    t => [bindTell(t, 0, t.lockX, t.lockY, 2.0, t.enraged ? .58 : .62),
      zoneTell(t, 1.12, t.lockX, t.lockY, .49), beat(1.08, x => zoneTell(x, .96, player.x, player.y, .39)),
      fan(2.09, t.enraged ? 7 : 5, .5, 620, "shard", { aim: true }),
      t.enraged && beat(2.2, x => zoneTell(x, .88, player.x, player.y, .42))]],
  fusionCorridor: ["神经潮汐", "Synaptic Tide", 3.58, "守住青色通道，最后一波通过再移动", "Hold the cyan lane until the last wall passes",
    t => [laneTell(t, 0, t.enraged ? 2.72 : 2.35), bandTell(t, 0, .66),
      wall(.29, 550, "shard"), wall(.75, 575, "thread"), wall(1.24, 605, "prism"),
      t.enraged && wall(1.68, 625, "shard"), t.enraged && bandTell(t, 1.5, .52),
      fan(t.enraged ? 2.82 : 2.45, t.enraged ? 7 : 5, .35, 600, "shard", { aim: true })]],
  fusionPrism: ["镜噬孢落", "Prismatic Sporefall", 3.55, "诱开孢群，沿无标线区域闪避", "Lead the spores away and stay off the marked lines",
    t => {
      t.attackMotion = "lunge";
      return [beamTell(t, 0, t.lockY, .43), fan(.18, t.enraged ? 6 : 4, .58, 400, "spore", { homingUntil: 1.05, radius: 11 }),
        fan(.75, t.enraged ? 7 : 5, .63, 560, "prism", { reflect: true }),
        beat(1.1, x => zoneTell(x, .92, player.x, player.y, .42)), fan(1.83, 4, .48, 605, "thread", { wave: 30 }),
        t.enraged && beat(2.12, x => beamTell(x, .81, player.y, .32, .37))];
    }],
};

function beat(at, fire) { return { at, fire }; }

function alienLane(fraction) {
  return flightBounds.top + (flightBounds.bottom - flightBounds.top) * fraction;
}

function alienOffsetLane(y, fraction) {
  const span = flightBounds.bottom - flightBounds.top;
  return clamp(y + span * fraction, alienLane(.07), alienLane(.93));
}

function alienArenaScale() {
  return clamp(viewport.width / 1280, .64, 1.1);
}

function alienThreatRadius(target, size) {
  const span = flightBounds.bottom - flightBounds.top;
  return Math.max(14, Math.min(target.width * size, span * .22, (bossPlayerRight() - flightBounds.left) * .28));
}

function alienAttackSpeed(target, base) {
  return base * alienArenaScale() * (1.13 + target.type * .023) * (target.enraged ? 1.15 : 1);
}

function addBossHazard(kind, options) {
  bossHazards.push({ kind, age: 0, color: boss.color, right: boss.x - boss.width * .37, ...options });
}

function addBossProjectile(x, y, vx, vy, options = {}) {
  if (bossProjectiles.length >= bossRules.maxProjectiles) return;
  bossProjectiles.push({ x, y, previousX: x, previousY: y, vx, vy, age: 0, radius: 7,
    color: boss ? boss.color : "#ffb66f", ...options });
}

function fan(at, count, spread, speed, glyph, options = {}) {
  return beat(at, target => {
    const x = target.x - target.width * .42;
    const y = target.y + target.height * (options.offsetY || 0);
    const aim = options.lock || options.aim;
    const aimX = options.lock ? target.lockX : player.x;
    const aimY = options.lock ? target.lockY : player.y;
    const bearing = aim ? clamp(Math.atan2(aimY - y, Math.max(40, x - aimX)), -.83, .83) : options.angle || 0;
    const velocity = alienAttackSpeed(target, speed);
    gameAudio.bossAttack(options.sound || "volley");
    for (let i = 0; i < count; i++) {
      const angle = bearing + spread * (2 * i / (count - 1) - 1);
      const dx = -Math.cos(angle), dy = Math.sin(angle);
      const arc = options.arc ? target.width * .19 : 0;
      addBossProjectile(x + dx * arc, y + dy * arc, velocity * dx, velocity * dy,
        { glyph, ...options, wavePhase: i * .7, color: alienGlyphColor(target, glyph) });
    }
  });
}

function wall(at, speed, glyph) {
  return beat(at, target => {
    const span = flightBounds.bottom - flightBounds.top;
    const spacing = Math.max(30, span / 14);
    const velocity = alienAttackSpeed(target, speed);
    gameAudio.bossAttack("volley");
    for (let y = flightBounds.top; y <= flightBounds.bottom + spacing / 2; y += spacing) {
      if (Math.abs(y - target.gapY) < target.gapSize / 2 + 14) continue;
      addBossProjectile(target.x - target.width * .45, y, -velocity, 0,
        { glyph, radius: 9, color: alienGlyphColor(target, glyph) });
    }
  });
}

function alienGlyphColor(target, glyph) {
  return ({ ember: "#ffad75", prism: "#cabaff", spore: "#bded8b", thread: "#80eafa", shard: "#ffadc4" })[glyph] || target.color;
}

function aimTell(target, at) {
  addBossHazard("aim", { x: target.lockX, y: target.lockY, originX: target.x, originY: target.y,
    warning: target.telegraphDuration + at, duration: .15 });
}

function laneTell(target, at, duration) {
  addBossHazard("guide", { y: target.gapY, thickness: target.gapSize, color: "#9aebf4",
    right: bossPlayerRight(), warning: target.telegraphDuration + at, duration });
}

function beamTell(target, at, y, duration, width = .45) {
  addBossHazard("beam", { y, thickness: Math.max(15, Math.min(58, player.height * width)),
    right: bossPlayerRight() + player.width * .22, color: "#ff6982",
    warning: target.phase === "attack" ? at : target.telegraphDuration + at, duration });
}

function broodLash(target, y, warning, side, index) {
  addBossHazard("beam", { y, warning, duration: .28, color: target.enraged ? "#ff6486" : "#f7a8ba",
    thickness: Math.max(16, Math.min(57, player.height * (target.enraged ? .43 : .35))),
    right: bossPlayerRight() + player.width * .22, lash: true, side, index });
}

function bandTell(target, at, duration) {
  addBossHazard("band", { y: target.gapY, thickness: target.gapSize, color: "#ff668b",
    right: bossPlayerRight() + player.width * .22, warning: target.telegraphDuration + at, duration });
}

function zoneTell(target, at, x, y, size) {
  addBossHazard("zone", { x, y, radius: alienThreatRadius(target, size), color: "#ff806e",
    warning: target.phase === "attack" ? at : target.telegraphDuration + at, duration: .36 });
}

function bindTell(target, at, x, y, duration, slow) {
  addBossHazard("bind", { x, y, radius: alienThreatRadius(target, .61), color: "#bc88f8",
    warning: target.telegraphDuration + at, duration, slow });
}

function alienMovementScale() {
  let scale = 1;
  for (const hazard of bossHazards) {
    if (hazard.kind === "bind" && hazard.age >= hazard.warning
      && Math.hypot(player.x - hazard.x, player.y - hazard.y) < hazard.radius) scale = Math.min(scale, hazard.slow);
  }
  return scale;
}

function prepareAlienAttack(target) {
  const patterns = bossTypes[target.type].patterns;
  const key = patterns[target.attackIndex = (target.attackIndex + 1) % patterns.length];
  const [name, enName, duration, hint, enHint, plan] = alienPatterns[key];
  target.alienAttack = key;
  target.phase = "telegraph";
  target.phaseTime = 0;
  target.telegraphDuration = Math.max(.8, 1.02 - target.type * .014 - (target.enraged ? .06 : 0));
  target.attackDuration = duration - .11 - target.type * .011 - (target.enraged ? .11 : 0);
  target.attackMotion = null;
  target.lockX = player.x;
  target.lockY = player.y;
  const span = flightBounds.bottom - flightBounds.top;
  target.side = player.y < alienLane(.5) ? 1 : -1;
  const desiredGap = clamp(alienOffsetLane(player.y, target.side * (.12 + target.type * .006)), alienLane(.28), alienLane(.72));
  // Keep the safe lane reachable even on a tall display and while the player is charging.
  const reach = player.speed * (target.telegraphDuration - .24) * .65;
  target.gapY = clamp(desiredGap, player.y - reach, player.y + reach);
  target.gapSize = Math.min(span * .76, Math.max(75, player.height * (1.22 - target.type * .017)));
  bossHazards.length = 0;
  target.attackEvents = plan(target).filter(Boolean).sort((a, b) => a.at - b.at);
  // Ordinary volleys finish crossing the arena during the next warning. A marked
  // safe corridor is exclusive so no old shot can hit a player following its cue.
  if (bossHazards.some(hazard => hazard.kind === "guide")) bossProjectiles.length = 0;
  target.nextEvent = 0;
  if (target.type === 0 && key !== "broodSpawn") gameAudio.bossAttack("coil");
  const move = key === "broodSweep" && target.enraged ? tr("三重触须扫潮", "Triple Tentacle Tide") : tr(name, enName);
  setBossMessage(bossStageTitle(target), (target.enraged ? tr("狂暴 · ", "Enraged · ") : "") + move + " · " + tr(hint, enHint));
}

function runAlienAttack(target) {
  while (target.nextEvent < target.attackEvents.length && target.attackEvents[target.nextEvent].at <= target.phaseTime) {
    target.attackEvents[target.nextEvent++].fire(target);
  }
}

function updateBossProjectiles(seconds) {
  for (let i = bossProjectiles.length - 1; i >= 0; i--) {
    const shot = bossProjectiles[i];
    shot.previousX = shot.x;
    shot.previousY = shot.y;
    shot.age += seconds;
    if (shot.age < shot.homingUntil) {
      const current = Math.atan2(shot.vy, shot.vx);
      const diff = Math.atan2(player.y - shot.y, player.x - shot.x) - current;
      const limit = seconds * 1.3;
      const angle = current + clamp(Math.atan2(Math.sin(diff), Math.cos(diff)), -limit, limit);
      const speed = Math.hypot(shot.vx, shot.vy);
      shot.vx = Math.cos(angle) * speed;
      shot.vy = Math.sin(angle) * speed;
    }
    shot.x += shot.vx * seconds;
    shot.y += shot.vy * seconds;
    if (shot.wave) {
      const phase = shot.wavePhase || 0;
      shot.y += shot.wave * (Math.sin(shot.age * 5 + phase) - Math.sin((shot.age - seconds) * 5 + phase));
    }
    if (shot.reflect && (shot.y < flightBounds.top || shot.y > flightBounds.bottom)) {
      shot.y = clamp(shot.y, flightBounds.top, flightBounds.bottom);
      shot.vy *= -1;
      shot.reflect = false;
    }
    if (shot.burstAt && shot.age >= shot.burstAt) {
      bossProjectiles.splice(i, 1);
      gameAudio.bossAttack("burst");
      const count = shot.burstCount;
      const speed = alienAttackSpeed(boss, 365);
      for (let part = 0; part < count; part++) {
        const angle = part * Math.PI * 2 / count;
        addBossProjectile(shot.x, shot.y, Math.cos(angle) * speed, Math.sin(angle) * speed,
          { radius: 6, color: shot.color, glyph: "orb" });
      }
    } else if (shot.x < -40 || shot.x > viewport.width + 40 || shot.y < -45 || shot.y > viewport.height + 45 || shot.age > 8) {
      bossProjectiles.splice(i, 1);
    }
  }
  for (let i = bossHazards.length - 1; i >= 0; i--) {
    const hazard = bossHazards[i];
    const crossing = hazard.age < hazard.warning;
    hazard.age += seconds;
    if (crossing && hazard.age >= hazard.warning) {
      if (hazard.lash && boss) {
        boss.lashPulse = 1;
        boss.lashIndex = hazard.index;
        boss.lashSide = hazard.side;
        boss.lashY = hazard.y;
        gameAudio.bossAttack("whip");
      } else if (hazard.kind === "beam" || hazard.kind === "band" || hazard.kind === "zone") {
        gameAudio.bossAttack(hazard.kind === "zone" ? "burst" : "beam");
      }
    }
    if (hazard.age >= hazard.warning + hazard.duration) bossHazards.splice(i, 1);
  }
}

function alienHazardHitsPlayer(hazard) {
  if (hazard.age < hazard.warning) return false;
  const radius = player.height * .16;
  if (hazard.kind === "zone") return Math.hypot(player.x - hazard.x, player.y - hazard.y) < hazard.radius + radius;
  if (player.x >= hazard.right) return false;
  const offset = Math.abs(player.y - hazard.y);
  if (hazard.kind === "beam") return offset < hazard.thickness / 2 + radius;
  if (hazard.kind === "band") return offset > Math.max(0, hazard.thickness / 2 - radius);
  return false;
}

function drawAlienHazard(ctx, hazard, quiet) {
  const active = hazard.age >= hazard.warning;
  const progress = clamp(hazard.age / Math.max(.01, hazard.warning), 0, 1);
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = ctx.shadowColor = hazard.color;
  ctx.lineWidth = active ? 2.7 : 1.7;
  ctx.shadowBlur = quiet ? 0 : active ? 16 : 6;
  const half = hazard.thickness / 2;
  if (hazard.kind === "guide") {
    ctx.globalAlpha = .11; ctx.fillRect(0, hazard.y - half, hazard.right, hazard.thickness);
    ctx.globalAlpha = .68;
    ctx.setLineDash([9, 8]);
    ctx.beginPath();
    ctx.moveTo(0, hazard.y - half); ctx.lineTo(hazard.right, hazard.y - half);
    ctx.moveTo(0, hazard.y + half); ctx.lineTo(hazard.right, hazard.y + half);
    ctx.stroke();
  } else if (hazard.kind === "band") {
    const upper = Math.max(0, hazard.y - half), lower = hazard.y + half;
    ctx.globalAlpha = active ? .37 : .1;
    ctx.fillRect(0, 0, hazard.right, upper);
    ctx.fillRect(0, lower, hazard.right, viewport.height - lower);
    ctx.globalAlpha = active ? .95 : .5;
    if (!active) ctx.setLineDash([5, 8]);
    ctx.beginPath();
    ctx.moveTo(0, upper); ctx.lineTo(hazard.right, upper);
    ctx.moveTo(0, lower); ctx.lineTo(hazard.right, lower);
    ctx.stroke();
  } else if (hazard.kind === "beam") {
    if (hazard.lash && active) {
      const trailing = (hazard.age - hazard.warning) / hazard.duration;
      const glow = ctx.createLinearGradient(0, hazard.y - half, 0, hazard.y + half);
      glow.addColorStop(0, "transparent");
      glow.addColorStop(.48, hazard.color);
      glow.addColorStop(.55, hazard.color);
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.globalAlpha = quiet ? .47 : .26 + .32 * (1 - trailing);
      ctx.beginPath();
      ctx.moveTo(0, hazard.y);
      ctx.bezierCurveTo(hazard.right * .19, hazard.y - half * 1.23, hazard.right * .82, hazard.y - half, hazard.right, hazard.y);
      ctx.bezierCurveTo(hazard.right * .77, hazard.y + half, hazard.right * .16, hazard.y + half * 1.17, 0, hazard.y);
      ctx.fill();
    } else {
      ctx.globalAlpha = active ? .74 : .12 + progress * .12;
      ctx.fillRect(0, hazard.y - half, hazard.right, hazard.thickness);
    }
    ctx.globalAlpha = active ? .95 : .67;
    if (!active) ctx.setLineDash([10, 6]); else ctx.strokeStyle = "#fff2e1";
    ctx.beginPath();
    ctx.moveTo(0, hazard.y);
    if (hazard.lash && active && !quiet) {
      const age = hazard.age - hazard.warning;
      const flick = Math.sin(age * 24) * hazard.thickness * .36;
      ctx.lineWidth = 3.5;
      ctx.bezierCurveTo(hazard.right * .25, hazard.y + flick, hazard.right * .67, hazard.y - flick, hazard.right, hazard.y);
      if (boss) ctx.quadraticCurveTo(boss.x - boss.width * .55, hazard.y,
        boss.x - boss.width * .43, boss.y + boss.height * .19 * hazard.side);
      ctx.stroke();
      ctx.globalAlpha = .68;
      ctx.strokeStyle = hazard.color;
      ctx.lineWidth = 7;
      ctx.beginPath();
      for (let x = (age * 440) % 60; x < hazard.right; x += 60) {
        ctx.moveTo(x, hazard.y - flick * .42); ctx.lineTo(Math.min(hazard.right, x + 18), hazard.y + flick * .31);
      }
    } else ctx.lineTo(hazard.right, hazard.y);
    ctx.stroke();
  } else if (hazard.kind === "aim") {
    ctx.globalAlpha = active ? .24 : .42 + progress * .34;
    ctx.setLineDash([7, 7]);
    ctx.beginPath(); ctx.moveTo(hazard.originX, hazard.originY); ctx.lineTo(hazard.x, hazard.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(hazard.x, hazard.y, 12, 0, Math.PI * 2); ctx.stroke();
  } else {
    const binding = hazard.kind === "bind";
    ctx.globalAlpha = active ? binding ? .19 : .59 : .07;
    ctx.beginPath(); ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = active ? .84 : .68;
    if (!active || binding) ctx.setLineDash(binding ? [3, 6] : [9, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(hazard.x, hazard.y, hazard.radius * (binding ? .83 : 1.1), -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hazard.x - 9, hazard.y); ctx.lineTo(hazard.x + 9, hazard.y);
    ctx.moveTo(hazard.x, hazard.y - 9); ctx.lineTo(hazard.x, hazard.y + 9); ctx.stroke();
    if (!quiet && active) {
      const time = (hazard.age - hazard.warning) / hazard.duration;
      ctx.globalAlpha = binding ? .35 : .82 * (1 - time);
      ctx.lineWidth = binding ? 1.1 : 3.5;
      ctx.beginPath();
      if (binding) {
        const spin = hazard.age * .6;
        for (let spoke = 0; spoke < 8; spoke++) {
          const theta = spin + spoke * Math.PI / 4;
          ctx.moveTo(hazard.x + Math.cos(theta) * hazard.radius, hazard.y + Math.sin(theta) * hazard.radius);
          ctx.quadraticCurveTo(hazard.x + Math.cos(theta + .5) * hazard.radius * .8,
            hazard.y + Math.sin(theta + .5) * hazard.radius * .8, hazard.x, hazard.y);
        }
      } else {
        ctx.strokeStyle = "#fff2cf";
        const ring = hazard.radius * (.28 + .7 * Math.sqrt(time));
        ctx.arc(hazard.x, hazard.y, ring, 0, Math.PI * 2);
        for (let ray = 0; ray < 10; ray++) {
          const theta = ray * Math.PI / 5;
          ctx.moveTo(hazard.x + Math.cos(theta) * ring * .67, hazard.y + Math.sin(theta) * ring * .67);
          ctx.lineTo(hazard.x + Math.cos(theta) * ring, hazard.y + Math.sin(theta) * ring);
        }
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawAlienProjectile(ctx, shot, quiet) {
  ctx.save();
  ctx.translate(shot.x, shot.y);
  ctx.rotate(Math.atan2(shot.vy, shot.vx));
  const r = shot.radius;
  ctx.strokeStyle = ctx.fillStyle = ctx.shadowColor = shot.color;
  if (!quiet) {
    ctx.globalAlpha = .48; ctx.lineWidth = r * .75; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-r * (shot.glyph === "thread" ? 6 : 3.8), 0); ctx.lineTo(0, 0); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = quiet ? 0 : shot.burstAt ? 21 : 12;
  ctx.beginPath();
  if (shot.glyph === "prism" || shot.glyph === "shard") {
    ctx.moveTo(r * 1.5, 0); ctx.lineTo(-r * .33, r * .7); ctx.lineTo(-r, 0); ctx.lineTo(-r * .33, -r * .7); ctx.closePath();
  } else {
    ctx.ellipse(0, 0, r, r * (shot.glyph === "thread" ? .52 : .93), 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff7ed"; ctx.beginPath(); ctx.arc(r * .21, 0, r * .36, 0, Math.PI * 2); ctx.fill();
  if (shot.burstAt || shot.glyph === "spore") {
    ctx.globalAlpha = .75; ctx.lineWidth = 1.25; ctx.beginPath();
    ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
