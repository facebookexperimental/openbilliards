// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/lamp/geom.js — geometry of the club look's table luminaire (CONTRACT.md 9.2). Owner: lamp.
//
// Everything is built in world metres around the emitter rectangles the app lights the table with, one accumulator per material
// (`shade` painted metal, `brass` hardware, `glow` backlit glass and the lit inside, `face` the emitting underside), so the whole
// lamp is four draw calls whatever the fixture. Edges are real geometry: rounded-rectangle sections lofted along a profile, rolled
// rims, turned parts. No three light, no texture is made here.
import * as THREE from 'three';

/** A growing indexed mesh: position, normal, colour (linear, may exceed 1 on glowing parts), uv. */
export class Acc {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  get triangles() { return this.idx.length / 3; }
  vert(x, y, z, c, u = 0, v = 0) {
    this.pos.push(x, y, z); this.nor.push(0, 0, 0); this.col.push(c[0], c[1], c[2]); this.uv.push(u, v);
    return this.count - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  /** Area-weighted smooth normals over the vertices added since `from` (a part's creases are made by not sharing vertices). */
  smooth(from, fromIdx) {
    const p = this.pos, n = this.nor;
    for (let i = fromIdx; i < this.idx.length; i += 3) {
      const a = this.idx[i] * 3, b = this.idx[i + 1] * 3, c = this.idx[i + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
    }
    for (let k = from * 3; k < n.length; k += 3) {
      const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1;
      n[k] /= l; n[k + 1] /= l; n[k + 2] /= l;
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

const WHITE = [1, 1, 1];

/** Points of a rounded rectangle in the xz plane, counter-clockwise seen from above (from the +x+z corner toward -z):
 * 4 x (cs + 1) points, and the running length along the outline (for uv). */
function roundedRect(cx, cz, hx, hz, r, cs) {
  const rr = Math.max(1e-4, Math.min(r, hx - 1e-4, hz - 1e-4));
  const centres = [[hx - rr, hz - rr], [hx - rr, -(hz - rr)], [-(hx - rr), -(hz - rr)], [-(hx - rr), hz - rr]];
  const pts = [];
  for (let q = 0; q < 4; q++) {
    for (let i = 0; i <= cs; i++) {
      const a = (q + i / cs) * (Math.PI / 2); // corner 0 runs from +z to +x, 1 from +x to -z, 2 from -z to -x, 3 from -x to +z
      pts.push([cx + centres[q][0] + rr * Math.sin(a), cz + centres[q][1] + rr * Math.cos(a)]);
    }
  }
  let run = 0;
  const len = [0];
  for (let i = 1; i <= pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i % pts.length];
    run += Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    len.push(run);
  }
  return { pts, len };
}

/**
 * Loft rounded-rectangle sections. `rings`: [{ y, hx, hz, r, c?, crease? }] from the first to the last; a ring with `crease`
 * starts a new smooth group (its vertices are doubled). `flip` turns the faces inward. uv: u along the outline, v along the
 * profile, both in metres times `uvScale`.
 */
export function loft(acc, cx, cz, rings, { cs = 4, flip = false, uvScale = 1, c = WHITE } = {}) {
  const from = acc.count, fromIdx = acc.idx.length;
  let prev = null, v = 0, last = null;
  const emit = (ring, vv) => {
    const { pts, len } = roundedRect(cx, cz, ring.hx, ring.hz, ring.r, cs);
    const ids = [];
    for (let i = 0; i <= pts.length; i++) {
      const p = pts[i % pts.length];
      ids.push(acc.vert(p[0], ring.y, p[1], ring.c ?? c, len[i] * uvScale, vv * uvScale));
    }
    return ids;
  };
  for (let k = 0; k < rings.length; k++) {
    const ring = rings[k];
    if (last) v += Math.hypot(ring.y - last.y, Math.max(Math.abs(ring.hx - last.hx), Math.abs(ring.hz - last.hz)));
    let ids = emit(ring, v);
    if (prev) {
      for (let i = 0; i + 1 < ids.length; i++) {
        if (flip) acc.quad(prev[i], ids[i], ids[i + 1], prev[i + 1]);
        else acc.quad(prev[i], prev[i + 1], ids[i + 1], ids[i]);
      }
    }
    if (ring.crease && k > 0 && k < rings.length - 1) ids = emit(ring, v);
    prev = ids; last = ring;
  }
  acc.smooth(from, fromIdx);
  weldSeam(acc, from, rings, cs);
  return acc;
}
// the outline is closed by a doubled first point (for the uv): give both copies the same normal
function weldSeam(acc, from, rings, cs) {
  const n = 4 * (cs + 1) + 1;
  const total = acc.count - from;
  for (let r = 0; r * n < total; r++) {
    const a = (from + r * n) * 3, b = (from + r * n + n - 1) * 3;
    const x = acc.nor[a] + acc.nor[b], y = acc.nor[a + 1] + acc.nor[b + 1], z = acc.nor[a + 2] + acc.nor[b + 2];
    const l = Math.hypot(x, y, z) || 1;
    acc.nor[a] = acc.nor[b] = x / l; acc.nor[a + 1] = acc.nor[b + 1] = y / l; acc.nor[a + 2] = acc.nor[b + 2] = z / l;
  }
}

/**
 * Straps over the four rounded corners of a loft: for each corner a narrow band that follows the corner's middle from the
 * first ring to the last, standing `lift` proud of the surface. Same `rings` as loft().
 */
export function cornerStraps(acc, cx, cz, rings, { cs = 4, lift = 0.002, c = WHITE, half = 0.007 } = {}) {
  if (cs < 2) return acc;
  // corner q of roundedRect(): centre signs, and the angle of its middle (the outline runs from +z toward +x, then -z ...)
  const sign = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  for (let q = 0; q < 4; q++) {
    const from = acc.count, fromIdx = acc.idx.length;
    let prev = null, v = 0, last = null;
    for (const ring of rings) {
      // a strap of constant width `2 * half` along the middle of the corner arc, a little proud at its centre line
      const rr = Math.max(1e-4, Math.min(ring.r, ring.hx - 1e-4, ring.hz - 1e-4));
      const ox = cx + sign[q][0] * (ring.hx - rr), oz = cz + sign[q][1] * (ring.hz - rr);
      const mid = (q + 0.5) * (Math.PI / 2), da = Math.min(0.6, half / Math.max(rr, half));
      if (last) v += Math.hypot(ring.y - last.y, Math.max(Math.abs(ring.hx - last.hx), Math.abs(ring.hz - last.hz)));
      const ids = [-1, 0, 1].map((k) => {
        const a = mid + k * da, rad = rr + lift + (k === 0 ? lift : 0);
        return acc.vert(ox + rad * Math.sin(a), ring.y, oz + rad * Math.cos(a), c, (k + 1) * 0.5, v);
      });
      if (prev) for (let i = 0; i < 2; i++) acc.quad(prev[i], prev[i + 1], ids[i + 1], ids[i]);
      prev = ids; last = ring;
    }
    acc.smooth(from, fromIdx);
  }
  return acc;
}

/** A flat band between two rounded rectangles at height y (outer first), facing up or down. */
export function flatRing(acc, cx, cz, y, outer, inner, { cs = 4, up = false, c = WHITE, uv = null } = {}) {
  const a = roundedRect(cx, cz, outer.hx, outer.hz, outer.r, cs).pts, b = roundedRect(cx, cz, inner.hx, inner.hz, inner.r, cs).pts;
  const base = acc.count;
  for (let i = 0; i < a.length; i++) {
    const ia = acc.vert(a[i][0], y, a[i][1], c, uv ? uv[0] : a[i][0], uv ? uv[1] : a[i][1]);
    const ib = acc.vert(b[i][0], y, b[i][1], c, uv ? uv[0] : b[i][0], uv ? uv[1] : b[i][1]);
    acc.nor[ia * 3 + 1] = acc.nor[ib * 3 + 1] = up ? 1 : -1;
  }
  const n = a.length;
  for (let i = 0; i < n; i++) {
    const o0 = base + 2 * i, i0 = o0 + 1, o1 = base + 2 * ((i + 1) % n), i1 = o1 + 1;
    // the outline runs counter-clockwise seen from above
    if (up) acc.quad(o0, o1, i1, i0); else acc.quad(o0, i0, i1, o1);
  }
  return acc;
}

/** A flat rounded-rectangle cap at height y. */
export function cap(acc, cx, cz, y, hx, hz, r, { cs = 4, up = true, c = WHITE, uvScale = 1 } = {}) {
  const pts = roundedRect(cx, cz, hx, hz, r, cs).pts;
  const centre = acc.vert(cx, y, cz, c, cx * uvScale, cz * uvScale);
  acc.nor[centre * 3 + 1] = up ? 1 : -1;
  const base = acc.count;
  for (const p of pts) { const i = acc.vert(p[0], y, p[1], c, p[0] * uvScale, p[1] * uvScale); acc.nor[i * 3 + 1] = up ? 1 : -1; }
  for (let i = 0; i < pts.length; i++) {
    const a = base + i, b = base + ((i + 1) % pts.length);
    if (up) acc.tri(centre, a, b); else acc.tri(centre, b, a);
  }
  return acc;
}

/** A rectangle facing down at height y with uv 0..1 (u along x): one emitting face. */
export function faceRect(acc, cx, cz, y, hx, hz, c = WHITE) {
  const a = acc.vert(cx - hx, y, cz - hz, c, 0, 0), b = acc.vert(cx + hx, y, cz - hz, c, 1, 0);
  const d = acc.vert(cx - hx, y, cz + hz, c, 0, 1), e = acc.vert(cx + hx, y, cz + hz, c, 1, 1);
  for (const i of [a, b, d, e]) acc.nor[i * 3 + 1] = -1;
  acc.tri(a, b, e); acc.tri(a, e, d);
  return acc;
}

/**
 * One lit panel of a face: a rectangle facing down at height y. u runs 0..1 along the panel's long axis (x when `alongX`),
 * v runs v0..v1 across it (the panel rows of the face texture).
 */
export function facePanel(acc, cx, cz, y, hx, hz, { alongX = true, v0 = 0, v1 = 1, c = WHITE } = {}) {
  const uv = (sx, sz) => (alongX ? [(sx + 1) / 2, v0 + (v1 - v0) * (sz + 1) / 2] : [(sz + 1) / 2, v0 + (v1 - v0) * (sx + 1) / 2]);
  const ids = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
    const t = uv(sx, sz);
    const k = acc.vert(cx + sx * hx, y, cz + sz * hz, c, t[0], t[1]);
    acc.nor[k * 3 + 1] = -1;
    return k;
  });
  acc.tri(ids[0], ids[1], ids[2]); acc.tri(ids[0], ids[2], ids[3]);
  return acc;
}

/** A disc facing down at height y; every vertex takes the uv `uv` (a flat texel); the rim may take its own colour. */
export function faceDisc(acc, cx, cz, y, r, segs, c = WHITE, uv = [0.5, 0.5], cRim = null) {
  const centre = acc.vert(cx, y, cz, c, uv[0], uv[1]);
  acc.nor[centre * 3 + 1] = -1;
  const base = acc.count;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const k = acc.vert(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, cRim ?? c, uv[0], uv[1]);
    acc.nor[k * 3 + 1] = -1;
  }
  for (let i = 0; i < segs; i++) acc.tri(centre, base + i, base + ((i + 1) % segs));
  return acc;
}

/**
 * A turned part around a vertical axis through (cx, cz). `profile`: [[radius, y, crease?, colour?], ...] listed from the bottom
 * up for a surface that faces outward (pass `flip` for one that faces the axis, or list it from the top down). A profile
 * point may carry its own colour (a gradient along the profile).
 */
export function lathe(acc, cx, cz, profile, { segs = 16, flip = false, c = WHITE, uvScale = 1 } = {}) {
  const from = acc.count, fromIdx = acc.idx.length;
  let prev = null, v = 0;
  const emit = (r, y, vv, col) => {
    const ids = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      ids.push(acc.vert(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, col, (i / segs) * Math.PI * 2 * Math.max(r, 0.01) * uvScale, vv * uvScale));
    }
    return ids;
  };
  for (let k = 0; k < profile.length; k++) {
    const [r, y, crease, pc] = profile[k];
    const col = Array.isArray(pc) ? pc : c;
    if (k > 0) v += Math.hypot(r - profile[k - 1][0], y - profile[k - 1][1]);
    let ids = emit(r, y, v, col);
    if (prev) {
      for (let i = 0; i < segs; i++) {
        if (flip) acc.quad(prev[i], prev[i + 1], ids[i + 1], ids[i]);
        else acc.quad(prev[i], ids[i], ids[i + 1], prev[i + 1]);
      }
    }
    if (crease && k > 0 && k < profile.length - 1) ids = emit(r, y, v, col);
    prev = ids;
  }
  acc.smooth(from, fromIdx);
  // close the seam: the first and last vertex of every ring share a normal
  const n = segs + 1;
  for (let r = 0; r * n < acc.count - from; r++) {
    const a = (from + r * n) * 3, b = (from + r * n + segs) * 3;
    const x = acc.nor[a] + acc.nor[b], y = acc.nor[a + 1] + acc.nor[b + 1], z = acc.nor[a + 2] + acc.nor[b + 2];
    const l = Math.hypot(x, y, z) || 1;
    acc.nor[a] = acc.nor[b] = x / l; acc.nor[a + 1] = acc.nor[b + 1] = y / l; acc.nor[a + 2] = acc.nor[b + 2] = z / l;
  }
  return acc;
}

