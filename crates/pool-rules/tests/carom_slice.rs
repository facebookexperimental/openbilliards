// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! GH-383: the carom3c conformance-slice harness — the corpus.rs
//! discipline applied to the two frozen per-preset slices
//! `scripts/fixtures/rules-corpus-variants/umb-carom-2cue.json` and
//! `umb-carom-2cue-ei.json` (the fourteenone/tenball additive-slice
//! precedent: the 442-case legacy corpus — carom3c-v1's 71 cases
//! included — is byte-untouched; the new ruleset ships its OWN
//! once-harvested-then-frozen oracle). Every case replays through the
//! public `_json` boundary and byte-compares against the harvested
//! `expect` (+ the sha256 tamper pin). A byte diff here is ALWAYS
//! resolved by fixing the crate. The semantic source is
//! `tests/carom_v2_scenarios.rs` (reviewed clause-by-clause against the
//! pinned 1 Jan 1989 UMB PDF).
//!
//! The `harvest_write_carom_slices` writer (#[ignore]) regenerated the
//! files exactly ONCE at the GH-383 freeze; post-freeze changes ONLY via
//! the erratum protocol (the rules-variants doc §4).

use serde_json::{json, Value};

use pool_rules::task_config::sha256_hex;
use pool_rules::{
    apply_decision_json, hud_state_json, judge_json,
    preset_initial_state_json, task_initial_state_json,
};

fn slice_path(name: &str) -> String {
    format!(
        "{}/../../scripts/fixtures/rules-corpus-variants/{name}.json",
        env!("CARGO_MANIFEST_DIR")
    )
}

fn load_slice(name: &str) -> Value {
    serde_json::from_str(&std::fs::read_to_string(slice_path(name)).unwrap())
        .unwrap()
}

fn run_case(case: &Value) -> String {
    let field = |k: &str| case.get(k).unwrap_or(&Value::Null).to_string();
    let kind = case["kind"].as_str().unwrap();
    let ruleset = case["ruleset"].as_str().unwrap();
    let breaker = case.get("breaker").and_then(Value::as_u64)
        .unwrap_or(1) as u8;
    let out = match kind {
        "initialState" | "initialState-error" => {
            if let Some(preset) = case.get("preset").and_then(Value::as_str) {
                preset_initial_state_json(preset, breaker)
            } else if case.get("task_config").is_some() {
                task_initial_state_json(&field("task_config"), breaker)
            } else {
                pool_rules::initial_state_json(ruleset, breaker)
            }
        }
        "judge" | "judge-error" => judge_json(
            ruleset, &field("state"), &field("record"), &field("call")),
        "applyDecision" | "applyDecision-error" => apply_decision_json(
            ruleset, &field("state"), &field("decision")),
        "hudState" | "hudState-error" => hud_state_json(
            ruleset, &field("state")),
        other => panic!("unknown slice case kind {other:?}"),
    };
    let is_error_kind = kind.ends_with("-error");
    match out {
        Ok(bytes) => {
            assert!(!is_error_kind, "expected an error, judged fine: {bytes}");
            bytes
        }
        Err(e) => {
            assert!(is_error_kind, "unexpected RulesError: {e}");
            e.to_json()
        }
    }
}

fn assert_slice(name: &str, preset: &str, census: usize) {
    let slice = load_slice(name);
    assert_eq!(slice["preset"], preset);
    assert_eq!(slice["ruleset"], "carom3c-v2");
    let cases = slice["cases"].as_array().unwrap();
    assert_eq!(cases.len(), census, "the frozen slice census");
    for case in cases {
        let id = case["id"].as_str().unwrap();
        let expect = case["expect"].as_str().unwrap();
        assert_eq!(
            sha256_hex(expect.as_bytes()),
            case["expectSha256"].as_str().unwrap(),
            "{id}: slice expect/sha mismatch — oracle tampered?"
        );
        let got = run_case(case);
        assert_eq!(got, expect, "{id}: crate bytes diverge");
    }
}

#[test]
fn carom_2cue_slice_byte_matches_the_frozen_oracle() {
    assert_slice("umb-carom-2cue", "umb-carom-2cue", 21);
}

#[test]
fn carom_2cue_ei_slice_byte_matches_the_frozen_oracle() {
    assert_slice("umb-carom-2cue-ei", "umb-carom-2cue-ei", 12);
}

// ---- case builders (shared with the harvest writer) ---------------------------

const L: f64 = 2.84;
const W: f64 = 1.42;
const R: f64 = 0.03075;

