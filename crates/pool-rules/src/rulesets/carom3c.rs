// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `carom3c-v1` (T023) — field-for-field, behavior-frozen port of the
//! shipped TS implementation (`sdk/ts/src/rules/carom3c.ts`, feature 012
//! US3): UMB World Rules of Carom Billiard (1 Jan 1989), three-cushion
//! discipline. Every output byte is pinned by the harvested corpus
//! (`scripts/fixtures/rules-corpus.json`, carom3c-v1 subset); every
//! `RulesError` message is the TS text verbatim.
//!
//! v1 semantics (the TS doc block, ported as-is):
//! - Art 83 criterion: a point iff the STRUCK ball contacts both object
//!   balls (a cannon) with ≥ 3 struck-ball cushion contacts BEFORE the
//!   first contact with the SECOND object ball. Same-cushion repeats
//!   count; equal-t ties resolve by EVENT-STREAM POSITION (the frozen
//!   `nineball.ts:93–99` convention).
//! - `insufficient-cushions` / `missed` are CITED NON-SCORING reasons —
//!   `legal: true`, riding the match state (`lastReason`), never
//!   `Judgment.fouls` (the frozen `legal == fouls.is_empty()` invariant).
//! - Fouls: `wrong-first-ball-break` (Art 23.3/41.12 — break phase only;
//!   a contactless break is an Art 24.5 miss, not a first-ball
//!   violation), `frozen-cushion-play` (Art 27.2 via 41.8, GH-371:
//!   with the striker frozen to a cushion at address — centre within
//!   `r + 1e-6` of the rail plane, the TS `caromBallsInContact`
//!   kiss-epsilon convention — its first contact event of the stroke
//!   being a cushion event at that same rail is the "balls in contact"
//!   foul; playing away, a ball first, or a different cushion first is
//!   legal; dimension-less records disable the test) and
//!   `ball-off-table` (Art 41.1/28.1(b)). A foul voids the point and
//!   passes the turn; carom grants NO placement right — only the balls
//!   concerned respot (ids; XY geometry stays in the TS adapter,
//!   research R7).
//! - The struck ball derives from the record's own `Strike` event (UMB
//!   Art 22 per-shooter cue balls are pure stream data); a jumped struck
//!   ball joins the off-table list (no scratch concept).
//! - Decision 10 `break_spot` (Art 23.1(c)) is initialState-born; the
//!   resolved choice is match-state data only.
//! - An inning = a completed turn PAIR (closes when the seat that did
//!   NOT open the game ends a visit — Art 29 accounting).
//! - Race-to-`target` win (Art 29.1/29.2; default 15, settings data).
//!
//! v1 scope boundary (the rulesets contract §5; article labels
//! corrected against the pinned 1 Jan 1989 PDF by the issue #62 erratum
//! wave — audit-carom §E table; the frozen 012 contract keeps the stale
//! labels, disagreement on record in the audit):
//! OUT of engine scope, documented with cites — Art 41.2 (balls in
//! motion: structurally satisfied in-engine, every ShotRecord starts
//! from rest), 41.3 (leather tip), 41.4–41.6 (touched/moved balls),
//! 41.7 (pushed through / double contact — this covers the frozen
//! BALL-to-ball direct-play case, referee scope), 41.9 (foot off the
//! floor), 41.10 (marking), 41.13 (time limit) — physical-world/referee
//! judgments. Art 41.8's CUSHION half (playing directly a cushion the
//! cue ball is frozen to) moved INTO judged scope with GH-371 (it is
//! pure record geometry — the audit-carom F4/F3 correction); the Art
//! 27.1 demand-respot choice is an adapter affordance (flow.js, the
//! `caromContact()` seam + `caromRespotPlan`), recorded on the share
//! codec so replays re-derive it. Art 41.11 (wrong ball: "does not
//! play with HIS ball") is ALSO documented out of v1, not by referee
//! scope but by the shared-white residual: the shipped app plays ONE
//! white for both seats (an Art 22.1/23.4 variance, documented below),
//! so seat-ball ownership is an adapter convention that the frozen
//! corpus pins as legal (carom3c/judge-018/020: seat 2 strikes ball 0,
//! judged legal). Modeling 41.11 belongs to a per-seat-cue-ball variant
//! layer, not to a v1 erratum (the pinned bytes are correct under the
//! documented variance). Equal-innings match format (Art 29.3/29.4) is
//! a documented format simplification: single game, race-to-N, per the
//! spec Assumption.
//!
//! Primitives composed (the feature data-model §2 usage row): P1 scan
//! (`striker_from_strike` + `dedup_off_table` + `off_table_includes_
//! striker`), P2 Strike-derived striker + cannon, P3 break red-first
//! hook, P7 cushions-before-second-contact, P8 deduped off-table, P11
//! cited fouls, P13 balls-concerned respot ids, P16 decision liturgy,
//! P17 terminal, P18 turn/seat, P19 HUD with the `phase`→`stage` rename
//! (kept — the shipped 8-ball HUD chip surface keys on `ms.phase`; carom
//! exposes `stage` so those surfaces stay inert), P20 foul context.

