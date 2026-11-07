// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Quartic solver (M1-owned).
//!
//! Derived from pooltool's numba translation `pooltool/ptmath/roots/_quartic_numba.py`
//! (ekiefl/pooltool, Apache-2.0) of ACM Algorithm 1010 (Orellana & De Michele 2020,
//! "Algorithm 1010: Boosting Efficiency in Solving Quartic Equations with No Compromise
//! in Accuracy", ACM TOMS 46(2)) and modified by the OpenBilliards authors; the
//! translation carries one deliberate modification, kept here:
//!
//! * `D2_SAFETY_FACTOR = 100` — the check for a near-degenerate `d2` in the
//!   LDLT decomposition is loosened by a factor of 100 so that Newton's
//!   cradle-like quartics (balls with nearly equal velocities) yield four
//!   distinct roots instead of spurious doubles.
//!
//! Pipeline: normalize to a monic quartic → φ₀ via the dominant root of a
//! depressed cubic (analytic, with overflow-rescale branches) → LDLT
//! decomposition into two quadratic factors, choosing the minimal-residual
//! candidate → 4-dimensional Newton-Raphson refinement of the factor
//! coefficients with a residual-nonincrease fallback → cancellation-safe
//! quadratic solves.
//!
//! Leading-coefficient degradation: `a == 0` exactly OR `|a|` below the
//! dynamic threshold documented at [`degenerate_leading`] delegates to the
//! cubic solver (contract §M1).

use super::cubic::solve_cubic;
use super::Roots;

/// Rescale factor for the depressed-cubic overflow branch
/// (`cubic_rescal_fact` in `_quartic_numba.py`; ≈ `DBL_MAX^(1/3) / 1.618`).
const CUBIC_RESCAL_FACT: f64 = 3.488062113727083e102;
/// Rescale factor for the quartic overflow branch
/// (`quart_rescal_fact`; ≈ `DBL_MAX^(1/4) / 1.618`).
const QUART_RESCAL_FACT: f64 = 7.156344627944542e76;
/// Machine epsilon (`macheps` in the reference implementation).
const MACHEPS: f64 = f64::EPSILON;
/// pooltool patch: loosen the d2-degeneracy threshold (see module docs).
const D2_SAFETY_FACTOR: f64 = 100.0;

/// Dynamic leading-coefficient degradation test (contract §M1).
///
/// For `a·xⁿ + b·xⁿ⁻¹ + (rest)`, the roots of the degraded polynomial are
/// bounded by the Cauchy bound `R = 1 + max|rest|/|b|`. The polynomial is
/// treated as degree `n−1` when the leading term at that bound,
/// `|a|·Rⁿ`, cannot exceed one machine epsilon of the next term,
/// `ε·|b|·Rⁿ⁻¹` — i.e. `|a|·R <= ε·|b|`. The leading term is then round-off
/// noise everywhere the retained roots can live, and the root it would have
/// contributed sits at `|x| ≈ |b/a| >= R/ε`, far outside any physically
/// meaningful event-time window. `a == 0` degrades unconditionally;
/// `b == 0` (with `a != 0`) never degrades.
pub(super) fn degenerate_leading(a: f64, b: f64, rest_max_abs: f64) -> bool {
    if a == 0.0 {
        return true;
    }
    if b == 0.0 {
        return false;
    }
    let cauchy = 1.0 + rest_max_abs / b.abs();
    a.abs() * cauchy <= f64::EPSILON * b.abs()
}

// ---------------------------------------------------------------------------
// Minimal complex arithmetic (private; only what the 1010 pipeline needs).
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug)]
pub(super) struct Cx {
    pub re: f64,
    pub im: f64,
}

impl Cx {
    pub(super) fn new(re: f64, im: f64) -> Cx {
        Cx { re, im }
    }

    fn conj(self) -> Cx {
        Cx::new(self.re, -self.im)
    }

    fn abs(self) -> f64 {
        libm::hypot(self.re, self.im)
    }

    fn add(self, o: Cx) -> Cx {
        Cx::new(self.re + o.re, self.im + o.im)
    }

    fn sub(self, o: Cx) -> Cx {
        Cx::new(self.re - o.re, self.im - o.im)
    }

    fn mul(self, o: Cx) -> Cx {
        Cx::new(
            self.re * o.re - self.im * o.im,
            self.re * o.im + self.im * o.re,
        )
    }

    fn scale(self, s: f64) -> Cx {
        Cx::new(self.re * s, self.im * s)
    }

    /// Complex division via Smith's algorithm (overflow-resistant).
    fn div(self, o: Cx) -> Cx {
        if o.re.abs() >= o.im.abs() {
            let r = o.im / o.re;
            let den = o.re + o.im * r;
            Cx::new((self.re + self.im * r) / den, (self.im - self.re * r) / den)
        } else {
            let r = o.re / o.im;
            let den = o.re * r + o.im;
            Cx::new((self.re * r + self.im) / den, (self.im * r - self.re) / den)
        }
    }

    /// Principal square root.
    fn csqrt(self) -> Cx {
        if self.re == 0.0 && self.im == 0.0 {
            return Cx::new(0.0, 0.0);
        }
        let m = self.abs();
        let t = libm::sqrt(0.5 * (m + self.re.abs()));
        if self.re >= 0.0 {
            Cx::new(t, self.im / (2.0 * t))
        } else {
            Cx::new(self.im.abs() / (2.0 * t), libm::copysign(t, self.im))
        }
    }
}

// ---------------------------------------------------------------------------
// Depressed cubic x³ + b·x + c = 0, dominant real root.
// Ports of `oqs_solve_cubic_analytic_depressed{_handle_inf}` from
// `_quartic_numba.py`.
// ---------------------------------------------------------------------------

