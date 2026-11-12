"use strict";

window.campaignOpening = (() => {
  if (typeof window.HTMLDialogElement?.prototype.showModal !== "function") return null;
  const qa = new URLSearchParams(window.location.search).get("qa") === "1";
  const images = {};
  let dialog, stage, ctx, subtitle, speaker, line, pauseButton, finishButton, timeDisplay, progress;
  let session = null;
  const isEnglish = () => document.documentElement.lang === "en";

  function loadImages() {
    for (const [name, src] of Object.entries(openingImages)) {
      if (images[name]) continue;
      const image = new Image();
      image.decoding = "async";
      image.src = src;
      images[name] = image;
    }
  }

  function mount() {
    if (dialog) return true;
    const app = document.getElementById("game-app");
    if (!app) return false;
    dialog = document.createElement("dialog");
    dialog.id = "campaign-opening";
    dialog.className = "campaign-opening";
    dialog.setAttribute("aria-labelledby", "opening-dialog-title");
    dialog.innerHTML = `
      <canvas class="opening-stage" aria-hidden="true"></canvas>
      <div class="opening-scrim" aria-hidden="true"></div>
      <div class="opening-top">
        <h2 id="opening-dialog-title"></h2>
        <time class="opening-time"></time>
      </div>
      <div class="opening-subtitle" hidden aria-live="polite">
        <span class="opening-speaker"></span>
        <p class="opening-line"></p>
      </div>
      <footer class="opening-controls">
        <progress class="opening-progress" value="0" max="${openingDuration}"></progress>
        <div class="opening-actions">
          <button type="button" class="opening-pause"></button>
          <button type="button" class="opening-finish"></button>
        </div>
      </footer>`;
    stage = dialog.querySelector(".opening-stage");
    ctx = stage.getContext("2d", { alpha: false });
    if (!ctx) { dialog = undefined; return false; }
    subtitle = dialog.querySelector(".opening-subtitle");
    speaker = dialog.querySelector(".opening-speaker");
    line = dialog.querySelector(".opening-line");
    pauseButton = dialog.querySelector(".opening-pause");
    finishButton = dialog.querySelector(".opening-finish");
    timeDisplay = dialog.querySelector(".opening-time");
    progress = dialog.querySelector(".opening-progress");
    pauseButton.addEventListener("click", togglePause);
    finishButton.addEventListener("click", requestExit);
    dialog.addEventListener("cancel", event => { event.preventDefault(); requestExit(); });
    dialog.addEventListener("close", () => { if (!dialog.open) requestExit(); });
    app.append(dialog);
    document.addEventListener("visibilitychange", syncVisibility);
    return true;
  }

  function formatTime(t) {
    const seconds = Math.floor(t);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function syncDialogue(force = false) {
    const { seconds, language } = session;
    const cue = openingDialogue.find(entry => entry[0] <= seconds && seconds < entry[1]);
    if (force || session.cue !== cue) {
      session.cue = cue;
      subtitle.hidden = !cue;
      if (cue) {
        speaker.textContent = cue[language ? 3 : 2];
        line.textContent = cue[language ? 5 : 4];
      }
    }
    const now = Math.floor(seconds);
    if (session.shownTime !== now || force) {
      session.shownTime = now;
      timeDisplay.textContent = `${formatTime(seconds)} / ${formatTime(openingDuration)}`;
      progress.value = now;
    }
  }

  function refreshLanguage() {
    if (!session) return;
    const en = isEnglish();
    session.language = en;
    dialog.querySelector("#opening-dialog-title").textContent = en ? "Prologue · Dark Forest" : "序章 · 黑暗森林";
    pauseButton.textContent = session.paused ? (en ? "Resume" : "继续") : (en ? "Pause" : "暂停");
    finishButton.textContent = session.launch ? (en ? "Skip prologue" : "跳过序章") : (en ? "Back to hangar" : "返回机库");
    progress.setAttribute("aria-label", en ? "Prologue progress" : "序章进度");
    syncDialogue(true);
  }

  function togglePause() {
    if (!session) return;
    session.paused = !session.paused;
    session.previous = 0;
    dialog.toggleAttribute("data-paused", session.paused);
    if (session.paused) session.score?.suspend();
    else session.score?.resume();
    refreshLanguage();
  }

  function requestExit() {
    if (session) finish(session.launch ? "skip" : "cancel");
  }

  function render() {
    const box = dialog.getBoundingClientRect();
    const ratio = Math.min(1.5, devicePixelRatio || 1, 2000 / Math.max(1, box.width), 1160 / Math.max(1, box.height));
    const w = Math.max(1, Math.round(box.width * ratio)), h = Math.max(1, Math.round(box.height * ratio));
    if (stage.width !== w || stage.height !== h) { stage.width = w; stage.height = h; }
    drawOpeningArt(ctx, session, w, h);
    syncDialogue();
  }

  function loop(timestamp) {
    if (!session) return;
    const seconds = session.previous ? Math.min(.10, (timestamp - session.previous) / 1000) : 0;
    session.previous = timestamp;
    const suspended = session.paused || document.hidden;
    if (!suspended) {
      // Allow the first image to decode without stealing time from the story.
      if (images.earth.naturalWidth || timestamp - session.began > 1600) session.seconds = Math.min(openingDuration, session.seconds + seconds);
      session.score?.tick(session.seconds);
    }
    if (!suspended || stage.clientWidth !== session.clientWidth || stage.clientHeight !== session.clientHeight) {
      session.clientWidth = stage.clientWidth;
      session.clientHeight = stage.clientHeight;
      render();
    }
    if (session.seconds >= openingDuration) finish("completed");
    else session.raf = requestAnimationFrame(loop);
  }

  function finish(reason) {
    if (!session) return;
    const ending = session;
    session = null;
    cancelAnimationFrame(ending.raf);
    ending.score?.dispose();
    const blend = ending.launch && reason === "completed";
    if (blend) {
      const frame = document.createElement("canvas");
      frame.className = "opening-handoff";
      frame.setAttribute("aria-hidden", "true");
      frame.width = stage.width; frame.height = stage.height;
      frame.getContext("2d")?.drawImage(stage, 0, 0);
      dialog.parentElement.append(frame);
      const transition = frame.animate([{ opacity: 1 }, { opacity: 0 }],
        { duration: ending.quiet ? 260 : 480, easing: "cubic-bezier(.28,.48,.54,1)", fill: "forwards" });
      transition.finished.then(() => frame.remove(), () => frame.remove());
    }
    if (dialog.open) dialog.close();
    dialog.removeAttribute("data-paused");
    ending.onFinish(reason);
    if (!ending.launch && ending.focus?.isConnected) ending.focus.focus({ preventScroll: true });
  }

  function syncVisibility() {
    if (!session) return;
    session.previous = 0;
    if (document.hidden) session.score?.suspend();
    else if (!session.paused) session.score?.resume();
  }

  const api = {
    get active() { return session !== null; },
    refreshLanguage,
    play({ fighter, launch, quiet, muted, onFinish, layout }) {
      if (session || !mount()) return false;
      loadImages();
      const calm = quiet || matchMedia("(prefers-reduced-motion: reduce)").matches
        || dialog.parentElement.hasAttribute("data-reduce-motion");
      session = {
        fighter: Object.hasOwn(openingPalette, fighter) ? fighter : "red", launch, quiet: calm,
        onFinish, layout, images, seconds: 0, previous: 0, began: performance.now(), focus: document.activeElement,
        score: createOpeningScore(muted),
      };
      dialog.toggleAttribute("data-quiet", calm);
      dialog.showModal();
      refreshLanguage();
      finishButton.focus({ preventScroll: true });
      session.score?.resume();
      render();
      session.raf = requestAnimationFrame(loop);
      return true;
    },
  };
  if (qa) {
    api.seekForQa = (seconds) => {
      if (!session || !Number.isFinite(seconds)) return false;
      session.seconds = openingClamp(seconds, 0, openingDuration);
      session.previous = 0;
      render();
      if (session.seconds >= openingDuration) finish("completed");
      return true;
    };
    api.inspectForQa = () => session && ({
      seconds: session.seconds, duration: openingDuration, quiet: session.quiet,
      paused: Boolean(session.paused), fighter: session.fighter,
      cut: openingCuts.findLast(cut => cut.start <= session.seconds)?.art,
      loadedPlates: Object.keys(session.images).filter(key => session.images[key].naturalWidth),
    });
  }
  return api;
})();
