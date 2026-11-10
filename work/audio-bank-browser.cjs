"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { chromium } = require("playwright");

const output = process.argv[2] ? path.resolve(process.argv[2]) : null;
function writeStereoWav(name, record) {
  if (!output) return;
  const pcm = Buffer.from(record.data, "base64");
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22); header.writeUInt32LE(record.sampleRate, 24);
  header.writeUInt32LE(record.sampleRate * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(path.join(output, name + ".wav"), Buffer.concat([header, pcm]));
}

async function run() {
  if (output) fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.setDefaultTimeout(16000);
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    const proof = { sources: [], decoded: [], pending: null, meter: null, gains: [] };
    window.audioProof = proof;
    window.requestAnimationFrame = () => 0;
    const originalDecode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function (encoded) {
      return originalDecode.call(this, encoded).then(buffer => {
        proof.decoded.push([buffer.duration, buffer.numberOfChannels, buffer.length]);
        return buffer;
      });
    };
    const sourceGain = new WeakMap(), gainTraces = new WeakMap();
    const originalCreateGain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const node = originalCreateGain.call(this), trace = [];
      proof.gains.push(trace);
      gainTraces.set(node.gain, trace);
      return node;
    };
    const gainRamp = AudioParam.prototype.linearRampToValueAtTime;
    AudioParam.prototype.linearRampToValueAtTime = function (value, time) {
      gainTraces.get(this)?.push({ value, time });
      return gainRamp.call(this, value, time);
    };
    const originalStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (time, offset) {
      if (this.buffer) {
        const clip = this.buffer.getChannelData(0), gain = sourceGain.get(this), trace = [];
        if (gain) gainTraces.set(gain, trace);
        proof.sources.push({ time, offset, loop: this.loop, loopEnd: this.loopEnd,
          duration: this.buffer.duration, rate: this.playbackRate.value, trace,
          seam: this.loop ? Math.abs(clip[clip.length - 1] - clip[0]) : null });
      }
      return originalStart.apply(this, arguments);
    };
    const originalConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (target) {
      if (this instanceof AudioBufferSourceNode && target instanceof GainNode) sourceGain.set(this, target.gain);
      if (target === this.context.destination && this instanceof DynamicsCompressorNode && !proof.meter) {
        const current = this.context;
        const recorder = current.createScriptProcessor(1024, 2, 2);
        const sink = current.createGain(); sink.gain.value = 0;
        originalConnect.call(this, recorder);
        originalConnect.call(recorder, sink);
        originalConnect.call(sink, current.destination);
        proof.meter = recorder;
        recorder.onaudioprocess = event => {
          const pending = proof.pending;
          if (!pending) return;
          const left = event.inputBuffer.getChannelData(0), right = event.inputBuffer.getChannelData(1);
          for (let index = 0; index < left.length && pending.frame < pending.frames; index++) {
            const a = left[index], b = right[index], out = pending.frame * 2;
            pending.peak = Math.max(pending.peak, Math.abs(a), Math.abs(b));
            pending.sumL += a * a; pending.sumR += b * b;
            pending.samples[out] = Math.round(Math.min(.9999, Math.max(-.9999, a)) * 32767);
            pending.samples[out + 1] = Math.round(Math.min(.9999, Math.max(-.9999, b)) * 32767);
            pending.frame++;
          }
          if (pending.frame >= pending.frames) {
            proof.pending = null;
            const bytes = new Uint8Array(pending.samples.buffer);
            let encoded = "";
            for (let index = 0; index < bytes.length; index += 8192) encoded += String.fromCharCode(...bytes.subarray(index, index + 8192));
            pending.resolve({ sampleRate: current.sampleRate, peak: pending.peak,
              rmsL: Math.sqrt(pending.sumL / pending.frames), rmsR: Math.sqrt(pending.sumR / pending.frames), data: btoa(encoded) });
          }
        };
      }
      return originalConnect.apply(this, arguments);
    };
    proof.capture = seconds => new Promise(resolve => {
      const frames = Math.ceil(seconds * proof.meter.context.sampleRate);
      proof.pending = { frames, frame: 0, resolve, samples: new Int16Array(frames * 2), peak: 0, sumL: 0, sumR: 0 };
    });
  });

  const waitFor = (predicate, argument) => page.waitForFunction(predicate, argument, { polling: 40 });
  const report = { factions: {}, recordings: {} };
  async function capture(name, seconds = .95, options = {}) {
    const sample = await page.evaluate(({ seconds, thresholds, dense }) => {
      if (thresholds) {
        setTimeout(() => { boss.hp = .65; syncGameAudio(); }, 1800);
        setTimeout(() => { boss.hp = .32; syncGameAudio(); }, 3750);
      }
      if (dense) for (let index = 0; index < 25; index++) setTimeout(() => {
        gameAudio.shoot(index % 2 === 0, 5, "red");
        gameAudio.explode(index % 6 === 0, 140 + index * 43, 360);
        gameAudio.bossAttack(index % 4 === 0 ? "beam" : "whip", 1030, 395);
        if (index === 7) gameAudio.fireUltimate("red");
        if (index === 14) gameAudio.perfectShield();
      }, 66 * index);
      return audioProof.capture(seconds);
    }, { seconds, ...options });
    writeStereoWav(name, sample);
    const { data, ...stats } = sample;
    report.recordings[name] = stats;
    return stats;
  }
  try {
    await page.goto(pathToFileURL(path.resolve(__dirname, "..", "index.html")).href);
    const closeGuide = page.locator(".flight-guide-actions button").first();
    if (await closeGuide.isVisible()) await closeGuide.click();
    await page.locator("#start-button").click();
    await page.evaluate(() => {
      if (typeof skipFlightTutorial === "function") skipFlightTutorial();
      syncGameAudio();
    });
    await waitFor(() => audioProof.sources.filter(voice => voice.loop && voice.duration > 30).length >= 2);
    const flight = await page.evaluate(() => audioProof.sources.filter(voice => voice.loop && voice.duration > 30));
    assert.equal(flight.length, 2);
    assert.equal(flight[0].time, flight[1].time);
    assert.ok(Math.abs(flight[0].loopEnd - 33.103) < .003);
    assert.ok(flight.every(voice => voice.seam < .00001));
    await waitFor(() => audioProof.decoded.some(([duration]) => Math.abs(duration - 15) < .01));
    for (const [name, type, duration] of [["bio", 0, 68.571], ["mechanical", 2, 61.935], ["void", 8, 73.846]]) {
      await page.evaluate(type => {
        spawnBoss(type);
        boss.phase = "recover";
        boss.hp = 1;
        syncGameAudio();
      }, type);
      await waitFor(duration => audioProof.sources.filter(voice => voice.loop && Math.abs(voice.duration - duration) < .004).length >= 3, duration);
      const layers = () => page.evaluate(duration => audioProof.sources.filter(voice => voice.loop && Math.abs(voice.duration - duration) < .004), duration);
      const stems = await layers();
      assert.equal(stems.length, 3);
      assert.equal(new Set(stems.map(voice => voice.time)).size, 1);
      assert.equal(new Set(stems.map(voice => voice.loopEnd)).size, 1);
      assert.ok(stems.every(voice => voice.seam < .00001));
      const stages = [];
      for (const [stage, hp] of [["harmony", 1], ["pressure", .65], ["finale", .32]]) {
        await page.evaluate(hp => { boss.hp = hp; syncGameAudio(); }, hp);
        await page.waitForTimeout(925);
        const mix = (await layers()).map(layer => layer.trace.at(-1)?.value ?? 0);
        const expected = { harmony: [.93, .08, 0], pressure: [.81, .67, .06], finale: [.70, .75, .89] };
        assert.deepEqual(mix, expected[stage]);
        const captured = await capture(`${name}-${stage}`, .78);
        assert.ok(captured.peak > .004 && captured.peak < .89);
        stages.push({ hp, mix, captured });
      }
      assert.equal((await layers()).length, 3, "HP thresholds change gains on the same sources");
      await page.evaluate(() => { boss.hp = 1; syncGameAudio(); });
      await page.waitForTimeout(720);
      const transition = await capture(name + "-continuous-transition", 21, { thresholds: true });
      const section = await page.evaluate(theme => {
        const score = starBreakerFactionAudio.factions[theme];
        return { bars: score.sectionBars, sequence: score.sequence, answerAt: score.sectionBars * 240 / score.bpm };
      }, name);
      assert.deepEqual(section.sequence, ["A", "B", "A'", "B'"]);
      assert.ok(section.answerAt < 20);
      assert.equal((await layers()).length, 3, "a recorded transition also keeps every source in place");
      report.factions[name] = { duration: stems[0].loopEnd, startSpread: 0, maximumSeam: Math.max(...stems.map(voice => voice.seam)), section, stages, transition };
    }
    const duck = await page.evaluate(() => {
      gameAudio.bossAttack("whip", 1080, 345);
      return audioProof.gains[3].slice(-2);
    });
    assert.equal(duck[0].value, .73);
    assert.equal(duck[1].value, 1);
    assert.ok(Math.abs(duck[1].time - duck[0].time - .128) < .001);
    report.skillDuck = { minimum: duck[0].value, fullCycleSeconds: duck[1].time - duck[0].time + .022 };
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => pauseView), "menu");
    await page.evaluate(() => syncGameAudio());
    await page.waitForTimeout(240);
    const paused = await capture("pause-attenuated", .72);
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => pauseView), "");
    await page.evaluate(() => syncGameAudio());
    await page.waitForTimeout(240);
    const resumed = await capture("pause-resumed", .72);
    assert.ok(paused.rmsL < resumed.rmsL * .7, JSON.stringify({ paused, resumed }));
    await page.evaluate(() => gameAudio.setMuted(true));
    await page.waitForTimeout(130);
    const muted = await capture("mute", .25);
    assert.ok(muted.peak < .001);
    await page.evaluate(() => gameAudio.setMuted(false));
    await waitFor(() => audioProof.sources.filter(voice => voice.loop && voice.duration > 73).length >= 6);
    const resumeOffset = await page.evaluate(() => audioProof.sources.filter(voice => voice.loop && voice.duration > 73).at(-1).offset);
    assert.ok(resumeOffset > 0);
    report.resumeOffset = resumeOffset;

    const isolated = (type, listenerX = 128, x = 128) => page.evaluate(({ type, listenerX, x }) => {
      gameAudio.sync(true, false, false, { warning: true, bossType: type, width: 1280, height: 720,
        listenerX, listenerY: 360, bossX: x, bossY: 360 });
    }, { type, listenerX, x });
    await isolated(0);
    await page.waitForTimeout(530);
    await page.evaluate(() => gameAudio.bossAttack("beam", 128, 360));
    const left = await capture("boss-left", .72);
    await page.waitForTimeout(100);
    await page.evaluate(() => gameAudio.bossAttack("beam", 1152, 360));
    const right = await capture("boss-right", .72);
    assert.ok(left.rmsL > left.rmsR * 1.5 && right.rmsR > right.rmsL * 1.5, JSON.stringify({ left, right }));
    await page.waitForTimeout(190);
    await isolated(0, 128);
    await page.evaluate(() => gameAudio.explode(false, 128, 360));
    const near = await capture("explosion-near", .65);
    await page.waitForTimeout(220);
    await isolated(0, 1152);
    await page.evaluate(() => gameAudio.explode(false, 128, 360));
    const far = await capture("explosion-far", .65);
    assert.ok(far.rmsL < near.rmsL * .71, JSON.stringify({ near, far }));
    await page.evaluate(() => { gameAudio.radioCue("incoming", -.42); gameAudio.fieldCue("mine-burst", 1000, 320); });
    const feedback = await capture("radio-field", .65);
    assert.ok(feedback.peak > .008);

    report.bossIdentities = await page.evaluate(() => {
      const durations = new Set();
      for (let index = 0; index < 11; index++) {
        const before = audioProof.sources.length;
        gameAudio.sync(true, true, false, { bossType: index, bossPhase: "enter" });
        const effects = audioProof.sources.slice(before).filter(voice => !voice.loop && voice.duration !== 2).slice(-2);
        if (effects.length !== 2) throw new Error("Missing authored boss voice at " + index);
        durations.add(effects[1].duration);
      }
      return durations.size;
    });
    assert.equal(report.bossIdentities, 11);
    await page.waitForTimeout(900);
    const dense = await capture("dense-combat-mix", 2.4, { dense: true });
    assert.ok(dense.peak > .03 && dense.peak < .8913, JSON.stringify(dense));
    await page.waitForTimeout(850);
    await page.evaluate(() => { gameAudio.victorySequence(true); gameAudio.sync(false, false); });
    await waitFor(() => audioProof.sources.some(source => !source.loop && Math.abs(source.duration - 15) < .003));
    await page.waitForTimeout(260);
    const victory = await capture("victory-opening", 1.25);
    assert.ok(victory.peak > .005);
    await page.evaluate(() => gameAudio.sync(false, false, false, { visible: false }));
    await page.waitForTimeout(165);
    assert.ok((await capture("victory-hidden", .22)).peak < .001);
    await page.evaluate(() => gameAudio.sync(false, false, false, { visible: true }));
    await waitFor(() => audioProof.sources.filter(source => !source.loop && Math.abs(source.duration - 15) < .003).length >= 2);
    report.victoryOffset = await page.evaluate(() => audioProof.sources.filter(source => !source.loop && Math.abs(source.duration - 15) < .003).at(-1).offset);
    assert.ok(report.victoryOffset > .8);
    await page.evaluate(() => { gameAudio.victorySequence(false); gameAudio.setVolume(.44); gameAudio.destroy(); });
    await page.reload();
    assert.equal(await page.evaluate(() => gameAudio.volume), .44);
    assert.deepEqual(errors, []);
    report.errors = errors;
    if (output) fs.writeFileSync(path.join(output, "audio-browser.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ factionDurations: Object.fromEntries(Object.entries(report.factions).map(([name, value]) => [name, value.duration])),
      left: left.rmsL / left.rmsR, right: right.rmsR / right.rmsL, farNear: far.rmsL / near.rmsL,
      pauseResume: paused.rmsL / resumed.rmsL, victoryOffset: report.victoryOffset, maxPeak: Math.max(...Object.values(report.recordings).map(item => item.peak)),
      bossIdentities: report.bossIdentities, errors }));
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