fn ball(id: i64, x: f64, y: f64) -> Value {
    json!({
        "id": id,
        "params": { "r": R },
        "state": { "pos": { "x": x, "y": y, "z": R },
                   "motion": "Stationary" }
    })
}

fn balls() -> Vec<Value> {
    vec![ball(0, 0.2, -0.9), ball(1, 0.0, -0.71), ball(2, 0.0, 0.71)]
}

fn record(events: Vec<Value>) -> Value {
    json!({
        "initial": {
            "balls": balls(),
            "table": { "width": W, "length": L, "pockets": [] }
        },
        "events": events
    })
}

fn strike(ball: i64) -> Value {
    json!({ "t": 0.0, "kind": { "Strike": { "ball": ball } }, "post": [] })
}
fn bb(t: f64, b1: i64, b2: i64) -> Value {
    json!({ "t": t, "kind": { "BallBall": { "b1": b1, "b2": b2 } },
            "post": [] })
}
fn rail(t: f64, ball: i64) -> Value {
    json!({ "t": t, "kind": { "BallLinearCushion": { "ball": ball } },
            "post": [] })
}
fn off_table(t: f64, ball: i64) -> Value {
    json!({ "t": t, "kind": { "BallOffTable": { "ball": ball } },
            "post": [] })
}
fn rest() -> Value {
    json!({ "t": 9.0, "kind": "Rest", "post": [] })
}

fn point_events(cue: i64, first: i64, second: i64) -> Value {
    json!([
        strike(cue),
        bb(0.1, cue, first),
        rail(0.2, cue), rail(0.3, cue), rail(0.4, cue),
        bb(0.5, cue, second),
        rest(),
    ])
}

fn short_cannon_events(cue: i64, first: i64, second: i64, n: usize)
    -> Value {
    let mut ev = vec![strike(cue), bb(0.1, cue, first)];
    for k in 0..n {
        ev.push(rail(0.2 + 0.1 * k as f64, cue));
    }
    ev.push(bb(0.8, cue, second));
    ev.push(rest());
    Value::Array(ev)
}

fn miss_events(cue: i64, first: i64) -> Value {
    json!([strike(cue), bb(0.1, cue, first), rail(0.2, cue), rest()])
}

/// Fresh preset state with the break-spot option resolved (right) and
/// patches applied.
fn state(preset: &str, breaker: u8, patch: Value) -> Value {
    let fresh = preset_initial_state_json(preset, breaker).unwrap();
    let resolved = apply_decision_json(
        "carom3c-v2", &fresh, "{\"decision\":10,\"choice\":2}").unwrap();
    let mut v: Value = serde_json::from_str(&resolved).unwrap();
    for (k, val) in patch.as_object().unwrap() {
        v[k] = val.clone();
    }
    v
}

/// One slice-case input (the expect/sha fields are computed at harvest).
struct CaseSpec {
    id: &'static str,
    kind: &'static str,
    payload: Value,
    comment: &'static str,
}

fn judge_case(id: &'static str, st: Value, rec: Value,
    comment: &'static str) -> CaseSpec {
    CaseSpec {
        id,
        kind: if id.contains("-error") { "judge-error" } else { "judge" },
        payload: json!({ "state": st, "record": rec, "call": null }),
        comment,
    }
}

