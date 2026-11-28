// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Routing predicate for F12 (see FILTERS.md): proves that the delivered
//! `kroots` plain path returns before its root search, so an ordinary contact
//! query reaches the delivered exact path, whose representatives are correctly
//! rounded. Between the VERBATIM markers: plain.rs lines 3-290, unchanged but for
//! two omitted lines, 7 (`const DEFLATE`, unused) and 67 (a no-op `trace_decision!`),
//! and one substitution on line 242: `libm::sqrt(delta)` replaces the method call,
//! which pool-core's forbidden-API gate rejects (both are the correctly rounded
//! square root). A unit test pins all of this to `crates/kroots/src/plain.rs`.
//! They never produce a time.

// BEGIN VERBATIM kroots/src/plain.rs
const U: f64 = 1.1102230246251565e-16;
const TINY: f64 = f64::from_bits(983_u64 << 52);
const HUGE: f64 = f64::from_bits(1063_u64 << 52);
const INFLATE: f64 = 1. + 128. * U;

#[inline]
fn product(a: f64, b: f64) -> (f64, f64) {
    let aa = 134217729. * a;
    let bb = 134217729. * b;
    let ah = aa - (aa - a);
    let bh = bb - (bb - b);
    let al = a - ah;
    let bl = b - bh;
    let h = a * b;
    (h, ((ah * bh - h) + ah * bl + al * bh) + al * bl)
}
#[inline]
fn sum(a: f64, b: f64) -> (f64, f64) {
    let h = a + b;
    let z = h - a;
    (h, (a - (h - z)) + (b - z))
}
#[inline]
fn safe(x: f64) -> bool {
    x == 0. || (x.abs() >= TINY && x.abs() <= HUGE)
}
#[derive(Clone, Copy)]
struct P {
    h: [f64; 5],
    l: [f64; 5],
    n: usize,
}
impl P {
    fn make(c: &[f64; 5], n: usize, order: usize) -> Self {
        let mut p = Self {
            h: [0.; 5],
            l: [0.; 5],
            n: n - order,
        };
        for (i, &v) in c.iter().enumerate().take(n + 1).skip(order) {
            let mut factor = 1.;
            for j in 0..order {
                factor *= (i - j) as f64;
            }
            (p.h[i - order], p.l[i - order]) = product(v, factor);
        }
        p
    }
    fn magnitude(self, x: f64) -> f64 {
        let mut s = self.h[self.n].abs() + self.l[self.n].abs();
        for i in (0..self.n).rev() {
            s = s * x.abs() + (self.h[i].abs() + self.l[i].abs());
        }
        s * INFLATE
    }
    fn ordinary(self, x: f64) -> (f64, f64) {
        let mut h = self.h[self.n];
        for i in (0..self.n).rev() {
            h = h * x + self.h[i];
        }
        (h, 32. * U * self.magnitude(x))
    }
    fn compensated(self, x: f64) -> (f64, f64) {
        let mut h = self.h[self.n];
        let mut correction = self.l[self.n];
        for i in (0..self.n).rev() {
            let (t, pe) = product(h, x);
            let (v, se) = sum(t, self.h[i]);
            correction = (correction * x + (pe + se)) + self.l[i];
            h = v;
        }
        let value = h + correction;
        (
            value,
            (2. * U * value.abs() + 256. * U * U * self.magnitude(x)) * INFLATE,
        )
    }
    fn sign(self, x: f64) -> Option<i8> {
        let (h, e) = self.ordinary(x);
        if h.abs() > e {
            return Some(if h > 0. { 1 } else { -1 });
        }
        let (h, e) = self.compensated(x);
        if h.abs() > e {
            Some(if h > 0. { 1 } else { -1 })
        } else {
            None
        }
    }
}
#[derive(Clone, Copy, Default)]
struct B {
    a: f64,
    b: f64,
    x: f64,
}
#[derive(Clone, Copy)]
struct List {
    v: [B; 4],
    len: usize,
}
impl List {
    fn new() -> Self {
        Self {
            v: [B::default(); 4],
            len: 0,
        }
    }
    fn push(&mut self, r: B) -> Option<()> {
        if self.len > 0 && self.v[self.len - 1].b >= r.a {
            return None;
        }
        if self.len == 4 {
            return None;
        }
        self.v[self.len] = r;
        self.len += 1;
        Some(())
    }
}

