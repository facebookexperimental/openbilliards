// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `snooker-v1` (T032) — field-for-field, behavior-frozen port of the
//! shipped TS implementation (`sdk/ts/src/rules/snooker.ts`, feature 012
//! T036): WPBSA Official Rules of Snooker (Revised September 2024 — the
//! feature-011/012 edition pin), Section 3, per the normative transition
//! table in the disciplines data-model §3.1 (S1–S13).
//! Every output byte is pinned by the harvested corpus
//! (`scripts/fixtures/rules-corpus.json`, snooker-v1 subset); every
//! `RulesError` message is the TS text verbatim.
//!
//! v1 semantics (the TS doc block, ported as-is):
//! - Ball values (Sec3 R1(a)): red 1, yellow 2 … black 7 — colour ids
//!   16–21, value = id − 14. Penalty = clamp(4, max(value of ball on,
//!   value of every ball concerned), 7) — Sec3 R11, ONE penalty per
//!   stroke (the highest applies).
//! - Respots (Sec3 R7, data-model S3/S6/S7/S13): colours that leave the
//!   table respot — on the colour-after-a-red stroke (incl. after the
//!   last red, R3(h)(ii)) and on FOULS in any phase; the legal ascending
//!   `final_colours` pot stays down (R3(h)(iii)); reds NEVER respot.
//!   `respot` carries colour ids HIGHEST VALUE FIRST (P13); XY spots
//!   derive adapter-side (respot.ts, research R7).
//! - Nomination (R3(h), adapter contract): every colour-on stroke MUST
//!   carry `{kind:'nominate', ball}` — the striker's choice in
//!   `colour_after_red`, pinned to the ball on in `final_colours` /
//!   `respotted_black`; missing/mismatched = frozen `RulesError`.
//! - Mechanically adjudicated fouls: wrong-first-ball / no-contact
//!   (Sec2 R11 ball-on def + Sec3 R10), scratch (R5/R10 — D-zone in
//!   hand, Sec2 R9), ball-off-table (R7/R10), not-nominated (a ball not
//!   on potted — R3(h)/R10), jump-over (Sec2 R20 + Sec3 R10, strictest
//!   mechanical reading: a chord of any pre-first-contact airborne cue
//!   flight passing over a stationary object ball — the P10 scan hook,
//!   the crate's ONLY float-consuming judge, R11 exact-ops discipline).
//!   Out of engine scope with cites (TS header + the issue-#92 doc
//!   completions; WPBSA Revised September 2024; the first three are
//!   COMPLETED by `snooker_v2.rs` — GH-382, config-gated, this module
//!   byte-frozen): foul and a miss
//!   (Sec3 R14), free ball (Sec2 R13), touching ball (Sec3 R8),
//!   push stroke (Sec2 R19 def; Sec3 R10), concession and the
//!   claim/refusal frame-end arms (Sec3 R4 — player declarations, not
//!   judged events; the engine ends frames only on the mechanical
//!   R4(a),(b) pot/foul-on-black paths), stalemate frame re-start (Sec3
//!   "Stalemate" — the referee's offer to re-start the frame; a
//!   hot-seat surface with no events to judge).
//! - Frame end (R4(a),(b)): with the black as ball on, a pot or foul
//!   ends the frame on points — unless tied, which re-spots the black
//!   (S10: cue in hand in the D, `respotted_black_toss` decision 8);
//!   in `respotted_black` the first score or foul ends the frame (S11).
//!   Every non-terminal foul offers the R13 play-again option
//!   (decision 7).
//!
//! Primitives composed (the feature data-model §2 usage row): P1 scan (cue
//! pinned at id 0, P10 jump-over geometry ON), P3 on-set first-contact
//! legality, P5 on-set vs `not-nominated` classification, P9 scratch,
//! P11 cited fouls, P13 highest-value-first respot chain, P14 penalty
//! clamp, P16 decision liturgy (ids 7/8), P17 terminal, P18 turn/seat,
//! P20 foul context (+penalty envelope).
//!
//! Serialization quirk ported as-is: the TS judge builds `foulContext`
//! as `{fouls, by, penalty}`, but applyDecision and hudState CLONE it
//! key-order `{by, penalty, fouls}` (object-literal insertion order) —
//! the corpus pins both shapes, so this module carries two serializers.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::RulesError;
use crate::judgment::{
    Chooser, CitedFoul, DecisionRequired, Judgment, PlacementRight, SeatPair,
    Terminal, Turn,
};
use crate::primitives::{
    contact, decisions, fouls as fouls_mod, fouls::Fouls, penalty, pockets,
    respot_chain, scan, terminal as term, turn,
};
use crate::rulesets::registry::{CatalogEntry, DecisionRow, RulesetEntry};
use crate::wire;

