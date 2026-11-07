// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `eightball-v1` (T029) — field-for-field, behavior-frozen port of the
//! shipped TS implementation (`sdk/ts/src/rules/eightball.ts`, feature
//! 011 T014): WPA Rules of Play (eff. 2025-09-15), Section 4 (4.1–4.11)
//! with the shared Section 3 fouls via 4.9 (break fouls reroute the
//! remedy cite to 4.3(g),(h) — kitchen placement, never anywhere). Every
//! output byte is pinned by the harvested corpus
//! (`scripts/fixtures/rules-corpus.json`, eightball-v1 subset); every
//! `RulesError` message is the TS text verbatim.
//!
//! v1 semantics (the TS doc block, ported as-is):
//! - Mechanical fouls: 3.1 scratch/cue off table; 3.2 no-contact + wrong
//!   first ball (group- and open-table-aware per 4.4, incl. the
//!   whole-group temporary claim); 3.3 no rail after contact; 3.5 ball
//!   driven off the table — the 8 EXCEPTED during play (its off-table is
//!   the 4.8(d) terminal instead), INCLUDED on the break (a 4.3(g) break
//!   foul; the 8 returns via applyDecision, WPA 4.7).
//! - Calls are MANDATORY on every non-break shot (4.6 via 1.7, strictest
//!   reading); the break carries none (4.3(a)). A fulfilled call — the
//!   called ball into the called pocket, nominee legally pocketable —
//!   continues the turn; while open, the CALLED ball assigns the groups
//!   (4.4; uncalled balls stay down either way).
//! - The 8 decides the rack (4.8(a)–(d), never on the break): a called,
//!   entitled, legal 8 wins; foul-while-potting / early / wrong pocket /
//!   driven off lose. "On the 8" and the open-table whole-group claim
//!   are evaluated at SHOT START (state.onTable) — the strict reading
//!   the corpus freezes.
//! - Break matrix (4.3): 8 pocketed → 4.3(e)/(f) option paths; any break
//!   foul → the 4.3(g),(h) accept-or-kitchen option; a legal pot
//!   continues the breaker; a dry break needs
//!   [`DRY_BREAK_RAIL_MINIMUM`] distinct object balls to a rail else the
//!   4.3(d) three-way option pends (`bad-break` rides the judgment as
//!   data — its remedy is the recorded option, NOT ball in hand). The
//!   break never wins/loses the rack and never assigns groups.
//! - Decisions 1–5 (share codec v4), all judgment-born except stalemate
//!   5 — an AGREEMENT (4.11 via 1.13) recorded without a pending
//!   judgment, guarded against pre-empting an open option; it re-racks
//!   for the ORIGINAL breaker.
//! - The 8 is the only ball ever spotted, only via decision resolutions
//!   (4.3(e)/(f) spot choices; break_foul after an 8-off break) — never
//!   directly from a judgment (4.7): every judgment's `respot` is empty.
//! - WPA 3.13 three-foul rule: 8-ball SELF-EXCLUDES it (P15
//!   `FoulCounterMode::Disabled` — permanently off, not a config toggle;
//!   no counter exists in the state).
//!
//! Primitives composed (the feature data-model §2 usage row): P1 scan (default
//! config: cue pinned at id 0), P3 group/open-table first-contact
//! legality (split codes: `no-contact` folds the rail question away),
//! P4 rail-after-contact, P5 call fulfillment + terminal-pocket match,
//! P6 dry-break distinct-object-rail count (WPA 4.3(d)), P8 off-table
//! (8 excepted in play), P9 cue scratch, P11 cited fouls, P13
//! decision-gated respot (numerical sort on the 8's return), P16
//! decision liturgy (ids 1–5), P17 terminal, P18 turn/seat, P20 foul
//! context.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::RulesError;
use crate::judgment::{
    Chooser, CitedFoul, DecisionRequired, Judgment, PlacementRight, SeatPair,
    Terminal, Turn,
};
use crate::primitives::{
    contact, decisions, fouls as fouls_mod, fouls::Fouls, pockets,
    respot_chain, scan, terminal as term, turn,
};
use crate::rulesets::registry::{CatalogEntry, DecisionRow, RulesetEntry};
use crate::wire;

