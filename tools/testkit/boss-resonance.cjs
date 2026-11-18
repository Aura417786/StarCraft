"use strict";
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");

(async () => {
  const game = path.resolve(process.argv[2] || ".");
  const out = path.resolve(process.argv[3] || "../GPT62-Evidence/Boss");
  fs.mkdirSync(out, {recursive:true});
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH});
  try {
    const {page, errors} = await createPage(browser, game, true);
    await page.addScriptTag({path:path.resolve(__dirname, "nextgen-combat-scenarios.js")});
    const report = [];
    for (const size of [{width:960,height:540},{width:1440,height:900},{width:430,height:820}]) {
      await page.setViewportSize(size);
      const rows = await page.evaluate(() => {
        return Array.from({length:11}, (_,type) => {
          const b = nextgenStage(type,{enraged:true});
          prepareAlienAttack(b,false);
          const h = bossHazards.find(item => item.kind === "resonance");
          if (!h) throw Error("Missing fracture response for Boss " + (type+1));
          const tell = h.warning - h.tellAt, room = mechanicRoom();
          const exits=[[room.left,h.y],[room.right,h.y],[h.x,room.top],[h.x,room.bottom]];
          exits.sort((a,b)=>Math.hypot(b[0]-h.x,b[1]-h.y)-Math.hypot(a[0]-h.x,a[1]-h.y));
          const [safeX,safeY]=exits[0];
          // A real movement-budget trace from the locked point: move during the
          // tell at 65% of normal speed, then hold the reached position.
          const delta=Math.hypot(safeX-h.x,safeY-h.y)||1;
          const reach=Math.min(delta,player.speed*.65*(tell-.20));
          const exitX=h.x+(safeX-h.x)*reach/delta,exitY=h.y+(safeY-h.y)*reach/delta;
          let contacts=0, routeHits=0, early=0;
          for(let i=0;i<31;i++){
            h.age=h.warning+h.duration*i/31;
            player.x=exitX;player.y=exitY;
            if(alienHazardHitsPlayer(h))routeHits++;
            for(let iy=-5;iy<=5;iy++){
              player.y=h.y + h.radius*iy/5;

              for(let ix=-5;ix<=5;ix++){
                player.x=h.x+h.radius*ix/5;
                if(alienHazardHitsPlayer(h))contacts++;
              }
            }
          }
          h.age=h.warning-.01;player.x=h.x;player.y=h.y;
          if(alienHazardHitsPlayer(h))early++;
          const final=nextgenStage(type,{finale:true});
          final.hp=.32;updateBossFinale(final,.01);
          const reply=final.finale.hazards.find(item=>item.type==="resonance");
          const unlocked=!!reply && reply.mature && reply.comboStage===2;
          showScreen("menu");
          return {type,unlocked,tell,contacts,routeHits,early,arena:[room.left,room.right,room.top,room.bottom],lock:[h.x,h.y,h.radius],hitRadius:player.height*.16};
        });
      });
      for(const row of rows) {
        assert.equal(row.unlocked,true);
        assert.ok(row.tell>=1.29);
        assert.ok(row.contacts>10);
        assert.equal(row.early,0);
        assert.equal(row.routeHits,0,JSON.stringify({size,row}));
      }
      report.push({size,rows});
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,"resonance-contracts.json"),JSON.stringify({report,errors},null,2));
    console.log("33 arena/identity scenarios passed.");
  } finally {await browser.close();}
})().catch(error => { console.error(error); process.exitCode=1; });
