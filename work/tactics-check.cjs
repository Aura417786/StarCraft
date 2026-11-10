const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

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
let captureDraws = false;
const drawOperations = [];
canvas.getContext = () => new Proxy({}, { get: (target,name) => name in target ? target[name] : (...args) => { if(captureDraws) drawOperations.push({name,args}); if(name==='createLinearGradient'||name==='createRadialGradient') return {addColorStop(){}}; }, set(target,name,value) { target[name]=value; if(captureDraws) drawOperations.push({name:'set:'+String(name),args:[value]}); return true; } });
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
  shoot(){audioCalls.push({name:'shoot',args:[]});},
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
const position = () => vm.runInContext('({ x: player.x, y: player.y })', sandbox);
const bounds = vm.runInContext('flightBounds', sandbox);
function step(seconds = 0.05) { now += seconds * 1000; animationCallback(now); }
// 各旧功能用例隔离自动刷新的事件；v13-check 会显式开启新事件计时。
function begin() { emit(window, 'focus'); emit(nodes.get('#start-button'), 'click'); vm.runInContext('powerupCooldown = 999; enemyCooldown = 999; nextBossTime = Infinity; formationState.nextTime = Infinity; battlefieldEvents.nextObject = Infinity; battlefieldEvents.nextTransport = Infinity; if(typeof aceEncounter!=="undefined")aceEncounter.nextTime=Infinity;', sandbox); step(); }
function key(code, type = 'keydown', extra) { return emit(window, type, { code, ...extra }); }
function samePosition(a, b) { assert.equal(a.x, b.x); assert.equal(a.y, b.y); }
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
function setObject(kind = 'wreck', x = 500, y = 350) {
  execute(`var prop=spawnBattlefieldObject('${kind}');Object.assign(prop,{x:${x},previousX:${x},y:${y},previousY:${y},healthLog:Math.log(10)});`);
}
function setEnemy(x = 800, y = 350, hp = 100) {
  execute(`spawnEnemy('scout');var target=enemies.at(-1);Object.assign(target,{x:${x},previousX:${x},y:${y},previousY:${y},waveAmplitude:0,healthLog:Math.log(${hp})});`);
}
function projectile(x0 = 100, x1 = 900, y = 350, damage = 2, pierces = 0) {
  execute(`bullets.push({x:${x1},previousX:${x0},y:${y},previousY:${y},length:26,halfHeight:2.5,angle:0,
    damageLog:Math.log(${damage}),piercesLeft:${pierces},color:'#ffd966',core:'#fff9ca',source:'bullet'});`);
}

function advanceUntil(condition, update = 'updateEncounter(.05)', limit = 1200) {
  let ticks = 0;
  while (!execute(condition) && ticks < limit) { execute(update); ticks++; }
  assert.ok(execute(condition), 'Timed out waiting for '+condition);
  return ticks * .05;
}
function aceScene(phase) {
  isolated('battleTime=36;aceEncounter.nextTime=battleTime;updateEncounter(.05);');
  if (phase) advanceUntil(`aceEncounter.target?.acePhase===${JSON.stringify(phase)}`);
}
function gravityScene(phase = 'active') {
  // The timed first-visit encounter is tested separately in v13-check.
  isolated('battlefieldState.clock=sceneryRules.interval*4+1;scenerySyncJourney();resetGravityTide();journeyState.seen.add("rift");');
  advanceUntil(`gravityTide.phase===${JSON.stringify(phase)}`, 'updateGravityTide(.05)');
  if (phase==='active') execute('updateGravityTide(.6);');
}

