// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Seeded rack constructors (M7-owned).
//!
//! Contract §M7: diamond (9-ball) / triangle (15-ball) rack at the foot spot
//! (y = +length/4, apex ball on the spot, apex toward the table center), cue
//! ball (id 0) exactly on the head spot (y = −length/4). Ball ids are stable:
//! index 0 = cue, then rack order.
//!
//! # Default topology: FROZEN contacts (break-physics fix, 2026-07)
//!
//! The DEFAULT racks ([`nine_ball_rack`] / [`fifteen_ball_rack`]) build the
//! frozen-contact topology of [`build_rack_frozen`] at
//! [`DEFAULT_FROZEN_FRACTION`]: lattice-adjacent balls touch (surface gap
//! `FROZEN_GAP` = 0.5 µm < `Eps::KISS`), the apex wedge is always frozen,
//! and a seeded imperfection stream opens micro-gaps in the back rows.
//! Provenance — this is a literature-grounded MECHANISM fix, not a fit:
//! frozen contacts are the physical truth of a proper rack and the
//! 0.05–0.5 mm all-gapped construction below was the approximation
//! (docs/research/break-cueball-rebound-evidence.md: the reference demo break clip +
//! Dr. Dave HSV B.43 both show the cue ball rebounding backward off a tight
//! rack at 0.17–0.33 of impact speed; Gismeros 2022 shows a 0.2 mm apex gap
//! flips the outcome qualitatively; docs/research/break-cue-back-reaction.md
//! traces the "perfectly dead cue" defect to the gapped topology starving
//! the T021 cluster escalation — min gap 5e-5 m was 5× the contact
//! tolerance BY CONSTRUCTION, so `resolve_cluster` never fired on a break).
//!
//! # Gapped algorithm (docs/research/gap-break-multibody.md §2–3;
//! research/contrast builders [`nine_ball_rack_gapped`] /
//! [`fifteen_ball_rack_gapped`])
//!
//! Seeded nominal inter-ball gaps in the 0.05–0.5 mm band keep the break's
//! spread *distribution* robust (the study measured spread statistics
//! insensitive across this band) while staying out of the pathological
//! tight-rack region that forced pooltool's 10% momentum-theft workaround
//! (rejected — replaced by [`crate::resolve::cluster::resolve_cluster`]).
//! Kept for research contrast and the spread-band regression tests; no
//! shipping surface builds it.
//!
//! Construction (provably overlap-free):
//!
//! 1. Perfect triangular lattice with pitch `s = 2R + GAP_MAX`, i.e. the
//!    pitch is inflated by the maximum gap so every pair of lattice nodes is
//!    at least `s` apart.
//! 2. For each rack ball, in rack order, draw from `Pcg32::new(seed, 0)`
//!    (two `next_f64` calls per ball): a nominal gap
//!    `g_i ~ U[GAP_MIN, GAP_MAX)`, then an angle `θ_i ~ U[0, 2π)`. Displace
//!    the ball from its lattice node by `ρ_i = (GAP_MAX − g_i)/2` along
//!    `θ_i` in the table plane (jitter confined to the safe radius
//!    `(GAP_MAX − GAP_MIN)/2`).
//!
//! Proof of legality: any two lattice nodes are ≥ `s` apart, so every ball
//! pair (i, j) keeps a center distance
//! `≥ s − ρ_i − ρ_j = 2R + (g_i + g_j)/2 ≥ 2R + GAP_MIN` — overlap-free by
//! construction, with the worst-case (nominal) gap of every pair equal to
//! `(g_i + g_j)/2 ∈ [GAP_MIN, GAP_MAX]`, the mean of two uniform per-ball
//! draws from the band. Lattice-adjacent center distances are bounded above
//! by `s + ρ_i + ρ_j ≤ 2R + 2·GAP_MAX − GAP_MIN`. The cue ball takes no
//! jitter. Same seed → bit-identical rack; different seeds differ.

use crate::math::rng::Pcg32;
use crate::params::BallParams;
use crate::state::{Ball, BallState, MotionState, SystemState};
use crate::table::Table;
use crate::types::{BallId, Vec3};
use std::f64::consts::PI;

/// Minimum nominal rack gap \[m\] (0.05 mm; gap-break-multibody.md §3a).
const GAP_MIN: f64 = 0.05e-3;
/// Maximum nominal rack gap \[m\] (0.5 mm; gap-break-multibody.md §3a).
const GAP_MAX: f64 = 0.5e-3;

/// √3 (no std sqrt in pool-core; computed via libm at use sites).
fn sqrt3() -> f64 {
    libm::sqrt(3.0)
}

/// One per-ball draw: nominal gap `g ~ U[GAP_MIN, GAP_MAX)` then jitter angle
/// `θ ~ U[0, 2π)`; returns `(g, displacement)` where the displacement has
/// magnitude `(GAP_MAX − g)/2` in the table plane (z = 0).
fn draw_gap_jitter(rng: &mut Pcg32) -> (f64, Vec3) {
    let gap = GAP_MIN + rng.next_f64() * (GAP_MAX - GAP_MIN);
    let angle = 2.0 * PI * rng.next_f64();
    let rho = 0.5 * (GAP_MAX - gap);
    (
        gap,
        Vec3::new(rho * libm::cos(angle), rho * libm::sin(angle), 0.0),
    )
}

/// Build balls from lattice offsets (in units of the pitch `s = 2R + GAP_MAX`)
/// around the foot spot, with deterministic per-ball jitter (module doc), plus
/// the cue ball exactly on the head spot.
fn build_rack(
    table: &Table,
    params: &BallParams,
    seed: u64,
    numbered_offsets: &[(u8, f64, f64)],
) -> Vec<Ball> {
    let mut rng = Pcg32::new(seed, 0);
    let s = 2.0 * params.r + GAP_MAX;
    let foot = Vec3::new(0.0, table.length / 4.0, params.r);
    let head = Vec3::new(0.0, -table.length / 4.0, params.r);

    let stationary = |pos: Vec3| BallState {
        pos,
        vel: Vec3::ZERO,
        avel: Vec3::ZERO,
        motion: MotionState::Stationary,
        pinch: None,
    };

    let mut balls = Vec::with_capacity(numbered_offsets.len() + 1);
    balls.push(Ball {
        id: BallId(0),
        params: *params,
        state: stationary(head),
    });
    for &(num, ux, uy) in numbered_offsets {
        let (_gap, jitter) = draw_gap_jitter(&mut rng);
        let pos = Vec3::new(foot.x + ux * s, foot.y + uy * s, params.r) + jitter;
        debug_assert!(pos.is_finite());
        balls.push(Ball {
            id: BallId(num),
            params: *params,
            state: stationary(pos),
        });
    }
    balls
}

/// Frozen-contact surface gap \[m\] for the frozen-topology rack
/// (break-physics forensics, docs/research/break-cue-back-reaction.md §4):
/// half of [`crate::consts::Eps::KISS`], so frozen pairs sit inside both the
/// event loop's `CLUSTER_CONTACT_EPS` contact-graph tolerance (1e-5 m) and
/// the kiss window, while staying strictly clear of the input validator's
/// overlap guard (`2R − Eps::KISS`).
const FROZEN_GAP: f64 = 0.5e-6;

