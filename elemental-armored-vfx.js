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

  function needlePath(ctx, segment, active, progress, quiet, seed) {
    const { x1, y1, x2, y2, width } = segment;
    const l = Math.hypot(x2 - x1, y2 - y1);
    if (l < 1) return;
    if (!active) {
      tell(ctx, segment, palettes.bone.edge);
      return;
    }
    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(Math.atan2(y2-y1, x2-x1));
    // The intact rib throws a narrow marrow trail. Its polished tooth turns
    // into the travel direction while tiny splinters keep the ray readable.
    const motion = quiet ? .38 : progress;
    const wake = ctx.createLinearGradient(0, 0, l, 0);
    wake.addColorStop(0, "#fff0cbab"); wake.addColorStop(.43,"#c69a698c"); wake.addColorStop(1,"#cbad7700");
    ctx.strokeStyle = wake; ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1, width * .25);
    ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo(l*.34,width*.10,l,0); ctx.stroke();
    for (let i=0;i<7;i++) {
      const t=fractional(motion*(.86+i*.025)+i/7+seed*.074);
      const size=Math.min(l*.16,width*(2.8+random(i+seed)*2.6));
      stamp(ctx,0,i,l*t,(random(i+seed*3)-.5)*width*.45,size,size*.33,
        .1*Math.sin(i*2.2+motion*11),i%2);
    }
    const travel=fractional(.16+seed*.093+motion*1.21);
    const size=Math.min(l*.24,width*(7.3+random(seed)*2.5));
    BossSpellMatter.draw(ctx,"rib",l*travel,-width*.32,size,size*.49,
      -.45+.21*Math.sin(seed*1.5+motion*8),false,seed%2===1);
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
    BossSpellMatter.draw(ctx,"claw",pulse*length,ridge(pulse),Math.min(length*.21,width*10),width*2.6,-.04);
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
      // The crown fractures across its circumference. Its emerging fragments
      // extend beyond the damage front, leaving the dark space between visible.
      const turns = 9, spin = quiet ? 0 : progress * .36;
      const shade = ctx.createRadialGradient(0, 0, inner, 0, 0, radius);
      shade.addColorStop(0, "#b8763900");shade.addColorStop(.43, "#ebc39562");
      shade.addColorStop(.72, "#ffedc99c");shade.addColorStop(1, "#a2602c00");
      ctx.strokeStyle = shade;ctx.lineWidth = width;
      for (let i = 0; i < turns; i++) {
        const angle = i*TAU/turns + spin, extent = TAU/turns*(.55+.28*random(13+i));
        ctx.beginPath();ctx.arc(0,0,center,angle,angle+extent);ctx.stroke();
        const at = angle+extent*.67, span=Math.min(center*.5,width*(2.3+random(i+77)));
        BossSpellMatter.draw(ctx,"rib",Math.cos(at)*center,Math.sin(at)*center,
          span,width*(1.05+random(i+9)*.55),at+Math.PI*.47,i%3===0);
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
      const line = { x1: left, y1: y, x2: left + hazard.width, y2: y };
      if (!active) {
        tell(ctx, line, palettes.bone.core);
        continue;
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(left, side < 0 ? y - step * 1.56 : y - hazard.thickness * .36,
        hazard.width, step * 1.56 + hazard.thickness * .36); ctx.clip();
      ray(ctx, line.x1, y, line.x2, y, "#e7b279ba", Math.max(2, hazard.thickness * .24));
      for (let i = 0; i < count; i++) {
        const x = left + (i + .49) * step;
        const length = step * (.97 + random(i + band * 31) * .44);
        stamp(ctx, 0, i, x, y + side * length * .42, length * 1.49,
          length * .97, -side * (.94 + random(i + 9) * .29), side > 0);
      }
      dust(ctx, "bone", hazard.x, y, hazard.width * .19, progress * 1.6, quiet, 9);
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
        stamp(ctx, 0, i + 1, x + i * width * .44, head - Math.abs(i) * height * .19,
          size, width * (i ? .80 : 1.2), Math.PI / 2 + i * .13, i > 0);
      }
      if (canHit) dust(ctx, "bone", x, y, width * 1.30, progress * 1.39, quiet, 17, 13);
    }
    ctx.restore();
  }

  function jawBand(ctx, rect, side, progress, quiet, caster = null) {
    const depth = rect.height;
    const width = rect.width;
    if (!(width > 1 && depth > 1)) return;
    const lip = side < 0 ? rect.y + depth : rect.y;
    const bend = (quiet ? 0 : Math.sin(progress * Math.PI) * .10);
    const mass = Math.min(Math.max(depth*.94, width*.18), width*(.38+bend*.23));
    // The hinge sits on the boss side. Crushing rotates the entire shell,
    // and both tooth rows face into the same physical escape corridor.
    const bite=quiet ? .88 : .5-.5*Math.cos(Math.min(1,progress*2.4)*Math.PI);
    const bodyY=lip+side*mass*(.54+.06*(1-bite));
    if(caster) {
      const hingeX=rect.x+width*.93,rootX=caster.x-caster.width*.26;
      const rootY=caster.y+side*caster.height*.15,reach=rootX-hingeX;
      ctx.save();
      const tendon=ctx.createLinearGradient(hingeX,bodyY,rootX,rootY);
      tendon.addColorStop(0,"#57482e");tendon.addColorStop(.23,"#405135e3");
      tendon.addColorStop(.79,"#878459b3");tendon.addColorStop(1,"#31433652");
      ctx.fillStyle=tendon;ctx.beginPath();ctx.moveTo(hingeX,bodyY-mass*.15);
      ctx.bezierCurveTo(hingeX+reach*.29,bodyY-mass*.14,rootX-reach*.28,rootY-mass*.09,rootX,rootY);
      ctx.bezierCurveTo(rootX-reach*.31,rootY+mass*.07,hingeX+reach*.31,bodyY+mass*.19,hingeX,bodyY+mass*.15);
      ctx.closePath();ctx.fill();
      ctx.globalAlpha*=.61;ctx.lineWidth=Math.max(1,mass*.016);ctx.strokeStyle="#b9ce8d";
      for(let j=0;j<3;j++){const d=(j-1)*mass*.06;ctx.beginPath();
        ctx.moveTo(hingeX,bodyY+d);ctx.bezierCurveTo(hingeX+reach*.31,bodyY+d*1.7,
          rootX-reach*.18,rootY+d,rootX,rootY);ctx.stroke();}
      ctx.restore();
    }
    if (BossSpellMatter.draw(ctx,"claw",rect.x+width*.50,bodyY,width,mass,
      side*.045*(1-bite),true,side>0)) {
      dust(ctx,"chitin",rect.x+width*.12,lip+side*mass*.38,mass*.34,
        progress*2.5,quiet,12,side>0 ? 32 : 61);
      return;
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(rect.x, rect.y, width, depth); ctx.clip();
    ctx.globalAlpha *= .93;
    // The cropped contour faces the safe opening. Plates overlap outwards,
    // while the inner toothline stops exactly at the mechanical lip.
    ctx.translate(rect.x, lip);
    if (side < 0) ctx.scale(1, -1);
    const count = span(Math.floor(width / 67), 3, 13);
    const step = width / count;
    const ridge = Math.min(depth * .65, step * 1.66);
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const profile = .73 + .31 * Math.sin((1 - t) * Math.PI * .81) + random(i + 39) * .21;
      const height = Math.max(depth * .15, ridge * profile);
      const cap = i === 0 || i === count - 1 ? .68 : 1;
      stamp(ctx, 2, i, step * (i + .52), height * .77, step * 2.08 * cap, height * 1.56,
        -.12 - .24 * Math.sin(t * Math.PI) + bend, false);
      stamp(ctx, 2, i + 1, step * (i + .64), height * (.35 + .19 * random(i)), step * 1.56 * cap,
        height * .89, -.88 - .21 * random(i + 8), true);
    }
    const tintedEdge = ctx.createLinearGradient(0, 0, width, 0);
    tintedEdge.addColorStop(0, "#eaffb100");
    tintedEdge.addColorStop(.1, "#d5f5abbd");
    tintedEdge.addColorStop(.66, "#93c97ea0");
    tintedEdge.addColorStop(1, "#58845506");
    ray(ctx, 0, 1, width, 1, tintedEdge, Math.max(1.2, step * .031));
    ctx.restore();
  }

  function pincerLock(ctx, hazard, active, progress, quiet) {
    const gap = active ? pincerGap(hazard, progress) : hazard.gap;
    const half = active && hazard.shock && progress > .78 ? hazard.width * 1.7 : hazard.width;
    for (const side of [-1, 1]) {
      const lip = hazard.y + gap * side;
      const left = hazard.x - half;
      if (active) {
        const top = Math.min(lip, side < 0 ? 0 : viewport.height);
        const height = side < 0 ? lip : viewport.height - lip;
        jawBand(ctx, { x: left, y: top, width: half * 2, height }, side, progress, quiet);
      } else {
        tell(ctx, { x1: left, y1: lip, x2: left + half * 2, y2: lip }, palettes.chitin.core);
      }
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
    if (!ready()) return false;
    switch (hazard.kind) {
      case "ribCage": cageRibs(ctx, hazard, active, progress, quiet); return true;
      case "bonefall": fallingBone(ctx, hazard, active, progress, quiet); return true;
      case "loom": loom(ctx, hazard, active, progress, quiet); return true;
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
    if (!ready() || !palettes[kind]) return false;
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
    if (!ready()) return false;
    const type = hazard.ultimateKind;
    if (type !== "boneNova" && type !== "silkCage" && type !== "pincer") return false;
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
          const y = side < 0 ? rect.y + rect.height : rect.y;
          tell(ctx, { x1: rect.x, y1: y, x2: rect.x + rect.width, y2: y }, palettes.chitin.core);
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
  return Object.freeze({ mechanic, signature, ultimate, ultimateNodes, charge, aftershock });
})();
