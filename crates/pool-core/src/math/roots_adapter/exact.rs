// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Exact dyadic sign certificates for the D-6 screen and stationary candidates.
//!
//! This module does not generate event-time candidates. `kroots` supplies every
//! representative. Signed polynomial remainders classify the stationary points
//! inside its rounding cell, including adjacent/merged representatives, without
//! sampling the derivative at an arbitrary neighboring float.

use std::cmp::Ordering;

/// A signed integer times 2^exp. Little-endian base-2^32 magnitude, normalized.
/// Dynamic storage is confined to this certification module, not the root service.
#[derive(Clone, Debug)]
struct Dyadic {
    sign: i8,
    exp: i32,
    words: Vec<u32>,
}

impl Dyadic {
    fn zero() -> Self {
        Self {
            sign: 0,
            exp: 0,
            words: Vec::new(),
        }
    }

    fn from(x: f64) -> Self {
        assert!(x.is_finite());
        let bits = x.to_bits();
        let biased = ((bits >> 52) & 0x7ff) as i32;
        let significand = (bits & ((1_u64 << 52) - 1)) | if biased == 0 { 0 } else { 1_u64 << 52 };
        let mut value = Self {
            sign: if significand == 0 {
                0
            } else if bits >> 63 == 0 {
                1
            } else {
                -1
            },
            exp: if biased == 0 {
                -1074
            } else {
                biased - 1023 - 52
            },
            words: vec![significand as u32, (significand >> 32) as u32],
        };
        value.normalize();
        value
    }

    fn normalize(&mut self) {
        while self.words.last() == Some(&0) {
            self.words.pop();
        }
        if self.words.is_empty() {
            *self = Self::zero();
            return;
        }
        let zero_words = self.words.iter().take_while(|&&x| x == 0).count();
        self.words.drain(..zero_words);
        self.exp += 32 * zero_words as i32;
        let shift = self.words[0].trailing_zeros();
        if shift > 0 {
            for i in 0..self.words.len() {
                let high = self.words.get(i + 1).copied().unwrap_or(0);
                self.words[i] = (self.words[i] >> shift) | (high << (32 - shift));
            }
            self.exp += shift as i32;
            while self.words.last() == Some(&0) {
                self.words.pop();
            }
        }
    }

    fn neg(&self) -> Self {
        let mut value = self.clone();
        value.sign = -value.sign;
        value
    }

    fn shifted_words(&self, exp: i32) -> Vec<u32> {
        if self.sign == 0 {
            return Vec::new();
        }
        let shift = (self.exp - exp) as usize;
        let mut words = vec![0; shift / 32];
        let shift = shift % 32;
        let mut carry = 0_u64;
        for &word in &self.words {
            let value = ((word as u64) << shift) | carry;
            words.push(value as u32);
            carry = value >> 32;
        }
        if carry != 0 {
            words.push(carry as u32);
        }
        words
    }

    fn add(&self, other: &Self) -> Self {
        if self.sign == 0 {
            return other.clone();
        }
        if other.sign == 0 {
            return self.clone();
        }
        let exp = self.exp.min(other.exp);
        let mut a = self.shifted_words(exp);
        let mut b = other.shifted_words(exp);
        let mut sign = self.sign;
        if self.sign == other.sign {
            a.resize(a.len().max(b.len()), 0);
            let mut carry = 0_u64;
            for (i, word) in a.iter_mut().enumerate() {
                let value = *word as u64 + b.get(i).copied().unwrap_or(0) as u64 + carry;
                *word = value as u32;
                carry = value >> 32;
            }
            if carry != 0 {
                a.push(carry as u32);
            }
        } else {
            let order = a
                .len()
                .cmp(&b.len())
                .then_with(|| a.iter().rev().cmp(b.iter().rev()));
            if order == Ordering::Equal {
                return Self::zero();
            }
            if order == Ordering::Less {
                std::mem::swap(&mut a, &mut b);
                sign = other.sign;
            }
            let mut borrow = 0_i64;
            for (i, word) in a.iter_mut().enumerate() {
                let value = *word as i64 - b.get(i).copied().unwrap_or(0) as i64 - borrow;
                *word = value as u32;
                borrow = i64::from(value < 0);
            }
        }
        let mut value = Self {
            sign,
            exp,
            words: a,
        };
        value.normalize();
        value
    }

    fn sub(&self, other: &Self) -> Self {
        self.add(&other.neg())
    }

