"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

async function main() {
  const out = path.resolve(process.argv[3]);
  fs.mkdirSync(out, {recursive:true});
  const browser = await chromium.launch({ executablePath:process.env.CHROME_PATH, headless:true });
  try {
    const { page, errors } = await createPage(browser, path.resolve(process.argv[2]), false);
    const result = await page.evaluate(() => {
      showScreen("battle", {seed:4225});
      const c = document.createElement("canvas");
      c.width = 420; c.height = 250;
      const ctx = c.getContext("2d", {willReadFrequently:true});
      function sample(fighter) {
        sortieFighter = fighter; shield.remaining = 1.65; shield.duration = 2;
        player.x = player.previousX = 200; player.y = player.previousY = 125;
        context.save();
        context.clearRect(0,0,viewport.width,viewport.height); drawShield(1); context.restore();
        ctx.clearRect(0,0,c.width,c.height); ctx.drawImage(canvas,0,0,viewport.width,viewport.height);
        return ctx.getImageData(0,0,c.width,c.height).data;
      }
      const red = sample("red"), blue = sample("blue"), gold = sample("yellow");
      function difference(a,b) {
        let count = 0;
        for(let i=0;i<a.length;i+=4) if(Math.max(...[0,1,2].map(k=>Math.abs(a[i+k]-b[i+k]))) > 20) count++;
        return count;
      }
      return { redBluePixels:difference(red,blue), blueGoldPixels:difference(blue,gold), redGoldPixels:difference(red,gold) };
    });
    assert.ok(Object.values(result).every(count=>count>100),JSON.stringify(result));
    const labels = await page.evaluate(() => {
      const rows=[];
      for (const language of ["zh-CN","en"]) {
        setGameLanguage(language);
        for (const id of ["red","blue","yellow"]) {
          sortieFighter=id;updateShieldDisplay();
          rows.push([shieldName.textContent,shieldPanel.getAttribute("aria-label")]);
        }
      }
      return rows;
    });
    assert.deepEqual(labels.map(row=>row[0]), ["赤焰护盾","苍电弧盾","曜金晶盾","Crimson Shield","Arc Shield","Auric Aegis"]);
    assert.ok(labels.every(([visible,accessible])=>accessible.includes(visible)));
    const samples = await page.evaluate(() => {
      selectedFighter="blue";showScreen("battle",{fighter:"blue",seed:4225});
      const points=[[485,215],[590,160],[610,300]];
      const targets=points.map(([x,y])=>({x,y,width:60,height:45,hp:80,maxHp:80}));
      enemies.length=0; enemies.push(...targets);
      const shot={x:485,y:215,damage:2,damageLog:Math.log(2),hitTargets:new Set([targets[0]]),seeker:{}};
      for(let i=0;i<3;i++)onFighterProjectileImpact(shot,targets[0]);
      const probe=document.createElement("canvas");probe.width=720;probe.height=380;
      const c=probe.getContext("2d",{willReadFrequently:true});
      return [.072,.081,.081].map(dt=>{
        updateFighterCombat(dt);c.clearRect(0,0,720,380);FighterMaterialFx.drawWeapons(c,"blue",fighterCombat);
        return points.map(([x,y])=>{
          const bits=c.getImageData(x-14,y-15,29,31).data;
          let lit=0;
          for(let k=0;k<bits.length;k+=4)if(bits[k+2]>100&&bits[k+3]>18)lit++;
          return lit;
        });
      });
    });
    assert.ok(samples[0][0]>10&&samples[0][1]===0&&samples[0][2]===0,JSON.stringify(samples));
    assert.ok(samples[1][1]>10&&samples[1][2]===0,JSON.stringify(samples));
    assert.ok(samples[2][2]>10,JSON.stringify(samples));
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out,"shield-materials.json"),JSON.stringify({result,labels,chainPixels:samples,errors},null,2));
    console.log({result,labels,samples});
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
