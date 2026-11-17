"use strict";

(() => {
  const hangar = document.getElementById("start-screen");
  const brief = document.getElementById("fighter-brief");
  const consolePanel = document.getElementById("sortie-console");
  const consoleBody = document.getElementById("sortie-console-body");
  const resultPanel = document.getElementById("game-over-screen");
  if (!hangar || !brief || !consolePanel || !consoleBody || !resultPanel) return;

  const svgNs = "http://www.w3.org/2000/svg";
  const svgElement = (tag, attributes) => {
    const element = document.createElementNS(svgNs, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  };
  const volleyDamage = profile => Number((profile.lanes * profile.damage).toFixed(3));
  const radarAxes = [profile => profile.rate, profile => profile.lanes, profile => profile.damage, volleyDamage];
  const radarMaxima = radarAxes.map(axis => Math.max(...Object.values(fighterProfiles).map(axis)));
  const radarAxesCopy = [["射速", "Rate"], ["弹道", "Lanes"], ["单发", "Hit"], ["齐射", "Volley"]];
  const points = (radius, ratios = [1, 1, 1, 1]) => [
    [76, 62 - radius * ratios[0]], [76 + radius * ratios[1], 62],
    [76, 62 + radius * ratios[2]], [76 - radius * ratios[3], 62],
  ].map(point => point.join(",")).join(" ");

  const radar = svgElement("svg", { viewBox: "0 0 152 124", class: "hangar-radar", "aria-hidden": "true" });
  for (const r of [10, 20, 30, 40]) radar.append(svgElement("polygon", { points: points(r), class: "hangar-radar-grid" }));
  radar.append(svgElement("path", { d: "M76 22v80M36 62h80", class: "hangar-radar-grid" }));
  const radarValue = svgElement("polygon", { class: "hangar-radar-value" });
  radar.append(radarValue);
  const radarLabels = [[76, 13], [129, 65], [76, 117], [22, 65]].map(([x, y]) => {
    const label = svgElement("text", { x, y, "text-anchor": "middle" });
    radar.append(label);
    return label;
  });
  const volleyLabel = sortieElement("dt"), volleyValue = sortieElement("dd");
  const volleyStat = sortieElement("div");
  volleyStat.append(volleyLabel, volleyValue);
  brief.querySelector(".fighter-stats").append(volleyStat);
  brief.append(radar);
  for (const label of hangar.querySelectorAll(".fighter-option[data-fighter]")) {
    const preview = sortieElement("img", "", "hangar-option-preview");
    preview.src = fighterVariantArt[label.dataset.fighter].src;
    preview.alt = "";
    preview.decoding = "async";
    preview.loading = "lazy";
    label.querySelector(":scope > span").append(preview);
  }

  function refreshFighterRadar() {
    const fighter = fighterProfiles[hangar.dataset.fighter] ?? fighterProfiles.red;
    radarValue.setAttribute("points", points(40, radarAxes.map((axis, index) => axis(fighter) / radarMaxima[index])));
    radarLabels.forEach((label, index) => { label.textContent = tr(...radarAxesCopy[index]); });
    volleyLabel.textContent = tr("齐射伤害", "Volley damage");
    volleyValue.textContent = String(volleyDamage(fighter));
  }

  function addArchiveRoute(profile) {
    const list = sortieElement("ol", "", "tactical-campaign-route");
    list.setAttribute("aria-label", tr("战役进度", "Campaign progress"));
    const clearedTo = Math.max(profile.campaign.furthest, profile.assisted.furthest);
    profile.campaign.bosses.forEach((record, type) => {
      const node = sortieElement("li", String(type + 1).padStart(2, "0"));
      const cleared = record.clears > 0 || clearedTo > type;
      node.dataset.status = cleared ? "cleared" : profile.unlocked.includes(type) ? "unlocked" : "locked";
      const status = cleared ? tr("已击破", "Cleared") : profile.unlocked.includes(type) ? tr("已解锁", "Unlocked") : tr("未解锁", "Locked");
      node.setAttribute("aria-label", `${bossTypeName(type)} · ${status}`);
      node.title = `${bossTypeName(type)} · ${status}`;
      list.append(node);
    });
    consoleBody.prepend(list);
  }

  let dailyTimer = 0;
  function updateDailyTime(label) {
    clearTimeout(dailyTimer);
    const now = new Date();
    const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    const remaining = Math.max(0, Math.floor((tomorrow - now.getTime()) / 1000));
    const clock = [Math.floor(remaining / 3600), Math.floor(remaining / 60) % 60, remaining % 60]
      .map(value => String(value).padStart(2, "0")).join(":");
    label.textContent = tr(`${clock} 后刷新 · UTC`, `Resets in ${clock} · UTC`);
    const day = now.getUTCDate();
    if (consolePanel.open && label.isConnected) {
      dailyTimer = setTimeout(() => {
        if (new Date().getUTCDate() !== day) renderSortieConsole();
        else if (consolePanel.open && label.isConnected) updateDailyTime(label);
      }, 1000 - now.getMilliseconds());
    }
  }

  function addChallengeProgress(profile) {
    const [rush, , daily] = consoleBody.querySelectorAll(".sortie-mode-grid > .sortie-module");
    if (!rush || !daily) return;
    const list = sortieElement("ol", "", "tactical-rush-route");
    list.setAttribute("aria-label", tr("连战首领顺序", "Boss Rush order"));
    const best = profile.rushByDifficulty[sortieSettings.rushDifficulty];
    const resume = profile.rushResume;
    bossTypes.forEach((_, type) => {
      const node = sortieElement("li", String(type + 1));
      node.title = bossTypeName(type);
      node.dataset.cleared = String(Boolean(best?.bestTime));
      node.dataset.resume = String(resume?.boss === type);
      list.append(node);
    });
    rush.querySelector("p").after(list);
    const countdown = sortieElement("time", "", "tactical-daily-time");
    daily.querySelector("p").after(countdown);
    updateDailyTime(countdown);
  }

  function dressConsole() {
    clearTimeout(dailyTimer);
    const page = sortieConsolePage;
    consolePanel.dataset.section = page;
    if (page === "archive" && !consoleBody.querySelector(".tactical-campaign-route")) addArchiveRoute(sortieProfile.data);
    if (page === "challenges") {
      const existing = consoleBody.querySelector(".tactical-daily-time");
      if (existing) updateDailyTime(existing); else addChallengeProgress(sortieProfile.data);
    }
  }

  const resultCard = resultPanel.querySelector(".result-card");
  const remainingBoss = sortieElement("section", "", "tactical-result-boss");
  const remainingTitle = sortieElement("strong");
  const remainingLabel = sortieElement("span");
  const remainingMeter = sortieElement("progress");
  remainingMeter.max = 100;
  remainingBoss.append(remainingTitle, remainingLabel, remainingMeter);
  remainingBoss.hidden = true;
  resultCard.querySelector(".result-details").after(remainingBoss);

  const refit = sortieButton("", () => {
    showScreen("menu");
    setHangarPage("records", false);
    openSortieConsole("upgrades");
  });
  refit.id = "result-refit-button";
  refit.hidden = true;
  resultCard.querySelector("#result-menu-button").before(refit);

  function dressResult() {
    const failed = !resultPanel.hidden && resultPanel.dataset.victory === "false";
    refit.hidden = !failed;
    refit.textContent = tr("前往改装", "Open refit");
    remainingBoss.hidden = !failed || !boss || boss.hp <= 0;
    if (remainingBoss.hidden) return;
    const health = clamp(boss.hp, 0, 1);
    const percent = Math.ceil(health * 100 - 1e-9);
    remainingTitle.textContent = bossTypeName(boss.type);
    remainingLabel.textContent = tr(`剩余生命 ${percent}%`, `Health remaining ${percent}%`);
    remainingMeter.value = percent;
    remainingMeter.setAttribute("aria-label", remainingLabel.textContent);
  }

  const localeObserver = new MutationObserver(() => { refreshFighterRadar(); dressResult(); });
  localeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  new MutationObserver(refreshFighterRadar).observe(hangar, { attributes: true, attributeFilter: ["data-fighter"] });
  new MutationObserver(dressConsole).observe(consoleBody, { childList: true });
  new MutationObserver(dressConsole).observe(consolePanel, { attributes: true, attributeFilter: ["open"] });
  new MutationObserver(dressResult).observe(resultPanel, { attributes: true, attributeFilter: ["hidden", "data-victory"] });
  consolePanel.addEventListener("close", () => clearTimeout(dailyTimer));
  refreshFighterRadar();
  dressResult();
})();
