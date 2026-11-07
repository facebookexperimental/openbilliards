// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `snooker-v2` (feature GH-382, build 17) — the completed WPBSA rules:
//! `snooker-v1` semantics plus the three mechanics v1 documented OUT
//! (Foul and a Miss, Free Ball, Touching Ball), each gated by a config
//! axis so the v1 judgment of every existing recording is untouchable
//! by construction (`snooker.rs` is byte-frozen; the family default
//! preset `wpbsa-snooker` aliases `snooker-v1` per the FR-005 law; this
//! engine judges only sessions that explicitly pinned
//! `wpbsa-snooker-full`). Rulebook pin: WPBSA "Official Rules of the
//! Games of Snooker and English Billiards", Revised September 2024 —
//! the feature-011/012 edition (fetched + re-verified at GH-382
//! implementation; every behavior below carries its section/paragraph).
//!
//! # Config axes (config-in-state, contracts/registry-api.md §3)
//!
//! `{miss_rule, free_ball, touching_ball}` — all `false` reproduces the
//! v1 verdict fields exactly (the fidelity differential pins it); the
//! shipped `wpbsa-snooker-full` preset resolves all `true` with cites.
//!
//! # Foul and a Miss — Sec 3 R14 (miss_rule)
//!
//! The referee-judgment model, chosen and documented per the GH-382
//! order (no hidden heuristics):
//! - A MISS is the Sec 2 R21 mechanical fact: the cue-ball failed to
//!   first hit a ball on (foul codes `no-contact`/`wrong-first-ball`,
//!   free-ball first-contact failures included). The R14(a) "best
//!   attempt" clause is modeled as STRICT LIABILITY: every such failure
//!   is called FOUL AND A MISS — in a simulation the stroke is exactly
//!   what the player commanded, so "to the best of their ability" has
//!   no unobservable remainder; this also subsumes the R14(c) mandatory
//!   clear-path call.
//! - The single exemption is R14(a)(i), points-needed: no miss is
//!   called when, before or as a result of the stroke, either player
//!   requires penalty points (deficit strictly greater than the points
//!   remaining: reds·8 + Σ colour values on the table, plus — before a
//!   colour_after_red stroke — the pending colour opportunity at the
//!   highest colour's value, review GH-382 r2). Its second leg
//!   ("satisfied that the miss was not intentional") is resolved by
//!   presumption of best attempt — the referee is always satisfied.
//! - R14(d): when central full-ball contact was available at the
//!   original position ([`snooker_geom::full_ball_available`], or the
//!   cue was touching a ball that could be on), the sequence arms:
//!   (d)(i) repeat failures from the original position are called
//!   regardless of the score difference; (d)(ii) the Warning attaches
//!   when the offender is sent back after the second failure, and a
//!   further failure awards the frame (`miss-frame-award`); (d)(iii)
//!   playing from the position left ends the sequence.
//! - Decision 17 `foul_and_a_miss` (chooser: the non-offender):
//!   choice 1 — non-offender plays from the position left;
//!   choice 2 — offender plays again from the position left (R14(b));
//!   choice 3 — offender plays again from the ORIGINAL position, all
//!   balls replaced (R14(b)). The crate restores the LOGICAL state
//!   (`missRestore`: phase, ball on, on-table set); ball XY replacement
//!   is adapter-owned (research.md R6 — the app restores the recorded
//!   pre-stroke placements bit-exactly from the very record bytes it
//!   fed the kernel, replay-grade by construction).
//! - R12(f) to the letter (review GH-382 r1): a play-again request
//!   (choice 2) AND a replacement request (choice 3) each void the
//!   free-ball option — the restored position never carries one, even
//!   when the missed stroke itself was played under a free ball.
//! - Out of scope with cites (no stroke to judge / referee-table
//!   procedure): R14(e) pre-stroke fouls after a replacement, R14(f)
//!   and R10(i)/R15/R16 consultation periods and out-of-stroke ball
//!   handling.
//!
//! # Free Ball — Sec 2 R13 def, Sec 3 R12 award (free_ball)
//!
//! - MECHANICAL eligibility (`freeBallEligible`) is state-tracked: set
//!   by every non-terminal foul, kept when the non-offender elects to
//!   play (decision choices keeping them at the table), voided by
//!   play-again and replacement requests (R12(f)).
//! - The GEOMETRIC fact (Sec 2 R17 snookered; R17(a) from the D when
//!   in-hand) is owned by [`crate::primitives::snooker_geom`] and
//!   surfaced through [`address_facts_json`]: the adapter queries it at
//!   address with the LIVE post-respot positions (respot XY derives
//!   adapter-side — research.md R6 — so the settled table the referee
//!   examines exists only there) and records the FREE BALL call on the
//!   stroke's nomination (`{kind:"nominate", ball, freeBall:true}`,
//!   share wire `[shot, 3, ball, 1]`). The judge validates the
//!   mechanical half (`freeBallEligible`, phase, ball domain) and
//!   honors the recorded call — the referee's call is a recorded
//!   input, re-derived deterministically on replay, exactly like the
//!   adapter-derived respot placements it depends on.
//! - Stroke semantics: first contact must be the nominated free ball F
//!   (R11(b)(iv); the "simultaneously with a ball on" concession is
//!   not mechanically distinguishable — kernel ties resolve by
//!   emission order, the frozen P1 doctrine — so the first stream
//!   contact governs). F pots score the value of the ball on and F is
//!   respotted (R12(a)(ii),(c)); balls on pot normally and stay down
//!   (R12(d)); both potted scores only the ball on unless Red was on,
//!   when each potted ball scores (R12(e)); potting F with Red on
//!   arms `colour_after_red` ("a free ball nominated as a Red").
//!   Penalties price F at the value of the ball on (R12(a)(ii)).
//! - R12(b)(ii): after a non-scoring stroke, leaving all Reds / the
//!   ball on snookered BY the nominated free ball (the Sec 2 R17(b)
//!   effective snookering ball, honoring the R17(c) different-Reds
//!   arm) is the foul `free-ball-snooker` (R11(a)(viii)) — except when
//!   only two object balls remain WITH the black among them ("Pink and
//!   Black, or Black and one other colour" — review GH-382 r3).
//! - Free ball cannot arise in `colour_after_red` (that phase only
//!   follows the striker's own legal pot, never a foul) nor
//!   `respotted_black` (no ball not-on exists to snooker with) —
//!   nominations flagged `freeBall` there are adapter errors.
//!
//! # Touching Ball — Sec 3 R8 (touching_ball)
//!
//! - The called set at address ("touching a ball or balls on, or that
//!   could be on", R8(a)): frozen balls ([`snooker_geom::frozen_to`],
//!   threshold documented there) among — reds phase: the reds;
//!   `colour_after_red`: every colour; `final_colours`: the ball on;
//!   `respotted_black`: the black; plus EVERY ball only under a LIVE
//!   free ball — the eligibility AND the snookered finding together
//!   (both judge and address sides derive the geometric half through
//!   the crate's own R17 computation; the recorded freeBall nomination
//!   also proves it — review GH-382 r1/r7). Judged from the record's
//!   initial placements (the address the previous stroke left); the
//!   adapter's declaration chip reads the same fact through
//!   [`address_facts_json`].
//! - Play-away (R8(b)): played INTO iff the cue's FIRST own event
//!   after the strike is a contact with ANY touching object ball —
//!   R8(c) conditions the grace on "any touching object ball" while
//!   R8(e) keeps the ANNOUNCED set to balls on (review r28: an
//!   unannounced neighbour cites R8(c), the called ball R8(b))
//!   (review r17: a shallow tangential squeeze contacts late but
//!   nothing intervenes; any genuine play-away interposes a cushion,
//!   ball, transition or jump landing first), bounded at 50 ms
//!   against a pure-masse return. The launch-time BallTable artifact
//!   an ELEVATED strike presses into the bed at the strike instant
//!   (t≈1e-9, kernel-probed at 10°-45°) is skipped inside
//!   [`snooker_geom::PUSH_CONTACT_WINDOW`] — it is part of the strike,
//!   not an interposition (review r25). Played into = the ball moved at
//!   the moment of striking — the foul `push-stroke` (Sec 2 R19;
//!   R11(b)(v) penalty: value of the ball on or ball concerned).
//! - Deemed contact (R8(c)): playing away cleanly from a touching ball
//!   that is on — or that could be on and is the declared nomination —
//!   satisfies the first-contact requirement (no `no-contact` /
//!   `wrong-first-ball` foul can arise; hitting nothing at all is a
//!   legal stroke). Everything else about the stroke judges normally
//!   (R8(c)(iii) declared-other-ball play is the ordinary nomination
//!   path). R8(d)-(g) (referee clarifications, repositioning) are
//!   out-of-stroke procedure, out of scope with cites.
//!
//! # Unchanged v1 semantics
//!
//! Ball values/penalty clamp (Sec 3 R1(a)/R11), respots (R7), the
//! nomination contract (R3(h)), frame end + re-spotted black
//! (R4(a),(b)), play-again (R10(h)(ii)/R13, decision 7), scratch
//! in-hand D (Sec 2 R9 / Sec 3 R5), jump-over (Sec 2 R20), successive
//! reds (R11(d)(iii)). The `{fouls, by, penalty}` vs `{by, penalty,
//! fouls}` foul-context serialization convention is carried from v1
//! for family consistency. Push stroke against a ball NOT on needs no
//! dedicated arm: the immediate contact IS the wrong-first-ball foul.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::RulesError;
use crate::judgment::{
    Chooser, CitedFoul, DecisionRequired, Judgment, PlacementRight, SeatPair,
    Terminal, Turn,
};
use crate::primitives::{
    contact, decisions, fouls as fouls_mod, fouls::Fouls, penalty, pockets,
    respot_chain, scan, snooker_geom, terminal as term, turn,
};
use crate::rulesets::registry::{CatalogEntry, DecisionRow, RulesetEntry};
use crate::task_config::{
    canonical_envelope_json_snooker, sha256_hex, SnookerVariantConfig,
};
use crate::wire::{self, WireEventKind};

