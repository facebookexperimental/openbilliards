// Copyright (c) Meta Platforms, Inc. and affiliates.

// geom.mjs — tiny deterministic ray-tracing geometry kit for the lightmap
// bake: triangles grouped into AABB-culled objects, plus 2D point-in-polygon
// used for the plan-map surface classification. Pure JS, no deps.

export const rng = (seed) => { // mulberry32 — the repo's deterministic rng
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Object = { name, mat, tris: Float64Array(9k), aabb: [minx..maxz] }.
 * Tri layout per 9 floats: ax ay az bx by bz cx cy cz. */
export function makeObject(name, mat, triList) {
  const tris = new Float64Array(triList.length * 9);
  const aabb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  triList.forEach((t, i) => {
    for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) {
      const val = t[v][c];
      tris[i * 9 + v * 3 + c] = val;
      aabb[c] = Math.min(aabb[c], val);
      aabb[3 + c] = Math.max(aabb[3 + c], val);
    }
  });
  return { name, mat, tris, aabb };
}

/** Vertical prism from a plan polygon (poly = [[x,z],...], CCW or CW) spanning
 * y0..y1: side quads + top/bottom triangle fans (polygon assumed star-shaped
 * around its centroid — true for the rail/wood plans we bake). */
export function prism(poly, y0, y1) {
  const tris = [];
  const n = poly.length;
  let cx = 0, cz = 0;
  for (const [x, z] of poly) { cx += x / n; cz += z / n; }
  for (let i = 0; i < n; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % n];
    tris.push([[ax, y0, az], [bx, y0, bz], [bx, y1, bz]]);
    tris.push([[ax, y0, az], [bx, y1, bz], [ax, y1, az]]);
    tris.push([[cx, y1, cz], [ax, y1, az], [bx, y1, bz]]); // top cap
    tris.push([[cx, y0, cz], [bx, y0, bz], [ax, y0, az]]); // bottom cap
  }
  return tris;
}

/** Ear-clipping triangulation of a simple polygon (either winding).
 * O(n^3) worst case — fine for the <100-vertex plank plans. Collinear
 * (zero-cross) corners are skipped as ears and consumed once their
 * neighbors clip; a degenerate remainder falls back to a fan. */
function earClip(poly) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length];
    area += x1 * z2 - x2 * z1;
  }
  const ccw = area > 0;
  const v = poly.slice();
  const out = [];
  const cross = (a, b, c) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inTri = (p, a, b, c) => {
    const d1 = cross(a, b, p), d2 = cross(b, c, p), d3 = cross(c, a, p);
    return !(((d1 < 0) || (d2 < 0) || (d3 < 0))
      && ((d1 > 0) || (d2 > 0) || (d3 > 0)));
  };
  let guard = 0;
  while (v.length > 3 && guard++ < 100000) {
    let clipped = false;
    for (let i = 0; i < v.length; i++) {
      const a = v[(i + v.length - 1) % v.length], b = v[i], c = v[(i + 1) % v.length];
      const cr = cross(a, b, c);
      if (ccw ? cr <= 1e-12 : cr >= -1e-12) continue; // reflex/collinear
      let ear = true;
      for (const p of v) {
        if (p === a || p === b || p === c) continue;
        if (inTri(p, a, b, c)) { ear = false; break; }
      }
      if (!ear) continue;
      out.push([a, b, c]);
      v.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  for (let i = 1; i < v.length - 1; i++) out.push([v[0], v[i], v[i + 1]]);
  return out;
}

/** Concave-safe vertical prism (GH-337 review r4): same side quads as
 * prism(), caps EAR-CLIPPED instead of centroid-fanned — the snooker
 * template planks are notched around three pocket bays (centroid outside
 * the polygon), so the fan closed the bays with phantom cap wood that
 * shadow/bounce rays then hit. Pool/carom plans stay on prism(): their
 * polygons satisfy its star-shape assumption and the fan is their
 * committed byte-identical tessellation (zero-drift law). */
export function prismConcave(poly, y0, y1) {
  const tris = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % n];
    tris.push([[ax, y0, az], [bx, y0, bz], [bx, y1, bz]]);
    tris.push([[ax, y0, az], [bx, y1, bz], [ax, y1, az]]);
  }
  for (const [a, b, c] of earClip(poly)) {
    tris.push([[a[0], y1, a[1]], [b[0], y1, b[1]], [c[0], y1, c[1]]]);
    tris.push([[a[0], y0, a[1]], [c[0], y0, c[1]], [b[0], y0, b[1]]]);
  }
  return tris;
}

