// Copyright (c) Meta Platforms, Inc. and affiliates.

// track.js — derived geometry of a ball-return track (feature 037, issue #650).
//
// PURE and node-importable (no three.js, no DOM). Input: a definition in the
// `openbilliards/ball-return-track/1` schema (docs/geometry/ball-return-track.*),
// millimetres in the TCS-TBL-01 frame; output: runways as polylines in three.js
// metres (x long toward the foot, y up, z short — axis for axis × 0.001), per-edge
// tangents/slopes/arclengths, implicit junction landings (a runway's last vertex
// projected onto its `next`), per-served-pocket ROUTES with a remaining-distance
// coordinate D (metres to the tray wall), and the ball-radius-dependent quantities
// the kinematics needs (centre offset h, rolling radius ρ, inertia factor k).
//
// Every quantity here is a DERIVATION over the definition's reads and the active
// ball radius — the file carries no constant of its own except the kernel gravity
// mirror used by the drain rule (SINK_G = 9.8, sinkpivot.js) and the ClothPreset
// mirror (params.rs / shot.ts) the validator cross-checks against.

export const MM = 0.001;
/** The export grain: the exporter rounds vertices to 0.1 mm (schema §units), so a support piece
 * shorter than this is a rounding, not an edge (`buildRoute`'s sliver rule), and a landing that falls
 * within it of a vertex lands ON the vertex (the landing snap, seal 15). */
export const EXPORT_GRAIN = 0.1 * MM;
/** [DESIGN guard] The nudge that lands a boundary probe INSIDE the next segment (1 nm — five
 * decades below the export grain, so it can never step past a real piece). It is NOT the test
 * that picks the side: `sideD` decides that against `locate`'s own boundary tolerance, because a
 * seated follower's station is solved, not snapped, and lands fractions of a nanometre either side
 * of a break (a wire-slide follower measured 0.513 nm above the tray lip while still ON the trunk —
 * a 1 nm side test read it onto the cut and gave its launch the cut's Jacobian, 1.0218 instead of
 * 1.0082). A station reads the segment it stands on; only one sitting exactly ON a boundary steps
 * down to the piece it is about to travel. */
export const SIDE_EPS = 1e-9;
/** locate()'s own boundary tolerance — the width of "exactly on the boundary". */
export const BOUND_TOL = 1e-12;
export const G = 9.8; // sinkpivot.js SINK_G — the visible-fall gravity of the render layer

/** ClothPreset u_r mirror (crates/pool-core/src/params.rs `ClothPreset`,
 * sdk/ts/src/shot.ts `clothPreset`) — the rolling-resistance classes a track may
 * point at. Values are the repo's, not this module's. */
