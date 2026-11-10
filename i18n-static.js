"use strict";

// Fixed copy from index.html. Runtime messages are localized where they are produced.
const gameStaticEnglish = new Map([
  ["星际突围，一款逐步开发的横向飞机射击小游戏。", "Star Breaker is a side-scrolling space shooter for desktop browsers."],
  ["星际突围 · 深渊临界", "Star Breaker · Abyssal Threshold"],
  ["深空机库 / HANGAR", "DEEP SPACE / HANGAR"],
  ["选择战机，迎战群渊。", "Choose your fighter. Face the Abyss."],
  ["选择出击战机", "Choose your fighter"],
  ["赤焰", "Crimson"],
  ["苍电", "Azure"],
  ["曜金", "Auric"],
  ["重炮", "Heavy gun"],
  ["速射", "Rapid fire"],
  ["广域", "Wide spread"],
  ["发射频率", "Fire rate"],
  ["弹道", "Lanes"],
  ["单发伤害", "Damage per shot"],
  ["方向键 / WASD 操控 · 空格大招 · V 护盾", "Arrows / WASD to move · Space for your special · V to shield"],
  ["大招状态", "Special weapon status"],
  ["横向星空战场", "Side-scrolling space battlefield"],
  ["横向星空战场。点击开始游戏后，红色战机从左侧出发。", "Side-scrolling space battlefield. Select Start Game to launch the red fighter from the left."],
  ["星际突围首页", "Star Breaker home"],
  ["星际突围", "Star Breaker"],
  ["震动：轻", "Shake: Light"],
  ["开启或关闭音效和音乐", "Toggle music and sound effects"],
  ["声音：开", "Sound: On"],
  ["⛶ 全屏", "⛶ Fullscreen"],
  ["赤焰战机 / CRIMSON", "CRIMSON FIGHTER / CRIMSON"],
  ["星际", "Star "],
  ["突围", "Breaker"],
  ["穿过行星的晨昏线，深入敌舰的阴影。", "Cross the planet’s twilight line and fly into the shadow of enemy ships."],
  ["开始游戏", "Start Game"],
  ["玩法说明", "How to Play"],
  ["方向键 / WASD 操控 · 空格贯星炮 · V 护盾", "Arrows / WASD to move · Space to fire the beam · V to shield"],
  ["精准格挡 → 3 秒内空格速蓄连携炮", "Perfect guard → Space within 3s for a faster beam charge"],
  ["Shift 切换扩散 / 聚焦 · 连击开启暴走", "Shift switches Spread / Focus · Combos trigger Overdrive"],
  ["交锋王牌 · 拆毁武装 · 截获补给", "Duel aces · Destroy weapons · Intercept supplies"],
  ["持续穿越五片星域 · 击破首领选择进化", "Cross five sectors · Defeat bosses to evolve"],
  ["战机图片加载失败，请确认 assets 文件夹完整后刷新页面。", "The fighter image failed to load. Check the assets folder and reload."],
  ["赤焰战机：流线红色涂装、深色座舱和冰蓝双引擎，机头朝右", "Crimson fighter pointing right, with a sleek red hull, dark cockpit, and twin ice-blue engines"],
  ["赤焰 · 重装突击型", "CRIMSON · HEAVY ASSAULT"],
  ["战场信息", "Battlefield information"],
  ["得分", "Score"],
  ["生命", "Lives"],
  ["3 点生命", "3 lives"],
  ["战斗时间", "Battle time"],
  ["战斗", "Battle"],
  ["当前武器强化", "Current weapon upgrades"],
  ["蓝 · 攻速", "Blue · Fire rate"],
  ["1级 · 5次/秒", "Lv. 1 · 5/s"],
  ["黄 · 弹道", "Yellow · Lanes"],
  ["1阶 · 1/4条", "Tier 1 · 1/4 lanes"],
  ["红 · 伤害", "Red · Damage"],
  ["1点/发", "1 dmg/shot"],
  ["本局战机进化", "Fighter evolutions this run"],
  ["连击与暴走状态", "Combo and Overdrive status"],
  ["连击 / COMBO", "COMBO"],
  ["最高 0", "Best 0"],
  ["下一次暴走进度", "Progress toward the next Overdrive"],
  ["再增加 20 连击进入暴走", "20 more combo to Overdrive"],
  ["Shift 切换扩散或聚焦射击", "Press Shift to switch spread or focused fire"],
  ["扩散模式 · Shift 切换", "Spread · Shift to switch"],
  ["赤焰贯星炮状态", "Crimson Beam status"],
  ["赤焰贯星炮", "Crimson Beam"],
  ["空格", "Space"],
  ["下一次大招能量", "Energy for the next beam charge"],
  ["命中敌军积能", "Hit enemies to charge"],
  ["赤焰护盾状态", "Crimson Shield status"],
  ["赤焰护盾", "Crimson Shield"],
  ["下一次护盾能量", "Energy for the next shield charge"],
  ["自动充能 · 25 秒", "Auto recharge · 25s"],
  ["敌机来袭，准备拦截", "Incoming enemy fighters"],
  ["Shift 切换扩散 / 聚焦 · 20 连击进入暴走", "Shift switches Spread / Focus · 20 combo triggers Overdrive"],
  ["空格释放大招 · V 开启护盾", "Space to fire the beam · V to shield"],
  ["蓝攻速 · 黄弹道 · 红伤害", "Blue: rate · Yellow: lanes · Red: damage"],
  ["绿生命（稀有）", "Green: life (rare)"],
  ["已暂停", "Paused"],
  ["点击战场继续战斗", "Click the battlefield to resume"],
  ["返回开始画面", "Back to Menu"],
  ["首领击破，选择战机进化", "Boss defeated. Choose an evolution."],
  ["本局效果可以叠加，每条路线最多 3 级。战斗已暂停，选好再出发。", "Evolutions stack this run, up to level 3 per path. Choose one to resume."],
  ["0级 → 1级", "Lv. 0 → 1"],
  ["破阵翼刃", "Piercing Wings"],
  ["解锁双翼副炮，主炮增伤并额外穿透一架敌机。", "Add twin wing guns. Your main gun hits harder and pierces one more enemy."],
  ["后续可解锁蓄能穿甲炮。", "Later levels unlock a charged piercing shot."],
  ["选择", "Select"],
  ["星隼僚机", "Falcon Wingman"],
  ["出动一架僚机，在侧翼自行瞄准射击。", "Deploy a wingman that automatically aims and fires from your flank."],
  ["后续可扩为双机编队，协同齐射。", "Later levels add a second wingman and coordinated volleys."],
  ["赤金壁垒", "Crimson Aegis"],
  ["护盾可吸收接触到的实体敌弹，结束时朝前反击。", "Absorb enemy projectiles and fire them back when the shield ends."],
  ["升级后吸收上限增加，护盾充能更快。", "Later levels hold more shots and recharge the shield faster."],
  ["点击选择 · 按 1 / 2 / 3 快选 · Tab 切换，Enter 确认", "Click or press 1 / 2 / 3 to select · Tab to move, Enter to confirm"],
  ["游戏结束", "Game Over"],
  ["调整航线，再次突围。", "Plot a new course and try again."],
  ["本局得分", "Run Score"],
  ["存活时间", "Time Survived"],
  ["击毁敌机", "Enemies Down"],
  ["最高连击", "Best Combo"],
  ["重新开始", "Restart"],
  ["躲开敌机碰撞 · 空格释放大招 · 返回首页可更换战机", "Avoid collisions · Space uses your special · Return to the hangar to switch fighters"],
  ["正式出击", "SORTIE"],
  ["方向键 / WASD 移动", "Arrows / WASD to move"],
  ["· 自动射击 · Shift 切换姿态 · 空格大招 · V 护盾", "· Autofire · Shift to switch fire modes · Space for beam · V for shield"],
  ["飞行手册 / FLIGHT MANUAL", "FLIGHT MANUAL"],
  ["战机自动向右开火。上下移动对准敌机，看到粉色瞄准线就换个高度躲开。", "Your fighter fires right automatically. Move up or down to aim. Change altitude when you see a pink targeting line."],
  ["飞行与按键", "Flight Controls"],
  ["方向键", "Arrows"],
  ["向四个方向移动", "Move in four directions"],
  ["切换扩散和聚焦射击", "Switch between spread and focused fire"],
  ["轻按切换扩散和聚焦射击", "Tap to switch between spread and focused fire"],
  ["护盾充好后开启，保护战机 2 秒", "Use a charge for 2 seconds of shield protection"],
  ["命中敌军积攒能量，存好一发后释放所选战机的大招", "Hit enemies to charge your fighter's special. Use it once a charge is stored."],
  ["完美护盾", "Perfect Guard"],
  ["等实体敌弹快碰到战机时按", "As a projectile approaches, press"],
  ["。开盾后 0.25 秒内挡住敌弹，即触发「完美格挡」，向前反击并返还 25% 护盾充能。", ". Block within 0.25s of shielding to counterattack and regain 25% shield charge."],
  ["若已存好一次大招，在「完美连携」出现后 3 秒内按", "With a stored special charge, press"],
  ["，蓄力缩短至 0.45 秒。", " within 3s of Perfect Link to charge in 0.45s."],
  ["战斗与升级", "Combat and Upgrades"],
  ["选一架战机出击。", "Choose your fighter. "],
  ["赤焰集中打击，苍电速射并追踪敌人，曜金用全屏弹幕清理敌群。", "Crimson delivers heavy focused hits, Azure fires rapidly and homes in, and Auric clears swarms with a screen-wide barrage."],
  ["赤焰稳住高度打穿甲重炮；苍电在中远处用追踪弹标记、连锁；曜金在近中距离铺开压制区，留意电容余量。", "Hold altitude for Crimson’s armor-piercing cannon. Azure marks and chains from a distance. Auric controls space up close, so watch your capacitor."],
  ["武器等级有上限。", "Weapon upgrades have limits. "],
  ["攻速最多每秒 12 次，弹道最多 5 条。伤害成长有上限，进化会改变战斗方式。", "Fire up to 12 times per second across 5 lanes. Damage caps as you progress, while evolutions change how you fight."],
  ["完美护盾与地形", "Perfect Guard and Terrain"],
  ["完美护盾。", "Perfect Guard. "],
  ["完美连携。", "Perfect Link. "],
  ["借地形避险。", "Use the terrain. "],
  ["残骸能挡住敌弹。击碎陨石可用碎块打敌机，进入裂隙后注意引力箭头。", "Wrecks block enemy shots. Break asteroids to send debris into enemy ships. Watch the gravity arrows in the rift."],
  ["识别精英敌机。", "Read elite enemies. "],
  ["优先击破护盾卫，先清除布雷舰留下的地雷，并给分裂体留下应对空间。", "Prioritize shield guards, shoot down mines, and leave room for splitters’ offspring."],
  ["首领与进化", "Bosses and Evolutions"],
  ["翼刃三级按住 Shift 蓄力贯穿，星隼二级按 F 指定集火，壁垒三级完美格挡返还大招积能。三条路线可混搭，只能装配一个三级专精。", "Hold Shift to charge a piercing shot at Wings III. Press F to mark a Falcon target at Falcon II. Aegis III turns Perfect Guards into special charge. Mix paths and equip one rank III specialty."],
  ["回机库挑战。", "Return to the hangar. "],
  ["战役首领解锁单首领练习并提供改装点，也能在挑战中参加首领连战和每日挑战。", "Campaign bosses unlock practice and award refit points. Open Challenges for Boss Rush and Daily Challenge."],
  ["躲开敌机和敌弹。", "Dodge enemies and shots. "],
  ["撞机或中弹会扣生命，打不到的敌机可以放过去。", "Collisions and hits cost a life. You can let enemies fly past."],
  ["留意第二次锁定。", "Watch for the second lock. "],
  ["虚线和圆圈标出锁定的路线或位置。躲过第一击后，等追击锁定再换位。", "Dashed lines and circles mark targeted paths and positions. Dodge the first shot, then move again once the follow-up locks on."],
  ["射中能量球升级。", "Shoot orbs to upgrade. "],
  ["蓝球提攻速", "Blue raises fire rate"],
  ["黄球加弹道", "yellow adds lanes"],
  ["红球加伤害", "red adds damage"],
  ["绿球回生命，满血时加生命上限", "green restores a life and increases capacity at full health"],
  ["、", ", "],
  ["。", "."],
  ["弹道超过四条时晋阶。", "Rank up past four lanes. "],
  ["原四条的总伤害合到一条高阶弹道，再额外提高 8%。", "Four lanes merge into one stronger lane with 8% bonus damage."],
  ["击败前十只异形后可进化。", "Evolve after each of the first ten victories. "],
  ["依序击败十只异形与最终合体。", "Defeat ten aliens in order, then face their fusion. "],
  ["看见标记先离开危险区。减速时仍能移动和开盾。群渊合生体会用一招限制路线，再用另一招追击。", "Leave marked danger zones early. You can still move and shield while slowed. The Abyssal Confluence uses one move to limit your route and another to follow up."],
  ["看懂破壳和反击。", "Read the rupture and counterattack. "],
  ["首领过半血后会破壳并准备专属连招。先照提示避开危险，核心暴露时再集中开火。", "Around half health, the boss ruptures and prepares its signature combination. Follow the warnings, then focus fire while the core is exposed."],
  ["留意首领终局。", "Watch for the boss finale. "],
  ["本体血条耗尽后，首领会改变形态和战斗规则。看上方提示，完成终局才能领取奖励。渊潮母体会蜷成蛋并释放压力波。", "When the main health bar runs out, the boss changes form and rules. Read the prompt and finish this stage to earn the reward. The Broodmother curls into an egg and releases pressure waves."],
  ["破阵翼刃加装翼炮，星隼僚机自动攻击，赤金壁垒吸收敌弹再反击。路线可混搭，每条最多 3 级，三条满级后解锁联动。", "Piercing Wings adds wing guns. Falcon Wingman attacks on its own. Crimson Aegis absorbs and returns shots. Mix paths up to level 3. Max all three to unlock synergies."],
  ["明白了", "Got it"],
  ["暂停", "Pause"],
  ["返回机库", "Return to hangar"],
  ["继续战斗", "Resume combat"],
  ["设置", "Settings"],
  ["返回暂停菜单", "Back to pause menu"],
  ["画质", "Graphics"],
  ["暂停或继续战斗", "Pause or resume combat"],
  ["开始画面已就绪。", "Ready to start."],
]);

