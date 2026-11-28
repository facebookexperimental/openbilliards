// Copyright (c) Meta Platforms, Inc. and affiliates.

// respot.ts — spot/placement geometry for the rules layer: foot-spot respot
// of the 9 with occupied-spot fallback along the long string, plus the
// ball-in-hand cue placement validity test (kernel table frame: x across
// [-w/2, w/2], y along [-l/2 head .. +l/2 foot]; the rack apex sits on the
// foot spot at (0, l/4)). Pure geometry over the SDK Table type — the
// kernel re-validates every placement at simulate time (scenario.ts).

import type { Table } from '../types.js';

/** Same safety margin web/app game.js uses for interactive placement: the
 * kernel admits gaps down to 2r − EPS_KISS; we place with clear daylight. */
export const PLACE_CLEARANCE = 1e-4;

/** Frozen-contact daylight (GH-370): the exact margin web/app game.js
 * kernelPlacements relaxes settled near-contacts to (2r + 1e-9), i.e. the
 * kernel-admissible "touching" separation. snapToContact projects blocked
 * in-hand requests onto it. */
export const CONTACT_EPS = 1e-9;

/** Kernel kiss tolerance mirror (pool-core Eps::KISS = 1e-6): pairs no
 * deeper than this inside 2r are validator-admissible (and game.js
 * kernelPlacements deterministically relaxes them at scenario build). */
const KISS_TOL = 1e-6;

export interface SpotXY { x: number; y: number }

/** The foot spot: rack-apex point on the long string, (0, +length/4). */
export function footSpot(table: Table): SpotXY {
  return { x: 0, y: table.length / 4 };
}

/** The head spot: the long-string point at (0, −length/4) — the WPA 7.8
 * Table 1 interference spot (feature 025). Mirror image of the foot spot
 * in the kernel frame (head rail at y = −length/2). */
export function headSpot(table: Table): SpotXY {
  return { x: 0, y: -table.length / 4 };
}

/** The center spot: the table's midpoint (0, 0) — the WPA 7.8 Table 1
 * fallback when the head spot is blocked (feature 025). */
export function centerSpot(_table: Table): SpotXY {
  return { x: 0, y: 0 };
}

/** True when a ball of radius r centered at `spot` fits: fully on the bed
 * (a radius clear of each cushion nose) and at least 2r + PLACE_CLEARANCE
 * from every obstacle ball center (uniform radius r, kernel v1). */
export function placementFits(
  table: Table, r: number, spot: SpotXY, obstacles: SpotXY[],
): boolean {
  const maxX = table.width / 2 - r - PLACE_CLEARANCE;
  const maxY = table.length / 2 - r - PLACE_CLEARANCE;
  if (Math.abs(spot.x) > maxX || Math.abs(spot.y) > maxY) return false;
  const min = 2 * r + PLACE_CLEARANCE;
  return obstacles.every(
    (o) => Math.hypot(o.x - spot.x, o.y - spot.y) >= min);
}

/**
 * Frozen-placement assist for the IN-HAND cue ball (GH-370 class 3): WPA
 * 1.6 places the in-hand cue "anywhere on the playing surface" with no
 * contact prohibition, and WPA 3.7 explicitly legalizes shooting with the
 * cue ball touching an object ball — so a request that falls inside the
 * placementFits daylight law must SNAP to the kernel-admissible contact
 * separation instead of being refused. Resolution law (deterministic,
 * single-step — no iteration):
 *   1. a request that already fits (placementFits) resolves to ITSELF;
 *   2. a request whose nearest obstacle sits within the validator's kiss
 *      band (d ≥ 2r − KISS_TOL) resolves to ITSELF VERBATIM — this arm is
 *      the replay-identity law: a recorded snapped landing (d = 2r +
 *      CONTACT_EPS) re-applies byte-exactly instead of being re-projected
 *      through rounding;
 *   3. a genuinely overlapping request projects along the nearest
 *      obstacle→request direction to exactly 2r + CONTACT_EPS, is bed-
 *      clamped, and is accepted iff every obstacle then clears 2r −
 *      KISS_TOL (multi-ball squeezes and rail-pinched contacts refuse).
 * Returns the resolved point or null (caller keeps the refusal behavior).
 *
 * OBJECT-BALL SPOTTING IS DELIBERATELY UNTOUCHED: WPA 1.5 mandates
 * spotting IN CONTACT with interfering object balls (cue-ball excepted),
 * but respotBallSpot's r/4-quantized daylight walk is a recorded v1
 * approximation (docs/research/rules-audit/audit-9ball.md §7) whose
 * placements are DERIVED at replay time — changing it forks historical
 * shared-replay re-derivation, so it stays a phase-2 item (GH-371).
 */