// ---- pinned citation strings (v1 set + the GH-382 additions) -------------------

const CITE_WRONG_FIRST: &str = "WPBSA Sec2 R11; Sec3 R10";
const CITE_NO_CONTACT: &str = "WPBSA Sec2 R11; Sec3 R10";
const CITE_SCRATCH: &str = "WPBSA Sec3 R5, R10";
const CITE_OFF_TABLE: &str = "WPBSA Sec3 R7, R10";
const CITE_NOT_NOMINATED: &str = "WPBSA Sec3 R3(h), R10";
const CITE_JUMP_OVER: &str = "WPBSA Sec2 R20; Sec3 R10";
const CITE_FRAME_END: &str = "WPBSA Sec3 R4(a)";
const CITE_RESPOTTED_BLACK: &str = "WPBSA Sec3 R4(b)";
const CITE_PUSH_STROKE: &str = "WPBSA Sec2 R19; Sec3 R8(b), R11(b)(v)";
/// The dual-touch arm (review r28 P2): a touching ball the referee does
/// NOT indicate (R8(e) keeps the announced set to balls on) still may
/// not be moved — R8(c)'s grace is conditioned on "any touching object
/// ball", and Sec2 R19(b) makes playing into it a push stroke.
const CITE_PUSH_STROKE_NOT_ON: &str =
    "WPBSA Sec2 R19; Sec3 R8(c), R11(b)(v)";
const CITE_FREE_BALL_SNOOKER: &str = "WPBSA Sec3 R12(b)(ii), R11(a)(viii)";
const CITE_MISS_FRAME_AWARD: &str = "WPBSA Sec3 R14(d)(ii)";

/// The full 21-ball frame (v1 `full_frame`, duplicated: v1 is frozen,
/// its helpers private — the eightball-v2 precedent).
fn full_frame() -> Vec<i64> {
    (1..=21).collect()
}

fn is_red(id: i64) -> bool {
    (1..=15).contains(&id)
}

fn is_colour(id: i64) -> bool {
    (16..=21).contains(&id)
}

/// Point value (Sec 3 R1(a)): red 1; colour = id − 14.
fn value_of(id: i64) -> i64 {
    if is_colour(id) { id - 14 } else { 1 }
}

/// The ball on wire (v1 `BallOn`, same mixed string/int encoding).
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

// ---- the additive variant block (contracts/registry-api.md §3) ----------------

/// Config-in-state carriage `{task_hash, config}` (eightball-v2 shape).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VariantBlock {
    pub task_hash: String,
    pub config: SnookerVariantConfig,
}

impl VariantBlock {
    fn from_config(config: SnookerVariantConfig) -> VariantBlock {
        let hash =
            sha256_hex(canonical_envelope_json_snooker(&config).as_bytes());
        VariantBlock { task_hash: hash, config }
    }
}

/// Config-in-state errors are `invalid-task-config` (the registry-api.md
/// §3 contract; the eightball-v2 convention — review GH-382 r12).
fn invalid_cfg(msg: impl Into<String>) -> RulesError {
    RulesError::InvalidTaskConfig(msg.into())
}

fn parse_variant(v: Value) -> Result<VariantBlock, RulesError> {
    if v.is_null() {
        return Err(invalid_cfg(
            "snooker-v2 state: missing 'variant' block (config-in-state, \
             registry-api.md §3)"));
    }
    let block: VariantBlock =
        serde_json::from_value(v).map_err(|e| invalid_cfg(
            format!("snooker-v2 state: variant block: {e}")))?;
    let expected = sha256_hex(
        canonical_envelope_json_snooker(&block.config).as_bytes());
    if block.task_hash != expected {
        return Err(invalid_cfg(format!(
            "snooker-v2 state: variant.task_hash '{}' is not the hash of \
             the carried config (config-in-state integrity)",
            block.task_hash
        )));
    }
    Ok(block)
}

// ---- the additive miss-sequence state (Sec 3 R14(d)) ---------------------------

/// Active Foul-and-a-Miss sequence context.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MissContext {
    /// Consecutive misses from the same original position (R14(d)(i)).
    pub count: i64,
    /// The R14(d)(ii) Warning has been issued.
    pub warned: bool,
    /// Central full-ball contact was available at the original position
    /// (computed once, at the first miss — the (d) gate).
    #[serde(rename = "fullBall")]
    pub full_ball: bool,
}

/// The logical restore point for decision 17 choice 3 (R14(b)): the
/// judged stroke's prior phase / ball on / table set. Ball XY
/// replacement is adapter-owned (module doc). NO free-ball carriage:
/// R12(f) voids the free-ball option on every replacement request
/// (review GH-382 r1 P1 — the earlier "the call stands" model read the
/// situation, not the letter).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MissRestore {
    pub phase: String,
    #[serde(rename = "ballOn")]
    pub ball_on: BallOn,
    #[serde(rename = "onTable")]
    pub on_table: Vec<i64>,
}