export const PRESET_UR = Object.freeze({
  default: 0.01,
  simonis_860_tournament: 0.01,
  simonis_760_fast: 0.008,
  worn_slow: 0.016,
  snooker_napped: 0.0128,
});

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (v) => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Unit normal of an edge in the vertical plane containing its tangent, pointing
 * UP out of the support (ŷ with the tangent component removed). The ball centre
 * sits at P(s) + h·n̂. A VERTICAL tangent lies in every vertical plane, so it has
 * no such normal: the ŷ fallback below is reached only on an edge no ball rolls on
 * (the stop's own body beyond the wall face — an up-turn clamp lip), because buildTrack
 * refuses a vertical TRAVERSED edge and a definition is refused earlier by law V12. */
function upNormal(t) {
  const n = [-t[1] * t[0], 1 - t[1] * t[1], -t[1] * t[2]];
  const l = len3(n);
  return l > 1e-12 ? [n[0] / l, n[1] / l, n[2] / l] : [0, 1, 0];
}

/** Does this edge (or run) carry a support normal at all? A VERTICAL piece does not: its
 * `upNormal` is the ŷ fallback above, PARALLEL to the tangent, and the rolling axis n̂ × t̂
 * collapses to zero. The floor is a RATIO of the horizontal extent to the length — three
 * decades above `upNormal`'s own fallback threshold — and it is the SAME floor law V12
 * refuses on, written once here and used by all three of its readers: buildTrack's graph
 * belt, buildRoute's stop-body exclusion and buildRoute's own belt. */
const hasSupportNormal = (e) => Math.hypot(e.p1[0] - e.p0[0], e.p1[2] - e.p0[2]) > 1e-9 * e.len;

/** Support kind → the radius-dependent trio for ball radius r (metres). */
export function supportDerived(support, r) {
  if (support.kind === 'twin-rail') {
    const half = support.gauge / 2;
    const rw = support.railR;
    const h = Math.sqrt((r + rw) * (r + rw) - half * half);
    const c = half * r / (r + rw);
    const rho = Math.sqrt(r * r - c * c);
    const k = 1 / (1 + 0.4 * (r / rho) * (r / rho));
    return { h, rho, k, tol: half };
  }
  // channel: flat floor contact under the centre
  return { h: r, rho: r, k: 1 / 1.4, tol: support.width / 2 };
}

function normSupport(s) {
  if (!s) return null;
  if (s.kind === 'twin-rail') {
    return { kind: 'twin-rail', gauge: s.gauge_mm * MM, railR: s.rail_diameter_mm * MM / 2 };
  }
  return { kind: 'channel', width: s.width_mm * MM };
}

/**
 * The definition's own coordinate LATTICE (GH-770 review r1, class S). A file prints its vertices
 * as decimals, so three printed vertices are EXACTLY collinear or they are not — the question has
 * an exact answer and no tolerance belongs in it. `latticeDecimals` reads the file's own printed
 * precision — the most decimal places any coordinate of any runway uses — which is only the
 * denominator that makes every coordinate an exact integer: any finer precision reduces to the
 * same directions, so this is a scale, not a threshold. `dirKeyOf` then reduces an edge's integer
 * delta by its gcd, and two edges carry the same key iff the file states the same rational
 * direction for both — a bend the file cannot express. EVERY finite double has exactly
 * one such expansion, exponent notation included: `String(v)` prints `1e-7` for a coordinate a file may
 * legitimately state, and reading only the PLAIN form made that one token disable coalescing for the
 * WHOLE definition — an independent chain's x moved from 0 to 1e-7 moved an untouched route
 * 164.891950 -> 172.648092 mm (GH-770 review r3, class X; arms X1-X6). The exponent is applied by
 * SHIFTING THE DECIMAL POINT of the mantissa's own digits — a string operation, like the padding below —
 * so the expansion is exact at every magnitude a double has, 5e-324 and 1.7976931348623157e+308 included.
 * A token with NO expansion (not a finite number at all — law V0 refuses those upstream, vertex by
 * vertex) leaves THAT POINT without a key and nothing else: the edges touching it do not coalesce, and
 * every other run of the definition keys exactly as it always did.
 * NEAR-collinear facets (a direction that differs in the file's own digits, however slightly —
 * the sampled Star export's sub-grain bends, r67) are NOT the same edge and are not merged here:
 * that remains GH-769's design question.
 *
 * The integer is built by SHIFTING THE DECIMAL POINT of the coordinate's own decimal string —
 * right-pad the fractional digits with zeros to the file's count, concatenate, parse as a BigInt —
 * and never by re-formatting the number at a chosen precision (GH-770 review r2, class K). A
 * `toFixed(d)` is a FLOAT operation: at a d the coordinate did not need it prints the double's
 * error, `(-573.44).toFixed(13) === '-573.4400000000001'`, so one 13-decimal coordinate anywhere
 * in the file moved the key of an exactly collinear leg elsewhere in it and the class-S regression
 * came back (164.891950 mm read as 172.648092 mm; arms K1–K4). Padding cannot do that: it is a
 * string operation on digits the double already round-trips to, and it is exact at every d.
 * The BigInt makes the scale unbounded — a file may print as finely as it likes, 2^53 is not a
 * limit on it — and keeps `dirKeyOf`'s gcd exact, which is what makes the key invariant to d.
 *
 * Which decimal string: `String(v)` — the SHORTEST decimal that round-trips to the coordinate,
 * which is the exporter's own token for every plain decimal a writer prints (a token that did not
 * round-trip would not be the value the rest of the reader computes with). The raw JSON token is
 * not available at this boundary and would be the wrong input if it were: every caller hands the
 * reader a PARSED definition (`res.json()` in index.js, `JSON.parse` in the tools, and the test
 * and e2e fixtures build definitions in memory, where no token exists at all), and two tokens for
 * one double — `0.1` and `0.10000000000000001` — are one point that must key alike or the merge
 * would depend on typography instead of geometry.
 */
const DECIMAL_TOKEN = /^-?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
function decimalParts(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;   // law V0's own predicate (jsonschema.js: `number` is finite-only), restated where it is read
  const s = String(v);
  const m = DECIMAL_TOKEN.exec(s);
  if (!m) return null;
  const digits = m[1] + (m[2] ?? '');
  // the decimal point sits after the mantissa's integer digits; the exponent SHIFTS it, digit by digit
  const point = m[1].length + (m[3] ? Number.parseInt(m[3], 10) : 0);
  const neg = s.charCodeAt(0) === 45;
  if (point <= 0) return { neg, int: '0', frac: '0'.repeat(-point) + digits };
  if (point >= digits.length) return { neg, int: digits + '0'.repeat(point - digits.length), frac: '' };
  return { neg, int: digits.slice(0, point), frac: digits.slice(point) };
}
function latticeDecimals(def) {
  let d = 0;
  for (const rw of def.runways ?? []) {
    for (const p of rw.points_mm ?? []) {
      for (const v of p) {
        const q = decimalParts(v);
        if (!q) continue;                        // no expansion: THIS point loses its key (below), never the definition
        if (q.frac.length > d) d = q.frac.length;
      }
    }
  }
  return d;
}
function latticePoint(p, d) {
  const out = [];
  for (const v of p) {
    const q = decimalParts(v);
    if (!q || q.frac.length > d) return null;   // d is the file's maximum: this cannot happen
    const n = BigInt(q.int + q.frac.padEnd(d, '0'));
    out.push(q.neg ? -n : n);
  }
  return out;
}
const bigAbs = (x) => (x < 0n ? -x : x);
const gcd2 = (a, b) => { while (b) { const t = a % b; a = b; b = t; } return a; };
function dirKeyOf(a, b) {
  if (!a || !b) return null;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const g = gcd2(gcd2(bigAbs(u[0]), bigAbs(u[1])), bigAbs(u[2]));
  if (!(g > 0n)) return null;
  return `${u[0] / g},${u[1] / g},${u[2] / g}`;
}

/**
 * The runway's edges grouped into maximal EXACTLY-collinear runs — the geometry's own straight
 * pieces. Every length rule of `buildRoute` (the sliver drop, the trailing-fragment drop, the
 * corner cut's 45 % clamp and the twist windows) is written over these and not over the exported
 * facets, because a route is a function of the GEOMETRY and not of how finely an exporter sampled
 * it: the same wire re-cut into four collinear facets seated the ball 7.756 mm further down the
 * track before this (GH-770 review r1, class S; the arms are t9f/t9g). A run of one edge IS that
 * edge — the same object — so a definition with no collinear run reads exactly as it did, and the
 * runs are built once per runway, so two routes that share a runway share their identity (the
 * merge scan's "our own lane" test is an edge-identity test).
 * The MEMBERS stay in `edges`: the laws (V7's uphill test, V12's vertical edge, the kink census)
 * read what the file wrote, vertex by vertex.
 */
function mergeRun(list) {
  const first = list[0];
  const last = list[list.length - 1];
  const d = sub(last.p1, first.p0);
  const l = len3(d);
  const t = [d[0] / l, d[1] / l, d[2] / l];
  const n = upNormal(t);
  return { p0: first.p0, p1: last.p1, len: last.s0 + last.len - first.s0, t, n,
    sinTh: -t[1], cosTh: Math.sqrt(Math.max(0, 1 - t[1] * t[1])), s0: first.s0,
    axis: cross(n, t), dir: first.dir, parts: list };
}
function collinearRuns(edges) {
  const runs = [];
  let start = 0;
  for (let i = 1; i <= edges.length; i++) {
    if (i < edges.length && edges[i].dir !== null && edges[i].dir === edges[i - 1].dir) continue;
    runs.push(i - start === 1 ? edges[start] : mergeRun(edges.slice(start, i)));
    start = i;
  }
  return runs;
}

/**
 * Build the derived track. Throws on graph defects (the validator wraps this and
 * adds the law-level refusals). `ctx` is optional here (used by the validator).
 */
export function buildTrack(def) {
  const support = normSupport(def.support);
  const runways = new Map();
  const latDec = latticeDecimals(def);               // the file's own printed precision (class S)
  for (const rw of def.runways) {
    if (runways.has(rw.id)) throw new Error(`runway graph: duplicate id ${rw.id}`);
    const pts = rw.points_mm.map((p) => [p[0] * MM, p[1] * MM, p[2] * MM]);
    const lat = rw.points_mm.map((p) => latticePoint(p, latDec));
    const edges = [];
    let s = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const d = sub(pts[i + 1], pts[i]);
      const l = len3(d);
      if (!(l > 1e-9)) throw new Error(`runway graph: ${rw.id} vertex ${i} repeats vertex ${i + 1}`);
      const t = [d[0] / l, d[1] / l, d[2] / l];
      const sinTh = -t[1];                       // downward slope positive
      const cosTh = Math.sqrt(Math.max(0, 1 - t[1] * t[1]));
      const n = upNormal(t);
      edges.push({ p0: pts[i], p1: pts[i + 1], len: l, t, n, sinTh, cosTh, s0: s,
        axis: cross(n, t),                        // rolling axis n̂ × t̂ (see kinematics)
        dir: lat ? dirKeyOf(lat[i], lat[i + 1]) : null });  // the file's own rational direction
      s += l;
    }
    runways.set(rw.id, {
      id: rw.id, role: rw.role ?? null, next: rw.next ?? null, pts, edges, runs: collinearRuns(edges), length: s,
      support: normSupport(rw.support) ?? support,
      landingS: null, landingMiss: null,
    });
  }
  // topology (schema 1.1): trunk-tray — ONE terminal runway, the tray, every chain
  // reaches it; terminal-chutes — every terminal runway is a role-chute with a
  // `stop`, the wall is the stop face at wall_s_mm along that chute
  const topology = def.topology ?? 'trunk-tray';
  const terminal = topology === 'terminal-chutes';
  const trayId = terminal ? null : def.tray?.runway;
  const rests = new Map(); // terminal runway id → { runway, wallS, capacity } (the rest surfaces)
  if (!terminal && !runways.has(trayId)) throw new Error(`runway graph: tray runway ${trayId} missing`);
  for (const rw of runways.values()) {
    if (rw.next !== null && !runways.has(rw.next)) {
      throw new Error(`runway graph: ${rw.id}.next = ${rw.next} does not exist`);
    }
    if (!terminal) {
      if (rw.next === null && rw.id !== trayId) throw new Error(`runway graph: ${rw.id} has next = null but is not the tray`);
      if (rw.id === trayId && rw.next !== null) throw new Error('runway graph: the tray must have next = null');
      if (rw.id === trayId) rests.set(rw.id, { runway: rw, wallS: rw.length, capacity: def.tray?.capacity_balls ?? 0 });
      continue;
    }
    const src = def.runways.find((r) => r.id === rw.id);
    if (rw.next === null) {
      if (rw.role !== 'chute' || !src?.stop) throw new Error(`runway graph: terminal runway ${rw.id} must be a role-chute runway with a stop (terminal-chutes)`);
      const wallS = src.stop.wall_s_mm * MM;
      if (!(wallS > 0)) throw new Error(`runway graph: chute ${rw.id} stop.wall_s_mm must be > 0`);
      rests.set(rw.id, { runway: rw, wallS: Math.min(wallS, rw.length), wallSDeclared: wallS, capacity: src.stop.capacity_balls ?? 0, kind: src.stop.kind ?? null });
    } else if (rw.role === 'chute' || src?.stop) {
      throw new Error(`runway graph: ${rw.id} carries a stop / role chute but is not terminal`);
    }
  }
  if (terminal && rests.size === 0) throw new Error('runway graph: terminal-chutes needs at least one chute');
  // (review r9 P2-2) a vertical edge has no support orientation: upNormal returns a normal
  // PARALLEL to the tangent there and the rolling axis n̂ × t̂ collapses (non-unit roll
  // quaternions downstream). This is the belt for a DIRECT caller — a definition is
  // refused earlier, with the law line, by V12, which uses the SAME floor (a ratio, three
  // decades above upNormal's own fallback threshold) and the SAME exemption: the stop's
  // own body beyond the wall face is never traversed (V7 exempts it from the drain law
  // too) and an up-turn clamp lip standing straight up is a shipped shape
  for (const rw of runways.values()) {
    const rest = rests.get(rw.id);
    for (const [i, e] of rw.edges.entries()) {
      if (rest && e.s0 >= rest.wallS - MM) continue;
      if (!hasSupportNormal(e)) {
        throw new Error(`runway graph: ${rw.id} edge ${i} is vertical (no support normal, no rolling axis)`);
      }
    }
  }
  // implicit junctions: project the last vertex onto the nearest edge of next
  for (const rw of runways.values()) {
    if (rw.next === null) continue;
    const nx = runways.get(rw.next);
    const P = rw.pts[rw.pts.length - 1];
    let best = null;
    for (const e of nx.edges) {
      const w = sub(P, e.p0);
      const u = Math.min(e.len, Math.max(0, dot(w, e.t)));
      const q = [e.p0[0] + e.t[0] * u, e.p0[1] + e.t[1] * u, e.p0[2] + e.t[2] * u];
      const miss = len3(sub(P, q));
      if (!best || miss < best.miss) best = { miss, s: e.s0 + u };
    }
    rw.landingS = best.s;
    rw.landingMiss = best.miss;
    rw.landingSnap = 0;
    // The landing snap (seal 15, verification round 14's sliver): a landing within one export
    // grain UPSTREAM of an interior vertex of `next` leaves a first piece shorter than the grain,
    // which the sliver rule drops — the route then enters `next` AT the vertex, while `landingS`
    // still names a station 0.01–0.05 mm before it that no segment of the route covers, so the
    // route's own merge (`stationD` → null) was silently lost and its balls rolled into the
    // junction without a yield (0.677 mm between two drawn balls on a kinked trunk, 8.66 mm on a
    // collinear one). The geometry already treats such a landing as the vertex; the bookkeeping
    // now agrees: the station is moved onto the vertex (the same grain the sliver rule uses, an
    // exporter's rounding, never a refusal — the definition is schema-valid and unambiguous).
    // Round 3 (refuter 2b): the snap follows the SLIVER CHAIN, exactly as the sliver rule will —
    // from the landing, while the remainder of the edge it stands on is shorter than the grain
    // the route enters at that edge's end vertex, and every following whole edge shorter than the
    // grain is dropped too, so the route enters at the LAST vertex of the chain (two interior
    // vertices 0.05 mm apart, or a landing exactly ON a vertex followed by a sub-grain edge, put
    // the route one vertex further than round 1's first-match snap and lost the merge again:
    // 4.197 mm between two drawn balls). If the chain runs out at the runway's END the landing is
    // within a grain of the runway's last vertex: on a terminal runway that is the stop face,
    // which `buildRoute` refuses by name; on a runway that continues it is refused HERE by name —
    // the definition lands a feeder on the last 0.1 mm of a runway it never travels, and its own
    // merge belongs to the runway it actually enters (the exporter should land it there). The
    // comparison is `< EXPORT_GRAIN` on the exported values, the same expression the sliver rule
    // uses, so the two always agree (a nominal 0.1 mm edge that evaluates to 0.09999999999994 mm
    // is a sliver to both).
    let sIn = rw.landingS;
    let iEdge = nx.edges.findIndex((e) => sIn <= e.s0 + e.len + 1e-12);
    if (iEdge < 0) iEdge = nx.edges.length - 1;
    while (iEdge < nx.edges.length) {
      const e = nx.edges[iEdge];
      const vS = e.s0 + e.len;
      if (!(vS - sIn < EXPORT_GRAIN)) break;   // the rest of this edge is a real piece: the route enters here
      sIn = vS; iEdge += 1;                     // a sliver: the route enters at (or after) this vertex
    }
    if (iEdge >= nx.edges.length && !rests.has(nx.id)) {
      throw new Error(`runway graph: ${rw.id} lands on ${nx.id} within one export grain (${EXPORT_GRAIN / MM} mm) of its end — s ${(rw.landingS / MM).toFixed(4)} of ${(nx.length / MM).toFixed(4)} mm; it would never travel ${nx.id} and its own merge would be lost: land it on ${nx.next} instead (the last-vertex sliver)`);
    }
    if (sIn > rw.landingS && iEdge < nx.edges.length) { rw.landingSnap = sIn - rw.landingS; rw.landingS = sIn; }
  }
  // acyclic + every runway reaches a rest surface (the tray, or a chute)
  for (const rw of runways.values()) {
    const seen = new Set();
    let cur = rw;
    while (cur.next !== null) {
      if (seen.has(cur.id)) throw new Error(`runway graph: cycle through ${cur.id}`);
      seen.add(cur.id);
      cur = runways.get(cur.next);
    }
    if (!rests.has(cur.id)) throw new Error(`runway graph: ${rw.id} does not reach ${terminal ? 'a chute' : 'the tray'}`);
  }
  const tray = terminal ? null : runways.get(trayId);
  const track = {
    id: def.doc?.title ?? trayId ?? 'terminal-chutes',
    tableId: def.doc?.table_id ?? null,
    status: def.doc?.status ?? null,
    debugVisual: def.debug_visual === true,
    topology,
    support,
    u_r: def.rolling_resistance?.u_r,
    refR: (def.ball?.reference_diameter_mm ?? 0) * MM / 2,
    runways,
    rests,
    tray: tray ? { runway: tray, capacity: def.tray?.capacity_balls ?? 0, length: tray.length } : null,
    routes: new Map(),
    served: (def.pockets ?? []).map((p) => p.index),
    unserved: (def.unserved_pockets ?? []).map((p) => p.index),
    derivedCache: new Map(),
  };
  for (const p of def.pockets ?? []) {
    if (!runways.has(p.entry_runway)) {
      throw new Error(`runway graph: pocket ${p.index} entry runway ${p.entry_runway} missing`);
    }
    const route = buildRoute(track, runways.get(p.entry_runway), p.index);
    // the lowest solid of the pocket assembly: the ball is SHOWN only once its
    // top is below this height (inside the cup it stays culled, as the sink left it)
    route.exitY = Number.isFinite(p.exit_below_y_mm) ? p.exit_below_y_mm * MM : null;
    track.routes.set(p.index, route);
  }
  // trunk-tray: the tray alone is also a route (ledger balls rest on it); a
  // terminal system has no collector — a ball with no known chute is not posed
  track.trayRoute = tray ? buildRoute(track, tray, -1) : null;
  // yield stations (review r4 P2-1, junction half; review round 6b): the merge-window
  // law is a path-length law, but two paths meeting at a sharp angle bring a ball one
  // ball length BEFORE the merge point closer than one diameter to a ball just past
  // it on the other path (a 4.6 mm interpenetration at the TEST fixture's 76° joint).
  // Per route and merge point, the hold station is pushed up the approach until the
  // CHORD to every station of every other path through the point that a ball can
  // OCCUPY while this one holds is at least one diameter. That span runs from one
  // diameter past the point (the release condition: an occupant clears the window a
  // diameter past it) back to the far end of the peer's own hold — the peer's yield
  // station, which the cap below bounds at two diameters before the point (review r10
  // P2-1: the old scan stopped one diameter short of that, so at a shallow merge two
  // balls could hold, each at its own yield station, 17.2 mm apart on a 57.15 mm
  // diameter and neither was ever tested against the other). Scanned at the schema's
  // own grain; a merge with no clear station inside the cap is REFUSED (FR-006) —
  // paths that stay within one diameter of each other for two diameters of approach
  // cannot hold a ball clear at all, whatever the protocol does.
  for (const route of [...track.routes.values(), ...(track.trayRoute ? [track.trayRoute] : [])]) {
    // A peer station is the SAME lane — the contact law's domain, where path distance is the
    // chord and the release condition governs it — only where OUR OWN route runs: on that
    // runway, at or after our landing station (stationD is null upstream of our entry to a
    // runway and past our rest face). Everything else is foreign geometry, INCLUDING a station
    // of a runway we share that lies UPSTREAM of where we land on it (review round 14: the
    // by-edge test of round 13 read a whole shared edge as ours, so a feeder landing mid-edge
    // on a trunk that already carries traffic never tested the traffic above its landing, and
    // at 35° it held its ball 32.7 mm from a trunk ball rolling past — a 24.4 mm interpenetration).
    const myLines = new Set(route.segs.map((sg) => sg.edge));
    for (const m of route.merges) {
      const twoR = 2 * track.refR;
      const grain = 0.1 * MM; // the export grain: no blend can hide between two samples (review round 8)
      m.yieldD = m.D + twoR;
      // Every station of every other path that a ball can occupy while we hold, sampled once
      // (the scan below moves OUR ball, not theirs, so the peer samples are loop-invariant).
      // The bound is a SPATIAL one, not a window on the peer's own path length (review round
      // 14; §17.1's "nothing a peer can occupy is outside the window" was over-general): our
      // own candidate stations lie within two diameters of the merge point along OUR path,
      // hence within two diameters of it in space — a path is never shorter than its chord —
      // so a peer station more than three diameters from the merge point in SPACE cannot come
      // within one diameter of any of them. Coarse pass at a quarter diameter, refined at the
      // schema's own grain: between two coarse samples a station moves at most a quarter
      // diameter in space, so no peer station inside the reach can hide between them.
      const J = {};
      stationAt(route, m.D, track.refR, J);
      // ONE reading of "our own lane" (review round 14's mutant T5: the scan and the refinement
      // below each carried their own copy of this predicate, and reverting the refinement's copy
      // to the by-edge form changed no measured number on any fixture — the two can only be kept
      // in step by there being one of them). A peer station is ours, and no obstacle, exactly
      // where it BOTH sits on an edge our route also runs at or after our own landing AND is on
      // the very edge OUR CANDIDATE stands on: same-lane peers are the contact law's domain
      // because a ball queueing behind another on the same edge is seated one diameter in 3-D
      // behind it — but a ball HOLDING on its feeder is not queueing at all, and the edge it
      // will later share says nothing about how close that edge passes to where it waits
      // (refuter 1, round 14: an admitted obtuse mid-edge merge folds the feeder back
      // alongside the trunk, so on TEST-obtuse-merge — 130° in plan — the hold stood 45.32 mm
      // from a trunk ball rolling past it under the seal-13 rule and 46.75 mm under the
      // narrowed one, with every trunk station dropped as "ours"). So the
      // peer scan tags each station with the shared edge it sits on, or null when it is
      // foreign, and the gap scan drops only those tagged with the edge it is standing on.
      const laneOf = (q, x) => {
        const lq = locate(q, x);
        return (myLines.has(lq.seg.edge) && stationD(route, lq.rw.id, lq.sLocal) !== null) ? lq.seg.edge : null;
      };
      const myEdgeAt = (D) => locate(route, Math.min(Math.max(D, 0), route.total)).seg.edge;
      const reach = 3 * twoR;
      const coarse = 0.25 * twoR;
      const pts = [];
      const b = {};
      const distJ = (q, x) => { stationAt(q, x, track.refR, b); return Math.hypot(b.x - J.x, b.y - J.y, b.z - J.z); };
      for (const q of track.routes.values()) {
        if (q === route) continue;
        const hi = q.total + twoR; // one diameter upstream of its entry: a ball seated at a landing
        const wins = [];
        for (let x = 0; ; x = Math.min(hi, x + coarse)) {
          if (distJ(q, x) <= reach + coarse) {
            const lo0 = Math.max(0, x - coarse);
            const hi0 = Math.min(hi, x + coarse);
            const last = wins[wins.length - 1];
            if (last && lo0 <= last[1] + 1e-12) last[1] = Math.max(last[1], hi0);
            else wins.push([lo0, hi0]);
          }
          if (x >= hi) break;
        }
        for (const [lo0, hi0] of wins) {
          const NS = Math.max(1, Math.ceil((hi0 - lo0) / grain));
          for (let k = 0; k <= NS; k++) {
            const x = lo0 + (hi0 - lo0) * (k / NS);
            stationAt(q, x, track.refR, b);
            if (Math.hypot(b.x - J.x, b.y - J.y, b.z - J.z) > reach) continue;
            pts.push({ q, x, px: b.x, py: b.y, pz: b.z, lane: laneOf(q, x) });
          }
        }
      }
      if (!pts.length) continue;
      const a = {};
      const c = {};
      // The sampled minimum is REFINED to the true one (review round 14): sampling a smooth
      // path at the grain understates a tangential graze by up to (grain/2)²/(2·2r) ≈ 22 nm,
      // and the TEST fixture's own symmetric feeders graze at 7.5 nm — so which side of the
      // law a hold falls on would otherwise be decided by where the samples happen to land.
      // The coarse argmin is within that same bound of the true minimum, so it is the only
      // sample whose own window can hold it; a golden section over [x − grain, x + grain]
      // (the peer's own exclusion re-tested at the refined station) closes the bound.
      const distTo = (q, x) => {
        stationAt(q, x, track.refR, c);
        return Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z);
      };
      const foreignAt = (q, x, myEdge) => (x >= 0 && x <= q.total + twoR && laneOf(q, x) !== myEdge);
      const PHI = 0.5 * (Math.sqrt(5) - 1);
      const gapAt = (D) => {
        stationAt(route, D, track.refR, a);
        const myEdge = myEdgeAt(D);
        let g = Infinity;
        let arg = null;
        for (const pt of pts) {
          if (pt.lane === myEdge) continue; // the queue ahead of us on the edge we are standing on
          const d = Math.hypot(a.x - pt.px, a.y - pt.py, a.z - pt.pz);
          if (d < g) { g = d; arg = pt; }
        }
        if (!arg) return g;
        let lo = arg.x - grain;
        let hi = arg.x + grain;
        let x1 = hi - PHI * (hi - lo);
        let x2 = lo + PHI * (hi - lo);
        let f1 = distTo(arg.q, x1);
        let f2 = distTo(arg.q, x2);
        for (let it = 0; it < 40 && hi - lo > 1e-12; it++) {
          if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - PHI * (hi - lo); f1 = distTo(arg.q, x1); }
          else { lo = x1; x1 = x2; f1 = f2; x2 = lo + PHI * (hi - lo); f2 = distTo(arg.q, x2); }
        }
        const xr = 0.5 * (lo + hi);
        if (foreignAt(arg.q, xr, myEdge)) { const dr = distTo(arg.q, xr); if (dr < g) g = dr; }
        return g;
      };
      const cap = Math.min(m.D + 2 * twoR, route.total);
      let widest = -Infinity;
      let held = null;
      for (let D = Math.min(m.D + twoR, cap); ; D = Math.min(cap, D + grain)) {
        const g = gapAt(D);
        if (g > widest) widest = g;
        if (g >= twoR - 1e-9) { held = D; break; }
        if (D >= cap) break;
      }
      if (held === null) {
        throw new Error(`runway graph: pocket ${route.pocket} cannot hold clear of the ${m.feeder} merge on ${m.rw.id} at s ${(m.s / MM).toFixed(1)} mm — the widest gap to the other path over the two diameters of approach the protocol can use is ${(widest / MM).toFixed(1)} mm, under the ${(twoR / MM).toFixed(2)} mm ball diameter (the paths meet too shallowly for either ball to wait clear of the other)`);
      }
      m.yieldD = held;
    }
  }
  return track;
}

