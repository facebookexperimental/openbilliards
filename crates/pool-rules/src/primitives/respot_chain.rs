// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! P13 — respot chains: ball-ID lists ONLY. XY spot geometry stays in
//! the TS adapter (`sdk/ts/src/rules/respot.ts`, research R7) — spots
//! are never in any judgment, so no float ever enters the byte-compared
//! domain. Variants per the usage matrix:
//! - fixed: 9-ball respots exactly `[9]`;
//! - decision-gated: 8-ball spots the 8 only through applyDecision;
//! - immediate + end-of-turn queues with numerical sort (one-pocket,
//!   WPA 1.5 via 12.6);
//! - highest-value-first colours (snooker R7);
//! - balls-concerned (carom Art 27.3(b)/28.1(b)).

/// Numerical order (one-pocket spotting, WPA 1.5).
pub fn sort_numeric(mut ids: Vec<i64>) -> Vec<i64> {
    ids.sort_unstable();
    ids
}

/// Highest value first (snooker colour respots, Sec3 R7).
pub fn sort_highest_first(mut ids: Vec<i64>) -> Vec<i64> {
    ids.sort_unstable_by(|a, b| b.cmp(a));
    ids
}

/// The one-pocket spot-timing resolution (12.5/12.6): `now` respots
/// immediately (owed repayments + the foul penalty ball); `queued` waits
/// for the end of the shooter's turn — which THIS stroke is when it
/// passes the seat or cleared the table. Returns the stroke's `respot`
/// list (numerically sorted) and the surviving pending queue.
pub fn flush_queues(
    now: Vec<i64>,
    queued: Vec<i64>,
    pending_before: &[i64],
    turn_ends_or_cleared: bool,
) -> (Vec<i64>, Vec<i64>) {
    let mut pending: Vec<i64> = pending_before.to_vec();
    pending.extend(queued);
    let mut respot = now;
    if turn_ends_or_cleared {
        respot.append(&mut pending);
    }
    (sort_numeric(respot), pending)
}
