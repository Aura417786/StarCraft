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
function journeyEncounterCue(scene, previousElapsed, key, time, retryFor, action) {
  if (previousElapsed >= time + retryFor || scene.elapsed < time || scene.events.has(key)) return;
  if (action() !== false) scene.events.add(key);
}
function updateJourneyEncounter(scene, previousElapsed) {
  if (scene.id === "belt") {
    journeyEncounterCue(scene, previousElapsed, "beltCover", 9.5, 2, () => {
      if (!spawnJourneyCoverPair("belt", scene.elapsed, viewport.width * .95)) return false;
      announceBattlefieldEvent(tr("双岩裂隙 · 瞄准缝隙里的黄球，也可以绕行", "Rock gap · Aim for the yellow pickup, or take the outside route"), 5);
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
function drawJourneyCoverRock() {
  const vertices = [[-49,-2],[-37,-23],[-13,-31],[18,-28],[43,-18],[49,1],[38,24],[13,31],[-23,27],[-42,16]];
  const paint = context.createLinearGradient(-23, -32, 20, 31);
  paint.addColorStop(0, "#a3978a"); paint.addColorStop(.32, "#59565a");
  paint.addColorStop(.63, "#383942"); paint.addColorStop(1, "#181e2c");
  context.fillStyle = paint;
  context.strokeStyle = "#a79c8e"; context.lineWidth = 1;
  context.beginPath();
  vertices.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
  context.closePath(); context.fill(); context.stroke();
  const rock = sceneryLoadForeground();
  if (rock?.ready) {
    context.save(); context.clip();
    context.globalAlpha = .52;
    context.drawImage(rock.image, -60, -45, 120, 90);
    context.restore();
  }
  context.strokeStyle = "#d8b29266"; context.lineWidth = 1.2;
  context.beginPath(); context.moveTo(-38, -16); context.lineTo(-16, -17);
  context.lineTo(-4, -9); context.lineTo(16, -12); context.lineTo(38, -5);
  context.moveTo(-21, 24); context.lineTo(-12, 9); context.lineTo(11, 5); context.lineTo(21, 8); context.stroke();
}
function drawJourneyCoverShape(object) {
  if (object.journeyCover === "asteroid") { drawJourneyCoverRock(); return; }
  context.save();
  if (object.journeyType === "wreck" && object.journeySide < 0) context.scale(1, -1);
  eventMetalShape([[-49,-15],[-38,-26],[-20,-27],[4,-32],[26,-27],[34,-21],[49,-12],[36,-6],
    [43,1],[48,10],[31,15],[22,28],[9,27],[-14,30],[-28,21],[-44,18]], "#6a737e", "#1b2331");
  const citadel = object.journeyType === "citadel";
  const texture = citadel ? loadJourneyCitadelImage() : sceneryLayer(2);
  if (texture?.ready) {
    const image = texture.image, w = image.naturalWidth, h = image.naturalHeight;
    const x = citadel ? .19 : object.journeySide < 0 ? .60 : .72;
    const y = citadel ? .39 : .11;
    context.save();
    context.clip();
    context.globalAlpha *= .85;
    context.drawImage(image, w * x, h * y, w * .22, h * .27, -50, -33, 100, 66);
    context.restore();
  }
  context.fillStyle = "#101926bb";
  context.beginPath(); context.moveTo(-36, -11); context.lineTo(13, -17);
  context.lineTo(33, -10); context.lineTo(15, -4); context.lineTo(-32, 4); context.closePath(); context.fill();
  context.strokeStyle = "#b6b7b064"; context.lineWidth = 1;
  context.beginPath(); context.moveTo(-30, 13); context.lineTo(4, 7); context.lineTo(20, 9);
  context.moveTo(-22, -22); context.lineTo(17, -25); context.lineTo(36, -15); context.stroke();
  context.fillStyle = citadel ? "#89b4c0bc" : "#c4926ac4";
  for (let i = 0; i < 4; i++) context.fillRect(-25 + i * 10, -8 - i, 2.8, 1.4);
  context.strokeStyle = citadel ? "#bccbca6a" : "#bd8b6f72";
  context.beginPath(); context.moveTo(27, -17); context.lineTo(36, -10); context.lineTo(29, -4);
  context.lineTo(39, 7); context.lineTo(28, 13); context.stroke();
  context.restore();
}
