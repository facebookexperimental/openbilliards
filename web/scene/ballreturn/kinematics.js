// Copyright (c) Meta Platforms, Inc. and affiliates.

// kinematics.js — the ball-return motion law as a PURE FUNCTION OF TIME (feature
// 037, issue #650). Node-importable, no three.js, no DOM, no clocks, no randomness.
//
//   handoffFromSink(entry, ctx)  the instant + state at which the frozen sink
//                                animation culls the ball (closed form over the
//                                sink entry's own ballistic fields), the free fall
//                                to the runway entry and the inelastic landing.
//   solveShot(input)             the 1-D inelastic TRAIN along the routes: per-edge
//                                acceleration a = k·g·sinθ − u_r·g·cosθ, contacts
//                                (perfectly inelastic), clusters with the mean
//                                acceleration split by pool-adjacent-violators, the
//                                tray wall as an infinite-mass member. Output =
//                                motion PIECES per ball (piecewise quadratic) and
//                                the event list (audio hook).
//   poseAt(solution, id, t)      binary search + closed form → centre + rolling
//                                quaternion. Random-access identical by construction.
//
// Derivations and the alternatives rejected: feature 037 (internal spec)
// research.md R2–R5. Constants here are MIRRORS of sinkpivot.js / game.js frozen
// values (SINK_G, SINK_SHIELD_Y, SINK_SECONDS) — nothing is authored.
import { G, stationAt, tangentAt, accelAt, nextBreakBelow, locate, derivedFor, restStation, seatUpstream, seatLadder, reachTop, stationD, seatBehind, sideD, refusePose, EXPORT_GRAIN, routeEntry } from './track.js';

export const SINK_SHIELD_Y = -0.055; // sinkpivot.js — cull once the ball TOP is below
// order 18 item 2: a ball pushed BACKWARD through a junction continues on the rail it is on (the runway under it, via the
// route that owns that runway from its head); where no runway continues above the point (the point is the runway's first
// vertex — a fork nose) the backward roller is stopped there. One switch for both sites (the boundary crossing and the seat).
const BACK_THROUGH_JUNCTION = true;
export const SINK_SECONDS = 0.45;    // game.js — legacy sink TTL
// Numerical guards [DESIGN, not physics]: EPS_T = 1 ns separates two events at
// float-equal times so the same boundary is never re-fired (~6.6 orders below
// the 240 Hz pin grid, ~7.2 below a 60 Hz render frame — no pose can depend on it);
// MAX_EVENTS bounds a runaway solve: a full rack of 22 balls over the largest
// fixture (4 runways × ≤ 4 edges, contacts between neighbours) is ~10³ events,
// so 2 × 10⁴ is > 10× margin; reaching it THROWS (below) — index.js catches,
// keeps that record on the sink's own cull and reports once — never a silently
// truncated train. `solveShot({ maxEvents })` overrides it for the unit arm.
const EPS_T = 1e-9;
const MAX_EVENTS = 20000;

// ------------------------------------------------- the refinement budget [DERIVED]
// `solveShot` runs SYNCHRONOUSLY on the render path (`index.js ensureSolution`, called from the
// pose hooks), so one solve is one input-latency beat. Constitution §V Performance Budget
// (the project constitution, internal; the perceptual-doctrine clause) allows the whole submit
// block "roughly two 60 Hz frames" (the standing ≤ 34 ms convention, the internal app-perf
// record); the kernel's own worst MEASURED warm submit block is 17.7 ms (snooker seed 3,
// compliant — the internal break-flip perceptual record, its sync-submit table), and this
// extension's own render-path allowance is 0.05 ms a frame (`feature 037 (internal spec)
// plan.md`, constitution gate 5). What is left of the beat for the return solve is the difference:
//     2 × 1000/60 − 17.7 − 0.05 = 15.58 ms.
// WHAT THE BUDGET METERS is the ADAPTIVE part of the solve — the graze refinement below — not the
// solve as a whole. The rest of a solve (the fixed contact grid, the bisection, the event book) is
// bounded by the track and the ledger and is the same work it has always been; the refinement is
// the only term that can grow without a bound the inputs imply, and it is the term that froze the
// page. Metering the whole solve would make the budget bite fixtures that have always been fine
// (worst shipped solve today: 85 737 walker steps of ordinary scan on TEST-hairpin-170).
// A WALL-CLOCK budget would make the event list machine-dependent and break SC-001's determinism
// pin (`checks.determinism_sha256` is hashed off the event list), so the allowance is carried in
// the refinement's own unit of work — walker steps — converted once at the rate MEASURED on a
// refinement-SATURATED solve, the only workload whose step cost is the refinement's step cost
// (the pre-fix TEST-shallow-merge freeze, 96 284 274 steps in 115 140 ms = 836.2 steps/ms;
// order 23b round 10 §29.20). THAT RATE IS A PROPERTY OF THE REFERENCE MACHINE, which the contract
// (§18.x, `the ballreturn contract (feature 037, internal)`) names once and this line cites:
// the STEP count is the portable, deterministic quantity; the ms it stands for is reference-machine.
// Never re-derive it per device — that is the machine-dependence SC-001 forbids. Bound on what that
// costs: worst shipped refinement 24 steps = 0.2% of the budget against 85 737 walker steps of
// ordinary scan, so a device must be ~500x slower than the reference before a shipped fixture's
// refinement reaches the 15.58 ms the budget stands for.
// Reaching it does not stop the solve and never spins: the pair is resolved at the bracket already
// in hand and the solution carries a named `degradations` record (kind, cluster size, steps spent).
const REFINE_MS_BUDGET = 2 * (1000 / 60) - 17.7 - 0.05;
const WALK_STEPS_PER_MS = 836.2;
export const WALK_BUDGET = Math.round(REFINE_MS_BUDGET * WALK_STEPS_PER_MS);
// The solve's own work meter: every walker step, whatever asks for it. Monotonic; a solve reads
// the difference across itself, so nothing depends on when the module was loaded.
let walkSteps = 0;
export const walkStepCount = () => walkSteps;

/** Causal rank of a TrackEvent kind for equal-time ordering (review r4 P3): a ball
 * lands / crosses a junction / is refused BEFORE the contact that follows from it;
 * the wall and a stop close a motion; a release re-opens one. Then insertion
 * sequence (the solver's own causal order), then ball id. */
export const EVENT_RANK = Object.freeze({ landing: 0, resume: 0, junction: 1, impact: 1, overflow: 1, lock: 1, yield: 2, release: 2, separate: 2, wall: 3, ceiling: 3, stop: 3, turn: 3, contact: 4, step: 4, fold: 3 });
export const compareEvents = (a, b) => (a.t - b.t) || ((EVENT_RANK[a.kind] ?? 9) - (EVENT_RANK[b.kind] ?? 9)) || ((a.seq ?? 0) - (b.seq ?? 0)) || (a.ball - b.ball);

// ---------------------------------------------------------------- quaternions
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qaxis = (ax, ang) => {
  const s = Math.sin(ang / 2);
  return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)];
};
const Q_ID = [0, 0, 0, 1];

// ---------------------------------------------------------------- handoff
/**
 * From a game.js sink-index entry to the extension's handoff. Returns null when the
 * entry is not served (netted / dressed classes, unknown pocket, missing fields).
 * ctx: { track, pockets: [{x,z,r}] kernel order (three frame), r: fallback radius }
 */
export function handoffFromSink(entry, ctx) {
  if (!entry || entry.net || entry.dress || entry.rest) return null; // a closure REST is game.js's (order 18 item 0, refuter E)
  const t0 = entry.t;
  if (!Number.isFinite(t0)) return null;
  const fall = entry.fall ?? entry.pocket;
  if (!fall || !Number.isFinite(fall.x) || !Number.isFinite(fall.z)) return null;
  const r = Number.isFinite(entry.r) ? entry.r : ctx.r;
  if (!(r > 0)) return null;
  // nearest kernel pocket to the fall centre (game.js's own 0.12 m sanity radius)
  let idx = -1;
  let best = 0.12 * 0.12;
  for (const [i, p] of (ctx.pockets ?? []).entries()) {
    const d = (fall.x - p.x) ** 2 + (fall.z - p.z) ** 2;
    if (d < best) { best = d; idx = i; }
  }
  const route = ctx.track.routes.get(idx);
  if (!route) return null;

  let tH;
  let vDown;
  let ttl;
  let source;
  const pv = entry.pivot;
  if (pv && [pv.tPivot, pv.fallDelay, pv.p1y, pv.v1y].every(Number.isFinite)) {
    const depth = pv.p1y + r - SINK_SHIELD_Y;          // fall from p1y to the cull height
    const disc = pv.v1y * pv.v1y + 2 * G * depth;
    if (!(disc >= 0)) return null;
    const tf = (pv.v1y + Math.sqrt(disc)) / G;          // positive root (v1y ≤ 0 after a pivot)
    // (#707 prep FIX3, review 707m3 P2) the PRE-ROLL: since #637 a snooker corner capture outside the dressed throat rolls to its
    // rim first (sinkpivot.js buildSinkPivot, SNK-R36) and poseInSink shifts its clock by `roll.t` before the pivot/drop. The
    // hand-off is read on the SAME clock: `pv.roll.t` — the ONE duration the sink builder computed (distance / capture speed),
    // the field poseInSink subtracts, never re-derived here. An entry without a roll adds 0 and is byte-unchanged. Timing
    // contract: the ownership ledger §"Recorded deviation (frozen sinkpivot.js, one branch): the W9-named model extension — SNK-R36".
    const tRoll = pv.roll && Number.isFinite(pv.roll.t) && pv.roll.t > 0 ? pv.roll.t : 0;
    tH = t0 + tRoll + pv.tPivot + pv.fallDelay + tf;
    vDown = Math.sqrt(disc);
    ttl = Number.isFinite(pv.ttl) ? pv.ttl : SINK_SECONDS;
    source = 'pivot';
  } else {
    const tFall = Number.isFinite(entry.tFall) ? entry.tFall
      : (Number.isFinite(entry.glide) ? 0.35 * entry.glide : null);
    if (tFall === null) return null;
    const tf = Math.sqrt(2 * (2 * r - SINK_SHIELD_Y) / G);
    tH = t0 + tFall + tf;
    vDown = G * tf;
    ttl = SINK_SECONDS;
    source = 'legacy';
  }
  const clamped = tH > t0 + ttl;
  if (clamped) tH = t0 + ttl; // never active analytically (research R2); belt and braces

  // free fall from the cull height to the entry station (D = route.total) — the REBUILT route's entry,
  // through the one reader V5 validates with (GH-770 review r7, class AE)
  const en = routeEntry(route, r);
  const st = stationAt(route, route.total, r, {});
  if (st.x !== en.x || st.y !== en.y || st.z !== en.z) throw new Error('ball-return handoff: the entry reader and the drawn entry disagree');
  const yH = SINK_SHIELD_Y - r;
  const dy = yH - st.y;
  if (!(dy > 0)) return null; // entry above the handoff — the validator refuses this
  const tFree = (-vDown + Math.sqrt(vDown * vDown + 2 * G * dy)) / G;
  const vLand = vDown + G * tFree;
  const edge = en.edge;
  const v0 = st.k * vLand * edge.sinTh;               // angular momentum about the contact axis
  return {
    tH, vDown, yH, x0: fall.x, z0: fall.z, xE: st.x, yE: st.y, zE: st.z, preRoll: pv && pv.roll && Number.isFinite(pv.roll.t) && pv.roll.t > 0 ? pv.roll.t : 0, // the pre-roll the hand-off clock includes (FIX3)
    tLand: tH + tFree, vLand, v0, route, pocket: idx, r, source, clamped,
    exitY: route.exitY,                                  // shown only once the ball TOP is below this
  };
}

/** The EARLY hand-off (order 18 item 0, the ownership hand-off): the sink pose came within one
 * diameter of a ball this module draws or holds at `own.t` < h.tH, so the module owns the ball
 * from there. An inelastic stop on the queue (the module's e = 0): vDown 0 from the contact pose,
 * the fall to the entry station re-derived from that height (dy ≤ 0: no fall — the landing check
 * at own.t decides a seat or a HOLD). Pure in (h, own); h is returned unchanged when own is not
 * earlier than tH. */
export function ownHandoff(h, own, force = false) {
  if (!h || !own || (!force && !(own.t < h.tH))) return h; // force: a carried HOLD resumes at the new base's own instant
  // the ball STOPPED on what it met: the landing rule decides at own.t itself (a seat → the fall to it from this height,
  // re-aimed as every landing is; none → a HOLD at this pose). No free fall is booked through the ball it touched.
  return { ...h, tH: own.t, x0: own.x, z0: own.z, yH: own.y, vDown: 0, tLand: own.t, vLand: 0, v0: 0, q: own.q ?? h.q,   // the orientation at the early hand-off (class C)
    own: { t: own.t, x: own.x, y: own.y, z: own.z, tHFree: h.tH }, source: /\+own$/.test(h.source) ? h.source : `${h.source}+own` /* a carried hold is re-owned at every new base; the tag is written once */ };
}

// ---------------------------------------------------------------- roots
/** First τ ≥ 0 at which gap0 − B·τ − ½·A·τ² reaches 0 (B = closing speed, A =
 * closing acceleration), or Infinity. Stable form 2·gap0 / (B + √disc). */
function firstCrossing(gap0, B, A) {
  if (gap0 <= 1e-12) return (B > 1e-15 || (Math.abs(B) <= 1e-15 && A > 0)) ? 0 : Infinity;
  if (Math.abs(A) < 1e-15) return B > 1e-15 ? gap0 / B : Infinity;
  const disc = B * B + 2 * A * gap0;
  if (disc < 0) return Infinity;
  const den = B + Math.sqrt(disc);
  if (den <= 0) return Infinity;
  return 2 * gap0 / den;
}

// ---------------------------------------------------------------- the train
/**
 * input: { track, r, ledger: [ballId | {id, D, route?, q?}...], arrivals: [{ id, handoff }],
 *          continuations: [{ id, route, D, v, q, t0 }] }
 *   continuations (seal 3, review r1 P1-B): balls still ON the track when the time
 *   base changes (the next shot starts, or a re-solve mid-roll) enter at their
 *   current station D with their current speed v and rolling orientation q at
 *   t = t0 of the NEW base — no re-seat from −∞, no spin reset. Read them off the
 *   previous solution with continuationAt().
 * returns: { pieces: Map<id, Piece[]>, events: [...], rest: Map<id, D>, tEnd, r, track }
 */