const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const unit3 = (v) => { const l = len3(v); return l > 1e-15 ? [v[0] / l, v[1] / l, v[2] / l] : v; };
const angle3 = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
/** Spherical interpolation of two unit vectors (the arc a ball centre sweeps
 * while it pivots on a convex vertex). */
const slerp3 = (a, b, f) => {
  const th = angle3(a, b);
  if (th < 1e-9) return a;
  const sa = Math.sin((1 - f) * th) / Math.sin(th);
  const sb = Math.sin(f * th) / Math.sin(th);
  return unit3(add3(mul3(a, sa), mul3(b, sb)));
};

/**
 * A route = the runway chain from `entry` to its rest surface (the tray, or the
 * chute's stop face), with D (metres to the wall) as the coordinate. D is the
 * arclength of the BALL-CENTRE PATH (seal 6, review r4 P2-4): the support polyline
 * offset by h along each edge's up-normal, made C0-continuous at every vertex and
 * junction — a convex vertex (the next edge falls away) is an ARC of radius h about
 * the vertex the ball pivots on; a concave vertex (a valley, a flattening run, the
 * chute's lip) is a CORNER CUT where the ball touches both edges at once (the two
 * offset lines meet h·tan(θ/2) before and after the vertex); a junction landing
 * (a projected point with a small miss, possibly a support change) or a skew
 * concave joint gets a short straight connector between the two cut points. The
 * path is built for the track's reference ball radius (`ball.reference_diameter_mm`
 * / 2 — the same radius every capacity identity uses); the controller refuses a
 * ball set of another radius. `spans` (support s-ranges per runway, in D) and
 * `breaks` (the D stations where the runway or the support edge changes, DESCENDING)
 * are derived from the same segments.
 */
