"use strict";

// 仅本展示入口使用预设进度。正式 index.html 不载入本脚本。
const showcase = {
  running: false,
  elapsed: 0,
  scene: -1,
  sceneStarted: 0,
  events: new Set(),
  recorder: null,
  chunks: [],
  stream: null,
  audioStream: null,
  downloadUrl: "",
  stopTimer: null,
  images: [],
};
const showcasePanel = document.querySelector("#showcase-controls");
const showcaseStatus = document.querySelector("#showcase-status");
const showcaseWatch = document.querySelector("#showcase-watch");
const showcaseRecord = document.querySelector("#showcase-record");
const showcaseDownload = document.querySelector("#showcase-download");
const showcaseScenes = [
  { start: 0, title: "渊潮母体，深空来客", subtitle: "触须随身躯呼吸，蓄力时留意发亮的器官", sector: 3, time: 96 },
  { start: 7, title: "连击点燃暴走", subtitle: "持续击杀，释放更快、更猛烈的主炮", sector: 1, time: 60 },
  { start: 13, title: "进化，决定你的战斗方式", subtitle: "破阵翼刃 · 星隼僚机 · 赤金壁垒", sector: 0, time: 180 },
  { start: 20, title: "群渊合生体", subtitle: "预判控制与追击，抓住连招间的反击时机", sector: 4, time: 680 },
  { start: 27, title: "星际突围", subtitle: "电脑浏览器 · 免费试玩 · 挑战你的第一只首领", sector: 0, time: 0 },
];

// 旁路录制合成器的最终输出，保留原有扬声器播放和限幅器。
if (window.AudioNode && window.AudioContext) {
  const originalConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (destination, ...rest) {
    const result = originalConnect.call(this, destination, ...rest);
    if (destination === this.context.destination) {
      if (!this.context.showcaseDestination) {
        this.context.showcaseDestination = this.context.createMediaStreamDestination();
      }
      originalConnect.call(this, this.context.showcaseDestination);
      showcase.audioStream = this.context.showcaseDestination.stream;
    }
    return result;
  };
}

const showcaseOriginalActive = isBattleActive;
isBattleActive = function () {
  if (!showcase.running) return showcaseOriginalActive();
  return state === "battle" && !pauseView && !evolution.pending && !isBossPresentationPlaying() && !document.hidden;
};
const showcaseOriginalPlayerUpdate = updatePlayer;
updatePlayer = function (seconds) {
  if (!showcase.running) return showcaseOriginalPlayerUpdate(seconds);
  showcase.elapsed += Math.max(0, seconds);
  const sceneIndex = showcaseScenes.findLastIndex(scene => showcase.elapsed >= scene.start);
  if (sceneIndex !== showcase.scene) enterShowcaseScene(sceneIndex);
  if (!isBossPresentationPlaying()) updateShowcaseMovement(seconds);
};
const showcaseOriginalNotices = drawBattlefieldEventNotice;
drawBattlefieldEventNotice = function () {
  if (!showcase.running) return showcaseOriginalNotices();
  drawShowcaseTitles();
};

function showcaseOnce(key, after, action) {
  if (showcase.elapsed - showcase.sceneStarted < after || showcase.events.has(key)) return;
  showcase.events.add(key);
  action();
}

