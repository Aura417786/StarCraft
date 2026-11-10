const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const entry = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
const output = process.argv[2] && path.resolve(process.argv[2]);

async function sampleFrames(page, setting) {
  return page.evaluate(id => {
    setVisualQuality(id, false);
    return new Promise(resolve => {
      const samples = [];
      let previous;
      const measure = time => {
        if (previous !== undefined) samples.push(time - previous);
        previous = time;
        if (samples.length < 90) requestAnimationFrame(measure);
        else {
          samples.sort((a, b) => a - b);
          resolve({ medianMs: samples[45], p95Ms: samples[85] });
        }
      };
      requestAnimationFrame(measure);
    });
  }, setting);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  try {
    if (output) fs.mkdirSync(output, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(entry);
    if (await page.locator('.flight-guide-actions button').isVisible()) await page.locator('.flight-guide-actions button').click();
    const quality = page.locator('#render-quality');
    await quality.selectOption('low');
    await page.reload();
    assert.equal(await quality.inputValue(), 'low');
    assert.equal(await page.locator('#game-app').getAttribute('data-quality'), 'low');
    await page.locator('#language-button').click();
    assert.equal(await page.locator('#render-quality-label').innerText(), 'Graphics');
    assert.equal(await quality.locator('option[value=medium]').innerText(), 'Medium');
    await quality.selectOption('high');
    if (output) await page.screenshot({ path: path.join(output, 'commercial-hangar.png') });

    await page.locator('#start-button').click();
    const expectedX = await page.evaluate(() => player.x);
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(startX => player.x > startX + 25, expectedX);
    await page.keyboard.up('ArrowRight');
    const unchanged = await page.evaluate(() => {
      const before = [player.x, player.y, player.width, player.height, player.lives, battleTime,
        bullets.map(shot => [shot.x, shot.y, shot.length, shot.angle])];
      setVisualQuality('low', false);
      const after = [player.x, player.y, player.width, player.height, player.lives, battleTime,
        bullets.map(shot => [shot.x, shot.y, shot.length, shot.angle])];
      setVisualQuality('high', false);
      return JSON.stringify(before) === JSON.stringify(after);
    });
    assert.equal(unchanged, true);

    const atlas = await page.evaluate(async () => {
      if (typeof fighterAtlasCatalog === 'undefined') return null;
      const result = [];
      for (const id of ['red', 'blue', 'yellow']) {
        await preloadFighterAtlas(id).decode();
        const samples = [-1, -.5, 0, .5, 1].map(bank => fighterAtlasPose(fighterVariantArt[id], player, bank));
        setVisualQuality('low', false);
        const fallback = fighterAtlasPose(fighterVariantArt[id], player, 0) === null;
        setVisualQuality('high', false);
        result.push({ id, distinct: new Set(samples.map(sample => sample.sourceX)).size,
          anchored: samples.every(sample => sample.anchorX === muzzlePosition().x && sample.anchorY === muzzlePosition().y), fallback });
      }
      return result;
    });
    assert.equal(atlas.length, 3);
    assert.equal(atlas.every(fighter => fighter.distinct === 5 && fighter.anchored && fighter.fallback), true);

    const fps = {};
    for (const setting of ['high', 'medium', 'low']) fps[setting] = await sampleFrames(page, setting);
    if (output) {
      await page.evaluate(() => {
        setVisualQuality('high', false);
        movementHint.hidden = true;
        setBossMessage('02/11 · Marrow Hunter', 'RECOVERY · Focus the exposed spine');
        app.dataset.bossPhase = 'recover';
      });
      await page.screenshot({ path: path.join(output, 'commercial-combat-hud.png') });
      for (const id of ['red', 'blue', 'yellow']) {
        await page.evaluate(id => {
          selectedFighter = id;
          showScreen('battle');
          movementHint.hidden = true;
          player.x = viewport.width * .26;
          player.previousX = player.x;
          ultimate.charges = 1;
          updateUltimateDisplay();
        }, id);
        await page.keyboard.press('Space');
        await page.waitForFunction(() => ultimate.phase === 'firing' && ultimate.elapsed > .10);
        await page.screenshot({ path: path.join(output, `commercial-${id}-special.png`) });
      }
    }

    await page.setViewportSize({ width: 840, height: 410 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#menu-button').click();
    await page.locator('#pause-confirm').click();
    await page.locator('.start-screen').waitFor({ state: 'visible' });
    const rect = await quality.boundingBox();
    assert.ok(rect && rect.y >= 0 && rect.y + rect.height <= 410, JSON.stringify(rect));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ unchanged, atlas, fps, compactAndReducedMotion: true }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
