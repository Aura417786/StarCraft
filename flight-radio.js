"use strict";

// The bridge teaches counters. Enemy transmissions and a missing wing tell a separate story.
const flightRadioLines = [
  [["母舰 AI · 引航", "潮头会推走战机。沿水幕的开口同向飞。", "Nav AI · Pilgrim", "Ride with the current through the opening in the water wall."],
   ["失联友军 · 渡鸦", "我在第一道压力门后面。收到请回一个短码。", "Missing wing · Raven", "I'm beyond the first pressure gate. Send a short pulse if you hear me."]],
  [["母舰 AI · 引航", "骨笼的牙齿会合拢。先钻进两排骨板之间。", "Nav AI · Pilgrim", "The ribs will close. Slip between the two rows before they lock."],
   ["失联友军 · 渡鸦", "那副骨架里有我们的导航信标。这里在回收战机。", "Missing wing · Raven", "That skeleton held our navigation beacon. Something here recycles ships."]],
  [["母舰 AI · 引航", "熔岩会沿航道灌过来。退到隆起的玄武岩后。", "Nav AI · Pilgrim", "Lava will fill the lane. Fly behind the rising basalt."],
   ["失联友军 · 渡鸦", "热流让封舱松动了。我能把被困的人带出来。", "Missing wing · Raven", "The heat loosened a bulkhead. I can get the people inside out."]],
  [["母舰 AI · 引航", "打断发光的丝结，绷紧的线就会垂下来。", "Nav AI · Pilgrim", "Shoot the glowing knots to drop the tension from the web."],
   ["失联友军 · 渡鸦", "这儿不是蛛网，是条通讯网。它们在模仿我们的呼号。", "Missing wing · Raven", "This isn't a web. It's a radio network, and it's using our call signs."]],
  [["母舰 AI · 引航", "巨螯锁的是你刚才的航迹。别留在两边夹缝里。", "Nav AI · Pilgrim", "The claws lock to your last course. Move before they cross."],
   ["失联友军 · 渡鸦", "失联名单里的人都在我这里。我们有船，却没有回去的坐标。", "Missing wing · Raven", "I have everyone on the missing list. We have a ship but no coordinates home."]],
  [["母舰 AI · 引航", "镜面会把子弹送回来。从亮边外侧绕过去。", "Nav AI · Pilgrim", "The mirror sends fire back. Go around the bright edge."],
   ["失联友军 · 渡鸦", "镜里有一条假航线。用我发的单脉冲校对。", "Missing wing · Raven", "One reflection is a false course. Check it against my single pulse."]],
  [["母舰 AI · 引航", "震鳗的尾部节点在给导线供电。切断它。", "Nav AI · Pilgrim", "The Wyrm's tail powers the conduit. Break the link."],
   ["失联友军 · 渡鸦", "导线熄灭了。你打下来的每个信号都给了我们一个坐标。", "Missing wing · Raven", "The conduit went dark. Every signal you stop gives us another coordinate."]],
  [["母舰 AI · 引航", "孢囊会在地面留下感染区。趁它还没开就击碎。", "Nav AI · Pilgrim", "Pods seed blight across the arena. Shatter them before they open."],
   ["失联友军 · 渡鸦", "孢群停了。逃生舱里的孩子能看见星星了。", "Missing wing · Raven", "The spores are gone. The kids in the lifeboat can see the stars again."]],
  [["母舰 AI · 引航", "别顺着牵引飞。先挣脱，再从撕裂带的侧面进攻。", "Nav AI · Pilgrim", "Thrust across the pull, then attack from the side of the rift."],
   ["失联友军 · 渡鸦", "船钟重新走动了。星门的两端已经对上。", "Missing wing · Raven", "Our clocks are moving again. Both ends of the gate are aligned."]],
  [["母舰 AI · 引航", "中央节点在给旁边两路供电。截断正在通电的链。", "Nav AI · Pilgrim", "The central relay feeds both branches. Break the live link."],
   ["失联友军 · 渡鸦", "我们把最后一组坐标传回母舰。只剩你面前的信号。", "Missing wing · Raven", "We've sent the final coordinates to the carrier. Only your contact remains."]],
  [["母舰 AI · 引航", "合生体的肢节各自出招。先破坏正在亮起的肢节。", "Nav AI · Pilgrim", "Each limb attacks on its own. Strike the one lighting up."],
   ["失联友军 · 渡鸦", "你切断了母巢。我们在门的另一边等你。", "Missing wing · Raven", "The hive is severed. We'll be waiting on the other side."]],
];

