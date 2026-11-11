#!/usr/bin/env node
"use strict";

// Real RAF / production rendering. Isolated visual previews deliberately disable
// player fire and add fixture-only damage grace; these are not natural-play wins.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

async function main() {
  const [gameArg, outArg, selection] = process.argv.slice(2);
  if (!gameArg || !outArg) throw new Error("Usage: pressure-preview.cjs <Game> <Out> [1,3,6]");
  const game = path.resolve(gameArg), out = path.resolve(outArg);
  const types = selection ? selection.split(",").map(n => Number(n) - 1) : Array.from({ length: 10 }, (_, i) => i);
  assert.ok(types.every(type => Number.isInteger(type) && type >= 0 && type < 10));
  fs.mkdirSync(out, { recursive: true });
  const report = { method: "Real-time production Canvas capture at 30fps. Isolated staged encounters with player shooting disabled and damage grace. Canvas-only video, no DOM HUD or audio; not natural-play or balance proof.", clips: [] };
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true,
    args: ["--use-angle=d3d11", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"] });
  try {
    const { page, errors } = await createPage(browser, game, false);
    for (const type of types) {
      await page.evaluate(type => {
        showScreen("battle", { seed: 4225, difficulty: "veteran" });
        setVisualQuality("high", false); canvas.focus();
        enemyCooldown = powerupCooldown = nextBossTime = Infinity;
        formationState.nextTime = battlefieldEvents.nextObject = battlefieldEvents.nextTransport = aceEncounter.nextTime = Infinity;
        spawnBoss(type); shotCooldown = Infinity; bossHitGrace = 1000;
      }, type);
      await page.waitForFunction(() => boss && !isBossPresentationPlaying());
      await page.waitForTimeout(1200);
      const info = await page.evaluate(() => {
        resetBossPresentation(); boss.phase = "recover"; boss.phaseTime = .8;
        boss.pressureAttackCount = 6;
        const stream = canvas.captureStream(30);
        const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8"].find(type => MediaRecorder.isTypeSupported(type));
        const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4500000 });
        const chunks = [];
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        window.finishPressureCapture = () => new Promise(resolve => {
          recorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(",")[1]);
            reader.readAsDataURL(new Blob(chunks, { type: mime }));
          };
          recorder.stop();
        });
        recorder.start(250);
        prepareAlienAttack(boss, true);
        return { boss: boss.type + 1, name: bossTypeName(boss.type), state: structuredClone(boss.pressureState), mime };
      });
      assert.ok(info.state, "Real scheduler must start the authored ultimate");
      await page.waitForTimeout(6200);
      const data = await page.evaluate(() => finishPressureCapture());
      const file = `boss-${type + 1}-ultimate.webm`;
      fs.writeFileSync(path.join(out, file), Buffer.from(data, "base64"));
      report.clips.push({ ...info, file, bytes: fs.statSync(path.join(out, file)).size });
      fs.writeFileSync(path.join(out, "preview.json"), JSON.stringify(report, null, 2));
      console.log(`Captured boss ${type + 1}: ${file}`);
    }
    report.errors = errors;
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, "preview.json"), JSON.stringify(report, null, 2));
    const esc = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
    fs.writeFileSync(path.join(out, "index.html"), `<!doctype html><meta charset="utf-8"><title>v29 绝招实机预览</title>
<style>body{background:#0b1019;color:#e1e8f3;font:16px system-ui;margin:32px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:24px}video{width:100%;background:#000}p{max-width:80ch;line-height:1.6}</style>
<h1>十种绝招 · 实机渲染预览</h1><p>固定场景、真实浏览器时钟。为检查画面关闭了玩家射击并延长受伤保护；这不是自然通关录像。视频只录游戏画布，不含 DOM 界面和音频。</p><main>${report.clips.map(c => `<section><h2>${c.boss}. ${esc(c.name)}</h2><video controls preload="metadata" src="${esc(c.file)}"></video></section>`).join("")}</main>`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
