const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = path.resolve(__dirname, '..');
const screenshotDirectory = process.argv[2] ? path.resolve(process.argv[2]) : null;
const types = { '.js':'text/javascript', '.html':'text/html', '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.glb':'model/gltf-binary' };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.route('https://abyss-qa.invalid/**', route => {
      const key = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || 'index.html';
      const file = path.resolve(base, key);
      if (!file.startsWith(base + path.sep) || !fs.existsSync(file)) return route.fulfill({ status:404, body:'' });
      return route.fulfill({ contentType: types[path.extname(file)], body: fs.readFileSync(file) });
    });
    await page.goto('https://abyss-qa.invalid/');
    await page.locator('.flight-guide-actions button').click();
    await page.locator('#start-button').click();
    await page.evaluate(() => {
      window.finaleFixture = (type) => {
        resetBossEncounter();
        resetCombatEffects();
        powerups.length = 0;
        powerupNotice.hidden = true;
        upgradeNoticeTime = 0;
        score = kills = 0;
        scoreDisplay.textContent = '000000';
        nextBossTime = Infinity;
        battleTime = 41 + type * 68;
        shotCooldown = 999;
        spawnBoss(type);
        Object.assign(boss, bossArena(type), { phase: 'recover', hp: .001 });
        player.y = player.previousY = flightBounds.top + (flightBounds.bottom - flightBounds.top) * .21;
        const log = boss.healthLog;
        const target = boss;
        applyBossHit({ source: 'ultimate', damageLog: log }, target);
        return { same: boss === target, logRatio: Math.exp(boss.healthLog - log), defeated: bossDefeated,
          phase: boss.phase, mode: boss.finale.mode, hp: boss.hp };
      };
    });
    const expected = ['egg','bones','furnace','web','claws','mirror','coil','spores','void','synapse','fusion'];
    const waves = [];
    for (const [index, mode] of expected.entries()) {
      const result = await page.evaluate(type => {
        const intro = finaleFixture(type);
        for (let step = 0; step < 93; step++) updateBossEncounter(.02);
        const firstWave = boss.finale.hazards.map(hazard => hazard.type);
        const target = boss;
        const before = score;
        for (let step = 0; step < 390; step++) {
          updateBossEncounter(.02);
          drawBossBattle();
          if (!Number.isFinite(boss.x + boss.y) || boss.finale.hazards.length > 12) throw new Error('Invalid finale position or hazard cap');
        }
        boss.hp = .001;
        const shot = { source: 'ultimate', damageLog: boss.healthLog, finaleNode: boss.finale.activeNode };
        applyBossHit(shot, target);
        const settled = score;
        const cleared = !boss && bossDefeated === type + 1 && isBossDeathPlaying();
        defeatBoss(target);
        const once = score === settled && settled - before === (type === 10 ? 6000 : 2000);
        for (const progress of [.1,.45,.70,.99]) drawBossFinaleCollapse(context, target, progress, false);
        return { ...intro, firstWave, cleared, once };
      }, index);
      assert.deepEqual([result.mode, result.same, result.phase, result.defeated, result.hp, result.cleared, result.once], [mode,true,'finale',0,1,true,true]);
      assert.ok(result.logRatio >= .44 - 1e-10 && result.logRatio <= .72 + 1e-10);
      assert.ok(result.firstWave.length > 0);
      waves.push([mode, result.firstWave]);
    }

    for (const viewport of [{width:640,height:360}, {width:1280,height:720}, {width:1920,height:1080}]) {
      await page.setViewportSize(viewport);
      const egg = await page.evaluate(() => {
        finaleFixture(0);
        const neverMove = player.y;
        for (let step = 0; step < 100; step++) updateBossEncounter(.02);
        const wave = boss.finale.hazards[0];
        const pre = wave.type === 'tide' && wave.age < wave.warning && !bossFinaleHitsPlayer(boss);
        bullets.push({}); enemyProjectiles.push({});
        ultimate.phase = 'firing';
        const charges = ultimate.charges;
        while (wave.age < wave.warning) updateBossFinale(boss, .02);
        const cleared = !bullets.length && !enemyProjectiles.length && ultimate.phase === 'idle'
          && ultimate.charges === charges && boss.finale.hazards.includes(wave);
        let exposed = false, avoided = true;
        while (wave.age < wave.warning + wave.duration) {
          player.y = player.previousY = neverMove;
          exposed ||= bossFinaleHitsPlayer(boss);
          player.y = player.previousY = wave.gap.center;
          avoided &&= !bossFinaleHitsPlayer(boss);
          updateBossFinale(boss, .02);
        }
        const reachable = Math.abs(neverMove - wave.gap.center) <= player.speed * .65 * wave.warning;
        const hpBeforeResize = (boss.hp = .64);
        resizeBossFinale(boss);
        return { pre, cleared, exposed, avoided, reachable, preserved: hpBeforeResize === boss.hp };
      });
      assert.deepEqual(egg, { pre:true, cleared:true, exposed:true, avoided:true, reachable:true, preserved:true }, JSON.stringify({ viewport, egg }));
    }

    await page.setViewportSize({width:1280,height:720});
    await page.waitForTimeout(120);
    const exit = await page.evaluate(() => {
      finaleFixture(0);
      while (!boss.finale.hazards.length) updateBossEncounter(.02);
      const tide = boss.finale.hazards[0];
      return { key: player.y < tide.gap.center ? 'ArrowDown' : 'ArrowUp', y:tide.gap.center, lives:player.lives };
    });
    await page.keyboard.down(exit.key);
    await page.evaluate(y => {
      for (let step = 0; step < 50 && Math.abs(player.y - y) > 12; step++) {
        updatePlayer(.02); updateBossEncounter(.02); updateBossDamage();
      }
    }, exit.y);
    await page.keyboard.up(exit.key);
    const movement = await page.evaluate((initial) => {
      const tide = boss.finale.hazards[0];
      while (tide.age < tide.warning + tide.duration) { updatePlayer(.02); updateBossEncounter(.02); updateBossDamage(); }
      const keyboardSafe = Math.abs(player.y - initial.y) < 12 && player.lives === initial.lives;
      finaleFixture(0);
      const lives = player.lives;
      while (!boss.finale.hazards.length) updateBossEncounter(.02);
      const impact = boss.finale.hazards[0];
      while (impact.age < impact.warning + impact.duration) {
        updatePlayer(.02); updateBossEncounter(.02); updateBossDamage();
      }
      const carelessDamage = lives - player.lives === 1;
      return { keyboardSafe, carelessDamage };
    }, exit);
    assert.deepEqual(movement, { keyboardSafe:true, carelessDamage:true });
    const tactics = await page.evaluate(() => {
      const init = type => { finaleFixture(type); updateBossEncounter(1.81); return boss; };
      const bones = init(1);
      const node = bones.finale.nodes[0];
      const geometry = finaleNodeGeometry(bones, node);
      const hit = { source:'ultimate', damageLog:bones.healthLog, finaleNode:0, y:geometry.y };
      for (let i = 0; i < 4; i++) bossFinaleDamageMultiplier(bones, hit);
      updateBossFinale(bones,.03);
      const boneBreak = node.hp === 0 && bones.finale.hazards.every(hazard => hazard.node !== 0);
      const web = init(3);
      const closed = bossFinaleDamageMultiplier(web, {}) < .5;
      Object.assign(player, {x:web.finale.gate.x, y:web.finale.gate.y});
      updateBossFinale(web,.02);
      const webCut = closed && web.finale.gate.cut && bossFinaleDamageMultiplier(web,{}) > 1;
      const mirror = init(5);
      const before = mirror.finale.hazards.length;
      const wrong = 1 - mirror.finale.activeNode;
      for (let i = 0; i < 3; i++) bossFinaleDamageMultiplier(mirror,{finaleNode:wrong});
      const mirrorCounter = mirror.finale.hazards.length === before + 1;
      const crown = init(9);
      bossFinaleDamageMultiplier(crown,{finaleNode:2, damageLog:crown.healthLog});
      const locked = crown.finale.nodes[2].hp === 1;
      for (let i = 0; i < 4; i++) bossFinaleDamageMultiplier(crown,{finaleNode:0, damageLog:crown.healthLog});
      const order = locked && crown.finale.activeNode === 1;
      const fusion = init(10);
      const sets = [fusion.finale.hazards.map(hazard=>hazard.type).sort().join(',')];
      for (let phase = 0; phase < 2; phase++) {
        while (fusion.finale.age < fusion.finale.next - .021) updateBossFinale(fusion,.02);
        updateBossFinale(fusion,.03);
        sets.push(fusion.finale.hazards.map(hazard=>hazard.type).sort().join(','));
      }
      return { boneBreak, webCut, mirrorCounter, order, fusionVariety:new Set(sets).size };
    });
    assert.deepEqual(tactics,{ boneBreak:true, webCut:true, mirrorCounter:true, order:true, fusionVariety:3 });

    await page.evaluate(() => finaleFixture(0));
    await page.waitForFunction(() => bossFinaleEggImage.naturalWidth > 0, null, { polling: 25 });
    if (screenshotDirectory) {
      fs.mkdirSync(screenshotDirectory, { recursive:true });
      await page.evaluate(() => {
        while (!boss.finale.hazards.length) updateBossEncounter(.02);
        const tide = boss.finale.hazards[0];
        while (tide.age < tide.warning + tide.duration * .42) updateBossEncounter(.02);
        drawFrame(1);
      });
      await page.waitForTimeout(400);
      await page.evaluate(() => drawFrame(1));
      await page.screenshot({ path: path.join(screenshotDirectory, 'abyss-finale-egg-tide.png') });
      await page.evaluate(() => {
        boss.hp = .001;
        applyBossHit({ source:'ultimate', damageLog:boss.healthLog }, boss);
        updateCombatEffects(.89);
        drawFrame(1);
      });
      await page.screenshot({ path: path.join(screenshotDirectory, 'abyss-finale-egg-collapse.png') });
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ waves, tactics, movement, screenshots:screenshotDirectory ? 2 : 0, playSizes:3 }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
