"use strict";

const starBreakerModelNames = [
  "broodmother", "marrow-stalker", "cinder-maw", "rift-weaver", "pulse-binder",
  "mirror-ray", "thunder-wyrm", "spore-regent", "dimension-maw", "neural-king",
  "abyssal-confluence", "abyssal-egg", "marrow-reliquary", "uncased-furnace", "unstrung-heart",
  "double-lock", "mirror-sepulcher", "severed-thunder", "last-spore-nest", "world-eater",
  "neural-crown", "extinction-core",
];
const starBreakerModelCache = new Map();
let starBreakerModelStage;
let starBreakerModelsUnavailable = false;
// The sector plate motivates the key; the darker opposite hemisphere preserves shape.
const bossSectorLights = [
  { id: "orbit", aim: [.68, .64, .58], rgb: [180, 218, 255], rim: [86, 151, 208] },
  { id: "belt", aim: [-.73, .43, .64], rgb: [255, 211, 158], rim: [118, 154, 190] },
  { id: "wreck", aim: [.58, .52, .67], rgb: [255, 190, 153], rim: [122, 133, 174] },
  { id: "citadel", aim: [.51, -.43, .68], rgb: [179, 238, 244], rim: [137, 173, 217] },
  { id: "rift", aim: [-.55, .48, .71], rgb: [215, 179, 253], rim: [110, 131, 219] },
];
const bossEmitterLights = [
  ["#f75fa5", -.09, .01, .64], ["#cb9bda", -.18, 0, .16], ["#ff7840", -.24, -.025, 4.85],
  ["#b856ea", -.10, .02, .30], ["#7fdf55", -.15, -.03, .20], ["#72dfff", -.05, .04, .24],
  ["#507efa", -.14, .01, .33], ["#b1ed50", -.08, .01, .73], ["#9e66ef", -.22, 0, .58],
  ["#ee669e", -.08, .03, .46], ["#f16ab6", -.05, .05, .81],
];

function canUseStarBreakerModels() {
  return !starBreakerModelsUnavailable && typeof StarBreaker3D !== "undefined"
    && typeof visualQuality !== "undefined" && visualQuality.modelScale > 0
    && typeof location !== "undefined" && /^https?:$/.test(location.protocol)
    && typeof document.createElement === "function";
}

function starBreakerFinaleModelIndex(type) { return 11 + type; }

function releaseStarBreakerModel(entry) {
  entry.evicted = true;
  // Three still polls the program object while compileAsync is pending.
  if (!entry.model || entry.warming) return;
  entry.model.mixer?.stopAllAction();
  entry.model.mixer?.uncacheRoot(entry.model.center);
  const materials = new Set(), textures = new Set(), sources = new Set(), geometry = new Set();
  entry.model.center.traverse(mesh => {
    if (!mesh.isMesh) return;
    geometry.add(mesh.geometry);
    for (const material of [].concat(mesh.material)) materials.add(material);
  });
  for (const mesh of geometry) mesh.dispose();
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) {
    sources.add(texture.source?.data);
    texture.dispose();
  }
  for (const source of sources) source?.close?.();
  entry.model.turn.removeFromParent();
}

function warmStarBreakerModel(entry, stage) {
  if (entry.evicted || !canUseStarBreakerModels()) return;
  if (stage.warmEntry) {
    stage.queuedWarm = entry;
    return;
  }
  stage.warmEntry = entry;
  entry.warming = true;
  Promise.resolve().then(() => stage.renderer.compileAsync(entry.model.turn, stage.camera, stage.scene))
    .catch(() => { /* Draw path remains available. */ })
    .finally(() => {
      entry.warming = false;
      if (entry.evicted) releaseStarBreakerModel(entry);
      const queued = stage.queuedWarm;
      stage.queuedWarm = null;
      stage.warmEntry = null;
      if (queued) warmStarBreakerModel(queued, stage);
    });
}

