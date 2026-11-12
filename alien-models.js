"use strict";

const starBreakerModelNames = [
  "broodmother", "marrow-stalker", "cinder-maw", "rift-weaver", "pulse-binder",
  "mirror-ray", "thunder-wyrm", "spore-regent", "dimension-maw", "neural-king",
  "abyssal-confluence", "abyssal-egg", "marrow-reliquary", "uncased-furnace", "unstrung-heart",
  "double-lock", "mirror-sepulcher", "severed-thunder", "last-spore-nest", "world-eater",
  "neural-crown", "extinction-core",
];
const starBreakerModelCache = new Map();
const starBreakerModelLimit = 2;
let starBreakerModelStage;
let starBreakerModelLoad;
let starBreakerModelPumpScheduled = false;
let starBreakerModelsUnavailable = false;
const bossWorldLightSample = {};
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

// Wind-ups drive the authored Attack and Unfurl anatomy, with independent body
// weight transfer and focal light. Durations are in seconds, angles in radians.
const bossActionProfiles = [
  // time, retreat, lift, squash X, spread Y, pitch, yaw, bank, unfold, core
  [.48, .052, -.028, -.045, .112, -.12, .10, .035, .26, 1.05], // canopy balloons, trailing tentacles coil
  [.39, .072, -.017, -.081, .065, .13, -.08, -.051, .15, .53], // barbed jaw opens before ribs lock
  [.46, .089, .018, -.054, .038, -.07, .22, -.029, .07, 1.34], // vents brace, warm fissures open
  [.43, -.030, -.042, .028, -.118, .08, -.23, .063, .20, .73], // limbs gather inward before threads stretch
  [.38, .031, .036, -.037, .139, -.02, .08, .047, .38, .60], // paired pincers lift and flare
  [.36, .012, -.020, .045, -.082, .09, -.35, .119, .12, .78], // ray banks until its plates catch the key
  [.41, .064, .033, -.109, .078, .17, -.11, -.075, .11, .93], // tail curls ahead of the moving current
  [.47, -.017, -.011, .047, .129, .10, .12, .027, .30, 1.22], // sacs swell then release
  [.45, .058, .009, -.103, -.097, -.14, .14, -.056, .24, .86], // throat contracts around the fold
  [.34, .022, -.046, .013, .057, -.17, -.19, .087, .22, 1.00], // crown tilts forward as neurons light
  [.50, .091, .016, -.068, .097, -.11, .25, -.077, .35, 1.20], // body lobes gather for independent attacks
];
const bossActionTechniques = [
  ["sweep", "coil", "recoil"], ["lunge", "coil", "lunge"], ["recoil", "lunge", "coil"],
  ["sweep", "coil", "recoil"], ["lunge", "coil", "sweep"], ["sweep", "lunge", "coil"],
  ["sweep", "coil", "lunge"], ["lunge", "recoil", "sweep"], ["coil", "sweep", "recoil"],
  ["recoil", "sweep", "coil"], ["coil", "sweep", "lunge"],
];

