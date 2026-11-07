// Copyright (c) Meta Platforms, Inc. and affiliates.

// drills/catalog.js — the practice-drill task library (issue #66): pure DATA
// + pure layout/objective functions, zero imports (leaf module; loaded only
// via a guarded dynamic import from drills.js). Format contract + the
// RL-curriculum mapping: web/app/drills/FORMAT.md.
//
// Alignment law (issue #66): a drill here is a pure function of
// (drill_id, attempt_index, entry_seed) in the RL-research (internal) task
// shape — per-drill namespaces publish a base seed derived as the first 8
// big-endian bytes of SHA-256(corpus_id) (the namespaces.v2.json law,
// re-derived and cross-checked by web/tools/e2e-drills.mjs), entry n draws
// shot_seed(base, n) (the frozen 017 SplitMix64 mix, self-checked below
// against the exact rl-env vectors), and any seeded layout draw uses the
// LAYOUT_GAMMA sub-stream of rl-research drills/generators.py verbatim.
// Objectives are declarative predicates over kernel record/judgment facts
// ONLY (pots by pocket id, first contact, cushion events, scratches, rest
// positions, sample(t) zone checks) — never re-derived physics
// (constitution P-II; the rl-env smoke.py objective-evaluator law).
//
// Coordinates: layouts are authored in DIAMOND UNITS on the 8x4 grid
// (dx in [0,4] across the width, dy in [0,8] along the length, +dy = the
// FOOT end) and converted to kernel meters against the ACTIVE table at
// layout time, so the same drill definition scales to any 2:1 table.
// Pocket ids are the kernel Table pocket indices (order lb lc lt rb rc rt:
// 0 head-left, 1 side-left, 2 foot-left, 3 head-right, 4 side-right,
// 5 foot-right) — the same u16 that BallPocket events carry.

// ---- seeding (frozen mixes, BigInt) ----------------------------------------
const MASK = (1n << 64n) - 1n;
const GOLDEN_GAMMA = 0x9E3779B97F4A7C15n; // SplitMix64 stream increment
// rl-research drills/generators.py layout sub-stream gamma (derived there
// as SplitMix64(golden_gamma_2) | 1; carried here as the published constant)
const LAYOUT_GAMMA = 0x48218226FF3CD4BFn;

/** Canonical SplitMix64 finalizer over u64 (pure BigInt math). */
export function splitmix64(z) {
  z &= MASK;
  z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & MASK;
  return (z ^ (z >> 31n)) & MASK;
}

/** Entry-seed mix (rl-env contracts/env-api.md §5, frozen 017 mix):
 * SplitMix64(base XOR golden_gamma * (n + 1)). */
export function shotSeed(base, n) {
  return splitmix64((base & MASK)
    ^ ((GOLDEN_GAMMA * (BigInt(n) + 1n)) & MASK));
}

/** Draw k of the rl-research layout sub-stream for an entry seed. */
export function layoutU64(entrySeed, k) {
  return splitmix64(((entrySeed & MASK)
    + ((LAYOUT_GAMMA * (BigInt(k) + 1n)) & MASK)) & MASK);
}

/** u64 → [0, 1): (u >> 11) * 2^-53 (multiply-only, exact). */
export function layoutUnit(entrySeed, k) {
  return Number(layoutU64(entrySeed, k) >> 11n) * 2 ** -53;
}

// Import-time self-check (the rl seeding.py doctrine): the exact vectors of
// the internal RL environment seeding.py and RL-research
// drills/generators.py. A drifted mix throws — the guarded dynamic import
// in drills.js then leaves the whole feature inert instead of silently
// generating divergent curricula.
const SHOT_SEED_VECTORS = [
  [0n, 0, 0xE220A8397B1DCDAFn], [7n, 0, 0xF75F04CBB5A1A1DDn],
  [7n, 1, 0xB3466F8A7B81A989n], [7n, 2, 0xE8313FE1D7350611n],
  [20260710n, 3, 0x5CBF3E3BCD6B8840n], [(1n << 64n) - 1n, 0, 0xDE0A564CBCD060C4n],
];
const LAYOUT_VECTORS = [
  [0n, 0, 0x33FE8BD4F9C57863n], [7n, 0, 0x5D8201138B334799n],
  [7n, 1, 0x31581FB0A16A0E13n], [20260712n, 3, 0x6CC3DF45D95A686An],
];
for (const [s, i, want] of SHOT_SEED_VECTORS) {
  if (shotSeed(s, i) !== want) throw new Error('drills catalog: shot_seed mix drifted');
}
for (const [s, k, want] of LAYOUT_VECTORS) {
  if (layoutU64(s, k) !== want) throw new Error('drills catalog: layout sub-stream drifted');
}

// ---- shared assets (issue #66 "build once" list) ---------------------------
// Paper-target rectangle: 0.68 x 0.88 diamond units (a US-letter sheet on a
// 9-ft table, the BU exam target); GHOST_TOL_D: ghost-ball rest tolerance,
// 0.18 diamonds = one ball diameter on the 9-ft table.
export const PAPER_ACROSS_D = 0.68;
export const PAPER_ALONG_D = 0.88;
export const GHOST_TOL_D = 0.18;

/** Ball-gap placement helper (half/one/three-ball gaps): center at surface
 * gap `gapBalls` ball-diameters from `from` along unit (ux, uy). Half-ball
 * gap = 0.5, one-ball = 1, three-ball = 3. r = kernel ball radius. */
export function placeWithGap(from, ux, uy, gapBalls, r) {
  const d = 2 * r + gapBalls * 2 * r;
  return { x: from.x + ux * d, y: from.y + uy * d };
}

// ---- diamond-grid helpers ---------------------------------------------------
/** Layout context for the ACTIVE table: { w, l, r, pockets } in kernel
 * meters (pockets = kernel Table pocket centers in kernel order). */
export function diamondCtx(table, r) {
  return {
    w: table.width, l: table.length, r,
    D: table.length / 8, // 1 diamond (== width/4 on every 2:1 table)
    pockets: (table.pockets ?? []).map((p) => ({
      x: p.center?.x ?? p.x, y: p.center?.y ?? p.y,
    })),
  };
}
const pt = (ctx, dxD, dyD) => ({
  x: (dxD - 2) * (ctx.w / 4), y: (dyD - 4) * (ctx.l / 8),
});
const unit = (ax, ay, bx, by) => {
  const n = Math.hypot(bx - ax, by - ay) || 1;
  return { x: (bx - ax) / n, y: (by - ay) / n };
};
/** Clamp a placement into the bed with a rail margin (defensive: unusual
 * catalog tables must never push a layout across the SDK validator). */
const clampBed = (ctx, p) => {
  const m = ctx.r + 1e-3;
  return {
    x: Math.min(ctx.w / 2 - m, Math.max(-ctx.w / 2 + m, p.x)),
    y: Math.min(ctx.l / 2 - m, Math.max(-ctx.l / 2 + m, p.y)),
  };
};
/** Cue placement for a cut shot: approach OB along the OB→pocket line
 * rotated by `cutDeg` (sign = rotation direction), `distD` diamonds out. */
function cueOnCutLine(ctx, ob, pocketI, cutDeg, distD) {
  const pk = ctx.pockets[pocketI];
  const u = unit(ob.x, ob.y, pk.x, pk.y);
  const a = (cutDeg * Math.PI) / 180;
  const rx = u.x * Math.cos(a) - u.y * Math.sin(a);
  const ry = u.x * Math.sin(a) + u.y * Math.cos(a);
  const d = distD * ctx.D;
  return clampBed(ctx, { x: ob.x - rx * d, y: ob.y - ry * d });
}

// Paper-target rect zone along a shot line: containment test is
// |proj_along| <= halfAlong && |proj_across| <= halfAcross in the (ux, uy)
// frame — pure geometry over a rest position.
const paperRect = (ctx, cx, cy, ux, uy) => ({
  kind: 'rect', cx, cy, ux, uy,
  halfAlong: (PAPER_ALONG_D * ctx.D) / 2,
  halfAcross: (PAPER_ACROSS_D * ctx.D) / 2,
});

