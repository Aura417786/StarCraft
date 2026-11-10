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
nodes.get('#evolution-screen').querySelector = () => undefined;
document.createElement = tag => tag === 'canvas' ? { getContext: () => canvas.getContext() } : mockNode();
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
for (const file of [...fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').matchAll(/<script src="([^"]+)" defer>/g)].map(match => match[1]).filter(file => !['audio.js', 'sortie-ui.js'].includes(file) && !file.startsWith('vendor/'))) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
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
function activeBoss(type = 0) {
  isolated(`battleTime=95;spawnBoss(${type});Object.assign(boss,bossArena());
    boss.previousX=boss.x;boss.previousY=boss.y;boss.phase='recover';`);
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

check('v13 production modules load in index order without missing hooks', () => {
  for (const name of ['updateFormations','drawFormationSignals','updateBattlefieldEvents','drawBattlefield','projectileAlienBossHit','drawBossShip'])
    assert.equal(execute('typeof '+name),'function');
});
check('normal wave scheduler sends more enemies per second as the battle progresses', () => {
  const arrivals = [0, 120, 300, 600].map(time => {
    isolated(`battleTime = ${time}; enemyCooldown = enemyIntervalForTime();`);
    const start = execute('enemySpawnCount');
    // Measure the production scheduler independently of the occupancy cap.
    execute(`for (let frame = 0; frame < 240; frame++) {
      updateEncounter(0.05);
      enemies.length = 0;
    }`);
    return execute('enemySpawnCount') - start;
  });
  assert.ok(arrivals[0] >= 10 && arrivals[0] <= 11, JSON.stringify(arrivals));
  assert.ok(arrivals[3] >= 35 && arrivals[3] <= 38, JSON.stringify(arrivals));
  assert.ok(arrivals.every((count, index) => index === 0 || count > arrivals[index - 1]), JSON.stringify(arrivals));
});
check('late wave cadence still respects the enemy cap and Boss warning without a backlog', () => {
  isolated(`battleTime = 600;
    for (let i = 0; i < enemyRules.maxOnScreen; i++) spawnEnemy("scout");
    enemyCooldown = 0;`);
  const cap = execute('enemyRules.maxOnScreen');
  execute('updateEncounter(0.05);');
  assert.equal(execute('enemies.length'), cap);
  isolated('battleTime = 600; nextBossTime = battleTime + bossRules.warning; enemyCooldown = 0;');
  execute('for (let i = 0; i < 20; i++) updateEncounter(0.05);');
  assert.equal(execute('enemies.length'), 0);
  execute('nextBossTime = Infinity; updateEncounter(0.05);');
  assert.equal(execute('enemies.length'), 1);
});
check('formations retain the first 24 seconds for learning normal enemies', () => {
  isolated('battleTime=23.99;formationState.nextTime=24;');
  assert.equal(execute('trySpawnFormation()'),false); execute('updateFormations(.01);');
  assert.equal(execute('formationState.warning'),null);
});
check('formation previews last 1.35 seconds and suppress independent waves', () => {
  isolated('battleTime=24;'); assert.equal(execute('trySpawnFormation()'),true);
  assert.equal(execute('formationsBlockWaves()'),true); execute('updateFormations(1.30)');
  assert.equal(execute('enemies.length'),0); execute('updateFormations(.051)');
  assert.equal(execute('enemies.length'),4);
  assert.equal(execute('enemies.every(e=>e.x-e.width*.5>viewport.width)'),true);
});
check('each wave replaces as many spawn slots as its own members', () => {
  isolated('battleTime=50;trySpawnFormation("command");updateFormations(1.351);');
  near(execute('formationState.suppression'),execute('enemies.length*enemyIntervalForTime()'));
  const count=execute('enemies.length'); execute('enemyCooldown=0;updateEncounter(.1);');
  assert.equal(execute('enemies.length'),count);
});
check('formation total cap and gunner cap remain global', () => {
  isolated('battleTime=50;for(let i=0;i<12;i++)spawnEnemy("scout");');
  assert.equal(execute('trySpawnFormation()'),false);
  isolated('battleTime=50;spawnEnemy("gunner");spawnEnemy("gunner");trySpawnFormation("escort");updateFormations(1.351);');
  assert.equal(execute('enemies.filter(e=>e.kind==="gunner").length'),2);
});
check('defeatEnemy hook interrupts the commander followers', () => {
  isolated('battleTime=50;trySpawnFormation("escort");updateFormations(1.351);enemies[3].gunPhase="warning";defeatEnemy(0);');
  assert.equal(execute('formationState.active.broken'),true);
  assert.equal(execute('enemies.every(e=>e.formationDisoriented===1.5)'),true);
  assert.equal(execute('enemies.find(e=>e.kind==="gunner").gunPhase'),'recover');
});
check('disorganization ends without snapping followers back to dead leader', () => {
  isolated('battleTime=50;trySpawnFormation("command");updateFormations(1.351);defeatEnemy(0);');
  const before=execute('enemies[0].x'); execute('updateEnemyMovement(enemies[0],1.51);updateEnemyMovement(enemies[0],.01)');
  assert.equal(execute('enemies[0].formationId'),null); assert.ok(execute('enemies[0].x')<before);
});
check('formation gunner never opens fire outside the visible viewport', () => {
  isolated('battleTime=50;trySpawnFormation("escort");updateFormations(1.351);');
  execute('for(let i=0;i<80;i++)updateEnemyMovement(enemies[3],.05);');
  assert.equal(execute('enemyProjectiles.length'),0);
});
check('pincer leaves a player-sized opening or declines an arena that is too cramped', () => {
  for (const dimensions of [{width:1280,height:720},{width:800,height:450},{width:560,height:420}]) {
    isolated(); surface=dimensions; execute('resizeBattlefield();battleTime=60;trySpawnFormation("pincer");updateFormations(1.351);');
    if(execute('enemies.length')===0){assert.equal(execute('formationState.active'),null);continue;}
    assert.equal(execute('enemies.length'),4);
    assert.equal(execute('enemies.every(e=>Math.abs(e.y-formationState.active.centerY)>player.height*.5+e.height*.25)'),true, JSON.stringify(dimensions));
  }
});
function primeFormationTactic(kind, dimensions = { width: 1280, height: 720 }) {
  isolated();
  surface = dimensions;
  execute(`resizeBattlefield();battleTime=50;player.x=player.previousX=flightBounds.left+15;
    player.y=player.previousY=(flightBounds.top+flightBounds.bottom)/2;
    trySpawnFormation(${JSON.stringify(kind)});updateFormations(1.351);
    formationState.active.x=viewport.width*.70;
    for (const member of formationState.active.members) formationControlsEnemy(member,0);
    updateFormations(.01);bossHitGrace=0;`);
}
function advanceFormationTactic(seconds, move = false) {
  execute(`${move ? 'updatePlayer(' + seconds + ');' : 'player.previousY=player.y;'}
    updateFormations(${seconds});for (const member of enemies) updateEnemyMovement(member,${seconds});
    updateEnemyProjectiles(${seconds});updateEnemyProjectileDamage();`);
}
check('all three formations preview an opening and lock a fresh target for the follow-up', () => {
  for (const kind of ['escort','command','pincer']) {
    primeFormationTactic(kind);
    const before = snapshot('formationState.active.coordination.cue');
    assert.ok(before.remaining >= 1 && before.shots.length >= 2);
    assert.equal(Boolean(before.gap), kind !== 'escort');
    assert.equal(execute('enemyProjectiles.length'), 0);
    assert.equal(execute('formationsBlockWaves()'), true);
    execute('player.y=player.previousY=flightBounds.bottom;');
    let shots = [];
    for (let frame=0; frame<100; frame++) {
      advanceFormationTactic(.05);
      if (!shots.length) shots = snapshot('enemyProjectiles.filter(shot=>shot.formationAttack)');
      if (execute('formationState.active.coordination.beat===1&&!!formationState.active.coordination.cue')) break;
    }
    assert.ok(shots.length >= 2 && shots.every(shot => shot.vx < 0 && shot.formationTint),kind);
    assert.equal(execute('formationState.active.coordination.beat'),1,kind);
    assert.equal(execute('formationState.active.coordination.cue.target.y'),execute('flightBounds.bottom'));
    assert.notEqual(before.target.y,execute('formationState.active.coordination.cue.target.y'));
    assert.equal(execute('formationState.active.coordination.cue.gap'),null);
  }
});
check('command wall leaves a keyboard-reachable passage on compact and wide battlefields, then aims again', () => {
  for (const [width,height] of [[640,360],[1280,720],[1920,1080],[2560,1440]]) {
    primeFormationTactic('command',{width,height});
    const open = snapshot('formationState.active.coordination.cue');
    const safeY = (open.gap.top + open.gap.bottom)/2;
    const distance = Math.abs(safeY-open.target.y);
    const key = safeY < open.target.y ? 'ArrowUp' : 'ArrowDown';
    assert.ok(distance>0 && distance < open.warning*195);
    assert.ok(open.shots.some(shot => shot.y===open.target.y));
    const clearance=execute('player.height*.16+7');
    assert.ok(open.shots.every(shot => shot.y<open.gap.top-clearance || shot.y>open.gap.bottom+clearance));
    execute(`pressedKeys.add(${JSON.stringify(key)});`);
    advanceFormationTactic(distance/300,true);
    execute('pressedKeys.clear();');
    near(execute('player.y'),safeY);
    for (let frame=0; frame<100; frame++) {
      if (execute('formationState.active.coordination.beat===1&&!!formationState.active.coordination.cue')) break;
      advanceFormationTactic(.05);
    }
    assert.equal(execute('player.lives'),3,`${width}×${height}`);
    near(execute('formationState.active.coordination.cue.target.y'),safeY);
    // Let the front of the previous volley clear the player before crossing its rails.
    for (let frame=0;frame<5;frame++) advanceFormationTactic(.05);
    const endpoint = execute(safeY < open.target.y ? 'flightBounds.bottom' : 'flightBounds.top');
    const escape = Math.min(56,Math.abs(endpoint-safeY));
    const reverse = key === 'ArrowUp' ? 'ArrowDown' : 'ArrowUp';
    execute(`pressedKeys.add(${JSON.stringify(reverse)});`);
    advanceFormationTactic(escape/300,true);
    execute('pressedKeys.clear();');
    for (let frame=0;frame<85;frame++) advanceFormationTactic(.05);
    assert.equal(execute('player.lives'),3,`${width}×${height} follow-up`);
  }
});
check('resizing reissues an unfinished formation warning, and destroying its leader cancels it', () => {
  primeFormationTactic('command');
  advanceFormationTactic(.55);
  surface={width:1920,height:1080}; execute('resizeBattlefield();');
  near(execute('formationState.active.coordination.cue.remaining'),1.1);
  assert.equal(execute('formationState.active.coordination.beat'),0);
  assert.equal(execute('enemyProjectiles.length'),0);
  execute('defeatEnemy(enemies.findIndex(enemy=>enemy.formationLeader));');
  assert.equal(execute('formationState.active.broken'),true);
  assert.equal(execute('formationState.active.coordination.cue'),null);
  for (let frame=0;frame<60;frame++) advanceFormationTactic(.05);
  assert.equal(execute('enemyProjectiles.some(shot=>shot.formationAttack)'),false);
});
check('transport and formation schedulers do not start overlapping waves', () => {
  isolated('battleTime=55;spawnSupplyTransport();'); assert.equal(execute('trySpawnFormation()'),false);
  isolated('battleTime=55;trySpawnFormation();battlefieldEvents.nextTransport=0;updateBattlefieldEvents(.1);');
  assert.equal(execute('battlefieldEvents.transport'),null);
});
check('blur freezes scenery, preview and world-object clocks together', () => {
  isolated('battleTime=24;trySpawnFormation();spawnBattlefieldObject();');
  const before=snapshot('({s:battlefieldState.clock,f:formationState.warning.remaining,e:battlefieldEvents.clock,x:battlefieldEvents.objects[0].x})');
  emit(window,'blur'); step(.05);step(.05);
  assert.deepEqual(snapshot('({s:battlefieldState.clock,f:formationState.warning.remaining,e:battlefieldEvents.clock,x:battlefieldEvents.objects[0].x})'),before);
});
check('Boss warning clears props and cancels pending formations in real frame order', () => {
  isolated('battleTime=84.98;nextBossTime=90;trySpawnFormation();spawnBattlefieldObject();'); step(.05);
  assert.equal(execute('formationState.warning'),null); assert.equal(execute('battlefieldEvents.objects.length'),0);
});

check('world objects arrive on time and respect their independent capacity', () => {
  isolated('battleTime=15.9;battlefieldEvents.nextObject=16;updateBattlefieldEvents(.05);');
  assert.equal(execute('battlefieldEvents.objects.length'),0);
  execute('battleTime=16;updateBattlefieldEvents(.05);'); assert.equal(execute('battlefieldEvents.objects.length'),1);
  execute('for(let i=0;i<12;i++)spawnBattlefieldObject();'); assert.equal(execute('battlefieldEvents.objects.length'),3);
});
check('nearest wreck consumes even a piercing player round before rear enemy', () => {
  isolated();setObject();setEnemy();projectile(100,900,350,2,3);execute('resolveProjectileHits()');
  near(execute('prop.hp'),.8);near(execute('target.hp'),1);assert.equal(execute('bullets.length'),0);
});
check('near enemy is hit before a rear wreck despite list ordering', () => {
  isolated();setObject('wreck',800);setEnemy(450);projectile();execute('resolveProjectileHits()');
  near(execute('target.hp'),.98);near(execute('prop.hp'),1);
});
check('piercing round hits near enemy once then stops on rear wreck', () => {
  isolated();setObject('wreck',800);setEnemy(450);projectile(100,900,350,2,3);execute('resolveProjectileHits()');
  near(execute('target.hp'),.98);near(execute('prop.hp'),.8);near(execute('ultimate.energy'),.24);
  execute('resolveProjectileHits()');near(execute('target.hp'),.98);near(execute('prop.hp'),.8);
});
check('neutral object damage and destruction award no score or energy', () => {
  isolated();setObject('wreck');projectile(100,900,350,1000);execute('resolveProjectileHits()');
  assert.equal(execute('battlefieldEvents.objects.length'),0);
  assert.deepEqual(snapshot('({score,kills,energy:ultimate.energy,charges:ultimate.charges})'),{score:0,kills:0,energy:0,charges:0});
});
check('energy cell clears nearby bullets but retains distant threats', () => {
  isolated();setObject('cell');execute(`enemyProjectiles.push({x:510,y:350,radius:6},{x:950,y:350,radius:6});
    bossProjectiles.push({x:510,y:350,radius:7},{x:950,y:350,radius:7});destroyBattlefieldObject(prop);`);
  assert.deepEqual(snapshot('enemyProjectiles.map(p=>p.x)'),[950]);assert.deepEqual(snapshot('bossProjectiles.map(p=>p.x)'),[950]);
});
check('cell collateral kills count once but cannot refill ultimate', () => {
  isolated();setObject('cell');setEnemy(550,350,2);execute('destroyBattlefieldObject(prop);destroyBattlefieldObject(prop);');
  assert.equal(execute('kills'),1);assert.equal(execute('score'),100);near(execute('ultimate.energy'),0);
});
check('ordinary shot used to explode a cell cannot also strike behind it', () => {
  isolated();setObject('cell');setEnemy(900,350,100);projectile(100,1100,350,1000,3);execute('resolveProjectileHits()');
  near(execute('target.hp'),1);assert.equal(execute('bullets.length'),0);near(execute('ultimate.energy'),0);
});
check('wreck absorbs swept enemy shots and loses durability per impact', () => {
  isolated();setObject();execute(`enemyProjectiles.push({x:100,previousX:900,y:350,previousY:350,radius:6});resolveBattlefieldCover();`);
  assert.equal(execute('enemyProjectiles.length'),0);near(execute('prop.hp'),.895);
});
check('enemy shot hits nearest cover first regardless of array order', () => {
  isolated();setObject('wreck',400);execute('var farWreck=prop;');setObject('wreck',700);
  execute('enemyProjectiles.push({x:100,previousX:1000,y:350,previousY:350,radius:6});resolveBattlefieldCover();');
  near(execute('prop.hp'),.895);near(execute('farWreck.hp'),1);
});
check('cover behind aircraft cannot erase a shot that has already reached the aircraft', () => {
  isolated();setObject('wreck',100);execute(`player.x=player.previousX=400;player.y=player.previousY=350;
    enemyProjectiles.push({x:20,previousX:1000,y:350,previousY:350,radius:6});
    resolveBattlefieldCover();updateEnemyProjectileDamage();`);
  assert.equal(execute('player.lives'),2);
});
check('world props do not hurt aircraft on contact', () => {
  isolated();setObject('wreck');execute('prop.x=prop.previousX=player.x;prop.y=prop.previousY=player.y;updatePlayerDamage(.05);');
  assert.equal(execute('player.lives'),3);assert.equal(execute('battlefieldEvents.objects.length'),1);
});
check('escape removes props without score, kills or health loss', () => {
  isolated();setObject('cell');execute('prop.x=-200;updateBattlefieldEvents(.05);');
  assert.equal(execute('battlefieldEvents.objects.length'),0);
  assert.deepEqual(snapshot('({score,kills,lives:player.lives})'),{score:0,kills:0,lives:3});
});
check('transport kill grants all three normal supplements exactly once', () => {
  isolated('battleTime=55;spawnSupplyTransport();var cargo=battlefieldEvents.transport;defeatEnemy(enemies.indexOf(cargo));');
  assert.deepEqual(snapshot('powerups.map(p=>p.type)'),['blue','yellow','red']);assert.equal(execute('score'),600);
  assert.equal(execute('kills'),1);execute('defeatEnemy(enemies.indexOf(cargo));');assert.equal(execute('powerups.length'),3);
});
check('transport escaping has no life loss, kill or supplement reward', () => {
  isolated('battleTime=55;spawnSupplyTransport();var cargo=battlefieldEvents.transport;cargo.x=cargo.previousX=-cargo.width;updatePlayerDamage(.05);updateBattlefieldEvents(.05);');
  assert.deepEqual(snapshot('({score,kills,lives:player.lives,balls:powerups.length})'),{score:0,kills:0,lives:3,balls:0});
  assert.equal(execute('battlefieldEvents.transport'),null);
});
check('transport collision costs life but does not grant its kill reward', () => {
  isolated('battleTime=55;spawnSupplyTransport();var cargo=battlefieldEvents.transport;cargo.x=cargo.previousX=player.x;cargo.y=cargo.previousY=player.y;updatePlayerDamage(.05);');
  assert.deepEqual(snapshot('({score,kills,lives:player.lives,balls:powerups.length})'),{score:0,kills:0,lives:2,balls:0});
});
check('transport bonus respects existing orb population limit', () => {
  isolated('for(let i=0;i<6;i++)spawnPowerup();battleTime=55;spawnSupplyTransport();defeatEnemy(enemies.indexOf(battlefieldEvents.transport));');
  assert.equal(execute('powerups.length'),7);
});
check('Boss entry clears transport without paying a destruction reward', () => {
  isolated('battleTime=55;spawnSupplyTransport();spawnBoss(0);updateBattlefieldEvents(.05);');
  assert.equal(execute('battlefieldEvents.transport'),null);assert.equal(execute('enemies.length'),0);
  assert.equal(execute('powerups.length'),0);assert.equal(execute('score'),0);
});

check('air beyond the outer wings does not falsely absorb a near-miss', () => {
  activeBoss();execute('var h=projectileAlienBossHit({previousX:100,x:boss.x+boss.width,previousY:boss.y+boss.height*.6,y:boss.y+boss.height*.6,length:26},boss);');
  assert.equal(execute('h'),null);
});
check('a single Boss victory does not jump or reset the timed journey', () => {
  activeBoss();execute('battlefieldState.clock=34;scenerySyncJourney();');
  const before=snapshot('({c:battlefieldState.completed,s:battlefieldState.sector,t:battlefieldState.clock})');
  execute('var fallen=boss;defeatBoss(fallen);defeatBoss(fallen);');
  assert.deepEqual(snapshot('({c:battlefieldState.completed,s:battlefieldState.sector,t:battlefieldState.clock})'),before);
});
check('effective flight time changes sectors every 75 seconds and loops all five', () => {
  isolated('battlefieldState.clock=74.95;');execute('updateBattlefield(.05);');
  near(execute('battlefieldState.clock'),75);assert.equal(execute('battlefieldState.sector'),1);
  assert.equal(execute('battlefieldState.completed'),1);
  for(let leg=0;leg<13;leg++){
    execute(`battlefieldState.clock=${leg*75};scenerySyncJourney();`);
    assert.equal(execute('battlefieldState.sector'),leg%5);assert.equal(execute('battlefieldState.completed'),leg);
    assert.equal(execute('battlefieldState.transition'),0);
  }
});
check('crossfade starts at 65 seconds and finishes after ten seconds', () => {
  isolated();
  near(execute('sceneryJourney(64.999).blend'),0);near(execute('sceneryJourney(65).blend'),0);
  near(execute('sceneryJourney(70).blend'),.5);
  assert.ok(execute('sceneryJourney(74.999).blend')>.999);
  assert.equal(execute('sceneryJourney(75).current'),1);near(execute('sceneryJourney(75).blend'),0);
  execute('battlefieldState.clock=70;scenerySyncJourney();');near(execute('battlefieldState.transition'),5);
});
check('crimson reflection blends with the scenery and matches across sector boundaries', () => {
  isolated('battlefieldState.clock=65;');
  assert.deepEqual(snapshot('shipReflectionLight().channels'),[82,179,255]);
  execute('battlefieldState.clock=70;');
  assert.deepEqual(snapshot('shipReflectionLight().channels'),[169,179,164]);
  near(execute('shipReflectionLight().side'),.01);
  for(let leg=1;leg<=5;leg++){
    execute(`battlefieldState.clock=${leg*75}-.000001;`);
    const prior=snapshot('shipReflectionLight()');
    execute(`battlefieldState.clock=${leg*75};`);
    const next=snapshot('shipReflectionLight()');
    assert.deepEqual(prior.channels,next.channels);
    near(prior.side,next.side);
  }
});
check('the player hull keeps reflection after evolution and under reduced motion', () => {
  isolated();
  execute('shipRenderAssets.crimson.image=fighterImage;shipRenderAssets.crimson.ready=true;');
  try {
    for(const setup of ['', 'evolution.aegis=1;reducedMotion.matches=true;']) {
      execute(setup);
      drawOperations.length=0;captureDraws=true;
      execute('drawPlayer();');
      captureDraws=false;
      assert.equal(drawOperations.filter(op=>op.name==='set:globalCompositeOperation'&&op.args[0]==='screen').length,1);
    }
  } finally {
    captureDraws=false;
    execute('shipRenderAssets.crimson.image=null;shipRenderAssets.crimson.ready=false;');
  }
});
check('panorama keeps moving left throughout its visible lifetime', () => {
  isolated('battlefieldState.driftX=0;');
  let prior=Infinity;
  for(const age of [0,10,30,65,75,84.99]){
    const frame=snapshot(`sceneryFrame(1672,941,${age},0)`);
    assert.ok(frame.x<prior,'each later source window must move left');prior=frame.x;
    assert.ok(frame.width>=1280&&frame.height>=720,'scaled background covers the viewport');
  }
});
check('incoming panorama position is continuous across every 75-second boundary', () => {
  isolated('battlefieldState.driftX=0;battlefieldState.driftY=0;');
  for(let leg=1;leg<=10;leg++){
    const before=snapshot(`(()=>{const j=sceneryJourney(${leg*75}-.000001);return sceneryFrame(1672,941,j.nextAge,j.next);})()`);
    const after=snapshot(`(()=>{const j=sceneryJourney(${leg*75});return sceneryFrame(1672,941,j.currentAge,j.current);})()`);
    near(before.x,after.x,.001);near(before.y,after.y,.001);near(before.width,after.width);near(before.height,after.height);
  }
});
check('menu and suspended combat do not spend journey time', () => {
  isolated('battlefieldState.clock=50;');emit(window,'blur');step(.05);near(execute('battlefieldState.clock'),50);
  execute('state="menu";updateBattlefield(.1);');near(execute('battlefieldState.clock'),50);
});
check('evolution selection freezes scenery transition and object timers', () => {
  activeBoss();execute('defeatBoss(boss);updateCombatEffects(1.3);');assert.equal(execute('evolution.pending'),true);
  const previous=snapshot('({t:battlefieldState.transition,s:battlefieldState.clock,e:battlefieldEvents.clock})');step(.05);
  assert.deepEqual(snapshot('({t:battlefieldState.transition,s:battlefieldState.clock,e:battlefieldEvents.clock})'),previous);
});
check('resize preserves scenery progression, Boss hull damage and live world objects', () => {
  activeBoss();execute('advanceBattlefield();boss.hp=.67;spawnBattlefieldObject();');
  execute('var retainedBossResizeObject=battlefieldEvents.objects[0];');
  surface={width:900,height:540};emit(window,'resize');
  assert.equal(execute('battlefieldState.sector'),1);assert.equal(execute('boss.hp'),.67);
  assert.equal(execute('battlefieldEvents.objects.length'),1);
  assert.equal(execute('battlefieldEvents.objects[0]===retainedBossResizeObject'),true);
});
check('restart resets sector, event clock, formation cycle and debris', () => {
  isolated('advanceBattlefield();battleTime=50;trySpawnFormation();updateFormations(1.4);spawnBattlefieldObject();');
  emit(nodes.get('#restart-button'),'click');
  assert.deepEqual(snapshot('({sector:battlefieldState.sector,completed:battlefieldState.completed,f:formationState.sequence,e:battlefieldEvents.clock,objects:battlefieldEvents.objects.length})'),
    {sector:0,completed:0,f:0,e:0,objects:0});
});
check('reduced motion removes parallax and keeps clear scene labels', () => {
  isolated('reducedMotion.matches=true;player.x=flightBounds.right;player.y=flightBounds.bottom;updateBattlefield(.1);');
  near(execute('battlefieldState.driftX'),0);near(execute('battlefieldState.driftY'),0);
  drawOperations.length=0;captureDraws=true;execute('drawBattlefield();');captureDraws=false;
  assert.ok(drawOperations.some(op=>op.name==='fillText'&&op.args[0].includes('曙光')));
  near(execute('sceneryFrame(1672,941,10,0).x'),execute('sceneryFrame(1672,941,75,0).x'));
});
check('all sectors, damaged Bosses, props and formations render finite geometry', () => {
  for(const quiet of [false,true])for(let type=0;type<5;type++){
    activeBoss(type);execute(`reducedMotion.matches=${quiet};battlefieldState.clock=${type*75+70};scenerySyncJourney();
      boss.hp=.43;spawnBattlefieldObject('cell');spawnBattlefieldObject('wreck');`);
    drawOperations.length=0;captureDraws=true;execute('drawBattlefield();drawBossBattle();drawBattlefieldObjects();');captureDraws=false;
    for(const op of drawOperations)for(const arg of op.args)if(typeof arg==='number')assert.ok(Number.isFinite(arg),`${op.name} emitted ${arg}`);
  }
});

// Exercise the real image-ready drawing branch with metadata read from the shipped PNGs.
function readPng(relative, decompress=false) {
  const bytes=fs.readFileSync(path.join(__dirname,'..',relative));
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',relative+' PNG signature');
  assert.equal(bytes.toString('ascii',12,16),'IHDR');assert.equal(bytes.readUInt32BE(8),13);
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),bits=bytes[24],color=bytes[25];
  assert.ok(width>=1024&&height>=720,relative+' full-resolution asset');
  assert.ok(width<=8192&&height<=8192);assert.equal(bits,8);assert.ok(color===2||color===6);assert.equal(bytes[28],0);
  const idat=[];let offset=8,ended=false;
  while(offset+12<=bytes.length){
    const size=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);
    assert.ok(offset+size+12<=bytes.length,relative+' complete PNG chunk');
    if(type==='IDAT')idat.push(bytes.subarray(offset+8,offset+8+size));
    offset+=size+12;if(type==='IEND'){ended=true;break;}
  }
  assert.ok(ended&&idat.length>0,relative+' image data and end chunk');
  if(decompress){const raw=zlib.inflateSync(Buffer.concat(idat));assert.equal(raw.length,(width*(color===6?4:3)+1)*height);}
  return {width,height,color};
}
function readSceneryImage(relative) {
  if (relative.endsWith('.png')) return readPng(relative,true);
  const bytes=fs.readFileSync(path.join(__dirname,'..',relative));
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.readUInt32LE(4)+8,bytes.length,'complete WebP container');
  assert.equal(bytes.toString('ascii',8,16),'WEBPVP8 ');
  const chunkSize=bytes.readUInt32LE(16);
  assert.equal(20+chunkSize+chunkSize%2,bytes.length,'complete VP8 chunk');
  assert.equal(bytes.subarray(23,26).toString('hex'),'9d012a','VP8 image signature');
  const width=bytes.readUInt16LE(26)&0x3fff,height=bytes.readUInt16LE(28)&0x3fff;
  assert.ok(width>=1024&&height>=720&&width<=8192&&height<=8192,relative+' full-resolution asset');
  return {width,height};
}
check('all five cinematic plates are valid image assets', () => {
  for(const asset of snapshot('battlefieldSectors.map(s=>s.asset)'))readSceneryImage(asset);
});
class SceneryImageMock {
  constructor(){this.complete=false;this.naturalWidth=0;this.naturalHeight=0;}
  set src(value){
    this.url=value;
    try{const info=readSceneryImage(value);this.naturalWidth=info.width;this.naturalHeight=info.height;this.complete=true;this.onload?.();}
    catch(error){this.complete=true;this.loadError=error;this.onerror?.();}
  }
  get src(){return this.url;}
}
check('current and next cinematic images preload and only three backgrounds stay cached', () => {
  sandbox.Image=SceneryImageMock;execute('sceneryCache.clear();');isolated();
  assert.equal(execute('sceneryCache.get(0).ready&&sceneryCache.get(1).ready'),true);
  for(let leg=0;leg<16;leg++){
    execute(`battlefieldState.clock=${leg*75};scenerySyncJourney();`);
    assert.equal(execute('sceneryCache.size<=3'),true);
    assert.equal(execute('sceneryCache.get(sceneryJourney().current).ready&&sceneryCache.get(sceneryJourney().next).ready'),true);
  }
});
check('decoded backgrounds and sector-specific solid meshes render without sprite cutouts', () => {
  isolated();
  for(let sector=0;sector<5;sector++){
    execute(`battlefieldState.clock=${sector*75+70};scenerySyncJourney();`);
    drawOperations.length=0;captureDraws=true;
    const props=snapshot(`(()=>{
      const original=drawSpaceProp, props=[];
      try { drawSpaceProp=(ctx,kind,pose)=>props.push({kind,...pose}); drawBattlefield(); }
      finally { drawSpaceProp=original; }
      return props;
    })()`);
    captureDraws=false;
    const images=drawOperations.filter(op=>op.name==='drawImage');
    const expected=snapshot('(()=>{const j=sceneryJourney();return [battlefieldSectors[j.current].asset,battlefieldSectors[j.next].asset];})()');
    for(const asset of expected)assert.ok(images.some(op=>op.args[0].src===asset),'draw '+asset);
    assert.equal(images.some(op=>op.args[0].src==='assets/scenery/foreground-rock.png'),false);
    for(const prop of props){
      assert.ok([sector,(sector+1)%5].includes(prop.sector));
      assert.ok([1,2,3].includes(prop.sector));
      assert.equal(prop.kind,prop.sector===2?'wreck':'rock');
      assert.ok([prop.x,prop.y,prop.pitch,prop.yaw,prop.roll].every(Number.isFinite));
    }
    for(const op of drawOperations)for(const arg of op.args)if(typeof arg==='number')assert.ok(Number.isFinite(arg),op.name+' finite image geometry');
  }
  assert.ok(snapshot('spacePropMesh("rock",0).data.length/30') > 500);
  assert.ok(snapshot('spacePropMesh("wreck",0).data.length/30') > 300);
});
check('first battle draws the menu orbit while the new panorama is still loading', () => {
  isolated('sceneryLayer(0,true);sceneryCache.get(0).ready=false;');
  drawOperations.length=0;captureDraws=true;execute('drawBattlefield();');captureDraws=false;
  assert.ok(drawOperations.some(op=>op.name==='drawImage'&&op.args[0].src==='assets/scenery/orbit-silent.png'));
  execute('sceneryCache.get(0).ready=true;');
});
check('resize reuses decoded images and failed or absent Image loaders leave a safe fallback', () => {
  isolated();const loaded=execute('sceneryLayer(0).image');
  surface={width:3840,height:2160};execute('resizeBattlefield();');assert.equal(execute('sceneryLayer(0).image'),loaded);
  assert.equal(execute('sceneryCache.size<=3'),true);
  class FailingImage{set src(value){this.onerror?.();}}
  sandbox.Image=FailingImage;execute('sceneryCache.clear();');assert.equal(execute('sceneryLayer(0).failed'),true);
  execute('drawBattlefield();');
  delete sandbox.Image;execute('sceneryCache.clear();');assert.equal(execute('sceneryLayer(0)'),null);
  execute('drawBattlefield();');
});

