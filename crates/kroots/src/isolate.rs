// Copyright (c) Meta Platforms, Inc. and affiliates.

use crate::arith::X;
use crate::poly::{Pair, Poly};
use crate::WindowRoots;
use core::cmp::Ordering;

pub(crate) const CENTER: u64 = 0x7ff0_0000_0000_0000;
pub(crate) const LAST: u64 = 2 * CENTER;
pub(crate) fn coordinate(rank: u64) -> X {
    let bits = rank.abs_diff(CENTER);
    let a = if bits == CENTER {
        X::power(1024)
    } else {
        X::from(f64::from_bits(bits))
    };
    if rank < CENTER {
        a.neg()
    } else {
        a
    }
}
pub(crate) fn rank(x: X) -> u64 {
    let a = x.abs().to_f64();
    let bits = if a.is_finite() { a.to_bits() } else { CENTER };
    if x.sign() < 0 {
        CENTER - bits
    } else {
        CENTER + bits
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct Root {
    pub a: u64,
    pub b: u64,
    pub sa: i8,
    pub eq: usize,
    pub steps: u8,
    pub chosen: Option<u64>,
    pub identity: bool,
    pub hint: X,
    pub previous: u64,
    pub crossing: bool,
}
impl Root {
    const EMPTY: Self = Self {
        a: CENTER,
        b: CENTER,
        sa: 0,
        eq: 0,
        steps: 0,
        chosen: None,
        identity: false,
        hint: X::ZERO,
        previous: LAST,
        crossing: true,
    };
    fn bracket(a: u64, b: u64, sa: i8, eq: usize, hint: X) -> Self {
        Self {
            a,
            b,
            sa,
            eq,
            hint,
            ..Self::EMPTY
        }
    }
    fn point(a: u64, eq: usize) -> Self {
        Self {
            a,
            b: a,
            eq,
            chosen: Some(a),
            identity: true,
            ..Self::EMPTY
        }
    }
    fn terminal(a: u64, b: u64, chosen: u64, eq: usize, identity: bool) -> Self {
        Self {
            a,
            b,
            chosen: Some(chosen),
            eq,
            identity,
            ..Self::EMPTY
        }
    }
    pub fn step(&mut self, polys: &[Poly; 5]) {
        if self.b - self.a <= 1 {
            return;
        }
        let p = polys[self.eq];
        let middle = self.a + (self.b - self.a) / 2;
        let mut probe = middle;
        let mut newton = false;
        if self.steps & 1 == 0 {
            let estimate = if self.steps == 0 && self.hint.m != 0.0 {
                self.hint
            } else {
                let x = Pair::midpoint(coordinate(self.a), coordinate(self.b)).hi;
                let d = p.derivative().approximate(x);
                if d.m != 0.0 {
                    x.sub(p.approximate(x).div(d))
                } else {
                    coordinate(middle)
                }
            };
            let q = rank(estimate);
            if q > self.a && q < self.b && q != self.previous {
                probe = q;
                newton = true;
            }
        }
        if newton {
            trace_decision!("roots.refine.newton");
        } else {
            trace_decision!("roots.refine.bisection");
        }
        let s = p.sign(Pair::single(coordinate(probe)));
        self.steps += 1;
        self.previous = probe;
        if s == 0 {
            self.a = probe;
            self.b = probe;
            self.chosen = Some(probe);
            self.identity = true;
        } else if s == self.sa {
            self.a = probe;
        } else {
            self.b = probe;
        }
    }
    pub fn finish(&mut self, polys: &[Poly; 5]) -> u64 {
        if let Some(r) = self.chosen {
            return r;
        }
        while self.b - self.a > 1 {
            self.step(polys);
        }
        if self.a == self.b {
            self.chosen = Some(self.a);
            return self.a;
        }
        let m = Pair::midpoint(coordinate(self.a), coordinate(self.b));
        let sm = polys[self.eq].sign(m);
        let chosen = if sm == 0 {
            even(self.a, self.b)
        } else if sm == self.sa {
            self.b
        } else {
            self.a
        };
        self.chosen = Some(chosen);
        chosen
    }
}
fn even(a: u64, b: u64) -> u64 {
    if coordinate(a).to_f64().to_bits() & 1 == 0 {
        a
    } else {
        b
    }
}

#[derive(Clone, Copy)]
pub(crate) struct RootList {
    pub roots: [Root; 4],
    pub len: usize,
}
impl RootList {
    fn new() -> Self {
        Self {
            roots: [Root::EMPTY; 4],
            len: 0,
        }
    }
    fn push(&mut self, r: Root) {
        if r.a == r.b
            && self.roots[..self.len]
                .iter()
                .any(|previous| previous.a == r.a && previous.b == r.b)
        {
            return;
        }
        if self.len < 4 {
            self.roots[self.len] = r;
            self.len += 1;
        }
    }
}

#[derive(Clone, Copy)]
struct Station {
    root: Root,
    pa: i8,
    pb: i8,
    resolved: bool,
    shadow_free: bool,
}

pub(crate) struct Solver {
    pub polys: [Poly; 5],
    pub lo: u64,
    pub hi: u64,
    pub original_lo: f64,
    pub original_hi: f64,
    pub first_only: bool,
    pub result: WindowRoots,
    pub hints: [X; 4],
    pub hint_len: usize,
    pub profile_a: bool,
    pub accepted: usize,
    pub nonreal_pair: bool,
    pub matched: u8,
    pub sources: [u8; 4],
    pub certified_cells: [Option<(u64, u64)>; 4],
}
impl Solver {
    pub fn new(
        p: Poly,
        lo: u64,
        hi: u64,
        original_lo: f64,
        original_hi: f64,
        first_only: bool,
    ) -> Self {
        let mut polys = [p; 5];
        polys[p.n] = p;
        for n in (1..=p.n).rev() {
            polys[n - 1] = polys[n].derivative();
        }
        Self {
            polys,
            lo,
            hi,
            original_lo,
            original_hi,
            first_only,
            result: WindowRoots::EMPTY,
            hints: [X::ZERO; 4],
            hint_len: 0,
            profile_a: false,
            accepted: 0,
            nonreal_pair: false,
            matched: 0,
            sources: [0; 4],
            certified_cells: [None; 4],
        }
    }
    pub fn fallback(&mut self) {
        trace_decision!("roots.a.certify.incomplete");
        trace_decision!("roots.a.fallback.c");
        trace_decision!("roots.profile.c");
        self.profile_a = false;
    }
    fn hint(&self, a: u64, b: u64, local: &[X]) -> X {
        for h in local {
            let r = rank(*h);
            if r >= a && r <= b {
                return *h;
            }
        }
        X::ZERO
    }
    fn emit(&mut self, mut r: Root, top: bool, list: &mut RootList) -> bool {
        if !top {
            if r.identity && r.a == r.b {
                for order in 1..=r.eq {
                    if self.polys[r.eq - order].sign(Pair::single(coordinate(r.a))) != 0 {
                        r.crossing = order % 2 == 1;
                        break;
                    }
                }
            }
            list.push(r);
            return false;
        }
        let representative = r.finish(&self.polys);
        if r.a == r.b && coordinate(r.a).to_f64() == self.original_lo {
            trace_decision!("roots.window.lower_excluded");
            return false;
        }
        let value = coordinate(representative).to_f64();
        if !value.is_finite() {
            return false;
        }
        if value == self.original_lo {
            trace_decision!("roots.window.rounded_to_lower");
            return false;
        }
        if value <= self.original_lo || value > self.original_hi {
            return false;
        }
        let v = if value == 0.0 { 0.0 } else { value };
        if self.result.as_slice().contains(&v) {
            trace_decision!("roots.cluster.collapse");
            return false;
        }
        if r.identity {
            trace_decision!("roots.admit.exact_zero");
        } else {
            trace_decision!("roots.admit.crossing");
        }
        if r.a == r.b && value == self.original_hi {
            trace_decision!("roots.window.upper_exact");
        }
        if self.profile_a {
            // The derivative partition is the coverage certificate; a proposal
            // must belong to this owned component before it is accepted.
            let mut closest = None;
            for (i, h) in self.hints[..self.hint_len].iter().enumerate() {
                if self.matched & (1 << i) != 0 {
                    continue;
                }
                let k = rank(*h);
                if (k.abs_diff(representative) <= 8 || (k >= r.a && k <= r.b))
                    && closest.is_none_or(|previous: usize| {
                        k.abs_diff(representative)
                            < rank(self.hints[previous]).abs_diff(representative)
                    })
                {
                    closest = Some(i);
                }
            }
            if let Some(selected) = closest {
                // Identical proposals may describe one multiple-root component;
                // a proposal already owned by another component is unavailable.
                for i in 0..self.hint_len {
                    if self.hints[i] == self.hints[selected] {
                        self.matched |= 1 << i;
                        self.certified_cells[i] = Some((r.a, r.b));
                    }
                }
                trace_decision!("roots.a.certify.accept");
                self.accepted += 1;
            } else {
                trace_decision!("roots.a.certify.reject");
                self.fallback();
            }
        }
        let n = self.result.len as usize;
        if n < 4 {
            self.result.t[n] = v;
            self.result.len += 1;
        }
        if self.first_only {
            self.reconcile(Some(value));
            if self.profile_a {
                trace_decision!("roots.a.certify.prefix");
            }
            return true;
        }
        false
    }
    pub fn reconcile(&mut self, prefix: Option<f64>) {
        if !self.profile_a {
            return;
        }
        for factor in 0..2 {
            for i in 0..self.hint_len {
                if self.sources[i] != factor {
                    continue;
                }
                let value = self.hints[i].to_f64();
                if value > self.original_lo
                    && value <= self.original_hi
                    && prefix.is_none_or(|last| value <= last)
                    && self.matched & (1 << i) == 0
                {
                    trace_decision!("roots.a.certify.reject");
                    self.fallback();
                    return;
                }
            }
        }
    }
    fn piece(
        &mut self,
        n: usize,
        endpoints: [(u64, i8); 2],
        top: bool,
        out: &mut RootList,
        hints: &[X],
    ) -> bool {
        let [(a, sa), (b, sb)] = endpoints;
        if sa == 0 && self.emit(Root::point(a, n), top, out) {
            return true;
        }
        if a < b && sa * sb < 0 {
            let r = Root::bracket(a, b, sa, n, self.hint(a, b, hints));
            if self.emit(r, top, out) {
                return true;
            }
        }
        if sb == 0 && a != b && self.emit(Root::point(b, n), top, out) {
            return true;
        }
        false
    }
    pub fn collect(&mut self, n: usize, top: bool) -> RootList {
        let p = self.polys[n];
        let mut out = RootList::new();
        if n == 0 {
            return out;
        }
        let a = self.lo;
        let b = self.hi;
        let sa = p.sign(Pair::single(coordinate(a)));
        let sb = p.sign(Pair::single(coordinate(b)));
        let (hints, count) = if top && self.hint_len > 0 {
            (self.hints, self.hint_len)
        } else {
            quadratic_hints(p)
        };
        if n == 1 {
            self.piece(n, [(a, sa), (b, sb)], top, &mut out, &hints[..count]);
            return out;
        }
        let discriminant = if n == 2 { p.discriminant().sign() } else { 1 };
        if n == 2 && discriminant < 0 && !top {
            return out;
        }
        let mut derivative = self.collect(n - 1, false);
        let empty_station = Station {
            root: Root::EMPTY,
            pa: 0,
            pb: 0,
            resolved: false,
            shadow_free: false,
        };
        let mut stations = [empty_station; 3];
        for (i, item) in stations.iter_mut().enumerate().take(derivative.len) {
            let r = &mut derivative.roots[i];
            let mut resolved = false;
            let mut shadow_free = false;
            loop {
                let left = coordinate(r.a);
                let right = coordinate(r.b);
                let interval = p.interval(left, right);
                if interval.sign() != 0 {
                    resolved = true;
                    // Include both possible representatives in the exclusion.
                    shadow_free = p.excludes(left, right);
                    if !top || shadow_free {
                        trace_decision!("roots.stationary.resolved");
                        break;
                    }
                }
                if r.b - r.a <= 1 {
                    trace_decision!("roots.stationary.adjacent");
                    break;
                }
                r.step(&self.polys);
            }
            *item = Station {
                root: *r,
                pa: p.sign(Pair::single(coordinate(r.a))),
                pb: p.sign(Pair::single(coordinate(r.b))),
                resolved,
                shadow_free,
            };
        }
        let mut left = a;
        let mut left_sign = sa;
        for i in 0..derivative.len {
            let station = stations[i];
            let r = station.root;
            if self.piece(
                n,
                [(left, left_sign), (r.a, station.pa)],
                top,
                &mut out,
                &hints[..count],
            ) {
                return out;
            }
            let right_sign = if i + 1 < derivative.len {
                stations[i + 1].pa
            } else {
                sb
            };
            let incident = left_sign * station.pa < 0 || station.pb * right_sign < 0;
            if !station.resolved || (top && !station.shadow_free && !incident) {
                if r.a == r.b {
                    if station.pa != 0 && !incident && top {
                        self.touch(n, r, &mut out);
                        if self.first_only && self.result.len > 0 {
                            return out;
                        }
                    }
                } else if r.b - r.a == 1 {
                    let mid = Pair::midpoint(coordinate(r.a), coordinate(r.b));
                    let sm = p.sign(mid);
                    let mut sampled = false;
                    if station.pa * sm < 0 {
                        sampled = true;
                        if self.emit(Root::terminal(r.a, r.b, r.a, n, false), top, &mut out) {
                            return out;
                        }
                    }
                    if sm == 0 {
                        sampled = true;
                        if self.emit(
                            Root::terminal(r.a, r.b, even(r.a, r.b), n, true),
                            top,
                            &mut out,
                        ) {
                            return out;
                        }
                    }
                    if station.pb * sm < 0 {
                        sampled = true;
                        if self.emit(Root::terminal(r.a, r.b, r.b, n, false), top, &mut out) {
                            return out;
                        }
                    }
                    if !sampled && station.pa != 0 && station.pb != 0 && !incident {
                        let shared = p.common_zero_in(coordinate(r.a), coordinate(r.b));
                        if shared {
                            let mut rr = r;
                            rr.identity = true;
                            rr.crossing = station.pa != station.pb;
                            trace_decision!("roots.cluster.collapse");
                            if self.emit(rr, top, &mut out) {
                                return out;
                            }
                        } else if n == 2 && discriminant > 0 && !top {
                            // Both exact roots lie within one rounding half-cell.
                            // Preserve that exact-root component for the parent;
                            // its two sign-changing zeros are genuine extrema.
                            let mut rr = r;
                            let chosen = rr.finish(&self.polys);
                            let mut cluster = Root::terminal(r.a, r.b, chosen, n, false);
                            cluster.crossing = true;
                            trace_decision!("roots.cluster.collapse");
                            out.push(cluster);
                        } else if top {
                            self.touch(n, r, &mut out);
                            if self.first_only && self.result.len > 0 {
                                return out;
                            }
                        }
                    }
                }
            }
            left = r.b;
            left_sign = station.pb;
        }
        self.piece(
            n,
            [(left, left_sign), (b, sb)],
            top,
            &mut out,
            &hints[..count],
        );
        out
    }
    fn touch(&mut self, n: usize, mut r: Root, _out: &mut RootList) {
        let derivative = self.polys[n - 1];
        let a = r.a.saturating_sub(1);
        let b = (r.b + 1).min(LAST);
        if !r.crossing
            && derivative.sign(Pair::single(coordinate(a)))
                * derivative.sign(Pair::single(coordinate(b)))
                >= 0
        {
            return;
        }
        let k = r.finish(&self.polys);
        let x = coordinate(k);
        let value = x.to_f64();
        if !value.is_finite() || value <= self.original_lo || value > self.original_hi {
            return;
        }
        if r.a == r.b && value == self.original_lo {
            trace_decision!("roots.window.lower_excluded");
            return;
        }
        let p = self.polys[n];
        if self.profile_a && self.nonreal_pair {
            trace_decision!("roots.a.candidate.near_real_pair");
        }
        let (h, e) = p.canonical(x);
        let d = if k == CENTER {
            X::power(-1075)
        } else {
            let dl = x.sub(coordinate(k - 1)).abs();
            let dr = coordinate(k + 1).sub(x).abs();
            if dl.cmp(dr) == Ordering::Greater {
                dl.scale(-1)
            } else {
                dr.scale(-1)
            }
        };
        let radius = x.abs().add_up(d);
        let mut m2 = X::ZERO;
        for i in (2..=n).rev() {
            let coefficient = p.c[i]
                .hi
                .abs()
                .add_up(p.c[i].lo.abs())
                .mul_up(X::from((i * (i - 1)) as f64));
            m2 = m2.mul_up(radius).add_up(coefficient);
        }
        let t = e.add_up(d.mul_up(d).mul_up(m2).scale(-1));
        let mut magnitude = Poly { c: p.c, n };
        for c in &mut magnitude.c {
            c.hi = c.hi.abs();
            c.lo = c.lo.abs();
        }
        let mut difference = magnitude.exact(Pair::single(x.abs())).times(X::power(-47));
        difference.push(t.scale(1).neg());
        if h.abs().cmp(t) != Ordering::Greater && difference.sign() >= 0 {
            trace_decision!("roots.admit.touching");
            trace_decision!("roots.cluster.collapse");
            let v = if value == 0.0 { 0.0 } else { value };
            if !self.result.as_slice().contains(&v) && self.result.len < 4 {
                self.result.t[self.result.len as usize] = v;
                self.result.len += 1;
                if self.profile_a {
                    self.fallback();
                }
            }
        } else {
            trace_decision!("roots.touch.rejected");
        }
    }
}

pub(crate) fn quadratic_hints(p: Poly) -> ([X; 4], usize) {
    let mut r = [X::ZERO; 4];
    if p.n == 1 {
        r[0] = p.c[0].hi.neg().div(p.c[1].hi);
        return (r, 1);
    }
    if p.n != 2 {
        return (r, 0);
    }
    let d = p.discriminant();
    if d.sign() < 0 {
        return (r, 0);
    }
    let a = p.c[2].hi;
    let b = p.c[1].hi;
    let c = p.c[0].hi;
    if d.sign() == 0 {
        r[0] = b.neg().div(a).scale(-1);
        return (r, 1);
    }
    let sq = d.rounded().sqrt();
    let q = b
        .add(if b.sign() < 0 { sq.neg() } else { sq })
        .neg()
        .scale(-1);
    if q.m == 0.0 {
        r[0] = X::ZERO;
        return (r, 1);
    }
    r[0] = q.div(a);
    r[1] = c.div(q);
    if r[0].cmp(r[1]) == Ordering::Greater {
        r.swap(0, 1);
    }
    (r, 2)
}