// ---- pinned citation strings (the research notes R1/R11; TS `CITE` verbatim) -------
// Issue #62 erratum (audit-snooker C1–C3, pinned Sept-2024 book): the
// ball-on DEFINITION is Sec2 R11 (R13 is Free Ball); playing from
// in-hand/the D is Sec3 R5 (R8 is Touching Ball); the first-pot-or-foul
// frame end is Sec3 R4(a) and the re-spotted-black procedure R4(b)
// (R4(c) is the aggregate-score variant).

const CITE_WRONG_FIRST: &str = "WPBSA Sec2 R11; Sec3 R10";
const CITE_NO_CONTACT: &str = "WPBSA Sec2 R11; Sec3 R10";
const CITE_SCRATCH: &str = "WPBSA Sec3 R5, R10";
const CITE_OFF_TABLE: &str = "WPBSA Sec3 R7, R10";
const CITE_NOT_NOMINATED: &str = "WPBSA Sec3 R3(h), R10";
const CITE_JUMP_OVER: &str = "WPBSA Sec2 R20; Sec3 R10";
const CITE_FRAME_END: &str = "WPBSA Sec3 R4(a)";
const CITE_RESPOTTED_BLACK: &str = "WPBSA Sec3 R4(b)";

/// The full 21-ball frame (TS `FULL_FRAME`): reds 1–15 + colours 16–21.
fn full_frame() -> Vec<i64> {
    (1..=21).collect()
}

/// Reds are ids 1–15 (TS `isRed`).
fn is_red(id: i64) -> bool {
    (1..=15).contains(&id)
}

/// Colours are ids 16–21 (TS `isColour`).
fn is_colour(id: i64) -> bool {
    (16..=21).contains(&id)
}

/// Point value (Sec3 R1(a)): red 1; colour = id − 14 (TS `valueOf`).
fn value_of(id: i64) -> i64 {
    if is_colour(id) { id - 14 } else { 1 }
}

/// The ball on: `'red'` (reds phase), `'nominated_colour'` (colour after
/// a red), or the colour id itself — the mixed string/int wire the TS
/// implementation shipped (`SnookerMatchState['ballOn']`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BallOn {
    Red,
    NominatedColour,
    Colour(i64),
}

impl Serialize for BallOn {
    fn serialize<S: serde::Serializer>(&self, s: S)
        -> Result<S::Ok, S::Error> {
        match self {
            BallOn::Red => s.serialize_str("red"),
            BallOn::NominatedColour => s.serialize_str("nominated_colour"),
            BallOn::Colour(id) => s.serialize_i64(*id),
        }
    }
}

impl<'de> Deserialize<'de> for BallOn {
    fn deserialize<D: serde::Deserializer<'de>>(d: D)
        -> Result<BallOn, D::Error> {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Wire {
            Num(i64),
            Text(String),
        }
        match Wire::deserialize(d)? {
            Wire::Num(n) => Ok(BallOn::Colour(n)),
            Wire::Text(t) if t == "red" => Ok(BallOn::Red),
            Wire::Text(t) if t == "nominated_colour" => {
                Ok(BallOn::NominatedColour)
            }
            Wire::Text(t) => Err(serde::de::Error::custom(format!(
                "ballOn must be \"red\" | \"nominated_colour\" | a colour \
                 id, got {t:?}"))),
        }
    }
}

