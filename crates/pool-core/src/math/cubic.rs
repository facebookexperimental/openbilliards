// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Cubic solver (M1-owned).
//!
//! Analytic cubic derived from pooltool's `pooltool/ptmath/roots/_quartic_numba.py`
//! (`oqs_solve_cubic_analytic_depressed{,_handle_inf}` + Newton polish;
//! ekiefl/pooltool, Apache-2.0), its translation of the depressed-cubic machinery
//! of ACM Algorithm 1010 (Orellana & De Michele 2020), and modified by the
//! OpenBilliards authors; it shares `crate::math::quartic`'s port of that machinery.
//!
//! Strategy: depress the monic cubic, take the dominant real root from the
//! trigonometric/Cardano branches (overflow-safe), then deflate to a monic
//! quadratic via the root-product identity (stable because the dominant
//! root has the largest magnitude). Leading-coefficient ≈ 0 degrades to the
//! quadratic solver with the dynamic threshold documented at
//! [`super::quartic::degenerate_leading`] (contract §M1).

use super::quadratic::solve_quadratic;
use super::quartic::{degenerate_leading, depressed_cubic_root};
use super::Roots;

/// Solve `a·x³ + b·x² + c·x + d = 0`. Always returns 3 roots (complex pairs
/// carried in `Roots::im`) unless the leading coefficient degrades the
/// degree.
pub fn solve_cubic(a: f64, b: f64, c: f64, d: f64) -> Roots {
    debug_assert!(
        a.is_finite() && b.is_finite() && c.is_finite() && d.is_finite(),
        "solve_cubic: non-finite coefficient"
    );

    if degenerate_leading(a, b, c.abs().max(d.abs())) {
        return solve_quadratic(b, c, d);
    }

    // Monic: x³ + p·x² + q·x + r.
    let p = b / a;
    let q = c / a;
    let r = d / a;

    // Depress with x = y − p/3: y³ + g·y + h = 0.
    let g = q - p * p / 3.0;
    let h = p * (2.0 * p * p - 9.0 * q) / 27.0 + r;

    let y = depressed_cubic_root(g, h);
    let x1 = y - p / 3.0;

    // Deflate. The product of all three roots is −r, so the remaining
    // quadratic x² + b2·x + c2 has c2 = −r/x1 (well-conditioned for the
    // dominant root); x1 == 0 implies r == 0 up to round-off, keep c2 = q.
    let b2 = p + x1;
    let c2 = if x1 != 0.0 { -r / x1 } else { q };

    let quad = solve_quadratic(1.0, b2, c2);
    let mut out = Roots {
        count: 3,
        re: [0.0; 4],
        im: [0.0; 4],
    };
    out.re[0] = x1;
    // solve_quadratic(1.0, ..) always yields two roots.
    out.re[1] = quad.re[0];
    out.im[1] = quad.im[0];
    out.re[2] = quad.re[1];
    out.im[2] = quad.im[1];
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_root_set(roots: &Roots, expected: &[f64], rel_tol: f64) {
        for &want in expected {
            let scale = want.abs().max(1.0);
            let err = (0..roots.count as usize)
                .map(|i| libm::hypot(roots.re[i] - want, roots.im[i]) / scale)
                .fold(f64::INFINITY, f64::min);
            assert!(err < rel_tol, "root {want} missed (err {err:.3e})");
        }
    }

    #[test]
    fn three_distinct_real_roots() {
        // (x−1)(x−2)(x−3) = x³ − 6x² + 11x − 6
        let r = solve_cubic(1.0, -6.0, 11.0, -6.0);
        assert_eq!(r.count, 3);
        assert_root_set(&r, &[1.0, 2.0, 3.0], 1e-12);
    }

    #[test]
    fn one_real_two_complex() {
        // (x−2)(x² + 1) = x³ − 2x² + x − 2, complex pair ±i
        let r = solve_cubic(1.0, -2.0, 1.0, -2.0);
        assert_eq!(r.count, 3);
        // Real root 2.
        let err = (0..3)
            .map(|i| libm::hypot(r.re[i] - 2.0, r.im[i]))
            .fold(f64::INFINITY, f64::min);
        assert!(err < 1e-12);
        // Complex pair ±i.
        for sign in [1.0, -1.0] {
            let err = (0..3)
                .map(|i| libm::hypot(r.re[i], r.im[i] - sign))
                .fold(f64::INFINITY, f64::min);
            assert!(err < 1e-12, "missing root ±i");
        }
    }

    #[test]
    fn non_monic_scaled() {
        // −4·(x+5)(x−0.25)(x−100)
        let (r1, r2, r3) = (-5.0, 0.25, 100.0);
        let b = -(r1 + r2 + r3);
        let c = r1 * r2 + r1 * r3 + r2 * r3;
        let d = -(r1 * r2 * r3);
        let s = -4.0;
        let r = solve_cubic(s, s * b, s * c, s * d);
        assert_eq!(r.count, 3);
        assert_root_set(&r, &[r1, r2, r3], 1e-11);
    }

    #[test]
    fn degrades_to_quadratic_when_leading_zero_or_tiny() {
        // a = 0 exactly → quadratic (x−3)(x+7)
        let r = solve_cubic(0.0, 1.0, 4.0, -21.0);
        assert_eq!(r.count, 2);
        assert_root_set(&r, &[3.0, -7.0], 1e-12);
        // |a| below EPSILON·max(rest) → same degradation
        let r = solve_cubic(1e-18, 1.0, 4.0, -21.0);
        assert_eq!(r.count, 2);
        assert_root_set(&r, &[3.0, -7.0], 1e-12);
    }

    #[test]
    fn huge_roots_hit_overflow_branches() {
        // Roots near the cubic rescale scale: Q ≈ 1e204 forces handle_inf.
        let (r1, r2, r3): (f64, f64, f64) = (1e102, 2e102, -3e102);
        let b = -(r1 + r2 + r3);
        let c = r1 * r2 + r1 * r3 + r2 * r3;
        let d = -(r1 * r2 * r3);
        assert!(b.is_finite() && c.is_finite() && d.is_finite());
        let r = solve_cubic(1.0, b, c, d);
        assert_eq!(r.count, 3);
        for &want in &[r1, r2, r3] {
            let err = (0..3)
                .map(|i| libm::hypot(r.re[i] - want, r.im[i]) / want.abs())
                .fold(f64::INFINITY, f64::min);
            assert!(err < 1e-8, "huge root {want:e} missed (err {err:.3e})");
        }
    }

    #[test]
    fn double_root() {
        // (x−2)²(x+1) = x³ − 3x² + 4
        let r = solve_cubic(1.0, -3.0, 0.0, 4.0);
        assert_eq!(r.count, 3);
        assert_root_set(&r, &[-1.0], 1e-10);
        // Double root, conditioning ~sqrt(eps).
        let err = (0..3)
            .map(|i| libm::hypot(r.re[i] - 2.0, r.im[i]))
            .fold(f64::INFINITY, f64::min);
        assert!(err < 1e-7, "double root 2 missed (err {err:.3e})");
    }
}
