#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

function measureBoss({ type, difficulty }) {
  const fixture = { seed: 4225, bossType: type, difficulty, fighter: "blue", mode: "campaign",
    build: "stock", policy: "pilot", fixture: "preset" };
  balanceStart(fixture);
  const target = boss;
  const soon = 1 / 60;
  bossPresentation = null;
  Object.assign(target, bossArena(type), { phase: "recover", phaseTime: 0 });
  for (let frame = 0; frame < 245 * 60; frame++) {
    battleTime += soon;
    updateBossEncounter(soon);
  }
  const body = target.comboLog.flatMap(combo => combo.stageStarts.map(start => combo.at + start));
  const signature = target.pressureLog.filter(event => event.event === "impact").map(event => event.at);
  const bodyRate = (times, begin = 18, end = 238) => times.filter(at => at >= begin && at < end).length * 60 / (end - begin);
  const timings = { body: bodyRate(body), seal: bodyRate(signature), stageCounts: [...new Set(target.comboLog.map(combo => combo.stages))] };
  const tellProfile = target.comboLog[0];
  if (isAbyssalNightmare()) {
    target.signaturePending = true;
    shield.charges = 0;
    prepareBossPressureSeal(target);
    const seal = bossHazards.find(hazard => hazard.kind === "pressureSeal");
    const ultimate = bossHazards.find(hazard => hazard.kind === "ultimate");
    const originalY = player.y;
    player.y = seal.gapY;
    for (let current = ultimate.warning; current < ultimate.warning + ultimate.duration; current += soon) {
      ultimate.age = current;
      if (alienHazardHitsPlayer(ultimate)) throw new Error("The seal gap hits an unshielded pilot");
    }
    seal.age = seal.warning;
    if (alienHazardHitsPlayer(seal)) throw new Error("The marked seal gap does not survive impact");
    if (Math.abs(originalY - seal.gapY) > player.speed * (ultimate.warning - .20) * .65) {
      throw new Error("An unshielded charge cannot reach the marked gap");
    }
    player.y = originalY;
  }
  function finaleMeasure(hp) {
    beginBossFinale(target);
    bossPresentation = null;
    target.hp = hp;
    const f = target.finale;
    for (let frame = 0; frame < 120 * 60; frame++) updateBossFinale(target, soon);
    const complete = f.comboLog.slice(2,-1);
    const elapsed = f.comboLog.at(-1).startedAt - complete[0].startedAt;
    let contacts = 0;
    for (const chain of complete) {
      if (!chain.starts.every((at, index) => index === 0 || at > chain.starts[index - 1])) {
        throw new Error("Finale stage order collapsed for Boss " + (type + 1) + ", beat " + chain.beat);
      }
      contacts += chain.starts.length;
    }
    return { rate: contacts * 60 / elapsed,
      stageCounts: [...new Set(complete.map(chain => chain.stages))],
      frenzySince: f.frenzySince ?? null };
  }
  const finale = finaleMeasure(.80);
  const frenzy = isAbyssalNightmare() ? finaleMeasure(.29) : null;
  return { type, difficulty, body: timings.body, seal: timings.seal, bodyStages: timings.stageCounts,
    firstBodyKinds: [tellProfile.firstKind,tellProfile.secondKind,tellProfile.thirdKind], finale, frenzy };
}

