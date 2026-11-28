// Copyright (c) Meta Platforms, Inc. and affiliates.

// bake-room-core.mjs — the compute core of the club room's light bake. Pure JavaScript on typed arrays: no imports, no DOM,
// no three, so the same file runs in the bake page (web/tools/club/bake-room.html), in its workers (bake-room-worker.mjs)
// and in node (bake-room.mjs --verify).
//
// Determinism: a bake is a pure function of its scene. Nothing here reads a clock or a random source; every sample pattern
// comes from fixed Kronecker sequences; the only library math used is Math.sqrt / abs / min / max / floor (exactly rounded
// or exact by the language); sine, cosine and the fifth root behind the sRGB curve are computed here from + - * / alone, so
// two engines give the same bits. Texels are independent of each other, so the result does not depend on how the work is
// split over workers or over jobs.
//
// What is computed, per texel of the shell's second UV set (room/lightmap.js):
//   direct   the same closed forms the room-light shader evaluates per emitter (web/scene/club/room/light.js LIGHTS_FRAGMENT),
//            times the visible share of the emitter: 15 points on a small sphere for a lamp, 16 stratified points on a
//            rectangle, 8 on a tube, weighted by their own geometric term (fewer rays where the emitter adds little: under
//            0.12 of irradiance five points of a lamp, under 0.02 one ray or a quarter of an area light's samples);
//   lamp     the visible share of the main table's lamp rectangle (the alpha channel): the lamp stays a live light in the app;
//   bounce   a cosine-weighted gather over the scene's patches (every triangle, large ones cut to <= 0.3 m): each patch holds
//            its direct light (emitters and the main lamp) plus three further bounces solved patch to patch;
//   ambient  a small constant room ambient times the open share of the same gather rays (distance-weighted), so corners, coves
//            and the floor under furniture go darker even where no emitter reaches.
// Area lights, the lamp share and the gather use interleaved sampling: 16 patterns over a 4 x 4 texel tile, removed by two
// 4-texel box filters that stay inside a chart (finish()).
//
// The light volume (shadeVolume / finishVolume): the same four terms at the points of a coarse 3D grid, for the six axis
// directions as receiver normals (an ambient cube per grid point), each averaged over a few sample patterns; a grid point
// inside a solid takes the light of its free neighbours. It is what the furniture reads (it has no second UV set).
//
// The main lamp's pool: the lamp is a shaded one, so the light it leaves on a patch (the source of the bounce) is scaled by
// the closed form of web/scene/club/room/light.js clubRoomLampPool (lamp.pool = the two tangents and, third, the gain the
// floor's shader puts on the lamp's light: applied here to floor patches only, as there). The lamp-share channel does not
// carry the pool: the shader applies it per fragment.

export const CORE_VERSION = 5;

// ---- deterministic math -------------------------------------------------------------------------------------------------------
const PI = 3.141592653589793;
const HALF_PI = 1.5707963267948966;
/** sine and cosine from polynomials on [-pi/4, pi/4] after exact quadrant reduction for |x| <= 2 pi (all this file needs) */
function sinPoly(x) { const x2 = x * x; return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800))))))); }
function cosPoly(x) { const x2 = x * x; return 1 + x2 * (-1 / 2 + x2 * (1 / 24 + x2 * (-1 / 720 + x2 * (1 / 40320 + x2 * (-1 / 3628800 + x2 * (1 / 479001600 + x2 * (-1 / 87178291200))))))); }
export function dsin(x) {
  const q = Math.floor(x / HALF_PI + 0.5);
  const r = x - q * HALF_PI;
  const m = ((q % 4) + 4) % 4;
  return m === 0 ? sinPoly(r) : m === 1 ? cosPoly(r) : m === 2 ? -sinPoly(r) : -cosPoly(r);
}
export function dcos(x) { return dsin(x + HALF_PI); }
const frac = (x) => x - Math.floor(x);
// Kronecker (R2) sequence constants
const A1 = 0.7548776662466927, A2 = 0.5698402909980532, B1 = 0.6180339887498949, B2 = 0.3247179572447460;

/** t^(1/5) for t in (0, 1] by Newton from 1 (monotone), a fixed number of steps */
function fifthRoot(t) {
  let r = 1;
  for (let i = 0; i < 90; i++) { const r2 = r * r; r = (4 * r + t / (r2 * r2)) / 5; }
  return r;
}
/** sRGB display curve: the linear value at which the encoded value reaches y (0..1) */
function srgbToLinear(y) {
  if (y <= 0.04045) return y / 12.92;
  const t = (y + 0.055) / 1.055;
  const r = fifthRoot(t);
  return t * t * r * r; // t^2.4
}

// ---- BVH -------------------------------------------------------------------------------------------------------------------------
/**
 * buildBVH(tris, flags) -> a flat bounding-volume hierarchy over triangles (Float32Array of 9 numbers each; flags: one byte
 * each, a bit mask a ray can ignore). Median split on the centroid along the widest axis; leaves of at most 4 triangles.
 * Triangles are stored in leaf order as v0, e1, e2 for the intersection test; `order[k]` = the caller's index of slot k.
 */
export function buildBVH(tris, flags) {
  const T = tris.length / 9;
  const cen = new Float32Array(T * 3), lo = new Float32Array(T * 3), hi = new Float32Array(T * 3);
  for (let t = 0; t < T; t++) {
    for (let a = 0; a < 3; a++) {
      const v0 = tris[9 * t + a], v1 = tris[9 * t + 3 + a], v2 = tris[9 * t + 6 + a];
      lo[3 * t + a] = Math.min(v0, v1, v2); hi[3 * t + a] = Math.max(v0, v1, v2);
      cen[3 * t + a] = (lo[3 * t + a] + hi[3 * t + a]) * 0.5;
    }
  }
  const order = new Uint32Array(T);
  for (let t = 0; t < T; t++) order[t] = t;
  const maxNodes = Math.max(1, 2 * T);
  const nb = new Float32Array(maxNodes * 6);   // bounds: min xyz, max xyz
  const nl = new Int32Array(maxNodes);         // inner: index of the left child (right = left + 1); leaf: -(first + 1)
  const nc = new Int32Array(maxNodes);         // leaf: triangle count; inner: 0
  let nodes = 1;
  const stack = [[0, 0, T]];
  const tmp = new Uint32Array(T);
  while (stack.length) {
    const [node, a, b] = stack.pop();
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    let cx0 = Infinity, cy0 = Infinity, cz0 = Infinity, cx1 = -Infinity, cy1 = -Infinity, cz1 = -Infinity;
    for (let k = a; k < b; k++) {
      const t = order[k];
      if (lo[3 * t] < x0) x0 = lo[3 * t]; if (lo[3 * t + 1] < y0) y0 = lo[3 * t + 1]; if (lo[3 * t + 2] < z0) z0 = lo[3 * t + 2];
      if (hi[3 * t] > x1) x1 = hi[3 * t]; if (hi[3 * t + 1] > y1) y1 = hi[3 * t + 1]; if (hi[3 * t + 2] > z1) z1 = hi[3 * t + 2];
      if (cen[3 * t] < cx0) cx0 = cen[3 * t]; if (cen[3 * t + 1] < cy0) cy0 = cen[3 * t + 1]; if (cen[3 * t + 2] < cz0) cz0 = cen[3 * t + 2];
      if (cen[3 * t] > cx1) cx1 = cen[3 * t]; if (cen[3 * t + 1] > cy1) cy1 = cen[3 * t + 1]; if (cen[3 * t + 2] > cz1) cz1 = cen[3 * t + 2];
    }
    nb[6 * node] = x0; nb[6 * node + 1] = y0; nb[6 * node + 2] = z0; nb[6 * node + 3] = x1; nb[6 * node + 4] = y1; nb[6 * node + 5] = z1;
    const n = b - a;
    const ex = cx1 - cx0, ey = cy1 - cy0, ez = cz1 - cz0;
    const axis = ex >= ey && ex >= ez ? 0 : (ey >= ez ? 1 : 2);
    const ext = axis === 0 ? ex : axis === 1 ? ey : ez;
    if (n <= 4 || !(ext > 1e-9)) { nl[node] = -(a + 1); nc[node] = n; continue; }
    // partition about the middle of the centroid bounds; fall back to an even split by sorted order when one side is empty
    const mid = (axis === 0 ? cx0 + cx1 : axis === 1 ? cy0 + cy1 : cz0 + cz1) * 0.5;
    let i = a, j = 0;
    for (let k = a; k < b; k++) { const t = order[k]; if (cen[3 * t + axis] < mid) order[i++] = t; else tmp[j++] = t; }
    for (let k = 0; k < j; k++) order[i + k] = tmp[k];
    let m = i;
    if (m === a || m === b) {
      const part = Array.from(order.subarray(a, b)).sort((p, q) => (cen[3 * p + axis] - cen[3 * q + axis]) || (p - q));
      for (let k = 0; k < n; k++) order[a + k] = part[k];
      m = a + (n >> 1);
    }
    const left = nodes; nodes += 2;
    nl[node] = left; nc[node] = 0;
    stack.push([left + 1, m, b]); stack.push([left, a, m]);
  }
  const tv = new Float32Array(T * 9);
  const tf = new Uint8Array(T);
  for (let k = 0; k < T; k++) {
    const t = order[k];
    for (let a = 0; a < 3; a++) {
      tv[9 * k + a] = tris[9 * t + a];
      tv[9 * k + 3 + a] = tris[9 * t + 3 + a] - tris[9 * t + a];
      tv[9 * k + 6 + a] = tris[9 * t + 6 + a] - tris[9 * t + a];
    }
    tf[k] = flags ? flags[t] : 0;
  }
  return { nb: nb.slice(0, nodes * 6), nl: nl.slice(0, nodes), nc: nc.slice(0, nodes), tv, tf, order, nodes, T };
}

