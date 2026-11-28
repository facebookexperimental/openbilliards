// Copyright (c) Meta Platforms, Inc. and affiliates.

//! `pool-cli judge` — the native rules-adjudication surface (feature 013,
//! the rules-crate API contract §4d, research R5): the CLI transport of the
//! "one serializer, three transports" doctrine. Every output byte comes from
//! the pool-rules crate's canonical `_json` boundary VERBATIM — this module
//! never re-serializes a judgment, and error cases ship the crate's
//! structured `{"error":{"code","message"}}` payload bytes (the exact lines
//! the cross-surface gate `cmp`s against the Python and wasm legs and the
//! frozen corpus `expect`, the conformance-gate contract §3).
//!
//! `--bench` is the native half of the FR-008/SC-006 perf gate
//! (the conformance-gate contract §4): per-case latency (min over repetitions —
//! ambient load only ever inflates a sample), worst case gated against the
//! < 1 ms/judgment budget widened by `OB_PERF_BUDGET_SCALE` (the bench-wasm
//! convention).

use std::process::ExitCode;
use std::time::Instant;

use serde_json::Value;

use crate::cliargs;

const USAGE: &str = "\
pool-cli judge — adjudicate shots natively via the pool-rules crate

usage (batch, the conformance leg):
  pool-cli judge --cases <corpus.json> --out <judgments.jsonl>
                 [--ruleset <id>] [--bench]

usage (single case):
  pool-cli judge --ruleset <id> --state <file> --record <file>
                 [--call <file>] --out <file>

  pool-cli judge --version           print RULES_VERSION

