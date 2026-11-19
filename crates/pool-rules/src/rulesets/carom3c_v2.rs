// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `carom3c-v2` (GH-383) — the carom3c variant engine: UMB World Rules of
//! Carom Billiard (1 Jan 1989), three cushions, config-in-state
//! (the registry API contract §3, the `eightball-v2` carriage). The
//! frozen `carom3c-v1` entry is BYTE-UNTOUCHED (FR-002); this id is
//! appended by the GH-383 registry-growth event and judges the three
//! owner-ordered completion axes behind `CaromVariantConfig`
//! (task_config.rs, family `carom3c`):
//!
//! - `two_cue_balls` (UMB Art 22.1/23.2/23.4): per-seat cue-ball
//!   assignment — the STARTER plays the plain white (ball 0), the other
//!   seat the marked/yellow ball (ball 1), each seat keeps its ball for
//!   the whole match. Striking the other seat's ball is the Art 41.11
//!   foul (`wrong-ball`, the referee's "wrong ball" indication). The
//!   struck ball still derives from the record's own `Strike` event
//!   (pure stream data — kernel Amendment 026 emits non-zero ids);
//!   `false` = the documented v1 shared-white residual (both seats play
//!   ball 0, no 41.11 — carom3c.rs header).
//! - `insufficient_cushions_foul` (UMB Art 83 letter): a cannon reached
//!   with fewer than three prior cushions becomes a FOUL announced with
//!   the rulebook's words — `no-cushion` / `one-cushion` /
//!   `two-cushions` (cite Art 83) — instead of the v1 cited non-scoring
//!   reason (audit-carom F1; score/turn consequences identical either
//!   way, the classification surface flips from `lastReason` to
//!   `Judgment.fouls`/`foulContext`). A clean miss (second ball never
//!   contacted) stays the legal Art 24.5 miss under BOTH values — the
//!   rulebook's foul binds "before touching the second object-ball",
//!   not the failure to reach it.
//! - `equal_innings` (UMB Art 29.3/29.4): when the seat that STARTED the
//!   game reaches the target, the match does not end — the opponent
//!   levels the innings from the respotted INITIAL STARTING POSITION
//!   (phase `leveling_break`: pending `break_spot` option for the
//!   leveling seat per Art 23.1(c), red-first requirement per Art 23.3 —
//!   the leveling stroke replays the starting-cannon conditions, the
//!   strictest mechanical reading, suite-pinned). The leveling seat
//!   continues while scoring (phase `leveling`); reaching the target
//!   levels the match to a DRAW (`Terminal { winner: 0, reason:
//!   "carom-draw", cite: "UMB Art 29.4" }` — winner 0 is the draw
//!   sentinel, the only ruleset that can emit one); any non-scoring
//!   stroke ends the match for the first finisher (`carom-target-
//!   reached`). When the NON-breaker reaches the target the innings are
//!   already even and the match terminates exactly like v1. XY geometry
//!   of the leveling reset stays adapter-side (research R7): the
//!   `leveling_break` phase IS the signal (the `eightball-v2 re_break`
//!   precedent), placements per Art 23.1 with the leveling seat's ball
//!   on the chosen start spot.
//! - `target` (UMB Art 29.1): the race distance (v1 carried it as state
//!   data already; the family config makes it a preset/task axis).
//!
//! GH-371 adoption (composed at the GH-383 rebase onto the 0.1.7 base):
//! v1 gained the UMB Art 27.2/41.8 `frozen-cushion-play` foul and the
//! Art 27.1(a) `contact_respot` recorded request (decision 16) — both
//! are v1-behavior surfaces, so this engine carries them at EVERY config
//! point (they are not variant axes): the foul reuses v1's
//! `frozen_cushion_direct_play` over the per-seat striker, the decision
//! mirrors v1's never-pending no-op liturgy.
//!
//! Defaults (all four) = the frozen v1 behavior point; the `umb-carom`
//! default preset aliases to `carom3c-v1` (FR-005), so this engine only
//! ever judges non-default selections (`umb-carom-2cue`,
//! `umb-carom-2cue-ei`) and task-config points. Its own conformance
//! slices live at `scripts/fixtures/rules-corpus-variants/
//! umb-carom-2cue{,-ei}.json` (the fourteenone/tenball additive-slice
//! law; the 442-case legacy corpus is byte-untouched).

