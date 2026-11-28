// Copyright (c) Meta Platforms, Inc. and affiliates.

//! F12: certified decisions for the ordinary pair/pocket contact query
//! `kroots::earliest_root_in(c, lo, hi)`; see FILTERS.md for the operation
//! counts, outward bounds, deciding inequalities and equivalence argument.
//!
//! `earliest` returns Some(None) for a certified API-empty window,
//! Some(Some(t)) for the certified earliest representative, and None in every
//! other case, where the caller keeps the unchanged delivered query. Float
//! values only propose evaluation points; every decision is an outward or
//! exact-sign certificate. A returned time additionally requires the routing
//! predicate (route.rs): the delivered plain path must return before its root
//! search, so the delivered query reaches its correctly rounding exact path.

use super::screen::{self, Interval};
use super::stationary::{Polynomial, Wide};

/// 128u with u = 2^-53: the F0/F9 margin above the delivered 64u shadow band.
const MARGIN: f64 = 64.0 * f64::EPSILON;
/// Cost dispatch only, never a decision: attempt shallow minima with
/// |C(z)| < 2^32 u S(z), where the delivered query can need its exact path.
const SHALLOW: f64 = 4_294_967_296.0 * 0.5 * f64::EPSILON;
/// Cost dispatch only: |C(z)| < 2^16 u S(hi) flags the mirrored (ghost)
/// minimum beyond a finite window, which also sends the query to that path.
const GHOST: f64 = 65_536.0 * 0.5 * f64::EPSILON;
/// Relative half-width 2^-36 of the stationary bracket around the proposal.
const BRACKET: f64 = 1.0 / 68_719_476_736.0;

fn horner(c: &[f64; 5], t: f64) -> f64 {
    c[..4].iter().rev().fold(c[4], |v, &a| v * t + a)
}

/// Absolute term sum S(t) for t >= 0 (dispatch estimate only).
fn abs_sum(c: &[f64; 5], t: f64) -> f64 {
    c[..4]
        .iter()
        .rev()
        .fold(c[4].abs(), |v, &a| v * t + a.abs())
}

/// Outward upper bound of S(t) = sum |c_i| t^i at t >= 0.
fn abs_sum_upper(c: &[f64; 5], t: f64) -> f64 {
    let x = Interval::point(t);
    c[..4]
        .iter()
        .rev()
        .fold(Interval::point(c[4].abs()), |v, &a| {
            v.mul(x).add(Interval::point(a.abs()))
        })
        .hi
}

/// Outward enclosure of the EXACT derivative over x; 3*c3 is not rounded.
fn slope(c: &[f64; 5], x: Interval) -> Interval {
    let d = [
        Interval::point(c[1]),
        Interval::point(2.0).mul(Interval::point(c[2])),
        Interval::point(3.0).mul(Interval::point(c[3])),
        Interval::point(4.0).mul(Interval::point(c[4])),
    ];
    d[..3].iter().rev().fold(d[3], |v, &a| v.mul(x).add(a))
}

/// Strict sign of a Wide enclosure; 0 also covers an unavailable enclosure.
fn sign_of(w: Option<Wide>) -> i8 {
    w.map_or(0, Wide::sign)
}

/// F12 work classification (counters only; production keeps no state).
pub(super) enum Outcome {
    /// The cost dispatch did not attempt a certificate.
    Skipped,
    /// A certificate was attempted and deferred to the delivered query.
    Undecided,
    /// Certified: the delivered query's exact result.
    Decided(Option<f64>),
}

/// F12 entry; see the module documentation for the three outcomes.
pub(super) fn earliest(c: &[f64; 5], lo: f64, hi: f64) -> Option<Option<f64>> {
    match decide(c, lo, hi) {
        Outcome::Skipped => None,
        Outcome::Undecided => {
            screen::record(screen::CONTACT_UNDECIDED);
            None
        }
        Outcome::Decided(t) => {
            screen::record(if t.is_some() {
                screen::CONTACT_ROOT
            } else {
                screen::CONTACT_EMPTY
            });
            Some(t)
        }
    }
}

/// The unrecorded F12 decision (also used by the test-only screen-site
/// counterfactual in profile.rs).
pub(super) fn decide(c: &[f64; 5], lo: f64, hi: f64) -> Outcome {
    match certify(c, lo, hi) {
        None => Outcome::Skipped,
        Some(None) => Outcome::Undecided,
        Some(Some(t)) => Outcome::Decided(t),
    }
}

