// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `eightball-v2` (feature 022, T005) — the config-in-state interpreter
//! per the registry API contract §3 and the feature data-model §2: the SAME
//! primitives eightball-v1 composes (P3/P5/P6/P8/P9/P12/P13/P16/P17/
//! P18), with every research-R5 axis read as table/branch data from the
//! state's `variant.config`. `eightball.rs` (v1) stays BYTE-UNTOUCHED;
//! this module reuses only its public state type.
//!
//! State = the v1 8-ball state shape + one ADDITIVE top-level block,
//! re-emitted verbatim in every judgment's `next`:
//!
//! ```json
//! "variant": { "task_hash": "<hex>", "config": { …canonical config… } }
//! ```
//!
//! A missing or malformed `variant` block (unknown fields, bad domains,
//! a `task_hash` that is not the hash of the config bytes) is
//! `invalid-task-config` — NEVER a default fallback: the config is a
//! determinism key (FR-008 identity triple).
//!
//! Citation doctrine (the feature data-model §2 / FR-003): the family's baseline
//! mechanism fouls (scratch, no-contact, wrong-first-ball,
//! no-rail-after-contact, ball-off-table) carry the v1 WPA cites — the
//! WPA text is the family's tier-primary authority and the config
//! carries no rulebook identity of its own. Config-VARYING consequences
//! carry per-VALUE cites (the APA-harvested clause for the APA-sourced
//! values; an explicit `variant …=… (unsliced schema point)` marker for
//! legal-but-unsliced values, which FR-009 forbids shipping in a preset
//! until their own slice freezes real bytes).
//!
//! Under the resolved `wpa-8ball` config (pure defaults) every judgment
//! equals eightball-v1's field-for-field with only the additive
//! `next.variant` block on top — the T007 fidelity anchor; the parity
//! tests below pin it structurally.
//!
//! Decision ids 1–5 keep their frozen global meanings (P16 id space
//! untouched): config values that replace a decision birth (e.g. APA
//! `eight_on_break: win_unless_scratch`) simply stop the row from
//! firing — `apply_decision` semantics are config-independent because a
//! pending option only exists if a judgment (already config-routed)
//! created it.

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
use crate::rulesets::eightball::EightBallMatchState;
use crate::rulesets::registry::{CatalogEntry, DecisionRow, RulesetEntry};
use crate::task_config::{
    canonical_envelope_json, sha256_hex, validate_config, BreakScratchBih,
    CallShot, DryBreakConsequence, EightBallVariantConfig, EightOnBreak,
    JumpedBall, KitchenRule, OpenTableAssignment, ScratchOnEight,
};
use crate::wire;

// ---- pinned citation strings ---------------------------------------------------
// Baseline mechanism cites = the v1 WPA strings (module doc: citation
// doctrine). Value-keyed cites carry the T002 APA harvest clauses.

const CITE_SCRATCH: &str = "WPA 3.1 via 4.9";
const CITE_SCRATCH_BREAK: &str = "WPA 3.1 via 4.3(g),(h)";
// no-contact cites 3.3 (issue #62 erratum, audit-8ball F1 — mirrors the
// v1 constants): the contact requirement is 3.3's first sentence; 3.2
// presupposes a contact.
const CITE_NO_CONTACT: &str = "WPA 3.3 via 4.9";
const CITE_NO_CONTACT_BREAK: &str = "WPA 3.3 via 4.3(g),(h)";
const CITE_WRONG_FIRST: &str = "WPA 3.2 via 4.4/4.9";
const CITE_NO_RAIL: &str = "WPA 3.3 via 4.9";
const CITE_OFF_TABLE: &str = "WPA 3.5 via 4.9";
const CITE_OFF_TABLE_BREAK: &str = "WPA 3.5 via 4.3(g),(h)";
const CITE_BAD_BREAK: &str = "WPA 4.3(d)";
// GH-371 (config axis `kitchen_rule`, value `wpa`): the 3.11 kitchen-shot
// law judged as an 8-ball standard foul (4.9 lists 3.11; BIH anywhere).
const CITE_KITCHEN: &str = "WPA 3.11 via 4.9";
const CITE_WIN: &str = "WPA Sec. 4 intro; 4.6";
const CITE_LOSS_FOUL: &str = "WPA 4.8(a)";
const CITE_LOSS_EARLY: &str = "WPA 4.8(b)";
const CITE_LOSS_POCKET: &str = "WPA 4.8(c)";
const CITE_LOSS_OFF: &str = "WPA 4.8(d)";

// value-keyed cites (T002 APA clause harvest, pinned edition '26-'29)
const CITE_APA_EIGHT_ON_BREAK: &str = "APA OTM After The Break pp.46-47 (b)";
const CITE_APA_REBREAK: &str = "APA OTM Breaking pp.45-46 (re-break)";
const CITE_APA_SCRATCH_ON_EIGHT: &str =
    "APA OTM How To Win A Game pp.55-56 (g)";
const CITE_APA_WIN: &str = "APA OTM How To Win A Game pp.55-56 (a)";
const CITE_APA_LOSS_FOUL: &str = "APA OTM How To Win A Game pp.55-56";
const CITE_APA_LOSS_EARLY: &str = "APA OTM How To Win A Game pp.55-56";
const CITE_APA_LOSS_POCKET: &str =
    "APA OTM How To Win A Game pp.55-56 (c),(d)";
const CITE_APA_LOSS_OFF: &str = "APA OTM Balls On The Floor p.49";

// unsliced schema points (the variant-config contract §2: legal domains
// with no shipped preset consumer; FR-009 requires their own frozen
// slice before any preset ships them — these markers are provisional)
const CITE_UNSLICED_EIGHT_ON_BREAK_WIN: &str =
    "variant eight_on_break=win (unsliced schema point)";
const CITE_UNSLICED_DRY_BREAK_LOSS: &str =
    "variant dry_break_consequence=loss (unsliced schema point)";
const CITE_UNSLICED_CALL_NONE: &str =
    "variant call_shot=none (unsliced schema point)";

// ---- shared 8-ball table facts (duplicated from v1: that file is
// byte-frozen, its helpers private) ----------------------------------------------

/// The full 15-ball rack.
fn full_rack() -> Vec<i64> {
    (1..=15).collect()
}

/// Ball group per WPA 4.4 / APA categories: solids 1–7, stripes 9–15.
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

// ---- the additive variant block (the registry API contract §3) ----------------

/// The config-in-state carriage: `{task_hash, config}`, declaration
/// order = the contract's JSON example. Deserialization is STRICT and
/// every error is `invalid-task-config` (never `bad-state`, never a
/// default fallback).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VariantBlock {
    pub task_hash: String,
    pub config: EightBallVariantConfig,
}

impl VariantBlock {
    /// Build the block for a validated config: canonical envelope bytes
    /// hashed by the crate's ONE hasher (SC-007).
    pub(crate) fn for_config(config: EightBallVariantConfig) -> VariantBlock {
        let hash = sha256_hex(canonical_envelope_json(&config).as_bytes());
        VariantBlock { task_hash: hash, config }
    }
}

fn invalid_cfg(msg: impl Into<String>) -> RulesError {
    RulesError::InvalidTaskConfig(msg.into())
}

/// STRICT variant-block parse: unknown fields, config domain
/// violations, and a `task_hash` that is not the SHA-256 of the config's
/// canonical envelope bytes all reject (`invalid-task-config`) — the
/// hash IS the variant identity (FR-008), so a state carrying a
/// mismatched pair is corrupt, not reinterpretable.
fn parse_variant(v: Value) -> Result<VariantBlock, RulesError> {
    let block: VariantBlock = serde_json::from_value(v)
        .map_err(|e| invalid_cfg(format!(
            "eightball-v2 state: variant block: {e}")))?;
    validate_config(&block.config)?;
    let expected =
        sha256_hex(canonical_envelope_json(&block.config).as_bytes());
    if block.task_hash != expected {
        return Err(invalid_cfg(format!(
            "eightball-v2 state: variant.task_hash '{}' is not the hash of \
             the config bytes (expected '{expected}')",
            block.task_hash
        )));
    }
    Ok(block)
}

/// The complete v2 state: the v1 shape (flattened — key order preserved)
/// plus the additive `variant` block, then the GH-371 additive
/// `kitchenBih` flag (the NEXT stroke begins from a kitchen-restricted
/// in-hand grant — the WPA 3.11 context; old states default `false`).
/// Serialization side only; the parse side splits by hand so the
/// `variant` errors carry the `invalid-task-config` code while
/// base-shape errors stay `bad-state`.
#[derive(Serialize)]
struct V2State {
    #[serde(flatten)]
    base: EightBallMatchState,
    variant: VariantBlock,
    #[serde(rename = "kitchenBih")]
    kitchen_bih: bool,
}

fn parse_state(json: &str)
    -> Result<(EightBallMatchState, VariantBlock, bool), RulesError> {
    let v: Value = serde_json::from_str(json)
        .map_err(|e| RulesError::BadState(format!("eightball-v2 state: {e}")))?;
    let Value::Object(mut obj) = v else {
        return Err(RulesError::BadState(
            "eightball-v2 state: not a JSON object".to_string()));
    };
    let variant_v = obj.remove("variant").ok_or_else(|| invalid_cfg(
        "eightball-v2 state: missing 'variant' block (config-in-state, \
         contracts/registry-api.md §3 — never a default fallback)"))?;
    let variant = parse_variant(variant_v)?;
    // GH-371 additive flag: absent on pre-371 states (defaults false —
    // recorded games never start judging 3.11 mid-flight); a PRESENT
    // non-boolean is a malformed state, never reinterpreted (review r1
    // P2 — a null/string here must not silently unrestrict a stroke).
    let kitchen_bih = match obj.remove("kitchenBih") {
        None => false,
        Some(Value::Bool(b)) => b,
        Some(other) => {
            return Err(RulesError::BadState(format!(
                "eightball-v2 state: kitchenBih must be a boolean, \
                 got {other}"
            )));
        }
    };
    let base: EightBallMatchState =
        serde_json::from_value(Value::Object(obj)).map_err(|e| {
            RulesError::BadState(format!("eightball-v2 state: {e}"))
        })?;
    Ok((base, variant, kitchen_bih))
}

fn state_json(base: &EightBallMatchState, variant: &VariantBlock,
    kitchen_bih: bool) -> Result<String, RulesError> {
    serde_json::to_string(&V2State {
        base: base.clone(),
        variant: variant.clone(),
        kitchen_bih,
    })
    .map_err(|e| RulesError::BadState(format!(
        "eightball-v2 state serialization: {e}")))
}

/// Fresh 15-ball rack at the break address (v1 `fresh_rack` shape).
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

/// Initial v2 state for a validated config (the `task_initial_state_json`
/// backend, wired by T006).
pub(crate) fn initial_state_for_config(
    config: EightBallVariantConfig, breaker: u8,
) -> Result<String, RulesError> {
    // kitchenBih true: the opening break is played from behind the head
    // string (WPA 4.3(a); the break stroke itself is 3.11-exempt —
    // break failures ride the 4.3 break-foul law).
    state_json(&fresh_rack(breaker), &VariantBlock::for_config(config), true)
}

/// Registry `initial_state`: default-preset resolution — `wpa-8ball`
/// resolves byte-identical to the pure-defaults config point
/// (the registry API contract §1; task_config.rs pins the equivalence).
fn initial_state(breaker: u8) -> Result<String, RulesError> {
    initial_state_for_config(EightBallVariantConfig::default(), breaker)
}

// ---- shared predicates ---------------------------------------------------------

fn is_over(state: &EightBallMatchState) -> bool {
    state.result.is_some() || state.phase == "over"
}

fn pending_kind(state: &EightBallMatchState) -> &str {
    state.pending_decision.as_ref().map_or("", |p| p.kind.as_str())
}

fn pending(kind: &str, chooser: u8) -> DecisionRequired {
    DecisionRequired {
        kind: kind.to_string(),
        chooser: Chooser::Seat(chooser),
    }
}

/// The single group covering every GROUPED ball in `pocketed` (the 8 and
/// out-of-range ids are skipped — they ride their own paths): the
/// `take_what_you_make` assignment probe (APA OTM After The Break (c)).
fn single_group(pocketed: &[i64]) -> Option<&'static str> {
    let mut found: Option<&'static str> = None;
    for id in pocketed {
        let Some(g) = group_of(*id) else { continue };
        match found {
            None => found = Some(g),
            Some(f) if f != g => return None,
            _ => {}
        }
    }
    found
}

