// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `moneyball` — the feature-013 US3 worked example (T042, SC-003): a
//! complete TOY ruleset composed from `pool_rules::primitives`, showing
//! the marginal cost of a new discipline now that the shared adjudication
//! machinery is factored. `docs/sdk/rules-crate.md` walks this file
//! end-to-end; read `crates/pool-rules/src/rulesets/nineball.rs` next —
//! the smallest REAL consumer of the same primitives.
//!
//! The game — `moneyball-toy`, a toy Chinese money-ball rotation:
//! - Rotation legality: the cue must FIRST contact the lowest-numbered
//!   ball on the table (P3), and afterwards some ball must reach a rail
//!   or pocket (P4). A scratch (P9) or any ball driven off the table
//!   (P8) is a foul.
//! - Money: balls 3 and 6 pay 1 point, the 9 pays 2 — to the shooter, on
//!   a LEGAL stroke only. Pocketed or jumped money balls always RESPOT
//!   (P13; ball ids only — spot geometry stays in the TS adapter,
//!   research R7). Non-money balls stay down.
//! - First to 4 points wins the rack (`money-target`, P17). Three
//!   consecutive fouls lose it (`three-fouls`, P15).
//! - After any non-terminal foul the INCOMING player chooses the
//!   response (P16, decision kind `foul_response`): choice 1 = play from
//!   where the balls lie, choice 2 = take cue ball in hand.
//!
//! NOT registered in the shipped registry: the five ids in
//! `src/rulesets/registry.rs` are frozen (011/012 contracts) and the
//! static `REGISTRY` slice cannot be extended at runtime — the toy
//! builds its own local [`RulesetEntry`] instead. Its decision id (11)
//! deliberately sits OUTSIDE the frozen share-codec id space 1–10; a
//! real port would claim the next free id there.
//!
//! Run:  `cargo run -p pool-rules --example moneyball`
//! Test: `cargo test -p pool-rules --example moneyball` (also runs in
//! the plain `cargo test -p pool-rules` — Cargo.toml `[[example]]
//! test = true`).

use serde::{Deserialize, Serialize};

use pool_rules::error::RulesError;
use pool_rules::judgment::{
    Chooser, CitedFoul, DecisionRequired, Judgment, PlacementRight, SeatPair,
    Terminal, Turn,
};
use pool_rules::primitives::{
    contact, counters, decisions, fouls::Fouls, respot_chain, scan,
    terminal as term, turn,
};
use pool_rules::rulesets::registry::{CatalogEntry, DecisionRow, RulesetEntry};
use pool_rules::wire;

// ---- configuration (SC-003: "bespoke code PLUS configuration") -------------
// config:begin
/// Money values by ball id: 3 and 6 pay 1 point, the 9 pays 2.
const MONEY: [(i64, i64); 3] = [(3, 1), (6, 1), (9, 2)];
/// First to this many points wins the rack.
const TARGET: i64 = 4;
/// Consecutive fouls that lose the rack (P15).
const THREE_FOULS: i64 = 3;
/// The foul-response decision (P16). Id 11 sits OUTSIDE the frozen
/// shipped id space 1–10 (share-codec v4); a real port claims the next
/// free id there.
const FOUL_RESPONSE_ID: i64 = 11;
const FOUL_RESPONSE_KIND: &str = "foul_response";
// config:end

// ---- the bespoke ruleset module (SC-003 budget: ≤ 200 code lines) ----------
// The `sc003_bespoke_budget` test below counts the non-blank, non-comment
// lines between these two markers and fails above 200.
// bespoke:begin

/// Match state (serde key order = the wire the adapter would see).
#[derive(Debug, Clone, Serialize, Deserialize)]
struct MoneyBallState {
    shooter: u8,
    #[serde(rename = "onTable")]
    on_table: Vec<i64>,
    scores: SeatPair<i64>,
    #[serde(rename = "foulStreak")]
    foul_streak: SeatPair<i64>,
    /// `Some(kind)` while a rulebook decision is pending (P16).
    pending: Option<String>,
    /// Adapter placement flag, granted by `foul_response` choice 2.
    #[serde(rename = "ballInHand")]
    ball_in_hand: bool,
    result: Option<Terminal>,
}

