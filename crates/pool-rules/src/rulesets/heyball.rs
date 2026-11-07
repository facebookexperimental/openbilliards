// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `heyball-v1` (GH-491, build 18) — WPA Rules of Heyball, transcribed
//! from the pinned standalone rulebook: *Rules of Heyball*, effective
//! 2025-08-16 (wpapool.com `250816-Rules-of-Heyball.pdf`, sha256
//! `2b92dd50…` — pin + digest at
//! `docs/research/rules-audit/heyball-rulebook-pin.md`). Cites use
//! `WPA Heyball <chapter>.<rule>` (`II.6(c)`, `App-A 3.11`).
//!
//! Heyball vs the WPA 8-ball family (the composition deltas):
//! - NO call shot, ever — flukes count, the 8 included (II.11); the
//!   judge accepts only a null call. No called-safety, no tap-in, and
//!   concession is prohibited (II.23 — notModeled conduct).
//! - The table opens after the break REGARDLESS of pocketed balls
//!   (II.10.3); groups are fixed only by the first ball legally
//!   pocketed from the first-contact group (II.12.1). While open, the 8
//!   is never a legal first contact (II.10.1 — no WPA-4.4-style
//!   whole-group claim; interpretation I5 in the scenario wall covers
//!   the unreachable all-balls-down corner).
//! - Break legality gate: ≥ 4 object balls to cushions or any pot,
//!   else the II.6(c) three-way option with NO ball in hand.
//! - Break fouls grant ball in hand BEHIND the head string only, inside
//!   a three-way option (II.6(e)); the armed restriction (`kitchenBih`)
//!   judges the following stroke under II.8/App-A 3.11 (the
//!   fourteenone GH-371 kitchen grammar, Heyball cites).
//! - The 8 on the break is never a win/loss: spot-or-re-break option
//!   matrices (II.6(f)); a break miscue that never reaches the rack is
//!   the II.6(g) no-BIH option.
//! - Object balls driven off the table stay OUT (a foul, no respot —
//!   II.12.3 "legal disappearance" + II.17(e)); the 8 off the table
//!   loses the rack (II.20(c)).
//! - Frozen-to-cushion escape law (II.15.2): geometric address-frozen
//!   detection from the record's initial snapshot + table dims; the
//!   target's own cushion events never satisfy (interpretation I4).
//! - Loss-of-rack family II.20: 8-with-foul, 8-with-last-own-ball
//!   (I3), 8 off table, early 8.
//! - Alternating breaks (I.12) are the adapter's rack liturgy; the
//!   stalemate agreement re-racks for the ORIGINAL breaker (II.21).
//!
//! Primitives composed (the feature data-model §2 usage row): P1 scan (default
//! cue id 0, P21 head-string facts under `head_string_y`), P3
//! group/open-table first-contact legality, P4 rail-after-contact, P8
//! off-table (8 excepted in play — its off-table is the II.20(c)
//! terminal), P9 cue scratch, P11 cited fouls, P13 decision-gated
//! respot (the 8 only, numerical sort), P16 decision liturgy (ids
//! 18–23, appended past snooker-v2's 17), P17 terminal, P18 turn/seat,
//! P20 foul context, P21 kitchen facts (fourteenone precedent).
//!
//! Decision ids 18–23 (share-codec growth, GH-491): 18 illegal_break,
//! 19 break_foul, 20 eight_break_pot, 21 eight_break_foul,
//! 22 break_miscue, 23 stalemate (agreement — never judgment-born).

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
use crate::wire::{self, WireEventKind, WireRecord};

/// WPA Heyball II.6(c): a pot-less break must drive at least four
/// object balls to cushions.
pub const DRY_BREAK_RAIL_MINIMUM: i64 = 4;

/// Address-frozen tolerance (the snooker_geom `FROZEN_EPS` twin — the
/// P21 constant family; kernel-settled resting contacts park inside it).
const FROZEN_EPS: f64 = 1e-6;

// ---- pinned citation strings (heyball-rulebook-pin.md digest) ---------------

const CITE_SCRATCH: &str = "WPA Heyball II.17(a)";
const CITE_SCRATCH_BREAK: &str = "WPA Heyball II.17(a) via II.6(e)";
const CITE_NO_CONTACT: &str = "WPA Heyball II.17(b)";
const CITE_NO_CONTACT_BREAK: &str = "WPA Heyball II.6(g)";
const CITE_WRONG_FIRST: &str = "WPA Heyball II.17(b)";
const CITE_WRONG_FIRST_OPEN_EIGHT: &str = "WPA Heyball II.10.1 via II.17(b)";
const CITE_NO_RAIL: &str = "WPA Heyball II.12.2";
const CITE_OFF_TABLE: &str = "WPA Heyball II.17(e) via II.12.3";
const CITE_OFF_TABLE_BREAK: &str = "WPA Heyball II.17(e) via II.6(e)";
const CITE_ILLEGAL_BREAK: &str = "WPA Heyball II.6(c)";
const CITE_FROZEN_CUSHION: &str = "WPA Heyball II.15.2";
const CITE_KITCHEN: &str = "WPA Heyball II.8 via II.17(i)";
const CITE_KITCHEN_NO_EXIT: &str = "WPA Heyball App-A 3.11";
const CITE_WIN: &str = "WPA Heyball II.2";
const CITE_LOSS_FOUL: &str = "WPA Heyball II.20(a)";
const CITE_LOSS_LAST: &str = "WPA Heyball II.20(b)";
const CITE_LOSS_OFF: &str = "WPA Heyball II.20(c)";
const CITE_LOSS_EARLY: &str = "WPA Heyball II.20(d)";