/// Dominant root of the depressed cubic when intermediates would overflow.
fn depressed_cubic_handle_inf(b: f64, c: f64) -> f64 {
    let pi2 = core::f64::consts::FRAC_PI_2;
    let two_pi = 2.0 * core::f64::consts::PI;
    let q = -b / 3.0;
    let r = 0.5 * c;
    if r == 0.0 {
        return if b <= 0.0 { libm::sqrt(-b) } else { 0.0 };
    }

    let kk = if q.abs() < r.abs() {
        let qr = q / r;
        1.0 - q * (qr * qr)
    } else {
        let rq = r / q;
        libm::copysign(1.0, q) * (rq * rq / q - 1.0)
    };

    if kk < 0.0 {
        // kk < 0 implies q³ > r² hence q > 0.
        let sqrt_q = libm::sqrt(q);
        let theta = libm::acos((r / q.abs()) / sqrt_q);
        if theta < pi2 {
            -2.0 * sqrt_q * libm::cos(theta / 3.0)
        } else {
            -2.0 * sqrt_q * libm::cos((theta + two_pi) / 3.0)
        }
    } else {
        let a = if q.abs() < r.abs() {
            -libm::copysign(1.0, r) * libm::cbrt(r.abs() * (1.0 + libm::sqrt(kk)))
        } else {
            -libm::copysign(1.0, r)
                * libm::cbrt(r.abs() + libm::sqrt(q.abs()) * q.abs() * libm::sqrt(kk))
        };
        let b_ = if a == 0.0 { 0.0 } else { q / a };
        a + b_
    }
}

/// Dominant real root of the depressed cubic `x³ + b·x + c = 0` (analytic,
/// with an overflow branch when |Q| or |R| would overflow when cubed/squared).
fn depressed_cubic_analytic(b: f64, c: f64) -> f64 {
    let q = -b / 3.0;
    let r = 0.5 * c;
    if q.abs() > 1e102 || r.abs() > 1e154 {
        return depressed_cubic_handle_inf(b, c);
    }
    let q3 = q * q * q;
    let r2 = r * r;
    if r2 < q3 {
        let theta = libm::acos(r / libm::sqrt(q3));
        let sqrt_q = -2.0 * libm::sqrt(q);
        if theta < core::f64::consts::FRAC_PI_2 {
            sqrt_q * libm::cos(theta / 3.0)
        } else {
            sqrt_q * libm::cos((theta + 2.0 * core::f64::consts::PI) / 3.0)
        }
    } else {
        let a = -libm::copysign(1.0, r) * libm::cbrt(r.abs() + libm::sqrt(r2 - q3));
        let b_ = if a == 0.0 { 0.0 } else { q / a };
        a + b_
    }
}

/// Newton refinement of a depressed-cubic root `x` for `x³ + g·x + h = 0`
/// with a residual-nonincrease fallback (max 8 iterations; the tail of
/// `oqs_calc_phi0`).
fn newton_refine_depressed(mut x: f64, g: f64, h: f64) -> f64 {
    let mut xsq = x * x;
    let xxx = x * xsq;
    let gx = g * x;
    let mut f = x * (xsq + g) + h;
    let maxtt = xxx.abs().max(gx.abs()).max(h.abs());

    if f.abs() > MACHEPS * maxtt {
        for _ in 0..8 {
            let df = 3.0 * xsq + g;
            if df == 0.0 {
                break;
            }
            let xold = x;
            x += -f / df;
            let fold = f;
            xsq = x * x;
            f = x * (xsq + g) + h;
            if f == 0.0 {
                break;
            }
            if f.abs() >= fold.abs() {
                x = xold;
                break;
            }
        }
    }
    x
}

/// Dominant real root of the depressed cubic `x³ + g·x + h = 0`, analytic
/// value polished by Newton (shared with the public cubic solver).
pub(super) fn depressed_cubic_root(g: f64, h: f64) -> f64 {
    let mut r = depressed_cubic_analytic(g, h);
    if !r.is_finite() {
        r = depressed_cubic_handle_inf(g, h);
    }
    newton_refine_depressed(r, g, h)
}

// ---------------------------------------------------------------------------
// φ₀ for the monic quartic x⁴ + a·x³ + b·x² + c·x + d (`oqs_calc_phi0`).
// ---------------------------------------------------------------------------

fn calc_phi0(a: f64, b: f64, c: f64, d: f64, scaled: bool) -> f64 {
    let mut diskr = 9.0 * a * a - 24.0 * b;
    let s = if diskr > 0.0 {
        diskr = libm::sqrt(diskr);
        if a > 0.0 {
            -2.0 * b / (3.0 * a + diskr)
        } else {
            -2.0 * b / (3.0 * a - diskr)
        }
    } else {
        -a / 4.0
    };

    let aq = a + 4.0 * s;
    let bq = b + 3.0 * s * (a + 2.0 * s);
    let cq = c + s * (2.0 * b + s * (3.0 * a + 4.0 * s));
    let dq = d + s * (c + s * (b + s * (a + s)));
    let gg = bq * bq / 9.0;
    let hh = aq * cq;

    let mut g = hh - 4.0 * dq - 3.0 * gg;
    let mut h = (8.0 * dq + hh - 2.0 * gg) * bq / 3.0 - cq * cq - dq * aq * aq;
    let mut rmax = depressed_cubic_analytic(g, h);
    if !rmax.is_finite() {
        rmax = depressed_cubic_handle_inf(g, h);
        if !rmax.is_finite() && scaled {
            // Rescale the shifted-quartic coefficients so that g/h become
            // representable, solve, and scale the root back up.
            let rfact = CUBIC_RESCAL_FACT;
            let rfactsq = rfact * rfact;
            let dqss = dq / rfactsq;
            let aqs = aq / rfact;
            let bqs = bq / rfact;
            let cqs = cq / rfact;
            let ggss = bqs * bqs / 9.0;
            let hhss = aqs * cqs;
            g = hhss - 4.0 * dqss - 3.0 * ggss;
            h = (8.0 * dqss + hhss - 2.0 * ggss) * bqs / 3.0
                - cqs * (cqs / rfact)
                - (dq / rfact) * aqs * aqs;
            rmax = depressed_cubic_analytic(g, h);
            if !rmax.is_finite() {
                rmax = depressed_cubic_handle_inf(g, h);
            }
            rmax *= rfact;
        }
    }

    // Newton refinement (reference refines against the current g, h).
    newton_refine_depressed(rmax, g, h)
}

// ---------------------------------------------------------------------------
// Residual estimators (`oqs_calc_err_*`). Relative when the target
// coefficient is nonzero, absolute otherwise.
// ---------------------------------------------------------------------------