const STACK = new Int32Array(128);
/** Is anything between the origin and tmax along (dx, dy, dz)? Triangles are two-sided; flags & ignore are skipped. */
export function occluded(bvh, ox, oy, oz, dx, dy, dz, tmax, ignore) {
  const { nb, nl, nc, tv, tf } = bvh;
  const ix = 1 / (dx === 0 ? 1e-30 : dx), iy = 1 / (dy === 0 ? 1e-30 : dy), iz = 1 / (dz === 0 ? 1e-30 : dz);
  let sp = 0;
  STACK[sp++] = 0;
  while (sp > 0) {
    const node = STACK[--sp];
    const o = 6 * node;
    let t0 = (nb[o] - ox) * ix, t1 = (nb[o + 3] - ox) * ix;
    let tn = t0 < t1 ? t0 : t1, tf2 = t0 < t1 ? t1 : t0;
    t0 = (nb[o + 1] - oy) * iy; t1 = (nb[o + 4] - oy) * iy;
    let a = t0 < t1 ? t0 : t1, b = t0 < t1 ? t1 : t0;
    if (a > tn) tn = a; if (b < tf2) tf2 = b;
    t0 = (nb[o + 2] - oz) * iz; t1 = (nb[o + 5] - oz) * iz;
    a = t0 < t1 ? t0 : t1; b = t0 < t1 ? t1 : t0;
    if (a > tn) tn = a; if (b < tf2) tf2 = b;
    if (!(tn <= tf2) || tf2 < 0 || tn > tmax) continue;
    const l = nl[node];
    if (l >= 0) { STACK[sp++] = l; STACK[sp++] = l + 1; continue; }
    const first = -l - 1, end = first + nc[node];
    for (let k = first; k < end; k++) {
      if (tf[k] & ignore) continue;
      const p = 9 * k;
      const e1x = tv[p + 3], e1y = tv[p + 4], e1z = tv[p + 5], e2x = tv[p + 6], e2y = tv[p + 7], e2z = tv[p + 8];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det > -1e-12 && det < 1e-12) continue;
      const inv = 1 / det;
      const sx = ox - tv[p], sy = oy - tv[p + 1], sz = oz - tv[p + 2];
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 1e-6 && t < tmax) return true;
    }
  }
  return false;
}

export const HIT = { t: 0, tri: -1, back: false, u: 0, v: 0 };
/** Nearest hit within tmax: fills HIT (t, tri = the caller's triangle index, back = hit from behind, u / v = the barycentric
 * weights of the triangle's second and third vertex) and returns tri or -1. */
export function nearest(bvh, ox, oy, oz, dx, dy, dz, tmax, ignore) {
  const { nb, nl, nc, tv, tf, order } = bvh;
  const ix = 1 / (dx === 0 ? 1e-30 : dx), iy = 1 / (dy === 0 ? 1e-30 : dy), iz = 1 / (dz === 0 ? 1e-30 : dz);
  let best = tmax, slot = -1, back = false, bu = 0, bv = 0;
  let sp = 0;
  STACK[sp++] = 0;
  while (sp > 0) {
    const node = STACK[--sp];
    const o = 6 * node;
    let t0 = (nb[o] - ox) * ix, t1 = (nb[o + 3] - ox) * ix;
    let tn = t0 < t1 ? t0 : t1, tf2 = t0 < t1 ? t1 : t0;
    t0 = (nb[o + 1] - oy) * iy; t1 = (nb[o + 4] - oy) * iy;
    let a = t0 < t1 ? t0 : t1, b = t0 < t1 ? t1 : t0;
    if (a > tn) tn = a; if (b < tf2) tf2 = b;
    t0 = (nb[o + 2] - oz) * iz; t1 = (nb[o + 5] - oz) * iz;
    a = t0 < t1 ? t0 : t1; b = t0 < t1 ? t1 : t0;
    if (a > tn) tn = a; if (b < tf2) tf2 = b;
    if (!(tn <= tf2) || tf2 < 0 || tn > best) continue;
    const l = nl[node];
    if (l >= 0) { STACK[sp++] = l; STACK[sp++] = l + 1; continue; }
    const first = -l - 1, end = first + nc[node];
    for (let k = first; k < end; k++) {
      if (tf[k] & ignore) continue;
      const p = 9 * k;
      const e1x = tv[p + 3], e1y = tv[p + 4], e1z = tv[p + 5], e2x = tv[p + 6], e2y = tv[p + 7], e2z = tv[p + 8];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det > -1e-12 && det < 1e-12) continue;
      const inv = 1 / det;
      const sx = ox - tv[p], sy = oy - tv[p + 1], sz = oz - tv[p + 2];
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 1e-6 && t < best) { best = t; slot = k; back = det < 0; bu = u; bv = v; }
    }
  }
  HIT.t = best; HIT.back = back; HIT.u = bu; HIT.v = bv; HIT.tri = slot < 0 ? -1 : order[slot];
  return HIT.tri;
}

// ---- triangles: cut large ones, so each can hold one light value (a patch) ---------------------------------------------------
/**
 * tessellate(tris, flags, albedo, maxEdge) -> { tris, flags, albedo }: a triangle with an edge longer than maxEdge AND an
 * area over maxEdge^2 / 2 (a full patch) is split at the middle of its longest edge, until none is left. Long slivers
 * (a moulding segment, a rod) therefore stay long: what they send back is too little to matter, and cutting them would
 * multiply the triangle count. Order is deterministic (input order, depth first).
 */