function bossActionPose(target, quiet = false) {
  const type = target.type % bossActionProfiles.length;
  const [lead, retreat, lift, scaleX, scaleY, pitch, yaw, bank, unfold, core] = bossActionProfiles[type];
  const phaseTime = target.phaseTime || 0;
  const warming = target.phase === "telegraph";
  let remaining = warming ? target.telegraphDuration - phaseTime : Infinity;
  // Secondary cues use their own real warning clocks so an aftershock can
  // visibly tense the body while the original attack is still in flight.
  if (target === boss && target.phase === "attack") {
    for (const hazard of bossHazards) {
      const wait = hazard.warning - hazard.age;
      if (wait >= 0 && hazard.attackLabel === target.attackLabel) remaining = Math.min(remaining, wait);
    }
  }
  const start = clamp(1 - remaining / lead, 0, 1);
  const ready = start * start * (3 - 2 * start);
  const release = target.phase === "attack" ? Math.exp(-phaseTime * 10) * (1 - ready) : 0;
  const loss = clamp(target.cinematicPose?.loss ?? 0, 0, 1);
  const slack = loss * loss * (3 - 2 * loss);
  const tremor = quiet ? 0 : Math.sin(loss * 25) * (1 - loss) * Math.sin(Math.PI * loss) * .12;
  const side = target.side || 1;
  const motion = quiet ? .26 : 1;
  // Change silhouette for a sweep, a closed coil, a forward strike, and a
  // pressure recoil independently of the species' base body mechanics.
  const technique = target.attackMotion ?? bossActionTechniques[type][target.attackIndex];
  const sweep = technique === "sweep" ? side * .07 : 0;
  const lunge = technique === "lunge" ? .048 : 0;
  const coil = technique === "coil" ? .033 : 0;
  const vent = technique === "recoil" ? .026 : 0;
  const rhythmic = type === 0 && !quiet ? 1 + .18 * Math.sin(phaseTime * 14) ** 2
    : type === 7 && !quiet ? 1 + .12 * Math.sin(phaseTime * 11) : 1;
  const weight = (ready - release * .39) * motion * (1 - slack);
  const lowCharge = warming ? clamp(1 - remaining / Math.max(.01, target.telegraphDuration), 0, 1) * .19 : 0;
  const countered = typeof bossCounterActive === "function" && bossCounterActive(target) ? 1 : 0;
  return {
    readiness: ready, release, loss, slack,
    charge: clamp((lowCharge + ready * .81 + release * .84) * rhythmic * (1 - slack), 0, 1),
    spread: Math.max(countered * .48, unfold * (ready + release * .36)) * (1 - slack),
    core: Math.max(countered * 1.2, core * (lowCharge + ready * .88 + release * .55)) * (1 - slack),
    x: weight * (retreat + lunge - vent) + slack * .05,
    y: weight * (lift + sweep * .20) + slack * .10 * motion,
    pitch: weight * pitch - slack * .21 * motion + tremor,
    yaw: weight * (yaw + sweep * side),
    bank: weight * (bank + sweep) - slack * side * .13 * motion + tremor,
    scaleX: 1 + weight * (scaleX - coil) - slack * .09 * motion,
    scaleY: 1 + weight * (scaleY + coil) - slack * .16 * motion,
  };
}

function canUseStarBreakerModels() {
  return !starBreakerModelsUnavailable && typeof StarBreaker3D !== "undefined"
    && typeof visualQuality !== "undefined" && visualQuality.modelScale > 0
    && typeof location !== "undefined" && /^https?:$/.test(location.protocol)
    && typeof document.createElement === "function";
}

function starBreakerFinaleModelIndex(type) { return 11 + type; }