check('new tactical modules load through the production index in dependency order', () => {
  for (const name of ['resetAceEncounter','updateAceEncounter','updateAceMovement','aceBlocksWaves','onAceDefeated',
    'resizeAceEncounter','resetGravityTide','updateGravityTide','applyGravityTide','resizeGravityTide'])
    assert.equal(execute('typeof '+name),'function', name);
});
check('ace first encounter preserves 36 seconds of introductory flight and grants a visible warning', () => {
  isolated('battleTime=35.9;aceEncounter.nextTime=36;updateAceEncounter(.05);');
  assert.equal(execute('!!aceEncounter.warning'),false);
  assert.equal(execute('aceEncounter.target'),null);
  execute('battleTime=36;updateAceEncounter(.05);');
  assert.ok(execute('!!aceEncounter.warning'));
  execute('for(let i=0;i<20;i++)updateAceEncounter(.05);');
  assert.equal(execute('aceEncounter.target'),null, 'less than 1.2s notice must not spawn an attacker');
  advanceUntil('!!aceEncounter.target');
  assert.equal(execute('aceEncounter.target.kind'),'ace');
});
check('ace encounter consumes the normal wave budget rather than adding independent reinforcements', () => {
  aceScene(); assert.equal(execute('aceBlocksWaves()'),true);
  execute('enemyCooldown=0;for(let i=0;i<60;i++)updateEncounter(.05);');
  assert.ok(execute('!!aceEncounter.target'));
  assert.equal(execute('enemies.length'),1);
});
check('formation, transport and approaching Boss prevent the ace scheduler from starting', () => {
  for (const setup of ['trySpawnFormation("command");', 'spawnSupplyTransport();', 'nextBossTime=battleTime+1;', 'spawnBoss(0);']) {
    isolated('battleTime=60;'+setup+'aceEncounter.nextTime=0;updateAceEncounter(.05);');
    assert.equal(execute('!!aceEncounter.warning||!!aceEncounter.target'),false, setup);
  }
});
check('ace preview and active duel keep formation and transport schedulers mutually exclusive', () => {
  for (const phase of [null,'strafe']) {
    aceScene(phase);
    execute('formationState.nextTime=0;battlefieldEvents.nextTransport=0;updateFormations(.05);updateBattlefieldEvents(.05);');
    assert.equal(execute('formationState.warning'),null);
    assert.equal(execute('battlefieldEvents.transport'),null);
  }
});
check('ace never shoots before entering view and its first committed attack has an actionable warning', () => {
  aceScene(); advanceUntil('!!aceEncounter.target');
  let visibleWarnings = 0, firstShot = false;
  for(let index=0;index<600;index++) {
    const shotCount=execute('enemyProjectiles.length');
    const offscreen=execute('aceEncounter.target && aceEncounter.target.x-aceEncounter.target.width*.5>=viewport.width');
    execute('updateEncounter(.05)');
    if (execute('aceEncounter.target && ["feint","fire"].includes(aceEncounter.target.acePhase)')) visibleWarnings++;
    if (execute('enemyProjectiles.length')>shotCount) {
      assert.equal(offscreen,false); firstShot=true; break;
    }
  }
  assert.equal(firstShot,true, 'ace must present an actual threat');
  assert.ok(visibleWarnings*.05>=.6, 'first shot must have at least 0.6s of actionable notice');
  aceScene('fire');
  const aim=snapshot('aceEncounter.target.aceAim');
  execute('player.y=clamp(player.y+80,flightBounds.top,flightBounds.bottom);updateEncounter(.1);');
  assert.deepEqual(snapshot('aceEncounter.target.aceAim'),aim, 'telegraphed aim must not secretly track later movement');
  advanceUntil('aceEncounter.target.acePhase==="flank"');
  assert.deepEqual(snapshot('enemyProjectiles.filter(p=>p.source==="ace").map(p=>Math.atan2(p.vy,p.vx))'),[aim.angle]);
  const firstSide=execute('aceEncounter.target.y');
  advanceUntil('aceEncounter.target.aceAim?.followup');
  const second=snapshot('aceEncounter.target.aceAim');
  assert.ok(Math.abs(execute('aceEncounter.target.y')-firstSide)>30, 'the ace must change its firing angle physically');
  assert.equal(second.y,execute('player.y')); assert.notEqual(second.y,aim.y);
  execute('player.y=clamp(player.y-70,flightBounds.top,flightBounds.bottom);updateEncounter(.1);');
  assert.deepEqual(snapshot('aceEncounter.target.aceAim'),second);
  advanceUntil('aceEncounter.target.acePhase==="recover"');
  const angles=snapshot('enemyProjectiles.filter(p=>p.source==="ace").slice(-3).map(p=>Math.atan2(p.vy,p.vx))');
  assert.equal(angles.length,3);
  for(let i=0;i<angles.length;i++) near(Math.atan2(Math.sin(angles[i]-second.angle),Math.cos(angles[i]-second.angle)),second.offsets[i]);
  assert.ok(execute('enemyProjectiles.length<=enemyCombatRules.maxProjectiles'));
  aceScene('feint');
  const route=snapshot('aceEncounter.target.aceRoute');
  assert.ok(route);
  execute('player.y=clamp(player.y+50,flightBounds.top,flightBounds.bottom);updateEncounter(.1);');
  assert.deepEqual(snapshot('aceEncounter.target.aceRoute'),route, 'dash preview must commit to a fixed line');
  execute('player.x=aceEncounter.target.aceRoute.endX;player.y=aceEncounter.target.aceRoute.endY;updateEncounter(.81);');
  assert.notEqual(execute('aceEncounter.target.acePhase'),'dash', 'entering a previewed route must cancel an unsafe dash');
});
check('the two ace locks hit a stationary fighter and allow a two-step dodge without a shield', () => {
  for (const steer of [false,true]) {
    aceScene('fire');
    if (steer) { key('ArrowUp'); for(let i=0;i<9;i++)step(); key('ArrowUp','keyup'); }
    advanceUntil('aceEncounter.target.aceAim?.followup', 'updateEncounter(.05);updateEnemyProjectileDamage();');
    if (steer) { key('ArrowDown'); for(let i=0;i<13;i++)step(); key('ArrowDown','keyup'); }
    for(let i=0;i<65;i++)execute('updateEncounter(.05);updateEnemyProjectileDamage();updateBossEncounter(.05);');
    if (steer) assert.equal(execute('player.lives'),3);
    else assert.ok(execute('player.lives') < 3);
  }
});
check('ace recovery creates a usable one-second attack gap with no new enemy rounds', () => {
  aceScene('recover');
  const count=execute('enemyProjectiles.length');
  execute('for(let i=0;i<20;i++)updateEncounter(.05);');
  assert.equal(execute('aceEncounter.target.acePhase'),'recover');
  assert.ok(execute('enemyProjectiles.length')<=count);
});
check('ace participates in normalized health, ordinary collision damage and exactly one kill reward', () => {
  aceScene('strafe');
  const hit=execute('aceEncounter.target'); assert.ok(hit);
  execute('var aceHit=aceEncounter.target;var aceScore=score;applyEnemyHit(aceHit,{source:"bullet",damageLog:aceHit.healthLog+Math.log(.25)});');
  near(execute('aceHit.hp'),.75);
  execute('applyEnemyHit(aceHit,{source:"bullet",damageLog:aceHit.healthLog+Math.log(2)});defeatEnemy(enemies.indexOf(aceHit),{source:"bullet"});');
  assert.equal(execute('enemies.includes(aceHit)'),false);
  assert.equal(execute('aceEncounter.target'),null);
  assert.equal(execute('kills'),1); assert.ok(execute('score>aceScore'));
  const score=execute('score'); execute('onAceDefeated(aceHit);');
  assert.equal(execute('score'),score); assert.equal(execute('kills'),1);
  assert.ok(execute('aceEncounter.nextTime>battleTime+10'));
});
check('window blur and hidden-tab suspension freeze ace warning, movement and attack clocks', () => {
  for (const phase of [null,'feint']) {
    aceScene(phase);
    const before=snapshot('({battleTime,warning:aceEncounter.warning,target:aceEncounter.target,shots:enemyProjectiles})');
    emit(window,'blur'); step(.05); step(.05); document.hidden=true; emit(window,'focus'); step(.05);
    assert.deepEqual(snapshot('({battleTime,warning:aceEncounter.warning,target:aceEncounter.target,shots:enemyProjectiles})'),before);
  }
});
check('resize preserves ace identity, health and a safe advance from the resized movement baseline', () => {
  aceScene('recover'); execute('var resizedAce=aceEncounter.target;resizedAce.hp=.43;');
  surface={width:1600,height:900}; emit(window,'resize');
  assert.equal(execute('aceEncounter.target===resizedAce&&enemies.includes(resizedAce)'),true);
  near(execute('resizedAce.hp'),.43);
  assert.equal(execute('resizedAce.x===resizedAce.previousX&&resizedAce.y===resizedAce.previousY'),true);
  const before=execute('resizedAce.x'); execute('updateEncounter(.05);');
  assert.ok(Number.isFinite(execute('resizedAce.x'))&&Math.abs(execute('resizedAce.x')-before)<80);
  assert.equal(execute('enemyProjectiles.length'),0);
});

