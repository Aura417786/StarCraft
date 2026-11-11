"use strict";

const sortieConsole = document.querySelector("#sortie-console");
const sortieConsoleTitle = document.querySelector("#sortie-console-title");
const sortieConsoleBody = document.querySelector("#sortie-console-body");
const sortieConsoleClose = document.querySelector("#sortie-console-close");
const sortieConsoleButtons = document.querySelectorAll("[data-sortie-console]");
const sortieModeBadge = document.querySelector("#sortie-mode-badge");
const sortieResultSummary = document.querySelector("#sortie-result-summary");
let sortieConsolePage = "";
const starBreakerVersion = "v24";

const sortieUiWords = {
  awards: ["徽章墙", "Badge Wall"],
  challenges: ["挑战", "Challenges"], upgrades: ["改装", "Refits"], archive: ["战役档案", "Campaign Archive"], settings: ["设置", "Settings"],
  campaign: ["战役", "Campaign"], rush: ["首领连战", "Boss Rush"], practice: ["单首领练习", "Boss Practice"], daily: ["每日挑战", "Daily Challenge"],
  recruit: ["新兵", "Recruit"], veteran: ["老兵", "Veteran"], abyss: ["深渊", "Abyss"],
  firepower: ["火力", "Firepower"], survival: ["生存", "Survival"], mobility: ["机动", "Mobility"],
  "fast-shots": ["首领弹速 +20%", "Boss shots +20% speed"],
  "thick-shell": ["首领生命 +12%", "Boss health +12%"],
  updraft: ["持续向上引力", "Upward drift"], downdraft: ["持续向下引力", "Downward drift"],
  "heavy-thrusters": ["移动速度 −12%", "Flight speed −12%"],
  "sealed-shield": ["护盾禁用", "No shield"], "slow-recharge": ["护盾充能用时 +30%", "Shield recharge +30% time"]
};
const sortieRefitDescriptions = {
  firepower: [
    ["初始伤害等级 +1", "Start with damage level +1"],
    ["初始攻速等级 +1", "Start with fire rate level +1"],
    ["大招初始积能 24%", "Start with 24% special energy"],
    ["初始伤害等级再 +1", "Gain another starting damage level"],
    ["大招初始积能提升至 42%", "Start with 42% special energy"]
  ],
  survival: [
    ["护盾预充能 5 秒", "Start with 5 seconds of shield charge"],
    ["出击时直接储存一次护盾", "Start with a stored shield"],
    ["护盾充能用时 −5%", "Shield recharge takes 5% less time"],
    ["机体装甲吸收首次未格挡的攻击", "Hull plating absorbs the first unblocked hit"],
    ["护盾充能用时减少至 −10%", "Shield recharge takes 10% less time"]
  ],
  mobility: [
    ["移动速度 +1.8%", "Flight speed +1.8%"], ["移动速度 +3.6%", "Flight speed +3.6%"],
    ["移动速度 +5.4%", "Flight speed +5.4%"], ["移动速度 +7.2%", "Flight speed +7.2%"],
    ["移动速度 +9%，受击后短暂加速脱离", "Flight speed +9%, plus a brief escape boost after a hit"]
  ]
};

function sortieWord(key) { return tr(...sortieUiWords[key]); }
function sortieElement(tag, value = "", css = "") {
  const element = document.createElement(tag);
  element.textContent = value;
  if (css) element.className = css;
  return element;
}
function sortieButton(label, action, css = "secondary-button") {
  const button = sortieElement("button", label, css);
  button.type = "button";
  button.addEventListener("click", action);
  return button;
}
function sortieTime(seconds) {
  if (!seconds) return "—";
  const tenths = Math.round(seconds * 10);
  const minutes = Math.floor(tenths / 600);
  return `${minutes}:${(tenths % 600 / 10).toFixed(1).padStart(4, "0")}`;
}
function sortieMetric(label, value) {
  const div = sortieElement("div", "", "sortie-metric");
  div.append(sortieElement("span", label), sortieElement("strong", String(value)));
  return div;
}
function sortieMetrics(items) {
  const row = sortieElement("div", "", "sortie-metrics");
  row.append(...items.map(([label, value]) => sortieMetric(label, value)));
  return row;
}

