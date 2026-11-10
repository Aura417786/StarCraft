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
for (const id of ['pause-button', 'pause-screen', 'pause-menu', 'pause-settings-panel', 'pause-confirm-panel',
  'pause-title', 'pause-description', 'pause-resume', 'pause-cancel', 'pause-confirm', 'pause-sound',
  'pause-shake', 'pause-quality', 'pause-restart', 'pause-settings', 'pause-back', 'pause-exit']) {
  nodes.set('#' + id, mockNode());
}
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
// 固定火力基准供碰撞、时序和成长断言使用。出击机库实测使用各机型的正式数值。
function begin() {
  emit(window, 'focus');
  emit(nodes.get('#start-button'), 'click');
  vm.runInContext(`weapon.damage = 1; weapon.interval = 0.2;
    powerupCooldown = 999; enemyCooldown = 999; nextBossTime = Infinity;
    formationState.nextTime = Infinity; aceEncounter.nextTime = Infinity;
    battlefieldEvents.nextObject = Infinity; battlefieldEvents.nextTransport = Infinity;`, sandbox);
  step();
}
function leaveBattle() {
  emit(nodes.get('#menu-button'), 'click');
  if (!nodes.get('#pause-screen').hidden) emit(nodes.get('#pause-confirm'), 'click');
}
function key(code, type = 'keydown', extra) { return emit(window, type, { code, ...extra }); }
function samePosition(a, b) { assert.equal(a.x, b.x); assert.equal(a.y, b.y); }
let checks = 0;
let failedChecks = 0;
function check(name, test) {
  try { test(); checks++; process.stdout.write('PASS ' + name + '\n'); }
  catch (error) { failedChecks++; process.stderr.write('FAIL ' + name + ': ' + error.message + '\n'); }
}

check('all eight movement keys, release, and prevented page scrolling', () => {
  for (const [code, axis, direction] of [
    ['ArrowLeft', 'x', -1], ['KeyA', 'x', -1], ['ArrowRight', 'x', 1], ['KeyD', 'x', 1],
    ['ArrowUp', 'y', -1], ['KeyW', 'y', -1], ['ArrowDown', 'y', 1], ['KeyS', 'y', 1],
  ]) {
    begin(); const before = position();
    assert.equal(key(code).prevented, true); step();
    assert.ok((position()[axis] - before[axis]) * direction > 0);
    key(code, 'keyup'); const stopped = position(); step(); samePosition(position(), stopped);
  }
});
check('diagonal speed equals straight speed; alias keys do not double speed', () => {
  begin(); let before = position(); key('ArrowRight'); step();
  const straight = position().x - before.x;
  begin(); before = position(); key('ArrowRight'); key('ArrowUp'); step();
  assert.ok(Math.abs(Math.hypot(position().x - before.x, position().y - before.y) - straight) < 1e-8);
  begin(); before = position(); key('ArrowRight'); key('KeyD'); step();
  assert.equal(position().x - before.x, straight);
});
check('opposing directions cancel', () => {
  begin(); const before = position(); key('ArrowLeft'); key('KeyD'); step(); samePosition(position(), before);
});
check('ship remains within each of the four bounds', () => {
  for (const [code, axis, bound] of [
    ['ArrowLeft', 'x', 'left'], ['ArrowRight', 'x', 'right'],
    ['ArrowUp', 'y', 'top'], ['ArrowDown', 'y', 'bottom'],
  ]) {
    begin(); key(code); for (let i = 0; i < 80; i++) step();
    assert.equal(position()[axis], bounds[bound]);
  }
});
check('window blur and canvas blur clear held keys; clicking refocuses canvas', () => {
  for (const target of [window, canvas]) {
    begin(); key('KeyD'); step(); emit(target, 'blur');
    const before = position(); step(); step(); samePosition(position(), before);
  }
  nodes.get('#menu-button').focus(); const before = position(); key('KeyA'); step();
  samePosition(position(), before); emit(canvas, 'pointerdown'); assert.equal(document.activeElement, canvas);
});
check('hidden tab stops movement and returning does not retain keys', () => {
  begin(); key('KeyW'); step(); document.hidden = true; emit(document, 'visibilitychange');
  const before = position(); step(); samePosition(position(), before);
  document.hidden = false; emit(document, 'visibilitychange'); step(); step(); samePosition(position(), before);
});
check('returning and re-entering resets position, focus, and held keys', () => {
  begin(); const initial = position(); key('KeyD'); step(); leaveBattle();
  assert.equal(nodes.get('#battle-screen').hidden, true); begin(); step(); samePosition(position(), initial);
  assert.equal(document.activeElement, canvas); assert.equal(nodes.get('#movement-hint').hidden, false);
});
check('menu ignores movement; shortcuts do not move the ship', () => {
  leaveBattle(); const before = position();
  assert.equal(key('ArrowUp').prevented, false); step(); samePosition(position(), before);
  begin(); const inBattle = position(); key('KeyD', 'keydown', { ctrlKey: true }); step(); samePosition(position(), inBattle);
});
check('landscape start, resize bounds and high DPI rendering', () => {
  surface = { width: 1600, height: 900 }; window.devicePixelRatio = 2;
  emit(window, 'resize'); begin();
  assert.ok(position().x < surface.width / 4);
  assert.equal(canvas.width, 3200); assert.equal(canvas.height, 1800);
  key('ArrowRight'); for (let i = 0; i < 100; i++) step();
  surface = { width: 640, height: 360 }; emit(window, 'resize');
  assert.ok(position().x <= bounds.right && position().x >= bounds.left);
  assert.ok(position().y <= bounds.bottom && position().y >= bounds.top);
  const resized = position(); step(); step(); samePosition(position(), resized);
  for (const size of [{width: 390, height: 844}, {width: 1920, height: 1080}]) {
    surface = size; emit(window, 'resize'); begin();
    for (const [code, axis, edge] of [['ArrowRight','x','right'],['ArrowDown','y','bottom']]) {
      key(code); for (let i=0;i<140;i++) step(); key(code, 'keyup');
      assert.equal(position()[axis], bounds[edge]);
    }
  }
});
check('layered starfield advances its animation clock while battle is active', () => {
  const before = vm.runInContext('battlefieldState.clock', sandbox); step();
  const after = vm.runInContext('battlefieldState.clock', sandbox);
  assert.ok(after > before);
});
const shots = () => JSON.parse(vm.runInContext('JSON.stringify(bullets.map(({x,y}) => ({x,y})))', sandbox));
function frames(count, seconds = 0.05) { for (let index = 0; index < count; index++) step(seconds); }
function finishBossPresentation() {
  const left = execute('bossPresentation.duration - bossPresentation.age');
  frames(Math.ceil(left / .05) + 2);
  assert.equal(execute('isBossDeathPlaying()'), false);
}
check('fires immediately, then five shots per second without keyboard input', () => {
  surface = { width: 2400, height: 900 }; emit(window, 'resize'); begin();
  assert.equal(shots().length, 1); frames(20);
  assert.equal(shots().length, 6);
  begin(); frames(100, 0.01); assert.equal(shots().length, 6);
});
check('new bullets follow the current nose while older bullets keep their flight line', () => {
  begin(); const first = shots()[0];
  key('ArrowDown'); frames(4); key('ArrowDown', 'keyup');
  const current = shots(); const newest = current.at(-1);
  assert.equal(current.length, 2); assert.equal(current[0].y, first.y);
  assert.equal(newest.y, position().y); assert.ok(newest.y > first.y);
  const shipWidth = vm.runInContext('player.width', sandbox);
  assert.ok(Math.abs(newest.x - (position().x + shipWidth * 0.465 + 3)) < 1e-8);
});
check('bullets travel right at configured speed and clean up during a long run', () => {
  begin(); const first = shots()[0]; step();
  assert.equal(shots()[0].x - first.x, 36);
  surface = { width: 1280, height: 720 }; emit(window, 'resize'); begin();
  vm.runInContext('enemyCooldown = 999; enemies.length = 0;', sandbox);
  frames(1200);
  assert.ok(shots().length > 0 && shots().length <= 10);
  assert.ok(shots().every(bullet => bullet.x <= surface.width));
});
check('window blur, hidden tabs and control focus pause shooting without catch-up bursts', () => {
  begin(); frames(2); emit(window, 'blur');
  let frozen = shots(); frames(100); assert.deepEqual(shots(), frozen);
  assert.equal(nodes.get('#pause-hint').hidden, false);
  emit(window, 'focus'); step(); assert.deepEqual(shots(), frozen);
  frames(4); assert.ok(shots().length <= frozen.length + 1);
  document.hidden = true; emit(document, 'visibilitychange');
  frozen = shots(); frames(100); assert.deepEqual(shots(), frozen);
  document.hidden = false; emit(document, 'visibilitychange'); step();
  nodes.get('#menu-button').focus(); frozen = shots();
  frames(100); assert.deepEqual(shots(), frozen);
  emit(canvas, 'pointerdown'); assert.equal(nodes.get('#pause-hint').hidden, true);
  step(); frames(4); assert.ok(shots().length <= frozen.length + 1);
});
check('menu clears all bullets and re-entering starts a fresh firing cycle', () => {
  begin(); key('KeyW'); frames(4); key('KeyW', 'keyup');
  assert.ok(shots().length > 0); leaveBattle();
  assert.equal(shots().length, 0); frames(100); assert.equal(shots().length, 0);
  assert.equal(nodes.get('#pause-hint').hidden, true);
  begin(); assert.equal(shots().length, 1); assert.equal(shots()[0].y, position().y);
});
check('resize clears old trajectories and resumes at the resized ship nose', () => {
  begin(); frames(8); surface = { width: 640, height: 360 }; emit(window, 'resize');
  assert.equal(shots().length, 0); step(); assert.equal(shots().length, 1);
  assert.equal(shots()[0].y, position().y);
});

const scene = () => JSON.parse(vm.runInContext('JSON.stringify({ enemies, explosions, score, battleTime })', sandbox));
function isolatedBattle(code = '') {
  surface = { width: 1280, height: 720 }; emit(window, 'resize'); begin();
  vm.runInContext('bullets.length = 0; enemies.length = 0; explosions.length = 0; shotCooldown = 999; enemyCooldown = 999;' + code, sandbox);
}
const target = (x = 400, y = 300, width = 100, hp = 1) =>
  `enemies.push({x:${x},previousX:${x},y:${y},previousY:${y},width:${width},height:64,speed:110,hp:${hp},maxHp:${hp},displayHp:${hp},hitFlash:0});`;
const shot = (x = 350, y = 300) => `bullets.push({x:${x},previousX:${x},y:${y}});`;
check('enemy schedule, initial aim lane and leftward travel', () => {
  isolatedBattle('enemyCooldown = 0.6;'); frames(11); assert.equal(scene().enemies.length, 0);
  step(); let spawned = scene().enemies; assert.equal(spawned.length, 1);
  assert.equal(spawned[0].y, (bounds.top + bounds.bottom) / 2);
  assert.ok(spawned[0].x > surface.width);
  step(); assert.ok(scene().enemies[0].x < spawned[0].x);
  frames(23); assert.equal(scene().enemies.length, 2);
  assert.notEqual(scene().enemies[0].y, scene().enemies[1].y);
});
check('one hit removes both objects, grants exactly 100 and creates feedback', () => {
  isolatedBattle(target() + shot()); step(); const result = scene();
  assert.equal(result.enemies.length, 0); assert.equal(shots().length, 0);
  assert.equal(result.score, 100); assert.equal(result.explosions.length, 1);
  assert.equal(nodes.get('#score').textContent, '000100');
  frames(10); assert.equal(scene().score, 100);
});
check('one bullet hits the nearer target and cannot penetrate a second enemy', () => {
  isolatedBattle(target(420) + target(400) + shot(325)); step();
  assert.equal(scene().score, 100); assert.equal(scene().enemies.length, 1);
  assert.ok(scene().enemies[0].x > 410); assert.equal(shots().length, 0);
});
check('two bullets hitting one target cannot double count the kill', () => {
  isolatedBattle(target() + shot() + shot()); step();
  assert.equal(scene().score, 100); assert.equal(scene().explosions.length, 1);
  assert.equal(shots().length, 1);
});
check('off-axis shots miss and escaped enemies award no points', () => {
  isolatedBattle(target() + shot(350, 350)); step();
  assert.equal(scene().score, 0); assert.equal(scene().enemies.length, 1);
  vm.runInContext('enemies[0].x = -100;', sandbox); step();
  assert.equal(scene().enemies.length, 0); assert.equal(scene().score, 0);
});
check('swept collision catches fast bullets and hits at the right screen edge', () => {
  isolatedBattle(target(400, 300, 12) + shot(330));
  vm.runInContext('weapon.speed = 3000;', sandbox); step();
  assert.equal(scene().score, 100);
  vm.runInContext('weapon.speed = 720;', sandbox);
  isolatedBattle(target(1279) + shot(1250)); step();
  assert.equal(scene().score, 100); assert.equal(shots().length, 0);
});
check('pause freezes enemies, score, effects and spawn timer', () => {
  isolatedBattle(target() + shot()); step();
  vm.runInContext(target(900) + 'enemyCooldown = 0.3;', sandbox);
  nodes.get('#menu-button').focus(); const before = scene(); frames(100);
  assert.deepEqual(scene(), before);
  emit(canvas, 'pointerdown'); step(); assert.deepEqual(scene(), before);
  frames(7); assert.equal(scene().enemies.length, 2);
});
check('effects expire and reduced-motion mode uses shorter feedback', () => {
  isolatedBattle(target() + shot()); step(); frames(12);
  assert.equal(scene().explosions.length, 0);
  isolatedBattle(target() + shot()); vm.runInContext('reducedMotion.matches = true;', sandbox);
  step(); assert.equal(scene().explosions[0].duration, 0.2); frames(5);
  assert.equal(scene().explosions.length, 0);
  vm.runInContext('reducedMotion.matches = false;', sandbox);
});
check('resize keeps points; returning to menu resets the entire encounter', () => {
  isolatedBattle(target() + shot()); step();
  surface = {width:640,height:360}; emit(window, 'resize');
  assert.equal(scene().score, 100); assert.equal(scene().enemies.length, 0);
  assert.equal(scene().explosions.length, 0);
  leaveBattle();
  assert.equal(scene().score, 0); assert.equal(nodes.get('#score').textContent, '000000');
  frames(100); assert.equal(scene().enemies.length, 0); begin();
  assert.equal(scene().score, 0); assert.equal(scene().enemies.length, 0);
});





check('nonlethal hits consume a bullet and reduce HP without awarding points', () => {
  isolatedBattle(target(400,300,100,3) + shot()); step();
  assert.equal(scene().enemies[0].hp, 2); assert.equal(scene().score, 0);
  assert.equal(shots().length, 0); assert.equal(scene().explosions.length, 0);
  vm.runInContext(shot(), sandbox); step();
  assert.equal(scene().enemies[0].hp, 1); assert.equal(scene().score, 0);
  vm.runInContext(shot(), sandbox); step();
  assert.equal(scene().enemies.length, 0); assert.equal(scene().score, 100);
  assert.equal(scene().explosions.length, 1);
});
check('simultaneous hits damage separately and score only one lethal hit', () => {
  isolatedBattle(target(400,300,100,2) + shot() + shot() + shot()); step();
  assert.equal(scene().enemies.length, 0); assert.equal(scene().score, 100);
  assert.equal(scene().explosions.length, 1); assert.equal(shots().length, 1);
  isolatedBattle(target(400,300,100,5) + shot().repeat(5)); step();
  assert.equal(scene().score, 100); assert.equal(shots().length, 0);
});
check('a damaged enemy escaping the screen grants no kill points', () => {
  isolatedBattle(target(400,300,100,2) + shot()); step();
  assert.equal(scene().enemies[0].hp, 1);
  vm.runInContext('enemies[0].x = -100;', sandbox); step();
  assert.equal(scene().enemies.length, 0); assert.equal(scene().score, 0);
});
check('combat clock and difficulty pause with the battle and cross the threshold on resume', () => {
  isolatedBattle('battleTime = 19.95; updateDifficultyDisplay();');
  assert.equal(nodes.get('#battle-clock').textContent, '00:19');
  emit(window, 'blur'); frames(100);
  assert.equal(scene().battleTime, 19.95); assert.equal(vm.runInContext('enemyHealthForTime()', sandbox), 1);
  emit(window, 'focus'); step(); step();
  assert.ok(Math.abs(scene().battleTime - 20) < 1e-8);
  assert.equal(nodes.get('#battle-clock').textContent, '00:20');
  assert.equal(vm.runInContext('enemyHealthForTime()', sandbox), 5);
  document.hidden = true; emit(document, 'visibilitychange');
  const frozen = scene().battleTime; frames(100); assert.equal(scene().battleTime, frozen);
  document.hidden = false; emit(document, 'visibilitychange');
});


const health = () => JSON.parse(vm.runInContext('JSON.stringify({lives:player.lives,state,kills})', sandbox));
function leak() { vm.runInContext(target(position().x - 200, position().y + 100), sandbox); }
function collide() { vm.runInContext(target(position().x, position().y) + 'updatePlayerDamage(0);', sandbox); }
function loseRound() {
  isolatedBattle('score=700;kills=7;battleTime=65;updateDifficultyDisplay();');
  for(let i=0;i<3;i++) { vm.runInContext("bossHitGrace=0;",sandbox); collide(); }
}
const execute = code => vm.runInContext(code, sandbox);
const weaponState = () => JSON.parse(execute('JSON.stringify(weapon)'));
check('all three hangar selections apply distinct starting weapons and special names', () => {
  for (const [id, rate, lanes, damage, special] of [
    ['red', 3.6, 1, 2.2, '赤焰贯星炮'],
    ['blue', 8, 2, 0.48, '离子猎群'],
    ['yellow', 4, 3, 0.65, '日冕弹幕'],
  ]) {
    execute(`selectedFighter=${JSON.stringify(id)};showScreen("battle");`);
    const start = weaponState();
    near(1 / start.interval, rate);
    assert.equal(start.lanes, lanes); assert.equal(start.damage, damage);
    assert.equal(execute('ultimateName()'), special);
    execute('applyPowerup("red");applyPowerup("heal");ultimate.charges=2;showScreen("battle");');
    assert.deepEqual(weaponState(), start);
    assert.equal(execute('player.lives'), 3);
    assert.equal(execute('ultimate.charges'), 0);
  }
  execute('selectedFighter="red";showScreen("menu");');
});
const orbScene = () => JSON.parse(execute('JSON.stringify({powerups,powerupCooldown,powerupSpawnCount,upgradeNoticeTime})'));
const orb = (type='blue', x=400, y=300) => `powerups.push({x:${x},previousX:${x},y:${y},radius:18,type:'${type}'});`;
check('each orb takes one bullet, changes no score and counts no enemy kill', () => {
  for (const [type, attribute, value] of [['blue','speedLevel',2],['yellow','lanes',2],['red','damage',1.8]]) {
    isolatedBattle(orb(type) + shot()); step();
    near(weaponState()[attribute],value); assert.equal(orbScene().powerups.length,0);
    assert.equal(shots().length,0); assert.equal(scene().score,0); assert.equal(health().kills,0);
  }
});
check('two simultaneous bullets cannot upgrade twice from the same orb', () => {
  isolatedBattle(orb('yellow') + shot() + shot()); step();
  assert.equal(weaponState().lanes,2); assert.equal(orbScene().powerups.length,0);
  assert.equal(shots().length,1);
});
check('off-axis bullets miss; touching an orb does not upgrade or hurt the player', () => {
  isolatedBattle(orb('blue',400,350) + shot()); step();
  assert.equal(weaponState().speedLevel,1); assert.equal(orbScene().powerups.length,1);
  isolatedBattle(orb('red',position().x,position().y)); step();
  assert.equal(weaponState().damage,1); assert.equal(health().lives,3);
  assert.equal(orbScene().powerups.length,1); assert.equal(scene().score,0);
});
check('swept hits catch a fast bullet and an orb at the right screen edge', () => {
  isolatedBattle(orb('blue') + shot(330)); execute('weapon.speed = 3000;'); step();
  assert.equal(weaponState().speedLevel,2); assert.equal(orbScene().powerups.length,0);
  execute('weapon.speed=720;');
  isolatedBattle(orb('yellow',1279) + shot(1250)); step();
  assert.equal(weaponState().lanes,2); assert.equal(shots().length,0);
});
check('nearest target wins regardless of whether it is an orb or enemy', () => {
  isolatedBattle(orb('blue',370) + target(420,300,12) + shot(330)); execute('weapon.speed=3000;'); step();
  assert.equal(weaponState().speedLevel,2); assert.equal(scene().score,0);
  assert.equal(scene().enemies.length,1); assert.equal(shots().length,0);
  isolatedBattle(orb('blue',400) + target(350,300,12) + shot(300)); step();
  assert.equal(weaponState().speedLevel,1); assert.equal(scene().score,100);
  assert.equal(orbScene().powerups.length,1); assert.equal(shots().length,0);
  execute('weapon.speed=720;');
});
check('three-second first blue spawn, seven-second interval and varied fixed flight lanes', () => {
  isolatedBattle('powerupCooldown=3;'); frames(59); assert.equal(orbScene().powerups.length,0);
  step(); let result=orbScene(); assert.equal(result.powerupSpawnCount,1);
  assert.equal(result.powerups[0].type,'blue');
  const laneY=bounds.top+(bounds.bottom-bounds.top)*.36;
  assert.ok(Math.abs(result.powerups[0].y-laneY)<1e-8);
  const before=result.powerups[0]; step(); result=orbScene();
  assert.ok(result.powerups[0].x<before.x); assert.equal(result.powerups[0].y,before.y);
  frames(139); result=orbScene(); assert.equal(result.powerupSpawnCount,2);
  assert.ok(['blue','yellow','red','heal'].includes(result.powerups.at(-1).type)); assert.notEqual(result.powerups.at(-1).y,laneY);
  frames(140); assert.equal(orbScene().powerupSpawnCount,3);
});
check('three lanes stay symmetric and two blue upgrades increase fire rate moderately', () => {
  surface={width:2400,height:900}; emit(window,'resize'); begin();
  execute('enemies.length=0;enemyCooldown=999;applyPowerup("blue");applyPowerup("blue");applyPowerup("yellow");applyPowerup("yellow");applyPowerup("red");applyPowerup("red");resetWeapons();updateShooting(0);');
  assert.equal(shots().length,3); assert.equal(new Set(shots().map(b=>b.y)).size,3);
  assert.equal(shots()[1].y,position().y); frames(20);
  assert.equal(shots().length,24);
  assert.equal(execute('bullets.every(bullet=>Math.abs(bullet.damage-2.6)<1e-8)'),true);
});
check('red upgrade affects only bullets fired after the upgrade', () => {
  isolatedBattle('resetWeapons();updateShooting(0);applyPowerup("red");'); frames(4);
  const damage=JSON.parse(execute('JSON.stringify(bullets.map(b=>b.damage))'));
  assert.equal(damage.length,2); near(damage[0],1); near(damage[1],1.8);
});
check('bullet damage reduces enemy health correctly and awards one lethal score', () => {
  isolatedBattle(target(400,300,100,5) + shot() + 'bullets[0].damage=3;'); step();
  assert.equal(scene().enemies[0].hp,2); assert.equal(scene().score,0);
  execute(shot()+'bullets[0].damage=2;'); step();
  assert.equal(scene().enemies.length,0); assert.equal(scene().score,100); assert.equal(health().kills,1);
});
check('pause freezes orb movement, spawning and notice countdown', () => {
  isolatedBattle(orb('yellow',900)+'powerupCooldown=.1;applyPowerup("blue");');
  emit(window,'blur'); const frozen=orbScene(); frames(100); assert.deepEqual(orbScene(),frozen);
  emit(window,'focus'); step(); assert.deepEqual(orbScene(),frozen);
  nodes.get('#menu-button').focus(); frames(100); assert.deepEqual(orbScene(),frozen);
  emit(canvas,'pointerdown'); step(); step();
  assert.ok(orbScene().powerups[0].x<frozen.powerups[0].x);
  assert.ok(orbScene().upgradeNoticeTime<frozen.upgradeNoticeTime);
  document.hidden=true; emit(document,'visibilitychange'); const hiddenState=orbScene();
  frames(100); assert.deepEqual(orbScene(),hiddenState);
  document.hidden=false; emit(document,'visibilitychange');
});
check('resize preserves upgrades, live orbs and notice while clearing old bullets', () => {
  isolatedBattle(orb('red')+shot()+'applyPowerup("blue");applyPowerup("yellow");');
  execute('var retainedResizeOrb=powerups[0];');
  const before=weaponState(); surface={width:640,height:360}; emit(window,'resize');
  assert.deepEqual(weaponState(),before); assert.equal(orbScene().powerups.length,1);
  assert.equal(execute('powerups[0]===retainedResizeOrb'),true);
  assert.equal(shots().length,0); assert.equal(orbScene().upgradeNoticeTime,2);
});
check('game over freezes orbs; restart and menu restore all initial upgrades', () => {
  loseRound(); execute('applyPowerup("blue");applyPowerup("yellow");applyPowerup("red");'+orb('yellow'));
  const ended=orbScene(); frames(100); assert.deepEqual(orbScene(),ended);
  emit(nodes.get('#restart-button'),'click'); step();
  assert.equal(weaponState().speedLevel,1); near(weaponState().interval,1/3.6);
  assert.equal(weaponState().lanes,1); near(weaponState().damage,2.2);
  assert.equal(orbScene().powerups.length,0); assert.equal(orbScene().powerupSpawnCount,0);
  assert.equal(orbScene().powerupCooldown,3); assert.equal(nodes.get('#powerup-notice').hidden,true);
  execute('applyPowerup("blue");applyPowerup("yellow");applyPowerup("red");');
  leaveBattle();
  near(weaponState().interval,1/3.6); assert.equal(weaponState().lanes,1); near(weaponState().damage,2.2);
});
check('escaped orbs are removed and spawn count is bounded on screen', () => {
  isolatedBattle(orb('red',-17)); step(); assert.equal(orbScene().powerups.length,0);
  execute('powerupRules.speed=0;powerupRules.interval=.01;powerupCooldown=0;'); frames(100);
  assert.equal(orbScene().powerups.length,powerupRulesValue());
  execute('powerupRules.speed=110;powerupRules.interval=7;');
});
function powerupRulesValue() { return execute('powerupRules.maxOnScreen'); }
check('ordinary upgraded shooting remains bounded during one minute', () => {
  isolatedBattle('applyPowerup("blue");applyPowerup("blue");applyPowerup("yellow");applyPowerup("yellow");resetWeapons();');
  frames(1200); assert.ok(shots().length>0 && shots().length<=45);
  assert.equal(execute('bullets.every(b=>b.x<=viewport.width)'),true);
});


check('body contact costs one life while enemies passing other lanes are harmless', () => {
  isolatedBattle(); collide(); assert.equal(health().lives,2); assert.equal(scene().enemies.length,0);
  frames(30); assert.equal(health().lives,2); assert.equal(scene().score,0); assert.equal(health().kills,0);
  isolatedBattle(); leak(); step(); assert.equal(health().lives,3); assert.equal(scene().enemies.length,1);
  frames(40); assert.equal(health().lives,3); assert.equal(scene().enemies.length,0);
});