function preloadStarBreakerModel(index) {
  if (!canUseStarBreakerModels() || !starBreakerModelNames[index]) return null;
  let entry = starBreakerModelCache.get(index);
  if (entry) {
    starBreakerModelCache.delete(index);
    starBreakerModelCache.set(index, entry);
    return entry;
  }
  // The current body, the next telegraphed encounter and the current finale fit this budget.
  entry = { model: null, evicted: false };
  starBreakerModelCache.set(index, entry);
  if (starBreakerModelCache.size > 3) {
    const oldest = starBreakerModelCache.keys().next().value;
    releaseStarBreakerModel(starBreakerModelCache.get(oldest));
    starBreakerModelCache.delete(oldest);
  }
  const { GLTFLoader, Box3, Vector3, Group, AnimationMixer } = StarBreaker3D;
  new GLTFLoader().load(`assets/models/${starBreakerModelNames[index]}.glb`, gltf => {
    const center = gltf.scene;
    const bounds = new Box3().setFromObject(center);
    const size = bounds.getSize(new Vector3());
    if (!Number.isFinite(size.x) || size.x <= 0 || size.y <= 0) return;
    const turn = new Group();
    center.position.sub(bounds.getCenter(new Vector3()));
    turn.add(center);
    const animatedMeshes = [];
    center.traverse(node => {
      if (node.isMesh && node.morphTargetDictionary) {
        if (!node.material.normalMap && typeof applyAlienPbrDetail === "function") applyAlienPbrDetail(node.material);
        node.frustumCulled = false;
        animatedMeshes.push({ node, attack: node.morphTargetDictionary.Attack,
          unfurl: node.morphTargetDictionary.Unfurl, emissive: node.material.emissiveIntensity });
      }
    });
    const mixer = gltf.animations.length ? new AnimationMixer(center) : null;
    for (const clip of gltf.animations) mixer.clipAction(clip).play();
    const duration = Math.max(1, ...gltf.animations.map(clip => clip.duration));
    entry.model = { center, turn, size, mixer, duration, animatedMeshes };
    if (entry.evicted) {
      releaseStarBreakerModel(entry);
      return;
    }
    // The warning starts asset work before the encounter. Compile off the draw path when idle.
    const prepare = () => {
      if (entry.evicted || !canUseStarBreakerModels()) return;
      const stage = bossModelStage();
      if (!stage) return;
      const journey = sceneryJourney();
      preloadBossEnvironment(stage, journey.current);
      preloadBossEnvironment(stage, journey.next);
      warmStarBreakerModel(entry, stage);
    };
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(prepare, { timeout: 1500 });
    else window.setTimeout(prepare, 0);
  }, undefined, () => { /* The calibrated 2D asset remains available. */ });
  return entry;
}

function bossModelLight(scene, color, intensity, point) {
  const light = new StarBreaker3D.DirectionalLight(color, intensity);
  light.position.set(...point);
  scene.add(light);
  return light;
}