export function solveShot({ track, r, ledger = [], arrivals = [], continuations = [], maxEvents = MAX_EVENTS, walkBudget = WALK_BUDGET }) {
  const balls = new Map();
  const clusters = [];
  const events = [];
  const steps = [];   // walker-step instants (order 17 item 5)
  const walkStart = walkSteps;                 // the solve's own work meter
  let refineSpent = 0;                         // …of which the adaptive graze refinement's share, against the DERIVED budget
  let refineEsc = 0;                           // march steps whose assumed closing rate the step itself refuted (raised, retaken)
  const degradations = [];                     // named coarse resolutions, never a silent loop (order 23b round 10 class A)
  // `walkBudget` is the DERIVED allowance above; it is an argument only so an arm can drive the
  // degradation path deliberately (a shipped caller never passes it)
  const overBudget = (inFlight = 0) => refineSpent + inFlight > walkBudget;
  const overflow = new Set(); // arrivals refused at a blocked entry (kept culled by the caller)
  const held = [];            // OWNED arrivals held where the sink left them (order 18 item 0), re-checked at every scan
  let junctionOverlaps = 0;   // residual overlaps found at a junction crossing (the arm asserts 0)
  const mk = (id, route) => ({ id, route, D: 0, v: 0, pieces: [], cluster: null, active: false, aFree: 0 });
  // ---- the contact TREE (order 23) ---------------------------------------------------------------------------------
  // A cluster's members are kept in DFS PRE-ORDER from the root (members[0]); `c.parent[i]` is the index of the member that
  // member i is seated behind (−1 for the root). A chain is the tree with parent[i] = i − 1, and every formula below reduces to
  // the list's on a chain, bit for bit (the same sums in the same order). A member's sub-tree is the contiguous range
  // [i, subtreeEnd(i)) of the pre-order — a pre-order prefix of a sub-tree is a connected rooted sub-tree, which is what the
  // push law's "prefix maximum" needs. The order across lanes is the PARENT order — never a D re-sort (the D of two routes are
  // two axes: §27.2's false fold, r45's seeding D filed between two feeder balls).
  const chainParent = (n) => { const p = new Array(n); for (let i = 0; i < n; i++) p[i] = i - 1; return p; };
  const parentOf = (c) => (c.parent && c.parent.length === c.members.length) ? c.parent : (c.parent = chainParent(c.members.length));
  const subtreeEnd = (par, i) => { let e = i + 1; while (e < par.length && par[e] >= i) e++; return e; };
  const rangeIdx = (a, b) => { const out = []; for (let i = a; i < b; i++) out.push(i); return out; };
  const mergeIdx = (a, b) => { const out = []; let i = 0, j = 0; while (i < a.length || j < b.length) { if (j >= b.length || (i < a.length && a[i] < b[j])) out.push(a[i++]); else out.push(b[j++]); } return out; };
  /** A cluster from a subset of `c`'s members (ascending indices — a connected rooted sub-tree), parents remapped. */
  const subCluster = (c, idxs, extra = {}) => {
    const par = parentOf(c); const pos = new Map(idxs.map((i, k) => [i, k]));
    const parent = idxs.map((i, k) => (k === 0 ? -1 : (pos.get(par[i]) ?? -1)));
    return { members: idxs.map((i) => c.members[i]), parent, ...extra };
  };

  const pending = arrivals
    .filter((a) => a && a.handoff)
    .map((a) => ({ id: a.id, h: a.handoff }))
    .sort((x, y) => (x.h.tLand - y.h.tLand) || (x.id - y.id));
  for (const p of pending) {
    const b = mk(p.id, p.h.route);
    b.handoff = p.h;
    b.qIn = Array.isArray(p.h.q) && p.h.q.length === 4 ? p.h.q.slice() : null; // the incoming orientation (class C): drawn while the ball is visible, reset only where hidden
    b.pieces.push(fallPieceOf(p.h, r, b.route)); // (#737 r3 class A) an EARLY own begins where the sink left the ball, above the shield: drawn there (a hand-off at the crossing starts AT the shield: never) — the ONE fall-piece builder (FIX4 A: V16 sweeps the same piece)
    balls.set(p.id, b);
  }

  const restIdOf = (b) => b.route.restId; // the wall lives on the route's rest surface (tray or chute)
  /** The next break station strictly ABOVE D (the boundary a ball rolling back up its runway
   * crosses next), or the route's top when none (order 16). `route.breaks` is descending. */
  const nextBreakAbove = (route, D) => { let best = route.total; for (const b of route.breaks) { if (b > D + 1e-12 && b < best) best = b; } return best; };
  // the runway a ball is ABOUT to travel on (a ball exactly at a junction station
  // belongs to the downstream runway)
  const runwayOf = (b) => locate(b.route, Math.max(0, b.D - 1e-9)).rw.id;
  /** Can `rear` (larger D) physically touch `front`? Iff front's runway lies on
   * rear's route chain at or after rear's own runway — D is continuous through a
   * landing, so the path distance between them is exactly D_rear − D_front. */
  const canTouch = (rear, front) => {
    const ch = rear.route.chain;
    const rwR = runwayOf(rear);
    const rwF = runwayOf(front);
    const i = ch.indexOf(rwR);
    if (i < 0 || ch.indexOf(rwF, i) < 0) return false;
    if (rwF === rwR || front.route === rear.route) return true; // one lane by construction (a leader inside its own junction blend included)
    // front on a runway further down rear's chain: it must be at or below the station
    // where rear's path lands on that runway — above it the two are on different
    // branches converging on a junction and their D difference is not a path distance
    const sp = rear.route.spans.find((x) => x.rw.id === rwF);
    if (!sp) return true;
    // (order 19, refuter G's G4) the comparison is made in the runway's OWN station, never across
    // route D: two routes' stations of one physical point differ by their corner cuts (3.0 mm on
    // TEST-y3-obtuse), and the route-D test read a tail 2.4 mm ABOVE the point as "at or below"
    // it, so the window's same-lane exemption dropped a real occupant and a holder was released
    // early (y2detail: b2 released at 0.5015 with b4 at route-1 D 450.7 vs route-0 span start 451.3)
    const sF = locate(front.route, Math.max(0, front.D)).sLocal; // the front's physical station on that runway
    return sF >= sp.sStart - 1e-9;
  };
  /** Two balls on DIFFERENT branches converging on one junction — the rear on a feeder above its
   * landing on the front's runway, the front on that runway above the landing point (inside the merge
   * zone, within three diameters of it) — CAN touch, in 3-D (order 16 round 4, refuter B's item 1): a
   * follower recoiled by an obtuse impact rolled back INTO the rc-run window from below after the
   * feeder ball had passed its yield line, and with `canTouch` false the two were drawn through each
   * other (0.913 mm for 203 ms on an admitted geometry; seeded recoils on the shipped shallow /
   * mid-edge / obtuse fixtures 0.405 / 0.505 / 12.1 mm). The yield law keeps such pairs apart when
   * both come from ABOVE; a ball arriving in the zone from below is what it cannot see, and the contact
   * law — the 3-D scan and a merge on the seat geometry, which is route-agnostic — is what resolves it. */
  /** The front on a runway further down the rear's chain but still ABOVE the rear's landing on it
   * (within three diameters along the runway), the rear at or above that landing (within four along
   * its own path): NOT one lane yet — the window law keeps them apart while the rear holds — but a pair
   * the 3-D contact scan must read, because the scan's admission is decided at the scan instant and
   * the front can cross the landing (become one lane) INSIDE the scan's horizon. With the strict
   * same-lane test alone (order 19, the G4 repair's first cut) the b1/b3 contact of r29's shipped-130°
   * seed — b3 three millimetres below the point at the crossing, no event between the turn and the
   * touch — was booked 12 ms late and 4.3 mm deep, r27's 140°/70/0.77 pair 2.4 ms late (0.106 mm):
   * the old route-D compare had admitted them by its corner-cut slack, by accident. */
  const approachingLane = (rear, front) => {
    if (front.route === rear.route) return false;
    const ch = rear.route.chain;
    const rwR = runwayOf(rear), rwF = runwayOf(front);
    const i = ch.indexOf(rwR);
    if (i < 0 || rwF === rwR || ch.indexOf(rwF, i) < 0) return false;
    const sp = rear.route.spans.find((x) => x.rw.id === rwF);
    if (!sp) return false;
    const aboveF = sp.sStart - locate(front.route, Math.max(0, front.D)).sLocal; // the front above the rear's landing, along the runway
    const aboveR = rear.D - sp.dStart;                                          // the rear above that landing, along its own path
    return aboveF > 1e-9 && aboveF <= 3 * 2 * r && aboveR > -1e-9 && aboveR <= 3 * 2 * r + 2 * r;
  };
  const convergeAtJunction = (rear, front) => {
    const rwF = runwayOf(front), rwR = runwayOf(rear);
    if (rear.route === front.route || rwR === rwF) return false;
    const sp = rear.route.spans.find((x) => x.rw.id === rwF);
    if (sp) {
      const i = rear.route.chain.indexOf(rwR);
      if (i < 0 || rear.route.chain.indexOf(rwF, i) < 0) return false;          // the front's runway is not downstream of the rear's
      return front.D > sp.dStart + 1e-9 && front.D <= sp.dStart + 3 * 2 * r && rear.D <= sp.dStart + 3 * 2 * r + 2 * r;
    }
    // Two FEEDERS of one junction (order 17, item 3; refuter B's `backinto2.mjs` shallow family): neither ball
    // is on the other's chain, but both routes leave their runways for one runway at one station — the
    // rc-run ball and the lc-run ball converging on the trunk's landing point. The rear is the one further
    // from its landing (it enters the point second; the 3-D contact is symmetric, the seat root behind the
    // front exists on the rear's own branch). Without this the pair was drawn to 8.4 mm apart and re-seated
    // 44 mm at the landing.
    const spR = rear.route.spans.find((x) => x.rw.id === rwR), spF = front.route.spans.find((x) => x.rw.id === rwF);
    if (!spR || !spF) return false;
    const iR = rear.route.chain.indexOf(rwR), iF = front.route.chain.indexOf(rwF);
    const nextR = rear.route.chain[iR + 1], nextF = front.route.chain[iF + 1];
    if (!nextR || !nextF || nextR !== nextF) return false;                      // not the same downstream runway
    const spRn = rear.route.spans.find((x) => x.rw === nextR || x.rw.id === (nextR.id ?? nextR)), spFn = front.route.spans.find((x) => x.rw === nextF || x.rw.id === (nextF.id ?? nextF));
    if (!spRn || !spFn || Math.abs(spRn.sStart - spFn.sStart) > 1e-9) return false; // not the same landing point on it
    const aboveR = rear.D - spR.dEnd, aboveF = front.D - spF.dEnd;               // each ball's distance above its own landing
    if (!(aboveR > 1e-9 && aboveF > 1e-9)) return false;
    // (order 23b) an exact TIE — two balls the same distance above one point on a symmetric fork (the shipped wire slide, two balls
    // seeded alike) — made the pair no scan pair from either side ("the front is the nearer" strictly), and the two were drawn
    // through one another at the point (0.020 mm between centres at 0.3050 s). A tie is broken by the ball id: deterministic,
    // and the 3-D contact it books is the same whichever ball is called the front.
    const nearer = aboveF < aboveR || (aboveF === aboveR && front.id < rear.id);
    return aboveF <= 3 * 2 * r && aboveR <= 3 * 2 * r + 2 * r && nearer;         // the front is the nearer of the two
  };
  /** The next merge point ahead of a ball (its own junction, or another feeder's
   * landing on its runway), or null. */
  const nextJunction = (b) => {
    for (const m of b.route.merges) if (m.D < b.D - 1e-12) return { Db: m.D, after: m.rw.id, sJ: m.s, Dy: m.yieldD ?? (m.D + 2 * r) };
    return null;
  };
  /** Balls of OTHER branches inside the merge window of the physical point (runway
   * `after`, station sJ): within one ball diameter of it along their own path — the
   * point mapped onto each ball's route (the same wall), |D − Dj| < 2r. */
  const windowOccupants = (b, after, sJ) => {
    const occ = [];
    for (const o of clusters) {
      if (o === b.cluster) continue;
      for (const m of o.members) {
        // A cluster holding for THIS window stands on its own yield line, outside the window by
        // construction, and is not "inside" it (two holders would otherwise wait on each other
        // forever). Seals 8…15 skipped EVERY member of ANY holding cluster: a queue held for the
        // tray window further down the trunk was invisible to a feeder ball asking about the
        // trunk window it was standing in, the feeder ball landed inside that queue and ended
        // drawn ON a held ball (shipped TEST-synthetic-wire-slide, 0 mm, §18.3 row 6). Only the
        // holder's own front ball, for the window it holds for, is exempt (order 16, item 2).
        // (order 17 item 2b, review round 11 P2-c) a held front is occupancy for every other branch — the exemption for a
        // holder standing on its own line is gone; two holders waiting for one point are released in id order by the
        // release scan, never together // …and only while it stands ON its yield line (a ball held inside the window — a re-seed, a recoil — is an occupant)
        if (m.route === b.route || canTouch(b, m) || canTouch(m, b)) continue; // same lane: the contact law owns it
        const Dj = stationD(m.route, after, sJ);
        if (Dj === null) continue;
        // the window's far edge is the OTHER ball's own yield station at this point (its
        // chord-aware hold line, ≥ Dj + 2r): a ball standing on its yield line is about to
        // enter — two balls reaching the point together are ordered by the event tie-break
        // (lower id yields), never allowed to meet inside the window
        const mine = m.route.merges.find((mg) => mg.rw.id === after && Math.abs(mg.s - sJ) < 1e-9);
        const far = (mine && Number.isFinite(mine.yieldD)) ? mine.yieldD : Dj + 2 * r;
        // order 18 item 1 (refuter F, F2): a cluster HOLDING for this same point is an occupant wherever its front stands —
        // a holder shoved a hair above its line by a contact (0.09 mm on TEST-y3-obtuse by arrivals) dropped out of the count
        // and the LOWER id was released while the higher still held (release 3 → 2 → 3): the id order is a law only if a
        // holder counts until it is released
        const holdsHere = !!o.hold && o.hold.after === after && Math.abs(o.hold.sJ - sJ) < 1e-9 && m === o.members[0];
        // …and the far edge is read to the EXPORT GRAIN: a front released into the window and shoved back 0.09 mm above
        // its line by a passing ball (refuter F's arrivals case) is still at its line — an occupant — so the lower id keeps
        // waiting and the higher re-asks and crosses first (the order the tie-break names), instead of 3 → 2 → 3
        if (holdsHere || (m.D <= far + EXPORT_GRAIN + 1e-9 && m.D > Dj - 2 * r + 1e-9)) occ.push({ m, o, Dj, far });
      }
    }
    return occ;
  };
  /** Where a ball waiting for a window STANDS (order 16 round 6, refuter C's D1): the highest of the 3-D
   * seats behind every RESTING occupant of the window, on the waiting ball's own route — NaN when no
   * occupant is at rest. The yield line is derived from the junction POINT (one diameter from a ball
   * passing through it); a queue backed up through the junction onto the other branch has members
   * nearer the waiting ball than that point, and a ball rolling down its branch stops against the first
   * of them, not at the line. Round 5 committed a ball inside its approach to the contact law, which
   * pairs a rear only with a front's TAIL — a tail on the other feeder is neither on the ball's lane nor
   * converging with it, and the ball was drawn through nine resting balls to the wall (0.000 mm on all
   * three merge fixtures, seeded). A moving occupant (a passing train) is still the contact law's. */
  /** The UPPER root of |P_route(D) − P| = 2r on `route` within [Dlo, Dhi]: the station at which a ball
   * descending the route first touches a ball centred at P — scanned from the top of the zone down to the
   * first sign change, then bisected; NaN when the sphere does not cut the route there. (The root nearest a
   * hint is the wrong one here: a ball seeded INSIDE the sphere would be seated at its lower root, deeper
   * into the queue — the round-6 first cut stood the feeder ball 23.6 mm from the junction ball.) */
  const upperRoot = (route, P, Dlo, Dhi) => {
    const g = (D) => { stationAt(route, D, r, ptTmp); return Math.hypot(ptTmp.x - P[0], ptTmp.y - P[1], ptTmp.z - P[2]) - 2 * r; };
    const N = Math.max(8, Math.ceil((Dhi - Dlo) / 1e-3));
    let prevD = Dhi, prevG = g(Dhi);
    if (!(prevG >= 0)) return NaN;                                           // inside the sphere at the top of the zone: no entry from above here
    for (let k = 1; k <= N; k++) {
      const D = Dhi - (Dhi - Dlo) * k / N; const gk = g(D);
      if (gk < 0) { let a = D, b = prevD; for (let it = 0; it < 60; it++) { const m = 0.5 * (a + b); if (g(m) < 0) a = m; else b = m; if (b - a < 1e-12) break; } return b; }
      prevD = D; prevG = gk;
    }
    return NaN;
  };
  /** Where a ball waiting at a junction STANDS (order 16 round 6, refuter C's D1): the highest station on its
   * own route, within the merge zone, at which it first touches any RESTING ball of another cluster — the
   * upper root of every such ball's sphere on the OTHER branches (a ball on its own lane is the contact
   * law's) — or NaN when there is none. The yield line is derived from the junction POINT (one diameter from a ball passing through it); a
   * queue backed up through the junction has members nearer the waiting ball than that point, on the trunk
   * below the junction and on the other branch above it, and a ball rolling down its branch stops against
   * the first of them. Round 5 committed a ball inside its approach to the contact law, which pairs a rear
   * only with a front's TAIL — a tail on the other feeder is neither on the ball's lane nor converging with
   * it, and the ball was drawn through nine resting balls to the wall (0.000 mm on all three merge fixtures,
   * seeded). A moving occupant (a passing train) is still the contact law's. */
  const standStation = (f, jn) => {
    let S = NaN, by = null;
    const Dlo = jn.Db - 2 * r, Dhi = jn.Db + 4 * 2 * r;
    for (const o of clusters) {
      if (o === f.cluster) continue;
      if (!(o.wall || o.hold || (o.v === 0 && o.a === 0))) continue;
      for (let k = 0; k < o.members.length; k++) {
        const m = o.members[k];
        const lane = m.route === f.route || canTouch(f, m) || canTouch(m, f);
        // a resting cluster's TAIL on the ball's own lane is the contact law's (the ball joins the queue
        // there); a member ahead of the tail on the ball's lane is reachable only when the tail sits on
        // another branch — a queue backed up through the junction — and the ball stops against it
        if (lane && k === o.members.length - 1) continue;
        const P = pointAt(m.route, m.D);
        const sD = upperRoot(f.route, P, Dlo, Dhi);
        // (order 23b, round 2 — refuter B, F2) a root BEHIND the ball — upstream of it on its own lane, the ball already clear of
        // the member by a diameter — is a station the ball has passed, not one it can stand at: a train resting on the corner
        // 83 mm behind a ball approaching the tray junction gave it a "stand" 26 mm upstream, the ball read "already below where
        // it should stand", was asked at τ = 0 with the window free, committed, re-asked (above its line) … at one instant to
        // MAX_EVENTS (170° hairpin; with an occupant in the window it would have been re-seated 26 mm BACKWARD instead).
        if (Number.isFinite(sD) && sD > f.D + 1e-9) { const Q = pointAt(f.route, f.D); if (Math.hypot(Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]) >= 2 * r - 1e-9) continue; }
        if (Number.isFinite(sD) && !(sD <= S)) { S = sD; by = lane ? m : null; }
      }
    }
    return { S, by };
  };

  /** Contact spacing is the 3-D centre distance (review r6 P2): a cluster is its FRONT ball's
   * motion plus a chain of followers, each seated where its centre is exactly one diameter
   * from the ball ahead — on a straight run 2r of path, across a bend more. */
  const ptTmp = {};
  const pointAt = (route, D) => { stationAt(route, D, r, ptTmp); return [ptTmp.x, ptTmp.y, ptTmp.z]; };
  /** The D of a ball on `route` seated touching a ball at station Dahead on `routeAhead`. */
  // Dhint: the follower's own side of a corner (order 16, item 1c). `Dmin` (the leader's station) bounds the
  // root from below on ONE lane; across routes it is a station on another axis and bounded nothing but the
  // arithmetic — a root 0.02 mm below it on the follower's own branch was refused (round 6, refuter C's D1:
  // the stand behind a queue's junction ball read NaN and the ball was committed through the queue).
  const seatD = (route, routeAhead, Dahead, Dhint = NaN) => seatBehind(route, pointAt(routeAhead, Dahead), (route === routeAhead || !Number.isFinite(Dhint)) ? Dahead : -Infinity, 2 * r, Dhint);
  /** The walker's first step from the chain's current state, in the direction it moves (order 17, item 5):
   * the least of its members' geometric limits — half a radius for a member on a twist or an arc, the
   * distance to the segment end for one on a line, none for a straight link. Read on copies; the walk is
   * not advanced. Infinity when nothing limits it (a straight train on one line to its end). */
  const chainStep = (c) => {
    if (c.members.length < 2) return Infinity;
    const routes = c.members.map((m) => m.route); const D = c.members.map((m) => m.D); const fold = new Array(D.length).fill(false); const par = parentOf(c);
    const dir = c.v > 0 || (c.v === 0 && c.a > 0) ? 1 : -1;
    const h = Math.abs(walkStep(routes, D, fold, dir * 1e3, r, par));
    if (h >= 1e3 - 1e-9) return Infinity;
    // ORDER 19 ITEM 2 — the cadence from the Jacobian's derivatives (§22.6, derived): a follower's path acceleration is
    // a_f = J·a + J′·v²; a piece freezes it, and over a step h of front advance the frozen value drifts by
    // ≈ h·(|J′|·a + |J″|·v²). The step that keeps the drift below the export grain in POSITION over the step is
    // h ≤ (2·ε_D·v² / (|J′|·a + |J″|·v²))^{1/3} — read from J′ and J″ along the walk, not chosen. r/2 (order 17) stays
    // the cap; on a straight run (J′ = J″ = 0) the bound is infinite and the segment end rules as before. Measured on the
    // shipped obtuse train: the frozen-a drift 8.56 mm/s → see r41.
    const v = Math.abs(c.v), a = Math.abs(c.a);
    if (!(v > 1e-9 || a > 1e-9)) return h;
    const delta = Math.min(1e-3, 0.5 * h);
    if (!(delta > 1e-7)) return h;
    const Jsum = (ds) => { const w = walkChain(routes, D, dir * ds, r, par); if (w.fold.some((f) => f)) return NaN; let G = 1, sum = 0; for (let i = 1; i < routes.length; i++) { const dDi = (D[i] - w.D[i]) * (dir); const dD0 = ds; const Ji = dD0 !== 0 ? dDi / dD0 : 1; sum += Math.abs(Ji); void G; } return sum; };
    // J′ and J″ by central differences of the members' mean Jacobian magnitude over ±δ of front advance
    const J0 = Jsum(1e-9), Jp = Jsum(delta), Jm = Jsum(-delta);
    if (![J0, Jp, Jm].every(Number.isFinite)) return h;
    const J1 = Math.abs(Jp - Jm) / (2 * delta), J2 = Math.abs(Jp - 2 * J0 + Jm) / (delta * delta);
    const denom = J1 * a + J2 * v * v;
    if (!(denom > 1e-12)) return h;
    const hJ = Math.cbrt(2 * EXPORT_GRAIN * Math.max(v * v, 1e-6) / denom);
    return Math.max(Math.min(h, hJ), 1e-4 * r);
  };
  /** Re-derive every follower's D from its cluster's front (members sorted front → back). */
  const reseat = (c, from = 1, ds = 0, only = null) => {
    const par = parentOf(c);                                  // (order 23) each member seated behind its PARENT
    if (ds !== 0 && from <= 1 && c.members.length > 1) {
      // after the front's advance: every follower's root followed continuously from where it stood
      const routes = c.members.map((m) => m.route); const D0s = c.members.map((m) => m.D); D0s[0] += ds; // the members' stations BEFORE the advance (the front has already moved by ds)
      const w = walkChain(routes, D0s, ds, r, par);
      for (let i = 1; i < c.members.length; i++) { const D0 = c.members[i].D; c.members[i].D = upThroughJunction(c, c.members[i], D0, w.D[i], c.members[par[i]]); }
      return;
    }
    for (let i = Math.max(1, from); i < c.members.length; i++) {
      if (only && !only.has(i)) continue;                     // a held front keeps its stations to the bit: only the arriving members are seated
      const ahead = c.members[par[i]]; const m = c.members[i];
      const Di = seatD(m.route, ahead.route, ahead.D, m.D);        // the root on the follower's own leg
      const D0 = m.D;
      m.D = upThroughJunction(c, m, D0, Number.isFinite(Di) ? Di : seatD(m.route, ahead.route, ahead.D), ahead);
    }
  };
  /** Order 18 item 2 — a follower whose seat would carry it UP through its route's junction (D rising past the span's upstream
   * end onto the route's feeder) continues on the rail it is on: the runway under it. If that runway continues above the
   * point (a mid-runway landing) the member's route becomes the route that owns the runway from its head and its seat is
   * the root on that route; if the point is the runway's first vertex (a fork nose) the member stops at the point and an
   * upward-moving cluster is stopped with it. Returns the station to write. */
  /** The station on `route` nearest the 3-D point P, searched around Dguess (±30 mm, ternary then a Newton polish): a
   * member re-routed at a junction keeps its PHYSICAL position — the two routes' stations for the landing point differ by
   * the corner cut (3.0 mm on the obtuse family: route 4's 451.26 vs the trunk's own 151.3 mm station), and mapping by
   * runway station jumped the ball 3 mm and its follower 1.8 mm at the instant (refuter B's graze family, seal 18). */
  const projectOnto = (route, P, Dguess) => {
    const f = (D) => { stationAt(route, D, r, ptTmp); return (ptTmp.x - P[0]) ** 2 + (ptTmp.y - P[1]) ** 2 + (ptTmp.z - P[2]) ** 2; };
    let lo = Math.max(0, Dguess - 0.03), hi = Math.min(route.total, Dguess + 0.03);
    for (let it = 0; it < 60; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (f(m1) < f(m2)) hi = m2; else lo = m1; if (hi - lo < 1e-10) break; }
    return 0.5 * (lo + hi);
  };
  const upThroughJunction = (c, m, D0, Dn, ahead) => {
    if (!BACK_THROUGH_JUNCTION || !Number.isFinite(Dn) || !(Dn > D0 + 1e-12)) return Dn;
    const S = m.route.spans.find((sp) => D0 >= sp.dEnd - 1e-9 && D0 <= sp.dStart + 1e-9);
    if (!S || S === m.route.spans[0] || !(Dn > S.dStart + 1e-9)) return Dn;   // not through a junction
    if (S.sStart > 1e-9) {
      const owner = [...track.routes.values()].find((rt) => rt !== m.route && rt.spans.some((sp) => sp.rw === S.rw && sp.sStart < 1e-9));
      if (owner) {
        const oldRoute = m.route;
        m.route = owner;
        const Dq = ahead ? seatD(owner, ahead.route, ahead.D) : NaN;
        if (Number.isFinite(Dq)) return Dq;
        const q = stationAt(oldRoute, Dn, r, {});               // no leader to seat behind: the same PHYSICAL point on the owner route
        return projectOnto(owner, [q.x, q.y, q.z], stationD(owner, S.rw.id, S.sStart + (Dn - S.dStart)));
      }
    }
    if (c.v < 0) c.v = 0;          // the fork nose stops an upward roller (inelastic), it rolls down again under its own drive
    return S.dStart;
  };
  /** Members' D after the cluster's front has advanced by ds (no mutation). */
  /** The cluster's walker for THIS instant (its members' stations now), memoised per settle. */
  const walkerOf = (c) => {
    const sig = c.members.map((m) => `${m.id}:${m.D}`).join('|');
    if (!c._walker || c._walkerSig !== sig) { c._walker = makeWalker(c.members.map((m) => m.route), c.members.map((m) => m.D), r, parentOf(c)); c._walkerSig = sig; }
    return c._walker;
  };
  const memberDAfter = (c, ds, rank) => {
    if (rank === 0) return Math.max(0, c.members[0].D - ds);
    return walkerOf(c).at(ds).D[rank];
  };
  /** The time at which member `m` (rank k) of a moving cluster reaches station Db: Newton on
   * τ with the exact follower chain (its D is a smooth function of the front's). */
  const memberCrossing = (c, m, Db, Gk = 1) => {
    const k = c.members.indexOf(m);
    const gap0 = m.D - Db;
    // the rigid estimate uses the MEMBER's own rate G_k·v (order 18 item 2): behind a J < 0 link a follower moves the
    // other way from its front (the obtuse chain: a leader up the trunk, the follower down its feeder to the corner) and
    // the front's rate said the gap could never close — the crossing was never booked and the walk hopped 8.3 mm at the corner
    const rate = Number.isFinite(Gk) && Gk !== 0 ? Gk : 1;
    const est = gap0 >= 0 ? firstCrossing(gap0, rate * c.v, rate * c.a) : firstCrossing(-gap0, -rate * c.v, -rate * c.a); // below, or ABOVE (a ball rolling back up its runway — order 16)
    if (k === 0) return est;
    if (!(est < Infinity)) return est;
    const gAt = (tau) => memberDAfter(c, c.v * tau + 0.5 * c.a * tau * tau, k) - Db;
    // Newton from the rigid-train estimate — then VERIFIED. Round 5 and before returned the iterate
    // whatever it had converged to (refuter 1's H8, §20.8 item 8): on the shipped obtuse fixture a
    // follower 263 mm above the junction was booked crossing it 1.4 ms later and re-seated 266 mm
    // downstream in one step (r23b's seeded corner, the gap metric blind to it). A crossing is real
    // only where the member's station passes Db from the side it started on; otherwise the first
    // sign change of the walked station over the estimate's own horizon is bracketed and bisected,
    // and none means no crossing (order 16 round 6).
    let tau = est;
    for (let it = 0; it < 6; it++) {
      const g = gAt(tau);
      if (!Number.isFinite(g)) break;
      if (Math.abs(g) < 1e-12) break;
      const dt = 1e-6;
      const slope = (gAt(tau + dt) - g) / dt;
      if (!(Math.abs(slope) > 1e-12)) break;
      const next = tau - g / slope;
      if (!(next >= 0) || !Number.isFinite(next)) break;
      if (Math.abs(next - tau) < 1e-12) { tau = next; break; }
      tau = next;
    }
    const side = gap0 >= 0 ? 1 : -1;
    const gT = gAt(tau), gB = gAt(Math.max(0, tau - 1e-6));
    if (Number.isFinite(gT) && Math.abs(gT) < 1e-9 && (gB * side >= -1e-9)) return Math.max(0, tau);
    // bracket: the first sign change from gap0's side within the estimate's horizon (4× the rigid time + 0.3 s)
    const H = Math.min(5, 4 * est + 0.3); const N = 80;
    let prev = 0, gp = gAt(0);
    for (let n = 1; n <= N; n++) {
      const x = H * n / N; const gx = gAt(x);
      if (!Number.isFinite(gx)) return Infinity;                          // the walk folded: the member does not reach Db as a follower
      if (gx * side <= 0 && gp * side > 0) {
        let a = prev, b = x;
        for (let it = 0; it < 60; it++) { const mid = 0.5 * (a + b); const gm = gAt(mid); if (!Number.isFinite(gm)) return Infinity; if (gm * side > 0) a = mid; else b = mid; if (b - a < 1e-12) break; }
        return b;
      }
      prev = x; gp = gx;
    }
    return Infinity;
  };

  // ---- the chain's law of motion (seal 15, verification round 14 S2) ----------------------
  // A contacting follower's station is the seat behind its leader's (`seatBehind`: the point of
  // its route one diameter, in 3-D, behind the leader's centre). That constraint is the law of
  // MOTION too. Differentiate |P_B(D_B) − P_A(D_A)| = 2r once and the follower's path speed is
  // the leader's projected through the contact geometry,
  //     u_B = J·u_A,   J = (n·T_A) / (n·T_B),   n = P_A − P_B,
  // and again for J̇ from the same tangents, their own curvature (an arc) and the moving line of
  // centres. Along a chain G_i = Π J (u_i = G_i·u_0) and Ġ_i follow by the product rule. The
  // chain has ONE degree of freedom — the front's path coordinate — and Lagrange's equation in
  // it (T = ½ Σ (G_i u)², generalised force Σ G_i a_i from each member's own drive a_i) is
  //     u̇ = [Σ G_i a_i − u Σ G_i Ġ_i] / Σ G_i²,
  // the group MEAN of the drives when every J is 1 (a straight train — seals 8…14's law) and,
  // through a bend or across a junction, each member's push and inertia projected through the
  // contact geometry. The constraint force at link k is the difference between the acceleration
  // the chain DEMANDS of member k (G_k u̇ + Ġ_k u) and what the released rear sub-chain would do
  // on its own (its own front block, the same Lagrange form re-based on k): negative = tensile,
  // the chain parts there, the rear keeps the chain speed it had (G_k u — never zero while the
  // leader moves). An inelastic merge conserves the generalised momentum Σ G_i u_i.
  //
  // Every quantity is the geometry's own first or second derivative at THIS instant, on the side
  // of any vertex the balls are on now; nothing is differenced across a kink. Seal 14 read the
  // demanded acceleration by a second difference over 94 µm of the leader's travel: the stencil
  // saw every vertex ahead of it, the `separate` scan bisected to an instant 33 nm before the
  // bend-90 vertex (8 µm before the tray-lip cut on the shipped wire slide), the follower was
  // launched at a 10 µs window average that straddled the kink, read as penetrating its leader,
  // and stopped dead by a flank block: 81 of 81 followers to v = 0 over three fixtures, one
  // stranded at the tray mouth (verification round 14). And the group MEAN, exact for J ≡ 1,
  // is not the law where J is not 1: a ledger ball beside the trunk on TEST-obtuse-merge's
  // doubled-back feeder (J 1.0097, J̇ 9.5 /s) read a chain acceleration of 0.199 m/s² in contact
  // and 0.112 out of it, and the first cut of this seal chattered 748 times between the two;
  // the Lagrange form gives 0.1117 in contact — the flank ball's drive goes into the geometry.
  //
  // At a vertex J itself jumps — the leader's heading turns away from the line of centres —
  // and the riding follower's speed jumps with it: an inelastic side impact, its momentum into
  // the rail through the leader. At the shipped TEST-bend-90's sharp 90° vertex J falls from
  // 0.99993 to 0.01273, so the follower keeps 1.27 % of its speed and re-accelerates under its
  // own drive from that instant; at the wire slide's trunk→tray lip J goes 1.0083 → 1.0013 and
  // the follower rolls through. J only ever DROPS at a vertex (the ball ahead turns away from
  // the centre line, the ball behind toward it), so a kink is never a pull.
  const tanA = {}; const tanB = {};
  /** One link: A ahead at DA moving at path speed uA, B seated behind it at DB → { J, Jdot }. */
  const linkJ = (A, DA, B, DB, uA, sideA = 0, sideB = 0) => {
    const pa = pointAt(A.route, DA); const pb = pointAt(B.route, DB);
    const nx = pa[0] - pb[0], ny = pa[1] - pb[1], nz = pa[2] - pb[2];
    // each tangent on the side its ball is MOVING toward (order 16: a station on a boundary reads
    // the piece it is about to travel, which for a ball moving back up is the piece above); the
    // follower's direction follows from J's sign, so it is read once forward and re-read if J·u_A < 0.
    // `sideA` / `sideB` (±1) override the side — the impact reads the crossing member on its INCOMING
    // side, which the seat solve (the member sits exactly on the break) cannot express by station.
    const dirA = sideA || (uA < 0 ? -1 : 1);
    tangentAt(A.route, DA, tanA, dirA); tangentAt(B.route, DB, tanB, sideB || dirA);
    let nA = nx * tanA.tx + ny * tanA.ty + nz * tanA.tz;
    let nB = nx * tanB.tx + ny * tanB.ty + nz * tanB.tz;
    if (!sideB && Math.abs(nB) > 1e-9 * 2 * r && (nA / nB) * uA < 0) { tangentAt(B.route, DB, tanB, -dirA); nB = nx * tanB.tx + ny * tanB.ty + nz * tanB.tz; }
    if (!(Math.abs(nB) > 1e-9 * 2 * r)) return { J: 0, Jdot: 0, fold: true }; // the follower's path is square to the line of centres: the seat root is folding away — the contact cannot persist (order 16)
    const J = nA / nB;
    const uB = J * uA;
    const TT = tanA.tx * tanB.tx + tanA.ty * tanB.ty + tanA.tz * tanB.tz;
    const nKA = nx * tanA.kx + ny * tanA.ky + nz * tanA.kz;
    const nKB = nx * tanB.kx + ny * tanB.ky + nz * tanB.kz;
    const dnA = uA - uB * TT + uA * nKA;   // d(n·T_A)/dt: the centre line moves with both balls, T_A turns with its arc
    const dnB = uA * TT - uB + uB * nKB;   // d(n·T_B)/dt
    return { J, Jdot: (dnA * nB - nA * dnB) / (nB * nB) };
  };
  /** The chain's dynamics for `members` (front first) with the front at station D0 moving at
   * path speed u: per member the seat-chain station D[i], the Jacobian G[i] (u_i = G_i·u), its
   * time derivative Gd[i] and the own drive a[i]. The whole chain's acceleration under the
   * one-DOF equation of motion above is `runAccel(dyn, 0, n - 1)` — the k = 0 case of the
   * re-based run law below, which is the ONLY place that equation is evaluated. */
  /** A member's own path acceleration at its station for the motion it has: rolling resistance
   * opposes the MOTION (order 16: a ball shoved back up its runway is slowed by its resistance,
   * not driven by it — refuter 1, seal 15). Forward is the convention at rest too — a block that
   * starts, starts forward, and every member then meets its full resistance at once (the rest
   * test is applied to the block as a whole in `settleClusters`, never per member: a first cut
   * of this seal gave a still tray ball no resistance and the shipped wire slide's 7-ball ledger
   * rolled off at 0.3039 m/s² against its members' 0.2173 — seal-14 refuter 2's D4 by another door). */
  const ownDrive = (res, ui) => (ui < -1e-12 ? res.drive + res.resist : res.drive - res.resist);
  const chainDyn = (members, D0, u, walker = null, sides = null, parent = null) => {
    const n = members.length;
    const par = parent ?? chainParent(n);                   // the tree (order 23): member i is seated behind par[i]
    const shift = members[0].D - D0;                        // the front's advance this evaluation is made at
    // the followers' stations at that advance, each root followed continuously from where the member
    // stands now (order 16: a rigid-train hint sent a J < 0 follower onto the wrong root)
    const walked = shift !== 0 && n > 1 ? (walker ? walker.at(shift) : walkChain(members.map((m) => m.route), members.map((m) => m.D), shift, r, par)) : null;
    // order 18 item 2 (the graze family's livelock): a link whose seat root vanishes for ANY advance in the direction of
    // motion is folded NOW — read a hair ahead (the root at this very station still exists, the next one does not); the
    // settle then parts the chain here instead of booking a fold at τ = 0 forever
    const dirU = u > 0 ? 1 : (u < 0 ? -1 : 0);
    const aheadW = shift === 0 && n > 1 && dirU !== 0 ? (walker ? walker.at(dirU * 1e-7) : walkChain(members.map((m) => m.route), members.map((m) => m.D), dirU * 1e-7, r, par)) : null;
    const D = [D0], G = [1], Gd = [0], a = [], mu = [], fold = [false];
    const own = (m, Dm, ui, i) => { const res = accelAt(m.route, sideD(m.route, Dm, (sides && sides[i]) || (ui < 0 ? -1 : 1)), r); mu.push(1 / res.k); return ownDrive(res, ui); };
    a.push(own(members[0], D0, u, 0));
    for (let i = 1; i < n; i++) {
      const p = par[i];                                     // the member i is seated behind (i − 1 on a chain)
      const Di = walked ? (walked.fold[i] ? NaN : walked.D[i]) : seatD(members[i].route, members[p].route, D[p], members[i].D);
      D[i] = Number.isFinite(Di) ? Di : (walked ? walked.D[i] : members[i].D);
      const lk = linkJ(members[p], D[p], members[i], D[i], G[p] * u, sides ? sides[p] || 0 : 0, sides ? sides[i] || 0 : 0);
      fold[i] = !Number.isFinite(Di) || lk.fold === true || !!(aheadW && (aheadW.fold[i] || !Number.isFinite(aheadW.D[i])));
      G[i] = G[p] * lk.J; Gd[i] = Gd[p] * lk.J + G[p] * lk.Jdot;
      a[i] = own(members[i], D[i], G[i] * u, i);
    }
    return { D, G, Gd, a, mu, u, fold, parent: par };
  };
  /** The run [k..j] of chain `dyn` as a cluster of its own (Jacobians re-based on k, its front
   * moving at the chain speed G_k·u it has now): its acceleration under the same law. A run
   * behind a geometrically stalled link (G_k = 0: the seat does not move as the leader does)
   * has no chain motion to re-base on; its push is its members' own drives. */
  /** …over an explicit member set `idxs` (ascending; idxs[0] is the run's front): a connected rooted sub-tree of the cluster
   * (order 23). `runAccel(dyn, k, j)` is the chain's contiguous range [k..j] — the same sum in the same order. */
  const runAccelIdx = (dyn, idxs) => {
    const k = idxs[0];
    const Gk = dyn.G[k], Gdk = dyn.Gd[k];
    if (!(Math.abs(Gk) > 1e-9)) { let S = 0, W = 0; for (const i of idxs) { S += dyn.mu[i] * dyn.a[i]; W += dyn.mu[i]; } return S / W; }
    const uk = Gk * dyn.u;
    let S2 = 0, Sa = 0, Sg = 0;
    for (const i of idxs) {
      const g = dyn.G[i] / Gk; const gd = (dyn.Gd[i] * Gk - dyn.G[i] * Gdk) / (Gk * Gk); const w = dyn.mu[i];
      S2 += w * g * g; Sa += w * g * dyn.a[i]; Sg += w * g * gd;
    }
    return (Sa - uk * Sg) / S2;
  };
  const runAccel = (dyn, k, j) => runAccelIdx(dyn, rangeIdx(k, j + 1));
  /** The strongest push the rear sub-chain k..to can transmit: the acceleration of its own
   * front block once released — the maximum over its prefixes (the PAVA front block; the j = k
   * term is member k's own free roll, so a slack member between two pushers is read through).
   * On a tree the rear "sub-chain" is member k's SUB-TREE (`idxs`, in pre-order) and the prefixes are its pre-order prefixes —
   * every one a connected rooted sub-tree (order 23; refuter D's D1: the maximum over rooted connected sub-sub-trees, of which
   * the pre-order prefixes are the deterministic family the list already used). */
  const pushFromIdx = (dyn, idxs) => { let best = -Infinity; for (let j = 1; j <= idxs.length; j++) best = Math.max(best, runAccelIdx(dyn, idxs.slice(0, j))); return best; };
  const pushFrom = (dyn, k, to) => pushFromIdx(dyn, rangeIdx(k, to + 1));
  /** The indices of member k's sub-tree within `dyn`'s member order (pre-order: contiguous). */
  const subtreeIdx = (dyn, k) => rangeIdx(k, subtreeEnd(dyn.parent, k));
  /** The acceleration the chain demands of member k when the block whose front is member f
   * accelerates at aF (f = 0: the cluster front). */
  const demandAt = (dyn, f, aF, k) => {
    if (f === 0) return dyn.G[k] * aF + dyn.Gd[k] * dyn.u;
    const Gf = dyn.G[f], Gdf = dyn.Gd[f];
    if (!(Math.abs(Gf) > 1e-9)) return 0;
    const g = dyn.G[k] / Gf; const gd = (dyn.Gd[k] * Gf - dyn.G[k] * Gdf) / (Gf * Gf);
    return g * aF + gd * (Gf * dyn.u);
  };
  /** The chain may PUSH but never PULL (review round 8): a follower stays linked only while
   * the acceleration the chain demands of it along its own path can be SUPPLIED by a push —
   * from its own edge, or from the balls behind it. `tensileRank(c, x)` = the lowest rank
   * whose demanded acceleration at τ = x, under the cluster's own motion (c.v, c.a), exceeds
   * the strongest push its rear sub-chain can transmit (a leader turning a corner would have
   * to drag it), or -1. Round 8 compared against the member's own free roll ALONE, which read
   * a PUSHED ball as a PULLED one (review round 14): a sloped train behind two free resting
   * balls on the flat demanded the group mean of the flat ball at rank 1, above its own zero
   * free roll, so the chain "parted" there, the freed pair could not draw apart, and every
   * pusher was blocked at v = 0 behind a leader that never moves — a permanent deadlock. */
  /** The smallest (push − demand) over the chain's links at τ = x — negative where some link is
   * tensile (or folded: −Infinity); the quantity `separateTime` refines its scan on (order 16). */
  const tensileMargin = (c, x) => {
    if (c.members.length < 2 || !(c.v !== 0 || c.a !== 0)) return Infinity;
    const n = c.members.length;
    const ds = c.v * x + 0.5 * c.a * x * x;
    const u = c.v + c.a * x;
    const dyn = chainDyn(c.members, Math.max(0, c.members[0].D - ds), u, walkerOf(c), null, parentOf(c));
    let m = Infinity;
    for (let k = 1; k < n; k++) {
      if (dyn.fold[k]) return -Infinity;
      m = Math.min(m, pushFromIdx(dyn, subtreeIdx(dyn, k)) + 1e-3 - demandAt(dyn, 0, c.a, k));
    }
    return m;
  };
  const tensileRank = (c, x) => {
    if (c.members.length < 2 || !(c.v !== 0 || c.a !== 0)) return -1;
    const n = c.members.length;
    const ds = c.v * x + 0.5 * c.a * x * x;
    const u = c.v + c.a * x;
    const dyn = chainDyn(c.members, Math.max(0, c.members[0].D - ds), u, walkerOf(c), null, parentOf(c));
    for (let k = 1; k < n; k++) {
      // Order 16 (item 1a): the test is the SIGN OF THE CONSTRAINT FORCE, never the sign of a
      // velocity. The contact force on a follower acts along −n̂ (away from its leader), whose
      // component on the follower's path is −(n̂·T_B) < 0: a push can only lower the follower's
      // path acceleration below what its own drive and the balls behind it supply. So whatever
      // way the follower moves, a demanded acceleration ABOVE that push is a pull, and the link
      // parts. Seal 14's guard exempted every backward-moving member as "compressive by
      // definition" and the chain then dragged a follower shoved back up the shipped obtuse
      // feeder forward at up to 3.94 m/s² against its 0.040 of drive, to rest, and parted it at
      // v = 0 while the leader rolled (§19.9 item 1). The guard was covering for a solver that
      // could not let a freed ball keep going backward; it can now.
      if (dyn.fold[k]) return k;                             // the seat has no root on this follower's leg any more: the contact ends here
      const ak = demandAt(dyn, 0, c.a, k);
      const rearIdx = subtreeIdx(dyn, k);                     // the sub-tree behind link k (k..n−1 on a chain)
      if (ak > pushFromIdx(dyn, rearIdx) + 1e-3) {
        // The bounce merge law (order 17, item 5): a link read tensile parts only if the 3-D gap between the
        // two parting balls OPENS over the settle's own horizons (0.2 ms … 40 ms, the ones seal 15 gave a PAVA
        // split); a pair that would re-close inside them is a rattling contact the rigid inelastic model
        // cannot resolve — parted at every settle and re-caught at the next scan, it booked 24 separate /
        // contact pairs at 3.45 ms on the shipped obtuse train's twist entry once the walker-step slicing gave
        // the settle more instants (20 → 482 events). It rides as one instead: the rear pushes, the link's
        // force is what the constraint asks. Each side is projected along its own law of motion from the
        // stations at this instant — the front block from the chain, the freed rear from its own push.
        const frontIdx = rangeIdx(0, n).filter((i) => !(i >= k && i < rearIdx[rearIdx.length - 1] + 1)); // the cluster minus link k's sub-tree (0..k−1 on a chain)
        const aF = runAccelIdx(dyn, frontIdx), aR = pushFromIdx(dyn, rearIdx);
        const vF = dyn.G[0] * u, vR = dyn.G[k] * u;
        const frontGroup = subCluster(c, frontIdx, { v: vF, a: aF }); frontGroup.members = frontGroup.members.map((m, i) => ({ route: m.route, D: dyn.D[frontIdx[i]], id: m.id }));
        const pk = dyn.parent[k]; const rankP = frontIdx.indexOf(pk);
        const fbm = frontGroup.members[rankP], rfm = { route: c.members[k].route, D: dyn.D[k] };
        let closes = false, opens = false;
        for (const dtp of [2e-4, 2e-3, 1e-2, 4e-2]) {
          const D1 = memberDAfter(frontGroup, vF * dtp + 0.5 * aF * dtp * dtp, rankP);
          const D2 = Math.max(0, rfm.D - (vR * dtp + 0.5 * aR * dtp * dtp));
          if (!Number.isFinite(D1)) { opens = true; break; }                             // the front's walk folds: the pair does part
          const g = gap3(rfm, D2, fbm, D1);
          if (g < -1e-9) { closes = true; break; }
          if (g > 1e-9) opens = true;
        }
        if (!opens) closes = true;
        if (globalThis.__tensDbg) globalThis.__tensDbg.push({ x: +x.toExponential(2), k, ak: +ak.toFixed(4), push: +pushFromIdx(dyn, rearIdx).toFixed(4), closes, ids: c.members.map((m) => m.id), D: c.members.map((m, i) => +(dyn.D[i] * 1e3).toFixed(2)), vF: +vF.toFixed(4), vR: +vR.toFixed(4), aF: +aF.toFixed(4), aR: +aR.toFixed(4), gaps: [2e-4, 2e-3, 1e-2, 4e-2].map((dtp) => { const D1 = memberDAfter(frontGroup, vF * dtp + 0.5 * aF * dtp * dtp, k - 1); const D2 = Math.max(0, rfm.D - (vR * dtp + 0.5 * aR * dtp * dtp)); return +(gap3(rfm, D2, fbm, D1) * 1e6).toFixed(2); }) });
        if (!closes) return k;
      }
    }
    return -1;
  };
  /** First τ ∈ (0, H] at which some follower of `c` turns tensile (the 'separate' event; the
   * re-settle there frees it or blocks it). */
  const separateTime = (c, H) => {
    // One re-settle per INSTANT — never one per interval. Returning Infinity for the whole
    // scan after a separation at this instant left the following interval unwatched: the
    // solver advanced to the next junction and the chain whipped a follower through the
    // corner in between, unchecked (refuter 2, round 14: 1.618 m/s against its leader's
    // 0.067 on a 90° bend with a one-diameter exit leg, no event in the gap). So the
    // same-instant guard now suppresses only the τ = 0 answer; the interval is still scanned,
    // from one microsecond on, and time always moves forward.
    const sameInstant = c.lastSeparateT !== undefined && c.lastSeparateT === t;
    if (!sameInstant && tensileRank(c, 0) >= 0) return 0;
    const N = 60; const x0 = sameInstant ? 1e-6 : 0; let lo = x0; let hi = -1;
    if (sameInstant && tensileRank(c, x0) >= 0) return x0;
    // Sampled at N points, then REFINED where a tensile spell could hide between two compressive
    // samples (order 16): a link's margin (push − demand) that is small at either end of an
    // interval and moving by more than that across it can cross zero and come back inside the
    // interval — the shipped obtuse train's 3-ball chain was pulled at 0.09 m/s² for 9 ms between
    // two 5 ms samples. Such an interval is subdivided until the margin's own change across the
    // sub-interval can no longer carry it through zero, or the crossing is found.
    let prevX = x0, prevM = tensileMargin(c, x0);
    for (let k = 1; k <= N && hi < 0; k++) {
      const x = x0 + (H - x0) * k / N; const mk = tensileMargin(c, x);
      if (mk <= 0) { hi = x; lo = prevX; break; }
      if (Number.isFinite(prevM) && Math.min(prevM, mk) < Math.abs(mk - prevM)) {
        const stack = [[prevX, x, prevM, mk]]; let found = -1;
        while (stack.length && found < 0) {
          const [a, b, ma, mb] = stack.pop();
          if (Math.min(ma, mb) >= Math.abs(mb - ma) || b - a < 1e-6) continue;
          const M = 8; let pa = a, pm = ma;
          for (let i = 1; i <= M; i++) {
            const xb = a + (b - a) * i / M; const mbi = i === M ? mb : tensileMargin(c, xb);
            if (mbi <= 0) { found = xb; lo = pa; hi = xb; break; }
            stack.push([pa, xb, pm, mbi]); pa = xb; pm = mbi;
          }
        }
        if (found >= 0) break;
      }
      prevX = x; prevM = mk; lo = x;
    }
    if (hi < 0) return Infinity;
    for (let it = 0; it < 40; it++) { const mid = 0.5 * (lo + hi); if (tensileRank(c, mid) >= 0) hi = mid; else lo = mid; if (hi - lo < 1e-12) break; }
    return hi;
  };
  /** The 3-D centre gap (minus one diameter) between a rear ball at DR on its route and a
   * front ball at DF on its route. */
  const gap3 = (rear, DR, front, DF) => { const a = pointAt(rear.route, DR); const b = pointAt(front.route, DF); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) - 2 * r; };
  /** First τ ∈ [0, H] at which the 3-D gap between rear cluster `rc`'s front ball and front
   * cluster `fc`'s back ball closes, along both clusters' true motions (followers included):
   * the path-speed law is exact on straight runs; through a blend or a swing the front's
   * 3-D progress differs from its path progress, so the gap is scanned and bisected in 3-D. */
  const contactTime3 = (rc, fc, H, justParted = false, kTarget = fc.members.length - 1) => {
    let degraded = false;                                  // one record per pair per instant, never one per bracket
    const rf = rc.members[0];
    const kF = kTarget;                                        // the front member scanned: its back ball on one lane; any member inside a merge zone across branches (order 16 round 5)
    const fb = fc.members[kF];
    const g = (x) => { const dsR = rc.v * x + 0.5 * rc.a * x * x; const dsF = fc.v * x + 0.5 * fc.a * x * x; return gap3(rf, Math.max(0, rf.D - dsR), fb, memberDAfter(fc, dsF, kF)); };
    const g0 = g(0);
    if (g0 < -1e-9) return 0;                                  // already overlapping (a carried micron): seat it now
    // A pair that parted at THIS instant is touching by construction and its τ = 0 answer was
    // just given (the parting); only the interval after it is asked here (seal 15) — the
    // same-instant skip that stood in for this left the pair unwatched until the next event
    // of any ball: a follower freed at the tray-lip cut carried the cut's J·u onto the flat,
    // 21.5 mm/s over its leader, and closed 4.67 mm before a wall 218 ms away ever looked
    // (TEST-obtuse-merge); two free balls grazed 8.5 µm inside one diameter around the
    // bend-90 vertex with no event between their parting and the pass (r11).
    if (!justParted && g0 <= 1e-12 && g(1e-5) < g0 - 1e-13) return 0; // touching now and measurably closing
    // reach filter: a 3-D gap cannot close faster than the two balls' path speeds add up to —
    // signed speeds (a ball rolling back up its runway closes on the ball behind it), the
    // front's back ball through its chain gain |G|
    const gF = Math.max(1, Math.abs(chainDyn(fc.members, fc.members[0].D, fc.v, null, null, parentOf(fc)).G[kF]));
    const vmax = (Math.abs(rc.v) + Math.abs(rc.a) * H) + gF * (Math.abs(fc.v) + Math.abs(fc.a) * H);
    if (g0 > vmax * H + 1e-9) return Infinity;
    // scan from just past the touching neighbourhood (a pair that has just parted may close
    // again inside a swing) for the first sample at or below zero, then bisect
    const N = 60; const x0 = 2e-4; const xs = justParted ? 1e-6 : 0; let lo = x0; let hi = -1;
    if (g(x0) <= 0 && (g0 > 1e-12 || justParted)) { lo = xs; hi = x0; }
    let prevX = x0, prevG = g(x0);
    for (let k = 1; k <= N && hi < 0; k++) {
      const x = x0 + (H - x0) * k / N; const gk = g(x);
      if (gk <= 0) { hi = x; lo = prevX; break; }
      // The graze (order 16, item 2b; §18.3 row 7): a dip under zero SHORTER than the sample
      // spacing (5 ms at the nominal horizon) between two positive samples went unseen — the
      // shipped alias slide drew two balls 51.9 µm inside one diameter for 4.37 ms. Between two
      // samples the gap can fall by at most the pair's closing reach over the interval; where
      // both samples are positive but that reach could carry the gap through zero, the interval
      // is subdivided until the reach excludes it or the crossing is found. The reach is the
      // sum of the two balls' path speeds, read at the interval's ends (rear: its own quadratic;
      // front's back ball: its chain motion differenced) — no constant is authored here.
      // The refinement is a BRACKET THAT SHRINKS WITH THE GAP, not a subdivision to a fixed floor
      // (order 23b round 10, class A). What stood here split such an interval 8 ways, recursively,
      // down to an absolute 1 µs width — 8^d nodes — and its exclusion read the SUM of the two
      // balls' absolute path speeds, which for a CO-MOVING pair overstates the gap's own rate by
      // orders of magnitude: a TEST-shallow-merge ledger of two carried trunk rests and four packed
      // newcomers left two clusters touching and SEPARATING by 67 nm over a 300 ms horizon, the sum
      // reach read 0.245 m/s, and two calls of this function spent 96 284 274 walker steps and 115 s
      // — synchronously, on the render path (index.js ensureSolution), i.e. a frozen page.
      // What bounds the gap is its own CLOSING rate: the signed derivative of g, negative while the
      // pair separates, read at the ends of the remaining interval and carrying its change across it
      // exactly as the tensile refinement above reads its margin (`Math.abs(mb - ma)`), and capped by
      // the rotation-proof sum `S` so it is never LOOSER than the reach it replaces. From x the gap
      // cannot reach zero before x + g(x)/closing, so every evaluation either finds the crossing or
      // advances the bracket by the gap itself: geometric where the pair really closes, a single test
      // where it does not. The budget above ends it in hand rather than letting it spin.
      if (Math.min(prevG, gk) < vmax * (x - prevX)) {
        const spend0 = walkSteps;                     // this refinement's draw on the budget
        const speedAt = (xx) => { const d = 1e-6; return Math.abs(rc.v + rc.a * xx) + Math.abs((memberDAfter(fc, fc.v * (xx + d) + 0.5 * fc.a * (xx + d) * (xx + d), kF) - memberDAfter(fc, fc.v * xx + 0.5 * fc.a * xx * xx, kF)) / d); };
        const closeAt = (xx, gxx) => { const d = 1e-6; return (gxx - g(xx + d)) / d; };   // > 0 while the gap shrinks
        const sEnd = speedAt(x), cEnd = closeAt(x, gk);
        let a = prevX, ga = prevG, found = -1;
        march:
        while (a < x) {
          const ca = closeAt(a, ga);
          // the rate the gap could close at over what is left: read at both ends and carried across by its own
          // variation (the tensile refinement's law), and never above the pair's summed path speeds
          let closing = Math.min(Math.max(speedAt(a), sEnd), Math.max(ca, cEnd, 0) + Math.abs(cEnd - ca));
          let b = 0, gb = 0;
          // That rate is an ESTIMATE of a bound, so the step VERIFIES it instead of trusting it: if the gap
          // actually fell faster over [a, b] than `closing` said it could, the estimate was not a bound there and
          // the interval it certified was not root-free. Raise it to the rate just MEASURED — strictly larger, so
          // the step strictly shortens — and take that step instead; after 8 raises take the whole-horizon reach,
          // which is the bound the pre-fix scan excluded with and cannot be exceeded. A skip is never taken on an
          // unverified rate.
          for (let esc = 0; ; esc++) {
            if (!(closing > 0)) break march;            // separating over the whole of what is left: the gap cannot reach zero
            b = a + ga / closing;                       // the earliest instant the gap could reach zero
            if (b >= x) break march;                    // …and that is past this interval's end
            if (!(b > a) || overBudget(walkSteps - spend0)) {   // the gap is at the float floor, or the refinement has spent its share
              if (!degraded) { degraded = true; degradations.push({ kind: 'contact-refine-budget', t, rear: rf.id, front: fb.id, members: rc.members.length + fc.members.length, steps: refineSpent + (walkSteps - spend0), budget: walkBudget }); }
              break march;                              // resolved at the bracket already in hand — never a silent spin
            }
            gb = g(b);
            if (gb <= 0) { found = b; lo = a; hi = b; break march; }
            const rate = (ga - gb) / (b - a);           // what the gap's closing rate actually WAS across the step
            if (!(rate > closing)) break;               // the estimate held as a bound: the step is certified
            refineEsc += 1;
            closing = esc < 8 ? rate : Math.max(rate, vmax);
          }
          a = b; ga = gb;
        }
        refineSpent += walkSteps - spend0;
        if (found >= 0) break;
      }
      prevX = x; prevG = gk; lo = x;
    }
    if (hi < 0) return Infinity;
    for (let it = 0; it < 50; it++) { const mid = 0.5 * (lo + hi); if (g(mid) <= 0) hi = mid; else lo = mid; if (hi - lo < 1e-13) break; }
    return hi;
  };
  /** Does any non-line segment (a blend, a swing) lie within `reach` of station D on the route? */
  const blendNear = (route, D, reach) => route.segs.some((sg) => sg.kind !== 'line' && sg.D0 >= D - reach && sg.D1 <= D + reach);

  /** Free acceleration of a member (rest is stable on non-draining edges). */
  // The acceleration a member contributes to its cluster's group mean: always the one a MOVING
  // ball has there. Whether a cluster at rest starts at all is decided once, on the group mean
  // (`!moving && a <= 0` below), not per member: clamping each still member's own drag to zero
  // let a train that WAS rolling be driven as if the balls on the flat ahead of it had no
  // resistance (refuter 2, round 14 — the shipped wire slide's own r15d ledger rolled at
  // 0.2733 m/s² where its seven members supply 0.2173, the front ball 12.1 % fast).
  const freeAccel = (b) => {
    const a = accelAt(b.route, sideD(b.route, b.D), r);
    b.aFree = a.a;
    return a.a;
  };

  /** (order 23b, items 2 + 3 + 6) THE LAW AT u = 0. A cluster (or a block of one) that has come to a halt is asked, from the
   * acceleration law of its own members at their seats — never from the sign of a residual:
   *  (1) does it START? Along the root coordinate the generalised gravity force is F = Σ μ_i G_i drive_i and the rolling-resistance
   *      capacity is R = Σ μ_i |G_i| resist_i (each member's resistance opposes ITS motion, G_i·u). The group starts forward iff
   *      F > R and backward iff F < −R — the single ball's non-draining-edge rule, pooled over the tree. A residual of 10⁻¹³ m/s²
   *      (the wire slide's 17-day creep, refuter II) is twelve orders under R and starts nothing: the creep bound is this
   *      threshold, derived from the resistance law already in the tree — no time constant.
   *  (2) statically held (|F| ≤ R): AT REST, or LOCKED? A member is GROUNDED when its own law reads zero at its seat
   *      (|drive_i| ≤ resist_i — alone it would rest there). A walled or held cluster, a lone ball, or a cluster with a grounded
   *      member is at rest: its equilibrium is anchored to a seat (a queue on the level tray carrying a tail on the ramp is rest —
   *      a reaction through grounded balls). A cluster of two or more members NONE of which is grounded — balls on draining slopes
   *      holding one another up: refuter II's four-ball fork arch (17 of 76 seeds), the wire slide's two-ball fork jam — is a
   *      LOCK: the 1-D path model cannot say which ball gives way, so the solve REFUSES by name (fail-closed, as V13 / V16 refuse
   *      a declaration), never "settled".
   *  The only residual of the derivation is the floating-point tolerance on |F| = R: 10⁻⁹ · R. */
  const staticVerdict = (c, idx, dyn, sides = null) => {
    let F = 0, R = 0, S2 = 0, grounded = 0; const rows = [];
    for (const i of idx) {
      const m = c.members[i]; const g = dyn.G[i], w = dyn.mu[i];
      if (!Number.isFinite(g) || !Number.isFinite(w)) continue;
      const res = accelAt(m.route, sideD(m.route, dyn.D[i], (sides && sides[i]) || 1), r);
      F += w * g * res.drive; R += w * Math.abs(g) * res.resist; S2 += w * g * g;
      const gr = Math.abs(res.drive) <= res.resist * (1 + 1e-9);
      if (gr) grounded += 1;
      rows.push({ id: m.id, drive: +res.drive.toFixed(4), resist: +res.resist.toFixed(4), G: +g.toFixed(4), mu: +w.toFixed(4), grounded: gr });
    }
    const tol = 1e-9 * Math.max(R, 1e-9);
    if (!(S2 > 0)) return { kind: 'rest', F, R, S2, grounded, rows };
    if (F > R + tol) return { kind: 'moves', a: (F - R) / S2, F, R, S2, rows };
    if (F < -R - tol) return { kind: 'moves', a: (F + R) / S2, F, R, S2, rows };
    if (c.wall || c.hold || idx.length === 1 || grounded > 0) return { kind: 'rest', F, R, S2, grounded, rows };
    return { kind: 'held', F, R, S2, grounded, rows };            // within capacity, no seat under any member — the block's OWN contacts hold it (proved by restTensile)
  };
  /** The LOCK refusal (fail-closed): the event is booked for the record and the solve throws by name. */
  /** The rest law at u = 0 for one block (order 23b, items 2 and 6). F = Σ μ G drive and the resistance capacity R = Σ μ |G| resist
   * are read with every member on its DOWNSTREAM side (sv⁻). A member sitting ON a break of its route (the vertex impact snaps the
   * crossing member there) makes that vertex a UNILATERAL constraint: backward motion puts the member on its upstream side, whose
   * law (sv⁺ — the same block read there) decides whether the backward mode exists at all. Forward (sv⁻ moves, a > 0) → a. A seat
   * under the block (a grounded member, the wall, a hold, a lone ball) → rest. Backward push (sv⁻ moves with a < 0, or within
   * capacity with F < 0): no member on a break → the fold closes freely, a = sv⁻.a; a member on a break → sv⁺ backward (F⁺ < −R⁺)
   * → a = sv⁺.a, else the push is INTO the corner — the vertex takes it and the block RESTS, held by the corner (r28's hairpin jam:
   * a train stopped against a 135° vertex, the followers' drive through J⁺ < 0 pressing the front back into the corner while the
   * entry-side law pulls it forward — squeezed from both sides, the acceleration law reads zero WITH the vertex reaction). Two or
   * more draining members within capacity with no seat and no corner — LOCK, refused by name (the arch, the fork jam). Without the
   * two-sided reading the exit-side fold acceleration (−0.066 m/s²) was held while the train retreated 15.8 mm onto the entry leg
   * (the member on the break books no up-crossing at τ = 0), turned, came back and was stopped again: a 1.009 s Zeno to MAX_EVENTS. */
  const onBreak = (m) => m.route.breaks.some((b) => Math.abs(b - m.D) <= 1e-9);
  /** The rest state's LINK test (order 23b item 2). `tensileRank` returns −1 the moment a cluster is at rest with
   * a = 0 (`!(c.v !== 0 || c.a !== 0)`), so a block held at u = 0 never had its links checked at all: the group verdict
   * |F| ≤ R says the block does not accelerate and says nothing about whether every contact can carry that as a PUSH.
   * The question is the settle's own — does the gap OPEN — asked of the block at rest: free the two ends of each link
   * under their OWN laws (from rest, so a member within its own capacity does not move at all) and read the 3-D gap
   * over the settle's four horizons, closes-first winning exactly as in the merge test above. A link whose gap closes
   * is compressive and the block is a real equilibrium. Read instead through the SIGN of the sub-tree's chain-frame
   * acceleration — the static analogue of `demandAt > pushFromIdx` — every one of these blocks reads tensile (a
   * reversed member's own drive is chain-negative by construction), and r28's 170° hairpin pair, whose gap closes by
   * 0.000017 mm at 0.2 ms and 0.685 mm at 40 ms, would be refused as a pull while the two balls are wedging INTO each
   * other. The horizons are the criterion; the chain-frame sign is not. */
  const linkOpens = (cl, i, par) => {
    const pI = par[i]; if (!(pI >= 0)) return false;
    const ch = cl.members[i], pa = cl.members[pI];
    const aOwn = (m) => { const res = accelAt(m.route, sideD(m.route, m.D, 1), r); return Math.abs(res.drive) <= res.resist ? 0 : res.drive - res.resist; };
    const aC = aOwn(ch), aP = aOwn(pa); let opens = false;
    for (const dt of [2e-4, 2e-3, 1e-2, 4e-2]) {
      const g = gap3(ch, Math.max(0, ch.D - 0.5 * aC * dt * dt), pa, Math.max(0, pa.D - 0.5 * aP * dt * dt));
      if (g < -1e-9) return false;                                    // closes first: the link is compressive
      if (g > 1e-9) opens = true;
    }
    return opens;
  };
  const restTensile = (cl, idx, dyn) => {
    const par = dyn.parent ?? parentOf(cl);
    for (let ki = 1; ki < idx.length; ki++) { const k = idx[ki]; if (idx.includes(par[k]) && linkOpens(cl, k, par)) return { ki, k }; }
    return null;
  };
  /** A block that comes to rest is NAMED by what holds it, on the event already booked at this instant on its front (stop / turn / impact / contact / wall)
   * (order 23b item 6): 'seat' a grounded member under it, 'wall' the tray, 'hold' a declared hold, 'lone' one
   * ball on its own, 'corner' a unilateral vertex taking the push, 'mutual' the members wedging into each other
   * with no seat under any of them — a jam, which is a rest and says so, not a silent settle. */
  const nameHold = (cl, idx, why, sv) => {
    cl.heldBy = why; const ids = new Set(idx.map((j) => cl.members[j].id));
    for (let i = events.length - 1; i >= 0 && events[i].t === t; i--) {
      if (!ids.has(events[i].ball) || events[i].kind === 'lock') continue;   // the latest event of this instant on a member of the block: stop / turn / impact / contact / wall (a catch books `ball` = the mover)
      events[i].heldBy = why; events[i].members = idx.map((j) => cl.members[j].id);       // the whole block is named by the one event
      if (why === 'mutual') { events[i].F = sv.F; events[i].R = sv.R; events[i].S2 = sv.S2; events[i].rows = sv.rows; }
      return;
    }
  };
  const restLaw = (cl, idx, dyn0) => {
    const svD = staticVerdict(cl, idx, dyn0);
    if (svD.kind === 'moves' && svD.a > 0) return svD.a;
    if (svD.kind === 'rest') { nameHold(cl, idx, cl.wall ? 'wall' : cl.hold ? 'hold' : idx.length === 1 ? 'lone' : 'seat', svD); return 0; }
    const sidesUp = cl.members.map((m, i) => (idx.includes(i) && onBreak(m) ? -1 : 0));
    if (sidesUp.some((x) => x !== 0)) {
      const dynU = chainDyn(cl.members, cl.members[0].D, 0, null, sidesUp, parentOf(cl));
      const svU = staticVerdict(cl, idx, dynU, sidesUp);
      if (svU.kind === 'moves' && svU.a < 0) return svU.a;
      if (svD.kind === 'moves' || svD.F < 0) { nameHold(cl, idx, 'corner', svD); return 0; }
    } else if (svD.kind === 'moves') return svD.a;
    if (svD.kind === 'held') {
      const ten = restTensile(cl, idx, dyn0);
      if (!ten) { nameHold(cl, idx, 'mutual', svD); return 0; }   // every link compressive: a static equilibrium, the members wedged into one another
      refuseLock(cl, idx, svD, 'tensile-at-rest', ten);
    }
    refuseLock(cl, idx, svD);
    return 0;
  };
  const refuseLock = (c, idx, sv, why = 'arch', ten = null) => {
    const ids = idx.map((i) => c.members[i].id); const front = c.members[idx[0]];
    events.push({ kind: 'lock', t, ball: front.id, other: null, runwayId: runwayOf(front), D: front.D, v: 0, members: ids, why, F: sv.F, R: sv.R, S2: sv.S2 });
    const err = new Error(why === 'pinch'
      ? `ball-return solve LOCKED at t ${t.toFixed(4)} s: ball ${ids[0]} is pinched between two seats (${ids.slice(1).join(', ')}) — a rigid triangle on three 1-D paths has no freedom; refusing the solution (fail-closed)`
      : why === 'tensile-at-rest'
      ? `ball-return solve LOCKED at t ${t.toFixed(4)} s: ${ids.length} balls (${ids.join(', ')}) read within capacity (|F| ${Math.abs(sv.F).toExponential(3)} ≤ R ${sv.R.toExponential(3)}) but the block cannot rest — the link onto ball ${ten ? c.members[ten.k].id : '?'} OPENS with both ends freed (the settle's own horizons) and would have to PULL; refusing the solution (fail-closed)`
      : `ball-return solve LOCKED at t ${t.toFixed(4)} s: ${ids.length} balls (${ids.join(', ')}) hold one another on draining slopes with no seat under any of them (|F| ${Math.abs(sv.F).toExponential(3)} ≤ R ${sv.R.toExponential(3)}, no grounded member) — a jam the 1-D path model cannot resolve; refusing the solution (fail-closed)`);
    err.kind = 'LOCK'; err.lock = { t, members: ids, why, F: sv.F, R: sv.R, S2: sv.S2, rows: sv.rows ?? null };
    err.partial = { pieces: new Map([...balls.values()].map((b) => [b.id, b.pieces])), events: events.slice(), r, t };
    throw err;
  };
  /** σ of `child` as a child of `parent`: n̂ · T_child with n̂ from the parent's centre to the child's (contract §26.3). */
  const linkSigmaAt = (parent, Dp, child, Dc) => {
    const a = pointAt(parent.route, Dp), b = pointAt(child.route, Dc);
    const nx = b[0] - a[0], ny = b[1] - a[1], nz = b[2] - a[2]; const L = Math.hypot(nx, ny, nz);
    if (!(L > 1e-12)) return -1;
    tangentAt(child.route, Dc, sigTan, 1);
    return (nx * sigTan.tx + ny * sigTan.ty + nz * sigTan.tz) / L;
  };
  const sigTan = {};
  /** Rebuild a cluster's pre-order from a member → parent map (in place: the members array keeps its identity). */
  const rebuildTree = (c, parentByMember) => {
    const kids = new Map(); let root = null; const oldIdx = new Map(c.members.map((m, i) => [m, i]));
    for (const m of c.members) { const p = parentByMember.get(m) ?? null; if (!p) root = m; else { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(m); } }
    const members = [], parent = [];
    const dfs = (m, pIdx) => { const idx = members.length; members.push(m); parent.push(pIdx); for (const k of (kids.get(m) ?? []).sort((x, y) => oldIdx.get(x) - oldIdx.get(y))) dfs(k, idx); };
    dfs(root, -1);
    if (members.length !== c.members.length) throw new Error(`ball-return tree rebuild lost members (${members.length} of ${c.members.length})`);
    c.members.splice(0, c.members.length, ...members); c.parent = parent; c._walkerSig = null;
  };
  /** Would the link `a` drops (to its present parent) OPEN once `a` is re-seated under `b`? Read over the settle's horizons on the
   * trial tree — the bounce law's own reading (order 17, item 5). */
  /** Does the link a member DROPS at a sibling meeting (its old parent p) open under the tree it re-seats into (under b)?
   * Read over the settle's horizons 0.2 / 2 / 10 / 40 ms along the POST-meeting motion (order 23b, round 2 — refuter A): the
   * speeds projected onto the new tree (the inelastic merge), the new tree's own acceleration, a stop where they oppose and the
   * rest law there (a block within capacity stays; one that must move goes on at the law's rate). Read along the PRE-meeting
   * motion instead, a member touching two seats at once re-seated under whichever it was moving toward, the block stopped,
   * reversed, re-caught the seat it had left, re-seated again — a rigid triangle (three balls in mutual contact on three paths
   * meeting at one point: no freedom) oscillating between its two trees, 18 750 events over 143 s (y3, one trunk ball at rest and
   * two feeder balls). A dropped link that re-closes under the new tree's own motion is a PINCH, refused by name. */
  const dropOpens = (c, a, b) => {
    const par = parentOf(c); const p = par[a]; if (p < 0) return true;
    const pm = new Map(c.members.map((m, i) => [m, i >= 0 && par[i] >= 0 ? c.members[par[i]] : null])); pm.set(c.members[a], c.members[b]);
    const trial = { members: c.members.slice(), parent: null, v: c.v, a: c.a, wall: false, hold: c.hold ?? null };
    rebuildTree(trial, pm);
    const tp = parentOf(trial); const allIdx = rangeIdx(0, trial.members.length);
    const ia = trial.members.indexOf(c.members[a]), ip = trial.members.indexOf(c.members[p]);
    // the post-meeting state: the speeds before, projected onto the new tree; the new tree's acceleration
    const bd = chainDyn(c.members, c.members[0].D, c.v, null, null, par);
    const uBefore = new Map(c.members.map((m, k) => [m, bd.G[k] * c.v]));
    const md = chainDyn(trial.members, trial.members[0].D, 0, null, null, tp);
    let num = 0, den = 0; trial.members.forEach((m, k) => { const g = md.G[k], w = md.mu[k]; if (Number.isFinite(g) && Number.isFinite(w)) { num += w * g * (uBefore.get(m) ?? 0); den += w * g * g; } });
    const v1 = den > 0 ? num / den : 0;
    const dyn1 = chainDyn(trial.members, trial.members[0].D, v1, null, null, tp);
    const a1 = runAccelIdx(dyn1, allIdx);
    if (!Number.isFinite(v1) || !Number.isFinite(a1)) return true;
    const tStop = (v1 !== 0 && a1 !== 0 && Math.sign(v1) !== Math.sign(a1)) ? -v1 / a1 : Infinity;
    let dsStop = null, a2 = 0, restAt = false;
    const state = (dt) => {
      if (dt <= tStop) return { ds: v1 * dt + 0.5 * a1 * dt * dt, u: v1 + a1 * dt };
      if (dsStop === null) {
        dsStop = v1 * tStop + 0.5 * a1 * tStop * tStop;
        const dynS = chainDyn(trial.members, Math.max(0, trial.members[0].D - dsStop), 0, null, null, tp);
        const sv = staticVerdict(trial, allIdx, dynS);
        if (sv.kind === 'moves') a2 = sv.a; else restAt = true;           // within capacity the block stays where it stopped
      }
      if (restAt) return { ds: dsStop, u: 0 };
      const e = dt - tStop; return { ds: dsStop + 0.5 * a2 * e * e, u: a2 * e };
    };
    let opens = false;
    for (const dtp of [2e-4, 2e-3, 1e-2, 4e-2]) {
      const { ds, u } = state(dtp);
      const d = chainDyn(trial.members, Math.max(0, trial.members[0].D - ds), u, null, null, tp);
      if (!Number.isFinite(d.D[ia]) || !Number.isFinite(d.D[ip])) return true;
      const g = gap3(trial.members[ia], d.D[ia], trial.members[ip], d.D[ip]);
      if (g < -1e-9) return false;
      if (g > 1e-9) opens = true;
    }
    // A block that STOPS inside the horizons and is within its capacity there stays where it stopped: the dropped link can then
    // neither open nor close — the triangle is at REST (three balls jammed at the point), which the rest law names 'mutual' with
    // the tree it keeps. A triangle the tree would have to MOVE through — the block reverses at its stop and the dropped link
    // re-closes ((vf, vT) 15/15 at 0.2 / 0.2: the two feeder children meeting under the leader, the block 0.025 mm back, a stop at
    // 10 ms, forward again, the link closed by 40 ms) — is a pinch, refused by name: the physical state is a jam at rest that can
    // open leader-first only, a unilateral rigid block the tree does not represent (carried, §29.10).
    return opens || restAt;
  };
  /** (order 23b, item 1) two members of ONE cluster meet: the one BEHIND re-seats under the one ahead and its old link is dropped —
   * never doubled (a member has one parent; a node's children never share a parent twice, so the parent cycle refuter II booked
   * cannot be written). Behind = the member whose forward tangent points at the other (σ < 0); when both do (two feeder children
   * closing on the point head-on) the one whose dropped link OPENS under the new tree re-seats; when neither dropped link opens the
   * member is PINCHED between two seats and the solve refuses by name (LOCK). A descendant meeting its ancestor re-seats under the
   * ancestor directly. The speeds after the meeting are the inelastic projection of the speeds before onto the new tree's one
   * degree of freedom — the merge law, u′ = Σ μ G′ (G u) / Σ μ G′², applied inside one cluster. */
  const selfContact = (c, i, j) => {
    const par = parentOf(c);
    const isDesc = (a, b) => { let q = a; while (q >= 0) { if (q === b) return true; q = par[q]; } return false; };
    let child, head;
    if (isDesc(i, j)) { child = i; head = j; } else if (isDesc(j, i)) { child = j; head = i; }
    else {
      const si = linkSigmaAt(c.members[j], c.members[j].D, c.members[i], c.members[i].D), sj = linkSigmaAt(c.members[i], c.members[i].D, c.members[j], c.members[j].D);
      const cand = []; if (si < 0) cand.push([i, j]); if (sj < 0) cand.push([j, i]); if (cand.length === 0) cand.push(si <= sj ? [i, j] : [j, i]);
      let pick = null; for (const [a, b] of cand) if (dropOpens(c, a, b)) { pick = [a, b]; break; }
      if (!pick) refuseLock(c, [i, j, par[i], par[j]].filter((x, k, arr) => x >= 0 && arr.indexOf(x) === k), { F: NaN, R: NaN }, 'pinch');
      [child, head] = pick;
    }
    const bd = chainDyn(c.members, c.members[0].D, c.v, null, null, par);
    const uBefore = new Map(c.members.map((m, k) => [m, bd.G[k] * c.v]));
    const childM = c.members[child], headM = c.members[head], oldParentM = par[child] >= 0 ? c.members[par[child]] : null;
    const vIn = uBefore.get(childM);
    const pm = new Map(c.members.map((m, k) => [m, par[k] >= 0 ? c.members[par[k]] : null])); pm.set(childM, headM);
    rebuildTree(c, pm);
    const np = parentOf(c); const ci = c.members.indexOf(childM);
    reseat(c, 1, 0, new Set(rangeIdx(ci, subtreeEnd(np, ci))));
    const md = chainDyn(c.members, c.members[0].D, 0, null, null, np);
    let num = 0, den = 0; c.members.forEach((m, k) => { const g = md.G[k], w = md.mu[k]; if (Number.isFinite(g)) { num += w * g * (uBefore.get(m) ?? 0); den += w * g * g; } });
    c.v = den > 0 ? num / den : 0; c._walkerSig = null;
    c.reparented = { child: childM, from: oldParentM, t };
    events.push({ kind: 'contact', t, ball: childM.id, other: headM.id, via: 'sibling', runwayId: runwayOf(childM), D: childM.D, v: vIn, vOut: c.v });
  };
  /** First τ ∈ [0, H] at which members i and j of ONE cluster touch, along the cluster's own motion (3-D). */
  const selfContactTime = (c, i, j, H) => {
    const g = (x) => { const ds = c.v * x + 0.5 * c.a * x * x; const Di = memberDAfter(c, ds, i), Dj = memberDAfter(c, ds, j); if (!Number.isFinite(Di) || !Number.isFinite(Dj)) return Infinity; return gap3(c.members[i], Di, c.members[j], Dj); };
    const g0 = g(0);
    if (g0 < -1e-9) return 0;
    if (g0 <= 1e-12 && g(1e-5) < g0 - 1e-13) return 0;
    const N = 60; let lo = 0, hi = -1;
    for (let k = 1; k <= N; k++) { const x = H * k / N; const gk = g(x); if (gk <= 0) { hi = x; break; } lo = x; }
    if (hi < 0) return Infinity;
    for (let it = 0; it < 50; it++) { const mid = 0.5 * (lo + hi); if (g(mid) <= 0) hi = mid; else lo = mid; if (hi - lo < 1e-13) break; }
    return hi;
  };
  /** Re-derive a cluster's acceleration; split by PAVA (front → back non-increasing). */
  const settleClusters = () => {
    const out = [];
    for (const c of clusters) {
      // members ordered front (small D) → back. Refuter C (round 5) read this against the contract's
      // "never re-sorted by D" and round 6 removed it; without it an rc ball that lands on the trunk as an
      // lc train passes — appended behind the tail it touched, though its station lies AHEAD of that tail
      // on their common lane — parted and re-closed every microsecond (refuter B's `dynamic.mjs`, 140° /
      // 90 mm: 5 of 640 arrival-only solves threw MAX_EVENTS). The re-sort stands (round 7) and the
      // contract says so; it is one axis, and the order it gives a cross-branch chain is the tree case
      // carried in §20.8 item 10.
      // (order 23) no D re-sort: the members are in pre-order from the root and the order across lanes is the PARENT order
      const par = parentOf(c);
      if (c.wall || c.hold) { c.v = 0; c.a = 0; for (const m of c.members) m.aFree = freeAccel(m); out.push(c); continue; }
      if (Math.abs(c.v) <= 1e-12) c.v = 0;                  // a speed under the rest threshold is rest (order 16: a 1e-13 m/s residual made a 1e12 s candidate)
      const moving = Math.abs(c.v) > 1e-12;
      const n = c.members.length;
      for (const m of c.members) m.aFree = freeAccel(m);
      // the chain's Jacobians, their rates and every member's own drive at THIS instant, from the
      // front at its current speed — the drives on the SAME terms as a moving ball's (the rest
      // test is applied once, to a block as a whole, never per member: refuter 2, round 14)
      const dyn = chainDyn(c.members, c.members[0].D, c.v, null, null, par);
      // PAVA: blocks front→back; a rear block that PUSHES — the link between it and the block
      // ahead stays compressive when the two move as one — is pooled; only a strictly faster
      // FRONT block pulls away (the contact force cannot be tensile). With every J = 1 this is
      // "a rear block whose mean drive is not below the front block's"; through a bend the
      // demand and the push are the generalised ones above.
      // On the TREE (order 23) a block is a connected rooted sub-tree ({ idx }: ascending member indices); a member's block is pooled
      // into the block that holds its PARENT — on a chain exactly the list's front → back pooling, the same tests in the same order.
      const blockOf = new Array(n); const blocks = [];
      const poolTest = (P, B) => { const aM = runAccelIdx(dyn, mergeIdx(P.idx, B.idx)); const demand = demandAt(dyn, P.idx[0], aM, B.idx[0]); const push = pushFromIdx(dyn, B.idx); return demand <= push + 1e-12; };
      for (let i = 0; i < n; i++) {
        let B = { idx: [i] }; blocks.push(B); blockOf[i] = B;
        for (;;) {
          const p = par[B.idx[0]]; if (p < 0) break;
          const P = blockOf[p];
          if (!poolTest(P, B)) break;
          P.idx = mergeIdx(P.idx, B.idx); for (const j of B.idx) blockOf[j] = P; blocks.splice(blocks.indexOf(B), 1); B = P;
        }
      }
      // a split is real only when the 3-D gap between the parting balls OPENS: through a
      // corner the front's path speed exceeds its 3-D progress and the rear would
      // re-penetrate at once — such neighbours stay one cluster (the rear pushes the front)
      for (let gi = 0; gi < blocks.length;) {
        const g2 = blocks[gi]; const p = par[g2.idx[0]];
        if (p < 0) { gi += 1; continue; }
        const g1 = blockOf[p];
        const fbm = c.members[p], rfm = c.members[g2.idx[0]];
        const a1 = runAccelIdx(dyn, g1.idx), a2 = runAccelIdx(dyn, g2.idx);
        // looked at over several horizons: at the very start of a pivot arc the chord still
        // opens for a few microseconds, then the swing closes it again — a split allowed there
        // would be undone by an immediate contact (chatter); the pair rounds the corner as one.
        // Each side is projected along its OWN law of motion (seal 15): the front block's back
        // ball through the chain from that block's front, the rear block's front ball from the
        // chain speed it has now — not the cluster front's path speed for both.
        // The rule is "a split is real only when the gap OPENS" (seal 15). Rounds 15–17 implemented its
        // converse — pooled only when the gap CLOSES — and a pair whose gap stays at zero over every horizon
        // (two blocks with the same drive, the pooling test lost at the 1e-12 margin by rounding) was split,
        // re-caught by the scan 3.45 ms later, split again: 24 pairs on the shipped obtuse train's twist
        // entry once the walker-step slicing gave the settle an instant there (order 17, item 5). A gap
        // that neither closes nor opens beyond the overlap tolerance is one block.
        let closes = false, opens = false;
        const vF = dyn.G[g1.idx[0]] * c.v, vR = dyn.G[g2.idx[0]] * c.v;                // signed (order 16)
        const frontGroup = subCluster(c, g1.idx, { v: vF, a: a1 });
        const rankP = g1.idx.indexOf(p);
        for (const dtp of [2e-4, 2e-3, 1e-2, 4e-2]) {
          const D1 = memberDAfter(frontGroup, vF * dtp + 0.5 * a1 * dtp * dtp, rankP);
          const D2 = Math.max(0, rfm.D - (vR * dtp + 0.5 * a2 * dtp * dtp));
          const g = gap3(rfm, D2, fbm, D1);
          if (g < -1e-9) { closes = true; break; }
          if (g > 1e-9) opens = true;
        }
        if (!opens) closes = true;                                                   // a gap that stays shut is not a split
        if (closes) { g1.idx = mergeIdx(g1.idx, g2.idx); for (const j of g2.idx) blockOf[j] = g1; blocks.splice(gi, 1); gi = blocks.indexOf(g1); } else gi += 1;
      }
      // the chain may push but never pull: inside each block, a follower whose demanded
      // acceleration no push can supply — not its own free roll, not the sub-chain behind it —
      // parts there with the rest of the block behind it (review round 8; the "behind it" half
      // of the test is review round 14, which is what lets a pushed train stay whole)
      for (let gi = 0; gi < blocks.length; gi++) {
        const g = blocks[gi];
        if (g.idx.length === 1) continue;
        // At u = 0 a block has no motion to project and `tensileRank` reads the link over the RUNNING
        // acceleration — the sign-based own-drive, which at u = 0 takes the forward branch for every member and
        // is the creep generator itself. `restTensile` asks the settle's own question there instead: a link whose
        // gap OPENS with both ends freed parts here, through this same split and the same `separate` event, and
        // one whose gap closes is compressive and stays (order 23b item 2). Parting on the chain-frame sign
        // instead frees a rear that rolls back a hair, turns and re-closes — separate / turn / contact on a
        // 5.25 µs cycle, 9 997 times inside 0.374 s, to MAX_EVENTS (refuter II's y3 pass-through).
        let k;
        if (!moving) { const ten = restTensile(c, g.idx, dyn); k = ten ? ten.ki : -1; }
        else { const probe = subCluster(c, g.idx, { v: dyn.G[g.idx[0]] * c.v, a: runAccelIdx(dyn, g.idx) }); k = tensileRank(probe, 0); }
        if (k >= 1) {
          // the link would have to PULL this follower: it parts, and rolls on at the speed the
          // chain gave it at this instant — the seat mapping's own derivative, u_k = G_k·u_0
          // (seal 15). Seal 14 asked whether the freed pair would DRAW APART over 10 ms and,
          // when not, stopped the follower dead against the leader's flank (`block`, v = 0);
          // with the parting read on the smooth law that question has one answer — a link that
          // is tensile now opens now — and a pair that meets again is a `contact` event like any
          // other. The round-8 whip (a rigid chord dragging the follower through the corner at
          // 16× the leader) cannot return: a follower is never asked to move faster than a push
          // from behind can make it, that is what `tensileRank` tests.
          const kk = g.idx[k]; const e = subtreeEnd(par, kk);                            // the parting member and its sub-tree (kk..to on a chain)
          const right = { idx: g.idx.filter((i) => i >= kk && i < e) }, left = { idx: g.idx.filter((i) => !(i >= kk && i < e)) };
          right.vOwn = dyn.G[kk] * c.v;                                                    // signed: a follower freed while shoved backward keeps going backward (order 16)
          if (dyn.fold[kk]) {
            // at a FOLD the link's Jacobian has no value at this very station (the seat root has just
            // vanished); the follower's speed is the one the chain gave it an instant before — read
            // with the front a hair back along its path, where the root still exists (order 16)
            const dynBack = chainDyn(c.members, c.members[0].D + 1e-6, c.v, null, null, par);
            if (!dynBack.fold[kk] && Number.isFinite(dynBack.G[kk])) right.vOwn = dynBack.G[kk] * c.v;
          }
          right.partedFrom = c.members[par[kk]]; // the contact law leaves a just-parted pair alone within this instant
          blocks.splice(gi, 1, left, right); for (const j of left.idx) blockOf[j] = left; for (const j of right.idx) blockOf[j] = right; // the right part is re-tested on the next pass
        }
      }
      if (blocks.length === 1) {
        c.a = runAccelIdx(dyn, blocks[0].idx);
        if (moving) c.heldBy = null; else c.a = restLaw(c, blocks[0].idx, dyn); // the law at u = 0 (order 23b); a moving block is held by nothing
        out.push(c);
      } else {
        for (const g of blocks) {
          if (g.idx[0] === 0) continue;
          // every parting is NAMED where it happens (seal 15): `ball` = the freed rear block's
          // front, `other` = the ball it leaves, `v` = the speed it keeps — the chain speed the
          // seat mapping gave it an instant before (never zero while the leader moves). Seal 14
          // emitted 'separate' only from the horizon scan, so a parting inside the re-settle of
          // any other event (a vertex crossing, a landing, a contact) left no trace.
          const rb = c.members[g.idx[0]];
          const vOwn = g.vOwn !== undefined ? g.vOwn : dyn.G[g.idx[0]] * c.v;
          events.push({ kind: 'separate', t, ball: rb.id, other: c.members[par[g.idx[0]]].id, runwayId: runwayOf(rb), D: rb.D, v: vOwn });
        }
        for (const g of blocks) {
          // a parting rear block keeps ITS OWN speed along its path — the chain speed its front
          // had as a follower an instant before the split (through a corner that is not the
          // cluster front's path speed) — never the front's (review round 8). Seal 14 clamped
          // it to the cluster front's speed; the seat mapping's derivative is the speed the
          // follower was DRAWN at, and what it keeps (seal 15).
          const vOwn = g.idx[0] === 0 ? c.v : (g.vOwn !== undefined ? g.vOwn : dyn.G[g.idx[0]] * c.v);
          const nc = subCluster(c, g.idx, { v: vOwn, a: runAccelIdx(dyn, g.idx), wall: false, partedFrom: g.partedFrom ?? null, partedT: g.partedFrom ? t : undefined });
          if (Math.abs(nc.v) <= 1e-12) { nc.v = 0; const idxs = rangeIdx(0, nc.members.length); nc.a = restLaw(nc, idxs, chainDyn(nc.members, nc.members[0].D, 0, null, null, parentOf(nc))); } // the law at u = 0 (order 23b)
          for (const m of nc.members) m.cluster = nc;
          out.push(nc);
        }
      }
    }
    clusters.length = 0;
    clusters.push(...out);
  };

  /** Advance every cluster by τ, recording pieces. */
  const advance = (t, tau) => {
    if (tau <= 0) return;
    for (const c of clusters) {
      if (c.v === 0 && c.a === 0) {
        for (const m of c.members) {
          const last = m.pieces[m.pieces.length - 1];
          if (last && last.kind === 'rest' && last.t1 === Infinity) continue;
          const piece = { kind: 'rest', t0: t, t1: t + tau, D0: m.D, v0: 0, a: 0, route: m.route };
          if (c.hold) piece.hold = { Db: c.hold.Db, after: c.hold.after, sJ: c.hold.sJ, Dy: c.hold.Dy }; // a merge-window hold survives a time base change
          m.pieces.push(piece);
        }
        continue;
      }
      const ds = c.v * tau + 0.5 * c.a * tau * tau;
      const front = c.members[0];
      const lead = { D0: front.D, v0: c.v, a: c.a, route: front.route };
      const parA = parentOf(c);
      for (let i = 0; i < c.members.length; i++) {
        const m = c.members[i];
        const piece = { kind: 'roll', t0: t, t1: t + tau, D0: m.D, v0: c.v, a: c.a, route: m.route, runwayId: runwayOf(m) };
        if (i === 0 && Number.isFinite(c.passedYield)) piece.passedYield = c.passedYield;   // the front's verdict at the merge it is inside (carried across a base)
        if (i > 0) { // a follower's pose is walked from the lead along its ROOT PATH (order 23: the members between the root and it — ranks 1..i on a chain)
          const pathIdx = []; for (let q = i; q > 0; q = parA[q]) pathIdx.push(q); pathIdx.reverse();
          piece.follow = { lead, chain: pathIdx.map((q) => c.members[q].route), hints: pathIdx.map((q) => c.members[q].D) };
        }
        m.pieces.push(piece);
      }
      front.D = Math.max(0, front.D - ds);
      reseat(c, 1, ds);
      c.v = c.v + c.a * tau;                                  // signed (order 16): a 'turn' event splits the piece where a backward roll stops
    }
  };

  /** Merge cluster `rear` into `front` (inelastic). The generalised momentum Σ G_i u_i of the two
   * chains is conserved into one chain on the front's degree of freedom (seal 15):
   *     u' = Σ G_i u_i / Σ G_i²
   * — the path-speed average of seals 8…14 when every J is 1. A rear ball meeting a leader's
   * flank around a corner (G ≈ 0.01) therefore leaves the leader's speed all but unchanged and
   * itself all but stopped, its momentum into the rail; the average halved the leader. */
  const merge = (front, rear, k = front.members.length - 1) => {
    // (order 23b, round 2 — refuter B, F1) a block resting ON the corner (heldBy 'corner': the followers' drive presses the front into a
    // one-sided vertex) takes a push from behind exactly as the wall does: the push goes INTO the vertex, the striker stops, the block
    // stays. Projected onto the downstream tree instead (G = [1, J⁺, J⁺, …], J⁺ = cos 135° = −0.707) and realised on the upstream one,
    // one striker at +0.489 became four balls at −0.139 climbing 15.6 mm back up the entry leg.
    const held = front.wall || front.hold || (front.heldBy === 'corner' && front.v === 0);
    const uBefore = new Map();
    if (!held) {
      const fd = chainDyn(front.members, front.members[0].D, front.v, null, null, parentOf(front));
      front.members.forEach((m, i) => uBefore.set(m, fd.G[i] * front.v));
      const rd = chainDyn(rear.members, rear.members[0].D, rear.v, null, null, parentOf(rear));
      rear.members.forEach((m, i) => uBefore.set(m, rd.G[i] * rear.v));
    }
    const nBefore = front.members.length;
    // The rear's members go BEHIND the front's, in their own order: the contact was found between
    // the front's back ball and the rear's front ball, and each cluster is already front → back.
    // Rounds 1–4 re-sorted the joined chain by D here — one axis, valid on one lane only; a feeder
    // ball caught from a different branch was sorted INTO the trunk train between two touching balls
    // (refuter B's `recoil.mjs`, 105° family: 2 → 1 → 3) (order 16, round 5). Round 7 tried inserting
    // the rear after the last front member ahead of it on a common lane: it threw on the 105° family
    // and did not close the case it was written for — withdrawn.
    // (order 23) the rear's ROOT attaches under member k — the member it TOUCHED: the tail on one lane (as before), any member across
    // branches (a committed feeder ball meeting a passing train's leader: the contact TREE). The rear's own links stay. In pre-order the
    // rear's sub-tree goes right after member k's sub-tree; the members after it shift, their parent indices with them.
    const parF = parentOf(front), parR = parentOf(rear);
    const at = subtreeEnd(parF, k), len = rear.members.length;
    const newPar = parF.slice(0, at).concat(parR.map((p, i) => (i === 0 ? k : p + at)), parF.slice(at).map((p) => (p >= at ? p + len : p)));
    front.members.splice(at, 0, ...rear.members); front.parent = newPar;
    for (const m of rear.members) m.cluster = front;
    // every follower exactly one diameter (3-D) behind the ball ahead — from the first ARRIVING
    // member outward: a resting / held front keeps its stations to the bit (review round 8: a
    // full re-seat nudged a held ball by 7.5 nm)
    reseat(front, held ? at : 1, 0, held ? new Set(rangeIdx(at, at + len)) : null);
    if (held) front.v = 0;
    else {
      const md = chainDyn(front.members, front.members[0].D, 0, null, null, parentOf(front));
      let num = 0, den = 0;
      front.members.forEach((m, i) => { const g = md.G[i], w = md.mu[i]; num += w * g * (uBefore.get(m) ?? 0); den += w * g * g; });
      front.v = num / den;                                     // signed (order 16): a catch around a hairpin may recoil the train; the merge never clamps
    }
    const i = clusters.indexOf(rear);
    if (i >= 0) clusters.splice(i, 1);
  };

  /** The nearest cluster AHEAD of a ball arriving at station D on its route whose
   * back ball can be touched from there (same lane), or null. */
  const clusterAhead = (b, D) => {
    // the queue's tail may already stand ABOVE the entry station (a seat within one
    // ball length upstream): it counts — the arrival then has no seat (overflow)
    let best = null;
    for (const o of clusters) {
      if (o === b.cluster) continue;
      const oB = o.members[o.members.length - 1];
      const probe = { route: b.route, D: Math.max(D, oB.D), cluster: b.cluster };
      if (!canTouch(probe, oB)) continue;
      if (!best || oB.D > best.members[best.members.length - 1].D) best = o;
    }
    return best;
  };

  // ---- ledger: balls already at rest from the beginning of time --------------
  // Entries are ids (packed from the wall outward) or { id, D, route?, q? } — a
  // CARRIED rest from the previous solution keeps its station, its ROUTE (an
  // overflow ball resting on the trunk stays on the trunk — review r2 P2-2) and its
  // rolling orientation (no reset to identity). Unknown stations pack behind the
  // last carried one. Clusters form by contiguity along a shared chain; the front
  // chain is wall-backed only when it touches the wall.
  if (ledger.length) {
    const seated = [];
    let maxD = -r;
    let maxEntry = null; // the furthest carried ball: newcomers pack BEHIND it, on ITS route
    for (const e of ledger) if (e && typeof e === 'object' && Number.isFinite(e.D) && e.D > maxD) { maxD = e.D; maxEntry = e; }
    // beyond the tray's own length a station lies on the trunk: a newcomer packed
    // behind a trunk-resting ball must follow that ball's route, not the tray
    // route's flat extrapolation (review round 4)
    const packRoute = (maxEntry?.route && (!track.trayRoute || maxD > track.trayRoute.total - 1e-9)) ? maxEntry.route : track.trayRoute;
    // beyond the packing route's own reach a newcomer follows the track's
    // furthest-reaching route through the same rest surface (the trunk, then a
    // feeder — every station ON the polyline, never an extrapolated line — review r4
    // P2-3); beyond every route the ball has no station: it is refused (culled,
    // `solution.overflow`) rather than drawn off the track
    const reachRoutes = [...track.routes.values()].filter((rt) => rt.restId === (packRoute?.restId ?? null)).sort((a, b) => b.total - a.total);
    const longest = reachRoutes[0] ?? packRoute;
    let n = 0;
    let packTail = null; // the last newcomer packed (the next one seats behind it)
    for (const e of ledger) {
      const id = typeof e === 'object' ? e.id : e;
      const known = typeof e === 'object' && Number.isFinite(e.D);
      let route = (typeof e === 'object' && e.route) ? e.route : (known ? track.trayRoute : packRoute);
      if (!route) continue; // a terminal system has no collector: a ball with no known chute is not seated (stays culled)
      // a newcomer packs one diameter (3-D) behind the last packed ball, ON that ball's
      // route (the chain stays on one physical path); past that route's reach it moves to
      // the furthest-reaching route and is seated there behind the same ball; past every
      // route it is refused
      let D;
      if (known) D = e.D;
      else {
        const prev = packTail ?? (maxEntry ? { D: maxD, route: maxEntry.route ?? route } : null);
        if (prev) { route = prev.route; D = seatD(route, prev.route, prev.D); } else D = r;
        n += 1;
        if (D > route.total + 1e-9) {
          if (longest && longest !== route && prev) { const D2 = seatD(longest, prev.route, prev.D); if (D2 <= longest.total + 1e-9) { route = longest; D = D2; } }
          if (D > route.total + 1e-9) { overflow.add(id); events.push({ kind: 'overflow', t: -Infinity, ball: id, runwayId: null, D, v: 0 }); n -= 1; continue; }
        }
        packTail = { D, route };
      }
      const q = (typeof e === 'object' && Array.isArray(e.q) && e.q.length === 4) ? e.q : Q_ID;
      seated.push({ id, D, route, q });
    }
    seated.sort((x, y) => (x.D - y.D) || (x.id - y.id));
    // contiguity is judged against the previous ball on the SAME rest surface: on a
    // terminal system the chutes' ladders interleave in D, and a chain broken by a
    // ball of another chute would leave its wall-backed tail as a free cluster for an
    // instant (a landing at that instant then read a "moving" tail — review round 6)
    const lastOnRest = new Map(); // restId → { c, b }
    for (const sd of seated) {
      const b = mk(sd.id, sd.route);
      b.D = sd.D;
      b.active = true;
      b.qStart = sd.q;
      const prev = lastOnRest.get(sd.route.restId) ?? null;
      let c = prev ? prev.c : null;
      if (!prev || sd.D > seatD(b.route, prev.b.route, prev.b.D) + 1e-9 || !canTouch(b, prev.b)) {
        c = { members: [], v: 0, a: 0, wall: sd.D <= r + 1e-9 };
        clusters.push(c);
      }
      b.cluster = c;
      b.pieces.push({ kind: 'rest', t0: -Infinity, t1: Infinity, D0: b.D, v0: 0, a: 0, route: b.route });
      c.members.push(b);
      balls.set(sd.id, b);
      lastOnRest.set(sd.route.restId, { c, b });
    }
  }
  // ---- continuations: seat at (D, v, q) on the new time base -----------------
  const conts = continuations
    .filter((c) => c && Number.isFinite(c.D) && c.route && !balls.has(c.id))
    .map((c) => ({ ...c, v: Number.isFinite(c.v) ? c.v : 0, t0: Number.isFinite(c.t0) ? c.t0 : 0 })) // signed: a ball shoved back up its runway at the cut keeps going back (order 16)
    .sort((x, y) => (x.D - y.D) || (x.id - y.id));
  // the base begins at the EARLIEST of its two openings — the first arrival's landing and the earliest continuation origin
  // (#737 r7 class B, boundary event E8). A late reactivation's continuations are dated at the record clock it joined at, and
  // taking that as the start delayed EVERY earlier arrival of the record to it (the landing rule below fires a pending arrival
  // dated before the start at the start itself): the ball stood frozen at the entry from its own landing until the join. Each
  // piece keeps its own origin — a continuation dated after the start is seated by its own `resume` event below, exactly as a
  // continuation dated after a base's start already was (round 22d).
  const tOpen = Math.min(
    conts.length ? Math.min(...conts.map((c) => c.t0)) : Infinity,
    pending.length ? pending[0].h.tLand : Infinity,   // `pending` is sorted by tLand: [0] is the record's first landing
  );
  const tStart = Number.isFinite(tOpen) ? tOpen : 0;
  /** Seat one continuation at (D, v, q) on this base — at the base's start, or (round 22d) at its own later t0. */
  const seatContinuation = (cd) => {
    const b = mk(cd.id, cd.route);
    b.D = cd.D;
    b.v = cd.v;
    b.active = true;
    b.qStart = Array.isArray(cd.q) && cd.q.length === 4 ? cd.q : Q_ID;
    // a ball that was touching the ball ahead of it at the switch (a pair rolling
    // as one cluster, or seated against a resting chain) stays in that cluster — a carried
    // FOLLOWER joins on geometry alone (its speed is the chain's, not a free quadratic's)
    let joined = null, under = -1;
    for (const c of clusters) {
      // the tail first (the list's join: one lane); then any member across branches whose seat this station IS — a tree child
      // re-seeded at a cut re-attaches under the member it touches (order 23)
      const last = c.members.length - 1;
      for (let k = last; k >= 0 && !joined; k--) {
        const m = c.members[k];
        if (Math.abs(b.D - seatD(b.route, m.route, m.D)) > 1e-6) continue;
        if (k === last ? !canTouch(b, m) : canTouch(b, m)) continue;
        if (cd.follow || c.wall || c.hold || (c.v === 0 && b.v === 0) || Math.abs(c.v - b.v) <= 1e-5 * (1 + Math.abs(c.v))) { joined = c; under = k; }
      }
      if (joined) break;
    }
    if (joined) {
      b.cluster = joined;
      const parJ = parentOf(joined); const at = subtreeEnd(parJ, under);            // pre-order: right after the parent's sub-tree
      joined.members.splice(at, 0, b); joined.parent = parJ.slice(0, at).concat([under], parJ.slice(at).map((p) => (p >= at ? p + 1 : p)));
      reseat(joined); // the carried station may sit a micron short of its chord seat (review round 8)
    } else {
      const c = { members: [b], v: b.v, a: 0, wall: b.D <= r + 1e-9 && b.v === 0 };
      // a merge-window hold at the cut is carried into the new base (review round 8: a held
      // ball re-seeded as a free { roll, v: 0 } rolled into the merge window)
      if (cd.hold && cd.hold.after && Number.isFinite(cd.hold.Db)) { c.hold = { Db: cd.hold.Db, after: cd.hold.after, sJ: cd.hold.sJ, Dy: cd.hold.Dy }; c.passedYield = cd.hold.Db; c.v = 0; c.a = 0; }
      else if (Number.isFinite(cd.passedYield)) c.passedYield = cd.passedYield;     // a verdict already given at this merge survives the base change (order 16 round 4, refuter B's item 2)
      b.cluster = c;
      clusters.push(c);
    }
    balls.set(b.id, b);
  };
  // a continuation dated AFTER the base's start (round 22d, refuter J's D1): a ball whose motion begins later — a late-joined session's
  // carried state read at its origin by a re-solve made before it — is ABSENT until its t0 (no pieces: poseAt is null, exactly as the
  // previous solution drew nothing before it) and seated then, by the same law, as a 'resume' event
  const resumes = [];
  for (const cd of conts) { if (cd.t0 > tStart + EPS_T) resumes.push(cd); else seatContinuation(cd); }
  resumes.sort((x, y) => (x.t0 - y.t0) || (x.id - y.id));
  // …and the SEED each one was given is published on the solution (#737 r7 class C, boundary event E8). A re-solve made
  // before a resume's t0 has no piece to read the ball from, and reading the piece the resume PRODUCED returns the state
  // AFTER whatever event fired at t0 — a cluster join there hands back the merged chain speed, which the next solve then
  // merges a second time (the AIM revert's settle re-solve: 0.3332 → 0.3133 → 0.3033 m/s, 0.166 mm at the first drawn
  // frame). Carried forward unchanged, the seed makes the re-solve replay this solve's own event sequence exactly.
  const resumed = new Map(resumes.map((cd) => [cd.id, cd]));
  let ri = 0;
  let t = tStart;
  let tCommitted = tStart; // every motion before this instant is solved and final (review r7 P2: no arrival may be written into it)
  let pi = 0;
  let n = 0;
  settleClusters();
  /** The landing rule's seat for ball b whose fall piece is `fall`, at instant t (order 18 item 0: also asked for a
   * HELD ball at every scan). Returns the seat (null = none) and what the handler needs beside it. */
  const seatFor = (b, fall, t) => {
    const total = b.route.total;
    const ahead = clusterAhead(b, total);
    const tail = ahead ? ahead.members[ahead.members.length - 1] : null;
    const seatBehindTail = tail ? seatD(b.route, tail.route, tail.D) : -Infinity;
    const seatD0 = tail && seatBehindTail > total + 1e-9 ? seatBehindTail : total;
    // a MOVING tail is momentary congestion (rapid arrivals): the ball seats behind
    // it wherever that is — inside the pocket it stays culled until the queue brings
    // it below the exit; only a RESTING tail (a jammed queue) makes the one-ball-length
    // bound a refusal
    const tailMoving = !!ahead && !(ahead.wall || ahead.hold) && ahead.v > 1e-12; // actually in motion at this instant
    // route capacity at the landing instant (review r7 P2): the lane's settled AND in-flight
    // occupants ahead of the entry, counted against the seats that exist between the wall
    // and one ball length above the entry — the SEATING CHAIN (the wall seat, then one 3-D
    // centre diameter per seat, exactly as the solver seats; a 1-D ladder (2n − 1)·r
    // over-counts through bends); a moving tail admits a seat further up only while a seat
    // will exist for the ball once the queue settles …and a seat counts only if a ball
    // resting on it is DRAWN (its top below the pocket exit): a station above the exit
    // would be an invisible occupant, which is exactly what the capacity law exists to refuse
    // ONE reading of the chain, shared with V16 (track.js seatLadder — 3-D centre distance per seat, not
    // (2k − 1)·r; the upstream seats above the exit line dropped): the count is the capacity here and the
    // stations are what the clearance scan asks about, so neither can drift from the other.
    const ladder = seatLadder(b.route, r);
    const seatsMax = ladder.length;
    const upstream = seatUpstream(b.route, r);   // the chain's own bound: past it there is no seat at all
    let occupants = 0;
    for (const o of clusters) for (const m of o.members) { if (canTouch({ route: b.route, D: Math.max(total, m.D), cluster: null }, m)) occupants += 1; }
    const firstDrawn = (f) => fallFirstDrawn(f, r);
    let seat = null;
    if (occupants >= seatsMax) seat = null;
    else if (seatD0 > upstream + 1e-9 && !tailMoving) seat = null;
    else if (seatD0 > total + 1e-9) {
      const st = stationAt(b.route, seatD0, r, {});
      const dy = fall.yH - st.y;
      if (dy > 0) {
        const tFree = (-fall.vDown + Math.sqrt(fall.vDown * fall.vDown + 2 * G * dy)) / G;
        const vLand = fall.vDown + G * tFree;
        const edge = locate(b.route, seatD0).edge;
        seat = { D: seatD0, st, t1: fall.t0 + tFree, v0: st.k * vLand * edge.sinTh };
      } else if (tailMoving) {
        // the seat lies above the cull height: the ball waits on the pile inside the
        // pocket, never drawn — the fall ends a hair before it could become visible
        seat = { D: seatD0, st, t1: Math.max(fall.t0, Math.min(t, Number.isFinite(fall.exitY) ? firstDrawn(fall) : t)), v0: 0 };
      }
    } else {
      // the FREE entry. For an arrival handed off at the shield the fall's booked end IS its landing (h.tLand: the same
      // law from the same inputs) and nothing is re-derived. For an EARLY hand-off (#737 r3 class A: the owned ball stopped
      // on the queue at own.t, vDown 0, dated tLand = own.t) the fall to the entry from THAT height ends later — the seat
      // carries the ballistic instant and the landing is re-dated to it (below); before, the branch activated the ball at
      // the entry at own.t itself: an 82 mm jump at the second ball's takeover on the XW101 slides.
      const st = stationAt(b.route, total, r, {});
      const dy = fall.yH - st.y;
      const tFree = dy > 0 ? (-fall.vDown + Math.sqrt(fall.vDown * fall.vDown + 2 * G * dy)) / G : 0;
      if (dy > 0 && fall.t0 + tFree > fall.t1 + EPS_T) {
        const vLand = fall.vDown + G * tFree;
        const edge = locate(b.route, total).edge;
        seat = { D: total, st, t1: fall.t0 + tFree, v0: st.k * vLand * edge.sinTh, vLand, free: true };
      } else seat = { D: total, st: null, t1: fall.t1, v0: b.handoff.v0 };
    }
    return { ahead, tail, seatBehindTail, seatD0, tailMoving, seatsMax, occupants, seat, firstDrawn };
  };
  const hb_release = (b) => { const k = held.indexOf(b); if (k >= 0) held.splice(k, 1); };
  while (n++ < maxEvents) {
    // ---- candidate events
    let best = { tau: Infinity, rank: 9, id: Infinity, kind: null };
    const consider = (tau, rank, id, kind, payload) => {
      if (!(tau < Infinity)) return;
      if (tau < best.tau - EPS_T || (Math.abs(tau - best.tau) <= EPS_T && (rank < best.rank || (rank === best.rank && id < best.id)))) {
        best = { tau, rank, id, kind, payload };
      }
    };
    if (ri < resumes.length) consider(Math.max(0, resumes[ri].t0 - t), 0, resumes[ri].id, 'resume', resumes[ri]); // a continuation dated later (round 22d): it begins here
    if (pi < pending.length) consider(Math.max(0, pending[pi].h.tLand - t), 0, pending[pi].id, 'landing', pending[pi]); // an arrival dated before this base's start lands NOW — time never steps backward (review round 9)
    for (const hb of held) { // order 18 item 0: a HELD owned ball lands as soon as the landing rule finds it a seat, from the hold pose at rest
      const hp = hb.pieces[hb.pieces.length - 1];
      if (hp.kind !== 'hold') continue;
      // the release is ANCHORED at the instant the seat first appeared (hp.tRelease): the fall from the hold pose starts
      // there and lands at its ballistic instant whatever events fire in between (#737 r3 class A — a probe restarted at
      // every event would slide a free-entry landing later and later); a seat gone again un-anchors it
      const t0r = Number.isFinite(hp.tRelease) ? hp.tRelease : t;
      const vfall = { t0: t0r, t1: t, x0: hp.x, z0: hp.z, yH: hp.y, vDown: 0, xE: hb.handoff.xE, yE: hb.handoff.yE, zE: hb.handoff.zE, route: hb.route, exitY: hp.exitY };
      const probe = seatFor(hb, vfall, t);
      if (probe.seat) { if (!Number.isFinite(hp.tRelease)) hp.tRelease = t; consider(Math.max(0, (probe.seat.t1 ?? t) - t), 0, hb.id, 'landing', { id: hb.id, h: hb.handoff, fromHold: hp, tStart: t0r }); }
      else hp.tRelease = undefined;
    }
    for (const c of clusters) {
      if (c.v === 0 && c.a === 0) continue;
      // stop (a forward roll losing to its resistance) / turn (a backward roll losing to gravity:
      // the resistance flips sign where the motion does, so the piece ends there — order 16)
      if (c.a < 0 && c.v > 0) consider(c.v / -c.a, 4, c.members[0].id, 'stop', { c });
      if (c.a > 0 && c.v < 0) consider(-c.v / c.a, 4, c.members[0].id, 'turn', { c });
      // wall (front ball)
      const f = c.members[0];
      consider(firstCrossing(f.D - r, c.v, c.a), 2, f.id, 'wall', { c });
      // ceiling: a front rolling BACK reaches its landing station — the runway above it is not built
      // (the first segment extrapolates); the ball stops there (order 16 round 4, refuter A's item 6:
      // a seeded −0.3 m/s ball climbed 172 mm above its entry and stayed drawn there)
      if (c.v < 0 && f.D < f.route.total) consider(firstCrossing(f.route.total - f.D, -c.v, -c.a), 2, f.id, 'ceiling', { c });
      // edge breaks — below for a member moving forward, ABOVE for one moving back
      const dynC = c.members.length > 1 ? chainDyn(c.members, f.D, c.v, null, null, parentOf(c)) : null;
      for (const [mi, m] of c.members.entries()) {
        const um = dynC ? dynC.G[mi] * c.v : c.v;
        const back = um < 0 || (um === 0 && (dynC ? dynC.G[mi] : 1) * c.a < 0);
        if (!back) {
          const Db = nextBreakBelow(m.route, m.D);
          if (Db <= 0) continue;                          // no break left before the wall
          if (Db <= r && f === m) continue;               // the wall event covers it
          consider(memberCrossing(c, m, Db, dynC ? dynC.G[mi] : 1), 1, m.id, 'boundary', { c, m, Db });
        } else {
          const Da = nextBreakAbove(m.route, m.D);
          if (Da >= m.route.total - 1e-12) continue;      // no break above before the landing (the route above it is one line)
          consider(memberCrossing(c, m, Da, dynC ? dynC.G[mi] : 1), 1, m.id, 'boundary', { c, m, Db: Da, up: true });
        }
      }
    }
    // the FOLD as an event (order 18 item 2): a follower's seat root can VANISH during an advance (the leader moving away
    // along a direction the follower's rail cannot follow: the sphere leaves the follower's leg). The settle parts a chain at
    // a fold it finds AT an instant (`dyn.fold`), but a fold reached between events was silent — the walk hopped to the
    // other root (8.3 mm at the obtuse corner, no event). The first instant any follower's root vanishes is booked; the
    // handler does nothing but stand there, so the settle reads the fold and parts the chain with the speed it had.
    for (const c of clusters) {
      if (c.members.length < 2 || (c.v === 0 && c.a === 0)) continue;
      const w = walkerOf(c);
      const dsAt = (tau) => c.v * tau + 0.5 * c.a * tau * tau;
      const folded = (tau) => { const s = w.at(dsAt(tau)); for (let k = 1; k < c.members.length; k++) if (s.fold[k] || !Number.isFinite(s.D[k])) return true; return false; };
      if (folded(0)) continue;                       // already at a fold: the settle of this instant owns it
      const HF = Math.min(0.3, best.tau < Infinity ? best.tau : 0.3);
      if (!(HF > EPS_T)) continue;
      const NF = 60; let lo = 0, hi = null;
      for (let n = 1; n <= NF; n++) { const x = HF * n / NF; if (folded(x)) { hi = x; break; } lo = x; }
      if (hi === null) continue;
      for (let it = 0; it < 40; it++) { const mid = 0.5 * (lo + hi); if (folded(mid)) hi = mid; else lo = mid; if (hi - lo < 1e-9) break; }
      if (lo > EPS_T) consider(lo, 3, c.members[1].id, 'fold', { c }); // a fold at this very instant is the settle's (chainDyn reads a hair ahead)
    }
    // contacts between clusters sharing a runway (rear front-ball vs front back-ball).
    // The 3-D scans below (contact through a blend, separation, release from a flank block)
    // are the only candidates that carry a HORIZON: they sample a gap over [0, H] and report
    // Infinity past it. A fixed H is a hole — the solver then advances to some later event and
    // sails through the contact it did not look far enough ahead to see (refuter 2, round 14:
    // on the shipped TEST-bend-90, a ball landing at 0.2552 s meets the queue at 0.6190 s, one
    // horizon and a quarter away, and two drawn balls overlapped by 5.57 mm for 20 ms before a
    // 6.72 mm snap). So the horizon is ADAPTIVE: scan once at the nominal H, and if the event
    // the solver would actually advance to lies beyond it, scan again out to that instant —
    // `consider` only ever lowers the winner, so a second pass can only pull an event earlier.
    const H0 = 0.3;
    const scanHorizon = (H) => {
    // (order 23b, item 1) the SIBLING scan: two members of ONE cluster that are not parent and child can meet — two feeder children
    // of a node converging on its point, a grandchild swinging into its grandparent. The cluster scan below pairs clusters only;
    // refuter II drew such pairs through each other (1–4 to 0.00 mm on TEST-y3-obtuse, a parent cycle on one seed). Their gap is
    // read in 3-D along the cluster's own motion (both move with u); the first closing is a 'selfcontact' candidate.
    for (const c of clusters) {
      const n = c.members.length; if (n < 3 || !(c.v !== 0 || c.a !== 0)) continue;
      const par = parentOf(c);
      // At a NODE — a member with two or more children (order 23b item 1) — and on any cluster whose members stand on THREE or
      // more runways. On a plain chain along one or two runways every non-adjacent pair is held apart by the seat law (the
      // adjacent gaps are 2r and the merge angle opens the rest); scanning there buys nothing and costs a walker scan per pair
      // per instant (r28's six-ball hairpins: minutes). Across three routes converging on one point that premise is FALSE:
      // refuter A (order 23b) seeded one trunk ball at rest at the point and two feeder balls — the chain 2 ← 4 ← 1 has no node,
      // ball 1's seat one diameter behind ball 4 resolves AT the point where ball 2 stands, and the grandchild was drawn through
      // its grandparent (0.009 mm) for 0.258 s before a 57 mm re-seat. Reachable only through the V15 seam (three feeders at
      // one point); the same class on the tree before this round.
      const kids = new Array(n).fill(0); for (let i = 1; i < n; i++) if (par[i] >= 0) kids[par[i]] += 1;
      if (!kids.some((k) => k >= 2) && new Set(c.members.map((m) => runwayOf(m))).size < 3) continue;
      const reach = 2 * r + 2 * H * Math.abs(c.v) + 0.05;
      for (let i = 1; i < n; i++) for (let j = 0; j < i; j++) {
        if (par[i] === j || par[j] === i) continue;
        if (c.reparented && c.reparented.t === t && ((c.reparented.child === c.members[i] && c.reparented.from === c.members[j]) || (c.reparented.child === c.members[j] && c.reparented.from === c.members[i]))) continue; // the link just dropped opens (dropOpens): not re-read at this instant
        if (gap3(c.members[i], c.members[i].D, c.members[j], c.members[j].D) > reach) continue;
        const tau = selfContactTime(c, i, j, H);
        if (tau < Infinity && (tau > EPS_T || !(c.reparented && c.reparented.t === t))) consider(tau, 3, c.members[i].id, 'selfcontact', { c, i, j });
      }
    }
    for (const rear of clusters) {
      const rf = rear.members[0];
      for (const front of clusters) {
        if (front === rear) continue;
        const lastK = front.members.length - 1;
        const tailF = front.members[lastK];
        // (order 23, the contact TREE) which members of the front cluster are scanned: on one lane only its TAIL (a rear on the lane
        // cannot reach a member ahead of the tail); across branches every member the rear could meet — the tail as before, and any
        // member converging with the rear on this junction, about to share its lane, or already on it below the point (a committed
        // feeder ball is passed by the train's LEADER while the tail is still a diameter up the trunk: S1, 35.03 mm on the list).
        // (order 23b, item 1) `convergeAtJunction` reads two feeders of one junction ONE way — the rear is the ball further from its
        // landing — so that a pair of free balls is booked once, from one side. A member that is not its cluster's front is never
        // the `rear` of any pairing, so against it the pair must be read from the side the scan tries: a feeder ball nearer its
        // landing than a CHILD on the sibling feeder was not a scan pair at all until it attached to the child's parent and became
        // its sibling — 1.227 mm inside on TEST-y3-obtuse (rc 20 / cc 5 mm, 0.2 / 0.1 m/s), re-seated 1.433 mm at the node.
        const cvg = (a, b, kB) => convergeAtJunction(a, b) || (kB > 0 && convergeAtJunction(b, a));
        const targets = [];
        if (canTouch(rf, tailF)) targets.push(lastK);
        else for (let kF = lastK; kF >= 0; kF--) { const m = front.members[kF]; if (kF === lastK || canTouch(rf, m) || cvg(rf, m, kF) || approachingLane(rf, m)) targets.push(kF); }
        for (const kF of targets) {
        const fb = front.members[kF];
        // "Ahead" is a path reading: on one lane the ball with the smaller D is in front. Two balls on
        // DIFFERENT branches converging on a junction have no common D axis — round 4 asked the
        // same question of them and skipped the pair while the feeder ball's D happened to be the
        // smaller, i.e. until the two were already 17.3 mm apart (refuter B's `recoil.mjs` on its
        // 105° family: a recoiled feeder ball rolling back down toward its landing while a trunk
        // ball passed the junction — no scan between the turn and the landing, then a 45 mm
        // re-seat at the junction). For a converging pair the only order there is is the one
        // `convergeAtJunction` states (the rear above its landing on the front's runway); the 3-D
        // scan below reads the pair whichever reaches the point first (order 16, round 5).
        const crossBranch = !canTouch(rf, fb);
        if (!crossBranch && fb.D > rf.D) continue;  // not ahead
        if ((rear.wall || rear.hold) && !(front.v < 0 || (front.v === 0 && front.a < 0))) continue; // a held / walled rear moves only if the ball ahead rolls back into it (order 16)
        // Across branches the pair is scanned against the front's BACK ball, as on one lane. That is
        // not always the member a feeder ball meets first: beside the junction it is passed by the
        // train's LEADER while the tail is still a diameter up the trunk (refuter B's `recoil.mjs`,
        // seeded on the shipped obtuse fixture: 35.03 mm between the feeder ball and the leader, the
        // contact booked against the tail 6 ms later). A contact with a member that is not the tail
        // is a second follower on one ball — a contact TREE, which the chain (a list) cannot hold; an
        // inelastic side impact without a merge was tried this round and, where the passing ball
        // keeps pushing (the pair re-closes under its accelerations), it re-fires every microsecond
        // (3986 impacts at one instant, MAX_EVENTS). Carried open, §20.8 (order 16 round 5).
        if (crossBranch && !cvg(rf, fb, kF) && !approachingLane(rf, fb)) continue;   // a different branch, and neither converging on this junction nor about to share the lane below it
        const justParted = rear.partedFrom === fb && rear.partedT === t; // parted from it at this very instant: the τ = 0 answer is the parting itself; the interval after it is still scanned (seal 15)
        // the seat behind fb NOW (3-D); on straight runs the path law is exact
        const gap0 = rf.D - seatD(rf.route, fb.route, fb.D);
        const dv = rear.v - front.v, da = rear.a - front.a;
        let tau;
        if (gap0 < -1e-9) tau = 0;                                                   // an overlapping pair (a carried micron) is seated at once
        else if (justParted) { const x0 = 1e-6; tau = x0 + firstCrossing(gap0 - (dv * x0 + 0.5 * da * x0 * x0), dv + da * x0, da); } // from one microsecond on
        else tau = firstCrossing(gap0, dv, da);
        const reach = 2 * r + H * (Math.abs(rear.v) + Math.abs(front.v)) + 0.05;
        if (crossBranch || blendNear(rf.route, rf.D, reach) || blendNear(fb.route, fb.D, reach)) {
          // a blend / swing within reach of either ball: the front's 3-D progress there is
          // not its path progress, so the path law is not merely imprecise here, it is the
          // WRONG law — through a swing it reads the gap closing while the chord still opens.
          // Round 8 took the earlier of the two; the path law then won, the contact fired with
          // the centres still 62.02 mm apart, and seating the pair at that instant TELEPORTED
          // the follower 22.65 mm in one step (refuter 2, round 14, on the shipped
          // TEST-bend-90). Where a blend is in reach the 3-D scan is the only reading.
          tau = contactTime3(rear, front, H, justParted, kF);   // the member scanned is the TARGET, not the tail (order 23)
        } else if (tau > 0 && tau < Infinity) {
          // refine: the 3-D gap along both clusters' true motion (followers included)
          const gapAt = (x) => { const dsR = rear.v * x + 0.5 * rear.a * x * x; const dsF = front.v * x + 0.5 * front.a * x * x; const DR = Math.max(0, rf.D - dsR); const DF = memberDAfter(front, dsF, kF); return DR - seatD(rf.route, fb.route, DF); };
          for (let it = 0; it < 4; it++) {
            const g = gapAt(tau); if (Math.abs(g) < 1e-12) break;
            const dt = 1e-6; const slope = (gapAt(tau + dt) - g) / dt;
            if (!(slope < -1e-12)) break;
            const next = tau - g / slope; if (!(next >= 0) || !Number.isFinite(next)) break;
            if (Math.abs(next - tau) < 1e-12) { tau = next; break; }
            tau = next;
          }
        }
        consider(tau, 3, rf.id, 'contact', { rear, front, k: kF });
        }
      }
    }
    // separation (review round 8): a boundary the split guard held closed parts the instant
    // its 3-D gap would open — the chain is never a tensile link between two events
    for (const c of clusters) {
      if (c.wall || c.hold || c.members.length < 2 || (c.v === 0 && c.a === 0)) continue;
      consider(separateTime(c, H), 4, c.members[1].id, 'separate', { c });
      // Walker-step slicing (order 17, item 5): between events a piece holds the chain's acceleration
      // constant, while through a twist or an arc the Jacobians turn with every millimetre — the front of
      // the shipped obtuse 3-ball train read 13.06 mm/s off over one 174 ms piece (§20.8 item 1). The
      // walker already limits its own step by the geometry (half a radius on a curved segment, the segment
      // end on a line, no limit on a straight link); the piece is cut where the walk's first step ends, so
      // the acceleration is re-derived at the same cadence the seat mapping is followed. No constant:
      // the step is the walker's own.
      const h0 = chainStep(c);
      if (globalThis.__stepScan) globalThis.__stepScan.push({ t: +t.toFixed(4), id: c.members[0].id, n: c.members.length, v: +c.v.toFixed(4), a: +c.a.toFixed(4), h0: Number.isFinite(h0) ? +(h0 * 1e3).toFixed(3) : 'inf' });
      if (Number.isFinite(h0) && h0 > 1e-9) { const dir = c.v > 0 || (c.v === 0 && c.a > 0) ? 1 : -1; const tau = firstCrossing(h0, dir * c.v, dir * c.a); if (tau > EPS_T && tau < Infinity) consider(tau, 4, c.members[0].id, 'step', { c }); }
    }
    };
    scanHorizon(H0);
    // merge windows (review r4 P2-1, junction half): a cluster approaching a junction
    // stops one ball length before it while a ball of ANOTHER branch is inside the
    // window; a held cluster is released once the window is clear
    for (const c of clusters) {
      if (c.wall || c.hold) continue;
      if (c.v === 0 && c.a === 0) continue;
      const f = c.members[0];
      const jn = nextJunction(f);
      const back = c.v < 0 || (c.v === 0 && c.a < 0);
      // A verdict at this merge holds while the ball stays at or inside its approach; a ball shoved BACK above its
      // yield line (a reversed catch at an obtuse merge, order 16) approaches again and is asked again — without
      // this a feeder ball returning from a recoil rolls into a window a trunk ball had been released into (a
      // custom reversed 135° merge: 28.14 mm between drawn balls). ONE ordering: the invalidation is the first
      // thing this scan does to a cluster, BEFORE the reverse-motion branch's own `continue` (#737 companion 2,
      // class B). It is a reverse-motion rule — every cluster it can fire on takes that branch — so sited after
      // it, as it was, it never ran: the grant survived the recoil, the ball skipped the occupied-window check on
      // the way back down and merged into an occupied window (review round 12 P2, contract §26.5). Order 23b round
      // 2's velocity clause stays exactly as it was: a ball rolling FORWARD keeps its verdict, or the yield re-asks
      // at τ = 0 for ever (`r53` F2). The two conditions are disjoint — this one wants the ball ABOVE its line, the
      // back branch's own re-ask below it — so the ordering decides only whether the reset happens, never a race.
      if (back && jn && c.passedYield === jn.Db && f.D > jn.Dy + 1e-9) c.passedYield = null;
      if (back) {                                           // moving BACK: a merge below it is not ahead of it (order 16 round 4, refuter B's item 1 — a recoiled ball was "yielded" and held INSIDE the window)
        // …but a ball already BELOW where it would stand — inside a resting ball's sphere (a seeded or
        // carried overlap) — stands there now, whichever way it moves (round 6, `r31`)
        if (jn && f.D < jn.Dy - 1e-9 && c.passedYield !== jn.Db) { const { S } = standStation(f, jn); if (Number.isFinite(S) && f.D < S - 1e-9) consider(0, 2, f.id, 'yield', { c, jn, inside: true }); }
        continue;
      }
      if (!jn) continue;
      const Dy = jn.Dy; // the chord-aware hold station of this route at that merge (track.js)
      if (c.passedYield === jn.Db) continue;
      // Already at or inside its approach without a verdict (a recoil that turned round in it, a
      // re-seeded continuation): past the point of waiting — COMMITTED; the contact law (cross-branch
      // included, order 16 round 4) owns it from here. Round 4 committed only the window itself
      // [Db, Db + 2r] and let a ball inside the chord band (Db + 2r, Dy] "decide now" — hold where it
      // stood. The yield line is the station from which a passing trunk ball clears the held ball by
      // one diameter in 3-D; a hold granted BELOW it is short of that clearance by construction, and
      // the held cluster is exempt from the contact scan — on the shipped TEST-obtuse-merge a ball
      // that turned round 1.3 mm below its yield line was held there and the trunk train passed it at
      // 56.09 mm (refuter B's `recoil.mjs` seeding, order 16 round 5). Nothing holds a ball in a chute
      // but another ball: committed, it rolls, and the 3-D contact with the passing ball is what stops
      // or recoils it. A ball standing ON its yield line without a verdict (a carried holder: the
      // ledger keeps a rest's station, not its hold) is asked at once — it holds if the window is
      // occupied and rolls on if not; that station is the one the clearance was derived for.
      // Round 6: where the ball STANDS is the highest of its line and the seat behind every resting
      // occupant (`standStation`); inside the approach the line no longer applies and only a resting
      // occupant can stop it — with none it is committed and the contact law owns it.
      const { S } = standStation(f, jn);
      if (f.D < Dy - 1e-9) {                                    // inside the approach, no verdict yet
        if (!Number.isFinite(S)) { c.passedYield = jn.Db; continue; }
        if (f.D <= S + 1e-9) { consider(0, 2, f.id, 'yield', { c, jn, inside: true }); continue; }
        consider(firstCrossing(f.D - S, c.v, c.a), 2, f.id, 'yield', { c, jn, inside: true }); continue;
      }
      const stand = Number.isFinite(S) ? Math.max(Dy, S) : Dy;
      if (f.D <= stand + 1e-9) { consider(0, 2, f.id, 'yield', { c, jn }); continue; } // on its line (a carried holder), or already below where it should stand: asked at once
      consider(firstCrossing(f.D - stand, c.v, c.a), 2, f.id, 'yield', { c, jn });
    }
    for (const c of clusters) {
      if (!c.hold) continue;
      const f = c.members[0];
      if (c.hold.blockedBy) {                                   // standing against a resting ball of a queue backed up through the junction (round 6): released when that ball's cluster moves
        const o = c.hold.blockedBy.cluster;
        if (o && o !== c && (o.wall || o.hold || (o.v === 0 && o.a === 0))) continue;
        consider(0, 5, f.id, 'release', { c }); continue;
      }
      const occ = windowOccupants(f, c.hold.after, c.hold.sJ);
      if (!occ.length) { consider(0, 5, f.id, 'release', { c }); continue; }
      // every occupant itself a holder for this point (each waits for the other): the HIGHEST id is released and
      // becomes the moving occupant the others wait behind — the event tie-break's own order, the lower id yields
      // (order 17 item 2b; review r4 P2-1's e7)
      if (occ.every(({ o }) => o.hold && o.hold.after === c.hold.after && Math.abs(o.hold.sJ - c.hold.sJ) < 1e-9) && occ.every(({ m }) => f.id > m.id)) { consider(0, 5, f.id, 'release', { c }); continue; } // the LOWER id yields (review r4 P2-1, e7): the higher id goes first
      let tau = 0, moving = 0;
      for (const { m, o, Dj, far } of occ) {
        // a fellow holder for this same point is not a block on the booking: it stands still by the hold law, and
        // once the moving occupants are through the id rule above orders the two (order 19, G4: with the holder
        // read as a resting occupant no release was booked at all and the window stayed clear until the next
        // unrelated event — 18 ms on TEST-y3-obtuse by continuations)
        if (o.hold && o.hold.after === c.hold.after && Math.abs(o.hold.sJ - c.hold.sJ) < 1e-9) continue;
        if (o.v === 0 && o.a === 0) { tau = Infinity; break; } // a resting occupant blocks until something moves it
        // (order 19, G4) the occupant leaves the window at the POINT: below it the two stand on one lane
        // (`canTouch` — the contact law's pair, exempt from the count), so the far edge Dj − 2r booked
        // through seal 18 was never the criterion that released a holder; it only deferred the release
        // to whatever event came next (TEST-y3-obtuse by continuations: b4 through the point at 0.5077,
        // b2 released at the next event, 0.5261 — 18 ms of a clear window). The release is booked a hair
        // AFTER the crossing (never at τ = 0: the handler re-reads the window and an unresolved τ = 0
        // answer is the 18c livelock) and the handler reads the window as it stands there.
        moving += 1;
        // …or leaves it UPWARD: a recoiled occupant (the graze this law admits) rolls back over the window's far edge and
        // has no downward crossing to book — refuter H (D3): b1 released 19.3 ms after b2 rose above its line, at an
        // unrelated walker instant. Both exits are booked; the earlier finite one wins
        const down = firstCrossing(m.D - Dj, o.v, o.a);
        const up = firstCrossing(far + EXPORT_GRAIN - m.D, -o.v, -o.a);
        tau = Math.max(tau, Math.max(Math.min(down, up), 2 * EPS_T));
      }
      if (!moving) continue;                                    // only fellow holders remain: the id rule above, at the higher id's release, orders them
      consider(tau, 5, f.id, 'release', { c });
    }
    // the adaptive second look: the winner is further out than the horizon the 3-D scans used,
    // so re-scan out to it — an event found now is earlier than the winner and replaces it
    if (best.tau > H0 + EPS_T && Number.isFinite(best.tau)) scanHorizon(best.tau);
    if (best.kind === null) break; // everything at rest, nothing pending
    // ---- advance to the event
    advance(t, best.tau);
    tCommitted = t; // the interval up to the previous event is committed motion
    t += best.tau;
    // ---- apply
    switch (best.kind) {
      case 'landing': {
        const p = best.payload;
        const b = balls.get(p.id);
        const total = b.route.total;
        // where does the ball actually land? On the free entry station, or — when the
        // queue's tail occupies the entry — one ball length behind that tail, still
        // under the cup (research R5). The FALL is re-aimed at that station (the same
        // ballistic law from the same cull point: the landing height moves by a few mm,
        // the landing time by a fraction of a millisecond), the contact with the tail is
        // an EVENT and the ball is never displaced after it has landed (review r4 P2-1).
        // A seat more than one ball length above the entry does not exist: the arrival
        // is REFUSED (an 'overflow'; the ball stays in the pocket as the sink left it —
        // culled) and is never extrapolated up the bag and through the bed (review 6).
        if (p.fromHold) { // a HELD owned ball whose seat appeared at p.tStart: its fall restarts from the hold pose (vDown 0)
          const hp = p.fromHold; hp.t1 = p.tStart;
          b.pieces.push({ kind: 'fall', t0: p.tStart, t1: t, x0: hp.x, z0: hp.z, yH: hp.y, vDown: 0, xE: p.h.xE, yE: p.h.yE, zE: p.h.zE, route: b.route, exitY: hp.exitY, above: hp.y + r > SINK_SHIELD_Y + 1e-9 }); // drawn above the shield as the hold was (class A)
          hb_release(b);
        }
        const fall = b.pieces.filter((q) => q.kind === 'fall').pop();
        const { ahead, tail, seatBehindTail, seatD0, tailMoving, firstDrawn } = seatFor(b, fall, t);
        let { seat } = seatFor(b, fall, t);
        if (seat && seat.t1 > t + EPS_T && !p.fromHold && (p.deferred ?? 0) < 4) {
          // (#737 r3 class A) the ball has NOT landed at this instant: an EARLY hand-off is dated at own.t and its fall to the
          // seat it is read for — the free entry, or a seat behind a moving tail — ends later. The landing is re-dated to that
          // ballistic instant and decided there (the seat read again then); the fall piece runs on to it, from the pose the
          // sink left the ball at, so the takeover is continuous. Bounded: a seat can only move HIGHER between two reads
          // (a shorter fall, an earlier instant), so one re-dating suffices; four is the guard.
          p.deferred = (p.deferred ?? 0) + 1;
          p.h = { ...p.h, tLand: seat.t1, ...(seat.free ? { vLand: seat.vLand, v0: seat.v0 } : {}) }; b.handoff = p.h; fall.t1 = seat.t1; // the free entry lands at its ballistic speed, not the own's rest
          pending.splice(pi, 1);
          let k = pi; while (k < pending.length && (pending[k].h.tLand < p.h.tLand || (pending[k].h.tLand === p.h.tLand && pending[k].id < p.id))) k++;
          pending.splice(k, 0, p);
          break;
        }
        if (!seat && b.handoff?.own && !p.fromHold) {
          // order 18 item 0: an OWNED arrival with no seat is HELD where the sink left it — on the queue, inside the
          // pocket — not refused: the module owns its drawing from tOwn (visible through the opening while its top is
          // above the shield line, the sink's own contract; culled inside the assembly; drawn below the exit), and it
          // lands as soon as a seat exists (re-checked at every scan). A held ball whose announced seat is gone again
          // at its landing instant (p.fromHold, no seat) falls through to the refusal below.
          // (#737 r3 class B) a hold is a BALL: it must clear every ball this solution draws or holds at this instant by one
          // diameter, to the EXPORT_GRAIN (0.1 mm — the exporter's own vertex rounding: an interpenetration below the grain the
          // geometry is quantised at is a rounding, not a contact, and the queue's resting tail sits 0.06 mm inside one diameter
          // of the sink's initial pose on the high fixture). Once the queue has reached the sink's initial pose the hand-off can read dt = 0 with the incoming ball
          // already INSIDE a held one (eleven pots into pocket 4 on the high fixture: balls 10 and 11 at identical coordinates);
          // no non-overlapping hold exists there, so the arrival takes the overflow path — culled from its own instant, the
          // refusal named on the event (never a second visible ball drawn inside the first)
          let blockedBy = null, blockedMm = 0;
          for (const hb of held) { const hp = hb.pieces[hb.pieces.length - 1]; if (hp.kind !== 'hold' || hb.id === b.id) continue; const d = Math.hypot(fall.x0 - hp.x, fall.yH - hp.y, fall.z0 - hp.z); if (d < 2 * r - EXPORT_GRAIN && (blockedBy === null || d < blockedMm)) { blockedBy = hb.id; blockedMm = d; } }
          for (const oc of clusters) for (const m of oc.members) { if (m.id === b.id) continue; const st = stationAt(m.route, m.D, r, {}); const d = Math.hypot(fall.x0 - st.x, fall.yH - st.y, fall.z0 - st.z); if (d < 2 * r - EXPORT_GRAIN && (blockedBy === null || d < blockedMm)) { blockedBy = m.id; blockedMm = d; } }
          if (blockedBy !== null) {
            balls.delete(b.id);
            overflow.add(b.id);
            events.push({ kind: 'overflow', t, ball: b.id, runwayId: runwayOf({ route: b.route, D: total }), D: total, v: 0, reason: `no clear hold: the own pose lies ${((2 * r - blockedMm) * 1000).toFixed(1)} mm inside ball ${blockedBy}`, other: blockedBy });
            pi += 1;
            break;
          }
          fall.t1 = t;
          b.pieces.push({ kind: 'hold', t0: t, t1: Infinity, x: fall.x0, y: fall.yH, z: fall.z0, route: b.route, exitY: fall.exitY });
          held.push(b);
          events.push({ kind: 'hold', t, ball: b.id, runwayId: null, D: total, v: 0 });
          pi += 1;
          break;
        }
        if (!seat) {
          balls.delete(b.id);
          overflow.add(b.id);
          events.push({ kind: 'overflow', t, ball: b.id, runwayId: runwayOf({ route: b.route, D: total }), D: total, v: 0 });
          pi += 1;
          break;
        }
        if (seat.st && seat.t1 < tCommitted - EPS_T) {
          // the ballistic landing instant lies BEFORE the last committed event on this base:
          // the interval is solved motion and nothing may be written into it (review r7 P2 —
          // a ride written back across an event produced overlaps with balls whose motion
          // was already final). The fall ends at its own ballistic instant aimed at the seat
          // this event decides; the ball then stays CULLED (inside the pocket, on the queue)
          // until this instant and takes its seat here
          // …and the fall ends no later than the instant the ball would first be drawn: a perch
          // that began after that instant flickered the ball drawn → hidden → drawn (review round 9)
          fall.t1 = Math.max(fall.t0, Math.min(seat.t1, firstDrawn(fall)));
          fall.xE = seat.st.x; fall.yE = seat.st.y; fall.zE = seat.st.z; fall.D = seat.D;
          b.pieces.push({ kind: 'rest', t0: fall.t1, t1: t, D0: seat.D, v0: 0, a: 0, route: b.route, culled: true });
          seat.D = tailMoving ? seatBehindTail : seat.D;
        } else if (seat.st && seat.t1 < t - EPS_T && tailMoving) {
          // the re-aimed fall ends BEFORE this instant (a higher seat, a shorter fall) while
          // the tail keeps rolling — and after the last committed event, so the tail's motion
          // over [t1, t] is exactly its cluster's current kinematics: solve seat and landing
          // time together (the tail's own chain law run back by Δ = t − t1, to convergence)
          // and let the ball ride with the tail's cluster from t1 to t — touching it at t
          const kT = ahead.members.indexOf(tail);
          let Δ = t - seat.t1;
          let D1 = seatD0;
          let vT1 = Math.max(0, ahead.v - ahead.a * Δ);
          for (let k = 0; k < 40; k++) {
            vT1 = Math.max(0, ahead.v - ahead.a * Δ);
            const back = vT1 * Δ + 0.5 * ahead.a * Δ * Δ;        // the front's path displacement over Δ
            const tailD1 = memberDAfter(ahead, -back, kT);       // the tail's station at t1, through its chain
            const Dn = seatD(b.route, tail.route, tailD1);
            const st1 = stationAt(b.route, Dn, r, {});
            const dy1 = fall.yH - st1.y;
            if (!(dy1 > 0)) break;
            const tFree1 = (-fall.vDown + Math.sqrt(fall.vDown * fall.vDown + 2 * G * dy1)) / G;
            const t1 = fall.t0 + tFree1;
            const Δn = Math.max(0, t - t1);
            const done = Math.abs(Dn - D1) < 1e-10 && Math.abs(Δn - Δ) < 1e-10;
            D1 = Dn; Δ = Δn;
            seat = { D: D1, st: st1, t1, v0: st1.k * (fall.vDown + G * tFree1) * locate(b.route, D1).edge.sinTh };
            if (done) break;
          }
          fall.t1 = seat.t1;
          fall.xE = seat.st.x; fall.yE = seat.st.y; fall.zE = seat.st.z; fall.D = seat.D;
          if (Δ > EPS_T) {
            // the ride: from its landing instant to this event the ball is a FOLLOWER of the
            // tail's cluster (rank kT + 1): exactly one diameter behind the tail throughout
            const front0 = ahead.members[0];
            const back = vT1 * Δ + 0.5 * ahead.a * Δ * Δ;
            const lead = { D0: front0.D + back, v0: vT1, a: ahead.a, route: front0.route };
            const chain = ahead.members.slice(1, kT + 1).map((m) => m.route).concat([b.route]);
            b.pieces.push({ kind: 'roll', t0: seat.t1, t1: t, D0: seat.D, v0: vT1, a: ahead.a, route: b.route, runwayId: runwayOf({ route: b.route, D: seat.D }), follow: { lead, chain } });
          }
          seat.D = seatBehindTail; // touching the tail at this instant (the ride brings it exactly here)
        } else if (seat.st) { // re-aim the fall at the seat; it comes to rest there until this instant
          fall.t1 = Math.min(seat.t1, t);
          fall.xE = seat.st.x; fall.yE = seat.st.y; fall.zE = seat.st.z; fall.D = seat.D;
          if (t - fall.t1 > EPS_T) b.pieces.push({ kind: 'rest', t0: fall.t1, t1: t, D0: seat.D, v0: 0, a: 0, route: b.route });
        }
        b.D = seat.D;
        b.v = seat.v0;
        b.active = true;
        const c = { members: [b], v: seat.v0, a: 0, wall: false };
        b.cluster = c;
        clusters.push(c);
        events.push({ kind: 'landing', t, ball: b.id, runwayId: runwayOf(b), D: b.D, v: seat.v0 });
        if (tail && Math.abs(b.D - seatBehindTail) <= 1e-9) { // seated touching the tail: an inelastic contact, as an event
          const rwId = runwayOf(b);
          merge(ahead, c); // merge first, record the merged speed — the same convention as a rolling contact
          events.push({ kind: 'contact', t, ball: b.id, other: tail.id, runwayId: rwId, via: 'landing', D: b.D, v: seat.v0, vOut: ahead.v });
        }
        pi += 1;
        break;
      }
      case 'yield': {
        const { c, jn, inside } = best.payload;
        const f = c.members[0];
        c.passedYield = jn.Db;
        const occ = windowOccupants(f, jn.after, jn.sJ);
        if (!occ.length) break;                                   // the window is free: committed
        // every occupant a holder for this same point with a LOWER id: the lower id yields (review r4 P2-1, e7) and
        // this ball crosses — no hold is taken, so no two fronts are ever released together (order 17 item 2b)
        if (occ.every(({ m, o }) => o.hold && o.hold.after === jn.after && Math.abs(o.hold.sJ - jn.sJ) < 1e-9 && m.id < f.id)) break;
        // the merge window is taken: stand at the highest of the line and the seat behind every resting
        // occupant (round 6); inside the approach only a resting occupant can stop the ball
        const { S, by } = standStation(f, jn);
        const stand = inside ? S : (Number.isFinite(S) ? Math.max(jn.Dy, S) : jn.Dy);
        if (!Number.isFinite(stand)) break;                       // inside, every occupant moving: committed — the contact law owns it
        if (f.D < stand - 1e-9) { f.D = stand; reseat(c); }       // below where it would have stopped (a carried or seeded overlap): it stands there
        // `line`: the yield line — a holder is exempt from the window count only when it stands at or above it;
        // `blockedBy`: a resting ball on the holder's own lane ahead of the queue's tail (the queue backed up
        // through the junction) — that hold releases when THAT ball's cluster moves, not when the window clears
        c.hold = { Db: jn.Db, after: jn.after, sJ: jn.sJ, Dy: stand, line: jn.Dy, blockedBy: (Number.isFinite(S) && stand === S) ? by : null };
        c.v = 0; c.a = 0;
        events.push({ kind: 'yield', t, ball: f.id, runwayId: runwayOf(f), D: f.D, v: 0, other: occ[0].m.id, heldBy: 'hold', members: c.members.map((m) => m.id) }); c.heldBy = 'hold'; // (order 23b, round 2 — refuter B, F6) a merge-window hold is a named rest; the whole held cluster is named by it
        break;
      }
      case 'release': {
        const { c } = best.payload;
        if (!c.hold) break;                                       // released already by an answer at this same instant
        if (!c.hold.blockedBy) {
          // (order 19, G4) the window is read again NOW: the booking read it at the scan, and a ball that entered the
          // window since (TEST-y3-obtuse by continuations: b4, a diameter behind b3, entered while b3's crossing was
          // the booked instant) keeps the hold — the scan after this event re-books from the window as it stands
          const f = c.members[0];
          const occ = windowOccupants(f, c.hold.after, c.hold.sJ);
          const sameHold = ({ o }) => o.hold && o.hold.after === c.hold.after && Math.abs(o.hold.sJ - c.hold.sJ) < 1e-9;
          const clear = !occ.length || (occ.every(sameHold) && occ.every(({ m }) => f.id > m.id));
          if (!clear) break;
        }
        c.hold = null;
        events.push({ kind: 'release', t, ball: c.members[0].id, runwayId: runwayOf(c.members[0]), D: c.members[0].D, v: 0 });
        break;
      }
      case 'boundary': {
        const { c, m, Db, up } = best.payload;
        // the runway just UPSTREAM of the break vs just downstream (the advance may
        // land D a rounding unit either side of Db)
        // ±1 µm [DESIGN guard]: evaluate the runway just up/downstream of the
        // boundary so a float-exact D lands on the right side; 1 µm is 4 orders
        // below the ball radius and 3 below the schema's 1 mm grain.
        const before = locate(m.route, up ? Math.max(0, Db - 1e-6) : Db + 1e-6).rw.id;
        // THE VERTEX IMPACT (order 16, item 1d — refuter 1's H7). At a break the crossing ball's
        // tangent turns, so every link Jacobian behind it jumps: J⁻ → J⁺. The riding chain cannot
        // keep both its speeds and the new constraint u_B = J⁺·u_A, and the reconciliation is an
        // IMPACT — derived, not chosen:
        //   · the only impulsive force between the two balls acts along the line of centres n̂
        //     (a frictionless ball–ball contact), +P·n̂ on the leader A and −P·n̂ on the follower B;
        //   · the rails' impulsive reactions are NORMAL to each ball's path (the path is the
        //     constraint the rail imposes), so they change no path speed;
        //   · along each path, with the effective masses μ = 1/k the module already folds into
        //     every drive:  μ_A (u_A⁺ − u_A⁻) = P·(n̂·T_A⁺),   μ_B (u_B⁺ − u_B⁻) = −P·(n̂·T_B);
        //   · the constraint after the vertex:  u_B⁺ = J⁺·u_A⁺,   J⁺ = (n̂·T_A⁺)/(n̂·T_B).
        // Eliminating P:  u_A⁺ = (μ_A u_A⁻ + μ_B J⁺ u_B⁻) / (μ_A + μ_B J⁺²)  — the generalised
        // momentum Σ μ_i G_i u_i is conserved with the NEW Jacobians. It is the same law the merge
        // uses (an inelastic catch is the same impulse), which is the check on the derivation. For
        // a chain of n the same elimination link by link gives Σ μ_i G_i⁺ u_i⁻ / Σ μ_i G_i⁺². Seal
        // 15 kept the leader's speed continuous and sent the follower's change into the rail:
        // exact for J⁺ → 1, 1.25 % low on the leader at the shipped bend-90 (J⁺ 0.0127), and at an
        // obtuse turn (J⁺ < 0) it left the follower's reversal with no reaction at all — the
        // leader kept 100 % where the impulse leaves it (1 + J⁺)/(1 + J⁺²): 53 % at the obtuse
        // fixture's 113.5° vertex, 2 % at 170°. A lone ball keeps its speed through a vertex
        // (the rail's reaction is normal to its path); only a riding pair exchanges momentum.
        let uPre = null;
        m.D = Db;                                          // the crossing member snaps to the break
        if (c.members[0] === m) reseat(c);                 // followers are derived from the front
        if (c.members.length >= 2) {
          // the chain's speeds just before the crossing: the crossing member read on its INCOMING
          // side by an explicit side override (a station offset cannot express it — the seat solve
          // puts the member back on the break, where the side rule reads the outgoing piece)
          const sides = c.members.map(() => 0); sides[c.members.indexOf(m)] = up ? 1 : -1;
          const dynPre = chainDyn(c.members, c.members[0].D, c.v, null, sides, parentOf(c));
          uPre = dynPre.G.map((g) => g * c.v);
        }
        if (uPre) {
          const dynPost = chainDyn(c.members, c.members[0].D, c.v, null, null, parentOf(c));
          let num = 0, den = 0;
          for (let i = 0; i < c.members.length; i++) { num += dynPost.mu[i] * dynPost.G[i] * uPre[i]; den += dynPost.mu[i] * dynPost.G[i] * dynPost.G[i]; }
          let vNew = num / den;
          if (globalThis.__impactDbg) console.log('  impact calc: uPre', uPre.map((x) => x.toFixed(5)).join(','), 'G+', dynPost.G.map((x) => x.toFixed(5)).join(','), 'mu', dynPost.mu.map((x) => x.toFixed(3)).join(','), 'vNew', vNew);
          // A REVERSAL is a stop against the corner (order 16 round 4, refuter A's item 3). When the
          // impulse solution would send the crossing chain back the way it came (u_A⁺ opposite to the
          // crossing — for equal masses and a straight approach, 1 + (n−1)J⁺ < 0), the chain does not
          // enter the exit side at all, so the exit-side constraint it was solved with does not hold;
          // the consistent rigid outcome is the train stopped against the corner rail, its momentum
          // into the rail. Booking the reversal instead drew the chain moving back with J read on the
          // exit side (KE ×2.74 against the law's own post-state on the shipped obtuse 4-ball train)
          // and a Zeno of impact / turn pairs. The settle that follows reads the rest test on the
          // exit side: a jam where the followers' drive through J⁺ < 0 outweighs the front's own.
          const crossDir = up ? -1 : 1;
          if (Number.isFinite(vNew) && vNew * crossDir < 0) vNew = 0;
          if (Number.isFinite(vNew) && Math.abs(vNew - c.v) > 1e-12) {
            events.push({ kind: 'impact', t, ball: m.id, runwayId: runwayOf(m), D: m.D, v: c.v, vOut: vNew, members: c.members.map((x) => x.id) });
            c.v = vNew;
          }
        }
        let after = locate(m.route, up ? Db + 1e-6 : Math.max(0, Db - 1e-6)).rw.id;
        if (BACK_THROUGH_JUNCTION && up && after !== before) {
          // ORDER 18 ITEM 2 — a ball pushed BACKWARD through a junction continues on the rail it is on. Moving up, `before`
          // is the runway under the ball (the trunk) and `after` its own route's feeder; the rail under it does not change
          // at the point. Two cases, both the geometry's: (1) the trunk continues above the point (the landing is
          // mid-runway) → the ball's route becomes the route that owns the trunk from its head, at the same physical
          // station — no seat root 69 mm up a feeder it is not on (§21.4); (2) the point is the trunk's first vertex — a
          // FORK NOSE where the two rails diverge and neither carries a centre-line ball → the chain is stopped there
          // (inelastic, as at the wall and the corner jam), then rolls down again under its own drive.
          const spB = m.route.spans.find((x) => x.rw.id === before);
          const sHere = spB ? spB.sStart : 0;
          const owner = spB && sHere > 1e-9 ? [...track.routes.values()].find((rt) => rt.spans.some((x) => x.rw.id === before && x.sStart < 1e-9)) : null;
          if (owner && owner !== m.route) {
            const Pm = stationAt(m.route, m.D, r, {}); const Dn = projectOnto(owner, [Pm.x, Pm.y, Pm.z], stationD(owner, before, sHere));
            if (Number.isFinite(Dn)) { m.route = owner; m.D = Dn; after = before; reseat(c); } // the followers re-seated behind the re-routed member's physical point (the two routes' centrelines differ by the corner cut, 0.2 mm here)
          } else if (!owner) {
            events.push({ kind: 'stop', t, ball: m.id, runwayId: before, D: m.D, v: c.v, fork: true });
            c.v = 0;
            break;
          }
        }
        if (after !== before) {
          events.push({ kind: 'junction', t, ball: m.id, from: before, runwayId: after, D: m.D, v: c.v });
          c.passedYield = null;
          // no position patch here (review r4 P2-1): the yield law kept the merge window
          // clear; a residual overlap (numerical) is counted, never hidden
          for (const o of clusters) {
            if (o === c) continue;
            for (const n2 of o.members) {
              if (Math.abs(n2.D - m.D) < 2 * r - 1e-6 && (canTouch(m, n2) || canTouch(n2, m))) junctionOverlaps += 1;
            }
          }
        }
        break;
      }
      case 'wall': {
        const { c } = best.payload;
        c.members[0].D = r;
        reseat(c);
        c.v = 0; c.a = 0; c.wall = true; c.heldBy = 'wall';
        events.push({ kind: 'wall', t, ball: c.members[0].id, runwayId: restIdOf(c.members[0]), D: r, v: 0, heldBy: 'wall', members: c.members.map((m) => m.id) }); // the tray's end wall: a seat by construction (order 23b: every rest named — the whole queue by the wall event)
        break;
      }
      case 'selfcontact': {
        const { c, i, j } = best.payload;
        if (clusters.includes(c) && c.members.length > Math.max(i, j)) selfContact(c, i, j);
        break;
      }
      case 'contact': {
        const { rear, front } = best.payload;
        const k = Number.isFinite(best.payload.k) ? best.payload.k : front.members.length - 1;
        // roles captured BEFORE the merge re-orders the members (review r2 P2-3):
        // `ball` = the moving rear ball that strikes, `other` = the struck front ball (the member touched — order 23)
        const mover = rear.members[0];
        const struck = front.members[k];
        const vIn = rear.v;
        const runwayId = runwayOf(mover);
        const heldFront = front.wall ? 'wall' : front.hold ? 'hold' : (front.heldBy === 'corner' && front.v === 0) ? 'corner' : null;
        merge(front, rear, k);
        events.push({ kind: 'contact', t, ball: mover.id, other: struck.id, runwayId, D: mover.D, v: vIn, vOut: front.v });
        if (heldFront) { events[events.length - 1].heldBy = heldFront; front.heldBy = heldFront; }   // a catch onto a walled / held queue rests with it (order 23b: every rest named)
        break;
      }
      case 'resume': {
        // a continuation dated at this instant (round 22d): seated now by the same law as at the base's start; the re-settle follows
        seatContinuation(best.payload); ri += 1;
        events.push({ kind: 'resume', t, ball: best.payload.id, runwayId: runwayOf(balls.get(best.payload.id)), D: best.payload.D, v: best.payload.v });
        break;
      }
      case 'step': {
        // a walker step end: nothing to move — the re-settle below re-derives the chain's acceleration there
        const { c } = best.payload; c.lastStepT = t; steps.push({ t, ball: c.members[0].id });
        if (globalThis.__stepDbg) globalThis.__stepDbg.push({ t, id: c.members[0].id, n: c.members.length, D: c.members.map((m) => +(m.D * 1e3).toFixed(2)), h0: +(chainStep(c) * 1e3).toFixed(3) });
        break;
      }
      case 'separate': {
        // nothing to move: the re-settle below re-runs the split test with the link now tensile,
        // and names the parting there (a scan instant that turns out not to part emits nothing)
        const { c } = best.payload;
        c.lastSeparateT = t;
        break;
      }
      case 'fold': {
        // the settle that follows this instant reads dyn.fold at the link and parts the chain (order 18 item 2)
        break;
      }
      case 'stop': {
        const { c } = best.payload;
        c.v = 0;
        events.push({ kind: 'stop', t, ball: c.members[0].id, runwayId: runwayOf(c.members[0]), D: c.members[0].D, v: 0 });
        break;
      }
      case 'ceiling': {
        const { c } = best.payload;
        c.members[0].D = c.members[0].route.total;
        reseat(c);
        c.v = 0;
        events.push({ kind: 'ceiling', t, ball: c.members[0].id, runwayId: runwayOf(c.members[0]), D: c.members[0].D, v: 0 });
        break;
      }
      case 'turn': {
        // a backward roll has spent itself: the ball is at rest for an instant and its resistance
        // now opposes the forward roll gravity starts (order 16); the re-settle below decides
        const { c } = best.payload;
        c.v = 0;
        events.push({ kind: 'turn', t, ball: c.members[0].id, runwayId: runwayOf(c.members[0]), D: c.members[0].D, v: 0 });
        break;
      }

      default: break;
    }
    settleClusters();
  }
  // a runaway solve is an ERROR, never a silently truncated train (the caller
  // — index.js ensureSolution — catches it, leaves the record to the sink and
  // reports once on scripted boots)
  if (n > maxEvents) { const err = new Error(`ball-return solve exceeded ${maxEvents} events (MAX_EVENTS) — refusing a truncated solution`); err.tail = events.slice(-40).map((e) => `${e.kind}@${e.t.toFixed(6)}:${e.ball}${e.other != null ? '/' + e.other : ''}`); err.partial = { pieces: new Map([...balls.values()].map((b) => [b.id, b.pieces])), events: events.slice(), r, t }; throw err; } // `partial`: the truncated motion, for diagnosis only (never a solution)
  // close every ball with an open rest piece and compute per-piece orientation
  const rest = new Map();
  for (const b of balls.values()) {
    const last = b.pieces[b.pieces.length - 1];
    if (last && last.kind === 'hold' && last.t1 === Infinity) { // held where the sink left it (order 18 item 0): not a route rest
      for (const p of b.pieces) { p.q0 = b.qIn ?? b.qStart ?? Q_ID; if (p.kind !== 'roll') { p.axis = [0, 0, 1]; p.rho = r; } } // a held ball keeps the orientation it arrived with (class C)
      continue;
    }
    if (!(last && last.kind === 'rest' && last.t1 === Infinity)) {
      b.pieces.push({ kind: 'rest', t0: t, t1: Infinity, D0: b.D, v0: 0, a: 0, route: b.route });
    }
    rest.set(b.id, b.D);
    // (#737 review r2, class C) the orientation the roll starts from: a ball that was HIDDEN on its way in — its top passed the
    // shield line (the sink's cull) before it landed, so the pocket assembly covered it — is reset to the rack base there, as
    // spec §6 states; a ball that never hid (an early own above the shield, the high fixtures) keeps the orientation it arrived
    // with and rolls on from it. The predicate is the cull's own: hidden ⇔ yLand + r ≤ SINK_SHIELD_Y. Fall and hold pieces
    // always carry the incoming orientation (poseAt applies the same predicate frame by frame).
    const lastFall = b.pieces.filter((x) => x.kind === 'fall').pop();
    const hiddenOnTheWay = !!lastFall && Number.isFinite(lastFall.yE) && lastFall.yE + r <= SINK_SHIELD_Y;
    let q = b.qStart ?? ((b.qIn && !hiddenOnTheWay) ? b.qIn : Q_ID);
    for (const p of b.pieces) {
      p.q0 = (p.kind === 'fall' || p.kind === 'hold') ? (b.qIn ?? q) : q;
      if (p.kind !== 'roll') { p.axis = [0, 0, 1]; p.rho = r; continue; }
      const loc = locate(p.route, sideD(p.route, p.D0));
      const der = derivedFor(p.route.track, loc.rw.support, r);
      p.axis = loc.edge.axis;
      p.rho = der.rho;
      const tau = p.t1 - p.t0;
      // the distance THIS ball covers on the piece, not the piece's quadratic: a
      // follower is seated one diameter behind the ball ahead (pieceD chains
      // seatBehind), so through a bend it travels a different arc from its leader's
      // v0·τ + ½·a·τ² (review r10 P2-2: the closing loop used the quadratic, so the
      // next piece opened from a q0 that disagreed with the pose poseAt draws at the
      // boundary — a visible snap and a wrong carried rest orientation). Identical to
      // the (D0 − D)/rho poseAt and continuationAt use inside the piece.
      const ds = p.D0 - pieceD(p, tau, r);
      q = qmul(qaxis(p.axis, ds / p.rho), q);
    }
  }
  events.forEach((e, i) => { e.seq = i; });
  // ---- fall visibility (verification round 9): a falling ball is DRAWN only from the instant
  // its centre stays one diameter clear of every other drawn ball through to its landing. The
  // fall is aimed at a seat that touches the tail AT the landing instant (or at the free entry
  // one diameter from a resting tail); while the ball still descends, its horizontal travel is
  // short of the seat and the tail may be nearer — the drawn end of the fall (its last ~4 ms
  // below the pocket exit) then sat 1.3–1.8 mm inside the tail. Nothing about the motion
  // changes: the pose is withheld (`tShow`) until every sample from it to the landing is clear,
  // and a fall that is never clear before it lands appears AT its seat (its contact instant) —
  // which is every fall that seats touching a tail: its distance to the tail reaches 2r only
  // AT the landing, so its whole drawn end (5.5–5.6 ms on the pool fixtures) is withheld.
  // Falls are settled LATEST FIRST against the FINAL pieces of every other ball (all motion
  // is committed here): a later fall judges an earlier one drawn from the exit rule (a
  // superset of what is drawn — conservative), and the earlier fall then sees the later one's
  // final withholding, so the first ball of a dense pair still falls in while the second waits.
  {
    const view = { pieces: new Map([...balls].map(([id, b]) => [id, b.pieces])), r };
    const H = 1e-5;                // 10 µs sample: the measured relative speed of a drawn fall and another drawn ball is ≤ 3.1 m/s (≤ 31 µm between samples)
    const CLEAR = 2 * r + 1e-4;    // …so a 0.1 mm clearance at the samples is one diameter everywhere between them (tolerates 20 m/s)
    const NEAR = 2 * r + 0.05;     // only balls within 2r + 5 cm of the landing seat can be inside one diameter during the last ms
    const a = {}, q = {};
    const falls = [...balls.values()].filter((b) => b.pieces[0] && b.pieces[0].kind === 'fall').sort((x, y) => (y.pieces[0].t1 - x.pieces[0].t1) || (x.id - y.id));
    for (const b of falls) {
      const f = b.pieces[0];
      const tD = fallFirstDrawn(f, r);
      if (!(f.t1 > tD + H)) continue; // never drawn as a fall (a culled perch / a fall inside the pocket): nothing to withhold
      const near = [];
      for (const [id, o] of balls) {
        if (o === b) continue;
        const qo = poseAt(view, id, f.t1, q);
        if (qo && Math.hypot(qo.x - f.xE, qo.y - f.yE, qo.z - f.zE) <= NEAR) near.push(id);
        else if (!qo) near.push(id); // not drawn at the landing (its own fall, or culled): judged sample by sample
      }
      if (!near.length) continue;
      let tShow = tD;
      const clearAt = (tau) => {
        if (!poseAt(view, b.id, tau, a)) return null;  // above the exit rule already
        for (const id of near) {
          const qo = poseAt(view, id, tau, q);
          if (qo && Math.hypot(qo.x - a.x, qo.y - a.y, qo.z - a.z) < CLEAR) return false;
        }
        return true;
      };
      // the last instant before the landing itself (a candidate whose pieces begin inside the
      // final 10 µs — a continuation cut there — would otherwise go unsampled)
      if (clearAt(f.t1 - 1e-7) === false) { f.tShow = f.t1; continue; }
      for (let tau = f.t1 - H; tau >= tD; tau -= H) { // back from the landing: the latest violation decides
        const c = clearAt(tau);
        if (c === null) break;
        if (c === false) { tShow = tau + H; break; }
      }
      if (tShow > tD) f.tShow = tShow;
    }
  }
  events.sort(compareEvents);
  // THE POSE LAW, as a REFUSAL (track.js `poseClearance` / `refusePose`; GH-770 review r4, class W,
  // arm W6). It withdraws the r3 belt's deviation 3 — "the pose is reported here and refused
  // nowhere" — which stood on an unmeasured magnitude, and this round found the geometry that lived
  // in it: a ball seated 2.535 mm inside the floor it had just come down, on a route that read long
  // and validated clean. The intrusion of a centre path into its own ride is EXTREMAL AT THE SEGMENT
  // BOUNDARIES (a normal offset is affine along a line and along a cut, a twist's is deepest at its
  // vertex end, a pivot arc's is zero), so each route this solution walks is read there — exactly,
  // once, whatever poses this particular shot visits — and every station it seats a ball at is read
  // on top of that, the seats above the route's own total (a ball queued upstream of the entry,
  // extrapolated along the entry line) included.
  {
    const at = (route, D) => { stationAt(route, D, r, ptTmp); refusePose(route, D, ptTmp, 'solveShot'); };
    const done = new Set();
    for (const b of balls.values()) {
      for (const p of b.pieces) {
        if (!p.route || p.kind === 'fall' || p.kind === 'hold') continue;
        if (!done.has(p.route)) { done.add(p.route); for (const sg of p.route.segs) { at(p.route, sg.D0); at(p.route, sg.D1); } }
        at(p.route, p.D0);
        if (Number.isFinite(p.t1)) at(p.route, pieceD(p, p.t1 - p.t0, r));
      }
    }
  }
  // `order` is by ball id (not insertion order) so the id-bound pin buffer does not
  // change when the solver's internal seating order is refactored (seal 4)
  return { pieces: new Map([...balls].map(([id, b]) => [id, b.pieces])), events, steps, rest, tEnd: t, r, track, overflow, held: held.map((b) => b.id), junctionOverlaps, resumed, // `steps`: the walker-step instants (order 17 item 5) — settle instants with no event of their own; arms that exclude event neighbourhoods exclude these too
    // the solve's own work meter against the DERIVED budget above: `degradations` names every pair
    // the budget resolved at a coarser bracket (empty on every shipped fixture — the node arm walks
    // them all and asserts it), `walk.steps` is what this solve actually spent
    degradations, walk: { steps: walkSteps - walkStart, refine: refineSpent, escalations: refineEsc, budget: walkBudget },
    order: [...balls.keys()].sort((a, b) => a - b) };
}