use serde::{Deserialize, Serialize};

use crate::error::RulesError;
use crate::judgment::{
    CitedFoul, Judgment, PlacementRight, SeatPair, Terminal, Turn,
};
use crate::primitives::{
    contact, decisions, fouls as fouls_mod, fouls::Fouls, scan,
    terminal as term, turn,
};
use crate::rulesets::registry::{CatalogEntry, DecisionRow, RulesetEntry};
use crate::wire;

/// Carom ball ids (rack.rs `carom_start`; mirrored by the TS pure-data
/// exports `CAROM_BALL_BREAKER/OPPONENT/RED` — catalog drift-gate data).
pub const CAROM_BALL_BREAKER: i64 = 0;
pub const CAROM_BALL_OPPONENT: i64 = 1;
pub const CAROM_BALL_RED: i64 = 2;

/// Race-to-N default (spec Assumption; UMB Art 29.1 leaves the distance
/// to the match format). Settings data, never on the share wire.
pub const CAROM_TARGET_DEFAULT: i64 = 15;

// ---- pinned citation strings (research R11 map, TS `CITE` verbatim) --------

const CITE_WRONG_FIRST_BREAK: &str = "UMB Art 23.3/41.12";
const CITE_FROZEN_CUSHION: &str = "UMB Art 27.2/41.8";
const CITE_OFF_TABLE: &str = "UMB Art 41.1/28.1(b)";
const CITE_INSUFFICIENT: &str = "UMB Art 83";
const CITE_MISSED: &str = "UMB Art 24.5";
const CITE_WIN: &str = "UMB Art 29.1/29.2";

/// Cited non-scoring reason (TS `CaromReason`): `cushions` rides ONLY the
/// `insufficient-cushions` variant (`missed` omits the key — the corpus
/// pins both shapes byte-for-byte).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CaromReason {
    pub code: String,
    pub cite: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cushions: Option<i64>,
}

/// The pending break-spot option (UMB Art 23.1(c), wire decision 10).
/// Serde declaration order = the TS literal order: `kind, chooser`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PendingBreakSpot {
    pub kind: String,
    pub chooser: u8,
}

/// Complete three-cushion match state (TS `CaromMatchState`, frozen 012
/// shape). Serde declaration order = the TS `JSON.stringify` key order
/// the corpus pins: `phase, shooter, points, innings, target, breaker,
/// pendingDecision, breakSpot, lastReason, cushionsThisShot,
/// foulContext, result`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaromMatchState {
    pub phase: String,
    pub shooter: u8,
    pub points: SeatPair<i64>,
    pub innings: i64,
    pub target: i64,
    pub breaker: u8,
    #[serde(rename = "pendingDecision")]
    pub pending_decision: Option<PendingBreakSpot>,
    #[serde(rename = "breakSpot")]
    pub break_spot: String,
    #[serde(rename = "lastReason")]
    pub last_reason: Option<CaromReason>,
    #[serde(rename = "cushionsThisShot")]
    pub cushions_this_shot: i64,
    #[serde(rename = "foulContext")]
    pub foul_context: Option<fouls_mod::FoulContext>,
    pub result: Option<Terminal>,
}

