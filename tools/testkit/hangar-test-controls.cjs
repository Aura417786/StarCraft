"use strict";

async function openHangarPage(page, name) {
  const entry = page.locator(`#hangar-${name}`);
  // Some release fixtures also compare against builds from before the grouped menu.
  if (await entry.count()) await entry.click();
}

async function closeHangarPage(page, name) {
  const back = page.locator(`#hangar-back-${name}`);
  if (await back.count()) await back.click();
}

async function selectHangarFighter(page, fighter) {
  await openHangarPage(page, "loadout");
  await page.locator(`#fighter-picker label[data-fighter="${fighter}"]`).click();
  await closeHangarPage(page, "loadout");
}

module.exports = { openHangarPage, closeHangarPage, selectHangarFighter };