// ---------------------------------------------------------------- lookup

/** The instant a falling ball would first be DRAWN by the exit rule (its top below the
 * pocket exit) — the fall's own ballistics; a hair early so the boundary frame is inside. */
function fallFirstDrawn(f, r) {
  if (!Number.isFinite(f.exitY)) return f.t0;
  const dyV = f.yH - (f.exitY - r);
  return dyV > 0 ? f.t0 + (-f.vDown + Math.sqrt(f.vDown * f.vDown + 2 * G * dyV)) / G - 1e-6 : f.t0;
}
const stTmp = {};
const followTmp = {};
/** D of a piece at τ after its start: a rest holds; a free roll is its quadratic; a
 * FOLLOWER (a cluster member behind its front) is seated one diameter (3-D) behind the
 * ball ahead, chained from the front's quadratic (review r6 P2). */
const chainCache = new WeakMap(); // lead → { tau, D: [rank 0, 1, …] } — a frame poses every member of a cluster at one t
/**
 * The stations of a contact chain after its front advances by `ds` (signed) along its path, each
 * follower's seat followed CONTINUOUSLY from `D0s` (order 16, item 1c). Behind a leader rounding an
 * obtuse turn the follower's root moves the OTHER way (J < 0) and the seat equation has several
 * roots; a Newton started from a rigid-train guess lands on the wrong one (a custom reversed 135°
 * merge drew a follower 71 mm away in one step, with no event). So the advance is walked in steps
 * of at most half a radius, each follower's hint being its previous root moved by its own Jacobian
 * over the step (a first-order continuation of the branch), and Newton from there. A step whose
 * root has vanished (NaN from `seatBehind`) is a fold: the walk records it and carries the hint.
 * `routes[0]` is the front's route, `D0s[0]` its station; the return has `D` (stations) and `fold`.
 */
