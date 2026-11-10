"use strict";

// These dimensions describe the solid, visible head. Bloom is decoration.
function hostileShotShape(shot) {
  const r = shot.radius;
  if (shot.glyph === "thread") return { kind: "capsule", spine: r * 1.25, radius: r * .65 };
  if (shot.glyph === "prism" || shot.glyph === "shard")
    return { kind: "diamond", width: r * 1.33, height: r * .82 };
  return { kind: "circle", radius: r };
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
  const shape = hostileShotShape(shot);
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

function drawHostileProjectile(ctx, shot, color, quiet) {
  const shape = hostileShotShape(shot);
  ctx.save();
  ctx.translate(shot.x, shot.y);
  if (shape.kind !== "circle") ctx.rotate(Math.atan2(shot.vy ?? 0, shot.vx ?? 0));
  ctx.fillStyle = ctx.shadowColor = color;
  ctx.shadowBlur = quiet ? 0 : shot.burstAt ? 15 : 8;
  ctx.beginPath();
  if (shape.kind === "capsule") {
    const length = shape.spine + shape.radius;
    ctx.roundRect(-length, -shape.radius, length * 2, shape.radius * 2, shape.radius);
  } else if (shape.kind === "diamond") {
    ctx.moveTo(shape.width, 0); ctx.lineTo(0, shape.height);
    ctx.lineTo(-shape.width, 0); ctx.lineTo(0, -shape.height); ctx.closePath();
  } else ctx.arc(0, 0, shape.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
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
  ctx.restore();
}
