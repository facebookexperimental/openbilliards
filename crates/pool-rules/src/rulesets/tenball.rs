// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `tenball-v1` (feature 026, GH-343) — WPA 10-Ball, transcribed from the
//! repo's pinned WPA edition: WPA Rules of Play (effective 2025-09-15),
//! Section 6 (6.1–6.11), shared Section 3 fouls via 6.9/6.10, standard
//! call shot via 1.7, spotting via 1.5. The EIGHTH registered ruleset
//! (the seventh playable discipline) — appended to the registry
//! (the registry API contract §6 growth event) with the seven existing id
//! slots byte-untouched. Output bytes are frozen by the harvested
//! `tenball` conformance slice
//! (`scripts/fixtures/rules-corpus-variants/wpa-10ball.json`); the legacy
//! 442-case corpus is untouched. Full rule map + the two verified
//! issue-brief deltas: the ten-ball feature spec.
//!
//! v1 semantics (per-rule map):
//! - 6.2 rack: ten in a triangle, 1 at the apex on the foot spot, 10 at
//!   the triangle centre (kernel template `ten`); the "without purposeful
//!   pattern" order is the SDK rack template's seeded shuffle.
//! - 6.3 break: cue in hand above the head string (adapter placement —
//!   the nineball precedent: kitchen judging is not modeled); if no
//!   object ball is pocketed, at least FOUR object balls must reach one
//!   or more rails (`illegal-break`, 6.3(b); off-table balls count as
//!   driven per 2.7 — pockets cannot occur in the no-pot branch). Break
//!   fouls are STANDARD fouls: ball in hand anywhere (6.9).
//! - 6.4 push out: the shot immediately after a foul-free break (phase
//!   `pushout`) may be DECLARED a push out (calls-axis kind `push` —
//!   additive); 3.2 Wrong Ball First and 3.3 No Rail after Contact are
//!   suspended for the shot (including 3.3's contact requirement — a
//!   push out may touch nothing); 3.1/3.5 still apply. If no foul, the
//!   other player chooses who shoots next: decision id 12
//!   `pushout_response` (1 = the pusher shoots again, 2 = the chooser
//!   takes the table). Balls pocketed on a push out stay down and never
//!   count; the 10 spots (6.7 exception + 6.8).
//! - 6.5 call shots via 1.7: every non-break shot carries an explicit
//!   stance — a nominated ball+pocket (kind `call`; ONE ball, details
//!   irrelevant) or the declared no-call (any other non-null kind; the
//!   eightball-v2 lenient-kind convention). There is NO safety call at
//!   10-Ball (6.5 — the rules text abolishes it); the no-call stance is
//!   the "not attempting to pocket" play, and 1.7's "if they are not
//!   obvious" referee inference is not modeled (explicit stance per
//!   shot). The break carries NO call (6.5: "each shot except the
//!   break" — a non-null break input is a `bad-call`).
//! - 6.6 wrongfully pocketed balls: pocketed ≥ 1 object ball, called
//!   shot NOT made, no foul → the other player chooses who shoots next:
//!   decision id 13 `wrongful_pot` (1 = the shooter continues, 2 = the
//!   chooser takes the table). The balls stay pocketed (6.8: no other
//!   ball is ever spotted); the 10 spots.
//! - 6.7 continuing play: a legally made called shot keeps the table
//!   (extra balls stay down, 10 excepted); a legal break with a pot
//!   keeps the table without a call; a clean miss or a foul passes it.
//!   Win = the called 10 legally pocketed in the called pocket when the
//!   10 was the ONLY object ball at address — terminal
//!   `ten-ball-pocketed`. An early called-and-made 10 (combination) is
//!   a legal called shot: the 10 spots and the shooter continues.
//! - 6.8 spotting: the 10 is spotted (ids only — XY geometry stays in
//!   the TS adapter, research R7) whenever it is pocketed other than on
//!   the winning shot or driven off the table; no other ball ever spots.
//! - 6.9 standard fouls (events-detectable subset, BIH anywhere):
//!   no-contact / wrong-ball-first (lowest first) / no-rail-after-contact
//!   / ball-off-table / scratch.
//! - 6.10 serious fouls: 3.13 three consecutive fouls by the same player
//!   in the rack without an intervening legal shot = loss of the RACK
//!   (the third foul cites `three-consecutive-fouls`; the terminal seats
//!   the opponent). The 3.13 referee warning is a UI surface (HUD foul
//!   chip), not a judged event.
//! - NOT modeled in v1 (all recorded in the catalog `notModeled`): 6.11
//!   stalemate (hot-seat agreement, no judged events), 1.7 obviousness
//!   inference, the 3.13 warning, the non-events fouls of 6.9
//!   (3.4/3.6–3.10/3.12/3.14/3.15), break-address kitchen judging
//!   (3.10/3.11), Regulation 4 rack-template mechanics.
//!
//! Primitives composed (the feature data-model §2 usage row): P1 scan (default
//! config), P2/P3 lowest-first legality, P4 rail-after-contact, P5
//! call-fulfillment, P8 off-table, P9 cue scratch, P11 cited fouls, P12
//! phase machine (break/pushout/play/over), P13 fixed respot `[10]`,
//! P15 tracked three-foul counter (reset-on-legal), P16 decision liturgy
//! (ids 12/13), P17 terminal, P18 turn/seat, P19 HUD projection, P20
//! foul context.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::RulesError;
use crate::judgment::{
    Chooser, CitedFoul, DecisionRequired, Judgment, PlacementRight, SeatPair,
    Terminal, Turn,
};
use crate::primitives::{
    contact, counters, decisions, fouls as fouls_mod, fouls::Fouls, pockets,
    scan, terminal as term, turn,
};
use crate::rulesets::registry::{CatalogEntry, DecisionRow, RulesetEntry};
use crate::wire;