/// HUD projection (TS `hudState` literal order): NOTE the deliberate
/// `phase`→`stage` rename (P19 — shipped behavior, see the module doc)
/// and the RE-ORDERED foul-context envelope (`{by, fouls}` — the TS hud
/// clone lists `by` first, unlike the state's `{fouls, by}`).
#[derive(Serialize)]
struct CaromHud {
    stage: String,
    shooter: u8,
    breaker: u8,
    points: SeatPair<i64>,
    innings: i64,
    target: i64,
    #[serde(rename = "cushionsThisShot")]
    cushions_this_shot: i64,
    #[serde(rename = "breakSpot")]
    break_spot: String,
    #[serde(rename = "pendingDecision")]
    pending_decision: Option<PendingBreakSpot>,
    #[serde(rename = "lastReason")]
    last_reason: Option<CaromReason>,
    #[serde(rename = "foulContext")]
    foul_context: Option<CaromHudFoulContext>,
    result: Option<Terminal>,
}

/// The hud's `{by, fouls}` envelope key order (TS hudState literal).
#[derive(Serialize)]
struct CaromHudFoulContext {
    by: i64,
    fouls: Vec<CitedFoul>,
}

/// The registry entry (`src/rulesets/registry.rs` REGISTRY row).
pub static ENTRY: RulesetEntry = RulesetEntry {
    id: "carom3c-v1",
    initial_state,
    judge,
    apply_decision,
    hud_state,
    catalog,
};

fn parse_state(json: &str) -> Result<CaromMatchState, RulesError> {
    serde_json::from_str(json)
        .map_err(|e| RulesError::BadState(format!("carom3c-v1 state: {e}")))
}

fn state_json(state: &CaromMatchState) -> Result<String, RulesError> {
    serde_json::to_string(state).map_err(|e| {
        RulesError::BadState(format!("carom3c-v1 state serialization: {e}"))
    })
}

/// TS `over` predicate, shared by judge/applyDecision guards.
fn is_over(state: &CaromMatchState) -> bool {
    state.result.is_some() || state.phase == "over"
}

/// UMB Art 27.2 via 41.8 (GH-371): TRUE when the striker stood frozen
/// to a cushion at address (centre within `r + 1e-6` of the rail plane
/// — the TS `caromBallsInContact` kiss-epsilon convention) AND its
/// first contact event of the stroke is a cushion event fired
/// essentially AT the address pose — playing DIRECTLY into the frozen
/// rail collides with zero travel (the kernel event lands at t = 0 on
/// the address pose), while a stroke that slides along the rail into an
/// adjacent corner cushion, plays away and curves back, or reaches any
/// other cushion first has TRAVELED and is legal (review r1 P2: the
/// corner post-pose satisfies both rail tests, so rail identity alone
/// cannot discriminate). A ball first, off-table first, or a missing
/// post pose reads legal; dimension-less records disable the test
/// (lenient-wire fallback). `pub(crate)`: carom3c-v2 judges the same
/// Art 27.2 law over its per-seat striker (one law, one implementation
/// — the eightball_v2 shared-state precedent); visibility only, the v1
/// judgment bytes are untouched.
pub(crate) fn frozen_cushion_direct_play(
    record: &wire::WireRecord, striker: i64,
) -> bool {
    let w = record.initial.table.width;
    let l = record.initial.table.length;
    if w <= 0.0 || l <= 0.0 {
        return false;
    }
    let Some(addr) = record.initial.balls.iter().find(|b| b.id == striker)
    else {
        return false;
    };
    let r = addr.params.r;
    let eps = 1e-6;
    // rail order: +x, -x, +y, -y (centre distance to each rail plane)
    let rails_at = |x: f64, y: f64| -> [bool; 4] {
        [
            w / 2.0 - x <= r + eps,
            w / 2.0 + x <= r + eps,
            l / 2.0 - y <= r + eps,
            l / 2.0 + y <= r + eps,
        ]
    };
    let frozen = rails_at(addr.state.pos.x, addr.state.pos.y);
    if !frozen.iter().any(|f| *f) {
        return false;
    }
    for ev in &record.events {
        match &ev.kind {
            wire::WireEventKind::BallBall { b1, b2 }
                if *b1 == striker || *b2 == striker =>
            {
                return false;
            }
            wire::WireEventKind::BallOffTable { ball }
                if *ball == striker =>
            {
                return false;
            }
            wire::WireEventKind::BallLinearCushion { ball }
            | wire::WireEventKind::BallCircularCushion { ball }
                if *ball == striker =>
            {
                let Some((_, s)) =
                    ev.post.iter().find(|(id, _)| *id == striker)
                else {
                    return false;
                };
                // DIRECT play only: the contact must land at the
                // address pose (zero travel). Any displacement means
                // the stroke went somewhere first — along the rail
                // into a corner, away-and-back, or to another cushion
                // — all legal under Art 27.2's "directly".
                let dx = s.pos.x - addr.state.pos.x;
                let dy = s.pos.y - addr.state.pos.y;
                if dx * dx + dy * dy > eps * eps {
                    return false;
                }
                let contacted = rails_at(s.pos.x, s.pos.y);
                return frozen
                    .iter()
                    .zip(contacted.iter())
                    .any(|(f, c)| *f && *c);
            }
            _ => {}
        }
    }
    false
}

