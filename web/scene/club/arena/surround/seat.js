// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/surround/seat.js — the real seat of the arena's high tier as two small geometries (owner: surround): the BACK (a
// moulded shell with an upholstered pad) and the PAN (tipped up: its moulded underside toward the hall, its upholstered top
// toward the back). surround.js draws each as ONE instanced mesh for every seat of the hall, with a per-seat matrix from
// plan.js planSeats (the pan's fold, the back's lean and turn: a fixed seed), and merges the standards, armrests and hinge
// bars, which do not move, into its static batches. An EMPTY, folded seat: nothing sits on it, nothing lies on it.
//
// Frames (metres). Back: the origin is the middle of its lower edge, +y runs up the back, +z is its front (the pad). Pan:
// the origin is its pivot, +z runs to its front lip, +y is its upholstered top (the seat is drawn DOWN here; the instance
// matrix tips it up). Colours are per-vertex LINEAR rgb: the fabric's colour (levels.js SEAT_COLOR) with the shade a seat
// throws on itself (the pad behind the tipped-up pan, the underside toward the hinge), the shells' black. The back's
// material carries the weave maps (paint.js weaveMaps): its pad maps them in metres, its shell samples their flat corner.
// The pan's material has no map. Importing this module does nothing.
import * as THREE from 'three';
import { SEAT, UPHOLSTERY } from './plan.js';
import { SEAT_COLOR } from './levels.js';

