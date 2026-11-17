"use strict";

// Art-space anchors keep each aircraft's nose on the same gameplay muzzle.
const fighterVariantArt = {
  red: shipRenderAssets.crimson,
  blue: createShipRenderAsset({
    ...fighterNeutralSource("blue", {
      src: "assets/fighters/azure.webp",
      crop: [42, 76, 892, 496],
      tip: [929.5, 308.5],
      engines: [[60, 255], [61, 364]],
      reflections: [
        { side: -1, weight: 1, points: [[145, 91], [200, 104], [250, 124], [313, 163], [385, 205], [440, 224]] },
        { side: 1, weight: 1, points: [[116, 547], [167, 524], [225, 489], [285, 440], [345, 399], [421, 357]] },
        { side: 0, weight: 0.55, points: [[421, 245], [470, 239], [523, 239], [573, 249], [643, 268]] },
      ],
    }),
    atlas: "blue",
    direction: 1,
    color: "#86dfff",
    moduleTint: "hue-rotate(212deg) saturate(.9)",
  }),
  yellow: createShipRenderAsset({
    ...fighterNeutralSource("yellow", {
      src: "assets/fighters/auric.webp",
      crop: [37, 46, 884, 548],
      tip: [915.5, 311],
      engines: [[58, 259], [58, 374]],
      reflections: [
        { side: -1, weight: 1, points: [[106, 62], [175, 63], [246, 91], [329, 133], [418, 176], [490, 214]] },
        { side: 1, weight: 1, points: [[107, 569], [167, 568], [225, 538], [285, 501], [345, 468], [414, 422]] },
        { side: 0, weight: 0.55, points: [[459, 240], [507, 239], [560, 250], [621, 267], [682, 285]] },
      ],
    }),
    atlas: "yellow",
    direction: 1,
    color: "#ffdb83",
    moduleTint: "hue-rotate(54deg) saturate(1.08) brightness(1.15)",
  }),
};

function warmSelectedFighterAtlas() {
  if (!visualQuality.meshDetail) return;
  const id = document.querySelector("#fighter-picker input:checked")?.value;
  if (id) preloadFighterAtlas(id);
}
document.addEventListener("DOMContentLoaded", warmSelectedFighterAtlas);
document.querySelector("#fighter-picker")?.addEventListener("change", warmSelectedFighterAtlas);
document.querySelector("#render-quality")?.addEventListener("change", warmSelectedFighterAtlas);

function drawFighterVariant(ctx, ship, id, upgrades = null, quiet = false, time = 0) {
  const art = Object.hasOwn(fighterVariantArt, id) ? fighterVariantArt[id] : fighterVariantArt.red;
  if (drawShipPBR(ctx, ship, "crimson", upgrades, quiet, time, art)) return true;
  return art !== fighterVariantArt.red && drawShipPBR(ctx, ship, "crimson", upgrades, quiet, time);
}

function fighterWakeOrigin(ship, id) {
  const asset = fighterVariantArt[id];
  if (!asset?.ready || !asset.engines.length) return { x: ship.x - ship.width * .40, y: ship.y };
  const bank = reducedMotion.matches || ship.disabled ? 0 : ship.visualBank ?? shipVisuals.bank;
  const atlas = ship === player ? fighterAtlasPose(asset, ship, bank) : null;
  const geometry = atlas ?? shipRenderGeometry(asset, ship, true);
  const engines = atlas?.engines ?? asset.engines;
  const center = engines.reduce(([x, y], [engineX, engineY]) => [x + engineX, y + engineY], [0, 0])
    .map(value => value / engines.length);
  const point = geometry.point(center);
  const skew = atlas ? atlas.residual * .035 : bank * .09;
  const squash = atlas ? 1 : 1 - Math.abs(bank) * .10;
  return { x: geometry.anchorX + point.x + point.y * skew, y: geometry.anchorY + point.y * squash };
}
