"use strict";

const ElementalConfluenceVfx = (() => {
  const tau = Math.PI * 2;
  const filament = Array.from({length: 32}, (_, i) => ({
    u: (i * .6180339887) % 1,
    v: (i * .4142135624) % 1,
    phase: i * 2.39996323,
  }));
  const curtain = new Image();
  curtain.src = "assets/vfx/elemental-confluence-curtain.webp";

  function dust(ctx, x, y, size, age, quiet, inward, color) {
    if (quiet) return;
    const count = visualQuality.id === "low" ? 9 : 23;
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const mote = filament[i];
      const t = (mote.u + age * (.38 + mote.v * .29)) % 1;
      const r = size * (inward ? 1 - t : t);
      const a = mote.phase + (inward ? 1 : -1) * t * 1.8;
      ctx.globalAlpha = .57 * Math.sin(tau * .5 * t);
      ctx.fillRect(x + r * Math.cos(a), y + r * Math.sin(a) * .77, 1 + mote.v * 2, 1 + mote.v);
    }
    ctx.globalAlpha = 1;
  }

  function well(ctx, {x, y, radius, innerRadius = 0}, time, alpha, quiet, burst = false) {
    if (radius <= .5) return;
    const inner = Math.max(innerRadius, radius * (burst ? .09 : .38));
    ctx.save();
    ctx.translate(x, y);
    if (innerRadius > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, tau);
      ctx.arc(0, 0, innerRadius, 0, tau);
      ctx.clip("evenodd");
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, tau);
      ctx.clip();
    }
    const field = ctx.createRadialGradient(0, 0, inner * .34, 0, 0, radius);
    field.addColorStop(0, burst ? "#f8b4c9b0" : "#050215e8");
    field.addColorStop(.39, burst ? "#7c1c593b" : "#09041c90");
    field.addColorStop(.71, burst ? "#331440a3" : "#351766c0");
    field.addColorStop(.94, burst ? "#ad367f78" : "#6d39baa3");
    field.addColorStop(1, "#39184600");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = field;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    const count = visualQuality.id === "low" ? 5 : 10;
    for (let j = 0; j < count; j++) {
      const m = filament[j];
      const bend = burst ? -.51 : 1.35;
      const theta = m.phase + (quiet ? 0 : (burst ? -time : time) * (1 + m.v));
      const band = (radius - inner) * (.57 + .36 * m.u);
      const a = theta + bend;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.quadraticCurveTo(Math.cos(theta + bend * 1.26) * (inner + band * .65),
        Math.sin(theta + bend * 1.26) * (inner + band * .65),
        Math.cos(theta) * (inner + band), Math.sin(theta) * (inner + band));
      ctx.lineWidth = Math.max(.65, radius * (.011 + .013 * m.v));
      ctx.globalAlpha = alpha * (.16 + .41 * m.u);
      ctx.strokeStyle = j % 3 ? (burst ? "#d25d9e" : "#9d5bfa") : "#eed0ff";
      ctx.stroke();
    }
    dust(ctx, 0, 0, radius, time, quiet, !burst, burst ? "#ffd3bb" : "#e6bcff");
    ctx.restore();
  }

  function lance(ctx, line, time, alpha, quiet) {
    const length = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
    const half = Math.max(.5, line.width / 2);
    if (length < 1) return;
    ctx.save();
    ctx.translate(line.x1, line.y1);
    ctx.rotate(Math.atan2(line.y2 - line.y1, line.x2 - line.x1));
    const veil = ctx.createLinearGradient(0, -half, 0, half);
    veil.addColorStop(0, "#562c8b00");
    veil.addColorStop(.23, "#6b2aa66c");
    veil.addColorStop(.42, "#e26962e5");
    veil.addColorStop(.5, "#fff2bc");
    veil.addColorStop(.58, "#ffbf70ed");
    veil.addColorStop(.81, "#7531ab85");
    veil.addColorStop(1, "#592e8b00");
    ctx.fillStyle = veil;
    ctx.globalAlpha = alpha;
    ctx.fillRect(0, -half, length, half * 2);
    for (let strand = 0; strand < 4; strand++) {
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const a = 17 * t + strand * 1.51 - (quiet ? 0 : time * 9);
        const y = half * .47 * Math.sin(a) * Math.sin(Math.PI * t);
        if (i === 0) ctx.moveTo(0, y); else ctx.lineTo(length * t, y);
      }
      ctx.globalAlpha = alpha * (.29 + strand * .09);
      ctx.lineWidth = Math.max(.7, half * (.11 - strand * .01));
      ctx.strokeStyle = strand % 2 ? "#a66cfc" : "#fff1c1";
      ctx.stroke();
    }
    if (!quiet) {
      ctx.fillStyle = "#fff7d2";
      for (const {u, v, phase} of filament.slice(0, visualQuality.id === "low" ? 6 : 16)) {
        const t = (u + time * (.62 + v)) % 1;
        ctx.globalAlpha = alpha * Math.sin(Math.PI * t) * .66;
        ctx.fillRect(t * length, Math.sin(phase + t * 12) * half * .45,
          2 + Math.min(length * .017, 11) * v, .8 + v);
      }
    }
    ctx.restore();
  }

  function ionCurtain(ctx, rect, time, alpha, quiet) {
    if (rect.width <= 0 || rect.height <= 0) return;
    ctx.save();
    ctx.translate(rect.x, rect.y);
    ctx.beginPath();
    ctx.rect(0, 0, rect.width, rect.height);
    ctx.clip();
    const wash = ctx.createLinearGradient(0, 0, rect.width, 0);
    wash.addColorStop(0, "#3e226200");
    wash.addColorStop(.19, "#542178b4");
    wash.addColorStop(.48, "#100626f5");
    wash.addColorStop(.68, "#232052e8");
    wash.addColorStop(.91, "#7d34a376");
    wash.addColorStop(1, "#58286f00");
    ctx.fillStyle = wash;
    ctx.globalAlpha = alpha;
    ctx.fillRect(0, 0, rect.width, rect.height);
    const timePhase = quiet ? 0 : time * 6;
    if (curtain.complete && curtain.naturalWidth) {
      ctx.globalAlpha = alpha;
      const shift = quiet ? 0 : Math.sin(time * 4.7) * rect.width * .07;
      ctx.drawImage(curtain, shift - rect.width * .045, 0, rect.width * 1.09, rect.height);
      if (!quiet && visualQuality.id !== "low") {
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = alpha * .43;
        ctx.drawImage(curtain, -shift * 1.55, rect.height * .10, rect.width, rect.height * .90);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    for (let i = 0; i < 5; i++) {
      const x = rect.width * (.1 + i * .13);
      ctx.beginPath();
      for (let n = 0; n <= 20; n++) {
        const t = n / 20;
        const xx = x + rect.width * (.09 * Math.sin(i + t * 37 - timePhase)
          + .05 * Math.cos(i * 2.1 + t * 61 - timePhase * .65));
        if (n === 0) ctx.moveTo(xx, 0); else ctx.lineTo(xx, rect.height * t);
      }
      ctx.lineWidth = rect.width * (i % 3 ? .015 : .025);
      ctx.strokeStyle = i % 3 ? "#ad5be8" : "#f2bcff";
      ctx.globalAlpha = alpha * (i % 2 ? .25 : .41);
      ctx.stroke();
    }
    ctx.restore();
  }

  function ultimate(ctx, hazard, geometry, target, {active, alpha, quiet}) {
    if (hazard.ultimateKind !== "fusion" || !active) return false;
    const age = quiet ? 0 : Math.max(0, hazard.age - hazard.warning);
    const energy = alpha * (.91 - .31 * geometry.progress ** 2);
    for (const circle of geometry.circles) well(ctx, circle, age, energy, quiet);
    for (const line of geometry.segments) lance(ctx, line, age, energy, quiet);
    for (const rect of geometry.rects) ionCurtain(ctx, rect, age, energy, quiet);
    return true;
  }

  function mechanic(ctx, hazard, {active, progress, quiet}) {
    if (hazard.kind !== "fusionLimbs" || !active) return false;
    const {x, y, nodes, radius, thickness} = hazard;
    const [siphon, spear, burst] = nodes;
    const time = quiet ? 0 : hazard.age;
    if (siphon?.health > 0 && progress < .5) {
      const width = radius * (1.98 - progress * .44);
      well(ctx, {x, y, radius: width, innerRadius: width * .68}, time, .86, quiet);
      BossConfluenceVfx.beam(ctx, {x1:siphon.x, y1:siphon.y, x2:x, y2:y, width:7},
        time, .66, "siphon", quiet);
    }
    if (spear?.health > 0 && progress < .61) {
      const line = {x1:spear.x, y1:spear.y, x2:mechanicRoom().left, y2:y, width:thickness * 2};
      if (progress > .43) lance(ctx, line, time, .98, quiet);
      else {
        ctx.save();
        ctx.strokeStyle = "#f5cba175";
        ctx.setLineDash([10, 7]);
        drawMechanicLine(ctx, line.x1, line.y1, line.x2, line.y2, 1.75);
        ctx.restore();
      }
    }
    if (burst?.health > 0) {
      if (progress > .71) well(ctx, {x, y, radius}, time, .93, quiet, true);
      else {
        ctx.save();
        ctx.strokeStyle = "#eaa2da";
        ctx.setLineDash([6, 7]);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, tau);
        ctx.stroke();
        ctx.restore();
      }
    }
    for (const [index, node] of nodes.entries()) {
      BossConfluenceVfx.tether(ctx, node, index, boss, time, quiet);
      BossConfluenceVfx.fusionNode(ctx, node, node.role, time, 1, quiet, index + 1);
    }
    return true;
  }

  function charge(ctx, target, scene, {x, y, radius, charge, time, quiet}) {
    const span = radius * (.17 + .20 * charge);
    if (span < 1) return false;
    const r = span * (1.19 - .34 * charge);
    well(ctx, {x, y, radius:r}, time, .38 + .50 * charge, quiet);
    const aperture = target.width * .15;
    lance(ctx, {x1:x + aperture * .60, y1:y - aperture * .89, x2:x - r, y2:y - aperture * 1.42,
      width:(.065 + .13 * charge) * aperture}, time, .47 + .36 * charge, quiet);
    const bx = x + aperture * .68, by = y + aperture * .64;
    well(ctx, {x:bx, y:by, radius:span * .43}, time, .31 + charge * .52, quiet, true);
    return true;
  }

  function aftershock(ctx, scene, {x, y, width, height, age, quiet}) {
    const p = Math.min(1, age / .7);
    const surge = quiet ? .57 : 1 - Math.exp(-p * 5);
    const front = x - width * 1.14 * surge;
    const fade = (1 - p) ** 1.65;
    const depth = width * (.08 + p * .075);
    if (fade <= 0 || depth <= 0) return true;
    ctx.save();
    const field = ctx.createLinearGradient(front, 0, front + depth, 0);
    field.addColorStop(0, "#713bab00");
    field.addColorStop(.18, "#ac78cc95");
    field.addColorStop(.33, "#2219398f");
    field.addColorStop(.75, "#37245949");
    field.addColorStop(1, "#49278a00");
    ctx.globalAlpha = fade * .8;
    ctx.fillStyle = field;
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const yy = height * i / 24;
      const bend = Math.abs(yy - y) / height;
      const xx = front + bend * bend * depth * 2.1 + Math.cos(i * .51 + p * 4) * depth * .05;
      if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.lineTo(front + depth, height);
    ctx.lineTo(front + depth, 0);
    ctx.closePath();
    ctx.fill();
    if (p < .46) dust(ctx, front + depth * .35, y, height * .24, age, quiet, false, "#f4baf4");
    ctx.restore();
    return true;
  }

  return Object.freeze({mechanic, ultimate, charge, aftershock});
})();