/// WPA 4.3(d): a dry break must drive at least four distinct object
/// balls to a rail (TS `EIGHTBALL_V1_CONFIG.dryBreakRailMinimum`).
pub const DRY_BREAK_RAIL_MINIMUM: i64 = 4;

// ---- pinned citation strings (the research notes R1 map, TS `CITE` verbatim) ------
// Standard-foul strings are byte-identical to the catalog foul_taxonomy
// (games/catalog.ts eight_ball entry); the *_BREAK variants reroute the
// remedy cite to the break-foul rule, which is what makes the placement
// right 'kitchen'.

const CITE_SCRATCH: &str = "WPA 3.1 via 4.9";
const CITE_SCRATCH_BREAK: &str = "WPA 3.1 via 4.3(g),(h)";
// no-contact cites 3.3 (issue #62 erratum, audit-8ball F1): the contact
// requirement is 3.3's first sentence; 3.2 Wrong Ball First presupposes
// a contact — and 4.3(b) removes any first-ball requirement on the break.
const CITE_NO_CONTACT: &str = "WPA 3.3 via 4.9";
const CITE_NO_CONTACT_BREAK: &str = "WPA 3.3 via 4.3(g),(h)";
const CITE_WRONG_FIRST: &str = "WPA 3.2 via 4.4/4.9";
const CITE_NO_RAIL: &str = "WPA 3.3 via 4.9";
const CITE_OFF_TABLE: &str = "WPA 3.5 via 4.9";
const CITE_OFF_TABLE_BREAK: &str = "WPA 3.5 via 4.3(g),(h)";
const CITE_BAD_BREAK: &str = "WPA 4.3(d)";
const CITE_WIN: &str = "WPA Sec. 4 intro; 4.6";
const CITE_LOSS_FOUL: &str = "WPA 4.8(a)";
const CITE_LOSS_EARLY: &str = "WPA 4.8(b)";
const CITE_LOSS_POCKET: &str = "WPA 4.8(c)";
const CITE_LOSS_OFF: &str = "WPA 4.8(d)";

/// The full 15-ball rack (TS `FULL_RACK`).
fn full_rack() -> Vec<i64> {
    (1..=15).collect()
}

/// Ball group per WPA 4.4 (TS `groupOf`): solids = 1–7, stripes = 9–15,
/// the 8 and out-of-range ids have none.
fn group_of(id: i64) -> Option<&'static str> {
    if (1..=7).contains(&id) {
        Some("solids")
    } else if (9..=15).contains(&id) {
        Some("stripes")
    } else {
        None
    }
}

/// Balls of `group` still on the table (TS `groupCount`).
fn group_count(group: &str, on_table: &[i64]) -> usize {
    on_table.iter().filter(|id| group_of(**id) == Some(group)).count()
}

/// Complete 8-ball match state (TS `EightBallMatchState`, frozen 011
/// shape). Serde declaration order = the TS `JSON.stringify` key order
/// the corpus pins: `phase, shooter, breaker, groups, onTable,
/// pendingDecision, result, foulContext`. The pending option reuses the
/// judgment's `{kind, chooser}` envelope (the TS `PendingDecision` and
/// `Judgment.decisionRequired` literals share that exact shape).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EightBallMatchState {
    pub phase: String,
    pub shooter: u8,
    pub breaker: u8,
    /// `null` until assigned by a fulfilled open-table call (WPA 4.4).
    pub groups: Option<SeatPair<String>>,
    #[serde(rename = "onTable")]
    pub on_table: Vec<i64>,
    #[serde(rename = "pendingDecision")]
    pub pending_decision: Option<DecisionRequired>,
    pub result: Option<Terminal>,
    #[serde(rename = "foulContext")]
    pub foul_context: Option<fouls_mod::FoulContext>,
}

/// HUD projection (TS `hudState` literal order): the state fields plus
/// the derived `onEight` per-seat flags and the `openClaim` bool; the
/// foul-context envelope re-orders to `{by, fouls}` (the TS hud clone
/// lists `by` first, unlike the state's `{fouls, by}`).
#[derive(Serialize)]
struct EightBallHud {
    phase: String,
    shooter: u8,
    breaker: u8,
    groups: Option<SeatPair<String>>,
    #[serde(rename = "onTable")]
    on_table: Vec<i64>,
    #[serde(rename = "pendingDecision")]
    pending_decision: Option<DecisionRequired>,
    result: Option<Terminal>,
    #[serde(rename = "foulContext")]
    foul_context: Option<EightBallHudFoulContext>,
    #[serde(rename = "onEight")]
    on_eight: Option<SeatPair<bool>>,
    #[serde(rename = "openClaim")]
    open_claim: bool,
}

