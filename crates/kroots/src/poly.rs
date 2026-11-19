// Copyright (c) Meta Platforms, Inc. and affiliates.

use crate::arith::{Expansion, Interval, X};
use core::cmp::Ordering;

#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct Pair {
    pub hi: X,
    pub lo: X,
}
impl Pair {
    pub fn single(hi: X) -> Self {
        Self { hi, lo: X::ZERO }
    }
    pub fn midpoint(a: X, b: X) -> Self {
        let (hi, lo) = a.scale(-1).add_pair(b.scale(-1));
        Self { hi, lo }
    }
    pub fn expansion(self) -> Expansion {
        let mut r = Expansion::single(self.lo);
        r.push(self.hi);
        r
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct Poly {
    pub c: [Pair; 5],
    pub n: usize,
}
impl Poly {
    pub fn new(c: &[f64; 5]) -> Self {
        let mut p = Self {
            c: [Pair::default(); 5],
            n: 0,
        };
        for (i, v) in c.iter().enumerate() {
            p.c[i] = Pair::single(X::from(*v));
            if *v != 0.0 {
                p.n = i;
            }
        }
        p
    }
    pub fn from_x(c: [X; 5], n: usize) -> Self {
        Self {
            c: c.map(Pair::single),
            n,
        }
    }
    pub fn derivative(self) -> Self {
        let mut q = Self {
            c: [Pair::default(); 5],
            n: self.n.saturating_sub(1),
        };
        for i in 1..=self.n {
            let mut r = self.c[i].expansion().times(X::from(i as f64));
            let hi = r.rounded();
            r.push(hi.neg());
            q.c[i - 1] = Pair {
                hi,
                lo: r.rounded(),
            };
        }
        q
    }
    pub fn bound(self) -> X {
        let leading = self.c[self.n].hi.abs();
        let mut h = 0;
        for i in 0..self.n {
            if self.c[i].hi.m != 0.0 {
                h = h.max(self.c[i].hi.e - leading.e + 2);
            }
        }
        X::power(h + 1)
    }
    pub fn interval(self, a: X, b: X) -> Interval {
        let x = Interval { lo: a, hi: b };
        let mut y = Interval::point(X::ZERO);
        for i in (0..=self.n).rev() {
            y = y
                .mul(x)
                .add(Interval::point(self.c[i].hi))
                .add(Interval::point(self.c[i].lo));
        }
        y
    }
    pub fn magnitude(self, x: X) -> X {
        let mut r = X::ZERO;
        for i in (0..=self.n).rev() {
            r = r
                .mul_up(x.abs())
                .add_up(self.c[i].hi.abs())
                .add_up(self.c[i].lo.abs());
        }
        r
    }
    pub fn exact(self, x: Pair) -> Expansion {
        let mut y = self.c[self.n].expansion();
        for i in (0..self.n).rev() {
            let mut r = y.times(x.hi);
            if x.lo.m != 0.0 {
                r.add_exp(&y.times(x.lo));
            }
            r.push(self.c[i].lo);
            r.push(self.c[i].hi);
            y = r;
        }
        y
    }
    /// A scaling certificate covers both the high Horner polynomial and every
    /// error-free residual. It is intentionally sufficient, rather than necessary.
    pub fn plain_safe(self, x: X) -> bool {
        let maxe = self.c[..=self.n]
            .iter()
            .filter(|c| c.hi.m != 0.0)
            .map(|c| c.hi.e)
            .max()
            .unwrap_or(0);
        (x.m == 0.0 || (-80..=80).contains(&x.e))
            && self.c[..=self.n]
                .iter()
                .all(|c| (c.hi.m == 0.0 || c.hi.e - maxe >= -200) && c.lo.m == 0.0)
    }
    pub fn approximate(self, x: X) -> X {
        let mut h = self.c[self.n].hi;
        for i in (0..self.n).rev() {
            h = h.mul(x).add(self.c[i].hi);
        }
        h
    }
    pub fn canonical(self, x: X) -> (X, X) {
        trace_decision!("roots.eval.compensated");
        let h = if self.plain_safe(x) {
            self.plain_compensation(x)
        } else {
            self.extended_compensation(x)
        };
        let u = X::power(-53);
        let gamma = X::from((2 * self.n) as f64)
            .mul(u)
            .div_up(X::ONE.sub(X::from((2 * self.n) as f64).mul(u)));
        let e = u
            .mul_up(h.abs())
            .add_up(gamma.mul_up(gamma).mul_up(self.magnitude(x)))
            .div_up(X::ONE.sub(u));
        (h, e)
    }
    fn plain_compensation(self, x: X) -> X {
        let beta = self.c[..=self.n]
            .iter()
            .filter(|c| c.hi.m != 0.0)
            .map(|c| c.hi.e)
            .max()
            .unwrap_or(0);
        let t = x.to_f64();
        let mut h = self.c[self.n].hi.scale(-beta).to_f64();
        let mut correction = 0.0;
        for i in (0..self.n).rev() {
            let hs = 134217729.0 * h;
            let ts = 134217729.0 * t;
            let hh = hs - (hs - h);
            let th = ts - (ts - t);
            let hl = h - hh;
            let tl = t - th;
            let prod = h * t;
            let pi = ((hh * th - prod) + hh * tl + hl * th) + hl * tl;
            let c = self.c[i].hi.scale(-beta).to_f64();
            let sum = prod + c;
            let z = sum - prod;
            let sigma = (prod - (sum - z)) + (c - z);
            correction = correction * t + (pi + sigma);
            h = sum;
        }
        X::from(h + correction).scale(beta)
    }
    fn extended_compensation(self, x: X) -> X {
        let mut h = self.c[self.n].hi;
        let mut correction = X::ZERO;
        for i in (0..self.n).rev() {
            let (prod, pi) = h.mul_pair(x);
            let (sum, sigma) = prod.add_pair(self.c[i].hi);
            correction = correction.mul(x).add(pi.add(sigma));
            h = sum;
        }
        h.add(correction)
    }
    pub fn sign(self, x: Pair) -> i8 {
        trace_decision!("roots.eval.plain");
        if x.lo.m == 0.0 && self.plain_safe(x.hi) {
            let beta = self.c[..=self.n]
                .iter()
                .filter(|c| c.hi.m != 0.0)
                .map(|c| c.hi.e)
                .max()
                .unwrap_or(0);
            let t = x.hi.to_f64();
            let mut h = self.c[self.n].hi.scale(-beta).to_f64();
            let mut s = h.abs();
            for i in (0..self.n).rev() {
                let c = self.c[i].hi.scale(-beta).to_f64();
                h = h * t + c;
                s = s * t.abs() + c.abs();
            }
            // This enlarged bound includes rounding in its own positive Horner.
            let err = s * ((4 * self.n + 4) as f64 * f64::from_bits(970_u64 << 52));
            if h.abs() > err {
                return if h > 0.0 { 1 } else { -1 };
            }
        } else if x.lo.m == 0.0 {
            let h = self.approximate(x.hi);
            let err = self
                .magnitude(x.hi)
                .mul_up(X::from((4 * self.n + 4) as f64).scale(-53));
            let low = self.low_magnitude(x.hi);
            if h.abs().cmp(err.add_up(low)) == Ordering::Greater {
                return h.sign();
            }
        }
        if x.lo.m == 0.0 {
            let (h, e) = self.canonical(x.hi);
            if h.abs().cmp(e.add_up(self.low_magnitude(x.hi))) == Ordering::Greater {
                return h.sign();
            }
        } else {
            trace_decision!("roots.eval.compensated");
        }
        trace_decision!("roots.eval.exact");
        self.exact(x).sign()
    }
    fn low_magnitude(self, x: X) -> X {
        let mut h = X::ZERO;
        for i in (0..=self.n).rev() {
            h = h.mul_up(x.abs()).add_up(self.c[i].lo.abs());
        }
        h
    }
    pub fn excludes(self, a: X, b: X) -> bool {
        let value = self.interval(a, b);
        let lower = if value.sign() > 0 {
            value.lo
        } else if value.sign() < 0 {
            value.hi.neg()
        } else {
            return false;
        };
        let x = if a.abs().cmp(b.abs()) == Ordering::Greater {
            a.abs()
        } else {
            b.abs()
        };
        lower.cmp(self.magnitude(x).scale(-47)) == Ordering::Greater
    }
    pub fn discriminant(self) -> Expansion {
        let mut b = self.c[1].expansion().product_exp(&self.c[1].expansion());
        b.sub_exp(
            &self.c[0]
                .expansion()
                .product_exp(&self.c[2].expansion())
                .times(X::from(4.0)),
        );
        b
    }
    pub fn cubic_discriminant(self) -> Expansion {
        let d = self.c[0].expansion();
        let c = self.c[1].expansion();
        let b = self.c[2].expansion();
        let a = self.c[3].expansion();
        let mut r = a
            .product_exp(&b)
            .product_exp(&c)
            .product_exp(&d)
            .times(X::from(18.0));
        r.sub_exp(
            &b.product_exp(&b)
                .product_exp(&b)
                .product_exp(&d)
                .times(X::from(4.0)),
        );
        r.add_exp(&b.product_exp(&b).product_exp(&c).product_exp(&c));
        r.sub_exp(
            &a.product_exp(&c)
                .product_exp(&c)
                .product_exp(&c)
                .times(X::from(4.0)),
        );
        r.sub_exp(
            &a.product_exp(&a)
                .product_exp(&d)
                .product_exp(&d)
                .times(X::from(27.0)),
        );
        r
    }
    /// Eliminate the leading powers of p and p'. A nonzero linear remainder
    /// identifies their sole possible common zero without rounding its ratio.
    pub fn common_zero_in(self, left: X, right: X) -> bool {
        fn contains(l: &Expansion, c: &Expansion, a: X, b: X) -> bool {
            let mut v = l.times(a);
            v.add_exp(c);
            let mut w = l.times(b);
            w.add_exp(c);
            v.sign() == 0 || w.sign() == 0 || v.sign() != w.sign()
        }
        if self.n == 2 {
            return self.discriminant().sign() == 0;
        }
        let c = self.c.map(Pair::expansion);
        if self.n == 3 {
            if self.cubic_discriminant().sign() != 0 {
                return false;
            }
            let mut l = c[3].product_exp(&c[1]).times(X::from(6.0));
            l.sub_exp(&c[2].product_exp(&c[2]).times(X::from(2.0)));
            let mut k = c[3].product_exp(&c[0]).times(X::from(9.0));
            k.sub_exp(&c[2].product_exp(&c[1]));
            return if l.sign() == 0 {
                k.sign() == 0
            } else {
                contains(&l, &k, left, right)
            };
        }
        if self.n != 4 {
            return false;
        }
        if !self.has_common_zero() {
            return false;
        }
        let mut aa = c[4].product_exp(&c[2]).times(X::from(8.0));
        aa.sub_exp(&c[3].product_exp(&c[3]).times(X::from(3.0)));
        let mut bb = c[4].product_exp(&c[1]).times(X::from(12.0));
        bb.sub_exp(&c[3].product_exp(&c[2]).times(X::from(2.0)));
        let mut cc = c[4].product_exp(&c[0]).times(X::from(16.0));
        cc.sub_exp(&c[3].product_exp(&c[1]));
        if aa.sign() == 0 {
            return if bb.sign() == 0 {
                cc.sign() == 0
            } else {
                contains(&bb, &cc, left, right)
            };
        }
        let mut v = c[3].product_exp(&aa).times(X::from(3.0));
        v.sub_exp(&c[4].product_exp(&bb).times(X::from(4.0)));
        let square = aa.product_exp(&aa);
        let mut l = c[2].product_exp(&square).times(X::from(2.0));
        l.sub_exp(&c[4].product_exp(&aa).product_exp(&cc).times(X::from(4.0)));
        l.sub_exp(&v.product_exp(&bb));
        let mut k = c[1].product_exp(&square);
        k.sub_exp(&v.product_exp(&cc));
        if l.sign() != 0 {
            return contains(&l, &k, left, right);
        }
        if k.sign() != 0 {
            return false;
        }
        let evaluate = |x: X| {
            let mut z = aa.times(x);
            z.add_exp(&bb);
            z = z.times(x);
            z.add_exp(&cc);
            z.sign()
        };
        let s = evaluate(left);
        let t = evaluate(right);
        if s == 0 || t == 0 || s != t {
            return true;
        }
        // A double root of the common quadratic has no sign change.
        let mut discr = bb.product_exp(&bb);
        discr.sub_exp(&aa.product_exp(&cc).times(X::from(4.0)));
        discr.sign() == 0 && contains(&aa.times(X::from(2.0)), &bb, left, right)
    }
    fn has_common_zero(self) -> bool {
        // The determinant of the coefficient map (u,v) -> u p + v p'
        // vanishes exactly when the two polynomials have a common factor.
        let derivative = self.derivative();
        let mut matrix = [[Pair::default(); 7]; 7];
        for (row, items) in matrix.iter_mut().enumerate().take(3) {
            items[row..row + 5].copy_from_slice(&self.c);
        }
        for (offset, items) in matrix.iter_mut().skip(3).enumerate() {
            items[offset..offset + 4].copy_from_slice(&derivative.c[..4]);
        }
        fn determinant(
            matrix: &[[Pair; 7]; 7],
            row: usize,
            mask: u8,
            negative: bool,
            term: &Expansion,
            sum: &mut Expansion,
        ) {
            if row == 7 {
                if negative {
                    sum.sub_exp(term);
                } else {
                    sum.add_exp(term);
                }
                return;
            }
            for column in 0..7 {
                if mask & (1 << column) != 0 || matrix[row][column].hi.m == 0.0 {
                    continue;
                }
                let coeff = matrix[row][column];
                let mut next = term.times(coeff.hi);
                next.add_exp(&term.times(coeff.lo));
                let inversions = (mask >> (column + 1)).count_ones() & 1 != 0;
                determinant(
                    matrix,
                    row + 1,
                    mask | (1 << column),
                    negative ^ inversions,
                    &next,
                    sum,
                );
            }
        }
        let mut result = Expansion::zero();
        determinant(
            &matrix,
            0,
            0,
            false,
            &Expansion::single(X::ONE),
            &mut result,
        );
        result.sign() == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn compensation_is_identical_in_both_representations() {
        let cases = [
            ([-f64::from_bits(923_u64 << 52), 1., -2., 1., 0.], 1.),
            ([4., 0., -4., 0., 1.], f64::from_bits(0x3ff6_a09e_667f_3bcd)),
        ];
        for (c, x) in cases {
            for e in [-900, 0, 900] {
                let scale = X::power(e).to_f64();
                let p = Poly::new(&c.map(|v| v * scale));
                assert_eq!(
                    p.plain_compensation(X::from(x)),
                    p.extended_compensation(X::from(x))
                );
            }
        }
    }
}
