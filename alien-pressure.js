"use strict";

// Identity-specific tells, delayed pressure, and one readable opening after each chain.
const alienPressurePlans = [
  ["双相海啸", "Countercurrent Cataclysm", "沿浪墙缺口向前飞行", "Advance inside the wave gap", "water", "coil", 3,
    t => {
      const gap = t.gapY;
      tideTell(t, { material: "water", gapY: gap, thick: .66, bend: .42 });
      // The return current keeps the same reachable trough. An early pressure
      // column closes the old horizontal position while the route stays open.
      return [beat(.48, x => pressureColumn(x, .88, .30, "water")),
        beat(1.27, x => tideTell(x, { at: .96, material: "water", gapY: gap, direction: 1,
          thick: .44, bend: .31, shift: -.028 }))];
    }],
  ["颅冠猎径", "Crown of the Hunt", "避开斜线和收拢弧线", "Dodge the diagonal and closing arc", "bone", "lunge", 3,
    t => [edgeFilament(t, "bone", 0, { y: t.lockY, tilt: .52 * t.side, thickness: .4, duration: .36 }),
      fan(.24, 5, .25, 560, "shard", { lock: true }),
      beat(.40, x => ringTell(x, { material: "bone", at: .91, x: player.x, y: player.y,
        close: true, duration: .67, radius: 1.23 })),
      beat(1.46, x => edgeFilament(x, "bone", .87, { y: player.y, tilt: -.38 * x.side,
        thickness: .31, duration: .37 }))]],
  ["双炉换压", "Furnace Backdraft", "离开两次喷发的区域", "Move clear of both bursts", "magma", "recoil", 3,
    t => [edgeFilament(t, "magma", 0, { y: t.lockY, tilt: .10 * t.side, thickness: .60,
      duration: .82, flare: true }),
      beat(.49, x => pressureBurst(x, .97, .58, "magma")),
      beat(1.44, x => edgeFilament(x, "magma", .93, { y: player.y, tilt: -.28 * x.side,
        thickness: .66, duration: .94, flare: true, flip: true })),
      fan(2.51, 3, .38, 350, "ember", { aim: true, burstAt: .76, burstCount: 6, radius: 12 })]],
  ["经纬闭锁", "Loom of No Return", "先横移再上下换高度", "Strafe, then change altitude", "silk", "sweep", 3,
    t => [pressureColumn(t, 0, .35, "silk"),
      beat(.54, x => edgeFilament(x, "silk", .91, { y: player.y, tilt: .08, thickness: .28, duration: .43 })),
      beat(1.33, x => pressureColumn(x, .92, .37, "silk")),
      beat(2.04, x => edgeFilament(x, "silk", .91, { y: player.y, tilt: -.39 * x.side,
        thickness: .26, duration: .49, flip: true }))]],
  ["双锚绞杀", "Twin Anchor Winch", "向外飞离拖拽的中心", "Thrust away from the pull", "chitin", "lunge", 3,
    t => [vortexTell(t, { material: "chitin", x: t.lockX, y: t.lockY,
      at: 0, strength: 144, duration: 1.50, core: .32, spin: 0 }),
      beat(.69, x => ringTell(x, { material: "chitin", at: .94, x: player.x, y: player.y,
        duration: .72, close: true, radius: 1.26 })),
      beat(1.84, x => vortexTell(x, { material: "chitin", x: player.x, y: player.y,
        at: .94, strength: 132, duration: 1.33, core: .35, spin: 0 }))]],
  ["三镜回廊", "Triptych Reversal", "每次锁定后改变航向", "Change course after each lock", "glass", "sweep", 2,
    t => [portalTell(t, t.telegraphDuration, -1), portalTell(t, t.telegraphDuration + .22, 1),
      beat(.71, x => edgeFilament(x, "glass", .90, { y: player.y, tilt: -.40 * x.side,
        thickness: .27, duration: .47, flip: true })),
      beat(1.79, x => portalTell(x, .91, -1)),
      fan(2.66, 4, .62, 560, "prism", { reflect: true, aim: true })]],
  ["三节断雷", "Breaking the Lightning Spine", "远离扩张的电环边缘", "Move clear of the expanding ring", "plasma", "sweep", 2,
    t => [ringTell(t, { material: "plasma", at: 0, x: t.lockX, y: t.lockY, duration: .86, radius: 1.32 }),
      beat(.39, x => edgeFilament(x, "plasma", .92, { y: player.y, tilt: .32 * x.side,
        swing: -.23 * x.side, thickness: .34, duration: .83 })),
      beat(1.57, x => edgeFilament(x, "plasma", .94, { y: player.y, tilt: -.43 * x.side,
        swing: .12 * x.side, thickness: .29, duration: .66, flip: true }))]],
  ["猎孢蔓延", "Stalking Germination", "折返避开连续锁定区", "Double back after each lock", "spore", "recoil", 2,
    t => [vortexTell(t, { x: t.lockX, y: t.lockY, duration: 2.32, material: "spore",
      strength: 0, core: .8, grow: true }),
      beat(.39, x => pressureBurst(x, .98, .43, "spore")),
      beat(1.02, x => pressureBurst(x, .98, .43, "spore")),
      beat(1.73, x => pressureBurst(x, .98, .48, "spore")),
      fan(2.70, 4, .36, 415, "spore", { aim: true, homingUntil: .65, radius: 10 })]],
  ["逆界坠落", "Inverted Event Horizon", "飞离引力再穿过缺口", "Escape the pull and use the gap", "void", "coil", 2,
    t => [vortexTell(t, { x: t.lockX, y: t.lockY, duration: 1.88, material: "void",
      strength: 148, core: .45, spin: -1, radius: 1.19 }),
      beat(.76, x => {
        const gap = pressureReachableLane(.18);
        tideTell(x, { at: .98, material: "void", gapY: gap, gapSize: x.gapSize * 1.25,
          direction: 1, bend: .36, thick: .52 });
      }),
      beat(2.71, x => pressureColumn(x, 1.02, .34, "void"))]],
  ["记忆放电", "Mnemonic Cascade", "斜移躲开连续的锁定", "Break diagonally after each lock", "nerve", "recoil", 2,
    t => [edgeFilament(t, "nerve", 0, { y: t.lockY, tilt: .23 * t.side, thickness: .32, duration: .35 }),
      beat(.27, x => pressureColumn(x, .96, .32, "nerve")),
      beat(.99, x => edgeFilament(x, "nerve", 1.0, { y: player.y, tilt: -.29 * x.side,
        thickness: .36, duration: .43, flip: true })),
      beat(1.79, x => pressureBurst(x, 1.01, .49, "nerve"))]],
  ["终末潮汐", "Extinction Sequence", "留在缺口内左右移动", "Strafe inside the gap", "fusion", "coil", 2,
    t => {
      tideTell(t, { material: "fusion", gapY: t.gapY, gapSize: t.gapSize * 1.26, thick: .59, bend: .38 });
      return [beat(.51, x => pressureColumn(x, .94, .34, "fusion")),
        beat(2.24, x => vortexTell(x, { x: player.x, y: player.y, at: 1.02, duration: 1.48,
          material: "fusion", strength: 132, core: .31, spin: -1 })),
        beat(3.24, x => pressureBurst(x, 1.01, .48, "fusion"))];
    }],
].map(([name, enName, hint, enHint, material, motion, repeat, build]) => ({
  name, enName, hint, enHint, material, motion, repeat, build,
}));

