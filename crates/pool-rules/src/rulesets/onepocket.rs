// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `onepocket-v1` (T026) — field-for-field, behavior-frozen port of the
//! shipped TS implementation (`sdk/ts/src/rules/onepocket.ts`, feature
//! 012 US1): WPA Rules of Play (eff. 2025-09-15), Section 12 (12.1–12.11)
//! with the shared Section 3 fouls via 12.8/12.9. Every output byte is
//! pinned by the harvested corpus (`scripts/fixtures/rules-corpus.json`,
//! onepocket-v1 subset); every `RulesError` message is the TS text
//! verbatim.
//!
//! v1 semantics (the TS doc block, ported as-is):
//! - Mechanical fouls (12.8 subset): 3.1 cue scratch — ball in hand
//!   behind the head string; 3.3 no rail after contact, FOLDED with the
//!   complete miss (with no contact there can be no rail after contact
//!   — one `no-rail-after-contact` code); 3.5 ball driven off the table
//!   (spots per 12.6). 12.9 via 3.13: three consecutive fouls lose the
//!   rack, any legal shot resets the counter.
//! - WPA 12.8 via 3.11 (GH-371, audit F4): on a stroke that began with
//!   cue in hand above the head string, first contact with a ball also
//!   above the head string without the cue crossing first is the ¶1
//!   foul (`bad-kitchen-shot`, cue stays); a stroke that neither
//!   crosses the head string nor contacts a ball on/past it is the ¶2
//!   foul (`kitchen-no-exit`) — 12.8's second kitchen-BIH grant ("For a
//!   foul under the second paragraph of 3.11, the cue-ball is in hand
//!   above the Head String for the incoming player"). The kitchen-BIH
//!   context derives from the carried foul context (the turn passed on
//!   `scratch` or `kitchen-no-exit` — the two kitchen grants), gated on
//!   the record's own initial cue pose being strictly behind the line;
//!   the opening/re-lag BREAK stroke is not derivable from v1 state and
//!   stays un-judged for 3.11 (documented boundary: the ¶1 trigger is
//!   unreachable at the break — no kitchen object balls exist — and a
//!   deliberate backwards break already fouls 3.3 with the cue staying;
//!   only the ¶2 placement-right delta diverges there). Records without
//!   table dimensions disable the head-string facts (the lenient-wire
//!   7.8-zone precedent).
//! - Scoring (12.5/12.6, R9 gap fills): own-pocket balls count only on
//!   LEGAL strokes (fouled own-pocket balls spot — even a would-be
//!   eighth ball; 12.11 covers ONLY the both-players-reach-8 stroke);
//!   opponent-pocket balls count for the OPPONENT even on fouls, unless
//!   the stroke scratched (then they spot); a credited ball repays the
//!   credited player's owed debt IMMEDIATELY (spotted, not tallied); the
//!   foul penalty is ONE ball per foul stroke — a fouler with tray balls
//!   spots the MOST RECENTLY scored (documented LIFO convention), an
//!   empty tray accrues an owed debt.
//! - Spot timing (12.6): neutral-pocket + off-table balls spot at the
//!   END of the shooter's turn; a turn-ending stroke spots them
//!   immediately, and a cleared table spots EVERYTHING immediately with
//!   the shooter continuing. All spotted balls go in numerical order
//!   (WPA 1.5 — the ids-only P13 discipline; XY geometry stays in the
//!   TS adapter, research R7).
//! - Decision 6 `break_pocket` (WPA 12.3) is initialState-BORN; decision
//!   9 `stalemate_lag` (WPA 12.10) is a recorded hot-seat agreement —
//!   never pending, guarded against pre-empting the pocket choice. The
//!   12.10 re-rack carries tallies/owed/pockets/foul counters over and
//!   resets the physical trays (the balls return to the table).
//! - `tallies` are carried COUNTS; `scored` is the physical tray of ball
//!   ids backing them (the LIFO spotting source).
//!
//! Primitives composed (the feature data-model §2 usage row): P1 scan (default
//! config: cue pinned at id 0, off-table kept in stream order, no
//! dedup), P4 folded no-contact/no-rail variant, P5 own/opp/neutral
//! partition by kernel pocket index, P8 off-table, P9 cue scratch, P11
//! cited fouls, P13 immediate + end-of-turn respot queues with numerical
//! sort, P14 LIFO tray pop / owed+1, P15 tracked three-foul counter with
//! reset-on-legal, P16 decision liturgy (ids 6 and 9), P17 terminal, P18
//! turn/seat, P20 foul context.

