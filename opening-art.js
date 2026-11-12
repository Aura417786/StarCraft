"use strict";

const openingClamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const openingMix = (a, b, t) => a + (b - a) * t;
function openingEase(a, b, t) {
  const x = openingClamp((t - a) / (b - a));
  return x * x * (3 - 2 * x);
}

const openingPalette = { red: "#ff7057", blue: "#66ceff", yellow: "#ffd47b" };
const openingStarField = Array.from({ length: 120 }, (_, index) => [
  (index * .6180339887) % 1, (index * .7548776662) % 1, (index * .4142135623) % 1
]);
const openingBossFormation = [
  [.91, .18, .076], [.79, .22, .084], [.95, .30, .080], [.86, .34, .088],
  [.74, .35, .093], [.93, .47, .095], [.81, .48, .104], [.69, .52, .122],
  [.93, .64, .092], [.82, .65, .096], [.72, .72, .103],
];
const openingFighterFormation = ["scout", "armored", "gunner"];

function openingPlate(ctx, image, w, h, scale = 1, panX = 0, panY = 0, pivotX = .5, pivotY = .5) {
  if (!image?.naturalWidth) return false;
  const base = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  const width = image.naturalWidth * base * scale, height = image.naturalHeight * base * scale;
  const x = openingClamp((w - width) * pivotX + panX * w, w - width, 0);
  const y = openingClamp((h - height) * pivotY + panY * h, h - height, 0);
  ctx.drawImage(image, x, y, width, height);
  return true;
}

function openingGlow(ctx, x, y, r, color, alpha = 1) {
  if (!(r > 0 && alpha > 0)) return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha *= alpha;
  const light = ctx.createRadialGradient(x, y, 0, x, y, r);
  light.addColorStop(0, color);
  light.addColorStop(1, "#00000000");
  ctx.fillStyle = light;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

function openingStars(ctx, w, h, t, speed, length = 0) {
  ctx.save();
  for (const [x0, y0, depth] of openingStarField) {
    const x = ((x0 - (t * speed * (.2 + depth) % 1) + 1) % 1) * w;
    const y = y0 * h;
    ctx.fillStyle = depth > .72 ? "#badffb" : "#7790b0";
    ctx.globalAlpha = .12 + depth * .42;
    ctx.fillRect(x, y, 1 + depth * (1.3 + length), .7 + depth * 1.3);
  }
  ctx.restore();
}

function openingLabel(ctx, label, value, x, y, size) {
  ctx.textAlign = "left";
  ctx.font = `600 ${Math.round(size)}px system-ui, sans-serif`;
  ctx.fillStyle = "#9accd8";
  ctx.fillText(label, x, y);
  ctx.font = `500 ${Math.round(size * .86)}px monospace`;
  ctx.fillStyle = "#7593a7";
  ctx.fillText(value, x, y + size * 1.55);
}

function openingRadar(ctx, w, h, elapsed, language, route = false) {
  const x = w * .58, y = h * .48, r = Math.min(w * .25, h * .38);
  const scan = elapsed * .60;
  ctx.save();
  ctx.fillStyle = "#030910ac";
  ctx.fillRect(0, 0, w, h);
  ctx.translate(x, y);
  ctx.strokeStyle = "#34566b";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 5; i++) {
    ctx.beginPath(); ctx.ellipse(0, 0, r * i / 5, r * i / 5, 0, 0, 2 * Math.PI); ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6, nx = Math.cos(angle), ny = Math.sin(angle);
    ctx.beginPath(); ctx.moveTo(nx * r * .92, ny * r * .92); ctx.lineTo(nx * r * 1.07, ny * r * 1.07); ctx.stroke();
  }
  const sector = ctx.createConicGradient(scan - .65, 0, 0);
  sector.addColorStop(0, "#70dbee00");
  sector.addColorStop(.096, "#70dbee39");
  sector.addColorStop(.11, "#70dbee00");
  sector.addColorStop(1, "#70dbee00");
  ctx.fillStyle = sector; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  openingGlow(ctx, 0, 0, r * .37, "#52a8cf8f");
  ctx.fillStyle = "#b0e5f2"; ctx.beginPath(); ctx.arc(0, 0, r * .033, 0, Math.PI * 2); ctx.fill();
  const count = Math.min(11, 3 + Math.floor(elapsed * 1.5));
  for (let i = 0; i < count; i++) {
    const theta = i * .38 + .3, d = r * (.54 + (i % 4) * .116);
    const px = Math.cos(theta) * d, py = Math.sin(theta) * d;
    const glint = .58 + .42 * Math.sin(elapsed * 2 + i);
    openingGlow(ctx, px, py, 17, "#e2826599", glint);
    ctx.strokeStyle = "#e9a594"; ctx.strokeRect(px - 3.5, py - 3.5, 7, 7);
  }
  if (route) {
    ctx.setLineDash([8, 6]); ctx.strokeStyle = "#9cdfeb"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-r * 1.30, r * .63); ctx.bezierCurveTo(-r * .32, r * .27, -r * .95, -r * 1.09, r * .57, -r * .61); ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.strokeStyle = "#d9866e";
    ctx.beginPath(); ctx.moveTo(r * .95, -r * .53); ctx.quadraticCurveTo(r * .38, -r * .45, 0, 0); ctx.stroke();
  }
  ctx.restore();
  const size = Math.max(12, Math.min(21, h * .034));
  if (route) openingLabel(ctx, language ? "EVACUATION CORRIDOR" : "撤离航线", "ORBITAL SHADOW", w * .12, h * .24, size);
  else openingLabel(ctx, language ? "EARTH · RETURN SIGNAL" : "地球 · 回波锁定", `${count} / 11   LIFE SIGNATURES`, w * .12, h * .24, size);
}