/** A round bar between two points (any direction), optionally capped. */
export function bar(acc, a, b, r, { segs = 10, c = WHITE, caps = false } = {}) {
  const ax = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = ax.length();
  if (len < 1e-6) return acc;
  ax.multiplyScalar(1 / len);
  const u = new THREE.Vector3(0, 1, 0);
  if (Math.abs(ax.y) > 0.9) u.set(1, 0, 0);
  const s = new THREE.Vector3().crossVectors(ax, u).normalize();
  const t = new THREE.Vector3().crossVectors(ax, s).normalize();
  const ringAt = (p, vv) => {
    const ids = [];
    for (let i = 0; i <= segs; i++) {
      const ang = (i / segs) * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang);
      const nx = s.x * cs + t.x * sn, ny = s.y * cs + t.y * sn, nz = s.z * cs + t.z * sn;
      const k = acc.vert(p[0] + nx * r, p[1] + ny * r, p[2] + nz * r, c, (i / segs), vv);
      acc.nor[k * 3] = nx; acc.nor[k * 3 + 1] = ny; acc.nor[k * 3 + 2] = nz;
      ids.push(k);
    }
    return ids;
  };
  const r0 = ringAt(a, 0), r1 = ringAt(b, len);
  for (let i = 0; i < segs; i++) acc.quad(r0[i], r0[i + 1], r1[i + 1], r1[i]);
  if (caps) {
    for (const [p, dir, ring] of [[a, -1, r0], [b, 1, r1]]) {
      const cI = acc.vert(p[0], p[1], p[2], c, 0.5, 0.5);
      acc.nor[cI * 3] = ax.x * dir; acc.nor[cI * 3 + 1] = ax.y * dir; acc.nor[cI * 3 + 2] = ax.z * dir;
      const ids = ring.map((k) => {
        const j = acc.vert(acc.pos[k * 3], acc.pos[k * 3 + 1], acc.pos[k * 3 + 2], c, 0.5, 0.5);
        acc.nor[j * 3] = ax.x * dir; acc.nor[j * 3 + 1] = ax.y * dir; acc.nor[j * 3 + 2] = ax.z * dir;
        return j;
      });
      for (let i = 0; i < segs; i++) { if (dir > 0) acc.tri(cI, ids[i], ids[i + 1]); else acc.tri(cI, ids[i + 1], ids[i]); }
    }
  }
  return acc;
}