/// Default per-ball frozen probability for the shipping racks.
///
/// Provenance (docs/research/break-cueball-rebound-evidence.md, racking
/// consensus — practitioner sources, medium confidence): a proper rack is
/// ALL frozen, but real wooden-triangle racks routinely carry ≥ 1
/// paper-thin gap; apex freeze matters most (the cue rebound the evidence
/// band demands rides on the apex wedge, which [`build_rack_frozen`]
/// therefore NEVER opens — the imperfection stream only reaches the back
/// rows). 0.7 keeps the expected imperfection at "a few micro-gapped
/// contacts per rack" (≈ 3–4 jittered back balls on a 15-rack, ≈ 1 loosened
/// back-row boundary) without approaching the all-gapped construction the
/// forensics falsified. No published frozen-fraction statistics exist; the
/// value is the consensus estimate, honestly labeled, and the fraction is a
/// parameter so calibration can move it if footage-level statistics ever
/// materialize. Forensics fix-phase item 1 (break-cue-back-reaction.md §4)
/// makes f < 1 MANDATORY for the default: a perfect lattice is
/// seed-invariant, erasing per-seed break variety.
pub const DEFAULT_FROZEN_FRACTION: f64 = 0.7;

/// Frozen-topology rack builder — the DEFAULT since the break-physics fix
/// (see module doc). Lattice pitch
/// `s = 2R + FROZEN_GAP`, i.e. every lattice-adjacent contact starts
/// *frozen* (within `Eps::KISS`). Seeded imperfection: each BACK-ROW rack
/// ball (lattice row ≥ 2; the apex wedge — apex + row 1 — always keeps its
/// nodes, see [`DEFAULT_FROZEN_FRACTION`] provenance), in rack order, keeps
/// its node with probability `frozen_fraction`
/// (`next_f64() < frozen_fraction`); otherwise it is displaced by a nominal
/// micro-gap `g ~ U[GAP_MIN, GAP_MAX)` along `θ ~ U[0, 2π)` (three draws),
/// opening a few contacts per the racking evidence stream while the rest
/// stay frozen.
///
/// Legality invariant (maintained inductively, closed form — no rejection
/// loops): every pair keeps center distance ≥ `s`. A displacement `t·û`
/// against a neighbor at relative offset `d₀` (`|d₀| ≥ s`) violates
/// `|d₀ + t·û| ≥ s` only for `t` between the roots of
/// `t² + 2t(û·d₀) + |d₀|² − s²`; with `b = û·d₀ < 0` both roots are
/// non-negative and the draw is clamped to the smaller root, which lands
/// the pair EXACTLY back on the frozen pitch. Same seed → bit-identical;
/// `frozen_fraction` outside [0, 1] is clamped. `frozen_fraction = 1.0`
/// reproduces the perfect frozen lattice.
fn build_rack_frozen(
    table: &Table,
    params: &BallParams,
    seed: u64,
    frozen_fraction: f64,
    numbered_offsets: &[(u8, f64, f64)],
) -> Vec<Ball> {
    let foot = Vec3::new(0.0, table.length / 4.0, params.r);
    let head = Vec3::new(0.0, -table.length / 4.0, params.r);
    build_rack_frozen_at(params, seed, frozen_fraction, numbered_offsets, foot, head)
}

/// Anchored core of [`build_rack_frozen`] (feature 012: the snooker pack
/// anchors at the pink spot + a gap instead of the pool foot spot, and the
/// cue ball sits in the D instead of the head spot — everything else is
/// IDENTICAL; the pool racks delegate with foot/head, bit-unchanged).
/// `apex` is the lattice origin (offset (0, 0) ball centre), `cue` the cue
/// ball's exact position; both carry z = ball radius.
fn build_rack_frozen_at(
    params: &BallParams,
    seed: u64,
    frozen_fraction: f64,
    numbered_offsets: &[(u8, f64, f64)],
    apex: Vec3,
    cue: Vec3,
) -> Vec<Ball> {
    let frozen_fraction = frozen_fraction.clamp(0.0, 1.0);
    let mut rng = Pcg32::new(seed, 0);
    let s = 2.0 * params.r + FROZEN_GAP;
    let foot = apex;
    let head = cue;

    let stationary = |pos: Vec3| BallState {
        pos,
        vel: Vec3::ZERO,
        avel: Vec3::ZERO,
        motion: MotionState::Stationary,
        pinch: None,
    };

    let mut balls = Vec::with_capacity(numbered_offsets.len() + 1);
    balls.push(Ball {
        id: BallId(0),
        params: *params,
        state: stationary(head),
    });
    let mut placed: Vec<Vec3> = Vec::with_capacity(numbered_offsets.len());
    // lattice nodes for not-yet-placed balls (legality against ALL balls)
    let nodes: Vec<Vec3> = numbered_offsets
        .iter()
        .map(|&(_, ux, uy)| Vec3::new(foot.x + ux * s, foot.y + uy * s, params.r))
        .collect();
    // lattice row index per rack ball (rows are √3/2 pitches apart)
    let row_h = sqrt3() / 2.0;
    let levels: Vec<i64> = numbered_offsets
        .iter()
        .map(|&(_, _, uy)| libm::round(uy / row_h) as i64)
        .collect();
    for (k, &(num, _, _)) in numbered_offsets.iter().enumerate() {
        let node = nodes[k];
        // Apex wedge (rows 0–1) is ALWAYS frozen — the cue back-reaction
        // the evidence band demands rides on these contacts (racking
        // consensus: apex freeze matters most). No RNG draw is consumed.
        let pos = if levels[k] <= 1 || rng.next_f64() < frozen_fraction {
            node // frozen: keep the lattice node exactly
        } else {
            let gap = GAP_MIN + rng.next_f64() * (GAP_MAX - GAP_MIN);
            let angle = 2.0 * PI * rng.next_f64();
            let u = Vec3::new(libm::cos(angle), libm::sin(angle), 0.0);
            // clamp the draw so no pair (placed final positions + later
            // lattice nodes) drops below the frozen pitch s
            let mut t = gap;
            let others = placed.iter().chain(nodes.iter().skip(k + 1));
            for &other in others {
                let d0 = node - other;
                let b = u.dot(d0);
                if b >= 0.0 {
                    continue; // moving away from this neighbor
                }
                let disc = b * b - (d0.norm_sq() - s * s);
                if disc > 0.0 {
                    t = t.min(-b - libm::sqrt(disc));
                }
            }
            node + u * t.max(0.0)
        };
        debug_assert!(pos.is_finite());
        placed.push(pos);
        balls.push(Ball {
            id: BallId(num),
            params: *params,
            state: stationary(pos),
        });
    }

    // Row loosening (racking evidence: hand racks are tight at the apex and
    // loosen between BACK rows; interior balls above cannot open laterally —
    // the clamp freezes them). For each BACK row boundary r−1→r (r ≥ 2,
    // ascending, same RNG stream — boundary 0→1 never opens: apex wedge),
    // with probability 1 − frozen_fraction open it by a nominal
    // micro-gap g ~ U[GAP_MIN, GAP_MAX): shift rows ≥ r by +g·ŷ (away from
    // the breaker). Distances within the shifted block are unchanged and
    // every cross pair strictly grows (the offset from a front-row ball to a
    // back-row ball has positive y), so legality is preserved.
    let max_level = levels.iter().copied().max().unwrap_or(0);
    let mut shift = 0.0;
    for r in 2..=max_level {
        if rng.next_f64() >= frozen_fraction {
            shift += GAP_MIN + rng.next_f64() * (GAP_MAX - GAP_MIN);
        }
        if shift > 0.0 {
            for (b, &level) in balls[1..].iter_mut().zip(&levels) {
                if level == r {
                    b.state.pos.y += shift;
                }
            }
        }
    }
    balls
}