    fn mul(&self, other: &Self) -> Self {
        if self.sign == 0 || other.sign == 0 {
            return Self::zero();
        }
        let mut words = vec![0_u32; self.words.len() + other.words.len()];
        for (i, &a) in self.words.iter().enumerate() {
            let mut carry = 0_u64;
            for (j, &b) in other.words.iter().enumerate() {
                let value = a as u64 * b as u64 + words[i + j] as u64 + carry;
                words[i + j] = value as u32;
                carry = value >> 32;
            }
            words[i + other.words.len()] = carry as u32;
        }
        let mut value = Self {
            sign: self.sign * other.sign,
            exp: self.exp + other.exp,
            words,
        };
        value.normalize();
        value
    }

    fn midpoint(&self, other: &Self) -> Self {
        let mut value = self.add(other);
        value.exp -= 1;
        value
    }

    fn top_exponent(&self) -> i32 {
        self.exp + 32 * self.words.len() as i32
            - self.words.last().unwrap().leading_zeros() as i32
            - 1
    }

    fn rounded(&self) -> f64 {
        if self.sign == 0 {
            return 0.0;
        }
        let bits = self.top_exponent() - self.exp + 1;
        let shift = (bits - 53).max(-1074 - self.exp).max(0) as usize;
        let bit = |i: usize| {
            self.words
                .get(i / 32)
                .is_some_and(|w| w & (1 << (i % 32)) != 0)
        };
        let mut significand = 0_u64;
        for i in (shift..bits.max(shift as i32) as usize).rev() {
            significand = (significand << 1) | u64::from(bit(i));
        }
        if shift > 0 && bit(shift - 1) && (significand & 1 != 0 || (0..shift - 1).any(bit)) {
            significand += 1;
        }
        self.sign as f64 * libm::scalbn(significand as f64, self.exp + shift as i32)
    }
}

#[derive(Clone)]
struct Poly(Vec<Dyadic>);

impl Poly {
    fn new(c: &[f64]) -> Self {
        let mut p = Self(c.iter().copied().map(Dyadic::from).collect());
        p.trim();
        p
    }
    fn trim(&mut self) {
        while self.0.last().is_some_and(|c| c.sign == 0) {
            self.0.pop();
        }
    }
    fn derivative(&self) -> Self {
        Self(
            self.0
                .iter()
                .enumerate()
                .skip(1)
                .map(|(i, c)| c.mul(&Dyadic::from(i as f64)))
                .collect(),
        )
    }
    fn at(&self, x: &Dyadic) -> Dyadic {
        self.0
            .iter()
            .rev()
            .fold(Dyadic::zero(), |a, c| a.mul(x).add(c))
    }
    fn product(&self, other: &Self) -> Self {
        if self.0.is_empty() || other.0.is_empty() {
            return Self(Vec::new());
        }
        let mut out = vec![Dyadic::zero(); self.0.len() + other.0.len() - 1];
        for (i, a) in self.0.iter().enumerate() {
            for (j, b) in other.0.iter().enumerate() {
                out[i + j] = out[i + j].add(&a.mul(b));
            }
        }
        Self(out)
    }

    /// Exact coefficients of p(center + 2^power u), then a common binary
    /// normalization before rounding the proposals for the public root API.
    fn local_coefficients(&self, center: &Dyadic, power: i32) -> [f64; 5] {
        let mut shifted = vec![Dyadic::zero(); self.0.len()];
        for coefficient in self.0.iter().rev() {
            for j in (1..shifted.len()).rev() {
                shifted[j] = shifted[j].mul(center).add(&shifted[j - 1]);
            }
            shifted[0] = shifted[0].mul(center).add(coefficient);
        }
        for (i, coefficient) in shifted.iter_mut().enumerate() {
            coefficient.exp += power * i as i32;
        }
        let top = shifted
            .iter()
            .filter(|c| c.sign != 0)
            .map(Dyadic::top_exponent)
            .max()
            .unwrap_or(0);
        let mut result = [0.0; 5];
        for (out, coefficient) in result.iter_mut().zip(&mut shifted) {
            coefficient.exp -= top;
            *out = coefficient.rounded();
        }
        result
    }
    /// Positive pseudo-division factors preserve every sign in a Sturm chain.
    fn remainder(&self, divisor: &Self) -> Self {
        let mut out = self.clone();
        let lead = divisor.0.last().expect("nonzero divisor");
        let mut magnitude = lead.clone();
        magnitude.sign = 1;
        while !out.0.is_empty() && out.0.len() >= divisor.0.len() {
            let shift = out.0.len() - divisor.0.len();
            let mut factor = out.0.last().unwrap().clone();
            factor.sign *= lead.sign;
            for c in &mut out.0 {
                *c = c.mul(&magnitude);
            }
            for (i, c) in divisor.0.iter().enumerate() {
                out.0[i + shift] = out.0[i + shift].sub(&factor.mul(c));
            }
            out.trim();
        }
        out
    }
    fn neg(mut self) -> Self {
        for c in &mut self.0 {
            c.sign = -c.sign;
        }
        self
    }
    fn side_sign(&self, x: &Dyadic, side: i8) -> i8 {
        let mut p = self.clone();
        let mut multiplier = 1;
        while !p.0.is_empty() {
            let sign = p.at(x).sign;
            if sign != 0 {
                return sign * multiplier;
            }
            p = p.derivative();
            multiplier *= side;
        }
        0
    }
}

