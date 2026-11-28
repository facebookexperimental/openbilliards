// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! Lenient ShotRecord wire mirror (research R1, the feature data-model §3): a
//! second, hand-mirrored implementation of the pool-core `ShotRecord`
//! serde JSON — deliberately INDEPENDENT of pool-core (the open boundary,
//! and the kernel_version hard-reject makes the kernel's own parser
//! unusable on canonical-artifact records).
//!
//! Leniency contract:
//! - `kernel_version` accepted, NEVER validated (canonical-wasm records,
//!   older kernels, and test plumbing with `'test'` all judge);
//! - unknown fields ignored everywhere (serde default);
//! - judged-irrelevant fields defaulted when missing: partial `table`
//!   (the TS suites pass `{width, length}` casts), missing `options`/
//!   `shot`/`format_version`, absent `post` arrays.
//!
//! Judged-upon surface — parse failures here ARE errors (`bad-record`):
//! the event list (kind tags, ball ids, pocket index, `post[]` poses,
//! emission order), `Strike`, the initial ball snapshot (ids, positions,
//! radii — snooker P10 geometry), table pocket count/indices.
//!
//! Drift guard: `crates/pool-cli/tests/rules_wire_drift.rs` serializes a
//! native pool-core record and asserts every judged-upon field
//! round-trips through this mirror (migration-gate check M7).

use serde::Deserialize;

use crate::error::RulesError;

/// Complete judged wire record (lenient mirror of `record.rs ShotRecord`).
#[derive(Debug, Clone, Deserialize)]
pub struct WireRecord {
    /// Accepted verbatim, never compared against anything (research R1).
    #[serde(default)]
    pub kernel_version: String,
    /// The judged-upon initial system snapshot.
    pub initial: WireSystem,
    /// The judged event stream, in emission order (the causal order for
    /// every before/after question — `nineball.ts:93–99` convention).
    pub events: Vec<WireEvent>,
}

/// Initial system snapshot: balls + (lenient) table.
#[derive(Debug, Clone, Deserialize)]
pub struct WireSystem {
    pub balls: Vec<WireBall>,
    #[serde(default)]
    pub table: WireTable,
}

/// Ball snapshot: id, radius (P10 geometry), pose + motion.
#[derive(Debug, Clone, Deserialize)]
pub struct WireBall {
    pub id: i64,
    pub params: WireBallParams,
    pub state: WireBallState,
}

/// Ball params: only the radius is judged upon (snooker chord test).
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct WireBallParams {
    pub r: f64,
}

/// Ball kinematic state: position + motion tag (`'Pocketed'` filters the
/// on-table derivation; `'Airborne'` drives the P10 jump hook).
#[derive(Debug, Clone, Deserialize)]
pub struct WireBallState {
    pub pos: WireVec3,
    pub motion: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct WireVec3 {
    pub x: f64,
    pub y: f64,
    #[serde(default)]
    pub z: f64,
}

/// Table: the pocket list (kernel pocket indexing — one-pocket partitions
/// by index) plus, since feature 14.1, the playing-surface dimensions
/// (the 7.8 rack-area/head-string zone tests derive the foot spot at
/// `length/4` and the head string at `-length/4` crate-side). Both are
/// lenient: they default to empty/0.0 so partial `{width, length}` casts
/// and dimension-less test records keep parsing (a 0.0 length simply
/// disables the zone tests — documented in `rulesets/fourteenone.rs`).
#[derive(Debug, Clone, Default, Deserialize)]
pub struct WireTable {
    #[serde(default)]
    pub width: f64,
    #[serde(default)]
    pub length: f64,
    #[serde(default)]
    pub pockets: Vec<WirePocket>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct WirePocket {
    pub center: WireVec3,
    pub radius: f64,
}

/// One simulation event: kind + post-event poses of the participants
/// (serde tuple `[id, state]` arrays). `t` is carried but NEVER used for
/// ordering (stream position is the causal order).
#[derive(Debug, Clone, Deserialize)]
pub struct WireEvent {
    #[serde(default)]
    pub t: f64,
    pub kind: WireEventKind,
    #[serde(default)]
    pub post: Vec<(i64, WireBallState)>,
}

/// Externally tagged event kind (events.rs `EventKind` mirror). The
/// variant set is strict — an unknown tag IS record drift — but variant
/// BODIES ignore unknown fields (`Transition.from/to` are not judged).
#[derive(Debug, Clone, Deserialize)]
pub enum WireEventKind {
    Rest,
    Strike { ball: i64 },
    BallBall { b1: i64, b2: i64 },
    BallLinearCushion { ball: i64 },
    BallCircularCushion { ball: i64 },
    BallPocket { ball: i64, pocket: i64 },
    BallTable { ball: i64 },
    BallOffTable { ball: i64 },
    Transition { ball: i64 },
}

/// Parse a ShotRecord wire JSON leniently. Failures on the judged-upon
/// surface produce `bad-record` (crate-only message, not corpus-pinned).
pub fn parse_record(json: &str) -> Result<WireRecord, RulesError> {
    serde_json::from_str(json)
        .map_err(|e| RulesError::BadRecord(format!("shot record: {e}")))
}
