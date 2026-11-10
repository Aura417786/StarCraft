const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "alien-lives.js"), "utf8");

function setup(language = "zh") {
  const player = {};
  const lifeDisplay = {
    setAttribute(name, value) { this[name] = value; },
  };
  const runtime = vm.createContext({
    player, lifeDisplay, tr: (zh, en) => language === "en" ? en : zh,
  });
  vm.runInContext(source, runtime);
  runtime.resetPlayerLives();
  runtime.updateLifeDisplay();
  return runtime;
}

test("A new run starts with three lives and uses hearts", () => {
  const { player, lifeDisplay, updateLifeDisplay } = setup();
  assert.deepEqual(player, { lives: 3, maxLives: 3 });
  assert.equal(lifeDisplay.textContent, "♥ ♥ ♥");
  player.lives--;
  updateLifeDisplay();
  assert.equal(lifeDisplay.textContent, "♥ ♥ ♡");
});

test("A green orb adds a life and increases capacity only at full health", () => {
  const { player, lifeDisplay, collectPlayerLifePowerup } = setup();
  player.lives = 2;
  assert.equal(collectPlayerLifePowerup(), "生命 +1 · 剩余 3 / 3");
  assert.deepEqual(player, { lives: 3, maxLives: 3 });
  assert.equal(collectPlayerLifePowerup(), "生命上限 +1 · 4 / 4");
  assert.deepEqual(player, { lives: 4, maxLives: 4 });
  assert.equal(lifeDisplay.textContent, "♥ 4 / 4");
  player.lives = 3;
  assert.equal(collectPlayerLifePowerup(), "生命 +1 · 剩余 4 / 4");
  assert.deepEqual(player, { lives: 4, maxLives: 4 });
});

test("Boss rewards restore one missing life up to the expanded capacity", () => {
  const { player, grantPlayerLife, collectPlayerLifePowerup } = setup();
  collectPlayerLifePowerup();
  grantPlayerLife();
  assert.deepEqual(player, { lives: 4, maxLives: 4 });
  player.lives = 2;
  grantPlayerLife();
  assert.deepEqual(player, { lives: 3, maxLives: 4 });
  grantPlayerLife();
  assert.deepEqual(player, { lives: 4, maxLives: 4 });
});

test("Repeated bonuses grow capacity and keep the HUD compact until restart", () => {
  const { player, lifeDisplay, collectPlayerLifePowerup, resetPlayerLives, updateLifeDisplay } = setup("en");
  assert.equal(collectPlayerLifePowerup(), "Life capacity +1 · 4 / 4");
  for (let index = 0; index < 10000; index++) collectPlayerLifePowerup();
  assert.deepEqual(player, { lives: 10004, maxLives: 10004 });
  assert.equal(lifeDisplay.textContent, "♥ 10004 / 10004");
  player.lives = 0;
  updateLifeDisplay();
  assert.equal(lifeDisplay["aria-label"], "Lives 0 / 10004");
  resetPlayerLives();
  updateLifeDisplay();
  assert.deepEqual(player, { lives: 3, maxLives: 3 });
  assert.equal(lifeDisplay.textContent, "♥ ♥ ♥");
});