/// Complete snooker-v2 match state: the v1 field run in its frozen
/// declaration order, then the additive fields LAST (`variant`,
/// `freeBallEligible`, `miss`, `missRestore`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnookerV2MatchState {
    pub phase: String,
    pub shooter: u8,
    pub scores: SeatPair<i64>,
    #[serde(rename = "currentBreak")]
    pub current_break: i64,
    #[serde(rename = "ballOn")]
    pub ball_on: BallOn,
    #[serde(rename = "onTable")]
    pub on_table: Vec<i64>,
    #[serde(rename = "respotQueue")]
    pub respot_queue: Vec<i64>,
    #[serde(rename = "pendingDecision")]
    pub pending_decision: Option<DecisionRequired>,
    #[serde(rename = "foulContext")]
    pub foul_context: Option<fouls_mod::FoulContextPenalty>,
    pub result: Option<Terminal>,
    /// REQUIRED semantically (a state without it is not a snooker-v2
    /// state) — parsed leniently here so [`parse_variant`] can return
    /// the §3 `invalid-task-config` contract error instead of a generic
    /// serde `bad-state` (review GH-382 r12).
    #[serde(default)]
    pub variant: Value,
    /// The three trackers default empty so a v1-shaped state plus the
    /// variant block is a valid v2 entry point (the fidelity
    /// differential's injection path — fidelity.rs precedent).
    #[serde(rename = "freeBallEligible", default)]
    pub free_ball_eligible: bool,
    #[serde(default)]
    pub miss: Option<MissContext>,
    #[serde(rename = "missRestore", default)]
    pub miss_restore: Option<MissRestore>,
}

/// The `{by, penalty, fouls}` foul-context clone (v1 convention).
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

/// applyDecision output mirror (v1 convention: state key order with the
/// `{by, penalty, fouls}` clone).
#[derive(Serialize)]
struct SnookerV2DecisionState<'a> {
    phase: &'a str,
    shooter: u8,
    scores: SeatPair<i64>,
    #[serde(rename = "currentBreak")]
    current_break: i64,
    #[serde(rename = "ballOn")]
    ball_on: BallOn,
    #[serde(rename = "onTable")]
    on_table: &'a [i64],
    #[serde(rename = "respotQueue")]
    respot_queue: &'a [i64],
    #[serde(rename = "pendingDecision")]
    pending_decision: Option<DecisionRequired>,
    #[serde(rename = "foulContext")]
    foul_context: Option<ByPenaltyFouls>,
    result: &'a Option<Terminal>,
    variant: &'a Value,
    #[serde(rename = "freeBallEligible")]
    free_ball_eligible: bool,
    miss: &'a Option<MissContext>,
    #[serde(rename = "missRestore")]
    miss_restore: &'a Option<MissRestore>,
}

/// HUD projection: the v1 projection plus the additive v2 facts.
#[derive(Serialize)]
struct SnookerV2Hud {
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
    #[serde(rename = "freeBallEligible")]
    free_ball_eligible: bool,
    miss: Option<MissContext>,
}

/// The registry entry (registry growth event GH-382 — appended LAST).
pub static ENTRY: RulesetEntry = RulesetEntry {
    id: "snooker-v2",
    initial_state,
    judge,
    apply_decision,
    hud_state,
    catalog,
};

fn parse_state(json: &str) -> Result<SnookerV2MatchState, RulesError> {
    let state: SnookerV2MatchState = serde_json::from_str(json)
        .map_err(|e| RulesError::BadState(
            format!("snooker-v2 state: {e}")))?;
    // variant integrity (config-in-state): parse strictly + verify hash
    parse_variant(state.variant.clone())?;
    Ok(state)
}

fn config_of(state: &SnookerV2MatchState) -> SnookerVariantConfig {
    // parse_state verified the block; this re-read cannot fail
    serde_json::from_value::<VariantBlock>(state.variant.clone())
        .map(|b| b.config)
        .unwrap_or_default()
}

fn state_json(state: &SnookerV2MatchState) -> Result<String, RulesError> {
    serde_json::to_string(state).map_err(|e| {
        RulesError::BadState(format!("snooker-v2 state serialization: {e}"))
    })
}

fn is_over(state: &SnookerV2MatchState) -> bool {
    state.result.is_some() || state.phase == "over"
}

fn pending_kind(state: &SnookerV2MatchState) -> &str {
    state.pending_decision.as_ref().map_or("", |p| p.kind.as_str())
}

/// JS `String(x)` rendering for nomination-gate messages (v1 verbatim).
fn js_string(v: Option<&Value>) -> String {
    match v {
        None => "undefined".to_string(),
        Some(Value::Null) => "null".to_string(),
        Some(Value::String(s)) => s.clone(),
        Some(other) => other.to_string(),
    }
}

/// Lowest remaining colour (the final-phase ball on).
fn lowest_colour_on(on_table: &[i64]) -> Result<i64, RulesError> {
    on_table.iter().copied().filter(|id| is_colour(*id)).min().ok_or_else(
        || RulesError::BadState(
            "snooker-v2: final_colours state has no colour left".to_string(),
        ),
    )
}

/// A validated nomination: the ball plus its free-ball claim.
struct Nomination {
    ball: Option<i64>,
    free_ball: bool,
}

/// v2 `validateCall`: the v1 contract (verbatim messages for v1-shaped
/// calls, fidelity-pinned) extended with the free-ball arm
/// (`{kind:"nominate", ball, freeBall:true}` — module doc).
fn validate_call(
    state: &SnookerV2MatchState,
    call: &Value,
    config: &SnookerVariantConfig,
) -> Result<Nomination, RulesError> {
    let phase = state.phase.as_str();
    // strict boolean parse (review GH-382 r9): a non-boolean freeBall is
    // a malformed call, never silently false — the share codec's
    // explicit boolean validation and this boundary must agree
    let free_flag = match call.get("freeBall") {
        None => false,
        Some(Value::Bool(b)) => *b,
        Some(other) => {
            return Err(RulesError::BadCall(format!(
                "snooker-v2: freeBall must be a boolean, got {}",
                js_string(Some(other))
            )));
        }
    };
    if free_flag {
        if !config.free_ball {
            return Err(RulesError::BadCall(
                "snooker-v2: freeBall nomination with the free_ball config \
                 axis off (adapter error)"
                    .to_string(),
            ));
        }
        if call.get("kind").and_then(Value::as_str) != Some("nominate") {
            return Err(RulesError::BadCall(
                "snooker-v2: a freeBall call MUST carry { kind: \
                 \"nominate\", ball } (adapter contract)"
                    .to_string(),
            ));
        }
        if !state.free_ball_eligible {
            return Err(RulesError::BadCall(
                "snooker-v2: freeBall nomination without a live free-ball \
                 right (WPBSA Sec3 R12 — after a foul only, voided by \
                 play-again/replacement per R12(f))"
                    .to_string(),
            ));
        }
        if phase != "reds" && phase != "final_colours" {
            return Err(RulesError::BadCall(format!(
                "snooker-v2: freeBall nomination in phase '{phase}' \
                 (WPBSA Sec3 R12 — a free ball follows a foul; \
                 '{phase}' never does)"
            )));
        }
        let ball_v = call.get("ball");
        let ball = match ball_v.and_then(Value::as_i64) {
            Some(b) if is_colour(b) => b,
            _ => {
                return Err(RulesError::BadCall(format!(
                    "snooker-v2: nominated free ball {} is not a colour \
                     (16-21)",
                    js_string(ball_v)
                )));
            }
        };
        if !state.on_table.contains(&ball) {
            return Err(RulesError::BadCall(format!(
                "snooker-v2: nominated free ball {ball} is not on the \
                 table"
            )));
        }
        if phase == "final_colours" && ball == lowest_colour_on(
            &state.on_table)? {
            return Err(RulesError::BadCall(format!(
                "snooker-v2: {ball} IS the ball on — a free ball must be \
                 a ball other than the ball on (WPBSA Sec2 R13)"
            )));
        }
        return Ok(Nomination { ball: Some(ball), free_ball: true });
    }
    // ---- v1 contract verbatim -------------------------------------------------
    if phase == "reds" {
        if !call.is_null() {
            return Err(RulesError::BadCall(
                "snooker-v1: a red shot carries no nomination (WPBSA Sec3 \
                 R3(g))"
                    .to_string(),
            ));
        }
        return Ok(Nomination { ball: None, free_ball: false });
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
        return Ok(Nomination { ball: Some(on), free_ball: false });
    }
    Ok(Nomination { ball: Some(ball), free_ball: false })
}