function makeBossModelEnvironment(renderer, scene) {
  const env = document.createElement("canvas");
  env.width = 256; env.height = 128;
  const ctx = env.getContext("2d");
  ctx.fillStyle = "#1b2339";
  ctx.fillRect(0, 0, 256, 128);
  for (const [x, y, r, color] of [[72, 38, 32, "#d7f3ff"], [183, 48, 23, "#84dfff"], [140, 105, 39, "#c78b94"]]) {
    const light = ctx.createRadialGradient(x, y, 1, x, y, r);
    light.addColorStop(0, color);
    light.addColorStop(1, color + "00");
    ctx.fillStyle = light; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const texture = new StarBreaker3D.CanvasTexture(env);
  texture.mapping = StarBreaker3D.EquirectangularReflectionMapping;
  texture.colorSpace = StarBreaker3D.SRGBColorSpace;
  const generator = new StarBreaker3D.PMREMGenerator(renderer);
  const environment = generator.fromEquirectangular(texture);
  scene.environment = environment.texture;
  scene.environmentIntensity = .62;
  generator.dispose(); texture.dispose();
  return environment;
}

function preloadBossEnvironment(stage, sector) {
  if (stage.sectorMaps.has(sector)) return;
  const image = new Image();
  stage.sectorMaps.set(sector, null);
  image.onload = () => {
    const prepare = () => {
      if (starBreakerModelsUnavailable || stage.renderer.getContext().isContextLost()) return;
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const radiance = new Float32Array(pixels.length);
      for (let i = 0; i < pixels.length; i += 4) {
        for (let channel = 0; channel < 3; channel++) radiance[i + channel] = 2 ** (pixels[i + channel] * (4 / 255)) - 1;
        radiance[i + 3] = 1;
      }
      const { DataTexture, FloatType, RGBAFormat, LinearSRGBColorSpace, EquirectangularReflectionMapping, PMREMGenerator } = StarBreaker3D;
      const map = new DataTexture(radiance, canvas.width, canvas.height, RGBAFormat, FloatType);
      map.colorSpace = LinearSRGBColorSpace;
      map.mapping = EquirectangularReflectionMapping;
      map.flipY = true;
      map.needsUpdate = true;
      const generator = new PMREMGenerator(stage.renderer);
      try {
        stage.sectorMaps.set(sector, generator.fromEquirectangular(map));
      } catch { /* The default environment stays available. */ }
      finally { generator.dispose(); map.dispose(); }
    };
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(prepare, { timeout: 1200 });
    else window.setTimeout(prepare, 0);
  };
  image.src = `assets/scenery/sector-light-${bossSectorLights[sector].id}.png`;
}

function bossModelStage() {
  if (starBreakerModelStage) return starBreakerModelStage;
  try {
    const canvas = document.createElement("canvas");
    const { WebGLRenderer, Scene, OrthographicCamera, HemisphereLight, PointLight, AgXToneMapping } = StarBreaker3D;
    const gl = canvas.getContext("webgl2", {
      alpha: true, antialias: true, powerPreference: "high-performance", depth: true,
    });
    if (!gl) throw new Error("WebGL 2 unavailable");
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    if (info && /swiftshader|llvmpipe|software rasterizer/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))) {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      throw new Error("Software graphics");
    }
    const renderer = new WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true });
    renderer.toneMapping = AgXToneMapping;
    renderer.toneMappingExposure = 1.16;
    renderer.setClearColor(0, 0);
    const scene = new Scene();
    const camera = new OrthographicCamera(-2.5, 2.5, 1.6, -1.6, .01, 40);
    camera.position.set(-.45, .75, 8);
    camera.lookAt(0, 0, 0);
    const ambience = new HemisphereLight(0xd0dceb, 0x33354a, .76);
    scene.add(ambience);
    const key = bossModelLight(scene, 0xc7edff, 2.1, [3, 3, 5]);
    const rim = bossModelLight(scene, 0x5ad4ff, 1.8, [3, 2, -2.5]);
    const bounce = bossModelLight(scene, 0xf784a4, .65, [0, -2.7, 3]);
    const emitter = new PointLight(0xffffff, 0, 0, 2);
    const spill = new PointLight(0xffffff, 0, 0, 2);
    scene.add(emitter, spill);
    const environment = makeBossModelEnvironment(renderer, scene);
    canvas.addEventListener("webglcontextlost", event => {
      event.preventDefault();
      starBreakerModelsUnavailable = true;
    });
    starBreakerModelStage = { renderer, scene, camera, key, rim, bounce, emitter, spill, environment,
      sectorMaps: new Map(), current: null };
  } catch {
    starBreakerModelsUnavailable = true;
  }
  return starBreakerModelStage;
}

function bossModelRenderWidth(width, pixelRatio, quality = visualQuality) {
  const wanted = Math.ceil(width * Math.min(pixelRatio || 1, 2) * quality.modelScale / 16) * 16;
  return clamp(wanted, quality.modelMin, quality.modelMax);
}

