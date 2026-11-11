#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { chromium } = require("playwright");
const root = path.resolve(process.argv[2] || ".");
const output = path.resolve(process.argv[3] || path.join(root, ".qa-hit-feedback"));
const audioSource = path.resolve(process.env.HIT_AUDIO_SOURCE || path.join(root, "audio.js"));
const sampleBank = process.env.HIT_AUDIO_SAMPLES === "1";
fs.mkdirSync(output, { recursive: true });

function writeWav(name, record) {
  const pcm = Buffer.from(record.pcm, "base64"), header = Buffer.alloc(44);
  header.write("RIFF"); header.writeUInt32LE(pcm.length + 36, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(record.rate, 24); header.writeUInt32LE(record.rate * 4, 28);
  header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(path.join(output, name + ".wav"), Buffer.concat([header, pcm]));
}

function spectrum(record) {
  const pcm = Buffer.from(record.pcm, "base64"), frames = pcm.length / 4;
  let start = 0;
  while (start < frames && Math.abs(pcm.readInt16LE(start * 4)) < 20) start++;
  const n = 2048, data = Array.from({ length: n }, (_, index) => {
    const at = start + index;
    return at >= frames ? 0 : (pcm.readInt16LE(at * 4) + pcm.readInt16LE(at * 4 + 2)) / 65534
      * (.5 - .5 * Math.cos(2 * Math.PI * index / (n - 1)));
  });
  let power = 0, low = 0, moment = 0;
  for (let bin = 1; bin <= 256; bin++) {
    let real = 0, imaginary = 0;
    for (let index = 0; index < n; index++) {
      const angle = 2 * Math.PI * bin * index / n;
      real += data[index] * Math.cos(angle); imaginary -= data[index] * Math.sin(angle);
    }
    const energy = real * real + imaginary * imaginary, frequency = bin * record.rate / n;
    power += energy; moment += frequency * energy;
    if (frequency < 500) low += energy;
  }
  return { onsetCentroidHz: moment / Math.max(1e-12, power), onsetBelow500Fraction: low / Math.max(1e-12, power) };
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
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.href === "https://hit-fixture.invalid/") return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Hit feedback audio fixture</title>" });
      if (sampleBank && /^\/assets\/audio\/[a-z0-9_]+\.ogg$/.test(url.pathname)) {
        const file = path.join(root, url.pathname.slice(1));
        if (fs.existsSync(file)) return route.fulfill({ contentType: "audio/ogg", path: file });
      }
      return route.abort();
    });
    await page.goto("https://hit-fixture.invalid/");
    await page.evaluate(() => {
      let seed = 71230;
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const proof = window.hitProof = { live: 0, peakVoices: 0, hitLive: 0, peakHitVoices: 0, accepted: 0, denied: 0, inHit: false, gains: [], decoded: 0, bufferSources: 0, oscillators: 0 };
      const decode = AudioContext.prototype.decodeAudioData;
      AudioContext.prototype.decodeAudioData = function () {
        return decode.apply(this, arguments).then(buffer => { proof.decoded++; return buffer; });
      };
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
            if (method === "createBufferSource") proof.bufferSources++; else proof.oscillators++;
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
    if (sampleBank) await page.addScriptTag({ content: 'const starBreakerAudioCatalog={stems:{},effects:["shot_red","shot_blue","shot_gold","collapse"]};' });
    await page.addScriptTag({ content: fs.readFileSync(audioSource, "utf8") });
    await page.evaluate(async () => {
      // Use the engine's real warning state: score remains stopped through
      // async context/decode callbacks, while SFX stay live. Do not merely set
      // a gain to zero; reconcile() would later overwrite it.
      gameAudio.sync(true,false,false,{warning:true}); await gameAudio.unlock();
      const hit = gameAudio.hit;
      gameAudio.hit = (...args) => { hitProof.inHit=true; try {
        const played=hit(...args); if(played)hitProof.accepted++;else hitProof.denied++; return played;
      } finally {hitProof.inHit=false;} };
    });
    if (sampleBank) await page.waitForFunction(() => hitProof.decoded >= 10);
    await page.waitForTimeout(400);
    const silentFloor = await page.evaluate(() => hitProof.capture(.25));
    assert.ok(silentFloor.peak < .000001, "Music or stale SFX leaked into the isolated recording");
    const captures = {};
    const soundCases = [
      ["muzzle-normal", "shoot", [false, 1, "red"], .45],
      ["muzzle-overdrive", "shoot", [true, 1, "red"], .45],
      ["muzzle-blue", "shoot", [false, 1, "blue"], .45],
      ["muzzle-gold", "shoot", [false, 1, "yellow"], .45],
      ["enemy-shell-hit", "hit", [false, "", 900, 360], .45],
      ["normal-shell-hit", "hit", [true, "", 900, 360], .45],
      ["energy-cannon-hit", "hit", [true, "ultimate", 900, 360], .45],
      ["ember-detonation-hit", "hit", [true, "evolution-ember", 900, 360], .45],
      ["boss-final-collapse", "explode", [true, 900, 360], 1.6]
    ];
    for (const [name,method,args,duration] of soundCases) {
      const record = await page.evaluate(async ({method,args,duration}) => {
        const result=hitProof.capture(duration), before = { buffer:hitProof.bufferSources, oscillator:hitProof.oscillators };
        // Arm a complete recorder block before a 20-40ms muzzle transient.
        // Otherwise an immediate SFX can begin before the first input callback.
        await new Promise(resolve => setTimeout(resolve, 60));
        gameAudio[method](...args);
        return {...await result, sources:{buffer:hitProof.bufferSources-before.buffer,oscillator:hitProof.oscillators-before.oscillator}};
      },{method,args,duration});
      writeWav(name,record); const {pcm,...metrics}=record; captures[name]={...metrics,...spectrum(record)};
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
    assert.ok(captures["enemy-shell-hit"].rms>.0002);
    assert.ok(captures["muzzle-normal"].rms>0&&captures["muzzle-overdrive"].rms>0);
    for(const name of ["muzzle-normal","muzzle-overdrive","muzzle-blue","muzzle-gold"]) {
      assert.equal(captures[name].sources.buffer, sampleBank ? 1 : 0, name + " used the wrong audio path");
      assert.equal(captures[name].sources.oscillator > 0, !sampleBank, name + " used the wrong audio path");
    }
    assert.ok(dense.peak<.85&&dense.rms>.001,JSON.stringify(denseMetrics));
    assert.ok(counters.voices<=48&&counters.hitVoices<=12,JSON.stringify(counters));
    assert.ok(counters.denied>1000&&counters.accepted<40,JSON.stringify(counters));
    assert.ok(muted.peak<.001,JSON.stringify({peak:muted.peak}));
    assert.deepEqual(errors,[]);
    const routing = await productionAudioRouting(browser);
    const report={audioSource,sampleBank,silentFloorPeak:silentFloor.peak,visual,routing,audio:captures,counters,mutedPeak:muted.peak,errors,
      scope:"Measured Web Audio output and bounded visual state; listening quality and full-game play require separate review."};
    fs.writeFileSync(path.join(output,"hit-feedback.json"),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  } finally { await browser.close(); }
}

async function productionAudioRouting(browser) {
  const errors = [], { open } = require("./boss-retry.cjs");
  const page = await open(browser, errors);
  try {
    const result = await page.evaluate(() => {
      const calls = [];
      gameAudio.hit = (boss, source) => { calls.push({ method: "hit", boss, source }); return true; };
      gameAudio.explode = boss => calls.push({ method: "explode", boss });
      showScreen("battle", { mode: "campaign", seed: 814 });
      spawnEnemy("scout");
      const enemy = enemies[0]; delete enemy.healthLog; enemy.hp = enemy.maxHp = 10;
      applyEnemyHit(enemy, { damage: 1, source: "primary" });
      const enemyAlive = calls.splice(0);
      combatEffects.clock += .3;
      applyEnemyHit(enemy, { damage: 20, source: "primary" }); defeatEnemy(enemies.indexOf(enemy));
      const enemyFinal = calls.splice(0);
      spawnBoss(0); resetBossPresentation(); boss.phase = "attack"; boss.enraged = true; boss.hp = .8;
      applyBossHit({ source: "ultimate", damageLog: boss.healthLog - 5 });
      const bossAlive = calls.splice(0);
      combatEffects.clock += .3; boss.hp = .000001;
      applyBossHit({ source: "ultimate", damageLog: boss.healthLog + 2 });
      const bossBodyTransition = calls.splice(0);
      resetBossPresentation(); boss.finale.age = boss.finale.transform + 1;
      boss.hp = .000001; combatEffects.clock += .3;
      applyBossHit({ source: "ultimate", damageLog: boss.healthLog + 2 });
      const bossFinalImpact = calls.splice(0);
      advanceBossDeathPresentation(bossPresentation.duration * .4);
      const bossFinalCollapse = calls.splice(0);
      return { enemyAlive, enemyFinal, bossAlive, bossBodyTransition, bossFinalImpact, bossFinalCollapse };
    });
    assert.deepEqual(result.enemyAlive, [{ method:"hit", boss:false, source:"primary" }]);
    assert.deepEqual(result.enemyFinal, [{ method:"explode", boss:false }]);
    assert.deepEqual(result.bossAlive, [{ method:"hit", boss:true, source:"ultimate" }]);
    assert.deepEqual(result.bossBodyTransition, [{ method:"hit", boss:true, source:"ultimate" }]);
    assert.deepEqual(result.bossFinalImpact, []);
    assert.deepEqual(result.bossFinalCollapse, [{ method:"explode", boss:true }]);
    assert.deepEqual(errors, []);
    return { ...result, errors };
  } finally { await page.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
