// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Event-time solvers per pair type (M3-owned).
//!
//! Derived from pooltool `pooltool/evolution/event_based/detect/`,
//! `pooltool/physics/utils.py`, `pooltool/ptmath/utils.py` and
//! `pooltool/ptmath/roots/core.py`
//! (https://github.com/ekiefl/pooltool @ 9a8abfe0, Apache-2.0) and modified
//! by the OpenBilliards authors.
//!
//! Coefficient derivations follow pooltool (ekiefl/pooltool, Apache-2.0):
//! - `pooltool/evolution/event_based/detect/ball_ball.py`
//!   (`ball_ball_collision_time_2d`, lines 62–132) and
//!   `detect/quartic_coefficients.py`
//!   (`parabola_sphere_distance_quartic_coefficients`) for ball–ball;
//! - `pooltool/evolution/event_based/detect/ball_cushion.py`
//!   (`ball_vertical_plane_collision_time` :23–101 for linear segments,
//!   `ball_vertical_cylinder_collision_time` :104–150 for jaw arcs);
//! - `pooltool/evolution/event_based/detect/ball_pocket.py`
//!   (`ball_pocket_collision_time` :16–60; center crosses `pocket.radius`,
//!   no +R).
//!
//! Equation walk-through: `docs/research/pooltool-engine.md` §2.
//!
//! Time semantics (trunk decision, documented for M3): the caller passes
//! position polynomials anchored at the current sim time (poly parameter
//! τ = 0 ≡ "now"); these functions return the earliest LOCAL root τ > `t_min`
//! (`t_min` = `Eps::TIME` guard). The event loop converts to absolute time
//! (t_now + τ) before caching — cached candidate times are ABSOLUTE.
//! Contact at τ = 0 must yield an immediate event ONLY for approaching pairs
//! (relative normal velocity < 0): see [`ball_ball_time`] for the ball-ball
//! overlap + at-contact window guards (issue #215) and the mirroring
//! at-contact guards in
//! [`ball_linear_cushion_time`] / [`ball_circular_cushion_time`] (a ball
//! at/inside cushion contact distance and moving into the cushion must not
//! tunnel just because its root is ≤ `t_min`). [`ball_pocket_time`] treats a
//! center at/inside the point-of-no-return circle as pocketed immediately,
//! regardless of direction.

use crate::consts::Eps;
use crate::evolve::PosPoly;
use crate::math::{self, Roots};
use crate::table::{CircularCushionSegment, LinearCushionSegment, Pocket};
use crate::types::Vec3;

/// Evaluate a position polynomial at local time `tau`.
fn poly_at(p: &PosPoly, tau: f64) -> Vec3 {
    p.c0 + p.c1 * tau + p.c2 * (tau * tau)
}

/// Quartic coefficients `[a4, a3, a2, a1, a0]` of
/// |p_a(τ) − p_b(τ)|² − rsum² where each path is c0 + c1·τ + c2·τ².
///
/// Exactly pooltool `detect/ball_ball.py:122-130`
/// (`ball_ball_collision_time_2d`: A = relative τ² coeff, B = relative τ
/// coeff, C = relative offset; a = A·A, b = 2A·B, c = B·B + 2A·C, d = 2B·C,
/// e = C·C − (2R)²), extended from xy to the full 3D difference vector as in
/// pooltool `detect/quartic_coefficients.py` (there ½-scaled; scaling does
/// not move roots). For v1 on-table balls of equal radius the z-difference is
/// identically 0, making this bit-identical to the 2D xy form; for unequal
/// radii (z = R each) the 3D form is the physically correct sphere-contact
/// condition.
fn ball_ball_quartic(a: &PosPoly, b: &PosPoly, rsum: f64) -> [f64; 5] {
    let ca = a.c2 - b.c2; // A: relative acceleration/2 (τ² coefficient)
    let cb = a.c1 - b.c1; // B: relative velocity (τ coefficient)
    let cc = a.c0 - b.c0; // C: relative position (constant)
    [
        ca.dot(ca),
        2.0 * ca.dot(cb),
        cb.dot(cb) + 2.0 * ca.dot(cc),
        2.0 * cb.dot(cc),
        cc.dot(cc) - rsum * rsum,
    ]
}

/// Quartic coefficients `[a4, a3, a2, a1, a0]` of the xy-plane condition
/// (x(τ) − cx)² + (y(τ) − cy)² = dist².
///
/// Exactly pooltool `detect/ball_cushion.py:142-150`
/// (`ball_vertical_cylinder_collision_time`) / `detect/ball_pocket.py:54-58`
/// (`ball_pocket_collision_time`) — the ½-scaled expansion (scaling does not
/// move roots). z is irrelevant: cylinders/pockets are vertical.
fn xy_cylinder_quartic(p: &PosPoly, cx: f64, cy: f64, dist: f64) -> [f64; 5] {
    let (ax, ay) = (p.c2.x, p.c2.y);
    let (bx, by) = (p.c1.x, p.c1.y);
    let (px, py) = (p.c0.x, p.c0.y);
    [
        0.5 * (ax * ax + ay * ay),
        ax * bx + ay * by,
        ax * (px - cx) + ay * (py - cy) + 0.5 * (bx * bx + by * by),
        bx * (px - cx) + by * (py - cy),
        0.5 * (cx * cx + cy * cy + px * px + py * py - dist * dist) - (px * cx + py * cy),
    ]
}

/// Jaw-arc contact quartic: center distance = arc.radius + ball radius `r`.
fn circular_cushion_quartic(p: &PosPoly, arc: &CircularCushionSegment, r: f64) -> [f64; 5] {
    xy_cylinder_quartic(p, arc.center.x, arc.center.y, arc.radius + r)
}

/// Pocket point-of-no-return quartic: ball CENTER crosses `pocket.radius`
/// (no +r; pooltool `ball_pocket.py:58`).
fn pocket_quartic(p: &PosPoly, pocket: &Pocket) -> [f64; 5] {
    xy_cylinder_quartic(p, pocket.center.x, pocket.center.y, pocket.radius)
}

/// Quadratic coefficients `(a2, a1, a0)` of the signed-plane-distance
/// condition lx·x(τ) + ly·y(τ) + l0 = +r.
///
/// pooltool `detect/ball_cushion.py:63-79` (`ball_vertical_plane_collision_time`)
/// with two trunk simplifications: [`LinearCushionSegment::line_coeffs`] is
/// already normalized (√(lx² + ly²) = 1) and signed positive on the playable
/// side, so only the single `+r` offset plane is solved (pooltool's
/// `direction` enum handles both ±R sides).
fn linear_plane_quadratic(p: &PosPoly, seg: &LinearCushionSegment, r: f64) -> (f64, f64, f64) {
    let (lx, ly, l0) = seg.line_coeffs();
    (
        lx * p.c2.x + ly * p.c2.y,
        lx * p.c1.x + ly * p.c1.y,
        lx * p.c0.x + ly * p.c0.y + l0 - r,
    )
}

/// pooltool's real-root switch point (`ptmath/roots/core.py`): below this
/// |re| the imaginary filter is relative rather than absolute.
const REAL_RE_SWITCH: f64 = 1e-3;

/// Hybrid real-root filter (contract §M1; pooltool `ptmath/roots/core.py::
/// get_real_positive_smallest_root`): a root is real if |im| <
/// `Eps::ROOT_IM_ABS` when |re| > 1e-3, else |im|/|re| < `Eps::ROOT_IM_REL`.
///
/// Duplicated privately here because the linear-cushion path must validate
/// each candidate root geometrically before picking the smallest, which
/// `math::smallest_positive_real_root` cannot do (pooltool likewise inlines
/// its own filter loop in `ball_vertical_plane_collision_time`).
fn is_real_root(re: f64, im: f64) -> bool {
    if im == 0.0 {
        return true;
    }
    if re.abs() > REAL_RE_SWITCH {
        im.abs() < Eps::ROOT_IM_ABS
    } else {
        im.abs() < Eps::ROOT_IM_REL * re.abs()
    }
}

/// Geometric validation of one linear-cushion candidate root:
/// (a) the ball center at τ projects within the segment span, 0 ≤ s ≤ 1
///     (pooltool `ball_cushion.py:92-99` `s_score`);
/// (b) the ball moves INTO the cushion at τ (signed plane distance
///     decreasing, f′(τ) < 0). This replaces pooltool's two-sided
///     `direction` handling under the trunk single-playable-side convention:
///     it rejects the outbound root of the quadratic and any crossing
///     approached from the non-playable side.
fn valid_linear_hit(p: &PosPoly, seg: &LinearCushionSegment, tau: f64) -> bool {
    let pos = poly_at(p, tau);
    let dx = seg.p2.x - seg.p1.x;
    let dy = seg.p2.y - seg.p1.y;
    let s = ((pos.x - seg.p1.x) * dx + (pos.y - seg.p1.y) * dy) / (dx * dx + dy * dy);
    if !(0.0..=1.0).contains(&s) {
        return false;
    }
    let (lx, ly, _) = seg.line_coeffs();
    lx * (p.c1.x + 2.0 * p.c2.x * tau) + ly * (p.c1.y + 2.0 * p.c2.y * tau) < 0.0
}

/// Smallest real root > `t_min` that passes [`valid_linear_hit`] AND whose
/// approach speed at the root exceeds [`REST_APPROACH`] — the seat
/// re-entry filter (feature 021 T011): sub-threshold curl-back onto the
/// seat is RESTING CONTACT (no candidate; the bounded ≤ 1e-5 m/s creep is
/// owned by the reseat/rest-seat rules), which terminates the geometric
/// bounce chain the restitution ladder would otherwise Zeno through.
fn earliest_seat_reentry_linear_root(
    p: &PosPoly,
    seg: &LinearCushionSegment,
    roots: &Roots,
    t_min: f64,
) -> Option<f64> {
    let (lx, ly, _) = seg.line_coeffs();
    let mut best: Option<f64> = None;
    for (&re, &im) in roots
        .re
        .iter()
        .zip(roots.im.iter())
        .take(roots.count as usize)
    {
        if !is_real_root(re, im) || re <= t_min {
            continue;
        }
        if best.is_some_and(|b| re >= b) {
            continue;
        }
        let approach =
            -(lx * (p.c1.x + 2.0 * p.c2.x * re) + ly * (p.c1.y + 2.0 * p.c2.y * re));
        if approach > REST_APPROACH && valid_linear_hit(p, seg, re) {
            best = Some(re);
        }
    }
    best
}

/// Smallest real root > `t_min` that passes [`valid_linear_hit`].
fn earliest_valid_linear_root(
    p: &PosPoly,
    seg: &LinearCushionSegment,
    roots: &Roots,
    t_min: f64,
) -> Option<f64> {
    let mut best: Option<f64> = None;
    for (&re, &im) in roots
        .re
        .iter()
        .zip(roots.im.iter())
        .take(roots.count as usize)
    {
        if !is_real_root(re, im) || re <= t_min {
            continue;
        }
        if best.is_some_and(|b| re >= b) {
            continue;
        }
        if valid_linear_hit(p, seg, re) {
            best = Some(re);
        }
    }
    best
}

/// Resting-contact normal approach speed [m/s]: touching pairs approaching
/// slower than this generate no immediate collision candidate (see the guard
/// in [`ball_ball_time`]). Chosen ≫ Eps::VEL (so resolvers always act on
/// admitted events) and ≪ any gameplay-relevant impact speed.
const REST_APPROACH: f64 = 1e-5;

/// Penetration window [m] for the cushion at-contact guards: a ball this far
/// past exact contact distance is still treated as touching (accumulated
/// float-error penetration is ≤ µm-scale), anything deeper is geometrically
/// somewhere else (e.g. legitimately behind a jaw segment's extended plane
/// inside a pocket mouth) and yields no candidate. 1e-6 m is 6 orders above
/// root-solver error and 4 orders below the smallest geometric feature
/// (side jaw radius 0.00795 m).
///
/// `pub(crate)` since feature 021: the event loop's rest-seat rule uses the
/// same constant as the frozen/off-rail binary's boundary (the detection
/// convention's own contact window, contracts/seat-convention.md §4).
pub(crate) const CONTACT_DEPTH: f64 = 1e-6;

/// Slack [m] added to the geometric under-nose penetration bound when
/// classifying a grounded ball's planar contact violation as an under-nose
/// re-entry (covers float drift accumulated between the airborne cushion
/// impact and the grounding event). Deeper violations are geometrically
/// somewhere else (e.g. inside a pocket mouth) and are left alone.
///
/// Homed here since the feature-021 T011 in-band re-entry fix: the event
/// loop threads `under_nose_band = nose_seat_depth(h, r) + RESEAT_SLACK`,
/// and the in-band re-entry root paths below recover the seat depth from
/// that band as `band − RESEAT_SLACK` — one constant, one inverse.
pub(crate) const RESEAT_SLACK: f64 = 1e-4;

