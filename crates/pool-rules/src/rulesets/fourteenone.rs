// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `fourteenone-v1` (feature 025, issue #65) — 14.1 Continuous Pool
//! (straight pool), transcribed from the repo's pinned WPA edition:
//! WPA Rules of Play (effective 2025-09-15), Section 7 (7.1–7.12), with
//! the shared Section 3 fouls via 7.9. The SEVENTH registered ruleset
//! (the sixth playable discipline) — appended to the registry
//! (the registry API contract §6 growth event) with the six existing id
//! slots byte-untouched. Output bytes are
//! frozen by the harvested `fourteenone` conformance slice
//! (`scripts/fixtures/rules-corpus-variants/wpa-14-1.json`) once it
//! lands; the legacy 430-case corpus is untouched.
//!
//! v1 semantics (per-rule map):
//! - 7.2 rack: fifteen in a triangle, apex on the foot spot; a 14-ball
//!   re-rack omits the apex ball. The WPA text mandates NO ball order —
//!   the SDK rack template (`fourteenone_wpa`) is a free seeded shuffle
//!   (the one-pocket 12.2 precedent).
//! - 7.3 opening break: cue in hand behind the head string; if no
//!   called ball is pocketed, the cue ball and two object balls must
//!   each be driven to a rail after the cue contacts the rack, else a
//!   BREAKING FOUL (7.10): −2 points and the non-breaking player's
//!   accept/re-break option — decision id 11 `break_violation`
//!   (share-codec additive; the option is REPEATABLE until the
//!   requirements are met or the table is accepted). "Driven to a rail"
//!   follows WPA 2.7: a pocketed or jumped ball counts. A simultaneous
//!   standard foul folds into the breaking foul (7.10) and does NOT step
//!   the consecutive-foul counter (7.11).
//! - 7.5 call shots: every non-break shot carries an explicit
//!   ball+pocket call (calls-axis kind 0) or a declared safety (kind 1);
//!   the break MAY carry one (7.3(b) "if no called ball is pocketed").
//! - 7.6/7.7 scoring: +1 per ball on a legally pocketed CALLED shot
//!   (every extra ball on that stroke counts too); balls pocketed on
//!   fouls, on safeties, or without the called ball dropping are
//!   spotted (ids only — XY geometry stays in the TS adapter, R7).
//!   Scores are cumulative `SeatPair<i64>` and MAY be negative.
//! - 7.4 the 14th ball: when a legal scoring stroke leaves exactly one
//!   object ball, the fourteen pocketed balls re-rack with the apex
//!   vacant, the fifteenth ball and the cue stay, and the shooter
//!   CONTINUES. The signal rides `next.phase = "rerack"` (the
//!   eightball-v2 `re_break` judged-form precedent — the frozen 9-key
//!   Judgment wire gains NOTHING) plus the `next.rerack` plan block.
//! - 7.8 special racking situations (Table 1): rack-area / head-spot /
//!   kitchen zone membership is judged CRATE-SIDE from the record's
//!   final poses under the R11 exact-ops float discipline (design
//!   decision, issue #65: crate-side keeps replays pure — the adapter
//!   only EXECUTES the plan; no calls-axis extension). The rack area is
//!   modeled as the triangle hull of the 15 lattice ball centres
//!   (apex `(0, l/4)`, rear corners `(±4r, l/4 + 4·√3·r)`) with a 2r
//!   interference margin — a documented transcription of "within or
//!   overlaps the outline of the rack". Records without table
//!   dimensions disable the zone tests (both balls read as
//!   non-interfering — lenient-wire fallback).
//! - 7.9 standard fouls (events-detectable subset): 3.1 scratch (cue
//!   in hand behind the head string), 3.3 no rail after contact
//!   (FOLDED with the complete miss, one-pocket precedent), 3.5 ball
//!   driven off the table (spotted). −1 point, cue stays otherwise,
//!   turn passes.
//! - 7.9 via 3.11 (GH-371 slice-repin event): on a non-break stroke
//!   that began with cue in hand behind the head string (the
//!   `kitchenBih` state flag — set by every judged kitchen grant: 3.1
//!   scratch, the 7.8 kitchen plan, the 7.11/7.3 break addresses, a
//!   scratched breaking foul carried through the accept-table choice —
//!   gated on the record's initial cue pose lying strictly behind the
//!   line), first contact with a ball also behind the head string
//!   without the cue crossing first is the ¶1 foul (`bad-kitchen-shot`,
//!   −1, cue stays); a stroke that neither crosses the head string nor
//!   contacts a ball on/past it is the ¶2 foul (`kitchen-no-exit`, −1,
//!   and the cue is in hand behind the head string for the incoming
//!   player per 3.11 ¶2 via 1.6). Break strokes are exempt: their
//!   failure modes fold into the 7.3(b)/7.10 breaking-foul option
//!   (standard fouls never stack on a breaking foul). Records without
//!   table dimensions disable the head-string facts (the 7.8-zone
//!   lenient fallback).
//! - 7.11 serious fouls: three consecutive STANDARD fouls = −1 (the
//!   third, as usual) then −15 more, counter reset to zero, all fifteen
//!   re-racked and the OFFENDER shoots under opening-break requirements
//!   (`next.phase = "break"`, judged-form — the adapter re-racks on it).
//! - Win: first to `target` points (7.4; section intro). Target is the
//!   022 `fourteenone` family config (75 | 100 | 125, default 100) and
//!   rides the state natively — the state IS the resolved config
//!   (carom `target` precedent), so no config-in-state variant block is
//!   needed for replay identity.
//! - NOT modeled in v1: 7.12 stalemate (lag re-break — hot-seat UI
//!   surface, no events to judge), 7.6's referee tight-rack assist,
//!   the non-events fouls of 7.9 (3.4/3.6–3.12/3.14/3.15 — 3.11 joined
//!   the judged set with GH-371), and the 7.11 two-fouls WARNING
//!   provision (the "on two fouls" notice owed between the second and
//!   third consecutive foul — a referee/UI surface, not a judged
//!   event; the counter itself IS judged). The behind-the-head-string
//!   spot-request relief (WPA 1.6 ¶2 via 7.9: with ALL object balls
//!   also behind the head string the ball nearest the string may be
//!   spotted at the shooter's request) is an ADAPTER placement
//!   affordance since GH-371 — implemented in `web/app/flow.js`
//!   (recorded on the share codec's moves axis; no judged events, the
//!   module keeps zero spot-request state), recorded in the preset's
//!   `adapter` section.
//! - Deliberate 2.7 transcription asymmetry (review note, frozen by the
//!   slice): on a NON-break stroke whose only post-contact event is an
//!   object ball leaving the table, P1's `driven_after_contact` does not
//!   count BallOffTable as "driven to a rail" (WPA 2.7 says a pocketed
//!   or jumped ball counts), so the stroke cites BOTH
//!   no-rail-after-contact AND ball-off-table — while the 7.3(b) break
//!   branch below unions `off_table` into its driven set. Score and
//!   legality are identical either way (one −1 standard foul, everything
//!   spots, turn passes; only the cited-fouls list differs — the
//!   onepocket.rs P4-folded note precedent for recording a deliberate
//!   transcription choice). The harvested slice freezes the two-cite
//!   bytes, so teaching the scan the 2.7 union on non-break strokes is a
//!   SLICE-REPIN event, never a silent fix.
//!
//! Primitives composed (the feature data-model §2 usage row): P1 scan (default
//! config + the two additive 14.1 facts: `striker_rail_after_contact`,
//! `object_rail_ids`), P4 folded no-contact/no-rail, P5
//! call-fulfillment, P6 object-rail set, P8 off-table, P9 cue scratch,
//! P11 cited fouls, P12 phase machine (break/play/rerack/over), P13
//! numeric-sorted respot ids, P15 tracked three-foul counter
//! (reset-on-legal; breaking fouls excluded), P16 decision liturgy
//! (id 11), P17 terminal, P18 turn/seat, P19 HUD projection
//! (`hud_state`), P20 foul context.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::RulesError;
use crate::judgment::{
    Chooser, DecisionRequired, Judgment, PlacementRight, SeatPair, Terminal,
    Turn,
};
use crate::primitives::{
    counters, decisions, fouls as fouls_mod, fouls::Fouls, pockets,
    respot_chain, scan, terminal as term, turn,
};
use crate::rulesets::registry::{CatalogEntry, DecisionRow, RulesetEntry};
use crate::task_config::FourteenOneVariantConfig;
use crate::wire;