let gameStaticEntries;

function gameStaticTranslation(value) {
  const key = value.trim();
  const translated = gameStaticEnglish.get(key);
  return translated === undefined ? null : value.replace(key, () => translated);
}

function captureGameStaticLanguage() {
  const entries = [];
  const walker = document.createTreeWalker(document.documentElement, 4); // SHOW_TEXT
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest("script, style")) continue;
    const english = gameStaticTranslation(node.data);
    if (english !== null) entries.push({ node, original: node.data, english });
  }
  for (const element of document.querySelectorAll('[aria-label], [title], [alt], meta[name="description"]')) {
    for (const name of ["aria-label", "title", "alt", "content"]) {
      const original = element.getAttribute(name);
      if (original === null) continue;
      const english = gameStaticTranslation(original);
      if (english !== null) entries.push({ node: element, name, original, english });
    }
  }
  return entries;
}

function applyGameStaticLanguage() {
  if (!document.documentElement || typeof document.createTreeWalker !== "function") return;
  gameStaticEntries ??= captureGameStaticLanguage();
  document.documentElement.lang = gameLanguage;
  for (const { node, name, original, english } of gameStaticEntries) {
    if (!node.isConnected) continue;
    const current = name ? node.getAttribute(name) : node.data;
    if (current !== original && current !== english) continue;
    const next = tr(original, english);
    if (name) node.setAttribute(name, next);
    else node.data = next;
  }
  const button = document.querySelector("#language-button");
  if (button) {
    button.textContent = tr("English", "Chinese");
    button.setAttribute("aria-label", tr("切换游戏语言为英文", "Switch game language to Chinese"));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const button = document.querySelector("#language-button");
  if (!button) return;
  applyGameStaticLanguage();
  if (typeof refreshGameLanguage === "function") refreshGameLanguage();
  button.addEventListener("click", () => setGameLanguage(tr("en", "zh-CN")));
}, { once: true });