const walkTan = {}; const walkTanB = {}; const walkPt = {};
/** One step of the walk from stations `D` (mutated) by at most `remaining` of front travel; returns the
 * signed front travel taken. `fold` is set where a follower's root vanished. */
const CHAIN_PAR = new Map(); // n → [−1, 0, 1, …] (the list's parent array), shared
const chainPar = (n) => { let p = CHAIN_PAR.get(n); if (!p) { p = new Array(n); for (let i = 0; i < n; i++) p[i] = i - 1; CHAIN_PAR.set(n, p); } return p; };
/** Are the follower and its leader on the SAME LANE at this instant — the same route, or both standing on one runway? Only then
 * is the leader's D a floor under the follower's seat root: "behind" means a larger station on that lane (order 23, review r12 P1 /
 * §27.2). On a cross-route link D[parent] is a station on ANOTHER axis, and it is not enough that the two routes share a runway
 * somewhere: with the leader on the trunk above the point and the follower on its feeder, both one radius-pair from the point, the
 * seat root sits a micron BELOW the leader's station number (J = −1, the symmetric V) — the route-level test kept the floor, the
 * walker read NaN, and the fold parted a pair the bounce test would have kept, every microsecond (the r45 seeding-A livelock:
 * 591 events in 0.3 ms). The floor holds exactly where its reading holds: the follower's own station on the leader's runway. */
