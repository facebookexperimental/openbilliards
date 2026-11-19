// Copyright (c) Meta Platforms, Inc. and affiliates.

// mat/cloth/pool.js — the lamp pool on the cloth as numbers (CONTRACT.md 9.1, owner: cloth). Pure, no imports: the node arm
// (web/tools/club/test-club-cloth.mjs) checks the closed form against a brute-force sum, and cloth.js uses the same functions
// for the reference value it hands the shader.
//
// The lamp over a pool table is a rectangle of light close to the bed (the app's canopy: about 2.05 x 0.66 m at 1.02 m over a
// 2.54 x 1.27 m bed). For a diffuse emitter the light a horizontal patch of cloth receives is the rectangle's form factor at
// that patch: the share of the patch's cosine-weighted hemisphere the rectangle fills. It is 0.25 under the lamp centre, 0.15 at
// the middle of a long cushion and 0.07-0.09 in the corners: a corner receives a third of the centre. That falloff is the lamp
// pool. The app's lamp term has it; the rest of the light the app puts on the cloth (the environment cube) is the same
// everywhere on the bed, and it is most of the light. The cloth patch replaces that rest by a room's ambient light, so the
// pool is the lamp term's own falloff.

/**
 * Form factor of a horizontal rectangle that faces down (centre (cx, y, cz), half extents hx along x and hz along z) at the
 * point p = [x, y, z] below it, for an upward normal. Lambert's contour integral over the four edges; exact while the whole
 * rectangle is above the point's horizon, which holds for every point below the lamp plane.
 */
export function rectFormFactorUp(p, lamp) {
  const c = [lamp.cx - p[0], lamp.y - p[1], lamp.cz - p[2]];
  if (!(c[1] > 0)) return 0;
  const corner = (sx, sz) => {
    const v = [c[0] + sx * lamp.hx, c[1], c[2] + sz * lamp.hz];
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const v = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = v[i], b = v[(i + 1) % 4];
    const x = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const sin = Math.sqrt(Math.max(1 - x * x, 1e-12));
    sum += Math.acos(x) * (a[2] * b[0] - a[0] * b[2]) / sin; // theta * (a x b).y / |a x b|
  }
  return Math.abs(sum) / (2 * Math.PI);
}

/** The same quantity by summing N x N patches of the rectangle (the reference the closed form is tested against). */
export function rectFormFactorUpBrute(p, lamp, N = 160) {
  let sum = 0;
  const dA = (2 * lamp.hx / N) * (2 * lamp.hz / N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const dx = lamp.cx - lamp.hx + (i + 0.5) * 2 * lamp.hx / N - p[0];
      const dz = lamp.cz - lamp.hz + (j + 0.5) * 2 * lamp.hz / N - p[2];
      const dy = lamp.y - p[1];
      const r2 = dx * dx + dy * dy + dz * dz;
      if (dy > 0) sum += (dy * dy) / (Math.PI * r2 * r2) * dA; // cos at the patch * cos at the lamp / (pi r^2)
    }
  }
  return sum;
}

/**
 * One rectangle for a set of emitters [{ pos: [x, y, z], half: [hx, hz] }]: their bounding rectangle at the lowest emitter
 * height. A single emitter is returned as it is. Null when the list holds no usable emitter.
 */
export function lampBounds(emitters) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y = Infinity, n = 0, only = null;
  for (const e of emitters ?? []) {
    const [px, py, pz] = e?.pos ?? [], [hx, hz] = e?.half ?? [];
    if (![px, py, pz, hx, hz].every(Number.isFinite) || !(hx > 0) || !(hz > 0)) continue;
    x0 = Math.min(x0, px - hx); x1 = Math.max(x1, px + hx);
    z0 = Math.min(z0, pz - hz); z1 = Math.max(z1, pz + hz);
    y = Math.min(y, py); n += 1;
    only = { cx: px, cz: pz, hx, hz, y: py, emitters: 1 };
  }
  if (!n) return null;
  if (n === 1) return only;
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y, emitters: n };
}

