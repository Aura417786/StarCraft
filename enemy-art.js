/* 三种普通敌机的外观。只绘制机身，不修改战斗状态；舰首朝左。 */
function drawEnemyHull(enemy) {
  if (!enemy || !Number.isFinite(enemy.x) || !Number.isFinite(enemy.y) ||
      !Number.isFinite(enemy.width) || !Number.isFinite(enemy.height) ||
      enemy.width <= 0 || enemy.height <= 0) return;

  const ctx = context, w = enemy.width, h = enemy.height;
  const quiet = reducedMotion.matches;
  const hit = enemy.hitFlash > 0 && !quiet;
  const kind = enemy.kind;
  const palettes = {
    scout: { steel: "#214e65", light: "#81bed1", rim: "#5c97ae", glow: "#57e2ff", pale: "#d9fbff" },
    armored: { steel: "#69503a", light: "#dab187", rim: "#a18162", glow: "#ffb24d", pale: "#fff0be" },
    gunner: { steel: "#514266", light: "#b7a0d1", rim: "#907eac", glow: "#c28bff", pale: "#f5e9ff" }
  };
  const p = palettes[kind] || { steel: "#34475f", light: "#8399b2", rim: "#8cabc9", glow: "#7bd7ff", pale: "#e5f1ff" };

  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowBlur = 0;

  function path(points) {
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h));
    ctx.closePath();
  }
  function poly(points, fill, edge = "#09121e", width = 1) {
    path(points);
    ctx.fillStyle = fill;
    ctx.fill();
    if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = width; ctx.stroke(); }
  }
  function line(points, color = p.rim, width = 0.8) {
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  function mirrored(points, side) { return points.map(([x, y]) => [x, y * side]); }
  function metal(points, bright = false) {
    const ys = points.map(point => point[1]);
    const gradient = ctx.createLinearGradient(0, Math.min(...ys) * h, w * 0.07, Math.max(...ys) * h);
    gradient.addColorStop(0, p.light);
    gradient.addColorStop(0.18, bright ? p.light : p.steel);
    gradient.addColorStop(0.5, p.steel);
    gradient.addColorStop(1, "#111c2a");
    poly(points, gradient, p.rim, 0.8);
  }
  function glow(points, width = 1.4, color = p.glow, strong = false) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = quiet ? 0 : strong ? 10 : 4;
    line(points, color, width);
    ctx.restore();
  }
  function engine(y, size = 1, x = 0.42) {
    const end = Math.min(0.57, x + 0.14 * size);
    const flame = ctx.createLinearGradient(x * w, 0, end * w, 0);
    flame.addColorStop(0, p.pale);
    flame.addColorStop(0.28, p.glow);
    flame.addColorStop(1, "#08121f00");
    if (!enemy.disabled) poly([[x, y - 0.039 * size], [end, y - 0.007 * size], [end, y + 0.007 * size], [x, y + 0.039 * size]], flame, null);
    poly([[x - 0.10, y - 0.065 * size], [x + 0.009, y - 0.045 * size], [x + 0.009, y + 0.045 * size], [x - 0.10, y + 0.065 * size]], "#121f2e", p.rim, 0.7);
    line([[x - 0.052, y - 0.035 * size], [x - 0.052, y + 0.035 * size]], "#6b7988", 1.2);
    if (!enemy.disabled) glow([[x + 0.007, y - 0.026 * size], [x + 0.007, y + 0.026 * size]], 1.7);
  }
  function core(x, y, rx = 0.055, ry = 0.080) {
    const socket = [[x - rx * 1.4, y], [x - rx * 0.7, y - ry * 1.3], [x + rx * 0.7, y - ry * 1.3],
      [x + rx * 1.4, y], [x + rx * 0.7, y + ry * 1.3], [x - rx * 0.7, y + ry * 1.3]];
    poly(socket, "#071019", p.rim, 0.8);
    const field = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, rx * w);
    field.addColorStop(0, p.pale);
    field.addColorStop(0.25, p.pale);
    field.addColorStop(0.75, p.glow);
    field.addColorStop(1, p.steel);
    ctx.save();
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = quiet ? 0 : 5;
    ctx.fillStyle = field;
    ctx.beginPath();
    ctx.ellipse(x * w, y * h, rx * w, ry * h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    line([[x, y - ry], [x, y + ry]], "#142235", 1);
  }

  if (kind === "scout") {
    // 狭长机鼻、向后掠起的薄刃双翼与双推进器。
    engine(-0.21, 0.72, 0.41);
    engine(0.21, 0.72, 0.41);
    for (const s of [-1, 1]) {
      metal(mirrored([[-0.27, 0.09], [0.17, 0.45], [0.37, 0.475], [0.25, 0.24], [0.41, 0.13], [0.15, 0.07]], s));
      poly(mirrored([[-0.12, 0.13], [0.20, 0.36], [0.265, 0.375], [0.12, 0.15]], s), "#18303f", null);
      glow(mirrored([[-0.14, 0.13], [0.19, 0.395], [0.28, 0.42]], s), 1.05);
      line(mirrored([[0.16, 0.15], [0.285, 0.23], [0.34, 0.15]], s), p.light, 0.6);
    }
    metal([[-0.485, 0], [-0.18, -0.104], [0.255, -0.095], [0.445, 0], [0.255, 0.095], [-0.18, 0.104]], true);
    poly([[-0.38, 0], [-0.08, -0.05], [0.20, 0], [-0.08, 0.05]], "#0d202f", p.rim, 0.6);
    glow([[-0.285, 0], [-0.11, 0]], 1.4);
    core(0.19, 0, 0.042, 0.052);
  } else if (kind === "armored") {
    // 厚重的平头舰艏和整块肩甲，让耐打单位无需文字也容易辨认。
    engine(-0.29, 1.1, 0.43);
    engine(0.29, 1.1, 0.43);
    poly([[-0.445, -0.18], [-0.32, -0.405], [0.24, -0.48], [0.465, -0.30], [0.465, 0.30],
      [0.24, 0.48], [-0.32, 0.405], [-0.445, 0.18]], "#18202a", p.rim, 1.1);
    for (const s of [-1, 1]) {
      metal(mirrored([[-0.385, 0.14], [-0.28, 0.355], [0.18, 0.43], [0.365, 0.28], [0.30, 0.125], [-0.19, 0.10]], s));
      metal(mirrored([[-0.27, 0.165], [-0.195, 0.29], [0.15, 0.35], [0.255, 0.26], [0.19, 0.17]], s), true);
      line(mirrored([[-0.195, 0.29], [-0.045, 0.255], [0.15, 0.35]], s), "#1b2027", 1.8);
      glow(mirrored([[-0.295, 0.335], [-0.12, 0.365], [0.06, 0.397]], s), 1.5);
      for (let i = 0; i < 3; i++) {
        const x = 0.15 + i * 0.041;
        line(mirrored([[x, 0.19], [x + 0.022, 0.265]], s), "#111921", 2.4);
      }
    }
    metal([[-0.47, -0.11], [-0.345, -0.19], [0.245, -0.135], [0.40, 0], [0.245, 0.135], [-0.345, 0.19], [-0.47, 0.11]], true);
    poly([[-0.445, -0.09], [-0.29, -0.12], [-0.29, 0.12], [-0.445, 0.09]], "#3e3831", "#161a22", 1.3);
    line([[-0.43, -0.065], [-0.43, 0.065]], p.light, 1.5);
    for (const s of [-1, 1]) glow([[-0.35, s * 0.142], [-0.20, s * 0.12]], 1.8);
    core(0.10, 0, 0.077, 0.099);
    metal([[0.255, -0.055], [0.345, 0], [0.255, 0.055]], false);
  } else if (kind === "gunner") {
    // 分离双翼与两根伸向舰艏的长炮管；预警时炮口蓄亮。
    const charging = enemy.gunPhase === "warning" || enemy.gunPhase === "fire";
    const muzzle = enemy.gunPhase === "fire" ? "#fff1e8" : charging ? "#ffb5fc" : p.glow;
    engine(-0.315, 0.77, 0.40);
    engine(0.315, 0.77, 0.40);
    for (const s of [-1, 1]) {
      metal(mirrored([[-0.12, 0.11], [-0.045, 0.395], [0.18, 0.475], [0.415, 0.37], [0.34, 0.225], [0.125, 0.07]], s));
      poly(mirrored([[0.05, 0.21], [0.10, 0.35], [0.28, 0.36], [0.25, 0.25]], s), "#242036", p.rim, 0.6);
      glow(mirrored([[0.10, 0.413], [0.22, 0.43], [0.35, 0.36]], s), 1.25);
      metal(mirrored([[-0.16, 0.19], [-0.11, 0.32], [0.14, 0.325], [0.205, 0.25], [0.135, 0.18]], s), true);
      poly(mirrored([[-0.478, 0.204], [-0.045, 0.19], [0.075, 0.22], [0.075, 0.28], [-0.045, 0.30], [-0.478, 0.275]], s), "#202634", "#0a0f18", 1.6);
      line(mirrored([[-0.465, 0.209], [-0.09, 0.209]], s), p.light, 1.1);
      for (const x of [-0.385, -0.28, -0.17]) {
        line(mirrored([[x, 0.204], [x, 0.277]], s), p.rim, 1.5);
      }
      glow(mirrored([[-0.435, 0.245], [-0.105, 0.245]], s), charging ? 2 : 0.9, muzzle, charging);
      glow(mirrored([[-0.477, 0.213], [-0.477, 0.267]], s), charging ? 3.2 : 1.5, muzzle, charging);
    }
    metal([[-0.325, 0], [-0.10, -0.125], [0.25, -0.115], [0.425, 0], [0.25, 0.115], [-0.10, 0.125]], true);
    poly([[-0.275, 0], [-0.105, -0.047], [0.0, 0], [-0.105, 0.047]], "#131f31", p.rim, 0.6);
    glow([[-0.22, 0], [-0.095, 0]], 1.3);
    core(0.145, 0, 0.058, 0.069);
  } else {
    // Boss 召唤的拦截机沿用银灰翼型，兼容尚未标注种类的敌机。
    engine(-0.19, 0.67, 0.43);
    engine(0.19, 0.67, 0.43);
    metal([[-0.485, 0], [-0.12, -0.19], [0.25, -0.475], [0.37, -0.43], [0.24, -0.1],
      [0.43, -0.1], [0.48, 0], [0.43, 0.1], [0.24, 0.1], [0.37, 0.43], [0.25, 0.475], [-0.12, 0.19]]);
    poly([[-0.485, 0], [-0.02, -0.14], [0.35, -0.11], [0.43, 0], [0.35, 0.11], [-0.02, 0.14]], hit ? p.pale : p.light, p.rim, 0.8);
    poly([[-0.20, -0.07], [0.25, -0.07], [0.32, 0], [-0.20, 0.07]], "#1d293e", p.rim, 0.6);
    glow([[-0.19, 0], [-0.055, 0]], 3, "#ff6d77");
  }

  if (enemy.formationLeader && !enemy.disabled) {
    // 指挥机识别来自嵌入肩甲的金色指挥翼，不在血条上添加文字或刻度。
    for (const side of [-1, 1]) {
      const points = mirrored([[0.01, 0.29], [0.12, 0.45], [0.34, 0.46], [0.19, 0.32]], side);
      const plate = ctx.createLinearGradient(0, -h * 0.5, w * 0.2, h * 0.5);
      plate.addColorStop(0, "#fff0c0"); plate.addColorStop(0.46, "#c18e42"); plate.addColorStop(1, "#493725");
      poly(points, plate, "#e2b86e", 0.8);
      glow(mirrored([[0.10, 0.405], [0.26, 0.425]], side), 1.4, "#ffdf9b");
    }
  }
  if ((enemy.formationDisoriented ?? 0) > 0 && !enemy.disabled) {
    ctx.strokeStyle = "#a7d5ed"; ctx.globalAlpha = quiet ? 0.35 : 0.35 + Math.sin(enemy.age * 20) * 0.15;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(w * 0.15, 0, h * 0.18, -0.75, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(w * 0.15, 0, h * 0.26, 2.2, 3.7); ctx.stroke();
  }
  ctx.restore();
}
