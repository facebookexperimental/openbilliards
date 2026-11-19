// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Real roots of a polynomial of degree at most four inside a half-open window.
//!
//! Exact coefficients define the polynomial; algebraic estimates are certified
//! in the original time grid before a representative is returned.

#![forbid(unsafe_code)]

/// Decision trace (verification builds only; spec §1). With the cargo feature `decision-trace` the implementation
/// records each pre-registered decision id it takes, in execution order, into a per-thread buffer. Without the
/// feature this module does not exist and every recording site compiles to nothing.
#[cfg(feature = "decision-trace")]
pub mod decision_trace {
    use std::cell::RefCell;

    /// Maximum number of ids recorded between two calls of `begin`/`take`.
    pub const CAPACITY: usize = 1 << 20;

    /// Every id this crate may record (spec §1, same order).
    pub const IDS: &[&str] = &[
        "roots.input.invalid",
        "roots.degree.zero",
        "roots.degree.constant",
        "roots.degree.linear",
        "roots.degree.quadratic",
        "roots.degree.cubic",
        "roots.degree.quartic",
        "roots.window.finite",
        "roots.window.unbounded",
        "roots.range.finite_clip",
        "roots.window.lower_excluded",
        "roots.window.upper_exact",
        "roots.window.rounded_to_lower",
        "roots.arithmetic.plain",
        "roots.arithmetic.extended",
        "roots.empty.variation",
        "roots.empty.interval",
        "roots.empty.monotone",
        "roots.eval.plain",
        "roots.eval.compensated",
        "roots.eval.exact",
        "roots.refine.newton",
        "roots.refine.bisection",
        "roots.stationary.resolved",
        "roots.stationary.adjacent",
        "roots.admit.crossing",
        "roots.admit.exact_zero",
        "roots.admit.touching",
        "roots.touch.rejected",
        "roots.cluster.collapse",
        "roots.earliest.stop",
        "roots.profile.a",
        "roots.profile.c",
        "roots.a.normalize",
        "roots.a.scale.identity",
        "roots.a.scale.coordinate",
        "roots.a.shift.zero",
        "roots.a.shift.minimum",
        "roots.a.resolvent",
        "roots.a.factor.real",
        "roots.a.factor.complex",
        "roots.a.factor.limiting",
        "roots.a.factor.limiting_unavailable",
        "roots.a.factor.rebalance",
        "roots.a.factor.select",
        "roots.a.refine.iteration",
        "roots.a.refine.best",
        "roots.a.refine.zero",
        "roots.a.refine.relative_increase",
        "roots.a.refine.singular",
        "roots.a.refine.budget",
        "roots.a.candidate.real",
        "roots.a.candidate.near_real_pair",
        "roots.a.candidate.complex",
        "roots.a.certify.accept",
        "roots.a.certify.reject",
        "roots.a.certify.complete",
        "roots.a.certify.prefix",
        "roots.a.certify.incomplete",
        "roots.a.fallback.c",
    ];

    thread_local! {
        static BUF: RefCell<Vec<&'static str>> = const { RefCell::new(Vec::new()) };
    }

    /// Clears the buffer.
    pub fn begin() {
        BUF.with(|b| b.borrow_mut().clear());
    }

    /// Returns every id recorded since the last `begin` or `take`, in execution order, and clears the buffer.
    pub fn take() -> Vec<&'static str> {
        BUF.with(|b| std::mem::take(&mut *b.borrow_mut()))
    }

    /// Records one id. Panics with "decision-trace overflow" when the buffer is full.
    #[allow(dead_code)]
    pub(crate) fn record(id: &'static str) {
        debug_assert!(IDS.contains(&id), "unregistered decision id");
        BUF.with(|b| {
            let mut b = b.borrow_mut();
            if b.len() >= CAPACITY {
                panic!("decision-trace overflow");
            }
            b.push(id);
        });
    }
}

/// Records a decision id when the `decision-trace` feature is on; expands to nothing otherwise.
#[allow(unused_macros)]
macro_rules! trace_decision {
    ($id:expr) => {{
        #[cfg(feature = "decision-trace")]
        {
            $crate::decision_trace::record($id);
        }
    }};
}

mod arith;
mod candidate;
mod fast;
mod isolate;
mod plain;
mod poly;

/// Real roots of a polynomial of degree <= 4 inside a half-open time window, strictly ascending.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WindowRoots {
    /// Number of valid entries in `t` (0..=4).
    pub len: u8,
    /// `t[0..len]`: strictly ascending; every entry satisfies `lo < t[i] <= hi`. Unused entries are 0.0.
    pub t: [f64; 4],
}

