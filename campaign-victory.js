"use strict";

const campaignEpilogue = document.querySelector("#campaign-epilogue");
const campaignEpilogueSkip = document.querySelector("#campaign-epilogue-skip");
const campaignEpilogueTitle = document.querySelector("#campaign-epilogue-title");
const campaignEpilogueLine = document.querySelector("#campaign-epilogue-line");
const campaignEpilogueProgress = document.querySelector("#campaign-epilogue-progress");
const campaignVictoryReport = document.querySelector("#campaign-victory-report");
const campaignReportTitle = document.querySelector("#campaign-report-title");
const campaignReportGrade = document.querySelector("#campaign-report-grade");
const campaignReportContent = document.querySelector("#campaign-report-content");
const campaignReportRetry = document.querySelector("#campaign-report-retry");
const campaignReportChallenges = document.querySelector("#campaign-report-challenges");
const campaignReportHangar = document.querySelector("#campaign-report-hangar");
const campaignEpilogueDuration = 15;
let campaignVictory = null;

function campaignGrade(result) {
  const clean = result.bossRecords.filter(record => record.hitCount === 0).length;
  if (result.hits <= 4 && clean >= 6) return "S";
  return result.hits <= 10 ? "A" : "B";
}

function startCampaignVictory(result) {
  if (!campaignEpilogue || !campaignVictoryReport || !result?.won) return false;
  campaignVictory = { result, age: 0, stage: "sequence", caption: -1, plane: sortieFighter };
  gameOverScreen.hidden = true;
  campaignEpilogue.hidden = false;
  campaignVictoryReport.hidden = true;
  campaignEpilogueProgress.value = 0;
  gameAudio.victorySequence?.(true);
  refreshCampaignVictory();
  campaignEpilogueSkip.focus({ preventScroll: true });
  return true;
}

function resetCampaignVictory() {
  if (!campaignVictory) return;
  if (campaignVictory.stage === "sequence") gameAudio.victorySequence?.(false);
  campaignVictory = null;
  campaignEpilogue.hidden = true;
  campaignVictoryReport.hidden = true;
}

function finishCampaignVictory() {
  if (campaignVictory?.stage !== "sequence") return;
  campaignVictory.stage = "report";
  gameAudio.victorySequence?.(false);
  campaignEpilogue.hidden = true;
  campaignVictoryReport.hidden = false;
  refreshCampaignVictory();
  campaignReportRetry.focus({ preventScroll: true });
}

function campaignSmooth(value, start, end) {
  const p = clamp((value - start) / (end - start), 0, 1);
  return p * p * (3 - 2 * p);
}