/// The full 15-ball rack.
fn full_rack() -> Vec<i64> {
    (1..=15).collect()
}

/// Ball group (II.4/II.12.1): solids 1–7, stripes 9–15.
fn group_of(id: i64) -> Option<&'static str> {
    if (1..=7).contains(&id) {
        Some("solids")
    } else if (9..=15).contains(&id) {
        Some("stripes")
    } else {
        None
    }
}

/// Balls of `group` still on the table.
fn group_count(group: &str, on_table: &[i64]) -> usize {
    on_table.iter().filter(|id| group_of(**id) == Some(group)).count()
}

/// Complete heyball match state. Serde declaration order IS the byte
/// contract the slice freezes: `phase, shooter, breaker, groups,
/// onTable, pendingDecision, result, foulContext, kitchenBih` (the
/// eightball-v1 field run + the fourteenone `kitchenBih` flag appended
/// last).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeyballMatchState {
    pub phase: String,
    pub shooter: u8,
    pub breaker: u8,
    /// `null` until fixed by the first legal first-contact-group pot
    /// (II.12.1); the break NEVER assigns groups (II.10.3).
    pub groups: Option<SeatPair<String>>,
    #[serde(rename = "onTable")]
    pub on_table: Vec<i64>,
    #[serde(rename = "pendingDecision")]
    pub pending_decision: Option<DecisionRequired>,
    pub result: Option<Terminal>,
    #[serde(rename = "foulContext")]
    pub foul_context: Option<fouls_mod::FoulContext>,
    /// The next stroke plays from ball in hand behind the head string
    /// (II.8) — armed ONLY by the break-foul decision resolutions
    /// (19/21 choice 1), cleared by the next judged stroke.
    #[serde(rename = "kitchenBih", default)]
    pub kitchen_bih: bool,
}

/// HUD projection: the state fields plus derived `onEight` per-seat
/// flags and `openClaim` (a whole group down while open — informational
/// in Heyball: it never licenses the 8, II.10.1).
#[derive(Serialize)]
struct HeyballHud {
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
    foul_context: Option<HeyballHudFoulContext>,
    #[serde(rename = "kitchenBih")]
    kitchen_bih: bool,
    #[serde(rename = "onEight")]
    on_eight: Option<SeatPair<bool>>,
    #[serde(rename = "openClaim")]
    open_claim: bool,
}

/// The hud's `{by, fouls}` envelope key order (eightball precedent).
#[derive(Serialize)]
struct HeyballHudFoulContext {
    by: i64,
    fouls: Vec<CitedFoul>,
}

/// The registry entry (registry.rs REGISTRY row, appended LAST).
pub static ENTRY: RulesetEntry = RulesetEntry {
    id: "heyball-v1",
    initial_state,
    judge,
    apply_decision,
    hud_state,
    catalog,
};

fn parse_state(json: &str) -> Result<HeyballMatchState, RulesError> {
    serde_json::from_str(json)
        .map_err(|e| RulesError::BadState(format!("heyball-v1 state: {e}")))
}

fn state_json(state: &HeyballMatchState) -> Result<String, RulesError> {
    serde_json::to_string(state).map_err(|e| {
        RulesError::BadState(format!("heyball-v1 state serialization: {e}"))
    })
}

fn is_over(state: &HeyballMatchState) -> bool {
    state.result.is_some() || state.phase == "over"
}

fn pending_kind(state: &HeyballMatchState) -> &str {
    state.pending_decision.as_ref().map_or("", |p| p.kind.as_str())
}

/// A judgment-born pending option (every heyball chooser is a seat).
fn pending(kind: &str, chooser: u8) -> DecisionRequired {
    DecisionRequired {
        kind: kind.to_string(),
        chooser: Chooser::Seat(chooser),
    }
}

/// Fresh 15-ball rack at the break address. The rack pattern itself
/// (8 centred, one solid + one stripe at each base corner, II.4) is the
/// adapter's lattice; the alternating break order (I.12) is the
/// adapter's rack liturgy — this crate seats whoever it is told.
fn fresh_rack(breaker: u8) -> HeyballMatchState {
    HeyballMatchState {
        phase: "break".to_string(),
        shooter: breaker,
        breaker,
        groups: None,
        on_table: full_rack(),
        pending_decision: None,
        result: None,
        foul_context: None,
        kitchen_bih: false,
    }
}