/// Complete snooker match state (TS `SnookerMatchState`, frozen 012
/// shape). Serde declaration order = the TS judge/initialState literal
/// key order the corpus pins: `phase, shooter, scores, currentBreak,
/// ballOn, onTable, respotQueue, pendingDecision, foulContext, result`.
/// The pending option reuses the judgment's `{kind, chooser}` envelope
/// (`play_again` seats the opponent; `respotted_black_toss` carries the
/// `"both"` chooser).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnookerMatchState {
    pub phase: String,
    pub shooter: u8,
    pub scores: SeatPair<i64>,
    #[serde(rename = "currentBreak")]
    pub current_break: i64,
    #[serde(rename = "ballOn")]
    pub ball_on: BallOn,
    #[serde(rename = "onTable")]
    pub on_table: Vec<i64>,
    /// Colours respotted by the LAST judgment (highest value first).
    #[serde(rename = "respotQueue")]
    pub respot_queue: Vec<i64>,
    #[serde(rename = "pendingDecision")]
    pub pending_decision: Option<DecisionRequired>,
    #[serde(rename = "foulContext")]
    pub foul_context: Option<fouls_mod::FoulContextPenalty>,
    pub result: Option<Terminal>,
}

/// The `{by, penalty, fouls}` foul-context clone the TS applyDecision
/// and hudState literals produce (key order differs from the judge's
/// `{fouls, by, penalty}` — see module doc).
#[derive(Serialize)]
struct ByPenaltyFouls {
    by: i64,
    penalty: i64,
    fouls: Vec<CitedFoul>,
}

impl ByPenaltyFouls {
    fn from(fc: &fouls_mod::FoulContextPenalty) -> ByPenaltyFouls {
        ByPenaltyFouls {
            by: fc.by,
            penalty: fc.penalty,
            fouls: fc.fouls.clone(),
        }
    }
}

/// applyDecision output mirror: the state fields in the state's key
/// order, with the `{by, penalty, fouls}` foul-context clone (the TS
/// `{...state, foulContext: {by, penalty, fouls}}` spread).
#[derive(Serialize)]
struct SnookerDecisionState {
    phase: String,
    shooter: u8,
    scores: SeatPair<i64>,
    #[serde(rename = "currentBreak")]
    current_break: i64,
    #[serde(rename = "ballOn")]
    ball_on: BallOn,
    #[serde(rename = "onTable")]
    on_table: Vec<i64>,
    #[serde(rename = "respotQueue")]
    respot_queue: Vec<i64>,
    #[serde(rename = "pendingDecision")]
    pending_decision: Option<DecisionRequired>,
    #[serde(rename = "foulContext")]
    foul_context: Option<ByPenaltyFouls>,
    result: Option<Terminal>,
}

/// HUD projection (TS `hudState` literal order): the state fields plus
/// the top-level `penalty` echo and the derived `redsRemaining` count,
/// with the `{by, penalty, fouls}` foul-context clone.
#[derive(Serialize)]
struct SnookerHud {
    phase: String,
    shooter: u8,
    scores: SeatPair<i64>,
    #[serde(rename = "currentBreak")]
    current_break: i64,
    #[serde(rename = "ballOn")]
    ball_on: BallOn,
    penalty: Option<i64>,
    #[serde(rename = "respotQueue")]
    respot_queue: Vec<i64>,
    #[serde(rename = "onTable")]
    on_table: Vec<i64>,
    #[serde(rename = "redsRemaining")]
    reds_remaining: i64,
    #[serde(rename = "pendingDecision")]
    pending_decision: Option<DecisionRequired>,
    #[serde(rename = "foulContext")]
    foul_context: Option<ByPenaltyFouls>,
    result: Option<Terminal>,
}

/// The registry entry (`src/rulesets/registry.rs` REGISTRY row).
pub static ENTRY: RulesetEntry = RulesetEntry {
    id: "snooker-v1",
    initial_state,
    judge,
    apply_decision,
    hud_state,
    catalog,
};

fn parse_state(json: &str) -> Result<SnookerMatchState, RulesError> {
    serde_json::from_str(json)
        .map_err(|e| RulesError::BadState(format!("snooker-v1 state: {e}")))
}