function enterShowcaseScene(index) {
  showcase.scene = index;
  showcase.sceneStarted = showcase.elapsed;
  showcase.events.clear();
  selectedFighter = "red";
  showScreen("battle");
  movementHint.hidden = true;
  pauseHint.hidden = true;
  enemyCooldown = powerupCooldown = nextBossTime = Infinity;
  battlefieldEvents.nextObject = battlefieldEvents.nextTransport = formationState.nextTime = Infinity;
  aceEncounter.nextTime = Infinity;
  const scene = showcaseScenes[index];
  battleTime = scene.time;
  battlefieldState.clock = scene.sector * sceneryRules.interval + 22;
  scenerySyncJourney();
  player.x = player.previousX = viewport.width * 0.18;
  player.y = player.previousY = viewport.height * 0.5;
  weapon.lanes = 4;
  weapon.tier = 2;
  weapon.damage = 3;
  weapon.speedLevel = 4;
  weapon.interval = 1 / (5 + 3 * 0.75);
  shield.charges = 2;
  ultimate.charges = 2;
  if (index === 0) {
    firingStyle.mode = "focus";
    spawnBoss(0);
    const arena = bossArena();
    boss.x = boss.previousX = arena.x;
    boss.y = boss.previousY = arena.y;
    boss.phase = "recover";
    boss.hp = boss.displayHp = 0.72;
    player.y = player.previousY = boss.y;
  } else if (index === 1) {
    momentum.count = momentum.best = 19;
    trySpawnFormation("command");
    updateFormations(1.4);
    if (formationState.active) formationState.active.x -= viewport.width * 0.28;
    for (const enemy of enemies) {
      enemy.x -= viewport.width * 0.28;
      enemy.previousX = enemy.x;
    }
    enemyCooldown = 0.5;
  } else if (index === 2) {
    evolution.pierce = 3;
    evolution.blast = 2;
    evolution.aegis = 1;
    enemyCooldown = 0.5;
    for (let i = 0; i < 4; i++) {
      spawnEnemy(i === 2 ? "armored" : "scout");
      const target = enemies.at(-1);
      target.x -= viewport.width * 0.18;
      target.previousX = target.x;
    }
  } else if (index === 3) {
    evolution.pierce = 2;
    evolution.aegis = 1;
    spawnBoss(10);
  } else {
    shotCooldown = Infinity;
    player.x = player.previousX = viewport.width * 0.5;
    player.y = player.previousY = viewport.height * 0.59;
  }
  updateEvolutionDisplay();
  updateFiringStyleDisplay();
  updateWeaponDisplay();
  updateShieldDisplay();
  updateUltimateDisplay();
  updateMomentumDisplay();
  canvas.focus({ preventScroll: true });
}

function updateShowcaseMovement(seconds) {
  player.previousX = player.x;
  player.previousY = player.y;
  let desiredY = viewport.height * 0.5;
  const age = showcase.elapsed - showcase.sceneStarted;
  if (showcase.scene === 0) {
    if (age < 2.8 && boss) {
      desiredY = boss.y;
    } else {
      desiredY += Math.sin(age * 1.2) * viewport.height * 0.11;
    }
    showcaseOnce("shield", 2.6, () => requestShield());
    showcaseOnce("ultimate", 4.3, () => requestUltimate());
  } else if (showcase.scene === 1 || showcase.scene === 2) {
    const nearest = enemies.filter(target => target.x > player.x + player.width)
      .sort((a, b) => a.x - b.x)[0];
    desiredY = nearest ? nearest.y : desiredY + Math.sin(age) * 65;
    if (showcase.scene === 2) showcaseOnce("shield", 0.8, () => requestShield());
  } else if (showcase.scene === 3) {
    desiredY = viewport.height * (0.5 + Math.sin(age * 1.2) * 0.18);
    showcaseOnce("shield", 4.4, () => requestShield());
    showcaseOnce("ultimate", 4.9, () => requestUltimate());
  } else {
    desiredY = viewport.height * 0.59;
  }
  const movement = player.speed * seconds * (ultimate.phase === "charging" ? 0.65 : 1);
  player.y = clamp(player.y + clamp(desiredY - player.y, -movement, movement), flightBounds.top, flightBounds.bottom);
}

function drawShowcaseTitles() {
  const scene = showcaseScenes[showcase.scene];
  if (!scene) return;
  const width = viewport.width;
  const height = viewport.height;
  const scale = Math.min(1.2, Math.max(0.65, width / 1280));
  context.save();
  const shade = context.createLinearGradient(0, 0, 0, height * 0.3);
  shade.addColorStop(0, "#02050bdb");
  shade.addColorStop(1, "#02050b00");
  context.fillStyle = shade;
  context.fillRect(0, 0, width, height * 0.3);
  context.fillStyle = "#ff6377";
  context.font = `600 ${12 * scale}px Consolas, sans-serif`;
  context.fillText("STAR BREAKER  /  ALIEN CAMPAIGN", width * 0.045, height * 0.065);
  context.fillStyle = "#f1f4fc";
  context.font = `700 ${35 * scale}px Microsoft YaHei, sans-serif`;
  context.fillText(scene.title, width * 0.045, height * 0.13);
  context.fillStyle = "#b5c4d9";
  context.font = `${16 * scale}px Microsoft YaHei, sans-serif`;
  context.fillText(scene.subtitle, width * 0.045, height * 0.175);
  context.font = `${11 * scale}px Microsoft YaHei, sans-serif`;
  context.fillStyle = "#bac8d1aa";
  context.fillText("预设进度演示 · 正式游戏引擎画面", width * 0.045, height * 0.95);
  context.textAlign = "right";
  context.fillText("WASD 移动   SHIFT 姿态   SPACE 贯星炮   V 护盾", width * 0.955, height * 0.95);
  context.fillStyle = "#ff6377";
  context.fillRect(0, height - 3, width * Math.min(1, showcase.elapsed / 30), 3);
  context.restore();
}

