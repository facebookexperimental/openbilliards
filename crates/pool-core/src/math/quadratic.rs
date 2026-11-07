// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Quadratic solver (M1-owned).
//!
//! Cancellation-safe form derived from pooltool `ptmath/roots/quadratic.py` `solve`
//! (ekiefl/pooltool, Apache-2.0) and modified; the large-magnitude root is
//! computed with the sign trick `−b − sign(b)·√disc` (no subtraction of
//! nearly equal quantities), the second root via the product identity
//! `x1·x2 = c/a`. Leading-coefficient ≈ 0 degrades to the linear case with
//! the dynamic threshold documented at
//! [`super::quartic::degenerate_leading`] (contract §M1).

use super::quartic::degenerate_leading;
use super::Roots;

/// Solve `a·x² + b·x + c = 0`.
///
/// Returns 2 roots (complex-conjugate pairs carried in `Roots::im`), 1 root
/// for the degraded linear case, or 0 roots when `a` and `b` both vanish.
pub fn solve_quadratic(a: f64, b: f64, c: f64) -> Roots {
    debug_assert!(
        a.is_finite() && b.is_finite() && c.is_finite(),
        "solve_quadratic: non-finite coefficient"
    );

    let mut out = Roots::NONE;

    if degenerate_leading(a, b, c.abs()) {
        // Linear case b·x + c = 0; b == 0 leaves zero or infinitely many
        // solutions — report none (matches pooltool's NaN sentinel roots).
        if b != 0.0 {
            out.count = 1;
            out.re[0] = -c / b;
        }
        return out;
    }

    out.count = 2;
    let disc = b * b - 4.0 * a * c;
    if disc >= 0.0 {
        let sqrt_d = libm::sqrt(disc);
        // Sign trick: |num| = |b| + √disc, no catastrophic cancellation.
        let sign_b = if b >= 0.0 { 1.0 } else { -1.0 };
        let mut num = -b - sign_b * sqrt_d;
        let den = 2.0 * a;
        // pooltool fallback: numerator underflowed to ~0 (b ≈ 0 ≈ disc).
        if num.abs() < 1e-14 * den.abs() {
            num = -b + sign_b * sqrt_d;
        }
        let r1 = num / den;
        // Product identity for the mate root: x1·x2 = c/a.
        let r2 = if r1.abs() < 1e-14 {
            (-b + sqrt_d) / den
        } else {
            (c / a) / r1
        };
        out.re[0] = r1;
        out.re[1] = r2;
    } else {
        let sqrt_d = libm::sqrt(-disc);
        let re = -b / (2.0 * a);
        let im = sqrt_d / (2.0 * a).abs();
        out.re[0] = re;
        out.im[0] = im;
        out.re[1] = re;
        out.im[1] = -im;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roots_sorted(r: &Roots) -> Vec<f64> {
        let mut v: Vec<f64> = (0..r.count as usize).map(|i| r.re[i]).collect();
        v.sort_by(f64::total_cmp);
        v
    }

    #[test]
    fn simple_real_roots() {
        // (x−3)(x+2) = x² − x − 6
        let r = solve_quadratic(1.0, -1.0, -6.0);
        assert_eq!(r.count, 2);
        let v = roots_sorted(&r);
        assert!((v[0] + 2.0).abs() < 1e-14 && (v[1] - 3.0).abs() < 1e-14);
        assert_eq!(r.im, [0.0; 4]);
    }

    #[test]
    fn no_catastrophic_cancellation() {
        // x² − 1e8·x + 1 = 0: roots ≈ 1e8 and 1e−8. The naive formula loses
        // the small root; the product identity keeps full precision.
        let r = solve_quadratic(1.0, -1e8, 1.0);
        let v = roots_sorted(&r);
        assert!((v[0] - 1e-8).abs() / 1e-8 < 1e-12, "small root {:e}", v[0]);
        assert!((v[1] - 1e8).abs() / 1e8 < 1e-12);
    }

    #[test]
    fn complex_conjugate_pair() {
        // x² + 2x + 5 = 0 → −1 ± 2i
        let r = solve_quadratic(1.0, 2.0, 5.0);
        assert_eq!(r.count, 2);
        assert!((r.re[0] + 1.0).abs() < 1e-14 && (r.re[1] + 1.0).abs() < 1e-14);
        assert!((r.im[0].abs() - 2.0).abs() < 1e-14);
        assert!((r.im[0] + r.im[1]).abs() == 0.0, "conjugate pair");
    }

    #[test]
    fn negative_leading_coefficient() {
        // −2(x−1)(x−4) = −2x² + 10x − 8
        let r = solve_quadratic(-2.0, 10.0, -8.0);
        let v = roots_sorted(&r);
        assert!((v[0] - 1.0).abs() < 1e-14 && (v[1] - 4.0).abs() < 1e-14);
    }

    #[test]
    fn degrades_to_linear_and_none() {
        let r = solve_quadratic(0.0, 2.0, -8.0);
        assert_eq!(r.count, 1);
        assert!((r.re[0] - 4.0).abs() < 1e-14);
        // tiny leading coefficient below EPSILON·max(|b|,|c|)
        let r = solve_quadratic(1e-18, 2.0, -8.0);
        assert_eq!(r.count, 1);
        assert!((r.re[0] - 4.0).abs() < 1e-14);
        // a == b == 0: no reportable roots
        let r = solve_quadratic(0.0, 0.0, 3.0);
        assert_eq!(r.count, 0);
        let r = solve_quadratic(0.0, 0.0, 0.0);
        assert_eq!(r.count, 0);
    }

    #[test]
    fn double_root_at_zero_and_b_zero() {
        // x² = 0
        let r = solve_quadratic(1.0, 0.0, 0.0);
        assert_eq!(r.count, 2);
        assert_eq!(r.re[0], 0.0);
        assert_eq!(r.re[1], 0.0);
        // b == 0, real: x² − 9 = 0
        let r = solve_quadratic(1.0, 0.0, -9.0);
        let v = roots_sorted(&r);
        assert!((v[0] + 3.0).abs() < 1e-14 && (v[1] - 3.0).abs() < 1e-14);
    }
}