/** The pool value the shader computes: form factor relative to the bed point under the lamp centre, clamped like the GLSL. */
export function poolAt(p, lamp, bedY = 0) {
  const ref = rectFormFactorUp([lamp.cx, bedY, lamp.cz], lamp);
  return ref > 0 ? Math.min(1.25, rectFormFactorUp(p, lamp) / ref) : 1;
}

/**
 * The lamp's radiance over the bounding rectangle `rect` of its emitters: lights = [{ color: [r, g, b], intensity, area }]
 * (three RectAreaLights: colour x intensity is the radiance of the rectangle). One emitter: its own radiance. Several: the
 * same flux spread over the bounds, so the pool computed from the bounding rectangle carries the fixture's light.
 */
export function lampRadiance(lights, rect) {
  const bounds = 4 * rect.hx * rect.hz;
  const out = [0, 0, 0];
  if (!(bounds > 0)) return out;
  for (const l of lights ?? []) {
    const k = Number(l?.intensity) * Number(l?.area) / bounds;
    if (!(k > 0) || !Array.isArray(l?.color)) continue;
    for (let i = 0; i < 3; i++) out[i] += Math.max(0, Number(l.color[i]) || 0) * k;
  }
  return out;
}

/**
 * The level the patch gives a cloth fragment (GLSL LIGHT), in units of the centre's ungained lamp light on the same albedo:
 * k = { direct, ambient, floor, throw } (uClubClothPool x, y, z; uClubClothShape x), pool = the lamp's form factor here
 * relative to the centre. The throw is an exponent on the pool (1 or absent = a bare diffuser).
 *   up      an upward patch (bed, cushion top): lamp pool ^ throw x gain + flat ambient, never under floor x the centre's level
 *   bedFF   a cushion face: the share of its hemisphere the bed fills, 0.5 ( 1 - n.y ); it takes that share of the bed's level
 *           as bounce (x bounce gain x the bed's colour, not included here) and that much less of the ambient light
 */
export function clothLevel(pool, k, ny = 1, faceW = 0) {
  const rel = k.direct * Math.max(pool, 1e-3) ** Math.max(1, k.throw ?? 1) + k.ambient;
  const fill = Math.max((k.floor ?? 0) * (k.direct + k.ambient) - rel, 0);
  const bedFF = faceW * 0.5 * (1 - ny);
  return { up: rel + fill, fill, bedFF, ambient: k.ambient * (1 - bedFF) + fill * (1 - faceW), bounce: (rel + fill) * bedFF };
}

/**
 * The veil of the patch (GLSL LIGHT) as a share of what the dye itself returns of the centre's lamp light: `dim` where the
 * pool (with the throw) is at or under v.from, `lit` from v.to on, a smooth step between. pool: the lamp's form factor here
 * relative to the centre; k.throw: the exponent on it.
 */
export function clothVeil(pool, k, v) {
  const s = Math.max(pool, 1e-3) ** Math.max(1, k.throw ?? 1);
  const from = v.from ?? 0, to = Math.max(v.to ?? 1, from + 1e-4);
  const u = Math.min(1, Math.max(0, (s - from) / (to - from)));
  return v.dim + (v.lit - v.dim) * (u * u * (3 - 2 * u));
}

/**
 * The patch's saturation (GLSL clubClothSat) on a scene-linear colour [r, g, b]: each channel's ratio to the luminance is
 * raised to the power s and the luminance is put back. s = 1 is the identity; a channel at zero stays at zero.
 */
export function clothSaturation(c, s) {
  const W = [0.2126, 0.7152, 0.0722];
  const l = Math.max(W[0] * c[0] + W[1] * c[1] + W[2] * c[2], 1e-6);
  const r = c.map((v) => Math.max(v / l, 1e-6) ** s);
  const k = l / Math.max(W[0] * r[0] + W[1] * r[1] + W[2] * r[2], 1e-6);
  return r.map((v) => v * k);
}