function buildRoute(track, entry, pocket) {
  const r = track.refR;
  if (!(r > 0)) throw new Error('runway graph: ball.reference_diameter_mm must be > 0');
  const chain = [];
  const parts = [];
  let cur = entry;
  let sStart = 0;
  while (cur) {
    const rest = track.rests.get(cur.id);
    const end = rest ? rest.wallS : cur.length; // a chute ends at its stop face, not at its last vertex
    const covered = end - sStart;
    if (!(covered > 0)) throw new Error(`runway graph: pocket ${pocket} lands on ${cur.id} at s ${(sStart / MM).toFixed(1)} mm, at or beyond its stop face ${(end / MM).toFixed(1)} mm`);
    parts.push({ rw: cur, sStart, end });
    chain.push(cur.id);
    const nextS = cur.landingS;
    cur = cur.next === null ? null : track.runways.get(cur.next);
    sStart = nextS ?? 0;
  }
  // support pieces in travel order: each RUN — the runway's maximal exactly-collinear group of
  // edges, `collinearRuns` above — clipped to the covered s-range. The run, not the exported
  // facet, is the unit every length rule below is written over (GH-770 review r1, class S): the
  // route is a function of the geometry, and an exporter that cuts one straight leg into four
  // collinear facets must read the same route it reads for the whole leg. A piece
  // shorter than the export grain (0.1 mm — an exporter's rounding of the stop face onto
  // a vertex: the XW101 slides' middle chutes stop at 442.300 mm against a sampled vertex
  // at 442.2749, a 0.0251 mm piece) is a sliver, not an edge: it is dropped, otherwise the
  // blend into it would swing the centre by 2h·sin(θ/2) over no support travel at all (a
  // 36.6 mm phantom at a chute's lip)
  // A piece that is the STOP'S OWN BODY is not walked. That body is the class law V12 exempts
  // from its vertical-edge refusal (V7 exempts it from the drain law for the same reason): the
  // face is written on the exporter's grain, so an up-turn clamp lip — a shipped shape, every
  // XW101 chute carries one — may begin a hair BEFORE the declared face and still be the wall,
  // not the floor. The exclusion is a property of the PIECE and carries V7's and V12's
  // exemption class exactly: inside the same 1 mm stop-body grain buildTrack's belt above uses,
  // station for station, a piece that DOES NOT DRAIN is that body — V7's own predicate, the one the
  // validator refuses a travelled edge on, read here through `drainsAt` (GH-770 review r3, class U;
  // arms U1-U5). Verticality is not the test and neither is the up-turn: they are cases of it.
  // The r2 test read verticality alone, so a lip rising 0.48 mm over 0.14 mm — 73.74°, steep but not
  // vertical — at the face of a 100.5 mm channel chute passed through it, the route walked a
  // 54.738 mm connector into the corner, and solveShot rested the ball 3.195 mm from the channel
  // floor: 25.380 mm INSIDE it. The up-turn is not the boundary of the defect either. A LEVEL 0.5 mm
  // pad at the same face is walked by the same reader and sinks the resting ball 3.378 mm, and a pad
  // that descends too gently to drive the ball is the same shape again: what all three have in common
  // is the drain law, which is why V7's exemption and this exclusion carry the SAME predicate rather
  // than two that agree on the shipped definitions. `hasSupportNormal` still stands beside it for a
  // straight-DOWN oddity, which drains perfectly and is still no one's floor.
  // Reading a law's predicate means reading that law's EXEMPTIONS with it, and the two laws do not
  // exempt the same things: V12 exempts by ZONE (any runway's last millimetre), V7 exempts by ZONE and
  // additionally the TRAY, which is level by design — it is the rest surface, the one runway the drain
  // law never applies to. So the drain half of the test is waived on the tray and the support-normal
  // half is not. Written with one exemption set for both, this fix DROPPED the last 0.5 mm of an
  // L-shaped level tray whose plan bend put its final run inside its own 1 mm zone
  // (2090.037335 -> 2089.537335 mm), and written with the other it REFUSED the tray's own vertical end
  // wall — a defect each way, found by mirroring the laws rather than by re-deriving them (arm U6).
  // Whole-run retention (class S) made the r2 case visible — with the 0.5 mm
  // lip of a 100.5 mm channel chute retained, the route walked a 34.245 mm connector whose
  // rolling axis n̂ × t̂ was ZERO and solveShot returned a rest quaternion of norm 0.994594
  // (GH-770 review r2, class V; arms V1/V2/V3) — but the retention itself is GH-768's whole-edge
  // guard, and 373b022d walks that lip too: this is the rule the facet reader before it had.
  const SLIVER = EXPORT_GRAIN;
  const pieces = [];
  for (const p of parts) {
    const der = derivedFor(track, p.rw.support, r);
    const h = der.h;
    const rest = track.rests.get(p.rw.id);
    const bodyS = rest ? rest.wallS - MM : Infinity;
    const drainLaw = !track.tray || p.rw.id !== track.tray.runway.id;                  // V7's own exemption: the tray is level by design
    for (const e of p.rw.runs) {
      // the stop's own body: wall, not floor
      if (e.s0 >= bodyS && ((drainLaw && !drainsAt(der, e, r, track.u_r)) || !hasSupportNormal(e))) continue;
      const sA = Math.max(e.s0, p.sStart);
      const sB = Math.min(e.s0 + e.len, p.end);
      if (sB - sA < SLIVER) continue;
      pieces.push({ rw: p.rw, edge: e, sA, sB, h, sA0: sA, sB0: sB });
    }
  }
  if (!pieces.length) throw new Error(`runway graph: pocket ${pocket} covers no support (every piece shorter than ${SLIVER / MM} mm)`);
  // the LAST piece can be a FRAGMENT: the stop face falling INSIDE an edge instead of on the
  // vertex before it (the V7 grain — the 0.0251 mm the XW101 middle chutes stop past their
  // vertex, the 0.05–1 mm an exporter's rounding writes past a valley; anything past it is
  // refused as an uphill edge under V7). Whether such a fragment can carry a resting ball is no
  // longer decided HERE by its length (review 7's rule, deleted in class AA below): it is decided
  // by the corner law in the blend loop, which reads the fragment's walked extent like any other
  // run's and drops it at its own joint when the corner the ball needs does not fit (the 36.6 mm
  // phantom at a chute's lip is that law's case, not a length's).
  const supportPt = (pc, s) => { const u = s - pc.edge.s0; return add3(pc.edge.p0, mul3(pc.edge.t, u)); };
  const centrePt = (pc, s) => add3(supportPt(pc, s), mul3(pc.edge.n, pc.h));
  // ONE RETENTION CRITERION, AND IT READS THE WALKED EXTENT (GH-770 review r6, class AA; arms
  // AA-1..AA-4). There used to be two. A length rule here dropped a trailing piece shorter than its
  // own joint's cut ½(hA+hB)·tan(θ/2), exempting a piece that "ends on its own vertex" — and the
  // test for that exemption, `B.sB > B.edge.s0 + B.edge.len`, was the one reading in the whole walk
  // that looked at the exported edge's END rather than at the interval the walk kept. The corner law
  // below is the other, and it is the derived one: what a retained run has to carry is the corner
  // pen = h(1 − cos θ) − λc·sin θ, a quantity of the JOINT and of the blend's 45 % clamp and not of
  // the run's length. Two criteria over one run is one criterion too many, and the material behind
  // the stop face decided which of them answered: a 73.0 mm channel chute with a 0.5 mm 4.24° tail
  // stopped at 73.5 mm keeps the tail (its corner is 0.0616 mm deep, under the 0.1 mm grain), and
  // the SAME definition with only its final delta doubled — the walked interval [73.0, 73.5] to the
  // last bit, the stop face unmoved, every millimetre of the difference behind the plate — lost it
  // to the length rule and moved the route 132.563425 → 129.893121 mm and the resting ball by
  // 2.670304 mm. Both readings validate and both pass the design gate, so nothing downstream could
  // have caught it. The length rule is GONE; the corner law below is the retention decision, it is
  // read over [sA0, sB0], and a trailing run whose own extent cuts its corner short is dropped
  // THERE — the ball rests on the piece before it, which is what the fragment rule was for.
  // Sub-grain pieces are already dropped by the walk above, and a whole edge is still never a
  // fragment by LENGTH however short (GH-768: the snooker lane's XW101 slides are 49 points, ~6.4 mm
  // of facet against a 26.25 mm ball, and a radius bound popped them one after another until only
  // the first facet was left — 296.180 mm of route read as 2.855 mm at the corner pockets, every
  // arrival then overflowing); it is exempt from LENGTH because the corner law, not a length, is
  // what a run must now answer to. All twelve definitions in tracks/ build byte-identically, and so
  // do all 5 000 cases of the class-W corpus (arm AA-4).
  const allPieces = pieces.slice();     // every piece the walk found: the RIDE below, plus the floor it bridges (the pose law reads both)
  const dropped = [];                   // …and the ones the ride does NOT use: still floor, still measured
  // BELT (GH-770 review r2, class V): every piece the route WALKS carries a support normal, so
  // every rolling axis downstream is a unit vector and every rest quaternion has norm 1. This
  // cannot fire: a piece inside the stop-body grain was excluded above, and a piece before it
  // was checked edge by edge by buildTrack's belt (and refused with its law line by V12) on the
  // same floor. It is written because the consequence is silent — a zero axis makes `qaxis`
  // return (0,0,0,cos ½φ) and the ball simply rests mis-oriented.
  for (const pc of pieces) {
    if (!hasSupportNormal(pc.edge)) {
      throw new Error(`runway graph: pocket ${pocket} walks a vertical piece on ${pc.rw.id} at s ${(pc.edge.s0 / MM).toFixed(3)} mm (no support normal, no rolling axis)`);
    }
  }
  // blends between consecutive pieces (seal 8, review r6 P2). A vertex transition is
  // DECOMPOSED: the HEADING change is spread over the ball's own footprint — a TWIST of the
  // centre's forward-tilt offset h·sinθ from the incoming heading to the outgoing one over
  // up to one ball radius of path on each side of the vertex (the centre keeps moving
  // forward: a heading rotated at a point would swing that offset backward by h·sinθ·(1−cos φ)
  // against the incoming edge, and under the chord law that shoved a follower up its own
  // path) — and the SLOPE change is blended at the vertex in the plane of the mid-heading (a
  // pivot arc over a ridge, a corner cut into a valley), forward-going by construction.
  const horiz = (t) => { const l = Math.hypot(t[0], t[2]); return l > 1e-12 ? [t[0] / l, 0, t[2] / l] : null; };
  const rotY = (v, ang) => { const c = Math.cos(ang), sn = Math.sin(ang); return [c * v[0] + sn * v[2], v[1], -sn * v[0] + c * v[2]]; };
  /** A twist segment (in-plane): the support line of piece `pc` over [sA, sB] with the
   * centre's forward-tilt offset h·sinθ (along the edge's own heading, INSIDE the rails'
   * vertical plane) scaled by w from wFrom to wTo — it shrinks to nothing at the vertex on
   * the incoming side and regrows on the outgoing side, so a heading change costs no
   * lateral excursion and no backward motion; |centre − support| stays h. Arclength is
   * tabulated for the D ↔ point map. */
  const twistSeg = (pc, sA, sB, wFrom, wTo) => {
    const K = 24; const pts = []; const cum = [0];
    const cosT = pc.edge.cosTh, sinT = pc.edge.sinTh;
    const hd = horiz(pc.edge.t) ?? [0, 0, 0];
    const at = (u) => {
      const sP = sA + (sB - sA) * u;
      const sup = add3(pc.edge.p0, mul3(pc.edge.t, sP - pc.edge.s0));
      const w = wFrom + (wTo - wFrom) * u;
      const n = unit3([w * sinT * hd[0], cosT, w * sinT * hd[2]]);
      return [sup[0] + pc.h * n[0], sup[1] + pc.h * n[1], sup[2] + pc.h * n[2]];
    };
    for (let k = 0; k <= K; k++) { const q = at(k / K); pts.push(q); if (k > 0) cum.push(cum[k - 1] + len3(sub(q, pts[k - 1]))); }
    return { kind: 'twist', pts, cum, len: cum[K], sFrom: sA, sTo: sB };
  };
  // how far a centre point is inside piece `p`'s floor — the SAME reading `poseClearance` makes of
  // the same body: the distance to the finite STRIP the piece is (its plane under the foot, its end
  // cap off it), less the h that strip requires. A foot past a run's far vertex is not "not inside
  // it": a 94.5/72.9 mm chute on a 17.7 mm tail puts the centre 9.3 mm inside a tail whose extent
  // the foot has left, and a foot-in-extent reading returns 0 there (arm W7 — the corner law then
  // draws a chord the pose law has to refuse at solve time, which is the belt catching what the
  // construction should have seen). A normal offset is affine along a straight chord, so the deepest
  // point of a cut is still one of its two ends: IB read over A and IA read over B is the whole of
  // it, exactly (arm W3).
  const penInto = (p, C) => {
    const d = sub(C, p.edge.p0);
    const s = p.edge.s0 + dot(d, p.edge.t);
    const sc = Math.max(p.sA0, Math.min(p.sB0, s));
    return p.h - Math.hypot(s - sc, dot(d, p.edge.n));
  };
  // How far a TWIST may put the centre inside its own floor, in closed form. The window ends at the
  // vertex with the tilt offset scaled to nothing — the centre h VERTICALLY above the support point —
  // and h·ŷ read along the edge's own normal is h·cosθ, so the deepest the construction goes is
  // h·(1 − cosθ) at that end (and 0 at the other, where w = 1 is the resting normal itself).
  const twistPen = (pc) => pc.h * (1 - pc.edge.cosTh);
  // the heading change at a boundary, in one place: the blend loop turns it into a twist pair, and
  // the floor groups below break on it (both must mean the same thing by the same numbers)
  const bendPhi = (X, Y) => {
    const a = horiz(X.edge.t);
    const c = horiz(Y.edge.t);
    if (!a || !c) return 0;
    return Math.atan2(a[2] * c[0] - a[0] * c[2], a[0] * c[0] + a[2] * c[2]);
  };
  // WHERE THE RIDE STOPS AGAINST A PIECE THE CORNER PASS DROPPED (GH-770 review r4, class W; arm W2).
  // `P` is the piece the ball rides, `Q` the one dropped at the vertex they share (`end` = which end
  // of P that is). Dropping Q alone is not the cure: the ball would then ride P to P's OWN far end,
  // and a valley's far end is INSIDE the piece across it — a 94.5/72.9 chute with a 17.7 mm 3.7°
  // tail seats the ball 9.325 mm inside that tail at rest, which is the very defect the drop is for.
  // So the rest is solved over the PAIR (the order's multi-piece blend): the ride ends at the first
  // station at which the ball is in contact with P and clear of Q.
  //   sigma(u), nu(u) = the centre's station and normal offset read in Q's frame, both affine in u,
  //   the signed travel along P from the vertex (u <= 0: the ball arrives at the vertex).
  // Q's material is its own STRIP, not its plane, so the ball is clear when
  //   inside Q's extent   nu >= h                        (affine — one root)
  //   past an end of it   (sigma - sEnd)^2 + nu^2 >= h^2 (quadratic — two roots)
  // and that difference is the whole difference between a 60 mm tail (the plane governs: the answer
  // is the corner's own ½(hA+hB)·tan(θ/2)) and a 0.6 mm entry lip (its far edge governs, and the
  // trim is a fraction of it).
  // Q's strip has a WIDTH, and the cascade above hands this pair to every surviving piece of Q's
  // floor group, not only to a slope-only neighbour on one runway (GH-770 review r6, class AB; arms
  // AB-1..AB-4). Where the joint IS slope-only the two centre paths lie in one plane, the lateral
  // coordinate omega is identically zero, the clamp returns it unchanged and `hypot(sigma-sEnd, 0,
  // nu)` is `hypot(sigma-sEnd, nu)` to the bit — which is why dropping the term cost nothing on any
  // shipped tree or on the whole class-W corpus. Where the heading changes it does NOT cancel, and a
  // gap that reads the strip as infinitely wide finds contact where there is only air beside the
  // floor: a 40 mm channel chute of three runs (80.0 mm down, a 2.06 mm 14° plan turn, a 0.25 mm
  // tail) trimmed 28.396964 mm off the ride where first contact with the actual finite strip is at
  // 27.132906 mm — 1.264058 mm of usable support removed, and the resting ball with it. So omega
  // rides in the gap, CLAMPED to the strip's own half-extent exactly as `poseClearance` and the
  // floor rows clamp it, and the roots below cover the four faces that clamp can leave: inside the
  // strip both ways (affine in nu), past an END of it, past a SIDE of it, and past a corner of it.
  // The support's own contact identity — cap² = h² + off², a twin-rail's wires sitting `off` from
  // the centre line and asking cap = r + railR — is what makes the SIDE the same h as the middle,
  // so one h and one half-extent describe both support classes here, as they do in the pose law.
  // The gap is sign-constant between consecutive roots, so the answer is the highest root with every
  // station below it clear — never a root the ball could only reach by passing through Q.
  // Q's strip is the WALKED interval [Q.sA0, Q.sB0] — the same finite strip `penInto`, `poseClearance`
  // and the floor rows read, in the same ABSOLUTE station coordinate (`edge.s0` + the projection).
  // An exported edge can run on past the stop face: the walk clips it there (`sB = min(e.s0 + e.len,
  // p.end)`), so the material past the face is not floor for the ride, and reading the trim against
  // the whole exported edge made a run's OWN length — geometry the ball can never reach — move where
  // it stops (GH-770 review r5, arm Y3: a 4 mm tail extended 1 → 20 mm shifts the synthetic wire
  // slide's seat by 1.121213 mm and its route total by the same, on a support the ride never
  // touches). One reading of "floor", everywhere.
  const clearTrim = (P, Q, end) => {
    const dir = end === 'B' ? 1 : -1;
    const ext = P.sB0 - P.sA0;
    const C0 = centrePt(P, end === 'B' ? P.sB0 : P.sA0);           // the centre AT the vertex
    const tP = mul3(P.edge.t, dir);
    const d0 = sub(C0, Q.edge.p0);
    const bQ = cross(Q.edge.t, Q.edge.n);                          // the strip's own lateral axis
    const s0 = Q.edge.s0 + dot(d0, Q.edge.t), w0 = dot(d0, bQ), n0 = dot(d0, Q.edge.n);
    const ds = dot(tP, Q.edge.t), dw = dot(tP, bQ), dn = dot(tP, Q.edge.n);
    const h = Q.h;
    const tol = derivedFor(track, Q.rw.support, r).tol;            // the half-extent the pose law reads
    const gap = (u) => {
      const s = s0 + u * ds, w = w0 + u * dw, n = n0 + u * dn;
      const sc = Math.max(Q.sA0, Math.min(Q.sB0, s));
      const wc = Math.max(-tol, Math.min(tol, w));
      // Inside the strip's width the clamp returns w itself and `w - wc` is EXACTLY zero, and the gap is
      // then the two-term distance ac673ed7 read — by construction, on every engine. V8 absorbs a zero
      // summand in Math.hypot to the bit; JavaScriptCore (Safari, the shipped iOS ipa) does not (1 ulp
      // in ~3 % of pairs at this scale — round-7 refuter), so the coplanar identity is a branch on the
      // exact zero, not a property of one engine's hypot (GH-770 review r7, P3-2).
      const dwc = w - wc;
      return (dwc === 0 ? Math.hypot(s - sc, n) : Math.hypot(s - sc, dwc, n)) - h;
    };
    // every root of gap(u) = 0 on one of the clamp's four faces; a face the ball never reaches
    // contributes a root the sign walk below discards, so the set may be a superset but never short
    const quad = (a, b, c) => {
      const disc = b * b - 4 * a * c;
      if (a < 1e-15 || disc < 0) return;
      cand.push((-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a));
    };
    const cand = [];
    const sEnds = [Q.sA0, Q.sB0];                                  // the walked interval, read once
    if (Math.abs(dn) > 1e-15) cand.push((h - n0) / dn);            // inside the strip: nu = h, affine
    for (const sEnd of sEnds) {                                    // past an END of it
      quad(ds * ds + dn * dn,
        2 * (ds * (s0 - sEnd) + dn * n0),
        (s0 - sEnd) * (s0 - sEnd) + n0 * n0 - h * h);
    }
    for (const wEnd of [-tol, tol]) {
      quad(dw * dw + dn * dn,                                      // past a SIDE of it
        2 * (dw * (w0 - wEnd) + dn * n0),
        (w0 - wEnd) * (w0 - wEnd) + n0 * n0 - h * h);
      for (const sEnd of sEnds) {                                  // past a CORNER of it
        quad(ds * ds + dw * dw + dn * dn,
          2 * (ds * (s0 - sEnd) + dw * (w0 - wEnd) + dn * n0),
          (s0 - sEnd) * (s0 - sEnd) + (w0 - wEnd) * (w0 - wEnd) + n0 * n0 - h * h);
      }
    }
    const marks = [-ext, ...cand.filter((u) => u > -ext && u < 0).sort((x, y) => x - y), 0];
    let best = null;
    for (let i = 0; i + 1 < marks.length; i++) {
      if (gap(0.5 * (marks[i] + marks[i + 1])) < -1e-12) break;
      best = marks[i + 1];
    }
    return best === null ? null : -best;
  };
  const blends = []; // per boundary i: { aTwist, slope, bTwist } (each possibly null)
  // The corner pass runs until no joint's corner is clamped short of what the ball needs (the LAW
  // in the valley branch below). A joint that IS clamped short drops the piece whose own extent
  // does the clamping — the ball cannot ride a run it can never reach the far end of, so it rides
  // the run BEFORE it and the corner is solved over the pair (the order's multi-piece blend) —
  // and the pass restarts from the top with every extent reset to the walked one, because a drop
  // changes the neighbours of one joint and the clamps are cumulative along the route. Each pass
  // removes exactly one piece, so this terminates; the dropped piece is still FLOOR (it stays in
  // `allPieces`, hence in the `floors` below) and the bridged corner is measured against it by the
  // pose law like any other. The route's FIRST piece may be the one dropped — the ball lands on the
  // run after it, and `clearTrim` moves that run's start to the first station clear of the dropped
  // one — and a joint whose corner is clamped by neither piece's extent is refused by name.
  // The ride's extent, against every piece the ride does NOT use. A dropped piece is not gone — it is
  // the floor the ball passes over or stops before — so the runs on both sides of it end (or start) at
  // the first station clear of it, `clearTrim` above. Read over the WALK's order, not over adjacency:
  // the piece a drop leaves next to the hole may be several drops away from it, and a piece far from
  // the hole trims by nothing at all (its own vertex is already clear), so this is self-limiting.
  // A run with NO station clear of the dropped piece is dropped in its turn — the ball cannot reach
  // it, so it rides the run before THAT (a 6.4 mm run against a 1.5 mm up-turn: the corner the ball
  // needs there is longer than the whole run, arm t9b). Each cascade removes one more piece, so the
  // pass still terminates, and a route with nothing left to ride is refused by name below.
  const trimFor = (pc, Q, end) => {
    const trim = clearTrim(pc, Q, end);
    if (trim === null) return false;
    if (end === 'B') pc.sB = Math.min(pc.sB, pc.sB0 - trim);
    else pc.sA = Math.max(pc.sA, pc.sA0 + trim);
    // the trims ACCUMULATE (one piece, every dropped piece of its group, both ends): a run left
    // with no ride of its own between them has no station clear of the pieces around it either,
    // and is dropped in its turn like any other — the alternative is a piece walked backwards,
    // which the blend loop reads as a route that leaves its runway with no support (arm W7).
    return pc.sB - pc.sA > SLIVER;
  };
  // the floor groups over the WALK's pieces, by the same break rule the `floors` below use (a group
  // runs while the pieces are joined by a slope-only corner on one runway) — the trim reads it so
  // that what it enforces and what the pose law enforces are one scope
  const grpOfPiece = (() => {
    const g = new Array(allPieces.length);
    for (let i = 0, k = 0; i < allPieces.length; i++) {
      g[i] = k;
      const nx = allPieces[i + 1];
      if (nx && (nx.rw !== allPieces[i].rw || r * Math.abs(bendPhi(allPieces[i], nx)) >= SLIVER)) k++;
    }
    return g;
  })();
  for (let drop = -1; ; drop = -1) {
  blends.length = 0;
  for (const pc of pieces) { pc.sA = pc.sA0; pc.sB = pc.sB0; }
  let cascade = -1;
  for (const Q of dropped) {
    const qi = allPieces.indexOf(Q);
    let before = null, after = null;
    for (const pc of pieces) {
      const i = allPieces.indexOf(pc);
      if (i < qi) before = pc;
      else if (i > qi && after === null) after = pc;
    }
    // EVERY surviving piece of Q's own floor group is trimmed against it, not only the two that
    // border the hole. When the piece beside the hole survives as a stump, the ride's own corner
    // reaches past it: a 42.1/48.0 mm chute on a 4.66 mm run and a 3.40 mm run drops the last one,
    // trims the 4.66 mm run to a 0.313 mm stump, and the cut into that stump then starts 0.262 mm
    // inside the DROPPED run's far tip — a station on the piece two places from the hole (arm W7).
    // The group is the pose law's own scope (`floors` below): what lies across a heading change or
    // a runway change is the definition's relation and not this builder's construction (§29.26f),
    // so the two pieces bordering the hole keep the neighbour trim they have always had and the
    // widening applies inside the group.
    for (const pc of pieces) {
      const i = allPieces.indexOf(pc);
      if (pc !== before && pc !== after && grpOfPiece[i] !== grpOfPiece[qi]) continue;
      if (!trimFor(pc, Q, i < qi ? 'B' : 'A')) { cascade = pieces.indexOf(pc); break; }
    }
    if (cascade >= 0) break;
  }
  if (cascade >= 0) {
    if (pieces.length < 2) {
      const pc = pieces[0];
      throw new Error(`runway graph: pocket ${pocket} has no support the ball can stand on: the last run on ${pc.rw.id} at s ${(pc.sA0 / MM).toFixed(3)} mm (${((pc.sB0 - pc.sA0) / MM).toFixed(3)} mm) has no station clear of the pieces around it`);
    }
    dropped.push(pieces[cascade]);
    pieces.splice(cascade, 1);
    continue;
  }
  // ONE EXTENT PER PIECE, READ ONCE (GH-770 review r5, arm Y2). Every window the blend loop below
  // budgets — a twist window, a corner's λ — is a fraction of the piece's extent AFTER every trim
  // that precedes it in the construction order, which is the drop trims just applied. Reading the
  // ORIGINAL extent instead let the two ends of a trimmed piece budget 0.45 + 0.45 of a length the
  // piece no longer has and overrun each other: a 100 mm chute trimmed to 8.3 mm by a dropped run
  // budgeted 2 × 28.575 mm of twist onto it and the V2 law refused the export at −1.871670 mm, a
  // geometry the reader had built before the drop pass existed. Reading the REMAINING extent
  // instead — what is left at the moment each blend is drawn — makes a joint's λ depend on which of
  // its two pieces the loop reached first, so the snapshot is taken once, here, for both ends: the
  // 45 % is the budget each blend owes the other blend on the same piece, and 0.45 + 0.45 < 1 of one
  // number is what makes that true.
  for (const pc of pieces) { pc.sAT = pc.sA; pc.sBT = pc.sB; }
  for (let i = 0; i + 1 < pieces.length; i++) {
    const A = pieces[i];
    const B = pieces[i + 1];
    const out = { aTwist: null, slope: null, bTwist: null };
    const V = supportPt(A, A.sB);
    const Q = supportPt(B, B.sA);
    const cA = centrePt(A, A.sB);
    const cB = centrePt(B, B.sA);
    if (len3(sub(cA, cB)) < 1e-9) { blends.push(out); continue; }
    let phi = bendPhi(A, B);
    const sameVertex = len3(sub(V, Q)) < 1e-9;
    // The sub-grain bend reads as COLLINEAR (order 16, item 3; refuter 2b's item 5). A vertex
    // offset by 1e-5 mm makes a 1.3e-7 rad bend and a 3 nm pivot arc — three decades under the
    // export grain — over which J swings through 43 /m of curvature and a seated pair chattered
    // to MAX_EVENTS. The same grain that drops a sub-grain EDGE (the sliver rule above) drops a
    // sub-grain BEND: a heading change whose centre-path excursion over one ball radius is below
    // the grain (r·|φ| < EXPORT_GRAIN), and a slope change whose pivot arc is shorter than the
    // grain (h·θ < EXPORT_GRAIN), leave no blend — the two lines meet at the vertex, C0 as
    // before, and the tangent's step there is what a rounding is.
    if (Math.abs(phi) > 1e-12 && r * Math.abs(phi) < SLIVER) {
      phi = 0;
      // …and a sub-grain heading whose slope change is sub-grain too leaves NO blend at all (order 16
      // round 4, refuter B's item 3: falling through to the slope branch built a 0.06 µm lateral cut
      // from the two edges' slightly different normals, and a seated pair booked a +0.42 % impact on it)
      if (A.h * angle3(A.edge.n, B.edge.n) < SLIVER) { blends.push(out); continue; }
    }
    if (Math.abs(phi) > 1e-12) {
      // a heading change: the tilt offset shrinks to nothing at the vertex and regrows on the
      // outgoing edge (the slope change rides along: both sides meet at S(V) + h·ŷ); a junction
      // with a projection miss gets a straight connector between the two vertex points
      // windows budgeted from the pieces' POST-TRIM lengths (a short piece between two bends
      // splits its length evenly between its two windows — review round 8; the snapshot above)
      const wA = Math.min(r, 0.45 * (A.sBT - A.sAT));
      const wB = Math.min(r, 0.45 * (B.sBT - B.sAT));
      out.aTwist = twistSeg(A, A.sB - wA, A.sB, 1, 0); A.sB -= wA;
      out.bTwist = twistSeg(B, B.sA, B.sA + wB, 0, 1); B.sA += wB;
      if (!sameVertex) {
        const pA = out.aTwist.pts[out.aTwist.pts.length - 1];
        const pB = out.bTwist.pts[0];
        const gap = len3(sub(pB, pA));
        if (gap > 1e-9) out.slope = { kind: 'cut', p0: pA, p1: pB, len: gap };
        // the connector's own entitlement (the pose law below): it is read against B's floors — its
        // group — and a chord's extremum is an end, so the two ends read over B are the whole of it
        out.pen = Math.max(twistPen(B), penInto(B, pA), penInto(B, pB));
      }
      blends.push(out);
      continue;
    }
    // no heading change: the slope blend of seal 6 — a pivot arc over a ridge, a corner cut into a valley
    const convex = dot(B.edge.t, A.edge.n) < -1e-9;
    if (convex && sameVertex && Math.abs(A.h - B.h) < 1e-12) {
      const arcLen = A.h * angle3(A.edge.n, B.edge.n);
      if (arcLen < SLIVER) { blends.push(out); continue; }               // a sub-grain pivot: collinear (order 16, item 3)
      out.slope = { kind: 'arc', V, h: A.h, n0: A.edge.n, n1: B.edge.n, len: arcLen };
      out.pen = 0;                                    // a pivot over a ridge stands h from both floors at every angle
    } else {
      const th = angle3(A.edge.t, B.edge.t);
      const lamFull = convex ? 0 : 0.5 * (A.h + B.h) * Math.tan(0.5 * th);
      const extA = A.sBT - A.sAT;                     // the one extent per piece (the snapshot above)
      const extB = B.sBT - B.sAT;
      const lam = Math.max(0, Math.min(lamFull, 0.45 * extA, 0.45 * extB));
      const IA = centrePt(A, A.sB - lam);
      const IB = centrePt(B, B.sA + lam);
      // LAW (GH-770 review r4, class W; arms W1-W6): a corner this builder draws leaves the ball ON
      // the floor. The two offset lines meet λ = ½(hA+hB)·tan(θ/2) before and after the vertex, and
      // there both ends of the chord stand exactly h from their own floor. The 45 % clamp — the
      // budget each blend owes the next blend on the same piece — cuts λ to λc, and the chord then
      // falls inside the two floors by
      //     pen = h·(1 − cos θ) − λc·sin θ     (zero at λc = λ, since h·tan(θ/2)·sin θ = h(1 − cos θ))
      // a quantity of the JOINT and of the clamp, NOT of the run's length, which is why the
      // whole-run retention above — a length rule — cannot see it. A 96/28 channel chute with a
      // 2.499 mm draining tail (θ 71.418°, λ 20.560 mm, λc 1.125 mm) passes V7, V12 and the design
      // gate, and the retained tail seated the r = 28.575 mm ball 2.535 mm inside the chute at rest
      // and 18.417 mm inside it in transit.
      // Where the run's OWN length is what clamps the corner short and the run is the route's LAST,
      // the cure is the fragment rule's: the run cannot carry the corner the ball needs in order to
      // reach it, so the ball rests on the piece before it and the run is dropped. No earlier joint
      // is disturbed by that drop — a joint's cut is clamped by the extents its own two pieces had
      // when it was drawn, and this is the last of them — so the pass ends there. An INTERIOR joint
      // has no such cure (the ball rides the pieces on both sides of it), and neither has a corner
      // clamped by the piece BEFORE the run; those are REFUSED by name rather than drawn wrong,
      // because the consequence is otherwise silent — a ball seated inside a floor on a route that
      // reads long, which is how this class was found four rounds running.
      const penA = penInto(A, IB);
      const penB = penInto(B, IA);
      const pen = A.rw === B.rw ? Math.max(penA, penB) : 0;
      if (pen > SLIVER) {
        // Only an END run may be dropped. The ball RIDES every interior piece, so removing one
        // replaces its two corners by a single chord across the gap, and that chord falls deeper
        // inside the floors than the clamped corner did: W2's case 349 — a 32.334 mm 57.415° run
        // between a 11.310° lead and a 2.050° tail, its lower corner clamped 0.348 mm — dropped,
        // drew a 42.671 mm chord 4.183 mm inside the lead. An interior clamp is REFUSED by name.
        const shortB = lamFull > 0.45 * extB + 1e-12;
        const shortA = lamFull > 0.45 * extA + 1e-12;
        const canB = shortB && i + 2 === pieces.length;
        const canA = shortA && i === 0;
        if (canB && (!canA || extB <= extA)) drop = i + 1;
        else if (canA) drop = i;
        if (drop >= 0) { dropped.push(pieces[drop]); break; }
        const who = shortA && shortB ? 'both runs are' : shortA ? `the ${(extA / MM).toFixed(3)} mm run before it is` : `the ${(extB / MM).toFixed(3)} mm run after it is`;
        throw new Error(`runway graph: pocket ${pocket} cuts the ${(th * 180 / Math.PI).toFixed(3)}° valley on ${B.rw.id} at s ${(B.sA / MM).toFixed(3)} mm to ${(lam / MM).toFixed(4)} mm of the ${(lamFull / MM).toFixed(4)} mm corner the ball needs (${who} too short for it, and the ball rides on) — the centre falls ${(pen / MM).toFixed(6)} mm inside the floor (grain ${(SLIVER / MM).toFixed(1)} mm)`);
      }
      A.sB -= lam; B.sA += lam;
      // The cut's own entitlement for the pose law below. Same runway: the law above has just bounded
      // it by the grain, so this is a cap, not a licence. ACROSS a runway change the law measures
      // nothing (two bodies, two extents — a landing, not a corner) and the cut is read against the
      // DOWNSTREAM floor's group alone, so the entitlement there is the depth the corner actually
      // draws into that floor: the deepest of the cut's two ENDPOINTS read over that floor — a normal
      // offset is affine along a straight chord, so the two ends are the whole of it, the same
      // reading the bend branch above makes of its connector — and NEVER below zero. An entitlement
      // is a licence to stand inside a floor; it can be zero, and it cannot be less. Reading one end
      // alone made it NEGATIVE on every shipped landing, because a landing's upstream end stands
      // CLEAR of the downstream floor (the wire slides' tray lip by 0.074138 mm) while its downstream
      // end IS that floor's own vertex, exactly 0 inside — and a negative entitlement refuses a
      // centre that is 0.000000 mm inside the tray at s 1.673 mm, a clearance disabling ball return
      // (GH-770 review r5, arm Y1). The one shipped joint whose 45 % clamp binds is the XW101 export's
      // 12.627° chute valley (λ 2.9357 mm wanted, 2.8713 mm paid by a 6.422 mm run), 0.014078 mm deep
      // against the 0.1 mm grain. Those are MEASUREMENTS, reported in §29.26f with their census (arm
      // t10c), not bounds this law invents — they are what the construction does, stated here rather
      // than hidden.
      // `penInto(B, IB)` is zero BY CONSTRUCTION — up to the dot product's own rounding — and is kept
      // as the ANCHOR of the reading, not as a term that can bind: IB is `centrePt(B, B.sA + lam)`, a
      // point ON B's own offset line, so its normal offset into B is h and its station is inside
      // [B.sA0, B.sB0] (every piece is a straight run, lam ≤ 0.45·extB) — the clamp is a no-op and
      // `h - dot(d, n)` is h·(1 − n·n) − u·(t·n), which IEEE arithmetic leaves at O(1e-17), not at
      // 0.0 (round-7 refuter, P3-3). Removing it leaves every shipped and corpus reading unchanged
      // (mutant N188 of the round-5 battery, an equivalent mutant: 15 cross-runway cuts read
      // −1.735e-17 … +2.429e-17 m, thirteen orders below the 1e-4 m export grain), and the ≤ 0 half
      // of its range is absorbed by the outer Math.max(0, …) in any case. What it anchors is the SHAPE of the rule — the deepest of the cut's two
      // ENDPOINTS read over the downstream floor — so that the reading cannot be mistaken for
      // "the upstream endpoint alone", which is the defect this line replaced (GH-770 review r5,
      // arm Y1; the comment itself deferred from r6's test-only round by the maintainer's ruling).
      out.pen = Math.max(0, A.rw === B.rw ? pen : Math.max(penB, penInto(B, IB)));
      const gap = len3(sub(IB, IA));
      if (gap > 1e-9) out.slope = { kind: 'cut', p0: IA, p1: IB, len: gap };
    }
    blends.push(out);
  }
  if (drop < 0) break;
  pieces.splice(drop, 1);
  }
  for (const pc of pieces) {
    if (pc.sB - pc.sA < -1e-12) {
      throw new Error(`runway graph: pocket ${pocket} leaves ${pc.rw.id} at s ${(pc.sA0 / MM).toFixed(3)} mm no support between its blends (${((pc.sB - pc.sA) / MM).toFixed(6)} mm)`);
    }
  }
  // The FLOORS this route rides — one per piece, at its ORIGINAL walked extent and with the
  // support's own lateral half-extent — and the GROUP each pose is measured against (the pose law
  // is `poseClearance` below). A group runs while the pieces are joined by a SLOPE-ONLY corner on
  // one runway: those corners are the builder's own construction and it owns the ball's clearance
  // through them. It breaks at a heading change and at a runway change, where the two floors'
  // relation is the DEFINITION's — two legs of a folded runway pass over each other by the file's
  // geometry, not by anything this builder draws, and that is a validator's question (reported in
  // §29.26f with its census, not refused here).
  // They are built from every piece the WALK found, not from the ones that survived the corner
  // pass: a run dropped as a fragment or bridged by the pair above is still floor under the ball,
  // and the whole point of dropping it is that the ball passes OVER it.
  const floors = [];
  const floorOf = new Map();
  for (let i = 0, grp = 0; i < allPieces.length; i++) {
    const pc = allPieces[i];
    const b = cross(pc.edge.t, pc.edge.n);
    const f = { rw: pc.rw, edge: pc.edge, h: pc.h, b, tol: derivedFor(track, pc.rw.support, r).tol, s0: pc.sA0, s1: pc.sB0, group: grp };
    floors.push(f);
    floorOf.set(pc, f);
    const nx = allPieces[i + 1];
    if (nx && (nx.rw !== pc.rw || r * Math.abs(bendPhi(pc, nx)) >= SLIVER)) grp++;
  }
  // segments in travel order
  const segs = [];
  for (let i = 0; i < pieces.length; i++) {
    const pc = pieces[i];
    const p0 = centrePt(pc, pc.sA);
    // sFrom/sTo: the support stations of the segment's OWN runway it stands in for — stationD
    // maps a physical station through them (a blend on a runway change stands for the
    // downstream runway from the landing station to its first line)
    // sT0/sT1 — the extent AFTER the cascade's trims and BEFORE the blends' cuts (the `sAT/sBT`
    // snapshot above). The route otherwise publishes only the two ends added together, and an
    // oracle asked whether a trim equals the first contact with a dropped floor cannot read one
    // out of the sum (GH-770 review r6, class AC, oracle (c)). Nothing in the build reads these.
    segs.push({ kind: 'line', rw: pc.rw, edge: pc.edge, h: pc.h, p0, dir: pc.edge.t, len: pc.sB - pc.sA, s0: pc.sA, sFrom: pc.sA, sTo: pc.sB, sT0: pc.sAT, sT1: pc.sBT, floor: floorOf.get(pc), pen: 0 });
    const bl = blends[i];
    const nx = pieces[i + 1];
    if (!nx) continue;
    const inRunway = nx.rw === pc.rw;
    if (!bl || (!bl.aTwist && !bl.slope && !bl.bTwist)) { if (inRunway) segs[segs.length - 1].sTo = nx.sA; continue; }
    if (bl.aTwist) { segs[segs.length - 1].sTo = bl.aTwist.sFrom; segs.push({ ...bl.aTwist, rw: pc.rw, edge: pc.edge, h: pc.h, s0: bl.aTwist.sFrom, floor: floorOf.get(pc), pen: twistPen(pc) }); }
    else if (inRunway) segs[segs.length - 1].sTo = pc.sB;
    if (bl.slope) segs.push({ ...bl.slope, rw: nx.rw, edge: nx.edge, h: nx.h, s0: nx.sA, sFrom: inRunway ? pc.sB : nx.sA0, sTo: bl.bTwist ? nx.sA0 : nx.sA, floor: floorOf.get(nx), pen: bl.pen ?? 0 });
    if (bl.bTwist) segs.push({ ...bl.bTwist, rw: nx.rw, edge: nx.edge, h: nx.h, s0: bl.bTwist.sFrom, sFrom: (inRunway && !bl.slope) ? pc.sB : (bl.slope ? nx.sA0 : nx.sA0), floor: floorOf.get(nx), pen: twistPen(nx) });
  }
  let total = 0;
  for (const sg of segs) total += sg.len;
  let D0 = total;
  for (const sg of segs) { sg.D0 = D0; sg.D1 = D0 - sg.len; D0 = sg.D1; }
  if (segs.length) segs[segs.length - 1].D1 = 0;
  // breaks: every segment start (except the first) where the runway or the support
  // edge changes — the acceleration law changes there; a blend belongs to the
  // downstream edge, so the junction / bend fires at the blend's start
  const breaks = [];
  for (let i = 1; i < segs.length; i++) {
    const a = segs[i - 1];
    const b = segs[i];
    if ((a.rw !== b.rw || a.edge !== b.edge) && b.D0 > 1e-12 && b.D0 < total - 1e-12) breaks.push(b.D0);
  }
  breaks.sort((a, b) => b - a);
  // spans (support s-ranges per runway, in D) — the validator's drain table and
  // the debug visual read these; consistent with the segments by construction
  const spans = [];
  for (const p of parts) {
    const mine = segs.filter((sg) => sg.rw === p.rw);
    if (!mine.length) continue;
    // dStart = the runway's first segment on the route — its junction blend included, so
    // it is the very break the `junction` event fires at (review round 6b)
    spans.push({ rw: p.rw, sStart: p.sStart, dStart: mine[0].D0, dEnd: mine[mine.length - 1].D1 });
  }
  // merge points along the route (descending D): the physical stations where a
  // runway of this chain is joined by a feeder — the route's own junction (it lands
  // there) and every OTHER runway landing on a runway of the chain downstream of the
  // route's own entry to it. The solver's yield law keeps one ball length around each
  // point clear of two-branch traffic (review r4 P2-1, junction half).
  const route = { pocket, chain, total, spans, breaks, segs, floors, merges: [], r, track, restId: chain[chain.length - 1] };
  for (const sp of spans) {
    for (const x of track.runways.values()) {
      if (x.next !== sp.rw.id || x.landingS === null) continue;
      const D = stationD(route, sp.rw.id, x.landingS);
      if (D === null || D <= 1e-9 || D >= total - 1e-9) continue;
      route.merges.push({ D, rw: sp.rw, s: x.landingS, feeder: x.id });
    }
  }
  route.merges.sort((a, b) => b.D - a.D);
  // BELT (GH-770 review r3, class U): no piece the route WALKS inside a stop-body zone is that body.
  // Like the class-V belt above this cannot fire — the exclusion is three lines up — and like it, it is
  // written because the consequence is silent: the ball simply rests inside the floor and the route
  // reads long. What it does NOT do is measure the pose, and that is a finding, not an omission (the
  // census is arm U3, §29.26e): the module's blends move the centre off the support's offset surface BY
  // CONSTRUCTION — a valley corner is CUT (the chord falls h(1/cos(θ/2) − 1) inside the corner) and a
  // heading twist spreads the forward-tilt offset — so "the centre stands at h from the floor" is false
  // for legal shipped geometry wherever a station lands in a blend: sampled 128 points per segment, the
  // centre path dips -1.108e-2 mm through the shipped XW101 slides' 12.6° chute joint and -4.657 mm
  // through TEST-hairpin-170's 5.7° return joint, against the -25.380 mm of this defect — and the
  // extremum is continuous, so a denser sweep only deepens it. A refusal at ZERO would therefore refuse
  // both the moment a SEAT landed in a blend instead of between blends, which is why r3 reported the pose
  // and refused nowhere. Review round 4 (class W) WITHDRAWS that deviation: the pose is refused against
  // what the construction that drew it is entitled to put there (`poseClearance` / `refusePose` below —
  // 0 on a line and a pivot, h(1 − cos θ) on a twist, h(1 − cos θ) − λc·sin θ on a valley cut, plus the
  // grain), so the shipped blends above sit inside their own allowance and the -25.380 mm seat does not.
  // Every SEAT the module may draw stands at or above its floor (worst -1.0e-13 mm over 505 of them,
  // arm t9o), which is the property this belt's siblings protect.
  for (const pc of pieces) {
    const rest = track.rests.get(pc.rw.id);
    if (!rest || pc.edge.s0 < rest.wallS - MM) continue;
    if (track.tray && pc.rw.id === track.tray.runway.id) continue;                     // V7 waives the drain law here, so this belt has nothing to read
    const der = derivedFor(track, pc.rw.support, r);
    if (!drainsAt(der, pc.edge, r, track.u_r)) {
      throw new Error(`runway graph: pocket ${pocket} walks the stop's own body on ${pc.rw.id} at s ${(pc.edge.s0 / MM).toFixed(3)} mm (it does not drain, and it is at or past the stop face ${(rest.wallS / MM).toFixed(3)} mm)`);
    }
  }
  return route;
}