Batch mode replays every corpus case (kinds: initialState,
initialState-error, judge, judge-error, applyDecision,
applyDecision-error, hudState) through the crate boundary and writes ONE
crate-byte line per case in case order; error cases write the canonical
{\"error\":{\"code\",\"message\"}} payload. A case carrying a 022
task_config envelope routes initialState through
task_initial_state_json; a case carrying a preset id routes it through
preset_initial_state_json (the variant conformance slices).
--ruleset filters to one ruleset's subset (migration-gate check M4).
--bench times every case (min over 5 repetitions after warmup) and gates
the worst case against the < 1 ms/judgment budget, widened by
OB_PERF_BUDGET_SCALE (the conformance-gate contract §4).

Single-case mode judges one shot (files hold the state/record/call JSON;
--call defaults to null) and writes the crate bytes verbatim — a
judgment, or the canonical error payload.";

/// One corpus case with its `_json`-boundary inputs pre-serialized, so the
/// bench loop times ONLY the crate call (`Value::to_string` roundtrips are
/// prepared once; input key order is irrelevant — the crate parses into
/// typed structs and re-serializes canonically, proven byte-identical by
/// crates/pool-rules/tests/corpus.rs over the full corpus).
struct Prepared {
    id: String,
    ruleset: String,
    kind: String,
    breaker: u8,
    state: String,
    record: String,
    call: String,
    decision: String,
    /// Feature 022 variant-slice cases (data-model §6): a
    /// `task-config-v1` envelope routing `initialState` through
    /// `task_initial_state_json` (`"null"` on 013 corpus cases).
    task_config: String,
    /// Feature 022 preset-routed slice cases: a preset id routing
    /// `initialState` through `preset_initial_state_json` (empty when
    /// absent) — the leg that pins the `unknown-preset` payload bytes.
    preset: String,
}

fn prepare(case: &Value) -> Result<Prepared, String> {
    let field = |k: &str| case.get(k).unwrap_or(&Value::Null).to_string();
    let id = case
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("<no id>")
        .to_string();
    let kind = case
        .get("kind")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{id}: case has no kind"))?
        .to_string();
    match kind.as_str() {
        "initialState" | "initialState-error" | "judge" | "judge-error"
        | "applyDecision" | "applyDecision-error" | "hudState" => {}
        other => return Err(format!("{id}: unknown corpus case kind {other:?}")),
    }
    Ok(Prepared {
        ruleset: case
            .get("ruleset")
            .and_then(Value::as_str)
            .ok_or_else(|| format!("{id}: case has no ruleset"))?
            .to_string(),
        breaker: case.get("breaker").and_then(Value::as_u64).unwrap_or(1) as u8,
        state: field("state"),
        record: field("record"),
        call: field("call"),
        decision: field("decision"),
        task_config: field("task_config"),
        preset: case
            .get("preset")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        id,
        kind,
    })
}

/// Dispatch one prepared case: the bytes a surface ships (error cases ship
/// the canonical error payload — never a process failure).
fn run(p: &Prepared) -> String {
    let out = match p.kind.as_str() {
        // Feature 022 variant-slice cases carry a task-config envelope
        // or a preset id: route through THE one entry mechanism
        // (the registry API contract §2); 013 corpus cases (both fields absent)
        // keep the frozen per-ruleset path. `initialState-error` pins
        // the structured invalid-task-config / unknown-preset payload
        // bytes (SC-006).
        "initialState" | "initialState-error" if !p.preset.is_empty() => {
            pool_rules::preset_initial_state_json(&p.preset, p.breaker)
        }
        "initialState" | "initialState-error" if p.task_config != "null" => {
            pool_rules::task_initial_state_json(&p.task_config, p.breaker)
        }
        "initialState" => pool_rules::initial_state_json(&p.ruleset, p.breaker),
        "initialState-error" => {
            pool_rules::initial_state_json(&p.ruleset, p.breaker)
        }
        "judge" | "judge-error" => {
            pool_rules::judge_json(&p.ruleset, &p.state, &p.record, &p.call)
        }
        "applyDecision" | "applyDecision-error" => {
            pool_rules::apply_decision_json(&p.ruleset, &p.state, &p.decision)
        }
        "hudState" => pool_rules::hud_state_json(&p.ruleset, &p.state),
        other => unreachable!("prepare() rejects kind {other:?}"),
    };
    out.unwrap_or_else(|e| e.to_json())
}

pub fn cmd_judge(args: &[String]) -> ExitCode {
    if cliargs::wants_help(args) {
        println!("{USAGE}");
        return ExitCode::SUCCESS;
    }
    // `--version` prints RULES_VERSION (the rules stamp, independent of the
    // physics KERNEL_VERSION — FR-006) before any parsing.
    if args.iter().any(|a| a == "--version") {
        println!("{}", pool_rules::RULES_VERSION);
        return ExitCode::SUCCESS;
    }
    match judge_inner(args) {
        Ok(code) => code,
        Err(msg) => {
            eprintln!("error: {msg}");
            eprintln!("{USAGE}");
            ExitCode::from(2)
        }
    }
}

fn judge_inner(args: &[String]) -> Result<ExitCode, String> {
    let kv = cliargs::parse_kv_flags(args, &["bench"])?;
    let out_path = cliargs::get(&kv, "out").ok_or("--out is required")?;

    if let Some(cases_path) = cliargs::get(&kv, "cases") {
        return judge_batch(&kv, cases_path, out_path);
    }

    // Single-case form: --ruleset --state --record [--call] --out.
    let ruleset = cliargs::get(&kv, "ruleset")
        .ok_or("--cases or --ruleset is required")?;
    let read = |key: &str| -> Result<String, String> {
        let path = cliargs::get(&kv, key)
            .ok_or_else(|| format!("--{key} is required"))?;
        std::fs::read_to_string(path).map_err(|e| format!("--{key} {path}: {e}"))
    };
    let state = read("state")?;
    let record = read("record")?;
    let call = match cliargs::get(&kv, "call") {
        Some(path) => std::fs::read_to_string(path)
            .map_err(|e| format!("--call {path}: {e}"))?,
        None => "null".to_string(),
    };
    let bytes = pool_rules::judge_json(ruleset, &state, &record, &call)
        .unwrap_or_else(|e| e.to_json());
    std::fs::write(out_path, &bytes).map_err(|e| format!("--out {out_path}: {e}"))?;
    println!("judge: {ruleset} -> {out_path} ({} bytes, rules {})",
        bytes.len(), pool_rules::RULES_VERSION);
    Ok(ExitCode::SUCCESS)
}

fn judge_batch(
    kv: &[(String, String)],
    cases_path: &str,
    out_path: &str,
) -> Result<ExitCode, String> {
    let text = std::fs::read_to_string(cases_path)
        .map_err(|e| format!("--cases {cases_path}: {e}"))?;
    let corpus: Value =
        serde_json::from_str(&text).map_err(|e| format!("--cases {cases_path}: {e}"))?;
    let all = corpus
        .get("cases")
        .and_then(Value::as_array)
        .ok_or_else(|| format!("--cases {cases_path}: no cases[] array"))?;

    let filter = cliargs::get(kv, "ruleset");
    let prepared: Vec<Prepared> = all
        .iter()
        .filter(|c| {
            filter.is_none_or(|f| c.get("ruleset").and_then(Value::as_str) == Some(f))
        })
        .map(prepare)
        .collect::<Result<_, _>>()?;
    if prepared.is_empty() {
        return Err(format!(
            "no corpus cases{}",
            filter.map_or(String::new(), |f| format!(" for ruleset {f:?}"))
        ));
    }

    // One crate-byte line per case, in case order (the conformance-gate contract §3).
    let mut lines = String::new();
    for p in &prepared {
        lines.push_str(&run(p));
        lines.push('\n');
    }
    std::fs::write(out_path, &lines).map_err(|e| format!("--out {out_path}: {e}"))?;
    println!("judge: {} cases -> {out_path} (rules {})",
        prepared.len(), pool_rules::RULES_VERSION);

    if cliargs::get(kv, "bench").is_some() {
        return Ok(bench(&prepared));
    }
    Ok(ExitCode::SUCCESS)
}

/// Per-case timing stats + the < 1 ms/judgment gate (the conformance-gate contract
/// §4). Per-case latency = min over repetitions (load-robust, the
/// bench-wasm "min" convention); the gate is the WORST case — the budget's
/// reference workload (break-class 22-ball snooker) is in the corpus.
fn bench(prepared: &[Prepared]) -> ExitCode {
    const REPS: usize = 5;
    let scale: f64 = std::env::var("OB_PERF_BUDGET_SCALE")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(1.0);
    for p in prepared {
        let _ = run(p); // warmup pass
    }
    let mut per_case: Vec<(f64, &str)> = prepared
        .iter()
        .map(|p| {
            let mut best = f64::INFINITY;
            for _ in 0..REPS {
                let t0 = Instant::now();
                let _ = run(p);
                best = best.min(t0.elapsed().as_secs_f64() * 1e3);
            }
            (best, p.id.as_str())
        })
        .collect();
    per_case.sort_by(|a, b| a.0.total_cmp(&b.0));
    let n = per_case.len();
    let mean = per_case.iter().map(|(t, _)| t).sum::<f64>() / n as f64;
    let p50 = per_case[n / 2].0;
    let (worst, worst_id) = per_case[n - 1];
    println!(
        "judge bench: mean {mean:.4} ms, p50 {p50:.4} ms, max {worst:.4} ms \
         (n={n}, min of {REPS} reps/case)"
    );
    let limit = 1.0 * scale;
    let ok = worst < limit;
    println!(
        "worst case {worst_id}: {worst:.4} ms vs {limit} ms \
         (< 1 ms/judgment x{scale}) -> {}",
        if ok { "PASS" } else { "FAIL" }
    );
    if ok { ExitCode::SUCCESS } else { ExitCode::FAILURE }
}

#[cfg(test)]
mod tests {
    use super::{prepare, run};
    use serde_json::json;

    /// T008 smoke: a variant-slice case (data-model §6 shape) routes
    /// through `task_initial_state_json` and ships crate bytes verbatim;
    /// the malformed-envelope case ships the structured payload.
    #[test]
    fn task_config_cases_route_through_the_entry_fn() {
        let envelope = json!({
            "schema": "task-config-v1", "kind": "rules-variant",
            "family": "eightball", "config": {},
        });
        let case = json!({
            "id": "slice/initialState-wpa", "ruleset": "eightball-v2",
            "kind": "initialState", "breaker": 1,
            "task_config": envelope,
        });
        let p = prepare(&case).unwrap();
        assert_eq!(run(&p),
            pool_rules::task_initial_state_json(
                &envelope.to_string(), 1).unwrap());

        let bad = json!({
            "id": "slice/initialState-error-bad-config",
            "ruleset": "eightball-v2", "kind": "initialState-error",
            "breaker": 1, "task_config": {"schema": "nope"},
        });
        let p = prepare(&bad).unwrap();
        assert!(run(&p).starts_with(
            "{\"error\":{\"code\":\"invalid-task-config\""));
    }

    /// T013 slice routing: a case carrying a preset id (data-model §6)
    /// routes through `preset_initial_state_json`; the unknown-id case
    /// ships the structured `unknown-preset` payload bytes (SC-006).
    #[test]
    fn preset_cases_route_through_preset_initial_state() {
        let case = json!({
            "id": "slice/initialState-apa", "ruleset": "eightball-v2",
            "kind": "initialState", "breaker": 2, "preset": "apa-8ball",
        });
        let p = prepare(&case).unwrap();
        assert_eq!(run(&p),
            pool_rules::preset_initial_state_json("apa-8ball", 2).unwrap());

        let unknown = json!({
            "id": "slice/initialState-error-unknown-preset",
            "ruleset": "eightball-v2", "kind": "initialState-error",
            "breaker": 1, "preset": "bcapl-8ball",
        });
        let p = prepare(&unknown).unwrap();
        assert!(run(&p).starts_with(
            "{\"error\":{\"code\":\"unknown-preset\""));
    }

    /// The frozen 013 path: no `task_config` field ⇒ the per-ruleset
    /// registry entry, bytes unchanged.
    #[test]
    fn corpus_cases_keep_the_frozen_initial_state_path() {
        let case = json!({
            "id": "eightball-v1/initialState-001", "ruleset": "eightball-v1",
            "kind": "initialState", "breaker": 2,
        });
        let p = prepare(&case).unwrap();
        assert_eq!(run(&p),
            pool_rules::initial_state_json("eightball-v1", 2).unwrap());
    }
}