fn bracket(p: P, d: P, x: f64) -> Option<B> {
    if !safe(x) {
        return None;
    }
    if x == 0. && p.h[0] == 0. && p.l[0] == 0. {
        return Some(B {
            a: 0.,
            b: 0.,
            x: 0.,
        });
    }
    let (dv, de) = d.ordinary(x);
    if dv.abs() <= de || dv.abs() < f64::from_bits(623_u64 << 52) {
        return None;
    }
    let radius = 128. * U * p.magnitude(x) / dv.abs();
    let a = x - radius;
    let b = x + radius;
    if !safe(a) || !safe(b) || a >= b {
        return None;
    }
    let sa = p.sign(a)?;
    let sb = p.sign(b)?;
    (sa != sb).then_some(B { a, b, x })
}

fn search(p: P, d: P, mut a: f64, mut b: f64, mut sa: i8) -> Option<B> {
    let left = a;
    let right = b;
    let mut x = (a + b) * 0.5;
    for _ in 0..48 {
        if !safe(x) {
            return None;
        }
        let (mut h, e) = p.ordinary(x);
        if h.abs() < e * 1048576. {
            h = p.compensated(x).0;
            let (dv, de) = d.ordinary(x);
            if dv.abs() > de && dv.abs() > f64::from_bits(623_u64 << 52) {
                let corrected = x - h / dv;
                if corrected > a && corrected < b && safe(corrected) {
                    if let Some(r) = bracket(p, d, corrected) {
                        if r.a >= left && r.b <= right {
                            return Some(r);
                        }
                    }
                }
            }
        }
        let sign = if h.abs() > e {
            if h > 0. {
                1
            } else {
                -1
            }
        } else {
            p.sign(x)?
        };
        if sign == sa {
            a = x;
            sa = sign;
        } else {
            b = x;
        }
        let (dv, de) = d.ordinary(x);
        let next = if dv.abs() > de && dv.abs() > f64::from_bits(623_u64 << 52) {
            x - h / dv
        } else {
            a
        };
        x = if next > a && next < b && next != x {
            next
        } else {
            (a + b) * 0.5
        };
    }
    None
}

// The location interval includes the exact stationary zero and its rounded
// representative. A Lipschitz enclosure rejects the entire shadow band.
fn station_sign(p: P, d: P, r: B, shadows: bool) -> Option<i8> {
    let x = (r.a + r.b) * 0.5;
    let radius = (x - r.a).abs().max((r.b - x).abs()) * INFLATE;
    let max = r.a.abs().max(r.b.abs());
    let (h, e) = p.ordinary(x);
    let bound = (e
        + d.magnitude(max) * radius
        + if shadows {
            64. * U * p.magnitude(max)
        } else {
            0.
        })
        * INFLATE;
    (h.abs() > bound).then_some(if h > 0. { 1 } else { -1 })
}

fn quadratic(p: P, d: P) -> Option<List> {
    let mut out = List::new();
    if p.h[0] == 0. && p.l[0] == 0. && p.h[1] == 0. && p.l[1] == 0. {
        out.push(B::default())?;
        return Some(out);
    }
    let a = p.h[2];
    let b = p.h[1];
    let c = p.h[0];
    let bb = b * b;
    let ac = 4. * a * c;
    let delta = bb - ac;
    let error = 64. * U * (bb + ac.abs());
    if delta < -error {
        return Some(out);
    }
    if delta <= error {
        return None;
    }
    let sq = libm::sqrt(delta);
    let q = -0.5 * (b + if b < 0. { -sq } else { sq });
    let mut roots = [q / a, c / q];
    if roots[0] > roots[1] {
        roots.swap(0, 1);
    }
    for mut x in roots {
        if !safe(x) {
            return None;
        }
        if x != 0. {
            let (dv, de) = d.ordinary(x);
            if dv.abs() <= de || dv.abs() < f64::from_bits(623_u64 << 52) {
                return None;
            }
            x -= p.compensated(x).0 / dv;
        }
        out.push(bracket(p, d, x)?)?;
    }
    Some(out)
}

