// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/props/seating.js — things people sit at (owner: props): the tall spectator chair, the round side table, the wall bench
// and the bar stool. Each function builds in the kit's current frame: origin on the floor, +Z = the front (away from the wall).
// Real-world sizes; edges near a camera are bevelled, cushions get a fat bevel so they read as upholstery; legs and plinths
// carry a baked shade toward the floor (kit `k`).

/** A tall spectator chair with arms: seat at 0.66 m, footrest, upholstered seat and back. Footprint 0.56 x 0.54. */
export function chair(c) {
  const { K, B, uv, detail } = c;
  const wood = uv.wood(), lea = uv.leather();
  const lx = 0.255, lzF = 0.235, lzB = -0.235;
  const leg = [0.5, 1];
  // contact: the four feet, and the air under the seat
  for (const sx of [-1, 1]) for (const z of [lzF, lzB]) c.touch(0.13, 0.13, sx * lx, z, true);
  c.touch(0.78, 0.76, 0, 0);
  if (detail === 0) {
    for (const sx of [-1, 1]) {
      K.box(B.wood, [0.045, 0.86, 0.045], [sx * lx, 0.43, lzF], { uv: wood, k: leg });
      K.box(B.wood, [0.045, 1.18, 0.045], [sx * lx, 0.59, lzB], { uv: wood, k: leg });
    }
    K.box(B.leather, [0.5, 0.12, 0.5], [0, 0.67, 0], { uv: lea, k: [0.5, 1] });
    K.box(B.leather, [0.47, 0.36, 0.06], [0, 0.97, lzB + 0.01], { uv: lea });
    return;
  }
  for (const sx of [-1, 1]) {
    K.box(B.wood, [0.045, 0.86, 0.045], [sx * lx, 0.43, lzF], { uv: wood, b: 0.006, g: 1, k: leg });      // front leg up to the arm
    K.box(B.wood, [0.045, 1.2, 0.045], [sx * lx, 0.6, lzB], { uv: wood, b: 0.006, g: 1, rx: -0.035, k: leg }); // back leg, a little raked
    K.box(B.wood, [0.06, 0.03, 0.56], [sx * lx, 0.875, 0], { uv: wood, b: 0.012, g: 2 });                 // arm
    K.box(B.wood, [0.025, 0.04, 0.44], [sx * lx, 0.3, 0], { uv: wood, b: 0.004, g: 2, k: 0.62 });         // side stretcher
  }
  K.box(B.wood, [0.5, 0.055, 0.5], [0, 0.63, 0], { uv: wood, b: 0.008, k: [0.45, 0.9] });                 // seat frame
  K.box(B.wood, [0.5, 0.03, 0.045], [0, 0.22, lzF], { uv: wood, b: 0.008, k: 0.7 });                      // footrest
  K.box(B.wood, [0.5, 0.035, 0.025], [0, 0.34, lzB], { uv: wood, b: 0.004, k: 0.55 });                    // back stretcher
  K.box(B.wood, [0.555, 0.065, 0.035], [0, 1.185, lzB - 0.02], { uv: wood, b: 0.012 });                   // top rail
  K.box(B.leather, [0.47, 0.085, 0.46], [0, 0.695, 0.005], { uv: lea, b: 0.03, k: [0.6, 1] });            // seat cushion
  K.box(B.leather, [0.455, 0.36, 0.07], [0, 0.965, lzB + 0.03], { uv: lea, b: 0.028, rx: -0.07, k: [0.7, 1] }); // back cushion
  if (detail >= 2) {
    for (const sx of [-1, 1]) for (const z of [-0.17, 0, 0.17]) K.sphere(B.metal, 0.007, [sx * 0.238, 0.665, z], { segs: 5, rings: 3, uv: uv.metal('brass') }); // nail heads
  }
}

/**
 * A candle in a glass jar standing at (x, y, z): a small warm point of light at table height. In a blurred background these
 * are the round discs; nothing is registered with the room light for them.
 */
export function candle(c, x, y, z) {
  const { K, B, uv, seg, E } = c;
  K.lathe(B.emit, [[0, 0], [0.027, 0], [0.031, 0.012], [0.031, 0.062], [0.027, 0.066]], [x, y, z], { segs: seg(8), uv: uv.sw('candle'), k: [E.jar * 0.3, E.jar * 1.6] });
  // the flame stands just proud of the jar's rim, so it is seen from table height across the room
  K.sphere(B.emit, 0.009, [x, y + 0.071, z], { segs: 6, rings: 4, uv: uv.sw('flame'), k: E.flame });
}

