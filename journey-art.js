"use strict";

// The cinematic layers never affect collision. Playable debris and shots draw over them.
function journeyArtEase(start, end, value) {
  const t = sceneryClamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
}
function journeyArtEnvelope(scene) {
  return journeyArtEase(0, 2.4, scene.elapsed) * (1 - journeyArtEase(scene.duration - 4, scene.duration, scene.elapsed));
}
function journeyArtPolygon(ctx, points, paint) {
  ctx.fillStyle = paint;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
  ctx.fill();
}
function journeyArtGlow(ctx, x, y, radius, core, middle) {
  const light = ctx.createRadialGradient(x, y, 0, x, y, radius);
  light.addColorStop(0, core);
  light.addColorStop(.31, middle);
  light.addColorStop(1, "#00000000");
  ctx.fillStyle = light;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
function journeyArtLight(scene) {
  if (!scene) return null;
  const t = scene.elapsed, envelope = journeyArtEnvelope(scene);
  if (scene.id === "orbit") return { channels: [255, 190, 113], side: -.44, intensity: 1.16,
    amount: envelope * journeyArtEase(5, 21, t) * .88 };
  if (scene.id === "citadel") {
    const bay = journeyCitadelBay(t);
    const nearBay = 1 - journeyArtEase(viewport.width * .15, viewport.width * .6, Math.abs(player.x - bay.x));
    return { channels: [146, 205, 221], side: -.45, intensity: .8, amount: envelope * nearBay * .75 };
  }
  return null;
}
function drawJourneyOrbit(ctx, scene) {
  const w = viewport.width, h = viewport.height, t = scene.elapsed;
  const record = sceneryLayer(0), age = sceneryJourney().currentAge;
  const frame = record?.ready ? sceneryFrame(record.width, record.height, age, 0) : { x: 0, y: 0, width: w, height: h };
  const sx = sceneryClamp(frame.x + frame.width * .935, w * .68, w * .94);
  const u = (sx - frame.x) / frame.width;
  const horizon = frame.y + frame.height * (.934 - .63 * u + .035 * u * u);
  const sunrise = journeyArtEase(4.5, 18, t);
  // A feathered terminator uncovers the same orbital panorama, retaining its texture.
  const terminator = ctx.createLinearGradient(w * (.10 - sunrise * .40), h, w * (1.12 - sunrise * .46), h * .42);
  terminator.addColorStop(0, "#02081531");
  terminator.addColorStop(.46, "#020815a0");
  terminator.addColorStop(1, "#03081700");
  ctx.save();
  ctx.globalAlpha *= .74 * (1 - sunrise * .72);
  ctx.fillStyle = terminator;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  if (sunrise <= 0) return;
  ctx.save();
  ctx.globalAlpha *= sunrise * .82;
  ctx.translate(sx, horizon);
  ctx.rotate(-.22);
  ctx.scale(1, .52);
  journeyArtGlow(ctx, 0, -h * .018 * sunrise, Math.max(2, h * .30), "#ffdb8c6a", "#f5a85738");
  ctx.restore();

  ctx.save();
  ctx.globalAlpha *= sunrise * .75;
  const r = Math.max(2, Math.min(w, h) * .014);
  const visible = r * (.93 - sunrise * 1.23);
  ctx.beginPath();
  ctx.moveTo(sx - r * 3, horizon + r * .65);
  ctx.lineTo(sx + r * 3, horizon - r * .65);
  ctx.lineTo(sx + r * 3, horizon - r * 4);
  ctx.lineTo(sx - r * 3, horizon - r * 4);
  ctx.closePath();
  ctx.clip();
  journeyArtGlow(ctx, sx, horizon + visible, r * 2.5, "#fff3ca", "#ffce8757");
  ctx.fillStyle = "#fff0bc";
  ctx.beginPath();
  ctx.arc(sx, horizon + visible, r * .74, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawJourneyRock(ctx, x, y, width, age, variant, haze, alpha, foreground = false) {
  if (x + width * .70 < 0 || x - width * .70 > viewport.width) return;
  const t = reducedMotion.matches ? 0 : age;
  drawSpaceProp(ctx, "rock", {
    x, y, width: width * 1.21, height: width * 1.13, variant, haze, alpha,
    pitch: .17 + t * (.052 + variant * .012), yaw: -.37 + t * .095 - variant * .53,
    roll: variant * .76 - t * (.040 + variant * .016), sector: 1,
    streak: foreground ? Math.min(7, width * .015) : 0,
  });
}
function drawJourneyBelt(ctx, scene, foreground) {
  const w = viewport.width, h = viewport.height, t = scene.elapsed, quiet = reducedMotion.matches;
  const near = Math.min(w, h);
  if (foreground) {
    if (quiet) return;
    // Near meshes cross faster and grow toward the lens, outside the combat lanes.
    const approach = journeyArtEase(3, 18, t);
    drawJourneyRock(ctx, w * (1.52 - t * .102), -h * .15, near * (.73 + .16 * approach), t, 0, .11, .72, true);
    drawJourneyRock(ctx, w * (1.88 - t * .111), h * 1.14, near * (.65 + .17 * approach), t, 1, .13, .67, true);
    return;
  }
  const pinch = journeyArtEase(2, 11, t) - journeyArtEase(14, 23, t);
  const approach = journeyArtEase(5, 22, t);
  drawJourneyRock(ctx, w * (1.28 - t * .067), h * (.06 + pinch * .073), near * (.61 + .15 * approach), t, 1, .16, 1);
  drawJourneyRock(ctx, w * (1.49 - t * .065), h * (1.02 - pinch * .084), near * (.69 + .15 * approach), t, 2, .18, 1);
  for (let i = 0; i < 5; i++) {
    const size = near * (.026 + sceneryHash(i + 11) * .060);
    drawJourneyRock(ctx, w * (1.18 + i * .18 - t * (.026 + i * .003)),
      h * (i % 2 ? .80 + i * .025 : .16 + i * .025), size, t, (i + 2) % 4, .38, .48);
  }
}

function drawJourneyWreckHalf(ctx, x, y, width, age, variant, haze, alpha, height = width * .87, streak = 0) {
  if (x + width * .72 < 0 || x - width * .72 > viewport.width) return;
  const t = reducedMotion.matches ? 0 : age;
  drawSpaceProp(ctx, "wreck", {
    x, y, width, height, variant, haze, alpha, streak, sector: 2,
    pitch: (variant === 1 ? -.44 : .56) + t * .037,
    yaw: -.84 + variant * .10 + Math.sin(t * .15 + variant * .58) * .23,
    roll: (variant === 1 ? -.33 : .24) + t * (variant === 1 ? .010 : -.011),
  });
}
function drawJourneyWreck(ctx, scene, foreground) {
  const w = viewport.width, h = viewport.height, t = scene.elapsed;
  const near = Math.min(w, h), narrow = journeyArtEase(3, 11, t) - journeyArtEase(14, 20, t);
  const approach = journeyArtEase(4, 21, t);
  if (foreground) {
    if (!reducedMotion.matches) drawJourneyWreckHalf(ctx, w * (1.55 - .109 * t), h * 1.13,
      near * (.68 + .16 * approach), t, 3, .15, .64, near * .68, 5);
    return;
  }
  const span = Math.min(w * .59, h * 1.10) * (.83 + .18 * approach);
  drawJourneyWreckHalf(ctx, w * (1.19 - .060 * t), h * (.09 + narrow * .077), span, t, 1, .18, 1);
  drawJourneyWreckHalf(ctx, w * (1.42 - .065 * t), h * (1.025 - narrow * .078), span * .91, t, 0, .21, 1);
  for (let i = 0; i < 4; i++) {
    const size = near * (.033 + sceneryHash(i + 32) * .065);
    drawJourneyWreckHalf(ctx, w * (1.17 + i * .16 - (.033 + i * .004) * t),
      h * (i % 2 ? .84 + i * .026 : .11 + i * .034), size, t * (1 + i * .16), i, .39, .52);
  }
}

const journeyCitadelHull = [[-652, -43], [-551, -77], [-401, -108], [-328, -123], [-291, -149], [-111, -159],
  [-72, -184], [110, -184], [158, -204], [241, -198], [277, -183], [430, -178], [479, -140], [599, -131],
  [648, -75], [664, -14], [603, 34], [495, 60], [442, 84], [253, 99], [208, 82], [25, 88], [-40, 68],
  [-159, 76], [-210, 55], [-372, 44], [-431, 18], [-563, -10]];
let journeyCitadelArt = null;
function loadJourneyCitadelImage() {
  if (journeyCitadelArt || typeof Image === "undefined") return journeyCitadelArt;
  const image = new Image();
  const record = { image, ready: false };
  journeyCitadelArt = record;
  image.decoding = "async";
  image.onload = () => { record.ready = !!(image.naturalWidth && image.naturalHeight); };
  image.src = "assets/scenery/journey-citadel.png";
  return record;
}
function journeyCitadelBay(elapsed) {
  const acceleration = Math.max(0, elapsed - 19);
  return { x: viewport.width * (1.49 - elapsed * .059 - .004 * acceleration * acceleration), y: viewport.height * .50 };
}
function drawJourneyCitadelVector(ctx) {
  const metal = ctx.createLinearGradient(0, -195, 0, 95);
  metal.addColorStop(0, "#4b6173");
  metal.addColorStop(.22, "#283d4e");
  metal.addColorStop(.54, "#101a27");
  metal.addColorStop(.77, "#1e2b37");
  metal.addColorStop(1, "#0c131f");
  journeyArtPolygon(ctx, journeyCitadelHull, metal);
  journeyArtPolygon(ctx, [[-650, -43], [-405, -98], [-203, -129], [-96, -147], [326, -174], [481, -141],
    [461, -124], [224, -105], [103, -81], [-159, -89], [-404, -49], [-545, -34]], "#66839732");
  journeyArtPolygon(ctx, [[-623, -40], [-454, -42], [-392, -33], [-202, -60], [-140, -52], [104, -53],
    [192, -74], [410, -80], [613, -105], [645, -72], [605, -39], [465, -27], [363, -16], [192, -18],
    [121, 0], [-162, -8], [-322, 5], [-463, -17]], "#080e19");
  journeyArtPolygon(ctx, [[-571, -11], [-437, 9], [-291, 10], [-149, 33], [85, 34], [126, 50], [312, 41],
    [457, 17], [605, 1], [615, 22], [510, 50], [437, 74], [250, 91], [87, 73], [-45, 65],
    [-158, 70], [-260, 44], [-374, 37], [-435, 16]], "#30445389");
  ctx.save();
  journeyArtPolygon(ctx, journeyCitadelHull, "#00000000");
  ctx.clip();
  for (let i = 0; i < 25; i++) {
    const x = -570 + i * 48, y = -88 + sceneryHash(i * 1.9 + 44) * 103;
    ctx.strokeStyle = i % 3 ? "#91abb72c" : "#060c17be";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 33, y + 4);
    ctx.lineTo(x + 49, y + 23);
    ctx.stroke();
    ctx.fillStyle = i % 5 ? "#9ebbc06b" : "#dec49d8c";
    ctx.fillRect(x + 4, y + 7, 3, 1.5);
    if (i % 2) ctx.fillRect(x + 11, y + 7, 3, 1.5);
  }
  ctx.restore();
}
function drawJourneyCitadelHangar(ctx, opening) {
  journeyArtPolygon(ctx, [[-98, 2], [-75, -37], [70, -41], [100, -9], [79, 39], [-73, 42]], "#303e4a");
  journeyArtPolygon(ctx, [[-90, 3], [-69, -30], [66, -34], [91, -8], [73, 33], [-69, 35]], "#060c14");
  ctx.save();
  ctx.clip();
  if (opening > 0) {
    const height = 58 * opening;
    const beam = ctx.createLinearGradient(0, -height / 2, 0, height / 2);
    beam.addColorStop(0, "#22465a");
    beam.addColorStop(.44, "#58808e");
    beam.addColorStop(1, "#0e1f2a");
    ctx.fillStyle = beam;
    ctx.fillRect(-90, -height / 2, 180, height);
    ctx.fillStyle = "#bbdbd7a9";
    ctx.fillRect(-61, -height / 2 + 3, 120, 1.1);
    for (let i = -2; i <= 2; i++) {
      ctx.strokeStyle = "#2c48589b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(i * 20, -height / 2);
      ctx.lineTo(i * 28, height / 2);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.strokeStyle = "#789ea99c";
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-88, 3); ctx.lineTo(-68, -32); ctx.lineTo(69, -35); ctx.lineTo(93, -8); ctx.stroke();
}
function drawJourneyCitadelDockLights(ctx, opening) {
  if (opening <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-200, -18);
  ctx.lineTo(-171, -35);
  ctx.lineTo(173, -27);
  ctx.lineTo(195, -11);
  ctx.lineTo(194, 25);
  ctx.lineTo(176, 33);
  ctx.lineTo(-181, 28);
  ctx.lineTo(-200, 19);
  ctx.closePath();
  ctx.clip();
  const ceiling = -29 * opening, floor = 27 * opening;
  const haze = ctx.createLinearGradient(0, ceiling, 0, floor);
  haze.addColorStop(0, "#07141900");
  haze.addColorStop(.30, "#44899968");
  haze.addColorStop(.75, "#174b5d66");
  haze.addColorStop(1, "#1026322c");
  ctx.fillStyle = haze;
  ctx.fillRect(-200, ceiling, 395, floor - ceiling);
  ctx.globalAlpha *= opening;
  ctx.strokeStyle = "#b9dee8bc";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-167, ceiling + 4); ctx.lineTo(175, ceiling + 9); ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const x = -152 + i * 49;
    ctx.fillStyle = i % 3 ? "#b4d5dcbb" : "#fff1d4bb";
    ctx.fillRect(x, ceiling + 7 + i * .78, 5, 1.65);
    ctx.strokeStyle = "#6bb4c567";
    ctx.beginPath(); ctx.moveTo(x + (i - 3) * 6, floor - 3); ctx.lineTo(x * .79, 4); ctx.stroke();
  }
  ctx.restore();
}
function drawJourneyCitadel(ctx, scene) {
  const w = viewport.width, h = viewport.height, t = scene.elapsed;
  const bay = journeyCitadelBay(t), close = journeyArtEase(2, 12, t);
  const opening = journeyArtEase(7.7, 11.7, t) * (1 - journeyArtEase(16.8, 20, t));
  const art = loadJourneyCitadelImage();
  const scale = Math.min(w / 1060, h / 570) * (.55 + .50 * close);
  // The real light point disappears behind the hull, then reappears at its trailing edge.
  const starX = w * (.86 - .010 * t), starY = h * .361;
  journeyArtGlow(ctx, starX, starY, Math.max(5, Math.min(w, h) * .20), "#e5f5ffb3", "#7ab2dc45");
  ctx.fillStyle = "#e9f7e4";
  ctx.beginPath(); ctx.arc(starX, starY, Math.max(2, h * .006), 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(bay.x, bay.y);
  ctx.scale(scale, scale);
  if (art?.ready) {
    const imageWidth = 1440, imageHeight = imageWidth * art.image.naturalHeight / art.image.naturalWidth;
    ctx.save();
    ctx.filter = "brightness(" + (.73 + close * .28) + ") saturate(.78)";
    ctx.drawImage(art.image, -imageWidth * .57, -imageHeight * .70, imageWidth, imageHeight);
    ctx.restore();
    drawJourneyCitadelDockLights(ctx, opening);
  } else {
    drawJourneyCitadelVector(ctx);
    drawJourneyCitadelHangar(ctx, opening);
  }
  if (opening > 0) {
    ctx.save();
    ctx.globalAlpha *= opening * .32;
    ctx.scale(1, .48);
    journeyArtGlow(ctx, -37, 23, 136, "#a2d8e061", "#5c9aaf21");
    ctx.restore();
  }
  ctx.restore();
}

function drawJourneyRift(ctx, scene) {
  const w = viewport.width, h = viewport.height, t = scene.elapsed;
  const span = flightBounds.bottom - flightBounds.top;
  const busy = gravityTideBusy();
  const force = busy ? Math.max(.6, gravityTide.strength) : .43;
  const ramp = journeyArtEase(4, 11.4, t) * (1 - journeyArtEase(19, 24, t));
  if (ramp <= 0) return;
  const x = busy ? gravityTide.centerX : w * .60;
  const y = busy ? gravityTide.centerY : flightBounds.top + span * (gravityTide.sequence % 2 ? .36 : .64);
  const radius = Math.min(w, h) * .32;
  journeyArtGlow(ctx, x, y, Math.max(4, radius * 1.23), "#31254e35", "#69578721");
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-.24);
  ctx.scale(1, .57);
  const quiet = reducedMotion.matches;
  const spin = quiet ? 0 : t * .032;
  const alpha = ctx.globalAlpha;
  for (let i = 0; i < 32; i++) {
    const seed = sceneryHash(i * 17.1 + 8), angle = seed * Math.PI * 2 + spin;
    const distance = radius * (.34 + sceneryHash(i * 27.8 + 3) * 1.28);
    const arc = (.026 + (.15 / (1 + distance / radius))) * ramp * force;
    ctx.globalAlpha = alpha * ramp * (.21 + seed * .34);
    ctx.strokeStyle = i % 5 === 0 ? "#e4bba4" : i % 3 ? "#afaedf" : "#8ba7c4";
    ctx.lineWidth = i % 7 === 0 ? 1.7 : .9;
    ctx.beginPath();
    ctx.arc(0, 0, distance, angle - arc, angle + arc);
    ctx.stroke();
  }
  ctx.restore();
}
function drawJourneyScene(scene, layer) {
  if (!scene || !(viewport.width > 0 && viewport.height > 0)) return;
  const foreground = layer === "front";
  if (foreground && scene.id !== "belt" && scene.id !== "wreck") return;
  const envelope = journeyArtEnvelope(scene);
  if (envelope <= 0) return;
  const ctx = context;
  ctx.save();
  ctx.globalAlpha *= envelope;
  // The near layer runs behind every combat actor and its meshes pass beyond the frame edges.
  if (scene.id === "belt") drawJourneyBelt(ctx, scene, foreground);
  else if (scene.id === "wreck") drawJourneyWreck(ctx, scene, foreground);
  else if (scene.id === "orbit") drawJourneyOrbit(ctx, scene);
  else if (scene.id === "citadel") drawJourneyCitadel(ctx, scene);
  else if (scene.id === "rift") drawJourneyRift(ctx, scene);
  ctx.restore();
}

