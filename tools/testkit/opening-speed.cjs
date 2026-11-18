"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");
const { serveOpeningFilms } = require("./opening-media-route.cjs");

async function measure(page, duration) {
  return page.evaluate(async ms => {
    const sample = () => [performance.now(), campaignOpening.inspectForQa().seconds];
    const [start, from] = sample();
    await new Promise(r => setTimeout(r,ms));
    const [end,to] = sample();
    return (to-from) / ((end-start)/1000);
  }, duration);
}

async function checkRateKeys(page) {
  const read = () => page.locator(".opening-speed").textContent({timeout:1800});
  assert.match(await read(), /Shift/);
  const normal = await measure(page,850);
  await page.keyboard.down("ShiftLeft");
  assert.match(await read(), /2×/);
  const fast = await measure(page,850);
  await page.keyboard.down("ShiftRight");
  await page.keyboard.up("ShiftLeft");
  const overlap = await measure(page,700);
  await page.locator(".opening-pause").click();
  const paused = await measure(page,220);
  await page.keyboard.up("ShiftRight");
  await page.locator(".opening-pause").click();
  const resumed = await measure(page,650);
  assert.ok(Math.abs(normal-1)<.18 && Math.abs(fast-2)<.24 && Math.abs(overlap-2)<.24,JSON.stringify({normal,fast,overlap}));
  assert.ok(paused===0 && Math.abs(resumed-1)<.2);
  return {normal,fast,overlap,paused,resumed};
}

module.exports = { checkRateKeys };
if (require.main === module) main().catch(error=>{console.error(error);process.exitCode=1;});

