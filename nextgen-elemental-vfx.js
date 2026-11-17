"use strict";

// Geometry-first presentation. Every bright pixel is clipped to the same primitive
// used by collision. Decorative wake/refraction never owns damage or a new clock.
const NextgenVfx = (() => {
  const TAU = Math.PI * 2;
  const budgets = Object.freeze({ low: { facets: 180, strands: 8, samples: 0 },
    medium: { facets: 420, strands: 16, samples: 1 }, high: { facets: 760, strands: 28, samples: 2 } });
  const stats = { facets: 0, samples: 0, atlasDraws: 0, effects: 0, tier: "high", peakFacets: 0 };
  const atlases = new Map();
  const scheduledMaterials = new Set();
  let sampleCanvas, sampleContext, basaltTile, magmaTile, waterNormalTile, waterFoamTile, sporeMistTile;
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const fract = v => v - Math.floor(v);
  const seed = i => fract(Math.sin(i * 127.1 + 31.7) * 43758.5453);
  const tier = () => budgets[typeof visualQuality === "undefined" ? "high" : visualQuality.id] || budgets.high;
  const calm = () => typeof quietCombatMotion === "function" && quietCombatMotion();
  const motionTime = time => calm() ? 0 : time;
  const ease = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };

  // Small material caches are shaded once; the render loop only transforms them.
  function bakeTexture(size, sample) {
    const tile = document.createElement("canvas");
    tile.width = tile.height = size;
    const context = tile.getContext("2d");
    const image = context.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        sample(x / size * 2 - 1, y / size * 2 - 1, image.data, (y * size + x) * 4);
      }
    }
    context.putImageData(image, 0, 0);
    return tile;
  }

  function waterFoamTexture() {
    return waterFoamTile ||= bakeTexture(384, (x, y, pixels, i) => {
      const r = Math.hypot(x, y), a = Math.atan2(y, x);
      const sweep = a - Math.log(Math.max(.095, r)) * 2.85;
      const whirl = sweep * 3 + Math.sin(a * 2 + r * 13) * .60;
      const wave = .5 + .5 * Math.cos(whirl);
      const fold = .5 + .5 * Math.sin(7 * sweep + r * 94 + Math.sin(a * 12) * .72);
      const porous = .5 + .5 * Math.cos(a * 18 + r * 102) * Math.sin(sweep * 22 - r * 143);
      const sheen = wave ** 8 * fold ** 2;
      pixels[i] = 8 + sheen * 221;
      pixels[i + 1] = 101 + wave * 81 + sheen * 73;
      pixels[i + 2] = 142 + wave * 93 + sheen * 20;
      pixels[i + 3] = (wave ** 2 * 126 + sheen * 120) * (.57 + .43 * porous) *
        ease((r - .10) / .24) * ease((1 - r) / .26);
    });
  }

  function sporeMistTexture() {
    return sporeMistTile ||= bakeTexture(192, (x, y, pixels, i) => {
      const r = Math.hypot(x, y), a = Math.atan2(y, x);
      const n = bossVfxDensity(x * 9 + 3.4, y * 9 - 4.1, 29);
      const bulge = .83 + Math.sin(a * 7) * .09 + Math.cos(a * 11 + .8) * .065;
      const density = ease((bulge - r + n * .16) / .36) * (.4 + n * .6);
      const light = clamp01((n - .31) * 1.9) * (1.1 - r * .4);
      pixels[i] = 18 + light * 102;
      pixels[i + 1] = 35 + light * 120;
      pixels[i + 2] = 8 + light * 33;
      pixels[i + 3] = density * 192;
    });
  }

  function beginFrame() {
    if (typeof BlackHoleSurface !== "undefined") BlackHoleSurface.beginFrame();
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
  function warmMaterial(name) {
    if (scheduledMaterials.has(name)) return;
    const work = name === "water" ? [waterNormalTexture, waterFoamTexture]
      : name === "magma" ? [basaltTexture, magmaTexture]
      : name === "spore" ? [sporeMistTexture] : [];
    if (!work.length) return;
    scheduledMaterials.add(name);
    if (name !== "spore") atlas(name);
    if (name === "magma") cinderMaterial();
    const schedule = typeof requestIdleCallback === "function"
      ? job => requestIdleCallback(job, { timeout: 1500 })
      : job => setTimeout(job, 32);
    function warmNext() {
      const bake = work.shift();
      bake();
      if (work.length) schedule(warmNext);
    }
    schedule(warmNext);
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

  function waterNormalTexture() {
    if (waterNormalTile) return waterNormalTile;
    waterNormalTile=document.createElement("canvas");waterNormalTile.width=192;waterNormalTile.height=512;
    const c=waterNormalTile.getContext("2d"),image=c.createImageData(192,512);
    // A smooth, low-contrast normal response baked once. It has no cell grid,
    // repeated wave silhouettes or frame-to-frame noise allocations.
    for(let y=0;y<512;y++)for(let x=0;x<192;x++){
      const phase = y / 512 * TAU;
      const flow = x * .067 + Math.sin(phase * 2) * 1.7 + Math.sin(phase * 4 + x * .019) * .68;
      const slope = Math.sin(flow) * .52 + Math.sin(flow * 2.14 + phase) * .20;
      const spec=Math.max(0,slope+.21)**3;
      const i=(y*192+x)*4;image.data[i]=61+spec*135;image.data[i+1]=151+spec*95;image.data[i+2]=177+spec*74;
      image.data[i+3]=12+spec*63;
    }
    c.putImageData(image,0,0);return waterNormalTile;
  }

  function drawWaterSection(ctx, crestAt, top, bottom, direction, age, width, material, warning, quiet) {
    if (!(width > 0 && bottom > top)) return false;
    stats.effects++;
    const time = quiet ? 0 : age, alpha = warning ? .43 : .94;
    const quality = tier(), rows = stats.tier === "low" ? 24 : 48;
    const span = bottom - top, cap = Math.max(Number.MIN_VALUE, Math.min(width * .69, span * .17));
    const wave = (y, q) => Math.sin(y * .021 + time * 1.8 + q * 2.8) * .055 + Math.sin(y * .063 - time * 2.7) * .023;
    // Rounded, turning ends live inside the unchanged collision mask. Only the
    // short end rolls contract; the broad middle retains the dangerous volume.
    const envelope = y => Math.sqrt(ease(Math.min(y - top, bottom - y) / cap));
    const surfaceX = (y, q) => crestAt(y) + direction * width * envelope(y) *
      (q * (.92 + .035 * Math.sin(y * .033 + time * .8)) + .025 * Math.sin(y * .043 + time * 1.4));
    const center = crestAt((top + bottom) / 2), cy = (top + bottom) / 2, sampleRadius = Math.max(width, span / 2);
    // Capture the underlying scene before painting water, not the water itself.
    const sample = !warning && !quiet ? backdrop(ctx, center, cy, sampleRadius) : null;
    ctx.save(); ctx.beginPath();
    for (let r = 0; r <= rows; r++) { const y = top + (bottom - top) * r / rows; const x = crestAt(y) - width; if (!r) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    for (let r = rows; r >= 0; r--) { const y = top + (bottom - top) * r / rows; ctx.lineTo(crestAt(y) + width, y); }
    ctx.closePath(); ctx.clip();
    // A faint full-width shear edge reads at gameplay scale, with transparent
    // stops at both caps to avoid exposing the damage mask as a rectangle.
    const edgeLight = ctx.createLinearGradient(0, top, 0, bottom);
    edgeLight.addColorStop(0, "#63dfee00");
    edgeLight.addColorStop(cap / span, "#63dfee71");
    edgeLight.addColorStop(1 - cap / span, "#63dfee71");
    edgeLight.addColorStop(1, "#63dfee00");
    for (const side of [-1, 1]) {
      ctx.beginPath();
      for (let r = 0; r <= rows; r++) { const y = top + span * r / rows;
        const x = crestAt(y) + side * width * (.84 + .045 * Math.sin(y * .074 - time * 1.1));
        if (!r) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.strokeStyle = edgeLight; ctx.lineWidth = 1.4; ctx.globalAlpha = alpha * .48; ctx.stroke();
    }
    ctx.save(); ctx.beginPath();
    for (let r = 0; r <= rows; r++) { const y = top + span * r / rows; if (!r) ctx.moveTo(surfaceX(y, -1), y); else ctx.lineTo(surfaceX(y, -1), y); }
    for (let r = rows; r >= 0; r--) { const y = top + span * r / rows; ctx.lineTo(surfaceX(y, 1), y); }
    ctx.closePath(); ctx.clip();
    const depth = ctx.createLinearGradient(center - direction * width, 0, center + direction * width, 0);
    // Broad shaded back, translucent rising face, narrow illuminated lip and a
    // deep occluded trough. Continuous interpolation replaces all flat quads.
    depth.addColorStop(0,"#031c2c00");depth.addColorStop(.07,"#052c41d9");depth.addColorStop(.30,"#07536ded");
    depth.addColorStop(.50,"#147e98f2");depth.addColorStop(.65,"#48aeb9f5");depth.addColorStop(.72,"#8fced0f2");
    depth.addColorStop(.79,"#061e2be8");depth.addColorStop(.92,"#0b4055d8");depth.addColorStop(1,"#16566a00");
    ctx.globalAlpha=alpha;ctx.fillStyle=depth;ctx.fillRect(center-width*3,top,width*6,bottom-top);
    // The underside is a single curved ribbon, with a narrow transmitted-light
    // lip beside it. There are no horizontal band seams to reveal the mesh.
    for(let band=0;band<3;band++){
      ctx.beginPath();
      for(let j=0;j<=rows;j++){
        const y=top+(bottom-top)*j/rows;
        const x=surfaceX(y,.48+wave(y,.78)+(band===0?.13:band===1?-.025:-.18));
        if(!j)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.strokeStyle=band===0?"#041722":band===1?"#a9dedb":"#56bdc9";
      ctx.lineWidth=width*(band===0?.27:band===1?.053:.13);ctx.lineCap="round";
      ctx.globalAlpha=alpha*(band===0?.64:band===1?.43:.15);ctx.stroke();
    }
    const normalTile = waterNormalTexture(), normalOffset = fract(time * .30) * span;
    ctx.globalAlpha = alpha * .78;
    ctx.drawImage(normalTile, center - width, top - normalOffset, width * 2, span);
    ctx.drawImage(normalTile, center - width, bottom - normalOffset, width * 2, span);
    // Long, finely advected shear streaks provide movement without exposing
    // a tile grid. Their paths stay continuous from the back face into the lip.
    const streaks=quality.strands;
    ctx.lineWidth=.65;ctx.strokeStyle="#a0dde1";
    for(let i=0;i<streaks;i++){
      const u=.12+seed(i+25)*.52,start=fract(seed(i+9)+time*(.055+seed(i)*.025));
      const y0=top+(bottom-top)*start,span=Math.min(bottom-top,18+seed(i+60)*64);
      ctx.beginPath();
      for(let j=0;j<=8;j++){
        const y=Math.min(bottom,y0+span*j/8),x=surfaceX(y,-1+2*u+wave(y,u)*1.4);
        if(!j)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.globalAlpha=alpha*(.08+seed(i+70)*.16);ctx.stroke();
    }
    if (sample) {
      ctx.globalAlpha = .17;
      const slices = 8, sh = 224 / slices;
      for (let i = 0; i < slices; i++) {
        const shift = Math.sin(i * 1.7 + time * .85) * Math.min(5, width * .10);
        ctx.drawImage(sample, 0, i * sh, 224, sh, center - sampleRadius + shift,
          cy - sampleRadius + i * sampleRadius * 2 / slices, sampleRadius * 2, sampleRadius * 2 / slices + .5);
      }
    }
    const crestX = y => surfaceX(y, .45 + wave(y, .78));
    // One coherent sheet owns the silhouette. A single frame contributes only
    // porous foam inside the leading curl, never stacked copies of the wave.
    ctx.save();ctx.beginPath();
    for(let j=0;j<=24;j++){const y=top+(bottom-top)*j/24,x=crestX(y)-direction*width*.16;if(!j)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
    for(let j=24;j>=0;j--){const y=top+(bottom-top)*j/24;ctx.lineTo(crestX(y)+direction*width*.19,y);}
    ctx.closePath();ctx.clip();
    stamp(ctx,"water",age,center,(top+bottom)/2,(bottom-top)*1.65,width*3.3,alpha*.38,direction*Math.PI/2);
    ctx.restore();
    for (let lip = 0; lip < 3; lip++) {
      ctx.beginPath();
      for (let j = 0; j <= 44; j++) { const y = top + (bottom - top) * j / 44;
        const x = surfaceX(y, .45 + wave(y, .78) - lip * .11 + Math.sin(y * .16 + time * 2) * .025);
        if (!j) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.strokeStyle = lip === 0 ? "#e5ffff" : lip === 1 ? "#9cdfdf" : "#07364e";
      ctx.lineWidth = lip === 0 ? Math.max(1.3, width * .042) : Math.max(2, width * .11);
      ctx.globalAlpha = alpha * (lip === 0 ? .63 : .50); ctx.stroke();
    }
    // Foam has porous clumps, branching veins and advected droplets, never disks.
    ctx.fillStyle = "#e2fafa";
    const flecks = quality.strands * 4;
    for (let i = 0; i < flecks; i++) {
      const t = fract(seed(i) + time * (.04 + seed(i + 50) * .055));
      const y = top + (bottom - top) * t;
      const x = surfaceX(y, .45 + wave(y, .78) - (seed(i + 80) ** 2 * .42 - .07));
      const size = .5 + seed(i + 6) * Math.min(3.7, width * .08);
      ctx.globalAlpha = alpha * (.25 + seed(i + 2) * .65);
      ctx.beginPath(); ctx.ellipse(x,y,size*1.2,size*.62,-.4,0,TAU); ctx.fill();
    }
    ctx.restore(); // Release only the organic surface clip; the exact mask stays.
    if (!warning) {
      ctx.globalCompositeOperation = "lighter";
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass === 0 ? edgeLight : "#c2ffff";
        ctx.globalAlpha = alpha * (pass === 0 ? .55 : .26);
        ctx.lineWidth = Math.max(1, width * (pass === 0 ? .24 : .038)); ctx.lineCap = "round";
        ctx.beginPath();
        for (let j = 0; j <= rows; j++) {
          const y = top + cap * .12 + (span - cap * .24) * j / rows;
          if (!j) ctx.moveTo(crestX(y), y); else ctx.lineTo(crestX(y), y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = "#beffff";
      for (let i = 0; i < quality.strands * 3; i++) {
        const t = fract(seed(i + 453) + time * (.09 + seed(i + 414) * .15));
        const y = i % 2 ? top + cap * t : bottom - cap * t;
        const x = crestX(y) + (seed(i + 477) - .5) * width * (.12 + (.7 - t * .5));
        ctx.globalAlpha = alpha * .66 * Math.sin(Math.PI * t);
        ctx.beginPath();
        ctx.ellipse(x, y, .55 + seed(i + 31) * 1.55, 1 + seed(i + 39) * 3.7, .39, 0, TAU);
        ctx.fill();
      }
    }
    // Tells retain exact boundaries. Active water is read from its surface and
    // foam instead of rectangular outlines; the same geometry still clips it.
    if(warning){
      ctx.strokeStyle="#b6f6ff";ctx.globalAlpha=.45;ctx.lineWidth=1.1;
      for(const side of [-1,1]){ctx.beginPath();for(let j=0;j<=rows;j++){
        const y=top+(bottom-top)*j/rows,x=crestAt(y)+side*width;
        if(!j)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }ctx.stroke();}
    }
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
  function magmaTexture() {
    // One small, periodic material bake, shared by all fissures. The upper half
    // is flowing melt and cooling skin; the lower half is porous, shaded basalt.
    // No pixels, noise grids or new canvases are generated on subsequent frames.
    return magmaTile ||= (() => {
      const w = 384, h = 128, tile = document.createElement("canvas");
      tile.width = w; tile.height = h * 2;
      const c = tile.getContext("2d"), pixels = c.createImageData(w, h * 2);
      const grid = (nx, ny, salt) => {
        const values = new Float32Array(nx * ny);
        for (let i = 0; i < values.length; i++) values[i] = seed(i + salt);
        return { nx, ny, values };
      };
      const coarse = grid(8, 5, 131), middle = grid(31, 17, 471), fine = grid(97, 53, 917);
      const noise = (field, u, v) => {
        const x = fract(u) * field.nx, y = fract(v) * field.ny, ix = Math.floor(x), iy = Math.floor(y);
        const fx = x - ix, fy = y - iy, tx = fx * fx * (3 - 2 * fx), ty = fy * fy * (3 - 2 * fy);
        const row = iy * field.nx, nextRow = (iy + 1) % field.ny * field.nx, nextX = (ix + 1) % field.nx;
        const a = field.values[row + ix] * (1 - tx) + field.values[row + nextX] * tx;
        const b = field.values[nextRow + ix] * (1 - tx) + field.values[nextRow + nextX] * tx;
        return a * (1 - ty) + b * ty;
      };
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = x / w, v = y / h, broad = noise(coarse, u, v);
        const wu = u + (broad - .5) * .065, wv = v + Math.sin(u * TAU * 3 + broad * 3) * .075;
        const folded = noise(middle, wu, wv), grain = noise(fine, wu, wv);
        const ridge = Math.max(0, 1 - Math.abs(folded - .49) * 19);
        const crust = clamp01((broad * .5 + folded * .36 + grain * .14 - .51) * 5.8);
        const heat = clamp01(.29 + broad * .47 + folded * .32 + ridge * .20 - crust * .61);
        const pore = Math.max(0, .29 - grain) * 1.5, skin = crust * crust;
        const i = (y * w + x) * 4;
        pixels.data[i] = (179 + heat * 76) * (1 - skin) + (36 + grain * 24) * skin - pore * 54;
        pixels.data[i + 1] = (29 + heat * heat * 158 + ridge * 19) * (1 - skin) + (24 + grain * 12) * skin - pore * 22;
        pixels.data[i + 2] = (9 + heat * heat * 51) * (1 - skin) + (27 + grain * 10) * skin;
        pixels.data[i + 3] = 255;
        const relief = (noise(middle, wu + 1 / w, wv - 1 / h) - folded) * 108;
        const stone = 19 + broad * 23 + folded * 18 + grain * 15 + relief - pore * 38;
        const ember = ridge * Math.max(0, broad - .53) * 1.4;
        const j = ((y + h) * w + x) * 4;
        pixels.data[j] = stone * 1.12 + ember * 165;
        pixels.data[j + 1] = stone * .83 + ember * 45;
        pixels.data[j + 2] = stone * .86 + ember * 9;
        pixels.data[j + 3] = 255;
      }
      c.putImageData(pixels, 0, 0); return tile;
    })();
  }

  const cinderPlateWidth = 1536, cinderPlateDepth = 320, cinderSprite = 256;
  let cinderImage, cinderHeatCanvas, cinderBankCanvas;

  function cinderMaterial() {
    if (!cinderImage) {
      cinderImage = new Image();
      cinderImage.src = "assets/vfx/nextgen/cinder-rift.webp";
    }
    return cinderImage.complete && cinderImage.naturalWidth === cinderPlateWidth ? cinderImage : null;
  }

  function cinderSpriteAt(ctx, image, source, x, y, w, h) {
    ctx.drawImage(image, source * cinderSprite, 4 * cinderPlateDepth, cinderSprite, cinderSprite, x, y, w, h);
  }

  function cinderHeatPlate(image, lane, time, strength, quiet) {
    if (!cinderHeatCanvas) {
      cinderHeatCanvas = document.createElement("canvas");
      cinderHeatCanvas.width = 768;
      cinderHeatCanvas.height = 160;
    }
    const { width, height } = cinderHeatCanvas;
    const c = cinderHeatCanvas.getContext("2d");
    c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, width, height);
    c.drawImage(image, 0, (lane * 2 + 1) * cinderPlateDepth, cinderPlateWidth, cinderPlateDepth, 0, 0, width, height);
    // An opacity front runs *through* the stationary cracks. The dark plates
    // and their heat mask stay registered, including under reduced motion.
    const current = c.createLinearGradient(0, 0, width, 0);
    for (let stop = 0; stop <= 16; stop++) {
      const x = stop / 16;
      const front = ease((time * 1.18 - (1 - x) * .32 + .23) / .34);
      const flow = quiet ? .68 : .63 + Math.cos((1 - x) * 28 - time * 5.5 + lane) * .28;
      const alpha = clamp01(strength * front * flow);
      current.addColorStop(x, `rgba(255,255,255,${alpha})`);
    }
    c.globalCompositeOperation = "destination-in";
    c.fillStyle = current;
    c.fillRect(0, 0, width, height);
    return cinderHeatCanvas;
  }

  function cinderSparks(ctx, x, y, span, depth, age, alpha, salt, direction = 1) {
    const count = stats.tier === "high" ? 15 : stats.tier === "medium" ? 10 : 5;
    if (alpha < .02 || count === 0) return;
    ctx.lineCap = "round";
    for (let i = 0; i < count; i++) {
      const t = fract(seed(i + salt) + age * (.68 + seed(i + salt + 51) * .62));
      const launch = span * (.18 + seed(i + salt + 19) * .82);
      const drift = direction * (t * 1.4 - t * t * .36) * launch;
      const lift = Math.sin(t * Math.PI * .81) * depth * (.22 + .78 * seed(i + salt + 73));
      const sx = x - drift, sy = y + lift * (i % 2 ? -1 : 1);
      ctx.strokeStyle = i % 5 ? "#ff8638" : "#ffe1a0";
      ctx.globalAlpha = alpha * Math.sin(t * Math.PI) ** 1.7 * (.27 + seed(i + salt + 10) * .64);
      ctx.lineWidth = .65 + seed(i + salt + 30) * 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + direction * (2 + launch * .080) * (1 - t * .3),
        sy - (i % 2 ? -1 : 1) * depth * .10 * (1 - t * 1.5));
      ctx.stroke();
    }
  }

  function cinderBankPlate(image, lane, time, depth, height, offset, opacity, warm, quiet) {
    if (!cinderBankCanvas) {
      cinderBankCanvas = document.createElement("canvas");
      cinderBankCanvas.width = 768;
      cinderBankCanvas.height = 160;
    }
    const { width, height: rows } = cinderBankCanvas;
    const c = cinderBankCanvas.getContext("2d");
    c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, width, rows);
    const shift = rows * offset / depth;
    c.globalAlpha = opacity;
    c.drawImage(image, 0, lane * 2 * cinderPlateDepth, cinderPlateWidth, cinderPlateDepth, 0, shift, width, rows);
    c.globalAlpha = 1;
    c.drawImage(cinderHeatPlate(image, lane, time, warm, quiet), 0, shift);
    const lip = clamp01(height / depth);
    const feather = c.createLinearGradient(0, 0, 0, rows);
    feather.addColorStop(0, "white");
    feather.addColorStop(Math.max(.001, lip - .125), "white");
    feather.addColorStop(lip, "transparent");
    c.globalCompositeOperation = "destination-in";
    c.fillStyle = feather;
    c.fillRect(0, 0, width, rows);
    return cinderBankCanvas;
  }

  function cinderBank(ctx, image, rect, lane, depth, time, intensity, warning, quiet, residue, hazard) {
    const { width, height } = rect;
    if (width <= 0 || height <= .45) return;
    const origin = lane === 0 ? rect.y : rect.y + height;
    const gapEdge = hazard.gapY + (lane === 0 ? -1 : 1) * hazard.gapSize / 2;
    const visible = hazard.noShield ? Math.min(height, lane === 0 ? gapEdge - origin : origin - gapEdge) : height;
    if (visible <= .45) return;
    ctx.save();
    ctx.translate(rect.x, origin);
    if (lane !== 0) ctx.scale(1, -1);
    ctx.beginPath(); ctx.rect(0, 0, width, visible); ctx.clip();
    const contact = 1 - residue;
    const open = warning ? .43 + intensity * .25 : clamp01(height / depth);
    // The basalt moves from the edge of the arena. Its relief and cracks
    // never stretch as the hazard rises. Feather the receiving edge after
    // compositing so a shallow first frame does not show a rectangular slice.
    const offset = -(1 - open) * depth * .72;
    const opacity = residue ? contact ** 1.5 * .34 : warning ? .04 + intensity * .16 : .96;
    const warm = residue ? contact ** 2 * .12 : warning ? intensity * .41 : intensity * 1.32;
    const plate = cinderBankPlate(image, lane, quiet ? .65 : time, depth, visible, offset, opacity, warm, quiet);
    ctx.globalAlpha = 1;
    ctx.drawImage(plate, 0, 0, width, depth);
    stats.atlasDraws++;
    if (!quiet) {
      if (!residue) {
        const glands = stats.tier === "low" ? 3 : 5;
        for (let i = 0; i < glands; i++) {
          const key = lane * 47 + i * 11;
          const u = .15 + i * .16 + (seed(key + 29) - .5) * .07;
          const x = width * u, y = offset + depth * (.34 + seed(key + 18) * .20);
          const breath = ease((time + u * .44 - .08) * 4);
          cinderSparks(ctx, x, y, depth * .44, depth * .24, time, breath * intensity * .57, key);
          if (stats.tier === "high" && i % 2 === lane && intensity > .3) {
            const age = fract(time * .53 + seed(key + 41));
            const fog = depth * (.40 + age * .58);
            ctx.globalAlpha = intensity * Math.sin(age * Math.PI) * .33;
            cinderSpriteAt(ctx, image, 2, x - fog * (.47 + age * .18), y - fog * .68, fog, fog);
            stats.atlasDraws++;
          }
        }
      } else if (residue < .83) {
        cinderSparks(ctx, width * .59, Math.min(height * .64, depth * .24), depth * .71,
          depth * .14, time, contact * .30, 94 + lane);
      }
    }
    ctx.restore();
  }

  function cinderVent(ctx, image, circle, time, intensity, quiet, warning, salt) {
    const { x, y, radius } = circle;
    if (!(radius > 0)) return;
    ctx.save();
    ctx.translate(x, y);
    ringClip(ctx, 0, 0, radius);
    ctx.rotate((seed(salt + 1) - .5) * .85);
    const r = radius;
    const heat = quiet ? .78 : .73 + .26 * Math.sin(time * 9.3 + salt * .79);
    ctx.globalAlpha = warning ? .26 : .99;
    cinderSpriteAt(ctx, image, 0, -r, -r, r * 2, r * 2);
    ctx.globalAlpha = intensity * heat;
    cinderSpriteAt(ctx, image, 1, -r, -r, r * 2, r * 2);
    stats.atlasDraws += 2;
    if (!quiet && !warning) {
      const lift = fract(time * .56 + seed(salt));
      ctx.globalAlpha = Math.sin(lift * Math.PI) * intensity * .72;
      const swell = r * (.73 + lift * .66);
      cinderSpriteAt(ctx, image, 2, -swell * .45, -swell * .47 - r * .88 * lift, swell, swell);
      stats.atlasDraws++;
      cinderSparks(ctx, 0, 0, r * .75, r * .68, time, intensity * .80, salt);
    }
    ctx.restore();
  }

  function drawCinderRift(ctx, geometry, hazard, maxDepth, quiet, residue = 0) {
    const image = cinderMaterial();
    if (!image) return false;
    const warning = !residue && hazard.age < hazard.warning;
    const age = warning ? hazard.age / hazard.warning - .56 : hazard.age - hazard.warning;
    const cool = 1 - ease((geometry.progress - .61) / .37) * .79;
    const charge = warning ? ease((age + .43) / .83) : cool;
    stats.effects++;
    for (const [i, rect] of geometry.rects.entries()) {
      const lane = rect.y + rect.height / 2 < viewport.height / 2 ? 0 : 1;
      // Clipped lanes can omit the upper rect on unusual playfields.
      cinderBank(ctx, image, rect, geometry.rects.length === 2 ? i : lane,
        maxDepth, age, charge, warning, quiet, residue, hazard);
    }
    if (!residue) {
      for (const [i, circle] of geometry.circles.entries()) {
        cinderVent(ctx, image, circle, age, warning ? charge * .40 : .48 + cool * .49,
          quiet, warning, i * 37 + 13);
      }
    }
    return true;
  }

  function drawCinderCharge(ctx, x, y, radius, charge, time, quiet) {
    const image = cinderMaterial();
    if (!image) return false;
    const pulse = quiet ? 1 : .90 + Math.sin(time * 12) * .1;
    const glow = radius * (.41 + charge * .21);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const hot = ctx.createRadialGradient(x, y, 0, x, y, glow);
    hot.addColorStop(0, "#ffba61bf"); hot.addColorStop(.21, "#bd491493");
    hot.addColorStop(.53, "#96361872"); hot.addColorStop(1, "#ae462300");
    ctx.globalAlpha = charge * .75 * pulse;
    ctx.fillStyle = hot;
    ctx.fillRect(x - glow, y - glow, glow * 2, glow * 2);
    ctx.globalCompositeOperation = "source-over";
    if (!quiet) cinderSparks(ctx, x - glow * .12, y, glow * 1.45, glow * .85,
      1.4 - time, ease(charge) * .76, 722, -1);
    ctx.restore();
    return true;
  }

  function drawCinderAftershock(ctx, x, y, width, height, age, quiet) {
    const image = cinderMaterial();
    if (!image) return false;
    const t = age / .7;
    const front = quiet ? x - width * .26 : x - width * 1.15 * (1 - Math.exp(-t * 4.7));
    const fade = (1 - t) ** 1.55;
    ctx.save();
    const count = stats.tier === "low" ? 6 : 12;
    for (let i = 0; i < count; i++) {
      const ly = height * (i + seed(i + 95) * .91) / count;
      const sway = ((ly - y) / height) ** 2 * width * .30;
      const lx = front + sway + width * .16 * seed(i + 29);
      const r = height * (.12 + seed(i + 101) * .20) * (.76 + t * .58);
      ctx.globalAlpha = fade * (.52 + seed(i + 201) * .44);
      cinderSpriteAt(ctx, image, 2, lx - r * .55, ly - r * .58, r * 1.5, r);
      stats.atlasDraws++;
      if (!quiet && i % 3 === 1) cinderSparks(ctx, lx + r * .13, ly, r * .56, r * .49, age * 1.5, fade * .79, 399 + i);
    }
    if (!quiet && age < .25) {
      const size = height * (.14 + age * .26);
      const flare = ctx.createRadialGradient(x, y, 0, x, y, size);
      flare.addColorStop(0, "#ffc473c2");
      flare.addColorStop(.28, "#dd571b75");
      flare.addColorStop(1, "#a6402700");
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = (1 - age / .25) * .72;
      ctx.fillStyle = flare;
      ctx.fillRect(x - size, y - size, size * 2, size * 2);
    }
    ctx.restore();
    return true;
  }


  function drawMagmaFissure(ctx, line, material, time, alpha) {
    const length = Math.hypot(line.x2 - line.x1, line.y2 - line.y1), width = line.width;
    if (!(length > 0 && width > 0)) return false;
    stats.effects++; time = motionTime(time);
    const texture = magmaTexture();
    ctx.save(); ctx.translate(line.x1, line.y1); ctx.rotate(Math.atan2(line.y2 - line.y1, line.x2 - line.x1));
    // The authoritative rectangle remains the outer clip. The crust has its own
    // broken silhouette inside it, so neither its texture nor ends form a tile.
    ctx.beginPath(); ctx.rect(0, -width / 2, length, width); ctx.clip();
    const steps = Math.max(16, Math.min(64, Math.ceil(length / 13)));
    const cap = Math.max(Number.MIN_VALUE, Math.min(width * .55, length * .12));
    const envelope = x => { const p = clamp01(Math.min(x, length - x) / cap); return Math.sqrt(p * (2 - p)); };
    const shore = (x, side) => side * width * .5 * envelope(x) *
      (.78 + .12 * Math.sin(x * .019 + side * 2) + .073 * Math.sin(x * .091 + side * 2) + .027 * Math.sin(x * .217 - side));
    const channel = x => width * (.075 * Math.sin(x * .018 + time * .32) + .025 * Math.sin(x * .047 - time * .21));
    const bank = (x, side) => (channel(x) + side * width *
      (.19 + .051 * Math.sin(x * .052 + side * 1.7) + .027 * Math.sin(x * .123))) * envelope(x);
    const capLight = ctx.createLinearGradient(0, 0, length, 0);
    capLight.addColorStop(0, "#ff642300");
    capLight.addColorStop(cap / length, "#ff9d5a80");
    capLight.addColorStop(1 - cap / length, "#ff9d5a80");
    capLight.addColorStop(1, "#ff642300");
    // Irregular rocks and embers mark the transition from melt to hazard edge.
    ctx.save(); ctx.beginPath();
    for (let i = 0; i <= steps; i++) { const x = length * i / steps; if (!i) ctx.moveTo(x, shore(x, -1)); else ctx.lineTo(x, shore(x, -1)); }
    for (let i = steps; i >= 0; i--) { const x = length * i / steps; ctx.lineTo(x, shore(x, 1)); }
    ctx.closePath(); ctx.clip();
    // Rough banks are continuous material, not six flat triangles per rock.
    ctx.globalAlpha = alpha; ctx.drawImage(texture, 0, 128, 384, 128, 0, -width / 2, length, width);
    const bankLight = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
    bankLight.addColorStop(0, "#060913b8"); bankLight.addColorStop(.31, "#b45a304c");
    bankLight.addColorStop(.5, "#3c161000"); bankLight.addColorStop(.70, "#8e482f35"); bankLight.addColorStop(1, "#070812bd");
    ctx.fillStyle = bankLight; ctx.fillRect(0, -width / 2, length, width);
    ctx.save(); ctx.beginPath();
    for (let i = 0; i <= steps; i++) { const x = length * i / steps; if (!i) ctx.moveTo(x, bank(x, -1)); else ctx.lineTo(x, bank(x, -1)); }
    for (let i = steps; i >= 0; i--) { const x = length * i / steps; ctx.lineTo(x, bank(x, 1)); }
    ctx.closePath(); ctx.clip();
    // A lane spans less than one period. Two seamless samples advect the same
    // turbulent surface; neither a repeating large stamp nor a bright vector bar.
    const period = Math.max(length * 1.28, width * 5), offset = fract(time * .026) * period;
    ctx.globalAlpha = alpha;
    for (let i = 0; i < 2; i++) ctx.drawImage(texture, 0, 0, 384, 128, i * period - offset, -width / 2, period, width);
    ctx.lineJoin = ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) { const x = length * i / steps, y = bank(x, side); if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.strokeStyle = "#210b12"; ctx.lineWidth = width * .064; ctx.globalAlpha = alpha * .44; ctx.stroke();
    }
    ctx.restore();
    const blocks = Math.min(stats.tier === "high" ? 23 : stats.tier === "medium" ? 15 : 8, Math.ceil(length / 24));
    for (let i = 0; i < blocks && stats.facets < tier().facets; i++) {
      const x = length * (i + .26 + seed(i + 19) * .48) / blocks, side = seed(i + 583) > .52 ? 1 : -1;
      const cluster = seed(i + 293);
      const size = Math.min(width * (.24 + cluster * .25), length / blocks * (.64 + cluster * .88));
      const y = side * width * (.24 + .15 * seed(i + 37));
      const points = [];
      for (let j = 0; j < 9; j++) {
        const angle = j / 9 * TAU + i * 2.399, radius = size * (.70 + seed(i * 19 + j) * .30);
        points.push(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * .68);
      }
      polygon(ctx, points, "#30272c", alpha);
      ctx.save(); ctx.beginPath(); ctx.moveTo(points[0], points[1]);
      for (let j = 2; j < points.length; j += 2) ctx.lineTo(points[j], points[j + 1]);
      ctx.closePath(); ctx.clip();
      ctx.globalAlpha = alpha;
      ctx.drawImage(texture, seed(i + 15) * 256, 128 + seed(i + 46) * 32, 96, 96, x - size, y - size, size * 2, size * 2);
      const relief = ctx.createRadialGradient(x - size * .28, y - side * size * .34, 0, x, y, size);
      relief.addColorStop(0, "#ca86564d"); relief.addColorStop(.32, "#69473317");
      relief.addColorStop(.74, "#100f1a45"); relief.addColorStop(1, "#060811be");
      ctx.fillStyle = relief; ctx.fillRect(x - size, y - size, size * 2, size * 2);
      ctx.restore();
      // Broken warm edge reflections face the melt; the far faces stay occluded.
      ctx.strokeStyle = "#d48850"; ctx.lineWidth = .7; ctx.globalAlpha = alpha * .48;
      ctx.beginPath();
      for (let j = 0; j < points.length; j += 2) {
        const k = (j + 2) % points.length;
        if ((points[j + 1] + points[k + 1]) * side < y * side * 2) { ctx.moveTo(points[j], points[j + 1]); ctx.lineTo(points[k], points[k + 1]); }
      }
      ctx.stroke();
      // Offset fracture branches break the repetition and light the inward lip.
      ctx.beginPath();
      const root = y - side * size * .49, split = x - size * .09;
      ctx.moveTo(x - size * .57, root);
      ctx.lineTo(split, root - side * size * .16);
      ctx.lineTo(x + size * .21, root + side * size * .14);
      ctx.lineTo(x + size * .48, root + side * size * .03);
      ctx.moveTo(split, root - side * size * .16);
      ctx.lineTo(x - size * .24, root + side * size * .27);
      ctx.strokeStyle = "#ff8a3d"; ctx.lineWidth = .9 + cluster * .47;
      ctx.globalAlpha = alpha * (.38 + Math.sin(time * 2 - i * .89) * .23); ctx.stroke();
    }
    ctx.restore(); // Drop the organic silhouette clip. The full damage mask remains.
    ctx.globalCompositeOperation = "lighter";
    for (const side of [-1, 1]) {
      ctx.strokeStyle = capLight; ctx.globalAlpha = alpha * .31;
      ctx.lineWidth = Math.min(15, width * .09);
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const x = length * i / steps, y = bank(x, side);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    // Small glints and rising embers ride advected currents around the banks.
    const tendrils = Math.ceil(tier().strands / 2);
    ctx.strokeStyle = "#ffd599";
    for (let i = 0; i < tendrils; i++) {
      const x = fract(seed(i + 93) - time * .055) * length;
      const y = channel(x) + (seed(i + 65) - .5) * width * .18, reach = width * (.025 + .04 * seed(i));
      ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 4, y - reach, x + 11, y + reach, x + 17, y - reach * .3);
      ctx.globalAlpha = alpha * (.15 + .20 * seed(i + 43)); ctx.lineWidth = .4 + seed(i + 1) * .6; ctx.stroke();
    }
    for (let i = 0; i < tier().strands * 2; i++) {
      const life = fract(seed(i + 501) + time * (.11 + seed(i + 151) * .19));
      const side = i % 2 ? 1 : -1, x = length * (.018 + seed(i + 759) * .964);
      const y = bank(x, side) + side * life * width * .20;
      const span = 1 + seed(i + 78) * Math.min(11, width * .075);
      ctx.strokeStyle = i % 4 ? "#ff752d" : "#ffdc92";
      ctx.globalAlpha = alpha * Math.sin(Math.PI * life) * envelope(x) * (.35 + seed(i + 57) * .5);
      ctx.lineWidth = .7 + seed(i + 473) * 1.6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + span, y - side * span * .67); ctx.stroke();
    }
    ctx.restore(); return true;
  }
  function drawEruption(ctx, circle, material, age, alpha) {
    const { x, y, radius: r } = circle;
    if (!(r > 0)) return;
    stats.effects++; const time = motionTime(age);
    ctx.save(); ringClip(ctx, x, y, r, circle.innerRadius || 0);
    const heat = ctx.createRadialGradient(x - r * .11, y - r * .13, 0, x, y, r);
    heat.addColorStop(0, "#fff2bd"); heat.addColorStop(.21, "#ffae42"); heat.addColorStop(.48, "#c13b1cdf");
    heat.addColorStop(.75, "#41191ba0"); heat.addColorStop(1, "#1a101700");
    ctx.fillStyle = heat; ctx.globalAlpha = alpha; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    stamp(ctx, "magma", age, x, y, r * 1.84, r * 1.84, alpha * .94);
    const count = stats.tier === "high" ? 11 : 7;
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996 + time * .35, arc = fract(time * .32 + seed(i + 71));
      const orbit = r * (.18 + .63 * arc);
      rock(ctx, x + Math.cos(a) * orbit, y + Math.sin(a) * orbit - Math.sin(arc * Math.PI) * r * .20,
        r * (.075 + seed(i) * .11), a, time, alpha * Math.sin(Math.PI * arc));
    }
    ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    for (let i = 0; i < tier().strands * 2; i++) {
      const t = fract(time * (.32 + seed(i + 419) * .31) + seed(i + 127));
      const angle = seed(i + 163) * TAU + t * .45, rad = r * (.23 + t * .76);
      const previous = rad - 2 - seed(i + 19) * r * .17;
      ctx.strokeStyle = i % 3 ? "#ff772d" : "#ffe894";
      ctx.globalAlpha = alpha * Math.sin(Math.PI * t) * .79;
      ctx.lineWidth = .63 + seed(i + 71) * Math.min(3, r * .037);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle - .09) * previous, y + Math.sin(angle - .09) * previous);
      ctx.lineTo(x + Math.cos(angle) * rad, y + Math.sin(angle) * rad);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMagmaShell(ctx, x, y, width, halfHeight, age, alpha) {
    if (!(width > 0 && halfHeight > 0)) return false;
    const time = motionTime(age);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(width, halfHeight);
    ctx.beginPath();
    ctx.moveTo(-.91, -.39);
    ctx.lineTo(-.55, -.80); ctx.lineTo(.09, -.99); ctx.lineTo(.66, -.66);
    ctx.lineTo(1, -.16); ctx.lineTo(.78, .63); ctx.lineTo(.18, .99);
    ctx.lineTo(-.57, .85); ctx.lineTo(-1, .29);
    ctx.closePath(); ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.drawImage(basaltTexture(), -1, -1, 2, 2);
    const shade = ctx.createLinearGradient(-.76, -.86, .82, .83);
    shade.addColorStop(0, "#df86576f"); shade.addColorStop(.24, "#b6603129");
    shade.addColorStop(.54, "#170b1903"); shade.addColorStop(1, "#0a080dbd");
    ctx.fillStyle = shade; ctx.fillRect(-1, -1, 2, 2);
    ctx.globalCompositeOperation = "lighter";
    const seams = [[-.86,-.41,-.34,-.20,-.20,.46,-.51,.82], [-.35,-.20,.15,-.35,.26,-.84],
      [-.20,.46,.21,.27,.62,.66], [.21,.27,.66,-.02,.82,-.58], [.15,-.35,.66,-.02,.97,-.10]];
    for (let i = 0; i < seams.length; i++) {
      const path = seams[i];
      ctx.beginPath(); ctx.moveTo(path[0], path[1]);
      for (let k = 2; k < path.length; k += 2) ctx.lineTo(path[k], path[k + 1]);
      ctx.strokeStyle = "#a84424"; ctx.lineWidth = .085; ctx.globalAlpha = alpha * .62; ctx.stroke();
      ctx.strokeStyle = "#ffb666"; ctx.lineWidth = .022;
      ctx.globalAlpha = alpha * (.62 + Math.sin(time * 3.1 + i * .8) * .21); ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function drawSporeCloud(ctx, circle, age, alpha) {
    const { x, y, radius } = circle, inner = circle.innerRadius || 0;
    if (!(radius > inner && radius > 0)) return false;
    stats.effects++;
    const time = motionTime(age), width = radius - inner;
    ctx.save();
    ringClip(ctx, x, y, radius, inner);
    const fog = ctx.createRadialGradient(x, y, inner, x, y, radius);
    fog.addColorStop(0, inner > 0 ? "#56783300" : "#22380fc0");
    fog.addColorStop(.23, "#354e17af");
    fog.addColorStop(.63, "#71913172");
    fog.addColorStop(1, "#73953900");
    ctx.fillStyle = fog; ctx.globalAlpha = alpha;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    const mist = sporeMistTexture(), count = stats.tier === "low" ? 8 : stats.tier === "medium" ? 12 : 17;
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996 + time * (.09 + seed(i + 298) * .10);
      const size = width * (.16 + seed(i + 109) * .13);
      const orbit = inner + width * (.25 + seed(i + 523) * .5);
      ctx.save();
      ctx.translate(x + Math.cos(a) * orbit, y + Math.sin(a) * orbit);
      ctx.rotate(a + time * .18);
      ctx.globalAlpha = alpha * (.39 + seed(i + 118) * .29);
      ctx.drawImage(mist, -size, -size, size * 2, size * 2);
      ctx.restore();
    }
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < tier().strands * 3; i++) {
      const p = fract(seed(i + 606) + time * (.065 + seed(i + 46) * .13));
      const a = i * 2.39996 - time * .14 + p * .59, r = inner + width * (.03 + p * .94);
      const size = Math.max(.45, Math.min(2.1, radius * .009)) * (.52 + seed(i + 50));
      ctx.globalAlpha = alpha * (.35 + seed(i + 83) * .49) * Math.sin(p * Math.PI);
      ctx.fillStyle = i % 5 ? "#a5cf4b" : "#e6ff89";
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r, size * 1.4, size, a, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    return true;
  }

  function drawSporePod(ctx, node, age, alpha, radius = node.radius) {
    if (node.health <= 0 || !(radius > 0)) return false;
    const { x, y } = node, time = motionTime(age);
    const health = node.maxHealth > 0 ? clamp01(node.health / node.maxHealth) : 1;
    const pulse = 1 + Math.sin(time * (2.4 + (1 - health) * 3.6) + x * .029) * (.036 + (1 - health) * .075);
    const r = radius * pulse;
    ctx.save(); ctx.translate(x, y);
    ctx.globalAlpha = alpha * .54;
    ctx.drawImage(sporeMistTexture(), -r * 1.84, -r * 1.84, r * 3.68, r * 3.68);
    // Tapered mycelia run from the living membrane into the drifting cloud.
    const threads = stats.tier === "low" ? 8 : 15;
    ctx.lineCap = "round";
    for (let i = 0; i < threads; i++) {
      const turn = i * TAU / threads + Math.sin(time * .52 + i) * .13 + (seed(i + 62) - .5) * .56;
      const length = r * (1.10 + seed(i + 21) * 1.03);
      const dx = Math.cos(turn), dy = Math.sin(turn), sway = Math.sin(time * 1.25 + i * 2.3) * .25;
      ctx.beginPath(); ctx.moveTo(dx * r * .62, dy * r * .62);
      ctx.bezierCurveTo(dx * r - dy * r * sway, dy * r + dx * r * sway,
        dx * length + dy * r * .39, dy * length - dx * r * .39, dx * length, dy * length);
      ctx.lineWidth = Math.max(.65, r * .047);
      ctx.strokeStyle = "#415b1d"; ctx.globalAlpha = alpha * .68; ctx.stroke();
      ctx.lineWidth = Math.max(.32, r * .019);
      ctx.strokeStyle = "#d0fa79"; ctx.globalAlpha = alpha * (.22 + seed(i + 618) * .42); ctx.stroke();
      if (i % 2 === 0) {
        ctx.beginPath(); ctx.moveTo(dx * length * .83, dy * length * .83);
        ctx.quadraticCurveTo(dx * length * .9 - dy * r * .35, dy * length * .9 + dx * r * .35,
          dx * length * 1.04 - dy * r * .42, dy * length * 1.04 + dx * r * .42);
        ctx.globalAlpha *= .68; ctx.stroke();
      }
    }
    const membrane = ctx.createRadialGradient(-r * .25, -r * .28, 0, 0, 0, r * 1.09);
    membrane.addColorStop(0, "#e1ff9a"); membrane.addColorStop(.23, "#97d741");
    membrane.addColorStop(.58, "#3b6924"); membrane.addColorStop(.86, "#335218");
    membrane.addColorStop(.94, "#83b94a"); membrane.addColorStop(1, "#111c10");
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = i * TAU / 48, lobe = r * (.943 + Math.sin(a * 5 + time * .87) * .076 + Math.cos(a * 9 - time * .76) * .034);
      if (i) ctx.lineTo(Math.cos(a) * lobe, Math.sin(a) * lobe * .88);
      else ctx.moveTo(Math.cos(a) * lobe, Math.sin(a) * lobe * .88);
    }
    ctx.closePath(); ctx.fillStyle = membrane; ctx.globalAlpha = alpha; ctx.fill(); ctx.clip();
    ctx.globalAlpha = alpha * .61; ctx.drawImage(sporeMistTexture(), -r * 1.35, -r * 1.35, r * 2.7, r * 2.7);
    for (let vein = 0; vein < 9; vein++) {
      const a = vein * TAU / 9 + (seed(vein + 608) - .5) * .75;
      const dx = Math.cos(a), dy = Math.sin(a), length = r * (.63 + seed(vein) * .41);
      ctx.beginPath();
      ctx.moveTo(dx * r * .13 - r * .13, dy * r * .13 - r * .22);
      ctx.bezierCurveTo(dx * r * .35 - dy * r * .22, dy * r * .35 + dx * r * .22,
        dx * length * .75, dy * length * .75, dx * length, dy * length);
      ctx.strokeStyle = "#183321"; ctx.lineWidth = Math.max(.75, r * .067); ctx.globalAlpha = alpha * .72; ctx.stroke();
      ctx.strokeStyle = "#c8f96c"; ctx.lineWidth = Math.max(.45, r * .025);
      ctx.globalAlpha = alpha * (.37 + .22 * Math.sin(time * 3.2 + vein)); ctx.stroke();
    }
    // Embedded vesicles and smaller cell walls read through the skin.
    for (let i = 0; i < tier().strands; i++) {
      const a = i * 2.39996, size = r * (.025 + .075 * seed(i + 23));
      const l = r * (.18 + .79 * seed(i + 236));
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * l, Math.sin(a) * l, size, size * .62, a * .75, 0, TAU);
      ctx.strokeStyle = "#a6d651"; ctx.lineWidth = Math.max(.42, r * .012);
      ctx.globalAlpha = alpha * (.18 + seed(i + 449) * .31); ctx.stroke();
    }
    const seedGlow = ctx.createRadialGradient(-r * .17, -r * .21, 0, -r * .17, -r * .21, r * .45);
    seedGlow.addColorStop(0, "#efffb4a2"); seedGlow.addColorStop(.38, "#dcff6b63"); seedGlow.addColorStop(1, "#abfa1900");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = seedGlow; ctx.globalAlpha = alpha * (.64 + (1 - health) * .32);
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
    return true;
  }

  function drawVortex(ctx, circle, material, age, alpha, coreRadius, kind = "water", spin = 1) {
    const { x, y, radius } = circle;
    if (!(radius > 0)) return false;
    const time = motionTime(age), water = kind === "water";
    const core = Math.max(0, Math.min(radius, coreRadius));
    stats.effects++;
    if (!water) drawSporeCloud(ctx, circle, age, alpha * .61);
    ctx.save(); ringClip(ctx, x, y, radius);
    if (core > 0) {
      const eye = ctx.createRadialGradient(x, y, 0, x, y, core * 1.15);
      eye.addColorStop(0, water ? "#051522f0" : "#142614ee");
      eye.addColorStop(.66, water ? "#082f43cf" : "#3a6923c2");
      eye.addColorStop(.87, water ? "#24657aaa" : "#a5c66780");
      eye.addColorStop(1, "#081a1c00");
      ctx.fillStyle = eye; ctx.globalAlpha = alpha;
      ctx.fillRect(x - core * 1.15, y - core * 1.15, core * 2.3, core * 2.3);
    }
    ctx.translate(x, y);
    ctx.globalCompositeOperation = "lighter";
    if (water) {
      const foam = waterFoamTexture();
      ctx.save();
      ctx.rotate(time * .54 * spin + .7);
      ctx.globalAlpha = alpha * .85;
      ctx.drawImage(foam, -radius, -radius, radius * 2, radius * 2);
      ctx.rotate(-time * .77 * spin + 1.82);
      ctx.globalAlpha = alpha * .46;
      ctx.drawImage(foam, -radius * .82, -radius * .82, radius * 1.64, radius * 1.64);
      ctx.restore();
    }
    const arms = water ? 6 : 9, steps = stats.tier === "low" ? 16 : 32;
    const spiralLight = ctx.createRadialGradient(0, 0, radius * .07, 0, 0, radius);
    spiralLight.addColorStop(0, water ? "#2c90b300" : "#62963d00");
    spiralLight.addColorStop(.31, water ? "#35dff4b0" : "#8acad294");
    spiralLight.addColorStop(.67, water ? "#a2faffdc" : material.rim);
    spiralLight.addColorStop(1, water ? "#00b6ea00" : "#93a93b00");
    ctx.lineCap = "round"; ctx.strokeStyle = spiralLight;
    for (let arm = 0; arm < arms; arm++) {
      const base = arm * TAU / arms + time * (arm % 2 ? .59 : .40) * spin;
      ctx.beginPath();
      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const a = base + Math.log(.12 + t * .88) * (water ? 2.35 : 1.81);
        const r = radius * (.16 + t * .82) * (1 + Math.sin(a * 3 + arm) * .012);
        const px = Math.cos(a) * r, py = Math.sin(a) * r;
        if (step) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.globalAlpha = alpha * (water ? .28 : .15); ctx.lineWidth = Math.max(1, radius * .055); ctx.stroke();
      ctx.globalAlpha = alpha * (water ? .71 : .31); ctx.lineWidth = Math.max(.65, radius * .012); ctx.stroke();
    }
    for (let i = 0; i < tier().strands * 3; i++) {
      const p = fract(seed(i + 342) - time * (.089 + seed(i + 93) * .21));
      const orbit = radius * (.15 + .82 * p), a = seed(i + 178) * TAU + Math.log(.11 + p * .89) * 2.8 + time * .43 * spin;
      const px = Math.cos(a) * orbit, py = Math.sin(a) * orbit;
      const size = (.45 + seed(i + 80) * 2.4) * Math.min(1.5, radius / 65);
      ctx.strokeStyle = water ? "#87e9f2" : "#d3f26f"; ctx.fillStyle = ctx.strokeStyle;
      ctx.globalAlpha = alpha * Math.sin(p * Math.PI) * .84;
      ctx.lineWidth = Math.max(.5, size * .32);
      ctx.beginPath(); ctx.ellipse(px, py, size * 1.15, size * .83, a, 0, TAU);
      if (water && i % 4) ctx.stroke(); else ctx.fill();
    }
    ctx.restore();
    return true;
  }

  function drawVoid(ctx, circle, material, age, alpha, water = false) {
    const { x, y, radius: r } = circle, inner = circle.innerRadius || 0;
    if (!(r > inner && r > 0)) return false;
    stats.effects++; const time = motionTime(age), span = r - inner;
    const sampled = backdrop(ctx, x, y, r * 1.12);
    ctx.save(); ringClip(ctx, x, y, r, inner);
    if (!water && inner === 0 && typeof BlackHoleSurface !== "undefined") {
      // The void surface is shared by wells, ultimate annuli and riftFold.
      // Thin damaging annuli retain the full-width material below: cropping a
      // disk's transparent outskirts into a narrow wave would hide its damage.
      if (sampled) {
        ctx.save(); ctx.translate(x,y); ctx.rotate(.025*Math.sin(time*.6));
        ctx.globalAlpha=alpha*.33;
        ctx.drawImage(sampled,-r*1.08,-r*1.08,r*2.16,r*2.16);ctx.restore();
      }
      BlackHoleSurface.draw(ctx,x,y,r,time,alpha,stats.tier);
      ctx.restore();return true;
    }
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
    // Collapsing singularities legitimately pass through subpixel radii. Keep
    // the decorative inset nonnegative so the final frame cannot halt RAF.
    ctx.beginPath(); ctx.arc(x, y, Math.max(0, r - .8), 0, TAU); if (inner > 0) ctx.arc(x, y, inner + .8, 0, TAU, true); ctx.stroke();
    ctx.restore(); return true;
  }

  function drawWaterJet(ctx, length, left, right, age, alpha) {
    const time = motionTime(age), half = Math.max(left, right), bands = stats.tier === "low" ? 7 : 13;
    ctx.save();ctx.beginPath();ctx.moveTo(0,-left);ctx.lineTo(length,-right);ctx.lineTo(length,right);ctx.lineTo(0,left);ctx.closePath();ctx.clip();
    const depth=ctx.createLinearGradient(0,-half,0,half);
    depth.addColorStop(0,"#326f82");depth.addColorStop(.15,"#092b44");depth.addColorStop(.38,"#157b94");depth.addColorStop(.51,"#bcebec");depth.addColorStop(.64,"#2d91a3");depth.addColorStop(1,"#05223b");
    ctx.fillStyle=depth;ctx.globalAlpha=alpha;ctx.fillRect(0,-half,length,half*2);
    for(let i=0;i<bands;i++){
      const fraction=(i+.5)/bands*2-1;
      ctx.beginPath();
      for(let j=0;j<=24;j++){
        const t=j/24,x=t*length,w=left+(right-left)*t;
        const y=fraction*w+Math.sin(t*24-time*3+i)*w*.04;
        if(!j)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.strokeStyle=i%3?"#a2e4e9":"#07283d";ctx.globalAlpha=alpha*(i%3?.19:.55);ctx.lineWidth=i%3?.7:half*.14;ctx.stroke();
    }
    ctx.fillStyle="#e7ffff";
    for(let i=0;i<tier().strands;i++){
      const t=fract(seed(i)+time*.37),w=left+(right-left)*t,x=t*length,y=(seed(i+27)-.5)*w*1.6;
      ctx.globalAlpha=alpha*(.25+seed(i+67)*.35);ctx.beginPath();ctx.ellipse(x,y,2+seed(i+4)*7,.5+seed(i+9),0,0,TAU);ctx.fill();
    }
    ctx.restore();
  }

  function drawRift(ctx, line, material, age, alpha) {
    const length = Math.hypot(line.x2 - line.x1, line.y2 - line.y1), half = line.width / 2;
    if (!(length > 0 && half > 0)) return;
    const time = motionTime(age), count = Math.min(64, Math.max(12, Math.ceil(length / 20)));
    ctx.save(); ctx.translate(line.x1, line.y1); ctx.rotate(Math.atan2(line.y2 - line.y1, line.x2 - line.x1));
    ctx.beginPath(); ctx.rect(0, -half, length, half * 2); ctx.clip();
    const depth=ctx.createLinearGradient(0,-half,0,half);
    depth.addColorStop(0,"#b076ff44");depth.addColorStop(.12,"#9468f833");
    depth.addColorStop(.27,"#28377622");depth.addColorStop(.44,"#b995ff77");
    depth.addColorStop(.48,"#eef4ffee");depth.addColorStop(.50,"#01020aee");
    depth.addColorStop(.52,"#d5e5ffee");depth.addColorStop(.56,"#768af577");
    depth.addColorStop(.77,"#3d287422");depth.addColorStop(1,"#a28bff44");
    ctx.fillStyle = depth; ctx.globalAlpha = alpha; ctx.fillRect(0, -half, length, half * 2);
    for (let side of [-1, 1]) {
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        for (let i = 0; i <= count; i++) {
          const x = i / count * length, y = side * half * (.81 - layer * .19) + Math.sin(i * 2.29 + time * .35) * half * .13;
          if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = layer === 0 ? "#c9d5ff" : layer === 1 ? "#9468f8" : "#3931a4";
        ctx.lineWidth = layer === 0 ? .85 : half * .15; ctx.globalAlpha = alpha * (layer ? .28 : .83); ctx.stroke();
      }
    }
    // Flowing glints stay within the unchanged seam thickness, exposing the
    // torn edges without painting flat opaque bars across the black-hole core.
    for(let i=0;i<12;i++){
      const t=fract(i*.618+time*.16),px=t*length,side=i%2?1:-1;
      const py=side*half*.75;ctx.strokeStyle=i%2?"#a2baff":"#dd9aff";
      ctx.globalAlpha=alpha*(.4+seed(i)*.4);ctx.lineWidth=.8;
      ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(Math.min(length,px+8+seed(i+4)*16),py+side*half*.09);ctx.stroke();
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
      if (local === "bone") {
        // Porous joint heads and a pinched shaft, visibly unlike armor scales.
        const marrow=ctx.createLinearGradient(0,-width*.65,0,width*.65);
        marrow.addColorStop(0,"#ead8b9");marrow.addColorStop(.38,"#b69e80");marrow.addColorStop(.64,"#6b554c");marrow.addColorStop(1,"#d7bda0");
        ctx.fillStyle=marrow;ctx.globalAlpha=alpha;ctx.beginPath();ctx.moveTo(x-s,-width*.52);
        ctx.bezierCurveTo(x-s*.55,-width*.78,x-s*.50,-width*.23,x, -width*.23);
        ctx.bezierCurveTo(x+s*.48,-width*.22,x+s*.56,-width*.76,x+s,-width*.48);
        ctx.bezierCurveTo(x+s*1.22,-width*.12,x+s*1.20,width*.38,x+s*.72,width*.52);
        ctx.bezierCurveTo(x+s*.35,width*.18,x-s*.34,width*.16,x-s*.76,width*.50);
        ctx.bezierCurveTo(x-s*1.17,width*.33,x-s*1.17,-width*.20,x-s,-width*.52);ctx.closePath();ctx.fill();
        ctx.strokeStyle="#342a30";ctx.globalAlpha=alpha*.65;ctx.lineWidth=.7;
        ctx.beginPath();ctx.moveTo(x-s*.72,-width*.32);ctx.lineTo(x-s*.50,width*.16);ctx.lineTo(x-s*.68,width*.30);ctx.stroke();
      } else if (local === "chitin") {
        polygon(ctx, [x - s, -width * .70, x + s * .60, -width * .43, x + s, 0, x, width * .45, x - s * .75, 0], "#78a698", alpha);
        polygon(ctx, [x - s * .75, 0, x, width * .45, x + s, 0, x + s * .6, width * .7, x - s, width * .45], "#183139", alpha);
        polygon(ctx, [x-s*.72,-width*.56,x-s*.25,-width*.96,x+s*.12,-width*.43], "#b3cab6", alpha*.9);
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
  return Object.freeze({ beginFrame, phase, warmMaterial, drawWaterSection, drawMagmaFissure, drawEruption, drawMagmaShell,
    drawCinderRift, drawCinderCharge, drawCinderAftershock,
    drawSporeCloud, drawSporePod, drawVortex, drawVoid, drawRift, drawWaterJet, drawRaySkin, stamp, rock,
    diagnostics: () => ({ ...stats, budget: tier(), atlasReady: [...atlases].filter(([, v]) => v.ready).map(([k]) => k), sampleSize: 224,
      extraWebGLContexts: typeof BlackHoleSurface === "undefined" ? 0 : BlackHoleSurface.diagnostics().extraWebGLContexts,
      blackHole: typeof BlackHoleSurface === "undefined" ? null : BlackHoleSurface.diagnostics() }) });
})();
