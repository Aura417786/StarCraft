"use strict";

// One shared, bounded surface, composited into the existing 2D combat canvas.
// This owns appearance only. The caller retains the real circle/annulus mask.
const BlackHoleSurface = (() => {
  let texture, ready = false, preparing = false, failed = false, device = null;
  let draws = 0, renders = 0, frameDraws = 0, frameRenders = 0, mode = "loading", reason = "";
  const vertex = `#version 300 es
    out vec2 uv;
    void main(){ uv=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
      gl_Position=vec4(uv*2.-1.,0.,1.); }`;
  const fragment = `#version 300 es
    precision highp float;
    uniform sampler2D disk;
    uniform float age;
    in vec2 uv;
    out vec4 color;
    void main(){
      vec2 p=uv*2.-1.;
      float r=length(p), a=atan(p.y,p.x);
      // Differential rotation: the inner disk runs faster than the outer dust.
      // Continuous advection avoids tiled frames, glitter noise and hard spokes.
      float spin=age*(.035+.075/(.25+r));
      float bend=.008*sin(a*5.-age*.48+r*17.)*smoothstep(.24,.48,r);
      vec2 q=vec2(cos(a+spin),sin(a+spin))*(r+bend);
      vec4 tex=texture(disk,q*.4+.5);
      float edge=1.-smoothstep(.88,.995,r);
      // Keep transparent outskirts; do not turn the field into an opaque disk.
      color=vec4(tex.rgb,tex.a*edge);
    }`;
  const idle = fn => typeof requestIdleCallback === "function"
    ? requestIdleCallback(fn, { timeout: 1200 }) : setTimeout(fn, 0);

  function setup() {
    if (preparing || device || failed || !ready) return;
    if (typeof location !== "undefined" && !/^https?:$/.test(location.protocol)) return;
    preparing = true;
    const surface = document.createElement("canvas");
    surface.width = surface.height = 512;
    const gl = surface.getContext("webgl2", { alpha:true, depth:false, stencil:false,
      antialias:false, premultipliedAlpha:false, preserveDrawingBuffer:true, powerPreference:"high-performance" });
    if (!gl) { failed=true; reason="webgl-unavailable"; return; }
    const program=gl.createProgram(), shaders=[];
    for (const [kind, source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]) {
      const shader=gl.createShader(kind);gl.shaderSource(shader,source);gl.compileShader(shader);
      gl.attachShader(program,shader);shaders.push(shader);
    }
    gl.linkProgram(program);
    const parallel=gl.getExtension("KHR_parallel_shader_compile");
    surface.addEventListener("webglcontextlost", event => {
      event.preventDefault();failed=true;reason="context-lost";device=null;
    });
    const finish=()=>{
      if (failed) return;
      if (parallel && !gl.getProgramParameter(program,parallel.COMPLETION_STATUS_KHR)) {
        setTimeout(()=>idle(finish),40);return;
      }
      for(const shader of shaders) gl.deleteShader(shader);
      if (!gl.getProgramParameter(program,gl.LINK_STATUS)) {
        reason="shader-link-failed";failed=true;gl.deleteProgram(program);
        gl.getExtension("WEBGL_lose_context")?.loseContext();return;
      }
      gl.useProgram(program);
      const sampler=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,sampler);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,texture);
      device={canvas:surface,gl,age:gl.getUniformLocation(program,"age"),lastTime:NaN,size:512};
    };
    idle(finish);
  }
  function preload() {
    if(texture || typeof Image === "undefined") return;
    texture=new Image();
    texture.onload=()=>{
      ready=texture.naturalWidth>0;
      if (typeof visualQuality !== "undefined" && visualQuality.id!=="low") idle(setup);
    };
    texture.onerror=()=>{failed=true;reason="texture-unavailable";};
    texture.src="assets/vfx/nextgen/black-hole-accretion.png";
  }
  function placeholder(ctx,r,age) {
    // Network/error fallback still has a dark horizon and a broad accretion body.
    const g=ctx.createRadialGradient(0,0,r*.22,0,0,r);
    g.addColorStop(0,"#04030c");g.addColorStop(.07,"#94b6ff");
    g.addColorStop(.14,"#5364d9");g.addColorStop(.30,"#7939cba8");
    g.addColorStop(.68,"#742a851d");g.addColorStop(1,"#682a8000");
    ctx.fillStyle=g;ctx.fillRect(-r,-r,r*2,r*2);
    for(let i=0;i<40;i++){
      const radius=r*(.27+i*.016),start=i*2.399+age*.12;
      ctx.beginPath();ctx.arc(0,0,radius,start,start+1.1+(i%3)*.2);
      ctx.strokeStyle=i%3?"#a06af48a":"#c8d6ffb0";ctx.lineWidth=r*.007;ctx.stroke();
    }
    ctx.fillStyle="#010107";ctx.beginPath();ctx.arc(0,0,r*.23,0,Math.PI*2);ctx.fill();
  }
  function draw(ctx,x,y,r,time,alpha,quality="high") {
    if(!(r>0) || !Number.isFinite(r)) return false;
    preload();draws++;frameDraws++;
    // Low quality and reduced-motion views keep the same authored surface.
    if(ready && quality!=="low" && !failed && !device) idle(setup);
    ctx.save();ctx.translate(x,y);ctx.globalAlpha=alpha;
    if(ready){
      ctx.fillStyle="#010107";ctx.beginPath();
      ctx.arc(0,0,r*.212,0,Math.PI*2);ctx.fill();ctx.globalAlpha=alpha;
    }
    if(ready && device && quality!=="low" && frameDraws<=2){
      const size=quality==="high"?512:320;
      const tick=Math.floor(time*30)/30;
      if(device.lastTime!==tick || device.size!==size){
        if(device.size!==size){device.canvas.width=device.canvas.height=size;device.size=size;}
        device.gl.viewport(0,0,size,size);device.gl.uniform1f(device.age,tick);
        device.gl.drawArrays(device.gl.TRIANGLES,0,3);device.lastTime=tick;renders++;frameRenders++;
      }
      ctx.drawImage(device.canvas,-r,-r,r*2,r*2);mode="advected-texture";
    }else if(ready){
      ctx.rotate(time*.11);ctx.drawImage(texture,-r*1.25,-r*1.25,r*2.5,r*2.5);mode="canvas-texture";
    }else{placeholder(ctx,r,time);mode="procedural-fallback";}
    ctx.restore();return true;
  }
  preload();
  return Object.freeze({draw,beginFrame:()=>{frameDraws=frameRenders=0;},diagnostics:()=>({ready,mode,reason,draws,renders,frameRenders,
    extraWebGLContexts:device?1:0,resolution:device?.size||0,animationHz:30,maxDrawsPerFrame:2})});
})();