/** D on `route` of the physical support station `s` of runway `rwId`, through the
 * route's own segments (a station inside a blend maps onto the blend; the runway's
 * first segment — its junction blend — is where the route enters it). null when the
 * route does not run through that runway, or the station lies upstream of the
 * route's entry to it or beyond its rest face. */
export function stationD(route, rwId, s) {
  const mine = route.segs.filter((sg) => sg.rw.id === rwId);
  if (!mine.length) return null;
  if (s < mine[0].sFrom - 1e-9) return null;
  for (const sg of mine) {
    if (s > sg.sTo + 1e-9) continue;
    const ext = sg.sTo - sg.sFrom;
    if (ext <= 1e-12) return sg.D0;
    const f = Math.max(0, Math.min(1, (s - sg.sFrom) / ext));
    return sg.D0 - f * sg.len;
  }
  return null;
}

/** Locate D on a route → { rw, edge, sLocal, u (along the support edge), seg }. */
export function locate(route, D) {
  // D above the route total = UPSTREAM of the entry vertex: extrapolate along the
  // entry segment's own line (a ball seated behind another at a landing —
  // research R5). The solver refuses any seat beyond total + 2r (an 'overflow',
  // the ball stays culled) and poseAt culls an upstream seat whose top is still
  // inside the pocket, so a drawn station never leaves the cup's own footprint.
  const d = Math.max(0, D);
  const segs = route.segs;
  let seg = segs[0];
  if (d <= route.total) {
    seg = segs[segs.length - 1];
    for (const sg of segs) { if (d > sg.D1 - 1e-12) { seg = sg; break; } } // a station exactly on a boundary belongs to the segment the ball is about to travel (callers probe with D − ε)
  }
  const along = seg.D0 - d; // metres travelled into the segment (negative upstream of the entry)
  const sLocal = seg.kind === 'line' ? seg.s0 + along : (seg.kind === 'twist' ? seg.sFrom + (seg.sTo - seg.sFrom) * Math.max(0, Math.min(1, seg.len > 0 ? along / seg.len : 0)) : seg.s0);
  const e = seg.edge;
  const u = e.len > 0 ? Math.min(1, (sLocal - e.s0) / e.len) : 0; // may be < 0 upstream of the entry
  return { rw: seg.rw, edge: e, sLocal, u, seg, along };
}