function openSortieConsole(section) {
  if (!sortieConsole || !["challenges", "upgrades", "archive", "awards", "settings"].includes(section)) return;
  sortieConsolePage = section;
  sortieProfile.refresh();
  renderSortieConsole();
  if (!sortieConsole.open) sortieConsole.showModal();
  sortieConsoleClose.focus({ preventScroll: true });
}

function launchSortie(options) {
  sortieConsole.close();
  startBattleWithSound(options);
}
function sortieChallengeCard(heading, copy, action) {
  const card = sortieElement("article", "", "sortie-module");
  card.append(sortieElement("h3", heading), sortieElement("p", copy));
  if (action) card.append(action);
  return card;
}
function renderSortieChallenges(profile) {
  const daily = dailySortie();
  const today = profile.daily[daily.day];
  const todayAssisted = profile.dailyAssisted[daily.day];
  const weekly = weeklyRush();
  const weeklyRecord = profile.weekly[weekly.week];
  const rushRecord = profile.rushByDifficulty[sortieSettings.rushDifficulty];
  const summary = sortieElement("div", "", "sortie-mode-grid");
  const rush = sortieChallengeCard(sortieWord("rush"),
    tr("连战 11 只首领。每只之间进化一次，武器随关卡获得保底升级。",
      "Face all 11 bosses in order. Evolve between fights and gain minimum weapon upgrades as you advance."),
    sortieButton(tr("开始首领连战", "Launch Boss Rush"), () => launchSortie({ mode: "rush" })));
  rush.append(sortieMetrics([
    [tr("最佳时间", "Best time"), sortieTime(rushRecord.bestTime)],
    [tr("累计阵亡", "Total defeats"), profile.rush.deaths],
    [tr("最高分", "Best score"), rushRecord.bestScore],
    [tr("无伤徽章", "Flawless badge"), rushRecord.clean ? "◆" : "—"],
    [tr("速通徽章", "Speed badge"), rushRecord.fast ? "◆" : "—"]
  ]));
  rush.append(sortieSettingLine(tr("连战难度", "Rush difficulty"), sortieSelect("rush-difficulty",
    StarBreakerProfile.difficulties.map(key => [key, sortieWord(key)]), sortieSettings.rushDifficulty, value => {
      saveSortieSetting("rushDifficulty", value);
      renderSortieConsole();
    })));
  const resume = profile.rushResume;
  if (resume) rush.append(sortieButton(tr(`从 ${bossTypeName(resume.boss)} 续练（不计成绩）`,
    `Practice from ${bossTypeName(resume.boss)} (unranked)`),
    () => launchSortie(sortieRushResumeOptions(resume))));
  const weeklyCard = sortieChallengeCard(tr("每周首领连战", "Weekly Boss Rush"),
    tr(`${weekly.week} UTC 周起 · 老兵 · 固定种子 ${weekly.seed}`,
      `Week of ${weekly.week} UTC · Veteran · seed ${weekly.seed}`),
    sortieButton(tr("挑战本周种子", "Launch this week's seed"), () => launchSortie({ mode: "rush", week: weekly.week })));
  const weeklyModifiers = sortieElement("ul", "", "sortie-rules");
  weeklyModifiers.append(...weekly.rules.map(rule => sortieElement("li", sortieWord(rule))));
  weeklyCard.insertBefore(weeklyModifiers, weeklyCard.querySelector("button"));
  weeklyCard.append(sortieMetrics([
    [tr("本周最快", "Weekly best"), sortieTime(weeklyRecord?.bestTime)],
    [tr("本周最高分", "Weekly score"), weeklyRecord?.bestScore ?? "—"],
    [tr("本周辅助最快", "Assisted best time"), sortieTime(profile.weeklyAssisted[weekly.week]?.bestTime)],
    [tr("无伤徽章", "Flawless badge"), weeklyRecord?.clean ? "◆" : "—"],
    [tr("速通徽章", "Speed badge"), weeklyRecord?.fast ? "◆" : "—"]
  ]));
  const todayCard = sortieChallengeCard(sortieWord("daily"),
    `${daily.day} UTC · ${tr(...fighterProfiles[daily.fighter].label)} · ${bossTypeName(daily.bossType)}`,
    sortieButton(tr("出击", "Launch Daily"), () => launchSortie({ mode: "daily", day: daily.day })));
  const rules = sortieElement("ul", "", "sortie-rules");
  rules.append(...daily.rules.map(rule => sortieElement("li", sortieWord(rule))));
  todayCard.insertBefore(rules, todayCard.querySelector("button"));
  todayCard.append(sortieMetrics([
    [tr("今日最高分", "Today's best score"), today?.bestScore ?? "—"],
    [tr("今日最快击破", "Today's fastest clear"), sortieTime(today?.bestTime)],
    [tr("今日辅助最快", "Assisted best time"), sortieTime(todayAssisted?.bestTime)]
  ]));
  summary.append(rush, weeklyCard, todayCard);
  const practice = sortieChallengeCard(sortieWord("practice"),
    tr("三条生命，固定赤焰和武器等级。先在战役中击败首领以解锁练习。",
      "Three lives with a fixed Crimson fighter and weapon ranks. Defeat bosses in Campaign to unlock practice."));
  const grid = sortieElement("div", "", "sortie-practice-grid");
  for (let type = 0; type < bossTypes.length; type++) {
    const unlocked = profile.unlocked.includes(type);
    const name = `${String(type + 1).padStart(2, "0")} · ${bossTypeName(type)}`;
    const button = sortieButton(name, () => launchSortie({ mode: "practice", bossType: type }));
    button.disabled = !unlocked;
    if (!unlocked) button.setAttribute("aria-label", name + tr("，未解锁", ", locked"));
    const best = profile.practice[type].best;
    if (unlocked && best) button.append(sortieElement("small", sortieTime(best)));
    grid.append(button);
  }
  practice.append(grid);
  sortieConsoleBody.append(summary, practice);
}