fn initial_state(breaker: u8) -> Result<String, RulesError> {
    state_json(&fresh_rack(breaker))
}

/// The state's onTable with the 8 spotted back (II.6(f)/II.7 — the 8 is
/// the only ball heyball ever spots, only via decision resolutions; the
/// physical foot-spot placement is the adapter's respot geometry).
fn with_eight_spotted(on_table: &[i64]) -> Vec<i64> {
    if on_table.contains(&8) {
        return on_table.to_vec();
    }
    let mut ids = on_table.to_vec();
    ids.push(8);
    respot_chain::sort_numeric(ids)
}

// ---- judgment assembly (the eightball Verdict shape) --------------------------

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
    state: &HeyballMatchState, facts: &scan::ShotFacts, v: Verdict,
) -> Result<String, RulesError> {
    let pocketed = facts.pocketed_ids();
    let on_table: Vec<i64> = state
        .on_table
        .iter()
        .copied()
        .filter(|id| !pocketed.contains(id) && !facts.off_table.contains(id))
        .collect();
    let next_shooter = turn::resolve_seat(
        state.shooter, v.terminal.is_some(), v.decision.is_some(), v.turn);
    let legal = v.fouls.legal(); // P11 invariant
    let foul_context =
        fouls_mod::foul_context(v.fouls.as_slice(), i64::from(state.shooter));

    let judgment = Judgment {
        legal,
        fouls: v.fouls.into_vec(),
        pocketed,
        ball_in_hand: v.ball_in_hand,
        // heyball spots only the 8, only via decision resolutions —
        // never directly from a judgment: every judgment's respot is
        // empty (II.12.3: everything else stays down).
        respot: Vec::new(),
        turn: v.turn,
        decision_required: v.decision.clone(),
        terminal: v.terminal.clone(),
        next: HeyballMatchState {
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
            // the II.8 restriction covers exactly one judged stroke;
            // only decision resolutions arm it
            kitchen_bih: false,
        },
    };
    judgment.to_json()
}

// ---- break adjudication (WPA Heyball II.6) --------------------------------------

fn judge_break(state: &HeyballMatchState, facts: &scan::ShotFacts)
    -> Result<String, RulesError> {
    let breaker = state.shooter;
    let opp = turn::other(breaker);

    // break fouls (II.6(e) family): any object ball driven off the
    // table, cue scratch/off table. The 8 is EXCLUDED here exactly like
    // the play path (review r8 P2 — pin doc: "an object ball OTHER THAN
    // the 8 coming to rest off the table"): its sole consequence is the
    // II.20(c) terminal below, never foul metadata.
    let mut fouls = Fouls::new();
    if facts.off_table.iter().any(|id| *id != 8) {
        fouls.push("ball-off-table", CITE_OFF_TABLE_BREAK);
    }
    if facts.cue_scratch {
        fouls.push("scratch", CITE_SCRATCH_BREAK);
    }
    let break_foul = !fouls.is_empty();
    let eight_gone = pockets::pocket_of(&facts.pocketed, 8).is_some();

    let mut v = Verdict {
        fouls,
        // II.6(e): break fouls grant the kitchen only, never anywhere
        ball_in_hand: if break_foul {
            PlacementRight::Kitchen
        } else {
            PlacementRight::None
        },
        turn: Turn::Pass,
        decision: None,
        // the break never wins or loses the rack through the II.6(f)
        // POCKETED-8 matrices; the DRIVEN-OFF 8 is the II.20(c)
        // terminal below (re-pinned I2, review r2)
        terminal: None,
        next_phase: "open".to_string(),
        // the break NEVER assigns groups (II.10.3)
        next_groups: None,
    };

    // II.20(c)/(e): the 8 driven OFF the table loses the rack outright,
    // break included (re-pinned I2, review r2: II.20(a) carries an
    // explicit break carve-out and (c) does not; II.6(f) covers only
    // the POCKETED 8; II.20(e) is absolute once the 8 leaves the
    // table). A terminal is never a decision — checked before every
    // option matrix.
    if facts.off_table.contains(&8) {
        v.terminal = Some(term::terminal(
            i64::from(opp), "eight-off-table", CITE_LOSS_OFF));
        v.ball_in_hand = PlacementRight::None;
        return finish_judgment(state, facts, v);
    }

    if facts.first_contact.is_none() {
        // I1 / II.6(g): the cue never reached the rack — the TWO-way
        // re-break option, NO ball in hand. Checked BEFORE the II.6(e)
        // family (review r6 P2): (g)'s "may ONLY choose" governs
        // whenever the rack was never contacted, even when the miscue
        // also scratched the cue — the scratch rides the judgment as
        // recorded data alongside `no-contact`, its BIH remedy
        // displaced by the option. (No other ball can move without a
        // first contact, so `eight_gone`/off-table cannot pend here.)
        v.fouls.push("no-contact", CITE_NO_CONTACT_BREAK);
        v.ball_in_hand = PlacementRight::None;
        v.decision = Some(pending("break_miscue", opp));
        return finish_judgment(state, facts, v);
    }
    if eight_gone {
        // II.6(f): the 8 on the break — spot/re-break option matrices
        v.decision = Some(if break_foul {
            pending("eight_break_foul", opp)
        } else {
            pending("eight_break_pot", breaker)
        });
        v.turn = if break_foul { Turn::Pass } else { Turn::Continue };
        return finish_judgment(state, facts, v);
    }
    if break_foul {
        // II.6(e): the opponent's three-way option (kitchen BIH rides
        // choice 1's resolution)
        v.decision = Some(pending("break_foul", opp));
        return finish_judgment(state, facts, v);
    }
    if !facts.pocketed.is_empty() {
        // II.6(c): a pot legalizes the break; the breaker continues on
        // the open table (II.10.1)
        v.turn = Turn::Continue;
        return finish_judgment(state, facts, v);
    }
    if facts.object_rail_count >= DRY_BREAK_RAIL_MINIMUM {
        // legal pot-less break — the turn passes, table open
        return finish_judgment(state, facts, v);
    }
    // II.6(c): an illegal break — the opponent's three-way option, NO
    // ball in hand; `illegal-break` rides the judgment as data.
    let mut fouls = Fouls::new();
    fouls.push("illegal-break", CITE_ILLEGAL_BREAK);
    v.fouls = fouls;
    v.decision = Some(pending("illegal_break", opp));
    finish_judgment(state, facts, v)
}

