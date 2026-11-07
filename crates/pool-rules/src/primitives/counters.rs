// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! P15 — consecutive-foul counters: one-pocket tracks three consecutive
//! fouls = loss of rack with reset-on-legal (WPA 12.9 via 3.13); WPA
//! 8-ball PERMANENTLY disables the rule (3.13 self-exclusion — not a
//! toggle, so the disabled mode is a distinct variant, not config
//! `false`); the other disciplines carry no counter.

/// Counter policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FoulCounterMode {
    /// Count fouls; `loss_threshold` consecutive fouls lose the rack;
    /// any legal stroke resets.
    Tracked { loss_threshold: i64 },
    /// WPA 3.13 self-exclusion (8-ball): the counter never moves.
    Disabled,
}

/// Outcome of one stroke against the counter.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CounterStep {
    pub count: i64,
    /// The threshold fired on THIS stroke.
    pub lost: bool,
}

/// Apply one stroke: `fouled` is the stroke's legality complement.
pub fn step(mode: FoulCounterMode, count: i64, fouled: bool) -> CounterStep {
    match mode {
        FoulCounterMode::Disabled => CounterStep { count, lost: false },
        FoulCounterMode::Tracked { loss_threshold } => {
            if fouled {
                let next = count + 1;
                CounterStep { count: next, lost: next >= loss_threshold }
            } else {
                CounterStep { count: 0, lost: false }
            }
        }
    }
}
