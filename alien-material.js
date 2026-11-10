"use strict";

let alienTissueTexture;

function getAlienTissueTexture() {
  if (alienTissueTexture) return alienTissueTexture;
  const placeholder = document.createElement("canvas");
  placeholder.width = 1;
  placeholder.height = 1;
  const context = placeholder.getContext("2d");
  context.fillStyle = "#797979";
  context.fillRect(0, 0, 1, 1);

  const texture = new StarBreaker3D.CanvasTexture(placeholder);
  texture.name = "Hadal tissue · pigment / roughness / relief";
  const source = new Image();
  source.onload = () => {
    texture.image = source;
    texture.needsUpdate = true;
  };
  source.src = "assets/models/alien-microdetail.png";
  alienTissueTexture = texture;
  return texture;
}

function applyAlienPbrDetail(material) {
  if (!material.isMeshStandardMaterial || material.userData.alienTissueDetail) return;
  const name = material.name.toLowerCase();
  const membrane = name.includes("membrane");
  const ossified = name.includes("ossified");
  const emitter = name.includes("bioluminescence");
  const frequency = membrane ? .40 : (ossified ? .56 : .44);
  const relief = membrane ? .018 : (emitter ? .014 : .027);
  const texture = getAlienTissueTexture();
  const compile = material.onBeforeCompile;
  const originalKey = material.customProgramCacheKey();
  material.userData.alienTissueDetail = true;

  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.uniforms.alienTissue = { value: texture };
    shader.uniforms.alienTissueFrequency = { value: frequency };
    shader.uniforms.alienTissueRelief = { value: relief };

    // Read the neutral mesh coordinates so the texture moves with the morphs.
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      varying vec3 vAlienRest;
      varying vec3 vAlienAxis;
    `).replace("#include <begin_vertex>", `#include <begin_vertex>
      vAlienRest = position;
      vAlienAxis = normal;
    `);

    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      uniform sampler2D alienTissue;
      uniform float alienTissueFrequency;
      uniform float alienTissueRelief;
      varying vec3 vAlienRest;
      varying vec3 vAlienAxis;

      vec3 tissuePatch(vec2 uv) {
        // Gradients come from the unwrapped coordinates. The seam cannot create a false low mip.
        vec2 tile = (fract(uv) * 511.0 + 0.5) / 512.0;
        return textureGrad(alienTissue, tile, dFdx(uv), dFdy(uv)).rgb;
      }

      vec3 sampleTissue() {
        vec3 p = vAlienRest * vec3(1.0, .72, 1.22) * alienTissueFrequency;
        vec3 weights = pow(abs(vAlienAxis), vec3(3.5));
        weights /= max(dot(weights, vec3(1.0)), .001);
        return tissuePatch(p.zy + vec2(.27, .13)) * weights.x
          + tissuePatch(p.xz + vec2(.51, .09)) * weights.y
          + tissuePatch(p.xy) * weights.z;
      }

      vec3 tissueNormal(vec3 n, float relief) {
        vec3 x = dFdx(-vViewPosition);
        vec3 y = dFdy(-vViewPosition);
        vec3 a = cross(y, n);
        vec3 b = cross(n, x);
        float det = dot(x, a);
        vec3 grad = (dFdx(relief) * a + dFdy(relief) * b) * sign(det);
        return normalize(n - grad / max(abs(det), 0.00003));
      }
    `).replace("#include <color_fragment>", `#include <color_fragment>
      vec3 organic = sampleTissue();
      float fibers = smoothstep(.11, .72, organic.r);
      diffuseColor.rgb *= mix(.58, 1.31, fibers);
    `).replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + (organic.g - .46) * .47 - (fibers - .5) * .10, .28, .80);
    `).replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      normal = tissueNormal(normal, organic.b * alienTissueRelief);
    `).replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
      float nacreEdge = pow(max(0.0, 1.0 - abs(dot(normal, normalize(vViewPosition)))), 2.4);
      vec3 nacre = mix(vec3(.84, 1.07, 1.18), vec3(1.16, .93, 1.09), fibers);
      reflectedLight.indirectSpecular *= mix(vec3(1.0), nacre, nacreEdge * .68);
    `).replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      // Vein interiors remain dark during the brightest attack cue.
      totalEmissiveRadiance *= mix(.18, 1.04, smoothstep(.20, .67, organic.r));
    `);
  };
  material.customProgramCacheKey = () => originalKey + "|star-breaker-tissue-v1";
  material.needsUpdate = true;
}
