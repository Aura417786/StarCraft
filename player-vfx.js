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
    if (id !== 'yellow') {
      drawChargePlasma(ctx, id, m, progress, age, linked);
      FighterMaterialFx.emitter(ctx, id, m, 26 + 52 * progress, age, .48 + progress * .42);
      return;
    }
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
    FighterMaterialFx.plate(ctx, id, 0, 0, radius * 2.65, radius * 2.65, age, .49 + .30 * progress);
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
        if (tier && length > radius) FighterMaterialFx.plate(ctx, "red", shot.x - headSize * .55, y,
          headSize * 1.18, radius * 2.65, time, .67);
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
      if (tier && missile.target && i === 0) FighterMaterialFx.lock(ctx, missile.target, 3, age);
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
      const p = (age - burst.age) / ionResidueLifetime;
      if (p >= 0 && p < 1 && tier) {
        FighterMaterialFx.plate(ctx, "blue", burst.x, burst.y, 37 + p * 34, 42 + p * 39,
          age - burst.age, (1 - p) * .83);
      }
    }
    ctx.restore();
  }
  let retiringShots = [];

  function reset() {
    retiringShots.length = 0;
    if (typeof FighterMaterialFx !== 'undefined') FighterMaterialFx.reset();
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
      else if (kind === 'yellow') FighterMaterialFx.corona(ctx, shot, elapsed);
      else crimson(ctx, shot, elapsed);
    }
    ctx.restore();
    return true;
  }
  function shieldDetail(ctx) {
    if (state === 'battle') FighterMaterialFx.hullHit(ctx);
  }
  return { draw, shieldDetail, finish, reset };
})();