// ---- pinned citation strings (WPA Rules of Play eff. 2025-09-15, Sec 7) ----

const CITE_SCRATCH: &str = "WPA 7.9 via 3.1";
const CITE_NO_RAIL: &str = "WPA 7.9 via 3.3";
const CITE_OFF_TABLE: &str = "WPA 7.9 via 3.5";
const CITE_KITCHEN: &str = "WPA 7.9 via 3.11";
const CITE_BREAKING: &str = "WPA 7.3(b)/7.10";
const CITE_THREE_FOULS: &str = "WPA 7.11 via 3.13";
const CITE_WIN: &str = "WPA 7.4";

/// The full 15-ball rack.
fn full_rack() -> Vec<i64> {
    (1..=15).collect()
}

/// A pending rulebook option (only `break_violation` ever pends).
/// Serde declaration order: `kind, chooser`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FourteenOnePending {
    pub kind: String,
    pub chooser: Chooser,
}

/// The judged 7.8 re-rack plan the adapter executes (Table 1
/// transcription). Present exactly while `phase == "rerack"`; the next
/// judgment clears it. All-string/int domain (no floats on the wire).
/// Serde declaration order: `kind, fifteenth, fifteenthSpot, cueSpot`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FourteenOneRerack {
    /// `"partial"` (14 re-racked, apex vacant) | `"full"` (all fifteen).
    pub kind: String,
    /// The break ball (fifteenth) id staying up on a partial re-rack;
    /// null on a full re-rack.
    pub fifteenth: Option<i64>,
    /// `"stays" | "head_spot" | "center_spot"` (partial) | `"racked"`
    /// (full — the fifteenth joins the rack).
    #[serde(rename = "fifteenthSpot")]
    pub fifteenth_spot: String,
    /// `"stays" | "kitchen" | "head_spot" | "center_spot"`.
    #[serde(rename = "cueSpot")]
    pub cue_spot: String,
}