/// Nine-ball diamond rack at the foot spot + cue ball at the head spot
/// (index 0 = cue). Apex (1-ball) on the foot spot pointing at the breaker;
/// 9-ball in the center (rack legality). Non-mandated ball order is fixed
/// (deterministic ids independent of seed). Frozen-contact topology at
/// [`DEFAULT_FROZEN_FRACTION`] (module doc: break-physics fix).
pub fn nine_ball_rack(table: &Table, params: &BallParams, seed: u64) -> Vec<Ball> {
    build_rack_frozen(table, params, seed, DEFAULT_FROZEN_FRACTION, &nine_offsets())
}

/// The pre-fix all-gapped 9-ball rack (0.05–0.5 mm seeded gaps; module doc
/// "Gapped algorithm"). Research/regression contrast only — the shipping
/// default is the frozen topology of [`nine_ball_rack`].
pub fn nine_ball_rack_gapped(table: &Table, params: &BallParams, seed: u64) -> Vec<Ball> {
    build_rack(table, params, seed, &nine_offsets())
}

/// (ball number, x offset, y offset) in units of the lattice pitch, rows
/// spaced √3/2 apart — the 9-ball diamond of [`nine_ball_rack`]'s doc.
fn nine_offsets() -> [(u8, f64, f64); 9] {
    let row = sqrt3() / 2.0;
    [
        (1, 0.0, 0.0),
        (2, -0.5, row),
        (3, 0.5, row),
        (4, -1.0, 2.0 * row),
        (9, 0.0, 2.0 * row),
        (5, 1.0, 2.0 * row),
        (6, -0.5, 3.0 * row),
        (7, 0.5, 3.0 * row),
        (8, 0.0, 4.0 * row),
    ]
}

/// Fifteen-ball triangle rack at the foot spot + cue ball at the head spot
/// (index 0 = cue). Apex (1-ball) on the foot spot; 8-ball in the middle of
/// the third row. Non-mandated ball order is fixed (deterministic ids
/// independent of seed). Frozen-contact topology at
/// [`DEFAULT_FROZEN_FRACTION`] (module doc: break-physics fix).
pub fn fifteen_ball_rack(table: &Table, params: &BallParams, seed: u64) -> Vec<Ball> {
    build_rack_frozen(table, params, seed, DEFAULT_FROZEN_FRACTION, &fifteen_offsets())
}

/// The pre-fix all-gapped 15-ball rack (see [`nine_ball_rack_gapped`]).
pub fn fifteen_ball_rack_gapped(table: &Table, params: &BallParams, seed: u64) -> Vec<Ball> {
    build_rack(table, params, seed, &fifteen_offsets())
}

/// The 15-ball triangle offsets of [`fifteen_ball_rack`]'s doc (8-ball
/// centered in row 3), in units of the lattice pitch.
///
/// One-pocket and Chinese eight-ball (Heyball) REUSE this shipped
/// `fifteen` lattice unchanged (feature 012, research R5): the rack
/// builder parameterizes by table dims — the apex anchors on the foot spot
/// at the quarter point of the playing surface (`table.length / 4`), which
/// on the 2.54 m Joy Q8 surface is exactly the WPA Heyball rulebook's
/// 635 mm foot-spot distance from the top cushion (WPA Chinese Eight Ball
/// / Heyball rules, eff. 2025). One-pocket adds no lattice constraints
/// beyond WPA 12.2 ("no pattern, no template" — the SDK's seeded id
/// shuffle handles it); no new kernel lattice ships for either.
fn fifteen_offsets() -> Vec<(u8, f64, f64)> {
    let row = sqrt3() / 2.0;
    let mut offsets: Vec<(u8, f64, f64)> = Vec::with_capacity(15);
    let mut idx: u8 = 0;
    for k in 0..5u8 {
        for j in 0..=k {
            // Deterministic numbering with the 8-ball centered in row 3:
            // natural number = idx + 1, except idx 4 ↔ idx 7 (5 ↔ 8 swap).
            let num = match idx {
                4 => 8,
                7 => 5,
                i => i + 1,
            };
            let x = f64::from(j) - f64::from(k) / 2.0;
            let y = f64::from(k) * row;
            offsets.push((num, x, y));
            idx += 1;
        }
    }
    offsets
}

/// Ten-ball triangle rack at the foot spot + cue ball at the head spot
/// (index 0 = cue). Apex (1-ball) on the foot spot; 10-ball in the middle
/// of the triangle (row-3 centre — WPA Rules of Play eff. 2025-09-15,
/// 6.2). Non-mandated ball order is fixed (deterministic ids independent
/// of seed; 6.2's "without purposeful or intentional pattern" is the SDK
/// rack template's seeded id shuffle — the one-pocket 12.2 precedent).
/// Frozen-contact topology at [`DEFAULT_FROZEN_FRACTION`] (module doc:
/// break-physics fix). Additive (GH-343): no existing rack changes.
pub fn ten_ball_rack(table: &Table, params: &BallParams, seed: u64) -> Vec<Ball> {
    build_rack_frozen(table, params, seed, DEFAULT_FROZEN_FRACTION, &ten_offsets())
}

/// The 10-ball triangle offsets of [`ten_ball_rack`]'s doc (10-ball
/// centered in row 3), in units of the lattice pitch — the
/// [`fifteen_offsets`] deterministic-numbering idx-swap precedent on the
/// four-row (1+2+3+4) lattice: natural number = idx + 1, except
/// idx 4 ↔ idx 9 (5 ↔ 10 swap) so the 10 takes the triangle centre.
fn ten_offsets() -> Vec<(u8, f64, f64)> {
    let row = sqrt3() / 2.0;
    let mut offsets: Vec<(u8, f64, f64)> = Vec::with_capacity(10);
    let mut idx: u8 = 0;
    for k in 0..4u8 {
        for j in 0..=k {
            let num = match idx {
                4 => 10,
                9 => 5,
                i => i + 1,
            };
            let x = f64::from(j) - f64::from(k) / 2.0;
            let y = f64::from(k) * row;
            offsets.push((num, x, y));
            idx += 1;
        }
    }
    offsets
}

// ---- snooker layout (feature 012, contracts/equipment-additions.md §1.4;
// data-model.md §2 FROZEN data; TS mirror sdk/ts/src/games/layouts.ts,
// drift-tested) ---------------------------------------------------------------
//
// Coordinates: kernel table frame of the `wpbsa_snooker_12ft` table
// (3.569 × 1.778 m playing area) — origin at table centre, +y toward the
// top (black) cushion, metres. Cites: WPBSA Official Rules of Snooker
// (Revised Sep 2024) Sec1 R1(d)–(f) — baulk line 737 mm from the bottom
// cushion face (−1.7845 + 0.737 = −1.0475), the "D" of radius 292 mm on the
// baulk line opening toward the bottom cushion, blue on the centre, pink
// midway centre → top (+0.89225 = l/4), black 324 mm off the top cushion
// (1.7845 − 0.324 = +1.4605).

/// Baulk-line y (WPBSA Sec1 R1(d): 737 mm from the bottom cushion face).
pub const SNOOKER_BAULK_Y: f64 = -1.0475;
/// Radius of the "D" (WPBSA Sec1 R1(e): 292 mm, centred on the baulk line).
pub const SNOOKER_D_RADIUS: f64 = 0.292;
/// The six colour spots as (ball id, x, y) — WPBSA Sec1 R1(d)–(f).
/// Ball ids (frozen, feature 012): cue 0, reds 1–15, then yellow 16,
/// green 17, brown 18, blue 19, pink 20, black 21 (value = id − 14).
/// Yellow sits on the +x corner of the D, green on −x (right/left as
/// viewed from the baulk end), brown on the baulk-line centre.
pub const SNOOKER_SPOTS: [(u8, f64, f64); 6] = [
    (16, 0.292, -1.0475),  // yellow — right D corner
    (17, -0.292, -1.0475), // green — left D corner
    (18, 0.0, -1.0475),    // brown — baulk-line centre
    (19, 0.0, 0.0),        // blue — table centre
    (20, 0.0, 0.89225),    // pink — midway centre -> top cushion
    (21, 0.0, 1.4605),     // black — 324 mm off the top cushion
];
/// Default cue-ball address for a fresh frame: on the baulk line inside
/// the D, halfway brown → yellow. The actual break placement is a player
/// right (in-hand within the D, Sec3 R8(a)) — this is only the seeded
/// scenario's starting point.
pub const SNOOKER_CUE_DEFAULT: (f64, f64) = (0.146, -1.0475);