// Rendered emitter geometry supplies the material. Gameplay coordinates and
// clocks supply the pose, actual range, and the lifetime of each response.
const FighterMaterialFx = (() => {
  const tau = 2 * Math.PI;
  const plates = new Map();
  const wakes = new WeakMap();
  const hits = [], contacts = [], waveHits = [];
  const skin = {
    red: { rim: "#ff7044", core: "#fff0ad", dark: "#841b21", plate: "crimson" },
    blue: { rim: "#68cfff", core: "#ddfaff", dark: "#264a96", plate: "azure" },
    yellow: { rim: "#ffc35c", core: "#fff0b8", dark: "#855120", plate: "auric" },
  };

  function plate(ctx, id, x, y, width, height, age, opacity) {
    let image = plates.get(id);
    if (!image) {
      image = new Image();
      image.src = "assets/vfx/fighters/" + skin[id].plate + ".webp";
      plates.set(id, image);
    }
    if (!image.naturalWidth || !(width > 0 && height > 0))
      return;
    const frame = quietCombatMotion() ? 0 : Math.floor(Math.max(0, age) * 21) % 12;
    ctx.save();
    ctx.globalAlpha *= clamp(opacity, 0, 1);
    ctx.drawImage(image, frame % 4 * 224, Math.floor(frame / 4) * 224, 224, 224, x - width / 2, y - height / 2, width, height);
    ctx.restore();
  }

  function emitter(ctx, id, point, size, age, opacity) {
    plate(ctx, id, point.x, point.y, size * 1.12, size, age, opacity);
  }

  function ellipse(ctx, x, y, rx, ry, start, end, color, weight) {
    if (!(rx > 0 && ry > 0))
      return;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, start, end);
    ctx.strokeStyle = color;
    ctx.lineWidth = weight;
    ctx.stroke();
  }

  function radiance(ctx, x, y, rx, ry, id, intensity) {
    if (!(rx > 0 && ry > 0 && intensity > 0))
      return;
    const mat = skin[id];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    ctx.globalAlpha *= clamp(intensity, 0, 1);
    const light = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    light.addColorStop(0, mat.core);
    light.addColorStop(.12, mat.rim);
    light.addColorStop(.42, mat.rim + "5c");
    light.addColorStop(1, mat.dark + "00");
    ctx.fillStyle = light;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  function remember(list, record, limit) {
    if (list.length === limit)
      list.shift();
    list.push({ ...record, time: battleTime });
  }

  function vent(point, power) {
    remember(hits, { x: point.x, y: point.y, power, vent: true }, 14);
    pulseCombatLight(point.x, point.y, 112 + 55 * power, skin.red.rim, "impact");
  }

  function pierce(point, shot) {
    const x = point.x - (point.width ?? 0) * .29, y = clamp(shot.y, point.y - (point.height ?? 0) * .35, point.y + (point.height ?? 0) * .35);
    remember(hits, { x, y, power: shot.armorStrength ?? 1, vent: false }, 14);
    pulseCombatLight(x, y, 102, skin.red.rim, "impact");
  }

  function waveContact(target, index) {
    const x = target.x - (target.width ?? 0) * .28;
    remember(waveHits, { x, y: target.y, index }, 14);
    pulseCombatLight(x, target.y, 84, skin.yellow.rim, "hit");
  }

  function fragments(ctx, hit, age) {
    const life = age / (hit.vent ? .25 : .39);
    if (life < 0 || life >= 1)
      return;
    const motion = quietCombatMotion() ? 0 : life;
    const r = (hit.vent ? 24 : 19) * (.65 + .58 * hit.power);
    const swell = Math.sqrt(motion);
    ctx.save();
    ctx.translate(hit.x, hit.y);
    ctx.globalAlpha *= 1 - life;
    if (hit.vent) {
      ellipse(ctx, 3 + 18 * swell, 0, (5 + 10 * swell), (12 + 19 * swell), 0, tau, "#ffae667d", 1.7);
      radiance(ctx, 8, 0, 46 * (1 - life) + 1, r * .88, "red", .88);
    } else {
      radiance(ctx, 4, 0, r * (1.8 + swell), r * 1.2, "red", .76);
      ellipse(ctx, 5 + 12 * swell, 0, 3 + 4 * swell, r * (.48 + swell * .55), -.47 * Math.PI, .49 * Math.PI, "#fff1a9", 1.8);
    }
    const count = quietCombatMotion() ? 4 : visualQuality.meshDetail === 2 ? 13 : 8;
    for (let i = 0; i < count; i++) {
      const h = flightVfxNoise(i * 7 + 23), spread = flightVfxNoise(i * 11 + 29) - .5;
      const d = r * (.32 + 2.5 * swell) * (.45 + h * .9);
      const dx = hit.vent ? (i % 3 ? .34 : -.5) : .36 + h * .64;
      const x = dx * d, y = spread * d * (hit.vent ? 1.8 : 1.55), l = (1 - life) * (2 + 6 * h);
      ctx.fillStyle = i % 3 ? "#ff9147" : "#ffe6a0";
      ctx.beginPath();
      ctx.moveTo(x + l, y + spread * l);
      ctx.lineTo(x - l, y - spread * l - 1.1);
      ctx.lineTo(x - l * .2, y + 1.2);
      ctx.fill();
    }
    ctx.restore();
  }

  function startSeeker(shot) {
    const path = wakes.get(shot);
    if (path)
      path.length = 0;
  }

  function trackSeeker(shot) {
    if (quietCombatMotion() || !visualQuality.meshDetail)
      return;
    let path = wakes.get(shot);
    if (!path) {
      path = [];
      wakes.set(shot, path);
    }
    const last = path.at(-1);
    if (last && (shot.x < last.x - 2 || battleTime < last.time || battleTime - last.time > .15))
      path.length = 0;
    if (path.length && Math.hypot(shot.x - last.x, shot.y - last.y) < 13)
      return;
    if (path.length >= 9)
      path.shift();
    path.push({ x: shot.x, y: shot.y, time: battleTime });
  }

  function seekerWake(ctx, shot, half) {
    const points = wakes.get(shot);
    if (!points?.length)
      return false;
    const cos = Math.cos(shot.angle), sin = Math.sin(shot.angle);
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    // Bullet renderer already translated/rotated the context to the head.
    // Project the world-space observations back into its local frame.
    for (let layer = 0; layer < 2; layer++) {
      ctx.strokeStyle = layer ? "#b4edff9c" : "#477af54d";
      ctx.lineWidth = layer ? .88 : half * 1.65;
      ctx.beginPath();
      let started = false;
      for (const point of points) {
        const dx = point.x - shot.x, dy = point.y - shot.y;
        if (battleTime - point.time > .115)
          continue;
        const x = dx * cos + dy * sin, y = -dx * sin + dy * cos;
        if (started)
          ctx.lineTo(x, y);
        else {
          ctx.moveTo(x, y);
          started = true;
        }
      }
      ctx.lineTo(1, 0);
      ctx.stroke();
    }
    ctx.restore();
    return points.length > 1;
  }

  function lock(ctx, target, stacks, age) {
    if (!(target.height > 0 && target.width > 0))
      return;
    const r = clamp(Math.min(target.height * .58, target.width * .42), 13, 40), t = quietCombatMotion() ? 0 : age * .42;
    ctx.save();
    ctx.translate(target.x, target.y);
    for (let i = 0; i < 3; i++) {
      const a = t + i * tau / 3;
      ellipse(ctx, 0, 0, r + 4, r + 4, a - .26, a + .26, i < stacks ? "#c3f6ff" : "#5aa6ce81", i < stacks ? 1.65 : 1);
      if (i < stacks) {
        ctx.save();
        ctx.rotate(a);
        ctx.fillStyle = "#8de6ff";
        ctx.beginPath();
        ctx.moveTo(r + 1, 0);
        ctx.lineTo(r + 7, -2.6);
        ctx.lineTo(r + 7, 2.6);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function chain(ctx, link) {
    const delay = (link.index ?? 0) * .081, age = .47 - link.remaining - delay;
    if (age < 0 || age >= .26)
      return;
    const quiet = quietCombatMotion(), lead = clamp(age / .060, 0, 1);
    const dx = link.toX - link.x, dy = link.toY - link.y, span = Math.hypot(dx, dy);
    const reach = Math.max(10, span), n = quiet ? 3 : clamp(Math.ceil(reach / 13), 4, 19);
    ctx.save();
    ctx.translate(link.x, link.y);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.globalAlpha *= clamp(1 - (age - .055) / .21, 0, 1) * (quiet ? .65 : 1);
    const path = new Path2D(), forks = new Path2D();
    const seed = (link.index ?? 0) * 43 + Math.floor(link.toY);
    const bend = (i, t) => Math.sin(t * Math.PI) * (flightVfxNoise(i * 19 + seed) - .5) * Math.min(reach * .30, 23);
    let prevY = 0;
    path.moveTo(0, 0);
    for (let i = 1; i <= n; i++) {
      const t = i / n, k = (i - 1) / n, y = bend(i, t);
      const stop = Math.min(t, lead), portion = clamp((stop - k) * n, 0, 1), tipY = prevY + (y - prevY) * portion;
      path.lineTo(stop * span, tipY);
      if (!quiet && i % 3 === 1 && t <= lead && t < .91) {
        const side = i % 2 ? 1 : -1, x = t * span, w = Math.min(14, reach * .16);
        forks.moveTo(x, y);
        forks.lineTo(x + w * .39, y + side * w * .54);
        forks.lineTo(x + w * .78, y + side * w * .48);
        forks.lineTo(x + w * 1.08, y + side * w * 1.16);
      }
      if (t >= lead)
        break;
      prevY = y;
    }
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#4559df85";
    ctx.lineWidth = 5.8;
    ctx.stroke(path);
    ctx.strokeStyle = "#5bc9ff";
    ctx.lineWidth = 2.45;
    ctx.stroke(path);
    ctx.strokeStyle = "#e2fbff";
    ctx.lineWidth = .95;
    ctx.stroke(path);
    ctx.strokeStyle = "#87dbfbac";
    ctx.stroke(forks);
    if (lead < 1)
      radiance(ctx, lead * span, 0, 8, 8, "blue", .82);
    else {
      const p = clamp((age - .060) / .18, 0, 1);
      radiance(ctx, span, 0, 19 * (1 - p) + 2, 15 * (1 - p) + 2, "blue", .9);
      if (!quiet)
        plate(ctx, "blue", span, 0, 36 + 18 * p, 35 + 14 * p, age + (link.index ?? 0) * .13, .84 * (1 - p));
    }
    ctx.restore();
  }

  function field(ctx, f) {
    const r = fighterCombatRules.auricRadius, age = f.age, last = .04 + (f.pulses - 1) * fighterCombatRules.auricPulsePeriod;
    const travel = clamp((age - last) / fighterCombatRules.auricPulsePeriod, 0, 1);
    const wave = f.pulses > 0 ? (1 - travel) : 0, density = .20 + .70 * wave;
    const fade = clamp((1.1 - age) / .23, 0, 1), quiet = quietCombatMotion();
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.globalAlpha *= fade;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, tau);
    ctx.clip();
    const haze = ctx.createRadialGradient(0, 0, r * .10, 0, 0, r);
    haze.addColorStop(0, "#ffd58408");
    haze.addColorStop(.62, "#9e561508");
    haze.addColorStop(.90, "#ecae4729");
    haze.addColorStop(.99, "#ffd88166");
    haze.addColorStop(1, "#fff4b89b");
    ctx.fillStyle = haze;
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    plate(ctx, "yellow", 0, 0, r * 2.49, r * 2.55, age, .08 + .16 * density);
    const front = quiet ? r * .72 : r * (.13 + .86 * Math.sin(travel * Math.PI * .5));
    if (f.pulses > 0) {
      ellipse(ctx, 0, 0, front, front, 0, tau, "#ffe2a095", quiet ? 1 : 1.1 + 3.2 * wave);
      ellipse(ctx, 0, 0, Math.max(1, front - 6), Math.max(1, front - 6), 0, tau, "#ffba453e", 4 * wave + .4);
      radiance(ctx, 0, 0, 18 + 43 * wave, 16 + 38 * wave, "yellow", .64 * wave);
    }
    if (!quiet && visualQuality.meshDetail) {
      // Moving caustics are most visible at grazing incidence, leaving the
      // enemy's body and incoming projectiles readable through the centre.
      for (let i = 0; i < 5; i++) {
        const theta = i * tau / 5 + age * .51, drift = .5 + .5 * Math.sin(age * 4.8 + i * 2.4);
        const inner = r * (.80 + drift * .12), stretch = .25 + drift * .57;
        ellipse(ctx, 0, 0, inner, inner, theta, theta + stretch, "#ffd18146", 1.1 + drift * .8);
      }
    }
    for (let i = 0; i < 8; i++) {
      const angle = i * tau / 8 + (quiet ? 0 : age * .17);
      ellipse(ctx, 0, 0, r - 2, r - 2, angle + .06, angle + .45, "#ffdb86bb", 1.5);
    }
    ctx.restore();
  }

  function drawWeapons(ctx, id, state) {
    const m = muzzlePosition(), t = quietCombatMotion() ? 0 : battleTime;
    if (id === "red") {
      for (const hit of hits)
        fragments(ctx, hit, battleTime - hit.time);
      if (state.redHeld) {
        const p = state.stability, r = 11 + 24 * p;
        radiance(ctx, m.x, m.y, r * 1.6, r * 1.45, "red", .55 + .31 * p);
        emitter(ctx, id, m, 40 + 65 * p, t, .72 + .26 * p);
        for (let i = 0; i < (quietCombatMotion() ? 1 : 3); i++) {
          const u = (t * (.72 + p * .82) + i / 3) % 1, d = 29 * (1 - u);
          ellipse(ctx, m.x - d * .67, m.y, 3 + d * .18, r * (.36 + 1.1 * (1 - u)), 0, tau, "#ffad626e", .8 + u);
        }
        radiance(ctx, m.x + 2, m.y, 6 + 8 * p, 4 + 8 * p, "red", .95);
      } else if (muzzleFlash > 0 && state.redFlash <= 0) {
        radiance(ctx, m.x + 9, m.y, 21, 7, id, clamp(muzzleFlash / .055, 0, 1) * .87);
      }
    } else if (id === "blue") {
      const mark = state.marked;
      const markAge = battleTime - (state.marks.get(mark)?.time ?? -Infinity);
      if (markAge < fighterCombatRules.ionMarkTime || state.arcs.length) {
        if (!evolution.blast) {
          const drone = getEvolutionDronePositions(player, 1)[0];
          ctx.save();
          ctx.globalAlpha *= clamp((fighterCombatRules.ionMarkTime - markAge) / .22, 0, 1);
          drawFighterVariant(ctx, drone, "blue", null, quietCombatMotion(), t);
          if (state.arcs.some(a => a.index === 0 && a.remaining > .33))
            plate(ctx, "blue", drone.muzzleX + 7, drone.muzzleY, 42, 26, t, .95);
          ctx.restore();
        }
        if (mark?.hp > 0 && state.stacks > 0)
          lock(ctx, mark, state.stacks, t);
      }
      for (const link of state.arcs)
        chain(ctx, link);
    } else {
      if (state.field)
        field(ctx, state.field);
      for (const hit of waveHits) {
        const p = (battleTime - hit.time) / .30;
        if (p < 0 || p >= 1)
          continue;
        ctx.save();
        ctx.globalAlpha *= 1 - p;
        const r = 10 + (quietCombatMotion() ? 8 : 18 * Math.sqrt(p));
        const turn = (hit.index ?? 0) * .42;
        for (let i = 0; i < 3; i++) {
          const a = i * tau / 3 + turn;
          ellipse(ctx, hit.x, hit.y, r, r * .80, a, a + 1.32, "#ffd88a", 1.4);
        }
        radiance(ctx, hit.x, hit.y, 23, 14, "yellow", .74 * (1 - p));
        ctx.restore();
      }
      const p = clamp(state.capacitor, 0, 1);
      for (const side of [-1, 1]) {
        const x = player.x + player.width * .10, y = player.y + side * player.height * .28;
        ellipse(ctx, x, y, player.width * .105, 2.6, 0, tau, "#ffde9473", .85);
        radiance(ctx, x, y, 5 + 10 * p, 2 + 2.3 * p, "yellow", .23 + .5 * p);
      }
    }
  }

  function corona(ctx, shot, age) {
    const quiet = quietCombatMotion(), t = quiet ? 0 : age, h = viewport.height;
    for (const w of shot.waves) {
      if (w.x <= 0 || w.x - w.length >= viewport.width)
        continue;
      const L = w.length, x = w.x;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - L, 0, L, h);
      ctx.clip();
      const heat = ctx.createLinearGradient(x - L, 0, x, 0);
      heat.addColorStop(0, "#7c431300");
      heat.addColorStop(.41, "#c77a2224");
      heat.addColorStop(.80, "#f8ba5d81");
      heat.addColorStop(1, "#ffeac1c4");
      ctx.fillStyle = heat;
      ctx.fillRect(x - L, 0, L, h);
      const count = visualQuality.meshDetail ? 13 : 7;
      const step = h / count;
      for (let i = 0; i < count; i++) {
        const y = (i + .5) * step, p = (i + .5) / count;
        const depth = .50 + .44 * Math.sin(p * Math.PI), q = quiet ? .5 : .5 + .5 * Math.sin(i * .86 - t * 9 + w.waveIndex);
        const nose = x - 1 - L * (1 - depth) * .45;
        ctx.beginPath();
        ctx.moveTo(nose - L * .54, y - step * .50);
        ctx.lineTo(nose - 3, y - step * .40);
        ctx.quadraticCurveTo(nose + 5, y, nose - 3, y + step * .39);
        ctx.lineTo(nose - L * .54, y + step * .50);
        ctx.lineTo(nose - L * (.70 + .22 * q), y);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? "#ffce6631" : "#bd732b2b";
        ctx.fill();
        ctx.strokeStyle = "#ffe4a683";
        ctx.lineWidth = .9;
        ctx.stroke();
        if (!quiet)
          plate(ctx, "yellow", nose - L * .30, y, L * .87, step * 1.22, age + p, .29 + .20 * q);
      }
      for (let band = 0; band < (quiet ? 1 : 3); band++) {
        ctx.beginPath();
        for (let j = 0; j <= 28; j++) {
          const v = j / 28, edge = x - L * (.13 + band * .10 + .053 * Math.sin(v * tau * 2.2 + band + t * 4)) - .15 * L * Math.abs(v * 2 - 1) ** 1.5;
          if (!j)
            ctx.moveTo(edge, 0);
          else
            ctx.lineTo(edge, v * h);
        }
        ctx.strokeStyle = band ? "#ffaa4e75" : "#fff1b9c9";
        ctx.lineWidth = band ? 1 : 2;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function shieldContact(shot, swept) {
    const rx = player.width * .60 + (shot.radius ?? 0), ry = player.height * .65 + (shot.radius ?? 0);
    const x = (shot.x - player.x) / rx, y = (shot.y - player.y) / ry;
    const x0 = swept ? ((shot.previousX ?? shot.x) - (player.previousX ?? player.x)) / rx : x;
    const y0 = swept ? ((shot.previousY ?? shot.y) - (player.previousY ?? player.y)) / ry : y;
    const entry = projectileCircleEntry(x0, y0, x - x0, y - y0, 0, 0, 1);
    const along = Number.isFinite(entry) ? entry : 1;
    let dx = x0 + (x - x0) * along, dy = y0 + (y - y0) * along;
    if (Math.hypot(dx, dy) < .18) {
      dx = -(shot.vx ?? -1) / rx;
      dy = -(shot.vy ?? 0) / ry;
    }
    remember(contacts, { angle: Math.atan2(dy, dx) }, 8);
  }

  function counter(ctx, id) {
    const fx = shield.effect;
    if (!fx)
      return;
    const p = clamp(1 - shield.flash / .65, 0, 1), quiet = quietCombatMotion(), mat = skin[id];
    const edge = fx.x + fx.length * (quiet ? .42 : 1 - (1 - p) ** 3), h = fx.halfHeight;
    ctx.save();
    ctx.globalAlpha *= 1 - p;
    for (let i = 0; i < (quiet ? 1 : 3); i++) {
      const x = edge - i * 15;
      ctx.beginPath();
      ctx.moveTo(x - 26, fx.y - h);
      ctx.bezierCurveTo(x + 11, fx.y - h * .55, x + 11, fx.y + h * .55, x - 26, fx.y + h);
      ctx.bezierCurveTo(x - 3, fx.y + h * .44, x - 3, fx.y - h * .44, x - 26, fx.y - h);
      ctx.fillStyle = mat.rim + (i ? "1c" : "55");
      ctx.fill();
      ctx.strokeStyle = i ? mat.rim + "70" : mat.core;
      ctx.lineWidth = i ? 1 : 2;
      ctx.stroke();
    }
    if (id === "yellow")
      plate(ctx, id, edge - 22, fx.y, 58, h * 2.35, p, .81);
    radiance(ctx, edge - 8, fx.y, 36, h * .75, id, .38);
    ctx.fillStyle = mat.core;
    ctx.font = "700 15px Microsoft YaHei,sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(tr("完美格挡", "PERFECT GUARD"), player.x, player.y - player.height * .80);
    ctx.restore();
  }

  function drawShieldSkin(ctx, id, x, y, rx, ry, age) {
    const s = shield, mat = skin[id], quiet = quietCombatMotion(), t = quiet ? 0 : age;
    const fade = clamp(Math.min(.44 + age / .12, s.remaining / .18), 0, 1);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    ctx.globalAlpha *= fade;
    const film = ctx.createRadialGradient(-.14, -.20, .04, 0, 0, 1);
    film.addColorStop(0, mat.dark + "03");
    film.addColorStop(.70, mat.dark + "15");
    film.addColorStop(.94, mat.rim + "39");
    film.addColorStop(1, mat.core + "7a");
    ctx.fillStyle = film;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, tau);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha *= fade;
    ellipse(ctx, x, y, rx, ry, 0, tau, mat.rim + "ac", 1.5);
    if (id === "yellow") {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, tau);
      ctx.clip();
      plate(ctx, id, x, y, rx * 2.50, ry * 2.54, t, .62);
      ctx.restore();
    } else if (id === "blue") {
      for (let i = 0; i < 7; i++) {
        const a = i * tau / 7 + t * .6;
        ellipse(ctx, x, y, rx * .97, ry * .97, a, a + .48, mat.core + "ca", 1.4);
      }
    } else {
      for (let i = 0; i < 3; i++)
        ellipse(ctx, x + rx * (i - 1) * .37, y, rx * (.22 + .11 * i), ry * (.80 + .08 * i), -.50 * Math.PI, .50 * Math.PI, mat.rim + "72", 1.3);
    }
    if (s.perfectRemaining > 0 && !s.perfectUsed)
      ellipse(ctx, x, y, rx * 1.035, ry * 1.035, -1.56, 1.56, mat.core, 2.3);
    for (const hit of contacts) {
      const p = (battleTime - hit.time) / .34;
      if (p < 0 || p >= 1)
        continue;
      const a = hit.angle, reach = .18 + (quiet ? .15 : p * .86);
      ctx.save();
      ctx.globalAlpha *= 1 - p;
      ellipse(ctx, x, y, rx, ry, a - reach, a + reach, mat.core, 2.5 + 2 * (1 - p));
      const px = x + rx * Math.cos(a), py = y + ry * Math.sin(a);
      radiance(ctx, px, py, 15 + 11 * p, 12 + 9 * p, id, .93);
      ellipse(ctx, px, py, 6 + 16 * p, 4 + 11 * p, 0, tau, mat.rim + "9a", 1.4);
      ctx.restore();
    }
    ctx.restore();
    counter(ctx, id);
  }

  function hullHit(ctx) {
    if (!(player.hitFlash > 0) || shieldIsActive())
      return;
    const id = currentUltimateId(), p = clamp(1 - player.hitFlash / .35, 0, 1);
    ctx.save();
    ctx.globalAlpha = (1 - p) * .84;
    const x = player.x + player.width * .12, y = player.y - player.height * .10;
    if (id === "red")
      fragments(ctx, { x, y, power: .65, vent: false }, p * .30);
    else if (id === "blue")
      plate(ctx, id, x, y, player.width * .64, player.height * .88, p, .75);
    else
      ellipse(ctx, x, y, player.width * (.18 + .10 * p), player.height * (.29 + .10 * p), -.85, 1.13, skin.yellow.core, 2);
    ctx.restore();
  }

  function reset() { hits.length = contacts.length = waveHits.length = 0; }
  return { emitter, plate, lock, vent, pierce, waveContact, startSeeker, trackSeeker, seekerWake, drawWeapons, corona, shieldContact, shield: drawShieldSkin, hullHit, reset };
})();