fn variations(chain: &[Poly], x: &Dyadic, side: i8) -> i32 {
    let mut previous = 0;
    let mut count = 0;
    for p in chain {
        let sign = p.side_sign(x, side);
        if sign != 0 {
            if previous != 0 && previous != sign {
                count += 1;
            }
            previous = sign;
        }
    }
    count
}

/// Sturm-Tarski query: sum of sign(q) over distinct p roots in the OPEN interval.
fn query(p: &Poly, q: &Poly, a: &Dyadic, b: &Dyadic) -> i32 {
    let second = p.derivative().product(q).remainder(p);
    if second.0.is_empty() {
        return 0;
    }
    let mut chain = vec![p.clone(), second];
    loop {
        let n = chain.len();
        let next = chain[n - 2].remainder(&chain[n - 1]).neg();
        if next.0.is_empty() {
            break;
        }
        chain.push(next);
    }
    variations(&chain, a, 1) - variations(&chain, b, -1)
}

pub(super) fn sign_at(c: &[f64; 5], x: f64) -> i8 {
    Poly::new(c).at(&Dyadic::from(x)).sign
}

fn eligible(sign: impl Fn(&Poly) -> i32, c: &Poly, limit: &Poly, d: &Poly) -> bool {
    if sign(c) < 0 || sign(limit) > 0 {
        return false;
    }
    let second = d.derivative();
    let curvature = sign(&second);
    curvature > 0
        || (curvature == 0
            && sign(&second.derivative()) == 0
            && sign(&second.derivative().derivative()) > 0)
}

fn minimum_in_cell(c: &Poly, limit: &Poly, d: &Poly, a: Dyadic, b: Dyadic) -> bool {
    let one = Poly::new(&[1.0]);
    let mut cells = vec![(a, b)];
    while let Some((a, b)) = cells.pop() {
        match query(d, &one, &a, &b) {
            0 => {}
            1 => {
                if eligible(|q| query(d, q, &a, &b), c, limit, d) {
                    return true;
                }
            }
            _ => {
                // Multiple mathematical stationary points may round to the same
                // API representative. Exact rational midpoints separate their
                // sign queries; this never creates another time candidate.
                let mid = a.midpoint(&b);
                if d.at(&mid).sign == 0 && eligible(|q| q.at(&mid).sign as i32, c, limit, d) {
                    return true;
                }
                cells.push((a, mid.clone()));
                cells.push((mid, b));
            }
        }
    }
    false
}

#[derive(Clone)]
struct Region {
    a: Dyadic,
    b: Dyadic,
    include_a: bool,
    include_b: bool,
}

impl Region {
    fn count(&self, d: &Poly) -> i32 {
        if self.a.sub(&self.b).sign >= 0 {
            return 0;
        }
        query(d, &Poly::new(&[1.0]), &self.a, &self.b)
            + i32::from(self.include_a && d.at(&self.a).sign == 0)
            + i32::from(self.include_b && d.at(&self.b).sign == 0)
    }