/// The 15-red triangle lattice offsets (ball id, x, y) in units of the
/// lattice pitch, apex row 0 at the anchor and rows √3/2 apart toward the
/// TOP cushion (+y — base parallel to the top cushion). Reds are
/// interchangeable (no mandated numbering — WPBSA Sec3 R2(a)(i) constrains
/// only the pack's position), so ids run 1–15 in row order.
pub fn snooker_offsets() -> Vec<(u8, f64, f64)> {
    let row = sqrt3() / 2.0;
    let mut offsets: Vec<(u8, f64, f64)> = Vec::with_capacity(15);
    let mut id: u8 = 1;
    for k in 0..5u8 {
        for j in 0..=k {
            let x = f64::from(j) - f64::from(k) / 2.0;
            let y = f64::from(k) * row;
            offsets.push((id, x, y));
            id += 1;
        }
    }
    offsets
}

/// Snooker frame rack (WPBSA Sec3 R2(a)(i)): 15 reds as a tightly-packed
/// triangle whose apex red is on the centre line "as close to the Pink
/// Spot as possible without occupying it" — apex-red centre
/// y = pink_y + ball_d + GAP_MIN (the seeded micro-gap floor, so red and
/// pink NEVER touch), frozen-contact topology + seeded 0.05–0.5 mm
/// back-row micro-gaps via the same [`build_rack_frozen_at`] machinery as
/// the pool racks (the break-physics doctrine applies to any
/// tightly-racked cluster); colours 16–21 exactly on [`SNOOKER_SPOTS`];
/// cue ball (id 0) at [`SNOOKER_CUE_DEFAULT`] in the D.
///
/// `table` must be the `wpbsa_snooker_12ft` build — the layout constants
/// are that table's rulebook coordinates (debug-asserted).
pub fn snooker_rack(table: &Table, params: &BallParams, seed: u64) -> Vec<Ball> {
    debug_assert!(
        (table.length - 3.569).abs() < 1e-9 && (table.width - 1.778).abs() < 1e-9,
        "snooker layout constants are wpbsa_snooker_12ft coordinates"
    );
    let _ = table;
    let pink_y = SNOOKER_SPOTS[4].2;
    let apex = Vec3::new(0.0, pink_y + 2.0 * params.r + GAP_MIN, params.r);
    let cue = Vec3::new(SNOOKER_CUE_DEFAULT.0, SNOOKER_CUE_DEFAULT.1, params.r);
    let mut balls = build_rack_frozen_at(
        params,
        seed,
        DEFAULT_FROZEN_FRACTION,
        &snooker_offsets(),
        apex,
        cue,
    );
    for (id, x, y) in SNOOKER_SPOTS {
        balls.push(Ball {
            id: BallId(id),
            params: *params,
            state: BallState {
                pos: Vec3::new(x, y, params.r),
                vel: Vec3::ZERO,
                avel: Vec3::ZERO,
                motion: MotionState::Stationary,
                pinch: None,
            },
        });
    }
    balls
}

// ---- carom layout (feature 012; data-model.md §2 FROZEN data) ---------------
//
// Coordinates: kernel table frame of the `umb_carom_284` table
// (2.84 × 1.42 m) — origin table centre, +y toward the top cushion.
// Cites: UMB World Rules of Carom Billiard (1 Jan 1989) Art 11.6 (five
// spots), Art 22 (positions), Art 23 (starting position). The numeric
// start-spot offset (18.25 cm either side of the bottom/head spot) is the
// USBA three-cushion table-markings diagram — the documented numeric
// SECONDARY, because UMB Planches A–L are missing from every public copy
// of the 1989 PDF (research R5).

/// Top (red) spot — UMB Art 22/23: red on the top spot at the break.
pub const CAROM_SPOT_TOP: (f64, f64) = (0.0, 0.710);
/// Centre spot.
pub const CAROM_SPOT_CENTRE: (f64, f64) = (0.0, 0.0);
/// Bottom spot (the non-breaker's ball at the break — Art 23.2).
pub const CAROM_SPOT_BOTTOM: (f64, f64) = (0.0, -0.710);
/// Start-spot lateral offset (USBA diagram: 18.25 cm either side of the
/// bottom spot, on the bottom-spot line).
pub const CAROM_START_OFFSET_X: f64 = 0.1825;

/// Carom starting position (UMB Art 23.1–23.3): red on the top spot,
/// opponent's ball on the bottom spot, breaker's ball on the chosen start
/// spot (`breaker_start_right` = the +x spot; the choice is a recorded
/// decision — share-codec decision 10). Ball ids (frozen, feature 012):
/// 0 breaker-white, 1 opponent (yellow visual, World Cup Aramith
/// convention), 2 red.
///
/// `table` must be the `umb_carom_284` build (debug-asserted).
pub fn carom_start(table: &Table, params: &BallParams, breaker_start_right: bool) -> Vec<Ball> {
    debug_assert!(
        (table.length - 2.84).abs() < 1e-9 && (table.width - 1.42).abs() < 1e-9,
        "carom layout constants are umb_carom_284 coordinates"
    );
    let _ = table;
    let stationary = |x: f64, y: f64| BallState {
        pos: Vec3::new(x, y, params.r),
        vel: Vec3::ZERO,
        avel: Vec3::ZERO,
        motion: MotionState::Stationary,
        pinch: None,
    };
    let sx = if breaker_start_right {
        CAROM_START_OFFSET_X
    } else {
        -CAROM_START_OFFSET_X
    };
    vec![
        Ball {
            id: BallId(0),
            params: *params,
            state: stationary(sx, CAROM_SPOT_BOTTOM.1),
        },
        Ball {
            id: BallId(1),
            params: *params,
            state: stationary(CAROM_SPOT_BOTTOM.0, CAROM_SPOT_BOTTOM.1),
        },
        Ball {
            id: BallId(2),
            params: *params,
            state: stationary(CAROM_SPOT_TOP.0, CAROM_SPOT_TOP.1),
        },
    ]
}

/// Frozen-topology 9-ball rack at an EXPLICIT `frozen_fraction` (see
/// [`build_rack_frozen`]); [`nine_ball_rack`] is this at
/// [`DEFAULT_FROZEN_FRACTION`].
pub fn nine_ball_rack_frozen(
    table: &Table,
    params: &BallParams,
    seed: u64,
    frozen_fraction: f64,
) -> Vec<Ball> {
    build_rack_frozen(table, params, seed, frozen_fraction, &nine_offsets())
}

/// Frozen-topology 15-ball rack at an EXPLICIT `frozen_fraction` (see
/// [`build_rack_frozen`]); [`fifteen_ball_rack`] is this at
/// [`DEFAULT_FROZEN_FRACTION`].
pub fn fifteen_ball_rack_frozen(
    table: &Table,
    params: &BallParams,
    seed: u64,
    frozen_fraction: f64,
) -> Vec<Ball> {
    build_rack_frozen(table, params, seed, frozen_fraction, &fifteen_offsets())
}

