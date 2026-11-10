#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

async function main() {
  const [root, output] = process.argv.slice(2);
  if (!root || !output) throw new Error("Usage: node tactics-feedback.cjs <Game folder> <evidence folder>");
  const game = path.resolve(root), evidence = path.resolve(output);
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || chromium.executablePath(), headless: true });
  try {
    const { page, errors } = await createPage(browser, game, true);
    const proof = await page.evaluate(() => {
      const step = 1 / 60;
      function setup() {
        showScreen("battle", { seed: 8871 });
        battleTime = 80;
        nextBossTime = enemyCooldown = powerupCooldown = shotCooldown = Infinity;
        battlefieldEvents.nextObject = battlefieldEvents.nextTransport = Infinity;
        formationState.nextTime = aceEncounter.nextTime = Infinity;
        resetEnemyCombat();
      }
      function prepare(kind) {
        setup();
        if (!launchFormation(formationPlan(kind))) throw new Error(`Cannot start ${kind}`);
        const group = formationState.active;
        group.x = viewport.width * .66;
        for (const member of group.members) formationControlsEnemy(member, 0);
        updateFormationTactics(group, group.members, step);
        if (!group.coordination?.cue) throw new Error(`No cue for ${kind}`);
        return group;
      }
      const v = prepare("pincer");
      const leader = v.members.find(enemy => enemy.formationLeader);
      const vShape = v.members.filter(enemy => enemy !== leader).every(wing => wing.x > leader.x && wing.y !== leader.y);
      const first = v.coordination.cue;
      const gap = first.gap.bottom > player.y && first.gap.top < player.y;
      updateFormationTactics(v, v.members, first.remaining + .001);
      const openingCount = enemyProjectiles.length;
      const flanks = v.members.filter(enemy => enemy.formationRole === "flank");
      const yBefore = Math.abs(flanks[0].y - v.centerY);
      for (let i = 0; i < 40; i++) {
        updateFormationTactics(v, v.members, step);
        for (const member of v.members) formationControlsEnemy(member, step);
      }
      const contraction = yBefore - Math.abs(flanks[0].y - v.centerY);
      onFormationEnemyDefeated(leader);
      const interrupted = v.broken && !v.coordination.cue;

      const blockade = prepare("command");
      const screen = blockade.coordination.cue;
      const target = screen.shots[0].member;
      const independent = new Set(screen.shots.map(shot => shot.member)).size >= 3;
      const clearance = screen.shots.every(shot => shot.vy === 0 && (shot.y < screen.gap.top || shot.y > screen.gap.bottom));
      const cutoff = screen.shots.filter(shot => shot.member === target).map(shot => shot.y);
      defeatEnemy(enemies.indexOf(target));
      updateFormationTactics(blockade, enemies, screen.remaining + .001);
      const laneOpened = !blockade.broken && enemyProjectiles.length > 0 && enemyProjectiles.every(shot => !cutoff.includes(shot.y));
      const cap = enemyCombatRules.maxProjectiles;
      const capped = prepare("command");
      while (enemyProjectiles.length < cap - 1) enemyProjectiles.push({ age: 0, vx: -1 });
      updateFormationTactics(capped, enemies, capped.coordination.cue.remaining + .001);
      const underCap = enemyProjectiles.length === cap;

      setup();
      const place = (kind, x, y) => {
        spawnEnemy(kind);
        const enemy = enemies.at(-1);
        Object.assign(enemy, { x, y, baseY: y });
        return enemy;
      };
      const mine = place("minelayer", 935, player.y + 65);
      updateEnemyMovement(mine, step);
      const mineY = mine.mineRouteY;
      const safeWindup = eliteDirector.mines.length === 0 && Number.isFinite(mineY);
      player.y -= 55;
      for (let i = 0; i < 75; i++) updateEnemyMovement(mine, step);
      const lockedMinePath = mine.mineRouteY === mineY && eliteDirector.mines.length === 6;

      setup();
      const guard = place("shield-guard", 800, player.y + 35);
      const scout = place("scout", 755, player.y + 35);
      place("scout", 765, player.y + 10);
      place("scout", 780, player.y - 5);
      refreshEliteEscortShields(step);
      const full = enemies.filter(ally => ally.escortShield).length;
      const gunner = place("gunner", 700, player.y - 34);
      gunner.gunPhase = "warning";
      refreshEliteEscortShields(step);
      updateEnemyMovement(guard, step);
      const prioritizes = full === 3 && gunner.escortShield?.guard === guard && guard.escortAnchor === gunner
        && enemies.filter(ally => ally.escortShield).length === full;
      const through = { piercesShield: true, damage: 10 };
      const penetrating = absorbEliteEscortShield(gunner, through) === through && gunner.escortShield.hp > 0;
      const tracked = Number.isFinite(scout.x + guard.y);

      setup();
      const parent = place("splitter", player.x, player.y);
      defeatEnemy(enemies.indexOf(parent));
      const offspring = enemies.filter(enemy => enemy.kind === "splitling");
      const bornSafe = offspring.length === 2 && offspring.every(child => !enemyTouchesPlayer(child));
      const splitRoles = offspring.length === 2 && offspring[0].speed !== offspring[1].speed;

      const hull = { x: 615, y: player.y, width: 120, height: 80 };
      recordCombatImpact(hull, { source: "normal", y: hull.y });
      recordCombatImpact(hull, { source: "normal", y: hull.y, critical: true });
      recordCombatImpact({ ...hull, fxNextSpecialImpact: -1 }, { source: "normal", y: hull.y + 15 }, true, "weak");
      for (const kind of ["shell", "guard", "finale"]) recordCombatFeedback(kind, hull);
      const impactKinds = combatEffects.impacts.map(impact => impact.kind);
      const criticalHold = combatEffects.impacts.find(impact => impact.kind === "critical").hold;
      pressedKeys.add("ArrowDown");
      const y = player.y;
      updateCombatEffects(step);
      updatePlayer(step);
      pressedKeys.clear();
      const movingDuringHold = player.y > y && combatEffects.impacts.find(impact => impact.kind === "critical").age < criticalHold;
      return { vShape, gap, openingCount, contraction, interrupted, independent, clearance, laneOpened, underCap,
        safeWindup, lockedMinePath, prioritizes, penetrating, tracked, bornSafe, splitRoles,
        impactKinds, criticalHold, movingDuringHold };
    });
    for (const key of ["vShape", "gap", "interrupted", "independent", "clearance", "laneOpened", "underCap", "safeWindup",
      "lockedMinePath", "prioritizes", "penetrating", "tracked", "bornSafe", "splitRoles", "movingDuringHold"]) {
      assert.equal(proof[key], true, key);
    }
    assert.equal(proof.openingCount, 4);
    assert.ok(proof.contraction >= 7, "V pincer contracts physically");
    assert.deepEqual(proof.impactKinds, ["hit", "critical", "weak", "shell", "guard", "finale"]);
    assert.ok(proof.criticalHold >= 2 / 60 && proof.criticalHold <= 3 / 60);
    assert.deepEqual(errors, []);

    const live = await createPage(browser, game, false);
    for (const kind of ["pincer", "command"]) {
      await live.page.evaluate(kind => {
        showScreen("battle", { seed: 8871 });
        battleTime = 80;
        nextBossTime = enemyCooldown = powerupCooldown = shotCooldown = Infinity;
        battlefieldEvents.nextObject = battlefieldEvents.nextTransport = Infinity;
        formationState.nextTime = aceEncounter.nextTime = Infinity;
        launchFormation(formationPlan(kind));
        const group = formationState.active;
        group.x = viewport.width * .76;
        for (const member of group.members) formationControlsEnemy(member, 0);
        updateFormationTactics(group, group.members, 0);
        for (const cue of ["critical", "weak", "shell", "guard", "finale"]) {
          const target = cue === "guard" ? player : group.members.pop();
          if (target !== player) group.members.unshift(target);
          recordCombatFeedback(cue, target);
        }
      }, kind);
      await live.page.screenshot({ path: path.join(evidence, `tactics-${kind}.png`) });
    }
    assert.deepEqual(live.errors, []);
    fs.writeFileSync(path.join(evidence, "tactics-feedback.json"), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
