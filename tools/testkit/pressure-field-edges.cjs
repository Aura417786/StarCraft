"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const {chromium}=require("playwright");
const {createPage}=require("./balance.cjs");

(async()=>{
  const out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH});
  try {
    const {page,errors}=await createPage(browser,path.resolve(process.argv[2]),false);
    const samples=await page.evaluate(()=>{
      showScreen("battle",{seed:77135});
      const layer=document.createElement("canvas");
      layer.width=viewport.width;layer.height=viewport.height;
      const g=layer.getContext("2d",{willReadFrequently:true}), rows=[];
      for(let type=0;type<11;type++) {
        spawnBoss(type);resetBossPresentation();Object.assign(boss,bossArena(type));
        g.clearRect(0,0,layer.width,layer.height);
        const h={age:.95,warning:1.2,fullSeal:true,gapY:player.y,gapSize:player.height*2.7};
        drawPressureSealWarning(g,h,false);
        let abrupt=0,count=0;
        // Compare adjacent scanlines along the exact former flight rectangle.
        for(const edge of [flightBounds.top,flightBounds.bottom]){
          const y=clamp(Math.floor(edge)-1,0,layer.height-3);
          const data=g.getImageData(0,y,layer.width,3).data;
          for(let x=12;x<layer.width-12;x++){count++;const k=x*4+3;
            if(Math.abs(data[k]-data[k+layer.width*8])>9)abrupt++;}
        }
        const globalHit=pressureSealHitsPlayer(h);h.fullSeal=false;
        const safe=!pressureSealHitsPlayer(h);h.gapY+=h.gapSize;
        const outside=pressureSealHitsPlayer(h);
        g.clearRect(0,0,layer.width,layer.height);
        drawMechanicZone(g,50,50,300,120,signatureMaterials[pressureMaterialNames[type]].rim,true,false);
        const alpha=(x,y)=>g.getImageData(x,y,1,1).data[3];
        rows.push({boss:type+1,edgeJumpFraction:abrupt/count,corner:alpha(50,50),center:alpha(200,110),globalHit,safe,outside});
      }
      return rows;
    });
    assert.deepEqual(errors,[]);
    assert.ok(samples.every(s=>s.edgeJumpFraction<.025 && s.corner<=3 && s.center>10 && s.globalHit && s.safe && s.outside),JSON.stringify(samples));
    fs.writeFileSync(path.join(out,"field-edges.json"),JSON.stringify({samples,errors},null,2));console.log("PASS all 11 seals, mechanic fields and collision checks");
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
