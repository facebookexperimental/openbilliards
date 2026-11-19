// Copyright (c) Meta Platforms, Inc. and affiliates.

//! One-sided binary64 certificates; see FILTERS.md for the error bounds.
//! A false result is inconclusive and leaves the exact path in charge.

pub(super) const BOUNDARY: usize = 0;
pub(super) const SHAPE: usize = 1;
pub(super) const QUADRATIC: usize = 2;
pub(super) const DERIVATIVE: usize = 3;
pub(super) const BOUNDARY_EXACT: usize = 4;
pub(super) const MINIMUM_EXACT: usize = 5;
pub(super) const PRE_SCREEN: usize = 6;
pub(super) const BERNSTEIN: usize = 7;
pub(super) const STATIONARY_BOUND: usize = 8;
pub(super) const TOUCH_PARTITION: usize = 9;
pub(super) const MINIMUM_INTERVAL: usize = 10;
pub(super) const POSITIVE_REFINED: usize = 11;
pub(super) const INSIDE_LOWER: usize = 12;
pub(super) const SCREEN_ENTRY: usize = 13;
pub(super) const CONTACT_EMPTY: usize = 14;
pub(super) const CONTACT_ROOT: usize = 15;
pub(super) const CONTACT_UNDECIDED: usize = 16;

#[cfg(test)]
std::thread_local! {
    static COUNTS: std::cell::Cell<[u64; 17]> = const { std::cell::Cell::new([0; 17]) };
}

#[inline(always)]
pub(super) fn record(index: usize) {
    #[cfg(test)]
    COUNTS.with(|counts| {
        let mut values = counts.get();
        values[index] += 1;
        counts.set(values);
    });
    #[cfg(not(test))]
    let _ = index;
}

#[cfg(test)]
pub(super) fn take_counts() -> [u64; 17] {
    COUNTS.with(|counts| counts.replace([0; 17]))
}

/// Closed outward enclosure. Any non-finite intermediate is inconclusive.
#[derive(Clone, Copy, Debug)]
pub(super) struct Interval {
    pub(super) lo: f64,
    pub(super) hi: f64,
}

impl Interval {
    pub(super) fn point(x: f64) -> Self {
        Self { lo: x, hi: x }
    }

    pub(super) fn add(self, other: Self) -> Self {
        Self {
            lo: (self.lo + other.lo).next_down(),
            hi: (self.hi + other.hi).next_up(),
        }
    }

    pub(super) fn mul(self, other: Self) -> Self {
        let products = [
            self.lo * other.lo,
            self.lo * other.hi,
            self.hi * other.lo,
            self.hi * other.hi,
        ];
        // min/max ignore NaNs; reject them before they can hide overflow.
        if products.iter().any(|v| !v.is_finite()) {
            return Self {
                lo: f64::NEG_INFINITY,
                hi: f64::INFINITY,
            };
        }
        Self {
            lo: products
                .iter()
                .copied()
                .fold(f64::INFINITY, f64::min)
                .next_down(),
            hi: products
                .iter()
                .copied()
                .fold(f64::NEG_INFINITY, f64::max)
                .next_up(),
        }
    }

    pub(super) fn finite(self) -> bool {
        self.lo.is_finite() && self.hi.is_finite()
    }

    fn strict_sign(self) -> bool {
        self.finite() && (self.lo > 0.0 || self.hi < 0.0)
    }
}

/// Certifies BOTH baseline sign tests on the superset [lo, next_up(lo)].
pub(super) fn outside_lower_cell(c: &[f64; 5], lo: f64) -> bool {
    let x = Interval {
        lo,
        hi: lo.next_up(),
    };
    if !x.finite() {
        return false;
    }
    let mut value = Interval::point(c[4]);
    for &coefficient in c[..4].iter().rev() {
        value = value.mul(x).add(Interval::point(coefficient));
    }
    let decided = value.finite() && value.lo > 0.0;
    if decided {
        record(BOUNDARY);
    }
    decided
}

pub(super) fn negative_at(c: &[f64; 5], x: f64) -> bool {
    let x = Interval::point(x);
    let value = c[..4].iter().rev().fold(Interval::point(c[4]), |v, &a| {
        v.mul(x).add(Interval::point(a))
    });
    value.finite() && value.hi < 0.0
}

