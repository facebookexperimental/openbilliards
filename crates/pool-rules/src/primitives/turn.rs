// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! P18 — turn/seat resolution: the 4×-duplicated TS `other(seat)`
//! collapsed to one implementation, plus the shared seat-consequence
//! rule every ruleset applies: a terminal or a pending decision HOLDS
//! the seat (terminal is moot; pending resolves via applyDecision);
//! otherwise `continue` keeps it and `pass` flips it.

use crate::judgment::Turn;
use crate::Seat;

/// The other seat (TS `seat === 1 ? 2 : 1`).
pub fn other(seat: Seat) -> Seat {
    if seat == 1 { 2 } else { 1 }
}

/// Next shooter under the shared convention (see module doc).
pub fn resolve_seat(shooter: Seat, terminal: bool, pending: bool, turn: Turn)
    -> Seat {
    if terminal || pending || turn == Turn::Continue {
        shooter
    } else {
        other(shooter)
    }
}