export function tessellate(tris, flags, albedo, maxEdge) {
  const outT = [], outF = [], outA = [];
  const m2 = maxEdge * maxEdge;
  const T = tris.length / 9;
  const stack = [];
  for (let t = 0; t < T; t++) {
    stack.length = 0;
    stack.push(Array.from(tris.subarray(9 * t, 9 * t + 9)));
    while (stack.length) {
      const v = stack.pop();
      const d = (i, j) => (v[3 * i] - v[3 * j]) ** 2 + (v[3 * i + 1] - v[3 * j + 1]) ** 2 + (v[3 * i + 2] - v[3 * j + 2]) ** 2;
      const d01 = d(0, 1), d12 = d(1, 2), d20 = d(2, 0);
      const big = Math.max(d01, d12, d20);
      const ux = v[3] - v[0], uy = v[4] - v[1], uz = v[5] - v[2], wx = v[6] - v[0], wy = v[7] - v[1], wz = v[8] - v[2];
      const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
      const area2 = cx * cx + cy * cy + cz * cz; // (2 * area)^2
      if (!(big > m2) || !(area2 > m2 * m2)) { for (let k = 0; k < 9; k++) outT.push(v[k]); outF.push(flags[t]); outA.push(albedo[3 * t], albedo[3 * t + 1], albedo[3 * t + 2]); continue; }
      // rotate so that the longest edge is 0-1, then split it
      const r = big === d01 ? [0, 1, 2] : big === d12 ? [1, 2, 0] : [2, 0, 1];
      const P = (i) => [v[3 * r[i]], v[3 * r[i] + 1], v[3 * r[i] + 2]];
      const a = P(0), b = P(1), c = P(2);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      stack.push([...mid, ...b, ...c]); stack.push([...a, ...mid, ...c]);
    }
  }
  return { tris: Float32Array.from(outT), flags: Uint8Array.from(outF), albedo: Float32Array.from(outA) };
}

// ---- rasterise the second UV set: which point of the shell is each texel? ------------------------------------------------------
/**
 * rasterize(meshes, size) -> { count, index: Int32Array(size*size) (texel -> slot or -1), x, y, pos, nor, chart, depth }.
 * `meshes`: [{ position, normal, lm, index, chart: Int16Array, depth: Float32Array, kind: Int8Array per chart id }] as plain
 * typed arrays in world space. A texel belongs to the triangle that covers its centre; where several do (relief projected
 * into a planar chart), the one that stands furthest out of the chart plane wins (depth). Vertices with depth < -1e8 claim
 * nothing (faces that ride a chart edge on).
 */
export function rasterize(meshes, size) {
  const index = new Int32Array(size * size).fill(-1);
  const best = new Float32Array(size * size).fill(-Infinity);
  const P = [], N = [], C = [], X = [], Y = [];
  const put = (tx, ty, d, px, py, pz, nx, ny, nz, chart) => {
    const i = ty * size + tx;
    if (d <= best[i]) return;
    best[i] = d;
    let s = index[i];
    if (s < 0) { s = X.length; index[i] = s; X.push(tx); Y.push(ty); P.push(0, 0, 0); N.push(0, 0, 0); C.push(0); }
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    P[3 * s] = px; P[3 * s + 1] = py; P[3 * s + 2] = pz; N[3 * s] = nx / l; N[3 * s + 1] = ny / l; N[3 * s + 2] = nz / l; C[s] = chart;
  };
  for (const m of meshes) {
    const { position: pos, normal: nor, lm, index: idx, chart, depth } = m;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (chart[a] < 0 || depth[a] < -1e8 || depth[b] < -1e8 || depth[c] < -1e8) continue;
      const ax = lm[2 * a] * size, ay = lm[2 * a + 1] * size, bx = lm[2 * b] * size, by = lm[2 * b + 1] * size, cx = lm[2 * c] * size, cy = lm[2 * c + 1] * size;
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(area) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(size - 1, Math.floor(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(size - 1, Math.floor(Math.max(ay, by, cy)));
      const inv = 1 / area;
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const sx = tx + 0.5, sy = ty + 0.5;
          const w0 = ((bx - sx) * (cy - sy) - (cx - sx) * (by - sy)) * inv;
          const w1 = ((cx - sx) * (ay - sy) - (ax - sx) * (cy - sy)) * inv;
          const w2 = 1 - w0 - w1;
          if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
          put(tx, ty, w0 * depth[a] + w1 * depth[b] + w2 * depth[c],
            w0 * pos[3 * a] + w1 * pos[3 * b] + w2 * pos[3 * c], w0 * pos[3 * a + 1] + w1 * pos[3 * b + 1] + w2 * pos[3 * c + 1], w0 * pos[3 * a + 2] + w1 * pos[3 * b + 2] + w2 * pos[3 * c + 2],
            w0 * nor[3 * a] + w1 * nor[3 * b] + w2 * nor[3 * c], w0 * nor[3 * a + 1] + w1 * nor[3 * b + 1] + w2 * nor[3 * c + 1], w0 * nor[3 * a + 2] + w1 * nor[3 * b + 2] + w2 * nor[3 * c + 2],
            chart[a]);
        }
      }
    }
  }
  return { count: X.length, index, x: Uint16Array.from(X), y: Uint16Array.from(Y), pos: Float32Array.from(P), nor: Float32Array.from(N), chart: Int16Array.from(C) };
}

