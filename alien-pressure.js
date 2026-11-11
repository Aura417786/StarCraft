"use strict";

// Identity-specific tells, delayed pressure, and one readable opening after each chain.
const alienPressurePlans = [
  ["双相海啸", "Countercurrent Cataclysm", "在泄压缺口内顶住推流，再迎向返潮", "Counter the push in the relief gap, then face the return tide", "water", "coil", 3,
    t => {
      tideTell(t, { material: "water", gapY: t.gapY, thick: .66, bend: .42 });
      return [beat(1.27, x => tideTell(x, { at: .96, material: "water", gapY: t.gapY, direction: 1,
        thick: .44, bend: .31, shift: -.028 }))];
    }],
  ["颅冠猎径", "Crown of the Hunt", "骨笼夹合前选出口，离开碎骨落点", "Choose an exit before the ribs close and leave the falling bone markers", "bone", "lunge", 3,
    t => { ribCageTell(t, 0, true); bonefallTell(t, 1.78, true); return []; }],
  ["双炉换压", "Furnace Backdraft", "用石脊挡住热浪，再横移射击", "Shelter behind the rising crust, then strafe to fire", "magma", "recoil", 3,
    t => { magmaCoverTell(t, 0, true); return [fan(3.02, 3, .32, 470, "ember", { aim: true })]; }],
  ["经纬闭锁", "Loom of No Return", "先割断丝结，再离开丝网上的落点", "Cut the web before leaving the marked impact", "silk", "sweep", 3,
    t => { loomTell(t, 0, true); return [beat(.51, x => zoneTell(x, .91, player.x, player.y, .39, "silk"))]; }],
  ["双锚绞杀", "Twin Anchor Winch", "通过中央开口离开震荡带", "Escape the shock band through the jaw opening", "chitin", "lunge", 3,
    t => { pincerTell(t, 0, true); return [fan(2.74, 3, .3, 515, "shard", { aim: true })]; }],
  ["三镜回廊", "Triptych Reversal", "换射击角度，打碎空心的镜像", "Change your firing angle and break the hollow reflections", "glass", "sweep", 2,
    t => { mirrorShieldTell(t); mirrorDecoyTell(t, .36, true); return []; }],
  ["三节断雷", "Breaking the Lightning Spine", "切断尾电极或等两路电流流过", "Cut the tail electrodes or cross after both surges", "plasma", "sweep", 2,
    t => { tailConduitTell(t); tailConduitTell(t, 1.24, true); return []; }],
  ["猎孢蔓延", "Stalking Germination", "打碎孢囊，警惕感染后的定点爆发", "Break the sacs and clear the burst if infected", "spore", "recoil", 2,
    t => { sporeNestsTell(t, 0, true); return [fan(1.12, 3, .38, 373, "spore", { aim: true })]; }],
  ["逆界坠落", "Inverted Event Horizon", "逆着旋流绕出引力区，躲开裂缝交叉", "Circle out against the pull and clear the crossing seams", "void", "coil", 2,
    t => { riftFoldTell(t, 0, true); return []; }],
  ["记忆放电", "Mnemonic Cascade", "从反方向拆节点，扫描时停稳", "Sever the reverse circuit or hold still during the sweep", "nerve", "recoil", 2,
    t => { neuralRelayTell(t, 0, true); return [fan(2.78, 3, .38, 507, "shard", { aim: true })]; }],
  ["终末潮汐", "Extinction Sequence", "牵引、尖刺、爆发依次袭来，优先拆肢", "Sever limbs before the pull, lance and burst overlap", "fusion", "coil", 2,
    t => { fusionLimbsTell(t, 0, true); return []; }],
].map(([name, enName, hint, enHint, material, motion, repeat, build]) => ({
  name, enName, hint, enHint, material, motion, repeat, build,
}));

function chooseAlienPressure(target) {
  const plan = alienPressurePlans[target.type];
  const cycle = target.pressureCycle = (target.pressureCycle ?? -1) + 1;
  if (!target.enraged) {
    // 独占招式提前到破壳之前：开场第 3 招起，每 3 招一次。
    // 原来只在半血后才可能出现，快攻时玩家一次都见不到。
    return cycle >= 2 && (cycle - 2) % 3 === 0 ? plan : null;
  }
  return cycle % plan.repeat === 0 ? plan : null;
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
  if (typeof recordCombatFeedback === "function") recordCombatFeedback("shell", target);
  target.attackEvents = [];
  target.nextEvent = 0;
  target.alienAttack = null;
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
  if (target.ruptureWindow) return bossRules.exposedWindow;
  const pressure = target.alienAttack === "pressure";
  const recovery = bossRules.recovery + (pressure ? .28 : 0);
  const tempo = typeof sortieRules === "function" ? sortieRules().attackTempo : 1;
  const authored = Math.max(.42, recovery - target.type * .029 - (target.enraged && !pressure ? .16 : 0)) / tempo;
  // 战力越高，收招硬直越短（反击窗口仍在，只是不再宽裕）。
  const density = Math.max(1, target.scaling?.hpMul ?? 1);
  const squeeze = 1 + (density - 1) * .26;
  const floor = target.alienAttack ? .8 - Math.min(.18, (density - 1) * .11) : .35;
  return Math.max(floor, authored / squeeze);
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