/// "Requires penalty points" (Sec 3 R14(a)(i)): a player's deficit
/// strictly exceeds the points remaining on the table
/// (reds·8 + Σ colour values on the table — module doc).
/// `pending_colour_bonus` prices the colour_after_red opportunity the
/// table formula cannot see: with a colour on after a red, up to the
/// highest colour's value is additionally available BEFORE the stroke
/// (review GH-382 r2 — reds·8 only pairs FUTURE reds with colours).
fn needs_snookers(
    scores: &SeatPair<i64>,
    on_table: &[i64],
    pending_colour_bonus: i64,
) -> bool {
    let reds = on_table.iter().filter(|id| is_red(**id)).count() as i64;
    let colours: i64 = on_table
        .iter()
        .copied()
        .filter(|id| is_colour(*id))
        .map(value_of)
        .sum();
    let remaining = reds * 8 + colours + pending_colour_bonus;
    let deficit = (scores.one - scores.two).abs();
    deficit > remaining
}

/// The touching-ball candidate set at address (module doc): what is on
/// or could be on for THIS stroke. `free_ball_live` is the FULL
/// free-ball condition — the mechanical right AND the geometric
/// snookered fact (judge side: the recorded freeBall nomination;
/// address side: the crate's own R17 computation) — never the bare
/// eligibility (review GH-382 r1 P2: without a snooker nothing "could
/// be on" beyond the phase set).
fn touching_candidates(
    state: &SnookerV2MatchState,
    free_ball_live: bool,
) -> Vec<i64> {
    if free_ball_live {
        // any ball could be nominated as the ball on (Sec2 R13)
        return state.on_table.clone();
    }
    match state.phase.as_str() {
        "reds" => state
            .on_table
            .iter()
            .copied()
            .filter(|id| is_red(*id))
            .collect(),
        "colour_after_red" => state
            .on_table
            .iter()
            .copied()
            .filter(|id| is_colour(*id))
            .collect(),
        "respotted_black" => vec![21],
        _ => lowest_colour_on(&state.on_table)
            .map(|c| vec![c])
            .unwrap_or_default(),
    }
}