// ---- sample patterns ------------------------------------------------------------------------------------------------------------
const PHASES = 16;
export function makePatterns(gatherPerPhase) {
  // gather: PHASES sets of cosine-weighted directions in the local frame (z = the normal)
  const G = gatherPerPhase;
  const gather = new Float32Array(PHASES * G * 3);
  for (let ph = 0; ph < PHASES; ph++) {
    for (let j = 0; j < G; j++) {
      const u = frac(0.5 + (j + 1) * A1 + ph * B1), v = frac(0.5 + (j + 1) * A2 + ph * B2);
      const r = Math.sqrt(u), th = 2 * PI * v;
      const o = (ph * G + j) * 3;
      gather[o] = r * dcos(th); gather[o + 1] = r * dsin(th); gather[o + 2] = Math.sqrt(Math.max(0, 1 - u));
    }
  }
  // per-phase jitter inside a stratum (area lights, the lamp)
  const jit = new Float32Array(PHASES * 2);
  for (let ph = 0; ph < PHASES; ph++) { jit[2 * ph] = frac(0.5 + (ph + 1) * A1); jit[2 * ph + 1] = frac(0.5 + (ph + 1) * A2); }
  // a lamp as a shadow caster, on the unit sphere: the centre and a tetrahedron (the 5-point set), then the other four
  // corners of the same cube and the six face centres (the 15-point set)
  const c3 = 0.5773502691896258;
  const pts = [[0, 0, 0], [c3, c3, c3], [c3, -c3, -c3], [-c3, c3, -c3], [-c3, -c3, c3],
    [-c3, -c3, -c3], [-c3, c3, c3], [c3, -c3, c3], [c3, c3, -c3], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const sph = new Float32Array(pts.length * 3);
  for (let k = 0; k < pts.length; k++) { sph[3 * k] = pts[k][0]; sph[3 * k + 1] = pts[k][1]; sph[3 * k + 2] = pts[k][2]; }
  // validity probes: 8 directions in the tangent plane and 8 lifted by 45 degrees (local frame)
  const probes = new Float32Array(16 * 3);
  for (let k = 0; k < 8; k++) {
    const th = (k + 0.5) * (PI / 4), c = dcos(th), s = dsin(th);
    probes[3 * k] = c; probes[3 * k + 1] = s; probes[3 * k + 2] = 0.02;
    probes[24 + 3 * k] = c * 0.7071067811865476; probes[25 + 3 * k] = s * 0.7071067811865476; probes[26 + 3 * k] = 0.7071067811865476;
  }
  return { G, gather, jit, sph, probes };
}

// an orthonormal frame around a unit normal (no trigonometry)
function frame(nx, ny, nz, out) {
  let tx, ty, tz;
  if (Math.abs(nx) > Math.abs(nz)) { const l = Math.sqrt(nx * nx + ny * ny) || 1; tx = -ny / l; ty = nx / l; tz = 0; } else { const l = Math.sqrt(ny * ny + nz * nz) || 1; tx = 0; ty = -nz / l; tz = ny / l; }
  out[0] = tx; out[1] = ty; out[2] = tz;
  out[3] = ny * tz - nz * ty; out[4] = nz * tx - nx * tz; out[5] = nx * ty - ny * tx;
}

// ---- emitters -----------------------------------------------------------------------------------------------------------------
// One emitter = 20 numbers: P xyz, window radius | C rgb, type (0 point, 1 rect, 2 tube) | N xyz, nw | A xyz, aw |
// source radius (point), clearance (the last stretch of a shadow ray that is never tested), 2 unused. The first sixteen are
// exactly the room-light shader's four uniform vectors (room/light.js sync()).
export const EM_STRIDE = 20;
// the soft edge of a shutter's cut: the sine of 0.6 degrees to each side of the blade's plane (4.5 cm at 4.3 m) for a
// blade in focus; of 4.6 degrees (0.37 m at 4.6 m) for the second blade, out of focus
export const SHUTTER_SOFT = 0.0105, SHUTTER_SOFT_FOOT = 0.08;
export const SHUTTER_SOFT_SIDE = 0.02, SIDED = 2;
/** A blade's unit normal [x, y, z] as ONE number a Float32 holds exactly (an integer under 2^24): 1 + its azimuth in
 * 4096 steps + 4096 x its polar angle in 4096 steps (0.09 and 0.04 degrees: 4 to 7 mm at 4.6 m). 0 = no blade. */
export function packShutter(n) {
  if (!Array.isArray(n) || n.length !== 3 || !n.every(Number.isFinite)) return 0;
  const l = Math.hypot(n[0], n[1], n[2]);
  if (!(l > 1e-6)) return 0;
  const qa = Math.min(4095, Math.max(0, Math.round(((Math.atan2(n[2], n[0]) + Math.PI) / (2 * Math.PI)) * 4095)));
  const qb = Math.min(4095, Math.max(0, Math.round((Math.acos(Math.min(1, Math.max(-1, n[1] / l))) / Math.PI) * 4095)));
  return 1 + qa + 4096 * qb;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * The unshadowed irradiance factor of emitter e at point p with normal n, as the shader computes it: fills OUT[0..2] with
 * the direction to the emitter's representative point and returns the scalar that multiplies the emitter colour (0 = none).
 */
const EOUT = new Float64Array(3);
export function emitterTerm(E, e, px, py, pz, nx, ny, nz) {
  const o = e * EM_STRIDE;
  const type = E[o + 7];
  const relx = px - E[o], rely = py - E[o + 1], relz = pz - E[o + 2];
  let qx = E[o], qy = E[o + 1], qz = E[o + 2];
  const nw = E[o + 11], aw = E[o + 15];
  let Nx = E[o + 8], Ny = E[o + 9], Nz = E[o + 10];
  const Ax = E[o + 12], Ay = E[o + 13], Az = E[o + 14];
  // (side blades, the arena only, round A6: a point emitter WITHOUT a normal may keep two more blades in its normal's
  // three numbers: the third is SIDED (2, which no unit normal holds), the first two are packShutter() numbers. Its
  // normal is then none. No club emitter carries the mark: for them these lines change nothing.)
  let side0 = 0, side1 = 0;
  if (type < 0.5 && Nz > 1.5) { side0 = Nx; side1 = Ny; Nx = 0; Ny = 0; Nz = 0; }
  let soft = nw * nw, emit = 1;
  if (type > 1.5) {
    const a = Math.min(aw, Math.max(-aw, relx * Ax + rely * Ay + relz * Az));
    qx += Ax * a; qy += Ay * a; qz += Az * a;
    soft = aw * Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy) + (pz - qz) * (pz - qz)) + nw * nw;
  } else if (type > 0.5) {
    const Vx = Ny * Az - Nz * Ay, Vy = Nz * Ax - Nx * Az, Vz = Nx * Ay - Ny * Ax;
    const a = Math.min(nw, Math.max(-nw, relx * Ax + rely * Ay + relz * Az));
    const b = Math.min(aw, Math.max(-aw, relx * Vx + rely * Vy + relz * Vz));
    qx += (Ax * a + Vx * b) * 0.6; qy += (Ay * a + Vy * b) * 0.6; qz += (Az * a + Vz * b) * 0.6;
    soft = (4 * nw * aw) / PI;
  }
  let Lx = qx - px, Ly = qy - py, Lz = qz - pz;
  const d2 = Lx * Lx + Ly * Ly + Lz * Lz;
  const R = E[o + 3];
  let w = d2 / (R * R);
  if (w >= 1) return 0;
  w = 1 - w * w; w *= w;
  const il = 1 / Math.sqrt(Math.max(d2, 1e-8));
  Lx *= il; Ly *= il; Lz *= il;
  if (Nx * Nx + Ny * Ny + Nz * Nz > 0.25) {
    emit = -(Nx * Lx + Ny * Ly + Nz * Lz);
    if (emit <= 0) return 0;
    if (type < 0.5) emit = smooth(0, 0.35, emit);
  }
  if (type < 0.5 && aw > 0) {
    const ca = -(Lx * Ax + Ly * Ay + Lz * Az);
    // (aw over 1.5: a cone, the arena only: room/light.js CONE. aw = 2 + cos(field half angle): a profile light, full from
    // 0.64 of the way to 1; aw = 4 + cos(field half angle): a wash, a bell from the axis to the field angle. A shaded
    // lamp's beam share never passes 1, so every club emitter takes the last line, as before.)
    if (aw > 3.5) emit *= smooth(aw - 4, 1, ca);
    else if (aw > 1.5) emit *= smooth(aw - 2, aw - 2 + (3 - aw) * 0.64, ca);
    else emit *= (1 - aw) + aw * 2.4 * ca * ca * (ca > 0 ? 1 : 0.55);
  }
  // (shutters, the arena only, round A6: a profile light's blades. Each of the last two numbers of the row holds one
  // blade: the unit normal of a plane through the emitter, packed by packShutter() below; the light reaches the side
  // the normal points to. The first is a blade in focus (an edge SHUTTER_SOFT wide in the sine of the angle off the
  // plane), the second a blade out of focus (SHUTTER_SOFT_FOOT). Zero: no blade, which is every club emitter and every
  // emitter before round A6: these lines are then never entered.)
  if (type < 0.5 && (E[o + 18] > 0 || E[o + 19] > 0 || side0 > 0 || side1 > 0)) {
    for (let b = 0; b < 4; b++) {
      const q = b === 0 ? E[o + 18] : b === 1 ? E[o + 19] : b === 2 ? side0 : side1;
      if (!(q > 0)) continue;
      const qb = Math.floor((q - 1) / 4096), qa = q - 1 - 4096 * qb;
      const ph = (qa / 4095) * 2 * PI - PI, th = (qb / 4095) * PI, st = Math.sin(th), soft = b === 0 ? SHUTTER_SOFT : b === 1 ? SHUTTER_SOFT_FOOT : SHUTTER_SOFT_SIDE;
      emit *= smooth(-soft, soft, -(Lx * st * Math.cos(ph) + Ly * Math.cos(th) + Lz * st * Math.sin(ph)));
      if (emit <= 0) return 0;
    }
  }
  const cosn = nx * Lx + ny * Ly + nz * Lz;
  if (cosn <= 0) return 0;
  EOUT[0] = Lx; EOUT[1] = Ly; EOUT[2] = Lz;
  return (emit * w * cosn) / (d2 + soft);
}

/**
 * The visible share (0..1) of emitter e from the offset point o (normal n), for texel phase `ph`. `level` 0: one ray (a lamp)
 * or a quarter of the samples at their stratum centres (an area light); 1: five points of a lamp; 2: the full set.
 */