/// The hud's `{by, fouls}` envelope key order (TS hudState literal).
#[derive(Serialize)]
struct EightBallHudFoulContext {
    by: i64,
    fouls: Vec<CitedFoul>,
}

/// The registry entry (`src/rulesets/registry.rs` REGISTRY row).
pub static ENTRY: RulesetEntry = RulesetEntry {
    id: "eightball-v1",
    initial_state,
    judge,
    apply_decision,
    hud_state,
    catalog,
};

fn parse_state(json: &str) -> Result<EightBallMatchState, RulesError> {
    serde_json::from_str(json)
        .map_err(|e| RulesError::BadState(format!("eightball-v1 state: {e}")))
}

fn state_json(state: &EightBallMatchState) -> Result<String, RulesError> {
    serde_json::to_string(state).map_err(|e| {
        RulesError::BadState(format!("eightball-v1 state serialization: {e}"))
    })
}

/// TS `over` predicate, shared by judge/applyDecision guards.
fn is_over(state: &EightBallMatchState) -> bool {
    state.result.is_some() || state.phase == "over"
}

/// The pending kind for guard messages (only read when a pending option
/// exists — the guards fire on `Some`).
fn pending_kind(state: &EightBallMatchState) -> &str {
    state.pending_decision.as_ref().map_or("", |p| p.kind.as_str())
}

/// A judgment-born pending option (every eightball chooser is a seat).
fn pending(kind: &str, chooser: u8) -> DecisionRequired {
    DecisionRequired {
        kind: kind.to_string(),
        chooser: Chooser::Seat(chooser),
    }
}

/// TS `freshRack(breaker)`: fresh 15-ball rack at the break address. No
/// runtime seat validation (`1 | 2` is a TS type-level promise) —
/// ported as-is.
fn fresh_rack(breaker: u8) -> EightBallMatchState {
    EightBallMatchState {
        phase: "break".to_string(),
        shooter: breaker,
        breaker,
        groups: None,
        on_table: full_rack(),
        pending_decision: None,
        result: None,
        foul_context: None,
    }
}

fn initial_state(breaker: u8) -> Result<String, RulesError> {
    state_json(&fresh_rack(breaker))
}

/// The state's onTable with the 8 spotted back (TS `withEightSpotted`,
/// WPA 4.7 — the only ball ever spotted in 8-ball; the physical
/// foot-spot/long-string placement is the adapter's respot.ts geometry).
/// P13 decision-gated respot: this runs ONLY from applyDecision.
fn with_eight_spotted(on_table: &[i64]) -> Vec<i64> {
    if on_table.contains(&8) {
        return on_table.to_vec();
    }
    let mut ids = on_table.to_vec();
    ids.push(8);
    respot_chain::sort_numeric(ids)
}

/// The recorded per-shot call after the judge's gates (TS
/// `NonNullable<ShotCall>`): an explicit `{kind:'call', ball, pocket}`
/// or any other kind — the TS body only ever branches on
/// `kind === 'call'`, so a safety (and a stray `nominate`) judge alike.
enum CallInput {
    Called { ball: i64, pocket: i64 },
    Other,
}

/// JS `String(x)` for the call-gate error interpolations (the TS
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

