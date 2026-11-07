// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `nineball-v1` (T019) — field-for-field, behavior-frozen port of the
//! shipped TS implementation: the `judgeShot` referee core of
//! `sdk/ts/src/rules/nineball.ts` composed with the `nineballRuleset`
//! wrapper of `sdk/ts/src/rules/index.ts` (feature 011, verdict-frozen).
//! Every output byte is pinned by the harvested corpus
//! (`scripts/fixtures/rules-corpus.json`, nineball-v1 subset); every
//! `RulesError` message is the TS text verbatim.
//!
//! v1 ruleset (WPA 9-ball, simplified — the TS doc block, ported as-is):
//! legal shot = cue's FIRST ball-ball contact is the lowest-numbered ball
//! on the table AND afterwards (later in the EVENT STREAM — equal-t
//! events order by emission) any ball is pocketed or reaches a cushion;
//! fouls `no-contact` / `wrong-first-ball` / `no-rail-after-contact` /
//! `scratch` stack; any foul = ball in hand anywhere; 9 pocketed on a
//! legal shot wins (combos count); 9 down on a foul or driven off =
//! respot (ids only — spot geometry stays in the TS adapter, research
//! R7); push-out, off-table fouls, dry-break rail minimum, and
//! three-foul loss are NOT in v1; the break carries NO shot identity
//! (it is judged like any other stroke — the rack pattern, the
//! break-from-the-kitchen address, and the break-specific requirements
//! stay with the adapter), and kitchen/behind-head-string placement is
//! NOT modeled (the opening address is an adapter placement; every foul
//! grants ball in hand "anywhere", never "kitchen"). Known v1 quirks
//! port AS-IS (behavior freeze beats correctness, the conformance-gate contract
//! §2).
//!
//! Primitives composed (the feature data-model §2 usage row): P1/P2 scan +
//! first-contact fact, P3 lowest-first legality, P4 rail-after-contact
//! (split codes: `no-contact` folds the rail question away), P5
//! any-pocket classification, P8 off-table, P9 cue scratch, P11 cited
//! fouls, P12 lowest-first progression (no phase machine), P13 fixed
//! respot `[9]`, P17 terminal, P18 turn/seat.

use serde::{Deserialize, Serialize};

use crate::error::RulesError;
use crate::judgment::{CitedFoul, Judgment, PlacementRight, Terminal, Turn};
use crate::primitives::{contact, fouls::Fouls, scan, terminal as term, turn};
use crate::rulesets::registry::{CatalogEntry, RulesetEntry};
use crate::wire;

/// Wrapper match state for `nineball-v1` (index.ts `NineBallMatchState`,
/// frozen 011 shape). Serde declaration order = the TS `JSON.stringify`
/// key order the corpus pins: `shooter, onTable, result`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NineBallMatchState {
    pub shooter: u8,
    #[serde(rename = "onTable")]
    pub on_table: Vec<i64>,
    #[serde(default)]
    pub result: Option<Terminal>,
}

/// HUD projection (index.ts `hudState`, key order frozen by the corpus:
/// `shooter, onTable, lowest, result`).
#[derive(Serialize)]
struct NineBallHud {
    shooter: u8,
    #[serde(rename = "onTable")]
    on_table: Vec<i64>,
    lowest: Option<i64>,
    result: Option<Terminal>,
}

/// The registry entry (`src/rulesets/registry.rs` REGISTRY row).
pub static ENTRY: RulesetEntry = RulesetEntry {
    id: "nineball-v1",
    initial_state,
    judge,
    apply_decision,
    hud_state,
    catalog,
};

fn parse_state(json: &str) -> Result<NineBallMatchState, RulesError> {
    serde_json::from_str(json)
        .map_err(|e| RulesError::BadState(format!("nineball-v1 state: {e}")))
}

fn state_json(state: &NineBallMatchState) -> Result<String, RulesError> {
    serde_json::to_string(state).map_err(|e| {
        RulesError::BadState(format!("nineball-v1 state serialization: {e}"))
    })
}

/// TS `initialState(breaker)`: fresh rack, all nine object balls. The TS
/// wrapper performs NO runtime seat validation (`1 | 2` is a type-level
/// promise) — ported as-is.
fn initial_state(breaker: u8) -> Result<String, RulesError> {
    state_json(&NineBallMatchState {
        shooter: breaker,
        on_table: (1..=9).collect(),
        result: None,
    })
}

