"use strict";

// Keys follow the brightest landmark in each plate; fill comes from its
// reflected sky/terrain. The two colors are also used by receiving surfaces.
const sceneLightSectors = [
  { x: .78, y: .21, key: 0xffdfae, fill: 0x65adf4, shade: 0x101827, strength: .97, bounce: .54 },
  { x: .84, y: .30, key: 0xffcc86, fill: 0x739be0, shade: 0x191823, strength: .90, bounce: .44 },
  { x: .74, y: .22, key: 0xffad78, fill: 0x8e9adf, shade: 0x191624, strength: .93, bounce: .40 },
  { x: .80, y: .27, key: 0xf4e4c2, fill: 0x5ccad9, shade: 0x0d202b, strength: .84, bounce: .63 },
  { x: .76, y: .19, key: 0xffd0ad, fill: 0x9f84e5, shade: 0x171329, strength: .82, bounce: .52 },
];

const sceneLightFrame = {
  width: 1280, height: 720, keyX: 998.4, keyY: 151.2,
  keyColor: "#ffdfae", fillColor: "#65adf4", shadeColor: "#101827",
  keyStrength: .97, fillStrength: .54,
  sector: 0, next: 0, blend: 0, detail: 0, quiet: false, count: 0, secondaryHulls: 0,
};
const sceneLightSources = Array.from({ length: 4 }, () => ({ x: 0, y: 0, radius: 0, strength: 0, color: "#ffffff" }));
const sceneLightFields = new Map();
const sceneLightHalos = new Map();
const sceneLightReceiver = {};
let sceneLightHullTile;

function sceneLightColor(color) { return "#" + color.toString(16).padStart(6, "0"); }
function sceneLightMixColor(a, b, weight) {
  if (!weight || a === b) return sceneLightColor(a);
  const r = Math.round((a >> 16) * (1 - weight) + (b >> 16) * weight);
  const g = Math.round((a >> 8 & 255) * (1 - weight) + (b >> 8 & 255) * weight);
  const blue = Math.round((a & 255) * (1 - weight) + (b & 255) * weight);
  return sceneLightColor((r << 16) | (g << 8) | blue);
}

