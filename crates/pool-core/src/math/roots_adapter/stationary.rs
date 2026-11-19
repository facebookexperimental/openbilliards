// Copyright (c) Meta Platforms, Inc. and affiliates.

//! F8: interval Newton and certified rounding cells for simple D-6 minima.
//! Every inconclusive operation defers to the unchanged exact implementation.
//! The full arithmetic and coverage bounds are recorded in FILTERS.md.

use super::screen::Interval;

impl Interval {
    pub(super) fn neg(self) -> Self {
        Self {
            lo: -self.hi,
            hi: -self.lo,
        }
    }

    pub(super) fn sub(self, other: Self) -> Self {
        self.add(other.neg())
    }

    pub(super) fn div_positive(self, other: Self) -> Option<Self> {
        if !other.finite() || other.lo <= 0.0 {
            return None;
        }
        let reciprocal = Self {
            lo: (1.0 / other.hi).next_down(),
            hi: (1.0 / other.lo).next_up(),
        };
        let out = self.mul(reciprocal);
        out.finite().then_some(out)
    }
}

/// An unevaluated head plus an outward interval tail. The head arithmetic
/// uses error-free transforms; all remaining operations use Interval.
#[derive(Clone, Copy, Debug)]
pub(super) struct Wide {
    head: f64,
    tail: Interval,
}

fn zero(x: Interval) -> bool {
    x.lo == 0.0 && x.hi == 0.0
}

fn tail_add(a: Interval, b: Interval) -> Interval {
    if zero(a) {
        b
    } else if zero(b) {
        a
    } else {
        a.add(b)
    }
}

fn tail_mul(a: Interval, b: Interval) -> Interval {
    if zero(a) || zero(b) {
        Interval::point(0.0)
    } else {
        a.mul(b)
    }
}

fn two_sum(a: f64, b: f64) -> Option<(f64, f64)> {
    // This deliberately conservative envelope prevents intermediate overflow.
    if !a.is_finite() || !b.is_finite() || a.abs() > 1e150 || b.abs() > 1e150 {
        return None;
    }
    let sum = a + b;
    let v = sum - a;
    let error = (a - (sum - v)) + (b - v);
    Some((sum, error))
}

impl Wide {
    pub(super) fn point(head: f64) -> Self {
        Self {
            head,
            tail: Interval::point(0.0),
        }
    }

    fn normalize(head: f64, tail: Interval) -> Option<Self> {
        if !tail.finite() {
            return None;
        }
        let (head, error) = two_sum(head, tail.lo)?;
        if tail.lo == tail.hi {
            return Some(Self {
                head,
                tail: Interval::point(error),
            });
        }
        // head_old + tail.lo = head_new + error exactly. The interval's
        // remaining width is nonnegative and rounded upward twice.
        let width = (tail.hi - tail.lo).next_up();
        let tail = Interval {
            lo: error,
            hi: (error + width).next_up(),
        };
        tail.finite().then_some(Self { head, tail })
    }

    pub(super) fn add(self, other: Self) -> Option<Self> {
        let (head, error) = two_sum(self.head, other.head)?;
        let tail = tail_add(tail_add(self.tail, other.tail), Interval::point(error));
        Self::normalize(head, tail)
    }

    pub(super) fn mul(self, other: Self) -> Option<Self> {
        // Nonzero head products and their exact residuals stay normal:
        // each head is in [2^-400, 2^400], hence the product's lowest
        // possible bit is no lower than 2^-904. Zero products are exact.
        let safe = |v: f64| {
            v == 0.0 || (v.abs() >= 3.8725919148493183e-121 && v.abs() <= 2.5822498780869086e120)
        };
        if !safe(self.head) || !safe(other.head) {
            return None;
        }
        let head = self.head * other.head;
        let error = self.head.mul_add(other.head, -head);
        let tail = tail_add(
            tail_add(
                tail_add(
                    Interval::point(error),
                    tail_mul(Interval::point(self.head), other.tail),
                ),
                tail_mul(Interval::point(other.head), self.tail),
            ),
            tail_mul(self.tail, other.tail),
        );
        Self::normalize(head, tail)
    }

    pub(super) fn interval(self) -> Interval {
        tail_add(Interval::point(self.head), self.tail)
    }