// ---- frozen-to-cushion (WPA Heyball II.15.2) --------------------------------------

/// A rail plane: `(x_axis, sign)` — the `sign * half-dim` plane on the
/// x (width) or y (length) axis.
type RailPlane = (bool, f64);

/// Centre-to-plane distance of pose `(x, y)` from `plane` on a `w×l`
/// table.
fn plane_dist(plane: RailPlane, w: f64, l: f64, x: f64, y: f64) -> f64 {
    let (on_x, sign) = plane;
    let (half, c) = if on_x { (w / 2.0, x) } else { (l / 2.0, y) };
    half - sign * c
}

/// The rail planes the first-contacted ball's ADDRESS position sat a
/// radius off (empty = unfrozen; geometric detection from the record's
/// initial snapshot; 0.0 table dims disable the test — the fourteenone
/// zone precedent). PLANE-only by pinned scope I6: the wire serializes
/// no pocket-jaw arc geometry, so a jaw-frozen address is not
/// representable here and stays under plain II.12.2 (follow-up issue
/// GH-503 tracks the wire growth; review r1 P2).
fn address_frozen_planes(record: &WireRecord, ball: i64) -> Vec<RailPlane> {
    let w = record.initial.table.width;
    let l = record.initial.table.length;
    if w <= 0.0 || l <= 0.0 {
        return Vec::new();
    }
    let Some(b) = record.initial.balls.iter().find(|b| b.id == ball) else {
        return Vec::new();
    };
    let (x, y, r) = (b.state.pos.x, b.state.pos.y, b.params.r);
    [(true, 1.0), (true, -1.0), (false, 1.0), (false, -1.0)]
        .into_iter()
        .filter(|&p| plane_dist(p, w, l, x, y) - r <= FROZEN_EPS)
        .collect()
}

/// II.15.2 satisfied: AFTER the striker's first ball contact, a ball
/// was pocketed, a ball OTHER than the frozen target contacted a
/// cushion, or the frozen target itself contacted a cushion once its
/// DEPARTURE from the frozen cushion is on the wire (amended
/// interpretation I4, review r1+r2): any post-contact event pose of the
/// target standing clear of every address-frozen rail plane — daylight
/// above `FROZEN_EPS`, at the cushion contact itself (a cross-table
/// bank) or at ANY earlier event (a deflection collision's pose before
/// a same-rail return) — proves the rulebook's own first arm, "the
/// ball must leave the cushion and re-contact a cushion". With no such
/// proof the strict reading holds (riding the same cushion is
/// indistinguishable). Pre-contact cushion work never counts.
fn frozen_escape_satisfied(
    record: &WireRecord, frozen: i64, planes: &[RailPlane],
) -> bool {
    let w = record.initial.table.width;
    let l = record.initial.table.length;
    let r = record.initial.balls.iter().find(|b| b.id == frozen)
        .map_or(0.0, |b| b.params.r);
    let clear_of_frozen = |x: f64, y: f64| -> bool {
        planes.iter()
            .all(|&p| plane_dist(p, w, l, x, y) - r > FROZEN_EPS)
    };
    let mut contacted = false;
    let mut departed = false;
    for ev in &record.events {
        // the target's post pose at THIS event, clear of every frozen
        // plane = the departure fact
        let pose_clear = ev.post.iter()
            .find(|(id, _)| *id == frozen)
            .is_some_and(|(_, s)| clear_of_frozen(s.pos.x, s.pos.y));
        match &ev.kind {
            WireEventKind::BallBall { b1, b2 }
                if !contacted && (*b1 == 0 || *b2 == 0) => {
                contacted = true;
            }
            WireEventKind::BallPocket { .. } if contacted => return true,
            WireEventKind::BallLinearCushion { ball }
            | WireEventKind::BallCircularCushion { ball }
                if contacted
                    && (*ball != frozen || departed || pose_clear) => {
                return true;
            }
            _ => {}
        }
        if contacted && pose_clear {
            departed = true;
        }
    }
    false
}

