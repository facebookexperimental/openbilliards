// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Binary64 significands with an unbounded (within i32) binary exponent.
use core::cmp::Ordering;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub(crate) struct X {
    pub m: f64,
    pub e: i32,
}

impl X {
    pub const ZERO: Self = Self { m: 0.0, e: 0 };
    pub const ONE: Self = Self { m: 1.0, e: 0 };
    pub fn new(m: f64, e: i32) -> Self {
        if m == 0.0 {
            return Self::ZERO;
        }
        let bits = m.to_bits();
        let be = ((bits >> 52) & 2047) as i32;
        if be == 0 {
            return Self::new(m * 18014398509481984.0, e - 54);
        }
        Self {
            m: f64::from_bits((bits & 0x800f_ffff_ffff_ffff) | (1023_u64 << 52)),
            e: e + be - 1023,
        }
    }
    pub fn from(v: f64) -> Self {
        Self::new(v, 0)
    }
    pub fn power(e: i32) -> Self {
        Self { m: 1.0, e }
    }
    pub fn neg(self) -> Self {
        Self {
            m: -self.m,
            e: self.e,
        }
    }
    pub fn abs(self) -> Self {
        Self {
            m: self.m.abs(),
            e: self.e,
        }
    }
    pub fn scale(self, k: i32) -> Self {
        if self.m == 0.0 {
            self
        } else {
            Self {
                m: self.m,
                e: self.e + k,
            }
        }
    }
    pub fn sign(self) -> i8 {
        if self.m > 0.0 {
            1
        } else if self.m < 0.0 {
            -1
        } else {
            0
        }
    }
    pub fn cmp(self, b: Self) -> Ordering {
        let s = self.sign();
        let t = b.sign();
        if s != t {
            return s.cmp(&t);
        }
        if s == 0 {
            return Ordering::Equal;
        }
        let c = self
            .e
            .cmp(&b.e)
            .then_with(|| self.m.abs().partial_cmp(&b.m.abs()).unwrap());
        if s < 0 {
            c.reverse()
        } else {
            c
        }
    }
    pub fn add_pair(self, b: Self) -> (Self, Self) {
        if self.m == 0.0 {
            return (b, Self::ZERO);
        }
        if b.m == 0.0 {
            return (self, Self::ZERO);
        }
        let (a, b) = if self.e >= b.e { (self, b) } else { (b, self) };
        let gap = a.e - b.e;
        if gap > 110 {
            return (a, b);
        }
        let y = b.m * f64::from_bits(((1023 - gap) as u64) << 52);
        let h = a.m + y;
        let z = h - a.m;
        let l = (a.m - (h - z)) + (y - z);
        (Self::new(h, a.e), Self::new(l, a.e))
    }
    pub fn add(self, b: Self) -> Self {
        self.add_pair(b).0
    }
    pub fn sub(self, b: Self) -> Self {
        self.add(b.neg())
    }
    pub fn mul_pair(self, b: Self) -> (Self, Self) {
        if self.m == 0.0 || b.m == 0.0 {
            return (Self::ZERO, Self::ZERO);
        }
        let a = self.m;
        let b0 = b.m;
        let ac = 134217729.0 * a;
        let bc = 134217729.0 * b0;
        let ah = ac - (ac - a);
        let bh = bc - (bc - b0);
        let al = a - ah;
        let bl = b0 - bh;
        let p = a * b0;
        let r = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
        (Self::new(p, self.e + b.e), Self::new(r, self.e + b.e))
    }
    pub fn mul(self, b: Self) -> Self {
        self.mul_pair(b).0
    }
    pub fn div(self, b: Self) -> Self {
        Self::new(self.m / b.m, self.e - b.e)
    }
    pub fn next_up(self) -> Self {
        if self.m == 0.0 {
            return self;
        }
        let bits = self.m.to_bits();
        Self::new(
            f64::from_bits(if self.m > 0.0 { bits + 1 } else { bits - 1 }),
            self.e,
        )
    }
    pub fn add_up(self, b: Self) -> Self {
        let (h, l) = self.add_pair(b);
        if l.sign() > 0 {
            h.next_up()
        } else {
            h
        }
    }
    pub fn add_down(self, b: Self) -> Self {
        self.neg().add_up(b.neg()).neg()
    }
    pub fn mul_up(self, b: Self) -> Self {
        let (h, l) = self.mul_pair(b);
        if l.sign() > 0 {
            h.next_up()
        } else {
            h
        }
    }
    pub fn mul_down(self, b: Self) -> Self {
        self.neg().mul_up(b).neg()
    }
    pub fn div_up(self, b: Self) -> Self {
        let h = self.div(b);
        let (p, r) = h.mul_pair(b);
        let mut rem = Expansion::single(self);
        rem.push(p.neg());
        rem.push(r.neg());
        if rem.sign() * b.sign() > 0 {
            h.next_up()
        } else {
            h
        }
    }
    pub fn to_f64(self) -> f64 {
        if self.m == 0.0 {
            return 0.0;
        }
        if self.e > 1023 {
            return if self.m < 0.0 {
                f64::NEG_INFINITY
            } else {
                f64::INFINITY
            };
        }
        if self.e < -1075 {
            return 0.0;
        }
        if self.e < -1022 {
            return (self.m * f64::from_bits(((self.e + 2097) as u64) << 52)) * f64::from_bits(1);
        }
        f64::from_bits(
            (self.m.to_bits() & 0x800f_ffff_ffff_ffff) | (((self.e + 1023) as u64) << 52),
        )
    }
    /// Exact exponent separation reduces the IEEE square root to [1,4).
    pub fn sqrt(self) -> Self {
        if self.m == 0.0 {
            return Self::ZERO;
        }
        let exponent = self.e.div_euclid(2);
        let v = self.m * if self.e.rem_euclid(2) == 0 { 1.0 } else { 2.0 };
        Self::new(v.sqrt(), exponent)
    }
}

