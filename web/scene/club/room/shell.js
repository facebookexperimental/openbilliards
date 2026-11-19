// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/shell.js — the club room's shell (CONTRACT.md section 8.3, "the shell (room) owns"): floor, walls with a panelled
// wainscot, dado cap, painted plaster, picture rail, cove cornice, a coffered ceiling of timber beams, a half-glazed door, two
// sash windows with blinds and a night view, and the wall lamps fixed to the shell. Owner: room.
//
// Everything is real-world sized (metres) and built from a few merged meshes (one per material), so the whole shell is under
// ten draw calls. All surfaces face INTO the room and have no outward faces. Mouldings are extruded profiles with rounded
// sections; panels are recessed with bevels; beam edges are chamfered: no visible edge is a bare 90 degree polygon corner.
//
// Relief and the baked map: the map has 2 cm texels on the walls, the wainscot's bevels are 11 mm. So the wood that lies on a
// wall (frame, panels, skirting, dado, casings, the door leaf) is baked as the flat wall it stands on (the bake takes the
// wall's normal there: `userData.lm.normal`), and the material puts the relief back from the real normal (room/light.js
// RELIEF; the vertex carries the mark on `roomSide`). Beams, reveals and sills keep their own baked light.
//
// Two per-vertex extras ride on every shell mesh:
//   `lm`        the second UV set, for the baked light map (room/lightmap.js createAtlas): the floor, the ceiling and each wall
//               are one planar chart (relief is projected into it; the bake keeps the front-most face per texel), faces
//               turned away from their plane (beam sides, window reveals, sill boards) get small charts of their own;
//   `roomSide`  which side of the room the vertex belongs to (0 floor, 1 north, 2 east, 3 south, 4 west, 5 ceiling). The
//               materials (room/light.js) drop a whole side, with its mouldings, lamps and window, while the camera is behind
//               that side's plane: a camera that leaves the box looks into a cut-away room, never at loose ledges and lamps.
//
// Wall frames: every wall has an origin (its left end at floor level as seen from inside), a tangent t (to the viewer's right),
// the inward normal a and up b; a point is P(s, d, h) = o + t s + a d + b h (s along the wall, d out of the wall, h above the
// floor). With t = b x a, a quad listed right-then-up faces the room.
import * as THREE from 'three';
import * as TEX from './tex.js';
import { createAtlas, LM_SIZE } from './lightmap.js';
import { UNSHADE, RELIEF } from './light.js';

const UP = new THREE.Vector3(0, 1, 0);
// how far behind / in front of its wall plane a wood face may lie and still be baked as that wall (metres)
const FLAT_DEPTH = Object.freeze([-0.08, 0.09]);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- dimensions (metres above the floor unless said otherwise) ----------------------------------------------------------
export const DIM = Object.freeze({
  wainscotTop: 1.06,     // top of the panel frame; the dado cap sits on it
  dadoTop: 1.125,
  frameD: 0.020,         // the panel frame stands this far off the plaster
  skirtingH: 0.152,
  pictureRail: 2.56,     // underside of the picture rail = top of the window casings
  cornice: 0.14,         // cove height and projection
  sconceH: 1.80,
  sconceOut: 0.135,      // shade axis off the wall
  window: { w: 1.25, h0: 1.20, h1: 2.46, reveal: 0.18 },
  door: { w: 0.92, h: 2.06, reveal: 0.045 },
  beam: { mainW: 0.20, mainD: 0.24, crossW: 0.15, crossD: 0.17 },
});

// The ceiling beams' tint over the panelling's wood. Round 3: 0.62 -> 0.95: the beams face down and to the side, take the
// least light in the room, and at 0.62 their albedo (0.15 / 0.04 / 0.01) left them black against the cream bays (11 of 255
// at V9); stained no darker than the wainscot they show their chamfers and their grain under the same light.
const BEAM_TINT = 0.95;

// the wall lamps as emitters: candela-like level, the source radius of the near-field cap (m), the share of the light that
// leaves along the shade's open axis (and about half as much against it), the reach (m: the emitter's window radius,
// (1 - (d / reach)^4)^2), and whether the shade opens upward.
// What the numbers decide is where the room's own light lands, and with it whether the played table's lamp leaves a pool on
// the floor. By the app's numbers the lamp puts 0.72 units on the floor 1 m beyond the long rail and 0.15 at 2 m.
//   Round 2 (level 8, source 0.85, open downward, reach 6.0 m): every wall lamp lit the floor across the room: 2.6 units at
//     that first point, 4.7 at the second, 5.3 at the wall's foot. The room read lit (mean luma of the wide views 37 of 255)
//     and the floor was the wrong way round: brightest at the walls, no pool.
//   Round 2's trial (reach 2.4 m): the floor holds 0.75 everywhere and the wide views fall to round 1b's level (26).
//   Round 3 (candidates baked side by side: web/tools/club/bake-room-cands.mjs, sets r3a and r3b): the lamps are uplighters
//     (the open axis points up: the frieze, the cornice and the ceiling bay over each lamp take the strong lobe, the wall
//     under it and the floor at its foot the weaker one) and reach less far, so they are pools on the walls and at the
//     walls' feet and add next to nothing to the floor around the table. What the room loses in light across the floor it
//     gets back three ways: a lighter floor (the tint over the scan, below: albedo 0.26 / 0.12 / 0.05, was 0.17 / 0.08 /
//     0.03), a house light that is moved from the floor to the walls and the ceiling (bake-room-scene.mjs BAKE_AMBIENT),
//     and the lamp's pool itself (room/light.js POOL).
const SCONCE = Object.freeze({ intensity: 7, source: 0.7, beam: 0.66, reach: 2.6, up: true });

// linear RGB vertex colours (paint, tone and baked shade)
const PAINT = Object.freeze({
  // deep bottle green. Round 3: 1.3 x round 2's (0.034, 0.110, 0.080): at the room's level a paint that reflects 9 % sat at
  // 15 to 17 of 255 between the wall lamps (the tone curve's toe); 12 % puts the same light at 20 to 24 and the colour stays
  wall: [0.044, 0.143, 0.104],
  cream: [0.23, 0.195, 0.135],      // aged cream: frieze, ceiling, cornice, reveals
  blind: [0.40, 0.29, 0.17],      // pale wood slats
  white: [1, 1, 1],
});