const flightRadioEnemy = [
  ["潮水会保存你的声音。", "The tide will keep your voice."],
  ["骨头记得每一条逃跑的路线。", "The bones remember every escape route."],
  ["你们的金属也会熔化。", "Your metal will melt as well."],
  ["我已经织好了你的回答。", "I've already woven your reply."],
  ["交出航迹。我们会替你飞。", "Give us your course. We will fly it for you."],
  ["另一个你，比你更相信我。", "The other you trusts me more."],
  ["你身体里的水听得见电。", "The water in your body hears the current."],
  ["想活下去，就替我播种。", "If you would live, sow for me."],
  ["出口一直在我的喉咙里。", "The exit has always been in my throat."],
  ["渡鸦的声音，也是我的声音。", "Raven's voice is mine, too."],
  ["十颗心跳共用一张嘴。", "Ten heartbeats share one mouth."],
];

const flightRadioMilestones = {
  0: ["引航已确认失联小队的求救来自深渊。先打开压力门，救援舰才能越过边界。",
    "Pilgrim has traced the missing wing's signal into the abyss. Open the pressure gate so rescue ships can cross."],
  4: ["渡鸦收到。前五个信号属于同一个母巢，每击破一只，就能把一段星门航线拼回来。",
    "Raven copies. The first five contacts all belong to one hive. Each defeat restores a piece of the gate route."],
  10: ["救援船已经过门。母巢在用十个残存信号阻断你的返航，切断最后一条链，我们就能回家。",
    "The rescue ship is through. The hive is using ten surviving signals to close your route home. Break the final link."],
};

let flightRadio = null;
let flightRadioWarning = null;
const flightRadioQueue = [];
const flightRadioPanel = document.querySelector("#flight-radio");

function resetFlightRadio() {
  flightRadio = null;
  flightRadioWarning = null;
  flightRadioQueue.length = 0;
  drawFlightRadio(0);
}

function beginFlightRadio(kind, type, duration = 3) {
  if (kind === "incoming") {
    if (type === flightRadioWarning) return;
    flightRadioWarning = type;
  }
  if (!flightRadioPanel || sortieSettings.radio === false || !flightRadioLines[type]) return;
  flightRadioQueue.length = 0;
  const incoming = kind === "incoming";
  const [cn, en] = flightRadioEnemy[type];
  if (incoming) {
    flightRadioQueue.push({ line: ["敌方 · 母巢频段", cn, "Hostile · Hive frequency", en], duration: 2.55, pan: .38 });
    const milestone = flightRadioMilestones[type];
    if (milestone && sortieMode() === "campaign") flightRadioQueue.push({
      line: ["联合救援频道", milestone[0], "Joint rescue channel", milestone[1]], duration: 5.9, pan: -.08 });
  }
  playFlightRadioLine({ line: flightRadioLines[type][Number(!incoming)], duration: Math.max(3.05, duration),
    pan: incoming ? -.28 : .16 }, kind);
}

function playFlightRadioLine(entry, kind) {
  flightRadio = { ...entry, kind, age: 0, copy: "", text: "" };
  gameAudio.radioCue?.(kind, entry.pan);
}

function drawFlightRadio(seconds) {
  const panel = flightRadioPanel;
  if (!panel) return;
  if (sortieSettings.radio === false || state !== "battle") {
    flightRadioQueue.length = 0;
    flightRadio = null;
  }
  if (flightRadio) {
    if (canAnimateCombatEffects() && !pauseView && !evolution.pending) flightRadio.age += seconds;
    if (flightRadio.age >= flightRadio.duration) {
      const queued = flightRadioQueue.shift();
      if (queued) playFlightRadioLine(queued, flightRadio.kind);
      else flightRadio = null;
    }
  }
  if (panel.hidden === Boolean(flightRadio)) panel.hidden = !flightRadio;
  if (!flightRadio) return;
  const { line } = flightRadio;
  const speaker = tr(line[0], line[2]);
  const copy = tr(line[1], line[3]);
  if (flightRadio.copy !== copy) {
    flightRadio.copy = copy;
    panel.querySelector(".radio-speaker").textContent = speaker;
    panel.querySelector(".radio-announcement").textContent = speaker + ": " + copy;
  }
  const text = quietCombatMotion() ? copy : copy.slice(0, Math.floor(flightRadio.age * (gameLanguage === "en" ? 42 : 23)) + 1);
  if (flightRadio.text !== text) {
    flightRadio.text = text;
    panel.querySelector(".radio-line").textContent = text;
  }
}