impl WindowRoots {
    /// No roots.
    pub const EMPTY: WindowRoots = WindowRoots {
        len: 0,
        t: [0.0; 4],
    };

    /// The valid roots, ascending.
    pub fn as_slice(&self) -> &[f64] {
        &self.t[..usize::from(self.len).min(4)]
    }

    /// The earliest root, if any.
    pub fn first(&self) -> Option<f64> {
        self.as_slice().first().copied()
    }
}

/// Real roots of p(t) = c[0] + c[1]·t + c[2]·t² + c[3]·t³ + c[4]·t⁴ with lo < t <= hi, ascending.
/// Coefficients are in ascending powers. `hi` may be +infinity.
#[inline(always)]
pub fn real_roots_in(c: &[f64; 5], lo: f64, hi: f64) -> WindowRoots {
    solve(c, lo, hi, false)
}

/// Earliest real root with lo < t <= hi; equal to `real_roots_in(c, lo, hi).first()`.
#[inline(always)]
pub fn earliest_root_in(c: &[f64; 5], lo: f64, hi: f64) -> Option<f64> {
    solve(c, lo, hi, true).first()
}

#[inline(always)]
fn solve(c: &[f64; 5], lo: f64, hi: f64, first_only: bool) -> WindowRoots {
    if c.iter().any(|x| !x.is_finite())
        || !lo.is_finite()
        || hi.is_nan()
        || hi == f64::NEG_INFINITY
        || lo >= hi
    {
        trace_decision!("roots.input.invalid");
        return WindowRoots::EMPTY;
    }
    if hi.is_finite() {
        trace_decision!("roots.window.finite");
    } else {
        trace_decision!("roots.window.unbounded");
    }
    let n = c.iter().rposition(|v| *v != 0.).unwrap_or(0);
    match n {
        0 if c[0] == 0. => trace_decision!("roots.degree.zero"),
        0 => trace_decision!("roots.degree.constant"),
        1 => trace_decision!("roots.degree.linear"),
        2 => trace_decision!("roots.degree.quadratic"),
        3 => trace_decision!("roots.degree.cubic"),
        _ => trace_decision!("roots.degree.quartic"),
    }
    if n == 0 {
        return WindowRoots::EMPTY;
    }
    let mut prefix = None;
    if let Some(result) = fast::roots(c, n, lo, hi, first_only, &mut prefix) {
        return result;
    }
    if fast::empty(c, n, lo, hi) {
        return WindowRoots::EMPTY;
    }
    if let Some(result) = plain::solve(c, n, lo, hi, first_only, &mut prefix) {
        return result;
    }
    exact_solve(c, lo, hi, first_only, n, prefix)
}

