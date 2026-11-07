// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! P21 — snooker table geometry (feature GH-382, `snooker-v2`): the
//! WPBSA Section 2 geometric definitions the completed rules need,
//! transcribed as pure functions over ball footprints. Everything here
//! obeys the crate's R11 exact-ops float discipline (only `+ - * /
//! sqrt` and comparisons; `clippy.toml` pins the `hypot` ban) and stays
//! out of `scan.rs` on purpose — these facts read positions, not the
//! event stream, and the single-pass P1 contract is untouched.
//!
//! Facts provided (WPBSA Official Rules, Revised September 2024 — the
//! feature-011/012 edition pin):
//! - [`final_positions`] — the settled table after a recorded shot:
//!   fold of the record's `post[]` poses over the initial placement,
//!   pocketed/off-table balls removed. Respotted colours are NOT in
//!   this set (respot XY derives adapter-side, the research notes R6) — the
//!   ONE caller that needs post-respot truth is the adapter-facing
//!   address surface, which receives live positions instead.
//! - [`frozen_to`] — Sec 3 R8 touching-ball detection: centre distance
//!   ≤ 2r + [`FROZEN_EPS`] (1 µm — the band rationale lives on the
//!   constant: sanitized contact pairs park at 2r + 1e-9, kernel-settled
//!   overlaps read ≤ 2r, and unsanitized micro-gaps above a micron are
//!   real gaps, never touching balls — review GH-382 r11).
//! - [`snookered`] — Sec 2 R17: a direct straight-line stroke to every
//!   ball on wholly or partially obstructed by a ball not on; "if one
//!   or more balls on can be hit at both extreme edges free of
//!   obstruction ... the cue-ball is not snookered". The extreme-edge
//!   aim lines are the two tangents from the cue centre to the circle
//!   of radius 2r around the target centre; an obstructor blocks an
//!   edge when its centre passes within 2r of that tangent segment
//!   (cue corridor width). R17(e): cushions never snooker (no cushion
//!   input exists here by construction).
//! - [`snookered_from_d`] — Sec 2 R17(a): with the cue-ball in-hand it
//!   is snookered only if obstructed "from all possible positions on
//!   or within the lines of the 'D'". The continuum is evaluated on a
//!   documented lattice ([`D_LATTICE_PITCH`] = 5 mm grid over the D,
//!   baulk-line row included) — the same visual-resolution class as
//!   the referee's own judgment; boundary error is measure-zero.
//! - [`effective_snookerer_is`] — Sec 2 R17(b)/(c) for the Sec 3
//!   R12(b)(ii) free-ball snooker foul: the effective snookering ball
//!   is the nearest obstructor (ties: all equidistant); with Red on,
//!   different Reds obstructed by different balls means there is no
//!   effective snookering ball.
//! - [`full_ball_available`] — Sec 3 R14(d): "central, full ball,
//!   contact was available" — the corridor from the cue centre to the
//!   full-hit ghost position (2r before the target centre on the aim
//!   line) is unobstructed. For Reds the rule counts only colours as
//!   obstructors ("a full diameter of any Red that is not obstructed
//!   by a colour"); for a colour on, any other ball obstructs.
//!
//! Blocking comparisons are STRICT (`< 2r`): a corridor grazed exactly
//! at its boundary is "hit at the extreme edge free of obstruction" —
//! the measure-zero tie resolves to not-blocked, documented here.

use crate::wire::{WireEventKind, WireRecord};

/// One ball footprint: id + centre (kernel x/y metres).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BallXY {
    pub id: i64,
    pub x: f64,
    pub y: f64,
}

/// Touching-ball threshold above 2r. The bands (review GH-382 r11): the
/// app sanitizer parks OVERLAPPING pairs at exactly 2r + 1e-9
/// (`game.js kernelPlacements` — and any pair the kernel itself
/// settles INSIDE 2r reads ≤ 2r here, always detected), while pairs it
/// never touched can rest at arbitrary micro-gaps above 2r. 1e-6 m
/// (a micron — far below visual resolution, comfortably above the
/// sanitizer's 1e-9 park with float headroom) splits "in contact" from
/// "a real gap" honestly; a 5 µm near-miss is NOT a touching ball.
pub const FROZEN_EPS: f64 = 1e-6;