function emitterVisibility(bvh, pat, E, e, ox, oy, oz, nx, ny, nz, ph, ignore, level) {
  const quick = level === 0;
  const o = e * EM_STRIDE;
  const type = E[o + 7];
  const clear = E[o + 17];
  const ray = (qx, qy, qz) => {
    const dx = qx - ox, dy = qy - oy, dz = qz - oz;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const tmax = len - clear;
    if (!(tmax > 1e-4)) return 1;
    return occluded(bvh, ox, oy, oz, dx / len, dy / len, dz / len, tmax, ignore) ? 0 : 1;
  };
  if (type < 0.5) {
    const rs = E[o + 16], S = pat.sph;
    if (quick) return ray(E[o], E[o + 1], E[o + 2]);
    const K = level === 1 ? 5 : 15;
    let vis = 0;
    for (let k = 0; k < K; k++) vis += ray(E[o] + rs * S[3 * k], E[o + 1] + rs * S[3 * k + 1], E[o + 2] + rs * S[3 * k + 2]);
    return vis / K;
  }
  const Ax = E[o + 12], Ay = E[o + 13], Az = E[o + 14];
  const j1 = quick ? 0.5 : pat.jit[2 * ph], j2 = quick ? 0.5 : pat.jit[2 * ph + 1];
  let sum = 0, wsum = 0;
  if (type > 1.5) {
    const half = E[o + 15], K = quick ? 3 : 8;
    for (let k = 0; k < K; k++) {
      const a = ((k + j1) / K * 2 - 1) * half;
      const qx = E[o] + Ax * a, qy = E[o + 1] + Ay * a, qz = E[o + 2] + Az * a;
      const dx = qx - ox, dy = qy - oy, dz = qz - oz;
      const d2 = dx * dx + dy * dy + dz * dz;
      const cosn = (nx * dx + ny * dy + nz * dz);
      if (cosn <= 0) continue;
      const w = cosn / (d2 * Math.sqrt(d2));
      wsum += w; sum += w * ray(qx, qy, qz);
    }
    return wsum > 0 ? sum / wsum : 0;
  }
  // rect: half width nw along A, half height aw along V = N x A
  const Nx = E[o + 8], Ny = E[o + 9], Nz = E[o + 10];
  const Vx = Ny * Az - Nz * Ay, Vy = Nz * Ax - Nx * Az, Vz = Nx * Ay - Ny * Ax;
  const hw = E[o + 11], hh = E[o + 15];
  let Kx = 4, Ky = 4;
  if (hw > 1.8 * hh) { Kx = 8; Ky = 2; } else if (hh > 1.8 * hw) { Kx = 2; Ky = 8; }
  if (quick) { Kx = Math.max(1, Kx >> 1); Ky = Math.max(1, Ky >> 1); }
  for (let i = 0; i < Kx; i++) {
    for (let j = 0; j < Ky; j++) {
      const a = ((i + j1) / Kx * 2 - 1) * hw, b = ((j + j2) / Ky * 2 - 1) * hh;
      const qx = E[o] + Ax * a + Vx * b, qy = E[o + 1] + Ay * a + Vy * b, qz = E[o + 2] + Az * a + Vz * b;
      const dx = qx - ox, dy = qy - oy, dz = qz - oz;
      const d2 = dx * dx + dy * dy + dz * dz;
      const cosn = nx * dx + ny * dy + nz * dz, cose = -(Nx * dx + Ny * dy + Nz * dz);
      if (cosn <= 0 || cose <= 0) continue;
      const w = (cosn * cose) / (d2 * d2);
      wsum += w; sum += w * ray(qx, qy, qz);
    }
  }
  return wsum > 0 ? sum / wsum : 0;
}

/** The main lamp (a horizontal rectangle facing down): [visible share, irradiance factor] from a point; phase / quick as above. */
export const LOUT = new Float64Array(2);
export function lampTerm(bvh, pat, lamp, ox, oy, oz, nx, ny, nz, ph, ignore, quick) {
  LOUT[0] = 1; LOUT[1] = 0;
  if (!lamp) return;
  const Kx = quick ? 4 : 8, Ky = 2;
  const j1 = quick ? 0.5 : pat.jit[2 * ph], j2 = quick ? 0.5 : pat.jit[2 * ph + 1];
  const area = 4 * lamp.hx * lamp.hz;
  if (!quick) {
    // where the whole unshadowed lamp adds under 0.01 of irradiance, its shadows cannot be seen: no rays
    const dx = lamp.cx - ox, dy = lamp.y - oy, dz = lamp.cz - oz, d2 = dx * dx + dy * dy + dz * dz;
    const cosn = nx * dx + ny * dy + nz * dz;
    const reach = Math.sqrt(d2) - Math.sqrt(lamp.hx * lamp.hx + lamp.hz * lamp.hz);
    if (dy <= 0 || (reach > 0.5 && (Math.max(lamp.L[0], lamp.L[1], lamp.L[2]) * area * Math.max(0, cosn) * dy) / (d2 * d2) < 0.01)) return;
  }
  let sum = 0, wsum = 0;
  for (let i = 0; i < Kx; i++) {
    for (let j = 0; j < Ky; j++) {
      const qx = lamp.cx + ((i + j1) / Kx * 2 - 1) * lamp.hx, qz = lamp.cz + ((j + j2) / Ky * 2 - 1) * lamp.hz, qy = lamp.y;
      const dx = qx - ox, dy = qy - oy, dz = qz - oz;
      const d2 = dx * dx + dy * dy + dz * dz;
      const cosn = nx * dx + ny * dy + nz * dz, cose = dy; // the lamp faces down: its normal is -y
      if (cosn <= 0 || cose <= 0) continue;
      const w = (cosn * cose) / (d2 * d2);
      const len = Math.sqrt(d2);
      const tmax = len - lamp.clear;
      const v = tmax > 1e-4 && occluded(bvh, ox, oy, oz, dx / len, dy / len, dz / len, tmax, ignore) ? 0 : 1;
      wsum += w; sum += w * v;
    }
  }
  // irradiance = radiance * integral of cos cos / d^2 over the rectangle (each stratum stands for area / (Kx Ky)), inside
  // the pool the shade leaves open
  let pool = 1;
  if (lamp.pool) {
    const ex = Math.max(0, Math.abs(ox - lamp.cx) - lamp.hx), ez = Math.max(0, Math.abs(oz - lamp.cz) - lamp.hz);
    const t = Math.sqrt(ex * ex + ez * ez) / Math.max(lamp.y - oy, 1e-3);
    pool = 1 - smooth(lamp.pool[0], lamp.pool[1], t);
    // the gain is the floor's (room/light.js POOL.gain): an up-facing receiver well under the lamp's plane
    if (lamp.pool[2] > 0 && ny > 0.9 && lamp.y - oy > 1.2) pool *= lamp.pool[2];
  }
  LOUT[0] = wsum > 0 ? sum / wsum : 1;
  LOUT[1] = (sum * area * pool) / (Kx * Ky);
}

// ---- patches: one light value per triangle, bounced patch to patch ------------------------------------------------------------
/**
 * solvePatches(scene, bvh, opts) -> Float32Array(3T): the light each triangle sends back per unit albedo, i.e. its total
 * irradiance: direct (every emitter with one or a few shadow rays, and the main lamp with the main table in the way) plus
 * `bounces` further bounces gathered patch to patch with `rays` cosine-weighted rays each.
 */
export function solvePatches(scene, bvh, { rays = 48, bounces = 3, progress = null } = {}) {
  const { tris, albedo, emitters: E, lamp } = scene;
  const T = tris.length / 9, NE = E.length / EM_STRIDE;
  const pat = makePatterns(rays);
  const direct = new Float32Array(3 * T);
  const hits = new Int32Array(T * rays).fill(-1);
  const fr = new Float64Array(6);
  for (let t = 0; t < T; t++) {
    const p = 9 * t;
    const e1x = tris[p + 3] - tris[p], e1y = tris[p + 4] - tris[p + 1], e1z = tris[p + 5] - tris[p + 2];
    const e2x = tris[p + 6] - tris[p], e2y = tris[p + 7] - tris[p + 1], e2z = tris[p + 8] - tris[p + 2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!(l > 1e-12)) continue;
    nx /= l; ny /= l; nz /= l;
    const cx = (tris[p] + tris[p + 3] + tris[p + 6]) / 3, cy = (tris[p + 1] + tris[p + 4] + tris[p + 7]) / 3, cz = (tris[p + 2] + tris[p + 5] + tris[p + 8]) / 3;
    const ox = cx + nx * 0.004, oy = cy + ny * 0.004, oz = cz + nz * 0.004;
    let r = 0, g = 0, b = 0;
    for (let e = 0; e < NE; e++) {
      const k = emitterTerm(E, e, cx, cy, cz, nx, ny, nz);
      if (!(k > 0)) continue;
      const v = emitterVisibility(bvh, pat, E, e, ox, oy, oz, nx, ny, nz, 0, 0, 0);
      if (!(v > 0)) continue;
      const o = e * EM_STRIDE;
      r += E[o + 4] * k * v; g += E[o + 5] * k * v; b += E[o + 6] * k * v;
    }
    if (lamp) {
      lampTerm(bvh, pat, lamp, ox, oy, oz, nx, ny, nz, 0, 2, true); // the luminaire does not shade its own light
      r += lamp.L[0] * LOUT[1]; g += lamp.L[1] * LOUT[1]; b += lamp.L[2] * LOUT[1];
    }
    direct[3 * t] = r; direct[3 * t + 1] = g; direct[3 * t + 2] = b;
    frame(nx, ny, nz, fr);
    const ph = t & 15, G = pat.gather;
    for (let j = 0; j < rays; j++) {
      const q = (ph * rays + j) * 3;
      const dx = G[q] * fr[0] + G[q + 1] * fr[3] + G[q + 2] * nx, dy = G[q] * fr[1] + G[q + 1] * fr[4] + G[q + 2] * ny, dz = G[q] * fr[2] + G[q + 1] * fr[5] + G[q + 2] * nz;
      const h = nearest(bvh, ox, oy, oz, dx, dy, dz, 1e9, 0);
      hits[t * rays + j] = h >= 0 && !HIT.back ? h : -1;
    }
    if (progress && (t & 4095) === 0) progress(t / T);
  }
  const total = Float32Array.from(direct);
  let prev = direct;
  for (let n = 0; n < bounces; n++) {
    const next = new Float32Array(3 * T);
    for (let t = 0; t < T; t++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < rays; j++) {
        const h = hits[t * rays + j];
        if (h < 0) continue;
        r += albedo[3 * h] * prev[3 * h]; g += albedo[3 * h + 1] * prev[3 * h + 1]; b += albedo[3 * h + 2] * prev[3 * h + 2];
      }
      next[3 * t] = r / rays; next[3 * t + 1] = g / rays; next[3 * t + 2] = b / rays;
    }
    for (let i = 0; i < 3 * T; i++) total[i] += next[i];
    prev = next;
  }
  return total;
}

