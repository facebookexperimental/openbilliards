// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! P16 — decision plumbing: the shared wire `Decision {decision, choice}`
//! and the validation liturgy every ruleset applies IN ORDER —
//! post-match guard → kind-vs-pending match → choice range — each step
//! yielding the ruleset's frozen `RulesError` message (the corpus pins
//! every text). The id space 1–10 is GLOBAL and disjoint (share-codec v4
//! frozen): 1 dry_break, 2 eight_legal_break, 3 eight_foul_break,
//! 4 break_foul, 5 stalemate, 6 break_pocket, 7 play_again,
//! 8 respotted_black_toss, 9 stalemate_lag, 10 break_spot. Feature 025
//! (issue #65) allocates the FIRST id past the frozen space, additively:
//! 11 break_violation (14.1 opening-break accept/re-break, WPA 7.3(b)).
//!
//! Two birth modes exist (both exercised by the corpus): judgment-born
//! pendings (8-ball break outcomes, snooker fouls/tie) and
//! initialState-born pendings (one-pocket break_pocket, carom
//! break_spot). Never-pending agreements (stalemate 5, stalemate_lag 9)
//! pass through with their own pre-emption guards — ruleset logic, not
//! liturgy.

use serde::Deserialize;

use crate::error::RulesError;

/// Recorded resolution of a pending decision (wire shape, frozen).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub struct Decision {
    pub decision: i64,
    pub choice: i64,
}

/// Parse the decision wire JSON (`bad-decision` on malformed payloads —
/// crate-only message, not corpus-pinned).
pub fn parse_decision(json: &str) -> Result<Decision, RulesError> {
    serde_json::from_str(json)
        .map_err(|e| RulesError::BadDecision(format!("decision: {e}")))
}

/// Liturgy step: choice-range check with the ruleset's frozen message.
pub fn check_choice(ok: bool, message: String) -> Result<(), RulesError> {
    if ok { Ok(()) } else { Err(RulesError::BadDecision(message)) }
}

/// Liturgy step: kind-vs-pending mismatch with the frozen message.
pub fn check_pending(matches: bool, message: String)
    -> Result<(), RulesError> {
    if matches { Ok(()) } else { Err(RulesError::BadDecision(message)) }
}

/// Unknown decision id (the frozen `unknown decision id N` texts).
pub fn unknown_id(message: String) -> RulesError {
    RulesError::BadDecision(message)
}
