// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! P3 — the first-contact legality hook: per-ruleset policy applied to
//! the P2 fact. Each ruleset supplies a closure deciding whether the
//! first-contacted ball was legal (lowest-on-table for 9-ball,
//! group/open-table-aware for 8-ball, on-set membership for snooker,
//! break-only red-first for carom, always-legal for one-pocket) and what
//! `CitedFoul`s a miss/illegal contact earns.

use crate::judgment::CitedFoul;
use crate::primitives::scan::ShotFacts;

/// Outcome of the first-contact check: zero, one, or (never today) more
/// fouls, in the ruleset's citation order.
pub fn check_first_contact<L, N, W>(
    facts: &ShotFacts,
    legal_first: L,
    on_no_contact: N,
    on_wrong_first: W,
) -> Vec<CitedFoul>
where
    L: Fn(i64) -> bool,
    N: Fn() -> Option<CitedFoul>,
    W: Fn(i64) -> Option<CitedFoul>,
{
    match facts.first_contact {
        None => on_no_contact().into_iter().collect(),
        Some(c) if !legal_first(c.ball) => {
            on_wrong_first(c.ball).into_iter().collect()
        }
        Some(_) => Vec::new(),
    }
}

/// The 9-ball policy input: lowest object ball on the table.
pub fn lowest(on_table: &[i64]) -> Option<i64> {
    on_table.iter().copied().min()
}