pub(super) fn refined_positive_window(c: &[f64; 5], lo: f64, hi: f64) -> bool {
    if lo < 0.0 || !hi.is_finite() {
        return false;
    }
    let mut q = *c;
    for v in &mut q {
        if *v != 0.0 {
            let margin = (v.abs() * (64.0 * f64::EPSILON)).next_up();
            *v = (*v - margin).next_down();
            if !v.is_finite() {
                return false;
            }
        }
    }
    super::stationary::positive_window(&q, lo, hi)
}

/// F11: a strictly interior sign-changing bracket proves the shifted
/// root query nonempty. Only its Boolean result is needed by the caller.
pub(super) fn has_entry(c: &[f64; 5], lo: f64, hi: f64) -> bool {
    let a = lo.next_up();
    if !hi.is_finite() || a >= hi || c[2] <= 0.0 {
        return false;
    }
    let mut b = (-c[1] / (2.0 * c[2])).clamp(a, hi);
    for _ in 0..8 {
        let d = ((4.0 * c[4] * b + 3.0 * c[3]) * b + 2.0 * c[2]) * b + c[1];
        let q = (12.0 * c[4] * b + 6.0 * c[3]) * b + 2.0 * c[2];
        if q <= 0.0 {
            break;
        }
        let next = (b - d / q).clamp(a, hi);
        if !next.is_finite() || next == b {
            break;
        }
        b = next;
    }
    if !b.is_finite() || b <= a {
        return false;
    }
    let at = |t| {
        c[..4].iter().rev().fold(Interval::point(c[4]), |v, &a| {
            v.mul(Interval::point(t)).add(Interval::point(a))
        })
    };
    let left = at(a);
    let right = at(b);
    left.finite()
        && right.finite()
        && ((left.lo > 0.0 && right.hi < 0.0) || (left.hi < 0.0 && right.lo > 0.0))
}

/// Proves no eligible stationary minimum in the exact search region.
pub(super) fn no_minimum(c: &[f64; 5], lo: f64, hi: f64) -> bool {
    // Degrees <=1 have no isolated stationary minimum. A nonpositive
    // quadratic has only a maximum (or no stationary point).
    if (c[4] == 0.0 && c[3] == 0.0 && c[2] <= 0.0)
        || (lo >= 0.0 && (c[1..].iter().all(|&v| v >= 0.0) || c[1..].iter().all(|&v| v <= 0.0)))
    {
        record(SHAPE);
        return true;
    }
    // At the unique quadratic minimum, 4*c2*C(m) = 4*c2*c0 - c1^2.
    // A strictly negative value rules out the required nonnegative gap.
    if c[4] == 0.0 && c[3] == 0.0 && c[2] > 0.0 {
        let left = Interval::point(4.0)
            .mul(Interval::point(c[2]))
            .mul(Interval::point(c[0]));
        let right = Interval::point(c[1]).mul(Interval::point(c[1]));
        if left.finite() && right.finite() && left.hi < right.lo {
            record(QUADRATIC);
            return true;
        }
    }
    if hi.is_finite() && bernstein_no_minimum(c, lo, hi) {
        record(BERNSTEIN);
        return true;
    }
    // Enclose the derivative on a small partition; a curvature certificate
    // can also place its extrema at the endpoints of an individual piece.
    if hi.is_finite() && derivative_nonzero(c, lo, hi) {
        record(DERIVATIVE);
        return true;
    }
    false
}

/// F5: Bernstein coefficient signs bound the number and direction of
/// derivative crossings, including stationary points of odd multiplicity.
pub(super) fn bernstein_no_minimum(c: &[f64; 5], lo: f64, hi: f64) -> bool {
    let d = [
        Interval::point(c[1]),
        Interval::point(2.0).mul(Interval::point(c[2])),
        Interval::point(3.0).mul(Interval::point(c[3])),
        Interval::point(4.0).mul(Interval::point(c[4])),
    ];
    let eval = |t| {
        let x = Interval::point(t);
        d[..3].iter().rev().fold(d[3], |v, &a| v.mul(x).add(a))
    };
    let second = |t| {
        let x = Interval::point(t);
        d[3].mul(Interval::point(3.0))
            .mul(x)
            .add(d[2].mul(Interval::point(2.0)))
            .mul(x)
            .add(d[1])
    };
    let width = Interval {
        lo: (hi - lo).next_down(),
        hi: (hi - lo).next_up(),
    };
    if !width.finite() || width.lo < 0.0 {
        return false;
    }
    let a = eval(lo).mul(Interval::point(3.0));
    let b = eval(hi).mul(Interval::point(3.0));
    let wb = width.mul(second(hi));
    let controls = [
        a,
        a.add(width.mul(second(lo))),
        b.add(Interval {
            lo: -wb.hi,
            hi: -wb.lo,
        }),
        b,
    ];
    let mut negative = false;
    for value in controls {
        if !value.finite() {
            return false;
        }
        if value.hi < 0.0 {
            negative = true;
        } else if value.lo > 0.0 {
            if negative {
                return false;
            }
        } else {
            return false;
        }
    }
    true
}