use serde::Serialize;
use serde_json::Value;

use crate::error::RulesError;
use crate::judgment::{
    CitedFoul, Judgment, PlacementRight, SeatPair, Terminal, Turn,
};
use crate::primitives::{
    contact, decisions, fouls as fouls_mod, fouls::Fouls, scan,
    terminal as term, turn,
};
use crate::rulesets::carom3c::{
    frozen_cushion_direct_play, CaromMatchState, CaromReason,
    PendingBreakSpot, CAROM_BALL_BREAKER, CAROM_BALL_OPPONENT,
    CAROM_BALL_RED,
};
use crate::rulesets::registry::{CatalogEntry, DecisionRow, RulesetEntry};
use crate::task_config::{
    canonical_envelope_json_carom3c, sha256_hex, validate_carom_config,
    CaromVariantConfig,
};
use crate::wire;

// ---- pinned citation strings (v1 texts + the GH-383 additions) --------------

const CITE_WRONG_FIRST_BREAK: &str = "UMB Art 23.3/41.12";
const CITE_FROZEN_CUSHION: &str = "UMB Art 27.2/41.8";
const CITE_OFF_TABLE: &str = "UMB Art 41.1/28.1(b)";
const CITE_INSUFFICIENT: &str = "UMB Art 83";
const CITE_MISSED: &str = "UMB Art 24.5";
const CITE_WIN: &str = "UMB Art 29.1/29.2";
const CITE_WRONG_BALL: &str = "UMB Art 41.11";
const CITE_DRAW: &str = "UMB Art 29.4";

// ---- the additive variant block (the registry API contract §3) ----------------

/// The config-in-state carriage: `{task_hash, config}` (the eightball-v2
/// shape). STRICT parse; every error is `invalid-task-config`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VariantBlock {
    pub task_hash: String,
    pub config: CaromVariantConfig,
}

impl VariantBlock {
    /// Build the block for a validated config (SC-007: the crate's ONE
    /// hasher over the canonical envelope bytes).
    pub(crate) fn for_config(config: CaromVariantConfig) -> VariantBlock {
        let hash =
            sha256_hex(canonical_envelope_json_carom3c(&config).as_bytes());
        VariantBlock { task_hash: hash, config }
    }
}

fn invalid_cfg(msg: impl Into<String>) -> RulesError {
    RulesError::InvalidTaskConfig(msg.into())
}

/// STRICT variant-block parse: unknown fields, config domain violations,
/// and a `task_hash` that is not the SHA-256 of the config's canonical
/// envelope bytes all reject — the hash IS the variant identity (FR-008).
fn parse_variant(v: Value) -> Result<VariantBlock, RulesError> {
    let block: VariantBlock = serde_json::from_value(v)
        .map_err(|e| invalid_cfg(format!(
            "carom3c-v2 state: variant block: {e}")))?;
    validate_carom_config(&block.config)?;
    let expected = sha256_hex(
        canonical_envelope_json_carom3c(&block.config).as_bytes());
    if block.task_hash != expected {
        return Err(invalid_cfg(format!(
            "carom3c-v2 state: variant.task_hash '{}' is not the hash of \
             the config bytes (expected '{expected}')",
            block.task_hash
        )));
    }
    Ok(block)
}

/// The complete v2 state: the v1 shape (flattened — key order preserved)
/// plus the additive `variant` block LAST. Serialization side only; the
/// parse side splits by hand so `variant` errors carry
/// `invalid-task-config` while base-shape errors stay `bad-state`.
#[derive(Serialize)]
struct V2State {
    #[serde(flatten)]
    base: CaromMatchState,
    variant: VariantBlock,
}