use serde::{Deserialize, Serialize};

use crate::error::RulesError;
use crate::judgment::{
    Chooser, CitedFoul, Judgment, PlacementRight, SeatPair, Terminal, Turn,
};
use crate::primitives::{
    counters, decisions, fouls as fouls_mod, fouls::Fouls, penalty, pockets,
    respot_chain, scan, terminal as term, turn,
};
use crate::rulesets::registry::{CatalogEntry, DecisionRow, RulesetEntry};
use crate::wire;

/// The two FOOT corner pockets as kernel `Table.pockets` indices (the
/// pool builder orders pockets lb=0 lc=1 lt=2 rb=3 rc=4 rt=5 with +y
/// toward the foot end — mirrored by the TS pure-data export
/// `ONE_POCKET_FOOT_POCKETS`, catalog drift-gate data).
pub const ONE_POCKET_FOOT_POCKET_LEFT: i64 = 2;
pub const ONE_POCKET_FOOT_POCKET_RIGHT: i64 = 5;

/// WPA 12.5: the first player to score eight balls wins.
pub const WIN_TALLY: i64 = 8;

// ---- pinned citation strings (research R1/R9 map, TS `CITE` verbatim) ------

const CITE_SCRATCH: &str = "WPA 12.8 via 3.1";
const CITE_NO_RAIL: &str = "WPA 12.8 via 3.3";
const CITE_OFF_TABLE: &str = "WPA 12.8 via 3.5";
const CITE_KITCHEN: &str = "WPA 12.8 via 3.11";
const CITE_THREE_FOULS: &str = "WPA 12.9 via 3.13";
const CITE_WIN: &str = "WPA 12.5";
const CITE_WIN_SIM: &str = "WPA 12.11";

/// The full 15-ball rack (TS `FULL_RACK`).
fn full_rack() -> Vec<i64> {
    (1..=15).collect()
}

/// A pending rulebook option (TS `OnePocketDecision`: `break_pocket`
/// with a seat chooser, `stalemate_lag` with `"both"` — only the former
/// ever pends). Serde declaration order = the TS literal order:
/// `kind, chooser`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnePocketPending {
    pub kind: String,
    pub chooser: Chooser,
}

/// Complete one-pocket match state (TS `OnePocketMatchState`, frozen 012
/// shape). Serde declaration order = the TS `JSON.stringify` key order
/// the corpus pins: `phase, shooter, breaker, pockets, tallies, owed,
/// consecutiveFouls, scored, pendingSpots, onTable, pendingDecision,
/// foulContext, result`. Seat-keyed maps ride [`SeatPair`] (ascending
/// `"1"`/`"2"` keys, the JS integer-like ordering).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnePocketMatchState {
    pub phase: String,
    pub shooter: u8,
    pub breaker: u8,
    /// The two FOOT corner pockets as kernel pocket indices (assigned by
    /// decision 6; null until then — WPA 12.3).
    pub pockets: Option<SeatPair<i64>>,
    /// Balls scored toward the win (COUNTS — carried across a 12.10
    /// stalemate re-rack; win at 8, WPA 12.5).
    pub tallies: SeatPair<i64>,
    /// Owed-ball debts: fouls committed with an empty tray (12.5/12.6).
    pub owed: SeatPair<i64>,
    #[serde(rename = "consecutiveFouls")]
    pub consecutive_fouls: SeatPair<i64>,
    /// Physical trays: the ball ids backing each tally (LIFO spotting
    /// source for the one-ball foul penalty; reset by a re-rack).
    pub scored: SeatPair<Vec<i64>>,
    /// Balls awaiting the end-of-turn spot (WPA 12.6 timing).
    #[serde(rename = "pendingSpots")]
    pub pending_spots: Vec<i64>,
    #[serde(rename = "onTable")]
    pub on_table: Vec<i64>,
    #[serde(rename = "pendingDecision")]
    pub pending_decision: Option<OnePocketPending>,
    #[serde(rename = "foulContext")]
    pub foul_context: Option<fouls_mod::FoulContext>,
    pub result: Option<Terminal>,
}

