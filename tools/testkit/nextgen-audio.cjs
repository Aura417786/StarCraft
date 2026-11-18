"use strict";
// Public audio contracts and real-browser authored playback. No subjective listening claim.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");
const sandbox = vm.createContext({ window: {}, console, Math, Number, Set, Map });
vm.runInContext(fs.readFileSync(path.join(root, "audio.js"), "utf8") + "\n globalThis.api=gameAudio;", sandbox);
assert.equal(typeof sandbox.api.bossSkill, "function", "phased Boss sound public contract");
assert.equal(typeof sandbox.api.fighterSkill, "function", "fighter ability sound public contract");
for (let bossId = 1; bossId <= 11; bossId++) {
  for (const phase of ["tell", "active", "impact", "tail"]) sandbox.api.bossSkill("tide", { bossId, phase, x: 100, y: 100 });
}
sandbox.api.fighterSkill("red", "shield");
sandbox.api.destroy();
console.log("PASS unsupported audio remains safe for every new ability phase");
const crypto = require("node:crypto");
const directory = path.join(root, "assets/audio/nextgen");
const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
const offline = vm.createContext({});
for (const group of Object.keys(manifest.groups)) vm.runInContext(fs.readFileSync(path.join(directory, group + ".js"), "utf8"), offline);
let bytes = 0;
for (const [name, clip] of Object.entries(manifest.clips)) {
  const data = fs.readFileSync(path.join(directory, name + ".ogg"));
  assert.equal(crypto.createHash("sha256").update(data).digest("hex"), clip.sha256, "manifest hash: " + name);
  assert.deepEqual(Buffer.from(offline.starBreakerNextgenAudio[name], "base64"), data, "offline/http parity: " + name);
  assert.ok(clip.peakDbFS < -1, "authored clip peak has headroom: " + name);
  bytes += data.length;
}
assert.ok(bytes < 4 * 1024 * 1024, "new compressed audio stays below 4 MiB");
assert.equal(manifest.bosses.length, 11);
assert.equal(new Set(manifest.bosses.map(row => row.family)).size, 11);
for (const boss of manifest.bosses) {
  for (const suffix of ["tell", "0", "1", "2", "impact", "tail"]) {
    assert.ok(manifest.clips[`ng_${boss.family}_${suffix}`], "complete material lifecycle: " + boss.family);
  }
}
console.log("PASS authored clip hashes, offline parity, all Boss lifecycles and compressed size budget");
const encounterPath = path.join(root, "assets/audio/encounters");
const encounter = JSON.parse(fs.readFileSync(path.join(encounterPath, "manifest.json"), "utf8"));
const runtime = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, "audio-catalog.js"), "utf8") + "\nglobalThis.bank=starBreakerAudioCatalog.encounters", runtime);
assert.deepEqual(JSON.parse(JSON.stringify(runtime.bank)), encounter, "runtime and authored manifest agree");
for (const group of Object.keys(encounter.groups)) vm.runInContext(fs.readFileSync(path.join(encounterPath, group+".js"), "utf8"), offline);
let encounterBytes = 0;
for (const [name, clip] of Object.entries(encounter.clips)) {
  const data = fs.readFileSync(path.join(encounterPath, name+".ogg"));
  assert.deepEqual(data, Buffer.from(offline.starBreakerNextgenAudio[name], "base64"));
  assert.equal(crypto.createHash("sha256").update(data).digest("hex"), clip.sha256);
  assert.ok(clip.peakDbFS < -1);
  if (clip.bpm) {
    assert.ok(Math.abs(clip.duration - 16*60/clip.bpm) < .001, name + " ends on the four-bar grid");
    assert.ok(fs.statSync(path.join(encounterPath, name+".mid")).size > 128);
  }
  encounterBytes += data.length;
}
assert.ok(encounterBytes < 2*1024*1024);
assert.equal(new Set(encounter.bosses.map(row => row.theme)).size, 11);
assert.deepEqual(Object.keys(encounter.regions).sort(), ["belt","citadel","hangar","rift","wreck"]);
for (const row of encounter.bosses) for (const suffix of ["signature","resonance","ultimate","theme"]) {
  assert.ok(encounter.clips[row.group+"_"+suffix]);
}
console.log("PASS encounter bank, 11 individual score motifs, phase and region cues, sample-grid lengths, offline and HTTP checksums");
if (process.argv.includes("--contract-only")) process.exit(0);
console.log("Browser checks run by tools/testkit/nextgen-audio-browser.cjs");
