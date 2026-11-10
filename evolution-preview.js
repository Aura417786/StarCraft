"use strict";

const evolutionPreview = { elapsed: 0, lastTime: null, lastPaint: -Infinity, signature: "" };

function previewPulse(ctx, x, y, length, width, color, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-length, -width / 2, length, width, width / 2);
  ctx.fill();
  ctx.restore();
}

function previewWingFire(ctx, ship, level, time, quiet) {
  if (level < 1) return;
  const age = quiet ? .45 : (time + .06) % 1.5;
  const muzzle = { x: ship.x + ship.width * .465, y: ship.y };
  const impactX = 121;
  const progress = clamp(age / evolutionWeaponRules.lanceCharge, 0, 1);
  ctx.strokeStyle = "#81bac970";
  ctx.strokeRect(impactX, ship.y - 6, 8, 12);
  if (level === 3 && progress < 1) {
    ctx.strokeStyle = "#9edfff"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(muzzle.x, muzzle.y, 5 + 5 * progress, -.5 * Math.PI, (2 * progress - .5) * Math.PI); ctx.stroke();
    return;
  }
  const travel = level === 3 ? age - evolutionWeaponRules.lanceCharge : age % .52;
  const x = muzzle.x + travel * 110;
  previewPulse(ctx, x, muzzle.y, level === 3 ? 29 : 11, level === 3 ? 4.7 : 2.6, "#d2f5ff");
  if (level >= 2 && x > impactX) for (const side of [-1, 1]) {
    const d = x - impactX;
    previewPulse(ctx, impactX + d * .7, ship.y + side * d * .65, 10, 2, "#9edfff", side * .68);
  }
}

function previewDroneFire(ctx, ship, level, time, quiet) {
  if (level < 1) return;
  const interval = evolutionWeaponRules.droneInterval[level];
  const age = quiet ? .53 : time % interval;
  const defending = level === 3 && (quiet || time % 3.6 > 2.8);
  const focusX = 123;
  if (level >= 2) {
    ctx.strokeStyle = "#9ce9e2";
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.arc(focusX, ship.y, defending ? 19 : 11, 0, 2 * Math.PI); ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const drone of getEvolutionDronePositions(ship, level)) {
    drawEvolutionDroneBody(ctx, drone, level, true);
    const aim = Math.atan2(ship.y - drone.muzzleY, focusX - drone.muzzleX);
    const x = drone.muzzleX + Math.cos(aim) * 128 * age;
    const y = drone.muzzleY + Math.sin(aim) * 128 * age;
    if (x <= focusX) previewPulse(ctx, x, y, 8, 2.1, "#a0f3de", aim);
  }
}