export function snapToContact(
  table: Table, r: number, spot: SpotXY, obstacles: SpotXY[],
): SpotXY | null {
  if (placementFits(table, r, spot, obstacles)) return { ...spot };
  const p = clampToBed(table, r, spot);
  let near: SpotXY | null = null;
  let nd = Infinity;
  for (const o of obstacles) {
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d < nd) { nd = d; near = o; }
  }
  if (!near) return null; // bed-clamp shortfall with no obstacle: refuse
  if (nd >= 2 * r - KISS_TOL) {
    // kiss band (or clear of the nearest but rail-pinched): verify the
    // REST of the field at the same admissibility law and accept verbatim
    const ok = obstacles.every(
      (o) => Math.hypot(o.x - p.x, o.y - p.y) >= 2 * r - KISS_TOL);
    return ok ? { ...p } : null;
  }
  if (nd < 1e-12) return null; // degenerate: request at an obstacle center
  const ux = (p.x - near.x) / nd, uy = (p.y - near.y) / nd;
  const cand = clampToBed(table, r, {
    x: near.x + ux * (2 * r + CONTACT_EPS),
    y: near.y + uy * (2 * r + CONTACT_EPS),
  });
  const ok = obstacles.every(
    (o) => Math.hypot(o.x - cand.x, o.y - cand.y) >= 2 * r - KISS_TOL);
  return ok ? cand : null;
}

/**
 * Where to respot a ball (feature 011 parametrization, ball-id-free —
 * contracts/ruleset-api.md "respot geometry"): the foot spot, or — when
 * occupied — the nearest legal point on the long string, searching TOWARD
 * the foot rail first and, if that whole segment is blocked, back toward
 * the center of the table. Returns null only if the entire long string is
 * blocked (unreachable in practice). This occlusion order serves both
 * 9-ball 9-spotting and WPA 4.7 8-ball spotting of the 8 — the geometry
 * never depended on the ball's identity.
 */
export function respotBallSpot(
  table: Table, r: number, obstacles: SpotXY[],
): SpotXY | null {
  const spot = footSpot(table);
  const step = r / 4;
  const maxY = table.length / 2 - r - PLACE_CLEARANCE;
  for (let y = spot.y; y <= maxY; y += step) {
    const p = { x: 0, y };
    if (placementFits(table, r, p, obstacles)) return p;
  }
  const minY = -(table.length / 2) + r + PLACE_CLEARANCE;
  for (let y = spot.y - step; y >= minY; y -= step) {
    const p = { x: 0, y };
    if (placementFits(table, r, p, obstacles)) return p;
  }
  return null;
}

/** Frozen alias: the shipped 9-ball respot IS the parametrized geometry
 * (export + behavior byte-unchanged; web/app/flow.js imports this name on
 * the boot path). */
export function respotNineSpot(
  table: Table, r: number, obstacles: SpotXY[],
): SpotXY | null {
  return respotBallSpot(table, r, obstacles);
}

/** Clamp a requested cue-ball-in-hand point to the playable bed (anywhere
 * on the table — 9-ball ball-in-hand has no kitchen restriction). */
export function clampToBed(table: Table, r: number, spot: SpotXY): SpotXY {
  const maxX = table.width / 2 - r - PLACE_CLEARANCE;
  const maxY = table.length / 2 - r - PLACE_CLEARANCE;
  return {
    x: Math.min(maxX, Math.max(-maxX, spot.x)),
    y: Math.min(maxY, Math.max(-maxY, spot.y)),
  };
}