/** A small ball (finials, rod knuckles). */
export function ball(acc, cx, cy, cz, r, { segs = 10, c = WHITE } = {}) {
  const rows = Math.max(4, Math.round(segs * 0.6));
  const profile = [];
  for (let i = 0; i <= rows; i++) { const a = -Math.PI / 2 + (i / rows) * Math.PI; profile.push([Math.max(1e-5, Math.cos(a) * r), cy + Math.sin(a) * r]); }
  return lathe(acc, cx, cz, profile, { segs, c });
}

/** An axis-aligned block (mullions, small brackets): six flat faces. */
export function block(acc, cx, cy, cz, sx, sy, sz, c = WHITE) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const faces = [
    [[1, 0, 0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]]],
    [[-1, 0, 0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]]],
    [[0, 1, 0], [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]]],
    [[0, -1, 0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]],
    [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]],
    [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]],
  ];
  for (const [n, vs] of faces) {
    const ids = vs.map((p, i) => {
      const k = acc.vert(cx + p[0], cy + p[1], cz + p[2], c, i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0);
      acc.nor[k * 3] = n[0]; acc.nor[k * 3 + 1] = n[1]; acc.nor[k * 3 + 2] = n[2];
      return k;
    });
    acc.quad(ids[0], ids[1], ids[2], ids[3]);
  }
  return acc;
}
