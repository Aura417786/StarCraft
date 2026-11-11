"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const profile = require("../profile.js");

function memoryStorage(initial) {
  const values = new Map([[profile.key, initial]]);
  return { getItem(key = profile.key) { return values.get(key); }, setItem(key, next) { values.set(key, next); } };
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

const rushClear = {
  mode: "rush", fighter: "blue", difficulty: "veteran", score: 31_000,
  seconds: 600, hits: 0, won: true, seed: 32533,
  bossRecords: Array.from({ length: 11 }, (_, type) => ({ type, seconds: 41, hitCount: 0 }))
};

test("weekly Rush awards badges separately and never alters normal rankings", () => {
  const save = profile.createStore(memoryStorage());
  const weekly = { ...rushClear, week: "2026-11-09" };
  const result = save.finish(weekly);
  assert.equal(result.cleanBadge, true);
  assert.equal(result.fastBadge, true);
  assert.equal(save.data.weekly["2026-11-09"].bestTime, 600);
  assert.equal(save.data.rush.attempts, 0);
  save.finish({ ...weekly, assisted: true, score: 40_000, seconds: 200 });
  assert.equal(save.data.weekly["2026-11-09"].bestScore, 31_000);
  assert.equal(save.data.weekly["2026-11-09"].attempts, 1);
});

test("Rush resume survives reopen and finishing it does not affect any ranked record", () => {
  const storage = memoryStorage();
  const save = profile.createStore(storage);
  save.finish({ ...rushClear, bossRecords: rushClear.bossRecords.slice(0, 4),
    currentBoss: 4, score: 7000, died: true, won: false });
  const reopened = profile.createStore(storage);
  assert.deepEqual(reopened.data.rushResume, { boss: 4, seed: 32533, difficulty: "veteran", fighter: "blue" });
  const before = reopened.data;
  reopened.finish({ ...rushClear, resumed: true, score: 99_000, seconds: 10 });
  assert.deepEqual(reopened.data, before);
  reopened.finish(rushClear);
  assert.equal(reopened.data.rushResume, null);
  assert.equal(reopened.data.rushByDifficulty.veteran.clean, 1);
  assert.equal(reopened.data.rushByDifficulty.veteran.fast, 1);
});

test("44 current and legacy badges grant cosmetics only for earned conditions and survive save recovery", () => {
  const awards = require("../achievements.js");
  const storage = memoryStorage();
  const save = profile.createStore(storage);
  assert.equal(awards.ids.length, 44);
  assert.equal(new Set(awards.ids).size, awards.ids.length);
  assert.equal(save.equipAward("skin", "frost"), false);
  const result = save.finish({ ...rushClear, mode: "campaign", fighter: "red", difficulty: "abyss",
    bossRecords: rushClear.bossRecords.map(record => ({ ...record, builds: ["build-wing", "build-crossfire"] })) });
  assert.ok(result.newAwards.includes("fly-red"));
  assert.ok(result.newAwards.includes("build-crossfire"));
  assert.ok(result.newAwards.includes("clean-10"));
  assert.equal(save.equipAward("skin", "frost"), true);
  assert.equal(save.equipAward("theme", "archive"), true);
  assert.equal(save.equipAward("effect", "trail"), false);
  assert.equal(save.data.points, 0);
  storage.setItem(profile.key, "{broken");
  const recovered = profile.createStore(storage);
  assert.equal(recovered.status, "backup");
  assert.deepEqual(recovered.data, save.data);
  assert.equal(recovered.equipAward("skin", ""), true);
  assert.equal(profile.createStore(storage).status, "ok");
});

test("daily streak counts distinct consecutive UTC dates and assisted days stay separate", () => {
  const save = profile.createStore(memoryStorage());
  const daily = { ...rushClear, mode: "daily", bossRecords: rushClear.bossRecords.slice(0, 1) };
  for (const day of ["2026-10-30", "2026-10-31", "2026-10-31"]) save.finish({ ...daily, day });
  save.finish({ ...daily, day: "2026-11-01", assisted: true });
  assert.equal(save.data.awards.badges.includes("daily-streak"), false);
  const result = save.finish({ ...daily, day: "2026-11-01" });
  assert.deepEqual(result.newAwards, ["daily-streak"]);
  assert.equal(save.equipAward("effect", "trail"), true);
});