function renderSortieUpgrades(profile) {
  sortieConsoleBody.append(
    sortieMetrics([[tr("可用改装点", "Refit points"), profile.points]]),
    sortieElement("p", tr("战役击破首领可获改装点。改装只影响下一次战役出击。", "Earn points by defeating bosses in Campaign. Refits apply on your next Campaign launch."), "sortie-explainer")
  );
  const grid = sortieElement("div", "", "sortie-mode-grid sortie-mode-grid-three");
  for (const path of StarBreakerProfile.upgradeKeys) {
    const level = profile.upgrades[path];
    const card = sortieChallengeCard(sortieWord(path) + ` · ${level}/5`, "");
    const list = sortieElement("ol", "", "sortie-refit-list");
    sortieRefitDescriptions[path].forEach((words, index) => {
      const item = sortieElement("li", tr(...words));
      item.dataset.active = String(index < level);
      list.append(item);
    });
    const cost = StarBreakerProfile.upgradeCosts[level];
    const button = sortieButton(cost ? tr(`改装 · ${cost} 点`, `Refit · ${cost} pts`) : tr("已改装至最高级", "Refit complete"), () => {
      if (sortieProfile.spendUpgrade(path)) {
        renderSortieConsole();
        const updated = sortieConsoleBody.querySelector(`[data-refit="${path}"]`);
        (updated?.disabled ? sortieConsoleClose : updated)?.focus({ preventScroll: true });
      }
    });
    button.dataset.refit = path;
    button.disabled = !cost || profile.points < cost;
    card.append(list, button);
    grid.append(card);
  }
  sortieConsoleBody.append(grid);
  const storage = {
    backup: tr("主存档无法读取，已从本机备份恢复。下次保存会修复主存档。", "The primary save was recovered from the local backup. Your next save will repair the primary copy."),
    recovered: tr("旧存档无法读取，已恢复默认资料。", "The damaged save was replaced with default data for this session."),
    session: tr("浏览器当前禁止保存，改装与记录仅在本次页面会话有效。", "Storage is unavailable. Refits and records last for this session."),
    future: tr("存档由较新版本创建。当前版本暂以会话资料运行。", "A newer version wrote this save. This version uses session data.")
  }[sortieProfile.status];
  if (storage) sortieConsoleBody.append(sortieElement("p", storage, "sortie-explainer"));
}