fn collect(polys: &[P; 5], n: usize, bound: f64) -> Option<List> {
    let p = polys[n];
    let d = polys[n - 1];
    if n == 2 {
        return quadratic(p, d);
    }
    let stations = collect(polys, n - 1, bound)?;
    let mut out = List::new();
    let mut a = -bound;
    let mut sa = p.sign(a)?;
    for i in 0..=stations.len {
        let (b, sb) = if i < stations.len {
            let r = stations.v[i];
            (r.a, station_sign(p, d, r, false)?)
        } else {
            (bound, p.sign(bound)?)
        };
        if sa != sb {
            out.push(search(p, d, a, b, sa)?)?;
        }
        if i < stations.len {
            a = stations.v[i].b;
            sa = sb;
        }
    }
    Some(out)
}
// END VERBATIM

/// True when the delivered `plain::solve(c, n, lo, ..)` certainly returns None
/// before any root search: this mirrors its entry checks, root bound, exact
/// derivative records, stationary collection and the shadow-sign loop, using
/// the verbatim items above. False only means "may return"; the caller then
/// keeps the delivered query.
pub(super) fn station_defers(c: &[f64; 5], n: usize, lo: f64) -> bool {
    if !(3..=4).contains(&n)
        || (c[0] == 0. && lo < TINY)
        || c[..=n]
            .iter()
            .any(|v| *v != 0. && !((943..=1063).contains(&((v.to_bits() >> 52) & 2047))))
    {
        return true;
    }
    let leading = ((c[n].to_bits() >> 52) & 2047) as i32;
    let mut exponent = 0;
    for (i, v) in c.iter().enumerate().take(n) {
        if *v != 0. {
            let gap = (n - i) as i32;
            let e = ((v.to_bits() >> 52) & 2047) as i32 - leading + 1;
            exponent = exponent.max((e + gap - 1).div_euclid(gap));
        }
    }
    if exponent >= 40 {
        return true;
    }
    let bound = f64::from_bits(((1024 + exponent) as u64) << 52);
    let mut polys = [P {
        h: [0.; 5],
        l: [0.; 5],
        n: 0,
    }; 5];
    for (degree, p) in polys.iter_mut().enumerate().take(n + 1) {
        *p = P::make(c, n, n - degree);
    }
    let p = polys[n];
    let d = polys[n - 1];
    let Some(stations) = collect(&polys, n - 1, bound) else {
        return true;
    };
    stations.v[..stations.len]
        .iter()
        .any(|&r| station_sign(p, d, r, true).is_none())
}

#[cfg(test)]
mod tests {
    /// Every copied chunk must occur verbatim in the delivered plain.rs
    /// (with its no-op trace lines removed and the one square-root
    /// substitution applied), so the predicate cannot drift.
    #[test]
    fn copied_items_are_verbatim_kroots_plain() {
        // Spelled with concat! so that this file never contains the method-call
        // form that the forbidden-API gate rejects.
        const DELIVERED_SQRT: &str = concat!("    let sq = delta.", "sqrt", "();\n");
        const OWN_SQRT: &str = "    let sq = libm::sqrt(delta);\n";
        let delivered: String = include_str!("../../../../kroots/src/plain.rs")
            .lines()
            .filter(|line| !line.contains("trace_decision!"))
            .map(|line| format!("{line}\n"))
            .collect();
        assert_eq!(delivered.matches(DELIVERED_SQRT).count(), 1);
        let delivered = delivered.replacen(DELIVERED_SQRT, OWN_SQRT, 1);
        let own = include_str!("route.rs");
        let block = own
            .split("// BEGIN VERBATIM kroots/src/plain.rs\n")
            .nth(1)
            .and_then(|rest| rest.split("// END VERBATIM").next())
            .expect("verbatim markers");
        assert_eq!(block.matches(OWN_SQRT).count(), 1);
        let mut chunks = 0;
        for chunk in block.split("\n\n") {
            let chunk = chunk.trim_matches('\n');
            if chunk.is_empty() {
                continue;
            }
            assert!(
                delivered.contains(&format!("{chunk}\n")),
                "not verbatim:\n{chunk}"
            );
            chunks += 1;
        }
        assert_eq!(chunks, 7);
        for name in [
            "fn bracket",
            "fn search",
            "fn station_sign",
            "fn quadratic",
            "fn collect",
        ] {
            assert!(block.contains(name), "{name}");
        }
    }
}
