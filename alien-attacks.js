"use strict";

const alienPatterns = {
  broodArc: ["海渊巨啸", "Hadal Tsunami", 4.20, "进入浪墙缺口并稳住", "Hold in the wave gap",
    t => {
      t.attackMotion = "coil";
      tideTell(t, { at: .22, material: "water", gapY: t.gapY, gapSize: t.gapSize * 1.32, thick: .49, bend: .23, sound: "surge" });
      return t.enraged
        ? [fan(0, 8, .78, 450, "orb", { arc: true, offsetY: -.22, sound: "surge" }),
          fan(.63, 9, .83, 485, "orb", { arc: true, offsetY: .22, sound: "surge" }),
          fan(1.28, 5, .41, 510, "orb", { arc: true, aim: true, sound: "surge" })]
        : [fan(0, 7, .68, 400, "orb", { arc: true, sound: "surge" }),
          fan(.7, 6, .68, 415, "orb", { arc: true, offsetY: .12, sound: "surge" })];
    }],
  broodSweep: ["水压触须", "Hydrostatic Lash", 2.8, "避开触须横扫的高度", "Leave the sweeping lane",
    t => {
      t.attackMotion = "sweep";
      t.lashIndex = 0;
      broodLash(t, t.lockY, t.telegraphDuration, t.side, 0);
      if (t.enraged) t.attackDuration += .65;
      return t.enraged ? [beat(.24, x => broodLash(x, player.y, .68, -x.side, 1)),
        beat(1.13, x => broodLash(x, player.y, .7, x.side, 2)),
        beat(2.12, x => zoneTell(x, .93, player.x, player.y, .34, "water"))]
        : [fan(.58, 3, .25, 430, "orb", { aim: true }),
          beat(.98, x => zoneTell(x, .94, player.x, player.y, .34, "water"))];
    }],
  broodSpawn: ["深海回涡", "Abyssal Undertow", 3.85, "拉开与漩涡中心距离", "Move away from the vortex",
    t => {
      t.attackMotion = "recoil";
      vortexTell(t, { x: t.lockX, y: t.lockY, at: .12, duration: 2.63, material: "water", strength: 135, core: .36 });
      if (t.enraged) vortexTell(t, { x: t.lockX + player.width * .82, y: alienOffsetLane(t.lockY, t.side * .25),
        at: 1.17, duration: 1.83, material: "water", strength: 100, core: .31, spin: -1, radius: .82 });
      return t.enraged
        ? [fan(0, 6, .6, 365, "spore", { homingUntil: 1.1, radius: 11, sound: "hatch" }),
          fan(.75, 4, .37, 395, "spore", { offsetY: .24, homingUntil: .87, radius: 10, sound: "hatch" }),
          fan(1.43, 7, .49, 480, "orb", { aim: true })]
        : [fan(0, 5, .52, 325, "spore", { homingUntil: .94, radius: 11, sound: "hatch" }),
          fan(1.15, 3, .3, 425, "orb", { aim: true })];
    }],

  boneSpears: ["猎骨穿刺", "Barbed Hunt", 3.04, "离开斜线标出的路径", "Clear the diagonal path",
    t => [aimTell(t, 0), fan(0, 3, .13, 560, "shard", { lock: true }),
      beat(.38, x => edgeFilament(x, "bone", .86, { flip: x.side < 0, tilt: .22, duration: .40, thickness: .31 })),
      fan(1.32, 4, .28, 520, "shard", { aim: true })]],
  boneRibs: ["活骨肋笼", "Living Ribcage", 3.34, "进骨笼中缝，或从两端离开", "Enter the rib gap or exit at either end",
    t => { t.attackMotion = "coil"; ribCageTell(t); return []; }],
  bonePounce: ["折颚扑击", "Jaw Pounce", 3.24, "移出即将闭合的弧线", "Move outside the closing arc",
    t => {
      t.attackMotion = "lunge";
      return [edgeFilament(t, "bone", 0, { y: t.lockY, tilt: .04, duration: .35, thickness: .48 }),
        beat(.69, x => ringTell(x, { material: "bone", at: .85, x: player.x, y: player.y, close: true, duration: .71 }))];
    }],

  cinderLava: ["熔脉喷发", "Magma Vein", 3.38, "躲到地壳左侧阴影，或飞出熔流", "Use the rock shadow or leave the magma lane",
    t => { t.attackMotion = "recoil"; magmaCoverTell(t); return []; }],
  cinderHeart: ["炉心熔雨", "Furnace Meteorfall", 3.52, "避开标出的坠落区域", "Leave the impact markers",
    t => [zoneTell(t, 0, t.lockX, t.lockY, .46, "magma"),
      fan(.39, 3, .44, 275, "ember", { burstAt: .72, burstCount: 7, radius: 12 }),
      beat(.77, x => zoneTell(x, .95, player.x, player.y, .48, "magma")),
      fan(1.62, 2, .22, 315, "ember", { aim: true, burstAt: .7, burstCount: 8, radius: 12 })]],
  cinderFurnace: ["高炉焚海", "Blast Furnace", 3.64, "飞出喷流覆盖的扇面", "Fly clear of the plume",
    t => [edgeFilament(t, "magma", 0, { y: t.lockY, tilt: .04, duration: 1.36, thickness: .61, flare: true }),
      beat(1.49, x => edgeFilament(x, "magma", .83, { y: player.y, tilt: -.19, duration: .58, thickness: .36 }))]],

  weaverCross: ["虚空织线", "Void Weft", 3.45, "穿过两条丝线的空档", "Slip between the strands",
    t => [edgeFilament(t, "silk", 0, { y: t.lockY, tilt: .62, duration: .58, thickness: .25 }),
      beat(.62, x => edgeFilament(x, "silk", .84, { y: player.y, flip: true, tilt: -.61, duration: .75, thickness: .29 })),
      fan(1.87, 4, .35, 485, "thread", { aim: true, wave: 34 })]],
  weaverWeb: ["折叠蛛网", "Folded Web", 3.88, "打断发光丝结，丝线会拖慢战机", "Shoot glowing knots to cut the slowing webs",
    t => { t.attackMotion = "coil"; loomTell(t, 0, t.enraged); return [beat(.46, x => zoneTell(x, .92, player.x, player.y, .38, "silk"))]; }],
  weaverSnare: ["结丝伏击", "Silk Ambush", 3.46, "退出丝网标出的圆圈", "Leave the marked circle",
    t => [bindTell(t, 0, t.lockX, t.lockY, 1.70, .73),
      ringTell(t, { material: "silk", at: .79, x: t.lockX, y: t.lockY, close: true, duration: 1.22 }),
      fan(2.13, 4, .32, 460, "thread", { aim: true })]],

  binderClaw: ["双螯合围", "Vice-Grip Pincer", 3.60, "只从双螯开口穿越，也可留在任一侧", "Cross only through the jaw opening, or stay on one side",
    t => { t.attackMotion = "lunge"; pincerTell(t, 0, t.enraged); return []; }],
  binderPin: ["棘链绞索", "Spine Winch", 3.52, "飞离牵引区域的中心", "Thrust out of the pull",
    t => [vortexTell(t, { material: "chitin", x: t.lockX, y: t.lockY, at: .15, strength: 122, duration: 2.1, core: .30, spin: 0 }),
      beat(.80, x => edgeFilament(x, "chitin", .94, { y: player.y, tilt: .36, thickness: .27, duration: .68 }))]],
  binderSpines: ["断层锁链", "Faultline Chains", 3.60, "向左右避开竖直锁链", "Move sideways off the chain",
    t => [seamTell(t, t.telegraphDuration), ringTell(t, { material: "chitin", at: .91, x: t.lockX, y: t.lockY,
      close: true, radius: 1.08, duration: 1.11 }), fan(2.32, 3, .25, 545, "shard", { aim: true })]],

  mirrorPrism: ["三棱反照", "Prismatic Reflection", 3.38, "镜面反弹主炮，换高度或穿甲", "Change altitude or pierce the reflecting shield",
    t => { t.attackMotion = "sweep"; mirrorShieldTell(t); return [fan(1.8, 4, .43, 475, "prism", { aim: true })]; }],
  mirrorBlades: ["折镜夹击", "Mirror Pincer", 3.0, "离开左右交替的射线", "Leave each reflected line",
    t => [beamTell(t, 0, alienOffsetLane(t.lockY, -.11), .21), beamTell(t, .22, alienOffsetLane(t.lockY, .11), .21),
      beat(.47, x => portalTell(x, .81, -1)), beat(1.26, x => portalTell(x, .83, 1))]],
  mirrorDecoy: ["双面坠镜", "Falling Looking Glass", 3.53, "空心假影能打碎，离开汇聚线", "Break the hollow decoys or leave their converging rays",
    t => { t.attackMotion = "sweep"; mirrorDecoyTell(t, 0, t.enraged); return []; }],

  wyrmPulse: ["长脊雷鞭", "Spinal Thunder", 3.56, "打断尾端电极，或等亮段过去再穿过", "Sever the tail electrode or cross after the live segment",
    t => { t.attackMotion = "sweep"; tailConduitTell(t); return t.enraged ? [beat(.62, x => tailConduitTell(x, .42, true))] : []; }],
  wyrmCurrent: ["断潮走廊", "Broken Current", 3.93, "跟住移动中的安全缺口", "Follow the moving opening",
    t => [tideTell(t, { material: "plasma", gapY: t.gapY, gapSize: t.gapSize * 1.15, shift: t.side * .19, thick: .36, bend: .33 }),
      fan(2.53, 5, .49, 550, "thread", { wave: 39, aim: true })]],
  wyrmStreak: ["跃渊串雷", "Leaping Chain Lightning", 3.72, "避开连续锁定的落点", "Leave each lightning mark",
    t => {
      t.attackMotion = "lunge";
      return [zoneTell(t, 0, t.lockX, t.lockY, .37, "plasma"),
        beat(.56, x => edgeFilament(x, "plasma", .83, { y: player.y, tilt: .47, thickness: .33, duration: .71, flip: true })),
        beat(1.54, x => ringTell(x, { material: "plasma", at: .94, x: player.x, y: player.y, duration: .67 }))];
    }],

  sporeSwarm: ["裂梦孢群", "Dreamspore Swarm", 3.48, "变换方向引开追踪弹群", "Change course to evade homing fire",
    t => [fan(0, 5, .72, 395, "spore", { homingUntil: 1, radius: 11 }),
      beat(.54, x => vortexTell(x, { x: player.x, y: player.y, at: .90, duration: 1.49, material: "spore", strength: 0, core: .78, grow: true })),
      fan(1.18, 4, .57, 430, "spore", { homingUntil: .84, radius: 10 })]],
  sporeField: ["菌毯侵袭", "Mycelium Bloom", 3.78, "打碎孢囊，别在菌毯内停留", "Break the sacs and avoid lingering in the bloom",
    t => { t.attackMotion = "recoil"; sporeNestsTell(t, 0, t.enraged); return [fan(1.45, 3, .34, 355, "spore", { aim: true })]; }],
  sporePollen: ["孢浪换气", "Pollen Front", 3.84, "留在移动墙面的缺口", "Hold inside the moving gap",
    t => [tideTell(t, { material: "spore", gapY: t.gapY, gapSize: t.gapSize * 1.17, bend: .18, thick: .78, direction: 1 }),
      beat(2.17, x => zoneTell(x, .92, player.x, player.y, .39, "spore"))]],

  mawEclipse: ["重力蚀口", "Gravitic Eclipse", 3.82, "绕开会偏折火力的引力场，远离裂口", "Flank the shot-bending gravity field and clear its seams",
    t => { t.attackMotion = "coil"; riftFoldTell(t, 0, t.enraged); return []; }],
  mawScars: ["坍缩裂痕", "Collapse Scars", 3.60, "躲开斜线再左右移动", "Dodge the diagonal, then strafe",
    t => [edgeFilament(t, "void", 0, { y: t.lockY, tilt: .54, duration: .61, thickness: .35 }),
      beat(.77, x => seamTell(x, 1.02)),
      beat(1.62, x => portalTell(x, .94, -1))]],
  mawFragments: ["噬界碎浪", "Devouring Shrapnel", 3.72, "穿入从后方逼近的缺口", "Enter the gap in the rear front",
    t => [tideTell(t, { material: "void", direction: 1, gapY: t.gapY, gapSize: t.gapSize * 1.18, bend: .35, thick: .47 }),
      fan(1.86, 3, .44, 340, "ember", { burstAt: .81, burstCount: 8, radius: 12 }),
      fan(2.53, 5, .6, 565, "shard", { aim: true })]],

  neuralSynapse: ["零光突触", "Zero-Light Synapse", 3.62, "按亮起顺序拆节点，或停止移动躲过扫描", "Break lit nodes in order or hold still through the scan",
    t => { t.attackMotion = "recoil"; neuralRelayTell(t); return []; }],
  neuralPulse: ["神经风暴", "Neural Storm", 4.27, "跟住尚未通电的缺口", "Track the unpowered opening",
    t => [tideTell(t, { material: "nerve", direction: 1, gapY: t.gapY, shift: t.side * .26, bend: .40, thick: .44 }),
      beat(2.45, x => edgeFilament(x, "nerve", .86, { y: player.y, tilt: x.side * .36, thickness: .29, duration: .59 }))]],
  neuralRupture: ["王巢坏死", "Royal Rupture", 3.61, "先避开圆圈再横移", "Leave the circles, then strafe",
    t => [zoneTell(t, 0, t.lockX, t.lockY, .42, "nerve"),
      beat(.56, x => ringTell(x, { material: "nerve", at: .89, x: player.x, y: player.y, duration: .77 })),
      beat(1.65, x => seamTell(x, 1.02))]],

  fusionBind: ["群渊处刑", "Confluence Execution", 3.62, "先拆牵引肢或尖刺肢，绕开两者的交点", "Cut the siphon or lance limb and leave their intersection",
    t => { t.attackMotion = "coil"; fusionLimbsTell(t); return []; }],
  fusionCorridor: ["神经潮汐", "Synaptic Tide", 3.58, "留在缺口内左右移动", "Strafe inside the corridor",
    t => [laneTell(t, 0, t.enraged ? 2.72 : 2.35), bandTell(t, 0, .66),
      wall(.29, 550, "shard"), wall(.75, 575, "thread"), wall(1.24, 605, "prism"),
      t.enraged && wall(1.68, 625, "shard"), t.enraged && bandTell(t, 1.5, .52),
      beat(1.29, x => seamTell(x, .93)),
      fan(t.enraged ? 2.82 : 2.45, t.enraged ? 7 : 5, .35, 600, "shard", { aim: true })]],
  fusionPrism: ["两界合围", "Confluence of Two Worlds", 4.38, "转向躲开后方的射击", "Change course off the rear shot",
    t => {
      t.attackMotion = "lunge";
      return [portalTell(t, t.telegraphDuration + .11, -1),
        fan(.26, t.enraged ? 6 : 4, .58, 400, "spore", { homingUntil: 1.05, radius: 11 }),
        beat(.61, x => tideTell(x, { at: .92, material: "fusion", direction: 1, gapY: x.gapY,
          gapSize: x.gapSize * 1.35, thick: .65, bend: .28 })),
        t.enraged && beat(2.78, x => portalTell(x, .96, 1))];
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
  const escalation = 1.13 + target.type * .027;
  const frenzy = target.enraged ? 1.17 + target.type * .004 : 1;
  return base * alienArenaScale() * escalation * frenzy;
}

const alienSignatureKinds = new Set(["tide", "vortex", "filament", "ring"]);
const alienSignatureColors = {
  water: "#75e8f7", bone: "#e7cfab", magma: "#ff9b4e", silk: "#d29bff",
  chitin: "#a8efae", glass: "#b4dbff", plasma: "#63ceff", spore: "#c8e875",
  void: "#e69cff", nerve: "#fa8fb8", fusion: "#f3b0ff",
};

const wideAlienPatterns = new Set([
  "broodArc", "boneRibs", "weaverWeb", "binderClaw", "wyrmCurrent",
  "sporePollen", "mawFragments", "neuralPulse", "fusionCorridor", "fusionPrism",
]);
const complexAlienPatterns = new Set([
  "broodSpawn", "weaverCross", "mirrorDecoy", "wyrmStreak", "mawEclipse",
  "neuralSynapse", "neuralRupture", "fusionBind",
]);
const widePressureMaterials = new Set(["water", "silk", "void", "fusion"]);
const movingAlienHazards = new Set(["tide", "ring", "ribCage", "pincerLock", "tailConduit"]);

function alienWarningLead(target, key, pressure) {
  const wide = pressure ? widePressureMaterials.has(pressure.material) : wideAlienPatterns.has(key);
  const base = target.quickAttack ? .9 : wide ? 1.68 : pressure || complexAlienPatterns.has(key) ? 1.54 : 1.4;
  const seen = target.seenAttacks ??= new Set();
  const teaching = target.quickAttack || seen.has(key) ? 0 : .4;
  seen.add(key);
  return base + teaching + (typeof sortieWarningBonus === "function" ? sortieWarningBonus() : 0);
}

function signatureWarning(target, at) {
  return (target.phase === "attack" ? 0 : target.telegraphDuration) + at;
}

function queueAlienHazard(target, kind, requestedWarning, options) {
  const followup = target.phase === "attack";
  const minimum = kind === "tide" || kind === "band" ? 1.62 : 1.4;
  const adjustment = typeof sortieWarningBonus === "function" ? sortieWarningBonus() : 0;
  const warning = followup ? Math.max(minimum, requestedWarning) + adjustment : requestedWarning;
  const travels = movingAlienHazards.has(kind) || kind === "filament" && options.swingY
    || kind === "vortex" && options.grow;
  const authoredDuration = target.quickAttack ? Math.min(.7, options.duration) : options.duration;
  const duration = travels ? authoredDuration / (target.scaling?.speedMul ?? 1) : authoredDuration;
  addBossHazard(kind, { ...options, warning, duration });
  const attackStart = followup ? target.phaseTime : -target.telegraphDuration;
  const hazardEnd = attackStart + warning + duration + .12;
  target.attackEndFloor = Math.max(target.attackEndFloor ?? 0, hazardEnd);
  target.attackDuration = Math.max(target.attackDuration, hazardEnd);
  if (followup) updateAlienAttackInterval(target);
}

function scheduleSignature(target, kind, options) {
  const { at = 0, material } = options;
  queueAlienHazard(target, kind, signatureWarning(target, at),
    { ...options, color: alienSignatureColors[material] });
}

function tideTell(target, { at = 0, material, gapY, gapSize = target.gapSize,
  direction = -1, bend = 0, thick = .46, shift = 0, sound = "surge" }) {
  const span = flightBounds.bottom - flightBounds.top;
  const radius = player.height * .16;
  const thickness = Math.max(21, player.width * thick);
  // Measure from outside the full viewport. On wide screens the wave still
  // reaches a pilot on the far left before the next tell erases the arena.
  const travel = viewport.width + thickness * 2.4;
  const duration = travel / Math.max(430, viewport.width * (target.enraged ? .52 : .46));
  const opening = Math.max(gapSize, 4 * radius + 17);
  const inset = Math.min(span * .48, opening / 2);
  const center = clamp(gapY, flightBounds.top + inset, flightBounds.bottom - inset);
  const shiftY = clamp(span * shift, -opening * .24, opening * .24);
  scheduleSignature(target, "tide", { at, material, gapY: center, gapSize: opening, direction,
    bend: player.width * bend, shiftY, thickness, duration, sound });
}

function vortexTell(target, { x, y, at = 0, duration, material, strength, core,
  spin = 1, radius = 1, grow = false }) {
  const extent = Math.max(34, Math.min(target.width * .61 * radius,
    (flightBounds.bottom - flightBounds.top) * .35,
    (bossPlayerRight() - flightBounds.left) * .34));
  scheduleSignature(target, "vortex", { x, y, at, duration, material, strength, core,
    spin, radius: extent, grow, sound: grow ? "hatch" : "coil" });
}

function edgeFilament(target, material, at, { y = target.lockY, tilt = 0, thickness = .27,
  duration, flip = false, swing = 0, flare = false, anchorX = player.x }) {
  const span = flightBounds.bottom - flightBounds.top;
  const originX = flip ? -12 : Math.min(viewport.width + 12, target.x - target.width * .22);
  const endX = flip ? viewport.width + 12 : -12;
  const middle = clamp(y, alienLane(.10), alienLane(.90));
  const rise = span * tilt;
  // Pin the warning through the lock point at the player's actual x, even on
  // a very wide monitor or when the mirrored shot starts behind the player.
  const along = clamp((anchorX - originX) / (endX - originX), 0, 1);
  scheduleSignature(target, "filament", {
    at, duration, material, originX, originY: middle - rise * along, endX,
    endY: middle + rise * (1 - along), thickness: Math.max(13, player.height * thickness),
    swingY: span * swing, flare, sound: material === "bone" ? "burst" : "beam",
  });
}

function ringTell(target, { material, at, x, y, duration, close = false, radius = 1 }) {
  const extent = Math.max(42, Math.min(target.width * .70 * radius,
    (flightBounds.bottom - flightBounds.top) * .39,
    (bossPlayerRight() - flightBounds.left) * .35));
  scheduleSignature(target, "ring", { x, y, at, duration, close, radius: extent,
    thickness: Math.max(10, player.height * .17), material, sound: "burst" });
}

function resizeAlienSignatureHazard(hazard, scaleX, scaleY, resizeY) {
  if (!alienSignatureKinds.has(hazard.kind)) return false;
  const widthScale = Math.min(scaleX, scaleY);
  for (const key of ["x", "originX", "endX", "bend"]) {
    if (Number.isFinite(hazard[key])) hazard[key] *= scaleX;
  }
  for (const key of ["y", "originY", "endY", "gapY"]) {
    if (Number.isFinite(hazard[key])) hazard[key] = resizeY(hazard[key]);
  }
  for (const key of ["gapSize", "shiftY", "swingY"]) {
    if (Number.isFinite(hazard[key])) hazard[key] *= scaleY;
  }
  if (Number.isFinite(hazard.radius)) hazard.radius *= widthScale;
  if (Number.isFinite(hazard.thickness)) hazard.thickness *= hazard.kind === "tide" ? scaleX : widthScale;
  return true;
}

function signatureProgress(hazard) {
  return clamp((hazard.age - hazard.warning) / hazard.duration, 0, 1);
}

function alienTideGap(hazard, progress) {
  const shift = hazard.shiftY * Math.sin(progress * Math.PI * 2);
  return clamp(hazard.gapY + shift, flightBounds.top, flightBounds.bottom);
}

function alienTideX(hazard, y, progress) {
  const margin = hazard.thickness * 1.2;
  const travel = viewport.width + margin * 2;
  const leftward = travel * (1 - progress) - margin;
  const wave = hazard.bend * Math.sin(y / Math.max(1, viewport.height) * Math.PI * 2 + progress * 2.4);
  return (hazard.direction < 0 ? leftward : viewport.width - leftward) + wave;
}

function alienFilamentPose(hazard, progress) {
  return { x1: hazard.originX, y1: hazard.originY,
    x2: hazard.endX, y2: hazard.endY + hazard.swingY * Math.sin(progress * Math.PI) };
}

function alienRingRadius(hazard, progress) {
  const ease = hazard.close ? 1 - progress ** 1.32 : 1 - (1 - progress) ** 1.7;
  return hazard.radius * (.12 + .88 * ease);
}

function alienVortexCore(hazard, progress) {
  return hazard.radius * hazard.core * (hazard.grow ? .44 + .56 * Math.sqrt(progress) : .90 + .10 * Math.sin(progress * Math.PI));
}

function alienCurrentVector() {
  let vx = 0;
  let vy = 0;
  for (const hazard of bossHazards) {
    const arenaForce = hazard.kind === "ultimate" ? bossUltimateVector(hazard, player) : alienMechanicVector(hazard, player);
    if (arenaForce) { vx += arenaForce.x; vy += arenaForce.y; }
    if (hazard.kind !== "vortex" || !hazard.strength || hazard.age < hazard.warning) continue;
    const dx = hazard.x - player.x;
    const dy = hazard.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1 || distance >= hazard.radius) continue;
    const inward = hazard.strength * (1 - distance / hazard.radius) ** .65;
    const lateral = inward * hazard.spin * .54;
    vx += (dx * inward - dy * lateral) / distance;
    vy += (dy * inward + dx * lateral) / distance;
  }
  const limit = Math.min(1, 175 / Math.max(1, Math.hypot(vx, vy)));
  return { x: vx * limit, y: vy * limit };
}

function addBossHazard(kind, options) {
  bossHazards.push({ kind, age: 0, color: boss.color, right: boss.x - boss.width * .37, attackLabel: boss.attackLabel, ...options });
}

function addBossProjectile(x, y, vx, vy, options = {}) {
  if (bossProjectiles.length >= bossRules.maxProjectiles) return;
  const difficulty = typeof sortieRules === "function" ? sortieRules().projectileSpeed : 1;
  const speed = difficulty * (boss?.scaling?.speedMul ?? 1);
  bossProjectiles.push({ x, y, previousX: x, previousY: y, vx: vx * speed, vy: vy * speed, age: 0, radius: 7,
    color: boss ? boss.color : "#ffb66f", attackLabel: boss?.attackLabel, ...options });
}

function fan(at, count, spread, speed, glyph, options = {}) {
  return beat(at, target => {
    // 战力越高，弹幕越密（同一招的弹数随 hpMul 增长，最多 +2）。
    const density = Math.max(1, target?.scaling?.hpMul ?? 1);
    const shots = Math.min(11, Math.max(1, Math.round(count * 1.4 + (density - 1) * 1.2)));
    const x = target.x - target.width * .42;
    const y = target.y + target.height * (options.offsetY || 0);
    const aim = options.lock || options.aim;
    const aimX = options.lock ? target.lockX : player.x;
    const aimY = options.lock ? target.lockY : player.y;
    const bearing = aim ? clamp(Math.atan2(aimY - y, Math.max(40, x - aimX)), -.83, .83) : options.angle || 0;
    const velocity = alienAttackSpeed(target, speed);
    gameAudio.bossAttack(options.sound || "volley", x, y);
    for (let i = 0; i < shots; i++) {
      const angle = bearing + spread * (2 * i / Math.max(1, shots - 1) - 1);
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
    // 战力越高，弹墙越密（间距缩小，缺口以外的覆盖更连续）。
    const density = Math.max(1, target?.scaling?.hpMul ?? 1);
    const spacing = Math.max(26, span / (14 * (1 + (density - 1) * .22)));
    const velocity = alienAttackSpeed(target, speed);
    gameAudio.bossAttack("volley", target.x, target.y);
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
  queueAlienHazard(target, "aim", signatureWarning(target, at),
    { x: target.lockX, y: target.lockY, originX: target.x, originY: target.y, duration: .15 });
}

function laneTell(target, at, duration) {
  queueAlienHazard(target, "guide", signatureWarning(target, at), { y: target.gapY, thickness: target.gapSize,
    color: "#9aebf4", right: bossPlayerRight(), duration });
}

function beamTell(target, at, y, duration, width = .45) {
  queueAlienHazard(target, "beam", signatureWarning(target, at), { y, duration,
    thickness: Math.max(15, Math.min(58, player.height * width)),
    right: bossPlayerRight() + player.width * .22, color: "#ff6982" });
}

function broodLash(target, y, warning, side, index) {
  queueAlienHazard(target, "beam", warning, { y, duration: .28, material: "water", color: target.enraged ? "#b9fbff" : "#75e8f7",
    thickness: Math.max(16, Math.min(57, player.height * (target.enraged ? .43 : .35))),
    right: bossPlayerRight() + player.width * .22, lash: true, side, index });
}

function bandTell(target, at, duration) {
  queueAlienHazard(target, "band", signatureWarning(target, at), { y: target.gapY, thickness: target.gapSize,
    color: "#ff668b", right: bossPlayerRight() + player.width * .22, duration });
}

function zoneTell(target, at, x, y, size, material) {
  queueAlienHazard(target, "zone", signatureWarning(target, at), { x, y, material, duration: .36,
    radius: alienThreatRadius(target, size), color: alienSignatureColors[material] || "#ff806e" });
}

function seamTell(target, warning) {
  const room = bossPlayerRight() - flightBounds.left;
  if (room < player.height * .56) return;
  const thickness = Math.min(room * .27, Math.max(16, player.width * (target.enraged ? .43 : .34)));
  queueAlienHazard(target, "seam", warning, { x: player.x, thickness, duration: .32, color: "#ffb476" });
}

function portalTell(target, warning, edge, lock = player) {
  const originX = edge < 0 ? 12 : bossPlayerRight() + Math.min(32, player.width * .3);
  // Alternate the diagonal relative to the last dodge; the shot never tracks after the tell.
  const originY = alienLane(lock.y < alienLane(.5) ? .86 : .14);
  queueAlienHazard(target, "portal", warning, { x: lock.x, y: lock.y, originX, originY,
    duration: .23, speed: target.enraged ? 705 : 650, projectileRadius:lock.radius??10, color: "#d7b7ff" });
}

function firePortal(hazard) {
  const dx = hazard.x - hazard.originX, dy = hazard.y - hazard.originY;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-9) return;
  const speed = alienAttackSpeed(boss, hazard.speed) / distance;
  gameAudio.bossAttack("volley", hazard.originX, hazard.originY);
  addBossProjectile(hazard.originX, hazard.originY, dx * speed, dy * speed,
    { glyph: "prism", radius: hazard.projectileRadius??10, color: hazard.color, attackLabel: hazard.attackLabel });
}

function bindTell(target, at, x, y, duration, slow) {
  queueAlienHazard(target, "bind", signatureWarning(target, at),
    { x, y, radius: alienThreatRadius(target, .61), color: "#bc88f8", duration, slow });
}

function alienMovementScale() {
  let scale = 1;
  for (const hazard of bossHazards) {
    scale = Math.min(scale, alienMechanicSlow(hazard, player));
    if (hazard.kind === "bind" && hazard.age >= hazard.warning
      && Math.hypot(player.x - hazard.x, player.y - hazard.y) < hazard.radius) scale = Math.min(scale, hazard.slow);
  }
  return scale;
}

function updateAlienAttackInterval(target) {
  target.attackInterval = target.telegraphDuration + target.attackDuration + alienRecoveryDuration(target);
}

function prepareAlienAttack(target, allowPressure = false) {
  target.ruptureWindow = false;
  target.counterTriggered = false;
  if (typeof prepareBossPressureSeal === "function" && prepareBossPressureSeal(target)) return;
  const pressure = allowPressure ? chooseAlienPressure(target) : null;
  const patterns = bossTypes[target.type].patterns;
  const key = pressure ? "pressure" : patterns[target.attackIndex = (target.attackIndex + 1) % patterns.length];
  const [name, enName, duration, hint, enHint, plan] = pressure
    ? [pressure.name, pressure.enName, 3.74, pressure.hint, pressure.enHint, pressure.build]
    : alienPatterns[key];
  target.attackLabel = [name, enName, hint, enHint];
  target.alienAttack = key;
  target.quickAttack = target.type !== finalAlienType && !pressure && typeof quickAlienPlans !== "undefined" && !!quickAlienPlans[key];
  target.phase = "telegraph";
  target.phaseTime = 0;
  target.telegraphDuration = alienWarningLead(target, key, pressure);
  target.attackEndFloor = .4;
  target.attackDuration = duration - .11 - target.type * .011 - (target.enraged ? .11 : 0);
  target.attackMotion = pressure?.motion ?? null;
  target.lockX = player.x;
  target.lockY = player.y;
  const span = flightBounds.bottom - flightBounds.top;
  target.side = player.y < alienLane(.5) ? 1 : -1;
  const desiredGap = clamp(alienOffsetLane(player.y, target.side * (.12 + target.type * .006)), alienLane(.28), alienLane(.72));
  // Keep the safe lane reachable even on a tall display and while the player is charging.
  const reach = player.speed * (target.telegraphDuration - .24) * .65;
  target.gapY = clamp(desiredGap, player.y - reach, player.y + reach);
  target.gapSize = Math.min(span * .76, Math.max(75, player.height * (1.22 - target.type * .017)));
  // 战力越高，安全缺口越窄，走位从「站进去」变成「卡进去」。
  const attackDensity = Math.max(1, target.scaling?.hpMul ?? 1);
  target.gapSize = Math.max(54, target.gapSize / (1 + (attackDensity - 1) * .3));
  bossHazards.length = 0;
  target.attackEvents = (target.quickAttack ? quickAlienPlans[key](target) : plan(target)).filter(Boolean);
  if (target.quickAttack) {
    // Both linked contacts fit this authored action; their actual end times
    // set the floor below. The full arena signature still runs separately.
    target.attackDuration = .8;
  }
  target.attackEvents.sort((a, b) => a.at - b.at);
  // Only the time around the authored actions is adjustable. Every tell,
  // scheduled volley, active hazard and recovery still has time to finish.
  const protectedTime = target.telegraphDuration + alienRecoveryDuration(target);
  const baseInterval = protectedTime + target.attackDuration;
  const requestedDuration = baseInterval / (target.scaling?.tempoMul ?? 1) - protectedTime;
  target.attackDuration = Math.max(target.quickAttack ? .8 : requestedDuration, target.attackEndFloor, target.attackEvents.at(-1)?.at ?? 0);
  updateAlienAttackInterval(target);
  // Clear old projectiles before a marked corridor. Any follow-up inside it
  // is announced separately, with enough horizontal room to move.
  if (bossHazards.some(hazard => hazard.kind === "guide" || isWaterTide(hazard))) bossProjectiles.length = 0;
  target.nextEvent = 0;
  if ((target.type === 0 && key !== "broodSpawn") || pressure) gameAudio.bossAttack("coil", target.x, target.y);
  setBossMessage(bossStageTitle(target), tr(target.attackLabel[2], target.attackLabel[3]));
}

function runAlienAttack(target) {
  while (target.nextEvent < target.attackEvents.length && target.attackEvents[target.nextEvent].at <= target.phaseTime) {
    target.attackEvents[target.nextEvent++].fire(target);
  }
}

function isWaterTide(hazard) {
  return hazard.kind === "tide" && hazard.material === "water";
}

function updateBossProjectiles(seconds) {
  const waterTide = bossHazards.find(isWaterTide);
  const troughY = waterTide && alienTideGap(waterTide, signatureProgress(waterTide));
  const sprayBoundary = waterTide && bossPlayerRight() + player.width * .25;
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
    // The marked channel stays navigable as the surge carries its own spray past the pilot.
    if (shot.backgroundPressure && boss && Math.abs(shot.y - boss.pressureGapY) < boss.pressureGapSize / 2 + shot.radius) {
      bossProjectiles.splice(i, 1);
      continue;
    }
    if (waterTide && shot.x <= sprayBoundary && Math.abs(shot.y - troughY) < waterTide.gapSize / 2 + shot.radius) {
      bossProjectiles.splice(i, 1);
      continue;
    }
    if (shot.reflect && (shot.y < flightBounds.top || shot.y > flightBounds.bottom)) {
      shot.y = clamp(shot.y, flightBounds.top, flightBounds.bottom);
      shot.vy *= -1;
      shot.reflect = false;
    }
    if (shot.burstAt && shot.age >= shot.burstAt) {
      bossProjectiles.splice(i, 1);
      gameAudio.bossAttack("burst", shot.x, shot.y);
      const count = shot.burstCount;
      const speed = alienAttackSpeed(boss, 365);
      for (let part = 0; part < count; part++) {
        const angle = part * Math.PI * 2 / count;
        addBossProjectile(shot.x, shot.y, Math.cos(angle) * speed, Math.sin(angle) * speed,
          { radius: 6, color: shot.color, glyph: "orb", attackLabel: shot.attackLabel });
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
        gameAudio.bossAttack("whip", boss.x, boss.y);
      } else if (alienSignatureKinds.has(hazard.kind) || hazard.kind === "ultimate") {
        gameAudio.bossAttack(hazard.sound, boss?.x, boss?.y);
        if (hazard.kind === "tide" || hazard.kind === "ring") addCombatShake(hazard.kind === "tide" ? 3.8 : 2);
      } else if (hazard.kind === "portal" && boss) {
        firePortal(hazard);
      } else if (alienMechanicKinds.has(hazard.kind) || hazard.kind === "beam" || hazard.kind === "band" || hazard.kind === "zone" || hazard.kind === "seam") {
        gameAudio.bossAttack(hazard.sound || (hazard.kind === "zone" ? "burst" : "beam"), boss?.x, boss?.y);
      }
    }
    updateAlienMechanic(hazard, seconds);
    if (hazard.age >= hazard.warning + hazard.duration) bossHazards.splice(i, 1);
  }
}

function alienHazardHitsPlayer(hazard) {
  if (hazard.age < hazard.warning) return false;
  if (hazard.kind === "pressureSeal") return pressureSealHitsPlayer(hazard);
  if (hazard.kind === "ultimate") return bossUltimateHitsPlayer(hazard);
  if (alienMechanicKinds.has(hazard.kind)) return alienMechanicHits(hazard, player);
  const radius = player.height * .16;
  if (alienSignatureKinds.has(hazard.kind)) {
    const progress = signatureProgress(hazard);
    if (hazard.kind === "tide") {
      const near = Math.abs(player.x - alienTideX(hazard, player.y, progress)) < hazard.thickness / 2 + radius;
      return near && Math.abs(player.y - alienTideGap(hazard, progress)) > hazard.gapSize / 2 - radius;
    }
    if (hazard.kind === "ring") {
      const distance = Math.hypot(player.x - hazard.x, player.y - hazard.y);
      return Math.abs(distance - alienRingRadius(hazard, progress)) < hazard.thickness / 2 + radius;
    }
    if (hazard.kind === "vortex") {
      return Math.hypot(player.x - hazard.x, player.y - hazard.y) < alienVortexCore(hazard, progress) + radius;
    }
    const { x1, y1, x2, y2 } = alienFilamentPose(hazard, progress);
    const dx = x2 - x1, dy = y2 - y1;
    const along = clamp(((player.x - x1) * dx + (player.y - y1) * dy) / Math.max(1, dx * dx + dy * dy), 0, 1);
    const width = hazard.thickness * (hazard.flare ? .58 + along * .75 : 1);
    return Math.hypot(player.x - x1 - along * dx, player.y - y1 - along * dy) < width / 2 + radius;
  }
  if (hazard.kind === "zone") return Math.hypot(player.x - hazard.x, player.y - hazard.y) < hazard.radius + radius;
  if (hazard.kind === "seam") return Math.abs(player.x - hazard.x) < hazard.thickness / 2 + radius;
  if (hazard.kind === "beam") {
    const horizontal = player.x - clamp(player.x, 0, hazard.right);
    const vertical = Math.max(0, Math.abs(player.y - hazard.y) - hazard.thickness / 2);
    return Math.hypot(horizontal, vertical) < radius;
  }
  if (player.x >= hazard.right) return false;
  const offset = Math.abs(player.y - hazard.y);
  if (hazard.kind === "band") return offset > Math.max(0, hazard.thickness / 2 - radius);
  return false;
}

function drawAlienHazard(ctx, hazard, quiet) {
  if (hazard.kind === "ultimate") {
    if(typeof drawBossUltimateHazard === "function") drawBossUltimateHazard(ctx,hazard,quiet);
    return;
  }
  if (hazard.kind === "pressureSeal") {
    if (typeof drawPressureSealWarning === "function") drawPressureSealWarning(ctx, hazard, quiet);
    return;
  }
  if (alienMechanicKinds.has(hazard.kind)) { drawAlienMechanic(ctx, hazard, quiet); return; }
  if (typeof drawPressureColumn === "function" && drawPressureColumn(ctx, hazard, quiet)) return;
  if (typeof drawAlienSignatureHazard === "function" && drawAlienSignatureHazard(ctx, hazard, quiet)) return;
  if (alienSignatureKinds.has(hazard.kind)) return;
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
  } else if (hazard.kind === "seam") {
    ctx.globalAlpha = active ? .54 : .11 + progress * .13;
    ctx.fillRect(hazard.x - half, 0, hazard.thickness, viewport.height);
    ctx.globalAlpha = active ? .96 : .76;
    if (!active) ctx.setLineDash([11, 7]);
    ctx.beginPath();
    ctx.moveTo(hazard.x - half, 0); ctx.lineTo(hazard.x - half, viewport.height);
    ctx.moveTo(hazard.x + half, 0); ctx.lineTo(hazard.x + half, viewport.height);
    ctx.stroke();
    if (active) {
      ctx.strokeStyle = "#fff1dd";
      ctx.beginPath();
      ctx.moveTo(hazard.x, 0); ctx.lineTo(hazard.x, viewport.height);
      ctx.stroke();
    }
  } else if (hazard.kind === "aim" || hazard.kind === "portal") {
    ctx.globalAlpha = active ? .24 : .42 + progress * .34;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(hazard.originX, hazard.originY);
    ctx.lineTo(hazard.x, hazard.y);
    if (hazard.kind === "portal") {
      const dx = hazard.x - hazard.originX, dy = hazard.y - hazard.originY;
      const extension = (viewport.width + viewport.height) / Math.max(1, Math.hypot(dx, dy));
      ctx.lineTo(hazard.x + dx * extension, hazard.y + dy * extension);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(hazard.x, hazard.y, 12, 0, Math.PI * 2); ctx.stroke();
    if (hazard.kind === "portal") {
      ctx.beginPath(); ctx.ellipse(hazard.originX, hazard.originY, 9, 18, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha *= .35;
      ctx.fill();
    }
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
