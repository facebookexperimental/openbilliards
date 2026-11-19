#![cfg(feature = "decision-trace")]

// Copyright (c) Meta Platforms, Inc. and affiliates.

use kroots::{decision_trace as trace, earliest_root_in, real_roots_in};
fn run(c: [f64; 5], lo: f64, hi: f64) -> Vec<&'static str> {
    trace::begin();
    real_roots_in(&c, lo, hi);
    trace::take()
}
#[test]
fn ordered_spans_and_isolation() {
    trace::begin();
    real_roots_in(&[-1., 1., 0., 0., 0.], 0., 2.);
    real_roots_in(&[-f64::from_bits(923_u64 << 52), 1., -2., 1., 0.], 0.5, 1.5);
    let records = trace::take();
    assert!(records.contains(&"roots.degree.linear"));
    assert!(records.contains(&"roots.degree.cubic"));
    assert!(trace::take().is_empty());
    assert!(records.iter().all(|s| trace::IDS.contains(s)));
    trace::begin();
    real_roots_in(&[1., 0., 1., 0., 0.], 0., 2.);
    let other = std::thread::spawn(|| {
        assert!(trace::take().is_empty());
        run([-1., 1., 0., 0., 0.], 0., 2.)
    })
    .join()
    .unwrap();
    assert!(other.contains(&"roots.degree.linear"));
    assert!(!trace::take().is_empty());
}
#[test]
fn outcome_groups_and_earliest() {
    let cases = [
        ([24., -50., 35., -10., 1.], 0., 0.5, "roots.degree.quartic"),
        ([2., -3., 1., 0., 0.], 0., 3., "roots.degree.quadratic"),
        ([0.; 5], 0., 1., "roots.degree.zero"),
        ([7., 0., 0., 0., 0.], 0., 1., "roots.degree.constant"),
    ];
    for (c, lo, hi, degree) in cases {
        let full = real_roots_in(&c, lo, hi);
        for first in [false, true] {
            trace::begin();
            if first {
                assert_eq!(earliest_root_in(&c, lo, hi), full.first());
            } else {
                assert_eq!(real_roots_in(&c, lo, hi), full);
            }
            let records = trace::take();
            assert_eq!(
                records
                    .iter()
                    .filter(|s| s.starts_with("roots.degree."))
                    .copied()
                    .collect::<Vec<_>>(),
                [degree]
            );
            assert_eq!(
                records
                    .iter()
                    .filter(|s| s.starts_with("roots.window.finite")
                        || s.starts_with("roots.window.unbounded"))
                    .copied()
                    .collect::<Vec<_>>(),
                ["roots.window.finite"]
            );
        }
    }
}
#[test]
fn exact_shadow_and_guard_records() {
    assert_eq!(
        run([f64::NAN, 0., 0., 0., 0.], 0., 1.),
        ["roots.input.invalid"]
    );
    assert_eq!(
        real_roots_in(&[f64::from_bits(923_u64 << 52), 1., -2., 1., 0.], 0.5, 1.5).as_slice(),
        &[1.]
    );
}

#[test]
fn capacity_has_exact_panic() {
    trace::begin();
    for _ in 0..trace::CAPACITY {
        real_roots_in(&[f64::NAN, 0., 0., 0., 0.], 0., 1.);
    }
    let panic = std::panic::catch_unwind(|| real_roots_in(&[f64::NAN, 0., 0., 0., 0.], 0., 1.))
        .unwrap_err();
    let message = panic
        .downcast_ref::<&str>()
        .copied()
        .or_else(|| panic.downcast_ref::<String>().map(String::as_str));
    assert_eq!(message, Some("decision-trace overflow"));
    assert_eq!(trace::take().len(), trace::CAPACITY);
}

#[test]
fn exact_nondyadic_common_zero() {
    assert_eq!(
        real_roots_in(&[1., 12., 54., 108., 81.], -1., 0.).as_slice(),
        &[-1. / 3.]
    );
}
