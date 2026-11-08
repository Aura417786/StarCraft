"use strict";

// Draw in a 200 × 136 design space. The nose (93, 0) deliberately shares
// the original fighter's muzzle axis; evolution never changes its hit box.
function drawEvolvedPlayer(ctx, ship, upgrades, quiet = false, time = 0) {
  const rank = (value) => Math.max(0, Math.min(3, Number(value) || 0));
  const pierce = rank(upgrades?.pierce), blast = rank(upgrades?.blast), aegis = rank(upgrades?.aegis);
  if (!(pierce || blast || aegis)) return false;
  if (!(ship.width > 0 && ship.height > 0)) return false;
  if (drawShipPBR(ctx, ship, "crimson", { pierce, blast, aegis }, quiet, time)) return true;
  const phase = quiet ? 0 : Math.sin((Number(time) || 0) * 7.5);
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.scale(ship.width / 200, ship.height / 136);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const linear = (x0, y0, x1, y1, stops) => {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [at, color] of stops) gradient.addColorStop(at, color);
    return gradient;
  };
  const metal = linear(0, -48, 0, 50, [[0, "#d16d69"], [0.14, "#f04a45"], [0.38, "#a81b29"], [0.61, "#6d1625"], [0.8, "#d4313d"], [1, "#481722"]]);
  const armor = linear(-50, -30, 26, 42, [[0, "#e96159"], [0.28, "#a82332"], [0.7, "#73182a"], [1, "#351923"]]);
  const steel = linear(0, -25, 0, 32, [[0, "#a9b6c6"], [0.25, "#344556"], [0.5, "#101d2b"], [0.73, "#516176"], [1, "#202d3c"]]);
  const warmSteel = linear(0, 15, 0, 48, [[0, "#efb475"], [0.35, "#805344"], [0.65, "#27323c"], [1, "#b5855b"]]);
  const gold = linear(-80, 0, 35, 46, [[0, "#ffe2a1"], [0.4, "#bd8850"], [0.65, "#553d35"], [1, "#ffd48b"]]);
  const shape = (points, fill, outline = "#202734", width = 1.1) => {
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = width; ctx.stroke(); }
  };
  const line = (points, color, width = 1) => {
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  };
  const mirrored = (draw) => {
    for (const sign of [-1, 1]) { ctx.save(); ctx.scale(1, sign); draw(); ctx.restore(); }
  };
  const vent = (x, y, count, accent = "#788797") => {
    for (let i = 0; i < count; i++) line([[x + i * 4, y], [x + i * 4 + 2, y + 5]], accent, 1.2);
  };
  const light = (x, y, radius, color, center = "#fff2d1") => {
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = quiet ? 2 : 5;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = center; ctx.beginPath(); ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  };

  // Twin engine nozzles and flames remain mirrored even when animated.
  mirrored(() => {
    const thrust = 17 + phase * 3 + (blast === 3 ? 4 : 0);
    const flame = linear(-82 - thrust, 0, -76, 0, [[0, "#ff471700"], [0.4, "#f8502870"], [0.78, "#ffae3bee"], [1, "#fff7bc"]]);
    shape([[-76, 15], [-84 - thrust, 22], [-76, 29]], flame, null);
    shape([[-77, 18], [-84 - thrust * 0.6, 22], [-77, 25]], "#fff3b9d9", null);
    shape([[-81, 13], [-59, 12], [-52, 22], [-59, 32], [-81, 31], [-85, 26], [-85, 18]], steel, "#7d8d9e", 1);
    line([[-79, 15], [-79, 29]], "#ffbd68", 2);
    line([[-74, 15], [-74, 29]], "#192534", 2.3);
    shape([[-71, 9], [-39, 9], [-17, 22], [-50, 34], [-68, 29]], armor, "#fa7c6c", 0.9);
    shape([[-67, 23], [-85, 43], [-54, 37], [-10, 18]], metal, "#bfc4cb", 0.7);
    line([[-80, 40], [-51, 32], [-29, 21]], "#f6675c", 1.3);
  });
  shape([[-88, -7], [-60, -13], [-40, 0], [-60, 13], [-88, 7], [-93, 0]], steel, "#7e8a95");
  shape([[-89, -3], [-62, -7], [-55, 0], [-62, 7], [-89, 3]], armor, "#e34b49", 0.8);

  // Piercing branch: long, thin swept blades. Further ranks add a second
  // cutting edge and at rank 3 an independent forked outer blade.
  if (pierce) mirrored(() => {
    const reach = 29 + pierce * 14, span = 29 + pierce * 7;
    shape([[-62, 15], [-45, 29], [reach, span], [reach - 18, span - 9], [-17, 15]], "#102b3c", "#506f81", 1.1);
    shape([[-58, 16], [-43, 24], [reach - 4, span - 1], [reach - 19, span - 7], [-18, 16]], metal, "#83d9df", 0.7);
    line([[-44, 26], [reach, span], [reach - 19, span - 9]], "#82f4f3", pierce === 3 ? 2 : 1.4);
    line([[-22, 25], [reach - 17, span - 6]], "#efffff", 0.65);
    shape([[-42, 18], [-16, 19], [5, 25], [-26, 23]], "#243e4e", "#8fabb9", 0.6);
    vent(-35, 18, 4, "#4bc2ce");
    if (pierce >= 2) {
      shape([[-59, 30], [-76, 48], [-35, 43], [12, 38], [-33, 34]], steel, "#63d2dd", 0.9);
      line([[-74, 47], [-35, 42], [7, 38]], "#bcfcf8", 1);
    }
    if (pierce === 3) {
      shape([[-42, 43], [-60, 59], [-21, 53], [46, 61], [16, 48]], "#244353", "#73e9ed", 1.15);
      shape([[-42, 44], [-53, 55], [-21, 49], [38, 58], [13, 49]], armor, "#baebea", 0.5);
      line([[-53, 56], [-21, 51], [45, 61]], "#a6fffb", 1.5);
      light(-30, 44, 1.6, "#56e7ed", "#edffff");
    }
  });

  // Aegis branch: layered, blunt shoulder armor and gold guard rails.
  // It sits inside the blade edge so hybrid forms show both identities.
  if (aegis) mirrored(() => {
    const span = 29 + aegis * 6;
    shape([[-68, 18], [-54, span], [-14, span + 4], [13, span - 11], [7, 16], [-25, 13]], "#171f2b", "#c49160", 1.5);
    shape([[-63, 19], [-50, span - 2], [-14, span], [8, span - 11], [3, 19], [-25, 17]], armor, "#eea986", 0.75);
    shape([[-49, 20], [-38, span - 4], [-13, span - 2], [4, span - 11], [-4, 23]], metal, "#4b2430", 0.8);
    line([[-63, 21], [-51, span], [-14, span + 3], [13, span - 11]], gold, 3);
    line([[-48, 22], [-39, span - 4], [-14, span - 2]], "#ffcc93", 0.8);
    for (let i = 0; i < aegis; i++) shape([[-44 + i * 9, span - 8], [-41 + i * 9, span - 3], [-37 + i * 9, span - 3], [-39 + i * 9, span - 8]], "#efc17e", null);
    if (aegis >= 2) {
      shape([[-76, 30], [-80, 47], [-56, 51], [-49, 44], [-56, 30]], metal, "#ecc49a", 1);
      line([[-75, 34], [-76, 43], [-60, 46]], "#d89750", 2.2);
    }
    if (aegis === 3) {
      shape([[-43, 48], [-41, 59], [-5, 59], [14, 43], [7, 37], [-12, 49]], "#551d2b", "#eac486", 1.4);
      shape([[-37, 51], [-35, 55], [-7, 55], [7, 43], [1, 44], [-10, 51]], metal, "#b87458", 0.7);
      line([[-35, 56], [-7, 56], [11, 42]], "#fbd994", 1.3);
      light(-61, 39, 2, "#ff966b");
    }
  });

  // Blast branch: a widened weapon cradle, independent cannons, then twin
  // barrels. Its orange gun mouths remain visible above mixed armor sets.
  if (blast) mirrored(() => {
    const shoulder = 31 + blast * 5;
    shape([[-62, 18], [-54, shoulder], [-22, shoulder + 5], [6, shoulder - 4], [16, 19], [-10, 14]], steel, "#bf8d79", 1.1);
    shape([[-57, 19], [-49, shoulder - 1], [-22, shoulder], [3, shoulder - 6], [7, 22], [-12, 17]], armor, "#fc9576", 0.9);
    line([[-47, shoulder - 5], [-24, shoulder - 2], [-8, shoulder - 6]], "#ffad65", 1.8);
    vent(-48, 23, 5, "#c38267");
    const barrels = blast === 3 ? [27, 39] : [25 + blast * 2];
    for (const y of barrels) {
      const end = blast === 3 ? 61 : 46 + blast * 6;
      const barrelFill = linear(0, y - 6, 0, y + 6, [[0, "#a3aeba"], [0.2, "#3d4d5d"], [0.5, "#172737"], [0.72, "#637383"], [1, "#121e2c"]]);
      shape([[-26, y - 6], [end - 7, y - 6], [end, y - 3], [end, y + 4], [end - 7, y + 6], [-26, y + 6], [-32, y]], barrelFill, "#8a8581", 0.9);
      shape([[-27, y - 8], [-6, y - 8], [2, y - 5], [-3, y + 7], [-26, y + 7], [-32, y]], metal, "#e98865", 0.8);
      line([[8, y - 3], [end - 9, y - 3]], "#ffa962", 1.1);
      line([[end - 7, y - 5], [end - 7, y + 5]], "#bac5cb", 1.5);
      line([[end - 1, y - 2], [end - 1, y + 3]], "#ff9a43", 3);
      line([[end - 1, y - 1], [end - 1, y + 2]], "#ffe9bb", 1.2);
      for (let i = 0; i < blast; i++) line([[12 + i * 10, y - 5], [12 + i * 10, y + 5]], "#253442", 1.5);
    }
    if (blast === 3) {
      shape([[-53, 44], [-42, 59], [-16, 57], [3, 47], [-16, 42]], warmSteel, "#f2b77b", 1);
      shape([[-43, 46], [-37, 54], [-18, 52], [-5, 47], [-20, 45]], metal, "#ffad76", 0.7);
      for (let i = 0; i < 3; i++) light(-33 + i * 7, 49, 1.25, "#ff903c");
    }
  });

  // Shared central hull: bright red upper plates, dark recessed machinery,
  // amber cockpit and an exact, single centered metal nose.
  shape([[-78, -11], [-55, -22], [-6, -20], [33, -12], [65, -6], [93, 0], [65, 6], [33, 12], [-6, 20], [-55, 22], [-78, 11]], steel, "#9a9ca5", 1.3);
  mirrored(() => {
    shape([[-65, 3], [-60, 13], [-39, 18], [-3, 17], [26, 10], [14, 4]], metal, "#f58c7c", 0.9);
    shape([[-54, 6], [-48, 12], [-13, 13], [8, 8], [-8, 5]], "#531b29", "#a9373b", 0.7);
    line([[-45, 15], [-4, 14], [22, 9]], "#ff9382", 0.8);
    shape([[22, 10], [50, 8], [76, 4], [63, 2], [36, 4]], armor, "#ec6a5d", 0.7);
    line([[33, 8], [57, 6], [78, 2]], "#ff9a84", 0.8);
    shape([[-58, 3], [-28, 3], [-20, 8], [-50, 10]], "#142330", "#77828d", 0.8);
    vent(-49, 4, 6, "#657482");
    light(-13, 10, 1.3, pierce ? "#72e9e9" : "#ffa756");
    if (aegis) line([[-63, 12], [-49, 18], [-19, 18]], "#efc58c", aegis === 3 ? 2 : 1);
  });
  shape([[-70, -5], [-43, -6], [-26, 0], [-43, 6], [-70, 5]], "#263644", "#909aa4", 0.7);
  shape([[-67, -2], [-45, -3], [-34, 0], [-45, 3], [-67, 2]], "#9b2631", "#ef6b5c", 0.5);
  for (let i = 0; i < 4; i++) line([[-62 + i * 5, -2], [-62 + i * 5, 2]], "#111f2a", 1.5);
  shape([[-24, -5], [-10, -8], [10, -6], [17, 0], [10, 6], [-10, 8], [-24, 5]], steel, "#a7a5a8", 0.8);
  shape([[-16, -2], [7, -3], [11, 0], [7, 3], [-16, 2]], "#d34638", "#ffb77d", 0.8);
  shape([[13, -7], [30, -10], [48, -5], [55, 0], [48, 5], [30, 10], [13, 7], [19, 0]], "#161f2c", "#b7b2a4", 1);
  const canopy = linear(18, -7, 48, 8, [[0, "#fff0b4"], [0.23, "#d78b3c"], [0.48, "#6f3824"], [0.69, "#e6a949"], [1, "#ffdf88"]]);
  shape([[22, -5], [31, -7], [45, -3], [49, 0], [45, 3], [31, 7], [22, 5], [26, 0]], canopy, "#efc994", 0.65);
  line([[28, -5], [33, 0], [28, 5]], "#ffe6a7", 0.75);
  line([[34, 0], [46, 0]], "#412b22", 0.65);
  shape([[55, -3], [75, -3], [86, 0], [75, 3], [55, 3], [61, 0]], metal, "#f1967b", 0.7);
  shape([[78, -2], [93, 0], [78, 2], [83, 0]], "#c0c7c9", "#52606e", 0.65);
  ctx.restore();
  return true;
}