/**
 * The patch's detail fade (GLSL clubClothKeep): dx, dy are the screen derivatives of the lookup coordinate (tiles per pixel),
 * size the texels per tile, keep = [narrow from, narrow to, wide from, wide to] in texels (cloth/glsl.js KEEP). 1 while both
 * sides of the pixel's footprint are under the first value of their pair, 0 from the second.
 */
export function weaveKeep(dx, dy, size, keep = [0.6, 1.4, 1.8, 3.2]) {
  const a = dx[0] * dx[0] + dx[1] * dx[1], b = dy[0] * dy[0] + dy[1] * dy[1], c = dx[0] * dy[0] + dx[1] * dy[1];
  const t = a + b, d = Math.sqrt(Math.max((a - b) * (a - b) + 4 * c * c, 0));
  const narrow = size * Math.sqrt(Math.max(0.5 * (t - d), 0)), wide = size * Math.sqrt(0.5 * (t + d));
  const ss = (e0, e1, x) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
  return { keep: (1 - ss(keep[0], keep[1], narrow)) * (1 - ss(keep[2], keep[3], wide)), narrow, wide };
}

/**
 * Screen derivatives of the bed's weave coordinate at the bed point a pixel looks at, for a pinhole camera: cam and target in
 * world metres, fovDeg vertical, the frame w x h pixels, (px, py) the pixel (origin top left). Returns null when the pixel's
 * ray misses the bed plane. Coordinates are tiles: (x, -z) * tilesPerM, threads along x.
 */
export function bedFootprint({ cam, target, fovDeg, w = 1280, h = 720 }, px, py, tilesPerM, bedY = 0) {
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const norm = (p) => { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; };
  const f = norm(sub(target, cam)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  const th = Math.tan(fovDeg * Math.PI / 360);
  const hit = (x, y) => {
    const sx = ((x + 0.5) / w * 2 - 1) * th * (w / h), sy = (1 - (y + 0.5) / h * 2) * th;
    const d = [f[0] + r[0] * sx + u[0] * sy, f[1] + r[1] * sx + u[1] * sy, f[2] + r[2] * sx + u[2] * sy];
    if (!(d[1] < -1e-6)) return null;
    const t = (bedY - cam[1]) / d[1];
    return [cam[0] + d[0] * t, cam[2] + d[2] * t, t * Math.hypot(d[0], d[1], d[2])];
  };
  const p0 = hit(px, py), p1 = hit(px + 1, py), p2 = hit(px, py + 1);
  if (!p0 || !p1 || !p2) return null;
  return {
    point: [p0[0], bedY, p0[1]], distance: p0[2],
    dx: [(p1[0] - p0[0]) * tilesPerM, -(p1[1] - p0[1]) * tilesPerM],
    dy: [(p2[0] - p0[0]) * tilesPerM, -(p2[1] - p0[1]) * tilesPerM],
  };
}

/**
 * The patch's weave coordinate in metres (GLSL WEAVE, before the tiles-per-metre scale): [along the threads, across them].
 * p: world position, n: world normal (it only picks the orientation: an end cushion's threads run along z), cushW: 0 on the
 * bed, 1 on a cushion, nap: thread direction on the bed (world x, z). Across the threads the coordinate is the horizontal
 * distance, folded over the cushion profile as | distance | - height.
 */
export function weaveCoord(p, n, cushW, nap = [1, 0], bedY = 0) {
  const end = Math.abs(n[0]) > Math.abs(n[2]) + 0.02;
  const ax = end ? [-nap[1], nap[0]] : [nap[0], nap[1]]; // (x, z) of the thread axis
  const along = p[0] * ax[0] + p[2] * ax[1];
  const across = p[0] * ax[1] - p[2] * ax[0];            // dot(p, cross(up, axis))
  return [along, across + cushW * (Math.abs(across) - (p[1] - bedY) - across)];
}
