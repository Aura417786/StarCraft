/* Ivory, chitin and optical effects. The mechanics supply every combat anchor. */
const BossCreatureVfx = (() => {
  const TAU = 2 * Math.PI;
  const ribSurfaces = new Map();
  const beamSurfaces = new Map();
  let chitinGrain;
  const palettes = {
    ivory: { glow: "#ff9b3454", rim: "#ffca72c4", core: "#fff7dc", dust: "#ffe1a6" },
    prism: { glow: "#5b7bff70", rim: "#52dfffbe", core: "#e4ffff", dust: "#acdcff" },
    chitin: { glow: "#43f96e41", rim: "#7cff69b8", core: "#dcffb9", dust: "#b6fb85" },
  };

  function sample(seed) {
    const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
  }

  function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function disc(ctx, x, y, radius, color, alpha) {
    if (radius <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha *= alpha;
    const aura = ctx.createRadialGradient(x, y, 0, x, y, radius);
    aura.addColorStop(0, color);
    aura.addColorStop(.30, color + "72");
    aura.addColorStop(1, color + "00");
    ctx.fillStyle = aura;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  function embers(ctx, x, y, radius, time, palette, count, seed = 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = palette.dust;
    const opacity = ctx.globalAlpha;
    for (let i = 0; i < count; i++) {
      const a = TAU * sample(seed + i * 2 + 10);
      const phase = (time * (.42 + sample(i + 4) * .43) + sample(seed + i * 3 + 31)) % 1;
      const d = radius * (.20 + phase * .8), dx = Math.cos(a), dy = Math.sin(a);
      const size = .7 + sample(i + 43) * 1.3;
      ctx.globalAlpha = opacity * (1 - phase) * .7;
      ctx.beginPath(); ctx.ellipse(x + dx * d, y + dy * d, size * (2.8 - phase), size * .48, a, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function ribSurface(variant) {
    if (ribSurfaces.has(variant)) return ribSurfaces.get(variant);
    const canvas = document.createElement("canvas");
    canvas.width = 224;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const bend = (variant - 1) * 9;
    const tip = 105 + bend;
    ctx.beginPath();
    ctx.moveTo(19, 13);
    ctx.bezierCurveTo(40, 6, 65, 20, 75, 41);
    ctx.bezierCurveTo(108, 61, 135, 65 + bend, 212, tip);
    ctx.bezierCurveTo(152, tip - 9, 97, 96, 61, 71);
    ctx.bezierCurveTo(34, 68, 30, 57, 19, 65);
    ctx.bezierCurveTo(-2, 56, 4, 26, 19, 13);
    ctx.closePath();
    const shell = ctx.createLinearGradient(23, 84, 45, 26);
    shell.addColorStop(0, "#443c31"); shell.addColorStop(.29, "#7a6551");
    shell.addColorStop(.50, "#c3a785"); shell.addColorStop(.68, "#ecd6b5");
    shell.addColorStop(.79, "#fff0ce"); shell.addColorStop(1, "#a88b6d");
    ctx.fillStyle = shell; ctx.fill();
    ctx.save(); ctx.clip();
    for (let i = 0; i < 116; i++) {
      const x = 6 + sample(i * 3 + variant) * 209, y = 12 + sample(i * 7 + 97) * 107;
      ctx.fillStyle = i % 2 ? "#2b221936" : "#fff3d63d";
      ctx.fillRect(x, y, 1 + sample(i + 5) * 5, .8 + sample(i + 6));
    }
    ctx.strokeStyle = "#fff4d4e0"; ctx.lineWidth = 2.3;
    ctx.beginPath(); ctx.moveTo(15, 22); ctx.bezierCurveTo(43, 5, 47, 56, 104, 72);
    ctx.quadraticCurveTo(157, 85 + bend * .8, 210, tip); ctx.stroke();
    ctx.strokeStyle = "#48362678"; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const x = 25 + i * 14, y = 28 + i * 5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 16, y + 12, x + 7, y + 35); ctx.stroke();
    }
    ctx.restore();
    ribSurfaces.set(variant, canvas);
    return canvas;
  }

  function bone(ctx, rootX, rootY, length, thickness, angle, variant, inverted = false) {
    ctx.save();
    ctx.translate(rootX, rootY); ctx.rotate(angle);
    if (inverted) ctx.scale(1, -1);
    ctx.drawImage(ribSurface(variant), -length * .033, -thickness * .80, length * 1.09, thickness * 1.48);
    ctx.restore();
  }

  function boneBars(ctx, hazard, active, progress, time, quiet) {
    const bars = cageBars(hazard, active ? progress : 1), span = hazard.width;
    const left = hazard.x - span / 2;
    const count = quiet ? 7 : 10;
    const step = span / count;
    for (const [index, y] of bars.entries()) {
      const side = index === 0 ? 1 : -1;
      if (!active) {
        ctx.save(); ctx.strokeStyle = "#ffe7acb5"; ctx.lineWidth = 1.5; ctx.setLineDash([7, 7]);
        line(ctx, left, y, left + span, y);
        ctx.restore();
      }
      ctx.save(); ctx.globalAlpha *= active ? .87 : .19;
      const length = step * 1.01;
      for (let i = 0; i < count - 1; i++) {
        const x = left + step * i - step * .18;
        bone(ctx, x, y - side * step * 1.28, length, step * .44, side * .12, i % 4, side < 0);
      }
      ctx.restore();
      for (let i = 0; i < count; i++) {
        const x = left + step * (i + .34);
        const length = Math.max(hazard.thickness * 1.5, step * (1.22 + .50 * sample(i + index * 17)));
        const angle = side * (.82 + .38 * sample(i + index * 3 + 14));
        const rootX = x - Math.cos(angle) * length;
        const rootY = y - side * (Math.abs(Math.sin(angle)) * length + hazard.thickness * .10);
        ctx.save();
        ctx.globalAlpha *= active ? 1 : .19;
        disc(ctx, x, y, hazard.thickness * 2.15, "#ffc570", .37);
        bone(ctx, rootX, rootY, length, Math.max(hazard.thickness * 1.68, step * .35), angle, i % 4, side < 0);
        if (active && !quiet && i % 2 === 0) embers(ctx, x, y, hazard.thickness * 2.5, time, palettes.ivory, 7, i);
        ctx.restore();
      }
    }
  }

  function bonefall(ctx, hazard, active, progress, time, quiet) {
    const { x, y, width, height } = hazard;
    const hot = active && progress > .36;
    ctx.save();
    // Dust curtains mark opposite hit edges without suggesting a solid box.
    const falloff = ctx.createLinearGradient(0, y - height, 0, y + height);
    falloff.addColorStop(0, "#efbf79da"); falloff.addColorStop(.5, "#bd935317");
    falloff.addColorStop(1, "#efbf79da");
    ctx.lineWidth = hot ? 1.8 : 1.25; ctx.strokeStyle = falloff;
    if (!hot) ctx.setLineDash([5, 13]);
    for (const side of [-1, 1]) {
      line(ctx, x + side * width, y - height, x + side * width, y + height);
      disc(ctx, x + side * width, y + height * .86, width * .72, "#dcad70", hot ? .36 : .20);
      if (!quiet) embers(ctx, x + side * width, y + height * .46, width * .77, time, palettes.ivory, 11, side + 129);
    }
    ctx.restore();
    if (!active) return;
    const head = y - height - Math.max(0, .45 - progress) * viewport.height * .49;
    ctx.save();
    ctx.globalAlpha *= hot ? 1 : .69;
    const path = { x1: x, y1: head - height * 1.8, x2: x, y2: head + height * .92, width: width * .48 };
    beam(ctx, path, "ivory", time, .56, quiet);
    bone(ctx, x + width * .09, head - height, height * 1.9, width * .86, Math.PI / 2, 1);
    if (hot) {
      disc(ctx, x, y, width * 1.28, "#ffbe65", .52 * (1 - progress));
      if (!quiet) embers(ctx, x, y, width * 1.40, time, palettes.ivory, 21, 63);
    }
    ctx.restore();
  }

  function beamSurface(name) {
    if (beamSurfaces.has(name)) return beamSurfaces.get(name);
    const color = palettes[name];
    const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 96;
    const ctx = canvas.getContext("2d");
    const cross = ctx.createLinearGradient(0, 0, 0, 96);
    cross.addColorStop(0, color.core + "00"); cross.addColorStop(.22, color.glow);
    cross.addColorStop(.40, color.rim); cross.addColorStop(.49, color.core);
    cross.addColorStop(.51, color.core); cross.addColorStop(.59, name === "prism" ? "#ad7dffaf" : color.rim);
    cross.addColorStop(.78, color.glow); cross.addColorStop(1, color.core + "00");
    ctx.fillStyle = cross; ctx.fillRect(0, 0, 256, 96);
    const length = ctx.createLinearGradient(0, 0, 256, 0);
    length.addColorStop(0, "#ffffff00"); length.addColorStop(.012, "#ffffff");
    length.addColorStop(.86, "#fffffff2"); length.addColorStop(1, "#ffffff00");
    ctx.globalCompositeOperation = "destination-in"; ctx.fillStyle = length; ctx.fillRect(0, 0, 256, 96);
    beamSurfaces.set(name, canvas);
    return canvas;
  }

  function beam(ctx, path, name, time, opacity, quiet) {
    const dx = path.x2 - path.x1, dy = path.y2 - path.y1, length = Math.hypot(dx, dy);
    if (length < .01) return;
    const palette = palettes[name], width = Math.max(1, path.width);
    ctx.save();
    ctx.translate(path.x1, path.y1); ctx.rotate(Math.atan2(dy, dx));
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha *= opacity;
    ctx.drawImage(beamSurface(name), 0, -width * 1.55, length, width * 3.1);
    const strands = quiet ? 1 : 3;
    for (let i = 0; i < strands; i++) {
      ctx.strokeStyle = i ? palette.rim : palette.core;
      ctx.lineWidth = Math.max(.65, width * (i ? .045 : .10));
      ctx.beginPath();
      for (let j = 0; j <= 19; j++) {
        const t = j / 19, taper = Math.sin(Math.PI * t);
        const distortion = name === "prism" ? .07 : .30;
        const y = taper * Math.sin(t * 31 + i * 2.1 - time * (4 + i)) * width * (i ? distortion : .045);
        if (j === 0) ctx.moveTo(length * t, y); else ctx.lineTo(length * t, y);
      }
      ctx.stroke();
    }
    if (!quiet) {
      ctx.fillStyle = palette.dust;
      for (let i = 0; i < 8; i++) {
        const t = (time * (.27 + sample(i + 9) * .32) + sample(i + 1)) % 1;
        const y = width * Math.sin(i * 7.27 + time * 4) * (.28 + .32 * t);
        ctx.fillRect(length * t, y, 2 + 8 * sample(i + 19), .9);
      }
    }
    ctx.restore();
  }

  function boneNova(ctx, geometry, time, alpha, quiet) {
    const core = geometry.segments[0];
    if (!core) return;
    for (const path of geometry.segments) {
      beam(ctx, path, "ivory", time, alpha * .81, quiet);
      const dx = path.x2 - path.x1, dy = path.y2 - path.y1, angle = Math.atan2(dy, dx);
      for (let i = 0; i < (quiet ? 2 : 4); i++) {
        const t = ((i + .48) / 4 + time * .23) % 1;
        bone(ctx, path.x1 + dx * t, path.y1 + dy * t, path.width * (2.3 - t), path.width * .54, angle, i);
      }
    }
    const x = core.x1, y = core.y1;
    const r = Math.max(32, core.width * 2.9);
    for (const ring of geometry.circles) {
      ctx.save(); ctx.globalAlpha *= alpha;
      const spread = ctx.createRadialGradient(ring.x, ring.y, Math.max(0, ring.radius - core.width * 2.1), ring.x, ring.y, ring.radius + core.width);
      spread.addColorStop(0, "#ff983600"); spread.addColorStop(.45, "#df724746");
      spread.addColorStop(.68, "#ffd99cd4"); spread.addColorStop(.79, "#fff4d8" ); spread.addColorStop(1, "#fff4d800");
      ctx.fillStyle = spread;
      ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.radius + core.width, 0, TAU); ctx.fill();
      const pieces = quiet ? 15 : 29;
      for (let i = 0; i < pieces; i++) {
        const a = i / pieces * TAU - time * .06;
        const orbit = (ring.radius + ring.innerRadius) / 2;
        bone(ctx, ring.x + Math.cos(a) * orbit, ring.y + Math.sin(a) * orbit, core.width * 2.2, core.width * .70, a - 1.4, i % 4);
      }
      ctx.restore();
    }
    ctx.save(); ctx.globalAlpha *= alpha;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + time * .16;
      bone(ctx, x + Math.cos(a) * r * .46, y + Math.sin(a) * r * .46, r * (1.05 + sample(i) * .30), r * .65, a, i % 4);
    }
    disc(ctx, x, y, r * 2.9, "#ffb75a", .51);
    disc(ctx, x, y, r * .88, "#fff3cb", .77);
    if (!quiet) embers(ctx, x, y, r * 3.35, time, palettes.ivory, 37, 12);
    ctx.restore();
  }

  function chitinSurface() {
    if (chitinGrain) return chitinGrain;
    chitinGrain = document.createElement("canvas"); chitinGrain.width = 480; chitinGrain.height = 304;
    const ctx = chitinGrain.getContext("2d");
    for (let i = 0; i < 2480; i++) {
      const x = sample(i * 2 + 321) * 480, y = sample(i * 3 + 79) * 304;
      const fade = Math.sin(x / 480 * Math.PI) * .67;
      const size = 1 + sample(i + 159) * 2.65;
      ctx.globalAlpha = fade * (.21 + sample(i + 44) * .48);
      ctx.fillStyle = i % 2 ? "#021813" : "#8bad64";
      ctx.beginPath(); ctx.ellipse(x, y, size, size * .35, .56, 0, TAU); ctx.fill();
    }
    return chitinGrain;
  }

  function jaw(ctx, left, right, lip, depth, side, time, alpha, quiet, terminal = false) {
    const span = Math.max(1, right - left), h = Math.max(1, depth);
    ctx.save();
    ctx.translate(left, lip); ctx.scale(span / 100, side * h / 100);
    ctx.globalAlpha *= alpha;
    const shellGradient = ctx.createLinearGradient(0, 38, 100, 58);
    shellGradient.addColorStop(0, "#091c1b00"); shellGradient.addColorStop(.08, "#15392b");
    shellGradient.addColorStop(.22, "#0b3925"); shellGradient.addColorStop(.45, "#254630");
    shellGradient.addColorStop(.70, terminal ? "#0c261fd0" : "#163624");
    shellGradient.addColorStop(1, "#081c1c00");
    const shell = new Path2D();
    shell.moveTo(1, 6); shell.bezierCurveTo(8, 39, 10, 68, 34, 81);
    shell.bezierCurveTo(56, 94, 70, 64, 97, 72);
    shell.bezierCurveTo(90, 58, 96, 29, 100, 26);
    shell.bezierCurveTo(74, 41, 73, 22, 55, 25);
    shell.bezierCurveTo(29, 32, 16, 22, 1, 6); shell.closePath();
    ctx.fillStyle = shellGradient; ctx.fill(shell);
    ctx.save(); ctx.clip(shell);
    const contours = quiet ? 6 : 10;
    for (let i = 0; i < contours; i++) {
      const x = (i + .35) * 84 / contours;
      const grad = ctx.createLinearGradient(x, 77, x + 12, 20);
      grad.addColorStop(0, "#03131200"); grad.addColorStop(.50, "#072821");
      grad.addColorStop(.75, "#6d8f57de"); grad.addColorStop(1, "#32a05a12");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.moveTo(x - 3, 13); ctx.bezierCurveTo(x + 18, 32, x - 4, 55, x + 18, 89);
      ctx.bezierCurveTo(x + 5, 85, x + 6, 66, x + 6, 52); ctx.bezierCurveTo(x + 11, 28, x - 7, 21, x - 3, 13); ctx.fill();
    }
    if (!quiet) ctx.drawImage(chitinSurface(), 0, 0, 100, 100);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (let i = 0; i < contours + 2; i++) {
      const x = 9 + i / (contours + 2) * 75, y = 28 + sample(i + 3) * 47;
      const pulse = .49 + .20 * Math.sin(time * 6 - i * .81);
      const vein = new Path2D();
      vein.moveTo(x - 3, y + 15);
      for (let j = 0; j <= 6; j++) {
        const curl = (sample(i * 11 + j + 270) - .5) * (j ? 3.9 : 1.9);
        vein.lineTo(x + j * (sample(i + 2) - .18) + curl, y + 13 - j * 3.75);
        if (j > 0 && j < 6 && (j + i) % 3 === 0) {
          vein.moveTo(x + j * (sample(i + 2) - .18) + curl, y + 13 - j * 3.75);
          vein.lineTo(x + curl - 3, y + 11 - j * 3.75);
          vein.lineTo(x + curl - 6, y + 8 - j * 3.75);
          vein.moveTo(x + j * (sample(i + 2) - .18) + curl, y + 13 - j * 3.75);
        }
      }
      ctx.globalAlpha = alpha * pulse * (1 - Math.max(0, x - 60) / 39);
      ctx.strokeStyle = "#49ff794a"; ctx.lineWidth = 1.1; ctx.stroke(vein);
      ctx.strokeStyle = "#b7ff8fd0"; ctx.lineWidth = .18; ctx.stroke(vein);
    }
    ctx.restore();
    const crest = ctx.createLinearGradient(0, 0, 100, 0);
    crest.addColorStop(0, "#54bf7400"); crest.addColorStop(.09, "#bbff98ea");
    crest.addColorStop(.29, "#50ec86b1"); crest.addColorStop(.66, "#3dd6697a"); crest.addColorStop(1, "#39d26800");
    ctx.strokeStyle = crest;
    ctx.lineWidth = .42;
    ctx.stroke(shell);
    const teeth = quiet ? 7 : 11;
    for (let i = 0; i < teeth; i++) {
      const t = i / teeth, x = 4 + t * 73 + (sample(i + 162) - .5) * 4;
      const root = 13 + Math.sin(t * 2.8) * 19 + 2.9 * sample(i + 29);
      const tip = 2 + sample(i + 176) * 12;
      const tooth = ctx.createLinearGradient(x - 5, root, x + 2.6, tip);
      tooth.addColorStop(0, "#102b24"); tooth.addColorStop(.38, "#306e43");
      tooth.addColorStop(.74, "#74bb63"); tooth.addColorStop(1, "#d9ffc1");
      ctx.fillStyle = tooth;
      ctx.beginPath(); ctx.moveTo(x - 5, root + 2); ctx.bezierCurveTo(x - 4, root * .78, x - 2, tip + 7, x + 2, tip);
      ctx.bezierCurveTo(x + 1, tip + 10, x + 5, root - 9, x + 4, root + 2); ctx.fill();
      const facet = ctx.createLinearGradient(x, root, x + 2, tip);
      facet.addColorStop(0, "#061a15");
      facet.addColorStop(.69, "#266b36");
      facet.addColorStop(1, "#a9efa8");
      ctx.fillStyle = facet;
      ctx.beginPath(); ctx.moveTo(x - .7, root + 2);
      ctx.bezierCurveTo(x - .8, root * .82, x + .3, tip + 8, x + 2, tip);
      ctx.bezierCurveTo(x + 1, tip + 10, x + 5, root - 9, x + 4, root + 2);
      ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - .5, root * .90);
      ctx.bezierCurveTo(x - .8, root * .82, x + .6, tip + 7, x + 2, tip);
      ctx.strokeStyle = "#d7ffaf94"; ctx.lineWidth = .13; ctx.stroke();
    }
    ctx.restore();
    if (!quiet && alpha > .5) {
      for (let i = 0; i < 5; i++) {
        const x = left + span * (.07 + .15 * i), y = lip + side * h * .17;
        disc(ctx, x, y, 23 + sample(i + 8) * 18, "#87f65d", alpha * .28);
        embers(ctx, x, y, 27, time, palettes.chitin, 5, i + 18);
      }
    }
  }

  function claws(ctx, hazard, active, progress, time, quiet) {
    const gap = active ? pincerGap(hazard, progress) : hazard.gap;
    const halfWidth = hazard.shock && progress > .78 ? hazard.width * 1.7 : hazard.width;
    for (const side of [-1, 1]) {
      const lip = hazard.y + side * gap;
      const depth = Math.max(1, side < 0 ? lip : viewport.height - lip);
      if (active) jaw(ctx, hazard.x - halfWidth, hazard.x + halfWidth, lip, depth, side, time, .91, quiet);
      ctx.save();
      ctx.strokeStyle = active ? "#adffe09d" : "#d8ffb7bd"; ctx.lineWidth = 1.4;
      if (!active) ctx.setLineDash([7, 8]);
      line(ctx, hazard.x - halfWidth, lip, hazard.x + halfWidth, lip);
      ctx.restore();
    }
  }

  function prismBurst(ctx, x, y, radius, time, alpha, quiet) {
    disc(ctx, x, y, radius * 2.2, "#668bff", alpha * .47);
    disc(ctx, x, y, radius * .75, "#c8feff", alpha * .94);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-.17);
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha *= alpha;
    for (const [i, color] of ["#8ee8ff", "#b898ff", "#f1ffff"].entries()) {
      ctx.rotate(.04);
      const size = radius * (1 - .18 * i);
      const fill = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, size * 1.4));
      fill.addColorStop(0, color); fill.addColorStop(.26, color + "b6"); fill.addColorStop(1, color + "00");
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(-size * 1.4, 0); ctx.quadraticCurveTo(-2, -size * .1, 0, -size);
      ctx.quadraticCurveTo(size * .14, -2, size * 1.4, 0); ctx.quadraticCurveTo(2, size * .1, 0, size);
      ctx.quadraticCurveTo(-size * .14, 2, -size * 1.4, 0); ctx.fill();
    }
    ctx.restore();
    if (!quiet) embers(ctx, x, y, radius * 1.72, time, palettes.prism, 13, 84);
  }

  function hologram(ctx, node, time, alpha, quiet) {
    const r = node.radius;
    ctx.save(); ctx.translate(node.x, node.y); ctx.scale(r, r);
    ctx.globalAlpha *= alpha;
    const shape = new Path2D();
    shape.moveTo(-1.48, -.13);
    shape.bezierCurveTo(-.90, -.62, -.28, -.53, -.42, -1.27);
    shape.bezierCurveTo(.22, -.93, .26, -.36, .98, -.13);
    shape.bezierCurveTo(1.26, -.04, 1.55, -.04, 1.94, -.31);
    shape.bezierCurveTo(1.71, .02, 1.22, .26, .56, .24);
    shape.bezierCurveTo(-.06, .25, -.05, .92, -.54, 1.13);
    shape.bezierCurveTo(-.44, .67, -.95, .46, -1.29, .33);
    shape.bezierCurveTo(-1.55, .22, -1.70, .01, -1.48, -.13); shape.closePath();
    const shell = ctx.createLinearGradient(-.31, -1.25, .24, 1.1);
    shell.addColorStop(0, "#91f9ffaa"); shell.addColorStop(.29, "#41d9ffa7");
    shell.addColorStop(.55, "#164d996e"); shell.addColorStop(.82, "#68e8ffce"); shell.addColorStop(1, "#a4fbffae");
    ctx.fillStyle = shell; ctx.fill(shape);
    ctx.strokeStyle = "#52b6ff75"; ctx.lineWidth = .16; ctx.stroke(shape);
    ctx.strokeStyle = "#bcfeffdc"; ctx.lineWidth = .052; ctx.stroke(shape);
    ctx.save(); ctx.clip(shape); ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "#8adfff6b"; ctx.lineWidth = .023;
    for (let i = -8; i <= 8; i++) {
      const y = i * .145 + (time * .24) % .145;
      line(ctx, -1.7, y, 1.91, y);
    }
    const y = (time * 1.32) % 2.4 - 1.22;
    ctx.strokeStyle = "#96fdffc0"; ctx.lineWidth = .07;
    line(ctx, -1.7, y, 1.91, y);
    ctx.strokeStyle = "#a7f3ffd2"; ctx.lineWidth = .04;
    ctx.beginPath(); ctx.moveTo(-1.46, .08);
    ctx.bezierCurveTo(-.42, -.42, .16, .28, 1.81, -.16); ctx.stroke();
    ctx.restore(); ctx.restore();
    disc(ctx, node.x, node.y, r * 1.48, "#4eccff", alpha * .25);
    if (!quiet) embers(ctx, node.x + r * .44, node.y, r * 2.1, time, palettes.prism, 13, node.y);
    if (node.health < node.maxHealth) {
      ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = "#93f4e9"; ctx.lineWidth = 1.7;
      line(ctx, node.x - r * .55, node.y + r * 1.11, node.x + r * (node.health / node.maxHealth * 1.1 - .55), node.y + r * 1.11);
      ctx.restore();
    }
  }

  function decoys(ctx, hazard, active, progress, time, quiet) {
    const hot = active && progress > .61 && progress < .82;
    for (const node of hazard.nodes) {
      if (node.health <= 0) continue;
      beam(ctx, { x1: node.x, y1: node.y, x2: hazard.aimX, y2: hazard.aimY,
        width: hot ? hazard.thickness * 1.45 : 1.40 }, "prism", time, hot ? .92 : .34, quiet);
      hologram(ctx, node, time + node.y * .031, active ? .92 : .48, quiet);
      if (hot) prismBurst(ctx, node.x, node.y, node.radius, time, .75, quiet);
    }
    if (boss) {
      ctx.save(); ctx.fillStyle = "#fff4cf"; ctx.strokeStyle = "#fff4cf";
      mechanicDiamond(ctx, boss.x, boss.y - boss.height * .38, 7);
      ctx.restore();
    }
  }

  function drawMechanic(ctx, hazard, { active, progress, quiet }) {
    const time = quiet ? 0 : hazard.age;
    const simple = quiet || visualQuality.id === "low";
    switch (hazard.kind) {
      case "ribCage": boneBars(ctx, hazard, active, progress, time, simple); return true;
      case "bonefall": bonefall(ctx, hazard, active, progress, time, simple); return true;
      case "pincerLock": claws(ctx, hazard, active, progress, time, simple); return true;
      case "mirrorDecoys": decoys(ctx, hazard, active, progress, time, simple); return true;
      default: return false;
    }
  }

  function drawUltimate(ctx, hazard, geometry, target, { active, quiet, alpha }) {
    const time = quiet ? 0 : hazard.age;
    const simple = quiet || visualQuality.id === "low";
    switch (hazard.ultimateKind) {
      case "boneNova": boneNova(ctx, geometry, time, alpha, simple); return true;
      case "pincer":
        for (const rect of geometry.rects) {
          const upper = rect.y < hazard.gapY;
          const right = Math.max(rect.x + rect.width, target.x + target.width * .33);
          // The shell fades into the creature beyond the collision box.
          jaw(ctx, rect.x, right, upper ? rect.y + rect.height : rect.y, rect.height * 1.19,
            upper ? -1 : 1, time, alpha, simple, true);
        }
        for (const path of geometry.segments) beam(ctx, path, "chitin", time, alpha, simple);
        return true;
      case "mirrorArray":
        for (const path of geometry.segments) beam(ctx, path, "prism", time, alpha * .76, simple);
        return true;
      default: return false;
    }
  }

  function drawPrismNode(ctx, node, material, time, alpha, quiet) {
    const r = node.radius || 18;
    prismBurst(ctx, node.x, node.y, r * 1.8, time, alpha * .74, quiet || visualQuality.id === "low");
    ultimateCrystal(ctx, node.x, node.y, r * 2.4, (node.angle || 0) + Math.sin(time) * .08, material, alpha);
    disc(ctx, node.x - r * .36, node.y - r * .35, r * .61, "#e8ffff", alpha);
  }

  return Object.freeze({ drawMechanic, drawUltimate, drawPrismNode });
})();
