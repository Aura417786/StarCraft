"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const profile = require("../profile.js");

function memoryStorage(initial) {
  let value = initial;
  return { getItem() { return value; }, setItem(key, next) { value = next; } };
}

const campaign = { mode: "campaign", difficulty: "veteran", score: 6000, seconds: 100, kills: 13, won: true,
  bossRecords: [{ type: 0, seconds: 40, hitCount: 0 }, { type: 1, seconds: 44, hitCount: 1 }] };

test("progress, refit cost, and clear records survive a fresh store", () => {
  const storage = memoryStorage();
  const first = profile.createStore(storage);
  assert.equal(first.spendUpgrade("firepower"), false);
  assert.deepEqual(first.awardBoss(0, "veteran"), { points: 2, unlocked: true });
  assert.equal(first.spendUpgrade("firepower"), true);
  assert.equal(first.spendUpgrade("firepower"), false);
  first.finish(campaign);
  const restored = profile.createStore(storage).data;
  assert.equal(restored.points, 1);
  assert.equal(restored.upgrades.firepower, 1);
  assert.deepEqual(restored.unlocked, [0]);
  assert.equal(restored.campaign.bestScore, 6000);
  assert.equal(restored.campaign.bestTime, 100);
  assert.equal(restored.campaign.totalKills, 13);
  assert.equal(restored.campaign.bosses[0].clean, 1);
  assert.equal(restored.campaign.bosses[1].clean, 0);
});

test("unversioned imports and damaged data recover with validated fields", () => {
  const old = profile.decode(JSON.stringify({ highScore: 875, clearCount: 2, furthestBoss: 3, modPoints: -7,
    modifications: { firepower: 19, survival: "9" } }));
  assert.equal(old.status, "migrated");
  assert.equal(old.profile.campaign.bestScore, 875);
  assert.equal(old.profile.campaign.clears, 2);
  assert.deepEqual(old.profile.unlocked, [0, 1, 2]);
  assert.deepEqual(old.profile.upgrades, { firepower: 5, survival: 0, mobility: 0 });
  assert.equal(old.profile.points, 0);
  const broken = profile.createStore(memoryStorage("{broken"));
  assert.equal(broken.status, "recovered");
  assert.equal(broken.data.campaign.bestScore, 0);
  assert.equal(broken.awardBoss(0, "recruit").points, 2);
});

test("practice, rush, daily, and assisted runs update independent records", () => {
  const store = profile.createStore(memoryStorage());
  const date = "2026-11-10";
  store.finish({ ...campaign, mode: "practice" });
  store.finish({ ...campaign, mode: "rush", died: true, won: false });
  store.finish({ ...campaign, mode: "daily", day: date, score: 2010 });
  store.finish({ ...campaign, mode: "daily", day: date, score: 9999, assisted: true });
  store.finish({ ...campaign, score: 9999, assisted: true });
  store.finish({ ...campaign, score: 9999, won: false, abandoned: true, bossRecords: [] });
  const result = store.data;
  assert.equal(result.practice[0].best, 40);
  assert.equal(result.rush.deaths, 1);
  assert.equal(result.rushByDifficulty.veteran.bestScore, 6000);
  assert.equal(result.rushByDifficulty.abyss.bestScore, 0);
  assert.equal(result.daily[date].bestScore, 2010);
  assert.equal(result.assisted.bestScore, 9999);
  assert.equal(result.campaign.bestScore, 0);
  assert.equal(result.campaign.clears, 0);
});

test("inaccessible storage falls back to session state and a future schema is preserved", () => {
  const blocked = profile.createStore({ getItem() { throw Error("denied"); } });
  assert.equal(blocked.status, "session");
  blocked.awardBoss(0, "veteran");
  assert.equal(blocked.data.points, 2);
  const future = JSON.stringify({ version: 9, points: 99 });
  const storage = memoryStorage(future);
  const earlier = profile.createStore(storage);
  assert.equal(earlier.status, "future");
  earlier.awardBoss(0, "veteran");
  assert.equal(storage.getItem(), future);
});
