"use strict";

// Geometry-first presentation. Every bright pixel is clipped to the same primitive
// used by collision. Decorative wake/refraction never owns damage or a new clock.
const NextgenVfx = (() => {
  const TAU = Math.PI * 2;
  const budgets = Object.freeze({ low: { facets: 180, strands: 8, samples: 0 },
    medium: { facets: 420, strands: 16, samples: 1 }, high: { facets: 760, strands: 28, samples: 2 } });
  const stats = { facets: 0, samples: 0, atlasDraws: 0, effects: 0, tier: "high", peakFacets: 0 };
  const atlases = new Map();
  const waterVertices = new Float32Array(14 * 14 * 2);
  const palette = Array.from({ length: 128 }, (_, i) => {
    const t = i / 127;
    return `rgb(${Math.round(3 + 69 * t * t)},${Math.round(23 + 157 * t)},${Math.round(37 + 178 * t)})`;
  });
  let sampleCanvas, sampleContext, basaltTile;
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const fract = v => v - Math.floor(v);
  const seed = i => fract(Math.sin(i * 127.1 + 31.7) * 43758.5453);
  const tier = () => budgets[typeof visualQuality === "undefined" ? "high" : visualQuality.id] || budgets.high;
  const calm = () => typeof quietCombatMotion === "function" && quietCombatMotion();
  const motionTime = time => calm() ? 0 : time;

  function beginFrame() {
    stats.peakFacets = Math.max(stats.peakFacets, stats.facets);
    stats.facets = stats.samples = stats.atlasDraws = stats.effects = 0;
    stats.tier = typeof visualQuality === "undefined" ? "high" : visualQuality.id;
  }
  function phase(h) {
    const age = Math.max(0, h.age || 0), warning = Math.max(.001, h.warning || .001);
    if (age < warning) {
      const p = age / warning;
      return { name: p < .24 ? "tell" : p < .64 ? "gather" : p < .88 ? "charge" : "release", progress: p, active: false };
    }
    const p = clamp01((age - warning) / Math.max(.001, h.duration || 1));
    return { name: p < .14 ? "contact" : p < .70 ? "sustain" : p < .88 ? "fracture" : "residue", progress: p, active: true };
  }
  function atlas(name) {
    if (atlases.has(name)) return atlases.get(name);
    if (typeof Image === "undefined") return null;
    const item = { image: new Image(), ready: false };
    item.image.onload = () => { item.ready = item.image.naturalWidth >= 4 && item.image.naturalHeight >= 4; };
    item.image.onerror = () => { item.ready = false; };
    item.image.src = `assets/vfx/nextgen/${name}-atlas.webp`;
    atlases.set(name, item);
    return item;
  }
  function stamp(ctx, name, time, x, y, width, height, alpha, rotation = 0) {
    const item = atlas(name);
    if (!item?.ready || stats.atlasDraws >= (stats.tier === "high" ? 16 : 8)) return;
    const frame = Math.min(15, Math.floor(fract(motionTime(time) * .38) * 16));
    const sw = item.image.naturalWidth / 4, sh = item.image.naturalHeight / 4;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.globalAlpha = alpha;
    ctx.drawImage(item.image, frame % 4 * sw, Math.floor(frame / 4) * sh, sw, sh, -width / 2, -height / 2, width, height);
    ctx.restore(); stats.atlasDraws++;
  }
  function polygon(ctx, points, fill, alpha = 1) {
    if (stats.facets >= tier().facets) return;
    stats.facets++;
    ctx.beginPath(); ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath(); ctx.fillStyle = fill; ctx.globalAlpha = alpha; ctx.fill();
  }
  function ringClip(ctx, x, y, outer, inner = 0) {
    ctx.beginPath(); ctx.arc(x, y, outer, 0, TAU);
    if (inner > 0) ctx.arc(x, y, Math.min(inner, outer), 0, TAU, true);
    ctx.clip();
  }
  function backdrop(ctx, x, y, r) {
    if (calm() || stats.samples >= tier().samples || !(r > 2) || !ctx.canvas) return null;
    const tr = ctx.getTransform?.();
    // Only axis-aligned canvas transforms: rotated rays must not sample the HUD.
    if (!tr || tr.a <= 0 || tr.d <= 0 || Math.abs(tr.b) > .001 || Math.abs(tr.c) > .001) return null;
    sampleCanvas ||= document.createElement("canvas");
    if (sampleCanvas.width !== 224) { sampleCanvas.width = sampleCanvas.height = 224; sampleContext = sampleCanvas.getContext("2d"); }
    sampleContext ||= sampleCanvas.getContext("2d");
    sampleContext.clearRect(0, 0, 224, 224);
    sampleContext.drawImage(ctx.canvas, (x - r) * tr.a + tr.e, (y - r) * tr.d + tr.f,
      r * 2 * tr.a, r * 2 * tr.d, 0, 0, 224, 224);
    stats.samples++;
    return sampleCanvas;
  }

  function drawWaterSection(ctx, crestAt, top, bottom, direction, age, width, material, warning, quiet) {
    if (!(width > 0 && bottom > top)) return false;
    stats.effects++;
    const time = quiet ? 0 : age, alpha = warning ? .43 : .94;
    const quality = tier(), columns = stats.tier === "low" ? 7 : stats.tier === "medium" ? 10 : 13;
    const rows = Math.max(3, Math.min(stats.tier === "low" ? 8 : 13, Math.ceil((bottom - top) / 28)));
    const wave = (y, q) => Math.sin(y * .021 + time * 1.8 + q * 2.8) * .055 + Math.sin(y * .063 - time * 2.7) * .023;
    // One shared fixed-capacity vertex buffer; no per-facet objects during play.
    const stride = (rows + 1) * 2;
    for (let c = 0; c <= columns; c++) for (let r = 0; r <= rows; r++) {
      const q = c / columns, y = top + (bottom - top) * r / rows;
      const roll = wave(y, q), curl = Math.sin(q * Math.PI) * (q > .60 ? 1.3 : .5);
      const i = c * stride + r * 2;
      waterVertices[i] = crestAt(y) + direction * width * (-1 + 2 * q + roll * Math.sin(q * Math.PI) * 2.1);
      waterVertices[i + 1] = y - width * (.23 * curl + roll);
    }
    ctx.save(); ctx.beginPath();
    for (let r = 0; r <= rows; r++) { const y = top + (bottom - top) * r / rows; const x = crestAt(y) - width; if (!r) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    for (let r = rows; r >= 0; r--) { const y = top + (bottom - top) * r / rows; ctx.lineTo(crestAt(y) + width, y); }
    ctx.closePath(); ctx.clip();
    // One continuous mass under the tessellation prevents holes when the frame
    // budget trims small facets. The turn-over lip is dark on its underside.
    const center = crestAt((top + bottom) / 2);
    const depth = ctx.createLinearGradient(center - direction * width, 0, center + direction * width, 0);
    depth.addColorStop(0, "#031a2b"); depth.addColorStop(.25, "#075470"); depth.addColorStop(.56, "#1595ac");
    depth.addColorStop(.70, "#76d8de"); depth.addColorStop(.82, "#082638"); depth.addColorStop(1, "#217b91");
    ctx.globalAlpha = alpha; ctx.fillStyle = depth; ctx.fillRect(center - width * 3, top, width * 6, bottom - top);
    for (let c = 0; c < columns; c++) {
      const u = c / columns;
      for (let r = 0; r < rows; r++) {
        const y1 = top + (bottom - top) * r / rows;
        if (stats.facets >= quality.facets) continue;
        const p1 = c * stride + r * 2, p2 = (c + 1) * stride + r * 2;
        // Analytic normal-light response: bright slope, occluded curl, wet glints.
        const normal = Math.sin((u + .16) * Math.PI) * .68 + wave(y1, u) * 2.6;
        const undercurl = u > .72 ? .26 : 1;
        const light = clamp01((.16 + normal) * undercurl);
        ctx.beginPath();ctx.moveTo(waterVertices[p1],waterVertices[p1+1]);
        ctx.lineTo(waterVertices[p2],waterVertices[p2+1]);ctx.lineTo(waterVertices[p2+2],waterVertices[p2+3]);
        ctx.lineTo(waterVertices[p1+2],waterVertices[p1+3]);ctx.closePath();
        ctx.fillStyle=palette[Math.round(light*127)];ctx.globalAlpha=alpha*.86;ctx.fill();stats.facets++;
      }
    }
    // Fine GPU normals are a secondary material pass, not a stand-in for volume.
    if (!quiet && stats.tier !== "low" && typeof drawHadalSurface === "function") {
      ctx.globalAlpha = .20;
      drawHadalSurface(ctx, center - width, top, width * 2, bottom - top, time * .65, direction > 0);
    }
    const stamps = Math.min(3, Math.ceil((bottom - top) / 160));
    for (let s = 0; s < stamps; s++) {
      const y = top + (bottom - top) * (s + .5) / stamps;
      stamp(ctx, "water", age + s * .17, crestAt(y), y, (bottom - top) / stamps * 1.35, width * 3.0, alpha * .72, direction * Math.PI / 2);
    }
    const crestX = y => crestAt(y) + direction * width * (.45 + wave(y, .78));
    for (let lip = 0; lip < 3; lip++) {
      ctx.beginPath();
      for (let j = 0; j <= 44; j++) { const y = top + (bottom - top) * j / 44;
        const x = crestX(y) - direction * lip * width * .11 + Math.sin(y * .16 + time * 2) * width * .025;
        if (!j) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.strokeStyle = lip === 0 ? "#e5ffff" : lip === 1 ? "#9cdfdf" : "#07364e";
      ctx.lineWidth = lip === 0 ? Math.max(1.3, width * .042) : Math.max(2, width * .11);
      ctx.globalAlpha = alpha * (lip === 0 ? .71 : .56); ctx.stroke();
    }
    // Foam has porous clumps, branching veins and advected droplets, never disks.
    ctx.fillStyle = "#e2fafa";
    const flecks = quality.strands * 3;
    for (let i = 0; i < flecks; i++) {
      const t = fract(seed(i) + time * (.04 + seed(i + 50) * .055));
      const y = top + (bottom - top) * t;
      const x = crestX(y) - direction * width * seed(i + 80) * .52;
      const size = .5 + seed(i + 6) * Math.min(3.7, width * .08);
      ctx.globalAlpha = alpha * (.25 + seed(i + 2) * .65);
      ctx.beginPath(); ctx.ellipse(x,y,size*1.2,size*.62,-.4,0,TAU); ctx.fill();
    }
    // Authoritative outer edges stay explicit through both dark and bright folds.
    ctx.strokeStyle = "#b6f6ff"; ctx.globalAlpha = warning ? .45 : .78; ctx.lineWidth = 1.1;
    for (const side of [-1, 1]) { ctx.beginPath();
      for (let j = 0; j <= rows; j++) { const y = top + (bottom - top) * j / rows; const x = crestAt(y) + side * width;
        if (!j) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.restore(); return true;
  }

  function basaltTexture() {
    if (basaltTile) return basaltTile;
    basaltTile = document.createElement("canvas"); basaltTile.width = basaltTile.height = 192;
    const c = basaltTile.getContext("2d"), pixels = c.createImageData(192, 192);
    for (let y = 0; y < 192; y++) for (let x = 0; x < 192; x++) {
      const n = seed(x + y * 192), veins = Math.sin(x * .07 + Math.sin(y * .12) * 2.1) * Math.sin(y * .09 + Math.sin(x * .06) * 1.6);
      const hot = Math.max(0, 1 - Math.abs(veins) * 28), rough = 21 + n * 29 + Math.sin(x * .21 + y * .13) * 6;
      const i = (y * 192 + x) * 4;
      pixels.data[i] = rough + hot * 131; pixels.data[i + 1] = rough * .67 + hot * 41; pixels.data[i + 2] = rough * .69 + hot * 12; pixels.data[i + 3] = 255;
    }
    c.putImageData(pixels, 0, 0); return basaltTile;
  }
  function rock(ctx, x, y, size, angle, time, alpha, hot = true) {
    const turn = angle + motionTime(time) * .08;
    const points = [];
    for (let i = 0; i < 6; i++) { const a = turn + i / 6 * TAU, r = size * (.63 + seed(i + angle * 19) * .37); points.push([x + Math.cos(a) * r, y + Math.sin(a) * r * .70]); }
    for (let i = 0; i < 6; i++) {
      const p = points[i], q = points[(i + 1) % 6];
      polygon(ctx, [x - size * .16, y - size * .20, ...p, ...q], ["#574442", "#2f2a31", "#171924", "#27232c", "#63443b", "#8b5b43"][i], alpha);
    }
    ctx.save(); ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath(); ctx.clip(); ctx.globalCompositeOperation = "soft-light"; ctx.globalAlpha = alpha * .88;
    ctx.drawImage(basaltTexture(), x - size, y - size, size * 2, size * 2); ctx.restore();
    if (hot) {
      ctx.beginPath(); ctx.moveTo(points[4][0], points[4][1]); ctx.lineTo(x - size * .09, y + size * .07); ctx.lineTo(points[1][0], points[1][1]);
      ctx.strokeStyle = "#e66b32"; ctx.lineWidth = Math.max(.7, size * .045); ctx.globalAlpha = alpha * .90; ctx.stroke();
      ctx.strokeStyle = "#ffc06c"; ctx.lineWidth = .6; ctx.globalAlpha = alpha * .58; ctx.stroke();
    }
  }
  function drawMagmaFissure(ctx, line, material, time, alpha) {
    const length = Math.hypot(line.x2 - line.x1, line.y2 - line.y1), width = line.width;
    if (!(length > 0 && width > 0)) return false;
    stats.effects++; time = motionTime(time);
    ctx.save(); ctx.translate(line.x1, line.y1); ctx.rotate(Math.atan2(line.y2 - line.y1, line.x2 - line.x1));
    ctx.beginPath(); ctx.rect(0, -width / 2, length, width); ctx.clip();
    const heat = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
    heat.addColorStop(0, "#16101a"); heat.addColorStop(.22, "#432225"); heat.addColorStop(.43, "#d64a1b");
    heat.addColorStop(.52, "#ffbf58"); heat.addColorStop(.65, "#6c2116"); heat.addColorStop(1, "#15141e");
    ctx.fillStyle = heat; ctx.globalAlpha = alpha; ctx.fillRect(0, -width / 2, length, width);
    // Cooled floating crust breaks the molten channel into irregular islands.
    const tileSpan = Math.max(65, width * 1.4), tileCount = Math.min(18, Math.ceil(length / tileSpan) + 1);
    const crust = basaltTexture();
    for (let i = 0; i < tileCount; i++) {
      ctx.globalAlpha = alpha * .65;
      ctx.drawImage(crust, i * tileSpan - (time * 8 % tileSpan), -width / 2, tileSpan + 1, width);
    }
    const blocks = Math.min(stats.tier === "high" ? 22 : stats.tier === "medium" ? 14 : 8, Math.ceil(length / 24));
    for (let i = 0; i < blocks; i++) {
      const x = length * (i + .35) / blocks, side = i % 2 ? 1 : -1;
      const size = Math.min(width * (.34 + seed(i) * .25), length / blocks * .95);
      rock(ctx, x, side * width * (.30 + .06 * Math.sin(time + i)), size, i * 2.399, time, alpha);
    }
    const tendrils = tier().strands;
    ctx.strokeStyle = "#ffdb8e"; ctx.lineCap = "round";
    for (let i = 0; i < tendrils; i++) {
      const x = fract(seed(i + 93) - time * .055) * length;
      const y = (seed(i + 65) - .5) * width * .4, reach = width * (.06 + .13 * seed(i));
      ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 9, y - reach, x + 21, y + reach, x + 34, y - reach * .3);
      ctx.globalAlpha = alpha * (.24 + .32 * seed(i + 43)); ctx.lineWidth = .6 + seed(i + 1) * 1.5; ctx.stroke();
    }
    for (let i = 0; i < Math.min(3, Math.ceil(length / 300)); i++) {
      stamp(ctx, "magma", time + i * .19, (i + .5) * length / Math.min(3, Math.ceil(length / 300)), 0,
        Math.max(100, width * 1.7), width * 1.7, alpha * .62);
    }
    ctx.restore(); return true;
  }
  function drawEruption(ctx, circle, material, age, alpha) {
    const { x, y, radius: r } = circle;
    if (!(r > 0)) return;
    stats.effects++; const time = motionTime(age);
    ctx.save(); ringClip(ctx, x, y, r, circle.innerRadius || 0);
    const heat = ctx.createRadialGradient(x, y + r * .20, 0, x, y, r);
    heat.addColorStop(0, "#ffdb88"); heat.addColorStop(.23, "#f47b30"); heat.addColorStop(.51, "#892f20"); heat.addColorStop(1, "#18121b");
    ctx.fillStyle = heat; ctx.globalAlpha = alpha; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    stamp(ctx, "magma", age, x, y, r * 2, r * 2, alpha * .92);
    const count = stats.tier === "high" ? 11 : 7;
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996, arc = fract(time * .32 + seed(i + 71));
      const orbit = r * (.18 + .63 * arc);
      rock(ctx, x + Math.cos(a) * orbit, y + Math.sin(a) * orbit - Math.sin(arc * Math.PI) * r * .20,
        r * (.13 + seed(i) * .14), a, time, alpha * (1 - arc * .3));
    }
    ctx.restore();
  }

  function drawVoid(ctx, circle, material, age, alpha, water = false) {
    const { x, y, radius: r } = circle, inner = circle.innerRadius || 0;
    if (!(r > inner && r > 0)) return false;
    stats.effects++; const time = motionTime(age), span = r - inner;
    const sampled = backdrop(ctx, x, y, r * 1.12);
    ctx.save(); ringClip(ctx, x, y, r, inner);
    if (sampled) {
      // Locally refract only the authoritative annulus; the open center and safe
      // corridor remain untouched. This is a bounded screen sample, not a blur.
      ctx.globalAlpha = alpha * .62;
      for (let i = 0; i < 3; i++) {
        ctx.save(); ctx.translate(x, y); ctx.rotate((i - 1) * .025 * Math.sin(time * .55));
        const extent = r * (1.08 - i * .055); ctx.drawImage(sampled, -extent, -extent, extent * 2, extent * 2); ctx.restore();
      }
    }
    const field = ctx.createRadialGradient(x, y, inner, x, y, r);
    field.addColorStop(0, water ? "#061d2a" : "#03020a"); field.addColorStop(.40, water ? "#104f64" : "#100d21");
    field.addColorStop(.76, water ? "#187a91" : "#372448"); field.addColorStop(1, water ? "#458d9d" : "#7e536e");
    ctx.fillStyle = field; ctx.globalAlpha = alpha * .83; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    if (!water) stamp(ctx, "void", age, x, y, r * 2.2, r * 2.2, alpha * .64, -.18);
    // Orbital ribbons are perspective-compressed at the far side, broad on the
    // near side; opacity sorts far => horizon => near for a deep accretion disk.
    const count = tier().strands;
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < count; i++) {
        const rr = inner + span * (.12 + seed(i + 4) * .84), offset = seed(i) * TAU - time * (water ? .38 : .23);
        const angle = layer ? offset : offset + Math.PI;
        ctx.beginPath();
        const steps = 15;
        for (let j = 0; j <= steps; j++) {
          const a = angle + j / steps * (1.2 + seed(i + 10)), depth = Math.sin(a);
          const radial = rr + Math.sin(a * 3 + i) * span * .04;
          const px = x + Math.cos(a) * radial, py = y + depth * radial * (inner > 0 ? 1 : .58) - Math.cos(a) * r * .12;
          if (!j) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = water ? (i % 4 ? "#72c4cd" : "#dcf7ef") : ["#8a536d", "#be8193", "#e6bcac", "#4c4668"][i % 4];
        ctx.globalAlpha = alpha * (layer ? .51 : .20) * (.4 + seed(i + 27) * .6);
        ctx.lineWidth = Math.max(.7, span * (layer ? .024 : .040) * (.4 + seed(i + 9))); ctx.stroke();
      }
      if (!layer && inner === 0) {
        const horizon = ctx.createRadialGradient(x, y, r * .18, x, y, r * .42);
        horizon.addColorStop(0, "#010108"); horizon.addColorStop(.82, water ? "#04121b" : "#03020b"); horizon.addColorStop(1, "transparent");
        ctx.fillStyle = horizon; ctx.globalAlpha = alpha; ctx.fillRect(x - r * .45, y - r * .45, r * .9, r * .9);
      }
    }
    ctx.strokeStyle = water ? "#a9e5e9" : "#d3adca"; ctx.globalAlpha = alpha * .76; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, r - .8, 0, TAU); if (inner > 0) ctx.arc(x, y, inner + .8, 0, TAU, true); ctx.stroke();
    ctx.restore(); return true;
  }

  function drawRift(ctx, line, material, age, alpha) {
    const length = Math.hypot(line.x2 - line.x1, line.y2 - line.y1), half = line.width / 2;
    if (!(length > 0 && half > 0)) return;
    const time = motionTime(age), count = Math.min(64, Math.max(12, Math.ceil(length / 20)));
    ctx.save(); ctx.translate(line.x1, line.y1); ctx.rotate(Math.atan2(line.y2 - line.y1, line.x2 - line.x1));
    ctx.beginPath(); ctx.rect(0, -half, length, half * 2); ctx.clip();
    ctx.fillStyle = "#06040f"; ctx.globalAlpha = alpha; ctx.fillRect(0, -half, length, half * 2);
    for (let side of [-1, 1]) {
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        for (let i = 0; i <= count; i++) {
          const x = i / count * length, y = side * half * (.81 - layer * .19) + Math.sin(i * 2.29 + time * .35) * half * .13;
          if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = layer === 0 ? "#c7aec7" : layer === 1 ? "#66536f" : "#2b1d40";
        ctx.lineWidth = layer === 0 ? .85 : half * .22; ctx.globalAlpha = alpha * (layer ? .57 : .83); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Family-specific micro-geometry inside the existing tapered beam volume.
  // Bone is articulated, silk woven, chitin plated, glass split into prisms,
  // plasma braided, spore membranous, nerve branching, fusion visibly composite.
  function drawRaySkin(ctx, length, left, right, kind, age, alpha = .8) {
    const time = motionTime(age), width = Math.max(1, Math.min(left, right));
    if (!(length > 0)) return;
    const count = Math.max(3, Math.min(tier().strands, Math.ceil(length / 32)));
    ctx.save(); ctx.beginPath(); ctx.moveTo(0, -left); ctx.lineTo(length, -right); ctx.lineTo(length, right); ctx.lineTo(0, left); ctx.closePath(); ctx.clip();
    for (let i = 0; i < count; i++) {
      const x = length * (i + .4) / count, s = Math.min(width * .74, length / count * .45), local = kind === "fusion" ? ["bone", "glass", "nerve"][i % 3] : kind;
      if (local === "bone" || local === "chitin") {
        const upper = local === "bone" ? "#b09b84" : "#78a698", lower = local === "bone" ? "#4d4141" : "#183139";
        polygon(ctx, [x - s, -width * .70, x + s * .60, -width * .43, x + s, 0, x, width * .45, x - s * .75, 0], upper, alpha);
        polygon(ctx, [x - s * .75, 0, x, width * .45, x + s, 0, x + s * .6, width * .7, x - s, width * .45], lower, alpha);
      } else if (local === "glass") {
        polygon(ctx, [x - s, 0, x + s * .35, -width * .78, x + s, width * .10], "#8ac6d8", alpha * .54);
        polygon(ctx, [x - s, 0, x + s, width * .10, x - s * .20, width * .78], "#334a77", alpha * .78);
        ctx.strokeStyle = "#f1f4ff"; ctx.globalAlpha = alpha; ctx.lineWidth = .75; ctx.beginPath(); ctx.moveTo(x - s, 0); ctx.lineTo(x + s * .35, -width * .78); ctx.stroke();
      } else if (local === "spore") {
        const wobble = Math.sin(time * .5 + i) * width * .12;
        ctx.globalAlpha = alpha * .65; ctx.fillStyle = "#486435"; ctx.strokeStyle = "#c2d99e"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x, wobble, s, width * .66, i * .4, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#172f22"; ctx.beginPath(); ctx.ellipse(x + s * .12, wobble, s * .38, width * .28, i, 0, TAU); ctx.fill();
      } else if (local === "silk" || local === "nerve" || local === "plasma") {
        const neural = local === "nerve", electric = local === "plasma", turn = time * (electric ? 1.4 : .4) + i;
        ctx.strokeStyle = neural ? "#f4aabf" : electric ? "#9ce7ff" : "#d9c8e8"; ctx.globalAlpha = alpha * .73; ctx.lineWidth = neural ? 1.2 : .7;
        for (let strand = 0; strand < 3; strand++) {
          const shift = (strand - 1) * width * .35;
          ctx.beginPath(); ctx.moveTo(x - s, shift);
          if (electric) { ctx.lineTo(x - s * .22, shift + Math.sin(turn) * width * .5); ctx.lineTo(x + s * .2, shift - width * .35); ctx.lineTo(x + s, shift); }
          else ctx.bezierCurveTo(x - s * .20, shift + width * .64, x + s * .2, shift - width * .62, x + s, shift);
          ctx.stroke();
          if (neural) { ctx.beginPath(); ctx.moveTo(x, shift); ctx.lineTo(x + s * .35, shift + width * .55); ctx.lineTo(x + s * .55, shift + width * .4); ctx.stroke(); }
        }
      }
    }
    ctx.restore();
  }
  return Object.freeze({ beginFrame, phase, drawWaterSection, drawMagmaFissure, drawEruption, drawVoid, drawRift, drawRaySkin, stamp, rock,
    diagnostics: () => ({ ...stats, budget: tier(), atlasReady: [...atlases].filter(([, v]) => v.ready).map(([k]) => k), sampleSize: 224, extraWebGLContexts: 0 }) });
})();