/// None: not attempted; Some(None): attempted, undecided; Some(Some(t)): decided.
#[allow(clippy::option_option)]
fn certify(c: &[f64; 5], lo: f64, hi: f64) -> Option<Option<Option<f64>>> {
    // Degree 3-4 only: the delivered quadratic route returns an uncertified
    // rounding (F-PROOF.md, quadratic isolated values).
    let n = if c[4] != 0.0 {
        4
    } else if c[3] != 0.0 {
        3
    } else {
        return None;
    };
    if !(lo >= 0.0 && hi > lo) || c[0] == 0.0 || c[2] <= 0.0 {
        return None;
    }
    // Proposal of the minimum near the crossing (as in F9/F11).
    let mut z = -c[1] / (2.0 * c[2]);
    for _ in 0..8 {
        let d = ((4.0 * c[4] * z + 3.0 * c[3]) * z + 2.0 * c[2]) * z + c[1];
        let q = (12.0 * c[4] * z + 6.0 * c[3]) * z + 2.0 * c[2];
        if q <= 0.0 {
            break;
        }
        let next = z - d / q;
        if !next.is_finite() || next == z {
            break;
        }
        z = next;
    }
    let curvature = (12.0 * c[4] * z + 6.0 * c[3]) * z + 2.0 * c[2];
    if !(z > lo && z.is_finite() && curvature > 0.0) {
        return None;
    }
    let value = horner(c, z);
    let ghost = if hi.is_finite() && hi > z {
        GHOST * abs_sum(c, hi)
    } else {
        0.0
    };
    if !(value.abs() < SHALLOW * abs_sum(c, z) || value.abs() < ghost) {
        return None;
    }
    Some(match Polynomial::new(c) {
        Some(p) if value < 0.0 => crossing(c, n, &p, z, value, curvature, lo, hi),
        Some(_) => empty(c, lo, hi),
        None => None,
    })
}

