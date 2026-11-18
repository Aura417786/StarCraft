"use strict";

// Run against a local or published game over HTTP. Capture the actual stage and
// its score continuously; the unmodified opening clock alone advances the story.
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const {chromium}=require("playwright");
const {selectHangarFighter}=require("./hangar-test-controls.cjs");

async function main() {
  const url=new URL(process.argv[2]),out=path.resolve(process.argv[3]);
  url.searchParams.set("qa","1");
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,
    args:["--autoplay-policy=no-user-gesture-required","--disable-renderer-backgrounding"]});
  const rows=[],errors=[],failures=[];
  try{
    const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
    page.on("pageerror",e=>errors.push(e.message));
    page.on("response",r=>{if(r.status()>=400&&!r.url().endsWith("favicon.ico"))failures.push([r.status(),r.url()]);});
    await page.addInitScript(()=>{
      localStorage.setItem("star-breaker-flight-training","1");
      const connect=AudioNode.prototype.connect;
      AudioNode.prototype.connect=function(target,...args) {
        if(target===this.context.destination) {
          const dest=this.context.createMediaStreamDestination();
          connect.call(this,dest);
          window.openingCaptureAudio=dest.stream;
        }
        return connect.call(this,target,...args);
      };
    });
    await page.goto(url.href);
    await page.waitForFunction(()=>typeof showScreen==="function");
    const guide=page.locator(".flight-guide-actions button").first();
    if(await guide.isVisible()) await guide.click();
    await selectHangarFighter(page,"blue");
    await page.locator("#start-button").click();
    await page.waitForSelector("#campaign-opening[open]");
    await page.evaluate(()=>{
      const stage=document.querySelector(".opening-stage"),stream=stage.captureStream(30);
      for(const track of window.openingCaptureAudio?.getAudioTracks()??[])stream.addTrack(track);
      const rec=new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp9,opus",videoBitsPerSecond:6400000});
      const parts=[];
      window.finishFilmCapture=new Promise(resolve=>{
        rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
        rec.onstop=async()=>{
          const reader=new FileReader();
          reader.onload=()=>resolve({base64:reader.result.split(",")[1],withScore:stream.getAudioTracks().length>0});
          reader.readAsDataURL(new Blob(parts,{type:"video/webm"}));
        };
      });
      window.stopFilmCapture=()=>rec.stop();rec.start(1200);
    });
    const shots=[[6,"relay"],[18,"return-signal"],[29,"survey"],[34,"lab"],[40,"briefing"],
      [52,"contact"],[65,"resolve"],[76,"plot"],[88,"berth"],[99,"inspection"],
      [111,"witnesses"],[123,"look-back"],[125.7,"lift"],[128.8,"lock"],
      [133,"canopy"],[137,"departure"],[142.3,"formation"],[145.49,"opening-salvo"]];
    for(const [time,name] of shots){
      await page.waitForFunction(t=>campaignOpening.inspectForQa()?.seconds>=t,time,{timeout:45000});
      const state=await page.evaluate(()=>campaignOpening.inspectForQa());
      rows.push({name,time:state.seconds,cut:state.cut,film:state.film,decoded:state.decodedFilm,hull:state.dimensionalHull});
      if(state.film)assert.ok(state.decodedFilm,"Missing decoded actor performance at "+name);
      if(["berth","inspection","departure","formation"].includes(name))assert.ok(state.dimensionalHull,"3D projection missing in "+name);
      await page.screenshot({path:path.join(out,name+".jpg"),type:"jpeg",quality:90});
      console.log(name,state.seconds.toFixed(2),state.film??state.cut);
    }
    await page.waitForFunction(()=>!campaignOpening.active && state==="battle",null,{timeout:11000});
    const movie=await page.evaluate(async()=>{window.stopFilmCapture();return await window.finishFilmCapture;});
    fs.writeFileSync(path.join(out,"opening-stage.webm"),Buffer.from(movie.base64,"base64"));
    const captions=await page.evaluate(()=>openingDialogue.map(([a,b,who,,text])=>({a,b,who,text})));
    const stamp=t=>new Date(t*1000).toISOString().slice(11,23).replace(".",",");
    fs.writeFileSync(path.join(out,"opening.zh.srt"),captions.map(({a,b,who,text},i)=>[i+1,stamp(a)+" --> "+stamp(b),who+" · "+text,""].join("\n")).join("\n"));
    assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
    const report={method:"Uninterrupted first sortie in desktop Chrome, no seek or simulation acceleration. Canvas and its actual Web Audio output recorded. JPEGs include native gameplay subtitles and UI; WebM contains only the stage and score.",rows,withScore:movie.withScore,errors,failures,state:"battle"};
    assert.ok(report.withScore,"No score captured");
    fs.writeFileSync(path.join(out,"opening-performance.json"),JSON.stringify(report,null,2));
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