/// TS `initialState(breaker)`: break address with the break-spot option
/// pending (Art 23.1(c)) and the rack.rs `carom_start` canonical `right`
/// default. No runtime seat validation (`1 | 2` is a TS type-level
/// promise) — ported as-is.
fn initial_state(breaker: u8) -> Result<String, RulesError> {
    state_json(&CaromMatchState {
        phase: "break".to_string(),
        shooter: breaker,
        points: SeatPair::new(0, 0),
        innings: 0,
        target: CAROM_TARGET_DEFAULT,
        breaker,
        pending_decision: Some(PendingBreakSpot {
            kind: "break_spot".to_string(),
            chooser: breaker,
        }),
        break_spot: "right".to_string(),
        last_reason: None,
        cushions_this_shot: 0,
        foul_context: None,
        result: None,
    })
}

/// TS `caromRuleset.judge`, one pass (FR-008). Guard order is the TS
/// body order: match over → break-spot pending → the call gate.
fn judge(state_json_in: &str, record_json: &str, call_json: &str)
    -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;

    term::guard_not_over(
        is_over(&state),
        "carom3c-v1: judge called after the match ended (adapter contract)",
    )?;
    term::guard_no_pending(
        state.pending_decision.is_some(),
        "carom3c-v1: judge called while the break-spot option is pending \
         (Art 23.1(c)) — resolve it via applyDecision"
            .to_string(),
    )?;
    let call: serde_json::Value = serde_json::from_str(call_json)
        .map_err(|e| RulesError::BadCall(format!("carom3c-v1 call: {e}")))?;
    if !call.is_null() {
        return Err(RulesError::BadCall(
            "carom3c-v1: three-cushion carries no call/safety/nomination \
             inputs"
                .to_string(),
        ));
    }

    let record = wire::parse_record(record_json)?;

    // P1/P2/P7/P8 single pass, carom variants: the striker derives from
    // the record's own Strike event (per-shooter cue balls), the
    // off-table list dedupes AND includes a jumped striker (Art 41.1 —
    // carom has no scratch concept, the ball concerned respots).
    let facts = scan::scan(&record, &scan::ScanConfig {
        striker_from_strike: true,
        dedup_off_table: true,
        off_table_includes_striker: true,
        jump_over_geometry: false,
        head_string_y: None, // no head string on the carom table
    });
    let shooter = state.shooter;

    // P3 break red-first hook (Art 23.3 via Art 41.12): break phase
    // only; a stroke that contacts NOTHING is an Art 24.5 miss, not a
    // first-ball violation (strictest mechanical reading, suite-pinned).
    let mut fouls = Fouls::new();
    if state.phase == "break" {
        for f in contact::check_first_contact(
            &facts,
            |ball| ball == CAROM_BALL_RED,
            || None,
            |_| Some(CitedFoul::new(
                "wrong-first-ball-break", CITE_WRONG_FIRST_BREAK)),
        ) {
            fouls.push(&f.code, &f.cite);
        }
    }
    // Art 27.2 via 41.8 (GH-371): frozen-cushion direct play — appended
    // between the break check and off-table (address geometry first;
    // additive, the frozen corpus never stages a frozen-rail address).
    if frozen_cushion_direct_play(&record, facts.struck) {
        fouls.push("frozen-cushion-play", CITE_FROZEN_CUSHION);
    }
    if !facts.off_table.is_empty() {
        fouls.push("ball-off-table", CITE_OFF_TABLE);
    }

    // Art 83: ≥3 struck-ball cushion contacts before the second object
    // ball; a foul voids the point (Art 41: the turn ends, no score).
    let point =
        fouls.is_empty() && facts.cannon && facts.cushions_before_second >= 3;
    let last_reason: Option<CaromReason> = if point || !fouls.is_empty() {
        None
    } else if facts.cannon {
        Some(CaromReason {
            code: "insufficient-cushions".to_string(),
            cite: CITE_INSUFFICIENT.to_string(),
            cushions: Some(facts.cushions_before_second),
        })
    } else {
        Some(CaromReason {
            code: "missed".to_string(),
            cite: CITE_MISSED.to_string(),
            cushions: None,
        })
    };

    let mut points = state.points;
    if point {
        *points.get_mut(shooter) += 1;
    }
    let terminal = if point && *points.get(shooter) >= state.target {
        // P17: race-to-target win (Art 29.1/29.2)
        Some(term::terminal(
            i64::from(shooter), "carom-target-reached", CITE_WIN))
    } else {
        None
    };
    let turn_v = if point { Turn::Continue } else { Turn::Pass };
    // an inning = a completed turn PAIR: it closes when the seat that
    // did NOT open the game ends a visit (Art 29 innings accounting)
    let innings = if turn_v == Turn::Pass && shooter != state.breaker {
        state.innings + 1
    } else {
        state.innings
    };
    // P18: terminal holds the seat (no decision is ever judge-born here)
    let next_shooter =
        turn::resolve_seat(shooter, terminal.is_some(), false, turn_v);

    let legal = fouls.legal(); // P11 invariant
    // P20 foul context; the pending option is guarded null above (the TS
    // spread carries that null into next).
    let foul_context =
        fouls_mod::foul_context(fouls.as_slice(), i64::from(shooter));

    let judgment = Judgment {
        legal,
        fouls: fouls.into_vec(),
        pocketed: Vec::new(), // FR-006: BallPocket is impossible on the
                              // pocketless table
        ball_in_hand: PlacementRight::None, // carom grants no placement
                              // right — jumped balls respot (Art 28.1(b))
        respot: facts.off_table.clone(), // P13: ONLY the balls concerned
                              // (Art 27.3(b)); XY stays in TS respot.ts
        turn: turn_v,
        decision_required: None, // break_spot is initialState-born
                                 // (Art 23.1(c)), never judge-emitted
        terminal: terminal.clone(),
        next: CaromMatchState {
            phase: if terminal.is_some() { "over" } else { "play" }
                .to_string(),
            shooter: next_shooter,
            points,
            innings,
            target: state.target,
            breaker: state.breaker,
            pending_decision: None,
            break_spot: state.break_spot,
            last_reason,
            cushions_this_shot: facts.cushions_before_second,
            foul_context,
            result: terminal,
        },
    };
    judgment.to_json()
}