/// Seat-keyed group assignment: `seat` takes `g`, the opponent the other.
fn assign_groups(seat: u8, g: &str) -> SeatPair<String> {
    let g2 = if g == "solids" { "stripes" } else { "solids" };
    if seat == 1 {
        SeatPair::new(g.to_string(), g2.to_string())
    } else {
        SeatPair::new(g2.to_string(), g.to_string())
    }
}

// ---- call inputs (the R5 call-regime axis: call_shot + safety_call) -----------

/// The recorded per-shot call after the gates: an explicit
/// `{kind:'call', ball, pocket}` or any other kind (a declared safety /
/// no call at all — the interpreters only branch on `Called`).
enum CallInput {
    Called { ball: i64, pocket: i64 },
    Other,
}

/// JS `String(x)` for the call-gate error interpolations (v1 precedent —
/// arrays/objects keep their JSON text).
fn js_string(v: Option<&Value>) -> String {
    match v {
        None => "undefined".to_string(),
        Some(Value::Null) => "null".to_string(),
        Some(Value::String(s)) => s.clone(),
        Some(other) => other.to_string(),
    }
}

/// The v1 call gate with v2 message prefixes: a called ball must be an
/// on-table object ball (1–15, the 8 included), the called pocket a
/// non-negative kernel pocket index.
fn parse_call(call: &Value, state: &EightBallMatchState)
    -> Result<CallInput, RulesError> {
    if call.get("kind").and_then(Value::as_str) != Some("call") {
        return Ok(CallInput::Other);
    }
    let ball_v = call.get("ball");
    let ball = ball_v.and_then(Value::as_i64);
    if !matches!(ball, Some(b) if group_of(b).is_some() || b == 8) {
        return Err(RulesError::BadCall(format!(
            "eightball-v2: called ball {} is not an object ball (1-15)",
            js_string(ball_v)
        )));
    }
    let ball = ball.expect("gated above");
    if !state.on_table.contains(&ball) {
        return Err(RulesError::BadCall(format!(
            "eightball-v2: called ball {ball} is not on the table"
        )));
    }
    let pocket_v = call.get("pocket");
    match pocket_v.and_then(Value::as_i64) {
        Some(pocket) if pocket >= 0 => Ok(CallInput::Called { ball, pocket }),
        _ => Err(RulesError::BadCall(format!(
            "eightball-v2: called pocket {} is not a kernel pocket index",
            js_string(pocket_v)
        ))),
    }
}

/// The config-keyed call REQUIREMENT gate (non-break shots):
/// - `full`: a call (or, with `safety_call`, a declared safety) is
///   MANDATORY (WPA 4.6 via 1.7, strictest reading);
/// - `eight_only` / `none`: no call is required — a null input is the
///   normal shot (APA Pocketed Balls: no designation exists); an
///   explicit call, when provided, still passes the shape gate (marking
///   the 8's pocket rides this same input).
fn gate_call(call: &Value, state: &EightBallMatchState,
    cfg: &EightBallVariantConfig) -> Result<CallInput, RulesError> {
    match cfg.call_shot {
        CallShot::Full => {
            if call.is_null() {
                return Err(RulesError::BadCall(if cfg.safety_call {
                    "eightball-v2: every non-break shot requires a call \
                     or a declared safety (WPA 4.6 via 1.7, strictest \
                     reading)"
                        .to_string()
                } else {
                    "eightball-v2: every non-break shot requires a call \
                     (call_shot 'full' with safety_call off)"
                        .to_string()
                }));
            }
            let parsed = parse_call(call, state)?;
            if !cfg.safety_call && matches!(parsed, CallInput::Other) {
                return Err(RulesError::BadCall(
                    "eightball-v2: a declared safety does not exist under \
                     this config (safety_call off)"
                        .to_string(),
                ));
            }
            Ok(parsed)
        }
        CallShot::EightOnly | CallShot::None => {
            if call.is_null() {
                Ok(CallInput::Other)
            } else {
                parse_call(call, state)
            }
        }
    }
}

// ---- judgment assembly (v1 `Verdict`/`finish_judgment` + the three v2
// additions: respot/keep_on_table for the jumped_ball spot values, and
// the re-rack next-state for `dry_break_consequence: re_break`) -----------------

struct Verdict {
    fouls: Fouls,
    ball_in_hand: PlacementRight,
    turn: Turn,
    decision: Option<DecisionRequired>,
    terminal: Option<Terminal>,
    next_phase: String,
    next_groups: Option<SeatPair<String>>,
    /// P13 chain for the `jumped_ball` spot values and the
    /// `safety_pot_stays_down: false` safety respot (numerically sorted).
    respot: Vec<i64>,
    /// Balls that RETURN to `next.onTable` despite having left play this
    /// stroke (the respotted set — off-table or safety-potted).
    keep_on_table: Vec<i64>,
    /// `dry_break_consequence: re_break`: next state is a fresh rack at
    /// the break phase (data-model §2 — the adapter re-racks on it).
    rerack: bool,
}

impl Verdict {
    fn base(next_phase: &str) -> Verdict {
        Verdict {
            fouls: Fouls::new(),
            ball_in_hand: PlacementRight::None,
            turn: Turn::Pass,
            decision: None,
            terminal: None,
            next_phase: next_phase.to_string(),
            next_groups: None,
            respot: Vec::new(),
            keep_on_table: Vec::new(),
            rerack: false,
        }
    }
}

fn finish_judgment(
    state: &EightBallMatchState, variant: &VariantBlock,
    facts: &scan::ShotFacts, v: Verdict,
) -> Result<String, RulesError> {
    let pocketed = facts.pocketed_ids();
    let on_table: Vec<i64> = if v.rerack {
        full_rack()
    } else {
        state
            .on_table
            .iter()
            .copied()
            .filter(|id| {
                v.keep_on_table.contains(id)
                    || (!pocketed.contains(id)
                        && !facts.off_table.contains(id))
            })
            .collect()
    };
    // P18: pending rows keep the seat (the resolution assigns it);
    // terminal rows keep it too (don't-care); otherwise `turn` applies.
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
        // P13: the 8 stays decision-gated (WPA 4.7); judged respots
        // exist ONLY under the `jumped_ball` spot values.
        respot: v.respot,
        turn: v.turn,
        decision_required: v.decision.clone(),
        terminal: v.terminal.clone(),
        next: V2State {
            base: EightBallMatchState {
                phase: if v.terminal.is_some() {
                    "over".to_string()
                } else {
                    v.next_phase
                },
                shooter: next_shooter,
                breaker: state.breaker,
                groups: v.next_groups,
                on_table,
                pending_decision: v.decision.clone(),
                result: v.terminal.clone(),
                foul_context,
            },
            // the registry API contract §3: re-emitted verbatim
            variant: variant.clone(),
            // GH-371: a judge-granted kitchen right arms the 3.11
            // context directly; decision-gated grants arm it in
            // apply_decision (the resolution knows the choice).
            kitchen_bih: v.decision.is_none()
                && v.terminal.is_none()
                && v.ball_in_hand == PlacementRight::Kitchen,
        },
    };
    judgment.to_json()
}

// ---- break adjudication (WPA 4.3 skeleton; every R5 break axis is a
// branch off `variant.config`) ---------------------------------------------------

fn judge_break(
    state: &EightBallMatchState, variant: &VariantBlock,
    facts: &scan::ShotFacts,
) -> Result<String, RulesError> {
    let cfg = &variant.config;
    let breaker = state.shooter;
    let opp = turn::other(breaker);

    // break fouls, v1 citation order: no contact, off-table, scratch.
    // The jumped_ball axis decides the off-table CONSEQUENCE for object
    // balls; the 8 keeps the v1 break-foul path under every value (its
    // return stays decision-gated, WPA 4.7 — data-model §2: the 8's
    // terminals/paths are unchanged by this axis).
    let mut fouls = Fouls::new();
    if facts.first_contact.is_none() {
        fouls.push("no-contact", CITE_NO_CONTACT_BREAK);
    }
    let jumped_non8: Vec<i64> =
        facts.off_table.iter().copied().filter(|id| *id != 8).collect();
    let mut respot: Vec<i64> = Vec::new();
    let mut keep_on_table: Vec<i64> = Vec::new();
    match cfg.jumped_ball {
        JumpedBall::FoulStayDown => {
            if !facts.off_table.is_empty() {
                fouls.push("ball-off-table", CITE_OFF_TABLE_BREAK);
            }
        }
        JumpedBall::SpotNoFoul | JumpedBall::SpotFoul => {
            let foul_worthy = match cfg.jumped_ball {
                // no foul unless the 8 itself left the table
                JumpedBall::SpotNoFoul => facts.off_table.contains(&8),
                _ => !facts.off_table.is_empty(),
            };
            if foul_worthy {
                fouls.push("ball-off-table", CITE_OFF_TABLE_BREAK);
            }
            keep_on_table.clone_from(&jumped_non8);
            respot = respot_chain::sort_numeric(jumped_non8);
        }
    }
    if facts.cue_scratch {
        fouls.push("scratch", CITE_SCRATCH_BREAK);
    }
    let break_foul = !fouls.is_empty();
    let eight_gone = pockets::pocket_of(&facts.pocketed, 8).is_some();

    let mut v = Verdict {
        fouls,
        // BIH scope: `break_scratch_bih` keys the break-foul placement
        // domain (WPA 4.3(g),(h) kitchen | BCAPL-family anywhere)
        ball_in_hand: if break_foul {
            match cfg.break_scratch_bih {
                BreakScratchBih::Kitchen => PlacementRight::Kitchen,
                BreakScratchBih::Anywhere => PlacementRight::Anywhere,
            }
        } else {
            PlacementRight::None
        },
        respot,
        keep_on_table,
        ..Verdict::base("open")
    };

    if eight_gone {
        // the 8 on the break: the `eight_on_break` clause table
        match cfg.eight_on_break {
            EightOnBreak::OptionTree => {
                // WPA 4.3(e)/(f) option paths (decision ids 2/3)
                v.decision = Some(if break_foul {
                    pending("eight_foul_break", opp)
                } else {
                    pending("eight_legal_break", breaker)
                });
                v.turn =
                    if break_foul { Turn::Pass } else { Turn::Continue };
            }
            EightOnBreak::Win => {
                // golden-break family: the 8 on the break wins outright
                v.turn = Turn::Continue;
                v.terminal = Some(term::terminal(
                    i64::from(breaker), "eight-on-break",
                    CITE_UNSLICED_EIGHT_ON_BREAK_WIN));
                v.ball_in_hand = PlacementRight::None; // the rack is over
            }
            EightOnBreak::WinUnlessScratch => {
                // APA After The Break (b): win, unless the cue ball is
                // fouled (scratch) on the same shot — keyed on the P9
                // cue-scratch fact exactly (data-model §2)
                if facts.cue_scratch {
                    v.terminal = Some(term::terminal(
                        i64::from(opp), "eight-on-break-scratch",
                        CITE_APA_EIGHT_ON_BREAK));
                } else {
                    v.turn = Turn::Continue;
                    v.terminal = Some(term::terminal(
                        i64::from(breaker), "eight-on-break",
                        CITE_APA_EIGHT_ON_BREAK));
                }
                v.ball_in_hand = PlacementRight::None;
            }
        }
        return finish_judgment(state, variant, facts, v);
    }
    if break_foul {
        // the opponent accepts the table or takes BIH (scope above)
        v.decision = Some(pending("break_foul", opp)); // WPA 4.3(g),(h)
        return finish_judgment(state, variant, facts, v);
    }
    if !facts.pocketed.is_empty() {
        // legal break pot — breaker continues; `take_what_you_make`
        // assigns on the break when EXACTLY one group was pocketed
        // (APA After The Break (c); both groups ⇒ table open, (d))
        v.turn = Turn::Continue;
        if cfg.open_table_assignment == OpenTableAssignment::TakeWhatYouMake
        {
            if let Some(g) = single_group(&facts.pocketed_ids()) {
                v.next_groups = Some(assign_groups(breaker, g));
                v.next_phase = "grouped".to_string();
            }
        }
        return finish_judgment(state, variant, facts, v);
    }
    // dry break: `dry_break_rail_minimum` (0 = off) then the
    // `dry_break_consequence` clause table
    let minimum = i64::from(cfg.dry_break_rail_minimum);
    if minimum == 0 || facts.object_rail_count >= minimum {
        return finish_judgment(state, variant, facts, v); // legal dry: pass
    }
    match cfg.dry_break_consequence {
        DryBreakConsequence::OptionTree => {
            // WPA 4.3(d) three-way option for the opponent; bad-break
            // rides the judgment as data — its remedy is the option
            let mut fouls = Fouls::new();
            fouls.push("bad-break", CITE_BAD_BREAK);
            v.fouls = fouls;
            v.decision = Some(pending("dry_break", opp));
        }
        DryBreakConsequence::ReBreak => {
            // APA Breaking: the offender re-breaks — NO decision is
            // born; next returns to the break phase with the SAME
            // breaker (data-model §2; the adapter re-racks on it)
            let mut fouls = Fouls::new();
            fouls.push("bad-break", CITE_APA_REBREAK);
            v.fouls = fouls;
            v.rerack = true;
            v.next_phase = "break".to_string();
            v.turn = Turn::Continue;
        }
        DryBreakConsequence::Loss => {
            let mut fouls = Fouls::new();
            fouls.push("bad-break", CITE_UNSLICED_DRY_BREAK_LOSS);
            v.fouls = fouls;
            v.terminal = Some(term::terminal(
                i64::from(opp), "dry-break-loss",
                CITE_UNSLICED_DRY_BREAK_LOSS));
        }
    }
    finish_judgment(state, variant, facts, v)
}