// ---- pinned citation strings (WPA Rules of Play eff. 2025-09-15, Sec 6) ----

const CITE_NO_CONTACT: &str = "WPA 6.9 via 3.3";
const CITE_WRONG_FIRST: &str = "WPA 6.9 via 3.2";
const CITE_NO_RAIL: &str = "WPA 6.9 via 3.3";
const CITE_ILLEGAL_BREAK: &str = "WPA 6.3(b)";
const CITE_OFF_TABLE: &str = "WPA 6.9 via 3.5";
const CITE_SCRATCH: &str = "WPA 6.9 via 3.1";
const CITE_THREE_FOULS: &str = "WPA 6.10 via 3.13";
const CITE_WIN: &str = "WPA 6.7";
const CITE_PUSHOUT: &str = "WPA 6.4";
const CITE_WRONGFUL: &str = "WPA 6.6";

/// The full 10-ball rack.
fn full_rack() -> Vec<i64> {
    (1..=10).collect()
}

/// A pending rulebook option (`pushout_response` | `wrongful_pot`).
/// Serde declaration order: `kind, chooser`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenBallPending {
    pub kind: String,
    pub chooser: Chooser,
}

/// Complete 10-ball match state. Serde declaration order IS the byte
/// contract the tenball conformance slice freezes: `phase, shooter,
/// breaker, onTable, consecutiveFouls, pendingDecision, foulContext,
/// result`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenBallMatchState {
    /// `"break" | "pushout" | "play" | "over"` — `pushout` means the 6.4
    /// window is OPEN for the shot being addressed; it closes to `play`
    /// on any judged outcome.
    pub phase: String,
    pub shooter: u8,
    pub breaker: u8,
    #[serde(rename = "onTable")]
    pub on_table: Vec<i64>,
    /// The 3.13 counter (per seat, reset on any legal shot).
    #[serde(rename = "consecutiveFouls")]
    pub consecutive_fouls: SeatPair<i64>,
    #[serde(rename = "pendingDecision")]
    pub pending_decision: Option<TenBallPending>,
    #[serde(rename = "foulContext")]
    pub foul_context: Option<fouls_mod::FoulContext>,
    pub result: Option<Terminal>,
}

/// HUD projection: the state fields plus `lowest` (the rotation target)
/// and the re-ordered `{by, fouls}` foul-context envelope (shipped-hud
/// convention). Discriminator fields for the app's hud router: `lowest`
/// AND `phase` together (9-ball projects `lowest` without `phase`; every
/// other shipped projection lacks `lowest`).
#[derive(Serialize)]
struct TenBallHud {
    phase: String,
    shooter: u8,
    breaker: u8,
    #[serde(rename = "onTable")]
    on_table: Vec<i64>,
    lowest: Option<i64>,
    #[serde(rename = "consecutiveFouls")]
    consecutive_fouls: SeatPair<i64>,
    #[serde(rename = "pendingDecision")]
    pending_decision: Option<TenBallPending>,
    result: Option<Terminal>,
    #[serde(rename = "foulContext")]
    foul_context: Option<TenBallHudFoulContext>,
}

