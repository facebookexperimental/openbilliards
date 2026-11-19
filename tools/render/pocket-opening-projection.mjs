// Copyright (c) Meta Platforms, Inc. and affiliates.

// Independent open-hole check on submitted meshes. No renderer construction
// helper, mouth width or fitted contour is used to decide whether cloth is
// above a hole: subtract the actual bed triangles from every projected
// cushion triangle. This also handles a side opening cut into the bed outline.

const AREA_EPS = 1e-14; // m², below a Float32 boundary land by many orders
const POINT_EPS = 1e-9; // m, arithmetic boundary classification only
const area2 = p => p.reduce((sum, a, i) => {
  const b = p[(i + 1) % p.length];
  return sum + a[0] * b[1] - b[0] * a[1];
}, 0);
const ccw = p => area2(p) < 0 ? p.slice().reverse() : p;
const side = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

function clip(poly, a, b, sign = 1) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const dp = sign * side(a, b, p), dq = sign * side(a, b, q);
    if (dp >= 0) out.push(p);
    if (dp * dq < 0) {
      const t = dp / (dp - dq);
      out.push(p.map((v, j) => v + t * (q[j] - v)));
    }
  }
  return out;
}

function bounds(poly) {
  return {lo: [Math.min(...poly.map(p => p[0])), Math.min(...poly.map(p => p[1]))],
    hi: [Math.max(...poly.map(p => p[0])), Math.max(...poly.map(p => p[1]))]};
}
const overlaps = (a, b) => a.lo[0] <= b.hi[0] && a.hi[0] >= b.lo[0]
  && a.lo[1] <= b.hi[1] && a.hi[1] >= b.lo[1];
const contains = (triangle, poly) => triangle.every((a, i) =>
  poly.every(p => side(a, triangle[(i + 1) % 3], p) >= 0));

function treeFor(rows) {
  if (!rows.length) return null;
  const box = {lo: [Infinity, Infinity], hi: [-Infinity, -Infinity]};
  for (const row of rows) for (let k = 0; k < 2; k++) {
    box.lo[k] = Math.min(box.lo[k], row.box.lo[k]);
    box.hi[k] = Math.max(box.hi[k], row.box.hi[k]);
  }
  if (rows.length <= 8) return {box, rows};
  const axis = box.hi[0] - box.lo[0] >= box.hi[1] - box.lo[1] ? 0 : 1;
  rows.sort((a, b) => a.box.lo[axis] + a.box.hi[axis] - b.box.lo[axis] - b.box.hi[axis] || a.id - b.id);
  const middle = rows.length >> 1;
  return {box, children: [treeFor(rows.slice(0, middle)), treeFor(rows.slice(middle))]};
}
function candidates(tree, box, out = []) {
  if (!tree || !overlaps(tree.box, box)) return out;
  if (tree.children) for (const child of tree.children) candidates(child, box, out);
  else for (const row of tree.rows) if (overlaps(row.box, box)) out.push(row);
  return out;
}

// Difference of two convex polygons. The pieces outside successive clip
// edges are disjoint. Applying this to bed triangles does not assume that
// their draw groups are disjoint or that any boundary is a closed hole.
function subtract(poly, triangle) {
  const outside = [];
  let inside = poly;
  for (let i = 0; i < 3 && inside.length; i++) {
    const a = triangle[i], b = triangle[(i + 1) % 3];
    const piece = clip(inside, a, b, -1);
    if (piece.length >= 3 && Math.abs(area2(piece)) > 2 * AREA_EPS) outside.push(piece);
    inside = clip(inside, a, b);
  }
  return outside;
}

function segmentInterval(a, b, polygon) {
  let lo = 0, hi = 1;
  for (let i = 0; i < polygon.length && lo <= hi; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length];
    const da = side(p, q, a), db = side(p, q, b), delta = db - da;
    if (delta === 0) { if (da < 0) hi = -1; }
    else if (delta > 0) lo = Math.max(lo, -da / delta);
    else hi = Math.min(hi, -da / delta);
  }
  return lo <= hi ? [lo, hi] : null;
}

