const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "guide.js"), "utf8");
const seenKey = "star-breaker-guide-seen";

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

function loadGuide(window, startDisabled = false) {
  const document = new EventTarget();
  const start = new EventTarget();
  const guide = new EventTarget();
  const dialog = new EventTarget();
  const page = { document, start, guide, dialog, opens: 0, focus: null };
  start.disabled = startDisabled;
  start.focus = () => { page.focus = start; };
  guide.focus = () => { page.focus = guide; };
  dialog.showModal = () => {
    assert.equal(Boolean(dialog.open), false, "a dialog can open only once at a time");
    dialog.open = true;
    page.opens++;
  };
  dialog.dismiss = () => {
    dialog.open = false;
    dialog.dispatchEvent(new Event("close"));
  };
  document.querySelector = selector => ({ "#flight-guide": dialog, "#guide-button": guide, "#start-button": start })[selector];
  vm.runInNewContext(script, { document, window });
  document.dispatchEvent(new Event("DOMContentLoaded"));
  return page;
}

const window = { localStorage: memoryStorage(), sessionStorage: memoryStorage() };
const first = loadGuide(window);
assert.equal(first.opens, 1, "first load opens the guide automatically");
assert.equal(window.localStorage.getItem(seenKey), "1", "record as soon as the guide is shown");
first.dialog.dismiss();
assert.equal(first.focus, first.start, "first dismissal returns focus to Start");
first.document.dispatchEvent(new Event("DOMContentLoaded"));
assert.equal(first.opens, 1, "initialization is one-shot within a page");

const reload = loadGuide(window);
assert.equal(reload.opens, 0, "a later visit uses the stored flag");
reload.guide.dispatchEvent(new Event("click"));
reload.guide.dispatchEvent(new Event("click"));
assert.equal(reload.opens, 1, "the menu button reopens the same guide without double-opening");
reload.dialog.dismiss();
assert.equal(reload.focus, reload.guide, "manual dismissal returns focus to the guide button");

const blocked = { get localStorage() { throw new Error("storage blocked"); }, sessionStorage: memoryStorage() };
const fallback = loadGuide(blocked, true);
assert.equal(fallback.opens, 1, "storage failure still allows opening the guide");
assert.equal(blocked.sessionStorage.getItem(seenKey), "1", "session fallback records the visit");
fallback.dialog.dismiss();
assert.equal(fallback.focus, fallback.guide, "focus falls back to the guide button while Start is disabled");
assert.equal(loadGuide(blocked).opens, 0, "session fallback suppresses a reload prompt");

assert.equal(loadGuide({}).opens, 1, "an environment without storage still opens without an exception");
console.log("PASS guide first visit, reload, manual reopen, focus restoration, and storage fallback");