function starBreakerModelResources(center) {
  const materials = new Set(), textures = new Set(), geometries = new Set();
  center.traverse(mesh => {
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const material of [].concat(mesh.material)) {
      if (materials.has(material)) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  return { materials, textures, geometries };
}

function disposeStarBreakerModelResources({ materials, textures, geometries }) {
  const sources = new Set();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) {
    sources.add(texture.source?.data);
    texture.dispose();
  }
  for (const source of sources) source?.close?.();
}

function releaseStarBreakerModel(entry) {
  entry.evicted = true;
  entry.controller?.abort();
  const model = entry.model;
  if (!model) return;
  model.turn.removeFromParent();
  if (starBreakerModelStage?.current === model) {
    starBreakerModelStage.current = null;
    starBreakerModelStage.renderer.renderLists.dispose();
  }
  entry.model = null;
  model.mixer?.stopAllAction();
  model.mixer?.uncacheRoot(model.center);
  disposeStarBreakerModelResources(model.resources);
}

function warmStarBreakerModel(entry, stage) {
  if (entry.evicted || !canUseStarBreakerModels()) return;
  try {
    for (const texture of entry.model.resources.textures) stage.renderer.initTexture(texture);
    // Submit shader work before the fight. No polling keeps disposed models
    // alive when the player leaves or the context is lost during compilation.
    stage.renderer.compile(entry.model.turn, stage.camera, stage.scene);
  } catch { /* Draw path remains available. */ }
}

function preloadStarBreakerModel(index, foreground = false) {
  if (!canUseStarBreakerModels() || !starBreakerModelNames[index]) return null;
  let entry = starBreakerModelCache.get(index);
  if (entry) {
    if (foreground) {
      entry.foreground = true;
      starBreakerModelCache.delete(index);
      starBreakerModelCache.set(index, entry);
    }
    return entry;
  }
  entry = { index, model: null, evicted: false, pending: true, foreground };
  starBreakerModelCache.set(index, entry);
  if (starBreakerModelCache.size > starBreakerModelLimit) {
    const oldest = starBreakerModelCache.keys().next().value;
    releaseStarBreakerModel(starBreakerModelCache.get(oldest));
    starBreakerModelCache.delete(oldest);
  }
  scheduleStarBreakerModelLoad();
  return entry;
}

function scheduleStarBreakerModelLoad() {
  if (starBreakerModelLoad || starBreakerModelPumpScheduled || !canUseStarBreakerModels()) return;
  starBreakerModelPumpScheduled = true;
  window.setTimeout(() => {
    starBreakerModelPumpScheduled = false;
    const pending = [...starBreakerModelCache.values()].filter(entry => entry.pending);
    const entry = pending.find(candidate => candidate.foreground) ?? pending[0];
    if (entry && canUseStarBreakerModels()) loadStarBreakerModel(entry);
  }, 0);
}

function disposeIdleBossModelDecoder(stage) {
  if (!stage?.gltfLoader || starBreakerModelLoad || starBreakerModelCache.size) return;
  if (stage.ktx2Loader?.transcoderPending) stage.ktx2Loader.dispose();
  stage.ktx2Loader = null;
  stage.gltfLoader = null;
}

function resetStarBreakerModels() {
  for (const entry of starBreakerModelCache.values()) releaseStarBreakerModel(entry);
  starBreakerModelCache.clear();
  const stage = starBreakerModelStage;
  if (!stage) return;
  stage.scene.environment = stage.environment.texture;
  for (const map of stage.sectorMaps.values()) map?.dispose();
  stage.sectorMaps.clear();
  stage.environmentGeneration++;
  if (!stage.renderer.getContext().isContextLost()) stage.renderer.setSize(16, 16, false);
  disposeIdleBossModelDecoder(stage);
}

async function loadStarBreakerModel(entry) {
  entry.pending = false;
  starBreakerModelLoad = entry;
  const { GLTFLoader, KTX2Loader, MeshoptDecoder, Box3, Vector3, Group, AnimationMixer } = StarBreaker3D;
  let stage;
  try {
    const controller = new AbortController();
    entry.controller = controller;
    const url = `assets/models/${starBreakerModelNames[entry.index]}.glb`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return;
    const data = await response.arrayBuffer();
    entry.controller = null;
    if (entry.evicted || !canUseStarBreakerModels()) return;
    stage = bossModelStage();
    if (!stage) return;
    if (!stage.gltfLoader) {
      stage.ktx2Loader = new KTX2Loader().setTranscoderPath("vendor/basis/").setWorkerLimit(1).detectSupport(stage.renderer);
      stage.gltfLoader = new GLTFLoader().setKTX2Loader(stage.ktx2Loader).setMeshoptDecoder(MeshoptDecoder);
    }
    const gltf = await stage.gltfLoader.parseAsync(data, "assets/models/");
    const center = gltf.scene;
    const resources = starBreakerModelResources(center);
    // GLTFLoader can resolve a scene even if one of its maps failed to load.
    // Its cached texture dependencies expose missing maps before drawing it.
    const maps = await gltf.parser.getDependencies("texture");
    if (entry.evicted || maps.some(map => !map)) {
      disposeStarBreakerModelResources(resources);
      return;
    }
    const bounds = new Box3().setFromObject(center);
    const size = bounds.getSize(new Vector3());
    if (!Number.isFinite(size.x) || size.x <= 0 || size.y <= 0) {
      disposeStarBreakerModelResources(resources);
      return;
    }
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
    entry.model = { center, turn, size, mixer, duration, animatedMeshes, resources };
    // The warning starts asset work before the encounter. Compile off the draw path when idle.
    entry.warming = true;
    const prepare = () => {
      try {
        if (entry.evicted || !canUseStarBreakerModels()) return;
        const journey = sceneryJourney();
        preloadBossEnvironment(stage, journey.current);
        preloadBossEnvironment(stage, journey.next);
        warmStarBreakerModel(entry, stage);
      } finally {
        entry.warming = false;
      }
    };
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(prepare, { timeout: 1500 });
    else window.setTimeout(prepare, 0);
  } catch {
    // Unsupported GPU codecs and failed requests retain the 2D artwork.
  } finally {
    entry.controller = null;
    starBreakerModelLoad = null;
    disposeIdleBossModelDecoder(starBreakerModelStage);
    if ([...starBreakerModelCache.values()].some(candidate => candidate.pending)) scheduleStarBreakerModelLoad();
  }
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
  const generation = stage.environmentGeneration;
  stage.sectorMaps.set(sector, null);
  image.onload = () => {
    const prepare = () => {
      if (stage.environmentGeneration !== generation || starBreakerModelsUnavailable || stage.renderer.getContext().isContextLost()) return;
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
  if (!canUseStarBreakerModels()) return null;
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
      resetStarBreakerModels();
    });
    canvas.addEventListener("webglcontextrestored", () => {
      const stage = starBreakerModelStage;
      try {
        stage.environment.dispose();
        stage.environment = makeBossModelEnvironment(renderer, scene);
        stage.ktx2Loader?.detectSupport(renderer);
        starBreakerModelsUnavailable = false;
      } catch { /* Keep using 2D artwork. */ }
    });
    starBreakerModelStage = { renderer, scene, camera, ambience, key, rim, bounce, emitter, spill, environment,
      sectorMaps: new Map(), environmentGeneration: 0, current: null };
  } catch {
    starBreakerModelsUnavailable = true;
  }
  return starBreakerModelStage;
}