/// HUD projection (TS `hudState` literal order): NOTE `scored` stays
/// private to the state, `target` joins, and the foul-context envelope
/// re-orders to `{by, fouls}` (the TS hud clone lists `by` first, unlike
/// the state's `{fouls, by}`).
#[derive(Serialize)]
struct OnePocketHud {
    phase: String,
    shooter: u8,
    breaker: u8,
    pockets: Option<SeatPair<i64>>,
    tallies: SeatPair<i64>,
    owed: SeatPair<i64>,
    #[serde(rename = "consecutiveFouls")]
    consecutive_fouls: SeatPair<i64>,
    #[serde(rename = "pendingSpots")]
    pending_spots: Vec<i64>,
    #[serde(rename = "onTable")]
    on_table: Vec<i64>,
    target: i64,
    #[serde(rename = "pendingDecision")]
    pending_decision: Option<OnePocketPending>,
    result: Option<Terminal>,
    #[serde(rename = "foulContext")]
    foul_context: Option<OnePocketHudFoulContext>,
}

/// The hud's `{by, fouls}` envelope key order (TS hudState literal).
#[derive(Serialize)]
struct OnePocketHudFoulContext {
    by: i64,
    fouls: Vec<CitedFoul>,
}

/// The registry entry (`src/rulesets/registry.rs` REGISTRY row).
pub static ENTRY: RulesetEntry = RulesetEntry {
    id: "onepocket-v1",
    initial_state,
    judge,
    apply_decision,
    hud_state,
    catalog,
};

fn parse_state(json: &str) -> Result<OnePocketMatchState, RulesError> {
    serde_json::from_str(json)
        .map_err(|e| RulesError::BadState(format!("onepocket-v1 state: {e}")))
}

fn state_json(state: &OnePocketMatchState) -> Result<String, RulesError> {
    serde_json::to_string(state).map_err(|e| {
        RulesError::BadState(format!("onepocket-v1 state serialization: {e}"))
    })
}

/// TS `over` predicate, shared by judge/applyDecision guards.
fn is_over(state: &OnePocketMatchState) -> bool {
    state.result.is_some() || state.phase == "over"
}

/// WPA 3.11 context (GH-371): the stroke began with cue in hand above
/// the head string — the previous judgment granted kitchen placement.
/// Exact for v1's two kitchen grants (3.1 `scratch`; 12.8 ¶ / 3.11 ¶2
/// `kitchen-no-exit`): both always pass the turn, so the carried foul
/// context belongs to the opponent exactly when this shooter received
/// the grant. The break strokes are the documented boundary (module
/// doc).
fn kitchen_bih_context(state: &OnePocketMatchState) -> bool {
    state.foul_context.as_ref().is_some_and(|fc| {
        fc.by != i64::from(state.shooter)
            && fc.fouls.iter().any(|f| {
                f.code == "scratch" || f.code == "kitchen-no-exit"
            })
    })
}

/// The pending kind for guard messages (TS
/// `state.pendingDecision?.kind ?? 'break_pocket'`).
fn pending_kind(state: &OnePocketMatchState) -> &str {
    state
        .pending_decision
        .as_ref()
        .map_or("break_pocket", |p| p.kind.as_str())
}

