"use strict";

const BossFinalFormArt = (() => {
  const { keys, organ, ray, shine, sparkle } = BossLivingMaterials;
  const tau = 2 * Math.PI;

  // Keep the inner lip at the simulation's safe boundary. The creature grows
  // into the danger side; its skin, vapour and chips dissolve far from the lip.
  function banks(ctx, kind, gap, spread, t, active, p, quiet, target) {
    const size = viewport.width, alpha = active ? .94 : .40 + .33 * p;
    const skin = signatureMaterials[kind];
    for (const side of [-1, 1]) {
      const lip = gap.center + side * (gap.half + spread);
      const space = side < 0 ? lip : viewport.height-lip;
      if (space <= 0) continue;
      const depth = Math.min(space + 10, Math.max(53,viewport.height*.22));
      if (kind === "chitin") {
        ElementalArmoredVfx.jawBand(ctx, { x: 0, y: side < 0 ? lip - depth : lip,
          width: size, height: depth }, side, p, quiet, target, active);
        continue;
      }
      ctx.save(); ctx.translate(0,lip); ctx.scale(1,side); ctx.globalAlpha *= alpha;
      // Finger-like tongues and mist meet the same gap at different angles.
      // Use a low, irregular lip even when the safe lane spans the screen.
      const n = quiet ? 32 : 64;
      const ridge = u => depth * (.05 + .033*Math.sin(u*27+side+t*.6) + .016*Math.sin(u*76-t) + .012*Math.sin(u*137));
      const membrane = ctx.createLinearGradient(0,0,0,depth);
      membrane.addColorStop(0,skin.rim+"30");membrane.addColorStop(.22,skin.mid+"43");
      membrane.addColorStop(.55,skin.dark+"34");membrane.addColorStop(1,skin.mid+"00");
      ctx.fillStyle=membrane;ctx.beginPath();
      for(let i=0;i<=n;i++){const u=i/n;if(i)ctx.lineTo(u*size,ridge(u));else ctx.moveTo(0,ridge(u));}
      ctx.lineTo(size,depth);ctx.lineTo(0,depth);ctx.closePath();ctx.fill();
      if(kind==="magma") {
        // One continuous fault, with separate pressure vents rising through it.
        const offset=side>0?.13:.31;
        NextgenVfx.drawMagmaFissure(ctx,{x1:-depth*.35,y1:depth*.45,x2:size+depth*.28,y2:depth*.34,width:depth*.83},skin,t,.93);
        for(let j=0;j<4;j++){
          const u=(offset+j*.214+.075*Math.sin(j*3.6+side))%1;
          const radius=depth*(.12+.155*(.5+.5*Math.sin(j*3.7+side)));
          const breath=.74+.22*Math.sin(t*3+j*2+side);
          if(active)NextgenVfx.drawEruption(ctx,{x:size*u,y:depth*.29,radius:radius*breath},skin,t+j*.41,.88);
          shine(ctx,size*u,ridge(u),radius*1.8,"#ff843b",.48*breath);
        }
      } else {
        ray(ctx,"fusion",0,depth*.22,size,depth*.11,Math.max(3,depth*.14),t,active,p,quiet);
        for(let j=0;j<3;j++)organ(ctx,"fusion",size*(.17+.35*j),depth*.54,depth,depth,-.5+.37*j);
      }
      ctx.restore();
    }
  }

  function rim(ctx, kind, x, y, radius, half, age, active, p, quiet) {
    const m=signatureMaterials[kind], r=Math.max(2,radius), n=quiet?48:82;
    ctx.save();ctx.translate(x,y);ctx.lineJoin="round";ctx.lineCap="round";
    if (!active) ctx.globalAlpha*=.46+p*.30;
    ctx.beginPath();
    for(let i=0;i<=n;i++){
      const a=i/n*tau;
      const rr=r+half*(kind==="plasma"?.47*Math.sin(31*a+age*11)*Math.sin(13*a-age*8):.27*Math.sin(9*a-age*2));
      if(i)ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);else ctx.moveTo(rr,0);
    }
    ctx.closePath();ctx.strokeStyle=m.mid+"80";ctx.lineWidth=Math.max(1,half*1.67);ctx.stroke();
    ctx.strokeStyle=m.spark;ctx.lineWidth=active?1.65:1;ctx.stroke();
    if(kind==="plasma"){
      for(let j=0;j<7;j++){
        const a=j*tau/7+age*.16, reach=half*(1.9+.55*Math.sin(age*10+j*3));
        ray(ctx,kind,Math.cos(a)*r,Math.sin(a)*r,Math.cos(a+.12)*(r+reach),Math.sin(a+.12)*(r+reach),half*.64,age+j,active,p,quiet);
      }
    }else if(kind==="spore"){
      for(let j=0;j<9;j++){
        const a=j*tau/9+age*.12;
        NextgenVfx.drawSporeCloud(ctx,{x:Math.cos(a)*r,y:Math.sin(a)*r,radius:Math.max(4,half*1.55)},age+j,.67);
      }
    }else if(kind==="fusion"){
      for(let j=0;j<3;j++){
        const a=age*.4+j*tau/3;
        sparkle(ctx,Math.cos(a)*r,Math.sin(a)*r,half*1.5,j?"#bd8efd":"#ffd897");
      }
    }
    ctx.restore();
  }

  function burst(ctx, kind, x, y, r, t, active, p, quiet) {
    const m=signatureMaterials[kind], swell=active?.76+.24*Math.sin(p*Math.PI):.32+.45*p;
    ctx.save();
    shine(ctx,x,y,r*1.32,m.rim,active?.51:.21+p*.17);
    if(kind==="void"){
      NextgenVfx.drawHorizon(ctx,x,y,r*(active?2.05:1.12+p*.72),t,active?.98:.74,quiet);
    }else if(kind==="spore"){
      NextgenVfx.drawSporeCloud(ctx,{x,y,radius:r*(active?1:.55+.32*p)},t,active?.98:.55);
      organ(ctx,kind,x,y,r*1.44*swell,r*1.31*swell,-.15+t*.12);
    }else if(kind==="magma"){
      organ(ctx,kind,x,y,r*1.48*swell,r*1.48*swell,-.27);
      if(active)NextgenVfx.drawEruption(ctx,{x,y,radius:r},m,t,.91);
    }else if(kind==="bone"){
      for(let i=0;i<7;i++){
        const a=i*tau/7+.18*p;
        BossCreatureVfx.bone(ctx,x+Math.cos(a)*r*.19,y+Math.sin(a)*r*.19,r*swell*.88,r*.24,a,i%4,i%2===0);
      }
    }else if(kind==="silk"){
      for(let i=0;i<6;i++){
        const a=i*tau/6+.23;
        ray(ctx,kind,x+Math.cos(a)*r,y+Math.sin(a)*r,x,y,Math.max(1,r*.089),t+i,active,p,quiet);
      }
      organ(ctx,kind,x,y,r*1.22*swell,r*.94*swell,-.42+t*.07);
    }else if(kind==="glass"){
      for(let i=0;i<5;i++){
        const a=i*tau/5+.18*t, reach=r*(active?.8:.42+.38*p);
        const u=x+Math.cos(a)*reach,v=y+Math.sin(a)*reach;
        ray(ctx,kind,x,y,u,v,Math.max(2,r*.09),t,active,p,quiet);
        organ(ctx,kind,u,v,r*.33,r*.43,a);
      }
    }else if(kind==="nerve"){
      for(let i=0;i<6;i++){
        const a=i*tau/6+t*.13;
        ray(ctx,kind,x,y,x+r*Math.cos(a),y+r*Math.sin(a),r*.11,t+i*.1,active,p,quiet);
      }
      organ(ctx,kind,x,y,r*1.16*swell,r*1.16*swell,t*.2);
    }else{
      organ(ctx,kind,x,y,r*1.35*swell,r*1.35*swell,t*.17);
      if(kind==="fusion")for(let i=0;i<3;i++){
        const a=i*tau/3+t;
        sparkle(ctx,x+r*.64*Math.cos(a),y+r*.64*Math.sin(a),r*.19,"#edba91");
      }
    }
    // A broken rim indicates the true radius; sparse flecks keep corners clear.
    ctx.lineWidth=active?1.1:1.55;ctx.strokeStyle=m.rim+(active?"86":"d9");ctx.beginPath();
    for(let i=0;i<7;i++){const a=i*tau/7+.06*t;ctx.moveTo(x+r*Math.cos(a),y+r*Math.sin(a));ctx.arc(x,y,r,a,a+.45);}
    ctx.stroke();ctx.restore();
  }

  function hazard(ctx,target,h,active,p,quiet){
    if(!target || target.type===0 || h.type==="resonance")return false;
    const kind=keys[target.type],t=quiet?.37:h.age;
    if(h.type==="wire" || h.type==="seam"){
      const seam=h.type==="seam";
      const pose = seam ? null : finaleWirePose(h);
      if (kind === "bone") {
        ElementalArmoredVfx.needlePath(ctx, { x1: seam ? h.x : pose.ax, y1: seam ? 0 : pose.ay,
          x2: seam ? h.x : pose.bx, y2: seam ? viewport.height : pose.by, width: h.width },
          active, p, quiet, h.node ?? 0);
        return true;
      }
      return ray(ctx,kind,seam?h.x:pose.ax,seam?0:pose.ay,seam?h.x:pose.bx,seam?viewport.height:pose.by,h.width*.5,t,active,p,quiet);
    }
    if(h.type==="blast"||h.type==="well"){burst(ctx,kind,h.x,h.y,h.radius,t,active,p,quiet);return true;}
    if(h.type==="ring"){rim(ctx,kind,h.x,h.y,h.radius*(active?p:1),h.width,t,active,p,quiet);return true;}
    if(h.type==="vent"||h.type==="pincer"){
      const spread=h.type==="pincer"&&active?viewport.height*.43*(1-p):0;
      banks(ctx,kind,h.gap,spread,t,active,p,quiet,target);return true;
    }
    if(h.type==="tide"){
      const x=y=>finaleTideX(h,y,active?h.age:h.warning),width=h.width*.42;
      // Keep the moving discontinuity and gap identical to the swept hit test.
      for(const [a,b] of [[0,h.gap.center-h.gap.half],[h.gap.center+h.gap.half,viewport.height]]){
        if(b<=a)continue;
        const n=Math.min(10,Math.max(2,Math.ceil((b-a)/65)));
        for(let i=0;i<n;i++){
          const ya=a+(b-a)*i/n,yb=a+(b-a)*(i+1)/n;
          ray(ctx,kind,x(ya),ya,x(yb),yb,width,t+i*.14,active,p,quiet);
        }
      }
      return true;
    }
    return false;
  }
  function shell(ctx,target,w,h,quiet){
    const type=target.type;
    if(type!==4 && type!==5)return false;
    const f=target.finale,t=quiet?.35:f.age;
    const open=bossFinaleCoreOpen(f);
    if(type===4){
      // The two hinge centres stay attached while the opposing pincers open.
      const hinge=.12+.10*Math.sin(t*2.2)+(open?.24:0);
      ctx.save();ctx.translate(w*.11,0);ctx.scale(-1,1);
      const visible=organ(ctx,"chitin",0,-h*.17,w*1.40,h*1.09,-hinge);
      ctx.scale(1,-1);organ(ctx,"chitin",0,-h*.17,w*1.40,h*1.09,-hinge);
      ctx.restore();
      if(visible)shine(ctx,w*.29,0,h*.20,open?"#f3d68a":"#91a768",open?.92:.35);
      return visible;
    }
    const turn=.17*Math.sin(t*2.3),width=w*(.82+.13*Math.cos(t*1.7));
    const visible=organ(ctx,"glass",w*.04,0,width,h*1.06,-.47+turn);
    if(visible)sparkle(ctx,-w*.15,-h*.11,h*(.07+.035*Math.cos(4*t)),"#e0faff");
    return visible;
  }

  function node(ctx,target,g,number,marked,quiet){
    const kind=keys[target.type],t=quiet?.35:target.finale.age;
    if(!kind||kind==="water")return false;
    const r=g.radius;
    const swing = kind==="bone" ? .13*Math.sin(3*t+number) : kind==="nerve" ? .08*Math.sin(6*t+number) : .24*Math.sin(2*t+number*2);
    const size=r*(2.35+.10*Math.sin(3*t+number));
    if(!organ(ctx,kind,g.x,g.y,size,size,number*.74+swing))return false;
    if(marked) {
      const m=signatureMaterials[kind];
      shine(ctx,g.x-r*.22,g.y-r*.18,r*.65,m.rim,.44+.14*Math.cos(4*t));
      if(kind==="glass" || kind==="nerve")sparkle(ctx,g.x,g.y-r*1.24,r*.26,m.spark);
    }
    return true;
  }
  return Object.freeze({hazard,shell,node});
})();