function bossModelRenderWidth(width, pixelRatio, quality = visualQuality) {
  const wanted = Math.ceil(width * Math.min(pixelRatio || 1, 2) * quality.modelScale / 16) * 16;
  return clamp(wanted, quality.modelMin, quality.modelMax);
}

function bossWorldLightAnchor(type, x, y) {
  if (x !== 0 || y !== 0) return null;
  const alienType = type % bossEmitterLights.length;
  const subject = typeof bossPresentation !== "undefined" ? bossPresentation?.target : null;
  if (subject?.type === alienType) return subject;
  return typeof boss !== "undefined" && boss?.type === alienType ? boss : null;
}

function sampleBossWorldLight(type, x, y) {
  if (typeof sampleSceneLight !== "function") return null;
  const anchor = bossWorldLightAnchor(type, x, y);
  return sampleSceneLight(anchor?.x ?? x, anchor?.y ?? y, bossWorldLightSample);
}

function lightBossModel(stage, model, type, pose, x, y, width, incident) {
  const { scene, ambience, key, rim, bounce, emitter, spill } = stage;
  const { current, next, blend } = sceneryJourney();
  const near = blend < .5 ? current : next;
  preloadBossEnvironment(stage, near);
  const map = stage.sectorMaps.get(near);
  scene.environment = map?.texture ?? stage.environment.texture;
  // A brief reduction in reflection hides the cubemap change during a sector dissolve.
  scene.environmentIntensity = (map?.texture ? .73 : .54) * (.79 + Math.abs(.5 - blend) * .42)
    * (incident ? .86 + incident.fillStrength * .20 : 1);
  if (incident) {
    key.color.set(incident.keyColor);
    bounce.color.set(incident.fillColor);
    ambience.color.set(0xd0dceb).lerp(bounce.color, .41);
    ambience.groundColor.set(incident.shadeColor);
    ambience.intensity = .62 + incident.fillStrength * .18;
    // Screen-space positive Y points down. The directional lights face the
    // shaded model from that same sky direction after converting to world Y.
    key.position.set(incident.keyDx * 5.8, -incident.keyDy * 5.8, 4.6);
    rim.color.set(incident.fillColor);
    rim.position.set(-key.position.x * .68, -key.position.y * .26 + 1.30, -4);
    bounce.position.set(-key.position.x * .49, -key.position.y * .55, 3.3);
    bounce.intensity = .40 + incident.fillStrength * .35 + pose.charge * .15;
  } else {
    const from = bossSectorLights[current], to = bossSectorLights[next];
    const mix = (a, b) => a + (b - a) * blend;
    const mixColor = (field, light) => light.color.setRGB(...from[field].map((channel, i) => mix(channel, to[field][i]) / 255),
      StarBreaker3D.SRGBColorSpace);
    mixColor("rgb", key); mixColor("rim", rim);
    key.position.set(...from.aim.map((channel, i) => mix(channel, to.aim[i]) * 7));
    rim.position.set(key.position.x * .64, key.position.y * .58 + 1.6, -4);
    const light = shipReflectionLight();
    bounce.color.setRGB(...light.channels.map(channel => channel / 255), StarBreaker3D.SRGBColorSpace);
    bounce.position.set(-key.position.x * .54, -light.side * 4, 3);
    bounce.intensity = .60 * (light.intensity ?? 1) + pose.charge * .17;
  }
  if (pose.cooling) key.color.set("#a0eafa");
  key.intensity = (incident ? 1.25 + incident.keyStrength * 1.14 : 2.17) + pose.hit * .27 + (pose.cooling ? .45 : 0);
  rim.intensity = (1.25 + (incident?.fillStrength ?? .5) * .26 + pose.charge * .45 + pose.ruptured * .22 + (pose.intensity ?? 0) * .34)
    * (1 - (pose.action?.slack ?? 0) * .24);

  const [color, px, py, strength] = bossEmitterLights[type % bossEmitterLights.length];
  const unit = model.size.x;
  const furnace = type % 11 === 2;
  emitter.color.set(color);
  emitter.position.set(px * unit, py * unit, model.size.z * .48 + unit * (furnace ? .21 : .12));
  // The furnace spills over adjacent armor edges without changing the core's
  // brightness, which can otherwise wash out the fine fissures at close range.
  emitter.distance = unit * (furnace ? .99 : .68);
  const localCharge = Math.min(1.18, pose.action?.core ?? pose.charge);
  emitter.intensity = strength * unit * unit * (.11 + localCharge * .074 + pose.ruptured * .042
    + (type >= 11 ? .028 : 0)) * (pose.cooling ? .45 : 1) * (1 - (pose.action?.slack ?? 0) * .67);

  if (incident) {
    spill.distance = unit * 1.74;
    spill.intensity = Math.min(1, incident.strength) * unit * unit * (pose.quiet ? .35 : .61);
    if (spill.intensity > 0) {
      spill.color.set(incident.color);
      spill.position.set(incident.dx * unit * .69, -incident.dy * unit * .59, unit * .49);
    }
    return;
  }
  const pulse = typeof activeCombatLight === "function" ? activeCombatLight() : null;
  const subject = bossWorldLightAnchor(type, x, y);
  // Presentation shells render at a translated local origin, but the flash
  // remains in battlefield space. Sample both lights in the same space.
  const worldX = subject?.x ?? x, worldY = subject?.y ?? y;
  const dx = pulse ? pulse.x - worldX : 0, dy = pulse ? pulse.y - worldY : 0;
  const falloff = pulse ? Math.max(0, 1 - Math.hypot(dx, dy) / Math.max(1, pulse.radius + width * .4)) : 0;
  spill.distance = 0;
  spill.intensity = falloff * falloff * Math.min(1.2, pulse?.strength ?? 0) * unit * unit * .31;
  if (falloff > 0) {
    spill.color.set(pulse.color);
    spill.position.set(clamp(dx / width, -.78, .78) * unit, clamp(-dy / width, -.68, .68) * unit, unit * .44);
  }
}