/// The TS call gate, verbatim message texts (corpus-pinned): a called
/// ball must be an on-table object ball (1–15, the 8 included), the
/// called pocket a non-negative kernel pocket index.
fn parse_call(call: &Value, state: &EightBallMatchState)
    -> Result<CallInput, RulesError> {
    if call.get("kind").and_then(Value::as_str) != Some("call") {
        return Ok(CallInput::Other);
    }
    let ball_v = call.get("ball");
    let ball = ball_v.and_then(Value::as_i64);
    if !matches!(ball, Some(b) if group_of(b).is_some() || b == 8) {
        return Err(RulesError::BadCall(format!(
            "eightball-v1: called ball {} is not an object ball (1-15)",
            js_string(ball_v)
        )));
    }
    let ball = ball.expect("gated above");
    if !state.on_table.contains(&ball) {
        return Err(RulesError::BadCall(format!(
            "eightball-v1: called ball {ball} is not on the table"
        )));
    }
    let pocket_v = call.get("pocket");
    match pocket_v.and_then(Value::as_i64) {
        Some(pocket) if pocket >= 0 => Ok(CallInput::Called { ball, pocket }),
        _ => Err(RulesError::BadCall(format!(
            "eightball-v1: called pocket {} is not a kernel pocket index",
            js_string(pocket_v)
        ))),
    }
}

// ---- judgment assembly (TS `Verdict` + `finishJudgment`) --------------------

struct Verdict {
    fouls: Fouls,
    ball_in_hand: PlacementRight,
    turn: Turn,
    decision: Option<DecisionRequired>,
    terminal: Option<Terminal>,
    next_phase: String,
    next_groups: Option<SeatPair<String>>,
}

fn finish_judgment(
    state: &EightBallMatchState, facts: &scan::ShotFacts, v: Verdict,
) -> Result<String, RulesError> {
    let pocketed = facts.pocketed_ids();
    let on_table: Vec<i64> = state
        .on_table
        .iter()
        .copied()
        .filter(|id| !pocketed.contains(id) && !facts.off_table.contains(id))
        .collect();
    // P18: pending rows keep the seat (the resolution assigns it);
    // terminal rows keep it too (don't-care); otherwise `turn` applies.
    let next_shooter = turn::resolve_seat(
        state.shooter, v.terminal.is_some(), v.decision.is_some(), v.turn);
    let legal = v.fouls.legal(); // P11 invariant
    // P20 foul context — `by` is always the judged shooter.
    let foul_context =
        fouls_mod::foul_context(v.fouls.as_slice(), i64::from(state.shooter));

    let judgment = Judgment {
        legal,
        fouls: v.fouls.into_vec(),
        pocketed,
        ball_in_hand: v.ball_in_hand,
        // 8-ball spots only the 8, only via decision resolutions — never
        // directly from a judgment (WPA 4.7): P13 decision-gated.
        respot: Vec::new(),
        turn: v.turn,
        decision_required: v.decision.clone(),
        terminal: v.terminal.clone(),
        next: EightBallMatchState {
            phase: if v.terminal.is_some() {
                "over".to_string()
            } else {
                v.next_phase
            },
            shooter: next_shooter,
            breaker: state.breaker,
            groups: v.next_groups,
            on_table,
            pending_decision: v.decision,
            result: v.terminal,
            foul_context,
        },
    };
    judgment.to_json()
}

// ---- break adjudication (WPA 4.3) --------------------------------------------