// ---- open/grouped adjudication (WPA 4.4–4.6, 4.8, 4.9 skeleton; the
// call regime, open-assignment, scratch-on-eight, and jumped-ball axes
// are branches off `variant.config`) ---------------------------------------------

fn judge_play(
    state: &EightBallMatchState, variant: &VariantBlock,
    facts: &scan::ShotFacts, call: &CallInput, kitchen_stroke: bool,
) -> Result<String, RulesError> {
    let cfg = &variant.config;
    let shooter = state.shooter;
    let opp = turn::other(shooter);
    let is_open = state.phase == "open";
    let shooter_group: Option<&str> = if is_open {
        None
    } else {
        state.groups.as_ref().map(|g| g.get(shooter).as_str())
    };

    // "on the 8" is DERIVED, evaluated at shot start (v1 convention):
    // grouped with no ball of the shooter's group left; the open-table
    // whole-group temporary claim likewise (WPA 4.4).
    let on_eight = shooter_group
        .is_some_and(|g| group_count(g, &state.on_table) == 0);
    let open_claim = is_open
        && (group_count("solids", &state.on_table) == 0
            || group_count("stripes", &state.on_table) == 0);

    // P3: legal first contact (group-aware; the 8 is never a legal
    // first contact while open, unless a whole group is down) — the
    // group law is common to both shipped rulebooks (the 8 "is never
    // neutral", APA After The Break NOTE)
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
    // jumped_ball axis (P8 consequence matrix); the 8's off-table stays
    // the terminal below under EVERY value (data-model §2)
    let jumped_non8: Vec<i64> =
        facts.off_table.iter().copied().filter(|id| *id != 8).collect();
    let mut respot: Vec<i64> = Vec::new();
    let mut keep_on_table: Vec<i64> = Vec::new();
    match cfg.jumped_ball {
        JumpedBall::FoulStayDown => {
            if !jumped_non8.is_empty() {
                fouls.push("ball-off-table", CITE_OFF_TABLE);
            }
        }
        JumpedBall::SpotNoFoul | JumpedBall::SpotFoul => {
            if cfg.jumped_ball == JumpedBall::SpotFoul
                && !jumped_non8.is_empty()
            {
                fouls.push("ball-off-table", CITE_OFF_TABLE);
            }
            keep_on_table.clone_from(&jumped_non8);
            respot = respot_chain::sort_numeric(jumped_non8);
        }
    }
    if facts.cue_scratch {
        fouls.push("scratch", CITE_SCRATCH);
    }
    // WPA 3.11 (GH-371, `kitchen_rule` axis, value `wpa`): 4.9 lists
    // 3.11 among the standard fouls — BIH anywhere rides the common
    // foul consequence below. Appended after the frozen codes
    // (additive — the frozen slices never stage a kitchen-BIH stroke).
    if variant.config.kitchen_rule == KitchenRule::Wpa && kitchen_stroke {
        // ¶1: first contact behind the head string, no crossing first
        if facts.first_contact_in_kitchen
            && !facts.cue_crossed_head_string_before_contact
        {
            fouls.push("bad-kitchen-shot", CITE_KITCHEN);
        }
        // ¶2: the stroke neither crossed the head string nor contacted
        // a ball on/past it
        if !facts.cue_crossed_head_string
            && !facts.cue_contacted_ball_past_head_string
        {
            fouls.push("kitchen-no-exit", CITE_KITCHEN);
        }
    }
    let foul = !fouls.is_empty();

    let mut v = Verdict {
        fouls,
        // standard fouls: ball in hand anywhere (WPA 4.9 via 1.6; APA
        // Fouls pp.53-55 — common law, not a config axis)
        ball_in_hand: if foul {
            PlacementRight::Anywhere
        } else {
            PlacementRight::None
        },
        next_groups: state.groups.clone(),
        respot,
        keep_on_table,
        ..Verdict::base(&state.phase)
    };

    // 8-rack terminal cites are keyed by the call regime (the loss law
    // rides the same rulebook text that defines the regime)
    let (cite_win, cite_loss_foul, cite_loss_early, cite_loss_pocket,
        cite_loss_off) = match cfg.call_shot {
        CallShot::Full => (CITE_WIN, CITE_LOSS_FOUL, CITE_LOSS_EARLY,
            CITE_LOSS_POCKET, CITE_LOSS_OFF),
        CallShot::EightOnly => (CITE_APA_WIN, CITE_APA_LOSS_FOUL,
            CITE_APA_LOSS_EARLY, CITE_APA_LOSS_POCKET, CITE_APA_LOSS_OFF),
        CallShot::None => (CITE_UNSLICED_CALL_NONE, CITE_UNSLICED_CALL_NONE,
            CITE_UNSLICED_CALL_NONE, CITE_UNSLICED_CALL_NONE,
            CITE_UNSLICED_CALL_NONE),
    };

    // ---- the 8 decides the rack (never on the break). P5 terminal-
    // pocket match: `full` calls the 8 like any ball; `eight_only`
    // requires the 8's pocket MARKED (the same call input); `none`
    // needs nothing.
    if let Some(eight_pocket) = pockets::pocket_of(&facts.pocketed, 8) {
        let called_eight = matches!(call,
            CallInput::Called { ball: 8, pocket } if *pocket == eight_pocket);
        let marked = match cfg.call_shot {
            CallShot::Full | CallShot::EightOnly => called_eight,
            CallShot::None => true,
        };
        let entitled = on_eight || open_claim; // may the shooter pot the 8?
        if !foul && entitled && marked {
            v.turn = Turn::Continue;
            v.terminal = Some(term::terminal(
                i64::from(shooter), "eight-ball-pocketed", cite_win));
        } else if foul {
            v.terminal = Some(term::terminal(
                i64::from(opp), "eight-with-foul", cite_loss_foul));
        } else if !entitled {
            v.terminal = Some(term::terminal(
                i64::from(opp), "early-eight", cite_loss_early));
        } else {
            // uncalled/unmarked pocket (incl. a safety-potted 8)
            v.terminal = Some(term::terminal(
                i64::from(opp), "eight-wrong-pocket", cite_loss_pocket));
        }
        v.ball_in_hand = PlacementRight::None; // the rack is over
        return finish_judgment(state, variant, facts, v);
    }
    if facts.off_table.contains(&8) {
        // the 8 off the table loses outright under every shipped value
        v.terminal = Some(term::terminal(
            i64::from(opp), "eight-off-table", cite_loss_off));
        v.ball_in_hand = PlacementRight::None;
        return finish_judgment(state, variant, facts, v);
    }

    // ---- scratch_on_eight: loss — terminal row keyed on the derived
    // on-the-8 fact + the P9 cue-scratch fact EXACTLY (APA How To Win A
    // Game (g); its NOTE 1 bounds it: a table scratch missing the 8 is
    // only a ball-in-hand foul, so other foul codes do NOT trigger it)
    if cfg.scratch_on_eight == ScratchOnEight::Loss
        && on_eight
        && facts.cue_scratch
    {
        v.terminal = Some(term::terminal(
            i64::from(opp), "scratch-on-eight", CITE_APA_SCRATCH_ON_EIGHT));
        v.ball_in_hand = PlacementRight::None;
        return finish_judgment(state, variant, facts, v);
    }

    // ---- continuation + open-table assignment (the call-regime and
    // open_table_assignment clause tables)
    // A fulfilled explicit call under ANY regime that received one: the
    // called ball into the called pocket, nominee legally pocketable
    let fulfilled_call: Option<i64> = match call {
        CallInput::Called { ball, pocket } => {
            let legal_target = is_open || group_of(*ball) == shooter_group;
            if !foul
                && *ball != 8
                && legal_target
                && pockets::call_fulfilled(&facts.pocketed, *ball, *pocket)
            {
                Some(*ball)
            } else {
                None
            }
        }
        CallInput::Other => None,
    };
    let counting_pots = facts.pocketed_ids(); // non-8: the 8 returned above
    let continues = !foul
        && match cfg.call_shot {
            // full: only a fulfilled call continues (v1)
            CallShot::Full => fulfilled_call.is_some(),
            // eight_only / none: slop counts — while open any legal pot
            // continues; grouped, a pot of the SHOOTER's group does
            // (an opponent's ball stays down but passes the turn)
            CallShot::EightOnly | CallShot::None => {
                if is_open {
                    !counting_pots.is_empty()
                } else {
                    counting_pots
                        .iter()
                        .any(|id| group_of(*id) == shooter_group)
                }
            }
        };
    if continues {
        v.turn = Turn::Continue;
        if is_open {
            // the open_table_assignment clause table (WPA 4.4
            // called-pot | any-legal-pot | first-hit-group | APA
            // take-what-you-make)
            let assigned = match cfg.open_table_assignment {
                OpenTableAssignment::CalledPot => {
                    fulfilled_call.and_then(group_of)
                }
                OpenTableAssignment::AnyLegalPot => {
                    counting_pots.first().copied().and_then(group_of)
                }
                OpenTableAssignment::FirstHitGroup => {
                    facts.first_contact.and_then(|c| group_of(c.ball))
                }
                OpenTableAssignment::TakeWhatYouMake => {
                    single_group(&counting_pots)
                }
            };
            if let Some(g) = assigned {
                v.next_groups = Some(assign_groups(shooter, g));
                v.next_phase = "grouped".to_string();
            }
        }
    }

    // safety_pot_stays_down: false — a LEGAL declared safety's pocketed
    // object balls respot (P13) instead of staying down. Inert for both
    // shipped presets (WPA: true; APA: no safety exists) — an unsliced
    // schema point whose bytes freeze with its consumer's slice.
    if cfg.call_shot == CallShot::Full
        && cfg.safety_call
        && !cfg.safety_pot_stays_down
        && !foul
        && matches!(call, CallInput::Other)
        && !counting_pots.is_empty()
    {
        v.keep_on_table.extend_from_slice(&counting_pots);
        let mut ids = v.respot;
        ids.extend_from_slice(&counting_pots);
        v.respot = respot_chain::sort_numeric(ids);
    }
    finish_judgment(state, variant, facts, v)
}