function drawBossContactShadow(ctx, x, y, width, height, incident, quiet) {
  ctx.save();
  // Tight occlusion beneath the shell and a separate, softer shadow displaced
  // away from the key. Both affect the scenery beneath the opaque model only.
  let dx, dy;
  if (incident) {
    dx = incident.keyDx; dy = -incident.keyDy;
  } else {
    const { current, next, blend } = sceneryJourney();
    [dx, dy] = bossSectorLights[blend < .5 ? current : next].aim;
  }
  ctx.translate(x - dx * width * .083, y + height * (.22 + dy * .085));
  ctx.rotate(dx * -.13);
  ctx.scale(1, height / width * .64);
  const layer = (cy, radius, opacity) => {
    const shade = ctx.createRadialGradient(0, cy, radius * .08, 0, cy, radius);
    shade.addColorStop(0, "rgba(1, 2, 7, " + opacity + ")");
    shade.addColorStop(.54, "rgba(2, 4, 11, " + opacity * .53 + ")");
    shade.addColorStop(1, "rgba(4, 8, 18, 0)");
    ctx.fillStyle = shade;
    ctx.fillRect(-radius, cy - radius, radius * 2, radius * 2);
  };
  layer(width * .08, width * .61, .43);
  layer(-width * .075, width * .38, .62);
  if (!quiet && visualQuality.id === "high") layer(-width * .13, width * .27, .44);
  ctx.restore();
}

