"use strict";

const alienPatterns = {
  broodArc: ["海渊巨啸", "Hadal Tsunami", 4.20, "移入青色潮沟，等浪墙通过后再离开", "Enter the cyan trough and hold until the wave passes",
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
  broodSweep: ["水压触须", "Hydrostatic Lash", 2.8, "躲开横扫，再离开加压的深海泡", "Dodge each lash, then escape the pressure bubble",
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
  broodSpawn: ["深海回涡", "Abyssal Undertow", 3.85, "离开涡眼，沿旋流切线脱离拖拽", "Move tangentially out of the undertow and away from its eye",
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

  boneSpears: ["猎骨穿刺", "Barbed Hunt", 3.04, "先躲斜向骨矛，再离开新锁线", "Dodge the diagonal bone spears and then their new line",
    t => [aimTell(t, 0), fan(0, 3, .13, 560, "shard", { lock: true }),
      beat(.38, x => edgeFilament(x, "bone", .86, { flip: x.side < 0, tilt: .22, duration: .40, thickness: .31 })),
      fan(1.32, 4, .28, 520, "shard", { aim: true })]],
  boneRibs: ["活骨肋笼", "Living Ribcage", 3.74, "让肋笼从青色开口掠过，再闪避骨片", "Let the ribcage pass through its cyan opening, then evade shards",
    t => [tideTell(t, { material: "bone", gapY: t.gapY, bend: .31, thick: .57 }),
      fan(2.62, 4, .29, 490, "shard", { aim: true })]],
  bonePounce: ["折颚扑击", "Jaw Pounce", 3.24, "避开骨颚扑击线，再跨出咬合处", "Clear the jaw pounce, then step outside the bite",
    t => {
      t.attackMotion = "lunge";
      return [edgeFilament(t, "bone", 0, { y: t.lockY, tilt: .04, duration: .35, thickness: .48 }),
        beat(.69, x => ringTell(x, { material: "bone", at: .85, x: player.x, y: player.y, close: true, duration: .71 }))];
    }],

  cinderLava: ["熔脉喷发", "Magma Vein", 3.38, "绕开熔脉和随后冲出的环形火墙", "Clear the molten fault and the outward blast ring",
    t => [edgeFilament(t, "magma", 0, { y: t.lockY, tilt: .34, duration: 1.16, thickness: .39 }),
      beat(.48, x => ringTell(x, { material: "magma", at: .95, x: player.x, y: player.y, duration: .91 }))]],
  cinderHeart: ["炉心熔雨", "Furnace Meteorfall", 3.52, "避开坠落阴影，再躲熔渣破片", "Evade impact shadows, then the falling slag fragments",
    t => [zoneTell(t, 0, t.lockX, t.lockY, .46, "magma"),
      fan(.39, 3, .44, 275, "ember", { burstAt: .72, burstCount: 7, radius: 12 }),
      beat(.77, x => zoneTell(x, .95, player.x, player.y, .48, "magma")),
      fan(1.62, 2, .22, 315, "ember", { aim: true, burstAt: .7, burstCount: 8, radius: 12 })]],
  cinderFurnace: ["高炉焚海", "Blast Furnace", 3.64, "离开高炉喷口的扇形覆盖范围", "Move beyond the widening furnace plume",
    t => [edgeFilament(t, "magma", 0, { y: t.lockY, tilt: .04, duration: 1.36, thickness: .61, flare: true }),
      beat(1.49, x => edgeFilament(x, "magma", .83, { y: player.y, tilt: -.19, duration: .58, thickness: .36 }))]],

  weaverCross: ["虚空织线", "Void Weft", 3.45, "记住经线和纬线的交替，提前穿过断点", "Read alternating warp and weft, then cross through a break",
    t => [edgeFilament(t, "silk", 0, { y: t.lockY, tilt: .62, duration: .58, thickness: .25 }),
      beat(.62, x => edgeFilament(x, "silk", .84, { y: player.y, flip: true, tilt: -.61, duration: .75, thickness: .29 })),
      fan(1.87, 4, .35, 485, "thread", { aim: true, wave: 34 })]],
  weaverWeb: ["折叠蛛网", "Folded Web", 3.88, "沿青色断口让织网穿过，再避开回拉丝线", "Hold the cyan break while the loom passes, then evade the returning strand",
    t => [tideTell(t, { material: "silk", gapY: t.gapY, bend: .34, thick: .28, direction: 1 }),
      beat(2.28, x => edgeFilament(x, "silk", .78, { y: player.y, tilt: -.28, duration: .49, thickness: .30 }))]],
  weaverSnare: ["结丝伏击", "Silk Ambush", 3.46, "脱离黏网，再从发光的丝网边缘绕开", "Escape the snare before the glowing web cinches",
    t => [bindTell(t, 0, t.lockX, t.lockY, 1.70, .73),
      ringTell(t, { material: "silk", at: .79, x: t.lockX, y: t.lockY, close: true, duration: 1.22 }),
      fan(2.13, 4, .32, 460, "thread", { aim: true })]],

  binderClaw: ["双螯合围", "Vice-Grip Pincer", 3.60, "两侧螯影会收紧，向安全缺口上下移动", "Both jaws close inward. Move vertically through the opening",
    t => {
      t.attackMotion = "lunge";
      return [tideTell(t, { material: "chitin", gapY: t.gapY, gapSize: t.gapSize * 1.21, bend: .39, thick: .62 }),
        fan(2.52, 4, .43, 480, "shard", { aim: true })];
    }],
  binderPin: ["棘链绞索", "Spine Winch", 3.52, "离开牵引钩，注意随后扫过的绞索", "Escape the towing hook, then evade the cable sweep",
    t => [vortexTell(t, { material: "chitin", x: t.lockX, y: t.lockY, at: .15, strength: 122, duration: 2.1, core: .30, spin: 0 }),
      beat(.80, x => edgeFilament(x, "chitin", .94, { y: player.y, tilt: .36, thickness: .27, duration: .68 }))]],
  binderSpines: ["断层锁链", "Faultline Chains", 3.60, "先横移跨过竖链，再远离收紧的链环", "Cross out of the vertical chain and then out of the contracting loop",
    t => [seamTell(t, t.telegraphDuration), ringTell(t, { material: "chitin", at: .91, x: t.lockX, y: t.lockY,
      close: true, radius: 1.08, duration: 1.11 }), fan(2.32, 3, .25, 545, "shard", { aim: true })]],

  mirrorPrism: ["三棱反照", "Prismatic Reflection", 3.38, "晶体触碰上下边缘后会折返，切换高度", "Change altitude before the crystals ricochet off both edges",
    t => [fan(0, 6, .78, 510, "prism", { reflect: true }),
      edgeFilament(t, "glass", .60, { y: t.lockY, tilt: .46, thickness: .26, duration: .41, flip: true }),
      fan(1.31, 5, .65, 545, "prism", { reflect: true, aim: true })]],
  mirrorBlades: ["折镜夹击", "Mirror Pincer", 3.0, "躲开双翼，再看两侧折镜的虚线", "Dodge both wings, then leave each dashed mirror shot",
    t => [beamTell(t, 0, alienOffsetLane(t.lockY, -.11), .21), beamTell(t, .22, alienOffsetLane(t.lockY, .11), .21),
      beat(.47, x => portalTell(x, .81, -1)), beat(1.26, x => portalTell(x, .83, 1))]],
  mirrorDecoy: ["双面坠镜", "Falling Looking Glass", 3.53, "辨认两面镜子的先后次序，从镜面之间穿出", "Read which mirror breaks first and move between their faces",
    t => [edgeFilament(t, "glass", 0, { y: t.lockY, tilt: .31, thickness: .27, duration: .48 }),
      edgeFilament(t, "glass", .62, { y: alienLane(1) + alienLane(0) - t.lockY, tilt: -.32, thickness: .27, duration: .48, flip: true }),
      beat(1.33, x => portalTell(x, .86, t.side))]],

  wyrmPulse: ["长脊雷鞭", "Spinal Thunder", 3.56, "越过尚未通电的折角，再离开摆动的雷鞭", "Cross at the hinge before it energizes, then evade the sweeping whip",
    t => {
      t.attackMotion = "sweep";
      return [edgeFilament(t, "plasma", 0, { y: t.lockY, tilt: .22, swing: .18, thickness: .30, duration: .94 }),
        fan(.52, 5, .52, 510, "thread", { wave: -39 }),
        beat(1.26, x => edgeFilament(x, "plasma", .83, { y: player.y, tilt: -.39, swing: -.17, thickness: .28, duration: .84 }))];
    }],
  wyrmCurrent: ["断潮走廊", "Broken Current", 3.93, "靠近青色缺口，跟着雷潮起伏", "Track the cyan opening as the current shifts",
    t => [tideTell(t, { material: "plasma", gapY: t.gapY, gapSize: t.gapSize * 1.15, shift: t.side * .19, thick: .36, bend: .33 }),
      fan(2.53, 5, .49, 550, "thread", { wave: 39, aim: true })]],
  wyrmStreak: ["跃渊串雷", "Leaping Chain Lightning", 3.72, "看清落雷的连线，穿过未被串起的高度", "Read the grounded lightning route and cross at another altitude",
    t => {
      t.attackMotion = "lunge";
      return [zoneTell(t, 0, t.lockX, t.lockY, .37, "plasma"),
        beat(.56, x => edgeFilament(x, "plasma", .83, { y: player.y, tilt: .47, thickness: .33, duration: .71, flip: true })),
        beat(1.54, x => ringTell(x, { material: "plasma", at: .94, x: player.x, y: player.y, duration: .67 }))];
    }],

  sporeSwarm: ["裂梦孢群", "Dreamspore Swarm", 3.48, "引开孢子再横移，远离它们聚集的荧光巢", "Lead the swarm before cutting sideways. Stay out of its glowing nest",
    t => [fan(0, 5, .72, 395, "spore", { homingUntil: 1, radius: 11 }),
      beat(.54, x => vortexTell(x, { x: player.x, y: player.y, at: .90, duration: 1.49, material: "spore", strength: 0, core: .78, grow: true })),
      fan(1.18, 4, .57, 430, "spore", { homingUntil: .84, radius: 10 })]],
  sporeField: ["菌毯侵袭", "Mycelium Bloom", 3.78, "先离开孢巢，再沿两块菌毯之间穿过", "Escape the nest, then move between the two expanding colonies",
    t => [vortexTell(t, { x: t.lockX, y: t.lockY, duration: 2.08, material: "spore", strength: 0, core: .81, grow: true }),
      beat(.77, x => vortexTell(x, { x: player.x + player.width * .58, y: player.y, at: .95, duration: 1.63,
        material: "spore", strength: 0, core: .79, grow: true })),
      fan(1.89, 3, .5, 355, "spore", { burstAt: .91, burstCount: 7, radius: 12 })]],
  sporePollen: ["孢浪换气", "Pollen Front", 3.84, "贴住净空层，等孢浪通过再换位", "Hold the clear layer until the dense pollen front passes",
    t => [tideTell(t, { material: "spore", gapY: t.gapY, gapSize: t.gapSize * 1.17, bend: .18, thick: .78, direction: 1 }),
      beat(2.17, x => zoneTell(x, .92, player.x, player.y, .39, "spore"))]],

  mawEclipse: ["重力蚀口", "Gravitic Eclipse", 3.82, "反推离开引力井，再跨出坍缩环的路线", "Thrust away from the gravity well, then cross outside the collapsing ring",
    t => [vortexTell(t, { x: t.lockX, y: t.lockY, duration: 2.17, material: "void", strength: 173, core: .38, spin: 0, radius: 1.17 }),
      ringTell(t, { material: "void", at: 1.07, x: t.lockX, y: t.lockY, close: true, duration: 1.13, radius: 1.30 }),
      fan(2.38, 4, .45, 535, "ember", { aim: true })]],
  mawScars: ["坍缩裂痕", "Collapse Scars", 3.60, "避开斜向裂面，再横移离开竖裂", "Clear the diagonal fracture before sliding out of the vertical rift",
    t => [edgeFilament(t, "void", 0, { y: t.lockY, tilt: .54, duration: .61, thickness: .35 }),
      beat(.77, x => seamTell(x, 1.02)),
      beat(1.62, x => portalTell(x, .94, -1))]],
  mawFragments: ["噬界碎浪", "Devouring Shrapnel", 3.72, "利用后方裂面上方的净空，再躲逆流碎片", "Use the rear tear's opening, then avoid the reverse-current fragments",
    t => [tideTell(t, { material: "void", direction: 1, gapY: t.gapY, gapSize: t.gapSize * 1.18, bend: .35, thick: .47 }),
      fan(1.86, 3, .44, 340, "ember", { burstAt: .81, burstCount: 8, radius: 12 }),
      fan(2.53, 5, .6, 565, "shard", { aim: true })]],

  neuralSynapse: ["零光突触", "Zero-Light Synapse", 3.62, "看信号先沿一根神经点亮，再穿过尚未点亮的交叉处", "Follow the order of the neural pulses and cross before the junction fires",
    t => [edgeFilament(t, "nerve", 0, { y: t.lockY, tilt: .35, thickness: .29, duration: .52 }),
      edgeFilament(t, "nerve", .61, { y: t.lockY, tilt: -.32, thickness: .31, duration: .61, flip: true }),
      beat(1.42, x => edgeFilament(x, "nerve", .86, { y: player.y, tilt: x.side * .25, thickness: .35, duration: .58 }))]],
  neuralPulse: ["神经风暴", "Neural Storm", 4.27, "先辨认断路带的偏移，再沿未激活的断路层撤出", "Follow the shifting break in the circuit, then leave the unlit branch",
    t => [tideTell(t, { material: "nerve", direction: 1, gapY: t.gapY, shift: t.side * .26, bend: .40, thick: .44 }),
      beat(2.45, x => edgeFilament(x, "nerve", .86, { y: player.y, tilt: x.side * .36, thickness: .29, duration: .59 }))]],
  neuralRupture: ["王巢坏死", "Royal Rupture", 3.61, "先离开坏死节点，再左右跨出纵向裂隙", "Leave the necrotic nodes, then move sideways out of the vertical rift",
    t => [zoneTell(t, 0, t.lockX, t.lockY, .42, "nerve"),
      beat(.56, x => ringTell(x, { material: "nerve", at: .89, x: player.x, y: player.y, duration: .77 })),
      beat(1.65, x => seamTell(x, 1.02))]],

  fusionBind: ["群渊处刑", "Confluence Execution", 3.62, "逃离减速爆点，再左右躲开纵向裂隙", "Escape the slowing blast, then move sideways out of the rift",
    t => [bindTell(t, 0, t.lockX, t.lockY, 2.0, t.enraged ? .58 : .62),
      zoneTell(t, 1.12, t.lockX, t.lockY, .49, "fusion"), beat(1.08, x => zoneTell(x, .96, player.x, player.y, .39, "fusion")),
      fan(1.74, 4, .47, 600, "shard", { aim: true }),
      beat(2.08, x => {
        seamTell(x, .96);
        if (x.enraged) zoneTell(x, .96, player.x, player.y, .39, "fusion");
      })]],
  fusionCorridor: ["神经潮汐", "Synaptic Tide", 3.58, "待在青色通道内，左右避开纵向裂隙", "Stay in the cyan lane and dodge the vertical rift sideways",
    t => [laneTell(t, 0, t.enraged ? 2.72 : 2.35), bandTell(t, 0, .66),
      wall(.29, 550, "shard"), wall(.75, 575, "thread"), wall(1.24, 605, "prism"),
      t.enraged && wall(1.68, 625, "shard"), t.enraged && bandTell(t, 1.5, .52),
      beat(1.29, x => seamTell(x, .93)),
      fan(t.enraged ? 2.82 : 2.45, t.enraged ? 7 : 5, .35, 600, "shard", { aim: true })]],
  fusionPrism: ["两界合围", "Confluence of Two Worlds", 4.38, "引开后方镜弹，等逆涌经过净空再换位", "Lure the rear mirror shot and cross the break in the reversing surge",
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
  return base * alienArenaScale() * (1.13 + target.type * .023) * (target.enraged ? 1.15 : 1);
}

const alienSignatureKinds = new Set(["tide", "vortex", "filament", "ring"]);
const alienSignatureColors = {
  water: "#75e8f7", bone: "#e7cfab", magma: "#ff9b4e", silk: "#d29bff",
  chitin: "#a8efae", glass: "#b4dbff", plasma: "#63ceff", spore: "#c8e875",
  void: "#e69cff", nerve: "#fa8fb8", fusion: "#f3b0ff",
};

function signatureWarning(target, at) {
  return (target.phase === "attack" ? 0 : target.telegraphDuration) + at;
}

function scheduleSignature(target, kind, options) {
  const { at = 0, duration, material } = options;
  addBossHazard(kind, { ...options, warning: signatureWarning(target, at),
    color: alienSignatureColors[material] });
  const offset = target.phase === "attack" ? target.phaseTime : 0;
  target.attackDuration = Math.max(target.attackDuration, offset + at + duration + .12);
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
  duration, flip = false, swing = 0, flare = false }) {
  const span = flightBounds.bottom - flightBounds.top;
  const originX = flip ? -12 : Math.min(viewport.width + 12, target.x - target.width * .22);
  const endX = flip ? viewport.width + 12 : -12;
  const middle = clamp(y, alienLane(.10), alienLane(.90));
  const rise = span * tilt;
  // Pin the warning through the lock point at the player's actual x, even on
  // a very wide monitor or when the mirrored shot starts behind the player.
  const along = clamp((player.x - originX) / (endX - originX), 0, 1);
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

function zoneTell(target, at, x, y, size, material) {
  addBossHazard("zone", { x, y, radius: alienThreatRadius(target, size), color: alienSignatureColors[material] || "#ff806e",
    material,
    warning: target.phase === "attack" ? at : target.telegraphDuration + at, duration: .36 });
}

function seamTell(target, warning) {
  const room = bossPlayerRight() - flightBounds.left;
  if (room < player.height * .56) return;
  const thickness = Math.min(room * .27, Math.max(16, player.width * (target.enraged ? .43 : .34)));
  addBossHazard("seam", { x: player.x, thickness, warning, duration: .32, color: "#ffb476" });
}

function portalTell(target, warning, edge) {
  const originX = edge < 0 ? 12 : bossPlayerRight() + Math.min(32, player.width * .3);
  // Alternate the diagonal relative to the last dodge; the shot never tracks after the tell.
  const originY = alienLane(player.y < alienLane(.5) ? .86 : .14);
  addBossHazard("portal", { x: player.x, y: player.y, originX, originY,
    warning, duration: .23, speed: target.enraged ? 705 : 650, color: "#d7b7ff" });
}

function firePortal(hazard) {
  const dx = hazard.x - hazard.originX, dy = hazard.y - hazard.originY;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-9) return;
  const speed = alienAttackSpeed(boss, hazard.speed) / distance;
  gameAudio.bossAttack("volley");
  addBossProjectile(hazard.originX, hazard.originY, dx * speed, dy * speed,
    { glyph: "prism", radius: 10, color: hazard.color });
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
  // Clear old projectiles before a marked corridor. Any follow-up inside it
  // is announced separately, with enough horizontal room to move.
  if (bossHazards.some(hazard => hazard.kind === "guide" || isWaterTide(hazard))) bossProjectiles.length = 0;
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
      } else if (alienSignatureKinds.has(hazard.kind)) {
        gameAudio.bossAttack(hazard.sound);
        if (hazard.kind === "tide" || hazard.kind === "ring") addCombatShake(hazard.kind === "tide" ? 3.8 : 2);
      } else if (hazard.kind === "portal" && boss) {
        firePortal(hazard);
      } else if (hazard.kind === "beam" || hazard.kind === "band" || hazard.kind === "zone" || hazard.kind === "seam") {
        gameAudio.bossAttack(hazard.kind === "zone" ? "burst" : "beam");
      }
    }
    if (hazard.age >= hazard.warning + hazard.duration) bossHazards.splice(i, 1);
  }
}

function alienHazardHitsPlayer(hazard) {
  if (hazard.age < hazard.warning) return false;
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
  if (player.x >= hazard.right) return false;
  const offset = Math.abs(player.y - hazard.y);
  if (hazard.kind === "beam") return offset < hazard.thickness / 2 + radius;
  if (hazard.kind === "band") return offset > Math.max(0, hazard.thickness / 2 - radius);
  return false;
}

function drawAlienHazard(ctx, hazard, quiet) {
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