fn state_json(state: &SnookerMatchState) -> Result<String, RulesError> {
    serde_json::to_string(state).map_err(|e| {
        RulesError::BadState(format!("snooker-v1 state serialization: {e}"))
    })
}

/// TS `over` predicate, shared by judge/applyDecision guards.
fn is_over(state: &SnookerMatchState) -> bool {
    state.result.is_some() || state.phase == "over"
}

/// The pending kind for guard messages (only read when a pending option
/// exists — the guards fire on `Some`).
fn pending_kind(state: &SnookerMatchState) -> &str {
    state.pending_decision.as_ref().map_or("", |p| p.kind.as_str())
}

/// JS `String(x)` for the nomination-gate error interpolations (the TS
/// messages template `${String(v)}`). Only integer values are
/// corpus-pinned; the other arms are the closest JS renderings for
/// handcrafted payloads (arrays/objects keep their JSON text).
fn js_string(v: Option<&Value>) -> String {
    match v {
        None => "undefined".to_string(),
        Some(Value::Null) => "null".to_string(),
        Some(Value::String(s)) => s.clone(),
        Some(other) => other.to_string(),
    }
}

/// The on-colour of a final-phase state (TS `lowestColourOn`): lowest
/// remaining colour. An exhausted colour set is a state corruption — the
/// frozen `bad-state` text (corpus `snooker/judge-error-018-bad-state`).
fn lowest_colour_on(on_table: &[i64]) -> Result<i64, RulesError> {
    on_table.iter().copied().filter(|id| is_colour(*id)).min().ok_or_else(
        || RulesError::BadState(
            "snooker-v1: final_colours state has no colour left".to_string(),
        ),
    )
}

/// TS `validateCall` (adapter contract, R3(h)): reds carry NO call; a
/// colour shot MUST nominate an on-table colour, pinned to the ball on
/// in `final_colours`/`respotted_black`. Returns the nominated colour
/// (`None` in reds). Messages verbatim (corpus-pinned).
fn validate_call(state: &SnookerMatchState, call: &Value)
    -> Result<Option<i64>, RulesError> {
    let phase = state.phase.as_str();
    if phase == "reds" {
        if !call.is_null() {
            return Err(RulesError::BadCall(
                "snooker-v1: a red shot carries no nomination (WPBSA Sec3 \
                 R3(g))"
                    .to_string(),
            ));
        }
        return Ok(None);
    }
    if call.is_null()
        || call.get("kind").and_then(Value::as_str) != Some("nominate")
    {
        return Err(RulesError::BadCall(
            "snooker-v1: a colour shot MUST carry { kind: \"nominate\", \
             ball } (WPBSA Sec3 R3(h) — adapter contract)"
                .to_string(),
        ));
    }
    let ball_v = call.get("ball");
    let ball = match ball_v.and_then(Value::as_i64) {
        Some(b) if is_colour(b) => b,
        _ => {
            return Err(RulesError::BadCall(format!(
                "snooker-v1: nominated ball {} is not a colour (16-21)",
                js_string(ball_v)
            )));
        }
    };
    if !state.on_table.contains(&ball) {
        return Err(RulesError::BadCall(format!(
            "snooker-v1: nominated colour {ball} is not on the table"
        )));
    }
    if phase == "final_colours" || phase == "respotted_black" {
        let on = if phase == "respotted_black" {
            21
        } else {
            lowest_colour_on(&state.on_table)?
        };
        if ball != on {
            return Err(RulesError::BadCall(format!(
                "snooker-v1: the ball on is {on} — nominating {ball} in \
                 {phase} is an adapter error (WPBSA Sec3 R3(h)/R4)"
            )));
        }
        return Ok(Some(on));
    }
    Ok(Some(ball)) // colour_after_red: the striker's choice
}

