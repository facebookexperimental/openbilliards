// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! T011 gate: P11 foul assembly (+the `legal == fouls.is_empty()`
//! invariant), P20 foul-context envelopes, P17 terminal plumbing +
//! guards, P18 turn/seat resolution.

use pool_rules::judgment::Turn;
use pool_rules::primitives::fouls::{
    foul_context, FoulContext, FoulContextPenalty, Fouls,
};
use pool_rules::primitives::terminal::{
    guard_no_pending, guard_not_over, terminal,
};
use pool_rules::primitives::turn::{other, resolve_seat};

/// P11: assembly order preserved; the invariant holds.
#[test]
fn foul_assembly_invariant() {
    let mut f = Fouls::new();
    assert!(f.legal());
    f.push("wrong-first-ball", "WPA 3.2 via 4.4/4.9");
    f.push("scratch", "WPA 3.1 via 4.9");
    assert!(!f.legal());
    let v = f.into_vec();
    assert_eq!(v[0].code, "wrong-first-ball");
    assert_eq!(v[1].code, "scratch");
    assert_eq!(v[0].cite, "WPA 3.2 via 4.4/4.9");
}

/// P20: the envelope exists exactly when fouls exist; serde key order is
/// the state order `{fouls, by}` / `{fouls, by, penalty}`.
#[test]
fn foul_context_envelope() {
    assert!(foul_context(&[], 1).is_none());
    let mut f = Fouls::new();
    f.push("scratch", "WPBSA Sec3 R8, R10");
    let ctx = foul_context(f.as_slice(), 2).unwrap();
    assert_eq!(serde_json::to_string(&ctx).unwrap(),
        r#"{"fouls":[{"code":"scratch","cite":"WPBSA Sec3 R8, R10"}],"by":2}"#);
    let with_penalty = FoulContextPenalty {
        fouls: ctx.fouls.clone(),
        by: ctx.by,
        penalty: 4,
    };
    assert_eq!(serde_json::to_string(&with_penalty).unwrap(),
        r#"{"fouls":[{"code":"scratch","cite":"WPBSA Sec3 R8, R10"}],"by":2,"penalty":4}"#);
    let round: FoulContext =
        serde_json::from_str(&serde_json::to_string(&ctx).unwrap()).unwrap();
    assert_eq!(round, ctx);
}

/// P17: builder + the two adapter-contract guards with frozen codes.
#[test]
fn terminal_plumbing_and_guards() {
    let t = terminal(2, "early-eight", "WPA 4.8(b)");
    assert_eq!(t.winner, 2);
    assert_eq!(serde_json::to_string(&t).unwrap(),
        r#"{"winner":2,"reason":"early-eight","cite":"WPA 4.8(b)"}"#);

    assert!(guard_not_over(false, "x").is_ok());
    let over = guard_not_over(true,
        "eightball-v1: judge called after the match ended (adapter contract)")
        .unwrap_err();
    assert_eq!(over.code(), "match-over");
    assert_eq!(over.to_string(),
        "eightball-v1: judge called after the match ended (adapter contract)");

    assert!(guard_no_pending(false, String::new()).is_ok());
    let pending = guard_no_pending(true,
        "snooker-v1: judge called while a rulebook decision is pending \
         ('play_again') — resolve it via applyDecision".to_string())
        .unwrap_err();
    assert_eq!(pending.code(), "decision-pending");
}

/// P18: `other(seat)` + the shared seat-consequence rule (terminal or
/// pending HOLDS the seat; continue keeps; pass flips).
#[test]
fn turn_resolution() {
    assert_eq!(other(1), 2);
    assert_eq!(other(2), 1);
    assert_eq!(resolve_seat(1, false, false, Turn::Continue), 1);
    assert_eq!(resolve_seat(1, false, false, Turn::Pass), 2);
    assert_eq!(resolve_seat(2, false, false, Turn::Pass), 1);
    assert_eq!(resolve_seat(1, true, false, Turn::Pass), 1);
    assert_eq!(resolve_seat(1, false, true, Turn::Pass), 1);
}