// ---- feature 012 discipline respot plans (contracts/rulesets-012.md §2) ----
// Judges keep emitting BALL IDS ONLY (Judgment.respot, 011 semantics); the
// pure helpers below derive the target spots from layouts.ts data + the
// final ShotRecord positions — placements are DERIVED, never recorded, so
// replays re-derive identical spots on every platform (research.md R6).

/** One planned placement: ball id → target spot. */
export interface RespotPlacement { ball: number; xy: SpotXY }

/** True when a ball at `spot` clears every obstacle by 2r + clearance and
 * sits on the bed of a `dims`-sized table. */
function fitsAt(
  dims: { length: number; width: number }, r: number, spot: SpotXY,
  obstacles: readonly SpotXY[],
): boolean {
  const maxX = dims.width / 2 - r - PLACE_CLEARANCE;
  const maxY = dims.length / 2 - r - PLACE_CLEARANCE;
  if (Math.abs(spot.x) > maxX || Math.abs(spot.y) > maxY) return false;
  const min = 2 * r + PLACE_CLEARANCE;
  return obstacles.every(
    (o) => Math.hypot(o.x - spot.x, o.y - spot.y) >= min);
}

/**
 * Snooker colour respot plan — WPBSA Sec3 R7 transcription:
 * (a) a colour returns to its OWN spot;
 * (b) own spot occupied → the highest-VALUE vacant spot;
 * (c) all spots occupied → the nearest point between its OWN spot and the
 *     nearest point on the top cushion (i.e. straight up the line x =
 *     own.x), never touching another ball. Issue #90 erratum: this
 *     previously searched the table CENTRE line (x = 0), which is wrong
 *     for yellow/green whose spots sit at x = ±0.292 (rulesets-012.md §2
 *     Amendment A2). PINK/BLACK sub-clause: when there is no space
 *     between the spot and the top cushion, the pink/black is placed as
 *     near its own spot as possible on the CENTRE LINE of the table
 *     BELOW the spot (toward the bottom cushion) — rulesets-012.md §2
 *     Amendment A3; omitting this arm silently dropped the colour from
 *     the plan (ball never returned → frame soft-lock).
 * Multiple colours resolve HIGHEST VALUE FIRST (spec edge case), each
 * placement becoming an obstacle for the next.
 *
 * `balls` = final positions of every ball still on the table (from the
 * ShotRecord; do NOT include the colours being respotted); `ids` = the
 * colour ids the judgment's `respot` carries (16–21). Pure function of
 * serializable inputs. Returns placements in resolution order; a colour
 * with no legal point (unreachable in practice) is omitted.
 */
export function snookerRespotPlan(
  layout: import('../games/layouts.js').SnookerLayout,
  balls: readonly SpotXY[],
  ids: readonly number[],
): RespotPlacement[] {
  const r = layout.ballR;
  const obstacles: SpotXY[] = [...balls];
  const plan: RespotPlacement[] = [];
  // highest value first (black 21 … yellow 16)
  const order = [...ids].sort((a, b) => b - a);
  // spot ids by descending value for the (b) fallback
  const spotsByValue = ([21, 20, 19, 18, 17, 16] as const);
  for (const id of order) {
    const own = layout.spots[id as 16 | 17 | 18 | 19 | 20 | 21];
    if (own === undefined) continue; // non-colour id: judge bug, skip
    let target: SpotXY | null = null;
    if (fitsAt(layout.table, r, own, obstacles)) {
      target = own; // (a) own spot
    } else {
      for (const sid of spotsByValue) { // (b) highest-value vacant spot
        const s = layout.spots[sid];
        if (fitsAt(layout.table, r, s, obstacles)) {
          target = s;
          break;
        }
      }
    }
    if (target === null) { // (c) from the OWN spot toward the top cushion
      const step = r / 4;
      const maxY = layout.table.length / 2 - r - PLACE_CLEARANCE;
      for (let y = own.y; y <= maxY; y += step) {
        const p = { x: own.x, y };
        if (fitsAt(layout.table, r, p, obstacles)) {
          target = p;
          break;
        }
      }
      // Sec3 R7 pink/black sub-clause (Amendment A3): no space between
      // the spot and the top cushion → as near the spot as possible on
      // the centre line of the table BELOW the spot. Pink (20) / black
      // (21) only — the rule grants no downward arm to the other colours.
      if (target === null && (id === 20 || id === 21)) {
        const minY = -(layout.table.length / 2) + r + PLACE_CLEARANCE;
        for (let y = own.y - step; y >= minY; y -= step) {
          const p = { x: 0, y };
          if (fitsAt(layout.table, r, p, obstacles)) {
            target = p;
            break;
          }
        }
      }
    }
    if (target !== null) {
      plan.push({ ball: id, xy: { ...target } });
      obstacles.push(target);
    }
  }
  return plan;
}