fn judge_break(state: &EightBallMatchState, facts: &scan::ShotFacts)
    -> Result<String, RulesError> {
    let breaker = state.shooter;
    let opp = turn::other(breaker);

    // break fouls, TS citation order: no contact with the rack, ANY
    // object ball driven off the table — the 8 included (3.5 via 4.3(g);
    // off-table balls stay out, 8 excepted — applyDecision('break_foul')
    // returns it, WPA 4.7), cue scratch/off table (4.3(g),(h)).
    let mut fouls = Fouls::new();
    if facts.first_contact.is_none() {
        fouls.push("no-contact", CITE_NO_CONTACT_BREAK);
    }
    if !facts.off_table.is_empty() {
        fouls.push("ball-off-table", CITE_OFF_TABLE_BREAK);
    }
    if facts.cue_scratch {
        fouls.push("scratch", CITE_SCRATCH_BREAK);
    }
    let break_foul = !fouls.is_empty();
    // 4.3(e)/(f) are the 8-POCKETED break branches only (T5/T6): an 8
    // driven off the table is a 4.3(g) break foul like any other object
    // ball — it rides the break_foul path, never the spot/re-break
    // option matrix (P5 terminal-pocket probe).
    let eight_gone = pockets::pocket_of(&facts.pocketed, 8).is_some();

    let mut v = Verdict {
        fouls,
        // 4.3(g),(h): break fouls grant the kitchen only, never anywhere
        ball_in_hand: if break_foul {
            PlacementRight::Kitchen
        } else {
            PlacementRight::None
        },
        turn: Turn::Pass,
        decision: None,
        // the break never wins or loses the rack (4.3 governs 4.8)
        terminal: None,
        next_phase: "open".to_string(),
        // the break NEVER assigns groups (4.3(c), 4.4)
        next_groups: None,
    };

    if eight_gone {
        // 4.3(e)/(f): the 8 on the break — spot/re-break option paths
        v.decision = Some(if break_foul {
            pending("eight_foul_break", opp) // 4.3(f)
        } else {
            pending("eight_legal_break", breaker) // 4.3(e)
        });
        v.turn = if break_foul { Turn::Pass } else { Turn::Continue };
        return finish_judgment(state, facts, v);
    }
    if break_foul {
        // T4: the opponent accepts the table or takes BIH in the kitchen
        v.decision = Some(pending("break_foul", opp)); // 4.3(g),(h)
        return finish_judgment(state, facts, v);
    }
    if !facts.pocketed.is_empty() {
        // T1: legal break pot — breaker continues (4.3(c))
        v.turn = Turn::Continue;
        return finish_judgment(state, facts, v);
    }
    if facts.object_rail_count >= DRY_BREAK_RAIL_MINIMUM {
        // T2: legal dry break (P6 distinct-object-rail count) — pass
        return finish_judgment(state, facts, v);
    }
    // T3: not an open break — the 4.3(d) three-way option for the
    // opponent. bad-break rides the judgment as data (FR-009 HUD/i18n);
    // its remedy is the recorded option, NOT ball in hand.
    let mut fouls = Fouls::new();
    fouls.push("bad-break", CITE_BAD_BREAK);
    v.fouls = fouls;
    v.decision = Some(pending("dry_break", opp));
    finish_judgment(state, facts, v)
}

// ---- open/grouped adjudication (WPA 4.4–4.6, 4.8, 4.9) ------------------------