    fn cell(&self, m: f64) -> Option<Self> {
        let center = Dyadic::from(m);
        let previous = if m.next_down().is_finite() {
            Dyadic::from(m.next_down())
        } else {
            center.add(&center.sub(&Dyadic::from(m.next_up())))
        };
        let next = if m.next_up().is_finite() {
            Dyadic::from(m.next_up())
        } else {
            center.add(&center.sub(&Dyadic::from(m.next_down())))
        };
        let mut cell = Self {
            a: previous.midpoint(&center),
            b: center.midpoint(&next),
            include_a: m.to_bits() & 1 == 0,
            include_b: m.to_bits() & 1 == 0,
        };
        match cell.a.sub(&self.a).sign {
            -1 => {
                cell.a = self.a.clone();
                cell.include_a = self.include_a;
            }
            0 => cell.include_a &= self.include_a,
            _ => {}
        }
        match cell.b.sub(&self.b).sign {
            1 => {
                cell.b = self.b.clone();
                cell.include_b = self.include_b;
            }
            0 => cell.include_b &= self.include_b,
            _ => {}
        }
        (cell.a.sub(&cell.b).sign < 0).then_some(cell)
    }

    fn admits_minimum(&self, c: &Poly, limit: &Poly, d: &Poly) -> bool {
        for (endpoint, include) in [(&self.a, self.include_a), (&self.b, self.include_b)] {
            if include
                && d.at(endpoint).sign == 0
                && eligible(|q| q.at(endpoint).sign as i32, c, limit, d)
            {
                return true;
            }
        }
        minimum_in_cell(c, limit, d, self.a.clone(), self.b.clone())
    }
}

/// The API omits a root whose rounding equals lo. Certifying the boundary at
/// the far edge of that excluded rounding half-cell prevents such a screen
/// entry from concealing a later eligible contact/minimum.
pub(super) fn outside_lower_cell(c: &[f64; 5], lo: f64) -> bool {
    if !lo.next_up().is_finite() {
        return false;
    }
    let edge = Dyadic::from(lo).midpoint(&Dyadic::from(lo.next_up()));
    Poly::new(c).at(&edge).sign > 0
}

pub(super) fn earliest_minimum(
    c: &[f64; 5],
    distance: f64,
    scale: f64,
    epsilon: f64,
    lo: f64,
    hi: f64,
) -> Option<f64> {
    if lo >= hi || !lo.next_up().is_finite() {
        return None;
    }
    let polynomial = Poly::new(c);
    let derivative = polynomial.derivative();
    if derivative.0.len() < 2 {
        return None;
    }
    let d = derivative.local_coefficients(&Dyadic::zero(), 0);
    let stationary = super::profile::measure(super::profile::STATIONARY, || {
        kroots::real_roots_in(&d, lo, hi)
    });
    let epsilon = Dyadic::from(epsilon);
    let delta = Dyadic::from(distance)
        .mul(&Dyadic::from(2.0))
        .mul(&epsilon)
        .add(&epsilon.mul(&epsilon))
        .mul(&Dyadic::from(scale));
    let mut limit = polynomial.clone();
    limit.0[0] = limit.0[0].sub(&delta);
    limit.trim();
    let upper = if hi.is_finite() {
        Dyadic::from(hi)
    } else {
        let max = Dyadic::from(f64::MAX);
        max.add(
            &max.sub(&Dyadic::from(f64::MAX.next_down()))
                .midpoint(&Dyadic::zero()),
        )
    };
    let whole = Region {
        a: Dyadic::from(lo).midpoint(&Dyadic::from(lo.next_up())),
        b: upper,
        include_a: lo.to_bits() & 1 != 0,
        include_b: hi.is_finite(),
    };
    enum Work {
        Search(Region),
        Candidate(f64, Region),
    }
    let mut work = vec![Work::Search(whole)];
    while let Some(item) = work.pop() {
        let region = match item {
            Work::Candidate(m, cell) => {
                if cell.admits_minimum(&polynomial, &limit, &derivative) {
                    return Some(m);
                }
                continue;
            }
            Work::Search(region) => region,
        };
        let count = region.count(&derivative);
        // An isolated stationary maximum/inflection (including a non-dyadic
        // double derivative root) needs no numerical proposal or refinement.
        if count == 0 || (count == 1 && !region.admits_minimum(&polynomial, &limit, &derivative)) {
            continue;
        }
        let mut candidates = stationary.as_slice().to_vec();
        let mut selected = None;
        for pass in 0..2 {
            if pass == 1 {
                // Products such as 3*c3 need not fit one binary64 coefficient.
                // Recenter the exact derivative, ask the public API again, and
                // certify its proposals against the ORIGINAL derivative. Common
                // scaling also prevents overflow/underflow in derivative inputs.
                let center = region.a.midpoint(&region.b);
                let power = region.b.sub(&region.a).top_exponent();
                let local = derivative.local_coefficients(&center, power);
                for &u in super::profile::measure(super::profile::STATIONARY, || {
                    kroots::real_roots_in(&local, -2.0, 2.0)
                })
                .as_slice()
                {
                    let mut offset = Dyadic::from(u);
                    offset.exp += power;
                    let m = center.add(&offset).rounded();
                    // A rounded local proposal can straddle an original-grid
                    // midpoint. Exact cell ownership corrects that last bit.
                    candidates.extend([m.next_down(), m, m.next_up()]);
                }
            }
            candidates.sort_by(f64::total_cmp);
            candidates.dedup();
            for &m in &candidates {
                if !m.is_finite() || m <= lo || m > hi {
                    continue;
                }
                if let Some(cell) = region.cell(m) {
                    if cell.count(&derivative) > 0 {
                        selected = Some((m, cell));
                        break;
                    }
                }
            }
            if selected.is_some() {
                break;
            }
        }
        if let Some((m, cell)) = selected {
            // Process certified disjoint regions from left to right. The exact
            // count retains stationary roots absent from rounded derivative
            // proposals; a later known crossing/touch cannot conceal them.
            work.push(Work::Search(Region {
                a: cell.b.clone(),
                b: region.b,
                include_a: !cell.include_b,
                include_b: region.include_b,
            }));
            work.push(Work::Candidate(m, cell.clone()));
            work.push(Work::Search(Region {
                a: region.a,
                b: cell.a,
                include_a: region.include_a,
                include_b: !cell.include_a,
            }));
        } else {
            // This is exact root-count refinement, not sampled time search.
            // Degree <=3 and dyadic coefficient separation bound refinement;
            // only the public root API generates proposals in each local frame.
            let mid = region.a.midpoint(&region.b);
            work.push(Work::Search(Region {
                a: mid.clone(),
                b: region.b,
                include_a: false,
                include_b: region.include_b,
            }));
            work.push(Work::Search(Region {
                a: region.a,
                b: mid,
                include_a: region.include_a,
                include_b: true,
            }));
        }
    }
    None
}

