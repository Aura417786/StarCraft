"use strict";

const bossScalingQaOutput = typeof location !== "undefined" && new URLSearchParams(location.search).get("qa") === "1"
  ? document.querySelector("#boss-scaling-qa") : null;
let bossScalingQaResult = null;

function captureBossScalingQaResult(target, seconds) {
  if (!bossScalingQaOutput || !target.scaling) return;
  bossScalingQaResult = { run: sortieStats, scaling: target.scaling, seconds };
}

function updateBossScalingQa() {
  if (!bossScalingQaOutput) return;
  if (state === "menu" || bossScalingQaResult?.run !== sortieStats) bossScalingQaResult = null;
  const scaling = boss?.scaling ?? bossScalingQaResult?.scaling;
  const seconds = boss?.scaling
    ? Math.max(0, battleTime - (boss.sortieStart?.time ?? battleTime))
    : bossScalingQaResult?.seconds;
  const mode = boss?.scaling ? "running" : scaling ? "cleared" : "idle";
  const line = scaling
    ? `POWER ${scaling.power.toFixed(0)} k ${scaling.k.toFixed(2)} HP×${scaling.hpMul.toFixed(2)} TEMPO÷${scaling.tempoMul.toFixed(2)} SPD×${scaling.speedMul.toFixed(2)} TTK ${seconds.toFixed(1)}s`
    : "POWER — k — HP×— TEMPO÷— SPD×— TTK —";
  if (bossScalingQaOutput.textContent !== line) bossScalingQaOutput.textContent = line;
  if (bossScalingQaOutput.dataset.state !== mode) bossScalingQaOutput.dataset.state = mode;
  bossScalingQaOutput.hidden = false;
}
