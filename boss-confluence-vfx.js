"use strict";

// Geometry comes from the encounter. Light and particles never change a hit area.
const BossConfluenceVfx = (() => {
  const tau = Math.PI * 2;
  const glows = new Map();
  const colors = {
    void: { deep: "#481b9c", body: "#ab49ff", hot: "#fff2ff" },
    lance: { deep: "#7a239b", body: "#ffb5a8", hot: "#fff8d7" },
    siphon: { deep: "#174281", body: "#73e8ff", hot: "#dfffef" },
    burst: { deep: "#791653", body: "#f56cff", hot: "#ffe5ff" },
    fusion: { deep: "#421473", body: "#c254ff", hot: "#f9ddff" },
    chitin: { deep: "#125e38", body: "#6ef69b", hot: "#e8ffe4" },
    glass: { deep: "#323d86", body: "#7ccef6", hot: "#f3f8ff" },
    nerve: { deep: "#83184f", body: "#ff5caa", hot: "#fff0f7" },
    silk: { deep: "#40158a", body: "#b46aff", hot: "#f8dcff" },
    bone: { deep: "#724535", body: "#edc88a", hot: "#fff3d5" },
    magma: { deep: "#8a2818", body: "#ff8f29", hot: "#fff0ae" },
    water: { deep: "#0e608c", body: "#53cee9", hot: "#dcffff" },
    plasma: { deep: "#1d50aa", body: "#64c6ff", hot: "#f6fdff" },
    spore: { deep: "#365b17", body: "#91d644", hot: "#edffbd" },
  };

  function light(ctx, x, y, radius, color, alpha) {
    if (radius < 1) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color);
    g.addColorStop(.22, color + "84");
    g.addColorStop(1, "transparent");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function beamGlow(color) {
    if (glows.has(color)) return glows.get(color);
    const tile = document.createElement("canvas");
    tile.width = 128;
    tile.height = 40;
    const ctx = tile.getContext("2d");
    const cross = ctx.createLinearGradient(0, 0, 0, tile.height);
    cross.addColorStop(0, "transparent");
    cross.addColorStop(.25, color + "13");
    cross.addColorStop(.50, color + "b3");
    cross.addColorStop(.75, color + "13");
    cross.addColorStop(1, "transparent");
    ctx.fillStyle = cross;
    ctx.fillRect(0, 0, tile.width, tile.height);
    const tips = ctx.createLinearGradient(0, 0, tile.width, 0);
    tips.addColorStop(0, "transparent");
    tips.addColorStop(.065, "#ffffff");
    tips.addColorStop(.935, "#ffffff");
    tips.addColorStop(1, "transparent");
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = tips;
    ctx.fillRect(0, 0, tile.width, tile.height);
    glows.set(color, tile);
    return tile;
  }

  function beam(ctx, line, time, alpha, style = "void", quiet = false) {
    const { x1, y1, x2, y2, width } = line;
    const dx = x2 - x1, dy = y2 - y1, length = Math.hypot(dx, dy);
    if (length < 2 || width < 1) return;
    const color = colors[style];
    const detail = quiet || visualQuality.id === "low" ? 2 : 5;
    const steps = Math.min(55, Math.max(16, Math.ceil(length / 24)));
    const w = width * .5;
    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.globalAlpha = alpha * .68;
    ctx.drawImage(beamGlow(color.deep), 0, -width * 1.18, length, width * 2.36);
    const ends = ctx.createLinearGradient(0, 0, length, 0);
    ends.addColorStop(0, "transparent");
    ends.addColorStop(.034, color.body);
    ends.addColorStop(.24, color.deep);
    ends.addColorStop(.76, color.deep);
    ends.addColorStop(.967, color.body);
    ends.addColorStop(1, "transparent");
    const taper = t => Math.min(1, t * 17, (1 - t) * 17);
    for (let i = 0; i < detail; i++) {
      const phase = i * tau / detail;
      ctx.beginPath();
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const helix = t * Math.min(70, length * .065) - time * 10 + phase;
        const bend = Math.sin(helix) * (i ? .58 : .17) + Math.sin(helix * 1.7 + i) * .13;
        const y = w * bend * taper(t);
        if (j === 0) ctx.moveTo(0, y); else ctx.lineTo(t * length, y);
      }
      ctx.strokeStyle = ends;
      ctx.globalAlpha = alpha * (i ? .08 : .18);
      ctx.lineWidth = w * (i ? .61 : 1.20);
      ctx.stroke();
      ctx.lineWidth = Math.max(.8, w * (i ? .23 : .42));
      ctx.globalAlpha = alpha * (i ? .66 : .91);
      ctx.strokeStyle = color.body;
      ctx.stroke();
      ctx.strokeStyle = color.hot;
      ctx.globalAlpha = alpha * (i ? .16 : .92);
      ctx.lineWidth = Math.max(.55, w * (i ? .07 : .17));
      ctx.stroke();
    }
    if (!quiet) {
      ctx.beginPath();
      for (let i = 0; i < detail * 5; i++) {
        const t = (i * .618034 + time * (.28 + i % 4 * .034)) % 1;
        const y = Math.sin(t * 44 + i * 2.394 - time * 6) * w * (.35 + i % 4 * .21) * taper(t);
        ctx.moveTo(t * length, y);
        ctx.lineTo(t * length + Math.min(length * (1 - t), 2 + i % 6), y * .96);
      }
      ctx.globalAlpha = alpha * .71;
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
    ctx.restore();
  }

  function ring(ctx, shape, time, alpha, style, quiet) {
    const { x, y, radius, innerRadius } = shape;
    if (!(radius > 2)) return;
    const inner = Math.max(0, innerRadius ?? radius * .76);
    const color = colors[style];
    const span = Math.max(1, radius - inner);
    const count = quiet || visualQuality.id === "low" ? 7 : 15;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    const haze = ctx.createRadialGradient(x, y, Math.min(inner, radius - .5), x, y, radius);
    haze.addColorStop(0, inner > 0 ? "transparent" : color.deep + "23");
    haze.addColorStop(.53, color.body + "5a");
    haze.addColorStop(.83, color.body + "37");
    haze.addColorStop(1, "transparent");
    ctx.fillStyle = haze;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, tau);
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const angle = i * 2.39996 + time * (i % 2 ? .61 : -.34);
      const reach = .2 + (i * 7 % 13) * .041;
      for (let j = 0; j <= 8; j++) {
        const a = angle + reach * j / 8;
        const r = inner + span * (.25 + .46 * (i * .618034 % 1) + .13 * Math.sin(a * 9 - time * 5));
        if (j === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
    }
    ctx.strokeStyle = color.body;
    ctx.globalAlpha = alpha * .2;
    ctx.lineWidth = Math.min(14, span * .38);
    ctx.stroke();
    ctx.strokeStyle = color.hot;
    ctx.globalAlpha = alpha * .75;
    ctx.lineWidth = 1.35;
    ctx.stroke();
    ctx.restore();
  }

  function accretionWake(ctx, x, y, radius, time, quiet) {
    if (!(radius > 4)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-.21);
    ctx.globalCompositeOperation = "lighter";
    const lens = ctx.createRadialGradient(0, 0, radius * .66, 0, 0, radius * 1.12);
    lens.addColorStop(0, "transparent");
    lens.addColorStop(.55, "#542d9a47");
    lens.addColorStop(.76, "#a369ff32");
    lens.addColorStop(1, "transparent");
    ctx.fillStyle = lens;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.12, 0, tau);
    ctx.fill();
    ctx.lineCap = "round";
    ctx.strokeStyle = "#be93ff";
    ctx.globalAlpha = .33;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.06, radius * .75, 0, .25, 2.53);
    ctx.moveTo(Math.cos(3.15) * radius * 1.04, Math.sin(3.15) * radius * .8);
    ctx.ellipse(0, 0, radius * 1.04, radius * .8, 0, 3.15, 4.98);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < (quiet ? 14 : 38); i++) {
      const travel = (i * .61803 + time * (.29 + i % 8 * .017)) % 1;
      const r = radius * (1.14 - travel * .7);
      const a = i * 2.39996 + travel * 4.3 + time * 1.08;
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r * .83);
      ctx.lineTo(Math.cos(a - .045) * (r + radius * .025), Math.sin(a - .045) * (r + radius * .025) * .83);
    }
    ctx.strokeStyle = "#d1b6ff";
    ctx.globalAlpha = .65;
    ctx.stroke();
    ctx.restore();
  }

  function fusionNode(ctx, node, role, time, alpha, quiet, number) {
    if (!node || node.health <= 0) return;
    const { x, y, radius: r } = node;
    const style = role === "lance" ? "lance" : role === "burst" ? "burst" : "siphon";
    const color = colors[style];
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    light(ctx, x, y, r * 1.78, color.deep, alpha * .48);
    light(ctx, x, y, r * .93, color.body, alpha * .92);
    light(ctx, x - r * .11, y - r * .08, r * .46, color.hot, alpha);
    if (style === "siphon") {
      ring(ctx, { x, y, radius: r * 1.43, innerRadius: r * .47 }, time * -1.5, alpha, style, quiet);
      ctx.beginPath();
      for (let arm = 0; arm < 3; arm++) {
        for (let i = 0; i <= 18; i++) {
          const t = i / 18, a = arm * tau / 3 + t * 3.2 - time * 3.3;
          const rad = r * (.19 + t * 1.22);
          if (i === 0) ctx.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
          else ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
        }
      }
      ctx.strokeStyle = color.body;
      ctx.globalAlpha = alpha * .79;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else if (style === "lance") {
      const g = ctx.createLinearGradient(x - r * 2.3, y, x + r * .58, y);
      g.addColorStop(0, "transparent");
      g.addColorStop(.56, color.body + "90");
      g.addColorStop(.82, color.hot);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(x - r * 2.3, y);
      ctx.quadraticCurveTo(x - r * .44, y - r * .8, x + r * .58, y);
      ctx.quadraticCurveTo(x - r * .44, y + r * .8, x - r * 2.3, y);
      ctx.fill();
    } else {
      ctx.strokeStyle = color.body;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = alpha * .86;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i * tau / 8 + time * .42;
        const rad = r * (1.2 + .27 * Math.sin(i * 3.4 + time * 9));
        ctx.moveTo(x + Math.cos(a) * r * .4, y + Math.sin(a) * r * .4);
        ctx.lineTo(x + Math.cos(a + .15) * r * .8, y + Math.sin(a + .15) * r * .8);
        ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = alpha;
    if (number) {
      ctx.fillStyle = "#170c25";
      ctx.font = `bold ${Math.max(10, r * .55)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(number), x, y);
    }
    if (node.maxHealth > 0 && node.health < node.maxHealth) {
      ctx.strokeStyle = color.hot;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.13, -Math.PI / 2, -Math.PI / 2 + tau * node.health / node.maxHealth);
      ctx.stroke();
    }
    ctx.restore();
  }

  function tether(ctx, node, index, boss, time, quiet) {
    if (!boss || !node || node.health <= 0) return;
    const x = boss.x - boss.width * .31, y = boss.y + (index - 1) * boss.height * .19;
    const color = colors[["siphon", "lance", "burst"][index]];
    const bend = Math.sin(time * 3 + index * 1.7) * node.radius * .45;
    const dx = x - node.x;
    ctx.save();
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(node.x, node.y);
    ctx.bezierCurveTo(node.x + dx * .34, node.y - bend, x - dx * .25, y + bend, x, y);
    ctx.strokeStyle = "#27183c";
    ctx.lineWidth = node.radius * .58;
    ctx.stroke();
    const g = ctx.createLinearGradient(node.x, node.y, x, y);
    g.addColorStop(0, color.body);
    g.addColorStop(.34, color.deep);
    g.addColorStop(1, color.body + "30");
    ctx.strokeStyle = g;
    ctx.lineWidth = node.radius * .29;
    ctx.stroke();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = color.hot;
    ctx.globalAlpha = .68;
    ctx.setLineDash([3, 10 + node.radius * .36]);
    ctx.lineDashOffset = quiet ? 0 : -time * 60;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  function column(ctx, rect, time, alpha, quiet, style = "void", crestAt) {
    const { x, y, width, height } = rect;
    if (height < 4 || width < 3) return;
    const cx = x + width / 2;
    const color = colors[style];
    if (!crestAt) {
      ctx.save();
      ctx.translate(cx, y);
      ctx.rotate(Math.PI / 2);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * .80;
      ctx.drawImage(beamGlow(color.deep), 0, -width * .61, height, width * 1.22);
      ctx.restore();
    }
    if (crestAt) {
      const middle = y + height / 2;
      const veil = ctx.createLinearGradient(crestAt(middle) - width, 0, crestAt(middle) + width, 0);
      veil.addColorStop(0, "transparent");
      veil.addColorStop(.35, color.deep + "66");
      veil.addColorStop(.62, color.body + "45");
      veil.addColorStop(1, "transparent");
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = veil;
      ctx.fillRect(crestAt(middle) - width, y, width * 2, height);
      ctx.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const fade = ctx.createLinearGradient(0, y, 0, y + height);
    fade.addColorStop(0, "transparent");
    fade.addColorStop(.08, color.body);
    fade.addColorStop(.91, color.body);
    fade.addColorStop(1, "transparent");
    const steps = Math.min(58, Math.max(20, Math.ceil(height / 12)));
    for (let strand = 0; strand < (quiet ? 3 : 7); strand++) {
      ctx.beginPath();
      const offset = (strand % 2 === 0 ? 1 : -1) * (strand + 1) / 8;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, yy = y + t * height;
        const widthAt = width * Math.sin(Math.PI * t) ** .4;
        const curl = Math.sin(t * 11 + strand * .83 - time * 5) * .18 +
          Math.sin(t * 31 - time * 12 + strand) * .061;
        const xx = (crestAt ? crestAt(yy) : cx) + widthAt * (offset * .44 + curl);
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.strokeStyle = fade;
      ctx.lineCap = "round";
      ctx.lineWidth = width * (strand ? .24 : .77);
      ctx.globalAlpha = alpha * (strand ? .08 : .14);
      ctx.stroke();
      ctx.lineWidth = Math.max(1.2, width * (strand ? .028 : .09));
      ctx.globalAlpha = alpha * (strand ? .53 : .93);
      ctx.stroke();
    }
    ctx.beginPath();
    for (let i = 0; i < (quiet ? 12 : visualQuality.id === "low" ? 24 : 40); i++) {
      const t = (i * .618034 + time * (.35 + i % 5 * .064)) % 1;
      const direction = i % 2 ? -1 : 1;
      const taper = Math.min(1, t * 11, (1 - t) * 11);
      const py = y + height * t;
      const px = (crestAt ? crestAt(py) : cx) + direction * width * (.25 + i % 7 * .036) * taper;
      const size = .8 + i % 4 * .37;
      ctx.moveTo(px + size, py);
      ctx.arc(px, py, size, 0, tau);
    }
    ctx.fillStyle = color.body;
    ctx.globalAlpha = alpha * .76;
    ctx.fill();
    ctx.restore();
  }

  function safeGuide(ctx, x, y, width, height, active, time = 0, direction = -1) {
    if (width < 1 || height < 1) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const count = width < 720 ? 3 : 5;
    const edgeWidth = width / count;
    const glow = Math.min(24, height * .17);
    for (const side of [0, 1]) {
      const edge = y + side * height;
      const inward = side ? -1 : 1;
      for (let i = 0; i < count; i++) {
        const start = x + (i + .12) * edgeWidth;
        const end = start + edgeWidth * (.58 + .18 * Math.sin(i * 2.3 + side));
        const middle = (start + end) * .5;
        const rail = ctx.createLinearGradient(start, 0, end, 0);
        rail.addColorStop(0, "transparent");
        rail.addColorStop(.43, active ? "#87e9d894" : "#a6ffe2c4");
        rail.addColorStop(.72, "#60b8ae6f");
        rail.addColorStop(1, "transparent");
        ctx.strokeStyle = rail;
        ctx.fillStyle = rail;
        ctx.lineWidth = active ? 1 : 1.25;
        ctx.beginPath();
        ctx.moveTo(start, edge);
        ctx.lineTo(end, edge);
        ctx.stroke();
        ctx.globalAlpha = active ? .25 : .3;
        ctx.beginPath();
        ctx.moveTo(start, edge);
        ctx.quadraticCurveTo(middle, edge + inward * glow, end, edge);
        ctx.fill();
        ctx.globalAlpha = 1;
        const sweep = time * .42 + i / count;
        const phase = sweep - Math.floor(sweep);
        const mx = middle + direction * phase * edgeWidth * .16;
        const my = edge + inward * Math.min(10, height * .16);
        const alpha = (.55 + .35 * Math.sin(phase * Math.PI)) * (active ? .76 : 1);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "#c6fff0";
        ctx.beginPath();
        ctx.moveTo(mx - direction * 6, my - 3);
        ctx.lineTo(mx, my);
        ctx.lineTo(mx - direction * 6, my + 3);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }
  function safeContact(ctx, geometry, center, height, color, time) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const side of [-1, 1]) {
      const edge = center + side * height / 2;
      function spill(x, width) {
        // Contact light and sparks stay on the danger side of the passage.
        const w = Math.max(7, Math.min(74, width));
        const depth = Math.min(24, w * .64);
        const haze = ctx.createRadialGradient(x, edge + side * 2, 0, x, edge + side * 2, w);
        haze.addColorStop(0, color + "db");
        haze.addColorStop(.34, color + "58");
        haze.addColorStop(1, "transparent");
        ctx.globalAlpha = .58;
        ctx.fillStyle = haze;
        ctx.beginPath();
        ctx.moveTo(x - w, edge);
        ctx.quadraticCurveTo(x + Math.sin(time * 9) * w * .32, edge + side * depth, x + w, edge);
        ctx.quadraticCurveTo(x + w * .32, edge + side * .85, x - w, edge);
        ctx.fill();
      }
      for (const rect of geometry.rects) {
        if (edge >= rect.y - 1 && edge <= rect.y + rect.height + 1) {
          const count = Math.min(5, Math.max(1, Math.ceil(rect.width / 140)));
          for (let i = 0; i < count; i++) {
            spill(rect.x + rect.width * ((i + .5) / count), rect.width * .37 / count);
          }
        }
      }
      for (const line of geometry.segments) {
        const dy = line.y2 - line.y1;
        if (Math.abs(dy) < 1) continue;
        const t = (edge - line.y1) / dy;
        if (t >= 0 && t <= 1) spill(line.x1 + (line.x2 - line.x1) * t, line.width * 1.64);
      }
      for (const circle of geometry.circles) {
        const dy = edge - circle.y;
        if (Math.abs(dy) >= circle.radius) continue;
        const spread = Math.sqrt(circle.radius ** 2 - dy ** 2);
        spill(circle.x - spread, 19);
        spill(circle.x + spread, 19);
      }
    }
    ctx.restore();
  }

  return Object.freeze({ beam, ring, accretionWake, fusionNode, tether, column, safeGuide, safeContact });
})();
