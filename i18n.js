"use strict";

const gameLanguageKey = "star-breaker-language";
let gameLanguage = "zh-CN";
try {
  if (document.querySelector("#language-button") && window.localStorage.getItem(gameLanguageKey) === "en") gameLanguage = "en";
} catch { /* Browser storage can be unavailable in embedded or local play. */ }

function tr(chinese, english) { return gameLanguage === "en" ? english : chinese; }

function setGameLanguage(language) {
  if ((language !== "en" && language !== "zh-CN") || language === gameLanguage) return;
  gameLanguage = language;
  try { window.localStorage.setItem(gameLanguageKey, gameLanguage); } catch { /* Keep the current tab's choice. */ }
  if (typeof applyGameStaticLanguage === "function") applyGameStaticLanguage();
  if (typeof refreshRenderQualityLanguage === "function") refreshRenderQualityLanguage();
  if (typeof refreshGameLanguage === "function") refreshGameLanguage();
}