function uncoveredSegments(poly, bedRows, window = null) {
  let a = poly[0], b = a, length2 = 0;
  for (const p of poly) for (const q of poly) {
    const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
    if (d > length2) { a = p; b = q; length2 = d; }
  }
  if (length2 <= POINT_EPS * POINT_EPS) return [];
  const scope = window ? segmentInterval(a, b, window) : [0, 1];
  if (!scope) return [];
  const length = Math.sqrt(length2), intervals = [];
  for (const {poly: triangle} of bedRows) {
    const interval = segmentInterval(a, b, triangle);
    if (!interval) continue;
    const lo = Math.max(scope[0], interval[0]), hi = Math.min(scope[1], interval[1]);
    if (lo <= hi) intervals.push([lo, hi]);
  }
  intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let covered = scope[0];
  const gaps = [], at = t => a.map((v, k) => v + t * (b[k] - v));
  for (const [lo, hi] of [...intervals, [scope[1], scope[1]]]) {
    if ((lo - covered) * length > POINT_EPS) gaps.push([at(covered), at(lo)]);
    covered = Math.max(covered, hi);
  }
  return gaps;
}

function distanceToBed(tree, point) {
  let best = Infinity;
  const boxDistance = box => Math.hypot(...[0, 1].map(k =>
    Math.max(0, box.lo[k] - point[k], point[k] - box.hi[k])));
  const visit = node => {
    if (!node || boxDistance(node.box) > best) return;
    if (node.children) {
      for (const child of node.children.slice().sort((a, b) => boxDistance(a.box) - boxDistance(b.box))) visit(child);
      return;
    }
    for (const row of node.rows) {
      if (boxDistance(row.box) > best) continue;
      if (contains(row.poly, [point])) { best = 0; return; }
      for (let i = 0; i < 3; i++) {
        const a = row.poly[i], b = row.poly[(i + 1) % 3];
        const x = b[0] - a[0], y = b[1] - a[1], length2 = x * x + y * y;
        const t = length2 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * x + (point[1] - a[1]) * y) / length2)) : 0;
        best = Math.min(best, Math.hypot(point[0] - a[0] - t * x, point[1] - a[1] - t * y));
      }
    }
  };
  visit(tree); return best;
}

