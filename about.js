"use strict";

const feedbackForm = document.querySelector("#feedback-form");
const copyStatus = document.querySelector("#copy-status");
const copyFallback = document.querySelector("#copy-fallback");

feedbackForm.addEventListener("submit", async event => {
  event.preventDefault();
  const questions = [
    ["第一次死亡发生在哪里？", document.querySelector("#first-death").value.trim()],
    ["哪个瞬间让你觉得最爽？", document.querySelector("#best-moment").value.trim()],
    ["你想继续，还是想退出？为什么？", document.querySelector("#leave-reason").value.trim()],
  ];
  const feedback = "《星际突围》试玩反馈\n\n" + questions.map(([question, answer], index) =>
    `${index + 1}. ${question}\n${answer || "（待填写）"}`
  ).join("\n\n");

  try {
    await navigator.clipboard.writeText(feedback);
    copyFallback.hidden = true;
    copyStatus.textContent = "反馈文字已复制。请粘贴发给邀请你试玩的人。";
  } catch {
    copyFallback.value = feedback;
    copyFallback.hidden = false;
    copyFallback.focus();
    copyFallback.select();
    copyStatus.textContent = "浏览器未允许自动复制。请手动复制下方已选中的文字。";
  }
});
