"use strict";

// The prologue has its own camera. A closed, indexed relief hull supplies a real
// belly, sidewalls and moving specular normals when the turntable or ship banks.
function makeOpeningFlightStage() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { alpha:true, antialias:true, depth:true,
    premultipliedAlpha:true, preserveDrawingBuffer:false });
  if (!gl) return null;
  function shader(kind, source) {
    const value = gl.createShader(kind);
    gl.shaderSource(value, source); gl.compileShader(value);
    if (!gl.getShaderParameter(value,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(value));
    return value;
  }
  const vs=shader(gl.VERTEX_SHADER,`
    attribute vec3 pos, norm;
    attribute vec2 uv;
    uniform mat3 camera;
    uniform float aspect;
    varying vec2 texUV;
    varying vec3 normal;
    varying float upper;
    void main() {
      vec3 v=camera*pos;
      float lens=1.0-.105*v.z;
      gl_Position=vec4(v.x*.86,-v.y*aspect*.86,-v.z*.39,lens);
      normal=camera*norm;
      upper=norm.z;
      texUV=uv;
    }
  `);
  const fs=shader(gl.FRAGMENT_SHADER,`
    precision mediump float;
    uniform sampler2D paint;
    uniform vec3 tint;
    uniform float time, thrust;
    varying vec2 texUV;
    varying vec3 normal;
    varying float upper;
    void main() {
      vec4 t=texture2D(paint,texUV);
      if(t.a<.035) discard;
      vec3 n=normalize(normal);
      vec3 key=normalize(vec3(-.37,-.65,.71));
      float fres=pow(1.-abs(n.z),3.);
      vec3 base=mix(t.rgb*vec3(.20,.28,.34)+tint*.045,t.rgb,smoothstep(.01,.46,upper));
      float broad=max(0.,dot(n,key));
      float line=pow(max(0.,dot(n,normalize(vec3(-.16,-.33,.93)))),38.);
      float seam=exp(-49.*abs(texUV.x-.11-.65*fract(time*.087)));
      vec3 color=base*(.70+.40*broad)+vec3(.58,.76,.91)*(line*.14+fres*.19)+
                 tint*(seam*.032+thrust*fres*.043);
      gl_FragColor=vec4(color*t.a,t.a);
    }
  `);
  const program=gl.createProgram(); gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  const loc=Object.fromEntries(["camera","aspect","paint","tint","time","thrust"].map(k=>[k,gl.getUniformLocation(program,k)]));
  const attributes=Object.fromEntries(["pos","norm","uv"].map(k=>[k,gl.getAttribLocation(program,k)]));
  const models=new Map();
  let disposed=false;
  function model(id,image) {
    if(models.has(id)) return models.get(id);
    if(!image?.naturalWidth) return null;
    const cols=108,rows=72, ratio=image.naturalHeight/image.naturalWidth;
    const sample=document.createElement("canvas");sample.width=cols;sample.height=rows;
    const pixels=sample.getContext("2d",{willReadFrequently:true});
    pixels.drawImage(image,0,0,cols,rows);
    const rgba=pixels.getImageData(0,0,cols,rows).data;
    const present=(x,y)=>x>=0&&y>=0&&x<cols&&y<rows&&rgba[(y*cols+x)*4+3]>35;
    const vertices=[],indices=[],layerCount=(cols+1)*(rows+1);
    // Thickness falls to zero at the photographed silhouette. Without an
    // actual edge-distance field, a banking camera sees a row of open slits
    // between the grid contour and the texture's sharp nose and wingtips.
    const distance=new Float32Array(layerCount);
    const stride=cols+1;
    for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
      const k=y*stride+x;
      distance[k]=present(x,y)&&present(x-1,y)&&present(x,y-1)&&present(x-1,y-1)?100:0;
      if(x&&y)distance[k]=Math.min(distance[k],distance[k-1]+1,distance[k-stride]+1,distance[k-stride-1]+1.41);
    }
    for(let y=rows-1;y>=0;y--)for(let x=cols-1;x>=0;x--){
      const k=y*stride+x;
      distance[k]=Math.min(distance[k],distance[k+1]+1,distance[k+stride]+1,distance[k+stride+1]+1.41);
    }
    function taper(x,y) {
      const u=Math.max(0,Math.min(1,distance[Math.max(0,Math.min(rows,y))*stride+Math.max(0,Math.min(cols,x))]/5.2));
      return u*u*(3-2*u);
    }
    const ey=id==="yellow"?[.344,.578]:[.344,.568];
    const bell=x=>Math.exp(-x*x);
    function form(u,v) {
      const axis=.446+.023*u;
      const wing=.012+.05*bell((u-.30+.63*Math.abs(v-axis))/.25)*bell((v-axis)/.40);
      const spine=.066*bell((v-axis)/(.03+.12*(1-u)))*Math.min(1,(1-u)*5.2);
      const canopy=.071*bell((u-.565)/.139)*bell((v-axis+.048)/.075);
      const tubes=Math.max(...ey.map(c=>.075*bell((v-c)/.086)*bell((u-.10)/.25)));
      return (wing+spine+canopy+tubes)*1.55;
    }
    function point(x,y,side) {
      const u=x/cols,v=y/rows,pixelU=Math.max(.005,Math.min(.995,u));
      const z=form(u,v)*taper(x,y);
      const dzx=(form(u+1/cols,v)*taper(x+1,y)-form(u-1/cols,v)*taper(x-1,y))*cols/4;
      const dzy=(form(u,v+1/rows)*taper(x,y+1)-form(u,v-1/rows)*taper(x,y-1))*rows/(4*ratio);
      const normal=[-dzx,-dzy,side], length=Math.hypot(...normal);
      return [(u-.50)*2,(v-.5)*2*ratio,side===1?z:-z*.61,...normal.map(n=>n/length),pixelU,v];
    }
    for(const side of [1,-1]) for(let y=0;y<=rows;y++) for(let x=0;x<=cols;x++) vertices.push(...point(x,y,side));
    function wall(a,b) { indices.push(a,b,b+layerCount,a,b+layerCount,a+layerCount); }
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) {
      if(!present(x,y)&&!present(x-1,y)&&!present(x+1,y)&&!present(x,y-1)&&!present(x,y+1))continue;
      const a=y*(cols+1)+x,b=a+1,d=a+cols+1,c=d+1;
      indices.push(a,b,d,b,c,d,layerCount+d,layerCount+b,layerCount+a,layerCount+d,layerCount+c,layerCount+b);
      if(!present(x,y-1))wall(b,a);if(!present(x+1,y))wall(c,b);
      if(!present(x,y+1))wall(d,c);if(!present(x-1,y))wall(a,d);
    }
    const points=gl.createBuffer(),faces=gl.createBuffer(),texture=gl.createTexture();
    gl.bindBuffer(gl.ARRAY_BUFFER,points);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,faces);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const object={points,faces,texture,count:indices.length,ratio,ey};
    models.set(id,object); return object;
  }
  function orientation(yaw,roll,angle) {
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cr=Math.cos(roll),sr=Math.sin(roll),ca=Math.cos(angle),sa=Math.sin(angle);
    return [ca*cy,sa*cy,-sy, ca*sy*sr-sa*cr,sa*sy*sr+ca*cr,cy*sr,
            ca*sy*cr+sa*sr,sa*sy*cr-ca*sr,cy*cr];
  }
  function render(ctx, frame, x,y,width,yaw,roll,angle,thrust) {
    if(disposed || gl.isContextLost()) return false;
    const id=frame.fighter, hull=model(id,frame.images["hull"+id]);
    if(!hull) return false;
    const bw=Math.max(256,Math.min(1472,Math.round(ctx.canvas.width*.82/64)*64)),bh=Math.round(bw*.73);
    if(canvas.width!==bw||canvas.height!==bh){canvas.width=bw;canvas.height=bh;}
    gl.viewport(0,0,bw,bh);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,hull.points);
    for(const [k,size,offset] of [["pos",3,0],["norm",3,12],["uv",2,24]]) {
      gl.enableVertexAttribArray(attributes[k]);gl.vertexAttribPointer(attributes[k],size,gl.FLOAT,false,32,offset);
    }
    const camera=orientation(yaw,roll,angle);
    gl.uniformMatrix3fv(loc.camera,false,camera);gl.uniform1f(loc.aspect,bw/bh);
    gl.uniform1f(loc.time,frame.seconds);gl.uniform1f(loc.thrust,thrust);
    gl.uniform3fv(loc.tint,id==="red"?[1,.33,.21]:id==="blue"?[.25,.69,1]:[1,.72,.29]);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,hull.texture);gl.uniform1i(loc.paint,0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,hull.faces);gl.drawElements(gl.TRIANGLES,hull.count,gl.UNSIGNED_SHORT,0);
    const height=width*bh/bw;
    function project(a,b,c) {
      const depth=camera[2]*a+camera[5]*b+camera[8]*c;
      const scale=width*.43/(1-.105*depth);
      return [x+(camera[0]*a+camera[3]*b+camera[6]*c)*scale,y+(camera[1]*a+camera[4]*b+camera[7]*c)*scale];
    }
    const exhaust=hull.ey.map(v=>project(-.969,(v-.5)*hull.ratio*2,.10));
    const aft=project(-1.61,0,.10), origin=project(-.969,0,.10);
    ctx.save();ctx.globalCompositeOperation="screen";
    for(let side=0;side<exhaust.length;side++) {
      const [ex,ey]=exhaust[side],dx=(aft[0]-origin[0])*(.39+1.17*thrust),dy=(aft[1]-origin[1])*(.39+1.17*thrust);
      const len=Math.hypot(dx,dy),r=width*(.011+.007*thrust);
      if(len<1) continue;
      const nx=-dy/len,ny=dx/len;
      ctx.save();ctx.transform(dx,dy,nx*r,ny*r,ex,ey);
      const fire=ctx.createLinearGradient(0,0,1,0);fire.addColorStop(0,"#edfaff");fire.addColorStop(.17,"#90dfffdd");
      fire.addColorStop(.42,"#619ce99a");fire.addColorStop(.78,"#6b59ca3c");fire.addColorStop(1,"#588ea000");
      ctx.globalAlpha=.42;ctx.fillStyle=fire;ctx.beginPath();ctx.moveTo(0,-.57);ctx.bezierCurveTo(.19,-.96,.54,-.23,1,0);
      ctx.bezierCurveTo(.65,.11,.24,.85,0,.57);ctx.closePath();ctx.fill();
      ctx.restore();
      for(let j=0;j<14;j++) {
        const p=j/14,span=1-p,sway=Math.sin(p*13-frame.seconds*12+side)*p*r*.26;
        openingGlow(ctx,ex+dx*p+nx*sway,ey+dy*p+ny*sway,r*(.28+.88*Math.sin(p*Math.PI)*span),
                    j<3?"#dbefffba":"#73b3ff75",span*.82);
      }
      for(let j=0;j<9;j++){
        const p=(frame.seconds*(1.05+thrust)+j*.137+side*.17)%1;
        const ripple=Math.sin(p*10+j*13+side)*r*.37*p;
        openingGlow(ctx,ex+dx*p+nx*ripple,ey+dy*p+ny*ripple,r*(.38+.45*p),"#85c9ffaa",(1-p)*.58);
      }
    }
    ctx.restore();
    ctx.drawImage(canvas,x-width/2,y-height/2,width,height);
    return true;
  }
  function dispose() {
    disposed=true;
    for(const m of models.values()){gl.deleteBuffer(m.points);gl.deleteBuffer(m.faces);gl.deleteTexture(m.texture);}
    gl.deleteProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.width=canvas.height=1;
  }
  return {render,dispose};
}