function renderSortieArchive(profile) {
  const { campaign, assisted, unlocked } = profile;
  sortieConsoleBody.append(sortieMetrics([
    [tr("历史最高分", "Best score"), campaign.bestScore],
    [tr("最快通关", "Fastest clear"), sortieTime(campaign.bestTime)],
    [tr("战役总击杀", "Campaign kills"), campaign.totalKills + assisted.totalKills],
    [tr("正式通关", "Ranked clears"), campaign.clears],
    [tr("最远推进", "Furthest"), `${Math.max(campaign.furthest, assisted.furthest)}/11`],
    [tr("已解锁练习", "Practice unlocked"), `${unlocked.length}/11`]
  ]));
  const levels = sortieElement("div", "", "sortie-metrics");
  for (const difficulty of StarBreakerProfile.difficulties) {
    const row = campaign.byDifficulty[difficulty];
    levels.append(sortieMetric(sortieWord(difficulty), `${row.bestScore} · ${sortieTime(row.bestTime)}`));
  }
  sortieConsoleBody.append(levels);
  const table = sortieElement("table", "", "sortie-archive-table");
  const headings = sortieElement("tr");
  headings.append(...[
    tr("首领", "Boss"), tr("正式击破", "Ranked clears"), tr("无伤", "No hit"), tr("最快", "Best time"), tr("练习", "Practice")
  ].map(title => {
    const th = sortieElement("th", title);
    th.scope = "col";
    return th;
  }));
  const head = sortieElement("thead");
  const body = sortieElement("tbody");
  head.append(headings);
  campaign.bosses.forEach((record, type) => {
    const row = sortieElement("tr");
    const bossName = sortieElement("th", `${String(type + 1).padStart(2, "0")} · ${bossTypeName(type)}`);
    bossName.scope = "row";
    row.append(bossName, ...[record.clears, record.clean, sortieTime(record.best),
      unlocked.includes(type) ? tr("已解锁", "Unlocked") : tr("未解锁", "Locked")
    ].map(value => sortieElement("td", String(value))));
    body.append(row);
  });
  table.append(head, body);
  const tableWrap = sortieElement("div", "", "sortie-archive-scroll");
  tableWrap.tabIndex = 0;
  tableWrap.setAttribute("aria-label", tr("战役首领记录", "Campaign boss records"));
  tableWrap.append(table);
  sortieConsoleBody.append(tableWrap, sortieElement("p",
    tr(`无伤按首领出现至终局击破之间是否中招计算。辅助通关 ${assisted.clears} 次，单独记录。`,
      `No-hit records count every unblocked hit from arrival to final defeat. Assisted clears are tracked separately: ${assisted.clears}.`), "sortie-explainer"));
}

