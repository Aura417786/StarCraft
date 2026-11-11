"use strict";

const StarBreakerProfile = (() => {
  const key = "star-breaker-profile";
  const backupKey = key + "-backup";
  const version = 2;
  const awards = typeof StarBreakerAwards !== "undefined" ? StarBreakerAwards
    : typeof require === "function" ? require("./achievements.js") : null;
  const bossCount = 11;
  const difficulties = ["easy", "normal", "hard"];
  // Keep v29 records under their original keys; changed rules are not the same leaderboard.
  const legacyDifficulties = ["recruit", "veteran", "abyss"];
  const recordDifficulties = [...difficulties, ...legacyDifficulties];
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
    return { clears, clean: count(value.clean, clears), best: number(value.best, 86_400),
      ...(value.lastAssists ? { lastAssists: recordedAssists(value.lastAssists) } : {}) };
  }

  function recordedAssists(raw) {
    return Object.fromEntries(["extendedWarning", "noScreenShake", "reducedMotion", "timeRewind"].map(key => [key, raw?.[key] === true]));
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
      furthest: count(value.furthest, bossCount),
      clean: count(value.clean, attempts),
      fast: count(value.fast, attempts),
      ...(value.lastAssists ? { lastAssists: recordedAssists(value.lastAssists) } : {})
    };
  }

  function sanitizeCampaign(raw) {
    const value = object(raw);
    const bosses = object(value.bosses);
    return {
      ...sanitizeRecord(value),
      totalKills: count(value.totalKills),
      bosses: Array.from({ length: bossCount }, (_, i) => sanitizeBoss(bosses[i] ?? value.bosses?.[i])),
      byDifficulty: Object.fromEntries(recordDifficulties.map(id => [id, sanitizeRecord(object(value.byDifficulty)[id])]))
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
    function datedRecords(raw, limit) {
      return Object.fromEntries(Object.entries(object(raw)).filter(([day]) => /^\d{4}-\d{2}-\d{2}$/.test(day))
        .sort(([a], [b]) => b.localeCompare(a)).slice(0, limit).map(([day, record]) => [day, sanitizeRecord(record)]));
    }
    const resume = object(value.rushResume);
    const rushResume = Number.isInteger(resume.boss) && resume.boss >= 0 && resume.boss < bossCount
      && Number.isInteger(resume.seed) && recordDifficulties.includes(resume.difficulty)
      && ["red", "blue", "yellow"].includes(resume.fighter)
      ? { boss: resume.boss, seed: resume.seed >>> 0, difficulty: resume.difficulty, fighter: resume.fighter } : null;
    const unlocked = [...new Set((Array.isArray(value.unlocked) ? value.unlocked
      : Array.from({ length: count(object(value.campaign).furthest, bossCount) }, (_, id) => id))
      .filter(id => Number.isInteger(id) && id >= 0 && id < bossCount))].sort((a, b) => a - b);
    const campaign = sanitizeCampaign(value.campaign);
    const rush = sanitizeRecord(value.rush);
    return {
      version,
      points: count(value.points),
      upgrades: Object.fromEntries(upgradeKeys.map(id => [id, count(object(value.upgrades)[id], upgradeCosts.length)])),
      unlocked, campaign,
      awards: awards?.normalize(value.awards, unlocked, campaign, rush) ?? { badges: [], active: {} },
      assisted: sanitizeCampaign(value.assisted),
      rush,
      rushByDifficulty: Object.fromEntries(recordDifficulties.map(id => [id, sanitizeRecord(object(value.rushByDifficulty)[id])])),
      rushAssisted: sanitizeRecord(value.rushAssisted),
      weekly: datedRecords(value.weekly, 52),
      weeklyAssisted: datedRecords(value.weeklyAssisted, 52),
      rushResume,
      practice: Array.from({ length: bossCount }, (_, i) => sanitizeBoss(practice[i])),
      practiceAssisted: Array.from({ length: bossCount }, (_, i) => sanitizeBoss(value.practiceAssisted?.[i])),
      daily: datedRecords(value.daily, 366),
      dailyAssisted: datedRecords(value.dailyAssisted, 366)
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
        let saved = decode(storage.getItem(key));
        if (saved.status === "recovered" || saved.status === "empty") {
          try {
            const backup = decode(storage.getItem(backupKey));
            if (backup.status === "ok" || backup.status === "migrated") saved = { ...backup, status: "backup" };
          } catch { /* A readable primary save remains sufficient. */ }
        }
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
        const serialized = JSON.stringify(profile);
        try {
          storage.setItem(key, serialized);
          status = "ok";
          try { storage.setItem(backupKey, serialized); } catch { /* The primary write still succeeded. */ }
        } catch { status = "session"; writable = false; }
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
      if (run.assisted && run.assists) record.lastAssists = recordedAssists(run.assists);
      record.furthest = Math.max(record.furthest, run.bossRecords.reduce((max, item) => Math.max(max, item.type + 1), 0));
      return { newScore, newTime, bestScore: record.bestScore };
    }

    function addRush(record, run, formal) {
      const result = addRun(record, run, formal);
      if (!formal || !run.won || run.bossRecords.length !== bossCount) return result;
      if (run.hits === 0) { record.clean++; result.cleanBadge = true; }
      if (run.seconds <= 620) { record.fast++; result.fastBadge = true; }
      return result;
    }

    function recordRun(current, run) {
      const formal = !run.assisted && !run.abandoned;
      if (run.mode === "practice") {
        const records = run.assisted ? current.practiceAssisted : current.practice;
        for (const item of run.bossRecords) {
          const record = records[item.type];
          addBoss(record, item);
          if (record && run.assisted && run.assists) record.lastAssists = recordedAssists(run.assists);
        }
        return {};
      }
      if (run.mode === "daily") {
        if (run.abandoned || !run.day) return {};
        const records = run.assisted ? current.dailyAssisted : current.daily;
        return addRun(records[run.day] ??= sanitizeRecord(), run, true);
      }
      const difficulty = recordDifficulties.includes(run.difficulty) ? run.difficulty : "hard";
      if (run.mode === "rush") {
        if (run.resumed) return {};
        if (run.won) current.rushResume = null;
        else if (Number.isInteger(run.currentBoss)) {
          current.rushResume = { boss: run.currentBoss, seed: run.seed, difficulty, fighter: run.fighter };
        }
        if (run.week) {
          if (run.abandoned) return {};
          if (run.assisted) return addRun(current.weeklyAssisted[run.week] ??= sanitizeRecord(), run, true);
          return addRush(current.weekly[run.week] ??= sanitizeRecord(), run, true);
        }
        if (run.assisted) return addRun(current.rushAssisted, run, !run.abandoned);
        addRush(current.rush, run, formal);
        return addRush(current.rushByDifficulty[difficulty], run, formal);
      }
      const campaign = run.assisted ? current.assisted : current.campaign;
      campaign.totalKills += count(run.kills);
      for (const item of run.bossRecords) addBoss(campaign.bosses[item.type], item);
      addRun(campaign, run, !run.abandoned);
      return addRun(campaign.byDifficulty[difficulty], run, !run.abandoned);
    }

    function finish(run) {
      // The failed attempt was already recorded. Replaying a checkpoint must
      // not count earlier kills/Bosses again or grant a false flawless record.
      if (run.resumed || run.retried) return {};
      return transaction(current => {
        const result = recordRun(current, run);
        const newAwards = awards?.award(current, run, result) ?? [];
        return newAwards.length ? { ...result, newAwards } : result;
      });
    }

    function equipAward(slot, cosmetic) {
      return transaction(current => {
        if (!["skin", "theme", "effect"].includes(slot)) return false;
        if (!cosmetic) { delete current.awards.active[slot]; return true; }
        const item = awards?.cosmetics[cosmetic];
        if (!item || item.slot !== slot || !(current.awards.badges.includes(item.badge)
          || item.alternateBadge && current.awards.badges.includes(item.alternateBadge))) return false;
        current.awards.active[slot] = cosmetic;
        return true;
      });
    }

    function rememberRush(resume) {
      return transaction(current => {
        current.rushResume = resume;
        return true;
      });
    }

    return {
      get data() { return normalize(profile); },
      get status() { return status; },
      spendUpgrade, awardBoss, finish, equipAward, rememberRush,
      refresh() { if (writable) read(); }
    };
  }

  return { key, backupKey, version, bossCount, difficulties, legacyDifficulties, recordDifficulties,
    upgradeCosts, upgradeKeys, decode, createStore };
})();

if (typeof module !== "undefined") module.exports = StarBreakerProfile;
