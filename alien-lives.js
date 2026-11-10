const startingPlayerLives = 3;

function resetPlayerLives() {
  player.lives = startingPlayerLives;
  player.maxLives = startingPlayerLives;
}

function grantPlayerLife(extendAtFull = false) {
  const extended = extendAtFull && player.lives === player.maxLives;
  if (extended) player.maxLives++;
  player.lives = Math.min(player.maxLives, player.lives + 1);
  updateLifeDisplay();
  return extended;
}

function collectPlayerLifePowerup() {
  const extended = grantPlayerLife(true);
  const remaining = `${player.lives} / ${player.maxLives}`;
  return extended
    ? tr(`生命上限 +1 · ${remaining}`, `Life capacity +1 · ${remaining}`)
    : tr(`生命 +1 · 剩余 ${remaining}`, `Life +1 · ${remaining} remaining`);
}

function updateLifeDisplay() {
  const { lives, maxLives } = player;
  lifeDisplay.textContent = maxLives > startingPlayerLives
    ? `♥ ${lives} / ${maxLives}`
    : Array.from({ length: startingPlayerLives }, (_, index) => index < lives ? "♥" : "♡").join(" ");
  lifeDisplay.setAttribute("aria-label", tr(`生命 ${lives} / ${maxLives}`, `Lives ${lives} / ${maxLives}`));
}