function sortieSettingLine(name, control) {
  const line = sortieElement("label", "", "sortie-setting-row");
  line.append(sortieElement("span", name), control);
  return line;
}
function sortieSelect(id, options, value, change) {
  const select = sortieElement("select");
  select.id = id;
  for (const [key, label] of options) {
    const option = sortieElement("option", label);
    option.value = key;
    select.append(option);
  }
  select.value = value;
  select.addEventListener("change", () => change(select.value));
  return select;
}
function sortieCheckbox(id, checked, change) {
  const control = sortieElement("input");
  control.type = "checkbox";
  control.id = id;
  control.checked = checked;
  control.addEventListener("change", () => change(control.checked));
  return control;
}
function sortieVolumeControl() {
  const group = sortieElement("span", "", "sortie-volume-group");
  const range = sortieElement("input");
  range.id = "sortie-volume";
  range.type = "range";
  range.min = "0";
  range.max = "100";
  range.step = "1";
  range.value = String(Math.round((gameAudio.volume ?? 1) * 100));
  const output = sortieElement("output", range.value + "%");
  output.setAttribute("for", range.id);
  range.addEventListener("input", () => {
    gameAudio.setVolume?.(Number(range.value) / 100);
    output.value = range.value + "%";
  });
  group.append(range, output);
  return group;
}
function sortieDifficultyTable() {
  const wrap = sortieElement("div", "", "sortie-difficulty-scroll");
  const table = sortieElement("table", "", "sortie-difficulty-table");
  const caption = sortieElement("caption", tr("难度数值 · 以老兵为基准", "Difficulty settings relative to Veteran"));
  const heading = sortieElement("tr");
  for (const value of [tr("难度", "Difficulty"), tr("首领生命", "Boss health"), tr("预警", "Warning"),
    tr("攻势节奏", "Attack pace"), tr("敌弹速度", "Shot speed"), tr("受击伤害", "Damage taken")]) {
    const cell = sortieElement("th", value);
    cell.scope = "col";
    heading.append(cell);
  }
  const head = sortieElement("thead"); head.append(heading);
  const body = sortieElement("tbody");
  const percent = value => `${Math.round(value * 100)}%`;
  for (const [key, rule] of Object.entries(sortieDifficulty)) {
    const row = sortieElement("tr");
    const title = sortieElement("th", sortieWord(key));
    title.scope = "row";
    const warning = rule.warning ? tr(`+${rule.warning} 秒`, `+${rule.warning}s`) : "—";
    row.append(title, ...[percent(rule.bossHealth), warning, percent(rule.attackTempo), percent(rule.projectileSpeed), percent(rule.damage)]
      .map(value => sortieElement("td", value)));
    body.append(row);
  }
  table.append(caption, head, body); wrap.append(table);
  return wrap;
}
function sortieAssistLabels(flags) {
  const labels = { extendedWarning: tr("预警延长", "Longer warnings"), noScreenShake: tr("关闭震动", "Shake off"),
    reducedMotion: tr("减少动态", "Reduced motion") };
  return Object.keys(labels).filter(key => flags?.[key]).map(key => labels[key]);
}