#[cfg(test)]
pub(super) fn assert_wide_enclosure(
    c: &[f64; 5],
    derivative: bool,
    x: [f64; 2],
    head: f64,
    lower: f64,
    upper: f64,
) {
    let p = Poly::new(c);
    let p = if derivative { p.derivative() } else { p };
    let x = Dyadic::from(x[0]).add(&Dyadic::from(x[1]));
    let residual = p.at(&x).sub(&Dyadic::from(head));
    assert!(residual.sub(&Dyadic::from(lower)).sign >= 0);
    assert!(Dyadic::from(upper).sub(&residual).sign >= 0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signs_survive_cancellation_subnormals_and_overflow() {
        assert_eq!(sign_at(&[1.0, -2.0, 1.0, 0.0, 0.0], 1.0), 0);
        assert_eq!(sign_at(&[1.0_f64.next_up(), -2.0, 1.0, 0.0, 0.0], 1.0), 1);
        assert_eq!(
            sign_at(&[f64::from_bits(1), 0.0, 0.0, 0.0, f64::MAX], f64::MAX),
            1
        );
        let a = Dyadic::from(f64::MAX);
        let b = Dyadic::from(f64::from_bits(1));
        assert_eq!(a.add(&b).sub(&a).sub(&b).sign, 0);
    }

    #[test]
    fn sturm_queries_count_distinct_roots_and_classify_signs() {
        let p = Poly::new(&[0.0, -1.0, 0.0, 1.0]); // -1, 0, 1
        let a = Dyadic::from(-2.0);
        let b = Dyadic::from(2.0);
        assert_eq!(query(&p, &Poly::new(&[1.0]), &a, &b), 3);
        assert_eq!(query(&p, &Poly::new(&[0.0, 1.0]), &a, &b), 0);
        assert_eq!(query(&p, &Poly::new(&[0.0, 0.0, 1.0]), &a, &b), 2);
        let repeated = Poly::new(&[-1.0, 3.0, -3.0, 1.0]);
        assert_eq!(query(&repeated, &Poly::new(&[1.0]), &a, &b), 1);
        assert_eq!(query(&repeated, &Poly::new(&[-1.0, 1.0]), &a, &b), 0);
    }
}