/// Backward error of an LDLT candidate `(d2, l1, l2, l3)` against the monic
/// quartic coefficients `(b, c, d)`.
fn calc_err_ldlt(b: f64, c: f64, d: f64, d2: f64, l1: f64, l2: f64, l3: f64) -> f64 {
    let eb = d2 + l1 * l1 + 2.0 * l3;
    let ec = 2.0 * d2 * l2 + 2.0 * l1 * l3;
    let ed = d2 * l2 * l2 + l3 * l3;
    let mut sum = if b == 0.0 {
        eb.abs()
    } else {
        ((eb - b) / b).abs()
    };
    sum += if c == 0.0 {
        ec.abs()
    } else {
        ((ec - c) / c).abs()
    };
    sum += if d == 0.0 {
        ed.abs()
    } else {
        ((ed - d) / d).abs()
    };
    sum
}

/// Backward error of the real factorization
/// `(x² + aq·x + bq)(x² + cq·x + dq)` against all four coefficients.
#[allow(clippy::too_many_arguments)] // verbatim port of oqs_calc_err_abcd
fn calc_err_abcd(a: f64, b: f64, c: f64, d: f64, aq: f64, bq: f64, cq: f64, dq: f64) -> f64 {
    let ed = bq * dq;
    let ec = bq * cq + aq * dq;
    let eb = bq + aq * cq + dq;
    let ea = aq + cq;
    let mut sum = if d == 0.0 {
        ed.abs()
    } else {
        ((ed - d) / d).abs()
    };
    sum += if c == 0.0 {
        ec.abs()
    } else {
        ((ec - c) / c).abs()
    };
    sum += if b == 0.0 {
        eb.abs()
    } else {
        ((eb - b) / b).abs()
    };
    sum += if a == 0.0 {
        ea.abs()
    } else {
        ((ea - a) / a).abs()
    };
    sum
}

/// Complex-factor variant of [`calc_err_abcd`].
#[allow(clippy::too_many_arguments)] // verbatim port of oqs_calc_err_abcd_cmplx
fn calc_err_abcd_cmplx(a: f64, b: f64, c: f64, d: f64, aq: Cx, bq: Cx, cq: Cx, dq: Cx) -> f64 {
    let ed = bq.mul(dq);
    let ec = bq.mul(cq).add(aq.mul(dq));
    let eb = bq.add(aq.mul(cq)).add(dq);
    let ea = aq.add(cq);
    let mut sum = if d == 0.0 {
        ed.abs()
    } else {
        ed.sub(Cx::new(d, 0.0)).abs() / d.abs()
    };
    sum += if c == 0.0 {
        ec.abs()
    } else {
        ec.sub(Cx::new(c, 0.0)).abs() / c.abs()
    };
    sum += if b == 0.0 {
        eb.abs()
    } else {
        eb.sub(Cx::new(b, 0.0)).abs() / b.abs()
    };
    sum += if a == 0.0 {
        ea.abs()
    } else {
        ea.sub(Cx::new(a, 0.0)).abs() / a.abs()
    };
    sum
}

/// Backward error against the `a, b, c` coefficients only (used when
/// re-deriving one factor coefficient from the others; `oqs_calc_err_abc`).
fn calc_err_abc(a: f64, b: f64, c: f64, aq: f64, bq: f64, cq: f64, dq: f64) -> f64 {
    let ec = bq * cq + aq * dq;
    let eb = bq + aq * cq + dq;
    let ea = aq + cq;
    let mut sum = if c == 0.0 {
        ec.abs()
    } else {
        ((ec - c) / c).abs()
    };
    sum += if b == 0.0 {
        eb.abs()
    } else {
        ((eb - b) / b).abs()
    };
    sum += if a == 0.0 {
        ea.abs()
    } else {
        ((ea - a) / a).abs()
    };
    sum
}

// ---------------------------------------------------------------------------
// 4-dimensional Newton-Raphson refinement of the quadratic-factor
// coefficients (`oqs_NRabcd`), residual-nonincrease fallback, max 8 iters.
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)] // verbatim port of oqs_NRabcd
fn nr_abcd(
    a: f64,
    b: f64,
    c: f64,
    d: f64,
    aq: f64,
    bq: f64,
    cq: f64,
    dq: f64,
) -> (f64, f64, f64, f64) {
    let (mut x0, mut x1, mut x2, mut x3) = (aq, bq, cq, dq);

    let mut fv0 = x1 * x3 - d;
    let mut fv1 = x1 * x2 + x0 * x3 - c;
    let mut fv2 = x1 + x0 * x2 + x3 - b;
    let mut fv3 = x0 + x2 - a;

    let rel_err = |f0: f64, f1: f64, f2: f64, f3: f64| -> f64 {
        let mut e = if d == 0.0 { f0.abs() } else { (f0 / d).abs() };
        e += if c == 0.0 { f1.abs() } else { (f1 / c).abs() };
        e += if b == 0.0 { f2.abs() } else { (f2 / b).abs() };
        e += if a == 0.0 { f3.abs() } else { (f3 / a).abs() };
        e
    };
    let mut errf = rel_err(fv0, fv1, fv2, fv3);

    for _ in 0..8 {
        let x02 = x0 - x2;
        let det = x1 * x1 + x1 * (-x2 * x02 - 2.0 * x3) + x3 * (x0 * x02 + x3);
        if det == 0.0 {
            break;
        }

        // Adjugate of the 4×4 Jacobian, expressed row-wise (reference code).
        let j00 = x02;
        let j01 = x3 - x1;
        let j02 = x1 * x2 - x0 * x3;
        let j03 = -x1 * j01 - x0 * j02;
        let j10 = x0 * j00 + j01;
        let j11 = -x1 * j00;
        let j12 = -x1 * j01;
        let j13 = -x1 * j02;
        let j20 = -j00;
        let j21 = -j01;
        let j22 = -j02;
        let j23 = j02 * x2 + j01 * x3;
        let j30 = -x2 * j00 - j01;
        let j31 = j00 * x3;
        let j32 = x3 * j01;
        let j33 = x3 * j02;

        let dx0 = j00 * fv0 + j01 * fv1 + j02 * fv2 + j03 * fv3;
        let dx1 = j10 * fv0 + j11 * fv1 + j12 * fv2 + j13 * fv3;
        let dx2 = j20 * fv0 + j21 * fv1 + j22 * fv2 + j23 * fv3;
        let dx3 = j30 * fv0 + j31 * fv1 + j32 * fv2 + j33 * fv3;

        let (xo0, xo1, xo2, xo3) = (x0, x1, x2, x3);
        x0 += -dx0 / det;
        x1 += -dx1 / det;
        x2 += -dx2 / det;
        x3 += -dx3 / det;

        fv0 = x1 * x3 - d;
        fv1 = x1 * x2 + x0 * x3 - c;
        fv2 = x1 + x0 * x2 + x3 - b;
        fv3 = x0 + x2 - a;

        let errfold = errf;
        errf = rel_err(fv0, fv1, fv2, fv3);
        if errf == 0.0 {
            break;
        }
        if errf >= errfold {
            (x0, x1, x2, x3) = (xo0, xo1, xo2, xo3);
            break;
        }
    }
    (x0, x1, x2, x3)
}

