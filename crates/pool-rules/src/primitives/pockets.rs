// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! P5 — pocket classification over the ordered `{ball, pocket}` list the
//! scan produced (cue already excluded). Classifier variants per the
//! usage matrix: any-pocket (9-ball), call-fulfillment + terminal-pocket
//! match (8-ball), own/opp/neutral partition by kernel pocket index
//! (one-pocket), on-set vs `not-nominated` (snooker); n/a for carom
//! (pocketless table).

use crate::primitives::scan::Pocketing;

/// One-pocket partition: stream order preserved within each class.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PocketPartition {
    pub own: Vec<i64>,
    pub opp: Vec<i64>,
    pub neutral: Vec<i64>,
}

/// Partition pocketed balls by kernel pocket index (WPA 12.5/12.6).
pub fn partition_by_pocket(
    pocketed: &[Pocketing],
    own_pocket: i64,
    opp_pocket: i64,
) -> PocketPartition {
    let mut p = PocketPartition::default();
    for e in pocketed {
        if e.pocket == own_pocket {
            p.own.push(e.ball);
        } else if e.pocket == opp_pocket {
            p.opp.push(e.ball);
        } else {
            p.neutral.push(e.ball);
        }
    }
    p
}

/// Call fulfillment (8-ball 4.5/4.6 via 1.7): the called ball reached
/// the called pocket.
pub fn call_fulfilled(pocketed: &[Pocketing], ball: i64, pocket: i64)
    -> bool {
    pocketed.iter().any(|p| p.ball == ball && p.pocket == pocket)
}

/// The pocket a given ball dropped into, if it dropped (8-ball terminal
/// pocket match for the 8).
pub fn pocket_of(pocketed: &[Pocketing], ball: i64) -> Option<i64> {
    pocketed.iter().find(|p| p.ball == ball).map(|p| p.pocket)
}

/// On-set classification (snooker R3(h)): ids NOT in the on-set, stream
/// order (the `not-nominated` balls-concerned input).
pub fn off_set(pocketed: &[Pocketing], on_set: &[i64]) -> Vec<i64> {
    pocketed
        .iter()
        .map(|p| p.ball)
        .filter(|id| !on_set.contains(id))
        .collect()
}
