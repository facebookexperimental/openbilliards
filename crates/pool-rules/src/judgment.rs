// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! Canonical judgment serialization (research R2, the feature data-model §4): the
//! crate is the ONLY serializer of judgments; every surface returns these
//! bytes verbatim. Field order is the frozen contract declaration order
//! (`legal, fouls, pocketed, ballInHand, respot, turn, decisionRequired,
//! terminal, next`); the output domain is ints/strings/bools/null/arrays/
//! objects — NO f64 anywhere in this module (the classic serde-vs-JS
//! float divergence cannot occur structurally).
//!
//! Seat-keyed maps (`groups`/`pockets`/`tallies`/`owed`/`scores`/…)
//! serialize through [`SeatPair`]: a struct with `"1"`/`"2"` keys declared
//! ascending, matching JS `JSON.stringify`'s integer-like key ordering
//! that the harvested corpus reflects.

use serde::{Deserialize, Serialize};

use crate::error::RulesError;

/// Foul with its rulebook citation (FR data: `code` is the stable
/// wire/i18n key, `cite` the pinned rule number).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CitedFoul {
    pub code: String,
    pub cite: String,
}

impl CitedFoul {
    pub fn new(code: &str, cite: &str) -> CitedFoul {
        CitedFoul { code: code.to_string(), cite: cite.to_string() }
    }
}

/// Cue-ball placement right granted to the incoming shooter
/// (the ruleset API contract, frozen): serializes as the four wire strings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PlacementRight {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "anywhere")]
    Anywhere,
    #[serde(rename = "kitchen")]
    Kitchen,
    #[serde(rename = "d_zone")]
    DZone,
}

/// Seat consequence of the judged shot (the adapter applies it).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Turn {
    #[serde(rename = "continue")]
    Continue,
    #[serde(rename = "pass")]
    Pass,
}

/// Decision chooser: seat `1 | 2` (JSON int) or `"both"` (JSON string) —
/// the mixed int/string wire the TS implementation shipped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Chooser {
    Seat(u8),
    Both,
}

impl Serialize for Chooser {
    fn serialize<S: serde::Serializer>(&self, s: S)
        -> Result<S::Ok, S::Error> {
        match self {
            Chooser::Seat(n) => s.serialize_u8(*n),
            Chooser::Both => s.serialize_str("both"),
        }
    }
}

impl<'de> Deserialize<'de> for Chooser {
    fn deserialize<D: serde::Deserializer<'de>>(d: D)
        -> Result<Chooser, D::Error> {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Wire {
            Seat(u8),
            Text(String),
        }
        match Wire::deserialize(d)? {
            Wire::Seat(n) => Ok(Chooser::Seat(n)),
            Wire::Text(t) if t == "both" => Ok(Chooser::Both),
            Wire::Text(t) => Err(serde::de::Error::custom(format!(
                "chooser must be 1 | 2 | \"both\", got {t:?}"))),
        }
    }
}

/// A pending rulebook option surfaced by a judgment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DecisionRequired {
    pub kind: String,
    pub chooser: Chooser,
}

/// Terminal verdict: `{winner, reason, cite}` (P17).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Terminal {
    pub winner: i64,
    pub reason: String,
    pub cite: String,
}

/// Seat-keyed pair: serializes as `{"1": …, "2": …}` with keys declared
/// ascending (JS integer-like key order, matching the corpus bytes).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SeatPair<T> {
    #[serde(rename = "1")]
    pub one: T,
    #[serde(rename = "2")]
    pub two: T,
}

impl<T> SeatPair<T> {
    pub fn new(one: T, two: T) -> SeatPair<T> {
        SeatPair { one, two }
    }

    /// The entry for `seat` (1 or 2). Callers validate seats at the
    /// boundary (`Seat` contract).
    pub fn get(&self, seat: u8) -> &T {
        if seat == 1 { &self.one } else { &self.two }
    }

    pub fn get_mut(&mut self, seat: u8) -> &mut T {
        if seat == 1 { &mut self.one } else { &mut self.two }
    }
}

/// One judged shot (the ruleset API contract `Judgment<S>`, frozen shape). `S` is
/// the per-ruleset typed match state; at the `_json` boundary it crosses
/// as opaque JSON. Serde declaration order below IS the byte contract.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Judgment<S> {
    pub legal: bool,
    /// Every detected foul; `legal == fouls.is_empty()` (P11 invariant).
    pub fouls: Vec<CitedFoul>,
    /// Object balls pocketed, pocketing order, cue excluded.
    pub pocketed: Vec<i64>,
    #[serde(rename = "ballInHand")]
    pub ball_in_hand: PlacementRight,
    /// Ball ids to respot — ids ONLY; target spots derive adapter-side
    /// (research R7: respot.ts geometry stays in TS).
    pub respot: Vec<i64>,
    pub turn: Turn,
    #[serde(rename = "decisionRequired")]
    pub decision_required: Option<DecisionRequired>,
    pub terminal: Option<Terminal>,
    /// Complete post-shot match state.
    pub next: S,
}

impl<S: Serialize> Judgment<S> {
    /// The canonical bytes (the only serialization any surface ships).
    pub fn to_json(&self) -> Result<String, RulesError> {
        serde_json::to_string(self).map_err(|e| {
            RulesError::BadState(format!("judgment serialization: {e}"))
        })
    }
}