/// TS `snookerRuleset.judge`, one pass (FR-008). Guard order is the TS
/// body order: frame over → pending decision → the nomination gate →
/// scan. Messages verbatim (corpus-pinned).
fn judge(state_json_in: &str, record_json: &str, call_json: &str)
    -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;

    term::guard_not_over(
        is_over(&state),
        "snooker-v1: judge called after the frame ended (adapter contract)",
    )?;
    term::guard_no_pending(
        state.pending_decision.is_some(),
        format!(
            "snooker-v1: judge called while a rulebook decision is pending \
             ('{}') — resolve it via applyDecision",
            pending_kind(&state)
        ),
    )?;
    let call: Value = serde_json::from_str(call_json)
        .map_err(|e| RulesError::BadCall(format!("snooker-v1 call: {e}")))?;
    let nominated = validate_call(&state, &call)?;
    let record = wire::parse_record(record_json)?;
    // P1 single pass, cue pinned at id 0, the P10 jump-over chord test
    // ON (the crate's only float judge — R11 exact ops).
    let facts = scan::scan(&record, &scan::ScanConfig {
        striker_from_strike: false,
        dedup_off_table: false,
        off_table_includes_striker: false,
        jump_over_geometry: true,
        head_string_y: None, // WPBSA in-hand law is the D, not a kitchen
    });
    let shooter = state.shooter;
    let opp = turn::other(shooter);
    let phase = state.phase.as_str();

    // the on-set for this stroke (what may be struck first AND potted)
    let on_set: Vec<i64> = if phase == "reds" {
        state.on_table.iter().copied().filter(|id| is_red(*id)).collect()
    } else {
        vec![nominated.expect("colour phases carry a nomination")]
    };
    let value_of_ball_on = if phase == "reds" {
        1
    } else {
        value_of(nominated.expect("colour phases carry a nomination"))
    };
    // black-on frame-end arming (R4(a)): black is the ball on in
    // final_colours when it is the last colour standing
    let black_on = phase == "respotted_black"
        || (phase == "final_colours"
            && lowest_colour_on(&state.on_table)? == 21);

    // ---- foul detection (TS order, each with its pinned cite + balls
    // concerned): P3 on-set legality first
    let mut fouls = Fouls::new();
    let mut concerned: Vec<i64> = Vec::new();
    for f in contact::check_first_contact(
        &facts,
        |id| on_set.contains(&id),
        || Some(CitedFoul::new("no-contact", CITE_NO_CONTACT)),
        |_| Some(CitedFoul::new("wrong-first-ball", CITE_WRONG_FIRST)),
    ) {
        fouls.push(&f.code, &f.cite);
    }
    if let Some(c) = facts.first_contact {
        if !on_set.contains(&c.ball) {
            concerned.push(c.ball); // the ball concerned (Sec3 R11)
        }
    }
    // P5 on-set classification: pocketed balls not on = not-nominated
    let wrong_pots = pockets::off_set(&facts.pocketed, &on_set);
    if !wrong_pots.is_empty() {
        fouls.push("not-nominated", CITE_NOT_NOMINATED);
        concerned.extend_from_slice(&wrong_pots);
    }
    if !facts.off_table.is_empty() {
        fouls.push("ball-off-table", CITE_OFF_TABLE);
        concerned.extend_from_slice(&facts.off_table);
    }
    if facts.cue_scratch {
        fouls.push("scratch", CITE_SCRATCH);
    }
    if !facts.jumped_over.is_empty() {
        fouls.push("jump-over", CITE_JUMP_OVER);
        // Jumped-over balls are NOT "balls concerned" (issue #37 audit
        // fix, RULES_VERSION 0.1.1): Sec3 R11(a)(x) prices a jump shot
        // at the value of the ball on (four-point floor) — no R11
        // (b)/(c)/(d) arm mentions the ball jumped over. The former
        // `concerned.extend(jumped_over)` inflated e.g. a red-on jump
        // over the Black from 4 to 7 points.
    }
    let foul = !fouls.is_empty();
    // P14 — one penalty per stroke: clamp(4, max(ball on, balls
    // concerned), 7) (Sec3 R11 — the blue-involved-foul-on-red = 5
    // example)
    let concerned_values: Vec<i64> =
        concerned.iter().map(|id| value_of(*id)).collect();
    // Sec3 R11(d)(iii) (issue #37 audit fix, RULES_VERSION 0.1.1):
    // "plays at Reds … in successive strokes" is a SEVEN-point foul —
    // mechanically, the colour-after-red stroke whose FIRST CONTACT is
    // a red (the generic wrong-first pricing would charge only
    // max(4, nominated colour value)). The nominated-free-ball arm
    // stays out of scope with free ball itself (Sec2 R13, doc'd OUT).
    let successive_reds = phase == "colour_after_red"
        && facts.first_contact.as_ref().is_some_and(|c| is_red(c.ball));
    let pen = if successive_reds {
        7
    } else if foul {
        penalty::snooker_penalty(value_of_ball_on, &concerned_values)
    } else {
        0
    };

    // ---- table bookkeeping: pots + off-table leave; respots return
    let pocketed_ids = facts.pocketed_ids();
    let mut gone: Vec<i64> = Vec::new();
    for id in pocketed_ids.iter().chain(facts.off_table.iter()) {
        if !gone.contains(id) {
            gone.push(*id);
        }
    }
    let mut on_table: Vec<i64> = state
        .on_table
        .iter()
        .copied()
        .filter(|id| !gone.contains(id))
        .collect();
    // P13 — colours respot (highest first): on fouls in any phase, and
    // on the legal colour-after-red pot (incl. after the last red,
    // R3(h)(ii)); the legal ascending final_colours pot stays down
    // (R3(h)(iii)); reds never respot. The respotted_black S10 entry adds
    // the black below.
    let colours_gone = respot_chain::sort_highest_first(
        gone.iter().copied().filter(|id| is_colour(*id)).collect());
    let mut respot: Vec<i64> = Vec::new();
    if !colours_gone.is_empty() && (foul || phase == "colour_after_red") {
        respot = colours_gone;
    }

    // ---- scoring
    let mut scores = state.scores;
    let mut points = 0i64;
    if foul {
        *scores.get_mut(opp) += pen;
    } else {
        points = pocketed_ids.iter().map(|id| value_of(*id)).sum();
        *scores.get_mut(shooter) += points;
    }
    let potted = !foul && !pocketed_ids.is_empty();

    // ---- terminal / re-spotted black arms (R4(a),(b))
    let mut terminal: Option<Terminal> = None;
    let mut decision: Option<DecisionRequired> = None;
    let next_phase: String;
    let mut ball_in_hand = if foul && facts.cue_scratch {
        PlacementRight::DZone // Sec3 R5 / Sec2 R9 — S12
    } else {
        PlacementRight::None
    };

    if phase == "respotted_black" {
        // S11: the first score or foul ends the frame
        if foul {
            terminal = Some(term::terminal(
                i64::from(opp), "respotted-black-foul", CITE_RESPOTTED_BLACK));
        } else if potted {
            terminal = Some(term::terminal(
                i64::from(shooter), "respotted-black-potted",
                CITE_RESPOTTED_BLACK));
        }
        next_phase = if terminal.is_some() {
            "over".to_string()
        } else {
            "respotted_black".to_string()
        };
        if terminal.is_some() {
            ball_in_hand = PlacementRight::None;
        }
    } else if black_on && (foul || potted) {
        // S9/S10: the black (as ball on) went down or a foul occurred
        if scores.one != scores.two {
            terminal = Some(term::terminal(
                if scores.one > scores.two { 1 } else { 2 },
                if potted { "black-potted" } else { "foul-on-black" },
                CITE_FRAME_END,
            ));
            next_phase = "over".to_string();
            ball_in_hand = PlacementRight::None;
        } else {
            // S10: tie — black respotted, cue in hand in the D, toss to
            // play (Sec3 R4(b))
            next_phase = "respotted_black".to_string();
            if !respot.contains(&21) {
                let mut with_black = vec![21];
                with_black.extend(respot);
                respot = with_black;
            }
            ball_in_hand = PlacementRight::DZone;
            decision = Some(DecisionRequired {
                kind: "respotted_black_toss".to_string(),
                chooser: Chooser::Both,
            });
        }
    } else {
        // ordinary phase progression (S1–S5 + fouls)
        let reds_remain = on_table.iter().any(|id| is_red(*id));
        next_phase = if phase == "reds" {
            if potted {
                "colour_after_red"
            } else if reds_remain {
                "reds"
            } else {
                "final_colours"
            }
        } else if phase == "colour_after_red" {
            if reds_remain { "reds" } else { "final_colours" }
        } else {
            "final_colours"
        }
        .to_string();
        if foul {
            // S7/S8: every non-terminal foul offers the play-again
            // option (Sec3 R13)
            decision = Some(DecisionRequired {
                kind: "play_again".to_string(),
                chooser: Chooser::Seat(opp),
            });
        }
    }
    // respotted colours return to the table state (ascending ids)
    for id in &respot {
        if !on_table.contains(id) {
            on_table.push(*id);
        }
    }
    let on_table = respot_chain::sort_numeric(on_table);

    // ---- seat + next state assembly (P17/P18)
    let turn_pre = if terminal.is_some() || potted {
        Turn::Continue
    } else {
        Turn::Pass
    };
    let next_shooter = turn::resolve_seat(
        shooter, terminal.is_some(), decision.is_some(), turn_pre);
    let next_ball_on = match next_phase.as_str() {
        "reds" => BallOn::Red,
        "colour_after_red" => BallOn::NominatedColour,
        "respotted_black" => BallOn::Colour(21),
        "final_colours" => BallOn::Colour(lowest_colour_on(&on_table)?),
        _ => state.ball_on, // 'over': frozen for the record
    };
    let current_break =
        if terminal.is_none() && turn_pre == Turn::Continue && !foul {
            state.current_break + points
        } else {
            0
        };
    // P20 foul context with the snooker penalty — `by` is the judged
    // shooter; the judge literal's `{fouls, by, penalty}` key order.
    let foul_context = if foul {
        Some(fouls_mod::FoulContextPenalty {
            fouls: fouls.as_slice().to_vec(),
            by: i64::from(shooter),
            penalty: pen,
        })
    } else {
        None
    };

    let legal = fouls.legal(); // P11 invariant
    let judgment = Judgment {
        legal,
        fouls: fouls.into_vec(),
        pocketed: pocketed_ids,
        ball_in_hand,
        respot: respot.clone(),
        turn: if foul { Turn::Pass } else { turn_pre },
        decision_required: decision.clone(),
        terminal: terminal.clone(),
        next: SnookerMatchState {
            phase: next_phase,
            shooter: next_shooter,
            scores,
            current_break,
            ball_on: next_ball_on,
            on_table,
            respot_queue: respot,
            pending_decision: decision,
            foul_context,
            result: terminal,
        },
    };
    judgment.to_json()
}

