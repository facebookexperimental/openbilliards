// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/props/extras.js — a potted plant and a coat stand (owner: props). Built in the kit's current frame, origin on the floor.

/**
 * A floor plant: a glazed pot and arching blades, about 1.5 m high. `back` = the free depth behind it (local -Z, toward the
 * wall it stands against): a blade that arches that way lies along the wall instead of passing through it. `side` = the free
 * width to the nearer side wall (a plant in a corner).
 */
export function plant(c, back = 0.33, side = Infinity) {
  const { K, B, A, uv, detail, seg, rand } = c;
  c.touch(0.5, 0.5, 0, 0, true);                                                                  // contact: the pot on the floor
  K.lathe(B.paint, [[0, 0], [0.15, 0], [0.16, 0.02], [0.21, 0.36], [0.215, 0.4], [0.2, 0.41], [0.19, 0.38], [0, 0.38]], [0, 0, 0], { segs: seg(14), uv: uv.sw('enamel'), k: [0.5, 1] });
  const n = detail >= 2 ? 22 : 14, S = 6;
  const leaf = A.col('leaf');
  for (let k = 0; k < n; k++) {
    const az = (k / n) * Math.PI * 2 + rand() * 0.5;
    const len = 0.75 + rand() * 0.55, lean = 0.25 + rand() * 0.75, wid = 0.045 + rand() * 0.03;
    const ca = Math.cos(az), sa = Math.sin(az);
    const P = [], N = [], UV = [], C = [], quads = [];
    for (let i = 0; i <= S; i++) {
      const t = i / S;
      // an arc that starts upright and bends outward by `lean`
      const out = len * (lean * t * t * 0.9), up = 0.36 + len * (t - 0.42 * lean * t * t * t);
      const w = wid * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.9)) + 0.004;
      const lim = Math.max(0.05, side - w - 0.012);
      const cx = Math.max(-lim, Math.min(lim, ca * out)), cz = Math.max(sa * out, -(back - w - 0.012));
      // blade normal: up and outward, turning outward toward the tip
      const tilt = 0.5 + t * lean, nx = ca * Math.cos(tilt) * -1, ny = Math.sin(tilt), nz = sa * Math.cos(tilt) * -1;
      for (const side of [-1, 1]) {
        P.push(cx - sa * w * side, up, cz + ca * w * side);
        N.push(-nx, ny, -nz);
        UV.push(leaf[0], leaf[1] + t * (leaf[3] - leaf[1]));
        C.push(0.4 + 0.6 * t);
      }
      if (i) quads.push([2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i]);
    }
    K.raw(B.paint, P, N, UV, quads, C);
    // the underside (same points, opposite normals)
    K.raw(B.paint, P, N.map((v) => -v), UV, quads, C.map((v) => v * 0.7));
  }
}

/** A coat stand: a turned post on a round foot with hooks near the top, 1.8 m. */
export function coatStand(c) {
  const { K, B, uv, seg } = c;
  const wood = uv.wood();
  c.touch(0.58, 0.58, 0, 0, true);                                                                // contact: the foot
  K.lathe(B.wood, [[0, 0], [0.19, 0], [0.195, 0.015], [0.17, 0.035], [0.05, 0.06], [0.026, 0.12], [0.022, 1.7], [0.034, 1.74], [0.03, 1.79], [0, 1.8]], [0, 0, 0], { segs: seg(12), uv: wood, k: [0.6, 1] });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
    const y = k % 2 ? 1.62 : 1.5;
    K.tube(B.metal, [cs * 0.02, y, sn * 0.02], [cs * 0.13, y + 0.04, sn * 0.13], 0.006, 0.006, { segs: 5, uv: uv.metal('brass') });
    K.tube(B.metal, [cs * 0.13, y + 0.04, sn * 0.13], [cs * 0.15, y + 0.11, sn * 0.15], 0.006, 0.008, { segs: 5, uv: uv.metal('brass'), caps: true });
  }
}