/// Complete 14.1 match state. Serde declaration order IS the byte
/// contract the fourteenone conformance slice freezes: `phase, shooter,
/// breaker, scores, target, run, consecutiveFouls, rackCount, rerack,
/// onTable, pendingDecision, foulContext, result, kitchenBih` (the last
/// appended by the GH-371 slice-repin event; `#[serde(default)]` keeps
/// pre-371 states parsing).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FourteenOneMatchState {
    /// `"break" | "play" | "rerack" | "over"`.
    pub phase: String,
    pub shooter: u8,
    pub breaker: u8,
    /// Cumulative points (7.7; negatives legal).
    pub scores: SeatPair<i64>,
    /// Race-to target (022 `fourteenone` family; default 100).
    pub target: i64,
    /// The shooter's current run (points in the active visit).
    pub run: i64,
    #[serde(rename = "consecutiveFouls")]
    pub consecutive_fouls: SeatPair<i64>,
    /// Racks opened so far (fresh rack = 1; every re-rack increments).
    #[serde(rename = "rackCount")]
    pub rack_count: i64,
    /// The judged 7.8 plan while `phase == "rerack"` (else null).
    pub rerack: Option<FourteenOneRerack>,
    #[serde(rename = "onTable")]
    pub on_table: Vec<i64>,
    #[serde(rename = "pendingDecision")]
    pub pending_decision: Option<FourteenOnePending>,
    #[serde(rename = "foulContext")]
    pub foul_context: Option<fouls_mod::FoulContext>,
    pub result: Option<Terminal>,
    /// WPA 3.11 context (GH-371): the NEXT stroke begins with cue in
    /// hand behind the head string — set by every judged kitchen grant
    /// (3.1 scratch, the 7.8 kitchen plan, the 7.3(a)/7.11 break
    /// addresses, a scratched breaking foul). Appended LAST (additive;
    /// old states default `false`).
    #[serde(rename = "kitchenBih", default)]
    pub kitchen_bih: bool,
}

/// HUD projection: the state fields plus the re-ordered `{by, fouls}`
/// foul-context envelope (shipped-hud convention). Discriminator fields
/// for the app's hud router: `target` + `scores` + `rackCount` + `run`
/// (collides with none of the shipped projections: 8-ball keys on
/// `phase`+`groups`, one-pocket on `tallies`+`owed`, snooker on
/// `currentBreak`+`scores`, carom on `stage`+`points`).
#[derive(Serialize)]
struct FourteenOneHud {
    phase: String,
    shooter: u8,
    breaker: u8,
    scores: SeatPair<i64>,
    target: i64,
    run: i64,
    #[serde(rename = "consecutiveFouls")]
    consecutive_fouls: SeatPair<i64>,
    #[serde(rename = "rackCount")]
    rack_count: i64,
    rerack: Option<FourteenOneRerack>,
    #[serde(rename = "onTable")]
    on_table: Vec<i64>,
    #[serde(rename = "pendingDecision")]
    pending_decision: Option<FourteenOnePending>,
    result: Option<Terminal>,
    #[serde(rename = "foulContext")]
    foul_context: Option<FourteenOneHudFoulContext>,
}

/// The hud's `{by, fouls}` envelope key order.
#[derive(Serialize)]
struct FourteenOneHudFoulContext {
    by: i64,
    fouls: Vec<crate::judgment::CitedFoul>,
}

/// The registry entry (`src/rulesets/registry.rs` REGISTRY row).
pub static ENTRY: RulesetEntry = RulesetEntry {
    id: "fourteenone-v1",
    initial_state,
    judge,
    apply_decision,
    hud_state,
    catalog,
};

fn parse_state(json: &str) -> Result<FourteenOneMatchState, RulesError> {
    serde_json::from_str(json)
        .map_err(|e| RulesError::BadState(format!("fourteenone-v1 state: {e}")))
}

fn state_json(state: &FourteenOneMatchState) -> Result<String, RulesError> {
    serde_json::to_string(state).map_err(|e| {
        RulesError::BadState(format!(
            "fourteenone-v1 state serialization: {e}"))
    })
}

fn is_over(state: &FourteenOneMatchState) -> bool {
    state.result.is_some() || state.phase == "over"
}

fn pending_kind(state: &FourteenOneMatchState) -> &str {
    state
        .pending_decision
        .as_ref()
        .map_or("break_violation", |p| p.kind.as_str())
}

/// Fresh match at the opening-break address (7.2/7.3(a)); `target` from
/// the 022 `fourteenone` family config (default 100).
pub(crate) fn initial_state_for_config(
    config: &FourteenOneVariantConfig, breaker: u8,
) -> Result<String, RulesError> {
    state_json(&FourteenOneMatchState {
        phase: "break".to_string(),
        shooter: breaker,
        breaker,
        scores: SeatPair::new(0, 0),
        target: config.target,
        run: 0,
        consecutive_fouls: SeatPair::new(0, 0),
        rack_count: 1,
        rerack: None,
        on_table: full_rack(),
        pending_decision: None,
        foul_context: None,
        result: None,
        // 7.3(a): the opening break is played from in hand behind the
        // head string (the break stroke itself is 3.11-exempt).
        kitchen_bih: true,
    })
}