// ---- the BU F2/F3/F4 shared line (one family, authored once) ---------------
// A straight pot into the foot-left corner (pocket 2): the shot line runs
// 10° off the corner's 135° mouth bisector (tuned live: a 20°-off line
// grazes the near jaw nose and rattles hot straight-in balls), OB 2.2
// diamonds out from the pocket center, cue `dk` diamonds behind the OB.
//
// GH-384 rulings for the F2-F4 class-mates (FORMAT.md §3.12):
// - HAND-PLACEMENT ALLOWANCES (sheet letter, F2-F4 pp.2-4: "You are allowed
//   to vary the CB and OB positions away from the rail as long as the CB
//   remains within one diamond of the rail"; F2/F4 only: "If you end up in
//   position 1 you are allowed to place the CB anywhere between positions
//   1 and 2 ... to comfortably avoid a double hit") are recorded N/A under
//   this parametric line: both are ergonomic relief laws tied to the
//   sheet's rail-adjacent 7-station geometry (bridge over the rail; a
//   half-diamond CB→OB gap at position 1), neither of which exists here
//   (mid-table line, 1-diamond closest rung), and a zone-BOUNDED in-hand
//   grant is not in the v1 placement vocabulary (FORMAT.md §1a recorded
//   follow-up). They become live obligations if F2-F4 ever adopt the
//   sheet's station line the way bu-f1/bu-f5 now do.
// - NO-SCRATCH (sheet letter): F2/F4 are silent on scratches — noScratch
//   stays as current behavior (documented silence; operationally the zone
//   law is equivalent — a pocketed CB has no rest position, so it can
//   never satisfy cueRest); F3's own diagram says "follow to the target
//   without scratching", so its noScratch is the sheet's letter. Contrast:
//   F1 explicitly ALLOWS scratches (diagram label), F6 explicitly BANS
//   them ("You are not allowed to scratch").
const F234_STEPS_D = [1, 1.5, 2, 2.5, 3]; // cue→OB diamonds, ladder order
function f234Line(ctx) {
  const pk = ctx.pockets[2];
  const a = Math.atan2(1, -1) - (10 * Math.PI) / 180; // into-pocket direction
  const u = { x: Math.cos(a), y: Math.sin(a) };
  const ob = { x: pk.x - u.x * 2.2 * ctx.D, y: pk.y - u.y * 2.2 * ctx.D };
  return { u, ob };
}
function f234Attempt(ctx, k, mode) {
  const { u, ob } = f234Line(ctx);
  const dk = F234_STEPS_D[Math.min(k, F234_STEPS_D.length - 1)] * ctx.D;
  const cue = clampBed(ctx, { x: ob.x - u.x * dk, y: ob.y - u.y * dk });
  const objective = {
    pot: { ball: 1, pocket: 2 }, firstContact: 1, noScratch: true,
  };
  if (mode === 'stop') {
    // full-hit ghost position: OB center − 2r along the shot line; rest
    // tolerance GHOST_TOL_D (one ball diameter on the 9-ft table)
    objective.cueRest = {
      kind: 'circle', x: ob.x - u.x * 2 * ctx.r, y: ob.y - u.y * 2 * ctx.r,
      r: GHOST_TOL_D * ctx.D,
    };
  } else if (mode === 'follow') {
    // TUNING: follow-target depth 1.1 diamonds past the OB along the line
    // (the research catalog states a paper target ahead; the exact BU sheet
    // depth was flagged approximate — adjust FOLLOW_DEPTH_D only)
    const FOLLOW_DEPTH_D = 1.1;
    objective.cueRest = paperRect(ctx,
      ob.x + u.x * FOLLOW_DEPTH_D * ctx.D, ob.y + u.y * FOLLOW_DEPTH_D * ctx.D,
      u.x, u.y);
    // GH-384 review r3: the F3 sheet carries the SAME letter as F5 — "the
    // CB must end up within or overlapping the target" — so the follow
    // paper takes the rounded ball-overlap test too (FORMAT.md §2)
    objective.cueRest.overlapR = ctx.r;
  } else {
    // TUNING: draw-target depth 1.5 diamonds back from the OB — the catalog
    // flagged the BU draw depth approximate; adjust DRAW_DEPTH_D only.
    // NO overlapR here: the F4 sheet's letter is CENTER-based ("The CB
    // center (or resting point on the cloth) must be inside of the
    // rectangle border") — the plain center-in-rect test IS its law.
    const DRAW_DEPTH_D = 1.5;
    objective.cueRest = paperRect(ctx,
      ob.x - u.x * DRAW_DEPTH_D * ctx.D, ob.y - u.y * DRAW_DEPTH_D * ctx.D,
      u.x, u.y);
  }
  return { balls: [{ id: 0, ...cue }, { id: 1, ...ob }], objective };
}

// ---- BU F6 stations ---------------------------------------------------------
// TUNING: the ten set-shot stations. The research catalog flagged the BU F6
// coordinates as approximate — these stations are the parametric mirror
// (cue/OB in diamonds + intended pocket id); adjust entries only, the
// objective law (pot in the stated pocket, clean first contact, no scratch)
// is the catalog's.
const F6_STATIONS = [
  { cue: [2, 3], ob: [1, 6], pocket: 2 },
  { cue: [2, 3], ob: [3, 6], pocket: 5 },
  { cue: [1, 2], ob: [3, 5], pocket: 5 },
  { cue: [3, 2], ob: [1, 5], pocket: 2 },
  { cue: [2, 5], ob: [1.2, 4], pocket: 1 },
  { cue: [2, 3], ob: [2.8, 4], pocket: 4 },
  { cue: [0.7, 1.5], ob: [3, 6], pocket: 5 },
  { cue: [3.3, 1.5], ob: [1, 6], pocket: 2 },
  { cue: [1, 3], ob: [2, 6.6], pocket: 5 },
  { cue: [2, 1], ob: [1, 6.9], pocket: 2 },
];

// ---- BU F7 wagon-wheel targets ----------------------------------------------
// TUNING: ten rail targets circling the table (diamond coordinates, pulled
// ~0.4 diamonds inside the noses) + the tolerance radius. NOTE this is a
// VIRTUALIZED spoke law, NOT the BU Exam I F7 law — the divergence is
// recorded in FORMAT.md §3 row 11 (GH-371): the official sheet plays 2
// attempts at each of 10 REAL rail target balls (success = short side pot
// + the cue HITS the target, ≤1 adjacent rail-first cushion en route,
// /20); the faithful overhaul is the recorded follow-up. Adjust the list
// and WHEEL_TOL_D only; the per-spoke law (pot + cue rest on the spoke
// target, 2 points a spoke, /20) is this catalog's own.
const WHEEL_TARGETS_D = [
  [2, 7.6], [3, 7.6], [3.6, 6.5], [3.6, 5], [3.6, 3.5],
  [3.6, 2], [3, 0.4], [2, 0.4], [1, 0.4], [0.4, 2],
];
const WHEEL_TOL_D = 0.5;

// ---- ten-ball triangle (issue GH-119 ghost10, path (a)) ----------------------
// The kernel has NO 'ten' rack kind (KERNEL_KIND_RACK_BALLS = nine/fifteen/
// snooker/carom), so ghost10 lays its rack web-side via game.layout() over a
// fifteen-ball ballset (ids 1..10 used) — recorded divergence FORMAT.md §3.7.
// Ten balls in the standard four-row triangle, apex on the foot spot, pointing
// at the foot rail (+dy). Overlap-safe: neighbours carry a TRI_GAP surface gap
// so the SDK validator (EPS_KISS) never rejects a laid rack.
const TRI_GAP = 0.04; // ball-diameter fraction between neighbours
function tenRack(ctx) {
  const apex = pt(ctx, 2, 6); // foot spot
  const col = 2 * ctx.r * (1 + TRI_GAP);
  const row = (Math.sqrt(3) / 2) * col;
  const balls = [{ id: 0, ...pt(ctx, 2, 2) }]; // cue on the head spot
  let id = 1;
  for (let r = 0; r < 4; r++) {
    for (let j = 0; j <= r; j++) {
      const p = clampBed(ctx, {
        x: apex.x + (j - r / 2) * col, y: apex.y + r * row,
      });
      balls.push({ id: id++, ...p });
    }
  }
  return { balls, objective: { rotation: true, noScratch: true } };
}

// ---- the line-up (蛇彩) family (issue GH-131) --------------------------------
// Owner geometry (AUTHORITATIVE — GH-131 on-device verdict; the shipped
// half-BALL-gap chain packed the line into ~half the table and left the
// 1-ball with no potting angle): FIFTEEN balls down the CENTER LONG STRING
// at HALF-DIAMOND spacing — 14 gaps × 0.5D = 7 diamonds of the 8-diamond
// length, span centered (ball 1 at dy 7.5, the foot end; ball 15 at dy
// 0.5) — cue ball IN HAND ANYWHERE at the start (not kitchen), cleared in
// PLACEMENT ORDER from the foot end up. Clear order is encoded as ID
// PLACEMENT: ids ascend in clear order, so the dynamic lowest-id rotation
// predicate (FORMAT.md §2) IS the machine check on every family member.
// Web corroboration (owner geometry wins conflicts — GH-131 addendum):
// - the historic straight-pool "Line-Up" game/drill: fifteen balls in a
//   straight line down the middle, full length, no formalized western
//   spacing (forums.azbilliards.com/threads/line-up-straight-pool.123734,
//   billiards101.com/the-line-pool-drill/ — in-order, random-layout and
//   N-ball-scaling variants);
// - 中式蛇彩 conventions: 竖蛇彩/横蛇彩/L型蛇彩 are the standard named family
//   and middle-to-ends alternates pockets outward from the center ball
//   (zhihu.com/question/31644672, zhuanlan.zhihu.com/p/375154631);
// - lateral row: the "Across the Middle Line Drill" full-width in-order row
//   (mypoolblog.com); 15 balls cannot fit the 4-diamond width at 0.5D
//   (needs 7D) — the GH-136 owner correction makes the whole row UNIFORM:
//   16 EQUAL gaps (14 inter-ball + the 2 cushion-to-end-ball gaps),
//   g = (w − 15·ball_d)/16 — near-touching by physical necessity;
// - L-shape / diagonal: video-only tradition (AzBilliards L-drill threads)
//   — the owner spec is the sole layout authority (GH-136 photo spec:
//   2-diamond legs WRAPPING the enclosed corner pocket's quadrant / a full
//   diagonal, a single designated pocket).