function renderSortieSettings() {
  const difficulty = sortieSelect("sortie-difficulty", StarBreakerProfile.difficulties.map(key => [key, sortieWord(key)]),
    sortieSettings.difficulty, value => saveSortieSetting("difficulty", value));
  const extended = sortieCheckbox("sortie-extended", sortieSettings.extended, value => saveSortieSetting("extended", value));
  const shakeOptions = [["off", tr("关", "Off")], ["low", tr("轻", "Low")], ["full", tr("强", "High")]];
  const shake = sortieSelect("sortie-reduce-shake", shakeOptions, shakePreference, value => {
    shakePreference = value;
    try { window.localStorage.setItem("star-breaker-shake", shakePreference); } catch { /* Session only. */ }
    updateShakeButton();
    syncSortieEligibility();
  });
  const motion = sortieCheckbox("sortie-reduce-motion", reduceCombatMotion, () => { toggleCombatMotion(); syncSortieEligibility(); });
  const radio = sortieCheckbox("sortie-radio", sortieSettings.radio, value => saveSortieSetting("radio", value));
  const quality = sortieSelect("sortie-quality", [["low", tr("低", "Low")], ["medium", tr("中", "Medium")], ["high", tr("高", "High")]],
    visualQuality.id, value => setVisualQuality(value));
  const language = sortieSelect("sortie-language", [["zh-CN", "中文"], ["en", "English"]], gameLanguage, value => setGameLanguage(value));
  const sound = sortieCheckbox("sortie-sound", !gameAudio.muted, () => toggleGameSound());
  const guide = sortieButton(tr("打开玩法说明", "Open flight manual"), () => {
    sortieConsole.close();
    document.querySelector("#guide-button")?.click();
  });
  const training = sortieButton(tr("重玩实战训练", "Replay flight training"), () => launchSortie({ flightTraining: "replay" }));
  sortieConsoleBody.append(
    sortieElement("h3", tr("显示与声音", "Display and audio"), "sortie-section-title"),
    sortieSettingLine(tr("语言", "Language"), language),
    sortieSettingLine(tr("画质", "Graphics"), quality),
    sortieSettingLine(tr("声音", "Sound"), sound),
    sortieSettingLine(tr("主音量", "Master volume"), sortieVolumeControl()),
    sortieSettingLine(tr("无线电播报", "Radio dispatches"), radio),
    sortieElement("h3", tr("难度与辅助", "Difficulty and assists"), "sortie-section-title"),
    sortieSettingLine(tr("战役难度", "Campaign difficulty"), difficulty),
    sortieDifficultyTable(),
    sortieElement("p", tr("在挑战页单独选首领连战难度。每日、单首领练习和每周种子连战使用老兵难度。", "Choose Boss Rush difficulty in Challenges. Daily, Boss Practice, and Weekly Rush use Veteran."), "sortie-explainer"),
    sortieSettingLine(tr("延长攻击预警 +0.35 秒", "Extend attack warnings by 0.35s"), extended),
    sortieSettingLine(tr("画面震动", "Screen shake"), shake),
    sortieSettingLine(tr("减少演出动态", "Reduce effects motion"), motion),
    sortieElement("p", tr("只有延长攻击预警会将本局计入辅助纪录。关闭震动、减少动态和显示辅助不影响正式成绩。旧版纪录保持原样。", "Only longer attack warnings put a sortie in assisted records. Shake, reduced motion and display preferences do not affect ranked records. Older records are preserved."), "sortie-explainer"),
    sortieElement("h3", tr("玩法与制作名单", "Flight manual and credits"), "sortie-section-title"),
    guide,
    training,
    sortieElement("p", tr(`星际突围 / Star Breaker · ${starBreakerVersion} · 项目 Aura417786 · 开发协作 Codex`,
      `Star Breaker · ${starBreakerVersion} · Project by Aura417786 · Development with Codex`), "sortie-explainer"),
    sortieElement("p", tr("模型与材质使用 Blender 制作。配乐使用 FluidSynth 与 FFmpeg 渲染和混音。游戏使用 Three.js 和 Web Audio。",
      "Models and materials use Blender. Music was rendered and mixed with FluidSynth and FFmpeg. The game runs with Three.js and Web Audio."), "sortie-explainer"),
    sortieElement("p", tr("存档、徽章和设置保存在当前浏览器，并保留一份本机备份。更换浏览器、网页地址或清除网站数据会切换或移除存档。游戏没有账号或在线排行榜。",
      "Saves, badges, and settings stay in this browser with a local backup. A different browser or URL uses a different save. Clearing site data removes the save. The game has no accounts or online leaderboard."), "sortie-explainer")
  );
  if (typeof appendFlightControlsSettings === "function") appendFlightControlsSettings(sortieConsoleBody);
}

function renderSortieConsole() {
  const focusedId = sortieConsoleBody.contains(document.activeElement) ? document.activeElement.id : "";
  const profile = sortieProfile.data;
  refreshAwardLook(profile);
  sortieConsole.dataset.archiveTheme = (sortieConsolePage === "archive" || sortieConsolePage === "awards")
    ? profile.awards.active.theme ?? "" : "";
  sortieConsoleTitle.textContent = sortieWord(sortieConsolePage);
  sortieConsoleClose.textContent = tr("关闭", "Close");
  sortieConsoleBody.replaceChildren();
  if (sortieConsolePage === "challenges") renderSortieChallenges(profile);
  if (sortieConsolePage === "upgrades") renderSortieUpgrades(profile);
  if (sortieConsolePage === "archive") renderSortieArchive(profile);
  if (sortieConsolePage === "awards") renderAwardWall(profile);
  if (sortieConsolePage === "settings") renderSortieSettings();
  if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
}

