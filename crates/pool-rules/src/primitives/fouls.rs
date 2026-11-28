// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! P11 — `CitedFoul` assembly with the frozen ruleset-api invariant
//! `legal == fouls.is_empty()`, and P20 — the foul-context envelope
//! `{fouls[], by}` (+ `penalty` for snooker) carried in next-state for
//! 8-ball/one-pocket/snooker/carom (not 9-ball).
//!
//! NOTE hud projections re-order the envelope keys (`{by, fouls}` /
//! `{by, penalty, fouls}` — shipped TS behavior); those hud shapes are
//! per-ruleset structs owned by the ports.

use serde::{Deserialize, Serialize};

use crate::judgment::CitedFoul;

/// Accumulating foul list (citation order = detection order, frozen per
/// ruleset).
#[derive(Debug, Clone, Default)]
pub struct Fouls(Vec<CitedFoul>);

impl Fouls {
    pub fn new() -> Fouls {
        Fouls(Vec::new())
    }

    pub fn push(&mut self, code: &str, cite: &str) {
        self.0.push(CitedFoul::new(code, cite));
    }

    /// The P11 invariant: `legal == fouls.is_empty()`.
    pub fn legal(&self) -> bool {
        self.0.is_empty()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn as_slice(&self) -> &[CitedFoul] {
        &self.0
    }

    pub fn into_vec(self) -> Vec<CitedFoul> {
        self.0
    }
}

/// P20 state envelope: `{fouls, by}` (8-ball/one-pocket/carom).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FoulContext {
    pub fouls: Vec<CitedFoul>,
    pub by: i64,
}

/// P20 state envelope with the snooker penalty: `{fouls, by, penalty}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FoulContextPenalty {
    pub fouls: Vec<CitedFoul>,
    pub by: i64,
    pub penalty: i64,
}

/// Build the optional envelope the way every shipped ruleset does:
/// `None` when the stroke was legal.
pub fn foul_context(fouls: &[CitedFoul], by: i64) -> Option<FoulContext> {
    if fouls.is_empty() {
        None
    } else {
        Some(FoulContext { fouls: fouls.to_vec(), by })
    }
}
