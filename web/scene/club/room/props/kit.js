// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/props/kit.js — the geometry kit of the club props (owner: props). Every prop is a handful of primitives (bevelled box,
// lathe, tapered tube, quad, disc, sphere) appended, already transformed, to one merged batch per material, so the whole room
// costs one draw call per material however many chairs and bottles it holds. No instancing: a merged static batch keeps the
// program count down (no instanced variant of each lit program) and needs no per-instance colour path.
//
// Conventions: metres, Y up. A primitive is placed by a centre `c` and optional Euler angles (`ry`, then `rx`, then `rz`) on top
// of the kit's matrix stack. `uv` chooses the mapping:
//   { s: [u, v] }            every vertex samples one point (a flat swatch of the atlas)
//   { r: [u0, v0, u1, v1] }  the primitive's natural 0..1 UV goes into that rectangle (v0 = bottom)
//   { w: metres }            UV in metres / w, grain along U (tiling wood, leather); boxes project per face
// `k` is a baked shade written to the vertex colour (the lit materials multiply their albedo by it): a number, or
// [bottom, top] for a gradient over the primitive's height. It is how a prop gets its contact darkening (the legs under a table,
// a cabinet toward the floor) without a shadow map. kit.shade(k, fn) multiplies everything built inside fn. In a batch made
// with `hdr: true` (the emissive batch) the same `k` is not clamped: it is the primitive's HDR level over its atlas colour.
// A lathe also takes `k2` (0..1): a second value per primitive, written to the blue channel only (the glass batch's glint gate).
// Importing this module does nothing.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _e = new THREE.Euler();

