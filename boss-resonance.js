"use strict";

// One juvenile pattern, one mature response. Positions are locked when cast.
// Every live strand and vesicle passes through the same visitors for drawing and contact.
const BossResonance = (() => {
  const TAU = Math.PI * 2;
  const names = [
    ["返潮破口","Breaker Mouth","离开涡眼，侧穿两道卷浪","Leave the eye and pass beside the rolling fronts"],
    ["折冠追猎","Crown Rake","离开骨矛扇面，沿外侧绕后","Flank the fan before the ribs interlock"],
    ["熔脉分流","Basalt Discharge","横穿裂缝间的冷岩","Cross the cold basalt between the branching faults"],
    ["牵丝剥茧","Loom Unspooling","从丝轴外侧退出收缩网","Slip outside the silk spool as the web contracts"],
    ["双钳换极","Polarity Vice","从螯口的上下两端脱身","Escape past the upper or lower jaw tips"],
    ["折镜三棱","Parallax Prism","走棱镜缺口","Take the open prism edge"],
    ["脊雷逐节","Vertebral Relay","从雷脊暗段穿过","Cross behind the pulse"],
    ["菌毯再生","Fruiting Bodies","从孢囊之间切出菌毯","Slip between swelling sacs"],
    ["坍缩缺弧","Broken Horizon","穿过吸积环的缺口","Leave through the break in the accretion rim"],
    ["逆行突触","Retrograde Signal","走暗支路","Follow a spent branch"],
    ["群芯离合","Divided Heart","穿过间隙再避核心","Slip past organs and core"],
  ];
  const materials = ["water","bone","magma","silk","chitin","glass","plasma","spore","void","nerve","fusion"];
  const directions = [1,-1,1,-1,-1,1,1,-1,1,-1,1];
  let image, ejecta;

  function preload() {
    if (!image && typeof Image === "function") {
      image = new Image();
      image.src = "assets/vfx/nextgen/boss-organs.webp";
      ejecta = new Image();
      ejecta.src = "assets/vfx/nextgen/boss-ejecta.webp";
    }
  }

  function cast(target, finalForm = false) {
    const room = mechanicRoom(), type = target.type;
    const referenceX = finalForm ? player.x : target.lockX;
    const referenceY = finalForm ? player.y : target.lockY;
    // A previous displacement predicts an exit by at most 0.12 arena widths.
    // A pilot who keeps position is caught at that position. No tracking after the tell.
    const last = target.previousResonanceLock;
    const dx = last ? clamp(referenceX-last.x, -room.width*.12, room.width*.12) : 0;
    const dy = last ? clamp(referenceY-last.y, -room.height*.13, room.height*.13) : 0;
    // Tall phones have a narrow horizontal flight strip. Use their vertical
    // runway for the escape, keeping the pressure fronts readable at ship scale.
    const across = Math.max(room.width, Math.min(player.height*2.7,room.height*.48));
    const radius = Math.max(1, Math.min(across*.39,room.height*.43,player.speed*.49));
    const x = clamp(referenceX + dx*.55,room.left,room.right);
    const y = clamp(referenceY + dy*.55,room.top,room.bottom);
    target.previousResonanceLock = {x:referenceX,y:referenceY};
    const inward = x < room.left+room.width*.5 ? 1 : -1;
    return {x,y,radius,species:type,material:materials[type],color:alienSignatureColors[materials[type]],
      facing:inward,side:dy ? Math.sign(dy) : directions[type],mature:finalForm||target.enraged,
      duration:finalForm ? 2.05 : 1.74,sound:"surge"};
  }

  // Local coordinates are fractions of the reserved radius. Static pad and moving
  // pulse widths are both specified here; no screen rectangle can deal damage.
  function geometry(h,p,line,disc) {
    const mature=h.mature, tau=TAU;
    // Body weight, rupture, and drag give each attack its own acceleration.
    // This clock is shared with contact, including the post-impact recoil.
    const raw=p;
    if(h.species===0)p=p*p*(2.9-1.9*p);
    else if(h.species===1)p=clamp(p<.26?p*.54:.14+1.27*(p-.26)+.055*Math.sin((p-.26)*21)*Math.exp(-3*(p-.26)),0,1);
    else if(h.species===2)p=clamp(p+.08*Math.sin(p*16)*Math.sin(p*Math.PI),0,1);
    else if(h.species===3)p=.45*p+.55*(1-(1-p)**3);
    else if(h.species===4)p=clamp(p<.32?p*.51:.16+(p-.32)*1.28+.06*Math.sin((p-.32)*18),0,1);
    else if(h.species===6)p=.15*p+.85*p*p*(3-2*p);
    else if(h.species===10)p=p*p*(3-2*p);
    function arc(cx,cy,rx,ry,start,end,width,steps) {
      let ax=cx+Math.cos(start)*rx, ay=cy+Math.sin(start)*ry;
      for(let j=1;j<=steps;j++) {
        const a=start+(end-start)*j/steps,bx=cx+Math.cos(a)*rx,by=cy+Math.sin(a)*ry;
        line(ax,ay,bx,by,width); ax=bx; ay=by;
      }
    }
    switch(h.species) {
      case 0: { // Rolling banks with visibly open wave mouths
        for(let j=0;j<(mature?2:1);j++) {
          let ax,ay;
          for(let i=0;i<=14;i++){
            const u=i/14,envelope=Math.sin(Math.PI*u);
            const x=-.70+p*1.23-j*.27+envelope*(.25+.20*Math.sin(u*6.1+p*3.8+j))
              +.055*Math.sin(u*15.3+j*1.9-p*3.3);
            const y=-.79+1.53*u+j*(.15-.38*u);
            if(i)line(ax,ay,x,y,(j?.14:.25)*(.55+.53*envelope));
            ax=x;ay=y;
          }
        }
        break;
      }
      case 1: { // Serrated ribs drive forward from staggered sockets
        for(let i=-1;i<=1;i++) {
          const y=i*.34+.075*Math.sin(i*2.2), reach=.14+Math.sin(clamp(p+(i+1)*.047,0,1)*Math.PI)*(.73+.15*i);
          line(-.71+.12*i,y*.48,-.2,y,.15+.015*i);
          line(-.2,y,reach,y+i*.27,.12);
          if(mature)line(reach,y+i*.27,reach-.13,y+i*.27-.14,.062);
        }
        break;
      }
      case 2: { // A trunk vent opens into two dissimilar lava conduits
        const tip=-.32+p*1.1, thickness=.16+.14*Math.sin(p*Math.PI);
        line(-.91,.40,-.68,.35,thickness*.71);line(-.68,.35,-.49,.13,thickness);
        line(-.49,.13,-.30,.17,thickness*.82);line(-.30,.17,-.19,-.07,thickness*.96);
        line(-.19,-.07,tip*.58,-.19,thickness*.81);line(tip*.58,-.19,tip,-.39,thickness*.61);
        line(tip,-.39,tip+.11,-.56,thickness*.41);
        if(mature){
          line(-.48,.13,-.23,.41,thickness*.67);line(-.23,.41,.08,.48,thickness*.49);
          line(-.20,-.07,-.39,-.34,thickness*.48);line(-.39,-.34,-.30,-.53,thickness*.32);
          disc(-.44,.14,.15+.13*Math.sin(Math.PI*p));disc(.08,.48,.07+.09*p);
        }
        break;
      }
      case 3: { // Polygon first slackens, then contracts toward a spindle
        const r=.90-.48*p, sides=mature?5:4;
        for(let j=0;j<sides;j++) {
          const a=-.32+j*tau/sides,b=a+tau/sides;
          const x=r*Math.cos(a),y=r*Math.sin(a)*.74;
          if(j!==0){
            const nx=r*Math.cos(b),ny=r*Math.sin(b)*.74, sag=.11*Math.sin(a*2.7+raw*11)*(1-raw);
            const mx=(x+nx)*.5+sag,my=(y+ny)*.5+.13*(1-raw);
            line(x,y,mx,my,.046);line(mx,my,nx,ny,.042);
          }
          if(j%2)line(x,y,.08,-.05,.038);
          disc(x,y,.056);
        }
        break;
      }
      case 4: { // Hinged jaws converge from the sides; the ends remain open
        for(const s of [-1,1]) {
          const gap=.74-(s>0?.54:.43)*Math.sin(Math.PI*clamp(p+(s>0?.055:0),0,1));
          line(s*(gap+.22),-.64,s*gap,-.22,.16);
          line(s*gap,-.22,s*(gap-.05),.37,.22);
          line(s*(gap-.05),.37,s*(gap-.21),.59,.13);
          if(mature){
            line(s*gap,-.19,s*(gap-.15),-.11,.092);
            line(s*gap,.05,s*(gap-.19),.15,.080);
            line(s*gap,.26,s*(gap-.14),.30,.063);
          }
        }
        break;
      }
      case 5: { // Incoming ray changes direction at each mirror
        const offset=.10*Math.sin(Math.PI*p), v=[[-.86,.30],[-.38,-.48+offset],[.36,.45],[.76,-.36-offset]];
        const n=mature ? 3 : 2;
        for(let i=0;i<n;i++){line(...v[i],...v[i+1],.072);disc(...v[i+1],.082);}
        break;
      }
      case 6: { // Conductive packet travels along the spine, leaving a dead wake
        const head=-.88+p*1.75;
        for(let j=0;j<(mature?2:1);j++) {
          for(let i=0;i<5;i++) {
            const x=head-(j*.39+i*.055),next=x-.055;
            const height=x=>.26*Math.sin(x*5.3)+.082*Math.sin(x*11.4)+j*.21;
            if(next>=-.95)line(x,height(x),next,height(next),.14-j*.025);
          }
          disc(head-j*.39,.26*Math.sin((head-j*.39)*5.3)+.082*Math.sin((head-j*.39)*11.4)+j*.21,.10);
        }
        break;
      }
      case 7: { // Delayed pods inflate into overlapping caps with reachable gaps
        const v=[[-.45,-.20],[.41,-.14],[.05,.53]];
        for(let i=0;i<(mature?3:2);i++) {
          const growth=clamp((p-.15*i)/.62,0,1);
          disc(...v[i],.085+.22*growth);
          if(i>0&&growth>0)line(...v[i-1],...v[i],.032);
        }
        break;
      }
      case 8: { // The excised sector stays open throughout the collapse
        const r=.91-p*.62,start=.52,end=TAU-.51;
        arc(0,0,r,r*.82,start,end,.095,24);
        if(mature)arc(0,0,r*.67,r*.52,start+.12,end-.14,.045,13);
        break;
      }
      case 9: { // Saltatory propagation: only the current branched segment fires
        const n=Math.min(2,Math.floor(p*3)),v=[[-.84,.32],[-.38,-.20],[.15,.24],[.76,-.32]];
        line(...v[n],...v[n+1],.10);
        const [x,y]=v[n+1];disc(x,y,.12);
        if(mature){line(x,y,x-.11,y-.30,.066);line(x-.11,y-.30,x+.07,y-.43,.040);}
        break;
      }
      default: { // Three daughters unbraid then feed a central collapse
        const spread=.12+.63*Math.sin(p*Math.PI), angle=p*.87;
        for(let j=0;j<(mature?3:2);j++){
          const a=angle+j*tau/3+.12*Math.sin(j*2.73+p*6),x=Math.cos(a)*spread*(1+j*.07),y=Math.sin(a)*spread;
          disc(x,y,.14);
          if(p>.28&&p<.79)line(x*.5,y*.5,x,y,.065);
        }
        if(p>.70)disc(0,0,.10+(p-.70)*.82);
      }
    }
  }

  function hits(h,pilot) {
    if(h.age<h.warning || h.age>=h.warning+h.duration || !(h.radius>0))return false;
    const x=(pilot.x-h.x)*h.facing/h.radius,y=(pilot.y-h.y)*h.side/h.radius,margin=pilot.height*.16/h.radius;
    if(Math.abs(x)>1.3+margin||Math.abs(y)>1.3+margin)return false;
    let touched=false;
    geometry(h,clamp((h.age-h.warning)/h.duration,0,1),
      (ax,ay,bx,by,w)=>{if(!touched)touched=mechanicDistance(x,y,ax,ay,bx,by)<w*.5+margin;},
      (cx,cy,r)=>{if(!touched)touched=Math.hypot(cx-x,cy-y)<r+margin;});
    return touched;
  }

  function organ(ctx,type,x,y,size,angle,alpha) {
    if(type>0 && size>0 && typeof BossLivingMaterials!=="undefined"){
      ctx.save();ctx.globalAlpha*=alpha;
      const shown=BossLivingMaterials.organ(ctx,materials[type],x,y,size,size,angle);
      ctx.restore();
      if(shown)return;
    }
    if(!(size>0) || !image?.complete || !image.naturalWidth)return;
    const cell=image.naturalWidth/4;
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha*=alpha;
    ctx.drawImage(image,type%4*cell,Math.floor(type/4)*cell,cell,cell,-size/2,-size/2,size,size);ctx.restore();
  }

  // Break a severed organ into pieces of its own surface. Fragments use the
  // owner's clock and vanish with that owner on death, retry and resize.
  function sever(target,x,y,radius) {
    if(!target)return;
    const list=target.resonanceFragments??=[];
    if(list.length===8)list.shift();
    list.push({x,y,r:Math.max(6,radius),at:target.age});
  }
  function fragments(ctx,target,quiet) {
    const list=target.resonanceFragments;
    if(!list?.length || !image?.naturalWidth)return;
    const type=target.type,cell=image.naturalWidth/4;
    while(list.length && target.age-list[0].at>=.72)list.shift();
    for(const piece of list){
      const t=clamp((target.age-piece.at)/.72,0,1),r=piece.r, count=quiet?3:6;
      for(let i=0;i<count;i++){
        const a=i*2.39996+.31*type,run=quiet?.14:t;
        const soft=type===0||type===3||type===7||type===9;
        const distance=r*run*(soft?1.42:2.42)*(1+i%3*.21);
        const x=piece.x+Math.cos(a)*distance,y=piece.y+Math.sin(a)*distance+(soft?-1:1)*run*run*r*.91;
        ctx.save();ctx.translate(x,y);ctx.rotate(a*.22+run*(i%2?1:-1)*3.1);
        ctx.globalAlpha=.92*(1-t*t);
        const slice=cell/3;
        ctx.drawImage(image,type%4*cell+(i%3)*slice,Math.floor(type/4)*cell+(.17+(i%2)*.29)*cell,
          slice,cell*.41,-r*.36,-r*.33,r*.72,r*.68);
        ctx.restore();
      }
    }
  }

  // The emitter stays attached to the boss (and its transformed body) for all
  // native signatures, ultimates, and the locked response. It never marks contact.
  const castArcs=[-.23,-.35,-.39,.23,.18,-.22,.22,-.32,-.16,.17,-.23];
  function discharge(ctx,target,h,quiet) {
    if(h.age<(h.tellAt??0) || h.age>=h.warning+h.duration)return;
    const t=h.species,pal=signatureMaterials[h.material], elapsed=h.age-h.warning;
    const charging=elapsed<0, lead=h.warning-(h.tellAt??0);
    const cast=clamp((h.age-(h.tellAt??0))/Math.max(.01,lead),0,1);
    const intensity=charging ? clamp((cast-.15)/.42,0,1) :
      (.32+.68*Math.exp(-elapsed*1.22))*(1-clamp((elapsed-h.duration*.6)/(h.duration*.4),0,1));
    if(intensity<.01)return;
    const ox=target.x-target.width*.34,oy=target.y+target.height*.03,dx=h.x-ox,dy=h.y-oy;
    const distance=Math.hypot(dx,dy);
    if(distance<10)return;
    const nx=-dy/distance,ny=dx/distance;
    const bulge=Math.min(distance*.30,viewport.height*.34)*castArcs[t]*2.3;
    const clock=quiet?0:h.age, front=charging?clamp((cast-.18)/.73,0,1):1;
    const wake=charging?intensity:intensity*Math.exp(-elapsed*.64);
    const bend=(u,offset)=>Math.sin(u*Math.PI)*(bulge+offset);
    const X=(u,offset=0)=>ox+dx*u+nx*bend(u,offset);
    const Y=(u,offset=0)=>oy+dy*u+ny*bend(u,offset);
    const size=target.width*(h.ultimateCast?1.44:1), backwards=t===8, shoot=backwards?1-front:front;
    ctx.save();
    // Ejected matter bridges the organism and the fracture. During the active
    // window only transparent vapor, isolated debris and broken filaments may
    // cross the pilot's escape lane. Contact is marked by the dense local front.
    const hazeCount=quiet?4:visualQuality.id==="high"?12:7;
    for(let i=0;i<hazeCount;i++){
      const seed=fragmentsSeed[i],u=(backwards?1-(i+.4)/hazeCount:(i+.4)/hazeCount);
      if(backwards?u<shoot:u>front)continue;
      const speed=quiet?0:Math.sin(clock*(.87+seed.spin)+i)*size*.031;
      const offset=speed+size*(seed.phase-.5)*.27;
      const x=X(u,offset),y=Y(u,offset);
      const angle=Math.atan2(dy+ny*bulge*Math.PI*Math.cos(u*Math.PI),dx+nx*bulge*Math.PI*Math.cos(u*Math.PI));
      const swell=size*(.30+.64*seed.bias)*(.48+.81*Math.sin(u*Math.PI));
      const air=[.83,.50,.98,.40,.54,.32,.53,.96,.48,.42,.83][t];
      plume(ctx,t,x,y,swell*1.45,swell*(.47+.42*seed.phase),angle+seed.phase*.54,air*wake*(.42+.49*seed.spin));
    }
    // Layered continuous fibers remain fine compared with the punched target.
    // Each organ drives a different silhouette: a ragged spray fan, a spun
    // cocoon fiber, a refracted optical seam, or a leaping spinal discharge.
    const fibers=t===3?8:t===10?5:t===5||t===9?4:3;
    for(let j=0;j<(quiet?2:fibers);j++){
      const s=fragmentsSeed[j+3],offset=(s.phase-.5)*size*(t===3?.47:.33);
      const start=backwards?shoot:Math.max(0,front-(charging?.46:.74));
      const end=backwards?Math.min(1,shoot+.74):front;
      const spent=charging?1:.66;
      ctx.beginPath();
      for(let k=0;k<=19;k++){
        const u=start+(end-start)*k/19,env=Math.sin(u*Math.PI);
        let lateral=offset;
        if(t===4||t===6||t===9)lateral+=Math.sin(k*5.31+j*2.8+Math.floor(clock*12)*1.38)*size*(t===6?.066:.034);
        else if(t===3||t===10)lateral+=Math.sin(u*13+clock*5+j)*size*.045;
        else if(t===5)lateral+=Math.abs(u-.56)*size*(j-2)*.30;
        else lateral+=Math.sin(k*1.17+clock*3+s.angle)*size*.015;
        const x=X(u,lateral),y=Y(u,lateral);
        if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.lineWidth=quiet?.8:(t===3||t===5?1.0:1.4+j*.22);
      ctx.strokeStyle=j===0?pal.spark:pal.rim;
      ctx.globalAlpha=wake*spent*(t===3||t===6||t===9?.38:.19);
      if(t!==3 && t!==9)ctx.setLineDash(t===8?[5,17]:[16+j*7,13+j*4,3,17]);
      ctx.lineDashOffset=quiet?0:(backwards?1:-1)*clock*(t===6?220:114);
      ctx.stroke();ctx.setLineDash([]);
    }
    const packets=quiet?4:visualQuality.id==="high"?18:11;
    for(let j=0;j<packets;j++){
      const s=fragmentsSeed[j],v=(s.phase+(quiet?0:clock*(.39+.17*s.spin)))%1;
      const u=backwards?1-v:v;if(backwards?u<shoot:u>front)continue;
      const wing=(s.bias-.5)*size*(t===7?.62:.39);
      const x=X(u,wing),y=Y(u,wing),a=Math.atan2(dy+ny*Math.PI*bulge*Math.cos(u*Math.PI),dx+nx*Math.PI*bulge*Math.cos(u*Math.PI));
      const z=size*(.013+.021*s.spin)*(.80+u*.29);
      ctx.save();ctx.translate(x,y);ctx.rotate(a+(backwards?Math.PI:0));
      ctx.globalAlpha=intensity*(.38+.39*s.bias);
      if(t===0||t===7){
        ctx.beginPath();ctx.ellipse(0,0,z*(t===0?1.7:.59),z*(t===0?.40:.52),-.3,0,TAU);
        ctx.fillStyle=pal.rim;ctx.fill();
        ctx.beginPath();ctx.ellipse(-z*.2,-z*.14,z*.36,z*.14,-.3,0,TAU);ctx.fillStyle=pal.spark;ctx.fill();
      }else if(t===1||t===2||t===4||t===5||t===10){
        ctx.beginPath();ctx.moveTo(-z*2.2,z*.15);ctx.lineTo(z*.20,-z*.65);ctx.lineTo(z,z*.14);ctx.lineTo(-z*.33,z*.67);ctx.closePath();
        ctx.fillStyle=t===2?"#7c4c37":pal.mid;ctx.fill();
        ctx.beginPath();ctx.moveTo(-z*2.2,z*.15);ctx.lineTo(z*.20,-z*.65);ctx.lineTo(z*.60,-z*.07);
        ctx.fillStyle=t===2?"#ffb35c":pal.rim;ctx.fill();
      }else{
        ctx.strokeStyle=pal.spark;ctx.lineWidth=.92;
        ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-z*1.6,-z*.41);ctx.lineTo(-z*2.3,z*.33);ctx.lineTo(-z*3.4,0);ctx.stroke();
      }
      ctx.restore();
    }
    if(charging&&front>0&&front<1){
      const x=X(shoot),y=Y(shoot),flare=size*(.17+.14*Math.sin(front*Math.PI));
      ctx.globalAlpha=.51*wake;ctx.drawImage(pressureArtGlow(pal.rim),x-flare,y-flare,flare*2,flare*2);
      ctx.globalAlpha=1;organ(ctx,t,x,y,flare*.88,(quiet?0:front)*directions[t]*1.35,.86);
    }
    ctx.restore();
  }

  function ultimateImpact(ctx,target,h,g,quiet) {
    const room=mechanicRoom(),type=target.type;
    const active=h.age>=h.warning,p=active?clamp((h.age-h.warning)/h.duration,0,1):0;
    let best=null,score=Infinity;
    // Pick a real, visible point of contact, including the moving front. The
    // no-shield corridor is excluded again at draw time for spray and shrapnel.
    const side=h.gapY<alienLane(.5)?1:-1;
    const wantedY=clamp(h.gapY+side*(h.gapSize*.5+room.height*.23),room.top,room.bottom);
    function consider(x,y) {
      if(x<0||x>viewport.width||y<0||y>viewport.height)return;
      if(h.noShield&&Math.abs(y-h.gapY)<h.gapSize*.5+5)return;
      const d=Math.abs(x-(room.left+room.width*.49))*.78+Math.abs(y-wantedY);
      if(d<score){score=d;best={x,y};}
    }
    for(const a of g.rects) {
      if(a.width<2||a.height<2)continue;
      consider(a.x+a.width*.47,a.y+a.height*.45);consider(a.x+a.width*.72,a.y+a.height*.75);
    }
    for(const a of g.segments)for(const q of [.30,.58,.82])consider(a.x1+(a.x2-a.x1)*q,a.y1+(a.y2-a.y1)*q);
    for(const c of g.circles)for(let k=0;k<7;k++){
      const a=k*TAU/7+.13,rad=(c.radius+(c.innerRadius||0))*.5;
      consider(c.x+Math.cos(a)*rad,c.y+Math.sin(a)*rad);
    }
    if(!best)return;
    const pack={...best,species:type,material:materials[type],age:h.age,warning:h.warning,duration:h.duration,ultimateCast:true};
    discharge(ctx,target,pack,quiet);
    if(!active)return;
    const r=Math.min(target.width*.58,room.height*.30), now=quiet?0:h.age;
    const landing=.42+.55*Math.sin(Math.PI*p);
    ctx.save();ctx.translate(best.x,best.y);
    // Glass sheds a prism shower, tissue tears eject cables, heated crust throws
    // cauliflower-shaped ash lobes, and the wave's lip entrains aerated spray.
    const contact=[{x:0,y:0,r:r*.21}];
    debris(ctx,{species:type,radius:r,material:materials[type]},p,quiet,[],contact,false);
    if(type===2){
      NextgenVfx.drawEruption(ctx,{x:0,y:0,radius:r*.66},signatureMaterials.magma,now,landing);
      for(let j=0;j<(quiet?2:6);j++){
        const seed=fragmentsSeed[j+7],u=((quiet?.31:p*1.68)+seed.phase)%1;
        const x=(seed.bias-.58)*r*(.62+u),y=-r*(.24+1.35*u)+r*.49*u*u;
        plume(ctx,type,x,y,r*(.67+.72*u),r*(.68+.84*u),-1.12+seed.spin*.63,(1-u)*.80*landing);
      }
    }else if(type===0||type===7||type===10){
      const bend=type===0?-.69:type===7?-1.28:.41;
      plume(ctx,type,-r*.15,-r*.09,r*2.1,r*1.31,bend,landing*.76);
    }
    debris(ctx,{species:type,radius:r,material:materials[type]},p,quiet,[],contact,true);
    ctx.restore();
  }

  function emitter(ctx,target,quiet) {
    preload();
    fragments(ctx,target,quiet);
    const hs=target.finale?.hazards??bossHazards;
    let choice=null, strength=0;
    for(const h of hs) {
      if((h.kind??h.type)==="resonance")discharge(ctx,target,h,quiet);
      const tell=h.tellAt??0,elapsed=h.age-tell,lead=h.warning-tell;
      if(elapsed<0||h.age>=h.warning+h.duration || !lead)continue;
      const envelope=h.age<h.warning ? .12+.88*clamp(elapsed/lead,0,1)**2 :
        .28+.72*(1-clamp((h.age-h.warning)/.43,0,1))**2;
      if(envelope>strength){strength=envelope;choice=h;}
    }
    if(!choice)return;
    const type=target.type,w=target.width, x=target.x-w*.27,y=target.y+target.height*.045;
    const palette=signatureMaterials[materials[type]],age=quiet?0:choice.age;
    const size=w*(.14+.10*strength);
    ctx.save();ctx.translate(x,y);
    const haze=pressureArtGlow(palette.rim);
    ctx.globalAlpha=.13+.19*strength;ctx.drawImage(haze,-size,-size*.69,size*2,size*1.38);ctx.globalAlpha=1;
    organ(ctx,type,0,0,size*1.38,directions[type]*Math.sin(age*.9)*.17,.67+.28*strength);
    ctx.restore();
  }
  function stroke(ctx,path,color,width,alpha) {
    ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke(path);
  }

  function materialSegment(ctx,type,ax,ay,bx,by,width,time,quiet,index) {
    const dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy);
    if(length<.1)return;
    const half=width*.5, kind=materials[type], palette=signatureMaterials[kind];
    ctx.save();ctx.translate(ax,ay);ctx.rotate(Math.atan2(dy,dx));
    if(type>0 && length>=Math.max(14,width*2.8) && typeof BossLivingMaterials!=="undefined" &&
       BossLivingMaterials.ray(ctx,kind,0,0,length,0,half,time,true,1,quiet)) {
      ctx.restore();return;
    }
    if(type===1) {
      // Curved, tapered ivory with cortical striations and a dark marrow socket.
      BossCreatureVfx.bone(ctx,0,0,length,width,0,index%4,index%2===0);
    } else if(type===2) {
      // A worked, broken basalt edge encloses advecting melt; the basalt surface
      // is the same pressure-baked material used by the boss's major rift.
      NextgenVfx.drawMagmaFissure(ctx,{x1:0,y1:0,x2:length,y2:0,width},palette,time,.98);
    } else if(type===5) {
      const light=ctx.createLinearGradient(0,-half,0,half);
      light.addColorStop(0,"#88eaff");light.addColorStop(.26,"#17243c");light.addColorStop(.63,"#65668f");
      light.addColorStop(.7,"#e5f9ed");light.addColorStop(1,"#ce87dc");
      ctx.fillStyle=light;ctx.beginPath();ctx.moveTo(0,-half*.60);ctx.lineTo(length*.36,-half);
      ctx.lineTo(length,half*.13);ctx.lineTo(length*.69,half);ctx.lineTo(0,half*.42);ctx.closePath();ctx.fill();
      ctx.strokeStyle="#efffff";ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(0,half*.12);ctx.lineTo(length*.36,-half*.65);
      ctx.lineTo(length*.69,half*.62);ctx.lineTo(length,half*.13);ctx.stroke();
    } else if(type===4) {
      const plates=Math.max(2,Math.min(7,Math.round(length/Math.max(7,width*.64))));
      for(let i=0;i<plates;i++){
        const x=length*i/plates,edge=length/plates,w=half*(.82+.18*Math.sin((i+.3)/plates*Math.PI));
        ctx.beginPath();ctx.moveTo(x-edge*.13,-w*.60);ctx.lineTo(x+edge*.54,-w);
        ctx.lineTo(x+edge*1.12,-w*.33);ctx.lineTo(x+edge*.89,w*.64);ctx.lineTo(x+edge*.17,w);ctx.closePath();
        const chitin=ctx.createLinearGradient(x,-w,x,w);
        chitin.addColorStop(0,"#abc5a1");chitin.addColorStop(.25,"#739c81");chitin.addColorStop(.52,"#334a41");chitin.addColorStop(1,"#192d36");
        ctx.fillStyle=chitin;ctx.fill();ctx.strokeStyle="#253334";ctx.lineWidth=.65;ctx.stroke();
      }
    } else if(type===6) {
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(length*.25,-half*.68);ctx.lineTo(length*.36,half*.77);
      ctx.lineTo(length*.70,-half*.46);ctx.lineTo(length,0);
      ctx.strokeStyle="#3098ff";ctx.lineWidth=width*.65;ctx.globalAlpha=.45;ctx.stroke();
      ctx.strokeStyle="#ceffff";ctx.lineWidth=Math.max(1,width*.18);ctx.globalAlpha=.97;ctx.stroke();
      ctx.beginPath();ctx.moveTo(length*.36,half*.68);ctx.lineTo(length*.11,half*.91);ctx.lineTo(0,half*.69);ctx.lineWidth=.8;ctx.stroke();
    } else if(type===0 || type===8) {
      const front=type===0, sheen=ctx.createLinearGradient(0,-half,0,half);
      [[0,palette.rim],[.12,front?"#b6f1ea":"#c59ece"],[.32,palette.mid],[.64,front?"#164e68":"#0a0615"],[1,palette.dark]].forEach(([at,c])=>sheen.addColorStop(at,c));
      ctx.fillStyle=sheen;ctx.beginPath();ctx.moveTo(-1,-half*.5);
      ctx.bezierCurveTo(length*.24,-half*1.22,length*.73,-half*.64,length+1,-half*.38);
      ctx.lineTo(length+1,half*.76);ctx.quadraticCurveTo(length*.36,half*1.1,-1,half*.59);ctx.closePath();ctx.fill();
      if(front){
        ctx.strokeStyle="#def9eb";ctx.globalAlpha=.86;ctx.lineWidth=.8;
        ctx.beginPath();ctx.moveTo(0,-half*.44);ctx.quadraticCurveTo(length*.39,-half*1.62,length*.69,-half*.42);ctx.stroke();
      }
    } else {
      // Viscoelastic, plaited structures. The axon carries irregular dendrites;
      // hyphae bead at intersections; widow silk draws as three tension fibers.
      const strands=type===3?3:4;
      for(let i=0;i<strands;i++){
        const y=(i/(strands-1)-.5)*width*.92, bend=Math.sin(time*2+index*1.7+i)*half*.58;
        ctx.beginPath();ctx.moveTo(0,y*.25);
        ctx.bezierCurveTo(length*.24,y+bend,length*.69,y-bend,length,y*.18);
        ctx.strokeStyle=i===0?palette.spark:i%2?palette.mid:palette.rim;
        ctx.lineWidth=type===3?.8:Math.max(.8,width*.20);ctx.globalAlpha=i===0?.80:.92;ctx.stroke();
      }
      if(type===9||type===7){
        for(let i=1;i<=3;i++){
          const x=length*i/4,side=i%2?1:-1;
          ctx.beginPath();ctx.moveTo(x,0);ctx.quadraticCurveTo(x-length*.08,half*side*.87,x-length*.19,half*side*1.05);
          ctx.strokeStyle=palette.rim;ctx.lineWidth=.9;ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  const fragmentsSeed=Array.from({length:32},(_,i)=>({
    phase:(i*.618034+.13)%1, bias:(i*.4213+.072)%1, spin:(i*.75487+.34)%1,
    angle:i*2.39996
  }));
  function plume(ctx,type,x,y,w,h,angle,alpha) {
    if(!ejecta?.naturalWidth || !(w>1&&h>1&&alpha>.015))return;
    const cell=ejecta.naturalWidth/4;
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha=alpha;
    ctx.drawImage(ejecta,type%4*cell,Math.floor(type/4)*cell,cell,cell,-w*.45,-h*.5,w,h);ctx.restore();
  }
  function debris(ctx,h,p,quiet,lines,nodes,foreground) {
    if(!lines.length&&!nodes.length)return;
    const t=h.species,r=h.radius,age=quiet?.38:p;
    const energy=Math.sin(Math.min(1,p/.18)*Math.PI*.5)*(.55+.45*(1-p));
    const pal=signatureMaterials[h.material],quantity=quiet?4:visualQuality.id==="high"?24:13;
    const largeCloud=[0,1,2,7,10].includes(t);
    const gust=[-.73,.42,-.96,-.39,.28,.55,-.20,-.75,-.22,.31,-.35][t];
    for(let i=0;i<(foreground?quantity:quiet?2:largeCloud?9:4);i++){
      const s=fragmentsSeed[i],segment=lines.length?lines[(i*7+Math.floor(s.spin*13))%lines.length]:null;
      const node=nodes.length?nodes[(i*3+Math.floor(s.phase*5))%nodes.length]:null;
      const fromNode=node&&(!segment||i%3===0||t===7||t===10);
      const f=s.phase,px=fromNode?node.x:segment[0]+(segment[2]-segment[0])*f;
      const py=fromNode?node.y:segment[1]+(segment[3]-segment[1])*f;
      const direction=fromNode?s.angle:Math.atan2(segment[3]-segment[1],segment[2]-segment[0]);
      let v=(age*(t===6?2.75:1.6)+s.phase)%1;
      const thrust=(.12+.35*s.spin)*r,scatter=direction+(s.bias-.5)*3.7;
      let x=px+Math.cos(scatter)*thrust*v;
      let y=py+Math.sin(scatter)*thrust*v+gust*r*v*(1-v)*.73;
      if(t===8){x=px*(1-v*.59)-py*v*.22;y=py*(1-v*.59)+px*v*.22;}
      if(t===0||t===3){x-=r*v*.20;y+=r*v*v*.15;}
      if(!foreground){
        const size=r*(largeCloud?.62:.39)*(.63+.83*s.bias+v*.55);
        plume(ctx,t,x,y,size,size*(t===8?.56:.90),direction+(s.bias-.5)*1.3,(1-v)*energy*(largeCloud?.88:.60));
        continue;
      }
      const alpha=(1-v)*energy*(.57+.40*s.bias),size=Math.max(.9,r*(.008+.016*s.bias));
      ctx.save();ctx.translate(x,y);ctx.rotate(scatter+(t===0||t===6?0:v*(s.spin-.5)*6));
      ctx.globalAlpha=alpha;
      if(t===0||t===7){
        const wet=t===0;
        ctx.fillStyle=wet?"#9bd8d5":i%3?"#aab56d":"#ddd8a1";
        ctx.beginPath();ctx.ellipse(0,0,size*(wet?1.9:1),size*(wet?.50:.80),0,0,TAU);ctx.fill();
        ctx.strokeStyle=wet?"#e5fff3":"#e7e2a9";ctx.lineWidth=.65;ctx.beginPath();ctx.arc(0,0,size*.64,3.6,5.18);ctx.stroke();
      }else if(t===1||t===2||t===4||t===5){
        const glass=t===5, hot=t===2;
        const long=size*(glass?3.5:t===1?2.3:1.65);
        ctx.beginPath();ctx.moveTo(-long,-size*.19);ctx.lineTo(size*.11,-size*.87);ctx.lineTo(long*.65,size*.11);
        ctx.lineTo(-size*.32,size*.77);ctx.closePath();ctx.fillStyle=hot?"#543a33":pal.mid;ctx.fill();
        ctx.beginPath();ctx.moveTo(-long,-size*.19);ctx.lineTo(size*.11,-size*.87);ctx.lineTo(long*.42,size*.04);
        ctx.fillStyle=hot?"#f7a64b":pal.rim;ctx.fill();
        if(hot){ctx.strokeStyle="#ee832a";ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(-long,0);ctx.lineTo(-long-size*2.4,0);ctx.stroke();}
      }else{
        ctx.strokeStyle=i%4?pal.rim:pal.spark;ctx.lineWidth=t===3?.78:1;
        ctx.beginPath();ctx.moveTo(-size*.6,0);
        if(t===6||t===9){
          ctx.lineTo(-size*2.3,-size);ctx.lineTo(-size*3.3,size*.8);ctx.lineTo(-size*5.5,-size*.6);
          ctx.moveTo(-size*2.3,-size);ctx.lineTo(-size*2.6,-size*2.3);
        }else ctx.bezierCurveTo(-size*2,size*1.8,-size*3.7,-size,-size*(t===8?6:4),size*.31);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function paint(h,ctx,p,active,quiet) {
    const type=h.species,pal=signatureMaterials[h.material],scale=h.radius;
    const paths=new Map(),vesicles=[],segments=[];
    geometry(h,p,(ax,ay,bx,by,w)=>{
      let path=paths.get(w);if(!path){path=new Path2D();paths.set(w,path);}
      path.moveTo(ax,ay);path.lineTo(bx,by);
      if(active)segments.push([ax*scale,ay*scale,bx*scale,by*scale,w*scale]);
    },(x,y,r)=>vesicles.push({x:x*scale,y:y*scale,r:r*scale}));
    const now=quiet?0:h.age;
    ctx.lineCap="round";ctx.lineJoin="round";
    for(const [width,path] of paths){
      if(active)stroke(ctx,path,pal.rim,width*.83,.072);
      else stroke(ctx,path,pal.rim,Math.max(.010,width*.22),.54);
    }
    ctx.save();ctx.scale(1/scale,1/scale);ctx.globalAlpha=1;
    if(active){
      if(type===8){
        const r=scale*(.91-p*.62);
        // Allow the shadow in the centre, but keep the gap in the outer
        // damaging rim free of glow. The live contact is drawn on top.
        ctx.save();ctx.beginPath();
        ctx.arc(0,0,r*2,.53,TAU-.51);
        ctx.arc(0,0,r*.56,TAU-.51,.53);
        ctx.closePath();ctx.clip();
        NextgenVfx.drawHorizon(ctx,0,0,r*3.65,now,.93,quiet);
        ctx.restore();
      }
      debris(ctx,h,p,quiet,segments,vesicles,false);
      if(type===0){
        // One coherent liquid surface per front. Mirror its breaking lip into
        // the direction of travel instead of stamping a cap on every segment.
        for(let base=0;base<segments.length;base+=14){
          const first=segments[base],last=segments[base+13],top=first[1],bottom=last[3];
          const xAt=y=>{
            const at=clamp((y-top)/(bottom-top)*14,0,13.999);
            const seg=segments[base+Math.floor(at)];
            return seg[0]+(seg[2]-seg[0])*(at%1);
          };
          const width=scale*(base?.14:.25);
          ElementalFluidVfx.waterRibbon(ctx,xAt,top,bottom,width,1,now,.97,quiet);
        }
      } else for(let i=0;i<segments.length;i++)materialSegment(ctx,type,...segments[i],now,quiet,i);
      if(type===0&&!quiet){
        // Breaking wave throws a trailing veil of short, ballistic foam streaks.
        ctx.strokeStyle="#c5f4ed";ctx.lineWidth=.9;
        for(let i=0;i<segments.length;i+=2){
          const [x,y,,,w]=segments[i],v=(now*1.03+i*.382)%1;
          ctx.globalAlpha=.70*(1-v);ctx.beginPath();ctx.moveTo(x-w*v*.9,y+w*(v*v-.62*v));
          ctx.lineTo(x-w*v*.9-w*.13,y+w*(v*v-.62*v)-.9);ctx.stroke();
        }
      }
    }
    for(const {x,y,r} of vesicles){
      ctx.globalAlpha=1;
      if(active && type===7){
        NextgenVfx.drawSporeCloud(ctx,{x,y,radius:r},now,.87);
        NextgenVfx.drawSporePod(ctx,{x,y,radius:r},now,.92,r*.51);
      }else if(active && type===2){
        NextgenVfx.drawEruption(ctx,{x,y,radius:r},pal,now,.90);
      }else if(active && type===5){
        BossCreatureVfx.drawPrismNode(ctx,{x,y,radius:r},pal,now,.93,quiet);
      }else{
        ctx.drawImage(pressureArtGlow(pal.rim),x-r*1.6,y-r*1.6,r*3.2,r*3.2);
        organ(ctx,type,x,y,r*3.55,quiet?0:Math.sin(now*2+x*.011)*.31,active?.96:.40);
      }
      if(!active){
        ctx.strokeStyle=pal.rim;ctx.lineWidth=.9;ctx.globalAlpha=.74;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();
      }
    }
    if(active)debris(ctx,h,p,quiet,segments,vesicles,true);
    ctx.restore();ctx.globalAlpha=1;
  }

  function draw(ctx,h,quiet) {
    if(h.age<(h.tellAt??0)||h.age>=h.warning+h.duration||!(h.radius>0))return;
    preload();
    const active=h.age>=h.warning,tell=h.tellAt??0;
    const p=active?clamp((h.age-h.warning)/h.duration,0,1):clamp((h.age-tell)/Math.max(.01,h.warning-tell),0,1);
    const type=h.species,pal=signatureMaterials[h.material];
    ctx.save();ctx.translate(h.x,h.y);ctx.scale(h.radius*h.facing,h.radius*h.side);
    if(!active){
      // Trace where moving anatomy can reach; the solid tell shows its first contact.
      ctx.save();ctx.setLineDash([.041,.055]);paint(h,ctx,.64,false,quiet);ctx.restore();
      paint(h,ctx,0,false,quiet);
      const gather=quiet?.68:p;
      for(let i=0;i<(quiet?3:7);i++){
        const a=i*2.39996+.45, distance=(.25+.58*(1-gather))*(.80+(i%3)*.08);
        ctx.beginPath();ctx.moveTo(Math.cos(a)*distance, Math.sin(a)*distance);
        ctx.lineTo(Math.cos(a)*(distance+.045),Math.sin(a)*(distance+.045));
        ctx.lineWidth=.014;ctx.strokeStyle=pal.rim;ctx.globalAlpha=.65;ctx.stroke();
      }
      ctx.globalAlpha=1;
      organ(ctx,type,0,0,.40+.21*gather,quiet?0:directions[type]*p*.27,.81);
    } else {
      const glow=.93+Math.sin(p*Math.PI)*.38;
      ctx.globalAlpha=quiet?.14:.21;ctx.drawImage(pressureArtGlow(pal.rim),-glow,-glow*.81,2*glow,1.62*glow);
      ctx.globalAlpha=1;
      organ(ctx,type,0,0,.48+(quiet?0:Math.sin(p*Math.PI)*.09),quiet?0:directions[type]*p*.37,.28);
      paint(h,ctx,p,true,quiet);
    }
    ctx.restore();
  }
  return {names,cast,hits,draw,emitter,preload,sever,ultimateImpact};
})();