// ---- open/grouped adjudication (II.10, II.12, II.15, II.17, II.20) -----------------

fn judge_play(
    state: &HeyballMatchState, facts: &scan::ShotFacts, record: &WireRecord,
    kitchen_stroke: bool,
) -> Result<String, RulesError> {
    let shooter = state.shooter;
    let opp = turn::other(shooter);
    let is_open = state.phase == "open";
    let shooter_group: Option<&str> = if is_open {
        None
    } else {
        state.groups.as_ref().map(|g| g.get(shooter).as_str())
    };

    // "on the 8" is DERIVED, evaluated at shot start: grouped with no
    // ball of the shooter's group left (II.12.1).
    let on_eight = shooter_group
        .is_some_and(|g| group_count(g, &state.on_table) == 0);
    // I5 escape: while open with NO non-8 object ball left, the 8
    // becomes the only contactable ball (fair-play I.7 — unreachable in
    // ordinary play, guarded against a soft-lock).
    let open_bare_eight = is_open
        && !state.on_table.iter().any(|id| group_of(*id).is_some());

    // first-contact legality (II.10.1, II.12.1)
    let legal_first = |id: i64| -> bool {
        if id == 8 {
            return on_eight || open_bare_eight;
        }
        if is_open {
            return true;
        }
        group_of(id) == shooter_group
    };

    let mut fouls = Fouls::new();
    let open_eight_first = is_open
        && matches!(facts.first_contact, Some(c) if c.ball == 8)
        && !open_bare_eight;
    for f in contact::check_first_contact(
        facts,
        legal_first,
        || Some(CitedFoul::new("no-contact", CITE_NO_CONTACT)),
        |_| Some(CitedFoul::new(
            "wrong-first-ball",
            if open_eight_first {
                CITE_WRONG_FIRST_OPEN_EIGHT
            } else {
                CITE_WRONG_FIRST
            },
        )),
    ) {
        fouls.push(&f.code, &f.cite);
    }
    // rail-after-contact: the frozen-target law supersedes the plain
    // II.12.2 check when the first contact was address-frozen to a rail
    if let Some(c) = facts.first_contact {
        let frozen_planes = address_frozen_planes(record, c.ball);
        if !frozen_planes.is_empty() {
            if !frozen_escape_satisfied(record, c.ball, &frozen_planes) {
                fouls.push("frozen-cushion-escape", CITE_FROZEN_CUSHION);
            }
        } else if facts.pocketed.is_empty()
            && facts.object_rail_count == 0
            && !facts.striker_rail_after_contact
        {
            // II.12.2's letter (review r5 P2): "if no OBJECT ball is
            // pocketed, at least one ball (including the cue ball) must
            // CONTACT A CUSHION" — the generic driven_after_contact
            // fact counts the striker's own BallPocket as driven (the
            // WPA-2.7 equivalence the OTHER rulebooks carry), so a
            // contact-then-scratch with no cushion wrongly escaped the
            // rail foul. This rulebook has no such equivalence clause:
            // an object pot or a post-contact cushion contact (by
            // anyone) are the only satisfactions.
            fouls.push("no-rail-after-contact", CITE_NO_RAIL);
        }
    }
    // P8 with the 8 excepted: its off-table is the II.20(c) terminal
    if facts.off_table.iter().any(|id| *id != 8) {
        fouls.push("ball-off-table", CITE_OFF_TABLE);
    }
    if facts.cue_scratch {
        fouls.push("scratch", CITE_SCRATCH);
    }
    // II.8 via II.17(i) (the fourteenone GH-371 kitchen grammar): first
    // contact behind the head string without the cue crossing first…
    let bad_kitchen = kitchen_stroke
        && facts.first_contact_in_kitchen
        && !facts.cue_crossed_head_string_before_contact;
    if bad_kitchen {
        fouls.push("bad-kitchen-shot", CITE_KITCHEN);
    }
    // …else App-A 3.11 ¶2: the stroke neither crossed the string nor
    // contacted a ball on/past it (App-A 3 chapeau: one foul per law —
    // the direct-kitchen-contact case reports only the ¶1 code).
    if kitchen_stroke
        && !bad_kitchen
        && !facts.cue_crossed_head_string
        && !facts.cue_contacted_ball_past_head_string
    {
        fouls.push("kitchen-no-exit", CITE_KITCHEN_NO_EXIT);
    }
    let foul = !fouls.is_empty();

    let mut v = Verdict {
        fouls,
        // standard fouls: ball in hand anywhere (II.9/II.17)
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

    // ---- the 8 decides the rack (II.2, II.20) — never on the break
    if pockets::pocket_of(&facts.pocketed, 8).is_some() {
        let entitled = on_eight || open_bare_eight;
        if !foul && entitled {
            // II.2 + II.11: no pocket designation exists — a legal 8
            // pot wins, flukes included
            v.turn = Turn::Continue;
            v.terminal = Some(term::terminal(
                i64::from(shooter), "eight-ball-pocketed", CITE_WIN));
        } else if foul {
            // II.20(a) — foul while pocketing the 8
            v.terminal = Some(term::terminal(
                i64::from(opp), "eight-with-foul", CITE_LOSS_FOUL));
        } else {
            // II.20(b)/(d): the 8 with the last own ball on one stroke
            // (I3), else early
            let last_ball = shooter_group.is_some_and(|g| {
                group_count(g, &state.on_table) > 0
                    && state.on_table.iter().all(|id| {
                        group_of(*id) != Some(g)
                            || facts.pocketed_ids().contains(id)
                    })
            });
            v.terminal = Some(if last_ball {
                term::terminal(
                    i64::from(opp), "eight-with-last-ball", CITE_LOSS_LAST)
            } else {
                term::terminal(
                    i64::from(opp), "early-eight", CITE_LOSS_EARLY)
            });
        }
        v.ball_in_hand = PlacementRight::None; // the rack is over
        return finish_judgment(state, facts, v);
    }
    if facts.off_table.contains(&8) {
        // II.20(c) — the 8 off the table loses outright
        v.terminal = Some(term::terminal(
            i64::from(opp), "eight-off-table", CITE_LOSS_OFF));
        v.ball_in_hand = PlacementRight::None;
        return finish_judgment(state, facts, v);
    }

    // ---- turn continuation + open-table grouping (II.10.1, II.12.1);
    // fouls never assign groups and never continue
    if !foul && !facts.pocketed.is_empty() {
        if is_open {
            // any legal pot continues while open (II.10.1); grouping
            // completes per II.12.1 "Ball Grouping" VERBATIM: "if the
            // first ball shot or a ball from the same group as the
            // first ball shot is pocketed, the grouping is complete
            // ... and the table is closed" — the FIRST-CONTACT group,
            // pocketed. PIN HISTORY (review r8→r11, never flip-flop
            // again): r8 re-read II.10.3's GENERAL wording ("legally
            // pockets a ball from one of the group's first") as
            // pot-keyed and briefly assigned a slopped other-group
            // ball; r11 restored 12.1's operative mechanism — 10.3
            // names WHO/WHEN, 12.1 defines HOW. An other-group slop
            // stays down (II.10.2), table open. The II.10.4
            // simultaneous-contact choice is notModeled (the event
            // kernel never emits simultaneity).
            v.turn = Turn::Continue;
            if let Some(g) = facts.first_contact
                .and_then(|c| group_of(c.ball))
            {
                let potted_of_group = facts
                    .pocketed_ids()
                    .iter()
                    .any(|id| group_of(*id) == Some(g));
                if potted_of_group {
                    let g2 = if g == "solids" { "stripes" } else { "solids" };
                    v.next_groups = Some(if shooter == 1 {
                        SeatPair::new(g.to_string(), g2.to_string())
                    } else {
                        SeatPair::new(g2.to_string(), g.to_string())
                    });
                    v.next_phase = "grouped".to_string();
                }
            }
        } else {
            // closed table: continue only on an own-group pot (a
            // slopped opponent ball stays down and passes, II.11)
            let own_pot = shooter_group.is_some_and(|g| {
                facts.pocketed_ids().iter()
                    .any(|id| group_of(*id) == Some(g))
            });
            if own_pot {
                v.turn = Turn::Continue;
            }
        }
    }
    finish_judgment(state, facts, v)
}

/// One judged stroke. Guard order (the eightball body order): match
/// over → pending decision → the null-call gate → parse → scan.
fn judge(state_json_in: &str, record_json: &str, call_json: &str)
    -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;

    term::guard_not_over(
        is_over(&state),
        "heyball-v1: judge called after the match ended (adapter contract)",
    )?;
    term::guard_no_pending(
        state.pending_decision.is_some(),
        format!(
            "heyball-v1: judge called while a rulebook decision is \
             pending ('{}') — resolve it via applyDecision",
            pending_kind(&state)
        ),
    )?;
    let call: Value = serde_json::from_str(call_json)
        .map_err(|e| RulesError::BadCall(format!("heyball-v1 call: {e}")))?;
    if !call.is_null() {
        return Err(RulesError::BadCall(
            "heyball-v1: heyball is not a call-shot game — no shot \
             carries a call (WPA Heyball II.11)"
                .to_string(),
        ));
    }
    let record = wire::parse_record(record_json)?;
    if state.phase == "break" {
        let facts = scan::scan(&record, &scan::ScanConfig::default());
        return judge_break(&state, &facts);
    }
    // P21 head-string facts join when the record carries table
    // dimensions (0.0 disables — the fourteenone zone precedent).
    let table_l = record.initial.table.length;
    let hs_plane = if table_l > 0.0 { Some(-table_l / 4.0) } else { None };
    let facts = scan::scan(&record, &scan::ScanConfig {
        head_string_y: hs_plane,
        ..scan::ScanConfig::default()
    });
    // II.8: judged on strokes that began from the armed kitchen grant
    // AND whose record shows the cue addressed strictly behind the line
    // (placement clamping stays adapter territory).
    let kitchen_stroke = state.kitchen_bih
        && hs_plane.is_some_and(|hs| {
            record
                .initial
                .balls
                .iter()
                .find(|b| b.id == 0)
                .is_some_and(|b| b.state.pos.y < hs)
        });
    judge_play(&state, &facts, &record, kitchen_stroke)
}

