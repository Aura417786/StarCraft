"use strict";

// 无声卡模拟：验证调度、暂停、兼容性和声部上限，不代替浏览器听感验收。
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const source = fs.readFileSync(path.join(__dirname, "..", "audio.js"), "utf8");
let checks = 0;
async function check(name, test) {
  await test();
  checks++;
  process.stdout.write("PASS " + name + "\n");
}
function world(Context) {
  let nextTimer = 1;
  const timers = new Map();
  const window = {
    setTimeout(fn, ms) { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  if (Context) window.AudioContext = Context;
  const sandbox = vm.createContext({ window, Math, Number, Array, Set, Promise });
  vm.runInContext(source + "\nglobalThis.testAudio = gameAudio;", sandbox);
  return { api: sandbox.testAudio, timers };
}
class Parameter {
  constructor(value = 0) { this.value = value; this.events = []; }
  setValueAtTime(value, time) {
    assert.ok(Number.isFinite(value), "finite audio parameter");
    assert.ok(Number.isFinite(time), "finite audio time");
    this.events.push({ value, time });
    this.value = value;
  }
  exponentialRampToValueAtTime(value, time) { assert.ok(value > 0); this.setValueAtTime(value, time); }
  linearRampToValueAtTime(value, time) { this.setValueAtTime(value, time); }
  cancelScheduledValues(time) { assert.ok(Number.isFinite(time)); }
}
let instances = [];
class FakeContext {
  constructor() {
    this.state = "suspended"; this.currentTime = 0; this.sampleRate = 44100;
    this.sources = []; this.filters = []; this.gains = []; this.destination = {}; instances.push(this);
  }
  node() { return { connections: [], connect(node) { this.connections.push(node); }, disconnect() {} }; }
  createGain() {
    const node = { ...this.node(), gain: new Parameter(1) }; this.gains.push(node); return node;
  }
  createBiquadFilter() {
    const node = { ...this.node(), frequency: new Parameter(), Q: new Parameter() };
    this.filters.push(node); return node;
  }
  createStereoPanner() { return { ...this.node(), pan: new Parameter() }; }
  createDynamicsCompressor() {
    return { ...this.node(), threshold: new Parameter(), knee: new Parameter(), ratio: new Parameter(),
      attack: new Parameter(), release: new Parameter() };
  }
  createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  source(oscillator) {
    const node = { ...this.node(), frequency: new Parameter(), oscillator, ended: false,
      start(time) { this.startAt = time; }, stop(time) { this.stopAt = time; } };
    this.sources.push(node); return node;
  }
  createOscillator() { return this.source(true); }
  createBufferSource() { return this.source(false); }
  resume() { this.state = "running"; this.onstatechange?.(); return Promise.resolve(); }
  close() { this.state = "closed"; return Promise.resolve(); }
  advance(seconds) {
    this.currentTime += seconds;
    for (const node of this.sources) {
      if (!node.ended && node.stopAt <= this.currentTime) { node.ended = true; node.onended?.(); }
    }
  }
  get living() { return this.sources.filter(node => !node.ended && node.stopAt > this.currentTime).length; }
  isMusic(node) { return node.connections[0]?.connections[0]?.connections[0]?.connections[0] === this.gains[2]; }
  get livingEffects() {
    return this.sources.filter(node => !this.isMusic(node) && !node.ended && node.stopAt > this.currentTime).length;
  }
}
function onlyNewMusic(audio, previousCount) {
  assert.ok(audio.sources.slice(previousCount).every(node => audio.isMusic(node)), "no stale effect resumes");
}
function tickScheduler(testWorld) {
  const pending = [...testWorld.timers.values()]; testWorld.timers.clear();
  for (const timer of pending) timer.fn();
}
async function run() {
  await check("unsupported browsers stay silent and every public method is safe", async () => {
    const { api } = world();
    api.sync(true, true, true); api.shoot(); api.explode(true); api.warning(); api.setMuted(true);
    api.shoot(true); api.overdrive(); api.perfectShield();
    api.chargeUltimate(); api.fireUltimate(); api.stopUltimate(); api.bossAttack("beam"); api.bossEnrage();
    assert.equal(api.muted, true); assert.equal(await api.unlock(), false); api.destroy();
  });
  await check("unavailable audio hardware is caught by unlock", async () => {
    const { api } = world(class { constructor() { throw new Error("unavailable"); } });
    assert.equal(await api.unlock(), false);
  });
  await check("autoplay rejection is caught without an unhandled promise", async () => {
    const { api } = world(class extends FakeContext { resume() { return Promise.reject(new Error("blocked")); } });
    assert.equal(await api.unlock(), false); api.destroy();
  });
  instances = [];
  const testWorld = world(FakeContext), api = testWorld.api;
  await check("loading and pre-unlock sync never create an AudioContext", () => {
    api.sync(true, true); api.shoot(); api.chargeUltimate(); api.fireUltimate(); api.stopUltimate();
    api.shoot(true); api.overdrive(); api.perfectShield();
    api.bossAttack(); api.bossEnrage();
    assert.equal(instances.length, 0);
  });
  assert.equal(await api.unlock(), true);
  const audio = instances[0];
  await check("unlock creates one resumed context and exactly one scheduler", async () => {
    await api.unlock(); assert.equal(instances.length, 1); assert.equal(testWorld.timers.size, 1);
  });
  let count = audio.sources.length;
  await check("one thousand unchanged frame sync calls do not restart music", () => {
    for (let index = 0; index < 1000; index++) api.sync(true, true);
    assert.equal(testWorld.timers.size, 1); assert.equal(audio.sources.length, count);
  });
  await check("shot spam creates one short sound event, with no explosion of voices", () => {
    api.shoot(); const emitted = audio.sources.length;
    for (let index = 0; index < 1000; index++) api.shoot();
    assert.equal(audio.sources.length, emitted); assert.equal(emitted - count, 2);
  });
  let peak = 0;
  for (let frame = 0; frame < 1000; frame++) {
    audio.advance(0.02);
    if (frame % 2 === 0) tickScheduler(testWorld);
    if (frame % 3 === 0) api.shoot();
    if (frame % 25 === 0) api.explode();
    peak = Math.max(peak, audio.living);
  }
  await check("twenty seconds of layered audio keep bounded voices and one scheduler", () => {
    assert.equal(testWorld.timers.size, 1); assert.ok(peak <= 48, "observed " + peak);
  });
  await check("active pause ducks music and effects without restarting the score", () => {
    const [ , effectGain, musicGain] = audio.gains;
    const originalGain = musicGain.gain.value;
    const timer = [...testWorld.timers.keys()][0];
    api.sync(false, true, false, { paused: true });
    assert.equal(musicGain.gain.value, originalGain * .25);
    assert.equal(effectGain.gain.value, .16);
    assert.equal([...testWorld.timers.keys()][0], timer);
    const sources = audio.sources.length;
    api.shoot(); api.explode(true); api.warning();
    assert.equal(audio.sources.length, sources);
    audio.advance(.2); tickScheduler(testWorld);
    onlyNewMusic(audio, sources);
    api.sync(true, true);
    assert.equal(musicGain.gain.value, originalGain);
    assert.equal(effectGain.gain.value, .65);
    assert.equal(testWorld.timers.size, 1);
  });
  count = audio.sources.length;
  api.sync(false, true); audio.advance(0.1);
  await check("passive pause clears the scheduler and stops all live or scheduled sounds", () => {
    assert.equal(testWorld.timers.size, 0); assert.equal(audio.living, 0);
    api.shoot(); api.explode(true); api.warning(); assert.equal(audio.sources.length, count);
  });
  audio.advance(600); api.sync(true, true, true);
  await check("resume schedules current music without a paused backlog", () => {
    assert.equal(testWorld.timers.size, 1); assert.ok(audio.sources.length - count <= 20);
  });
  api.setMuted(true); audio.advance(0.1);
  await check("mute stops music and effects, then unmute resumes one scheduler", () => {
    assert.equal(api.muted, true); assert.equal(testWorld.timers.size, 0); assert.equal(audio.living, 0);
    api.setMuted(false); assert.equal(api.muted, false); assert.equal(testWorld.timers.size, 1);
  });
  api.sync(true, false); audio.advance(0.1);
  await check("boss defeat returns to adventure music while the boss explosion still plays", () => {
    assert.equal(testWorld.timers.size, 1); count = audio.sources.length;
    api.explode(true); assert.equal(audio.sources.length, count + 8);
  });
  api.sync(false, false); audio.advance(0.1);
  await check("menu or death stops sound without leaving a scheduler", () => {
    assert.equal(testWorld.timers.size, 0); assert.equal(audio.living, 0);
  });
  api.sync(true, true); count = audio.sources.length; audio.advance(1000); tickScheduler(testWorld);
  await check("a delayed scheduler never catches up by emitting old beats", () => {
    assert.ok(audio.sources.length - count <= 20); assert.equal(testWorld.timers.size, 1);
  });
  api.destroy();
  await check("destroy is repeatable, closes audio, and clears the last timer", async () => {
    api.destroy(); api.sync(true, true); api.shoot(); api.explode();
    assert.equal(testWorld.timers.size, 0); assert.equal(audio.state, "closed");
    assert.equal(await api.unlock(), false);
  });
  const musicWorld = world(FakeContext); musicWorld.api.sync(true, true); await musicWorld.api.unlock();
  const musicAudio = instances.at(-1);
  for (let frame = 0; frame < 1200; frame++) {
    musicAudio.advance(0.02);
    if (frame % 2 === 0) tickScheduler(musicWorld);
    peak = Math.max(peak, musicAudio.living);
  }
  await check("the full eight-bar score loops with finite parameters and restrained voices", () => {
    assert.equal(musicWorld.timers.size, 1); assert.ok(musicAudio.sources.length > 100);
    assert.ok(peak <= 48, "observed " + peak);
    assert.ok(musicAudio.sources.every(node => Number.isFinite(node.startAt) && Number.isFinite(node.stopAt)));
  });
  await check("the new score layers filtered synth bass, low horns and percussion", () => {
    assert.ok(musicAudio.sources.some(node => node.type === "sawtooth"));
    assert.ok(musicAudio.sources.some(node => node.type === "triangle" && node.frequency.events[0].value < 150));
    assert.ok(musicAudio.sources.some(node => node.oscillator && node.frequency.events[0].value < 45));
    assert.ok(musicAudio.filters.every(filter => filter.type !== "highpass"));
  });
  musicWorld.api.destroy();
  const normal = world(FakeContext), rage = world(FakeContext);
  normal.api.sync(true, true); await normal.api.unlock(); const normalAudio = instances.at(-1);
  rage.api.sync(true, true, true); await rage.api.unlock(); const rageAudio = instances.at(-1);
  for (let frame = 0; frame < 200; frame++) {
    normalAudio.advance(0.02); rageAudio.advance(0.02);
    if (frame % 2 === 0) { tickScheduler(normal); tickScheduler(rage); }
  }
  await check("enrage increases rhythmic density without creating a second scheduler", () => {
    assert.ok(rageAudio.sources.length > normalAudio.sources.length);
    assert.equal(normal.timers.size, 1); assert.equal(rage.timers.size, 1);
  });
  normal.api.destroy(); rage.api.destroy();

  const cues = world(FakeContext);
  cues.api.sync(true, true);
  await cues.api.unlock();
  const cueAudio = instances.at(-1);
  await check("Broodmother charge, whip, hatch and surge have distinct cues and duck only the score", () => {
    for (const [kind, count, pitch] of [["coil", 2, 57], ["whip", 3, 159], ["hatch", 4, 68], ["surge", 3, 102]]) {
      const start = cueAudio.sources.length;
      cues.api.bossAttack(kind);
      const layers = cueAudio.sources.slice(start);
      assert.equal(layers.length, count);
      assert.ok(layers.some(node => node.frequency.events[0]?.value === pitch));
      assert.ok(layers.some(node => !node.oscillator));
      cues.api.bossAttack(kind);
      assert.equal(cueAudio.sources.length, start + count);
      cueAudio.advance(0.55);
    }
    const musicBus = cueAudio.gains[2], duck = cueAudio.gains[3];
    assert.equal(musicBus.connections[0], duck);
    assert.notEqual(cueAudio.gains[1].connections[0], duck);
    assert.ok(duck.gain.events.some(event => event.value === .56));
    assert.ok(duck.gain.events.some(event => event.value === .58));
    assert.ok(duck.gain.events.some(event => event.value === .68));
    assert.equal(duck.gain.events.at(-1).value, 1);
    assert.ok(Math.abs(duck.gain.events.at(-1).time - (3 * .55 + .55)) < 1e-8);
  });
  cues.api.destroy();

  const cannonWorld = world(FakeContext), cannon = cannonWorld.api;
  cannon.sync(true, true); await cannon.unlock();
  const cannonAudio = instances.at(-1);
  count = cannonAudio.sources.length; cannon.chargeUltimate();
  const charging = cannonAudio.sources.slice(count);
  await check("ultimate charge has rising pitch and a gradual crescendo for the requested duration", () => {
    assert.equal(charging.length, 3);
    for (const voice of charging) {
      assert.equal(voice.stopAt, 0.86);
      const gain = voice.connections[0].connections[0].gain;
      assert.ok(gain.events[2].value > gain.events[1].value);
      assert.ok(Math.abs(gain.events[2].time - 0.85 * 0.88) < 1e-8);
    }
    for (const voice of charging.filter(voice => voice.oscillator)) {
      assert.ok(voice.frequency.events[1].value > voice.frequency.events[0].value);
    }
  });
  const expectedStops = charging.map(voice => voice.stopAt);
  cannon.explode(true);
  for (const kind of ["volley", "beam", "summon", "burst"]) cannon.bossAttack(kind);
  cannon.bossEnrage();
  cannon.shoot();
  await check("ordinary sound overflow cannot evict protected ultimate voices", () => {
    assert.deepEqual(charging.map(voice => voice.stopAt), expectedStops);
  });
  const unrelated = cannonAudio.sources.filter(voice => !charging.includes(voice));
  const unrelatedStops = unrelated.map(voice => voice.stopAt);
  cannon.stopUltimate();
  await check("stopUltimate fades only the cannon, without stopping explosions, shots, or music", () => {
    assert.ok(charging.every(voice => voice.stopAt <= cannonAudio.currentTime + 0.031));
    assert.deepEqual(unrelated.map(voice => voice.stopAt), unrelatedStops);
    assert.equal(cannonWorld.timers.size, 1);
  });
  cannon.stopUltimate(); cannonAudio.advance(0.04);
  await check("cancelled charge leaves no delayed cannon sound or extra timer", () => {
    assert.ok(charging.every(voice => voice.ended));
    count = cannonAudio.sources.length; cannonAudio.advance(1);
    assert.equal(cannonAudio.sources.length, count);
    assert.equal(cannonWorld.timers.size, 1);
  });
  cannon.chargeUltimate();
  const previousCharge = cannonAudio.sources.slice(-3);
  count = cannonAudio.sources.length; cannon.fireUltimate();
  const firing = cannonAudio.sources.slice(count);
  await check("fire replaces charge with a low impact and sustained energy layers", () => {
    assert.equal(firing.length, 4);
    assert.ok(previousCharge.every(voice => voice.stopAt <= cannonAudio.currentTime + 0.031));
    assert.ok(firing.some(voice => voice.oscillator && voice.frequency.events.at(-1).value === 35));
    assert.ok(firing.some(voice => !voice.oscillator));
    assert.ok(firing.every(voice => voice.stopAt >= cannonAudio.currentTime + 0.75));
    assert.equal(cannonWorld.timers.size, 1);
  });
  cannon.sync(false, true); cannonAudio.advance(0.1);
  await check("pausing during the cannon stops every layer and does not restart it on resume", () => {
    assert.equal(cannonAudio.living, 0); assert.equal(cannonWorld.timers.size, 0);
    count = cannonAudio.sources.length; cannon.fireUltimate(); cannon.chargeUltimate();
    assert.equal(cannonAudio.sources.length, count);
    cannon.sync(true, false); cannonAudio.advance(1);
    onlyNewMusic(cannonAudio, count); assert.equal(cannonAudio.livingEffects, 0);
  });
  cannon.chargeUltimate(); cannon.setMuted(true); cannonAudio.advance(0.1);
  await check("mute during charge stops it and prevents both charge and release while muted", () => {
    assert.equal(cannonAudio.living, 0); count = cannonAudio.sources.length;
    cannon.chargeUltimate(); cannon.fireUltimate(); assert.equal(cannonAudio.sources.length, count);
    cannon.setMuted(false); cannonAudio.advance(1); onlyNewMusic(cannonAudio, count);
  });
  await check("custom and invalid charge durations stay finite, bounded, and cancellable", () => {
    for (const duration of [0.45, -1, NaN, Infinity, 100]) {
      count = cannonAudio.sources.length; cannon.chargeUltimate(duration);
      const layers = cannonAudio.sources.slice(count);
      assert.equal(layers.length, 3);
      assert.ok(layers.every(voice => Number.isFinite(voice.stopAt) && voice.stopAt > cannonAudio.currentTime &&
        voice.stopAt <= cannonAudio.currentTime + 3.011));
      cannon.stopUltimate(); cannonAudio.advance(0.04);
    }
    assert.equal(cannonAudio.livingEffects, 0);
  });
  let cannonPeak = 0; cannon.sync(true, true, true);
  for (let frame = 0; frame < 500; frame++) {
    cannonAudio.advance(0.02);
    if (frame % 2 === 0) tickScheduler(cannonWorld);
    if (frame % 3 === 0) cannon.shoot();
    if (frame % 10 === 0) cannon.explode();
    if (frame % 15 === 0) cannon.bossAttack("volley");
    if (frame % 45 === 0) cannon.bossAttack("beam");
    if (frame % 80 === 0) cannon.bossAttack("summon");
    if (frame % 65 === 0) cannon.bossAttack("burst");
    if (frame % 100 === 0) cannon.chargeUltimate();
    if (frame % 100 === 43) cannon.fireUltimate();
    cannonPeak = Math.max(cannonPeak, cannonAudio.living);
  }
  await check("five cannons with enraged score, all Boss skills, explosions and shots keep bounded voices", () => {
    assert.ok(cannonPeak <= 48, "observed " + cannonPeak);
    assert.equal(cannonWorld.timers.size, 1);
  });
  peak = Math.max(peak, cannonPeak);
  cannon.destroy();
  await check("ultimate API stays safe after audio destruction", () => {
    count = cannonAudio.sources.length;
    cannon.chargeUltimate(); cannon.fireUltimate(); cannon.stopUltimate();
    assert.equal(cannonAudio.sources.length, count); assert.equal(cannonWorld.timers.size, 0);
  });

  const heavyWorld = world(FakeContext), heavy = heavyWorld.api;
  heavy.sync(true, false); await heavy.unlock(); const heavyAudio = instances.at(-1);
  count = heavyAudio.sources.length; heavy.explode();
  const explosion = heavyAudio.sources.slice(count);
  await check("enemy explosion has a transient, broad crack, sub impact and audible debris tail", () => {
    assert.ok(explosion.filter(node => !node.oscillator).length >= 3);
    assert.ok(explosion.some(node => !node.oscillator && node.stopAt - node.startAt >= 0.6));
    assert.ok(explosion.some(node => node.oscillator && node.frequency.events[0].value < 100 && node.frequency.events.at(-1).value < 40));
    assert.ok(explosion.some(node => node.startAt >= 0.07));
  });
  await check("explosion brightness falls with its tail instead of maintaining a brittle hiss", () => {
    const filters = explosion.filter(node => !node.oscillator).map(node => node.connections[0]);
    assert.ok(filters.every(filter => filter.frequency.events.at(-1).value < filter.frequency.events[0].value));
    assert.ok(filters.some(filter => filter.frequency.events[0].value >= 5000 && filter.frequency.events.at(-1).value < 1000));
  });
  await check("mass kills coalesce nearby blasts while a Boss death still gets its own heavy explosion", () => {
    const before = heavyAudio.sources.length;
    for (let index = 0; index < 1000; index++) heavy.explode();
    assert.equal(heavyAudio.sources.length, before);
    heavy.explode(true); const bossBlast = heavyAudio.sources.slice(before);
    assert.ok(bossBlast.length > explosion.length);
    assert.ok(bossBlast.some(node => node.stopAt - node.startAt > 1));
    const emitted = heavyAudio.sources.length;
    for (let index = 0; index < 1000; index++) heavy.explode(true);
    assert.equal(heavyAudio.sources.length, emitted);
  });
  heavyAudio.advance(2);
  count = heavyAudio.sources.length; heavy.warning(); const alarm = heavyAudio.sources.slice(count);
  await check("arrival warning is a staggered low horn and pressure swell, not high beeps", () => {
    assert.ok(alarm.some(node => node.oscillator && node.frequency.events[0].value < 100));
    assert.ok(alarm.filter(node => node.oscillator).every(node => node.frequency.events[0].value < 200));
    assert.ok(alarm.some(node => node.startAt >= heavyAudio.currentTime + 0.65));
    assert.ok(alarm.some(node => !node.oscillator && node.stopAt - node.startAt >= 0.85));
    const emitted = heavyAudio.sources.length; heavy.warning();
    assert.equal(heavyAudio.sources.length, emitted);
  });
  heavyAudio.advance(2);
  await check("a Boss volley with hundreds of projectiles emits one attack sound", () => {
    count = heavyAudio.sources.length; heavy.bossAttack("volley"); const emitted = heavyAudio.sources.length;
    assert.ok(emitted > count);
    for (let index = 0; index < 1000; index++) heavy.bossAttack("volley");
    assert.equal(heavyAudio.sources.length, emitted);
    heavyAudio.advance(0.29); heavy.bossAttack("volley");
    assert.ok(heavyAudio.sources.length > emitted);
  });
  await check("beam, summon and burst have separate cooldowns and remain audible beside a volley", () => {
    const batches = [];
    for (const kind of ["beam", "summon", "burst"]) {
      count = heavyAudio.sources.length; heavy.bossAttack(kind);
      const emitted = heavyAudio.sources.length; batches.push(heavyAudio.sources.slice(count));
      assert.ok(emitted > count);
      for (let index = 0; index < 100; index++) heavy.bossAttack(kind);
      assert.equal(heavyAudio.sources.length, emitted);
    }
    assert.ok(batches[0].some(node => node.stopAt - node.startAt >= 0.44));
    assert.ok(batches[1].some(node => node.stopAt - node.startAt >= 0.64));
    assert.ok(batches[2].some(node => !node.oscillator));
  });
  await check("unknown attack names fall back safely and cannot bypass volley throttling", () => {
    count = heavyAudio.sources.length;
    for (const kind of [undefined, "unknown", "__proto__", "toString", null]) heavy.bossAttack(kind);
    assert.equal(heavyAudio.sources.length, count);
    heavyAudio.advance(0.3); heavy.bossAttack("unknown");
    assert.ok(heavyAudio.sources.length > count);
  });
  heavyAudio.advance(2);
  count = heavyAudio.sources.length; heavy.bossEnrage(); const growl = heavyAudio.sources.slice(count);
  await check("enrage has a sustained low growl and cannot be replayed every frame", () => {
    assert.ok(growl.some(node => node.stopAt - node.startAt > 1));
    assert.ok(growl.some(node => node.oscillator && node.frequency.events.at(-1).value < 40));
    count = heavyAudio.sources.length;
    for (let index = 0; index < 1000; index++) heavy.bossEnrage();
    assert.equal(heavyAudio.sources.length, count);
  });
  heavy.setMuted(true); heavyAudio.advance(0.1);
  await check("mute cancels delayed warnings and Boss skills, preventing all Boss audio while muted", () => {
    assert.equal(heavyAudio.living, 0); count = heavyAudio.sources.length;
    heavy.warning(); heavy.bossEnrage();
    for (const kind of ["volley", "beam", "summon", "burst"]) heavy.bossAttack(kind);
    assert.equal(heavyAudio.sources.length, count);
    heavy.setMuted(false); heavyAudio.advance(2); onlyNewMusic(heavyAudio, count);
  });
  heavy.warning(); heavy.bossAttack("beam"); heavy.sync(false, true); heavyAudio.advance(0.1);
  await check("pause or death cancels a pending second warning hit and no stale Boss sound resumes", () => {
    assert.equal(heavyAudio.living, 0); count = heavyAudio.sources.length;
    heavyAudio.advance(5); heavy.bossAttack("summon"); heavy.bossEnrage();
    heavy.sync(true, false); onlyNewMusic(heavyAudio, count);
  });
  heavy.destroy();
  await check("the new Boss API is safe after destruction", () => {
    count = heavyAudio.sources.length; heavy.bossAttack("beam"); heavy.bossEnrage(); heavy.warning();
    assert.equal(heavyAudio.sources.length, count); assert.equal(heavyWorld.timers.size, 0);
  });

  const driveWorld = world(FakeContext), drive = driveWorld.api;
  drive.sync(true, false); await drive.unlock(); const driveAudio = instances.at(-1);
  count = driveAudio.sources.length; drive.overdrive(); const ignition = driveAudio.sources.slice(count);
  await check("overdrive starts with a rising engine and delayed low thrust, ending within 0.6 seconds", () => {
    assert.equal(ignition.length, 3);
    assert.ok(ignition.some(node => node.type === "sawtooth" &&
      node.frequency.events.at(-1).value > node.frequency.events[0].value));
    assert.ok(ignition.some(node => node.oscillator && node.startAt >= 0.1 &&
      node.frequency.events.at(-1).value < 60));
    assert.ok(ignition.some(node => !node.oscillator));
    assert.ok(ignition.every(node => node.stopAt <= 0.6));
    assert.equal(driveWorld.timers.size, 1);
  });
  await check("overdrive startup spam is limited to one event each second", () => {
    count = driveAudio.sources.length;
    for (let index = 0; index < 1000; index++) drive.overdrive();
    driveAudio.advance(0.99); drive.overdrive();
    assert.equal(driveAudio.sources.length, count);
    driveAudio.advance(0.02); drive.overdrive();
    assert.equal(driveAudio.sources.length, count + 3);
  });
  await check("overdrive shots are lower and weightier while mode switching shares the shot limiter", () => {
    driveAudio.advance(1);
    count = driveAudio.sources.length; drive.shoot();
    const normalShot = driveAudio.sources.slice(count);
    assert.equal(normalShot.length, 2);
    assert.equal(normalShot[0].frequency.events[0].value, 1400);
    count = driveAudio.sources.length;
    for (let index = 0; index < 100; index++) drive.shoot(index % 2 === 0);
    assert.equal(driveAudio.sources.length, count);
    driveAudio.advance(0.044); drive.shoot(true);
    const driveShot = driveAudio.sources.slice(count);
    assert.equal(driveShot.length, 3);
    assert.ok(driveShot[0].frequency.events[0].value < normalShot[0].frequency.events[0].value);
    assert.ok(driveShot.some(node => node.type === "sine" && node.frequency.events[0].value < 150));
    assert.ok(driveShot.every(node => node.stopAt - node.startAt < 0.08));
  });
  driveAudio.advance(1); drive.overdrive(); drive.shoot(true); drive.sync(false, false); driveAudio.advance(0.1);
  await check("pausing cancels ignition and overdrive shots without replaying them on resume", () => {
    assert.equal(driveAudio.living, 0); count = driveAudio.sources.length;
    driveAudio.advance(2); drive.overdrive(); drive.shoot(true);
    drive.sync(true, false); driveAudio.advance(1);
    onlyNewMusic(driveAudio, count); assert.equal(driveAudio.livingEffects, 0);
    assert.equal(driveWorld.timers.size, 1);
  });
  drive.overdrive(); drive.setMuted(true); driveAudio.advance(0.1);
  await check("mute cancels all overdrive layers and unmute has no stale ignition", () => {
    assert.equal(driveAudio.living, 0); count = driveAudio.sources.length;
    driveAudio.advance(2); drive.overdrive(); drive.shoot(true);
    drive.setMuted(false); driveAudio.advance(1);
    onlyNewMusic(driveAudio, count); assert.equal(driveAudio.livingEffects, 0);
  });
  drive.sync(true, true, true); count = driveAudio.sources.length; drive.chargeUltimate();
  const protectedCharge = driveAudio.sources.slice(count), protectedStops = protectedCharge.map(node => node.stopAt);
  drive.overdrive(); drive.explode(true); drive.bossEnrage();
  for (const kind of ["beam", "summon", "burst", "volley"]) drive.bossAttack(kind);
  drive.shoot(true);
  await check("overdrive startup and shots cannot evict the ultimate during dense Boss audio", () => {
    assert.deepEqual(protectedCharge.map(node => node.stopAt), protectedStops);
    assert.ok(driveAudio.living <= 48);
  });
  let drivePeak = driveAudio.living;
  for (let frame = 0; frame < 1000; frame++) {
    driveAudio.advance(0.02);
    if (frame % 2 === 0) tickScheduler(driveWorld);
    drive.shoot(true); drive.overdrive();
    if (frame % 5 === 0) drive.explode();
    if (frame % 15 === 0) drive.bossAttack("volley");
    if (frame % 50 === 0) drive.fireUltimate();
    drivePeak = Math.max(drivePeak, driveAudio.living);
  }
  await check("continuous overdrive with Boss music and effects keeps bounded voices and one scheduler", () => {
    assert.ok(drivePeak <= 48, "observed " + drivePeak);
    assert.equal(driveWorld.timers.size, 1);
  });
  peak = Math.max(peak, drivePeak); drive.destroy();
  await check("overdrive APIs stay silent after audio destruction", () => {
    count = driveAudio.sources.length; drive.overdrive(); drive.shoot(true);
    assert.equal(driveAudio.sources.length, count); assert.equal(driveWorld.timers.size, 0);
  });

  const dynamicWorld = world(FakeContext), dynamic = dynamicWorld.api;
  dynamic.sync(true, false, false, { combo: 0, overdrive: false });
  await dynamic.unlock(); const dynamicAudio = instances.at(-1);
  await check("ordinary combat immediately starts the new bass-and-drum motif without a Boss", () => {
    assert.equal(dynamicWorld.timers.size, 1);
    assert.ok(dynamicAudio.sources.length > 0);
    assert.ok(dynamicAudio.sources.every(node => dynamicAudio.isMusic(node)));
    assert.ok(dynamicAudio.sources.some(node => node.type === "sawtooth" && node.frequency.events[0].value < 90));
    assert.ok(dynamicAudio.sources.some(node => !node.oscillator));
  });
  count = dynamicAudio.sources.length;
  const musicTimer = [...dynamicWorld.timers.keys()][0];
  await check("combo layers and overdrive toggle without restarting the melody or allocating extra timers", () => {
    for (let index = 0; index < 1000; index++) {
      dynamic.sync(true, false, false, { combo: index % 25, overdrive: index % 7 === 0 });
    }
    assert.equal(dynamicAudio.sources.length, count);
    assert.deepEqual([...dynamicWorld.timers.keys()], [musicTimer]);
  });
  await check("invalid optional context values cannot generate non-finite audio or break old sync callers", () => {
    for (const context of [undefined, null, {}, { combo: NaN }, { combo: Infinity }, { combo: -100 }]) {
      dynamic.sync(true, false, false, context);
      assert.equal(dynamicWorld.timers.size, 1);
    }
    dynamic.sync(true, false);
    assert.equal(dynamicWorld.timers.size, 1);
  });
  dynamic.chargeUltimate(); const cinemaCharge = dynamicAudio.sources.slice(-3);
  const cinemaChargeStops = cinemaCharge.map(node => node.stopAt);
  dynamic.sync(true, false, false, { cinematic: true }); dynamicAudio.advance(0.04);
  await check("Boss death cinematic silences music while preserving ultimate and explosion sounds", () => {
    assert.equal(dynamicWorld.timers.size, 0);
    assert.deepEqual(cinemaCharge.map(node => node.stopAt), cinemaChargeStops);
    assert.ok(dynamicAudio.sources.filter(node => dynamicAudio.isMusic(node)).every(node => node.ended));
    count = dynamicAudio.sources.length; dynamic.explode(true);
    assert.equal(dynamicAudio.sources.length, count + 8);
  });
  dynamic.sync(false, false, false, { cinematic: true }); dynamicAudio.advance(0.1);
  await check("pausing a death cinematic stops its effects and keeps the score silent", () => {
    assert.equal(dynamicAudio.living, 0); assert.equal(dynamicWorld.timers.size, 0);
    count = dynamicAudio.sources.length; dynamic.explode(true); dynamic.warning();
    assert.equal(dynamicAudio.sources.length, count);
  });
  dynamic.sync(true, false); dynamicAudio.advance(2);
  dynamic.sync(true, false, false, { combo: 20, overdrive: true, warning: true });
  dynamicAudio.advance(0.04);
  await check("arrival warning silences adventure and overdrive layers while retaining the low alarm", () => {
    assert.equal(dynamicWorld.timers.size, 0);
    assert.ok(dynamicAudio.sources.filter(node => dynamicAudio.isMusic(node)).every(node => node.ended));
    count = dynamicAudio.sources.length; dynamic.warning();
    const warningVoices = dynamicAudio.sources.slice(count);
    assert.ok(warningVoices.length > 0);
    assert.ok(warningVoices.every(node => !dynamicAudio.isMusic(node)));
    for (let index = 0; index < 100; index++) dynamic.sync(true, false, false, { warning: true });
    assert.equal(dynamicAudio.sources.length, count + warningVoices.length);
    assert.equal(dynamicWorld.timers.size, 0);
  });
  dynamicAudio.advance(1.5); count = dynamicAudio.sources.length;
  dynamic.sync(true, true, false, { combo: 20, overdrive: true });
  await check("Boss arrival starts its low battle theme once after the silent warning", () => {
    assert.equal(dynamicWorld.timers.size, 1);
    const arrival = dynamicAudio.sources.slice(count);
    assert.ok(arrival.every(node => dynamicAudio.isMusic(node)));
    assert.ok(arrival.some(node => node.oscillator && node.frequency.events[0].value < 45));
    count = dynamicAudio.sources.length;
    for (let index = 0; index < 1000; index++) dynamic.sync(true, true, false, { combo: 20, overdrive: true });
    assert.equal(dynamicAudio.sources.length, count); assert.equal(dynamicWorld.timers.size, 1);
  });
  dynamic.setMuted(true); dynamicAudio.advance(0.1);
  dynamic.sync(true, false, false, { warning: true });
  count = dynamicAudio.sources.length; dynamic.setMuted(false); dynamicAudio.advance(0.1);
  await check("unmuting in a warning never resumes old adventure, overdrive or Boss notes", () => {
    assert.equal(dynamicAudio.sources.length, count);
    assert.equal(dynamicAudio.living, 0); assert.equal(dynamicWorld.timers.size, 0);
  });
  dynamic.destroy();

  const layers = [];
  for (const combo of [0, 6, 12, 20]) {
    const layerWorld = world(FakeContext);
    layerWorld.api.sync(true, false, false, { combo }); await layerWorld.api.unlock();
    const layerAudio = instances.at(-1);
    for (let frame = 0; frame < 1600; frame++) {
      layerAudio.advance(0.02); if (frame % 2 === 0) tickScheduler(layerWorld);
      peak = Math.max(peak, layerAudio.living);
    }
    layers.push({ sources: layerAudio.sources.length,
      drums: layerAudio.sources.filter(node => node.oscillator &&
        [91, 168].includes(node.frequency.events[0].value)).length,
      motif: layerAudio.sources.filter(node => node.type === "sawtooth" &&
        node.frequency.events[0].value > 150).length });
    assert.equal(layerWorld.timers.size, 1);
    assert.ok(layerAudio.sources.every(node => Number.isFinite(node.startAt) && Number.isFinite(node.stopAt)));
    layerWorld.api.destroy();
  }
  await check("6, 12 and 20 combo add drums over the same eight-bar synth motif", () => {
    assert.ok(layers[0].drums > 0);
    for (let index = 1; index < layers.length; index++) {
      assert.ok(layers[index].drums > layers[index - 1].drums);
      assert.ok(layers[index].sources > layers[index - 1].sources);
      assert.equal(layers[index].motif, layers[0].motif);
    }
  });
  const rushWorld = world(FakeContext);
  rushWorld.api.sync(true, false, false, { combo: 20, overdrive: true }); await rushWorld.api.unlock();
  const rushAudio = instances.at(-1);
  for (let frame = 0; frame < 1600; frame++) {
    rushAudio.advance(0.02); if (frame % 2 === 0) tickScheduler(rushWorld);
    peak = Math.max(peak, rushAudio.living);
  }
  await check("overdrive adds faster drums and deep pulsing bass while retaining the synth motif", () => {
    const drums = rushAudio.sources.filter(node => node.oscillator && [91, 168].includes(node.frequency.events[0].value));
    assert.ok(drums.length > layers[3].drums);
    assert.ok(rushAudio.sources.some(node => node.type === "triangle" && node.frequency.events[0].value < 45));
    assert.ok(rushAudio.sources.some(node => node.type === "sawtooth" && node.frequency.events[0].value > 150));
    assert.equal(rushWorld.timers.size, 1); assert.ok(peak <= 48, "observed " + peak);
  });
  const beforeExit = rushAudio.sources.length;
  rushWorld.api.sync(true, false, false, { combo: 0 });
  for (let frame = 0; frame < 1600; frame++) {
    rushAudio.advance(0.02); if (frame % 2 === 0) tickScheduler(rushWorld);
  }
  await check("overdrive exit removes its percussion and bass without replaying the opening bar", () => {
    const calm = rushAudio.sources.slice(beforeExit);
    assert.ok(calm.length > 100);
    assert.ok(calm.some(node => node.type === "sawtooth"));
    assert.ok(calm.every(node => node.type !== "triangle" || node.frequency.events[0].value >= 45));
    assert.equal(rushWorld.timers.size, 1);
  });
  rushWorld.api.destroy();
  const pressureWorld = world(FakeContext), pressure = pressureWorld.api;
  pressure.sync(true, true, true, { combo: 80, overdrive: true }); await pressure.unlock();
  const pressureAudio = instances.at(-1);
  let dynamicPeak = 0;
  for (let frame = 0; frame < 1200; frame++) {
    pressureAudio.advance(0.02);
    if (frame % 2 === 0) tickScheduler(pressureWorld);
    pressure.shoot(true);
    if (frame % 5 === 0) pressure.explode();
    if (frame % 15 === 0) pressure.bossAttack("volley");
    if (frame % 40 === 0) pressure.bossAttack("beam");
    if (frame % 100 === 0) pressure.chargeUltimate();
    if (frame % 100 === 43) pressure.fireUltimate();
    dynamicPeak = Math.max(dynamicPeak, pressureAudio.living);
  }
  await check("enraged Boss music plus the new overdrive rhythm, cannons and rapid effects stays bounded", () => {
    assert.ok(dynamicPeak <= 48, "observed " + dynamicPeak);
    assert.equal(pressureWorld.timers.size, 1);
    assert.ok(pressureAudio.sources.every(node => Number.isFinite(node.startAt) && Number.isFinite(node.stopAt)));
    pressure.sync(false, true, true, { overdrive: true }); pressureAudio.advance(0.1);
    assert.equal(pressureAudio.living, 0); assert.equal(pressureWorld.timers.size, 0);
  });
  peak = Math.max(peak, dynamicPeak); pressure.destroy();
  const parryWorld = world(FakeContext), parry = parryWorld.api;
  parry.sync(true, true); await parry.unlock(); const parryAudio = instances.at(-1);
  count = parryAudio.sources.length; parry.perfectShield();
  const parryImpact = parryAudio.sources.slice(count);
  await check("perfect shield combines a quick metallic attack with a short bass countershock", () => {
    assert.ok(parryImpact.length >= 4 && parryImpact.length <= 6);
    assert.ok(parryImpact.some(node => !node.oscillator && node.stopAt - node.startAt < 0.08));
    assert.ok(parryImpact.filter(node => node.oscillator && node.frequency.events[0].value > 1000).length >= 2);
    assert.ok(parryImpact.some(node => node.oscillator && node.frequency.events.at(-1).value <= 60));
    assert.ok(parryImpact.some(node => !node.oscillator && node.startAt > parryAudio.currentTime));
    assert.ok(parryImpact.every(node => node.stopAt <= parryAudio.currentTime + 0.4));
    assert.equal(parryWorld.timers.size, 1);
  });
  await check("same-frame perfect shield spam coalesces and a later independent block can sound again", () => {
    const emitted = parryAudio.sources.length;
    for (let index = 0; index < 1000; index++) parry.perfectShield();
    parryAudio.advance(0.34); parry.perfectShield();
    assert.equal(parryAudio.sources.length, emitted);
    parryAudio.advance(0.02); parry.perfectShield();
    assert.ok(parryAudio.sources.length > emitted);
  });
  parry.sync(false, true); parryAudio.advance(0.1);
  await check("pause cancels metallic and countershock tails without replaying a block on resume", () => {
    assert.equal(parryAudio.living, 0); assert.equal(parryWorld.timers.size, 0);
    count = parryAudio.sources.length; parryAudio.advance(2); parry.perfectShield();
    assert.equal(parryAudio.sources.length, count);
    parry.sync(true, false); parryAudio.advance(0.5);
    onlyNewMusic(parryAudio, count); assert.equal(parryAudio.livingEffects, 0);
  });
  parry.perfectShield(); parry.setMuted(true); parryAudio.advance(0.1);
  await check("mute stops perfect shield immediately and does not defer missed blocks until unmute", () => {
    assert.equal(parryAudio.living, 0); count = parryAudio.sources.length;
    parryAudio.advance(1); parry.perfectShield();
    assert.equal(parryAudio.sources.length, count);
    parry.setMuted(false); parryAudio.advance(0.5);
    onlyNewMusic(parryAudio, count); assert.equal(parryAudio.livingEffects, 0);
  });
  parry.sync(true, true, true, { combo: 80, overdrive: true });
  count = parryAudio.sources.length; parry.chargeUltimate();
  const parryProtected = parryAudio.sources.slice(count), parryStops = parryProtected.map(node => node.stopAt);
  parry.perfectShield(); parry.explode(true); parry.overdrive();
  for (const kind of ["beam", "summon", "burst", "volley"]) parry.bossAttack(kind);
  parry.shoot(true);
  await check("perfect shield during dense combat cannot interrupt protected ultimate charge voices", () => {
    assert.deepEqual(parryProtected.map(node => node.stopAt), parryStops);
    assert.ok(parryAudio.living <= 48);
  });
  let parryPeak = parryAudio.living;
  for (let frame = 0; frame < 1000; frame++) {
    parryAudio.advance(0.02);
    if (frame % 2 === 0) tickScheduler(parryWorld);
    parry.perfectShield(); parry.shoot(true);
    if (frame % 5 === 0) parry.explode();
    if (frame % 15 === 0) parry.bossAttack("volley");
    if (frame % 40 === 0) parry.bossAttack("beam");
    if (frame % 100 === 0) parry.chargeUltimate();
    if (frame % 100 === 43) parry.fireUltimate();
    parryPeak = Math.max(parryPeak, parryAudio.living);
  }
  await check("continuous perfect shield requests with Boss music and weapons respect the real voice budget", () => {
    assert.ok(parryPeak <= 48, "observed " + parryPeak);
    assert.equal(parryWorld.timers.size, 1);
    assert.ok(parryAudio.sources.every(node => Number.isFinite(node.startAt) && Number.isFinite(node.stopAt)));
  });
  peak = Math.max(peak, parryPeak); parry.destroy();
  await check("perfect shield is safe and silent after audio destruction", () => {
    count = parryAudio.sources.length; parry.perfectShield();
    assert.equal(parryAudio.sources.length, count); assert.equal(parryWorld.timers.size, 0);
  });
  process.stdout.write("All " + checks + " audio simulation checks passed; observed peak " + peak + " active/scheduled sources.\n");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
