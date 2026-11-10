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

function canUseStarBreakerModels() {
  return !starBreakerModelsUnavailable && typeof StarBreaker3D !== "undefined"
    && typeof visualQuality !== "undefined" && visualQuality.modelScale > 0
    && typeof location !== "undefined" && /^https?:$/.test(location.protocol)
    && typeof document.createElement === "function";
}

function starBreakerFinaleModelIndex(type) { return 11 + type; }

function releaseStarBreakerModel(entry) {
  entry.evicted = true;
  if (!entry.model) return;
  entry.model.mixer?.stopAllAction();
  entry.model.mixer?.uncacheRoot(entry.model.center);
  entry.model.center.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
  entry.model.turn.removeFromParent();
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
        if (typeof applyAlienPbrDetail === "function") applyAlienPbrDetail(node.material);
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
    window.requestIdleCallback?.(() => {
      if (entry.evicted || !canUseStarBreakerModels()) return;
      const stage = bossModelStage();
      if (stage) stage.renderer.compile(turn, stage.camera, stage.scene);
    }, { timeout: 1500 });
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

function bossModelStage() {
  if (starBreakerModelStage) return starBreakerModelStage;
  try {
    const canvas = document.createElement("canvas");
    const { WebGLRenderer, Scene, OrthographicCamera, HemisphereLight, ACESFilmicToneMapping } = StarBreaker3D;
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
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.13;
    renderer.setClearColor(0, 0);
    const scene = new Scene();
    const camera = new OrthographicCamera(-2.5, 2.5, 1.6, -1.6, .01, 40);
    camera.position.set(-.45, .75, 8);
    camera.lookAt(0, 0, 0);
    const ambience = new HemisphereLight(0xc5dcff, 0x303052, 1.10);
    scene.add(ambience);
    const key = bossModelLight(scene, 0xc7edff, 2.38, [-3, 3, 5]);
    const rim = bossModelLight(scene, 0x5ad4ff, 2.13, [3, 2, -2.5]);
    const bounce = bossModelLight(scene, 0xf784a4, .82, [0, -2.7, 3]);
    const environment = makeBossModelEnvironment(renderer, scene);
    canvas.addEventListener("webglcontextlost", event => {
      event.preventDefault();
      starBreakerModelsUnavailable = true;
    });
    starBreakerModelStage = { renderer, scene, camera, key, rim, bounce, environment, current: null };
  } catch {
    starBreakerModelsUnavailable = true;
  }
  return starBreakerModelStage;
}

function drawStarBreakerModel(ctx, type, x, y, width, height, pose) {
  const model = preloadStarBreakerModel(type)?.model;
  if (!model) return false;
  const stage = bossModelStage();
  if (!stage) return false;
  const { renderer, scene, camera, key, rim, bounce } = stage;
  if (stage.current !== model) {
    stage.current?.turn.removeFromParent();
    scene.add(model.turn);
    stage.current = model;
  }
  const { time, charge, ruptured, hit, recoil, quiet } = pose;
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
  const renderWidth = Math.max(128, Math.min(544, Math.ceil(paddedWidth * visualQuality.modelScale / 16) * 16));
  const renderHeight = Math.max(112, Math.round(renderWidth / aspect));
  const target = renderer.domElement;
  if (target.width !== renderWidth || target.height !== renderHeight) renderer.setSize(renderWidth, renderHeight, false);
  camera.left = -fittedWidth / 2; camera.right = fittedWidth / 2;
  camera.top = fittedWidth / aspect / 2; camera.bottom = -camera.top;
  camera.updateProjectionMatrix();
  key.color.set(pose.cooling ? "#98f4ff" : "#c7edff");
  key.intensity = 2.35 + hit * .72 + (pose.cooling ? 1.1 : 0);
  rim.intensity = 2.03 + charge * .80 + ruptured * .40 + (pose.intensity ?? 0);
  const light = shipReflectionLight();
  const [red, green, blue] = light.channels;
  bounce.color.setRGB(red / 255, green / 255, blue / 255, StarBreaker3D.SRGBColorSpace);
  bounce.position.x = light.side * 3;
  bounce.intensity = .59 * (light.intensity ?? 1) + charge * .54;
  if (!quiet) {
    const aura = ctx.createRadialGradient(x, y, 0, x, y, Math.max(width, height) * .53);
    aura.addColorStop(0, pose.color + "32"); aura.addColorStop(1, pose.color + "00");
    ctx.save();
    ctx.fillStyle = aura;
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