fn judge_play(
    state: &EightBallMatchState, facts: &scan::ShotFacts, call: &CallInput,
) -> Result<String, RulesError> {
    let shooter = state.shooter;
    let opp = turn::other(shooter);
    let is_open = state.phase == "open";
    let shooter_group: Option<&str> = if is_open {
        None
    } else {
        state.groups.as_ref().map(|g| g.get(shooter).as_str())
    };

    // "on the 8" is DERIVED, evaluated at shot start (the feature data-model §4):
    // grouped with no ball of the shooter's group left. The open-table
    // temporary claim (4.4: a whole group pocketed while open) likewise.
    let on_eight = shooter_group
        .is_some_and(|g| group_count(g, &state.on_table) == 0);
    let open_claim = is_open
        && (group_count("solids", &state.on_table) == 0
            || group_count("stripes", &state.on_table) == 0);

    // P3: legal first contact (3.2, group-aware; 4.4: the 8 is never a
    // legal first contact while open, unless a whole group is down)
    let legal_first = |id: i64| -> bool {
        if id == 8 {
            return on_eight || open_claim;
        }
        if is_open {
            return true;
        }
        group_of(id) == shooter_group
    };

    let mut fouls = Fouls::new();
    for f in contact::check_first_contact(
        facts,
        legal_first,
        || Some(CitedFoul::new("no-contact", CITE_NO_CONTACT)),
        |_| Some(CitedFoul::new("wrong-first-ball", CITE_WRONG_FIRST)),
    ) {
        fouls.push(&f.code, &f.cite);
    }
    if facts.first_contact.is_some() && !facts.driven_after_contact {
        fouls.push("no-rail-after-contact", CITE_NO_RAIL);
    }
    // P8 with the 8 excepted: its off-table is the 4.8(d) terminal below
    if facts.off_table.iter().any(|id| *id != 8) {
        fouls.push("ball-off-table", CITE_OFF_TABLE);
    }
    if facts.cue_scratch {
        fouls.push("scratch", CITE_SCRATCH);
    }
    let foul = !fouls.is_empty();

    let mut v = Verdict {
        fouls,
        // standard fouls: 4.9 via 1.6 — ball in hand anywhere
        ball_in_hand: if foul {
            PlacementRight::Anywhere
        } else {
            PlacementRight::None
        },
        turn: Turn::Pass,
        decision: None,
        terminal: None,
        next_phase: state.phase.clone(),
        next_groups: state.groups.clone(),
    };

    // ---- the 8 decides the rack (4.8(a)–(d); never applicable to the
    // break). P5 terminal-pocket match: the call must name the pocket
    // the 8 actually dropped into.
    if let Some(eight_pocket) = pockets::pocket_of(&facts.pocketed, 8) {
        let called_eight = matches!(call,
            CallInput::Called { ball: 8, pocket } if *pocket == eight_pocket);
        let entitled = on_eight || open_claim; // may the shooter pot the 8?
        if !foul && entitled && called_eight {
            v.turn = Turn::Continue;
            v.terminal = Some(term::terminal(
                i64::from(shooter), "eight-ball-pocketed", CITE_WIN));
        } else if foul {
            // 4.8(a) — foul while pocketing the 8, listed first
            v.terminal = Some(term::terminal(
                i64::from(opp), "eight-with-foul", CITE_LOSS_FOUL));
        } else if !entitled {
            // 4.8(b) — before the shooter's group is cleared
            v.terminal = Some(term::terminal(
                i64::from(opp), "early-eight", CITE_LOSS_EARLY));
        } else {
            // 4.8(c) — uncalled pocket (incl. a safety-potted 8)
            v.terminal = Some(term::terminal(
                i64::from(opp), "eight-wrong-pocket", CITE_LOSS_POCKET));
        }
        v.ball_in_hand = PlacementRight::None; // the rack is over
        return finish_judgment(state, facts, v);
    }
    if facts.off_table.contains(&8) {
        // 4.8(d) — the 8 off the table loses outright
        v.terminal = Some(term::terminal(
            i64::from(opp), "eight-off-table", CITE_LOSS_OFF));
        v.ball_in_hand = PlacementRight::None;
        return finish_judgment(state, facts, v);
    }

    // ---- call fulfillment (4.5/4.6 via 1.7): the called ball into the
    // called pocket (P5), and the nominee must be a ball the shooter may
    // legally pocket — own group when assigned, any solid/stripe while
    // open; the 8 only through the terminal paths above
    if let CallInput::Called { ball, pocket } = call {
        let (ball, pocket) = (*ball, *pocket);
        let legal_target = is_open || group_of(ball) == shooter_group;
        let fulfilled = !foul && ball != 8 && legal_target
            && pockets::call_fulfilled(&facts.pocketed, ball, pocket);
        if fulfilled {
            v.turn = Turn::Continue;
            if is_open {
                // T7 (4.4): the CALLED ball assigns the groups —
                // both-group shots resolve by the call; uncalled balls
                // stay down either way
                let g = group_of(ball).expect("a non-8 called ball grouped");
                let g2 = if g == "solids" { "stripes" } else { "solids" };
                v.next_groups = Some(if shooter == 1 {
                    SeatPair::new(g.to_string(), g2.to_string())
                } else {
                    SeatPair::new(g2.to_string(), g.to_string())
                });
                v.next_phase = "grouped".to_string();
            }
        }
    }
    finish_judgment(state, facts, v)
}

/// TS `eightballRuleset.judge`, one pass (FR-008). Guard order is the TS
/// body order: match over → pending decision → the break/call gates.
/// Messages verbatim (corpus-pinned).
fn judge(state_json_in: &str, record_json: &str, call_json: &str)
    -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;

    term::guard_not_over(
        is_over(&state),
        "eightball-v1: judge called after the match ended (adapter contract)",
    )?;
    term::guard_no_pending(
        state.pending_decision.is_some(),
        format!(
            "eightball-v1: judge called while a rulebook decision is \
             pending ('{}') — resolve it via applyDecision",
            pending_kind(&state)
        ),
    )?;
    let call: Value = serde_json::from_str(call_json)
        .map_err(|e| RulesError::BadCall(format!("eightball-v1 call: {e}")))?;
    if state.phase == "break" {
        if !call.is_null() {
            return Err(RulesError::BadCall(
                "eightball-v1: the break shot carries no call (WPA 4.3(a))"
                    .to_string(),
            ));
        }
        let record = wire::parse_record(record_json)?;
        // P1 single pass, default config (cue pinned at id 0) — stream
        // position is causal order.
        let facts = scan::scan(&record, &scan::ScanConfig::default());
        return judge_break(&state, &facts);
    }
    if call.is_null() {
        return Err(RulesError::BadCall(
            "eightball-v1: every non-break shot requires a call or a \
             declared safety (WPA 4.6 via 1.7, strictest reading)"
                .to_string(),
        ));
    }
    let call = parse_call(&call, &state)?;
    let record = wire::parse_record(record_json)?;
    let facts = scan::scan(&record, &scan::ScanConfig::default());
    judge_play(&state, &facts, &call)
}

