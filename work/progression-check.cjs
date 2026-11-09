const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const listeners = new WeakMap();
const document = { activeElement: null, hidden: false };
function on(type, callback) {
  let events = listeners.get(this);
  if (!events) { events = new Map(); listeners.set(this, events); }
  if (!events.has(type)) events.set(type, []);
  events.get(type).push(callback);
}
function emit(target, type, extra = {}) {
  const event = { prevented: false, preventDefault() { this.prevented = true; }, ...extra };
  for (const callback of listeners.get(target)?.get(type) ?? []) callback(event);
  return event;
}
const nodes = new Map();
for (const id of ['game-canvas', 'start-screen', 'battle-screen', 'start-button', 'menu-button', 'status', 'movement-hint', 'game-app', 'fullscreen-button', 'fighter-art', 'asset-status', 'pause-hint', 'score', 'battle-clock', 'enemy-strength', 'player-lives', 'shield-status', 'game-over-screen', 'restart-button', 'result-menu-button', 'final-score', 'final-time', 'final-kills', 'weapon-speed', 'weapon-lanes', 'weapon-damage', 'powerup-notice', 'boss-hud', 'boss-name', 'boss-action', 'sound-button', 'boss-warning', 'boss-warning-name', 'ultimate-hud', 'ultimate-count', 'ultimate-meter', 'ultimate-fill', 'ultimate-label', 'shield-hud', 'shield-count', 'shield-meter', 'shield-fill', 'shield-label']) {
  nodes.set('#' + id, {
    hidden: false, disabled: false, inert: false, dataset: {}, style: {}, attributes: {}, addEventListener: on, setAttribute(name,value) { this.attributes[name]=value; },
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); },
    removeAttribute(name) { delete this.attributes[name]; },
    focus() {
      if (document.activeElement && document.activeElement !== this) emit(document.activeElement, 'blur');
      document.activeElement = this;
      emit(this, "focus");
    },
  });
}
function mockNode() {
  return { hidden: false, disabled: false, inert: false, dataset: {}, style: {}, attributes: {}, textContent: '', addEventListener: on,
    setAttribute(name,value) { this.attributes[name]=value; },
    getAttribute(name) { return this.attributes[name] ?? null; },
    hasAttribute(name) { return Object.hasOwn(this.attributes,name); },
    removeAttribute(name) { delete this.attributes[name]; },
    contains(node) { return this === node; },
    focus() { if(document.activeElement && document.activeElement!==this) emit(document.activeElement,'blur'); document.activeElement=this; emit(this,'focus'); emit(document,'focusin',{target:this}); },
  };
}
const evolutionCards = ['pierce','blast','aegis'].map(kind => {
  const card=mockNode(); card.dataset.choice=kind;
  const children=new Map(['level','title','effect','art','action'].map(name=>['.evolution-card-'+name,mockNode()]));
  card.querySelector=selector=>children.get(selector);
  nodes.set('#evolution-card-'+kind,card);
  return card;
});
for(const id of ['evolution-screen','evolution-title','evolution-description','evolution-readout']) nodes.set('#'+id,mockNode());
for(const id of ['momentum-hud','combo-count','combo-best','combo-fill','rage-label','final-combo','combo-meter','combo-caption','stance-button','shake-button']) nodes.set('#'+id,mockNode());
nodes.get('#evolution-screen').contains=node=>node===nodes.get('#evolution-screen')||evolutionCards.includes(node);
const canvas = nodes.get('#game-canvas');
canvas.width = 1280;
canvas.height = 720;
let surface = { width: 1280, height: 720 };
canvas.getBoundingClientRect = () => surface;
nodes.get('#fighter-art').complete = true;
nodes.get('#fighter-art').naturalWidth = 1536;
canvas.getContext = () => new Proxy({}, {
  get: (target,name) => name in target ? target[name]
    : () => (name==='createLinearGradient'||name==='createRadialGradient') ? {addColorStop(){}} : undefined,
});
document.querySelector = (selector) => nodes.get(selector);
const slots = Array.from({length:5},()=>({dataset:{}}));
const protectionSlots = Array.from({length:2},()=>({dataset:{}}));
document.querySelectorAll = selector => selector === ".ultimate-slot" ? slots : selector === ".shield-slot" ? protectionSlots : selector === '.evolution-card' ? evolutionCards : [];
document.addEventListener = on;
let animationCallback;
let now = 100;
const window = {
  addEventListener: on, matchMedia: () => ({ matches: false }),
  requestAnimationFrame(callback) { animationCallback = callback; },
};
const audioCalls=[];
const gameAudio={ muted:false,
  sync(...args){audioCalls.push({name:'sync',args});},
  unlock(){audioCalls.push({name:'unlock',args:[]});},
  setMuted(value){this.muted=value;audioCalls.push({name:'setMuted',args:[value]});},
  shoot(...args){audioCalls.push({name:'shoot',args});},
  explode(...args){audioCalls.push({name:'explode',args});},
  warning(){audioCalls.push({name:'warning',args:[]});},
  chargeUltimate(...args){audioCalls.push({name:'chargeUltimate',args});},
  fireUltimate(){audioCalls.push({name:'fireUltimate',args:[]});},
  stopUltimate(){audioCalls.push({name:'stopUltimate',args:[]});},
  bossAttack(...args){audioCalls.push({name:'bossAttack',args});},
  bossEnrage(){audioCalls.push({name:'bossEnrage',args:[]});},
  overdrive(){audioCalls.push({name:'overdrive',args:[]});},
  perfectShield(){audioCalls.push({name:'perfectShield',args:[]});},
};
const sandbox = vm.createContext({ document, window, Math, Number, Set, gameAudio });
for (const file of [...fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').matchAll(/<script src="([^"]+)" defer>/g)].map(match => match[1]).filter(file => file !== 'audio.js')) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
function step(seconds = 0.05) { now += seconds * 1000; animationCallback(now); }
// 各旧功能用例隔离自动刷新的事件；v13-check 会显式开启新事件计时。
function begin() { emit(window, 'focus'); emit(nodes.get('#start-button'), 'click'); vm.runInContext('powerupCooldown = 999; enemyCooldown = 999; nextBossTime = Infinity; formationState.nextTime = Infinity; battlefieldEvents.nextObject = Infinity; battlefieldEvents.nextTransport = Infinity; if(typeof aceEncounter!=="undefined")aceEncounter.nextTime=Infinity;', sandbox); step(); }
function key(code, type = 'keydown', extra) { return emit(window, type, { code, ...extra }); }
let checks = 0;
let failedChecks = 0;
function check(name, test) {
  try { test(); checks++; process.stdout.write('PASS ' + name + '\n'); }
  catch(error) { failedChecks++; process.stderr.write('FAIL ' + name + ': ' + error.message + '\n'); }
}

const execute = code => vm.runInContext(code, sandbox);
const snapshot = code => JSON.parse(execute('JSON.stringify(' + code + ')'));
function near(actual, expected, epsilon = 1e-8) { assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`); }
function isolated(extra = '') {
  document.hidden = false; surface = { width: 1280, height: 720 };
  execute('reducedMotion.matches=false;');
  begin(); execute('resizeBattlefield();'); canvas.focus();
  execute(`enemyCooldown=999;powerupCooldown=999;nextBossTime=Infinity;shotCooldown=999;
    formationState.nextTime=Infinity;battlefieldEvents.nextObject=Infinity;battlefieldEvents.nextTransport=Infinity;
    enemies.length=0;bullets.length=0;powerups.length=0;enemyProjectiles.length=0;bossProjectiles.length=0;
    battleTime=0;score=0;kills=0;bossHitGrace=0;resetUltimate();` + extra);
  execute('previousTime='+now+';');
}
function activeBoss(type = 0, duo = false) {
  isolated(`battleTime=95;spawnBoss(${type}${duo ? ',( '+type+' + 1)%5' : ''});
    for(const t of activeBosses()){Object.assign(t,${duo ? 'duoArena(t.slot)' : 'bossArena()'});t.previousX=t.x;t.previousY=t.y;t.phase='recover';ensureBossComponents(t);}
    if(duoEncounter){duoEncounter.phase='recover';duoEncounter.time=0;}`);
}
function setEnemy(x = 800, y = 350, hp = 100) {
  execute(`spawnEnemy('scout');var target=enemies.at(-1);Object.assign(target,{x:${x},previousX:${x},y:${y},previousY:${y},waveAmplitude:0,healthLog:Math.log(${hp})});`);
}
function supportFrames(count) {
  execute(`for(let frame=0;frame<${count};frame++)updateEvolutionWeapons(.05);`);
}
function advanceFrames(count) {
  for(let frame=0;frame<count;frame++) step();
}
function shieldContacts(count, family = 'enemyProjectiles') {
  execute(`for(let index=0;index<${count};index++)${family}.push({
    x:player.x,y:player.y,previousX:player.x,previousY:player.y,radius:6,vx:0,vy:0,age:0
  });`);
}

check('sweeping a red orb improves main fire without raising the health of same-stage arrivals', () => {
  isolated('battleTime=96;spawnEnemy("armored");');
  const before=snapshot('({health:enemies[0].healthLog,damage:weaponDamageLog()})');
  execute(`powerups.push({type:"red",x:player.x+240,previousX:player.x+240,y:player.y,previousY:player.y,radius:16});
    shotCooldown=renderShotCooldown=0;updateShooting(0);shotCooldown=999;updateShooting(.4);resolveProjectileHits();spawnEnemy("armored");`);
  assert.equal(execute('powerups.length'),0);
  assert.equal(execute('enemies[0].healthLog'),before.health);
  assert.equal(execute('enemies[1].healthLog'),before.health);
  assert.ok(execute('weaponDamageLog()')>before.damage);
  execute('enemies.length=0;spawnEnemy("armored");enemies[0].x=enemies[0].previousX=player.x+260;enemies[0].y=enemies[0].previousY=player.y;shotCooldown=0;renderShotCooldown=0;updateShooting(0);shotCooldown=999;updateShooting(.45);resolveProjectileHits();');
  near(execute('1-enemies[0].hp'),2*Math.exp(-before.health));
});
check('ace, transport and dual Boss births use the same stage after a player upgrades', () => {
  function sample(gear) {
    isolated('battleTime=420;'+gear);
    return snapshot(`(()=>{const ace=spawnAceEnemy().healthLog;resetAceEncounter();enemies.length=0;
      const transport=spawnSupplyTransport().healthLog;spawnBoss(0,1);
      return [ace,transport,boss.healthLog,wingBoss.healthLog];})()`);
  }
  const baseline=sample('');
  const reinforced=sample('for(let i=0;i<10;i++){applyPowerup("blue");applyPowerup("yellow");applyPowerup("red");}');
  assert.ok(baseline.every(Number.isFinite));
  assert.deepEqual(reinforced,baseline);
});
check('the independent firepower curve grows without a jump at thirty-second boundaries', () => {
  isolated();
  let before=execute('progressionReferenceDpsLog(0)');
  for(let boundary=30;boundary<=1800;boundary+=30) {
    const left=execute(`progressionReferenceDpsLog(${boundary-.001})`);
    const right=execute(`progressionReferenceDpsLog(${boundary+.001})`);
    assert.ok(left>before&&right>left&&right-left<.001);
    before=right;
  }
});
check('high-rate three-beat fire holds every scheduled shot while bounding visible packets', () => {
  for(const fps of [20,60,144]) {
    isolated('weapon.speedLevel=8;weapon.interval=.01;weapon.lanes=4;resetWeapons();updateShooting(0);');
    execute(`for(let frame=0;frame<${fps};frame++)updateShooting(1/${fps});`);
    near(execute('bullets.reduce((damage,shot)=>damage+shot.damage,0)+pendingShots*weapon.lanes*projectileDamage()'),404);
    assert.ok(execute('bullets.length')<72);
    assert.ok(execute('bullets.some(shot=>shot.damage>=10)'));
  }
});
check('extreme timed blue, red and yellow upgrades retain finite projectiles and readable indicators', () => {
  isolated('battleTime=180000000;weapon.lanes=4;applyPowerup("blue");applyPowerup("red");applyPowerup("yellow");resetWeapons();updateShooting(0);');
  near(execute('1/weapon.interval'),200);
  assert.ok(execute('weapon.rateOverflow>0&&weapon.damageOverflow>0'));
  assert.ok(execute('bullets.length>0&&bullets.every(shot=>Number.isFinite(shot.damageLog)&&Number.isFinite(shot.damage))'));
  for(const id of ['weapon-speed','weapon-damage','weapon-lanes','powerup-notice']) {
    assert.doesNotMatch(nodes.get('#'+id).textContent,/Infinity|NaN/);
  }
  const peak=execute('weaponDamageLog()');
  execute('applyPowerup("blue");applyPowerup("red");');
  assert.ok(execute('weaponDamageLog()')>peak);
});
check('the first wing upgrade deploys two working mounts and higher ranks charge and fire lance rounds', () => {
  isolated('openEvolutionChoice();chooseEvolution("pierce");');
  supportFrames(3);
  const wing=snapshot('bullets.filter(shot=>shot.visual==="wing").map(({x,y})=>({x,y}))');
  const muzzles=snapshot('getEvolutionWingMuzzles().map(({x,y})=>({x,y}))');
  assert.deepEqual(wing,muzzles);
  assert.equal(execute('bullets.some(shot=>shot.visual==="lance")'),false);
  execute('openEvolutionChoice();chooseEvolution("pierce");');
  supportFrames(16);
  assert.ok(execute('evolutionWeapons.lanceCharging'));
  supportFrames(10);
  assert.equal(execute('bullets.filter(shot=>shot.visual==="lance").length'),2);
  const rank2=execute('bullets.find(shot=>shot.visual==="lance").damageLog');
  execute('openEvolutionChoice();chooseEvolution("pierce");');
  supportFrames(26);
  assert.equal(execute('bullets.filter(shot=>shot.visual==="lance").length'),2);
  assert.ok(execute('bullets.find(shot=>shot.visual==="lance").damageLog')>rank2);
});
check('full frames allow Falcon support during a cannon charge without firing the player mounts', () => {
  isolated('evolution.pierce=3;evolution.blast=2;ultimate.charges=1;');
  assert.ok(key('Space').prevented);
  advanceFrames(9);
  assert.equal(execute('ultimate.phase'),'charging');
  assert.equal(execute('bullets.length'),2);
  assert.ok(execute('bullets.every(shot=>shot.visual==="drone")'));
  key('Space','keyup');
});
check('the support projectile cap leaves room for main fire and resets after restart', () => {
  isolated('evolution.pierce=evolution.blast=3;');
  supportFrames(2000);
  assert.equal(execute('bullets.filter(shot=>shot.auxiliary).length'),96);
  execute('shotCooldown=renderShotCooldown=0;updateShooting(0);');
  assert.equal(execute('bullets.filter(shot=>!shot.auxiliary).length'),1);
  execute('endGame();');
  emit(nodes.get('#restart-button'),'click'); step();
  assert.equal(execute('bullets.filter(shot=>shot.auxiliary).length'),0);
  assert.deepEqual(snapshot('[evolution.pierce,evolution.blast,evolution.aegis,evolution.refits]'),[0,0,0,0]);
});
check('an actual wing lance can damage a Boss weapon with the component transfer rule', () => {
  activeBoss();
  execute(`const upperPart=boss.components[0], upperBounds=bossComponentBounds(boss,upperPart);
    spawnEvolutionRound({x:upperBounds.x-160,y:upperBounds.y},"lance",.8,{pierces:3});`);
  const damage=execute('Math.exp(bullets[0].damageLog-boss.healthLog)');
  execute('updateShooting(.22);resolveProjectileHits();resolveProjectileHits();');
  near(execute('boss.components[0].hp'),.13-damage);
  near(execute('boss.components[1].hp'),.13);
  near(execute('boss.hp'),1-damage*.8);
});
check('each Aegis rank absorbs only its physical-contact limit and releases once at shield expiry', () => {
  for(const [rank,limit] of [[1,3],[2,5],[3,8]]) {
    isolated(`evolution.aegis=${rank};shield.charges=1;requestShield();updateShield(.3);`);
    shieldContacts(5); shieldContacts(5,'bossProjectiles');
    execute('updateEnemyProjectileDamage();updateBossDamage();');
    assert.equal(execute('evolutionWeapons.absorbed.length'),limit);
    assert.equal(execute('enemyProjectiles.length+bossProjectiles.length'),0);
    assert.equal(execute('bullets.length'),0);
    execute('updateShield(1.699);');
    assert.equal(execute('bullets.length'),0);
    execute('updateShield(.001);updateShield(.1);');
    assert.equal(execute('bullets.length'),limit);
    assert.equal(execute('evolutionWeapons.absorbed.length'),0);
    assert.ok(execute('bullets.every(shot=>shot.visual==="counter"&&shot.noEnergy)'));
  }
});
check('opening clear radius and beam hazards do not count as extra shield captures', () => {
  activeBoss();
  execute(`evolution.aegis=3;shield.charges=1;bossHitGrace=0;
    enemyProjectiles.push({x:player.x+200,previousX:player.x,y:player.y,previousY:player.y,radius:6,vx:0,vy:0,age:0});`);
  shieldContacts(1);
  execute(`requestShield();addBossHazard("beam",{y:player.y,warning:0,duration:2});
    updateBossDamage();updateEnemyProjectileDamage();`);
  assert.equal(execute('evolutionWeapons.absorbed.length'),1);
  assert.equal(execute('enemyProjectiles.length'),0);
  assert.equal(execute('player.lives'),3);
  assert.equal(execute('shield.perfectUsed'),true);
});
check('paused and resized shields retain stored shots until the resumed shield actually ends', () => {
  isolated('evolution.aegis=3;shield.charges=1;requestShield();updateShield(.3);');
  shieldContacts(2);
  execute('updateEnemyProjectileDamage();');
  emit(window,'blur'); advanceFrames(12);
  assert.equal(execute('evolutionWeapons.absorbed.length'),2);
  near(execute('shield.remaining'),1.7);
  surface={width:1024,height:640}; emit(window,'resize');
  assert.equal(execute('evolutionWeapons.absorbed.length'),2);
  assert.equal(execute('bullets.length'),0);
  emit(window,'focus'); canvas.focus(); execute('updateShield(1.7);');
  assert.equal(execute('bullets.length'),2);
});
check('Phalanx provides temporary synchronized salvos after shielding and returns to ordinary rounds', () => {
  isolated('evolution.blast=2;evolution.aegis=3;evolution.links.phalanx=true;shield.charges=1;requestShield();');
  supportFrames(2);
  assert.equal(execute('bullets.filter(shot=>shot.visual==="drone").length'),6);
  supportFrames(50);
  assert.equal(execute('evolutionWeapons.shieldLinkRemaining'),0);
  execute('bullets.length=0;');
  supportFrames(10);
  assert.equal(execute('bullets.filter(shot=>shot.visual==="drone").length'),2);
});
check('Lance link upgrades a stored shield shot and a later fire refit increases the real damage', () => {
  function attack(linked, refit) {
    isolated(`evolution.pierce=evolution.blast=evolution.aegis=3;evolution.links.lance=${linked};`);
    if(refit) execute('evolution.links.falcon=evolution.links.phalanx=true;openEvolutionChoice();chooseEvolution("refit-fire");bossHitGrace=0;');
    execute('shield.charges=1;requestShield();updateShield(.3);');
    shieldContacts(1); execute('updateEnemyProjectileDamage();updateShield(1.7);');
    const projectile=snapshot('bullets[0]');
    setEnemy(projectile.x+180,projectile.y,100);
    setEnemy(projectile.x+320,projectile.y,100);
    execute('updateShooting(.5);resolveProjectileHits();resolveProjectileHits();');
    near(execute('ultimate.energy'),0);
    return snapshot('enemies.map(enemy=>1-enemy.hp)');
  }
  const regular=attack(false,false), linked=attack(true,false), refit=attack(true,true);
  near(regular[1],0);
  near(linked[0]/regular[0],1.5);
  near(linked[1],linked[0]);
  near(refit[0]/linked[0],1.08);
  near(refit[1],refit[0]);
});
check('changing tier emits a stronger differently shaped packet without mutating the original shot', () => {
  isolated('weapon.lanes=4;firingStyle.mode="focus";resetWeapons();updateShooting(0);');
  const old=snapshot('bullets[0]'), beforeSound=audioCalls.filter(call=>call.name==='shoot').at(-1);
  execute('applyPowerup("yellow");shotCooldown=0;renderShotCooldown=0;updateShooting(0);');
  const all=snapshot('bullets'), fresh=all.at(-1);
  assert.deepEqual(all[0],old);
  near(fresh.damage/old.damage,1.12);
  assert.ok(fresh.length>old.length);
  assert.notEqual(fresh.color,old.color);
  assert.deepEqual(beforeSound.args,[false,1]);
  assert.deepEqual(audioCalls.filter(call=>call.name==='shoot').at(-1).args,[false,2]);
});

process.stdout.write('\n'+checks+' progression integration checks passed, '+failedChecks+' failed.\n');
if (failedChecks) process.exitCode=1;
