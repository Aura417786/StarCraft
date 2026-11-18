"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

(async () => {
  const root = path.resolve(process.argv[2] || ".");
  const out = path.resolve(process.argv[3]);
  fs.mkdirSync(out, {recursive:true});
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH, args:["--use-angle=d3d11"]});
  try {
    const { page, errors } = await createPage(browser, root, false);
    const result = await page.evaluate(async () => {
      showScreen("battle", {seed:77135});
      const device = spacePropGraphics();
      if (!device) throw Error("WebGL surface unavailable for material comparison");
      await device.detail.decode();
      const atlas = document.createElement("canvas");
      atlas.width = 480; atlas.height = 260;
      const paint = atlas.getContext("2d", {willReadFrequently:true});
      const shots = {};
      const samples = {};
      for (const light of ["ambient", "water", "beam"]) {
        sceneLightFrame.count = 0;
        if (light === "water") addSceneLightSource(210,140,330,"#7feaff",.86,210,"water");
        if (light === "beam") addSceneLightSource(15,130,160,"#ff763a",.86,450);
        paint.fillStyle = "#141f30"; paint.fillRect(0,0,480,260);
        for (const [x,kind] of [[125,"rock"],[355,"wreck"]]) {
          drawSpaceProp(paint,kind,{x,y:132,width:224,height:210,variant:1,alpha:1,sector:0,pitch:.51,yaw:.76,roll:.33});
        }
        shots[light] = atlas.toDataURL("image/png").split(",")[1];
        samples[light] = paint.getImageData(0,0,480,260).data;
      }
      const changedPixels = {};
      for (const key of ["water","beam"]) {
        let changed = 0;
        for (let i=0; i<samples.ambient.length; i+=4) {
          let rgb=0;
          for(let c=0;c<3;c++) rgb+=Math.abs(samples[key][i+c]-samples.ambient[i+c]);
          if(rgb>8) changed++;
        }
        changedPixels[key] = changed;
      }
      const species = [];
      for(let type=0;type<11;type++) {
        spawnBoss(type); resetBossPresentation();
        Object.assign(boss,{phase:"attack",phaseTime:.4});
        const hazard={kind:"resonance",age:.7,warning:1,duration:1.74,attackLabel:boss.attackLabel};
        bossHazards.splice(0,bossHazards.length,hazard);
        const read=()=>bossActionPose(boss);
        const pre=read(); hazard.age=1.045;
        const rupture=read(), quiet=bossActionPose(boss,true);
        hazard.age=1.21; const echo=read();
        hazard.age=2.68; const spent=read();
        species.push({type,pre:pre.tissuePulse,rupture:rupture.tissuePulse,shellEarly:rupture.shellPulse,shellLater:echo.shellPulse,
          quiet:quiet.tissuePulse,spent:spent.tissuePulse,translation:rupture.x-spent.x,bank:rupture.bank-spent.bank});
      }
      return {shots, changedPixels, species};
    });
    for(const [key, data] of Object.entries(result.shots)) fs.writeFileSync(path.join(out,key+".png"),Buffer.from(data,"base64"));
    delete result.shots;
    for(const count of Object.values(result.changedPixels)) assert.ok(count>1000);
    assert.ok(result.species.every(s=>!s.pre && s.rupture>.2 && !s.shellEarly && s.shellLater>.15 && !s.quiet && !s.spent));
    assert.equal(new Set(result.species.map(s=>s.translation.toFixed(3)+"/"+s.bank.toFixed(3))).size,11);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,"response.json"),JSON.stringify({...result,errors},null,2));
    console.log(JSON.stringify(result.changedPixels), result.species.length, "discharge profiles");
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