fn parse_state(json: &str)
    -> Result<(CaromMatchState, VariantBlock), RulesError> {
    let v: Value = serde_json::from_str(json)
        .map_err(|e| RulesError::BadState(format!("carom3c-v2 state: {e}")))?;
    let Value::Object(mut obj) = v else {
        return Err(RulesError::BadState(
            "carom3c-v2 state: not a JSON object".to_string()));
    };
    let variant_v = obj.remove("variant").ok_or_else(|| invalid_cfg(
        "carom3c-v2 state: missing 'variant' block (config-in-state, \
         contracts/registry-api.md §3 — never a default fallback)"))?;
    let variant = parse_variant(variant_v)?;
    let base: CaromMatchState =
        serde_json::from_value(Value::Object(obj)).map_err(|e| {
            RulesError::BadState(format!("carom3c-v2 state: {e}"))
        })?;
    // review r2: the base `target` is state data OUTSIDE the hashed
    // envelope — a mismatch would let a race-to-15 task hash adjudicate a
    // race-to-1 match. The hashed config is the identity; reject drift.
    if base.target != variant.config.target {
        return Err(invalid_cfg(format!(
            "carom3c-v2 state: target {} does not match the hashed \
             variant config target {} (the task hash is the identity — \
             a diverged copy is corrupt, not reinterpretable)",
            base.target, variant.config.target
        )));
    }
    Ok((base, variant))
}

fn state_json(base: &CaromMatchState, variant: &VariantBlock)
    -> Result<String, RulesError> {
    serde_json::to_string(&V2State {
        base: base.clone(),
        variant: variant.clone(),
    })
    .map_err(|e| RulesError::BadState(format!(
        "carom3c-v2 state serialization: {e}")))
}

// ---- seat-ball law (Art 22.1/23.2/23.4) ----------------------------------------

/// The cue ball a seat plays: under `two_cue_balls` the STARTER (breaker)
/// plays the plain white (ball 0) and the other seat the marked/yellow
/// ball (ball 1), all match (Art 23.2/23.4); under the v1 residual both
/// seats play ball 0.
fn seat_ball(config: &CaromVariantConfig, breaker: u8, seat: u8) -> i64 {
    if config.two_cue_balls && seat != breaker {
        CAROM_BALL_OPPONENT
    } else {
        CAROM_BALL_BREAKER
    }
}

// ---- entry ---------------------------------------------------------------------

/// The registry entry (appended by the GH-383 registry-growth event).
pub static ENTRY: RulesetEntry = RulesetEntry {
    id: "carom3c-v2",
    initial_state,
    judge,
    apply_decision,
    hud_state,
    catalog,
};

/// TS-`over` predicate (v1 law + the v2 leveling phases are NOT over).
fn is_over(state: &CaromMatchState) -> bool {
    state.result.is_some() || state.phase == "over"
}

/// A phase whose stroke must open on the red ball (Art 23.3 — the
/// starting cannon; the leveling inning replays the starting-cannon
/// conditions from the respotted initial position, Art 29.4 via 23.1/23.3).
fn is_break_like(phase: &str) -> bool {
    phase == "break" || phase == "leveling_break"
}

/// Fresh break address for a validated config (the v1 shape with the
/// config's target).
fn fresh_state(config: &CaromVariantConfig, breaker: u8) -> CaromMatchState {
    CaromMatchState {
        phase: "break".to_string(),
        shooter: breaker,
        points: SeatPair::new(0, 0),
        innings: 0,
        target: config.target,
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
    }
}

/// Initial v2 state for a validated config (the `task_initial_state_json`
/// backend).
pub(crate) fn initial_state_for_config(
    config: CaromVariantConfig, breaker: u8,
) -> Result<String, RulesError> {
    state_json(&fresh_state(&config, breaker),
        &VariantBlock::for_config(config))
}

/// Registry `initial_state`: the pure-defaults config point (= the frozen
/// v1 behavior; selections normally reach this engine through presets).
fn initial_state(breaker: u8) -> Result<String, RulesError> {
    initial_state_for_config(CaromVariantConfig::default(), breaker)
}