/// The hud's `{by, fouls}` envelope key order.
#[derive(Serialize)]
struct TenBallHudFoulContext {
    by: i64,
    fouls: Vec<CitedFoul>,
}

/// The registry entry (`src/rulesets/registry.rs` REGISTRY row).
pub static ENTRY: RulesetEntry = RulesetEntry {
    id: "tenball-v1",
    initial_state,
    judge,
    apply_decision,
    hud_state,
    catalog,
};

fn parse_state(json: &str) -> Result<TenBallMatchState, RulesError> {
    serde_json::from_str(json)
        .map_err(|e| RulesError::BadState(format!("tenball-v1 state: {e}")))
}

fn state_json(state: &TenBallMatchState) -> Result<String, RulesError> {
    serde_json::to_string(state).map_err(|e| {
        RulesError::BadState(format!("tenball-v1 state serialization: {e}"))
    })
}

fn is_over(state: &TenBallMatchState) -> bool {
    state.result.is_some() || state.phase == "over"
}

/// Fresh rack at the opening-break address (6.2/6.3(a)).
fn initial_state(breaker: u8) -> Result<String, RulesError> {
    state_json(&TenBallMatchState {
        phase: "break".to_string(),
        shooter: breaker,
        breaker,
        on_table: full_rack(),
        consecutive_fouls: SeatPair::new(0, 0),
        pending_decision: None,
        foul_context: None,
        result: None,
    })
}

// ---- call inputs (calls-axis kind 0 call / kind 1 no-call / kind `push`) ----

enum CallInput {
    Called { ball: i64, pocket: i64 },
    /// The declared 6.4 push out.
    PushOut,
    /// The declared no-call stance (any non-`call`/non-`push` kind — the
    /// eightball-v2 lenient-kind convention; there is NO safety call at
    /// 10-Ball, 6.5).
    NoCall,
    /// The break (6.5: never called).
    None,
}

/// JS `String(x)` for call-gate error interpolations (v1 precedent).
fn js_string(v: Option<&Value>) -> String {
    match v {
        None => "undefined".to_string(),
        Some(Value::Null) => "null".to_string(),
        Some(Value::String(s)) => s.clone(),
        Some(other) => other.to_string(),
    }
}

fn parse_call(call: &Value, state: &TenBallMatchState)
    -> Result<CallInput, RulesError> {
    if call.get("kind").and_then(Value::as_str) == Some("push") {
        if state.phase != "pushout" {
            return Err(RulesError::BadCall(
                "tenball-v1: a push out is only available on the shot \
                 immediately after a foul-free break (WPA 6.4)"
                    .to_string(),
            ));
        }
        return Ok(CallInput::PushOut);
    }
    if call.get("kind").and_then(Value::as_str) != Some("call") {
        return Ok(CallInput::NoCall);
    }
    let ball_v = call.get("ball");
    let ball = ball_v.and_then(Value::as_i64);
    if !matches!(ball, Some(b) if (1..=10).contains(&b)) {
        return Err(RulesError::BadCall(format!(
            "tenball-v1: called ball {} is not an object ball (1-10)",
            js_string(ball_v)
        )));
    }
    let ball = ball.expect("gated above");
    if !state.on_table.contains(&ball) {
        return Err(RulesError::BadCall(format!(
            "tenball-v1: called ball {ball} is not on the table"
        )));
    }
    let pocket_v = call.get("pocket");
    match pocket_v.and_then(Value::as_i64) {
        Some(pocket) if pocket >= 0 => Ok(CallInput::Called { ball, pocket }),
        _ => Err(RulesError::BadCall(format!(
            "tenball-v1: called pocket {} is not a kernel pocket index",
            js_string(pocket_v)
        ))),
    }
}

/// 6.5 via 1.7: every non-break shot requires an explicit stance (call,
/// no-call, or — in the 6.4 window — the push-out declaration); the break
/// carries NO call.
fn gate_call(call: &Value, state: &TenBallMatchState, is_break: bool)
    -> Result<CallInput, RulesError> {
    if is_break {
        if call.is_null() {
            return Ok(CallInput::None);
        }
        return Err(RulesError::BadCall(
            "tenball-v1: the break is not a called shot (WPA 6.5)"
                .to_string(),
        ));
    }
    if call.is_null() {
        return Err(RulesError::BadCall(
            "tenball-v1: every shot after the break requires a call or a \
             declared no-call stance (WPA 6.5 via 1.7)"
                .to_string(),
        ));
    }
    parse_call(call, state)
}

