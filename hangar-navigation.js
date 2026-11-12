"use strict";

const hangarMenu = document.querySelector("#start-screen[data-hangar-page]");

function setHangarPage(page, focus = true) {
  if (!hangarMenu?.dataset.hangarPage) return false;
  const panel = hangarMenu.querySelector(`[data-hangar-panel="${page}"]`);
  const previous = hangarMenu.dataset.hangarPage;
  if (!panel || page === previous) return false;
  for (const entry of hangarMenu.querySelectorAll("[data-hangar-panel]")) entry.hidden = entry !== panel;
  hangarMenu.dataset.hangarPage = page;
  hangarMenu.scrollTop = 0;
  if (focus) {
    const target = page === "home" ? hangarMenu.querySelector(`[data-hangar-open="${previous}"]`)
      : page === "loadout" ? panel.querySelector('#fighter-picker input:checked')
        : panel.querySelector(".hangar-row:not([hidden])");
    (target ?? panel.querySelector(".hangar-back"))?.focus();
  }
  return true;
}

function backHangarPage() {
  return Boolean(hangarMenu && !hangarMenu.hidden && setHangarPage("home"));
}

if (hangarMenu?.dataset.hangarPage) {
  hangarMenu.addEventListener("click", event => {
    const opener = event.target.closest("[data-hangar-open]");
    if (opener) setHangarPage(opener.dataset.hangarOpen);
  });
  hangarMenu.addEventListener("keydown", event => {
    const direction = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!direction || !event.target.matches("[data-hangar-key]") || event.altKey || event.ctrlKey || event.metaKey) return;
    const panel = event.target.closest("[data-hangar-panel]");
    const items = Array.from(panel.querySelectorAll("[data-hangar-key]:not(:disabled):not([hidden])"));
    const index = items.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    items[(index + direction + items.length) % items.length].focus();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector("dialog[open]") && backHangarPage()) {
      event.preventDefault();
    }
  });
}
