"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

const seed = 4225;

// Aiming, hitboxes, damage and phase transitions use the production clock.
// Capture event timestamps at the actual scheduler, including failed fights.
function runEncounter({ seed, fighter, type, difficulty, build, gear, reserve }) {
  const realStart = spawnBoss, realPrepare = prepareAlienAttack;
  const realFinale = updateBossFinale, realSkill = requestEvolutionSkill;
  const bodyCues = [], finaleCues = [];
  let target;
  const floor = progressionPresetForBoss(type);
  const full = { damageLevel:24, rateLevel:11, laneLevel:5 };
  const weaponPreset = gear === "full" ? full : gear === "medium" ? {
    damageLevel:Math.round((floor.damageLevel+full.damageLevel)/2),
    rateLevel:Math.round((floor.rateLevel+full.rateLevel)/2),
    laneLevel:Math.round((floor.laneLevel+full.laneLevel)/2)
  } : floor;
  spawnBoss = function (index, ...args) {
    if (index === type) {
      ultimate.charges = 0;
      ultimate.energy = 0;
      if (build === "mimic" && type > 0) rememberDefeatedBoss(type - 1);
      while (player.maxLives < reserve) grantPlayerLife(true);
    }
    const result = realStart(index, ...args);
    if (boss?.type === type) target = boss;
    return result;
  };
  requestEvolutionSkill = function (...args) {
    if (evolution.route === "ember" && boss
        && (boss.emberStacks ?? 0) < Math.ceil(evolutionSkillSpec().stacks * .65)) return false;
    return realSkill(...args);
  };
  prepareAlienAttack = function (b, ...args) {
    const result = realPrepare(b, ...args);
    if (b === target && b.alienAttack) {
      bodyCues.push({ at:balanceRound(battleTime), attack:b.alienAttack,
        telegraph:balanceRound(b.telegraphDuration), active:balanceRound(b.attackDuration),
        scheduled:balanceRound(b.attackInterval), enraged:b.enraged });
    }
    return result;
  };
  updateBossFinale = function (b, dt) {
    const beats = b.finale.beat;
    const result = realFinale(b, dt);
    if (b === target && b.finale.beat > beats) finaleCues.push({
      at:balanceRound(battleTime), beat:b.finale.beat, concurrent:b.finale.hazards.length,
    });
    return result;
  };
  try {
    const sample = runBalanceFixture({
      label:[difficulty,fighter,type+1,gear,build].join("-"), seed, fighter, difficulty,
      bossType:type, mode:"campaign", build, policy:"pilot", fixture:"preset",
      evolutionLevel:build === "stock" ? 0 : Math.max(1,type),
      weaponPreset, seconds:Math.max(205, (nightmareBossHealthProfiles[type]?.[0] ?? 120)*1.8),
    });
    if (!target) throw new Error("No tracked boss");
    const intervals = events => events.slice(1).map((event,index) => balanceRound(event.at - events[index].at));
    const { health, times, ...observed } = sample;
    return { boss:type+1, label:bossTypeName(type), gear, targetSeconds:target.scaling.nightmare?.targetSeconds ?? null,
      scale:target.scaling, k:target.scaling.k, bodyHp:target.baseHealth, finaleHp:health[0]?.finale ?? null,
      actualTimes:times, bodyCues, finaleCues, bodyIntervals:intervals(bodyCues), finaleIntervals:intervals(finaleCues),
      signatureImpacts:(target.pressureLog ?? []).filter(event=>event.event==="impact").map(event=>balanceRound(event.at)),
      ...observed };
  } finally {
    spawnBoss = realStart;
    requestEvolutionSkill = realSkill;
    prepareAlienAttack = realPrepare;
    updateBossFinale = realFinale;
  }
}

function healthContracts(seed) {
  const type = 7;
  const start = (difficulty, fighter, build, preset) => balanceStart({
    seed, bossType:type, mode:"campaign", fixture:"preset", policy:"pilot",
    fighter, difficulty, build, evolutionLevel:6, weaponPreset:preset,
  });
  const floor = progressionPresetForBoss(type);
  const full = { damageLevel:24, rateLevel:11, laneLevel:5 };
  const initial = ["red","blue","yellow"].map(fighter =>
    ["stock","ember","frost","mimic"].map(build => {
      const rows = [floor,full].map(preset => {
        start("nightmare",fighter,build,preset);
        if (build === "mimic") {
          rememberDefeatedBoss(type - 1);
          spawnBoss(type);
        }
        return { stance:firingStyle.mode, damage:weapon.damage, scaling:boss.scaling.nightmare };
      });
      return { fighter, build, rows, monotonic:rows[1].scaling.encounterHealth > rows[0].scaling.encounterHealth };
    }));
  start("nightmare","red","ember",floor);
  const entry = boss;
  const lock = entry.scaling.nightmare;
  const purityState = () => JSON.stringify({ battleTime, weapon, evolution:balanceEvolutionState(),
    stock:ultimate.charges, fire:firingStyle.mode, rng:sortieStats.random.getState() });
  const pureBefore = purityState();
  bossScaling(type);
  const pureAfter = purityState();
  const fire = firingStyle.mode;
  firingStyle.mode = fire === "focus" ? "spread" : "focus";
  const standalone = bossScaling(type);
  firingStyle.mode=fire;
  // Upgrades during an existing fight affect future entries only.
  applyPowerup("red");
  applyPowerup("blue");
  applyPowerup("yellow");
  if (openEvolutionChoice()) chooseEvolution("ember");
  const nextEntry = bossScaling(type).nightmare;
  const bodyLocked = entry.scaling.nightmare === lock && entry.baseHealth === lock.bodyHealth
    && Math.abs(Math.exp(entry.healthLog) - lock.bodyHealth) < 1e-6;
  beginBossFinale(entry);
  const finaleLocked = Math.abs(Math.exp(entry.healthLog) - lock.finaleHealth) < 1e-6;
  clearPause(); resetBossPresentation(); canvas.focus(); bossHitGrace=0; shield.remaining=0;
  player.lives=1; sortieStats.guardReady=false; sortieStats.hitDebt=2;
  const died = damagePlayer("Nightmare snapshot regression") && state === "over";
  const retried = died && retryBossFromCheckpoint();
  const retryLocked = retried && JSON.stringify(boss?.scaling.nightmare) === JSON.stringify(lock);
  const legacy = ["easy","normal","hard"].map(difficulty => {
    start(difficulty,"blue","stock",floor);
    return { difficulty, body:boss.baseHealth, mode:sortieStats.difficulty, consumedNightmare:!!boss.scaling.nightmare };
  });
  return { buildChecks:initial.flat(), testedType:type+1, entry:lock, nextEntry, bodyLocked, finaleLocked, died, retryLocked,
    stanceInvariant:standalone.nightmare.bodyHealth === lock.bodyHealth,
    immutable:Object.isFrozen(entry.scaling) && Object.isFrozen(lock), pure:pureBefore === pureAfter, legacy };
}