const sharedLane = (routeB, DB, routeA, DA) => routeB === routeA || locate(routeB, Math.max(0, DB - 1e-9)).rw === locate(routeA, Math.max(0, DA - 1e-9)).rw;
function walkStep(routes, D, fold, remaining, r, parent = null) {
  const n = routes.length; const sgn = remaining >= 0 ? 1 : -1; const par = parent ?? chainPar(n);
  walkSteps += 1;
  if (globalThis.__walkStats) { const W = globalThis.__walkStats; W.steps += 1; W.members += n; if (W.limit && W.steps > W.limit) { const err = new Error('WALK BUDGET'); err.info = { n, remaining, D: D.slice(0, 6).map((x) => +(x * 1e3).toFixed(4)), fold: fold.slice(0, 6) }; throw err; } }
  // the link Jacobians at the current stations (the follower's root moves by J × the leader's move)
  const J = [1];
  for (let i = 1; i < n; i++) {
    const p = par[i];
    stationAt(routes[p], D[p], r, walkPt); const ax = walkPt.x, ay = walkPt.y, az = walkPt.z;
    stationAt(routes[i], D[i], r, walkPt);
    const nx = ax - walkPt.x, ny = ay - walkPt.y, nz = az - walkPt.z;
    tangentAt(routes[p], D[p], walkTan, sgn); tangentAt(routes[i], D[i], walkTanB, sgn);   // on the side of the motion (order 16)
    const nA = nx * walkTan.tx + ny * walkTan.ty + nz * walkTan.tz, nB = nx * walkTanB.tx + ny * walkTanB.ty + nz * walkTanB.tz;
    J[i] = Math.abs(nB) > 1e-9 * 2 * r ? nA / nB : 0;
  }
  // The step is set by the geometry, not by a constant: on a straight segment a root moves linearly
  // with its leader and one step to the segment's end is exact; on a twist or an arc (a tangent that
  // turns along the segment) the step is half a radius. Each step is the least of its members' limits;
  // a member standing on a boundary reads the segment it is about to travel, so no step stalls there.
  let hMax = Math.abs(remaining);
  for (let i = 0; i < n; i++) {
    const g = i === 0 ? 1 : J[i];
    const dir = sgn * (g >= 0 ? 1 : -1);
    const loc = locate(routes[i], Math.max(0, D[i] - dir * 1e-9));
    // a curved segment, or a link whose Jacobian is not 1 — the members on different lines, across a
    // vertex — has a contact normal that turns with the advance: the step is half a radius there too
    // (order 17, item 5; the post-impact piece of the shipped obtuse train sat on two straight legs with
    // J −0.39 and walked 40 mm in one step)
    if (loc.seg.kind !== 'line' || (i > 0 && Math.abs(J[i] - 1) > 1e-9)) { hMax = Math.min(hMax, 0.5 * r); continue; }
    const toEnd = Math.max(0, dir > 0 ? (D[i] - loc.seg.D1) : (loc.seg.D0 - D[i]));
    const lim = Math.abs(g) > 1e-9 ? (toEnd + 1e-9) / Math.abs(g) : Infinity;
    hMax = Math.min(hMax, Math.max(lim, 1e-4 * r));
  }
  const h = sgn * Math.min(Math.abs(remaining), hMax);
  D[0] = Math.max(0, D[0] - h);
  const moveOf = new Array(n); moveOf[0] = h;                 // each member's own move this step — the hint of the members seated behind it
  for (let i = 1; i < n; i++) {
    const p = par[i];
    const hint = D[i] - J[i] * moveOf[p];
    stationAt(routes[p], D[p], r, walkPt);
    const Di = seatBehind(routes[i], [walkPt.x, walkPt.y, walkPt.z], sharedLane(routes[i], D[i], routes[p], D[p]) ? D[p] : -Infinity, 2 * r, hint);
    if (Number.isFinite(Di)) { moveOf[i] = D[i] - Di; D[i] = Di; } else { fold[i] = true; moveOf[i] = J[i] * moveOf[p]; D[i] = hint; }
  }
  return h;
}
/**
 * The stations of a contact chain after its front advances by `ds` (signed) along its path, each
 * follower's seat followed CONTINUOUSLY from `D0s` (order 16, item 1c). Behind a leader rounding an
 * obtuse turn the follower's root moves the OTHER way (J < 0) and the seat equation has several
 * roots; a Newton started from a rigid-train guess lands on the wrong one (a custom reversed 135°
 * merge drew a follower 71 mm away in one step, with no event). So the advance is walked, each
 * follower's hint being its previous root moved by its own Jacobian over the step (a first-order
 * continuation of the branch), and Newton from there. A step whose root has vanished (NaN from
 * `seatBehind`) is a fold: the walk records it and carries the hint.
 */
