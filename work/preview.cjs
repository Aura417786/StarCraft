const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const allowed = new Map([
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ...['game.js', 'bosses.js', 'boss-art.js', 'audio.js', 'ultimate.js', 'shield.js', 'enemy-art.js', 'enemies.js', 'duo-bosses.js', 'evolution.js', 'momentum.js', 'fire-control.js', 'combat-effects.js', 'evolution-art.js'].map(name => ['/' + name, [name, 'text/javascript']]),
  ['/styles.css', ['styles.css', 'text/css']],
  ['/ship-renderer.js', ['ship-renderer.js', 'text/javascript']],
  ...['crimson', 'scout', 'armored', 'gunner'].map(kind => ['/assets/ships/' + kind + '-pbr.png', ['assets/ships/' + kind + '-pbr.png', 'image/png']]),
  ['/assets/ships/aegis-pod.png', ['assets/ships/aegis-pod.png', 'image/png']],
  ['/assets/red-fighter.png', ['assets/red-fighter.png', 'image/png']],
  ...['battlefield.js', 'battlefield-events.js', 'formations.js', 'boss-components.js'].map(name => ['/' + name, [name, 'text/javascript']]),
  ...['orbit', 'belt', 'wreck', 'citadel', 'rift', 'foreground-rock'].map(name => ['/assets/scenery/' + name + '.png', ['assets/scenery/' + name + '.png', 'image/png']]),
  ...[0,1,2,3,4].map(index => ['/assets/bosses/boss-' + index + '.png', ['assets/bosses/boss-' + index + '.png', 'image/png']]),
]);
http.createServer((req, res) => {
  const item = allowed.get(new URL(req.url, 'http://localhost').pathname);
  if (!item) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(root, item[0]), (error, content) => {
    if (error) { res.writeHead(500); res.end('Unable to open file'); return; }
    res.writeHead(200, {'Content-Type': item[1] + '; charset=utf-8', 'Cache-Control': 'no-store'});
    res.end(content);
  });
}).listen(4173, '127.0.0.1', () => process.stdout.write('Preview ready: http://127.0.0.1:4173\n'));
