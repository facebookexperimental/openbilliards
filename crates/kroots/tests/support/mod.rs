// Copyright (c) Meta Platforms, Inc. and affiliates.

// Test-only enclosure arithmetic, independent of both production arithmetic
// and the separately delivered checker crate.
const U: f64 = 1.1102230246251565e-16;
fn next(v: f64) -> f64 {
    if v == f64::INFINITY || v.is_nan() {
        v
    } else if v == 0. {
        f64::from_bits(1)
    } else {
        f64::from_bits(if v > 0. {
            v.to_bits() + 1
        } else {
            v.to_bits() - 1
        })
    }
}
fn prev(v: f64) -> f64 {
    -next(-v)
}
#[derive(Clone, Copy)]
struct Bounds(f64, f64);
impl Bounds {
    fn val(v: f64) -> Self {
        Self(v, v)
    }
    fn plus(self, b: Self) -> Self {
        Self(prev(self.0 + b.0), next(self.1 + b.1))
    }
    fn times(self, b: Self) -> Self {
        let v = [self.0 * b.0, self.0 * b.1, self.1 * b.0, self.1 * b.1];
        if v.iter().any(|x| !x.is_finite()) {
            return Self(f64::NEG_INFINITY, f64::INFINITY);
        }
        Self(
            prev(v.into_iter().fold(f64::INFINITY, f64::min)),
            next(v.into_iter().fold(f64::NEG_INFINITY, f64::max)),
        )
    }
    fn minimum_abs(self) -> f64 {
        if self.0 > 0. {
            self.0
        } else if self.1 < 0. {
            -self.1
        } else {
            0.
        }
    }
    fn maximum_abs(self) -> f64 {
        self.0.abs().max(self.1.abs())
    }
}
pub fn acceptable(c: [f64; 5], lo: f64, hi: f64, expected: &[u64], actual: &[u64]) -> bool {
    if expected.len() != actual.len() {
        return false;
    }
    for (&bb, &vv) in expected.iter().zip(actual) {
        if bb == vv {
            continue;
        }
        let b = f64::from_bits(bb);
        let v = f64::from_bits(vv);
        if !b.is_normal()
            || b.abs() == f64::MAX
            || !v.is_finite()
            || vv == 1_u64 << 63
            || v <= lo
            || v > hi
        {
            return false;
        }
        let e = next(b.abs() * U).max(f64::from_bits(1));
        let interval = Bounds(prev(b - e), next(b + e));
        let abs = Bounds(prev(b.abs() - e).max(0.), next(b.abs() + e));
        let mut s = Bounds::val(0.);
        let mut d = Bounds::val(0.);
        for i in (0..5).rev() {
            s = s.times(abs).plus(Bounds::val(c[i].abs()));
        }
        for i in (1..5).rev() {
            d = d
                .times(interval)
                .plus(Bounds::val(c[i]).times(Bounds::val(i as f64)));
        }
        let amin = prev(prev(U * s.0) / d.maximum_abs());
        let amax = next(next(U * s.1) / d.minimum_abs());
        let radius = next(next(10. * amax) + e);
        if !radius.is_finite()
            || prev(b - lo) <= radius
            || (hi.is_finite() && prev(hi - b) <= radius)
        {
            return false;
        }
        if expected
            .iter()
            .any(|&o| o != bb && prev((f64::from_bits(o) - b).abs()) <= radius)
        {
            return false;
        }
        // Explicit binomial translation encloses every Taylor coefficient.
        let choose = [
            [1., 0., 0., 0., 0.],
            [1., 1., 0., 0., 0.],
            [1., 2., 1., 0., 0.],
            [1., 3., 3., 1., 0.],
            [1., 4., 6., 4., 1.],
        ];
        let mut t = [Bounds::val(0.); 5];
        for k in 0..5 {
            for j in (k..5).rev() {
                t[k] = t[k]
                    .times(Bounds::val(b))
                    .plus(Bounds::val(c[j]).times(Bounds::val(choose[j][k])));
            }
        }
        let mut remainder = 0.;
        for k in (2..5).rev() {
            remainder = next(next(remainder * radius) + t[k].maximum_abs());
        }
        remainder = next(next(next(remainder * radius) * radius) + t[0].maximum_abs());
        if prev(t[1].minimum_abs() * radius) <= remainder {
            return false;
        }
        if next((v - b).abs()) > prev(prev(5. * amin) - e) {
            return false;
        }
    }
    true
}