const walkBlocked = (routes, D, remaining, r) => (remaining > 0 && D[0] <= 0) || (remaining < 0 && D[0] >= routes[0].total + 2 * r); // the front is at the wall (down) or above the top of its route (up): nothing moves
export function walkChain(routes, D0s, ds, r, parent = null) {
  const n = routes.length;
  const D = D0s.slice(); const fold = new Array(n).fill(false);
  if (n === 1) { D[0] = Math.max(0, D[0] - ds); return { D, fold }; }
  let remaining = ds;
  for (let guard = 0; guard < 200000 && Math.abs(remaining) > 1e-15 && !walkBlocked(routes, D, remaining, r); guard++) remaining -= walkStep(routes, D, fold, remaining, r, parent);
  return { D, fold };
}
/**
 * An INCREMENTAL walker over the same walk: `at(ds)` returns { D, fold } for a front advance of ds,
 * resuming from the snapshot taken at the last step END at or before ds (never from a mid-step
 * state, so every answer is the deterministic walk from D0s whatever the order of the queries).
 * The scans ask for many advances of one chain in one instant — this is what keeps them O(steps).
 */
export function makeWalker(routes, D0s, r, parent = null) {
  const n = routes.length;
  const snaps = [{ ds: 0, D: D0s.slice(), fold: new Array(n).fill(false) }]; // ascending ds ≥ 0; a separate list for ds < 0
  const snapsNeg = [{ ds: 0, D: D0s.slice(), fold: new Array(n).fill(false) }];
  const at = (ds) => {
    if (n === 1) return { D: [Math.max(0, D0s[0] - ds)], fold: [false] };
    const list = ds >= 0 ? snaps : snapsNeg; const a = Math.abs(ds); const sgn = ds >= 0 ? 1 : -1;
    let lo = 0, hi = list.length - 1;                                  // the last snapshot with |ds| ≤ a
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (list[mid].ds <= a + 1e-15) lo = mid; else hi = mid - 1; }
    const base = list[lo];
    const D = base.D.slice(); const fold = base.fold.slice();
    let done = base.ds;
    for (let guard = 0; guard < 200000 && a - done > 1e-15 && !walkBlocked(routes, D, sgn * (a - done), r); guard++) {
      const h = Math.abs(walkStep(routes, D, fold, sgn * (a - done), r, parent));
      done += h;
      if (a - done > 1e-15) list.push({ ds: done, D: D.slice(), fold: fold.slice() }); // a full step: remember it
    }
    return { D, fold };
  };
  return { at };
}
function pieceD(p, tau, r) {
  if (p.kind === 'rest') return p.D0;
  if (!p.follow) return Math.max(0, p.D0 - (p.v0 * tau + 0.5 * p.a * tau * tau));
  const L = p.follow.lead;
  const ds = L.v0 * tau + 0.5 * L.a * tau * tau;
  let cache = chainCache.get(L);
  if (!cache || cache.tau !== tau || cache.r !== r) { cache = { tau, r, D: [Math.max(0, L.D0 - ds)], routes: [L.route] }; chainCache.set(L, cache); }
  const chain = p.follow.chain; const hints = p.follow.hints;
  if (hints && hints.length >= chain.length && hints.every((x) => Number.isFinite(x))) {
    // the whole chain walked from the piece-start stations (order 16): every rank's root followed
    // continuously as the lead advances — cached per lead and τ like the straight chain below
    const key = chain.length;
    if (!cache.walk || cache.walk.n !== key || cache.walk.chain !== chain) {
      if (!p.follow.walker) p.follow.walker = makeWalker([L.route, ...chain], [L.D0, ...hints.slice(0, chain.length)], r);
      cache.walk = { n: key, chain, D: p.follow.walker.at(ds).D };
    }
    return cache.walk.D[chain.length];
  }
  for (let k = cache.D.length - 1; k < chain.length; k++) {
    const rt = chain[k];
    if (cache.routes[k + 1] && cache.routes[k + 1] !== rt) { cache.D.length = k + 1; cache.routes.length = k + 1; } // a different chain from this rank on
    if (cache.D[k + 1] !== undefined) continue;
    stationAt(cache.routes[k], cache.D[k], r, followTmp);
    cache.D[k + 1] = seatBehind(rt, [followTmp.x, followTmp.y, followTmp.z], cache.D[k], 2 * r);
    cache.routes[k + 1] = rt;
  }
  return cache.D[chain.length];
}
/**
 * Pose of ball `id` at time t → out {x, y, z, qx, qy, qz, qw, D, kind, runwayId}
 * or null before the ball's handoff (game.js is still posing it).
 */
