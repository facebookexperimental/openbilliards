// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! T010 gate: P3 first-contact legality hook + P5 pocket classifiers.

use pool_rules::judgment::CitedFoul;
use pool_rules::primitives::contact::{check_first_contact, lowest};
use pool_rules::primitives::pockets::{
    call_fulfilled, off_set, partition_by_pocket, pocket_of,
};
use pool_rules::primitives::scan::{Pocketing, ShotFacts};

fn facts_with_contact(ball: Option<i64>) -> ShotFacts {
    ShotFacts {
        first_contact: ball.map(|b| {
            pool_rules::primitives::scan::Contact { idx: 1, ball: b }
        }),
        ..ShotFacts::default()
    }
}

const NO_CONTACT: &str = "no-contact";
const WRONG: &str = "wrong-first-ball";

fn hook(facts: &ShotFacts, legal: impl Fn(i64) -> bool) -> Vec<CitedFoul> {
    check_first_contact(
        facts,
        legal,
        || Some(CitedFoul::new(NO_CONTACT, "WPA 3.2")),
        |_| Some(CitedFoul::new(WRONG, "WPA 3.2")),
    )
}

/// P3: the three outcomes — miss, illegal first, legal first.
#[test]
fn first_contact_legality_hook() {
    let miss = hook(&facts_with_contact(None), |_| true);
    assert_eq!(miss.len(), 1);
    assert_eq!(miss[0].code, NO_CONTACT);

    let wrong = hook(&facts_with_contact(Some(2)), |b| b == 1);
    assert_eq!(wrong.len(), 1);
    assert_eq!(wrong[0].code, WRONG);

    assert!(hook(&facts_with_contact(Some(1)), |b| b == 1).is_empty());
}

/// The lowest-on-table policy input (9-ball).
#[test]
fn lowest_on_table() {
    assert_eq!(lowest(&[5, 7, 9]), Some(5));
    assert_eq!(lowest(&[]), None);
}

/// One-pocket that folds no-contact into the rail rule can return None
/// from the hook (always-legal contact policy).
#[test]
fn always_legal_variant_emits_nothing() {
    let fouls = check_first_contact(
        &facts_with_contact(None),
        |_| true,
        || None,
        |_| None,
    );
    assert!(fouls.is_empty());
}

fn pocketed() -> Vec<Pocketing> {
    vec![
        Pocketing { ball: 3, pocket: 2 },
        Pocketing { ball: 11, pocket: 5 },
        Pocketing { ball: 7, pocket: 0 },
        Pocketing { ball: 12, pocket: 2 },
    ]
}

/// P5 own/opp/neutral partition by kernel pocket index (one-pocket),
/// stream order preserved within each class.
#[test]
fn partition_preserves_stream_order() {
    let p = partition_by_pocket(&pocketed(), 2, 5);
    assert_eq!(p.own, vec![3, 12]);
    assert_eq!(p.opp, vec![11]);
    assert_eq!(p.neutral, vec![7]);
}

/// P5 call fulfillment + terminal-pocket lookup (8-ball).
#[test]
fn call_fulfillment_and_pocket_lookup() {
    let p = pocketed();
    assert!(call_fulfilled(&p, 3, 2));
    assert!(!call_fulfilled(&p, 3, 5)); // right ball, wrong pocket
    assert!(!call_fulfilled(&p, 4, 2)); // never dropped
    assert_eq!(pocket_of(&p, 11), Some(5));
    assert_eq!(pocket_of(&p, 4), None);
}

/// P5 on-set classification (snooker `not-nominated`): stream order.
#[test]
fn off_set_classification() {
    let p = pocketed();
    assert_eq!(off_set(&p, &[3, 12]), vec![11, 7]);
    assert!(off_set(&p, &[3, 11, 7, 12]).is_empty());
}