/// Registry `initial_state` ≡ the default config point (target 100) ≡
/// the `wpa-14-1` preset resolution (byte-identical — the FR-005
/// default-alias law analog).
fn initial_state(breaker: u8) -> Result<String, RulesError> {
    initial_state_for_config(&FourteenOneVariantConfig::default(), breaker)
}

// ---- call inputs (calls-axis kind 0 call / kind 1 safety) -------------------

enum CallInput {
    Called { ball: i64, pocket: i64 },
    /// A declared safety or any other non-call annotation (the shipped
    /// eightball-v2 convention: non-`call` kinds read as the safety).
    Other,
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

fn parse_call(call: &Value, state: &FourteenOneMatchState)
    -> Result<CallInput, RulesError> {
    if call.get("kind").and_then(Value::as_str) != Some("call") {
        return Ok(CallInput::Other);
    }
    let ball_v = call.get("ball");
    let ball = ball_v.and_then(Value::as_i64);
    if !matches!(ball, Some(b) if (1..=15).contains(&b)) {
        return Err(RulesError::BadCall(format!(
            "fourteenone-v1: called ball {} is not an object ball (1-15)",
            js_string(ball_v)
        )));
    }
    let ball = ball.expect("gated above");
    if !state.on_table.contains(&ball) {
        return Err(RulesError::BadCall(format!(
            "fourteenone-v1: called ball {ball} is not on the table"
        )));
    }
    let pocket_v = call.get("pocket");
    match pocket_v.and_then(Value::as_i64) {
        Some(pocket) if pocket >= 0 => Ok(CallInput::Called { ball, pocket }),
        _ => Err(RulesError::BadCall(format!(
            "fourteenone-v1: called pocket {} is not a kernel pocket index",
            js_string(pocket_v)
        ))),
    }
}

/// 7.5 via 1.7: every non-break shot requires a call or a declared
/// safety; the opening break MAY carry one (7.3(b)) but never must.
fn gate_call(call: &Value, state: &FourteenOneMatchState, is_break: bool)
    -> Result<CallInput, RulesError> {
    if call.is_null() {
        if is_break {
            return Ok(CallInput::None);
        }
        return Err(RulesError::BadCall(
            "fourteenone-v1: every shot after the break requires a call \
             or a declared safety (WPA 7.5 via 1.7)"
                .to_string(),
        ));
    }
    parse_call(call, state)
}

// ---- 7.8 zone geometry (R11 exact-ops discipline: + - * / sqrt and
// comparisons only; squared-distance comparisons avoid sqrt entirely) --------

/// Final (x, y) of every ball: the initial snapshot folded through each
/// event's `post[]` poses (stream order — the kernel emits the final
/// pose of every participant).
fn final_positions(record: &wire::WireRecord) -> Vec<(i64, f64, f64)> {
    let mut pos: Vec<(i64, f64, f64)> = record
        .initial
        .balls
        .iter()
        .map(|b| (b.id, b.state.pos.x, b.state.pos.y))
        .collect();
    for ev in &record.events {
        for (id, s) in &ev.post {
            if let Some(p) = pos.iter_mut().find(|p| p.0 == *id) {
                p.1 = s.pos.x;
                p.2 = s.pos.y;
            }
        }
    }
    pos
}

/// Squared distance from `(x, y)` to the segment `(px, py)-(qx, qy)`.
fn seg_dist2(x: f64, y: f64, px: f64, py: f64, qx: f64, qy: f64) -> f64 {
    let dx = qx - px;
    let dy = qy - py;
    let len2 = dx * dx + dy * dy;
    let t = if len2 > 0.0 {
        (((x - px) * dx + (y - py) * dy) / len2).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let ex = x - (px + t * dx);
    let ey = y - (py + t * dy);
    ex * ex + ey * ey
}

/// 7.8 "within or overlaps the outline of the rack": the triangle hull
/// of the 15 lattice ball centres — apex `(0, l/4)` (the foot spot),
/// rear corners `(±4r, l/4 + 4·√3·r)` — with a 2r interference margin
/// (ball edge vs the physical outline; documented model, module doc).
fn interferes_with_rack(l: f64, r: f64, x: f64, y: f64) -> bool {
    let fy = l / 4.0;
    let by = fy + 4.0 * 3.0_f64.sqrt() * r;
    let (ax, ay) = (0.0, fy);
    let (bx, cx) = (-4.0 * r, 4.0 * r);
    let cross = |ox: f64, oy: f64, px: f64, py: f64| {
        (px - ox) * (y - oy) - (py - oy) * (x - ox)
    };
    let d1 = cross(ax, ay, bx, by);
    let d2 = cross(bx, by, cx, by);
    let d3 = cross(cx, by, ax, ay);
    let has_neg = d1 < 0.0 || d2 < 0.0 || d3 < 0.0;
    let has_pos = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
    if !(has_neg && has_pos) {
        return true; // inside the hull (or exactly on an edge)
    }
    let margin2 = (2.0 * r) * (2.0 * r);
    let m = seg_dist2(x, y, ax, ay, bx, by)
        .min(seg_dist2(x, y, bx, by, cx, by))
        .min(seg_dist2(x, y, cx, by, ax, ay));
    m < margin2
}

/// A ball at `(x, y)` blocks the head spot `(0, -l/4)` (placing a ball
/// there would overlap it).
fn blocks_head_spot(l: f64, r: f64, x: f64, y: f64) -> bool {
    let hy = -l / 4.0;
    let d2 = x * x + (y - hy) * (y - hy);
    d2 < (2.0 * r) * (2.0 * r)
}

/// The 7.8 Table 1 transcription: the judged re-rack plan for a legal
/// scoring stroke that left `remaining` (0 or 1) object balls up.
/// `l == 0` (dimension-less record) disables the zone tests — both
/// balls read as non-interfering.
fn rerack_plan(record: &wire::WireRecord, remaining: &[i64])
    -> FourteenOneRerack {
    let l = record.initial.table.length;
    let r = record
        .initial
        .balls
        .first()
        .map_or(0.028575, |b| b.params.r);
    let finals = final_positions(record);
    let pos_of = |id: i64| -> (f64, f64) {
        finals
            .iter()
            .find(|p| p.0 == id)
            .map_or((0.0, 0.0), |p| (p.1, p.2))
    };
    let (cx, cy) = pos_of(0);
    let cue_in_rack = l > 0.0 && interferes_with_rack(l, r, cx, cy);
    let full = |cue_spot: &str| FourteenOneRerack {
        kind: "full".to_string(),
        fifteenth: None,
        fifteenth_spot: "racked".to_string(),
        cue_spot: cue_spot.to_string(),
    };
    let Some(&fid) = remaining.first() else {
        // 7.8(a): the fifteenth ball was pocketed on the shot that
        // scored the fourteenth — all fifteen re-rack; the cue is in
        // hand behind the head string only if it interferes (Table 1).
        return full(if cue_in_rack { "kitchen" } else { "stays" });
    };
    let (fx, fy) = pos_of(fid);
    let f_in_rack = l > 0.0 && interferes_with_rack(l, r, fx, fy);
    let partial = |fifteenth_spot: &str, cue_spot: &str| FourteenOneRerack {
        kind: "partial".to_string(),
        fifteenth: Some(fid),
        fifteenth_spot: fifteenth_spot.to_string(),
        cue_spot: cue_spot.to_string(),
    };
    match (f_in_rack, cue_in_rack) {
        // 7.8(b): both interfere — all fifteen, cue in hand kitchen
        (true, true) => full("kitchen"),
        // 7.8(c): only the object ball interferes — head spot, or the
        // center spot if the cue blocks the head spot
        (true, false) => partial(
            if blocks_head_spot(l, r, cx, cy) {
                "center_spot"
            } else {
                "head_spot"
            },
            "stays",
        ),
        // 7.8(d): only the cue interferes — kitchen in hand when the
        // fifteenth is on/in front of the head string; head spot (or
        // center if the fifteenth blocks it) when the fifteenth is
        // behind the head string (kernel frame: kitchen is y < −l/4)
        (false, true) => partial(
            "stays",
            if fy < -l / 4.0 {
                if blocks_head_spot(l, r, fx, fy) {
                    "center_spot"
                } else {
                    "head_spot"
                }
            } else {
                "kitchen"
            },
        ),
        // neither interferes — fourteen re-rack, both stay
        (false, false) => partial("stays", "stays"),
    }
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
        "fourteenone-v1: judge called after the match ended (adapter \
         contract)",
    )?;
    term::guard_no_pending(
        state.pending_decision.is_some(),
        format!(
            "fourteenone-v1: judge called while a rulebook decision is \
             pending ('{}') — resolve it via applyDecision",
            pending_kind(&state)
        ),
    )?;
    let call: Value = serde_json::from_str(call_json).map_err(|e| {
        RulesError::BadCall(format!("fourteenone-v1 call: {e}"))
    })?;
    let is_break = state.phase == "break";
    let call = gate_call(&call, &state, is_break)?;
    let record = wire::parse_record(record_json)?;
    // P21 head-string facts join when the record carries table
    // dimensions (GH-371; 0.0 disables — the 7.8-zone precedent).
    let table_l = record.initial.table.length;
    let hs_plane = if table_l > 0.0 { Some(-table_l / 4.0) } else { None };
    let facts = scan::scan(&record, &scan::ScanConfig {
        head_string_y: hs_plane,
        ..scan::ScanConfig::default()
    });
    // WPA 7.9 via 3.11 (GH-371): judged on non-break strokes that began
    // from a kitchen in-hand grant (`kitchenBih`) AND whose record shows
    // the cue addressed strictly behind the line (3.10 placement stays
    // adapter territory). Break strokes fold into 7.3(b)/7.10.
    let kitchen_stroke = !is_break
        && state.kitchen_bih
        && hs_plane.is_some_and(|hs| {
            record
                .initial
                .balls
                .iter()
                .find(|b| b.id == 0)
                .is_some_and(|b| b.state.pos.y < hs)
        });

    let shooter = state.shooter;
    let opp = turn::other(shooter);
    let pocketed = facts.pocketed_ids();

    // 7.3(b)/7.7 trigger: the CALLED ball reached the CALLED pocket
    // (stroke legality gates the SCORE separately).
    let called_ball_pocketed = match call {
        CallInput::Called { ball, pocket } => {
            pockets::call_fulfilled(&facts.pocketed, ball, pocket)
        }
        _ => false,
    };

    // ---- standard fouls (7.9 events subset), one-pocket citation order
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
    // 3.11 ¶1 (GH-371): first contact with a ball behind the head
    // string, no crossing first. Appended after the frozen three
    // (additive — the frozen slice never stages a kitchen-BIH stroke).
    if kitchen_stroke
        && facts.first_contact_in_kitchen
        && !facts.cue_crossed_head_string_before_contact
    {
        fouls.push("bad-kitchen-shot", CITE_KITCHEN);
    }
    // 3.11 ¶2: the stroke neither crossed the head string nor contacted
    // a ball on/past it — the incoming player takes kitchen in-hand.
    let kitchen_no_exit = kitchen_stroke
        && !facts.cue_crossed_head_string
        && !facts.cue_contacted_ball_past_head_string;
    if kitchen_no_exit {
        fouls.push("kitchen-no-exit", CITE_KITCHEN);
    }

    // ---- 7.3(b): the opening-break requirement — no called pot AND
    // not (contact + cue to a rail + two object balls to rails), where
    // pocketed/jumped balls count as driven to a rail (2.7).
    if is_break && !called_ball_pocketed {
        let cue_to_rail = facts.striker_rail_after_contact
            || facts.cue_scratch;
        let mut driven: Vec<i64> = facts.object_rail_ids.clone();
        for id in &pocketed {
            if !driven.contains(id) {
                driven.push(*id);
            }
        }
        for id in &facts.off_table {
            if !driven.contains(id) {
                driven.push(*id);
            }
        }
        let requirements = facts.first_contact.is_some()
            && cue_to_rail
            && driven.len() >= 2;
        if !requirements {
            // breaking foul (7.10): −2; any standard foul on the same
            // stroke FOLDS into it (and never steps the 7.11 counter).
            let mut bfouls = Fouls::new();
            bfouls.push("breaking-foul", CITE_BREAKING);
            let mut scores = state.scores;
            *scores.get_mut(shooter) -= 2;
            let mut spot_ids = pocketed.clone();
            spot_ids.extend_from_slice(&facts.off_table);
            let respot = respot_chain::sort_numeric(spot_ids);
            let decision = DecisionRequired {
                kind: "break_violation".to_string(),
                chooser: Chooser::Seat(opp),
            };
            let foul_context = fouls_mod::foul_context(
                bfouls.as_slice(), i64::from(shooter));
            let judgment = Judgment {
                legal: false,
                fouls: bfouls.into_vec(),
                pocketed,
                // 3.1 on the same stroke: the cue enters play from the
                // kitchen if the table is accepted (adapter applies it)
                ball_in_hand: if facts.cue_scratch {
                    PlacementRight::Kitchen
                } else {
                    PlacementRight::None
                },
                respot,
                turn: Turn::Pass,
                decision_required: Some(decision.clone()),
                terminal: None,
                next: FourteenOneMatchState {
                    phase: "break".to_string(),
                    shooter, // P18: the pending option holds the seat
                    breaker: state.breaker,
                    scores,
                    target: state.target,
                    run: 0,
                    consecutive_fouls: state.consecutive_fouls,
                    rack_count: state.rack_count,
                    rerack: None,
                    on_table: state.on_table.clone(), // spotted back
                    pending_decision: Some(FourteenOnePending {
                        kind: decision.kind,
                        chooser: decision.chooser,
                    }),
                    foul_context,
                    result: None,
                    // a scratched breaking foul leaves the incoming
                    // player in hand behind the head string if the
                    // table is accepted (3.1; the re-break choice
                    // re-asserts the flag in apply_decision)
                    kitchen_bih: facts.cue_scratch,
                },
            };
            return judgment.to_json();
        }
    }

    let is_foul = !fouls.is_empty();
    let mut scores = state.scores;
    let mut run = state.run;
    let mut consecutive = state.consecutive_fouls;
    let mut rack_count = state.rack_count;
    let mut breaker = state.breaker;
    let mut respot_ids: Vec<i64> = Vec::new();
    let mut terminal: Option<Terminal> = None;
    let mut next_phase = "play".to_string();
    let mut rerack: Option<FourteenOneRerack> = None;
    let mut turn_v = Turn::Pass;
    let mut ball_in_hand = PlacementRight::None;
    let mut on_table: Vec<i64>;

    if is_foul {
        // 7.9: −1, pocketed + jumped balls spot, cue stays except 3.1
        *scores.get_mut(shooter) -= 1;
        run = 0;
        respot_ids = pocketed.clone();
        respot_ids.extend_from_slice(&facts.off_table);
        on_table = state.on_table.clone(); // everything returns
        if facts.cue_scratch || kitchen_no_exit {
            // 3.1 — and the 3.11 ¶2 grant (GH-371): in hand behind the
            // head string for the incoming player
            ball_in_hand = PlacementRight::Kitchen;
        }
        // P15 tracked counter (threshold 3, reset-on-legal; 7.11)
        let stepped = counters::step(
            counters::FoulCounterMode::Tracked { loss_threshold: 3 },
            *consecutive.get(shooter),
            true,
        );
        *consecutive.get_mut(shooter) = stepped.count;
        if stepped.lost {
            // 7.11: −15 more, counter to zero, all fifteen re-racked,
            // the OFFENDER re-breaks under opening-break requirements
            fouls.push("three-consecutive-fouls", CITE_THREE_FOULS);
            *scores.get_mut(shooter) -= 15;
            *consecutive.get_mut(shooter) = 0;
            next_phase = "break".to_string();
            rack_count += 1;
            breaker = shooter;
            turn_v = Turn::Continue;
            ball_in_hand = PlacementRight::Kitchen; // 7.3(a) address
            on_table = full_rack();
            respot_ids = Vec::new(); // the re-rack returns everything
        }
    } else {
        // legal stroke: any legal shot resets the counter (7.11)
        *consecutive.get_mut(shooter) = 0;
        if called_ball_pocketed {
            // 7.7: +1 per ball pocketed on the legal called shot
            let pts = pocketed.len() as i64;
            *scores.get_mut(shooter) += pts;
            run += pts;
            turn_v = Turn::Continue;
            on_table = state
                .on_table
                .iter()
                .copied()
                .filter(|id| !pocketed.contains(id))
                .collect();
            if *scores.get(shooter) >= state.target {
                // P17: race-to-target win (7.4)
                terminal = Some(term::terminal(
                    i64::from(shooter), "target-reached", CITE_WIN));
            } else if on_table.len() <= 1 {
                // 7.4/7.8: the 14th (or 14th+15th) dropped — re-rack
                // with the judged Table 1 plan; the shooter continues
                rack_count += 1;
                next_phase = "rerack".to_string();
                let plan = rerack_plan(&record, &on_table);
                if plan.cue_spot == "kitchen" {
                    ball_in_hand = PlacementRight::Kitchen;
                }
                rerack = Some(plan);
                on_table = full_rack();
            }
        } else {
            // safety, or no called ball dropped: the turn passes and
            // every pocketed ball spots (7.5/7.6)
            run = 0;
            turn_v = Turn::Pass;
            respot_ids = pocketed.clone();
            on_table = state.on_table.clone();
        }
    }

    let next_shooter =
        turn::resolve_seat(shooter, terminal.is_some(), false, turn_v);
    let legal = fouls.legal(); // P11 invariant
    let foul_context =
        fouls_mod::foul_context(fouls.as_slice(), i64::from(shooter));

    let judgment = Judgment {
        legal,
        fouls: fouls.into_vec(),
        pocketed,
        ball_in_hand: if terminal.is_some() {
            PlacementRight::None
        } else {
            ball_in_hand
        },
        respot: respot_chain::sort_numeric(respot_ids),
        turn: turn_v,
        decision_required: None,
        terminal: terminal.clone(),
        next: FourteenOneMatchState {
            phase: if terminal.is_some() {
                "over".to_string()
            } else {
                next_phase
            },
            shooter: next_shooter,
            breaker,
            scores,
            target: state.target,
            run,
            consecutive_fouls: consecutive,
            rack_count,
            rerack,
            on_table,
            pending_decision: None,
            foul_context,
            result: terminal.clone(),
            // GH-371: the next stroke begins in hand behind the head
            // string exactly when this judgment granted it (3.1 / 3.11
            // ¶2 / the 7.11 re-break address / the 7.8 kitchen plan).
            kitchen_bih: terminal.is_none()
                && ball_in_hand == PlacementRight::Kitchen,
        },
    };
    judgment.to_json()
}

// ---- decision resolution (P16 liturgy: guard → unknown id → pending →
// choice; id 11 `break_violation` is the only 14.1 option) --------------------

fn apply_decision(state_json_in: &str, decision_json: &str)
    -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    term::guard_not_over(
        is_over(&state),
        "fourteenone-v1: no decision can be applied after the match ended",
    )?;
    let d = decisions::parse_decision(decision_json)?;
    if d.decision == 15 {
        // spot_nearest (WPA 1.6 ¶2 via 7.9, GH-371): the recorded
        // nearest-ball spot request — never pending (stalemate_lag
        // precedent); placement XY is adapter geometry (research R7),
        // ids never leave the table, the state is unchanged. The
        // all-balls-behind-the-line precondition is adapter-owned.
        decisions::check_pending(
            state.pending_decision.is_none() && state.phase != "break",
            format!(
                "fourteenone-v1: spot_nearest cannot pre-empt the pending \
                 '{}' option or the break address",
                pending_kind(&state)
            ),
        )?;
        decisions::check_choice(
            d.choice == 1,
            format!(
                "fourteenone-v1: choice {} out of range for 'spot_nearest' \
                 (1 spot the nearest ball)",
                d.choice
            ),
        )?;
        return state_json(&state);
    }
    if d.decision != 11 {
        // NOTE the "(only 11 …)" diagnostic text below is corpus-frozen
        // (pre-371 bytes); id 15 is handled above.
        return Err(decisions::unknown_id(format!(
            "fourteenone-v1: unknown decision id {} (only 11, \
             break_violation — WPA 7.3(b))",
            d.decision
        )));
    }
    decisions::check_pending(
        state
            .pending_decision
            .as_ref()
            .is_some_and(|p| p.kind == "break_violation"),
        "fourteenone-v1: decision 'break_violation' does not match the \
         pending option (none)"
            .to_string(),
    )?;
    decisions::check_choice(
        d.choice == 1 || d.choice == 2,
        format!(
            "fourteenone-v1: choice {} out of range for 'break_violation' \
             (1 accept the table | 2 require a re-break)",
            d.choice
        ),
    )?;
    // the CHOOSER recorded on the pending option is the non-breaking
    // player (the judgment always seats them there)
    let chooser = match state.pending_decision.as_ref().map(|p| p.chooser) {
        Some(Chooser::Seat(n)) => n,
        _ => turn::other(state.shooter),
    };
    if d.choice == 1 {
        // accept the table in position: play passes to the non-breaker
        return state_json(&FourteenOneMatchState {
            phase: "play".to_string(),
            shooter: chooser,
            pending_decision: None,
            ..state
        });
    }
    // require another opening break: full fifteen, SAME breaker, the
    // option repeatable on the next violation (7.3(b))
    state_json(&FourteenOneMatchState {
        phase: "break".to_string(),
        shooter: state.breaker,
        rack_count: state.rack_count + 1,
        rerack: None,
        on_table: full_rack(),
        pending_decision: None,
        foul_context: None,
        // the re-break addresses from in hand behind the head string
        // (7.3(a) — the adapter grants the placement on this state)
        kitchen_bih: true,
        ..state
    })
}

