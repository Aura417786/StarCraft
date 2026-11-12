"use strict";

// Times are seconds on the same clock as the camera and the score.
const openingDuration = 146;
const openingCuts = [
  { start: 0, art: "earth", lens: [1.04, 1.12], pan: [-.02, .01] },
  { start: 12, art: "earthSignal", lens: [1.12, 1.24], pan: [.02, -.04] },
  { start: 23, art: "survey", lens: [1, 1], pan: [0, 0] },
  { start: 33, art: "lab", lens: [1.04, 1.08], pan: [-.02, .02] },
  { start: 35.2, art: "command", lens: [1.02, 1.12], pan: [.045, .012] },
  { start: 47, art: "contact", lens: [1.16, 1.29], pan: [.04, -.03] },
  { start: 59, art: "command", lens: [1.18, 1.31], pan: [.11, .024], pivot: .28 },
  { start: 71, art: "brief", lens: [1, 1], pan: [0, 0] },
  { start: 83, art: "hangar", lens: [1.02, 1.07], pan: [-.015, .005] },
  { start: 95, art: "systems", lens: [1.08, 1.17], pan: [0, .025] },
  { start: 108, art: "crew", lens: [1.02, 1.12], pan: [-.021, .011] },
  { start: 121, art: "lookback", lens: [1.05, 1.16], pan: [.038, .019], pivot: .31 },
  { start: 127, art: "helmet", lens: [1.07, 1.13], pan: [.014, -.01], pivot: .31 },
  { start: 130.5, art: "canopy", lens: [1.14, 1.09], pan: [-.025, .018], pivot: .31 },
  { start: 134.3, art: "launch", lens: [1.05, 2.9], pan: [0, 0] },
  { start: 139.15, art: "formation", lens: [1, 1], pan: [0, 0] },
];

const openingDialogue = [
  [1.4, 6.8, "研究队长", "Research lead", "宇宙很安静。我们曾以为，那是因为附近没有人。", "Space was quiet. We used to think no one was out there."],
  [7.1, 12.6, "研究队长", "Research lead", "黑暗森林里，寂静可能只意味着，大家都在等别人先出声。", "In a dark forest, silence can mean everyone is waiting for someone else to make a sound."],
  [14.4, 21.3, "研究队长", "Research lead", "三个月前，我们向深空发出一束校准脉冲。昨夜，那束光回来了。", "Three months ago, we sent a calibration pulse into deep space. Last night, it came back."],
  [24.3, 29.2, "观测员", "Observer", "回波绕开了三颗探针。它在主动寻找发射源。", "The return signal passed around three probes. It is looking for the source."],
  [29.6, 34.6, "观测员", "Observer", "它锁定的坐标……是地球。", "The coordinates it locked onto… are Earth."],
  [36, 41.8, "研究队长", "Research lead", "把回波和轨道实况叠在一起。看它的边缘。", "Overlay the echo on the orbital feed. Look at the edges."],
  [42.3, 47.7, "观测员", "Observer", "队长，那些东西在呼吸。我们扫到十一道生命信号。", "Lead, those things are breathing. I count eleven life signatures."],
  [49.4, 54.3, "调度", "Control", "第一道防线失联。生物舰群正在绕向背日面。", "First defense line is down. The fleet is circling to Earth's night side."],
  [54.8, 59.7, "调度", "Control", "轨道站还有人。让他们撤，五分钟也好。", "There are still people on the orbital station. Get them out. Even five minutes would help."],
  [61.2, 65.6, "观测员", "Observer", "您带的是研究队。我们还没做完那架试验机的出击测试。", "You lead a research team. The prototype hasn't passed its sortie tests."],
  [66.1, 70.9, "研究队长", "Research lead", "航电和武器是我调的。把飞行许可切到手动。", "I tuned the avionics and the weapons. Switch launch clearance to manual."],
  [72.2, 77.1, "研究队长", "Research lead", "我从侧面接近。等它们转向，你们就把撤离船引到背光的一侧。", "I'll come in from the flank. When they turn, route the evacuation ships into Earth's shadow."],
  [77.8, 82.4, "调度", "Control", "收到。撤离通道就绪。机库给你放行。", "Copy. Evacuation corridor is ready. The hangar is clearing you to launch."],
  [84.7, 90.4, "研究队长", "Research lead", "我看着这架战机从图纸变成实物。没想到它第一次出击，就是今天。", "I watched this fighter go from a drawing to a real ship. I never imagined its first sortie would be today."],
  [95.8, 100.5, "机库控制", "Hangar control", "磁悬浮轨已通电。座舱、推进器和主武器检查通过。", "Maglev rails powered. Cockpit, propulsion and main weapon check out."],
  [101.5, 106.7, "研究队长", "Research lead", "预充一次最大功率。穿过它们的队形后，把战机交给我。", "Give me one charge at full power. Once we're through their formation, hand the fighter over to me."],
  [109.6, 115.1, "观测员", "Observer", "队长，地面那些人还不知道发生了什么。", "Lead, the people down there still don't know what's happened."],
  [116.2, 120.5, "研究队长", "Research lead", "那就让他们照常看见明天的日出。", "Then let's make sure they see tomorrow's sunrise."],
  [121.5, 125.8, "机库控制", "Hangar control", "方形闸门开启。出击航线已清空。", "Launch door open. Your flight path is clear."],
  [140.2, 142.8, "调度", "Control", "它们看见你了。", "They see you."],
  [143.0, 144.7, "研究队长", "Research lead", "正合我意。", "Good."],
];

const openingImages = {
  earth: "assets/intro/earth.webp",
  hangar: "assets/intro/hangar.webp",
  lab: "assets/intro/lab.webp",
  command: "assets/intro/command.webp",
  crew: "assets/intro/crew.webp",
  lookback: "assets/intro/lookback.webp",
  helmet: "assets/intro/helmet.webp",
  orbit: "assets/scenery/orbit-galaxy.webp",
  red: "assets/red-fighter.png",
  blue: "assets/fighters/azure.webp",
  yellow: "assets/fighters/auric.webp",
  scout: "assets/ships/scout-sleek.webp",
  armored: "assets/ships/armored-sleek.webp",
  gunner: "assets/ships/gunner-sleek.webp",
  ...Object.fromEntries(Array.from({ length: 11 }, (_, i) =>
    [`alien${i}`, `assets/aliens/boss-${String(i + 1).padStart(2, "0")}.webp`])),
};