/// The P16 liturgy: post-match guard → id lookup → choice range → the
/// stalemate agreement path (with its pre-emption guard) → pending-kind
/// match → resolution.
fn apply_decision(state_json_in: &str, decision_json: &str)
    -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    term::guard_not_over(
        is_over(&state),
        "heyball-v1: no decision can be applied after the match ended",
    )?;
    let d = decisions::parse_decision(decision_json)?;
    // share-codec growth ids 18–23 (GH-491)
    let kind = match d.decision {
        18 => "illegal_break",
        19 => "break_foul",
        20 => "eight_break_pot",
        21 => "eight_break_foul",
        22 => "break_miscue",
        23 => "stalemate",
        other => {
            return Err(decisions::unknown_id(format!(
                "heyball-v1: unknown decision id {other}"
            )));
        }
    };
    let choice_max = match kind {
        "illegal_break" | "break_foul" | "eight_break_foul" => 3,
        "stalemate" => 1,
        _ => 2,
    };
    decisions::check_choice(
        d.choice >= 1 && d.choice <= choice_max,
        format!("heyball-v1: choice {} out of range for '{kind}'", d.choice),
    )?;

    // stalemate (II.21) is an AGREEMENT, never judgment-pending — but
    // it cannot pre-empt an open option
    if kind == "stalemate" {
        decisions::check_pending(
            !state.pending_decision.as_ref()
                .is_some_and(|p| p.kind != "stalemate"),
            format!(
                "heyball-v1: stalemate cannot pre-empt the pending '{}' \
                 option",
                pending_kind(&state)
            ),
        )?;
        // II.21(a): the ORIGINAL breaker breaks again
        return state_json(&fresh_rack(state.breaker));
    }

    decisions::check_pending(
        state.pending_decision.as_ref().is_some_and(|p| p.kind == kind),
        format!(
            "heyball-v1: decision '{kind}' does not match the pending \
             option ('{}')",
            state.pending_decision.as_ref()
                .map_or("none", |p| p.kind.as_str())
        ),
    )?;
    // the CHOOSER recorded on the pending option takes the resolution
    // seat; every heyball pending carries a seat
    let chooser = match state.pending_decision.as_ref().map(|p| p.chooser) {
        Some(Chooser::Seat(n)) => n,
        _ => state.shooter,
    };

    match kind {
        "illegal_break" => {
            // II.6(c) — NO ball in hand under any arm
            match d.choice {
                1 => state_json(&HeyballMatchState {
                    shooter: chooser,
                    pending_decision: None,
                    ..state
                }),
                2 => state_json(&fresh_rack(chooser)),
                _ => state_json(&fresh_rack(state.breaker)),
            }
        }
        "break_foul" => {
            // II.6(e) — kitchen BIH as it lies, or the re-rack arms;
            // an 8 driven off on the break returns under choice 1 (I2)
            match d.choice {
                1 => state_json(&HeyballMatchState {
                    shooter: chooser,
                    on_table: with_eight_spotted(&state.on_table),
                    pending_decision: None,
                    kitchen_bih: true,
                    ..state
                }),
                2 => state_json(&fresh_rack(chooser)),
                _ => state_json(&fresh_rack(state.breaker)),
            }
        }
        "eight_break_pot" => {
            // II.6(f) no-foul arm — the chooser is the breaker
            if d.choice == 1 {
                return state_json(&HeyballMatchState {
                    shooter: chooser,
                    on_table: with_eight_spotted(&state.on_table),
                    pending_decision: None,
                    ..state
                });
            }
            state_json(&fresh_rack(state.breaker))
        }
        "eight_break_foul" => {
            // II.6(f) foul arm — the chooser is the opponent
            match d.choice {
                1 => state_json(&HeyballMatchState {
                    shooter: chooser,
                    on_table: with_eight_spotted(&state.on_table),
                    pending_decision: None,
                    kitchen_bih: true,
                    ..state
                }),
                2 => state_json(&fresh_rack(chooser)),
                _ => state_json(&fresh_rack(state.breaker)),
            }
        }
        _ => {
            // 'break_miscue' (II.6(g)): fresh racks, no BIH
            if d.choice == 1 {
                return state_json(&fresh_rack(chooser));
            }
            state_json(&fresh_rack(state.breaker))
        }
    }
}

