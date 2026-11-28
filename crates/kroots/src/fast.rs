// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Sufficient certificates in a bounded binary64 exponent range.
use crate::WindowRoots;
const U: f64 = 1.1102230246251565e-16;

#[inline]
fn down(x: f64) -> f64 {
    if x == 0. {
        -f64::from_bits(1)
    } else {
        f64::from_bits(if x > 0. {
            x.to_bits() - 1
        } else {
            x.to_bits() + 1
        })
    }
}

pub(crate) fn empty(c: &[f64; 5], n: usize, lo: f64, hi: f64) -> bool {
    let axis = if lo >= 0. {
        1.
    } else if hi <= 0. {
        -1.
    } else {
        return false;
    };
    let sign = if c[n] > 0. { 1. } else { -1. };
    let mut q = [0.; 5];
    let mut all = true;
    for i in 0..=n {
        let v = c[i] * sign * if axis < 0. && i % 2 == 1 { -1. } else { 1. };
        q[i] = v;
        all &= v >= 0.;
    }
    if all && !(hi == 0. && c[0] == 0.) {
        trace_decision!("roots.empty.variation");
        return true;
    }
    if n != 2 && n != 4 {
        return false;
    }
    // All subsequent products have a dyadic support strictly within the
    // normal range, including cancellation and outward error margins.
    let exponents = if n == 2 { 823..=1223 } else { 943..=1063 };
    if c[..=n]
        .iter()
        .any(|v| *v != 0. && !exponents.contains(&((v.to_bits() >> 52) & 2047)))
    {
        return false;
    }
    for v in &mut q[..=n] {
        if *v != 0. {
            *v = down(*v - 128. * U * v.abs());
        }
    }
    let positive = if n == 2 {
        let ac = 4. * q[2] * q[0];
        let bb = q[1] * q[1];
        q[2] > 0. && q[0] > 0. && ac - bb > 16. * U * (ac.abs() + bb)
    } else {
        let [e, d, c, b, a] = q;
        if a <= 0. || e <= 0. {
            return false;
        }
        // On the positive half-axis positive odd terms can be discarded.
        // Two completed squares then give a cheap sufficient lower bound.
        let dn = d.min(0.);
        let bn = b.min(0.);
        let positive = 4. * a * e * c;
        let negative = a * dn * dn + e * bn * bn;
        if positive - negative > 32. * U * (positive.abs() + negative) {
            trace_decision!("roots.empty.interval");
            return true;
        }
        let i = c * c - 3. * b * d + 12. * a * e;
        if i <= 0. {
            return false;
        }
        // This parameter maximizes the Gram determinant locally. Its value
        // is only a proposal: the two minors below certify the chosen matrix.
        let z = (c - i.sqrt()) / 6.;
        let ae = a * e;
        let zz = z * z;
        if ae - zz <= 16. * U * (ae + zz) {
            return false;
        }
        let terms = [
            a * c * e,
            -2. * ae * z,
            -0.25 * e * b * b,
            -0.25 * a * d * d,
            0.5 * b * d * z,
            -c * zz,
            2. * z * zz,
        ];
        let det = terms.iter().sum::<f64>();
        let sum = terms.iter().map(|x| x.abs()).sum::<f64>();
        det > 64. * U * sum
    };
    if positive {
        trace_decision!("roots.empty.interval");
    }
    positive
}

#[inline(always)]
pub(crate) fn roots(
    c: &[f64; 5],
    n: usize,
    lo: f64,
    hi: f64,
    first: bool,
    prefix: &mut Option<f64>,
) -> Option<WindowRoots> {
    if n != 2 || c[0] == 0. {
        return None;
    }
    let [cc, b, a, _, _] = *c;
    if lo >= 0.
        && a.is_sign_negative() == cc.is_sign_negative()
        && (b == 0. || b.is_sign_negative() == a.is_sign_negative())
    {
        trace_decision!("roots.empty.variation");
        return Some(WindowRoots::EMPTY);
    }
    if c[..=n]
        .iter()
        .any(|v| *v != 0. && !((823..=1223).contains(&((v.to_bits() >> 52) & 2047))))
    {
        return None;
    }
    let bb = b * b;
    let ac = 4. * a * cc;
    let d = bb - ac;
    if d < -1024. * U * (bb + ac.abs()) {
        trace_decision!("roots.empty.interval");
        return Some(WindowRoots::EMPTY);
    }
    // The relative discriminant gap bounds both square-root perturbation and
    // root separation. Ambiguous pairs use the exact procedure.
    if d <= (bb + ac.abs()) * 0.00000095367431640625 {
        return None;
    }
    let s = d.sqrt();
    let q = -0.5 * (b + if b < 0. { -s } else { s });
    let large_first = q.is_sign_negative() != a.is_sign_negative();
    // The discriminant gap implies |B|/sqrt(D)<1025. This uniform
    // endpoint guard bounds location and nearest-rounding uncertainty.
    let k = 32768. * U;
    let mut out = WindowRoots::EMPTY;
    for large in [large_first, !large_first] {
        let negative = if large {
            large_first
        } else {
            cc.is_sign_negative() != q.is_sign_negative()
        };
        if (negative && lo >= 0.) || (!negative && hi <= 0.) {
            continue;
        }
        let x = if large { q / a } else { cc / q };
        let e = k * x.abs();
        if !x.is_normal() {
            return None;
        }
        if (x - lo).abs() <= e || (hi.is_finite() && (x - hi).abs() <= e) {
            return None;
        }
        if x > lo && x <= hi {
            out.t[out.len as usize] = x;
            out.len += 1;
            if prefix.is_none() {
                *prefix = Some(x);
            }
            if first {
                break;
            }
        }
    }
    trace_decision!("roots.arithmetic.plain");
    if out.len == 0 {
        trace_decision!("roots.empty.interval");
    }
    if first && out.len > 1 {
        out.len = 1;
        out.t[1..].fill(0.);
    }
    Some(out)
}