function pressureReachableLane(offset) {
  const middle = alienLane(.5);
  const direction = player.y < middle ? 1 : -1;
  const limit = player.speed * .48;
  return clamp(alienOffsetLane(player.y, direction * offset), player.y - limit, player.y + limit);
}

function pressureColumn(target, at, duration, material) {
  const room = bossPlayerRight() - flightBounds.left;
  if (room < player.height * .8) {
    // A narrow playfield cannot always give a lateral exit. An altitude lock
    // leaves the same reaction window in a vertical direction.
    beamTell(target, at, player.y, duration, .34);
  } else {
    const width = Math.min(room * .24, Math.max(18, player.width * .35));
    queueAlienHazard(target, "seam", signatureWarning(target, at), { x: player.x, thickness: width,
      duration, material,
      color: alienSignatureColors[material], sound: material === "water" ? "surge" : "beam" });
  }
}

function pressureBurst(target, at, radius, material) {
  zoneTell(target, at, player.x, player.y, radius, material);
}

function chooseAlienPressure(target) {
  if (!target.enraged) return null;
  const plan = alienPressurePlans[target.type];
  return target.pressureCycle++ % plan.repeat === 0 ? plan : null;
}

function bossRuptureDuration(target) {
  return bossPresentationDuration(target, "rupture");
}