fn initial_state(breaker: u8) -> Result<String, RulesError> {
    state_json(&SnookerMatchState {
        phase: "reds".to_string(),
        shooter: breaker,
        scores: SeatPair::new(0, 0),
        current_break: 0,
        ball_on: BallOn::Red,
        on_table: full_frame(),
        respot_queue: Vec::new(),
        pending_decision: None,
        foul_context: None,
        result: None,
    })
}

/// TS `applyDecision`: the P16 liturgy in the TS body order — post-frame
/// guard → id lookup (unknown id) → choice range → pending-kind match →
/// resolution. Messages verbatim (corpus-pinned). The output serializes
/// through [`SnookerDecisionState`] (the `{by, penalty, fouls}`
/// foul-context clone — TS spread-literal key order).
fn apply_decision(state_json_in: &str, decision_json: &str)
    -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    term::guard_not_over(
        is_over(&state),
        "snooker-v1: no decision can be applied after the frame ended",
    )?;
    let d = decisions::parse_decision(decision_json)?;
    // share-codec-v4 ids 7/8 (TS decision mapping)
    let kind = match d.decision {
        7 => "play_again",
        8 => "respotted_black_toss",
        other => {
            return Err(decisions::unknown_id(format!(
                "snooker-v1: unknown decision id {other}"
            )));
        }
    };
    decisions::check_choice(
        d.choice >= 1 && d.choice <= 2,
        format!("snooker-v1: choice {} out of range for '{kind}'", d.choice),
    )?;
    decisions::check_pending(
        state.pending_decision.as_ref().is_some_and(|p| p.kind == kind),
        format!(
            "snooker-v1: decision '{kind}' does not match the pending \
             option ('{}')",
            state.pending_decision.as_ref()
                .map_or("none", |p| p.kind.as_str())
        ),
    )?;

    let shooter = if kind == "play_again" {
        // Sec3 R13: the incoming player (the CHOOSER recorded on the
        // pending option) elects to play (choice 1), or requires the
        // offender to play again from the position left (choice 2). The
        // TS reads the chooser back rather than re-deriving it — ported
        // as-is; every play_again pending carries a seat (TS `1 | 2`
        // type-level promise), so `Both` is unreachable here.
        let chooser = match state.pending_decision.as_ref().map(|p| p.chooser)
        {
            Some(Chooser::Seat(n)) => n,
            _ => state.shooter,
        };
        if d.choice == 1 { chooser } else { turn::other(chooser) }
    } else {
        // respotted_black_toss (Sec3 R4(b)): the recorded toss names the
        // striker directly
        if d.choice == 1 { 1 } else { 2 }
    };
    let next = SnookerDecisionState {
        phase: state.phase,
        shooter,
        scores: state.scores,
        current_break: state.current_break,
        ball_on: state.ball_on,
        on_table: state.on_table,
        respot_queue: state.respot_queue,
        pending_decision: None,
        foul_context: state.foul_context.as_ref().map(ByPenaltyFouls::from),
        result: state.result,
    };
    serde_json::to_string(&next).map_err(|e| {
        RulesError::BadState(format!("snooker-v1 state serialization: {e}"))
    })
}