/// TS-order judge with the three config-gated mechanics (module doc).
fn judge(state_json_in: &str, record_json: &str, call_json: &str)
    -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    let config = config_of(&state);

    term::guard_not_over(
        is_over(&state),
        "snooker-v2: judge called after the frame ended (adapter contract)",
    )?;
    term::guard_no_pending(
        state.pending_decision.is_some(),
        format!(
            "snooker-v2: judge called while a rulebook decision is pending \
             ('{}') — resolve it via applyDecision",
            pending_kind(&state)
        ),
    )?;
    let call: Value = serde_json::from_str(call_json)
        .map_err(|e| RulesError::BadCall(format!("snooker-v2 call: {e}")))?;
    let nom = validate_call(&state, &call, &config)?;
    let record = wire::parse_record(record_json)?;
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
    let ball_r = record
        .initial
        .balls
        .first()
        .map_or(0.02625, |b| b.params.r);

    // ---- stroke sets (free ball aware — module doc) ----------------------------
    let base_on: Vec<i64> = if phase == "reds" {
        state.on_table.iter().copied().filter(|id| is_red(*id)).collect()
    } else if nom.free_ball {
        // the ball ON is unchanged by the nomination (R12(a)(ii): the
        // free ball is merely REGARDED as it); free ball only arises in
        // reds/final_colours (validated above)
        vec![lowest_colour_on(&state.on_table)?]
    } else {
        vec![nom.ball.expect("colour phases carry a nomination")]
    };
    // first-contact legality set: with a free ball nominated, F alone
    // (R11(b)(iv)); otherwise the balls on
    let contact_set: Vec<i64> = if nom.free_ball {
        vec![nom.ball.expect("free-ball nomination carries a ball")]
    } else {
        base_on.clone()
    };
    // legal pot set: F joins the balls on (R12(c),(d))
    let mut pot_set = base_on.clone();
    if nom.free_ball {
        let f = nom.ball.expect("free-ball nomination carries a ball");
        if !pot_set.contains(&f) {
            pot_set.push(f);
        }
    }
    let value_of_ball_on = if phase == "reds" {
        1
    } else if nom.free_ball {
        // final_colours free ball: the ball ON prices the stroke
        value_of(lowest_colour_on(&state.on_table)?)
    } else {
        value_of(nom.ball.expect("colour phases carry a nomination"))
    };
    // F acquires the value of the ball on (R12(a)(ii))
    let concerned_value = |id: i64| -> i64 {
        if nom.free_ball && Some(id) == nom.ball {
            value_of_ball_on
        } else {
            value_of(id)
        }
    };
    let black_on = phase == "respotted_black"
        || (phase == "final_colours"
            && lowest_colour_on(&state.on_table)? == 21);

    // ---- touching ball at address (Sec 3 R8, config-gated) ---------------------
    let initial_balls = snooker_geom::initial_positions(&record);
    let cue_at_address = initial_balls
        .iter()
        .find(|b| b.id == 0)
        .map(|b| (b.x, b.y));
    // the LIVE free-ball call at address (review GH-382 r7/r8): the
    // referee's call holds whether or not the striker nominates — the
    // judge derives it from the record's own address (eligibility AND
    // the Sec2 R17 geometry at the concrete cue position; a recorded
    // nomination also proves it). Consumed by the touching called set,
    // the R14(a)(i) availability arithmetic and the R14(d) full-ball
    // could-be-on set.
    let free_ball_live = config.free_ball
        && state.free_ball_eligible
        && (nom.free_ball
            || cue_at_address.is_some_and(|cue| snooker_geom::snookered(
                cue, &initial_balls, &base_on, ball_r)));
    let mut touching_called: Vec<i64> = Vec::new();
    let mut deemed_contact = false;
    let mut push_fouls: Vec<i64> = Vec::new();
    let mut push_uncalled = false;
    if config.touching_ball {
        if let Some(cue) = cue_at_address {
            let candidates = touching_candidates(&state, free_ball_live);
            touching_called = snooker_geom::frozen_to(
                cue, &initial_balls, &candidates, ball_r);
            // review r28 P2 (the R8(c) letter): the no-penalty grace
            // holds only "providing the striker ... does not cause ANY
            // touching object ball to move" — the ANNOUNCED set stays
            // the R8(a)/(e) on-set above, but the movement examination
            // covers every frozen neighbour (Sec2 R19(b) makes playing
            // into any of them a push stroke).
            let touching_any = snooker_geom::frozen_to(
                cue, &initial_balls, &state.on_table, ball_r);
            // deemed set: touching balls on, or the declared nomination
            let deemed: Vec<i64> = touching_called
                .iter()
                .copied()
                .filter(|id| {
                    contact_set.contains(id)
                        || (nom.free_ball && Some(*id) == nom.ball)
                })
                .collect();
            // play-away examination (R8(b), review GH-382 r17): played
            // INTO iff the cue's FIRST own event after the strike is a
            // contact with a called touching ball — a shallow/tangential
            // squeeze reaches its contact late (a ~1 µm gap at a
            // grazing angle resolves near half a millisecond) but
            // nothing intervenes, while any genuine play-away puts a
            // cushion, another ball, a motion transition or a jump
            // landing in between before the cue could curve back. The
            // 50 ms ceiling is belt-and-braces against a pure-masse
            // return, which needs hundreds of ms of curve
            // (PUSH_CONTACT_WINDOW documents the immediate band the
            // sanitizer guarantees; the stream-position predicate
            // covers the shallow band above it).
            for ev in &record.events {
                let cue_event = match &ev.kind {
                    WireEventKind::Strike { .. } => false,
                    WireEventKind::BallBall { b1, b2 } => {
                        *b1 == 0 || *b2 == 0
                    }
                    WireEventKind::BallLinearCushion { ball }
                    | WireEventKind::BallCircularCushion { ball }
                    | WireEventKind::BallPocket { ball, .. }
                    | WireEventKind::BallOffTable { ball }
                    | WireEventKind::BallTable { ball }
                    | WireEventKind::Transition { ball } => *ball == 0,
                    WireEventKind::Rest => false,
                };
                if !cue_event {
                    continue;
                }
                // review GH-382 r25 P1: an ELEVATED strike presses the
                // cue into the bed at the strike instant — the kernel
                // emits a launch-time BallTable{0} at t≈1e-9 BEFORE the
                // touching contact at t≈2e-9 (probed at 10°/20°/30°/45°
                // elevation). Inside the sanitizer's immediate band the
                // artifact is part of the strike, not an interposition;
                // a genuine jump landing resolves in milliseconds and
                // still decides below.
                if let WireEventKind::BallTable { ball: 0 } = &ev.kind {
                    if ev.t <= snooker_geom::PUSH_CONTACT_WINDOW {
                        continue;
                    }
                }
                if let WireEventKind::BallBall { b1, b2 } = &ev.kind {
                    let other = if *b1 == 0 { *b2 } else { *b1 };
                    if touching_any.contains(&other) && ev.t <= 0.05 {
                        push_fouls.push(other);
                        // cite selector: a CALLED ball rides R8(b); a
                        // touching ball NOT indicated rides the R8(c)
                        // any-touching-ball condition (review r28)
                        push_uncalled = !touching_called.contains(&other);
                    }
                }
                break; // only the cue's FIRST own event decides
            }
            deemed_contact = push_fouls.is_empty() && !deemed.is_empty();
        }
    }

    // ---- foul detection (v1 order + the v2 arms) --------------------------------
    let mut fouls = Fouls::new();
    let mut concerned: Vec<i64> = Vec::new();
    if !deemed_contact {
        for f in contact::check_first_contact(
            &facts,
            |id| contact_set.contains(&id),
            || Some(CitedFoul::new("no-contact", CITE_NO_CONTACT)),
            |_| Some(CitedFoul::new("wrong-first-ball", CITE_WRONG_FIRST)),
        ) {
            fouls.push(&f.code, &f.cite);
        }
        if let Some(c) = facts.first_contact {
            if !contact_set.contains(&c.ball) {
                concerned.push(c.ball);
            }
        }
    }
    let wrong_pots = pockets::off_set(&facts.pocketed, &pot_set);
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
    }
    if !push_fouls.is_empty() {
        // Sec 3 R8(b): the touching ball moved at the moment of striking
        // (an unannounced neighbour cites the R8(c) any-touching-ball
        // condition instead — review r28 P2)
        fouls.push("push-stroke", if push_uncalled {
            CITE_PUSH_STROKE_NOT_ON
        } else {
            CITE_PUSH_STROKE
        });
        concerned.extend_from_slice(&push_fouls);
    }

    // ---- table bookkeeping (pots + off-table leave) — before the
    // R12(b)(ii) examination, which reads the settled table ------------------------
    let pocketed_ids = facts.pocketed_ids();
    let mut gone: Vec<i64> = Vec::new();
    for id in pocketed_ids.iter().chain(facts.off_table.iter()) {
        if !gone.contains(id) {
            gone.push(*id);
        }
    }

    // ---- R12(b)(ii): free-ball snooker after a non-scoring stroke ---------------
    // "after a non-scoring stroke" (R12(b)(ii)): a legal pot scores,
    // every other outcome — fouls included — does not; the check runs
    // independently of earlier fouls so compound verdicts stay complete
    // (review GH-382 r11)
    let scoring_stroke = fouls.is_empty() && !pocketed_ids.is_empty();
    // a colour leaving the table this stroke respots at adapter-derived
    // XY the crate cannot see (research.md R6) — the settled table this
    // examination needs does not exist crate-side, so the check stands
    // down for that stroke (documented boundary, review GH-382 r12; the
    // compound foul/penalty already ended the turn)
    let colours_left_table =
        gone.iter().any(|id| is_colour(*id));
    if config.free_ball
        && nom.free_ball
        && !scoring_stroke
        && !colours_left_table
    {
        let f = nom.ball.expect("free-ball nomination carries a ball");
        let finals = snooker_geom::final_positions(&record);
        let object_count =
            finals.iter().filter(|b| b.id != 0).count();
        // exception (R12(b)(ii)): only two object balls remaining AND
        // the black among them — the rule enumerates "Pink and Black,
        // or Black and one other colour as described in Section 3,
        // Rule 7"; a black-less pair is NOT exempt (review GH-382 r3)
        // "Pink and Black, or Black and one other COLOUR" (review r16:
        // a red+black pair does not qualify): exactly two object
        // balls, both colours, the black among them
        let two_with_black = object_count == 2
            && finals.iter().any(|b| b.id == 21)
            && finals
                .iter()
                .all(|b| b.id == 0 || is_colour(b.id));
        if !two_with_black {
            // the SETTLED on-set (review r16: a foul stroke that pocketed
            // the last red hands the incoming player the lowest colour —
            // the examination targets what they actually face)
            let reds_final: Vec<i64> = finals
                .iter()
                .map(|b| b.id)
                .filter(|id| is_red(*id))
                .collect();
            let on_final: Vec<i64> = if !reds_final.is_empty() {
                reds_final
            } else {
                finals
                    .iter()
                    .map(|b| b.id)
                    .filter(|id| is_colour(*id))
                    .min()
                    .map(|c| vec![c])
                    .unwrap_or_default()
            };
            if facts.cue_scratch {
                // review r31 P2: after a scratch the incoming player is
                // IN HAND — the examination runs the R17(a) arm over
                // every legally occupiable D sample (no settled cue
                // position is needed, so the r12 stand-down rationale
                // does not apply here)
                let baulk_y = -record.initial.table.length / 2.0
                    + snooker_geom::BAULK_FROM_BOTTOM;
                if snooker_geom::effective_snookerer_is_from_d(
                    baulk_y, &finals, &on_final, f, ball_r)
                {
                    fouls.push("free-ball-snooker", CITE_FREE_BALL_SNOOKER);
                }
            } else if let Some(cue) = finals
                .iter()
                .find(|b| b.id == 0)
                .map(|b| (b.x, b.y))
            {
                if snooker_geom::effective_snookerer_is(
                    cue, &finals, &on_final, f, ball_r)
                {
                    fouls.push("free-ball-snooker", CITE_FREE_BALL_SNOOKER);
                }
            }
        }
    }

    let foul = !fouls.is_empty();
    // Sec 3 R11(d)(iii): successive reds (v1 arm — with the free-ball
    // arm now live: `colour_after_red` follows a potted
    // free-ball-as-red too, so this stroke's red-first contact prices
    // at seven regardless of how the phase was entered)
    // deemed contact (R8(c)) makes the touching nominated colour the
    // LOGICAL first hit — a later red contact is then post-first-contact
    // and never the R11(d)(iii) seven-pointer (review GH-382 r10)
    let successive_reds = !deemed_contact
        && phase == "colour_after_red"
        && facts.first_contact.as_ref().is_some_and(|c| is_red(c.ball));
    let concerned_values: Vec<i64> =
        concerned.iter().map(|id| concerned_value(*id)).collect();
    let pen = if successive_reds {
        7
    } else if foul {
        penalty::snooker_penalty(value_of_ball_on, &concerned_values)
    } else {
        0
    };

    let mut on_table: Vec<i64> = state
        .on_table
        .iter()
        .copied()
        .filter(|id| !gone.contains(id))
        .collect();
    // P13 respots: v1 rule (fouls in any phase; the colour-after-red
    // pot), plus the potted free ball (R12(c) — spotted even on a
    // legal stroke in any phase)
    let colours_gone = respot_chain::sort_highest_first(
        gone.iter().copied().filter(|id| is_colour(*id)).collect());
    let mut respot: Vec<i64> = Vec::new();
    if !colours_gone.is_empty() && (foul || phase == "colour_after_red") {
        respot = colours_gone;
    } else if nom.free_ball && !foul {
        let f = nom.ball.expect("free-ball nomination carries a ball");
        if gone.contains(&f) {
            respot = vec![f];
        }
    }

    // ---- scoring (free ball aware — module doc) ---------------------------------
    let mut scores = state.scores;
    let mut points = 0i64;
    if foul {
        *scores.get_mut(opp) += pen;
    } else if nom.free_ball {
        let f = nom.ball.expect("free-ball nomination carries a ball");
        if phase == "reds" {
            // R12(e): Red on — each potted ball scores (F as a red)
            points = pocketed_ids
                .iter()
                .map(|id| if *id == f { 1 } else { value_of(*id) })
                .sum();
        } else {
            // final_colours: the ball on scores at most once (R12(c)-(e))
            points = if pocketed_ids.is_empty() {
                0
            } else {
                value_of_ball_on
            };
        }
        *scores.get_mut(shooter) += points;
    } else {
        points = pocketed_ids.iter().map(|id| value_of(*id)).sum();
        *scores.get_mut(shooter) += points;
    }
    let potted = !foul && !pocketed_ids.is_empty();

    // ---- terminal / re-spotted black arms (v1, R4(a),(b)) ------------------------
    let mut terminal: Option<Terminal> = None;
    let mut decision: Option<DecisionRequired> = None;
    let mut next_phase: String;
    let mut ball_in_hand = if foul && facts.cue_scratch {
        PlacementRight::DZone
    } else {
        PlacementRight::None
    };

    // ---- the miss examination (Sec 3 R14, config-gated) --------------------------
    // Sec 2 R21: the cue-ball failed to first hit a ball on / the
    // nominated free ball. Deemed contact (R8(c)) is not a miss.
    let missed_fact = foul
        && fouls.as_slice().iter().any(|f| {
            f.code == "no-contact" || f.code == "wrong-first-ball"
        });

    if phase == "respotted_black" {
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
        if scores.one != scores.two {
            terminal = Some(term::terminal(
                if scores.one > scores.two { 1 } else { 2 },
                if potted { "black-potted" } else { "foul-on-black" },
                CITE_FRAME_END,
            ));
            next_phase = "over".to_string();
            ball_in_hand = PlacementRight::None;
        } else {
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
            decision = Some(DecisionRequired {
                kind: "play_again".to_string(),
                chooser: Chooser::Seat(opp),
            });
        }
    }

    // ---- Sec 3 R14: upgrade the foul option to FOUL AND A MISS -------------------
    let mut next_miss: Option<MissContext> = None;
    let mut next_miss_restore: Option<MissRestore> = None;
    if config.miss_rule
        && missed_fact
        && terminal.is_none()
        && decision.as_ref().is_some_and(|d| d.kind == "play_again")
    {
        let in_sequence = state.miss.is_some();
        // (d) gate fact, computed once at the sequence's first miss from
        // the original position (the record's initial placements) — over
        // the balls "on or that could have been on" (the R14(d) text:
        // in colour_after_red every colour could have been nominated)
        let full_ball = if let Some(m) = &state.miss {
            m.full_ball
        } else if let Some(cue) = cue_at_address {
            let could_be_on = touching_candidates(&state, free_ball_live);
            snooker_geom::full_ball_available(
                cue, &initial_balls, &could_be_on, ball_r, phase == "reds")
                || !touching_called.is_empty()
        } else {
            false
        };
        // R14(a)(i) points-needed exemption; (d)(i) overrides it inside
        // a full-ball sequence ("regardless of the difference in scores").
        // The post-stroke table INCLUDES the pending respots (review
        // GH-382 r1 P1: a colour potted on the foul returns to the
        // table, so its points remain available "as a result of the
        // stroke").
        let mut table_after = on_table.clone();
        for id in &respot {
            if !table_after.contains(id) {
                table_after.push(*id);
            }
        }
        // the before-stroke leg prices the colour_after_red opportunity
        // (the striker was on a colour worth up to the highest on the
        // table); a post-foul phase is never colour_after_red, so the
        // after leg carries no bonus
        let mut before_bonus = if phase == "colour_after_red" {
            state
                .on_table
                .iter()
                .copied()
                .filter(|id| is_colour(*id))
                .map(value_of)
                .max()
                .unwrap_or(0)
        } else {
            0
        };
        // a LIVE free ball adds a scoring opportunity the table formula
        // cannot see (review GH-382 r8): a red-equivalent (+8) with Reds
        // on, the ball on's value once in final_colours (F pots for it
        // and respots while the ball on stays)
        if free_ball_live {
            before_bonus += if phase == "reds" {
                8
            } else {
                value_of_ball_on
            };
        }
        // the miss itself may AWARD a free ball (the incoming player
        // snookered at the settled position) — its scoring opportunity
        // counts "as a result of the stroke" exactly like a pre-stroke
        // one (review GH-382 r18): +8 with Reds remaining, else the
        // settled ball on's value
        let after_bonus = if !config.free_ball {
            // no free-ball axis: no bonus can exist (review r20)
            0
        } else if gone.iter().any(|id| is_colour(*id)) {
            // a colour is respotting at adapter-derived XY the crate
            // cannot see (review GH-382 r19, the r12 stand-down's twin):
            // the settled geometry is unknowable, and an exemption may
            // only arm on CERTAIN arithmetic — the unknowable snooker
            // resolves toward calling the miss (the strict-liability
            // direction: the non-offender gains options, never points).
            // Red availability reads the POST-stroke table (review r20:
            // the same stroke may have removed the last red)
            if table_after.iter().any(|id| is_red(*id)) {
                8
            } else {
                table_after
                    .iter()
                    .copied()
                    .filter(|id| is_colour(*id))
                    .min()
                    .map(value_of)
                    .unwrap_or(0)
            }
        } else {
            let finals = snooker_geom::final_positions(&record);
            let reds_final: Vec<i64> = finals
                .iter()
                .map(|b| b.id)
                .filter(|id| is_red(*id))
                .collect();
            let on_final: Vec<i64> = if !reds_final.is_empty() {
                reds_final
            } else {
                finals
                    .iter()
                    .map(|b| b.id)
                    .filter(|id| is_colour(*id))
                    .min()
                    .map(|c| vec![c])
                    .unwrap_or_default()
            };
            let snookered_after = match finals
                .iter()
                .find(|b| b.id == 0)
                .map(|b| (b.x, b.y))
            {
                // a scratch leaves in-hand: the incoming player plays
                // from the D, and since review r31 the crate OWNS that
                // geometry (BAULK_FROM_BOTTOM + the documented R17(a)
                // lattice — the record carries the table length), so the
                // examination runs the same Sec2 R17(a) arm the
                // free-ball-snooker scratch leg and the address surface
                // run (review r34 P2: the r22 "unknowable" stand-down was
                // overtaken by r31 — answering the same geometric
                // question two different ways would be a hidden
                // heuristic). An OPEN table from the D awards no free
                // ball, so no phantom bonus may inflate the R14(a)(i)
                // points-remaining arithmetic.
                None => snooker_geom::snookered_from_d(
                    -record.initial.table.length / 2.0
                        + snooker_geom::BAULK_FROM_BOTTOM,
                    &finals, &on_final, ball_r),
                Some(cue) => snooker_geom::snookered(
                    cue, &finals, &on_final, ball_r),
            };
            if config.free_ball && snookered_after {
                if on_final.iter().any(|id| is_red(*id)) {
                    8
                } else {
                    on_final.first().copied().map(value_of).unwrap_or(0)
                }
            } else {
                0
            }
        };
        let exempt = (needs_snookers(&state.scores, &state.on_table,
            before_bonus)
            || needs_snookers(&scores, &table_after, after_bonus))
            && !(in_sequence && full_ball);
        if !exempt {
            if state.miss.as_ref().is_some_and(|m| m.warned) {
                // R14(d)(ii): a further failure after the Warning awards
                // the frame
                terminal = Some(term::terminal(
                    i64::from(opp), "miss-frame-award",
                    CITE_MISS_FRAME_AWARD));
                decision = None;
                ball_in_hand = PlacementRight::None;
                next_phase = "over".to_string();
            } else {
                decision = Some(DecisionRequired {
                    kind: "foul_and_a_miss".to_string(),
                    chooser: Chooser::Seat(opp),
                });
                next_miss = Some(MissContext {
                    count: state.miss.as_ref().map_or(1, |m| m.count + 1),
                    warned: state
                        .miss
                        .as_ref()
                        .is_some_and(|m| m.warned),
                    full_ball,
                });
                next_miss_restore = Some(MissRestore {
                    phase: state.phase.clone(),
                    ball_on: state.ball_on,
                    on_table: state.on_table.clone(),
                });
            }
        }
    }

    for id in &respot {
        if !on_table.contains(id) {
            on_table.push(*id);
        }
    }
    let on_table = respot_chain::sort_numeric(on_table);

    // ---- seat + next state assembly (v1) -----------------------------------------
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
        _ => state.ball_on,
    };
    let current_break =
        if terminal.is_none() && turn_pre == Turn::Continue && !foul {
            state.current_break + points
        } else {
            0
        };
    let foul_context = if foul {
        Some(fouls_mod::FoulContextPenalty {
            fouls: fouls.as_slice().to_vec(),
            by: i64::from(shooter),
            penalty: pen,
        })
    } else {
        None
    };

    // Sec 3 R12: a non-terminal foul arms the incoming player's
    // free-ball right (the geometric confirm is the adapter's address
    // query — module doc); every other outcome consumes it.
    let next_free_ball_eligible =
        config.free_ball && foul && terminal.is_none();

    let legal = fouls.legal();
    let judgment = Judgment {
        legal,
        fouls: fouls.into_vec(),
        pocketed: pocketed_ids,
        ball_in_hand,
        respot: respot.clone(),
        turn: if foul { Turn::Pass } else { turn_pre },
        decision_required: decision.clone(),
        terminal: terminal.clone(),
        next: SnookerV2MatchState {
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
            variant: state.variant.clone(),
            free_ball_eligible: next_free_ball_eligible,
            miss: next_miss,
            miss_restore: next_miss_restore,
        },
    };
    judgment.to_json()
}

