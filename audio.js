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
  let volume = 1;
  const volumeKey = "star-breaker-volume";
  try {
    const saved = window.localStorage.getItem(volumeKey);
    if (saved !== null && Number.isFinite(Number(saved))) volume = Math.max(0, Math.min(1, Number(saved)));
  } catch { /* Settings still work for this session. */ }
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
  let lastHeavyImpactTime = -Infinity;
  let impactBudget = 4;
  let impactBudgetAt = 0;
  let duckPriority = 1;
  let duckUntil = -Infinity;
  let lastBossVoiceTime = -Infinity;
  let bossType = null;
  let bossPhase = null;
  let bossMusicTier = 0;
  let visible = true;
  const soundStage = { width: 1280, height: 720, listenerX: 128, listenerY: 360, bossX: 1000, bossY: 360 };
  let threat = 0;
  let bankLoading = false;
  let bankRequest = null;
  let liveScore = null;
  let victoryActive = false;
  let victoryVoice = null;
  let victoryOffset = 0;
  let victoryLoading = false;
  let requestedFaction = "";
  let factionLoading = "";
  let factionGeneration = 0;
  let factionRequest = null;
  const scoreOffsets = { adventure: 0, boss: 0, bio: 0, mechanical: 0, void: 0 };
  const buffers = new Map();
  const authoredStems = {
    adventure: ["flight_harmony", "flight_pulse"],
    boss: ["boss_harmony", "boss_pressure", "boss_finale"],
  };
  const catalog = typeof starBreakerAudioCatalog !== "undefined" ? starBreakerAudioCatalog : null;
  const factionScores = catalog && document.currentScript?.hasAttribute("data-faction-scores") ? catalog.factions : null;
  const offlineAudio = window.location?.protocol === "file:";
  const offlineBanks = new Map();
  const factions = ["bio", "bio", "mechanical", "void", "mechanical", "mechanical", "bio", "bio", "void", "void", "void"];
  const factionLayerNames = ["harmony", "pressure", "finale"];
  function scoreStemNames(theme) {
    return authoredStems[theme] ?? factionLayerNames.map(layer => theme + "_" + layer);
  }
  function currentFaction() { return factions[bossType] ?? "bio"; }
  const bossCueIntervals = { volley: 0.28, beam: 0.65, summon: 0.7, burst: 0.45,
    coil: 0.4, whip: 0.12, hatch: 0.21, surge: 0.25, cannon: .33 };
  const lastBossAttack = new Map();

  function disconnect(node) {
    try { node.disconnect(); } catch { /* 已断开的节点无需再处理。 */ }
  }
  function canPlay(bus = "sfx") {
    return !!audio && audio.state === "running"
      && (active || (bus === "music" && (paused || (victoryActive && visible)))) && !muted && !disposed;
  }
  function mixClamp(value, low, high) { return Math.min(high, Math.max(low, value)); }
  function soundPosition(x, y, distance = true) {
    if (!Number.isFinite(x)) return { pan: 0, attenuation: 1, spatial: false };
    const dy = Number.isFinite(y) ? (y - soundStage.listenerY) / soundStage.height : 0;
    const dx = (x - soundStage.listenerX) / soundStage.width;
    const radius = Math.hypot(dx, dy * .65);
    return { pan: mixClamp(2 * x / soundStage.width - 1, -1, 1) * .60,
      attenuation: distance ? Math.max(.26, 1 / (1 + 2.1 * radius ** 1.45)) : 1, spatial: true };
  }
  function connectSpace(gain, output, chain, pan, spatial, time) {
    if (spatial && typeof audio.createPanner === "function") {
      const panner = audio.createPanner();
      panner.panningModel = "equalpower";
      panner.rolloffFactor = 0; // Distance gain follows the gameplay listener in soundPosition.
      const angle = mixClamp(pan, -1, 1) * Math.PI * .5;
      if (panner.positionX) {
        panner.positionX.setValueAtTime(Math.sin(angle), time);
        panner.positionZ.setValueAtTime(-Math.cos(angle), time);
      } else panner.setPosition(Math.sin(angle), 0, -Math.cos(angle));
      gain.connect(panner); panner.connect(output); chain.push(panner);
    } else if (audio.createStereoPanner) {
      const panner = audio.createStereoPanner();
      panner.pan.setValueAtTime(pan, time);
      gain.connect(panner); panner.connect(output); chain.push(panner);
    } else gain.connect(output);
  }
  function holdGain(gain, time) {
    const value = gain.value;
    if (typeof gain.cancelAndHoldAtTime === "function") gain.cancelAndHoldAtTime(time);
    else {
      gain.cancelScheduledValues(time);
      gain.setValueAtTime(value, time);
    }
    return value;
  }
  function smoothGain(node, value, duration = 0.035, start = audio?.currentTime) {
    if (!audio || !node) return;
    const time = audio.currentTime;
    const held = holdGain(node.gain, time);
    if (start > time) node.gain.setValueAtTime(held, start);
    node.gain.linearRampToValueAtTime(value, Math.max(time, start) + duration);
  }
  function duckMusic(level, duration) {
    const time = audio.currentTime;
    if (time < duckUntil && level > duckPriority) return;
    duckPriority = level;
    duckUntil = time + duration;
    const gain = musicDuck.gain;
    holdGain(gain, time);
    gain.linearRampToValueAtTime(level, time + Math.min(.022, duration * .20));
    gain.setValueAtTime(level, time + duration * .40);
    gain.linearRampToValueAtTime(1, time + duration);
  }
  function retireVoice(voice, fade = 0.025) {
    if (!audio || !voices.has(voice)) return;
    voices.delete(voice);
    fadingVoices.add(voice);
    const time = audio.currentTime;
    holdGain(voice.gain.gain, time);
    voice.gain.gain.linearRampToValueAtTime(0, time + fade);
    try { voice.source.stop(time + fade + 0.005); } catch { /* 自然结束后 stop 可以无效。 */ }
  }
  function stopVoices(bus = null, fade = .025) {
    for (const voice of Array.from(voices)) {
      if (!bus || voice.bus === bus) retireVoice(voice, fade);
    }
  }
  function limitVoices(bus) {
    const sameBus = Array.from(voices).filter(voice => voice.bus === bus);
    const limit = bus === "music" ? 28 : bus === "ultimate" ? 8 : bus === "boss" || bus === "impact" ? 12 : 24;
    if (sameBus.length >= limit) retireVoice(sameBus[0], 0.008);
    if (voices.size >= MAX_VOICES) {
      // 蓄力与炮声有独立声部，密集射击和背景乐不会抢断它们。
      const expendable = Array.from(voices).find(voice => voice.bus === "impact") ||
        Array.from(voices).find(voice => voice.bus === "sfx") ||
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
      crescendo = false, loopNoise = false, endCutoff = cutoff, resonance = 0.65,
      spatial = false, attenuation = 1 } = options;
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
    const power = volume * attenuation;
    gain.gain.setValueAtTime(EPSILON, start);
    if (crescendo) {
      gain.gain.exponentialRampToValueAtTime(Math.max(EPSILON, power * 0.1), start + 0.015);
      gain.gain.exponentialRampToValueAtTime(Math.max(EPSILON, power), start + duration * 0.88);
    } else {
      gain.gain.exponentialRampToValueAtTime(Math.max(EPSILON, power), start + Math.min(attack, duration * 0.3));
      if (sustain) gain.gain.setValueAtTime(power, start + duration * 0.65);
    }
    gain.gain.exponentialRampToValueAtTime(EPSILON, start + duration);
    source.connect(filter); filter.connect(gain);
    connectSpace(gain, bus === "music" ? musicBus : sfxBus, chain, pan, spatial, start);
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
    return voice;
  }
  function sample(name, { bus = "sfx", time = audio.currentTime, level = .28, rate = 1,
    duration = Infinity, pan = 0, attenuation = 1, spatial = false } = {}) {
    const buffer = buffers.get(name);
    if (!buffer || !canPlay() || !limitVoices(bus)) return false;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = audio.createGain();
    const chain = [source, gain];
    source.connect(gain);
    const start = Math.max(time, audio.currentTime);
    if (pan || spatial) connectSpace(gain, sfxBus, chain, pan, spatial, start);
    else gain.connect(sfxBus);
    const length = Math.min(buffer.duration / rate, duration);
    gain.gain.setValueAtTime(level * attenuation, start);
    gain.gain.setValueAtTime(level * attenuation, start + Math.max(0, length - .05));
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
  function bossPresentationCue(kind, index, x = soundStage.bossX, y = soundStage.bossY) {
    if (!canPlay() || !presentationMotifs[index]) return;
    const [tone, slope, gap, texture, shape] = presentationMotifs[index];
    const time = audio.currentTime;
    const ending = kind === "death", gathering = kind === "transform";
    const ratio = ending ? .79 : gathering ? .91 : 1.16;
    const base = tone * ratio;
    const duration = (ending ? .63 : .38) + gap;
    const bus = "boss";
    const position = soundPosition(x, y, false);
    note({ bus, time, type: shape, duration, frequency: base, endFrequency: base * slope,
      volume: shape === "square" || shape === "sawtooth" ? .066 : .18, attack: gathering ? .13 : .007,
      cutoff: Math.min(texture, 720), endCutoff: ending ? 144 : Math.min(texture, 580), ...position });
    note({ bus, time: time + gap, type: "sine", duration: duration * .73,
      frequency: base * (slope > 1 ? 1.47 : .76), endFrequency: base * (ending ? .53 : 1.13),
      volume: .115, cutoff: 690, attack: .014, ...position });
    note({ bus, time: time + gap * .4, noise: true, duration: duration * .82, volume: ending ? .105 : .075,
      cutoff: texture, endCutoff: texture * (ending ? .21 : .48), resonance: 1.2,
      filterType: "bandpass", attack: gathering ? .10 : .009, ...position });
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
  function offlineBank(filename) {
    if (!offlineBanks.has(filename)) {
      offlineBanks.set(filename, new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = filename;
        script.onload = () => { script.remove(); resolve(); };
        script.onerror = () => { script.remove(); reject(new Error("Cannot load local audio bank")); };
        document.head.append(script);
      }));
    }
    return offlineBanks.get(filename);
  }
  async function audioBytes(name, faction, signal) {
    if (!offlineAudio) {
      const response = await fetch(`assets/audio/${name}.ogg`, { signal });
      return response.ok ? response.arrayBuffer() : null;
    }
    let encoded;
    if (faction || name === "victory") {
      await offlineBank("audio-faction-bank.js");
      encoded = name === "victory" ? starBreakerFactionAudio.victory[1]
        : starBreakerFactionAudio.factions[faction].layers[name.slice(faction.length + 1)][1];
    } else {
      await offlineBank("audio-bank.js");
      encoded = starBreakerAudioBank.stems[name]?.[1] ?? starBreakerAudioBank.effects[name];
    }
    if (disposed || signal?.aborted || !encoded) return null;
    if (typeof Uint8Array.fromBase64 === "function") return Uint8Array.fromBase64(encoded).buffer;
    const raw = atob(encoded);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
    return bytes.buffer;
  }
  async function decodeAudio(current, name, { faction, signal, loop = false } = {}) {
    try {
      const bytes = await audioBytes(name, faction, signal);
      if (!bytes || disposed || signal?.aborted || audio !== current) return null;
      const buffer = await current.decodeAudioData(bytes);
      if (loop) matchLoopSeam(buffer);
      return buffer;
    } catch {
      return null;
    }
  }
  function releaseFactionScore() {
    if (!requestedFaction) return;
    factionGeneration++;
    factionRequest?.abort();
    factionRequest = null;
    for (const name of scoreStemNames(requestedFaction)) buffers.delete(name);
    requestedFaction = factionLoading = "";
  }
  function requestFactionScore(theme) {
    if (!audio || muted || disposed || !factionScores?.[theme] || requestedFaction === theme) return;
    // Retiring the cache does not cut off existing sources during their fade.
    releaseFactionScore();
    requestedFaction = theme;
    const generation = ++factionGeneration;
    const current = audio;
    const names = scoreStemNames(theme);
    const request = new AbortController();
    factionRequest = request;
    factionLoading = theme;
    async function prepare() {
      for (const name of names) {
        const buffer = await decodeAudio(current, name, { faction: theme, signal: request.signal, loop: true });
        if (disposed || audio !== current || generation !== factionGeneration) return;
        if (buffer) buffers.set(name, buffer);
      }
      factionRequest = null;
      factionLoading = "";
      reconcile();
    }
    prepare().catch(() => {
      if (generation === factionGeneration) { factionRequest = null; factionLoading = ""; reconcile(); }
    });
  }
  function preloadBossScore(type) {
    if (Number.isInteger(type) && factions[type]) requestFactionScore(factions[type]);
    if (type === factions.length - 1) requestVictory();
  }
  function requestVictory() {
    if (!audio || muted || !factionScores || victoryLoading) return;
    const current = audio;
    victoryLoading = true;
    decodeAudio(current, "victory").then(buffer => {
      if (!buffer || disposed || audio !== current) return;
      buffers.set("victory", buffer);
      if (victoryActive) reconcile();
    });
  }
  function loadBank(current) {
    if (bankLoading || !catalog || typeof current.decodeAudioData !== "function") return;
    bankLoading = true;
    const request = new AbortController();
    bankRequest = request;
    async function decode(name) {
      const loop = name === "room" || Object.hasOwn(catalog.stems, name);
      const buffer = await decodeAudio(current, name, { signal: request.signal, loop });
      if (buffer && !disposed && audio === current) buffers.set(name, buffer);
    }
    async function prepare() {
      if (disposed) return;
      await Promise.all([...authoredStems.adventure, "room"].map(decode));
      if (audio !== current || disposed) return;
      reconcile();
      const remaining = [
        ...catalog.effects.filter(name => name !== "room"),
        ...(factionScores ? [] : authoredStems.boss),
      ];
      for (let index = 0; index < remaining.length && !disposed; index += 4) {
        await Promise.all(remaining.slice(index, index + 4).map(decode));
      }
      bankRequest = null;
      if (audio === current && !disposed) reconcile();
    }
    const begin = () => prepare().catch(() => { bankRequest = null; });
    // Local file playback still needs an embedded bank. Read it during idle so
    // the start button and initial movement can use the synthesized sounds.
    if (offlineAudio && typeof window.requestIdleCallback === "function") window.requestIdleCallback(begin, { timeout: 800 });
    else begin();
  }
  function updateScoreMix() {
    if (!liveScore) return;
    const [base, rhythm, finale] = liveScore.layers;
    const faction = factionScores?.[liveScore.theme];
    if (faction) {
      // A/B are already on one authored sample-aligned timeline. Gain
      // changes begin at the next half-beat without restarting any layer.
      const mixKey = bossMusicTier + "/" + overdriveMusic;
      if (liveScore.mixKey === mixKey) return;
      const now = audio.currentTime;
      const beat = 30 / faction.bpm;
      const elapsed = Math.max(0, now - liveScore.start) + liveScore.offset;
      const nextBeat = beat - elapsed % beat;
      const start = liveScore.mixKey ? now + nextBeat : Math.max(now, liveScore.start);
      liveScore.mixKey = mixKey;
      const tiers = [[.93, .08, 0], [.81, .67, .06], [.70, .75, .89]];
      const [harmony, pressure, climax] = tiers[bossMusicTier];
      smoothGain(liveScore.ambience, .055, .38, start);
      smoothGain(base, harmony, .48, start);
      smoothGain(rhythm, pressure + (overdriveMusic ? .08 : 0), .55, start);
      smoothGain(finale, climax, .57, start);
    } else if (bossActive) {
      const exposed = bossPhase === "recover";
      smoothGain(liveScore.ambience, .055, .38);
      smoothGain(base, exposed ? .72 : .83, .24);
      smoothGain(rhythm, .31 + threat * .15 + (overdriveMusic ? .13 : 0), .24);
      smoothGain(finale, bossPhase === "finale" ? .66 : enraged ? .20 + threat * .065 : 0, .42);
    } else {
      smoothGain(liveScore.ambience, .23, .38);
      smoothGain(base, .82, .22);
      smoothGain(rhythm, overdriveMusic ? .89 : .30 + comboLayer * .12, .32);
    }
  }
  function startScore(theme) {
    const names = scoreStemNames(theme);
    const clips = names.map(name => buffers.get(name));
    const intended = factionScores?.[theme]?.layers.harmony ?? catalog.stems[names[0]];
    const duration = Math.min(...clips.map(clip => clip.duration), intended);
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
    if (!musicPlaying || !canPlay("music") || (!factionScores && (warningActive || cinematicActive))) return;
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
  function stopMusic(fade = .035, silence = true) {
    if (scheduler !== null) window.clearTimeout(scheduler);
    scheduler = null;
    if (liveScore) {
      const { theme, start, offset, duration } = liveScore;
      scoreOffsets[theme] = (offset + Math.max(0, audio.currentTime - start)) % duration;
      liveScore = null;
    } else if (!musicPlaying) return;
    musicPlaying = false;
    if (silence) smoothGain(musicBus, 0, fade);
    stopVoices("music", fade);
  }
  function stopVictory(reset = false) {
    if (victoryVoice) {
      const current = victoryVoice;
      victoryVoice = null;
      victoryOffset = Math.min(current.duration, current.offset + Math.max(0, audio.currentTime - current.start));
      retireVoice(current.voice, .09);
    }
    if (reset) victoryOffset = 0;
  }
  function playVictory() {
    const clip = buffers.get("victory");
    if (!clip || victoryVoice || victoryOffset >= clip.duration - .015 || !limitVoices("victory")) return;
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    source.buffer = clip;
    gain.gain.value = .84;
    source.connect(gain); gain.connect(musicBus);
    const voice = trackVoice(source, gain, "victory", [source, gain]);
    const start = audio.currentTime + .025;
    const offset = victoryOffset;
    victoryVoice = { voice, start, offset, duration: clip.duration };
    const release = source.onended;
    source.onended = () => {
      release();
      if (victoryVoice?.voice === voice) {
        victoryOffset = clip.duration;
        victoryVoice = null;
      }
    };
    source.start(start, offset);
  }
  function victorySequence(playing) {
    if (victoryActive === !!playing) return;
    victoryActive = !!playing;
    if (!victoryActive) stopVictory(true);
    reconcile();
  }
  function reconcile() {
    if (!audio) return;
    smoothGain(sfxBus, paused ? .16 : .65, .12);
    if (victoryActive) {
      stopMusic(.25, false);
      if (!canPlay("music") || !visible) { stopVictory(); return; }
      requestVictory();
      smoothGain(musicBus, .62, .26);
      playVictory();
      return;
    }
    if (!canPlay("music")) {
      stopMusic();
      stopVoices();
      return;
    }
    loadBank(audio);
    if (!factionScores && (warningActive || cinematicActive)) { stopMusic(); return; }
    const theme = cinematicActive && liveScore ? liveScore.theme
      : bossActive ? (factionScores ? currentFaction() : "boss") : "adventure";
    if (bossActive && factionScores) requestFactionScore(theme);
    const musicLevel = (paused ? .25 : 1) * (warningActive ? .31 : cinematicActive ? .46 : 1);
    const ready = scoreStemNames(theme).every(name => buffers.has(name));
    if (!ready && liveScore && (liveScore.theme === theme || factionLoading === theme)) {
      smoothGain(musicBus, .39 * musicLevel, .18);
      return;
    }
    if (theme !== musicTheme) {
      stopMusic(factionScores ? .24 : .025, false);
      musicTheme = theme;
      scoreOffsets[theme] = 0;
      musicStep = 0;
    }
    if (ready) {
      if (musicPlaying) stopMusic(.20, false);
      smoothGain(musicBus, (factionScores?.[theme] || bossActive ? .59 : .52) * musicLevel, .2);
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
    master.gain.value = muted ? 0 : 0.68 * volume ** 2;
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
    smoothGain(master, muted ? 0 : 0.68 * volume ** 2);
    reconcile();
  }
  function setVolume(value) {
    if (!Number.isFinite(value)) return;
    volume = mixClamp(value, 0, 1);
    try { window.localStorage.setItem(volumeKey, String(volume)); } catch { /* Keep the session level. */ }
    smoothGain(master, muted ? 0 : .68 * volume ** 2);
  }
  function sync(nextActive, nextBossActive, nextEnraged = false, context = {}) {
    context ??= {};
    const combo = Number.isFinite(context?.combo) ? Math.max(0, context.combo) : 0;
    const nextComboLayer = combo >= 20 ? 3 : combo >= 12 ? 2 : combo >= 6 ? 1 : 0;
    const nextWarning = !!context?.warning;
    const nextCinematic = !!context?.cinematic;
    const nextPaused = !!context?.paused;
    const nextOverdrive = !!context?.overdrive;
    const nextType = Number.isInteger(context?.bossType) ? context.bossType : null;
    const nextPhase = context?.bossPhase ?? null;
    const nextVisible = context.visible !== false;
    const health = Number.isFinite(context.bossHealth) ? context.bossHealth : nextEnraged ? .64 : 1;
    const nextTier = nextCinematic && !nextBossActive ? bossMusicTier
      : nextPhase === "finale" || health <= .33 ? 2 : health <= .66 ? 1 : 0;
    const nextThreat = (nextEnraged ? 1 : 0) + (nextPhase === "attack" || nextPhase === "finale" ? 1 : 0)
      + (Number.isFinite(context?.lives) && context.lives <= 1 ? 1 : 0);
    const entering = nextPhase === "enter" && (bossPhase !== nextPhase || bossType !== nextType);
    const transforming = nextPhase === "finale" && bossPhase !== nextPhase;
    const changed = active !== !!nextActive || paused !== nextPaused || bossActive !== !!nextBossActive || enraged !== !!nextEnraged ||
      comboLayer !== nextComboLayer || warningActive !== nextWarning || cinematicActive !== nextCinematic ||
      overdriveMusic !== nextOverdrive || bossType !== nextType || bossPhase !== nextPhase || threat !== nextThreat
      || bossMusicTier !== nextTier || visible !== nextVisible;
    const wasActive = active;
    const wasInBossSequence = bossActive || warningActive || cinematicActive;
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
    bossMusicTier = nextTier;
    visible = nextVisible;
    threat = nextThreat;
    for (const key in soundStage) {
      if (Number.isFinite(context[key])) soundStage[key] = key === "width" || key === "height" ? Math.max(1, context[key]) : context[key];
    }
    const inBossSequence = bossActive || warningActive || cinematicActive;
    if (!inBossSequence && (wasInBossSequence || (!active && !paused && visible))) releaseFactionScore();
    if ((nextWarning || nextBossActive) && factionScores && Number.isInteger(nextType)) requestFactionScore(currentFaction());
    if (changed) reconcile();
    if (wasActive && canPlay() && (entering || transforming)) {
      duckMusic(.39, 1.05);
      const position = soundPosition(soundStage.bossX, soundStage.bossY, false);
      sample("stage", { bus: "boss", level: .37, ...position });
      bossVoice({ level: .47, rate: transforming ? .79 : 1, ...position });
    }
  }
  function shoot(overdrive = false, tier = 1, fighter = "red") {
    if (!canPlay()) return;
    const time = audio.currentTime;
    if (time - lastShotTime < 0.043) return;
    lastShotTime = time;
    const weight = Math.min(4, Math.max(0, tier - 1));
    // Lower only the repeatable muzzle layer. Overdrive activation, hazards,
    // shields and special-weapon cues retain their own mix and timing.
    const shotLevel = overdrive ? .68 : .66;
    const cannon = fighter === "yellow" ? "gold" : fighter === "blue" ? "blue" : "red";
    if (sample("shot_" + cannon, { level: (overdrive ? .25 : .19) * shotLevel,
      rate: 1.05 - weight * .048 - (overdrive ? .11 : 0) + .065 * Math.random() })) return;
    if (overdrive) {
      // 保留清晰的短射击节奏，以较低的主音和低频脉冲表现引擎过载。
      note({ time, duration: 0.065, frequency: 920, endFrequency: 320,
        type: "triangle", volume: 0.085 * shotLevel, cutoff: 2300 });
      note({ time, duration: 0.027, frequency: 1300, endFrequency: 650,
        type: "square", volume: 0.013 * shotLevel, cutoff: 2100 });
      note({ time, duration: 0.065, frequency: 110, endFrequency: 65,
        type: "sine", volume: 0.07 * shotLevel, cutoff: 360 });
      return;
    }
    note({ time, duration: 0.043 + weight * .005, frequency: 1400 / (1 + weight * .12), endFrequency: 510 / (1 + weight * .1),
      type: "triangle", volume: 0.082 * shotLevel, cutoff: 3300 });
    note({ time, duration: 0.023, frequency: 2100, endFrequency: 1050,
      type: "square", volume: 0.016 * shotLevel, cutoff: 2800 });
    if (weight) note({ time, duration: .055, frequency: 145 - weight * 12, endFrequency: 75,
      type: "sine", volume: (.025 + weight * .006) * shotLevel, cutoff: 400 });
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
  function hit(isBoss, source = "", x, y) {
    if (!canPlay()) return false;
    const time = audio.currentTime;
    const heavy = source === "ultimate" || source === "crimson-heavy" || source === "evolution-lance" || source === "evolution-ember";
    // A cannon impact may interrupt the ordinary-hit rhythm, but neither rapid
    // fire nor a screen-wide barrage can stack an unbounded number of transients.
    if (heavy ? time - lastHeavyImpactTime < .16
      : time - lastImpactTime < .075 || time - lastHeavyImpactTime < .09) return false;
    impactBudget = Math.min(4, impactBudget + Math.max(0, time - impactBudgetAt) * 10);
    impactBudgetAt = time;
    const cost = heavy ? 1.75 : 1;
    const layers = heavy ? 4 : 3;
    const occupied = [...voices, ...fadingVoices].filter(voice => voice.bus === "impact").length;
    // Ordinary fire leaves one heavy-impact budget in reserve.
    if (impactBudget < cost + (heavy ? 0 : 1.75) || occupied + layers > 12
      || voices.size + fadingVoices.size + layers > 44) return false;
    impactBudget -= cost;
    if (heavy) lastHeavyImpactTime = time;
    lastImpactTime = time;
    const position = soundPosition(x, y);
    position.attenuation = Math.max(isBoss ? .60 : .44, position.attenuation);
    const common = { bus: "impact", time, ...position };
    const weight = heavy ? 1 : .62;
    // Fighter hits crack quickly like a small explosive shell; a living Boss
    // answers with a lower, damped body thump. Final deaths use explode(), not
    // an extra copy of this impact, so the collapse retains its own silhouette.
    note({ ...common, noise: true, duration: heavy ? .060 : isBoss ? .047 : .036,
      volume: (isBoss ? .13 : .20) * weight, filterType: "bandpass",
      cutoff: isBoss ? 1050 : 2650, endCutoff: isBoss ? 300 : 780,
      resonance: .55, attack: .001 });
    note({ ...common, time: time + .004, type: "sine", duration: isBoss ? (heavy ? .29 : .18) : (heavy ? .19 : .105),
      frequency: isBoss ? (heavy ? 94 : 132) : 195, endFrequency: isBoss ? (heavy ? 36 : 48) : 78,
      volume: (isBoss ? .52 : .34) * weight, cutoff: isBoss ? 430 : 600, endCutoff: 140, attack: .003 });
    note({ ...common, time: time + .011, noise: true, duration: isBoss ? (heavy ? .22 : .115) : (heavy ? .15 : .090),
      filterType: isBoss ? "bandpass" : "lowpass", cutoff: isBoss ? (heavy ? 1200 : 720) : 3700,
      endCutoff: isBoss ? 200 : 570, volume: (isBoss ? .16 : .19) * weight, resonance: .62, attack: .005 });
    if (heavy) {
      note({ ...common, time: time + .008, type: "triangle", duration: .18,
        frequency: isBoss ? 205 : 290, endFrequency: isBoss ? 58 : 81,
        volume: isBoss ? .09 : .075, cutoff: isBoss ? 620 : 850, endCutoff: 190, attack: .004 });
      duckMusic(.79, .16);
    }
    return true;
  }
  function hurt() {
    if (!canPlay()) return;
    duckMusic(.46, .41);
    if (sample("hurt", { level: .50 })) return;
    note({ duration: .27, frequency: 214, endFrequency: 79, type: "triangle", volume: .23, cutoff: 1400 });
    note({ noise: true, duration: .13, volume: .15, filterType: "bandpass", cutoff: 2060, endCutoff: 450 });
  }
  function explode(isBoss = false, x, y) {
    if (!canPlay()) return;
    const time = audio.currentTime;
    if (isBoss ? time - lastBossExplosionTime < 0.2 : time - lastExplosionTime < 0.075) return;
    if (isBoss) lastBossExplosionTime = time; else lastExplosionTime = time;
    const position = soundPosition(x, y);
    if (isBoss) position.attenuation = Math.max(.37, position.attenuation);
    const weight = (isBoss ? 1.2 : 1) * position.attenuation;
    const variation = 0.93 + Math.random() * 0.14;
    if (sample(isBoss ? "collapse" : "blast", { bus: isBoss ? "boss" : "sfx",
      level: isBoss ? .66 : .35, rate: variation, ...position })) {
      if (isBoss) {
        duckMusic(.28, 1.22);
        bossVoice({ level: .52, rate: .68, time: time + .14, ...position });
      }
      return;
    }
    // 爆裂冲击 → 宽频火团 → 鼓腔低震 → 碎片尾音；滤波随衰减收暗，不做塑料般的高音滑音。
    const world = { spatial: position.spatial, pan: position.pan };
    note({ time, ...world, noise: true, duration: 0.075, volume: 0.17 * weight,
      filterType: "bandpass", cutoff: 1900, endCutoff: 1000, resonance: 0.45, attack: 0.001 });
    note({ time, ...world, noise: true, duration: isBoss ? 0.42 : 0.25, volume: 0.27 * weight,
      cutoff: 6500, endCutoff: 720, attack: 0.002 });
    note({ time: time + 0.015, ...world, noise: true, duration: isBoss ? 1.3 : 0.62,
      volume: 0.27 * weight, cutoff: 1300, endCutoff: 160, attack: 0.01 });
    note({ time, ...world, duration: isBoss ? 0.95 : 0.5, frequency: 82 * variation,
      endFrequency: isBoss ? 26 : 34, type: "sine", volume: 0.32 * weight,
      cutoff: 350, attack: 0.002 });
    note({ time: time + 0.035, ...world, duration: isBoss ? 0.62 : 0.32, frequency: 132 * variation,
      endFrequency: 56, type: "triangle", volume: 0.075 * weight, cutoff: 550, endCutoff: 160 });
    note({ time: time + 0.07, ...world, noise: true, duration: isBoss ? 0.7 : 0.27,
      volume: 0.07 * weight, filterType: "bandpass", cutoff: 1500, endCutoff: 410,
      pan: mixClamp(position.pan + Math.random() * .16 - .08, -.68, .68) });
    if (isBoss) {
      note({ time: time + 0.2, ...world, noise: true, duration: 0.9, volume: 0.19 * weight,
        cutoff: 2900, endCutoff: 200 });
      note({ time: time + 0.22, ...world, duration: 0.9, frequency: 66, endFrequency: 27,
        type: "sine", volume: 0.23 * weight, cutoff: 300 });
    }
  }
  function warning() {
    if (!canPlay()) return;
    const time = audio.currentTime;
    if (time - lastWarningTime < 1.5) return;
    lastWarningTime = time;
    duckMusic(.52, 1.05);
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
  function bossAttack(kind = "volley", x = soundStage.bossX, y = soundStage.bossY, signature = true) {
    if (!canPlay()) return;
    if (!Object.hasOwn(bossCueIntervals, kind)) kind = "volley";
    const time = audio.currentTime;
    if (time - (lastBossAttack.get(kind) ?? -Infinity) < bossCueIntervals[kind]) return;
    lastBossAttack.set(kind, time);
    const position = soundPosition(x, y, !signature);
    const pressure = kind === "surge" || kind === "beam" || kind === "cannon";
    const cue = pressure ? "pressure" : kind === "coil" ? "stage" : kind === "whip" ? "snap" : "hit_organic";
    const level = pressure ? .48 : kind === "volley" ? .17 : .31;
    // Give the actionable cue room through its attack and early tail. The old
    // 150 ms dip recovered before the 450–620 ms warning/voice was readable.
    // Ordinary volleys never duck the mix, avoiding continuous pumping.
    if (signature && kind !== "volley") {
      const windup = kind === "coil";
      duckMusic(windup ? .56 : pressure ? .58 : .68, windup ? .65 : pressure ? .55 : .42);
    }
    if (sample(cue, { bus: "boss", level, rate: kind === "beam" ? 1.37 : 1,
      duration: kind === "coil" ? .45 : Infinity, ...position })) {
      if (pressure) {
        const pitch = signature ? presentationMotifs[bossType]?.[0] ?? 66 : 83;
        note({ bus: "boss", time, duration: kind === "surge" ? .43 : .29, frequency: Math.min(94, pitch),
          endFrequency: 27, type: "sine", volume: .18, cutoff: 460, ...position });
      }
      if (signature && time - lastBossVoiceTime > (pressure ? .38 : .62)
        && bossVoice({ level: pressure ? .40 : .29, rate: kind === "coil" ? .87 : 1.12,
          duration: pressure ? 1.08 : .62, ...position })) lastBossVoiceTime = time;
      return;
    }
    const common = { bus: "boss", time, ...position };
    if (kind === "coil") {
      note({ ...common, duration: 0.42, frequency: 57, endFrequency: 144, type: "sawtooth",
        volume: 0.22, cutoff: 160, endCutoff: 800, resonance: 1.6, crescendo: true });
      note({ ...common, noise: true, duration: 0.36, volume: 0.16, filterType: "bandpass",
        cutoff: 170, endCutoff: 990, crescendo: true });
    } else if (kind === "whip") {
      note({ ...common, noise: true, duration: 0.24, volume: 0.28, filterType: "bandpass",
        cutoff: 2300, endCutoff: 260, resonance: 0.8 });
      note({ ...common, duration: 0.32, frequency: 159, endFrequency: 38, type: "triangle",
        volume: 0.32, cutoff: 720, endCutoff: 120 });
      note({ ...common, time: time + 0.036, noise: true, duration: 0.37, volume: 0.115,
        filterType: "bandpass", cutoff: 520, endCutoff: 120, resonance: 1.6 });
    } else if (kind === "hatch") {
      for (let pulse = 0; pulse < 3; pulse++) note({ ...common, time: time + pulse * 0.073,
        duration: 0.27, frequency: 68 + pulse * 15, endFrequency: 34 + pulse * 5,
        type: "triangle", volume: 0.2 - pulse * 0.036, cutoff: 560, endCutoff: 220,
        resonance: 2 });
      note({ ...common, noise: true, duration: 0.34, volume: 0.15, filterType: "bandpass",
        cutoff: 350, endCutoff: 150, attack: 0.024, resonance: 3 });
    } else if (kind === "surge") {
      note({ ...common, duration: 0.45, frequency: 102, endFrequency: 34, type: "sawtooth",
        volume: 0.23, cutoff: 780, endCutoff: 200, attack: 0.01 });
      note({ ...common, duration: 0.5, frequency: 69, endFrequency: 33, type: "sine",
        volume: 0.26, cutoff: 210, attack: 0.01 });
      note({ ...common, noise: true, duration: 0.37, volume: 0.2, filterType: "bandpass",
        cutoff: 1320, endCutoff: 220, resonance: 1.3 });
    } else if (kind === "beam" || kind === "cannon") {
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
        type: "sine", volume: 0.07, cutoff: 850, attack: 0.04 });
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
    const position = soundPosition(soundStage.bossX, soundStage.bossY, false);
    if (sample("stage", { bus: "boss", level: .55, ...position })) {
      bossVoice({ level: .53, rate: .83, time: time + .10, ...position });
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
  const fieldVoices = {
    "mine-arm": [880, 640, .11, .09, 1700],
    "mine-defuse": [510, 240, .23, .13, 1560],
    "mine-burst": [122, 29, .42, .23, 540],
    "guard-link": [412, 590, .20, .12, 1960],
    "splitter": [263, 137, .26, .14, 1100],
    "catapult": [94, 380, .67, .20, 1080],
    "cover-hit": [930, 440, .10, .095, 2440],
    "impact-critical": [705, 480, .085, .075, 2160],
    "impact-weak": [1125, 820, .12, .073, 2620],
    "impact-finale": [175, 62, .31, .11, 850],
    "rock-shatter": [103, 32, .37, .20, 810],
    "gravity-tide": [78, 140, .48, .17, 610],
  };
  const lastFieldCue = new Map();
  function fieldCue(kind, x, y) {
    if (!canPlay() || !Object.hasOwn(fieldVoices, kind)) return;
    const time = audio.currentTime;
    if (time - (lastFieldCue.get(kind) ?? -Infinity) < .17) return;
    lastFieldCue.set(kind, time);
    const [frequency, endFrequency, duration, volume, cutoff] = fieldVoices[kind];
    const position = soundPosition(x, y);
    const heavy = duration >= .35;
    note({ time, frequency, endFrequency, duration, volume, cutoff,
      type: heavy ? "sine" : "triangle", attack: .007, ...position });
    if (heavy || kind === "cover-hit" || kind === "splitter") note({ time, noise: true,
      duration: duration * .82, volume: volume * .65, cutoff: cutoff * 2.1, endCutoff: cutoff * .62,
      filterType: "bandpass", ...position });
  }
  function radioCue(kind, pan = -.38) {
    if (!canPlay()) return;
    const time = audio.currentTime;
    const cleared = kind === "clear" || kind === "cleared";
    const radioPan = Number.isFinite(pan) ? mixClamp(pan, -.60, .60) : -.38;
    duckMusic(.63, .54);
    note({ time, noise: true, duration: .116, volume: .115, filterType: "bandpass",
      cutoff: 1780, endCutoff: 1360, resonance: 1.5, pan: radioPan });
    for (let index = 0; index < 2; index++) {
      const frequency = cleared ? 659 * (index ? 1.25 : 1) : 470 * (index ? .87 : 1);
      note({ time: time + .07 + index * .075, duration: .083,
        type: "triangle", frequency, endFrequency: frequency * .98, cutoff: 1870, volume: .075, pan: radioPan });
    }
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
    bankRequest?.abort();
    releaseFactionScore();
    stopMusic();
    stopVictory(true);
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
  return { unlock, setMuted, get muted() { return muted; }, setVolume, get volume() { return volume; },
    sync, shoot, hit, hurt, overdrive, perfectShield, explode, warning, bossAttack, bossEnrage, fieldCue, radioCue,
    bossPresentationCue, victorySequence, preloadBossScore, chargeUltimate, fireUltimate, stopUltimate, destroy };
})();