function lightBossModel(stage, model, type, pose, x, y, width) {
  const { scene, key, rim, bounce, emitter, spill } = stage;
  const { current, next, blend } = sceneryJourney();
  const near = blend < .5 ? current : next;
  preloadBossEnvironment(stage, near);
  const map = stage.sectorMaps.get(near);
  scene.environment = (map ?? stage.environment).texture;
  // A brief reduction in reflection hides the cubemap change during a sector dissolve.
  scene.environmentIntensity = (map ? .73 : .54) * (.79 + Math.abs(.5 - blend) * .42);
  const from = bossSectorLights[current], to = bossSectorLights[next];
  const mix = (a, b) => a + (b - a) * blend;
  const mixColor = (field, light) => light.color.setRGB(...from[field].map((channel, i) => mix(channel, to[field][i]) / 255),
    StarBreaker3D.SRGBColorSpace);
  mixColor("rgb", key); mixColor("rim", rim);
  key.position.set(...from.aim.map((channel, i) => mix(channel, to.aim[i]) * 7));
  rim.position.set(key.position.x * .64, key.position.y * .58 + 1.6, -4);
  if (pose.cooling) key.color.set("#a0eafa");
  key.intensity = 2.17 + pose.hit * .43 + (pose.cooling ? .52 : 0);
  rim.intensity = 1.38 + pose.charge * .56 + pose.ruptured * .22 + (pose.intensity ?? 0) * .37;
  const light = shipReflectionLight();
  bounce.color.setRGB(...light.channels.map(channel => channel / 255), StarBreaker3D.SRGBColorSpace);
  bounce.position.set(-key.position.x * .54, -light.side * 4, 3);
  bounce.intensity = .60 * (light.intensity ?? 1) + pose.charge * .17;

  const [color, px, py, strength] = bossEmitterLights[type % bossEmitterLights.length];
  const unit = model.size.x;
  const furnace = type % 11 === 2;
  emitter.color.set(color);
  emitter.position.set(px * unit, py * unit, model.size.z * .48 + unit * (furnace ? .21 : .12));
  emitter.distance = unit * (furnace ? .93 : .68);
  emitter.intensity = strength * unit * unit * (.11 + pose.charge * .074 + pose.ruptured * .042
    + (type >= 11 ? .028 : 0)) * (pose.cooling ? .45 : 1);

  const pulse = typeof activeCombatLight === "function" ? activeCombatLight() : null;
  const subject = typeof bossPresentation !== "undefined" && bossPresentation?.target?.type === type % 11
    ? bossPresentation.target : boss;
  // Presentation shells render at a translated local origin, but the flash
  // remains in battlefield space. Sample both lights in the same space.
  const worldX = x === 0 && y === 0 ? subject?.x ?? x : x;
  const worldY = x === 0 && y === 0 ? subject?.y ?? y : y;
  const dx = pulse ? pulse.x - worldX : 0, dy = pulse ? pulse.y - worldY : 0;
  const falloff = pulse ? Math.max(0, 1 - Math.hypot(dx, dy) / Math.max(1, pulse.radius + width * .4)) : 0;
  spill.intensity = falloff * falloff * (pulse?.strength ?? 0) * unit * unit * .28;
  if (falloff > 0) {
    spill.color.set(pulse.color);
    spill.position.set(clamp(dx / width, -.78, .78) * unit, clamp(-dy / width, -.68, .68) * unit, unit * .44);
  }
}

function drawBossContactShadow(ctx, x, y, width, height) {
  ctx.save();
  // Tight occlusion beneath the shell and a separate, softer shadow displaced
  // away from the key. Both affect the scenery beneath the opaque model only.
  const { current, next, blend } = sceneryJourney();
  const key = bossSectorLights[blend < .5 ? current : next].aim;
  ctx.translate(x - key[0] * width * .095, y + height * (.24 + key[1] * .075));
  ctx.rotate(key[0] * -.10);
  ctx.scale(1, height / width * .64);
  const layer = (cy, radius, opacity) => {
    const shade = ctx.createRadialGradient(0, cy, radius * .08, 0, cy, radius);
    shade.addColorStop(0, "rgba(1, 2, 7, " + opacity + ")");
    shade.addColorStop(.54, "rgba(2, 4, 11, " + opacity * .53 + ")");
    shade.addColorStop(1, "rgba(4, 8, 18, 0)");
    ctx.fillStyle = shade;
    ctx.fillRect(-radius, cy - radius, radius * 2, radius * 2);
  };
  layer(width * .08, width * .69, .75);
  layer(-width * .075, width * .43, .78);
  ctx.restore();
}