/// TS `applyDecision`: the P16 liturgy in the TS body order — post-match
/// guard → id lookup (unknown id) → choice range → the stalemate
/// agreement path (with its pre-emption guard) → pending-kind match →
/// resolution. Messages verbatim (corpus-pinned).
fn apply_decision(state_json_in: &str, decision_json: &str)
    -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    term::guard_not_over(
        is_over(&state),
        "eightball-v1: no decision can be applied after the match ended",
    )?;
    let d = decisions::parse_decision(decision_json)?;
    // share-codec-v4 ids 1–5 (TS `DECISION_KINDS`)
    let kind = match d.decision {
        1 => "dry_break",
        2 => "eight_legal_break",
        3 => "eight_foul_break",
        4 => "break_foul",
        5 => "stalemate",
        other => {
            return Err(decisions::unknown_id(format!(
                "eightball-v1: unknown decision id {other}"
            )));
        }
    };
    // TS `CHOICE_MAX`: dry_break 3, the break options 2, stalemate 1
    let choice_max = match kind {
        "dry_break" => 3,
        "stalemate" => 1,
        _ => 2,
    };
    decisions::check_choice(
        d.choice >= 1 && d.choice <= choice_max,
        format!("eightball-v1: choice {} out of range for '{kind}'", d.choice),
    )?;

    // stalemate (4.11 via 1.13) is an AGREEMENT, not a judged outcome:
    // recorded without a pending judgment decision (hot-seat: both
    // players confirm in the UI) — but it never pre-empts an open option
    if kind == "stalemate" {
        decisions::check_pending(
            !state.pending_decision.as_ref()
                .is_some_and(|p| p.kind != "stalemate"),
            format!(
                "eightball-v1: stalemate cannot pre-empt the pending '{}' \
                 option",
                pending_kind(&state)
            ),
        )?;
        // the ORIGINAL breaker re-breaks
        return state_json(&fresh_rack(state.breaker));
    }

    decisions::check_pending(
        state.pending_decision.as_ref().is_some_and(|p| p.kind == kind),
        format!(
            "eightball-v1: decision '{kind}' does not match the pending \
             option ('{}')",
            state.pending_decision.as_ref()
                .map_or("none", |p| p.kind.as_str())
        ),
    )?;
    // the CHOOSER recorded on the pending option takes the resolution
    // seat (TS reads it back rather than re-deriving it — ported as-is);
    // every eightball pending carries a seat (TS `1 | 2` type-level
    // promise), so `Both` is unreachable through any judgment.
    let chooser = match state.pending_decision.as_ref().map(|p| p.chooser) {
        Some(Chooser::Seat(n)) => n,
        _ => state.shooter,
    };

    match kind {
        "dry_break" => {
            // WPA 4.3(d)
            if d.choice == 1 {
                // accept the table as it lies
                return state_json(&EightBallMatchState {
                    shooter: chooser,
                    pending_decision: None,
                    ..state
                });
            }
            if d.choice == 2 {
                return state_json(&fresh_rack(chooser)); // chooser breaks
            }
            state_json(&fresh_rack(state.breaker)) // offender re-breaks
        }
        "eight_legal_break" => {
            // WPA 4.3(e) — the chooser is the breaker
            if d.choice == 1 {
                // spot the 8 and accept; breaker continues
                return state_json(&EightBallMatchState {
                    shooter: chooser,
                    on_table: with_eight_spotted(&state.on_table),
                    pending_decision: None,
                    ..state
                });
            }
            state_json(&fresh_rack(state.breaker)) // re-break, same breaker
        }
        "eight_foul_break" => {
            // WPA 4.3(f) — the chooser is the opponent
            if d.choice == 1 {
                // re-spot 8 + BIH kitchen (the right rode the judgment)
                return state_json(&EightBallMatchState {
                    shooter: chooser,
                    on_table: with_eight_spotted(&state.on_table),
                    pending_decision: None,
                    ..state
                });
            }
            state_json(&fresh_rack(chooser)) // opponent breaks
        }
        _ => {
            // 'break_foul' (WPA 4.3(g),(h)) — both choices seat the
            // opponent; kitchen-vs-as-it-lies is the ADAPTER's placement
            // application of the judgment's 'kitchen' right. An 8 driven
            // off on the break returns to the table under EITHER choice
            // (4.3(g): off-table balls stay out, except the 8; 4.7).
            state_json(&EightBallMatchState {
                shooter: chooser,
                on_table: with_eight_spotted(&state.on_table),
                pending_decision: None,
                ..state
            })
        }
    }
}

