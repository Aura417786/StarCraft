"use strict";

function bossElementalVfx(type) {
  switch (type) {
    case 0: case 6: case 7:
      return typeof ElementalFluidVfx === "undefined" ? null : ElementalFluidVfx;
    case 1: case 3: case 4:
      return typeof ElementalArmoredVfx === "undefined" ? null : ElementalArmoredVfx;
    case 5: case 8: case 9:
      return typeof ElementalCosmicVfx === "undefined" ? null : ElementalCosmicVfx;
    case 10:
      return typeof ElementalConfluenceVfx === "undefined" ? null : ElementalConfluenceVfx;
    default:
      return null;
  }
}