/// TS `applyDecision`: the P16 liturgy in the TS body order — post-match
/// guard → unknown id → choice range → kind-vs-pending match. Messages
/// verbatim (corpus-pinned, including the always-`(none)` mismatch text:
/// break_spot is the only carom option, so no other kind can pend).
fn apply_decision(state_json_in: &str, decision_json: &str)
    -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    term::guard_not_over(
        is_over(&state),
        "carom3c-v1: no decision can be applied after the match ended",
    )?;
    let d = decisions::parse_decision(decision_json)?;
    if d.decision == 16 {
        // contact_respot (UMB Art 27.1(a), GH-371): the striker's
        // recorded demand to respot the balls concerned when the cue
        // ball stands frozen to another ball — never pending (the
        // stroke itself is the play-away alternative); the respot XY is
        // adapter geometry (`caromRespotPlan`, research R7) and the
        // frozen set re-derives from the table at replay time, so the
        // state is unchanged. The frozen-at-address precondition is
        // adapter-owned (`caromBallsInContact`).
        decisions::check_choice(
            d.choice == 1,
            format!(
                "carom3c-v1: choice {} out of range for 'contact_respot' \
                 (1 respot the balls concerned)",
                d.choice
            ),
        )?;
        decisions::check_pending(
            state.pending_decision.is_none(),
            "carom3c-v1: contact_respot cannot pre-empt the pending \
             'break_spot' option"
                .to_string(),
        )?;
        return state_json(&state);
    }
    if d.decision != 10 {
        // NOTE the "(only 10 …)" diagnostic text below is corpus-frozen
        // (pre-371 bytes); id 16 is handled above.
        return Err(decisions::unknown_id(format!(
            "carom3c-v1: unknown decision id {} (only 10, carom_break_spot \
             — UMB Art 23.1(c))",
            d.decision
        )));
    }
    decisions::check_choice(
        d.choice == 1 || d.choice == 2,
        format!(
            "carom3c-v1: choice {} out of range for 'break_spot' \
             (1 left | 2 right)",
            d.choice
        ),
    )?;
    decisions::check_pending(
        state
            .pending_decision
            .as_ref()
            .is_some_and(|p| p.kind == "break_spot"),
        "carom3c-v1: decision 'break_spot' does not match the pending \
         option (none)"
            .to_string(),
    )?;
    state_json(&CaromMatchState {
        pending_decision: None,
        break_spot: if d.choice == 1 { "left" } else { "right" }.to_string(),
        ..state
    })
}