/** Ball-centre station at D on the route's centre path (built for the track's
 * reference radius; `r` is accepted for signature compatibility and must equal it). */
export function stationAt(route, D, r, out = {}) {
  const loc = locate(route, D);
  const sg = loc.seg;
  let x, y, z;
  if (sg.kind === 'line') {
    x = sg.p0[0] + sg.dir[0] * loc.along; y = sg.p0[1] + sg.dir[1] * loc.along; z = sg.p0[2] + sg.dir[2] * loc.along;
  } else if (sg.kind === 'arc') {
    const f = Math.max(0, Math.min(1, sg.len > 0 ? loc.along / sg.len : 1));
    const n = slerp3(sg.n0, sg.n1, f);
    x = sg.V[0] + sg.h * n[0]; y = sg.V[1] + sg.h * n[1]; z = sg.V[2] + sg.h * n[2];
  } else if (sg.kind === 'twist') {
    // arclength → parameter through the tabulated cumulative lengths (linear within a step)
    const a = Math.max(0, Math.min(sg.len, loc.along));
    const K = sg.cum.length - 1;
    let k = 0; while (k < K - 1 && sg.cum[k + 1] < a) k++;
    const span = sg.cum[k + 1] - sg.cum[k];
    const f = span > 0 ? (a - sg.cum[k]) / span : 0;
    const P0 = sg.pts[k], P1 = sg.pts[k + 1];
    x = P0[0] + (P1[0] - P0[0]) * f; y = P0[1] + (P1[1] - P0[1]) * f; z = P0[2] + (P1[2] - P0[2]) * f;
  } else {
    const f = Math.max(0, Math.min(1, sg.len > 0 ? loc.along / sg.len : 1));
    x = sg.p0[0] + (sg.p1[0] - sg.p0[0]) * f; y = sg.p0[1] + (sg.p1[1] - sg.p0[1]) * f; z = sg.p0[2] + (sg.p1[2] - sg.p0[2]) * f;
  }
  const der = derivedFor(route.track, loc.rw.support, route.r);
  out.x = x; out.y = y; out.z = z;
  out.runwayId = loc.rw.id;
  out.edge = loc.edge;
  out.k = der.k;
  out.rho = der.rho;
  return out;
}

/**
 * THE ENTRY — one source of truth (GH-770 review r7, class AE). The station a ball LANDS on and the
 * route is measured from is the REBUILT route's first station, D = route.total: what `stationAt`
 * draws there, what `handoffFromSink` aims the free fall at, and now what V5 validates. It is NOT
 * the runway's first point: the corner law may drop a leading run whose own extent cuts its corner
 * short (`canA`), and the ride then starts on the run after it, higher up the chute. Review's round-7
 * fixture — a 0.125 mm leading run at 53° into a 253 mm chute at 18° — read −200.08 mm at the first
 * point and lands the ball with its top at −190.821 mm, 8.18 mm above an exit declared at −199, and
 * V5, reading the first point, passed it while `poseAt` drew the landing. Returns the centre, the
 * support point under it, the piece's own edge / runway / h, and how many leading floors the walk
 * found before the first one the ride uses (0 on every shipped definition and every corpus case:
 * arm AE-4). Derived, no tolerance: the same arithmetic `stationAt` draws with.
 */
