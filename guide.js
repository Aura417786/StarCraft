"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const dialog = document.querySelector("#flight-guide");
  const guideButton = document.querySelector("#guide-button");
  const startButton = document.querySelector("#start-button");
  if (!guideButton || typeof dialog?.showModal !== "function") return;

  const seenKey = "star-breaker-guide-seen";
  const storageNames = ["localStorage", "sessionStorage"];
  let returnFocus = guideButton;

  function hasSeenGuide() {
    return storageNames.some((name) => {
      try { return window[name]?.getItem(seenKey) === "1"; }
      catch { return false; }
    });
  }

  function rememberGuide() {
    for (const name of storageNames) {
      try {
        const storage = window[name];
        if (!storage) continue;
        storage.setItem(seenKey, "1");
        return;
      } catch { /* 存储受限时尝试同一标签页的会话存储。 */ }
    }
  }

  function showGuide(focusTarget) {
    if (dialog.open) return;
    returnFocus = focusTarget;
    dialog.showModal();
    rememberGuide();
  }

  guideButton.addEventListener("click", () => showGuide(guideButton));
  dialog.addEventListener("close", () => {
    const target = returnFocus && !returnFocus.disabled ? returnFocus : guideButton;
    target.focus({ preventScroll: true });
  });
  if (!hasSeenGuide()) showGuide(startButton);
}, { once: true });