/// A stroke played INTO a touching ball resolves its ball-ball contact
/// almost immediately (measured: t = 1e-9 at v0 = 1.5 m/s on the
/// canonical kernel for the sanitizer's 1e-9 park — GH-382 probe); the
/// widest possible TOUCHING gap ([`FROZEN_EPS`] = 1e-6 m) still
/// contacts within ~3.3e-6 s at the slowest playable speeds, while the
/// closest NON-touching contact (> 1e-6 m gap) at the v0 = 12 slider
/// maximum lands at ≥ 8.3e-8 s… gaps just above the threshold overlap
/// this window in TIME — which is why the push examination keys on the
/// CALLED set first (a ball outside [`FROZEN_EPS`] is never called, so
/// a fast micro-gap contact can never read as a push): within the
/// called set, 1e-5 s covers every touching-gap/speed combination with
/// two orders of margin to the 1e-4 m sanitizer floor at any speed
/// (≥ 8.3e-6 s).
pub const PUSH_CONTACT_WINDOW: f64 = 1e-5;

/// WPBSA Sec 1 R1(e): the "D" radius, 292 mm (the same pinned constant
/// as `game.js SNOOKER_D_RADIUS` / `layouts.ts`, drift-tested there).
pub const D_RADIUS: f64 = 0.292;

/// Lattice pitch for the R17(a) in-hand snooker test (module doc).
pub const D_LATTICE_PITCH: f64 = 0.005;

/// WPBSA Sec 1 R1(d): the baulk line, 737 mm from the face of the
/// bottom cushion (the same pinned constant as `game.js
/// SNOOKER_BAULK_FROM_BOTTOM` / `layouts.ts`, the [`D_RADIUS`] drift
/// convention). Kernel y: `-length/2 + BAULK_FROM_BOTTOM`.
pub const BAULK_FROM_BOTTOM: f64 = 0.737;

/// The in-hand placement clearance (review r29 P2, the r27 pair): the
/// referee never allows a touching in-hand placement (Sec 3
/// R11(b)(vii)), and the app clamp (`game.js D_CLEARANCE`, drift
/// convention like [`D_RADIUS`]) parks overlapping D drags at
/// `2r + 1e-4` — decisively outside the [`FROZEN_EPS`] touching band.
/// The R17(a) lattice therefore treats any sample closer than this to
/// a ball in play as NOT a possible cue position: judging from a spot
/// the player cannot legally occupy could suppress a FREE BALL call.
pub const D_PLACEMENT_CLEARANCE: f64 = 1e-4;

/// The settled table after the recorded shot: initial placements
/// folded through every event's `post[]` poses, pocketed / off-table
/// ids removed (stream order — the P1 ordering doctrine).
pub fn final_positions(record: &WireRecord) -> Vec<BallXY> {
    let mut balls: Vec<BallXY> = record
        .initial
        .balls
        .iter()
        .map(|b| BallXY { id: b.id, x: b.state.pos.x, y: b.state.pos.y })
        .collect();
    for ev in &record.events {
        match &ev.kind {
            WireEventKind::BallPocket { ball, .. }
            | WireEventKind::BallOffTable { ball } => {
                balls.retain(|b| b.id != *ball);
            }
            _ => {}
        }
        for (id, s) in &ev.post {
            if let Some(b) = balls.iter_mut().find(|b| b.id == *id) {
                b.x = s.pos.x;
                b.y = s.pos.y;
            }
        }
    }
    balls
}

/// The initial (address) footprints of a record — the pre-stroke table
/// the touching-ball examination reads (Sec 3 R8(a): the referee
/// examines the position the previous stroke left).
pub fn initial_positions(record: &WireRecord) -> Vec<BallXY> {
    record
        .initial
        .balls
        .iter()
        .map(|b| BallXY { id: b.id, x: b.state.pos.x, y: b.state.pos.y })
        .collect()
}

