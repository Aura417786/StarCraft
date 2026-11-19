"use strict";
// Test the delivered folder over actual HTTP, including nested decoders/audio.
// Gameplay staging is limited to checking all three fighter controls and a Boss.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.wasm':'application/wasm', '.glb':'model/gltf-binary',
  '.ogg':'audio/ogg', '.mp3':'audio/mpeg', '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg' };
(async () => {
  const root=path.resolve(process.argv[2]), out=path.resolve(process.argv[3]);
  fs.mkdirSync(out,{recursive:true});
  const missing=[], errors=[], rows=[];
  const server=http.createServer((req,res)=>{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '')||'index.html';
    const file=path.resolve(root,name);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
      if(name!=='favicon.ico')missing.push(name);
      res.writeHead(404);res.end();return;
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    const url=`http://127.0.0.1:${server.address().port}/`;
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--use-angle=d3d11']});
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    page.on('pageerror',e=>errors.push(e.stack||e.message));
    await page.addInitScript(()=>{
      localStorage.setItem('star-breaker-flight-training','1');
    });
    await page.goto(url,{waitUntil:'load'});
    const guide=page.locator('.flight-guide-actions button').first();
    if(await guide.isVisible())await guide.click();
    await page.locator('#start-button').click();
    await page.waitForFunction(()=>state==='battle'&&battleTime>.1);
    for(const fighter of ['red','blue','yellow']){
      await page.evaluate(fighter=>{
        selectedFighter=fighter;showScreen('battle',{seed:4225,difficulty:'veteran'});
        enemyCooldown=powerupCooldown=nextBossTime=Infinity;
        formationState.nextTime=battlefieldEvents.nextObject=battlefieldEvents.nextTransport=aceEncounter.nextTime=Infinity;
        ultimate.charges=2;shield.charges=2;canvas.focus();
      },fighter);
      const y=await page.evaluate(()=>player.y);
      await page.keyboard.down('ArrowUp');
      await page.waitForFunction(y=>player.y<y-15,y);
      await page.keyboard.up('ArrowUp');
      await page.keyboard.press('Space');
      await page.waitForFunction(()=>ultimate.phase==='firing');
      await page.keyboard.press('KeyV');
      assert.equal(await page.evaluate(()=>shield.charges),1);
      rows.push(await page.evaluate(()=>({fighter:sortieFighter,ultimate:ultimate.kind,phase:ultimate.phase,shield:shield.charges})));
      await page.screenshot({path:path.join(out,`${fighter}.png`)});
    }
    await page.evaluate(()=>{spawnBoss(0);bossHitGrace=1000;});
    await page.waitForFunction(()=>boss&&!isBossPresentationPlaying());
    await page.waitForTimeout(2500);
    const runtime=await page.evaluate(()=>({models:starBreakerModelCache.size,renderer:!!starBreakerModelStage?.renderer,
      fx:NextgenVfx.diagnostics(),audio:gameAudio.diagnostics}));
    assert.ok(runtime.renderer,'Frozen folder must load the real 3D renderer over HTTP');
    await page.evaluate(()=>{setGameLanguage('en');showScreen('start');});
    await page.reload({waitUntil:'load'});
    assert.equal(await page.evaluate(()=>localStorage.getItem('star-breaker-language')),'en');
    await page.screenshot({path:path.join(out,'hangar-en.png')});
    const result={method:'Actual loopback HTTP server, production files, real keyboard. Staged skills/Boss, not a natural victory.',
      root,browser:browser.version(),rows,runtime,missing,errors};
    fs.writeFileSync(path.join(out,'http-smoke.json'),JSON.stringify(result,null,2));
    assert.deepEqual(missing,[]);assert.deepEqual(errors,[]);console.log('Frozen HTTP smoke passed');
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error(e);process.exitCode=1});