// ---- texels --------------------------------------------------------------------------------------------------------------------
export const TEXEL_STRIDE = 11; // sharp rgb | area rgb | lamp share | indirect rgb | valid
/**
 * The light at one point with one receiver normal, for sample pattern `ph` (0..15): adds the lamps' direct light to
 * out[o..o+2], the area lights' to out[o+3..o+5], writes the main lamp's visible share to out[o+6] (rays that hit triangles
 * flagged in `lampIgnore` pass) and the bounced light plus the occlusion-weighted ambient to out[o+7..o+9]. `ctx.fr` must
 * hold the frame of the normal. `ignore`: the flags the point's own rays do not see.
 */
function shadePoint(ctx, px, py, pz, nx, ny, nz, ignore, lampIgnore, ph, out, o) {
  const { albedo, E, NE, lamp, bvh, pat, patchLight, gatherRays, aoRadius, amb, fr } = ctx;
  const ox = px + nx * 0.004, oy = py + ny * 0.004, oz = pz + nz * 0.004;
  // direct
  for (let e = 0; e < NE; e++) {
    const k = emitterTerm(E, e, px, py, pz, nx, ny, nz);
    if (!(k > 0)) continue;
    const eo = e * EM_STRIDE, c = E[eo + 7] < 0.5 ? o : o + 3;
    // rays by what the emitter can add here: under 0.02 one look, under 0.12 a few, else the full set
    const most = Math.max(E[eo + 4], E[eo + 5], E[eo + 6]) * k;
    const v = emitterVisibility(bvh, pat, E, e, ox, oy, oz, nx, ny, nz, ph, ignore, most < 0.02 ? 0 : most < 0.12 ? 1 : 2);
    if (!(v > 0)) continue;
    out[c] += E[eo + 4] * k * v; out[c + 1] += E[eo + 5] * k * v; out[c + 2] += E[eo + 6] * k * v;
  }
  // the main lamp's visible share (for a texel of the shell: neither the main table, another service's shadow, nor the
  // luminaire itself counts)
  if (lamp && lampIgnore >= 0) { lampTerm(bvh, pat, lamp, ox, oy, oz, nx, ny, nz, ph, lampIgnore, false); out[o + 6] = LOUT[0]; }
  // gather: bounced light from the patches, and how open the hemisphere is
  const G = pat.gather;
  let r = 0, g = 0, b = 0, open = 0;
  for (let j = 0; j < gatherRays; j++) {
    const q = (ph * gatherRays + j) * 3;
    const dx = G[q] * fr[0] + G[q + 1] * fr[3] + G[q + 2] * nx, dy = G[q] * fr[1] + G[q + 1] * fr[4] + G[q + 2] * ny, dz = G[q] * fr[2] + G[q + 1] * fr[5] + G[q + 2] * nz;
    const h = nearest(bvh, ox, oy, oz, dx, dy, dz, 1e9, ignore);
    if (h < 0) { open += 1; continue; }
    const t = HIT.t;
    open += t >= aoRadius ? 1 : (t / aoRadius) * (t / aoRadius);
    if (HIT.back) continue;
    r += albedo[3 * h] * patchLight[3 * h]; g += albedo[3 * h + 1] * patchLight[3 * h + 1]; b += albedo[3 * h + 2] * patchLight[3 * h + 2];
  }
  const inv = 1 / gatherRays;
  open *= inv;
  const up = 0.5 + 0.5 * ny, sd = 1 - ny * ny;
  out[o + 7] += r * inv + (amb.ground[0] + (amb.sky[0] - amb.ground[0]) * up + amb.side[0] * sd) * open;
  out[o + 8] += g * inv + (amb.ground[1] + (amb.sky[1] - amb.ground[1]) * up + amb.side[1] * sd) * open;
  out[o + 9] += b * inv + (amb.ground[2] + (amb.sky[2] - amb.ground[2]) * up + amb.side[2] * sd) * open;
}

/**
 * shadeTexels(scene, bvh, patchLight, tex, from, to, opts) -> Float32Array((to - from) * TEXEL_STRIDE) for texel slots
 * [from, to) of a rasterize() result. `scene.floorChart(chart)` is given as scene.chartIgnore: Uint8Array per chart id = the
 * flag mask this chart's texels do not see (the floor ignores the main table: another service owns that shadow).
 */
export function shadeTexels(scene, bvh, patchLight, tex, from, to, opts = {}) {
  const { albedo, emitters: E, lamp, chartIgnore } = scene;
  const gatherRays = opts.gatherRays ?? 32;
  const aoRadius = opts.aoRadius ?? 2.0;
  const amb = opts.ambient ?? { sky: [0, 0, 0], ground: [0, 0, 0], side: [0, 0, 0] };
  const probeLen = opts.probeLen ?? 0.06;
  const NE = E.length / EM_STRIDE;
  const pat = makePatterns(gatherRays);
  const out = new Float32Array((to - from) * TEXEL_STRIDE);
  const fr = new Float64Array(6);
  const ctx = { albedo, E, NE, lamp, bvh, pat, patchLight, gatherRays, aoRadius, amb, fr };
  for (let s = from; s < to; s++) {
    const o = (s - from) * TEXEL_STRIDE;
    const px = tex.pos[3 * s], py = tex.pos[3 * s + 1], pz = tex.pos[3 * s + 2];
    const nx = tex.nor[3 * s], ny = tex.nor[3 * s + 1], nz = tex.nor[3 * s + 2];
    const ignore = chartIgnore ? chartIgnore[tex.chart[s]] : 0;
    const ox = px + nx * 0.004, oy = py + ny * 0.004, oz = pz + nz * 0.004;
    frame(nx, ny, nz, fr);
    // is the texel's point inside or behind something (under a skirting, inside a beam end)? then it is filled from its neighbours
    let valid = 1;
    const PR = pat.probes;
    for (let k = 0; k < 16 && valid; k++) {
      const dx = PR[3 * k] * fr[0] + PR[3 * k + 1] * fr[3] + PR[3 * k + 2] * nx, dy = PR[3 * k] * fr[1] + PR[3 * k + 1] * fr[4] + PR[3 * k + 2] * ny, dz = PR[3 * k] * fr[2] + PR[3 * k + 1] * fr[5] + PR[3 * k + 2] * nz;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (nearest(bvh, ox, oy, oz, dx / l, dy / l, dz / l, probeLen, ignore) >= 0 && HIT.back) valid = 0;
    }
    out[o + 10] = valid;
    out[o + 6] = 1;
    if (!valid) continue;
    shadePoint(ctx, px, py, pz, nx, ny, nz, ignore, 3, (tex.x[s] & 3) + 4 * (tex.y[s] & 3), out, o);
  }
  return out;
}