/// Ball ids from `candidates` frozen to the cue (centre distance
/// ≤ 2r + [`FROZEN_EPS`]), in `candidates` order.
pub fn frozen_to(
    cue: (f64, f64),
    balls: &[BallXY],
    candidates: &[i64],
    r: f64,
) -> Vec<i64> {
    let mut out = Vec::new();
    for id in candidates {
        let Some(b) = balls.iter().find(|b| b.id == *id) else {
            continue;
        };
        let dx = b.x - cue.0;
        let dy = b.y - cue.1;
        if (dx * dx + dy * dy).sqrt() <= 2.0 * r + FROZEN_EPS {
            out.push(*id);
        }
    }
    out
}

/// Distance from point `p` to segment `a`→`b` (exact ops only).
fn dist_to_segment(p: (f64, f64), a: (f64, f64), b: (f64, f64)) -> f64 {
    let abx = b.0 - a.0;
    let aby = b.1 - a.1;
    let len2 = abx * abx + aby * aby;
    let u = if len2 > 0.0 {
        (((p.0 - a.0) * abx + (p.1 - a.1) * aby) / len2).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let dx = p.0 - (a.0 + u * abx);
    let dy = p.1 - (a.1 + u * aby);
    (dx * dx + dy * dy).sqrt()
}

/// The two extreme-edge tangent points from cue centre `p` to the
/// contact circle (radius 2r) around target centre `b`, or `None` when
/// the cue is touching/inside that circle (then the target is directly
/// playable — no snooker on it, Sec 3 R8 territory instead).
fn edge_targets(
    p: (f64, f64),
    b: (f64, f64),
    r: f64,
) -> Option<[(f64, f64); 2]> {
    let rho = 2.0 * r;
    let dx = b.0 - p.0;
    let dy = b.1 - p.1;
    let d = (dx * dx + dy * dy).sqrt();
    if d <= rho + FROZEN_EPS {
        return None;
    }
    // v: unit from target back toward the cue; w: its perpendicular.
    let vx = -dx / d;
    let vy = -dy / d;
    let (wx, wy) = (-vy, vx);
    let cos_a = rho / d;
    let sin_a = (1.0 - cos_a * cos_a).sqrt();
    let t1 = (
        b.0 + rho * (cos_a * vx + sin_a * wx),
        b.1 + rho * (cos_a * vy + sin_a * wy),
    );
    let t2 = (
        b.0 + rho * (cos_a * vx - sin_a * wx),
        b.1 + rho * (cos_a * vy - sin_a * wy),
    );
    Some([t1, t2])
}

/// Obstructors of one extreme-edge corridor `p`→`t`: ids of balls from
/// `blockers` whose centre passes strictly within 2r of the segment.
fn edge_blockers(
    p: (f64, f64),
    t: (f64, f64),
    blockers: &[&BallXY],
    r: f64,
) -> Vec<i64> {
    blockers
        .iter()
        .filter(|o| dist_to_segment((o.x, o.y), p, t) < 2.0 * r)
        .map(|o| o.id)
        .collect()
}

/// Per-target snooker examination from one cue position: `None` when
/// the target can be hit at both extreme edges free of obstruction
/// (or is touching the cue), otherwise the blocking ids (union of both
/// edges' blockers, first-seen order).
fn target_blockers(
    p: (f64, f64),
    target: &BallXY,
    blockers: &[&BallXY],
    r: f64,
) -> Option<Vec<i64>> {
    let Some(edges) = edge_targets(p, (target.x, target.y), r) else {
        return None; // touching the target: playable
    };
    let b1 = edge_blockers(p, edges[0], blockers, r);
    let b2 = edge_blockers(p, edges[1], blockers, r);
    if b1.is_empty() && b2.is_empty() {
        return None;
    }
    let mut all = b1;
    for id in b2 {
        if !all.contains(&id) {
            all.push(id);
        }
    }
    Some(all)
}

/// The Sec 2 R17 obstructor set: balls in play that are neither the
/// cue, nor a target ("by a ball or balls not on").
fn not_on<'a>(
    balls: &'a [BallXY],
    on_ids: &[i64],
    cue_id: i64,
) -> Vec<&'a BallXY> {
    balls
        .iter()
        .filter(|b| b.id != cue_id && !on_ids.contains(&b.id))
        .collect()
}