function openingSprite(ctx, image, x, y, w, h, angle = 0, alpha = 1) {
  if (!image?.naturalWidth) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalAlpha *= alpha;
  ctx.drawImage(image, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function openingShip(ctx, frame, x, y, w, h, bank, throttle) {
  const color = openingPalette[frame.fighter];
  const wake = w * (.38 + .60 * throttle);
  const tail = x - w * .36;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(bank); ctx.translate(-x, -y);
  for (const side of [-1, 1]) {
    const jetY = y + side * h * .10;
    const trail = ctx.createLinearGradient(tail - wake, 0, tail, 0);
    trail.addColorStop(0, "#93dcff00");
    trail.addColorStop(.69, "#5cb5ef37");
    trail.addColorStop(1, "#dcf9ffe5");
    ctx.fillStyle = trail;
    ctx.beginPath(); ctx.moveTo(tail - wake, jetY);
    ctx.quadraticCurveTo(tail - wake * .25, jetY - h * .024, tail + w * .04, jetY - h * .037);
    ctx.lineTo(tail + w * .04, jetY + h * .037);
    ctx.quadraticCurveTo(tail - wake * .25, jetY + h * .023, tail - wake, jetY); ctx.fill();
    openingGlow(ctx, tail, jetY, h * .20, "#6bc5f18a", .4 + throttle * .6);
  }
  const drawn = typeof drawFighterVariant === "function" &&
    drawFighterVariant(ctx, { x, y, width: w, height: h, visualBank: 0 }, frame.fighter, null, true, frame.seconds);
  if (!drawn) openingSprite(ctx, frame.images[frame.fighter], x, y, w, h);
  openingGlow(ctx, x + w * .30, y - h * .12, h * .27, color + "35", .45);
  ctx.restore();
}

function openingGate(ctx, frame, w, h, elapsed) {
  const progress = openingEase(0, 4.85, elapsed);
  const approach = frame.quiet ? progress * .42 : progress;
  openingPlate(ctx, frame.images.hangar, w, h, 1.01 + approach * 2.38, 0, 0, .779, .515);
  const size = Math.min(w, h * 1.777) * openingMix(.36, .105, progress);
  const x = w * openingMix(.46, .78, progress);
  const y = h * openingMix(.70, .50, progress);
  openingShip(ctx, frame, x, y, size, size * .67, -.18 * (1 - progress), .4 + progress * .6);
  const portal = w * .777;
  openingGlow(ctx, portal, h * .51, Math.max(w, h) * (.17 + progress * .50), "#effbffe0", progress * .92);
  const exposure = openingEase(.58, 1, progress) * (frame.quiet ? .73 : .95);
  ctx.fillStyle = `rgba(232,247,255,${exposure})`; ctx.fillRect(0, 0, w, h);
}

function openingFire(ctx, frame, x, y, w, h, fire) {
  const color = openingPalette[frame.fighter];
  const charge = openingEase(142.4, 145.28, frame.seconds);
  if (fire <= 0) {
    openingGlow(ctx, x, y, h * (.024 + charge * .17), color + "d0", charge);
    openingGlow(ctx, x, y, h * .028, "#fff6ecd9", charge);
    return;
  }
  const span = Math.max(0, w - x) * Math.min(1, fire * 4.1);
  if (frame.fighter === "red") {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const thickness = h * openingMix(.022, .075, Math.min(1, fire * 2.1));
    const core = ctx.createLinearGradient(0, y - thickness, 0, y + thickness);
    core.addColorStop(0, "#ff643600"); core.addColorStop(.30, "#fa4e34a9");
    core.addColorStop(.5, "#fff4dc"); core.addColorStop(.70, "#fa4e34a9"); core.addColorStop(1, "#ff643600");
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.moveTo(x, y - thickness * .20); ctx.lineTo(x + span, y - thickness);
    ctx.lineTo(x + span, y + thickness); ctx.lineTo(x, y + thickness * .20); ctx.fill();
    ctx.restore();
  } else {
    const shots = frame.fighter === "blue" ? 5 : 13;
    for (let i = 0; i < shots; i++) {
      const ratio = (i + .5) / shots - .5;
      const endX = x + span * (.84 + Math.cos(ratio * Math.PI) * .16);
      const endY = y + h * ratio * fire * (frame.fighter === "blue" ? .47 : 1.40);
      ctx.strokeStyle = color; ctx.lineWidth = frame.fighter === "blue" ? 2.7 : 1.6;
      ctx.beginPath(); ctx.moveTo(x + (endX - x) * .75, y + (endY - y) * .73); ctx.lineTo(endX, endY); ctx.stroke();
      openingGlow(ctx, endX, endY, h * .049, color + "bb");
    }
  }
  openingGlow(ctx, x, y, h * .20, color + "e6", .78);
}

function openingFleet(ctx, frame, w, h) {
  const t = frame.seconds, size = Math.min(w, h * 1.8);
  const elapsed = Math.max(0, t - 139.15);
  const pullback = openingEase(141.5, 145.34, t);
  const fire = openingEase(145.24, 145.91, t);
  const separation = 1 - openingEase(145.54, 146.03, t);
  const layout = frame.layout?.();
  const aspect = { x: .17, y: .517, width: .141, height: .167, ...layout };
  if (layout?.backdrop) {
    const { image, x, y, width, height } = layout.backdrop;
    ctx.drawImage(image, x * w, y * h, width * w, height * h);
    ctx.fillStyle = "#03060c66"; ctx.fillRect(0, 0, w, h);
  } else openingPlate(ctx, frame.images.orbit, w, h, 1.05);
  openingStars(ctx, w, h, t, frame.quiet ? .001 : .012, frame.quiet ? 0 : 2.4);
  const parade = Math.sin(elapsed * .5) * (frame.quiet ? 0 : .006);
  for (let i = 0; i < openingBossFormation.length; i++) {
    const [px, py, depth] = openingBossFormation[i];
    const x = w * (px + .09 * (1 - openingEase(0, 2, elapsed)));
    const y = h * (py + parade * (i % 2 ? -1 : 1));
    const width = size * depth * openingMix(.92, 1.03, pullback);
    openingGlow(ctx, x, y, width * .72, i % 2 ? "#b274a640" : "#77b6dd4f", separation);
    openingSprite(ctx, frame.images[`alien${i}`], x, y, width, width * .66, Math.sin(elapsed * .7 + i) * .05, separation * .90);
  }
  for (let row = 0; row < 4; row++) for (let index = 0; index < 7; index++) {
    const x = w * (.615 + index * .052 + row * .025 + parade);
    const y = h * (.29 + row * .14 + (index - 3) ** 2 * .0038 + parade);
    const width = size * (.043 - index * .0026);
    const img = frame.images[openingFighterFormation[(index + row) % 3]];
    openingSprite(ctx, img, x, y, width, width * .65, 0, separation * (.80 - index * .065));
  }
  const nearW = size * .485, nearH = nearW * .67;
  const x = openingMix(w * .243, w * aspect.x, pullback);
  const y = openingMix(h * .63, h * aspect.y, pullback);
  const width = openingMix(nearW, w * aspect.width, pullback);
  const height = openingMix(nearH, h * aspect.height, pullback);
  openingShip(ctx, frame, x, y, width, height, -.13 * (1 - pullback), .72);
  openingFire(ctx, frame, x + width * .465, y, w, h, fire);
  const flare = (1 - openingEase(0, .46, elapsed)) * (frame.quiet ? .32 : .69);
  if (flare > 0) {
    ctx.fillStyle = `rgba(231,248,255,${flare})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawOpeningCanopy(ctx, w, h, elapsed, quiet, fighter) {
  const closure = openingEase(.1, 3.38, elapsed);
  const lip = h * openingMix(-.26, .75, closure);
  const trim = h * openingMix(.008, .019, closure);
  const paint = openingPalette[fighter];
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, -h * .09); ctx.lineTo(w * .66, -h * .09);
  ctx.quadraticCurveTo(w * .72, lip - h * .30, w * .74, lip - h * .20);
  ctx.bezierCurveTo(w * .51, lip + h * .026, w * .28, lip + h * .034, 0, lip);
  ctx.closePath();
  const glass = ctx.createLinearGradient(w * .07, lip, w * .51, 0);
  glass.addColorStop(0, "#1027358c");
  glass.addColorStop(.37, "#22405d34");
  glass.addColorStop(.59, "#70b8d130");
  glass.addColorStop(1, "#03070db0");
  ctx.fillStyle = glass; ctx.fill();
  ctx.lineWidth = trim; ctx.strokeStyle = "#090e17e8"; ctx.stroke();
  ctx.lineWidth = trim * .20; ctx.strokeStyle = paint + "b0"; ctx.stroke();
  ctx.clip();
  const reflect = ctx.createLinearGradient(w * .19, h * .51, w * .56, h * .22);
  const shift = quiet ? .49 : openingMix(.29, .60, closure);
  reflect.addColorStop(0, "#bdeeff00");
  reflect.addColorStop(shift - .08, "#bdeeff00");
  reflect.addColorStop(shift, "#bdeeff58");
  reflect.addColorStop(shift + .035, "#bdeeff17");
  reflect.addColorStop(1, "#bdeeff00");
  ctx.fillStyle = reflect; ctx.fillRect(0, 0, w, h);
  ctx.restore();
  if (closure > .96) openingGlow(ctx, w * .73, lip - h * .20, h * .048, "#83dce5b0");
}

function drawOpeningArt(ctx, frame, w, h) {
  const { seconds, images, quiet, language } = frame;
  const cutIndex = openingCuts.findLastIndex(cut => cut.start <= seconds);
  const cut = openingCuts[Math.max(0, cutIndex)];
  const elapsed = seconds - cut.start;
  const end = openingCuts[cutIndex + 1]?.start ?? openingDuration;
  const progress = openingEase(0, end - cut.start, elapsed);
  const zoom = openingMix(...cut.lens, quiet ? 0 : progress);
  const panX = quiet ? 0 : cut.pan[0] * progress, panY = quiet ? 0 : cut.pan[1] * progress;
  ctx.fillStyle = "#02050b"; ctx.fillRect(0, 0, w, h);
  if (cut.art === "formation") { openingFleet(ctx, frame, w, h); return; }
  if (cut.art === "launch") { openingGate(ctx, frame, w, h, elapsed); return; }

  const fillHeight = Math.min(h, w * .67);
  ctx.save();
  ctx.translate(0, (h - fillHeight) * .5);
  ctx.beginPath(); ctx.rect(0, 0, w, fillHeight); ctx.clip();
  const filmH = fillHeight;
  const isSpace = ["earth", "earthSignal", "survey", "contact", "brief"].includes(cut.art);
  const plate = isSpace ? images.earth
    : cut.art === "canopy" ? images.helmet : images[cut.art] ?? images.hangar;
  openingPlate(ctx, plate, w, filmH, zoom, panX, panY, cut.pivot);
  if (isSpace) openingStars(ctx, w, filmH, seconds, quiet ? .0002 : .0018);
  if (cut.art === "earthSignal") {
    const phase = (elapsed % 6.3) / 6.3;
    ctx.save(); ctx.globalAlpha = (1 - phase) * .65; ctx.strokeStyle = "#7bdff4"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(w * .41, filmH * .66, 2 + phase * w * .59, 2 + phase * filmH * .44, -.22, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  if (cut.art === "survey" || cut.art === "brief") openingRadar(ctx, w, filmH, elapsed, language, cut.art === "brief");
  if (cut.art === "contact") {
    ctx.fillStyle = "#07112558"; ctx.fillRect(0, 0, w, filmH);
    for (let i = 0; i < 4; i++) {
      const s = w * (.13 + i * .020);
      openingSprite(ctx, images[`alien${i}`], w * (.43 + i * .15 - progress * .075), filmH * (.46 + (i % 2) * .135), s, s * .65, -.07 + progress * .12, .69);
    }
    openingLabel(ctx, language ? "FORWARD ARRAY · NO RESPONSE" : "前沿阵列 · 无应答", "SIGNAL LOST", w * .10, filmH * .24, Math.max(12, filmH * .029));
  }
  if (cut.art === "hangar" || cut.art === "systems") {
    const size = Math.min(w, filmH * 1.76) * (cut.art === "hangar" ? .46 : .61);
    const x = w * (.56 + .02 * progress), y = filmH * (cut.art === "hangar" ? .58 : .54);
    openingGlow(ctx, x, y + size * .13, size * .43, "#65a5bf44", .86);
    openingShip(ctx, frame, x, y, size, size * .67, -.13, cut.art === "systems" ? .54 : .16);
    if (cut.art === "systems") {
      const s = Math.max(12, Math.min(19, filmH * .031));
      openingLabel(ctx, language ? "SORTIE SYSTEMS" : "出击自检", elapsed < 6 ? "PROPULSION · READY" : "PRIMARY SYSTEM · CHARGED", w * .12, filmH * .26, s);
      ctx.fillStyle = "#496270"; ctx.fillRect(w * .12, filmH * .26 + s * 2.35, w * .16, 2);
      ctx.fillStyle = "#a0d7dc"; ctx.fillRect(w * .12, filmH * .26 + s * 2.35, w * .16 * openingEase(0, 8, elapsed), 2);
    }
  }
  if (cut.art === "canopy") drawOpeningCanopy(ctx, w, filmH, elapsed, quiet, frame.fighter);
  const fadeTime = cut.art === "helmet" || cut.art === "canopy" ? .12 : .46;
  const fade = (cutIndex === 0 ? 1 - openingEase(0, 2.2, elapsed) : 1 - openingEase(0, fadeTime, elapsed)) * (quiet ? .50 : .92);
  if (fade > 0) { ctx.fillStyle = `rgba(2,4,10,${fade})`; ctx.fillRect(0, 0, w, filmH); }
  ctx.restore();
}