/**
 * Carom respot plan — UMB Art 27.3(b) / 28.1(b): jumped/off-table balls
 * return to their designated spots — red (2) → top spot, the SHOOTER's
 * cue ball → bottom spot, the opponent's ball → centre spot. A designated
 * spot that is occupied or masked (another ball within 2r + clearance)
 * sends the ball to the spot OF THE BALL OCCUPYING IT (the swap rule);
 * if that is also unavailable the remaining spot(s) resolve in the fixed
 * top → bottom → centre order (deterministic extension of the swap rule
 * for the double-occupied edge, documented here). Only the balls
 * CONCERNED (`ids`) are respotted.
 *
 * `balls` = the final positions of ALL THREE balls indexed by carom ball
 * id (0 breaker-white, 1 opponent, 2 red — the kernel layout ids);
 * off-table balls keep their recorded final positions but are excluded
 * from occupancy checks. `shooter` maps cue-ball ownership under the
 * FIXED ball-0-is-seat-1 convention: `shooter === 1` puts ball 0 on the
 * bottom spot, `shooter === 2` ball 1. CONTRACT (Art 27.3(b), audit
 * finding F5 resolved by GH-383): "the white ball of the player who
 * wants to play" is the INCOMING striker after the turn passed — the
 * caller passes the seat-convention argument for the incoming striker's
 * BALL: `incomingBall === 0 ? 1 : 2`. Under the v1 shared-white residual
 * the incoming ball is always 0 (pass 1, the shipped pre-GH-383 call);
 * under the two-cue variant the incoming ball is
 * `seat === breaker ? 0 : 1` for the judgment's `next.shooter`.
 */
/**
 * The judged 14.1 re-rack plan block (feature 025 — the wire twin of the
 * crate's `FourteenOneRerack`; rides the match state while
 * `phase === "rerack"`). Zone MEMBERSHIP (WPA 7.8 Table 1) is judged
 * CRATE-side (the feature-025 spec, internal, recorded decision 1) —
 * this module only EXECUTES the plan geometrically.
 */
export interface FourteenOneRerackPlan {
  /** `"partial"` (14 re-racked, apex vacant) | `"full"` (all fifteen). */
  kind: 'partial' | 'full';
  /** The break ball (fifteenth) id staying up on a partial re-rack;
   * null on a full re-rack. */
  fifteenth: number | null;
  fifteenthSpot: 'stays' | 'head_spot' | 'center_spot' | 'racked';
  cueSpot: 'stays' | 'kitchen' | 'head_spot' | 'center_spot';
}

/**
 * Execute a judged 14.1 re-rack plan (WPA 7.2/7.8; feature 025, issue
 * #65): map the plan block onto concrete placements over the ACTIVE rack
 * template's lattice.
 *
 * `slots` = the 15 lattice ball positions of the active template's
 * scenario in KERNEL OFFSETS ORDER (the rack-ball ARRAY order, apex
 * first — the games/rack.ts slot law; never a coordinate sort). The
 * lattice is a pure function of the rack seed, so replays re-derive
 * identical placements with zero new wire (research R6; the re-rack is
 * judgment-derived, never recorded).
 *
 * - partial: the 14 re-racked ids (1..15 minus `fifteenth`, ascending)
 *   fill slots 1..14 — the APEX (slot 0, the foot spot) stays vacant
 *   (7.2: "the fourteen balls are racked with the space at the apex
 *   vacant"); the 15th moves only when the judged plan says so
 *   (`head_spot` / `center_spot`), the cue likewise (`kitchen` returns
 *   as-is — the in-hand placement right already rides the judgment).
 * - full: all fifteen ids fill slots 0..14 (`fifteenthSpot: "racked"`).
 *
 * The lattice positions are used VERBATIM (frozen contacts + seeded
 * micro-gaps included — recorded decision 4: kernelPlacements() owns the
 * near-contact sanitation deterministically; padded daylight would
 * visibly diverge from the rulebook's tight rack).
 */
