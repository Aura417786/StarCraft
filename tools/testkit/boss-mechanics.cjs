#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

const patterns = ["broodArc", "boneRibs", "cinderLava", "weaverWeb", "binderClaw", "mirrorPrism",
  "wyrmPulse", "sporeField", "mawEclipse", "neuralSynapse", "fusionBind"];
const kinds = ["tide", "ribCage", "magmaCover", "loom", "pincerLock", "mirrorShield", "tailConduit",
  "sporeNests", "riftFold", "neuralRelay", "fusionLimbs"];

async function main() {
  const root = path.resolve(process.argv[2]);
  const output = path.resolve(process.argv[3]);
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  const results = [];
  try {
    const { page, errors } = await createPage(browser, root, false);
    await page.locator("#start-button").click();
    await page.evaluate(() => { if (typeof skipFlightTutorial === "function") skipFlightTutorial(); });
    await page.waitForFunction(() => isBattleActive());
    for (const [type, key] of patterns.entries()) {
      await page.evaluate(({ type, key }) => {
        resetBossPresentation();
        nextBossTime = shotCooldown = enemyCooldown = powerupCooldown = Infinity;
        player.lives = 14;
        player.x = viewport.width * .22;
        player.y = (flightBounds.top + flightBounds.bottom) / 2;
        spawnBoss(type);
        resetBossPresentation();
        Object.assign(boss, bossArena(type));
        boss.attackIndex = bossTypes[type].patterns.indexOf(key) - 1;
        prepareAlienAttack(boss);
      }, { type, key });
      await page.waitForFunction(type => starBreakerModelCache.get(type)?.model, type);
      const pose = await page.evaluate(type => {
        const surface = document.createElement("canvas");
        surface.width = 480; surface.height = 360;
        const ctx = surface.getContext("2d", { willReadFrequently: true });
        const fixed = { ...boss, x: 240, y: 180, phase: "telegraph", age: 1.3, phaseTime: 0 };
        const capture = frame => {
          ctx.clearRect(0, 0, 480, 360);
          drawBossShip(ctx, frame, false);
          return { pixels: ctx.getImageData(0, 0, 480, 360).data, image: surface.toDataURL() };
        };
        const calm = capture(fixed);
        fixed.phaseTime = fixed.telegraphDuration - .06;
        const windup = capture(fixed);
        let changed = 0;
        for (let pixel = 0; pixel < calm.pixels.length; pixel += 4) {
          if (Math.abs(calm.pixels[pixel] - windup.pixels[pixel])
            + Math.abs(calm.pixels[pixel + 1] - windup.pixels[pixel + 1])
            + Math.abs(calm.pixels[pixel + 2] - windup.pixels[pixel + 2]) > 35) changed++;
        }
        const action = bossActionPose(fixed, false);
        const quiet = bossActionPose(fixed, true);
        return { changed, lead: bossActionProfiles[type][0], motion: action.x, reducedMotion: quiet.x,
          calm: calm.image, windup: windup.image };
      }, type);
      assert.ok(pose.changed > 300, `${key} windup should visibly alter its rendered model`);
      assert.ok(Math.abs(pose.reducedMotion) < Math.abs(pose.motion), `${key} reduces pose travel when requested`);
      for (const frame of ["calm", "windup"]) {
        fs.writeFileSync(path.join(output, `${type + 1}-${frame}.png`), Buffer.from(pose[frame].split(",")[1], "base64"));
        delete pose[frame];
      }
      await page.waitForFunction(kind => bossHazards.some(hazard => hazard.kind === kind && mechanicActive(hazard)), kinds[type]);
      await page.screenshot({ path: path.join(output, `${type + 1}-${key}-live.png`) });
      const result = await page.evaluate(kind => {
        const h = bossHazards.find(hazard => hazard.kind === kind);
        const r = player.height * .16;
        const pilot = { x: player.x, y: player.y, height: player.height, speed: player.speed };
        const place = (x, y) => ({ ...pilot, x, y });
        const shotAt = (x, y, piercesShield = false) => ({ previousX: x - 20, previousY: y, x: x + 20, y, vx: 400, vy: 0, piercesShield });
        const phase = fraction => { h.age = h.warning + h.duration * fraction; };
        phase(.5);
        switch (kind) {
          case "tide": {
            const x = alienTideX(h, h.gapY, .5) - h.direction * h.thickness;
            return alienMechanicVector(h, place(x, h.gapY))?.x * h.direction > 0;
          }
          case "ribCage": {
            const bar = cageBars(h)[0], original = bar - h.thickness - r;
            const ship = place(h.x, bar + 4);
            constrainAlienPlayer(ship, ship.x, original);
            return ship.y < bar && !alienMechanicHits(h, place(h.x, h.y));
          }
          case "magmaCover":
            return !alienMechanicHits(h, place(h.x - h.width - 12, h.y)) && alienMechanicHits(h, place(h.x + h.width + 12, h.y))
              && interceptAlienRound(shotAt(h.x, h.y)) && !interceptAlienRound(shotAt(h.x, h.y, true));
          case "loom": {
            const [knot, second] = h.nodes;
            const ship = place((knot.x + second.x) / 2, (knot.y + second.y) / 2);
            const slow = alienMechanicSlow(h, ship);
            interceptAlienRound(shotAt(knot.x, knot.y)); interceptAlienRound(shotAt(knot.x, knot.y));
            return slow < 1 && alienMechanicSlow(h, ship) === 1 && knot.health === 0;
          }
          case "pincerLock": {
            const y = h.y - pincerGap(h) - r * 1.1;
            const ship = place(h.x + h.width, y);
            constrainAlienPlayer(ship, h.x - h.width * 2, y);
            return ship.x < h.x && !alienMechanicHits(h, place(h.x, h.y));
          }
          case "mirrorShield": {
            h.nextReflect = 0;
            return interceptAlienRound(shotAt(h.x, h.y)) && bossProjectiles.some(projectile => projectile.vx < 0 && projectile.glyph === "prism")
              && !interceptAlienRound(shotAt(h.x, h.y, true));
          }
          case "tailConduit": {
            const spot = tailPosition(h, .43), node = h.nodes[0];
            const hit = alienMechanicHits(h, place(spot.x, spot.y));
            for (let shot = 0; shot < node.maxHealth; shot++) interceptAlienRound(shotAt(node.x, node.y));
            return hit && !alienMechanicHits(h, place(spot.x, spot.y));
          }
          case "sporeNests": {
            [player.x, player.y] = [h.nodes[0].x, h.nodes[0].y];
            updateAlienMechanic(h, .61);
            const blight = bossHazards.find(hazard => hazard.kind === "sporeBlight");
            return blight && blight.warning >= 1.4 && !alienHazardHitsPlayer(blight);
          }
          case "riftFold": {
            const shot = shotAt(h.x, h.y);
            const pull = alienMechanicVector(h, place(h.x - h.radius * .4, h.y));
            interceptAlienRound(shot);
            const once = shot.vy;
            interceptAlienRound(shot);
            phase(.85);
            const [x1, y1, x2, y2] = riftSeams(h)[0];
            return pull.x > 0 && once !== 0 && once === shot.vy && alienMechanicHits(h, place((x1 + x2) / 2, (y1 + y2) / 2));
          }
          case "neuralRelay": {
            phase(.73);
            const [node, next] = h.nodes;
            const ship = place((node.x + h.x) / 2, (node.y + h.y) / 2);
            interceptAlienRound(shotAt(next.x, next.y));
            const stationary = alienMechanicHits(h, ship);
            ship.previousX = ship.x - 10;
            const moving = alienMechanicHits(h, ship);
            for (let shot = 0; shot < node.maxHealth; shot++) interceptAlienRound(shotAt(node.x, node.y));
            return !stationary && moving && next.health === next.maxHealth && activeRelayNode(h) === next;
          }
          case "fusionLimbs": {
            phase(.25);
            const [siphon] = h.nodes;
            const ship = place(h.x + h.radius * .34, h.y);
            const pulled = alienMechanicVector(h, ship)?.x < 0;
            for (let shot = 0; shot < siphon.maxHealth; shot++) interceptAlienRound(shotAt(siphon.x, siphon.y));
            return pulled && !alienMechanicVector(h, ship) && h.nodes[1].health > 0;
          }
        }
      }, kinds[type]);
      assert.equal(result, true, `${key} mechanic must change the actual game rule`);
      results.push({ type: type + 1, key, kind: kinds[type], mechanic: result, pose });
      console.log(`${type + 1}. ${key}, gameplay and windup verified`);
    }
    assert.deepEqual(errors, [], "unexpected browser errors");
    fs.writeFileSync(path.join(output, "boss-mechanics.json"), JSON.stringify({ results, errors }, null, 2));
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
