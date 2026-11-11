"use strict";

let equippedAwards = {};

function refreshAwardLook(profile = sortieProfile.data) {
  equippedAwards = profile.awards.active;
  applyHangarAwardSkin(selectedFighter);
}

function activeAwardFilter(ship) {
  const skin = StarBreakerAwards.cosmetics[equippedAwards.skin];
  return skin?.ship === ship ? skin.filter : "";
}

function applyHangarAwardSkin(ship) {
  const filter = activeAwardFilter(ship);
  if (fighterImage) fighterImage.style.filter = filter;
  if (hangarVariantImage) hangarVariantImage.style.filter = filter;
}

function drawAwardWake(ctx, ship) {
  if (!equippedAwards.effect || quietCombatMotion()) return;
  const width = ship.width, back = ship.x - width * .42;
  const sprint = equippedAwards.effect === "insignia";
  const glow = ctx.createLinearGradient(back - width * .6, 0, back, 0);
  glow.addColorStop(0, "transparent");
  glow.addColorStop(.74, sprint ? "#fbbb6950" : "#96d9fa5a");
  glow.addColorStop(1, sprint ? "#fff0b1c7" : "#e0fbffc9");
  ctx.save();
  ctx.strokeStyle = glow;
  ctx.lineWidth = Math.max(1, ship.height * .04);
  ctx.beginPath();
  for (const direction of [-1, 1]) {
    ctx.moveTo(back - width * .6, ship.y + direction * ship.height * .16);
    ctx.quadraticCurveTo(back - width * .28, ship.y + direction * ship.height * .05,
      back, ship.y + direction * ship.height * .09);
  }
  ctx.stroke();
  ctx.restore();
}

function awardCopy(id) {
  const match = id.match(/^(?:boss|clean)-(\d+)$/);
  const ship = fighterProfiles[id.slice(4)];
  const difficulty = StarBreakerProfile.recordDifficulties.includes(id.slice(9)) ? sortieWord(id.slice(9)) : "";
  return StarBreakerAwards.words(id, match ? bossTypeName(Number(match[1])) : "",
    ship ? tr(...ship.label) : "", difficulty).map(pair => tr(...pair));
}

function renderAwardWall(profile) {
  const { badges, active } = profile.awards;
  const unlocked = new Set(badges);
  const inventory = sortieElement("div", "", "award-inventory");
  for (const [slot, label] of [["skin", tr("战机涂装", "Fighter finish")],
    ["theme", tr("档案主题", "Archive theme")], ["effect", tr("战斗尾迹", "Combat wake")]]) {
    const items = Object.entries(StarBreakerAwards.cosmetics).filter(([, item]) => item.slot === slot);
    const select = sortieSelect("award-" + slot,
      [["", tr("标准", "Standard")], ...items.map(([id, item]) => [id, tr(...item.name)])], active[slot] ?? "",
      value => {
        if (sortieProfile.equipAward(slot, value)) renderSortieConsole();
      });
    for (const option of select.options) {
      const item = StarBreakerAwards.cosmetics[option.value];
      if (item && !unlocked.has(item.badge) && !unlocked.has(item.alternateBadge)) {
        option.disabled = true;
        option.textContent += tr(" · 待解锁", " · Locked");
      }
    }
    const requirements = sortieElement("ul", "", "award-unlocks");
    for (const [, item] of items) {
      const [name] = awardCopy(item.badge);
      const alternate = item.alternateBadge ? tr(" 或 ", " or ") + awardCopy(item.alternateBadge)[0] : "";
      requirements.append(sortieElement("li", tr(...item.name) + " · " + name + alternate));
    }
    inventory.append(sortieSettingLine(label, select), requirements);
  }
  const grid = sortieElement("ul", "", "award-grid");
  for (const id of StarBreakerAwards.ids) {
    const owned = unlocked.has(id);
    const secret = !owned && StarBreakerAwards.hidden.has(id);
    const [name, description] = secret ? [tr("隐藏徽章", "Hidden badge"), tr("条件将在达成后揭晓。", "Revealed when earned.")] : awardCopy(id);
    const card = sortieElement("li", "", "award-badge");
    card.dataset.earned = String(owned);
    card.append(sortieElement("b", owned ? "◆" : "◇"), sortieElement("strong", name), sortieElement("small", description));
    grid.append(card);
  }
  const codex = sortieElement("div", "", "award-codex");
  for (let type = 0; type < bossTypes.length; type++) {
    const owned = unlocked.has("boss-" + type);
    const card = sortieElement("article", "", "award-boss");
    card.dataset.earned = String(owned);
    if (owned) {
      const art = sortieElement("img");
      art.src = `assets/aliens/boss-${String(type + 1).padStart(2, "0")}.webp`;
      art.alt = "";
      art.loading = "lazy";
      const [, cn, , en] = flightRadioLines[type][0];
      card.append(art, sortieElement("h4", bossTypeName(type)), sortieElement("p", tr(cn, en)));
    } else {
      card.append(sortieElement("span", String(type + 1).padStart(2, "0")), sortieElement("h4", tr("未知信号", "Unidentified signal")),
        sortieElement("p", tr("在战役中击破后解锁。", "Defeat in Campaign to identify.")));
    }
    codex.append(card);
  }
  sortieConsoleBody.append(
    sortieElement("p", tr(`已解锁 ${badges.length}/${StarBreakerAwards.ids.length} · 徽章与涂装保存在本机。`,
      `${badges.length}/${StarBreakerAwards.ids.length} unlocked · Badges and finishes are saved locally.`), "sortie-explainer"),
    sortieElement("h3", tr("外观装备", "Cosmetics"), "sortie-section-title"),
    inventory, sortieElement("h3", tr("飞行徽章", "Pilot badges"), "sortie-section-title"), grid,
    sortieElement("h3", tr("异形图鉴", "Alien codex"), "sortie-section-title"), codex);
}

function appendNewAwards(container, result) {
  if (!result.newAwards?.length) return;
  const list = result.newAwards.map(id => awardCopy(id)[0]).join(tr("、", ", "));
  container.append(sortieElement("p", tr("新徽章 · ", "New badges · ") + list, "award-earned-callout"));
}