fn money_value(id: i64) -> Option<i64> {
    MONEY.iter().find(|(b, _)| *b == id).map(|(_, v)| *v)
}

fn parse_state(json: &str) -> Result<MoneyBallState, RulesError> {
    serde_json::from_str(json)
        .map_err(|e| RulesError::BadState(format!("moneyball-toy state: {e}")))
}

fn state_bytes(state: &MoneyBallState) -> Result<String, RulesError> {
    serde_json::to_string(state).map_err(|e| {
        RulesError::BadState(format!("moneyball-toy state serialization: {e}"))
    })
}

fn initial_state(breaker: u8) -> Result<String, RulesError> {
    state_bytes(&MoneyBallState {
        shooter: breaker,
        on_table: (1..=9).collect(),
        scores: SeatPair::new(0, 0),
        foul_streak: SeatPair::new(0, 0),
        pending: None, ball_in_hand: false, result: None,
    })
}

fn judge(state_json: &str, record_json: &str, call_json: &str)
    -> Result<String, RulesError> {
    let state = parse_state(state_json)?;
    // P17/P16 guards first, the liturgy order every shipped ruleset uses
    term::guard_not_over(state.result.is_some(),
        "moneyball-toy: judge called after the match ended")?;
    term::guard_no_pending(state.pending.is_some(),
        "moneyball-toy: a foul_response decision is pending".to_string())?;
    if call_json.trim() != "null" {
        // the toy has no call inputs; a real port parses the ShotCall wire
        return Err(RulesError::BadCall(
            "moneyball-toy: no call/safety inputs".to_string()));
    }
    let record = wire::parse_record(record_json)?;
    let Some(lowest) = contact::lowest(&state.on_table) else {
        return Err(RulesError::BadState(
            "moneyball-toy: onTable is empty".to_string()));
    };

    // P1: ONE forward pass (cue pinned at id 0, the pocket-game default)
    let facts = scan::scan(&record, &scan::ScanConfig::default());

    // P3 rotation legality + P4 rail-after-contact + P9 scratch + P8 jumps;
    // P11 accumulates, citation order = detection order
    let mut fouls = Fouls::new();
    for f in contact::check_first_contact(&facts, |ball| ball == lowest,
        || Some(CitedFoul::new("no-contact", "toy 1")),
        |_| Some(CitedFoul::new("wrong-first-ball", "toy 1"))) {
        fouls.push(&f.code, &f.cite);
    }
    if facts.first_contact.is_some() && !facts.driven_after_contact {
        fouls.push("no-rail-after-contact", "toy 2");
    }
    if facts.cue_scratch {
        fouls.push("scratch", "toy 3");
    }
    if !facts.off_table.is_empty() {
        fouls.push("ball-off-table", "toy 4");
    }
    let legal = fouls.legal(); // P11 invariant: legal == no fouls

    // P5 any-pocket classification; money pays only on a legal stroke
    let pocketed = facts.pocketed_ids();
    let mut scores = state.scores;
    if legal {
        *scores.get_mut(state.shooter) +=
            pocketed.iter().filter_map(|id| money_value(*id)).sum::<i64>();
    }

    // P15 consecutive fouls (reset-on-legal), then the P17 terminals
    let step = counters::step(
        counters::FoulCounterMode::Tracked { loss_threshold: THREE_FOULS },
        *state.foul_streak.get(state.shooter), !legal);
    let mut foul_streak = state.foul_streak;
    *foul_streak.get_mut(state.shooter) = step.count;
    let terminal = if *scores.get(state.shooter) >= TARGET {
        Some(term::terminal(i64::from(state.shooter), "money-target", "toy 5"))
    } else if step.lost {
        Some(term::terminal(i64::from(turn::other(state.shooter)),
            "three-fouls", "toy 6"))
    } else { None };

    // P13: money always returns (ids only, numeric order); moot once over
    let respot = if terminal.is_some() { Vec::new() } else {
        respot_chain::sort_numeric(pocketed.iter().chain(&facts.off_table)
            .copied().filter(|id| money_value(*id).is_some()).collect())
    };

    // P16: a surviving foul hands the incoming player the response choice
    let decision = (!legal && terminal.is_none()).then(|| DecisionRequired {
        kind: FOUL_RESPONSE_KIND.to_string(),
        chooser: Chooser::Seat(turn::other(state.shooter)),
    });

    // P18: a legal pot continues; terminal or pending holds the seat
    let turn_v = if legal && !pocketed.is_empty() { Turn::Continue }
        else { Turn::Pass };
    let next_shooter = turn::resolve_seat(
        state.shooter, terminal.is_some(), decision.is_some(), turn_v);

    let mut on_table: Vec<i64> = state.on_table.iter().copied()
        .filter(|id| !pocketed.contains(id) && !facts.off_table.contains(id))
        .collect();
    for id in &respot {
        if !on_table.contains(id) { on_table.push(*id); }
    }
    Judgment {
        legal,
        fouls: fouls.into_vec(),
        pocketed,
        ball_in_hand: PlacementRight::None, // granted via decision choice 2
        respot,
        turn: turn_v,
        decision_required: decision.clone(),
        terminal: terminal.clone(),
        next: MoneyBallState {
            shooter: next_shooter,
            on_table,
            scores,
            foul_streak,
            pending: decision.map(|d| d.kind),
            ball_in_hand: false,
            result: terminal,
        },
    }
    .to_json()
}