function drawCampaignGate(ctx, x, y, radius, age, alpha, calm) {
  if (radius < 2 || alpha < .001) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-.19);
  ctx.globalAlpha *= alpha;
  const aura = ctx.createRadialGradient(0, 0, radius * .1, 0, 0, radius * 1.65);
  aura.addColorStop(0, "#a4d9f263");
  aura.addColorStop(.38, "#86c6ec22");
  aura.addColorStop(.69, "#6cb0ed31");
  aura.addColorStop(1, "#2a426e00");
  ctx.fillStyle = aura;
  ctx.fillRect(-radius * 1.65, -radius * 1.65, radius * 3.3, radius * 3.3);
  const open = campaignSmooth(age, 3, 6.3);
  if (typeof drawFlightLattice === "function") {
    drawFlightLattice(ctx, 0, 0, radius * (.59 + .13 * open), radius * 1.15,
      "#c0eaff", calm ? 0 : age, .58 + open * .26, .6);
    if (open > 0) drawFlightLattice(ctx, 0, 0, radius * .36, radius * .81,
      "#ffe1a2", calm ? 0 : -age * 1.3, open * .68, .48);
  }
  if (open > 0) {
    const iris = ctx.createLinearGradient(-radius * .42, 0, radius * .42, 0);
    iris.addColorStop(0, "#2d63a015");
    iris.addColorStop(.32, "#78d3fd66");
    iris.addColorStop(.49, "#d4fbf9d9");
    iris.addColorStop(.64, "#467cb870");
    iris.addColorStop(1, "#1c324a19");
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * (.018 + open * .38), radius * (.13 + open * .79), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const metal = ctx.createLinearGradient(-radius * .48, -radius, radius * .48, radius);
  metal.addColorStop(0, "#b9dcf1");
  metal.addColorStop(.21, "#546f8a");
  metal.addColorStop(.56, "#1e344b");
  metal.addColorStop(.81, "#6886a2");
  metal.addColorStop(1, "#a8c9e6");
  ctx.lineWidth = Math.max(2, radius * .037);
  for (let bay = 0; bay < 10; bay++) {
    const start = bay * Math.PI * .2;
    ctx.strokeStyle = metal;
    ctx.beginPath();
    ctx.ellipse(2, 0, radius * .49, radius * 1.09, 0, start + .025, start + .545);
    ctx.stroke();
  }
  for (let ring = 0; ring < 4; ring++) {
    const size = radius * (.82 + ring * .08);
    ctx.strokeStyle = ["#6bafdb4a", "#99d4ebc9", "#d2f4f8e0", "#638bce5a"][ring];
    ctx.lineWidth = Math.max(1, size * (ring === 2 ? .019 : .008));
    ctx.beginPath();
    ctx.ellipse(0, 0, size * .43, size, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const turn = calm ? 0 : age * .32;
  ctx.strokeStyle = "#d9f7ff";
  ctx.lineWidth = Math.max(1, radius * .012);
  for (let index = 0; index < 4; index++) {
    const a = turn + index * Math.PI * .5;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * .47, radius * 1.08, 0, a, a + .38);
    ctx.stroke();
  }
  ctx.restore();
}

const epilogueRoute = [
  [.07, .71], [.16, .67], [.24, .76], [.32, .58], [.40, .48], [.50, .58],
  [.58, .40], [.65, .45], [.73, .30], [.82, .36], [.92, .17],
];

function drawEpilogueStarMap(ctx, scene, width, height) {
  const reveal = campaignSmooth(scene.age, 9.7, 11.1);
  if (reveal <= 0) return;
  const wide = Math.min(width * .79, height * 1.69);
  const tall = height * .50;
  const left = (width - wide) / 2;
  const top = height * .12;
  ctx.save();
  ctx.translate(left, top);
  ctx.globalAlpha = reveal;
  ctx.fillStyle = "#0b1629e8";
  ctx.fillRect(0, 0, wide, tall);
  ctx.strokeStyle = "#a9d7ee44";
  ctx.lineWidth = 1;
  ctx.strokeRect(.5, .5, wide - 1, tall - 1);
  ctx.beginPath();
  for (let column = 1; column < 13; column++) {
    const x = column * wide / 13;
    ctx.moveTo(x, 0); ctx.lineTo(x, tall);
  }
  for (let row = 1; row < 7; row++) {
    const y = row * tall / 7;
    ctx.moveTo(0, y); ctx.lineTo(wide, y);
  }
  ctx.strokeStyle = "#7795c51f";
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `${Math.max(9, Math.min(14, wide * .020))}px Consolas, "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = "#b0d8f3";
  ctx.fillText(tr("返航星图 · 航道恢复", "RETURN VECTOR / ROUTE RESTORED"), wide * .035, tall * .077);
  let previous;
  for (const [index, [fx, fy]] of epilogueRoute.entries()) {
    const x = fx * wide, y = fy * tall;
    const lit = campaignSmooth(scene.age, 10.18 + index * .31, 10.62 + index * .31);
    if (previous) {
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(previous.x + (x - previous.x) * lit, previous.y + (y - previous.y) * lit);
      ctx.strokeStyle = "#b6e7f7";
      ctx.stroke();
    }
    previous = { x, y };
    const radius = Math.max(3, Math.min(7, wide * .009));
    ctx.globalAlpha = reveal * (.28 + .72 * lit);
    ctx.beginPath();
    ctx.moveTo(x, y - radius); ctx.lineTo(x + radius, y);
    ctx.lineTo(x, y + radius); ctx.lineTo(x - radius, y); ctx.closePath();
    ctx.fillStyle = lit > 0 ? (index === 10 ? "#ffe2a3" : "#b7eaf2") : "#5e7293";
    ctx.fill();
    ctx.fillStyle = "#d9eaf9";
    ctx.fillText(String(index + 1).padStart(2, "0"), x - radius, y + radius + 3);
    ctx.globalAlpha = reveal;
  }
  ctx.restore();
}

function paintCampaignVictory(scene) {
  const { width, height } = viewport;
  const { age } = scene;
  const ctx = context;
  const calm = quietCombatMotion();
  const departure = campaignSmooth(age, 0, 6);
  const crossing = campaignSmooth(age, 6.2, 9.8);
  const rest = campaignSmooth(age, 9.55, 13.65);
  const lens = campaignSmooth(age, 2.1, 9.2);
  const travel = calm ? .55 : departure;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  if (typeof applyCampaignReturnCamera === "function") applyCampaignReturnCamera(ctx, age);
  drawBattlefield(false);
  const atmos = ctx.createLinearGradient(0, height, width, 0);
  atmos.addColorStop(0, `rgba(12,20,42,${.36 + rest * .29})`);
  atmos.addColorStop(.56, `rgba(27,34,64,${.27 + rest * .18})`);
  atmos.addColorStop(1, `rgba(42,81,118,${.21 + rest * .35})`);
  ctx.fillStyle = atmos;
  ctx.fillRect(0, 0, width, height);
  const centerY = height * .47;
  const gateX = width * (.88 - .29 * lens);
  const dust = Math.min(56, 20 + (visualQuality.id === "high" ? 36 : 20));
  ctx.lineWidth = 1;
  for (let index = 0; index < dust; index++) {
    const depth = (index % 8 + 1) / 8;
    const speed = calm ? 0 : (age * (.012 + lens * .026)) * depth;
    const x = ((index * .618034 - speed) % 1 + 1) % 1 * width;
    const y = ((index * .381966 + .25) % 1) * height;
    const tail = calm ? 1 : 1 + depth * (5 + lens * 36) * (1 - rest * .82);
    ctx.strokeStyle = index % 5 === 0 ? "#d8e8f6" : "#8eb6d8";
    ctx.globalAlpha = .16 + depth * .32;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + tail, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawCampaignGate(ctx, gateX, centerY, height * (.16 + lens * .28), age, campaignSmooth(age, 2.4, 6) * (1 - rest), calm);

  const widthScale = (calm ? .11 : .148 - crossing * .11) * Math.min(width, height * 1.78);
  const ship = { x: width * (.20 + travel * .19 + crossing * .275),
    y: centerY + (calm ? 0 : Math.sin(age * .51) * height * .012) * (1 - crossing),
    width: widthScale, height: widthScale * .64, visualBank: calm ? 0 : -.13 * lens, hitFlash: 0 };
  ctx.save();
  ctx.globalAlpha = (1 - rest) * (1 - campaignSmooth(crossing, .61, .92));
  const awardFilter = typeof activeAwardFilter === "function" ? activeAwardFilter(scene.plane) : "";
  if (awardFilter) ctx.filter = awardFilter;
  if (!drawFighterVariant(ctx, ship, scene.plane, evolution, calm, age)
    && fighterImage.complete && fighterImage.naturalWidth) {
    ctx.drawImage(fighterImage, ship.x - ship.width / 2, ship.y - ship.height / 2, ship.width, ship.height);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  if (!calm && crossing > .08 && crossing < .76) {
    ctx.save();
    ctx.translate(gateX, centerY);
    ctx.rotate(-.19);
    const ring = height * (.16 + lens * .28);
    ctx.globalAlpha = (1 - Math.abs(crossing - .4) * 1.6) * (1 - rest) * .85;
    ctx.strokeStyle = "#c6edfb";
    ctx.lineWidth = Math.max(2, ring * .018);
    ctx.beginPath();
    ctx.ellipse(0, 0, ring * .422, ring * .98, 0, .2, 2.95);
    ctx.stroke();
    ctx.restore();
  }
  const arrival = Math.max(0, 1 - Math.abs(age - 8.95) / .90);
  if (!calm && arrival > 0) {
    ctx.fillStyle = `rgba(177,219,255,${arrival * .23})`;
    ctx.fillRect(0, 0, width, height);
  }
  const rail = ctx.createLinearGradient(0, height * .6, 0, height);
  rail.addColorStop(0, "#080d1800");
  rail.addColorStop(1, "#080e1de8");
  ctx.fillStyle = rail;
  ctx.fillRect(0, height * .6, width, height * .4);
  ctx.restore();
  drawEpilogueStarMap(ctx, scene, width, height);
}

function drawCampaignVictoryFrame(seconds) {
  const scene = campaignVictory;
  if (scene?.stage !== "sequence") return false;
  if (windowActive && !document.hidden) {
    scene.age = Math.min(campaignEpilogueDuration, scene.age + seconds);
    updateBattlefield(seconds, true);
  }
  paintCampaignVictory(scene);
  const progress = Math.floor(scene.age * 20) / 20;
  if (campaignEpilogueProgress.value !== progress) campaignEpilogueProgress.value = progress;
  updateCampaignCaption(scene);
  if (scene.age >= campaignEpilogueDuration - 1e-6) finishCampaignVictory();
  return true;
}

function updateCampaignCaption(scene, force = false) {
  const line = scene.age < 4.3 ? 0 : scene.age < 9.7 ? 1 : 2;
  if (scene.caption === line && !force) return;
  scene.caption = line;
  campaignEpilogueLine.textContent = [
    tr("引航：母巢信号消失，星门开始解锁。", "Pilgrim: Hive signal lost. The gate is unlocking."),
    tr("渡鸦：我们已经到家。星门为你留着。", "Raven: We're home. The gate is open for you."),
    tr("引航：十一处航道全部恢复。欢迎返航。", "Pilgrim: All eleven waypoints restored. Welcome home.")
  ][line];
}

function renderCampaignReport(result) {
  const grade = campaignGrade(result);
  campaignReportGrade.textContent = grade;
  campaignReportGrade.dataset.grade = grade;
  campaignReportGrade.setAttribute("aria-label", tr(`评级 ${grade}`, `Rating ${grade}`));
  const clean = result.bossRecords.filter(record => record.hitCount === 0).length;
  const archive = sortieProfile.data;
  const best = (result.assisted ? archive.assisted : archive.campaign).bestScore;
  const metrics = sortieMetrics([
    [tr("战役得分", "Campaign score"), result.score],
    [tr("通关时间", "Clear time"), sortieTime(result.seconds)],
    [tr("本局阵亡", "Deaths this run"), Number(result.died)],
    [tr("最高连击", "Best combo"), result.combo],
    [tr("无伤首领", "No-hit bosses"), `${clean}/11`],
    [result.assisted ? tr("辅助最佳", "Assisted best") : tr("历史最高分", "Campaign best"), best],
  ]);
  const records = [
    sortieWord(result.difficulty),
    result.assisted ? tr("辅助出击", "Assisted sortie") : "",
    result.newScore ? tr("刷新最高分", "New score record") : "",
    result.newTime ? tr("刷新最快通关", "New clear time") : ""
  ].filter(Boolean).join(" · ");
  const grid = sortieElement("ul", "", "campaign-boss-grid");
  for (let type = 0; type < bossTypes.length; type++) {
    const item = sortieElement("li", "", "campaign-boss-card");
    const record = result.bossRecords.find(sample => sample.type === type);
    item.dataset.cleared = String(Boolean(record));
    const art = sortieElement("img");
    art.alt = "";
    art.loading = "lazy";
    art.src = `assets/aliens/boss-${String(type + 1).padStart(2, "0")}.webp`;
    item.append(art, sortieElement("strong", bossTypeName(type)),
      sortieElement("small", !record ? tr("未击破", "Open") : record.hitCount ? tr("击破", "Cleared") : tr("无伤击破", "No hit")));
    grid.append(item);
  }
  const thresholds = tr(
    `本局中招 ${result.hits} 次。S 级要求不超过 4 次且无伤击破至少 6 只首领，A 级要求不超过 10 次，其余通关为 B 级。`,
    `Hits taken: ${result.hits}. S requires at most 4 hits and 6 no-hit boss clears. A requires at most 10 hits. Other clears earn B.`);
  const unlock = result.unlocks.map(type => bossTypeName(type)).join(tr("、", ", "));
  campaignReportContent.replaceChildren(metrics, sortieElement("p", records, "campaign-record-line"), grid,
    sortieElement("p", thresholds, "sortie-explainer"));
  if (typeof appendNewAwards === "function") appendNewAwards(campaignReportContent, result);
  if (unlock) campaignReportContent.append(sortieElement("p", tr(`新练习解锁 ${unlock}`, `Practice unlocked ${unlock}`), "campaign-record-line"));
}

function refreshCampaignVictory() {
  if (!campaignVictory) return;
  campaignEpilogueTitle.textContent = tr("余光归航", "The Last Light Home");
  campaignEpilogueProgress.setAttribute("aria-label", tr("结局演出进度", "Epilogue progress"));
  campaignEpilogueSkip.textContent = tr("跳过演出", "Skip epilogue");
  campaignReportTitle.textContent = tr("异形战役通关", "Campaign Cleared");
  campaignReportRetry.textContent = tr("再次出击", "Fly again");
  campaignReportChallenges.textContent = tr("挑战模式", "Challenges");
  campaignReportHangar.textContent = tr("返回机库", "Return to hangar");
  if (campaignVictory.stage === "report") renderCampaignReport(campaignVictory.result);
  else updateCampaignCaption(campaignVictory, true);
}

campaignEpilogueSkip?.addEventListener("click", finishCampaignVictory);
campaignReportRetry?.addEventListener("click", () => startBattleWithSound(sortieReplayOptions()));
campaignReportHangar?.addEventListener("click", () => showScreen("menu"));
campaignReportChallenges?.addEventListener("click", () => { showScreen("menu"); openSortieConsole("challenges"); });
window.addEventListener("keydown", event => {
  if (campaignVictory?.stage === "sequence" && event.code === "Escape" && !event.repeat) {
    event.preventDefault();
    finishCampaignVictory();
  }
});