/// Frozen-topology 10-ball rack at an EXPLICIT `frozen_fraction` (see
/// [`build_rack_frozen`]); [`ten_ball_rack`] is this at
/// [`DEFAULT_FROZEN_FRACTION`]. Additive (GH-343).
pub fn ten_ball_rack_frozen(
    table: &Table,
    params: &BallParams,
    seed: u64,
    frozen_fraction: f64,
) -> Vec<Ball> {
    build_rack_frozen(table, params, seed, frozen_fraction, &ten_offsets())
}

impl SystemState {
    /// Frozen-topology 9-ball break setup at an explicit `frozen_fraction`
    /// ([`SystemState::nine_ball_rack`] = this at
    /// [`DEFAULT_FROZEN_FRACTION`]).
    pub fn nine_ball_rack_frozen(seed: u64, frozen_fraction: f64) -> SystemState {
        let params = BallParams::default();
        let table = Table::wpa_9ft(params.r);
        let balls = nine_ball_rack_frozen(&table, &params, seed, frozen_fraction);
        SystemState { balls, table, equipment: Default::default() }
    }

    /// Frozen-topology 15-ball break setup at an explicit `frozen_fraction`.
    pub fn fifteen_ball_rack_frozen(seed: u64, frozen_fraction: f64) -> SystemState {
        let params = BallParams::default();
        let table = Table::wpa_9ft(params.r);
        let balls = fifteen_ball_rack_frozen(&table, &params, seed, frozen_fraction);
        SystemState { balls, table, equipment: Default::default() }
    }

    /// Frozen-topology 10-ball break setup at an explicit `frozen_fraction`
    /// ([`SystemState::ten_ball_rack`] = this at
    /// [`DEFAULT_FROZEN_FRACTION`]). Additive (GH-343).
    pub fn ten_ball_rack_frozen(seed: u64, frozen_fraction: f64) -> SystemState {
        let params = BallParams::default();
        let table = Table::wpa_9ft(params.r);
        let balls = ten_ball_rack_frozen(&table, &params, seed, frozen_fraction);
        SystemState { balls, table, equipment: Default::default() }
    }

    /// The pre-fix all-gapped 9-ball setup (research/regression contrast).
    pub fn nine_ball_rack_gapped(seed: u64) -> SystemState {
        let params = BallParams::default();
        let table = Table::wpa_9ft(params.r);
        let balls = nine_ball_rack_gapped(&table, &params, seed);
        SystemState { balls, table, equipment: Default::default() }
    }

    /// The pre-fix all-gapped 15-ball setup (research/regression contrast).
    pub fn fifteen_ball_rack_gapped(seed: u64) -> SystemState {
        let params = BallParams::default();
        let table = Table::wpa_9ft(params.r);
        let balls = fifteen_ball_rack_gapped(&table, &params, seed);
        SystemState { balls, table, equipment: Default::default() }
    }
}

impl SystemState {
    /// Default 9-ball break setup: WPA 9-ft table, default balls, seeded
    /// frozen-contact rack (module doc).
    pub fn nine_ball_rack(seed: u64) -> SystemState {
        let params = BallParams::default();
        let table = Table::wpa_9ft(params.r);
        let balls = nine_ball_rack(&table, &params, seed);
        SystemState { balls, table, equipment: Default::default() }
    }

    /// Default 15-ball break setup: WPA 9-ft table, default balls, seeded
    /// frozen-contact rack (module doc).
    pub fn fifteen_ball_rack(seed: u64) -> SystemState {
        let params = BallParams::default();
        let table = Table::wpa_9ft(params.r);
        let balls = fifteen_ball_rack(&table, &params, seed);
        SystemState { balls, table, equipment: Default::default() }
    }

    /// Default 10-ball break setup: WPA 9-ft table, default balls, seeded
    /// frozen-contact rack (module doc; WPA 6.2 — GH-343 additive).
    pub fn ten_ball_rack(seed: u64) -> SystemState {
        let params = BallParams::default();
        let table = Table::wpa_9ft(params.r);
        let balls = ten_ball_rack(&table, &params, seed);
        SystemState { balls, table, equipment: Default::default() }
    }

    /// Default snooker frame setup (feature 012, mirroring
    /// [`SystemState::fifteen_ball_rack`]): the catalog's default snooker
    /// pairing — `wpbsa_snooker_12ft` table, `snooker_napped` cloth applied
    /// over the `snooker` ballset, `mathavan_fitted` cushion model
    /// (data-model.md §1.1) — with the seeded frozen-contact red pack of
    /// [`snooker_rack`].
    pub fn snooker_rack(seed: u64) -> SystemState {
        crate::catalog::EquipmentCatalog::get()
            .resolve(&crate::catalog::EquipmentSpec::snooker_default())
            .expect("snooker default pairing resolves")
            .snooker_rack(seed)
    }

    /// Default carom starting position (feature 012): the catalog's default
    /// carom pairing — `umb_carom_284` pocketless table,
    /// `carom_worsted_heated` cloth over the `carom` ballset, constant-COR
    /// `han2005_default` cushion model (data-model.md §1.2) — with the
    /// three balls of [`carom_start`].
    pub fn carom_start(breaker_start_right: bool) -> SystemState {
        crate::catalog::EquipmentCatalog::get()
            .resolve(&crate::catalog::EquipmentSpec::carom_default())
            .expect("carom default pairing resolves")
            .carom_start(breaker_start_right)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOL: f64 = 1e-12;

    /// GAPPED rack legality per module doc: pairwise distances ≥ 2R +
    /// GAP_MIN, every rack ball has a lattice neighbor within the upper
    /// lattice bound 2R + 2·GAP_MAX − GAP_MIN, all on the table, stationary.
    fn assert_legal(sys: &SystemState, expect_n: usize) {
        let balls = &sys.balls;
        assert_eq!(balls.len(), expect_n);
        assert_eq!(balls[0].id, BallId(0));
        let mut ids: Vec<u8> = balls.iter().map(|b| b.id.0).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), expect_n, "duplicate ball ids");

