"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const game = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const full = process.argv.includes("--full"), probe = process.argv.includes("--probe");
const mime = {".js":"text/javascript",".html":"text/html;charset=utf-8",".css":"text/css",".webp":"image/webp",".png":"image/png",".ogg":"audio/ogg",".glb":"model/gltf-binary",".json":"application/json",".wasm":"application/wasm"};
async function main() {
  fs.mkdirSync(out,{recursive:true});
  const server=http.createServer((req,res)=>{
    const file=path.resolve(game,"."+decodeURIComponent(new URL(req.url,"http://localhost").pathname));
    if(!file.startsWith(game+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader("Content-Type",mime[path.extname(file)]??"application/octet-stream");fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  let browser;
  const report={browser:null,records:[],showcase:[],errors:[]};
  try {
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,
      args:["--auto-accept-this-tab-capture","--use-fake-ui-for-media-stream","--auto-select-tab-capture-source-by-title=星际突围 · 30 秒实机演示"]});
    report.browser=browser.version();
    const urls=[`http://127.0.0.1:${server.address().port}/`,pathToFileURL(game+path.sep).href];
    for(const base of urls){
      const mode=base.startsWith("file:")?"file":"http";
      const context=await browser.newContext({viewport:{width:1366,height:768},acceptDownloads:true});
      try {
        const p=await context.newPage();
        p.on("pageerror",err=>report.errors.push({mode,url:p.url(),message:err.stack??String(err)}));
        await p.goto(base+"index.html");
        const guide=p.locator(".flight-guide-actions button").first();
        if(await guide.isVisible())await guide.click();
        await p.locator("#hangar-records").click();
        for(const key of ["upgrades","archive","awards"]){
          const button=p.locator('[data-sortie-console="'+key+'"]');
          await button.click();
          assert.equal(await p.locator("#sortie-console").evaluate(n=>n.open),true);
          const title=await p.locator("#sortie-console-title").innerText();
          assert.equal(title,({upgrades:"改装",archive:"战役档案",awards:"徽章墙"})[key]);
          assert.ok((await p.locator("#sortie-console-body").innerText()).trim().length>10);
          report.records.push({mode,key,title});
          await p.locator("#sortie-console-close").click();
          await button.waitFor({state:"visible"});
        }
        const originalProfile=await p.evaluate(()=>localStorage.getItem("star-breaker-profile"));
        await p.goto(base+"showcase.html?qa=1#demo");
        if(await guide.isVisible())await guide.click();
        await p.locator("#showcase-watch").waitFor({timeout:5000});
        await p.locator("#showcase-watch").click({timeout:3000});
        await p.waitForFunction(()=>document.body.dataset.showcaseActive==="true",null,{timeout:5000});
        assert.deepEqual(report.errors,[]);
        if(probe)continue;
        assert.ok(p.url().includes("qa=1")&&p.url().endsWith("#demo"));
        if(!full){
          await p.waitForFunction(()=>showcase.elapsed>.15);
          report.showcase.push({mode,watch:true});
          continue;
        }
        await p.evaluate(()=>{window.observedScenes=new Set([showcase.scene]);window.sceneProbe=setInterval(()=>{if(showcase.running)observedScenes.add(showcase.scene);},75);});
        await p.waitForFunction(()=>!showcase.running,null,{timeout:35000});
        const scenes=await p.evaluate(()=>{clearInterval(sceneProbe);return [...observedScenes];});
        assert.deepEqual(scenes,[0,1,2,3,4]);
        const record=p.locator("#showcase-record");
        await record.click();
        await p.waitForFunction(()=>showcase.running&&showcase.recorder?.state==="recording",null,{timeout:5000});
        const download=p.locator("#showcase-download");
        await download.waitFor({state:"visible",timeout:36000});
        const recording=await p.evaluate(async()=>{
          const blob=await(await fetch(showcaseDownload.href)).blob();
          return {bytes:blob.size,mime:blob.type,audioTracks:showcase.stream.getAudioTracks().length,videoTracks:showcase.stream.getVideoTracks().length};
        });
        assert.ok(recording.bytes>100000&&recording.videoTracks===1&&recording.audioTracks===1);
        assert.equal(await p.evaluate(()=>localStorage.getItem("star-breaker-profile")),originalProfile);
        const transfer=p.waitForEvent("download");await download.click();
        assert.ok((await transfer).suggestedFilename().endsWith(".webm"));
        const official=p.locator("#showcase-controls a").last();await official.click();
        await p.locator("#start-button").waitFor({state:"visible"});
        assert.equal(await p.locator("#showcase-controls").count(),0);
        report.showcase.push({mode,scenes,recording,gameReturn:true});
      } finally {await context.close();}
    }
    assert.deepEqual(report.errors,[]);
  } finally {
    fs.writeFileSync(path.join(out,"browser-entry.json"),JSON.stringify(report,null,2));
    if(browser)await browser.close();server.close();
    console.log(JSON.stringify(report));
  }
}
main().catch(err=>{console.error(err);process.exitCode=1;});