// ---- judge -------------------------------------------------------------------

/// One judged stroke (FR-008 single pass). Guard order: match over →
/// pending decision → the call gate.
#[allow(clippy::too_many_lines)]
fn judge(state_json_in: &str, record_json: &str, call_json: &str)
    -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    term::guard_not_over(
        is_over(&state),
        "tenball-v1: judge called after the match ended (adapter contract)",
    )?;
    term::guard_no_pending(
        state.pending_decision.is_some(),
        format!(
            "tenball-v1: judge called while a rulebook decision is \
             pending ('{}') — resolve it via applyDecision",
            state
                .pending_decision
                .as_ref()
                .map_or("pushout_response", |p| p.kind.as_str())
        ),
    )?;
    let call: Value = serde_json::from_str(call_json)
        .map_err(|e| RulesError::BadCall(format!("tenball-v1 call: {e}")))?;
    let is_break = state.phase == "break";
    let call = gate_call(&call, &state, is_break)?;
    let record = wire::parse_record(record_json)?;
    let facts = scan::scan(&record, &scan::ScanConfig::default());

    // positive ids, first-occurrence order (the nineball dedupe precedent)
    let mut deduped: Vec<i64> = Vec::new();
    for id in state.on_table.iter().copied().filter(|id| *id > 0) {
        if !deduped.contains(&id) {
            deduped.push(id);
        }
    }
    if deduped.is_empty() {
        return Err(RulesError::BadState(
            "tenball-v1: state.onTable is empty — no object balls on the \
             table"
                .to_string(),
        ));
    }
    let lowest = contact::lowest(&deduped).expect("deduped is non-empty");

    let shooter = state.shooter;
    let opp = turn::other(shooter);
    let pocketed = facts.pocketed_ids();
    let is_push = matches!(call, CallInput::PushOut);

    // ---- fouls (6.9 events subset), citation order frozen by the slice
    let mut fouls = Fouls::new();
    if !is_push {
        // 6.4 suspends 3.2 + 3.3 (contact requirement included) on a
        // declared push out; every other stroke judges them.
        for f in contact::check_first_contact(
            &facts,
            |ball| ball == lowest,
            || Some(CitedFoul::new("no-contact", CITE_NO_CONTACT)),
            |_| Some(CitedFoul::new("wrong-first-ball", CITE_WRONG_FIRST)),
        ) {
            fouls.push(&f.code, &f.cite);
        }
        if !is_break
            && facts.first_contact.is_some()
            && !facts.driven_after_contact
        {
            fouls.push("no-rail-after-contact", CITE_NO_RAIL);
        }
        if is_break && pocketed.is_empty() {
            // 6.3(b): four object balls to rails; a jumped ball counts as
            // driven (2.7). Pockets cannot occur in this branch.
            let mut driven: Vec<i64> = facts.object_rail_ids.clone();
            for id in &facts.off_table {
                if !driven.contains(id) {
                    driven.push(*id);
                }
            }
            if driven.len() < 4 {
                fouls.push("illegal-break", CITE_ILLEGAL_BREAK);
            }
        }
    }
    if !facts.off_table.is_empty() {
        fouls.push("ball-off-table", CITE_OFF_TABLE);
    }
    if facts.cue_scratch {
        fouls.push("scratch", CITE_SCRATCH);
    }
    let stroke_legal = fouls.legal();

    // ---- 6.7 win test: the called 10 into the called pocket, foul-free,
    // when the 10 was the ONLY object ball at address (never on a push out)
    let called_fulfilled = match call {
        CallInput::Called { ball, pocket } => {
            pockets::call_fulfilled(&facts.pocketed, ball, pocket)
        }
        _ => false,
    };
    let lone_ten = deduped == [10];
    let game_over = stroke_legal
        && !is_push
        && lone_ten
        && matches!(call, CallInput::Called { ball: 10, .. })
        && called_fulfilled;

    // ---- 6.8 spotting: the 10 (and only the 10) returns
    let ten_down =
        pocketed.contains(&10) || facts.off_table.contains(&10);
    let respot_ten = !game_over && ten_down;
    let mut next_on_table: Vec<i64> = state
        .on_table
        .iter()
        .copied()
        .filter(|id| !pocketed.contains(id) && !facts.off_table.contains(id))
        .collect();
    if respot_ten && !next_on_table.contains(&10) {
        next_on_table.push(10);
    }

    let mut consecutive = state.consecutive_fouls;
    let mut terminal: Option<Terminal> = None;
    let mut decision: Option<DecisionRequired> = None;
    let mut turn_v = Turn::Pass;
    let mut ball_in_hand = PlacementRight::None;
    let mut next_phase = "play".to_string();

    if game_over {
        *consecutive.get_mut(shooter) = 0;
        terminal = Some(term::terminal(
            i64::from(shooter), "ten-ball-pocketed", CITE_WIN));
        turn_v = Turn::Continue;
    } else if !stroke_legal {
        // 6.9: standard foul — BIH anywhere, turn passes; the 6.4 window
        // never opens after a break foul. P15 tracked counter (6.10).
        let stepped = counters::step(
            counters::FoulCounterMode::Tracked { loss_threshold: 3 },
            *consecutive.get(shooter),
            true,
        );
        *consecutive.get_mut(shooter) = stepped.count;
        ball_in_hand = PlacementRight::Anywhere;
        if stepped.lost {
            // 6.10 via 3.13: loss of the rack on the third consecutive foul
            fouls.push("three-consecutive-fouls", CITE_THREE_FOULS);
            terminal = Some(term::terminal(
                i64::from(opp), "three-consecutive-fouls", CITE_THREE_FOULS));
            ball_in_hand = PlacementRight::None; // terminal is moot
        }
    } else {
        // legal stroke: any legal shot resets the counter (3.13)
        *consecutive.get_mut(shooter) = 0;
        if is_push {
            // 6.4: the other player chooses who shoots next
            decision = Some(DecisionRequired {
                kind: "pushout_response".to_string(),
                chooser: Chooser::Seat(opp),
            });
        } else if is_break {
            // 6.7: a scoring legal break keeps the table (no call on the
            // break, 6.5); a dry legal break passes it. Either way the
            // 6.4 window opens for the second shot of the rack.
            turn_v = if pocketed.is_empty() {
                Turn::Pass
            } else {
                Turn::Continue
            };
            next_phase = "pushout".to_string();
        } else if called_fulfilled {
            // 6.7: the called shot was made — extra balls stay down
            // (the 10 excepted, spotted above), the shooter continues
            turn_v = Turn::Continue;
        } else if !pocketed.is_empty() {
            // 6.6: wrongfully pocketed balls — opponent option
            decision = Some(DecisionRequired {
                kind: "wrongful_pot".to_string(),
                chooser: Chooser::Seat(opp),
            });
        }
    }

    let next_shooter = turn::resolve_seat(
        shooter, terminal.is_some(), decision.is_some(), turn_v);
    let legal = fouls.legal(); // P11 invariant
    let foul_context =
        fouls_mod::foul_context(fouls.as_slice(), i64::from(shooter));

    let judgment = Judgment {
        legal,
        fouls: fouls.into_vec(),
        pocketed,
        ball_in_hand,
        respot: if respot_ten { vec![10] } else { Vec::new() }, // P13 fixed
        turn: turn_v,
        decision_required: decision.clone(),
        terminal: terminal.clone(),
        next: TenBallMatchState {
            phase: if terminal.is_some() {
                "over".to_string()
            } else {
                next_phase
            },
            shooter: next_shooter,
            breaker: state.breaker,
            on_table: next_on_table,
            consecutive_fouls: consecutive,
            pending_decision: decision.map(|d| TenBallPending {
                kind: d.kind,
                chooser: d.chooser,
            }),
            foul_context,
            result: terminal,
        },
    };
    judgment.to_json()
}

