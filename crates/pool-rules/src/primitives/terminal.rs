// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! P17 — terminal plumbing: the `{winner, reason, cite}` verdict (type
//! lives in [`crate::judgment`], shared with the wire), the phase→over
//! convention, and the judge-after-end guard every ruleset opens with
//! (adapter contract: judge MUST NOT be called on a finished match —
//! the frozen `match-over` `RulesError`).

use crate::error::RulesError;
use crate::judgment::Terminal;

/// Build a terminal verdict.
pub fn terminal(winner: i64, reason: &str, cite: &str) -> Terminal {
    Terminal {
        winner,
        reason: reason.to_string(),
        cite: cite.to_string(),
    }
}

/// The judge-after-end guard: `is_over` is the ruleset's own predicate
/// (`result !== null || phase === 'over'` in every shipped state);
/// `message` is the ruleset's frozen text (corpus-pinned).
pub fn guard_not_over(is_over: bool, message: &str)
    -> Result<(), RulesError> {
    if is_over {
        Err(RulesError::MatchOver(message.to_string()))
    } else {
        Ok(())
    }
}

/// The decision-pending guard (same shape, `decision-pending` code).
pub fn guard_no_pending(pending: bool, message: String)
    -> Result<(), RulesError> {
    if pending {
        Err(RulesError::DecisionPending(message))
    } else {
        Ok(())
    }
}