check('gravity begins only in the actual rift sector, with a full 2.4-second warning', () => {
  for (let sector=0;sector<4;sector++) {
    isolated(`battlefieldState.clock=sceneryRules.interval*${sector}+1;scenerySyncJourney();resetGravityTide();for(let i=0;i<300;i++)updateGravityTide(.05);`);
    assert.notEqual(execute('gravityTide.phase'),'warning'); assert.notEqual(execute('gravityTide.phase'),'active');
  }
  isolated('battlefieldState.clock=295;scenerySyncJourney();resetGravityTide();journeyState.seen.add("rift");for(let i=0;i<300;i++)updateGravityTide(.05);');
  assert.equal(execute('battlefieldState.sector'),4);
  assert.ok(execute('battlefieldState.transition>0'));
  assert.notEqual(execute('gravityTide.phase'),'warning'); assert.notEqual(execute('gravityTide.phase'),'active');
  isolated();surface={width:480,height:360};emit(window,'resize');
  execute('battlefieldState.clock=301;scenerySyncJourney();resetGravityTide();journeyState.seen.add("rift");for(let i=0;i<300;i++)updateGravityTide(.05);');
  assert.notEqual(execute('gravityTide.phase'),'warning'); assert.notEqual(execute('gravityTide.phase'),'active');
  gravityScene('warning');
  const before=execute('gravityTide.elapsed');
  execute('for(let i=0;i<40;i++)updateGravityTide(.05);');
  assert.equal(execute('gravityTide.phase'),'warning');
  assert.ok(execute('gravityTide.elapsed')>=before+1.99);
  advanceUntil('gravityTide.phase==="active"','updateGravityTide(.05)');
});
check('gravity has a finite six-second pulse and at least twelve seconds before another active pulse', () => {
  gravityScene();
  const elapsed=execute('gravityTide.elapsed');
  execute('for(let i=0;i<100;i++)updateGravityTide(.05);');
  assert.equal(execute('gravityTide.phase'),'active');
  const remaining=advanceUntil('gravityTide.phase!=="active"','updateGravityTide(.05)',50);
  assert.ok(5+remaining>=5.9-elapsed && 5+remaining<=6.15-elapsed);
  execute('for(let i=0;i<220;i++)updateGravityTide(.05);');
  assert.notEqual(execute('gravityTide.phase'),'active');
});
check('the same gravity accelerates both ordinary fire streams vertically while preserving speed and travel direction', () => {
  gravityScene(); execute(`gravityTide.centerX=640;gravityTide.centerY=350;
    var gravityPlayer={x:600,y:250,vx:720,vy:0,angle:0};
    var gravityEnemy={x:600,y:250,vx:-720,vy:0};
    applyGravityTide(gravityPlayer,.05,'player');applyGravityTide(gravityEnemy,.05,'enemy');`);
  assert.ok(execute('gravityPlayer.vy>0&&gravityEnemy.vy>0&&gravityPlayer.vx>0&&gravityEnemy.vx<0'));
  near(execute('Math.hypot(gravityPlayer.vx,gravityPlayer.vy)'),720);
  near(execute('Math.hypot(gravityEnemy.vx,gravityEnemy.vy)'),720);
  near(execute('gravityPlayer.vy'),execute('gravityEnemy.vy'));
});
check('a real production frame curves both projectile streams before movement and keeps player angle synchronized', () => {
  gravityScene(); execute(`gravityTide.centerX=640;gravityTide.centerY=350;shotCooldown=999;
    bullets.push({x:600,y:250,previousX:600,previousY:250,vx:720,vy:0,angle:0,length:26,halfHeight:2.5,damageLog:0,color:'#fff',core:'#fff'});
    enemyProjectiles.push({x:800,y:250,previousX:800,previousY:250,vx:-300,vy:0,radius:6,age:0});`);
  step(.05);
  assert.equal(execute('bullets.length'),1); assert.equal(execute('enemyProjectiles.length'),1);
  assert.ok(execute('bullets[0].y>250&&enemyProjectiles[0].y>250'));
  near(execute('bullets[0].angle'),execute('Math.atan2(bullets[0].vy,bullets[0].vx)'));
  near(execute('bullets[0].previousY'),250); near(execute('enemyProjectiles[0].previousY'),250);
});
check('sustained gravity never reverses a round or traps it near a viewport edge', () => {
  gravityScene(); execute(`gravityTide.centerY=400;
    var escapeShot={x:800,y:320,vx:-300,vy:0,radius:6,age:0};
    var escapeMinX=escapeShot.x,escapeReversed=false;
    for(let i=0;i<240;i++){applyGravityTide(escapeShot,.05,'enemy');escapeShot.x+=escapeShot.vx*.05;escapeShot.y+=escapeShot.vy*.05;
      escapeReversed ||= escapeShot.vx>=0;escapeMinX=Math.min(escapeMinX,escapeShot.x);}`);
  assert.equal(execute('escapeReversed'),false);
  assert.ok(execute('escapeMinX<0'), 'round must leave the battlefield rather than orbit forever');
  near(execute('Math.hypot(escapeShot.vx,escapeShot.vy)'),300);
});
check('blur and visibility pause gravity clocks and affected bullet positions together', () => {
  gravityScene(); execute('enemyProjectiles.push({x:900,y:200,previousX:900,previousY:200,vx:-300,vy:0,radius:6,age:0});');
  const before=snapshot('({gravityTide,enemyProjectiles,battleTime,scenery:battlefieldState.clock})');
  emit(window,'blur');step(.05);step(.05);document.hidden=true;emit(window,'focus');step(.05);
  assert.deepEqual(snapshot('({gravityTide,enemyProjectiles,battleTime,scenery:battlefieldState.clock})'),before);
});
check('gravity leaves the player, energy orbs, ultimate beam, Boss projectiles and hazards on their own motion rules', () => {
  gravityScene(); execute(`spawnPowerup();Object.assign(powerups[0],{x:800,y:250,previousX:800,previousY:250});
    bossProjectiles.push({x:850,y:250,previousX:850,previousY:250,vx:-180,vy:40,radius:7,age:0});
    bossHazards.push({kind:'beam',x:700,y:280,age:0,warning:1,duration:2});
    var gravityPlayerBefore={x:player.x,y:player.y};
    ultimate.charges=1;requestUltimate();updateUltimate(.85);var gravityBeam=ultimate.shot;
    updateGravityTide(.05);updatePowerups(.05);updateBossProjectiles(.05);`);
  assert.deepEqual(snapshot('({x:player.x,y:player.y})'),snapshot('gravityPlayerBefore'));
  near(execute('powerups[0].y'),250); near(execute('powerups[0].x'),794.5);
  near(execute('bossProjectiles[0].x'),841); near(execute('bossProjectiles[0].y'),252);
  near(execute('bossProjectiles[0].vx'),-180); near(execute('bossProjectiles[0].vy'),40);
  near(execute('bossHazards[0].x'),700); near(execute('bossHazards[0].y'),280);
  assert.equal(execute('ultimate.shot===gravityBeam'),true);
});
check('leaving rift or an approaching Boss immediately stops gravity and removes curved enemy rounds without deleting enemies', () => {
  for(const leave of ['battlefieldState.clock=0;scenerySyncJourney();','nextBossTime=battleTime+1;']) {
    gravityScene(); execute(`spawnEnemy('scout');var keptGravityEnemy=enemies.at(-1);
      enemyProjectiles.push({x:gravityTide.centerX,y:gravityTide.centerY-50,vx:-300,vy:0,radius:6,age:0});applyGravityTide(enemyProjectiles[0],.05,'enemy');`+leave+'updateGravityTide(.05);');
    assert.notEqual(execute('gravityTide.phase'),'active');
    assert.equal(execute('enemyProjectiles.length'),0);
    assert.equal(execute('enemies.includes(keptGravityEnemy)'),true);
  }
});
check('pending formation, supply transport and ace encounters defer gravity rather than layering hazards', () => {
  for(const setup of ['trySpawnFormation("command");','spawnSupplyTransport();','aceEncounter.nextTime=battleTime;updateAceEncounter(.05);']) {
    isolated('battleTime=60;battlefieldState.clock=301;scenerySyncJourney();resetGravityTide();journeyState.seen.add("rift");'+setup+'for(let i=0;i<100;i++)updateGravityTide(.05);');
    assert.notEqual(execute('gravityTide.phase'),'active',setup);
  }
});
check('resizing maps gravity center and grants a full new warning before the shifted field becomes dangerous', () => {
  gravityScene();
  const before=snapshot('({phase:gravityTide.phase,elapsed:gravityTide.elapsed,centerX:gravityTide.centerX,centerY:gravityTide.centerY})');
  surface={width:1600,height:900};emit(window,'resize');
  assert.equal(execute('gravityTide.phase'),'warning');near(execute('gravityTide.elapsed'),0);
  assert.ok(Number.isFinite(execute('gravityTide.centerX'))&&Number.isFinite(execute('gravityTide.centerY')));
  near(execute('gravityTide.centerX'),before.centerX*1.25);
  assert.ok(execute('gravityTide.centerY>=0&&gravityTide.centerY<=viewport.height'));
});

process.stdout.write(`\n${checks} tactics integration checks passed, ${failedChecks} failed.\n`);
if (failedChecks) process.exitCode=1;


