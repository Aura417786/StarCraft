"use strict";
// Deterministic decoder boundary: reproduce mute while the first bank is pending.
// No browser, sound device, rendering loop or wall-clock delays are required.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");
let releaseBase;
const baseGate = new Promise(resolve => { releaseBase = resolve; });
const fetched = [], decoded = [], sources = [], oscillators = [];
const parameter = () => ({ value: 0, setValueAtTime(value) { this.value = value; },
  linearRampToValueAtTime(value) { this.value = value; }, exponentialRampToValueAtTime(value) { this.value = value; },
  cancelScheduledValues() {} });
const node = () => ({ connect() {}, disconnect() {} });
const clip = name => ({ name, duration: 4, length: 32, sampleRate: 32000, numberOfChannels: 1,
  getChannelData: () => new Float32Array(32) });
class Context {
  constructor() { this.currentTime = 0; this.state = "suspended"; this.sampleRate = 32000; this.destination = {}; }
  createGain() { return { ...node(), gain: parameter() }; }
  createBiquadFilter() { return { ...node(), frequency: parameter(), Q: parameter() }; }
  createStereoPanner() { return { ...node(), pan: parameter() }; }
  createDynamicsCompressor() { return Object.assign(node(), Object.fromEntries(["threshold", "knee", "ratio", "attack", "release"].map(key => [key, parameter()]))); }
  createBuffer() { return clip("noise"); }
  createBufferSource() {
    const source = { ...node(), playbackRate: parameter(), start() { sources.push(this.buffer?.name); }, stop() {} };
    return source;
  }
  createOscillator() {
    const voice = { ...node(), frequency: parameter(), start() {}, stop(at) { this.stopAt = at; } };
    oscillators.push(voice);
    return voice;
  }
  async decodeAudioData(bytes) {
    const name = new TextDecoder().decode(bytes);
    if (name !== "ng_red_shield") await baseGate;
    decoded.push(name);
    return clip(name);
  }
  async resume() { this.state = "running"; this.onstatechange?.(); }
  async close() { this.state = "closed"; }
}
const catalog = { stems: { flight_harmony: 4, flight_pulse: 4 }, effects: [], factions: {},
  encounters: { bosses: [], regions: {}, groups: {enc_fighters:["enc_red_prime"]},
    clips: {enc_red_prime: {group:"enc_fighters"}} },
  nextgen: { groups: { fighters: ["ng_red_shield"] }, bosses: [], clips: Object.fromEntries([
    "ng_red_shield", "ng_flight_alert", "ng_hangar_harmony", "ng_hangar_detail",
  ].map(name => [name, { duration: 4, group: name === "ng_red_shield" ? "fighters" : "music", loop: name !== "ng_red_shield" }])) } };
const sandbox = vm.createContext({ console, AbortController, Uint8Array,
  starBreakerAudioCatalog: catalog,
  document: { currentScript: { hasAttribute: () => true } },
  window: { AudioContext: Context, location: { protocol: "https:" }, setTimeout: () => 1, clearTimeout() {} },
  fetch: async url => {
    const name = path.basename(url, ".ogg");
    fetched.push(name);
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode(name).buffer };
  } });
vm.runInContext(fs.readFileSync(path.join(root, "audio.js"), "utf8") + "\nglobalThis.api=gameAudio;", sandbox);
const flush = async () => { for (let index = 0; index < 40; index++) await Promise.resolve(); };
(async () => {
  const api = sandbox.api;
  api.sync(true, false, false, { scene: "battle", lives: 3 });
  await api.unlock();
  assert.ok(fetched.includes("flight_harmony"), "base decode has started");
  assert.equal(decoded.length, 0, "base decoder is held at the external boundary");
  const before = oscillators.length;
  assert.equal(api.fighterSkill("red","prime"), true, "cold heavy-cannon input has immediate audio");
  assert.equal(oscillators.length, before + 1);
  const windup = oscillators.at(-1);
  api.stopFighterCharge();
  assert.ok(windup.stopAt < .05, "cancel releases the cold windup within 50ms");
  api.setMuted(true);
  releaseBase();
  await flush();
  assert.ok(decoded.includes("flight_harmony"), "base bank completed while muted");
  assert.equal(api.fighterSkill("red", "shield"), false, "muted input stays silent");
  api.setMuted(false);
  await flush();
  assert.equal(api.fighterSkill("red", "shield"), true, "unmute eventually recovers the authored fighter palette");
  assert.ok(sources.includes("ng_red_shield"), "fighter event uses the decoded authored sample");
  for (let index = 0; index < 12; index++) {
    api.setMuted(true); api.setMuted(false);
    await api.unlock();
    api.sync(true, false, false, { scene: "battle", lives: 3, elite: index % 2 === 0 });
  }
  await flush();
  assert.equal(fetched.filter(name => name === "ng_red_shield").length, 1, "resume and repeated sync deduplicate palette requests");
  assert.equal(decoded.filter(name => name === "ng_red_shield").length, 1, "authored fighter clip is decoded once");
  api.destroy();
  console.log("PASS pending bank decode → mute → decode completion → unmute restores authored fighter sounds without duplicate loads");
})().catch(error => { console.error(error); process.exitCode = 1; });
