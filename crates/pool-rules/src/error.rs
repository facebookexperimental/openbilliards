// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `RulesError` — the frozen error surface (the rules-crate API contract
//! §5): seven codes, `Display` = the frozen message text, and the
//! structured `{"error":{"code","message"}}` JSON payload every fallible
//! boundary emits instead of panicking (the feature data-model §4).
//!
//! Message texts are ported VERBATIM from the shipped TS `RulesError`
//! strings wherever a shipped test (or the harvested byte oracle,
//! scripts/fixtures/rules-corpus.json) pins them; crate-only paths
//! (malformed input JSON) use new messages under the same codes.

use serde::Serialize;
use std::fmt;

/// Rules-engine error: unknown ruleset, invalid input payloads, decision
/// misuse, or judging a finished/pending match (adapter contract).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RulesError {
    /// The ruleset id is not in the registry.
    UnknownRuleset(String),
    /// The ShotRecord wire JSON failed to parse on a judged-upon field.
    BadRecord(String),
    /// The match-state JSON is malformed or internally inconsistent.
    BadState(String),
    /// The recorded call/nomination input is missing or invalid.
    BadCall(String),
    /// Decision kind mismatch, out-of-range choice, or none pending.
    BadDecision(String),
    /// Judge/decision use after the match (frame) ended.
    MatchOver(String),
    /// Judge called while a rulebook decision is pending.
    DecisionPending(String),
    /// Feature 022 (the variant-config contract §5, additive): the
    /// task-config envelope/config failed the STRICT parse or violated a
    /// value domain — config is a determinism key, never leniently read.
    InvalidTaskConfig(String),
    /// Feature 022 (the variant-config contract §5, additive): the preset
    /// id is not in the catalog (decode/judge/registration paths).
    UnknownPreset(String),
}

#[derive(Serialize)]
struct ErrorBody<'a> {
    code: &'a str,
    message: &'a str,
}

#[derive(Serialize)]
struct ErrorPayload<'a> {
    error: ErrorBody<'a>,
}

impl RulesError {
    /// The frozen wire code (the rules-crate API contract §5).
    pub fn code(&self) -> &'static str {
        match self {
            RulesError::UnknownRuleset(_) => "unknown-ruleset",
            RulesError::BadRecord(_) => "bad-record",
            RulesError::BadState(_) => "bad-state",
            RulesError::BadCall(_) => "bad-call",
            RulesError::BadDecision(_) => "bad-decision",
            RulesError::MatchOver(_) => "match-over",
            RulesError::DecisionPending(_) => "decision-pending",
            RulesError::InvalidTaskConfig(_) => "invalid-task-config",
            RulesError::UnknownPreset(_) => "unknown-preset",
        }
    }

    /// The frozen message text (what `Display` prints, verbatim).
    pub fn message(&self) -> &str {
        match self {
            RulesError::UnknownRuleset(m)
            | RulesError::BadRecord(m)
            | RulesError::BadState(m)
            | RulesError::BadCall(m)
            | RulesError::BadDecision(m)
            | RulesError::MatchOver(m)
            | RulesError::DecisionPending(m)
            | RulesError::InvalidTaskConfig(m)
            | RulesError::UnknownPreset(m) => m,
        }
    }

    /// The canonical structured payload — `{"error":{"code","message"}}`
    /// bytes, exactly as the harvested corpus pins them. Every surface
    /// wrapper ships these bytes verbatim; none re-serializes.
    pub fn to_json(&self) -> String {
        serde_json::to_string(&ErrorPayload {
            error: ErrorBody { code: self.code(), message: self.message() },
        })
        .expect("error payload serialization is infallible")
    }

    /// The registry miss, message frozen by the TS `getRuleset` text
    /// (corpus case `stub-v0/judge-error-001-unknown-ruleset`).
    pub fn unknown_ruleset(id: &str) -> RulesError {
        RulesError::UnknownRuleset(format!("unknown ruleset '{id}'"))
    }

    /// The preset-catalog miss (feature 022), mirroring the
    /// `unknown_ruleset` message shape; payload bytes pinned by the
    /// variant conformance slices (SC-006).
    pub fn unknown_preset(id: &str) -> RulesError {
        RulesError::UnknownPreset(format!("unknown preset '{id}'"))
    }
}

impl fmt::Display for RulesError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.message())
    }
}

impl std::error::Error for RulesError {}