fn apply_decision(state_json: &str, decision_json: &str)
    -> Result<String, RulesError> {
    let mut state = parse_state(state_json)?;
    // P16 validation liturgy, in order: over → pending match → id → range
    term::guard_not_over(state.result.is_some(),
        "moneyball-toy: decision after the match ended")?;
    let d = decisions::parse_decision(decision_json)?;
    decisions::check_pending(
        state.pending.as_deref() == Some(FOUL_RESPONSE_KIND),
        "moneyball-toy: no decision is pending".to_string())?;
    if d.decision != FOUL_RESPONSE_ID {
        return Err(decisions::unknown_id(format!(
            "moneyball-toy: unknown decision id {}", d.decision)));
    }
    decisions::check_choice((1..=2).contains(&d.choice),
        format!("moneyball-toy: foul_response choice must be 1 or 2, got {}",
            d.choice))?;
    state.shooter = turn::other(state.shooter); // the chooser takes the table
    state.ball_in_hand = d.choice == 2;
    state.pending = None;
    state_bytes(&state)
}

/// P19 HUD projection — per-ruleset by design (a serializable snapshot).
fn hud_state(state_json: &str) -> Result<String, RulesError> {
    #[derive(Serialize)]
    struct Hud {
        shooter: u8,
        lowest: Option<i64>,
        scores: SeatPair<i64>,
        pending: Option<String>,
        result: Option<Terminal>,
    }
    let s = parse_state(state_json)?;
    let hud = Hud {
        shooter: s.shooter, lowest: contact::lowest(&s.on_table),
        scores: s.scores, pending: s.pending, result: s.result,
    };
    serde_json::to_string(&hud).map_err(|e| {
        RulesError::BadState(format!("moneyball-toy hud serialization: {e}"))
    })
}

/// Catalog row (what the TS pure-data drift gate would pin for a real
/// port).
fn catalog() -> CatalogEntry {
    CatalogEntry {
        id: "moneyball-toy",
        fouls: vec![
            CitedFoul::new("no-contact", "toy 1"),
            CitedFoul::new("wrong-first-ball", "toy 1"),
            CitedFoul::new("no-rail-after-contact", "toy 2"),
            CitedFoul::new("scratch", "toy 3"),
            CitedFoul::new("ball-off-table", "toy 4"),
        ],
        decisions: vec![DecisionRow {
            id: FOUL_RESPONSE_ID, kind: FOUL_RESPONSE_KIND, choice_max: 2,
        }],
        terminals: vec!["money-target", "three-fouls"],
        config: serde_json::json!(
            {"money": {"3": 1, "6": 1, "9": 2}, "target": TARGET}),
    }
}