/** The fall piece of a hand-off — the ONE builder (solveShot's pieces and V16's sweep read the same shape). */
export function fallPieceOf(h, r, route = h.route) {
  return { kind: 'fall', t0: h.tH, t1: h.tLand, x0: h.x0, z0: h.z0, yH: h.yH,
    vDown: h.vDown, xE: h.xE, yE: h.yE, zE: h.zE, route,
    exitY: Number.isFinite(h.exitY) ? h.exitY : Infinity,
    above: h.yH + r > SINK_SHIELD_Y + 1e-9 };
}
/** The fall law at τ seconds into a fall piece — the ONE parametrisation poseAt draws (ballistic y, the horizontal blend by
 *  time fraction). V16 (furniture.js) samples THIS function over the drawn part of the descent (FIX4 A, review 707m4): never a
 *  second parametrisation of the visible fall. */
export function fallPointAt(p, tau, out = {}) {
  const T = p.t1 - p.t0;
  const u = T > 0 ? tau / T : 1;
  out.y = p.yH - p.vDown * tau - 0.5 * G * tau * tau;
  out.x = p.x0 + (p.xE - p.x0) * u;
  out.z = p.z0 + (p.zE - p.z0) * u;
  out.u = u;
  return out;
}
const fallTmp = {};
export function poseAt(solution, id, t, out = {}, physical = false) {
  const pieces = solution.pieces.get(id);
  if (!pieces || !pieces.length) return null;
  if (t < pieces[0].t0) return null;
  let lo = 0;
  let hi = pieces.length - 1;
  while (lo < hi) { // last piece with t0 <= t
    const mid = (lo + hi + 1) >> 1;
    if (pieces[mid].t0 <= t) lo = mid; else hi = mid - 1;
  }
  const p = pieces[lo];
  const tau = Math.max(0, Math.min(t, p.t1) - p.t0);
  if (p.kind === 'fall') {
    const y = fallPointAt(p, tau, fallTmp).y;                       // the ONE fall law (FIX4 A: V16 samples this same function)
    // inside the pocket assembly (top above the lowest solid) the ball stays as
    // the sink left it — culled; it re-appears below the cup exit …and only once its
    // centre stays one diameter clear of every other drawn ball through to its landing
    // (`tShow`, verification round 9: the drawn end of a fall aimed one diameter behind a
    // tail is still short of its seat, 1.3–1.8 mm inside the tail for ~4 ms)
    // (#737 r3 class A) an owned fall BEGINS above the shield line — where the sink left the ball, in the cup — and the module
    // owns its drawing from that instant: drawn through the pocket opening while its top is above the shield (the hold's rule,
    // continued), culled inside the assembly, drawn again below the exit. Before, the exit rule culled it from the own instant
    // on: the ball vanished from the cup and re-appeared 62 mm lower a tenth of a second later.
    const drawnAbove = p.above === true && y + solution.r > SINK_SHIELD_Y;
    if (!physical && !drawnAbove && y + solution.r > p.exitY) return null;
    // …and a fall that lands ABOVE THE DRAWABLE QUEUE stays culled all the way down (round 11 class A):
    // its seat is beyond the route's reachable span, a position the track does not have, so the ball waits
    // undrawn on the pile in the chute and appears when the queue's advance brings its station onto the span.
    if (!physical && !drawnAbove && (p.D ?? p.route.total) > reachTop(p.route, solution.r) + 1e-9) return null;
    if (!physical && !drawnAbove && p.tShow !== undefined && t < p.tShow) return null;
    out.x = fallTmp.x;
    out.z = fallTmp.z;
    out.y = y;
    // the orientation: the incoming one while the ball is still above the shield line (drawn through the pocket opening, class
    // C); the rack-base reset from the first hidden instant on (spec §6: the reset happens while the ball is culled)
    const qF = (p.q0 && y + solution.r > SINK_SHIELD_Y) ? p.q0 : Q_ID;
    out.qx = qF[0]; out.qy = qF[1]; out.qz = qF[2]; out.qw = qF[3];
    out.D = p.D ?? p.route.total; out.kind = 'fall'; out.runwayId = null;
    return out;
  }
  if (p.kind === 'hold') {
    // order 18 item 0: a ball HELD where the sink left it — visible through the pocket opening while its top is above
    // the shield line (the sink's own contract, continued), culled inside the assembly, drawn again below the exit
    const top = p.y + solution.r;
    if (!physical && top <= SINK_SHIELD_Y && top > p.exitY) return null;
    const qH = p.q0 ?? Q_ID; // a held ball keeps the orientation it arrived with (class C)
    out.x = p.x; out.y = p.y; out.z = p.z; out.qx = qH[0]; out.qy = qH[1]; out.qz = qH[2]; out.qw = qH[3];
    out.D = p.route.total; out.kind = 'hold'; out.runwayId = null;
    return out;
  }
  if (p.culled && !physical) return null; // perched on the queue inside the pocket until its landing event (never drawn)
  const D = pieceD(p, tau, solution.r);
  stationAt(p.route, D, solution.r, stTmp);
  refusePose(p.route, D, stTmp, 'poseAt');   // the pose law, on the pose this function is about to hand the renderer (class W, arm W6)
  // a ball ABOVE THE DRAWABLE QUEUE — past the top of the route's reachable span, the landing rule's own
  // runway top (track.js reachSpan) — is not drawn (order 23b round 11, class A). `seatFor` seats a ball
  // behind a MOVING tail wherever the tail's own motion leaves room, momentary congestion the queue clears in
  // a few tens of ms; the ball then rolls down through every station below it, and the pocket's exit line
  // alone let it be DRAWN on route the track does not have — extrapolated along the entry segment's line,
  // 7.7 mm past the runway top on TEST-terminal-chutes (15.3 mm inside the generic table's apron there),
  // 52.8 mm on TEST-y3-obtuse. V16 scans the same span, so what is drawn is what was cleared.
  if (!physical && D > reachTop(p.route, solution.r) + 1e-9) return null;
  // a ball queued UPSTREAM of the entry whose top is still inside the pocket assembly
  // (above exit_below_y) stays culled, exactly as a falling ball does (review round 6)
  if (!physical && Number.isFinite(p.route.exitY) && D > p.route.total + 1e-9 && stTmp.y + solution.r > p.route.exitY) return null;
  out.x = stTmp.x; out.y = stTmp.y; out.z = stTmp.z;
  const q = p.kind === 'roll' ? qmul(qaxis(p.axis, (p.D0 - D) / p.rho), p.q0) : p.q0;
  out.qx = q[0]; out.qy = q[1]; out.qz = q[2]; out.qw = q[3];
  out.D = D; out.kind = p.kind; out.runwayId = stTmp.runwayId;
  return out;
}