/** One merged mesh in the making. */
export class Batch {
  /** `hdr: true` keeps the vertex shade as a float (not clamped to 0..1): the emissive batch uses it as its HDR level. */
  constructor(name, { hdr = false } = {}) { this.name = name; this.hdr = hdr; this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.count = 0; }
  get triangles() { return this.idx.length / 3; }
  /**
   * Append raw arrays (positions, normals, uvs, triangle indices) through matrix `m`; `C` = per-vertex shade 0..1 (or none).
   * `C2` = a second per-vertex value 0..1 written to the BLUE channel alone (the glass batch reads it as the glint gate,
   * props.js GLASS_FRAGMENT); without it blue carries the shade like red and green.
   */
  append(P, N, UV, I, m, C = null, scale = 1, C2 = null) {
    const base = this.count;
    const nV = P.length / 3;
    _nm.getNormalMatrix(m);
    for (let i = 0; i < nV; i++) {
      _v.set(P[3 * i], P[3 * i + 1], P[3 * i + 2]).applyMatrix4(m);
      _n.set(N[3 * i], N[3 * i + 1], N[3 * i + 2]).applyMatrix3(_nm).normalize();
      this.pos.push(_v.x, _v.y, _v.z); this.nor.push(_n.x, _n.y, _n.z); this.uv.push(UV[2 * i], UV[2 * i + 1]);
      const lvl = scale * (C ? C[i] : 1);
      const k = this.hdr ? Math.max(0, lvl) : Math.max(0, Math.min(255, Math.round(255 * lvl)));
      this.col.push(k, k, C2 && !this.hdr ? Math.max(0, Math.min(255, Math.round(255 * C2[i]))) : k);
    }
    for (let i = 0; i < I.length; i++) this.idx.push(base + I[i]);
    this.count += nV;
  }
  toMesh(material) {
    if (!this.count) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', this.hdr ? new THREE.Float32BufferAttribute(this.col, 3) : new THREE.Uint8BufferAttribute(this.col, 3, true));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const mesh = new THREE.Mesh(g, material);
    mesh.name = `club.props.${this.name}`;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}

const frac = (x) => x - Math.floor(x);
const hash = (i, k) => frac(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453);

/**
 * createKit({ bevels, minBevel }) -> the primitive functions. `bevels: false` (the lite room) drops every chamfer: a box is 12
 * triangles instead of 44. `minBevel` (metres) drops the chamfers narrower than that (the base room keeps only the ones wide
 * enough to be seen across a room: arms, cushions, table tops).
 */
export function createKit({ bevels = true, minBevel = 0 } = {}) {
  const stack = [new THREE.Matrix4()];
  const local = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  let serial = 0;
  let shadeNow = 1;
  const top = () => stack[stack.length - 1];
  // shade of a vertex at normalised height t for the primitive option k (number | [bottom, top] | undefined)
  const kAt = (k, t) => (k === undefined ? 1 : typeof k === 'number' ? k : k[0] + (k[1] - k[0]) * t);

  function place(c, o) {
    _e.set(o?.rx ?? 0, o?.ry ?? 0, o?.rz ?? 0, 'YXZ');
    local.makeRotationFromEuler(_e).setPosition(c[0], c[1], c[2]);
    return world.multiplyMatrices(top(), local);
  }
  const mapUV = (uv, u, v) => (uv?.s ? uv.s : uv?.r ? [uv.r[0] + u * (uv.r[2] - uv.r[0]), uv.r[1] + v * (uv.r[3] - uv.r[1])] : [u, v]);

  // a triangle, wound so its face normal agrees with its vertex normals (every primitive below is built without caring)
  function tri(I, P, N, a, b, c) {
    const ax = P[3 * a], ay = P[3 * a + 1], az = P[3 * a + 2];
    const ux = P[3 * b] - ax, uy = P[3 * b + 1] - ay, uz = P[3 * b + 2] - az;
    const vx = P[3 * c] - ax, vy = P[3 * c + 1] - ay, vz = P[3 * c + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz < 1e-18) return;
    const d = nx * (N[3 * a] + N[3 * b] + N[3 * c]) + ny * (N[3 * a + 1] + N[3 * b + 1] + N[3 * c + 1]) + nz * (N[3 * a + 2] + N[3 * b + 2] + N[3 * c + 2]);
    if (d >= 0) I.push(a, b, c); else I.push(a, c, b);
  }

  /**
   * A box with chamfered edges whose normals blend across the chamfer (reads as a rounded edge). size [x, y, z], centre c.
   * o: { b: bevel in metres, uv, g: grain axis 0|1|2 (default: the longest side), ry, rx, rz }.
   */
  function box(batch, size, c, o = {}) {
    const h = [size[0] / 2, size[1] / 2, size[2] / 2];
    let b = bevels ? (o.b ?? 0.004) : 0;
    if (b < minBevel) b = 0;
    b = Math.min(b, 0.45 * Math.min(h[0], h[1], h[2]));
    const uv = o.uv;
    const g = o.g ?? (h[0] >= h[1] && h[0] >= h[2] ? 0 : (h[1] >= h[2] ? 1 : 2));
    const id = serial++;
    const ou = uv?.w ? hash(id, 1) : 0, ov = uv?.w ? hash(id, 2) : 0;
    const P = [], N = [], UV = [], I = [], C = [];
    const p = [0, 0, 0];
    for (let ax = 0; ax < 3; ax++) {
      const u = (ax + 1) % 3, v = (ax + 2) % 3;
      for (let s = -1; s <= 1; s += 2) for (let su = -1; su <= 1; su += 2) for (let sv = -1; sv <= 1; sv += 2) {
        p[ax] = s * h[ax]; p[u] = su * (h[u] - b); p[v] = sv * (h[v] - b);
        P.push(p[0], p[1], p[2]);
        C.push(kAt(o.k, p[1] > 0 ? 1 : 0));
        N.push(ax === 0 ? s : 0, ax === 1 ? s : 0, ax === 2 ? s : 0);
        if (uv?.w) {
          const along = g !== ax ? g : u;
          const across = g !== ax ? 3 - ax - g : v;
          UV.push(p[along] / uv.w + ou, p[across] / uv.w + ov);
        } else {
          const t = mapUV(uv, (su + 1) / 2, (sv + 1) / 2);
          UV.push(t[0], t[1]);
        }
      }
    }
    const vid = (ax, sg) => ax * 8 + (sg[ax] > 0 ? 4 : 0) + (sg[(ax + 1) % 3] > 0 ? 2 : 0) + (sg[(ax + 2) % 3] > 0 ? 1 : 0);
    const sg = [0, 0, 0];
    for (let ax = 0; ax < 3; ax++) {
      const u = (ax + 1) % 3, v = (ax + 2) % 3;
      for (let s = -1; s <= 1; s += 2) {
        sg[ax] = s;
        sg[u] = -1; sg[v] = -1; const a = vid(ax, sg);
        sg[u] = 1; const bb = vid(ax, sg);
        sg[v] = 1; const cc = vid(ax, sg);
        sg[u] = -1; const dd = vid(ax, sg);
        tri(I, P, N, a, bb, cc); tri(I, P, N, a, cc, dd);
      }
    }
    if (b > 0) {
      for (let a1 = 0; a1 < 3; a1++) for (let a2 = a1 + 1; a2 < 3; a2++) {
        const a3 = 3 - a1 - a2;
        for (let s1 = -1; s1 <= 1; s1 += 2) for (let s2 = -1; s2 <= 1; s2 += 2) {
          sg[a1] = s1; sg[a2] = s2;
          sg[a3] = -1; const A0 = vid(a1, sg), B0 = vid(a2, sg);
          sg[a3] = 1; const A1 = vid(a1, sg), B1 = vid(a2, sg);
          tri(I, P, N, A0, A1, B1); tri(I, P, N, A0, B1, B0);
        }
      }
      for (let sx = -1; sx <= 1; sx += 2) for (let sy = -1; sy <= 1; sy += 2) for (let sz = -1; sz <= 1; sz += 2) {
        sg[0] = sx; sg[1] = sy; sg[2] = sz;
        tri(I, P, N, vid(0, sg), vid(1, sg), vid(2, sg));
      }
    }
    batch.append(P, N, UV, I, place(c, o), C, shadeNow);
  }

  /**
   * A surface of revolution about +Y. `prof` = [[r, y], ...] traced from the bottom centre outward and up to the top (the outside
   * is on the right of the direction of travel); a repeated point makes a crease. o: { segs, uv, vArc (v by arc length instead
   * of by height), k, k2, ry, rx, rz }.
   */
  function lathe(batch, prof, c, o = {}) {
    const segs = Math.max(3, o.segs ?? 12);
    const n = prof.length;
    const uv = o.uv;
    const same = (i, j) => i >= 0 && j < n && Math.abs(prof[i][0] - prof[j][0]) < 1e-9 && Math.abs(prof[i][1] - prof[j][1]) < 1e-9;
    let y0 = Infinity, y1 = -Infinity, rMax = 0;
    const arc = [0];
    for (let i = 0; i < n; i++) {
      y0 = Math.min(y0, prof[i][1]); y1 = Math.max(y1, prof[i][1]); rMax = Math.max(rMax, prof[i][0]);
      if (i) arc.push(arc[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
    }
    const total = arc[n - 1] || 1;
    const nrm = [];
    for (let i = 0; i < n; i++) {
      let tr = 0, ty = 0;
      const add = (a, b2) => { const dr = prof[b2][0] - prof[a][0], dy = prof[b2][1] - prof[a][1]; const l = Math.hypot(dr, dy) || 1; tr += dr / l; ty += dy / l; };
      const creaseNext = same(i, i + 1), creasePrev = same(i - 1, i);
      if (i > 0 && !creasePrev && !(creaseNext && i === 0)) add(i - 1, i);
      if (i < n - 1 && !creaseNext) add(i, i + 1);
      if (tr === 0 && ty === 0) { if (i > 0) add(i - 1, i); else add(i, i + 1); }
      const l = Math.hypot(tr, ty) || 1;
      nrm.push([ty / l, -tr / l]);
    }
    const id = serial++;
    const ov = uv?.w ? hash(id, 3) : 0;
    const P = [], N = [], UV = [], I = [], C = [];
    const C2 = Number.isFinite(o.k2) ? [] : null;
    for (let i = 0; i < n; i++) {
      const vh = y1 > y0 ? (prof[i][1] - y0) / (y1 - y0) : 0;
      const vv = o.vArc ? arc[i] / total : vh;
      for (let j = 0; j <= segs; j++) {
        const th = (j / segs) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
        P.push(prof[i][0] * cs, prof[i][1], prof[i][0] * sn);
        C.push(kAt(o.k, vh));
        if (C2) C2.push(o.k2);
        N.push(nrm[i][0] * cs, nrm[i][1], nrm[i][0] * sn);
        if (uv?.w) UV.push(arc[i] / uv.w + ov, (th * rMax) / uv.w);
        else { const t = mapUV(uv, j / segs, vv); UV.push(t[0], t[1]); }
      }
    }
    const row = segs + 1;
    for (let i = 0; i < n - 1; i++) {
      if (same(i, i + 1)) continue;
      for (let j = 0; j < segs; j++) {
        const a = i * row + j, b2 = a + 1, c2 = a + row, d = c2 + 1;
        tri(I, P, N, a, c2, d); tri(I, P, N, a, d, b2);
      }
    }
    batch.append(P, N, UV, I, place(c, o), C, shadeNow, C2);
  }

  /** A sphere of radius r at c. o: { segs (around), rings, uv }. */
  function sphere(batch, r, c, o = {}) {
    const rings = Math.max(2, o.rings ?? 6);
    const prof = [];
    for (let k = 0; k <= rings; k++) { const a = -Math.PI / 2 + (k / rings) * Math.PI; prof.push([Math.max(0, r * Math.cos(a)), r * Math.sin(a)]); }
    lathe(batch, prof, c, { segs: o.segs ?? 10, uv: o.uv, k: o.k });
  }

  /**
   * A tapered round bar from point a (radius r0) to point b (radius r1), in the kit's current frame.
   * o: { segs, uv, caps (true: both ends closed) }.
   */
  function tube(batch, a, b, r0, r1, o = {}) {
    const segs = Math.max(3, o.segs ?? 8);
    const uv = o.uv;
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length() || 1e-6;
    d.multiplyScalar(1 / len);
    const e1 = new THREE.Vector3(Math.abs(d.y) < 0.9 ? 0 : 1, Math.abs(d.y) < 0.9 ? 1 : 0, 0).cross(d).normalize();
    const e2 = new THREE.Vector3().crossVectors(d, e1);
    const id = serial++;
    const ov = uv?.w ? hash(id, 4) : 0;
    const P = [], N = [], UV = [], I = [], C = [];
    const ends = [[a, r0, 0], [b, r1, 1]];
    for (const [q, r, vv] of ends) {
      for (let j = 0; j <= segs; j++) {
        const th = (j / segs) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
        const nx = e1.x * cs + e2.x * sn, ny = e1.y * cs + e2.y * sn, nz = e1.z * cs + e2.z * sn;
        P.push(q[0] + nx * r, q[1] + ny * r, q[2] + nz * r);
        C.push(kAt(o.k, vv));
        N.push(nx, ny, nz);
        if (uv?.w) UV.push((vv * len) / uv.w + ov, (th * Math.max(r0, r1)) / uv.w);
        else { const t = mapUV(uv, j / segs, vv); UV.push(t[0], t[1]); }
      }
    }
    const row = segs + 1;
    for (let j = 0; j < segs; j++) { tri(I, P, N, j, j + 1, row + j + 1); tri(I, P, N, j, row + j + 1, row + j); }
    if (o.caps) {
      for (const [q, r, vv] of ends) {
        const sgn = vv ? 1 : -1;
        const centre = P.length / 3;
        P.push(q[0], q[1], q[2]); N.push(d.x * sgn, d.y * sgn, d.z * sgn); C.push(kAt(o.k, vv));
        const tc = uv?.w ? [(vv * len) / uv.w + ov, 0] : mapUV(uv, 0.5, vv); UV.push(tc[0], tc[1]);
        for (let j = 0; j <= segs; j++) {
          const th = (j / segs) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
          P.push(q[0] + (e1.x * cs + e2.x * sn) * r, q[1] + (e1.y * cs + e2.y * sn) * r, q[2] + (e1.z * cs + e2.z * sn) * r);
          N.push(d.x * sgn, d.y * sgn, d.z * sgn); UV.push(tc[0], tc[1]); C.push(kAt(o.k, vv));
        }
        for (let j = 0; j < segs; j++) tri(I, P, N, centre, centre + 1 + j, centre + 2 + j);
      }
    }
    batch.append(P, N, UV, I, top(), C, shadeNow);
  }

  /** A w x h rectangle in the local XY plane facing +Z, centred at c. o: { uv, ry, rx, rz, double }. */
  function quad(batch, w, h, c, o = {}) {
    const uv = o.uv;
    const P = [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0];
    const N = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
    const nat = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const UV = [];
    for (let k = 0; k < 4; k++) {
      const t = uv?.w ? [P[3 * k] / uv.w, P[3 * k + 1] / uv.w] : mapUV(uv, nat[k][0], nat[k][1]);
      UV.push(t[0], t[1]);
    }
    const m = place(c, o);
    const C = [kAt(o.k, 0), kAt(o.k, 0), kAt(o.k, 1), kAt(o.k, 1)];
    batch.append(P, N, UV, [0, 1, 2, 0, 2, 3], m, C, shadeNow);
    if (o.double) batch.append(P, [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1], UV, [0, 2, 1, 0, 3, 2], m, C, shadeNow);
  }

  /** A disc of radius r in the local XZ plane facing +Y, centred at c. o: { segs, uv, rx, ry, rz }. */
  function disc(batch, r, c, o = {}) {
    const segs = Math.max(3, o.segs ?? 16);
    const uv = o.uv;
    const P = [0, 0, 0], N = [0, 1, 0], I = [];
    const t0 = mapUV(uv, 0.5, 0.5);
    const UV = [t0[0], t0[1]];
    for (let j = 0; j <= segs; j++) {
      const th = (j / segs) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
      P.push(r * cs, 0, r * sn); N.push(0, 1, 0);
      const t = mapUV(uv, 0.5 + 0.5 * cs, 0.5 - 0.5 * sn); UV.push(t[0], t[1]);
    }
    for (let j = 0; j < segs; j++) tri(I, P, N, 0, 1 + j, 2 + j);
    batch.append(P, N, UV, I, place(c, o), typeof o.k === 'number' ? P.map(() => o.k).slice(0, P.length / 3) : null, shadeNow);
  }

  /** Raw arrays in the kit's current frame (ribbons and other one-off shapes); triangles are re-wound to the normals. */
  function raw(batch, P, N, UV, quads, C = null) {
    const I = [];
    for (const [a, b, c, d] of quads) { tri(I, P, N, a, b, c); if (d !== undefined) tri(I, P, N, a, c, d); }
    batch.append(P, N, UV, I, top(), C, shadeNow);
  }

  return {
    box, lathe, sphere, tube, quad, disc, raw,
    /** Run fn with matrix m (a THREE.Matrix4 in the current frame) pushed on the stack. */
    within(m, fn) { stack.push(top().clone().multiply(m)); try { fn(); } finally { stack.pop(); } },
    /** Shorthand: a frame at (x, y, z) turned by ry about Y. */
    at(x, y, z, ry, fn) { const m = new THREE.Matrix4().makeRotationY(ry || 0).setPosition(x, y, z); this.within(m, fn); },
    /** Run fn with every vertex shade multiplied by k (nested calls multiply). */
    shade(k, fn) { const before = shadeNow; shadeNow *= k; try { fn(); } finally { shadeNow = before; } },
    get bevels() { return bevels; },
  };
}