/// HUD projection (module doc: discriminator fields `target`/`scores`/
/// `run`/`rackCount`), with the `{by, fouls}` foul-context re-order.
fn hud_state(state_json_in: &str) -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    let hud = FourteenOneHud {
        phase: state.phase,
        shooter: state.shooter,
        breaker: state.breaker,
        scores: state.scores,
        target: state.target,
        run: state.run,
        consecutive_fouls: state.consecutive_fouls,
        rack_count: state.rack_count,
        rerack: state.rerack,
        on_table: state.on_table,
        pending_decision: state.pending_decision,
        result: state.result,
        foul_context: state.foul_context.map(|fc| {
            FourteenOneHudFoulContext { by: fc.by, fouls: fc.fouls }
        }),
    };
    serde_json::to_string(&hud).map_err(|e| {
        RulesError::BadState(format!("fourteenone-v1 hud serialization: {e}"))
    })
}

/// Catalog row: the events-detectable foul taxonomy with the Section 7
/// cites, the single additive decision (id 11 — the first allocation
/// past the frozen 1–10 space), the single terminal, and the pure-data
/// config block pointing at the 022 `fourteenone` task-config family.
fn catalog() -> CatalogEntry {
    CatalogEntry {
        id: "fourteenone-v1",
        fouls: vec![
            crate::judgment::CitedFoul::new("scratch", CITE_SCRATCH),
            crate::judgment::CitedFoul::new(
                "no-rail-after-contact", CITE_NO_RAIL),
            crate::judgment::CitedFoul::new("ball-off-table", CITE_OFF_TABLE),
            crate::judgment::CitedFoul::new("breaking-foul", CITE_BREAKING),
            crate::judgment::CitedFoul::new(
                "three-consecutive-fouls", CITE_THREE_FOULS),
            crate::judgment::CitedFoul::new("bad-kitchen-shot", CITE_KITCHEN),
            crate::judgment::CitedFoul::new("kitchen-no-exit", CITE_KITCHEN),
        ],
        decisions: vec![
            DecisionRow { id: 11, kind: "break_violation", choice_max: 2 },
            // GH-371: WPA 1.6 ¶2 nearest-ball spot request (recorded
            // request, never pending; adapter-executed placement)
            DecisionRow { id: 15, kind: "spot_nearest", choice_max: 1 },
        ],
        terminals: vec!["target-reached"],
        config: serde_json::json!({
            "family": "fourteenone",
            "configSchema": crate::task_config::TASK_CONFIG_SCHEMA,
            "defaultPreset": "wpa-14-1",
            "targetDefault": 100,
        }),
    }
}