/// TS `initialState(breaker)`: fresh 15-ball rack at the pocket-choice
/// address with the break-pocket option pending (WPA 12.3 — the P16
/// initialState-BORN birth mode). No runtime seat validation (`1 | 2` is
/// a TS type-level promise) — ported as-is.
fn initial_state(breaker: u8) -> Result<String, RulesError> {
    state_json(&OnePocketMatchState {
        phase: "pocket_choice".to_string(),
        shooter: breaker,
        breaker,
        pockets: None,
        tallies: SeatPair::new(0, 0),
        owed: SeatPair::new(0, 0),
        consecutive_fouls: SeatPair::new(0, 0),
        scored: SeatPair::new(Vec::new(), Vec::new()),
        pending_spots: Vec::new(),
        on_table: full_rack(),
        pending_decision: Some(OnePocketPending {
            kind: "break_pocket".to_string(),
            chooser: Chooser::Seat(breaker),
        }),
        foul_context: None,
        result: None,
    })
}

/// The crediting draft (TS `Draft` + `credit`): owed debts are repaid
/// immediately by spotting (12.5/12.6, via the P14 owed decrement), the
/// remainder raises the tally and enters the physical tray.
struct Draft {
    tallies: SeatPair<i64>,
    owed: SeatPair<i64>,
    scored: SeatPair<Vec<i64>>,
    respot_now: Vec<i64>,
}

fn credit(d: &mut Draft, p: u8, ids: &[i64]) {
    for id in ids {
        if *d.owed.get(p) > 0 {
            *d.owed.get_mut(p) -= 1;
            d.respot_now.push(*id); // repaid immediately (12.6)
        } else {
            *d.tallies.get_mut(p) += 1;
            d.scored.get_mut(p).push(*id);
        }
    }
}