fn derivative_nonzero(c: &[f64; 5], lo: f64, hi: f64) -> bool {
    let d = [
        Interval::point(c[1]),
        Interval::point(2.0).mul(Interval::point(c[2])),
        Interval::point(3.0).mul(Interval::point(c[3])),
        Interval::point(4.0).mul(Interval::point(c[4])),
    ];
    let eval = |x: Interval| d[..3].iter().rev().fold(d[3], |v, &a| v.mul(x).add(a));
    let mut stack = [(0.0, 0.0, 0_u8); 4];
    stack[0] = (lo, hi, 0);
    let mut len = 1;
    while len > 0 {
        len -= 1;
        let (a, b, depth) = stack[len];
        let x = Interval { lo: a, hi: b };
        if eval(x).strict_sign() {
            continue;
        }
        // If C'' keeps a strict sign, C' is monotone. Strict equal
        // endpoint signs then enclose its entire range away from zero.
        let second = d[3]
            .mul(Interval::point(3.0))
            .mul(x)
            .add(d[2].mul(Interval::point(2.0)))
            .mul(x)
            .add(d[1]);
        if second.strict_sign() {
            let left = eval(Interval::point(a));
            let right = eval(Interval::point(b));
            if left.finite()
                && right.finite()
                && ((left.lo > 0.0 && right.lo > 0.0) || (left.hi < 0.0 && right.hi < 0.0))
            {
                continue;
            }
        }
        if depth == 3 {
            return false;
        }
        let mid = a * 0.5 + b * 0.5;
        if !mid.is_finite() || mid <= a || mid >= b {
            return false;
        }
        stack[len] = (mid, b, depth + 1);
        stack[len + 1] = (a, mid, depth + 1);
        len += 2;
    }
    true
}

/// F0: certify a strictly positive polynomial over the whole query window.
/// See FILTERS.md. The work budget is at most 15 interval Horner evaluations.
pub(super) fn positive_window(c: &[f64; 5], lo: f64, hi: f64) -> bool {
    if !lo.next_up().is_finite() {
        return false;
    }
    if c[1..].iter().all(|&v| v == 0.0) {
        return c[0] > 0.0;
    }
    if lo < 0.0 {
        return false;
    }
    if c[0] > 0.0 && c[1..].iter().all(|&v| v >= 0.0) {
        return true;
    }
    // A stronger positivity certificate preserves every delivered API
    // output, including its stationary representatives (F-PROOF.md).
    // q <= screen - 128u * sum_i |screen_i| t^i on the nonnegative axis.
    let mut q = *c;
    for v in &mut q {
        if *v != 0.0 {
            let margin = (v.abs() * (64.0 * f64::EPSILON)).next_up();
            *v = (*v - margin).next_down();
            if !v.is_finite() {
                return false;
            }
        }
    }
    positive_enclosure(&q, lo, hi)
}

fn positive_enclosure(c: &[f64; 5], lo: f64, hi: f64) -> bool {
    if !lo.next_up().is_finite() {
        return false;
    }
    let n = c.iter().rposition(|&v| v != 0.0).unwrap_or(0);
    if n == 0 {
        return c[0] > 0.0;
    }
    if lo >= 0.0 && c[0] > 0.0 && c[1..=n].iter().all(|&v| v >= 0.0) {
        return true;
    }
    let end = if hi.is_finite() {
        hi
    } else {
        if c[n] <= 0.0 {
            return false;
        }
        // For T=2^k, each negative term is <= c[n]*T^n/8.
        // At most four terms are negative, so p(t)>=c[n]*t^n/2
        // for every t>=T. Rounded ratios and exponent bounds are upward.
        let mut power = -1074;
        for (i, &v) in c[..n].iter().enumerate() {
            if v >= 0.0 {
                continue;
            }
            let ratio = (-v / c[n]).next_up();
            if !ratio.is_finite() {
                return false;
            }
            let bits = ratio.to_bits();
            let biased = (bits >> 52) as i32;
            let exponent = if biased == 0 {
                -1074 + (64 - bits.leading_zeros()) as i32
            } else {
                biased - 1022
            };
            let degree = (n - i) as i32;
            let numerator = exponent + 3;
            // Integer ceil division, including negative exponents.
            let k = -(-numerator).div_euclid(degree);
            power = power.max(k);
        }
        if power > 1023 {
            return false;
        }
        let bound = libm::scalbn(1.0, power);
        if lo >= bound {
            return true;
        }
        bound
    };
    let mut stack = [(0.0, 0.0, 0_u8); 4];
    stack[0] = (lo, end, 0);
    let mut len = 1;
    while len > 0 {
        len -= 1;
        let (a, b, depth) = stack[len];
        if positive_piece(c, n, a, b) {
            continue;
        }
        if depth == 3 {
            return false;
        }
        // A rounded split still partitions the REAL closed interval exactly.
        let mid = a * 0.5 + b * 0.5;
        if !mid.is_finite() || mid <= a || mid >= b {
            return false;
        }
        stack[len] = (mid, b, depth + 1);
        stack[len + 1] = (a, mid, depth + 1);
        len += 2;
    }
    true
}