function finishShowcase() {
  if (!showcase.running) return;
  showcase.running = false;
  document.body.dataset.showcaseActive = "false";
  window.clearTimeout(showcase.stopTimer);
  if (showcase.recorder?.state === "recording") showcase.recorder.stop();
  showcaseStatus.textContent = showcase.recorder ? "演示录制完成，正在整理视频…" : "30 秒演示完成。可重新观看或录制。";
  showcaseWatch.disabled = showcaseRecord.disabled = false;
  gameAudio.sync(false, false);
  showScreen("menu");
}

async function startShowcase(record) {
  showcaseWatch.disabled = showcaseRecord.disabled = true;
  showcaseDownload.hidden = true;
  showcaseStatus.textContent = "正在准备实机素材…";
  try {
    const audioReady = gameAudio.unlock();
    await Promise.all(Array.from(document.images, image => image.decode().catch(() => {})));
    if (!showcase.images.length) {
      for (let index = 0; index < battlefieldSectors.length; index++) showcase.images.push(sceneryLayer(index));
      await Promise.all(showcase.images.map(layer => layer.image.decode()));
      const originalSceneryLayer = sceneryLayer;
      sceneryLayer = function (index) { return showcase.images[index] || originalSceneryLayer(index); };
    }
    const ready = await audioReady;
    if (!ready) throw new Error("请允许浏览器播放声音后重试。");
    gameAudio.setMuted(false);
    showcase.elapsed = 0;
    showcase.scene = -1;
    showcase.chunks = [];
    showcase.recorder = null;
    showcase.running = true;
    document.body.dataset.showcaseActive = "true";
    enterShowcaseScene(0);
    if (record) beginShowcaseRecording();
    showcase.stopTimer = window.setTimeout(finishShowcase, 30000);
  } catch (error) {
    showcase.running = false;
    document.body.dataset.showcaseActive = "false";
    showcaseWatch.disabled = showcaseRecord.disabled = false;
    showcaseStatus.textContent = String(error.message || error);
  }
}

function beginShowcaseRecording() {
  if (!canvas.captureStream || !window.MediaRecorder) throw new Error("此浏览器暂不支持录制，请使用最新版 Edge 或 Chrome。");
  const tracks = canvas.captureStream(30).getVideoTracks();
  if (showcase.audioStream) tracks.push(...showcase.audioStream.getAudioTracks());
  showcase.stream = new MediaStream(tracks);
  const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    .find(type => MediaRecorder.isTypeSupported(type));
  showcase.recorder = new MediaRecorder(showcase.stream, { mimeType, videoBitsPerSecond: 6500000 });
  showcase.recorder.addEventListener("dataavailable", event => {
    if (event.data.size) showcase.chunks.push(event.data);
  });
  showcase.recorder.addEventListener("stop", () => {
    const recording = new Blob(showcase.chunks, { type: mimeType });
    if (showcase.downloadUrl) URL.revokeObjectURL(showcase.downloadUrl);
    showcase.downloadUrl = URL.createObjectURL(recording);
    showcaseDownload.href = showcase.downloadUrl;
    showcaseDownload.download = "星际突围-v13-30秒实机演示.webm";
    showcaseDownload.hidden = false;
    const soundLabel = showcase.stream.getAudioTracks().length ? "含原创游戏音频" : "无音轨";
    showcaseStatus.textContent = `录制完成 · ${(recording.size / 1024 / 1024).toFixed(1)} MB · ${soundLabel}`;
    for (const track of showcase.stream.getVideoTracks()) track.stop();
  });
  showcase.recorder.start(250);
}

showcaseWatch.addEventListener("click", () => startShowcase(false));
showcaseRecord.addEventListener("click", () => startShowcase(true));
document.addEventListener("visibilitychange", () => {
  if (document.hidden && showcase.running) {
    finishShowcase();
    showcaseStatus.textContent = "标签页被隐藏，演示已停止。请保持此页可见后重新录制。";
  }
});