/// Root branch: certified simple minimum m with C(m) < -128u S(m), strictly
/// decreasing prefix [lo, m), the earliest root's rounding cell, and routing.
#[allow(clippy::too_many_arguments)]
fn crossing(
    c: &[f64; 5],
    n: usize,
    p: &Polynomial,
    z: f64,
    value: f64,
    curvature: f64,
    lo: f64,
    hi: f64,
) -> Option<Option<f64>> {
    // (1) Isolated simple minimum m in X: strict curvature on X and strict
    // opposite exact-derivative signs at its ends.
    let w = z * BRACKET;
    let x = Interval {
        lo: z - w,
        hi: z + w,
    };
    if !(x.lo > lo && x.lo < z && z < x.hi) {
        return None;
    }
    let bend = p.curvature(x);
    if !(bend.finite() && bend.lo > 0.0)
        || sign_of(p.derivative(Wide::point(x.lo))) >= 0
        || sign_of(p.derivative(Wide::point(x.hi))) <= 0
    {
        return None;
    }
    // (2) C(m) < -128u S(m): Taylor enclosure over X; S(m) <= S(X.hi).
    let dx = x.sub(Interval::point(z));
    let at_m = p
        .value(z)?
        .interval()
        .add(p.derivative(Wide::point(z))?.interval().mul(dx))
        .add(bend.mul(dx.mul(dx)).mul(Interval::point(0.5)));
    let band = (MARGIN * abs_sum_upper(c, x.hi)).next_up();
    if !(at_m.finite() && band.is_finite() && at_m.hi < -band) {
        return None;
    }
    // (3) C' < 0 on [lo, X.lo]: C is strictly decreasing there, so it has no
    // stationary point and at most one root before m.
    if !decreasing(c, p, lo, x.lo) {
        return None;
    }
    // (4) Proposal: quadratic estimate, then Newton with Wide values. The
    // proposal is never trusted; (5)-(6) certify the result.
    let mut r = z - libm::sqrt(-2.0 * value / curvature);
    for _ in 0..4 {
        if !(r > lo && r < x.lo) {
            return None;
        }
        let f = p.value(r)?.interval();
        let f = f.lo * 0.5 + f.hi * 0.5;
        let d = ((4.0 * c[4] * r + 3.0 * c[3]) * r + 2.0 * c[2]) * r + c[1];
        if d.is_nan() || d >= 0.0 {
            return None;
        }
        let next = r - f / d;
        if !next.is_finite() || next == r {
            break;
        }
        r = next;
    }
    // (5) Outward isolation: opposite strict signs on [a, b] inside the
    // decreasing prefix, then one interval Newton step with a strictly
    // negative derivative enclosure.
    let (mut a, mut b) = (r, r);
    for _ in 0..4 {
        a = a.next_down();
        b = b.next_up();
    }
    if !(a > lo && b < x.lo) || sign_of(p.value(a)) <= 0 || sign_of(p.value(b)) >= 0 {
        return None;
    }
    let isolating = Interval { lo: a, hi: b };
    let derivative = slope(c, isolating);
    if !(derivative.finite() && derivative.hi < 0.0) {
        return None;
    }
    let step = p.value(r)?.interval().div_positive(derivative.neg())?.neg();
    let newton = Interval::point(r).sub(step);
    let narrowed = Interval {
        lo: a.max(newton.lo),
        hi: b.min(newton.hi),
    };
    if !(narrowed.finite() && narrowed.lo <= narrowed.hi) {
        return None;
    }
    // (6) Correctly rounded value: strict signs at the exact dyadic edges of
    // the candidate's rounding cell; ties never decide.
    let center = narrowed.lo * 0.5 + narrowed.hi * 0.5;
    for t in [
        center,
        center.next_down(),
        center.next_up(),
        center.next_down().next_down(),
        center.next_up().next_up(),
    ] {
        let (previous, next) = (t.next_down(), t.next_up());
        if !(previous >= a && next <= b) {
            continue;
        }
        let left = Wide::point(previous)
            .add(Wide::point(t))?
            .mul(Wide::point(0.5))?;
        let right = Wide::point(t)
            .add(Wide::point(next))?
            .mul(Wide::point(0.5))?;
        if sign_of(p.value_at(left)) > 0 && sign_of(p.value_at(right)) < 0 {
            // Window rules: a representative equal to lo is omitted and the
            // inclusive hi needs an exact comparison; both defer.
            if !(t > lo && t < hi) {
                return None;
            }
            // (7) Routing: the delivered plain path returns before any root
            // search, so the delivered query uses its exact path.
            if !super::route::station_defers(c, n, lo) {
                return None;
            }
            return Some(Some(t));
        }
    }
    None
}

/// Strict C' < 0 on [lo, hi]: every closed piece has a negative derivative
/// enclosure, or a strict curvature sign with a negative derivative at the
/// piece end where C' is maximal.
fn decreasing(c: &[f64; 5], p: &Polynomial, lo: f64, hi: f64) -> bool {
    let mut stack = [(0.0, 0.0, 0_u8); 10];
    stack[0] = (lo, hi, 0);
    let mut len = 1;
    let mut visited = 0;
    while len > 0 {
        if visited == 31 {
            return false;
        }
        visited += 1;
        len -= 1;
        let (a, b, depth) = stack[len];
        let x = Interval { lo: a, hi: b };
        if slope(c, x).hi < 0.0 {
            continue;
        }
        let bend = p.curvature(x);
        if bend.finite()
            && ((bend.lo > 0.0 && sign_of(p.derivative(Wide::point(b))) < 0)
                || (bend.hi < 0.0 && sign_of(p.derivative(Wide::point(a))) < 0))
        {
            continue;
        }
        if depth == 8 {
            return false;
        }
        let mid = a * 0.5 + b * 0.5;
        if !(mid > a && mid < b) {
            return false;
        }
        stack[len] = (mid, b, depth + 1);
        stack[len + 1] = (a, mid, depth + 1);
        len += 2;
    }
    true
}

/// Empty branch: q = c - 128u|c| (outward, as F0/F9) is strictly positive on
/// [lo, next_up(hi)], so C > 128u S there and the delivered query is empty.
fn empty(c: &[f64; 5], lo: f64, hi: f64) -> Option<Option<f64>> {
    let end = hi.next_up();
    if !end.is_finite() {
        return None;
    }
    let mut q = *c;
    for v in &mut q {
        if *v != 0.0 {
            let margin = (v.abs() * MARGIN).next_up();
            *v = (*v - margin).next_down();
            if !v.is_finite() {
                return None;
            }
        }
    }
    let n = q.iter().rposition(|&v| v != 0.0)?;
    let p = Polynomial::new(&q)?;
    positive_cover(&q, n, &p, lo, end).then_some(None)
}