// A tracking relay has separate body, sun-facing wings and a gimballed dish.
// All corners are projected from the same moving camera and painter-sorted by depth.
function drawOpeningRelay(ctx,w,h,t,signal,quiet) {
  const travel=openingEase(0,23,t),x=w*(.16+.53*travel),y=h*(.38-.17*travel);
  const scale=Math.min(w,h*1.7)*(.082+.052*Math.sin(travel*Math.PI));
  const yaw=.64+t*(quiet?.028:.073),pitch=.15+.25*Math.sin(t*.31);
  const cc=Math.cos(yaw),ss=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  function p(a,b,c) {
    const xx=a*cc+c*ss,z=-a*ss+c*cc,yy=b*cp-z*sp,depth=b*sp+z*cp;
    const lens=scale/(3.7-depth*.33);
    return [x+xx*lens,y+yy*lens,depth];
  }
  const faces=[];
  function face(verts,fill) {
    const v=verts.map(k=>p(...k));
    faces.push({v,fill,z:v.reduce((sum,k)=>sum+k[2],0)/v.length});
  }
  const corners=[[-.45,-.46,-.48],[.45,-.46,-.48],[.45,.46,-.48],[-.45,.46,-.48],
    [-.45,-.46,.48],[.45,-.46,.48],[.45,.46,.48],[-.45,.46,.48]];
  for(const [indices,tint] of [[[0,1,2,3],"#56452e"],[[4,7,6,5],"#bb9e62"],[[0,4,5,1],"#c6bc94"],
    [[3,2,6,7],"#40382c"],[[0,3,7,4],"#9a804b"],[[1,5,6,2],"#756141"]])
    face(indices.map(i=>corners[i]),tint);
  const tilt=.42+.25*Math.sin(t*.17),po=(a,v)=>[a,v*Math.cos(tilt),v*Math.sin(tilt)];
  for(const side of [-1,1]){
    face([[side*.38,-.04,0],[side*1.67,-.04,0],[side*1.67,.04,0],[side*.38,.04,0]],"#afa588");
    face([po(side*.92,-.56),po(side*3.74,-.56),po(side*3.74,.56),po(side*.92,.56)],"#817d70");
    for(let j=0;j<9;j++)for(let i=0;i<3;i++) {
      const a=side*(.96+j*.305),b=a+side*.285,v=-.52+i*.35;
      const k=Math.round(35+16*Math.sin(t*.22+side*.9+j*.12));
      face([po(a,v),po(b,v),po(b,v+.32),po(a,v+.32)],`rgb(${k-12},${k+8},${k+29})`);
    }
  }
  const gimbal=.32+.46*Math.sin(t*.34);
  for(let j=0;j<20;j++){
    const arc=i=>[Math.cos(i*Math.PI/10)*.62,-.83+Math.sin(i*Math.PI/10)*gimbal,
                  Math.sin(i*Math.PI/10)*.63+.08];
    face([[0,-.57,.06],arc(j),arc(j+1)],j<9?"#d6d8c7":"#959e99");
  }
  faces.sort((a,b)=>a.z-b.z);
  ctx.save();
  for(const {v,fill} of faces){ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(v[0][0],v[0][1]);
    for(let i=1;i<v.length;i++)ctx.lineTo(v[i][0],v[i][1]);ctx.closePath();ctx.fill();}
  const tip=p(0,-1.26,.13);openingGlow(ctx,tip[0],tip[1],scale*.091,signal?"#aeefff":"#ffe9ac",.55+.30*Math.cos(t*3.2));
  ctx.restore();
}

