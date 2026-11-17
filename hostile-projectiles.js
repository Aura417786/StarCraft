"use strict";

const hostileContactShape = {};

// These dimensions describe the solid, visible head. Bloom is decoration.
function hostileShotShape(shot, shape = {}) {
  const r = shot.radius;
  if (shot.glyph === "thread") {
    shape.kind = "capsule"; shape.spine = r * 1.25; shape.radius = r * .65;
  } else if (shot.glyph === "prism" || shot.glyph === "shard") {
    shape.kind = "diamond"; shape.width = r * 1.33; shape.height = r * .82;
  } else {
    shape.kind = "circle"; shape.radius = r;
  }
  return shape;
}

function capsuleSweepEntry(x, y, dx, dy, length, radius) {
  return Math.min(projectileBoxEntry(x, y, dx, dy, 0, length, -radius, radius),
    projectileCircleEntry(x, y, dx, dy, 0, 0, radius),
    projectileCircleEntry(x, y, dx, dy, length, 0, radius));
}

function hostileShotHitsHull(shot, target) {
  // Sweep the moving hull relative to the projectile across the entire frame.
  const x0 = (target.previousX ?? target.x) - (shot.previousX ?? shot.x);
  const y0 = (target.previousY ?? target.y) - (shot.previousY ?? shot.y);
  const dx = target.x - shot.x - x0, dy = target.y - shot.y - y0;
  const hullRadius = target.height * .16;
  const shape = hostileShotShape(shot, hostileContactShape);
  if (shape.kind === "circle") {
    return Number.isFinite(projectileCircleEntry(x0, y0, dx, dy, 0, 0, hullRadius + shape.radius));
  }
  const extent = hullRadius + (shape.kind === "capsule" ? shape.spine + shape.radius : shape.width);
  if (Math.min(x0, x0 + dx) > extent || Math.max(x0, x0 + dx) < -extent
    || Math.min(y0, y0 + dy) > extent || Math.max(y0, y0 + dy) < -extent) return false;
  const angle = Math.atan2(shot.vy ?? 0, shot.vx ?? 0);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const x = x0 * cos + y0 * sin, y = y0 * cos - x0 * sin;
  const stepX = dx * cos + dy * sin, stepY = dy * cos - dx * sin;
  if (shape.kind === "capsule") {
    return Number.isFinite(capsuleSweepEntry(x + shape.spine, y, stepX, stepY,
      2 * shape.spine, hullRadius + shape.radius));
  }

  // Inflating a diamond by the hull radius gives four edge capsules and its interior.
  const { width, height } = shape;
  if (Math.abs(x) / width + Math.abs(y) / height <= 1) return true;
  const corners = [[width, 0], [0, height], [-width, 0], [0, -height]];
  const length = Math.hypot(width, height);
  for (let index = 0; index < corners.length; index++) {
    const [ax, ay] = corners[index];
    const [bx, by] = corners[(index + 1) % corners.length];
    const cos = (bx - ax) / length, sin = (by - ay) / length;
    const px = x - ax, py = y - ay;
    const time = capsuleSweepEntry(px * cos + py * sin, py * cos - px * sin,
      stepX * cos + stepY * sin, stepY * cos - stepX * sin, length, hullRadius);
    if (Number.isFinite(time)) return true;
  }
  return false;
}

function hostileShotDetailStride(count) {
  const budget = visualQuality.id === "high" ? 36 : 22;
  return Math.max(1, Math.ceil(count / budget));
}

const hostileHeadTiles = new Map();
const hostileRenderShape = {};

function traceHostileBody(ctx, shape) {
  ctx.beginPath();
  if (shape.kind === "capsule") {
    const length = shape.spine + shape.radius;
    ctx.roundRect(-length, -shape.radius, length * 2, shape.radius * 2, shape.radius);
  } else if (shape.kind === "diamond") {
    ctx.moveTo(shape.width, 0); ctx.lineTo(0, shape.height);
    ctx.lineTo(-shape.width, 0); ctx.lineTo(0, -shape.height); ctx.closePath();
  } else ctx.arc(0, 0, shape.radius, 0, Math.PI * 2);
}