// ---- finish: filter, fill, encode ----------------------------------------------------------------------------------------------
/**
 * finish(tex, shaded, size, opts) -> { rgba: Uint8Array(size*size*4), stats }. `shaded`: Float32Array(count * TEXEL_STRIDE) for
 * every slot of `tex`. opts: { fullScale, rows: [y0, y1) to produce (default all) }.
 * Steps: two 4-texel box filters over the interleaved terms (area lights, lamp share, indirect) inside each chart; the sum;
 * invalid and uncovered texels filled from valid neighbours (six rounds, so chart gutters hold their chart's light);
 * RGB = irradiance / fullScale through the sRGB curve with a 4 x 4 ordered dither, A = lamp share with the same dither.
 */
export function finish(tex, shaded, size, { fullScale = 16 } = {}) {
  const n = size * size;
  const { index, count } = tex;
  const valid = new Uint8Array(n);
  const chart = new Int16Array(n).fill(-1);
  const sharp = new Float32Array(n * 3), soft = new Float32Array(n * 7); // soft: area rgb, lamp, indirect rgb
  for (let s = 0; s < count; s++) {
    const i = tex.y[s] * size + tex.x[s], o = s * TEXEL_STRIDE;
    chart[i] = tex.chart[s];
    if (!(shaded[o + 10] > 0.5)) continue;
    valid[i] = 1;
    sharp[3 * i] = shaded[o]; sharp[3 * i + 1] = shaded[o + 1]; sharp[3 * i + 2] = shaded[o + 2];
    soft[7 * i] = shaded[o + 3]; soft[7 * i + 1] = shaded[o + 4]; soft[7 * i + 2] = shaded[o + 5]; soft[7 * i + 3] = shaded[o + 6];
    soft[7 * i + 4] = shaded[o + 7]; soft[7 * i + 5] = shaded[o + 8]; soft[7 * i + 6] = shaded[o + 9];
  }
  // a 4 x 4 box whose window starts at offset `lo`: every phase of the 4 x 4 pattern appears once; chart- and validity-aware
  const box = (src, lo) => {
    const dst = new Float32Array(src.length);
    const acc = new Float64Array(7);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (!valid[i]) continue;
        const c = chart[i];
        acc.fill(0);
        let w = 0;
        for (let dy = lo; dy < lo + 4; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= size) continue;
          for (let dx = lo; dx < lo + 4; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= size) continue;
            const j = yy * size + xx;
            if (!valid[j] || chart[j] !== c) continue;
            for (let k = 0; k < 7; k++) acc[k] += src[7 * j + k];
            w += 1;
          }
        }
        for (let k = 0; k < 7; k++) dst[7 * i + k] = acc[k] / w;
      }
    }
    return dst;
  };
  const filtered = box(box(soft, -2), -1);
  let lit = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    if (!valid[i]) { lit[4 * i + 3] = 1; continue; }
    lit[4 * i] = sharp[3 * i] + filtered[7 * i] + filtered[7 * i + 4];
    lit[4 * i + 1] = sharp[3 * i + 1] + filtered[7 * i + 1] + filtered[7 * i + 5];
    lit[4 * i + 2] = sharp[3 * i + 2] + filtered[7 * i + 2] + filtered[7 * i + 6];
    lit[4 * i + 3] = filtered[7 * i + 3];
  }
  // fill: a texel without a value takes the mean of its valid 8-neighbours, preferring its own chart
  let have = Uint8Array.from(valid);
  let filled = 0;
  for (let round = 0; round < 6; round++) {
    const next = Uint8Array.from(have);
    const out = Float32Array.from(lit);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (have[i]) continue;
        let r = 0, g = 0, b = 0, a = 0, w = 0, rs = 0, gs = 0, bs = 0, as = 0, ws = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= size) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= size || (!dx && !dy)) continue;
            const j = yy * size + xx;
            if (!have[j]) continue;
            r += lit[4 * j]; g += lit[4 * j + 1]; b += lit[4 * j + 2]; a += lit[4 * j + 3]; w += 1;
            if (chart[j] === chart[i] && chart[i] >= 0) { rs += lit[4 * j]; gs += lit[4 * j + 1]; bs += lit[4 * j + 2]; as += lit[4 * j + 3]; ws += 1; }
          }
        }
        if (!w) continue;
        if (ws) { r = rs; g = gs; b = bs; a = as; w = ws; }
        out[4 * i] = r / w; out[4 * i + 1] = g / w; out[4 * i + 2] = b / w; out[4 * i + 3] = a / w;
        next[i] = 1; filled += 1;
      }
    }
    lit = out; have = next;
  }
  // encode: thresholds[c * 16 + d] = the smallest linear value that encodes to c under dither step d (exact, see srgbToLinear)
  const thr = new Float64Array(257 * 16);
  for (let c = 0; c <= 256; c++) for (let d = 0; d < 16; d++) thr[c * 16 + d] = c === 0 ? -1 : srgbToLinear(Math.min(1, (c - (d + 0.5) / 16) / 255));
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const rgba = new Uint8Array(n * 4);
  let peak = 0, clipped = 0, sum = 0, cnt = 0;
  for (let i = 0; i < n; i++) {
    const d = BAYER[((i / size | 0) & 3) * 4 + ((i % size) & 3)];
    for (let k = 0; k < 3; k++) {
      const e = lit[4 * i + k];
      if (valid[i]) { if (e > peak) peak = e; if (e > fullScale) clipped += 1; if (k === 1) { sum += e; cnt += 1; } }
      const v = Math.min(1, Math.max(0, e / fullScale));
      // the largest code whose threshold is <= v
      let lo = 0, hi = 255;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (thr[mid * 16 + d] <= v) lo = mid; else hi = mid - 1; }
      rgba[4 * i + k] = lo;
    }
    const a = Math.min(1, Math.max(0, lit[4 * i + 3]));
    rgba[4 * i + 3] = have[i] ? Math.min(255, Math.floor(a * 255 + (d + 0.5) / 16)) : 255;
  }
  let validCount = 0;
  for (let i = 0; i < n; i++) validCount += valid[i];
  return { rgba, lit, valid, chart, stats: { covered: count, valid: validCount, filled, peak, clippedSamples: clipped, meanGreen: cnt ? sum / cnt : 0 } };
}

/** The mean indirect light of the valid texels of each chart kind (0 floor, 1 wall, 2 ceiling, 3 minor): for the surfaces
 * that stay analytic. Returns { sky, ground, side } in the room-light ambient's terms (floor = sky, ceiling = ground) and the
 * raw `sums` ([r, g, b, count] for floor, wall, ceiling), which add up over the bands of a bake made in several jobs. */
export function meanIndirect(tex, shaded, chartKind) {
  const acc = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let s = 0; s < tex.count; s++) {
    const o = s * TEXEL_STRIDE;
    const k = chartKind[tex.chart[s]];
    if (!(shaded[o + 10] > 0.5) || k > 2) continue;
    acc[k][0] += shaded[o + 7]; acc[k][1] += shaded[o + 8]; acc[k][2] += shaded[o + 9]; acc[k][3] += 1;
  }
  const mean = (a) => (a[3] ? [a[0] / a[3], a[1] / a[3], a[2] / a[3]] : [0, 0, 0]);
  const sky = mean(acc[0]), ground = mean(acc[2]), wall = mean(acc[1]);
  const side = wall.map((v, i) => Math.max(0, v - (sky[i] + ground[i]) / 2));
  const r4 = (a) => a.map((v) => Math.round(v * 10000) / 10000);
  return { sky: r4(sky), ground: r4(ground), side: r4(side), sums: acc };
}