async function main() {
  const game=path.resolve(process.argv[2]), out=path.resolve(process.argv[3]);
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,
    args:["--disable-webgl","--disable-gpu","--autoplay-policy=no-user-gesture-required"]});
  try {
    const { page, errors } = await createPage(browser, game, false, { campaignOpening:true,
      pageOptions:{viewport:{width:760,height:450}} });
    await serveOpeningFilms(page,game);
    await page.addInitScript(() => {
      const make=document.createElement.bind(document), gates=new WeakMap();
      window.speedAudit={videos:[],cues:[],frames:{}};
      document.createElement=function(name,options){
        const node=make(name,options);
        if(node instanceof HTMLVideoElement) speedAudit.videos.push(node);
        return node;
      };
      const connect=AudioNode.prototype.connect,stop=AudioBufferSourceNode.prototype.stop;
      AudioNode.prototype.connect=function(to,...args){
        if(this instanceof AudioBufferSourceNode && to instanceof BiquadFilterNode) gates.set(this,to);
        return connect.call(this,to,...args);
      };
      AudioBufferSourceNode.prototype.stop=function(end){
        const gate=gates.get(this), story=window.campaignOpening?.inspectForQa?.();
        if(gate && story) {
          const cue={frequency:gate.frequency.value,at:story.seconds,tail:end-this.context.currentTime};
          speedAudit.cues.push(cue);
          // The audio render quantum applies AudioParam events after the JavaScript scheduling call.
          setTimeout(()=>{cue.rate=this.playbackRate.value;},35);
        }
        return stop.call(this,end);
      };
    });
    await page.goto(new URL("?qa=1",page.url()).href);
    await page.locator("#start-button").click();
    await page.locator("#campaign-opening").waitFor();
    await page.waitForFunction(()=>campaignOpening.inspectForQa()?.seconds>.35);
    const keys=await checkRateKeys(page);
    fs.mkdirSync(out,{recursive:true});
    await page.keyboard.down("ShiftLeft");
    await page.evaluate(()=>window.dispatchEvent(new FocusEvent("blur")));
    await page.keyboard.down("ShiftLeft");
    assert.equal(await page.evaluate(()=>campaignOpening.inspectForQa().rate),1);
    await page.keyboard.up("ShiftLeft");
    await page.evaluate(()=>window.dispatchEvent(new FocusEvent("focus")));
    await page.keyboard.down("ShiftRight");
    await page.evaluate(()=>{
      Object.defineProperty(document,"hidden",{value:true,configurable:true});
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(await measure(page,250),0);
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event("visibilitychange"));});
    assert.equal(await page.evaluate(()=>campaignOpening.inspectForQa().rate),1);
    await page.keyboard.up("ShiftRight");
    await page.evaluate(()=>{
      setGameLanguage("en");
      campaignOpening.seekForQa(0);
      speedAudit.cues=[];
      speedAudit.frames={};
      speedAudit.start=performance.now();
      const poll=setInterval(()=>{
        const s=campaignOpening.inspectForQa();
        if(!s){clearInterval(poll);speedAudit.end=performance.now();return;}
        if(!s.film || !s.decodedFilm) return;
        const video=speedAudit.videos.find(v=>v.src.endsWith("/"+s.film+".mp4"));
        const cut=openingPerformanceCuts.find(c=>c.file===s.film);
        if(!video || video.paused || !cut) return;
        (speedAudit.frames[s.film]??=[]).push({rate:video.playbackRate,drift:Math.abs(video.currentTime-(s.seconds-cut.start))});
      },160);
    });
    assert.match(await page.locator(".opening-speed").textContent(),/Hold Shift/);
    await page.keyboard.down("ShiftLeft");
    await page.screenshot({path:path.join(out,"prologue-2x-en.png")});
    await page.waitForFunction(()=>state==="battle" && !!speedAudit.end,null,{timeout:105000});
    const playback=await page.evaluate(()=>({
      wallSeconds:(speedAudit.end-speedAudit.start)/1000, cues:speedAudit.cues,
      films:Object.entries(speedAudit.frames).map(([name,frames])=>{
        const drift=frames.map(row=>row.drift).sort((a,b)=>a-b);
        return {name,samples:frames.length,driftP95:drift[Math.floor(frames.length*.95)],rates:[...new Set(frames.map(row=>row.rate))]};
      }),boostHeld:flightKeyHeld("stance"),
    }));
    fs.writeFileSync(path.join(out,"clock-measurements.json"),JSON.stringify(playback,null,2));
    assert.ok(playback.wallSeconds>=71.5 && playback.wallSeconds<82,JSON.stringify(playback));
    assert.equal(playback.films.length,5);
    for(const film of playback.films) {
      assert.ok(film.samples>=7 && film.driftP95<.32,JSON.stringify(film));
      assert.deepEqual(film.rates,[2]);
    }
    const audio=[];
    for(const [stamp,hz,span] of [[12.2,270,.82],[23.2,630,.44],[47.1,150,1.12],[83.1,380,.86],[127.52,1150,.32],[133.40,590,.52],[134.5,250,1.3],[139.2,130,.87],[145.3,195,.65]]) {
      const cue=playback.cues.find(c=>Math.abs(c.at-stamp)<.22 && c.frequency===hz);
      assert.ok(cue && Math.abs(cue.rate-2)<1e-6 && Math.abs(cue.tail-(span+.03)/2)<.035,JSON.stringify({stamp,hz,cue}));
      audio.push(cue);
    }
    assert.equal(playback.boostHeld,false);
    await page.keyboard.down("ShiftLeft"); // OS repeat after the last cinematic frame.
    assert.equal(await page.evaluate(()=>flightKeyHeld("stance")),false);
    await page.keyboard.up("ShiftLeft");
    await page.keyboard.down("ShiftLeft");
    assert.equal(await page.evaluate(()=>flightKeyHeld("stance")),true);
    await page.keyboard.up("ShiftLeft");
    await page.evaluate(()=>{showScreen("menu");setGameLanguage("zh-CN");});
    await page.locator("#hangar-manual").click();
    await page.locator("#replay-intro-button").click();
    assert.match(await page.locator(".opening-speed").textContent(),/按住 Shift/);
    assert.equal(await page.evaluate(()=>campaignOpening.inspectForQa().rate),1);
    await page.keyboard.down("ShiftRight");
    await page.screenshot({path:path.join(out,"prologue-2x-zh.png")});
    await page.locator(".opening-finish").click();
    await page.keyboard.up("ShiftRight");
    assert.equal(await page.evaluate(()=>state),"menu");
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,"opening-speed.json"),JSON.stringify({keys,wallSeconds:playback.wallSeconds,films:playback.films,
      audio,blurReset:true,hiddenPaused:true,naturalHandoff:true,battleBoostRearmed:true,replayReset:true,errors},null,2));
  }finally{await browser.close();}
}