fn cases_2cue() -> Vec<CaseSpec> {
    let p = "umb-carom-2cue";
    vec![
        CaseSpec { id: "initialState-001", kind: "initialState",
            payload: json!({ "preset": p, "breaker": 1 }),
            comment: "Fresh break address, breaker 1 (Art 23.1; the \
                      break_spot option pends, Art 23.1(c))." },
        CaseSpec { id: "initialState-002", kind: "initialState",
            payload: json!({ "preset": p, "breaker": 2 }),
            comment: "Fresh break address, breaker 2 (the seat-ball law \
                      keys off the breaker, Art 23.2/23.4)." },
        judge_case("judge-001-own-ball-point-seat1",
            state(p, 1, json!({ "phase": "play" })),
            record(serde_json::from_value(point_events(0, 1, 2)).unwrap()),
            "Seat 1 (starter) scores with the plain white (Art 23.2; \
             Art 83 three cushions; Art 24.4 continue)."),
        judge_case("judge-002-own-ball-point-seat2",
            state(p, 1, json!({ "phase": "play", "shooter": 2 })),
            record(serde_json::from_value(point_events(1, 2, 0)).unwrap()),
            "Seat 2 scores with ITS ball (ball 1) — per-seat cue \
             assignment (Art 22.1/23.4)."),
        judge_case("judge-003-wrong-ball-seat2",
            state(p, 1, json!({ "phase": "play", "shooter": 2 })),
            record(serde_json::from_value(point_events(0, 1, 2)).unwrap()),
            "Seat 2 strikes the starter's white: 'wrong ball' foul \
             (Art 41.11); the cannon is void, turn passes."),
        judge_case("judge-004-wrong-ball-seat1",
            state(p, 1, json!({ "phase": "play" })),
            record(serde_json::from_value(point_events(1, 2, 0)).unwrap()),
            "Seat 1 strikes the opponent's ball: 'wrong ball' (Art 41.11)."),
        judge_case("judge-005-breaker2-own-ball",
            state(p, 2, json!({ "phase": "play", "shooter": 2 })),
            record(serde_json::from_value(point_events(0, 1, 2)).unwrap()),
            "Breaker 2 owns the plain white (Art 23.2): seat 2 striking \
             ball 0 is legal under the swapped assignment."),
        judge_case("judge-006-breaker2-wrong-ball-seat1",
            state(p, 2, json!({ "phase": "play", "shooter": 1 })),
            record(serde_json::from_value(point_events(0, 1, 2)).unwrap()),
            "Breaker 2: seat 1 owns ball 1, striking ball 0 is the \
             Art 41.11 foul."),
        judge_case("judge-007-art83-no-cushion",
            state(p, 1, json!({ "phase": "play" })),
            record(serde_json::from_value(
                short_cannon_events(0, 1, 2, 0)).unwrap()),
            "Cannon with zero prior cushions: FOUL announced 'no \
             cushion' (Art 83 letter)."),
        judge_case("judge-008-art83-one-cushion",
            state(p, 1, json!({ "phase": "play" })),
            record(serde_json::from_value(
                short_cannon_events(0, 1, 2, 1)).unwrap()),
            "Cannon with one prior cushion: FOUL announced 'one cushion' \
             (Art 83)."),
        judge_case("judge-009-art83-two-cushions",
            state(p, 1, json!({ "phase": "play" })),
            record(serde_json::from_value(
                short_cannon_events(0, 1, 2, 2)).unwrap()),
            "Cannon with two prior cushions: FOUL announced 'two \
             cushions' (Art 83)."),
        judge_case("judge-010-clean-miss-stays-legal",
            state(p, 1, json!({ "phase": "play" })),
            record(serde_json::from_value(miss_events(0, 1)).unwrap()),
            "Second ball never contacted: the legal Art 24.5 miss — the \
             Art 83 foul binds 'before touching the second object-ball', \
             not the failure to reach it."),
        judge_case("judge-011-off-table-dominates",
            state(p, 1, json!({ "phase": "play" })),
            {
                let mut ev: Vec<Value> = serde_json::from_value(
                    short_cannon_events(0, 1, 2, 2)).unwrap();
                ev.insert(ev.len() - 1, off_table(0.9, 2));
                record(ev)
            },
            "A jumped ball (Art 41.1) precedes the Art 83 announce; only \
             the ball concerned respots (Art 28.1(b) -> 27.3(b))."),
        judge_case("judge-012-break-red-first",
            state(p, 1, json!({})),
            record(serde_json::from_value(point_events(0, 1, 2)).unwrap()),
            "Break phase, first contact on the white: \
             wrong-first-ball-break (Art 23.3/41.12) — v1 law carried."),
        judge_case("judge-013-breaker-finish-terminates",
            state(p, 1, json!({ "phase": "play",
                "points": { "1": 14, "2": 3 } })),
            record(serde_json::from_value(point_events(0, 1, 2)).unwrap()),
            "equal_innings OFF: the breaker's target point ends the \
             match at once (Art 29.1/29.2)."),
        judge_case("judge-014-error-pending-gate",
            {
                let fresh = preset_initial_state_json(p, 1).unwrap();
                serde_json::from_str(&fresh).unwrap()
            },
            record(serde_json::from_value(point_events(0, 1, 2)).unwrap()),
            "Judge with the break-spot option pending refuses (adapter \
             contract, Art 23.1(c))."),
        CaseSpec { id: "applyDecision-001-left", kind: "applyDecision",
            payload: json!({
                "state": serde_json::from_str::<Value>(
                    &preset_initial_state_json(p, 1).unwrap()).unwrap(),
                "decision": { "decision": 10, "choice": 1 } }),
            comment: "break_spot choice 1 = LEFT start spot \
                      (Art 23.1(c))." },
        CaseSpec { id: "applyDecision-002-error-unknown-id",
            kind: "applyDecision-error",
            payload: json!({
                "state": serde_json::from_str::<Value>(
                    &preset_initial_state_json(p, 1).unwrap()).unwrap(),
                "decision": { "decision": 9, "choice": 1 } }),
            comment: "Only decision 10 exists in carom." },
        CaseSpec { id: "applyDecision-003-error-no-pending",
            kind: "applyDecision-error",
            payload: json!({
                "state": state(p, 1, json!({ "phase": "play" })),
                "decision": { "decision": 10, "choice": 1 } }),
            comment: "break_spot with no pending option refuses." },
        CaseSpec { id: "hudState-001", kind: "hudState",
            payload: json!({ "state": state(p, 1, json!({
                "phase": "play", "points": { "1": 2, "2": 5 } })) }),
            comment: "The v1 hud projection (stage rename, no variant \
                      block) holds for v2." },
        judge_case("judge-015-error-missing-variant",
            {
                let mut s = state(p, 1, json!({ "phase": "play" }));
                s.as_object_mut().unwrap().remove("variant");
                s
            },
            record(serde_json::from_value(point_events(0, 1, 2)).unwrap()),
            "Config-in-state is mandatory: a v2 state without the \
             variant block is invalid-task-config, never a default \
             fallback (the registry API contract §3)."),
    ]
}