/// Every closed piece of [lo, hi] is certified positive by the F0 lower
/// Horner bound or by its shape: monotone with a positive minimal endpoint,
/// concave with positive endpoints, or one isolated positive minimum.
fn positive_cover(q: &[f64; 5], n: usize, p: &Polynomial, lo: f64, hi: f64) -> bool {
    let mut stack = [(0.0, 0.0, 0_u8); 14];
    stack[0] = (lo, hi, 0);
    let mut len = 1;
    let mut visited = 0;
    while len > 0 {
        if visited == 63 {
            return false;
        }
        visited += 1;
        len -= 1;
        let (a, b, depth) = stack[len];
        if screen::positive_piece(q, n, a, b) || shape_positive(p, a, b) {
            continue;
        }
        if depth == 12 {
            return false;
        }
        let mid = a * 0.5 + b * 0.5;
        if !(mid > a && mid < b) {
            return false;
        }
        stack[len] = (mid, b, depth + 1);
        stack[len + 1] = (a, mid, depth + 1);
        len += 2;
    }
    true
}

fn shape_positive(p: &Polynomial, a: f64, b: f64) -> bool {
    let x = Interval { lo: a, hi: b };
    let bend = p.curvature(x);
    if !bend.finite() {
        return false;
    }
    let positive_at = |t: f64| sign_of(p.value(t)) > 0;
    if bend.hi < 0.0 {
        return positive_at(a) && positive_at(b);
    }
    if bend.lo <= 0.0 {
        return false;
    }
    let left = sign_of(p.derivative(Wide::point(a)));
    let right = sign_of(p.derivative(Wide::point(b)));
    if left > 0 {
        return positive_at(a);
    }
    if right < 0 {
        return positive_at(b);
    }
    left < 0 && right > 0 && minimum_positive(p, x)
}

/// The unique simple minimum in x (strict curvature, endpoint signs checked
/// by the caller) has a strictly positive Taylor enclosure after outward
/// interval Newton narrowing, exactly as F8 encloses its minima.
fn minimum_positive(p: &Polynomial, mut x: Interval) -> bool {
    for _ in 0..12 {
        let center = x.lo * 0.5 + x.hi * 0.5;
        if center < x.lo || center > x.hi {
            return false;
        }
        let Some(slope) = p.derivative(Wide::point(center)) else {
            return false;
        };
        let Some(step) = slope.interval().div_positive(p.curvature(x)) else {
            return false;
        };
        let next = Interval::point(center).sub(step);
        let narrowed = Interval {
            lo: x.lo.max(next.lo),
            hi: x.hi.min(next.hi),
        };
        if !narrowed.finite() || narrowed.lo > narrowed.hi {
            return false;
        }
        if narrowed.lo == x.lo && narrowed.hi == x.hi {
            break;
        }
        x = narrowed;
    }
    let center = x.lo * 0.5 + x.hi * 0.5;
    if center < x.lo || center > x.hi {
        return false;
    }
    let dx = x.sub(Interval::point(center));
    let (Some(value), Some(slope)) = (p.value(center), p.derivative(Wide::point(center))) else {
        return false;
    };
    let value = value
        .interval()
        .add(slope.interval().mul(dx))
        .add(p.curvature(x).mul(dx.mul(dx)).mul(Interval::point(0.5)));
    value.finite() && value.lo > 0.0
}

#[cfg(test)]
mod tests {
    use super::*;

