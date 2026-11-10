"use strict";

const journeyScenes = {
  orbit: { earliest: 9, quiet: [[0, 13]] },
  belt: { earliest: 14, quiet: [[7, 15]], coverSlots: 2 },
  wreck: { earliest: 14, quiet: [[7, 13]], coverSlots: 2 },
  citadel: { earliest: 14, quiet: [[6, 17], [24, 29]], coverSlots: 1 },
  rift: { earliest: 14, quiet: [] },
};
const journeySceneDuration = 30;
const journeyActionWindow = 22;
const journeySceneBeats = { belt: "beltPickup", wreck: "wreckCover", citadel: "hangarLaunch", rift: "tide" };
const journeyState = { scene: null, waiting: null, seen: new Set() };

function resetJourneyScenes() {
  journeyState.scene = null;
  journeyState.waiting = null;
  journeyState.seen.clear();
}

function journeyBlocksNewEncounters() {
  return !!(journeyState.scene || journeyState.waiting);
}

function journeyReservesCover() {
  const id = journeyState.scene?.id ?? journeyState.waiting;
  return !!journeyScenes[id]?.coverSlots;
}

function journeyReservesPickup() {
  const scene = journeyState.scene;
  return scene?.id === "belt" && scene.elapsed >= 8 && scene.elapsed <= 13.5 && !scene.events.has("beltPickup");
}

function journeyBlocksWaves() {
  const scene = journeyState.scene;
  return !!scene && journeyScenes[scene.id].quiet.some(([start, end]) =>
    scene.elapsed >= start && scene.elapsed < end);
}

function journeyBossFreeFor(seconds) {
  return !bossBlocksWaves() && battleTime + seconds < nextBossTime - bossRules.warning;
}

function journeyEarliest(location, id) {
  return location.leg >= battlefieldSectors.length ? 3 : journeyScenes[id].earliest;
}

function journeyGravityCanWarn() {
  if (journeyState.scene?.id === "rift" || journeyState.waiting === "rift") return false;
  const location = sceneryJourney();
  return battlefieldSectors[location.current].id !== "rift" || journeyState.seen.has("rift")
    || location.phase > sceneryRules.interval - journeyActionWindow
    || !journeyBossFreeFor(journeyActionWindow + Math.max(0, journeyEarliest(location, "rift") - location.phase));
}

function finishJourneyScene(scene) {
  const beat = journeySceneBeats[scene.id];
  if (!beat || scene.events.has(beat)) journeyState.seen.add(scene.id);
  journeyState.scene = null;
}

function updateJourneyScene(seconds) {
  if (!isBattleActive() || seconds <= 0) return;
  const location = sceneryJourney(battlefieldState.clock + seconds);
  journeyState.waiting = null;
  const scene = journeyState.scene;
  if (scene) {
    if (scene.leg !== location.leg || bossBlocksWaves()) {
      if (scene.elapsed + 1e-8 >= journeyActionWindow) finishJourneyScene(scene);
      else journeyState.scene = null;
      return;
    }
    scene.previousElapsed = scene.elapsed;
    scene.elapsed = Math.min(scene.duration, scene.elapsed + seconds);
    scene.progress = scene.elapsed / scene.duration;
    scene.blend = location.blend;
    if (scene.id === "rift" && scene.elapsed >= 12 && !scene.events.has("tide") && gravityTideEligible()) {
      scene.events.add("tide");
      if (!gravityTideBusy()) startGravityWarning();
    }
    if (scene.elapsed + 1e-8 >= scene.duration) finishJourneyScene(scene);
    return;
  }

  const id = battlefieldSectors[location.current].id, spec = journeyScenes[id];
  const lastStart = sceneryRules.interval - journeyActionWindow;
  if (journeyState.seen.has(id) || location.phase < journeyEarliest(location, id) || location.phase > lastStart
    || !journeyBossFreeFor(journeyActionWindow)) return;
  if (spec.coverSlots && !journeyCoverAvailable(0)) return;

  // Keep active encounters intact while waiting for a quiet slot in this leg.
  journeyState.waiting = id;
  if (formationState.warning || formationState.active || formationsBlockWaves()
    || aceBlocksWaves() || battlefieldEventBlocksWaves() || gravityTideBusy()
    || battlefieldEvents.objects.length > 3 - (spec.coverSlots ?? 0)
    || (id === "citadel" && enemies.length > enemyRules.maxOnScreen - 3)) return;

  journeyState.scene = { id, leg: location.leg, elapsed: 0, previousElapsed: 0,
    duration: journeySceneDuration, progress: 0, blend: location.blend, events: new Set() };
  journeyState.waiting = null;
}

function drawActiveJourney(layer) {
  const scene = journeyState.scene;
  if (state === "menu") return;
  if (!scene) {
    if (layer === "back" && gravityTideBusy()) {
      const elapsed = gravityTide.phase === "warning"
        ? 4 + gravityTide.elapsed / gravityRules.warning * 7.4
        : 11.4 + gravityTide.elapsed / gravityRules.duration * 12.6;
      drawJourneyScene({ id: "rift", elapsed, duration: journeySceneDuration }, layer);
    }
    return;
  }
  context.save();
  context.globalAlpha *= 1 - scene.blend;
  drawJourneyScene(scene, layer);
  context.restore();
}