// Find a no-shield route through the authored collision shapes at .1 second
// intervals. Use conservative travel speed and cover both opener variants,
// the first finale wave, and the six-beat frenzy on desktop and mobile.
function verifyFlights(type) {
  const cases = [];
  for (const [phase, variant, xRatio, yRatio] of [
    ["body", 0, .26, .48], ["body", 1, .68, .64],
    ["finale", 0, .48, .56], ["frenzy", 1, .26, .41],
  ]) {
    balanceStart({ seed: 4225, bossType: type, difficulty: "nightmare", fighter: "red",
      mode: "campaign", build: "stock", policy: "pilot", fixture: "preset" });
    const target = boss;
    bossPresentation = null;
    Object.assign(target, bossArena(type));
    const bounds = finaleBounds();
    const initialX = bounds.left + bounds.width * xRatio;
    const initialY = bounds.top + bounds.height * yRatio;
    player.x = player.previousX = initialX;
    player.y = player.previousY = initialY;
    let hazards, hits;
    if (phase === "body") {
      target.pressureComboIndex = variant - 1;
      target.enraged = variant === 1;
      prepareAlienAttack(target, false);
      hazards = bossHazards;
      hits = () => hazards.some(alienHazardHitsPlayer);
    } else {
      beginBossFinale(target);
      const finale = target.finale;
      finale.age = finale.transform;
      finale.beat = variant + 1;
      if (phase === "frenzy") {
        target.hp = .29;
        finale.frenzySince = finale.age;
      }
      buildBossFinaleCombo(target, bounds, yRatio < .5 ? 1 : -1);
      hazards = finale.hazards;
      hits = () => bossFinaleHitsPlayer(target);
    }
    for (const hazard of hazards) {
      if (hazard.warning - (hazard.tellAt ?? 0) < 1.15) {
        throw new Error("Short visual tell for " + (hazard.kind ?? hazard.type));
      }
      lockNightmarePursuit(hazard);
    }
    const dt = .1, reach = player.speed * .65 * dt, gap = reach * .62;
    const cols = Math.max(1, Math.ceil(bounds.width / gap));
    const rows = Math.max(1, Math.ceil(bounds.height / gap));
    const px = col => bounds.left + bounds.width * col / cols;
    const py = row => bounds.top + bounds.height * row / rows;
    const end = Math.max(...hazards.map(hazard => hazard.warning + hazard.duration));
    const n = cols + 1;
    let reachable = new Set([Math.round(cols * xRatio) + Math.round(rows * yRatio) * n]);
    let elapsed = dt;
    for (; elapsed <= end + dt && reachable.size; elapsed += dt) {
      for (const hazard of hazards) {
        hazard.age = elapsed;
        hazard.previousAge = elapsed - dt;
      }
      const next = new Set();
      for (const from of reachable) {
        const col = from % n, row = Math.floor(from / n);
        player.previousX = px(col);
        player.previousY = py(row);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (col + dx < 0 || col + dx > cols || row + dy < 0 || row + dy > rows) continue;
          const at = from + dx + dy * n;
          if (next.has(at)) continue;
          player.x = px(col + dx);
          player.y = py(row + dy);
          if (Math.hypot(player.x - player.previousX, player.y - player.previousY) <= reach && !hits()) next.add(at);
        }
      }
      reachable = next;
    }
    cases.push({ phase, variant, noShieldRoute: reachable.size > 0,
      exhaustedAt: reachable.size ? null : Math.round((elapsed - dt) * 100) / 100,
      ...(reachable.size ? {} : { bounds, playerWidth: player.width, playerHeight: player.height, speed: player.speed,
        blockers: hazards.filter(h => h.age >= h.warning && h.age < h.warning + h.duration)
          .map(h => [h.kind ?? h.type, h.comboStage, h.warning, h.x, h.y, h.gap ?? h.gapSize, h.width ?? h.thickness, h.radius]) }),
    });
  }
  return cases;
}

async function main() {
  const game = path.resolve(process.argv[2] ?? ".");
  const output = process.argv[3];
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const { page, errors } = await createPage(browser, game, true);
    const phone = await createPage(browser, game, true, { pageOptions: { viewport: { width: 412, height: 915 } } });
    const rows = [];
    for (let type = 0; type < 11; type++) {
      const baseline = await page.evaluate(measureBoss, { type, difficulty: "hard" });
      const nightmare = await page.evaluate(measureBoss, { type, difficulty: "nightmare" });
      assert.deepEqual(baseline.bodyStages, [3]);
      assert.deepEqual(nightmare.bodyStages, [4]);
      assert.deepEqual(nightmare.finale.stageCounts, [5]);
      assert.deepEqual(nightmare.frenzy.stageCounts, [6]);
      assert.ok(nightmare.frenzy.frenzySince !== null && nightmare.frenzy.rate > nightmare.finale.rate);
      const gain = {
        ordinary: Math.round((nightmare.body / baseline.body - 1) * 100),
        signature: Math.round((nightmare.seal / baseline.seal - 1) * 100),
        finale: Math.round((nightmare.finale.rate / baseline.finale.rate - 1) * 100),
      };
      for (const [name, min, max] of [["ordinary",40,60],["signature",30,50],["finale",60,80]]) {
        assert.ok(gain[name] >= min && gain[name] <= max, `Boss ${type + 1}: ${name} increased ${gain[name]}%`);
      }
      await page.bringToFront();
      const desktop = await page.evaluate(verifyFlights, type);
      await phone.page.bringToFront();
      const mobile = await phone.page.evaluate(verifyFlights, type);
      rows.push({ boss: type + 1, baseline, nightmare, gain, escapes: { desktop, mobile } });
      console.log(type + 1, gain, mobile.filter(escape => !escape.noShieldRoute));
    }
    if (output) fs.writeFileSync(output, JSON.stringify(rows, null, 2) + "\n");
    assert.deepEqual([...errors, ...phone.errors], [], "Browser errors");
    assert.ok(rows.every(row => [...row.escapes.desktop, ...row.escapes.mobile].every(escape => escape.noShieldRoute)),
      "A sampled sequence has no shield-free route");
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