// ---- unit tests (zone geometry; the behavior wall lives in
// tests/fourteenone_scenarios.rs and the frozen conformance slice) ------------

#[cfg(test)]
mod tests {
    use super::*;

    const L: f64 = 2.54; // 9-ft playing surface length [m]
    const R: f64 = 0.028575;

    #[test]
    fn rack_zone_membership() {
        // the foot spot (apex centre) interferes
        assert!(interferes_with_rack(L, R, 0.0, L / 4.0));
        // the rack centroid interferes
        assert!(interferes_with_rack(
            L, R, 0.0, L / 4.0 + 2.0 * 3.0_f64.sqrt() * R));
        // just outside the 2r margin below the apex does not
        assert!(!interferes_with_rack(L, R, 0.0, L / 4.0 - 2.5 * R));
        // well clear of the rack does not
        assert!(!interferes_with_rack(L, R, 0.0, 0.0));
        assert!(!interferes_with_rack(L, R, 0.0, -L / 4.0));
        // a ball just inside the 2r margin off the apex interferes
        assert!(interferes_with_rack(L, R, 0.0, L / 4.0 - 1.9 * R));
    }

    #[test]
    fn head_spot_blocking() {
        assert!(blocks_head_spot(L, R, 0.0, -L / 4.0));
        assert!(blocks_head_spot(L, R, R, -L / 4.0 + R));
        assert!(!blocks_head_spot(L, R, 0.0, -L / 4.0 + 2.5 * R));
        assert!(!blocks_head_spot(L, R, 0.0, 0.0));
    }
}