function beginAlienRupture(target) {
  target.enraged = true;
  target.enragedAt = target.age;
  target.phase = "rupture";
  target.phaseTime = 0;
  target.pressureCycle = 0;
  target.lashPulse = 0;
  target.attackEvents = [];
  target.nextEvent = 0;
  target.alienAttack = null;
  clearAlienThreats();
  bossHitGrace = Math.max(bossHitGrace, .72);
  setBossMessage(bossStageTitle(target), tr("看清下一次攻击预警", "Watch for the next tell"));
  statusMessage.textContent = tr(target.name + "进入狂暴模式。", target.name + " is enraged.");
  playRupture(target);
}

function beginAlienRecovery(target) {
  target.phase = "recover";
  target.phaseTime = 0;
  if (!target.alienAttack) return;
  const message = tr("反击窗口 · 核心外露", "Counter window · Core exposed");
  setBossMessage(bossStageTitle(target), message);
}

function alienRecoveryDuration(target) {
  const pressure = target.alienAttack === "pressure";
  const recovery = bossRules.recovery + (pressure ? .28 : 0);
  return Math.max(.42, recovery - target.type * .029 - (target.enraged && !pressure ? .16 : 0));
}

function alienDamageExplanation(hit, finalStage) {
  if (finalStage) return tr("终局攻击命中 · " + bossFinaleHint(finalStage.type),
    "Finale attack hit · " + bossFinaleHint(finalStage.type));
  if (hit.attackLabel) {
    const [cn, en, cnHint, enHint] = hit.attackLabel;
    return tr("遭遇「" + cn + "」 · " + cnHint, "Hit by " + en + " · " + enHint);
  }
  return tr("被异形 Boss 攻击命中", "Hit by an alien boss attack");
}

function drawPressureColumn(ctx, hazard, quiet) {
  if (hazard.kind !== "seam" || hazard.material !== "water" || hazard.age < hazard.warning) return false;
  const half = hazard.thickness / 2;
  const progress = signatureProgress(hazard);
  const height = viewport.height;
  const fade = Math.min(1, (1 - progress) * 4.5);
  ctx.save();
  ctx.translate(hazard.x, 0);
  const body = ctx.createLinearGradient(-half, 0, half, 0);
  body.addColorStop(0, "#3976ae12");
  body.addColorStop(.20, "#1676aab8");
  body.addColorStop(.54, "#a7ecf6f5");
  body.addColorStop(.76, "#3a9cc9c2");
  body.addColorStop(1, "#10356e20");
  ctx.globalAlpha = fade;
  ctx.fillStyle = body;
  ctx.fillRect(-half, 0, hazard.thickness, height);
  ctx.strokeStyle = "#a6ecf7";
  ctx.globalAlpha = .43 + fade * .40;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(-half, 0); ctx.lineTo(-half, height);
  ctx.moveTo(half, 0); ctx.lineTo(half, height);
  ctx.stroke();
  ctx.setLineDash([]);
  if (!quiet) {
    ctx.lineWidth = 1.6;
    const drift = progress * 9;
    for (let ribbon = 0; ribbon < 5; ribbon++) {
      const center = -half * .58 + half * .29 * ribbon;
      ctx.globalAlpha = fade * (.21 + (ribbon % 3) * .13);
      ctx.beginPath();
      for (let step = 0; step <= 12; step++) {
        const y = height * step / 12;
        const x = center + half * Math.sin(step * .84 + ribbon * 2 + drift) * .23;
        if (step) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = "#dcfcff";
    ctx.globalAlpha = fade * .76;
    for (let bead = 0; bead < 13; bead++) {
      const y = ((bead * .173 + 1 - progress * 1.3) % 1 + 1) % 1 * height;
      const x = Math.sin(bead * 9.31 + progress * 4) * half * .70;
      ctx.fillRect(x, y, 1.5 + bead % 2, 3 + bead % 4);
    }
  }
  ctx.restore();
  return true;
}