export function fourteenOneRerackPlacements(
  slots: readonly SpotXY[],
  table: { length: number; width: number },
  plan: FourteenOneRerackPlan,
): { balls: RespotPlacement[]; cue: 'stays' | 'kitchen' | SpotXY } {
  if (slots.length !== 15) {
    throw new Error(
      `fourteenOneRerackPlacements: expected the 15 lattice slots, got `
      + `${slots.length}`);
  }
  const spotOf = (s: 'head_spot' | 'center_spot'): SpotXY =>
    (s === 'head_spot'
      ? { x: 0, y: -table.length / 4 }
      : { x: 0, y: 0 });
  const racked: number[] = [];
  for (let id = 1; id <= 15; id++) {
    if (plan.kind === 'full' || id !== plan.fifteenth) racked.push(id);
  }
  const base = plan.kind === 'full' ? 0 : 1; // partial: apex vacant
  if (racked.length !== slots.length - base) {
    // a malformed partial plan (fifteenth null, or an id outside 1..15)
    // would otherwise spread `undefined` slots into coordinate-less
    // placements — NaN downstream instead of a diagnosable refusal
    throw new Error(
      'fourteenOneRerackPlacements: partial plan must name the fifteenth '
      + `ball (got ${plan.fifteenth}) — ${racked.length} re-racked ids `
      + `for ${slots.length - base} slots`);
  }
  const balls: RespotPlacement[] = racked.map((ball, k) => (
    { ball, xy: { ...slots[base + k]! } }));
  if (plan.kind === 'partial' && plan.fifteenth !== null
    && (plan.fifteenthSpot === 'head_spot'
      || plan.fifteenthSpot === 'center_spot')) {
    balls.push({ ball: plan.fifteenth, xy: spotOf(plan.fifteenthSpot) });
  }
  const cue = (plan.cueSpot === 'head_spot' || plan.cueSpot === 'center_spot')
    ? spotOf(plan.cueSpot)
    : plan.cueSpot;
  return { balls, cue };
}

export function caromRespotPlan(
  layout: import('../games/layouts.js').CaromLayout,
  balls: readonly SpotXY[],
  ids: readonly number[],
  shooter: 1 | 2,
): RespotPlacement[] {
  const r = layout.ballR;
  const shooterBall = shooter === 1 ? 0 : 1;
  const spotFor = (id: number): SpotXY => {
    if (id === 2) return layout.spots.top;
    return id === shooterBall ? layout.spots.bottom : layout.spots.centre;
  };
  // occupancy obstacles: balls staying on the table (not being respotted)
  const respotting = new Set(ids);
  const obstacles: SpotXY[] = balls
    .filter((_, id) => !respotting.has(id))
    .map((p) => ({ ...p }));
  const plan: RespotPlacement[] = [];
  const allSpots = [layout.spots.top, layout.spots.bottom, layout.spots.centre];
  for (const id of ids) {
    const own = spotFor(id);
    let target: SpotXY | null = null;
    if (fitsAt(layout.table, r, own, obstacles)) {
      target = own;
    } else {
      // swap rule: the spot of the ball occupying the designated spot
      const min = 2 * r + PLACE_CLEARANCE;
      const occupier = balls.findIndex((p, bid) => !respotting.has(bid)
        && Math.hypot(p.x - own.x, p.y - own.y) < min);
      if (occupier >= 0) {
        const swap = spotFor(occupier);
        if (fitsAt(layout.table, r, swap, obstacles)) target = swap;
      }
      if (target === null) {
        for (const s of allSpots) { // deterministic double-occupied edge
          if (fitsAt(layout.table, r, s, obstacles)) {
            target = s;
            break;
          }
        }
      }
    }
    if (target !== null) {
      plan.push({ ball: id, xy: { ...target } });
      obstacles.push(target);
    }
  }
  return plan;
}
