"use strict";

// Focused production-logic experiments. Synthetic time only; no human feel claim.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

async function main() {
  const root = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
  const baseline = process.argv.includes("--baseline");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const { page, errors } = await createPage(browser, root, true);
    const result = await page.evaluate(() => {
      function setup(fighter = "red") {
        selectedFighter = fighter;
        showScreen("battle", { seed: 4225, difficulty: "veteran" });
        canvas.focus({ preventScroll: true });
        if (typeof skipFlightTutorial === "function") skipFlightTutorial();
        nextBossTime = enemyCooldown = powerupCooldown = Infinity;
        formationState.nextTime = battlefieldEvents.nextObject = battlefieldEvents.nextTransport = aceEncounter.nextTime = Infinity;
        battleTime = 120; resetEnemyCombat();
        raiseWeaponFloor(progressionPresetForBoss(3));
        firingStyle.mode = "focus";
      }
      function heavyDps(style, protectedLate = false) {
        setup();
        if(protectedLate) raiseWeaponFloor(progressionPresetForBoss(10));
        const target = { kind: "armored", x: 660, y: player.y, previousX: 660, previousY: player.y,
          width: 95, height: 65, hp: 10000, maxHp: 10000, displayHp: 10000, speed: 0, age: 0 };
        if(protectedLate) Object.assign(target,{hp:1,maxHp:1,displayHp:1,healthLog:Math.log(6450),fireProtection:bossFireProtectionFor(10)});
        enemies.push(target);
        let emitted = 0, heavy = 0, elapsed = 0;
        const push = bullets.push;
        bullets.push = function(...rounds) { emitted += rounds.length; heavy += rounds.filter(s => s.source === "crimson-heavy").length; return push.apply(this, rounds); };
        for (let i = 0; i < 720; i++) {
          const dt = 1 / 120;
          if (style !== "auto") {
            if (!fighterCombat.redHeld && fighterCombat.redCooldown <= 0) beginFighterCharge();
            if (fighterCombat.redHeld && fighterCombat.stability >= (style === "full" ? 1 - 1e-7 : fighterCombatRules.redMinCharge / fighterCombatRules.redCharge)) releaseFighterCharge();
          }
          updateFighterCombat(dt); updateShooting(dt); resolveProjectileHits();
          elapsed += dt; battleTime += dt;
        }
        // Let the final rounds reach the stationary target without firing more.
        flightControls.autofire = false;
        for (let i = 0; i < 75; i++) { updateShooting(1/120); resolveProjectileHits(); }
        flightControls.autofire = true;
        bullets.push = push;
        return { damage: protectedLate ? (1-target.hp)*6450 : 10000 - target.hp, emitted, heavy, elapsed };
      }
      const red = Object.fromEntries(["auto", "tap", "full"].map(style => [style, heavyDps(style)]));
      const redLateArmored = Object.fromEntries(["auto", "tap", "full"].map(style => [style, heavyDps(style,true)]));
      setup("yellow");
      bossDefeated = 7; spawnBoss(7); boss.phase = "recover"; boss.age = 100;
      boss.x = boss.previousX = bossArena(7).x;
      beginBossFinale(boss); boss.finale.age = boss.finale.transform + 10;
      const node = boss.finale.nodes[0], geometry = finaleNodeGeometry(boss, node);
      const fieldTarget = { ...geometry };
      onFighterProjectileImpact({x:geometry.x, y:geometry.y, damage:10, damageLog:Math.log(10),
        auric:"auric-spread", launchX:geometry.x-150, finaleNode:node.index},boss);
      const generatedField = { x: fighterCombat.field.x, y: fighterCombat.field.y };
      const pulseDamage = fighterCombat.field.damage;
      const beforeNode = node.hp, beforeCore = boss.hp, beforeNodes=boss.finale.nodes.map(n=>n.hp);
      for (let i = 0; i < 144; i++) { battleTime += 1/120; updateFighterCombat(1/120); }
      const yellow = { nodeDamage: beforeNode - node.hp, coreDamage: beforeCore - boss.hp,
        nodeDeltas:boss.finale.nodes.map((n,i)=>beforeNodes[i]-n.hp),
        nodeLocation: fieldTarget, bossLocation: {x:boss.x,y:boss.y}, generatedField, pulseDamage, fieldExpired: !fighterCombat.field };
      setup("blue");
      const aim = { x: 600, y: player.y, width: 65, height: 65, hp: 100, maxHp: 100 };
      const neighbors = [{ ...aim, x: 710 }, { ...aim, y: player.y + 50 }];
      enemies.push(aim, ...neighbors);
      const round = { x: aim.x, y: aim.y, damage: 10, damageLog: Math.log(10), seeker: {}, hitTargets: new Set([aim]) };
      for (let i = 0; i < 3; i++) onFighterProjectileImpact(round, aim);
      const azure = { primary:100-aim.hp, neighbors:neighbors.map(t => 100-t.hp), arcs: fighterCombat.arcs.length, marks: fighterCombat.stacks };
      setup("red");
      evolution.pierce = 2; evolution.aegis = 2; refreshEvolutionLinks(); armEvolutionGuardPierce();
      const shot = {damage:5,damageLog:Math.log(5),halfHeight:2.5,piercesLeft:0};
      applyGuardPiercingRound(shot);
      const guardbreaker = { armed: shot.piercesShield && shot.armorPiercing, stored: evolutionWeapons.armorRoundRemaining, pierces:shot.piercesLeft };
      setup("blue"); evolution.pierce = 2; evolution.blast = 2; refreshEvolutionLinks();
      const foe = { x: 600, y: player.y, width: 65, height: 65, hp: 100, maxHp: 100 }; enemies.push(foe);
      evolutionWeapons.focus = foe;
      const drone = { source:"evolution-drone", damage:10, damageLog:Math.log(10) };
      const focused = fighterProjectileDamage(drone,foe), other = fighterProjectileDamage(drone,{ ...foe });
      const hunter = { focused: focused.damage, other:other.damage, armor:focused.armorPiercing };
      setup("yellow"); evolution.blast = 3; evolution.aegis = 2; refreshEvolutionLinks();
      const commander = {x:650,y:player.y,width:65,height:65,hp:100,maxHp:100}; enemies.push(commander);
      evolutionWeapons.focus=commander; shield.charges=0; shield.energy=0;
      enemyProjectiles.push({x:player.x+100,y:player.y,vx:-200,vy:0,radius:5,age:.1},
        {x:player.x+160,y:player.y+10,vx:-200,vy:0,radius:5,age:.12});
      const intercepted=evolutionTryIntercept();
      const phalanx={intercepted, remaining:enemyProjectiles.length, shield:shield.energy/evolutionShieldChargeTime(),
        grounded:evolutionWeapons.grounded};
      return { red, redLateArmored, yellow, azure, guardbreaker, hunter, phalanx };
    });
    assert.deepEqual(errors, []);
    if (!baseline) {
      assert.ok(result.red.full.damage > result.red.tap.damage * 1.1, "Full charge must repay its longer commitment better than minimum-charge tapping");
      assert.ok(result.red.full.damage > result.red.auto.damage, "Controlled charge improves on uninterrupted fire");
      assert.ok(result.redLateArmored.full.damage > result.redLateArmored.tap.damage,"Full charge retains its benefit against endgame burst armor");
      assert.ok(result.yellow.nodeDamage > 0, "A visible Auric field overlapping a living finale node must damage that node");
      assert.ok(result.yellow.nodeDeltas.slice(1).every(value=>value===0),"One field pulse must not damage every overlapping boss part");
      assert.equal(result.yellow.generatedField.x,result.yellow.nodeLocation.x,"Field must originate at the impacted finale node");
      assert.equal(result.yellow.generatedField.y,result.yellow.nodeLocation.y,"Field must retain actual impact altitude");
      assert.ok(result.yellow.fieldExpired, "Field expires rather than growing without bounds");
      assert.equal(result.azure.arcs,3); assert.equal(result.azure.marks,0);
      assert.ok(result.azure.neighbors.every(value => value > 0));
      assert.ok(result.guardbreaker.armed); assert.equal(result.guardbreaker.stored,0);
      assert.equal(result.hunter.focused,14.6); assert.equal(result.hunter.other,10);
      assert.ok(result.phalanx.intercepted); assert.equal(result.phalanx.remaining,0);
      assert.ok(Math.abs(result.phalanx.shield-.32)<1e-9); assert.equal(result.phalanx.grounded,4);
    }
    fs.writeFileSync(path.join(out,"gameplay.json"),JSON.stringify({ policy:"isolated-verb-probe/1", baseline, ...result, runtimeErrors: errors },null,2));
    console.log(JSON.stringify(result,null,2));
  } finally { await browser.close(); }
}
main().catch(error => {console.error(error);process.exitCode=1;});