function addSceneLightSource(x, y, radius, color, strength) {
  const frame = sceneLightFrame;
  if (frame.count >= sceneLightSources.length || !(strength > 0) || !(radius > 0)
    || !Number.isFinite(x + y + radius + strength) || !/^#[0-9a-f]{6}$/i.test(color)) return;
  const source = sceneLightSources[frame.count++];
  source.x = x; source.y = y; source.radius = radius;
  source.color = color; source.strength = strength;
}

function prepareSceneLighting(world) {
  const { current, next, blend } = sceneryJourney();
  const from = sceneLightSectors[current] ?? sceneLightSectors[0], to = sceneLightSectors[next] ?? from;
  const frame = sceneLightFrame;
  frame.width = world.width; frame.height = world.height;
  frame.sector = current; frame.next = next; frame.blend = blend;
  frame.detail = visualQuality.meshDetail;
  frame.quiet = quietCombatMotion();
  frame.keyX = world.width * (from.x + (to.x - from.x) * blend);
  frame.keyY = world.height * (from.y + (to.y - from.y) * blend);
  frame.keyColor = sceneLightMixColor(from.key, to.key, blend);
  frame.fillColor = sceneLightMixColor(from.fill, to.fill, blend);
  frame.shadeColor = sceneLightMixColor(from.shade, to.shade, blend);
  frame.keyStrength = from.strength + (to.strength - from.strength) * blend;
  frame.fillStrength = from.bounce + (to.bounce - from.bounce) * blend;
  frame.count = 0; frame.secondaryHulls = 0;
  if (state !== "battle" || evolution.pending) return;

  const calm = frame.quiet ? .48 : 1;
  const impact = activeCombatLight();
  if (impact) addSceneLightSource(impact.x, impact.y, Math.min(impact.radius * 1.20, world.height * .6),
    impact.color, Math.min(1.18, impact.strength * 1.52));

  // Existing attack clocks drive every light. No new gameplay timers or
  // particle ownership changes are needed when pausing or rewinding.
  if (ultimate.phase === "charging" || ultimate.phase === "firing") {
    const origin = muzzlePosition();
    const tint = ultimate.kind === "blue" ? "#71d8ff" : ultimate.kind === "yellow" ? "#ffcf71" : "#ff8a57";
    if (ultimate.phase === "charging") {
      const progress = Math.min(1, ultimate.elapsed / Math.max(.01, cannonLink.chargeDuration));
      addSceneLightSource(origin.x, origin.y, 97 + progress * 190, tint, (.13 + progress * .72) * calm);
    } else {
      const shot = ultimate.shot;
      const start = shot?.startX ?? origin.x;
      const x = ultimate.kind === "red" ? Math.min(world.width, start + Math.max(0, (shot?.x ?? start) - start) * .24) : origin.x + 74;
      addSceneLightSource(x, shot?.y ?? origin.y, 264, tint, .72 * calm);
    }
  } else if (muzzleFlash > 0) {
    const origin = muzzlePosition();
    addSceneLightSource(origin.x, origin.y, 113, weaponPalette().color, muzzleFlash / .055 * .32 * calm);
  }
  if (shield.remaining > 0)
    addSceneLightSource(player.x + player.width * .12, player.y, shield.flash > 0 ? 190 : 115,
      "#ff9a80", (shield.flash > 0 ? .58 : .21) * calm);
}

function sampleSceneLight(x, y, out = {}) {
  const frame = sceneLightFrame;
  const keyX = frame.keyX - x, keyY = frame.keyY - y;
  const span = Math.hypot(keyX, keyY) || 1;
  out.keyColor = frame.keyColor; out.fillColor = frame.fillColor; out.shadeColor = frame.shadeColor;
  out.keyDx = keyX / span; out.keyDy = keyY / span;
  out.keyStrength = frame.keyStrength; out.fillStrength = frame.fillStrength;
  out.color = frame.keyColor; out.strength = 0; out.dx = out.keyDx; out.dy = out.keyDy;
  for (let i = 0; i < frame.count; i++) {
    const source = sceneLightSources[i];
    const dx = source.x - x, dy = source.y - y;
    const distanceSquared = dx * dx + dy * dy;
    const reach = distanceSquared / (source.radius * source.radius);
    if (reach >= 1) continue;
    const strength = source.strength * (1 - reach) ** 2;
    if (strength <= out.strength) continue;
    const distance = Math.sqrt(distanceSquared);
    out.color = source.color; out.strength = strength;
    if (distance > .01) { out.dx = dx / distance; out.dy = dy / distance; }
  }
  return out;
}

function sceneLightTile(width, height) {
  const canvas = shipRenderCanvas(width, height);
  const ctx = canvas?.getContext?.("2d");
  return ctx ? { canvas, ctx } : null;
}

function sceneLightField(index) {
  if (sceneLightFields.has(index)) return sceneLightFields.get(index);
  const tile = sceneLightTile(288, 162);
  if (!tile) return null;
  const { canvas, ctx } = tile;
  const w = canvas.width, h = canvas.height, profile = sceneLightSectors[index];
  const x = profile.x * w, y = profile.y * h;
  const key = sceneLightColor(profile.key), fill = sceneLightColor(profile.fill);
  const shadow = ctx.createLinearGradient(x, y, w * .08, h * .79);
  shadow.addColorStop(0, "#06091200");
  shadow.addColorStop(.49, "#070c1605");
  shadow.addColorStop(1, sceneLightColor(profile.shade) + "49");
  ctx.fillStyle = shadow; ctx.fillRect(0, 0, w, h);
  const sky = ctx.createRadialGradient(x, y, 2, x, y, w * .56);
  sky.addColorStop(0, key + "48");
  sky.addColorStop(.18, key + "20");
  sky.addColorStop(.63, key + "08");
  sky.addColorStop(1, key + "00");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  const bounce = ctx.createRadialGradient(w * .68, h * 1.11, 0, w * .68, h * 1.11, w * .54);
  bounce.addColorStop(0, fill + "38");
  bounce.addColorStop(.43, fill + "14");
  bounce.addColorStop(1, fill + "00");
  ctx.fillStyle = bounce; ctx.fillRect(0, 0, w, h);
  // Feathered light shafts align with the sector source, beneath foreground
  // dust, ships and warning lines. The small field is reused on every frame.
  const shaft = ctx.createLinearGradient(x, y, x - w * .60, y + h * .64);
  shaft.addColorStop(0, key + "25");
  shaft.addColorStop(.42, key + "0c");
  shaft.addColorStop(1, key + "00");
  ctx.fillStyle = shaft;
  ctx.beginPath(); ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - 18, y + 24, x - 53, y + 43, x - w * .60, y + h * .67);
  ctx.bezierCurveTo(x - 55, y + 55, x - 9, y + 24, x, y);
  ctx.fill();
  sceneLightFields.set(index, canvas);
  return canvas;
}