function paintHostileHead(ctx, shot, shape, color, blur) {
  ctx.fillStyle = ctx.shadowColor = color;
  if (blur) ctx.shadowBlur = blur;
  traceHostileBody(ctx, shape);
  ctx.fill();
  if (blur) ctx.shadowBlur = 0;
  const r = shot.radius;
  ctx.fillStyle = "#fff7ed";
  ctx.beginPath();
  if (shape.kind === "capsule") ctx.roundRect(-shape.spine * .58, -r * .15, shape.spine * 1.16, r * .3, r * .15);
  else if (shape.kind === "diamond") {
    ctx.moveTo(shape.width * .57, 0); ctx.lineTo(0, -shape.height * .52);
    ctx.lineTo(-shape.width * .44, 0); ctx.closePath();
  } else if (shot.burstAt || shot.glyph === "spore") {
    ctx.arc(0, 0, r * .68, 0, Math.PI * 2);
    ctx.arc(0, 0, r * .43, 0, Math.PI * 2, true);
  } else ctx.arc(0, 0, r * .44, 0, Math.PI * 2);
  ctx.fill();
}

function hostileHeadTile(shot, shape, color, blur, scale) {
  const key = `${shape.kind}/${shot.radius}/${color}/${blur}/${scale}`;
  const cached = hostileHeadTiles.get(key);
  if (cached) return cached;
  const radius = shape.kind === "capsule" ? shape.spine + shape.radius : shape.kind === "diamond" ? shape.width : shape.radius;
  const center = Math.ceil(radius * scale + blur * 2 + 2);
  if (center > 140 || typeof shipRenderCanvas !== "function") return null;
  const tile = shipRenderCanvas(center * 2, center * 2);
  const paint = tile?.getContext("2d");
  if (!paint) return null;
  // Move the opaque head outside the bake tile. Its shadow alone lands inside,
  // leaving the live vector fill and its bright center exactly as authored.
  const offset = tile.width;
  paint.setTransform(scale, 0, 0, scale, center - offset, center);
  paint.fillStyle = paint.shadowColor = color;
  paint.shadowBlur = blur; paint.shadowOffsetX = offset;
  traceHostileBody(paint, shape); paint.fill();
  if (hostileHeadTiles.size >= 128) hostileHeadTiles.delete(hostileHeadTiles.keys().next().value);
  const entry = { tile, extent: center / scale };
  hostileHeadTiles.set(key, entry);
  return entry;
}

function drawHostileProjectile(ctx, shot, color, quiet, detailed = true, crowded = false, alpha = 1) {
  const shape = hostileShotShape(shot, hostileRenderShape);
  const blur = quiet || !detailed || crowded ? 0 : shot.burstAt ? 15 : 8;
  let sprite;
  // Native blur is in backing-store pixels. Bake it once at the active pixel
  // scale and hold near-identical camera zoom samples in the same cache bin.
  if (blur && ctx.getTransform && ctx.globalAlpha === 1 && ctx.globalCompositeOperation === "source-over" && ctx.filter === "none") {
    const matrix = ctx.getTransform();
    const pixelScale = Math.max(.25, Math.round(Math.hypot(matrix.a, matrix.b) * 16) / 16);
    sprite = hostileHeadTile(shot, shape, color, blur, pixelScale);
  }
  ctx.save();
  const x = typeof flightRenderX === "function" ? flightRenderX(shot, alpha) : shot.x;
  const y = typeof flightRenderY === "function" ? flightRenderY(shot, alpha) : shot.y;
  ctx.translate(x, y);
  const wake = detailed && !quiet && (shot.radius >= 6 || shot.glyph) && typeof drawFlightBoltWake === "function";
  if (shape.kind !== "circle" || wake) ctx.rotate(Math.atan2(shot.vy ?? 0, shot.vx ?? 0));
  if (wake)
    drawFlightBoltWake(ctx, shot.radius * 1.2, shot.radius * .49, color,
      (shot.vx ?? 0) * .073 + (shot.vy ?? 0) * .113, shot.age ?? 0, true);
  if (sprite) {
    const { tile, extent } = sprite;
    ctx.drawImage(tile, -extent, -extent, extent * 2, extent * 2);
  }
  paintHostileHead(ctx, shot, shape, color, sprite ? 0 : blur);
  ctx.restore();
}