/// Sec 2 R17 (main definition) from a concrete cue position: snookered
/// iff NO ball on can be hit at both extreme edges free of obstruction
/// by any ball not on. An empty `on_ids` set is never snookered.
pub fn snookered(
    cue: (f64, f64),
    balls: &[BallXY],
    on_ids: &[i64],
    r: f64,
) -> bool {
    if on_ids.is_empty() {
        return false;
    }
    let blockers = not_on(balls, on_ids, 0);
    let mut any_target = false;
    for id in on_ids {
        let Some(target) = balls.iter().find(|b| b.id == *id) else {
            continue;
        };
        any_target = true;
        if target_blockers(cue, target, &blockers, r).is_none() {
            return false;
        }
    }
    any_target
}

/// Sec 2 R17(a): the in-hand arm — snookered only if obstructed from
/// ALL positions on or within the lines of the D (evaluated on the
/// documented [`D_LATTICE_PITCH`] grid; `baulk_y` is the baulk line's
/// kernel y, the D bulging toward the bottom cushion, matching
/// `game.js placeCueInD`). Lattice points overlapping a ball in play
/// are skipped (the cue cannot be placed touching — Sec 3 R11(b)(vii),
/// enforced by the placement clamp).
/// One legally-occupiable test for a D lattice sample — shared by
/// [`snookered_from_d`] and [`effective_snookerer_is_from_d`] (review
/// GH-382 r35 P3): a sample is unavailable only when a ball in play
/// sits STRICTLY inside the placement clearance. The boundary itself
/// is occupiable — the app's D clamp projects a blocked drag to
/// EXACTLY `2r + D_PLACEMENT_CLEARANCE` and accepts that seat, so the
/// lattice must accept it too (crate/clamp coherence: an `<=` discard
/// here could falsely report a snooker when the boundary sample holds
/// the only clear line).
fn d_sample_occupied(x: f64, y: f64, balls: &[BallXY], r: f64) -> bool {
    balls.iter().any(|b| {
        if b.id == 0 {
            return false;
        }
        let dx = b.x - x;
        let dy = b.y - y;
        (dx * dx + dy * dy).sqrt() < 2.0 * r + D_PLACEMENT_CLEARANCE
    })
}

pub fn snookered_from_d(
    baulk_y: f64,
    balls: &[BallXY],
    on_ids: &[i64],
    r: f64,
) -> bool {
    if on_ids.is_empty() {
        return false;
    }
    let steps = (D_RADIUS / D_LATTICE_PITCH) as i64;
    for iy in 0..=steps {
        let y = baulk_y - (iy as f64) * D_LATTICE_PITCH;
        for ix in -steps..=steps {
            let x = (ix as f64) * D_LATTICE_PITCH;
            let ddx = x;
            let ddy = y - baulk_y;
            if (ddx * ddx + ddy * ddy).sqrt() > D_RADIUS {
                continue;
            }
            // an occupied placement is not a possible position — nor is
            // one inside the placement clearance (review r29 P2: the
            // clamp forbids anything closer than 2r + D_PLACEMENT_
            // CLEARANCE, so such a sample is not legally occupiable)
            if d_sample_occupied(x, y, balls, r) {
                continue;
            }
            if !snookered((x, y), balls, on_ids, r) {
                return false;
            }
        }
    }
    true
}

