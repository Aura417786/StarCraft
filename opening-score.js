"use strict";

function createOpeningScore(muted) {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (muted || !Audio) return null;
  let context;
  try { context = new Audio(); } catch { return null; }
  const master = context.createGain();
  const room = context.createBiquadFilter();
  room.type = "lowpass";
  room.frequency.value = 2500;
  master.gain.value = .22;
  room.connect(master);
  master.connect(context.destination);
  const ambiences = [41.2, 55, 65.41].map((frequency, index) => {
    const oscillator = context.createOscillator(), level = context.createGain();
    oscillator.type = index === 0 ? "sine" : "triangle";
    oscillator.frequency.value = frequency;
    level.gain.value = 0;
    oscillator.connect(level); level.connect(room); oscillator.start();
    return { oscillator, level };
  });
  const sample = context.createBuffer(1, Math.round(context.sampleRate * 1.4), context.sampleRate);
  const noise = sample.getChannelData(0);
  let generator = 92381, bass = 0;
  for (let i = 0; i < noise.length; i++) {
    generator = Math.imul(generator, 1664525) + 1013904223 | 0;
    bass = bass * .81 + generator / 2147483648 * .19;
    noise[i] = bass;
  }
  let previousBeat = -1, previousScene = -1, previousTime = 0;
  let rate = 1;
  const voices = new Set();

  // Envelopes and pitch glides use score seconds. A held note can cross a
  // Shift transition, so re-anchor its remaining envelope at the audio clock.
  function playVoice(source, gain, duration, volume, attack, glide) {
    let offset = 0, anchor = context.currentTime;
    function schedule(previousRate) {
      const now = context.currentTime;
      offset = Math.min(duration, offset + (now - anchor) * previousRate);
      anchor = now;
      const remaining = (duration - offset) / rate;
      if (!remaining) return;
      const attackPart = Math.min(1, offset / attack);
      const decayPart = Math.max(0, (offset - attack) / (duration - attack));
      const amplitude = .0001 * (volume / .0001) ** (attackPart - decayPart);
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(amplitude, now);
      if (offset < attack) gain.gain.exponentialRampToValueAtTime(volume, now + (attack-offset)/rate);
      gain.gain.exponentialRampToValueAtTime(.0001, now+remaining);
      if (glide) {
        source.frequency.cancelScheduledValues(now);
        source.frequency.setValueAtTime(glide[0]*(glide[1]/glide[0])**(offset/duration),now);
        source.frequency.exponentialRampToValueAtTime(glide[1],now+remaining);
      } else source.playbackRate.setValueAtTime(rate,now);
      source.stop(now + remaining + .03/rate);
    }
    source.onended = () => voices.delete(schedule);
    voices.add(schedule);
    source.start(anchor);
    schedule(rate);
  }

  function tone(frequency, duration, volume, to = frequency, shape = "sine") {
    const source = context.createOscillator(), gain = context.createGain();
    source.type = shape;
    source.connect(gain); gain.connect(room);
    playVoice(source,gain,duration,volume,Math.min(.05,duration*.1),[frequency,to]);
  }

  function texture(duration, volume, frequency) {
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = sample;
    filter.type = "bandpass"; filter.frequency.value = frequency; filter.Q.value = .69;
    source.connect(filter); filter.connect(gain); gain.connect(room);
    playVoice(source,gain,duration,volume,.025);
  }

  return {
    setRate(next) {
      const previous = rate;
      rate = next;
      for (const reschedule of voices) reschedule(previous);
    },
    resume() { context.resume().catch(() => {}); },
    suspend() { context.suspend().catch(() => {}); },
    tick(t) {
      const scene = t < 23 ? 0 : t < 59 ? 1 : t < 83 ? 2 : t < 121 ? 3 : t < 139 ? 4 : 5;
      const speed = [3.6, 1.9, 1.58, 1.35, .98, .72][scene];
      if (scene !== previousScene) {
        const chords = [[41.2, 55, 65.41], [43.65, 58.27, 65.41], [38.89, 58.27, 77.78],
          [41.2, 61.74, 82.41], [36.71, 55, 73.42], [41.2, 61.74, 82.41]];
        ambiences.forEach(({ oscillator, level }, i) => {
          oscillator.frequency.setTargetAtTime(chords[scene][i], context.currentTime, .39 / rate);
          level.gain.setTargetAtTime(i === 0 ? .14 : .033, context.currentTime, .72 / rate);
        });
        previousScene = scene;
        previousBeat = -1;
      }
      const beat = Math.floor(t / speed);
      if (beat !== previousBeat) {
        const strong = beat % 4 === 0;
        if (scene >= 1) tone(strong ? 83 : 66, .31, strong ? .23 : .10, 34);
        if (strong || (scene >= 3 && beat % 4 === 2)) tone([247, 220, 293.7, 329.6][Math.floor(beat / 4) % 4],
          1.6, scene < 2 ? .047 : .073, undefined, "triangle");
        if (scene >= 3 && beat % 2 === 1) texture(.25, .078, 800);
        previousBeat = beat;
      }
      for (const [cue, duration, volume, frequency] of [
        [12.2, .82, .17, 270], [23.2, .44, .15, 630], [47.1, 1.12, .27, 150],
        [83.1, .86, .14, 380], [127.52, .32, .24, 1150], [133.40, .52, .26, 590],
        [134.5, 1.3, .31, 250], [139.2, .87, .25, 130], [145.30, .65, .46, 195],
      ]) if (previousTime < cue && cue <= t && t - cue < .30) texture(duration, volume, frequency);
      previousTime = t;
    },
    dispose() {
      master.gain.setTargetAtTime(0, context.currentTime, .10);
      window.setTimeout(() => context.close().catch(() => {}), 330);
    },
  };
}