    /// C3's 70 captured >=10 us delivered queries (J v2 profile, kind 1 =
    /// shifted screen, 2 = ordinary contact) and whether an independent port
    /// of the delivered plain path defers on them.
    #[rustfmt::skip]
    const CAPTURED: &[([f64; 5], f64, f64, u8, bool)] = &[
    ([1.6479873021779667e-17, -2.2653042317671585e-10, 0.0003286874739064899, -0.0017785258397497953, 0.0024059025000000003], 1e-09, 0.18480859466975555, 2, true), // mix
    ([0.00640562963124567, -0.9747672877959824, 37.02204049423196, -11.912508475044914, 0.9623610000000002], 1e-09, 0.8877506001687115, 2, false), // breaks
    ([6.938893903907228e-18, -2.4801880373678115e-10, 0.0005311530652519063, -0.002260885859663385, 0.0024059025], 1e-09, 0.23493115989357297, 2, true), // clusters
    ([0.0, -5.1001171059820993e-11, 0.0005311524426422916, -0.002260885426982655, 0.0024059025], 1e-09, 0.23493111493323796, 2, true), // clusters
    ([7.37257477290143e-18, -2.5361411343412243e-10, 0.0007416170859999153, -0.002671521890041137, 0.0024059025000000003], 1e-09, 0.277600805731024, 2, true), // clusters
    ([3.5561831257524545e-17, -5.357117050311389e-10, 0.0005019692858409846, -0.002197895664523499, 0.0024059025000000003], 1e-09, 0.2283857787798446, 2, true), // clusters
    ([0.14465183185875166, -2.8541756479769735, 14.825393154060682, -7.361863061129091, 0.9623610000000005], 1e-09, 0.5467968895291295, 2, true), // grazes
    ([0.4432943178098794, -5.935061247311916, 21.17174949157215, -8.74476474015966, 0.962361], 1e-09, 0.5541196916682283, 2, true), // grazes
    ([0.04707772650978684, -1.310154895615649, 9.540978863318156, -5.923575259540208, 0.962361], 1e-09, 0.6282540320233914, 2, true), // grazes
    ([0.4351686045844862, -5.018438297266078, 15.762649440398267, -7.4629205545240875, 0.9623610000000004], 1e-09, 0.32151097767064174, 2, true), // grazes
    ([0.08629050587501608, -0.6485666312538862, 1.247487324049905, -0.10829592236420087, 0.0024059024999999994], 1e-09, 11.253149531641547, 2, true), // grazes
    ([0.008608908197242205, -0.2065735441070974, 1.2483019261082393, -0.10920428355817714, 0.0024059025000000007], 1e-09, 11.347538351842722, 2, true), // grazes
    ([0.3771922832488894, -5.368641991948419, 20.308180460649744, -8.575353891828868, 0.9623610000000004], 1e-09, 0.5388594991494692, 2, true), // grazes
    ([0.3315518720938422, -2.3875386907491434, 5.427957342603827, -4.067650994948688, 0.9623610000000001], 1e-09, 0.3458091871860733, 2, true), // grazes
    ([0.21297014925444147, -1.0915643308192295, 1.4439569524586795, -0.11601896312850044, 0.0024059025], 1e-09, 12.055659272196241, 2, true), // grazes
    ([0.0787039383225134, -1.844252779809644, 11.354420396143619, -6.448982843856095, 0.9623610000000004], 1e-09, 0.304131987641289, 2, true), // grazes
    ([0.03423198980187208, -0.8374688287281337, 5.4850730208425285, -4.440394809997032, 0.9623610000000005], 1e-09, 0.3193196180803585, 2, true), // grazes
    ([0.04681912298848641, -1.5220839963646176, 12.795223622763272, -6.900745166902856, 0.9623610000000001], 1e-09, 0.45649029238799216, 2, true), // grazes
    ([0.3344696389191981, -0.7429094676296171, 0.4692640953103364, -0.0630081247140922, 0.0024059025000000007], 1e-09, 6.547244195690828, 2, true), // grazes
    ([0.06486066228717864, -0.4166542803962926, 0.6941135974019685, -0.08024614348347926, 0.002405902500000001], 1e-09, 8.338465865042252, 2, true), // grazes
    ([0.20666194233802948, -3.148832406849498, 12.886328729054908, -6.794981839543236, 0.9623610000000004], 1e-09, 0.6122998992042199, 2, true), // grazes
    ([0.019422762815027545, -0.4514573726396334, 2.896823094650542, -3.177827022535808, 0.9623610000000004], 1e-09, 0.11877104538941946, 2, true), // grazes
    ([0.0397362280832586, -2.1852829164187764, 30.43586204826249, -10.75432998257601, 0.9623610000000002], 1e-09, 0.5778955792184778, 2, true), // grazes
    ([0.1263932244743897, -0.2803192600586359, 0.1903017750516991, -0.03867497601824795, 0.0024059025000000007], 1e-09, 4.018759698101643, 2, true), // grazes
    ([0.027421230406426345, -0.2797490627391533, 0.7297387713972295, -0.08286367358085252, 0.0024059025000000003], 1e-09, 8.61045632365116, 2, true), // grazes
    ([0.05796875023965773, -1.220916073749484, 6.9010039583411915, -4.974596386531866, 0.9623610000000001], 1e-09, 0.25751665489252906, 2, true), // grazes
    ([0.44014940759638155, -1.5041059335254745, 1.3500643121980065, -0.11120322313413462, 0.0024059025000000003], 1e-09, 11.555250382562745, 2, true), // grazes
    ([0.0839051325798202, -1.5400539117381251, 7.635129031401661, -5.215676751535174, 0.9623610000000004], 1e-09, 0.5265801040155133, 2, true), // grazes
    ([0.11267138996037779, -1.1462673524138594, 2.948329154178532, -0.1675012717989017, 0.0024059025000000003], 1e-09, 17.405243125906157, 2, true), // grazes
    ([0.06064594606321027, -2.2739730432768193, 21.799324242165355, -9.058440392714669, 0.962361], 1e-09, 0.5440375114015008, 2, true), // grazes
    ([0.4260231738463005, -3.7049383599542614, 9.33566585788086, -5.568437923038221, 0.9623609999999998], 1e-09, 0.2803271697009215, 2, true), // grazes
    ([0.09019362678719674, -3.4105345588454057, 32.83027463215802, -11.140470589661682, 0.9623610000000002], 1e-09, 0.5669364696417902, 2, true), // grazes
    ([0.33154878309797514, -6.481655413280694, 32.80821318820064, -11.042851373563463, 0.9623610000000005], 1e-09, 1.1213963085142142, 2, true), // grazes
    ([0.043393306305631964, -1.8728884991954158, 20.617532662632897, -8.820019776552693, 0.9623610000000002], 1e-09, 0.9574637683970918, 2, true), // grazes
    ([0.07935870680430766, -0.20513226911951404, 0.16019570908565134, -0.03571706011614724, 0.002405902500000001], 1e-09, 3.7113993726000154, 2, true), // grazes
    ([0.12019326512871335, -3.067978778503979, 20.258034916031768, -8.68123058242387, 0.9623610000000001], 1e-09, 0.6991764132419034, 2, true), // grazes
    ([0.3405995244622444, -1.1219188100585407, 0.9811389928069723, -0.0942927761909804, 0.0024059025000000003], 1e-09, 9.798067065371564, 2, true), // grazes
    ([0.09787966835126755, -0.9497519410314085, 2.3346139730907702, -0.1489028317327051, 0.0024059025000000007], 1e-09, 15.472658569154932, 2, true), // grazes
    ([0.35095985060056584, -7.033825477290026, 36.4047475271471, -11.64747742973788, 0.9623610000000001], 1e-09, 0.7496091149675044, 2, true), // grazes
    ([0.08771284997877685, -0.8290548844158117, 1.9880938578505178, -0.13730636907060736, 0.0024059025000000003], 1e-09, 14.267657258617856, 2, true), // grazes
    ([0.028607700357073742, -0.7878401986360318, 5.756019482480132, -4.569468308775747, 0.9623610000000002], 1e-09, 0.24709510175692728, 2, true), // grazes
    ([0.4604989637152718, -6.196802710366767, 22.178564621053212, -8.95823288206436, 0.9623610000000002], 1e-09, 0.8004644300890795, 2, true), // grazes
    ([0.04787416514180835, -0.8764842900006501, 4.0331516873247315, -0.19648642061372107, 0.0024059025000000003], 1e-09, 20.417122120879913, 2, true), // grazes
    ([0.13668412216282524, -0.7940167393318132, 1.1894062995046861, -0.10534395904267432, 0.0024059025000000003], 1e-09, 10.94640774539641, 2, true), // grazes
    ([0.04988277827572105, -1.4250986855085621, 10.616595859072039, -6.259485386816467, 0.962361], 1e-09, 0.48892723160205337, 2, true), // grazes
    ([0.2059342791654884, -1.6707947620948091, 4.279246053245684, -3.6118340715332575, 0.9623610000000004], 1e-09, 0.22087066596656965, 1, true), // grazes
    ([0.009035888771860108, -0.2675949797256761, 1.9905102306520648, -0.13808024058261206, 0.0024059025000000007], 1e-09, 14.348071106644188, 2, true), // grazes
    ([0.01928435105370614, -1.3831096539837715, 25.072260735563464, -9.77064210399925, 0.9623610000000001], 1e-09, 0.49964204724805816, 2, true), // grazes
    ([0.4865628078604165, -7.327056600900149, 28.952761806614884, -10.304551623159842, 0.9623610000000002], 1e-09, 0.8358694669434649, 2, true), // grazes
    ([0.11122079870486475, -3.4682456607111605, 27.69226910217444, -10.202012567674618, 0.962361], 1e-09, 1.1066567136414707, 2, true), // grazes
    ([0.13080789094465003, -4.220809874376647, 34.75807729628841, -11.448479887902078, 0.9623610000000004], 1e-09, 1.1639112618724565, 2, true), // grazes
    ([0.06798966559454618, -2.6436327962152726, 26.209590535525702, -9.946005287991543, 0.9623610000000002], 1e-09, 0.9911245766831361, 2, true), // grazes
    ([0.030735313452905696, -0.7455465999023675, 4.865149411471146, -4.171814390887679, 0.9623610000000002], 1e-09, 0.4396964634682923, 2, true), // grazes
    ([0.2841105584853158, -3.7477238401406567, 13.404912750431334, -6.897518941846651, 0.9623610000000002], 1e-09, 0.3607610440042996, 2, true), // grazes
    ([0.2533624146391683, -5.095271518383764, 26.604823622570848, -9.9303657493847, 0.9623610000000002], 1e-09, 0.3355923839511387, 2, true), // grazes
    ([0.10584268105686945, -1.1683395262366991, 3.2560807554116566, -0.1761479791826099, 0.0024059025000000003], 1e-09, 18.303732090412016, 2, true), // grazes
    ([0.5436844995457688, -2.778945095940244, 4.99769895574215, -3.6972217402632817, 0.962361], 1e-09, 0.3983920441432198, 1, true), // grazes
    ([0.02025339230822014, -0.3138800064968246, 1.2300617459527143, -0.10818169381442146, 0.0024059025000000007], 1e-09, 11.241279916208311, 2, true), // grazes
    ([0.28850855021383914, -5.337111171379092, 25.736614485634664, -9.747559893663649, 0.9623609999999998], 1e-09, 0.9144423375294872, 2, true), // grazes
    ([0.15157550946503515, -1.3972117106908386, 3.983707829977106, -3.520600173760184, 0.9623610000000001], 1e-09, 0.30799171015697724, 2, true), // grazes
    ([0.005717626127529381, -0.19770535393696917, 1.716492801897067, -0.12824769389287954, 0.0024059025000000003], 1e-09, 13.326360263235891, 2, true), // grazes
    ([0.08441923707409696, -0.48471214842098065, 0.7242740584279479, -0.08182805053798456, 0.0024059025000000003], 1e-09, 8.502843583435384, 2, true), // grazes
    ([0.14679676136786848, -3.1681022286169003, 17.844864270275806, -8.111664076427187, 0.9623610000000001], 1e-09, 0.8635769763548511, 2, true), // grazes
    ([0.05231842741570053, -0.65157211431523, 2.051103468848692, -0.13972501287696404, 0.002405902500000001], 1e-09, 14.51898122190779, 2, true), // grazes
    ([0.05367829031984655, -2.282685706682987, 24.722544338203367, -9.665310031177567, 0.9623610000000002], 1e-09, 0.34102786482638614, 2, true), // grazes
    ([0.4068609363090733, -5.727188475357666, 21.40620359963451, -8.808206460827703, 0.9623610000000004], 1e-09, 0.32737156802508255, 2, true), // grazes
    ([0.027618750254430086, -1.3101049315006308, 15.862382292105849, -7.733446356065178, 0.9623610000000004], 1e-09, 0.7606408686041415, 2, true), // grazes
    ([0.5314899992644172, -4.408879798324916, 10.57363149621356, -5.93266352079318, 0.9623609999999998], 1e-09, 0.5672375769721214, 2, true), // grazes
    ([0.11876830701504279, -3.3257364320407534, 23.957881683211426, -9.46687303063542, 0.9623610000000001], 1e-09, 0.9117110235391086, 2, true), // grazes
    ([0.02404032642122661, -0.9239355709738757, 9.18155045178849, -5.845753718732974, 0.9623610000000002], 1e-09, 0.47535046732120895, 2, true), // grazes
    ];

