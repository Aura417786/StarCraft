"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../..");
const output = path.resolve(process.argv[2] || path.join(root, "work/nextgen-audio"));
fs.mkdirSync(output, { recursive: true });

function wav(name, value) {
  const data = Buffer.from(value.data, "base64"), header = Buffer.alloc(44);
  header.write("RIFF"); header.writeUInt32LE(data.length + 36, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(value.rate, 24); header.writeUInt32LE(value.rate * 4, 28);
  header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(output, name + ".wav"), Buffer.concat([header, data]));
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, ignoreDefaultArgs: ["--mute-audio"],
    args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  const errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/audio\/(nextgen|encounters)|audio.*bank/.test(request.url())) requests.push(request.url()); });
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
    const proof = window.audioProof = { sources: [], gains: [], decodedBytes: 0, decoded: 0, pending: null,
      sourceGain: new WeakMap(), names: new WeakMap() };
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = async function (bytes) {
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        byte => byte.toString(16).padStart(2, "0")).join("");
      const name = Object.entries(starBreakerAudioCatalog.encounters?.clips ?? {}).find(([, clip]) => clip.sha256 === digest)?.[0];
      const clip = await decode.call(this, bytes);
      if (name) proof.names.set(clip, name);
      proof.decoded++; proof.decodedBytes += clip.length * clip.numberOfChannels * 4;
      return clip;
    };
    const gain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const node = gain.call(this);
      proof.gains.push(node);
      return node;
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (at, offset) {
      if (this.buffer) {
        const data = this.buffer.getChannelData(0);
        proof.sources.push({ node: this, name: proof.names.get(this.buffer), gain: proof.sourceGain.get(this), at, offset, loop: this.loop, duration: this.buffer.duration,
          seam: Math.abs(data[0] - data[data.length - 1]), ended: false });
        const trace = proof.sources.at(-1);
        this.addEventListener("ended", () => { trace.ended = true; });
      }
      return start.apply(this, arguments);
    };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (target) {
      if (this instanceof AudioBufferSourceNode && target instanceof GainNode) proof.sourceGain.set(this, target.gain);
      if (target === this.context.destination && this instanceof DynamicsCompressorNode && !proof.meter) {
        proof.context = this.context;
        const meter = this.context.createScriptProcessor(1024, 2, 2), sink = this.context.createGain();
        sink.gain.value = 0;
        connect.call(this, meter); connect.call(meter, sink); connect.call(sink, target);
        proof.meter = meter;
        meter.onaudioprocess = event => {
          const pending = proof.pending;
          if (!pending) return;
          const l = event.inputBuffer.getChannelData(0), r = event.inputBuffer.getChannelData(1);
          for (let i = 0; i < l.length && pending.at < pending.frames; i++) {
            pending.peak = Math.max(pending.peak, Math.abs(l[i]), Math.abs(r[i]));
            pending.left += l[i] ** 2; pending.right += r[i] ** 2;
            pending.data[pending.at * 2] = Math.round(Math.max(-1, Math.min(1, l[i])) * 32767);
            pending.data[pending.at * 2 + 1] = Math.round(Math.max(-1, Math.min(1, r[i])) * 32767);
            pending.at++;
          }
          if (pending.at === pending.frames) {
            proof.pending = null;
            let raw = "";
            const bytes = new Uint8Array(pending.data.buffer);
            for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
            pending.resolve({ peak: pending.peak, left: Math.sqrt(pending.left / pending.frames),
              right: Math.sqrt(pending.right / pending.frames), rate: proof.context.sampleRate, data: btoa(raw) });
          }
        };
      }
      return connect.apply(this, arguments);
    };
    proof.capture = seconds => new Promise(resolve => {
      const frames = Math.round(seconds * proof.context.sampleRate);
      proof.pending = { resolve, frames, at: 0, peak: 0, left: 0, right: 0, data: new Int16Array(frames * 2) };
    });
  });
  const report = { recordings: {}, phases: [], music: [], requests, errors };
  async function capture(name, seconds, action) {
    const value = await page.evaluate(async ({ seconds, action }) => {
      const recording = audioProof.capture(seconds);
      if (action) Function(action)();
      return recording;
    }, { seconds, action });
    wav(name, value);
    const { data, ...stats } = value;
    report.recordings[name] = stats;
    assert.ok(value.peak < .8913, name + " stays below -1 dBFS");
    return stats;
  }
  try {
    await page.goto(pathToFileURL(path.join(root, "index.html")).href + "?intro=0");
    assert.equal(requests.length, 0, "no new bank fetched before sound unlock");
    await page.evaluate(async () => {
      gameAudio.sync(false, false, false, { scene: "menu", visible: true, lives: 3 });
      await gameAudio.unlock();
    });
    await page.waitForFunction(() => audioProof.sources.filter(x => x.loop && x.duration > 20 && x.duration < 25).length >= 2, null, { polling: 40 }).catch(async error => {
      console.error(JSON.stringify({ errors, requests, diagnostic: await page.evaluate(() => ({
        runtime: gameAudio.diagnostics, decoded: audioProof.decoded,
        sources: audioProof.sources.map(({ at, duration, loop }) => ({ at, duration, loop })),
        catalog: !!starBreakerAudioCatalog.nextgen, offline: Object.keys(globalThis.starBreakerNextgenAudio ?? {}).length })) }, null, 2));
      throw error;
    });
    const hangar = await capture("hangar", 4);
    assert.ok(hangar.left > .0001, "hangar music is audible after unlock");
    assert.ok(await page.evaluate(() => audioProof.sources.some(s => s.name === "enc_sector_hangar")), "hangar chimes played");
    await page.evaluate(() => gameAudio.sync(true, false, false, { scene: "battle", lives: 3, elite: true }));
    await page.waitForTimeout(1000);
    await capture("elite-to-low-life", 5, "setTimeout(()=>gameAudio.sync(true,false,false,{scene:'battle',lives:1,elite:true}),1600)");
    report.lowLife = await page.evaluate(() => ({ state: gameAudio.diagnostics,
      gains: audioProof.sources.filter(x => x.loop && !x.ended && x.duration > 30).map(x => x.gain.value) }));
    assert.equal(report.lowLife.state.lowLife, true);
    assert.equal(report.lowLife.state.musicLayers, 3);
    assert.ok(Math.abs(report.lowLife.gains.at(-1) - .66) < .001, "low-life counterline actually reaches its scheduled gain");
    for (const region of ["belt", "wreck", "citadel", "rift"]) {
      await page.evaluate(region => gameAudio.sync(true, false, false, { scene: "battle", region, lives: 3 }), region);
      await page.waitForFunction(region => audioProof.sources.some(s => s.name === "enc_sector_"+region && !s.ended), region, {polling: 50});
      await capture("flight-" + region, 2);
    }
    for (let index = 0; index < 11; index++) {
      await page.evaluate(index => {
        gameAudio.sync(true, true, false, { scene: "battle", bossType: index, bossHealth: .8, lives: 3,
          width: 1280, height: 720, listenerX: 160, listenerY: 360, bossX: 1050, bossY: 360 });
        gameAudio.preloadBossScore(index);
      }, index);
      await page.waitForTimeout(900);
      const family = await page.evaluate(index => starBreakerAudioCatalog.nextgen.bosses[index].family, index);
      await page.waitForFunction(index => gameAudio.diagnostics.musicSolo === starBreakerAudioCatalog.encounters.bosses[index].theme, index, {polling: 50});
      await capture("boss-" + (index + 1) + "-" + family, 6.1,
        `const bossId=${index+1}, profile=starBreakerAudioCatalog.encounters.bosses[bossId-1];
         const emit=(skill,phase)=>gameAudio.bossSkill(skill,{bossId,phase,x:870,y:300,power:1});
         emit(profile.signature,'tell');
         setTimeout(()=>emit(profile.signature,'active'),760);
         setTimeout(()=>emit(profile.signature,'impact'),1680);
         setTimeout(()=>emit('resonance','active'),2320);
         setTimeout(()=>emit(profile.ultimate,'active'),3650);
         setTimeout(()=>emit(profile.ultimate,'tail'),5180);`);
      const names = await page.evaluate(() => [...new Set(audioProof.sources.map(x => x.name).filter(Boolean))]);
      for (const sound of ["theme", "signature", "resonance", "ultimate"]) {
        assert.ok(names.includes("enc_"+family+"_"+sound), "production decoded source played for "+family+"/"+sound);
      }
      if (index === 0) await capture("water-jet-and-lash", 2.3,
        "gameAudio.bossSkill('seam',{bossId:1,phase:'active',x:880,y:350});"
        + "setTimeout(()=>gameAudio.bossSkill('beam',{bossId:1,phase:'active',x:620,y:240}),1150)");
      const loops = await page.evaluate(() => audioProof.sources.filter(x => x.loop && !x.ended)
        .map(({ at, duration, seam }) => ({ at, duration, seam })));
      report.music.push({ index, loops });
      assert.ok(loops.every(x => x.seam < .00001), "decoded music loops have matched endpoints");
      assert.ok(loops.length <= 10, "at most two crossfading scores");
    }
    for (const ship of ["red", "blue", "yellow"]) {
      const detail = ship === "red" ? "prime" : ship === "blue" ? "mark" : "field";
      await capture("fighter-" + ship, 6,
        `gameAudio.shoot(false,2,'${ship}');setTimeout(()=>gameAudio.fighterSkill('${ship}','${detail}'),230);
         setTimeout(()=>{${ship==="red" ? "gameAudio.stopFighterCharge();gameAudio.fighterSkill('red','pierce')" : ship==="yellow" ? "gameAudio.fighterSkill('yellow','pulse')" : "gameAudio.fighterSkill('blue','chain')"}},845);
         setTimeout(()=>gameAudio.chargeUltimate(.88,'${ship}'),1440);setTimeout(()=>gameAudio.fireUltimate('${ship}'),2320);
         setTimeout(()=>gameAudio.fighterSkill('${ship}','shield'),3950);
         setTimeout(()=>gameAudio.fighterSkill('${ship}','perfect'),5050);`);
    }
    await capture("dense-final-stage", 5,
      "gameAudio.sync(true,true,true,{scene:'battle',bossType:10,bossPhase:'finale',bossHealth:.2,lives:1});" +
      "for(let i=0;i<40;i++)setTimeout(()=>{gameAudio.shoot(true,4,'red');gameAudio.bossSkill('tide',{bossId:11,phase:i%4?'active':'tell'});if(i%5===0)gameAudio.fireUltimate('blue');},i*85)");
    report.livingVoices = await page.evaluate(() => audioProof.sources.filter(x => !x.ended).length);
    assert.ok(report.livingVoices <= 48, "real buffer sources stay bounded");
    report.resident = await page.evaluate(() => gameAudio.diagnostics);
    assert.ok(report.resident.decodedBytes < 128 * 1024 * 1024, "resident decoded palette stays under 128 MiB");
    // The incoming-warning state keeps the soundtrack beneath actionable cues.
    await page.evaluate(() => gameAudio.sync(true, true, false, { scene: "battle", bossType: 10,
      bossHealth: 1, lives: 3, warning: true, width: 1280, height: 720, listenerX: 640, listenerY: 360 }));
    await page.waitForTimeout(2200);
    const left = await capture("direction-left", .85, "gameAudio.bossSkill('pan-left',{bossId:11,phase:'tell',x:0,y:360})");
    await page.waitForTimeout(1000);
    const right = await capture("direction-right", .85, "gameAudio.bossSkill('pan-right',{bossId:11,phase:'tell',x:1280,y:360})");
    assert.ok(left.left > left.right * 1.3 && right.right > right.left * 1.3, "warning clearly locates left and right");
    await page.evaluate(() => gameAudio.sync(true, false, false, { scene: "battle", fighter: "red" }));
    await page.waitForTimeout(800);
    const death = await capture("player-destruction", 1.2,
      "gameAudio.fighterSkill('red','destroy');gameAudio.sync(false,false,false,{scene:'over'})");
    assert.ok(death.peak > .01, "destruction tail survives the results-screen transition");
    await page.evaluate(() => {gameAudio.sync(true,false,false,{scene:"battle",lives:3}); gameAudio.victorySequence(true);});
    await page.waitForFunction(() => audioProof.sources.some(s => !s.loop && Math.abs(s.duration-15)<.01 && !s.ended), null, {polling: 50});
    await capture("stargate-victory", 5);
    assert.ok(await page.evaluate(() => audioProof.sources.some(s => s.name === "enc_victory")), "authored ending plays");
    report.encounterSources = await page.evaluate(() => [...new Set(audioProof.sources.map(s => s.name).filter(Boolean))].sort());
    const allClips = await page.evaluate(() => Object.keys(starBreakerAudioCatalog.encounters.clips).sort());
    assert.deepEqual(report.encounterSources, allClips, "all authored encounter clips actually began playback");
    await page.evaluate(() => gameAudio.victorySequence(false));
    await page.evaluate(() => gameAudio.setMuted(true));
    await page.waitForTimeout(300);
    const silent = await capture("muted", .5);
    assert.ok(silent.peak < .0001, "muting fully silences the new sound graph");
    report.decodedBytesTotal = await page.evaluate(() => audioProof.decodedBytes);
    report.decodedClips = await page.evaluate(() => audioProof.decoded);
    assert.deepEqual(errors, [], "no runtime browser errors");
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: "PASS", recordings: Object.keys(report.recordings).length,
      livingVoices: report.livingVoices, output }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