check('swept relative collision catches fast enemies and player movement but ignores transparent corners', () => {
  isolatedBattle();
  assert.equal(execute('enemyTouchesPlayer({previousX:player.x+300,x:player.x-300,y:player.y,width:100,height:64})'),true);
  assert.equal(execute('enemyTouchesPlayer({previousX:player.x+300,x:player.x-300,y:player.y+100,width:100,height:64})'),false);
  execute('player.previousY=player.y-150;');
  assert.equal(execute('enemyTouchesPlayer({previousX:player.x,x:player.x,y:player.y-75,width:60,height:40})'),true);
  execute('player.previousY=player.y;');
  assert.equal(execute('enemyTouchesPlayer({x:player.x+100,y:player.y+55,width:100,height:64})'),false);
});

check('simultaneous contacts share grace; later contacts can end the game', () => {
  isolatedBattle(); execute(target(position().x,position().y).repeat(3)+'updatePlayerDamage(0);');
  assert.equal(health().lives,2); assert.equal(scene().enemies.length,0);
  collide(); assert.equal(health().lives,2);
  execute('updateBossEncounter(1.11);'); collide(); assert.equal(health().lives,1);
  execute('updateBossEncounter(1.11);'); collide();
  assert.equal(health().state,'over'); assert.equal(health().lives,0);
  assert.equal(nodes.get('#game-over-screen').hidden,false); assert.equal(document.activeElement,nodes.get('#restart-button'));
  const frozen=scene(); frames(100); assert.deepEqual(scene(),frozen);
});

check('escaped enemies clean up without damage and pause freezes contact checks', () => {
  isolatedBattle(target(-300,10)); step(); assert.equal(health().lives,3); assert.equal(scene().enemies.length,0);
  execute(target(position().x,position().y)); emit(window,'blur'); frames(10); assert.equal(health().lives,3);
  emit(window,'focus'); step(); assert.equal(health().lives,2); assert.equal(scene().enemies.length,0);
});

check('a killing shot resolves before touching enemy damage', () => {
  isolatedBattle(); const {x,y}=position();
  execute(target(x,y)+shot(x-20,y)); step();
  assert.equal(health().lives,3); assert.equal(scene().score,100); assert.equal(health().kills,1);
});

check('result scores survive game over and restart restores the whole round', () => {
  loseRound(); assert.equal(nodes.get('#final-score').textContent,'000700');
  assert.equal(nodes.get('#final-kills').textContent,'7');
  assert.equal(nodes.get('#final-time').textContent,'01:05');
  emit(nodes.get('#restart-button'),'click'); step();
  assert.equal(health().lives,3); assert.equal(health().state,'battle'); assert.equal(scene().score,0);
  assert.equal(scene().battleTime,0); assert.equal(scene().enemies.length,0);
  assert.equal(execute('enemyHealthForTime()'),1); assert.equal(weaponState().lanes,1);
});
check('a minute of off-lane passing enemies never costs a life', () => {
  isolatedBattle();
  for(let i=0;i<60;i++) { execute(target(350,position().y+140)); frames(20); }
  assert.equal(health().state,'battle'); assert.equal(health().lives,3);
});

check('health bar draw uses one unsegmented fill and contains no text', () => {
  isolatedBattle(target(400,300,100,10)); execute('enemies[0].hp=4;enemies[0].displayHp=4;');
  captureDraws=true; drawOperations.length=0; execute('drawEnemies();'); captureDraws=false;
  assert.equal(drawOperations.filter(op=>op.name==='fillText').length,0);
  const bars=drawOperations.filter(op=>op.name==='roundRect'); assert.equal(bars.length,2);
  assert.ok(Math.abs(bars[1].args[2]-76*.4)<1e-8);
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.ok(!html.includes('enemy-strength')); assert.ok(!html.includes(' HP'));
});
check('bar shrinks smoothly after damage and reduced motion uses exact remaining health', () => {
  isolatedBattle(target(400,300,100,10)); execute('enemies[0].displayHp=10;enemies[0].hp=4;updateEncounter(.05);');
  assert.ok(scene().enemies[0].displayHp>4 && scene().enemies[0].displayHp<10);
  execute('reducedMotion.matches=true;updateEncounter(.05);'); assert.equal(scene().enemies[0].displayHp,4);
  execute('reducedMotion.matches=false;');
});


const emitted = () => JSON.parse(execute('JSON.stringify(bullets)'));
const palette = () => JSON.parse(execute('JSON.stringify(weaponPalette())'));
check('every one-to-four-lane volley is symmetric around the moving nose at all viewport sizes', () => {
  for (const size of [{width:1280,height:720},{width:640,height:360},{width:390,height:844},{width:1920,height:1080}]) {
    surface=size; emit(window,'resize'); begin();
    for (let lanes=1;lanes<=4;lanes++) {
      for(const vertical of ['ArrowUp','ArrowDown']) {
        key(vertical); frames(3); key(vertical,'keyup');
        execute(`weapon.lanes=${lanes};resetWeapons();updateShooting(0);`);
        const volley=emitted(); const nose=execute('muzzlePosition()');
        assert.equal(volley.length,lanes);
        assert.ok(Math.abs(volley.reduce((sum,b)=>sum+b.y,0)/lanes-nose.y)<1e-8);
        assert.equal(nose.y,position().y);
        for(let i=0;i<lanes;i++) {
          assert.ok(Math.abs(volley[i].y+volley[lanes-1-i].y-2*nose.y)<1e-8);
          assert.equal(volley[i].x,nose.x+3);
        }
        if(lanes%2) assert.equal(volley[(lanes-1)/2].y,nose.y);
        else assert.ok(volley[lanes/2-1].y<nose.y && volley[lanes/2].y>nose.y);
        assert.equal(execute('shotLanes().every(l=>l.weight===1)'),true);
      }
    }
  }
});
check('muzzle flashes share the exact symmetry axis of each emitted volley', () => {
  isolatedBattle();
  for(const lanes of [1,2,3,4]) {
    execute(`weapon.lanes=${lanes};resetWeapons();updateShooting(0);`);
    captureDraws=true; drawOperations.length=0; execute('drawMuzzleFlash();'); captureDraws=false;
    const flashes=drawOperations.filter(op=>op.name==='ellipse');
    assert.equal(flashes.length,lanes);
    assert.deepEqual(flashes.map(op=>op.args[1]),emitted().map(b=>b.y));
  }
});
check('four lanes stay in the first tier; the fifth consolidates with an eight-percent promotion reward', () => {
  isolatedBattle('battleTime=0;');
  for(let i=0;i<3;i++) execute('applyPowerup("yellow");');
  assert.equal(weaponState().tier,1); assert.equal(weaponState().lanes,4);
  execute('resetWeapons();updateShooting(0);');
  const fullVolley=emitted(); assert.equal(fullVolley.length,4);
  const totalDamage=fullVolley.reduce((sum,b)=>sum+b.damage,0);
  execute('applyPowerup("yellow");resetWeapons();updateShooting(0);');
  assert.equal(weaponState().tier,2); assert.equal(weaponState().lanes,1);
  assert.equal(emitted().length,1); near(emitted()[0].damage,totalDamage*1.08);
  assert.equal(emitted()[0].y,position().y);
});
check('every tier follows yellow green purple green blue red and cycles while damage grows', () => {
  isolatedBattle('battleTime=0;');
  const names=['黄色','绿色','紫色','绿色','蓝色','红色','黄色','绿色'];
  const expectedDamage=Array.from({length:8},(_,tier)=>Math.pow(4.32,tier));
  const colors=[];
  for(let i=0;i<names.length;i++) {
    assert.equal(weaponState().tier,i+1); assert.equal(weaponState().lanes,1);
    assert.equal(palette().name,names[i]); colors.push(palette().color);
    execute('resetWeapons();updateShooting(0);');
    near(emitted()[0].damage,expectedDamage[i],Math.max(1e-8,expectedDamage[i]*1e-12));
    assert.equal(emitted()[0].color,palette().color); assert.equal(emitted()[0].core,palette().core);
    for(let j=0;j<4;j++) execute('applyPowerup("yellow");');
  }
  assert.equal(colors[1],colors[3]); assert.equal(colors[0],colors[6]);
  assert.equal(new Set(colors.slice(0,6)).size,5);
});
check('red damage multiplies each tier and an old bullet retains its original damage and colors', () => {
  isolatedBattle('battleTime=0;weapon.lanes=4;resetWeapons();updateShooting(0);');
  const before=emitted();
  execute('applyPowerup("yellow");applyPowerup("red");updateShooting(.2);');
  const after=emitted();
  assert.equal(after.length,5);
  for(let i=0;i<4;i++) {
    assert.equal(after[i].damage,before[i].damage);
    assert.equal(after[i].color,before[i].color); assert.equal(after[i].core,before[i].core);
  }
  near(after[4].damage,7.776); assert.notEqual(after[4].color,before[0].color);
  execute('battleTime=360;applyPowerup("red");updateShooting(.2);');
  near(weaponState().damage,4.2); near(emitted().at(-1).damage,18.144);
  near(emitted()[4].damage,7.776);
});
check('rendering mixed old and new bullets uses the color and core stored on each bullet', () => {
  isolatedBattle('battleTime=0;weapon.lanes=4;resetWeapons();updateShooting(0);applyPowerup("yellow");updateShooting(.2);');
  const mixed=emitted();
  captureDraws=true; drawOperations.length=0; execute('drawBullets();'); captureDraws=false;
  const fills=drawOperations.filter(op=>op.name==='set:fillStyle').map(op=>op.args[0]);
  assert.deepEqual(fills,mixed.flatMap(b=>[b.color,b.core]));
});
check('tiered damage is applied to enemies exactly once per projectile', () => {
  isolatedBattle('battleTime=0;weapon.tier=3;weapon.damage=2;resetWeapons();updateShooting(0);');
  execute(target(400,position().y,100,50)+'bullets[0].previousX=350;bullets[0].x=400;resolveProjectileHits();');
  near(scene().enemies[0].hp,50-2*4.32**2); assert.equal(scene().score,0); assert.equal(shots().length,0);
  execute('updateShooting(.2);bullets[0].previousX=350;bullets[0].x=400;resolveProjectileHits();');
  assert.equal(scene().enemies.length,0); assert.equal(scene().score,100); assert.equal(health().kills,1);
});
check('pause freezes high-tier fire and resume does not promote or emit a catch-up burst', () => {
  isolatedBattle('weapon.tier=4;weapon.lanes=4;resetWeapons();updateShooting(0);');
  const before=emitted(); const upgrade=weaponState();
  emit(window,'blur'); frames(200); assert.deepEqual(emitted(),before); assert.deepEqual(weaponState(),upgrade);
  emit(window,'focus'); step(); assert.deepEqual(emitted(),before); assert.deepEqual(weaponState(),upgrade);
  frames(4); assert.equal(emitted().length,8);
  assert.equal(weaponState().tier,4); assert.equal(weaponState().lanes,4);
});
check('resize preserves the current tier, color and lanes, while restart restores initial yellow fire', () => {
  isolatedBattle('weapon.tier=6;weapon.lanes=3;weapon.damage=5;updateWeaponDisplay();');
  const before=weaponState(); const beforePalette=palette();
  surface={width:640,height:360}; emit(window,'resize');
  assert.deepEqual(weaponState(),before); assert.deepEqual(palette(),beforePalette);
  for(let i=0;i<3;i++) { execute('bossHitGrace=0;'); collide(); } assert.equal(health().state,'over');
  emit(nodes.get('#restart-button'),'click'); step();
  assert.equal(weaponState().tier,1); assert.equal(weaponState().lanes,1); near(weaponState().damage,2.2);
  assert.equal(palette().name,'黄色'); near(emitted()[0].damage,2.2);
  execute('weapon.tier=6;'); leaveBattle();
  assert.equal(weaponState().tier,1); assert.equal(palette().name,'黄色');
});
check('high-rate four-lane fire preserves total damage across frame rates with bounded visual objects', () => {
  for(const fps of [20,60,144]) {
    isolatedBattle('weapon.tier=3;weapon.lanes=4;weapon.damage=1000;weapon.interval=.001;resetWeapons();updateShooting(0);');
    execute(`for(let i=0;i<${fps};i++) updateShooting(1/${fps});`);
    const attack=execute('bullets.reduce((sum,b)=>sum+b.damage,0)+pendingShots*weapon.lanes*projectileDamage()');
    near(attack,1001*4*1000*4.32**2,1e-6);
    assert.ok(shots().length<=84);
    assert.equal(execute('shotLanes().length'),4);
  }
});
check('sustained late-game fire cleans up offscreen objects and renders no more than four lanes per volley', () => {
  isolatedBattle('weapon.tier=10;weapon.lanes=4;weapon.damage=1000;weapon.interval=.0001;resetWeapons();');
  frames(1200);
  assert.equal(health().state,'battle'); assert.ok(shots().length>0 && shots().length<=256);
  assert.equal(execute('bullets.every(b=>b.x<=viewport.width)'),true);
  assert.equal(execute('new Set(bullets.map(b=>b.angle)).size'),4);
  assert.equal(execute('bullets.every(b=>b.y>=-60&&b.y<=viewport.height+60)'),true);
});
check('very large tiers have a compact damage label instead of an overflowing HUD', () => {
  isolatedBattle('weapon.tier=500;weapon.damage=999;updateWeaponDisplay();');
  assert.ok(!/Infinity|NaN/.test(nodes.get('#weapon-damage').textContent));
  assert.ok(nodes.get('#weapon-damage').textContent.length<30);
  assert.equal(weaponState().tier,500); assert.equal(weaponState().lanes,1);
});
check('extremely high tiers remain lethal to finite-health enemies and use a readable damage label', () => {
  isolatedBattle('weapon.tier=400;weapon.lanes=1;resetWeapons();updateShooting(0);updateWeaponDisplay();');
  execute(target(400,position().y,100,1e100)+'bullets[0].previousX=350;bullets[0].x=400;resolveProjectileHits();');
  assert.equal(scene().enemies.length,0); assert.equal(scene().score,100);
  assert.equal(health().kills,1); assert.equal(shots().length,0);
  assert.ok(!/Infinity|NaN/.test(nodes.get('#weapon-damage').textContent));
  assert.ok(nodes.get('#weapon-damage').textContent.length<30);
});

const bossState = () => JSON.parse(execute('JSON.stringify({boss,nextBossTime,bossDefeated,pendingBossType,bossHitGrace,bossProjectiles,bossHazards})'));
function readyBoss(type = 0, extra = '') {
  isolatedBattle();
  execute(`spawnBoss(${type});Object.assign(boss,bossArena());boss.previousX=boss.x;boss.previousY=boss.y;boss.phase="recover";boss.phaseTime=0;bossHitGrace=0;${extra}`);
}
function bossProjectile(x = 'player.x', y = 'player.y', extra = '') {
  return `addBossProjectile(${x},${y},0,0,{radius:7${extra ? ',' + extra : ''}});`;
}
function near(actual, expected, tolerance = 1e-8) { assert.ok(Math.abs(actual-expected)<=tolerance, `${actual} differs from ${expected}`); }

check('boss reset restores the first arrival with an empty encounter', () => {
  isolatedBattle(); execute('resetBossEncounter();');
  const result=bossState(); assert.equal(result.nextBossTime,execute('bossRules.firstArrival')); assert.equal(result.boss,null);
  assert.equal(result.bossDefeated,0); assert.equal(result.pendingBossType,null);
  assert.equal(result.bossProjectiles.length,0); assert.equal(result.bossHazards.length,0);
  assert.equal(nodes.get('#boss-hud').hidden,true);
});
check('first boss telegraphs for the complete warning duration and clears waves before entry', () => {
  isolatedBattle(target()); execute('resetBossEncounter();battleTime=nextBossTime-bossRules.warning-.001;updateBossEncounter(0);');
  assert.equal(bossState().boss,null); assert.equal(bossState().pendingBossType,null); assert.equal(scene().enemies.length,1);
  execute('battleTime=nextBossTime-bossRules.warning;updateBossEncounter(0);');
  const chosen=bossState().pendingBossType;
  assert.equal(chosen,0); assert.equal(scene().enemies.length,0);
  assert.equal(nodes.get('#boss-warning').hidden,false);
  execute('battleTime=nextBossTime-.001;updateBossEncounter(0);'); assert.equal(bossState().boss,null);
  execute('battleTime=nextBossTime;updateBossEncounter(0);'); assert.equal(bossState().boss.type,chosen);
  assert.equal(bossState().boss.phase,'enter'); assert.equal(bossState().pendingBossType,null);
});
check('ten distinct aliens lead to the fusion boss in a fixed sequence', () => {
  isolatedBattle(); execute('resetBossEncounter();');
  const names = new Set();
  for(let index=0;index<11;index++) {
    execute(`bossDefeated=${index};`);
    assert.equal(execute('chooseBossType()'),index);
    names.add(execute(`bossTypeName(${index})`));
  }
  assert.equal(names.size,11);
});
check('each campaign stage arrives and settles in order, increasing durability until the victory screen', () => {
  isolatedBattle('resetBossEncounter();');
  let previousHealth = -Infinity;
  let previousInterval = Infinity;
  for(let type=0;type<11;type++) {
    const arrival = bossState().nextBossTime;
    execute('battleTime=nextBossTime-bossRules.warning;updateBossEncounter(0);');
    assert.equal(bossState().pendingBossType,type);
    execute('battleTime=nextBossTime;updateBossEncounter(0);updateBossEncounter(bossPresentation.duration);');
    const stage = bossState().boss;
    assert.equal(stage.type,type);
    assert.equal(stage.alienFinal,type===10);
    assert.ok(stage.healthLog>previousHealth);
    previousHealth=stage.healthLog;
    execute('defeatBoss();updateCombatEffects(1.25);');
    assert.equal(bossState().bossDefeated,type+1);
    if(type<10) {
      assert.equal(execute('evolution.pending'),true);
      assert.equal(execute('chooseEvolution(evolutionChoiceOptions().find(kind=>!evolutionCardDetails(kind).disabled))'),true);
      const interval=bossState().nextBossTime-arrival;
      assert.ok(interval<=previousInterval && interval>execute('bossRules.warning'));
      previousInterval=interval;
    }
  }
  assert.equal(health().state,'over'); assert.equal(health().kills,11);
  assert.equal(scene().score,26000); assert.equal(execute('nextBossTime'),Infinity);
  assert.equal(nodes.get('#game-over-screen').dataset.victory,'true');
});
check('entry moves each larger boss to the right-center and blocks premature player damage', () => {
  for(let type=0;type<11;type++) {
    isolatedBattle(); execute(`spawnBoss(${type});`);
    const start=bossState().boss; assert.ok(start.width>execute('player.width'));
    assert.ok(start.x>surface.width); execute('applyBossHit({damage:Infinity});'); assert.equal(bossState().boss.hp,1);
    execute('updateBossEncounter(bossPresentation.duration);'); const arrived=bossState().boss;
    near(arrived.x,execute('bossArena().x')); assert.ok(Math.abs(arrived.y-surface.height/2)<60);
    assert.equal(arrived.phase,'recover'); assert.ok(arrived.x>surface.width/2);
  }
});
check('warning and boss fights suspend ordinary spawns while powerup orbs keep arriving', () => {
  isolatedBattle(); execute('resetBossEncounter();battleTime=nextBossTime-bossRules.warning;enemyCooldown=0;powerupCooldown=0;updateEncounter(0);updateBossEncounter(0);updatePowerups(0);');
  assert.equal(scene().enemies.length,0); assert.equal(orbScene().powerups.length,1);
  execute('battleTime=nextBossTime;updateBossEncounter(0);updateBossEncounter(bossPresentation.duration);enemyCooldown=0;powerupCooldown=0;updateEncounter(0);updatePowerups(0);');
  assert.equal(scene().enemies.length,0); assert.equal(orbScene().powerups.length,2);
});
check('boss time, projectiles, hazards and immunity all freeze on blur, hidden tabs and control focus', () => {
  readyBoss(2); execute('prepareAlienAttack(boss);'+bossProjectile('800','300')); step();
  for(const kind of ['blur','hidden','control']) {
    if(kind==='blur') emit(window,'blur');
    else if(kind==='hidden') { document.hidden=true; emit(document,'visibilitychange'); }
    else nodes.get('#menu-button').focus();
    const before=bossState(); const time=scene().battleTime; frames(100);
    assert.deepEqual(bossState(),before); assert.equal(scene().battleTime,time);
    if(kind==='blur') emit(window,'focus');
    else if(kind==='hidden') { document.hidden=false; emit(document,'visibilitychange'); }
    else emit(canvas,'pointerdown');
    step();
    const resumed=bossState();
    assert.equal(scene().battleTime,time);
    assert.deepEqual({ ...resumed, boss: { ...resumed.boss, previousX:before.boss.previousX, previousY:before.boss.previousY } },before);
  }
});
check('resize retains boss identity, health, defeat history, schedule and remaps threats', () => {
  readyBoss(3,'boss.hp=.37;boss.displayHp=.42;bossDefeated=2;nextBossTime=400;');
  execute(bossProjectile('800','300')+'addBossHazard("beam",{y:300,thickness:20,warning:1,duration:2});');
  surface={width:640,height:360}; emit(window,'resize'); const resized=bossState();
  assert.equal(resized.boss.type,3); assert.equal(resized.boss.hp,.37); assert.equal(resized.boss.displayHp,.42);
  assert.equal(resized.bossDefeated,2); assert.equal(resized.nextBossTime,400);
  assert.equal(resized.bossProjectiles.length,1); assert.equal(resized.bossHazards.length,1);
  near(resized.bossProjectiles[0].x,400); near(resized.bossProjectiles[0].x,resized.bossProjectiles[0].previousX);
  assert.equal(resized.boss.phase,'recover'); assert.ok(resized.bossHitGrace>0);
  assert.ok(position().x<=execute('bossPlayerRight()'));
});
check('menu and game-over restart clean all boss state and restore the original schedule', () => {
  readyBoss(1,'bossDefeated=3;nextBossTime=500;'); execute(bossProjectile());
  leaveBattle(); assert.equal(bossState().boss,null); assert.equal(bossState().nextBossTime,execute('bossRules.firstArrival'));
  assert.equal(bossState().bossDefeated,0); assert.equal(bossState().bossProjectiles.length,0);
  readyBoss(4,'player.lives=1;'); execute(bossProjectile()+'updateBossDamage();');
  assert.equal(health().state,'over'); const frozen=bossState(); frames(50); assert.deepEqual(bossState(),frozen);
  emit(nodes.get('#restart-button'),'click'); step(); assert.equal(bossState().boss,null);
  assert.equal(bossState().nextBossTime,execute('bossRules.firstArrival')); assert.equal(bossState().bossDefeated,0); assert.equal(health().lives,3);
});
check('all thirty-three alien patterns telegraph and generate threats only during their active phase', () => {
  assert.equal(execute('bossTypes.length'),11);
  const patterns=JSON.parse(execute('JSON.stringify(bossTypes.flatMap(type=>type.patterns))'));
  assert.equal(patterns.length,33); assert.equal(new Set(patterns).size,33);
  for(let type=0;type<11;type++) for(let attack=0;attack<3;attack++) {
    readyBoss(type, 'boss.attackIndex='+(attack-1)+';prepareAlienAttack(boss);');
    assert.equal(bossState().boss.phase,'telegraph');
    assert.equal(bossState().boss.alienAttack,patterns[type*3+attack]);
    assert.equal(bossState().bossProjectiles.length,0);
    assert.ok(bossState().bossHazards.every(h=>h.age<h.warning));
    assert.ok(execute('boss.telegraphDuration>=.8'));
    execute('updateBossEncounter(boss.telegraphDuration);');
    assert.equal(bossState().boss.phase,'attack');
    execute('boss.phaseTime=2.1;runAlienAttack(boss);');
    const after=bossState();
    assert.ok(after.bossProjectiles.length>0 || after.bossHazards.length>0);
    execute('runAlienAttack(boss);');
    assert.deepEqual(bossState(),after);
  }
});
check('bullet swept collision catches a fast crossing but ignores a nearby clear lane', () => {
  readyBoss(1);
  assert.equal(execute('bossShotHitsPlayer({previousX:player.x+200,previousY:player.y,x:player.x-200,y:player.y,radius:7})'),true);
  assert.equal(execute('bossShotHitsPlayer({previousX:player.x+200,previousY:player.y+100,x:player.x-200,y:player.y+100,radius:7})'),false);
  execute(bossProjectile()+'updateBossDamage();'); assert.equal(health().lives,2);
  assert.equal(bossState().bossProjectiles.length,0); assert.equal(bossState().bossHitGrace,1.1);
});
check('simultaneous boss hits cost one life and the full 1.1-second grace period works', () => {
  readyBoss(0); execute(bossProjectile().repeat(4)+'updateBossDamage();'); assert.equal(health().lives,2);
  execute(bossProjectile()+'updateBossDamage();'); assert.equal(health().lives,2);
  execute('updateBossEncounter(1.09);'+bossProjectile()+'updateBossDamage();'); assert.equal(health().lives,2);
  execute('updateBossEncounter(.02);'+bossProjectile()+'updateBossDamage();'); assert.equal(health().lives,1);
});
check('beam and zone warnings are harmless until active and support safe positions', () => {
  for(const kind of ['beam','zone']) {
    readyBoss(kind==='beam'?4:2);
    execute(`addBossHazard("${kind}",{x:player.x,y:player.y,radius:35,thickness:20,warning:1.2,duration:1});updateBossDamage();`);
    assert.equal(health().lives,3);
    execute('bossHazards[0].age=1.199;updateBossDamage();'); assert.equal(health().lives,3);
    execute('bossHazards[0].age=1.2;updateBossDamage();'); assert.equal(health().lives,2);
    execute('bossHitGrace=0;player.y+=150;updateBossDamage();'); assert.equal(health().lives,2);
    execute('updateBossProjectiles(1);'); assert.equal(bossState().bossHazards.length,0);
  }
});
check('boss damage is disabled while paused and zero life ends combat', () => {
  readyBoss(0,'player.lives=1;'); execute(bossProjectile());
  emit(window,'blur'); execute('updateBossDamage();'); assert.equal(health().lives,1); assert.equal(bossState().bossProjectiles.length,1);
  emit(window,'focus'); execute('updateBossDamage();'); assert.equal(health().lives,0); assert.equal(health().state,'over');
  assert.equal(nodes.get('#game-over-screen').hidden,false);
});
check('contact and boss bullets share protection in both damage orders', () => {
  readyBoss(0); execute(bossProjectile()+'updateBossDamage();'); collide(); assert.equal(health().lives,2);
  execute('bossHitGrace=0;'); collide(); assert.equal(health().lives,1);
  execute(bossProjectile()+'updateBossDamage();'); assert.equal(health().lives,1);
  leak(); execute('updatePlayerDamage(0);'); assert.equal(health().lives,1);
});