fn cases_2cue_ei() -> Vec<CaseSpec> {
    let p = "umb-carom-2cue-ei";
    vec![
        CaseSpec { id: "initialState-001", kind: "initialState",
            payload: json!({ "preset": p, "breaker": 1 }),
            comment: "Fresh break address under the equal-innings \
                      regime (Art 29.3)." },
        judge_case("judge-001-leveling-transition",
            state(p, 1, json!({ "phase": "play",
                "points": { "1": 14, "2": 3 }, "innings": 9 })),
            record(serde_json::from_value(point_events(0, 1, 2)).unwrap()),
            "The BREAKER's target point does not end the match: the \
             opponent levels from the respotted initial starting \
             position (Art 29.4) — phase leveling_break, break_spot \
             option for the leveling seat (Art 23.1(c))."),
        judge_case("judge-002-nonbreaker-finish-terminates",
            state(p, 1, json!({ "phase": "play", "shooter": 2,
                "points": { "1": 3, "2": 14 } })),
            record(serde_json::from_value(point_events(1, 2, 0)).unwrap()),
            "The NON-breaker's target point already levels the innings: \
             the v1 terminal applies (Art 29.1/29.2)."),
        judge_case("judge-003-error-leveling-pending-gate",
            state(p, 1, json!({ "phase": "leveling_break", "shooter": 2,
                "points": { "1": 15, "2": 14 },
                "pendingDecision": { "kind": "break_spot", "chooser": 2 } })),
            record(serde_json::from_value(point_events(1, 2, 0)).unwrap()),
            "The leveling break_spot option gates the judge exactly like \
             the opening one."),
        CaseSpec { id: "applyDecision-001-leveling-left",
            kind: "applyDecision",
            payload: json!({
                "state": state(p, 1, json!({ "phase": "leveling_break",
                    "shooter": 2, "points": { "1": 15, "2": 14 },
                    "pendingDecision": {
                        "kind": "break_spot", "chooser": 2 } })),
                "decision": { "decision": 10, "choice": 1 } }),
            comment: "The leveling seat resolves its start spot \
                      (Art 29.4 via 23.1(c))." },
        judge_case("judge-004-leveling-red-first-foul",
            state(p, 1, json!({ "phase": "leveling_break", "shooter": 2,
                "points": { "1": 15, "2": 14 } })),
            record(serde_json::from_value(point_events(1, 0, 2)).unwrap()),
            "The leveling stroke replays the starting-cannon conditions \
             (Art 29.4 via 23.3): first contact on the white is the \
             break foul, and the failed leveling hands the match to the \
             first finisher."),
        judge_case("judge-005-leveling-point-continues",
            state(p, 1, json!({ "phase": "leveling_break", "shooter": 2,
                "points": { "1": 15, "2": 12 } })),
            record(serde_json::from_value(point_events(1, 2, 0)).unwrap()),
            "A red-first leveling point short of the target continues \
             the serie (phase leveling, Art 24.4)."),
        judge_case("judge-006-leveling-miss-ends",
            state(p, 1, json!({ "phase": "leveling", "shooter": 2,
                "points": { "1": 15, "2": 13 }, "innings": 9 })),
            record(serde_json::from_value(miss_events(1, 2)).unwrap()),
            "A non-scoring leveling stroke ends the match for the first \
             finisher; the leveling seat closes the inning pair."),
        judge_case("judge-007-draw",
            state(p, 1, json!({ "phase": "leveling", "shooter": 2,
                "points": { "1": 15, "2": 14 } })),
            record(serde_json::from_value(point_events(1, 2, 0)).unwrap()),
            "The leveling seat reaches the target: a DRAW (Art 29.4) — \
             winner 0 is the draw sentinel."),
        judge_case("judge-008-leveling-art83-foul-ends",
            state(p, 1, json!({ "phase": "leveling", "shooter": 2,
                "points": { "1": 15, "2": 14 } })),
            record(serde_json::from_value(
                short_cannon_events(1, 2, 0, 2)).unwrap()),
            "An Art 83 announce foul during leveling is non-scoring: the \
             first finisher wins."),
        judge_case("judge-009-leveling-wrong-ball-ends",
            state(p, 1, json!({ "phase": "leveling", "shooter": 2,
                "points": { "1": 15, "2": 14 } })),
            record(serde_json::from_value(point_events(0, 1, 2)).unwrap()),
            "Playing the finisher's ball during leveling: Art 41.11 \
             voids the point; the first finisher wins."),
        CaseSpec { id: "hudState-001-leveling", kind: "hudState",
            payload: json!({ "state": state(p, 1, json!({
                "phase": "leveling_break", "shooter": 2,
                "points": { "1": 15, "2": 12 },
                "pendingDecision": {
                    "kind": "break_spot", "chooser": 2 } })) }),
            comment: "The leveling stage rides the v1 hud projection \
                      (stage passthrough)." },
    ]
}

