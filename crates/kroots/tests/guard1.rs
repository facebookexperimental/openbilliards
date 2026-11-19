// Copyright (c) Meta Platforms, Inc. and affiliates.

use kroots::{earliest_root_in, real_roots_in};

#[cfg(feature = "decision-trace")]
fn assert_unusable_refinement(records: &[&str]) {
    let transfer = [
        "roots.a.refine.iteration",
        "roots.a.certify.incomplete",
        "roots.a.fallback.c",
        "roots.profile.c",
    ];
    let positions: Vec<_> = records
        .windows(transfer.len())
        .enumerate()
        .filter_map(|(i, ids)| (ids == transfer).then_some(i))
        .collect();
    assert_eq!(positions.len(), 1);
    assert!(!records[positions[0] + 1..]
        .iter()
        .any(|id| id.starts_with("roots.a.refine.")));
    assert!(records.iter().all(|id| kroots::decision_trace::IDS.contains(id)));
}

#[test]
fn lowered_post_update_guard_preserves_both_outputs() {
    // The first input in inbox/vectors-guard1/vectors.jsonl (records 1 and 2).
    let c = [
        0,
        0,
        0x0000_0000_0000_0001,
        0x7fdf_e2cc_2889_a598,
        0x8000_0000_0000_0124,
    ]
    .map(f64::from_bits);
    let lo = f64::from_bits(0xffef_ffff_ffff_ffff);

    #[cfg(feature = "decision-trace")]
    kroots::decision_trace::begin();
    let full = real_roots_in(&c, lo, f64::INFINITY);
    assert_eq!(full.len, 1);
    assert_eq!(full.t.map(f64::to_bits), [0; 4]);
    #[cfg(feature = "decision-trace")]
    assert_unusable_refinement(&kroots::decision_trace::take());

    #[cfg(feature = "decision-trace")]
    kroots::decision_trace::begin();
    assert_eq!(
        earliest_root_in(&c, lo, f64::INFINITY).map(f64::to_bits),
        Some(0)
    );
    #[cfg(feature = "decision-trace")]
    assert_unusable_refinement(&kroots::decision_trace::take());
}