/// Earliest contact time of two balls (center distance = ra + rb).
///
/// Quartic |p12(τ)|² = (ra + rb)² with p12 = C + B·τ + A·τ² the difference
/// polynomial ([`ball_ball_quartic`]; pooltool `ball_ball.py:126-130`).
///
/// Overlap-at-τ=0 guard (pooltool `ball_ball.py:159-165` `is_overlapping`
/// bounce-back guard, restricted per the trunk contract): if the centers
/// already overlap AND the pair is approaching (d/dτ |p12|² < 0 at τ = 0),
/// return an immediate event at τ = `t_min`; overlapping-but-separating
/// pairs yield no candidate (so freshly resolved pairs cannot re-trigger).
///
/// At-contact/window guard on the OUTSIDE of contact distance (issue #215;
/// the ball-ball mirror of the cushion guards' `gap ≤ approach·t_min`
/// window): a pair at/just above d = 2R whose entry root falls inside the
/// `t_min` guard window must also fire immediately. This is exactly the
/// state a same-instant BallBall+BallTable compound resolve leaves behind —
/// d = 2R + O(1e-11) with closing relative velocity re-established — where
/// the root filter below discards the sub-`t_min` entry root and hands back
/// the far-side EXIT crossing, letting the pair interpenetrate unwatched
/// until an unrelated event boundary re-notices it (venomjump repro:
/// 9.7 mm deep for ~106 ms). The [`REST_APPROACH`] velocity gate matches
/// the overlap branch (continuous admission threshold across the d = 2R
/// boundary): resting/separating pairs yield no candidate, so a freshly
/// resolved pair cannot re-trigger — and with e_b = 0 the resolve zeroes
/// the normal relative velocity, silencing the gate (no Zeno chatter).
pub fn ball_ball_time(a: &PosPoly, b: &PosPoly, ra: f64, rb: f64, t_min: f64) -> Option<f64> {
    let rsum = ra + rb;
    let gap = a.c0 - b.c0;
    if gap.norm_sq() < rsum * rsum {
        // Floating-point-penetration guard; gap·(v_a − v_b) = ½ d/dτ |p12|².
        // Approach threshold [`REST_APPROACH`]·rsum ≈ a normal relative
        // approach speed of REST_APPROACH: touching pairs approaching slower
        // than that are treated as RESTING contacts and yield no candidate.
        // Firing immediate events for them Zeno-loops the event loop: cloth
        // friction rebuilds a µm/s-scale approach right after every micro-
        // impulse, so a creeping cluster otherwise churns thousands of
        // events (integration T021; SC-005 fuzz shots #141/#5611).
        //
        // Known accepted residual (issue #44): the quartic below is skipped
        // for an overlapped pair, so in-segment RE-approach of a sleeping
        // pair is undetectable and rolling neighbors can push mm/s-scale —
        // not the µm/s end-game creep this guard was sized for — burying a
        // pair up to ~4e-4 m by rest. The trunk's terminal Rest projection
        // (`event_loop::project_rest_overlaps`, Amendment 017) heals that
        // at the barrier, keeping the round-trip law without perturbing
        // these frozen detect semantics.
        return if gap.dot(a.c1 - b.c1) < -REST_APPROACH * rsum {
            Some(t_min)
        } else {
            None
        };
    }
    // Outside-of-contact window guard (issue #215, see fn docs): entry root
    // within the `t_min` guard window ⟺ sep ≤ approach·t_min (relative
    // motion is exactly linear for airborne-airborne pairs — gravity
    // cancels — and curvature over 1 ns is O(1e-18 m) for on-table pairs).
    // `dist ≥ rsum > 0` here, so the division is always defined.
    let dist = gap.norm();
    let sep = dist - rsum;
    let approach = -gap.dot(a.c1 - b.c1) / dist;
    if approach > REST_APPROACH && sep <= approach * t_min {
        return Some(t_min);
    }
    let k = ball_ball_quartic(a, b, rsum);
    let roots = math::solve_quartic(k[0], k[1], k[2], k[3], k[4]);
    let t = math::smallest_positive_real_root(&roots, t_min);
    if let Some(tau) = t {
        debug_assert!(tau.is_finite());
    }
    t
}

/// Earliest contact time of a ball with a linear cushion segment: quadratic
/// vs the segment's vertical plane at distance `r` on the playable side; the
/// hit point must fall within the segment (s ∈ [0, 1], validated by
/// evaluating the poly at the root) and the ball must be moving into the
/// cushion. pooltool `ball_cushion.py:23-101`.
///
/// At-contact guard (mirrors the [`ball_ball_time`] overlap guard): `c` is
/// the signed contact gap at τ = 0 (plane distance − r) and `b` its
/// derivative (normal velocity, negative = into the cushion). A ball at
/// contact / penetrating (down to [`CONTACT_DEPTH`] + `under_nose_band`) —
/// or one whose entry root falls inside the `t_min` guard window — that
/// projects within the segment span and approaches faster than
/// [`REST_APPROACH`] gets an immediate event at `t_min`; without this, the
/// entry root is ≤ `t_min`, gets filtered, and the ball silently tunnels
/// through the rail. Balls at contact moving away (or approaching slower —
/// resting contact) yield no candidate, so freshly resolved cushion impacts
/// cannot re-trigger.
///
/// `under_nose_band` (feature 021, contracts/detection-routing.md §1): 0.0
/// = the legacy planar semantics, bit-identical by construction; else
/// `nose_seat_depth(seg.height, r) + RESEAT_SLACK`, threaded per-segment by
/// the event loop under `RailSeat::NoseContact`. ONLY the at-contact depth
/// acceptance widens: the velocity gate ([`REST_APPROACH`] — what filters
/// the `sin(π)` parallel-strike ghost-noise class, vx ≈ 1e-15 m/s), the
/// span check, and the entry-root path (approach-side contact at plane
/// distance R) are UNCHANGED. A ball seated inside the band has its entry
/// roots in the past, so only this guard can admit it — struck INTO the
/// rail it resolves as an ordinary planar impact from the seat (impulse
/// from velocity, never penetration depth).
pub fn ball_linear_cushion_time(
    p: &PosPoly,
    seg: &LinearCushionSegment,
    r: f64,
    t_min: f64,
    under_nose_band: f64,
) -> Option<f64> {
    let (a, b, c) = linear_plane_quadratic(p, seg, r);
    if b < -REST_APPROACH
        && c <= -b * t_min
        && c >= -(CONTACT_DEPTH + under_nose_band)
        && valid_linear_hit(p, seg, 0.0)
    {
        return Some(t_min);
    }
    let mut t = earliest_valid_linear_root(p, seg, &math::solve_quadratic(a, b, c), t_min);
    // Feature 021 IN-BAND RE-ENTRY root (T011 fuzz defect fix, integration
    // lane; band-gated — provably dead at band = 0.0): a ball legally
    // inside the band (c < 0) that separates from the seat and then curves
    // BACK into the rail (a spin-bent sliding path) never re-crosses plane
    // distance R, so the entry-root family above has nothing to admit, and
    // the at-contact guard only fires when the ball is approaching at
    // candidate-recompute time — between events the ball would silently
    // penetrate past the band and tunnel through the rail (fuzz
    // `rail-seated #856`: rest 0.61 m off-table). The seat IS the physical
    // re-contact surface for a grounded ball, so admit the descending
    // crossing of plane distance `d_seat = r − (band − RESEAT_SLACK)` —
    // same quadratic offset by the seat depth, same span/approach
    // validation, resolved planar-from-the-seat like every band admission.
    // A ball approaching from OUTSIDE crosses plane distance R strictly
    // before the seat, so the ordinary entry root (kept above) always
    // precedes this one where both exist — approach-side physics unchanged.
    // Roots slower than REST_APPROACH are resting contact, not events
    // ([`earliest_seat_reentry_linear_root`]) — the same velocity gate the
    // at-contact guard applies, and what bounds the restitution ladder.
    //
    // BAND-FLOOR BACKSTOP (same fix, second half): resting contact is not
    // static here — the spin curl ACCELERATES the ball inward between
    // events, so sub-gate creep past the seat would still deepen without
    // bound. The descending crossing of the BAND FLOOR (plane distance
    // r − band, i.e. RESEAT_SLACK below the seat) is admitted through the
    // same gated validator: any curl a > 5e-7 m/s² arrives at the floor
    // above REST_APPROACH (v ≥ √(2·a·RESEAT_SLACK)), while gate-level
    // CONSTANT creep is self-limiting (friction stops 1e-5 m/s in ~0.1 ms;
    // penetration ~nm) — so nothing physical crosses the floor unwatched.
    // The resolve reverses the normal velocity and the event loop's
    // grounded reseat clamp (pen = depth + RESEAT_SLACK — exactly the top
    // of the frozen clamp window) retargets the ball to the seat; each
    // curl-press cycle costs one event per RESEAT_SLACK of fall (bounded).
    if under_nose_band > 0.0 && c < 0.0 {
        let seat_pen = under_nose_band - RESEAT_SLACK;
        let t_seat = earliest_seat_reentry_linear_root(
            p,
            seg,
            &math::solve_quadratic(a, b, c + seat_pen),
            t_min,
        );
        let t_floor = earliest_seat_reentry_linear_root(
            p,
            seg,
            &math::solve_quadratic(a, b, c + under_nose_band),
            t_min,
        );
        for cand in [t_seat, t_floor] {
            t = match (t, cand) {
                (Some(x), Some(y)) => Some(x.min(y)),
                (x, y) => x.or(y),
            };
        }
    }
    if let Some(tau) = t {
        debug_assert!(tau.is_finite());
    }
    t
}

/// xy distance from the poly's τ = 0 position to `(cx, cy)` and the signed
/// approach speed toward that point (positive = closing). Used by the
/// circular at-contact guards.
fn xy_gap_and_approach(p: &PosPoly, cx: f64, cy: f64) -> (f64, f64) {
    let (gx, gy) = (p.c0.x - cx, p.c0.y - cy);
    let rho = libm::sqrt(gx * gx + gy * gy);
    // −d/dτ |g|/1 at τ = 0 = −(g·v)/ρ; ρ = 0 → NaN, callers' comparisons
    // are all false for NaN so the degenerate center-on-center case yields
    // no immediate candidate (the pocket guard catches it earlier anyway).
    let approach = -(gx * p.c1.x + gy * p.c1.y) / rho;
    (rho, approach)
}

/// Smallest real root > `t_min` at which the ball moves INWARD toward the
/// arc center (d/dτ |pos − center|² < 0) AND the contact point lies on the
/// arc's angular span ([`CircularCushionSegment::contains_angle`]; full
/// circles accept every angle — the frozen pre-Amendment-016 behavior):
/// accepts the entry crossing of the contact circle and rejects the
/// far-side EXIT crossing, which a ball already at/inside the circle would
/// otherwise be assigned (wrong position and normal). The mirror of
/// [`valid_linear_hit`]'s f′ < 0 + `0 ≤ s ≤ 1` checks.
///
/// Event-time exactness note (Amendment 016): the span is a pure FILTER on
/// the contact quartic's roots — exactly the linear segment's s∈[0, 1]
/// validation transposed to angles. No new root families, no iteration:
/// event times remain polynomial-root exact.
fn earliest_inward_circle_root(
    p: &PosPoly,
    arc: &CircularCushionSegment,
    roots: &Roots,
    t_min: f64,
) -> Option<f64> {
    let (cx, cy) = (arc.center.x, arc.center.y);
    let mut best: Option<f64> = None;
    for (&re, &im) in roots
        .re
        .iter()
        .zip(roots.im.iter())
        .take(roots.count as usize)
    {
        if !is_real_root(re, im) || re <= t_min {
            continue;
        }
        if best.is_some_and(|b| re >= b) {
            continue;
        }
        let pos = poly_at(p, re);
        let (gx, gy) = (pos.x - cx, pos.y - cy);
        let (vx, vy) = (p.c1.x + 2.0 * p.c2.x * re, p.c1.y + 2.0 * p.c2.y * re);
        if gx * vx + gy * vy < 0.0 && arc.contains_angle(libm::atan2(gy, gx)) {
            best = Some(re);
        }
    }
    best
}

/// The arc mirror of [`earliest_seat_reentry_linear_root`]: smallest real
/// root > `t_min` moving INWARD faster than [`REST_APPROACH`] (radial
/// approach speed −(g·v)/ρ > REST_APPROACH) with the contact point on the
/// arc's angular span — the seat re-entry filter for jaw arcs (feature 021
/// T011; sub-threshold curl-back is resting contact, no candidate).
fn earliest_seat_reentry_circle_root(
    p: &PosPoly,
    arc: &CircularCushionSegment,
    roots: &Roots,
    t_min: f64,
) -> Option<f64> {
    let (cx, cy) = (arc.center.x, arc.center.y);
    let mut best: Option<f64> = None;
    for (&re, &im) in roots
        .re
        .iter()
        .zip(roots.im.iter())
        .take(roots.count as usize)
    {
        if !is_real_root(re, im) || re <= t_min {
            continue;
        }
        if best.is_some_and(|b| re >= b) {
            continue;
        }
        let pos = poly_at(p, re);
        let (gx, gy) = (pos.x - cx, pos.y - cy);
        let rho = libm::sqrt(gx * gx + gy * gy);
        let (vx, vy) = (p.c1.x + 2.0 * p.c2.x * re, p.c1.y + 2.0 * p.c2.y * re);
        // approach = −(g·v)/ρ > REST_APPROACH  ⟺  g·v < −REST_APPROACH·ρ
        if gx * vx + gy * vy < -REST_APPROACH * rho
            && arc.contains_angle(libm::atan2(gy, gx))
        {
            best = Some(re);
        }
    }
    best
}