export function routeEntry(route, r) {
  const st = stationAt(route, route.total, r, {});
  const sg = route.segs[0];
  const lines = route.segs.filter((s) => s.kind === 'line');
  const dropped = route.floors ? route.floors.indexOf(lines[0]?.floor) : 0;
  return { x: st.x, y: st.y, z: st.z, edge: sg.edge, rw: sg.rw, h: sg.h,
    sup: [st.x - sg.h * sg.edge.n[0], st.y - sg.h * sg.edge.n[1], st.z - sg.h * sg.edge.n[2]],
    dropped: dropped > 0 ? dropped : 0 };
}

/**
 * THE DRAWN TOP (GH-770 review r7, class AE, arm AE-3): the highest point the ball's TOP reaches at any
 * station of the route's drawn extent [0, total], in closed form per segment — the same curves
 * `stationAt` draws, so a dense sampling of `stationAt` agrees with it to rounding (arm t13c/t13d).
 * The entry is NOT always that point: a twist window at a heading change stands the centre h
 * VERTICALLY over its vertex (w → 0), and behind a short steep leading run that pose is higher than
 * the entry's — 23 mm higher on a 0.5 mm run at 80° into a 90° bend. V5 holds the whole drawn extent
 * under the pocket exit, which is what makes `poseAt`'s on-route drawing rule (it culls above the exit
 * only upstream of the entry) an invariant and not an assumption.
 *   line, cut  — straight: the extremum is an end
 *   arc        — the pivot over a ridge: y(f) = V.y + h·slerp(n0, n1, f).y = V.y + h·(A cos u + B sin u)/sin Ω,
 *                u = fΩ, A = n0.y·sin Ω, B = n1.y − n0.y·cos Ω; the interior extremum u* = atan2(B, A) when
 *                it lies in [0, Ω], else an end (for Ω below slerp's own 1e-9 guard the arc is its start)
 *   twist      — the tabulated polyline `stationAt` interpolates linearly: its extremum is a tabulated point
 */
export function routeTop(route, r) {
  let best = null;
  const take = (y, D, kind) => { if (best === null || y > best.y) best = { y, D, kind }; };
  for (const sg of route.segs) {
    if (sg.kind === 'line') {
      take(sg.p0[1], sg.D0, 'line'); take(sg.p0[1] + sg.dir[1] * sg.len, sg.D1, 'line');
    } else if (sg.kind === 'arc') {
      const th = angle3(sg.n0, sg.n1);
      take(sg.V[1] + sg.h * sg.n0[1], sg.D0, 'arc');
      if (th >= 1e-9) {
        take(sg.V[1] + sg.h * sg.n1[1], sg.D1, 'arc');
        const A = sg.n0[1] * Math.sin(th), B = sg.n1[1] - sg.n0[1] * Math.cos(th);
        const u = Math.atan2(B, A);
        // This interior extremum is DEAD under the shipped invariant and kept for the closed form's
        // completeness (GH-770 FIX7 verdict, arm D). It exists only when the vertical lies strictly inside
        // the arc's sweep, i.e. when the incoming edge's up-normal leans BACKWARD — an ascending edge —
        // and V7 refuses an edge that does not drain wherever a ball travels; the one V7-exempt runway is
        // the tray, which is level, so there n0 = ŷ, B = n1.y − n0.y·cos Ω = 0 and u* = atan2(0, sin Ω) = 0:
        // the arc's START, an end. Arm t13g keeps the branch load-bearing on a declared NON-conformant
        // fixture (an ascending-then-descending ridge V7 refuses by name) built through buildTrack alone,
        // where the branch answers V.y + h and its two ends do not.
        if (u > 0 && u < th) take(sg.V[1] + sg.h * Math.hypot(A, B) / Math.sin(th), sg.D0 - sg.len * (u / th), 'arc');
      }
    } else if (sg.kind === 'twist') {
      for (let k = 0; k < sg.pts.length; k++) take(sg.pts[k][1], sg.D0 - (sg.cum[k] ?? 0), 'twist');
    } else {
      take(sg.p0[1], sg.D0, sg.kind); take(sg.p1[1], sg.D1, sg.kind);
    }
  }
  return best === null ? null : { top: best.y + r, y: best.y, D: best.D, kind: best.kind };
}

/**
 * THE POSE LAW (GH-770 review r4, class W; arm W6). How far the ball centre at D falls INSIDE a floor
 * of the route's own ride, against how far the construction that drew that pose is entitled to put it
 * there. Returns null where the pose stands over no floor of its group.
 *
 * The measure is the floor's own STRIP: the distance from the centre to the nearest point of the
 * walked extent, within the support's lateral half-extent (`tol`, the channel's half-width / the
 * rails' half-gauge), minus h. Where the perpendicular foot lands ON the strip that is exactly the
 * offset along the normal, which is what the constructions below are written in; off its ends and
 * beside it, the nearest point is the strip's own boundary, and the ball rounds that boundary at h.
 * Both halves matter. A ball BESIDE a floor is not inside it — a runway that folds back over itself
 * puts a leg under an earlier leg's plane by tens of mm, and only the strip's width tells the two
 * cases apart — and a ball PAST a floor's end can be deep inside it all the same: a 94.5/72.9 mm
 * chute ending on a 17.7 mm tail seats the ball with its foot 3.8 mm beyond the tail's far vertex
 * and its centre 19.2 mm from that vertex line, 9.3 mm inside a piece a foot-in-extent reading
 * skips entirely (arm W2's fuzz found this class; the construction above no longer draws it).
 *
 * The allowance is closed-form per construction, never a tolerance:
 *   line, pivot arc  0            — the centre stands exactly h from its floor along the whole run
 *   twist            h(1 − cosθ)  — the window's vertex end holds the centre h VERTICALLY above the
 *                                   support point, and h·ŷ read along the floor's normal is h·cosθ
 *   valley cut       h(1 − cosθ) − λc·sinθ — the clamped corner's own depth, which the corner law in
 *                                   `buildRoute` refuses beyond the export grain
 *   junction cut     the deeper of the two twist ends it spans (a normal offset is affine along a
 *                                   chord, so a chord's extremum is one of its ends)
 * …plus the grain itself, because a segment's endpoint IS its neighbour blend's endpoint: a line that
 * starts at a cut's end inherits that cut's depth, and the corner law has already bounded it there. The
 * two agree by construction — no number is chosen here.
 */
export function poseClearance(route, D, x, y, z) {
  const floors = route.floors;
  if (!floors || !floors.length) return null;
  const sg = locate(route, D).seg;
  const grp = sg.floor ? sg.floor.group : -1;
  let worst = null;
  for (const f of floors) {
    if (f.group !== grp) continue;
    const dx = x - f.edge.p0[0], dy = y - f.edge.p0[1], dz = z - f.edge.p0[2];
    const s = f.edge.s0 + dx * f.edge.t[0] + dy * f.edge.t[1] + dz * f.edge.t[2];
    const w = dx * f.b[0] + dy * f.b[1] + dz * f.b[2];
    const n = dx * f.edge.n[0] + dy * f.edge.n[1] + dz * f.edge.n[2];
    const sc = Math.max(f.s0, Math.min(f.s1, s));                             // the nearest point OF THE STRIP:
    const wc = Math.max(-f.tol, Math.min(f.tol, w));                          // its plane under the foot, its boundary off it
    const pen = f.h - Math.hypot(s - sc, w - wc, n);
    if (!worst || pen > worst.pen) worst = { pen, floor: f, s, seg: sg, allowed: (sg.pen ?? 0) + EXPORT_GRAIN };
  }
  return worst;
}

/** The pose law as a REFUSAL, by name (GH-770 review r4, class W, arm W6; it withdraws the r3 belt's
 * deviation 3 — "the pose is reported here and refused nowhere"). Every pose the solver seats and every
 * pose the renderer draws passes through here: a centre inside a floor of its own ride beyond what the
 * construction allows is a drawing of a ball inside the track, which is silent in every other reading —
 * the route simply reads long. The shipped tree raises none of these (arm W3). */
export function refusePose(route, D, st, where) {
  const c = poseClearance(route, D, st.x, st.y, st.z);
  if (!c || c.pen <= c.allowed) return;
  throw new Error(`ball-return ${where}: the pose at D ${(D / MM).toFixed(3)} mm on ${route.pocket === null ? 'the tray route' : `pocket ${route.pocket}`} falls ${(c.pen / MM).toFixed(6)} mm inside ${c.floor.rw.id} at s ${(c.s / MM).toFixed(3)} mm — its ${c.seg.kind} is entitled to ${(c.allowed / MM).toFixed(6)} mm (construction ${((c.allowed - EXPORT_GRAIN) / MM).toFixed(6)} mm + grain ${(EXPORT_GRAIN / MM).toFixed(1)} mm)`);
}

/**
 * The station to probe when a caller needs the piece a ball at D is TRAVELLING (its acceleration,
 * its tangent, its rolling axis). D decreases along the motion, so the piece is the segment that
 * contains (D − δ, D]: a station strictly inside its segment reads that segment, and only one
 * sitting exactly on the boundary (within BOUND_TOL) steps SIDE_EPS into the piece below it.
 * Deterministic in D — the side is never decided by solver noise (seal 15).
 */
export function sideD(route, D, dir = 1) {
  const d = Math.max(0, D);
  const seg = locate(route, d).seg;
  if (d - seg.D1 > BOUND_TOL) return d;
  // a station ON a boundary reads the piece it is about to travel — DOWN for forward motion (the
  // seal-15 rule), UP for a ball moving back up its runway (order 16: a chain whose front had been
  // reversed by an impact at a hairpin vertex was read on the exit side while it stood and moved on
  // the incoming side, and the followers' downhill drive "pushed it back up" for seconds)
  return dir < 0 ? seg.D1 + SIDE_EPS : Math.max(0, seg.D1 - SIDE_EPS);
}

/**
 * Unit tangent of the centre path at D, pointing ALONG THE MOTION (D decreasing), with the
 * curvature vector dT/ds of the same segment (seal 15: the chain's law of motion needs the
 * path's own first and second derivatives, not a finite difference across a vertex). The
 * segment is the one the ball is TRAVELLING (`sideD`: its own segment, or — standing exactly on a
 * boundary — the piece below it), so a ball on a vertex carries the outgoing heading and the
 * tangent is never blended across a kink.
 *   line / cut / twist step: T is the piece's own direction, curvature 0 (a twist is a
 *   tabulated polyline of straight steps; its heading changes are at the steps).
 *   arc (a pivot over a ridge, radius h): T = h·dn/ds of the slerp, dT/ds = −n/h.
 * out: { tx, ty, tz, kx, ky, kz }.
 */
export function tangentAt(route, D, out = {}, dir = 1) {
  const loc = locate(route, sideD(route, D, dir));
  const sg = loc.seg;
  let tx, ty, tz, kx = 0, ky = 0, kz = 0;
  if (sg.kind === 'line') {
    tx = sg.dir[0]; ty = sg.dir[1]; tz = sg.dir[2];
  } else if (sg.kind === 'arc') {
    const th = angle3(sg.n0, sg.n1);
    const f = Math.max(0, Math.min(1, sg.len > 0 ? loc.along / sg.len : 1));
    const n = slerp3(sg.n0, sg.n1, f);
    if (th < 1e-9) { tx = 0; ty = 0; tz = 0; } else {
      const ca = -Math.cos((1 - f) * th) / Math.sin(th), cb = Math.cos(f * th) / Math.sin(th);
      const t = unit3([ca * sg.n0[0] + cb * sg.n1[0], ca * sg.n0[1] + cb * sg.n1[1], ca * sg.n0[2] + cb * sg.n1[2]]);
      tx = t[0]; ty = t[1]; tz = t[2];
    }
    kx = -n[0] / sg.h; ky = -n[1] / sg.h; kz = -n[2] / sg.h;
  } else if (sg.kind === 'twist') {
    const a = Math.max(0, Math.min(sg.len, loc.along));
    const K = sg.cum.length - 1;
    let k = 0; while (k < K - 1 && sg.cum[k + 1] < a) k++;
    const P0 = sg.pts[k], P1 = sg.pts[k + 1];
    const t = unit3([P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]]);
    tx = t[0]; ty = t[1]; tz = t[2];
  } else {
    const t = unit3([sg.p1[0] - sg.p0[0], sg.p1[1] - sg.p0[1], sg.p1[2] - sg.p0[2]]);
    tx = t[0]; ty = t[1]; tz = t[2];
  }
  out.tx = tx; out.ty = ty; out.tz = tz; out.kx = kx; out.ky = ky; out.kz = kz;
  return out;
}

/** Largest centre-path discontinuity along a route, sampled across every segment
 * boundary (the C0 law's own measure: 0 by construction, the gate asserts < 1e-6). */
export function maxPathJump(route) {
  let worst = 0;
  const a = {}; const b = {};
  for (let i = 1; i < route.segs.length; i++) {
    const Db = route.segs[i].D0;
    stationAt(route, Db + 1e-9, route.r, a);
    stationAt(route, Math.max(0, Db - 1e-9), route.r, b);
    worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
  }
  return worst;
}

/**
 * The station on `route` UPSTREAM of a ball whose centre is P (three frame) at which a
 * second ball's centre is exactly one diameter (`twoR`) from P — the seat of a ball
 * touching it (review r6 P2: contact spacing is the 3-D centre distance, not the path
 * distance). On a straight run it is Dmin + 2r exactly (the ladder stays exact); across a
 * bend the path distance is longer than the chord. `Dmin` = the D of P's own station on
 * this route (a same-lane pair shares the downstream path). Newton on
 * f(D) = |P(D) − P| − 2r from the straight guess, safeguarded by a bracket; deterministic.
 */
