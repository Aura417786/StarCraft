"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("playwright");
const {createPage}=require("./balance.cjs");

async function main() {
  const game=path.resolve(process.argv[2]), out=path.resolve(process.argv[3]);
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  const results=[];
  try {
    for (const language of ["zh-CN","en"]) {
      const {page,errors}=await createPage(browser,game,false,{pageOptions:{viewport:{width:1280,height:720}}});
      await page.evaluate(lang=>setGameLanguage(lang),language);
      assert.ok(await page.locator("#hangar-home #hangar-difficulty").isVisible());
      const choices=await page.locator("#hangar-difficulty input").evaluateAll(inputs=>inputs.map(input=>input.value));
      assert.deepEqual(choices,["easy","normal","hard","nightmare"]);
      const nightmare=page.locator('#hangar-difficulty label:has(input[value=nightmare])');
      const title=await nightmare.textContent();
      assert.match(title,language==="en"?/Abyssal Nightmare/:/深渊极限/);
      await nightmare.click();
      assert.match(await page.locator("#hangar-difficulty-note").textContent(),language==="en"?/one life/:/一条生命/);
      await page.screenshot({path:path.join(out,language+"-sortie.png")});
      await page.locator("#start-button").click();
      await page.waitForFunction(()=>state==="battle");
      const selected=await page.evaluate(()=>({difficulty:sortieStats.difficulty,enabled:isAbyssalNightmare(),
        legacy:document.querySelector("#campaign-opening, #replay-intro-button")!==null,
        order:JSON.parse(localStorage.getItem("star-breaker-sortie-settings")).difficulty}));
      assert.deepEqual(selected,{difficulty:"nightmare",enabled:true,legacy:false,order:"nightmare"});
      const tells=await page.evaluate(()=>{
        clearMovement();
        enemies.length=0;
        nextBossTime=Infinity;
        spawnBoss(0);
        setBossMessage("Boss", "A leaked attack caption");
        const action=document.querySelector("#boss-action");
        const hidden=getComputedStyle(action).display==="none";
        const canvas=document.createElement("canvas");
        canvas.width=viewport.width;
        canvas.height=viewport.height;
        const ctx=canvas.getContext("2d",{willReadFrequently:true});
        let textCalls=0;
        ctx.fillText=()=>textCalls++;
        drawPressureSealWarning(ctx,{warning:1.4,age:.6,gapSize:140,gapY:viewport.height*.50,fullSeal:false},false);
        const buffer=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        let visible=0;
        for(let i=3;i<buffer.length;i+=4)if(buffer[i]>0)visible++;
        return {hidden,textCalls,visible};
      });
      assert.ok(tells.hidden && tells.textCalls===0 && tells.visible>10,JSON.stringify(tells));
      assert.deepEqual(errors,[]);
      results.push({language,changes:selected,choices,tells,errors});
      await page.context().close();
    }
    fs.writeFileSync(path.join(out,"nightmare-menu.json"),JSON.stringify(results,null,2));
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
