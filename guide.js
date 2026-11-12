"use strict";

let refreshFlightGuideNavigation = () => {};

document.addEventListener("DOMContentLoaded", () => {
  const dialog = document.querySelector("#flight-guide");
  const guideButton = document.querySelector("#guide-button");
  const startButton = document.querySelector("#start-button");
  if (!guideButton || typeof dialog?.showModal !== "function") return;
  const pages = Array.from(dialog.querySelectorAll?.("[data-guide-page]") ?? []);
  const scroller = dialog.querySelector?.("#flight-guide-pages");
  const prev = dialog.querySelector?.("#guide-previous");
  const next = dialog.querySelector?.("#guide-next");
  const pageCount = dialog.querySelector?.("#guide-page-count");
  const scrollHint = dialog.querySelector?.("#guide-scroll-hint");
  let page = 0;
  let needsScrollHint = false;

  function updateScrollHint() {
    if (!scroller || !scrollHint) return;
    const overflow = scroller.scrollHeight - scroller.clientHeight;
    const atEnd = scroller.scrollTop >= overflow - 2;
    const show = dialog.open && overflow > 2 && !atEnd;
    if (show !== needsScrollHint) {
      needsScrollHint = show;
      scrollHint.dataset.active = String(show);
    }
  }

  function renderPage() {
    if (!pages.length || !prev || !next || !pageCount) return;
    pages.forEach((section, index) => { section.hidden = index !== page; });
    prev.disabled = page === 0;
    next.disabled = page >= pages.length - 1;
    prev.textContent = tr("上一页", "Previous");
    next.textContent = tr("下一页", "Next");
    pageCount.textContent = tr(`第 ${page + 1} / ${pages.length} 页`, `Page ${page + 1} of ${pages.length}`);
    dialog.querySelector(".flight-guide-navigation")?.setAttribute("aria-label", tr("飞行手册分页", "Flight manual pages"));
    scroller?.setAttribute("aria-label", tr("飞行手册内容", "Flight manual content"));
    updateScrollHint();
  }

  function turnPage(direction) {
    page = Math.max(0, Math.min(pages.length - 1, page + direction));
    if (scroller) scroller.scrollTop = 0;
    renderPage();
    if (document.activeElement?.disabled) {
      (direction > 0 ? prev : next)?.focus({ preventScroll: true });
    }
  }
  prev?.addEventListener("click", () => turnPage(-1));
  next?.addEventListener("click", () => turnPage(1));
  if (scrollHint && scroller) {
    scrollHint.hidden = false;
    scroller.addEventListener("scroll", updateScrollHint);
    if (typeof ResizeObserver === "function") new ResizeObserver(updateScrollHint).observe(scroller);
  }
  refreshFlightGuideNavigation = () => {
    if (scrollHint) scrollHint.textContent = tr("向下滚动可读完本页", "Scroll down to finish this page");
    renderPage();
  };

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
    page = 0;
    if (scroller) scroller.scrollTop = 0;
    refreshFlightGuideNavigation();
    rememberGuide();
  }

  guideButton.addEventListener("click", () =>
    showGuide(guideButton.closest?.("[hidden]") ? document.activeElement : guideButton));
  dialog.addEventListener("close", () => {
    const target = [returnFocus, startButton, guideButton, document.querySelector("#hangar-manual")].find(button =>
      button && !button.disabled && !button.closest?.("[hidden],dialog:not([open])"));
    target?.focus({ preventScroll: true });
  });
  if (!hasSeenGuide()) showGuide(startButton);
  else refreshFlightGuideNavigation();
}, { once: true });
