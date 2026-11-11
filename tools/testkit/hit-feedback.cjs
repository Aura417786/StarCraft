#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { chromium } = require("playwright");
const root = path.resolve(process.argv[2] || ".");
const output = path.resolve(process.argv[3] || path.join(root, ".qa-hit-feedback"));
fs.mkdirSync(output, { recursive: true });

function writeWav(name, record) {
  const pcm = Buffer.from(record.pcm, "base64"), header = Buffer.alloc(44);
  header.write("RIFF"); header.writeUInt32LE(pcm.length + 36, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(record.rate, 24); header.writeUInt32LE(record.rate * 4, 28);
  header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(path.join(output, name + ".wav"), Buffer.concat([header, pcm]));
}

function visualChecks() {
  const noop = () => {}, audioCalls = [];
  const sandbox = { console, Math, Number, Map, Set, Array,
    window: { localStorage: { getItem: () => null } }, document: { querySelector: () => null },
    reducedMotion: { matches: false }, state: "battle", pauseView: "", evolution: { pending: false },
    viewport: { width: 1280, height: 720 }, visualQuality: { id: "high" }, explosions: [],
    gameAudio: { hit: (...args) => audioCalls.push(args), fieldCue: noop },
    clamp: (n, low, high) => Math.max(low, Math.min(high, n)), tr: a => a,
    battleHasFocus: () => true, isBossPresentationPlaying: () => false, isBossDeathPlaying: () => false,
    resetBossPresentation: noop };
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "combat-effects.js"), "utf8"), context);
  const result = vm.runInContext(`(() => {
    const target = {x:900,y:350,width:230,height:180,type:0};
    const shot = {source:'ultimate',x:810,y:352,vx:400,vy:120};
    recordCombatImpact(target, shot, true);
    const before = combatEffects.hitPause;
    let consumed = 0;
    for(let i=0;i<4;i++) consumed += 1/120-combatImpactFrameSeconds(1/120);
    const direction = combatShakeOffset();
    const firstContacts = combatEffects.contacts.length;
    for(let i=0;i<200;i++) recordCombatImpact({x:900,y:350,width:230,height:180,type:0},shot,true);
    const capped = combatEffects.contacts.length;
    const noRepeatPause = combatEffects.hitPause;
    updateCombatEffects(.65);
    recordCombatImpact(target, {...shot,source:'evolution-ember'},true);
    const emberPause = combatEffects.hitPause;
    shakePreference='off'; const disabledShake=combatShakeOffset();
    reducedMotion.matches=true;
    const quietTime=combatImpactFrameSeconds(.01);
    recordCombatImpact({x:900,y:350,width:230,height:180,type:0},shot,true);
    const quietPause=combatEffects.hitPause;
    resetCombatEffects();
    return {before,consumed,direction,firstContacts,capped,noRepeatPause,emberPause,disabledShake,quietTime,quietPause,
      cleared:combatEffects.contacts.length===0&&combatEffects.directionalHit===null&&combatEffects.hitPause===0};
  })()`, context);
  assert.equal(result.before, .024);
  assert.ok(Math.abs(result.consumed - .024) < 1e-9);
  assert.ok(result.direction.x > 0 && result.direction.y > 0);
  assert.equal(result.firstContacts, 1); assert.equal(result.capped, 20);
  assert.equal(result.noRepeatPause, 0); assert.equal(result.emberPause, .024);
  assert.equal(result.disabledShake.x, 0); assert.equal(result.disabledShake.y, 0);
  assert.equal(result.quietTime, .01); assert.equal(result.quietPause, 0); assert.ok(result.cleared);
  return result;
}

