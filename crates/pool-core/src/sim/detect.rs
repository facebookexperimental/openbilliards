// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Event-time solvers per pair type (M3-owned).
//!
//! Derived from pooltool `pooltool/evolution/event_based/detect/`,
//! `pooltool/physics/utils.py` and `pooltool/ptmath/utils.py`
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
use crate::math::refine;
use crate::math::roots_adapter::{self, WindowRoots};
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
    // A: relative acceleration/2 (τ² coefficient); B: relative velocity (τ
    // coefficient); C: relative position (constant).
    ball_ball_quartic_from(a.c2 - b.c2, a.c1 - b.c1, a.c0 - b.c0, rsum)
}

/// [`ball_ball_quartic`] from the difference vectors (A, B, C) directly, so
/// the F1 rescaling can scale A and B without forming either path.
fn ball_ball_quartic_from(ca: Vec3, cb: Vec3, cc: Vec3, rsum: f64) -> [f64; 5] {
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

// ---- F1: leading-coefficient underflow (K-fix, BRIEF-KFIX-v1) ----------
//
// Every quartic builder forms its leading coefficient a4 as a (half-)sum of
// squares of one defining input vector: Δc2 for a pair, c2.xy for a disc or
// an arc, c2.z for the nose capsule. When that vector is nonzero but tiny
// (every component below ~1.5e-154 m/s²; gameplay cannot reach it), the
// computed a4 is zero or subnormal: the represented polynomial is a cubic (or
// carries a few-bit a4) and the root service correctly returns its spurious
// far root (perf K: 1e294–1e305 s, where the exact quartic has no root).
//
// Bound A. If the computed a4 is below MIN_POSITIVE, so is every computed
// square in it; each exact square is then below MIN_POSITIVE + 2^-1075
// (rounding below MIN_POSITIVE is absolute), the sum of the computed squares
// is exact, and with the u-relative rounding of the Δc2 subtraction the exact
// a4 is below (1 + 7u)·MIN_POSITIVE. So |a4_exact − a4| < A := 2·MIN_POSITIVE.
//
// Horizon τ_H. R(t) = u·Σ_{k<4} |a_k|·t^k is how far the represented
// polynomial moves at t when every coefficient moves by its own half-ulp
// (u = 2^-53): the binary64 polynomial resolves nothing below it. The missing
// term is below A·t⁴. R(t)/t⁴ strictly decreases, so {t > 0 : 2A·t⁴ ≤ R(t)}
// is an interval (0, τ_H]. [`within_horizon`] tests 4A ≤ u·Σ|a_k|·t^(k−4)
// with reciprocal powers (relative evaluation error ≤ 10u), so a true result
// certifies 2A·t⁴ ≤ R(t): t ≤ τ_H, and the missing term is below half the
// represented polynomial's own rounding level.
//
// Rule. Today's answer is kept iff it is Some(t) with t certified inside τ_H.
// Otherwise (its root lies beyond τ_H, or it has none, i.e. the earliest
// represented root is beyond τ_H) the exact quartic answers: time is rescaled
// by a power of two s (τ = s·σ), so the inputs scale exactly (c1·s, c2·s·s),
// the rescaled a4 is normal, and the same builder, root service and
// validators run on the rescaled path; σ·s is exact.
//
// Certificate. A rescaled root inside τ_H is a near root, trusted like
// today's. Beyond τ_H the exact quartic can only have real roots near
// t* = |B|/|A| when A ∥ B (Cauchy–Schwarz), and there its leading terms form a
// near-perfect square |Aτ² + Bτ|²: the coefficient rounding u·|B|²τ² dwarfs
// the deepest possible dip (rsum²), so no binary64 coefficient vector decides
// whether the root exists (perf K: the A ∥ B rows with no exact root yield one
// after rescaling). Such a root is kept only if [`certified_sign_change`]
// proves the exact quartic changes sign within σ·(1 ± 2^-6); else None.

/// Bound A on |a4_exact − a4| when the computed a4 is not normal (see above).
const LEAD_UNDERFLOW_BOUND: f64 = 2.0 * f64::MIN_POSITIVE;

/// F1 horizon test (see the section comment): true iff `t` > 0 is certified
/// to lie inside τ_H for the represented coefficients `k`.
fn within_horizon(k: &[f64; 5], t: f64) -> bool {
    let q = 1.0 / t;
    let q2 = q * q;
    let level = k[1].abs() * q + k[2].abs() * q2 + k[3].abs() * (q2 * q) + k[4].abs() * (q2 * q2);
    level * (0.5 * f64::EPSILON) >= 4.0 * LEAD_UNDERFLOW_BOUND
}

/// True iff a computed leading coefficient is represented: |a4| ≥
/// MIN_POSITIVE (normal or infinite). Zero, subnormal and NaN are not.
fn lead_represented(a4: f64) -> bool {
    a4.abs() >= f64::MIN_POSITIVE
}

/// F1 decision: `Some(s)` (the power-of-two time scale) iff the leading
/// coefficient underflowed although its defining vector (largest component
/// magnitude `lead`) is nonzero, and `today` is not a root certified inside
/// τ_H. Callers test `k[0]` first, so the normal path costs one comparison.
fn exact_quartic_scale(k: &[f64; 5], lead: f64, today: Option<f64>) -> Option<f64> {
    let nonzero_lead = lead > 0.0;
    if lead_represented(k[0]) || !nonzero_lead || today.is_some_and(|t| within_horizon(k, t)) {
        return None;
    }
    // lead ∈ [2^e, 2^(e+1)) maps to lead·s² ∈ [2^-400, 2^-398): the rescaled
    // a4 is normal with a wide margin and, as lead < 2^-510 here, s lies in
    // [2^56, 2^337], so c1·s and t_min/s stay finite and normal.
    let e = binary_exponent(lead);
    Some(pow2((-400 - e + 1) / 2))
}

/// Exponent e of a finite `m` > 0 with m ∈ [2^e, 2^(e+1)), subnormals included.
fn binary_exponent(m: f64) -> i32 {
    let bits = m.to_bits();
    let field = ((bits >> 52) & 0x7ff) as i32;
    if field == 0 {
        let frac = bits & ((1u64 << 52) - 1);
        63 - frac.leading_zeros() as i32 - 1074
    } else {
        field - 1023
    }
}

/// 2^k for k in the normal exponent range [−1022, 1023].
fn pow2(k: i32) -> f64 {
    debug_assert!((-1022..=1023).contains(&k));
    f64::from_bits(((k + 1023) as u64) << 52)
}

/// The path in rescaled time σ = τ/s: c0 + (c1·s)·σ + (c2·s·s)·σ² (exact for a
/// power of two s without overflow).
fn time_scaled(p: &PosPoly, s: f64) -> PosPoly {
    PosPoly {
        c0: p.c0,
        c1: p.c1 * s,
        c2: p.c2 * s * s,
    }
}

/// τ = σ·s; a root beyond the binary64 range is no answer.
fn unscale(sigma: f64, s: f64) -> Option<f64> {
    let tau = sigma * s;
    tau.is_finite().then_some(tau)
}

/// F1 for the disc/arc builders (defining vector c2.xy).
fn xy_exact_quartic_scale(k: &[f64; 5], p: &PosPoly, today: Option<f64>) -> Option<f64> {
    if lead_represented(k[0]) {
        return None;
    }
    exact_quartic_scale(k, p.c2.x.abs().max(p.c2.y.abs()), today)
}

/// F1 slow path of [`ball_ball_time_in`] (defining vector Δc2): today's
/// root stays only inside τ_H; otherwise the rescaled exact quartic answers.
#[cold]
#[inline(never)]
fn pair_underflow(
    a: &PosPoly,
    b: &PosPoly,
    rsum: f64,
    t_min: f64,
    hi: f64,
    k: &[f64; 5],
    today: Option<f64>,
) -> Option<f64> {
    let ca = a.c2 - b.c2;
    let lead = ca.x.abs().max(ca.y.abs()).max(ca.z.abs());
    let Some(s) = exact_quartic_scale(k, lead, today) else {
        return today;
    };
    let (cas, cbs, cc) = (ca * s * s, (a.c1 - b.c1) * s, a.c0 - b.c0);
    let ks = ball_ball_quartic_from(cas, cbs, cc, rsum);
    let sk = pair_term_sums(cas, cbs, cc, rsum);
    let roots = rescaled_roots(&ks, t_min / s);
    roots_adapter::ball_ball(&ks, rsum, t_min / s, hi / s)
        .and_then(|x| f1_accept(k, &ks, &sk, roots.as_slice(), x, s, today))
}

/// F1 slow path of [`ball_pocket_time_in`] (defining vector c2.xy).
#[cold]
#[inline(never)]
fn pocket_underflow(
    p: &PosPoly,
    pocket: &Pocket,
    t_min: f64,
    hi: f64,
    k: &[f64; 5],
    today: Option<f64>,
) -> Option<f64> {
    let Some(s) = xy_exact_quartic_scale(k, p, today) else {
        return today;
    };
    let ps = time_scaled(p, s);
    let ks = pocket_quartic(&ps, pocket);
    let sk = xy_term_sums(&ps, pocket.center.x, pocket.center.y, pocket.radius);
    let roots = rescaled_roots(&ks, t_min / s);
    roots_adapter::pocket(&ks, pocket.radius, t_min / s, hi / s)
        .and_then(|x| f1_accept(k, &ks, &sk, roots.as_slice(), x, s, today))
}

/// F1 slow path of one jaw-arc surface ([`circular_surface`]): the same
/// selection on the rescaled path, with the speed gate in original units.
#[cold]
#[inline(never)]
fn circular_underflow(
    p: &PosPoly,
    arc: &CircularCushionSegment,
    d_r: f64,
    t_min: f64,
    reentry: bool,
    k: &[f64; 5],
    today: Option<f64>,
) -> Option<f64> {
    let Some(s) = xy_exact_quartic_scale(k, p, today) else {
        return today;
    };
    let ps = time_scaled(p, s);
    let (ks, ts) = (circular_cushion_quartic(&ps, arc, d_r), t_min / s);
    let (roots, sigma) = if reentry {
        let roots = roots_adapter::circular_reentry(&ks, ts);
        let sigma =
            roots_adapter::first_valid(&roots, ts, |x| seat_reentry_circle_hit(&ps, arc, x, s));
        (roots, sigma)
    } else {
        let roots = roots_adapter::circular_cushion(&ks, ts);
        let sigma = roots_adapter::first_valid(&roots, ts, |x| inward_circle_hit(&ps, arc, x));
        (roots, sigma)
    };
    let sk = xy_term_sums(&ps, arc.center.x, arc.center.y, arc.radius + d_r);
    sigma.and_then(|x| f1_accept(k, &ks, &sk, roots.as_slice(), x, s, today))
}

/// F1 slow path of [`ball_linear_cushion_time_airborne`] (defining vector
/// c2.z).
#[cold]
#[inline(never)]
fn capsule_underflow(
    p: &PosPoly,
    seg: &LinearCushionSegment,
    r: f64,
    t_min: f64,
    k: &[f64; 5],
    today: Option<f64>,
) -> Option<f64> {
    let Some(s) = exact_quartic_scale(k, p.c2.z.abs(), today) else {
        return today;
    };
    let ps = time_scaled(p, s);
    let (ks, ts) = (nose_capsule_quartic(&ps, seg, r), t_min / s);
    let sk = capsule_term_sums(&ps, seg, r);
    let roots = roots_adapter::airborne_nose(&ks, ts);
    roots_adapter::first_valid(&roots, ts, |sigma| {
        quartic_at(&ks, sigma).1 < 0.0 && within_span(&ps, seg, sigma)
    })
    .and_then(|x| f1_accept(k, &ks, &sk, roots.as_slice(), x, s, today))
}

/// All roots of the rescaled quartic `ks` in (lo, +∞), ascending: the
/// neighbours that bound the F1 certificate's probes (pair and pocket select
/// through the D-6 adapter, which reports only the chosen root).
fn rescaled_roots(ks: &[f64; 5], lo: f64) -> WindowRoots {
    kroots::real_roots_in(&[ks[4], ks[3], ks[2], ks[1], ks[0]], lo, f64::INFINITY)
}

/// F1 acceptance of a rescaled-path root σ (τ = σ·s): inside τ_H of the
/// original coefficients `k`, or a certified sign change of the exact quartic
/// across σ (rescaled coefficients `ks`, builder term sums `sk`, the rescaled
/// quartic's roots `roots`; see the section note and
/// [`certified_sign_change`]).
/// A certified far contact keeps `today`'s root when it lies in the certified
/// bracket (the same genuine contact at the certificate's resolution; such far
/// roots are representation-limited either way): bit-identical to today.
fn f1_accept(
    k: &[f64; 5],
    ks: &[f64; 5],
    sk: &[f64; 5],
    roots: &[f64],
    sigma: f64,
    s: f64,
    today: Option<f64>,
) -> Option<f64> {
    let tau = unscale(sigma, s)?;
    if within_horizon(k, tau) {
        return Some(tau);
    }
    let (lo, hi) = certified_sign_change(ks, sk, roots, sigma)?;
    match today {
        Some(t) if t >= lo * s && t <= hi * s => Some(t),
        _ => Some(tau),
    }
}

/// True iff the exact quartic changes sign across σ, between the outside
/// probe σ − min(2^-6·σ, (σ − σ_prev)/2) and the inside probe
/// σ + min(2^-6·σ, (σ_next − σ)/2), where σ_prev and σ_next are the
/// neighbouring roots of the rescaled quartic (none: the 2^-6·σ cap). A
/// genuine entry/exit pair narrower than 2^-6·σ thus keeps its inside probe
/// within the dip. Each rescaled coefficient is within 16u·S_k of the exact
/// one (S_k = its builder's sum of term magnitudes; at most eight roundings
/// per term) and Horner evaluation adds at most γ_8·Σ|ĉ_k|·x^k ≤
/// 9u·Σ|ĉ_k|·x^k, so a probe whose value exceeds both carries the exact
/// quartic's sign, and opposite certified signs prove an exact root between
/// the probes (a spurious root can never pass). Overflow fails the test.
/// Returns the probe bracket (σ units) when certified.
fn certified_sign_change(
    ks: &[f64; 5],
    sk: &[f64; 5],
    roots: &[f64],
    sigma: f64,
) -> Option<(f64, f64)> {
    let probe = |x: f64| {
        let (mut v, mut mag, mut rep) = (0.0, 0.0, 0.0);
        for i in 0..5 {
            v = v * x + ks[i];
            mag = mag * x + ks[i].abs();
            rep = rep * x + sk[i];
        }
        let err = (16.0 * rep + 9.0 * mag) * (0.5 * f64::EPSILON) * (1.0 + 1.0 / 1024.0);
        (v, err)
    };
    let cap = sigma * (1.0 / 64.0);
    let prev = roots.iter().copied().rev().find(|&r| r < sigma);
    let next = roots.iter().copied().find(|&r| r > sigma);
    let below = prev.map_or(cap, |r| cap.min(0.5 * (sigma - r)));
    let above = next.map_or(cap, |r| cap.min(0.5 * (r - sigma)));
    let (lo, hi) = (sigma - below, sigma + above);
    let (v0, e0) = probe(lo);
    let (v1, e1) = probe(hi);
    let certified = e0.is_finite()
        && e1.is_finite()
        && v0.abs() > e0
        && v1.abs() > e1
        && (v0 > 0.0) != (v1 > 0.0);
    certified.then_some((lo, hi))
}

/// Term-magnitude sums S_k of [`ball_ball_quartic_from`] (`[S4..S0]`).
fn pair_term_sums(ca: Vec3, cb: Vec3, cc: Vec3, rsum: f64) -> [f64; 5] {
    let absdot = |x: Vec3, y: Vec3| (x.x * y.x).abs() + (x.y * y.y).abs() + (x.z * y.z).abs();
    [
        ca.dot(ca),
        2.0 * absdot(ca, cb),
        cb.dot(cb) + 2.0 * absdot(ca, cc),
        2.0 * absdot(cb, cc),
        cc.dot(cc) + rsum * rsum,
    ]
}

/// Term-magnitude sums S_k of [`xy_cylinder_quartic`] (`[S4..S0]`).
fn xy_term_sums(p: &PosPoly, cx: f64, cy: f64, dist: f64) -> [f64; 5] {
    let (ax, ay) = (p.c2.x.abs(), p.c2.y.abs());
    let (bx, by) = (p.c1.x.abs(), p.c1.y.abs());
    let (px, py) = (p.c0.x.abs(), p.c0.y.abs());
    let (gx, gy) = (px + cx.abs(), py + cy.abs());
    [
        0.5 * (ax * ax + ay * ay),
        ax * bx + ay * by,
        ax * gx + ay * gy + 0.5 * (bx * bx + by * by),
        bx * gx + by * gy,
        0.5 * (cx * cx + cy * cy + px * px + py * py + dist * dist) + px * cx.abs() + py * cy.abs(),
    ]
}

/// Term-magnitude sums S_k of [`nose_capsule_quartic`] (`[S4..S0]`); the
/// axis projections q are bounded by |w_x| + |w_y| (|û| = 1).
fn capsule_term_sums(p: &PosPoly, seg: &LinearCushionSegment, r: f64) -> [f64; 5] {
    let (wx0, wx1) = ((p.c0.x - seg.p1.x).abs(), p.c1.x.abs());
    let (wy0, wy1) = ((p.c0.y - seg.p1.y).abs(), p.c1.y.abs());
    let (wz0, wz1, wz2) = ((p.c0.z - seg.height).abs(), p.c1.z.abs(), p.c2.z.abs());
    let (q0, q1) = (wx0 + wy0, wx1 + wy1);
    [
        wz2 * wz2,
        2.0 * wz1 * wz2,
        wx1 * wx1 + wy1 * wy1 + wz1 * wz1 + 2.0 * wz0 * wz2 + q1 * q1,
        2.0 * (wx0 * wx1 + wy0 * wy1 + wz0 * wz1 + q0 * q1),
        wx0 * wx0 + wy0 * wy0 + wz0 * wz0 + q0 * q0 + r * r,
    ]
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
    ball_ball_time_in(a, b, ra, rb, t_min, f64::INFINITY)
}

/// Pair query with an inclusive trajectory-validity horizon. Immediate
/// contact guards retain their original behavior, including at t_min.
pub fn ball_ball_time_in(
    a: &PosPoly,
    b: &PosPoly,
    ra: f64,
    rb: f64,
    t_min: f64,
    _hi: f64,
) -> Option<f64> {
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
    let mut t = roots_adapter::ball_ball(&k, rsum, t_min, _hi);
    if !lead_represented(k[0]) {
        t = pair_underflow(a, b, rsum, t_min, _hi, &k, t);
    }
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
    let mut t = first_valid_refined(
        &roots_adapter::linear_cushion(a, b, c, t_min),
        t_min,
        |tau| valid_linear_hit(p, seg, tau),
        |tau| plane_keep(p, seg, r, 0.0, t_min, tau),
        || plane_residual(p, seg, r, 0.0),
        |tau| plane_window(p, seg, [a, b, c], r, 0.0, tau),
    );
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
    // ([`seat_reentry_linear_hit`]) — the same velocity gate the at-contact
    // guard applies, and what bounds the restitution ladder.
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
        let (lx, ly, _) = seg.line_coeffs();
        let reentry = |pen: f64| {
            let cp = c + pen;
            first_valid_refined(
                &roots_adapter::linear_reentry(a, b, cp, t_min),
                t_min,
                |tau| seat_reentry_linear_hit(p, seg, lx, ly, tau),
                |tau| plane_keep(p, seg, r, pen, t_min, tau),
                || plane_residual(p, seg, r, pen),
                |tau| plane_window(p, seg, [a, b, cp], r, pen, tau),
            )
        };
        let t_seat = reentry(seat_pen);
        let t_floor = reentry(under_nose_band);
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



#[cfg(test)]
mod roots_integration_tests {
    use super::*;

    fn path(x: f64, y: f64, vx: f64) -> PosPoly {
        PosPoly {
            c0: Vec3::new(x, y, 1.0 / 32.0),
            c1: Vec3::new(vx, 0.0, 0.0),
            c2: Vec3::ZERO,
        }
    }

    #[test]
    fn d6_pair_screen_is_in_metres() {
        let moving = path(-0.125, 0.0, 1.0);
        for (gap, expected) in [(0.0, Some(0.125)), (0.5e-12, Some(0.125)), (2e-12, None)] {
            let fixed = path(0.0, 1.0 / 16.0 + gap, 0.0);
            assert_eq!(
                ball_ball_time(&moving, &fixed, 1.0 / 32.0, 1.0 / 32.0, Eps::TIME),
                expected
            );
        }
    }

    /// K-fix F2 tallies over the registered residual rows and the coverage
    /// rows of `tests/data/kfix` (printed): evaluations per refinement and how
    /// it ended. Asserts the hard cap of [`refine::MAX_EVALS`] evaluations.
    #[test]
    fn kfix_refine_tallies_and_cap() {
        let mut report = Vec::new();
        for file in ["inputs-f2.json", "inputs-cov.json"] {
            let _ = refine::stats::take();
            for (_, a) in kfix_rows(file) {
                let _ = kfix_run(&a);
            }
            let (evals, how) = refine::stats::take();
            assert!(
                evals[(refine::MAX_EVALS as usize + 1)..]
                    .iter()
                    .all(|&n| n == 0),
                "{file}: cap exceeded {evals:?}"
            );
            report.push(format!("{file}: evaluations per refinement {:?}; outcomes (t0 kept, 1-step Newton, later cert1, later cert2, bracket, keep, outside) {:?}", &evals[..=8], how));
        }
        println!("{}", report.join("\n"));
    }

    fn kfix_unhex(v: &serde_json::Value) -> f64 {
        f64::from_bits(u64::from_str_radix(v.as_str().unwrap(), 16).unwrap())
    }

    /// (id, args) of a K-fix plant input file.
    fn kfix_rows(file: &str) -> Vec<(String, serde_json::Value)> {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/data/kfix");
        let text = std::fs::read_to_string(dir.join(file)).unwrap();
        let rows: serde_json::Value = serde_json::from_str(&text).unwrap();
        rows.as_array()
            .unwrap()
            .iter()
            .map(|r| (r["id"].as_str().unwrap().to_string(), r["args"].clone()))
            .collect()
    }

    /// One cushion detect call as the plants make it (None for other adapters).
    fn kfix_run(a: &serde_json::Value) -> Option<Option<f64>> {
        let f: Vec<f64> = a["f"].as_array().unwrap().iter().map(kfix_unhex).collect();
        let p = PosPoly {
            c0: Vec3::new(f[0], f[1], f[2]),
            c1: Vec3::new(f[3], f[4], f[5]),
            c2: Vec3::new(f[6], f[7], f[8]),
        };
        let span = a["span"].as_array().map(|s| crate::table::ArcSpan {
            start: kfix_unhex(&s[0]),
            sweep: kfix_unhex(&s[1]),
        });
        let arc = || CircularCushionSegment {
            center: Vec3::new(f[9], f[10], f[11]),
            radius: f[12],
            height: f[13],
            span,
        };
        let seg = || LinearCushionSegment {
            p1: Vec3::new(f[9], f[10], f[11]),
            p2: Vec3::new(f[12], f[13], f[14]),
            height: f[15],
        };
        Some(match a["adapter"].as_str().unwrap() {
            "ball_circular_cushion_time" => {
                ball_circular_cushion_time(&p, &arc(), f[14], f[15], f[16])
            }
            "ball_circular_cushion_time_airborne" => {
                ball_circular_cushion_time_airborne(&p, &arc(), f[14], f[15], f[16])
            }
            "ball_linear_cushion_time" => ball_linear_cushion_time(&p, &seg(), f[16], f[17], f[18]),
            "ball_linear_cushion_time_airborne" => {
                ball_linear_cushion_time_airborne(&p, &seg(), f[16], f[17])
            }
            _ => return None,
        })
    }

    /// The plant sets that reach the pre-filter.
    const KFIX_PRE_SETS: [(&str, &str); 5] = [
        ("f2", "inputs-f2.json"),
        ("cov", "inputs-cov.json"),
        ("k2", "inputs-k2.json"),
        ("f3", "inputs-f3.json"),
        ("f3b", "inputs-f3b.json"),
    ];

    /// The 3 regression phantom contacts (F3 plant (a)), tightest first.
    const KFIX_REGRESSION_PHANTOMS: [&str; 3] = [
        "band/ball_linear_cushion_time/60633",
        "band/ball_linear_cushion_time/65165",
        "band/ball_circular_cushion_time/4176",
    ];

    /// Every pre-filter call of every plant row: (key, output, calls).
    #[allow(clippy::type_complexity)]
    fn kfix_pre_calls() -> Vec<(String, Option<f64>, Vec<(u8, f64, f64, u8)>)> {
        let mut out = Vec::new();
        for (set, file) in KFIX_PRE_SETS {
            for (id, a) in kfix_rows(file) {
                let _ = refine::stats::pre_take();
                let Some(got) = kfix_run(&a) else {
                    continue;
                };
                out.push((format!("{set}:{id}"), got, refine::stats::pre_take()));
            }
        }
        out
    }

    fn kfix_hex(x: f64) -> String {
        format!("{:016x}", x.to_bits())
    }

    /// The key of one kept pre-filter call (row, surface, offset, t0).
    fn kfix_pre_key(row: &str, call: &(u8, f64, f64, u8)) -> String {
        format!("{row}|{}|{}|{}", call.0, kfix_hex(call.1), kfix_hex(call.2))
    }

    /// Writes every kept pre-filter call for the exact oracle
    /// (`kfix_prepare.py pre`), which produces `expect-pre.json`.
    #[test]
    #[ignore = "writes the pre-filter keep list for the exact oracle"]
    fn kfix_prefilter_capture() {
        let path = std::env::var("KFIX_PRE_OUT").expect("KFIX_PRE_OUT");
        let mut keeps = Vec::new();
        for (key, _, calls) in kfix_pre_calls() {
            for c in calls.iter().filter(|c| c.3 == refine::PRE_KEEP) {
                keeps.push(serde_json::json!({
                    "key": kfix_pre_key(&key, c),
                    "row": key,
                    "surface": c.0,
                    "neg_pen": kfix_hex(c.1),
                    "t0": kfix_hex(c.2),
                }));
            }
        }
        std::fs::write(path, serde_json::to_string_pretty(&keeps).unwrap()).unwrap();
    }

    /// (i′) plants. (i) Every t0 the pre-filter keeps on the F2, coverage,
    /// round-2 and F3 rows has an EXACT surface gap within the floor
    /// 64u·M_pos(t0) (exact oracle, `expect-pre.json`); the keep list must
    /// match the oracle's list exactly. (ii) Near-tangent refusals: on the
    /// phantom rows (no exact crossing) the crossing test (b) refuses every
    /// call that passes the gap test (a), and those rows still end None (F3).
    #[test]
    fn kfix_prefilter_plants() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/data/kfix");
        let expect: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(dir.join("expect-pre.json")).unwrap())
                .unwrap();
        let expect = expect.as_object().unwrap();
        let mut kept: std::collections::BTreeMap<&str, (usize, usize)> = Default::default();
        let (mut n_keep, mut gap_ok_cross_refused, mut phantom_calls) = (0, 0, 0);
        let mut regression = Vec::new();
        for (key, got, calls) in kfix_pre_calls() {
            let set = KFIX_PRE_SETS
                .iter()
                .map(|s| s.0)
                .find(|s| key.starts_with(&format!("{s}:")))
                .unwrap();
            let e = kept.entry(set).or_default();
            e.1 += calls.len();
            for c in &calls {
                if c.3 == refine::PRE_KEEP {
                    let k = kfix_pre_key(&key, c);
                    let ok = expect.get(&k).and_then(|v| v["ok"].as_bool());
                    assert_eq!(ok, Some(true), "(i) {k}: kept without an exact floor check");
                    e.0 += 1;
                    n_keep += 1;
                }
            }
            if set == "f3" {
                phantom_calls += calls.len();
                assert!(
                    calls.iter().all(|c| c.3 != refine::PRE_KEEP),
                    "(ii) {key}: a phantom contact was kept"
                );
                gap_ok_cross_refused += calls.iter().filter(|c| c.3 == refine::PRE_CROSS).count();
                assert_eq!(got, None, "(ii) {key}: phantom contact not rejected");
                if KFIX_REGRESSION_PHANTOMS
                    .iter()
                    .any(|r| key == format!("f3:{r}"))
                {
                    regression.push((key.clone(), calls.iter().map(|c| c.3).collect::<Vec<_>>()));
                }
            }
        }
        assert_eq!(
            n_keep,
            expect.len(),
            "keep list differs from expect-pre.json"
        );
        // (ii) The tightest regression phantom (exact minimum gap 1.2e-18 m:
        // |g| at t0 far below floor_lo/8, G′ ≈ 0 there) passes the gap test
        // and the crossing test must refuse it, so F2/F3 run and reject it.
        assert_eq!(regression.len(), 3, "{regression:?}");
        assert!(
            regression[0].1.contains(&refine::PRE_CROSS),
            "(ii) {:?}: the crossing test did not refuse after the gap test passed",
            regression[0]
        );
        println!(
            "(i′) plants: {n_keep} kept t0 all within the exact floor; per set (kept, calls) {kept:?}; \
             (ii) phantom rows: {phantom_calls} calls, {gap_ok_cross_refused} refused by the crossing test after passing the gap test; \
             regression phantoms (verdicts 1 = gap test failed, 2 = crossing test refused): {regression:?}"
        );
    }

    #[test]
    fn f1_scale_helpers_cover_normal_and_subnormal_leads() {
        assert_eq!(binary_exponent(1.0), 0);
        assert_eq!(binary_exponent(1e-300), -997);
        assert_eq!(binary_exponent(f64::MIN_POSITIVE), -1022);
        assert_eq!(binary_exponent(f64::from_bits(1)), -1074);
        assert_eq!(pow2(-1022), f64::MIN_POSITIVE);
        for lead in [1e-155, 1e-300, f64::from_bits(1)] {
            let k = [0.0, 1.0, 1.0, 1.0, 1.0];
            let s = exact_quartic_scale(&k, lead, None).expect("underflow class");
            let scaled = lead * s * s;
            assert!((pow2(-400)..pow2(-398)).contains(&scaled), "{lead:e}");
        }
        // A normal leading coefficient never takes the F1 path.
        assert_eq!(
            exact_quartic_scale(&[1e-300, 1.0, 1.0, 1.0, 1.0], 1e-150, None),
            None
        );
        // Inside the horizon today's root is kept; far beyond it is not.
        let k = [0.0, -2e-300, 1.0, -1.0, 0.25];
        assert!(within_horizon(&k, 0.5));
        assert!(!within_horizon(&k, 5e299));
    }

    #[test]
    fn d6_grounded_disc_uses_pocket_radius_and_half_scaled_polynomial() {
        let pocket = Pocket {
            center: Vec3::ZERO,
            radius: 1.0 / 16.0,
        };
        for (gap, expected) in [(0.0, Some(0.125)), (0.5e-12, Some(0.125)), (2e-12, None)] {
            let p = path(-0.125, pocket.radius + gap, 1.0);
            assert_eq!(ball_pocket_time(&p, &pocket, Eps::TIME), expected);
        }
    }

    #[test]
    fn d6_straight_wall_tangent_requires_strict_inward_motion() {
        let radius = 1.0 / 32.0;
        let seg = LinearCushionSegment {
            p1: Vec3::new(1.0, 1.0, 0.0),
            p2: Vec3::new(-1.0, 1.0, 0.0),
            height: 0.04,
        };
        // Signed gap is (t-1/4)^2: exact tangency, with zero inward speed.
        let p = PosPoly {
            c0: Vec3::new(0.0, 1.0 - radius - 0.0625, radius),
            c1: Vec3::new(0.0, 0.5, 0.0),
            c2: Vec3::new(0.0, -1.0, 0.0),
        };
        assert_eq!(
            ball_linear_cushion_time(&p, &seg, radius, Eps::TIME, 0.0),
            None
        );
    }
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
/// ON the arc's angular span ([`inward_circle_hit`]), never the
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
        && arc.contains_angle(libm::atan2(p.c0.y - arc.center.y, p.c0.x - arc.center.x))
    {
        return Some(t_min);
    }
    let mut t = circular_surface(p, arc, r, 0.0, t_min, false);
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
        let t_seat = circular_surface(p, arc, r, seat_pen, t_min, true);
        let t_floor = circular_surface(p, arc, r, under_nose_band, t_min, true);
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

/// One jaw-arc contact surface at center distance `arc.radius + r − pen`:
/// the inward entry crossing (S5, pen = 0) or, with `reentry`, the in-band
/// seat/floor crossing behind the [`REST_APPROACH`] radial-speed gate
/// (S6/S7). F3 and F2 apply on the represented path; F1 reruns the plain
/// selection on the rescaled path, with the speed gate in original units.
fn circular_surface(
    p: &PosPoly,
    arc: &CircularCushionSegment,
    r: f64,
    pen: f64,
    t_min: f64,
    reentry: bool,
) -> Option<f64> {
    let d_r = r - pen;
    let k = circular_cushion_quartic(p, arc, d_r);
    let window = |tau: f64| {
        refine::root_window(
            &k,
            &xy_term_sums(p, arc.center.x, arc.center.y, arc.radius + d_r),
            tau,
        )
    };
    let residual = || arc_residual(p, arc, r, pen);
    let t = if reentry {
        let roots = roots_adapter::circular_reentry(&k, t_min);
        first_valid_refined(
            &roots,
            t_min,
            |tau| seat_reentry_circle_hit(p, arc, tau, 1.0),
            |tau| arc_keep(p, arc, r, pen, t_min, tau),
            residual,
            window,
        )
    } else {
        let roots = roots_adapter::circular_cushion(&k, t_min);
        first_valid_refined(
            &roots,
            t_min,
            |tau| inward_circle_hit(p, arc, tau),
            |tau| arc_keep(p, arc, r, pen, t_min, tau),
            residual,
            window,
        )
    };
    if lead_represented(k[0]) {
        return t;
    }
    circular_underflow(p, arc, d_r, t_min, reentry, &k, t)
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
    let mut best = first_valid_refined(
        &roots_adapter::airborne_nose(&k, t_min),
        t_min,
        |tau| quartic_at(&k, tau).1 < 0.0 && within_span(p, seg, tau),
        |tau| {
            let (p1, p2) = ([seg.p1.x, seg.p1.y], [seg.p2.x, seg.p2.y]);
            let c = |v: Vec3| [v.x, v.y, v.z];
            let (c0, c1, c2) = (c(p.c0), c(p.c1), c(p.c2));
            refine::pre_capsule(c0, c1, c2, p1, p2, seg.height, r, tau, t_min) == refine::PRE_KEEP
        },
        || {
            let (p1, p2) = ([seg.p1.x, seg.p1.y], [seg.p2.x, seg.p2.y]);
            let c = |v: Vec3| [v.x, v.y, v.z];
            refine::Residual::capsule(c(p.c0), c(p.c1), c(p.c2), p1, p2, seg.height, r)
        },
        |tau| refine::root_window(&k, &capsule_term_sums(p, seg, r), tau),
    );
    if !lead_represented(k[0]) {
        best = capsule_underflow(p, seg, r, t_min, &k, best);
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
                && arc.contains_angle(libm::atan2(p.c0.y - arc.center.y, p.c0.x - arc.center.x))
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
        && arc.contains_angle(libm::atan2(p.c0.y - arc.center.y, p.c0.x - arc.center.x))
    {
        return Some(t_min);
    }
    // Quadratic |xy(τ) − center|² = contact² (linear xy motion).
    let (gx, gy) = (p.c0.x - arc.center.x, p.c0.y - arc.center.y);
    let (bx, by) = (p.c1.x, p.c1.y);
    let a2 = bx * bx + by * by;
    let a1 = 2.0 * (gx * bx + gy * by);
    let a0 = gx * gx + gy * gy - contact * contact;
    first_valid_refined(
        &roots_adapter::airborne_jaw(a2, a1, a0, t_min),
        t_min,
        |tau| {
            let inward = a1 + 2.0 * a2 * tau < 0.0;
            let z = p.c0.z + p.c1.z * tau + p.c2.z * (tau * tau);
            let on_span = arc.contains_angle(libm::atan2(gy + by * tau, gx + bx * tau));
            inward && z <= arc.height && on_span
        },
        |tau| arc_keep(p, arc, r, 0.0, t_min, tau),
        || arc_residual(p, arc, r, 0.0),
        |tau| {
            let sk = [
                0.0,
                0.0,
                bx * bx + by * by,
                2.0 * ((gx * bx).abs() + (gy * by).abs()),
                gx * gx + gy * gy + contact * contact,
            ];
            refine::root_window(&[0.0, 0.0, a2, a1, a0], &sk, tau)
        },
    )
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
    ball_pocket_time_in(p, pocket, t_min, f64::INFINITY)
}

/// Grounded-pocket query with an inclusive trajectory-validity horizon.
/// The point-of-no-return and immediate-contact guards are unchanged.
pub fn ball_pocket_time_in(p: &PosPoly, pocket: &Pocket, t_min: f64, _hi: f64) -> Option<f64> {
    let (rho, approach) = xy_gap_and_approach(p, pocket.center.x, pocket.center.y);
    let gap = rho - pocket.radius;
    if gap <= 0.0 || (approach > REST_APPROACH && gap <= approach * t_min) {
        return Some(t_min);
    }
    let k = pocket_quartic(p, pocket);
    let mut t = roots_adapter::pocket(&k, pocket.radius, t_min, _hi);
    if !lead_represented(k[0]) {
        t = pocket_underflow(p, pocket, t_min, _hi, &k, t);
    }
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
fn earliest_valid_linear_root(
    p: &PosPoly,
    seg: &LinearCushionSegment,
    roots: &WindowRoots,
    t_min: f64,
) -> Option<f64> {
    roots_adapter::first_valid(roots, t_min, |tau| valid_linear_hit(p, seg, tau))
}

/// Seat/floor re-entry validator of a linear cushion: the [`REST_APPROACH`]
/// plane-normal speed gate plus [`valid_linear_hit`] (`(lx, ly)` =
/// [`LinearCushionSegment::line_coeffs`]).
fn seat_reentry_linear_hit(
    p: &PosPoly,
    seg: &LinearCushionSegment,
    lx: f64,
    ly: f64,
    tau: f64,
) -> bool {
    let approach = -(lx * (p.c1.x + 2.0 * p.c2.x * tau) + ly * (p.c1.y + 2.0 * p.c2.y * tau));
    approach > REST_APPROACH && valid_linear_hit(p, seg, tau)
}

/// Entry validator of a jaw arc: moving inward (g·v < 0) on the angular span.
fn inward_circle_hit(p: &PosPoly, arc: &CircularCushionSegment, tau: f64) -> bool {
    let pos = poly_at(p, tau);
    let (gx, gy) = (pos.x - arc.center.x, pos.y - arc.center.y);
    let (vx, vy) = (p.c1.x + 2.0 * p.c2.x * tau, p.c1.y + 2.0 * p.c2.y * tau);
    gx * vx + gy * vy < 0.0 && arc.contains_angle(libm::atan2(gy, gx))
}

/// Seat/floor re-entry validator of a jaw arc (radial-speed gate). `vscale`
/// is the F1 time scale of `p` (1.0 on the unscaled path): a rescaled path's
/// velocities are `vscale` times the original ones, so the gate compares
/// against `REST_APPROACH·rho·vscale` (bit-identical for 1.0).
fn seat_reentry_circle_hit(
    p: &PosPoly,
    arc: &CircularCushionSegment,
    tau: f64,
    vscale: f64,
) -> bool {
    let pos = poly_at(p, tau);
    let (gx, gy) = (pos.x - arc.center.x, pos.y - arc.center.y);
    let rho = libm::sqrt(gx * gx + gy * gy);
    let (vx, vy) = (p.c1.x + 2.0 * p.c2.x * tau, p.c1.y + 2.0 * p.c2.y * tau);
    gx * vx + gy * vy < -REST_APPROACH * rho * vscale && arc.contains_angle(libm::atan2(gy, gx))
}

// ---- F2/F3: certified geometric refinement of cushion times (K-fix) ----
//
// The represented decision stays today's: the first root > t_min of the
// binary64 polynomial that passes the surface's unchanged validator. F3 is the
// one exception: a candidate whose exact residual is certified OUTSIDE at the
// root and at every probe of the refinement search (refine::Refined::Outside:
// no crossing near a near-tangent candidate) is rejected, exactly as a failed
// validator, only if refine::certified_positive proves the exact gap positive
// over the whole represented dip [t_a, t_b] widened by the root-error window,
// with the gap's minimiser certified inside that interval (so the certificate
// covers the exact dip itself); otherwise the candidate stays. F2 replaces the
// selected root by a time certified within one ulp of an exact crossing
// (refine::refine) that also passes the caller's full validator, or keeps
// it. The residual (exact geometry) and the window are built only once a
// validated root exists, so paths returning None or Some(t_min) do no extra
// work, and F3's dip analysis runs only in the Outside state.

/// Cushion candidate selection with the (i′) pre-filter, F3 and F2 (see the
/// section note). `keep` is the binary64 pre-filter of the same surface. The
/// scan for the first validated root stays inline (today's selection); the
/// pre-filter, refinement and F3 run out of line ([`select_refined`]) so the
/// callers' hot no-candidate path carries none of their register pressure.
#[inline]
fn first_valid_refined(
    roots: &WindowRoots,
    t_min: f64,
    mut valid: impl FnMut(f64) -> bool,
    keep: impl Fn(f64) -> bool,
    residual: impl Fn() -> refine::Residual,
    window: impl Fn(f64) -> f64,
) -> Option<f64> {
    let rs = roots.as_slice();
    let i = rs.iter().position(|&t| t > t_min && valid(t))?;
    select_refined(rs, i, t_min, valid, keep, residual, window)
}

/// The validated root `rs[i]` and any later candidates (after an F3
/// rejection): pre-filter, F2, F3 (see [`first_valid_refined`]).
#[inline(never)]
fn select_refined(
    rs: &[f64],
    first: usize,
    t_min: f64,
    mut valid: impl FnMut(f64) -> bool,
    keep: impl Fn(f64) -> bool,
    residual: impl Fn() -> refine::Residual,
    window: impl Fn(f64) -> f64,
) -> Option<f64> {
    let mut res: Option<refine::Residual> = None;
    for (i, &t) in rs.iter().enumerate().skip(first) {
        if i > first && !(t > t_min && valid(t)) {
            continue;
        }
        // (i′): t passed the validator; a certified gap within floor_lo/8
        // with a certified crossing near t keeps it before any double-double
        // work.
        if keep(t) {
            return Some(t);
        }
        let g = *res.get_or_insert_with(&residual);
        match refine::refine(&g, t, t_min, || window(t)) {
            // The refined time must pass the caller's full validator too (jaw
            // height, segment span, arc angle span, approach): near such a
            // boundary valid(t) does not imply valid(x). Else t stays.
            refine::Refined::Root(x) => return Some(if x == t || valid(x) { x } else { t }),
            refine::Refined::Keep => return Some(t),
            refine::Refined::Outside => {
                // F3: the represented dip [t, t_b] (t_b = the exit root; a
                // double root when none is listed), widened by the window.
                let t_b = rs.get(i + 1).copied().unwrap_or(t);
                let lo = (t - window(t)).max(t_min);
                if !refine::certified_positive(&g, lo, t_b + window(t_b)) {
                    return Some(t);
                }
            }
        }
    }
    None
}

/// (i′) pre-filter of a linear cushion plane at distance r − pen.
fn plane_keep(
    p: &PosPoly,
    seg: &LinearCushionSegment,
    r: f64,
    pen: f64,
    t_min: f64,
    tau: f64,
) -> bool {
    refine::pre_plane(
        [p.c0.x, p.c0.y],
        [p.c1.x, p.c1.y],
        [p.c2.x, p.c2.y],
        [seg.p1.x, seg.p1.y],
        [seg.p2.x, seg.p2.y],
        [r, -pen],
        tau,
        t_min,
    ) == refine::PRE_KEEP
}

/// (i′) pre-filter of a jaw arc at centre distance arc.radius + r − pen.
fn arc_keep(
    p: &PosPoly,
    arc: &CircularCushionSegment,
    r: f64,
    pen: f64,
    t_min: f64,
    tau: f64,
) -> bool {
    refine::pre_circle(
        [p.c0.x, p.c0.y],
        [p.c1.x, p.c1.y],
        [p.c2.x, p.c2.y],
        [arc.center.x, arc.center.y],
        [arc.radius, r, -pen],
        tau,
        t_min,
    ) == refine::PRE_KEEP
}

/// Exact residual of a linear cushion plane at distance r − pen.
fn plane_residual(p: &PosPoly, seg: &LinearCushionSegment, r: f64, pen: f64) -> refine::Residual {
    refine::Residual::plane(
        [p.c0.x, p.c0.y],
        [p.c1.x, p.c1.y],
        [p.c2.x, p.c2.y],
        [seg.p1.x, seg.p1.y],
        [seg.p2.x, seg.p2.y],
        [r, -pen],
    )
}

/// Root-error window of a linear-cushion root: the represented quadratic
/// (a, b, c) with term sums bounded through |lx|, |ly| ≤ 1.
fn plane_window(
    p: &PosPoly,
    seg: &LinearCushionSegment,
    k: [f64; 3],
    r: f64,
    pen: f64,
    tau: f64,
) -> f64 {
    let sk = [
        0.0,
        0.0,
        p.c2.x.abs() + p.c2.y.abs(),
        p.c1.x.abs() + p.c1.y.abs(),
        p.c0.x.abs() + p.c0.y.abs() + seg.p1.x.abs() + seg.p1.y.abs() + r + pen.abs(),
    ];
    refine::root_window(&[0.0, 0.0, k[0], k[1], k[2]], &sk, tau)
}

/// Exact residual of a jaw arc at centre distance arc.radius + r − pen.
fn arc_residual(p: &PosPoly, arc: &CircularCushionSegment, r: f64, pen: f64) -> refine::Residual {
    refine::Residual::circle(
        [p.c0.x, p.c0.y],
        [p.c1.x, p.c1.y],
        [p.c2.x, p.c2.y],
        [arc.center.x, arc.center.y],
        [arc.radius, r, -pen],
    )
}

#[cfg(test)]
mod tests {
    //! Self-contained M3 tests (contract rule: no dependence on other
    //! modules' real physics). The M1 solvers are placeholders in this
    //! worktree, so root-solving tests use a local reference solver
    //! ([`ref_smallest_root`]: sign-change scan + bisection on the very
    //! coefficient arrays the production code hands to the root service)
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


    fn ref_quadratic_roots(a: f64, b: f64, c: f64) -> WindowRoots {
        // These tests validate geometry; production sites supply their own cutoff.
        kroots::real_roots_in(&[c, b, a, 0.0, 0.0], -f64::MAX, f64::INFINITY)
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
        // The represented constant is a rounding residual (|c| < 1e-15 above), so the real-root
        // service returns that polynomial's own root instead of the 0.0 the old formula cancelled
        // to. The claim is unchanged: the contact exists and lies at or below the cutoff that
        // rejected it.
        assert!(matches!(
            earliest_valid_linear_root(&p, &seg, &roots, -1.0),
            Some(t) if t <= TMIN
        ));
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
