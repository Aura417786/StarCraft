/* Three physical effects scoped to the tide, storm and spore encounters. */
const ElementalFluidVfx = (() => {
  const TAU = Math.PI * 2;
  const water = { low: "#052436", mid: "#117c98", edge: "#71daf7", core: "#e5fdff" };
  const storm = { low: "#141645", mid: "#3b64e1", edge: "#82a9ff", core: "#f3faff" };
  const spore = { low: "#122616", mid: "#50822a", edge: "#a8d76b", core: "#e9ffac" };
  const clamp01 = value => Math.max(0, Math.min(1, value));
  const ease = v => { const t = clamp01(v); return t * t * (3 - 2 * t); };
  const tail = p => 1 - .66 * ease((p - .84) / .16);
  const hash = n => { const v = Math.sin(n * 78.233 + .173) * 43758.5453; return v - Math.floor(v); };
  const frac = v => v - Math.floor(v);
  let plates;
  let breaker;
  function loadPlate(file,onDecoded) {
    const image=new Image();
    image.decoding="async";image.src=file;
    if(typeof image.decode==="function") image.decode().then(()=>{
      // Rasterize the full source ahead of the first multi-strip crop. Keep
      // the original Image as the compatible fallback for older browsers.
      if(typeof createImageBitmap==="function")return createImageBitmap(image).then(onDecoded);
    }).catch(()=>{});
    return image;
  }
  function warmWater() {
    breaker ||= loadPlate("assets/vfx/nextgen/tidal-breaker.webp",surface=>{breaker=surface;});
    plates ||= loadPlate("assets/vfx/elemental-fluid-materials.webp",surface=>{plates=surface;});
  }

  // Four authored poses run from swell through barrel, overturn and washout.
  // Their motion-compensated inbetweens are baked; the browser only blends
  // adjacent atlas cells. Each front rolls on its own clock.
  function drawBreakingMass(ctx, crest, start, end, width, direction, time, strength, quiet) {
    if (!breaker) warmWater();
    if (breaker.complete===false || !breaker.width) return;
    const span = end-start;
    if (span < 8) return;
    if (span < Math.max(34,width*.35)) {
      // A shallow splinter of ocean throws a puff of foam; a whole breaker
      // compressed into these few pixels would read like a horizontal line.
      const x=crest((start+end)*.5), mist=pressureArtMist("#a2dcd5");
      const w=Math.min(width*1.3,span*4.1);
      ctx.save();ctx.globalAlpha*=strength*.86;
      ctx.drawImage(mist,x-w*.52,start,w,span);ctx.restore();return;
    }
    const lower = (start+end)*.5 >= viewport.height*.5;
    const phase=quiet ? .31 : frac(time*.38 + (direction<0 ? .12 : .59) + (lower ? 0 : .27));
    const heave=Math.sin(phase*TAU), overturn=Math.cos(phase*TAU);
    const h = Math.min(span, Math.max(width*2.66,span*.94))*(.98+.018*heave);
    const w = Math.min(viewport.width*.47, Math.max(width*2.55,h*1.24),h*1.61);
    const centerY = lower ? start+h*.50 : end-h*.50;
    const sw=breaker.width/4, sh=breaker.height/4;
    const cursor=phase*16, index=Math.floor(cursor), next=(index+1)%16, blend=cursor-index;
    const dx=(-.49+.017*overturn)*w, dy=-h*.5;
    ctx.save(); ctx.translate(crest(centerY),centerY);
    ctx.scale(direction<0 ? 1 : -1, lower ? 1 : -1);
    const opacity=ctx.globalAlpha*strength;
    ctx.globalAlpha=opacity;
    ctx.drawImage(breaker,(index%4)*sw,Math.floor(index/4)*sh,sw,sh,dx,dy,w,h);
    if(!quiet && blend>.035){
      ctx.globalAlpha=opacity*blend;
      ctx.drawImage(breaker,(next%4)*sw,Math.floor(next/4)*sh,sw,sh,dx,dy,w,h);
    }
    ctx.restore();
  }

  function materialPlate(ctx, name, index, x, y, width, height) {
    if (!plates) plates=loadPlate("assets/vfx/elemental-fluid-materials.webp",surface=>{plates=surface;});
    if (plates.complete===false || plates.width !== 768) {
      const material = name === "spore" ? spore : water;
      const light = ctx.createRadialGradient(x + width * .44, y + height * .43, 0,
        x + width / 2, y + height / 2, width * .48);
      light.addColorStop(0, material.mid + "b8");
      light.addColorStop(.52, material.low + "9d");
      light.addColorStop(1, material.low + "00");
      ctx.fillStyle = light; ctx.fillRect(x, y, width, height); return;
    }
    const row = name === "water" ? 0 : name === "spore" ? 1 : 2;
    ctx.drawImage(plates, index * 256, row * 256, 256, 256, x, y, width, height);
  }

  function diskClip(ctx, x, y, radius, inner = 0) {
    ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU);
    if (inner > 0) { ctx.moveTo(x + inner, y); ctx.arc(x, y, inner, 0, TAU, true); }
    ctx.clip("evenodd");
  }

  function foamGradient(ctx,tint,start,end) {
    const fade=ctx.createLinearGradient(0,start,0,end);
    fade.addColorStop(0,tint+"18");fade.addColorStop(.12,tint);
    fade.addColorStop(.88,tint);fade.addColorStop(1,tint+"15");
    return fade;
  }

  // Each section uses the same normalized end caps. Store their exact sampled
  // shape once, and reuse crest positions between the clip and the six bands.
  const ribbonProfiles = new Map();
  function ribbonProfile(detail) {
    let profile = ribbonProfiles.get(detail);
    if (!profile) {
      const near = new Float64Array(detail + 1), far = new Float64Array(detail + 1);
      for (let i = 0; i <= detail; i++) {
        const tip = Math.max(0, Math.sin(Math.PI * (i / detail)));
        near[i] = .08 + .92 * Math.pow(tip, .29);
        far[i] = .07 + .93 * Math.pow(tip, .34);
      }
      profile = { near, far, centers: new Float64Array(detail + 1) };
      ribbonProfiles.set(detail, profile);
    }
    return profile;
  }

  function clipRibbon(ctx, crest, start, end, width, detail) {
    const half = width / 2, height = end - start;
    const { near, far, centers } = ribbonProfile(detail);
    ctx.beginPath();
    for (let i = 0; i <= detail; i++) {
      const y = start + height * (i / detail);
      centers[i] = crest(y);
      const x = centers[i] + half * near[i];
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let i = detail; i >= 0; i--) {
      const y = start + height * (i / detail);
      ctx.lineTo(centers[i] - half * far[i], y);
    }
    ctx.closePath(); ctx.clip();
    return centers;
  }

  function refractScene(ctx,x,y,width,height,time,quiet) {
    if(quiet || visualQuality.id!=="high" || !(width>4 && height>4))return;
    const matrix=ctx.getTransform();
    if(matrix.a<=0||matrix.d<=0||Math.abs(matrix.b)+Math.abs(matrix.c)>.01)return;
    const sx=x*matrix.a+matrix.e,sy=y*matrix.d+matrix.f;
    if(sx+width*matrix.a<=0||sy+height*matrix.d<=0||sx>=ctx.canvas.width||sy>=ctx.canvas.height)return;
    // A seal may contain several overlapping pieces of water. All of them
    // bend the same scene underneath; repeatedly sampling the canvas after
    // painting a band recursively bent that band and flushed GPU work.
    const refractionScene=NextgenVfx.refractionSource(ctx);
    ctx.save();ctx.globalAlpha*=.59;
    for(let i=0;i<6;i++){
      const dy=height*i/6,roll=Math.sin(time*2.1+i*.94);
      const shear=Math.min(7,width*.067)*roll;
      ctx.drawImage(refractionScene,sx,sy+dy*matrix.d,width*matrix.a,height*matrix.d/6,
        x+shear,y+dy,width*1.035,height/6+.6);
    }
    ctx.restore();
  }

  const lipNoise=Array.from({length:22},(_,i)=>hash(i+32));
  const spraySeeds=Array.from({length:40},(_,i)=>({
    phase:hash(i+21),speed:.07+.12*hash(i+1),offset:.40-hash(i+28)*.44,
    radius:.55+hash(i+120)**2*2.1,aspect:1.15+hash(i)*.82
  }));
  const foamPatches=Array.from({length:8},(_,i)=>({
    width:1.1+hash(i+81)*.31,height:1.7+hash(i+11),offset:.19+.15*hash(i)
  }));
  const lipGradients=new WeakMap();
  let breakingLipShape;
  function breakingLip(ctx,crest,start,end,width,dir,age,strength,quiet) {
    if(!breakingLipShape){
      breakingLipShape=new Path2D();
      breakingLipShape.moveTo(-.84,-.48);
      breakingLipShape.bezierCurveTo(.23,-1,.69,-.58,.54,-.13);
      breakingLipShape.bezierCurveTo(.63,.23,.19,.23,.10,.08);
      breakingLipShape.quadraticCurveTo(.48,-.26,-.86,.68);
      breakingLipShape.closePath();
    }
    let deck=lipGradients.get(ctx);
    if(!deck){
      deck=ctx.createLinearGradient(0,-1,0,.61);
      deck.addColorStop(0,"#def7ee");deck.addColorStop(.23,"#83cbcc");deck.addColorStop(.49,"#267a96");deck.addColorStop(1,"#0c435e");
      lipGradients.set(ctx,deck);
    }
    const rows=quiet?9:22,span=end-start;
    for(let i=0;i<rows;i++){
      const n=lipNoise[i], t=quiet?.4:frac(age*(.47+.15*n)+n);
      const y=start+(i+.45)*span/rows, scale=Math.min(width*.41,span/rows*1.1)*(.57+.5*n);
      const x=crest(y)+dir*width*(.24+.055*Math.sin(age*3+i));
      ctx.save();ctx.translate(x,y);ctx.scale(dir*scale,scale);
      ctx.fillStyle=deck;ctx.globalAlpha=strength*(.49+.21*n);
      ctx.fill(breakingLipShape);
      if(!quiet){
        ctx.strokeStyle="#dffbf1";ctx.lineWidth=.95/scale;ctx.globalAlpha=strength*(1-t)*.87;
        const sx=.31+t*.62,sy=-.32-.84*t+.96*t*t;
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+.1,sy-.13+.12*t);ctx.stroke();
      }
      ctx.restore();
    }
  }

  function waterRibbon(ctx, crest, start, end, width, direction, time, strength, quiet) {
    if (!(width > 1 && end > start)) return;
    const outerStart=start, outerEnd=end, thickness=width, span=end-start;
    if (breaker && breaker.width && breaker.complete!==false) {
      if(span<Math.max(34,width*.35)){
        drawBreakingMass(ctx,crest,start,end,width,direction,time,strength,quiet);
        return;
      }
      // The refracting sheet lives in the belly. The overhanging lip, spray
      // and foot own the outer silhouette, including when the wave overturns.
      start+=span*.21; end-=span*.17; width*=.70;
    }
    const detail = quiet ? 12 : 24, height = end - start;
    const center = crest((start + end) / 2);
    ctx.save(); ctx.globalAlpha *= strength;
    const centers=clipRibbon(ctx,crest,start,end,width,detail);
    refractScene(ctx,center-width*1.05,start,width*2.1,height,time,quiet);
    const body = ctx.createLinearGradient(center - width * direction * .49, 0,
      center + width * direction * .48, 0);
    body.addColorStop(0, "#062a2b00"); body.addColorStop(.17, "#104b5437");
    body.addColorStop(.41, "#073b439e"); body.addColorStop(.66, "#166d70de");
    body.addColorStop(.84, "#58bbae61"); body.addColorStop(1, "#b5efe503");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(crest(start),start);
    ctx.bezierCurveTo(center+width*1.05,start+height*.05,center+width*.57,end-height*.17,crest(end),end);
    ctx.bezierCurveTo(center-width*.86,end-height*.04,center-width*.94,start+height*.14,crest(start),start);
    ctx.fill();

    // Unequal patches of reflected turbulence travel down the anchored face.
    const flow = quiet ? 0 : time;
    const columns = quiet ? 4 : 8;
    ctx.globalAlpha *= .85;
    for (let i = 0; i < columns; i++) {
      const y = start + (i + .18 + .25 * Math.sin(flow * 2.7 + i * 2.1)) * height / columns;
      const patch=foamPatches[i];
      const w = width*patch.width, h = height/columns*patch.height;
      const x = crest(y) + width*direction*patch.offset;
      materialPlate(ctx, "water", i % 3, x - w * .55, y - h * .55, w, h);
    }
    ctx.globalAlpha = strength;
    const coreFade=foamGradient(ctx,water.core,start,end),edgeFade=foamGradient(ctx,water.edge,start,end);
    for (let band = 0; band < (quiet ? 3 : 6); band++) {
      const amplitude = width * (.037 + .011 * band);
      const bias = direction * width * (.29 - .099 * band);
      ctx.strokeStyle = band<2 ? coreFade : edgeFade;
      ctx.globalAlpha = strength * (band === 0 ? .61 : .30 - .031 * band);
      ctx.lineWidth = Math.max(.8, width * (band === 0 ? .019 : .012));
      ctx.beginPath();
      for (let i = 0; i <= detail; i++) {
        const y = start + height * i / detail;
        const x = centers[i] + bias + amplitude * Math.sin(y * .065 - flow * (10 + band) + band * 2.4);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    if (!quiet) {
      const count = visualQuality.id === "high" ? 40 : 16;
      ctx.fillStyle = "#d0f9f3";
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const s = spraySeeds[i], v=frac(s.phase+time*s.speed);
        const y = start+height*v, x=crest(y)+direction*width*s.offset;
        const r=s.radius;
        ctx.moveTo(x+r,y);ctx.ellipse(x,y,r,r*s.aspect,0,0,TAU);
      }
      ctx.globalAlpha = strength * .72; ctx.fill();
    }
    breakingLip(ctx,crest,start,end,width,direction,quiet?0:time,strength,quiet);
    ctx.restore();
    drawBreakingMass(ctx,crest,outerStart,outerEnd,thickness,direction,time,strength,quiet);
  }

  function whirlpool(ctx, x, y, radius, core, time, spin, strength, quiet) {
    if (radius <= 1) return;
    ctx.save(); diskClip(ctx, x, y, radius);
    refractScene(ctx,x-radius,y-radius,radius*2,radius*2,time*spin,quiet);
    const depth = ctx.createRadialGradient(x,y,0,x,y,radius);
    depth.addColorStop(0, "#020911"); depth.addColorStop(.25, "#062331");
    depth.addColorStop(.72, "#167989ab"); depth.addColorStop(1, "#18455604");
    ctx.fillStyle = depth; ctx.globalAlpha = strength;
    ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
    const phase = quiet ? 0 : time * 2.06 * spin;
    for (let arm = 0; arm < (quiet ? 4 : 6); arm++) {
      const a = arm * TAU / (quiet ? 4 : 6) + phase;
      ctx.beginPath();
      for (let i = 0; i <= 33; i++) {
        const d = i / 33, r = radius * (.12 + .865 * d);
        const theta = a + spin * (2.75 * d - .39 * Math.sin(d * Math.PI * 1.2));
        const sx = x + r * Math.cos(theta), sy = y + r * Math.sin(theta);
        if (i === 0) ctx.moveTo(sx,sy); else ctx.lineTo(sx,sy);
      }
      ctx.strokeStyle = water.mid + "9c"; ctx.lineWidth = radius * .13; ctx.stroke();
      ctx.strokeStyle = arm % 3 ? water.edge + "ae" : water.core + "95";
      ctx.lineWidth = Math.max(1.2, radius * .018); ctx.stroke();
    }
    const gleam = Math.max(1, core);
    ctx.strokeStyle = water.core; ctx.globalAlpha = strength * .72; ctx.lineWidth = Math.max(1.25, radius * .013);
    ctx.beginPath(); ctx.arc(x,y,gleam,0,TAU); ctx.stroke();
    ctx.restore();
  }

  function arcPath(ctx, x, y, radius, spread, start, finish, jitter, steps) {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = start + (finish - start) * i / steps;
      const r = radius + spread * (hash(i + jitter) - .5);
      const sx = x + Math.cos(a) * r, sy = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(sx,sy); else ctx.lineTo(sx,sy);
    }
  }

  function thunderRing(ctx, x, y, radius, inner, time, strength, quiet) {
    if (radius <= 1) return;
    ctx.save(); diskClip(ctx, x, y, radius, inner);
    const middle = (radius + inner) * .5, width = Math.max(1,radius-inner);
    ctx.lineWidth = width; ctx.strokeStyle = "#4241e755"; ctx.globalAlpha = strength;
    ctx.beginPath(); ctx.arc(x,y,middle,0,TAU); ctx.stroke();
    const tick = quiet ? 3 : Math.floor(time * 18);
    const steps = quiet ? 72 : Math.min(236,Math.max(116,Math.ceil(middle*.61)));
    arcPath(ctx,x,y,middle,width*.55,0,TAU,tick,steps);
    ctx.strokeStyle = storm.edge + "b5"; ctx.lineWidth = width * .43; ctx.stroke();
    ctx.strokeStyle = storm.core; ctx.lineWidth = Math.max(1.05,width * .095); ctx.stroke();
    const count = quiet ? 3 : 11;
    for (let i = 0; i < count; i++) {
      const a = i * TAU / count + (quiet ? .4 : time * 1.83);
      const branch = middle + (hash(i+20)-.5)*width*.40;
      arcPath(ctx,x,y,branch,width*.63,a,a+.11+hash(i+42)*.24,tick + i * 30,12);
      ctx.globalAlpha = strength * (.55 + hash(i+9) * .37);
      ctx.strokeStyle = "#d4f2ff"; ctx.lineWidth = Math.max(1.7,width * .16); ctx.stroke();
    }
    ctx.restore();
  }

  function thunderLine(ctx, { x1,y1,x2,y2,width }, time, strength, quiet) {
    const dx = x2 - x1, dy = y2 - y1, length = Math.hypot(dx,dy);
    if (!(length > .1 && width > .4)) return;
    ctx.save(); ctx.translate(x1,y1); ctx.rotate(Math.atan2(dy,dx));
    // Side streamers grow out of a travelling discharge, dimmer than the
    // damaging leader. Successive branches invert across the electric field.
    const phase = quiet ? .33 : frac(time*2.4+x1*.002+y1*.001);
    const drift = (quiet ? .86 : .65+.35*Math.sin(Math.PI*phase));
    const reach = Math.min(length*.62,viewport.height*.54);
    ctx.globalAlpha=strength*.76*drift;
    BossSpellMatter.draw(ctx,"streamer",length*(.12+.45*phase),0,reach,width*(4.2+3.1*drift),
      0,false,!quiet && Math.floor(time*2.4)%2===1);
    ctx.beginPath(); ctx.moveTo(0,0);
    ctx.quadraticCurveTo(length*.3,-width*.59,length*.64,-width*.45);
    ctx.lineTo(length,0);ctx.quadraticCurveTo(length*.48,width*.76,0,0);ctx.clip();
    const discharge = ctx.createLinearGradient(0,-width/2,0,width/2);
    discharge.addColorStop(0,"#124bed00"); discharge.addColorStop(.23,"#2e52e87a");
    discharge.addColorStop(.48,"#5c88f7bd"); discharge.addColorStop(1,"#6b65ff00");
    ctx.fillStyle = discharge; ctx.globalAlpha = strength;
    const cap = Math.min(length*.22,width*.95);
    ctx.beginPath();ctx.moveTo(0,0);
    ctx.quadraticCurveTo(cap*.35,-width*.5,cap,-width*.5);ctx.lineTo(length-cap,-width*.5);
    ctx.quadraticCurveTo(length-cap*.35,-width*.5,length,0);
    ctx.quadraticCurveTo(length-cap*.35,width*.5,length-cap,width*.5);ctx.lineTo(cap,width*.5);
    ctx.quadraticCurveTo(cap*.35,width*.5,0,0);ctx.fill();
    const steps = Math.min(100, Math.max(10, Math.ceil(length / 12)));
    const tick = quiet ? 7 : Math.floor(time * 22);
    for (let branch = 0; branch < (quiet ? 2 : 4); branch++) {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const x = length * i / steps;
        const envelope = Math.min(1, x / cap, (length-x) / cap);
        const y = (hash(tick * 119 + i + branch * 27) - .5) * width * (.38 + branch * .085) * envelope;
        if (i === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.lineWidth = Math.max(.75, width * .092 - branch * .23);
      ctx.strokeStyle = branch === 0 ? storm.core : storm.edge;
      ctx.globalAlpha = strength * (branch === 0 ? .98 : .55 - branch * .10); ctx.stroke();
    }
    ctx.restore();
  }

  function sporeCloud(ctx, x, y, radius, inner, time, strength, quiet, origin) {
    if (!(radius > 1)) return;
    ctx.save();
    // Put each tuft inside its pressure radius. An opaque circular clip
    // would slice large billows into identical disks as the spores expand.
    if (inner > 0) {
      ctx.beginPath();
      ctx.arc(x,y,radius*1.09,0,TAU);
      ctx.arc(x,y,inner,0,TAU);
      ctx.clip("evenodd");
    }
    const clock = quiet ? .4 : time;
    // The ragged membrane opens into asymmetric lobes. When the mature ring
    // forms, its hollow centre stays clear; the remaining torn sacs orbit it.
    const inflate = .5+.5*Math.sin(clock*2.3+x*.017);
    const lobes = inner > 0 ? 4 : 1;
    for (let lobe=0;lobe<lobes;lobe++) {
      const a=lobe*TAU/lobes+.28*Math.sin(clock*.8)+x*.008;
      const r=inner>0 ? (radius+inner)*.5 : 0;
      const span=inner>0 ? Math.max(2,radius-inner)*1.65 : radius*1.83;
      ctx.globalAlpha=strength*(inner>0 ? .78 : .91);
      BossSpellMatter.draw(ctx,"pod",x+r*Math.cos(a),y+r*Math.sin(a),
        span*(1+.04*inflate),span*(.91+.10*inflate),inner>0 ? a+.79 : .61*Math.sin(x*.119+y*.047)+.17*Math.sin(clock*.8+x),
        Math.sin(x*.1+y*.7)<0);
    }
    const size = quiet ? 4 : 7;
    for (let i = 0; i < size; i++) {
      const a = i * TAU / size + clock * (.40 - .07 * i);
      const orbit = inner > 0 ? (radius+inner)*.5 : radius*(.18+hash(i+9)*.42);
      const w = inner>0 ? (radius-inner)*.80 : radius*(.44+hash(i+77)*.40);
      const px = x + Math.cos(a) * orbit, py = y + Math.sin(a) * orbit;
      ctx.globalAlpha = strength * (.15 + .13 * (1 + Math.sin(clock * 3.5 + i * 1.67)));
      ctx.save(); ctx.translate(px,py); ctx.rotate(a * .57 + hash(i));
      materialPlate(ctx,"spore",i % 3,-w*.5,-w*.5,w,w); ctx.restore();
    }
    if (origin) {
      const w = Math.max(12, radius * .73);
      ctx.globalAlpha = strength;
      materialPlate(ctx,"pod",0,x-w*.5,y-w*.5,w,w);
    }
    ctx.globalAlpha = strength * .60; ctx.fillStyle = spore.core;
    ctx.beginPath();
    const moteCount = quiet ? 14 : visualQuality.id === "high" ? 51 : 26;
    for (let i = 0; i < moteCount; i++) {
      const a = (hash(i + 300) + clock * (.047 + hash(i + 8) * .08)) * TAU;
      const d = inner + (radius - inner) * (.13 + .86 * frac(hash(i+82) + clock * .03));
      const px = x + d * Math.cos(a), py = y + d * Math.sin(a);
      const r = .6 + 2.1 * hash(i + 1) ** 2;
      ctx.moveTo(px + r,py); ctx.ellipse(px,py,r,r * .94,a,0,TAU);
    }
    ctx.fill(); ctx.restore();
  }

  function materialTide(ctx,hazard,progress,time,quiet) {
    const gap = alienTideGap(hazard,progress);
    const crest = py => alienTideX(hazard,py,progress);
    const width = hazard.thickness, strength = tail(progress);
    const top = Math.max(0,gap-hazard.gapSize*.5), bottom = Math.min(viewport.height,gap+hazard.gapSize*.5);
    for (const [start,end] of [[0,top],[bottom,viewport.height]]) {
      if (!(end > start && width > 1)) continue;
      if (hazard.material === "water") {
        waterRibbon(ctx,crest,start,end,width,hazard.direction,time,strength,quiet);
        continue;
      }
      ctx.save(); clipRibbon(ctx,crest,start,end,width,24);
      if (hazard.material === "plasma") {
        const steps = Math.max(3,Math.ceil((end-start)/63));
        for (let i=0; i<steps; i++) {
          const y1 = start+(end-start)*i/steps, y2 = start+(end-start)*(i+1)/steps;
          thunderLine(ctx,{x1:crest(y1),y1,x2:crest(y2),y2,width},time+i*.047,strength,quiet);
          if (i % 2 === 0) thunderRing(ctx,crest(y1),y1,width*.64,width*.52,time,strength*.53,quiet);
        }
      } else {
        const count = Math.max(3,Math.ceil((end-start)/(width*.74)));
        for (let i=0;i<count;i++) {
          const py = start+(end-start)*(i+.5)/count;
          sporeCloud(ctx,crest(py),py,width*.68,0,time+i*.22,strength,quiet,false);
        }
      }
      ctx.restore();
    }
    signatureGuide(ctx,gap,hazard.gapSize,true,hazard.direction,viewport.width,time);
  }

  function waterLash(ctx,hazard,progress,time,quiet) {
    const fading = (1-progress) ** .72, half = hazard.thickness/2;
    if (!(hazard.right > 0 && half > 0)) return;
    ctx.save();
    ctx.beginPath();ctx.rect(0,hazard.y-half,hazard.right,half*2);ctx.clip();
    for (let pass=0;pass<4;pass++) {
      const hue = [water.low,water.mid,water.edge,water.core][pass];
      const roots = quiet ? 0 : Math.sin(progress*Math.PI*2+pass*.4)*half*.53;
      ctx.globalAlpha = fading * (.73 + pass*.055);
      ctx.lineWidth = Math.max(1.15,half*(1.37-pass*.41));ctx.strokeStyle=hue;
      ctx.beginPath(); ctx.moveTo(hazard.right,hazard.y);
      ctx.bezierCurveTo(hazard.right*.72,hazard.y-roots,hazard.right*.32,hazard.y+roots,0,hazard.y);
      ctx.stroke();
    }
    if (!quiet) {
      const strip = Math.max(14,half*2.1);
      for (let i=0;i<7;i++) {
        const x = hazard.right * frac(hash(i+73) - time * 3.4);
        materialPlate(ctx,"water",i%3,x-strip*.5,hazard.y-half,strip,half*2);
      }
    }
    ctx.restore();
  }

  function signature(ctx, hazard, { active, progress, quiet }) {
    const time = quiet ? 0 : hazard.age;
    const { kind, material, x, y, radius, thickness } = hazard;
    if (!active) return false; // Foreground preview keeps the canonical route marks.
    if (kind === "vortex" && material === "water") {
      whirlpool(ctx,x,y,radius,alienVortexCore(hazard,progress),time,hazard.spin || 1,tail(progress),quiet);
      return true;
    }
    if (kind === "tide" && ["water","plasma","spore"].includes(material)) {
      materialTide(ctx,hazard,progress,time,quiet);
      return true;
    }
    if (kind === "beam" && material === "water" && hazard.lash) {
      waterLash(ctx,hazard,progress,time,quiet);
      return true;
    }
    if (kind === "seam" && material === "water") {
      waterRibbon(ctx,() => x,0,viewport.height,thickness,-1,time,tail(progress),quiet);
      return true;
    }
    if (kind === "ring" && material === "plasma") {
      const mid = alienRingRadius(hazard,progress);
      thunderRing(ctx,x,y,mid+thickness/2,Math.max(0,mid-thickness/2),time,tail(progress),quiet);
      return true;
    }
    if (kind === "filament" && material === "plasma") {
      thunderLine(ctx,{ ...alienFilamentPose(hazard,progress), width: thickness },time,tail(progress),quiet);
      return true;
    }
    if (kind === "vortex" && material === "spore") {
      sporeCloud(ctx,x,y,radius,0,time,tail(progress),quiet,false);
      const core = alienVortexCore(hazard,progress);
      ctx.save(); ctx.strokeStyle=spore.edge; ctx.globalAlpha=.75; ctx.lineWidth=1.35;
      ctx.beginPath(); ctx.arc(x,y,core,0,TAU); ctx.stroke(); ctx.restore();
      return true;
    }
    if (kind === "ring" && material === "spore") {
      const mid = alienRingRadius(hazard,progress);
      sporeCloud(ctx,x,y,mid+thickness/2,Math.max(0,mid-thickness/2),time,tail(progress),quiet,false);
      return true;
    }
    return false;
  }

  function mechanic(ctx,hazard,{active,progress,quiet}) {
    const time = quiet ? 0 : hazard.age;
    if (!active) return false;
    if (hazard.kind === "tailConduit") {
      const node = hazard.nodes[0];
      if (node.health <= 0) return true;
      const head = tailPosition(hazard,progress), end = tailPosition(hazard,Math.max(0,progress-.18));
      thunderLine(ctx,{x1:end.x,y1:end.y,x2:head.x,y2:head.y,width:hazard.thickness*2},time,tail(progress),quiet);
      thunderRing(ctx,node.x,node.y,node.radius*.90,node.radius*.53,time,.89,quiet);
      return true;
    }
    if (hazard.kind === "sporeBlight") {
      sporeCloud(ctx,hazard.x,hazard.y,hazard.radius,0,time,progress <= .18 ? .41 : tail(progress),quiet,false);
      return true;
    }
    if (hazard.kind === "sporeNests") {
      for (const node of hazard.nodes) {
        if (node.health > 0) sporeCloud(ctx,node.x,node.y,node.radius,0,time,.91,quiet,true);
      }
      if (hazard.infection > 0) {
        ctx.save(); ctx.lineWidth=2.5; ctx.strokeStyle=spore.core;
        ctx.beginPath(); ctx.arc(player.x,player.y,player.height*.37,-Math.PI/2,-Math.PI/2+hazard.infection*TAU);
        ctx.stroke(); ctx.restore();
      }
      return true;
    }
    return false;
  }

  function ultimate(ctx,hazard,geometry,target,{active,quiet,alpha}) {
    if (!active) return false;
    const time = quiet ? 0 : hazard.age - hazard.warning;
    const p = geometry.progress, strength = alpha * tail(p);
    if (hazard.ultimateKind === "tideWalls") {
      for (const [i,r] of geometry.rects.entries()) {
        const direction = (i < 2 ? -1 : 1) * (hazard.owner === "player" ? -1 : 1);
        const crest = y => r.x + r.width * .5 + r.width * .09 * Math.sin(y * .046 - time * 9);
        waterRibbon(ctx,crest,r.y,r.y+r.height,r.width,direction,time,strength,quiet);
      }
      return true;
    }
    if (hazard.ultimateKind === "stormRing") {
      for (const c of geometry.circles) thunderRing(ctx,c.x,c.y,c.radius,c.innerRadius,time,strength,quiet);
      for (const link of geometry.segments) thunderLine(ctx,link,time,strength,quiet);
      return true;
    }
    if (hazard.ultimateKind === "sporeBloom") {
      for (const c of geometry.circles) sporeCloud(ctx,c.x,c.y,c.radius,c.innerRadius,time,strength,quiet,false);
      return true;
    }
    return false;
  }

  function charge(ctx,target,scene,{x,y,radius,charge:amount,time,quiet}) {
    if (scene.ultimateKind === "tideWalls") {
      whirlpool(ctx,x,y,radius*.59,radius*.16,time,-1,.37+amount*.51,quiet);
      return true;
    }
    if (scene.ultimateKind === "stormRing") {
      const r = radius * (.48 + amount * .16);
      thunderRing(ctx,x,y,r,r*.85,time,.38+amount*.53,quiet);
      for (let i = 0; i < 3; i++) {
        const a = i * TAU / 3 + (quiet ? 0 : time*.57);
        thunderLine(ctx,{x1:x+Math.cos(a)*r*.94,y1:y+Math.sin(a)*r*.94,x2:x,y2:y,width:r*.14},
          time,.36+amount*.57,quiet);
      }
      return true;
    }
    if (scene.ultimateKind === "sporeBloom") {
      const r = radius * (.38 + amount * .22);
      sporeCloud(ctx,x,y,r,0,time,.41+amount*.52,quiet,true);
      return true;
    }
    return false;
  }

  function aftershock(ctx,scene,{x,y,width,height,age,quiet}) {
    const p = clamp01(age / .70);
    const strength = (1-p) ** 1.65;
    const speed = quiet ? .29 : ease(p * 1.25);
    const front = x - speed * width;
    if (scene.ultimateKind === "tideWalls") {
      waterRibbon(ctx,py => front + Math.sin(py*.028+p*7)*height*.045,0,height,
        height*(.12+p*.12),-1,age,strength*.78,quiet);
      return true;
    }
    if (scene.ultimateKind === "stormRing") {
      const r = Math.max(5, height * (.11 + p * 1.18));
      thunderRing(ctx,x,y,r,r-Math.max(2,r*.044),age,strength,quiet);
      return true;
    }
    if (scene.ultimateKind === "sporeBloom") {
      for (let i = 0; i < 4; i++) {
        const centerY = height*(.13+i*.25);
        const gapDistance = Math.abs(centerY-scene.gapY)-scene.gapSize/2;
        const radius = Math.min(height*(.14+.13*p),scene.fullSeal ? height : gapDistance*.96);
        sporeCloud(ctx,front+i*width*.095,centerY,radius,0,age+i*.12,strength*.59,quiet,false);
      }
      return true;
    }
    return false;
  }
  return Object.freeze({ mechanic, signature, ultimate, charge, aftershock, waterRibbon, warmWater });
})();