    pub(super) fn sign(self) -> i8 {
        if self.tail.lo > -self.head {
            1
        } else if self.tail.hi < -self.head {
            -1
        } else {
            0
        }
    }
}

pub(super) struct Polynomial {
    c: [f64; 5],
    d: [Wide; 4],
    second: [Interval; 3],
}

impl Polynomial {
    pub(super) fn new(c: &[f64; 5]) -> Option<Self> {
        let mut d = [Wide::point(0.0); 4];
        for i in 0..4 {
            d[i] = Wide::point(c[i + 1]).mul(Wide::point((i + 1) as f64))?;
        }
        Some(Self {
            c: *c,
            d,
            second: [
                Interval::point(c[2]).mul(Interval::point(2.0)),
                Interval::point(c[3]).mul(Interval::point(6.0)),
                Interval::point(c[4]).mul(Interval::point(12.0)),
            ],
        })
    }

    pub(super) fn derivative(&self, x: Wide) -> Option<Wide> {
        let mut value = self.d[3];
        for &c in self.d[..3].iter().rev() {
            value = value.mul(x)?.add(c)?;
        }
        Some(value)
    }

    pub(super) fn curvature(&self, x: Interval) -> Interval {
        self.second[2]
            .mul(x)
            .add(self.second[1])
            .mul(x)
            .add(self.second[0])
    }

    pub(super) fn value(&self, x: f64) -> Option<Wide> {
        self.value_at(Wide::point(x))
    }

    pub(super) fn value_at(&self, x: Wide) -> Option<Wide> {
        let mut value = Wide::point(self.c[4]);
        for &c in self.c[..4].iter().rev() {
            value = value.mul(x)?.add(Wide::point(c))?;
        }
        Some(value)
    }

    fn minimum(&self, mut x: Interval, delta: Interval, lo: f64, hi: f64) -> Option<Option<f64>> {
        let region = x;
        // Endpoint signs supplied by the caller prove existence. Positive
        // curvature proves uniqueness; Newton intersections preserve it.
        for _ in 0..12 {
            let center = x.lo * 0.5 + x.hi * 0.5;
            if center < x.lo || center > x.hi {
                return None;
            }
            let slope = self.derivative(Wide::point(center))?.interval();
            let step = slope.div_positive(self.curvature(x))?;
            let next = Interval::point(center).sub(step);
            let narrowed = Interval {
                lo: x.lo.max(next.lo),
                hi: x.hi.min(next.hi),
            };
            if !narrowed.finite() || narrowed.lo > narrowed.hi {
                return None;
            }
            if narrowed.lo == x.lo && narrowed.hi == x.hi {
                break;
            }
            x = narrowed;
        }
        let center = x.lo * 0.5 + x.hi * 0.5;
        if center < x.lo || center > x.hi {
            return None;
        }
        let dx = x.sub(Interval::point(center));
        // Taylor's theorem encloses the entire stationary bracket, including
        // cancellation in C(center) and the second-order variation at m.
        let value = self
            .value(center)?
            .interval()
            .add(self.derivative(Wide::point(center))?.interval().mul(dx))
            .add(self.curvature(x).mul(dx.mul(dx)).mul(Interval::point(0.5)));
        if !value.finite() {
            return None;
        }
        if value.hi < 0.0 || value.lo > delta.hi {
            return Some(None);
        }
        if value.lo <= 0.0 || value.hi >= delta.lo {
            return None;
        }
        // A proposal is accepted only when exact-derivative signs certify
        // its original-grid rounding cell. Midpoint ties defer to exact.
        let mut m = center;
        for attempt in 0_usize..9 {
            if attempt > 0 {
                m = center;
                for _ in 0..attempt.div_ceil(2) {
                    m = if attempt % 2 == 1 {
                        m.next_down()
                    } else {
                        m.next_up()
                    };
                }
            }
            let previous = m.next_down();
            let next = m.next_up();
            if !previous.is_finite() || !next.is_finite() {
                continue;
            }
            let a = Wide::point(previous)
                .add(Wide::point(m))?
                .mul(Wide::point(0.5))?;
            let b = Wide::point(m)
                .add(Wide::point(next))?
                .mul(Wide::point(0.5))?;
            let expanded = Interval {
                lo: region.lo.min(previous),
                hi: region.hi.max(next),
            };
            let curvature = self.curvature(expanded);
            if curvature.finite()
                && curvature.lo > 0.0
                && self.derivative(a)?.sign() < 0
                && self.derivative(b)?.sign() > 0
            {
                return Some((m > lo && m <= hi).then_some(m));
            }
        }
        None
    }
}

