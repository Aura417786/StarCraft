"use strict";

const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { chromium } = require("playwright");

async function run() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      const proof = { sources: [], decoded: [], musicSchedulers: 0, meter: null };
      window.audioProof = proof;
      window.requestAnimationFrame = () => 0;
      const originalSetTimeout = window.setTimeout;
      window.setTimeout = function (callback, ...args) {
        if (callback.name === "scheduleMusic") proof.musicSchedulers++;
        return originalSetTimeout(callback, ...args);
      };
      const originalDecode = AudioContext.prototype.decodeAudioData;
      AudioContext.prototype.decodeAudioData = function (encoded) {
        return originalDecode.call(this, encoded).then(buffer => {
          proof.decoded.push([buffer.duration, buffer.numberOfChannels, buffer.length]);
          return buffer;
        });
      };
      const originalStart = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (time, offset) {
        if (this.buffer) {
          const clip = this.buffer.getChannelData(0);
          proof.sources.push({
            time, offset, loop: this.loop, loopEnd: this.loopEnd,
            duration: this.buffer.duration, rate: this.playbackRate.value,
            seam: this.loop ? Math.abs(clip[clip.length - 1] - clip[0]) : null,
          });
        }
        return originalStart.apply(this, arguments);
      };
      const originalConnect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (target) {
        if (target === this.context.destination && this instanceof DynamicsCompressorNode && !proof.meter) {
          proof.meter = this.context.createAnalyser();
          proof.meter.fftSize = 1024;
          originalConnect.call(this, proof.meter);
        }
        return originalConnect.apply(this, arguments);
      };
      proof.readPeak = () => {
        const data = new Float32Array(proof.meter.fftSize);
        proof.meter.getFloatTimeDomainData(data);
        return Math.max(...data.map(value => Math.abs(value)));
      };
    });
    const url = pathToFileURL(path.resolve(__dirname, "..", "index.html"));
    await page.goto(url.href);
    await page.locator(".flight-guide-actions button").click();
    await page.locator("#start-button").click();
    await page.waitForFunction(() => audioProof.sources.filter(voice => voice.loop && voice.duration > 20).length >= 2, null, { polling: 40 });
    await page.waitForFunction(() => audioProof.decoded.length === 33, null, { polling: 40 });
    await page.waitForFunction(() => audioProof.readPeak() > .005, null, { polling: 40 });
    const flight = await page.evaluate(() => audioProof.sources.filter(voice => voice.loop && voice.duration > 20));
    assert.equal(flight.length, 2);
    assert.ok(await page.evaluate(() => audioProof.sources.some(voice => voice.loop && Math.abs(voice.duration - 8) < .002)));
    assert.equal(flight[0].time, flight[1].time);
    assert.equal(flight[0].loopEnd, flight[1].loopEnd);
    assert.ok(flight.every(voice => voice.seam < .00001));
    assert.ok(Math.abs(flight[0].loopEnd - 33.103) < .003);

    await page.evaluate(() => {
      spawnBoss(0);
      syncGameAudio();
      boss.phase = "attack";
      syncGameAudio();
      gameAudio.bossAttack("surge");
      gameAudio.shoot(false, 2, "red");
      gameAudio.hit(true, "ultimate");
    });
    const boss = await page.evaluate(() => audioProof.sources.filter(voice => voice.loop && voice.duration > 20).slice(2));
    assert.equal(boss.length, 3);
    assert.equal(new Set(boss.map(voice => voice.time)).size, 1);
    assert.equal(new Set(boss.map(voice => voice.loopEnd)).size, 1);
    assert.ok(Math.abs(boss[0].loopEnd - 29.091) < .003);
    assert.ok(boss.every(voice => voice.seam < .00001));
    const active = await page.evaluate(() => audioProof.sources.filter(voice => !voice.loop).length);
    assert.ok(active >= 5);

    await page.evaluate(() => {
      const time = audioProof.meter.context.currentTime;
      for (let index = 0; index < 120; index++) syncGameAudio();
      if (audioProof.meter.context.currentTime < time) throw new Error("Audio clock rewound");
      boss.phase = "finale";
      syncGameAudio();
    });
    const finale = await page.evaluate(() => ({
      loops: audioProof.sources.filter(voice => voice.loop && voice.duration > 20).length,
      effects: audioProof.sources.filter(voice => !voice.loop).length,
      mixRate: audioProof.meter.context.sampleRate,
      decodedMiB: audioProof.decoded.reduce((total, [, channels, frames]) => total + channels * frames * 4, 0) / 2 ** 20,
    }));
    assert.equal(finale.loops, 5, "phase transitions crossfade in place");
    if (finale.mixRate === 32000) assert.ok(finale.decodedMiB < 48);
    assert.ok(finale.effects >= active + 2, "boss signature and transition cue are both audible");
    await page.waitForFunction(start => audioProof.meter.context.currentTime >= start + .14, boss[0].time, { polling: 40 });
    await page.evaluate(() => gameAudio.setMuted(true));
    await page.waitForFunction(() => audioProof.readPeak() < .001, null, { polling: 40 });
    await page.evaluate(() => gameAudio.setMuted(false));
    await page.waitForFunction(() => audioProof.readPeak() > .005, null, { polling: 40 });
    const resumed = await page.evaluate(() => audioProof.sources.filter(voice => voice.loop && voice.duration > 20).slice(-3));
    assert.equal(new Set(resumed.map(voice => voice.time)).size, 1);
    assert.equal(new Set(resumed.map(voice => voice.offset)).size, 1);
    assert.ok(resumed[0].offset > 0, "resume keeps score playhead");

    const bossIdentities = await page.evaluate(() => {
      const timbres = new Set();
      for (let index = 0; index < 11; index++) {
        const before = audioProof.sources.length;
        spawnBoss(index);
        syncGameAudio();
        const entry = audioProof.sources.slice(before).filter(voice => !voice.loop);
        if (entry.length !== 2) throw new Error("Missing boss entry audio at " + index);
        timbres.add(entry[1].duration);
      }
      return timbres.size;
    });
    assert.equal(bossIdentities, 11);
    await page.evaluate(() => gameAudio.destroy());
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ filePlayback: true, flightStems: 2, bossStems: 3, mixedFinale: true,
      mixRate: finale.mixRate, decodedMiB: +finale.decodedMiB.toFixed(1), soundEffects: 27, bossIdentities, ambience: true, muteResume: true }));
  } finally {
    await browser.close();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