/// TS `onepocketRuleset.judge`, one pass (FR-008). Guard order is the TS
/// body order: match over → pending decision/pocket_choice → the call
/// gate → the pocket-assignment invariant.
fn judge(state_json_in: &str, record_json: &str, call_json: &str)
    -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;

    term::guard_not_over(
        is_over(&state),
        "onepocket-v1: judge called after the match ended (adapter contract)",
    )?;
    term::guard_no_pending(
        state.pending_decision.is_some() || state.phase == "pocket_choice",
        format!(
            "onepocket-v1: judge called while a rulebook decision is \
             pending ('{}') — resolve it via applyDecision",
            pending_kind(&state)
        ),
    )?;
    let call: serde_json::Value = serde_json::from_str(call_json)
        .map_err(|e| RulesError::BadCall(format!("onepocket-v1 call: {e}")))?;
    if !call.is_null() {
        return Err(RulesError::BadCall(
            "onepocket-v1: one-pocket carries no per-shot call — pocket \
             ownership (WPA 12.3) replaces call rules"
                .to_string(),
        ));
    }
    let Some(assigned) = state.pockets else {
        return Err(RulesError::BadState(
            "onepocket-v1: play phase without pocket assignments"
                .to_string(),
        ));
    };

    let record = wire::parse_record(record_json)?;

    let shooter = state.shooter;
    let opp = turn::other(shooter);
    let own_pocket = *assigned.get(shooter);
    let opp_pocket = *assigned.get(opp);
    // P1 single pass, default config (cue pinned at id 0, off-table in
    // stream order, no dedup) — stream position is causal order. P21
    // head-string facts join when the record carries table dimensions
    // (GH-371; a 0.0 length disables them — the 7.8-zone precedent).
    let table_l = record.initial.table.length;
    let hs_plane = if table_l > 0.0 { Some(-table_l / 4.0) } else { None };
    let facts = scan::scan(&record, &scan::ScanConfig {
        head_string_y: hs_plane,
        ..scan::ScanConfig::default()
    });
    // WPA 12.8 via 3.11 (GH-371): judged only when the stroke began from
    // a kitchen-BIH grant AND the record's own initial cue pose is
    // strictly behind the line (3.10 placement stays adapter territory).
    let kitchen_stroke = kitchen_bih_context(&state)
        && hs_plane.is_some_and(|hs| {
            record
                .initial
                .balls
                .iter()
                .find(|b| b.id == 0)
                .is_some_and(|b| b.state.pos.y < hs)
        });

    // ---- fouls (12.8 mechanical subset; every non-3.1 keeps the cue),
    // TS citation order. P4 FOLDED variant: a complete miss fails the
    // same rail-after-contact requirement (one code covers both). The
    // GH-371 3.11 codes append after the frozen three (additive — the
    // frozen corpus never stages a kitchen-BIH stroke on a dimensioned
    // record).
    let mut fouls = Fouls::new();
    if facts.first_contact.is_none() || !facts.driven_after_contact {
        fouls.push("no-rail-after-contact", CITE_NO_RAIL);
    }
    if !facts.off_table.is_empty() {
        fouls.push("ball-off-table", CITE_OFF_TABLE);
    }
    if facts.cue_scratch {
        fouls.push("scratch", CITE_SCRATCH);
    }
    // 3.11 ¶1: first contact with a kitchen ball, no crossing first.
    if kitchen_stroke
        && facts.first_contact_in_kitchen
        && !facts.cue_crossed_head_string_before_contact
    {
        fouls.push("bad-kitchen-shot", CITE_KITCHEN);
    }
    // 3.11 ¶2: the stroke neither crossed the head string nor contacted
    // a ball on/past it — 12.8 grants the incoming player kitchen BIH.
    let kitchen_no_exit = kitchen_stroke
        && !facts.cue_crossed_head_string
        && !facts.cue_contacted_ball_past_head_string;
    if kitchen_no_exit {
        fouls.push("kitchen-no-exit", CITE_KITCHEN);
    }
    let is_foul = !fouls.is_empty();

    // ---- P5: classify the pocketed balls (stream order preserved) -----
    let part =
        pockets::partition_by_pocket(&facts.pocketed, own_pocket, opp_pocket);

    // ---- crediting draft (12.5 + R9 gap fills) -------------------------
    let mut d = Draft {
        tallies: state.tallies,
        owed: state.owed,
        scored: state.scored.clone(),
        respot_now: Vec::new(),
    };
    // spot queue for this stroke: neutral pockets + off-table balls (12.6)
    let mut queued: Vec<i64> = Vec::new();
    queued.extend_from_slice(&part.neutral);
    queued.extend_from_slice(&facts.off_table);

    // opponent-pocket balls count for the opponent even on fouls (12.5),
    // "unless the only foul committed is that the cue-ball is also
    // pocketed" — then they spot instead (12.6). Strict text (issue #37
    // audit fix, RULES_VERSION 0.1.1): the exception needs (a) the cue
    // actually POCKETED — a cue DRIVEN OFF the table is a 3.1 foul but
    // not a pocketed cue (facts.cue_scratch folds both, so the wire
    // events decide) — and (b) the scratch as the stroke's ONLY foul
    // (a second foul on the same stroke voids the exception).
    let cue_pocketed = record.events.iter().any(|e| {
        matches!(e.kind, wire::WireEventKind::BallPocket { ball: 0, .. })
    });
    if cue_pocketed && fouls.as_slice().len() == 1 {
        queued.extend_from_slice(&part.opp);
    } else {
        credit(&mut d, opp, &part.opp);
    }

    // own-pocket balls count only on legal strokes (12.5); on a foul they
    // spot instead (12.6) — even a would-be eighth ball. 12.11 covers ONLY
    // the both-winning-balls-on-one-stroke case ("a score handicap or a
    // stalemate rerack"), so it never rescues a foul stroke.
    if !is_foul {
        credit(&mut d, shooter, &part.own);
    } else {
        queued.extend_from_slice(&part.own);
    }

    // ---- terminal checks (P17) ------------------------------------------
    let shooter_wins = *d.tallies.get(shooter) >= WIN_TALLY;
    let opp_wins = *d.tallies.get(opp) >= WIN_TALLY;
    let mut terminal: Option<Terminal> = None;
    let mut consecutive_fouls = state.consecutive_fouls;
    if shooter_wins {
        // 12.11 simultaneity: both players reach 8 on one stroke → the
        // shooter. A foul stroke never credits the shooter (above), so
        // shooter_wins here implies a legal stroke.
        terminal = Some(term::terminal(
            i64::from(shooter),
            "first-to-eight",
            if opp_wins { CITE_WIN_SIM } else { CITE_WIN },
        ));
    } else if opp_wins {
        terminal =
            Some(term::terminal(i64::from(opp), "first-to-eight", CITE_WIN));
    }

    // ---- foul consequences (skipped when the stroke already ended the
    // rack — the opponent's eighth ball can drop on the shooter's foul):
    // P14 one-ball penalty, then the P15 tracked counter (threshold 3,
    // reset on any legal shot — WPA 12.9 via 3.13).
    if is_foul && terminal.is_none() {
        if let Some(paid) = penalty::pay_one_ball(
            d.scored.get_mut(shooter),
            d.tallies.get_mut(shooter),
            d.owed.get_mut(shooter),
        ) {
            d.respot_now.push(paid);
        }
        let stepped = counters::step(
            counters::FoulCounterMode::Tracked { loss_threshold: 3 },
            *consecutive_fouls.get(shooter),
            true,
        );
        *consecutive_fouls.get_mut(shooter) = stepped.count;
        if stepped.lost {
            // 12.9 via 3.13: the third successive foul loses the rack
            fouls.push("three-consecutive-fouls", CITE_THREE_FOULS);
            terminal = Some(term::terminal(
                i64::from(opp),
                "three-consecutive-fouls",
                CITE_THREE_FOULS,
            ));
        }
    } else if !is_foul {
        // any legal shot resets the counter (12.9)
        *consecutive_fouls.get_mut(shooter) = 0;
    }

    // ---- turn + spot-timing resolution (12.5/12.6, O2–O5/O8) -------------
    let pocketed = facts.pocketed_ids();
    let on_table: Vec<i64> = state
        .on_table
        .iter()
        .copied()
        .filter(|id| !pocketed.contains(id) && !facts.off_table.contains(id))
        .collect();
    let cleared = on_table.is_empty(); // before the spots return

    // `continue` on a terminal (don't-care: the rack is over), a legal
    // own-pocket score (O2), or a cleared table (O8); otherwise `pass`.
    // The `cleared` disjunct is 12.6 VERBATIM (issue #62 adjudication —
    // do not re-flip): "if the shooter clears the table and has not
    // reached eight points, perhaps due to balls having been pocketed
    // in extraneous pockets, all balls to be spotted are spotted at
    // that time and the shooter continues their turn." 12.4 governs
    // ordinary turn passage; 12.6 is the explicit cleared-table
    // exception.
    let turn_v = if terminal.is_some()
        || (!is_foul && (!part.own.is_empty() || cleared))
    {
        Turn::Continue
    } else {
        Turn::Pass
    };

    // P13: end of turn (12.6) — or the cleared-table immediate spot
    // (12.6) — flushes the whole queue now; numerical order (WPA 1.5).
    let (respot, pending_spots) = respot_chain::flush_queues(
        d.respot_now,
        queued,
        &state.pending_spots,
        terminal.is_none() && (turn_v == Turn::Pass || cleared),
    );
    let mut on_table = on_table;
    on_table.extend_from_slice(&respot);
    on_table.sort_unstable();

    // P18: terminal holds the seat (no decision is ever judge-born here)
    let next_shooter =
        turn::resolve_seat(shooter, terminal.is_some(), false, turn_v);
    let legal = fouls.legal(); // P11 invariant
    // P20 foul context; the pending option is guarded null above (the TS
    // literal carries that null into next).
    let foul_context =
        fouls_mod::foul_context(fouls.as_slice(), i64::from(shooter));

    let judgment = Judgment {
        legal,
        fouls: fouls.into_vec(),
        pocketed,
        // the two kitchen-BIH fouls (12.8): 3.1 scratch and the 3.11 ¶2
        // no-exit; every other foul leaves the cue ball where it lies
        ball_in_hand: if terminal.is_some() {
            PlacementRight::None
        } else if facts.cue_scratch || kitchen_no_exit {
            PlacementRight::Kitchen
        } else {
            PlacementRight::None
        },
        respot,
        turn: turn_v,
        decision_required: None, // pocket choice pends from initialState;
                                 // the stalemate lag is a recorded agreement
        terminal: terminal.clone(),
        next: OnePocketMatchState {
            phase: if terminal.is_some() { "over" } else { "play" }
                .to_string(),
            shooter: next_shooter,
            breaker: state.breaker,
            pockets: Some(assigned),
            tallies: d.tallies,
            owed: d.owed,
            consecutive_fouls,
            scored: d.scored,
            pending_spots,
            on_table,
            pending_decision: None,
            foul_context,
            result: terminal,
        },
    };
    judgment.to_json()
}