/// Earliest contact time of a ball with a jaw arc: quartic, center distance
/// = arc.radius + r. pooltool `ball_cushion.py:104-150`.
///
/// Same at-contact treatment as [`ball_linear_cushion_time`]: a ball
/// at/inside the contact circle (down to [`CONTACT_DEPTH`] +
/// `under_nose_band` — feature 021 §2, 0.0 = legacy bit-identical; the
/// approach threshold, angular-span check, and entry-root quartic are
/// UNCHANGED) — or within the `t_min` guard window of it — closing on the
/// arc faster than [`REST_APPROACH`] fires immediately (span-gated for
/// spanned arcs, the mirror of the linear guard's `valid_linear_hit(…, 0.0)`
/// span check), and candidate roots must be entry (inward-moving) crossings
/// ON the arc's angular span ([`earliest_inward_circle_root`]), never the
/// far-side exit of the contact circle. Band acceptance catches a seated
/// ball sliding along the rail past a pocket point at first band entry with
/// its true (glancing) radial velocity — never after tunneling deep into
/// the contact circle.
///
/// Span-endpoint continuity (Amendment 016): spanned arcs are only built
/// as tangent composites — the rail↔arc1 and arc1↔arc2 junctions share the
/// contact point AND normal (C¹), so there is no finite sliver a ball can
/// enter between neighbors: any trajectory reaching an out-of-span angle
/// of one surface first crosses the neighbor's contact surface within ITS
/// span (endpoint-inclusive, [`crate::table::ArcSpan::contains`]); a
/// junction-exact hit yields simultaneous candidates that the frozen
/// tie-break resolves sequentially (identical normals — the second resolve
/// sees a separating ball and no-ops, no double impulse). The open span
/// end (arc2 → fall) lies inside the pocket's capture disc with margin
/// (`curved_pocket_boundary_closure` pin in table.rs tests), so a ball is
/// pocketed strictly before it could slide off the arc end.
pub fn ball_circular_cushion_time(
    p: &PosPoly,
    arc: &CircularCushionSegment,
    r: f64,
    t_min: f64,
    under_nose_band: f64,
) -> Option<f64> {
    let contact = arc.radius + r;
    let (rho, approach) = xy_gap_and_approach(p, arc.center.x, arc.center.y);
    let gap = rho - contact;
    if approach > REST_APPROACH
        && gap <= approach * t_min
        && gap >= -(CONTACT_DEPTH + under_nose_band)
        && arc.contains_angle(libm::atan2(
            p.c0.y - arc.center.y,
            p.c0.x - arc.center.x,
        ))
    {
        return Some(t_min);
    }
    let k = circular_cushion_quartic(p, arc, r);
    let roots = math::solve_quartic(k[0], k[1], k[2], k[3], k[4]);
    let mut t = earliest_inward_circle_root(p, arc, &roots, t_min);
    // Feature 021 IN-BAND RE-ENTRY root — the arc mirror of the linear
    // path's fix (T011 fuzz defect, integration lane; band-gated, provably
    // dead at band = 0.0): an in-band ball (gap < 0) whose curved grounded
    // path turns back toward the arc never re-crosses the ρ = arc.radius + r
    // contact circle, so the quartic above has no admissible entry root and
    // the ball would tunnel. Admit the inward crossing of the ARC SEAT
    // circle ρ_seat = arc.radius + r − (band − RESEAT_SLACK) — the same
    // quartic at the seat contact distance, same inward/angular-span
    // validation plus the REST_APPROACH velocity gate (sub-threshold
    // curl-back is resting contact — the linear path's anti-Zeno rule),
    // AND the band-floor backstop at ρ = arc.radius + r − band through the
    // same gated validator (see the linear path: accelerated curl always
    // arrives at the floor above the gate, and the grounded reseat clamp
    // retargets each floor hit to the seat). An outside ball crosses the
    // ordinary contact circle strictly first, so approach-side physics is
    // unchanged.
    if under_nose_band > 0.0 && gap < 0.0 {
        let seat_pen = under_nose_band - RESEAT_SLACK;
        let ks = circular_cushion_quartic(p, arc, r - seat_pen);
        let roots_s = math::solve_quartic(ks[0], ks[1], ks[2], ks[3], ks[4]);
        let t_seat = earliest_seat_reentry_circle_root(p, arc, &roots_s, t_min);
        let kf = circular_cushion_quartic(p, arc, r - under_nose_band);
        let roots_f = math::solve_quartic(kf[0], kf[1], kf[2], kf[3], kf[4]);
        let t_floor = earliest_seat_reentry_circle_root(p, arc, &roots_f, t_min);
        for cand in [t_seat, t_floor] {
            t = match (t, cand) {
                (Some(x), Some(y)) => Some(x.min(y)),
                (x, y) => x.or(y),
            };
        }
    }
    if let Some(tau) = t {
        debug_assert!(tau.is_finite());
    }
    t
}