function previewShieldFire(ctx, ship, level, time, quiet) {
  if (level < 1) return;
  const lance = level === 3;
  const age = quiet ? (lance ? 2.45 : 1.95) : (time + .98) % 3.35;
  const radiusX = ship.width * .6;
  const radiusY = ship.height * .65;
  const capacity = evolutionWeaponRules.absorbLimit[level];
  let absorbed = 0;
  const active = age >= .22 && age < 2.22;
  if (active) {
    ctx.fillStyle = level ? "#ee935837" : "#e8554a1f";
    ctx.strokeStyle = level ? "#ffc08d" : "#fa8c7a";
    ctx.lineWidth = level ? 1.8 : 1.3;
    ctx.beginPath();
    ctx.ellipse(ship.x, ship.y, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  for (let index = 0; index < 8; index++) {
    const y = ship.y + (index % 4 - 1.5) * 8;
    const shotAge = age - (.24 + index * .16);
    if (shotAge < 0) continue;
    const x = 154 - shotAge * 119;
    const edge = ship.x + radiusX * Math.sqrt(1 - ((y - ship.y) / radiusY) ** 2);
    if (x > edge) previewPulse(ctx, x, y, 9, 2.4, "#f596b8", Math.PI);
    else absorbed++;
  }
  const count = Math.min(absorbed, capacity);
  for (let index = 0; index < count; index++) {
    const angle = count === 1 ? 0 : -1.15 + index / (count - 1) * 2.3;
    if (active) {
      const x = ship.x + Math.cos(angle) * (radiusX + 3);
      const y = ship.y + Math.sin(angle) * (radiusY + 3);
      previewPulse(ctx, x, y, 4, 3, "#ffd58c");
    } else if (age >= 2.22 && age < 3.05) {
      const fan = angle * .24, distance = (age - 2.22) * 132;
      previewPulse(ctx, ship.x + radiusX + distance * Math.cos(fan), ship.y + distance * Math.sin(fan),
        lance ? 22 : 12, lance ? 3.2 : 2.4, "#ffce86", fan);
    }
  }
}

function previewRefit(ctx, choice, upgraded) {
  if (choice === "refit-fire") {
    for (const y of [41, 56, 71]) previewPulse(ctx, 122, y, upgraded ? 42 : 30, upgraded ? 4 : 2.7, "#b6d9ff");
    if (upgraded) {
      ctx.fillStyle = "#bedbff";
      ctx.font = "11px sans-serif";
      ctx.fillText("+8%", 118, 85);
    }
    return;
  }
  const heal = choice === "refit-heal";
  const maximum = heal ? player.maxLives : shieldRules.maxCharges;
  const count = Math.min(maximum, (heal ? player.lives : shield.charges) + Number(upgraded));
  ctx.font = "17px sans-serif";
  if (heal && maximum > startingPlayerLives) {
    ctx.fillStyle = "#83e9ad";
    ctx.fillText(`♥ ${count} / ${maximum}`, 89, 61, 100);
  } else {
    for (let index = 0; index < maximum; index++) {
      ctx.fillStyle = index < count ? (heal ? "#83e9ad" : "#ffc293") : "#525b70";
      ctx.fillText(heal ? "♥" : "◆", 89 + index * 18, 61);
    }
  }
  if (upgraded) {
    ctx.fillStyle = "#bedbff";
    ctx.font = "11px sans-serif";
    ctx.fillText(tr("本局补给", "Sortie supply"), 90, 82);
  }
}

function paintEvolutionPreviewPane(ctx, choice, right, time, quiet) {
  const route = choice;
  const ranks = { pierce: 0, blast: 0, aegis: 0 };
  const level = Math.min(3, (evolution[route] || 0) + Number(right && route === choice));
  const label = right ? (choice.startsWith("refit-") ? tr("整备后", "Refitted") : tr("升级后", "Upgraded")) : tr("当前", "Current");
  if (Object.hasOwn(ranks, route)) ranks[route] = level;

  ctx.save();
  ctx.translate(right ? 160 : 0, 0);
  ctx.beginPath();
  ctx.rect(0, 0, 160, 148);
  ctx.clip();
  const background = ctx.createLinearGradient(0, 0, 160, 148);
  background.addColorStop(0, right ? "#173145" : "#141c2b");
  background.addColorStop(1, "#080f1a");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 160, 148);
  if (right) {
    ctx.fillStyle = "#b1e2ff";
    ctx.globalAlpha = quiet ? .34 : .25 + .09 * Math.sin(time * 3);
    ctx.fillRect(0, 0, 160, 2);
    ctx.globalAlpha = 1;
  }
  ctx.translate(0, 16);
  ctx.strokeStyle = "#89b5d217";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(8, 55); ctx.lineTo(151, 55);
  ctx.moveTo(8, 91); ctx.lineTo(151, 91);
  ctx.stroke();

  const ship = { x: 54, y: 55, width: 85, height: 56, visualBank: 0 };
  if (!drawEvolvedPlayer(ctx, ship, ranks, true, 0)) drawFighterVariant(ctx, ship, fighterProfile().id, null, true, 0);
  if (route === "pierce") previewWingFire(ctx, ship, level, time, quiet);
  if (route === "blast") previewDroneFire(ctx, ship, level, time, quiet);
  if (route === "aegis") previewShieldFire(ctx, ship, ranks.aegis, time, quiet);
  if (choice.startsWith("refit-")) previewRefit(ctx, choice, right);
  else {
    const age = quiet ? .24 : (time + .09) % .48;
    previewPulse(ctx, ship.x + ship.width * .465 + age * 131, ship.y, 9, 2, "#ffd5aa");
  }
  ctx.fillStyle = right ? "#c4e5f8" : "#9cacbf";
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.fillText(label, 10, 119);
  ctx.restore();
}

function drawEvolutionChoicePreviews(now) {
  if (!evolution.pending) {
    evolutionPreview.elapsed = 0;
    evolutionPreview.lastTime = null;
    evolutionPreview.lastPaint = -Infinity;
    evolutionPreview.signature = "";
    return;
  }
  if (document.hidden || !windowActive || !Number.isFinite(now)) {
    evolutionPreview.lastTime = null;
    return;
  }
  const quiet = reducedMotion.matches;
  if (evolutionPreview.lastTime !== null && !quiet) {
    evolutionPreview.elapsed += Math.max(0, Math.min(.05, (now - evolutionPreview.lastTime) / 1000));
  }
  evolutionPreview.lastTime = now;
  const signature = [quiet, shipRenderAssets.crimson.ready, evolution.pierce, evolution.blast, evolution.aegis,
    gameLanguage, ...evolutionCards.map(card => card.dataset.choice)].join("/");
  if (signature === evolutionPreview.signature && (quiet || now - evolutionPreview.lastPaint < 1000 / 30)) return;
  evolutionPreview.signature = signature;
  evolutionPreview.lastPaint = now;

  for (const card of evolutionCards) {
    const preview = card.querySelector(".evolution-card-preview");
    const ctx = preview?.getContext?.("2d");
    if (!ctx) continue;
    const choice = card.dataset.choice;
    ctx.setTransform(preview.width / 320, 0, 0, preview.height / 148, 0, 0);
    paintEvolutionPreviewPane(ctx, choice, false, evolutionPreview.elapsed, quiet);
    paintEvolutionPreviewPane(ctx, choice, true, evolutionPreview.elapsed, quiet);
    ctx.fillStyle = "#80a9c43d";
    ctx.fillRect(159.5, 0, 1, 148);
    ctx.fillStyle = "#cde9f9";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("›", 160, 77);
    ctx.textAlign = "start";
  }
}