export function projectPocketOpenings(data, G, frameFor, {exact = false} = {}) {
  const beds = data.meshes.filter(m => Math.abs(m.box.min.y) < 1e-7 && Math.abs(m.box.max.y) < 1e-7
    && m.box.max.x - m.box.min.x > G.L * 0.8 && m.box.max.z - m.box.min.z > G.W * 0.8);
  if (beds.length !== 1) return {status: 'REFUSED', reason: `identified ${beds.length} submitted bed meshes, expected one`, rows: []};
  const bed = beds[0], clothMaterials = new Set(bed.materials ?? []), rows = [];
  // Include every submitted cloth surface, including the below-bed return:
  // an inward roll can obstruct a hole even when its top is at bed height.
  // Primary cushions are also included when their
  // deformation material is a distinct clone of the bed material.
  const cushions = data.meshes.filter(m => m.cushion || m !== bed
    && (m.materials ?? []).some(material => clothMaterials.has(material)));
  // An exact polygon difference decides area overlap. Point witnesses also
  // catch a vertical cloth triangle whose projection has zero area. The
  // reported depth is a witnessed lower bound, never an asserted maximum
  // inside a failed fragment. A passing row has no uncovered fragment.
  for (const [pi, pocket] of G.pockets.entries()) {
    const frame = frameFor(G, pocket);
    for (const sign of [-1, 1]) {
      const local = p => {
        const x = p.x - frame.nx, z = p.z - frame.nz;
        return [x * frame.ux + z * frame.uz, sign * (-x * frame.uz + z * frame.ux), p.y];
      };
      const bedRows = bed.rows.map(row => {
        const poly = ccw([row.tri.a, row.tri.b, row.tri.c].map(local));
        return {poly, box: bounds(poly), id: row.id};
      }).filter(r => Math.abs(area2(r.poly)) > 2 * AREA_EPS);
      const tree = treeFor(bedRows);
      if (!tree) return {status: 'REFUSED', reason: 'bed has no submitted plan triangles', rows: []};
      // Both half-windows include the axis. Otherwise a separate narrow
      // cloth flap at the centre could escape both jaw checks.
      const window = [[-0.14, 0], [0.20, 0], [0.20, 0.20], [-0.14, 0.20]];
      const windowBox = bounds(window), meshes = new Set(), primary = new Set();
      let samples = 0, certified = 0, tested = 0, failures = 0, lineFailures = 0, overlapArea = 0;
      const segmentDetails = [];
      let witness = {depth_mm: 0, point_m: null, cushion: null, triangle: null};
      const observe = (p, source) => {
        samples++;
        const depth = distanceToBed(tree, p);
        if (depth > POINT_EPS && depth * 1000 > witness.depth_mm) {
          witness = {depth_mm: depth * 1000,
            point_m: [frame.nx + p[0] * frame.ux - sign * p[1] * frame.uz, p[2],
              frame.nz + p[0] * frame.uz + sign * p[1] * frame.ux], cushion: source.name, triangle: source.id};
        }
      };
      for (const mesh of cushions) for (const source of mesh.rows) {
        const projected = ccw([source.tri.a, source.tri.b, source.tri.c].map(local));
        let poly = projected;
        if (!overlaps(bounds(poly), windowBox)) continue;
        for (let i = 0; i < 4 && poly.length; i++) poly = clip(poly, window[i], window[(i + 1) % 4]);
        if (!poly.length) continue;
        meshes.add(mesh.name); if (mesh.cushion) primary.add(mesh.name); tested++;
        const near = candidates(tree, bounds(poly));
        // One convex bed triangle containing the whole projection is a
        // sufficient proof, not a sampling approximation. The exact arm
        // skips only this optimization and performs the same subtraction.
        if (!exact && near.some(row => contains(row.poly, poly))) { certified++; continue; }
        if (Math.abs(area2(poly)) <= 2 * AREA_EPS) {
          for (const p of poly) observe(p, source);
          // A vertical triangle has at most two distinct plan vertices.
          // Keep those submitted endpoints for the bed half-plane tests:
          // reconstructing a window intersection can move an exact shared
          // edge across itself by roundoff. Clip its parameter interval
          // instead, without changing either arithmetic tolerance. A thin
          // non-linear projection still uses the clipped polygon below.
          const planVertices = projected.filter((p, i) => projected.findIndex(q => p[0] === q[0] && p[1] === q[1]) === i);
          const gaps = planVertices.length <= 2
            ? uncoveredSegments(projected, near, window) : uncoveredSegments(poly, near);
          lineFailures += gaps.length;
          if (gaps.length) segmentDetails.push({mesh: source.name, triangle: source.id,
            source_triangle_m: [source.tri.a, source.tri.b, source.tri.c].map(p => [p.x, p.y, p.z]),
            coordinates: 'pocket-local [axis, signed lateral, height], in metres',
            frame: {...frame, jaw: sign}, projection: poly, segments: gaps,
            bed_triangles: near.map(row => ({triangle: row.id, points: row.poly}))});
          for (const [a, b] of gaps) observe(a.map((v, k) => (v + b[k]) / 2), source);
          continue;
        }
        let pieces = [poly];
        for (const row of near) {
          if (!pieces.length) break;
          pieces = pieces.flatMap(piece => overlaps(bounds(piece), row.box) ? subtract(piece, row.poly) : [piece]);
        }
        for (const piece of pieces) {
          const area = Math.abs(area2(piece)) / 2;
          if (area <= AREA_EPS) continue;
          failures++; overlapArea += area;
          for (const p of piece) observe(p, source);
          observe(piece[0].map((_, k) => piece.reduce((sum, p) => sum + p[k], 0) / piece.length), source);
        }
      }
      rows.push({pocket: pi, kind: pocket.corner ? 'corner' : 'side', jaw: sign,
        cushions: [...primary].sort(), cloth_meshes: [...meshes].sort(), tested_triangles: tested, certified, samples,
        uncovered_fragments: failures, uncovered_segments: lineFailures, summed_overlap_mm2: overlapArea * 1e6, witness,
        uncovered_segment_details: segmentDetails,
        status: !tested || primary.size !== 1 ? 'REFUSED' : failures || lineFailures || witness.depth_mm > 0 ? 'FAIL' : 'PASS'});
    }
  }
  return {status: rows.every(r => r.status === 'PASS') ? 'PASS' : rows.some(r => r.status === 'REFUSED') ? 'REFUSED' : 'FAIL',
    method: 'submitted cloth projection, including below-bed returns, minus submitted bed triangles; exact polygon difference',
    bed: bed.name, arithmetic_tolerances: {area_m2: AREA_EPS, point_m: POINT_EPS}, rows};
}