/// Roots of the monic quadratic `x² + a·x + b = 0` as a complex pair,
/// cancellation-safe (max-magnitude root first, mate via product identity;
/// `oqs_solve_quadratic`).
fn monic_quadratic_roots(a: f64, b: f64) -> (Cx, Cx) {
    let diskr = a * a - 4.0 * b;
    if diskr >= 0.0 {
        let div = if a >= 0.0 {
            -a - libm::sqrt(diskr)
        } else {
            -a + libm::sqrt(diskr)
        };
        let zmax = div / 2.0;
        let zmin = if zmax == 0.0 { 0.0 } else { b / zmax };
        (Cx::new(zmax, 0.0), Cx::new(zmin, 0.0))
    } else {
        let sqrtd = libm::sqrt(-diskr);
        (
            Cx::new(-a / 2.0, sqrtd / 2.0),
            Cx::new(-a / 2.0, -sqrtd / 2.0),
        )
    }
}

/// Solve `a·x⁴ + b·x³ + c·x² + d·x + e = 0` (ACM Algorithm 1010; see module
/// docs). Complex roots are returned with their imaginary parts in
/// `Roots::im`; use [`super::smallest_positive_real_root`] to filter.
pub fn solve_quartic(a: f64, b: f64, c: f64, d: f64, e: f64) -> Roots {
    debug_assert!(
        a.is_finite() && b.is_finite() && c.is_finite() && d.is_finite() && e.is_finite(),
        "solve_quartic: non-finite coefficient"
    );

    // Leading-coefficient degradation (contract §M1); threshold documented
    // at `degenerate_leading`.
    if degenerate_leading(a, b, c.abs().max(d.abs()).max(e.abs())) {
        return solve_cubic(b, c, d, e);
    }

    // Normalize to monic x⁴ + a'x³ + b'x² + c'x + d'.
    let mut a_p = b / a;
    let mut b_p = c / a;
    let mut c_p = d / a;
    let mut d_p = e / a;

    let mut phi0 = calc_phi0(a_p, b_p, c_p, d_p, false);

    // Quartic-level overflow rescale.
    let mut rfact = 1.0;
    if !phi0.is_finite() {
        rfact = QUART_RESCAL_FACT;
        let rfactsq = rfact * rfact;
        a_p /= rfact;
        b_p /= rfactsq;
        c_p /= rfactsq * rfact;
        d_p /= rfactsq * rfactsq;
        phi0 = calc_phi0(a_p, b_p, c_p, d_p, true);
    }

    let l1 = a_p / 2.0;
    let l3 = b_p / 6.0 + phi0 / 2.0;
    let del2 = c_p - a_p * l3;
    let bl311 = 2.0 * b_p / 3.0 - phi0 - l1 * l1;
    let dml3l3 = d_p - l3 * l3;

    // LDLT decomposition: enumerate up to three (d2, l2) candidates and keep
    // the one with the smallest backward error.
    let mut d2m = [0.0f64; 3];
    let mut l2m = [0.0f64; 3];
    let mut res = [0.0f64; 3];
    let mut nsol = 0usize;

    if bl311 != 0.0 {
        d2m[0] = bl311;
        l2m[0] = del2 / (2.0 * d2m[0]);
        res[0] = calc_err_ldlt(b_p, c_p, d_p, d2m[0], l1, l2m[0], l3);
        nsol = 1;
    }
    if del2 != 0.0 {
        if nsol == 0 {
            l2m[0] = 2.0 * dml3l3 / del2;
            if l2m[0] != 0.0 {
                d2m[0] = del2 / (2.0 * l2m[0]);
                res[0] = calc_err_ldlt(b_p, c_p, d_p, d2m[0], l1, l2m[0], l3);
                nsol = 1;
            }
        } else {
            l2m[1] = 2.0 * dml3l3 / del2;
            if l2m[1] != 0.0 {
                d2m[1] = del2 / (2.0 * l2m[1]);
                res[1] = calc_err_ldlt(b_p, c_p, d_p, d2m[1], l1, l2m[1], l3);
                nsol = 2;
            }
        }

        if nsol == 1 {
            d2m[1] = bl311;
            l2m[1] = 2.0 * dml3l3 / del2;
            res[1] = calc_err_ldlt(b_p, c_p, d_p, d2m[1], l1, l2m[1], l3);
            nsol = 2;
        } else if nsol == 2 {
            d2m[2] = bl311;
            l2m[2] = 2.0 * dml3l3 / del2;
            res[2] = calc_err_ldlt(b_p, c_p, d_p, d2m[2], l1, l2m[2], l3);
            nsol = 3;
        }
    }

    let (d2, l2) = match nsol {
        0 => (0.0, 0.0),
        1 => (d2m[0], l2m[0]),
        2 => {
            if res[0] <= res[1] {
                (d2m[0], l2m[0])
            } else {
                (d2m[1], l2m[1])
            }
        }
        _ => {
            if res[0] <= res[1] && res[0] <= res[2] {
                (d2m[0], l2m[0])
            } else if res[1] <= res[2] {
                (d2m[1], l2m[1])
            } else {
                (d2m[2], l2m[2])
            }
        }
    };

    let mut whichcase = 0u8;
    // -1 → degenerate d2, 0 → complex factors, 1 → real factors.
    let mut realcase0: i8 = -1;
    let mut realcase1: i8 = -1;
    let (mut aq, mut bq, mut cq, mut dq) = (0.0f64, 0.0f64, 0.0f64, 0.0f64);
    let zero = Cx::new(0.0, 0.0);
    let (mut acx, mut bcx, mut ccx, mut dcx) = (zero, zero, zero, zero);

    if d2 < 0.0 {
        // Two real quadratic factors x² + aq·x + bq and x² + cq·x + dq.
        let gamma = libm::sqrt(-d2);
        aq = l1 + gamma;
        bq = l3 + gamma * l2;
        cq = l1 - gamma;
        dq = l3 - gamma * l2;
        // Rebalance the constant terms through d' = bq·dq.
        if dq.abs() < bq.abs() {
            dq = d_p / bq;
        } else if dq.abs() > bq.abs() {
            bq = d_p / dq;
        }
        // Re-derive the smaller of aq/cq from the other coefficients,
        // selecting the minimal-residual candidate.
        if aq.abs() < cq.abs() {
            let mut aqv = [0.0f64; 3];
            let mut errv = [0.0f64; 3];
            let mut n = 0usize;
            if dq != 0.0 {
                aqv[n] = (c_p - bq * cq) / dq;
                errv[n] = calc_err_abc(a_p, b_p, c_p, aqv[n], bq, cq, dq);
                n = 1;
            }
            if cq != 0.0 {
                aqv[n] = (b_p - dq - bq) / cq;
                errv[n] = calc_err_abc(a_p, b_p, c_p, aqv[n], bq, cq, dq);
                n += 1;
            }
            aqv[n] = a_p - cq;
            errv[n] = calc_err_abc(a_p, b_p, c_p, aqv[n], bq, cq, dq);
            n += 1;
            let mut best = 0usize;
            for k in 1..n {
                if errv[k] < errv[best] {
                    best = k;
                }
            }
            aq = aqv[best];
        } else {
            let mut cqv = [0.0f64; 3];
            let mut errv = [0.0f64; 3];
            let mut n = 0usize;
            if bq != 0.0 {
                cqv[n] = (c_p - aq * dq) / bq;
                errv[n] = calc_err_abc(a_p, b_p, c_p, aq, bq, cqv[n], dq);
                n = 1;
            }
            if aq != 0.0 {
                cqv[n] = (b_p - bq - dq) / aq;
                errv[n] = calc_err_abc(a_p, b_p, c_p, aq, bq, cqv[n], dq);
                n += 1;
            }
            cqv[n] = a_p - aq;
            errv[n] = calc_err_abc(a_p, b_p, c_p, aq, bq, cqv[n], dq);
            n += 1;
            let mut best = 0usize;
            for k in 1..n {
                if errv[k] < errv[best] {
                    best = k;
                }
            }
            cq = cqv[best];
        }
        realcase0 = 1;
    } else if d2 > 0.0 {
        // Complex-conjugate quadratic factors.
        let gamma = libm::sqrt(d2);
        acx = Cx::new(l1, gamma);
        bcx = Cx::new(l3, gamma * l2);
        ccx = acx.conj();
        dcx = bcx.conj();
        realcase0 = 0;
    }

    // d2 ≈ 0 degeneracy: try the alternative factorization and keep whichever
    // has the smaller backward error. pooltool patch: threshold loosened by
    // D2_SAFETY_FACTOR (Newton's cradle-like quartics).
    if realcase0 == -1
        || d2.abs()
            <= D2_SAFETY_FACTOR * MACHEPS * (2.0 * b_p / 3.0).abs().max(phi0.abs()).max(l1 * l1)
    {
        let d3 = d_p - l3 * l3;
        let err0 = if realcase0 == 1 {
            calc_err_abcd(a_p, b_p, c_p, d_p, aq, bq, cq, dq)
        } else if realcase0 == 0 {
            calc_err_abcd_cmplx(a_p, b_p, c_p, d_p, acx, bcx, ccx, dcx)
        } else {
            0.0
        };
        let (mut aq1, mut bq1, mut cq1, mut dq1) = (0.0f64, 0.0f64, 0.0f64, 0.0f64);
        let (mut acx1, mut bcx1, mut ccx1, mut dcx1) = (zero, zero, zero, zero);
        let err1 = if d3 <= 0.0 {
            realcase1 = 1;
            aq1 = l1;
            bq1 = l3 + libm::sqrt(-d3);
            cq1 = l1;
            dq1 = l3 - libm::sqrt(-d3);
            if dq1.abs() < bq1.abs() {
                dq1 = d_p / bq1;
            } else if dq1.abs() > bq1.abs() {
                bq1 = d_p / dq1;
            }
            calc_err_abcd(a_p, b_p, c_p, d_p, aq1, bq1, cq1, dq1)
        } else {
            realcase1 = 0;
            acx1 = Cx::new(l1, 0.0);
            bcx1 = Cx::new(l3, libm::sqrt(d3));
            ccx1 = Cx::new(l1, 0.0);
            dcx1 = bcx1.conj();
            calc_err_abcd_cmplx(a_p, b_p, c_p, d_p, acx1, bcx1, ccx1, dcx1)
        };
        if realcase0 == -1 || err1 < err0 {
            whichcase = 1;
            if realcase1 == 1 {
                (aq, bq, cq, dq) = (aq1, bq1, cq1, dq1);
            } else {
                (acx, bcx, ccx, dcx) = (acx1, bcx1, ccx1, dcx1);
            }
        }
    }

    let mut roots = [zero; 4];
    if (whichcase == 0 && realcase0 == 1) || (whichcase == 1 && realcase1 == 1) {
        // Real factors: refine jointly, then solve each quadratic.
        (aq, bq, cq, dq) = nr_abcd(a_p, b_p, c_p, d_p, aq, bq, cq, dq);
        (roots[0], roots[1]) = monic_quadratic_roots(aq, bq);
        (roots[2], roots[3]) = monic_quadratic_roots(cq, dq);
    } else if whichcase == 0 {
        // Complex-conjugate factors: solve one, conjugate for the other.
        let cdiskr = acx.mul(acx).scale(0.25).sub(bcx);
        let sq = cdiskr.csqrt();
        let zx1 = acx.scale(-0.5).add(sq);
        let zx2 = acx.scale(-0.5).sub(sq);
        let zxmax = if zx1.abs() > zx2.abs() { zx1 } else { zx2 };
        let zxmin = bcx.div(zxmax);
        roots[0] = zxmin;
        roots[1] = zxmin.conj();
        roots[2] = zxmax;
        roots[3] = zxmax.conj();
    } else {
        // whichcase == 1 with complex factors: solve both complex quadratics.
        let cdiskr = acx.mul(acx).sub(bcx.scale(4.0)).csqrt();
        let zx1 = acx.add(cdiskr).scale(-0.5);
        let zx2 = acx.sub(cdiskr).scale(-0.5);
        let zxmax = if zx1.abs() > zx2.abs() { zx1 } else { zx2 };
        roots[0] = zxmax;
        roots[1] = bcx.div(zxmax);
        let cdiskr = ccx.mul(ccx).sub(dcx.scale(4.0)).csqrt();
        let zx1 = ccx.add(cdiskr).scale(-0.5);
        let zx2 = ccx.sub(cdiskr).scale(-0.5);
        let zxmax = if zx1.abs() > zx2.abs() { zx1 } else { zx2 };
        roots[2] = zxmax;
        roots[3] = dcx.div(zxmax);
    }

    let mut out = Roots {
        count: 4,
        re: [0.0; 4],
        im: [0.0; 4],
    };
    for (k, r) in roots.iter().enumerate() {
        out.re[k] = r.re * rfact;
        out.im[k] = r.im * rfact;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::consts::Eps;
    use crate::math::{smallest_positive_real_root, Pcg32};

    // -- helpers ------------------------------------------------------------

    /// Polynomial product, coefficients highest-degree first.
    fn poly_mul(a: &[f64], b: &[f64]) -> Vec<f64> {
        let mut out = vec![0.0; a.len() + b.len() - 1];
        for (i, &x) in a.iter().enumerate() {
            for (j, &y) in b.iter().enumerate() {
                out[i + j] += x * y;
            }
        }
        out
    }

    /// Expand `scale·Π(x − zk)` for four roots given as (re, im), with
    /// complex roots appearing as adjacent conjugate pairs.
    fn poly_from_roots(roots: &[(f64, f64); 4], scale: f64) -> [f64; 5] {
        let mut co = vec![1.0f64];
        let mut i = 0;
        while i < 4 {
            let (re, im) = roots[i];
            if im == 0.0 {
                co = poly_mul(&co, &[1.0, -re]);
                i += 1;
            } else {
                // (x − z)(x − z̄) = x² − 2·re·x + |z|²
                co = poly_mul(&co, &[1.0, -2.0 * re, re * re + im * im]);
                i += 2;
            }
        }
        let mut out = [0.0; 5];
        for (k, &c) in co.iter().enumerate() {
            out[k] = c * scale;
        }
        out
    }

    /// Nearest not-yet-matched computed root to `(re, im)` (complex
    /// distance); returns `(index, distance)`.
    fn nearest_unused(got: &Roots, used: &[bool; 4], re: f64, im: f64) -> (usize, f64) {
        let mut best = usize::MAX;
        let mut bd = f64::INFINITY;
        for (i, &u) in used.iter().enumerate().take(got.count as usize) {
            if u {
                continue;
            }
            let d = libm::hypot(got.re[i] - re, got.im[i] - im);
            if d < bd {
                bd = d;
                best = i;
            }
        }
        (best, bd)
    }

    /// Worst relative error of a greedy unique matching between expected
    /// roots and computed roots (complex distance / expected magnitude).
    fn match_err(expected: &[(f64, f64)], got: &Roots) -> f64 {
        assert!(expected.len() <= got.count as usize);
        let mut used = [false; 4];
        let mut worst = 0.0f64;
        for &(re, im) in expected {
            let (best, bd) = nearest_unused(got, &used, re, im);
            used[best] = true;
            worst = worst.max(bd / libm::hypot(re, im).max(f64::MIN_POSITIVE));
        }
        worst
    }

    fn uniform(rng: &mut Pcg32, lo: f64, hi: f64) -> f64 {
        lo + (hi - lo) * rng.next_f64()
    }

    /// Log-uniform magnitude over `decades` (e.g. 1e−3..1e3).
    fn sample_mag(rng: &mut Pcg32) -> f64 {
        libm::pow(10.0, uniform(rng, -3.0, 3.0))
    }

    fn sample_sign(rng: &mut Pcg32) -> f64 {
        if rng.next_u32() & 1 == 0 {
            1.0
        } else {
            -1.0
        }
    }

    /// Conditioning guard: for every root, the product of relative
    /// separations to the other roots must exceed 1e−5, so coefficient
    /// round-off (ε) perturbs roots by ≲ 4ε/1e−5 ≈ 1e−10 ≪ the 1e−9 fuzz
    /// tolerance. Clustered/degenerate roots are covered by dedicated tests.
    fn well_separated(roots: &[(f64, f64); 4]) -> bool {
        for i in 0..4 {
            let mi = libm::hypot(roots[i].0, roots[i].1);
            let mut prod = 1.0f64;
            for j in 0..4 {
                if j == i {
                    continue;
                }
                let mj = libm::hypot(roots[j].0, roots[j].1);
                let d = libm::hypot(roots[i].0 - roots[j].0, roots[i].1 - roots[j].1) / mi.max(mj);
                prod *= d.min(1.0);
            }
            if prod < 1e-5 {
                return false;
            }
        }
        true
    }

    /// Random quartic from 4 known roots: 0, 1, or 2 complex-conjugate
    /// pairs, magnitudes spread over 6 decades, random non-monic scale.
    fn gen_case(rng: &mut Pcg32) -> ([(f64, f64); 4], [f64; 5]) {
        loop {
            let n_pairs = (rng.next_u32() % 3) as usize;
            let mut roots = [(0.0, 0.0); 4];
            let mut k = 0;
            for _ in 0..n_pairs {
                let re = sample_sign(rng) * sample_mag(rng);
                let im = sample_mag(rng);
                roots[k] = (re, im);
                roots[k + 1] = (re, -im);
                k += 2;
            }
            while k < 4 {
                roots[k] = (sample_sign(rng) * sample_mag(rng), 0.0);
                k += 1;
            }
            if well_separated(&roots) {
                let scale = sample_sign(rng) * libm::pow(10.0, uniform(rng, -2.0, 2.0));
                return (roots, poly_from_roots(&roots, scale));
            }
        }
    }

    fn run_reconstruction_fuzz(cases: u32, seed: u64) {
        let mut rng = Pcg32::new(seed, 1);
        for n in 0..cases {
            let (roots, co) = gen_case(&mut rng);
            let r = solve_quartic(co[0], co[1], co[2], co[3], co[4]);
            assert_eq!(r.count, 4);
            let err = match_err(&roots, &r);
            assert!(
                err < 1e-9,
                "case {n}: roots {roots:?} coeffs {co:?} rel err {err:.3e}"
            );
        }
    }

    // -- (a) reconstruction fuzz --------------------------------------------

    #[test]
    fn reconstruction_fuzz_100k() {
        run_reconstruction_fuzz(100_000, 0x0001_314159);
    }

    #[test]
    #[ignore = "long fuzz (1e6 cases); run with --ignored"]
    fn reconstruction_fuzz_1m() {
        run_reconstruction_fuzz(1_000_000, 0xC0FFEE);
    }

    // -- (b) degenerate cases -----------------------------------------------

    #[test]
    fn double_root() {
        // (x−2)²(x−3)(x+1) = x⁴ − 6x³ + 9x² + 4x − 12
        let r = solve_quartic(1.0, -6.0, 9.0, 4.0, -12.0);
        assert_eq!(r.count, 4);
        // Simple roots at full precision, double root at ~√ε conditioning.
        assert!(match_err(&[(3.0, 0.0), (-1.0, 0.0)], &r) < 1e-10);
        assert!(match_err(&[(2.0, 0.0), (2.0, 0.0)], &r) < 1e-6);
    }

    #[test]
    fn triple_root() {
        // (x−1)³(x−5) = x⁴ − 8x³ + 18x² − 16x + 5
        let r = solve_quartic(1.0, -8.0, 18.0, -16.0, 5.0);
        assert_eq!(r.count, 4);
        assert!(match_err(&[(5.0, 0.0)], &r) < 1e-9);
        assert!(match_err(&[(1.0, 0.0), (1.0, 0.0), (1.0, 0.0)], &r) < 1e-4);
    }

    #[test]
    fn quadruple_root() {
        // (x−3)⁴ = x⁴ − 12x³ + 54x² − 108x + 81
        let r = solve_quartic(1.0, -12.0, 54.0, -108.0, 81.0);
        assert_eq!(r.count, 4);
        let quad = [(3.0, 0.0); 4];
        assert!(match_err(&quad, &r) < 1e-2, "ε^(1/4) conditioning");
    }

    #[test]
    fn biquadratic_double_pairs() {
        // (x²−1)² = x⁴ − 2x² + 1: double roots at ±1 (d2 ≈ 0 path).
        let r = solve_quartic(1.0, 0.0, -2.0, 0.0, 1.0);
        assert_eq!(r.count, 4);
        let exp = [(1.0, 0.0), (1.0, 0.0), (-1.0, 0.0), (-1.0, 0.0)];
        assert!(match_err(&exp, &r) < 1e-6);
    }

    #[test]
    fn a_zero_degrades_to_cubic() {
        // 0·x⁴ + (x−1)(x−2)(x−3)
        let r = solve_quartic(0.0, 1.0, -6.0, 11.0, -6.0);
        assert_eq!(r.count, 3);
        assert!(match_err(&[(1.0, 0.0), (2.0, 0.0), (3.0, 0.0)], &r) < 1e-11);
    }

    #[test]
    fn tiny_a_degrades_to_cubic() {
        // |a|·R = 1e−18·12 below ε·|b| = 2.2e−16 → degree-3 path.
        let r = solve_quartic(1e-18, 1.0, -6.0, 11.0, -6.0);
        assert_eq!(r.count, 3);
        assert!(match_err(&[(1.0, 0.0), (2.0, 0.0), (3.0, 0.0)], &r) < 1e-11);
        // Cascade: tiny a AND tiny b → quadratic.
        let r = solve_quartic(0.0, 1e-20, 1.0, -3.0, 2.0);
        assert_eq!(r.count, 2);
        assert!(match_err(&[(1.0, 0.0), (2.0, 0.0)], &r) < 1e-11);
    }

    #[test]
    fn tiny_a_and_b_above_threshold_stay_quartic() {
        // a, b tiny but NOT negligible under the documented threshold:
        // two roots near x² − 3x + 2 (1 and 2) plus two huge ones (~1e15).
        let r = solve_quartic(1e-30, 1e-30, 1.0, -3.0, 2.0);
        assert_eq!(r.count, 4);
        assert!(match_err(&[(1.0, 0.0), (2.0, 0.0)], &r) < 1e-7);
        assert_eq!(
            smallest_positive_real_root(&r, 0.0).map(|t| libm::round(t * 1e9)),
            Some(1e9)
        );
    }

    #[test]
    fn near_overflow_coefficients_hit_quartic_rescale() {
        // Roots ~1e76: e ≈ 2.4e305 is finite but φ₀ intermediates overflow,
        // forcing the QUART_RESCAL_FACT branch.
        let roots = [(1e76, 0.0), (-2e76, 0.0), (3e76, 0.0), (-4e76, 0.0)];
        let co = poly_from_roots(&roots, 1.0);
        assert!(co.iter().all(|c| c.is_finite()));
        let r = solve_quartic(co[0], co[1], co[2], co[3], co[4]);
        assert_eq!(r.count, 4);
        assert!(
            match_err(&roots, &r) < 1e-9,
            "err {:.3e}",
            match_err(&roots, &r)
        );
    }

    // -- (c) Newton's-cradle-like quartics (d2 safety factor) ---------------

    /// Two pairs of nearly-equal roots make the quartic almost a perfect
    /// square of a quadratic (d2 → 0) — the shape produced by Newton's
    /// cradle-like detections (balls with nearly identical velocities).
    /// The D2_SAFETY_FACTOR patch makes the solver consider the alternative
    /// factorization here; the assertion is that four DISTINCT roots come
    /// back rather than spurious doubles.
    ///
    /// Tolerances respect the intrinsic limit of f64 *coefficients*: a
    /// backward perturbation ε·Σ|aₖxᵏ| splits a near-double root by
    /// ~√(2εΣ/|p''|) ≈ 1.7e−7 for clusters at x≈2 — no solver can do
    /// better once the polynomial has been rounded, so δ below ~1e−8 is
    /// unresolvable by construction (verified: the solver then returns the
    /// cluster midpoint, which is the correct answer to within round-off).
    #[test]
    fn newtons_cradle_near_equal_roots() {
        // (base1, base2, δ, match tolerance)
        for (base1, base2, delta, tol) in [
            (1.0, 2.0, 1e-6, 2.5e-7),   // δ/4
            (1.0, 2.0, 1e-7, 2e-7),     // intrinsic-limit regime (d2 band)
            (0.01, 0.02, 1e-8, 2.5e-9), // small-t clusters, δ/4
        ] {
            let roots = [
                (base1, 0.0),
                (base1 + delta, 0.0),
                (base2, 0.0),
                (base2 + delta, 0.0),
            ];
            let co = poly_from_roots(&roots, 1.0);
            let r = solve_quartic(co[0], co[1], co[2], co[3], co[4]);
            assert_eq!(r.count, 4);
            // All four must pass the hybrid real filter (no spurious
            // imaginary parts) …
            for i in 0..4 {
                assert!(
                    r.im[i].abs() < Eps::ROOT_IM_ABS,
                    "cradle ({base1},{base2},{delta:e}): root {i} im {:e}",
                    r.im[i]
                );
            }
            // … be pairwise distinct (the patched failure mode is exact
            // duplicates from the degenerate factorization) …
            for i in 0..4 {
                for j in (i + 1)..4 {
                    assert_ne!(
                        r.re[i], r.re[j],
                        "cradle ({base1},{base2},{delta:e}): spurious double"
                    );
                }
            }
            // … and uniquely match the true roots within tolerance.
            let mut used = [false; 4];
            for &(re, _) in &roots {
                let (best, bd) = nearest_unused(&r, &used, re, 0.0);
                used[best] = true;
                assert!(
                    bd < tol,
                    "cradle case ({base1},{base2},{delta:e}): root {re} err {bd:.3e}"
                );
            }
            // The earliest event time is the first cluster's first member.
            let t = smallest_positive_real_root(&r, 0.0).expect("real root");
            assert!((t - base1).abs() < tol);
        }
    }

    // -- (d) smallest_positive_real_root filter ------------------------------

    fn roots2(a: (f64, f64), b: (f64, f64)) -> Roots {
        Roots {
            count: 2,
            re: [a.0, b.0, 0.0, 0.0],
            im: [a.1, b.1, 0.0, 0.0],
        }
    }

    #[test]
    fn filter_absolute_branch_large_re() {
        // |re| > 1e−3 → absolute test |im| < ROOT_IM_ABS (1e−9).
        let r = roots2((0.5, 5e-10), (0.5, -5e-10));
        assert_eq!(smallest_positive_real_root(&r, 0.0), Some(0.5));
        let r = roots2((0.5, 2e-9), (0.5, -2e-9));
        assert_eq!(smallest_positive_real_root(&r, 0.0), None);
    }

    #[test]
    fn filter_relative_branch_near_zero_re() {
        // |re| <= 1e−3 → relative test |im|/|re| < ROOT_IM_REL (1e−3).
        let r = roots2((1e-6, 1e-10), (1e-6, -1e-10)); // ratio 1e−4 → real
        assert_eq!(smallest_positive_real_root(&r, 0.0), Some(1e-6));
        let r = roots2((1e-6, 1e-8), (1e-6, -1e-8)); // ratio 1e−2 → complex
        assert_eq!(smallest_positive_real_root(&r, 0.0), None);
        // Sanity: constants used by the branches are the contract's.
        assert_eq!(Eps::ROOT_IM_ABS, 1e-9);
        assert_eq!(Eps::ROOT_IM_REL, 1e-3);
    }

    #[test]
    fn filter_t_min_guard() {
        let r = roots2((0.005, 0.0), (1.0, 0.0));
        assert_eq!(smallest_positive_real_root(&r, 0.0), Some(0.005));
        // Root exactly at t_min is excluded (strictly greater).
        assert_eq!(smallest_positive_real_root(&r, 0.005), Some(1.0));
        assert_eq!(smallest_positive_real_root(&r, 0.0049), Some(0.005));
        assert_eq!(smallest_positive_real_root(&r, 1.0), None);
    }

    #[test]
    fn filter_zero_negative_and_empty() {
        // Negative real roots skipped.
        let r = roots2((-1.0, 0.0), (2.0, 0.0));
        assert_eq!(smallest_positive_real_root(&r, 0.0), Some(2.0));
        // re == 0: real only when im == 0 exactly, still must exceed t_min.
        let r = roots2((0.0, 0.0), (0.0, 0.0));
        assert_eq!(smallest_positive_real_root(&r, 0.0), None);
        assert_eq!(smallest_positive_real_root(&r, -1.0), Some(0.0));
        let r = roots2((0.0, 1e-30), (0.0, -1e-30));
        assert_eq!(smallest_positive_real_root(&r, -1.0), None);
        // No roots at all.
        assert_eq!(smallest_positive_real_root(&Roots::NONE, 0.0), None);
    }

    #[test]
    fn filter_end_to_end_with_solver() {
        // (x−0.5)(x+3)(x² + x + 10): only positive real root is 0.5.
        let co = poly_from_roots(
            &[
                (0.5, 0.0),
                (-3.0, 0.0),
                (-0.5, 3.122498999199199),
                (-0.5, -3.122498999199199),
            ],
            2.0,
        );
        let r = solve_quartic(co[0], co[1], co[2], co[3], co[4]);
        let t = smallest_positive_real_root(&r, 0.0).expect("0.5 is real and positive");
        assert!((t - 0.5).abs() < 1e-12);
        // With t_min beyond it, nothing remains.
        assert_eq!(smallest_positive_real_root(&r, 0.6), None);
    }
}