// ---- the light volume ------------------------------------------------------------------------------------------------------------
export const VOLUME_STRIDE = 25; // six faces (+x -x +y -y +z -z) of rgb irradiance and the lamp share, then valid
const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
/**
 * shadeVolume(scene, bvh, patchLight, grid, from, to, opts) -> Float32Array((to - from) * VOLUME_STRIDE) for grid points
 * [from, to). `grid` = { dims: [nx, ny, nz], min: [x, y, z], max: [x, y, z] }: point i = x + nx * (y + ny * z) sits at the
 * centre of its cell. opts as shadeTexels plus `volumePhases` (sample patterns averaged per face, default 4).
 * A point is invalid (inside a solid) when five or more of fourteen rays end on the back of a triangle within 4 m.
 * The lamp share is one number per point (toward the lamp, the luminaire itself ignored, the main table not).
 */
export function shadeVolume(scene, bvh, patchLight, grid, from, to, opts = {}) {
  const { albedo, emitters: E, lamp } = scene;
  const gatherRays = opts.gatherRays ?? 32;
  const amb = opts.ambient ?? { sky: [0, 0, 0], ground: [0, 0, 0], side: [0, 0, 0] };
  const phases = Math.min(16, Math.max(1, opts.volumePhases ?? 4));
  const pat = makePatterns(gatherRays);
  const fr = new Float64Array(6);
  const ctx = { albedo, E, NE: E.length / EM_STRIDE, lamp, bvh, pat, patchLight, gatherRays, aoRadius: opts.aoRadius ?? 2.0, amb, fr };
  const [nx, ny] = grid.dims;
  const cell = [0, 1, 2].map((a) => (grid.max[a] - grid.min[a]) / grid.dims[a]);
  const out = new Float32Array((to - from) * VOLUME_STRIDE);
  const tmp = new Float64Array(TEXEL_STRIDE);
  const S = pat.sph;
  for (let i = from; i < to; i++) {
    const o = (i - from) * VOLUME_STRIDE;
    const ix = i % nx, iy = Math.floor(i / nx) % ny, iz = Math.floor(i / (nx * ny));
    const px = grid.min[0] + (ix + 0.5) * cell[0], py = grid.min[1] + (iy + 0.5) * cell[1], pz = grid.min[2] + (iz + 0.5) * cell[2];
    let back = 0;
    for (let k = 1; k < 15; k++) if (nearest(bvh, px, py, pz, S[3 * k], S[3 * k + 1], S[3 * k + 2], 4.0, 0) >= 0 && HIT.back) back += 1;
    if (back >= 5) continue; // valid stays 0
    out[o + 24] = 1;
    // the lamp share, once: a receiver that faces the middle of the lamp
    let share = 1;
    if (lamp) {
      let lx = lamp.cx - px, ly = lamp.y - py, lz = lamp.cz - pz;
      const l = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
      lx /= l; ly /= l; lz /= l;
      let sum = 0;
      for (let k = 0; k < phases; k++) { lampTerm(bvh, pat, lamp, px, py, pz, lx, ly, lz, (i * 7 + k * 5) & 15, 2, false); sum += LOUT[0]; }
      share = sum / phases;
    }
    for (let f = 0; f < 6; f++) {
      const ax = AXES[f];
      frame(ax[0], ax[1], ax[2], fr);
      tmp.fill(0);
      for (let k = 0; k < phases; k++) shadePoint(ctx, px, py, pz, ax[0], ax[1], ax[2], 0, -1, (i * 7 + f * 3 + k * 5) & 15, tmp, 0);
      out[o + 4 * f] = (tmp[0] + tmp[3] + tmp[7]) / phases; out[o + 4 * f + 1] = (tmp[1] + tmp[4] + tmp[8]) / phases; out[o + 4 * f + 2] = (tmp[2] + tmp[5] + tmp[9]) / phases;
      out[o + 4 * f + 3] = share;
    }
  }
  return out;
}

/**
 * finishVolume(shaded, grid, { fullScale }) -> { rgba: Uint8Array(nx * ny * nz * 6 * 4), stats }: invalid points take the mean
 * of their valid 6-neighbours (round after round; what is left takes the mean of the whole grid), then every face is encoded
 * like a texel of the map (RGB = irradiance / fullScale through the sRGB curve, rounded; A = the lamp share). Layout: x
 * fastest, then y, then z, then the face: the 3D texture is nx x ny x (6 nz).
 */
export function finishVolume(shaded, grid, { fullScale = 16 } = {}) {
  const [nx, ny, nz] = grid.dims, N = nx * ny * nz;
  const val = Float32Array.from(shaded);
  let have = new Uint8Array(N);
  let valid = 0;
  for (let i = 0; i < N; i++) { have[i] = val[i * VOLUME_STRIDE + 24] > 0.5 ? 1 : 0; valid += have[i]; }
  let filled = 0;
  for (let round = 0; round < 12; round++) {
    const next = Uint8Array.from(have);
    let any = false;
    for (let i = 0; i < N; i++) {
      if (have[i]) continue;
      const ix = i % nx, iy = Math.floor(i / nx) % ny, iz = Math.floor(i / (nx * ny));
      const nb = [];
      if (ix > 0 && have[i - 1]) nb.push(i - 1); if (ix < nx - 1 && have[i + 1]) nb.push(i + 1);
      if (iy > 0 && have[i - nx]) nb.push(i - nx); if (iy < ny - 1 && have[i + nx]) nb.push(i + nx);
      if (iz > 0 && have[i - nx * ny]) nb.push(i - nx * ny); if (iz < nz - 1 && have[i + nx * ny]) nb.push(i + nx * ny);
      if (!nb.length) continue;
      for (let c = 0; c < 24; c++) { let a = 0; for (const j of nb) a += val[j * VOLUME_STRIDE + c]; val[i * VOLUME_STRIDE + c] = a / nb.length; }
      next[i] = 1; filled += 1; any = true;
    }
    have = next;
    if (!any) break;
  }
  const mean = new Float64Array(24);
  let cnt = 0;
  for (let i = 0; i < N; i++) if (have[i]) { cnt += 1; for (let c = 0; c < 24; c++) mean[c] += val[i * VOLUME_STRIDE + c]; }
  for (let i = 0; i < N; i++) if (!have[i]) for (let c = 0; c < 24; c++) val[i * VOLUME_STRIDE + c] = cnt ? mean[c] / cnt : 0;
  const thr = new Float64Array(257);
  for (let c = 0; c <= 256; c++) thr[c] = c === 0 ? -1 : srgbToLinear(Math.min(1, (c - 0.5) / 255));
  const rgba = new Uint8Array(N * 6 * 4);
  let peak = 0, clipped = 0;
  for (let i = 0; i < N; i++) {
    for (let f = 0; f < 6; f++) {
      const o = 4 * (i + N * f);
      for (let k = 0; k < 3; k++) {
        const e = val[i * VOLUME_STRIDE + 4 * f + k];
        if (e > peak) peak = e; if (e > fullScale) clipped += 1;
        const v = Math.min(1, Math.max(0, e / fullScale));
        let lo = 0, hi = 255;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (thr[mid] <= v) lo = mid; else hi = mid - 1; }
        rgba[o + k] = lo;
      }
      rgba[o + 3] = Math.min(255, Math.max(0, Math.floor(val[i * VOLUME_STRIDE + 4 * f + 3] * 255 + 0.5)));
    }
  }
  return { rgba, values: val, stats: { points: N, valid, filled, left: N - cnt, peak, clippedSamples: clipped } };
}

// ---- transport ------------------------------------------------------------------------------------------------------------------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toBase64(bytes) {
  let s = '';
  const parts = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    s += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)] + (i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=') + (i + 2 < bytes.length ? B64[c & 63] : '=');
    if (s.length > 65536) { parts.push(s); s = ''; }
  }
  parts.push(s);
  return parts.join('');
}
export function fromBase64(text) {
  const inv = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) inv[B64.charCodeAt(i)] = i;
  const clean = text.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = inv[clean.charCodeAt(i)], b = inv[clean.charCodeAt(i + 1)], c = i + 2 < clean.length ? inv[clean.charCodeAt(i + 2)] : 0, d = i + 3 < clean.length ? inv[clean.charCodeAt(i + 3)] : 0;
    out[o++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}
