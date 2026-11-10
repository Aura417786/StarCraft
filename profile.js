"use strict";

const StarBreakerProfile = (() => {
  const key = "star-breaker-profile";
  const version = 1;
  const bossCount = 11;
  const difficulties = ["recruit", "veteran", "abyss"];
  const upgradeCosts = [1, 2, 3, 4, 5];
  const upgradeKeys = ["firepower", "survival", "mobility"];
  const maxStat = 1_000_000_000;
  const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const number = (value, max = maxStat) => Number.isFinite(value) ? Math.max(0, Math.min(value, max)) : 0;
  const count = (value, max) => Math.floor(number(value, max));
  const shorter = (current, seconds) => seconds > 0 && (!current || seconds < current);

  function sanitizeBoss(raw) {
    const value = object(raw);
    const clears = count(value.clears);
    return { clears, clean: count(value.clean, clears), best: number(value.best, 86_400) };
  }

  function sanitizeRecord(raw) {
    const value = object(raw);
    const attempts = count(value.attempts);
    return {
      bestScore: count(value.bestScore),
      bestTime: number(value.bestTime, 86_400),
      attempts,
      clears: count(value.clears, attempts),
      deaths: count(value.deaths, attempts),
      furthest: count(value.furthest, bossCount)
    };
  }

  function sanitizeCampaign(raw) {
    const value = object(raw);
    const bosses = object(value.bosses);
    return {
      ...sanitizeRecord(value),
      totalKills: count(value.totalKills),
      bosses: Array.from({ length: bossCount }, (_, i) => sanitizeBoss(bosses[i] ?? value.bosses?.[i])),
      byDifficulty: Object.fromEntries(difficulties.map(id => [id, sanitizeRecord(object(value.byDifficulty)[id])]))
    };
  }

  function migrate(raw) {
    const source = object(raw);
    if (Number.isSafeInteger(source.version) && source.version > version) return null;
    if (source.version === version) return source;
    // Accept unversioned imports with scalar campaign bests.
    return { ...source, campaign: source.campaign ?? {
      bestScore: source.highScore, bestTime: source.bestClearTime, furthest: source.furthestBoss,
      clears: source.clearCount, attempts: source.attempts ?? source.clearCount, totalKills: source.totalKills,
      bosses: source.bossRecords
    }, points: source.points ?? source.modPoints, upgrades: source.upgrades ?? source.modifications };
  }

  function normalize(source) {
    const value = object(source);
    const practice = Array.isArray(value.practice) ? value.practice : [];
    const daily = Object.entries(object(value.daily)).filter(([day]) => /^\d{4}-\d{2}-\d{2}$/.test(day))
      .sort(([a], [b]) => b.localeCompare(a)).slice(0, 366);
    return {
      version,
      points: count(value.points),
      upgrades: Object.fromEntries(upgradeKeys.map(id => [id, count(object(value.upgrades)[id], upgradeCosts.length)])),
      unlocked: [...new Set((Array.isArray(value.unlocked) ? value.unlocked
        : Array.from({ length: count(object(value.campaign).furthest, bossCount) }, (_, id) => id))
        .filter(id => Number.isInteger(id) && id >= 0 && id < bossCount))].sort((a, b) => a - b),
      campaign: sanitizeCampaign(value.campaign),
      assisted: sanitizeCampaign(value.assisted),
      rush: sanitizeRecord(value.rush),
      rushByDifficulty: Object.fromEntries(difficulties.map(id => [id, sanitizeRecord(object(value.rushByDifficulty)[id])])),
      rushAssisted: sanitizeRecord(value.rushAssisted),
      practice: Array.from({ length: bossCount }, (_, i) => sanitizeBoss(practice[i])),
      daily: Object.fromEntries(daily.map(([day, record]) => [day, sanitizeRecord(record)]))
    };
  }

  function decode(serialized) {
    if (!serialized) return { profile: normalize(), status: "empty" };
    try {
      const raw = JSON.parse(serialized);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid save");
      const migrated = migrate(raw);
      if (!migrated) return { profile: normalize(), status: "future" };
      return { profile: normalize(migrated), status: raw.version === version ? "ok" : "migrated" };
    } catch {
      return { profile: normalize(), status: "recovered" };
    }
  }

  function createStore(storage) {
    let profile = normalize();
    let status = "empty";
    let writable = false;
    function read() {
      try {
        const saved = decode(storage.getItem(key));
        profile = saved.profile;
        status = saved.status;
        writable = status !== "future";
      } catch {
        status = "session";
        writable = false;
      }
    }
    read();

    function transaction(update) {
      if (writable) read();
      const result = update(profile);
      if (result === false) return result;
      profile = normalize(profile);
      if (writable) {
        try { storage.setItem(key, JSON.stringify(profile)); }
        catch { status = "session"; writable = false; }
      }
      return result;
    }

    function spendUpgrade(path) {
      return transaction(current => {
        if (!upgradeKeys.includes(path)) return false;
        const level = current.upgrades[path];
        const cost = upgradeCosts[level];
        if (!cost || current.points < cost) return false;
        current.points -= cost;
        current.upgrades[path]++;
        return true;
      });
    }

    function awardBoss(type, difficulty) {
      return transaction(current => {
        if (!Number.isInteger(type) || type < 0 || type >= bossCount) return false;
        const unlocked = !current.unlocked.includes(type);
        if (unlocked) current.unlocked.push(type);
        const points = (difficulty === "abyss" ? 2 : 1) + (unlocked ? 1 : 0);
        current.points += points;
        return { unlocked, points };
      });
    }

    function addBoss(record, sample) {
      if (!record) return;
      record.clears++;
      if (sample.hitCount === 0) record.clean++;
      if (shorter(record.best, sample.seconds)) record.best = sample.seconds;
    }

    function addRun(record, run, formal) {
      const newScore = formal && run.score > record.bestScore;
      const newTime = formal && run.won && shorter(record.bestTime, run.seconds);
      if (newScore) record.bestScore = run.score;
      if (newTime) record.bestTime = run.seconds;
      record.attempts++;
      if (run.won) record.clears++;
      if (run.died) record.deaths++;
      record.furthest = Math.max(record.furthest, run.bossRecords.reduce((max, item) => Math.max(max, item.type + 1), 0));
      return { newScore, newTime, bestScore: record.bestScore };
    }

    function finish(run) {
      return transaction(current => {
        const formal = !run.assisted && !run.abandoned;
        if (run.mode === "practice") {
          for (const item of run.bossRecords) addBoss(current.practice[item.type], item);
          return {};
        }
        if (run.mode === "daily") {
          if (!formal || !run.day) return {};
          const record = current.daily[run.day] ??= sanitizeRecord();
          return addRun(record, run, true);
        }
        const difficulty = difficulties.includes(run.difficulty) ? run.difficulty : "veteran";
        if (run.mode === "rush") {
          const record = run.assisted ? current.rushAssisted : current.rush;
          const best = addRun(record, run, !run.abandoned);
          return run.assisted ? best : addRun(current.rushByDifficulty[difficulty], run, formal);
        }
        const campaign = run.assisted ? current.assisted : current.campaign;
        campaign.totalKills += count(run.kills);
        for (const item of run.bossRecords) addBoss(campaign.bosses[item.type], item);
        addRun(campaign, run, !run.abandoned);
        return addRun(campaign.byDifficulty[difficulty], run, !run.abandoned);
      });
    }

    return {
      get data() { return normalize(profile); },
      get status() { return status; },
      spendUpgrade, awardBoss, finish,
      refresh() { if (writable) read(); }
    };
  }

  return { key, version, bossCount, difficulties, upgradeCosts, upgradeKeys, decode, createStore };
})();

if (typeof module !== "undefined") module.exports = StarBreakerProfile;