/**
 * The state of ball `id` at time t on `solution`, in the shape the NEXT solve
 * consumes (seal 3, P1-B): null when the ball is not in the solution (or before
 * its handoff — game.js still owns it); { kind: 'fall' } while it is in the air
 * (the caller re-submits the handoff with its times shifted to the new base);
 * { kind: 'rest', D, route, q } once its final rest piece has begun (a ledger entry
 * with a carried station, ROUTE and orientation — review r2 P2-2); { kind: 'roll', route, D, v, q } while it rolls or waits in a
 * temporary rest that a later contact will move (v = 0 then).
 */
export function continuationAt(solution, id, t) {
  const pieces = solution.pieces.get(id);
  if (!pieces || !pieces.length || t < pieces[0].t0) return null;
  let lo = 0;
  let hi = pieces.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pieces[mid].t0 <= t) lo = mid; else hi = mid - 1; }
  const p = pieces[lo];
  if (p.kind === 'hold') return { kind: 'hold', x: p.x, y: p.y, z: p.z, route: p.route, q: p.q0 ? [p.q0[0], p.q0[1], p.q0[2], p.q0[3]] : undefined }; // held where the sink left it (order 18 item 0): re-enters as an owned arrival at the new base, with its orientation (class C)
  if (p.kind === 'fall' || p.culled) return { kind: 'fall' }; // a culled perch is still an arrival for the next base (its hand-off is re-submitted)
  if (p.kind === 'rest' && p.t1 === Infinity) return { kind: 'rest', D: p.D0, route: p.route, q: [p.q0[0], p.q0[1], p.q0[2], p.q0[3]] };
  const tau = Math.max(0, Math.min(t, p.t1) - p.t0);
  const D = pieceD(p, tau, solution.r);
  let v = p.kind === 'rest' ? 0 : p.v0 + p.a * tau;          // signed (order 16): a ball rolling back up its runway carries that into the next base
  if (p.kind === 'roll' && p.follow) {
    // a follower's own speed along its path: a CENTRAL difference (no ½·a·h bias — review
    // round 8: a backward difference on the Star's steep chute split a rolling train at a re-solve)
    const h = 1e-5; const span = p.t1 - p.t0;
    const lo = Math.max(0, tau - h), hi = Math.min(span, tau + h);
    v = hi > lo ? (pieceD(p, lo, solution.r) - pieceD(p, hi, solution.r)) / (hi - lo) : p.v0 + p.a * tau;
  }
  const q = (p.kind === 'roll' && p.axis) ? qmul(qaxis(p.axis, (p.D0 - D) / p.rho), p.q0) : (p.q0 ?? Q_ID); // (a piece of a truncated solve has no axis yet — `partial`, diagnosis only)
  const out = { kind: 'roll', route: p.route, D, v, q: [q[0], q[1], q[2], q[3]] };
  if (p.follow) out.follow = true;                 // touching the ball ahead at the cut: joins on geometry alone
  if (p.hold) out.hold = { ...p.hold };            // held at a merge window at the cut
  if (Number.isFinite(p.passedYield)) out.passedYield = p.passedYield; // a yield verdict already given (order 16 round 4)
  return out;
}

/**
 * Render-time event cursor (seal 3, P2-4 / FR-012): `advance(t)` returns the
 * TrackEvents whose time lies in (lastT, t] — each forward crossing fires once;
 * a backward scrub (t < lastT) re-arms everything after t and fires nothing; the
 * first call only seeds (no retroactive burst when a solution is created
 * mid-record). Pure in the call sequence, so node and browser agree.
 */
export function createEventCursor(events) {
  const list = events.slice().sort(compareEvents);
  let lastT = null;
  return {
    advance(t) {
      if (!Number.isFinite(t)) return [];
      if (lastT === null || t < lastT) { lastT = t; return []; }
      const fired = [];
      for (const e of list) { if (e.t > t) break; if (e.t > lastT) fired.push(e); }
      lastT = t;
      return fired;
    },
    reset() { lastT = null; },
    get lastT() { return lastT; },
  };
}

/** Sample every ball on a fixed grid → Float64Array (SAMPLE_STRIDE = 8 per ball
 * per sample: [id, x, y, z, qx, qy, qz, qw], NaN pose before the handoff; then the
 * rest ladder as [id, D] pairs in id order) for the determinism hash. */
export const SAMPLE_STRIDE = 8; // [id, x, y, z, qx, qy, qz, qw] per ball per sample
export function sampleSolution(solution, { t0, t1, dt = 1 / 240 } = {}) {
  // The pin buffer binds BALL IDS to positions (seal-2, verification K6): each
  // slot writes [id, x, y, z, qx, qy, qz, qw] and the buffer ends with the rest
  // ladder as [id, D] pairs in ball-id order, so two solutions that place the
  // same positions under different ids (an all-unknown ledger seated in a
  // different session order) hash differently.
  const ids = solution.order;
  const n = Math.floor((t1 - t0) / dt) + 1;
  const rest = [...solution.rest].sort((a, b) => a[0] - b[0]);
  const buf = new Float64Array(n * ids.length * SAMPLE_STRIDE + rest.length * 2);
  const o = {};
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * dt;
    for (const id of ids) {
      const p = poseAt(solution, id, t, o);
      buf[k++] = id;
      if (p) { buf[k++] = p.x; buf[k++] = p.y; buf[k++] = p.z; buf[k++] = p.qx; buf[k++] = p.qy; buf[k++] = p.qz; buf[k++] = p.qw; }
      else { for (let j = 0; j < 7; j++) buf[k++] = NaN; }
    }
  }
  for (const [id, D] of rest) { buf[k++] = id; buf[k++] = D; }
  return buf;
}

/** V19 — the DESIGN gate (order 23b, the round-2 ruling; contract §27.7). A declared track is asked, AT DECLARATION, what its own law
 * does with the DEFAULT DROP FAMILY: every served pocket dropping 1 / 2 / 3 / 4 / 6 balls 0.03 / 0.1 / 0.3 s apart, and every pair of
 * served pockets whose routes share a runway dropping one ball each 0.03 / 0.1 / 0.3 s apart, in both orders — with the harness's
 * hand-off (glide 0.06 s, tFall 0.021 s; the same family the arrival sweeps of §29 read). A family member that leaves a ball AT REST
 * off its route's rest surface held by the members' own contacts ('mutual', the wedge) or against a vertex ('corner') — the jam
 * classes §27.1 derived — or that the solver refuses by name (LOCK) or truncates (MAX_EVENTS), is a jam the player would meet:
 * the track is REFUSED at declaration, naming the seed that produced it. A ball WAITING behind a full rest surface (a train held at a
 * chute's window, a grounded seat) is reported (`waiting`), not refused — a full receptacle is not a jam. The solver never hides a jam
 * (§27.1–§27.3); the player never sees one (this row). Pure: no clock (the caller times it), no randomness; the family is a constant
 * of the law, not a tuning. */
export const DEFAULT_DROP_FAMILY = Object.freeze({ trains: Object.freeze([1, 2, 3, 4, 6]), gaps: Object.freeze([0.03, 0.1, 0.3]), pairGaps: Object.freeze([0.03, 0.1, 0.3]), glide: 0.06, tFall: 0.021, t0: 0.5 });
const designSeedRow = (s) => ({ seed: s.kind === 'train' ? `pocket ${s.pockets[0]}, ${s.n} ball${s.n > 1 ? 's' : ''} ${s.gap} s apart` : `pockets ${s.pockets[0]} then ${s.pockets[1]}, one ball each ${s.gap} s apart` });
const designDescribe = (o) => (o.why ? `${o.seed}: ${o.why}` : `${o.seed}: ball ${o.ball} at rest on ${o.runway} (D ${(o.D * 1e3).toFixed(1)} mm) held by '${o.heldBy}' at ${o.tEnd.toFixed(4)} s`);
/** The design family as RESUMABLE STEPS (#707 prep FIX1 A1, review 707m1 P2-1): one `solveShot` per step; the generator yields
 *  after every solved seed and RETURNS the verdict. `designGate` drives it to completion synchronously (the node arms, the
 *  Worker); `designGateChunked` drives it in time-budgeted slices on a host thread (the Worker-absent fallback). All three read
 *  the same code path in the same seed order, so the verdict bytes are identical whichever host runs them. */
export function* designGateSteps(track, { pockets, r, family = DEFAULT_DROP_FAMILY, maxEvents } = {}) {
  const served = [...track.routes.keys()].filter((k) => pockets && pockets[k]);
  const hand = (pk, t) => handoffFromSink({ t, pocket: pockets[pk], fall: pockets[pk], r, glide: family.glide, tFall: family.tFall }, { track, pockets, r });
  const seeds = [];
  for (const pk of served) for (const n of family.trains) for (const gap of family.gaps) seeds.push({ kind: 'train', pockets: [pk], n, gap, arrivals: Array.from({ length: n }, (_, i) => ({ id: i + 1, handoff: hand(pk, family.t0 + gap * i) })) });
  for (let a = 0; a < served.length; a++) for (let b = a + 1; b < served.length; b++) {
    const ra = track.routes.get(served[a]), rb = track.routes.get(served[b]);
    if (!ra.chain.some((rw) => rb.chain.includes(rw))) continue;                 // no runway in common: the two never meet
    for (const gap of family.pairGaps) for (const [p, q] of [[served[a], served[b]], [served[b], served[a]]]) seeds.push({ kind: 'pair', pockets: [p, q], n: 2, gap, arrivals: [{ id: 1, handoff: hand(p, family.t0) }, { id: 2, handoff: hand(q, family.t0 + gap) }] });
  }
  const holdOf = (sol, id) => { for (let i = sol.events.length - 1; i >= 0; i--) { const e = sol.events[i]; if (e.heldBy && (e.ball === id || (Array.isArray(e.members) && e.members.includes(id)))) return e.heldBy; } return null; };
  const offenders = [], waiting = []; let solves = 0, skipped = 0, attempted = 0; // attempted = solves + failed solves (every solveShot call, whichever way it ended)
  let degradations = 0, walkMax = 0, refineMax = 0, escalations = 0;   // the DERIVED refinement budget must not bite on a shipped fixture: the node arm walks every track and asserts 0 (order 23b round 10, class A)
  for (const s of seeds) {
    if (s.arrivals.some((a) => !a.handoff)) { skipped += 1; continue; }          // a pocket whose hand-off the track has no entry for
    let sol;
    try { sol = solveShot({ track, r, ledger: [], arrivals: s.arrivals, ...(maxEvents ? { maxEvents } : {}) }); }
    catch (e) { offenders.push({ ...designSeedRow(s), why: e.kind === 'LOCK' ? `LOCK '${e.lock?.why ?? ''}' (balls ${(e.lock?.members ?? []).join(', ')}) at ${Number.isFinite(e.lock?.t) ? e.lock.t.toFixed(4) : '?'} s` : `the solver threw: ${String(e.message).slice(0, 90)}` }); attempted += 1; yield { solves, skipped, seeds: seeds.length, attempted }; continue; } // (#707 prep FIX4 B, review 707m4) a FAILED solve is an attempted solve: the host breathes here too — consecutive failures no longer run in one slice past every budget and cancellation check
    solves += 1; attempted += 1;
    degradations += sol.degradations?.length ?? 0; if ((sol.walk?.steps ?? 0) > walkMax) walkMax = sol.walk.steps; if ((sol.walk?.refine ?? 0) > refineMax) refineMax = sol.walk.refine; escalations += sol.walk?.escalations ?? 0;
    for (const a of s.arrivals) {
      const ov = sol.overflow; if (ov && (typeof ov.has === 'function' ? ov.has(a.id) : [...ov].includes(a.id))) continue; // refused at a blocked entry (a Set): stays in the pocket — the overflow class, not a jam
      const c = continuationAt(sol, a.id, sol.tEnd + 1);
      if (!c || c.kind !== 'rest' || !c.route) continue;
      const rw = locate(c.route, Math.max(0, c.D - 1e-9)).rw.id;
      if (rw === c.route.restId) continue;                                         // delivered: at rest on its route's rest surface
      const held = holdOf(sol, a.id);
      if (held === 'wall') continue;                                               // the tray queue backed up onto the run: delivered to the queue
      const row = { ...designSeedRow(s), ball: a.id, runway: rw, D: c.D, heldBy: held ?? 'unnamed', tEnd: sol.tEnd };
      // the JAM classes refuse — a wedge held by the members' own contacts ('mutual') or a train stopped against a vertex ('corner'),
      // the states §27.1 derived; a ball WAITING behind a full rest surface (a merge-window 'hold' on a queue the receptacle cannot
      // take yet, a grounded seat) is a full chute, not a jam: reported, not refused
      if (held === 'mutual' || held === 'corner') offenders.push(row); else waiting.push(row);
    }
    yield { solves, skipped, seeds: seeds.length, attempted };  // one seed attempted (solved here; a failed one yields in the catch above): a host may breathe here
  }
  const refused = offenders.length > 0;
  const reason = refused ? `ball-return track refused [V19]: the default drop family leaves a ball undelivered — ${designDescribe(offenders[0])}${offenders.length > 1 ? ` (+${offenders.length - 1} more seeds)` : ''} — the solver never hides a jam and the player never sees one` : null;
  return { evaluated: true, refused, reason, solves, skipped, seeds: seeds.length, offenders, waiting, degradations, walkMax, refineMax, escalations, walkBudget: WALK_BUDGET, family: { trains: [...family.trains], gaps: [...family.gaps], pairGaps: [...family.pairGaps] } };
}
/** The design gate, synchronously: the steps driven to completion on the calling thread (pure; the caller times it). */
export function designGate(track, opts = {}) {
  const it = designGateSteps(track, opts);
  let n = it.next();
  while (!n.done) n = it.next();
  return n.value;
}
const designNow = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
/** One host breath: an idle period where the host has one, else the next macrotask. */
export const designIdle = () => new Promise((res) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => res(), { timeout: 50 }) : setTimeout(res, 0)));
/** The design gate in time-budgeted SLICES on the calling thread (the Worker-absent fallback): steps run until `budgetMs` has
 *  elapsed in the slice, then the host breathes (`idle`). At least one step runs per slice, so a slice is bounded below by ONE
 *  solve — a single seed of a big family (XW101's six-ball trains) can exceed the budget; the Worker is the path that keeps the
 *  UI thread free, this one keeps it RESPONSIVE between seeds. Returns the verdict plus `slices` and `sliceMaxMs` (measured);
 *  `abort()` read after each breath stops a superseded sweep ({ aborted: true }). */
export async function designGateChunked(track, opts = {}, { budgetMs = 4, idle = designIdle, now = designNow, abort = null } = {}) {
  const it = designGateSteps(track, opts);
  let slices = 0, sliceMaxMs = 0, n;
  for (;;) {
    const t0 = now();
    do { n = it.next(); } while (!n.done && now() - t0 < budgetMs);
    const dt = now() - t0; slices += 1; if (dt > sliceMaxMs) sliceMaxMs = dt;
    if (n.done) break;
    await idle();
    if (abort && abort()) return { aborted: true, slices, sliceMaxMs };   // superseded (the activation moved on): stop consuming this thread
  }
  return { ...n.value, slices, sliceMaxMs };
}
