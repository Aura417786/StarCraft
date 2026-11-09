"use strict";

const evolutionPreview = { elapsed: 0, lastTime: null, lastPaint: -Infinity, signature: "" };
const evolutionPreviewLinkRoutes = { falcon: "blast", phalanx: "blast", lance: "aegis" };

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
  const age = quiet ? .2 : (time + .06) % evolutionWeaponRules.wingInterval[level];
  const lanceAge = level >= 2
    ? (quiet ? evolutionWeaponRules.lanceCharge + .21 : time % evolutionWeaponRules.lanceInterval[level])
    : Infinity;
  for (const muzzle of getEvolutionWingMuzzles(ship)) {
    previewPulse(ctx, muzzle.x + age * 115, muzzle.y, 12, 2.4, "#a3e9ff");
    if (lanceAge < evolutionWeaponRules.lanceCharge) {
      const progress = lanceAge / evolutionWeaponRules.lanceCharge;
      ctx.strokeStyle = "#a0e0ff";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(muzzle.x, muzzle.y, 4 + progress * 3, -.5 * Math.PI, (2 * progress - .5) * Math.PI);
      ctx.stroke();
    } else if (lanceAge < evolutionWeaponRules.lanceCharge + .65) {
      const x = muzzle.x + (lanceAge - evolutionWeaponRules.lanceCharge) * 143;
      previewPulse(ctx, x, muzzle.y, level === 3 ? 30 : 23, level === 3 ? 4.7 : 3.4, "#d2f5ff");
    }
  }
}

function previewDroneFire(ctx, ship, level, time, quiet, links, showPhalanx) {
  if (level < 1) return;
  const interval = evolutionWeaponRules.droneInterval[level];
  const volley = Math.floor(time / interval) + 1;
  const shieldAge = quiet ? 1.5 : time % 3.35;
  const linkedSalvo = links.phalanx && shieldAge >= .22 && shieldAge < 2.62;
  const salvo = (level === 3 && (quiet ? !showPhalanx : volley % 3 === 0)) || linkedSalvo;
  const age = quiet ? .53 : time % interval;
  const speed = 128;
  if (links.falcon) {
    ctx.strokeStyle = "#83b6b96e";
    ctx.strokeRect(118, ship.y - 8, 8, 16);
    ctx.strokeRect(142, ship.y - 8, 8, 16);
  }
  for (const drone of getEvolutionDronePositions(ship, level)) {
    drawEvolutionDroneBody(ctx, drone, level, true);
    const aim = Math.atan2(ship.y - drone.muzzleY, 122 - drone.muzzleX);
    for (const offset of salvo ? [-.065, 0, .065] : [0]) {
      const angle = aim + offset;
      const x = drone.muzzleX + Math.cos(angle) * speed * age;
      const y = drone.muzzleY + Math.sin(angle) * speed * age;
      if (links.falcon || x <= 123) previewPulse(ctx, x, y, links.falcon ? 13 : 8, 2.1, "#a0f3de", angle);
    }
  }
}

function previewShieldFire(ctx, ship, level, time, quiet, lance) {
  const age = quiet ? (lance ? 2.45 : 1.95) : time % 3.35;
  const radiusX = ship.width * .6;
  const radiusY = ship.height * .65;
  const capacity = evolutionWeaponRules.absorbLimit[level];
  let absorbed = 0;
  const active = age >= .22 && age < 2.22;
  if (active) {
    ctx.fillStyle = "#e8554a1f";
    ctx.strokeStyle = "#fa8c7a";
    ctx.lineWidth = 1.3;
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
  const maximum = heal ? playerRules.maxLives : shieldRules.maxCharges;
  const count = Math.min(maximum, (heal ? player.lives : shield.charges) + Number(upgraded));
  ctx.font = "17px sans-serif";
  for (let index = 0; index < maximum; index++) {
    ctx.fillStyle = index < count ? (heal ? "#83e9ad" : "#ffc293") : "#525b70";
    ctx.fillText(heal ? "♥" : "◆", 89 + index * 18, 61);
  }
  if (upgraded) {
    ctx.fillStyle = "#bedbff";
    ctx.font = "11px sans-serif";
    ctx.fillText("辅助 +4%", 90, 82);
  }
}

function paintEvolutionPreviewPane(ctx, choice, right, time, quiet) {
  const route = evolutionPreviewLinkRoutes[choice] ?? choice;
  const ranks = { pierce: 0, blast: 0, aegis: 0 };
  const links = { ...evolution.links };
  const level = Math.min(3, (evolution[route] || 0) + Number(right && route === choice));
  const label = right ? (choice.startsWith("refit-") ? "整备后" : "升级后") : "当前";
  if (Object.hasOwn(ranks, route)) ranks[route] = level;
  if (choice === "phalanx") ranks.aegis = evolution.aegis;
  if (right && evolutionPreviewLinkRoutes[choice]) links[choice] = true;

  ctx.save();
  ctx.translate(right ? 160 : 0, 0);
  ctx.beginPath();
  ctx.rect(0, 0, 160, 112);
  ctx.clip();
  ctx.fillStyle = right ? "#101e2c" : "#0b1220";
  ctx.fillRect(0, 0, 160, 112);
  ctx.strokeStyle = "#89b5d217";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(8, 55); ctx.lineTo(151, 55);
  ctx.moveTo(8, 91); ctx.lineTo(151, 91);
  ctx.stroke();

  const ship = { x: 49, y: 55, width: 70, height: 46, visualBank: 0 };
  if (!drawEvolvedPlayer(ctx, ship, ranks, true, 0)) drawShipPBR(ctx, ship, "crimson", null, true, 0);
  if (route === "pierce") previewWingFire(ctx, ship, level, time, quiet);
  if (route === "blast") previewDroneFire(ctx, ship, level, time, quiet, links, choice === "phalanx");
  if (route === "aegis" || choice === "phalanx") previewShieldFire(ctx, ship, ranks.aegis, time, quiet, links.lance);
  if (choice.startsWith("refit-")) previewRefit(ctx, choice, right);
  else {
    const age = quiet ? .24 : (time + .09) % .48;
    previewPulse(ctx, ship.x + ship.width * .465 + age * 131, ship.y, 9, 2, "#ffd5aa");
  }
  ctx.fillStyle = right ? "#c4e5f8" : "#9cacbf";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText(label, 9, 105);
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
    ...evolutionCards.map(card => card.dataset.choice)].join("/");
  if (signature === evolutionPreview.signature && (quiet || now - evolutionPreview.lastPaint < 1000 / 30)) return;
  evolutionPreview.signature = signature;
  evolutionPreview.lastPaint = now;

  for (const card of evolutionCards) {
    const preview = card.querySelector(".evolution-card-preview");
    const ctx = preview?.getContext?.("2d");
    if (!ctx) continue;
    const choice = card.dataset.choice;
    paintEvolutionPreviewPane(ctx, choice, false, evolutionPreview.elapsed, quiet);
    paintEvolutionPreviewPane(ctx, choice, true, evolutionPreview.elapsed, quiet);
    ctx.fillStyle = "#80a9c43d";
    ctx.fillRect(159.5, 0, 1, 112);
  }
}