/// Sec 2 R17(b)/(c): is `free_ball` THE effective snookering ball for
/// every ball on, from the cue position? (The Sec 3 R12(b)(ii) foul
/// predicate.) Per (b), the effective snookering ball of one target is
/// its nearest blocker (ties: all equidistant are effective); per (c),
/// with several targets, different targets snookered by different
/// balls means no effective snookering ball — the free ball must be
/// (among) the nearest blockers of EVERY obstructed target, and the
/// position must actually be a snooker.
pub fn effective_snookerer_is(
    cue: (f64, f64),
    balls: &[BallXY],
    on_ids: &[i64],
    free_ball: i64,
    r: f64,
) -> bool {
    if !snookered(cue, balls, on_ids, r) {
        return false;
    }
    let blockers = not_on(balls, on_ids, 0);
    for id in on_ids {
        let Some(target) = balls.iter().find(|b| b.id == *id) else {
            continue;
        };
        let Some(blocking) = target_blockers(cue, target, &blockers, r)
        else {
            continue; // unobstructed target cannot exist here (snookered)
        };
        // nearest blocker(s) of this target, by centre distance to cue
        let mut best = f64::INFINITY;
        for bid in &blocking {
            if let Some(b) = balls.iter().find(|b| b.id == *bid) {
                let dx = b.x - cue.0;
                let dy = b.y - cue.1;
                let d = (dx * dx + dy * dy).sqrt();
                if d < best {
                    best = d;
                }
            }
        }
        let nearest_is_free = blocking.iter().any(|bid| {
            *bid == free_ball
                && balls.iter().find(|b| b.id == *bid).is_some_and(|b| {
                    let dx = b.x - cue.0;
                    let dy = b.y - cue.1;
                    (dx * dx + dy * dy).sqrt() <= best
                })
        });
        if !nearest_is_free {
            return false;
        }
    }
    true
}

/// Sec 3 R12(b)(ii) after a scratch (review GH-382 r31): the incoming
/// player is IN HAND, so the examination runs the R17(a) arm — the
/// position is a free-ball snooker only if from EVERY legally
/// occupiable D sample (the [`D_PLACEMENT_CLEARANCE`] occupancy law,
/// matching [`snookered_from_d`]) the free ball is the effective
/// snookering ball of every ball on ([`effective_snookerer_is`]).
/// `false` when the D is fully packed (no legal sample exists — the
/// examination cannot find a snookered position to price).
pub fn effective_snookerer_is_from_d(
    baulk_y: f64,
    balls: &[BallXY],
    on_ids: &[i64],
    free_ball: i64,
    r: f64,
) -> bool {
    if on_ids.is_empty() {
        return false;
    }
    let steps = (D_RADIUS / D_LATTICE_PITCH) as i64;
    let mut any_open = false;
    for iy in 0..=steps {
        let y = baulk_y - (iy as f64) * D_LATTICE_PITCH;
        for ix in -steps..=steps {
            let x = (ix as f64) * D_LATTICE_PITCH;
            let ddx = x;
            let ddy = y - baulk_y;
            if (ddx * ddx + ddy * ddy).sqrt() > D_RADIUS {
                continue;
            }
            if d_sample_occupied(x, y, balls, r) {
                continue;
            }
            any_open = true;
            if !effective_snookerer_is((x, y), balls, on_ids, free_ball, r)
            {
                return false;
            }
        }
    }
    any_open
}

