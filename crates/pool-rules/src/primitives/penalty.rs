// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! P14 — penalty computation:
//! - snooker (Sec3 R11): `clamp(4, max(value of ball on, value of every
//!   ball concerned), 7)`, ONE penalty per stroke (the highest applies);
//! - one-pocket (WPA 12.8): one ball per foul stroke — a fouler with
//!   tray balls spots the MOST RECENTLY scored (documented LIFO
//!   convention), an empty tray accrues an owed debt.

/// Snooker points: `min(7, max(4, ball_on_value, concerned...))`.
pub fn snooker_penalty(ball_on_value: i64, concerned_values: &[i64]) -> i64 {
    let mut p = ball_on_value.max(4);
    for v in concerned_values {
        p = p.max(*v);
    }
    p.min(7)
}

/// One-pocket one-ball foul payment: pops the LIFO tray (returning the
/// ball to respot NOW and decrementing the tally) or bumps `owed`.
pub fn pay_one_ball(tray: &mut Vec<i64>, tally: &mut i64, owed: &mut i64)
    -> Option<i64> {
    match tray.pop() {
        Some(paid) => {
            *tally -= 1;
            Some(paid)
        }
        None => {
            *owed += 1;
            None
        }
    }
}