/// HUD projection: state + derived `onEight` / `openClaim`.
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
    let hud = HeyballHud {
        phase: state.phase,
        shooter: state.shooter,
        breaker: state.breaker,
        groups: state.groups,
        on_table: state.on_table,
        pending_decision: state.pending_decision,
        result: state.result,
        foul_context: state.foul_context.map(|fc| HeyballHudFoulContext {
            by: fc.by,
            fouls: fc.fouls,
        }),
        kitchen_bih: state.kitchen_bih,
        on_eight,
        open_claim,
    };
    serde_json::to_string(&hud).map_err(|e| {
        RulesError::BadState(format!("heyball-v1 hud serialization: {e}"))
    })
}

/// Catalog row: foul codes/cites, decisions 18–23 (share-codec growth),
/// the terminal reasons, and the pure-data config the TS drift gate
/// pins. `notModeled` is the honest-coverage inventory (tenball
/// precedent) — every row cites the clause it declines.
fn catalog() -> CatalogEntry {
    CatalogEntry {
        id: "heyball-v1",
        fouls: vec![
            CitedFoul::new("scratch", CITE_SCRATCH),
            CitedFoul::new("no-contact", CITE_NO_CONTACT),
            CitedFoul::new("wrong-first-ball", CITE_WRONG_FIRST),
            CitedFoul::new("no-rail-after-contact", CITE_NO_RAIL),
            CitedFoul::new("ball-off-table", CITE_OFF_TABLE),
            CitedFoul::new("frozen-cushion-escape", CITE_FROZEN_CUSHION),
            CitedFoul::new("bad-kitchen-shot", CITE_KITCHEN),
            CitedFoul::new("kitchen-no-exit", CITE_KITCHEN_NO_EXIT),
            CitedFoul::new("illegal-break", CITE_ILLEGAL_BREAK),
        ],
        decisions: vec![
            DecisionRow { id: 18, kind: "illegal_break", choice_max: 3 },
            DecisionRow { id: 19, kind: "break_foul", choice_max: 3 },
            DecisionRow { id: 20, kind: "eight_break_pot", choice_max: 2 },
            DecisionRow { id: 21, kind: "eight_break_foul", choice_max: 3 },
            DecisionRow { id: 22, kind: "break_miscue", choice_max: 2 },
            DecisionRow { id: 23, kind: "stalemate", choice_max: 1 },
        ],
        terminals: vec![
            "eight-ball-pocketed", "eight-with-foul", "eight-with-last-ball",
            "eight-off-table", "early-eight",
        ],
        config: serde_json::json!({
            "callShot": false,
            "openAfterBreak": "always",
            "breakFoulPlacement": "kitchen",
            "standardFoulPlacement": "anywhere",
            "dryBreakRailMinimum": DRY_BREAK_RAIL_MINIMUM,
            "jumpedBallsStayDown": true,
            "breakOrder": "alternate",
            "threeFoulRule": false,
            "notModeled": {
                "softBreakLadder": "WPA Heyball II.6(a) (referee discretion)",
                "intentionalFoul": "WPA Heyball II.18",
                "conductFouls":
                    "WPA Heyball II.17(c),(d),(f),(j),(k),(l)",
                "doubleHitPush": "WPA Heyball II.12.4-12.7, II.15.1",
                "jumpStrikeLegality":
                    "WPA Heyball II.16 (strike point is not on the wire)",
                "ballsSettling": "WPA Heyball II.14",
                "groupConfusionRerack": "WPA Heyball II.19",
                "simultaneousTwoGroupContact":
                    "WPA Heyball II.10.4/II.13 (kernel contact order is \
                     deterministic)",
                "kitchenRespotRequest": "WPA Heyball II.8 (re-spot request)",
                "handicapRemoval": "WPA Heyball II.12.9",
                "breakPlacementLadder":
                    "WPA Heyball II.6(d) (adapter clamps placement)",
                "concessionProhibited": "WPA Heyball II.23",
                "timeLimits": "WPA Heyball Ch. III",
            },
        }),
    }
}