check('fullscreen enter and exit keep every enemy identity and health in either browser event order', () => {
  for (const resizeFirst of [true,false]) {
    isolated(`battleTime=52;enemyCooldown=.73;powerupCooldown=2.4;
      spawnEnemy('scout');spawnEnemy('armored');spawnEnemy('gunner');
      enemies.forEach((enemy,index)=>Object.assign(enemy,{x:720+index*120,y:300+index*70,
        previousX:720+index*120,previousY:300+index*70,baseY:300+index*70,
        hp:.2+index*.1,displayHp:.3+index*.1,age:1.7,gunPhase:'recover',gunTime:.25}));
      var fullscreenEnemies=enemies.slice();`);
    const before=snapshot('({hp:enemies.map(e=>e.hp),display:enemies.map(e=>e.displayHp),age:enemies.map(e=>e.age),gun:enemies.map(e=>e.gunTime),score,kills,battleTime,enemyCooldown,powerupCooldown})');
    for (const fullscreen of [true,false,true,false]) {
      surface=fullscreen?{width:1920,height:1080}:{width:1280,height:720};
      document.fullscreenElement=fullscreen?nodes.get('#game-app'):null;
      if(resizeFirst){emit(window,'resize');emit(document,'fullscreenchange');}
      else{emit(document,'fullscreenchange');emit(window,'resize');}
      assert.equal(execute('enemies.length'),3);
      assert.equal(execute('enemies.every((enemy,index)=>enemy===fullscreenEnemies[index])'),true);
      assert.deepEqual(snapshot('({hp:enemies.map(e=>e.hp),display:enemies.map(e=>e.displayHp),age:enemies.map(e=>e.age),gun:enemies.map(e=>e.gunTime),score,kills,battleTime,enemyCooldown,powerupCooldown})'),before);
      assert.equal(execute('enemies.every(e=>Number.isFinite(e.x)&&Number.isFinite(e.y)&&e.previousX===e.x&&e.previousY===e.y)'),true);
      assert.equal(document.activeElement,canvas);
    }
  }
});
check('same-size resize and fullscreen notifications do not clear trajectories or refund a charging cannon', () => {
  isolated(`bossHitGrace=.45;spawnEnemy('gunner');enemies[0].gunPhase='warning';enemies[0].gunTime=.35;
    bullets.push({x:500,y:300,previousX:450,previousY:300});
    enemyProjectiles.push({x:650,y:300,previousX:670,previousY:300});
    ultimate.charges=2;requestUltimate();updateUltimate(.2);`);
  const before=snapshot('({enemies,bullets,enemyProjectiles,ultimate,shotCooldown,enemyCooldown,powerupCooldown,bossHitGrace})');
  emit(window,'resize');document.fullscreenElement=nodes.get('#game-app');emit(document,'fullscreenchange');
  emit(document,'fullscreenchange');document.fullscreenElement=null;emit(document,'fullscreenchange');
  assert.deepEqual(snapshot('({enemies,bullets,enemyProjectiles,ultimate,shotCooldown,enemyCooldown,powerupCooldown,bossHitGrace})'),before);
});
check('shrinking the flight area cannot immediately damage the player and preserves longer existing protection', () => {
  for(const previousGrace of [0,3.4]) {
    isolated(`player.x=player.previousX=400;player.y=player.previousY=350;
      spawnEnemy('scout');Object.assign(enemies[0],{x:400,previousX:400,y:450,previousY:450,baseY:450});
      bossHitGrace=${previousGrace};`);
    assert.equal(execute('enemyTouchesPlayer(enemies[0])'),false);
    surface={width:640,height:360};emit(window,'resize');
    assert.equal(execute('enemyTouchesPlayer(enemies[0])'),true);
    near(execute('bossHitGrace'),Math.max(previousGrace,execute('bossRules.grace')));
    execute('updatePlayerDamage(.05);');assert.equal(execute('player.lives'),3);
  }
});
check('a pixel-ratio-only change redraws the canvas without clearing the battle', () => {
  isolated('spawnEnemy("scout");bullets.push({x:500,y:300});var dpiEnemy=enemies[0];');
  const before=snapshot('({enemies,bullets,battleTime,enemyCooldown})');
  window.devicePixelRatio=2;emit(window,'resize');
  assert.equal(canvas.width,2560);assert.equal(canvas.height,1440);
  assert.equal(execute('enemies[0]===dpiEnemy'),true);
  assert.deepEqual(snapshot('({enemies,bullets,battleTime,enemyCooldown})'),before);
  window.devicePixelRatio=1;emit(window,'resize');
});
check('visible supplements and neutral props keep health, references and event timers through resizing', () => {
  isolated(`battleTime=50;spawnPowerup();spawnBattlefieldObject('wreck');
    Object.assign(powerups[0],{x:800,y:350});Object.assign(battlefieldEvents.objects[0],{x:950,y:450,hp:.42,age:3});
    battlefieldEvents.nextObject=57;battlefieldEvents.nextTransport=76;
    var resizeBall=powerups[0],resizeProp=battlefieldEvents.objects[0];`);
  const before=snapshot('({nextObject:battlefieldEvents.nextObject,nextTransport:battlefieldEvents.nextTransport,count:battlefieldEvents.objectCount,clock:battlefieldEvents.clock,powerupCooldown,powerupSpawnCount})');
  surface={width:1600,height:900};emit(window,'resize');
  assert.equal(execute('powerups.length===1&&powerups[0]===resizeBall'),true);
  assert.equal(execute('battlefieldEvents.objects.length===1&&battlefieldEvents.objects[0]===resizeProp'),true);
  near(execute('resizeProp.hp'),.42);near(execute('resizeProp.age'),3);
  near(execute('resizeBall.x'),1000);near(execute('resizeProp.x'),1187.5);
  assert.equal(execute('[resizeBall,resizeProp].every(e=>e.previousX===e.x&&e.previousY===e.y&&e.y>=flightBounds.top&&e.y<=flightBounds.bottom)'),true);
  assert.deepEqual(snapshot('({nextObject:battlefieldEvents.nextObject,nextTransport:battlefieldEvents.nextTransport,count:battlefieldEvents.objectCount,clock:battlefieldEvents.clock,powerupCooldown,powerupSpawnCount})'),before);
});
check('active formations keep their members and continue from their resized anchor without a horizontal snap', () => {
  isolated(`battleTime=60;trySpawnFormation('command');updateFormations(1.351);
    formationState.active.x=850;formationState.active.age=1.2;
    for(const enemy of enemies)formationControlsEnemy(enemy,0);
    enemies[0].hp=.37;var resizeGroup=formationState.active;var resizeMembers=enemies.slice();`);
  const before=snapshot('({sequence:formationState.sequence,nextTime:formationState.nextTime,suppression:formationState.suppression,age:formationState.active.age})');
  surface={width:1600,height:900};emit(window,'resize');
  assert.equal(execute('formationState.active===resizeGroup'),true);
  assert.equal(execute('enemies.every((enemy,index)=>enemy===resizeMembers[index]&&enemy.formationId===resizeGroup.id)'),true);
  near(execute('enemies[0].hp'),.37);
  assert.deepEqual(snapshot('({sequence:formationState.sequence,nextTime:formationState.nextTime,suppression:formationState.suppression,age:formationState.active.age})'),before);
  const positions=snapshot('enemies.map(e=>e.x)');
  execute('updateFormations(.05);for(const enemy of enemies)updateEnemyMovement(enemy,.05);');
  snapshot('enemies.map(e=>e.x)').forEach((x,index)=>near(x,positions[index]-execute('resizeGroup.speed')*.05));
  assert.equal(execute('enemies.every(e=>Math.abs(e.x-resizeGroup.x-e.formationSlotX)<1e-7)'),true);
});
check('a pending formation retains its warning countdown and launches the same resized plan', () => {
  isolated(`battleTime=60;trySpawnFormation('command');updateFormations(.25);
    var resizeWarning=formationState.warning;`);
  const remaining=execute('resizeWarning.remaining');surface={width:1600,height:900};emit(window,'resize');
  assert.equal(execute('formationState.warning===resizeWarning'),true);near(execute('resizeWarning.remaining'),remaining);
  execute(`updateFormations(${remaining+.001});`);
  assert.equal(execute('formationState.active.kind'),'command');assert.equal(execute('enemies.length'),5);
});
check('pincer wings retain a complete player-sized corridor through narrow-window round trips and subsequent frames', () => {
  isolated(`battleTime=60;trySpawnFormation('pincer');updateFormations(1.351);
    formationState.active.x=700;
    enemies.forEach((enemy,index)=>{enemy.hp=.2+index*.1;formationControlsEnemy(enemy,0);});
    var pincerResizeGroup=formationState.active,pincerResizeMembers=enemies.slice();`);
  assert.equal(execute('enemies.length'),4);
  const health=snapshot('enemies.map(e=>e.hp)');
  for(const size of [{width:640,height:360},{width:390,height:260},{width:1280,height:720}]) {
    surface=size;emit(window,'resize');
    assert.equal(execute('formationState.active===pincerResizeGroup'),true);
    assert.equal(execute('enemies.every((enemy,index)=>enemy===pincerResizeMembers[index])'),true);
    assert.deepEqual(snapshot('enemies.map(e=>e.hp)'),health);
    for(const advance of [false,true]) {
      if(advance)execute('updateFormations(.05);for(const enemy of enemies)updateEnemyMovement(enemy,.05);');
      else execute('for(const enemy of enemies)formationControlsEnemy(enemy,0);');
      const gap=execute(`Math.min(...enemies.filter(e=>e.formationSlotY>0).map(e=>e.y-e.height/2))
        -Math.max(...enemies.filter(e=>e.formationSlotY<0).map(e=>e.y+e.height/2))`);
      assert.ok(gap+1e-8>=execute('player.height+24'),JSON.stringify({size,advance,gap}));
      execute('player.x=player.previousX=pincerResizeGroup.x;player.y=player.previousY=pincerResizeGroup.centerY;');
      assert.equal(execute('enemies.every(enemy=>!enemyTouchesPlayer(enemy))'),true);
      assert.equal(execute('enemies.every(e=>e.y-e.height/2>=-1e-8&&e.y+e.height/2<=viewport.height+1e-8)'),true);
    }
  }
});
check('supply transport and escorts survive resizing and retain their movement baseline next frame', () => {
  isolated(`battleTime=55;spawnSupplyTransport();var resizeCargo=battlefieldEvents.transport;
    for(const enemy of enemies)Object.assign(enemy,{x:800,y:350,previousX:800,previousY:350,baseY:350});
    resizeCargo.hp=.44;resizeCargo.age=0;var resizeEscort=enemies[1];
    battlefieldEvents.nextTransport=131;`);
  surface={width:1600,height:900};emit(window,'resize');
  assert.equal(execute('battlefieldEvents.transport===resizeCargo&&enemies.includes(resizeCargo)&&enemies.includes(resizeEscort)'),true);
  assert.equal(execute('enemies.length'),3);near(execute('resizeCargo.hp'),.44);
  near(execute('battlefieldEvents.nextTransport'),131);assert.equal(execute('powerups.length'),0);
  const x=execute('resizeCargo.x'),y=execute('resizeCargo.y');execute('updateEncounter(.05);');
  near(execute('resizeCargo.x'),x-execute('resizeCargo.speed')*.05);
  assert.ok(Math.abs(execute('resizeCargo.y')-y)<1);
  assert.equal(execute('battlefieldEvents.transport===resizeCargo'),true);assert.equal(execute('score'),0);
});
check('not-yet-entered enemies, orbs and props stay beyond the new right edge', () => {
  isolated('spawnEnemy("scout");spawnEnemy("armored");spawnEnemy("gunner");spawnPowerup();spawnBattlefieldObject();');
  for(const size of [{width:640,height:360},{width:1920,height:1080},{width:900,height:600}]) {
    surface=size;emit(window,'resize');
    assert.equal(execute('[...enemies,...powerups,...battlefieldEvents.objects].every(e=>e.x>viewport.width)'),true);
    assert.equal(execute('enemies.length'),3);assert.equal(execute('powerups.length'),1);assert.equal(execute('battlefieldEvents.objects.length'),1);
  }
});
check('transient zero-size notifications leave the current battle untouched', () => {
  isolated('spawnEnemy("armored");bullets.push({x:500,y:300});');
  const before=snapshot('({viewport,player,enemies,bullets,enemyCooldown})');
  for(const size of [{width:0,height:720},{width:1280,height:0}]){surface=size;emit(window,'resize');}
  assert.deepEqual(snapshot('({viewport,player,enemies,bullets,enemyCooldown})'),before);
});