function openingCreatureInFlight(ctx,img,x,y,width,height,t,index,alpha) {
  if(!img?.naturalWidth || alpha<=0)return;
  const spans=[.075,.045,.034,.06,.034,.081,.138,.061,.15,.076,.083];
  const rate=[1.42,.96,.79,1.18,.93,1.04,1.65,.75,1.26,1.31,1.1][index];
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);
  const twist=Math.sin(t*.66+index*1.31);
  ctx.rotate(twist*(index===5?.14:.059));
  const seg=9,sw=img.naturalWidth/seg;
  for(let s=0;s<seg;s++){
    const u=(s+.5)/seg;
    const curl=Math.sin(t*rate-u*5.4+index)*spans[index]*height*Math.pow(Math.abs(u-.42)*1.60,1.27);
    const flutter=1+(index===0||index===7?.078:.043)*Math.sin(t*rate+u*3.2+index);
    const segmentWidth=width/seg;
    ctx.drawImage(img,s*sw,0,sw,img.naturalHeight,-width*.5+s*segmentWidth,
                  curl-height*.5*flutter,segmentWidth+.38,height*flutter);
  }
  ctx.restore();
}

function openingDockRig(ctx,w,h,t,fighter,quiet) {
  const release=openingEase(3.9,8.9,t), dim=quiet?.55:1;
  const vanX=w*.776,vanY=h*.57;
  // The deck lamps have constant world spacing; their projection compresses at the exit.
  for(let lane=0;lane<2;lane++)for(let j=0;j<12;j++){
    const z=(j+1)/12,q=z*z;
    const x=openingMix(vanX,w*(lane?.99:.17),q),y=openingMix(vanY,h*.99,q);
    const pulse=.26+.72*Math.max(0,Math.cos(t*2.3-j*.79));
    openingGlow(ctx,x,y,1+q*h*.014,"#ffbb794d",pulse*dim);
  }
  const scale=Math.min(w,h*1.65);
  function rod(a,b,width,shade){
    const grad=ctx.createLinearGradient(a[0],a[1],b[0],b[1]);
    grad.addColorStop(0,"#222b30");grad.addColorStop(.28,shade);grad.addColorStop(.72,"#586368");grad.addColorStop(1,"#1d262e");
    ctx.strokeStyle="#121a20";ctx.lineCap="round";ctx.lineWidth=width*1.55;
    ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();ctx.strokeStyle=grad;ctx.lineWidth=width;ctx.stroke();
  }
  ctx.save();
  for(const side of [-1,1]){
    const foot=[w*.52+side*scale*.16,h*.757];
    const elbow=[foot[0]+side*scale*(.02+.09*release),h*(.69+.043*release)];
    const palm=[foot[0]+side*scale*(-.054+.047*release),h*(.593+.11*release)];
    ctx.save();ctx.translate(foot[0],foot[1]+scale*.009);ctx.scale(1,.18);
    openingGlow(ctx,0,0,scale*.076,"#03070bdb");ctx.restore();
    const anchor=scale*.027;
    ctx.beginPath();ctx.moveTo(foot[0]-anchor,foot[1]);ctx.lineTo(foot[0]-anchor*.49,foot[1]-anchor*.38);
    ctx.lineTo(foot[0]+anchor,foot[1]-anchor*.34);ctx.lineTo(foot[0]+anchor*.62,foot[1]+anchor*.12);ctx.closePath();
    const footMetal=ctx.createLinearGradient(0,foot[1]-anchor*.36,0,foot[1]+anchor*.15);
    footMetal.addColorStop(0,"#637076");footMetal.addColorStop(.45,"#353f42");footMetal.addColorStop(1,"#151e24");
    ctx.fillStyle=footMetal;ctx.fill();
    for(const d of [-.6,.54]){ctx.fillStyle="#a0a4a0";ctx.beginPath();
      ctx.ellipse(foot[0]+d*anchor,foot[1]-anchor*.12,anchor*.082,anchor*.035,0,0,Math.PI*2);ctx.fill();}
    rod(foot,elbow,scale*.0067,"#72838b");rod(elbow,palm,scale*.0056,"#a1947a");
    const ram=[openingMix(elbow[0],palm[0],.46),openingMix(elbow[1],palm[1],.46)];
    rod([foot[0]+anchor*.73*side,foot[1]-anchor*.16],ram,scale*.0034,"#bcc8cf");
    const radius=scale*.0067;
    const bearing=ctx.createRadialGradient(elbow[0]-radius*.29,elbow[1]-radius*.4,0,...elbow,radius);
    bearing.addColorStop(0,"#a8b4b7");bearing.addColorStop(.45,"#394952");bearing.addColorStop(.68,"#767d79");bearing.addColorStop(1,"#19252d");
    ctx.fillStyle=bearing;ctx.beginPath();ctx.arc(...elbow,radius,0,2*Math.PI);ctx.fill();
    openingGlow(ctx,palm[0],palm[1],scale*.0065,release>.6?"#92d9c87a":"#f6b66e86");
  }
  ctx.restore();
}