/// Capsule quartic coefficients `[a4, a3, a2, a1, a0]` of
/// |w(τ)|² − (w(τ)·û)² − r² where w = ball path − nose-axis anchor and û is
/// the HORIZONTAL unit axis of the cushion nose at height `seg.height`
/// (research doc §3a row 1: airborne x,y are linear, z quadratic → the
/// squared point-to-axis distance is a genuine quartic with leading
/// coefficient (g/2)² — never degenerate).
fn nose_capsule_quartic(p: &PosPoly, seg: &LinearCushionSegment, r: f64) -> [f64; 5] {
    let (dx, dy) = (seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
    let len = libm::sqrt(dx * dx + dy * dy);
    let (ux, uy) = (dx / len, dy / len);
    // w components: x,y linear (airborne c2.xy = 0), z quadratic.
    let (wx0, wx1) = (p.c0.x - seg.p1.x, p.c1.x);
    let (wy0, wy1) = (p.c0.y - seg.p1.y, p.c1.y);
    let (wz0, wz1, wz2) = (p.c0.z - seg.height, p.c1.z, p.c2.z);
    // q = w·û is linear (û is horizontal).
    let (q0, q1) = (ux * wx0 + uy * wy0, ux * wx1 + uy * wy1);
    [
        wz2 * wz2,
        2.0 * wz1 * wz2,
        wx1 * wx1 + wy1 * wy1 + wz1 * wz1 + 2.0 * wz0 * wz2 - q1 * q1,
        2.0 * (wx0 * wx1 + wy0 * wy1 + wz0 * wz1 - q0 * q1),
        wx0 * wx0 + wy0 * wy0 + wz0 * wz0 - q0 * q0 - r * r,
    ]
}

/// Evaluate a degree-4 polynomial (coefficients `[a4..a0]`) and its
/// derivative at `tau`.
fn quartic_at(k: &[f64; 5], tau: f64) -> (f64, f64) {
    let f = (((k[0] * tau + k[1]) * tau + k[2]) * tau + k[3]) * tau + k[4];
    let df = ((4.0 * k[0] * tau + 3.0 * k[1]) * tau + 2.0 * k[2]) * tau + k[3];
    (f, df)
}

/// True iff the ball center at `tau` projects within the segment span
/// (s ∈ [0, 1]; the airborne mirror of [`valid_linear_hit`]'s span check —
/// the approach condition is checked on the capsule polynomial instead).
fn within_span(p: &PosPoly, seg: &LinearCushionSegment, tau: f64) -> bool {
    let pos = poly_at(p, tau);
    let dx = seg.p2.x - seg.p1.x;
    let dy = seg.p2.y - seg.p1.y;
    let s = ((pos.x - seg.p1.x) * dx + (pos.y - seg.p1.y) * dy) / (dx * dx + dy * dy);
    (0.0..=1.0).contains(&s)
}

/// Earliest contact time of an AIRBORNE ball with a linear cushion segment
/// (feature 003 stage 2; research doc §3a): the nose is modeled as the
/// zero-radius horizontal line at height `seg.height`, so contact is the
/// entry crossing of the point-to-axis capsule quartic
/// ([`nose_capsule_quartic`]). A ball whose flight stays clear of the
/// capsule generates NO candidate — the legal fly-over (the stage-1
/// infinite fence is retired; a flier that clears the nose either lands
/// back on the bed or leaves the table, see `landing_off_table`).
///
/// Guards, mirroring [`ball_linear_cushion_time`]:
/// - at-contact: a ball at/inside capsule contact (down to [`CONTACT_DEPTH`]
///   of penetration, measured through f ≈ −2r·depth) — or within the
///   `t_min` window of it — approaching faster than [`REST_APPROACH`] and
///   within the segment span fires immediately at `t_min`;
/// - candidate roots must be APPROACHING crossings (f′(τ) < 0) within the
///   span — the far-side exit of the capsule is never the answer;
/// - v1.9 pragmatic plane gate (anti-tunnel hardening, research doc §4.3
///   "库边平面穿越门控"): if the quartic yields nothing but the center
///   crosses the segment's contact plane BELOW nose height while
///   approaching, the plane-crossing time is used — a numerically degenerate
///   near-tangent trajectory must block, never tunnel.
pub fn ball_linear_cushion_time_airborne(
    p: &PosPoly,
    seg: &LinearCushionSegment,
    r: f64,
    t_min: f64,
) -> Option<f64> {
    let k = nose_capsule_quartic(p, seg, r);
    let (f0, df0) = quartic_at(&k, 0.0);
    // At-contact / within-window guard (areas: |f| ≈ 2r·gap near contact).
    if df0 < -2.0 * r * REST_APPROACH
        && f0 <= -df0 * t_min
        && f0 >= -2.0 * r * CONTACT_DEPTH
        && within_span(p, seg, 0.0)
    {
        return Some(t_min);
    }
    let roots = math::solve_quartic(k[0], k[1], k[2], k[3], k[4]);
    let mut best: Option<f64> = None;
    for (&re, &im) in roots
        .re
        .iter()
        .zip(roots.im.iter())
        .take(roots.count as usize)
    {
        if !is_real_root(re, im) || re <= t_min || best.is_some_and(|b| re >= b) {
            continue;
        }
        let (_, df) = quartic_at(&k, re);
        if df < 0.0 && within_span(p, seg, re) {
            best = Some(re);
        }
    }
    if best.is_some() {
        return best;
    }
    // Pragmatic plane gate fallback (never tunnel through a below-nose
    // crossing). Airborne xy is linear, so the plane condition is linear.
    // The candidate must ALSO be approaching the nose axis at the crossing
    // (f′ < 0): a ball moving toward the plane but AWAY from the axis (e.g.
    // diving under the nose after a partial hop onto it) is a state the
    // resolver correctly treats as separating — emitting a candidate for it
    // Zeno-loops the event loop at t_min (fuzz airborne #1371). A genuine
    // tunneling crossing always closes on the axis, so anti-tunnel
    // hardening is preserved.
    let (a_pl, b_pl, c_pl) = linear_plane_quadratic(p, seg, r);
    debug_assert!(a_pl == 0.0, "airborne poly must have c2.xy = 0");
    if b_pl >= -REST_APPROACH {
        return None; // not approaching the plane
    }
    let tau = (-c_pl / b_pl).max(t_min);
    let z = p.c0.z + p.c1.z * tau + p.c2.z * (tau * tau);
    let (_, df) = quartic_at(&k, tau);
    (df < 0.0 && z < seg.height && within_span(p, seg, tau)).then_some(tau)
}

/// Earliest contact time of an AIRBORNE ball with a jaw arc (feature 003
/// stage 2; research doc §3a row 7): the jaw is a VERTICAL cylinder, airborne
/// xy motion is linear, so the crossing of the contact circle is a QUADRATIC
/// — plus a z-gate: the side-wall contact point is at the ball-center height,
/// so a crossing with the center above the jaw top (`arc.height`) is a legal
/// fly-over (no candidate; rim/torus contact is explicitly not modeled —
/// upstream confirms the torus is an unsolvable degree-8, §3a row 8).
///
/// Same at-contact guard family as [`ball_circular_cushion_time`], z-gated.
///
/// Seated-hop at-contact guard (feature 021, contracts/detection-routing.md
/// §4; fires BEFORE the cylinder logic; disabled when `under_nose_band` =
/// 0.0 — every existing call class bit-identical): the nose-circle torus
/// stays unmodeled for FLIGHT contact (degree-8, frozen upstream decision),
/// but the seated-hop class needs no root solve because it starts ON the
/// contact surface. Fire at `t_min` iff ALL of the five frozen conditions
/// hold: (1) in-band xy `ρ ∈ [ρ_seat − CONTACT_DEPTH, arc.radius + r)`
/// (strictly inside the cylinder contact circle — disjoint from the
/// wall-contact class by construction); (2) center below `arc.height`;
/// (3) 3D distance to the nose circle's closest point within the contact
/// window (mirroring the linear guard's `t_min` allowance); (4) approaching
/// via the closed-form `g·g′(0) = (ρ − arc.radius)·ρ′ + (z − h)·vz <
/// −r·REST_APPROACH` (`+−×÷ sqrt` only); (5) `contains_angle` at τ = 0
/// (unchanged check).
pub fn ball_circular_cushion_time_airborne(
    p: &PosPoly,
    arc: &CircularCushionSegment,
    r: f64,
    t_min: f64,
    under_nose_band: f64,
) -> Option<f64> {
    let contact = arc.radius + r;
    let (rho, approach) = xy_gap_and_approach(p, arc.center.x, arc.center.y);
    if under_nose_band > 0.0 {
        let d_seat = r - crate::table::nose_seat_depth(arc.height, r);
        let rho_seat = arc.radius + d_seat;
        let dz = p.c0.z - arc.height;
        // (1) in-band xy + (2) center below the nose axis.
        if rho >= rho_seat - CONTACT_DEPTH && rho < contact && dz < 0.0 {
            let dr = rho - arc.radius; // > 0: strictly outside the arc axis
            let g0 = libm::sqrt(dr * dr + dz * dz);
            // (4) g·g′(0): ρ′ = radial closing speed at τ = 0 (closed form).
            let rho_p =
                ((p.c0.x - arc.center.x) * p.c1.x + (p.c0.y - arc.center.y) * p.c1.y) / rho;
            let ggp = dr * rho_p + dz * p.c1.z;
            // (3) contact window: g0 ∈ [r − CONTACT_DEPTH, r + window] with
            // the same t_min allowance shape as the linear guard
            // ((g0 − r)·g0 ≤ −g·g′·t_min), and (5) the unchanged span check.
            if ggp < -r * REST_APPROACH
                && g0 - r >= -CONTACT_DEPTH
                && (g0 - r) * g0 <= -ggp * t_min
                && arc.contains_angle(libm::atan2(
                    p.c0.y - arc.center.y,
                    p.c0.x - arc.center.x,
                ))
            {
                return Some(t_min);
            }
        }
    }
    let gap = rho - contact;
    if approach > REST_APPROACH
        && gap <= approach * t_min
        && gap >= -CONTACT_DEPTH
        && p.c0.z <= arc.height
        && arc.contains_angle(libm::atan2(
            p.c0.y - arc.center.y,
            p.c0.x - arc.center.x,
        ))
    {
        return Some(t_min);
    }
    // Quadratic |xy(τ) − center|² = contact² (linear xy motion).
    let (gx, gy) = (p.c0.x - arc.center.x, p.c0.y - arc.center.y);
    let (bx, by) = (p.c1.x, p.c1.y);
    let a2 = bx * bx + by * by;
    let a1 = 2.0 * (gx * bx + gy * by);
    let a0 = gx * gx + gy * gy - contact * contact;
    let roots = math::solve_quadratic(a2, a1, a0);
    let mut best: Option<f64> = None;
    for (&re, &im) in roots
        .re
        .iter()
        .zip(roots.im.iter())
        .take(roots.count as usize)
    {
        if !is_real_root(re, im) || re <= t_min || best.is_some_and(|b| re >= b) {
            continue;
        }
        // Entry crossing only (moving inward), center at/below the jaw top
        // at the crossing, contact point on the arc's angular span (the
        // same pure root filter as the planar path — Amendment 016).
        let inward = a1 + 2.0 * a2 * re < 0.0;
        let z = p.c0.z + p.c1.z * re + p.c2.z * (re * re);
        let on_span = arc.contains_angle(libm::atan2(gy + by * re, gx + bx * re));
        if inward && z <= arc.height && on_span {
            best = Some(re);
        }
    }
    best
}

/// Classify an airborne LANDING point (feature 003 stage 2): `true` means
/// the descending crossing of bed height at local time `tau` falls OUTSIDE
/// the playing surface and not over a pocket mouth — the ball leaves the
/// table (`EventKind::BallOffTable` terminal) instead of bouncing
/// (`BallTable`). Landings inside a pocket circle (+r slack) stay `false`:
/// the airborne pocket heuristic captures those strictly earlier
/// (`landing − Eps::TIME`), and a mouth-shelf graze that it rejects should
/// keep the ball in play for the planar jaw/pocket geometry to sort out.
pub fn landing_off_table(p: &PosPoly, tau: f64, table: &crate::table::Table, r: f64) -> bool {
    let pos = poly_at(p, tau);
    if pos.x.abs() <= table.width / 2.0 && pos.y.abs() <= table.length / 2.0 {
        return false;
    }
    !table.pockets.iter().any(|pk| {
        let (dx, dy) = (pos.x - pk.center.x, pos.y - pk.center.y);
        let lim = pk.radius + r;
        dx * dx + dy * dy <= lim * lim
    })
}

/// Landing time of an airborne ball: z(τ) = c0.z + c1.z·τ + c2.z·τ² returns
/// to the bed height `r` on the DESCENDING leg (Amendment 002).
///
/// Port of pooltool `physics/utils.py::get_airborne_time` — solve
/// `−g/2·τ² + vz·τ + (z − R) = 0` and take the LATER root: with the τ²
/// coefficient negative the later root is always the descending crossing
/// (for a ball launched at z = R the roots are {0, 2·vz/g} and the max picks
/// the return). Two guards on top of the pooltool semantics (mirroring the
/// cushion at-contact guards): a ball at/below bed height moving DOWN faster
/// than [`REST_APPROACH`] — the legal-jump strike case (z = R, vz < 0, root
/// at exactly 0 ≤ `t_min`) — fires immediately at `t_min`; and a root inside
/// the `t_min` window with the ball still descending also fires at `t_min`
/// (never miss a landing to the guard). Returns `None` for non-descending
/// degenerate cases (defensive; resolvers require vz < 0 at impact).
pub fn ball_table_time(p: &PosPoly, r: f64, t_min: f64) -> Option<f64> {
    let (a, b, c) = (p.c2.z, p.c1.z, p.c0.z - r);
    debug_assert!(a < 0.0, "airborne poly must have c2.z = -g/2, got {a}");
    // At/below bed height and moving down: immediate bounce. Deliberately
    // NOT gated on REST_APPROACH (unlike the cushion guards): the bed is the
    // one surface a ball can never rest against from above while labeled
    // Airborne, and an arbitrarily slow sinker must still bounce — with the
    // descending-root filter below, missing this candidate would let the
    // ball fall THROUGH the bed forever (its later root drifts into the
    // past as it sinks). The resolver's min-bounce guard absorbs the
    // resulting micro-bounce into an on-bed state in one event, so no Zeno
    // chain can form.
    if c <= CONTACT_DEPTH && b < 0.0 {
        return Some(t_min);
    }
    let disc = b * b - 4.0 * a * c;
    if disc < 0.0 {
        // Ball never reaches the bed (only possible for c < 0 degeneracies).
        return None;
    }
    let sq = libm::sqrt(disc);
    // Later root of a negative-leading quadratic: (−b − √disc)/(2a).
    let tau = (-b - sq) / (2.0 * a);
    if tau > t_min {
        return Some(tau);
    }
    // Root within the guard window and still descending → immediate.
    if tau > 0.0 && b + 2.0 * a * tau < -REST_APPROACH {
        return Some(t_min);
    }
    None
}

/// Earliest time the ball center crosses the pocket's point-of-no-return
/// radius (quartic, no +r). pooltool `ball_pocket.py:16-60`.
///
/// Point-of-no-return guard: a center already AT or INSIDE the pocket circle
/// is pocketed immediately regardless of direction (there is no return);
/// without this the quartic hands back the far-side EXIT crossing. A center
/// within the `t_min` guard window of crossing (closing faster than
/// [`REST_APPROACH`]) also fires immediately, mirroring the cushion guards.
pub fn ball_pocket_time(p: &PosPoly, pocket: &Pocket, t_min: f64) -> Option<f64> {
    let (rho, approach) = xy_gap_and_approach(p, pocket.center.x, pocket.center.y);
    let gap = rho - pocket.radius;
    if gap <= 0.0 || (approach > REST_APPROACH && gap <= approach * t_min) {
        return Some(t_min);
    }
    let k = pocket_quartic(p, pocket);
    let roots = math::solve_quartic(k[0], k[1], k[2], k[3], k[4]);
    let t = math::smallest_positive_real_root(&roots, t_min);
    if let Some(tau) = t {
        debug_assert!(tau.is_finite());
    }
    t
}

/// Pocket capture time for an AIRBORNE ball (Amendment 002): documented
/// phenomenological approximation, port of pooltool
/// `ball_pocket.py::ball_pocket_collision_time_if_airborne`.
///
/// Strategy 1: if the landing point (at [`ball_table_time`]'s descending
/// crossing) falls inside the pocket circle, the ball is pocketed just
/// before it would touch the bed (`landing − Eps::TIME`, guaranteeing
/// temporal precedence over the table bounce — pooltool `airborne_time −
/// EPS`). Strategy 2: otherwise intersect the (linear-in-xy) flight path
/// with the pocket cylinder; with influx height `h0` and outflux height
/// `hf`, the ball is captured iff `h0 ≥ R` (it did not land first) and
/// `min(h0, hf) ≤ (7/5)·R` (the 7/5R rim heuristic: low fliers ricochet off
/// the back of the pocket and drop in; a flier high at BOTH rim crossings
/// flies over). pooltool tests `hf` alone; GH-594 (owner decision
/// 2026-09-13: POCKET) extends the test to the influx crossing — a ball
/// that enters the cylinder under the rail top while still rising is
/// committed to the throat. The 7/5R ceiling is a constant of this capture
/// model (pooltool `ball_pocket.py`), not the table's nose height. Capture
/// time = the midpoint of influx/outflux.
///
/// Behaviour class, stated completely (GH-594 refuter P2, issue #791): an
/// ENTER-LOW hop is pocketed regardless of its exit height. That includes
/// steep hops that would physically clear the corner — from the #594 launch
/// (0.1 mm outside the CN8 corner disc, so the influx is immediate and low)
/// every vz from 0.4 to 3.5 m/s captures at the same instant; at vz 2.5 m/s
/// the ball's bottom is 112 mm above the bed at the far rim (apex 347 mm).
/// The physical bound between "committed to the throat" and "clears the
/// corner" is NOT derivable here: the kernel carries no rail-top / throat-
/// wall geometry for the entry (the v21 CN8 corner is the F2 nose fillets +
/// the Ø105 disc with no collider past the fillets' X_N ends, as the v16 R45
/// rolls were; the R82 drawing chain would supply the wall). Bounding the
/// capture by the entry's throat / rail-top geometry is issue #791 (build
/// 19, pocket program). See
/// `docs/research/gap-jump-shot-3d.md` §1.1 (缺口清单 "袋口腾空启发式") for
/// provenance and limitations.
pub fn ball_pocket_time_airborne(p: &PosPoly, pocket: &Pocket, r: f64, t_min: f64) -> Option<f64> {
    let landing = ball_table_time(p, r, t_min)?;
    let z_at = |tau: f64| p.c0.z + p.c1.z * tau + p.c2.z * tau * tau;

    // Strategy 1: does the ball land inside the pocket circle?
    let (lx, ly) = (
        p.c0.x + p.c1.x * landing - pocket.center.x,
        p.c0.y + p.c1.y * landing - pocket.center.y,
    );
    if lx * lx + ly * ly < pocket.radius * pocket.radius {
        return Some((landing - Eps::TIME).max(t_min));
    }

    // Strategy 2: influx/outflux crossings of the pocket cylinder (airborne
    // xy motion is linear → quadratic; same ½-scaled coefficients as
    // [`xy_cylinder_quartic`] with the τ² terms zero).
    let (bx, by) = (p.c1.x, p.c1.y);
    let (gx, gy) = (p.c0.x - pocket.center.x, p.c0.y - pocket.center.y);
    let a2 = 0.5 * (bx * bx + by * by);
    let a1 = bx * gx + by * gy;
    let a0 = 0.5 * (gx * gx + gy * gy - pocket.radius * pocket.radius);
    if a2 == 0.0 {
        return None; // no horizontal motion: never crosses the cylinder
    }
    let disc = a1 * a1 - 4.0 * a2 * a0;
    if disc < 0.0 {
        return None; // path misses the cylinder
    }
    let sq = libm::sqrt(disc);
    let (t1, t2) = (
        (-a1 - sq) / (2.0 * a2), // influx (a2 > 0 → smaller root first)
        (-a1 + sq) / (2.0 * a2), // outflux
    );
    if t1 < 0.0 {
        return None; // pooltool: influx in the past → no capture
    }
    if z_at(t1) < r {
        return None; // lands before reaching the pocket cylinder
    }
    // GH-594: capture when the ball's centre dips below the pocket ceiling
    // (7R/5) at EITHER rim crossing, not only at the outflux. The airborne
    // z arc is concave-down (c2.z = −g/2), so its minimum over the cylinder
    // window [t1, t2] is at one of the two endpoints; the min is the low
    // point of the crossing. A ball that ENTERS the cylinder below the rail
    // top is committed to the throat even if it is still RISING and leaves
    // the cylinder high — under the rail, over the hole, it cannot climb back
    // out. The old outflux-only test (`z_at(t2) > 7R/5`) rejected exactly
    // this "enter-low, exit-high" case as a fly-over; on the v16 chinese8
    // molded corner (R45 rolls + Ø105 disc, no collider past the roll end;
    // the v21 F2 fillets keep that layout, ending at X_N) a
    // low hop under the rail then found NO surface and tunneled off-table
    // through the rendered throat wall (the #594 reproducer). Genuine
    // fly-overs (high at BOTH crossings) still reject.
    if z_at(t1).min(z_at(t2)) > 7.0 / 5.0 * r {
        return None; // flies over the pocket (high at both rim crossings)
    }
    let tau = 0.5 * (t1 + t2);
    (tau > t_min).then_some(tau)
}

#[cfg(test)]
mod tests {
    //! Self-contained M3 tests (contract rule: no dependence on other
    //! modules' real physics). The M1 solvers are placeholders in this
    //! worktree, so root-solving tests use a local reference solver
    //! ([`ref_smallest_root`]: sign-change scan + bisection on the very
    //! coefficient arrays the production code hands to `math::solve_quartic`)
    //! and a local analytic quadratic ([`ref_quadratic_roots`]) to drive the
    //! production validation path. Everything stays valid once M1 merges.

    use super::*;

    const R: f64 = 0.028575;
    const TMIN: f64 = 1e-9;

    fn poly(c0: (f64, f64), c1: (f64, f64), c2: (f64, f64)) -> PosPoly {
        PosPoly {
            c0: Vec3::new(c0.0, c0.1, R),
            c1: Vec3::new(c1.0, c1.1, 0.0),
            c2: Vec3::new(c2.0, c2.1, 0.0),
        }
    }

    /// Segment on the line y = 1, playable side y < 1 (endpoint order per
    /// the trunk left-of-p1→p2 convention).
    fn seg_y1() -> LinearCushionSegment {
        LinearCushionSegment {
            p1: Vec3::new(0.5, 1.0, 0.0),
            p2: Vec3::new(-0.5, 1.0, 0.0),
            height: 0.036,
        }
    }

    fn eval5(k: &[f64; 5], t: f64) -> f64 {
        (((k[0] * t + k[1]) * t + k[2]) * t + k[3]) * t + k[4]
    }

    /// Reference root finder: scan [t_min, horizon] for a sign change, then
    /// bisect to machine precision.
    fn ref_smallest_root(k: &[f64; 5], t_min: f64, horizon: f64) -> Option<f64> {
        let n = 200_000;
        let mut t0 = t_min;
        let mut f0 = eval5(k, t0);
        for i in 1..=n {
            let t1 = t_min + (horizon - t_min) * f64::from(i) / f64::from(n);
            let f1 = eval5(k, t1);
            if (f0 < 0.0) != (f1 < 0.0) {
                let (mut lo, mut hi) = (t0, t1);
                for _ in 0..128 {
                    let mid = 0.5 * (lo + hi);
                    if (eval5(k, mid) < 0.0) == (f0 < 0.0) {
                        lo = mid;
                    } else {
                        hi = mid;
                    }
                }
                return Some(0.5 * (lo + hi));
            }
            t0 = t1;
            f0 = f1;
        }
        None
    }

    /// Analytic quadratic solver (test-local stand-in for M1).
    fn ref_quadratic_roots(a: f64, b: f64, c: f64) -> Roots {
        if a == 0.0 {
            if b == 0.0 {
                return Roots::NONE;
            }
            return Roots {
                count: 1,
                re: [-c / b, 0.0, 0.0, 0.0],
                im: [0.0; 4],
            };
        }
        let disc = b * b - 4.0 * a * c;
        let mut roots = Roots {
            count: 2,
            re: [0.0; 4],
            im: [0.0; 4],
        };
        if disc >= 0.0 {
            let s = libm::sqrt(disc);
            roots.re[0] = (-b + s) / (2.0 * a);
            roots.re[1] = (-b - s) / (2.0 * a);
        } else {
            let s = libm::sqrt(-disc);
            roots.re[0] = -b / (2.0 * a);
            roots.re[1] = roots.re[0];
            roots.im[0] = s / (2.0 * a);
            roots.im[1] = -roots.im[0];
        }
        roots
    }

    // ---- ball_ball ----

    #[test]
    fn ball_ball_head_on_linear_motion_exact() {
        let d = 0.5;
        let a = poly((0.0, 0.0), (1.0, 0.0), (0.0, 0.0));
        let b = poly((d, 0.0), (0.0, 0.0), (0.0, 0.0));
        let k = ball_ball_quartic(&a, &b, 2.0 * R);
        // Degenerates to a quadratic: τ² − d·... coefficients by hand.
        assert_eq!(k[0], 0.0);
        assert_eq!(k[1], 0.0);
        assert_eq!(k[2], 1.0);
        assert_eq!(k[3], -2.0 * d);
        assert!((k[4] - (d * d - 4.0 * R * R)).abs() < 1e-15);
        let expected = d - 2.0 * R; // τ = (d − 2R)/v_rel, v_rel = 1
        let tau = ref_smallest_root(&k, TMIN, 1.0).unwrap();
        assert!((tau - expected).abs() < 1e-9, "{tau} vs {expected}");
        // stationary-vs-moving is symmetric in the argument order
        assert_eq!(k, ball_ball_quartic(&b, &a, 2.0 * R));
    }

    #[test]
    fn ball_ball_head_on_decelerating_quartic() {
        let (d, v, dec2) = (0.4, 1.0, 0.4); // c2.x = −dec2 (τ² coefficient)
        let a = poly((0.0, 0.0), (v, 0.0), (-dec2, 0.0));
        let b = poly((d, 0.0), (0.0, 0.0), (0.0, 0.0));
        let k = ball_ball_quartic(&a, &b, 2.0 * R);
        assert!(k[0] > 0.0, "true quartic path");
        // 1D contact: v·τ − dec2·τ² = d − 2R, take the smaller root.
        let gap = d - 2.0 * R;
        let expected = (v - libm::sqrt(v * v - 4.0 * dec2 * gap)) / (2.0 * dec2);
        let tau = ref_smallest_root(&k, TMIN, 1.0).unwrap();
        assert!((tau - expected).abs() < 1e-9, "{tau} vs {expected}");
    }

    #[test]
    fn ball_ball_grazing_hit_and_miss() {
        let dist = 2.0 * R;
        let a = poly((-1.0, 0.0), (1.0, 0.0), (0.0, 0.0));

        let off_hit = dist * (1.0 - 1e-6);
        let hit = poly((0.0, off_hit), (0.0, 0.0), (0.0, 0.0));
        let k = ball_ball_quartic(&a, &hit, dist);
        let expected = 1.0 - libm::sqrt(dist * dist - off_hit * off_hit);
        let tau = ref_smallest_root(&k, TMIN, 2.0).unwrap();
        assert!((tau - expected).abs() < 1e-9, "{tau} vs {expected}");

        let off_miss = dist * (1.0 + 1e-6);
        let miss = poly((0.0, off_miss), (0.0, 0.0), (0.0, 0.0));
        let k = ball_ball_quartic(&a, &miss, dist);
        assert_eq!(ref_smallest_root(&k, TMIN, 2.0), None);
    }

    #[test]
    fn ball_ball_overlap_guard() {
        // Centers 0.03 m apart < 2R = 0.05715 m: overlapping.
        let b = poly((0.03, 0.0), (0.0, 0.0), (0.0, 0.0));
        // Approaching (gap·v_rel < 0) → immediate event at exactly t_min.
        let approaching = poly((0.0, 0.0), (1.0, 0.0), (0.0, 0.0));
        assert_eq!(ball_ball_time(&approaching, &b, R, R, TMIN), Some(TMIN));
        // Separating → no candidate (never re-trigger a resolved pair).
        let separating = poly((0.0, 0.0), (-1.0, 0.0), (0.0, 0.0));
        assert_eq!(ball_ball_time(&separating, &b, R, R, TMIN), None);
    }

    /// Issue #215 at-contact/window guard: a pair OUTSIDE contact by less
    /// than `approach·t_min` (the state a same-instant BallBall+BallTable
    /// compound resolve leaves behind: d = 2R + O(1e-11), closing velocity
    /// re-established) must fire immediately — the sub-`t_min` entry root
    /// would otherwise be filtered and the exit crossing returned.
    #[test]
    fn ball_ball_at_contact_window_guard() {
        // d = 2R + 2e-11, closing at 0.24 m/s (the venomjump numbers):
        // entry root ≈ 8.3e-11 s < TMIN = 1e-9 s → window guard must fire.
        let b = poly((2.0 * R + 2e-11, 0.0), (0.0, 0.0), (0.0, 0.0));
        let closing = poly((0.0, 0.0), (0.24, 0.0), (0.0, 0.0));
        assert_eq!(ball_ball_time(&closing, &b, R, R, TMIN), Some(TMIN));

        // Same gap, separating → no candidate (freshly resolved pairs and
        // e_b = 0 zero-normal-velocity pairs cannot re-trigger).
        let separating = poly((0.0, 0.0), (-0.24, 0.0), (0.0, 0.0));
        assert_eq!(ball_ball_time(&separating, &b, R, R, TMIN), None);

        // Exactly at contact, closing below REST_APPROACH → resting contact,
        // never an immediate event (frozen-rack pairs stay asleep; anything
        // the quartic path returns must be a genuine future root).
        let touching = poly((2.0 * R, 0.0), (0.0, 0.0), (0.0, 0.0));
        let resting = poly((0.0, 0.0), (0.5 * REST_APPROACH, 0.0), (0.0, 0.0));
        assert_ne!(ball_ball_time(&resting, &touching, R, R, TMIN), Some(TMIN));

        // Entry root beyond the window (sep > approach·t_min) keeps the
        // exact-root path: no immediate event, root at sep/v.
        let outside = poly((2.0 * R + 1e-6, 0.0), (0.0, 0.0), (0.0, 0.0));
        let tau = ball_ball_time(&closing, &outside, R, R, TMIN).unwrap();
        assert!((tau - 1e-6 / 0.24).abs() < 1e-12, "{tau}");
    }

    // ---- ball_linear_cushion ----

    #[test]
    fn linear_cushion_straight_on_exact() {
        let seg = seg_y1();
        let p = poly((0.0, 0.0), (0.0, 1.0), (0.0, 0.0));
        let (a, b, c) = linear_plane_quadratic(&p, &seg, R);
        assert_eq!(a, 0.0);
        assert_eq!(b, -1.0); // f′ = −v: moving into the cushion
        assert!((c - (1.0 - R)).abs() < 1e-15);
        let roots = ref_quadratic_roots(a, b, c);
        let tau = earliest_valid_linear_root(&p, &seg, &roots, TMIN).unwrap();
        assert!((tau - (1.0 - R)).abs() < 1e-12);
    }

    #[test]
    fn linear_cushion_slanted_segment_exact() {
        // 45° segment x + y = 1, playable side toward the origin.
        let seg = LinearCushionSegment {
            p1: Vec3::new(1.0, 0.0, 0.0),
            p2: Vec3::new(0.0, 1.0, 0.0),
            height: 0.036,
        };
        let p = poly((0.0, 0.0), (1.0, 1.0), (0.0, 0.0));
        let (a, b, c) = linear_plane_quadratic(&p, &seg, R);
        let roots = ref_quadratic_roots(a, b, c);
        let tau = earliest_valid_linear_root(&p, &seg, &roots, TMIN).unwrap();
        // Plane distance 1/√2, closing speed √2: τ = ½ − R/√2.
        let expected = 0.5 - R * std::f64::consts::FRAC_1_SQRT_2;
        assert!((tau - expected).abs() < 1e-12, "{tau} vs {expected}");
    }

    #[test]
    fn linear_cushion_segment_bounds_rejection() {
        let seg = seg_y1();
        // Path crosses the infinite line at x = 2, outside [p1, p2] → None.
        let p = poly((2.0, 0.0), (0.0, 1.0), (0.0, 0.0));
        let (a, b, c) = linear_plane_quadratic(&p, &seg, R);
        let roots = ref_quadratic_roots(a, b, c);
        assert_eq!(earliest_valid_linear_root(&p, &seg, &roots, TMIN), None);
        // Same motion inside the span is accepted (control).
        let p_in = poly((0.25, 0.0), (0.0, 1.0), (0.0, 0.0));
        let (a, b, c) = linear_plane_quadratic(&p_in, &seg, R);
        let roots = ref_quadratic_roots(a, b, c);
        assert!(earliest_valid_linear_root(&p_in, &seg, &roots, TMIN).is_some());
    }

    #[test]
    fn linear_cushion_nonplayable_side_rejected() {
        let seg = seg_y1();
        // Ball behind the cushion (y = 2, f < 0) moving toward the playable
        // side: crosses f = +R outbound (f′ > 0) → no event.
        let p = poly((0.0, 2.0), (0.0, -1.0), (0.0, 0.0));
        let (a, b, c) = linear_plane_quadratic(&p, &seg, R);
        let roots = ref_quadratic_roots(a, b, c);
        assert_eq!(earliest_valid_linear_root(&p, &seg, &roots, TMIN), None);
    }

    #[test]
    fn linear_cushion_t_min_and_exit_root_rejected() {
        let seg = seg_y1();
        // Ball exactly at contact distance moving in, decelerating:
        // quadratic roots are τ = 0 (≤ t_min) and τ = 2.5 (outbound, f′ > 0).
        let p = poly((0.0, 1.0 - R), (0.0, 1.0), (0.0, -0.4));
        let (a, b, c) = linear_plane_quadratic(&p, &seg, R);
        assert!(c.abs() < 1e-15);
        let roots = ref_quadratic_roots(a, b, c);
        assert_eq!(earliest_valid_linear_root(&p, &seg, &roots, TMIN), None);
        // With the guard lowered the τ = 0 contact IS geometrically valid:
        // proves the t_min filter (not geometry) rejected it above.
        assert_eq!(
            earliest_valid_linear_root(&p, &seg, &roots, -1.0),
            Some(0.0)
        );
    }

    #[test]
    fn linear_cushion_complex_roots_rejected() {
        let seg = seg_y1();
        let p = poly((0.0, 0.0), (0.0, 1.0), (0.0, 0.0));
        // Genuinely complex pair → rejected by the hybrid filter.
        let complex = Roots {
            count: 2,
            re: [0.5, 0.5, 0.0, 0.0],
            im: [0.5, -0.5, 0.0, 0.0],
        };
        assert_eq!(earliest_valid_linear_root(&p, &seg, &complex, TMIN), None);
        // Same real parts with numerically-tiny imaginary parts → accepted.
        let nearly_real = Roots {
            count: 2,
            re: [0.5, 0.5, 0.0, 0.0],
            im: [1e-12, -1e-12, 0.0, 0.0],
        };
        assert_eq!(
            earliest_valid_linear_root(&p, &seg, &nearly_real, TMIN),
            Some(0.5)
        );
    }

    // ---- linear cushion at-contact guard (review finding: tunneling) ----

    #[test]
    fn linear_cushion_frozen_on_rail_struck_in_fires_immediately() {
        let seg = seg_y1();
        // Ball resting exactly at contact distance, struck straight into the
        // rail: entry root is τ = 0 ≤ t_min, so without the guard the ball
        // tunnels. Must fire an immediate event at exactly t_min.
        let p = poly((0.0, 1.0 - R), (0.0, 2.0), (0.0, 0.0));
        assert_eq!(ball_linear_cushion_time(&p, &seg, R, TMIN, 0.0), Some(TMIN));
    }

    #[test]
    fn linear_cushion_slight_penetration_fires_immediately() {
        let seg = seg_y1();
        // 10 nm past contact (float-error scale penetration), moving in.
        let p = poly((0.0, 1.0 - R + 1e-8), (0.0, 1.0), (0.0, 0.0));
        assert_eq!(ball_linear_cushion_time(&p, &seg, R, TMIN, 0.0), Some(TMIN));
    }

    #[test]
    fn linear_cushion_contact_within_tmin_window_fires_immediately() {
        let seg = seg_y1();
        // 0.1 nm short of contact at 1 m/s: entry root 1e-10 < t_min = 1e-9
        // would be filtered; the guard must catch it.
        let p = poly((0.0, 1.0 - R - 1e-10), (0.0, 1.0), (0.0, 0.0));
        assert_eq!(ball_linear_cushion_time(&p, &seg, R, TMIN, 0.0), Some(TMIN));
    }

    #[test]
    fn linear_cushion_at_contact_moving_away_no_event() {
        let seg = seg_y1();
        let p = poly((0.0, 1.0 - R), (0.0, -1.0), (0.0, 0.0));
        assert_eq!(ball_linear_cushion_time(&p, &seg, R, TMIN, 0.0), None);
        // Resting contact (approach far below REST_APPROACH): no candidate,
        // so freshly resolved impacts cannot re-trigger.
        let p = poly((0.0, 1.0 - R), (0.0, 1e-7), (0.0, 0.0));
        assert_eq!(ball_linear_cushion_time(&p, &seg, R, TMIN, 0.0), None);
    }

    #[test]
    fn linear_cushion_at_contact_outside_span_no_event() {
        let seg = seg_y1();
        // At contact distance of the infinite line but past the segment end.
        let p = poly((2.0, 1.0 - R), (0.0, 1.0), (0.0, 0.0));
        assert_eq!(ball_linear_cushion_time(&p, &seg, R, TMIN, 0.0), None);
    }

    #[test]
    fn linear_cushion_deep_behind_plane_no_event() {
        let seg = seg_y1();
        // 5 mm past the plane (deeper than CONTACT_DEPTH): geometrically not
        // a cushion contact (e.g. inside a pocket mouth behind a jaw plane).
        let p = poly((0.0, 1.0 - R + 0.005), (0.0, 1.0), (0.0, 0.0));
        assert_eq!(ball_linear_cushion_time(&p, &seg, R, TMIN, 0.0), None);
    }

    #[test]
    fn linear_cushion_normal_approach_unaffected_by_guard() {
        let seg = seg_y1();
        let p = poly((0.0, 0.0), (0.0, 1.0), (0.0, 0.0));
        let tau = ball_linear_cushion_time(&p, &seg, R, TMIN, 0.0).unwrap();
        assert!((tau - (1.0 - R)).abs() < 1e-9, "{tau}");
    }

    // ---- under-nose detection band (feature 021, detection-routing §1–§2) ----

    /// Band [m] for the test geometry at nose height `h`:
    /// nose_seat_depth(h, r) + RESEAT_SLACK (the event loop's threading rule).
    fn band(h: f64) -> f64 {
        crate::table::nose_seat_depth(h, R) + 1e-4
    }

    /// Seat plane distance for a nose at height `h`: sqrt(R² − (h − R)²).
    fn d_seat(h: f64) -> f64 {
        R - crate::table::nose_seat_depth(h, R)
    }

    #[test]
    fn rail_seat_band_admits_seated_linear_ball_struck_into_rail() {
        let seg = seg_y1();
        // Ball at the nose-contact seat (≈1 mm past planar contact), struck
        // straight into the rail: entry roots are in the past, so only the
        // widened at-contact guard can admit it — as an ordinary planar
        // impact from the seat at exactly t_min.
        let p = poly((0.0, 1.0 - d_seat(seg.height)), (0.0, 2.0), (0.0, 0.0));
        assert_eq!(
            ball_linear_cushion_time(&p, &seg, R, TMIN, band(seg.height)),
            Some(TMIN)
        );
        // band = 0.0 call site: bit-exact legacy semantics — the seat depth
        // exceeds CONTACT_DEPTH, so the legacy guard yields no candidate.
        assert_eq!(ball_linear_cushion_time(&p, &seg, R, TMIN, 0.0), None);
    }

    #[test]
    fn rail_seat_band_ghost_noise_velocity_gate_unchanged() {
        let seg = seg_y1();
        // The sin(π) strike-rounding noise class: a seated ball with
        // vx ≈ 1e-15 m/s toward the rail is 10 orders below REST_APPROACH.
        // Widening the DEPTH acceptance must not convert it into events —
        // the velocity gate, not the depth gate, filters it (permanent
        // test, research R2 / spec edge case).
        let p = poly((0.0, 1.0 - d_seat(seg.height)), (0.0, 1e-15), (0.0, 0.0));
        assert_eq!(
            ball_linear_cushion_time(&p, &seg, R, TMIN, band(seg.height)),
            None
        );
        // Resting-contact class just below the gate: likewise no candidate.
        let p = poly((0.0, 1.0 - d_seat(seg.height)), (0.0, 9e-6), (0.0, 0.0));
        assert_eq!(
            ball_linear_cushion_time(&p, &seg, R, TMIN, band(seg.height)),
            None
        );
        // Separating from the seat: no candidate (no re-trigger).
        let p = poly((0.0, 1.0 - d_seat(seg.height)), (0.0, -1.0), (0.0, 0.0));
        assert_eq!(
            ball_linear_cushion_time(&p, &seg, R, TMIN, band(seg.height)),
            None
        );
    }

    #[test]
    fn rail_seat_band_span_rejection_unchanged() {
        let seg = seg_y1();
        // Seat-depth position past the segment end (a pocket-mouth position
        // behind the extended jaw plane projects out of span): rejected with
        // or without the band.
        let p = poly((2.0, 1.0 - d_seat(seg.height)), (0.0, 1.0), (0.0, 0.0));
        assert_eq!(
            ball_linear_cushion_time(&p, &seg, R, TMIN, band(seg.height)),
            None
        );
    }

    #[test]
    fn rail_seat_band_deeper_than_band_still_rejected() {
        let seg = seg_y1();
        // 5 mm past the plane — deeper than CONTACT_DEPTH + band: still
        // geometrically somewhere else (pocket mouth), no candidate.
        let p = poly((0.0, 1.0 - R + 0.005), (0.0, 1.0), (0.0, 0.0));
        assert_eq!(
            ball_linear_cushion_time(&p, &seg, R, TMIN, band(seg.height)),
            None
        );
    }

    #[test]
    fn rail_seat_band_entry_root_path_unchanged() {
        let seg = seg_y1();
        // Approach-side contact from open table stays at plane distance R:
        // the entry root is identical with and without the band (FR-002).
        let p = poly((0.0, 0.0), (0.0, 1.0), (0.0, 0.0));
        let legacy = ball_linear_cushion_time(&p, &seg, R, TMIN, 0.0).unwrap();
        let banded = ball_linear_cushion_time(&p, &seg, R, TMIN, band(seg.height)).unwrap();
        assert_eq!(legacy.to_bits(), banded.to_bits(), "entry root moved");
        assert!((legacy - (1.0 - R)).abs() < 1e-9);
    }

    #[test]
    fn rail_seat_band_admits_seated_arc_ball_and_keeps_gates() {
        let arc = arc_at_half_meter();
        let seat_rho = arc.radius + d_seat(arc.height);
        // Seated in the arc band, closing on the arc: immediate event.
        let p = poly((0.5 - seat_rho, 0.0), (1.0, 0.0), (0.0, 0.0));
        assert_eq!(
            ball_circular_cushion_time(&p, &arc, R, TMIN, band(arc.height)),
            Some(TMIN)
        );
        // band = 0.0: bit-exact legacy — seat depth exceeds CONTACT_DEPTH.
        assert_eq!(ball_circular_cushion_time(&p, &arc, R, TMIN, 0.0), None);
        // Seated but receding: no candidate even with the band.
        let p = poly((0.5 - seat_rho, 0.0), (-1.0, 0.0), (0.0, 0.0));
        assert_eq!(
            ball_circular_cushion_time(&p, &arc, R, TMIN, band(arc.height)),
            None
        );
        // Angular span still gates the banded guard (Amendment 016 check
        // unchanged): seated at an off-span angle of a spanned arc → None.
        let sp = spanned_arc();
        let p = poly(
            (0.5 + sp.radius + d_seat(sp.height), 0.0),
            (-1.0, 0.0),
            (0.0, 0.0),
        );
        assert_eq!(
            ball_circular_cushion_time(&p, &sp, R, TMIN, band(sp.height)),
            None
        );
    }

    // ---- ball_circular_cushion ----

    #[test]
    fn circular_cushion_direct_hit_exact() {
        let arc = CircularCushionSegment {
            center: Vec3::new(0.5, 0.0, 0.0),
            radius: 0.02095,
            height: 0.036,
            span: None,
        };
        let p = poly((-0.5, 0.0), (1.0, 0.0), (0.0, 0.0));
        let k = circular_cushion_quartic(&p, &arc, R);
        let expected = 1.0 - (arc.radius + R);
        let tau = ref_smallest_root(&k, TMIN, 2.0).unwrap();
        assert!((tau - expected).abs() < 1e-9, "{tau} vs {expected}");
    }

    #[test]
    fn circular_cushion_tangential_hit_and_miss() {
        let arc = CircularCushionSegment {
            center: Vec3::new(0.5, 0.0, 0.0),
            radius: 0.02095,
            height: 0.036,
            span: None,
        };
        let dist = arc.radius + R;

        // Grazing pass just inside the contact circle → hit near closest
        // approach.
        let off_hit = dist * (1.0 - 1e-3);
        let p = poly((-0.5, off_hit), (1.0, 0.0), (0.0, 0.0));
        let k = circular_cushion_quartic(&p, &arc, R);
        let expected = 1.0 - libm::sqrt(dist * dist - off_hit * off_hit);
        let tau = ref_smallest_root(&k, TMIN, 2.0).unwrap();
        assert!((tau - expected).abs() < 1e-9, "{tau} vs {expected}");

        // Just outside → None.
        let off_miss = dist * (1.0 + 1e-3);
        let p = poly((-0.5, off_miss), (1.0, 0.0), (0.0, 0.0));
        let k = circular_cushion_quartic(&p, &arc, R);
        assert_eq!(ref_smallest_root(&k, TMIN, 2.0), None);
    }

    fn arc_at_half_meter() -> CircularCushionSegment {
        CircularCushionSegment {
            center: Vec3::new(0.5, 0.0, 0.0),
            radius: 0.02095,
            height: 0.036,
            span: None,
        }
    }

    #[test]
    fn circular_cushion_at_contact_guard_fires_and_rejects() {
        let arc = arc_at_half_meter();
        let d = arc.radius + R;
        // At contact, closing on the arc → immediate event.
        let p = poly((0.5 - d, 0.0), (1.0, 0.0), (0.0, 0.0));
        assert_eq!(ball_circular_cushion_time(&p, &arc, R, TMIN, 0.0), Some(TMIN));
        // Slight penetration (10 nm), closing → immediate event.
        let p = poly((0.5 - d + 1e-8, 0.0), (1.0, 0.0), (0.0, 0.0));
        assert_eq!(ball_circular_cushion_time(&p, &arc, R, TMIN, 0.0), Some(TMIN));
        // Within the t_min window of contact → immediate event.
        let p = poly((0.5 - d - 1e-10, 0.0), (1.0, 0.0), (0.0, 0.0));
        assert_eq!(ball_circular_cushion_time(&p, &arc, R, TMIN, 0.0), Some(TMIN));
        // At contact but moving AWAY → no candidate.
        let p = poly((0.5 - d, 0.0), (-1.0, 0.0), (0.0, 0.0));
        assert_eq!(ball_circular_cushion_time(&p, &arc, R, TMIN, 0.0), None);
    }

    #[test]
    fn circular_cushion_exit_crossing_rejected_for_inside_ball() {
        let arc = arc_at_half_meter();
        let d = arc.radius + R;
        // Ball 5 mm inside the contact circle (deeper than CONTACT_DEPTH),
        // moving so it exits through the far side: the old solver returned
        // the far-side EXIT crossing (wrong position and normal); now the
        // inward-motion validation rejects it.
        let p = poly((0.5 - d + 0.005, 0.0), (1.0, 0.0), (0.0, 0.0));
        assert_eq!(ball_circular_cushion_time(&p, &arc, R, TMIN, 0.0), None);
        // Same ball backing straight out the near side: also no candidate.
        let p = poly((0.5 - d + 0.005, 0.0), (-1.0, 0.0), (0.0, 0.0));
        assert_eq!(ball_circular_cushion_time(&p, &arc, R, TMIN, 0.0), None);
    }

    #[test]
    fn circular_cushion_entry_root_via_production_solver() {
        let arc = arc_at_half_meter();
        // Outside ball, straight-on: entry at 1 − (arc.radius + R), and the
        // exit crossing (~2·contact later) must NOT be the answer.
        let p = poly((-0.5, 0.0), (1.0, 0.0), (0.0, 0.0));
        let expected = 1.0 - (arc.radius + R);
        let tau = ball_circular_cushion_time(&p, &arc, R, TMIN, 0.0).unwrap();
        assert!((tau - expected).abs() < 1e-9, "{tau} vs {expected}");
    }

    // ---- arc-span filtering (Amendment 016) ----

    /// Spanned arc at (0.5, 0) whose physical face is only the −x quadrant
    /// band (angles 135°..225°).
    fn spanned_arc() -> CircularCushionSegment {
        CircularCushionSegment {
            center: Vec3::new(0.5, 0.0, 0.0),
            radius: 0.02095,
            height: 0.036,
            span: Some(crate::table::ArcSpan {
                start: 3.0 * std::f64::consts::FRAC_PI_4,
                sweep: std::f64::consts::FRAC_PI_2,
            }),
        }
    }

    /// A spanned arc accepts the entry crossing when the contact angle is
    /// on the span and yields NO candidate otherwise — the ball passes the
    /// non-physical part of the circle (the capability that unsealed the
    /// snooker mouths). Times stay polynomial-root exact: the span is a
    /// pure root filter.
    #[test]
    fn circular_cushion_span_filters_roots() {
        let arc = spanned_arc();
        // Straight-on from −x: contact angle π (on the span) → accepted at
        // the exact full-circle entry time.
        let p = poly((-0.5, 0.0), (1.0, 0.0), (0.0, 0.0));
        let expected = 1.0 - (arc.radius + R);
        let tau = ball_circular_cushion_time(&p, &arc, R, TMIN, 0.0).unwrap();
        assert!((tau - expected).abs() < 1e-9, "{tau} vs {expected}");
        // Straight-on from +x: entry crossing at angle 0 (off the span) →
        // no candidate at all (the far-side π crossing is an EXIT crossing
        // and stays rejected by the inward filter).
        let p = poly((1.5, 0.0), (-1.0, 0.0), (0.0, 0.0));
        assert_eq!(ball_circular_cushion_time(&p, &arc, R, TMIN, 0.0), None);
        // From +y (entry angle π/2, off the span) → none.
        let p = poly((0.5, 1.0), (0.0, -1.0), (0.0, 0.0));
        assert_eq!(ball_circular_cushion_time(&p, &arc, R, TMIN, 0.0), None);
        // Span-endpoint hit: ball moving radially into the exact
        // start-angle (135°) contact point → accepted
        // (endpoint-inclusive, the junction-continuity requirement).
        let d = arc.radius + R;
        let (nx, ny) = (
            libm::cos(3.0 * std::f64::consts::FRAC_PI_4),
            libm::sin(3.0 * std::f64::consts::FRAC_PI_4),
        );
        let p = PosPoly {
            c0: Vec3::new(0.5 + (d + 0.3) * nx, (d + 0.3) * ny, R),
            c1: Vec3::new(-nx, -ny, 0.0),
            c2: Vec3::ZERO,
        };
        let tau = ball_circular_cushion_time(&p, &arc, R, TMIN, 0.0)
            .expect("endpoint-inclusive span must accept the junction hit");
        assert!((tau - 0.3).abs() < 1e-9, "{tau}");
    }

    /// The at-contact guard is span-gated too: a ball resting at contact
    /// distance moving in fires only when the contact angle is physical.
    #[test]
    fn circular_cushion_span_gates_at_contact_guard() {
        let arc = spanned_arc();
        let d = arc.radius + R;
        // At contact on the physical side (angle π), closing → immediate.
        let p = poly((0.5 - d, 0.0), (1.0, 0.0), (0.0, 0.0));
        assert_eq!(ball_circular_cushion_time(&p, &arc, R, TMIN, 0.0), Some(TMIN));
        // At contact on the NON-physical side (angle 0), closing → none.
        let p = poly((0.5 + d, 0.0), (-1.0, 0.0), (0.0, 0.0));
        assert_eq!(ball_circular_cushion_time(&p, &arc, R, TMIN, 0.0), None);
    }

    /// Airborne variant honors the span identically (z-gate unchanged).
    #[test]
    fn airborne_circular_span_filter() {
        let arc = spanned_arc();
        // Low flier from −x (contact angle π, on the span) → hit.
        let p = air((-0.5, 0.0, R), (2.0, 0.0, 0.2));
        assert!(ball_circular_cushion_time_airborne(&p, &arc, R, TMIN, 0.0).is_some());
        // Low flier from +x (contact angle 0, off the span) → no candidate.
        let p = air((1.5, 0.0, R), (-2.0, 0.0, 0.2));
        assert_eq!(ball_circular_cushion_time_airborne(&p, &arc, R, TMIN, 0.0), None);
        // At-contact guard, non-physical side → none.
        let d = arc.radius + R;
        let p = air((0.5 + d, 0.0, R), (-1.0, 0.0, 0.1));
        assert_eq!(ball_circular_cushion_time_airborne(&p, &arc, R, TMIN, 0.0), None);
    }

    // ---- arc seated-hop guard (feature 021, detection-routing §4) ----

    /// Airborne poly seated at the arc's nose-contact distance at `angle`,
    /// with vertical velocity `vz` (no horizontal motion).
    fn arc_seat_poly(arc: &CircularCushionSegment, angle: f64, vz: f64) -> PosPoly {
        let rho_seat = arc.radius + (R - crate::table::nose_seat_depth(arc.height, R));
        PosPoly {
            c0: Vec3::new(
                arc.center.x + libm::cos(angle) * rho_seat,
                arc.center.y + libm::sin(angle) * rho_seat,
                R,
            ),
            c1: Vec3::new(0.0, 0.0, vz),
            c2: Vec3::new(0.0, 0.0, -0.5 * 9.81),
        }
    }

    #[test]
    fn rail_seat_arc_seated_hop_guard_truth_table() {
        let arc = arc_at_half_meter();
        let b = band(arc.height);
        let pi = std::f64::consts::PI;
        // Rising at the seat: all five frozen conditions hold → t_min.
        assert_eq!(
            ball_circular_cushion_time_airborne(&arc_seat_poly(&arc, pi, 0.3), &arc, R, TMIN, b),
            Some(TMIN)
        );
        // band = 0.0 ⇒ the guard is provably dead: strictly inside the
        // cylinder contact circle, entry roots in the past, and the legacy
        // at-contact guard depth-rejects the seat → None.
        assert_eq!(
            ball_circular_cushion_time_airborne(&arc_seat_poly(&arc, pi, 0.3), &arc, R, TMIN, 0.0),
            None
        );
        // Descending at the seat recedes from the nose circle
        // (g·g′(0) = (z−h)·vz > 0) → None (condition 4).
        assert_eq!(
            ball_circular_cushion_time_airborne(&arc_seat_poly(&arc, pi, -0.3), &arc, R, TMIN, b),
            None
        );
        // Velocity-gate truth table (condition 4's REST_APPROACH scale at
        // this geometry: vz ≳ 3.9e-5): 4e-5 admits, 3e-5 rests.
        assert_eq!(
            ball_circular_cushion_time_airborne(&arc_seat_poly(&arc, pi, 4e-5), &arc, R, TMIN, b),
            Some(TMIN)
        );
        assert_eq!(
            ball_circular_cushion_time_airborne(&arc_seat_poly(&arc, pi, 3e-5), &arc, R, TMIN, b),
            None
        );
    }

    #[test]
    fn rail_seat_arc_seated_hop_guard_span_and_wall_class() {
        let b = band(0.036);
        let pi = std::f64::consts::PI;
        // Angular-span rejection (condition 5, the unchanged check): seat
        // at an off-span angle of a spanned arc → None; on-span → t_min.
        let sp = spanned_arc();
        assert_eq!(
            ball_circular_cushion_time_airborne(&arc_seat_poly(&sp, 0.0, 0.3), &sp, R, TMIN, b),
            None
        );
        assert_eq!(
            ball_circular_cushion_time_airborne(&arc_seat_poly(&sp, pi, 0.3), &sp, R, TMIN, b),
            Some(TMIN)
        );
        // Wall class disjoint by construction (condition 1's strict upper
        // bound): at the cylinder contact circle the banded call is
        // identical to the legacy call — the existing at-contact guard
        // owns it either way.
        let arc = arc_at_half_meter();
        let d = arc.radius + R;
        let p = air((0.5 - d, 0.0, R), (1.0, 0.0, 0.1));
        assert_eq!(
            ball_circular_cushion_time_airborne(&p, &arc, R, TMIN, b),
            ball_circular_cushion_time_airborne(&p, &arc, R, TMIN, 0.0)
        );
        // Entry crossings from open table: root identical with the band.
        let p = air((-0.5, 0.0, R), (2.0, 0.0, 0.2));
        assert_eq!(
            ball_circular_cushion_time_airborne(&p, &arc, R, TMIN, b),
            ball_circular_cushion_time_airborne(&p, &arc, R, TMIN, 0.0)
        );
    }

    // ---- ball_table (Amendment 002) ----

    /// Airborne poly launched from bed height with upward vz.
    fn air(c0: (f64, f64, f64), c1: (f64, f64, f64)) -> PosPoly {
        PosPoly {
            c0: Vec3::new(c0.0, c0.1, c0.2),
            c1: Vec3::new(c1.0, c1.1, c1.2),
            c2: Vec3::new(0.0, 0.0, -0.5 * 9.81),
        }
    }

    #[test]
    fn ball_table_descending_leg_root() {
        // Launched up at 1 m/s from z = R: lands at exactly 2·vz/g.
        let p = air((0.0, 0.0, R), (0.5, 0.0, 1.0));
        let tau = ball_table_time(&p, R, TMIN).unwrap();
        assert!((tau - 2.0 / 9.81).abs() < 1e-12, "{tau}");

        // From altitude, already descending: single positive root.
        let p = air((0.0, 0.0, R + 0.1), (0.0, 0.0, -0.5));
        let tau = ball_table_time(&p, R, TMIN).unwrap();
        let z = R + 0.1 - 0.5 * tau - 0.5 * 9.81 * tau * tau;
        assert!((z - R).abs() < 1e-9);
    }

    #[test]
    fn ball_table_immediate_guard_legal_jump() {
        // Legal jump: at bed height moving DOWN (any speed) → immediate.
        let p = air((0.0, 0.0, R), (1.0, 0.0, -2.0));
        assert_eq!(ball_table_time(&p, R, TMIN), Some(TMIN));
        // Arbitrarily slow sinkers must ALSO fire (no REST_APPROACH gate on
        // the bed — a missed candidate lets the ball fall through forever).
        let p = air((0.0, 0.0, R), (1.0, 0.0, -1e-7));
        assert_eq!(ball_table_time(&p, R, TMIN), Some(TMIN));
        // Slightly below the bed (float error), descending → immediate.
        let p = air((0.0, 0.0, R - 1e-9), (0.0, 0.0, -0.1));
        assert_eq!(ball_table_time(&p, R, TMIN), Some(TMIN));
    }

    #[test]
    fn ball_table_rising_from_bed_not_immediate() {
        // Fresh bounce: moving up from z = R → next landing is the FUTURE
        // descending crossing, never an immediate re-trigger (no Zeno).
        let p = air((0.0, 0.0, R), (0.0, 0.0, 2.0));
        let tau = ball_table_time(&p, R, TMIN).unwrap();
        assert!(tau > 0.1, "must be the return crossing, got {tau}");
    }

    // ---- airborne vs cushion (feature 003 stage 2) ----

    const H: f64 = 0.036; // WPA nose height used by seg_y1()

    #[test]
    fn airborne_linear_low_flier_hits_capsule() {
        let seg = seg_y1();
        // Hop 0.1 m short of the y = 1 rail at 2 m/s with a small vertical
        // launch: still airborne and below nose height at the rail.
        let p = air((0.0, 0.9, R), (0.0, 2.0, 0.3));
        let tau = ball_linear_cushion_time_airborne(&p, &seg, R, TMIN)
            .expect("low flier must hit the nose");
        // Contact when dist(center, nose axis) = R: strictly past the planar
        // contact plane (y = 1 − R) because the center is below the axis.
        let pos = poly_at(&p, tau);
        let d = libm::sqrt((pos.y - 1.0) * (pos.y - 1.0) + (pos.z - H) * (pos.z - H));
        assert!((d - R).abs() < 1e-9, "capsule distance {d} vs R");
        assert!(pos.y > 1.0 - R, "true 3D contact is deeper than the plane");
    }

    #[test]
    fn airborne_linear_high_flier_clears_nose() {
        let seg = seg_y1();
        // Same aim, launched high: z stays > h + R through the crossing.
        let p = air((0.0, 0.7, R + 0.2), (0.0, 2.0, 1.0));
        assert_eq!(
            ball_linear_cushion_time_airborne(&p, &seg, R, TMIN),
            None,
            "legal fly-over must generate no cushion candidate"
        );
    }

    #[test]
    fn airborne_linear_descending_onto_nose_from_above() {
        let seg = seg_y1();
        // Dropped from above the nose line, slight horizontal drift: contacts
        // the capsule from above (the stage-1 fence missed this entirely).
        let p = air((0.0, 1.0 - 0.005, H + 0.2), (0.0, 0.05, 0.0));
        let tau = ball_linear_cushion_time_airborne(&p, &seg, R, TMIN)
            .expect("descent onto the nose must be detected");
        let pos = poly_at(&p, tau);
        let d = libm::sqrt((pos.y - 1.0) * (pos.y - 1.0) + (pos.z - H) * (pos.z - H));
        assert!((d - R).abs() < 1e-9, "capsule distance {d} vs R");
        assert!(pos.z > H, "contact from above the axis");
    }

    #[test]
    fn airborne_linear_span_and_separating_rejected() {
        let seg = seg_y1();
        // Crossing at x = 2, outside the [−0.5, 0.5] span → no candidate.
        let p = air((2.0, 0.0, R), (0.0, 2.0, 0.3));
        assert_eq!(ball_linear_cushion_time_airborne(&p, &seg, R, TMIN), None);
        // At capsule contact but separating → no candidate.
        let y_c = 1.0 - libm::sqrt(R * R - (R - H) * (R - H));
        let p = air((0.0, y_c, R), (0.0, -2.0, 0.3));
        assert_eq!(ball_linear_cushion_time_airborne(&p, &seg, R, TMIN), None);
    }

    #[test]
    fn airborne_linear_at_contact_guard_fires() {
        let seg = seg_y1();
        // Resting hop exactly at capsule contact, moving in → immediate.
        let y_c = 1.0 - libm::sqrt(R * R - (R - H) * (R - H));
        let p = air((0.0, y_c, R), (0.0, 2.0, 0.1));
        assert_eq!(
            ball_linear_cushion_time_airborne(&p, &seg, R, TMIN),
            Some(TMIN)
        );
    }

    #[test]
    fn airborne_linear_plane_gate_requires_axis_approach() {
        // Zeno regression (fuzz airborne #1371): ball INSIDE the capsule
        // (past the contact plane, below the nose) still moving toward the
        // plane but diving AWAY from the axis. The resolver would read this
        // as separating and no-op, so detect must yield no candidate.
        let seg = seg_y1();
        let p = air((0.0, 0.98, R), (0.0, 0.5, -3.0));
        assert_eq!(ball_linear_cushion_time_airborne(&p, &seg, R, TMIN), None);
        // Control: same spot closing on the axis instead → candidate.
        let p = air((0.0, 0.98, R), (0.0, 0.5, 0.5));
        assert!(ball_linear_cushion_time_airborne(&p, &seg, R, TMIN).is_some());
    }

    #[test]
    fn airborne_circular_z_gate() {
        let arc = arc_at_half_meter(); // height 0.036
                                       // Low flier straight at the jaw: quadratic entry crossing.
        let p = air((-0.5, 0.0, R), (2.0, 0.0, 0.2));
        let tau = ball_circular_cushion_time_airborne(&p, &arc, R, TMIN, 0.0)
            .expect("low flier must hit the jaw wall");
        let expected = (1.0 - (arc.radius + R)) / 2.0;
        assert!((tau - expected).abs() < 1e-9, "{tau} vs {expected}");
        // High flier: center above the jaw top at the crossing → fly-over.
        let p = air((-0.5, 0.0, R + 0.3), (4.0, 0.0, 1.0));
        assert_eq!(ball_circular_cushion_time_airborne(&p, &arc, R, TMIN, 0.0), None);
    }

    #[test]
    fn landing_classifier_bed_vs_off_table() {
        let table = crate::table::Table::wpa_9ft(R);
        // Lands mid-table → bed bounce.
        let p = air((0.0, 0.0, R + 0.1), (0.1, 0.0, 0.0));
        let tau = ball_table_time(&p, R, TMIN).unwrap();
        assert!(!landing_off_table(&p, tau, &table, R));
        // Lands past the right rail (x beyond width/2, away from pockets).
        let p = air((table.width / 2.0 - 0.01, 0.3, R + 0.3), (2.0, 0.0, 0.5));
        let tau = ball_table_time(&p, R, TMIN).unwrap();
        assert!(landing_off_table(&p, tau, &table, R));
        // Lands outside the rect but inside a pocket circle → NOT off-table
        // (the pocket capture heuristic owns that region).
        let pk = &table.pockets[0];
        let p = air(
            (pk.center.x - 0.005, pk.center.y - 0.005, R + 0.05),
            (0.4, 0.4, 0.0),
        );
        let tau = ball_table_time(&p, R, TMIN).unwrap();
        let pos = poly_at(&p, tau);
        if pos.x.abs() > table.width / 2.0 || pos.y.abs() > table.length / 2.0 {
            assert!(!landing_off_table(&p, tau, &table, R));
        }
    }

    // ---- airborne pocket capture (Amendment 002, 7/5R heuristic) ----

    fn pocket_at(x: f64, y: f64) -> Pocket {
        Pocket {
            center: Vec3::new(x, y, 0.0),
            radius: 0.062,
        }
    }

    #[test]
    fn airborne_pocket_strategy1_landing_inside_circle() {
        let pocket = pocket_at(0.0, 0.5);
        // Launched up at 1 m/s: lands after 2/g s having advanced vy·t.
        let t_land = 2.0 / 9.81;
        let vy = 0.5 / t_land; // lands exactly at the pocket center
        let p = air((0.0, 0.0, R), (0.0, vy, 1.0));
        let tau = ball_pocket_time_airborne(&p, &pocket, R, TMIN).unwrap();
        assert!(tau < t_land, "capture must precede the table bounce");
        assert!((tau - t_land).abs() < 1e-6);
    }

    #[test]
    fn airborne_pocket_strategy2_rim_height_gate() {
        let pocket = pocket_at(0.0, 0.5);
        // Low flier: hops from z = R at 0.4 m/s up, 2 m/s toward the pocket
        // from 0.088 m short of its circle — influx above bed height, outflux
        // below (7/5)·R → captured at the influx/outflux midpoint.
        let low = air((0.0, 0.35, R), (0.0, 2.0, 0.4));
        let tau = ball_pocket_time_airborne(&low, &pocket, R, TMIN);
        assert!(tau.is_some(), "low flier must drop");

        let high = air((0.0, 0.0, R + 0.5), (0.0, 2.0, 1.0));
        assert_eq!(
            ball_pocket_time_airborne(&high, &pocket, R, TMIN),
            None,
            "high flier must clear the pocket"
        );
    }

    #[test]
    fn airborne_pocket_misses_wide_path() {
        let pocket = pocket_at(0.0, 0.5);
        // Path passing 10 cm wide of the pocket: no capture.
        let p = air((0.2, 0.0, R + 0.01), (0.0, 2.0, 0.0));
        assert_eq!(ball_pocket_time_airborne(&p, &pocket, R, TMIN), None);
    }

    /// GH-594: a ball that ENTERS the pocket cylinder below the ceiling (7R/5)
    /// on the RISING leg and exits high is committed to the throat and must be
    /// captured — the old outflux-only test rejected it as a fly-over, leaving
    /// the low hop with no collider (it tunneled off-table on the v16 chinese8
    /// molded corner). A genuine fly-over (high at BOTH rim crossings) still
    /// rejects.
    #[test]
    fn airborne_pocket_captures_enter_low_exit_high_gh594() {
        let pocket = pocket_at(0.0, 0.5); // radius 0.062
        // Approach along +y from 0.08 m short, rising: influx at y = 0.438
        // (z ≈ 0.039 < 7R/5 = 0.040), outflux at y = 0.562 (z ≈ 0.070 > 0.040).
        let low = air((0.0, 0.42, R), (0.0, 1.5, 0.9));
        let tau = ball_pocket_time_airborne(&low, &pocket, R, TMIN);
        assert!(
            tau.is_some(),
            "enter-low, exit-high must be captured (GH-594), got {tau:?}"
        );
        // Same horizontal path, launched 5 cm higher: BOTH crossings clear the
        // ceiling → a true fly-over, still rejected.
        let high = air((0.0, 0.42, R + 0.05), (0.0, 1.5, 0.9));
        assert_eq!(
            ball_pocket_time_airborne(&high, &pocket, R, TMIN),
            None,
            "a genuine fly-over (high at both crossings) must still reject"
        );
    }

    // ---- ball_pocket ----

    #[test]
    fn pocket_center_inside_point_of_no_return_pockets_immediately() {
        let pocket = Pocket {
            center: Vec3::new(0.0, 1.0, 0.0),
            radius: 0.062,
        };
        // Center inside the circle, regardless of direction: no return.
        for vy in [1.0, -1.0, 0.2] {
            let p = poly((0.0, 1.0 - 0.03), (0.0, vy), (0.0, 0.0));
            assert_eq!(ball_pocket_time(&p, &pocket, TMIN), Some(TMIN), "vy={vy}");
        }
        // Within the t_min window of crossing, closing → immediate.
        let p = poly((0.0, 1.0 - pocket.radius - 1e-10), (0.0, 1.0), (0.0, 0.0));
        assert_eq!(ball_pocket_time(&p, &pocket, TMIN), Some(TMIN));
        // Just outside, moving away → no candidate.
        let p = poly((0.0, 1.0 - pocket.radius - 1e-6), (0.0, -1.0), (0.0, 0.0));
        assert_eq!(ball_pocket_time(&p, &pocket, TMIN), None);
    }

    #[test]
    fn pocket_center_crossing_exact() {
        let pocket = Pocket {
            center: Vec3::new(0.0, 1.0, 0.0),
            radius: 0.062,
        };
        let p = poly((0.0, 0.0), (0.0, 2.0), (0.0, 0.0));
        let k = pocket_quartic(&p, &pocket);
        // Center crosses the point-of-no-return circle (NO +R term):
        // 2τ = 1 − 0.062.
        let expected = (1.0 - pocket.radius) / 2.0;
        let tau = ref_smallest_root(&k, TMIN, 1.0).unwrap();
        assert!((tau - expected).abs() < 1e-9, "{tau} vs {expected}");
        // The +R variant would differ: proves the radius choice matters.
        let k_wrong = xy_cylinder_quartic(&p, 0.0, 1.0, pocket.radius + R);
        let tau_wrong = ref_smallest_root(&k_wrong, TMIN, 1.0).unwrap();
        assert!((tau_wrong - tau).abs() > 1e-3);
    }

    #[test]
    fn pocket_miss_wide_of_radius() {
        let pocket = Pocket {
            center: Vec3::new(0.0, 1.0, 0.0),
            radius: 0.062,
        };
        // Straight line passing 1 mm wide of the point-of-no-return circle.
        let p = poly((pocket.radius + 1e-3, 0.0), (0.0, 2.0), (0.0, 0.0));
        let k = pocket_quartic(&p, &pocket);
        assert_eq!(ref_smallest_root(&k, TMIN, 1.0), None);
    }
}