        let r = balls[0].params.r;
        let min_dist = 2.0 * r + GAP_MIN;
        let neighbor_bound = 2.0 * r + 2.0 * GAP_MAX - GAP_MIN;
        for i in 0..balls.len() {
            for j in (i + 1)..balls.len() {
                let d = (balls[i].state.pos - balls[j].state.pos).norm();
                assert!(
                    d >= min_dist - TOL,
                    "balls {i}/{j} too close: {d} < {min_dist}"
                );
            }
        }
        // every rack ball (not the cue) is part of a tight lattice
        for i in 1..balls.len() {
            let nearest = (1..balls.len())
                .filter(|&j| j != i)
                .map(|j| (balls[i].state.pos - balls[j].state.pos).norm())
                .fold(f64::INFINITY, f64::min);
            assert!(
                nearest <= neighbor_bound + TOL,
                "ball {i} nearest neighbor {nearest} exceeds lattice bound {neighbor_bound}"
            );
        }
        // on the table, resting on the bed, at rest
        for b in balls {
            assert!(b.state.pos.x.abs() <= sys.table.width / 2.0 - r);
            assert!(b.state.pos.y.abs() <= sys.table.length / 2.0 - r);
            assert_eq!(b.state.pos.z, r);
            assert_eq!(b.state.vel, Vec3::ZERO);
            assert_eq!(b.state.avel, Vec3::ZERO);
            assert_eq!(b.state.motion, MotionState::Stationary);
            assert!(b.state.is_finite());
        }
        // cue exactly on the head spot; apex within jitter radius of the foot spot
        assert_eq!(
            balls[0].state.pos,
            Vec3::new(0.0, -sys.table.length / 4.0, r)
        );
        let apex = balls.iter().find(|b| b.id == BallId(1)).unwrap();
        let foot = Vec3::new(0.0, sys.table.length / 4.0, r);
        assert!((apex.state.pos - foot).norm() <= (GAP_MAX - GAP_MIN) / 2.0 + TOL);
    }

    /// DEFAULT (frozen) rack legality: pairwise distances never below the
    /// frozen pitch, every ball on the bed and stationary, cue on the head
    /// spot, apex EXACTLY on the foot spot, unique stable ids, and the apex
    /// wedge (apex–2, apex–3, 2–3 for the diamond's row-1 pair) FROZEN
    /// (surface gap ≤ Eps::KISS) — the evidence-band mechanism carrier.
    fn assert_legal_frozen(sys: &SystemState, expect_n: usize) {
        use crate::consts::Eps;
        let balls = &sys.balls;
        assert_eq!(balls.len(), expect_n);
        assert_eq!(balls[0].id, BallId(0));
        let mut ids: Vec<u8> = balls.iter().map(|b| b.id.0).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), expect_n, "duplicate ball ids");
        let r = balls[0].params.r;
        let s = 2.0 * r + FROZEN_GAP;
        for i in 0..balls.len() {
            for j in (i + 1)..balls.len() {
                let d = (balls[i].state.pos - balls[j].state.pos).norm();
                assert!(d >= s - TOL, "balls {i}/{j} below frozen pitch: {d}");
            }
        }
        for b in balls {
            assert!(b.state.pos.x.abs() <= sys.table.width / 2.0 - r);
            assert!(b.state.pos.y.abs() <= sys.table.length / 2.0 - r);
            assert_eq!(b.state.pos.z, r);
            assert_eq!(b.state.vel, Vec3::ZERO);
            assert_eq!(b.state.avel, Vec3::ZERO);
            assert_eq!(b.state.motion, MotionState::Stationary);
            assert!(b.state.is_finite());
        }
        let foot = Vec3::new(0.0, sys.table.length / 4.0, r);
        assert_eq!(
            balls[0].state.pos,
            Vec3::new(0.0, -sys.table.length / 4.0, r)
        );
        let get = |id: u8| balls.iter().find(|b| b.id == BallId(id)).unwrap();
        assert_eq!(get(1).state.pos, foot, "apex must sit exactly on the foot spot");
        for (a, b) in [(1u8, 2u8), (1, 3), (2, 3)] {
            let gap = (get(a).state.pos - get(b).state.pos).norm() - 2.0 * r;
            assert!(gap <= Eps::KISS, "apex-wedge contact {a}-{b} not frozen: {gap}");
        }
    }

    #[test]
    fn nine_ball_rack_is_legal_frozen_across_seeds() {
        for seed in 0..50u64 {
            assert_legal_frozen(&SystemState::nine_ball_rack(seed), 10);
        }
    }

    #[test]
    fn fifteen_ball_rack_is_legal_frozen_across_seeds() {
        for seed in 0..50u64 {
            assert_legal_frozen(&SystemState::fifteen_ball_rack(seed), 16);
        }
    }

    #[test]
    fn ten_ball_rack_is_legal_frozen_across_seeds() {
        for seed in 0..50u64 {
            assert_legal_frozen(&SystemState::ten_ball_rack(seed), 11);
        }
    }

    /// GH-343 (WPA 6.2): 1 at the apex EXACTLY on the foot spot (covered by
    /// `assert_legal_frozen`), the 10 in the middle of the triangle (row-3
    /// centre, x ≈ 0), ids stable and seed-independent, default = the frozen
    /// builder at DEFAULT_FROZEN_FRACTION, seeded imperfection reaches the
    /// back rows (frozen-contact + micro-gap policy identical to siblings).
    #[test]
    fn ten_ball_rack_topology_and_determinism() {
        use crate::consts::Eps;
        let ten = SystemState::ten_ball_rack(3);
        let ids: Vec<u8> = ten.balls.iter().map(|b| b.id.0).collect();
        assert_eq!(ids, [0, 1, 2, 3, 4, 10, 6, 7, 8, 9, 5]);
        let tb = ten.balls.iter().find(|b| b.id == BallId(10)).unwrap();
        assert!(tb.state.pos.x.abs() < 1e-3, "10 must centre row 3");
        // row-3 centre sits two lattice rows behind the apex
        let r = ten.balls[0].params.r;
        let row = sqrt3() / 2.0 * (2.0 * r + FROZEN_GAP);
        let foot_y = ten.table.length / 4.0;
        assert!((tb.state.pos.y - (foot_y + 2.0 * row)).abs() < 3.0 * GAP_MAX);
        for seed in 0..30u64 {
            assert_eq!(
                SystemState::ten_ball_rack(seed).balls,
                SystemState::ten_ball_rack_frozen(seed, DEFAULT_FROZEN_FRACTION).balls
            );
            assert_eq!(
                SystemState::ten_ball_rack(seed).balls,
                SystemState::ten_ball_rack(seed).balls
            );
        }
        assert_ne!(
            SystemState::ten_ball_rack(42).balls,
            SystemState::ten_ball_rack(43).balls
        );
        // seeded back-row imperfection fires on a healthy majority of seeds
        let mut distinct = 0u32;
        for seed in 0..30u64 {
            let sys = SystemState::ten_ball_rack(seed);
            let r = sys.balls[0].params.r;
            let any_gap = (1..sys.balls.len()).any(|i| {
                ((i + 1)..sys.balls.len()).any(|j| {
                    let gap = (sys.balls[i].state.pos - sys.balls[j].state.pos).norm() - 2.0 * r;
                    gap > Eps::KISS && gap <= 3.0 * GAP_MAX
                })
            });
            if any_gap {
                distinct += 1;
            }
        }
        assert!(distinct >= 15, "only {distinct}/30 seeds carry back-row micro-gaps");
        // full-fraction prototype: the 10-triangle carries 18 lattice contacts
        let sys = SystemState::ten_ball_rack_frozen(5, 1.0);
        let r = sys.balls[0].params.r;
        let s = 2.0 * r + FROZEN_GAP;
        let mut frozen_pairs = 0;
        for i in 1..sys.balls.len() {
            for j in (i + 1)..sys.balls.len() {
                let d = (sys.balls[i].state.pos - sys.balls[j].state.pos).norm();
                assert!(d >= s - TOL, "pair {i}/{j} below frozen pitch: {d}");
                if d <= s + TOL {
                    frozen_pairs += 1;
                }
            }
        }
        assert_eq!(frozen_pairs, 18, "10-triangle lattice contact count");
    }

    /// The default racks ARE the frozen builder at DEFAULT_FROZEN_FRACTION
    /// (bit-identical), and the seeded imperfection reaches the back rows on
    /// a healthy majority of seeds (f < 1 is mandatory — forensics fix-phase
    /// item 1; a perfect lattice would be seed-invariant).
    #[test]
    fn default_rack_is_frozen_builder_with_seeded_imperfection() {
        use crate::consts::Eps;
        let mut distinct = 0u32;
        for seed in 0..30u64 {
            assert_eq!(
                SystemState::nine_ball_rack(seed).balls,
                SystemState::nine_ball_rack_frozen(seed, DEFAULT_FROZEN_FRACTION).balls
            );
            assert_eq!(
                SystemState::fifteen_ball_rack(seed).balls,
                SystemState::fifteen_ball_rack_frozen(seed, DEFAULT_FROZEN_FRACTION).balls
            );
            let sys = SystemState::fifteen_ball_rack(seed);
            let r = sys.balls[0].params.r;
            let any_gap = (1..sys.balls.len()).any(|i| {
                ((i + 1)..sys.balls.len()).any(|j| {
                    let gap = (sys.balls[i].state.pos - sys.balls[j].state.pos).norm() - 2.0 * r;
                    gap > Eps::KISS && gap <= 3.0 * GAP_MAX
                })
            });
            if any_gap {
                distinct += 1;
            }
        }
        assert!(distinct >= 20, "only {distinct}/30 seeds carry back-row micro-gaps");
    }

    #[test]
    fn gapped_contrast_racks_are_legal_across_seeds() {
        for seed in 0..50u64 {
            assert_legal(&SystemState::nine_ball_rack_gapped(seed), 10);
            assert_legal(&SystemState::fifteen_ball_rack_gapped(seed), 16);
        }
    }

    #[test]
    fn ball_ids_are_stable() {
        let nine = SystemState::nine_ball_rack(3);
        let ids: Vec<u8> = nine.balls.iter().map(|b| b.id.0).collect();
        assert_eq!(ids, [0, 1, 2, 3, 4, 9, 5, 6, 7, 8]);
        // 9-ball in the diamond center (third row, x ≈ 0)
        let nb = nine.balls.iter().find(|b| b.id == BallId(9)).unwrap();
        assert!(nb.state.pos.x.abs() < 1e-3);

        let fifteen = SystemState::fifteen_ball_rack(3);
        let ids: Vec<u8> = fifteen.balls.iter().map(|b| b.id.0).collect();
        assert_eq!(ids, [0, 1, 2, 3, 4, 8, 6, 7, 5, 9, 10, 11, 12, 13, 14, 15]);
        // 8-ball centered in the third row (x ≈ 0)
        let eight = fifteen.balls.iter().find(|b| b.id == BallId(8)).unwrap();
        assert!(eight.state.pos.x.abs() < 1e-3);
    }

    #[test]
    fn same_seed_is_bit_identical_different_seeds_differ() {
        for seed in [0u64, 1, 42, u64::MAX] {
            assert_eq!(
                SystemState::nine_ball_rack(seed).balls,
                SystemState::nine_ball_rack(seed).balls
            );
            assert_eq!(
                SystemState::fifteen_ball_rack(seed).balls,
                SystemState::fifteen_ball_rack(seed).balls
            );
        }
        assert_ne!(
            SystemState::nine_ball_rack(42).balls,
            SystemState::nine_ball_rack(43).balls
        );
        assert_ne!(
            SystemState::fifteen_ball_rack(42).balls,
            SystemState::fifteen_ball_rack(43).balls
        );
    }

    /// The per-ball nominal gap draws stay inside [GAP_MIN, GAP_MAX), the
    /// jitter stays inside the safe radius (GAP_MAX − gap)/2 in the table
    /// plane, and the gap draw is uniform-ish (mean near the band center).
    #[test]
    fn gap_draws_within_band_and_uniform() {
        let mut rng = Pcg32::new(2024, 0);
        let n = 10_000;
        let mut sum = 0.0;
        for _ in 0..n {
            let (gap, jitter) = draw_gap_jitter(&mut rng);
            assert!((GAP_MIN..GAP_MAX).contains(&gap), "gap {gap} out of band");
            assert!(jitter.norm() <= 0.5 * (GAP_MAX - gap) + TOL);
            assert_eq!(jitter.z, 0.0);
            sum += gap;
        }
        let mean = sum / f64::from(n);
        let center = 0.5 * (GAP_MIN + GAP_MAX);
        assert!(
            (mean - center).abs() < 0.05 * (GAP_MAX - GAP_MIN),
            "gap mean {mean} far from band center {center}"
        );
    }

    /// Frozen prototype, frozen_fraction = 1: every lattice-adjacent contact
    /// sits at EXACTLY the frozen pitch (gap = FROZEN_GAP < Eps::KISS), no
    /// pair below it, layout/ids match the gapped rack's lattice.
    #[test]
    fn frozen_rack_full_fraction_is_perfect_frozen_lattice() {
        use crate::consts::Eps;
        for seed in 0..20u64 {
            for sys in [
                SystemState::nine_ball_rack_frozen(seed, 1.0),
                SystemState::fifteen_ball_rack_frozen(seed, 1.0),
            ] {
                let r = sys.balls[0].params.r;
                let s = 2.0 * r + FROZEN_GAP;
                const { assert!(FROZEN_GAP < Eps::KISS) };
                let mut frozen_pairs = 0;
                for i in 1..sys.balls.len() {
                    for j in (i + 1)..sys.balls.len() {
                        let d = (sys.balls[i].state.pos - sys.balls[j].state.pos).norm();
                        assert!(d >= s - TOL, "pair {i}/{j} below frozen pitch: {d}");
                        if d <= s + TOL {
                            frozen_pairs += 1;
                        }
                    }
                }
                // 9-ball diamond: 16 lattice contacts; 15 triangle: 30
                let expect = if sys.balls.len() == 10 { 16 } else { 30 };
                assert_eq!(frozen_pairs, expect, "frozen contact count");
                for b in &sys.balls {
                    assert_eq!(b.state.pos.z, r);
                    assert_eq!(b.state.motion, MotionState::Stationary);
                }
            }
        }
    }

    /// Frozen prototype, partial fraction: legality invariant (no pair below
    /// the frozen pitch) holds across seeds, some contacts stay frozen
    /// (within Eps::KISS) and some open into the micro-gap band, and the
    /// construction is seed-deterministic. frozen_fraction is clamped.
    #[test]
    fn frozen_rack_partial_fraction_mixes_frozen_and_micro_gaps() {
        use crate::consts::Eps;
        let mut seeds_with_gaps = 0u32;
        for seed in 0..30u64 {
            let sys = SystemState::fifteen_ball_rack_frozen(seed, 0.6);
            let r = sys.balls[0].params.r;
            let s = 2.0 * r + FROZEN_GAP;
            let (mut frozen, mut gapped) = (0u32, 0u32);
            for i in 1..sys.balls.len() {
                for j in (i + 1)..sys.balls.len() {
                    let d = (sys.balls[i].state.pos - sys.balls[j].state.pos).norm();
                    assert!(d >= s - TOL, "seed {seed} pair {i}/{j} illegal: {d}");
                    let gap = d - 2.0 * r;
                    if gap <= Eps::KISS {
                        frozen += 1;
                    } else if gap <= 3.0 * GAP_MAX {
                        // lattice-adjacent contact opened into a micro-gap
                        // (per-ball jitter + row loosening compose)
                        gapped += 1;
                    }
                }
            }
            // within-row contacts can never open (the clamp freezes interior
            // balls), so frozen contacts always survive
            assert!(frozen >= 10, "seed {seed}: frozen contacts {frozen} < 10");
            if gapped > 0 {
                seeds_with_gaps += 1;
            }
        }
        // at f = 0.6 the imperfection is probabilistic per seed; the vast
        // majority of racks must carry at least one micro-gapped contact
        assert!(
            seeds_with_gaps >= 24,
            "only {seeds_with_gaps}/30 seeds produced micro-gaps"
        );
        // determinism + distinct seeds
        assert_eq!(
            SystemState::nine_ball_rack_frozen(7, 0.6).balls,
            SystemState::nine_ball_rack_frozen(7, 0.6).balls
        );
        assert_ne!(
            SystemState::nine_ball_rack_frozen(7, 0.6).balls,
            SystemState::nine_ball_rack_frozen(8, 0.6).balls
        );
        // clamping: out-of-range fractions behave like the endpoints
        assert_eq!(
            SystemState::nine_ball_rack_frozen(7, 2.0).balls,
            SystemState::nine_ball_rack_frozen(7, 1.0).balls
        );
    }

    /// Feature 012 snooker frame (WPBSA Sec3 R2(a)(i), quickstart §1):
    /// 22 balls with unique ids 0–21 on the snooker ballset radius; cue at
    /// the D default; colours EXACTLY on their spots; apex red exactly on
    /// the centre line at pink_y + d + GAP_MIN — never touching the pink
    /// (gap floor > Eps::KISS) — with the apex wedge frozen; pack legality
    /// (no pair below the frozen pitch); 5th row clears the black spot;
    /// bit-deterministic per seed.
    #[test]
    fn snooker_rack_layout_and_frozen_topology() {
        use crate::consts::Eps;
        for seed in 0..30u64 {
            let sys = SystemState::snooker_rack(seed);
            let balls = &sys.balls;
            assert_eq!(balls.len(), 22);
            let mut ids: Vec<u8> = balls.iter().map(|b| b.id.0).collect();
            ids.sort_unstable();
            ids.dedup();
            assert_eq!(ids, (0..=21).collect::<Vec<u8>>());
            let r = balls[0].params.r;
            assert_eq!(r, 0.02625, "snooker ballset radius");
            let get = |id: u8| balls.iter().find(|b| b.id == BallId(id)).unwrap();
            // cue in the D at the default address
            assert_eq!(
                get(0).state.pos,
                Vec3::new(SNOOKER_CUE_DEFAULT.0, SNOOKER_CUE_DEFAULT.1, r)
            );
            // colours exactly on their spots (bit-equal)
            for (id, x, y) in SNOOKER_SPOTS {
                assert_eq!(get(id).state.pos, Vec3::new(x, y, r), "colour {id}");
            }
            // apex red: centre line, pink_y + d + GAP_MIN exactly
            let apex = get(1);
            assert_eq!(apex.state.pos.x, 0.0);
            assert_eq!(apex.state.pos.y, SNOOKER_SPOTS[4].2 + 2.0 * r + GAP_MIN);
            let pink = get(20);
            let apex_gap = (apex.state.pos - pink.state.pos).norm() - 2.0 * r;
            assert!(apex_gap >= GAP_MIN - TOL, "apex-pink gap {apex_gap}");
            assert!(apex_gap > Eps::KISS, "red must NEVER touch the pink");
            // apex wedge frozen (reds 1-2, 1-3, 2-3)
            for (a, b) in [(1u8, 2u8), (1, 3), (2, 3)] {
                let gap = (get(a).state.pos - get(b).state.pos).norm() - 2.0 * r;
                assert!(gap <= Eps::KISS, "wedge {a}-{b} not frozen: {gap}");
            }
            // legality: no pair overlaps; every ball on the bed, at rest
            let s = 2.0 * r + FROZEN_GAP;
            for i in 0..balls.len() {
                for j in (i + 1)..balls.len() {
                    let d = (balls[i].state.pos - balls[j].state.pos).norm();
                    assert!(d >= s - TOL, "balls {i}/{j} below pitch: {d}");
                }
            }
            for b in balls {
                assert!(b.state.pos.x.abs() <= sys.table.width / 2.0 - r);
                assert!(b.state.pos.y.abs() <= sys.table.length / 2.0 - r);
                assert_eq!(b.state.pos.z, r);
                assert_eq!(b.state.motion, MotionState::Stationary);
                assert!(b.state.is_finite());
            }
            // pack stays clear of the black spot (5th row ~ y 1.1266)
            let black_y = SNOOKER_SPOTS[5].2;
            for b in balls.iter().filter(|b| (1..=15).contains(&b.id.0)) {
                assert!(
                    b.state.pos.y < black_y - 2.0 * r,
                    "red {} fouls the black spot region",
                    b.id.0
                );
            }
            assert_eq!(SystemState::snooker_rack(seed).balls, sys.balls);
        }
        assert_ne!(
            SystemState::snooker_rack(1).balls,
            SystemState::snooker_rack(2).balls
        );
    }

    /// Feature 012 carom start (UMB Art 22/23; USBA numeric secondary):
    /// exactly 3 balls — breaker 0 on the chosen start spot, opponent 1 on
    /// the bottom spot, red 2 on the top spot — on the pocketless table at
    /// the carom ballset radius; the cited spot constants are pinned.
    #[test]
    fn carom_start_positions_and_ids() {
        // Cited constants (data-model.md §2): top/bottom spots at ±l/4
        // (2.84/4 = 0.71), start spots 18.25 cm either side of bottom.
        assert_eq!(CAROM_SPOT_TOP, (0.0, 0.710));
        assert_eq!(CAROM_SPOT_CENTRE, (0.0, 0.0));
        assert_eq!(CAROM_SPOT_BOTTOM, (0.0, -0.710));
        assert_eq!(CAROM_START_OFFSET_X, 0.1825);
        assert_eq!(CAROM_SPOT_TOP.1, 2.84 / 4.0);
        for right in [true, false] {
            let sys = SystemState::carom_start(right);
            assert_eq!(sys.balls.len(), 3);
            assert!(sys.table.pockets.is_empty());
            assert!(sys.table.circular.is_empty());
            let r = sys.balls[0].params.r;
            assert_eq!(r, 0.03075, "carom ballset radius");
            assert_eq!(
                sys.balls.iter().map(|b| b.id.0).collect::<Vec<_>>(),
                [0, 1, 2]
            );
            let sx = if right { CAROM_START_OFFSET_X } else { -CAROM_START_OFFSET_X };
            assert_eq!(sys.balls[0].state.pos, Vec3::new(sx, CAROM_SPOT_BOTTOM.1, r));
            assert_eq!(
                sys.balls[1].state.pos,
                Vec3::new(CAROM_SPOT_BOTTOM.0, CAROM_SPOT_BOTTOM.1, r)
            );
            assert_eq!(
                sys.balls[2].state.pos,
                Vec3::new(CAROM_SPOT_TOP.0, CAROM_SPOT_TOP.1, r)
            );
            for b in &sys.balls {
                assert_eq!(b.state.motion, MotionState::Stationary);
                assert!(b.state.is_finite());
            }
        }
    }

    /// Realized nearest-neighbor gaps stay within the provable envelope
    /// [GAP_MIN, 2·GAP_MAX − GAP_MIN] over many seeds: no pair is ever
    /// tighter than GAP_MIN, and every rack ball's nearest neighbor is a
    /// lattice-adjacent ball within the upper bound.
    #[test]
    fn realized_gaps_within_provable_envelope() {
        for seed in 0..50u64 {
            let sys = SystemState::fifteen_ball_rack_gapped(seed);
            let r = sys.balls[0].params.r;
            for i in 1..sys.balls.len() {
                let mut nearest = f64::INFINITY;
                for j in 1..sys.balls.len() {
                    if i == j {
                        continue;
                    }
                    let gap = (sys.balls[i].state.pos - sys.balls[j].state.pos).norm() - 2.0 * r;
                    assert!(gap >= GAP_MIN - TOL, "pair {i}/{j} gap {gap} < GAP_MIN");
                    nearest = nearest.min(gap);
                }
                assert!(
                    (GAP_MIN - TOL..=2.0 * GAP_MAX - GAP_MIN + TOL).contains(&nearest),
                    "ball {i} nearest gap {nearest} outside envelope"
                );
            }
        }
    }
}