/// `judge`, one pass. Guard order = the v1 body order: match over →
/// break-spot pending → the call gate.
fn judge(state_json_in: &str, record_json: &str, call_json: &str)
    -> Result<String, RulesError> {
    let (state, variant) = parse_state(state_json_in)?;
    let config = variant.config;

    term::guard_not_over(
        is_over(&state),
        "carom3c-v2: judge called after the match ended (adapter contract)",
    )?;
    term::guard_no_pending(
        state.pending_decision.is_some(),
        "carom3c-v2: judge called while the break-spot option is pending \
         (Art 23.1(c)) — resolve it via applyDecision"
            .to_string(),
    )?;
    let call: Value = serde_json::from_str(call_json)
        .map_err(|e| RulesError::BadCall(format!("carom3c-v2 call: {e}")))?;
    if !call.is_null() {
        return Err(RulesError::BadCall(
            "carom3c-v2: three-cushion carries no call/safety/nomination \
             inputs"
                .to_string(),
        ));
    }

    let record = wire::parse_record(record_json)?;

    // P1/P2/P7/P8 single pass (v1 scan config): striker from the record's
    // own Strike event, deduped off-table incl. a jumped striker.
    let facts = scan::scan(&record, &scan::ScanConfig {
        striker_from_strike: true,
        dedup_off_table: true,
        off_table_includes_striker: true,
        jump_over_geometry: false,
        head_string_y: None, // no head string on the carom table
    });
    let shooter = state.shooter;

    let mut fouls = Fouls::new();
    // Art 41.11 wrong ball (two_cue_balls only): the seat must play ITS
    // ball. Checked first — the referee's "wrong ball" indication binds
    // the stroke itself, before any first-contact/cushion judgment.
    let own_ball = seat_ball(&config, state.breaker, shooter);
    if config.two_cue_balls && facts.struck != own_ball {
        fouls.push("wrong-ball", CITE_WRONG_BALL);
    }
    // P3 break red-first hook (Art 23.3 via Art 41.12): break-like phases
    // only (the leveling stroke replays the starting cannon); a stroke
    // that contacts NOTHING is an Art 24.5 miss (v1 law).
    if is_break_like(&state.phase) {
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
    // Art 27.2 via 41.8 (GH-371 adoption): frozen-cushion direct play —
    // v1's check verbatim over the per-seat striker, appended between
    // the break check and off-table (the v1 body order).
    if frozen_cushion_direct_play(&record, facts.struck) {
        fouls.push("frozen-cushion-play", CITE_FROZEN_CUSHION);
    }
    if !facts.off_table.is_empty() {
        fouls.push("ball-off-table", CITE_OFF_TABLE);
    }
    // Art 83 letter (insufficient_cushions_foul): a cannon completed with
    // fewer than three prior cushions is a FOUL, announced with the
    // rulebook's words. A clean miss stays the legal Art 24.5 miss.
    if config.insufficient_cushions_foul
        && fouls.is_empty()
        && facts.cannon
        && facts.cushions_before_second < 3
    {
        let code = match facts.cushions_before_second {
            0 => "no-cushion",
            1 => "one-cushion",
            _ => "two-cushions",
        };
        fouls.push(code, CITE_INSUFFICIENT);
    }

    // Art 83 point: ≥3 struck-ball cushions before the second object ball
    // (a foul voids the point — Art 41).
    let point =
        fouls.is_empty() && facts.cannon && facts.cushions_before_second >= 3;
    let last_reason: Option<CaromReason> = if point || !fouls.is_empty() {
        None
    } else if facts.cannon {
        // only reachable when insufficient_cushions_foul is false (the
        // v1 classification — byte-parity with carom3c-v1)
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
    let reached = point && *points.get(shooter) >= state.target;
    let leveling_phase = state.phase == "leveling_break"
        || state.phase == "leveling";

    // Terminal / leveling resolution (Art 29):
    // - leveling phases: reached ⇒ DRAW (Art 29.4); any non-scoring
    //   stroke ⇒ the first finisher (the breaker) wins; a scoring stroke
    //   short of the target continues the serie.
    // - normal phases: reached by the BREAKER under equal_innings ⇒ the
    //   leveling inning (no terminal); otherwise reached ⇒ the v1
    //   race-to-target terminal.
    let mut pending_decision: Option<PendingBreakSpot> = None;
    let (terminal, next_phase): (Option<Terminal>, &str) = if leveling_phase {
        if reached {
            (Some(term::terminal(0, "carom-draw", CITE_DRAW)), "over")
        } else if point {
            (None, "leveling")
        } else {
            (
                Some(term::terminal(
                    i64::from(state.breaker), "carom-target-reached",
                    CITE_WIN)),
                "over",
            )
        }
    } else if reached {
        if config.equal_innings && shooter == state.breaker {
            // Art 29.4: the opponent levels from the respotted initial
            // starting position — with the start-spot option (Art 23.1(c))
            let other = if shooter == 1 { 2 } else { 1 };
            pending_decision = Some(PendingBreakSpot {
                kind: "break_spot".to_string(),
                chooser: other,
            });
            (None, "leveling_break")
        } else {
            (
                Some(term::terminal(
                    i64::from(shooter), "carom-target-reached", CITE_WIN)),
                "over",
            )
        }
    } else {
        (None, "play")
    };
    // Turn law: v1 (a point continues, anything else passes) with ONE v2
    // exception — the leveling transition is a scoring stroke whose visit
    // still ENDS (Art 29.4: the opponent levels), so it passes.
    let turn_v = if next_phase == "leveling_break" {
        Turn::Pass
    } else if point {
        Turn::Continue
    } else {
        Turn::Pass
    };
    // Innings law: an inning (a completed turn PAIR) closes when the seat
    // that did NOT open the game ENDS A VISIT — by passing OR by a
    // terminal (review r1+r2: a terminal scoring visit still ends — the
    // draw and the non-breaker's race win both complete the pair, so
    // their banners report the true count; v1 froze the uncounted-final-
    // inning nit, audit-carom §C — v2 corrects it in its own slices).
    // The BREAKER's terminal visit closes no pair (their visit is the
    // pair's first half) — unchanged.
    let visit_ends = turn_v == Turn::Pass || terminal.is_some();
    let innings = if visit_ends && shooter != state.breaker {
        state.innings + 1
    } else {
        state.innings
    };
    // P18 (v1 law): terminal holds the seat; Pass rotates it — which also
    // hands the leveling inning to the opponent.
    let next_shooter =
        turn::resolve_seat(shooter, terminal.is_some(), false, turn_v);

    let legal = fouls.legal(); // P11 invariant
    let foul_context =
        fouls_mod::foul_context(fouls.as_slice(), i64::from(shooter));

    let judgment = Judgment {
        legal,
        fouls: fouls.into_vec(),
        pocketed: Vec::new(), // pocketless table (v1 law)
        ball_in_hand: PlacementRight::None, // carom grants no placement
        respot: facts.off_table.clone(), // only the balls concerned
        turn: turn_v,
        decision_required: None, // break_spot pends via next.pendingDecision
                                 // (the initialState-born v1 law; the
                                 // leveling option rides the state too)
        terminal: terminal.clone(),
        next: V2State {
            base: CaromMatchState {
                phase: next_phase.to_string(),
                shooter: next_shooter,
                points,
                innings,
                target: state.target,
                breaker: state.breaker,
                pending_decision,
                break_spot: state.break_spot,
                last_reason,
                cushions_this_shot: facts.cushions_before_second,
                foul_context,
                result: terminal,
            },
            // the registry API contract §3: re-emitted verbatim
            variant: variant.clone(),
        },
    };
    judgment.to_json()
}

/// `applyDecision`: the v1 P16 liturgy (post-match guard → unknown id →
/// choice range → kind-vs-pending match), v2-labeled messages, variant
/// block carried through untouched.
fn apply_decision(state_json_in: &str, decision_json: &str)
    -> Result<String, RulesError> {
    let (state, variant) = parse_state(state_json_in)?;
    term::guard_not_over(
        is_over(&state),
        "carom3c-v2: no decision can be applied after the match ended",
    )?;
    let d = decisions::parse_decision(decision_json)?;
    if d.decision == 16 {
        // contact_respot (UMB Art 27.1(a), GH-371 adoption): the striker's
        // recorded demand to respot the balls concerned when the cue ball
        // stands frozen to another ball — never pending (the stroke itself
        // is the play-away alternative); the respot XY is adapter geometry
        // (`caromRespotPlan`, research R7) and the frozen set re-derives
        // from the table at replay time, so the state is unchanged. The
        // frozen-at-address precondition is adapter-owned
        // (`caromBallsInContact`).
        decisions::check_choice(
            d.choice == 1,
            format!(
                "carom3c-v2: choice {} out of range for 'contact_respot' \
                 (1 respot the balls concerned)",
                d.choice
            ),
        )?;
        decisions::check_pending(
            state.pending_decision.is_none(),
            "carom3c-v2: contact_respot cannot pre-empt the pending \
             'break_spot' option"
                .to_string(),
        )?;
        return state_json(&state, &variant);
    }
    if d.decision != 10 {
        return Err(decisions::unknown_id(format!(
            "carom3c-v2: unknown decision id {} (only 10 carom_break_spot \
             — UMB Art 23.1(c) — and 16 contact_respot — UMB Art 27.1(a))",
            d.decision
        )));
    }
    decisions::check_choice(
        d.choice == 1 || d.choice == 2,
        format!(
            "carom3c-v2: choice {} out of range for 'break_spot' \
             (1 left | 2 right)",
            d.choice
        ),
    )?;
    decisions::check_pending(
        state
            .pending_decision
            .as_ref()
            .is_some_and(|p| p.kind == "break_spot"),
        "carom3c-v2: decision 'break_spot' does not match the pending \
         option (none)"
            .to_string(),
    )?;
    state_json(&CaromMatchState {
        pending_decision: None,
        break_spot: if d.choice == 1 { "left" } else { "right" }.to_string(),
        ..state
    }, &variant)
}

/// `hudState`: the v1 projection (the `phase`→`stage` rename + the
/// `{by, fouls}` foul-context clone), variant block parsed-then-dropped
/// (the eightball-v2 law — config consumers read the match state, not
/// the hud).
fn hud_state(state_json_in: &str) -> Result<String, RulesError> {
    let (state, _variant) = parse_state(state_json_in)?;
    #[derive(Serialize)]
    struct CaromHudFoulContext {
        by: i64,
        fouls: Vec<CitedFoul>,
    }
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
        RulesError::BadState(format!("carom3c-v2 hud serialization: {e}"))
    })
}