async function main() {
  const visual = visualChecks();
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || chromium.executablePath(),
    headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => route.request().url() === "https://hit-fixture.invalid/"
      ? route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Hit feedback audio fixture</title>" }) : route.abort());
    await page.goto("https://hit-fixture.invalid/");
    await page.evaluate(() => {
      const proof = window.hitProof = { live: 0, peakVoices: 0, hitLive: 0, peakHitVoices: 0, accepted: 0, denied: 0, inHit: false, gains: [] };
      // Stop the music scheduler in this isolated fixture. The production engine,
      // limiter, distance mix, mute and voice lifecycle are otherwise unmodified.
      window.setInterval = () => 0;
      const realGain = AudioContext.prototype.createGain;
      AudioContext.prototype.createGain = function () {
        const gain = realGain.call(this); proof.gains.push(gain); return gain;
      };
      for (const method of ["createOscillator", "createBufferSource"]) {
        const original = AudioContext.prototype[method];
        AudioContext.prototype[method] = function () {
          const node = original.call(this), impact = proof.inHit;
          const start = node.start;
          node.start = function () {
            proof.live++; if (impact) proof.hitLive++;
            proof.peakVoices = Math.max(proof.peakVoices, proof.live);
            proof.peakHitVoices = Math.max(proof.peakHitVoices, proof.hitLive);
            return start.apply(this, arguments);
          };
          node.addEventListener("ended", () => { proof.live--; if (impact) proof.hitLive--; });
          return node;
        };
      }
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (target) {
        if (this instanceof DynamicsCompressorNode && target === this.context.destination && !proof.recorder) {
          const recorder = this.context.createScriptProcessor(512, 2, 2), silent = realGain.call(this.context);
          silent.gain.value = 0; proof.recorder = recorder;
          connect.call(this, recorder); connect.call(recorder, silent); connect.call(silent, target);
          recorder.onaudioprocess = event => {
            const job = proof.job; if (!job) return;
            const left = event.inputBuffer.getChannelData(0), right = event.inputBuffer.getChannelData(1);
            for (let i = 0; i < left.length && job.position < job.frames; i++) {
              const a = left[i], b = right[i], n = job.position++ * 2;
              job.peak = Math.max(job.peak, Math.abs(a), Math.abs(b)); job.power += a*a + b*b;
              job.pcm[n] = Math.max(-32767,Math.min(32767,Math.round(a*32767)));
              job.pcm[n+1] = Math.max(-32767,Math.min(32767,Math.round(b*32767)));
            }
            if (job.position === job.frames) {
              proof.job = null;
              const bytes = new Uint8Array(job.pcm.buffer); let encoded = "";
              for(let i=0;i<bytes.length;i+=8192) encoded += String.fromCharCode(...bytes.subarray(i,i+8192));
              job.resolve({ peak:job.peak, rms:Math.sqrt(job.power/(job.frames*2)), rate:this.context.sampleRate, pcm:btoa(encoded) });
            }
          };
        }
        return connect.apply(this,arguments);
      };
      proof.capture = seconds => new Promise(resolve => {
        const frames = Math.ceil(seconds*proof.recorder.context.sampleRate);
        proof.job = {resolve,frames,position:0,peak:0,power:0,pcm:new Int16Array(frames*2)};
      });
    });
    await page.addScriptTag({ content: fs.readFileSync(path.join(root, "audio.js"), "utf8") });
    await page.evaluate(async () => {
      await gameAudio.unlock(); gameAudio.sync(true,false);
      const music = hitProof.gains[2].gain; music.cancelScheduledValues(0); music.value=0;
      const hit = gameAudio.hit;
      gameAudio.hit = (...args) => { hitProof.inHit=true; try {
        const played=hit(...args); if(played)hitProof.accepted++;else hitProof.denied++; return played;
      } finally {hitProof.inHit=false;} };
    });
    await page.waitForTimeout(400);
    const captures = {};
    for (const [name,source] of [["normal-shell-hit",""],["energy-cannon-hit","ultimate"],["ember-detonation-hit","evolution-ember"]]) {
      const record = await page.evaluate(async source => {
        const result=hitProof.capture(.45); gameAudio.hit(true,source,900,360); return await result;
      },source);
      writeWav(name,record); const {pcm,...metrics}=record; captures[name]=metrics;
      await page.waitForTimeout(180);
    }
    const dense = await page.evaluate(async () => {
      const result=hitProof.capture(2.2);
      for(let tick=0;tick<24;tick++) {
        for(let i=0;i<60;i++)gameAudio.hit(true,tick%6===0?'ultimate':'',900,360);
        await new Promise(resolve=>setTimeout(resolve,70));
      }
      return await result;
    });
    writeWav("dense-hit-budget",dense); const {pcm,...denseMetrics}=dense; captures.dense=denseMetrics;
    await page.evaluate(()=>gameAudio.setMuted(true));
    await page.waitForTimeout(100);
    const muted = await page.evaluate(async()=>{
      const result=hitProof.capture(.3); for(let i=0;i<100;i++)gameAudio.hit(true,'ultimate',900,360);return await result;
    });
    const counters=await page.evaluate(()=>({voices:hitProof.peakVoices,hitVoices:hitProof.peakHitVoices,accepted:hitProof.accepted,denied:hitProof.denied}));
    assert.ok(captures["normal-shell-hit"].rms>.0002,JSON.stringify(captures));
    assert.ok(captures["energy-cannon-hit"].rms>captures["normal-shell-hit"].rms*1.3,JSON.stringify(captures));
    assert.ok(captures["ember-detonation-hit"].rms>.001);
    assert.ok(dense.peak<.85&&dense.rms>.001,JSON.stringify(denseMetrics));
    assert.ok(counters.voices<=48&&counters.hitVoices<=12,JSON.stringify(counters));
    assert.ok(counters.denied>1000&&counters.accepted<40,JSON.stringify(counters));
    assert.ok(muted.peak<.001,JSON.stringify({peak:muted.peak}));
    assert.deepEqual(errors,[]);
    const report={visual,audio:captures,counters,mutedPeak:muted.peak,errors,
      scope:"Measured Web Audio output and bounded visual state; listening quality and full-game play require separate review."};
    fs.writeFileSync(path.join(output,"hit-feedback.json"),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
