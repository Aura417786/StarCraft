"use strict";

const defaultFlightBindings = Object.freeze({
  up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
  attack: "KeyJ", special: "Space", shield: "KeyV", charge: "KeyC",
  focus: "KeyF", stance: "ShiftLeft", pause: "Escape",
});
const flightAliases = Object.freeze({ up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD", stance: "ShiftRight" });
const flightActionNames = Object.freeze({
  up: ["向上", "Move up"], down: ["向下", "Move down"], left: ["向左", "Move left"], right: ["向右", "Move right"],
  attack: ["主武器", "Main weapon"], special: ["大招", "Special"], shield: ["护盾", "Shield"],
  charge: ["赤焰蓄力", "Crimson charge"], focus: ["进化技能", "Evolution skill"],
  stance: ["切换射击姿态", "Switch fire mode"], pause: ["暂停 / 继续", "Pause / Resume"],
});
const flightSettingsKey = "star-breaker-flight-controls";
const flightBindingActions = Object.keys(defaultFlightBindings);
const flightBindingCodes = new Map();
const flightControls = loadFlightControls();
const flightPad = { index: null, previous: [], actions: new Set(), x: 0, y: 0, navigation: "", repeatAt: 0 };
let flightControlsDialog = null;
let flightControlsContent = null;
let flightControlsReturnFocus = null;
let flightBindingCapture = "";
let flightBindingNotice = "";

function flightKeyAvailable(code, action) {
  if (code === "Escape") return action === "pause";
  return /^(?:Key[A-Z]|Digit[0-9]|Arrow(?:Up|Down|Left|Right)|Space|Shift(?:Left|Right)|Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal)|Backquote|Minus|Equal|Bracket(?:Left|Right)|Backslash|Semicolon|Quote|Comma|Period|Slash)$/.test(code);
}
function flightBindingList(bindings, action) {
  const primary = bindings[action];
  const alias = primary === defaultFlightBindings[action] ? flightAliases[action] : "";
  return alias ? [primary, alias] : [primary];
}
function flightBindingConflict(bindings, action, code) {
  return flightBindingActions.find(other => other !== action && flightBindingList(bindings, other).includes(code));
}
function loadFlightControls() {
  const defaults = { bindings: { ...defaultFlightBindings }, autofire: true, ui: "100", subtitle: "100", colorAssist: false };
  try {
    const saved = JSON.parse(window.localStorage?.getItem(flightSettingsKey) || "null");
    if (!saved || typeof saved !== "object") return defaults;
    const bindings = { ...defaultFlightBindings };
    for (const action of flightBindingActions) {
      if (flightKeyAvailable(saved.bindings?.[action], action)) bindings[action] = saved.bindings[action];
    }
    const conflict = flightBindingActions.some(action => flightBindingList(bindings, action)
      .some(code => flightBindingConflict(bindings, action, code)));
    return { bindings: conflict ? defaults.bindings : bindings, autofire: saved.autofire !== false,
      ui: ["90", "100", "115"].includes(saved.ui) ? saved.ui : "100",
      subtitle: ["85", "100", "130"].includes(saved.subtitle) ? saved.subtitle : "100",
      colorAssist: saved.colorAssist === true };
  } catch { return defaults; }
}
function indexFlightBindings() {
  flightBindingCodes.clear();
  for (const action of flightBindingActions) for (const code of flightBindingList(flightControls.bindings, action))
    flightBindingCodes.set(code, action);
}
indexFlightBindings();

function flightActionForKey(code) { return flightBindingCodes.get(code); }
const flightKeyLabels = Object.freeze({
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  Escape: "Esc", ShiftLeft: "Shift", ShiftRight: "R Shift",
  Minus: "−", Equal: "=", BracketLeft: "[", BracketRight: "]", Semicolon: ";",
  Backquote: "`", Quote: "'", Backslash: "\\", Comma: ",", Period: ".", Slash: "/",
});
function flightKeyLabel(code) {
  if (code === "Space") return tr("空格", "Space");
  return flightKeyLabels[code] ?? code?.replace(/^(?:Key|Digit)/, "").replace(/^Numpad/, "Num ") ?? "";
}
function controlBindingLabel(action, aliases = false) {
  if (!aliases) return flightKeyLabel(flightControls.bindings[action]);
  return flightBindingList(flightControls.bindings, action).map(flightKeyLabel).join(" / ");
}
function flightKeyHeld(action) {
  const code = flightControls.bindings[action];
  return pressedKeys.has(code) || (code === defaultFlightBindings[action] && pressedKeys.has(flightAliases[action]));
}
function flightWantsFire() {
  return flightControls.autofire || flightKeyHeld("attack") || flightPad.actions.has("attack");
}
function flightMovementVector() {
  const x = Number(flightKeyHeld("right")) - Number(flightKeyHeld("left"));
  const y = Number(flightKeyHeld("down")) - Number(flightKeyHeld("up"));
  return { x: x || flightPad.x, y: y || flightPad.y };
}
function applyFlightDisplaySettings() {
  const body = document.body;
  if (!body) return;
  body.dataset.uiScale = flightControls.ui;
  body.dataset.subtitleScale = flightControls.subtitle;
  body.dataset.colorAssist = String(flightControls.colorAssist);
}
function saveFlightControls() {
  try { window.localStorage?.setItem(flightSettingsKey, JSON.stringify(flightControls)); }
  catch { /* Retain settings for this visit. */ }
  indexFlightBindings();
  applyFlightDisplaySettings();
  refreshFlightControlHints();
}
function resetFlightGamepad() {
  flightPad.x = flightPad.y = 0;
  flightPad.actions.clear();
}
function refreshFlightControlHints() {
  const text = document.querySelector("#control-instructions");
  if (text?.firstChild && text.firstChild.nodeType === 3) {
    const movement = ["left", "up", "down", "right"].map(action => controlBindingLabel(action, true)).join(" · ");
    text.firstChild.nodeValue = tr("移动 ", "Move ") + movement;
    const note = text.querySelector(".training-note");
    if (note) note.textContent = tr(" · ", " · ") + (flightControls.autofire ? tr("自动射击", "Autofire") : tr("开火 ", "Fire ") + controlBindingLabel("attack"))
      + tr(" · 大招 ", " · Special ") + controlBindingLabel("special")
      + tr(" · 护盾 ", " · Shield ") + controlBindingLabel("shield");
  }
  for (const [selector, action] of [["#ultimate-hud kbd", "special"], ["#shield-hud kbd", "shield"], ["#pause-button kbd", "pause"]]) {
    const key = document.querySelector(selector);
    if (key) key.textContent = controlBindingLabel(action);
  }
  const guide = document.querySelector(".flight-guide-keys");
  if (guide?.children?.length >= 5) {
    const defaults = ["left", "up", "down", "right"].every(action => flightControls.bindings[action] === defaultFlightBindings[action]);
    const movement = guide.children[0].querySelectorAll("kbd");
    movement[0].textContent = defaults ? tr("方向键", "Arrow keys")
      : ["left", "up", "down", "right"].map(action => controlBindingLabel(action)).join(" / ");
    movement[1].hidden = !defaults;
    for (const [index, action] of [[1, "stance"], [2, "pause"], [3, "shield"], [4, "special"]]) {
      guide.children[index].querySelector("kbd").textContent = controlBindingLabel(action);
    }
  }
  if (typeof updateFiringStyleDisplay === "function") updateFiringStyleDisplay();
  if (typeof updateShieldDisplay === "function") updateShieldDisplay();
  if (typeof updateUltimateDisplay === "function") updateUltimateDisplay();
  if (typeof updateGameCanvasLabel === "function") updateGameCanvasLabel();
  if (typeof updateFighterSystemsHud === "function") updateFighterSystemsHud();
  if (typeof refreshFlightTutorial === "function") refreshFlightTutorial();
  if (flightControlsDialog?.open) renderFlightControlsDialog();
}
function flightControlNode(tag, text, className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function makeFlightControlButton(label, action) {
  const button = flightControlNode("button", label, "secondary-button");
  button.type = "button";
  button.addEventListener("click", action);
  return button;
}
function openFlightControls() {
  if (!flightControlsDialog || flightControlsDialog.open) return;
  flightControlsReturnFocus = document.activeElement;
  flightBindingCapture = "";
  flightBindingNotice = "";
  renderFlightControlsDialog();
  flightControlsDialog.showModal();
  flightControlsDialog.querySelector("#flight-controls-close")?.focus({ preventScroll: true });
}
function appendFlightControlsSettings(host) {
  if (!flightControlsDialog) return;
  const button = makeFlightControlButton(tr("键位、手柄与显示辅助", "Controls, gamepad and display assists"), openFlightControls);
  button.id = "sortie-control-settings";
  host.append(button);
}
function renderFlightControlsDialog() {
  if (!flightControlsContent) return;
  const scroll = flightControlsContent.scrollTop;
  const focusedId = document.activeElement?.id;
  const lastAction = document.activeElement?.dataset?.flightBinding ?? "";
  const heading = flightControlsDialog.querySelector("#flight-controls-title");
  heading.textContent = tr("键位、手柄与显示辅助", "Controls, gamepad and display assists");
  flightControlsDialog.querySelector("#flight-controls-close").textContent = tr("关闭", "Close");
  const note = flightControlNode("p", tr("选择一项，按下想使用的键。移动保留方向键和 WASD，直到该方向被重绑。",
    "Select an action, then press a key. Arrows and WASD stay available until that direction is rebound."), "flight-controls-note");
  const grid = flightControlNode("div", "", "flight-bindings-grid");
  for (const action of flightBindingActions) {
    const name = tr(...flightActionNames[action]);
    const row = flightControlNode("div", "", "flight-binding-row");
    const button = makeFlightControlButton(flightBindingCapture === action ? tr("等待按键…", "Press a key…") : controlBindingLabel(action, true), () => {
      flightBindingCapture = action;
      flightBindingNotice = ["等待输入 · Esc 取消（暂停键除外）", "Waiting for a key · Esc cancels except when setting Pause"];
      renderFlightControlsDialog();
    });
    button.dataset.flightBinding = action;
    button.setAttribute("aria-label", name + " · " + button.textContent);
    button.setAttribute("aria-pressed", String(flightBindingCapture === action));
    row.append(flightControlNode("span", name), button);
    grid.append(row);
  }
  const settings = flightControlNode("div", "", "flight-controls-settings");
  const checkbox = (key, text) => {
    const input = flightControlNode("input", "");
    input.type = "checkbox";
    input.id = "flight-setting-" + key;
    input.checked = flightControls[key];
    input.addEventListener("change", () => { flightControls[key] = input.checked; saveFlightControls(); });
    const label = flightControlNode("label", "");
    label.append(flightControlNode("span", text), input);
    settings.append(label);
  };
  const select = (key, text, options) => {
    const input = flightControlNode("select", "");
    input.id = "flight-setting-" + key;
    for (const value of options) {
      const option = flightControlNode("option", value + "%");
      option.value = value;
      input.append(option);
    }
    input.value = flightControls[key];
    input.addEventListener("change", () => { flightControls[key] = input.value; saveFlightControls(); });
    const label = flightControlNode("label", "");
    label.append(flightControlNode("span", text), input);
    settings.append(label);
  };
  checkbox("autofire", tr("自动开火", "Autofire"));
  checkbox("colorAssist", tr("危险区纹理与形状提示", "Hazard patterns and shapes"));
  select("ui", tr("界面大小", "UI scale"), ["90", "100", "115"]);
  select("subtitle", tr("字幕大小", "Subtitle scale"), ["85", "100", "130"]);
  const status = flightControlNode("p", Array.isArray(flightBindingNotice) ? tr(...flightBindingNotice) : "", "flight-bindings-status");
  status.id = "flight-binding-status";
  status.setAttribute("role", "status");
  const gamepad = flightControlNode("p", tr("手柄：左摇杆 / 十字键移动和选项导航；A / RT 开火，X 护盾，Y 大招，LT 蓄力，LB 姿态，RB 进化技能，Start 暂停。菜单用 A 确认、B 返回。",
    "Gamepad: Left stick / D-pad moves and navigates. A / RT fires, X shields, Y uses the special, LT charges, LB changes fire mode, RB uses the evolution skill, Start pauses. A confirms and B goes back in menus."), "flight-controls-note");
  const reset = makeFlightControlButton(tr("恢复默认键位", "Restore default keys"), () => {
    flightControls.bindings = { ...defaultFlightBindings };
    flightBindingCapture = "";
    flightBindingNotice = ["默认键位已恢复。", "Default keys restored."];
    saveFlightControls();
    flightControlsContent.querySelector("#flight-controls-reset")?.focus({ preventScroll: true });
  });
  reset.id = "flight-controls-reset";
  flightControlsContent.replaceChildren(note, grid, status, reset, settings, gamepad);
  flightControlsContent.scrollTop = scroll;
  if (lastAction || flightBindingCapture)
    flightControlsContent.querySelector(`[data-flight-binding="${flightBindingCapture || lastAction}"]`)?.focus({ preventScroll: true });
  else if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
}
function captureFlightBinding(event) {
  if (!flightControlsDialog?.open || !flightBindingCapture) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.repeat) return;
  const action = flightBindingCapture;
  if (event.code === "Escape" && action !== "pause") {
    flightBindingCapture = "";
    flightBindingNotice = ["已取消，原键位保留。", "Cancelled. Your previous key stays assigned."];
    renderFlightControlsDialog();
    return;
  }
  if (event.ctrlKey || event.altKey || event.metaKey || !flightKeyAvailable(event.code, action)) {
    flightBindingNotice = ["此键留给浏览器或菜单，请换一个键。", "That key is reserved for the browser or menus. Choose another."];
    renderFlightControlsDialog();
    return;
  }
  const nextBindings = { ...flightControls.bindings, [action]: event.code };
  const conflict = flightBindingList(nextBindings, action).map(code => flightBindingConflict(nextBindings, action, code)).find(Boolean);
  if (conflict) {
    const names = flightActionNames[conflict];
    flightBindingNotice = ["该键已用于「" + names[0] + "」。请换一个键。", "That key is already assigned to " + names[1] + ". Choose another."];
    renderFlightControlsDialog();
    return;
  }
  flightControls.bindings = nextBindings;
  flightBindingCapture = "";
  flightBindingNotice = ["键位已保存。", "Binding saved."];
  saveFlightControls();
}
document.addEventListener("keydown", captureFlightBinding, true);
document.addEventListener("DOMContentLoaded", () => {
  applyFlightDisplaySettings();
  const host = document.querySelector("#game-app");
  if (!host?.append) return;
  const dialog = flightControlNode("dialog", "", "flight-controls-dialog");
  if (typeof dialog.showModal !== "function") return;
  dialog.id = "flight-controls";
  dialog.setAttribute("aria-labelledby", "flight-controls-title");
  const header = flightControlNode("header", "", "sortie-console-heading");
  const heading = flightControlNode("h2", "");
  heading.id = "flight-controls-title";
  const close = makeFlightControlButton(tr("关闭", "Close"), () => dialog.close());
  close.id = "flight-controls-close";
  header.append(heading, close);
  flightControlsContent = flightControlNode("div", "", "flight-controls-content");
  dialog.append(header, flightControlsContent);
  dialog.addEventListener("close", () => {
    flightBindingCapture = "";
    if (flightControlsReturnFocus?.isConnected) flightControlsReturnFocus.focus({ preventScroll: true });
    flightControlsReturnFocus = null;
  });
  host.append(dialog);
  flightControlsDialog = dialog;
  const pauseBack = document.querySelector("#pause-back");
  const pauseControl = makeFlightControlButton(tr("键位与显示辅助", "Controls and display"), openFlightControls);
  pauseControl.id = "pause-controls";
  pauseBack?.before(pauseControl);
  refreshFlightControlHints();
}, { once: true });

function flightPadButton(gamepad, index) {
  const button = gamepad.buttons[index];
  return !!button && (button.pressed || button.value >= .5);
}
function flightPadVector(gamepad) {
  const rawX = gamepad.axes[0] || 0, rawY = gamepad.axes[1] || 0;
  const magnitude = Math.hypot(rawX, rawY);
  const deadZone = .20;
  const scale = magnitude > deadZone ? Math.min(1, (magnitude - deadZone) / (1 - deadZone)) / magnitude : 0;
  const x = Number(flightPadButton(gamepad, 15)) - Number(flightPadButton(gamepad, 14));
  const y = Number(flightPadButton(gamepad, 13)) - Number(flightPadButton(gamepad, 12));
  return { x: x || rawX * scale, y: y || rawY * scale };
}
function flightMenuScope() {
  if (flightControlsDialog?.open) return flightControlsDialog;
  const modal = document.querySelector("dialog[open]");
  if (modal) return modal;
  for (const selector of ["#campaign-victory-report", "#campaign-epilogue", "#evolution-screen", "#pause-screen", "#game-over-screen"]) {
    const item = document.querySelector(selector);
    if (item && !item.hidden) return item;
  }
  if (state === "menu") return document.querySelector("#start-screen");
  return null;
}
function flightMenuItems(scope) {
  return Array.from(scope.querySelectorAll("button, select, input, a[href], [tabindex='0']")).filter(item =>
    !item.disabled && !item.closest("[hidden],[inert]") && item.getClientRects().length);
}
function navigateFlightMenu(scope, direction, confirm) {
  const items = flightMenuItems(scope);
  if (!items.length) return;
  const current = document.activeElement;
  const index = items.indexOf(current);
  if (confirm) {
    if (index < 0) { items[0].focus(); return; }
    if (current.type === "radio") {
      current.click();
    } else if (current.tagName === "SELECT") {
      // Gamepad polling is not a browser gesture. D-pad left/right changes
      // these controls without trying to invoke a native keyboard picker.
      current.focus();
    } else current.click();
    return;
  }
  if (!direction) return;
  const lateral = direction === "left" || direction === "right";
  const delta = direction === "left" || direction === "up" ? -1 : 1;
  if (lateral && index >= 0 && current.tagName === "SELECT") {
    current.selectedIndex = Math.max(0, Math.min(current.options.length - 1, current.selectedIndex + delta));
    current.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (lateral && index >= 0 && current.type === "range") {
    if (delta < 0) current.stepDown(5); else current.stepUp(5);
    current.dispatchEvent(new Event("input", { bubbles: true }));
  } else items[index < 0 ? 0 : (index + delta + items.length) % items.length].focus();
}
function backFromFlightMenu(scope) {
  if (scope?.id === "evolution-screen" && typeof skipFlightTutorial === "function" && skipFlightTutorial()) return;
  if (scope?.id === "flight-controls" && flightBindingCapture) {
    flightBindingCapture = "";
    flightBindingNotice = ["已取消。", "Cancelled."];
    renderFlightControlsDialog();
  } else if (scope?.open && typeof scope.close === "function") scope.close();
  else if (scope?.id === "start-screen" && typeof backHangarPage === "function") backHangarPage();
  else if (pauseView) togglePauseFromInput();
  else if (scope?.id === "campaign-epilogue") document.querySelector("#campaign-epilogue-skip")?.click();
  else if (scope?.id === "campaign-victory-report") document.querySelector("#campaign-report-hangar")?.click();
  else if (state === "over") document.querySelector("#result-menu-button")?.click();
}
function pollFlightGamepad() {
  if (typeof navigator === "undefined" || !navigator.getGamepads || document.hidden || !windowActive
    || document.permissionsPolicy?.allowsFeature?.("gamepad") === false) return;
  let gamepad;
  try {
    for (const candidate of navigator.getGamepads()) if (candidate?.connected && candidate.mapping === "standard") {
      gamepad = candidate;
      break;
    }
  } catch { return; }
  if (!gamepad) {
    if (flightPad.index !== null) {
      clearMovement(); flightPad.previous.length = 0; flightPad.index = null;
      if (!pauseView) pauseGame("menu", "controller");
    }
    return;
  }
  if (gamepad.index !== flightPad.index) {
    flightPad.index = gamepad.index;
    flightPad.previous.length = 0;
    resetFlightGamepad();
  }
  const fresh = index => flightPadButton(gamepad, index) && !flightPad.previous[index];
  const vector = flightPadVector(gamepad);
  const menu = flightMenuScope();
  if (menu) {
    resetFlightGamepad();
    const direction = Math.abs(vector.x) > Math.abs(vector.y)
      ? vector.x > .46 ? "right" : vector.x < -.46 ? "left" : ""
      : vector.y > .46 ? "down" : vector.y < -.46 ? "up" : "";
    const now = performance.now();
    if (fresh(1) || (pauseView && fresh(9))) backFromFlightMenu(menu);
    else if (fresh(0)) navigateFlightMenu(menu, "", true);
    else if (direction && (direction !== flightPad.navigation || now >= flightPad.repeatAt)) {
      navigateFlightMenu(menu, direction, false);
      flightPad.repeatAt = now + (direction === flightPad.navigation ? 125 : 320);
    }
    flightPad.navigation = direction;
  } else if (state === "battle" && !document.hidden && windowActive) {
    flightPad.navigation = "";
    if (!battleHasFocus() && fresh(0)) {
      canvas.focus({ preventScroll: true });
      gameAudio.unlock();
    }
    if (fresh(1) && typeof skipFlightTutorial === "function") skipFlightTutorial();
    if (fresh(9)) togglePauseFromInput();
    if (isBattleActive()) {
      flightPad.x = vector.x; flightPad.y = vector.y;
      for (const [action, indices] of flightPadActions) {
        const now = indices.some(index => flightPadButton(gamepad, index));
        const was = indices.some(index => flightPad.previous[index]);
        if (now) flightPad.actions.add(action); else flightPad.actions.delete(action);
        if (now && !was && !flightKeyHeld(action)) dispatchFlightAction(action, true);
        else if (!now && was && !flightKeyHeld(action)) dispatchFlightAction(action, false);
      }
    } else resetFlightGamepad();
  } else resetFlightGamepad();
  for (let index = 0; index < gamepad.buttons.length; index++)
    flightPad.previous[index] = flightPadButton(gamepad, index);
}
const flightPadActions = [
  ["attack", [0, 7]], ["shield", [2]], ["special", [3]], ["stance", [4]], ["focus", [5]], ["charge", [6]],
];

function drawFlightDangerPattern(ctx, hazard) {
  if (!flightControls.colorAssist) return;
  const active = hazard.age >= hazard.warning;
  const phase = active ? clamp((hazard.age - hazard.warning) / hazard.duration, 0, 1) : 0;
  const kind = hazard.kind ?? hazard.type;
  const mark = (x, y, size = 5) => {
    ctx.moveTo(x - size, y - size); ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size); ctx.lineTo(x - size, y + size);
  };
  const strip = (x1, y1, x2, y2) => {
    const count = Math.max(1, Math.min(12, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 68)));
    for (let index = 0; index < count; index++) {
      const t = (index + .5) / count;
      mark(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
    }
  };
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.globalAlpha = active ? .88 : .7;
  ctx.beginPath();
  if (hazard.gap && ["tide", "vent", "pincer"].includes(kind)) {
    const opening = kind === "pincer" ? viewport.height * .43 * (1 - phase) : 0;
    const top = hazard.gap.center - hazard.gap.half - opening;
    const bottom = hazard.gap.center + hazard.gap.half + opening;
    for (const y of [top - 9, bottom + 9]) {
      if (y < 10 || y > viewport.height - 10) continue;
      if (kind === "tide" && active && typeof finaleTideX === "function") mark(finaleTideX(hazard, y, hazard.age), y, 7);
      else strip(0, y, viewport.width, y);
    }
  } else if (kind === "tide" && Number.isFinite(hazard.gapY)) {
    const y = alienTideGap(hazard, phase);
    const half = hazard.gapSize * .5;
    for (const end of [y - half - 16, y + half + 16]) {
      if (!Number.isFinite(end) || end < 10 || end > viewport.height - 10) continue;
      if (active) mark(alienTideX(hazard, end, phase), end, 7);
      else strip(0, end, viewport.width, end);
    }
  } else if (kind === "band" && Number.isFinite(hazard.right)) {
    for (const sign of [-1, 1]) strip(0, hazard.y + sign * (hazard.thickness / 2 + 9),
      hazard.right, hazard.y + sign * (hazard.thickness / 2 + 9));
  } else if (kind === "beam" && Number.isFinite(hazard.right)) {
    strip(0, hazard.y, hazard.right, hazard.y);
  } else if (kind === "seam") {
    strip(hazard.x, 0, hazard.x, viewport.height);
  } else if (Number.isFinite(hazard.ax) && Number.isFinite(hazard.bx)) {
    strip(hazard.ax, hazard.ay, hazard.bx, hazard.by);
  } else if (kind === "riftFold" && typeof riftSeams === "function") {
    for (const seam of riftSeams(hazard)) strip(...seam);
  } else if (kind === "ribCage" && typeof cageBars === "function") {
    for (const y of cageBars(hazard, active ? phase : 1)) strip(hazard.x - hazard.width / 2, y, hazard.x + hazard.width / 2, y);
  } else if (kind === "pincerLock" && typeof pincerGap === "function") {
    const gap = pincerGap(hazard);
    if (hazard.y > gap) strip(hazard.x, 0, hazard.x, hazard.y - gap);
    if (hazard.y + gap < viewport.height) strip(hazard.x, hazard.y + gap, hazard.x, viewport.height);
  } else if (kind === "mirrorDecoys" && (!active || (phase > .61 && phase < .82))) {
    for (const node of hazard.nodes) if (node.health > 0) strip(node.x, node.y, hazard.aimX, hazard.aimY);
  } else if (kind === "neuralRelay" && typeof activeRelayNode === "function") {
    const node = activeRelayNode(hazard);
    if (node) strip(node.x, node.y, hazard.x, hazard.y);
  } else if (kind === "tailConduit" && active && hazard.nodes[0]?.health > 0 && typeof tailPosition === "function") {
    const start = tailPosition(hazard, Math.max(0, phase - .18)), end = tailPosition(hazard, phase);
    strip(start.x, start.y, end.x, end.y);
  } else if (kind === "bonefall") {
    strip(hazard.x - hazard.width, hazard.y - hazard.height, hazard.x + hazard.width, hazard.y - hazard.height);
    strip(hazard.x - hazard.width, hazard.y + hazard.height, hazard.x + hazard.width, hazard.y + hazard.height);
  } else if (["sporeBlight", "blast", "well", "vortex", "bind", "zone"].includes(kind) && Number.isFinite(hazard.radius)) {
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4, radius = hazard.radius * .82;
      mark(hazard.x + radius * Math.cos(angle), hazard.y + radius * Math.sin(angle));
    }
  }
  ctx.lineWidth = 4.5; ctx.strokeStyle = "#11121c"; ctx.stroke();
  ctx.lineWidth = 1.6; ctx.strokeStyle = "#fff3ca"; ctx.stroke();
  ctx.restore();
}
