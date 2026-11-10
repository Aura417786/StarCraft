"use strict";

const visualQualityProfiles = Object.freeze({
  low: Object.freeze({ id: "low", glow: 0, bloom: 0, modelScale: 0, meshDetail: 0, particles: 4, propScale: .49 }),
  medium: Object.freeze({ id: "medium", glow: .57, bloom: .64, modelScale: .72, meshDetail: 1, particles: 8, propScale: .67 }),
  high: Object.freeze({ id: "high", glow: 1, bloom: 1, modelScale: 1, meshDetail: 2, particles: 12, propScale: .84 }),
});
const visualQualityStorageKey = "star-breaker-render-quality";
const visualQualityControl = document.querySelector("#render-quality");
const visualQualityRoot = document.querySelector("#game-app");
let visualQuality = visualQualityProfiles.high;

function setVisualQuality(id, persist = true) {
  if (!Object.hasOwn(visualQualityProfiles, id)) return;
  visualQuality = visualQualityProfiles[id];
  if (visualQualityControl) visualQualityControl.value = id;
  if (visualQualityRoot) visualQualityRoot.dataset.quality = id;
  if (persist) try { window.localStorage.setItem(visualQualityStorageKey, id); } catch { /* Current-tab choice remains active. */ }
}

function refreshRenderQualityLanguage() {
  const label = document.querySelector("#render-quality-label");
  if (label) label.textContent = tr("画质", "Graphics");
  if (!visualQualityControl?.options) return;
  const captions = { low: tr("低", "Low"), medium: tr("中", "Medium"), high: tr("高", "High") };
  for (const option of visualQualityControl.options) option.textContent = captions[option.value];
  visualQualityControl.title = tr("调节模型细节与光效。各档位的攻击预警和碰撞范围相同。",
    "Adjust model detail and lighting. Attack warnings and hitboxes are the same at all settings.");
}

let savedVisualQuality;
try { savedVisualQuality = window.localStorage.getItem(visualQualityStorageKey); } catch { /* The default also works without storage. */ }
setVisualQuality(Object.hasOwn(visualQualityProfiles, savedVisualQuality) ? savedVisualQuality : "high", false);
refreshRenderQualityLanguage();
visualQualityControl?.addEventListener("change", () => setVisualQuality(visualQualityControl.value));