check('player projectiles hit boss once and are removed without penetrating targets', () => {
  readyBoss(0); const hp=bossState().boss.hp;
  execute('bullets.push({x:boss.x,previousX:boss.x-boss.width,y:boss.y,damage:1,damageLog:0});resolveProjectileHits();');
  assert.ok(bossState().boss.hp<hp); assert.equal(shots().length,0);
  const damaged=bossState().boss.hp; execute('resolveProjectileHits();'); assert.equal(bossState().boss.hp,damaged);
});
check('nearest orb or normal enemy intercepts a projectile before the boss', () => {
  readyBoss(0); const b=bossState().boss;
  execute(orb('blue',b.x-200,b.y)+`bullets.push({x:boss.x,previousX:boss.x-300,y:boss.y,damage:1,damageLog:0});resolveProjectileHits();`);
  assert.equal(bossState().boss.hp,1); assert.equal(orbScene().powerups.length,0); assert.equal(weaponState().speedLevel,2);
  readyBoss(0); const b2=bossState().boss;
  execute(target(b2.x-200,b2.y,70,1)+`bullets.push({x:boss.x,previousX:boss.x-300,y:boss.y,damage:1,damageLog:0});resolveProjectileHits();`);
  assert.equal(bossState().boss.hp,1); assert.equal(scene().enemies.length,0); assert.equal(scene().score,100);
});
check('real high-tier emitted shots carry finite log damage through aggregation and boss collision', () => {
  isolatedBattle('weapon.tier=500;weapon.damage=1000;weapon.interval=.001;spawnBoss(4);Object.assign(boss,bossArena());boss.previousX=boss.x;boss.phase="recover";boss.healthLog=weaponDamageLog()+Math.log(55000);resetWeapons();updateShooting(0);updateShooting(.05);');
  assert.equal(execute('Number.isFinite(bullets.at(-1).damageLog)'),true);
  near(execute('bullets.at(-1).damageLog-weaponDamageLog()'),Math.log(50),1e-10);
  execute('bullets.splice(0,bullets.length-1);bullets[0].previousX=boss.x-boss.width;bullets[0].x=boss.x;bullets[0].y=boss.y;resolveProjectileHits();');
  near(1-bossState().boss.hp,50*.001/55,1e-10);
  assert.equal(shots().length,0); assert.ok(Number.isFinite(bossState().boss.hp));
});
check('aggregated high-rate bullets preserve boss damage and no infinite arithmetic leaks into HP', () => {
  readyBoss(4,'weapon.tier=500;weapon.damage=1000;weapon.interval=.001;boss.healthLog=weaponDamageLog()+Math.log(25000);');
  const healthLog=bossState().boss.healthLog;
  execute('applyBossHit({damage:Infinity,damageLog:weaponDamageLog()+Math.log(100)});');
  near(1-bossState().boss.hp,Math.exp(execute('weaponDamageLog()')+Math.log(100)-healthLog),1e-9);
  assert.ok(Number.isFinite(bossState().boss.hp));
});
check('boss defeats schedule the next fight and restore life only at stages three, six and nine', () => {
  readyBoss(0,'battleTime=123;player.maxLives=4;player.lives=3;'); execute(bossProjectile()+'addBossHazard("beam",{y:200,warning:1,duration:2});spawnEnemy("scout");boss.hp=.015;applyBossHit({damageLog:boss.healthLog+Math.log(.02)});');
  assert.equal(bossState().boss.finale.mode,'egg'); assert.equal(bossState().bossDefeated,0); assert.equal(scene().score,0);
  assert.equal(orbScene().powerups.length,0);
  execute('boss.finale.age=boss.finale.transform;boss.hp=.015;applyBossHit({damageLog:boss.healthLog+5,y:boss.y});');
  assert.equal(bossState().boss,null); assert.equal(bossState().bossDefeated,1); assert.equal(scene().score,2000);
  assert.equal(health().kills,1); assert.equal(health().lives,3); assert.equal(bossState().nextBossTime,123+execute('bossRules.interval'));
  assert.equal(bossState().bossProjectiles.length,0); assert.equal(bossState().bossHazards.length,0); assert.equal(scene().enemies.length,0);
  assert.deepEqual(orbScene().powerups.map(p=>p.type),['blue','yellow','red']);
  execute('defeatBoss();applyBossHit({damage:Infinity});'); assert.equal(scene().score,2000); assert.equal(health().kills,1);
  assert.equal(orbScene().powerups.length,3); assert.equal(nodes.get('#boss-hud').hidden,true);
  for (const stage of [2,3,4,5,6,7,8,9,10,11]) {
    readyBoss(stage-1,'player.maxLives=4;player.lives=3;'); execute('defeatBoss();');
    assert.equal(health().lives,[3,6,9].includes(stage)?4:3);
    assert.equal(execute('player.maxLives'),4);
  }
});
check('the second alien counts down after the first defeat and retains the complete warning', () => {
  readyBoss(0,'battleTime=140;defeatBoss();updateCombatEffects(1.25);chooseEvolution("pierce");battleTime=nextBossTime-bossRules.warning-.001;updateBossEncounter(0);');
  assert.equal(bossState().pendingBossType,null); assert.equal(bossState().nextBossTime,140+execute('bossRules.interval'));
  execute('battleTime=nextBossTime-bossRules.warning;updateBossEncounter(0);'); assert.equal(bossState().pendingBossType,1);
  execute('battleTime=nextBossTime-.001;updateBossEncounter(0);'); assert.equal(bossState().boss,null);
  execute('battleTime=nextBossTime;updateBossEncounter(0);'); assert.equal(bossState().boss.type,1);
});
check('boss projectile count is bounded and all abandoned projectiles and hazards expire', () => {
  readyBoss(1); execute('for(let i=0;i<1000;i++) addBossProjectile(500,300,0,0);');
  assert.equal(bossState().bossProjectiles.length,execute('bossRules.maxProjectiles'));
  execute('updateBossProjectiles(12.1);'); assert.equal(bossState().bossProjectiles.length,0);
  execute('addBossProjectile(-50,300,0,0);addBossProjectile(500,-50,0,0);updateBossProjectiles(0);');
  assert.equal(bossState().bossProjectiles.length,0);
});
check('boss bar remains a continuous fill without health numbers or labels', () => {
  readyBoss(3,'boss.hp=.4;boss.displayHp=.4;bossHitGrace=0;');
  captureDraws=true; drawOperations.length=0; execute('drawBossBattle();'); captureDraws=false;
  assert.equal(drawOperations.filter(op=>op.name==='fillText').length,0);
  const b=bossState().boss;
  const bars=drawOperations.filter(op=>op.name==='roundRect' && Math.abs(op.args[1]-(b.y-b.height*.58-9))<1e-8);
  assert.equal(bars.length,2); near(bars[0].args[2],b.width*.85); near(bars[1].args[2],b.width*.85*.4);
});
check('player cannot overlap the boss spawn corridor during entry or battle', () => {
  isolatedBattle('player.x=flightBounds.right;spawnBoss(0);');
  assert.ok(position().x<=execute('bossPlayerRight()'));
  key('ArrowRight'); frames(80); key('ArrowRight','keyup');
  assert.ok(position().x<=execute('bossPlayerRight()')+1e-8);
});