function drawSceneLightingBackdrop(ctx) {
  const frame = sceneLightFrame;
  const field = sceneLightField(frame.sector);
  if (!field) return;
  ctx.save();
  const opacity = ctx.globalAlpha * (frame.detail ? .84 : .56);
  ctx.globalAlpha = opacity * (1 - frame.blend);
  ctx.drawImage(field, 0, 0, frame.width, frame.height);
  if (frame.blend > .001 && frame.next !== frame.sector) {
    const next = sceneLightField(frame.next);
    if (next) { ctx.globalAlpha = opacity * frame.blend; ctx.drawImage(next, 0, 0, frame.width, frame.height); }
  }
  ctx.restore();
}

function sceneLightHalo(color) {
  if (sceneLightHalos.has(color)) return sceneLightHalos.get(color);
  const tile = sceneLightTile(80, 80);
  if (!tile) return null;
  const { canvas, ctx } = tile;
  const glow = ctx.createRadialGradient(40, 40, 1, 40, 40, 40);
  glow.addColorStop(0, "#fff3da98");
  glow.addColorStop(.12, color + "7c");
  glow.addColorStop(.48, color + "30");
  glow.addColorStop(1, color + "00");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 80, 80);
  if (sceneLightHalos.size >= 14) sceneLightHalos.delete(sceneLightHalos.keys().next().value);
  sceneLightHalos.set(color, canvas);
  return canvas;
}

function drawSceneLightScatter(ctx) {
  const frame = sceneLightFrame;
  if (!frame.detail || frame.quiet || !frame.count) return;
  ctx.save(); ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < frame.count; i++) {
    const source = sceneLightSources[i];
    if (source.strength < .20) continue;
    const halo = sceneLightHalo(source.color);
    if (!halo) continue;
    const span = Math.min(frame.height * .35, source.radius * .64);
    ctx.globalAlpha = Math.min(.26, source.strength * .24);
    ctx.drawImage(halo, source.x - span, source.y - span * .58, span * 2, span * 1.16);
    if (frame.detail === 2 && source.strength > .52) {
      ctx.globalAlpha *= .47;
      ctx.drawImage(halo, source.x - span * 1.9, source.y - span * .035, span * 3.8, span * .07);
    }
  }
  ctx.restore();
}

function shadeSceneShip(ctx, ship, source, crop, geometry, hero) {
  const frame = sceneLightFrame;
  if (!frame.detail || ship.disabled || ship.hitFlash > 0) return false;
  const light = sampleSceneLight(ship.x, ship.y, sceneLightReceiver);
  if (!hero && (frame.secondaryHulls >= (frame.detail === 2 ? 5 : 2) || light.strength < .10)) return false;
  sceneLightHullTile ??= sceneLightTile(256, 184);
  if (!sceneLightHullTile) return false;
  if (!hero) frame.secondaryHulls++;
  const { canvas, ctx: paint } = sceneLightHullTile;
  const scale = Math.min(1.30, canvas.width / geometry.width, canvas.height / geometry.height);
  const w = Math.max(1, Math.round(geometry.width * scale)), h = Math.max(1, Math.round(geometry.height * scale));
  paint.clearRect(0, 0, w, h);
  if (crop) paint.drawImage(source, ...crop, 0, 0, w, h);
  else paint.drawImage(source, 0, 0, w, h);
  paint.globalCompositeOperation = "source-atop";
  const dx = light.keyDx * w * .48, dy = light.keyDy * h * .54;
  const grade = paint.createLinearGradient(w * .5 - dx, h * .5 - dy, w * .5 + dx, h * .5 + dy);
  grade.addColorStop(0, light.shadeColor + "64");
  grade.addColorStop(.31, light.fillColor + "23");
  grade.addColorStop(.54, light.keyColor + "06");
  grade.addColorStop(.81, light.keyColor + "26");
  grade.addColorStop(1, light.keyColor + "50");
  paint.fillStyle = grade; paint.fillRect(0, 0, w, h);
  if (light.strength > .03) {
    const x = w * (.5 + light.dx * .44), y = h * (.5 + light.dy * .45);
    const shine = paint.createRadialGradient(x, y, 0, x, y, Math.hypot(w, h) * .71);
    const alpha = Math.round(Math.min(.58, light.strength * .60) * 255).toString(16).padStart(2, "0");
    shine.addColorStop(0, light.color + alpha);
    shine.addColorStop(.54, light.color + "0e");
    shine.addColorStop(1, light.color + "00");
    paint.fillStyle = shine; paint.fillRect(0, 0, w, h);
  }
  paint.globalCompositeOperation = "source-over";
  ctx.drawImage(canvas, 0, 0, w, h, geometry.x, geometry.y, geometry.width, geometry.height);
  return true;
}
