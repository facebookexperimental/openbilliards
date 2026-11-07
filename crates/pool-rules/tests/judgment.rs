// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! T008 byte gate: hand-built `Judgment`s / states / error payloads
//! serialized by the canonical serializer and byte-compared against
//! harvested corpus `expect` samples — one per SHAPE VARIANT:
//! null decision/terminal, terminal verdict, seat-choosered decision,
//! `"both"`-choosered decision, all four placement rights, seat-keyed
//! map states, and the `{"error":…}` payload. If serde declaration
//! order, renames, or the int/string chooser encoding ever drift from
//! the frozen TS `JSON.stringify` bytes, this fails before any port.

use serde::Serialize;
use serde_json::Value;

use pool_rules::{
    Chooser, CitedFoul, DecisionRequired, Judgment, PlacementRight,
    RulesError, SeatPair, Terminal, Turn,
};

fn corpus_expect(id: &str) -> String {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../scripts/fixtures/rules-corpus.json"
    );
    let text = std::fs::read_to_string(path).expect("corpus fixture exists");
    let corpus: Value = serde_json::from_str(&text).expect("valid JSON");
    let case = corpus["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["id"] == id)
        .unwrap_or_else(|| panic!("corpus case {id} exists"));
    case["expect"].as_str().unwrap().to_string()
}

// ---- test-local next-state shapes (the ports own the real ones) -------------

#[derive(Serialize)]
struct NineNext {
    shooter: i64,
    #[serde(rename = "onTable")]
    on_table: Vec<i64>,
    result: Option<Terminal>,
}

#[derive(Serialize)]
struct PendingDecision {
    kind: String,
    chooser: Chooser,
}

#[derive(Serialize)]
struct FoulContext {
    fouls: Vec<CitedFoul>,
    by: i64,
}

#[derive(Serialize)]
struct EightNext {
    phase: String,
    shooter: i64,
    breaker: i64,
    groups: Option<SeatPair<String>>,
    #[serde(rename = "onTable")]
    on_table: Vec<i64>,
    #[serde(rename = "pendingDecision")]
    pending_decision: Option<PendingDecision>,
    result: Option<Terminal>,
    #[serde(rename = "foulContext")]
    foul_context: Option<FoulContext>,
}

#[derive(Serialize)]
struct OnePocketState {
    phase: String,
    shooter: i64,
    breaker: i64,
    pockets: Option<SeatPair<i64>>,
    tallies: SeatPair<i64>,
    owed: SeatPair<i64>,
    #[serde(rename = "consecutiveFouls")]
    consecutive_fouls: SeatPair<i64>,
    scored: SeatPair<Vec<i64>>,
    #[serde(rename = "pendingSpots")]
    pending_spots: Vec<i64>,
    #[serde(rename = "onTable")]
    on_table: Vec<i64>,
    #[serde(rename = "pendingDecision")]
    pending_decision: Option<PendingDecision>,
    #[serde(rename = "foulContext")]
    foul_context: Option<FoulContext>,
    result: Option<Terminal>,
}

#[derive(Serialize)]
struct SnookerNext {
    phase: String,
    shooter: i64,
    scores: SeatPair<i64>,
    #[serde(rename = "currentBreak")]
    current_break: i64,
    #[serde(rename = "ballOn")]
    ball_on: i64,
    #[serde(rename = "onTable")]
    on_table: Vec<i64>,
    #[serde(rename = "respotQueue")]
    respot_queue: Vec<i64>,
    #[serde(rename = "pendingDecision")]
    pending_decision: Option<PendingDecision>,
    #[serde(rename = "foulContext")]
    foul_context: Option<FoulContext>,
    result: Option<Terminal>,
}

// ---- the byte tests ----------------------------------------------------------

/// Plain legal judgment: nulls serialize as JSON null, empty arrays as
/// `[]`, field order = the frozen contract order.
#[test]
fn legal_pot_bytes() {
    let j = Judgment {
        legal: true,
        fouls: vec![],
        pocketed: vec![1],
        ball_in_hand: PlacementRight::None,
        respot: vec![],
        turn: Turn::Continue,
        decision_required: None,
        terminal: None,
        next: NineNext {
            shooter: 1,
            on_table: vec![2, 3, 4, 5, 6, 7, 8, 9],
            result: None,
        },
    };
    assert_eq!(j.to_json().unwrap(),
        corpus_expect("nineball/judge-014-legal-pot"));
}

/// Terminal verdict rides both the judgment and the next state.
#[test]
fn terminal_bytes() {
    let win = || Terminal {
        winner: 1,
        reason: "nine-ball-pocketed".into(),
        cite: "WPA Sec. 5".into(),
    };
    let j = Judgment {
        legal: true,
        fouls: vec![],
        pocketed: vec![9],
        ball_in_hand: PlacementRight::None,
        respot: vec![],
        turn: Turn::Continue,
        decision_required: None,
        terminal: Some(win()),
        next: NineNext {
            shooter: 1,
            on_table: vec![1, 2, 3, 4, 5, 6, 7, 8],
            result: Some(win()),
        },
    };
    assert_eq!(j.to_json().unwrap(),
        corpus_expect("nineball/judge-016-nine-ball-pocketed"));
}