function drawStarBreakerModel(ctx, type, x, y, width, height, pose) {
  const model = preloadStarBreakerModel(type)?.model;
  if (!model) return false;
  const stage = bossModelStage();
  if (!stage) return false;
  const { renderer, scene, camera } = stage;
  if (stage.current !== model) {
    stage.current?.turn.removeFromParent();
    scene.add(model.turn);
    stage.current = model;
  }
  const { time, charge, ruptured, recoil, quiet } = pose;
  model.mixer?.setTime(time % Math.max(.01, model.duration));
  model.turn.rotation.set(.025 + Math.sin(time * 1.3) * .08, -.11 + Math.sin(time * .77) * .18,
    Math.sin(time * .91) * .031 + recoil * .06 + (pose.turn ?? 0));
  model.turn.position.set(recoil * model.size.x * .06, 0, 0);
  for (const { node, attack, unfurl, emissive } of model.animatedMeshes) {
    if (attack !== undefined) node.morphTargetInfluences[attack] = charge;
    if (unfurl !== undefined) node.morphTargetInfluences[unfurl] = ruptured;
    if (node.material.emissive && emissive > 0) {
      node.material.emissiveIntensity = emissive * (.67 + charge * 1.0 + ruptured * .44
        + Math.sin(time * 3.2) * .08);
    }
  }
  const paddedWidth = width * 1.14, paddedHeight = height * 1.14;
  const aspect = paddedWidth / paddedHeight;
  const fittedWidth = Math.max(model.size.x, model.size.y * aspect) * 1.18;
  const renderWidth = bossModelRenderWidth(paddedWidth, window.devicePixelRatio);
  const renderHeight = Math.max(112, Math.round(renderWidth / aspect));
  const target = renderer.domElement;
  if (target.width !== renderWidth || target.height !== renderHeight) renderer.setSize(renderWidth, renderHeight, false);
  camera.left = -fittedWidth / 2; camera.right = fittedWidth / 2;
  camera.top = fittedWidth / aspect / 2; camera.bottom = -camera.top;
  camera.updateProjectionMatrix();
  lightBossModel(stage, model, type, pose, x, y, width);
  drawBossContactShadow(ctx, x, y, width, height);
  if (!quiet && visualQuality.glow) {
    const aura = ctx.createRadialGradient(x, y, 0, x, y, Math.max(width, height) * .53);
    aura.addColorStop(0, pose.color + "32"); aura.addColorStop(1, pose.color + "00");
    ctx.save();
    ctx.fillStyle = aura;
    ctx.globalAlpha *= visualQuality.glow * .56;
    ctx.fillRect(x - width, y - height, width * 2, height * 2);
    ctx.restore();
  }
  renderer.render(scene, camera);
  ctx.drawImage(target, x - paddedWidth / 2, y - paddedHeight / 2, paddedWidth, paddedHeight);
  return true;
}

function drawStarBreakerBoss(ctx, target, quiet) {
  if (target.disabled) return false;
  const age = target.age || 0;
  const charge = alienArtCharge(target);
  const pressure = target.phase === "rupture";
  const stageStrength = target.enraged ? Math.min(1, (age - (target.enragedAt ?? age)) * 1.7) : 0;
  const recoil = target.phase === "attack" && !quiet ? Math.exp(-(target.phaseTime || 0) * 7) : 0;
  const cue = target.cinematicPose;
  return drawStarBreakerModel(ctx, target.type, target.x, target.y, target.width, target.height, {
    time: quiet ? 0 : age, charge: cue?.charge ?? (pressure ? .85 : charge),
    ruptured: cue?.unfurl ?? (pressure ? 1 : stageStrength),
    hit: target.hitFlash ? 1 : 0, recoil, quiet, color: target.color, turn: cue?.turn, intensity: cue?.intensity,
  });
}