function positionJourneyClock(leg, phase) {
  execute(`battleTime=battlefieldState.clock=${leg * 75 + phase};scenerySyncJourney();`);
}
function advanceJourneyFrames(seconds) {
  for (let frame = 0; frame < Math.round(seconds / .05); frame++) step();
}
check('five flight encounters start from their own sector and advance on the active clock', () => {
  const ids = ['orbit','belt','wreck','citadel','rift'];
  for (const [leg,id] of ids.entries()) {
    isolated();
    positionJourneyClock(leg, leg === 0 ? 8.9 : 13.9);
    step();
    assert.equal(execute('journeyState.scene'),null);
    advanceJourneyFrames(.15);
    assert.equal(execute('journeyState.scene.id'),id);
    near(execute('journeyState.scene.duration'),30);
    const elapsed=execute('journeyState.scene.elapsed');
    advanceJourneyFrames(.5);
    near(execute('journeyState.scene.elapsed'),elapsed+.5);
  }
});
check('flight encounters wait for already active special events', () => {
  const conflicts = [
    ['spawnSupplyTransport();','battlefieldEvents.transport'],
    ['trySpawnFormation("command");','formationState.warning'],
    ['spawnAceEnemy();','aceEncounter.target']
  ];
  for (const [setup,occupant] of conflicts) {
    isolated();
    positionJourneyClock(3,15);
    execute(setup);
    assert.ok(execute(occupant),setup);
    step();
    assert.equal(execute('journeyState.scene'),null,setup);
    assert.ok(execute(occupant),setup);
  }
});
check('a due flight encounter reserves room before same-frame major spawns', () => {
  isolated();
  positionJourneyClock(3,15);
  execute('aceEncounter.nextTime=formationState.nextTime=battlefieldEvents.nextTransport=0;');
  step();
  assert.equal(execute('journeyState.scene.id'),'citadel');
  assert.equal(execute('journeyBlocksNewEncounters()'),true);
  assert.equal(execute('aceBlocksWaves()||!!formationState.warning||battlefieldEventBlocksWaves()'),false);
});
check('a missed flight encounter remains eligible next loop and a completed one does not repeat', () => {
  isolated();
  positionJourneyClock(3,15);
  execute('nextBossTime=battleTime+20;');
  step();
  assert.equal(execute('journeyState.scene'),null);
  assert.equal(execute('journeyState.seen.has("citadel")'),false);
  positionJourneyClock(3,53.1);
  execute('nextBossTime=Infinity;');
  step();
  assert.equal(execute('journeyState.scene'),null);
  positionJourneyClock(8,3.1);
  step();
  assert.equal(execute('journeyState.scene.id'),'citadel');
  execute('bossHitGrace=60;');
  advanceJourneyFrames(30.1);
  assert.equal(execute('journeyState.scene'),null);
  assert.equal(execute('journeyState.seen.has("citadel")'),true);
  positionJourneyClock(13,15);
  step();
  assert.equal(execute('journeyState.scene'),null);
});
check('pausing, changing fullscreen and restarting keep or clear the flight encounter at the right time', () => {
  isolated();
  positionJourneyClock(1,15);
  step();
  execute('var liveJourneyScene=journeyState.scene;');
  assert.equal(execute('liveJourneyScene.id'),'belt');
  const elapsed=execute('liveJourneyScene.elapsed'),clock=execute('battlefieldState.clock');
  emit(window,'blur'); advanceJourneyFrames(.5);
  near(execute('liveJourneyScene.elapsed'),elapsed);
  near(execute('battlefieldState.clock'),clock);
  emit(window,'focus'); canvas.focus();
  for (const fullscreen of [true,false]) {
    surface=fullscreen?{width:1920,height:1080}:{width:1280,height:720};
    document.fullscreenElement=fullscreen?nodes.get('#game-app'):null;
    emit(window,'resize'); emit(document,'fullscreenchange');
    assert.equal(execute('liveJourneyScene===journeyState.scene'),true);
    near(execute('liveJourneyScene.elapsed'),elapsed);
  }
  advanceJourneyFrames(.5);
  const resumed=execute('liveJourneyScene.elapsed')-elapsed;
  near(resumed,execute('battlefieldState.clock')-clock);
  assert.ok(resumed>=.44&&resumed<=.50000001);
  begin();
  assert.equal(execute('journeyState.scene'),null);
  assert.equal(execute('journeyState.seen.size'),0);
});
check('a newly due Boss warning takes precedence over an active flight encounter', () => {
  isolated();
  positionJourneyClock(3,15);
  step();
  assert.equal(execute('journeyState.scene.id'),'citadel');
  execute('nextBossTime=battleTime+bossRules.warning;');
  step();
  assert.equal(execute('journeyState.scene'),null);
  assert.ok(execute('pendingBossType!==null'));
  assert.equal(execute('journeyState.seen.has("citadel")'),false);
});
check('the hangar wave respects the same global enemy cap under saturated conditions', () => {
  isolated();
  positionJourneyClock(3,15);
  step();
  assert.equal(execute('journeyState.scene.id'),'citadel');
  execute(`while(enemies.length<enemyRules.maxOnScreen){
    spawnEnemy("scout");
    const enemy=enemies.at(-1);
    Object.assign(enemy,{x:viewport.width*2,previousX:viewport.width*2,speed:0});
  }`);
  advanceJourneyFrames(14);
  assert.equal(execute('enemies.length'),execute('enemyRules.maxOnScreen'));
});

