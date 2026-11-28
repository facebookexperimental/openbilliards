// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Test-only timings; the production wrappers reduce to direct calls.

pub(super) const F0: usize = 0;
pub(super) const SCREEN: usize = 1;
pub(super) const CONTACT: usize = 2;
pub(super) const BOUNDARY: usize = 3;
pub(super) const MINIMUM: usize = 4;
pub(super) const STATIONARY: usize = 5;
pub(super) const INTERVAL_MINIMUM: usize = 6;
pub(super) const SCREEN_ENTRY: usize = 7;
pub(super) const CONTACT_FAST: usize = 8;

#[cfg(test)]
std::thread_local! {
    static ENABLED: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
    static STATS: std::cell::Cell<[(u64, u64); 9]> = const { std::cell::Cell::new([(0, 0); 9]) };
    static MINIMUM_INPUTS: std::cell::RefCell<Vec<[f64; 9]>> = const { std::cell::RefCell::new(Vec::new()) };
    static SLOW_ROOTS: std::cell::RefCell<Vec<[f64; 9]>> = const { std::cell::RefCell::new(Vec::new()) };
    static COUNTERFACTUAL: std::cell::Cell<[u64; 6]> = const { std::cell::Cell::new([0; 6]) };
}

/// Test-only screen-site counterfactual for F12: [shifted queries, F12 not
/// attempted, attempted-undecided, certified empty, certified nonempty, F12 ns].
#[cfg(test)]
#[allow(dead_code)]
pub(super) fn take_counterfactual() -> [u64; 6] {
    COUNTERFACTUAL.replace([0; 6])
}

/// Times F12 on a shifted-screen query and checks its decision against the
/// delivered result; production results are unaffected.
#[cfg(test)]
fn screen_counterfactual(c: &[f64; 5], lo: f64, hi: f64, delivered: Option<f64>) {
    let start = std::time::Instant::now();
    let outcome = super::ordinary::decide(c, lo, hi);
    let ns = start.elapsed().as_nanos() as u64;
    let mut stats = COUNTERFACTUAL.get();
    stats[0] += 1;
    stats[5] += ns;
    match outcome {
        super::ordinary::Outcome::Skipped => stats[1] += 1,
        super::ordinary::Outcome::Undecided => stats[2] += 1,
        super::ordinary::Outcome::Decided(t) => {
            assert_eq!(
                t.map(f64::to_bits),
                delivered.map(f64::to_bits),
                "{c:?} ({lo:?}, {hi:?}]"
            );
            stats[if t.is_some() { 4 } else { 3 }] += 1;
        }
    }
    COUNTERFACTUAL.set(stats);
}

#[cfg(test)]
#[allow(dead_code)] // The external corpus harness opts into instrumentation.
pub(super) fn enable(value: bool) {
    ENABLED.set(value);
}

#[cfg(test)]
#[allow(dead_code)] // The external corpus harness reads these counters.
pub(super) fn take() -> [(u64, u64); 9] {
    STATS.replace([(0, 0); 9])
}

#[cfg(test)]
pub(super) fn minimum_input(c: &[f64; 5], distance: f64, scale: f64, lo: f64, hi: f64) {
    if ENABLED.get() {
        MINIMUM_INPUTS.with(|inputs| {
            let mut inputs = inputs.borrow_mut();
            if inputs.len() < 64 {
                inputs.push([c[0], c[1], c[2], c[3], c[4], distance, scale, lo, hi]);
            }
        });
    }
}

#[cfg(test)]
pub(super) fn take_minimum_inputs() -> Vec<[f64; 9]> {
    MINIMUM_INPUTS.with(|inputs| std::mem::take(&mut *inputs.borrow_mut()))
}

#[cfg(test)]
pub(super) fn take_slow_roots() -> Vec<[f64; 9]> {
    SLOW_ROOTS.with(|inputs| std::mem::take(&mut *inputs.borrow_mut()))
}

#[inline(always)]
pub(super) fn root(index: usize, c: &[f64; 5], lo: f64, hi: f64) -> Option<f64> {
    let out = query(index, c, lo, hi);
    // Outside the measured stage, so SCREEN timings are unaffected.
    #[cfg(test)]
    if index == SCREEN && ENABLED.get() {
        screen_counterfactual(c, lo, hi, out);
    }
    out
}

#[inline(always)]
fn query(index: usize, c: &[f64; 5], lo: f64, hi: f64) -> Option<f64> {
    measure(index, || {
        #[cfg(test)]
        if ENABLED.get() {
            let start = std::time::Instant::now();
            let out = kroots::earliest_root_in(c, lo, hi);
            let ns = start.elapsed().as_nanos() as u64;
            if ns >= 10_000 {
                SLOW_ROOTS.with(|inputs| {
                    let mut inputs = inputs.borrow_mut();
                    if inputs.len() < 64 {
                        inputs.push([
                            c[0],
                            c[1],
                            c[2],
                            c[3],
                            c[4],
                            lo,
                            hi,
                            index as f64,
                            ns as f64,
                        ]);
                    }
                });
            }
            return out;
        }
        kroots::earliest_root_in(c, lo, hi)
    })
}

#[inline(always)]
pub(super) fn measure<T>(index: usize, call: impl FnOnce() -> T) -> T {
    #[cfg(test)]
    if ENABLED.get() {
        let start = std::time::Instant::now();
        let result = call();
        let elapsed = start.elapsed().as_nanos() as u64;
        let mut stats = STATS.get();
        stats[index].0 += 1;
        stats[index].1 += elapsed;
        STATS.set(stats);
        return result;
    }
    let _ = index;
    call()
}