check('upgrade gains grow at a slower pace with yellow progression deliberately slower than blue and red', () => {
  isolatedBattle();
  for(const [time,blue,yellow] of [[0,1,1],[179.99,1,1],[180,2,1],[359.99,2,1],[360,3,2],[720,5,3],[3600,21,11]]) {
    execute(`battleTime=${time};`);
    assert.equal(execute('powerupGainForTime("blue")'),blue);
    assert.equal(execute('powerupGainForTime("red")'),blue);
    assert.equal(execute('powerupGainForTime("yellow")'),yellow);
  }
  execute('battleTime=1000000;'); assert.ok(execute('powerupGainForTime("yellow")')>100);
});
check('yellow batched gains preserve every step across promotions at the new slower reward schedule', () => {
  for(const [tier,lanes,time,gain] of [[1,4,360,2],[3,2,720,3],[10,3,3600,11]]) {
    isolatedBattle(`weapon.tier=${tier};weapon.lanes=${lanes};battleTime=${time};applyPowerup("yellow");`);
    const batched=weaponState();
    isolatedBattle(`weapon.tier=${tier};weapon.lanes=${lanes};battleTime=0;`);
    for(let index=0;index<gain;index++) execute('applyPowerup("yellow");');
    assert.equal(weaponState().tier,batched.tier); assert.equal(weaponState().lanes,batched.lanes);
  }
});
check('blue increases fire rate moderately and late blue/red gains do not change the current tier', () => {
  isolatedBattle('applyPowerup("blue");'); near(1/weaponState().interval,6);
  execute('applyPowerup("blue");'); near(1/weaponState().interval,7);
  execute('weapon.tier=4;weapon.lanes=3;');
  for(const [time,gain] of [[0,1],[180,2],[360,3],[3600,21]]) {
    execute('battleTime='+time); const before=weaponState(); execute('applyPowerup("blue");applyPowerup("red");');
    const after=weaponState(); assert.equal(after.speedLevel-before.speedLevel,gain);
    near(after.damage,Math.max(before.damage+.8*gain,before.damage*1.075**gain));
    near(1/after.interval,Math.max(1/before.interval+gain,1/before.interval*1.055**gain));
    assert.equal(after.tier,4); assert.equal(after.lanes,3);
  }
});
check('collecting every scheduled orb for five minutes no longer jumps through many projectile tiers', () => {
  isolatedBattle();
  execute('for(let time=3,index=0;time<=300;time+=7,index++){battleTime=time;applyPowerup(["blue","yellow","red","blue","yellow","red","blue","yellow","red","heal"][index%10]);}');
  const result=weaponState(); assert.ok(result.tier>=3&&result.tier<=4); assert.ok(result.damage>16&&result.damage<19);
  assert.ok(1/result.interval>22&&1/result.interval<25); assert.ok(result.lanes>=1&&result.lanes<=4);
});
check('opening enemies require stronger hits while later enemies keep a frozen growing health snapshot', () => {
  isolatedBattle('battleTime=19.9;spawnEnemy("scout");'); assert.ok(scene().enemies[0].healthLog>0);
  execute('applyEnemyHit(enemies[0],{damage:1});'); assert.ok(scene().enemies[0].hp>0);
  isolatedBattle('battleTime=20;spawnEnemy("scout");'); const first=scene().enemies[0];
  assert.ok(first.healthLog>0); assert.equal(first.hp,1);
  execute('battleTime=200;spawnEnemy("scout");'); const later=scene().enemies;
  assert.equal(later[0].healthLog,first.healthLog); assert.ok(later[1].healthLog>first.healthLog);
  execute('weapon.damage=100000;weapon.tier=30;battleTime=3600;');
  assert.equal(scene().enemies[0].healthLog,first.healthLog); assert.equal(scene().enemies[0].hp,1);
});
check('normal enemy births follow time and remain independent of the current weapon for hours', () => {
  let previous=0;
  for(const time of [60,300,1800,36000]) {
    isolatedBattle(`battleTime=${time};spawnEnemy("scout");`);
    const birth=scene().enemies[0].healthLog;
    assert.ok(Number.isFinite(birth)&&birth>previous);
    execute('weapon.tier=5000;weapon.damage=10000;weapon.lanes=4;weapon.interval=.025;spawnEnemy("scout");');
    assert.equal(scene().enemies[1].healthLog,birth);
    previous=birth;
  }
});
check('upgrades during a fight still improve damage against an already spawned enemy', () => {
  isolatedBattle('battleTime=360;weapon.tier=3;weapon.damage=10;spawnEnemy("scout");');
  const birth=scene().enemies[0].healthLog;
  execute('applyEnemyHit(enemies[0],{damageLog:weaponDamageLog()});'); const firstLoss=1-scene().enemies[0].hp;
  const before=scene().enemies[0].hp; execute('applyPowerup("red");applyEnemyHit(enemies[0],{damageLog:weaponDamageLog()});');
  const nextLoss=before-scene().enemies[0].hp;
  assert.ok(nextLoss>firstLoss); near(nextLoss/firstLoss,1.075**3,1e-7); assert.equal(scene().enemies[0].healthLog,birth);
});
check('huge-tier actual projectiles damage normalized enemies without Infinity-minus-Infinity or lost kills', () => {
  isolatedBattle('battleTime=3600;weapon.tier=500;weapon.damage=1000;spawnEnemy("scout");enemies[0].x=500;enemies[0].previousX=500;enemies[0].y=player.y;enemies[0].healthLog=weaponDamageLog()+Math.log(4);resetWeapons();updateShooting(0);bullets[0].previousX=400;bullets[0].x=500;resolveProjectileHits();');
  assert.equal(scene().enemies.length,1); near(scene().enemies[0].hp,.75);
  assert.ok(Number.isFinite(scene().enemies[0].hp)); assert.equal(shots().length,0);
  const finishingRound = 'bullets.push({x:500,previousX:400,y:player.y,damage:Infinity,damageLog:enemies[0].healthLog+1});resolveProjectileHits();';
  execute(finishingRound);
  near(scene().enemies[0].hp,.2);
  assert.equal(health().kills,0);
  execute('battleTime+=.6;'+finishingRound);
  assert.equal(scene().enemies.length,0); assert.equal(scene().score,100); assert.equal(health().kills,1);
  execute('resolveProjectileHits();'); assert.equal(scene().score,100);
});
check('enemy health and speed continue increasing while spawn cadence remains playable', () => {
  isolatedBattle(); let healthLog=-Infinity,speed=0;
  for(const time of [0,20,60,120,300,1800,36000]) {
    execute(`battleTime=${time};`); const nextHealth=execute('enemyHealthLogForTime()'),nextSpeed=execute('enemySpeedForTime()');
    assert.ok(nextHealth>healthLog); assert.ok(nextSpeed>speed); assert.ok(Number.isFinite(nextHealth));
    assert.ok(execute('enemyIntervalForTime()>=enemyCombatRules.minSpawnInterval')); healthLog=nextHealth; speed=nextSpeed;
  }
  assert.ok(execute('enemyHealthForTime()')>1000000);
});
check('resize preserves normalized combat progression and restart restores opening durability', () => {
  isolatedBattle('battleTime=300;weapon.tier=4;spawnEnemy("scout");'); const log=execute('enemyHealthLogForTime()');
  surface={width:640,height:360}; emit(window,'resize'); assert.equal(scene().battleTime,300);
  assert.equal(execute('enemyHealthLogForTime()'),log); execute('spawnEnemy("scout");'); assert.equal(scene().enemies[0].healthLog,log);
  leaveBattle(); begin(); assert.equal(scene().battleTime,0);
  execute('spawnEnemy("scout");'); near(scene().enemies[0].healthLog,Math.log(1.14));
});
check('the opening alien follows its crescent with another and uses a third aimed arc when enraged', () => {
  readyBoss(0,'boss.attackIndex=bossTypes[0].patterns.indexOf("broodArc")-1;prepareAlienAttack(boss);boss.phase="attack";runAlienAttack(boss);');
  const initial=bossState().bossProjectiles;
  assert.equal(initial.length,7);
  assert.ok(initial.every(shot=>shot.vx<0 && Math.hypot(shot.vx,shot.vy)>300));
  for(let index=0;index<3;index++){
    near(initial[index].vx,initial.at(-1-index).vx);
    near(initial[index].vy,-initial.at(-1-index).vy);
  }
  execute('updateBossProjectiles(.15);');
  const moved=bossState().bossProjectiles;
  assert.equal(moved.length,initial.length);
  for(let index=0;index<initial.length;index++){
    near(moved[index].x,initial[index].x+initial[index].vx*.15);
    near(moved[index].y,initial[index].y+initial[index].vy*.15);
  }
  execute('boss.phaseTime=.7;runAlienAttack(boss);');
  assert.equal(bossState().bossProjectiles.length,13);
  readyBoss(0,'boss.enraged=true;boss.attackIndex=bossTypes[0].patterns.indexOf("broodArc")-1;prepareAlienAttack(boss);boss.phase="attack";runAlienAttack(boss);');
  assert.equal(bossState().bossProjectiles.length,8);
  assert.ok(bossState().bossProjectiles.every(shot=>Math.hypot(shot.vx,shot.vy)>Math.hypot(initial[0].vx,initial[0].vy)));
  execute('boss.phaseTime=.63;runAlienAttack(boss);');
  assert.equal(bossState().bossProjectiles.length,17);
  execute('boss.phaseTime=1.28;runAlienAttack(boss);');
  assert.equal(bossState().bossProjectiles.length,22);
});
check('a previous volley still crosses during a normal tell, while cyan corridors clear old projectiles', () => {
  readyBoss(0);
  surface={width:1920,height:1080}; emit(window,'resize');
  execute('boss.phase="recover";boss.phaseTime=bossRules.recovery-.01;'
    + 'addBossProjectile(player.x+250,player.y,-420,0);bossHitGrace=0;');
  frames(14);
  assert.equal(bossState().boss.phase,'telegraph');
  assert.equal(health().lives,2);
  readyBoss(10,'boss.attackIndex=0;addBossProjectile(player.x+200,player.y,-420,0);prepareAlienAttack(boss);');
  assert.equal(bossState().boss.alienAttack,'fusionCorridor');
  assert.equal(bossState().bossProjectiles.length,0);
  assert.ok(bossState().bossHazards.some(hazard=>hazard.kind==='guide'));
});
check('the fusion corridor is reachable from either edge while charging in a tall viewport', () => {
  for (const edge of [.05,.95]) {
    readyBoss(10);
    surface={width:2560,height:1440}; emit(window,'resize');
    execute(`player.y=player.previousY=alienLane(${edge});boss.enraged=true;boss.attackIndex=0;prepareAlienAttack(boss);ultimate.phase='charging';`);
    const guide=bossState().bossHazards.find(hazard=>hazard.kind==='guide');
    const move=edge<.5?'ArrowDown':'ArrowUp';
    key(move);
    const seconds = Math.abs(position().y - guide.y) / execute('player.speed * .65');
    assert.ok(seconds <= bossState().boss.telegraphDuration - .24);
    execute(`updatePlayer(${seconds});`);
    key(move,'keyup');
    assert.ok(Math.abs(position().y-guide.y)<guide.thickness/2-execute('player.height*.16'));
  }
});
check('the first lash follow-up locks the player after the initial dodge and rewards a second move', () => {
  for (const escape of [false, true]) {
    readyBoss(0, 'prepareAlienAttack(boss);');
    const firstY = bossState().bossHazards[0].y;
    key('ArrowUp'); frames(7); key('ArrowUp', 'keyup');
    for (let i = 0; i < 80 && !bossState().bossHazards.some(hazard => hazard.kind === 'zone'); i++) step();
    const follow = bossState().bossHazards.find(hazard => hazard.kind === 'zone');
    assert.ok(follow && follow.age < follow.warning);
    near(follow.y, position().y);
    assert.ok(Math.abs(follow.y - firstY) > 80);
    assert.equal(health().lives, 3);
    if (escape) {
      key('ArrowUp'); key('ArrowLeft'); frames(11);
      key('ArrowUp', 'keyup'); key('ArrowLeft', 'keyup');
      near(bossState().bossHazards.find(hazard => hazard.kind === 'zone').y, follow.y);
    }
    frames(Math.ceil((follow.warning - follow.age - (escape ? .55 : 0)) / .05) + 1);
    assert.equal(health().lives, escape ? 3 : 2);
  }
});
check('mirror pincer locks separate lines and sends real projectiles from both screen edges', () => {
  readyBoss(5, 'boss.attackIndex=0;prepareAlienAttack(boss);');
  frames(Math.ceil((bossState().boss.telegraphDuration + .49) / .05));
  const rear = bossState().bossHazards.find(hazard => hazard.kind === 'portal');
  assert.ok(rear.originX < rear.x && rear.age < rear.warning);
  key('ArrowUp'); frames(11); key('ArrowUp', 'keyup');
  near(bossState().bossHazards.find(hazard => hazard.kind === 'portal').y, rear.y);
  frames(6);
  const front = bossState().bossHazards.find(hazard => hazard.kind === 'portal' && hazard.originX > hazard.x);
  assert.ok(front && front.y < rear.y - 120);
  key('ArrowDown'); frames(5); key('ArrowDown', 'keyup');
  frames(Math.ceil((rear.warning - rear.age) / .05) - 20);
  assert.ok(bossState().bossProjectiles.some(shot => shot.vx > 0));
  const currentFront = bossState().bossHazards.find(hazard => hazard.kind === 'portal' && hazard.originX > hazard.x);
  assert.ok(currentFront);
  frames(Math.ceil((currentFront.warning - currentFront.age) / .05) + 1);
  assert.ok(bossState().bossProjectiles.some(shot => shot.vx < 0));
  assert.equal(health().lives, 3);
});
check('a sideways dodge solves the rift inside the final cyan corridor in compact and wide windows', () => {
  for (const size of [{width:640,height:360},{width:1280,height:720},{width:2560,height:1440}]) {
    for (const escape of [false, true]) {
      readyBoss(10);
      surface = size; emit(window, 'resize');
      execute('player.y=player.previousY=alienLane(.30);boss.enraged=true;boss.attackIndex=0;prepareAlienAttack(boss);bossHitGrace=0;');
      const guide = bossState().bossHazards.find(hazard => hazard.kind === 'guide');
      key('ArrowDown');
      for (let frame = 0; frame < 30 && position().y < guide.y - 8; frame++) step();
      key('ArrowDown', 'keyup');
      while (!bossState().bossHazards.some(hazard => hazard.kind === 'seam') && scene().battleTime < 4) step();
      const seam = bossState().bossHazards.find(hazard => hazard.kind === 'seam');
      assert.ok(seam && seam.age < seam.warning);
      const start = position();
      if (escape) key('ArrowRight');
      frames(9);
      key('ArrowRight', 'keyup');
      frames(Math.ceil((seam.warning - seam.age) / .05) - 8);
      assert.equal(position().y, start.y);
      assert.equal(health().lives, escape ? 3 : 2, `${size.width}x${size.height}, escape ${escape}`);
    }
  }
});
check('attacking shells reduce damage but leave an opening after each attack', () => {
  for (const [type,enraged,expected] of [[0,false,.78],[10,false,.78],[10,true,.62]]) {
    for (const source of ['main','ultimate']) {
      readyBoss(type,`boss.enraged=${enraged};boss.phase="attack";`);
      execute(`applyBossHit({source:"${source}",damageLog:boss.healthLog+Math.log(.02)});`);
      const specialFactor=type===10&&source==='ultimate'?.78:1;
      near(1-bossState().boss.hp,.02*expected*specialFactor);
      execute(`boss.phase="recover";applyBossHit({source:"${source}",damageLog:boss.healthLog+Math.log(.02)});`);
      near(1-bossState().boss.hp,(.02*expected+.02)*specialFactor);
    }
  }
});
check('late hulls progressively cap saturated ordinary fire while remaining vulnerable', () => {
  const saturated=[];
  for (const type of [0,4,9,10]) {
    readyBoss(type);
    saturated.push(execute('var armouredAlien=boss; for(let i=0;i<60;i++){battleTime+=1/60;applyBossHit({damageLog:boss.healthLog+8});} 1-armouredAlien.hp;'));
  }
  assert.ok(saturated.every((damage,index)=>damage>0&&(index===0||damage<saturated[index-1])));
  assert.ok(saturated[3]<=.09);
});
check('the fusion Boss binds a marked area and later detonates that same location with time to escape', () => {
  readyBoss(10,'prepareAlienAttack(boss);');
  const initial=bossState(), bind=initial.bossHazards.find(h=>h.kind==='bind'), blast=initial.bossHazards.find(h=>h.kind==='zone');
  assert.ok(bind && blast); near(bind.x,blast.x); near(bind.y,blast.y);
  assert.ok(blast.warning>bind.warning && blast.warning<bind.warning+bind.duration);
  assert.equal(execute('alienMovementScale()'),1);
  execute('updateBossProjectiles(boss.telegraphDuration);updateBossDamage();');
  assert.ok(execute('alienMovementScale()')>0 && execute('alienMovementScale()')<1);
  assert.equal(health().lives,3);
  execute('player.y=flightBounds.bottom;updateBossProjectiles(.68);updateBossDamage();');
  assert.equal(execute('alienMovementScale()'),1); assert.equal(health().lives,3);
});
check('fusion binding and detonation leave a keyboard escape after the warning at desktop and compact sizes', () => {
  for(const size of [{width:640,height:360},{width:1280,height:720},{width:1920,height:1080}]) {
    for(const start of [.05,.5,.95]) {
      readyBoss(10);
      surface=size; emit(window,'resize');
      execute(`player.y=player.previousY=alienLane(${start});prepareAlienAttack(boss);`);
      const blast=bossState().bossHazards.find(h=>h.kind==='zone');
      const input=start>.5?'ArrowUp':'ArrowDown';
      const firstMove=Math.ceil(execute('boss.telegraphDuration')/.05);
      frames(firstMove);
      key(input); frames(Math.ceil((blast.warning-firstMove*.05)/.05)+1); key(input,'keyup');
      assert.equal(health().lives,3,`${size.width}x${size.height}, start ${start}`);
      assert.ok(Math.abs(position().y-blast.y)>blast.radius+execute('player.height*.16'));
    }
  }
});
check('half health ruptures armor, replaces old threats, and announces a stronger combo', () => {
  readyBoss(4,'boss.hp=.51;boss.attackIndex=1;prepareAlienAttack(boss);boss.phaseTime=.2;');
  execute(bossProjectile()+'applyBossHit({damageLog:boss.healthLog+Math.log(.02)});');
  assert.equal(bossState().boss.enraged,true); near(bossState().boss.hp,.49);
  assert.equal(bossState().boss.phase,'rupture'); near(bossState().boss.phaseTime,0);
  assert.equal(bossState().bossHazards.length,0); assert.equal(bossState().bossProjectiles.length,0);
  assert.equal(nodes.get('#game-app').dataset.bossPhase,'rupture');
  const firstStatus=nodes.get('#status').textContent;
  execute('applyBossHit({damageLog:boss.healthLog+Math.log(.02)});'); near(bossState().boss.hp,.49);
  assert.equal(nodes.get('#status').textContent,firstStatus);
  execute('updateBossEncounter(bossRuptureDuration(boss));');
  assert.equal(bossState().boss.phase,'telegraph');
  assert.equal(bossState().boss.alienAttack,'pressure');
  assert.equal(nodes.get('#game-app').dataset.bossPhase,'frenzy');
  assert.equal(execute('bossCanTakeDamage()'),false);
  execute('updateBossEncounter(boss.telegraphDuration);');
  assert.equal(execute('bossCanTakeDamage()'),true);
});
check('enrage makes projectiles faster while retaining time to read the warning', () => {
  function sample(enraged) {
    readyBoss(1,`boss.enraged=${enraged};prepareAlienAttack(boss);boss.phase="attack";boss.phaseTime=2;runAlienAttack(boss);`);
    const b=bossState(); return {count:b.bossProjectiles.length,speed:Math.hypot(b.bossProjectiles[0].vx,b.bossProjectiles[0].vy),warning:b.boss.telegraphDuration};
  }
  const calm=sample(false),rage=sample(true);
  assert.ok(rage.count>0 && calm.count>0); assert.ok(rage.speed>calm.speed); assert.equal(rage.warning,calm.warning); assert.ok(rage.warning>=1.4);
});
check('Boss durability uses a growing time reference and stays finite at extreme tiers', () => {
  let previous=0;
  for(const time of [90,360,3600,36000]) {
    isolatedBattle(`battleTime=${time};spawnBoss(0);boss.phase="recover";`);
    const birth=bossState().boss.healthLog;
    assert.ok(Number.isFinite(birth)&&birth>previous);
    assert.ok(execute('boss.healthLog>=progressionReferenceDpsLog(battleTime)+Math.log(boss.endurance)-1e-9'));
    execute('weapon.tier=10000;weapon.lanes=4;weapon.damage=999;weapon.interval=.025;spawnBoss(0);boss.phase="recover";');
    assert.equal(bossState().boss.healthLog,birth);
    execute('applyBossHit({damageLog:boss.healthLog+Math.log(.02)});');
    near(bossState().boss.hp,.98,1e-8);
    previous=birth;
  }
});
check('full-screen warning shows the selected boss once and clears on spawn, defeat, death and menu', () => {
  isolatedBattle(); execute('resetBossEncounter();battleTime=nextBossTime-bossRules.warning;'); audioCalls.length=0; execute('updateBossEncounter(0);');
  assert.equal(nodes.get('#boss-warning').hidden,false); assert.ok(nodes.get('#boss-warning-name').textContent.includes('即将出现'));
  assert.equal(audioCalls.filter(c=>c.name==='warning').length,1);
  execute('updateBossEncounter(.05);updateBossEncounter(.05);'); assert.equal(audioCalls.filter(c=>c.name==='warning').length,1);
  execute('battleTime=nextBossTime;updateBossEncounter(0);'); assert.equal(nodes.get('#boss-warning').hidden,true);
  execute('setBossWarning("测试");defeatBoss();'); assert.equal(nodes.get('#boss-warning').hidden,true);
  execute('setBossWarning("测试");endGame();'); assert.equal(nodes.get('#boss-warning').hidden,true);
  begin(); execute('setBossWarning("测试");'); leaveBattle(); assert.equal(nodes.get('#boss-warning').hidden,true);
});
check('warning countdown freezes while paused and resizing does not consume or replay it', () => {
  isolatedBattle(); execute('resetBossEncounter();battleTime=nextBossTime-bossRules.warning;updateBossEncounter(0);');
  const time=scene().battleTime;
  const selected=bossState().pendingBossType; audioCalls.length=0;
  emit(window,'blur'); frames(100); assert.equal(scene().battleTime,time); assert.equal(bossState().pendingBossType,selected);
  surface={width:640,height:360}; emit(window,'resize'); assert.equal(bossState().pendingBossType,selected);
  assert.equal(nodes.get('#boss-warning').hidden,false); assert.equal(audioCalls.filter(c=>c.name==='warning').length,0);
  emit(window,'focus'); step(); assert.equal(scene().battleTime,time);
});
check('audio lifecycle follows start, pause, resume, boss, enrage, defeat and game over', () => {
  const lastSync=()=>audioCalls.filter(c=>c.name==='sync').at(-1)?.args.slice(0,3);
  audioCalls.length=0; begin(); assert.ok(audioCalls.some(c=>c.name==='unlock')); assert.deepEqual(lastSync(),[true,false,false]);
  emit(window,'blur'); assert.equal(lastSync()[0],false);
  emit(window,'focus'); step(); assert.deepEqual(lastSync(),[true,false,false]);
  document.hidden=true; emit(document,'visibilitychange'); assert.equal(lastSync()[0],false);
  document.hidden=false; emit(document,'visibilitychange'); step(); assert.equal(lastSync()[0],true);
  execute('spawnBoss(0);'); step(); assert.deepEqual(lastSync(),[true,true,false]);
  execute('boss.phase="recover";boss.hp=.49;applyBossHit({damageLog:boss.healthLog+Math.log(.001)});'); step();
  assert.deepEqual(lastSync(),[true,true,true]);
  execute('defeatBoss();'); step(); assert.deepEqual(lastSync(),[true,false,false]); assert.equal(audioCalls.filter(c=>c.name==='sync').at(-1).args[3].cinematic,true);
  finishBossPresentation(); execute('chooseEvolution("pierce");'); step(); assert.deepEqual(lastSync(),[true,false,false]);
  execute('endGame();'); assert.equal(lastSync()[0],false);
  emit(nodes.get('#restart-button'),'click'); step(); assert.deepEqual(lastSync(),[true,false,false]);
  leaveBattle(); assert.equal(lastSync()[0],false);
});
check('shooting sound is emitted per visible volley, explosion sound only on destruction, and mute restores focus', () => {
  isolatedBattle('weapon.interval=.001;weapon.lanes=4;resetWeapons();'); audioCalls.length=0;
  execute('updateShooting(0);updateShooting(.05);'); assert.equal(audioCalls.filter(c=>c.name==='shoot').length,2);
  isolatedBattle(target(400,300,100,2)+shot()); audioCalls.length=0; step(); assert.equal(audioCalls.filter(c=>c.name==='explode').length,0);
  execute(shot()); step(); assert.deepEqual(audioCalls.filter(c=>c.name==='explode').map(c=>c.args[0]),[false]);
  readyBoss(0); audioCalls.length=0; execute('defeatBoss();'); assert.deepEqual(audioCalls.filter(c=>c.name==='explode').map(c=>c.args[0]),[true]);
  finishBossPresentation(); execute('chooseEvolution("pierce");');
  gameAudio.muted=false; nodes.get('#sound-button').focus(); emit(nodes.get('#sound-button'),'click');
  assert.equal(gameAudio.muted,true); assert.equal(document.activeElement,canvas); assert.match(nodes.get('#sound-button').textContent,/关/);
  emit(nodes.get('#sound-button'),'click'); assert.equal(gameAudio.muted,false); assert.match(nodes.get('#sound-button').textContent,/开/);
});
const ult = () => JSON.parse(execute('JSON.stringify({charges:ultimate.charges,energy:ultimate.energy,phase:ultimate.phase,elapsed:ultimate.elapsed,shot:ultimate.shot&&{x:ultimate.shot.x,y:ultimate.shot.y,damageLog:ultimate.shot.damageLog}})'));
function primeUltimate(count=1) { execute(`ultimate.charges=${count};updateUltimateDisplay();`); }
function castUltimate() { assert.equal(execute('requestUltimate()'),true); execute('updateUltimate(.85);'); }
check('new rounds start at zero energy with a readable five-slot meter', () => {
  isolatedBattle(); assert.equal(ult().charges,0); assert.equal(ult().energy,0);
  assert.equal(nodes.get('#ultimate-count').textContent,'0 / 5');
  assert.equal(nodes.get('#ultimate-meter').attributes['aria-valuenow'],'0');
  assert.equal(slots.filter(slot=>slot.dataset.filled==='true').length,0);
  key('Space'); assert.equal(ult().phase,'idle'); key('Space','keyup');
});
check('energy counts actual enemy damage and clamps lethal overkill', () => {
  isolatedBattle(target(600,300,100,10));
  execute('applyEnemyHit(enemies[0],{damage:3});'); near(ult().energy,3.6);
  execute('applyEnemyHit(enemies[0],{damage:100000});'); near(ult().energy,12);
  execute('applyEnemyHit(enemies[0],{damage:100000});'); near(ult().energy,12);
  assert.equal(scene().enemies[0].hp,0);
});
check('boss hits fill energy by actual health removed including lethal remainder', () => {
  readyBoss(1);
  execute('for(let hit=0;hit<10;hit++){battleTime+=.3;applyBossHit({damageLog:boss.healthLog+Math.log(.025)});}');
  near(ult().energy,45);
  execute('boss.hp=.015;ultimate.energy=99;battleTime+=.3;applyBossHit({damageLog:boss.healthLog+5});');
  assert.equal(ult().charges,1); near(ult().energy,1.7); assert.equal(bossState().boss.finale.mode,'bones');
});
check('misses, energy orbs, collisions and ultimate damage cannot charge another ultimate', () => {
  isolatedBattle(orb('red')+shot()); step(); near(ult().energy,0);
  execute(shot(400,20)); step(); near(ult().energy,0); collide(); near(ult().energy,0);
  execute(target(600,300,100,10)+'applyEnemyHit(enemies[0],{damage:4,source:"ultimate"});'); near(ult().energy,0);
  readyBoss(1); execute('applyBossHit({damageLog:boss.healthLog+Math.log(.15),source:"ultimate"});'); near(ult().energy,0);
});
check('charge conversion preserves remainder and clamps storage at five with no hidden overflow', () => {
  isolatedBattle('ultimate.energy=94;gainUltimateEnergy(1);'); assert.equal(ult().charges,1); near(ult().energy,6);
  execute('for(let i=0;i<100;i++) gainUltimateEnergy(1);');
  assert.equal(ult().charges,5); near(ult().energy,0);
  assert.equal(nodes.get('#ultimate-meter').attributes['aria-valuenow'],'100');
  assert.equal(slots.filter(slot=>slot.dataset.filled==='true').length,5);
  execute('gainUltimateEnergy(NaN);gainUltimateEnergy(Infinity);gainUltimateEnergy(-1);requestUltimate();');
  assert.equal(ult().charges,4); near(ult().energy,0);
});
check('space consumes one charge per press, blocks repeats and suppresses page scrolling', () => {
  isolatedBattle(); primeUltimate(5); assert.equal(key('Space').prevented,true);
  assert.equal(ult().charges,4); assert.equal(ult().phase,'charging');
  key('Space','keydown',{repeat:true}); key('Space'); assert.equal(ult().charges,4);
  execute('updateUltimate(5);'); assert.equal(ult().phase,'idle'); key('Space'); assert.equal(ult().charges,4);
  key('Space','keyup'); key('Space'); assert.equal(ult().charges,3); key('Space','keyup');
});
check('space shortcuts, menus and unfocused or paused battles do not cast', () => {
  isolatedBattle(); primeUltimate(2);
  for(const modifier of ['altKey','ctrlKey','metaKey']) assert.equal(key('Space','keydown',{[modifier]:true}).prevented,false);
  assert.equal(ult().charges,2); nodes.get('#sound-button').focus(); key('Space'); assert.equal(ult().charges,2);
  emit(canvas,'pointerdown'); emit(window,'blur'); key('Space'); assert.equal(ult().charges,2);
  emit(window,'focus'); leaveBattle(); key('Space'); assert.equal(ult().phase,'idle');
});
check('charge lasts exactly 0.85 seconds and emits one charge and one launch sound', () => {
  isolatedBattle(); primeUltimate(); audioCalls.length=0;
  key('Space'); key('Space','keyup'); execute('updateUltimate(.84);'); assert.equal(ult().phase,'charging');
  assert.equal(audioCalls.filter(c=>c.name==='fireUltimate').length,0);
  execute('updateUltimate(.01);'); assert.equal(ult().phase,'firing');
  assert.equal(audioCalls.filter(c=>c.name==='chargeUltimate').length,1);
  assert.equal(audioCalls.filter(c=>c.name==='fireUltimate').length,1);
  execute('updateUltimate(.1);'); assert.equal(audioCalls.filter(c=>c.name==='fireUltimate').length,1);
});
check('charging permits slower aiming; launch follows current nose then keeps a fixed flight axis', () => {
  isolatedBattle(); primeUltimate(); key('Space'); key('Space','keyup');
  const initial=position(); key('ArrowDown'); execute('updatePlayer(.2);'); key('ArrowDown','keyup');
  near(position().y-initial.y,300*.65*.2);
  execute('updateUltimate(.85);'); const beam=ult().shot; near(beam.y,position().y);
  near(beam.x,execute('muzzlePosition().x'));
  key('ArrowUp'); execute('updatePlayer(.2);'); key('ArrowUp','keyup');
  near(ult().shot.y,beam.y); assert.notEqual(position().y,beam.y);
});
check('charging and firing stop new ordinary volleys but keep old bullets moving without backlog', () => {
  isolatedBattle('resetWeapons();updateShooting(0);'); const initial=shots()[0];
  primeUltimate(); castUltimate(); execute('updateShooting(.4);');
  assert.equal(shots().length,1); assert.ok(shots()[0].x>initial.x);
  assert.equal(execute('pendingShots'),0); execute('updateUltimate(3);updateShooting(.2);');
  assert.equal(shots().length,2);
});
check('a red cylinder pierces several enemies once, awards kills, and misses other rows and targets behind it', () => {
  isolatedBattle(); const y=position().y;
  execute(target(480,y,60,10)+target(720,y,60,10)+target(960,y,60,1000)+target(600,y+160,60,10)+target(50,y,60,10));
  primeUltimate(); castUltimate(); execute('updateUltimate(.4);');
  assert.equal(scene().score,200); assert.equal(health().kills,2);
  const tank=scene().enemies.find(e=>e.maxHp===1000); assert.ok(tank.hp<1000); const hp=tank.hp;
  execute('updateUltimate(.05);resolveUltimateHits();resolveUltimateHits();');
  near(scene().enemies.find(e=>e.maxHp===1000).hp,hp);
  assert.equal(scene().enemies.filter(e=>e.hp===10).length,2); near(ult().energy,0);
});
check('cannon preserves orbs and only damages enemies inside the visible battlefield', () => {
  isolatedBattle(orb('yellow',600,position().y)+target(1800,position().y,60,10));
  primeUltimate(); castUltimate(); execute('updateUltimate(.8);');
  assert.equal(orbScene().powerups.length,1); assert.equal(weaponState().lanes,1);
  assert.equal(scene().enemies[0].hp,10);
});
check('cannon against a boss caps one hit at eighteen percent even after an enormous weapon upgrade', () => {
  readyBoss(2,'player.y=boss.y;weapon.tier=500;'); primeUltimate(); castUltimate();
  execute('updateUltimate(.45);'); near(bossState().boss.hp,.82,1e-10); near(ult().energy,0);
  execute('updateUltimate(.1);resolveUltimateHits();'); near(bossState().boss.hp,.82,1e-10);
});
check('a weak cannon respects its own damage below the boss cap instead of always dealing eighteen percent', () => {
  readyBoss(2,'player.y=boss.y;boss.healthLog+=Math.log(100);'); primeUltimate(); castUltimate();
  execute('updateUltimate(.5);'); const hp=bossState().boss.hp;
  assert.ok(hp>.99&&hp<1); near(ult().energy,0);
});
check('a cannon can finish the wounded third boss once, award its milestone heal and never feed back energy', () => {
  readyBoss(2,'beginBossFinale(boss);boss.finale.age=boss.finale.transform;boss.finale.openUntil=8;player.y=boss.y;boss.hp=.06;player.lives=2;'); primeUltimate(); castUltimate(); execute('updateUltimate(.5);');
  assert.equal(bossState().boss,null); assert.equal(scene().score,2000); assert.equal(health().lives,3);
  execute('updateUltimate(.1);resolveUltimateHits();'); assert.equal(scene().score,2000); near(ult().energy,0);
});
check('cannon damage and energy remain finite far beyond numeric projectile damage limits', () => {
  isolatedBattle('battleTime=7200;weapon.tier=10000;weapon.lanes=4;weapon.interval=.001;spawnEnemy("scout");enemies[0].x=700;enemies[0].previousX=700;enemies[0].y=player.y;');
  primeUltimate(); castUltimate(); assert.ok(Number.isFinite(ult().shot.damageLog)); execute('updateUltimate(.4);');
  assert.equal(scene().enemies.length,0); assert.equal(scene().score,100); near(ult().energy,0);
});
check('with unchanged equipment the cannon becomes more powerful as battle time increases', () => {
  isolatedBattle(); const powers=[];
  for(const time of [0,90,300,1200,7200]) powers.push(execute(`battleTime=${time};ultimateDamageLog()`));
  assert.ok(powers.every(Number.isFinite)); assert.ok(powers.every((v,i)=>!i||v>powers[i-1]));
});
check('cannon penetration and cleanup work at twenty, sixty and 144 frames per second', () => {
  for(const fps of [20,60,144]) {
    isolatedBattle(target(550,position().y,70,10)+target(920,position().y,70,10)); primeUltimate();
    execute('requestUltimate();'); for(let i=0;i<fps*3;i++) execute(`updateUltimate(${1/fps});`);
    assert.equal(scene().score,200); assert.equal(scene().enemies.length,0); assert.equal(ult().phase,'idle'); assert.equal(ult().shot,null);
  }
});
check('pause freezes charge and resumes its remaining sound without spending twice', () => {
  isolatedBattle(); primeUltimate(2); key('Space'); key('Space','keyup'); frames(5);
  const before=ult(); audioCalls.length=0; emit(window,'blur'); frames(100);
  assert.deepEqual(ult(),before); assert.ok(audioCalls.some(c=>c.name==='stopUltimate'));
  emit(window,'focus'); step(); assert.deepEqual(ult(),before);
  const resume=audioCalls.filter(c=>c.name==='chargeUltimate'); assert.equal(resume.length,1); near(resume[0].args[0],.85-before.elapsed);
  frames(13); assert.equal(ult().phase,'firing'); assert.equal(ult().charges,1);
});
check('pause freezes a fired beam and does not replay its impact sound on resume', () => {
  isolatedBattle(); primeUltimate(); castUltimate(); execute('updateUltimate(.2);');
  const before=ult(); audioCalls.length=0; document.hidden=true; emit(document,'visibilitychange'); frames(100);
  assert.deepEqual(ult(),before); document.hidden=false; emit(document,'visibilitychange'); step();
  assert.deepEqual(ult(),before); assert.equal(audioCalls.filter(c=>c.name==='fireUltimate').length,0);
});
check('resize refunds unfinished charging but not fired ammunition, preserving accumulated energy', () => {
  isolatedBattle('ultimate.energy=37;'); primeUltimate(3); execute('requestUltimate();updateUltimate(.3);');
  surface={width:1100,height:700}; emit(window,'resize'); assert.equal(ult().charges,3); near(ult().energy,37); assert.equal(ult().phase,'idle');
  castUltimate(); surface={width:1200,height:720}; emit(window,'resize'); assert.equal(ult().charges,2); near(ult().energy,37); assert.equal(ult().shot,null);
});
check('death stops a charging cannon and restart or menu removes stored energy and every active beam', () => {
  isolatedBattle('ultimate.energy=51;player.lives=1;'); primeUltimate(3); execute('requestUltimate();'); collide();
  assert.equal(health().state,'over'); assert.equal(ult().phase,'idle'); assert.equal(ult().shot,null);
  emit(nodes.get('#restart-button'),'click'); assert.equal(ult().charges,0); near(ult().energy,0);
  primeUltimate(2); castUltimate(); leaveBattle(); assert.equal(ult().charges,0); assert.equal(ult().phase,'idle'); assert.equal(ult().shot,null);
});
check('energy cannon drawings balance context state and never draw nonfinite coordinates', () => {
  for(const reduced of [false,true]) for(const phase of ['charging','firing']) {
    isolatedBattle(); primeUltimate(); execute(`reducedMotion.matches=${reduced};requestUltimate();updateUltimate(${phase==='charging'?.4:1.05});`);
    captureDraws=true; drawOperations.length=0; execute('drawUltimate();'); captureDraws=false;
    assert.equal(drawOperations.filter(d=>d.name==='save').length,drawOperations.filter(d=>d.name==='restore').length);
    assert.ok(drawOperations.flatMap(d=>d.args).filter(v=>typeof v==='number').every(Number.isFinite));
    assert.ok(drawOperations.some(d=>d.name==='ellipse'));
    assert.ok(drawOperations.some(d=>d.name==='set:globalCompositeOperation'&&d.args[0]==='screen'));
    assert.equal(drawOperations.some(d=>d.name==='fillRect'),false);
  }
  execute('reducedMotion.matches=false;');
});
check('four orbs have exact weights and healing is four percent', () => {
  isolatedBattle(); const counts={blue:0,yellow:0,red:0,heal:0};
  for(let i=0;i<10000;i++) counts[execute(`choosePowerupType(${(i+.5)/10000})`)]++;
  assert.deepEqual(counts,{blue:3200,yellow:3200,red:3200,heal:400});
  assert.equal(execute('choosePowerupType(0.32)'),'yellow'); assert.equal(execute('choosePowerupType(.64)'),'red');
  assert.equal(execute('choosePowerupType(.96)'),'heal');
});
check('the removed purple orb is absent from the catalog and never selected or spawned', () => {
  isolatedBattle(); assert.equal(execute('Object.hasOwn(powerupTypes,"ultimate")'),false);
  for(let i=0;i<200;i++) {
    execute('spawnPowerup();'); const last=orbScene().powerups.at(-1);
    assert.ok(['blue','yellow','red','heal'].includes(last.type));
    execute('powerups.length=0;');
  }
  assert.equal(ult().charges,0); near(ult().energy,0);
});
check('removed or unknown powerups safely preserve stored cannon charges, energy, health and equipment', () => {
  isolatedBattle('ultimate.charges=4;ultimate.energy=88;player.lives=2;'); const before=ult(); const weaponBefore=weaponState();
  assert.equal(execute('applyPowerup("ultimate")'),false); assert.equal(execute('applyPowerup("unknown")'),false);
  assert.deepEqual(ult(),before); assert.deepEqual(weaponState(),weaponBefore); assert.equal(health().lives,2);
  assert.equal(scene().score,0); assert.equal(health().kills,0);
});
check('green orb heals one life and raises capacity at full health even late in a round', () => {
  isolatedBattle('battleTime=7200;player.lives=1;'+orb('heal')+shot()); step(); assert.equal(health().lives,2);
  execute(orb('heal')+shot()); step(); assert.equal(health().lives,3);
  assert.equal(execute('player.maxLives'),3);
  assert.equal(nodes.get('#player-lives').textContent,'♥ ♥ ♥');
  execute(orb('heal')+shot()); step(); assert.equal(health().lives,4);
  assert.equal(execute('player.maxLives'),4);
  assert.equal(nodes.get('#powerup-notice').textContent,'生命上限 +1 · 4 / 4');
  assert.equal(nodes.get('#player-lives').textContent,'♥ 4 / 4');
  assert.equal(nodes.get('#player-lives').attributes['aria-label'],'生命 4 / 4');
  execute('damagePlayer("撞击");'+orb('heal')+shot()); step(); assert.equal(health().lives,4);
  assert.equal(execute('player.maxLives'),4);
  assert.equal(nodes.get('#powerup-notice').textContent,'生命 +1 · 剩余 4 / 4');
  execute(orb('heal')+shot()); step(); assert.equal(health().lives,5);
  assert.equal(execute('player.maxLives'),5); near(ult().energy,0); assert.equal(scene().score,0);
  emit(nodes.get('#restart-button'),'click');
  assert.equal(health().lives,3); assert.equal(execute('player.maxLives'),3);
});
check('two bullets cannot increase capacity twice from a single healing orb', () => {
  isolatedBattle(orb('heal')+shot()+shot()); step();
  assert.equal(health().lives,4); assert.equal(execute('player.maxLives'),4);
  assert.equal(orbScene().powerups.length,0); assert.equal(shots().length,1);
  assert.equal(ult().charges,0); near(ult().energy,0);
});
check('healing orbs obey shoot-to-collect, off-axis misses and harmless offscreen expiration', () => {
  isolatedBattle('player.lives=2;'+orb('heal',position().x,position().y)); step();
  assert.equal(health().lives,2); assert.equal(ult().charges,0);
  execute('powerups[0].x=-100;'); step(); assert.equal(orbScene().powerups.length,0); assert.equal(health().lives,2);
  execute(orb('heal',600,100)+shot(550,200)); step(); assert.equal(orbScene().powerups.length,1); assert.equal(ult().charges,0);
});
check('removed purple rewards cannot add a future use during charging or duplicate a resize refund', () => {
  isolatedBattle(); primeUltimate(2); execute('requestUltimate();applyPowerup("ultimate");'); assert.equal(ult().charges,1);
  surface={width:1200,height:700}; emit(window,'resize'); assert.equal(ult().charges,2);
  emit(window,'resize'); assert.equal(ult().charges,2); assert.equal(ult().phase,'idle');
});
check('four-lane promotion adds eight percent without changing a simultaneous Boss birth', () => {
  isolatedBattle('weapon.damage=3;weapon.tier=6;');
  near(execute('Math.exp(weaponDamageLog())'),3*4.32**5,1e-7);
  near(execute('projectileDamage()'),3*4.32**5);
  execute('weapon.lanes=4;spawnBoss(1);');
  const durability=bossState().boss.healthLog;
  const before=execute('projectileDamage()*weapon.lanes');
  execute('applyPowerup("yellow");spawnBoss(1);');
  near(execute('projectileDamage()*weapon.lanes')/before,1.08);
  assert.equal(bossState().boss.healthLog,durability);
});
check('cannon exit restores idle in the same frame and the next fresh press immediately starts charging', () => {
  isolatedBattle(); primeUltimate(3); key('Space'); key('Space','keyup'); execute('updateUltimate(.85);');
  const untilExit=execute('(viewport.width+ultimate.shot.length+ultimate.shot.radius-ultimate.shot.x)/ultimate.shot.speed');
  execute(`updateUltimate(${untilExit-.0001});`); assert.equal(ult().phase,'firing');
  execute('updateUltimate(.0001);'); assert.equal(ult().phase,'idle'); assert.equal(ult().shot,null);
  assert.equal(key('Space').prevented,true); assert.equal(ult().phase,'charging'); assert.equal(ult().charges,1);
  near(ult().elapsed,0); key('Space','keyup');
});
check('a held or premature space press never buffers another cannon after the first shot finishes', () => {
  isolatedBattle(); primeUltimate(3); key('Space'); execute('updateUltimate(.85);');
  key('Space','keydown',{repeat:true}); execute('updateUltimate(5);'); assert.equal(ult().phase,'idle');
  key('Space','keydown',{repeat:true}); key('Space'); assert.equal(ult().phase,'idle'); assert.equal(ult().charges,2);
  key('Space','keyup'); key('Space'); key('Space','keyup'); execute('updateUltimate(.85);');
  key('Space'); key('Space','keyup'); execute('updateUltimate(5);'); assert.equal(ult().phase,'idle'); assert.equal(ult().charges,1);
});
const protection = () => JSON.parse(execute('JSON.stringify(shield)'));
function primeShield(charges=1) { execute(`shield.charges=${charges};updateShieldDisplay();`); }
check('a new round has zero shield energy and two accessible empty storage slots', () => {
  isolatedBattle(); const {charges,energy,remaining}=protection(); assert.deepEqual({charges,energy,remaining},{charges:0,energy:0,remaining:0});
  assert.equal(nodes.get('#shield-count').textContent,'0 / 2');
  assert.equal(nodes.get('#shield-meter').attributes['aria-valuenow'],'0');
  assert.equal(protectionSlots.filter(s=>s.dataset.filled==='true').length,0);
  assert.equal(execute('requestShield()'),false); assert.equal(execute('shieldIsActive()'),false);
});
check('shield time crosses the exact twenty-five-second threshold and preserves partial progress', () => {
  isolatedBattle(); execute('updateShield(24.999);'); assert.equal(protection().charges,0);
  execute('updateShield(.001);'); assert.equal(protection().charges,1); near(protection().energy,0);
  execute('updateShield(10);'); near(protection().energy,10);
  assert.equal(nodes.get('#shield-count').textContent,'1 / 2');
  assert.equal(nodes.get('#shield-meter').attributes['aria-valuenow'],'40');
  assert.equal(protectionSlots.filter(s=>s.dataset.filled==='true').length,1);
});
check('shield accumulates identically at twenty, sixty and 144 frames per second', () => {
  for(const fps of [20,60,144]) {
    isolatedBattle(); for(let i=0;i<fps*50;i++) execute(`updateShield(${1/fps});`);
    assert.equal(protection().charges,2); near(protection().energy,0);
  }
});
check('full shield storage cannot hide a third use and invalid time inputs cannot corrupt energy', () => {
  isolatedBattle(); execute('updateShield(5000);'); assert.equal(protection().charges,2); near(protection().energy,0);
  assert.equal(nodes.get('#shield-meter').attributes['aria-valuenow'],'100');
  assert.equal(protectionSlots.filter(s=>s.dataset.filled==='true').length,2);
  execute('updateShield(5000);requestShield();'); assert.equal(protection().charges,1); near(protection().energy,0);
  const before=protection(); execute('updateShield(NaN);updateShield(Infinity);updateShield(-1);updateShield(0);');
  assert.deepEqual(protection(),before);
});
check('V grants two seconds of protection and further presses cannot waste the reserved charge', () => {
  isolatedBattle(); primeShield(2); assert.equal(key('KeyV').prevented,true);
  assert.equal(protection().charges,1); near(protection().remaining,2); assert.equal(execute('shieldIsActive()'),true);
  key('KeyV','keydown',{repeat:true}); key('KeyV'); key('KeyV','keyup'); key('KeyV'); key('KeyV','keyup');
  assert.equal(protection().charges,1); near(protection().remaining,2);
  execute('updateShield(1.999);'); assert.equal(execute('shieldIsActive()'),true);
  execute('updateShield(.001);'); assert.equal(execute('shieldIsActive()'),false);
  key('KeyV'); key('KeyV','keyup'); assert.equal(protection().charges,0); near(protection().remaining,2);
});
check('holding V through expiry never spends a second stored shield automatically', () => {
  isolatedBattle(); primeShield(2); key('KeyV'); execute('updateShield(2);');
  key('KeyV','keydown',{repeat:true}); key('KeyV'); assert.equal(protection().charges,1); assert.equal(execute('shieldIsActive()'),false);
  key('KeyV','keyup'); key('KeyV'); key('KeyV','keyup'); assert.equal(protection().charges,0); assert.equal(execute('shieldIsActive()'),true);
});
check('shield keeps recharging while active and never resets an existing partial charge on activation', () => {
  isolatedBattle('shield.energy=24;'); primeShield(1); execute('requestShield();'); near(protection().energy,24);
  execute('updateShield(1);'); assert.equal(protection().charges,1); near(protection().energy,0); near(protection().remaining,1);
  execute('updateShield(1);'); near(protection().energy,1); assert.equal(execute('shieldIsActive()'),false);
});
check('V respects modifier keys, control focus, window pause and the menu', () => {
  isolatedBattle(); primeShield(2);
  for(const modifier of ['altKey','ctrlKey','metaKey']) assert.equal(key('KeyV','keydown',{[modifier]:true}).prevented,false);
  assert.equal(protection().charges,2); nodes.get('#sound-button').focus(); assert.equal(key('KeyV').prevented,false);
  emit(canvas,'pointerdown'); emit(window,'blur'); assert.equal(key('KeyV').prevented,false); assert.equal(execute('requestShield()'),false);
  emit(window,'focus'); assert.equal(protection().charges,2); leaveBattle();
  assert.equal(key('KeyV').prevented,false); assert.equal(execute('requestShield()'),false);
});
check('shield energy and remaining duration freeze on every pause route and resume without catch-up', () => {
  for(const route of ['window','hidden','control']) {
    isolatedBattle('shield.energy=12;'); primeShield(2); execute('requestShield();updateShield(.4);'); const before=protection();
    if(route==='window') emit(window,'blur');
    if(route==='hidden') { document.hidden=true; emit(document,'visibilitychange'); }
    if(route==='control') nodes.get('#sound-button').focus();
    frames(100); execute('updateShield(500);'); assert.deepEqual(protection(),before);
    if(route==='window') emit(window,'focus');
    if(route==='hidden') { document.hidden=false; emit(document,'visibilitychange'); }
    if(route==='control') emit(canvas,'pointerdown');
    step(); assert.deepEqual(protection(),before); step(); near(protection().remaining,before.remaining-.05);
  }
});
check('shield blocks direct damage and contact collisions without awarding points, kills or attack energy', () => {
  isolatedBattle(); primeShield(); execute('requestShield();'); const energy=ult().energy;
  assert.equal(execute('damagePlayer("测试")'),false); assert.equal(health().lives,3); assert.equal(bossState().bossHitGrace,0);
  collide(); assert.equal(health().lives,3); assert.equal(scene().enemies.length,0);
  assert.equal(scene().score,0); assert.equal(health().kills,0); near(ult().energy,energy);
  execute('updateShield(2);'); collide(); assert.equal(health().lives,2);
});
check('shield blocks and clears Boss bullets without silently granting grace past the two-second expiry', () => {
  readyBoss(0); primeShield(); execute('requestShield();'+bossProjectile().repeat(4)+'updateBossDamage();');
  assert.equal(health().lives,3); assert.equal(bossState().bossProjectiles.length,0); assert.equal(bossState().bossHitGrace,0);
  execute('updateShield(1.99);'+bossProjectile()+'updateBossDamage();'); assert.equal(health().lives,3);
  execute('updateShield(.01);'+bossProjectile()+'updateBossDamage();'); assert.equal(health().lives,2);
});
check('shield protects against active beams and lightning zones then exposes the player at expiry', () => {
  for(const kind of ['beam','zone']) {
    readyBoss(kind==='beam'?4:2); primeShield(); execute('requestShield();');
    execute(`addBossHazard("${kind}",{x:player.x,y:player.y,radius:35,thickness:20,warning:.1,duration:5});bossHazards[0].age=.2;updateBossDamage();`);
    assert.equal(health().lives,3); assert.equal(bossState().bossHazards.length,1);
    execute('updateShield(1.99);updateBossDamage();'); assert.equal(health().lives,3);
    execute('updateShield(.01);updateBossDamage();'); assert.equal(health().lives,2);
  }
});
check('shield and cannon can operate together while ordinary movement remains available', () => {
  isolatedBattle(); primeShield(); primeUltimate(); key('KeyV'); key('KeyV','keyup'); key('Space'); key('Space','keyup');
  assert.equal(execute('shieldIsActive()'),true); assert.equal(ult().phase,'charging');
  const before=position(); key('KeyD'); execute('updatePlayer(.2);'); key('KeyD','keyup'); assert.ok(position().x>before.x);
  execute('updateUltimate(.85);'); assert.equal(ult().phase,'firing'); assert.equal(execute('shieldIsActive()'),true);
});
check('resize and fullscreen transitions keep shield storage, energy and remaining protection intact', () => {
  isolatedBattle('shield.energy=16.25;'); primeShield(2); execute('requestShield();updateShield(.45);'); const before=protection();
  for(const size of [{width:640,height:360},{width:1920,height:1080},{width:390,height:844}]) {
    surface=size; emit(window,'resize'); assert.deepEqual(protection(),before);
  }
  emit(document,'fullscreenchange'); assert.deepEqual(protection(),before);
});
check('death ends active protection and restart or returning to menu clears all stored shield progress', () => {
  isolatedBattle('shield.energy=18;'); primeShield(2); execute('requestShield();endGame();');
  near(protection().remaining,0); assert.equal(execute('shieldIsActive()'),false); const ended=protection();
  frames(100); execute('updateShield(100);'); assert.deepEqual(protection(),ended);
  emit(nodes.get('#restart-button'),'click'); assert.deepEqual(protection(),{charges:0,energy:0,remaining:0,perfectRemaining:0,perfectUsed:false,flash:0,slowRemaining:0,effect:null});
  execute('updateShield(31);requestShield();'); leaveBattle(); assert.deepEqual(protection(),{charges:0,energy:0,remaining:0,perfectRemaining:0,perfectUsed:false,flash:0,slowRemaining:0,effect:null});
});
check('shield drawing is a translucent red enclosing ellipse with finite geometry and balanced canvas state', () => {
  for(const reduced of [false,true]) for(const size of [{width:390,height:844},{width:1280,height:720}]) {
    surface=size; emit(window,'resize'); begin(); primeShield(); execute(`reducedMotion.matches=${reduced};requestShield();updateShield(.4);`);
    const before=protection(); captureDraws=true; drawOperations.length=0; execute('drawShield();'); captureDraws=false;
    assert.deepEqual(protection(),before);
    assert.equal(drawOperations.filter(d=>d.name==='save').length,drawOperations.filter(d=>d.name==='restore').length);
    assert.ok(drawOperations.flatMap(d=>d.args).filter(v=>typeof v==='number').every(Number.isFinite));
    const outer=drawOperations.find(d=>d.name==='ellipse'); assert.ok(outer);
    near(outer.args[0],position().x); near(outer.args[1],position().y);
    assert.ok(outer.args[2]>execute('player.width/2')); assert.ok(outer.args[3]>execute('player.height/2'));
    assert.ok(drawOperations.some(d=>d.name==='set:strokeStyle' && /^#ff[0-9a-f]{6}$/i.test(d.args[0])));
    assert.ok(drawOperations.some(d=>d.name==='set:fillStyle'));
  }
  execute('reducedMotion.matches=false;resetShield();'); captureDraws=true; drawOperations.length=0; execute('drawShield();'); captureDraws=false;
  assert.equal(drawOperations.length,0);
});
check('Boss attacks trigger volley cues and warned lasers sound only when they activate', () => {
  readyBoss(1); audioCalls.length=0; execute('prepareAlienAttack(boss);boss.phase="attack";runAlienAttack(boss);');
  assert.ok(audioCalls.some(c=>c.name==='bossAttack'&&c.args[0]==='volley'));
  readyBoss(4); audioCalls.length=0; execute('addBossHazard("beam",{y:200,thickness:30,warning:1,duration:2});updateBossProjectiles(.99);');
  assert.equal(audioCalls.filter(c=>c.name==='bossAttack'&&c.args[0]==='beam').length,0);
  execute('updateBossProjectiles(.01);updateBossProjectiles(.01);');
  assert.equal(audioCalls.filter(c=>c.name==='bossAttack'&&c.args[0]==='beam').length,1);
});
check('Boss enrage impact sounds once when crossing half health and never replays on later damage', () => {
  readyBoss(1,'boss.hp=.51;'); audioCalls.length=0;
  execute('applyBossHit({damageLog:boss.healthLog+Math.log(.02)});'); assert.equal(bossState().boss.enraged,true);
  assert.equal(audioCalls.filter(c=>c.name==='bossEnrage').length,0);
  execute('updateBossEncounter(bossPresentation.duration * .45);');
  assert.equal(audioCalls.filter(c=>c.name==='bossEnrage').length,1);
  execute('applyBossHit({damageLog:boss.healthLog+Math.log(.02)});'); assert.equal(audioCalls.filter(c=>c.name==='bossEnrage').length,1);
});
check('splitting Boss cores sound once on breakup and fragments do not replay that impact', () => {
  readyBoss(1); execute('addBossProjectile(800,300,-300,0,{burstAt:.5,burstCount:8});'); audioCalls.length=0;
  execute('updateBossProjectiles(.49);'); assert.equal(audioCalls.filter(c=>c.name==='bossAttack'&&c.args[0]==='burst').length,0);
  execute('updateBossProjectiles(.01);'); assert.equal(bossState().bossProjectiles.length,8);
  assert.equal(audioCalls.filter(c=>c.name==='bossAttack'&&c.args[0]==='burst').length,1);
  execute('updateBossProjectiles(.1);'); assert.equal(audioCalls.filter(c=>c.name==='bossAttack'&&c.args[0]==='burst').length,1);
});
const enemyCombat = () => JSON.parse(execute('JSON.stringify({enemies,enemyProjectiles,introduced:[...enemyIntroduced]})'));
function readyGunner(extra = '') {
  isolatedBattle('battleTime=45;spawnEnemy("gunner");enemies[0].x=enemies[0].holdX;updateEnemyMovement(enemies[0],0);'+extra);
}
function enemyShot(x = 'player.x', y = 'player.y', extra = '') {
  return `enemyProjectiles.push({x:${x},y:${y},previousX:${x},previousY:${y},vx:0,vy:0,radius:6,age:0${extra ? ','+extra : ''}});`;
}
check('first wave starts with a centered straight scout that dies to one opening bullet', () => {
  isolatedBattle('spawnEnemy();'); const opening=scene().enemies[0];
  assert.equal(opening.kind,'scout'); near(opening.y,(bounds.top+bounds.bottom)/2);
  execute('updateEnemyMovement(enemies[0],.5);'); near(scene().enemies[0].y,opening.y);
  assert.ok(scene().enemies[0].x<opening.x); execute('applyEnemyHit(enemies[0],{damage:fighterProfiles.red.damage});');
  assert.equal(scene().enemies[0].hp,0); execute('defeatEnemy(0);'); assert.equal(scene().score,100);
});
check('new enemy types unlock at fourteen and thirty seconds and are guaranteed once', () => {
  isolatedBattle('battleTime=13.999;spawnEnemy();'); assert.equal(scene().enemies.at(-1).kind,'scout');
  execute('battleTime=14;spawnEnemy();'); assert.equal(scene().enemies.at(-1).kind,'armored');
  execute('battleTime=29.999;'); assert.equal(execute('chooseEnemyKind(.99)'),'armored');
  execute('battleTime=30;spawnEnemy();'); assert.equal(scene().enemies.at(-1).kind,'gunner');
  assert.deepEqual(enemyCombat().introduced.sort(),['armored','gunner','scout']);
  execute('enemies.length=0;'); assert.equal(execute('chooseEnemyKind(.1)'),'scout');
});
check('later waves favor more gunners but never stack a third at once', () => {
  isolatedBattle('battleTime=45;spawnEnemy("scout");spawnEnemy("armored");spawnEnemy("gunner");enemies.length=0;');
  const counts={scout:0,armored:0,gunner:0};
  for(let i=0;i<1000;i++) counts[execute(`chooseEnemyKind(${(i+.5)/1000})`)]++;
  assert.deepEqual(counts,{scout:430,armored:310,gunner:260});
  execute('battleTime=120;');
  assert.equal(execute('chooseEnemyKind(.7)'),'gunner');
  execute('spawnEnemy("gunner");spawnEnemy("gunner");'); assert.equal(execute('chooseEnemyKind(.99)'),'scout');
  execute('enemies.pop();'); assert.equal(execute('chooseEnemyKind(.99)'),'gunner');
});
check('each enemy has distinct size, speed, health and score while retaining the same growth baseline', () => {
  isolatedBattle('battleTime=60;spawnEnemy("scout");spawnEnemy("armored");spawnEnemy("gunner");');
  const [scout,armored,gunner]=scene().enemies;
  near(Math.exp(armored.healthLog-scout.healthLog),2.8); near(Math.exp(gunner.healthLog-scout.healthLog),1.5);
  assert.ok(scout.speed>gunner.speed&&gunner.speed>armored.speed);
  assert.ok(scout.width<gunner.width&&gunner.width<armored.width);
  assert.deepEqual([scout.points,armored.points,gunner.points],[100,200,150]);
  const original=scene().enemies.map(e=>e.healthLog); execute('battleTime=36000;weapon.tier=500;weapon.damage=1000;');
  assert.deepEqual(scene().enemies.map(e=>e.healthLog),original);
});
check('armored and gunner lethal hits award their own points exactly once', () => {
  for(const [kind,points] of [['armored',200],['gunner',150]]) {
    isolatedBattle(`battleTime=60;spawnEnemy("${kind}");enemies[0].x=500;enemies[0].previousX=500;enemies[0].y=300;enemies[0].previousY=300;
      for(let hit=0;hit<3&&enemies.length;hit++){battleTime+=1;bullets.push({x:500,previousX:400,y:300,damageLog:enemies[0].healthLog+1});resolveProjectileHits();}`);
    assert.equal(scene().enemies.length,0); assert.equal(scene().score,points); assert.equal(health().kills,1);
    assert.equal(scene().explosions[0].points,points); execute('resolveProjectileHits();'); assert.equal(scene().score,points);
  }
});
check('contact and harmless escape never award the higher type scores or cannon energy', () => {
  for(const kind of ['scout','armored','gunner']) {
    isolatedBattle(`battleTime=60;spawnEnemy("${kind}");Object.assign(enemies[0],{x:player.x,previousX:player.x,y:player.y,previousY:player.y});updatePlayerDamage(0);`);
    assert.equal(health().lives,2); assert.equal(scene().score,0); assert.equal(health().kills,0); near(ult().energy,0);
    execute(`spawnEnemy("${kind}");Object.assign(enemies[0],{x:-500,previousX:-500,y:100,previousY:100});updatePlayerDamage(0);`);
    assert.equal(scene().enemies.length,0); assert.equal(health().lives,2); assert.equal(scene().score,0); near(ult().energy,0);
  }
});
check('one cannon pierces contemporary armored and gunner enemies even at enormous tiers without self-charging', () => {
  for(const [time,tier] of [[60,1],[3600,100],[36000,10000]]) {
    isolatedBattle(`battleTime=${time};weapon.tier=${tier};spawnEnemy("armored");spawnEnemy("gunner");enemies.forEach((enemy,index)=>Object.assign(enemy,{x:650+index*220,previousX:650+index*220,y:player.y,previousY:player.y}));`);
    primeUltimate(); castUltimate(); assert.ok(Number.isFinite(ult().shot.damageLog)); execute('updateUltimate(.5);');
    assert.equal(scene().enemies.length,0); assert.equal(scene().score,350); assert.equal(health().kills,2); near(ult().energy,0);
    execute('resolveUltimateHits();'); assert.equal(scene().score,350); assert.equal(health().kills,2);
  }
});
check('cannon catches a weaving enemy that leaves its vertical band during the same frame', () => {
  isolatedBattle();
  assert.equal(execute('ultimateHitsTarget({startX:100,previousX:500,x:580,length:360,y:300,radius:40},{previousX:544,x:536,previousY:356,y:360.5,width:82,height:47.56})'),true);
});
check('cannon crossing intervals must overlap in time and the beam cannot extend behind its start', () => {
  isolatedBattle();
  assert.equal(execute('ultimateHitsTarget({startX:100,previousX:500,x:580,length:360,y:300,radius:10},{previousX:560,x:560,previousY:300,y:500,width:20,height:20})'),false);
  assert.equal(execute('ultimateHitsTarget({startX:100,previousX:120,x:200,length:360,y:300,radius:40},{previousX:50,x:50,previousY:300,y:300,width:20,height:20})'),false);
  assert.equal(execute('ultimateHitsTarget({startX:100,previousX:120,x:200,length:360,y:300,radius:40},{previousX:95,x:95,previousY:300,y:300,width:20,height:20})'),true);
});
check('later scouts weave within the battlefield and preserve both previous coordinates', () => {
  for(const size of [{width:1280,height:720},{width:640,height:360},{width:390,height:844}]) {
    surface=size; emit(window,'resize'); begin(); execute('enemies.length=0;spawnEnemy("scout");spawnEnemy("scout");');
    const start=scene().enemies[1]; let low=start.y,high=start.y;
    for(let i=0;i<100;i++) {
      const before=scene().enemies[1]; execute('updateEnemyMovement(enemies[1],.05);'); const after=scene().enemies[1];
      near(after.previousX,before.x); near(after.previousY,before.y); assert.ok(after.x<before.x);
      assert.ok(after.y>=bounds.top&&after.y<=bounds.bottom); low=Math.min(low,after.y); high=Math.max(high,after.y);
    }
    assert.ok(high-low>start.waveAmplitude*1.9, `scout must complete its full weave at ${size.width}x${size.height}`);
  }
});
check('moving enemies cannot tunnel vertically through bullets or the player', () => {
  isolatedBattle();
  assert.equal(execute('bulletHitsEnemy({previousX:400,x:500,y:300},{previousX:450,x:450,previousY:200,y:400,width:40,height:30})'),true);
  assert.equal(execute('bulletHitsEnemy({previousX:400,x:500,y:550},{previousX:450,x:450,previousY:200,y:400,width:40,height:30})'),false);
  assert.equal(execute('enemyTouchesPlayer({previousX:player.x,x:player.x,previousY:player.y-200,y:player.y+200,width:60,height:40})'),true);
  assert.equal(execute('enemyTouchesPlayer({previousX:player.x+300,x:player.x+300,previousY:player.y-200,y:player.y+200,width:60,height:40})'),false);
});
check('a gunner enters from the right and waits at its station before the warning', () => {
  isolatedBattle('battleTime=45;spawnEnemy("gunner");'); const before=scene().enemies[0];
  assert.equal(before.gunPhase,'entry'); assert.ok(before.x>surface.width);
  execute('updateEnemyMovement(enemies[0],.1);'); assert.equal(scene().enemies[0].gunPhase,'entry');
  assert.equal(enemyCombat().enemyProjectiles.length,0);
  execute('updateEnemyMovement(enemies[0],20);'); const arrived=scene().enemies[0];
  assert.equal(arrived.gunPhase,'warning'); near(arrived.x,arrived.holdX); near(arrived.gunTime,0);
  assert.ok(arrived.x>surface.width*.7&&arrived.x<surface.width*.9); assert.equal(enemyCombat().enemyProjectiles.length,0);
});
check('gunner warning lasts nine tenths of a second and locks a position the player can dodge', () => {
  readyGunner(); const aimed=scene().enemies[0]; near(aimed.aimX,position().x); near(aimed.aimY,position().y);
  execute('player.y+=120;updateEnemyMovement(enemies[0],.899);'); assert.equal(enemyCombat().enemyProjectiles.length,0);
  assert.equal(scene().enemies[0].aimY,aimed.aimY); execute('updateEnemyMovement(enemies[0],.001);');
  const fired=enemyCombat(); assert.equal(fired.enemyProjectiles.length,1); assert.equal(fired.enemies[0].gunShots,1);
  const projectile=fired.enemyProjectiles[0]; const dx=aimed.aimX-projectile.x,dy=aimed.aimY-projectile.y;
  near(dx*projectile.vy-dy*projectile.vx,0,1e-7); assert.ok(projectile.vx<0); assert.equal(fired.enemies[0].gunPhase,'recover');
});
check('gunner fires exactly twice with a fresh warning then retreats instead of camping indefinitely', () => {
  readyGunner(); execute('updateEnemyMovement(enemies[0],.9);player.y+=80;updateEnemyMovement(enemies[0],.65);');
  assert.equal(scene().enemies[0].gunPhase,'warning'); near(scene().enemies[0].aimY,position().y);
  execute('updateEnemyMovement(enemies[0],.899);'); assert.equal(enemyCombat().enemyProjectiles.length,1);
  execute('updateEnemyMovement(enemies[0],.001);updateEnemyMovement(enemies[0],.65);');
  assert.equal(enemyCombat().enemyProjectiles.length,2); assert.equal(scene().enemies[0].gunShots,2);
  assert.equal(scene().enemies[0].gunPhase,'retreat'); const before=scene().enemies[0].x;
  execute('updateEnemyMovement(enemies[0],.5);'); assert.ok(scene().enemies[0].x<before);
  assert.equal(enemyCombat().enemyProjectiles.length,2);
});
check('a late gunner marks the split before firing and locks its center shot', () => {
  readyGunner('battleTime=130;');
  execute('updateEnemyMovement(enemies[0],.9);updateEnemyMovement(enemies[0],.57);');
  const warned=scene().enemies[0];
  assert.equal(warned.gunPhase,'warning');
  assert.ok(warned.gunSpread>0);
  assert.equal(enemyCombat().enemyProjectiles.length,1);
  execute('player.y+=100;updateEnemyMovement(enemies[0],.9);');
  const volley=enemyCombat().enemyProjectiles.slice(-3);
  assert.equal(volley.length,3);
  const center=Math.atan2(volley[0].vy,volley[0].vx);
  near(center,Math.atan2(warned.aimY-volley[0].y,warned.aimX-volley[0].x));
  const angle=(shot)=>Math.atan2(Math.sin(Math.atan2(shot.vy,shot.vx)-center),Math.cos(Math.atan2(shot.vy,shot.vx)-center));
  near(angle(volley[1]),-warned.gunSpread);
  near(angle(volley[2]),warned.gunSpread);
});
check('a gunner does not begin a surprise shot when the player is too close or behind it', () => {
  for(const placement of ['player.x=enemies[0].holdX-enemies[0].width/2-70;player.y=enemies[0].y;', 'player.x=enemies[0].holdX+20;player.y=enemies[0].y;']) {
    isolatedBattle('battleTime=45;spawnEnemy("gunner");enemies[0].x=enemies[0].holdX;'+placement+'updateEnemyMovement(enemies[0],0);');
    assert.equal(scene().enemies[0].gunPhase,'retreat'); execute('updateEnemyMovement(enemies[0],3);');
    assert.equal(enemyCombat().enemyProjectiles.length,0);
  }
});
check('destroying a telegraphing gunner cancels its un-fired attack', () => {
  readyGunner(); execute('updateEnemyMovement(enemies[0],.89);defeatEnemy(0);updateEncounter(1);');
  assert.equal(scene().enemies.length,0); assert.equal(enemyCombat().enemyProjectiles.length,0); assert.equal(scene().score,150);
});
check('fired shells keep their velocity after the player moves and after the shooter dies', () => {
  readyGunner(); execute('updateEnemyMovement(enemies[0],.9);'); const before=enemyCombat().enemyProjectiles[0];
  execute('player.x+=100;player.y+=150;defeatEnemy(0);updateEnemyProjectiles(.1);'); const after=enemyCombat().enemyProjectiles[0];
  near(after.vx,before.vx); near(after.vy,before.vy); near(after.x,before.x+before.vx*.1); near(after.y,before.y+before.vy*.1);
  near(after.previousX,before.x); near(after.previousY,before.y); assert.equal(scene().enemies.length,0);
});
check('ordinary projectiles are capped, expire after eight seconds and clean up outside every edge', () => {
  readyGunner(); execute('for(let i=0;i<50;i++)fireEnemyGun(enemies[0]);'); assert.equal(enemyCombat().enemyProjectiles.length,20);
  execute('enemyProjectiles.length=0;'+enemyShot('600','300')); execute('updateEnemyProjectiles(7.999);'); assert.equal(enemyCombat().enemyProjectiles.length,1);
  execute('updateEnemyProjectiles(.001);'); assert.equal(enemyCombat().enemyProjectiles.length,0);
  for(const [x,y] of [[-41,300],[1321,300],[600,-41],[600,761]]) {
    execute(enemyShot(x,y)+'updateEnemyProjectiles(0);'); assert.equal(enemyCombat().enemyProjectiles.length,0);
  }
});
check('ordinary projectile collision sweeps both shot and player movement without penalizing near misses', () => {
  isolatedBattle(); execute(enemyShot('player.x+300','player.y','previousX:player.x-300')+'updateEnemyProjectileDamage();');
  assert.equal(health().lives,2); assert.equal(enemyCombat().enemyProjectiles.length,0);
  isolatedBattle('player.previousY=player.y-150;'+enemyShot('player.x','player.y-75')+'updateEnemyProjectileDamage();');
  assert.equal(health().lives,2);
  isolatedBattle(enemyShot('player.x','player.y+100')+'updateEnemyProjectileDamage();'); assert.equal(health().lives,3);
  assert.equal(enemyCombat().enemyProjectiles.length,1);
});
check('ordinary shells, contact and Boss shots share one grace interval instead of stacking damage', () => {
  isolatedBattle(enemyShot().repeat(4)+'updateEnemyProjectileDamage();'); assert.equal(health().lives,2);
  assert.equal(enemyCombat().enemyProjectiles.length,0); collide(); assert.equal(health().lives,2);
  execute(enemyShot()+'updateEnemyProjectileDamage();'); assert.equal(health().lives,2);
  execute('updateBossEncounter(1.11);'+enemyShot()+'updateEnemyProjectileDamage();'); assert.equal(health().lives,1);
  readyBoss(); execute(enemyShot()+'updateEnemyProjectileDamage();'+bossProjectile()+'updateBossDamage();');
  assert.equal(health().lives,2); assert.equal(bossState().bossProjectiles.length,0);
});
check('shield consumes incoming ordinary shells and grants no hidden protection after expiry', () => {
  isolatedBattle(); primeShield(); execute('requestShield();'+enemyShot().repeat(3)+'updateEnemyProjectileDamage();');
  assert.equal(health().lives,3); assert.equal(enemyCombat().enemyProjectiles.length,0); near(bossState().bossHitGrace,0);
  execute('updateShield(2);'+enemyShot()+'updateEnemyProjectileDamage();'); assert.equal(health().lives,2);
  assert.equal(scene().score,0); assert.equal(health().kills,0); near(ult().energy,0);
});
check('ordinary warnings and projectiles freeze through blur, hidden tabs and control focus', () => {
  for(const route of ['window','hidden','control']) {
    readyGunner(enemyShot('600','200','vx:-300')); execute('updateEncounter(.3);updateEncounter(0);');
    if(route==='window') emit(window,'blur');
    if(route==='hidden') {document.hidden=true;emit(document,'visibilitychange');}
    if(route==='control') nodes.get('#sound-button').focus();
    const before=enemyCombat(); frames(100); execute('updateEncounter(100);updateEnemyProjectiles(100);updateEnemyProjectileDamage();');
    assert.deepEqual(enemyCombat(),before);
    if(route==='window') emit(window,'focus');
    if(route==='hidden') {document.hidden=false;emit(document,'visibilitychange');}
    if(route==='control') emit(canvas,'pointerdown');
    step(); assert.deepEqual(enemyCombat(),before); step(); assert.ok(enemyCombat().enemies[0].gunTime>before.enemies[0].gunTime);
  }
});
check('resize clears unsafe ordinary shells while preserving unlocked type history', () => {
  readyGunner(enemyShot('600','200')); execute('spawnEnemy("armored");');
  execute('var retainedResizeEnemies=enemies.slice();');
  const introduced=enemyCombat().introduced.sort(); surface={width:640,height:360}; emit(window,'resize');
  assert.equal(enemyCombat().enemyProjectiles.length,0); assert.equal(scene().enemies.length,2);
  assert.equal(execute('enemies.every((enemy,index)=>enemy===retainedResizeEnemies[index])'),true);
  assert.deepEqual(enemyCombat().introduced.sort(),introduced); assert.equal(execute('chooseEnemyKind(.1)'),'scout');
});
check('canceling ordinary combat clears shells and unfinished warnings without secretly firing or scoring', () => {
  readyGunner(enemyShot('600','200')); const introduced=enemyCombat().introduced;
  execute('updateEnemyMovement(enemies[0],.899);resetEnemyCombat(false);updateEnemyMovement(enemies[0],1);');
  assert.equal(enemyCombat().enemyProjectiles.length,0); assert.equal(scene().enemies[0].gunPhase,'retreat');
  assert.deepEqual(enemyCombat().introduced,introduced); assert.equal(scene().score,0); assert.equal(health().kills,0); near(ult().energy,0);
});
check('Boss warning, entry and defeat clear all ordinary bullets and retain enemy introductions', () => {
  isolatedBattle('spawnEnemy("armored");'+enemyShot('600','200')+'resetBossEncounter();battleTime=85;updateBossEncounter(0);');
  assert.equal(enemyCombat().enemyProjectiles.length,0); assert.ok(enemyCombat().introduced.includes('armored'));
  execute(enemyShot('600','200')+'spawnBoss(0);'); assert.equal(enemyCombat().enemyProjectiles.length,0);
  execute(enemyShot('600','200')+'boss.phase="recover";defeatBoss();'); assert.equal(enemyCombat().enemyProjectiles.length,0);
  assert.ok(enemyCombat().introduced.includes('armored'));
});
check('death, menu and restarting discard ordinary shells and reset type introductions for a fresh round', () => {
  readyGunner(enemyShot('600','200')); execute('endGame();'); assert.equal(enemyCombat().enemyProjectiles.length,0);
  emit(nodes.get('#restart-button'),'click'); assert.equal(enemyCombat().enemyProjectiles.length,0); assert.deepEqual(enemyCombat().introduced,[]);
  execute('spawnEnemy("gunner");'+enemyShot('600','200')); leaveBattle();
  assert.equal(enemyCombat().enemyProjectiles.length,0); assert.deepEqual(enemyCombat().introduced,[]);
  begin(); execute('spawnEnemy();'); assert.equal(scene().enemies[0].kind,'scout'); near(scene().enemies[0].healthLog,Math.log(1.14));
});
check('gunner audio cues occur on the shot rather than the warning or after destruction', () => {
  readyGunner(); audioCalls.length=0; execute('updateEnemyMovement(enemies[0],.899);');
  assert.equal(audioCalls.filter(c=>c.name==='bossAttack').length,0); execute('updateEnemyMovement(enemies[0],.001);');
  assert.equal(audioCalls.filter(c=>c.name==='bossAttack'&&c.args[0]==='volley').length,1);
  execute('defeatEnemy(0);updateEncounter(3);'); assert.equal(audioCalls.filter(c=>c.name==='bossAttack').length,1);
});
check('enemy hulls and telegraphs draw finite geometry, balanced canvas state and no extra labels', () => {
  for(const reduced of [false,true]) {
    readyGunner('spawnEnemy("scout");spawnEnemy("armored");'+enemyShot('600','200','vx:-300,vy:80'));
    execute(`reducedMotion.matches=${reduced};`); const before=enemyCombat();
    captureDraws=true; drawOperations.length=0; execute('drawEnemies();drawEnemyThreats();'); captureDraws=false;
    assert.deepEqual(enemyCombat(),before);
    assert.equal(drawOperations.filter(d=>d.name==='save').length,drawOperations.filter(d=>d.name==='restore').length);
    assert.ok(drawOperations.flatMap(d=>d.args).filter(v=>typeof v==='number').every(Number.isFinite));
    assert.equal(drawOperations.filter(d=>d.name==='fillText').length,0);
    assert.ok(drawOperations.some(d=>d.name==='setLineDash'&&d.args[0].length>0));
  }
  execute('reducedMotion.matches=false;');
});
const evolutionState=()=>JSON.parse(execute('JSON.stringify(evolution)'));
function evolutionKey(code, extra={}) { return emit(document,'keydown',{code,...extra}); }
check('a new round has no evolutions and only one pending reward can be collected once', () => {
  isolatedBattle(); assert.deepEqual(evolutionState(),{pierce:0,blast:0,aegis:0,pending:false,choice:'',pulses:[],
    links:{falcon:false,phalanx:false,lance:false},overclock:0,refits:0});
  assert.equal(execute('chooseEvolution("pierce")'),false);
  assert.equal(execute('openEvolutionChoice()'),true); assert.equal(execute('openEvolutionChoice()'),false);
  assert.equal(nodes.get('#evolution-screen').hidden,false); assert.equal(execute('chooseEvolution("unknown")'),false);
  assert.equal(execute('chooseEvolution("pierce")'),true); assert.equal(execute('chooseEvolution("pierce")'),false);
  assert.equal(evolutionState().pierce,1); assert.equal(evolutionState().pending,false);
  assert.equal(nodes.get('#evolution-screen').hidden,true); assert.equal(document.activeElement,canvas);
  leaveBattle(); assert.equal(execute('openEvolutionChoice()'),false);
});
check('reward choice freezes combat and sound, clears hazards and refunds an unfinished cannon exactly once', () => {
  isolatedBattle('shield.energy=13;shield.charges=1;requestShield();ultimate.charges=2;requestUltimate();updateUltimate(.2);');
  assert.equal(ult().charges,1);
  execute('enemyProjectiles.push({x:300,y:300});bossProjectiles.push({x:400,y:300});bossHazards.push({kind:"beam"});openEvolutionChoice();');
  assert.equal(ult().charges,2); assert.equal(ult().phase,'idle'); assert.equal(shots().length,0);
  assert.equal(enemyCombat().enemyProjectiles.length,0); assert.equal(bossState().bossProjectiles.length,0); assert.equal(bossState().bossHazards.length,0);
  const frozen={time:scene().battleTime,shield:protection(),weapon:weaponState(),ultimate:ult(),position:position()};
  frames(200); key('Space'); key('KeyV'); key('ArrowDown'); frames(20);
  assert.deepEqual({time:scene().battleTime,shield:protection(),weapon:weaponState(),ultimate:ult(),position:position()},frozen);
  assert.equal(audioCalls.filter(c=>c.name==='sync').at(-1).args[0],false);
  execute('chooseEvolution("aegis");'); step(); step(); assert.ok(scene().battleTime>frozen.time);
  assert.equal(ult().charges,2); assert.equal(protection().charges,1);
});
check('three evolution routes stack independently up to three while maxed cards cannot waste a reward', () => {
  isolatedBattle();
  for(const kind of ['pierce','blast','aegis']) {
    for(let level=1;level<=3;level++) {
      assert.equal(execute('openEvolutionChoice()'),true); assert.equal(execute(`chooseEvolution("${kind}")`),true);
      assert.equal(evolutionState()[kind],level);
    }
    if(kind!=='aegis') {
      execute('openEvolutionChoice();'); assert.equal(nodes.get('#evolution-card-'+kind).disabled,true);
      assert.equal(execute(`chooseEvolution("${kind}")`),false); assert.equal(evolutionState().pending,true);
      execute('evolution.pending=false;resetEvolution();');
      execute(kind==='pierce'?'evolution.pierce=3;':'evolution.pierce=3;evolution.blast=3;');
    }
  }
  assert.equal(evolutionState().pierce,3); assert.equal(evolutionState().blast,3); assert.equal(evolutionState().aegis,3);
  assert.ok(nodes.get('#evolution-readout').textContent.includes('3级'));
});
check('fully evolved ships activate each link once, then gain repeatable refits with capped supplies', () => {
  isolatedBattle('evolution.pierce=evolution.blast=evolution.aegis=3;shield.charges=2;player.lives=3;openEvolutionChoice();');
  assert.deepEqual(evolutionCards.map(card=>card.dataset.choice),['falcon','phalanx','lance']);
  for(const kind of ['falcon','phalanx','lance']) {
    assert.equal(execute(`chooseEvolution("${kind}")`),true);
    assert.equal(evolutionState().links[kind],true);
    execute('openEvolutionChoice();');
    assert.equal(execute(`chooseEvolution("${kind}")`),false);
  }
  assert.deepEqual(evolutionCards.map(card=>card.dataset.choice),['refit-fire','refit-heal','refit-shield']);
  assert.deepEqual(evolutionCards.map(card=>card.disabled),[false,true,true]);
  assert.equal(execute('chooseEvolution("refit-heal")'),false); assert.equal(execute('chooseEvolution("refit-shield")'),false);
  const damage=weaponState().damage; assert.equal(execute('chooseEvolution("refit-fire")'),true); assert.equal(weaponState().damage,damage);
  near(Math.exp(evolutionState().overclock),1.08);
  execute('player.lives=7;player.maxLives=8;openEvolutionChoice();');
  assert.equal(execute('chooseEvolution("refit-heal")'),true);
  assert.equal(health().lives,8); assert.equal(execute('player.maxLives'),8);
  captureDraws=true; drawOperations.length=0;
  execute('player.lives=9999;player.maxLives=10000;previewRefit(context,"refit-heal",true);');
  captureDraws=false;
  assert.ok(drawOperations.some(operation=>operation.name==='fillText' && operation.args[0]==='♥ 10000 / 10000'));
  assert.equal(drawOperations.filter(operation=>operation.name==='fillText').length,2);
  execute('shield.charges=1;shield.energy=15;openEvolutionChoice();chooseEvolution("refit-shield");');
  assert.equal(protection().charges,2); assert.equal(protection().energy,0);
  near(Math.exp(evolutionState().overclock),1.08*1.04**2);
  assert.equal(evolutionState().refits,3);
});
check('number shortcuts, pointer clicks and focus trapping cannot double-pick or bypass the evolution dialog', () => {
  isolatedBattle('openEvolutionChoice();'); assert.equal(canvas.inert,true); assert.equal(document.activeElement,evolutionCards[0]);
  assert.equal(evolutionKey('Escape').prevented,true); assert.equal(evolutionState().pending,true);
  evolutionKey('Digit2',{ctrlKey:true}); evolutionKey('Digit2',{repeat:true}); assert.equal(evolutionState().blast,0);
  evolutionKey('Tab'); assert.equal(document.activeElement,evolutionCards[1]);
  evolutionKey('Tab',{shiftKey:true}); assert.equal(document.activeElement,evolutionCards[0]);
  evolutionKey('Tab',{shiftKey:true}); assert.equal(document.activeElement,evolutionCards[2]);
  emit(document,'focusin',{target:canvas}); assert.equal(document.activeElement,evolutionCards[2]);
  assert.equal(evolutionKey('Digit2').prevented,true); assert.equal(evolutionState().blast,1); assert.equal(canvas.inert,false);
  evolutionKey('Digit2'); assert.equal(evolutionState().blast,1);
  execute('openEvolutionChoice();'); emit(evolutionCards[0],'click'); emit(evolutionCards[0],'click'); assert.equal(evolutionState().pierce,1);
});
check('resize preserves pending choice and its focus while restart or menu clears every route and restores background controls', () => {
  isolatedBattle('evolution.pierce=2;evolution.aegis=1;openEvolutionChoice();'); evolutionCards[1].focus();
  surface={width:640,height:360}; emit(window,'resize'); assert.equal(evolutionState().pending,true);
  assert.equal(evolutionState().pierce,2); assert.equal(document.activeElement,evolutionCards[1]); assert.equal(canvas.inert,true);
  emit(document,'fullscreenchange'); assert.equal(document.activeElement,evolutionCards[1]); assert.equal(evolutionState().pending,true);
  execute('chooseEvolution("blast");endGame();'); emit(nodes.get('#restart-button'),'click'); step();
  assert.equal(evolutionState().pierce,0); assert.equal(evolutionState().blast,0); assert.equal(evolutionState().aegis,0);
  assert.equal(canvas.inert,false); assert.equal(nodes.get('#evolution-screen').hidden,true);
  execute('openEvolutionChoice(); showScreen("menu");'); assert.equal(evolutionState().pending,false);
  assert.equal(canvas.inert,false);
});
check('piercing upgrades hit exactly one plus their level distinct enemies with no damage loss or repeat hits', () => {
  for(let level=0;level<=3;level++) {
    isolatedBattle(`evolution.pierce=${level};player.y=300;resetWeapons();updateShooting(0);`);
    for(let i=0;i<5;i++) execute(target(400+i*90,300,40,10));
    execute('bullets[0].previousX=300;bullets[0].x=900;resolveProjectileHits();');
    const hp=scene().enemies.map(enemy=>enemy.hp);
    assert.deepEqual(hp,Array.from({length:5},(_,i)=>i<=level?10-[1,1.25,1.45,1.65][level]:10));
    execute('resolveProjectileHits();'); assert.deepEqual(scene().enemies.map(enemy=>enemy.hp),hp);
  }
});
check('piercing bullets remember earlier-frame hull hits but can still damage the next enemy', () => {
  isolatedBattle('evolution.pierce=2;player.y=300;resetWeapons();updateShooting(0);'+target(400,300,60,10)+target(600,300,60,10));
  execute('bullets[0].previousX=350;bullets[0].x=405;resolveProjectileHits();resolveProjectileHits();');
  assert.deepEqual(scene().enemies.map(enemy=>enemy.hp),[8.55,10]); assert.equal(shots().length,1);
  execute('bullets[0].previousX=405;bullets[0].x=605;resolveProjectileHits();');
  assert.deepEqual(scene().enemies.map(enemy=>enemy.hp),[8.55,8.55]);
});
check('energy orbs still consume a penetrating bullet and an old bullet keeps its original penetration capacity', () => {
  isolatedBattle('evolution.pierce=3;player.y=300;resetWeapons();updateShooting(0);'+orb('yellow',400,300)+target(600,300,40,10));
  execute('bullets[0].previousX=300;bullets[0].x=800;resolveProjectileHits();');
  assert.equal(weaponState().lanes,2); assert.equal(scene().enemies[0].hp,10); assert.equal(shots().length,0);
  isolatedBattle('player.y=300;resetWeapons();updateShooting(0);evolution.pierce=3;'+target(400,300,40,10)+target(600,300,40,10));
  execute('bullets[0].previousX=300;bullets[0].x=800;resolveProjectileHits();'); assert.deepEqual(scene().enemies.map(enemy=>enemy.hp),[9,10]);
});
function droneAttackScene(level=1, extra='') {
  isolatedBattle(`evolution.blast=${level};player.x=200;player.y=360;globalThis.supportY=getEvolutionDronePositions()[0].muzzleY;`+extra);
}
function fireFirstDroneRound() { execute('updateEvolutionWeapons(.1);updateEvolutionWeapons(.05);'); }
check('Falcon ranks field one drone, two drones and a real coordinated volley every third firing cycle', () => {
  for(let rank=1;rank<=3;rank++) {
    droneAttackScene(rank); fireFirstDroneRound();
    const oneCycle=rank===1?1:2;
    assert.equal(execute('evolutionWeapons.drones.length'),oneCycle);
    assert.equal(execute('bullets.filter(b=>b.source==="evolution-drone").length'),oneCycle);
    execute('for(let i=0;i<20;i++)updateEvolutionWeapons(.1);');
    assert.equal(execute('bullets.filter(b=>b.source==="evolution-drone").length'),rank===3?10:oneCycle*3);
    assert.equal(execute('bullets.every(b=>b.auxiliary&&b.hitTargets.size===0)'),true);
  }
});
check('a real unlinked Falcon round stops at the first enemy and does not explode into its neighbors', () => {
  droneAttackScene(1,target(400,'supportY',40,1)+target(475,'supportY',40,1)+target(490,'supportY+25',40,1));
  fireFirstDroneRound();
  execute('updateShooting(.6);resolveProjectileHits();resolveProjectileHits();');
  assert.equal(scene().score,100); assert.equal(health().kills,1);
  assert.deepEqual(scene().enemies.map(enemy=>[enemy.x,enemy.hp]),[[475,1],[490,1]]);
  near(ult().energy,12); assert.equal(shots().length,0);
});
check('ultimate kills remain isolated from Falcon firing and do not charge another cannon', () => {
  isolatedBattle('evolution.blast=3;'+target(400,300,40,1)+target(450,300,40,10));
  execute('applyEnemyHit(enemies[0],{damage:1,source:"ultimate"});defeatEnemy(0,{damage:1,source:"ultimate"});');
  assert.equal(scene().enemies[0].hp,10); assert.equal(shots().length,0); near(ult().energy,0);
  assert.equal(evolutionState().pulses.length,0);
});
check('piercing main rounds still hit the correct next surviving target after removing a kill', () => {
  isolatedBattle('evolution.pierce=3;evolution.blast=1;player.y=300;resetWeapons();updateShooting(0);'+target(400,300,40,1)+target(475,300,40,1)+target(650,300,40,10)+target(800,300,40,10));
  execute('bullets[0].previousX=300;bullets[0].x=900;resolveProjectileHits();');
  assert.equal(scene().score,200); assert.deepEqual(scene().enemies.map(enemy=>enemy.hp),[8.35,8.35]);
});
check('aegis clears both projectile families inside each radius but preserves outside rounds and area hazards', () => {
  for(let level=1;level<=3;level++) {
    const radius=130+level*50;
    readyBoss(0,`evolution.aegis=${level};bossProjectiles.push({x:player.x+${radius},y:player.y},{x:player.x+${radius+.1},y:player.y});enemyProjectiles.push({x:player.x,y:player.y-${radius}},{x:player.x,y:player.y-${radius+.1}});addBossHazard("beam",{y:player.y,warning:1,duration:2});shield.charges=2;requestShield();`);
    assert.equal(bossState().bossProjectiles.length,1); assert.equal(enemyCombat().enemyProjectiles.length,1); assert.equal(bossState().bossHazards.length,1);
    assert.equal(protection().charges,1); assert.equal(evolutionState().pulses.length,2);
    execute('bossProjectiles.push({x:player.x,y:player.y});requestShield();'); assert.equal(bossState().bossProjectiles.length,2);
    assert.equal(protection().charges,1); assert.equal(evolutionState().pulses.length,2);
  }
});
check('evolution effects stay bounded, pause and expire while combined ship modifications draw finite symmetric geometry', () => {
  isolatedBattle('evolution.pierce=evolution.blast=evolution.aegis=3;for(let i=0;i<30;i++) addEvolutionPulse(player.x,player.y,150,"#ff914f",.4);');
  assert.equal(evolutionState().pulses.length,16); emit(window,'blur'); frames(100); assert.equal(evolutionState().pulses[0].age,0);
  emit(window,'focus'); step(); execute('updateEvolution(.4);'); assert.equal(evolutionState().pulses.length,0);
  captureDraws=true; drawOperations.length=0; execute('drawEvolvedPlayer(context,player,evolution,reducedMotion.matches,battleTime);drawEvolution();'); captureDraws=false;
  assert.equal(drawOperations.filter(op=>op.name==='save').length,drawOperations.filter(op=>op.name==='restore').length);
  assert.ok(drawOperations.some(op=>op.name==='scale'&&op.args[1]===-1)); assert.ok(drawOperations.some(op=>op.name==='scale'&&op.args[1]===1));
  assert.ok(drawOperations.every(op=>op.args.every(value=>typeof value!=='number'||Number.isFinite(value))));
});

const momentumState=()=>JSON.parse(execute('JSON.stringify(momentum)'));
function comboKills(count) { execute(`for(let i=0;i<${count};i++) registerMomentumKill();`); }
check('combo counts real kills once but not a miss, an orb, enemy escape or contact removal', () => {
  isolatedBattle(target(400,300,40,1)+shot(380,300)); execute('resolveProjectileHits();resolveProjectileHits();');
  assert.equal(momentumState().count,1); assert.equal(momentumState().best,1);
  execute(orb('blue',400,300)+shot(380,300)+'resolveProjectileHits();'); assert.equal(momentumState().count,1);
  execute(target(-100,300,40,1)+'updatePlayerDamage(0);'); assert.equal(momentumState().count,1);
  execute(target(position().x,position().y,40,1)+'updatePlayerDamage(0);'); assert.equal(momentumState().count,1);
  execute('defeatEnemy(-1);'); assert.equal(momentumState().count,1);
});
check('Falcon and ultimate kills contribute separately and each Boss hull counts only once', () => {
  droneAttackScene(1,target(400,'supportY',40,1));
  fireFirstDroneRound();
  execute('updateShooting(.5);resolveProjectileHits();resolveProjectileHits();');
  assert.equal(momentumState().count,1); assert.equal(scene().score,100);
  isolatedBattle(target(400,300,40,1)); execute('defeatEnemy(0,{source:"ultimate",damage:1});'); assert.equal(momentumState().count,1);
  readyBoss(10,'globalThis.comboDead=boss;defeatBoss();defeatBoss(globalThis.comboDead);'); assert.equal(momentumState().count,1);
  finishBossPresentation();
  assert.equal(health().state,'over'); assert.equal(execute('evolution.pending'),false);
  assert.equal(nodes.get('#game-over-screen').dataset.victory,'true');
  assert.equal(nodes.get('#game-over-title').textContent,'异形战役通关');
  assert.equal(scene().score,6000);
});
check('combo decay has a four-second grace then loses one per .65 seconds and a new kill resets that grace', () => {
  isolatedBattle(); comboKills(3); execute('updateMomentum(4.649);'); assert.equal(momentumState().count,3);
  execute('updateMomentum(.001);'); assert.equal(momentumState().count,2); assert.equal(momentumState().best,3);
  execute('updateMomentum(.64);registerMomentumKill();updateMomentum(4.649);'); assert.equal(momentumState().count,3);
  execute('updateMomentum(.001);'); assert.equal(momentumState().count,2);
  execute('updateMomentum(20);'); assert.equal(momentumState().count,0); assert.equal(momentumState().best,3);
  assert.equal(momentumState().idle,0); assert.equal(momentumState().decay,0);
});
check('combo decay is frame-rate independent and cannot run with zero, negative or non-finite time', () => {
  const results=[];
  for(const fps of [20,60,144]) {
    isolatedBattle(); comboKills(10); execute(`for(let i=0;i<${fps*6};i++) updateMomentum(1/${fps});`);
    results.push(momentumState().count);
  }
  assert.deepEqual(results,[7,7,7]); const before=momentumState();
  execute('for(const time of [0,-1,NaN,Infinity]) updateMomentum(time);'); assert.deepEqual(momentumState(),before);
});
check('Boss warning and both ordinary and fusion Boss combat freeze combo decay without granting permanent rage', () => {
  for(const kind of ['warning','ordinary','fusion']) {
    isolatedBattle(); comboKills(20); execute('momentum.idle=3.8;momentum.decay=.2;');
    if(kind==='warning') execute('nextBossTime=90;battleTime=85;');
    else execute(`spawnBoss(${kind === 'ordinary' ? 0 : 10});updateBossEncounter(bossPresentation.duration);`);
    execute('updateMomentum(8);'); assert.equal(momentumState().count,20); near(momentumState().idle,3.8); near(momentumState().decay,.2);
    assert.equal(momentumState().remaining,0); assert.equal(nodes.get('#momentum-hud').dataset.frozen,'true');
    execute('resetBossEncounter();nextBossTime=Infinity;updateMomentum(.65);'); assert.equal(momentumState().count,19);
  }
});
check('every ten new combo levels queues a cycling reward without rewarding oscillation around a milestone', () => {
  isolatedBattle(); comboKills(30); assert.deepEqual(momentumState().rewardQueue,['blue','yellow','red']);
  execute('momentum.rewardQueue.length=0;momentum.count=29;registerMomentumKill();'); assert.deepEqual(momentumState().rewardQueue,[]);
  comboKills(10); assert.deepEqual(momentumState().rewardQueue,['blue']);
  execute('momentum.rewardQueue.length=0;momentum.remaining=0;updateMomentum(100);'); assert.equal(momentumState().count,0);
  comboKills(10); assert.deepEqual(momentumState().rewardQueue,['blue']);
});
check('reward queue stays bounded and full orb screens defer rewards without applying upgrades', () => {
  isolatedBattle(); comboKills(100); assert.equal(momentumState().rewardQueue.length,3);
  const before=weaponState(); execute('for(let i=0;i<powerupRules.maxOnScreen;i++) spawnPowerup();updateMomentum(.1);');
  assert.equal(momentumState().rewardQueue.length,3); assert.equal(orbScene().powerups.length,7); assert.deepEqual(weaponState(),before);
  execute('powerups.pop();updateMomentum(.1);'); assert.equal(orbScene().powerups.length,7); assert.equal(momentumState().rewardQueue.length,2);
  assert.equal(orbScene().powerups.at(-1).type,'blue'); assert.ok(orbScene().powerups.at(-1).x>surface.width);
  execute('powerups.length=0;updateMomentum(.799);'); assert.equal(orbScene().powerups.length,0);
  execute('updateMomentum(.001001);'); assert.equal(orbScene().powerups.length,1); assert.equal(orbScene().powerups[0].type,'yellow');
  assert.deepEqual(weaponState(),before);
});
check('twenty kills trigger one eight-second rage, extensions stop at fourteen seconds and need new kills to retrigger', () => {
  isolatedBattle(); const sounds=audioCalls.filter(c=>c.name==='overdrive').length;
  comboKills(19); assert.equal(execute('isOverdriveActive()'),false); comboKills(1);
  near(momentumState().remaining,8); assert.equal(momentumState().elapsed,0); assert.equal(execute('shotRateMultiplier()'),1.6);
  assert.equal(audioCalls.filter(c=>c.name==='overdrive').length,sounds+1);
  execute('updateMomentum(1);registerMomentumKill();'); near(momentumState().remaining,7.35); near(momentumState().elapsed,1);
  comboKills(100); near(momentumState().elapsed+momentumState().remaining,14);
  execute('updateMomentum(13);'); assert.equal(execute('isOverdriveActive()'),false); assert.equal(execute('shotRateMultiplier()'),1);
  const threshold=momentumState().nextRageAt; execute('momentum.count=momentum.nextRageAt-2;'); comboKills(1);
  assert.equal(execute('isOverdriveActive()'),false); comboKills(1); assert.equal(momentumState().rageStartCount,threshold);
  near(momentumState().remaining,8); assert.equal(audioCalls.filter(c=>c.name==='overdrive').length,sounds+2);
});
check('blur, hidden tab, control focus and evolution choice freeze all momentum timers and rewards', () => {
  for(const pause of ['window','hidden','control','evolution']) {
    isolatedBattle(); comboKills(20); execute('momentum.idle=2;momentum.rewardCooldown=.5;');
    if(pause==='window') emit(window,'blur');
    if(pause==='hidden') { document.hidden=true; emit(document,'visibilitychange'); }
    if(pause==='control') nodes.get('#menu-button').focus();
    if(pause==='evolution') execute('openEvolutionChoice();');
    const before=momentumState(); execute('updateMomentum(100);registerMomentumKill();'); frames(30); assert.deepEqual(momentumState(),before);
    if(pause==='hidden') {document.hidden=false;emit(document,'visibilitychange');}
  }
});
check('resize preserves combo and rage, while death keeps best for results and a new game fully resets them', () => {
  isolatedBattle(); comboKills(25); execute('updateMomentum(1);'); const before=momentumState();
  surface={width:640,height:360}; emit(window,'resize'); assert.deepEqual(momentumState(),before);
  execute('endGame();'); assert.equal(momentumState().best,25); assert.equal(nodes.get('#final-combo').textContent,'25');
  assert.equal(momentumState().remaining,0); assert.equal(momentumState().rewardQueue.length,0);
  emit(nodes.get('#restart-button'),'click'); step(); assert.equal(momentumState().count,0); assert.equal(momentumState().best,0);
  assert.equal(momentumState().nextRageAt,20); assert.equal(nodes.get('#final-combo').textContent,'0');
});
check('spread and focus preserve full volley damage, log damage and tier color for one through four lanes', () => {
  for(const lanes of [1,2,3,4]) for(const tier of [1,3,6]) {
    isolatedBattle(`weapon.lanes=${lanes};weapon.tier=${tier};weapon.damage=3;resetWeapons();updateShooting(0);`);
    const spread=emitted(); const total=spread.reduce((sum,b)=>sum+b.damage,0); const original=weaponState();
    execute('toggleFiringStyle();resetWeapons();updateShooting(0);'); const focus=emitted();
    assert.equal(spread.length,lanes); assert.equal(focus.length,1); near(focus[0].damage,total,Math.max(1e-8,total*1e-12));
    near(focus[0].damageLog,Math.log(total)); assert.equal(focus[0].angle,0); assert.equal(focus[0].y,position().y);
    assert.equal(focus[0].color,spread[0].color); assert.equal(focus[0].core,spread[0].core); assert.deepEqual(weaponState(),original);
    if(lanes===1) near(focus[0].halfHeight,spread[0].halfHeight);
  }
});
check('spread velocities diverge symmetrically and all lanes maintain the same speed', () => {
  for(const lanes of [2,3,4]) {
    isolatedBattle(`weapon.lanes=${lanes};resetWeapons();updateShooting(0);`); const before=emitted(); const center=position().y;
    for(let i=0;i<lanes;i++) {
      near(before[i].angle,-before[lanes-1-i].angle); near(before[i].vx,before[lanes-1-i].vx);
      near(before[i].vy,-before[lanes-1-i].vy); near(Math.hypot(before[i].vx,before[i].vy),execute('weapon.speed'));
    }
    execute('shotCooldown=999;updateShooting(.5);'); const after=emitted();
    assert.ok(after[0].y<before[0].y); assert.ok(after.at(-1).y>before.at(-1).y);
    near(after.reduce((sum,b)=>sum+b.y,0)/lanes,center);
    assert.ok(after.every((b,i)=>b.previousY===before[i].y));
  }
});
check('Shift switches once per press, both Shift keys share a hold latch, and pointer switching restores canvas focus', () => {
  isolatedBattle(); assert.equal(execute('firingStyle.mode'),'spread'); assert.equal(key('ShiftLeft').prevented,true);
  assert.equal(execute('firingStyle.mode'),'focus'); key('ShiftLeft','keydown',{repeat:true}); key('ShiftRight'); assert.equal(execute('firingStyle.mode'),'focus');
  key('ShiftLeft','keyup'); key('ShiftLeft'); assert.equal(execute('firingStyle.mode'),'focus');
  key('ShiftLeft','keyup'); key('ShiftRight','keyup'); key('ShiftRight'); assert.equal(execute('firingStyle.mode'),'spread'); key('ShiftRight','keyup');
  nodes.get('#stance-button').focus(); emit(nodes.get('#stance-button'),'click'); assert.equal(execute('firingStyle.mode'),'focus');
  assert.equal(document.activeElement,canvas); assert.equal(nodes.get('#stance-button').attributes['aria-pressed'],'true');
});
check('menu, hidden tabs and evolution dialog reject stance changes, and resize preserves the selected style', () => {
  isolatedBattle(); key('ShiftLeft','keydown',{ctrlKey:true}); assert.equal(execute('firingStyle.mode'),'spread');
  execute('toggleFiringStyle();'); surface={width:1280,height:720}; emit(window,'resize'); assert.equal(execute('firingStyle.mode'),'focus');
  execute('openEvolutionChoice();'); key('ShiftLeft'); emit(nodes.get('#stance-button'),'click'); assert.equal(execute('firingStyle.mode'),'focus');
  execute('chooseEvolution("pierce");'); document.hidden=true; emit(document,'visibilitychange');
  assert.equal(execute('toggleFiringStyle()'),false); document.hidden=false; emit(document,'visibilitychange');
  leaveBattle(); assert.equal(execute('toggleFiringStyle()'),false); assert.equal(execute('firingStyle.mode'),'spread');
  begin(); assert.equal(execute('firingStyle.mode'),'spread');
});
check('bullets snapshot mode, angle, thickness, damage and color across stance switches, upgrades and rage expiry', () => {
  isolatedBattle('weapon.lanes=4;weapon.tier=3;resetWeapons();updateShooting(0);'); const before=emitted(); comboKills(20);
  execute('toggleFiringStyle();applyPowerup("red");shotCooldown=0;renderShotCooldown=0;updateShooting(0);'); const mixed=emitted();
  for(let i=0;i<4;i++) assert.deepEqual(mixed[i],before[i]);
  const focused=mixed.at(-1); assert.equal(focused.mode,'focus'); assert.equal(focused.overdrive,true); assert.ok(focused.halfHeight>before[0].halfHeight*1.5);
  execute('updateMomentum(8);toggleFiringStyle();updateShooting(0);'); const after=emitted(); assert.deepEqual(after.slice(0,5),mixed);
  assert.equal(after[4].overdrive,true); assert.equal(after[4].color,before[0].color);
});
check('rage accelerates emission by sixty percent without multiplying projectile damage in either stance', () => {
  for(const mode of ['spread','focus']) {
    for(const fps of [20,60,144]) {
      isolatedBattle(`weapon.lanes=4;weapon.tier=2;firingStyle.mode="${mode}";resetWeapons();`); comboKills(20);
      execute(`updateShooting(0);for(let i=0;i<${fps};i++) updateShooting(1/${fps});`);
      const total=execute('bullets.reduce((sum,b)=>sum+b.damage,0)+pendingShots*weapon.lanes*projectileDamage()');
      near(total,9*4*4.32); assert.equal(execute('weapon.interval'),.2); near(execute('weaponDamageLog()'),Math.log(4.32));
    }
  }
});
check('rage start, rage end and blue upgrades preserve fractional cadence without phantom shots', () => {
  isolatedBattle('resetWeapons();updateShooting(0);updateShooting(.1);'); near(execute('shotCooldown'),.1); comboKills(20);
  execute('reconcileShotCadence();'); near(execute('shotCooldown'),.0625); assert.equal(shots().length,1);
  execute('updateMomentum(8);reconcileShotCadence();'); near(execute('shotCooldown'),.1); assert.equal(shots().length,1);
  execute('applyPowerup("blue");'); near(execute('shotCooldown/weapon.interval'),.5);
  execute('toggleFiringStyle();reconcileShotCadence();'); near(execute('shotCooldown/weapon.interval'),.5);
});
check('temporary rage and focus do not inflate fresh enemy health, Boss endurance or cannon damage', () => {
  isolatedBattle('battleTime=360;weapon.lanes=4;weapon.tier=4;weapon.damage=7;weapon.interval=.05;');
  const ordinary=execute('enemyHealthLogForTime()'), cannon=execute('ultimateDamageLog()');
  execute('spawnBoss(0);'); const bossHealth=execute('boss.healthLog'); execute('resetBossEncounter();'); comboKills(20); execute('toggleFiringStyle();spawnBoss(0);');
  near(execute('enemyHealthLogForTime()'),ordinary); near(execute('ultimateDamageLog()'),cannon); near(execute('boss.healthLog'),bossHealth);
});
check('focused piercing shots deliver the combined damage to each distinct enemy once', () => {
  isolatedBattle('weapon.lanes=4;evolution.pierce=2;firingStyle.mode="focus";player.y=300;resetWeapons();updateShooting(0);'+target(400,300,40,20)+target(550,300,40,20)+target(700,300,40,20)+target(850,300,40,20));
  execute('bullets[0].previousX=300;bullets[0].x=900;resolveProjectileHits();resolveProjectileHits();');
  assert.deepEqual(scene().enemies.map(e=>e.hp),[14.2,14.2,14.2,20]);
});
check('focused main fire keeps its combined damage separate from scheduled Falcon rounds', () => {
  isolatedBattle('weapon.lanes=4;evolution.blast=1;firingStyle.mode="focus";player.y=300;resetWeapons();updateShooting(0);'+target(400,300,40,4)+target(475,300,40,20));
  execute('bullets[0].previousX=300;bullets[0].x=420;resolveProjectileHits();');
  near(scene().enemies[0].hp,20); near(ult().energy,12); assert.equal(shots().length,0);
  fireFirstDroneRound();
  assert.equal(execute('bullets[0].source'),'evolution-drone');
  near(execute('bullets[0].damage'),5*4*.26);
});
check('diagonal swept orbs are hit along the path even when neither endpoint overlaps', () => {
  isolatedBattle(orb('yellow',500,300));
  execute('globalThis.diagonal={previousX:300,x:700,previousY:276,y:324,angle:.12,length:24,halfHeight:2.5,damage:1};');
  assert.ok(execute('Number.isFinite(projectileOrbEntry(globalThis.diagonal,powerups[0]))'));
  assert.equal(execute('bulletHitsPowerup({...globalThis.diagonal,x:300,y:276},powerups[0])'),false);
  assert.equal(execute('bulletHitsPowerup({...globalThis.diagonal,previousX:700,previousY:324},powerups[0])'),false);
  execute('bullets.push(globalThis.diagonal);resolveProjectileHits();'); assert.equal(weaponState().lanes,2); assert.equal(orbScene().powerups.length,0);
});
check('orb collision rejects rounded rectangle corners and keeps tangent contacts for rotated shots', () => {
  isolatedBattle();
  for(const angle of [0,.12,-.12]) {
    execute(`globalThis.cornerBullet={x:400,previousX:400,y:300,previousY:300,angle:${angle},length:24,halfHeight:2.5};`);
    // In projectile space, (r+0.01, r+0.01) beyond its top-right corner is outside the circle expansion.
    execute(`globalThis.cornerOrb={x:400+Math.cos(${angle})*39-Math.sin(${angle})*17.5,y:300+Math.sin(${angle})*39+Math.cos(${angle})*17.5,radius:20};`);
    assert.equal(execute('bulletHitsPowerup(globalThis.cornerBullet,globalThis.cornerOrb)'),false);
    execute(`globalThis.cornerOrb={x:400+Math.cos(${angle})*44,y:300+Math.sin(${angle})*44,radius:20};`);
    assert.equal(execute('bulletHitsPowerup(globalThis.cornerBullet,globalThis.cornerOrb)'),true);
  }
});
check('diagonal projectile resolves earliest collision time rather than final object center position', () => {
  isolatedBattle(target(460,320,40,10)+orb('red',500,305));
  execute('enemies[0].previousX=620;enemies[0].previousY=350;powerups[0].previousX=300;powerups[0].previousY=276;bullets.push({previousX:300,x:700,previousY:276,y:324,angle:.12,length:24,halfHeight:2.5,damage:1});');
  assert.ok(execute('projectileOrbEntry(bullets[0],powerups[0])<projectileEnemyEntry(bullets[0],enemies[0])'));
  execute('resolveProjectileHits();'); assert.equal(orbScene().powerups.length,0); assert.equal(scene().enemies[0].hp,10); near(weaponState().damage,1.8);
});
check('slanted shots clean up beyond every edge, rage effects draw finite geometry and reduced motion removes flicker', () => {
  isolatedBattle('weapon.lanes=4;resetWeapons();updateShooting(0);shotCooldown=999;bullets[0].y=-100;bullets[1].y=viewport.height+100;bullets[2].x=viewport.width+1;updatePowerups(0);');
  assert.equal(shots().length,1); comboKills(20); execute('reducedMotion.matches=true;');
  captureDraws=true; drawOperations.length=0; execute('drawOverdrive();'); captureDraws=false;
  assert.ok(drawOperations.every(op=>op.args.every(value=>typeof value!=='number'||Number.isFinite(value))));
  assert.equal(drawOperations.filter(op=>op.name==='save').length,drawOperations.filter(op=>op.name==='restore').length);
  assert.equal(drawOperations.filter(op=>op.name==='moveTo').length,2);
  execute('reducedMotion.matches=false;');
});

check('pierce evolution boosts both firing styles by exactly 25, 45 and 65 percent and preserves old shots', () => {
  for (const mode of ['spread','focus']) for (let level=1;level<=3;level++) {
    isolatedBattle(`weapon.lanes=4;weapon.damage=3;weapon.tier=2;firingStyle.mode='${mode}';resetWeapons();updateShooting(0);`);
    const before=emitted(); execute(`evolution.pierce=${level};shotCooldown=0;renderShotCooldown=0;updateShooting(0);`);
    const after=emitted(); assert.deepEqual(after.slice(0,before.length),before);
    const multiplier=[1,1.25,1.45,1.65][level];
    for (let i=0;i<before.length;i++) {
      near(after[i+before.length].damage,before[i].damage*multiplier);
      near(after[i+before.length].damageLog,before[i].damageLog+Math.log(multiplier));
      assert.equal(after[i+before.length].piercesLeft,level);
    }
  }
});
check('permanent evolution benefits are not erased by stronger automatic enemy or Boss health scaling', () => {
  for (const time of [30,180,900,3600]) {
    isolatedBattle(`battleTime=${time};weapon.tier=5;weapon.damage=13;weapon.lanes=4;weapon.interval=.05;`);
    const healthLog=execute('enemyHealthLogForTime()'), ultimateLog=execute('ultimateDamageLog()');
    execute('spawnBoss(0);'); const bossLog=execute('boss.healthLog');
    execute('resetBossEncounter();evolution.pierce=evolution.blast=evolution.aegis=3;spawnBoss(0);');
    near(execute('enemyHealthLogForTime()'),healthLog); near(execute('boss.healthLog'),bossLog);
    near(execute('ultimateDamageLog()'),ultimateLog);
  }
});
check('Falcon rounds pass through supply orbs without collecting them and hit the enemy behind', () => {
  droneAttackScene(1,orb('red',350,'supportY')+target(500,'supportY',60,20));
  fireFirstDroneRound();
  execute('updateShooting(.6);resolveProjectileHits();');
  assert.equal(orbScene().powerups.length,1); near(weaponState().damage,1);
  near(scene().enemies[0].hp,20-1.3); near(ult().energy,12*1.3/20);
});
check('Falcon fire-control links pierce two aligned enemies and count each kill once', () => {
  droneAttackScene(1,'evolution.links.falcon=true;'+target(400,'supportY',40,1.4)+target(490,'supportY',40,1.4)+target(580,'supportY',40,1.4));
  fireFirstDroneRound();
  assert.equal(execute('bullets[0].piercesLeft'),1);
  near(execute('bullets[0].damage'),1.3*1.15);
  execute('updateShooting(.6);resolveProjectileHits();resolveProjectileHits();');
  assert.equal(scene().score,200); assert.equal(health().kills,2); assert.equal(momentumState().count,2);
  assert.deepEqual(scene().enemies.map(enemy=>[enemy.x,enemy.hp]),[[580,1.4]]);
  near(ult().energy,24); assert.equal(shots().length,0);
});
check('Falcon attack cadence freezes while paused and resumes without a queued volley', () => {
  droneAttackScene(2); fireFirstDroneRound();
  const cooldown=execute('evolutionWeapons.droneCooldown'), origin=emitted();
  emit(window,'blur'); execute('updateEvolutionWeapons(10);updateShooting(10);');
  near(execute('evolutionWeapons.droneCooldown'),cooldown); assert.deepEqual(emitted(),origin);
  emit(window,'focus'); canvas.focus();
  execute('for(let i=0;i<9;i++)updateEvolutionWeapons(.1);');
  assert.equal(execute('bullets.length'),2); near(execute('evolutionWeapons.droneCooldown'),.05);
  execute('updateEvolutionWeapons(.05);'); assert.equal(execute('bullets.length'),4);
});
check('a penetrating support shot damages the fusion Boss once without chaining', () => {
  readyBoss(10);
  execute('spawnEvolutionRound({x:boss.x-boss.width*1.5,y:boss.y},"lance",.65,{pierces:3});');
  const damage=execute('bullets[0].damage');
  const initial=bossState();
  execute('updateShooting(.3);resolveProjectileHits();resolveProjectileHits();');
  near(bossState().boss.hp,1-damage/Math.exp(initial.boss.healthLog));
  assert.equal(execute('bullets[0].hitTargets.size'),1);
  assert.equal(evolutionState().pulses.length,0);
});
check('aegis ranks charge in 25, 20, 17 and 14 seconds with frame-independent storage capped at two', () => {
  for (let level=0;level<=3;level++) {
    const duration=[25,20,17,14][level];
    isolatedBattle(`evolution.aegis=${level};updateShield(${duration-.001});`);
    assert.equal(protection().charges,0); execute('updateShield(.001);'); assert.equal(protection().charges,1); near(protection().energy,0);
    execute(`updateShield(${duration*10});`); assert.equal(protection().charges,2); near(protection().energy,0);
    execute('shield.charges=0;shield.energy=0;');
    execute(`for(let i=0;i<${duration*60};i++) updateShield(1/60);`); assert.equal(protection().charges,1); near(protection().energy,0);
  }
});
check('choosing each aegis rank grants one charge and preserves fractional progress until storage is full', () => {
  for(let level=0;level<3;level++) {
    isolatedBattle(`evolution.aegis=${level};shield.charges=0;shield.energy=evolutionShieldChargeTime()*.4;openEvolutionChoice();chooseEvolution("aegis");`);
    assert.equal(protection().charges,1); near(protection().energy/[20,17,14][level],.4);
    assert.equal(execute('chooseEvolution("aegis")'),false); assert.equal(protection().charges,1);
    isolatedBattle(`evolution.aegis=${level};shield.charges=1;shield.energy=5;openEvolutionChoice();chooseEvolution("aegis");`);
    assert.equal(protection().charges,2); assert.equal(protection().energy,0);
  }
});
check('aegis counter damages its full forward corridor but leaves rear and outside-lane enemies untouched', () => {
  for(let level=1;level<=3;level++) {
    const multiplier=[0,.55,.8,1.05][level];
    isolatedBattle(`evolution.aegis=${level};player.x=300;player.y=300;weapon.lanes=2;weapon.damage=4;weapon.interval=.2;`+
      target(500,300,40,100)+target(1000,300,40,100)+target(250,300,40,100)+target(500,550,40,100));
    execute('shield.charges=1;requestShield();'); const damage=4*2/.2*multiplier;
    for(const enemy of scene().enemies.slice(0,2)) near(enemy.hp,100-damage);
    assert.deepEqual(scene().enemies.slice(2).map(enemy=>enemy.hp),[100,100]); near(ult().energy,0);
    assert.equal(evolutionState().pulses.filter(p=>p.direction==='front').length,1);
  }
});
check('aegis counter kills score once without spawning support fire or gaining cannon energy, and caps each Boss', () => {
  isolatedBattle('evolution.aegis=3;evolution.blast=3;player.x=200;player.y=300;'+target(500,300,40,1)+target(550,550,40,1));
  execute('shield.charges=1;requestShield();requestShield();'); assert.equal(scene().score,100); assert.equal(scene().enemies.length,1);
  assert.equal(momentumState().count,1); near(ult().energy,0); assert.equal(shots().length,0);
  for(let level=1;level<=3;level++) {
    readyBoss(10,`evolution.aegis=${level};player.y=boss.y;weapon.tier=1000;shield.charges=1;requestShield();`);
    const cap=[0,.03,.04,.05][level], after=bossState();
    assert.ok(after.boss.hp>=1-cap&&after.boss.hp<1);
    near(ult().energy,0); assert.equal(evolutionState().pulses.length,2);
  }
});
const effectsState=()=>JSON.parse(execute('JSON.stringify({ ...combatEffects, deathRemaining: isBossDeathPlaying() ? bossPresentation.duration - bossPresentation.age : 0, choiceTarget: isBossDeathPlaying() ? bossPresentation.target : null })'));
check('direct Boss death fixture freezes battle for exactly 1.25 seconds then offers only one evolution', () => {
  readyBoss(0,'ultimate.charges=2;requestUltimate();updateUltimate(.2);globalThis.finalFallen=boss;defeatBoss();');
  assert.equal(execute('isBossDeathPlaying()'),true); assert.equal(evolutionState().pending,false);
  assert.equal(ult().charges,2); assert.equal(ult().phase,'idle'); assert.equal(shots().length,0);
  const time=scene().battleTime, score=scene().score, shield=protection();
  key('KeyD'); key('Space'); key('KeyV'); const location=position(); frames(20);
  near(scene().battleTime,time); samePosition(position(),location); assert.deepEqual(protection(),shield);
  assert.equal(execute('toggleFiringStyle()'),false); near(effectsState().deathRemaining,.25);
  execute('updateCombatEffects(.249);'); assert.equal(evolutionState().pending,false);
  execute('updateCombatEffects(.001);'); assert.equal(evolutionState().pending,true); assert.equal(execute('isBossDeathPlaying()'),false);
  execute('defeatBoss(globalThis.finalFallen);updateCombatEffects(10);'); assert.equal(scene().score,score);
  execute('chooseEvolution("pierce");updateCombatEffects(10);'); assert.equal(evolutionState().pending,false); assert.equal(evolutionState().pierce,1);
  key('KeyD','keyup'); key('Space','keyup'); key('KeyV','keyup');
});
check('Boss death cinematic and effects freeze on blur hidden tabs and control focus then resume without catch-up', () => {
  for(const pause of ['window','hidden','control']) {
    readyBoss(0,'defeatBoss();updateCombatEffects(.2);');
    if(pause==='window') emit(window,'blur');
    if(pause==='hidden') {document.hidden=true;emit(document,'visibilitychange');}
    if(pause==='control') nodes.get('#sound-button').focus();
    const before=effectsState(); frames(40); assert.deepEqual(effectsState(),before); assert.equal(evolutionState().pending,false);
    if(pause==='hidden') {document.hidden=false;emit(document,'visibilitychange');}
    emit(window,'focus'); canvas.focus(); execute('updateCombatEffects(.05);'); near(effectsState().deathRemaining,1);
  }
});
check('resize clears stale effects but preserves and repositions the active Boss death without losing its one choice', () => {
  readyBoss(0,'defeatBoss();updateCombatEffects(.3);'); const before=effectsState();
  assert.ok(before.wrecks.length>0); assert.ok(before.particles.length>0);
  surface={width:640,height:360}; emit(window,'resize'); const after=effectsState();
  near(after.deathRemaining,before.deathRemaining); assert.equal(after.wrecks.length,before.wrecks.length);
  near(after.wrecks[0].age,before.wrecks[0].age); assert.equal(after.wrecks[0].stage,before.wrecks[0].stage);
  assert.equal(after.particles.length+after.impacts.length+after.shockwaves.length,0); assert.equal(after.shake,0);
  assert.ok(after.wrecks[0].x>=after.wrecks[0].width/2&&after.wrecks[0].x<=640-after.wrecks[0].width/2);
  assert.ok(after.wrecks[0].y>=after.wrecks[0].height/2&&after.wrecks[0].y<=360-after.wrecks[0].height/2);
  finishBossPresentation(); assert.equal(evolutionState().pending,true); execute('chooseEvolution("blast");');
  assert.equal(evolutionState().blast,1); assert.equal(scene().score,2000);
  isolatedBattle(target(400,300,80,1)+'recordCombatDestruction({...enemies[0],kind:"armored"});combatBurst(400,300);');
  surface={width:640,height:360}; emit(window,'resize');
  const cleared=effectsState(); assert.equal(cleared.wrecks.length+cleared.particles.length+cleared.shockwaves.length,0);
});
check('menu game over and restart discard death callbacks wrecks particles and accumulated shake', () => {
  for(const action of ['menu','death','restart']) {
    readyBoss(0,'defeatBoss();updateCombatEffects(.3);'); assert.ok(effectsState().particles.length>0);
    if(action==='menu') leaveBattle();
    else {execute('endGame();'); if(action==='restart') {emit(nodes.get('#restart-button'),'click');step();}}
    const fx=effectsState(); assert.equal(fx.deathRemaining,0); assert.equal(fx.choiceTarget,null);
    assert.equal(fx.wrecks.length+fx.particles.length+fx.impacts.length+fx.shockwaves.length,0); assert.equal(fx.shake,0);
    frames(40); assert.equal(evolutionState().pending,false);
  }
});
check('combat feedback is capacity-bounded during extreme hits and explosions and expires without touching health', () => {
  isolatedBattle(target(400,300,80,100)); const hp=scene().enemies[0].hp;
  execute('for(let i=0;i<1000;i++){recordCombatImpact(enemies[0],{source:"ultimate",y:300},true);combatBurst(400,300,2);recordCombatDestruction({...enemies[0],kind:"armored"});}');
  const fx=effectsState(); assert.equal(fx.particles.length,180); assert.equal(fx.impacts.length,32); assert.equal(fx.wrecks.length,12); assert.equal(fx.shockwaves.length,16);
  execute('updateCombatEffects(2);updateCombatEffects(2);'); const clean=effectsState();
  assert.equal(clean.particles.length+clean.impacts.length+clean.wrecks.length+clean.shockwaves.length,0); assert.equal(scene().enemies[0].hp,hp);
});
check('ordinary impacts are locally throttled while ultimate Boss impacts still produce their shockwave', () => {
  isolatedBattle(target(400,300,80,100)); execute('recordCombatImpact(enemies[0],{y:10000});recordCombatImpact(enemies[0],{y:300});');
  assert.equal(effectsState().impacts.length,1); near(effectsState().impacts[0].y,319.2);
  execute('recordCombatImpact(enemies[0],{source:"ultimate",y:300},true);'); assert.equal(effectsState().impacts.length,2);
  assert.equal(effectsState().shockwaves.length,1); assert.ok(effectsState().shakeTime>0);
  execute('updateCombatEffects(.071);recordCombatImpact(enemies[0],{y:300});'); assert.equal(effectsState().impacts.length,3);
});
check('shake preference cycles accessibly and never changes gameplay coordinates or exceeds configured amplitude', () => {
  isolatedBattle('shakePreference="low";updateShakeButton();addCombatShake(100);combatEffects.clock=.03;');
  const before=position(); let offset=execute('combatShakeOffset()'); assert.ok(Math.abs(offset.x)<=2.5&&Math.abs(offset.y)<=2.5);
  emit(nodes.get('#shake-button'),'click'); assert.equal(execute('shakePreference'),'full');
  offset=execute('combatShakeOffset()'); assert.ok(Math.abs(offset.x)<=6&&Math.abs(offset.y)<=6);
  emit(nodes.get('#shake-button'),'click'); assert.equal(execute('shakePreference'),'off');
  assert.equal(execute('combatShakeOffset().x'),0); assert.equal(execute('combatShakeOffset().y'),0);
  assert.match(nodes.get('#shake-button').attributes['aria-label'],/关/); emit(nodes.get('#shake-button'),'click');
  assert.equal(execute('shakePreference'),'low'); samePosition(position(),before); assert.equal(document.activeElement,canvas);
});
check('reduced motion forces stationary minimal debris and zero shake while all effect drawing remains finite and balanced', () => {
  isolatedBattle('reducedMotion.matches=true;shakePreference="full";combatBurst(400,300,2,"#ffb569",true);addCombatShake(6);');
  assert.equal(effectsState().particles.length,3); assert.ok(effectsState().particles.every(p=>p.vx===0&&p.vy===0&&p.spin===0));
  assert.equal(execute('combatShakeOffset().x'),0); assert.equal(execute('combatShakeOffset().y'),0);
  execute('recordCombatDestruction({x:700,y:300,width:180,height:120,type:0,kind:"armored"});');
  captureDraws=true; drawOperations.length=0; execute('drawCombatEffects();'); captureDraws=false;
  assert.equal(drawOperations.filter(op=>op.name==='save').length,drawOperations.filter(op=>op.name==='restore').length);
  assert.ok(drawOperations.every(op=>op.args.every(value=>typeof value!=='number'||Number.isFinite(value))));
  execute('reducedMotion.matches=false;shakePreference="low";');
});
check('all 63 evolved combinations preserve the centered raster nose and draw the selected Falcon count', () => {
  isolatedBattle(); const before=execute('JSON.stringify(player)');
  const muzzle=JSON.parse(execute('JSON.stringify(muzzlePosition())'));
  const [tipX,tipY]=JSON.parse(execute('JSON.stringify(shipRenderSources.crimson.tip)'));
  for(let p=0;p<=3;p++) for(let b=0;b<=3;b++) for(let a=0;a<=3;a++) {
    captureDraws=true; drawOperations.length=0;
    const drawn=execute(`(()=>{evolution.pierce=${p};evolution.blast=${b};evolution.aegis=${a};
      const result=drawEvolvedPlayer(context,player,evolution,true,1);drawEvolutionWeapons();return result;})()`); captureDraws=false;
    assert.equal(drawn,!!(p||b||a)); if(!drawn) continue;
    assert.equal(drawOperations.filter(op=>op.name==='save').length,drawOperations.filter(op=>op.name==='restore').length);
    assert.ok(drawOperations.every(op=>op.args.every(value=>typeof value!=='number'||Number.isFinite(value))));
    const raster=drawOperations.filter(op=>op.name==='drawImage'&&op.args[0]===nodes.get('#fighter-art'));
    assert.equal(raster.length,1+(b===0?0:b===1?1:2));
    const [,sx,sy,sw,sh,x,y,w,h]=raster[0].args;
    near(x+(tipX-sx)*w/sw,muzzle.x); near(y+(tipY-sy)*h/sh,muzzle.y);
  }
  assert.equal(execute('JSON.stringify(player)'),before);
});


// 完美护盾按实际弹药接触与有效战斗时间检查，不能凭靠近或旧轨迹刷收益。
const parrySoundCount = () => audioCalls.filter(call=>call.name==='perfectShield').length;
const contactShell = (extra='') => `enemyProjectiles.push({x:player.x,y:player.y,previousX:player.x,previousY:player.y,vx:0,vy:0,radius:6,age:0${extra?','+extra:''}});`;
function activateParry(extra='') { isolatedBattle('bossHitGrace=0;'+extra); primeShield(); execute('requestShield();'); }
check('perfect guard expires at one quarter second while ordinary shield still protects for two seconds', () => {
  for(const [elapsed,perfect] of [[0,true],[.249,true],[.25,false],[.251,false]]) {
    activateParry(); const sounds=parrySoundCount();
    execute(`updateShield(${elapsed});${contactShell()}updateEnemyProjectileDamage();`);
    assert.equal(protection().perfectUsed,perfect); assert.equal(parrySoundCount()-sounds,Number(perfect));
    assert.equal(health().lives,3); near(protection().remaining,2-elapsed);
    near(protection().energy,elapsed+(perfect?6.25:0));
  }
});
check('many ordinary and Boss shells yield only one perfect guard and refund per shield activation', () => {
  activateParry(); const sounds=parrySoundCount();
  execute(contactShell().repeat(6)+bossProjectile().repeat(6)+'updateEnemyProjectileDamage();updateBossDamage();');
  assert.equal(protection().perfectUsed,true); near(protection().energy,6.25);
  assert.equal(parrySoundCount()-sounds,1); assert.equal(execute('enemyProjectiles.length+bossProjectiles.length'),0);
  execute(contactShell()+'updateEnemyProjectileDamage();'); near(protection().energy,6.25);
  execute('updateShield(2);shield.charges=1;requestShield();'+contactShell()+'updateEnemyProjectileDamage();');
  assert.equal(parrySoundCount()-sounds,2);
});
check('perfect guard refunds a quarter of the current evolved recharge period and cannot hide a third charge', () => {
  for(let level=0;level<=3;level++) {
    activateParry(`evolution.aegis=${level};shield.energy=0;`);
    const period=execute('evolutionShieldChargeTime()');
    execute(contactShell()+'updateEnemyProjectileDamage();'); near(protection().energy,period*.25);
    activateParry(`evolution.aegis=${level};shield.energy=evolutionShieldChargeTime()*.9;`);
    execute(contactShell()+'updateEnemyProjectileDamage();');
    assert.equal(protection().charges,1); near(protection().energy,period*.15);
    isolatedBattle(`bossHitGrace=0;evolution.aegis=${level};shield.charges=2;shield.energy=evolutionShieldChargeTime()*.9;requestShield();`);
    execute(contactShell()+'updateEnemyProjectileDamage();');
    assert.equal(protection().charges,2); near(protection().energy,0);
  }
});
check('ordinary damage and existing hurt grace cannot award a perfect guard without an eligible shield', () => {
  isolatedBattle('bossHitGrace=0;'); const sounds=parrySoundCount();
  execute(contactShell()+'updateEnemyProjectileDamage();'); assert.equal(health().lives,2);
  assert.equal(protection().perfectUsed,false); near(protection().energy,0);
  primeShield(); execute('requestShield();'+contactShell()+'updateEnemyProjectileDamage();');
  assert.equal(protection().perfectUsed,false); near(protection().energy,0); assert.equal(parrySoundCount(),sounds);
  activateParry(); execute('updateShield(2);'+contactShell()+'updateEnemyProjectileDamage();');
  assert.equal(protection().perfectUsed,false); assert.equal(health().lives,2);
});
check('enemy contact and active beam or mine hazards remain ordinary shield blocks', () => {
  activateParry(); const sounds=parrySoundCount(); collide();
  assert.equal(health().lives,3); assert.equal(protection().perfectUsed,false); near(protection().energy,0);
  for(const kind of ['beam','zone']) {
    readyBoss(kind==='beam'?4:2,'shield.charges=1;requestShield();');
    execute(`addBossHazard("${kind}",{x:player.x,y:player.y,radius:35,thickness:20,warning:.1,duration:5});bossHazards[0].age=.2;updateBossDamage();`);
    assert.equal(health().lives,3); assert.equal(protection().perfectUsed,false); near(protection().energy,0);
    assert.equal(execute('bossHazards.length'),1);
  }
  assert.equal(parrySoundCount(),sounds);
});
check('visible shield ellipse intercepts edge shots and high-speed relative sweeps without enlarging the bare fighter', () => {
  activateParry();
  execute('var edgeShot={x:player.x+player.width*.55,y:player.y,previousX:player.x+player.width*.55,previousY:player.y,radius:0};');
  assert.equal(execute('shieldInterceptsProjectile(edgeShot)'),true);
  execute('edgeShot.x=edgeShot.previousX=player.x+player.width*.61;');
  assert.equal(execute('shieldInterceptsProjectile(edgeShot)'),false);
  execute('enemyProjectiles.push({x:player.x-250,previousX:player.x+250,y:player.y+player.height*.5,previousY:player.y+player.height*.5,vx:-1000,vy:0,radius:5,age:0});updateEnemyProjectileDamage();');
  assert.equal(protection().perfectUsed,true); assert.equal(execute('enemyProjectiles.length'),0);
  isolatedBattle('bossHitGrace=0;enemyProjectiles.push({x:player.x+player.width*.55,previousX:player.x+player.width*.55,y:player.y,previousY:player.y,vx:0,vy:0,radius:0,age:0});updateEnemyProjectileDamage();');
  assert.equal(health().lives,3); assert.equal(execute('enemyProjectiles.length'),1);
});
check('aegis opening clears nearby shells but rewards only present ellipse contact rather than stale shot paths', () => {
  for(const contact of [false,true]) {
    isolatedBattle(`bossHitGrace=0;evolution.aegis=1;shield.charges=1;enemyProjectiles.push({x:player.x+player.width*${contact?.5:.85},previousX:player.x,y:player.y,previousY:player.y,vx:0,vy:0,radius:6,age:0});`);
    const sounds=parrySoundCount(); execute('requestShield();');
    assert.equal(protection().perfectUsed,contact); assert.equal(execute('enemyProjectiles.length'),0);
    near(protection().energy,contact?execute('evolutionShieldChargeTime()')*.25:0);
    assert.equal(parrySoundCount()-sounds,Number(contact));
  }
});
check('perfect counter uses the complete base firepower only in the visible forward band without spawning support fire or gaining cannon energy', () => {
  activateParry('weapon.damage=4;weapon.lanes=2;weapon.interval=.2;evolution.blast=3;');
  execute(`enemies.length=0;${target(500,position().y,100,100)}${target(50,position().y,100,100)}${target(1400,position().y,100,100)}${target(600,position().y+250,100,100)}${contactShell()}updateEnemyProjectileDamage();`);
  near(execute('enemies[0].hp'),100-4*2/.2*.65);
  for(let i=1;i<4;i++) near(execute(`enemies[${i}].hp`),100);
  near(ult().energy,0); assert.equal(shots().length,0); assert.equal(health().kills,0);
});
check('counter kills use normal one-time score and combo settlement without charging the cannon', () => {
  activateParry('evolution.blast=3;');
  execute(target(500,position().y,100,1)+contactShell()+'updateEnemyProjectileDamage();updateBossDamage();');
  assert.equal(scene().score,100); assert.equal(health().kills,1); assert.equal(momentumState().count,1);
  assert.equal(scene().enemies.length,0); near(ult().energy,0); assert.equal(shots().length,0);
  execute(contactShell()+'updateEnemyProjectileDamage();'); assert.equal(scene().score,100); assert.equal(health().kills,1);
});
check('perfect counter is capped at three percent against the fusion Boss even with unbounded weapon tiers', () => {
  readyBoss(10,'player.y=boss.y;weapon.tier=1000;shield.charges=1;requestShield();');
  execute(bossProjectile().repeat(5)+'updateBossDamage();');
  const after=bossState();
  assert.ok(after.boss.hp>=.97&&after.boss.hp<1);
  near(ult().energy,0);
  assert.equal(protection().perfectUsed,true);
});
check('lethal perfect counters safely finish a Boss after collecting contact bullets and never settle it twice', () => {
  readyBoss(0,'beginBossFinale(boss);boss.finale.age=boss.finale.transform;bossHitGrace=0;weapon.tier=1000;boss.hp=.001;shield.charges=1;requestShield();');
  execute(bossProjectile().repeat(8)+'updateBossDamage();updateBossDamage();');
  assert.equal(execute('boss'),null); assert.equal(execute('bossDefeated'),1); assert.equal(scene().score,2000);
  assert.equal(execute('bossProjectiles.length'),0); assert.equal(execute('isBossDeathPlaying()'),true); near(ult().energy,0);
});
check('perfect window and all shield feedback timers freeze on hidden tabs, window blur and control focus', () => {
  for(const route of ['window','hidden','control']) {
    activateParry(); execute('updateShield(.1);'); const before=protection();
    if(route==='window') emit(window,'blur');
    if(route==='hidden') {document.hidden=true;emit(document,'visibilitychange');}
    if(route==='control') nodes.get('#sound-button').focus();
    frames(3); execute('updateShield(500);shieldFrameSeconds(1);'); assert.deepEqual(protection(),before);
    if(route==='window') emit(window,'focus');
    if(route==='hidden') {document.hidden=false;emit(document,'visibilitychange');}
    if(route==='control') emit(canvas,'pointerdown');
    step(); execute(contactShell()+'updateEnemyProjectileDamage();'); assert.equal(protection().perfectUsed,true);
  }
});
check('brief perfect-guard slow motion advances all gameplay on one shared step and expires by active real time', () => {
  activateParry('ultimate.charges=1;requestUltimate();');
  execute(contactShell()+'updateEnemyProjectileDamage();');
  const time=scene().battleTime, shieldTime=protection().remaining, cannon=ult().elapsed, backdrop=execute('battlefieldState.clock');
  step(); near(scene().battleTime-time,.05*.4); near(shieldTime-protection().remaining,.05*.4);
  near(ult().elapsed-cannon,.05*.4); near(execute('battlefieldState.clock')-backdrop,.05*.4);
  const left=protection().slowRemaining;
  const delta=execute('shieldFrameSeconds(.2)'); near(delta,left*.4+(.2-left)); near(protection().slowRemaining,0);
  activateParry('reducedMotion.matches=true;'); execute(contactShell()+'updateEnemyProjectileDamage();');
  near(execute('shieldFrameSeconds(.05)'),.05); execute('reducedMotion.matches=false;');
});
check('resize and duplicate fullscreen events preserve the perfect window and its consumed flag rather than renewing it', () => {
  for(const used of [false,true]) {
    activateParry(); if(used) execute(contactShell()+'updateEnemyProjectileDamage();');
    execute('updateShield(.1);'); const before=protection();
    // 同尺寸事件连格挡演出也保留；真实缩放只清理旧坐标上的瞬时效果。
    emit(window,'resize');emit(document,'fullscreenchange');assert.deepEqual(protection(),before);
    surface={width:1920,height:1080};emit(window,'resize');
    const resized=protection();
    for(const name of ['remaining','perfectRemaining','perfectUsed','charges','energy']) assert.equal(resized[name],before[name]);
    near(resized.flash,0);near(resized.slowRemaining,0);assert.equal(resized.effect,null);
    emit(document,'fullscreenchange');emit(window,'resize');assert.deepEqual(protection(),resized);
  }
});
check('new games clear consumed perfect guard, transient feedback and slow motion completely', () => {
  activateParry();execute(contactShell()+'updateEnemyProjectileDamage();'); assert.equal(protection().perfectUsed,true);
  execute('endGame();showScreen("battle");');
  for(const name of ['remaining','energy','charges','perfectRemaining','flash','slowRemaining']) near(protection()[name],0);
  assert.equal(protection().perfectUsed,false);
  assert.equal(execute('tryPerfectShield()'),false);
});
check('perfect guard ring and counter drawing remain finite, canvas-balanced and readable with reduced motion', () => {
  for(const reduced of [false,true]) {
    activateParry(`reducedMotion.matches=${reduced};`); execute(contactShell()+'updateEnemyProjectileDamage();');
    captureDraws=true;drawOperations.length=0;execute('drawShield();');captureDraws=false;
    assert.equal(drawOperations.filter(op=>op.name==='save').length,drawOperations.filter(op=>op.name==='restore').length);
    assert.ok(drawOperations.every(op=>op.args.every(value=>typeof value!=='number'||Number.isFinite(value))));
    assert.ok(drawOperations.some(op=>op.name==='ellipse'||op.name==='arc'));
  }
  execute('reducedMotion.matches=false;');
});

// 完美护盾只提供一次速蓄机会，弹药、伤害和原有连发规则保持独立。
const cannonLinkState = () => JSON.parse(execute('JSON.stringify(cannonLink)'));
function earnCannonLink(extra='') {
  activateParry(extra);
  execute(contactShell()+'updateEnemyProjectileDamage();');
  assert.equal(protection().perfectUsed,true);
}
check('a real perfect guard grants a three-second cannon opportunity without ammunition and later shells cannot renew it', () => {
  earnCannonLink('ultimate.energy=47;');
  near(cannonLinkState().remaining,3); assert.equal(ult().charges,0); near(ult().energy,47);
  assert.match(nodes.get('#ultimate-label').textContent,/3\.0 秒.*需已存炮弹/);
  execute('updateCannonLink(1);'+contactShell().repeat(5)+'updateEnemyProjectileDamage();tryPerfectShield();');
  near(cannonLinkState().remaining,2); assert.equal(ult().charges,0); near(ult().energy,47);
});
check('cannon link expires exactly at three active seconds and rejects invalid time steps', () => {
  for(const [elapsed,linked] of [[2.999,true],[3,false],[3.001,false]]) {
    earnCannonLink('ultimate.charges=1;');
    execute('updateCannonLink(NaN);updateCannonLink(Infinity);updateCannonLink(-1);'); near(cannonLinkState().remaining,3);
    execute(`updateCannonLink(${elapsed});requestUltimate();`);
    assert.equal(cannonLinkState().chargingLinked,linked); near(cannonLinkState().chargeDuration,linked?.45:.85);
    assert.equal(ult().charges,0); near(cannonLinkState().remaining,0);
  }
});
check('failed cannon requests preserve the link until a focused idle cannon with ammunition can consume it', () => {
  earnCannonLink(); assert.equal(execute('requestUltimate()'),false); near(cannonLinkState().remaining,3);
  primeUltimate(2); emit(window,'blur'); assert.equal(execute('requestUltimate()'),false); near(cannonLinkState().remaining,3);
  emit(window,'focus'); nodes.get('#sound-button').focus(); assert.equal(execute('requestUltimate()'),false); near(cannonLinkState().remaining,3);
  emit(canvas,'pointerdown'); assert.equal(execute('requestUltimate()'),true);
  assert.equal(ult().charges,1); near(cannonLinkState().remaining,0); near(cannonLinkState().chargeDuration,.45);
  assert.equal(execute('requestUltimate()'),false); assert.equal(ult().charges,1);
});
check('a perfect guard never accelerates an existing charge and its opportunity can be spent on the following cannon', () => {
  earnCannonLink('ultimate.charges=2;requestUltimate();updateUltimate(.3);');
  near(cannonLinkState().chargeDuration,.85); assert.equal(cannonLinkState().chargingLinked,false);
  assert.equal(execute('requestUltimate()'),false); near(cannonLinkState().remaining,3);
  execute('updateUltimate(.54);'); assert.equal(ult().phase,'charging');
  execute('updateUltimate(.01);'); assert.equal(ult().phase,'firing'); assert.equal(execute('ultimate.shot.linked'),false);
  execute('updateUltimate(1.2);updateCannonLink(1.75);'); assert.equal(ult().phase,'idle');
  assert.equal(execute('requestUltimate()'),true); near(cannonLinkState().chargeDuration,.45); assert.equal(ult().charges,0);
});
check('cannon link countdown shares the gameplay step and freezes on window blur, hidden tabs and control focus', () => {
  for(const route of ['window','hidden','control']) {
    earnCannonLink(); const before=cannonLinkState().remaining, time=scene().battleTime;
    step(); near(before-cannonLinkState().remaining,scene().battleTime-time); near(before-cannonLinkState().remaining,.05*.4);
    if(route==='window') emit(window,'blur');
    if(route==='hidden') {document.hidden=true;emit(document,'visibilitychange');}
    if(route==='control') nodes.get('#sound-button').focus();
    const frozen=cannonLinkState(); frames(100); execute('updateCannonLink(500);'); assert.deepEqual(cannonLinkState(),frozen);
    if(route==='window') emit(window,'focus');
    if(route==='hidden') {document.hidden=false;emit(document,'visibilitychange');}
    if(route==='control') emit(canvas,'pointerdown');
    step(); assert.deepEqual(cannonLinkState(),frozen);
    step(); assert.ok(cannonLinkState().remaining<frozen.remaining);
  }
});
check('linked charge audio uses 0.45 seconds and resumes the correct remaining duration after pause or mute', () => {
  gameAudio.setMuted(false); earnCannonLink('ultimate.charges=2;'); audioCalls.length=0;
  execute('requestUltimate();updateUltimate(.15);');
  near(audioCalls.filter(call=>call.name==='chargeUltimate').at(-1).args[0],.45);
  emit(window,'blur'); frames(5); near(ult().elapsed,.15); assert.ok(audioCalls.some(call=>call.name==='stopUltimate'));
  emit(window,'focus'); step(); near(audioCalls.filter(call=>call.name==='chargeUltimate').at(-1).args[0],.3);
  gameAudio.setMuted(true); execute('syncGameAudio();updateUltimate(.1);');
  const soundCount=audioCalls.filter(call=>call.name==='chargeUltimate').length;
  execute('syncGameAudio();'); assert.equal(audioCalls.filter(call=>call.name==='chargeUltimate').length,soundCount);
  gameAudio.setMuted(false); execute('syncGameAudio();'); near(audioCalls.filter(call=>call.name==='chargeUltimate').at(-1).args[0],.2);
  execute('updateUltimate(.2);'); assert.equal(ult().phase,'firing'); assert.equal(execute('ultimate.shot.linked'),true);
  assert.equal(audioCalls.filter(call=>call.name==='fireUltimate').length,1);
});
check('resize preserves an unspent link but cancellation refunds only the cannon charge without restoring its consumed link', () => {
  earnCannonLink('ultimate.charges=2;ultimate.energy=37;'); execute('updateCannonLink(.75);');
  emit(window,'resize'); emit(document,'fullscreenchange'); near(cannonLinkState().remaining,2.25);
  surface={width:1500,height:850};emit(window,'resize'); near(cannonLinkState().remaining,2.25);
  execute('requestUltimate();updateUltimate(.2);'); assert.equal(ult().charges,1); near(cannonLinkState().remaining,0);
  surface={width:1600,height:900};emit(window,'resize'); assert.equal(ult().phase,'idle'); assert.equal(ult().charges,2); near(ult().energy,37);
  emit(document,'fullscreenchange');assert.equal(ult().charges,2);near(cannonLinkState().remaining,0);
  execute('requestUltimate();');near(cannonLinkState().chargeDuration,.85);assert.equal(cannonLinkState().chargingLinked,false);
});
check('death, menu, new rounds, evolution and lethal parry Boss transitions discard cannon opportunities', () => {
  for(const action of ['endGame();','showScreen("menu");','showScreen("battle");','openEvolutionChoice();']) {
    earnCannonLink(); execute(action+'updateCannonLink(0);'); near(cannonLinkState().remaining,0);
  }
  readyBoss(0,'beginBossFinale(boss);boss.finale.age=boss.finale.transform;bossHitGrace=0;weapon.tier=1000;boss.hp=.001;shield.charges=1;requestShield();');
  execute(bossProjectile()+'updateBossDamage();'); assert.equal(execute('isBossDeathPlaying()'),true);near(cannonLinkState().remaining,0);
  finishBossPresentation();assert.equal(execute('evolution.pending'),true);near(cannonLinkState().remaining,0);
});
check('linked cannon damage remains unchanged and respects fusion resistance without generating energy', () => {
  readyBoss(10,'player.y=boss.y;weapon.tier=10000;ultimate.charges=2;');
  const originalDamage=execute('ultimateDamageLog()');execute('armCannonLink();requestUltimate();updateUltimate(.449);');
  assert.equal(ult().phase,'charging');execute('updateUltimate(.001);');assert.equal(ult().phase,'firing');
  near(ult().shot.damageLog,originalDamage);assert.equal(execute('ultimate.shot.linked'),true);
  execute('updateUltimate(.5);resolveUltimateHits();resolveUltimateHits();');
  near(bossState().boss.hp,1-.18*.78);near(ult().energy,0);assert.equal(ult().charges,1);
});
check('linked cannons spend only one charge and fresh consecutive presses revert to normal charge time without buffered repeats', () => {
  earnCannonLink('ultimate.charges=3;'); key('Space');key('Space','keydown',{repeat:true});
  execute('updateUltimate(.45);'); assert.equal(execute('ultimate.shot.linked'),true);assert.equal(ult().charges,2);
  key('Space','keydown',{repeat:true});execute('updateUltimate(5);');assert.equal(ult().phase,'idle');
  key('Space');assert.equal(ult().phase,'idle');assert.equal(ult().charges,2);
  key('Space','keyup');key('Space');key('Space','keyup');near(cannonLinkState().chargeDuration,.85);assert.equal(ult().charges,1);
  execute('updateUltimate(.45);');assert.equal(ult().phase,'charging');execute('updateUltimate(.4);');
  assert.equal(execute('ultimate.shot.linked'),false);execute('updateUltimate(5);');
  key('Space');key('Space','keyup');assert.equal(ult().phase,'charging');assert.equal(ult().charges,0);
});
check('linked charge and red cannon show a small ice-blue signature with finite balanced drawing in reduced motion', () => {
  for(const reduced of [false,true]) for(const phase of ['charging','firing']) {
    earnCannonLink(`ultimate.charges=1;reducedMotion.matches=${reduced};`);
    execute(`requestUltimate();updateUltimate(${phase==='charging'?.2:.6});`);
    captureDraws=true;drawOperations.length=0;execute('drawUltimate();');captureDraws=false;
    assert.equal(drawOperations.filter(op=>op.name==='save').length,drawOperations.filter(op=>op.name==='restore').length);
    assert.ok(drawOperations.every(op=>op.args.every(value=>typeof value!=='number'||Number.isFinite(value))));
    assert.ok(drawOperations.some(op=>op.name==='set:strokeStyle'&&op.args[0]==='#c1f4ff'));
    assert.ok(drawOperations.some(op=>op.name==='ellipse'));
    if(phase==='firing') {
      assert.equal(drawOperations.filter(op=>op.name==='createLinearGradient').length,4);
      assert.ok(drawOperations.filter(op=>op.name==='lineTo').length>20);
      assert.equal(drawOperations.some(op=>op.name==='fillRect'),false);
    }
  }
  execute('reducedMotion.matches=false;');
});

process.stdout.write(checks+' combat checks passed, '+failedChecks+' failed.\n');
if (failedChecks) process.exitCode = 1;
