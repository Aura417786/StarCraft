"use strict";

// 所有声音在浏览器内合成，不下载音频；首次点击后才创建 AudioContext。
const gameAudio = (() => {
  const EPSILON = 0.0001;
  // 留出短淡出的余量，密集弹幕中实际同时工作的节点也保持在小规模。
  const MAX_VOICES = 42;
  const voices = new Set();
  const fadingVoices = new Set();
  let audio = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let noiseBuffer = null;
  let muted = false;
  let active = false;
  let bossActive = false;
  let enraged = false;
  let warningActive = false;
  let cinematicActive = false;
  let comboLayer = 0;
  let overdriveMusic = false;
  let musicTheme = null;
  let disposed = false;
  let musicPlaying = false;
  let scheduler = null;
  let nextStepTime = 0;
  let musicStep = 0;
  let lastShotTime = -Infinity;
  let lastExplosionTime = -Infinity;
  let lastBossExplosionTime = -Infinity;
  let lastWarningTime = -Infinity;
  let lastEnrageTime = -Infinity;
  let lastOverdriveTime = -Infinity;
  let lastPerfectShieldTime = -Infinity;
  const lastBossAttack = { volley: -Infinity, beam: -Infinity, summon: -Infinity, burst: -Infinity };

  function disconnect(node) {
    try { node.disconnect(); } catch { /* 已断开的节点无需再处理。 */ }
  }
  function canPlay() {
    return !!audio && audio.state === "running" && active && !muted && !disposed;
  }
  function smoothGain(node, value, duration = 0.035) {
    if (!audio || !node) return;
    const time = audio.currentTime;
    node.gain.cancelScheduledValues(time);
    node.gain.setValueAtTime(node.gain.value, time);
    node.gain.linearRampToValueAtTime(value, time + duration);
  }
  function retireVoice(voice, fade = 0.025) {
    if (!audio || !voices.has(voice)) return;
    voices.delete(voice);
    fadingVoices.add(voice);
    const time = audio.currentTime;
    voice.gain.gain.cancelScheduledValues(time);
    voice.gain.gain.setValueAtTime(Math.max(EPSILON, voice.gain.gain.value), time);
    voice.gain.gain.linearRampToValueAtTime(0, time + fade);
    try { voice.source.stop(time + fade + 0.005); } catch { /* 自然结束后 stop 可以无效。 */ }
  }
  function stopVoices(bus = null) {
    for (const voice of Array.from(voices)) {
      if (!bus || voice.bus === bus) retireVoice(voice);
    }
  }
  function limitVoices(bus) {
    const sameBus = Array.from(voices).filter(voice => voice.bus === bus);
    const limit = bus === "music" ? 28 : bus === "ultimate" ? 8 : bus === "boss" ? 12 : 24;
    if (sameBus.length >= limit) retireVoice(sameBus[0], 0.008);
    if (voices.size >= MAX_VOICES) {
      // 蓄力与炮声有独立声部，密集射击和背景乐不会抢断它们。
      const expendable = Array.from(voices).find(voice => voice.bus === "sfx") ||
        Array.from(voices).find(voice => voice.bus !== "ultimate");
      if (expendable) retireVoice(expendable, 0.008);
      else return false;
    }
    // 淡出中的节点也计入真实预算；极端同帧爆炸不会积累数十个已退休但仍发声的节点。
    while (voices.size + fadingVoices.size >= 48) {
      const oldest = fadingVoices.values().next().value;
      if (!oldest) return false;
      fadingVoices.delete(oldest);
      try { oldest.source.stop(audio.currentTime); } catch { /* 声部可能刚刚自然结束。 */ }
      for (const node of oldest.chain) disconnect(node);
    }
    return true;
  }
  function note(options) {
    if (!canPlay()) return;
    const { bus = "sfx", time = audio.currentTime, duration = 0.1, volume = 0.08,
      frequency = 440, endFrequency = frequency, type = "triangle", noise = false,
      attack = 0.004, filterType = "lowpass", cutoff = 5000, pan = 0, sustain = false,
      crescendo = false, loopNoise = false, endCutoff = cutoff, resonance = 0.65 } = options;
    if (!limitVoices(bus)) return;
    const start = Math.max(time, audio.currentTime);
    const source = noise ? audio.createBufferSource() : audio.createOscillator();
    const gain = audio.createGain();
    const filter = audio.createBiquadFilter();
    const chain = [source, filter, gain];
    if (noise) { source.buffer = noiseBuffer; source.loop = loopNoise; }
    else {
      source.type = type;
      source.frequency.setValueAtTime(Math.max(1, frequency), start);
      source.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    }
    filter.type = filterType;
    filter.frequency.setValueAtTime(Math.min(cutoff, audio.sampleRate * 0.45), start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, Math.min(endCutoff, audio.sampleRate * 0.45)), start + duration);
    filter.Q.setValueAtTime(resonance, start);
    gain.gain.setValueAtTime(EPSILON, start);
    if (crescendo) {
      gain.gain.exponentialRampToValueAtTime(Math.max(EPSILON, volume * 0.1), start + 0.015);
      gain.gain.exponentialRampToValueAtTime(Math.max(EPSILON, volume), start + duration * 0.88);
    } else {
      gain.gain.exponentialRampToValueAtTime(Math.max(EPSILON, volume), start + Math.min(attack, duration * 0.3));
      if (sustain) gain.gain.setValueAtTime(volume, start + duration * 0.65);
    }
    gain.gain.exponentialRampToValueAtTime(EPSILON, start + duration);
    source.connect(filter); filter.connect(gain);
    if (audio.createStereoPanner) {
      const panner = audio.createStereoPanner();
      panner.pan.setValueAtTime(pan, start);
      gain.connect(panner); panner.connect(bus === "music" ? musicBus : sfxBus);
      chain.push(panner);
    } else gain.connect(bus === "music" ? musicBus : sfxBus);
    const voice = { source, gain, bus, chain };
    voices.add(voice);
    source.onended = () => {
      voices.delete(voice);
      fadingVoices.delete(voice);
      for (const node of chain) disconnect(node);
    };
    source.start(start);
    source.stop(start + duration + 0.01);
  }
  function midi(value) { return 440 * Math.pow(2, (value - 69) / 12); }
  function pluckedString(pitch, time, strength = 1, pan = -0.2) {
    // 短衰减与略带非整数倍的泛音，模拟拨弦；淡回声代替厚重混响。
    const frequency = midi(pitch);
    const partials = [[1, 0.105, 0.39], [2.003, 0.035, 0.23], [3.012, 0.019, 0.14]];
    for (const [ratio, volume, duration] of partials) note({ bus: "music", time,
      frequency: frequency * ratio, type: "sine", volume: volume * strength,
      duration, attack: 0.002, cutoff: 3600, pan });
    note({ bus: "music", time: time + 0.095, frequency, type: "sine",
      volume: 0.011 * strength, duration: 0.22, attack: 0.005, cutoff: 1800, pan: -pan });
  }
  function bambooFlute(pitch, time, duration, strength = 1) {
    const frequency = midi(pitch);
    note({ bus: "music", time, frequency, endFrequency: frequency * 1.0015,
      type: "sine", volume: 0.071 * strength, duration, attack: 0.04,
      cutoff: 2600, sustain: true, pan: 0.12 });
    note({ bus: "music", time, frequency: frequency * 2, type: "sine",
      volume: 0.01 * strength, duration: duration * 0.9, attack: 0.05, cutoff: 2800, pan: 0.12 });
    note({ bus: "music", time, noise: true, volume: 0.005 * strength,
      duration: Math.min(0.2, duration), attack: 0.035, filterType: "bandpass", cutoff: 1600, pan: 0.12 });
  }
  function warDrum(time, heavy = true, strength = 1) {
    // 鼓皮的瞬态、中频鼓腔和低频余震分开合成，避免只有一声薄脆的电子提示。
    note({ bus: "music", time, duration: heavy ? 0.48 : 0.23,
      frequency: heavy ? 91 : 168, endFrequency: heavy ? 42 : 90,
      type: "sine", volume: (heavy ? 0.38 : 0.19) * strength, cutoff: 650 });
    note({ bus: "music", time, noise: true, duration: heavy ? 0.17 : 0.1,
      volume: (heavy ? 0.12 : 0.065) * strength, filterType: "bandpass",
      cutoff: heavy ? 900 : 1400, endCutoff: heavy ? 230 : 550,
      pan: heavy ? 0 : -0.18 });
    if (heavy) note({ bus: "music", time, duration: 0.3, frequency: 132,
      endFrequency: 70, type: "triangle", volume: 0.06 * strength, cutoff: 500 });
  }
  function lowWarHorn(pitch, time, duration, strength = 1) {
    // 低沉号角与拨弦、笛声共用和声，保留国风旋律，同时给 Boss 战增加厚度。
    const frequency = midi(pitch);
    note({ bus: "music", time, duration, frequency, endFrequency: frequency * 0.996,
      type: "triangle", volume: 0.12 * strength, cutoff: 700, attack: 0.09, sustain: true });
    note({ bus: "music", time, duration: duration * 0.92, frequency: frequency * 1.997,
      type: "sine", volume: 0.035 * strength, cutoff: 850, attack: 0.12, sustain: true, pan: 0.18 });
  }
  function bronzeGong(time, strength = 1) {
    // 不规则频率比形成金属锣声，保持低音量、每数小节才强调一次。
    for (const [ratio, volume, duration] of [[1, 0.065, 1.05], [1.47, 0.035, 0.85], [2.08, 0.024, 0.65], [2.56, 0.014, 0.46]]) {
      note({ bus: "music", time, frequency: 174 * ratio, endFrequency: 173 * ratio,
        type: "sine", volume: volume * strength, duration, attack: 0.012, cutoff: 2600, pan: -0.1 });
    }
  }
  function adventureBeat(step, time, length) {
    // 原创八小节探索旋律：笛声与拨弦交替留白，连击只叠鼓，不从头重播旋律。
    const beat = step % 16;
    const bar = Math.floor(step / 16) % 8;
    const roots = [50, 46, 48, 45, 50, 53, 48, 50];
    const root = roots[bar];
    const melody = [
      [0, null, 7, 5, 3, null, 5, 7],
      [10, 7, null, 5, 3, null, 0, 3],
      [5, null, 7, 10, 12, null, 10, 7],
      [5, 3, null, 0, -2, null, 3, 5],
      [7, null, 12, 10, 7, 5, null, 3],
      [10, 12, null, 15, 12, null, 10, 7],
      [5, null, 10, 7, 5, null, 3, 0],
      [3, 5, null, 7, 3, null, 0, null],
    ];
    if (beat === 0 || beat === 8) {
      pluckedString(root + (beat === 8 ? 7 : 0), time, 0.64, -0.3);
      if (beat === 0) note({ bus: "music", time, duration: length * 13,
        frequency: midi(root - 12), type: "sine", volume: 0.043,
        cutoff: 220, attack: 0.08, sustain: true });
    }
    if (beat === 6 || beat === 14) pluckedString(root + 12, time, 0.37, 0.25);
    if (beat % 2 === 0) {
      const index = beat / 2;
      const pitch = melody[bar][index];
      if (pitch !== null) bambooFlute(74 + pitch, time,
        length * (index === 7 || melody[bar][index + 1] === null ? 3.1 : 1.65), 0.62);
    }
    if (!overdriveMusic) {
      if (comboLayer >= 1 && (beat === 0 || beat === 8)) warDrum(time, false, 0.36);
      if (comboLayer >= 2 && (beat === 4 || beat === 12)) warDrum(time, true, 0.43);
      if (comboLayer >= 3 && [3, 7, 11, 15].includes(beat)) warDrum(time, false, 0.48);
    }
  }
  function overdriveBeat(step, time, length) {
    if (!overdriveMusic) return;
    const beat = step % 16;
    const bar = Math.floor(step / 16) % 8;
    const root = [38, 34, 36, 33, 38, 41, 36, 38][bar];
    // 暴走依然沿用当前乐曲的和声，只增加鼓阵和脉冲低音；Boss 主旋律保持完整。
    const strength = bossActive ? 0.46 : 0.82;
    if ([0, 3, 6, 8, 11, 14].includes(beat)) warDrum(time, true, strength);
    if ([2, 5, 7, 10, 13, 15].includes(beat)) warDrum(time, false, strength * 0.85);
    if (beat % 4 === 0) note({ bus: "music", time, duration: length * 3.25,
      frequency: midi(root - 12), endFrequency: midi(root - 12) * 0.998,
      type: "triangle", volume: bossActive ? 0.06 : 0.095, cutoff: 280,
      attack: 0.008, sustain: true });
    if (beat === 0 && !bossActive) lowWarHorn(root, time, length * 6, 0.44);
  }
  function bossMusicBeat(step, time, length) {
    // 原创八小节国风奇幻战斗动机；D 小调五声音阶，并非任何现有游戏原曲。
    const beat = step % 16;
    const bar = Math.floor(step / 16) % 8;
    const root = [38, 34, 36, 33, 38, 41, 36, 38][bar];
    const melodies = [
      [0, 3, 7, null, 10, 7, 5, 3],
      [3, 5, 7, 12, null, 10, 7, 5],
      [5, 7, 10, null, 12, 10, 7, 3],
      [7, 10, 12, 15, 12, null, 10, 7],
      [12, 10, 7, 5, 3, 5, 7, 10],
      [10, 7, 5, null, 3, 0, 3, 5],
      [7, 12, 10, 7, 5, 3, 0, -2],
      [3, 5, 7, 3, 0, -2, 0, null],
    ];
    if (beat === 0) {
      note({ bus: "music", time, duration: length * 15.7,
        frequency: midi(root - 12), type: "sine", volume: enraged ? 0.15 : 0.12,
        cutoff: 260, attack: 0.1, sustain: true });
      lowWarHorn(root, time, length * 7, enraged ? 1.05 : 0.85);
      if (bar % 2 === 0) bronzeGong(time, enraged ? 1.15 : 0.98);
    }
    if ([0, 3, 6, 8, 11, 14].includes(beat)) warDrum(time, true, beat === 0 || beat === 8 ? 1 : 0.7);
    if ([4, 10, 12, 15].includes(beat)) warDrum(time, false, 0.85);
    if (enraged && [2, 5, 7, 13].includes(beat)) warDrum(time, false, 0.65);
    if (enraged && beat === 8) lowWarHorn(root + 7, time, length * 6, 0.65);
    if ((bar === 3 || bar === 7) && beat === 14) bronzeGong(time, 0.45);
    if (beat % (enraged ? 2 : 4) === 0) {
      const strings = [0, 7, 12, 15, 12, 7, 5, 10];
      const index = Math.floor(beat / (enraged ? 2 : 4));
      pluckedString(50 + strings[(index + bar % 3) % strings.length], time,
        enraged ? 1.08 : 0.86, beat % 4 === 0 ? -0.28 : 0.24);
    }
    if (beat % 2 === 0) {
      const index = beat / 2;
      const pitch = melodies[bar][index];
      if (pitch !== null) {
        const holds = index === 7 || melodies[bar][index + 1] === null;
        bambooFlute(62 + pitch, time, length * (holds ? 3.2 : 1.7), enraged ? 0.88 : 0.8);
      }
    }
  }
  function scheduleMusic() {
    scheduler = null;
    if (!musicPlaying || !canPlay() || warningActive || cinematicActive) return;
    const now = audio.currentTime;
    // 电脑卡顿或恢复后从当前时刻接着演奏，绝不追补积压的鼓点。
    if (nextStepTime < now - 0.04) nextStepTime = now + 0.02;
    while (nextStepTime < now + 0.12) {
      const tempo = bossActive ? (enraged ? 132 : 104) : (overdriveMusic ? 124 : 88);
      const length = 60 / tempo / 4;
      if (bossActive) bossMusicBeat(musicStep, nextStepTime, length);
      else adventureBeat(musicStep, nextStepTime, length);
      overdriveBeat(musicStep++, nextStepTime, length);
      nextStepTime += length;
    }
    scheduler = window.setTimeout(scheduleMusic, 40);
  }
  function stopMusic() {
    if (scheduler !== null) window.clearTimeout(scheduler);
    scheduler = null;
    if (!musicPlaying) return;
    musicPlaying = false;
    smoothGain(musicBus, 0, 0.035);
    stopVoices("music");
  }
  function reconcile() {
    if (!audio) return;
    if (!canPlay()) {
      stopMusic();
      stopVoices();
      return;
    }
    if (warningActive || cinematicActive) { stopMusic(); return; }
    const theme = bossActive ? "boss" : "adventure";
    if (theme !== musicTheme) {
      stopMusic();
      musicTheme = theme;
      musicStep = 0;
    }
    smoothGain(musicBus, bossActive ? 0.3 : overdriveMusic ? 0.29 : comboLayer ? 0.245 : 0.22, 0.14);
    if (musicPlaying) return;
    musicPlaying = true;
    nextStepTime = audio.currentTime + 0.025;
    scheduleMusic();
  }
  function initialize() {
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType || disposed) return false;
    audio = new AudioContextType();
    master = audio.createGain();
    sfxBus = audio.createGain();
    musicBus = audio.createGain();
    const limiter = audio.createDynamicsCompressor();
    master.gain.value = muted ? 0 : 0.68;
    sfxBus.gain.value = 0.65;
    musicBus.gain.value = 0;
    limiter.threshold.value = -16;
    limiter.knee.value = 15;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    sfxBus.connect(master); musicBus.connect(master); master.connect(limiter); limiter.connect(audio.destination);
    noiseBuffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * 2), audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
    audio.onstatechange = reconcile;
    return true;
  }
  function unlock() {
    if (disposed) return Promise.resolve(false);
    try {
      if (!audio && !initialize()) return Promise.resolve(false);
      const current = audio;
      return Promise.resolve(current.state === "suspended" ? current.resume() : undefined)
        .then(() => {
          if (audio !== current || disposed) return false;
          reconcile();
          return current.state === "running";
        }).catch(() => false);
    } catch {
      // 声卡不可用、浏览器不支持或自动播放被拦截时，游戏仍正常运行。
      if (audio) {
        try { Promise.resolve(audio.close()).catch(() => {}); } catch { /* 无需关闭。 */ }
      }
      audio = null;
      return Promise.resolve(false);
    }
  }
  function setMuted(value) {
    const next = !!value;
    if (muted === next) return;
    muted = next;
    smoothGain(master, muted ? 0 : 0.68);
    reconcile();
  }
  function sync(nextActive, nextBossActive, nextEnraged = false, context = {}) {
    const combo = Number.isFinite(context?.combo) ? Math.max(0, context.combo) : 0;
    const nextComboLayer = combo >= 20 ? 3 : combo >= 12 ? 2 : combo >= 6 ? 1 : 0;
    const nextWarning = !!context?.warning;
    const nextCinematic = !!context?.cinematic;
    const nextOverdrive = !!context?.overdrive;
    const changed = active !== !!nextActive || bossActive !== !!nextBossActive || enraged !== !!nextEnraged ||
      comboLayer !== nextComboLayer || warningActive !== nextWarning || cinematicActive !== nextCinematic ||
      overdriveMusic !== nextOverdrive;
    active = !!nextActive;
    bossActive = !!nextBossActive;
    enraged = !!nextEnraged;
    comboLayer = nextComboLayer;
    warningActive = nextWarning;
    cinematicActive = nextCinematic;
    overdriveMusic = nextOverdrive;
    if (changed) reconcile();
  }
  function shoot(overdrive = false) {
    if (!canPlay()) return;
    const time = audio.currentTime;
    if (time - lastShotTime < 0.043) return;
    lastShotTime = time;
    if (overdrive) {
      // 保留清晰的短射击节奏，以较低的主音和低频脉冲表现引擎过载。
      note({ time, duration: 0.065, frequency: 920, endFrequency: 320,
        type: "triangle", volume: 0.085, cutoff: 2300 });
      note({ time, duration: 0.027, frequency: 1300, endFrequency: 650,
        type: "square", volume: 0.013, cutoff: 2100 });
      note({ time, duration: 0.065, frequency: 110, endFrequency: 65,
        type: "sine", volume: 0.07, cutoff: 360 });
      return;
    }
    note({ time, duration: 0.043, frequency: 1400, endFrequency: 510,
      type: "triangle", volume: 0.082, cutoff: 3300 });
    note({ time, duration: 0.023, frequency: 2100, endFrequency: 1050,
      type: "square", volume: 0.016, cutoff: 2800 });
  }
  function overdrive() {
    if (!canPlay()) return;
    const time = audio.currentTime;
    if (time - lastOverdriveTime < 1) return;
    lastOverdriveTime = time;
    // 短促引擎升速接推进冲击，与大招的长蓄力、持续炮声区分开。
    note({ time, duration: 0.32, frequency: 210, endFrequency: 720,
      type: "sawtooth", volume: 0.065, cutoff: 650, endCutoff: 1800, crescendo: true });
    note({ time: time + 0.08, noise: true, duration: 0.38, volume: 0.07,
      filterType: "bandpass", cutoff: 600, endCutoff: 1600, crescendo: true });
    note({ time: time + 0.14, duration: 0.38, frequency: 105, endFrequency: 48,
      type: "sine", volume: 0.2, cutoff: 380, attack: 0.012 });
  }
  function perfectShield() {
    if (!canPlay()) return;
    const time = audio.currentTime;
    if (time - lastPerfectShieldTime < 0.35) return;
    lastPerfectShieldTime = time;
    // 清脆金属撞击接低频反冲；两道不谐和泛音形成格挡质感，避开射击音的尖锐滑音。
    note({ time, noise: true, duration: 0.045, volume: 0.13,
      filterType: "bandpass", cutoff: 3300, endCutoff: 1700, resonance: 1.1, attack: 0.001 });
    note({ time, duration: 0.23, frequency: 1390, endFrequency: 1210,
      type: "sine", volume: 0.075, cutoff: 4200, attack: 0.001 });
    note({ time, duration: 0.15, frequency: 2075, endFrequency: 1810,
      type: "sine", volume: 0.035, cutoff: 4300, attack: 0.001 });
    note({ time: time + 0.025, duration: 0.27, frequency: 160, endFrequency: 50,
      type: "sine", volume: 0.18, cutoff: 450, attack: 0.005 });
    note({ time: time + 0.02, noise: true, duration: 0.22, volume: 0.07,
      filterType: "bandpass", cutoff: 650, endCutoff: 2100, resonance: 0.55, attack: 0.014 });
  }
  function explode(isBoss = false) {
    if (!canPlay()) return;
    const time = audio.currentTime;
    if (isBoss ? time - lastBossExplosionTime < 0.2 : time - lastExplosionTime < 0.075) return;
    if (isBoss) lastBossExplosionTime = time; else lastExplosionTime = time;
    const weight = isBoss ? 1.2 : 1;
    const variation = 0.93 + Math.random() * 0.14;
    // 爆裂冲击 → 宽频火团 → 鼓腔低震 → 碎片尾音；滤波随衰减收暗，不做塑料般的高音滑音。
    note({ time, noise: true, duration: 0.075, volume: 0.17 * weight,
      filterType: "bandpass", cutoff: 1900, endCutoff: 1000, resonance: 0.45, attack: 0.001 });
    note({ time, noise: true, duration: isBoss ? 0.42 : 0.25, volume: 0.27 * weight,
      cutoff: 6500, endCutoff: 720, attack: 0.002 });
    note({ time: time + 0.015, noise: true, duration: isBoss ? 1.3 : 0.62,
      volume: 0.27 * weight, cutoff: 1300, endCutoff: 160, attack: 0.01 });
    note({ time, duration: isBoss ? 0.95 : 0.5, frequency: 82 * variation,
      endFrequency: isBoss ? 26 : 34, type: "sine", volume: 0.32 * weight,
      cutoff: 350, attack: 0.002 });
    note({ time: time + 0.035, duration: isBoss ? 0.62 : 0.32, frequency: 132 * variation,
      endFrequency: 56, type: "triangle", volume: 0.075 * weight, cutoff: 550, endCutoff: 160 });
    note({ time: time + 0.07, noise: true, duration: isBoss ? 0.7 : 0.27,
      volume: 0.07 * weight, filterType: "bandpass", cutoff: 1500, endCutoff: 410,
      pan: Math.random() * 0.5 - 0.25 });
    if (isBoss) {
      note({ time: time + 0.2, noise: true, duration: 0.9, volume: 0.19,
        cutoff: 2900, endCutoff: 200, pan: -0.3 });
      note({ time: time + 0.22, duration: 0.9, frequency: 66, endFrequency: 27,
        type: "sine", volume: 0.23, cutoff: 300 });
    }
  }
  function warning() {
    if (!canPlay()) return;
    const time = audio.currentTime;
    if (time - lastWarningTime < 1.5) return;
    lastWarningTime = time;
    // 双响低沉警报，低频冲击和号角负责威胁感，不靠尖锐蜂鸣提高音量。
    for (let index = 0; index < 2; index++) {
      const start = time + index * 0.65;
      note({ bus: "boss", time: start, duration: 0.57, frequency: 176, endFrequency: 117,
        type: "triangle", volume: 0.15, cutoff: 1250, sustain: true, attack: 0.025 });
      note({ bus: "boss", time: start, duration: 0.6, frequency: 88, endFrequency: 49,
        type: "sine", volume: 0.24, cutoff: 330, attack: 0.008 });
      note({ bus: "boss", time: start, noise: true, duration: 0.36, volume: 0.08,
        cutoff: 2100, endCutoff: 330 });
    }
    note({ bus: "boss", time: time + 0.2, noise: true, duration: 0.85, volume: 0.08,
      filterType: "bandpass", cutoff: 350, endCutoff: 1300, crescendo: true });
  }
  function bossAttack(kind = "volley") {
    if (!canPlay()) return;
    if (!Object.prototype.hasOwnProperty.call(lastBossAttack, kind)) kind = "volley";
    const time = audio.currentTime;
    const intervals = { volley: 0.28, beam: 0.65, summon: 0.7, burst: 0.45 };
    if (time - lastBossAttack[kind] < intervals[kind]) return;
    lastBossAttack[kind] = time;
    const common = { bus: "boss", time };
    if (kind === "beam") {
      note({ ...common, duration: 0.45, frequency: 145, endFrequency: 68,
        type: "triangle", volume: 0.15, cutoff: 1150, sustain: true });
      note({ ...common, noise: true, duration: 0.44, volume: 0.15,
        cutoff: 3500, endCutoff: 700, sustain: true });
      note({ ...common, duration: 0.3, frequency: 88, endFrequency: 40,
        type: "sine", volume: 0.22, cutoff: 350 });
    } else if (kind === "summon") {
      note({ ...common, duration: 0.65, frequency: 90, endFrequency: 63,
        type: "triangle", volume: 0.15, cutoff: 850, attack: 0.04 });
      note({ ...common, duration: 0.54, frequency: 134, endFrequency: 93,
        type: "sine", volume: 0.07, cutoff: 850, attack: 0.04, pan: -0.2 });
      note({ ...common, noise: true, duration: 0.36, volume: 0.1,
        filterType: "bandpass", cutoff: 900, endCutoff: 320, crescendo: true });
    } else if (kind === "burst") {
      note({ ...common, noise: true, duration: 0.27, volume: 0.17,
        cutoff: 3900, endCutoff: 540 });
      note({ ...common, duration: 0.28, frequency: 104, endFrequency: 37,
        type: "sine", volume: 0.21, cutoff: 400 });
    } else {
      note({ ...common, duration: 0.18, frequency: 142, endFrequency: 55,
        type: "triangle", volume: 0.1, cutoff: 850 });
      note({ ...common, noise: true, duration: 0.105, volume: 0.09,
        filterType: "bandpass", cutoff: 1600, endCutoff: 450 });
    }
  }
  function bossEnrage() {
    if (!canPlay()) return;
    const time = audio.currentTime;
    if (time - lastEnrageTime < 2) return;
    lastEnrageTime = time;
    note({ bus: "boss", time, duration: 1.1, frequency: 110, endFrequency: 63,
      type: "triangle", volume: 0.22, cutoff: 1700, endCutoff: 550, attack: 0.04, sustain: true });
    note({ bus: "boss", time, duration: 1.15, frequency: 62, endFrequency: 31,
      type: "sine", volume: 0.28, cutoff: 280, attack: 0.018 });
    note({ bus: "boss", time, noise: true, duration: 0.9, volume: 0.16,
      cutoff: 2800, endCutoff: 240, attack: 0.06 });
    note({ bus: "boss", time: time + 0.24, duration: 0.82, frequency: 163, endFrequency: 118,
      type: "triangle", volume: 0.085, cutoff: 1100, pan: 0.2, sustain: true });
  }
  function stopUltimate() {
    // 只取消大招：不打断普通射击、爆炸或国风配乐。
    stopVoices("ultimate");
  }
  function chargeUltimate(duration = 0.85) {
    stopUltimate();
    if (!canPlay()) return;
    duration = Number.isFinite(duration) ? Math.max(0.12, Math.min(3, duration)) : 0.85;
    const common = { bus: "ultimate", time: audio.currentTime, duration, crescendo: true };
    note({ ...common, frequency: 125, endFrequency: 660, type: "sine", volume: 0.17, cutoff: 1500 });
    note({ ...common, frequency: 260, endFrequency: 1320, type: "triangle", volume: 0.055, cutoff: 2100 });
    note({ ...common, noise: true, loopNoise: true, volume: 0.045, filterType: "bandpass", cutoff: 1100 });
  }
  function fireUltimate() {
    stopUltimate();
    if (!canPlay()) return;
    const common = { bus: "ultimate", time: audio.currentTime };
    // 低频冲击负责重量，中频长音与气流覆盖整段贯穿炮发射。
    note({ ...common, duration: 0.8, frequency: 145, endFrequency: 35,
      type: "sine", volume: 0.3, cutoff: 550 });
    note({ ...common, duration: 0.85, frequency: 155, endFrequency: 88,
      type: "sawtooth", volume: 0.075, cutoff: 1100, sustain: true });
    note({ ...common, duration: 0.75, frequency: 620, endFrequency: 185,
      type: "triangle", volume: 0.04, cutoff: 1600, sustain: true });
    note({ ...common, duration: 0.85, noise: true, volume: 0.15,
      cutoff: 1900, attack: 0.012, sustain: true });
  }
  function destroy() {
    if (disposed) return;
    disposed = true;
    stopMusic();
    stopVoices();
    if (audio) {
      audio.onstatechange = null;
      try { Promise.resolve(audio.close()).catch(() => {}); } catch { /* 已关闭。 */ }
    }
    audio = null;
  }
  return { unlock, setMuted, get muted() { return muted; }, sync, shoot, overdrive, perfectShield, explode, warning, bossAttack, bossEnrage,
    chargeUltimate, fireUltimate, stopUltimate, destroy };
})();
