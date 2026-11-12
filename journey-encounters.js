"use strict";

// Cinematic debris uses the regular cover, damage and projectile paths. Only
// its placement and drift are scripted; it cannot ram the player's fighter.
function journeyCoverAvailable(count) {
  return battlefieldEvents.objects.length + count <= 3
    && viewport.width >= 420 && viewport.height >= 360
    && flightBounds.bottom - flightBounds.top >= Math.max(70, player.height * .88);
}
function journeyFlightY(lane) {
  return flightBounds.top + (flightBounds.bottom - flightBounds.top) * lane;
}
function journeyBeltCenter(elapsed) {
  return 0.5 + Math.sin((elapsed - 9.5) * .55) * .055;
}
function journeyCoverY(object, elapsed) {
  const age = Math.max(0, elapsed - object.journeyBirth);
  if (object.journeyType === "belt") {
    const aperture = .036 + (.5 + .5 * Math.sin(age * .9)) * .055;
    return journeyFlightY(journeyBeltCenter(elapsed) + object.journeySide * (.12 + aperture));
  }
  if (object.journeyType === "wreck") {
    const opening = Math.sin(Math.PI * clamp(age / 15, 0, 1)) ** 2;
    return journeyFlightY(.50 + object.journeySide * (.15 + opening * .15));
  }
  const fall = clamp(age / 6, 0, 1);
  return clamp(viewport.height * .5 + (flightBounds.bottom - flightBounds.top) * (.07 + .25 * fall),
    flightBounds.top, flightBounds.bottom);
}
function resizeJourneyCover(object) {
  const type = object.journeyType, span = flightBounds.bottom - flightBounds.top;
  object.width = clamp(viewport.width * (type === "belt" ? .115 : .13), 75, type === "belt" ? 172 : 188);
  object.height = Math.max(12, span * (type === "wreck" ? .37 : type === "belt" ? .29 : .22));
  object.speed = type === "belt" ? powerupRules.speed : Math.max(32, viewport.width * .031);
}
function spawnJourneyCover(type, side, elapsed, x) {
  const object = spawnBattlefieldObject("wreck", true);
  if (!object) return null;
  object.journeyType = type;
  object.journeyCover = type === "belt" ? "asteroid" : "hull";
  object.journeySide = side;
  object.journeyBirth = elapsed;
  object.x = object.previousX = x;
  object.y = object.previousY = journeyCoverY(object, elapsed);
  resizeJourneyCover(object);
  object.healthLog = progressionReferenceDpsLog(battleTime) + Math.log(type === "belt" ? 2.5 : 1.7);
  return object;
}
function spawnJourneyCoverPair(type, elapsed, x) {
  if (!journeyCoverAvailable(2)) return false;
  for (const side of [-1, 1]) spawnJourneyCover(type, side, elapsed, x);
  return true;
}
function spawnJourneyBeltPickup(elapsed) {
  if (powerups.length >= powerupRules.maxOnScreen) return false;
  const rocks = battlefieldEvents.objects.filter(object => object.journeyType === "belt");
  const radius = powerupRules.radius;
  const anchor = rocks[0];
  const x = anchor ? Math.min(viewport.width - radius, anchor.x + anchor.width * .35) : viewport.width * .80;
  const y = journeyFlightY(journeyBeltCenter(elapsed));
  powerups.push({ x, previousX: x, y, previousY: y, radius, type: "yellow", journeyBelt: true });
}
function journeyHangarPlan(bay) {
  const unit = Math.min(100, player.width * .65);
  return { kind: "hangar", centerY: bay.y, speed: enemySpeedForTime() * .74,
    slots: [
      { kind: "scout", x: 0, y: 0, leader: true },
      { kind: "scout", x: unit * .55, y: -unit * .44 },
      { kind: "scout", x: unit * .55, y: unit * .44 },
    ],
  };
}
function launchJourneyHangar(bay) {
  if (formationState.active || formationState.warning || !journeyCoverAvailable(0)) return false;
  if (!launchFormation(journeyHangarPlan(bay))) return false;
  const group = formationState.active;
  group.x = bay.x;
  for (const enemy of group.members) {
    enemy.x = enemy.previousX = group.x + enemy.formationSlotX;
    // A fighter already sitting at the hangar gets a full moment to react.
    enemy.journeyLaunchUntil = battleTime + .9;
  }
  return true;
}
function startJourneyCatapult(scene) {
  const leg = scene?.leg ?? sceneryJourney().leg;
  if (journeyState.catapultLeg === leg) return;
  journeyState.catapultLeg = leg;
  (scene ?? journeyState).catapult = 1.24;
  bossHitGrace = Math.max(bossHitGrace, 1.24);
  gameAudio.fieldCue?.("catapult", player.x, player.y);
  announceBattlefieldEvent(tr("盟军弹射轨道 · 准备接敌", "Allied catapult rail · Prepare to engage"), 3);
}
function journeyCatapultVector() {
  const launch = Math.max(journeyState.catapult, journeyState.scene?.catapult ?? 0);
  return launch > 0 ? Math.min(78, player.speed * .26) * (launch / 1.24) ** 2 : 0;
}
function drawJourneyCatapult() {
  const launch = Math.max(journeyState.catapult, journeyState.scene?.catapult ?? 0);
  if (!(launch > 0)) return;
  const t = 1 - launch / 1.24;
  const opacity = Math.min(1, launch * 2.6) * (quietCombatMotion() ? .48 : 1);
  const size = player.width, tail = player.x - size * .45;
  if (typeof drawFlightLattice === "function")
    drawFlightLattice(context, tail - t * size * .55, player.y, size * .24, player.height * (.54 + t * .5),
      "#a5e4ff", t * 7, opacity * .64);
  context.save();
  const railFront = tail + size * (.37 - t * .96);
  const railBack = railFront - size * 1.95;
  const beam = context.createLinearGradient(railBack, 0, railFront, 0);
  beam.addColorStop(0, "#07172400"); beam.addColorStop(.5, "#56b8e65c"); beam.addColorStop(1, "#b9edff");
  for (const side of [-1, 1]) {
    const y = player.y + side * player.height * (.56 + t * .4);
    const surface = context.createLinearGradient(0, y, 0, y + side * 29);
    surface.addColorStop(0, "#7692a4"); surface.addColorStop(.27, "#283b4b"); surface.addColorStop(1, "#080f18");
    context.globalAlpha = opacity * .86;
    context.fillStyle = surface;
    context.beginPath(); context.moveTo(railBack, y + side * size * .11);
    context.lineTo(railFront, y); context.lineTo(railFront - size * .13, y + side * 13);
    context.lineTo(railBack, y + side * 28); context.closePath(); context.fill();
    context.strokeStyle = beam; context.globalAlpha = opacity;
    context.lineWidth = 2.6 - t * 1.2;
    context.beginPath(); context.moveTo(railBack, y + side * size * .11);
    context.lineTo(railFront, y); context.stroke();
    for (let index = 0; index < 6; index++) {
      const x = railFront - size * (.12 + index * .23);
      const distance = (railFront - x) / (railFront - railBack);
      const z = y + side * (8 + distance * size * .11);
      context.globalAlpha = opacity * (index < 2 ? .76 : .44);
      context.fillStyle = index < 2 ? "#b5eeff" : "#527e99";
      context.fillRect(x - 9, z, 12, 2.2);
    }
  }
  context.strokeStyle = "#a6edff"; context.lineWidth = 1.4;
  for (let ring = 0; ring < 3; ring++) {
    const age = clamp(t * 1.4 - ring * .19, 0, 1);
    if (!age || age === 1) continue;
    context.globalAlpha = opacity * (1 - age) * .65;
    context.beginPath(); context.ellipse(tail - age * size, player.y, size * .075, player.height * (.3 + age), 0, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}
function journeyEncounterCue(scene, previousElapsed, key, time, retryFor, action) {
  if (previousElapsed >= time + retryFor || scene.elapsed < time || scene.events.has(key)) return;
  if (action() !== false) scene.events.add(key);
}
function updateJourneyEncounter(scene, previousElapsed) {
  if (scene.id === "belt") {
    journeyEncounterCue(scene, previousElapsed, "beltCover", 9.5, 2, () => {
      if (!spawnJourneyCoverPair("belt", scene.elapsed, viewport.width * .95)) return false;
      announceBattlefieldEvent(tr("双岩裂隙 · 击碎陨石，让飞出的碎片攻击敌机", "Rock gap · Shoot a rock to send fragments into enemy fighters"), 5);
    });
    journeyEncounterCue(scene, previousElapsed, "beltPickup", 11, 2.5, () =>
      scene.events.has("beltCover") && spawnJourneyBeltPickup(scene.elapsed));
    for (const orb of powerups) {
      if (!orb.journeyBelt) continue;
      orb.previousY = orb.y;
      orb.y = journeyFlightY(journeyBeltCenter(scene.elapsed));
    }
  } else if (scene.id === "wreck") {
    journeyEncounterCue(scene, previousElapsed, "wreckCover", 9, 2, () => {
      if (!spawnJourneyCoverPair("wreck", scene.elapsed, viewport.width * .85)) return false;
      announceBattlefieldEvent(tr("断舰残骸 · 借碎甲挡弹，等断口打开再射击", "Broken cruiser · Take cover, then fire through the opening"), 5);
    });
  } else if (scene.id === "citadel") {
    journeyEncounterCue(scene, previousElapsed, "alliedCatapult", 7.5, 1, () => startJourneyCatapult(scene));
    if (scene.catapult > 0) scene.catapult = Math.max(0, scene.catapult - (scene.elapsed - previousElapsed));
    journeyEncounterCue(scene, previousElapsed, "hangarWarning", 10.5, 0, () =>
      announceBattlefieldEvent(tr("机库开启 · 敌机即将从舰体中段出动", "Hangar opening · Hostiles about to launch from midship"), 4));
    journeyEncounterCue(scene, previousElapsed, "hangarCover", 12, 2, () =>
      journeyCoverAvailable(1) && !!spawnJourneyCover("citadel", 1, scene.elapsed, journeyCitadelBay(scene.elapsed).x));
    journeyEncounterCue(scene, previousElapsed, "hangarLaunch", 12, 2, () => {
      if (!launchJourneyHangar(journeyCitadelBay(scene.elapsed))) return false;
      announceBattlefieldEvent(tr("贴舰交火 · 借甲板挡弹，或绕开残骸截击编队",
        "Hangar sortie · Use the deck as cover, or flank the squadron"), 4);
    });
  }
  for (const object of battlefieldEvents.objects) {
    if (object.journeyType !== scene.id) continue;
    object.y = journeyCoverY(object, scene.elapsed);
  }
}
