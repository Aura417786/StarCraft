"use strict";

// Keep the accepted sleek hull and its original nose. Upgrade hardware is real
// shooting geometry; none of the visual additions changes the collision box.
function drawEvolvedPlayer(ctx, ship, upgrades, quiet = false, time = 0) {
  const rank = value => Math.max(0, Math.min(3, Number(value) || 0));
  const levels = { pierce: rank(upgrades?.pierce), blast: rank(upgrades?.blast), aegis: rank(upgrades?.aegis) };
  if (!(levels.pierce || levels.blast || levels.aegis) || !(ship.width > 0 && ship.height > 0)) return false;
  if (drawShipPBR(ctx, ship, "crimson", levels, quiet, time)) return true;
  // The independently loaded UI image can provide a coherent fallback if a
  // decoded/cached hull is temporarily unavailable. Never invent a second skin.
  if (typeof fighterImage === "undefined" || !fighterImage?.complete || !fighterImage.naturalWidth) return false;
  const source = shipRenderSources.crimson, geometry = shipRenderGeometry(source, ship, true);
  ctx.save();
  ctx.drawImage(fighterImage, ...source.crop, geometry.anchorX + geometry.x, geometry.anchorY + geometry.y, geometry.width, geometry.height);
  ctx.translate(geometry.anchorX, geometry.anchorY);
  drawShipEvolutionModules(ctx, ship, levels, source, quiet, false);
  drawShipEvolutionModules(ctx, ship, levels, source, quiet, true);
  ctx.restore();
  if (levels.pierce) drawEvolutionWingCannons(ctx, ship, levels.pierce, quiet, time);
  return true;
}
