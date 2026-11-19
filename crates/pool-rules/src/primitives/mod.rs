// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! The primitives layer (feature 013 US3, the feature data-model §1, P1–P20): the
//! shared machinery factored out of the five shipped TS rulesets AFTER
//! five concrete consumers existed (P-VII: nothing speculative). P12
//! phase machines stay per-ruleset by design; P10 jump-over geometry is
//! a hook filled by the snooker port (T032) under the R11 exact-ops
//! float discipline.
//!
//! Ordering doctrine (frozen `nineball.ts:93–99` convention): every
//! before/after question resolves by EVENT-STREAM POSITION — emission
//! order — never by timestamp comparison.

pub mod contact;
pub mod counters;
pub mod decisions;
pub mod fouls;
pub mod penalty;
pub mod pockets;
pub mod respot_chain;
pub mod scan;
pub mod snooker_geom;
pub mod terminal;
pub mod turn;