// ---- merged-geometry builder ---------------------------------------------------------------------------------------------
class Builder {
  /** `atlas`: the light-map chart collector (room/lightmap.js), or null for a mesh that takes no baked light. */
  constructor(atlas = null) {
    this.p = []; this.n = []; this.uv = []; this.c = []; this.i = [];
    this.atlas = atlas; this.lmc = []; this.lmu = []; this.lmv = []; this.lmd = []; // chart, chart metres, depth, per vertex
    this.lmn = [];          // the normal the bake uses for the vertex (NaN = its own)
    this.flatRelief = false; // true: faces that lie on their wall (within FLAT_DEPTH of its plane) are baked as that wall
    this.side = []; this.sideNow = 0;
  }
  get count() { return this.p.length / 3; }
  vert(P, N, uv, col) {
    this.p.push(P.x, P.y, P.z); this.n.push(N.x, N.y, N.z); this.uv.push(uv[0], uv[1]); this.c.push(col[0], col[1], col[2]);
    this.lmc.push(-1); this.lmu.push(0); this.lmv.push(0); this.lmd.push(-1e9); this.lmn.push(NaN, NaN, NaN); this.side.push(this.sideNow);
    return this.count - 1;
  }
  /** Four points, counter-clockwise as seen from the lit side. `normals`: null (flat, from the winding) or four vectors. */
  quad(pts, uvs, cols = PAINT.white, normals = null) {
    let N = null;
    if (!normals) {
      N = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[3], pts[0]));
      if (N.lengthSq() < 1e-14) N.subVectors(pts[2], pts[1]).cross(new THREE.Vector3().subVectors(pts[0], pts[1]));
      N.normalize();
    }
    const perVert = Array.isArray(cols[0]);
    const ix = pts.map((P, k) => this.vert(P, normals ? normals[k] : N, uvs[k], perVert ? cols[k] : cols));
    this.i.push(ix[0], ix[1], ix[2], ix[0], ix[2], ix[3]);
    if (this.atlas) {
      // the light-map chart of this quad, from its geometric normal (smooth vertex normals do not decide where it is seen from)
      let G = N;
      if (!G) {
        G = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[3], pts[0]));
        if (G.lengthSq() < 1e-14) G.subVectors(pts[2], pts[1]).cross(new THREE.Vector3().subVectors(pts[0], pts[1]));
        G.normalize();
      }
      const r = this.atlas.classify(pts, G);
      if (r) for (let k = 0; k < 4; k++) { this.lmc[ix[k]] = r.chart; this.lmu[ix[k]] = r.uv[k][0]; this.lmv[ix[k]] = r.uv[k][1]; this.lmd[ix[k]] = r.depth[k]; }
      // relief that the map cannot hold: baked as the flat wall, shaded by its real normal (see the header)
      if (r?.plane && this.flatRelief && this.sideNow >= 1 && this.sideNow <= 4 && r.depth.every((d) => d > FLAT_DEPTH[0] && d < FLAT_DEPTH[1])) {
        for (let k = 0; k < 4; k++) { this.lmn[3 * ix[k]] = r.plane[0]; this.lmn[3 * ix[k] + 1] = r.plane[1]; this.lmn[3 * ix[k] + 2] = r.plane[2]; this.side[ix[k]] = this.sideNow + RELIEF.mark; }
      }
    }
  }
  /** Append a BufferGeometry under a matrix (primitives: lamp shades, knobs, arms). */
  addGeometry(geom, matrix, col = PAINT.white) {
    const base = this.count;
    const pos = geom.attributes.position, nor = geom.attributes.normal, uv = geom.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const P = new THREE.Vector3(), N = new THREE.Vector3();
    for (let k = 0; k < pos.count; k++) {
      P.fromBufferAttribute(pos, k).applyMatrix4(matrix);
      N.fromBufferAttribute(nor, k).applyMatrix3(nm).normalize();
      this.vert(P, N, uv ? [uv.getX(k), uv.getY(k)] : [0, 0], col);
    }
    if (geom.index) for (let k = 0; k < geom.index.count; k++) this.i.push(base + geom.index.getX(k));
    else for (let k = 0; k < pos.count; k++) this.i.push(base + k);
    geom.dispose();
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('roomSide', new THREE.Float32BufferAttribute(this.side, 1));
    if (this.atlas) {
      const lm = new Float32Array(this.count * 2);
      for (let k = 0; k < this.count; k++) {
        if (this.lmc[k] < 0) continue;
        const [s, t] = this.atlas.uv(this.lmc[k], this.lmu[k], this.lmv[k]);
        lm[2 * k] = s; lm[2 * k + 1] = t;
      }
      g.setAttribute('lm', new THREE.BufferAttribute(lm, 2));
      // for the bake tool only (never uploaded): the chart and the depth out of the chart plane, per vertex
      // (and the normal the bake uses where it is not the vertex's own: NaN = own)
      g.userData.lm = { chart: Int16Array.from(this.lmc), depth: Float32Array.from(this.lmd), normal: Float32Array.from(this.lmn) };
    }
    g.setIndex(this.i);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  mesh(material, name) {
    const m = new THREE.Mesh(this.geometry(), material);
    m.name = name;
    m.matrixAutoUpdate = false;
    return m;
  }
}

// ---- wall-frame helpers ----------------------------------------------------------------------------------------------------
const frame = (o, a) => ({ o, a, b: UP, t: new THREE.Vector3().crossVectors(UP, a).normalize() });
const P = (f, s, d, h) => V(0, 0, 0).copy(f.o).addScaledVector(f.t, s).addScaledVector(f.a, d).addScaledVector(f.b, h);
const tint = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

/** A quad in the wall plane at depth d. opts: { tile, grain: 'v' | 'h', col, uo, vo }: the texture's U (the wood's grain) runs up
 * the wall for 'v' and along it for 'h'. */
function wallQuad(B, f, s0, s1, h0, h1, d, { tile = 1, grain = 'v', col = PAINT.white, uo = 0, vo = 0 } = {}) {
  const uv = (s, h) => (grain === 'v' ? [h / tile + uo, s / tile + vo] : [s / tile + uo, h / tile + vo]);
  B.quad([P(f, s0, d, h0), P(f, s1, d, h0), P(f, s1, d, h1), P(f, s0, d, h1)], [uv(s0, h0), uv(s1, h0), uv(s1, h1), uv(s0, h1)], col);
}

/**
 * Extrude a profile (a polyline of [d, h] points, listed so that the lit side is on the right-hand normal (dh, -dd)) along the
 * frame's tangent from s0 to s1. Adjacent segments within `smooth` degrees share a normal (rounded sections shade round).
 */
function extrude(B, f, profile, s0, s1, { tile = 1, grain = 'h', col = PAINT.white, smooth = 55, vo = 0 } = {}) {
  const cosS = Math.cos((smooth * Math.PI) / 180);
  const segN = [];
  for (let k = 0; k < profile.length - 1; k++) {
    const dd = profile[k + 1][0] - profile[k][0], dh = profile[k + 1][1] - profile[k][1];
    const l = Math.hypot(dd, dh) || 1;
    segN.push([dh / l, -dd / l, l]);
  }
  const n3 = (nd, nh) => V(0, 0, 0).addScaledVector(f.a, nd).addScaledVector(f.b, nh).normalize();
  let arc = 0;
  for (let k = 0; k < segN.length; k++) {
    const [nd, nh, len] = segN[k];
    const prev = k > 0 ? segN[k - 1] : null, next = k < segN.length - 1 ? segN[k + 1] : null;
    const n0 = prev && prev[0] * nd + prev[1] * nh > cosS ? n3(prev[0] + nd, prev[1] + nh) : n3(nd, nh);
    const n1 = next && next[0] * nd + next[1] * nh > cosS ? n3(next[0] + nd, next[1] + nh) : n3(nd, nh);
    const [d0, h0] = profile[k], [d1, h1] = profile[k + 1];
    const uv = (s, a) => (grain === 'h' ? [s / tile, a / tile + vo] : [a / tile + vo, s / tile]);
    B.quad([P(f, s0, d0, h0), P(f, s1, d0, h0), P(f, s1, d1, h1), P(f, s0, d1, h1)],
      [uv(s0, arc), uv(s1, arc), uv(s1, arc + len), uv(s0, arc + len)], col, [n0, n0, n1, n1]);
    arc += len;
  }
}

/** Faces of a box in wall coordinates (s0..s1, h0..h1, d0..d1; d1 toward the room). faces: any of f l r t b. */
function boxFaces(B, f, s0, s1, h0, h1, d0, d1, faces = 'flrtb', opts = {}) {
  const { tile = 1, col = PAINT.white, grain = 'v' } = opts;
  const side = (pts, w, h) => B.quad(pts, grain === 'v' ? [[0, 0], [0, w / tile], [h / tile, w / tile], [h / tile, 0]] : [[0, 0], [w / tile, 0], [w / tile, h / tile], [0, h / tile]], col);
  if (faces.includes('f')) wallQuad(B, f, s0, s1, h0, h1, d1, opts);
  if (faces.includes('l')) side([P(f, s0, d0, h0), P(f, s0, d1, h0), P(f, s0, d1, h1), P(f, s0, d0, h1)], d1 - d0, h1 - h0);
  if (faces.includes('r')) side([P(f, s1, d1, h0), P(f, s1, d0, h0), P(f, s1, d0, h1), P(f, s1, d1, h1)], d1 - d0, h1 - h0);
  if (faces.includes('t')) side([P(f, s0, d1, h1), P(f, s1, d1, h1), P(f, s1, d0, h1), P(f, s0, d0, h1)], s1 - s0, d1 - d0);
  if (faces.includes('b')) side([P(f, s0, d0, h0), P(f, s1, d0, h0), P(f, s1, d1, h0), P(f, s0, d1, h0)], s1 - s0, d1 - d0);
}