function drawStarBreakerModel(ctx, type, x, y, width, height, pose) {
  const model = preloadStarBreakerModel(type, true)?.model;
  if (!model) return false;
  const stage = bossModelStage();
  if (!stage) return false;
  const { renderer, scene, camera } = stage;
  if (stage.current !== model) {
    stage.current?.turn.removeFromParent();
    scene.add(model.turn);
    stage.current = model;
  }
  const { time, charge, ruptured, recoil, quiet, action } = pose;
  model.mixer?.setTime(time % Math.max(.01, model.duration));
  const idleMotion = 1 - (action?.slack ?? 0) * .93;
  model.turn.rotation.set(.025 + Math.sin(time * 1.3) * .08 * idleMotion + (action?.pitch ?? 0),
    -.11 + Math.sin(time * .77) * .18 * idleMotion + (action?.yaw ?? 0),
    Math.sin(time * .91) * .031 * idleMotion + recoil * .06 + (pose.turn ?? 0) + (action?.bank ?? 0));
  model.turn.position.set((recoil * .06 + (action?.x ?? 0)) * model.size.x, -(action?.y ?? 0) * model.size.y, 0);
  model.turn.scale.set(action?.scaleX ?? 1, action?.scaleY ?? 1, 1);
  for (const { node, attack, unfurl, emissive } of model.animatedMeshes) {
    if (attack !== undefined) node.morphTargetInfluences[attack] = charge;
    if (unfurl !== undefined) node.morphTargetInfluences[unfurl] = clamp(ruptured + (action?.spread ?? 0), 0, 1);
    if (node.material.emissive && emissive > 0) {
      node.material.emissiveIntensity = emissive * (.67 + Math.min(1.18, action?.core ?? charge) * .92 + ruptured * .38
        + Math.sin(time * 3.2) * .08 * idleMotion) * (1 - (action?.slack ?? 0) * .72);
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
  const incident = sampleBossWorldLight(type, x, y);
  lightBossModel(stage, model, type, pose, x, y, width, incident);
  drawBossContactShadow(ctx, x, y, width, height, incident, quiet);
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
  const action = bossActionPose(target, quiet);
  const pressure = target.phase === "rupture";
  const stageStrength = target.enraged ? Math.min(1, (age - (target.enragedAt ?? age)) * 1.7) : 0;
  const recoil = target.phase === "attack" && !quiet ? Math.exp(-(target.phaseTime || 0) * 7) : 0;
  const cue = target.cinematicPose;
  return drawStarBreakerModel(ctx, target.type, target.x, target.y, target.width, target.height, {
    time: quiet ? 0 : age, charge: cue?.charge ?? (pressure ? .85 : action.charge), action,
    ruptured: cue?.unfurl ?? (pressure ? 1 : stageStrength),
    hit: target.hitFlash ? 1 : 0, recoil, quiet, color: target.color, turn: cue?.turn, intensity: cue?.intensity,
  });
}
