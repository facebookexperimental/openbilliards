// Copyright (c) Meta Platforms, Inc. and affiliates.

// Read-only plan measurements shared by the jaw-weld arm and pool overlays.
// No polygon is constructed or changed here. Length/turn tests and tolerances
// match cushionPlanCtx's geometric arcRuns detector.
export function sampledJawRuns(poly, ctx) {
  const { M, front, ed, noseEdge } = ctx;
  const lengths = poly.map((p, i) => {
    const q = poly[(i + 1) % M];
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  });
  const turns = ed.map((d, i) => {
    const prev = ed[(i - 1 + M) % M];
    return Math.atan2(prev[0] * d[1] - prev[1] * d[0], prev[0] * d[0] + prev[1] * d[1]);
  });
  const runs = [];
  for (let i = 0; i < M; i++) {
    if (!front[i] || lengths[i] < 1e-12) continue;
    const turn = turns[(i + 1) % M];
    if (!(Math.abs(turn) > 1e-9 && Math.abs(turn) < Math.PI / 2)) continue;
    let k = i;
    while (k + 1 < M && front[k + 1]
      && Math.abs(lengths[k + 1] - lengths[i]) < 1e-9
      && Math.abs(turns[k + 1] - turn) < 1e-9) k++;
    if (k === i) continue;
    const a = (i - 1 + M) % M, b = (k + 1) % M;
    if (front[a] && front[b] && noseEdge[a] !== noseEdge[b]) {
      runs.push({ i, k, edges: [a, b],
        nose: noseEdge[a] ? a : b, facing: noseEdge[a] ? b : a,
        jaw: noseEdge[b] ? 'start' : 'end',
        rIn: (lengths[i] / 2) / Math.tan(Math.abs(turn) / 2),
        radius: (lengths[i] / 2) / Math.sin(Math.abs(turn) / 2) });
    }
    i = k;
  }
  return runs;
}

/** DERIVED erosion vertex: the facing and nose support lines offset by
 * oFacing and o along their exported inward normals. Independent of ringAt's vertices. */
export function erosionVertex(poly, ctx, arc, o, oFacing = o) {
  const { facing, nose } = arc;
  const offset = (edge, inset) => poly[edge].map((v, axis) => v + inset * ctx.en[edge][axis]);
  const p = offset(facing, oFacing), q = offset(nose, o);
  const a = ctx.ed[facing], b = ctx.ed[nose];
  const den = a[0] * b[1] - a[1] * b[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q[0] - p[0]) * b[1] - (q[1] - p[1]) * b[0]) / den;
  return [p[0] + t * a[0], p[1] + t * a[1]];
}

/** Resolve a crossing's jaw by its two bounding edge identities, never by
 * proximity to a recorded coordinate. Both the profile row and plan are live. */
export function liveJawAnchor(crossing, plans) {
  const plan = plans.find((p) => p.id === crossing.id && p.rail === crossing.rail);
  if (!plan || !plan.prof.rows.some((r) => r.z === crossing.z && r.o === crossing.o)
    || !Array.isArray(crossing.edges) || crossing.edges.length !== 2) return null;
  const arc = sampledJawRuns(plan.poly, plan.ctx).find((a) =>
    a.edges.every((edge) => crossing.edges.includes(edge)) && crossing.o > a.rIn);
  if (!arc) return null;
  const point = erosionVertex(plan.poly, plan.ctx, arc, crossing.o);
  return point ? { ...arc, point } : null;
}