pub(crate) const CAP: usize = 341;

/// Each insertion preserves the exact sum. Low roundoff terms are emitted
/// before the carried high term, maintaining magnitude order and nonoverlap.
#[derive(Clone)]
pub(crate) struct Expansion {
    pub v: [X; CAP],
    pub len: usize,
}
impl Expansion {
    pub fn zero() -> Self {
        Self {
            v: [X::ZERO; CAP],
            len: 0,
        }
    }
    pub fn single(x: X) -> Self {
        let mut v = Self::zero();
        v.push(x);
        v
    }
    pub fn push(&mut self, mut x: X) {
        if x.m == 0.0 {
            return;
        }
        let mut j = 0;
        for i in 0..self.len {
            let (h, l) = x.add_pair(self.v[i]);
            if l.m != 0.0 {
                self.v[j] = l;
                j += 1;
            }
            x = h;
        }
        if x.m != 0.0 {
            self.v[j] = x;
            j += 1;
        }
        self.len = j;
        self.compress();
    }
    fn compress(&mut self) {
        if self.len < 2 {
            return;
        }
        let mut q = self.v[self.len - 1];
        let mut bottom = self.len;
        for i in (0..self.len - 1).rev() {
            let (sum, rest) = q.add_pair(self.v[i]);
            if rest.m != 0.0 {
                bottom -= 1;
                self.v[bottom] = sum;
                q = rest;
            } else {
                q = sum;
            }
        }
        bottom -= 1;
        self.v[bottom] = q;
        let mut out = 0;
        q = self.v[bottom];
        for i in bottom + 1..self.len {
            let (sum, rest) = self.v[i].add_pair(q);
            if rest.m != 0.0 {
                self.v[out] = rest;
                out += 1;
            }
            q = sum;
        }
        if q.m != 0.0 {
            self.v[out] = q;
            out += 1;
        }
        self.len = out;
    }
    pub fn sign(&self) -> i8 {
        if self.len == 0 {
            0
        } else {
            self.v[self.len - 1].sign()
        }
    }
    pub fn rounded(&self) -> X {
        let mut x = X::ZERO;
        for i in 0..self.len {
            x = x.add(self.v[i]);
        }
        x
    }
    pub fn times(&self, b: X) -> Self {
        let mut r = Self::zero();
        for i in 0..self.len {
            let (h, l) = self.v[i].mul_pair(b);
            r.push(l);
            r.push(h);
        }
        r
    }
    pub fn product_exp(&self, b: &Self) -> Self {
        let mut r = Self::zero();
        for i in 0..self.len {
            for j in 0..b.len {
                let (h, l) = self.v[i].mul_pair(b.v[j]);
                r.push(l);
                r.push(h);
            }
        }
        r
    }
    pub fn add_exp(&mut self, b: &Self) {
        for i in 0..b.len {
            self.push(b.v[i]);
        }
    }
    pub fn sub_exp(&mut self, b: &Self) {
        for i in 0..b.len {
            self.push(b.v[i].neg());
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct Interval {
    pub lo: X,
    pub hi: X,
}
impl Interval {
    pub fn point(x: X) -> Self {
        Self { lo: x, hi: x }
    }
    pub fn add(self, b: Self) -> Self {
        Self {
            lo: self.lo.add_down(b.lo),
            hi: self.hi.add_up(b.hi),
        }
    }
    pub fn mul(self, b: Self) -> Self {
        let l = [
            self.lo.mul_down(b.lo),
            self.lo.mul_down(b.hi),
            self.hi.mul_down(b.lo),
            self.hi.mul_down(b.hi),
        ];
        let h = [
            self.lo.mul_up(b.lo),
            self.lo.mul_up(b.hi),
            self.hi.mul_up(b.lo),
            self.hi.mul_up(b.hi),
        ];
        Self {
            lo: *l.iter().min_by(|a, b| a.cmp(**b)).unwrap(),
            hi: *h.iter().max_by(|a, b| a.cmp(**b)).unwrap(),
        }
    }
    pub fn sign(self) -> i8 {
        if self.lo.sign() > 0 {
            1
        } else if self.hi.sign() < 0 {
            -1
        } else {
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lossless_products_and_separated_sums() {
        let tiny = X::power(-27);
        let (h, l) = X::ONE.add(tiny).mul_pair(X::ONE.sub(tiny));
        assert_eq!(h, X::ONE);
        assert_eq!(l, X::power(-54).neg());
        let (h, l) = X::ONE.add_pair(X::power(-2000));
        assert_eq!(h, X::ONE);
        assert_eq!(l, X::power(-2000));
        let mut e = Expansion::single(X::ONE);
        e.push(X::power(-2000));
        e.push(X::ONE.neg());
        assert_eq!(e.sign(), 1);
        assert_eq!(e.rounded(), X::power(-2000));
    }
    #[test]
    fn extended_square_root_and_subnormal_rounding() {
        assert_eq!(X::from(2.).sqrt().to_f64().to_bits(), 0x3ff6_a09e_667f_3bcd);
        assert_eq!(X::power(3000).sqrt(), X::power(1500));
        assert_eq!(X::power(-1075).to_f64().to_bits(), 0);
        assert_eq!(X::from(3.).scale(-1075).to_f64().to_bits(), 2);
        assert_eq!(X::power(-1074).to_f64().to_bits(), 1);
    }
}