// ---- decision resolution (P16 liturgy: guard → unknown id → pending →
// choice; ids 12 `pushout_response` (WPA 6.4) + 13 `wrongful_pot`
// (WPA 6.6) — the allocations past the frozen 1–11 space) ---------------------

fn apply_decision(state_json_in: &str, decision_json: &str)
    -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    term::guard_not_over(
        is_over(&state),
        "tenball-v1: no decision can be applied after the match ended",
    )?;
    let d = decisions::parse_decision(decision_json)?;
    let kind = match d.decision {
        12 => "pushout_response",
        13 => "wrongful_pot",
        other => {
            return Err(decisions::unknown_id(format!(
                "tenball-v1: unknown decision id {other} (only 12, \
                 pushout_response — {CITE_PUSHOUT}; 13, wrongful_pot — \
                 {CITE_WRONGFUL})"
            )));
        }
    };
    let pending = state
        .pending_decision
        .as_ref()
        .map_or("none".to_string(), |p| format!("'{}'", p.kind));
    decisions::check_pending(
        state
            .pending_decision
            .as_ref()
            .is_some_and(|p| p.kind == kind),
        format!(
            "tenball-v1: decision '{kind}' does not match the pending \
             option ({pending})"
        ),
    )?;
    decisions::check_choice(
        d.choice == 1 || d.choice == 2,
        format!(
            "tenball-v1: choice {} out of range for '{kind}' (1 the \
             shooter continues | 2 the chooser takes the table)",
            d.choice
        ),
    )?;
    // the CHOOSER recorded on the pending option is the non-shooting
    // player (the judgment always seats them there)
    let chooser = match state.pending_decision.as_ref().map(|p| p.chooser) {
        Some(Chooser::Seat(n)) => n,
        _ => turn::other(state.shooter),
    };
    state_json(&TenBallMatchState {
        phase: "play".to_string(),
        shooter: if d.choice == 1 { state.shooter } else { chooser },
        pending_decision: None,
        ..state
    })
}