/// TS `hudState`: the state projection plus the derived `onEight` seat
/// flags and `openClaim`, with the re-ordered `{by, fouls}` foul-context
/// clone.
fn hud_state(state_json_in: &str) -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    let on_eight = if state.phase == "grouped" {
        state.groups.as_ref().map(|g| SeatPair::new(
            group_count(&g.one, &state.on_table) == 0,
            group_count(&g.two, &state.on_table) == 0,
        ))
    } else {
        None
    };
    let open_claim = state.phase == "open"
        && (group_count("solids", &state.on_table) == 0
            || group_count("stripes", &state.on_table) == 0);
    let hud = EightBallHud {
        phase: state.phase,
        shooter: state.shooter,
        breaker: state.breaker,
        groups: state.groups,
        on_table: state.on_table,
        pending_decision: state.pending_decision,
        result: state.result,
        foul_context: state.foul_context.map(|fc| EightBallHudFoulContext {
            by: fc.by,
            fouls: fc.fouls,
        }),
        on_eight,
        open_claim,
    };
    serde_json::to_string(&hud).map_err(|e| {
        RulesError::BadState(format!("eightball-v1 hud serialization: {e}"))
    })
}

/// Catalog row: foul codes/cites in the eight_ball catalog foul_taxonomy
/// order (games/catalog.ts — the standard cites; the break reroutes are
/// judgment data, not taxonomy rows), decisions 1–5 (share-codec v4),
/// the five terminal reasons in TS branch order, and the
/// `EIGHTBALL_V1_CONFIG` pure-data mirror (the T041 drift gate pins
/// against this — `threeFoulRule` is the P15 3.13 self-exclusion, frozen
/// false).
fn catalog() -> CatalogEntry {
    CatalogEntry {
        id: "eightball-v1",
        fouls: vec![
            CitedFoul::new("scratch", CITE_SCRATCH),
            CitedFoul::new("no-contact", CITE_NO_CONTACT),
            CitedFoul::new("wrong-first-ball", CITE_WRONG_FIRST),
            CitedFoul::new("no-rail-after-contact", CITE_NO_RAIL),
            CitedFoul::new("ball-off-table", CITE_OFF_TABLE),
            CitedFoul::new("bad-break", CITE_BAD_BREAK),
        ],
        decisions: vec![
            DecisionRow { id: 1, kind: "dry_break", choice_max: 3 },
            DecisionRow { id: 2, kind: "eight_legal_break", choice_max: 2 },
            DecisionRow { id: 3, kind: "eight_foul_break", choice_max: 2 },
            DecisionRow { id: 4, kind: "break_foul", choice_max: 2 },
            DecisionRow { id: 5, kind: "stalemate", choice_max: 1 },
        ],
        terminals: vec![
            "eight-ball-pocketed", "eight-with-foul", "early-eight",
            "eight-wrong-pocket", "eight-off-table",
        ],
        config: serde_json::json!({
            "callShot": "explicit",
            "breakFoulPlacement": "kitchen",
            "standardFoulPlacement": "anywhere",
            "dryBreakRailMinimum": DRY_BREAK_RAIL_MINIMUM,
            "threeFoulRule": false,
        }),
    }
}