/// Initial state for a resolved config (the preset path,
/// contracts/registry-api.md §3 config-in-state).
pub(crate) fn initial_state_for_config(
    config: SnookerVariantConfig,
    breaker: u8,
) -> Result<String, RulesError> {
    let variant = serde_json::to_value(VariantBlock::from_config(config))
        .map_err(|e| RulesError::BadState(
            format!("snooker-v2 variant serialization: {e}")))?;
    state_json(&SnookerV2MatchState {
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
        variant,
        free_ball_eligible: false,
        miss: None,
        miss_restore: None,
    })
}

fn initial_state(breaker: u8) -> Result<String, RulesError> {
    initial_state_for_config(SnookerVariantConfig::default(), breaker)
}

/// applyDecision: the v1 liturgy for ids 7/8 plus decision 17
/// `foul_and_a_miss` (module doc).
fn apply_decision(state_json_in: &str, decision_json: &str)
    -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    term::guard_not_over(
        is_over(&state),
        "snooker-v2: no decision can be applied after the frame ended",
    )?;
    let d = decisions::parse_decision(decision_json)?;
    let kind = match d.decision {
        7 => "play_again",
        8 => "respotted_black_toss",
        17 => "foul_and_a_miss",
        other => {
            return Err(decisions::unknown_id(format!(
                "snooker-v2: unknown decision id {other}"
            )));
        }
    };
    let choice_max = if kind == "foul_and_a_miss" { 3 } else { 2 };
    decisions::check_choice(
        d.choice >= 1 && d.choice <= choice_max,
        format!("snooker-v2: choice {} out of range for '{kind}'", d.choice),
    )?;
    decisions::check_pending(
        state.pending_decision.as_ref().is_some_and(|p| p.kind == kind),
        format!(
            "snooker-v2: decision '{kind}' does not match the pending \
             option ('{}')",
            state.pending_decision.as_ref()
                .map_or("none", |p| p.kind.as_str())
        ),
    )?;

    let chooser = match state.pending_decision.as_ref().map(|p| p.chooser) {
        Some(Chooser::Seat(n)) => n,
        _ => state.shooter,
    };

    if kind == "foul_and_a_miss" {
        // Sec 3 R14(b): 1 = non-offender plays from the position left;
        // 2 = offender plays again from the position left; 3 = offender
        // plays again from the ORIGINAL position (balls replaced).
        let offender = turn::other(chooser);
        let shooter = if d.choice == 1 { chooser } else { offender };
        let miss = state.miss.clone().ok_or_else(|| {
            RulesError::BadState(
                "snooker-v2: foul_and_a_miss pending without a miss \
                 context"
                    .to_string(),
            )
        })?;
        if d.choice == 3 {
            let restore = state.miss_restore.clone().ok_or_else(|| {
                RulesError::BadState(
                    "snooker-v2: foul_and_a_miss pending without a \
                     missRestore point"
                        .to_string(),
                )
            })?;
            // R14(d)(ii): sent back after the second failure -> Warned
            let warned =
                miss.warned || (miss.count >= 2 && miss.full_ball);
            let next_miss = Some(MissContext { warned, ..miss });
            let next = SnookerV2DecisionState {
                phase: &restore.phase,
                shooter,
                scores: state.scores,
                current_break: 0,
                ball_on: restore.ball_on,
                on_table: &restore.on_table,
                respot_queue: &[],
                pending_decision: None,
                foul_context: state
                    .foul_context
                    .as_ref()
                    .map(ByPenaltyFouls::from),
                result: &state.result,
                variant: &state.variant,
                // R12(f): EVERY replacement request voids the free-ball
                // option — the restored position never carries one
                // (review GH-382 r1 P1)
                free_ball_eligible: false,
                miss: &next_miss,
                miss_restore: &None,
            };
            return serde_json::to_string(&next).map_err(|e| {
                RulesError::BadState(format!(
                    "snooker-v2 state serialization: {e}"))
            });
        }
        // choices 1/2: the position left — the sequence ends (R14(d)(iii));
        // choice 2 voids the free-ball right (R12(f)), choice 1 keeps it
        let next = SnookerV2DecisionState {
            phase: &state.phase,
            shooter,
            scores: state.scores,
            current_break: state.current_break,
            ball_on: state.ball_on,
            on_table: &state.on_table,
            respot_queue: &state.respot_queue,
            pending_decision: None,
            foul_context: state
                .foul_context
                .as_ref()
                .map(ByPenaltyFouls::from),
            result: &state.result,
            variant: &state.variant,
            free_ball_eligible: state.free_ball_eligible && d.choice == 1,
            miss: &None,
            miss_restore: &None,
        };
        return serde_json::to_string(&next).map_err(|e| {
            RulesError::BadState(format!(
                "snooker-v2 state serialization: {e}"))
        });
    }

    let shooter = if kind == "play_again" {
        if d.choice == 1 { chooser } else { turn::other(chooser) }
    } else {
        // respotted_black_toss (Sec 3 R4(b))
        if d.choice == 1 { 1 } else { 2 }
    };
    // play_again choice 2 / the toss void the free-ball right (R12(f);
    // the re-spotted black has no ball not-on to nominate)
    let free_ball_eligible = kind == "play_again"
        && d.choice == 1
        && state.free_ball_eligible;
    let next = SnookerV2DecisionState {
        phase: &state.phase,
        shooter,
        scores: state.scores,
        current_break: state.current_break,
        ball_on: state.ball_on,
        on_table: &state.on_table,
        respot_queue: &state.respot_queue,
        pending_decision: None,
        foul_context: state.foul_context.as_ref().map(ByPenaltyFouls::from),
        result: &state.result,
        variant: &state.variant,
        free_ball_eligible,
        miss: &None,
        miss_restore: &None,
    };
    serde_json::to_string(&next).map_err(|e| {
        RulesError::BadState(format!("snooker-v2 state serialization: {e}"))
    })
}