const seatTmp = {};
export function seatBehind(route, P, Dmin, twoR, Dhint = NaN) {
  const f = (D) => { stationAt(route, D, route.r, seatTmp); return Math.hypot(seatTmp.x - P[0], seatTmp.y - P[1], seatTmp.z - P[2]) - twoR; };
  // Order 16 (item 1c, refuter 1's H3): past an obtuse corner the seat equation has SEVERAL
  // roots above the leader — one on each leg the sphere of radius 2r about the leader's centre
  // cuts (shipped TEST-obtuse-merge, leader 58 mm past the 113.5° vertex: 835.24, 838.54 and
  // 879.04 mm). The straight guess Dmin + 2r converges to the nearest root DOWNSTREAM, and a
  // follower touching on the incoming leg was moved 42.575 mm in 2 µs onto it. A follower's seat
  // is a CONTINUOUS function of the leader's station: with `Dhint` (the follower's own station,
  // or the rigid-train estimate of it after the leader's advance) the root nearest the hint is
  // taken — Newton from the hint, safeguarded by a bracket grown around it; NaN when no root
  // lies within one diameter of the hint (the fold: the sphere has left the follower's leg, the
  // contact cannot persist there and the solver parts the pair). Without a hint (packing at
  // rest, a landing seat) the straight root is the seat, as before.
  if (Number.isFinite(Dhint)) {
    // (stations ABOVE route.total are legal here: a follower seated behind a tail near the landing
    // perches above it, culled until it can be drawn — nothing is clamped to the landing)
    let D = Math.max(Dmin, Dhint);
    let fd = f(D);
    if (Math.abs(fd) < 1e-13) return D;
    // Newton from the hint (the root moved by less than a diameter since the hint was true)
    let converged = false;
    for (let it = 0; it < 30; it++) {
      const h = 1e-7;
      const slope = (f(D + h) - fd) / h;
      if (!(Math.abs(slope) > 1e-9)) break;
      const next = D - fd / slope;
      if (!Number.isFinite(next) || Math.abs(next - Dhint) > twoR) break;   // left the hint's diameter: no nearby root by Newton
      const fn = f(next);
      if (Math.abs(next - D) < 1e-14 || Math.abs(fn) < 1e-13) { D = next; fd = fn; converged = true; break; }
      D = next; fd = fn;
    }
    // order 18 item 2 — a root on the OTHER side of a corner is not this follower's root: if the ball would pass a route
    // break between the hint and the root while out of contact (f > 0 at the break: the sphere does not reach the path
    // there), the contact on this leg has ended — a FOLD, and the pair parts (the obtuse chain hopped 8.3 mm at the corner)
    // …only at a JUNCTION (a span boundary: two legs meeting at a corner that can fold back), never at a runway's own
    // convex or concave vertex mid-runway, where a follower's root crosses the break in contact with the path curving
    // away between (the bend-90 ridge: r21e)
    const junctionBreaks = route.spans ? route.spans.slice(1).map((sp) => sp.dStart) : [];
    const acrossOpenBreak = (Dr) => { for (const bk of junctionBreaks) { if ((bk - Dhint) * (Dr - Dhint) > 0 && Math.abs(bk - Dhint) < Math.abs(Dr - Dhint) && f(bk) > 1e-9) return true; } return false; };
    if (converged && Math.abs(fd) < 1e-9 && D >= Dmin - 1e-12) return acrossOpenBreak(D) ? NaN : Math.max(Dmin, D);
    // bracket: the sign change nearest the hint within one diameter either side
    const lo0 = Math.max(Dmin, Dhint - twoR), hi0 = Dhint + twoR;
    const K = 64; let best = null;
    let prevD = lo0, prevF = f(lo0);
    for (let k = 1; k <= K; k++) {
      const x = lo0 + (hi0 - lo0) * k / K; const fx = f(x);
      if ((prevF <= 0 && fx >= 0) || (prevF >= 0 && fx <= 0)) {
        const mid = 0.5 * (prevD + x);
        if (!best || Math.abs(mid - Dhint) < Math.abs(0.5 * (best.a + best.b) - Dhint)) best = { a: prevD, b: x, fa: prevF, fb: fx };
      }
      prevD = x; prevF = fx;
    }
    if (!best) return NaN;
    if (acrossOpenBreak(0.5 * (best.a + best.b))) return NaN;
    let a = best.a, b = best.b, fa = best.fa;
    for (let it = 0; it < 60; it++) {
      const m = 0.5 * (a + b); const fm = f(m);
      if (Math.abs(fm) < 1e-13 || b - a < 1e-14) return m;
      if ((fa <= 0 && fm <= 0) || (fa >= 0 && fm >= 0)) { a = m; fa = fm; } else b = m;
    }
    return 0.5 * (a + b);
  }
  const D0 = Dmin + twoR;
  const f0 = f(D0);
  if (Math.abs(f0) < 1e-12) return D0;                 // a straight run: exact
  // bracket [lo, hi] with f(lo) < 0 < f(hi): the chord grows with the path distance
  let lo = Dmin; let hi = D0;
  if (f0 < 0) { lo = D0; hi = D0 + twoR; for (let k = 0; k < 8 && f(hi) < 0; k++) { lo = hi; hi += twoR; } }
  let D = D0;
  for (let it = 0; it < 60; it++) {
    const fd = f(D);
    if (Math.abs(fd) < 1e-13) return D;
    if (fd < 0) lo = Math.max(lo, D); else hi = Math.min(hi, D);
    const h = 1e-7;
    const slope = (f(D + h) - fd) / h;
    let next = slope > 1e-6 ? D - fd / slope : NaN;
    if (!(next > lo && next < hi)) next = 0.5 * (lo + hi);   // bisection safeguard
    if (Math.abs(next - D) < 1e-14) return next;
    D = next;
  }
  return D;
}

/** Memoised support-derived trio per (support object, r). */
const derivedByObj = new WeakMap(); // support object → Map(r → derived) — the hot path's own memo (order 16: the string key below cost 44 % of a solve)
export function derivedFor(track, support, r) {
  let byR = derivedByObj.get(support);
  if (byR) { const hit = byR.get(r); if (hit) return hit; } else { byR = new Map(); derivedByObj.set(support, byR); }
  // key = EVERY parameter the derivation reads (seal 3, review r1 P2-2: the first
  // key had gauge + an undefined width and no railR, so two twin-rail overrides
  // with the same gauge and different rail diameters shared one h/ρ/k)
  const key = `${support.kind}|${support.gauge ?? ''}|${support.railR ?? ''}|${support.width ?? ''}|${r}`;
  let d = track.derivedCache.get(key);
  if (!d) { d = supportDerived(support, r); track.derivedCache.set(key, d); }
  byR.set(r, d);
  return d;
}

/** Rolling-resistance coefficient on the support for a ball of radius r.
 * The kernel's u_r is an OBSERVED centre deceleration on a flat floor
 * (evolve.rs: a = u_r·g), i.e. it already contains the 5/7 inertia factor.
 * Modelling rolling resistance as a normal-force offset δ (a moment — the only
 * agent that can decelerate a purely rolling ball) gives a_flat = (5/7)·g·δ/r,
 * so δ = (7/5)·u_r·r. About the two-rail contact axis (lever ρ, inertia
 * (2/5)mr² + mρ²) the same δ decelerates the centre by k·(δ/ρ)·g·cosθ =
 * k·(7/5)·(r/ρ)·u_r·g·cosθ; on a flat channel (k = 5/7, ρ = r) this is exactly
 * u_r·g·cosθ — the cited class means the same thing on cloth and on the track. */
export const resistCoeff = (der, r, u_r) => 1.4 * (r / der.rho) * u_r;

/** Does this edge DRIVE the reference ball forward — law V7's own predicate, written once and read
 * by both of its readers: the validator's drain law and `buildRoute`'s stop-body exclusion. An edge
 * that does not drain is not floor; V7 refuses one wherever a ball travels, and inside the stop-body
 * zone, where V7 is waived because the stop's own body lives there, `buildRoute` declines to walk it
 * (GH-770 review r3, class U). With no u_r stated the comparison is false and every piece in that zone
 * reads as body — the definition is refused by V7 a moment later on the same arithmetic. */
export const drainsAt = (der, e, r, u_r) => der.k * G * e.sinTh > der.k * G * resistCoeff(der, r, u_r) * e.cosTh;

/** Forward acceleration of a ball of radius r at D on the route:
 * a = k·g·(sinθ − (7/5)(r/ρ)·u_r·cosθ). */
export function accelAt(route, D, r) {
  const loc = locate(route, D);
  const der = derivedFor(route.track, loc.rw.support, route.r ?? r);
  const e = loc.edge;
  const drive = der.k * G * e.sinTh;
  const resist = der.k * G * resistCoeff(der, r, route.track.u_r) * e.cosTh;
  return {
    a: drive - resist, drive, resist,
    runwayId: loc.rw.id,
    isTray: loc.rw.id === route.restId, // the rest surface of this route (the tray, or the chute)
    k: der.k, rho: der.rho, edge: e,
  };
}

/** The next break station strictly below D (the boundary the ball will cross
 * next), or 0 (the wall) when none. */
export function nextBreakBelow(route, D) {
  for (const b of route.breaks) if (b < D - 1e-12) return b;
  return 0;
}

/** Rest station of the n-th ball (1-based) from the wall: D = (2n − 1)·r. */
export const restStation = (n, r) => (2 * n - 1) * r;

/** The UPSTREAM bound of a route's seating chain: the landing rule seats a ball at most one ball
 * length above the entry — `kinematics.js seatFor()` walks its seat ladder to here and refuses a
 * jammed queue beyond it, so every station a returned ball can occupy lies in [0, seatUpstream].
 * ONE reading, because two of them drift: the V16 clearance scan swept only [0, route.total] and a
 * furniture box through the seventh, UPSTREAM ball of a queue therefore cleared the row it exists
 * to fail (order 23b round 10, class B). Stations above the pocket exit line are still not
 * violations — the scan's own `drawn` test culls them, exactly as `seatFor` refuses an invisible
 * occupant a seat.
 * NOTE (round 11 class A): this is the bound `seatFor` refuses a JAMMED queue at, and the seating
 * chain never reaches past it — but it is NOT the bound of what may be drawn. `seatFor` still seats a
 * ball behind a MOVING tail above it (momentary congestion), and the extrapolated route between the
 * chain's last seat and here is not on the table. What may be DRAWN is `reachSpan`. */
export const seatUpstream = (route, r) => route.total + 2 * r;

/** The route's SEATING CHAIN: every station the landing rule can assign a returned ball, in order from
 * the wall — the wall seat at D = r, then one 3-D centre diameter per seat (a 1-D ladder (2n − 1)·r
 * over-counts through bends), stopping at the first upstream seat whose ball would sit above the pocket
 * exit line (an invisible occupant is not a seat) or past `seatUpstream`.
 * ONE reading, because two of them drift: `kinematics.js seatFor()` counts this chain to decide whether a
 * landing ball has a seat, and `reachSpan` below takes its LAST seat as the top of everything the module may
 * draw. Round 10 first widened V16's CONTINUOUS sweep to `seatUpstream` and that was too much: the 16.6 mm of
 * extrapolated route between the last seat and `seatUpstream` on TEST-terminal-chutes runs through the table
 * body — a shipped fixture refused for stations no ball can occupy (the browser gate's arm 13a). Round 10 drew
 * the wrong conclusion from that ("a ball never rolls above the entry, it only ever RESTS on a seat", so the
 * span above the entry is discrete): behind a MOVING tail a ball rolls through every station between two seats,
 * measured. The chain is the honest BOUND; the span up to it is continuous throughout — see `reachSpan`. */
export function seatLadder(route, r) {
  const upstream = seatUpstream(route, r);
  const out = [];
  for (let k = 1, Dk = r; Dk <= upstream + 1e-9; k++) {
    const st = stationAt(route, Dk, r, {});
    if (Number.isFinite(route.exitY) && Dk > route.total + 1e-9 && st.y + r > route.exitY) break;
    out.push({ k, D: Dk, x: st.x, y: st.y, z: st.z });
    const next = seatBehind(route, [st.x, st.y, st.z], Dk, 2 * r, NaN);
    if (!(next > Dk + 1e-12)) break;
    Dk = next;
  }
  return out;
}

/**
 * The route's REACHABLE SPAN: `{ top, ladder }` — the ONE reading of where this module may DRAW a
 * returned ball. `top` is the landing rule's own runway top, `seatUpstream` (one ball length above
 * the entry): past it the route is extrapolation, not track. `ladder` is the seating chain.
 *
 * Three readers, one function (order 23b round 11): `kinematics.js poseAt` (which draws), the V16
 * clearance scan (which asks the furniture about every position it can draw at) and the V5 sink
 * clearance walk (which measures the nearest drawn centre to the sink's last pose). Before, each
 * carried its own reading and they disagreed: poseAt culled an upstream ball on the pocket EXIT
 * LINE alone, and above the entry the extrapolated first segment can stay below that line for a
 * long way (measured on the shipped definitions: 7.8 mm past `seatUpstream` on
 * TEST-terminal-chutes, 426.6 mm on TEST-obtuse-merge route 4). `seatFor` refuses a landing past
 * `seatUpstream` behind a RESTING tail, but behind a MOVING tail — momentary congestion, the ball
 * is on the pile in the chute — it seats the ball wherever the tail leaves room, with no upstream
 * bound at all, and the ball was DRAWN there: on the generic bed a rolling ball 65 mm above the
 * entry of TEST-terminal-chutes stands 15.3 mm inside the apron while V16, which scanned only to
 * the entry and the chain's seats, reported no violation. The rule is the defect, not the
 * validator: a ball beyond the runway is beyond the drawable queue, and it waits UNDRAWN in the
 * chute (`seatFor`'s own moving-tail case) until the queue brings it back onto the track.
 *
 * `poseAt` and V16 agree per POSITION, not merely on this interval: above the entry each applies the
 * same exit-line test, poseAt to the pose it is about to draw and V16 to the station it is about to
 * ask the furniture about. That is what separates this from round 10's first cut, which swept to
 * `seatUpstream` with no visibility test and off the entry's grid, and so refused a shipped fixture
 * on extrapolated stations no ball is ever drawn at.
 *
 * `top` is NOT the chain's last seat. That cut was tried and measured: on TEST-synthetic-wire-slide
 * the chain tops out 11.8 mm above the entry (37 seats) while the landing rule seats balls at
 * D 2113.0 and 2122.4 mm, both below the exit line and — the drawn-frame probe over the whole
 * lifecycle, 19876 samples against 83 furniture meshes — both clear of every mesh on the table.
 * Withholding them bought no clearance and cost 77 ms and 142 ms of blank chute. The chain's top is
 * the highest station a ball can REST at; the runway top is the highest it can be DRAWN at.
 *
 * Below the entry the span is CONTINUOUS, and above it — this is round 10 class B's law, corrected —
 * it is continuous too: a ball never RESTS between two seats, but it rolls through every station
 * between them behind a moving tail.
 */
const spanCache = new WeakMap();
export function reachSpan(route, r) {
  const hit = spanCache.get(route);
  if (hit && hit.r === r) return hit.span;
  const ladder = seatLadder(route, r);
  const span = { top: seatUpstream(route, r), ladder };
  spanCache.set(route, { r, span });                 // a pure function of (route, r): the cache cannot change a reading
  return span;
}

/** The highest station this module may DRAW a ball at on `route` (see `reachSpan`). */
export const reachTop = (route, r) => reachSpan(route, r).top;