const linear = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const times = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A rounded rectangle from y = 0 to h, centred on x = 0, counter-clockwise seen from +z: [[x, y], ...]. */
function outline(w, h, rBottom, rTop, nBottom, nTop) {
  const pts = [];
  const arc = (cx, cy, r, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  arc(w / 2 - rBottom, rBottom, rBottom, -Math.PI / 2, 0, nBottom);
  arc(w / 2 - rTop, h - rTop, rTop, 0, Math.PI / 2, nTop);
  arc(-w / 2 + rTop, h - rTop, rTop, Math.PI / 2, Math.PI, nTop);
  arc(-w / 2 + rBottom, rBottom, rBottom, Math.PI, 1.5 * Math.PI, nBottom);
  return pts;
}

/** One smooth surface in the making: vertices shared inside it, a crease to every other part. */
class Part {
  constructor() { this.P = []; this.C = []; this.UV = []; this.I = []; }
  v(p, c, uv) { this.P.push(p[0], p[1], p[2]); this.C.push(c[0], c[1], c[2]); this.UV.push(uv[0], uv[1]); return this.P.length / 3 - 1; }
  tri(a, b, c) { this.I.push(a, b, c); }
  quad(a, b, c, d) { this.I.push(a, b, c, a, c, d); }
  ring(pts, c, uv) { return pts.map((p, i) => this.v(p, typeof c === 'function' ? c(p, i) : c, typeof uv === 'function' ? uv(p, i) : uv)); }
  /** A band between two rings of equal length (a -> b), wound so that `a` running counter-clockwise faces the viewer. */
  band(a, b) { for (let i = 0, n = a.length; i < n; i++) { const j = (i + 1) % n; this.quad(a[i], a[j], b[j], b[i]); } }
  fan(centre, ring, flip = false) { for (let i = 0, n = ring.length; i < n; i++) { const j = (i + 1) % n; if (flip) this.tri(centre, ring[j], ring[i]); else this.tri(centre, ring[i], ring[j]); } }
}

/** Merge parts into one geometry with area-weighted smooth normals inside each part. */
function finish(parts) {
  const pos = [], nor = [], col = [], uv = [], idx = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (const part of parts) {
    const base = pos.length / 3, count = part.P.length / 3;
    const N = new Float32Array(count * 3);
    for (let t = 0; t < part.I.length; t += 3) {
      const [i, j, k] = [part.I[t], part.I[t + 1], part.I[t + 2]];
      a.fromArray(part.P, i * 3); b.fromArray(part.P, j * 3); c.fromArray(part.P, k * 3);
      n.subVectors(b, a).cross(c.sub(a));   // (its length is twice the triangle's area: the weight)
      for (const q of [i, j, k]) { N[q * 3] += n.x; N[q * 3 + 1] += n.y; N[q * 3 + 2] += n.z; }
      idx.push(base + i, base + j, base + k);
    }
    for (let q = 0; q < count; q++) { n.fromArray(N, q * 3); if (n.lengthSq() < 1e-20) n.set(0, 1, 0); n.normalize(); nor.push(n.x, n.y, n.z); }
    pos.push(...part.P); col.push(...part.C); uv.push(...part.UV);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/**
 * The seat's back. `tile` = metres per repeat of the weave maps, `flatUV` = the maps' flat corner (the shell samples it).
 * About a hundred triangles: the black shell's front rim, the pad (pillowed: an edge ring, an inner ring, a centre), the
 * shell's side and its back.
 */
export function seatBackGeometry({ tile = 0.22, flatUV = [0, 0], color = SEAT_COLOR } = {}) {
  const B = SEAT.back, fabric = linear(color.fabric), shell = linear(color.shell);
  const wrap = (x) => B.wrap * ((2 * x) / B.w) ** 2;                       // the back wraps round the sitter: its sides come forward
  // every ring of the back is the same rounded outline, inset by `m`, with ONE extra vertex on each straight side at
  // the seam's height (round A5: the pad's two sewn panels meet there). 14 points: 0-1 the lower right corner, 2 the
  // seam's right end, 3-10 the two top corners, 11 the seam's left end, 12-13 the lower left corner.
  const SR = 2, SL = 11;
  const ringAt = (m, z) => {
    const w = B.w - 2 * m, pts = outline(w, B.h - 2 * m, Math.max(0.004, B.rBottom - m), Math.max(0.004, B.rTop - m), 1, 3);
    const all = [...pts.slice(0, 2), [w / 2, B.seam - m], ...pts.slice(2, 10), [-w / 2, B.seam - m], ...pts.slice(10)];
    return all.map(([x, y]) => [x, y + m, wrap(x) + z]);
  };
  // The colours are the materials' albedos (levels.js: the fabric at ALBEDO.seatFabric, the shell at ALBEDO.shell), with
  // ONE occlusion, taken from the seat's own section (padSlot below): the pad's lower half stands in the slot behind
  // the tipped-up pan (contact-size: the baked volume's 0.8 m cells cannot hold it). No edge roll, no tint: the light
  // does that. Round A4: the upholstery WRAPS OVER THE TOP of the back (a capped back: the cloth runs over the shell's
  // top edge, as on a hall seat): the rim's and the side's vertices of the top arc carry the fabric, so the top of
  // every back is a strip of cloth that faces the roof and takes the house light (the pale line along the tops of the
  // rows in a photograph of empty seating); the sides, the bottom and the back stay black shell.
  const slot = padSlot();
  const padTone = (p) => times(fabric, slotOpen(slot.lip - p[1], slot.gap));
  const padUV = (p) => [p[0] / tile + 0.5, p[1] / tile];
  const capped = (p) => p[1] > B.h - B.rTop * 0.7;                         // the top arc: above the corners' middle
  const wrapTone = (p) => (capped(p) ? fabric : shell), wrapUV = (p) => (capped(p) ? padUV(p) : flatUV);
  // Round A5, A SEWN PAD (the round's defect: "moulded grey pads"). Three things a sewn seat has and a moulded one has
  // not, all as geometry, so that the light (the floods from above, the sheen lobe) draws them:
  //   - a PIPED EDGE: a welt of the same cloth between the shell's rim and the pad (its ridge catches the light all
  //     round, its gutter is a dark line inside it);
  //   - a STITCHED SEAM across the pad above the tipped-up pan's lip: the pad is two panels (a head panel, a main
  //     panel), each pillowed from its own sewn edge: the slope below the seam faces up and takes the light, the slope
  //     above it faces down: a light line under a dark one, the width of a hand at V1;
  //   - the panels are creased against each other and against the welt (separate parts: no shared normals).
  const O0 = ringAt(0, 0), Ob = ringAt(0, -B.shell), E = ringAt(B.rim, 0.002);
  const Pp = ringAt(B.rim + B.piping / 2, 0.002 + B.pipingH), G = ringAt(B.rim + B.piping, B.gutter);
  const rim = new Part(), pipe = new Part(), side = new Part(), back = new Part();
  rim.band(rim.ring(O0, wrapTone, wrapUV), rim.ring(E, wrapTone, wrapUV));
  const pe = pipe.ring(E, padTone, padUV), pp = pipe.ring(Pp, padTone, padUV), pg = pipe.ring(G, padTone, padUV);
  pipe.band(pe, pp); pipe.band(pp, pg);
  // the seam's line from its left end to its right end: one vertex in the middle (the back's wrap is a shallow curve)
  const seamMid = [0, B.seam, wrap(0) + B.gutter], hw = G[SR][0];
  const panel = (loop, top = null) => {
    const part = new Part();
    const ys = loop.map((p) => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys), cy = (y0 + y1) / 2, hy = (y1 - y0) / 2;
    const sx = 1 - B.seamIn / hw, sy = 1 - Math.min(0.6, B.seamIn / hy);
    const inner = loop.map(([x, y]) => { const xi = x * sx, yi = cy + (y - cy) * sy; return [xi, yi, wrap(xi) + B.pad]; });
    const e = part.ring(loop, padTone, padUV), i = part.ring(inner, padTone, padUV);
    part.band(e, i);
    // (`top`: the height of the panel's crown. The main panel's is the pan's lip: every vertex above the lip is in the
    // open, so the slot's shade, which the vertices carry, begins AT the lip and not above it)
    const c = [0, top ?? cy, B.pad * 1.15];
    part.fan(part.v(c, padTone(c), padUV(c)), i);
    return part;
  };
  // (both loops run counter-clockwise seen from the front; they share the seam's two edges)
  const headPanel = panel([...G.slice(SR, SL + 1), seamMid]);
  const mainPanel = panel([...G.slice(SL), ...G.slice(0, SR + 1), seamMid], slot.lip);
  side.band(side.ring(Ob, wrapTone, wrapUV), side.ring(O0, wrapTone, wrapUV));
  back.fan(back.v([0, B.h / 2, -B.shell - 0.008], shell, flatUV), back.ring(Ob, shell, flatUV), true);
  return finish([rim, pipe, headPanel, mainPanel, side, back]);
}

/**
 * The slot between the back's pad and the tipped-up pan, from the seat's own numbers (plan.js SEAT, the folded pose):
 * `lip` = where the pan's front lip stands along the back (metres up the back from its lower edge), `gap` = the clear
 * width between the pad's face and the pan's upholstered top at the lip. Pure arithmetic (the node arm pins it).
 */
export function padSlot(seat = SEAT) {
  const B = seat.back, Q = seat.pan, reach = Q.depth - Q.rear;
  // the lip in the seat's frame (y up from the deck, z toward the table): the pan's front edge after the fold about its pivot
  const lipY = Q.pivotY + reach * Math.sin(seat.fold), lipZ = Q.pivotZ + reach * Math.cos(seat.fold);
  // up the leaning back: the lip's height over the back's lower edge, along the back
  const lip = (lipY - B.y) / Math.cos(seat.lean);
  // the pad's face there (the back leans away from the table; the pad stands B.pad proud) against the pan's top (Q.top proud of its plane, toward the back)
  const padZ = -lip * Math.sin(seat.lean) + B.pad, panZ = lipZ - Q.top;
  return { lip, gap: Math.max(0.005, panZ - padZ) };
}

/**
 * How much of the light from above a point of the pad keeps, `t` metres below the pan's lip, in a slot `gap` wide (t < 0:
 * above the lip, in the open). The pad faces the pan; the light comes down through the slot's mouth: of the upper
 * quarter-space a wall point sees past an opposite plate that ends `t` above it, the cosine-weighted share is
 * 1 - sin(atan(t / gap)) = 1 - t / hypot(t, gap). 1 in the open, 0.29 one gap-width down, 0.11 two.
 */
export function slotOpen(t, gap) { return t <= 0 ? 1 : 1 - t / Math.hypot(t, gap); }

/**
 * The seat's pan, drawn down (the instance matrix tips it up about the origin). About seventy triangles: the moulded
 * underside (a chamfered tray: its slopes are what catches a highlight when the seat is folded), the side wall, the
 * upholstered top.
 */
export function seatPanGeometry({ color = SEAT_COLOR } = {}) {
  const Q = SEAT.pan, shell = linear(color.shell), plate = linear(color.plate ?? '#a2a5aa');
  // the outline in the pan's plane: x across, t from the rear edge to the front lip (counter-clockwise seen from BELOW)
  const O = outline(Q.w, Q.depth, Q.rRear, Q.rFront, 1, 3);
  const inner = outline(Q.w - 0.1, Q.depth - 0.1, 0.012, Math.max(0.02, Q.rFront - 0.05), 1, 3).map(([x, t]) => [x, t + 0.05]);
  const at = (pts, y) => pts.map(([x, t]) => [x, y, t - Q.rear]);
  // the moulded pan is the shell's albedo all over (round A2 painted a falloff toward the hinge and lighter slopes:
  // shades standing in for light). Round A5: its top is the plain deck the cushion sits on (the cushion is its own
  // geometry in the fabric's material, seatCushionGeometry: cloth and moulded plastic do not share a gloss).
  const zero = [0, 0];
  const tray = new Part(), field = new Part(), wall = new Part(), top = new Part();
  tray.band(tray.ring(at(O, -Q.wall), shell, zero), tray.ring(at(inner, -Q.under), shell, zero));
  // (the flat field is its own surface: shared normals with the slopes would shade it as a shallow pyramid)
  const mid = [0, -Q.under, Q.depth / 2 - Q.rear];
  field.fan(field.v(mid, shell, zero), field.ring(at(inner, -Q.under), shell, zero));
  wall.band(wall.ring(at(O, 0.004), shell, zero), wall.ring(at(O, -Q.wall), shell, zero));
  const cTop = [0, 0.004, Q.depth / 2 - Q.rear];
  top.fan(top.v(cTop, shell, zero), top.ring(at(O, 0.004), shell, zero), true);
  // THE BLANK NUMBER PLATE (round A5): a small pale tag on the moulded underside, `at` from the front lip, where a
  // hall seat carries its number (the folded pan shows it to the hall). Blank: no digit, no mark. A closed box.
  const PL = Q.plate, zc = Q.depth - PL.at - Q.rear;
  const tag = boxParts(-PL.w / 2, PL.w / 2, -Q.under - PL.t, -Q.under, zc - PL.h / 2, zc + PL.h / 2, plate, zero);
  return finish([tray, field, wall, top, ...tag]);
}

/** A closed box as six flat parts (one colour, one uv), wound outward. */
function boxParts(x0, x1, y0, y1, z0, z1, c, uv) {
  const faces = [
    [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
    [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]],
  ];
  return faces.map((f) => { const p = new Part(), v = f.map((q) => p.v(q, c, uv)); p.quad(v[0], v[1], v[2], v[3]); return p; });
}

/**
 * The pan's CUSHION (round A5), in the pan's frame (it takes the pan's instance matrix): the upholstered top, pillowed
 * to `top` at its middle, and its WATERFALL EDGE: the cloth wraps over the pan's front lip (it stands `roll` proud of
 * the lip and runs `rollDown` down it). On a folded seat that roll is the top of the pan: a strip of cloth that faces
 * the roof and takes the house light, the second pale line of every row in a photograph of empty seating (the first is
 * the top of the back). The fabric's material (the weave maps by metres, `tile`); about fifty triangles, closed.
 */
export function seatCushionGeometry({ tile = 0.22, color = SEAT_COLOR } = {}) {
  const Q = SEAT.pan, fabric = linear(color.fabric);
  const O = outline(Q.w, Q.depth, Q.rRear, Q.rFront, 1, 3);
  const front = (t) => t > Q.depth - Q.rFront * 0.7;                       // the front arc: the lip the cloth wraps over
  const cx = 0, ct = Q.depth - Q.rFront;                                   // (the front corners' centres lie on this line)
  // a ring of the outline at height y; on the front arc pushed `out` away from the pan's middle and set at `yFront`
  const ringAt = (y, out, yFront) => O.map(([x, t]) => {
    if (!front(t)) return [x, y, t - Q.rear];
    const dx = x - cx, dt = t - Math.min(ct, t), l = Math.hypot(dx, dt) || 1;
    return [x + (dx / l) * out * 0.3, yFront, t + out - Q.rear];
  });
  const uv = (p) => [p[0] / tile + 0.5, p[2] / tile];
  const crown = new Part(), roll = new Part(), under = new Part();
  const shoulder = ringAt(0.008, Q.roll, 0.008), foot = ringAt(0.004, Q.roll, -Q.rollDown);
  const cTop = [0, Q.top, Q.depth / 2 - Q.rear];
  crown.fan(crown.v(cTop, fabric, uv(cTop)), crown.ring(shoulder, fabric, uv), true);
  roll.band(roll.ring(shoulder, fabric, uv), roll.ring(foot, fabric, uv));
  const cUnder = [0, 0.004, Q.depth / 2 - Q.rear];
  under.fan(under.v(cUnder, fabric, uv(cUnder)), under.ring(foot, fabric, uv));
  return finish([crown, roll, under]);
}

/**
 * The armrest's cap (round A5: the real seats' armrests are their own instanced mesh in the shells' material: moulded
 * black polypropylene with a soft gloss, darker and glossier than the cloth beside it). The origin is the middle of its
 * underside, x across, y up, z along the arm. A prism with chamfered top edges, closed: 24 triangles.
 */
export function seatArmGeometry({ color = SEAT_COLOR } = {}) {
  const A = SEAT.arm, shell = linear(color.shell), zero = [0, 0], c = A.chamfer, w = A.w / 2, L = A.len / 2;
  // the section, counter-clockwise seen from +z
  const S = [[-w, 0], [w, 0], [w, A.t - c], [w - c, A.t], [-w + c, A.t], [-w, A.t - c]];
  const parts = [];
  for (let i = 0; i < S.length; i++) {
    const p = S[i], q = S[(i + 1) % S.length], part = new Part();
    const a = part.v([p[0], p[1], L], shell, zero), b = part.v([q[0], q[1], L], shell, zero), d = part.v([p[0], p[1], -L], shell, zero), e = part.v([q[0], q[1], -L], shell, zero);
    part.quad(a, d, e, b);
    parts.push(part);
  }
  for (const [z, flip] of [[L, false], [-L, true]]) {
    const part = new Part();
    part.fan(part.v([0, A.t / 2, z], shell, zero), part.ring(S.map(([x, y]) => [x, y, z]), shell, zero), flip);
    parts.push(part);
  }
  return finish(parts);
}

// ---- ROUND A6: THE UPHOLSTERED SEAT (plan.js UPHOLSTERY; built from geometry revision UPHOLSTERY_REV on) ------------------
// Round A5's pad was sewn and FLAT: under the floods it took one level from edge to edge and read, from the play views,
// as a moulded pad. Foam under cloth is not flat: each sewn panel is a bolster whose surface turns through a right
// angle from its sewn edge to its crown. The two functions below build that form and nothing else changes (the same
// outline, the same shell, welt, seam, plates and pan): the back's two panels as bolsters, the pan's cushion with a
// waterfall edge whose nose and hem a level eye sees over the folded pan's black tray. What a bolster's flanks do to
// the light is the light's business (the baked volume by the surface's own normal, the pile's sheen lobe); the only
// shade the vertices carry is occlusion from the seat's own section, in closed form (slotOpen: the slot behind the
// pan as in round A4, the seam's groove between the two bolsters, the welt's gutter).

/** The slot behind the tipped-up pan when the back's main panel stands UPHOLSTERY.main.thick proud of its gutter. */
export function padSlotUpholstered(seat = SEAT, form = UPHOLSTERY) {
  const s = padSlot(seat);
  return { lip: s.lip, gap: Math.max(0.005, s.gap - (seat.back.gutter + form.main.thick - seat.back.pad)) };
}

/**
 * The rise of a bolster from its sewn edge (u = 0) to its crown (u = 1), as a share of its height: a quarter circle
 * (the round's first form: its flank is vertical at the edge and nearly level from a third of the way: seen from the
 * front the turn of the surface is one pixel high), or, `profile` 'parabola', 1 - (1 - u)^2: the surface's slope falls
 * evenly from the edge to the crown, so the light on it changes evenly over the whole flank.
 */
export const bolsterRise = (u, profile = 'circle') => {
  const k = 1 - Math.min(1, Math.max(0, u));
  return profile === 'parabola' ? 1 - k * k : Math.sqrt(Math.max(0, 1 - k * k));
};

/**
 * The upholstered back (round A6): round A5's back (shell, rim, welt, the cloth over the top) with its two sewn panels
 * as BOLSTERS: the upper panel a pillow over its whole height, the main panel rising from its edge over
 * UPHOLSTERY.main.roll. Rings at UPHOLSTERY.rings of the rise; about 250 triangles, closed.
 */
export function seatBackUpholstered({ tile = 0.22, flatUV = [0, 0], color = SEAT_COLOR, form = UPHOLSTERY } = {}) {
  const B = SEAT.back, fabric = linear(color.fabric), shell = linear(color.shell);
  const wrap = (x) => B.wrap * ((2 * x) / B.w) ** 2;
  // (`corner`: segments of a top corner's arc; the seam's two ends follow the count. `seamUp`: how far the seam's
  // middle is sewn above the gutter: foam does not fold to the shell between two panels, the valley is shallow)
  const NT = form.corner ?? 3, seamUp = form.seamUp ?? 0;
  const SR = 2, SL = 3 + 2 * (NT + 1);
  const ringAt = (m, z) => {
    const w = B.w - 2 * m, pts = outline(w, B.h - 2 * m, Math.max(0.004, B.rBottom - m), Math.max(0.004, B.rTop - m), 1, NT);
    const all = [...pts.slice(0, 2), [w / 2, B.seam - m], ...pts.slice(2, 4 + 2 * NT), [-w / 2, B.seam - m], ...pts.slice(4 + 2 * NT)];
    return all.map(([x, y]) => [x, y + m, wrap(x) + z]);
  };
  const slot = padSlotUpholstered(SEAT, form);
  // the one shade a vertex carries: how much of the light a point keeps in the seat's own section (1 = in the open)
  const inSlot = (p) => slotOpen(slot.lip - p[1], slot.gap);
  // the welt's gutter: a crease as deep as the welt's ridge stands over it, one welt wide
  const gutterOpen = slotOpen(0.002 + B.pipingH - B.gutter, B.piping);
  const padUV = (p) => [p[0] / tile + 0.5, p[1] / tile];
  const capped = (p) => p[1] > B.h - B.rTop * 0.7;
  const wrapTone = (p) => (capped(p) ? fabric : shell), wrapUV = (p) => (capped(p) ? padUV(p) : flatUV);
  const O0 = ringAt(0, 0), Ob = ringAt(0, -B.shell), E = ringAt(B.rim, 0.002);
  const Pp = ringAt(B.rim + B.piping / 2, 0.002 + B.pipingH), G = ringAt(B.rim + B.piping, B.gutter);
  const rim = new Part(), pipe = new Part(), side = new Part(), back = new Part();
  rim.band(rim.ring(O0, wrapTone, wrapUV), rim.ring(E, wrapTone, wrapUV));
  const weltTone = (p) => times(fabric, inSlot(p));
  const pe = pipe.ring(E, weltTone, padUV), pp = pipe.ring(Pp, weltTone, padUV), pg = pipe.ring(G, (p) => times(fabric, inSlot(p) * gutterOpen), padUV);
  pipe.band(pe, pp); pipe.band(pp, pg);
  const seamMid = [0, B.seam, wrap(0) + B.gutter + seamUp], hw = G[SR][0];
  // one panel: `loop` runs counter-clockwise seen from the front, `onSeam` holds the loop's indices that lie on the
  // seam, `thick` is the crown's height over the gutter, `run` the distance over which the surface rises (null: the
  // panel's half height: a pillow), `crownY` where the crown's middle point lies (null: the panel's middle)
  const bolster = (loop, onSeam, thick, run, crownY) => {
    const part = new Part();
    const ys = loop.map((p) => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys), cy = (y0 + y1) / 2, hy = (y1 - y0) / 2;
    const r = Math.min(run ?? hy, hy);
    const tone = (p, open) => times(fabric, inSlot(p) * open);
    // each loop vertex's own height over the gutter (the seam's middle is sewn `seamUp` above it): a ring's vertex
    // rises from there to the crown
    const base = loop.map((p) => p[2] - wrap(p[0]) - B.gutter);
    // (on the seam the two panels' sewn edges meet at the bottom of a groove as deep as the crown stands over the
    // sewn edge and one stitch wide; a point of a flank `t` from the seam stands in a groove as deep as the crown is
    // above it and twice `t` wide)
    let prev = part.ring(loop, (p, i) => tone(p, onSeam.has(i) ? slotOpen(thick - base[i], form.stitch) : gutterOpen), padUV);
    for (const u of form.rings) {
      const t = u * r, sx = 1 - t / hw, sy = 1 - (0.96 * t) / hy, k = bolsterRise(u, form.profile);
      const zOf = (i) => base[i] + (thick - base[i]) * k;
      const pts = loop.map(([x, y], i) => { const xi = x * sx; return [xi, cy + (y - cy) * sy, wrap(xi) + B.gutter + zOf(i)]; });
      const ring = part.ring(pts, (p, i) => tone(p, onSeam.has(i) ? slotOpen(thick - zOf(i), form.stitch + 2 * t) : 1), padUV);
      part.band(prev, ring);
      prev = ring;
    }
    const c = [0, crownY ?? cy, wrap(0) + B.gutter + thick * 1.02];
    part.fan(part.v(c, tone(c, 1), padUV(c)), prev);
    return part;
  };
  // (both loops run counter-clockwise seen from the front; they share the seam's two ends and its middle point)
  const upperPanel = bolster([...G.slice(SR, SL + 1), seamMid], new Set([0, SL - SR, SL - SR + 1]), form.upper.thick, null, null);
  const mainLoop = [...G.slice(SL), ...G.slice(0, SR + 1), seamMid];
  const mainPanel = bolster(mainLoop, new Set([0, mainLoop.length - 2, mainLoop.length - 1]), form.main.thick, form.main.roll, slot.lip);
  side.band(side.ring(Ob, wrapTone, wrapUV), side.ring(O0, wrapTone, wrapUV));
  back.fan(back.v([0, B.h / 2, -B.shell - 0.008], shell, flatUV), back.ring(Ob, shell, flatUV), true);
  return finish([rim, pipe, upperPanel, mainPanel, side, back]);
}

/**
 * The upholstered pan's cushion (round A6), in the pan's frame: the crown on the pan's top as before, and at the front
 * lip a WATERFALL EDGE: the cloth runs over a nose UPHOLSTERY.cushion.roll proud of the lip, down the tray's side and
 * back to a hem `hem` behind the lip, `proud` under the pan's top (clear of the moulded tray: a soft lip of cloth
 * along the top of every folded pan, toward the hall). About a hundred triangles, closed.
 */
export function seatCushionUpholstered({ tile = 0.22, color = SEAT_COLOR, form = UPHOLSTERY } = {}) {
  const Q = SEAT.pan, C = form.cushion, fabric = linear(color.fabric);
  const O = outline(Q.w, Q.depth, Q.rRear, Q.rFront, 1, form.corner ?? 3);
  const front = (t) => t > Q.depth - Q.rFront * 0.7;                       // the front arc: the lip the cloth wraps over
  const ct = Q.depth - Q.rFront;                                           // (the front corners' centres lie on this line)
  // a ring of the outline: off the front arc at height `y`; on the front arc at `yFront`, `out` beyond the lip (negative: behind it)
  const ringAt = (y, out, yFront) => O.map(([x, t]) => {
    if (!front(t)) return [x, y, t - Q.rear];
    const dt = t - Math.min(ct, t), l = Math.hypot(x, dt) || 1;
    return [x + (x / l) * Math.max(out, 0) * 0.3, yFront, t + out - Q.rear];
  });
  const uv = (p) => [p[0] / tile + 0.5, p[2] / tile];
  const crown = new Part(), roll = new Part(), under = new Part();
  const shoulder = ringAt(0.008, C.roll * 0.5, 0.010), nose = ringAt(0.006, C.roll, -0.3 * C.proud);
  const chin = ringAt(0.005, C.roll * 0.5, -0.85 * C.proud), hem = ringAt(0.004, -C.hem, -C.proud);
  const cTop = [0, Q.top, Q.depth / 2 - Q.rear];
  crown.fan(crown.v(cTop, fabric, uv(cTop)), crown.ring(shoulder, fabric, uv), true);
  const r1 = roll.ring(shoulder, fabric, uv), r2 = roll.ring(nose, fabric, uv), r3 = roll.ring(chin, fabric, uv), r4 = roll.ring(hem, fabric, uv);
  roll.band(r1, r2); roll.band(r2, r3); roll.band(r3, r4);
  const cUnder = [0, 0.004, Q.depth / 2 - Q.rear];
  under.fan(under.v(cUnder, fabric, uv(cUnder)), under.ring(hem, fabric, uv));
  return finish([crown, roll, under]);
}

/**
 * The turn of the upholstered cushion's front roll as its own mesh shades it (round A7: what the row card's nose must
 * follow). Down the roll's front edge, from the nose's top: `t` = metres below the nose along the pan, `angle` = the
 * shading normal's angle above the pan's underside (radians; the underside faces the hall when the pan is folded) at
 * the roll's three rings a level eye sees: the nose, the chin, the hem; and, as a fourth record, the underside's own
 * normal at the hem (another part: a crease). Read from the geometry seatCushionUpholstered builds (its smooth
 * normals), so the card cannot drift from the seat. Pure; cached per form.
 */
const rollCache = new Map();
export function cushionRollTurn(form = UPHOLSTERY) {
  if (rollCache.has(form)) return rollCache.get(form);
  const Q = SEAT.pan, C = form.cushion, lip = Q.depth - Q.rear;
  const g = seatCushionUpholstered({ form }), pos = g.getAttribute('position'), nor = g.getAttribute('normal');
  // the three rings on the front edge: (beyond the lip, under the pan's top) = nose (roll, -0.3 proud), chin (roll / 2, -0.85 proud), hem (-hem, -proud)
  const want = [[C.roll, -0.3 * C.proud], [C.roll * 0.5, -0.85 * C.proud], [-C.hem, -C.proud]];
  const out = want.map(([dz, y]) => {
    // the vertices at the two ends of the straight front edge (the shading between them is their mean). Where two
    // parts meet at one place (the hem: the roll's ring and the underside's) the roll's looks more along the pan
    const found = [];
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getZ(i) - lip - dz) > 1e-6 || Math.abs(pos.getY(i) - y) > 1e-6 || Math.abs(nor.getX(i)) > 0.2) continue;
      found.push([nor.getY(i), nor.getZ(i)]);
    }
    const top = Math.max(...found.map((n) => n[1])), ours = found.filter((n) => n[1] > top - 0.3), rest = found.filter((n) => n[1] <= top - 0.3);
    const mean = (list) => Math.atan2(list.reduce((s, n) => s + n[1], 0), -list.reduce((s, n) => s + n[0], 0));
    return { t: C.roll - dz, angle: ours.length ? mean(ours) : 0, under: rest.length ? mean(rest) : null };
  });
  g.dispose();
  // (a fourth record: the cushion's underside where it leaves the hem, the strip a level eye sees between the hem and the tray)
  out.push({ t: out[2].t, angle: out[2].under ?? out[2].angle });
  const turn = Object.freeze(out.map((x) => Object.freeze({ t: x.t, angle: x.angle })));
  rollCache.set(form, turn);
  return turn;
}

/** The signed volume of a closed geometry (the node arm: positive = wound outward). */
export function signedVolume(geometry) {
  const p = geometry.getAttribute('position'), ix = geometry.getIndex();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let v = 0;
  for (let t = 0; t < ix.count; t += 3) { a.fromBufferAttribute(p, ix.getX(t)); b.fromBufferAttribute(p, ix.getX(t + 1)); c.fromBufferAttribute(p, ix.getX(t + 2)); v += a.dot(b.cross(c)) / 6; }
  return v;
}