/// TS `applyDecision`: the P16 liturgy in the TS body order — post-match
/// guard → per-id checks (decision 6: pending match BEFORE choice range;
/// decision 9: pre-emption guard BEFORE choice range) → unknown id.
/// Messages verbatim (corpus-pinned).
fn apply_decision(state_json_in: &str, decision_json: &str)
    -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    term::guard_not_over(
        is_over(&state),
        "onepocket-v1: no decision can be applied after the match ended",
    )?;
    let d = decisions::parse_decision(decision_json)?;
    if d.decision == 6 {
        // break_pocket (WPA 12.3)
        decisions::check_pending(
            state
                .pending_decision
                .as_ref()
                .is_some_and(|p| p.kind == "break_pocket"),
            "onepocket-v1: no break-pocket choice is pending".to_string(),
        )?;
        decisions::check_choice(
            d.choice == 1 || d.choice == 2,
            format!(
                "onepocket-v1: choice {} out of range for 'break_pocket' \
                 (1 left foot pocket | 2 right)",
                d.choice
            ),
        )?;
        let chosen = if d.choice == 1 {
            ONE_POCKET_FOOT_POCKET_LEFT
        } else {
            ONE_POCKET_FOOT_POCKET_RIGHT
        };
        let other_pocket = if d.choice == 1 {
            ONE_POCKET_FOOT_POCKET_RIGHT
        } else {
            ONE_POCKET_FOOT_POCKET_LEFT
        };
        // the CHOOSER recorded on the pending option is the breaker (TS
        // reads it back rather than state.breaker — ported as-is)
        let breaker_is_one = matches!(
            state.pending_decision.as_ref().map(|p| p.chooser),
            Some(Chooser::Seat(1))
        );
        return state_json(&OnePocketMatchState {
            phase: "play".to_string(),
            pockets: Some(if breaker_is_one {
                SeatPair::new(chosen, other_pocket)
            } else {
                SeatPair::new(other_pocket, chosen)
            }),
            pending_decision: None,
            ..state
        });
    }
    if d.decision == 14 {
        // spot_nearest (WPA 1.6 ¶2 via 12.8, GH-371): with cue in hand
        // above the head string and ALL object balls also above it, the
        // shooter may request the ball nearest the head string spotted.
        // A RECORDED REQUEST, never pending (the stalemate_lag
        // precedent): the placement is adapter geometry (research R7 —
        // respot XY stays out of the crate; ids never leave the table,
        // so the state is unchanged) and the calls-axis record is what
        // makes replays re-derive it. The all-balls-above-the-line
        // precondition is adapter-owned (state carries no XY).
        decisions::check_pending(
            state.pending_decision.is_none() && state.phase == "play",
            format!(
                "onepocket-v1: spot_nearest cannot pre-empt the pending \
                 '{}' option",
                pending_kind(&state)
            ),
        )?;
        decisions::check_choice(
            d.choice == 1,
            format!(
                "onepocket-v1: choice {} out of range for 'spot_nearest' \
                 (1 spot the nearest ball)",
                d.choice
            ),
        )?;
        return state_json(&state);
    }
    if d.decision == 9 {
        // stalemate_lag (WPA 12.10): a recorded hot-seat AGREEMENT + lag
        // outcome (eightball stalemate precedent) — never pending from a
        // judgment, but it must not pre-empt the pocket choice
        decisions::check_pending(
            state.pending_decision.is_none() && state.phase == "play",
            format!(
                "onepocket-v1: stalemate cannot pre-empt the pending '{}' \
                 option",
                pending_kind(&state)
            ),
        )?;
        decisions::check_choice(
            d.choice == 1 || d.choice == 2,
            format!(
                "onepocket-v1: choice {} out of range for 'stalemate_lag' \
                 (1 player 1 breaks | 2 player 2)",
                d.choice
            ),
        )?;
        let breaker = if d.choice == 1 { 1 } else { 2 };
        // full 15 re-rack; owed markers, tallies, pocket assignments and
        // foul counters carry over (12.10) — the trays reset because the
        // balls physically return to the table
        return state_json(&OnePocketMatchState {
            phase: "play".to_string(),
            shooter: breaker,
            breaker,
            scored: SeatPair::new(Vec::new(), Vec::new()),
            pending_spots: Vec::new(),
            on_table: full_rack(),
            pending_decision: None,
            foul_context: None,
            ..state
        });
    }
    Err(decisions::unknown_id(format!(
        "onepocket-v1: unknown decision id {}",
        d.decision
    )))
}