pub(super) fn positive_piece(c: &[f64; 5], n: usize, lo: f64, hi: f64) -> bool {
    if lo >= 0.0 {
        // For x>=0 the lower product endpoint depends only on the lower
        // accumulator. An upper accumulator cannot improve this bound.
        let mut lower = c[n];
        for &v in c[..n].iter().rev() {
            let x = if lower < 0.0 { hi } else { lo };
            let product = lower * x;
            if !product.is_finite() {
                return false;
            }
            let sum = product.next_down() + v;
            if !sum.is_finite() {
                return false;
            }
            lower = sum.next_down();
            if !lower.is_finite() {
                return false;
            }
        }
        lower > 0.0
    } else {
        let x = Interval { lo, hi };
        let mut value = Interval::point(c[n]);
        for &v in c[..n].iter().rev() {
            value = value.mul(x).add(Interval::point(v));
        }
        value.finite() && value.lo > 0.0
    }
}

/// F6: outward root bound for the EXACT derivative, without rounding its
/// coefficients into a different polynomial. No stationary root is >= T.
pub(super) fn stationary_bound(c: &[f64; 5]) -> Option<f64> {
    let n = c.iter().rposition(|&v| v != 0.0)?;
    if n < 2 {
        return None;
    }
    let leading_product = n as f64 * c[n].abs();
    if !leading_product.is_finite() {
        return None;
    }
    let lead = leading_product.next_down();
    if !lead.is_finite() || lead <= 0.0 {
        return None;
    }
    let mut power = -1074;
    for (i, &v) in c.iter().enumerate().take(n).skip(1) {
        if v == 0.0 {
            continue;
        }
        let magnitude = (i as f64 * v.abs()).next_up();
        let ratio = (magnitude / lead).next_up();
        if !ratio.is_finite() {
            return None;
        }
        let bits = ratio.to_bits();
        let biased = (bits >> 52) as i32;
        let exponent = if biased == 0 {
            -1074 + (64 - bits.leading_zeros()) as i32
        } else {
            biased - 1022
        };
        let degree = (n - i) as i32;
        power = power.max(-(-(exponent + 3)).div_euclid(degree));
    }
    if power > 1023 {
        return None;
    }
    Some(libm::scalbn(1.0, power))
}

/// F7: each closed piece either stays above the D-6 gap allowance or has
/// no minimum. The union therefore contains no eligible D-6 touch.
pub(super) fn no_touch(c: &[f64; 5], shifted: &[f64; 5], lo: f64, hi: f64) -> bool {
    if !hi.is_finite() || lo >= hi {
        return false;
    }
    let n = shifted.iter().rposition(|&v| v != 0.0).unwrap_or(0);
    let mut stack = [(0.0, 0.0, 0_u8); 5];
    stack[0] = (lo, hi, 0);
    let mut len = 1;
    while len > 0 {
        len -= 1;
        let (a, b, depth) = stack[len];
        if positive_piece(shifted, n, a, b) || bernstein_no_minimum(c, a, b) {
            continue;
        }
        if depth == 4 {
            return false;
        }
        let mid = a * 0.5 + b * 0.5;
        if !mid.is_finite() || mid <= a || mid >= b {
            return false;
        }
        stack[len] = (mid, b, depth + 1);
        stack[len + 1] = (a, mid, depth + 1);
        len += 2;
    }
    true
}