// a quarter-round between two profile points, as intermediate points (convex = bulging toward the room)
function arcPts(c, r, a0, a1, n) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return out;
}

// ---- moulding profiles ([d, h], d out of the wall; listed bottom-to-top on the room side) ----------------------------
function skirtingProfile(d0) {
  // quarter-round shoe at the floor, flat face, ogee top
  return [
    [d0 + 0.036, 0], ...arcPts([d0 + 0.024, 0.008], 0.012, 0, Math.PI / 2, 4).slice(1),
    [d0 + 0.024, 0.100], [d0 + 0.0225, 0.112], [d0 + 0.017, 0.122], [d0 + 0.0125, 0.133], [d0 + 0.012, 0.146],
    ...arcPts([d0 + 0.006, 0.146], 0.006, 0, Math.PI / 2, 3).slice(1), [d0, 0.152],
  ];
}
function dadoProfile(d0, hTop) {
  // cove under a bull-nose cap, top falling back to the plaster
  const h = hTop;
  return [
    [d0, h - 0.070], [d0 + 0.004, h - 0.060], [d0 + 0.012, h - 0.050], [d0 + 0.024, h - 0.044], [d0 + 0.030, h - 0.042],
    [d0 + 0.030, h - 0.034], ...arcPts([d0 + 0.030, h - 0.019], 0.015, -Math.PI / 2, Math.PI / 2, 6).slice(1),
    [d0 + 0.012, h - 0.002], [0, h],
  ];
}
function pictureRailProfile(h) {
  return [
    [0, h], [0.008, h + 0.002], [0.016, h + 0.010], [0.020, h + 0.020],
    ...arcPts([0.020, h + 0.032], 0.012, -Math.PI / 2, Math.PI / 2, 5).slice(1), [0.010, h + 0.047], [0, h + 0.050],
  ];
}
function corniceProfile(H, size) {
  // a fillet, a concave cove, a fillet at the ceiling
  const r = size - 0.03;
  const cove = [];
  for (let k = 0; k <= 8; k++) { const a = (k / 8) * (Math.PI / 2); cove.push([0.012 + r - r * Math.cos(a), H - size + 0.012 + r * Math.sin(a) - 0.0]); }
  return [[0, H - size], [0.012, H - size], ...cove, [0.012 + r + 0.012, H - size + 0.012 + r], [0.012 + r + 0.012, H]];
}
function beamProfile(w, dep, c = 0.018) {
  // heights are relative to the ceiling (negative = below); from the -a side, under, up the +a side
  return [[-w / 2, 0], [-w / 2, -dep + c], [-w / 2 + c, -dep], [w / 2 - c, -dep], [w / 2, -dep + c], [w / 2, 0]];
}
function sillProfile(h0, out) {
  return [[0, h0 - 0.034], [out - 0.010, h0 - 0.034], ...arcPts([out - 0.010, h0 - 0.017], 0.017, -Math.PI / 2, Math.PI / 2, 6).slice(1), [0, h0]];
}

// ---- textures ----------------------------------------------------------------------------------------------------------------
/**
 * The shell's textures: procedural canvases, handed to club.assets.texture as fallbacks under the shared ids, so a downloaded
 * map replaces the stand-in in place when it arrives. Tile sizes (metres per repeat) and orientations are those of the
 * downloaded maps (web/assets/club/CREDITS.md): floor boards run along V, the panelling wood's grain along U. UVs are in tiles.
 */
export const TILE = Object.freeze({ floor: 1.7, wood: 2.0, wall: 3.0 });
// mean linear colour of the downloaded colour maps (measured from the shipped files; the stand-ins are made to the same means)
export const MAP_MEAN = Object.freeze({ floor: [0.205, 0.102, 0.040], wood: [0.188, 0.039, 0.010] });

const STAND_IN_AFTER_MS = 1200; // a map slower than this is stood in for until it lands

/**
 * The mean linear colour of a colour map as the page holds it: the image drawn into a 48 px 2D canvas, each pixel decoded
 * from sRGB, averaged. null without a document (node), without a decoded image, or for a flat placeholder (under 8 px).
 * (The bake keeps MAP_MEAN: it must hash the same in node, where no image is ever decoded.)
 */
function measuredMean(texture) {
  try {
    const im = texture?.image;
    const w = im?.naturalWidth || im?.videoWidth || im?.width || 0, h = im?.naturalHeight || im?.height || 0;
    if (typeof document === 'undefined' || !(w >= 8 && h >= 8)) return null;
    const N = 48;
    const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
    const c2 = cv.getContext('2d', { willReadFrequently: true });
    c2.drawImage(im, 0, 0, N, N);
    const d = c2.getImageData(0, 0, N, N).data;
    const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { sum[0] += lin(d[i]); sum[1] += lin(d[i + 1]); sum[2] += lin(d[i + 2]); }
    return sum.map((v) => v / (N * N));
  } catch { return null; }
}

function makeTextures(club, detail) {
  const size = detail === 0 ? 512 : 1024;
  // The stand-in canvases cost pixel loops, so a family is generated only when one of its maps is needed: no asset service,
  // a map missing from the manifest, a failed request, or a slow one. Until then a texture holds a flat placeholder.
  const lazy = (make) => { let v = null; return () => (v ??= make()); };
  const family = {
    floor: lazy(() => TEX.planks(size, TILE.floor)),
    wood: lazy(() => TEX.woodDark(size, TILE.wood)),
    wall: lazy(() => TEX.plaster(detail === 0 ? 256 : 512)),
  };
  const standIns = [];
  const asset = (id, fam, key, srgb, rgb) => {
    const placeholder = TEX.flat(...rgb);
    const t = TEX.canvasTexture(placeholder, { srgb });
    const standIn = () => {
      if (t.image !== placeholder) return;
      t.dispose(); // the size changes: the GPU texture, if one exists, must be made again
      t.image = family[fam]()[key]; t.needsUpdate = true;
      standIns.push(id);
    };
    const svc = club?.assets;
    if (typeof svc?.texture !== 'function' || typeof svc?.ready !== 'function') { standIn(); return t; }
    let out = null;
    try { out = svc.texture(id, { srgb, repeat: [1, 1], anisotropy: 8, fallback: t }); } catch { out = null; }
    if (out !== t) { if (!out) { standIn(); return t; } return out; }
    const failed = () => (svc.state?.().failed ?? []).some((f) => String(f).startsWith(`${id}:`));
    let settled = false;
    svc.ready([id]).then(() => {
      settled = true;
      if (failed()) standIn();
      else if (t.image !== placeholder) { t.dispose(); t.needsUpdate = true; } // the map landed over a texture of another size
    }, () => { settled = true; standIn(); });
    setTimeout(() => { if (!settled) standIn(); }, STAND_IN_AFTER_MS);
    return t;
  };
  const N = [128, 128, 255];
  // The lite room (detail 0) asks for three files, all 1024 px: the floor's colour and normal (its gloss shows the boards)
  // and the panelling's colour. Paint relief, the wood's normal and the three roughness maps are constants there: five
  // requests, five samplers and about 24 MB of texture memory less than the full room, on a small screen without a lens.
  // TIER LINES (owner: parity, CONTRACT 11.2). Which data maps the room binds comes from `club.knobs.roomMaps` (tiers.js):
  // 0 = the floor's normal only (the lite room); 1 = plus the floor's roughness and the panelling's normal (the base tier:
  // the panelling's normal is the scan the table's wood already uploads, so it costs the room nothing); 2 = all five.
  // Without the knob (a dev page) the room's detail decides as before. A map that is left out is a constant in the
  // material (the `roughness:` lines of buildShell follow the map's presence, not the detail).
  const maps = [0, 1, 2].includes(club?.knobs?.roomMaps) ? club.knobs.roomMaps : (detail >= 1 ? 2 : 0);
  return {
    standIns,
    floor: { map: asset('floor.color', 'floor', 'color', true, [125, 90, 56]), normalMap: asset('floor.normal', 'floor', 'normal', false, N), ...(maps >= 1 ? { roughnessMap: asset('floor.rough', 'floor', 'rough', false, [120, 120, 120]) } : {}) },
    wood: { map: asset('wood_dark.color', 'wood', 'color', true, [120, 56, 26]), ...(maps >= 1 ? { normalMap: asset('wood_dark.normal', 'wood', 'normal', false, N) } : {}), ...(maps >= 2 ? { roughnessMap: asset('wood_dark.rough', 'wood', 'rough', false, [160, 160, 160]) } : {}) },
    wall: maps >= 2 ? { normalMap: asset('wall.normal', 'wall', 'normal', false, N), roughnessMap: asset('wall.rough', 'wall', 'rough', false, [159, 159, 159]) } : {},
    night: TEX.canvasTexture(TEX.nightWindow(), { srgb: true }),
    shade: TEX.canvasTexture(TEX.lampShade(), { srgb: true }),
    glass: TEX.canvasTexture(TEX.doorGlass(), { srgb: true }),
  };
}

