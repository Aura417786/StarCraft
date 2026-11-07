// 仅工作目录中的视觉验收页加载，正式入口不加载此文件。
let qaFrozen=false;
const qaOriginalActive=isBattleActive;
isBattleActive=function(){return !qaFrozen&&qaOriginalActive();};
const qaOriginalPauseHint=updatePauseHint;
updatePauseHint=function(){qaOriginalPauseHint();if(qaFrozen)pauseHint.hidden=true;};
function qaSetup(){
  qaFrozen=false;showScreen('battle');movementHint.hidden=true;
  enemyCooldown=powerupCooldown=nextBossTime=Infinity;
  battlefieldEvents.nextObject=battlefieldEvents.nextTransport=formationState.nextTime=Infinity;
  player.x=viewport.width*.18;player.y=viewport.height*.52;player.previousX=player.x;player.previousY=player.y;
  weapon.lanes=3;weapon.tier=2;weapon.damage=3;updateWeaponDisplay();
  shield.charges=2;ultimate.charges=2;updateShieldDisplay();updateUltimateDisplay();
  battlefieldState.titleTime=5;canvas.focus();
}
function qaShowBoss(type,duo=false){
  qaSetup();battleTime=96;
  battlefieldState.clock=(duo?4:3)*75+25;scenerySyncJourney();
  spawnBoss(type,duo?(type+1)%5:null);
  for(const target of activeBosses()){
    const arena=duo?duoArena(target.slot):bossArena();
    target.x=target.previousX=arena.x;target.y=target.previousY=arena.y;target.phase='recover';target.phaseTime=0;target.age=3;
    ensureBossComponents(target);
  }
  for(let i=0;i<9;i++){const a=Math.PI/2+i*Math.PI/8;addBossProjectile(boss.x-130+Math.cos(a)*135,boss.y+Math.sin(a)*135,0,0,{color:boss.color});}
  updateDifficultyDisplay();qaFrozen=true;
}
document.querySelectorAll('[data-qa]').forEach(button=>button.addEventListener('click',()=>{
  try{
    const key=button.dataset.qa;
    if(key==='hide'){document.querySelector('#qa-bar').style.display='none';canvas.focus();return;}
    if(key==='live'){qaFrozen=false;showScreen('battle');return;}
    if(key==='journey'){qaSetup();battlefieldState.clock=62;scenerySyncJourney();shotCooldown=Infinity;qaFrozen=false;return;}
    if(key==='break'){
      if(!boss)qaShowBoss(0);qaFrozen=false;canvas.focus();
      applyBossHit({damageLog:boss.healthLog+Math.log(.14)},boss,ensureBossComponents(boss)[0]);
      updateBossComponents(.22);qaFrozen=true;return;
    }
    if(key.startsWith('boss')){qaShowBoss(Number(key.slice(4)));return;}
    if(key==='duo'){qaShowBoss(0,true);return;}
    qaSetup();
    const sectors=['orbit','belt','wreck','citadel','rift'];
    if(sectors.includes(key)){
      battlefieldState.clock=sectors.indexOf(key)*75+25;scenerySyncJourney();
    }else if(['escort','command','pincer'].includes(key)){
      battleTime=60;trySpawnFormation(key);updateFormations(1.36);
      const group=formationState.active;
      if(group){const offset=viewport.width*.33;group.x-=offset;for(const enemy of enemies){enemy.x-=offset;enemy.previousX=enemy.x;}}
      battlefieldState.clock=100;scenerySyncJourney();
    }else if(key==='props'){
      const a=spawnBattlefieldObject('cell'),b=spawnBattlefieldObject('wreck');
      a.x=a.previousX=viewport.width*.55;a.y=a.previousY=viewport.height*.46;
      b.x=b.previousX=viewport.width*.73;b.y=b.previousY=viewport.height*.6;
    }else if(key==='transport'){
      battleTime=52;const ship=spawnSupplyTransport();
      for(const enemy of enemies){enemy.x-=viewport.width*.4;enemy.previousX=enemy.x;}
      battlefieldState.clock=175;scenerySyncJourney();
    }
    updateDifficultyDisplay();qaFrozen=true;canvas.focus();
  }catch(error){document.querySelector('#qa-error').textContent=String(error);console.error(error);}
}));
window.addEventListener('error',event=>document.querySelector('#qa-error').textContent=event.message);
