"use strict";

// Presentation only. The existing encounter geometry supplies every contact,
// beam center line, storm radius, and damage window to these painters.
const BossEnergyVfx = (() => {
  const tau = Math.PI * 2;
  const colors = {
    silk: { aura: "#a92bed", body: "#9326d5", edge: "#d36cff", core: "#f7d2ff", dark: "#280640" },
    storm: { aura: "#3565ff", body: "#2677ef", edge: "#59cfff", core: "#e4fcff", dark: "#071f68" },
    nerve: { aura: "#f31480", body: "#f22591", edge: "#ff77bf", core: "#fff0f7", dark: "#4b0b41" },
  };
  const ultimateTheme = { silkCage: "silk", stormRing: "storm", neuralGrid: "nerve" };
  const flares = new Map();

  function variation(seed) {
    const value = Math.sin(seed * 7.813 + 2.61) * 43758.5453;
    return value - Math.floor(value);
  }

  function smoothVariation(seed, time) {
    const frame = Math.floor(time);
    const t = time - frame;
    const a = variation(seed + frame * 3.7), b = variation(seed + (frame + 1) * 3.7);
    return a + (b - a) * t * t * (3 - 2 * t);
  }

  function flare(ctx, x, y, size, color, alpha) {
    if (size < 1 || alpha < .015) return;
    let sprite = flares.get(color.edge);
    if (!sprite) {
      sprite = document.createElement("canvas");
      sprite.width = sprite.height = 64;
      const paint = sprite.getContext("2d");
      const spectrum = paint.createRadialGradient(32, 32, 0, 32, 32, 32);
      spectrum.addColorStop(0, color.core + "fc");
      spectrum.addColorStop(.14, color.edge + "d8");
      spectrum.addColorStop(.36, color.body + "91");
      spectrum.addColorStop(.68, color.aura + "27");
      spectrum.addColorStop(1, color.aura + "00");
      paint.fillStyle = spectrum;
      paint.fillRect(0, 0, 64, 64);
      flares.set(color.edge, sprite);
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, x - size, y - size, size * 2, size * 2);
  }

  function tell(ctx, x1, y1, x2, y2, color, alpha = .64) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color.edge;
    ctx.lineWidth = 1.3;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  function taperedBody(ctx, length, width, color) {
    const bevel = Math.min(length * .34, 25 + width * 1.2);
    const shade = ctx.createLinearGradient(0, -width, 0, width);
    shade.addColorStop(0, color.aura + "00");
    shade.addColorStop(.31, color.body + "44");
    shade.addColorStop(.5, color.edge + "b2");
    shade.addColorStop(.69, color.body + "44");
    shade.addColorStop(1, color.aura + "00");
    ctx.fillStyle = shade;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(bevel * .48, -width * .16, bevel * .67, -width, bevel, -width);
    ctx.lineTo(length - bevel, -width);
    ctx.bezierCurveTo(length - bevel * .54, -width, length - bevel * .24, -width * .18, length, 0);
    ctx.bezierCurveTo(length - bevel * .24, width * .18, length - bevel * .54, width, length - bevel, width);
    ctx.lineTo(bevel, width);
    ctx.bezierCurveTo(bevel * .67, width, bevel * .48, width * .16, 0, 0);
    ctx.fill();
  }

  function chargeStrands(ctx, length, width, time, theme, quiet) {
    const silk = theme === "silk", storm = theme === "storm";
    const color = colors[theme];
    const count = quiet ? 3 : silk ? 7 : 4;
    const samples = quiet ? 14 : Math.min(52, Math.max(17, Math.round(length / 22)));
    for (let strand = 0; strand < count; strand++) {
      const offset = (strand / (count - 1) - .5) * width;
      ctx.beginPath();
      for (let step = 0; step <= samples; step++) {
        const t = step / samples, envelope = Math.min(1, t * 14, (1 - t) * 14);
        const wave = Math.sin(t * (silk ? 11 : 35) + strand * 1.93 - time * (silk ? 3.5 : 14));
        const noise = storm ? smoothVariation(step + strand * 41, time * 19) - .5 : 0;
        const y = envelope * (offset + (wave * (silk ? .24 : .35) + noise * .83) * width);
        if (step === 0) ctx.moveTo(0, y); else ctx.lineTo(length * t, y);
      }
      ctx.strokeStyle = strand === 1 ? color.core : strand % 2 ? color.edge : color.body;
      ctx.lineWidth = strand === 1 ? Math.max(.9, width * (silk ? .105 : .18)) : Math.max(.7, width * .09);
      ctx.stroke();
    }
  }

  function chargeBranches(ctx, length, width, time, theme) {
    const color = colors[theme];
    ctx.lineWidth = .82;
    ctx.strokeStyle = color.edge;
    ctx.beginPath();
    const branches = Math.min(19, Math.max(2, Math.round(length / 44)));
    for (let i = 0; i < branches; i++) {
      const seed = i * 17.78;
      const t = .03 + ((variation(seed) + time * (.09 + variation(seed + 1) * .15)) % 1) * .94;
      const x = t * length, side = i % 2 ? 1 : -1;
      const reach = theme === "silk" ? 1.6 : 2.6;
      const spread = Math.min(length * .37, width * (.68 + variation(seed + 2) * reach)) * side;
      const skew = (variation(seed + 3) - .35) * Math.min(33, length * .12);
      ctx.moveTo(x, 0);
      ctx.lineTo(x + skew * .3, spread * .43);
      ctx.lineTo(x + skew * .72, spread * .64);
      ctx.lineTo(x + skew, spread);
      ctx.moveTo(x + skew * .3, spread * .43);
      ctx.lineTo(x - skew * .24, spread * .81);
    }
    ctx.stroke();
  }

  function drawBeam(ctx, line, theme, time, alpha, quiet) {
    const dx = line.x2 - line.x1, dy = line.y2 - line.y1;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;
    const color = colors[theme], halfWidth = Math.max(2, line.width * .5);
    ctx.save();
    ctx.translate(line.x1, line.y1);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = alpha * .72;
    ctx.globalCompositeOperation = "lighter";
    taperedBody(ctx, length, halfWidth * (theme === "silk" ? 1.8 : 2.35), color);
    ctx.globalAlpha = alpha * .88;
    chargeStrands(ctx, length, halfWidth, time, theme, quiet);

    const endGlow = ctx.createLinearGradient(0, 0, length, 0);
    endGlow.addColorStop(0, color.core + "00");
    endGlow.addColorStop(.12, color.core + "de");
    endGlow.addColorStop(.88, color.core + "de");
    endGlow.addColorStop(1, color.core + "00");
    ctx.strokeStyle = endGlow;
    ctx.lineWidth = Math.max(.8, halfWidth * (theme === "silk" ? .13 : .34));
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(length, 0); ctx.stroke();
    if (!quiet) {
      ctx.globalAlpha = alpha * (theme === "silk" ? .21 : .48);
      chargeBranches(ctx, length, halfWidth, time, theme);
    }
    const pulses = quiet ? 1 : Math.min(5, Math.max(1, Math.round(length / 115)));
    for (let i = 0; i < pulses; i++) {
      const phase = (time * (theme === "silk" ? .36 : .85) + (i + .5) / pulses) % 1;
      const fade = Math.min(1, phase * 8, (1 - phase) * 8);
      flare(ctx, phase * length, 0, halfWidth * (theme === "silk" ? 1.4 : 1.85), color, alpha * .55 * fade);
    }
    ctx.restore();
  }

  function drawSilkShell(ctx, r, color, vitality) {
    ctx.save();
    ctx.clip();
    const inset = ctx.createLinearGradient(-r * .7, -r * .6, r * .7, r * .2);
    inset.addColorStop(0, color.core + "05");
    inset.addColorStop(.4, color.core + (vitality < .5 ? "aa" : "7a"));
    inset.addColorStop(1, color.dark + "da");
    ctx.fillStyle = inset;
    ctx.beginPath();
    ctx.moveTo(-r * .75, 0);
    ctx.lineTo(r * .03, -r * .59);
    ctx.lineTo(r * .61, -r * .72);
    ctx.lineTo(r * .18, r * .44);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = color.core + "9c";
    ctx.lineWidth = Math.max(.55, r * .042);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const root = r * (i - 2) * .17;
      ctx.moveTo(-r * .69, root - r * .13);
      ctx.bezierCurveTo(-r * .15, root * .5 - r * .42, r * .19, root * 1.6 + r * .02, r * .64, root + r * .1);
    }
    if (vitality < .85) {
      ctx.moveTo(r * .55, -r * .68);
      ctx.lineTo(r * .28, -r * .10);
      ctx.lineTo(r * .09, -r * .20);
      ctx.lineTo(-r * .26, r * .56);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawNode(ctx, node, theme, time, hot, quiet, rank) {
    if (node.health <= 0) return;
    const color = colors[theme], { x, y, radius:r } = node;
    const vitality = node.maxHealth ? Math.max(0, Math.min(1, node.health / node.maxHealth)) : 1;
    const pulse = quiet ? .96 : .96 + Math.sin(time * 4.2 + x * .014) * .08;
    const intensity = (hot ? .9 : .46) * (.66 + .34 * vitality);
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = "lighter";
    flare(ctx, 0, 0, r * 3.3 * pulse, color, intensity * .8);
    const silk = theme === "silk";
    ctx.strokeStyle = color.edge;
    ctx.lineWidth = Math.max(.6, r * .052);
    ctx.globalAlpha = intensity * (silk ? .64 : .72);
    ctx.beginPath();
    const branches = quiet ? 5 : silk ? 16 : 12;
    for (let i = 0; i < branches; i++) {
      const seed = i * 21.57 + x * .07;
      const a = i / branches * tau + (quiet ? 0 : time * (silk ? .31 : .16));
      const reach = r * (1.15 + variation(seed) * (silk ? 1.48 : 1.09));
      const sin = Math.sin(a), cos = Math.cos(a);
      const sway = Math.sin(a * 4 + time * 5) * r * .43 + (variation(seed + 7) - .5) * r;
      ctx.moveTo(cos * r * .46, sin * r * .46);
      if (silk) {
        ctx.bezierCurveTo(cos * reach * .45 + sin * sway, sin * reach * .45 - cos * sway,
          cos * reach * .75 - sin * sway, sin * reach * .75 + cos * sway, cos * reach, sin * reach);
      } else {
        ctx.lineTo(cos * reach * .4 + sin * sway * .6, sin * reach * .4 - cos * sway * .6);
        ctx.lineTo(cos * reach * .75 - sin * sway, sin * reach * .75 + cos * sway);
        ctx.lineTo(cos * reach, sin * reach);
        ctx.moveTo(cos * reach * .4 + sin * sway * .6, sin * reach * .4 - cos * sway * .6);
        ctx.lineTo(cos * reach * .69 + sin * r * .47, sin * reach * .69 - cos * r * .47);
        ctx.lineTo(cos * reach * .77 + sin * r * .57, sin * reach * .77 - cos * r * .57);
      }
    }
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = hot ? .97 : .56;
    ctx.rotate(silk ? -.34 + Math.sin(time * 1.2) * .16 : 0);
    const shell = ctx.createRadialGradient(-r * .27, -r * .32, 0, 0, 0, r);
    shell.addColorStop(0, color.core);
    shell.addColorStop(.29, color.edge);
    shell.addColorStop(.71, color.body);
    shell.addColorStop(1, color.dark);
    ctx.fillStyle = shell;
    ctx.beginPath();
    if (silk) {
      ctx.moveTo(-r * .77, 0);
      ctx.bezierCurveTo(-r * .66, -r * .65, -r * .11, -r * .88, r * .59, -r * .71);
      ctx.bezierCurveTo(r * .53, -r * .33, r * .93, .01 * r, r * .49, r * .56);
      ctx.bezierCurveTo(r * .11, r * .87, -r * .61, r * .62, -r * .77, 0);
    } else ctx.ellipse(0, 0, r * .76 * pulse, r * .79 * pulse, 0, 0, tau);
    ctx.fill();
    ctx.strokeStyle = color.edge + "b0";
    ctx.lineWidth = Math.max(.75, r * .08);
    ctx.stroke();
    if (silk) drawSilkShell(ctx, r, color, vitality);
    ctx.globalCompositeOperation = "lighter";
    flare(ctx, -r * .15, -r * .14, r * .84, color, intensity * .65);
    if (node.maxHealth > 0) {
      ctx.globalAlpha = hot ? .87 : .48;
      ctx.strokeStyle = color.core;
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(1.2, r * .09);
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.04, .81, .81 + Math.PI * .52 * vitality);
      ctx.stroke();
    }
    if (rank !== undefined) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = hot ? 1 : .76;
      ctx.font = `bold ${Math.max(10, r * .67)}px system-ui`;
      ctx.fillStyle = color.core;
      ctx.strokeStyle = color.dark;
      ctx.lineWidth = 2.5;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeText(String(rank), 0, .5);
      ctx.fillText(String(rank), 0, .5);
    }
    ctx.restore();
  }

  function drawTail(ctx, hazard, active, progress, time, quiet) {
    const node = hazard.nodes[0];
    if (node.health <= 0) return;
    const color = colors.storm;
    const samples = quiet ? 15 : 28;
    ctx.save();
    ctx.strokeStyle = color.edge;
    ctx.globalAlpha = active ? .35 : .64;
    ctx.lineWidth = 1.4;
    ctx.setLineDash(active ? [] : [6, 8]);
    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const at = tailPosition(hazard, i / samples);
      if (i === 0) ctx.moveTo(at.x, at.y); else ctx.lineTo(at.x, at.y);
    }
    ctx.stroke();
    ctx.restore();
    if (active) {
      // Match the undivided contact chord. Braided arcs and ion wakes decorate
      // that chord while the dimmer route continues to follow the curve.
      const front = tailPosition(hazard, progress), back = tailPosition(hazard, Math.max(0, progress - .18));
      const dx = front.x - back.x, dy = front.y - back.y;
      for (let i = 0; i < 4; i++) {
        const start = i / 4, end = (i + .94) / 4;
        drawBeam(ctx, { x1: back.x + dx * start, y1: back.y + dy * start,
          x2: back.x + dx * end, y2: back.y + dy * end, width: hazard.thickness * 1.55 },
        "storm", time + i * .19, .89, quiet);
      }
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      flare(ctx, front.x, front.y, hazard.thickness * 2.5, color, .92);
      ctx.restore();
    }
    drawNode(ctx, node, "storm", time, true, quiet);
  }

  function drawMechanic(ctx, hazard, quiet) {
    const { kind, x, y, nodes, thickness } = hazard;
    if (kind !== "loom" && kind !== "tailConduit" && kind !== "neuralRelay") return false;
    const active = mechanicActive(hazard), progress = signatureProgress(hazard), time = quiet ? 0 : hazard.age;
    if (kind === "tailConduit") drawTail(ctx, hazard, active, progress, time, quiet);
    if (kind === "loom") {
      for (const [one, two] of liveLoomLinks(hazard)) {
        const a = nodes[one], b = nodes[two];
        if (active) drawBeam(ctx, { x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: thickness * 2 }, "silk", time, .91, quiet);
        else tell(ctx, a.x, a.y, b.x, b.y, colors.silk);
      }
      for (const node of nodes) drawNode(ctx, node, "silk", time, true, quiet);
    }
    if (kind === "neuralRelay") {
      const live = activeRelayNode(hazard);
      if (!live) return true;
      if (active && progress > .57) drawBeam(ctx, { x1: live.x, y1: live.y, x2: x, y2: y, width: thickness * 2 }, "nerve", time, .97, quiet);
      else tell(ctx, live.x, live.y, x, y, colors.nerve);
      ctx.save();
      // Pause glyph remains legible so the moving-only damage rule is signaled.
      const midX = (x + live.x) * .5, midY = (y + live.y) * .5;
      ctx.beginPath(); ctx.arc(midX, midY, 9.5, 0, tau);
      ctx.fillStyle = "#190925"; ctx.fill();
      ctx.strokeStyle = colors.nerve.edge; ctx.lineWidth = 1.35; ctx.stroke();
      ctx.fillStyle = colors.nerve.core;
      ctx.fillRect(midX - 4.1, midY - 4.2, 2.8, 8.4);
      ctx.fillRect(midX + 1.3, midY - 4.2, 2.8, 8.4);
      ctx.restore();
      for (const [index, node] of nodes.entries()) drawNode(ctx, node, "nerve", time, live === node, quiet, index + 1);
    }
    return true;
  }

  function drawStormRing(ctx, circle, time, alpha, quiet) {
    const color = colors.storm;
    const depth = Math.max(4, circle.radius - circle.innerRadius);
    const radius = (circle.radius + circle.innerRadius) * .5;
    ctx.save();
    ctx.translate(circle.x, circle.y);
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(0, 0, Math.max(0, radius - depth * 1.9), 0, 0, radius + depth * 1.9);
    glow.addColorStop(0, color.aura + "00");
    glow.addColorStop(.26, color.body + "29");
    glow.addColorStop(.5, color.edge + "b0");
    glow.addColorStop(.74, color.body + "35");
    glow.addColorStop(1, color.aura + "00");
    ctx.globalAlpha = alpha * .84;
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, radius + depth * 1.9, 0, tau); ctx.fill();
    const segments = quiet ? 62 : 126;
    const count = quiet ? 1 : 3;
    for (let band = 0; band < count; band++) {
      ctx.beginPath();
      for (let i = 0; i <= segments; i++) {
        const a = (i % segments) / segments * tau;
        const offset = (smoothVariation(i % segments + band * 47, time * 19) - .5) * depth * .83;
        const r = radius + offset + (band - (count - 1) * .5) * depth * .21;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.globalAlpha = alpha * (band === 0 ? .95 : .42);
      ctx.strokeStyle = band === 0 ? color.core : color.edge;
      ctx.lineWidth = band === 0 ? 1.85 : 1.1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStormContacts(ctx, geometry, time, alpha, quiet) {
    const color = colors.storm;
    const origin = geometry.segments[0];
    if (!origin) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const centerSize = origin.width * (quiet ? 5 : 6.7 + Math.sin(time * 8.4) * .85);
    flare(ctx, origin.x1, origin.y1, centerSize, color, alpha);
    flare(ctx, origin.x1, origin.y1, centerSize * .47, color, alpha * .8);
    for (const ring of geometry.circles) {
      const radius = (ring.radius + ring.innerRadius) * .5;
      for (const line of geometry.segments) {
        const dx = line.x2 - line.x1, dy = line.y2 - line.y1, length = Math.hypot(dx, dy);
        if (length <= radius) continue;
        const x = ring.x + dx / length * radius, y = ring.y + dy / length * radius;
        flare(ctx, x, y, line.width * 2.82, color, alpha);
        if (quiet) continue;
        ctx.globalAlpha = alpha * .6;
        ctx.strokeStyle = color.core;
        ctx.lineWidth = .85;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * tau + time * 3.7;
          const reach = line.width * (.34 + variation(i + time) * 1.64);
          const sin = Math.sin(a), cos = Math.cos(a);
          ctx.moveTo(x + cos * 2, y + sin * 2);
          ctx.lineTo(x + cos * reach * .48 + sin * 2.2, y + sin * reach * .48 - cos * 2.2);
          ctx.lineTo(x + cos * reach, y + sin * reach);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawGridContacts(ctx, segments, theme, alpha) {
    const color = colors[theme];
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const vertical of segments) {
      if (vertical.x1 !== vertical.x2) continue;
      for (const horizontal of segments) {
        if (horizontal.y1 !== horizontal.y2 || horizontal.x1 === horizontal.x2) continue;
        const x = vertical.x1, y = horizontal.y1;
        if (x < Math.min(horizontal.x1, horizontal.x2) || x > Math.max(horizontal.x1, horizontal.x2)
          || y < Math.min(vertical.y1, vertical.y2) || y > Math.max(vertical.y1, vertical.y2)) continue;
        flare(ctx, x, y, Math.max(vertical.width, horizontal.width) * 1.48, color, alpha * .94);
      }
    }
    ctx.restore();
  }

  function drawUltimate(ctx, hazard, geometry, quiet) {
    const theme = ultimateTheme[hazard.ultimateKind];
    if (!theme) return false;
    const active = hazard.age >= hazard.warning, time = quiet ? 0 : hazard.age;
    // Telegraph contours are drawn in the foreground by the encounter renderer.
    if (!active) return true;
    const alpha = .94;
    ctx.save();
    if (theme === "storm") for (const circle of geometry.circles) drawStormRing(ctx, circle, time, alpha, quiet);
    for (const line of geometry.segments) drawBeam(ctx, line, theme, time, alpha, quiet);
    if (theme === "storm") drawStormContacts(ctx, geometry, time, alpha, quiet);
    if (theme === "nerve") drawGridContacts(ctx, geometry.segments, theme, alpha);
    if (theme === "silk" && geometry.progress > .32) {
      ctx.globalCompositeOperation = "lighter";
      flare(ctx, hazard.lockX, hazard.lockY, 36, colors.silk, .76);
    }
    ctx.restore();
    return true;
  }

  function drawUltimateNodes(ctx, hazard, geometry, quiet) {
    const theme = ultimateTheme[hazard.ultimateKind];
    if (!theme) return false;
    const phase = Math.min(2, Math.floor(geometry.progress * 3));
    for (const [index, node] of geometry.nodes.entries()) {
      drawNode(ctx, node, theme, quiet ? 0 : hazard.age, theme !== "nerve" || index <= phase, quiet);
    }
    return true;
  }

  return Object.freeze({ drawMechanic, drawUltimate, drawUltimateNodes });
})();