/** dy of line-up slot `s` (0..14), foot end first: 7.5, 7.0, … 0.5. */
const lineSlotDy = (s) => 7.5 - 0.5 * s;

/** Compose a center-string line-up: ballDy(i) = ball i's dy (i = 1..15). */
function lineupBalls(ctx, cue, ballDy) {
  const balls = [{ id: 0, ...clampBed(ctx, cue) }];
  for (let i = 1; i <= 15; i++) balls.push({ id: i, ...pt(ctx, 2, ballDy(i)) });
  return balls;
}

// Lateral (横排蛇彩) row constants + slot map — shared by the three lateral
// order variants (GH-131 review finding 1: the owner spec lists the SAME
// end-to-end / ends-to-middle / middle-to-ends orders for the lateral row).
// TUNING: the owner pins "~0.5D below the side-pocket line" but not the
// side; the 1–2-diamond difficulty-ladder row shift is a recorded follow-up
// knob — adjust LAT_DY only. Spacing (GH-136 owner correction — the shipped
// 0.35D end insets left the cushion gaps visibly wider than the ball gaps):
// the row is FULLY UNIFORM — 15 balls make 16 EQUAL gaps (14 inter-ball +
// the 2 cushion-to-end-ball gaps), g = (w − 15·ball_d)/16 (≈ 25.8 mm on the
// kernel 9-ft table; r-dependent, no longer pure diamond units — the end
// gap equals the inter-ball gap BY CONSTRUCTION).
const LAT_DY = 4.5;
/** Kernel point of lateral slot `s` (0..14), left end first — the GH-136
 * uniform-16-gap law: slot center x = −w/2 + g + r + s·(2r + g). */
function latSlot(ctx, s) {
  const g = (ctx.w - 30 * ctx.r) / 16;
  return {
    x: -ctx.w / 2 + g + ctx.r + s * (2 * ctx.r + g),
    y: pt(ctx, 2, LAT_DY).y,
  };
}
/** Compose a lateral-row line-up: slotOf(i) = ball i's slot (i = 1..15). */
function lateralBalls(ctx, cue, slotOf) {
  const balls = [{ id: 0, ...clampBed(ctx, cue) }];
  for (let i = 1; i <= 15; i++) {
    balls.push({ id: i, ...latSlot(ctx, slotOf(i)) });
  }
  return balls;
}
/** The family's shared objective: any pocket (or ONLY `pocket` when given),
 * cleared in placement order (ascending id — the rotation predicate).
 * `cleanContact` (issue GH-134, the family's BASE rule): after the cue's
 * first contact, ANY further cue↔object contact ends the run (reason
 * 'crash') — the strict line-up convention (billiardsforum, GH-131 addendum:
 * reset when "cue ball hits more than one ball per shot"). Recorded owner
 * boundaries: CUE-BALL-ONLY (object↔object disturbance is NOT a fail) and
 * the literal count>1 predicate also fails a double-kiss on the designated
 * ball (FORMAT.md §2).
 * GH-384 crash-scope RULING (FORMAT.md §3.12): where the sources diverge —
 * billiards101's "No contact with other balls" (an ambiguous any-disturbance
 * phrasing, billiards101.com/the-line-pool-drill/) vs the billiardsforum
 * instructor convention's cue-ball-scoped count ("cue ball hits more than 1
 * ball per shot", billiardsforum.com/learn-to-play-pool/list-of-billiard-
 * drills-round-2) — the billiardsforum reading is the CHOSEN convention:
 * it is the operational (machine-checkable) statement, the one the GH-131
 * research addendum adopted, and the one consistent with the owner-recorded
 * cue-ball-only boundary above. The billiards101 any-disturbance reading is
 * the REJECTED variant (adjudicating object↔object cannons would require
 * rules no source states).
 * `noScratch` (GH-384 scratch RULING, ruled on lineup-l for the family):
 * billiards101 is SILENT on scratches (its only stated fail law is the
 * no-contact clause); the strict billiardsforum convention ends the run on
 * a scratch — the run-ending noScratch here is that adopted convention,
 * kept (no source grants mid-run ball in hand or a lenient scratch). */
const lineupObjective = (pocket) => ({
  pot: pocket === undefined ? { count: 1 } : { count: 1, pocket },
  rotation: true, noScratch: true, cleanContact: true,
});

// ---- rating charts (issue GH-119 challenge tier) -----------------------------
// A rating chart maps a completed score to a band label (drills.rating.*).
// `lowerIsBetter` drills read the SAME chart with the direction flipped by
// the runner. Bands are published data (the objective-evaluator law): the
// runner picks the first band whose `max` bound the score does not exceed.
export const RATING_ROTATION = [ // rotation15 (Dr Dave; penalties, lower=better)
  { max: 20, label: 'pro' }, { max: 40, label: 'strong' },
  { max: 60, label: 'club' }, { max: 80, label: 'improver' },
  { max: Infinity, label: 'banger' },
];
export const RATING_GHOST10 = [ // ghost10 (balls potted over ten racks)
  // GH-459 domain note: the total can go NEGATIVE (scratches are an
  // unconditional −2 with no floor — the sheet's arithmetic); the chart's
  // published bounds are unchanged and the first band's `score <= max`
  // test already grades any sub-zero total 'improver'.
  { max: 34, label: 'improver' }, { max: 50, label: 'club' },
  { max: 70, label: 'strong' }, { max: Infinity, label: 'pro' },
];