/** Axis-aligned box → 12 triangles. */
export function box(x0, y0, z0, x1, y1, z1) {
  const p = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const q = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
  const tris = [];
  for (const [a, b, c, d] of q) tris.push([p[a], p[b], p[c]], [p[a], p[c], p[d]]);
  return tris;
}

/** Horizontal rectangle at height y over [x0,x1]×[z0,z1] (2 tris). */
export function hrect(x0, z0, x1, z1, y) {
  return [[[x0, y, z0], [x1, y, z0], [x1, y, z1]], [[x0, y, z0], [x1, y, z1], [x0, y, z1]]];
}

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const EPS = 1e-9;

/** Möller–Trumbore; returns t or Infinity. Two-sided. */
function triHit(tris, o, d, i) {
  const ax = tris[i], ay = tris[i + 1], az = tris[i + 2];
  const e1x = tris[i + 3] - ax, e1y = tris[i + 4] - ay, e1z = tris[i + 5] - az;
  const e2x = tris[i + 6] - ax, e2y = tris[i + 7] - ay, e2z = tris[i + 8] - az;
  const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (det > -EPS && det < EPS) return Infinity;
  const inv = 1 / det;
  const tx = o[0] - ax, ty = o[1] - ay, tz = o[2] - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return Infinity;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
  if (v < 0 || u + v > 1) return Infinity;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 1e-6 ? t : Infinity;
}

function aabbHit(b, o, d, tMax) {
  let t0 = 1e-6, t1 = tMax;
  for (let c = 0; c < 3; c++) {
    const inv = 1 / d[c];
    let tn = (b[c] - o[c]) * inv, tf = (b[3 + c] - o[c]) * inv;
    if (tn > tf) { const tmp = tn; tn = tf; tf = tmp; }
    if (tn > t0) t0 = tn;
    if (tf < t1) t1 = tf;
    if (t0 > t1) return false;
  }
  return true;
}

/** Nearest hit over objects: returns { t, obj, n } or null. Normal is the
 * geometric triangle normal flipped toward the ray origin. */
export function trace(objects, o, d, tMax = Infinity) {
  let best = tMax, hitObj = null, hitI = -1;
  for (const obj of objects) {
    if (!aabbHit(obj.aabb, o, d, best)) continue;
    const tris = obj.tris;
    for (let i = 0; i < tris.length; i += 9) {
      const t = triHit(tris, o, d, i);
      if (t < best) { best = t; hitObj = obj; hitI = i; }
    }
  }
  if (!hitObj) return null;
  const tr = hitObj.tris, i = hitI;
  const e1 = [tr[i + 3] - tr[i], tr[i + 4] - tr[i + 1], tr[i + 5] - tr[i + 2]];
  const e2 = [tr[i + 6] - tr[i], tr[i + 7] - tr[i + 1], tr[i + 8] - tr[i + 2]];
  let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  n = [n[0] / len, n[1] / len, n[2] / len];
  if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] > 0) n = [-n[0], -n[1], -n[2]];
  return { t: best, obj: hitObj, n };
}

/** Any-hit shadow query (true = occluded). */
export function occluded(objects, o, d, tMax) {
  for (const obj of objects) {
    if (!aabbHit(obj.aabb, o, d, tMax)) continue;
    const tris = obj.tris;
    for (let i = 0; i < tris.length; i += 9) {
      if (triHit(tris, o, d, i) < tMax) return true;
    }
  }
  return false;
}