check('sunrise gives normal waves a breather and leaves existing fighters in play', () => {
  isolated('spawnEnemy("scout");var sunriseEnemy=enemies[0];sunriseEnemy.speed=0;');
  positionJourneyClock(0,9);
  execute('enemyCooldown=0;');
  step();
  assert.equal(execute('journeyState.scene.id'),'orbit');
  assert.equal(execute('journeyBlocksWaves()'),true);
  advanceJourneyFrames(8);
  assert.equal(execute('enemies[0]===sunriseEnemy'),true);
  near(execute('enemyCooldown'),0);
  advanceJourneyFrames(5.1);
  assert.equal(execute('journeyBlocksWaves()'),false);
  assert.ok(execute('enemies.length>1'));
});
check('belt encounter puts a real yellow upgrade between the two moving covers', () => {
  isolated();
  positionJourneyClock(1,15);
  step(); advanceJourneyFrames(11.2);
  const rocks=snapshot('battlefieldEvents.objects.filter(object=>object.journeyType==="belt")');
  assert.equal(rocks.length,2);
  const orb=snapshot('powerups.find(powerup=>powerup.journeyBelt)');
  assert.equal(orb.type,'yellow');
  assert.ok(orb.y > rocks[0].y + rocks[0].height * .4);
  assert.ok(orb.y < rocks[1].y - rocks[1].height * .4);
  const lanes=execute('weapon.lanes');
  projectile(orb.x-150,orb.x+40,orb.y);
  execute('resolveProjectileHits();');
  assert.equal(execute('powerups.some(powerup=>powerup.journeyBelt)'),false);
  assert.equal(execute('weapon.lanes'),lanes+1);
  assert.equal(execute('battlefieldEvents.objects.filter(object=>object.journeyType==="belt"&&object.hp===1).length'),2);
});
check('wreck cover opens a new central line of fire', () => {
  isolated();
  positionJourneyClock(2,15);
  step(); advanceJourneyFrames(9.1);
  const centralLineBlocked = () => execute(`(()=>{
    const covers=battlefieldEvents.objects.filter(object=>object.journeyType==="wreck");
    const y=(flightBounds.top+flightBounds.bottom)/2;
    const shot={previousX:covers[0].x-200,x:covers[0].x+200,y,previousY:y,halfHeight:2.5,length:26,angle:0};
    return covers.some(cover=>Number.isFinite(projectileEnemyEntry(shot,cover)));
  })()`);
  assert.equal(centralLineBlocked(),true);
  advanceJourneyFrames(7.4);
  assert.equal(centralLineBlocked(),false);
});
check('the citadel hangar launches three real fighters and creates live cover', () => {
  isolated();
  positionJourneyClock(3,15);
  step(); advanceJourneyFrames(12.1);
  assert.equal(execute('formationState.active.kind'),'hangar');
  assert.equal(execute('formationState.active.members.length'),3);
  assert.equal(execute('formationState.active.members.every(member=>enemies.includes(member))'),true);
  assert.equal(execute('battlefieldEvents.objects.some(object=>object.journeyType==="citadel")'),true);
  assert.ok(execute('formationState.active.members[0].journeyLaunchUntil>battleTime'));
});
check('the rift scene holds the tide until its cue and keeps a complete warning', () => {
  isolated();
  positionJourneyClock(4,15);
  step(); advanceJourneyFrames(11.9);
  assert.equal(execute('journeyState.scene.id'),'rift');
  assert.equal(execute('gravityTide.phase'),'idle');
  advanceJourneyFrames(.2);
  assert.equal(execute('gravityTide.phase'),'warning');
  advanceJourneyFrames(2.1);
  assert.equal(execute('gravityTide.phase'),'warning');
  advanceJourneyFrames(.4);
  assert.equal(execute('gravityTide.phase'),'active');
});