// ---- the catalog ------------------------------------------------------------
// Envelope note (FORMAT.md): id/family/corpus_id/base_seed/ruleset mirror
// the rl-research manifest.drill-*.json keys; `protocol` is the episodes
// block; `attempt` is the generator (pure in (ctx, k, entrySeed)); maxScore
// is the published grading bound. base_seed strings are re-derived from
// corpus_id by e2e-drills.mjs (the manifests.py audit-on-load law).
//
// `cuePlacement` (issue #79, FORMAT.md §1a) — the per-attempt cue-ball
// placement law, set per drill against the source protocol sheets (#66
// research record):
//   'fixed'    (default) the attempt layout's cue spot IS the drill — the
//              runner stays in AIM, no drag affordance;
//   'anywhere' CB in hand each laid attempt — the runner enters the real
//              BALL_IN_HAND affordance after the layout;
//   'kitchen'  in hand behind the head string (line-up opening rack,
//              9-ball break) — same affordance, kitchen-clamped
//              (EXCLUSIVE of the head string per WPA 2.1/3.10 — GH-370);
//   'd'        in hand ON/WITHIN the D (snooker, WPBSA Sec3 R5 "Playing
//              from In-hand" — the issue #62 erratum: R8 is Touching
//              Ball; the D is INCLUSIVE) — same affordance riding the
//              game.js D clamp (issue #80).
// Run-drill continues (kernel rest re-lays) never re-grant placement: mid-
// run the cue plays where it lies — EXCEPT where a drill declares the
// GH-370 class-5 axes below:
//   `foulPlacement` — the placement class a FOUL re-grant opens (e.g.
//              rotation15 'anywhere': its Dr Dave rule body rides
//              standard 9-ball rules, WPA 5.7 via 1.6 — BIH anywhere
//              after any foul, never the break's kitchen class);
//   `postBreakBih` — the placement class granted after EVERY break (the
//              ghost convention: "After the break, take ball in hand and
//              run out, in rotation" — Joe Tucker via
//              drdavepoolinfo.com/faq/rating/10-ball/);
//   `voluntaryBih` — the drill's own take-BIH-any-time affordance zone
//              (rotation15: +1 penalty per use, Dr Dave rating sheet);
//              the dock button renders only when this is set.
//
// `discipline` (issue #80, FORMAT.md §1b) — absent/'pool' = the 9-ball
// sandbox pin (FORMAT.md §3.5); 'snooker' = the runner pins the session
// onto the real snooker discipline (kind-locked WPBSA 12-ft pairing) and
// the REAL snooker-v1 fold judges underneath (the ghost9 precedent
// generalized). Snooker attempts receive the SNOOKER_LAYOUT-derived ctx
// (drills.js snookerCtx) — the kernel-mirror spots, NEVER the active
// table's diamond grid (the snooker table is not 2:1).
//
// `sequence` protocol (issue #80): { kind: 'sequence', order: [...] } —
// pot the ordered colours over the live snooker-v1 final_colours fold.
// The order MUST be the WPBSA ascending value order (16..21): the real
// fold enforces exactly that ball-on chain (R3(h)), legal pots stay down
// (R3(h)(ii)), fouled-in colours respot per Sec3 R7 (flow.js applies the
// judgment.respot plan). Any foul or dry stroke ends the run; score =
// colours cleared before it.
export const DRILLS = [
  {
    id: 'bu-f1', family: 'potting', tier: 'intermediate', corpus_id: 'DRILL-WEB-BU-F1',
    base_seed: '0xF4EEBF900413EEF2', ruleset: 'nineball-sandbox', rack: 'nine',
    // GH-384 sheet alignment (BU_Exam-I_Fundamentals.pdf F1 p.1): "Start
    // with the cue ball in position 4" (protocol.start) and "The maximum
    // total score allowed is 10" (the diploma cap — the runner clamps
    // pos + bonus at maxScore). Persisted bests earned on the pre-384
    // start-1/11-point parametric scale carry over unchanged (the lineup
    // recorded-semantics-change precedent, FORMAT.md §3.10(a)).
    protocol: { kind: 'ladder', steps: 7, shots: 10, start: 4 }, maxScore: 10,
    cuePlacement: 'fixed', // BU F1: the ladder station IS the drill — the
                           // sheet grants NO hand placement in F1 (the
                           // "vary away from the rail" allowance is
                           // F2-F4-only; GH-384 ruling, FORMAT.md §3.12)
    attempt(ctx, k) {
      // GH-384: the sheet's DIAGRAM stations replace the pre-384 parametric
      // 5°..65° cut ladder (a recorded TUNING approximation). Read off the
      // F1 diagram to ±1/8D (200-dpi vector measure, GH-384): the seven CB
      // stations sit AT the long-rail diamonds, ONE DIAMOND off the rail
      // (position 1 the diamond nearest the OB corner, 7 the farthest);
      // the OB is fixed ONE DIAMOND off the OPPOSITE long rail with the
      // diagram's "one ball gap" to the end cushion — a gap ball frozen to
      // the nose ⇒ OB center 3r off it. Mirrored onto the foot-LEFT corner
      // (pocket 2) under the sheet's own mirror allowance ("Any drill in
      // this exam can be done from the other side of the table", F1 p.1).
      // Cut ladder ≈ 5°→58°, distance 2.1→7.0 diamonds. The diagram label
      // "you are allowed to scratch" is LAW: NO noScratch word — a stroke
      // that pots the OB and scratches still advances (GH-384 ruling; F6
      // is the class-mate that explicitly bans scratches). The sheet is
      // SILENT on the cue driven OFF the table (a distinct foul), so that
      // keeps the pre-384 strictness through the narrower noCueOff word
      // (GH-384 review r2 — the scratch allowance must not legalize it).
      const ob = { x: -ctx.w / 4, y: ctx.l / 2 - 3 * ctx.r };
      const cue = pt(ctx, 3, 7 - k); // position k+1 → dy 7−k (1 = foot-most)
      return {
        balls: [{ id: 0, ...clampBed(ctx, cue) }, { id: 1, ...ob }],
        objective: { pot: { ball: 1, pocket: 2 }, firstContact: 1, noCueOff: true },
      };
    },
  },
  {
    id: 'bu-f2', family: 'cueball', tier: 'intermediate', corpus_id: 'DRILL-WEB-BU-F2',
    base_seed: '0xF5EE5B4EA1BA096A', ruleset: 'nineball-sandbox', rack: 'nine',
    protocol: { kind: 'ladder', steps: 5, shots: 10 }, maxScore: 11,
    cuePlacement: 'fixed', // BU F2-F4: cue at the ladder distance on the shot line
    attempt(ctx, k) { return f234Attempt(ctx, k, 'stop'); },
  },
  {
    id: 'bu-f3', family: 'cueball', tier: 'intermediate', corpus_id: 'DRILL-WEB-BU-F3',
    base_seed: '0x09A970D8AF71D374', ruleset: 'nineball-sandbox', rack: 'nine',
    protocol: { kind: 'ladder', steps: 5, shots: 10 }, maxScore: 11,
    cuePlacement: 'fixed',
    attempt(ctx, k) { return f234Attempt(ctx, k, 'follow'); },
  },
  {
    id: 'bu-f4', family: 'cueball', tier: 'intermediate', corpus_id: 'DRILL-WEB-BU-F4',
    base_seed: '0x7278FE445DB71850', ruleset: 'nineball-sandbox', rack: 'nine',
    protocol: { kind: 'ladder', steps: 5, shots: 10 }, maxScore: 11,
    cuePlacement: 'fixed',
    attempt(ctx, k) { return f234Attempt(ctx, k, 'draw'); },
  },
  {
    id: 'bu-f5', family: 'cueball', tier: 'intermediate', corpus_id: 'DRILL-WEB-BU-F5',
    base_seed: '0x21B69242D677DECA', ruleset: 'nineball-sandbox', rack: 'nine',
    // GH-384 sheet alignment (BU_Exam-I_Fundamentals.pdf F5 p.5): the
    // ladder moves the TARGET, not the CB — "Start with the target in
    // position 4"; seven positions over 10 shots; "The maximum total score
    // allowed is 10" (score = target position + bonus, runner-capped).
    protocol: { kind: 'ladder', steps: 7, shots: 10, start: 4 }, maxScore: 10,
    cuePlacement: 'anywhere', // F5 diagram law: "CB in hand for each shot"
    attempt(ctx, k) {
      // GH-384 sheet geometry (replaces the pre-384 inverted ladder — CB
      // distance steps onto ONE fixed target with every cushion banned — a
      // recorded TUNING approximation): the OB is FIXED "one ball below
      // the table center", one ball DIAMETER toward the potting side
      // pocket (kernel pocket 4; diagram-measured 0.15D ≈ 2r = 0.18D), so
      // the full-hit ghost sits exactly ON the table center and the stun
      // tangent runs along the CENTER STRING toward the foot rail. Paper
      // targets for positions 1/2/3 sit ON that line, centers at long-rail
      // diamonds 5/6/7 (sheet: "the target centers for the other positions
      // are aligned with the long-rail diamonds"; diagram-measured
      // 4.95/5.96/6.92, long axis along the drift); positions 5/6/7 are
      // the SAME sheets reached after the end-rail rebound (5→diamond 7,
      // 6→6, 7→5); position 4's paper turns its LONG edge against the foot
      // cushion (center 8 − 0.34D on the string). Path law, sheet verbatim:
      // "The CB must head straight to the target (without cushion contact)
      // for positions 1, 2, and 3" (noCueCushion), "the CB must rebound
      // off the end rail for target positions 5, 6, and 7" (needFootCushion
      // — the record-byte POST-CONTACT foot-segment predicate, FORMAT.md
      // §2), "Cushion contact is allowed, but not required, for target
      // position 4". RULED (GH-384 review r2): "must head straight" reads
      // OPERATIONALLY as the cushion law — the human-administered exam
      // judges the route by cushion contact, and every legitimate stun
      // drift arcs slightly while residual spin decays, so a literal
      // path-straightness predicate would fail honest strokes; a
      // masse-curve exploit is a recorded non-goal (FORMAT.md §3.11).
      // Success: "The OB must be pocketed and the CB must end up within or
      // OVERLAPPING the target" — the rounded circle-vs-rect overlap test
      // (rect.overlapR = r; FORMAT.md §2).
      // noScratch stays: the sheet is silent on scratches (GH-384 ruling —
      // documented silence; a pocketed CB has no rest position, so the
      // zone law already voids the attempt and the flag only names the
      // fail honestly).
      const ob = { x: 2 * ctx.r, y: 0 }; // one ball below the table center
      const pos = k + 1;
      // default address: a 35° cut on the pot line, head side — the stun
      // tangent then drives the CB foot-ward down the center string; the
      // real address is the per-shot in-hand grant (laid spot = default)
      const cue = cueOnCutLine(ctx, ob, 4, 35, 1.5);
      const rect = pos === 4
        ? paperRect(ctx, 0, ctx.l / 2 - (PAPER_ACROSS_D / 2) * ctx.D, 1, 0)
        : paperRect(ctx, 0, (pos <= 3 ? pos : 8 - pos) * ctx.D, 0, 1);
      rect.overlapR = ctx.r; // "within or overlapping the target": the BALL
                             // may overlap the paper — the rounded
                             // circle-vs-rect test (FORMAT.md §2, inZone)
      const objective = {
        pot: { ball: 1, pocket: 4 }, firstContact: 1, noScratch: true,
        cueRest: rect,
      };
      if (pos <= 3) objective.noCueCushion = true;
      else if (pos >= 5) objective.needFootCushion = true;
      return { balls: [{ id: 0, ...cue }, { id: 1, ...ob }], objective };
    },
  },
  {
    id: 'bu-f6', family: 'potting', tier: 'intermediate', corpus_id: 'DRILL-WEB-BU-F6',
    base_seed: '0x71ECFC7053F7218B', ruleset: 'nineball-sandbox', rack: 'nine',
    protocol: { kind: 'stations', count: 10, pointsPer: 1 }, maxScore: 10,
    cuePlacement: 'fixed', // BU F6 set shots: both balls spotted per station
                           // — the sheet grants NO hand placement (F6 p.6:
                           // "Shoot all 5 shots from each CB position";
                           // the F2-F4 vary-away-from-the-rail allowance
                           // does not extend to F6 — GH-384 ruling), and
                           // noScratch below is the sheet's LETTER ("You
                           // are not allowed to scratch"), the class's
                           // only explicit ban (F1 explicitly allows)
    attempt(ctx, k) {
      const s = F6_STATIONS[Math.min(k, F6_STATIONS.length - 1)];
      return {
        balls: [
          { id: 0, ...clampBed(ctx, pt(ctx, s.cue[0], s.cue[1])) },
          { id: 1, ...pt(ctx, s.ob[0], s.ob[1]) },
        ],
        objective: {
          pot: { ball: 1, pocket: s.pocket }, firstContact: 1, noScratch: true,
        },
      };
    },
  },
  {
    id: 'bu-f7', family: 'position', tier: 'advanced', corpus_id: 'DRILL-WEB-BU-F7',
    base_seed: '0xBE2A8E9063A0D12C', ruleset: 'nineball-sandbox', rack: 'nine',
    protocol: { kind: 'stations', count: 10, pointsPer: 2 }, maxScore: 20,
    cuePlacement: 'anywhere', // BU F7 wagon wheel: CB in hand every spoke
    attempt(ctx, k) {
      const tg = WHEEL_TARGETS_D[Math.min(k, WHEEL_TARGETS_D.length - 1)];
      const z = clampBed(ctx, pt(ctx, tg[0], tg[1]));
      return {
        balls: [
          { id: 0, ...pt(ctx, 2.5, 5) },
          { id: 1, ...pt(ctx, 1.5, 6.5) },
        ],
        objective: {
          pot: { ball: 1, pocket: 2 }, firstContact: 1, noScratch: true,
          // second point: cue rest on the spoke target (pot gates it)
          cueRest: { kind: 'circle', x: z.x, y: z.y, r: WHEEL_TOL_D * ctx.D },
          zoneOptional: true, // spoke miss = 1 point, not a failed attempt
        },
      };
    },
  },
  {
    id: 'circle', family: 'position', tier: 'advanced', corpus_id: 'DRILL-WEB-CIRCLE',
    base_seed: '0x7287650666670099', ruleset: 'nineball-sandbox', rack: 'fifteen',
    protocol: { kind: 'run', balls: 15 }, maxScore: 15,
    cuePlacement: 'fixed', // the containment law anchors the CB at the circle
                           // center (a zone-bounded in-hand grant is not in the
                           // v1 placement vocabulary — recorded in FORMAT.md §1a)
    attempt(ctx) {
      // 15 balls on a 1.55-diamond circle around table center, half-slot
      // rotated so no ball blocks a side-pocket mouth; cue at the center.
      // Containment law: the cue ball's center may NEVER leave the
      // 2-diamond circle at ANY sampled t (kernel sample(t) walk).
      const R = 1.55 * ctx.D, c = pt(ctx, 2, 4);
      const balls = [{ id: 0, ...c }];
      for (let i = 0; i < 15; i++) {
        const a = (2 * Math.PI * i) / 15 + Math.PI / 15;
        balls.push({ id: i + 1, x: c.x + R * Math.cos(a), y: c.y + R * Math.sin(a) });
      }
      return {
        balls,
        objective: {
          pot: { count: 1 }, noScratch: true,
          containCue: { x: c.x, y: c.y, r: 2.0 * ctx.D },
        },
      };
    },
  },
  {
    id: 'l-drill', family: 'position', tier: 'advanced', corpus_id: 'DRILL-WEB-LDRILL',
    base_seed: '0x4E8E518E451E0396', ruleset: 'nineball-sandbox', rack: 'nine',
    protocol: { kind: 'run', balls: 6 }, maxScore: 6,
    cuePlacement: 'anywhere', // Dr. Dave L drill: start with CB in hand
    attempt(ctx) {
      // six balls on an L around the foot-left corner, one diamond off the
      // rails; run them in any order — the cue may never touch a cushion
      const spots = [[1, 7], [2, 7], [3, 7], [1, 6], [1, 5], [1, 4]];
      return {
        balls: [
          { id: 0, ...pt(ctx, 2.2, 5.2) },
          ...spots.map((s, i) => ({ id: i + 1, ...pt(ctx, s[0], s[1]) })),
        ],
        objective: { pot: { count: 1 }, noScratch: true, noCueCushion: true },
      };
    },
  },
  {
    // 蛇彩 (the family headline, GH-131): the owner's ordered line-up —
    // half-diamond spacing, in hand anywhere, cleared foot-end-up. The
    // pre-131 any-ball 14.1-style free run is RETIRED (recorded decision:
    // no separate 'free line-up' card — the picker stays lean; the any-ball
    // register survives inside lineup-called's nomination law). The id is
    // KEPT so ob-drills-v1 bests survive — pre-131 bests were earned on
    // the unplayable dense layout (recorded semantics change).
    id: 'lineup', family: 'lineup', tier: 'advanced', corpus_id: 'DRILL-WEB-LINEUP',
    base_seed: '0x140113F9B1707698', ruleset: 'nineball-sandbox', rack: 'fifteen',
    protocol: { kind: 'run', balls: 15 }, maxScore: 15,
    cuePlacement: 'anywhere', // owner spec: CB in hand ANYWHERE at the start
    attempt(ctx) {
      // ball i at dy 7.5 − 0.5·(i−1); the default laid cue sits on ball 1's
      // straight pot line into the foot-left corner (the runner grants the
      // real in-hand affordance on top — FORMAT.md §1a 'anywhere')
      const cue = cueOnCutLine(ctx, pt(ctx, 2, 7.5), 2, 0, 1.6);
      const balls = lineupBalls(ctx, cue, (i) => 7.5 - 0.5 * (i - 1));
      return { balls, objective: lineupObjective() };
    },
  },
  {
    // 蛇彩·两端向中 (GH-131): the same string cleared from BOTH ends
    // alternately, converging on the middle ball (the Appleton/billiards101
    // odd-even-ends order ladder). Encoded as id placement: odd ids fill
    // foot-end-in, even ids head-end-in; id 15 is the center ball.
    id: 'lineup-e2m', family: 'lineup', tier: 'advanced',
    corpus_id: 'DRILL-WEB-LINEUP-E2M', base_seed: '0x761AC35AB8211009',
    ruleset: 'nineball-sandbox', rack: 'fifteen',
    protocol: { kind: 'run', balls: 15 }, maxScore: 15,
    cuePlacement: 'anywhere',
    attempt(ctx) {
      const cue = cueOnCutLine(ctx, pt(ctx, 2, 7.5), 2, 0, 1.6);
      const balls = lineupBalls(ctx, cue,
        (i) => (i % 2 ? 7.5 - 0.25 * (i - 1) : 0.5 + 0.25 * (i - 2)));
      return { balls, objective: lineupObjective() };
    },
  },
  {
    // 蛇彩·中间向两端 (GH-131): start on the CENTER ball, then alternate
    // outward toward both ends — the zhihu middle-ball-first alternating
    // ladder ("从中心那颗球打入一底袋 … 如此往复左右击打"). id 1 = center,
    // even ids walk to the foot end, odd ids to the head end.
    id: 'lineup-m2e', family: 'lineup', tier: 'advanced',
    corpus_id: 'DRILL-WEB-LINEUP-M2E', base_seed: '0xE76A6532A6F97B63',
    ruleset: 'nineball-sandbox', rack: 'fifteen',
    protocol: { kind: 'run', balls: 15 }, maxScore: 15,
    cuePlacement: 'anywhere',
    attempt(ctx) {
      // default cue on the straight line into the LEFT side pocket — the
      // natural first shot on the center ball
      const cue = cueOnCutLine(ctx, pt(ctx, 2, 4), 1, 0, 1.5);
      const balls = lineupBalls(ctx, cue,
        (i) => (i === 1 ? 4 : i % 2 ? 4 - 0.25 * (i - 1) : 4 + 0.25 * i));
      return { balls, objective: lineupObjective() };
    },
  },
  {
    // 蛇彩·乱序按号 (GH-131, EXPERT): the fifteen slots are SHUFFLED — a
    // seeded Fisher–Yates over the LAYOUT_GAMMA sub-stream (fixed draw
    // indices k = 0..13, so __drills.layout stays byte-identical across
    // boots) — and the line is cleared by BALL NUMBER wherever each ball
    // landed (the billiards101 random-layout ordered clear).
    id: 'lineup-random', family: 'lineup', tier: 'expert',
    corpus_id: 'DRILL-WEB-LINEUP-RANDOM', base_seed: '0x06290CBEBFD4E112',
    ruleset: 'nineball-sandbox', rack: 'fifteen',
    protocol: { kind: 'run', balls: 15 }, maxScore: 15,
    cuePlacement: 'anywhere',
    attempt(ctx, k, entrySeed) {
      const slots = Array.from({ length: 15 }, (_, s) => s);
      for (let i = 14, draw = 0; i > 0; i--, draw++) {
        const j = Math.floor(layoutUnit(entrySeed, draw) * (i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }
      // fixed off-string default cue (ball 1's slot varies with the draw;
      // the in-hand grant is the real address)
      const balls = lineupBalls(ctx, pt(ctx, 3, 2),
        (i) => lineSlotDy(slots[i - 1]));
      return { balls, objective: lineupObjective() };
    },
  },
  {
    // 横排蛇彩 (GH-131): fifteen balls ACROSS the table on dy 4.5 — half a
    // diamond on the FOOT side of the side-pocket line (row geometry +
    // TUNING knobs: the LAT_DY/latSlot block above). The foot corners
    // are the primary targets; cleared end to end in placement order
    // (ball 1 = the left-end ball).
    id: 'lineup-lateral', family: 'lineup', tier: 'advanced',
    corpus_id: 'DRILL-WEB-LINEUP-LATERAL', base_seed: '0x4778D02A493305C7',
    ruleset: 'nineball-sandbox', rack: 'fifteen',
    protocol: { kind: 'run', balls: 15 }, maxScore: 15,
    cuePlacement: 'anywhere',
    attempt(ctx) {
      const first = latSlot(ctx, 0);
      const balls = lateralBalls(ctx, cueOnCutLine(ctx, first, 2, 0, 1.5),
        (i) => i - 1);
      return { balls, objective: lineupObjective() };
    },
  },
  {
    // 横排蛇彩·两端向中 (GH-131 review finding 1 — the owner spec lists the
    // lateral row's order variants verbatim: 横向一排"同样地可以从一头清到
    // 另一头, 或者两头到中间, 中间到两头"): the SAME lateral row cleared
    // from BOTH ends alternately, converging on the middle ball. Encoded
    // as id placement, mirroring lineup-e2m: odd ids fill left-end-in,
    // even ids right-end-in; id 15 is the center ball.
    id: 'lineup-lat-e2m', family: 'lineup', tier: 'advanced',
    corpus_id: 'DRILL-WEB-LINEUP-LAT-E2M', base_seed: '0xCDCE96B5DADABF83',
    ruleset: 'nineball-sandbox', rack: 'fifteen',
    protocol: { kind: 'run', balls: 15 }, maxScore: 15,
    cuePlacement: 'anywhere',
    attempt(ctx) {
      // ball 1 shares the base row's left-end slot — same default cue
      const first = latSlot(ctx, 0);
      const balls = lateralBalls(ctx, cueOnCutLine(ctx, first, 2, 0, 1.5),
        (i) => (i % 2 ? (i - 1) / 2 : 14 - (i - 2) / 2));
      return { balls, objective: lineupObjective() };
    },
  },
  {
    // 横排蛇彩·中间向两端 (GH-131 review finding 1): start on the CENTER
    // ball of the lateral row, then alternate outward toward both ends —
    // lineup-m2e's law on the lateral slots. id 1 = the center slot; even
    // ids walk to the right end, odd ids to the left.
    // GH-384 mid-run BIH RULING (FORMAT.md §3.12): the two source
    // conventions diverge — Scott's Pool School's lateral-row PPP sheet
    // re-grants ball in hand on EACH shot (mypoolblog.com "Perfect
    // Position Practice" PDF, the layout source), while the 蛇彩 coaching
    // convention (the source of THIS middle-to-ends order) grants one
    // in-hand placement at the lay and then plays continuous position —
    // the cue plays where it lies (zhihu.com/question/31644672; baike
    // 蛇彩 entries). CHOSEN: the 蛇彩/run-out register (once at the start)
    // — it is the convention every other line-up source states (billiards101
    // "Start with ball in hand"; Billiard Gods "start with ball-in-hand …
    // within one inning"; the historic Line-Up game), the family-wide law
    // (FORMAT.md §1a: continues never re-grant placement) and the GH-131
    // owner spec ("cue ball in hand ANYWHERE at the start"). REJECTED: the
    // PPP per-shot re-grant — a positional-AIMING register (each shot an
    // isolated exercise) inconsistent with a run drill whose exercise IS
    // position onto the next ball.
    id: 'lineup-lat-m2e', family: 'lineup', tier: 'advanced',
    corpus_id: 'DRILL-WEB-LINEUP-LAT-M2E', base_seed: '0xDFA447748779F0CF',
    ruleset: 'nineball-sandbox', rack: 'fifteen',
    protocol: { kind: 'run', balls: 15 }, maxScore: 15,
    cuePlacement: 'anywhere',
    attempt(ctx) {
      // default cue on the center ball's straight pot line into the
      // foot-left corner — a side-pocket line from the center slot would
      // clip the row's neighbours (probed offline, find-lineup-recipes.mjs)
      const center = latSlot(ctx, 7);
      const balls = lateralBalls(ctx, cueOnCutLine(ctx, center, 2, 0, 1.5),
        (i) => (i === 1 ? 7 : i % 2 ? 7 - (i - 1) / 2 : 7 + i / 2));
      return { balls, objective: lineupObjective() };
    },
  },
  {
    // progressive-lineup (ADV→EXPERT): N balls (ids 1..N) down the long
    // string, run in ROTATION (lowest id first). Clear all N ⇒ next rack
    // lays N+1; any fail ⇒ N-1 (floor 3). score = the highest N fully
    // cleared. The runner passes the current rack size as the attempt's
    // second argument.
    id: 'progressive-lineup', family: 'lineup', tier: 'advanced',
    corpus_id: 'DRILL-WEB-PROGRESSIVE', base_seed: '0x2E5FB5296A1EC51E',
    ruleset: 'nineball-sandbox', rack: 'fifteen',
    protocol: { kind: 'progressive', start: 5, floor: 3, ceiling: 15, racks: 8 },
    maxScore: 15, cuePlacement: 'anywhere', // GH-131: in hand anywhere
    attempt(ctx, n) {
      // GH-131 owner geometry: N balls at the SAME half-diamond law on the
      // center string, span centered on the table (dy 4 ± (N−1)/4), ball 1
      // at the foot-most slot. Default cue on ball 1's foot-left pot line.
      const count = Math.max(3, Math.min(15, (n | 0) || 3));
      const first = 4 + (count - 1) * 0.25;
      const cue = cueOnCutLine(ctx, pt(ctx, 2, first), 2, 0, 1.6);
      const balls = lineupBalls(ctx, cue, (i) => first - 0.5 * (i - 1))
        .slice(0, count + 1);
      // cleanContact: the GH-134 family base rule (see lineupObjective)
      return { balls, objective: {
        rotation: true, pot: { count: 1 }, noScratch: true, cleanContact: true,
      } };
    },
  },
  {
    // L型蛇彩 (GH-131, EXPERT; REBUILT to the GH-136 owner photo spec — the
    // shipped rail-hugging L at the foot-left pocket was the wrong shape):
    // fifteen balls in an L WRAPPING the quadrant that CONTAINS the
    // foot-right pocket (kernel pocket 5) — 围住 that corner pocket. The
    // corner ball (id 8) sits ON the center string 2 diamonds off the foot
    // rail (pt(2, 6), the foot spot); leg A (ids 1..7) runs from just above
    // the FOOT-RAIL MIDPOINT up the center string to the corner; leg B
    // (ids 9..15) runs from the corner across to the RIGHT long rail —
    // each leg 7 balls evenly over its 2-diamond span, uniform step
    // (2D − m)/7 with m = the clampBed margin r + 1e-3, so the far-end
    // balls sit AT the margin beside their cushions. Clear order is
    // END-TO-END encoded as ID PLACEMENT (start at leg A's far end, through
    // the corner, finish at leg B's far end) — ascending-id rotation IS the
    // machine check. ONLY the enclosed pocket counts (objective.pot.pocket
    // — the GH-131 only-pocket law). Default cue 1.5D behind ball 1 on its
    // pocket-5 pot line (a near-straight shot along the foot cushion;
    // probed offline, find-lineup-recipes.mjs — the drawn cue returns up
    // the rail line, clear of leg A).
    id: 'lineup-l', family: 'lineup', tier: 'expert',
    corpus_id: 'DRILL-WEB-LINEUP-L', base_seed: '0xBA0A78D03BC94BDE',
    ruleset: 'nineball-sandbox', rack: 'fifteen',
    protocol: { kind: 'run', balls: 15 }, maxScore: 15,
    cuePlacement: 'anywhere',
    attempt(ctx) {
      const m = ctx.r + 1e-3; // the clampBed rail margin
      const step = (ctx.l / 4 - m) / 7; // 7 balls over a 2-diamond leg
      const legA = (i) => ({ x: 0, y: ctx.l / 2 - m - (i - 1) * step });
      const balls = [{ id: 0, ...cueOnCutLine(ctx, legA(1), 5, 0, 1.5) }];
      for (let i = 1; i <= 7; i++) balls.push({ id: i, ...legA(i) });
      balls.push({ id: 8, ...pt(ctx, 2, 6) }); // the corner ball
      for (let i = 9; i <= 15; i++) {
        balls.push({ id: i, x: (i - 8) * step, y: ctx.l / 4 });
      }
      return { balls, objective: lineupObjective(5) };
    },
  },
  {
    // L型蛇彩·两端向中 (GH-177, EXPERT): the IDENTICAL lineup-l layout
    // cleared from BOTH leg far ends alternately, converging on the CORNER
    // ball (potted LAST) — the lineup-lat-e2m id-placement mechanism over
    // the GH-136 L. Owner verbatim order (slots named by lineup-l's ids):
    // 现在的15打第2杆, 2打第3杆, 14打第4杆, …, 8打第15杆 — shot order over
    // the slots is 1,15,2,14,3,13,4,12,5,11,6,10,7,9,8. Encoded as ID
    // PLACEMENT over the same 15 slots (slot 1..7 = leg A far end in,
    // slot 8 = the corner, slot 9..15 = leg B corner-out): odd ids walk
    // leg A far-end-in (slot (i+1)/2), even ids walk leg B far-end-in
    // (slot 16 − i/2); id 15 lands on slot 8, the corner ball. Geometry,
    // enclosed-pocket-5 objective and the default cue are lineup-l's
    // byte-for-byte (ball 1 keeps slot 1, so the pinned first-ball recipe
    // replays identically — re-verified offline, find-lineup-recipes.mjs
    // under the GH-134 cueContacts === 1 criterion).
    id: 'lineup-l-e2m', family: 'lineup', tier: 'expert',
    corpus_id: 'DRILL-WEB-LINEUP-L-E2M', base_seed: '0x908C90CBF762A441',
    ruleset: 'nineball-sandbox', rack: 'fifteen',
    protocol: { kind: 'run', balls: 15 }, maxScore: 15,
    cuePlacement: 'anywhere',
    attempt(ctx) {
      const m = ctx.r + 1e-3; // the clampBed rail margin
      const step = (ctx.l / 4 - m) / 7; // 7 balls over a 2-diamond leg
      // slot s (1..15) → the lineup-l point (same expressions, same bytes)
      const slotPt = (s) => s <= 7
        ? { x: 0, y: ctx.l / 2 - m - (s - 1) * step } // leg A, far end in
        : s === 8 ? pt(ctx, 2, 6) // the corner ball's slot
          : { x: (s - 8) * step, y: ctx.l / 4 }; // leg B, corner out
      const balls = [{ id: 0, ...cueOnCutLine(ctx, slotPt(1), 5, 0, 1.5) }];
      for (let i = 1; i <= 15; i++) {
        balls.push({ id: i, ...slotPt(i % 2 ? (i + 1) / 2 : 16 - i / 2) });
      }
      return { balls, objective: lineupObjective(5) };
    },
  },
  {
    // 对角蛇彩 (GH-131, EXPERT; owner-specified): fifteen balls on the table
    // diagonal from pt(3.4, 6.8) (ball 1, the foot-right corner region) to
    // pt(0.6, 1.2), cleared pocket-nearest-first in rotation. c2c = span/14
    // ≈ 0.447D.
    // Issue GH-209 difficulty reduction (recorded — FORMAT.md §3.10): the
    // pre-GH-209 drill designated ONLY pocket 5 (lineupObjective(5)), but that
    // pocket sits on the diagonal's OWN collinear extension — the A→B line
    // IS the pocket-5 ray, so every pot into pocket 5 runs ALONG the packed
    // line: the ghost-ball contact point for each ball is ON the line
    // (behind it, where the next ball sits) and after contact the cue is
    // driven along the line into a scratch (toward the pocket) or a crash
    // (back into the pack). The first ball is openable but the run is NOT
    // clearable into one pocket (offline probe: a dense greedy search stalls
    // at ≤5/15 into pocket 5 — the same wall as the sibling only-pocket L),
    // and a real player's natural straight shot from the awkward cut default
    // sent ball 1 OFF pocket 5 into a non-designated pocket, failing the
    // only-pocket law and ending the run at 0/15 (issue GH-209 Bug 1). The
    // drill now runs the family BASE any-pocket law (`lineupObjective()`,
    // like `lineup`): each ball drops in its nearest pocket in rotation
    // order (cleanContact still applies), so the first natural pot SCORES
    // and the run continues instead of dead-ending at 0/15. What is
    // DEMONSTRATED is the reduction it was made for — the diagonal is
    // OPENABLE, the first natural pot scores and the run continues (e2e-drills
    // arm 16c), and a short finish parks with the correct RUN ENDED label (arm
    // 19e). It is NOT proven to a full 15/15 any-pocket clear: the `lineup`
    // CHAIN19 proves the STRAIGHT lineup to 15, but the packed diagonal (c2c
    // ≈ 0.447D) has no offline probe walking it to a 15-ball any-pocket clear.
    // The only-pocket law is still exercised by `lineup-l`/`lineup-l-e2m`
    // (pocket 5).
    // TUNING: the owner anchor is unpinned — adjust the A/B endpoints only.
    id: 'lineup-diagonal', family: 'lineup', tier: 'expert',
    corpus_id: 'DRILL-WEB-LINEUP-DIAGONAL', base_seed: '0x58F2CD113695372B',
    ruleset: 'nineball-sandbox', rack: 'fifteen',
    protocol: { kind: 'run', balls: 15 }, maxScore: 15,
    cuePlacement: 'anywhere',
    attempt(ctx) {
      const A = { x: 3.4, y: 6.8 }, B = { x: 0.6, y: 1.2 };
      // default cue on a 45° cut line toward pocket 5 — the straight
      // extension of the ball-1 pot line is occupied by the line itself, so
      // the laid cue approaches ball 1 off-line and its post-pot tangent
      // clears the line (GH-134 sweep, find-lineup-recipes.mjs). Under the
      // any-pocket law the player is free to send ball 1 into any pocket;
      // the laid default remains the natural foot-right-corner pot.
      const balls = [{ id: 0, ...cueOnCutLine(ctx, pt(ctx, A.x, A.y), 5, 45, 1.5) }];
      for (let i = 1; i <= 15; i++) {
        const t = (i - 1) / 14;
        balls.push({
          id: i, ...pt(ctx, A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t),
        });
      }
      return { balls, objective: lineupObjective() };
    },
  },
  {
    id: 'ghost9', family: 'pattern', tier: 'advanced', corpus_id: 'DRILL-WEB-GHOST9',
    base_seed: '0x172063ABEAD3D447', ruleset: 'nineball-v1', rack: 'rack',
    protocol: { kind: 'racks', count: 10 }, maxScore: 10,
    cuePlacement: 'kitchen', // WPA 5.3(a) break: CB in hand behind the
                             // head string at every rack start
    postBreakBih: 'anywhere', // the ghost convention's opener (Dr. Dave
                              // rating sheet: after the break, pocket or
                              // not, take ball in hand anywhere once,
                              // then run out) — GH-370 class 5; the
                              // pre-370 no-BIH divergence is RETIRED
    // Rack drills carry no explicit layout: rack n IS the kernel's seeded
    // nine-ball rack at rackSeed(n) (the DRILL-RACK convention). Scoring is
    // the official playing-the-ghost table: break, then run out — any miss
    // or foul after the break loses the rack; a legal 9 wins it.
    // TUNING: a break foul loses the rack (GHOST_BREAK_FOUL).
    attempt() { return null; },
  },
  {
    // issue GH-119 Part 1: renamed off 'snake/蛇彩' — this is the snooker
    // COLOUR-CLEARANCE sequence (six colours on their spots), NOT 蛇彩 (the
    // 蛇彩/"snake balls" line-up is the fifteen-ball `lineup` drill). Only
    // the id/corpus_id/base_seed/labels changed; behaviour is byte-identical.
    id: 'colours-clear', family: 'snooker', tier: 'advanced',
    corpus_id: 'DRILL-WEB-COLOURS-CLEAR',
    base_seed: '0xA2B1844857FED5E7', ruleset: 'snooker-v1', rack: 'snooker',
    discipline: 'snooker',
    protocol: { kind: 'sequence', order: [16, 17, 18, 19, 20, 21] },
    maxScore: 6,
    cuePlacement: 'd', // in hand in the D to start (WPBSA Sec3 R5 —
                       // Playing from In-hand; issue #62 erratum)
    attempt(ctx) {
      // Clearing the colours: the six colours ON THEIR SPOTS (kernel-mirror
      // ctx — yellow/green/brown on the baulk line, blue centre, pink,
      // black), potted in WPBSA ascending order over the live final_colours
      // fold.
      // Legal pots stay down (R3(h)(ii)); a foul or dry stroke ends the run.
      const order = this.protocol.order;
      return {
        balls: [
          { id: 0, ...ctx.cueDefault },
          ...order.map((id) => ({ id, ...ctx.spots[id] })),
        ],
        objective: { sequence: [...order] },
      };
    },
  },
  {
    // issue GH-119 Part 1: renamed off 'snake-lateral' — colours lined across
    // the table (a valid snooker clearance drill, not 蛇彩).
    id: 'colours-line', family: 'snooker', tier: 'advanced',
    corpus_id: 'DRILL-WEB-COLOURS-LINE',
    base_seed: '0xFAC353E32E4584F8', ruleset: 'snooker-v1', rack: 'snooker',
    discipline: 'snooker',
    protocol: { kind: 'sequence', order: [16, 17, 18, 19, 20, 21] },
    maxScore: 6,
    cuePlacement: 'd', // same law: cue in hand in the D to start
    attempt(ctx) {
      // Colours across: the colours LINED ACROSS the table, potted left to
      // right. TUNING: evenly spaced on the blue spot's cross line (y = 0),
      // w/7 apart — the end balls sit 0.254 m off the side cushions on the
      // WPBSA table, an honest middle/corner-pot distance (the #66 research
      // record states no canonical sheet; adjust LAT_Y_M/the spacing only).
      // Yellow leftmost → black rightmost: left-to-right IS the ascending
      // value order the live final_colours fold enforces. The respot law is
      // the drill's teaching point: a fouled-in colour returns to its TRUE
      // spot (Sec3 R7), not its lateral slot.
      const LAT_Y_M = 0;
      const order = this.protocol.order;
      return {
        balls: [
          { id: 0, ...ctx.cueDefault },
          ...order.map((id, i) => ({
            id, x: -ctx.w / 2 + ((i + 1) * ctx.w) / 7, y: LAT_Y_M,
          })),
        ],
        objective: { sequence: [...order] },
      };
    },
  },

  // ==== challenge tier (issue GH-119) ==========================================
  {
    // lineup-called (蛇彩 anchor, EXPERT): the fifteen-ball line-up run as a
    // CALLED-shot run-out. Every pot must drop in the NOMINATED pocket
    // (window.__drills.call — a drills-owned nomination, since the nineball
    // sandbox fold exposes no call(); FORMAT.md §3.8). A dry / scratched /
    // wrong-pocket stroke ends the run. Un-nominated strokes count as SLOP
    // (still scored, streak reset) — the slop→called ladder. score = balls run.
    // GH-384 reset-scope RULING (FORMAT.md §3.12): the emulated source is
    // the BilliardsForum instructor called line-up (billiardsforum.com/
    // learn-to-play-pool/list-of-billiard-drills-round-2), whose reset
    // triggers are (1) OB misses the DESIRED pocket, (2) scratch, (3) the
    // cue ball hits more than 1 ball per shot, (4) an object ball crashes
    // into another ball or back into the cue ball. CHOSEN scope: triggers
    // 1-3 exactly as enforced here (wrong-called-pocket / noScratch /
    // cue-ball-only cleanContact). REJECTED: trigger 4 — object↔object
    // (and object→cue) crash resets — inconsistent with the family-wide
    // owner-scoped CUE-BALL-ONLY clean-contact boundary (FORMAT.md §2);
    // a single forum source does not overturn a recorded owner scope. The
    // slop register (un-nominated strokes score) is the separately recorded
    // v1 boundary of §3.8 (slop→called ladder = recorded follow-up), not
    // part of this ruling.
    id: 'lineup-called', family: 'lineup', tier: 'expert',
    corpus_id: 'DRILL-WEB-LINEUP-CALLED', base_seed: '0x5BFF5FF79013921B',
    ruleset: 'nineball-sandbox', rack: 'fifteen',
    protocol: { kind: 'called', balls: 15 }, maxScore: 15,
    cuePlacement: 'anywhere', // GH-131: the family's in-hand-anywhere start
    attempt(ctx) {
      // same half-diamond long-string layout as `lineup` (GH-131 owner
      // geometry). Its law stays the NOMINATION (any ball, called pocket)
      // — protocol.kind 'called' is aim.js's recorded coupling, and this
      // entry carries the pre-131 any-ball register of the drill.
      const cue = cueOnCutLine(ctx, pt(ctx, 2, 7.5), 2, 0, 1.6);
      const balls = lineupBalls(ctx, cue, (i) => 7.5 - 0.5 * (i - 1));
      // cleanContact: the GH-134 family base rule (see lineupObjective)
      return { balls, objective: {
        called: true, noScratch: true, cleanContact: true,
      } };
    },
  },
  {
    // ghost10 (EXPERT): 10-ball ghost. A JS-laid ten-ball triangle (kernel
    // has no 'ten' rack kind — issue GH-119 path (a), FORMAT.md §3.7): break
    // from a ball-in-hand kitchen (WPA 6.3(a); the source sheet itself is
    // looser — break from anywhere — so 'kitchen' is a recorded WPA
    // tightening), then take ball in hand ANYWHERE after EVERY break
    // (postBreakBih — the ghost convention: "After the break, take ball in
    // hand and run out, in rotation", Joe Tucker via
    // drdavepoolinfo.com/faq/rating/10-ball/) and run 1→10 in ROTATION.
    // A break SCRATCH is play-on: −2, balls potted on the scratch spot
    // back, BIH anywhere ("take ball in hand even if you scratch" — Dr.
    // Dave note); a mid-run miss/foul ends the rack. score = balls potted
    // across ten racks (break pots count on legal breaks). GH-370 class 5;
    // the rating bands below are the source drill's BIH-calibrated chart.
    // (Call-pocket is a recorded follow-up — the sandbox fold has no call;
    // rotation + scratch are the byte-checkable v1 objective, FORMAT.md §3.8.)
    id: 'ghost10', family: 'pattern', tier: 'expert',
    corpus_id: 'DRILL-WEB-GHOST10', base_seed: '0xE3ACF3C2A179B999',
    ruleset: 'nineball-sandbox', rack: 'fifteen',
    protocol: { kind: 'ten', racks: 10, scratchPenalty: 2 }, maxScore: 100,
    rating: RATING_GHOST10, cuePlacement: 'kitchen',
    postBreakBih: 'anywhere',
    attempt(ctx) { return tenRack(ctx); },
  },
  {
    // rotation15 (ADVANCED, LOWER-is-better): the Dr Dave 15-ball rotation
    // rating. Seeded fifteen-ball racks; rotation via firstContact; slop
    // counts. Penalties accrue per stroke — miss +1, scratch +1, cue
    // off-table +1, object ball off-table +1 (spotted, per the sheet),
    // wrong-first +2, plus +1 ball-in-hand ceded on any foul; voluntary
    // ball-in-hand +1 per use (the sheet's core affordance — the dock ✋
    // button). score = total penalties across the racks (lower = better
    // rating). GH-370 class 5 placement zones (the deferred rule body is
    // standard 9-ball, WPA 5.7 via 1.6): foul BIH is ANYWHERE
    // (foulPlacement), never the break's kitchen class; the per-rack
    // break keeps 'kitchen' (WPA 5.3(a)). Spot law (the sheet): off-table
    // OBs spot; on a legal-hit make-and-scratch non-lowest pots spot (the
    // lowest stays down); break pots stay down even on a scratch.
    // Recorded tuning vs the sheet: 3 racks (not 10) against the same
    // published bands.
    id: 'rotation15', family: 'rotation', tier: 'advanced',
    corpus_id: 'DRILL-WEB-ROTATION15', base_seed: '0x9024B35762F55508',
    ruleset: 'nineball-sandbox', rack: 'fifteen',
    protocol: { kind: 'penalty', racks: 3 }, maxScore: 100,
    lowerIsBetter: true, rating: RATING_ROTATION, cuePlacement: 'kitchen',
    foulPlacement: 'anywhere', voluntaryBih: 'anywhere',
    attempt() { return null; }, // rack-based: the runner lays via rerackKind
  },
  {
    // mighty-x (ADV→EXPERT, Kinister): a dead-straight long pot into the
    // foot-right corner (pocket 5) with the cue collinear behind the OB. The
    // distance ladder lengthens the shot 3..7 diamonds and the cue-rest
    // circle tightens 0.18 → 0.09 diamonds per rung ("the cue replaces the
    // OB" — a perfect stop leaves the cue on the OB's contact point).
    id: 'mighty-x', family: 'position', tier: 'expert',
    corpus_id: 'DRILL-WEB-MIGHTYX', base_seed: '0x9634BFAFF025B4E9',
    ruleset: 'nineball-sandbox', rack: 'nine',
    protocol: { kind: 'ladder', steps: 5, shots: 10 }, maxScore: 11,
    cuePlacement: 'fixed',
    attempt(ctx, k) {
      const MX_DIST_D = [3, 4, 5, 6, 7];
      const MX_TOL_D = [0.18, 0.1575, 0.135, 0.1125, 0.09];
      const i = Math.min(k, MX_DIST_D.length - 1);
      const pk = ctx.pockets[5];
      const toCenter = unit(pk.x, pk.y, 0, 0);
      const ob = clampBed(ctx, { x: pk.x + toCenter.x * MX_DIST_D[i] * ctx.D,
        y: pk.y + toCenter.y * MX_DIST_D[i] * ctx.D });
      const u = unit(ob.x, ob.y, pk.x, pk.y); // shot line OB→pocket
      const cue = clampBed(ctx,
        { x: ob.x - u.x * 1.5 * ctx.D, y: ob.y - u.y * 1.5 * ctx.D });
      const gx = ob.x - u.x * 2 * ctx.r, gy = ob.y - u.y * 2 * ctx.r; // stop ghost
      return {
        balls: [{ id: 0, ...cue }, { id: 1, ...ob }],
        objective: {
          pot: { ball: 1, pocket: 5 }, firstContact: 1, noScratch: true,
          cueRest: { kind: 'circle', x: gx, y: gy, r: MX_TOL_D[i] * ctx.D },
        },
      };
    },
  },
  {
    // century (EXPERT): 14.1 continuous high-run over the REAL fourteenone-v1
    // fold (the ghost9 observer pattern). The runner pins the game to
    // straight_pool (SESSION-only — setTransientGame, FORMAT.md §3.9, since
    // 14.1 shares the active 2:1 pool table) and OBSERVES the fold's run:
    // every legal called pot extends the run, a miss or foul ends it. score =
    // the high run reached; milestone ladder 14 → 28 → 50 → 100 (Century).
    id: 'century', family: 'pattern', tier: 'expert',
    corpus_id: 'DRILL-WEB-CENTURY', base_seed: '0x91E3357B10ED81E9',
    ruleset: 'fourteenone-v1', gamePin: 'straight_pool', rack: 'fifteen',
    protocol: { kind: 'fourteenone', milestones: [14, 28, 50, 100] }, maxScore: 100,
    cuePlacement: 'kitchen',
    attempt() { return null; }, // observer over the live 14.1 fold
  },
];

/** Rack seed for rack `n` of a racks-protocol drill: the entry seed folded
 * into the app's rack-seed domain (share-codec MAX_RACK_SEED = 2^31 —
 * the documented web mapping, FORMAT.md §3). */
export function rackSeedFor(drill, n) {
  return Number(shotSeed(BigInt(drill.base_seed), n) % 2147483648n);
}

export function getDrill(id) {
  return DRILLS.find((d) => d.id === id) ?? null;
}
