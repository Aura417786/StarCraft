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
document.createElement = () => mockNode();
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
nodes.get('#evolution-screen').querySelector = () => undefined;
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
document.getElementById = id => document.querySelector("#" + id);
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
// Explicit Resume models the v23 visible pause contract in legacy simulation tests.
function focusAndConfirmResume() { emit(window, 'focus'); vm.runInContext('if (pauseView) resumeGame()', sandbox); }
function visibilityAndConfirmResume() { emit(document, 'visibilitychange'); if (!document.hidden) vm.runInContext('if (pauseView) resumeGame()', sandbox); }
function step(seconds = 0.05) { now += seconds * 1000; animationCallback(now); }
// 成长曲线用同一火力基准比较，不受出击机型影响。
function begin() {
  focusAndConfirmResume();
  emit(nodes.get('#start-button'), 'click');
  vm.runInContext(`
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
    boss.previousX=boss.x;boss.previousY=boss.y;boss.phase='recover';resetBossPresentation();`);
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
  execute('shotCooldown=0;updateShooting(0);shotCooldown=999;');
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

check("red pickup boosts an actual shot without changing the current or next enemy's health", () => {
  isolated('battleTime=96;');
  setEnemy(660, 360, 100);
  execute('enemies[0].y=enemies[0].previousY=player.y;player.x=250;');
  const before = fireSinglePacket();
  const afterHit = execute('enemies[0].hp');
  execute('powerups.push({type:"red",x:player.x+180,previousX:player.x+180,y:player.y,radius:16});');
  fireSinglePacket();
  assert.equal(execute('powerups.length'), 0);
  near(execute('enemies[0].hp'), afterHit);
  const upgraded = fireSinglePacket();
  assert.ok(upgraded.damage > before.damage, 'the shot after collecting the orb must deal more damage');
  assert.ok(execute('enemies[0].hp') < afterHit);
  near(execute('enemies[0].healthLog'), Math.log(100));
  execute('spawnEnemy("armored");var birth=enemies.at(-1).healthLog;for(let i=0;i<30;i++)applyPowerup("red");spawnEnemy("armored");');
  near(execute('enemies.at(-1).healthLog'), execute('birth'));
});

check("blue pickup increases real firing cadence and yellow adds symmetric coverage", () => {
  function volley(upgrade) {
    isolated();
    if (upgrade) execute('applyPowerup(' + JSON.stringify(upgrade) + ')');
    execute('resetWeapons();updateShooting(0);');
    const lanes = snapshot('bullets.map(shot=>({offset:shot.y-player.y,vy:shot.vy}))');
    execute('for(let frame=0;frame<90;frame++)updateShooting(1/60);');
    return { lanes, rounds: execute('bullets.length'), rate: execute('1/weapon.interval') };
  }
  const red = volley(), blue = volley("blue"), yellow = volley("yellow");
  assert.ok(blue.rate > red.rate && blue.rounds > red.rounds);
  assert.deepEqual(blue.lanes, red.lanes);
  assert.equal(yellow.lanes.length, 2);
  near(yellow.lanes[0].offset, -yellow.lanes[1].offset);
  near(yellow.lanes[0].vy, -yellow.lanes[1].vy);
});

check("Crimson rank curve is finite, monotone, piecewise linear and capped", () => {
  const checkpoints = snapshot('[1,3,6,10,15,24,100000].map(rank=>progressionDamageForLevel(rank))');
  assert.deepEqual(checkpoints, [2.2, 6, 12, 20, 30, 60, 60]);
  for (const ship of ["red", "blue", "yellow"]) {
    const stats = snapshot(`Array.from({length:120},(_,i)=>[
      progressionDamageForLevel(i+1,fighterProfiles["${ship}"].damage),progressionRateForLevel(i+1,fighterProfiles["${ship}"].rate)])`);
    for (let i = 1; i < stats.length; i++) {
      assert.ok(stats[i][0] >= stats[i - 1][0] && stats[i][0] <= 60);
      assert.ok(stats[i][1] >= stats[i - 1][1] && stats[i][1] <= 12);
    }
  }
});

check("extreme pickups at late-game times stay inside the weapon budget and readable HUD", () => {
  for (const ship of ["red", "blue", "yellow"]) {
    isolated(`showScreen("battle",{fighter:"${ship}",seed:8871});battleTime=2400;
      for(let i=0;i<120;i++)for(const type of ["red","blue","yellow"])applyPowerup(type);
      momentum.remaining=10;firingStyle.mode="focus";shotCooldown=0;updateShooting(.05);`);
    const stats = snapshot('({damage:weapon.damage,rate:1/effectiveShotInterval(),lanes:weapon.lanes, tier:weapon.tier, shots:bullets.map(s=>s.damage),text:damageDisplay.textContent})');
    assert.ok(stats.damage <= 60 && stats.rate <= 12 + 1e-9 && stats.lanes <= 5 && stats.tier <= 6);
    assert.ok(stats.shots.length >= 1 && stats.shots.every(value => Number.isFinite(value) && value > 0 && value < 1000));
    assert.doesNotMatch(stats.text, /\d{4,}|10\^/);
  }
});

check("capped pickup converts into special charge without changing the firing curve", () => {
  isolated('for(let i=0;i<100;i++)applyPowerup("blue");ultimate.charges=0;ultimate.energy=0;');
  const rate = execute('weapon.interval');
  execute('applyPowerup("blue")');
  near(execute('weapon.interval'), rate);
  assert.ok(execute('ultimate.energy') > 0);
});

check("advancing a campaign floor helps low stock but never removes a stronger player loadout", () => {
  isolated();
  execute('raiseWeaponFloor(progressionPresetForBoss(7))');
  assert.ok(execute('weapon.damageLevel>=17&&weapon.speedLevel>=9&&weapon.lanes>=3'));
  execute('for(let i=0;i<100;i++)for(const type of ["red","blue","yellow"])applyPowerup(type)');
  const previous = snapshot('[weapon.damage, weapon.interval, weapon.lanes, weapon.tier]');
  execute('raiseWeaponFloor(progressionPresetForBoss(1))');
  assert.deepEqual(snapshot('[weapon.damage, weapon.interval, weapon.lanes, weapon.tier]'), previous);
});

check("Boss health retains stage-specific base values independently of elapsed time", () => {
  const health = snapshot('bossTypes.map((_,i)=>bossBalanceHealth(i))');
  assert.equal(new Set(health).size, 11);
  assert.ok(health.at(-1) > health[0] * 3);
  for (const type of [0, 2, 7, 10]) {
    const hp = [];
    for (const time of [60, 999, 120000]) {
      activeBoss(type, time);
      execute(`raiseWeaponFloor(progressionPresetForBoss(${type}));spawnBoss(${type});`);
      hp.push(execute('Math.exp(boss.healthLog)'));
    }
    near(hp[0], hp[1]); near(hp[0], hp[2]);
  }
});

check("Each fighter's own design floor yields k=1, with bounded scaling and no side effects", () => {
  for (const fighter of ["red", "blue", "yellow"]) {
    for (const type of [0, 5, 9]) {
      isolated(`sortieFighter="${fighter}";resetWeapons(false);raiseWeaponFloor(progressionPresetForBoss(${type}));spawnBoss(${type});`);
      const config = snapshot('[weapon,boss.hp,boss.baseHealth,boss.scaling,battleTime]');
      const [floor, ceiling, times] = snapshot(`[bossPowerIndex(${type},0),bossPowerIndex(${type},baselinePowerForBoss(${type})*10),
        Array.from({length:100},()=>bossPowerIndex(${type}))]`);
      assert.equal(floor, .85);
      assert.equal(ceiling, 3.2);
      assert.ok(times.every(k => k === 1));
      assert.deepEqual(snapshot('[weapon,boss.hp,boss.baseHealth,boss.scaling,battleTime]'), config);
      assert.equal(execute('Object.isFrozen(boss.scaling)'), true);
    }
  }
});

check("Boss loadout and health lock through pickups and apply once to the finale pool", () => {
  activeBoss(5);
  const initial = snapshot('[boss.hp,boss.baseHealth,boss.healthLog,boss.scaling]');
  execute('raiseWeaponFloor({damageLevel:24,rateLevel:11,laneLevel:5});');
  assert.deepEqual(snapshot('[boss.hp,boss.baseHealth,boss.healthLog,boss.scaling]'), initial);
  assert.ok(execute('sortieCombatPower() > boss.scaling.power'));
  assert.ok(execute('bossPowerIndex(5) > boss.scaling.k'));
  execute('beginBossFinale(boss);');
  near(execute('Math.exp(boss.healthLog)'), initial[1] * execute('bossFinaleStages[5].hp'));
  assert.deepEqual(snapshot('boss.scaling'), initial[3]);
  execute('spawnBoss(5);');
  const next = snapshot('[boss.baseHealth,boss.scaling]');
  assert.equal(next[1].k, 3.2);
  assert.equal(next[0], Math.round(execute('bossBalanceBodies[5]') * 3.2 ** .85));
});

check("Equipment preserves the short-action cadence floor and speeds projectiles without cutting warning or recovery", () => {
  const sample = [];
  for (const high of [false, true]) {
    isolated(`showScreen("battle",{difficulty:"veteran",seed:4225});${high
      ? "raiseWeaponFloor({damageLevel:24,rateLevel:11,laneLevel:5});"
      : "raiseWeaponFloor(progressionPresetForBoss(1));"}spawnBoss(1);
      resetBossPresentation();Object.assign(boss,bossArena(1),{phase:"recover"});
      prepareAlienAttack(boss);boss.phase="attack";
      for(const at of [0,.38,1.32]){boss.phaseTime=at;runAlienAttack(boss)}
      fan(0,4,.3,500,"shard").fire(boss);`);
    sample.push(snapshot(`({ warning: boss.telegraphDuration, recovery: alienRecoveryDuration(boss),
      interval: boss.attackInterval, speed: Math.hypot(bossProjectiles[0].vx,bossProjectiles[0].vy),
      radius: bossProjectiles[0].radius, speedMul: boss.scaling.speedMul, end: boss.attackDuration,
      required: boss.attackEndFloor })`));
  }
  const [base, upgraded] = sample;
  assert.equal(base.warning, upgraded.warning);
  assert.ok(upgraded.warning >= .9 && upgraded.recovery >= .8);
  assert.equal(base.recovery, upgraded.recovery);
  assert.equal(base.radius, upgraded.radius);
  assert.ok(upgraded.interval <= base.interval, JSON.stringify(sample));
  assert.ok(upgraded.interval >= 2.5, "The 0.9 tell + 0.8 contact + 0.8 recovery cannot be compressed by equipment");
  assert.ok(upgraded.interval >= upgraded.warning + .4);
  assert.ok(upgraded.end >= upgraded.required);
  near(upgraded.speed / base.speed, upgraded.speedMul);
});

check("Boss difficulty changes health and warning duration without changing the selected encounter", () => {
  const difficulties = [];
  for (const difficulty of ["recruit", "veteran", "abyss"]) {
    isolated(`showScreen("battle",{difficulty:"${difficulty}",seed:4225});raiseWeaponFloor(progressionPresetForBoss(2));spawnBoss(2);
      Object.assign(boss,bossArena(2),{phase:"recover"});resetBossPresentation();prepareAlienAttack(boss);`);
    difficulties.push(snapshot('[boss.type,boss.baseHealth,boss.telegraphDuration]'));
  }
  assert.ok(difficulties.every(values => values[0] === 2));
  assert.ok(difficulties[0][1] < difficulties[1][1] && difficulties[1][1] < difficulties[2][1]);
  near(difficulties[0][2] - difficulties[1][2], .3);
  assert.equal(difficulties[1][2], difficulties[2][2], "Abyss should intensify attacks without shortening the tell");
});

check("enemy durability grows through the campaign while early scouts remain easy to kill", () => {
  isolated();
  const amounts = snapshot('[0,12,65,145,420,850,15000].map(t=>enemyHealthForTime(t))');
  assert.equal(amounts[0], 1);
  assert.ok(amounts.every((value, i) => i === 0 || value >= amounts[i - 1]));
  const early = execute('enemyHealthForTime(420)');
  execute('bossDefeated=8;');
  assert.ok(execute('enemyHealthForTime(420)') > early * 2);
});

check("late armored units survive the first max rank packet and take follow-up damage", () => {
  for (const time of [160, 600, 1200]) {
    isolated(`battleTime=${time};bossDefeated=6;
      for(let i=0;i<100;i++)for(const type of ["red","blue","yellow"])applyPowerup(type);
      firingStyle.mode="focus";`);
    placeWaveTarget("armored", 330);
    fireSinglePacket();
    const afterFirst = execute('enemies[0].hp');
    assert.ok(afterFirst > 0 && afterFirst < 1);
    execute('battleTime+=.6');
    fireSinglePacket();
    assert.ok(execute('enemies[0]?.hp??0') < afterFirst);
  }
});

check("Boss burst protection allows damage and prevents one-hit wipes with endgame stock", () => {
  for (let type = 0; type < 11; type++) {
    activeBoss(type, 1200);
    execute('for(let i=0;i<50;i++)for(const type of ["red","blue","yellow"])applyPowerup(type);firingStyle.mode="focus";');
    execute('player.x=player.previousX=boss.x-330;player.y=player.previousY=boss.y;');
    const bullet = fireSinglePacket();
    assert.ok(bullet.damage < 1000);
    assert.ok(execute('boss?.hp>0.5&&boss.hp<1'), 'Boss ' + type + ' must take damage without skipping shell');
  }
});

check("a Broodmother finale keeps its own life pool and cannot be skipped by leftover hits", () => {
  activeBoss();
  execute('var shell=boss;var bodyHealth=Math.exp(boss.healthLog);boss.enraged=true;boss.enragedAt=0;boss.age=bossRules.coreMinimum;boss.hp=.0001;applyBossHit({damage:10});');
  assert.equal(execute('boss===shell&&boss.finale.mode==="egg"'), true);
  near(execute('Math.exp(boss.healthLog)/bodyHealth'), .72);
  assert.equal(execute('boss.hp'), 1);
  execute('applyBossHit({damage:999})');
  assert.equal(execute('boss.hp'), 1);
  execute('resetBossPresentation();boss.finale.age=boss.finale.transform;boss.hp=.04;applyBossHit({source:"ultimate",damage:999});');
  // Once the visible transformation ends, lethal fire really kills. There
  // is no invisible 3.5% life floor that discards an otherwise valid hit.
  assert.equal(execute('boss'), null);
});

check("support rounds keep a bounded budget while leaving ordinary fire and clearing on restart", () => {
  isolated('evolution.blast=2;onEvolutionUpgrade("blast");');
  supportFrames(1600);
  assert.equal(execute('bullets.filter(shot=>shot.auxiliary).length'), execute('evolutionWeaponRules.maxAuxiliary'));
  execute('shotCooldown=0;updateShooting(0);');
  assert.ok(execute('bullets.some(shot=>!shot.auxiliary)'));
  execute('showScreen("battle");');
  assert.equal(execute('bullets.length'), 0);
  assert.deepEqual(snapshot('[evolution.pierce,evolution.blast,evolution.aegis]'), [0, 0, 0]);
});

check("an Aegis shield preserves captured shots through pause and fullscreen-style resize", () => {
  isolated('evolution.aegis=2;shield.charges=1;requestShield();updateShield(.3);');
  shieldContacts(2);
  execute('updateEnemyProjectileDamage();');
  assert.equal(execute('evolutionWeapons.absorbed.length'), 2);
  emit(window, 'blur'); advanceFrames(12);
  near(execute('shield.remaining'), 1.7);
  surface = { width: 1024, height: 640 }; emit(window, 'resize');
  assert.equal(execute('evolutionWeapons.absorbed.length'), 2);
  assert.equal(execute('bullets.filter(shot=>shot.visual==="counter").length'), 0);
  focusAndConfirmResume(); canvas.focus(); execute('updateShield(1.7);');
  assert.equal(execute('bullets.filter(shot=>shot.visual==="counter").length'), 2);
});

process.stdout.write('\n' + checks + ' progression integration checks passed, ' + failedChecks + ' failed.\n');
if (failedChecks) process.exitCode = 1;
