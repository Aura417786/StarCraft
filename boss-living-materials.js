"use strict";

// All distances passed to this renderer come from the attack's actual contact
// geometry. Smoke, refracted light and ejected fragments carry no collision.
const BossLivingMaterials = (() => {
  const keys = ["water", "bone", "magma", "silk", "chitin", "glass", "plasma", "spore", "void", "nerve", "fusion"];
  const tau = Math.PI * 2;
  const texture = new Image();
  texture.decoding = "async";
  texture.src = "assets/vfx/nextgen/living-organs.webp";
  const clamp01 = value => Math.max(0, Math.min(1, value));
  const samples = Array.from({ length: 48 }, (_, i) => ({
    a: (i * .61803398875 + .17) % 1, b: (i * .754877666 + .31) % 1, c: (i * .414213562 + .25) % 1
  }));

  function organ(ctx, kind, x, y, w, h, angle = 0) {
    const i = keys.indexOf(kind) - 1;
    if (i < 0 || !texture.naturalWidth || !(w > 0 && h > 0)) return false;
    const cell = texture.naturalWidth / 5;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.drawImage(texture, i % 5 * cell, Math.floor(i / 5) * cell, cell, cell, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  }

  function stroke(ctx, color, width) {
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(.55, width); ctx.stroke();
  }
  function shine(ctx, x, y, r, color, alpha) {
    if (r < 1 || alpha < .01) return;
    ctx.save(); ctx.globalAlpha *= alpha;
    ctx.drawImage(pressureArtGlow(color), x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  function curve(ctx, len, height, cycles, phase, bias = 0) {
    const n = Math.max(5, Math.min(56, Math.ceil(len / 15)));
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const y = Math.sin(Math.PI * u) * (bias + height * Math.sin(cycles * u + phase));
      if (i) ctx.lineTo(u * len, y); else ctx.moveTo(0, y);
    }
  }
  function taperedBody(ctx, len, r, dark, light, f, time) {
    const n = Math.max(8, Math.min(48, Math.ceil(len / 20)));
    const paint = ctx.createLinearGradient(0, -r, 0, r);
    paint.addColorStop(0, dark); paint.addColorStop(.29, light); paint.addColorStop(.48, dark); paint.addColorStop(1, light);
    ctx.beginPath();
    for (const sign of [-1, 1]) {
      for (let j = 0; j <= n; j++) {
        const u = (sign < 0 ? j : n - j) / n;
        const envelope = Math.pow(Math.max(0, Math.sin(Math.PI * u)), .47);
        const y = r * envelope * (sign * (.66 + .21 * Math.sin(u * f + sign * 1.1 + time)) + .19 * Math.sin(u * 7 - time));
        if (!j && sign < 0) ctx.moveTo(0, y); else ctx.lineTo(u * len, y);
      }
    }
    ctx.closePath(); ctx.fillStyle = paint; ctx.fill();
  }

  function rib(ctx, l, r, t) {
    taperedBody(ctx, l, r * .76, "#423531", "#e5c99c", 13, t * .6);
    const count = Math.min(12, Math.max(2, Math.floor(l / Math.max(36, r * 4))));
    for (let i = 0; i < count; i++) {
      const u = (i + .28) / count, w = Math.min(l / count * 1.2, r * (5 + samples[i].b * 2));
      BossCreatureVfx.bone(ctx, u * l, r * .15, w, r * (1.2 + samples[i].a), -.18 - samples[i].c * .5, i % 4, i % 2 === 0);
    }
  }
  function basalt(ctx, l, r, t) {
    NextgenVfx.drawMagmaFissure(ctx, { x1: 0, y1: 0, x2: l, y2: 0, width: r * 1.9 }, signatureMaterials.magma, t, .94);
    const n = Math.min(9, Math.ceil(l / 60));
    for (let i = 0; i < n; i++) {
      const s = samples[i], k = (t * .8 + s.b) % 1;
      const x = l * s.a - k * r, y = (k * k - k) * r * (4 + s.c * 3);
      ctx.fillStyle = k < .52 ? "#ffd078" : "#965536";
      ctx.beginPath(); ctx.ellipse(x, y, Math.max(1, r * .13), Math.max(.7, r * .09), k * 3, 0, tau); ctx.fill();
    }
  }
  function silk(ctx, l, r, t) {
    for (let i = 0; i < 7; i++) {
      const s = samples[i];
      curve(ctx, l, r * (.12 + s.a * .32), 4 + s.c * 6, t * 2 + i, (i - 3) * r * .27);
      stroke(ctx, i === 3 ? "#f5e1ff" : i % 2 ? "#c78ee1cc" : "#78558ca8", i === 3 ? 1.55 : .8);
    }
    const bead = l * ((t * .39 + .1) % 1);
    shine(ctx, bead, Math.sin(4 * bead / l + t * 2) * r * .2, Math.min(15, r), "#ecd5ff", .8);
  }
  function claw(ctx, l, r, t) {
    taperedBody(ctx, l, r * .94, "#172f28", "#719e65", 16, t);
    const n = Math.min(12, Math.max(2, Math.floor(l / Math.max(40, r * 3.5))));
    const cell=texture.naturalWidth/5;
    // The dorsal surface is curved keratin with changing grain and scratches.
    // Sample it inside the tendon silhouette, between the base of each barb.
    if(cell){
      ctx.save();ctx.clip();
      for(let j=0;j<4;j++){
        const x=l*j*.25, sw=cell*(.19+.035*samples[j].a);
        ctx.drawImage(texture,cell*(3.26+.18*samples[j].b),cell*(.29+.035*samples[j].c),
          sw,cell*.085,x-1,-r*.96,l*.25+2,r*1.94);
      }
      ctx.restore();
    }
    for (let i=0;i<n;i++) {
      const s=samples[i], u=(i+.36+.29*s.c)/n, side=i%2?1:-1;
      const x=l*u, y=side*r*.14, reach=Math.min(l/n*.91,r*(2+s.a));
      ctx.save();ctx.translate(x,y);ctx.scale(1,side);
      ctx.rotate(-.21+.15*Math.sin(t*2+4*u));
      ctx.beginPath();ctx.moveTo(-r*.69,r*.04);
      ctx.bezierCurveTo(-r*.17,-r*.47,reach*.26,-r*.81,reach,-r*(.81+.23*s.b));
      ctx.quadraticCurveTo(reach*.46,-r*.37,reach*.22,r*.16);
      ctx.quadraticCurveTo(r*.04,r*.42,-r*.69,r*.04);ctx.closePath();
      const horn=ctx.createLinearGradient(0,-r,0,r*.4);
      horn.addColorStop(0,"#cacfaa");horn.addColorStop(.28,"#747c50");
      horn.addColorStop(.56,"#3c5839");horn.addColorStop(.83,"#283729");horn.addColorStop(1,"#918954");
      ctx.fillStyle=horn;ctx.fill();
      if(cell){ctx.clip();ctx.globalAlpha*=.64;
        ctx.drawImage(texture,cell*(3.27+s.a*.16),cell*(.32+s.b*.05),cell*.18,cell*.12,-r*.7,-r*1.05,reach+r*.8,r*1.55);}
      ctx.restore();
    }
    organ(ctx,"chitin",l*.09,-r*.06,Math.min(l*.23,r*7.2),r*2.6,-.19);
    curve(ctx,l,r*.21,8.4,t*1.5);stroke(ctx,"#a3bb6390",Math.min(1.7,r*.095));
  }
  function refraction(ctx, l, r, t) {
    const bands = ["#9a7bffb0", "#96bcffa9", "#84f2edbf", "#fff9dc"];
    for (let i = 0; i < bands.length; i++) {
      curve(ctx, l, r * .14, 8.8, t * 2 + i * .7, r * (i - 1.7) * .42);
      stroke(ctx, bands[i], i === 3 ? 1.45 : Math.max(.8, r * .17));
    }
    const u = .16 + .68 * (.5 + .5 * Math.sin(t * 2));
    sparkle(ctx, l * u, 0, Math.max(4, r * 1.2), "#c0f8ff");
  }
  function sparkle(ctx, x, y, r, color) {
    shine(ctx, x, y, r * 2, color, .65);
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.quadraticCurveTo(x, y - 1, x, y - r * .72);
    ctx.quadraticCurveTo(x + 1, y, x + r, y); ctx.quadraticCurveTo(x, y + 1, x, y + r * .72);
    ctx.quadraticCurveTo(x - 1, y, x - r, y); ctx.fillStyle = color; ctx.fill();
  }
  function discharge(ctx, l, r, t) {
    const n = Math.min(56, Math.max(5, Math.ceil(l / 15)));
    ctx.beginPath(); ctx.moveTo(0, 0);
    for (let i = 1; i <= n; i++) {
      const u = i / n, wave = Math.sin(Math.PI * u) * r;
      const y = wave * (.58 * Math.sin(i * 2.43 + t * 17) + .28 * Math.sin(i * 5.71 - t * 12));
      ctx.lineTo(u * l, y);
      if (i % 5 === 2) {
        const side = i % 2 ? -1 : 1;
        ctx.lineTo(u*l - 8, y + wave * side * .71); ctx.lineTo(u*l - 19, y + wave * side * 1.24);
        ctx.moveTo(u*l, y);
      }
    }
    stroke(ctx, "#335fff77", Math.max(3, r * .61)); stroke(ctx, "#7bcaff", 2.1); stroke(ctx, "#ecffff", .8);
  }
  function hyphae(ctx, l, r, t) {
    curve(ctx, l, r * .43, 7, t * .7); stroke(ctx, "#6f843ecc", 2.4);
    const n = Math.min(12, Math.max(2, Math.ceil(l / 55)));
    for (let i = 0; i < n; i++) {
      const s = samples[i], u = (i + .42) / n, span = r * (1.4 + .46 * Math.sin(t + i));
      const x = l * u, y = Math.sin(Math.PI * u) * r * Math.sin(7 * u + t * .7) * .43;
      NextgenVfx.drawSporePod(ctx, {x, y, radius: span}, t + i, .83, Math.max(2, span * .36));
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 6, y + span, x + r * s.c, y + span * (i % 2 ? -1.2 : 1.2));
      stroke(ctx, "#b0c767a6", .8);
    }
  }
  function shear(ctx, l, r, t) {
    const cap=Math.min(l*.18,r*2.6);
    ctx.save();ctx.beginPath();ctx.moveTo(0,0);
    ctx.bezierCurveTo(cap*.3,-r*.12,cap*.58,-r,cap,-r);
    ctx.lineTo(l-cap,-r);ctx.quadraticCurveTo(l-cap*.35,-r,l,0);
    ctx.quadraticCurveTo(l-cap*.35,r,l-cap,r);ctx.lineTo(cap,r);
    ctx.bezierCurveTo(cap*.58,r,cap*.3,r*.12,0,0);ctx.closePath();ctx.clip();
    if(!NextgenVfx.drawShear(ctx,l,r,t,ctx.globalAlpha*.95)){
      taperedBody(ctx,l,r,"#231632","#a65ab9",17,t);
      curve(ctx,l,r*.58,8,t);stroke(ctx,"#dd94ea",Math.max(1,r*.14));
    }
    ctx.restore();
  }
  function axon(ctx, l, r, t) {
    curve(ctx, l, r * .35, 8, t); stroke(ctx, "#6c174bb3", Math.max(2, r * .78)); stroke(ctx, "#ee80a8", Math.max(1, r * .18));
    const n = Math.min(13, Math.max(2, Math.ceil(l / 46)));
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      const u = i/n, x = l*u, y = Math.sin(Math.PI*u)*r*.35*Math.sin(8*u+t);
      const side = i % 2 ? 1 : -1, sx = Math.min(28,r*2.3), sy = side*r*(.64+samples[i].a);
      ctx.moveTo(x,y);ctx.quadraticCurveTo(x - sx*.36,y + sy*.2,x - sx,y + sy);
      ctx.moveTo(x - sx*.63,y + sy*.55);ctx.lineTo(x - sx*.54,y + sy*1.12);
    }
    stroke(ctx,"#ed9cbea5",1);
    const u = (t * .73) % 1;
    shine(ctx, l*u, Math.sin(Math.PI*u)*r*.35*Math.sin(8*u+t), r*1.3, "#ff8ecf", .95);
  }
  function fusion(ctx, l, r, t) {
    shear(ctx, l, r * .85, t * .68);
    for (let i = 0; i < 2; i++) {
      curve(ctx, l, r * .82, 11.2, -t * 4 + i * Math.PI);
      stroke(ctx, i ? "#bd70f4cc" : "#ffca86", i ? 2.3 : 1.15);
    }
    sparkle(ctx, l * ((t * .48) % 1), 0, r * .85, "#ffe0b3");
  }
  const rays = {bone:rib, magma:basalt, silk, chitin:claw, glass:refraction, plasma:discharge, spore:hyphae, void:shear, nerve:axon, fusion};

  function ray(ctx, kind, x1, y1, x2, y2, r, age, active, phase, quiet) {
    const paint = rays[kind];
    const l = Math.hypot(x2 - x1, y2 - y1);
    if (!paint || !(l > .1 && r > 0)) return false;
    const t = quiet ? .37 : age;
    ctx.save(); ctx.translate(x1, y1); ctx.rotate(Math.atan2(y2 - y1, x2 - x1));
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (!active) {
      const m = signatureMaterials[kind], pulse = quiet ? .8 : .65 + .23 * Math.sin(age * 6);
      ctx.globalAlpha *= .48 + phase * .43;
      // Light scatters along the future strike; its centre and both half-widths
      // remain readable without enclosing the arena in a polygon.
      const g = ctx.createLinearGradient(0,-r,0,r);
      g.addColorStop(0,m.rim+"00");g.addColorStop(.26,m.rim+"45");g.addColorStop(.5,m.rim+"b0");
      g.addColorStop(.74,m.rim+"45");g.addColorStop(1,m.rim+"00");
      const cap = Math.min(l * .12, r * 2);
      ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(0,0);
      ctx.bezierCurveTo(cap*.25,-r*.28,cap*.43,-r,cap,-r);
      ctx.lineTo(l-cap,-r);ctx.bezierCurveTo(l-cap*.43,-r,l-cap*.25,-r*.28,l,0);
      ctx.bezierCurveTo(l-cap*.25,r*.28,l-cap*.43,r,l-cap,r);
      ctx.lineTo(cap,r);ctx.bezierCurveTo(cap*.43,r,cap*.25,r*.28,0,0);
      ctx.fill();
      curve(ctx,l,r*.13,6,t);stroke(ctx,m.spark,1);
      for (let i = 0; i < 2; i++) shine(ctx,(.13 + .50*i + phase*.22)*l,0,Math.min(22,r)*pulse,m.rim,.61);
    } else {
      paint(ctx, l, r, t);
    }
    ctx.restore();
    return true;
  }
  return Object.freeze({keys, organ, ray, shine, sparkle});
})();