/** A round pedestal side table, 0.74 m high, top 0.54 m across. */
export function sideTable(c) {
  const { K, B, uv, detail, seg } = c;
  const wood = uv.wood();
  c.touch(0.6, 0.6, 0, 0, true);                                                                  // contact: the pedestal's foot
  K.lathe(B.top, [[0, 0.705], [0.25, 0.705], [0.268, 0.712], [0.27, 0.728], [0.262, 0.74], [0, 0.74]], [0, 0, 0], { segs: seg(20), uv: wood });
  K.lathe(B.wood, [[0, 0], [0.2, 0], [0.205, 0.012], [0.19, 0.028], [0.07, 0.05], [0.036, 0.09], [0.032, 0.62], [0.06, 0.68], [0.1, 0.705], [0, 0.705]], [0, 0, 0], { segs: seg(12), uv: wood, k: [0.75, 0.4] });
  if (detail >= 1) { // a drink and a cube of chalk
    // the drink: glass with a finger of whisky, in the glass batch (little light behind it here; it carries a glint)
    K.lathe(B.glass, [[0, 0], [0.03, 0], [0.036, 0.11], [0.034, 0.11], [0.029, 0.008], [0, 0.008]], [0.09, 0.74, 0.05], { segs: seg(8), uv: { r: c.A.col('drink') }, k: 0.36, k2: c.look?.shelves === 'r2' ? 0 : 0.6 });
    K.box(B.paint, [0.024, 0.022, 0.024], [-0.1, 0.751, -0.04], { uv: uv.sw('chalkBlue'), b: 0.002, ry: 0.5 });
    candle(c, -0.02, 0.74, 0.1);
  }
}

/** A wall bench `len` long: seat at 0.47 m, upholstered seat and back, 0.5 m deep. Origin at the wall. */
export function bench(c, len) {
  const { K, B, uv, detail } = c;
  const wood = uv.wood(), lea = uv.leather();
  c.touchBox(len + 0.08, 0.5, 0, 0.25);                                                         // contact: the plinth on the floor
  K.box(B.wood, [len, 0.33, 0.44], [0, 0.215, 0.25], { uv: wood, b: 0.008, k: [0.45, 0.85] });  // plinth box
  K.box(B.paint, [len - 0.04, 0.05, 0.4], [0, 0.025, 0.24], { uv: uv.sw('kick'), b: 0 });
  K.box(B.wood, [len + 0.03, 0.03, 0.5], [0, 0.395, 0.25], { uv: wood, b: 0.008 });             // seat board
  K.box(B.wood, [len + 0.03, 0.05, 0.05], [0, 1.0, 0.03], { uv: wood, b: 0.01 });               // cap rail on the wall
  const n = detail === 0 ? 1 : Math.max(2, Math.round(len / 0.6));
  const cw = (len - 0.02) / n;
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + 0.01 + (i + 0.5) * cw;
    K.box(B.leather, [cw - 0.012, 0.1, 0.44], [x, 0.46, 0.27], { uv: lea, b: 0.032, k: [0.6, 1] });
    K.box(B.leather, [cw - 0.012, 0.42, 0.09], [x, 0.75, 0.075], { uv: lea, b: 0.032, rx: -0.09, k: [0.65, 1] });
  }
  if (detail >= 1) for (const sx of [-1, 1]) K.box(B.wood, [0.05, 0.62, 0.5], [sx * (len / 2 + 0.04), 0.31, 0.25], { uv: wood, b: 0.012, g: 2, k: [0.5, 1] }); // end panels
}

/** A bar stool: round upholstered seat at 0.78 m, four splayed turned legs, stretchers. */
export function stool(c) {
  const { K, B, uv, detail, seg } = c;
  const wood = uv.wood();
  K.lathe(B.leather, [[0, 0.72], [0.15, 0.72], [0.176, 0.735], [0.182, 0.757], [0.165, 0.778], [0.1, 0.787], [0, 0.789]], [0, 0, 0], { segs: seg(14), uv: uv.leather(), k: [0.55, 1] });
  c.touch(0.66, 0.66, 0, 0);                                                                      // contact: the air between the legs
  if (detail === 0) {
    c.touch(0.5, 0.5, 0, 0, true);
    K.tube(B.wood, [0, 0, 0], [0, 0.72, 0], 0.03, 0.03, { segs: 5, uv: wood, k: [0.5, 0.8] });
    K.disc(B.wood, 0.19, [0, 0.012, 0], { segs: 8, uv: wood, k: 0.6 });
    return;
  }
  K.lathe(B.wood, [[0, 0.69], [0.15, 0.69], [0.16, 0.7], [0.158, 0.72], [0, 0.72]], [0, 0, 0], { segs: seg(14), uv: wood, k: 0.6 });
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, cs = Math.cos(a), sn = Math.sin(a);
    c.touch(0.1, 0.1, cs * 0.215, sn * 0.215, true);                                              // contact: a foot
    K.tube(B.wood, [cs * 0.215, 0, sn * 0.215], [cs * 0.115, 0.7, sn * 0.115], 0.016, 0.02, { segs: 6, uv: wood, k: [0.55, 0.75] });
    const a2 = a + Math.PI / 2, r = 0.186;
    K.tube(B.wood, [cs * r, 0.25, sn * r], [Math.cos(a2) * r, 0.25, Math.sin(a2) * r], 0.009, 0.009, { segs: 5, uv: wood, k: 0.6 });
  }
}