    fn check(c: &[f64; 5], lo: f64, hi: f64, counts: &mut [u32; 2]) -> bool {
        let Some(decided) = earliest(c, lo, hi) else {
            return false;
        };
        assert_eq!(
            decided.map(f64::to_bits),
            kroots::earliest_root_in(c, lo, hi).map(f64::to_bits),
            "c={c:?} ({lo:?}, {hi:?}]"
        );
        counts[usize::from(decided.is_some())] += 1;
        true
    }

    #[test]
    fn captured_slow_queries_route_and_match_the_delivered_query() {
        let mut counts = [0; 2];
        let mut contacts = 0;
        for &(c, lo, hi, kind, defers) in CAPTURED {
            let n = if c[4] != 0.0 { 4 } else { 3 };
            assert_eq!(
                super::super::route::station_defers(&c, n, lo),
                defers,
                "{c:?}"
            );
            let roots = counts[1];
            check(&c, lo, hi, &mut counts);
            contacts += u32::from(kind == 2 && counts[1] > roots);
        }
        println!(
            "F12 captured slow inputs: n={}, roots={}, empties={}, contact_roots={contacts}, mismatches=0",
            CAPTURED.len(),
            counts[1],
            counts[0]
        );
        assert!(contacts > 0);
    }

    /// Straight and curved decelerating passes: the polynomial trajectory
    /// mirrors after the stop time, which creates the ghost minimum that
    /// sends the delivered query to its exact path.
    #[test]
    fn decelerating_grazes_match_the_delivered_query() {
        let mut counts = [0; 2];
        let mut n = 0;
        for distance in [0.05715, 0.028575] {
            for (speed, deceleration) in [(0.4, 0.0981), (1.2, 1.962), (2.5, 1.962)] {
                let stop = speed / deceleration;
                for share in [0.05, 0.3, 0.7] {
                    let m = share * stop;
                    let h = 0.5 * deceleration;
                    let x0 = -speed * m + h * m * m;
                    for gap in [
                        -1e-6, -1e-9, -1e-11, -2e-12, -5e-13, 0.0, 5e-13, 2e-12, 1e-11, 1e-9, 1e-6,
                    ] {
                        let b = distance * (1.0 + gap);
                        for k in [0.0, 0.01] {
                            let c = [
                                x0 * x0 + b * b - distance * distance,
                                2.0 * x0 * speed,
                                speed * speed - 2.0 * x0 * h + 2.0 * b * k,
                                -2.0 * speed * h,
                                h * h + k * k,
                            ];
                            for (lo, hi) in [
                                (1e-9, stop),
                                (1e-9, 0.5 * stop),
                                (1e-9, 3.0 * stop),
                                (0.0, f64::INFINITY),
                            ] {
                                check(&c, lo, hi, &mut counts);
                                n += 1;
                            }
                        }
                    }
                }
            }
        }
        println!(
            "F12 decelerating grazes: n={n}, roots={}, empties={}, mismatches=0",
            counts[1], counts[0]
        );
        assert!(counts[1] > 0 && counts[0] > 0);
    }

