"use strict";

// Presentation only. All positions, extents and lifetimes come from the live
// ultimate/shield objects; no random calls, gameplay clocks or damage here.
const PlayerVfx = (() => {
  const tau = Math.PI * 2;
  const palette = {red:[255,77,47],blue:[71,183,249],yellow:[250,190,66]};
  const rgba=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const detail=()=>quietCombatMotion()?0:visualQuality.meshDetail;

  function arc(ctx,x,y,rx,ry,a,b,color,width=1) {
    if(rx<=0||ry<=0)return;
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,a,b);ctx.stroke();
  }
  const chargeStamps = new Map();

  function chargeStamp(kind, seed) {
    const key = `${kind}:${seed}`;
    if (chargeStamps.has(key)) return chargeStamps.get(key);
    const size = 96;
    const stamp = document.createElement('canvas');
    stamp.width = stamp.height = size;
    const paint = stamp.getContext('2d');
    const image = paint.createImageData(size, size);
    const blue = kind === 'blue';
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const x = 2 * (col + .5) / size - 1;
        const y = 2 * (row + .5) / size - 1;
        const r = Math.hypot(x, y), angle = Math.atan2(y, x);
        const curl = 3 * angle + r * 14 + seed * 2.71;
        const folds = .54 + .29 * Math.sin(curl + Math.sin(y * 7) * 1.4)
          + .17 * Math.sin(x * 21 + y * 19 + Math.sin(curl));
        const patch = Math.pow(Math.max(0, 1 - r), 1.3) * Math.pow(Math.max(0, folds), .75);
        const heat = Math.pow(patch, 1.17);
        const pixel = (row * size + col) * 4;
        image.data[pixel] = blue ? 22 + 179 * heat : 120 + 135 * heat;
        image.data[pixel + 1] = blue ? 89 + 165 * heat : 22 + 196 * heat;
        image.data[pixel + 2] = blue ? 194 + 61 * heat : 15 + 95 * heat;
        image.data[pixel + 3] = 232 * patch;
      }
    }
    paint.putImageData(image, 0, 0);
    chargeStamps.set(key, stamp);
    return stamp;
  }

  function drawChargePlasma(ctx, kind, muzzle, progress, age, linked) {
    const cyan = kind === 'blue';
    const tier = detail();
    const time = tier ? age : 0;
    const heat = .14 + .86 * Math.sin(progress * Math.PI / 2);
    const squeeze = 1 - .32 * Math.max(0, progress - .79) / .21;
    const r = (9 + 28 * heat) * squeeze;
    const color = cyan ? '#6cdaff' : '#ff8653';
    ctx.save();
    ctx.translate(muzzle.x - 4, muzzle.y);

    // Hot material builds just inside the collector; the haze never hides the hull.
    ctx.globalAlpha = .25 + heat * .42;
    for (let i = 0; i < 3; i++) {
      const angle = i * tau / 3 + time * (i % 2 ? -2.3 : 1.9);
      const extent = r * (1.82 + i * .33);
      ctx.save();
      ctx.translate(Math.cos(angle) * r * .32, Math.sin(angle) * r * .37);
      ctx.rotate(angle);
      ctx.drawImage(chargeStamp(kind, i), -extent, -extent * .66, 2 * extent, extent * 1.32);
      ctx.restore();
    }

    ctx.globalAlpha = .54 + .44 * heat;
    ctx.save();
    ctx.scale(.85, 1);
    const body = ctx.createRadialGradient(-r * .21, -r * .27, 0, 0, 0, r);
    body.addColorStop(0, cyan ? '#d7f8ff' : '#fff0b5');
    body.addColorStop(.16, cyan ? '#79d5ff' : '#ffb275');
    body.addColorStop(.37, cyan ? '#296fbf' : '#e9532e');
    body.addColorStop(.69, cyan ? '#162c5a9a' : '#71253b90');
    body.addColorStop(1, cyan ? '#15255e00' : '#71253b00');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, tau); ctx.fill();
    ctx.restore();

    if (tier) {
      const count = tier === 2 ? 42 : 22;
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < count; i++) {
        const u = (time * (1.28 + i % 4 * .21) + i * .217) % 1;
        const theta = i * 2.39996 + u * (i % 2 ? 1.64 : -1.25);
        const drift = r * (.23 + 1.53 * (1 - u) ** 1.7);
        const y = Math.sin(theta) * drift, x = Math.cos(theta) * drift * .74 - 9 * (1 - u);
        const streak = 3 + 9 * (1 - u);
        ctx.globalAlpha = Math.sin(u * Math.PI) * (.35 + .59 * heat);
        ctx.strokeStyle = i % 5 === 0 ? '#eaffff' : color;
        ctx.lineWidth = i % 3 === 0 ? 1.6 : .85;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - Math.sin(theta) * streak * .48, y + Math.cos(theta) * streak * .55,
          x + Math.cos(theta) * streak * .62 - Math.sin(theta) * streak, y + Math.sin(theta) * streak * .63 + Math.cos(theta) * streak);
        ctx.stroke();
      }
    }
    if (linked) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = .48;
      arc(ctx, 0, 0, r * .88, r * 1.07, -.72, .88, '#91eaff', 1.25);
    }
    ctx.restore();
  }
  function charge(ctx, id, m, progress, age, linked) {
    if (id !== 'yellow') return drawChargePlasma(ctx, id, m, progress, age, linked);
    const color = palette[id], time = detail() ? age : 0, radius = 9 + progress * 31;
    ctx.save(); ctx.translate(m.x, m.y);
    const opening = (1 - progress) * .85 + .3;
    for (let i = 0; i < 6; i++) {
      const angle = i * tau / 6 + time * .35, distance = radius * opening;
      ctx.save();
      ctx.translate(Math.cos(angle) * distance * .45, Math.sin(angle) * distance);
      ctx.rotate(angle);
      ctx.fillStyle = rgba(color, .18 + progress * .26);
      ctx.strokeStyle = rgba(color, .75); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-4, -9); ctx.lineTo(4, -6); ctx.lineTo(6, 7); ctx.lineTo(-4, 9);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    arc(ctx, 0, 0, radius * .6, radius, 0, tau, rgba(color, .24 + progress * .5), 1.5);
    if (linked) arc(ctx, 0, 0, radius * .8, radius * 1.22, 0, tau, '#c0efffa0', 1.2);
    ctx.restore();
  }
  let beamPlasmaStrip, beamCoronaStamps;

  function beamHash(x, y, salt) {
    let n = Math.imul(x + 137, 2246822519) ^ Math.imul(y + 173, 3266489917) ^ salt;
    n = Math.imul(n ^ n >>> 13, 668265263);
    return ((n ^ n >>> 16) >>> 0) / 4294967295;
  }

  function beamNoise(x, y, period, salt) {
    const i = Math.floor(x), j = Math.floor(y);
    const tx = x - i, ty = y - j;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = (i % period + period) % period, b = (a + 1) % period;
    const lo = beamHash(a, j, salt) * (1 - sx) + beamHash(b, j, salt) * sx;
    const hi = beamHash(a, j + 1, salt) * (1 - sx) + beamHash(b, j + 1, salt) * sx;
    return lo * (1 - sy) + hi * sy;
  }

  function beamTexture() {
    if (beamPlasmaStrip) return beamPlasmaStrip;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const paint = canvas.getContext("2d");
    const pixels = paint.createImageData(canvas.width, canvas.height);
    for (let py = 0; py < canvas.height; py++) {
      const v = (py + .5) / canvas.height * 2 - 1;
      for (let px = 0; px < canvas.width; px++) {
        const u = px / canvas.width;
        const broad = beamNoise(u * 11, v * 3.1, 11, 41);
        const warp = (broad - .5) * .33;
        const curl = v + warp + (beamNoise(u * 22, v * 5.4, 22, 63) - .5) * .12;
        const web = beamNoise(u * 14 + v * .83, curl * 13, 14, 87);
        const turbulent = beamNoise(u * 37 - curl * 2.9, curl * 24, 37, 24);
        const vents = Math.pow(Math.max(0, (web * .65 + turbulent * .35 - .27) * 1.45), 1.65);
        const center = v - (broad - .5) * .23;
        const fine = Math.pow(Math.max(0, 1 - Math.abs(center) * 3.25), 2.2);
        const mantle = Math.pow(Math.max(0, 1 - Math.abs(curl)), 1.25);
        const rim = Math.pow(Math.max(0, 1 - Math.abs(v)), .77);
        const radiance = .48 * mantle + .52 * vents + .77 * fine;
        const travel = Math.max(0, .12 + radiance + .055 * Math.sin(u * tau * 19 + v * 14));
        const k = 4 * (py * canvas.width + px);
        pixels.data[k] = Math.min(255, 122 + 173 * travel);
        pixels.data[k + 1] = Math.min(248, 21 + 141 * travel ** 1.4 + 76 * fine);
        pixels.data[k + 2] = Math.min(226, 24 + 24 * travel + 164 * fine);
        pixels.data[k + 3] = Math.min(255, rim * (72 + 142 * travel + 100 * fine)
          * (v > 0 ? .93 - .24 * v : 1));
      }
    }
    paint.putImageData(pixels, 0, 0);
    beamPlasmaStrip = canvas;
    return canvas;
  }

  function beamStamps() {
    if (beamCoronaStamps) return beamCoronaStamps;
    beamCoronaStamps = Array.from({ length: 4 }, (_, stamp) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 80;
      const paint = canvas.getContext("2d");
      const pixels = paint.createImageData(80, 80);
      for (let py = 0; py < 80; py++) for (let px = 0; px < 80; px++) {
        const u = (px + .5) / 40 - 1, v = (py + .5) / 40 - 1;
        const shape = beamNoise(u * 2.4, v * 2.4, 240, 12 + stamp * 117);
        const glint = beamNoise(u * 8.4, v * 8.4, 240, 57 + stamp * 61);
        const d = Math.hypot(u + (shape - .5) * .32, v);
        const edge = Math.max(0, 1 - Math.hypot(u, v));
        const density = Math.max(0, 1 - d) * (.38 + .62 * glint);
        const hot = Math.min(1, density * 2.35);
        const k = 4 * (py * 80 + px);
        pixels.data[k] = 72 + 181 * hot;
        pixels.data[k + 1] = 11 + 123 * hot * hot;
        pixels.data[k + 2] = 22 + 38 * hot;
        pixels.data[k + 3] = 245 * density * Math.sqrt(edge);
      }
      paint.putImageData(pixels, 0, 0);
      return canvas;
    });
    return beamCoronaStamps;
  }

  function beamFlash(ctx, x, y, rx, ry, opacity, linked = false) {
    if (rx <= 0 || ry <= 0 || opacity <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const glow = ctx.createRadialGradient(-.07, -.07, .01, 0, 0, 1);
    glow.addColorStop(0, "#fff8df");
    glow.addColorStop(.14, "#ffd6a0");
    glow.addColorStop(.31, linked ? "#d4f1ffc9" : "#ff812bcc");
    glow.addColorStop(.61, "#ef361458");
    glow.addColorStop(1, "#b4192300");
    ctx.globalAlpha *= opacity;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, tau);
    ctx.fill();
    ctx.restore();
  }

  const crimsonResidueLifetime = .46;
  function drawCrimsonResidue(ctx, shot, age) {
    const quiet = quietCombatMotion(), tier = detail(), radius = shot.radius;
    for (const [index, hit] of (shot.contacts ?? []).entries()) {
      const elapsed = age - hit.time;
      if (elapsed < 0 || elapsed >= crimsonResidueLifetime) continue;
      const life = elapsed / crimsonResidueLifetime;
      const expansion = quiet ? .38 : Math.sqrt(life);
      const scale = radius * (.69 + expansion * .84);
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      beamFlash(ctx, hit.x, hit.y, scale * .95, scale * 1.47, (1 - life) ** 2.7, shot.linked);
      if (tier) {
        const stamps = beamStamps();
        for (let k = 0; k < 4 + tier * 2; k++) {
          const seed = beamHash(k, index, 524);
          const angle = (k + seed) * 2.39996;
          const depth = .58 + beamHash(k, index, 223) * .88;
          const travel = expansion * radius * 2.15 * depth;
          const size = radius * (.40 + .58 * depth + expansion * .79);
          const x = hit.x + Math.cos(angle) * travel * .72 + expansion * radius * .36;
          const y = hit.y + Math.sin(angle) * travel;
          ctx.globalAlpha = Math.sin(Math.PI * life) * (1 - life) * .88;
          ctx.drawImage(stamps[k % stamps.length], x - size, y - size * .58, size * 2, size * 1.16);
        }
      }
      ctx.globalCompositeOperation = "screen";
      for (let k = 0; k < (quiet ? 3 : 7 + tier * 5); k++) {
        const seed = beamHash(k, index, 883), angle = 6.28319 * seed;
        const velocity = radius * (1.05 + 2.3 * beamHash(k, index, 76));
        const distance = 2 + velocity * expansion;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const x = hit.x + dx * distance * .91, y = hit.y + dy * distance;
        const length = (4 + seed * 14) * (1 - life) ** .63;
        ctx.globalAlpha = (1 - life) ** 1.8 * (.46 + seed * .52);
        ctx.strokeStyle = seed > .66 ? "#fff1c6" : seed > .29 ? "#ff9b45" : "#f44429";
        ctx.lineWidth = .65 + seed * 1.35;
        ctx.beginPath();
        ctx.moveTo(x - dx * length, y - dy * length);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function crimson(ctx, shot, age) {
    const radius = shot.radius, y = shot.y;
    const actualTail = shot.x - shot.length;
    const left = Math.max(actualTail, shot.startX);
    const right = Math.min(shot.x, viewport.width + radius);
    const length = right - left;
    const quiet = quietCombatMotion(), tier = detail(), time = quiet ? 0 : age;
    if (length > .5 && radius > 0) {
      const section = Math.max(2, Math.ceil(length / (tier ? 11 : 20)));
      const shape = x => {
        const head = clamp((shot.x - x) / (radius * 1.36), 0, 1) ** .63;
        const tail = clamp((x - actualTail) / (radius * 5.4), 0, 1) ** .69;
        const nozzle = shot.startX > actualTail
          ? .2 + .8 * clamp((x - shot.startX) / (radius * 1.9), 0, 1) : 1;
        const phase = x * .045 - time * 43;
        const liquid = .79 + .095 * Math.sin(phase) + .075 * Math.sin(phase * 1.97 + .75);
        const shift = radius * .105 * Math.sin(phase * .62 + .9) * head * tail;
        const half = radius * nozzle * Math.max(.05, head * tail) * liquid;
        return [y + shift - half * (1.06 + .09 * Math.cos(phase * 1.6)),
          y + shift + half * (.96 + .07 * Math.sin(phase * 1.5 - .9))];
      };
      const rail = Array.from({ length: section + 1 }, (_, i) => {
        const x = left + i / section * length;
        return [x, ...shape(x)];
      });
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      if (!quiet && tier) {
        const stamps = beamStamps();
        for (let k = 0; k < 12 + tier * 8; k++) {
          const offset = beamHash(k, 0, 713), depth = beamHash(k, 1, 89);
          const u = (offset + time * (1.08 + depth * .42)) % 1;
          const x = left + u * length;
          const [top, bottom] = shape(x);
          const flank = k % 2 ? top : bottom;
          const py = flank + (k % 2 ? -1 : 1) * depth * radius * .18;
          const w = radius * (.68 + depth * 1.43), h = radius * (.25 + depth * .37);
          ctx.globalAlpha = (.25 + depth * .51) * Math.sin(Math.PI * u);
          ctx.drawImage(stamps[k % stamps.length], x - w * .63, py - h, w * 1.63, h * 2);
        }
      }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(rail[0][0], rail[0][1]);
      for (const [x, top] of rail) ctx.lineTo(x, top);
      for (let i = rail.length - 1; i >= 0; i--) ctx.lineTo(rail[i][0], rail[i][2]);
      ctx.closePath();
      ctx.clip();
      const material = beamTexture();
      const span = 340, speed = 930;
      const offset = (time * speed) % span;
      const depth = radius * 2.15;
      for (let x = left + offset - span; x < right; x += span) {
        ctx.drawImage(material, x, y - depth * .5, span, depth);
      }
      const hotCore = ctx.createLinearGradient(0, y - radius * .46, 0, y + radius * .46);
      hotCore.addColorStop(0, "#ff752900");
      hotCore.addColorStop(.28, "#ff76354e");
      hotCore.addColorStop(.43, "#ffb47594");
      hotCore.addColorStop(.51, "#fff2cebe");
      hotCore.addColorStop(.59, "#ffb07482");
      hotCore.addColorStop(.74, "#ff67142c");
      hotCore.addColorStop(1, "#d82c1600");
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = hotCore;
      ctx.fillRect(left, y - radius * .46, length, radius * .92);
      ctx.restore();
      if (!quiet) {
        const sparkCount = tier ? 15 + tier * 13 : 7;
        ctx.globalCompositeOperation = "screen";
        for (let k = 0; k < sparkCount; k++) {
          const base = beamHash(k, 6, 192), depth = beamHash(k, 9, 42);
          const u = (base + time * (1.29 + 1.65 * depth)) % 1;
          const x = left + u * length;
          const [top, bottom] = shape(x), outside = depth > .75;
          const py = outside ? (k % 2 ? top - radius * .24 * u : bottom + radius * .24 * u)
            : top + (bottom - top) * depth;
          const brightness = Math.sin(Math.PI * u) * (outside ? .62 : .89);
          const w = 3 + 16 * depth ** 1.7;
          ctx.strokeStyle = outside ? "#ff6933" : depth < .24 ? "#ff7145" : "#ffe1a2";
          ctx.globalAlpha = brightness * (.32 + .68 * base);
          ctx.lineWidth = .65 + base * 1.3;
          ctx.beginPath();
          ctx.moveTo(Math.max(left, x - w), py - (k % 2 ? -.9 : .9));
          ctx.lineTo(x, py);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "screen";
      if (shot.x < viewport.width + radius) {
        const headSize = Math.min(length * .67, radius * 1.62);
        beamFlash(ctx, shot.x - headSize * .47, y, headSize, radius * .74, .79, shot.linked);
      }
      if (age < .20) {
        const blast = (1 - age / .20) ** 1.3;
        beamFlash(ctx, shot.startX, y, radius * .68, radius * (.77 + age * 2.1), blast, shot.linked);
      }
      ctx.restore();
    }
    drawCrimsonResidue(ctx, shot, age);
  }
  let ionCloudAtlas;
  const ionCloudSize = 80;

  function ionNoise(index) {
    let value = Math.imul(index ^ 0x372519, 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }

  function ionCloudMaterial() {
    if (ionCloudAtlas) return ionCloudAtlas;
    const atlas = document.createElement("canvas");
    const size = ionCloudSize;
    const inks = [[20,159,244],[100,69,234],[23,223,226],[111,226,255]];
    atlas.width = size * inks.length;
    atlas.height = size;
    const paint = atlas.getContext("2d");
    const sheet = paint.createImageData(atlas.width, atlas.height);
    for (let tile = 0; tile < inks.length; tile++) {
      for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
          const x = (px + .5) * 2 / size - 1;
          const y = (py + .5) * 2 / size - 1;
          const radius = Math.hypot(x, y);
          if (radius >= .98) continue;
          const warpX = x + Math.sin(y * 8 + tile * 1.8) * .23;
          const warpY = y + Math.sin(x * 7 - tile * 2.2) * .21;
          const chambers = Math.sin(warpX * 13 + Math.sin(warpY * 19)) * Math.cos(warpY * 14 - warpX * 3);
          const rolls = .50 + .27 * Math.sin(warpX * 8 - warpY * 7) + .23 * chambers;
          const rim = clamp((.98 - radius) * 1.17, 0, 1) ** 1.69;
          const gain = clamp((.52 - radius) * 1.43, 0, .64) + Math.max(0, chambers) * .21;
          const grain = ionNoise(px + py * size + tile * 8191);
          const index = (py * atlas.width + tile * size + px) * 4;
          const ink = inks[tile];
          sheet.data[index] = ink[0] + (222 - ink[0]) * gain;
          sheet.data[index + 1] = ink[1] + (242 - ink[1]) * gain;
          sheet.data[index + 2] = ink[2] + (255 - ink[2]) * gain;
          sheet.data[index + 3] = 255 * rim * (.27 + .71 * rolls + .07 * grain);
        }
      }
    }
    paint.putImageData(sheet, 0, 0);
    ionCloudAtlas = atlas;
    return atlas;
  }

  function ionCloud(ctx, tile, x, y, width, height) {
    const size = ionCloudSize;
    ctx.drawImage(ionCloudMaterial(), tile * size, 0, size, size,
      x - width * .5, y - height * .5, width, height);
  }

  function ionTrailGeometry(missile) {
    const forwardX = Math.cos(missile.angle);
    const forwardY = Math.sin(missile.angle);
    const x = missile.x - forwardX * 11.5;
    const y = missile.y - forwardY * 11.5;
    const points = [{ x, y, distance: 0 }];
    let distance = 0;
    for (let index = missile.trail.length - 1; index >= 0; index--) {
      const p = missile.trail[index];
      const last = points.at(-1);
      if (points.length === 1 && (p.x - x) * forwardX + (p.y - y) * forwardY > -.1) continue;
      const gap = Math.hypot(p.x - last.x, p.y - last.y);
      if (gap < 2.5) continue;
      distance += gap;
      points.push({ x: p.x, y: p.y, distance });
    }
    return { points, distance };
  }

  function ionTrailSample(points, distance) {
    let i = 1;
    while (i < points.length - 1 && points[i].distance < distance) i++;
    const from = points[i - 1], to = points[i];
    const earlier = points[Math.max(0, i - 2)], later = points[Math.min(points.length - 1, i + 1)];
    const t = (distance - from.distance) / (to.distance - from.distance);
    const t2 = t * t, t3 = t2 * t;
    const interpolate = (a, b, c, d) => .5 * (2 * b + (c - a) * t
      + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
    const dx = to.x - from.x, dy = to.y - from.y;
    const normalizer = 1 / Math.hypot(dx, dy);
    return { x: interpolate(earlier.x, from.x, to.x, later.x),
      y: interpolate(earlier.y, from.y, to.y, later.y), nx: -dy * normalizer, ny: dx * normalizer };
  }

  function ionVapor(ctx, missile, age, index, tier, quiet) {
    const { points, distance } = ionTrailGeometry(missile);
    if (distance < 3) return;
    const samples = Math.min(tier === 2 ? 24 : tier ? 16 : 9, Math.max(2, Math.ceil(distance / 8)));
    const now = quiet ? 0 : age;
    const alpha = quiet ? .63 : 1;
    ctx.save();
    for (let i = samples - 1; i >= 0; i--) {
      const u = i / samples;
      const p = ionTrailSample(points, distance * u);
      const bank = Math.sin(i * 1.67 + now * 22 + index * 2.15);
      const loose = u * (quiet ? 3 : 8) * bank;
      const width = 22 + u * 21;
      ctx.globalAlpha = alpha * (.89 - .79 * u);
      ionCloud(ctx, (i + index) % 2, p.x + p.nx * loose, p.y + p.ny * loose, width * 1.22, width);
      if (tier && i % 2 === 0) {
        ctx.globalAlpha = alpha * (.76 - .68 * u);
        ionCloud(ctx, 2, p.x - p.nx * loose * .63, p.y - p.ny * loose * .63, width * .83, width * .68);
      }
      if (u < .58) {
        ctx.globalAlpha = alpha * .92 * (1 - u / .75);
        ionCloud(ctx, 3, p.x, p.y, 20 - 9 * u, 13 - 7 * u);
      }
    }
    if (!quiet && tier) {
      const sparks = 6 + tier * 3;
      for (let i = 0; i < sparks; i++) {
        const id = i + index * 101;
        const u = (age * (1.3 + ionNoise(id) * .92) + ionNoise(id + 41)) % 1;
        const p = ionTrailSample(points, distance * u);
        const drift = (ionNoise(id + 97) - .5) * (8 + u * 34);
        const x = p.x + p.nx * drift, y = p.y + p.ny * drift;
        const r = .44 + ionNoise(id + 187) * 1.05;
        ctx.globalAlpha = (1 - u) * .72;
        ctx.fillStyle = i % 4 === 0 ? "#c7afff" : "#adf7ff";
        ctx.beginPath(); ctx.ellipse(x, y, r * (1.4 + .7 * u), r, Math.atan2(-p.nx, p.ny), 0, tau); ctx.fill();
      }
    }
    ctx.restore();
  }

  function ionCapsule(ctx, missile, linked, quiet) {
    ctx.save();
    ctx.translate(missile.x, missile.y);
    ctx.rotate(missile.angle);
    ctx.globalAlpha = quiet ? .72 : .94;
    ionCloud(ctx, 3, -10.5, 0, 29, 23);
    ctx.globalAlpha = 1;
    const shell = ctx.createLinearGradient(0, -5.5, 0, 6.2);
    shell.addColorStop(0, "#a5dcf3");
    shell.addColorStop(.23, "#529ecc");
    shell.addColorStop(.37, "#265682");
    shell.addColorStop(.70, "#0b203c");
    shell.addColorStop(.90, "#0a1d32");
    shell.addColorStop(1, "#365c8c");
    ctx.fillStyle = shell;
    ctx.beginPath(); ctx.moveTo(-12.5, -3.8);
    ctx.bezierCurveTo(-9, -6.1, -.4, -5.4, 6.4, -4.5);
    ctx.quadraticCurveTo(12.1, -3.7, 14, 0);
    ctx.quadraticCurveTo(12.4, 4.4, 4.8, 5.1);
    ctx.bezierCurveTo(-2.7, 5.9, -10, 4.7, -12.5, 3.7);
    ctx.quadraticCurveTo(-14.1, 0, -12.5, -3.8);
    ctx.closePath(); ctx.fill();

    const cap = ctx.createLinearGradient(3, -4, 11, 5.5);
    cap.addColorStop(0, "#d5eff9");
    cap.addColorStop(.35, "#668eac");
    cap.addColorStop(.51, "#98c0d5");
    cap.addColorStop(1, "#193a5f");
    ctx.fillStyle = cap;
    ctx.beginPath(); ctx.moveTo(6, -4.5); ctx.quadraticCurveTo(12.5, -3.6, 14, 0);
    ctx.quadraticCurveTo(12.4, 4.2, 6.2, 4.8); ctx.quadraticCurveTo(9.7, .2, 6, -4.5); ctx.fill();

    ctx.strokeStyle = "#b1efff82";
    ctx.lineWidth = .6;
    ctx.beginPath(); ctx.moveTo(-8.8, -3.8); ctx.quadraticCurveTo(-.5, -5, 5.9, -3.7); ctx.stroke();
    ctx.fillStyle = linked ? "#e6ffff" : "#80dfff";
    ctx.beginPath(); ctx.ellipse(-11.6, 0, 1.85, 3.45, 0, 0, tau); ctx.fill();
    ctx.fillStyle = "#f1ffff";
    ctx.beginPath(); ctx.ellipse(-12.15, -.15, .95, 2.25, 0, 0, tau); ctx.fill();
    ctx.strokeStyle = "#68dfff";
    ctx.lineWidth = 1.35;
    ctx.beginPath(); ctx.moveTo(-6, .20); ctx.quadraticCurveTo(-.6, .6, 3.4, -.42); ctx.stroke();
    ctx.restore();
  }

  const ionResidueLifetime = .34;
  function ionBurst(ctx, burst, life, index, tier, quiet) {
    if (life < 0 || life >= ionResidueLifetime) return;
    const p = life / ionResidueLifetime;
    const fade = 1 - p;
    const alpha = quiet ? .69 : 1;
    ctx.save();
    const blooms = tier === 2 ? 7 : tier ? 5 : 2;
    for (let i = 0; i < blooms; i++) {
      const seed = index * 123 + i;
      const angle = i * 2.39996 + ionNoise(seed) * .61;
      const distance = (7 + ionNoise(seed + 79) * 19) * (p ** .53);
      const x = burst.x + Math.cos(angle) * distance, y = burst.y + Math.sin(angle) * distance;
      const size = (17 + ionNoise(seed + 23) * 25) * (.67 + p * 1.08);
      ctx.globalAlpha = fade * .80 * alpha;
      ionCloud(ctx, i % 3, x, y, size * 1.18, size);
    }
    if (life < .12) {
      const heat = 1 - life / .12;
      const flashSize = 38 + life * 110;
      ctx.globalAlpha = heat * .98 * alpha;
      ionCloud(ctx, 3, burst.x, burst.y, flashSize * 1.36, flashSize);
      ctx.fillStyle = "#b7f4ff";
      ctx.beginPath(); ctx.ellipse(burst.x, burst.y, 7 + p * 11, 4.3 + p * 4, -.44, 0, tau); ctx.fill();
      ctx.fillStyle = "#efffff";
      ctx.beginPath(); ctx.ellipse(burst.x, burst.y, 3.8, 2.5, -.44, 0, tau); ctx.fill();
    }
    if (!quiet) {
      const fragments = tier === 2 ? 19 : tier ? 13 : 6;
      for (let i = 0; i < fragments; i++) {
        const seed = index * 211 + i * 3;
        const angle = i * 2.39996 + ionNoise(seed + 31) * .64;
        const distance = (25 + ionNoise(seed + 83) * 56) * (p ** .62);
        const x = burst.x + Math.cos(angle) * distance;
        const y = burst.y + Math.sin(angle) * distance;
        const size = 1 + 1.9 * ionNoise(seed + 19);
        ctx.globalAlpha = fade ** 1.5 * (.36 + ionNoise(seed + 49) * .62);
        ctx.strokeStyle = i % 4 === 0 ? "#b29cff" : i % 3 ? "#64d9ff" : "#e0fbff";
        ctx.lineWidth = .6 + size * .42;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x - Math.cos(angle) * size * (1 + 4 * fade), y - Math.sin(angle) * size * (1 + 4 * fade)); ctx.stroke();
      }
      if (life < .17) {
        ctx.globalAlpha = (1 - life / .17) * .63;
        ctx.strokeStyle = "#a3dfff"; ctx.lineWidth = 1.15;
        for (let i = 0; i < 3; i++) {
          const a = i * 2.39996 + index * 1.1;
          const extent = 19 + p * 55;
          ctx.beginPath(); ctx.moveTo(burst.x + Math.cos(a) * 4, burst.y + Math.sin(a) * 4);
          ctx.lineTo(burst.x + Math.cos(a + .27) * extent * .43, burst.y + Math.sin(a + .27) * extent * .43);
          ctx.lineTo(burst.x + Math.cos(a - .13) * extent * .74, burst.y + Math.sin(a - .13) * extent * .74);
          ctx.lineTo(burst.x + Math.cos(a) * extent, burst.y + Math.sin(a) * extent); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function ions(ctx, shot, age) {
    const tier = detail(), quiet = quietCombatMotion();
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 0; i < shot.missiles.length; i++) {
      const missile = shot.missiles[i];
      if (!missile.active || missile.done) continue;
      ionVapor(ctx, missile, age, i, tier, quiet);
      ionCapsule(ctx, missile, shot.linked, quiet);
    }
    ctx.restore();
    drawIonResidue(ctx, shot, age);
  }

  function drawIonResidue(ctx, shot, age) {
    const tier = detail(), quiet = quietCombatMotion();
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 0; i < shot.bursts.length; i++) {
      const burst = shot.bursts[i];
      ionBurst(ctx, burst, age - burst.age, i, tier, quiet);
    }
    ctx.restore();
  }
  function corona(ctx,shot,age) {
    const tier=detail(),time=tier?age:0;
    ctx.save();
    for(const [n,wave]of shot.waves.entries()) {
      if(wave.x<=0||wave.x-wave.length>=viewport.width)continue;
      const x=wave.x,left=Math.max(0,x-wave.length),h=viewport.height,rows=tier?24:14,step=h/rows;
      const gradient=ctx.createLinearGradient(left,0,x,0);gradient.addColorStop(0,'#7a421900');gradient.addColorStop(.5,'#a66b2222');gradient.addColorStop(.9,'#edbc6480');gradient.addColorStop(1,'#fff0baca');
      ctx.fillStyle=gradient;ctx.fillRect(left,0,x-left,h);
      for(let i=0;i<rows;i++) {
        const y=step*(i+.5),depth=Math.sin((i/rows)*Math.PI),length=Math.min(wave.length,12+depth*27),offset=tier?Math.sin(i*1.37-time*7+n)*3:0;
        ctx.strokeStyle=i%3?'#ffe2a46e':'#fff0c8c0';ctx.lineWidth=i%3?1:1.5;ctx.fillStyle='#ffbb4520';ctx.beginPath();
        ctx.moveTo(x-length,y-step*.34);ctx.lineTo(x-3,y-step*.42);ctx.lineTo(x+offset,y);ctx.lineTo(x-3,y+step*.42);ctx.lineTo(x-length,y+step*.34);ctx.closePath();ctx.fill();ctx.stroke();
        if(tier){ctx.strokeStyle='#dc902c55';ctx.beginPath();ctx.moveTo(x-length,y);ctx.lineTo(Math.max(left,x-length*1.7),y-step*.24);ctx.stroke();}
      }
      // An elliptical front communicates a curved field across the entire
      // collision band, not a handful of disconnected decorative bullets.
      arc(ctx,x-4,h*.5,Math.max(8,wave.length*.23),h*.5,-Math.PI/2,Math.PI/2,'#ffe4a5aa',1.6);
    }
    ctx.restore();
  }
  let retiringShots = [];

  function reset() {
    retiringShots.length = 0;
  }

  function finish(kind, shot, age) {
    if (state !== 'battle' || !shot || (kind !== 'red' && kind !== 'blue')) return;
    const blue = kind === 'blue';
    const events = (blue ? shot.bursts : shot.contacts) ?? [];
    const lifetime = blue ? ionResidueLifetime : crimsonResidueLifetime;
    const remaining = Math.max(0, ...events.map(event => (blue ? event.age : event.time) + lifetime - age));
    if (!(remaining > 0)) return;

    // Keep copied visual coordinates only. Rewind restores combat shot objects
    // in place and must never mutate an already-retired visual.
    const visual = blue
      ? { bursts: events.map(({ x, y, age }) => ({ x, y, age })) }
      : { radius: shot.radius, linked: shot.linked, contacts: events.map(({ x, y, time }) => ({ x, y, time })) };
    retiringShots.push({ kind, visual, age, startedAt: battleTime, expiresAt: battleTime + remaining });
    if (retiringShots.length > 3) retiringShots.shift();
  }

  function draw(ctx) {
    if (state !== 'battle') {
      reset();
      return false;
    }
    if (retiringShots.length) {
      retiringShots = retiringShots.filter(effect => battleTime >= effect.startedAt && battleTime < effect.expiresAt);
    }
    if (ultimate.phase === 'idle' && !retiringShots.length) return false;
    ctx.save();
    for (const effect of retiringShots) {
      const age = effect.age + (battleTime - effect.startedAt);
      if (effect.kind === 'blue') drawIonResidue(ctx, effect.visual, age);
      else drawCrimsonResidue(ctx, effect.visual, age);
    }
    if (ultimate.phase === 'charging') {
      const progress = clamp(ultimate.elapsed / cannonLink.chargeDuration, 0, 1);
      charge(ctx, ultimate.kind, muzzlePosition(), progress, ultimate.elapsed, cannonLink.chargingLinked);
    } else if (ultimate.phase === 'firing' && ultimate.shot) {
      const { kind, shot, elapsed } = ultimate;
      if (kind === 'blue') ions(ctx, shot, elapsed);
      else if (kind === 'yellow') corona(ctx, shot, elapsed);
      else crimson(ctx, shot, elapsed);
    }
    ctx.restore();
    return true;
  }
  function shieldDetail(ctx) {
    if(state!=='battle'||!shieldIsActive()||!detail())return;
    const age=shield.duration-shield.remaining,x=player.x,y=player.y,rx=player.width*.60,ry=player.height*.65;
    ctx.save();ctx.globalAlpha=Math.min(1,age/.12,shield.remaining/.18)*.7;
    // Grazing reflections travel over an ellipsoid, confined to its boundary.
    for(let i=0;i<7;i++){const t=(age*.6+i/7)%1,latitude=(t-.5)*Math.PI,span=Math.cos(latitude);arc(ctx,x,y+Math.sin(latitude)*ry,rx*span,Math.max(.2,ry*.07*span),-.4,2.9,'#ffc1b24d',.8);}
    if(shield.effect) {const p=clamp(1-shield.flash/.65,0,1);arc(ctx,x,y,rx*(1+p*.18),ry*(1+p*.18),-1.4,1.4,'#fff0c0',1.4);}
    ctx.restore();
  }
  return { draw, shieldDetail, finish, reset };
})();
