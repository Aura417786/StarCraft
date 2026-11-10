"use strict";

// Control calls out a recognizable danger before contact; the pilot answers on clear.
const flightRadioLines = [
  [["舰桥", "压力表满格。别迎着潮头飞。", "Control", "Pressure's off the scale. Stay out of the tide."],
   ["赤焰航队", "海底安静了。我们继续向下。", "Breaker Flight", "The deep is quiet. We're going down." ]],
  [["舰桥", "它在收拢骨翼。提防两翼夹击。", "Control", "Bone wings closing. Watch both flanks."],
   ["赤焰航队", "骨架散了。把航线从残骸中间穿过去。", "Breaker Flight", "Skeleton's down. Chart a path through it." ]],
  [["舰桥", "熔核正在升温。它的吐息会封住航道。", "Control", "The core is heating. Its breath will seal lanes."],
   ["赤焰航队", "最后一块余烬熄了。护板还撑得住。", "Breaker Flight", "Last ember's out. Our plating held." ]],
  [["舰桥", "裂隙两边都有丝线。先找织网的空格。", "Control", "Threads on both sides. Find the gap in the web."],
   ["赤焰航队", "最后一根丝断了，航道恢复。", "Breaker Flight", "Last thread cut. The lane is ours." ]],
  [["舰桥", "巨螯在追踪航迹。它合拢前就变向。", "Control", "Claws are tracking you. Turn before they close."],
   ["赤焰航队", "锁脉信号断了。推进器归我控制。", "Breaker Flight", "Lock signal's gone. I have the thrusters." ]],
  [["舰桥", "有两道回波。别追镜像，等真身露面。", "Control", "Two echoes. Hold for the real one."],
   ["赤焰航队", "反射没了。前方只剩一条航线。", "Breaker Flight", "No more reflections. One route ahead." ]],
  [["舰桥", "震鳗在引电。看到导线就换一条航道。", "Control", "The Wyrm is charging. Switch lanes at the arcs."],
   ["赤焰航队", "最后一次放电结束。仪表回来了。", "Breaker Flight", "Discharge is over. Instruments are back." ]],
  [["舰桥", "孢囊在连成一片。别让它把你围住。", "Control", "Spore pods are linking. Don't get boxed in."],
   ["赤焰航队", "孢群不再繁殖。航灯能照得更远了。", "Breaker Flight", "The spores stopped spreading. Lights are clear." ]],
  [["舰桥", "别守着准星。把战机从引力圈里拉出来。", "Control", "Forget your aim. Thrust clear of the gravity well."],
   ["赤焰航队", "奇点闭合。船钟重新走动了。", "Breaker Flight", "Singularity shut. The clock's moving again." ]],
  [["舰桥", "神经王在同步脉冲。留一手护盾。", "Control", "The Leviathan is syncing pulses. Save a shield."],
   ["赤焰航队", "神经网络断开。频道里只剩你的声音。", "Breaker Flight", "Neural grid severed. You're all I hear now." ]],
  [["舰桥", "十个信号合成了一个。看到束缚就离开落点。", "Control", "Ten signals, one body. Break away from the bind."],
   ["赤焰航队", "合生体沉默了。舰桥，可以回家了。", "Breaker Flight", "The Confluence is silent. Control, we're coming home." ]],
];

let flightRadio = null;
let flightRadioWarning = null;
const flightRadioPanel = document.querySelector("#flight-radio");

function resetFlightRadio() {
  flightRadio = null;
  flightRadioWarning = null;
  drawFlightRadio(0);
}

function beginFlightRadio(kind, type, duration = 3) {
  if (kind === "incoming") {
    if (type === flightRadioWarning) return;
    flightRadioWarning = type;
  }
  if (!flightRadioPanel || sortieSettings.radio === false || !flightRadioLines[type]) return;
  flightRadio = { kind, type, duration, age: 0, copy: "", text: "" };
  gameAudio.radioCue?.(kind, kind === "incoming" ? -.28 : .16);
}

function drawFlightRadio(seconds) {
  const panel = flightRadioPanel;
  if (!panel) return;
  if (sortieSettings.radio === false || state !== "battle") flightRadio = null;
  if (flightRadio) {
    if (canAnimateCombatEffects() && !pauseView && !evolution.pending) flightRadio.age += seconds;
    if (flightRadio.age >= flightRadio.duration) flightRadio = null;
  }
  panel.hidden = !flightRadio;
  if (!flightRadio) return;
  const line = flightRadioLines[flightRadio.type][Number(flightRadio.kind === "cleared")];
  const speaker = tr(line[0], line[2]);
  const copy = tr(line[1], line[3]);
  if (flightRadio.copy !== copy) {
    flightRadio.copy = copy;
    panel.querySelector(".radio-speaker").textContent = speaker;
    panel.querySelector(".radio-announcement").textContent = speaker + ": " + copy;
  }
  const text = quietCombatMotion() ? copy : copy.slice(0, Math.floor(flightRadio.age * (gameLanguage === "en" ? 36 : 21)) + 1);
  if (flightRadio.text !== text) {
    flightRadio.text = text;
    panel.querySelector(".radio-line").textContent = text;
  }
}