/// Catalog row: the v1 foul triple (incl. the GH-371 Art 27.2
/// `frozen-cushion-play`) + the GH-383 additions (Art 41.11
/// `wrong-ball`; the Art 83 announce triple), the v1 decision pair (10
/// break_spot, 16 contact_respot), both terminals (`carom-draw` NEW —
/// winner 0 sentinel), and the variant-engine config block (family +
/// default preset, the eightball-v2 shape).
fn catalog() -> CatalogEntry {
    CatalogEntry {
        id: "carom3c-v2",
        fouls: vec![
            CitedFoul::new("wrong-first-ball-break", CITE_WRONG_FIRST_BREAK),
            CitedFoul::new("frozen-cushion-play", CITE_FROZEN_CUSHION),
            CitedFoul::new("ball-off-table", CITE_OFF_TABLE),
            CitedFoul::new("wrong-ball", CITE_WRONG_BALL),
            CitedFoul::new("no-cushion", CITE_INSUFFICIENT),
            CitedFoul::new("one-cushion", CITE_INSUFFICIENT),
            CitedFoul::new("two-cushions", CITE_INSUFFICIENT),
        ],
        decisions: vec![
            DecisionRow { id: 10, kind: "break_spot", choice_max: 2 },
            // GH-371 adoption: UMB Art 27.1(a) balls-in-contact
            // demand-respot (recorded request, never pending;
            // adapter-executed)
            DecisionRow { id: 16, kind: "contact_respot", choice_max: 1 },
        ],
        terminals: vec!["carom-target-reached", "carom-draw"],
        config: serde_json::json!({
            "family": "carom3c",
            "configSchema": crate::task_config::TASK_CONFIG_SCHEMA,
            "defaultPreset": "umb-carom",
            "balls": {
                "breaker": CAROM_BALL_BREAKER,
                "opponent": CAROM_BALL_OPPONENT,
                "red": CAROM_BALL_RED,
            },
        }),
    }
}