/// One judged shot (registry `judge` shape). Guard order = the v1 body
/// order: match over → pending decision → the break/call gates.
fn judge(state_json_in: &str, record_json: &str, call_json: &str)
    -> Result<String, RulesError> {
    let (state, variant, kitchen_bih) = parse_state(state_json_in)?;
    term::guard_not_over(
        is_over(&state),
        "eightball-v2: judge called after the match ended (adapter contract)",
    )?;
    term::guard_no_pending(
        state.pending_decision.is_some(),
        format!(
            "eightball-v2: judge called while a rulebook decision is \
             pending ('{}') — resolve it via applyDecision",
            pending_kind(&state)
        ),
    )?;
    let call: Value = serde_json::from_str(call_json)
        .map_err(|e| RulesError::BadCall(format!("eightball-v2 call: {e}")))?;
    if state.phase == "break" {
        // the break carries no call under EVERY shipped call regime
        // (WPA 4.3(a); the APA game has no call input at all)
        if !call.is_null() {
            return Err(RulesError::BadCall(
                "eightball-v2: the break shot carries no call (WPA 4.3(a))"
                    .to_string(),
            ));
        }
        let record = wire::parse_record(record_json)?;
        let facts = scan::scan(&record, &scan::ScanConfig::default());
        return judge_break(&state, &variant, &facts);
    }
    let call = gate_call(&call, &state, &variant.config)?;
    let record = wire::parse_record(record_json)?;
    // P21 head-string facts join when the record carries table
    // dimensions (GH-371; 0.0 disables — the lenient-wire fallback).
    let table_l = record.initial.table.length;
    let hs_plane = if table_l > 0.0 { Some(-table_l / 4.0) } else { None };
    let facts = scan::scan(&record, &scan::ScanConfig {
        head_string_y: hs_plane,
        ..scan::ScanConfig::default()
    });
    // WPA 3.11 context (GH-371): the stroke began from a
    // kitchen-restricted in-hand grant AND the record shows the cue
    // addressed strictly behind the line (3.10 stays adapter territory).
    let kitchen_stroke = kitchen_bih
        && hs_plane.is_some_and(|hs| {
            record
                .initial
                .balls
                .iter()
                .find(|b| b.id == 0)
                .is_some_and(|b| b.state.pos.y < hs)
        });
    judge_play(&state, &variant, &facts, &call, kitchen_stroke)
}

// ---- decision resolution (the P16 liturgy in the v1 body order;
// config-INDEPENDENT by design — a pending option only exists if a
// judgment, already config-routed, created it; ids 1–5 keep their frozen
// global meanings) ---------------------------------------------------------------

fn apply_decision(state_json_in: &str, decision_json: &str)
    -> Result<String, RulesError> {
    let (state, variant, _kitchen_bih) = parse_state(state_json_in)?;
    // GH-371: the break-foul family's kitchen scope (the axis the BIH
    // judgment rode) arms the 3.11 context on the resolutions below.
    let kitchen_scope =
        variant.config.break_scratch_bih == BreakScratchBih::Kitchen;
    term::guard_not_over(
        is_over(&state),
        "eightball-v2: no decision can be applied after the match ended",
    )?;
    let d = decisions::parse_decision(decision_json)?;
    // share-codec-v4 ids 1–5 (the frozen global id space)
    let kind = match d.decision {
        1 => "dry_break",
        2 => "eight_legal_break",
        3 => "eight_foul_break",
        4 => "break_foul",
        5 => "stalemate",
        other => {
            return Err(decisions::unknown_id(format!(
                "eightball-v2: unknown decision id {other}"
            )));
        }
    };
    let choice_max = match kind {
        "dry_break" => 3,
        "stalemate" => 1,
        _ => 2,
    };
    decisions::check_choice(
        d.choice >= 1 && d.choice <= choice_max,
        format!("eightball-v2: choice {} out of range for '{kind}'", d.choice),
    )?;

    // stalemate is an AGREEMENT, never pre-empting an open option; the
    // ORIGINAL breaker re-breaks (v1 semantics, variant preserved)
    if kind == "stalemate" {
        decisions::check_pending(
            !state.pending_decision.as_ref()
                .is_some_and(|p| p.kind != "stalemate"),
            format!(
                "eightball-v2: stalemate cannot pre-empt the pending '{}' \
                 option",
                pending_kind(&state)
            ),
        )?;
        // a fresh rack breaks from behind the head string (4.3(a))
        return state_json(&fresh_rack(state.breaker), &variant, true);
    }

    decisions::check_pending(
        state.pending_decision.as_ref().is_some_and(|p| p.kind == kind),
        format!(
            "eightball-v2: decision '{kind}' does not match the pending \
             option ('{}')",
            state.pending_decision.as_ref()
                .map_or("none", |p| p.kind.as_str())
        ),
    )?;
    // the CHOOSER recorded on the pending option takes the resolution
    // seat (v1 convention; every eightball pending carries a seat)
    let chooser = match state.pending_decision.as_ref().map(|p| p.chooser) {
        Some(Chooser::Seat(n)) => n,
        _ => state.shooter,
    };

    match kind {
        "dry_break" => {
            // WPA 4.3(d)
            if d.choice == 1 {
                // accept the table as it lies — no in-hand grant
                return state_json(&EightBallMatchState {
                    shooter: chooser,
                    pending_decision: None,
                    ..state
                }, &variant, false);
            }
            if d.choice == 2 {
                // chooser breaks
                return state_json(&fresh_rack(chooser), &variant, true);
            }
            // offender re-breaks
            state_json(&fresh_rack(state.breaker), &variant, true)
        }
        "eight_legal_break" => {
            // WPA 4.3(e) — the chooser is the breaker
            if d.choice == 1 {
                // spot the 8, breaker plays from position — no grant
                return state_json(&EightBallMatchState {
                    shooter: chooser,
                    on_table: with_eight_spotted(&state.on_table),
                    pending_decision: None,
                    ..state
                }, &variant, false);
            }
            state_json(&fresh_rack(state.breaker), &variant, true)
        }
        "eight_foul_break" => {
            // WPA 4.3(f) — the chooser is the opponent
            if d.choice == 1 {
                // spot the 8; the incoming player takes ball in hand
                // behind the head string (4.3(f) — the break-foul
                // family's kitchen scope)
                return state_json(&EightBallMatchState {
                    shooter: chooser,
                    on_table: with_eight_spotted(&state.on_table),
                    pending_decision: None,
                    ..state
                }, &variant, kitchen_scope);
            }
            state_json(&fresh_rack(chooser), &variant, true)
        }
        _ => {
            // 'break_foul' — both choices seat the opponent; the BIH
            // domain rode the judgment (break_scratch_bih scope). An 8
            // driven off on the break returns under EITHER choice.
            // GH-371 kitchen context: taking BIH (choice 2) enters from
            // the kitchen under the kitchen scope; accepting position
            // (choice 1) does too when the break stroke SCRATCHED (the
            // pocketed cue must enter play from the kitchen, 4.3(g) —
            // the carried foul context records the scratch).
            let scratched = state.foul_context.as_ref().is_some_and(|fc| {
                fc.fouls.iter().any(|f| f.code == "scratch")
            });
            state_json(&EightBallMatchState {
                shooter: chooser,
                on_table: with_eight_spotted(&state.on_table),
                pending_decision: None,
                ..state
            }, &variant, kitchen_scope && (d.choice == 2 || scratched))
        }
    }
}

/// The state's onTable with the 8 spotted back (P13 decision-gated:
/// runs ONLY from applyDecision, v1 `with_eight_spotted`).
fn with_eight_spotted(on_table: &[i64]) -> Vec<i64> {
    if on_table.contains(&8) {
        return on_table.to_vec();
    }
    let mut ids = on_table.to_vec();
    ids.push(8);
    respot_chain::sort_numeric(ids)
}

// ---- hud (the v1 8-ball HUD shape UNCHANGED — no variant block; the
// picker/HUD read display metadata from the catalog, the feature data-model §5) ----------

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

#[derive(Serialize)]
struct EightBallHudFoulContext {
    by: i64,
    fouls: Vec<CitedFoul>,
}

fn hud_state(state_json_in: &str) -> Result<String, RulesError> {
    let (state, _variant, _kitchen_bih) = parse_state(state_json_in)?;
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
        RulesError::BadState(format!("eightball-v2 hud serialization: {e}"))
    })
}

// ---- registry-facing type (the registry API contract §1; T006 appends
// this entry to the registry table + RULESET_IDS — the five v1 slots
// stay byte-untouched) -----------------------------------------------------------

/// The `eightball-v2` registry entry: the EXISTING fn-pointer shape,
/// `initial_state(seat)` ≡ default-preset (`wpa-8ball`) resolution.
pub static ENTRY: RulesetEntry = RulesetEntry {
    id: "eightball-v2",
    initial_state,
    judge,
    apply_decision,
    hud_state,
    catalog,
};

/// Catalog row: the v1 foul taxonomy (same codes/standard cites — the
/// config-varying cites are judgment data, not taxonomy rows), the
/// frozen decision ids 1–5, the v1 terminal reasons plus the four
/// config-born ones, and a pure-data config pointer at the task-config
/// mechanism (the preset rows ride `CatalogEntry.presets`, T006).
fn catalog() -> CatalogEntry {
    CatalogEntry {
        id: "eightball-v2",
        fouls: vec![
            CitedFoul::new("scratch", CITE_SCRATCH),
            CitedFoul::new("no-contact", CITE_NO_CONTACT),
            CitedFoul::new("wrong-first-ball", CITE_WRONG_FIRST),
            CitedFoul::new("no-rail-after-contact", CITE_NO_RAIL),
            CitedFoul::new("ball-off-table", CITE_OFF_TABLE),
            CitedFoul::new("bad-break", CITE_BAD_BREAK),
            CitedFoul::new("bad-kitchen-shot", CITE_KITCHEN),
            CitedFoul::new("kitchen-no-exit", CITE_KITCHEN),
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
            "eight-wrong-pocket", "eight-off-table", "eight-on-break",
            "eight-on-break-scratch", "scratch-on-eight", "dry-break-loss",
        ],
        config: serde_json::json!({
            "family": "eightball",
            "configSchema": crate::task_config::TASK_CONFIG_SCHEMA,
            "defaultPreset": "wpa-8ball",
        }),
    }
}

