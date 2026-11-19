// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! T013 gate: P13 respot chains (id lists only — XY stays in TS
//! respot.ts, research R7), P14 penalty computation (snooker clamp +
//! one-pocket LIFO tray), P15 consecutive-foul counters.

use pool_rules::primitives::counters::{step, CounterStep, FoulCounterMode};
use pool_rules::primitives::penalty::{pay_one_ball, snooker_penalty};
use pool_rules::primitives::respot_chain::{
    flush_queues, sort_highest_first, sort_numeric,
};

/// P13: numerical sort (WPA 1.5) and highest-value-first (Sec3 R7).
#[test]
fn respot_orderings() {
    assert_eq!(sort_numeric(vec![11, 3, 4]), vec![3, 4, 11]);
    assert_eq!(sort_highest_first(vec![17, 21, 16]), vec![21, 17, 16]);
    assert_eq!(sort_numeric(vec![]), Vec::<i64>::new());
}

/// P13 one-pocket queues: immediate respots flush now; queued balls wait
/// for end-of-turn (a passing or table-clearing stroke flushes all).
#[test]
fn queue_flush_semantics() {
    // shooter continues: the queue survives
    let (respot, pending) = flush_queues(
        vec![7], vec![12, 4], &[9], false);
    assert_eq!(respot, vec![7]);
    assert_eq!(pending, vec![9, 12, 4]); // arrival order kept until flush
    // turn ends: everything (prior pending + this stroke's queue) spots,
    // numerically sorted
    let (respot, pending) = flush_queues(
        vec![7], vec![12, 4], &[9], true);
    assert_eq!(respot, vec![4, 7, 9, 12]);
    assert!(pending.is_empty());
}

/// P14 snooker: clamp(4, max(ball on, balls concerned), 7), one per
/// stroke (Sec3 R11 — the blue-involved-foul-on-red = 5 example).
#[test]
fn snooker_penalty_clamp() {
    assert_eq!(snooker_penalty(1, &[]), 4);       // foul on a red, floor
    assert_eq!(snooker_penalty(1, &[5]), 5);      // blue concerned on red
    assert_eq!(snooker_penalty(6, &[]), 6);       // pink on
    assert_eq!(snooker_penalty(1, &[7, 2]), 7);   // black concerned
    assert_eq!(snooker_penalty(7, &[7, 7]), 7);   // ceiling holds
}

/// P14 one-pocket: LIFO tray pop (most recently scored) or owed+1.
#[test]
fn one_pocket_payment() {
    let mut tray = vec![3, 10];
    let mut tally = 2;
    let mut owed = 0;
    assert_eq!(pay_one_ball(&mut tray, &mut tally, &mut owed), Some(10));
    assert_eq!((tray.as_slice(), tally, owed), ([3].as_slice(), 1, 0));
    assert_eq!(pay_one_ball(&mut tray, &mut tally, &mut owed), Some(3));
    assert_eq!(pay_one_ball(&mut tray, &mut tally, &mut owed), None);
    assert_eq!((tally, owed), (0, 1));
}

/// P15: tracked mode counts/resets/fires; disabled mode never moves
/// (WPA 3.13 self-exclusion — 8-ball).
#[test]
fn consecutive_foul_counters() {
    let m = FoulCounterMode::Tracked { loss_threshold: 3 };
    assert_eq!(step(m, 0, true), CounterStep { count: 1, lost: false });
    assert_eq!(step(m, 1, true), CounterStep { count: 2, lost: false });
    assert_eq!(step(m, 2, true), CounterStep { count: 3, lost: true });
    assert_eq!(step(m, 2, false), CounterStep { count: 0, lost: false });

    let d = FoulCounterMode::Disabled;
    assert_eq!(step(d, 0, true), CounterStep { count: 0, lost: false });
    assert_eq!(step(d, 5, true), CounterStep { count: 5, lost: false });
}
