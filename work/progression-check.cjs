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
nodes.set('#game-over-title', mockNode());
const resultIntro = mockNode();
nodes.get('#game-over-screen').querySelector = selector => selector === '.result-intro' ? resultIntro : undefined;
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
for (const file of [...fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').matchAll(/<script src="([^"]+)" defer>/g)].map(match => match[1]).filter(file => file !== 'audio.js' && !file.startsWith('vendor/'))) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
function step(seconds = 0.05) { now += seconds * 1000; animationCallback(now); }
// 成长曲线用同一火力基准比较，不受出击机型影响。
function begin() {
  emit(window, 'focus');
  emit(nodes.get('#start-button'), 'click');
  vm.runInContext(`weapon.damage = 1; weapon.interval = 0.2;
    powerupCooldown = 999; enemyCooldown = 999; nextBossTime = Infinity;
    formationState.nextTime = Infinity; battlefieldEvents.nextObject = Infinity;
    battlefieldEvents.nextTransport = Infinity; aceEncounter.nextTime = Infinity;`, sandbox);
  step();
}
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
function activeBoss(type = 0, time = 95) {
  isolated(`battleTime=${time};spawnBoss(${type});Object.assign(boss,bossArena());
    boss.previousX=boss.x;boss.previousY=boss.y;boss.phase='recover';`);
}
function setEnemy(x = 800, y = 350, hp = 100) {
  execute(`spawnEnemy('scout');var target=enemies.at(-1);Object.assign(target,{x:${x},previousX:${x},y:${y},previousY:${y},waveAmplitude:0,healthLog:Math.log(${hp})});`);
}
function placeWaveTarget(kind, distance = 300) {
  execute(`{
    spawnEnemy(${JSON.stringify(kind)});
    const target = enemies.at(-1);
    target.x = target.previousX = player.x + ${distance};
    target.y = target.previousY = player.y;
  }`);
}
function fireSinglePacket() {
  execute('shotCooldown=renderShotCooldown=0;updateShooting(0);shotCooldown=999;');
  const packet = snapshot('bullets.at(-1)');
  execute('updateShooting(.45);resolveProjectileHits();');
  return packet;
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

check('a first red orb adds 0.8 damage without changing an existing enemy’s durability', () => {
  isolated('battleTime=96;');
  placeWaveTarget('armored');
  const originalHealth = execute('enemies[0].healthLog');
  const originalPacket = fireSinglePacket();
  const healthAfterOriginal = execute('enemies[0].hp');
  assert.ok(healthAfterOriginal < 1 && healthAfterOriginal > 0);
  execute('powerups.push({type:"red",x:player.x+180,previousX:player.x+180,y:player.y,previousY:player.y,radius:16});');
  fireSinglePacket();
  assert.equal(execute('powerups.length'),0);
  assert.equal(execute('enemies[0].hp'), healthAfterOriginal);
  const upgradedPacket = fireSinglePacket();
  near(healthAfterOriginal - execute('enemies[0].hp'), 1.8 * (1 - healthAfterOriginal));
  assert.ok(upgradedPacket.length > originalPacket.length && upgradedPacket.halfHeight > originalPacket.halfHeight);
  execute('spawnEnemy("armored");');
  assert.deepEqual(snapshot('enemies.map(enemy=>enemy.healthLog)'), [originalHealth, originalHealth]);
});
check('first blue and yellow orbs add real firing cadence and independent symmetric lanes', () => {
  function fire(type) {
    isolated();
    if (type) {
      execute(`powerups.push({type:${JSON.stringify(type)},x:player.x+180,previousX:player.x+180,y:player.y,previousY:player.y,radius:16});`);
      fireSinglePacket();
      assert.equal(execute('powerups.length'), 0);
    }
    execute('resetWeapons();updateShooting(0);');
    const lanes = snapshot('bullets.map(shot=>({offset:shot.y-player.y,vy:shot.vy,damage:shot.damage}))');
    execute('for(let frame=0;frame<50;frame++)updateShooting(.02);');
    return { lanes, rounds: execute('bullets.length'), rate: execute('1/weapon.interval') };
  }
  const original = fire(), blue = fire('blue'), yellow = fire('yellow');
  assert.deepEqual(blue.lanes, original.lanes);
  near(blue.rate - original.rate, 1);
  assert.ok(blue.rounds > original.rounds);
  assert.equal(yellow.lanes.length, 2);
  assert.equal(yellow.rounds, 2 * original.rounds);
  assert.ok(yellow.lanes[0].offset < 0 && yellow.lanes[0].vy < 0);
  near(yellow.lanes[0].offset, -yellow.lanes[1].offset);
  near(yellow.lanes[0].vy, -yellow.lanes[1].vy);
  assert.ok(yellow.lanes.every(lane=>lane.damage === original.lanes[0].damage));
});
check('higher firepower growth uses the revised red and blue multiplier floors', () => {
  isolated('weapon.damage=60;weapon.interval=1/80;applyPowerup("red");applyPowerup("blue");');
  near(execute('weapon.damage'), 60 * 1.075);
  near(execute('1/weapon.interval'), 80 * 1.055);
});
check('the 2:19 tier-three screenshot loadout damages but does not one-shot ordinary wave fighters', () => {
  for (const kind of ['scout', 'gunner', 'armored']) {
    isolated(`battleTime=139;weapon.tier=3;weapon.lanes=1;weapon.speedLevel=12;weapon.interval=1/13.96;
      weapon.damage=628.34/(maxWeaponLanes*progressionRules.tierBonus)**2;firingStyle.mode="focus";`);
    placeWaveTarget(kind);
    const shot = fireSinglePacket();
    near(shot.damage, 628.34);
    assert.equal(shot.tier, 3);
    assert.equal(execute('enemies.length'), 1, kind + ' died to the first shot');
    assert.ok(execute('enemies[0].hp>0&&enemies[0].hp<1'), kind + ' took no damage');
  }
});
check('reinforced armor absorbs oversized normal shots and can still be finished with follow-up fire', () => {
  isolated('battleTime=180;weapon.damage=1e10;');
  placeWaveTarget('armored');
  const first = fireSinglePacket();
  assert.ok(Math.log(first.damage) > execute('enemies[0].healthLog') + Math.log(100));
  assert.equal(execute('enemies[0].fireProtection===enemyFireProtection.armored'), true);
  near(execute('enemies[0].hp'), .56);
  fireSinglePacket();
  near(execute('enemies[0].hp'), .38);
  execute('battleTime+=.6;');
  fireSinglePacket();
  assert.equal(execute('enemies.length'), 0);
  assert.equal(execute('kills'), 1);
});
check('ordinary fighters, ace, transport and Boss births use the same stage after a player upgrades', () => {
  function sample(gear) {
    isolated('battleTime=420;'+gear);
    return snapshot(`(()=>{for(const kind of ["scout","armored","gunner"])spawnEnemy(kind);
      const ordinaryEnemies=enemies.map(enemy=>enemy.healthLog);
      const ace=spawnAceEnemy().healthLog;resetAceEncounter();enemies.length=0;
      const transport=spawnSupplyTransport().healthLog;spawnBoss(0);
      const ordinary=boss.healthLog;spawnBoss(10);
      return [...ordinaryEnemies,ace,transport,ordinary,boss.healthLog];})()`);
  }
  const baseline=sample('');
  const reinforced=sample('for(let i=0;i<10;i++){applyPowerup("blue");applyPowerup("yellow");applyPowerup("red");}');
  assert.ok(baseline.every(Number.isFinite));
  assert.deepEqual(reinforced,baseline);
});
check('all enemy spawn paths receive the independent durability ramp', () => {
  isolated('battleTime=12;');
  const durability = 1.14 + .12 * (1 - Math.exp(-12 / 200));
  near(execute('Math.exp(enemyDurabilityLog(0))'), 1.14);
  near(execute('Math.exp(enemyDurabilityLog(10000))'), 1.26);
  assert.ok(execute('enemyDurabilityLog(12)<enemyDurabilityLog(200)&&enemyDurabilityLog(200)<enemyDurabilityLog(1000)'));
  const stage = execute('Math.exp(progressionReferenceDpsLog())');
  const ordinary = execute('enemyHealthForTime()');
  const spawned = snapshot(`(() => {
    for (const kind of ["scout", "armored", "gunner"]) spawnEnemy(kind);
    const ships = enemies.map(enemy => Math.exp(enemy.healthLog));
    const ace = Math.exp(spawnAceEnemy().healthLog);
    resetAceEncounter();
    const transport = Math.exp(spawnSupplyTransport().healthLog);
    spawnBoss(0); const first = { hp: Math.exp(boss.healthLog), endurance: boss.endurance };
    spawnBoss(10); const final = { hp: Math.exp(boss.healthLog), endurance: boss.endurance };
    return { ships, ace, transport, first, final };
  })()`);
  for (const [index, typeHealth] of [1, 2.8, 1.5].entries()) near(spawned.ships[index], ordinary * typeHealth * durability);
  near(spawned.ace, Math.max(ordinary * 3, stage * 4.5) * durability);
  near(spawned.transport, stage * 2.6 * durability);
  for (const boss of [spawned.first, spawned.final]) near(boss.hp, stage * boss.endurance * durability);
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
check('late three-beat fire holds every scheduled shot and bounds visible packets over sustained fire', () => {
  for(const fps of [20,60,144]) {
    isolated('battleTime=600;weapon.speedLevel=8;weapon.interval=.01;weapon.lanes=4;resetWeapons();updateShooting(0);');
    execute(`for(let frame=0;frame<${fps};frame++)updateShooting(1/${fps});`);
    near(execute('bullets.reduce((damage,shot)=>damage+shot.damage,0)+pendingShots*weapon.lanes*projectileDamage()'),404);
    assert.ok(execute('bullets.length')<72);
    assert.ok(execute('bullets.some(shot=>shot.damage>=10)'));
    const peakVisiblePackets = execute(`(()=>{
      const seconds = 1/${fps};
      let peak = 0;
      for(let frame=0;frame<20*${fps};frame++){
        updateShooting(seconds);updatePowerups(seconds);
        peak = Math.max(peak,bullets.length);
      }
      return peak;
    })()`);
    assert.ok(peakVisiblePackets <= 76, `${fps} FPS retained ${peakVisiblePackets} packets`);
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
check('an actual wing lance damages an organic appendage once through the Boss hit regions', () => {
  activeBoss();
  execute('spawnEvolutionRound({x:boss.x-200,y:boss.y-boss.height*.31},"lance",.8,{pierces:3});');
  const damage=execute('Math.exp(bullets[0].damageLog-boss.healthLog)');
  execute('updateShooting(.22);resolveProjectileHits();resolveProjectileHits();');
  near(execute('boss.hp'),1-damage);
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
  near(fresh.damage/old.damage,1.08);
  assert.ok(fresh.length>old.length);
  assert.notEqual(fresh.color,old.color);
  assert.deepEqual(beforeSound.args,[false,1,'red']);
  assert.deepEqual(audioCalls.filter(call=>call.name==='shoot').at(-1).args,[false,2,'red']);
});


const extremeLoadout = 'weapon.damage=1e40;weapon.tier=50;weapon.lanes=4;weapon.speedLevel=80;weapon.interval=.005;weapon.rateOverflow=20;'
  + 'firingStyle.mode="focus";momentum.remaining=10;evolution.pierce=evolution.blast=evolution.aegis=3;';

function fireExtremePacketAt(target) {
  execute(`{ const hit = ${target}; player.x=player.previousX=hit.x-300; player.y=player.previousY=hit.y;
    shotCooldown=renderShotCooldown=0; updateShooting(.05); shotCooldown=999; }`);
  const packet = snapshot('bullets.at(-1)');
  execute('updateShooting(.45);resolveProjectileHits();');
  return packet;
}

check('a maximum-rate focused burst cannot erase a fresh ordinary fighter at mid or late game', () => {
  for (const time of [139, 300, 600, 1200]) {
    for (const kind of ['scout', 'gunner', 'armored']) {
      isolated(`battleTime=${time};${extremeLoadout}`);
      placeWaveTarget(kind);
      const healthLog = execute('enemies[0].healthLog');
      const packet = fireExtremePacketAt('enemies[0]');
      assert.ok(packet.overdrive && packet.mode === 'focus' && packet.damageLog > healthLog + Math.log(100));
      assert.equal(execute('enemies.length'), 1, `${kind} was erased at ${time}s`);
      assert.ok(execute('enemies[0].hp>0&&enemies[0].hp<1'), kind + ' took no damage');
    }
  }
});

check('all eleven Boss bodies survive an overpowered focus packet at late game', () => {
  for (let type=0;type<11;type++) {
    const time=139+type*105;
    activeBoss(type,time);
    execute(extremeLoadout + 'var bossTarget=boss;');
    const packet = fireExtremePacketAt('bossTarget');
    assert.ok(packet.overdrive && packet.mode === 'focus');
    assert.ok(packet.damageLog > execute('bossTarget.healthLog') + Math.log(100));
    assert.equal(execute('activeBosses().includes(bossTarget)'),true,`Boss ${type} was erased at ${time}s`);
    assert.ok(execute('bossTarget.hp>0&&bossTarget.hp<1'));
  }
});

check('high-power auxiliary rounds, main packets and beams damage the fusion Boss without erasing it', () => {
  activeBoss(10,1200);
  execute(extremeLoadout + 'var fusion=boss;shotCooldown=999;');
  execute('spawnEvolutionRound({x:fusion.x-260,y:fusion.y},"lance",.8,{pierces:3});updateShooting(.45);resolveProjectileHits();');
  assert.equal(execute('boss===fusion'),true,'auxiliary round erased the fusion Boss');
  const afterLance=execute('fusion.hp');
  assert.ok(afterLance>0 && afterLance<1);
  execute('battleTime+=.25;');
  fireExtremePacketAt('fusion');
  assert.equal(execute('boss===fusion'),true,'main round erased the fusion Boss');
  const beforeBeam=execute('fusion.hp');
  assert.ok(beforeBeam<afterLance,'main packet must deal real damage');
  execute('player.y=player.previousY=fusion.y;player.x=player.previousX=fusion.x-500;ultimate.charges=1;requestUltimate();updateUltimate(.85);updateUltimate(.45);');
  assert.equal(execute('boss===fusion'),true,'beam erased the fusion Boss');
  near(beforeBeam-execute('fusion.hp'),.18*.78);
});


check('the recorded 2:48 piercing build cannot erase fresh fighters or a Boss with one packet', () => {
  const recordedGear = `weapon.tier=6;weapon.lanes=1;weapon.speedLevel=18;weapon.interval=1/26.79;
    evolution.pierce=1;firingStyle.mode="focus";
    weapon.damage=24647.46/((maxWeaponLanes*progressionRules.tierBonus)**5*evolutionMainDamageMultiplier());`;
  for (const kind of ['scout','gunner','armored']) {
    isolated('battleTime=168;' + recordedGear);
    placeWaveTarget(kind);
    near(execute('Math.exp(weaponDamageLog())*evolutionMainDamageMultiplier()'),24647.46);
    near(execute('1/effectiveShotInterval()'),26.79);
    fireExtremePacketAt('enemies[0]');
    assert.equal(execute('enemies.length'),1,kind + ' was erased');
    assert.ok(execute('enemies[0].hp>0&&enemies[0].hp<1'));
  }
  activeBoss(3,168);
  execute(recordedGear);
  fireExtremePacketAt('boss');
  assert.equal(execute('activeBosses().length'),1);
  assert.ok(execute('boss.hp>.9&&boss.hp<1'));
});

check('sustained automatic fire and all support sources give a Boss time to fight back yet still win', () => {
  activeBoss(4,600);
  execute(extremeLoadout + 'var sustainedTarget=boss;shotCooldown=renderShotCooldown=0;');
  function engage(frames) {
    execute(`for(let frame=0;frame<${frames}&&activeBosses().includes(sustainedTarget);frame++){
      const dt=.05;
      battleTime+=dt;updateBossEncounter(dt);
      player.x=player.previousX=sustainedTarget.x-300;player.y=player.previousY=sustainedTarget.y;
      updateShooting(dt);updateEvolutionWeapons(dt);resolveProjectileHits();
    }`);
  }
  engage(160);
  assert.equal(execute('activeBosses().includes(sustainedTarget)'),true);
  assert.ok(execute('sustainedTarget.hp>.1&&sustainedTarget.hp<.8'));
  assert.ok(execute('sustainedTarget.age>=7.99'));
  engage(300);
  assert.equal(execute('sustainedTarget.finale.mode'),'claws');
  assert.equal(execute('bossDefeated'),0,'the second health pool delays settlement');
  engage(1000);
  assert.equal(execute('activeBosses().includes(sustainedTarget)'),false,'continuous accurate hits should still defeat the Boss');
});

process.stdout.write('\n'+checks+' progression integration checks passed, '+failedChecks+' failed.\n');
if (failedChecks) process.exitCode=1;