/// Taylor's exact quadratic remainder gives a global positive lower bound.
/// The Newton value is only a proposal for the expansion center.
pub(super) fn positive_window(c: &[f64; 5], lo: f64, hi: f64) -> bool {
    if lo < 0.0 || !hi.is_finite() || lo >= hi || c[2] <= 0.0 {
        return false;
    }
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
    if !z.is_finite() {
        return false;
    }
    let approximate = c[..4].iter().rev().fold(c[4], |v, &a| v * z + a);
    if !approximate.is_finite() || approximate < 0.0 {
        return false;
    }
    let center = Interval::point(z);
    let x = Interval { lo, hi }.sub(center);
    let a = Interval::point(c[4])
        .mul(Interval::point(6.0))
        .mul(center)
        .add(Interval::point(c[3]).mul(Interval::point(3.0)))
        .mul(center)
        .add(Interval::point(c[2]));
    let b = Interval::point(c[4])
        .mul(Interval::point(4.0))
        .mul(center)
        .add(Interval::point(c[3]));
    let slope = Interval::point(c[4])
        .mul(Interval::point(2.0))
        .mul(x)
        .add(b);
    if !slope.finite() || !x.finite() {
        return false;
    }
    let domain = if slope.lo > 0.0 {
        Interval::point(x.lo)
    } else if slope.hi < 0.0 {
        Interval::point(x.hi)
    } else {
        x
    };
    let remainder = Interval::point(c[4]).mul(domain).add(b).mul(domain).add(a);
    if !remainder.finite() || remainder.lo <= 0.0 {
        return false;
    }
    let denominator = Interval::point(remainder.lo).mul(Interval::point(4.0));
    let value = c[..4].iter().rev().fold(Interval::point(c[4]), |v, &a| {
        v.mul(center).add(Interval::point(a))
    });
    let derivative = Interval::point(c[4])
        .mul(Interval::point(4.0))
        .mul(center)
        .add(Interval::point(c[3]).mul(Interval::point(3.0)))
        .mul(center)
        .add(Interval::point(c[2]).mul(Interval::point(2.0)))
        .mul(center)
        .add(Interval::point(c[1]));
    let Some(penalty) = derivative.mul(derivative).div_positive(denominator) else {
        return false;
    };
    if value.finite() && value.lo > penalty.hi {
        return true;
    }
    if !value.finite() || value.hi < 0.0 {
        return false;
    }
    // Only an inconclusive binary64 bound invokes compensated evaluation.
    let Some(p) = Polynomial::new(c) else {
        return false;
    };
    let (Some(value), Some(derivative)) = (p.value(z), p.derivative(Wide::point(z))) else {
        return false;
    };
    let value = value.interval();
    let derivative = derivative.interval();
    let Some(penalty) = derivative.mul(derivative).div_positive(denominator) else {
        return false;
    };
    value.finite() && value.lo > penalty.hi
}