/// TS `nineballRuleset.judge` + the `judgeShot` core, one pass (FR-008).
fn judge(state_json_in: &str, record_json: &str, call_json: &str)
    -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;

    // wrapper guard order (index.ts): match over, then the call gate
    term::guard_not_over(
        state.result.is_some(),
        "nineball-v1: judge called after the match ended",
    )?;
    let call: serde_json::Value = serde_json::from_str(call_json)
        .map_err(|e| RulesError::BadCall(format!("nineball-v1 call: {e}")))?;
    if !call.is_null() {
        return Err(RulesError::BadCall(
            "nineball-v1: 9-ball has no call/safety inputs".to_string()));
    }

    let record = wire::parse_record(record_json)?;

    // ---- judgeShot core (nineball.ts, byte-frozen) -------------------------
    // `[...new Set(state.onTable.filter((id) => id > 0))]`: positive ids,
    // first-occurrence order (JS Set insertion order).
    let mut deduped: Vec<i64> = Vec::new();
    for id in state.on_table.iter().copied().filter(|id| *id > 0) {
        if !deduped.contains(&id) {
            deduped.push(id);
        }
    }
    if deduped.is_empty() {
        // TS throws a plain Error here; the crate carries the exact text
        // under the `bad-state` code (nineball.test.ts pattern-matches
        // `/onTable is empty/` through the swapped wrapper).
        return Err(RulesError::BadState(
            "judgeShot: state.onTable is empty — no object balls on the \
             table".to_string()));
    }
    let lowest = contact::lowest(&deduped).expect("deduped is non-empty");

    // P1 single pass; striker pinned at id 0 (the TS scan hardcodes the
    // cue) — stream position decides every before/after question.
    let facts = scan::scan(&record, &scan::ScanConfig::default());

    // P3 lowest-first legality + P4 rail-after-contact, TS citation
    // order: the no-contact case FOLDS the rail question away (only
    // `no-contact` is cited), the contacted case splits into
    // `wrong-first-ball` and `no-rail-after-contact`; P9 scratch last.
    // Cite basis (issue #62 erratum, audit-9ball §3): the contact
    // REQUIREMENT is WPA 3.3 first sentence ("the cue-ball must contact
    // an object-ball"), applicable via 5.7; 3.2 Wrong Ball First
    // presupposes a contact and governs only the wrong-first case.
    let mut fouls = Fouls::new();
    for f in contact::check_first_contact(
        &facts,
        |ball| ball == lowest,
        || Some(CitedFoul::new("no-contact", "WPA 3.3")),
        |_| Some(CitedFoul::new("wrong-first-ball", "WPA 3.2")),
    ) {
        fouls.push(&f.code, &f.cite);
    }
    if facts.first_contact.is_some() && !facts.driven_after_contact {
        fouls.push("no-rail-after-contact", "WPA 3.3");
    }
    if facts.cue_scratch {
        fouls.push("scratch", "WPA 3.1");
    }

    let legal = fouls.legal(); // P11 invariant
    let pocketed = facts.pocketed_ids(); // P5 any-pocket, cue excluded
    let nine_pocketed = pocketed.contains(&9);
    let game_over = legal && nine_pocketed;
    let respot_nine =
        !game_over && (nine_pocketed || facts.off_table.contains(&9));

    // ---- wrapper mapping (index.ts, byte-frozen) ----------------------------
    // next onTable filters the RAW prior list (the wrapper does not
    // dedupe), then respots the 9 at the END (JS `push`).
    let mut next_on_table: Vec<i64> = state
        .on_table
        .iter()
        .copied()
        .filter(|id| !pocketed.contains(id) && !facts.off_table.contains(id))
        .collect();
    if respot_nine && !next_on_table.contains(&9) {
        next_on_table.push(9);
    }

    let terminal = if game_over {
        // P17: the winning 9 on a legal shot
        Some(term::terminal(
            i64::from(state.shooter), "nine-ball-pocketed", "WPA Sec. 5"))
    } else {
        None
    };
    // dry-legal passes the seat; a legal pot (incl. the winning 9) keeps
    // it; fouls pass it (the adapter also gets ball-in-hand 'anywhere')
    let turn_v = if legal && !pocketed.is_empty() {
        Turn::Continue
    } else {
        Turn::Pass
    };
    // P18: terminal holds the seat (no decision is ever pending in v1)
    let next_shooter =
        turn::resolve_seat(state.shooter, terminal.is_some(), false, turn_v);

    let judgment = Judgment {
        legal,
        fouls: fouls.into_vec(),
        pocketed,
        ball_in_hand: if legal {
            PlacementRight::None
        } else {
            PlacementRight::Anywhere
        },
        respot: if respot_nine { vec![9] } else { Vec::new() }, // P13 fixed
        turn: turn_v,
        decision_required: None,
        terminal: terminal.clone(),
        next: NineBallMatchState {
            shooter: next_shooter,
            on_table: next_on_table,
            result: terminal,
        },
    };
    judgment.to_json()
}

/// TS `applyDecision`: unconditional — 9-ball v1 never surfaces a
/// rulebook decision (the TS body throws before reading its inputs;
/// ported as-is, nothing is parsed).
fn apply_decision(_state_json: &str, _decision_json: &str)
    -> Result<String, RulesError> {
    Err(RulesError::BadDecision(
        "nineball-v1: no rulebook decision is ever pending".to_string()))
}

/// TS `hudState`: `lowest` is min over the RAW `onTable` list (no dedupe,
/// no positive filter — ported as-is), `null` when the list is empty.
fn hud_state(state_json_in: &str) -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    let hud = NineBallHud {
        shooter: state.shooter,
        lowest: state.on_table.iter().copied().min(),
        on_table: state.on_table,
        result: state.result,
    };
    serde_json::to_string(&hud).map_err(|e| {
        RulesError::BadState(format!("nineball-v1 hud serialization: {e}"))
    })
}

/// Catalog row: foul codes/cites in TS declaration order, no decisions,
/// the single terminal reason, and the `FOUL_LABELS` pure-data mirror
/// (the T041 TS drift gate pins against this).
fn catalog() -> CatalogEntry {
    CatalogEntry {
        id: "nineball-v1",
        fouls: vec![
            CitedFoul::new("no-contact", "WPA 3.3"),
            CitedFoul::new("wrong-first-ball", "WPA 3.2"),
            CitedFoul::new("no-rail-after-contact", "WPA 3.3"),
            CitedFoul::new("scratch", "WPA 3.1"),
        ],
        decisions: Vec::new(),
        terminals: vec!["nine-ball-pocketed"],
        config: serde_json::json!({
            "foulLabels": {
                "no-contact": "cue ball hit nothing",
                "wrong-first-ball": "wrong ball first",
                "no-rail-after-contact": "no rail after contact",
                "scratch": "scratch",
            },
        }),
    }
}
