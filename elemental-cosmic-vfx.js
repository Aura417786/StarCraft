"use strict";

const ElementalCosmicVfx = (() => {
  const pi = Math.PI;
  const tau = pi * 2;
  const optics = ["#5572f0", "#74deff", "#eefaff", "#e8a6ff", "#edbbd7"];
  const relayColor = ["#51194d", "#ac345e", "#ff78ba", "#ffe0ed"];

  function fraction(n) { return n - Math.floor(n); }
  function ease(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }

  function circle(ctx, x, y, r, color, thickness, alpha) {
    if (r <= 0 || alpha <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, tau);
    ctx.stroke();
  }

  function lens(ctx, x, y, rx, ry, angle, ink, alpha) {
    if (rx < .5 || ry < .5 || alpha <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, angle, -.85, 2.02);
    ctx.stroke();
  }

  function glint(ctx, x, y, radius, color, power) {
    if (radius <= 0 || power <= 0) return;
    const halo = ctx.createRadialGradient(x, y, 0, x, y, radius);
    halo.addColorStop(0, color);
    halo.addColorStop(.19, color + "84");
    halo.addColorStop(.54, color + "2b");
    halo.addColorStop(1, color + "00");
    ctx.globalAlpha = power;
    ctx.fillStyle = halo;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function polygon(ctx, corners, gradient, strength) {
    ctx.globalAlpha = strength;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    for (const [i, point] of corners.entries()) {
      if (i) ctx.lineTo(...point);
      else ctx.moveTo(...point);
    }
    ctx.closePath();
    ctx.fill();
  }

  function prism(ctx, x, y, radius, angle, time, energy) {
    if (radius < 1 || energy <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(radius, radius);
    const outline = [[-.72, -.12], [-.25, -.96], [.47, -.68], [.84, .26], [.28, .9], [-.45, .57]];
    const facetColors = ["#0a1e50", "#245e8d", "#73ccff", "#67478b", "#192e68", "#4584b9"];
    const core = [.12, -.09];
    for (let i = 0; i < outline.length; i++) {
      const first = outline[i], second = outline[(i + 1) % outline.length];
      const depth = ctx.createLinearGradient(...first, ...core);
      depth.addColorStop(0, optics[(i + 1) % optics.length]);
      depth.addColorStop(.16, facetColors[i]);
      depth.addColorStop(.73, facetColors[(i + 4) % facetColors.length]);
      depth.addColorStop(1, optics[0]);
      polygon(ctx, [first, second, core], depth, (.78 + .2 * Math.cos(i * 1.4 - time * 4)) * energy);
    }
    ctx.lineWidth = .78 / radius;
    ctx.strokeStyle = "#c7f1ff";
    ctx.globalAlpha = energy * .64;
    ctx.beginPath();
    ctx.moveTo(...core);
    ctx.lineTo(...outline[0]);
    for (const point of outline.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
    ctx.stroke();
    glint(ctx, .1, -.12, .67, "#c4e9ff", .42 * energy);
    ctx.restore();
  }

  function prismShield(ctx, hazard, active, time, progress) {
    const { x, y, height } = hazard;
    const width = Math.max(9, height * .26);
    ctx.translate(x, y);
    ctx.scale(width, height);
    const planes = [
      [[0, -1], [.72, -.68], [.20, -.28], [-.49, -.47]],
      [[-.49, -.47], [.20, -.28], [.87, .14], [.26, .37], [-.81, .18]],
      [[-.81, .18], [.26, .37], [.63, .60], [-.16, 1], [-.53, .58]],
      [[.20, -.28], [.72, -.68], [1, .10], [.87, .14]],
      [[.26, .37], [.87, .14], [1, .10], [.63, .60]],
    ];
    for (const [index, plane] of planes.entries()) {
      const brightness = .62 + .22 * Math.cos(time * 8 - index * 1.38);
      const tone = ctx.createLinearGradient(-.75, .64, .85, -.60);
      tone.addColorStop(0, "#171941e0");
      tone.addColorStop(.48, optics[index] + "a0");
      tone.addColorStop(1, "#e4f8ff");
      polygon(ctx, plane, tone, (active ? brightness : .35) * (.7 + .30 * progress));
    }
    ctx.strokeStyle = "#9feaff";
    ctx.lineWidth = .062;
    ctx.globalAlpha = active ? .86 : .44;
    ctx.beginPath();
    ctx.moveTo(0, -1); ctx.lineTo(.72, -.68); ctx.lineTo(1, .10);
    ctx.lineTo(.63, .60); ctx.lineTo(-.16, 1); ctx.lineTo(-.53, .58);
    ctx.lineTo(-.81, .18); ctx.lineTo(-.49, -.47); ctx.closePath(); ctx.stroke();
    const scan = time ? Math.sin(time * 7) * .52 : 0;
    ctx.globalAlpha = active ? .67 : .27;
    ctx.lineWidth = .02;
    ctx.strokeStyle = "#e1fcff";
    ctx.beginPath(); ctx.moveTo(-.42, scan + .04); ctx.lineTo(.82, scan - .03); ctx.stroke();
  }

  function hologram(ctx, node, time, opacity) {
    const r = node.radius;
    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.scale(r, r);
    const vane = new Path2D();
    vane.moveTo(-1.43, .03);
    vane.lineTo(-.85, -.33); vane.quadraticCurveTo(-.38, -.64, -.52, -1.24);
    vane.quadraticCurveTo(.28, -.81, .49, -.30);
    vane.lineTo(1.57, -.16); vane.lineTo(2, -.35); vane.lineTo(1.73, .04);
    vane.lineTo(.46, .22); vane.quadraticCurveTo(-.02, .54, -.51, 1.15);
    vane.quadraticCurveTo(-.51, .68, -.94, .46); vane.closePath();
    ctx.globalAlpha = opacity;
    const foil = ctx.createLinearGradient(-.21, -1.1, .2, 1.3);
    foil.addColorStop(0, "#a7eaffc2"); foil.addColorStop(.22, "#476af280");
    foil.addColorStop(.49, "#1432579e"); foil.addColorStop(.74, "#72b6e27b"); foil.addColorStop(1, "#efadffaf");
    ctx.fillStyle = foil;
    ctx.fill(vane);
    ctx.strokeStyle = "#b7f6ff"; ctx.lineWidth = .036;
    ctx.stroke(vane);
    ctx.clip(vane);
    ctx.beginPath(); ctx.moveTo(-1.2, .07); ctx.lineTo(.74, -.04); ctx.lineTo(1.75, -.11); ctx.stroke();
    ctx.lineWidth = .024;
    ctx.globalAlpha = .48 * opacity;
    ctx.beginPath();
    for (let i = -8; i <= 8; i++) {
      const y = i * .162 + time * .27 % .162;
      ctx.moveTo(-1.51, y); ctx.lineTo(1.98, y - .043);
    }
    ctx.stroke();
    const pass = fraction(time * .63) * 2.35 - 1.15;
    ctx.strokeStyle = "#c8faff"; ctx.lineWidth = .11; ctx.globalAlpha = .65 * opacity;
    ctx.beginPath(); ctx.moveTo(-1.5, pass); ctx.lineTo(1.98, pass - .15); ctx.stroke();
    ctx.restore();
  }

  function withRay(ctx, line, paint) {
    const dx = line.x2 - line.x1, dy = line.y2 - line.y1, length = Math.hypot(dx, dy);
    if (length < 1 || line.width <= 0) return;
    const half = line.width * .5;
    ctx.save();
    ctx.translate(line.x1, line.y1);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.beginPath();
    ctx.roundRect(0, -half, length, half * 2, Math.min(half, length * .12));
    ctx.clip();
    paint(length, half);
    ctx.restore();
  }

  function lightRay(ctx, line, time, strength, quiet) {
    withRay(ctx, line, (length, half) => {
      const refraction = ctx.createLinearGradient(0, -half, 0, half);
      for (const [offset, color] of [[0, "#8951e000"], [.12, "#526cf586"], [.30, "#60bfffde"],
        [.45, "#d9f6ff"], [.55, "#afd8ff"], [.70, "#7f65f7ba"], [.87, "#ee90d26e"], [1, "#eaa0d300"]]) {
        refraction.addColorStop(offset, color);
      }
      ctx.fillStyle = refraction;
      ctx.globalAlpha = strength;
      // Spectral sheets meet at the facet. The two refracted edges diverge
      // through the glass, then reunite at the next optical node.
      const swell=quiet ? .71 : .64+.28*Math.sin(time*3.8+line.x1*.015);
      ctx.beginPath();ctx.moveTo(0,0);
      ctx.bezierCurveTo(length*.09,-half*.11,length*.26,-half*swell,length*.55,-half*.48);
      ctx.quadraticCurveTo(length*.82,-half*.17,length,0);
      ctx.bezierCurveTo(length*.81,half*.21,length*.60,half*.94,length*.37,half*.48);
      ctx.quadraticCurveTo(length*.16,half*.14,0,0);ctx.fill();
      ctx.lineWidth=Math.max(.75,half*.14);ctx.strokeStyle="#edfbff";ctx.beginPath();
      ctx.moveTo(0,0);ctx.quadraticCurveTo(length*.46,-half*.29,length,0);ctx.stroke();
      const count = quiet ? 4 : 12;
      for (let i = 0; i < count; i++) {
        const q = fraction(i * .618 - time * (.60 + i % 3 * .14));
        const split = (i % 5 - 2) * half * .27;
        const start = q * length;
        const size = length * (.065 + .06 * fraction(i * .721));
        polygon(ctx, [[start, split], [start + size * .76, split - half * .21],
          [start + size, split + half * .05], [start + size * .19, split + half * .17]],
        optics[i % 5], strength * Math.sin(pi * q) * .8);
      }
    });
  }

  function nerveRay(ctx, line, time, strength, quiet, phase = 0) {
    withRay(ctx, line, (length, half) => {
      const myelin = ctx.createLinearGradient(0, -half, 0, half);
      myelin.addColorStop(0, "#6e285800");
      myelin.addColorStop(.21, "#9926658e");
      myelin.addColorStop(.42, "#4f1b37");
      myelin.addColorStop(.53, "#93305f");
      myelin.addColorStop(.68, "#4f193a");
      myelin.addColorStop(.89, "#d3488a87");
      myelin.addColorStop(1, "#7f235600");
      ctx.fillStyle = myelin;
      ctx.globalAlpha = strength;
      const pathY = f => half*.33*Math.sin(pi*f)*Math.sin(7*f+phase*2.1-time*2.4);
      // The myelin sheath swells around ganglia; the bioelectric pulse runs
      // inside that same curved membrane rather than down a parallel rail.
      ctx.beginPath();ctx.moveTo(0,0);
      for(let i=0;i<=24;i++){
        const f=i/24, r=half*Math.sin(pi*f)**.44*(.29+.44*Math.sin(f*14-phase+time*.88)**4);
        ctx.lineTo(f*length,pathY(f)-r);
      }
      for(let i=24;i>=0;i--){
        const f=i/24, r=half*Math.sin(pi*f)**.44*(.37+.49*Math.sin(f*14-phase+time*.88)**4);
        ctx.lineTo(f*length,pathY(f)+r);
      }
      ctx.fill();
      const count = quiet ? 7 : 18;
      for (let i = 0; i < count; i++) {
        const f = i / count;
        const n = (i + phase * 5) * .231;
        const spark = (1 + Math.sin((f * 3 - time * 1.6 + phase) * tau)) ** 3 / 8;
        const x = f * length, reach = Math.min(length * .057, half * (2.4 + Math.sin(n * 9)));
        const s = i % 2 ? -1 : 1;
        ctx.globalAlpha = strength * (.24 + .76 * spark);
        ctx.lineWidth = 1.05;
        ctx.strokeStyle = relayColor[i % 3 + 1];
        ctx.beginPath();
        const stem=pathY(f);
        ctx.moveTo(x, stem);
        ctx.quadraticCurveTo(x + reach * .55, stem+s * half * .32, x + reach, stem+s * half * .86);
        ctx.moveTo(x + reach * .55, s * half * .34);
        ctx.lineTo(x + reach * .14, s * half * .68);
        ctx.stroke();
      }
      ctx.globalAlpha = strength;
      ctx.strokeStyle = "#fca3c7";
      ctx.lineWidth = Math.min(2.3, half * .35);
      ctx.beginPath();ctx.moveTo(0,0);
      for(let i=1;i<=18;i++)ctx.lineTo(length*i/18,pathY(i/18));
      ctx.stroke();
      const pulse = fraction(-time * .71 + phase);
      const wave = ctx.createLinearGradient((pulse - .095) * length, 0, (pulse + .035) * length, 0);
      wave.addColorStop(0, "#ffb1d100");
      wave.addColorStop(.82, "#ffe3f4e0");
      wave.addColorStop(1, "#fff7fb00");
      ctx.fillStyle = wave;ctx.beginPath();
      ctx.ellipse(pulse*length,pathY(pulse),length*.075,Math.max(.6,half*.34),0,0,tau);ctx.fill();
    });
  }

  function tearRay(ctx, line, time, strength, quiet) {
    withRay(ctx, line, (length, half) => {
      // A single repeating material pass carries vitreous folds along the shear.
      if (!NextgenVfx.drawShear(ctx,length,half,quiet ? 0 : time,strength)) {
        NextgenVfx.drawRift(ctx,{x1:0,y1:0,x2:length,y2:0,width:half*2},signatureMaterials.void,time,strength);
      }
      const beats = quiet ? 8 : 24;
      for (let i = 0; i < beats; i++) {
        const p = fraction((i + 1) * .754877 + time * (.11 + i % 3 * .057));
        const x = p * length;
        const y = (i % 2 ? -1 : 1) * half * (.39 + .46 * fraction(i * .38));
        const a = (.29 + .62 * fraction(i * .68)) * strength * Math.sin(pi * p);
        polygon(ctx, [[x, y], [x + half * 3, y * .72], [x + half * .5, y * .87]],
          i % 3 === 0 ? "#d2b3ff" : "#8762d8", a);
      }
    });
  }

  function gravityHalo(ctx, x, y, r, time, alpha, quiet) {
    if (r <= 1 || alpha <= 0) return;
    NextgenVfx.drawHorizon(ctx,x,y,2.22*r,time,alpha,quiet);
  }

  function neuron(ctx, node, time, live, opacity, quiet) {
    const { x, y, radius } = node;
    ctx.save();
    const pulse = Math.sin(time * 7.2) * .13 + .87;
    const shell = ctx.createRadialGradient(x - radius * .26, y - radius * .30, 0, x, y, radius);
    shell.addColorStop(0, live ? "#ffbddb" : "#71506a");
    shell.addColorStop(.29, live ? "#c3548b" : "#47223e");
    shell.addColorStop(.67, "#531945");
    shell.addColorStop(.86, "#281625");
    shell.addColorStop(1, "#a632735e");
    ctx.globalAlpha = opacity;
    ctx.fillStyle = shell;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, tau); ctx.fill();
    glint(ctx, x, y, radius * 1.38, "#e972ab", opacity * .42 * pulse);
    for (let i = 0; i < (quiet ? 4 : 7); i++) {
      const a = i * 2.39996 + Math.sin(time * 3 + i) * .19;
      const step = i % 3 * .19 + .30;
      const r = radius * (1 + step);
      ctx.globalAlpha = opacity * (live ? .82 : .48) * pulse;
      ctx.strokeStyle = relayColor[i % 3 + 1];
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * radius * .63, y + Math.sin(a) * radius * .63);
      ctx.quadraticCurveTo(x + Math.cos(a + .26) * r * .78, y + Math.sin(a + .26) * r * .78,
        x + Math.cos(a - .06) * r, y + Math.sin(a - .06) * r);
      ctx.stroke();
    }
    if (node.maxHealth && node.health < node.maxHealth) {
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = "#ffd9e8";
      ctx.beginPath(); ctx.arc(x, y, radius * 1.15, -pi / 2, -pi / 2 + tau * node.health / node.maxHealth); ctx.stroke();
    }
    ctx.restore();
  }

  function tell(ctx, line, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(line.x1, line.y1); ctx.lineTo(line.x2, line.y2); ctx.stroke();
    ctx.setLineDash([]);
  }

  function mechanic(ctx, hazard, { active, progress, quiet }) {
    const { kind, x, y, radius, thickness, nodes } = hazard;
    const time = quiet ? 0 : hazard.age;
    if (!["mirrorShield", "mirrorDecoys", "riftFold", "neuralRelay"].includes(kind)) return false;
    ctx.save();
    if (kind === "mirrorShield") {
      prismShield(ctx, hazard, active, time, active ? 1 : ease(hazard.age / Math.max(.01, hazard.warning)));
    } else if (kind === "mirrorDecoys") {
      for (const [i, node] of nodes.entries()) {
        if (node.health <= 0) continue;
        const line = { x1: node.x, y1: node.y, x2: hazard.aimX, y2: hazard.aimY, width: thickness * 2 };
        if (active && progress > .61 && progress < .82) lightRay(ctx, line, time, .93, quiet);
        else tell(ctx, line, "#8cade1", active ? .68 : .59);
        hologram(ctx, node, time + (quiet ? 0 : i * .21), active ? .87 : .54);
        ctx.setLineDash([3, 5]);
        circle(ctx, node.x, node.y, node.radius * 1.38, "#8ee4ff", 1.05, .63);
        ctx.setLineDash([]);
        if (node.maxHealth && node.health < node.maxHealth) {
          ctx.globalAlpha = .88; ctx.strokeStyle = "#f4fbff";
          ctx.beginPath(); ctx.arc(node.x, node.y, node.radius * 1.57, -pi / 2,
            -pi / 2 + tau * node.health / node.maxHealth); ctx.stroke();
        }
      }
    } else if (kind === "riftFold") {
      const shrink = .91 + .09 * Math.cos(time * 2.6);
      gravityHalo(ctx, x, y, radius * shrink, time, active ? .96 : .63, quiet);
      for (const [x1, y1, x2, y2] of riftSeams(hazard)) {
        const line = { x1, y1, x2, y2, width: thickness * 2 };
        if (active && progress > .68) tearRay(ctx, line, time, .92, quiet);
        else tell(ctx, line, "#b9a6e6", .75);
      }
    } else {
      const live = activeRelayNode(hazard);
      for (const [index, node] of nodes.entries()) {
        if (node.health <= 0) continue;
        const next = nodes.slice(index + 1).find(candidate => candidate.health > 0);
        if (next) {
          const internode = { x1: node.x, y1: node.y, x2: next.x, y2: next.y, width: thickness * .54 };
          nerveRay(ctx, internode, time, active ? .55 : .29, quiet, index * .29);
        }
        if (node === live) {
          const scan = { x1: node.x, y1: node.y, x2: x, y2: y, width: thickness * 2 };
          if (active && progress > .57) nerveRay(ctx, scan, time, .91, quiet);
          else tell(ctx, scan, "#ecacc6", .78);
        }
        neuron(ctx, node, time, node === live, active ? .95 : .58, quiet);
      }
    }
    ctx.restore();
    return true;
  }

  function signature(ctx, hazard, { active, progress, quiet }) {
    if (!active) return false;
    const time = quiet ? 0 : hazard.age;
    const material = hazard.material || pressureMaterialNames[boss?.type];
    if (hazard.kind === "vortex" && material === "void") {
      ctx.save();
      gravityHalo(ctx, hazard.x, hazard.y, hazard.radius, time, .89, quiet);
      circle(ctx, hazard.x, hazard.y, alienVortexCore(hazard, progress), "#c9a5fe", 1.5, .83);
      ctx.restore();
      return true;
    }
    if (hazard.kind === "ring" && material === "nerve") {
      const { x, y, thickness } = hazard;
      const radius = alienRingRadius(hazard, progress), half = thickness * .5;
      ctx.save();
      circle(ctx, x, y, radius, "#a4386d", thickness * .78, .52);
      circle(ctx, x, y, radius, "#fdadd0", 1.3, .91);
      const count = quiet ? 9 : 24;
      for (let i = 0; i < count; i++) {
        const a = i * tau / count;
        const pulse = .47 + .41 * Math.cos(a * 3 + time * 8);
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = i % 3 ? relayColor[2] : relayColor[3];
        ctx.lineWidth = 1.05;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
        for (const side of [-1, 1]) {
          const r = radius + side * half * .74, angle = a + side * .045;
          ctx.quadraticCurveTo(x + Math.cos(a + .043) * radius, y + Math.sin(a + .043) * radius,
            x + Math.cos(angle) * r, y + Math.sin(angle) * r);
          ctx.moveTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
        }
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }
    const beam = hazard.kind === "beam" || hazard.kind === "seam", filament = hazard.kind === "filament";
    if (!(beam || filament) || !["glass", "void", "nerve"].includes(material)) return false;
    const vertical = hazard.kind === "seam";
    const pose = filament ? alienFilamentPose(hazard, progress)
      : vertical ? { x1: hazard.x, y1: 0, x2: hazard.x, y2: viewport.height }
        : { x1: hazard.right, y1: hazard.y, x2: 0, y2: hazard.y };
    const line = { ...pose, width: hazard.thickness };
    if (material === "glass") lightRay(ctx, line, time, .92, quiet);
    if (material === "void") tearRay(ctx, line, time, .92, quiet);
    if (material === "nerve") nerveRay(ctx, line, time, .92, quiet);
    return true;
  }

  function ultimate(ctx, hazard, geometry, target, { active, quiet, alpha }) {
    const kind = hazard.ultimateKind;
    if (!["mirrorArray", "voidCollapse", "neuralGrid"].includes(kind) || (!active && kind !== "voidCollapse")) return false;
    const time = quiet ? 0 : hazard.age;
    ctx.save();
    if (kind === "voidCollapse") {
      const ring = geometry.circles[0], core = geometry.circles[1];
      if (ring) {
        const p = Math.max(0, (hazard.age-hazard.warning)/hazard.duration);
        const charging = ease(hazard.age/Math.max(.01,hazard.warning));
        const room = mechanicRoom();
        const reach = Math.min(room.width*.42,room.height*.47);
        const base = Math.min(viewport.width*.70, viewport.height*.79,reach*3.65);
        if(active) {
          NextgenVfx.drawCollapseFront(ctx,ring,time,alpha,quiet);
          for(const line of geometry.segments) tearRay(ctx,line,time,alpha,quiet);
        }
        const diameter = active ? base*(1-.43*ease(p)) : base*(.34+.66*charging);
        NextgenVfx.drawHorizon(ctx,ring.x,ring.y,diameter,time,
          active ? alpha : .07+.76*charging,quiet);
        if (active) {
          if(core?.radius>1) circle(ctx,core.x,core.y,core.radius,"#f2b8ef",1.45,alpha*.88);
        }
      }
    } else if (kind === "mirrorArray") {
      for (const line of geometry.segments) lightRay(ctx, line, time, alpha, quiet);
    } else {
      for (const [index, line] of geometry.segments.entries()) {
        nerveRay(ctx, line, time, alpha, quiet, index * .28);
      }
    }
    ctx.restore();
    return true;
  }

  function ultimateNodes(ctx, hazard, geometry, quiet) {
    const { ultimateKind, age, warning } = hazard;
    if (ultimateKind !== "mirrorArray" && ultimateKind !== "neuralGrid") return false;
    const time = quiet ? 0 : age;
    ctx.save();
    const f = age >= warning ? .94 : .57;
    for (const [i, node] of geometry.nodes.entries()) {
      if (node.health <= 0) continue;
      if (ultimateKind === "neuralGrid") {
        const active = Math.min(2, Math.floor(geometry.progress * 3)) === i;
        neuron(ctx, node, time, active, f, quiet);
      } else {
        prism(ctx, node.x, node.y, node.radius, i * .63 + time * .53, time, f);
        circle(ctx, node.x, node.y, node.radius * 1.1, "#b8eeff", 1, .58);
        if (node.maxHealth && node.health < node.maxHealth) {
          ctx.strokeStyle = "#f4fbff"; ctx.globalAlpha = .85;
          ctx.beginPath(); ctx.arc(node.x, node.y, node.radius * 1.21, -pi / 2,
            -pi / 2 + tau * node.health / node.maxHealth); ctx.stroke();
        }
      }
    }
    ctx.restore();
    return true;
  }

  function charge(ctx, target, scene, { x, y, radius, charge, time, quiet }) {
    ctx.save();
    const strength = .28 + ease(charge) * .66;
    if (scene.ultimateKind === "mirrorArray") {
      const spread = radius * (.55 + .34 * charge);
      for (let i = 0; i < 3; i++) {
        const a = i * tau / 3 + time * .72;
        const px = x + Math.cos(a) * spread, py = y + Math.sin(a) * spread * .63;
        const line = { x1: px, y1: py, x2: x, y2: y, width: radius * (.048 + .022 * charge) };
        lightRay(ctx, line, time, strength * .74, quiet);
        prism(ctx, px, py, radius * .172, a + time * 1.29, time, strength);
      }
      glint(ctx, x, y, radius * .52, "#a9dcff", strength * .82);
    } else if (scene.ultimateKind === "voidCollapse") {
      const r = radius * (.34 + charge * .55);
      gravityHalo(ctx, x, y, r, time, strength, quiet);
    } else if (scene.ultimateKind === "neuralGrid") {
      for (let i = 0; i < 5; i++) {
        const a = .60 + i * tau / 5;
        const radiusScale = .67 + .11 * Math.cos(i * 4.72);
        const px = x + Math.cos(a) * radius * radiusScale;
        const py = y + Math.sin(a) * radius * .61;
        const line = { x1: x, y1: y, x2: px, y2: py, width: radius * (.065 + charge * .043) };
        nerveRay(ctx, line, time, strength * .62, quiet, i * .23);
        neuron(ctx, { x: px, y: py, radius: radius * .07 }, time, true, strength, quiet);
      }
      glint(ctx, x, y, radius * .34, "#ff9fc5", strength * .94);
    } else {
      ctx.restore();
      return false;
    }
    ctx.restore();
    return true;
  }

  function aftershock(ctx, scene, { x, y, width, height, age, quiet }) {
    const kind = scene.ultimateKind;
    if (!["mirrorArray", "voidCollapse", "neuralGrid"].includes(kind)) return false;
    const t = Math.min(1, age / .70);
    const fade = (1 - t) ** 1.6;
    const front = x - (quiet ? .18 : 1 - Math.exp(-t * 4.8)) * width;
    ctx.save();
    if (kind === "mirrorArray") {
      for (let i = 0; i < (quiet ? 5 : 15); i++) {
        const f = (i + .25) / (quiet ? 5 : 15);
        const px = front + width * (.14 + .31 * fraction(i * .705));
        const py = height * f + (f - .5) * t * height * .16;
        prism(ctx, px, py, height * (.010 + .020 * fraction(i * .751)), i * 1.66 + (quiet ? 0 : t * 4),
          quiet ? 0 : t * 2, fade * (.46 + .44 * fraction(i * .603)));
      }
    } else if (kind === "voidCollapse") {
      // An implosion leaves narrow curved gravitational streaks around its axis.
      for (let i = 0; i < (quiet ? 4 : 10); i++) {
        const f = i / (quiet ? 4 : 10), r = height * (.15 + .40 * f) * (1 - .57 * t);
        lens(ctx, front + width * f * .4, y + height * (f - .5) * .6, r, r * (.29 + f * .25),
          -.38 + .75 * f, i % 2 ? "#b99af4" : "#726ae5", fade * .81);
      }
    } else {
      for (let i = 0; i < (quiet ? 4 : 9); i++) {
        const f = (i + .4) / (quiet ? 4 : 9);
        const cx = front + width * .16 * fraction(i * .789);
        const cy = f * height;
        nerveRay(ctx, { x1: cx, y1: cy, x2: cx + width * (.047 + .12 * f),
          y2: cy + (f - .5) * height * .12, width: 5 + 8 * (1 - t) },
        quiet ? 0 : t, fade * .71, quiet, i * .32);
      }
    }
    ctx.restore();
    return true;
  }

  return Object.freeze({ mechanic, signature, ultimate, ultimateNodes, charge, aftershock });
})();
