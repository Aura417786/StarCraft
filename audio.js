"use strict";

// 优先播放离线渲染的多轨配乐和声音素材。合成声在解码不可用时接替。
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
  let musicDuck = null;
  let noiseBuffer = null;
  let muted = false;
  let active = false;
  let paused = false;
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
  let lastImpactTime = -Infinity;
  let duckPriority = 1;
  let duckUntil = -Infinity;
  let lastBossVoiceTime = -Infinity;
  let bossType = null;
  let bossPhase = null;
  let threat = 0;
  let bankLoading = false;
  let liveScore = null;
  const scoreOffsets = { adventure: 0, boss: 0 };
  const buffers = new Map();
  const authoredStems = {
    adventure: ["flight_harmony", "flight_pulse"],
    boss: ["boss_harmony", "boss_pressure", "boss_finale"],
  };
  const bossCueIntervals = { volley: 0.28, beam: 0.65, summon: 0.7, burst: 0.45,
    coil: 0.4, whip: 0.12, hatch: 0.21, surge: 0.25 };
  const lastBossAttack = new Map();

  function disconnect(node) {
    try { node.disconnect(); } catch { /* 已断开的节点无需再处理。 */ }
  }
  function canPlay(bus = "sfx") {
    return !!audio && audio.state === "running" && (active || (paused && bus === "music")) && !muted && !disposed;
  }
  function smoothGain(node, value, duration = 0.035) {
    if (!audio || !node) return;
    const time = audio.currentTime;
    node.gain.cancelScheduledValues(time);
    node.gain.setValueAtTime(node.gain.value, time);
    node.gain.linearRampToValueAtTime(value, time + duration);
  }
  function duckMusic(level, duration) {
    const time = audio.currentTime;
    if (time < duckUntil && level > duckPriority) return;
    duckPriority = level;
    duckUntil = time + duration * .46;
    const gain = musicDuck.gain;
    gain.cancelScheduledValues(time);
    gain.setValueAtTime(gain.value, time);
    gain.linearRampToValueAtTime(level, time + 0.025);
    gain.setValueAtTime(level, time + duration * 0.46);
    gain.linearRampToValueAtTime(1, time + duration);
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
        Array.from(voices).find(voice => voice.bus !== "ultimate" && !voice.loop);
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
    if (!canPlay(options.bus)) return;
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
    trackVoice(source, gain, bus, chain);
    source.start(start);
    source.stop(start + duration + 0.01);
  }
  function trackVoice(source, gain, bus, chain, loop = false) {
    const voice = { source, gain, bus, chain, loop };
    voices.add(voice);
    source.onended = () => {
      voices.delete(voice);
      fadingVoices.delete(voice);
      for (const node of chain) disconnect(node);
    };
  }
  function sample(name, { bus = "sfx", time = audio.currentTime, level = .28, rate = 1,
    duration = Infinity, pan = 0 } = {}) {
    const buffer = buffers.get(name);
    if (!buffer || !canPlay() || !limitVoices(bus)) return false;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = audio.createGain();
    const chain = [source, gain];
    source.connect(gain);
    if (pan && audio.createStereoPanner) {
      const space = audio.createStereoPanner();
      space.pan.value = pan;
      gain.connect(space); space.connect(sfxBus); chain.push(space);
    } else gain.connect(sfxBus);
    const start = Math.max(time, audio.currentTime);
    const length = Math.min(buffer.duration / rate, duration);
    gain.gain.setValueAtTime(level, start);
    gain.gain.setValueAtTime(level, start + Math.max(0, length - .05));
    gain.gain.linearRampToValueAtTime(0, start + length);
    trackVoice(source, gain, bus, chain);
    source.start(start);
    source.stop(start + length);
    return true;
  }
  // Frequency, descent, interval and material filter for each of the eleven voices.
  const presentationMotifs = [
    [47, .64, .16, 560, "sine"], [108, .44, .065, 1900, "triangle"],
    [56, .56, .10, 920, "sawtooth"], [169, 1.34, .17, 2500, "sine"],
    [80, .43, .09, 1360, "square"], [236, 1.62, .12, 3100, "sine"],
    [92, 1.57, .053, 2720, "triangle"], [131, .71, .19, 1050, "sine"],
    [39, .38, .28, 430, "triangle"], [181, .77, .08, 2260, "square"],
    [46, .52, .22, 740, "sawtooth"],
  ];
  function bossPresentationCue(kind, index) {
    if (!canPlay() || !presentationMotifs[index]) return;
    const [tone, slope, gap, texture, shape] = presentationMotifs[index];
    const time = audio.currentTime;
    const ending = kind === "death", gathering = kind === "transform";
    const ratio = ending ? .79 : gathering ? .91 : 1.16;
    const base = tone * ratio;
    const duration = (ending ? .63 : .38) + gap;
    const bus = "boss";
    note({ bus, time, type: shape, duration, frequency: base, endFrequency: base * slope,
      volume: shape === "square" || shape === "sawtooth" ? .066 : .18, attack: gathering ? .13 : .007,
      cutoff: Math.min(texture, 720), endCutoff: ending ? 144 : Math.min(texture, 580), pan: .24 });
    note({ bus, time: time + gap, type: "sine", duration: duration * .73,
      frequency: base * (slope > 1 ? 1.47 : .76), endFrequency: base * (ending ? .53 : 1.13),
      volume: .115, cutoff: 690, pan: .09, attack: .014 });
    note({ bus, time: time + gap * .4, noise: true, duration: duration * .82, volume: ending ? .105 : .075,
      cutoff: texture, endCutoff: texture * (ending ? .21 : .48), resonance: 1.2,
      filterType: "bandpass", pan: .18, attack: gathering ? .10 : .009 });
  }
  function bossVoice(options) {
    if (!Number.isInteger(bossType)) return false;
    return sample("boss_" + String(bossType + 1).padStart(2, "0"), { bus: "boss", ...options });
  }
  function matchLoopSeam(buffer) {
    // Lossy coding can leave a small discontinuity across an otherwise
    // sample-aligned loop. Taper out that offset in the first few milliseconds.
    const transition = Math.min(buffer.length, Math.round(buffer.sampleRate * .012));
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      const difference = data[data.length - 1] - data[0];
      for (let index = 0; index < transition; index++) {
        const blend = .5 + .5 * Math.cos(Math.PI * index / transition);
        data[index] += difference * blend;
      }
    }
  }
  function loadBank(current) {
    if (bankLoading || typeof starBreakerAudioBank === "undefined"
      || typeof current.decodeAudioData !== "function" || typeof atob !== "function") return;
    bankLoading = true;
    async function decode(name, encoded) {
      try {
        const bytes = Uint8Array.from(atob(encoded), letter => letter.charCodeAt(0));
        const buffer = await current.decodeAudioData(bytes.buffer);
        if (!disposed && audio === current) {
          if (name === "room" || Object.hasOwn(starBreakerAudioBank.stems, name)) matchLoopSeam(buffer);
          buffers.set(name, buffer);
        }
      } catch { /* 当前浏览器会使用本地合成声音。 */ }
    }
    async function prepare() {
      const { stems, effects } = starBreakerAudioBank;
      await Promise.all([
        ...authoredStems.adventure.map(name => decode(name, stems[name][1])),
        decode("room", effects.room),
      ]);
      if (audio === current && !disposed) reconcile();
      const remaining = [
        ...Object.entries(effects).filter(([name]) => name !== "room" && !name.startsWith("boss_")),
        ...authoredStems.boss.map(name => [name, stems[name][1]]),
        ...Object.entries(effects).filter(([name]) => name.startsWith("boss_")),
      ];
      // Small batches keep decompression work off the foreground start button.
      let bossScoreReady = false;
      for (let index = 0; index < remaining.length && !disposed; index += 4) {
        await Promise.all(remaining.slice(index, index + 4).map(([name, bytes]) => decode(name, bytes)));
        if (!bossScoreReady && audio === current && !disposed && authoredStems.boss.every(name => buffers.has(name))) {
          bossScoreReady = true;
          reconcile();
        }
      }
    }
    prepare().catch(() => { /* No network dependency if the bank is unavailable. */ });
  }
  function updateScoreMix() {
    if (!liveScore) return;
    const [base, rhythm, finale] = liveScore.layers;
    smoothGain(liveScore.ambience, bossActive ? .055 : .23, .38);
    if (bossActive) {
      const exposed = bossPhase === "recover";
      smoothGain(base, exposed ? .72 : .83, .24);
      smoothGain(rhythm, .31 + threat * .15 + (overdriveMusic ? .13 : 0), .24);
      smoothGain(finale, bossPhase === "finale" ? .66 : enraged ? .20 + threat * .065 : 0, .42);
    } else {
      smoothGain(base, .82, .22);
      smoothGain(rhythm, overdriveMusic ? .89 : .30 + comboLayer * .12, .32);
    }
  }
  function startScore(theme) {
    const names = authoredStems[theme];
    const clips = names.map(name => buffers.get(name));
    const duration = Math.min(...clips.map(clip => clip.duration), starBreakerAudioBank.stems[names[0]][0]);
    if (!(duration > 0)) return;
    const start = audio.currentTime + .024;
    const offset = scoreOffsets[theme] % duration;
    function loop(clip, loopEnd) {
      const source = audio.createBufferSource();
      source.buffer = clip;
      source.loop = true;
      source.loopEnd = loopEnd;
      const gain = audio.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(musicBus);
      trackVoice(source, gain, "music", [source, gain], true);
      source.start(start, offset % loopEnd);
      return gain;
    }
    const layers = clips.map(clip => loop(clip, duration));
    const room = buffers.get("room");
    const ambience = room ? loop(room, room.duration) : null;
    liveScore = { theme, duration, start, offset, layers, ambience };
  }
  function midi(value) { return 440 * Math.pow(2, (value - 69) / 12); }
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
    // 带少量不谐振动的低沉号角给强拍增加空间和厚度。
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
  function pulseBass(pitch, time, duration, strength = 1, hot = false) {
    const frequency = midi(pitch);
    note({ bus: "music", time, duration, frequency, type: "sawtooth",
      endFrequency: frequency * 0.992, volume: 0.126 * strength,
      cutoff: hot ? 800 : 480, endCutoff: 145, attack: 0.008 });
    note({ bus: "music", time, duration, frequency: frequency / 2, type: "sine",
      volume: 0.085 * strength, cutoff: 170, attack: 0.013 });
  }
  function tensionStab(pitch, time, duration, strength, pan) {
    for (const [offset, weight] of [[0, 1], [7, 0.32], [12, 0.24]]) {
      const frequency = midi(pitch + offset);
      note({ bus: "music", time, duration, frequency, endFrequency: frequency * 0.996,
        type: "sawtooth", volume: 0.09 * strength * weight, cutoff: 690, endCutoff: 240,
        attack: 0.029, pan });
    }
  }
  const flightRoots = [40, 40, 41, 43, 40, 36, 38, 41];
  const siegeRoots = [40, 40, 41, 34, 40, 38, 36, 41];
  function adventureBeat(step, time, length) {
    // 重拍从 3+3+2 的低音推进，奇数小节留半拍空白给远处的金属回声。
    const beat = step % 16;
    const bar = Math.floor(step / 16) % flightRoots.length;
    const root = flightRoots[bar];
    const notes = { 0: 0, 3: 0, 6: 7, 8: 0, 11: bar % 2 ? 1 : 0, 14: -2 };
    if (Object.hasOwn(notes, beat) && (beat !== 14 || bar % 2 === 0))
      pulseBass(root + notes[beat], time, length * (beat === 0 ? 2.8 : 1.65), beat === 0 ? 0.86 : 0.57);
    if ([0, 8, 11].includes(beat)) warDrum(time, beat !== 11, beat === 0 ? 0.73 : 0.5);
    if ([4, 12].includes(beat)) warDrum(time, false, 0.65);
    if (beat === 2 || (beat === 10 && bar % 2 === 0))
      tensionStab(root + (beat === 2 ? 12 : 13), time, length * 4.1, 0.66, beat === 2 ? -0.37 : 0.33);
    if (beat === 15 && bar % 2 === 1)
      note({ bus: "music", time, noise: true, filterType: "bandpass", cutoff: 1900, endCutoff: 390,
        duration: length * 1.7, volume: 0.06, crescendo: true, pan: 0.25 });
    if (!overdriveMusic) {
      if (comboLayer >= 1 && beat === 6) warDrum(time, false, 0.4);
      if (comboLayer >= 2 && [5, 13].includes(beat)) warDrum(time, false, 0.45);
      if (comboLayer >= 3 && [3, 15].includes(beat)) warDrum(time, true, 0.43);
    }
  }
  function overdriveBeat(step, time, length) {
    if (!overdriveMusic) return;
    const beat = step % 16;
    const bar = Math.floor(step / 16) % 8;
    const root = (bossActive ? siegeRoots : flightRoots)[bar];
    // 暴走叠加同调的鼓阵，首领原有拍点与低音动机保留。
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
    // 同一个半音动机跨过两相；第二相压缩留白，加入三全音应答和双击。
    const beat = step % 16;
    const bar = Math.floor(step / 16) % siegeRoots.length;
    const root = siegeRoots[bar];
    const breakBeat = bar === 7 && beat > 11;
    const notes = enraged
      ? { 0: 0, 2: 0, 3: 1, 6: 0, 7: 6, 8: 0, 10: 0, 11: -2, 13: 1, 14: 7 }
      : { 0: 0, 3: 1, 6: 0, 8: 0, 11: -2, 14: 7 };
    if (!breakBeat && Object.hasOwn(notes, beat))
      pulseBass(root + notes[beat], time, length * (enraged ? 1.12 : 1.75), beat === 0 ? 1.3 : 0.91, enraged);
    if (!breakBeat && (enraged ? [0, 2, 6, 8, 11, 14] : [0, 6, 8, 14]).includes(beat))
      warDrum(time, true, beat === 0 || beat === 8 ? 1.09 : 0.76);
    if ([4, 10, 12].includes(beat) || (enraged && [3, 7, 13, 15].includes(beat)))
      warDrum(time, false, breakBeat ? 0.4 : 0.8);
    if (beat === 0 && (bar % 2 === 0 || enraged)) lowWarHorn(root, time, length * 6, 0.94);
    if ((beat === 3 && bar % 2 === 0) || beat === 9 || (enraged && beat === 13))
      tensionStab(root + (beat === 9 ? 18 : 13), time, length * (enraged ? 2.3 : 3.6), 0.98, beat === 9 ? 0.32 : -0.32);
    if (bar % 4 === 0 && beat === 0) bronzeGong(time, 0.86);
    if (beat === 7 || (enraged && beat === 15))
      note({ bus: "music", time, noise: true, filterType: "bandpass", cutoff: 480, endCutoff: 1850,
        duration: length * 1.3, volume: 0.08, crescendo: true, pan: beat === 7 ? -0.3 : 0.3 });
  }
  function scheduleMusic() {
    scheduler = null;
    if (!musicPlaying || !canPlay("music") || warningActive || cinematicActive) return;
    const now = audio.currentTime;
    // 电脑卡顿或恢复后从当前时刻接着演奏，绝不追补积压的鼓点。
    if (nextStepTime < now - 0.04) nextStepTime = now + 0.02;
    while (nextStepTime < now + 0.12) {
      const tempo = bossActive ? (enraged ? 146 : 126) : (overdriveMusic ? 124 : 98);
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
    if (liveScore) {
      const { theme, start, offset, duration } = liveScore;
      scoreOffsets[theme] = (offset + Math.max(0, audio.currentTime - start)) % duration;
      liveScore = null;
    } else if (!musicPlaying) return;
    musicPlaying = false;
    smoothGain(musicBus, 0, 0.035);
    stopVoices("music");
  }
  function reconcile() {
    if (!audio) return;
    smoothGain(sfxBus, paused ? .16 : .65, .12);
    if (!canPlay("music")) {
      stopMusic();
      stopVoices();
      return;
    }
    if (warningActive || cinematicActive) { stopMusic(); return; }
    const theme = bossActive ? "boss" : "adventure";
    const musicLevel = paused ? .25 : 1;
    if (theme !== musicTheme) {
      stopMusic();
      musicTheme = theme;
      scoreOffsets[theme] = 0;
      musicStep = 0;
    }
    if (authoredStems[theme].every(name => buffers.has(name))) {
      if (musicPlaying) stopMusic();
      smoothGain(musicBus, (bossActive ? .59 : .52) * musicLevel, .2);
      if (!liveScore) startScore(theme);
      updateScoreMix();
      return;
    }
    smoothGain(musicBus, (bossActive ? .3 : overdriveMusic ? .29 : comboLayer ? .245 : .22) * musicLevel, .14);
    if (musicPlaying) return;
    musicPlaying = true;
    nextStepTime = audio.currentTime + 0.025;
    scheduleMusic();
  }
  function initialize() {
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType || disposed) return false;
    // The authored sound palette is concentrated below 14 kHz. A 32 kHz mix
    // keeps simultaneous decoded stems light on browsers that support it.
    try { audio = new AudioContextType({ sampleRate: 32000 }); }
    catch { audio = new AudioContextType(); }
    master = audio.createGain();
    sfxBus = audio.createGain();
    musicBus = audio.createGain();
    musicDuck = audio.createGain();
    const limiter = audio.createDynamicsCompressor();
    master.gain.value = muted ? 0 : 0.68;
    sfxBus.gain.value = 0.65;
    musicBus.gain.value = 0;
    limiter.threshold.value = -16;
    limiter.knee.value = 15;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    sfxBus.connect(master); musicBus.connect(musicDuck); musicDuck.connect(master);
    master.connect(limiter); limiter.connect(audio.destination);
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
          loadBank(current);
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
    const nextPaused = !!context?.paused;
    const nextOverdrive = !!context?.overdrive;
    const nextType = Number.isInteger(context?.bossType) ? context.bossType : null;
    const nextPhase = context?.bossPhase ?? null;
    const nextThreat = (nextEnraged ? 1 : 0) + (nextPhase === "attack" || nextPhase === "finale" ? 1 : 0)
      + (Number.isFinite(context?.lives) && context.lives <= 1 ? 1 : 0);
    const entering = nextPhase === "enter" && (bossPhase !== nextPhase || bossType !== nextType);
    const transforming = nextPhase === "finale" && bossPhase !== nextPhase;
    const changed = active !== !!nextActive || paused !== nextPaused || bossActive !== !!nextBossActive || enraged !== !!nextEnraged ||
      comboLayer !== nextComboLayer || warningActive !== nextWarning || cinematicActive !== nextCinematic ||
      overdriveMusic !== nextOverdrive || bossType !== nextType || bossPhase !== nextPhase || threat !== nextThreat;
    const wasActive = active;
    active = !!nextActive;
    paused = nextPaused;
    bossActive = !!nextBossActive;
    enraged = !!nextEnraged;
    comboLayer = nextComboLayer;
    warningActive = nextWarning;
    cinematicActive = nextCinematic;
    overdriveMusic = nextOverdrive;
    bossType = nextType;
    bossPhase = nextPhase;
    threat = nextThreat;
    if (changed) reconcile();
    if (wasActive && canPlay() && (entering || transforming)) {
      duckMusic(.39, 1.05);
      sample("stage", { bus: "boss", level: .37 });
      bossVoice({ level: .47, rate: transforming ? .79 : 1, pan: .21 });
    }
  }
  function shoot(overdrive = false, tier = 1, fighter = "red") {
    if (!canPlay()) return;
    const time = audio.currentTime;
    if (time - lastShotTime < 0.043) return;
    lastShotTime = time;
    const weight = Math.min(4, Math.max(0, tier - 1));
    const cannon = fighter === "yellow" ? "gold" : fighter === "blue" ? "blue" : "red";
    if (sample("shot_" + cannon, { level: overdrive ? .25 : .19,
      rate: 1.05 - weight * .048 - (overdrive ? .11 : 0) + .065 * Math.random() })) return;
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
    note({ time, duration: 0.043 + weight * .005, frequency: 1400 / (1 + weight * .12), endFrequency: 510 / (1 + weight * .1),
      type: "triangle", volume: 0.082, cutoff: 3300 });
    note({ time, duration: 0.023, frequency: 2100, endFrequency: 1050,
      type: "square", volume: 0.016, cutoff: 2800 });
    if (weight) note({ time, duration: .055, frequency: 145 - weight * 12, endFrequency: 75,
      type: "sine", volume: .025 + weight * .006, cutoff: 400 });
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
  function hit(isBoss, source = "") {
    if (!canPlay() || audio.currentTime - lastImpactTime < .072) return;
    const heavy = source === "ultimate";
    if (sample(isBoss ? "hit_organic" : "hit_metal",
      { level: heavy ? .29 : .19, rate: (heavy ? .77 : .94) + .12 * Math.random(), pan: .19 })) {
      lastImpactTime = audio.currentTime;
    }
  }
  function hurt() {
    if (!canPlay()) return;
    if (sample("hurt", { level: .46 })) duckMusic(.46, .41);
  }
  function explode(isBoss = false) {
    if (!canPlay()) return;
    const time = audio.currentTime;
    if (isBoss ? time - lastBossExplosionTime < 0.2 : time - lastExplosionTime < 0.075) return;
    if (isBoss) lastBossExplosionTime = time; else lastExplosionTime = time;
    const weight = isBoss ? 1.2 : 1;
    const variation = 0.93 + Math.random() * 0.14;
    if (sample(isBoss ? "collapse" : "blast", { bus: isBoss ? "boss" : "sfx",
      level: isBoss ? .66 : .32, rate: variation })) {
      if (isBoss) {
        duckMusic(.28, 1.22);
        bossVoice({ level: .52, rate: .68, time: time + .14, pan: .24 });
      }
      return;
    }
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
    if (sample("warning", { bus: "boss", level: .62 })) return;
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
    if (!Object.hasOwn(bossCueIntervals, kind)) kind = "volley";
    const time = audio.currentTime;
    if (time - (lastBossAttack.get(kind) ?? -Infinity) < bossCueIntervals[kind]) return;
    lastBossAttack.set(kind, time);
    const pressure = kind === "surge" || kind === "beam";
    const cue = pressure ? "pressure" : kind === "coil" ? "stage" : kind === "whip" ? "snap" : "hit_organic";
    const level = pressure ? .56 : kind === "volley" ? .17 : .34;
    if (sample(cue, { bus: "boss", level, rate: kind === "beam" ? 1.37 : 1,
      duration: kind === "coil" ? .45 : Infinity, pan: .14 })) {
      if (pressure || kind === "whip") duckMusic(pressure ? .44 : .61, pressure ? .56 : .32);
      if (time - lastBossVoiceTime > (pressure ? .38 : .62)
        && bossVoice({ level: pressure ? .40 : .29, rate: kind === "coil" ? .87 : 1.12,
          duration: pressure ? 1.08 : .62, pan: .29 })) lastBossVoiceTime = time;
      return;
    }
    const common = { bus: "boss", time };
    if (kind === "coil") {
      note({ ...common, duration: 0.42, frequency: 57, endFrequency: 144, type: "sawtooth",
        volume: 0.22, cutoff: 160, endCutoff: 800, resonance: 1.6, crescendo: true, pan: 0.38 });
      note({ ...common, noise: true, duration: 0.36, volume: 0.16, filterType: "bandpass",
        cutoff: 170, endCutoff: 990, crescendo: true, pan: 0.2 });
    } else if (kind === "whip") {
      duckMusic(0.49, 0.32);
      note({ ...common, noise: true, duration: 0.24, volume: 0.28, filterType: "bandpass",
        cutoff: 2300, endCutoff: 260, resonance: 0.8, pan: 0.32 });
      note({ ...common, duration: 0.32, frequency: 159, endFrequency: 38, type: "triangle",
        volume: 0.32, cutoff: 720, endCutoff: 120, pan: 0.08 });
      note({ ...common, time: time + 0.036, noise: true, duration: 0.37, volume: 0.115,
        filterType: "bandpass", cutoff: 520, endCutoff: 120, resonance: 1.6, pan: -0.3 });
    } else if (kind === "hatch") {
      duckMusic(0.67, 0.38);
      for (let pulse = 0; pulse < 3; pulse++) note({ ...common, time: time + pulse * 0.073,
        duration: 0.27, frequency: 68 + pulse * 15, endFrequency: 34 + pulse * 5,
        type: "triangle", volume: 0.2 - pulse * 0.036, cutoff: 560, endCutoff: 220,
        resonance: 2, pan: 0.34 - pulse * 0.19 });
      note({ ...common, noise: true, duration: 0.34, volume: 0.15, filterType: "bandpass",
        cutoff: 350, endCutoff: 150, attack: 0.024, resonance: 3 });
    } else if (kind === "surge") {
      duckMusic(0.46, 0.47);
      note({ ...common, duration: 0.45, frequency: 102, endFrequency: 34, type: "sawtooth",
        volume: 0.23, cutoff: 780, endCutoff: 200, attack: 0.01, pan: 0.28 });
      note({ ...common, duration: 0.5, frequency: 69, endFrequency: 33, type: "sine",
        volume: 0.26, cutoff: 210, attack: 0.01 });
      note({ ...common, noise: true, duration: 0.37, volume: 0.2, filterType: "bandpass",
        cutoff: 1320, endCutoff: 220, resonance: 1.3 });
    } else if (kind === "beam") {
      duckMusic(0.64, 0.47);
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
    duckMusic(0.27, 1.04);
    if (sample("stage", { bus: "boss", level: .55 })) {
      bossVoice({ level: .53, rate: .83, time: time + .10 });
      return;
    }
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
    // 只取消大招：不打断普通射击、爆炸或战斗配乐。
    stopVoices("ultimate");
  }
  function chargeUltimate(duration = 0.85, kind = "red") {
    stopUltimate();
    if (!canPlay()) return;
    duration = Number.isFinite(duration) ? Math.max(0.12, Math.min(3, duration)) : 0.85;
    const rate = Math.min(3, Math.max(.42, .85 / duration));
    if (sample("charge", { bus: "ultimate", level: .33, rate, duration,
      pan: kind === "blue" ? -.19 : kind === "yellow" ? .19 : 0 })) return;
    const common = { bus: "ultimate", time: audio.currentTime, duration, crescendo: true };
    if (kind === "blue") {
      note({ ...common, frequency: 240, endFrequency: 870, type: "sine", volume: 0.145, cutoff: 1500 });
      note({ ...common, frequency: 365, endFrequency: 1510, type: "triangle", volume: 0.064, cutoff: 2200, pan: -0.23 });
      note({ ...common, noise: true, loopNoise: true, volume: 0.067, filterType: "bandpass", cutoff: 830, endCutoff: 1710 });
      return;
    }
    if (kind === "yellow") {
      note({ ...common, frequency: 78, endFrequency: 151, type: "sawtooth", volume: 0.12, cutoff: 210, endCutoff: 590 });
      note({ ...common, frequency: 117, endFrequency: 227, type: "triangle", volume: 0.095, cutoff: 1200, pan: 0.28 });
      note({ ...common, noise: true, loopNoise: true, volume: 0.085, filterType: "bandpass", cutoff: 530, endCutoff: 1020 });
      return;
    }
    note({ ...common, frequency: 125, endFrequency: 660, type: "sine", volume: 0.17, cutoff: 1500 });
    note({ ...common, frequency: 260, endFrequency: 1320, type: "triangle", volume: 0.055, cutoff: 2100 });
    note({ ...common, noise: true, loopNoise: true, volume: 0.045, filterType: "bandpass", cutoff: 1100 });
  }
  function fireUltimate(kind = "red") {
    stopUltimate();
    if (!canPlay()) return;
    const launch = kind === "blue" ? "blue" : kind === "yellow" ? "gold" : "red";
    if (sample("launch_" + launch, { bus: "ultimate", level: .58 })) {
      duckMusic(.51, .61);
      return;
    }
    const common = { bus: "ultimate", time: audio.currentTime };
    if (kind === "blue") {
      for (let pulse = 0; pulse < 5; pulse++) {
        note({ ...common, time: common.time + pulse * 0.095, duration: 0.16,
          frequency: 645 + pulse * 43, endFrequency: 216 + pulse * 17, type: "triangle",
          volume: 0.135, cutoff: 2450, endCutoff: 880, pan: pulse % 2 ? -0.28 : 0.24 });
      }
      note({ ...common, noise: true, duration: 0.48, volume: 0.11, filterType: "bandpass",
        cutoff: 2400, endCutoff: 740, resonance: 1.6, sustain: true });
      return;
    }
    if (kind === "yellow") {
      for (let pulse = 0; pulse < 3; pulse++) {
        const time = common.time + pulse * 0.22;
        note({ ...common, time, duration: 0.32, frequency: 91 + pulse * 12, endFrequency: 43,
          type: "sine", volume: 0.29, cutoff: 450, pan: (pulse - 1) * 0.22 });
        note({ ...common, time, noise: true, duration: 0.31, volume: 0.17,
          filterType: "bandpass", cutoff: 1530 + pulse * 200, endCutoff: 430, resonance: 1.5 });
      }
      note({ ...common, duration: 0.81, frequency: 173, endFrequency: 85, type: "triangle",
        volume: 0.082, cutoff: 950, sustain: true });
      return;
    }
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
    for (const voice of fadingVoices) {
      voice.source.onended = null;
      for (const node of voice.chain) disconnect(node);
    }
    fadingVoices.clear();
    buffers.clear();
    audio = null;
  }
  return { unlock, setMuted, get muted() { return muted; }, sync, shoot, hit, hurt, overdrive, perfectShield, explode, warning, bossAttack, bossEnrage,
    bossPresentationCue, chargeUltimate, fireUltimate, stopUltimate, destroy };
})();
