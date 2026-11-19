"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createPage } = require("./balance.cjs");
const { openHangarPage, closeHangarPage } = require("./hangar-test-controls.cjs");

const game = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);

async function testSortie(browser, fighter, difficulty, firstTraining, legacyProfile) {
  const {page, errors} = await createPage(browser, game, false, {flightTraining:firstTraining});
  try {
    const introRequests = [];
    page.on("request",request=>{
      const pathname=new URL(request.url()).pathname;
      if (/\/(?:assets\/intro\/|vendor\/cinematic\/|opening[-.])/.test(pathname)) introRequests.push(pathname);
    });
    if (legacyProfile) {
      await page.evaluate(()=>localStorage.setItem("star-breaker-opening-seen","1"));
    }
    await page.reload({waitUntil:"load"});
    await page.bringToFront();
    await page.evaluate(()=>{
      flightControls.autofire = false;
    });
    assert.equal(await page.locator("#replay-intro-button").count(),0);
    await openHangarPage(page,"loadout");
    await page.locator(`#fighter-picker label[data-fighter="${fighter}"]`).click();
    await closeHangarPage(page,"loadout");
    await page.locator(`#hangar-difficulty label:has(input[value="${difficulty}"])`).click();
    await page.locator("#start-button").click();
    await page.waitForFunction(()=>state==="battle",null,{timeout:5000});
    const launch=await page.evaluate(()=>({
      fighter:sortieFighter,difficulty:sortieStats.difficulty,
      lives:player.lives,expectedLives:startingPlayerLives,score,
      ultimate:{kind:ultimate.kind,phase:ultimate.phase,fired:Boolean(ultimate.shot),charges:ultimate.charges},
      training:flightTutorial?.stage??null,focus:document.activeElement?.id,
      openingDialog:Boolean(document.querySelector("#campaign-opening")),
      hasOpeningApi:typeof window.campaignOpening!=="undefined",
    }));
    assert.equal(launch.fighter,fighter);
    assert.equal(launch.difficulty,difficulty);
    assert.equal(launch.lives,launch.expectedLives);
    assert.equal(launch.score,0);
    assert.deepEqual(launch.ultimate,{kind:null,phase:"idle",fired:false,charges:0});
    assert.equal(launch.training,firstTraining?1:null);
    assert.equal(launch.focus,"game-canvas");
    assert.equal(launch.openingDialog,false);
    assert.equal(launch.hasOpeningApi,false);
    const y=await page.evaluate(()=>player.y);
    await page.keyboard.down("ArrowUp");
    await page.waitForFunction(previous=>player.y<previous-8,y);
    await page.keyboard.up("ArrowUp");
    assert.deepEqual(introRequests,[]);
    assert.deepEqual(errors,[]);
    return {launch,legacyProfile,keyboardMovement:true,introRequests};
  } finally {
    await page.close();
  }
}

async function main() {
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  try {
    const fighters={};
    for (const [fighter,difficulty,training,legacy] of [
      ["red","easy",true,false],
      ["blue","normal",false,true],
      ["yellow","hard",false,false],
    ]) {
      fighters[fighter]=await testSortie(browser,fighter,difficulty,training,legacy);
      console.log(fighter+" starts the campaign directly");
    }
    fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,"sortie-start.json"),JSON.stringify({fighters},null,2)+"\n");
  } finally {
    await browser.close();
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