async function main() {
  const [gameRoot, reportPath, ...options] = process.argv.slice(2);
  assert.ok(gameRoot && reportPath, "Usage: node tools/testkit/nightmare-scaling.cjs <Game> <report.json> [--hard] [--quick] [--extended]");
  const output = path.resolve(reportPath);
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const difficulty = options.includes("--hard") ? "hard" : "nightmare";
  const types = options.includes("--quick") ? [0, 4, 10] : Array.from({length:11}, (_,i) => i);
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,
    args:["--disable-gpu","--disable-renderer-backgrounding","--disable-background-timer-throttling"]});
  const { page, errors } = await createPage(browser,path.resolve(gameRoot),true);
  const report = { seed, difficulty, errors, browser:browser.version(),
    methodology:"Production boss spawn, hitboxes, skills, damage, phase and defeat rules. Fixed 60 Hz simulation driven by existing telegraph pilot, no rendering. Stages campaign floor equipment and 14 reserve hull points to measure TTK. The reserve is a QA fixture, not a claim of stock-hull or human clears. Clock and weapon builds repeat across fighters. Sample times are simulated seconds."
  };
  report.sourceSha256 = Object.fromEntries(["game.js","sortie-modes.js","progression.js",
    "bosses.js","boss-pressure.js","boss-finales.js","alien-attacks.js"].map(file => [file,
    createHash("sha256").update(fs.readFileSync(path.join(gameRoot,file))).digest("hex")]));
  const samples = report.samples = [];
  const fighters = [["red","ember"],["blue","frost"],["yellow","mimic"]];
  const save = () => fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n","utf8");
  try {
    for (const type of types) {
      for (const [fighter,route] of fighters) {
        const frame={seed,fighter,type,difficulty,build:type ? route : "stock",gear:"floor",reserve:14};
        const sample = await page.evaluate(runEncounter,frame);
        samples.push(sample);
        const result=sample.won ? sample.ttk_seconds+"s" : sample.failure_reason;
        console.log(difficulty,fighter.padEnd(6),type+1,result,"HP",sample.bodyHp+"/"+sample.finaleHp);
      }
      save();
    }
    if (difficulty === "nightmare") {
      if (options.includes("--extended")) {
        report.alternateBuilds = [];
        for (const [type,fighter,build,gear] of [
          [4,"red","frost","medium"], [4,"blue","mimic","medium"], [4,"yellow","ember","full"],
          [9,"blue","ember","floor"], [9,"blue","mimic","floor"],
          [10,"blue","ember","floor"], [10,"blue","mimic","floor"],
          [10,"red","frost","floor"], [10,"red","mimic","floor"],
        ]) {
          const sample=await page.evaluate(runEncounter,{seed, fighter, type, difficulty, build, gear, reserve:14});
          report.alternateBuilds.push(sample);
          console.log("alternate",fighter,type+1,build,gear,sample.won ? sample.ttk_seconds+"s" : sample.failure_reason);
          save();
        }
      }
      report.contracts = await page.evaluate(healthContracts,seed);
      const frame={ seed, fighter:"red", type:0, difficulty, build:"stock", gear:"floor", reserve:14 };
      report.deterministicRepeat = JSON.stringify(await page.evaluate(runEncounter,frame)) === JSON.stringify(samples[0]);
      save();
      const c = report.contracts;
      assert.ok(c.immutable && c.pure && c.bodyLocked && c.finaleLocked && c.died && c.retryLocked && c.stanceInvariant);
      assert.ok(c.buildChecks.every(test => test.monotonic));
      assert.ok(c.nextEntry.encounterHealth > c.entry.encounterHealth);
      assert.ok(c.legacy.every(row => row.body === c.legacy[0].body && !row.consumedNightmare));
      assert.ok(report.deterministicRepeat);
    }
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
}

main().catch(error=>{ console.error(error); process.exitCode=1; });