    /// C3's rejected direct-contact family (its quadratic member showed the
    /// delivered fast path's two-ulp representative): F12 must never decide
    /// a degree-2 input, and any quartic decision must keep the delivered bits.
    #[test]
    fn rejected_shortcut_family_keeps_delivered_bits() {
        let mut counts = [0; 2];
        let mut n = 0;
        for m in [0.001, 0.07, 0.5, 1.5, 8.0] {
            for magnitude in [1e-14, 1e-12, 1e-8, 1e-4, 0.01] {
                for sign in [-1.0, 1.0] {
                    let g = sign * magnitude;
                    for factor in [0.0, 0.125] {
                        let c = [
                            m * m + g,
                            -2.0 * m,
                            1.0 + factor * (m * m + g),
                            -2.0 * factor * m,
                            factor,
                        ];
                        for (lo, hi) in [(0.0, m * 0.5), (0.0, m), (1e-9, m * 2.0), (1e-9, 64.0)] {
                            let decided = check(&c, lo, hi, &mut counts);
                            assert!(!(decided && factor == 0.0), "degree-2 decision {c:?}");
                            n += 1;
                        }
                    }
                }
            }
        }
        println!(
            "F12 rejected-shortcut family: n={n}, roots={}, empties={}, mismatches=0",
            counts[1], counts[0]
        );
    }
}
