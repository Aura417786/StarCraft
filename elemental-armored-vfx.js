"use strict";

// The three species share the same atlas sampler. Their materials, trajectories
// and timing follow the independently authored hazards in boss-pressure.js.
const ElementalArmoredVfx = (() => {
  const TAU = Math.PI * 2;
  const atlas = new Image();
  atlas.decoding = "async";
  atlas.src = "assets/vfx/elemental-armored-atlas.webp";
  const cellWidth = 512, cellHeight = 224;
  const palettes = {
    bone: { deep: "#4e3029", edge: "#c19466", core: "#ffe6b8" },
    silk: { deep: "#4d216f", edge: "#ca8bff", core: "#ffe1fb" },
    chitin: { deep: "#1a3d34", edge: "#a0d17c", core: "#e7ffc1" },
  };
  const debris = Array.from({ length: 48 }, (_, index) => ({
    along: random(index * 3 + 171), phase: random(index * 7 + 79), size: random(index + 623),
    spin: random(index * 4 + 61), lift: random(index * 2 + 137),
  }));

  function ready() { return atlas.complete && atlas.naturalWidth === cellWidth * 3; }
  function fractional(n) { return n - Math.floor(n); }
  function random(seed) { return fractional(Math.sin(seed * 86.41 + 4.63) * 2417.571); }
  function span(x, min, max) { return Math.max(min, Math.min(max, x)); }
  function stamp(ctx, col, row, x, y, width, height, angle = 0, mirror = false) {
    if (!(width > 0 && height > 0)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (mirror) ctx.scale(1, -1);
    ctx.drawImage(atlas, col * cellWidth, (row % 2) * cellHeight, cellWidth, cellHeight,
      -width / 2, -height / 2, width, height);
    ctx.restore();
  }

  function ray(ctx, x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function dust(ctx, kind, x, y, radius, phase, quiet, count = 12, salt = 0) {
    if (quiet || visualQuality.id === "low") return;
    const opacity = ctx.globalAlpha;
    ctx.fillStyle = palettes[kind].core;
    for (let i = 0; i < count; i++) {
      const seed = i + salt, local = fractional(phase + random(seed + 18));
      const angle = random(seed + 103) * TAU;
      const distance = radius * (.17 + local * .83);
      const px = x + Math.cos(angle) * distance;
      const py = y + Math.sin(angle) * distance;
      const size = (1 + random(seed + 33) * 2.9) * (1 - local * .73);
      ctx.globalAlpha = opacity * Math.sin(local * Math.PI) * (.31 + random(seed + 57) * .64);
      ctx.beginPath();
      ctx.ellipse(px, py, size * 1.8, size * .50, angle, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = opacity;
  }

  function tell(ctx, segment, color, alpha = .75) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.setLineDash([6, 10]);
    ray(ctx, segment.x1, segment.y1, segment.x2, segment.y2, color, 1.4);
    ctx.restore();
  }

  // A continuous particulate wake follows a moving edge. The first layer is
  // mineral dust, the second angular, lit splinters. No particle owns a clock.
  function surfaceSpray(ctx, kind, run, reach, phase, quiet, salt = 0, strength = 1) {
    if (!(run > 0 && reach > 0) || strength < .02) return;
    const tone = palettes[kind];
    const count = quiet ? 12 : visualQuality.id === "high" ? 42 : 26;
    const clock = quiet ? .38 : phase;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const opacity = ctx.globalAlpha * strength;
    const mist = pressureArtMist(tone.edge);
    for (let i = 0; i < 4; i++) {
      const particle = debris[(i * 7 + salt) % debris.length];
      const local = fractional(clock * .43 + particle.phase);
      const x = run * (.11 + i * .24 + particle.along * .083);
      const y = reach * (.17 + local * .78);
      const radius = reach * (.42 + particle.size * .46);
      ctx.globalAlpha = opacity * .20 * Math.sin(local * Math.PI);
      ctx.drawImage(mist, x - radius * 1.9, y - radius, radius * 3.8, radius * 2);
    }
    for (let layer = 0; layer < 2; layer++) {
      ctx.beginPath();
      for (let i = layer; i < count; i += 2) {
        const particle = debris[(i + salt) % debris.length];
        const local = fractional(clock * (.51 + particle.lift * .72) + particle.phase);
        if (local < .05 || local > .95) continue;
        const x = run * particle.along + (particle.spin - .52) * reach * local * 1.72;
        const y = reach * (.04 + local * (.24 + particle.lift * .73));
        const size = (.66 + particle.size ** 2 * (layer ? 6.8 : 2.9))
          * (1 - local * .61) * (.52 + .48 * Math.sin(local * Math.PI));
        const angle = particle.spin * TAU + local * (quiet ? 0 : 4.2);
        const ux = Math.cos(angle) * size, uy = Math.sin(angle) * size;
        ctx.moveTo(x - ux * 1.85, y - uy * 1.85);
        ctx.lineTo(x + uy * .43, y - ux * .43);
        ctx.lineTo(x + ux * 1.49, y + uy * 1.49);
        if (layer) ctx.lineTo(x - uy * .34, y + ux * .34);
        ctx.closePath();
      }
      ctx.fillStyle = layer ? tone.core : tone.edge;
      ctx.globalAlpha = opacity * (layer ? .86 : .52);
      ctx.fill();
    }
    ctx.restore();
  }

  function needlePath(ctx, segment, active, progress, quiet, seed) {
    const { x1, y1, x2, y2, width } = segment;
    const l = Math.hypot(x2 - x1, y2 - y1);
    if (l < 1) return;
    if (!active) {
      ctx.save();
      ctx.translate(x1, y1);
      ctx.rotate(Math.atan2(y2 - y1, x2 - x1));
      const pathLight = ctx.createLinearGradient(0, 0, l, 0);
      pathLight.addColorStop(0, palettes.bone.core + "07");
      pathLight.addColorStop(.16, palettes.bone.edge + "91");
      pathLight.addColorStop(.79, palettes.bone.core + "a0");
      pathLight.addColorStop(1, palettes.bone.core + "0d");
      ctx.lineWidth = Math.max(1, width * .12);
      ctx.strokeStyle = pathLight;
      ctx.lineCap = "round";
      ctx.setLineDash([6, 12, 2, 15]);
      ctx.lineDashOffset = quiet ? 0 : -progress * 31;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(l, 0);
      ctx.stroke();
      surfaceSpray(ctx, "bone", l, Math.max(8, width * .72), progress, quiet, seed + 23, .34);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(Math.atan2(y2-y1, x2-x1));
    // The intact rib throws a narrow marrow trail. Its polished tooth turns
    // into the travel direction while tiny splinters keep the ray readable.
    const motion = quiet ? .38 : progress;
    ctx.save();
    ctx.scale(1, -1);
    surfaceSpray(ctx, "bone", l, Math.max(13, width * 1.65), motion * 1.25, quiet, seed + 23, .84);
    ctx.restore();
    const wake = ctx.createLinearGradient(0, 0, l, 0);
    wake.addColorStop(0, "#fff0cbab"); wake.addColorStop(.43,"#c69a698c"); wake.addColorStop(1,"#cbad7700");
    ctx.strokeStyle = wake; ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1, width * .25);
    ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo(l*.34,width*.10,l,0); ctx.stroke();
    for (let i=0;i<5;i++) {
      const t=fractional(motion*(.86+i*.025)+i/7+seed*.074);
      const size=Math.min(l*.16,width*(2.8+random(i+seed)*2.6));
      BossCreatureVfx.bone(ctx,l*t,(random(i+seed*3)-.5)*width*.45,size,size*.33,
        .1*Math.sin(i*2.2+motion*11),i%4,i%2===0);
    }
    const travel=fractional(.16+seed*.093+motion*1.21);
    const size=Math.min(l*.24,width*(7.3+random(seed)*2.5));
    BossCreatureVfx.bone(ctx,l*travel,-width*.32,size,size*.49,
      -.45+.21*Math.sin(seed*1.5+motion*8),seed%4,seed%2===1);
    ctx.restore();
  }

  function thread(ctx, segment, active, progress, quiet, seed = 0) {
    const { x1, y1, x2, y2, width } = segment;
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy);
    if (l < 1) return;
    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(Math.atan2(dy, dx));
    const opacity = ctx.globalAlpha;
    const count = quiet || visualQuality.id === "low" ? 3 : 6;
    const drift = quiet ? 0 : progress;
    ctx.lineCap = "round";
    for (let strand = 0; strand < count; strand++) {
      const across = (strand / (count - 1) - .5) * width * .84;
      const tension = active ? .7 + .3*Math.cos(drift*11 + seed*1.3) : .55;
      const slack = (strand%2 ? -1 : 1) * Math.min(l*.085,width*2.1) *
        (.36 + random(seed + strand * 1.37)*.9) * (1.34-tension*.57);
      ctx.strokeStyle = palettes.silk.deep;
      ctx.lineWidth = width * (active ? .34 : .22);
      ctx.globalAlpha = opacity * (active ? .50 : .24);
      ctx.beginPath();
      ctx.moveTo(0, across * .27);
      ctx.bezierCurveTo(l*.16,across+slack*.68,l*.37,across+slack,l*.58,across+slack*.71);
      ctx.quadraticCurveTo(l*.84,across+slack*.53,l,across*.27);
      ctx.stroke();
      ctx.strokeStyle = strand % 3 ? palettes.silk.edge : palettes.silk.core;
      ctx.lineWidth = Math.max(.62, width * (strand % 3 ? .055 : .088));
      ctx.globalAlpha = opacity * (active ? .9 : .56);
      ctx.stroke();
      if (active && !quiet && strand % 2 === 0) {
        const t = fractional(seed * .2 + strand * .24 + drift * 1.13);
        ctx.fillStyle = palettes.silk.core;
        ctx.globalAlpha = opacity * (.36 + .36 * Math.sin(t * Math.PI));
        ctx.beginPath();
        ctx.ellipse(t*l, across*(.27+.73*Math.sin(t*Math.PI))+Math.sin(t*Math.PI)*slack*.73,
          width*.27,width*.16,-.21+seed*.13,0,TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function silkNode(ctx, node, phase, active, quiet, index) {
    if (!(node.health > 0 && node.radius > 0)) return;
    const r = node.radius;
    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.globalAlpha *= active ? 1 : .57;
    const breath = quiet ? 1 : 1 + Math.sin(phase * TAU * 2 + index * 1.1) * .078;
    // Strands stay pinned at the node while the living cocoon rolls in tension.
    const swing = quiet ? 0 : .20*Math.sin(phase*8+index*2);
    if (!BossSpellMatter.draw(ctx,"spindle",0,0,r*3.62/breath,r*4.15*breath,swing-.16))
      stamp(ctx,1,index,0,0,r*4.09*breath,r*2.17*breath,-.36+index*.17);
    const glow = ctx.createRadialGradient(-r * .19, -r * .21, 0, -r * .19, -r * .21, r * .90);
    glow.addColorStop(0, "#ffe6ffd4");
    glow.addColorStop(.27, "#d682f37b");
    glow.addColorStop(1, "#61228700");
    ctx.fillStyle = glow;
    ctx.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 3.2);
    ctx.strokeStyle = "#f0b1e976";
    ctx.lineWidth = Math.max(.8, r * .048);
    for (let i = 0; i < 6; i++) {
      const angle = (i + .2) * TAU / 6 + index;
      const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
      ctx.beginPath(); ctx.moveTo(x * .68, y * .68);
      ctx.quadraticCurveTo(x * 1.01 - y * .29, y * 1.02 + x * .38, x * 1.28, y * 1.28);
      ctx.stroke();
    }
    ctx.restore();
  }

  function chitinPath(ctx,segment,active,progress,quiet,seed) {
    if(!active) { tell(ctx,segment,palettes.chitin.edge);return; }
    const {x1,y1,x2,y2,width}=segment, dx=x2-x1,dy=y2-y1;
    const length=Math.hypot(dx,dy);
    if(length<1) return;
    const wave=quiet ? .8 : progress*11;
    const pulse=fractional(progress*1.65+seed*.23);
    ctx.save();ctx.translate(x1,y1);ctx.rotate(Math.atan2(dy,dx));
    const skin=ctx.createLinearGradient(0,-width,0,width);
    skin.addColorStop(0,"#161d12");skin.addColorStop(.36,"#29412f");skin.addColorStop(.48,"#c1d69e");
    skin.addColorStop(.59,"#516443");skin.addColorStop(.82,"#283427");skin.addColorStop(1,"#706339");
    ctx.fillStyle=skin;ctx.beginPath();
    function ridge(t) {return Math.sin(t*17-wave)*width*.33*Math.sin(Math.PI*t);}
    function girth(t) {
      const bulb=Math.exp(-((t-pulse)**2)*105);
      return Math.sin(Math.PI*t)**.58*width*(.18+.7*bulb+.12*Math.sin(t*22+seed));
    }
    for(let i=0;i<=32;i++) {
      const t=i/32, y=ridge(t)-girth(t);
      if(i===0)ctx.moveTo(0,y);else ctx.lineTo(t*length,y);
    }
    for(let i=32;i>=0;i--) {const t=i/32;ctx.lineTo(t*length,ridge(t)+girth(t));}
    ctx.closePath();ctx.fill();
    ctx.lineWidth=Math.max(.75,width*.08);ctx.strokeStyle="#d1deb3a8";ctx.beginPath();
    for(let i=0;i<=25;i++){const t=i/25,y=ridge(t)-girth(t)*.55;if(i===0)ctx.moveTo(0,y);else ctx.lineTo(length*t,y);}
    ctx.stroke();
    surfaceSpray(ctx, "chitin", length, width * 1.6, wave * .17, quiet, seed + 23, .76);
    ctx.beginPath();
    for (let i = 0; i < 13; i++) {
      const u = (i + .51) / 13, x = length * u, y = ridge(u);
      const reach = Math.max(12, width * (1 + debris[i].size * .85));
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x - reach * .36, y - reach * .84, x - reach, y - reach * .42);
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + reach * .32, y + reach * .59, x + reach * .84, y + reach * .25);
    }
    ctx.strokeStyle = "#b0e99266";
    ctx.lineWidth = Math.max(.8, width * .067);
    ctx.stroke();
    ctx.restore();
  }

  function annulus(ctx, kind, ring, progress, quiet, alpha) {
    const { x, y, radius, innerRadius } = ring;
    const inner = Math.max(0, innerRadius);
    if (radius <= inner) return;
    const width = radius - inner, center = (radius + inner) / 2;
    const color = palettes[kind];
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    if (kind === "bone") {
      const turns = 12, spin = quiet ? 0 : progress * .31;
      const shade = ctx.createRadialGradient(0, 0, Math.max(0, center - width * 1.7), 0, 0, center + width * 1.9);
      shade.addColorStop(0, "#b8763900"); shade.addColorStop(.33, "#d49b6331");
      shade.addColorStop(.49, "#ffedc9b5"); shade.addColorStop(.56, "#b67d4860");
      shade.addColorStop(1, "#a2602c00");
      ctx.strokeStyle = shade;
      ctx.lineWidth = width * 3.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < turns; i++) {
        const angle = i * TAU / turns + spin;
        const segment = TAU / turns * (.57 + .32 * debris[i].along);
        ctx.moveTo(Math.cos(angle) * center, Math.sin(angle) * center);
        ctx.arc(0, 0, center, angle, angle + segment);
      }
      ctx.stroke();
      for (let i = 0; i < turns; i++) {
        const s = debris[i];
        const angle = (i + s.along * .51) * TAU / turns + spin;
        const length = Math.min(center * .51, width * (2.2 + s.size * 2.7));
        BossCreatureVfx.bone(ctx, Math.cos(angle) * center, Math.sin(angle) * center, length,
          width * (.91 + s.lift * .74), angle + Math.PI * (.42 + .16 * s.spin), i % 4, i % 3 === 0);
      }
      ctx.globalCompositeOperation = "screen";
      for (let layer = 0; layer < 2; layer++) {
        ctx.beginPath();
        for (let i = layer; i < (quiet ? 16 : 48); i += 2) {
          const s = debris[i];
          const f = fractional((quiet ? .47 : progress * .93) * (1.2 + s.lift) + s.phase);
          const angle = s.along * TAU + spin + (s.spin - .45) * f * .34;
          const offset = width * (i % 3 ? .22 + f * 1.67 : -.28 - f * 1.1);
          const r = Math.max(2, center + offset), x = Math.cos(angle) * r, y = Math.sin(angle) * r;
          const size = (.55 + s.size * (layer ? 4 : 1.8)) * (1 - f * .72);
          ctx.moveTo(x, y - size);
          ctx.lineTo(x + size * 1.6, y + size * .23);
          ctx.lineTo(x - size * .61, y + size * .72);
          ctx.closePath();
        }
        ctx.globalAlpha = alpha * (layer ? .79 : .39);
        ctx.fillStyle = layer ? palettes.bone.core : palettes.bone.edge;
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU);
    if (inner) ctx.arc(0, 0, inner, 0, TAU, true);
    ctx.clip();
    ctx.beginPath(); ctx.arc(0, 0, center, 0, TAU);
    ctx.strokeStyle = color.deep + "b5"; ctx.lineWidth = width; ctx.stroke();
    ctx.strokeStyle = color.edge + "a0"; ctx.lineWidth = Math.max(1, width * .28); ctx.stroke();
    const pieces = quiet || visualQuality.id === "low" ? 20 : 34;
    const col = kind === "bone" ? 0 : kind === "silk" ? 1 : 2;
    for (let i = 0; i < pieces; i++) {
      const a = TAU * (i / pieces + (quiet ? 0 : progress * .095));
      const size = Math.min(width * (kind === "silk" ? 2.4 : 5.1), center * .60);
      stamp(ctx, col, i, Math.cos(a) * center, Math.sin(a) * center,
        size, width * 2.04, a + Math.PI / 2, i % 2);
    }
    ctx.restore();
  }

  function cageRibs(ctx, hazard, active, progress, quiet) {
    const bars = cageBars(hazard, active ? progress : 1);
    const left = hazard.x - hazard.width / 2;
    const count = quiet || visualQuality.id === "low" ? 7 : 11, step = hazard.width / count;
    for (let band = 0; band < bars.length; band++) {
      const y = bars[band], side = band === 0 ? -1 : 1;
      ctx.save();
      ctx.translate(left, y);
      ctx.scale(1, side);
      const cloud = Math.min(step * 1.22, 82);
      const time = quiet ? .38 : hazard.age;
      const depth = ctx.createLinearGradient(0, -hazard.thickness * .42, 0, cloud * 1.37);
      depth.addColorStop(0, "#a97d4b00");
      depth.addColorStop(.18, active ? "#eac2854c" : "#eac28529");
      depth.addColorStop(.47, "#9d74471e");
      depth.addColorStop(1, "#5a494000");
      ctx.fillStyle = depth;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let i = 0; i < count; i++) {
        const x = (i + .31) * step;
        const h = cloud * (.77 + .20 * Math.sin(time * 2 + i));
        ctx.quadraticCurveTo(x, -hazard.thickness * .24, x + step * .51, h * .15);
      }
      ctx.lineTo(hazard.width, 0);
      ctx.bezierCurveTo(hazard.width * .88, cloud * 1.23, hazard.width * .27, cloud * .89, 0, 0);
      ctx.closePath();
      ctx.fill();
      if (!active) ctx.globalAlpha *= .48;
      const cortex = ctx.createLinearGradient(0, 0, 0, cloud * 1.65);
      cortex.addColorStop(0, "#ffeed3");
      cortex.addColorStop(.24, "#dbc3a3");
      cortex.addColorStop(.42, "#8a6d53");
      cortex.addColorStop(.57, "#d0b08e");
      cortex.addColorStop(.76, "#6c5343");
      cortex.addColorStop(1, "#4a3f33");
      ctx.fillStyle = cortex;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const sample = debris[(i + band * 17) % debris.length];
        const x = (i + .42 + sample.along * .22) * step, y = cloud * (.74 + sample.size * .57);
        const edge = x - step * (.29 + sample.lift * .65 + .14 * Math.sin(time * 4 + i));
        const h = Math.max(3.1, step * (.14 + .10 * sample.spin));
        ctx.moveTo(x - h * .78, y);
        ctx.bezierCurveTo(x + h * .52, y * .54, x - h * .11, y * .35, edge, 0);
        ctx.bezierCurveTo(edge + h * 1.14, y * .17, x + h * 1.09, y * .47, x + h * .91, y);
        ctx.quadraticCurveTo(x + h * .11, y + h * .61, x - h * .78, y);
        ctx.closePath();
      }
      ctx.fill();
      ctx.strokeStyle = "#ffeece96";
      ctx.lineWidth = .97;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const s = debris[(i + band * 17) % debris.length];
        const x = (i + .42 + s.along * .22) * step, y = cloud * (.74 + s.size * .57);
        const tip = x - step * (.29 + s.lift * .65 + .14 * Math.sin(time * 4 + i));
        ctx.moveTo(x - step * .06, y * .91);
        ctx.bezierCurveTo(x + step * .04, y * .54, x - step * .11, y * .33, tip + step * .06, y * .065);
        ctx.moveTo(x, y * .57);
        ctx.quadraticCurveTo(x - step * .07, y * .54, x - step * .08, y * .42);
      }
      ctx.stroke();
      surfaceSpray(ctx, "bone", hazard.width, cloud * 1.42, time * 1.48, quiet, band * 21, active ? 1 : .44);
      ctx.restore();
    }
  }

  function fallingBone(ctx, hazard, active, progress, quiet) {
    const { x, y, width, height } = hazard;
    const canHit = active && progress > .36;
    ctx.save();
    for (const side of [-1, 1]) {
      const at = x + side * width;
      if (!canHit) ctx.setLineDash([6, 9]);
      ray(ctx, at, y - height, at, y + height, canHit ? "#dca77776" : "#ffce82b5", canHit ? 2 : 1.35);
    }
    ctx.setLineDash([]);
    if (active) {
      const drop = 1 - Math.min(1, progress / .45);
      const head = y - height * (.47 + drop ** 1.40 * 2.85);
      for (let i = -1; i <= 1; i++) {
        const size = height * (i ? 1.29 : 1.72);
        BossCreatureVfx.bone(ctx, x + i * width * .44, head - Math.abs(i) * height * .19,
          size, width * (i ? .39 : .77), Math.PI / 2 + i * .13, i + 1, i > 0);
      }
      if (canHit) {
        ctx.translate(x - width * .95, y);
        ctx.scale(1, -1);
        surfaceSpray(ctx, "bone", width * 1.9, height * 1.17, progress * 1.82, quiet, 13,
          .85 * (1 - Math.max(0, progress - .77) * 2.9));
      }
    }
    ctx.restore();
  }

  function jawBand(ctx, rect, side, progress, quiet, caster = null, active = true) {
    const depth = rect.height;
    const width = rect.width;
    if (!(width > 1 && depth > 1)) return;
    const lip = side < 0 ? rect.y + depth : rect.y;
    const mass = Math.min(depth * .93, width * .29, 170);
    const bend = quiet ? .65 : progress;
    const wound = side < 0 ? 13 : 27;
    const count = span(Math.floor(width / 69), 6, 17);
    const stride = width / count;
    const ridge = u => mass * (.19 + .20 * Math.sin(u * Math.PI) + .13 * u
      + .075 * Math.sin(u * 10.3 + wound + bend));
    ctx.save();
    ctx.translate(rect.x, lip);
    ctx.scale(1, side);
    const opacity = ctx.globalAlpha;
    if (active && caster) {
      const rootX = caster.x - caster.width * .31 - rect.x;
      const rootY = (caster.y - lip) * side + caster.height * .14;
      const hinge = ridge(.84);
      const connector = ctx.createLinearGradient(width * .71, hinge, rootX, rootY);
      connector.addColorStop(0, "#a6ba7ad3");
      connector.addColorStop(.31, "#718a5c8e");
      connector.addColorStop(.67, "#435a503f");
      connector.addColorStop(1, "#34463800");
      ctx.strokeStyle = connector;
      ctx.lineCap = "round";
      const run = rootX - width * .73;
      for (let i = 0; i < 5; i++) {
        const layer = (i - 2) * mass * .092;
        ctx.lineWidth = Math.max(.7, mass * (.019 + (i % 3) * .019));
        ctx.beginPath();
        ctx.moveTo(width * .73 + i * mass * .035, hinge + layer);
        ctx.bezierCurveTo(width * .84 + run * .24, hinge + layer * 2.8 - mass * .31,
          rootX - run * .27, rootY + layer * 2.1, rootX, rootY + layer * .34);
        ctx.stroke();
      }
    }

    const shell = ctx.createLinearGradient(0, 0, 0, mass);
    shell.addColorStop(0, "#c9dea99e");
    shell.addColorStop(.14, "#849e64");
    shell.addColorStop(.24, "#405645");
    shell.addColorStop(.35, "#1b2a25");
    shell.addColorStop(.53, "#3d543b");
    shell.addColorStop(.67, "#172b2a");
    shell.addColorStop(.95, "#47745700");
    ctx.globalAlpha = opacity * (active ? .57 : .24 + .15 * progress);
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.moveTo(0, ridge(0) * .44);
    ctx.bezierCurveTo(width * .05, -mass * .01, width * .10, mass * .016, width * .14, ridge(.14) * .29);
    for (let i = 0; i < count; i++) {
      const sample = debris[(i + wound) % debris.length];
      const a = .14 + .73 * i / count;
      const x = a * width;
      const edge = ridge(a) * (.26 + sample.size * .21);
      ctx.bezierCurveTo(x - stride * .13, edge * .56, x + stride * .055, mass * .018,
        x + stride * (.19 + sample.spin * .19), mass * (.020 + sample.phase * .072));
      ctx.quadraticCurveTo(x + stride * .32, edge, x + stride * .70, edge * (.89 + sample.lift * .22));
    }
    ctx.bezierCurveTo(width * .95, ridge(.99) * .36, width * 1.015, mass * .50, width, mass * .54);
    ctx.bezierCurveTo(width * .86, mass * .98, width * .69, mass * .82, width * .54, mass * .75);
    ctx.bezierCurveTo(width * .34, mass * .93, width * .10, mass * .38, 0, ridge(0) * .44);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (ready()) {
      // Only the grain from the original shell atlas is sampled here. The
      // edge and the overlapping surfaces are built and shaded in world space.
      ctx.globalCompositeOperation = "soft-light";
      ctx.globalAlpha *= .73;
      const tiles = quiet ? 4 : 8;
      for (let i = 0; i < tiles; i++) {
        const sample = debris[(i * 7 + wound) % debris.length];
        const u = i / tiles, tileWidth = width / tiles;
        ctx.drawImage(atlas, cellWidth * (2.32 + .12 * sample.spin), cellHeight * (.29 + .11 * sample.size),
          cellWidth * .29, cellHeight * .21, u * width - tileWidth * .18, ridge(u) * .11,
          tileWidth * 1.3, mass * .86);
      }
      ctx.globalAlpha = opacity * (active ? .57 : .24 + .15 * progress);
      ctx.globalCompositeOperation = "source-over";
    }
    const light = ctx.createLinearGradient(0, 0, width, 0);
    light.addColorStop(0, "#cdeeb65c");
    light.addColorStop(.30, "#cfe2aece");
    light.addColorStop(.64, "#7fba8c81");
    light.addColorStop(.91, "#5c7d4459");
    light.addColorStop(1, "#435b4600");
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath();
      for (let i = 0; i < count + 1; i++) {
        const sample = debris[(i + wound + layer * 11) % debris.length], u = (i + .63) / (count + 1);
        const x = u * width, h = ridge(u);
        const f = .72 + sample.lift * .79;
        ctx.moveTo(x, h * (.37 + .21 * layer));
        ctx.bezierCurveTo(x + stride * (.067 - layer * .14), h * .87,
          x - stride * .44, h * f, x - stride * .24, h * (1.62 + sample.size * .26));
        ctx.moveTo(x - stride * .19, h * f);
        ctx.lineTo(x + stride * .13, h * (1.48 + sample.spin * .48));
      }
      ctx.strokeStyle = layer === 0 ? light : layer === 1 ? "#0b231cb6" : "#b7d38a58";
      ctx.lineWidth = Math.max(.75, mass * (layer === 1 ? .037 : layer === 2 ? .008 : .012));
      ctx.stroke();
    }
    ctx.restore();
    // These overlapping curved pieces retain their native silhouette while
    // pivoting individually. The contact edge is the shaded shell behind them.
    const elbows = quiet ? 3 : Math.max(2, Math.min(5, Math.floor(width / Math.max(90, mass * 1.73))));
    for (let i = 0; i < elbows; i++) {
      const s = debris[(i * 5 + wound) % debris.length];
      const u = (i + .40 + .38 * s.lift) / elbows;
      const weight = .42 + .48 * Math.sin(Math.PI * u) + .14 * s.size;
      const x = u * width, y = ridge(u) * (.94 + .27 * s.along);
      const angle = (s.spin - .63) * .42 + .16 * Math.sin(bend * 5.6 + i * 1.8);
      const limbWidth = Math.min(width / elbows * 2.07, mass * (3.12 + .95 * s.phase)) * weight;
      const limbHeight = mass * (.91 + s.size * .34) * weight;
      ctx.globalAlpha = opacity * (active ? .94 : .31 + .18 * progress);
      BossSpellMatter.draw(ctx, "claw", x, y, limbWidth, limbHeight, angle, true, i % 3 === 0);
    }
    ctx.globalAlpha = opacity * (active ? 1 : .48);
    if (active) {
      const glow = pressureArtGlow("#a8e88f");
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 4; i++) {
        const u = (i + .57) * .22, r = mass * (.34 + .16 * debris[i].size);
        ctx.globalAlpha = opacity * (.54 - .18 * Math.cos(8 * bend + i * 1.8));
        ctx.drawImage(glow, width * u - r, ridge(u) * .42 - r, r * 2, r * 2);
      }
      ctx.globalAlpha = opacity;
    }
    surfaceSpray(ctx, "chitin", width, mass * .98, bend * 1.57, quiet, wound, active ? .96 : .46);
    if (active && !quiet) {
      ctx.save();
      ctx.scale(1, -1);
      surfaceSpray(ctx, "chitin", width, mass * .44, bend * 2.31, quiet, wound + 9, .59);
      ctx.restore();
    }
    ctx.restore();
  }

  function pincerLock(ctx, hazard, active, progress, quiet) {
    const gap = active ? pincerGap(hazard, progress) : hazard.gap;
    const half = active && hazard.shock && progress > .78 ? hazard.width * 1.7 : hazard.width;
    for (const side of [-1, 1]) {
      const lip = hazard.y + gap * side;
      const left = hazard.x - half;
      const top = side < 0 ? 0 : lip;
      const height = side < 0 ? lip : viewport.height - lip;
      jawBand(ctx, { x: left, y: top, width: half * 2, height }, side,
        active ? progress : span(hazard.age / hazard.warning, 0, 1), quiet, boss, active);
    }
  }

  function loom(ctx, hazard, active, progress, quiet) {
    for (const [index, [a, b]] of liveLoomLinks(hazard).entries()) {
      const one = hazard.nodes[a], two = hazard.nodes[b];
      thread(ctx, { x1: one.x, y1: one.y, x2: two.x, y2: two.y,
        width: hazard.thickness * 1.88 }, active, progress, quiet, index);
    }
    for (const [i, node] of hazard.nodes.entries()) silkNode(ctx, node, progress, active, quiet, i);
  }

  function mechanic(ctx, hazard, { active, progress, quiet }) {
    switch (hazard.kind) {
      case "ribCage": cageRibs(ctx, hazard, active, progress, quiet); return true;
      case "bonefall": fallingBone(ctx, hazard, active, progress, quiet); return true;
      case "loom":
        if (!ready()) return false;
        loom(ctx, hazard, active, progress, quiet);
        return true;
      case "pincerLock": pincerLock(ctx, hazard, active, progress, quiet); return true;
      default: return false;
    }
  }

  function field(ctx, hazard, kind, active, progress, quiet) {
    const { x, y, radius } = hazard;
    const silk = kind === "silk";
    const steps = quiet || visualQuality.id === "low" ? 7 : 11;
    const core = silk ? radius * .48 : alienVortexCore(hazard, progress);
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.clip();
    const color = palettes[kind];
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, color.deep + "70");
    gradient.addColorStop(.48, color.deep + "45");
    gradient.addColorStop(1, color.deep + "00");
    ctx.globalAlpha *= active ? .88 : .51;
    ctx.fillStyle = gradient; ctx.fillRect(-radius, -radius, 2 * radius, 2 * radius);
    const center = { x: 0, y: 0, radius: core * .73, health: 1 };
    if (silk) silkNode(ctx, center, progress, active, quiet, 0);
    for (let i = 0; i < steps; i++) {
      const angle = (i + .32) * TAU / steps + (quiet ? 0 : progress * .22);
      const radial = radius * (.79 + .18 * random(i + 12) * Math.sin(Math.PI * progress));
      const point = { x: Math.cos(angle) * radial, y: Math.sin(angle) * radial };
      if (silk) thread(ctx, { x1: 0, y1: 0, x2: point.x, y2: point.y,
        width: radius * .037 }, active, progress, quiet, i);
      else if (active) {
        const centerline = core + (radial - core) * .49;
        stamp(ctx, 2, i, Math.cos(angle) * centerline, Math.sin(angle) * centerline,
          radial - core, radius * .15, angle + .23, i % 2);
        stamp(ctx, 2, i + 1, Math.cos(angle) * core, Math.sin(angle) * core,
          radius * .44, radius * .24, angle + 1.12, true);
      }
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = color.edge;
    ctx.lineWidth = active ? 1.45 : 1.2;
    ctx.globalAlpha *= active ? .57 : .70;
    if (!active || hazard.kind === "bind") ctx.setLineDash([6, 10]);
    ctx.beginPath(); ctx.arc(x, y, radius - 1, 0, TAU); ctx.stroke();
    if (!silk) {
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(x, y, core, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function signature(ctx, hazard, { active, progress, quiet }) {
    const kind = hazard.material || (hazard.kind === "seam" ? "chitin" : hazard.kind === "bind" ? "silk" : "");
    if (!palettes[kind] || kind === "silk" && !ready()) return false;
    if (hazard.kind === "filament") {
      if (!active && hazard.swingY) return false;
      const segment = { ...alienFilamentPose(hazard, progress), width: hazard.thickness };
      const painter = kind === "bone" ? needlePath : kind === "silk" ? thread : chitinPath;
      painter(ctx, segment, active, progress, quiet, 0);
      return true;
    }
    if ((kind === "silk" && (hazard.kind === "bind" || hazard.kind === "zone"))
        || (kind === "chitin" && hazard.kind === "vortex")) {
      field(ctx, hazard, kind, active, progress, quiet);
      return true;
    }
    if (active && hazard.kind === "ring") {
      const radius = alienRingRadius(hazard, progress);
      annulus(ctx, kind, { x: hazard.x, y: hazard.y, radius: radius + hazard.thickness * .50,
        innerRadius: radius - hazard.thickness * .50 }, progress, quiet, .94);
      return true;
    }
    if (active && hazard.kind === "seam" && kind === "chitin") {
      chitinPath(ctx, { x1: hazard.x, y1: 0, x2: hazard.x, y2: viewport.height,
        width: hazard.thickness }, active, progress, quiet, 0);
      return true;
    }
    return false;
  }

  function ultimate(ctx, hazard, geometry, target, { active, quiet, alpha }) {
    const type = hazard.ultimateKind;
    if (type !== "boneNova" && type !== "silkCage" && type !== "pincer") return false;
    if (type === "silkCage" && !ready()) return false;
    const phase = geometry.progress;
    ctx.save(); ctx.globalAlpha *= alpha;
    if (type === "boneNova") {
      for (const [i, path] of geometry.segments.entries()) needlePath(ctx, path, active, phase, quiet, i);
      if (active) {
        for (const ring of geometry.circles) annulus(ctx, "bone", ring, phase, quiet, 1);
        const root = geometry.segments[0];
        if (root) dust(ctx, "bone", root.x1, root.y1, target.height * .72, phase * 1.7, quiet, 20, 19);
      }
    } else if (type === "silkCage") {
      for (const [i, path] of geometry.segments.entries()) thread(ctx,
        { ...path, width: path.width * 1.63 }, active, phase, quiet, i);

    } else {
      for (const rect of geometry.rects) {
        const side = rect.y < hazard.gapY ? -1 : 1;
        if (active) {
          const inner = side < 0 ? rect.y + rect.height : rect.y;
          const lane = hazard.gapY + side * hazard.gapSize * .5;
          const lip = hazard.noShield ? (side < 0 ? Math.min(lane, inner) : Math.max(lane, inner)) : inner;
          const y = side < 0 ? rect.y : lip;
          const bottom = side < 0 ? lip : rect.y + rect.height;
          jawBand(ctx, { ...rect, y, height: bottom - y }, side, phase, quiet, target);
        } else {
          jawBand(ctx, rect, side, span(hazard.age / hazard.warning, 0, 1), quiet, target, false);
        }
      }
      for (const [i, path] of geometry.segments.entries()) chitinPath(ctx, path, active, phase, quiet, i);
    }
    ctx.restore();
    return true;
  }

  function charge(ctx, target, scene, { x, y, radius, charge: load, time, quiet }) {
    if (!ready()) return false;
    const type = scene.ultimateKind;
    if (type !== "boneNova" && type !== "silkCage" && type !== "pincer") return false;
    const opacity = .24 + .60 * load;
    ctx.save(); ctx.globalAlpha *= opacity;
    if (type === "boneNova") {
      const r = radius * (1.05 - load * .27);
      for (let i = 0; i < 8; i++) {
        const a = (i + .17) * TAU / 8 + (quiet ? .21 : time * .29);
        const spread = r * (.76 + random(i + 31) * .22);
        const px=x+Math.cos(a)*spread, py=y+Math.sin(a)*spread*.81;
        if (!BossSpellMatter.draw(ctx,"rib",px,py,radius*.90,radius*.47,a+.49,i%2!==0))
          stamp(ctx,0,i,px,py,radius*.70,radius*.21,a+.83,i%2);
      }
      dust(ctx, "bone", x, y, radius, load, quiet, 14, 86);
    } else if (type === "silkCage") {
      const nodes = [];
      for (let i = 0; i < 6; i++) {
        const a = TAU * (i / 6 + (quiet ? 0 : time * .07));
        const r = radius * (.89 - load * .23) * (.82 + random(i + 8) * .18);
        nodes.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * .9, health: 1, radius: radius * .115 });
      }
      for (const [i, node] of nodes.entries()) {
        const tip = nodes[(i + 2) % nodes.length];
        thread(ctx, { x1: node.x, y1: node.y, x2: tip.x, y2: tip.y, width: radius * .047 },
          false, load, quiet, i);
        silkNode(ctx, node, load, true, quiet, i);
      }
    } else {
      for (const side of [-1, 1]) {
        const lever = side * (1.01 - load * .43);
        if (!BossSpellMatter.draw(ctx,"claw",x-radius*.35,y+radius*lever,
          radius*1.88,radius*.88,side*(.45-load*.32),true,side>0))
          stamp(ctx,2,side<0?0:1,x-radius*.35,y+radius*lever,radius*1.75,radius*.78,0,side<0);
      }
      dust(ctx, "chitin", x, y, radius * .79, load, quiet, 15, 143);
    }
    ctx.restore();
    return true;
  }

  function aftershock(ctx, scene, { x, y, width, height, age, quiet }) {
    if (!ready()) return false;
    const type = scene.ultimateKind;
    if (type !== "boneNova" && type !== "silkCage" && type !== "pincer") return false;
    const progress = span(age / .7, 0, 1), decay = (1 - progress) ** 1.92;
    const count = quiet || visualQuality.id === "low" ? 8 : 16;
    const front = x - width * .92 * (1 - (1 - progress) ** 2.8);
    const col = type === "boneNova" ? 0 : type === "silkCage" ? 1 : 2;
    ctx.save(); ctx.globalAlpha *= decay * .78;
    for (let i = 0; i < count; i++) {
      const px = front + (random(i + 21) - .31) * height * .26;
      const py = y + (i + .18) * height / count - height * .5;
      const size = height * (.062 + random(i + 33) * .12);
      if (col === 1) thread(ctx, { x1: px + size, y1: py - size * .30, x2: px - size, y2: py + size * .14,
        width: size * .065 }, true, progress, quiet, i);
      stamp(ctx, col, i, px, py, size, size * (col === 1 ? .59 : .36),
        -Math.PI * (.89 + random(i + 11) * .38) + (quiet ? 0 : progress * 1.2), i % 2);
    }
    ctx.restore();
    return true;
  }

  function ultimateNodes(ctx,hazard,geometry,quiet) {
    if (hazard.ultimateKind !== "silkCage" || !ready()) return false;
    for (const [i,node] of geometry.nodes.entries()) {
      silkNode(ctx,node,geometry.progress,hazard.age>=hazard.warning,quiet,i);
      if(node.health>0 && node.health<node.maxHealth) {
        ctx.save(); ctx.strokeStyle="#eed0ff";ctx.lineWidth=1.6;ctx.beginPath();
        ctx.arc(node.x,node.y,node.radius*1.22,-Math.PI*.5,-Math.PI*.5+TAU*node.health/node.maxHealth);
        ctx.stroke();ctx.restore();
      }
    }
    return true;
  }
  return Object.freeze({ mechanic, signature, ultimate, ultimateNodes, charge, aftershock, jawBand, needlePath });
})();