/// TS `hudState`: the state projection plus the top-level `penalty` echo
/// and the derived `redsRemaining`, with the `{by, penalty, fouls}`
/// foul-context clone.
fn hud_state(state_json_in: &str) -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    let reds_remaining =
        state.on_table.iter().filter(|id| is_red(**id)).count() as i64;
    let hud = SnookerHud {
        phase: state.phase,
        shooter: state.shooter,
        scores: state.scores,
        current_break: state.current_break,
        ball_on: state.ball_on,
        penalty: state.foul_context.as_ref().map(|fc| fc.penalty),
        respot_queue: state.respot_queue,
        on_table: state.on_table,
        reds_remaining,
        pending_decision: state.pending_decision,
        foul_context: state.foul_context.as_ref().map(ByPenaltyFouls::from),
        result: state.result,
    };
    serde_json::to_string(&hud).map_err(|e| {
        RulesError::BadState(format!("snooker-v1 hud serialization: {e}"))
    })
}

/// Catalog row: the foul codes/cites this module may emit in detection
/// order, decisions 7/8 (share-codec v4), the four terminal reasons in
/// TS branch order. The config object is EMPTY on purpose: snooker.ts
/// exports no pure-data config (values/penalties are rulebook
/// transcriptions inside the judge), so there is nothing for the T041
/// drift gate to mirror.
fn catalog() -> CatalogEntry {
    CatalogEntry {
        id: "snooker-v1",
        fouls: vec![
            CitedFoul::new("no-contact", CITE_NO_CONTACT),
            CitedFoul::new("wrong-first-ball", CITE_WRONG_FIRST),
            CitedFoul::new("not-nominated", CITE_NOT_NOMINATED),
            CitedFoul::new("ball-off-table", CITE_OFF_TABLE),
            CitedFoul::new("scratch", CITE_SCRATCH),
            CitedFoul::new("jump-over", CITE_JUMP_OVER),
        ],
        decisions: vec![
            DecisionRow { id: 7, kind: "play_again", choice_max: 2 },
            DecisionRow {
                id: 8,
                kind: "respotted_black_toss",
                choice_max: 2,
            },
        ],
        terminals: vec![
            "respotted-black-foul", "respotted-black-potted", "black-potted",
            "foul-on-black",
        ],
        config: serde_json::json!({}),
    }
}