function refreshSortieHud() {
  if (!sortieModeBadge) return;
  const run = sortieStats;
  if (!run) { sortieModeBadge.textContent = ""; return; }
  const parts = [sortieWord(run.mode)];
  if (run.mode === "campaign" || run.mode === "rush") parts.push(sortieWord(run.difficulty));
  if (run.rules.drift) parts.push(run.rules.drift < 0 ? "↑" : "↓");
  if (run.guardReady) parts.push(tr("护甲就绪", "Plating ready"));
  if (run.hitDebt) parts.push(tr(`冲击 ${Math.round(run.hitDebt * 100)}%`, `Hull stress ${Math.round(run.hitDebt * 100)}%`));
  sortieModeBadge.textContent = parts.join(" · ");
}
function refreshSortieResult() {
  const result = sortieStats?.result;
  if (!sortieResultSummary || !result) return;
  const headline = result.resumed ? tr("连战续练 · 不计成绩", "Rush practice · unranked")
    : result.assisted ? tr("辅助出击", "Assisted sortie")
    : result.week ? tr("每周首领连战", "Weekly Boss Rush") : sortieWord(result.mode);
  const stat = result.newScore || result.newTime ? (result.assisted ? tr("刷新辅助纪录", "New assisted record") : tr("刷新纪录", "New record"))
    : result.bestScore ? tr(`历史最佳 ${result.bestScore}`, `Personal best ${result.bestScore}`) : "";
  const status = [headline, stat, result.mode === "rush" ? tr(`本局阵亡 ${Number(result.died)} 次`, `Defeats this run: ${Number(result.died)}`) : ""].filter(Boolean).join(" · ");
  const defeated = result.bossRecords.map(record => bossTypeName(record.type)).join(tr("、", ", "));
  const unlocks = result.unlocks.map(type => bossTypeName(type)).join(tr("、", ", "));
  sortieResultSummary.replaceChildren(sortieElement("strong", status));
  const assists = sortieAssistLabels(result.assists);
  if (assists.length) sortieResultSummary.append(sortieElement("p", assists.join(" · ")));
  const resume = sortieProfile.data.rushResume;
  if (result.mode === "rush" && !result.resumed && !result.won && resume) {
    sortieResultSummary.append(sortieButton(tr("从当前首领续练（不计成绩）", "Practice from this boss (unranked)"),
      () => startBattleWithSound(sortieRushResumeOptions(resume))));
  }
  if (result.cleanBadge) sortieResultSummary.append(sortieElement("p", tr("◆ 无伤徽章", "◆ Flawless badge")));
  if (result.fastBadge) sortieResultSummary.append(sortieElement("p", tr("◆ 速通徽章 · 10:20 内", "◆ Speed badge · within 10:20")));
  if (defeated) sortieResultSummary.append(sortieElement("p", tr(`击破 ${defeated}`, `Defeated ${defeated}`)));
  if (unlocks) sortieResultSummary.append(sortieElement("p", tr(`新练习解锁 ${unlocks}`, `Practice unlocked ${unlocks}`)));
  appendNewAwards(sortieResultSummary, result);
  sortieResultSummary.hidden = false;
}

function refreshSortieUI() {
  if (!sortieConsole) return;
  for (const button of sortieConsoleButtons) button.textContent = sortieWord(button.dataset.sortieConsole);
  document.querySelector(".hangar-console-actions")?.setAttribute("aria-label", tr("机库终端", "Hangar console"));
  if (sortieConsole.open) renderSortieConsole();
  refreshSortieHud();
  if (state === "over") refreshSortieResult();
}

if (sortieConsole) {
  for (const button of sortieConsoleButtons) button.addEventListener("click", () => openSortieConsole(button.dataset.sortieConsole));
  sortieConsoleClose.addEventListener("click", () => sortieConsole.close());
  reducedMotion.addEventListener?.("change", syncSortieEligibility);
  refreshAwardLook();
  refreshSortieUI();
}