/// HUD projection (v1 fields + the additive v2 facts).
fn hud_state(state_json_in: &str) -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    let reds_remaining =
        state.on_table.iter().filter(|id| is_red(**id)).count() as i64;
    let hud = SnookerV2Hud {
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
        free_ball_eligible: state.free_ball_eligible,
        miss: state.miss,
    };
    serde_json::to_string(&hud).map_err(|e| {
        RulesError::BadState(format!("snooker-v2 hud serialization: {e}"))
    })
}

// ---- the adapter address surface (module doc: Free Ball / Touching Ball) -------

/// Positions payload for [`address_facts_json`] (adapter-owned live
/// table truth: post-respot, post-placement).
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AddressPositions {
    /// Ball radius (metres).
    r: f64,
    /// Baulk-line kernel y (the D's diameter line — Sec 1 R1(d)).
    #[serde(rename = "baulkY")]
    baulk_y: f64,
    /// Cue centre, or null when in-hand (then Sec 2 R17(a) applies).
    cue: Option<XY>,
    /// Every object ball in play.
    balls: Vec<AddressBall>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct XY {
    x: f64,
    y: f64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AddressBall {
    id: i64,
    x: f64,
    y: f64,
}

#[derive(Serialize)]
struct AddressFacts {
    /// Called touching balls (Sec 3 R8(a)) — empty when in-hand.
    touching: Vec<i64>,
    /// Sec 2 R17 snookered on the ball(s) on (R17(a) from the D when
    /// in-hand). With [`SnookerV2MatchState::free_ball_eligible`] this
    /// IS the referee's FREE BALL call (Sec 3 R12).
    snookered: bool,
}

/// The address examination (module doc): touching-ball called set +
/// the snookered fact, from the LIVE positions the adapter owns.
pub fn address_facts_json(
    state_json_in: &str,
    positions_json: &str,
) -> Result<String, RulesError> {
    let state = parse_state(state_json_in)?;
    let config = config_of(&state);
    let pos: AddressPositions = serde_json::from_str(positions_json)
        .map_err(|e| RulesError::BadCall(
            format!("snooker-v2 address positions: {e}")))?;
    let mut balls: Vec<snooker_geom::BallXY> = pos
        .balls
        .iter()
        .map(|b| snooker_geom::BallXY { id: b.id, x: b.x, y: b.y })
        .collect();
    if let Some(c) = &pos.cue {
        balls.push(snooker_geom::BallXY { id: 0, x: c.x, y: c.y });
    }
    let on_ids: Vec<i64> = match state.phase.as_str() {
        "reds" => state
            .on_table
            .iter()
            .copied()
            .filter(|id| is_red(*id))
            .collect(),
        "colour_after_red" => state
            .on_table
            .iter()
            .copied()
            .filter(|id| is_colour(*id))
            .collect(),
        "respotted_black" => vec![21],
        "final_colours" => vec![lowest_colour_on(&state.on_table)?],
        _ => Vec::new(),
    };
    // Sec 2 R17(d)/(c): "snookered" for the FREE BALL call examines the
    // ball(s) on for the stroke the incoming striker faces. In
    // `colour_after_red` the striker chooses the colour, so the on-set
    // is every colour — obstruction must hold for all of them.
    let snookered = match &pos.cue {
        Some(c) => snooker_geom::snookered(
            (c.x, c.y), &balls, &on_ids, pos.r),
        None => snooker_geom::snookered_from_d(
            pos.baulk_y, &balls, &on_ids, pos.r),
    };
    // the called set widens to every ball only under a LIVE free ball
    // (eligibility AND the snookered finding — review GH-382 r1 P2)
    let free_ball_live = state.free_ball_eligible && snookered;
    // the touching call exists only under its config axis (review GH-382
    // r8: a free_ball-only config still needs the snookered fact here,
    // but announcing R8 calls the judge would ignore is a contradiction)
    let touching = match &pos.cue {
        Some(c) if config.touching_ball => snooker_geom::frozen_to(
            (c.x, c.y),
            &balls,
            &touching_candidates(&state, free_ball_live),
            pos.r,
        ),
        _ => Vec::new(),
    };
    let facts = AddressFacts { touching, snookered };
    serde_json::to_string(&facts).map_err(|e| {
        RulesError::BadState(format!(
            "snooker-v2 address facts serialization: {e}"))
    })
}

/// Catalog row: the v1 foul set + the GH-382 additions, decisions
/// 7/8/14, the v1 terminal reasons + `miss-frame-award`, and the
/// config POINTER block (the eightball-v2/fourteenone convention: the
/// real config lives per-preset in the catalog rows; this block names
/// the one task-config mechanism + the FR-005 default).
fn catalog() -> CatalogEntry {
    CatalogEntry {
        id: "snooker-v2",
        fouls: vec![
            CitedFoul::new("no-contact", CITE_NO_CONTACT),
            CitedFoul::new("wrong-first-ball", CITE_WRONG_FIRST),
            CitedFoul::new("not-nominated", CITE_NOT_NOMINATED),
            CitedFoul::new("ball-off-table", CITE_OFF_TABLE),
            CitedFoul::new("scratch", CITE_SCRATCH),
            CitedFoul::new("jump-over", CITE_JUMP_OVER),
            CitedFoul::new("push-stroke", CITE_PUSH_STROKE),
            // the dual-touch arm (review r28/r30): the same code cites
            // R8(c) when an UNANNOUNCED touching neighbour was moved —
            // the catalog lists every emitted {code, cite} pair
            CitedFoul::new("push-stroke", CITE_PUSH_STROKE_NOT_ON),
            CitedFoul::new("free-ball-snooker", CITE_FREE_BALL_SNOOKER),
        ],
        decisions: vec![
            DecisionRow { id: 7, kind: "play_again", choice_max: 2 },
            DecisionRow {
                id: 8,
                kind: "respotted_black_toss",
                choice_max: 2,
            },
            DecisionRow {
                id: 17,
                kind: "foul_and_a_miss",
                choice_max: 3,
            },
        ],
        terminals: vec![
            "respotted-black-foul", "respotted-black-potted", "black-potted",
            "foul-on-black", "miss-frame-award",
        ],
        config: serde_json::json!({
            "family": "snooker",
            "configSchema": crate::task_config::TASK_CONFIG_SCHEMA,
            "defaultPreset": "wpbsa-snooker",
        }),
    }
}