check('flight encounter layers render finite geometry with normal and reduced motion', () => {
  isolated();
  for (const quiet of [false,true]) for (const id of ['orbit','belt','wreck','citadel','rift']) {
    let painted=false;
    for (const elapsed of [3,12,20,27]) {
      drawOperations.length=0;
      captureDraws=true;
      try {
        execute(`reducedMotion.matches=${quiet};var sceneUnderTest={id:"${id}",elapsed:${elapsed},duration:30,progress:${elapsed}/30,blend:0,events:new Set()};
          drawJourneyScene(sceneUnderTest,"back");drawJourneyScene(sceneUnderTest,"front");`);
      } finally { captureDraws=false; }
      painted ||= drawOperations.some(op=>['fill','fillRect','drawImage','stroke'].includes(op.name));
      for (const op of drawOperations) for (const value of op.args) if (typeof value==='number')
        assert.ok(Number.isFinite(value),id+' '+op.name+' emitted '+value);
    }
    assert.ok(painted,id+' should paint at least one phase');
  }
});

check('a late scene can reserve its main action without delaying a Boss warning', () => {
  isolated();
  positionJourneyClock(3,51);
  execute('nextBossTime=battleTime+28;');
  step();
  assert.equal(execute('journeyState.scene.id'),'citadel');
  advanceJourneyFrames(23.1);
  assert.equal(execute('journeyState.scene'),null);
  assert.ok(execute('pendingBossType!==null'));
  assert.equal(execute('journeyState.seen.has("citadel")'),true);
});