/// TS `hudState`: P19 projection with the `phase`→`stage` rename (kept —
/// shipped behavior; the suite pins `!('phase' in hud)`) and the
/// re-ordered `{by, fouls}` foul-context clone.
fn hud_state(state_json_in: &str) -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    let hud = CaromHud {
        stage: state.phase,
        shooter: state.shooter,
        breaker: state.breaker,
        points: state.points,
        innings: state.innings,
        target: state.target,
        cushions_this_shot: state.cushions_this_shot,
        break_spot: state.break_spot,
        pending_decision: state.pending_decision,
        last_reason: state.last_reason,
        foul_context: state.foul_context.map(|fc| CaromHudFoulContext {
            by: fc.by,
            fouls: fc.fouls,
        }),
        result: state.result,
    };
    serde_json::to_string(&hud).map_err(|e| {
        RulesError::BadState(format!("carom3c-v1 hud serialization: {e}"))
    })
}

/// Catalog row: foul codes/cites in TS declaration order, the single
/// initialState-born decision (id 10, share-codec v4), the single
/// terminal reason, and the TS pure-data mirror (`CAROM_BALL_*`,
/// `CAROM_TARGET_DEFAULT` — the T041 drift gate pins against this).
fn catalog() -> CatalogEntry {
    CatalogEntry {
        id: "carom3c-v1",
        fouls: vec![
            CitedFoul::new("wrong-first-ball-break", CITE_WRONG_FIRST_BREAK),
            CitedFoul::new("frozen-cushion-play", CITE_FROZEN_CUSHION),
            CitedFoul::new("ball-off-table", CITE_OFF_TABLE),
        ],
        decisions: vec![
            DecisionRow { id: 10, kind: "break_spot", choice_max: 2 },
            // GH-371: UMB Art 27.1(a) balls-in-contact demand-respot
            // (recorded request, never pending; adapter-executed)
            DecisionRow { id: 16, kind: "contact_respot", choice_max: 1 },
        ],
        terminals: vec!["carom-target-reached"],
        config: serde_json::json!({
            "balls": {
                "breaker": CAROM_BALL_BREAKER,
                "opponent": CAROM_BALL_OPPONENT,
                "red": CAROM_BALL_RED,
            },
            "targetDefault": CAROM_TARGET_DEFAULT,
        }),
    }
}