// ---- tests ---------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::task_config::preset_by_id;

    fn apa() -> EightBallVariantConfig {
        preset_by_id("apa-8ball").unwrap().config.as_eightball()
            .expect("apa-8ball is an eightball preset").clone()
    }

    /// WPA defaults with per-test deltas (a custom config point — the
    /// axes are independent by construction).
    fn cfg(edit: impl FnOnce(&mut EightBallVariantConfig))
        -> EightBallVariantConfig {
        let mut c = EightBallVariantConfig::default();
        edit(&mut c);
        c
    }

    fn rec(events: &str) -> String {
        format!(r#"{{"initial": {{"balls": []}}, "events": {events}}}"#)
    }

    /// Judge a break shot from a fresh rack (seat 1 breaks).
    fn judge_break_shot(config: &EightBallVariantConfig, events: &str)
        -> Value {
        let s = initial_state_for_config(config.clone(), 1).unwrap();
        let out = judge(&s, &rec(events), "null").unwrap();
        serde_json::from_str(&out).unwrap()
    }

    // break-shot event streams (wire shapes per tests/scan.rs)
    const EV_CONTACT_ONLY: &str =
        r#"[{"t":0.1,"kind":{"BallBall":{"b1":0,"b2":1}},"post":[]}]"#;
    const EV_DRY_4_RAILS: &str = r#"[
        {"t":0.1,"kind":{"BallBall":{"b1":0,"b2":1}},"post":[]},
        {"t":0.2,"kind":{"BallLinearCushion":{"ball":1}},"post":[]},
        {"t":0.3,"kind":{"BallLinearCushion":{"ball":2}},"post":[]},
        {"t":0.4,"kind":{"BallLinearCushion":{"ball":3}},"post":[]},
        {"t":0.5,"kind":{"BallCircularCushion":{"ball":4}},"post":[]}]"#;
    const EV_POT_SOLID: &str = r#"[
        {"t":0.1,"kind":{"BallBall":{"b1":0,"b2":1}},"post":[]},
        {"t":0.4,"kind":{"BallPocket":{"ball":2,"pocket":3}},"post":[]}]"#;
    const EV_POT_BOTH_GROUPS: &str = r#"[
        {"t":0.1,"kind":{"BallBall":{"b1":0,"b2":1}},"post":[]},
        {"t":0.4,"kind":{"BallPocket":{"ball":2,"pocket":3}},"post":[]},
        {"t":0.5,"kind":{"BallPocket":{"ball":9,"pocket":1}},"post":[]}]"#;
    const EV_EIGHT_POT: &str = r#"[
        {"t":0.1,"kind":{"BallBall":{"b1":0,"b2":1}},"post":[]},
        {"t":0.4,"kind":{"BallPocket":{"ball":8,"pocket":2}},"post":[]}]"#;
    const EV_EIGHT_POT_SCRATCH: &str = r#"[
        {"t":0.1,"kind":{"BallBall":{"b1":0,"b2":1}},"post":[]},
        {"t":0.4,"kind":{"BallPocket":{"ball":8,"pocket":2}},"post":[]},
        {"t":0.5,"kind":{"BallPocket":{"ball":0,"pocket":4}},"post":[]}]"#;
    const EV_SCRATCH_DRY: &str = r#"[
        {"t":0.1,"kind":{"BallBall":{"b1":0,"b2":1}},"post":[]},
        {"t":0.5,"kind":{"BallPocket":{"ball":0,"pocket":4}},"post":[]}]"#;
    const EV_POT_PLUS_JUMPED: &str = r#"[
        {"t":0.1,"kind":{"BallBall":{"b1":0,"b2":1}},"post":[]},
        {"t":0.4,"kind":{"BallPocket":{"ball":2,"pocket":3}},"post":[]},
        {"t":0.5,"kind":{"BallOffTable":{"ball":9}},"post":[]},
        {"t":0.6,"kind":{"BallOffTable":{"ball":5}},"post":[]}]"#;

    // -- clause pair: eight_on_break (option tree vs win vs
    //    win-unless-scratch; R5 row 5) -------------------------------------------

    #[test]
    fn eightball_v2_eight_on_break_pair() {
        // WPA default: the 4.3(e) option decision, no terminal
        let j = judge_break_shot(&EightBallVariantConfig::default(),
            EV_EIGHT_POT);
        assert_eq!(j["decisionRequired"]["kind"], "eight_legal_break");
        assert_eq!(j["decisionRequired"]["chooser"], 1);
        assert_eq!(j["terminal"], Value::Null);

        // APA win_unless_scratch, clean: win for the breaker, no decision
        let j = judge_break_shot(&apa(), EV_EIGHT_POT);
        assert_eq!(j["legal"], true);
        assert_eq!(j["decisionRequired"], Value::Null);
        assert_eq!(j["terminal"]["winner"], 1);
        assert_eq!(j["terminal"]["reason"], "eight-on-break");
        assert_eq!(j["terminal"]["cite"], CITE_APA_EIGHT_ON_BREAK);
        assert_eq!(j["next"]["phase"], "over");

        // APA win_unless_scratch, same-shot cue scratch: loss for breaker
        let j = judge_break_shot(&apa(), EV_EIGHT_POT_SCRATCH);
        assert_eq!(j["legal"], false);
        assert_eq!(j["terminal"]["winner"], 2);
        assert_eq!(j["terminal"]["reason"], "eight-on-break-scratch");
        assert_eq!(j["ballInHand"], "none", "the rack is over");

        // win: outright, scratch or not (golden-break family, unsliced)
        let c = cfg(|c| c.eight_on_break = EightOnBreak::Win);
        let j = judge_break_shot(&c, EV_EIGHT_POT_SCRATCH);
        assert_eq!(j["terminal"]["winner"], 1);
        assert_eq!(j["terminal"]["reason"], "eight-on-break");

        // WPA foul path unchanged: 4.3(f) option for the opponent
        let j = judge_break_shot(&EightBallVariantConfig::default(),
            EV_EIGHT_POT_SCRATCH);
        assert_eq!(j["decisionRequired"]["kind"], "eight_foul_break");
        assert_eq!(j["decisionRequired"]["chooser"], 2);
    }

    // -- clause pair: dry_break_rail_minimum 0 vs 4 (R5 row 6) -------------------

    #[test]
    fn eightball_v2_dry_break_rail_minimum_pair() {
        // WPA minimum 4: 0 rails ⇒ bad-break + the 4.3(d) option
        let j = judge_break_shot(&EightBallVariantConfig::default(),
            EV_CONTACT_ONLY);
        assert_eq!(j["legal"], false);
        assert_eq!(j["fouls"][0]["code"], "bad-break");
        assert_eq!(j["fouls"][0]["cite"], "WPA 4.3(d)");
        assert_eq!(j["decisionRequired"]["kind"], "dry_break");
        assert_eq!(j["decisionRequired"]["chooser"], 2);
        assert_eq!(j["ballInHand"], "none",
            "bad-break's remedy is the option, never ball in hand");

        // WPA minimum met: legal dry break, seat passes
        let j = judge_break_shot(&EightBallVariantConfig::default(),
            EV_DRY_4_RAILS);
        assert_eq!(j["legal"], true);
        assert_eq!(j["decisionRequired"], Value::Null);
        assert_eq!(j["next"]["shooter"], 2);

        // APA minimum 0: the same 0-rail stream is a legal break
        let j = judge_break_shot(&apa(), EV_CONTACT_ONLY);
        assert_eq!(j["legal"], true);
        assert_eq!(j["decisionRequired"], Value::Null);
        assert_eq!(j["next"]["shooter"], 2);
        assert_eq!(j["next"]["phase"], "open");
    }

    // -- clause pair: dry_break_consequence re_break vs option tree
    //    (R5 row 7; APA HF-2 scope note in the harvest) ---------------------------

    #[test]
    fn eightball_v2_dry_break_consequence_pair() {
        // re_break under a 4-rail minimum: no decision is born; next
        // returns to the break phase with the SAME breaker, full rack
        let c = cfg(|c| {
            c.dry_break_consequence = DryBreakConsequence::ReBreak;
        });
        let j = judge_break_shot(&c, EV_CONTACT_ONLY);
        assert_eq!(j["legal"], false);
        assert_eq!(j["fouls"][0]["code"], "bad-break");
        assert_eq!(j["fouls"][0]["cite"], CITE_APA_REBREAK);
        assert_eq!(j["decisionRequired"], Value::Null);
        assert_eq!(j["terminal"], Value::Null);
        assert_eq!(j["next"]["phase"], "break");
        assert_eq!(j["next"]["shooter"], 1, "the offender re-breaks");
        assert_eq!(j["next"]["breaker"], 1);
        assert_eq!(j["next"]["onTable"].as_array().unwrap().len(), 15);
        assert_eq!(j["next"]["pendingDecision"], Value::Null);
        // the variant block rides every judgment's next verbatim
        assert_eq!(j["next"]["variant"]["config"]["dry_break_consequence"],
            "re_break");

        // option tree (WPA default): decision id-1 kind pends instead
        let j = judge_break_shot(&EightBallVariantConfig::default(),
            EV_CONTACT_ONLY);
        assert_eq!(j["decisionRequired"]["kind"], "dry_break");
        assert_eq!(j["next"]["phase"], "open");

        // loss (unsliced schema point): terminal for the opponent
        let c = cfg(|c| {
            c.dry_break_consequence = DryBreakConsequence::Loss;
        });
        let j = judge_break_shot(&c, EV_CONTACT_ONLY);
        assert_eq!(j["terminal"]["winner"], 2);
        assert_eq!(j["terminal"]["reason"], "dry-break-loss");
    }

    // -- clause pair: break_scratch_bih kitchen vs anywhere (R5 row 8) -----------

    #[test]
    fn eightball_v2_break_scratch_bih_scope_pair() {
        // WPA: break fouls grant the kitchen only (4.3(g),(h))
        let j = judge_break_shot(&EightBallVariantConfig::default(),
            EV_SCRATCH_DRY);
        assert_eq!(j["legal"], false);
        assert_eq!(j["fouls"][0]["code"], "scratch");
        assert_eq!(j["fouls"][0]["cite"], "WPA 3.1 via 4.3(g),(h)");
        assert_eq!(j["ballInHand"], "kitchen");
        assert_eq!(j["decisionRequired"]["kind"], "break_foul");
        assert_eq!(j["decisionRequired"]["chooser"], 2);

        // anywhere (BCAPL-family consumer): same row, wider domain
        let c = cfg(|c| c.break_scratch_bih = BreakScratchBih::Anywhere);
        let j = judge_break_shot(&c, EV_SCRATCH_DRY);
        assert_eq!(j["ballInHand"], "anywhere");
        assert_eq!(j["decisionRequired"]["kind"], "break_foul");
    }

    // -- clause pair: take_what_you_make break assignment vs open table
    //    (R5 row 2, break half; the play half rides increment 3/4) ---------------

    #[test]
    fn eightball_v2_take_what_you_make_break_assignment_pair() {
        // WPA called_pot: the break NEVER assigns groups (4.3(c), 4.4)
        let j = judge_break_shot(&EightBallVariantConfig::default(),
            EV_POT_SOLID);
        assert_eq!(j["legal"], true);
        assert_eq!(j["turn"], "continue");
        assert_eq!(j["next"]["groups"], Value::Null);
        assert_eq!(j["next"]["phase"], "open");

        // APA take_what_you_make: one-group break pot assigns (c)
        let j = judge_break_shot(&apa(), EV_POT_SOLID);
        assert_eq!(j["legal"], true);
        assert_eq!(j["turn"], "continue");
        assert_eq!(j["next"]["phase"], "grouped");
        assert_eq!(j["next"]["groups"]["1"], "solids");
        assert_eq!(j["next"]["groups"]["2"], "stripes");

        // both groups pocketed ⇒ the table stays open (d)
        let j = judge_break_shot(&apa(), EV_POT_BOTH_GROUPS);
        assert_eq!(j["next"]["phase"], "open");
        assert_eq!(j["next"]["groups"], Value::Null);
        assert_eq!(j["turn"], "continue");
    }

    // -- clause pair on the break: jumped_ball spot_no_foul vs
    //    foul_stay_down (R5 row 9, break half) -----------------------------------

    #[test]
    fn eightball_v2_jumped_ball_on_break_pair() {
        // WPA foul_stay_down: any object ball off ⇒ break foul; balls out
        let j = judge_break_shot(&EightBallVariantConfig::default(),
            EV_POT_PLUS_JUMPED);
        assert_eq!(j["legal"], false);
        assert_eq!(j["fouls"][0]["code"], "ball-off-table");
        assert_eq!(j["respot"], serde_json::json!([]));
        assert_eq!(j["decisionRequired"]["kind"], "break_foul");
        let on: Vec<i64> = serde_json::from_value(
            j["next"]["onTable"].clone()).unwrap();
        assert!(!on.contains(&5) && !on.contains(&9));

        // APA spot_no_foul: no foul; the jumped balls respot (P13,
        // numerically sorted) and RETURN to next.onTable
        let j = judge_break_shot(&apa(), EV_POT_PLUS_JUMPED);
        assert_eq!(j["legal"], true);
        assert_eq!(j["fouls"], serde_json::json!([]));
        assert_eq!(j["respot"], serde_json::json!([5, 9]));
        assert_eq!(j["turn"], "continue", "legal break pot continues");
        let on: Vec<i64> = serde_json::from_value(
            j["next"]["onTable"].clone()).unwrap();
        assert!(on.contains(&5) && on.contains(&9));
        assert!(!on.contains(&2), "the pocketed ball stays down");
    }

    // -- play-phase helpers -------------------------------------------------------

    /// A mid-rack state: seat 1 shooting, breaker 1.
    fn play_state(config: &EightBallVariantConfig, phase: &str,
        groups: Option<(&str, &str)>, on_table: &[i64]) -> String {
        let base = EightBallMatchState {
            phase: phase.to_string(),
            shooter: 1,
            breaker: 1,
            groups: groups.map(|(a, b)| {
                SeatPair::new(a.to_string(), b.to_string())
            }),
            on_table: on_table.to_vec(),
            pending_decision: None,
            result: None,
            foul_context: None,
        };
        state_json(&base, &VariantBlock::for_config(config.clone()), false)
            .unwrap()
    }

    fn judge_shot(state: &str, events: &str, call: &str) -> Value {
        serde_json::from_str(&judge(state, &rec(events), call).unwrap())
            .unwrap()
    }

    // play-shot event streams
    const EV_POT_2_IN_5: &str = r#"[
        {"t":0.1,"kind":{"BallBall":{"b1":0,"b2":2}},"post":[]},
        {"t":0.4,"kind":{"BallPocket":{"ball":2,"pocket":5}},"post":[]}]"#;
    const EV_RAIL_ONLY: &str = r#"[
        {"t":0.1,"kind":{"BallBall":{"b1":0,"b2":2}},"post":[]},
        {"t":0.2,"kind":{"BallLinearCushion":{"ball":2}},"post":[]}]"#;
    const EV_SCRATCH_ON_8: &str = r#"[
        {"t":0.1,"kind":{"BallBall":{"b1":0,"b2":8}},"post":[]},
        {"t":0.2,"kind":{"BallLinearCushion":{"ball":8}},"post":[]},
        {"t":0.4,"kind":{"BallPocket":{"ball":0,"pocket":4}},"post":[]}]"#;
    const EV_JUMPED_9: &str = r#"[
        {"t":0.1,"kind":{"BallBall":{"b1":0,"b2":1}},"post":[]},
        {"t":0.2,"kind":{"BallLinearCushion":{"ball":1}},"post":[]},
        {"t":0.3,"kind":{"BallOffTable":{"ball":9}},"post":[]}]"#;
    const EV_POT_8_IN_2: &str = r#"[
        {"t":0.1,"kind":{"BallBall":{"b1":0,"b2":8}},"post":[]},
        {"t":0.4,"kind":{"BallPocket":{"ball":8,"pocket":2}},"post":[]}]"#;

    // -- clause pair: call_shot eight_only slop-continue vs full
    //    unfulfilled-call pass (R5 row 1) -----------------------------------------

    #[test]
    fn eightball_v2_call_shot_pair() {
        // WPA full: ball 2 called to pocket 3, drops in pocket 5 —
        // unfulfilled call, legal shot, seat passes, ball stays down
        let s = play_state(&EightBallVariantConfig::default(), "grouped",
            Some(("solids", "stripes")), &[1, 2, 8, 9, 10]);
        let j = judge_shot(&s, EV_POT_2_IN_5,
            r#"{"kind":"call","ball":2,"pocket":3}"#);
        assert_eq!(j["legal"], true);
        assert_eq!(j["turn"], "pass");
        assert_eq!(j["next"]["shooter"], 2);
        let on: Vec<i64> = serde_json::from_value(
            j["next"]["onTable"].clone()).unwrap();
        assert!(!on.contains(&2), "uncalled balls stay down");

        // APA eight_only: the SAME stream with no call at all — slop
        // counts, shooter continues
        let s = play_state(&apa(), "grouped",
            Some(("solids", "stripes")), &[1, 2, 8, 9, 10]);
        let j = judge_shot(&s, EV_POT_2_IN_5, "null");
        assert_eq!(j["legal"], true);
        assert_eq!(j["turn"], "continue");
        assert_eq!(j["next"]["shooter"], 1);

        // APA eight_only: legally potting only an OPPONENT ball (own
        // group contacted first) passes — the ball stays down, no foul
        let ev_own_first_opp_pot = r#"[
            {"t":0.1,"kind":{"BallBall":{"b1":0,"b2":9}},"post":[]},
            {"t":0.4,"kind":{"BallPocket":{"ball":2,"pocket":5}},"post":[]}]"#;
        let s = play_state(&apa(), "grouped",
            Some(("stripes", "solids")), &[1, 2, 8, 9, 10]);
        let j = judge_shot(&s, ev_own_first_opp_pot, "null");
        assert_eq!(j["legal"], true);
        assert_eq!(j["turn"], "pass",
            "a pot outside the shooter's category never continues");
        let on: Vec<i64> = serde_json::from_value(
            j["next"]["onTable"].clone()).unwrap();
        assert!(!on.contains(&2), "the pocketed ball stays down");

        // WPA full: a null call is a bad-call error
        let s = play_state(&EightBallVariantConfig::default(), "grouped",
            Some(("solids", "stripes")), &[1, 2, 8, 9, 10]);
        let err = judge(&s, &rec(EV_POT_2_IN_5), "null").unwrap_err();
        assert_eq!(err.code(), "bad-call");
        assert!(err.message().contains("requires a call"));

        // full + safety_call=false: a declared safety is rejected
        let c = cfg(|c| c.safety_call = false);
        let s = play_state(&c, "grouped",
            Some(("solids", "stripes")), &[1, 2, 8, 9, 10]);
        let err = judge(&s, &rec(EV_RAIL_ONLY), r#"{"kind":"safety"}"#)
            .unwrap_err();
        assert_eq!(err.code(), "bad-call");
        assert!(err.message().contains("safety_call off"));
    }

    // -- clause pair: scratch_on_eight loss terminal vs foul (R5 row 4) ----------

    #[test]
    fn eightball_v2_scratch_on_eight_pair() {
        // shooter 1 grouped on solids, all solids cleared: ON the 8
        let on_the_8: &[i64] = &[8, 9, 10];

        // WPA foul: scratch while shooting the 8 = BIH for the opponent
        let s = play_state(&EightBallVariantConfig::default(), "grouped",
            Some(("solids", "stripes")), on_the_8);
        let j = judge_shot(&s, EV_SCRATCH_ON_8,
            r#"{"kind":"call","ball":8,"pocket":2}"#);
        assert_eq!(j["legal"], false);
        assert_eq!(j["terminal"], Value::Null, "a foul, not a loss");
        assert_eq!(j["ballInHand"], "anywhere");
        assert_eq!(j["next"]["shooter"], 2);

        // APA loss: the same stream is loss of game (How To Win (g))
        let s = play_state(&apa(), "grouped",
            Some(("solids", "stripes")), on_the_8);
        let j = judge_shot(&s, EV_SCRATCH_ON_8, "null");
        assert_eq!(j["legal"], false);
        assert_eq!(j["terminal"]["winner"], 2);
        assert_eq!(j["terminal"]["reason"], "scratch-on-eight");
        assert_eq!(j["terminal"]["cite"], CITE_APA_SCRATCH_ON_EIGHT);
        assert_eq!(j["ballInHand"], "none", "the rack is over");
        assert_eq!(j["next"]["phase"], "over");

        // APA NOTE 1 bound: a table scratch (missing the 8 entirely,
        // NO cue scratch) is only a ball-in-hand foul, never a loss
        let s = play_state(&apa(), "grouped",
            Some(("solids", "stripes")), on_the_8);
        let j = judge_shot(&s, "[]", "null");
        assert_eq!(j["fouls"][0]["code"], "no-contact");
        assert_eq!(j["terminal"], Value::Null);
        assert_eq!(j["ballInHand"], "anywhere");

        // APA loss keys on the derived on-the-8 fact: the same scratch
        // with solids still up is an ordinary foul
        let s = play_state(&apa(), "grouped",
            Some(("solids", "stripes")), &[1, 8, 9, 10]);
        let j = judge_shot(&s, EV_SCRATCH_ON_8, "null");
        assert_eq!(j["terminal"], Value::Null);
        assert_eq!(j["fouls"][0]["code"], "wrong-first-ball",
            "contacting the 8 first while not on it");
    }

    // -- clause pair: jumped_ball spot_no_foul respot vs foul_stay_down
    //    (R5 row 9, play half) ----------------------------------------------------

    #[test]
    fn eightball_v2_jumped_ball_in_play_pair() {
        let table: &[i64] = &[1, 2, 8, 9, 10];

        // WPA foul_stay_down: object ball off ⇒ foul, ball stays out
        let s = play_state(&EightBallVariantConfig::default(), "grouped",
            Some(("solids", "stripes")), table);
        let j = judge_shot(&s, EV_JUMPED_9,
            r#"{"kind":"call","ball":1,"pocket":0}"#);
        assert_eq!(j["legal"], false);
        assert_eq!(j["fouls"][0]["code"], "ball-off-table");
        assert_eq!(j["fouls"][0]["cite"], "WPA 3.5 via 4.9");
        assert_eq!(j["respot"], serde_json::json!([]));
        let on: Vec<i64> = serde_json::from_value(
            j["next"]["onTable"].clone()).unwrap();
        assert!(!on.contains(&9));

        // APA spot_no_foul: no foul; the 9 respots and stays in play
        let s = play_state(&apa(), "grouped",
            Some(("solids", "stripes")), table);
        let j = judge_shot(&s, EV_JUMPED_9, "null");
        assert_eq!(j["legal"], true);
        assert_eq!(j["respot"], serde_json::json!([9]));
        assert_eq!(j["turn"], "pass", "no pot: the seat passes");
        let on: Vec<i64> = serde_json::from_value(
            j["next"]["onTable"].clone()).unwrap();
        assert!(on.contains(&9));

        // spot_foul (unsliced): foul AND respot
        let c = cfg(|c| c.jumped_ball = JumpedBall::SpotFoul);
        let s = play_state(&c, "grouped",
            Some(("solids", "stripes")), table);
        let j = judge_shot(&s, EV_JUMPED_9,
            r#"{"kind":"call","ball":1,"pocket":0}"#);
        assert_eq!(j["legal"], false);
        assert_eq!(j["fouls"][0]["code"], "ball-off-table");
        assert_eq!(j["respot"], serde_json::json!([9]));
    }

    // -- the 8's rack terminals under the eight_only marking regime --------------

    #[test]
    fn eightball_v2_eight_only_marking_governs_the_eight() {
        let on_the_8: &[i64] = &[8, 9, 10];

        // marked pocket (the same call input carries the mark): win
        let s = play_state(&apa(), "grouped",
            Some(("solids", "stripes")), on_the_8);
        let j = judge_shot(&s, EV_POT_8_IN_2,
            r#"{"kind":"call","ball":8,"pocket":2}"#);
        assert_eq!(j["terminal"]["winner"], 1);
        assert_eq!(j["terminal"]["reason"], "eight-ball-pocketed");
        assert_eq!(j["terminal"]["cite"], CITE_APA_WIN);

        // unmarked: loss (How To Win (c),(d) — wrong/unmarked pocket)
        let s = play_state(&apa(), "grouped",
            Some(("solids", "stripes")), on_the_8);
        let j = judge_shot(&s, EV_POT_8_IN_2, "null");
        assert_eq!(j["terminal"]["winner"], 2);
        assert_eq!(j["terminal"]["reason"], "eight-wrong-pocket");
        assert_eq!(j["terminal"]["cite"], CITE_APA_LOSS_POCKET);

        // call_shot none (unsliced): an entitled legal 8 pot wins bare
        let c = cfg(|c| c.call_shot = CallShot::None);
        let s = play_state(&c, "grouped",
            Some(("solids", "stripes")), on_the_8);
        let j = judge_shot(&s, EV_POT_8_IN_2, "null");
        assert_eq!(j["terminal"]["winner"], 1);
        assert_eq!(j["terminal"]["reason"], "eight-ball-pocketed");
    }

    // -- open-table assignment clause table (post-break half) --------------------

    #[test]
    fn eightball_v2_open_assignment_pair_in_play() {
        let open_table: Vec<i64> = (1..=15).collect();

        // WPA called_pot: a fulfilled call while open assigns by the
        // CALLED ball
        let s = play_state(&EightBallVariantConfig::default(), "open",
            None, &open_table);
        let j = judge_shot(&s, EV_POT_2_IN_5,
            r#"{"kind":"call","ball":2,"pocket":5}"#);
        assert_eq!(j["turn"], "continue");
        assert_eq!(j["next"]["phase"], "grouped");
        assert_eq!(j["next"]["groups"]["1"], "solids");

        // APA take_what_you_make: the same pot with NO call assigns too
        let s = play_state(&apa(), "open", None, &open_table);
        let j = judge_shot(&s, EV_POT_2_IN_5, "null");
        assert_eq!(j["turn"], "continue");
        assert_eq!(j["next"]["phase"], "grouped");
        assert_eq!(j["next"]["groups"]["1"], "solids");
        assert_eq!(j["next"]["groups"]["2"], "stripes");

        // WPA called_pot with an UNFULFILLED call: open stays open
        let s = play_state(&EightBallVariantConfig::default(), "open",
            None, &open_table);
        let j = judge_shot(&s, EV_POT_2_IN_5,
            r#"{"kind":"call","ball":2,"pocket":3}"#);
        assert_eq!(j["turn"], "pass");
        assert_eq!(j["next"]["phase"], "open");
        assert_eq!(j["next"]["groups"], Value::Null);
    }

    // -- v1 parity under the WPA preset (the T007 fidelity anchor,
    //    pinned here at BYTE strength: v2 bytes == v1 bytes with the
    //    variant block spliced into `next` — full-judgment byte equality
    //    across the ids is impossible by design, contracts §7).
    //    GH-371 amendment: v2 additionally carries the trailing
    //    `kitchenBih` flag (peeled before the byte comparison; its
    //    transitions are pinned by the dedicated kitchen tests below)
    //    and, ON kitchen-BIH strokes ONLY, the config-gated WPA 3.11
    //    fouls — an enumerated divergence the parity matrix never
    //    stages (its records carry no table dimensions and no grant is
    //    ever armed). -----------------------------------------------------------

    /// Peel the trailing additive `kitchenBih` flag off v2 bytes
    /// (always the LAST field of the serialized v2 state).
    fn peel_kitchen(v2: &str) -> (String, bool) {
        for (needle, flag) in [(",\"kitchenBih\":true", true),
            (",\"kitchenBih\":false", false)] {
            if let Some(idx) = v2.rfind(needle) {
                let mut out = String::with_capacity(v2.len());
                out.push_str(&v2[..idx]);
                out.push_str(&v2[idx + needle.len()..]);
                return (out, flag);
            }
        }
        panic!("v2 bytes carry no kitchenBih flag: {v2}");
    }

    fn wpa_variant_suffix() -> String {
        let block =
            VariantBlock::for_config(EightBallVariantConfig::default());
        format!(",\"variant\":{}", serde_json::to_string(&block).unwrap())
    }

    /// v1 state bytes + the additive variant block (states end `…}`).
    fn splice_state(v1_state: &str) -> String {
        format!("{}{}}}", &v1_state[..v1_state.len() - 1],
            wpa_variant_suffix())
    }

    /// v1 judgment bytes + the block inside `next` (`next` is the LAST
    /// judgment field, so judgments end `…}}`).
    fn splice_judgment(v1_judgment: &str) -> String {
        format!("{}{}}}}}", &v1_judgment[..v1_judgment.len() - 2],
            wpa_variant_suffix())
    }

    /// The `next` state bytes of a judgment (last-field property).
    fn next_of(judgment: &str) -> String {
        let idx = judgment.find("\"next\":").unwrap();
        judgment[idx + 7..judgment.len() - 1].to_string()
    }

    fn v1_entry() -> &'static RulesetEntry {
        &crate::rulesets::eightball::ENTRY
    }

    /// Judge the same shot through both interpreters; assert byte
    /// parity; return the next-state pair for chaining.
    fn assert_judge_parity(v1_state: &str, v2_state: &str, events: &str,
        call: &str) -> (String, String) {
        let out1 = (v1_entry().judge)(v1_state, &rec(events), call).unwrap();
        let out2 = judge(v2_state, &rec(events), call).unwrap();
        let (residue, _flag) = peel_kitchen(&out2);
        assert_eq!(residue, splice_judgment(&out1),
            "WPA-config parity: v2 = v1 + the additive variant block \
             + the peeled kitchenBih flag (events {events}, call {call})");
        (next_of(&out1), next_of(&out2))
    }

    fn assert_apply_parity(v1_state: &str, v2_state: &str, decision: &str)
        -> (String, String) {
        let out1 =
            (v1_entry().apply_decision)(v1_state, decision).unwrap();
        let out2 = apply_decision(v2_state, decision).unwrap();
        let (residue, _flag) = peel_kitchen(&out2);
        assert_eq!(residue, splice_state(&out1),
            "WPA-config applyDecision parity (decision {decision})");
        (out1, out2)
    }

    #[test]
    fn eightball_v2_wpa_parity_break_matrix() {
        let s1 = (v1_entry().initial_state)(1).unwrap();
        let s2 = initial_state(1).unwrap();
        let (residue, flag) = peel_kitchen(&s2);
        assert_eq!(residue, splice_state(&s1));
        assert!(flag, "the opening break addresses from the kitchen");
        for events in [
            EV_CONTACT_ONLY, EV_DRY_4_RAILS, EV_POT_SOLID,
            EV_POT_BOTH_GROUPS, EV_EIGHT_POT, EV_EIGHT_POT_SCRATCH,
            EV_SCRATCH_DRY, EV_POT_PLUS_JUMPED, "[]",
        ] {
            assert_judge_parity(&s1, &s2, events, "null");
        }
    }

    #[test]
    fn eightball_v2_wpa_parity_decisions() {
        let s1 = (v1_entry().initial_state)(1).unwrap();
        let s2 = initial_state(1).unwrap();

        // dry_break (id 1): all three choices
        let (n1, n2) = assert_judge_parity(&s1, &s2, EV_CONTACT_ONLY, "null");
        for choice in 1..=3 {
            assert_apply_parity(&n1, &n2,
                &format!(r#"{{"decision":1,"choice":{choice}}}"#));
        }
        // eight_legal_break (id 2): spot-and-continue / re-break
        let (n1, n2) = assert_judge_parity(&s1, &s2, EV_EIGHT_POT, "null");
        for choice in 1..=2 {
            assert_apply_parity(&n1, &n2,
                &format!(r#"{{"decision":2,"choice":{choice}}}"#));
        }
        // eight_foul_break (id 3)
        let (n1, n2) =
            assert_judge_parity(&s1, &s2, EV_EIGHT_POT_SCRATCH, "null");
        for choice in 1..=2 {
            assert_apply_parity(&n1, &n2,
                &format!(r#"{{"decision":3,"choice":{choice}}}"#));
        }
        // break_foul (id 4)
        let (n1, n2) = assert_judge_parity(&s1, &s2, EV_SCRATCH_DRY, "null");
        for choice in 1..=2 {
            assert_apply_parity(&n1, &n2,
                &format!(r#"{{"decision":4,"choice":{choice}}}"#));
        }
        // stalemate (id 5): the never-pending agreement
        assert_apply_parity(&s1, &s2, r#"{"decision":5,"choice":1}"#);

        // error-code parity (messages differ only by the id prefix)
        for d in [r#"{"decision":9,"choice":1}"#,
            r#"{"decision":1,"choice":4}"#,
            r#"{"decision":2,"choice":1}"#] {
            let e1 = (v1_entry().apply_decision)(&s1, d).unwrap_err();
            let e2 = apply_decision(&s2, d).unwrap_err();
            assert_eq!(e1.code(), e2.code(), "decision {d}");
        }
    }

    #[test]
    fn eightball_v2_wpa_parity_play_matrix() {
        let mk = |phase: &str, groups: Option<(&str, &str)>,
                  on_table: &[i64]| {
            let base = EightBallMatchState {
                phase: phase.to_string(),
                shooter: 1,
                breaker: 1,
                groups: groups.map(|(a, b)| {
                    SeatPair::new(a.to_string(), b.to_string())
                }),
                on_table: on_table.to_vec(),
                pending_decision: None,
                result: None,
                foul_context: None,
            };
            let v1 = serde_json::to_string(&base).unwrap();
            let v2 = state_json(&base,
                &VariantBlock::for_config(EightBallVariantConfig::default()),
                false)
                .unwrap();
            (v1, v2)
        };
        let grouped: &[i64] = &[1, 2, 8, 9, 10];
        let on_the_8: &[i64] = &[8, 9, 10];
        let open: Vec<i64> = (1..=15).collect();
        let ev_wrong_first = r#"[
            {"t":0.1,"kind":{"BallBall":{"b1":0,"b2":9}},"post":[]},
            {"t":0.2,"kind":{"BallLinearCushion":{"ball":9}},"post":[]}]"#;
        let cases: &[(&(String, String), &str, &str)] = &[
            // fulfilled call: continue
            (&mk("grouped", Some(("solids", "stripes")), grouped),
                EV_POT_2_IN_5, r#"{"kind":"call","ball":2,"pocket":5}"#),
            // unfulfilled call: pass, ball stays down
            (&mk("grouped", Some(("solids", "stripes")), grouped),
                EV_POT_2_IN_5, r#"{"kind":"call","ball":2,"pocket":3}"#),
            // open-table fulfilled call assigns by the CALLED ball
            (&mk("open", None, &open),
                EV_POT_2_IN_5, r#"{"kind":"call","ball":2,"pocket":5}"#),
            // wrong first ball (group-aware P3)
            (&mk("grouped", Some(("solids", "stripes")), grouped),
                ev_wrong_first, r#"{"kind":"call","ball":1,"pocket":0}"#),
            // declared safety: legal pot stays down, seat passes
            (&mk("grouped", Some(("solids", "stripes")), grouped),
                EV_POT_2_IN_5, r#"{"kind":"safety"}"#),
            // jumped object ball: foul_stay_down
            (&mk("grouped", Some(("solids", "stripes")), grouped),
                EV_JUMPED_9, r#"{"kind":"call","ball":1,"pocket":0}"#),
            // the 8: called win
            (&mk("grouped", Some(("solids", "stripes")), on_the_8),
                EV_POT_8_IN_2, r#"{"kind":"call","ball":8,"pocket":2}"#),
            // the 8: early (not entitled)
            (&mk("grouped", Some(("solids", "stripes")), grouped),
                EV_POT_8_IN_2, r#"{"kind":"call","ball":8,"pocket":2}"#),
            // the 8: scratch while shooting it = foul under WPA
            (&mk("grouped", Some(("solids", "stripes")), on_the_8),
                EV_SCRATCH_ON_8, r#"{"kind":"call","ball":8,"pocket":2}"#),
            // no-rail-after-contact
            (&mk("grouped", Some(("solids", "stripes")), grouped),
                r#"[{"t":0.1,"kind":{"BallBall":{"b1":0,"b2":1}},"post":[]}]"#,
                r#"{"kind":"call","ball":1,"pocket":0}"#),
        ];
        for ((s1, s2), events, call) in cases {
            assert_judge_parity(s1, s2, events, call);
        }

        // call-gate + guard error-code parity (v2 texts differ only by
        // the id prefix; codes are the frozen surface)
        let (s1, s2) = mk("grouped", Some(("solids", "stripes")), grouped);
        for call in ["null", r#"{"kind":"call","ball":7,"pocket":0}"#,
            r#"{"kind":"call","ball":2,"pocket":-1}"#,
            r#"{"kind":"call","ball":99,"pocket":0}"#] {
            let e1 = (v1_entry().judge)(&s1, &rec(EV_RAIL_ONLY), call)
                .unwrap_err();
            let e2 = judge(&s2, &rec(EV_RAIL_ONLY), call).unwrap_err();
            assert_eq!(e1.code(), e2.code(), "call {call}");
        }
    }

    #[test]
    fn eightball_v2_wpa_parity_hud() {
        let s1 = (v1_entry().initial_state)(2).unwrap();
        let s2 = initial_state(2).unwrap();
        assert_eq!((v1_entry().hud_state)(&s1).unwrap(),
            hud_state(&s2).unwrap(),
            "the HUD projection is the v1 shape, byte-identical");
        // and after a judged shot
        let (n1, n2) = assert_judge_parity(&s1, &s2, EV_POT_SOLID, "null");
        assert_eq!((v1_entry().hud_state)(&n1).unwrap(),
            hud_state(&n2).unwrap());
    }

    #[test]
    fn eightball_v2_entry_and_catalog_shape() {
        assert_eq!(ENTRY.id, "eightball-v2");
        let c = catalog();
        assert_eq!(c.id, "eightball-v2");
        let v1c = (v1_entry().catalog)();
        // fouls mirror v1 (same codes, cites) + the two GH-371 rows;
        // decisions keep the frozen ids
        assert_eq!(
            serde_json::to_string(&c.fouls[..v1c.fouls.len()]).unwrap(),
            serde_json::to_string(&v1c.fouls).unwrap());
        assert_eq!(
            serde_json::to_string(&c.fouls[v1c.fouls.len()..]).unwrap(),
            concat!(
                "[{\"code\":\"bad-kitchen-shot\",",
                "\"cite\":\"WPA 3.11 via 4.9\"},",
                "{\"code\":\"kitchen-no-exit\",",
                "\"cite\":\"WPA 3.11 via 4.9\"}]"
            ));
        assert_eq!(serde_json::to_string(&c.decisions).unwrap(),
            serde_json::to_string(&v1c.decisions).unwrap());
        // terminals = the v1 five + the four config-born reasons
        assert_eq!(c.terminals[..5], v1c.terminals[..]);
        assert_eq!(&c.terminals[5..], &["eight-on-break",
            "eight-on-break-scratch", "scratch-on-eight", "dry-break-loss"]);
        assert_eq!(c.config["configSchema"], "task-config-v1");
        assert_eq!(c.config["defaultPreset"], "wpa-8ball");
    }

    // -- guards + the no-call break gate ------------------------------------------

    #[test]
    fn eightball_v2_judge_guards() {
        let s = initial_state(1).unwrap();
        // the break carries no call under every call regime
        let err = judge(&s, &rec(EV_CONTACT_ONLY),
            r#"{"kind":"call","ball":2,"pocket":3}"#).unwrap_err();
        assert_eq!(err.code(), "bad-call");

        // judging a finished match / a pending decision rejects
        let mut v: Value = serde_json::from_str(&s).unwrap();
        v["phase"] = Value::from("over");
        let err = judge(&v.to_string(), &rec(EV_CONTACT_ONLY), "null")
            .unwrap_err();
        assert_eq!(err.code(), "match-over");

        let j = judge_break_shot(&EightBallVariantConfig::default(),
            EV_CONTACT_ONLY);
        let next = serde_json::to_string(&j["next"]).unwrap();
        let err = judge(&next, &rec(EV_CONTACT_ONLY), "null").unwrap_err();
        assert_eq!(err.code(), "decision-pending");
        assert!(err.message().contains("'dry_break'"));
    }

    // -- skeleton: config-in-state carriage ------------------------------------

    #[test]
    fn eightball_v2_initial_state_carries_the_variant_block() {
        let s = initial_state(1).unwrap();
        let v: Value = serde_json::from_str(&s).unwrap();
        // the v1 base shape, key-for-key
        assert_eq!(v["phase"], "break");
        assert_eq!(v["shooter"], 1);
        assert_eq!(v["breaker"], 1);
        assert_eq!(v["groups"], Value::Null);
        assert_eq!(v["onTable"].as_array().unwrap().len(), 15);
        // additive variant block: default preset = pure-defaults config
        let wpa_preset = preset_by_id("wpa-8ball").unwrap();
        assert_eq!(v["variant"]["task_hash"], wpa_preset.task_hash);
        assert_eq!(
            serde_json::to_string(&v["variant"]["config"]).unwrap(),
            serde_json::to_string(
                &serde_json::from_str::<Value>(&wpa_preset.canonical_envelope)
                    .unwrap()["config"]
            )
            .unwrap(),
            "the state's config bytes are the canonical config bytes"
        );
        // the base key order is the v1 order, variant then the GH-371
        // kitchenBih flag LAST
        let base_prefix = crate::rulesets::eightball::ENTRY.initial_state;
        let v1 = base_prefix(1).unwrap();
        assert!(s.starts_with(&v1[..v1.len() - 1]),
            "v2 initial state = v1 bytes + the additive variant block");
        assert!(s.ends_with(",\"kitchenBih\":true}"),
            "the opening-break state arms the 3.11 kitchen context");
    }

    #[test]
    fn eightball_v2_state_roundtrip_is_byte_stable() {
        let s = initial_state_for_config(apa(), 2).unwrap();
        let (base, variant, kitchen_bih) = parse_state(&s).unwrap();
        assert_eq!(state_json(&base, &variant, kitchen_bih).unwrap(), s);
        assert_eq!(variant.config, apa());
    }

    #[test]
    fn eightball_v2_missing_variant_block_is_invalid_task_config() {
        // a plain v1 state handed to v2: rejected, never defaulted
        let v1_state = crate::rulesets::eightball::ENTRY.initial_state;
        let err = parse_state(&v1_state(1).unwrap()).unwrap_err();
        assert_eq!(err.code(), "invalid-task-config");
        assert!(err.message().contains("missing 'variant' block"));
        // hud goes through the same strict parse
        assert_eq!(hud_state(&v1_state(1).unwrap()).unwrap_err().code(),
            "invalid-task-config");
    }

    #[test]
    fn eightball_v2_malformed_variant_block_is_invalid_task_config() {
        let good = initial_state(1).unwrap();
        let mut v: Value = serde_json::from_str(&good).unwrap();

        // unknown config field
        v["variant"]["config"]["golden_break"] = Value::Bool(true);
        let err = parse_state(&v.to_string()).unwrap_err();
        assert_eq!(err.code(), "invalid-task-config");

        // out-of-domain value
        let mut v: Value = serde_json::from_str(&good).unwrap();
        v["variant"]["config"]["dry_break_rail_minimum"] =
            Value::from(16i64);
        let err = parse_state(&v.to_string()).unwrap_err();
        assert_eq!(err.code(), "invalid-task-config");
        assert!(err.message().contains("out of domain"));

        // hash/config identity mismatch (FR-008: the hash IS the identity)
        let mut v: Value = serde_json::from_str(&good).unwrap();
        v["variant"]["task_hash"] = Value::from("00".repeat(32));
        let err = parse_state(&v.to_string()).unwrap_err();
        assert_eq!(err.code(), "invalid-task-config");
        assert!(err.message().contains("not the hash"));

        // unknown variant-envelope field
        let mut v: Value = serde_json::from_str(&good).unwrap();
        v["variant"]["preset"] = Value::from("apa-8ball");
        let err = parse_state(&v.to_string()).unwrap_err();
        assert_eq!(err.code(), "invalid-task-config");
    }

    #[test]
    fn eightball_v2_base_shape_errors_stay_bad_state() {
        let good = initial_state(1).unwrap();
        let mut v: Value = serde_json::from_str(&good).unwrap();
        v["shooter"] = Value::from("one");
        let err = parse_state(&v.to_string()).unwrap_err();
        assert_eq!(err.code(), "bad-state");
        assert_eq!(parse_state("not json").unwrap_err().code(), "bad-state");
        assert_eq!(parse_state("[]").unwrap_err().code(), "bad-state");
    }

    #[test]
    fn eightball_v2_hud_is_the_v1_shape_without_variant() {
        let s = initial_state_for_config(apa(), 1).unwrap();
        let hud = hud_state(&s).unwrap();
        let v: Value = serde_json::from_str(&hud).unwrap();
        assert!(v.get("variant").is_none(),
            "hud_state is the v1 8-ball HUD shape unchanged");
        assert_eq!(v["phase"], "break");
        assert_eq!(v["onEight"], Value::Null);
        assert_eq!(v["openClaim"], false);
    }

    // -- GH-371: the WPA 3.11 kitchen-shot axis --------------------------------

    /// A dimensioned record: cue addressed in the kitchen, one object
    /// ball staged at `oy` (the head string is y = -0.635 on the 2.54 m
    /// table).
    fn kitchen_rec(oy: f64, events: &str) -> String {
        format!(concat!(
            "{{\"initial\":{{\"balls\":[",
            "{{\"id\":0,\"params\":{{\"r\":0.028575}},\"state\":{{\"pos\":",
            "{{\"x\":0.0,\"y\":-0.75,\"z\":0.028575}},",
            "\"motion\":\"Stationary\"}}}},",
            "{{\"id\":9,\"params\":{{\"r\":0.028575}},\"state\":{{\"pos\":",
            "{{\"x\":0.0,\"y\":{oy},\"z\":0.028575}},",
            "\"motion\":\"Stationary\"}}}}],",
            "\"table\":{{\"width\":1.27,\"length\":2.54,\"pockets\":[]}}}},",
            "\"events\":{events}}}"), oy = oy, events = events)
    }

    /// An armed kitchen-context v2 state: seat 1 shooting stripes.
    fn kitchen_state(config: &EightBallVariantConfig) -> String {
        let base = EightBallMatchState {
            phase: "grouped".to_string(),
            shooter: 1,
            breaker: 2,
            groups: Some(SeatPair::new(
                "stripes".to_string(), "solids".to_string())),
            on_table: (1..=15).collect(),
            pending_decision: None,
            result: None,
            foul_context: None,
        };
        state_json(&base, &VariantBlock::for_config(config.clone()), true)
            .unwrap()
    }

    const EV_KITCHEN_HIT_9: &str = r#"[
        {"t":0,"kind":{"Strike":{"ball":0}},"post":[]},
        {"t":0.1,"kind":{"BallBall":{"b1":0,"b2":9}},"post":[]},
        {"t":0.2,"kind":{"BallLinearCushion":{"ball":9}},"post":[]}]"#;

    #[test]
    fn eightball_v2_kitchen_rule_wpa_fouls_both_paragraphs() {
        // 9 in the kitchen, no crossing: para 1 AND para 2 (never
        // crossed, never contacted a ball past the line) — standard
        // foul remedy, BIH anywhere (4.9 via 1.6)
        let s = kitchen_state(&EightBallVariantConfig::default());
        let out = judge(&s, &kitchen_rec(-0.69, EV_KITCHEN_HIT_9),
            r#"{"kind":"safety"}"#).unwrap();
        let j: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(j["legal"], false);
        assert_eq!(j["fouls"][0]["code"], "bad-kitchen-shot");
        assert_eq!(j["fouls"][0]["cite"], "WPA 3.11 via 4.9");
        assert_eq!(j["fouls"][1]["code"], "kitchen-no-exit");
        assert_eq!(j["ballInHand"], "anywhere");
        assert_eq!(j["next"]["kitchenBih"], false,
            "an anywhere grant is not the restricted kitchen right");
    }

    #[test]
    fn eightball_v2_kitchen_rule_crossing_and_online_are_legal() {
        // the cue crosses the head string before contacting a FRONT
        // ball: legal
        let s = kitchen_state(&EightBallVariantConfig::default());
        let ev_cross = r#"[
            {"t":0,"kind":{"Strike":{"ball":0}},"post":[]},
            {"t":0.05,"kind":{"Transition":{"ball":0}},"post":[[0,
              {"pos":{"x":0.0,"y":0.0,"z":0.028575},
               "motion":"Stationary"}]]},
            {"t":0.1,"kind":{"BallBall":{"b1":0,"b2":9}},"post":[]},
            {"t":0.2,"kind":{"BallLinearCushion":{"ball":9}},"post":[]}]"#;
        let out = judge(&s, &kitchen_rec(0.2, ev_cross),
            r#"{"kind":"safety"}"#).unwrap();
        let j: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(j["legal"], true, "{j}");

        // a ball resting exactly ON the head string is playable (1.6)
        let s = kitchen_state(&EightBallVariantConfig::default());
        let out = judge(&s, &kitchen_rec(-0.635, EV_KITCHEN_HIT_9),
            r#"{"kind":"safety"}"#).unwrap();
        let j: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(j["legal"], true, "{j}");
    }

    #[test]
    fn eightball_v2_kitchen_rule_off_is_the_parity_point() {
        // the same para-1/para-2 geometry under kitchen_rule=off: legal
        // (the pre-371 non-judging point; unsliced schema value)
        let cfg = EightBallVariantConfig {
            kitchen_rule: KitchenRule::Off,
            ..EightBallVariantConfig::default()
        };
        let s = kitchen_state(&cfg);
        let out = judge(&s, &kitchen_rec(-0.69, EV_KITCHEN_HIT_9),
            r#"{"kind":"safety"}"#).unwrap();
        let j: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(j["legal"], true, "{j}");
    }

    #[test]
    fn eightball_v2_kitchen_rule_needs_the_armed_context() {
        // identical geometry WITHOUT the kitchenBih grant: legal — 3.11
        // binds in-hand-above-the-head-string play only
        let base = EightBallMatchState {
            phase: "grouped".to_string(),
            shooter: 1,
            breaker: 2,
            groups: Some(SeatPair::new(
                "stripes".to_string(), "solids".to_string())),
            on_table: (1..=15).collect(),
            pending_decision: None,
            result: None,
            foul_context: None,
        };
        let s = state_json(&base,
            &VariantBlock::for_config(EightBallVariantConfig::default()),
            false).unwrap();
        let out = judge(&s, &kitchen_rec(-0.69, EV_KITCHEN_HIT_9),
            r#"{"kind":"safety"}"#).unwrap();
        let j: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(j["legal"], true, "{j}");
    }

    #[test]
    fn eightball_v2_kitchen_bih_must_be_boolean() {
        // review r1 P2: a PRESENT non-boolean kitchenBih is a malformed
        // state — never silently reinterpreted as unrestricted
        let s = initial_state(1).unwrap();
        for bad in ["null", "\"yes\"", "1"] {
            let mangled =
                s.replace(",\"kitchenBih\":true", &format!(
                    ",\"kitchenBih\":{bad}"));
            let err = parse_state(&mangled).unwrap_err();
            assert_eq!(err.code(), "bad-state", "{bad}");
            assert!(err.message().contains("kitchenBih"), "{bad}: {err}");
        }
    }

    #[test]
    fn eightball_v2_kitchen_context_arms_through_break_foul_decision() {
        // scratch-dry break -> decision 4 pends; the judgment itself
        // never arms the flag (the resolution knows the choice)
        let s = initial_state(1).unwrap();
        let out = judge(&s, &rec(EV_SCRATCH_DRY), "null").unwrap();
        let j: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(j["decisionRequired"]["kind"], "break_foul");
        assert_eq!(j["next"]["kitchenBih"], false);
        let pending = j["next"].to_string();
        // choice 2 (take BIH): kitchen in-hand under the WPA scope
        let n2 = apply_decision(&pending, r#"{"decision":4,"choice":2}"#)
            .unwrap();
        assert!(n2.ends_with(",\"kitchenBih\":true}"), "{n2}");
        // choice 1 (accept position) after a SCRATCHED break: the cue
        // still enters play from the kitchen (4.3(g))
        let n1 = apply_decision(&pending, r#"{"decision":4,"choice":1}"#)
            .unwrap();
        assert!(n1.ends_with(",\"kitchenBih\":true}"), "{n1}");
    }
}