check('live belt cover keeps its hit state and usable gap on viewport round trips', () => {
  isolated();
  positionJourneyClock(1,15);
  step(); advanceJourneyFrames(11.2);
  execute('var resizedRocks=battlefieldEvents.objects.filter(object=>object.journeyType==="belt");resizedRocks[0].hp=.54;');
  const original=snapshot('resizedRocks.map(rock=>({width:rock.width,height:rock.height}))');
  for (const size of [{width:800,height:450},{width:1280,height:720}]) {
    surface=size;emit(window,'resize');
    assert.equal(execute('resizedRocks.every(rock=>battlefieldEvents.objects.includes(rock))'),true);
    near(execute('resizedRocks[0].hp'),.54);
    assert.equal(execute('resizedRocks.every(rock=>rock.previousX===rock.x&&rock.previousY===rock.y)'),true);
    const dimensions=snapshot('resizedRocks.map(rock=>({width:rock.width,height:rock.height}))');
    if (size.width===800) assert.ok(dimensions[0].width<original[0].width&&dimensions[0].height<original[0].height);
    else assert.deepEqual(dimensions,original);
    assert.ok(execute(`(()=>{
      const orb=powerups.find(powerup=>powerup.journeyBelt);
      const y=orb.y;
      const shot={previousX:orb.x-150,x:orb.x+40,y,previousY:y,halfHeight:2.5,length:26,angle:0};
      return resizedRocks[0].y+resizedRocks[0].height/2<y && y<resizedRocks[1].y-resizedRocks[1].height/2
        && resizedRocks.every(rock=>!Number.isFinite(projectileEnemyEntry(shot,rock)));
    })()`));
  }
});

process.stdout.write(`\n${checks} v13 integration checks passed, ${failedChecks} failed.\n`);
if (failedChecks) process.exitCode=1;