#[cold]
#[inline(never)]
fn exact_solve(
    c: &[f64; 5],
    lo: f64,
    hi: f64,
    first_only: bool,
    n: usize,
    prefix: Option<f64>,
) -> WindowRoots {
    use arith::X;
    use core::cmp::Ordering;
    use isolate::{coordinate, rank, Solver};
    let p = poly::Poly::new(c);
    trace_decision!("roots.profile.a");
    // All terms of one sign on a strict half-axis give |p|=S. Thus this
    // variation certificate excludes numerical shadows as well as zeros.
    let axis = if lo >= 0.0 {
        1
    } else if hi <= 0.0 {
        -1
    } else {
        0
    };
    if axis != 0 {
        let mut common = 0;
        let mut same = true;
        for (i, value) in c.iter().enumerate().take(p.n + 1) {
            if *value != 0.0 {
                let sign =
                    if *value > 0.0 { 1 } else { -1 } * if axis < 0 && i % 2 == 1 { -1 } else { 1 };
                if common == 0 {
                    common = sign;
                } else if common != sign {
                    same = false;
                    break;
                }
            }
        }
        if same && !(hi == 0.0 && c[0] == 0.0) {
            trace_decision!("roots.empty.variation");
            return WindowRoots::EMPTY;
        }
    }
    let bound = p.bound();
    let mut a = rank(X::from(lo));
    let mut b = if hi.is_finite() {
        rank(X::from(hi))
    } else {
        isolate::LAST
    };
    trace_decision!("roots.range.finite_clip");
    let bound_a = rank(bound.neg());
    let bound_b = rank(bound);
    a = a.max(bound_a);
    b = b.min(bound_b);
    if a > b {
        trace_decision!("roots.empty.interval");
        return WindowRoots::EMPTY;
    }
    let ax = coordinate(a);
    let bx = coordinate(b);
    if p.plain_safe(ax) && p.plain_safe(bx) {
        trace_decision!("roots.arithmetic.plain");
    } else {
        trace_decision!("roots.arithmetic.extended");
    }
    if p.excludes(ax, bx) {
        trace_decision!("roots.empty.interval");
        return WindowRoots::EMPTY;
    }
    let derivative = p.derivative();
    let derivative_interval = derivative.interval(ax, bx);
    if derivative_interval.sign() != 0 {
        let sa = p.sign(poly::Pair::single(ax));
        let sb = p.sign(poly::Pair::single(bx));
        // A strict derivative sign rules out stationary shadows entirely.
        if sa != 0 && sa == sb {
            trace_decision!("roots.empty.monotone");
            return WindowRoots::EMPTY;
        }
    }
    let mut solver = Solver::new(p, a, b, lo, hi, first_only);
    if p.n == 4 {
        let proposals = candidate::generate(p);
        if proposals.usable {
            solver.hints = proposals.values;
            solver.hint_len = proposals.len;
            solver.profile_a = true;
            solver.nonreal_pair = proposals.nonreal_pair;
            solver.sources = proposals.sources;
        } else {
            trace_decision!("roots.a.certify.incomplete");
            trace_decision!("roots.a.fallback.c");
            trace_decision!("roots.profile.c");
        }
    }
    solver.collect(p.n, true);
    if !first_only || solver.result.len == 0 {
        solver.reconcile(None);
    }
    if solver.profile_a {
        if first_only && solver.result.len > 0 {
            // The prefix record is emitted at its admission site.
        } else {
            trace_decision!("roots.a.certify.complete");
        }
    }
    // An exact zero factor can share a terminal grid cell with a nonzero
    // root. Removing that factor preserves all nonzero exact roots, and
    // exposes crossings hidden by a zero endpoint in the derivative cascade.
    // This completion admits exact roots only; shadows remain decisions of p.
    if c[0] == 0.0 {
        let multiplicity = c.iter().position(|v| *v != 0.).unwrap_or(n);
        if multiplicity < n {
            let mut coefficients = [0.; 5];
            coefficients[..=n - multiplicity].copy_from_slice(&c[multiplicity..=n]);
            let q = poly::Poly::new(&coefficients);
            let mut completion = Solver::new(q, a, b, lo, hi, false);
            let roots = completion.collect(q.n, false);
            for mut root in roots.roots[..roots.len].iter().copied() {
                let k = root.finish(&completion.polys);
                let v = coordinate(k).to_f64();
                if v.is_finite() && v > lo && v <= hi && !solver.result.as_slice().contains(&v) {
                    let len = solver.result.len as usize;
                    if len < 4 {
                        solver.result.t[len] = if v == 0. { 0. } else { v };
                        solver.result.len += 1;
                    }
                }
                if first_only && v.is_finite() && v > lo && v <= hi {
                    break;
                }
            }
        }
    }
    if first_only && solver.result.len > 0 {
        trace_decision!("roots.earliest.stop");
    }
    // Insertion is bounded by the public degree; it requires no heap storage.
    for i in 1..solver.result.len as usize {
        let mut j = i;
        while j > 0
            && solver.result.t[j].partial_cmp(&solver.result.t[j - 1]) == Some(Ordering::Less)
        {
            solver.result.t.swap(j, j - 1);
            j -= 1;
        }
    }
    // A certified isolated first value survives completion of a later piece.
    // This keeps the public first value identical to the early-stopping call.
    if let Some(value) = prefix {
        solver.result.t[0] = value;
        if solver.result.len == 0 {
            solver.result.len = 1;
        }
    }
    if first_only && solver.result.len > 1 {
        solver.result.len = 1;
        solver.result.t[1..].fill(0.);
    }
    solver.result
}

#[cfg(all(test, feature = "decision-trace"))]
mod verification {
    use super::*;
    #[test]
    fn suppressed_proposal_keeps_the_complete_result() {
        decision_trace::begin();
        let p = poly::Poly::new(&[24., -50., 35., -10., 1.]);
        let mut solver = isolate::Solver::new(
            p,
            isolate::rank(arith::X::ZERO),
            isolate::rank(arith::X::from(5.0)),
            0.,
            5.,
            false,
        );
        solver.profile_a = true;
        solver.hint_len = 3;
        solver.hints = [
            arith::X::from(1.),
            arith::X::from(3.),
            arith::X::from(4.),
            arith::X::ZERO,
        ];
        solver.collect(4, true);
        assert_eq!(solver.result.as_slice(), &[1., 2., 3., 4.]);
        let _ = decision_trace::take();
    }
}
