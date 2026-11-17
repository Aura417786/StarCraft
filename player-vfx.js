"use strict";

// Presentation only. All positions, extents and lifetimes come from the live
// ultimate/shield objects; no random calls, gameplay clocks or damage here.
const PlayerVfx = (() => {
  const tau = Math.PI * 2;
  const palette = {red:[255,77,47],blue:[71,183,249],yellow:[250,190,66]};
  const rgba=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const detail=()=>quietCombatMotion()?0:visualQuality.meshDetail;
  let crimsonMaterial;
  function plasmaTexture() {
    if(crimsonMaterial)return crimsonMaterial;
    const c=document.createElement('canvas');c.width=384;c.height=128;
    const paint=c.getContext('2d'),im=paint.createImageData(c.width,c.height);
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++) {
      const v=(y/c.height-.5)*2,warp=Math.sin(x*.026+v*4)*.15+Math.sin(x*.071-v*7)*.045;
      const fib=Math.sin(v*65+warp*28+Math.sin(x*.043)*2),fine=Math.sin(x*.29+y*.37)*Math.sin(x*.151-y*.73);
      const cloud=(Math.sin(x*.039+Math.sin(v*9))+Math.sin(x*.081-v*13)+2)/4;
      const heat=Math.pow(Math.max(0,1-Math.abs(v+warp)),2.6),n=(y*c.width+x)*4;
      im.data[n]=143+110*heat;im.data[n+1]=15+157*heat+17*cloud;im.data[n+2]=21+48*heat;
      const edge=Math.sin(Math.PI*x/c.width)**.5;
      im.data[n+3]=Math.round(edge*(15+76*cloud+45*Math.max(0,fib)+14*fine)*Math.max(0,1-v*v));
    }
    paint.putImageData(im,0,0);crimsonMaterial=c;return c;
  }
  function arc(ctx,x,y,rx,ry,a,b,color,width=1) {
    if(rx<=0||ry<=0)return;
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,a,b);ctx.stroke();
  }
  function charge(ctx,id,m,p,age,linked) {
    const color=palette[id], tier=detail(), t=tier?age:0, r=9+p*31;
    // The collector is behind the mouth. It collapses into a dense core at
    // release rather than flashing the full viewport.
    ctx.save();ctx.translate(m.x,m.y);
    if(id==='red') {
      for(let i=5;i>=0;i--) {
        const u=i/5,x=-24-i*7*(1-p),radius=r*(.5+u*.55);
        arc(ctx,x,0,radius*.25,radius,-Math.PI/2,Math.PI/2,rgba(color,.16+u*.38),2.4);
        arc(ctx,x,0,radius*.25,radius,Math.PI/2,Math.PI*1.5,rgba(color,.06+u*.14),1);
      }
      const core=ctx.createRadialGradient(0,0,0,0,0,r);
      core.addColorStop(0,'#ffe0ad');core.addColorStop(.14,'#ff9563');core.addColorStop(.42,'#df332a');core.addColorStop(.8,'#6e101980');core.addColorStop(1,'#6e101900');
      ctx.fillStyle=core;ctx.beginPath();ctx.ellipse(0,0,r*.58,r,0,0,tau);ctx.fill();
      for(let i=0;i<(tier?18:6);i++) {
        const a=i*2.39996,toward=(t*2.8+i*.131)%1,dist=r+44*(1-toward);
        ctx.strokeStyle=rgba(color,(.12+p*.34)*toward);ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(Math.cos(a)*dist,Math.sin(a)*dist*.75);ctx.quadraticCurveTo(Math.cos(a+.55)*dist*.7,Math.sin(a+.55)*dist*.55,Math.cos(a+1)*r*.25,Math.sin(a+1)*r*.25);ctx.stroke();
      }
    } else if(id==='blue') {
      for(let i=0;i<5;i++) {
        const a=i*tau/5+t*2,rad=r*(1.4-p*.6),x=Math.cos(a)*rad*.62,y=Math.sin(a)*rad;
        ctx.strokeStyle=rgba(color,.45+p*.45);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x*.57+Math.sin(i*4+t*33)*5,y*.4);ctx.lineTo(0,0);ctx.stroke();
        arc(ctx,x,y,4+p*3,3,0,tau,'#a7eaff',1.3);
      }
      arc(ctx,0,0,r*.53,r,-1.2,1.2,'#96e5ff',2);arc(ctx,0,0,r*.53,r,1.8,4.2,rgba(color,.36),1);
    } else {
      const opening=(1-p)*.85+.3;
      for(let i=0;i<6;i++) {
        const a=i*tau/6+t*.35,rad=r*opening,x=Math.cos(a)*rad*.45,y=Math.sin(a)*rad;
        ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle=rgba(color,.18+p*.26);ctx.strokeStyle=rgba(color,.75);ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(-4,-9);ctx.lineTo(4,-6);ctx.lineTo(6,7);ctx.lineTo(-4,9);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
      }
      arc(ctx,0,0,r*.6,r,0,tau,rgba(color,.24+p*.5),1.5);
    }
    if(linked)arc(ctx,0,0,r*.8,r*1.22,0,tau,'#c0efffa0',1.2);
    ctx.restore();
  }
  function crimson(ctx,shot,age) {
    const left=Math.max(shot.startX,shot.x-shot.length),right=Math.min(viewport.width+shot.radius,shot.x),r=shot.radius,y=shot.y;
    if(right<=left)return;
    const tier=detail(),time=tier?age:0,steps=tier?48:18,bands=tier?36:18;
    const rim=x=>Math.min(1,(x-left+2)/(r*1.7),(right-x+2)/(r*.9));
    // An opaque, normal-lit cylinder: longitudinal strips keep a shadowed
    // underside, hot orange mantle and small white core without additive wash.
    ctx.save();ctx.globalCompositeOperation='source-over';
    for(let b=0;b<bands;b++) {
      const a=-Math.PI/2+b*Math.PI/bands,aa=-Math.PI/2+(b+1)*Math.PI/bands;
      const normal=Math.cos((a+aa)/2),lit=Math.max(0,Math.cos((a+aa)/2+.6));
      ctx.fillStyle=`rgba(${Math.round(60+175*lit)},${Math.round(7+49*lit**2)},${Math.round(16+24*normal)},${.32+normal*.46})`;
      ctx.beginPath();
      for(let i=0;i<=steps;i++){const x=left+(right-left)*i/steps,w=1+.045*Math.sin(x*.043-time*42);ctx.lineTo(x,y+Math.sin(a)*r*rim(x)*w)}
      for(let i=steps;i>=0;i--){const x=left+(right-left)*i/steps,w=1+.045*Math.sin(x*.043-time*42);ctx.lineTo(x,y+Math.sin(aa)*r*rim(x)*w)}
      ctx.closePath();ctx.fill();
    }
    if(tier) {
      ctx.save();ctx.beginPath();
      for(let i=0;i<=steps;i++){const x=left+(right-left)*i/steps;ctx.lineTo(x,y-r*rim(x)*.97);}
      for(let i=steps;i>=0;i--){const x=left+(right-left)*i/steps;ctx.lineTo(x,y+r*rim(x)*.97);}
      ctx.closePath();ctx.clip();const mat=plasmaTexture(),span=384,offset=(time*630)%span;
      for(let x=left-span-offset;x<right;x+=span*.72)ctx.drawImage(mat,x,y-r,span,r*2);
      const core=ctx.createLinearGradient(0,y-r*.4,0,y+r*.4);
      core.addColorStop(0,'#ff592100');core.addColorStop(.36,'#ff9d4a6b');core.addColorStop(.50,'#ffe7b9bc');core.addColorStop(.59,'#ffb3648c');core.addColorStop(1,'#d52b1200');
      ctx.fillStyle=core;ctx.fillRect(left,y-r*.4,right-left,r*.8);ctx.restore();
    }
    ctx.globalCompositeOperation='screen';
    for(let strand=0;strand<(tier?4:2);strand++) {
      ctx.strokeStyle=strand===0?'#ffd6a579':'#ffad6745';ctx.lineWidth=strand===0?1.4:.8;ctx.beginPath();
      for(let i=0;i<=steps;i++) {const x=left+(right-left)*i/steps,phase=x*.013-time*19+strand*1.15;ctx.lineTo(x,y+r*rim(x)*(.31*Math.sin(phase)+.055*Math.sin(phase*3.7)));}ctx.stroke();
    }
    const count=Math.min(5,Math.ceil((right-left)/190));
    for(let i=0;i<count;i++) {const u=(i/count+time*1.6)%1,x=left+(right-left)*u;arc(ctx,x,y,r*.26,r*rim(x),-1.4,1.4,'#ffc27b32',1);}
    arc(ctx,right-r*.12,y,r*.29,r*.92,-1.4,1.4,'#ffe1adcc',2.4);
    // Perfect-guard linkage keeps its small cyan edge throughout firing.
    if(shot.linked)arc(ctx,right-r*.12,y,r*.32,r*.98,-1.4,1.4,'#c1f4ff',1.2);
    for(const contact of shot.contacts||[]) {
      const life=age-contact.time;if(life<0||life>.38)continue;
      const p=life/.38;ctx.globalAlpha=1-p;
      arc(ctx,contact.x,contact.y,6+p*36,9+p*49,-1.3,1.3,'#ffb883',2*(1-p)+.5);
      for(let i=0;i<(tier?11:4);i++){const a=(i/10-.5)*2.5,x=contact.x+Math.cos(a)*p*65,yy=contact.y+Math.sin(a)*p*69;ctx.strokeStyle=i%2?'#ff7436':'#ffd0a3';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x-8*(1-p),yy-Math.sin(a)*9);ctx.stroke();}
    }
    ctx.restore();
  }
  function ions(ctx,shot,age) {
    const tier=detail(),time=tier?age:0;
    ctx.save();ctx.lineCap='round';
    for(let k=0;k<shot.missiles.length;k++) {
      const m=shot.missiles[k];if(!m.active||m.done)continue;
      const points=m.trail;
      for(let layer=0;layer<(tier?3:1);layer++) {
        ctx.strokeStyle=['#1675c32b','#42b8ff8a','#e6fcff'][layer];ctx.lineWidth=[10,3.2,1][layer];ctx.beginPath();
        for(let i=0;i<points.length;i++){const p=points[i],fade=i/Math.max(1,points.length-1);ctx.lineTo(p.x,p.y+(tier?Math.sin(i*1.7-time*25+k)*3*(1-fade):0));}ctx.lineTo(m.x,m.y);ctx.stroke();
      }
      ctx.save();ctx.translate(m.x,m.y);ctx.rotate(m.angle);
      ctx.fillStyle='#164e7c';ctx.strokeStyle='#aeeeff';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(18,0);ctx.lineTo(-2,-5);ctx.lineTo(-14,-3);ctx.lineTo(-7,0);ctx.lineTo(-14,3);ctx.lineTo(-2,5);ctx.closePath();ctx.fill();ctx.stroke();
      arc(ctx,2,0,3,8,-1.5,1.5,'#66d9ff',1.4);ctx.restore();
      if(m.target && tier) {
        const a=time*1.7+k;arc(ctx,m.target.x,m.target.y,19+k*3,19+k*3,a,a+1.2,'#8cdeff55',1);
      }
    }
    for(const b of shot.bursts) {
      const p=(age-b.age)/.32;if(p<0||p>1)continue;ctx.globalAlpha=1-p;
      for(let i=0;i<(tier?7:3);i++) {const a=i*2.39996,r=10+p*45;ctx.strokeStyle=i%2?'#65b8ff':'#c5f8ff';ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x+Math.cos(a)*r*.45+Math.sin(i*5)*5,b.y+Math.sin(a)*r*.5);ctx.lineTo(b.x+Math.cos(a)*r,b.y+Math.sin(a)*r);ctx.stroke();}
    }
    ctx.restore();
  }
  function corona(ctx,shot,age) {
    const tier=detail(),time=tier?age:0;
    ctx.save();
    for(const [n,wave]of shot.waves.entries()) {
      if(wave.x<=0||wave.x-wave.length>=viewport.width)continue;
      const x=wave.x,left=Math.max(0,x-wave.length),h=viewport.height,rows=tier?24:14,step=h/rows;
      const gradient=ctx.createLinearGradient(left,0,x,0);gradient.addColorStop(0,'#7a421900');gradient.addColorStop(.5,'#a66b2222');gradient.addColorStop(.9,'#edbc6480');gradient.addColorStop(1,'#fff0baca');
      ctx.fillStyle=gradient;ctx.fillRect(left,0,x-left,h);
      for(let i=0;i<rows;i++) {
        const y=step*(i+.5),depth=Math.sin((i/rows)*Math.PI),length=Math.min(wave.length,12+depth*27),offset=tier?Math.sin(i*1.37-time*7+n)*3:0;
        ctx.strokeStyle=i%3?'#ffe2a46e':'#fff0c8c0';ctx.lineWidth=i%3?1:1.5;ctx.fillStyle='#ffbb4520';ctx.beginPath();
        ctx.moveTo(x-length,y-step*.34);ctx.lineTo(x-3,y-step*.42);ctx.lineTo(x+offset,y);ctx.lineTo(x-3,y+step*.42);ctx.lineTo(x-length,y+step*.34);ctx.closePath();ctx.fill();ctx.stroke();
        if(tier){ctx.strokeStyle='#dc902c55';ctx.beginPath();ctx.moveTo(x-length,y);ctx.lineTo(Math.max(left,x-length*1.7),y-step*.24);ctx.stroke();}
      }
      // An elliptical front communicates a curved field across the entire
      // collision band, not a handful of disconnected decorative bullets.
      arc(ctx,x-4,h*.5,Math.max(8,wave.length*.23),h*.5,-Math.PI/2,Math.PI/2,'#ffe4a5aa',1.6);
    }
    ctx.restore();
  }
  function draw(ctx) {
    if(state!=='battle'||ultimate.phase==='idle')return false;
    ctx.save();
    if(ultimate.phase==='charging')charge(ctx,ultimate.kind,muzzlePosition(),clamp(ultimate.elapsed/cannonLink.chargeDuration,0,1),ultimate.elapsed,cannonLink.chargingLinked);
    else if(ultimate.shot) {
      if(ultimate.kind==='blue')ions(ctx,ultimate.shot,ultimate.elapsed);
      else if(ultimate.kind==='yellow')corona(ctx,ultimate.shot,ultimate.elapsed);
      else crimson(ctx,ultimate.shot,ultimate.elapsed);
    }
    ctx.restore();return true;
  }
  function shieldDetail(ctx) {
    if(state!=='battle'||!shieldIsActive()||!detail())return;
    const age=shield.duration-shield.remaining,x=player.x,y=player.y,rx=player.width*.60,ry=player.height*.65;
    ctx.save();ctx.globalAlpha=Math.min(1,age/.12,shield.remaining/.18)*.7;
    // Grazing reflections travel over an ellipsoid, confined to its boundary.
    for(let i=0;i<7;i++){const t=(age*.6+i/7)%1,latitude=(t-.5)*Math.PI,span=Math.cos(latitude);arc(ctx,x,y+Math.sin(latitude)*ry,rx*span,Math.max(.2,ry*.07*span),-.4,2.9,'#ffc1b24d',.8);}
    if(shield.effect) {const p=clamp(1-shield.flash/.65,0,1);arc(ctx,x,y,rx*(1+p*.18),ry*(1+p*.18),-1.4,1.4,'#fff0c0',1.4);}
    ctx.restore();
  }
  return {draw,shieldDetail};
})();
