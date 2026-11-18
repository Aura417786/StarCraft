"use strict";

const TacticalSystem = (() => {
  const sections = [
    ["display", "画面", "Display"],
    ["audio", "音频", "Audio"],
    ["controls", "控制 / 键位", "Controls"],
    ["assists", "辅助功能", "Accessibility"],
  ];
  let sortieTab = "display";
  let currentPauseTab;
  let pauseTabSwitch;
  let pauseLanguage;
  let pauseFullscreen;
  let pauseMapping;
  let pauseTelemetry;
  let pauseRoute;
  const pauseInputs = [];

  function settingsTabs(host, name, groups, active, onSelect = () => {}) {
    host.classList.add("tactical-settings-shell");
    const tablist = sortieElement("div", "", "tactical-tabs");
    tablist.setAttribute("role", "tablist");
    tablist.setAttribute("aria-label", tr("设置分类", "Settings categories"));
    const items = sections.map(([key, cn, en]) => {
      const tab = sortieButton(tr(cn, en), () => select(key), "tactical-tab secondary-button");
      const panel = sortieElement("div", "", "tactical-tab-panel");
      tab.id = `${name}-tab-${key}`;
      panel.id = `${name}-pane-${key}`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", panel.id);
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      panel.append(...groups[key]);
      tablist.append(tab);
      return { key, tab, panel, cn, en };
    });
    function select(key, focus = false) {
      for (const item of items) {
        const selected = item.key === key;
        item.panel.hidden = !selected;
        item.tab.setAttribute("aria-selected", String(selected));
        item.tab.tabIndex = selected ? 0 : -1;
        if (selected && focus) item.tab.focus({ preventScroll: true });
      }
      onSelect(key);
    }
    tablist.addEventListener("keydown", event => {
      const index = items.findIndex(item => item.tab === document.activeElement);
      if (index < 0) return;
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.code];
      if (step === undefined && event.code !== "Home" && event.code !== "End") return;
      event.preventDefault();
      const next = step === undefined ? (event.code === "Home" ? 0 : items.length - 1)
        : (index + step + items.length) % items.length;
      select(items[next].key, true);
    });
    const content = sortieElement("div", "", "tactical-settings-content");
    content.append(...items.map(item => item.panel));
    host.append(tablist, content);
    select(active);
    return {
      select,
      localize() {
        tablist.setAttribute("aria-label", tr("设置分类", "Settings categories"));
        for (const item of items) item.tab.textContent = tr(item.cn, item.en);
      },
    };
  }

  function settings(host, groups) {
    settingsTabs(host, "system", groups, sortieTab, key => { sortieTab = key; });
  }

  function meterRow(id, read, write, cn, en) {
    const range = sortieElement("input");
    range.id = id;
    range.type = "range";
    range.min = "0";
    range.max = "100";
    range.step = "1";
    const output = sortieElement("output");
    output.setAttribute("for", id);
    const wrap = sortieElement("span", "", "sortie-volume-group tactical-range");
    function updateMeter() {
      output.value = `${range.value}%`;
      range.style.setProperty("--tactical-level", output.value);
    }
    function sync() {
      range.value = String(Math.round(read() * 100));
      updateMeter();
    }
    range.addEventListener("input", () => { write(Number(range.value) / 100); updateMeter(); });
    sync();
    wrap.append(range, output);
    return { row: sortieSettingLine(tr(cn, en), wrap), sync };
  }

  function audioRows(prefix, syncList) {
    const rows = [
      [`${prefix}-volume`, () => gameAudio.volume, value => gameAudio.setVolume(value), "主音量", "Master volume"],
      [`${prefix}-music-volume`, () => gameAudio.musicVolume, value => gameAudio.setChannelVolume("music", value), "背景音乐", "Music volume"],
      [`${prefix}-effects-volume`, () => gameAudio.effectsVolume, value => gameAudio.setChannelVolume("effects", value), "战斗音效", "Effects volume"],
    ];
    return rows.map(values => {
      const { row, sync } = meterRow(...values);
      if (syncList) {
        syncList.push(() => { row.firstElementChild.textContent = tr(values[3], values[4]); sync(); });
      }
      return row;
    });
  }

  function renderMapping(host) {
    const keyboard = sortieElement("dl", "", "tactical-key-grid");
    for (const action of flightBindingActions) {
      const tile = sortieElement("div", "", "tactical-key-tile");
      const key = sortieElement("dd");
      key.append(sortieElement("kbd", controlBindingLabel(action, true)));
      tile.append(sortieElement("dt", tr(...flightActionNames[action])), key);
      keyboard.append(tile);
    }
    const pad = sortieElement("dl", "", "tactical-pad-grid");
    const entries = [
      [tr("左摇杆 / 十字键", "Left stick / D-pad"), tr("移动 / 菜单导航", "Move / navigate")],
      ["A / RT", tr("主武器", "Main weapon")], ["X", tr("护盾", "Shield")],
      ["Y", tr("大招", "Special")], ["LT", tr("赤焰蓄力", "Crimson charge")],
      ["LB", tr("轻点切换姿态 / 长按加速", "Tap: Fire mode / Hold: Boost")], ["RB", tr("进化技能", "Evolution skill")],
      ["Start", tr("暂停", "Pause")], ["A / B", tr("菜单确认 / 返回", "Confirm / back")],
    ];
    for (const [key, label] of entries) {
      const tile = sortieElement("div", "", "tactical-key-tile");
      const input = sortieElement("dd");
      input.append(sortieElement("kbd", key));
      tile.append(sortieElement("dt", label), input);
      pad.append(tile);
    }
    const keysPanel = sortieElement("section", "", "tactical-map-panel");
    keysPanel.append(sortieElement("h3", tr("键盘映射", "Keyboard mapping"), "tactical-settings-heading"), keyboard);
    const padPanel = sortieElement("section", "", "tactical-map-panel");
    const outline = sortieElement("div", "", "tactical-pad-outline");
    outline.setAttribute("aria-hidden", "true");
    padPanel.append(sortieElement("h3", tr("手柄映射", "Gamepad mapping"), "tactical-settings-heading"), outline, pad);
    host.replaceChildren(keysPanel, padPanel);
  }

  function mapping() {
    const host = sortieElement("div", "", "tactical-mapping");
    renderMapping(host);
    return host;
  }

  function flightSetting(context, key, cn, en, options) {
    const update = value => { flightControls[key] = value; saveFlightControls(); };
    const control = Array.isArray(options)
      ? sortieSelect(`${context}-${key}`, options.map(v => [v, `${v}%`]), flightControls[key], update)
      : sortieCheckbox(`${context}-${key}`, flightControls[key], update);
    const row = sortieSettingLine(tr(cn, en), control);
    if (context === "pause") pauseInputs.push(() => {
      row.firstElementChild.textContent = tr(cn, en);
      if (options) control.value = flightControls[key]; else control.checked = flightControls[key];
    });
    return row;
  }

  function displayAssists(context) {
    return [
      flightSetting(context, "colorAssist", "危险区纹理和形状", "Hazard patterns and shapes"),
      flightSetting(context, "ui", "界面大小", "UI scale", ["90", "100", "115"]),
      flightSetting(context, "subtitle", "字幕大小", "Subtitle scale", ["85", "100", "130"]),
    ];
  }

  function pauseSettingLine(cn, en, control) {
    const row = sortieSettingLine(tr(cn, en), control);
    pauseInputs.push(() => { row.firstElementChild.textContent = tr(cn, en); });
    return row;
  }

  function initPauseSettings() {
    const oldRow = pauseSettings.querySelector(".pause-settings-row");
    const back = pauseSettings.querySelector("#pause-back");
    const rebind = pauseSettings.querySelector("#pause-controls");
    const footer = sortieElement("div", "", "tactical-settings-footer");
    pauseMapping = mapping();
    pauseLanguage = sortieSelect("pause-language", [["zh-CN", "中文"], ["en", "English"]],
      gameLanguage, value => setGameLanguage(value));
    pauseFullscreen = sortieButton(fullscreenButton.textContent, () => fullscreenButton.click());
    pauseFullscreen.id = "pause-fullscreen";
    pauseFullscreen.disabled = fullscreenButton.hidden;
    const groups = {
      display: [
        pauseSettingLine("语言", "Language", pauseLanguage),
        pauseSettingLine("画质", "Graphics", pauseQualityControl),
        pauseSettingLine("显示模式", "Window mode", pauseFullscreen),
      ],
      audio: [pauseSettingLine("声音", "Sound", pauseSoundButton), ...audioRows("pause", pauseInputs)],
      controls: [flightSetting("pause", "autofire", "自动开火", "Autofire"), pauseMapping],
      assists: [
        pauseSettingLine("画面震动", "Screen shake", pauseShakeButton),
        pauseSettingLine("演出动态", "Effects motion", pauseMotionButton),
        ...displayAssists("pause"),
      ],
    };
    oldRow.remove();
    pauseTabSwitch = settingsTabs(pauseSettings, "pause", groups, "audio", key => {
      currentPauseTab = key;
      if (key === "controls") renderMapping(pauseMapping);
    });
    if (rebind) footer.append(rebind);
    footer.append(back);
    pauseSettings.append(footer);
  }

  function refreshPauseSettings(resetTab = false) {
    if (pauseTelemetry) {
      const clock = battleClock.textContent.trim();
      pauseTelemetry.hidden = pauseView !== "menu" || !clock;
      pauseTelemetry.textContent = clock + (boss ? ` · ${boss.name}` : "");
      pauseRoute.hidden = pauseView !== "menu";
      if (!pauseRoute.hidden) {
        const activeSector = battlefieldSectors[battlefieldState.sector];
        if (activeSector) pauseScreen.style.setProperty("--pause-region", `url("${activeSector.asset}")`);
        pauseRoute.setAttribute("aria-label", tr("当前星域", "Current sector"));
        Array.from(pauseRoute.children).forEach((item, index) => {
          const sector = battlefieldSectors[index];
          item.textContent = tr(sector.name, sector.enName);
          if (index === battlefieldState.sector) item.setAttribute("aria-current", "location");
          else item.removeAttribute("aria-current");
        });
      }
    }
    pauseCancelButton.textContent = tr("取消", "Cancel");
    if (!pauseTabSwitch || pauseView !== "settings") return;
    if (resetTab) pauseTabSwitch.select("audio");
    else if (currentPauseTab === "controls") renderMapping(pauseMapping);
    pauseTabSwitch.localize();
    pauseLanguage.value = gameLanguage;
    pauseFullscreen.textContent = fullscreenButton.textContent;
    pauseFullscreen.setAttribute("aria-pressed", fullscreenButton.getAttribute("aria-pressed"));
    for (const sync of pauseInputs) sync();
  }

  function prepareTools() {
    for (const [control, type] of [[shakeButton, "shake"], [soundButton, "sound"],
      [fullscreenButton, "fullscreen"], [pauseButton, "pause"]]) {
      if (!control) continue;
      const wrapper = document.createElement("span");
      wrapper.className = "tactical-tool";
      control.before(wrapper);
      wrapper.append(control);
      control.classList.add("tactical-tool-button");
      control.dataset.tool = type;
      const refresh = () => {
        const label = control.textContent.replace(/^⛶\s*/, "").trim();
        control.dataset.tip = label;
        if (control.hasAttribute("title")) control.removeAttribute("title");
        if (type === "shake") control.dataset.off = String(shakePreference === "off");
        else control.setAttribute("aria-label", label);
        if (type === "fullscreen" && pauseFullscreen) {
          pauseFullscreen.textContent = control.textContent;
          pauseFullscreen.setAttribute("aria-pressed", control.getAttribute("aria-pressed"));
        }
      };
      new MutationObserver(refresh).observe(control, {
        childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["aria-pressed"],
      });
      refresh();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    pauseTelemetry = sortieElement("p", "", "tactical-pause-telemetry");
    pauseTelemetry.hidden = true;
    pauseScreen.querySelector(".pause-heading").append(pauseTelemetry);
    pauseRoute = sortieElement("ol", "", "pause-sector-route");
    pauseRoute.hidden = true;
    for (const sector of battlefieldSectors) {
      const item = document.createElement("li");
      item.style.setProperty("--sector-color", sector.color);
      pauseRoute.append(item);
    }
    pauseTelemetry.after(pauseRoute);
    initPauseSettings();
    prepareTools();
    flightControlsDialog?.addEventListener("close", () => {
      if (pauseView === "settings") refreshPauseSettings();
      if (sortieConsole.open && sortieConsolePage === "settings") renderSortieConsole();
    });
  });

  return Object.freeze({ settings, mapping, flightSetting, displayAssists, audioRows, refreshPauseSettings });
})();