/// Sec 3 R14(d): central, full-ball contact available on some ball on.
/// The corridor runs from the cue centre to the full-hit ghost position
/// (2r short of the target centre along the aim line). `reds_on`
/// selects the Rule's obstructor set: for Reds only colours obstruct
/// (ids 16–21); for a colour on, every other ball does.
pub fn full_ball_available(
    cue: (f64, f64),
    balls: &[BallXY],
    on_ids: &[i64],
    r: f64,
    reds_on: bool,
) -> bool {
    for id in on_ids {
        let Some(target) = balls.iter().find(|b| b.id == *id) else {
            continue;
        };
        let dx = target.x - cue.0;
        let dy = target.y - cue.1;
        let d = (dx * dx + dy * dy).sqrt();
        if d <= 2.0 * r + FROZEN_EPS {
            return true; // touching a ball on: R14(d)'s touching arm
        }
        let ghost = (
            target.x - dx / d * 2.0 * r,
            target.y - dy / d * 2.0 * r,
        );
        let blocked = balls.iter().any(|o| {
            if o.id == 0 || o.id == *id {
                return false;
            }
            if reds_on && !(16..=21).contains(&o.id) {
                return false; // Reds: only a colour obstructs (R14(d))
            }
            dist_to_segment((o.x, o.y), cue, ghost) < 2.0 * r
        });
        if !blocked {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    const R: f64 = 0.02625;

    fn b(id: i64, x: f64, y: f64) -> BallXY {
        BallXY { id, x, y }
    }

    #[test]
    fn frozen_detects_sanitized_contact_and_rejects_free_gap() {
        // the sanitizer's 1e-9 park is IN; a 5 µm near-miss and the
        // 1e-4 sanitizer floor are OUT (review GH-382 r11: unsanitized
        // micro-gaps above 2r are real gaps, not touching balls)
        let balls = [b(1, 0.0, 2.0 * R + 1e-9), b(2, 0.0, -(2.0 * R + 1e-4)),
            b(3, 2.0 * R + 5e-6, 0.0)];
        let f = frozen_to((0.0, 0.0), &balls, &[1, 2, 3], R);
        assert_eq!(f, vec![1]);
    }

    #[test]
    fn open_table_is_not_snookered() {
        let balls = [b(0, 0.0, 0.0), b(1, 0.0, 0.5), b(16, 0.4, -0.4)];
        assert!(!snookered((0.0, 0.0), &balls, &[1], R));
    }

    #[test]
    fn dead_straight_block_is_a_snooker() {
        // blue (17) dead on the line cue -> red, close enough to cover
        // both extreme edges
        let balls =
            [b(0, 0.0, 0.0), b(1, 0.0, 0.5), b(17, 0.0, 0.25)];
        assert!(snookered((0.0, 0.0), &balls, &[1], R));
    }

    #[test]
    fn one_clear_red_defeats_the_snooker() {
        let balls = [
            b(0, 0.0, 0.0),
            b(1, 0.0, 0.5),
            b(17, 0.0, 0.25), // blocks red 1
            b(2, 0.5, 0.0),   // wide open
        ];
        assert!(!snookered((0.0, 0.0), &balls, &[1, 2], R));
    }

    #[test]
    fn an_on_ball_never_blocks() {
        // a red in front of another red: not a snooker (R17: obstruction
        // must come from a ball NOT on)
        let balls = [b(0, 0.0, 0.0), b(1, 0.0, 0.5), b(2, 0.0, 0.25)];
        assert!(!snookered((0.0, 0.0), &balls, &[1, 2], R));
    }

    #[test]
    fn partial_edge_block_is_a_snooker() {
        // obstructor shading exactly one extreme edge: "hit at BOTH
        // extreme edges free of obstruction" fails -> snookered
        let balls = [
            b(0, 0.0, 0.0),
            b(1, 0.0, 0.5),
            b(17, 0.052, 0.25), // offset: covers one tangent only
        ];
        assert!(snookered((0.0, 0.0), &balls, &[1], R));
    }

    #[test]
    fn touching_target_is_playable_not_snookered() {
        let balls = [b(0, 0.0, 0.0), b(1, 0.0, 2.0 * R + 1e-9)];
        assert!(!snookered((0.0, 0.0), &balls, &[1], R));
    }

    #[test]
    fn effective_snookerer_nearest_rule() {
        // two stacked blockers: only the nearer one is effective
        let balls = [
            b(0, 0.0, 0.0),
            b(1, 0.0, 0.8),
            b(17, 0.0, 0.2),
            b(18, 0.0, 0.4),
        ];
        assert!(effective_snookerer_is((0.0, 0.0), &balls, &[1], 17, R));
        assert!(!effective_snookerer_is((0.0, 0.0), &balls, &[1], 18, R));
    }

    #[test]
    fn different_reds_different_blockers_no_effective_ball() {
        // R17(c): red 1 blocked by 17, red 2 blocked by 18 -> neither is
        // the effective snookering ball
        let balls = [
            b(0, 0.0, 0.0),
            b(1, 0.0, 0.8),
            b(17, 0.0, 0.2),
            b(2, 0.8, 0.0),
            b(18, 0.2, 0.0),
        ];
        assert!(snookered((0.0, 0.0), &balls, &[1, 2], R));
        assert!(!effective_snookerer_is(
            (0.0, 0.0), &balls, &[1, 2], 17, R));
        assert!(!effective_snookerer_is(
            (0.0, 0.0), &balls, &[1, 2], 18, R));
    }

    #[test]
    fn d_sample_boundary_is_legally_occupiable() {
        // review GH-382 r35 P3: the app's D clamp PLACES the cue at
        // exactly 2r + D_PLACEMENT_CLEARANCE from a blocking ball —
        // that seat is a legal position and the lattice must count it
        // (RED pre-fix: the `<=` discard treated the clamp's own
        // landing as occupied). Strictly inside stays unavailable.
        // The sample sits at x = 0 and the ball on its y-axis, so the
        // predicate's dx IS the ball's x verbatim; the ulp search pins
        // a dx whose COMPUTED distance equals the boundary bit-exactly
        // (sqrt(dx*dx) can round a raw boundary value one ulp off).
        let s = (0.0, -1.2);
        let bnd = 2.0 * R + D_PLACEMENT_CLEARANCE;
        let mut dx = bnd;
        for _ in 0..8 {
            let d = (dx * dx + 0.0f64).sqrt();
            if d == bnd {
                break;
            }
            dx = if d > bnd {
                f64::from_bits(dx.to_bits() - 1)
            } else {
                f64::from_bits(dx.to_bits() + 1)
            };
        }
        assert_eq!((dx * dx + 0.0f64).sqrt(), bnd,
            "a boundary-exact computed distance exists within 8 ulps");
        assert!(!d_sample_occupied(s.0, s.1, &[b(17, dx, s.1)], R),
            "the clamp's own landing distance is occupiable");
        assert!(d_sample_occupied(
            s.0, s.1, &[b(17, bnd - 1e-9, s.1)], R),
            "strictly inside the clearance stays unavailable");
        // the cue ball never occupies (it is the ball being placed)
        assert!(!d_sample_occupied(s.0, s.1, &[b(0, s.0, s.1)], R));
    }

    #[test]
    fn d_lattice_full_wall_snooker_and_open_escape() {
        // a picket wall of colours just above the baulk line spanning
        // the D: every red behind it is snookered from everywhere in
        // the D. Remove one picket and an open lane appears.
        let baulk_y = -1.0475;
        let mut balls = vec![b(1, 0.0, 0.8)];
        let mut x = -0.45;
        let mut id = 16;
        while x <= 0.45 {
            balls.push(b(id, x, baulk_y + 0.08));
            id = if id == 21 { 16 } else { id + 1 };
            x += 2.0 * R + 0.001;
        }
        assert!(snookered_from_d(baulk_y, &balls, &[1], R));
        // open a wide gate in the middle of the wall
        balls.retain(|bl| bl.id == 1 || bl.x < -0.05 || bl.x > 0.20);
        assert!(!snookered_from_d(baulk_y, &balls, &[1], R));
    }

    #[test]
    fn full_ball_reds_ignore_red_cover_but_respect_colours() {
        // red 2 in front of red 1: full-ball on red 1 still "available"
        // (R14(d): Reds obstructed only by a colour)
        let balls = [b(0, 0.0, 0.0), b(1, 0.0, 0.5), b(2, 0.0, 0.25)];
        assert!(full_ball_available((0.0, 0.0), &balls, &[1], R, true));
        // swap the cover for a colour: no central full-ball contact
        let balls = [b(0, 0.0, 0.0), b(1, 0.0, 0.5), b(17, 0.0, 0.25)];
        assert!(!full_ball_available((0.0, 0.0), &balls, &[1], R, true));
        // colour on: ANY other ball obstructs
        let balls = [b(0, 0.0, 0.0), b(18, 0.0, 0.5), b(1, 0.0, 0.25)];
        assert!(!full_ball_available(
            (0.0, 0.0), &balls, &[18], R, false));
    }
}