// ---- the shell --------------------------------------------------------------------------------------------------------------
/**
 * Build the shell. `box` = { min, max } interior box (world metres, min.y = the floor, max.y = the ceiling); `detail` 0 | 1 | 2
 * (club.knobs.roomDetail). Registers its emitters on `roomLight` and returns
 * { group, floor: { mesh, material }, emissives, layout, materials, counts() }.
 */
export function buildShell({ club = null, roomLight, box, detail = 1 }) {
  const x0 = box.min.x, x1 = box.max.x, z0 = box.min.z, z1 = box.max.z, F = box.min.y;
  const H = box.max.y - F; // room height
  const LX = x1 - x0, LZ = z1 - z0;
  const tex = makeTextures(club, detail);
  const full = detail >= 1;

  // walls, named by the side of the room they close (north = -z, east = +x, south = +z, west = -x)
  const walls = {
    north: { f: frame(V(x0, F, z0), V(0, 0, 1)), L: LX },
    east: { f: frame(V(x1, F, z0), V(-1, 0, 0)), L: LZ },
    south: { f: frame(V(x1, F, z1), V(0, 0, -1)), L: LX },
    west: { f: frame(V(x0, F, z1), V(1, 0, 0)), L: LZ },
  };
  const sN = (x) => x - x0, sE = (z) => z - z0, sS = (x) => x1 - x, sW = (z) => z1 - z;

  // openings and lamps (wall coordinates)
  const W = DIM.window, D = DIM.door;
  const windows = [-1.95, 1.95].map((x) => ({ wall: 'north', s0: sN(x) - W.w / 2, s1: sN(x) + W.w / 2, h0: W.h0, h1: W.h1 }));
  const doorC = sE(z1 - 0.94);
  const door = { wall: 'east', s0: doorC - D.w / 2, s1: doorC + D.w / 2, h0: 0, h1: D.h };
  // Wall lamps: FIXED spots (CONTRACT.md 8.6: the shell never moves or withdraws a lamp at run time; the spots are handed to
  // the props as reserved wall spans). They stand where the room's plan leaves the wall free by construction: clear of the
  // windows and the door, off the stretch of the foot (east) wall that the back bar and its sign take, and on the seams
  // between the 2 m bays in which the walls are dressed (x = +-1.02, +-3.06 on the long walls), so a lamp never sits in the
  // middle of a bay. The lite room keeps six of them (its light evaluates half as many emitters).
  const lampSpots = [
    ...[-3.06, 3.06].map((x) => ({ wall: 'north', s: sN(x), lite: true })),
    { wall: 'east', s: sE(z0 + 0.8), lite: true },
    ...[-3.06, 3.06].map((x) => ({ wall: 'south', s: sS(x), lite: true })),
    ...[-1.02, 1.02].map((x) => ({ wall: 'south', s: sS(x), lite: false })),
    { wall: 'west', s: sW(1.0), lite: true },
    { wall: 'west', s: sW(-3.4), lite: false },
  ];
  const sconces = lampSpots.filter((sc) => {
    if (!full && !sc.lite) return false;
    const L = walls[sc.wall].L;
    if (sc.s < 0.6 || sc.s > L - 0.6) return false;                                    // a room too small for this spot
    return ![...windows, door].some((o) => o.wall === sc.wall && sc.s > o.s0 - 0.42 && sc.s < o.s1 + 0.42);
  });
  const openingsOf = (name) => [...windows, door].filter((o) => o.wall === name).sort((a, b) => a.s0 - b.s0);

  // light-map charts: the floor, the ceiling and each wall are one planar chart; see room/lightmap.js createAtlas
  const SIDE = { north: 1, east: 2, south: 3, west: 4 };
  const atlas = createAtlas({ size: LM_SIZE });
  atlas.group('floor', { kind: 'floor', o: [x0, F, z0], u: [1, 0, 0], v: [0, 0, 1], n: [0, 1, 0], w: LX, h: LZ });
  atlas.group('ceil', { kind: 'ceil', o: [x0, F + H, z0], u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0], w: LX, h: LZ });
  for (const [name, { f, L }] of Object.entries(walls)) {
    atlas.group(`wall:${name}`, { kind: 'wall', o: f.o.toArray(), u: f.t.toArray(), v: [0, 1, 0], n: f.a.toArray(), w: L, h: H });
  }
  const plaster = new Builder(atlas), wood = new Builder(atlas), floorB = new Builder(atlas);
  wood.flatRelief = true;
  const night = new Builder(), glass = new Builder();
  /** Everything built from here on belongs to this wall (light-map chart and hide side). */
  const onWall = (name) => { atlas.use(`wall:${name}`); for (const b of [plaster, wood, night, glass]) b.sideNow = SIDE[name]; };
  const woodOpts = (grain, k = 1, extra = {}) => ({ tile: TILE.wood, grain, col: tint(PAINT.white, k), ...extra });
  let seedN = 1;
  const rnd = () => { seedN = (seedN * 16807) % 2147483647; return seedN / 2147483647; };

  // ---- floor: one quad, UVs in tiles; the boards (the texture's V) run along x, the table's long axis
  atlas.use('floor');
  floorB.quad([V(x0, F, z0), V(x0, F, z1), V(x1, F, z1), V(x1, F, z0)],
    [[z0 / TILE.floor, x0 / TILE.floor], [z1 / TILE.floor, x0 / TILE.floor], [z1 / TILE.floor, x1 / TILE.floor], [z0 / TILE.floor, x1 / TILE.floor]]);

  // ---- per wall: plaster, wainscot, mouldings
  const hRail = DIM.pictureRail;
  for (const [name, { f, L }] of Object.entries(walls)) {
    const ops = openingsOf(name);
    onWall(name);
    // plaster: green from the dado to the picture rail, cream frieze above
    const band = (s0, s1, h0, h1) => {
      if (s1 - s0 < 1e-4 || h1 - h0 < 1e-4) return;
      const o = { tile: TILE.wall };
      if (h0 < hRail && h1 > hRail) {
        wallQuad(plaster, f, s0, s1, h0, hRail, 0, { ...o, col: PAINT.wall });
        wallQuad(plaster, f, s0, s1, hRail, h1, 0, { ...o, col: PAINT.cream });
      } else wallQuad(plaster, f, s0, s1, h0, h1, 0, { ...o, col: h0 >= hRail ? PAINT.cream : PAINT.wall });
    };
    const hBase = DIM.wainscotTop;
    let cur = 0;
    for (const o of ops) {
      band(cur, o.s0, hBase, H);
      if (o.h0 > hBase) band(o.s0, o.s1, hBase, o.h0);
      band(o.s0, o.s1, o.h1, H);
      cur = o.s1;
    }
    band(cur, L, hBase, H);

    // wainscot runs between door openings
    const runs = [];
    cur = 0;
    for (const o of ops.filter((q) => q.h0 === 0)) { runs.push([cur, o.s0 - 0.10]); cur = o.s1 + 0.10; }
    runs.push([cur, L]);
    for (const [ra, rb] of runs) {
      if (rb - ra < 0.05) continue;
      const fd = DIM.frameD;
      if (!full) {
        wallQuad(wood, f, ra, rb, 0, DIM.wainscotTop, fd, woodOpts('v'));
      } else {
        const n = Math.max(1, Math.round((rb - ra) / 0.62));
        const bay = (rb - ra) / n, st = 0.046; // half a stile
        const hb0 = DIM.skirtingH - 0.01, hb1 = 0.275, ht0 = 0.955, ht1 = DIM.wainscotTop;
        for (let k = 0; k < n; k++) {
          const a = ra + k * bay, b = a + bay;
          const uo = rnd(), vo = rnd();
          wallQuad(wood, f, a, a + st, hb0, ht1, fd, woodOpts('v', 0.96, { uo, vo }));               // stiles
          wallQuad(wood, f, b - st, b, hb0, ht1, fd, woodOpts('v', 0.96, { uo, vo }));
          wallQuad(wood, f, a + st, b - st, hb0, hb1, fd, woodOpts('h', 0.92, { uo: vo, vo: uo }));    // rails
          wallQuad(wood, f, a + st, b - st, ht0, ht1, fd, woodOpts('h', 0.92, { uo: vo, vo: uo }));
          // recessed panel: four bevels down to a field 11 mm behind the frame, a baked shade in the recess
          const pa = a + st, pb = b - st, bw = 0.020, pd = fd - 0.011;
          const lit = tint(PAINT.white, 1.0 + 0.10 * (rnd() - 0.5)), shade = tint(PAINT.white, 0.62);
          const uvp = (s, h) => [h / TILE.wood + uo * 3, s / TILE.wood + vo * 3];
          const q = (pts, cols) => wood.quad(pts.map(([s, d, h]) => P(f, s, d, h)), pts.map(([s, , h]) => uvp(s, h)), cols);
          q([[pa, fd, hb1], [pb, fd, hb1], [pb - bw, pd, hb1 + bw], [pa + bw, pd, hb1 + bw]], [shade, shade, lit, lit]);   // bottom bevel
          q([[pa + bw, pd, ht0 - bw], [pb - bw, pd, ht0 - bw], [pb, fd, ht0], [pa, fd, ht0]], [lit, lit, shade, shade]);   // top bevel
          q([[pa, fd, hb1], [pa + bw, pd, hb1 + bw], [pa + bw, pd, ht0 - bw], [pa, fd, ht0]], [shade, lit, lit, shade]);   // left bevel
          q([[pb - bw, pd, hb1 + bw], [pb, fd, hb1], [pb, fd, ht0], [pb - bw, pd, ht0 - bw]], [lit, shade, shade, lit]);   // right bevel
          q([[pa + bw, pd, hb1 + bw], [pb - bw, pd, hb1 + bw], [pb - bw, pd, ht0 - bw], [pa + bw, pd, ht0 - bw]], lit);    // field
        }
      }
      extrude(wood, f, skirtingProfile(DIM.frameD), ra, rb, woodOpts('h', 0.85));
      extrude(wood, f, dadoProfile(DIM.frameD, DIM.dadoTop), ra, rb, woodOpts('h', 0.9, { vo: 0.37 }));
    }
    // picture rail (dark wood) and cove cornice (cream plaster), full length
    extrude(wood, f, pictureRailProfile(hRail), 0, L, woodOpts('h', 0.8, { vo: 0.71 }));
    extrude(plaster, f, corniceProfile(H, DIM.cornice), 0, L, { tile: TILE.wall, col: PAINT.cream, grain: 'v', smooth: 40 });
  }

  // ---- ceiling: cream cells between the beams, each with a baked shade toward the beams
  const BM = DIM.beam;
  const beamsX = [-4.8, -2.4, 0, 2.4].filter((z) => z > z0 + 0.6 && z < z1 - 0.6);   // main beams, running along x
  const beamsZ = [-2.75, 0, 2.75].filter((x) => x > x0 + 0.6 && x < x1 - 0.6);       // cross beams, running along z
  {
    atlas.use('ceil');
    plaster.sideNow = wood.sideNow = 5;
    const xs = [x0, ...beamsZ, x1], zs = [z0, ...beamsX, z1];
    // `dark`: a painted shade toward the beams. A baked map holds the real one, so these vertices are marked (UNSHADE) and
    // the map variant of the shader takes the paint off again.
    const Y = F + H, ao = 0.16, dark = tint(PAINT.cream, UNSHADE.factor), lit = PAINT.cream;
    const cells0 = plaster.count;
    const uv = (x, z) => [x / TILE.wall, z / TILE.wall];
    const cq = (pts, cols) => plaster.quad(pts.map(([x, z]) => V(x, Y, z)), pts.map(([x, z]) => uv(x, z)), cols);
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < zs.length - 1; j++) {
        const xa = xs[i] + (i > 0 ? BM.crossW / 2 : 0), xb = xs[i + 1] - (i < xs.length - 2 ? BM.crossW / 2 : 0);
        const za = zs[j] + (j > 0 ? BM.mainW / 2 : 0), zb = zs[j + 1] - (j < zs.length - 2 ? BM.mainW / 2 : 0);
        const ia = xa + ao, ib = xb - ao, ja = za + ao, jb = zb - ao;
        cq([[ia, ja], [ib, ja], [ib, jb], [ia, jb]], lit);
        cq([[xa, za], [xb, za], [ib, ja], [ia, ja]], [dark, dark, lit, lit]);
        cq([[ia, jb], [ib, jb], [xb, zb], [xa, zb]], [lit, lit, dark, dark]);
        cq([[xa, za], [ia, ja], [ia, jb], [xa, zb]], [dark, lit, lit, dark]);
        cq([[ib, ja], [xb, za], [xb, zb], [ib, jb]], [lit, dark, dark, lit]);
      }
    }
    for (let k = cells0; k < plaster.count; k++) if (plaster.c[3 * k] === dark[0] && plaster.c[3 * k + 1] === dark[1]) plaster.side[k] = 5 + UNSHADE.mark;
    // beams: chamfered, no top face; main beams deeper than the cross beams
    for (const z of beamsX) {
      const bf = { o: V(x0, Y, z), t: V(1, 0, 0), a: V(0, 0, 1), b: UP };
      extrude(wood, bf, beamProfile(BM.mainW, BM.mainD), 0, LX, woodOpts('h', BEAM_TINT, { smooth: 30, vo: rnd() }));
    }
    for (const x of beamsZ) {
      const bf = { o: V(x, Y, z1), t: V(0, 0, -1), a: V(1, 0, 0), b: UP };
      extrude(wood, bf, beamProfile(BM.crossW, BM.crossD), 0, LZ, woodOpts('h', BEAM_TINT, { smooth: 30, vo: rnd() }));
    }
  }

  // ---- windows: reveal, night view, sash, blind, sill board, casing
  const emitters = [];
  for (const w of windows) {
    const { f } = walls[w.wall];
    onWall(w.wall);
    const rv = -W.reveal, cream = PAINT.cream, shadeC = tint(PAINT.cream, 0.7);
    const rq = (pts, cols) => plaster.quad(pts.map(([s, d, h]) => P(f, s, d, h)), pts.map(([s, d, h]) => [(s + d) / TILE.wall, (h + d) / TILE.wall]), cols);
    rq([[w.s0, 0, w.h0], [w.s1, 0, w.h0], [w.s1, rv, w.h0], [w.s0, rv, w.h0]], [cream, cream, shadeC, shadeC]);       // sill (faces up)
    rq([[w.s0, rv, w.h1], [w.s1, rv, w.h1], [w.s1, 0, w.h1], [w.s0, 0, w.h1]], [shadeC, shadeC, cream, cream]);       // head (faces down)
    rq([[w.s0, 0, w.h0], [w.s0, rv, w.h0], [w.s0, rv, w.h1], [w.s0, 0, w.h1]], [cream, shadeC, shadeC, cream]);       // left jamb (faces +t)
    rq([[w.s1, rv, w.h0], [w.s1, 0, w.h0], [w.s1, 0, w.h1], [w.s1, rv, w.h1]], [shadeC, cream, cream, shadeC]);       // right jamb (faces -t)
    night.quad([P(f, w.s0, rv, w.h0), P(f, w.s1, rv, w.h0), P(f, w.s1, rv, w.h1), P(f, w.s0, rv, w.h1)], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    // sash: outer frame, meeting rail, glazing bars
    const sd = rv + 0.05, fr = 0.055, bar = 0.022, mid = (w.h0 + w.h1) / 2, sc = (w.s0 + w.s1) / 2;
    const sash = (s0, s1, h0, h1, k = 0.7) => boxFaces(wood, f, s0, s1, h0, h1, sd - 0.03, sd, 'f', woodOpts('v', k));
    sash(w.s0, w.s0 + fr, w.h0, w.h1); sash(w.s1 - fr, w.s1, w.h0, w.h1);
    boxFaces(wood, f, w.s0 + fr, w.s1 - fr, w.h0, w.h0 + fr, sd - 0.03, sd, 'ft', woodOpts('h', 0.7));
    boxFaces(wood, f, w.s0 + fr, w.s1 - fr, w.h1 - fr, w.h1, sd - 0.03, sd, 'fb', woodOpts('h', 0.7));
    boxFaces(wood, f, w.s0 + fr, w.s1 - fr, mid - 0.025, mid + 0.025, sd - 0.03, sd + 0.012, 'ftb', woodOpts('h', 0.7));
    if (full) {
      sash(sc - bar / 2, sc + bar / 2, w.h0 + fr, w.h1 - fr);
      for (const hq of [(w.h0 + fr + mid) / 2, (mid + w.h1 - fr) / 2]) boxFaces(wood, f, w.s0 + fr, w.s1 - fr, hq - bar / 2, hq + bar / 2, sd - 0.03, sd, 'f', woodOpts('h', 0.7));
      // venetian blind lowered over the upper sash: head rail, tilted slats, bottom rail
      const bd = -0.055, hLow = w.h0 + 0.46 * (w.h1 - w.h0), pitch = 0.034;
      boxFaces(plaster, f, w.s0 + 0.01, w.s1 - 0.01, w.h1 - 0.045, w.h1, bd - 0.025, bd + 0.025, 'fb', { col: tint(PAINT.blind, 0.8) });
      for (let h = w.h1 - 0.06; h > hLow; h -= pitch) {
        const top = [[w.s0 + 0.012, bd - 0.016, h + 0.010], [w.s1 - 0.012, bd - 0.016, h + 0.010], [w.s1 - 0.012, bd + 0.016, h - 0.010], [w.s0 + 0.012, bd + 0.016, h - 0.010]];
        const k = 0.85 + 0.3 * rnd();
        // `top` as listed faces down and toward the glass; its mirror faces up and into the room
        plaster.quad([top[1], top[0], top[3], top[2]].map(([s, d, hh]) => P(f, s, d, hh)), [[0, 0], [1, 0], [1, 0.02], [0, 0.02]], tint(PAINT.blind, k));
        plaster.quad(top.map(([s, d, hh]) => P(f, s, d, hh - 0.002)), [[0, 0], [1, 0], [1, 0.02], [0, 0.02]], tint(PAINT.blind, k * 0.55));
      }
      boxFaces(plaster, f, w.s0 + 0.01, w.s1 - 0.01, hLow - 0.022, hLow, bd - 0.014, bd + 0.014, 'ftb', { col: tint(PAINT.blind, 0.8) });
    }
    // sill board with a bull nose, casing with a small back band
    extrude(wood, f, sillProfile(w.h0, 0.062), w.s0 - 0.075, w.s1 + 0.075, woodOpts('h', 0.85));
    boxFaces(wood, f, w.s0 - 0.075, w.s1 + 0.075, w.h0 - 0.034, w.h0, 0, 0.062, 'lr', woodOpts('v', 0.75));
    const cw = 0.09, cd = 0.026;
    boxFaces(wood, f, w.s0 - cw, w.s0, w.h0, w.h1 + cw, 0, cd, 'flr', woodOpts('v', 0.9));
    boxFaces(wood, f, w.s1, w.s1 + cw, w.h0, w.h1 + cw, 0, cd, 'flr', woodOpts('v', 0.9));
    boxFaces(wood, f, w.s0, w.s1, w.h1, w.h1 + cw, 0, cd, 'fb', woodOpts('h', 0.9));
    // the night's cool spill into the room (the lite room evaluates half as many emitters: there it is part of the ambient)
    if (full) emitters.push({ id: `shell.window.${emitters.length}`, type: 'rect', position: P(f, (w.s0 + w.s1) / 2, -0.02, (w.h0 + w.h1) / 2),
      normal: f.a.clone(), axis: f.t.clone(), size: [W.w, w.h1 - w.h0], color: new THREE.Color(0.42, 0.56, 1.0), intensity: 0.22, radius: 4.5 });
  }

  // ---- door: jambs, a half-glazed leaf, casing, knob
  {
    const { f } = walls[door.wall];
    onWall(door.wall);
    const dv = -D.reveal, s0 = door.s0, s1 = door.s1, h1 = door.h1;
    const jq = (pts, k) => wood.quad(pts.map(([s, d, h]) => P(f, s, d, h)), pts.map(([s, d, h]) => [h / TILE.wood, (s + d) / TILE.wood]), tint(PAINT.white, k));
    jq([[s0, 0, 0], [s0, dv, 0], [s0, dv, h1], [s0, 0, h1]], 0.7);       // left jamb (faces +t)
    jq([[s1, dv, 0], [s1, 0, 0], [s1, 0, h1], [s1, dv, h1]], 0.7);       // right jamb (faces -t)
    jq([[s0, dv, h1], [s1, dv, h1], [s1, 0, h1], [s0, 0, h1]], 0.6);     // head (faces down)
    // leaf: stiles and rails
    const stw = 0.11, lock0 = 0.94, lock1 = 1.08, bot = 0.20, topR = h1 - 0.115, sc = (s0 + s1) / 2, mun = 0.045;
    const leaf = (a, b, ha, hb, grain) => wallQuad(wood, f, a, b, ha, hb, dv, woodOpts(grain, 0.95, { uo: rnd(), vo: rnd() }));
    leaf(s0, s0 + stw, 0, h1, 'v'); leaf(s1 - stw, s1, 0, h1, 'v');
    leaf(s0 + stw, s1 - stw, 0, bot, 'h'); leaf(s0 + stw, s1 - stw, lock0, lock1, 'h'); leaf(s0 + stw, s1 - stw, topR, h1, 'h');
    leaf(sc - mun, sc + mun, bot, lock0, 'v'); leaf(sc - mun, sc + mun, lock1, topR, 'v');
    const panel = (a, b, ha, hb, glazed) => {
      const bw = 0.018, pd = dv - 0.012, lit = tint(PAINT.white, 1.0), shade = tint(PAINT.white, 0.6);
      const uo = rnd() * 3, vo = rnd() * 3;
      const q = (pts, cols) => wood.quad(pts.map(([s, d, h]) => P(f, s, d, h)), pts.map(([s, , h]) => [h / TILE.wood + uo, s / TILE.wood + vo]), cols);
      q([[a, dv, ha], [b, dv, ha], [b - bw, pd, ha + bw], [a + bw, pd, ha + bw]], [shade, shade, lit, lit]);
      q([[a + bw, pd, hb - bw], [b - bw, pd, hb - bw], [b, dv, hb], [a, dv, hb]], [lit, lit, shade, shade]);
      q([[a, dv, ha], [a + bw, pd, ha + bw], [a + bw, pd, hb - bw], [a, dv, hb]], [shade, lit, lit, shade]);
      q([[b - bw, pd, ha + bw], [b, dv, ha], [b, dv, hb], [b - bw, pd, hb - bw]], [lit, shade, shade, lit]);
      if (glazed) glass.quad([P(f, a + bw, pd, ha + bw), P(f, b - bw, pd, ha + bw), P(f, b - bw, pd, hb - bw), P(f, a + bw, pd, hb - bw)], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      else q([[a + bw, pd, ha + bw], [b - bw, pd, ha + bw], [b - bw, pd, hb - bw], [a + bw, pd, hb - bw]], lit);
    };
    panel(s0 + stw, sc - mun, bot, lock0, false); panel(sc + mun, s1 - stw, bot, lock0, false);
    panel(s0 + stw, sc - mun, lock1, topR, true); panel(sc + mun, s1 - stw, lock1, topR, true);
    // casing, proud of the wainscot, with plinth blocks
    const cw = 0.10, cd = 0.07;
    boxFaces(wood, f, s0 - cw, s0, 0, h1 + cw, 0, cd, 'flr', woodOpts('v', 0.9));
    boxFaces(wood, f, s1, s1 + cw, 0, h1 + cw, 0, cd, 'flr', woodOpts('v', 0.9));
    boxFaces(wood, f, s0, s1, h1, h1 + cw, 0, cd, 'fb', woodOpts('h', 0.9));
    boxFaces(wood, f, s0 - cw - 0.006, s0 + 0.004, 0, 0.19, 0, cd + 0.01, 'flrt', woodOpts('v', 0.8));
    boxFaces(wood, f, s1 - 0.004, s1 + cw + 0.006, 0, 0.19, 0, cd + 0.01, 'flrt', woodOpts('v', 0.8));
  }

  // ---- brass and lamps: the door knob and rose, and per wall lamp a back plate, a swept arm, a cup, a fabric shade open top
  // and bottom, and the bulb
  atlas.use(null);
  // A wall lamp's light (round 2): a fabric shade is a source about 0.2 m across, open below and above. The wider source
  // (size[0]: the near-field cap) turns the tight hot spot behind the shade into a wash that still reads 1.5 m down the
  // wainscot and up the frieze; the level is set so the pool's core on the green wall stays under the played cloth (measured
  // in the app at V9 with source 0.70: the core reached the cloth's luma, 117 against 112 of 255; 0.85 takes a quarter off the
  // core and leaves the wash beyond 1 m as it was).
  const lampEmitter = (k) => {
    const sc = sconces[k], { f } = walls[sc.wall];
    return { id: `shell.sconce.${k}`, type: 'point', position: P(f, sc.s, DIM.sconceOut + 0.02, DIM.sconceH + 0.02),
      color: new THREE.Color(1.0, 0.62, 0.30), intensity: SCONCE.intensity, radius: SCONCE.reach, size: [SCONCE.source, SCONCE.beam], axis: V(0, SCONCE.up ? 1 : -1, 0) };
  };
  function lampGeometries() {
    const brass = new Builder(), shades = new Builder(), bulbs = new Builder();
    const rotX = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    // TIER LINES (owner: parity, CONTRACT 11.2). Tessellation of the wall lamps and the door knob by `club.knobs.roomRound`
    // (tiers.js): 2 = the full room's counts (high), 1 = the reduced counts of the lite and base tiers (the fittings are a
    // few centimetres across and metres from every view: on base 5 708 brass triangles became 2 124 and 1 512 bulb
    // triangles 324; the shade, the part whose outline shows, keeps 16 sides), 0 = round 2's lite counts. Without the knob
    // the room's detail decides as before. Shapes, sizes and places are untouched.
    const round = [0, 1, 2].includes(club?.knobs?.roomRound) ? club.knobs.roomRound : (full ? 2 : 0);
    const RND = round === 1
      ? { plate: 12, shade: 16, tube: 8, tubeR: 5, ball: [6, 4], bulb: [6, 4], cone: 8, stem: 5, knob: [12, 8, 10, 6] }
      : { plate: round === 2 ? 24 : 12, shade: round === 2 ? 24 : 12, tube: round === 2 ? 14 : 8, tubeR: 8, ball: [12, 8], bulb: [12, 8], cone: 14, stem: 8, knob: [20, 12, 18, 12] };
    {
      const { f } = walls[door.wall];
      brass.sideNow = SIDE[door.wall];
      const dv = -D.reveal, s1 = door.s1;
      const basis = new THREE.Matrix4().makeBasis(f.t, f.b, f.a);
      const at = (s, d, h) => new THREE.Matrix4().copy(basis).setPosition(P(f, s, d, h));
      brass.addGeometry(new THREE.CylinderGeometry(0.027, 0.027, 0.006, RND.knob[0]), at(s1 - 0.058, dv + 0.003, 1.01).multiply(rotX));
      brass.addGeometry(new THREE.CylinderGeometry(0.009, 0.011, 0.035, RND.knob[1]), at(s1 - 0.058, dv + 0.022, 1.01).multiply(rotX));
      brass.addGeometry(new THREE.SphereGeometry(0.026, RND.knob[2], RND.knob[3]), at(s1 - 0.058, dv + 0.052, 1.01).scale(V(1, 1, 0.8)));
    }
    for (const sc of sconces) {
      const { f } = walls[sc.wall];
      brass.sideNow = shades.sideNow = bulbs.sideNow = SIDE[sc.wall];
      const h = DIM.sconceH, out = DIM.sconceOut;
      const basis = new THREE.Matrix4().makeBasis(f.t, f.b, f.a);
      const at = (dx, dy, dz) => new THREE.Matrix4().copy(basis).setPosition(P(f, sc.s + dx, dz, h + dy));
      brass.addGeometry(new THREE.CylinderGeometry(0.048, 0.052, 0.012, RND.plate), at(0, -0.10, 0.006).multiply(rotX));
      brass.addGeometry(new THREE.SphereGeometry(0.020, RND.ball[0], RND.ball[1]), at(0, -0.10, 0.018));
      const curve = new THREE.CatmullRomCurve3([V(0, -0.10, 0.012), V(0, -0.125, 0.07), V(0, -0.12, out - 0.01), V(0, -0.085, out)]);
      brass.addGeometry(new THREE.TubeGeometry(curve, RND.tube, 0.0065, RND.tubeR, false), at(0, 0, 0));
      brass.addGeometry(new THREE.CylinderGeometry(0.026, 0.012, 0.03, RND.cone), at(0, -0.07, out));
      brass.addGeometry(new THREE.CylinderGeometry(0.008, 0.008, 0.05, RND.stem), at(0, -0.035, out));
      // the shade flares toward the side the lamp opens to (SCONCE.up: an uplighter's shade is a cone that opens upward)
      shades.addGeometry(new THREE.CylinderGeometry(SCONCE.up ? 0.092 : 0.058, SCONCE.up ? 0.058 : 0.092, 0.165, RND.shade, 1, true), at(0, 0.02, out));
      bulbs.addGeometry(new THREE.SphereGeometry(0.022, RND.bulb[0], RND.bulb[1]), at(0, 0.005, out).scale(V(1, 1.5, 1)));
    }
    return { brass: brass.geometry(), shades: shades.geometry(), bulbs: bulbs.geometry() };
  }
  for (let k = 0; k < sconces.length; k++) emitters.push(lampEmitter(k));

  // ---- materials (all through the room light) and meshes
  const mats = {
    // (roughness: a surface without its roughness map — tiers.js `roomMaps`, parity's tier line — takes a constant: the
    // full room's value times its map's mean. The selector follows the map's presence; the values are the room's.)
    // `lightmap`: the material takes the baked map when the room has one ('spec' keeps the emitters' highlights on gloss);
    // `hide`: it drops a side of the room while the camera is behind that side
    floor: roomLight.material({ name: 'club.room.floor', ...tex.floor, color: new THREE.Color(1.275, 1.2, 1.14), roughness: tex.floor.roughnessMap ? 0.64 : 0.30, normalScale: 0.8, envMapIntensity: 0.32, tableShadow: true, lightmap: 'spec', hide: true }),
    plaster: roomLight.material({ name: 'club.room.plaster', ...tex.wall, roughness: tex.wall.roughnessMap ? 1.0 : 0.62, normalScale: 0.28, vertexColors: true, envMapIntensity: 0.02, lightmap: true, hide: true }),
    // (the colour is a multiplier over a dark, very red scan, mean linear 0.19 / 0.04 / 0.01: above 1 on green and blue it turns
    // the panelling from black-red into a mahogany that still reads away from a lamp; no texel of the product reaches 1.
    // Round 3: (1.25, 1.6, 2.0) -> (1.75, 2.1, 2.5): with the wall lamps opening upward the wainscot takes less of them, and
    // at round 2's tint it sat at 7 to 10 of 255 between the lamps in the app (V9, V10), under the tone curve's toe)
    wood: roomLight.material({ name: 'club.room.wood', ...tex.wood, color: new THREE.Color(1.75, 2.1, 2.5), roughness: tex.wood.roughnessMap ? 0.66 : 0.42, normalScale: 0.6, vertexColors: true, envMapIntensity: 0.10, lightmap: 'spec', hide: true, relief: true }),
    brass: roomLight.material({ name: 'club.room.brass', color: new THREE.Color(0.80, 0.56, 0.22), roughness: 0.3, metalness: 1.0, envMapIntensity: 1.0, hide: true }),
    shade: roomLight.emissive({ name: 'club.room.lampshade', color: new THREE.Color(1.0, 0.80, 0.52), intensity: 2.4, map: tex.shade, side: THREE.DoubleSide, hide: true }),
    bulb: roomLight.emissive({ name: 'club.room.lampbulb', color: new THREE.Color(1.0, 0.82, 0.55), intensity: 12, hide: true }),
    night: roomLight.emissive({ name: 'club.room.night', color: new THREE.Color(1, 1, 1), intensity: 1.5, map: tex.night, hide: true }),
    glass: roomLight.emissive({ name: 'club.room.doorglass', color: new THREE.Color(1.0, 0.84, 0.62), intensity: 0.62, map: tex.glass, hide: true }),
  };
  const group = new THREE.Group();
  group.name = 'clubRoomShell';
  const named = (geometry, material, name) => { const m = new THREE.Mesh(geometry, material); m.name = name; m.matrixAutoUpdate = false; return m; };
  const lamps0 = lampGeometries();
  const meshes = {
    floor: floorB.mesh(mats.floor, 'clubRoomFloor'),
    plaster: plaster.mesh(mats.plaster, 'clubRoomPlaster'),
    wood: wood.mesh(mats.wood, 'clubRoomWood'),
    brass: named(lamps0.brass, mats.brass, 'clubRoomBrass'),
    shades: named(lamps0.shades, mats.shade, 'clubRoomLampShades'),
    bulbs: named(lamps0.bulbs, mats.bulb, 'clubRoomLampBulbs'),
    night: night.mesh(mats.night, 'clubRoomNight'),
    glass: glass.mesh(mats.glass, 'clubRoomDoorGlass'),
  };
  for (const m of Object.values(meshes)) group.add(m);
  for (const e of emitters) roomLight.addEmitter(e);

  // what the shell occupies on the walls, in world metres (for whoever dresses the walls)
  const span = (o) => {
    const { f } = walls[o.wall];
    const a = P(f, o.s0, 0, o.h0), b = P(f, o.s1, 0, o.h1);
    return { wall: o.wall, min: [Math.min(a.x, b.x), a.y, Math.min(a.z, b.z)], max: [Math.max(a.x, b.x), b.y, Math.max(a.z, b.z)] };
  };
  const layout = {
    walls: Object.fromEntries(Object.entries(walls).map(([k, w]) => [k, { origin: w.f.o.toArray(), tangent: w.f.t.toArray(), normal: w.f.a.toArray(), length: w.L }])),
    door: span(door),
    windows: windows.map(span),
    sconces: sconces.map((sc) => ({ wall: sc.wall, on: true, position: P(walls[sc.wall].f, sc.s, DIM.sconceOut, DIM.sconceH).toArray(), normal: walls[sc.wall].f.a.toArray(), tangent: walls[sc.wall].f.t.toArray() })),
    heights: { wainscot: DIM.dadoTop, pictureRail: DIM.pictureRail, ceiling: H },
    beams: { alongX: beamsX, alongZ: beamsZ, depth: BM.mainD },
  };
  const counts = () => {
    let triangles = 0;
    for (const m of Object.values(meshes)) triangles += m.geometry.index.count / 3;
    return { meshes: Object.keys(meshes).length, triangles, emitters: emitters.length, lamps: sconces.length, lightmapCharts: atlas.count, standInTextures: tex.standIns.slice() };
  };
  // the planes of the six sides, room coordinates: xyz = the inward normal, w so that dot(n, p) + w > 0 inside the room
  // (index = the `roomSide` attribute; 0, the floor, is never dropped)
  const sides = [
    [0, 0, 0, 1], [0, 0, 1, -z0], [-1, 0, 0, x1], [0, 0, -1, z1], [1, 0, 0, -x0], [0, -1, 0, F + H],
  ];
  // the floor's mean diffuse colour, linear: its tint times the mean of the colour map the page actually holds (measured once
  // the image is there; MAP_MEAN, the same measurement made offline on the shipped file, until then and where no image is
  // ever decoded). Read live: a tint set later (tools) and a map that lands late both show.
  const floorMean = { value: MAP_MEAN.floor.slice(), from: 'MAP_MEAN (the shipped file, measured offline)', image: null };
  const floorAlbedo = () => {
    const im = mats.floor.map?.image ?? null;
    if (im && im !== floorMean.image) {
      const m = measuredMean(mats.floor.map);
      if (m) { floorMean.value = m; floorMean.from = `the colour map in use (${im.naturalWidth || im.width} px)`; floorMean.image = im; }
    }
    const c = mats.floor.color, m = floorMean.value;
    return [c.r * m[0], c.g * m[1], c.b * m[2]];
  };
  return {
    group, floor: { mesh: meshes.floor, material: mats.floor, get albedo() { return floorAlbedo(); }, albedoState: () => ({ albedo: floorAlbedo(), mapMean: floorMean.value.slice(), from: floorMean.from, tint: mats.floor.color.toArray() }) },
    emissives: [meshes.shades, meshes.bulbs, meshes.night, meshes.glass],
    layout, materials: mats, meshes, counts, lampCount: sconces.length, sides,
    // the second UV set: atlas size, texel scale and every chart rectangle (the bake tool and the signature read it)
    lightmap: atlas.info(), lightmapMeshes: [meshes.floor, meshes.plaster, meshes.wood],
  };
}