/// HUD projection (module doc: discriminators `lowest` + `phase`), with
/// the `{by, fouls}` foul-context re-order. `lowest` is min over the RAW
/// `onTable` list (the nineball convention), `null` when empty.
fn hud_state(state_json_in: &str) -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    let hud = TenBallHud {
        phase: state.phase,
        shooter: state.shooter,
        breaker: state.breaker,
        lowest: state.on_table.iter().copied().min(),
        on_table: state.on_table,
        consecutive_fouls: state.consecutive_fouls,
        pending_decision: state.pending_decision,
        result: state.result,
        foul_context: state.foul_context.map(|fc| TenBallHudFoulContext {
            by: fc.by,
            fouls: fc.fouls,
        }),
    };
    serde_json::to_string(&hud).map_err(|e| {
        RulesError::BadState(format!("tenball-v1 hud serialization: {e}"))
    })
}

/// Catalog row: the events-detectable foul taxonomy with the Section 6
/// cites, the two additive decisions (ids 12/13 — past the frozen 1–11
/// space), the two terminals, and the pure-data config block (the T041
/// TS drift gate pins against this).
fn catalog() -> CatalogEntry {
    CatalogEntry {
        id: "tenball-v1",
        fouls: vec![
            CitedFoul::new("no-contact", CITE_NO_CONTACT),
            CitedFoul::new("wrong-first-ball", CITE_WRONG_FIRST),
            CitedFoul::new("no-rail-after-contact", CITE_NO_RAIL),
            CitedFoul::new("illegal-break", CITE_ILLEGAL_BREAK),
            CitedFoul::new("ball-off-table", CITE_OFF_TABLE),
            CitedFoul::new("scratch", CITE_SCRATCH),
            CitedFoul::new("three-consecutive-fouls", CITE_THREE_FOULS),
        ],
        decisions: vec![
            DecisionRow { id: 12, kind: "pushout_response", choice_max: 2 },
            DecisionRow { id: 13, kind: "wrongful_pot", choice_max: 2 },
        ],
        terminals: vec!["ten-ball-pocketed", "three-consecutive-fouls"],
        config: serde_json::json!({
            "callShot": true,
            "pushOut": true,
            "foulLabels": {
                "no-contact": "cue ball hit nothing",
                "wrong-first-ball": "wrong ball first",
                "no-rail-after-contact": "no rail after contact",
                "illegal-break": "illegal break",
                "ball-off-table": "ball driven off the table",
                "scratch": "scratch",
                "three-consecutive-fouls": "three consecutive fouls",
            },
            "notModeled": {
                "stalemate": "WPA 6.11",
                "callObviousness": "WPA 1.7",
                "twoFoulsWarning": "WPA 3.13",
                "nonEventsFouls": "WPA 3.4/3.6-3.10/3.12/3.14/3.15",
                "breakAddressZone": "WPA 3.10/3.11",
                "rackTemplate": "WPA Regulation 4",
            },
        }),
    }
}