/// Some(None) proves no eligible minimum; Some(Some(t)) proves its exact
/// representative. None leaves the whole query to the original exact path.
pub(super) fn earliest_minimum(
    c: &[f64; 5],
    distance: f64,
    scale: f64,
    epsilon: f64,
    lo: f64,
    hi: f64,
) -> Option<Option<f64>> {
    if !hi.is_finite() || lo >= hi {
        return None;
    }
    let p = Polynomial::new(c)?;
    let e = Wide::point(epsilon);
    let delta = Wide::point(distance)
        .mul(Wide::point(2.0))?
        .mul(e)?
        .add(e.mul(e)?)?
        .mul(Wide::point(scale))?
        .interval();
    if !delta.finite() || delta.lo <= 0.0 {
        return None;
    }
    let mut stack = [(lo, hi, 0_u8); 17];
    let mut len = 1;
    let mut visited = 0;
    while len > 0 {
        if visited == 127 {
            return None;
        }
        visited += 1;
        len -= 1;
        let (a, b, depth) = stack[len];
        let x = Interval { lo: a, hi: b };
        let curvature = p.curvature(x);
        if curvature.finite() && curvature.hi < 0.0 {
            continue;
        }
        if curvature.finite() && curvature.lo > 0.0 {
            let left = p.derivative(Wide::point(a))?.sign();
            let right = p.derivative(Wide::point(b))?.sign();
            if left > 0 || right < 0 {
                continue;
            }
            if left < 0 && right > 0 {
                if let Some(m) = p.minimum(x, delta, lo, hi)? {
                    return Some(Some(m));
                }
                continue;
            }
        }
        if super::screen::bernstein_no_minimum(c, a, b) {
            continue;
        }
        if depth == 16 {
            return None;
        }
        let mid = a * 0.5 + b * 0.5;
        if !mid.is_finite() || mid <= a || mid >= b {
            return None;
        }
        stack[len] = (mid, b, depth + 1);
        stack[len + 1] = (a, mid, depth + 1);
        len += 2;
    }
    Some(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn screen_entry_preserves_delivered_nonemptiness() {
        let mut checked = 0;
        let mut decided = 0;
        for m in [0.001, 0.07, 0.5, 1.5, 8.0] {
            for magnitude in [1e-14, 1e-12, 1e-8, 1e-4, 0.01] {
                for sign in [-1.0, 1.0] {
                    for factor in [0.0, 0.125] {
                        let g = sign * magnitude;
                        let c = [
                            m * m + g,
                            -2.0 * m,
                            1.0 + factor * (m * m + g),
                            -2.0 * factor * m,
                            factor,
                        ];
                        let roots = kroots::real_roots_in(&c, 0.0, 20.0);
                        let mut windows = vec![(0.0, m), (0.0, 2.0 * m), (1e-9, 20.0)];
                        for &r in roots.as_slice() {
                            for lo in [r.next_down().next_down().next_down(), r.next_down(), r] {
                                for hi in [r, r.next_up(), r.next_up().next_up().next_up()] {
                                    if lo < hi {
                                        windows.push((lo, hi));
                                    }
                                }
                            }
                        }
                        for (lo, hi) in windows {
                            if super::super::screen::has_entry(&c, lo, hi) {
                                assert!(
                                    kroots::earliest_root_in(&c, lo, hi).is_some(),
                                    "{c:?} ({lo},{hi}]"
                                );
                                decided += 1;
                            }
                            checked += 1;
                        }
                    }
                }
            }
        }
        assert!(decided > 0);
        println!("F11 Boolean/endpoint checks: n={checked}, decided={decided}, mismatches=0");
    }

    #[test]
    fn taylor_positive_and_negative_boundary_certificates() {
        let boundary = (0..2048)
            .find(|&n| {
                let c = [f64::from_bits(1.0_f64.to_bits() + n), -2.0, 1.0, 0.0, 0.0];
                super::super::screen::refined_positive_window(&c, 0.0, 2.0)
            })
            .unwrap();
        let mut checked = 0;
        for shift in -4_i64..=4 {
            let c = [
                f64::from_bits(
                    (1.0_f64.to_bits() + boundary)
                        .checked_add_signed(shift)
                        .unwrap(),
                ),
                -2.0,
                1.0,
                0.0,
                0.0,
            ];
            for (lo, hi) in [(0.0, 2.0), (0.5, 1.5), (1.0, 2.0)] {
                if super::super::screen::refined_positive_window(&c, lo, hi) {
                    assert_eq!(kroots::earliest_root_in(&c, lo, hi), None);
                    assert!(super::super::exact::sign_at(&c, lo) > 0);
                    assert!(super::super::exact::outside_lower_cell(&c, lo));
                }
                checked += 1;
            }
        }
        for bits in 1.0_f64.to_bits() - 16..=1.0_f64.to_bits() + 16 {
            let c = [f64::from_bits(bits), -2.0, 1.0, 0.0, 0.0];
            if super::super::screen::negative_at(&c, 1.0) {
                assert!(super::super::exact::sign_at(&c, 1.0) < 0);
            }
            checked += 1;
        }
        println!("F9/F10 decision boundary checks: n={checked}, boundary={boundary}, mismatches=0");
    }

    #[test]
    fn wide_enclosures_contain_exact_dyadic_horner_values() {
        let mut seed = 0x4934_7376_9a7a_0145_u64;
        let mut random = || {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed
        };
        let mut checked = 0;
        for i in 0..2048 {
            let c = std::array::from_fn(|_| {
                let bits = random();
                let mantissa = (bits >> 11) as f64 * (1.0 / 9007199254740992.0) - 0.5;
                libm::scalbn(mantissa, (random() % 161) as i32 - 80)
            });
            let x = libm::scalbn(
                0.5 + (random() >> 11) as f64 / 9007199254740992.0,
                (i % 41) - 20,
            );
            let offset = (x.next_up() - x) * 0.5;
            let p = Polynomial::new(&c).unwrap();
            let value = p.value(x).unwrap();
            super::super::exact::assert_wide_enclosure(
                &c,
                false,
                [x, 0.0],
                value.head,
                value.tail.lo,
                value.tail.hi,
            );
            let point = Wide::point(x).add(Wide::point(offset)).unwrap();
            let derivative = p.derivative(point).unwrap();
            super::super::exact::assert_wide_enclosure(
                &c,
                true,
                [x, offset],
                derivative.head,
                derivative.tail.lo,
                derivative.tail.hi,
            );
            checked += 2;
        }
        println!("F8 exact Wide enclosure checks: n={checked}, mismatches=0");
    }

    #[test]
    fn interval_minima_preserve_band_cell_and_prefix_boundaries() {
        let mut checked = 0;
        let mut decided = 0;
        for distance in [0.028575, 0.05715, 1.0] {
            for scale in [0.5, 1.0] {
                let delta = scale * (2.0 * distance * 1e-12 + 1e-24);
                for base in [1.0, 1.0 + 0.5 * delta, 1.0 + delta, 1.0 + 2.0 * delta] {
                    for offset in -4_i32..=4 {
                        let mut constant: f64 = base;
                        for _ in 0..offset.abs() {
                            constant = if offset < 0 {
                                constant.next_down()
                            } else {
                                constant.next_up()
                            };
                        }
                        for c in [
                            [constant, -2.0, 1.0, 0.0, 0.0],
                            [constant, -2.0, 1.125, -0.25, 0.125],
                            [constant, -4.0, 6.0, -4.0, 1.0],
                        ] {
                            for (lo, hi) in [
                                (0.0, 2.0),
                                (1.0_f64.next_down(), 1.0),
                                (1.0, 1.0_f64.next_up()),
                            ] {
                                if let Some(result) =
                                    earliest_minimum(&c, distance, scale, 1e-12, lo, hi)
                                {
                                    assert_eq!(
                                        result.map(f64::to_bits),
                                        super::super::exact::earliest_minimum(
                                            &c, distance, scale, 1e-12, lo, hi
                                        )
                                        .map(f64::to_bits),
                                        "{c:?} {lo} {hi}"
                                    );
                                    decided += 1;
                                }
                                checked += 1;
                            }
                        }
                    }
                }
            }
        }
        let c = [1.0 + 1e-12, -2.0, 1.0, 0.0, 0.0];
        assert_eq!(
            earliest_minimum(&c, 1.0, 1.0, 1e-12, 0.0, 2.0),
            Some(Some(1.0))
        );
        let stress = [
            0.040000000000057157,
            -1.2307742400253971,
            9.859932686938084,
            -6.036947647324573,
            0.9623610000000001,
        ];
        assert_eq!(
            earliest_minimum(&stress, 0.05715, 1.0, 1e-12, 1e-9, 64.0),
            Some(Some(0.06640565587952191))
        );
        for c in [
            [37.0 + 1e-12, -96.0, 84.0, -28.0, 3.0],
            [9.0 + 1e-12, -24.0, 22.0, -8.0, 1.0],
            [-1.0 + 1e-12, 3.0, -3.0, 1.0, 0.0],
        ] {
            if let Some(result) = earliest_minimum(&c, 1.0, 1.0, 1e-12, 0.0, 5.0) {
                assert_eq!(
                    result.map(f64::to_bits),
                    super::super::exact::earliest_minimum(&c, 1.0, 1.0, 1e-12, 0.0, 5.0)
                        .map(f64::to_bits)
                );
            }
            checked += 1;
        }
        assert!(decided > 0);
        println!(
            "F8 band/cell/prefix boundary checks: n={checked}, decided={decided}, mismatches=0"
        );
    }
}
