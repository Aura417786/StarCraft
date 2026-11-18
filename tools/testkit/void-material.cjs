"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

(async () => {
  const root = path.resolve(process.argv[2] || ".");
  const out = path.resolve(process.argv[3]);
  fs.mkdirSync(out,{recursive:true});
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH});
  try {
    const {page,errors} = await createPage(browser,root,false);
    const stats = await page.evaluate(async () => {
      NextgenVfx.warmMaterial("void");
      const names = ["void-inclined-horizon", "void-collapse-front", "void-shear"];
      const resources = await Promise.all(names.map(async name => {
        const img=new Image();
        img.src="assets/vfx/nextgen/"+name+".webp";
        await img.decode();
        return { name,width:img.naturalWidth,height:img.naturalHeight };
      }));
      const target=document.createElement("canvas");
      target.width=512;target.height=320;
      const ctx=target.getContext("2d",{willReadFrequently:true});
      function frame(time,quiet) {
        ctx.fillStyle="#3e494f";ctx.fillRect(0,0,512,320);
        NextgenVfx.beginFrame();
        NextgenVfx.drawHorizon(ctx,256,160,460,time,1,quiet);
        return ctx.getImageData(0,0,512,320).data;
      }
      function changed(a,b) {
        let n=0;
        for (let i=0;i<a.length;i+=4)
          if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12) n++;
        return n;
      }
      const tiers=[];
      for (const tier of ["low","medium","high"]) {
        setVisualQuality(tier,false);
        const pixels=frame(.38,false);
        let darkCore=0, radiant=0;
        for(let y=0;y<320;y++)for(let x=0;x<512;x++) {
          const i=(512*y+x)*4;
          if(Math.hypot(x-256,y-160)<48 && pixels[i]+pixels[i+1]+pixels[i+2]<75) darkCore++;
          if(pixels[i]>150 && pixels[i+2]>148 && pixels[i]-pixels[i+1]>32) radiant++;
        }
        tiers.push({tier,darkCore,radiant,animatedPixels:changed(pixels,frame(1.22,false)),
          quietChanges:changed(frame(.38,true),frame(1.22,true))});
      }
      return {resources,tiers};
    });
    assert.deepEqual(errors,[]);
    assert.equal(stats.resources[0].width,2304);
    for(const t of stats.tiers) {
      assert.ok(t.darkCore>6300 && t.radiant>2200 && t.animatedPixels>4000);
      assert.equal(t.quietChanges,0);
    }
    fs.writeFileSync(path.join(out,"void-material.json"),JSON.stringify({...stats,errors},null,2));
    console.log(JSON.stringify(stats.tiers));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