/// ONE-TIME harvest writer (the tenball harvest law: run once at the
/// GH-383 freeze, reviewed case-by-case, then never again — post-freeze
/// changes only via the erratum protocol):
/// `cargo test -p pool-rules --test carom_slice -- --ignored harvest`
#[test]
#[ignore = "one-time slice harvest (GH-383 freeze); the frozen files are committed"]
fn harvest_write_carom_slices() {
    let head = std::process::Command::new("git")
        .args(["rev-parse", "HEAD"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    for (name, cases) in [
        ("umb-carom-2cue", cases_2cue()),
        ("umb-carom-2cue-ei", cases_2cue_ei()),
    ] {
        let mut out_cases = Vec::new();
        for spec in &cases {
            let mut case = json!({
                "id": format!("{name}/{}", spec.id),
                "ruleset": "carom3c-v2",
                "kind": spec.kind,
            });
            for (k, v) in spec.payload.as_object().unwrap() {
                case[k] = v.clone();
            }
            case["comment"] = json!(spec.comment);
            let expect = run_case(&case);
            case["expect"] = json!(expect);
            case["expectSha256"] = json!(sha256_hex(expect.as_bytes()));
            out_cases.push(case);
        }
        let slice = json!({
            "comment": [
                "DO NOT REGENERATE (rules-corpus.json discipline; frozen at",
                "the GH-383 review). Per-preset byte oracle for the",
                "carom3c-v2 conformance gate: every expect line harvested",
                "ONCE from the pool-rules crate through the public _json",
                "boundary at the harvestedAt commit and reviewed",
                "case-by-case against its cited clause (UMB World Rules of",
                "Carom Billiard, 1 Jan 1989; the semantic source is",
                "crates/pool-rules/tests/carom_v2_scenarios.rs).",
                "Post-freeze changes ONLY via the erratum protocol",
                "(the rules-variants doc §4): a pinned-clause proof against",
                "the cited text — NEVER a re-run to fix a red gate; a byte",
                "diff at any conformance leg is resolved by fixing the code",
                "to reproduce THESE bytes.",
            ],
            "harvestedAt": head,
            "slice": name,
            "preset": name,
            "ruleset": "carom3c-v2",
            "cases": out_cases,
        });
        std::fs::write(slice_path(name),
            serde_json::to_string_pretty(&slice).unwrap() + "\n").unwrap();
        println!("wrote {} ({} cases)", slice_path(name), cases.len());
    }
}
