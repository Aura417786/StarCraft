"use strict";

const StarBreakerAwards = (() => {
  const ships = ["red", "blue", "yellow"];
  const difficulties = ["recruit", "veteran", "abyss"];
  const bossCount = 11;
  const buildBadges = {
    "build-wing": [["穿甲专家", "Hull Piercer"], ["用三级翼刃击破一只首领。", "Defeat a boss with Wingblade III."]],
    "build-falcon": [["护航指挥官", "Escort Commander"], ["用三级僚机击破一只首领。", "Defeat a boss with Falcon III."]],
    "build-aegis": [["壁垒守望", "Aegis Sentinel"], ["用三级壁垒击破一只首领。", "Defeat a boss with Aegis III."]],
    "build-crossfire": [["双线火控", "Crossfire Link"], ["用至少二级的翼刃与僚机击破一只首领。", "Defeat a boss with Wingblade II and Falcon II or better."]],
    "build-escort": [["联防航线", "Mutual Defense"], ["用至少二级的僚机与壁垒击破一只首领。", "Defeat a boss with Falcon II and Aegis II or better."]],
  };
  const names = {
    "all-fighters": [["飞行三谱", "Three Flight Paths"], ["用三架战机分别完成战役。", "Clear the campaign with each fighter."]],
    "rush-clear": [["连续战令", "Gauntlet Cleared"], ["打完一场正式首领连战。", "Clear a ranked Boss Rush."]],
    "rush-clean": [["无伤突围", "Untouched"], ["正式连战全程无伤通关。", "Clear a ranked Rush without taking a hit."]],
    "rush-fast": [["极限航速", "Breakneck"], ["在 10:20 内通关正式首领连战。", "Clear a ranked Rush within 10:20."]],
    "daily-streak": [["连续三日", "Third Sunrise"], ["连续三个 UTC 日期完成每日挑战。", "Clear the daily challenge on three consecutive UTC dates."]],
    ...buildBadges,
  };
  const numbered = prefix => Array.from({ length: bossCount }, (_, id) => prefix + id);
  const ids = Object.freeze([...numbered("boss-"), ...numbered("clean-"), ...ships.map(id => "fly-" + id),
    ...difficulties.map(id => "campaign-" + id), ...Object.keys(names)]);
  const hidden = new Set(["clean-10", "rush-clean", "all-fighters"]);
  const cosmetics = Object.freeze({
    frost: { slot: "skin", ship: "red", badge: "fly-red", name: ["极光白 · 赤焰", "Polar Ivory · Crimson"],
      filter: "grayscale(.86) brightness(1.35) contrast(1.04)" },
    amethyst: { slot: "skin", ship: "blue", badge: "fly-blue", name: ["电弧紫 · 苍电", "Arc Amethyst · Azure"],
      filter: "hue-rotate(57deg) saturate(1.18)" },
    jade: { slot: "skin", ship: "yellow", badge: "fly-yellow", name: ["翡翠光 · 曜金", "Verdant Light · Auric"],
      filter: "hue-rotate(85deg) saturate(1.20)" },
    archive: { slot: "theme", badge: "campaign-abyss", name: ["深渊档案主题", "Abyss Archive Theme"] },
    trail: { slot: "effect", badge: "daily-streak", name: ["星门尾迹", "Stargate Wake"] },
    insignia: { slot: "effect", badge: "rush-fast", name: ["竞速尾迹", "Sprint Wake"] },
  });

  function normalize(raw, unlocked = [], campaign, rush) {
    const found = new Set(Array.isArray(raw?.badges) ? raw.badges : []);
    for (const type of unlocked) found.add("boss-" + type);
    for (let type = 0; type < bossCount; type++) {
      if (campaign?.bosses[type]?.clean > 0) found.add("clean-" + type);
    }
    for (const difficulty of difficulties) if (campaign?.byDifficulty[difficulty]?.clears > 0) found.add("campaign-" + difficulty);
    if (rush?.clears > 0) found.add("rush-clear");
    if (rush?.clean > 0) found.add("rush-clean");
    if (rush?.fast > 0) found.add("rush-fast");
    const active = {};
    for (const slot of ["skin", "theme", "effect"]) {
      const value = raw?.active?.[slot];
      if (Object.hasOwn(cosmetics, value) && cosmetics[value].slot === slot && found.has(cosmetics[value].badge)) active[slot] = value;
    }
    return { badges: ids.filter(id => found.has(id)), active };
  }

  function buildsFor(pierce, blast, aegis) {
    const result = [];
    if (pierce >= 3) result.push("build-wing");
    if (blast >= 3) result.push("build-falcon");
    if (aegis >= 3) result.push("build-aegis");
    if (pierce >= 2 && blast >= 2) result.push("build-crossfire");
    if (blast >= 2 && aegis >= 2) result.push("build-escort");
    return result;
  }

  function hasDailyStreak(daily, day) {
    let date = Date.parse(day + "T00:00:00Z");
    if (!Number.isFinite(date)) return false;
    for (let offset = 0; offset < 3; offset++, date -= 86_400_000) {
      if (!(daily[new Date(date).toISOString().slice(0, 10)]?.clears > 0)) return false;
    }
    return true;
  }

  function award(current, run, result) {
    if (!current.awards || run.resumed || run.mode === "practice") return [];
    const before = new Set(current.awards.badges);
    const earned = new Set(before);
    if (run.mode === "campaign") {
      for (const boss of run.bossRecords) {
        earned.add("boss-" + boss.type);
        if (boss.hitCount === 0 && !run.assisted) earned.add("clean-" + boss.type);
        for (const build of boss.builds ?? []) if (Object.hasOwn(buildBadges, build)) earned.add(build);
      }
      if (run.won && !run.abandoned && run.bossRecords.length === bossCount) {
        if (ships.includes(run.fighter)) earned.add("fly-" + run.fighter);
        if (ships.every(id => earned.has("fly-" + id))) earned.add("all-fighters");
        if (!run.assisted && difficulties.includes(run.difficulty)) earned.add("campaign-" + run.difficulty);
      }
    } else if (run.mode === "rush" && run.won && !run.assisted && !run.abandoned && run.bossRecords.length === bossCount) {
      earned.add("rush-clear");
      if (result.cleanBadge) earned.add("rush-clean");
      if (result.fastBadge) earned.add("rush-fast");
    } else if (run.mode === "daily" && run.won && !run.assisted && !run.abandoned && hasDailyStreak(current.daily, run.day)) {
      earned.add("daily-streak");
    }
    current.awards.badges = ids.filter(id => earned.has(id));
    return current.awards.badges.filter(id => !before.has(id));
  }

  function words(id, bossName, fighterName, difficultyName) {
    if (names[id]) return names[id];
    if (id.startsWith("boss-")) return [[bossName, bossName], ["在战役中击破该首领。", "Defeat this boss in Campaign."]];
    if (id.startsWith("clean-")) return [[`无伤 · ${bossName}`, `No hit · ${bossName}`],
      ["无辅助、无伤击破该首领。", "Defeat this boss without assists or taking a hit."]];
    if (id.startsWith("fly-")) return [[fighterName, fighterName], ["驾驶该战机完成战役。", "Clear the campaign with this fighter."]];
    return [[difficultyName, difficultyName], ["完成该难度的无辅助战役。", "Clear Campaign on this difficulty without assists."]];
  }

  return { ids, hidden, cosmetics, buildsFor, normalize, award, words };
})();

if (typeof module !== "undefined") module.exports = StarBreakerAwards;
