// Copyright (c) Meta Platforms, Inc. and affiliates.

import type { Table } from '../types.js';
/** Same safety margin web/app game.js uses for interactive placement: the
 * kernel admits gaps down to 2r − EPS_KISS; we place with clear daylight. */
export declare const PLACE_CLEARANCE = 0.0001;
/** Frozen-contact daylight (GH-370): the exact margin web/app game.js
 * kernelPlacements relaxes settled near-contacts to (2r + 1e-9), i.e. the
 * kernel-admissible "touching" separation. snapToContact projects blocked
 * in-hand requests onto it. */
export declare const CONTACT_EPS = 1e-9;
export interface SpotXY {
    x: number;
    y: number;
}
/** The foot spot: rack-apex point on the long string, (0, +length/4). */
export declare function footSpot(table: Table): SpotXY;
/** The head spot: the long-string point at (0, −length/4) — the WPA 7.8
 * Table 1 interference spot (feature 025). Mirror image of the foot spot
 * in the kernel frame (head rail at y = −length/2). */
export declare function headSpot(table: Table): SpotXY;
/** The center spot: the table's midpoint (0, 0) — the WPA 7.8 Table 1
 * fallback when the head spot is blocked (feature 025). */
export declare function centerSpot(_table: Table): SpotXY;
/** True when a ball of radius r centered at `spot` fits: fully on the bed
 * (a radius clear of each cushion nose) and at least 2r + PLACE_CLEARANCE
 * from every obstacle ball center (uniform radius r, kernel v1). */
export declare function placementFits(table: Table, r: number, spot: SpotXY, obstacles: SpotXY[]): boolean;
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
export declare function snapToContact(table: Table, r: number, spot: SpotXY, obstacles: SpotXY[]): SpotXY | null;
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
export declare function respotBallSpot(table: Table, r: number, obstacles: SpotXY[]): SpotXY | null;
/** Frozen alias: the shipped 9-ball respot IS the parametrized geometry
 * (export + behavior byte-unchanged; web/app/flow.js imports this name on
 * the boot path). */
export declare function respotNineSpot(table: Table, r: number, obstacles: SpotXY[]): SpotXY | null;
/** Clamp a requested cue-ball-in-hand point to the playable bed (anywhere
 * on the table — 9-ball ball-in-hand has no kitchen restriction). */
export declare function clampToBed(table: Table, r: number, spot: SpotXY): SpotXY;
/** One planned placement: ball id → target spot. */
export interface RespotPlacement {
    ball: number;
    xy: SpotXY;
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
export declare function snookerRespotPlan(layout: import('../games/layouts.js').SnookerLayout, balls: readonly SpotXY[], ids: readonly number[]): RespotPlacement[];
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
export declare function fourteenOneRerackPlacements(slots: readonly SpotXY[], table: {
    length: number;
    width: number;
}, plan: FourteenOneRerackPlan): {
    balls: RespotPlacement[];
    cue: 'stays' | 'kitchen' | SpotXY;
};
export declare function caromRespotPlan(layout: import('../games/layouts.js').CaromLayout, balls: readonly SpotXY[], ids: readonly number[], shooter: 1 | 2): RespotPlacement[];