/// What a real port would add to the `REGISTRY` slice in
/// `src/rulesets/registry.rs`. The toy stays OUT of the shipped registry:
/// the five ids are frozen, so this entry is dispatched locally only.
static ENTRY: RulesetEntry = RulesetEntry {
    id: "moneyball-toy",
    initial_state, judge, apply_decision, hud_state, catalog,
};
// bespoke:end

// ---- demo/scenario scaffolding (not part of the ruleset's SC-003 cost) -----

/// Minimal ShotRecord wire JSON: cue (id 0) + object balls 1–9 at rest,
/// then the scripted event stream. `pool_rules::wire` is lenient about
/// everything a judge never reads — no `table`, no velocities needed.
fn record(events: &[String]) -> String {
    let balls = (0..=9)
        .map(|id| format!(
            r#"{{"id":{id},"params":{{"r":0.028575}},"state":{{"pos":{{"x":{},"y":0.0}},"motion":"Stationary"}}}}"#,
            0.05 * id as f64,
        ))
        .collect::<Vec<_>>()
        .join(",");
    let evs = events.iter()
        .map(|kind| format!(r#"{{"kind":{kind}}}"#))
        .collect::<Vec<_>>()
        .join(",");
    format!(
        r#"{{"kernel_version":"example","initial":{{"balls":[{balls}]}},"events":[{evs}]}}"#
    )
}

fn strike() -> String {
    r#"{"Strike":{"ball":0}}"#.to_string()
}
fn hit(ball: i64) -> String {
    format!(r#"{{"BallBall":{{"b1":0,"b2":{ball}}}}}"#)
}
fn pot(ball: i64, pocket: i64) -> String {
    format!(r#"{{"BallPocket":{{"ball":{ball},"pocket":{pocket}}}}}"#)
}
fn rail(ball: i64) -> String {
    format!(r#"{{"BallLinearCushion":{{"ball":{ball}}}}}"#)
}
#[cfg(test)] // scenario-test-only event (main's script never jumps a ball)
fn off(ball: i64) -> String {
    format!(r#"{{"BallOffTable":{{"ball":{ball}}}}}"#)
}

/// Print a judgment's headline fields; return the `next` state bytes.
/// (Demo only: real surfaces keep the crate's `next` bytes VERBATIM —
/// a `serde_json::Value` round-trip reorders keys alphabetically.)
fn show(label: &str, judgment_json: &str) -> String {
    let v: serde_json::Value =
        serde_json::from_str(judgment_json).expect("judgment bytes parse");
    println!(
        "{label}: legal={} fouls={} pocketed={} respot={} turn={} \
         decision={} terminal={}",
        v["legal"], v["fouls"], v["pocketed"], v["respot"], v["turn"],
        v["decisionRequired"], v["terminal"],
    );
    v["next"].to_string()
}

fn main() {
    println!("moneyball-toy — a toy ruleset composed from pool_rules \
              primitives (SC-003)");
    println!("rules crate {}", pool_rules::RULES_VERSION);

    let mut state = (ENTRY.initial_state)(1).expect("initial state");
    println!("initial : {state}");

    // stroke 1, seat 1: legal — lowest (1) struck first, money 3 potted
    let j = (ENTRY.judge)(
        &state, &record(&[strike(), hit(1), rail(1), pot(3, 2)]), "null")
        .expect("judge stroke 1");
    state = show("stroke 1", &j);

    // stroke 2, seat 1 continues: foul — the 9 struck first (P3)
    let j = (ENTRY.judge)(&state, &record(&[strike(), hit(9), rail(9)]), "null")
        .expect("judge stroke 2");
    state = show("stroke 2", &j);

    // seat 2 resolves the pending foul_response: choice 2 = ball in hand
    state = (ENTRY.apply_decision)(&state, r#"{"decision":11,"choice":2}"#)
        .expect("apply decision");
    println!("decision: {state}");

    println!("hud     : {}", (ENTRY.hud_state)(&state).expect("hud"));
    println!(
        "catalog : {}",
        serde_json::to_string(&(ENTRY.catalog)()).expect("catalog"),
    );
}

// ---- scenario tests (T042: run under `cargo test -p pool-rules`) -----------

#[cfg(test)]
mod tests {
    use super::*;

    fn initial() -> String {
        (ENTRY.initial_state)(1).expect("initial state")
    }

    fn judge_v(state: &str, events: &[String]) -> serde_json::Value {
        let bytes = (ENTRY.judge)(state, &record(events), "null")
            .expect("judge");
        serde_json::from_str(&bytes).expect("judgment parses")
    }

    #[test]
    fn legal_money_pot_scores_respots_and_continues() {
        let j = judge_v(&initial(), &[strike(), hit(1), rail(1), pot(3, 2)]);
        assert_eq!(j["legal"], true);
        assert_eq!(j["fouls"], serde_json::json!([]));
        assert_eq!(j["pocketed"], serde_json::json!([3]));
        assert_eq!(j["respot"], serde_json::json!([3])); // money returns
        assert_eq!(j["turn"], "continue");
        assert_eq!(j["next"]["shooter"], 1);
        assert_eq!(j["next"]["scores"]["1"], 1);
        assert_eq!(j["next"]["foulStreak"]["1"], 0);
        // the 3 left the table and came back via the respot chain
        assert!(j["next"]["onTable"].as_array().expect("onTable")
            .contains(&serde_json::json!(3)));
    }

    #[test]
    fn non_money_pot_continues_without_scoring_or_respot() {
        let j = judge_v(&initial(), &[strike(), hit(1), pot(1, 0)]);
        assert_eq!(j["legal"], true);
        assert_eq!(j["respot"], serde_json::json!([]));
        assert_eq!(j["next"]["scores"]["1"], 0);
        assert!(!j["next"]["onTable"].as_array().expect("onTable")
            .contains(&serde_json::json!(1)));
    }

    #[test]
    fn fouls_stack_in_detection_order_and_pay_nothing() {
        // wrong first ball + no rail afterwards + scratch, one stroke
        let j = judge_v(&initial(), &[strike(), hit(5), pot(0, 3), pot(6, 3)]);
        assert_eq!(j["legal"], false);
        let codes: Vec<&str> = j["fouls"].as_array().expect("fouls").iter()
            .map(|f| f["code"].as_str().expect("code")).collect();
        assert_eq!(codes, ["wrong-first-ball", "scratch"]);
        assert_eq!(j["next"]["scores"]["1"], 0); // foul: the 6 pays nothing
        assert_eq!(j["respot"], serde_json::json!([6])); // but still respots
        assert_eq!(j["decisionRequired"]["kind"], "foul_response");
    }

    #[test]
    fn off_table_money_is_a_foul_and_respots() {
        let j = judge_v(&initial(), &[strike(), hit(1), rail(1), off(6)]);
        assert_eq!(j["legal"], false);
        assert_eq!(j["fouls"][0]["code"], "ball-off-table");
        assert_eq!(j["respot"], serde_json::json!([6]));
        assert!(j["next"]["onTable"].as_array().expect("onTable")
            .contains(&serde_json::json!(6)));
    }

    #[test]
    fn foul_response_round_trip() {
        let j = judge_v(&initial(), &[strike(), hit(9), rail(9)]);
        assert_eq!(j["fouls"][0]["code"], "wrong-first-ball");
        assert_eq!(j["decisionRequired"],
            serde_json::json!({"kind": "foul_response", "chooser": 2}));
        assert_eq!(j["next"]["shooter"], 1); // P18: pending holds the seat
        // judging while pending is the frozen decision-pending error
        let err = (ENTRY.judge)(
            &j["next"].to_string(), &record(&[strike()]), "null")
            .expect_err("pending gate");
        assert_eq!(err.code(), "decision-pending");
        // seat 2 takes ball in hand (choice 2)
        let next = (ENTRY.apply_decision)(
            &j["next"].to_string(), r#"{"decision":11,"choice":2}"#)
            .expect("decision resolves");
        let s: serde_json::Value = serde_json::from_str(&next).expect("state");
        assert_eq!(s["shooter"], 2);
        assert_eq!(s["ballInHand"], true);
        assert_eq!(s["pending"], serde_json::Value::Null);
    }

    #[test]
    fn decision_liturgy_rejects_in_order() {
        // nothing pending
        let err = (ENTRY.apply_decision)(
            &initial(), r#"{"decision":11,"choice":1}"#)
            .expect_err("no pending");
        assert_eq!(err.code(), "bad-decision");
        // pending, but wrong id / out-of-range choice
        let j = judge_v(&initial(), &[strike()]);
        let pending_state = j["next"].to_string();
        let err = (ENTRY.apply_decision)(
            &pending_state, r#"{"decision":7,"choice":1}"#)
            .expect_err("wrong id");
        assert!(err.message().contains("unknown decision id 7"));
        let err = (ENTRY.apply_decision)(
            &pending_state, r#"{"decision":11,"choice":3}"#)
            .expect_err("choice range");
        assert!(err.message().contains("choice must be 1 or 2"));
    }

    #[test]
    fn three_consecutive_fouls_lose_the_rack() {
        let mut state = initial();
        for round in 1..=3_i64 {
            let j = judge_v(&state, &[strike()]); // seat 1: no contact
            assert_eq!(j["fouls"][0]["code"], "no-contact");
            assert_eq!(j["next"]["foulStreak"]["1"],
                serde_json::json!(round));
            if round == 3 {
                assert_eq!(j["terminal"],
                    serde_json::json!({"winner": 2, "reason": "three-fouls",
                        "cite": "toy 6"}));
                // terminal pre-empts the decision and holds the seat
                assert_eq!(j["decisionRequired"], serde_json::Value::Null);
                assert_eq!(j["next"]["shooter"], 1);
                return;
            }
            // seat 2 plays on from where the balls lie, legally and dry
            state = (ENTRY.apply_decision)(
                &j["next"].to_string(), r#"{"decision":11,"choice":1}"#)
                .expect("decision resolves");
            let j2 = judge_v(&state, &[strike(), hit(1), rail(1)]);
            assert_eq!(j2["legal"], true);
            assert_eq!(j2["turn"], "pass"); // dry: back to seat 1
            state = j2["next"].to_string();
        }
    }

    #[test]
    fn money_target_ends_the_rack() {
        // one stroke shy of the target, only the 8 and the 9 left
        let state = r#"{"shooter":1,"onTable":[8,9],
            "scores":{"1":3,"2":0},"foulStreak":{"1":0,"2":0},
            "pending":null,"ballInHand":false,"result":null}"#;
        let j = judge_v(state, &[strike(), hit(8), pot(9, 3)]);
        assert_eq!(j["legal"], true);
        assert_eq!(j["next"]["scores"]["1"], 5); // 3 + the 9's 2 points
        assert_eq!(j["terminal"]["reason"], "money-target");
        assert_eq!(j["terminal"]["winner"], 1);
        assert_eq!(j["respot"], serde_json::json!([])); // moot once over
        // judging the finished rack is the frozen match-over error
        let err = (ENTRY.judge)(
            &j["next"].to_string(), &record(&[strike()]), "null")
            .expect_err("match-over gate");
        assert_eq!(err.code(), "match-over");
    }

    #[test]
    fn catalog_row_is_serializable_and_off_registry() {
        let c = serde_json::to_value((ENTRY.catalog)()).expect("catalog");
        assert_eq!(c["id"], "moneyball-toy");
        assert_eq!(c["decisions"][0],
            serde_json::json!({"id": 11, "kind": "foul_response",
                "choiceMax": 2}));
        // the toy never enters the shipped five-id registry
        let err = pool_rules::judge_json("moneyball-toy", "{}", "{}", "null")
            .expect_err("not registered");
        assert_eq!(err.code(), "unknown-ruleset");
        assert!(!pool_rules::catalog_json().contains("moneyball-toy"));
    }

    #[test]
    fn sc003_bespoke_budget() {
        // count the non-blank, non-comment lines between the markers
        let src = include_str!("moneyball.rs");
        let body = src.split("bespoke:begin").nth(1)
            .expect("begin marker")
            .split("bespoke:end").next()
            .expect("end marker");
        let count = body.lines()
            .map(str::trim)
            .filter(|l| !l.is_empty() && !l.starts_with("//"))
            .count();
        assert!(count <= 200,
            "bespoke ruleset lines: {count} > 200 (SC-003)");
    }
}