/// TS `hudState`: the state projection plus `target`, minus the physical
/// trays (`scored`), with the re-ordered `{by, fouls}` foul-context
/// clone.
fn hud_state(state_json_in: &str) -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    let hud = OnePocketHud {
        phase: state.phase,
        shooter: state.shooter,
        breaker: state.breaker,
        pockets: state.pockets,
        tallies: state.tallies,
        owed: state.owed,
        consecutive_fouls: state.consecutive_fouls,
        pending_spots: state.pending_spots,
        on_table: state.on_table,
        target: WIN_TALLY,
        pending_decision: state.pending_decision,
        result: state.result,
        foul_context: state.foul_context.map(|fc| OnePocketHudFoulContext {
            by: fc.by,
            fouls: fc.fouls,
        }),
    };
    serde_json::to_string(&hud).map_err(|e| {
        RulesError::BadState(format!("onepocket-v1 hud serialization: {e}"))
    })
}

/// Catalog row: foul codes/cites in the one_pocket catalog foul_taxonomy
/// order (games/catalog.ts), the two decisions (6 initialState-born, 9
/// never-pending agreement — share-codec v4), both terminal reasons, and
/// the TS pure-data mirror (`ONE_POCKET_FOOT_POCKETS` + the win target —
/// the T041 drift gate pins against this).
fn catalog() -> CatalogEntry {
    CatalogEntry {
        id: "onepocket-v1",
        fouls: vec![
            CitedFoul::new("scratch", CITE_SCRATCH),
            CitedFoul::new("no-rail-after-contact", CITE_NO_RAIL),
            CitedFoul::new("ball-off-table", CITE_OFF_TABLE),
            CitedFoul::new("three-consecutive-fouls", CITE_THREE_FOULS),
            CitedFoul::new("bad-kitchen-shot", CITE_KITCHEN),
            CitedFoul::new("kitchen-no-exit", CITE_KITCHEN),
        ],
        decisions: vec![
            DecisionRow { id: 6, kind: "break_pocket", choice_max: 2 },
            DecisionRow { id: 9, kind: "stalemate_lag", choice_max: 2 },
            // GH-371: WPA 1.6 ¶2 nearest-ball spot request (recorded
            // request, never pending; adapter-executed placement)
            DecisionRow { id: 14, kind: "spot_nearest", choice_max: 1 },
        ],
        terminals: vec!["first-to-eight", "three-consecutive-fouls"],
        config: serde_json::json!({
            "footPockets": {
                "left": ONE_POCKET_FOOT_POCKET_LEFT,
                "right": ONE_POCKET_FOOT_POCKET_RIGHT,
            },
            "winTally": WIN_TALLY,
        }),
    }
}