/// Seat-choosered decision (chooser serializes as the JSON int 2) +
/// foul-context envelope + camelCase renames.
#[test]
fn seat_chooser_decision_bytes() {
    let bad_break = || CitedFoul::new("bad-break", "WPA 4.3(d)");
    let j = Judgment {
        legal: false,
        fouls: vec![bad_break()],
        pocketed: vec![],
        ball_in_hand: PlacementRight::None,
        respot: vec![],
        turn: Turn::Pass,
        decision_required: Some(DecisionRequired {
            kind: "dry_break".into(),
            chooser: Chooser::Seat(2),
        }),
        terminal: None,
        next: EightNext {
            phase: "open".into(),
            shooter: 1,
            breaker: 1,
            groups: None,
            on_table: (1..=15).collect(),
            pending_decision: Some(PendingDecision {
                kind: "dry_break".into(),
                chooser: Chooser::Seat(2),
            }),
            result: None,
            foul_context: Some(FoulContext { fouls: vec![bad_break()], by: 1 }),
        },
    };
    assert_eq!(j.to_json().unwrap(),
        corpus_expect("eightball/judge-003-bad-break"));
}

/// `"both"`-choosered decision (mixed int/string chooser wire), the
/// `d_zone` placement right, and seat-keyed score maps.
#[test]
fn both_chooser_d_zone_bytes() {
    let j = Judgment {
        legal: true,
        fouls: vec![],
        pocketed: vec![21],
        ball_in_hand: PlacementRight::DZone,
        respot: vec![21],
        turn: Turn::Continue,
        decision_required: Some(DecisionRequired {
            kind: "respotted_black_toss".into(),
            chooser: Chooser::Both,
        }),
        terminal: None,
        next: SnookerNext {
            phase: "respotted_black".into(),
            shooter: 1,
            scores: SeatPair::new(37, 37),
            current_break: 7,
            ball_on: 21,
            on_table: vec![21],
            respot_queue: vec![21],
            pending_decision: Some(PendingDecision {
                kind: "respotted_black_toss".into(),
                chooser: Chooser::Both,
            }),
            foul_context: None,
            result: None,
        },
    };
    assert_eq!(j.to_json().unwrap(),
        corpus_expect("snooker/judge-027-legal-pot"));
}

/// Canonical STATE bytes (initialState/applyDecision surface): seat-keyed
/// maps as `{"1":…,"2":…}` declared ascending, JS-style.
#[test]
fn seat_keyed_state_bytes() {
    let s = OnePocketState {
        phase: "pocket_choice".into(),
        shooter: 1,
        breaker: 1,
        pockets: None,
        tallies: SeatPair::new(0, 0),
        owed: SeatPair::new(0, 0),
        consecutive_fouls: SeatPair::new(0, 0),
        scored: SeatPair::new(vec![], vec![]),
        pending_spots: vec![],
        on_table: (1..=15).collect(),
        pending_decision: Some(PendingDecision {
            kind: "break_pocket".into(),
            chooser: Chooser::Seat(1),
        }),
        foul_context: None,
        result: None,
    };
    assert_eq!(serde_json::to_string(&s).unwrap(),
        corpus_expect("onepocket/initialState-001-b1"));
}

/// The `kitchen` placement right + a populated seat-keyed next state.
#[test]
fn kitchen_scratch_bytes() {
    let scratch = || CitedFoul::new("scratch", "WPA 12.8 via 3.1");
    let j = Judgment {
        legal: false,
        fouls: vec![scratch()],
        pocketed: vec![3, 4],
        ball_in_hand: PlacementRight::Kitchen,
        respot: vec![3, 4, 11],
        turn: Turn::Pass,
        decision_required: None,
        terminal: None,
        next: OnePocketState {
            phase: "play".into(),
            shooter: 2,
            breaker: 1,
            pockets: Some(SeatPair::new(5, 2)),
            tallies: SeatPair::new(1, 0),
            owed: SeatPair::new(0, 0),
            consecutive_fouls: SeatPair::new(1, 0),
            scored: SeatPair::new(vec![10], vec![]),
            pending_spots: vec![],
            on_table: vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15],
            pending_decision: None,
            foul_context: Some(FoulContext { fouls: vec![scratch()], by: 1 }),
            result: None,
        },
    };
    assert_eq!(j.to_json().unwrap(),
        corpus_expect("onepocket/judge-010-scratch"));
}

/// The structured `{"error":{"code","message"}}` payload, byte-frozen.
#[test]
fn error_payload_bytes() {
    assert_eq!(RulesError::unknown_ruleset("stub-v0").to_json(),
        corpus_expect("stub-v0/judge-error-001-unknown-ruleset"));
    // every code serializes under the same shape
    let e = RulesError::BadDecision(
        "nineball-v1: no rulebook decision is ever pending".into());
    assert_eq!(e.to_json(),
        "{\"error\":{\"code\":\"bad-decision\",\"message\":\
         \"nineball-v1: no rulebook decision is ever pending\"}}");
    assert_eq!(e.code(), "bad-decision");
    assert_eq!(e.to_string(),
        "nineball-v1: no rulebook decision is ever pending");
}
