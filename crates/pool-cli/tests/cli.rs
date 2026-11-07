// Copyright (c) Meta Platforms, Inc. and affiliates.

//! End-to-end tests for the pool-cli v2 surface (issue #12): every
//! subcommand runs against the golden scenario library
//! (`docs/sdk/scenarios/`), exit codes and output schemas are asserted, and
//! batch output is thread-count-independent.

use std::path::PathBuf;
use std::process::{Command, Output};

fn repo(rel: &str) -> String {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(rel)
        .to_string_lossy()
        .into_owned()
}

fn golden(name: &str) -> String {
    repo(&format!("docs/sdk/scenarios/{name}.json"))
}

fn tmp(name: &str) -> String {
    // Keyed on the test thread as well as the process: cargo runs the tests
    // of one binary as threads of one process, and a ThreadId is never
    // reused inside a process, so no two tests can share a path.
    let tag: String = format!("{:?}", std::thread::current().id())
        .chars()
        .filter(char::is_ascii_digit)
        .collect();
    std::env::temp_dir()
        .join(format!("pool_cli_test_{}_t{tag}_{name}", std::process::id()))
        .to_string_lossy()
        .into_owned()
}

fn cli(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_pool-cli"))
        .args(args)
        .output()
        .expect("pool-cli must spawn")
}

fn stdout(out: &Output) -> String {
    String::from_utf8(out.stdout.clone()).expect("stdout is UTF-8")
}

const GOLDENS: [&str; 8] = [
    "break", "cut_side", "bank", "draw", "kick", "lag", "jump", "masse",
];

/// Every golden scenario is self-describing, loads, simulates, and produces
/// a version-stamped ShotRecord with a non-empty event stream.
#[test]
fn golden_scenarios_run_end_to_end() {
    for name in GOLDENS {
        let doc: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(golden(name)).expect("golden exists"))
                .expect("golden is JSON");
        for key in ["name", "description", "provenance", "system", "shot"] {
            assert!(doc.get(key).is_some(), "golden {name} missing {key:?}");
        }

        let out_path = tmp(&format!("{name}.rec.json"));
        let out = cli(&["run", "--scenario", &golden(name), "--out", &out_path]);
        assert!(out.status.success(), "run {name}: {out:?}");

        let rec: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&out_path).expect("record written"))
                .expect("record is JSON");
        assert_eq!(rec["format_version"], 1, "golden {name}");
        assert!(rec["kernel_version"].is_string(), "golden {name}");
        let events = rec["events"].as_array().expect("events array");
        assert!(!events.is_empty(), "golden {name} produced no events");
        std::fs::remove_file(&out_path).ok();
    }
}

/// The four options presets all simulate the same golden scenario cleanly.
#[test]
fn run_options_presets() {
    for preset in ["default", "realistic", "mathavan-fitted", "grip-fitted"] {
        let out = cli(&[
            "run",
            "--scenario",
            &golden("cut_side"),
            "--options-preset",
            preset,
        ]);
        assert!(out.status.success(), "preset {preset}: {out:?}");
    }
    let out = cli(&[
        "run",
        "--scenario",
        &golden("cut_side"),
        "--options-preset",
        "nope",
    ]);
    assert_eq!(
        out.status.code(),
        Some(2),
        "unknown preset must be a usage error"
    );
}

/// `--seed` re-racks a `{"rack": ...}` scenario: different seeds give
/// different records, equal seeds identical ones.
#[test]
fn run_seed_override_reracks() {
    let (p1, p2, p3) = (tmp("s1.json"), tmp("s2.json"), tmp("s3.json"));
    for (path, seed) in [(&p1, "7"), (&p2, "7"), (&p3, "8")] {
        let out = cli(&[
            "run",
            "--scenario",
            &golden("break"),
            "--seed",
            seed,
            "--out",
            path,
        ]);
        assert!(out.status.success(), "{out:?}");
    }
    let (b1, b2, b3) = (
        std::fs::read(&p1).unwrap(),
        std::fs::read(&p2).unwrap(),
        std::fs::read(&p3).unwrap(),
    );
    assert_eq!(b1, b2, "same seed must be byte-identical");
    assert_ne!(b1, b3, "different seed must re-rack the break");
    for p in [p1, p2, p3] {
        std::fs::remove_file(p).ok();
    }
}

/// Every subcommand advertises --help with exit 0; bad usage exits 2.
#[test]
fn help_and_usage_errors() {
    for sub in ["run", "batch", "sweep", "compare", "sample"] {
        let out = cli(&[sub, "--help"]);
        assert!(out.status.success(), "{sub} --help: {out:?}");
        assert!(stdout(&out).contains("usage:"), "{sub} --help text");
    }
    assert_eq!(cli(&["frobnicate"]).status.code(), Some(2));
    assert_eq!(
        cli(&["run"]).status.code(),
        Some(2),
        "run without --scenario"
    );
    let out = cli(&["version"]);
    assert!(out.status.success());
    assert!(stdout(&out).contains("kernel_version:"));
}

/// Batch determinism (issue #12 gate): same seeds → byte-identical JSONL
/// and summary regardless of thread count. Seeds compose with a sweep grid.
#[test]
fn batch_is_thread_count_independent() {
    let sweep = tmp("sweep1.json");
    std::fs::write(
        &sweep,
        r#"{"param": "v0", "from": 6.0, "to": 8.0, "steps": 2}"#,
    )
    .unwrap();
    let (o1, o4) = (tmp("b1.jsonl"), tmp("b4.jsonl"));
    let run = |threads: &str, out: &str| {
        let o = cli(&[
            "batch",
            "--scenario",
            &golden("break"),
            "--seeds",
            "0..3",
            "--sweep",
            &sweep,
            "--threads",
            threads,
            "--out",
            out,
        ]);
        assert!(o.status.success(), "batch t{threads}: {o:?}");
        stdout(&o)
    };
    let (sum1, sum4) = (run("1", &o1), run("4", &o4));
    assert_eq!(sum1, sum4, "summary must not depend on thread count");
    assert!(sum1.contains("batch: 6 shots, 0 errors"), "summary: {sum1}");
    assert!(sum1.contains("duration [s]: p10"), "summary: {sum1}");

    let (l1, l4) = (
        std::fs::read_to_string(&o1).unwrap(),
        std::fs::read_to_string(&o4).unwrap(),
    );
    assert_eq!(l1, l4, "JSONL must not depend on thread count");
    let rows: Vec<serde_json::Value> = l1
        .lines()
        .map(|l| serde_json::from_str(l).expect("JSONL row"))
        .collect();
    assert_eq!(rows.len(), 6, "3 seeds x 2 grid points");
    for (i, row) in rows.iter().enumerate() {
        assert_eq!(row["i"], i, "rows in job order");
        for key in ["seed", "v0", "events", "duration", "pocketed"] {
            assert!(row.get(key).is_some(), "row {i} missing {key:?}");
        }
    }
    assert_eq!(rows[0]["seed"], 0);
    assert_eq!(rows[5]["seed"], 2);
    for p in [sweep, o1, o4] {
        std::fs::remove_file(p).ok();
    }
}

/// Sweep: 2-parameter grid → CSV with one row per grid point.
#[test]
fn sweep_emits_csv_grid() {
    let sweep = tmp("sweep2.json");
    std::fs::write(
        &sweep,
        r#"[{"param": "phi", "from": 1.47, "to": 1.67, "steps": 3},
            {"param": "v0", "from": 1.5, "to": 2.5, "steps": 2}]"#,
    )
    .unwrap();
    let out = cli(&[
        "sweep",
        "--scenario",
        &golden("cut_side"),
        "--sweep",
        &sweep,
    ]);
    assert!(out.status.success(), "{out:?}");
    let csv = stdout(&out);
    let lines: Vec<&str> = csv.lines().collect();
    assert_eq!(lines[0], "phi,v0,events,duration,n_pocketed,pocketed,error");
    assert_eq!(lines.len(), 1 + 3 * 2, "header + 3x2 grid rows");
    assert!(
        lines[1].starts_with("1.47,1.5,"),
        "row-major, last axis fastest: {}",
        lines[1]
    );
    assert!(lines[2].starts_with("1.47,2.5,"), "{}", lines[2]);

    // A 3-spec file is a batch, not a sweep.
    let sweep3 = tmp("sweep3.json");
    std::fs::write(
        &sweep3,
        r#"[{"param": "phi", "from": 0, "to": 1, "steps": 2},
            {"param": "v0", "from": 1, "to": 2, "steps": 2},
            {"param": "a", "from": 0, "to": 0.1, "steps": 2}]"#,
    )
    .unwrap();
    assert_eq!(
        cli(&[
            "sweep",
            "--scenario",
            &golden("cut_side"),
            "--sweep",
            &sweep3
        ])
        .status
        .code(),
        Some(2)
    );
    for p in [sweep, sweep3] {
        std::fs::remove_file(p).ok();
    }
}

/// Minimal RFC-4180 field split (quotes + escaped quotes) for the test below.
fn csv_fields(line: &str) -> Vec<String> {
    let (mut fields, mut cur, mut in_quotes) = (Vec::new(), String::new(), false);
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' if in_quotes && chars.peek() == Some(&'"') => {
                cur.push('"');
                chars.next();
            }
            '"' => in_quotes = !in_quotes,
            ',' if !in_quotes => fields.push(std::mem::take(&mut cur)),
            _ => cur.push(c),
        }
    }
    fields.push(cur);
    fields
}

/// Sweep error column is RFC-4180-quoted: kernel validation messages contain
/// commas ("v0 must be in (0, 15] m/s, got 16"), so unquoted rows would carry
/// more fields than the 7-column header contract (review finding).
#[test]
fn sweep_csv_quotes_error_column() {
    let sweep = tmp("sweep_err.json");
    std::fs::write(
        &sweep,
        r#"[{"param": "v0", "from": 14, "to": 16, "steps": 2},
            {"param": "phi", "from": 1.5, "to": 1.5, "steps": 1}]"#,
    )
    .unwrap();
    let out = cli(&[
        "sweep",
        "--scenario",
        &golden("cut_side"),
        "--sweep",
        &sweep,
    ]);
    assert!(out.status.success(), "{out:?}");
    let csv = stdout(&out);
    let lines: Vec<&str> = csv.lines().collect();
    assert_eq!(lines.len(), 3, "header + 2 rows: {csv}");
    for line in &lines {
        assert_eq!(
            csv_fields(line).len(),
            7,
            "every row parses to 7 fields: {line}"
        );
    }
    let err_row = csv_fields(lines[2]);
    assert_eq!(err_row[0], "16", "v0=16 row: {}", lines[2]);
    assert!(
        err_row[6].contains("v0 must be in (0, 15] m/s") && err_row[6].contains(','),
        "comma-bearing kernel message survives round-trip: {:?}",
        err_row[6]
    );
    std::fs::remove_file(sweep).ok();
}

/// Sample: --fps grid covers [0, duration] for every ball; --t single row.
#[test]
fn sample_positions_csv_and_json() {
    let rec = tmp("draw.rec.json");
    assert!(cli(&["run", "--scenario", &golden("draw"), "--out", &rec])
        .status
        .success());

    let out = cli(&["sample", "--record", &rec, "--fps", "10", "--format", "csv"]);
    assert!(out.status.success(), "{out:?}");
    let csv = stdout(&out);
    let lines: Vec<&str> = csv.lines().collect();
    assert_eq!(lines[0], "t,ball,x,y,z,qw,qx,qy,qz,motion");
    assert!(
        lines.len() > 2 * 80,
        "draw runs ~8.5 s at 10 fps x 2 balls: {}",
        lines.len()
    );
    assert!(
        lines[1].starts_with("0,0,"),
        "first frame at t = 0: {}",
        lines[1]
    );

    let out = cli(&["sample", "--record", &rec, "--t", "0.5", "--format", "json"]);
    assert!(out.status.success(), "{out:?}");
    let frames: serde_json::Value = serde_json::from_str(&stdout(&out)).expect("JSON frames");
    let frames = frames.as_array().expect("frame array");
    assert_eq!(frames.len(), 1);
    assert_eq!(frames[0]["t"], 0.5);
    assert_eq!(frames[0]["balls"].as_array().expect("balls").len(), 2);
    std::fs::remove_file(rec).ok();
}

/// Oracle compare on the bank fixture passes at the default tolerances
/// (exit 0) and fails with tightened ones (exit 1) — documenting the
/// spec-SC-003 gate semantics end-to-end.
#[test]
fn compare_against_pooltool_oracle() {
    // Own record name: golden_scenarios_run_end_to_end writes-and-deletes
    // tmp("bank.rec.json"). When tmp() was keyed on the pid alone that
    // raced this test's record between the two compare invocations; tmp()
    // is per test thread now, and the distinct name stays.
    let rec = tmp("bank_compare.rec.json");
    assert!(cli(&["run", "--scenario", &golden("bank"), "--out", &rec])
        .status
        .success());
    let oracle = repo("crates/pool-core/tests/fixtures/oracle/bank_two_cushion.json");

    let out = cli(&["compare", "--ours", &rec, "--oracle", &oracle]);
    assert!(out.status.success(), "compare must pass: {}", stdout(&out));
    assert!(stdout(&out).ends_with("result: PASS\n"));

    let out = cli(&[
        "compare",
        "--ours",
        &rec,
        "--oracle",
        &oracle,
        "--tol-time",
        "1e-12",
    ]);
    assert_eq!(out.status.code(), Some(1), "tightened gate must fail");
    std::fs::remove_file(rec).ok();
}

/// `catalog list/show/json` — registry inspection: every category listed
/// with calibration badges, show finds entries across categories, json is
/// the kernel serde shape, unknown ids/usage exit 2.
#[test]
fn catalog_subcommand() {
    let out = cli(&["catalog", "list"]);
    assert!(out.status.success(), "{out:?}");
    let text = stdout(&out);
    for needle in [
        // v12: dwell calibration moves to masse_trick_dwell; masse_trick
        // reverts to its v10 bytes (issue #232). v14 (issue #283): four
        // archetypes + three de-branding twins appended; branded ids
        // flagged with the superseded-by marker.
        // v17 (calibration B2 CAL-1): predator side-mouth repin only.
        // v18 (GH-621): the Diamond Pro-Am 8-ft / 7-ft size variants
        // appended.
        // v18 (Rasson lane OX-A1): +1 table (rasson_ox_9ft), additive.
        // v21 (GH-1080): chinese8 corner + middle repin, in place.
        "equipment catalog v21",
        "table:",
        "cloth:",
        "ballset:",
        "cue:",
        "cushion_model:",
        "[calibrated]",
        "[literature]",
        "[estimated ]",
        "[measured  ]",
        // catalog v4: the legacy default is still LISTED (dev tool) but
        // flagged with the ui_hidden marker the app pickers filter on.
        "wpa_generic_9ft",
        "Legacy 9-ft (pooltool-derived) [ui-hidden]",
        "wpa_spec_9ft",
        "low_deflection",
        // catalog v6 (feature 012): the three discipline tables + cloth
        // (v15/GH-490: joy_q8_9ft is the de-brand alias — still LISTED,
        // flagged ui-hidden like the legacy default)
        "wpbsa_snooker_12ft",
        "umb_carom_284",
        "joy_q8_9ft",
        "Chinese 8-ball tournament 9-ft (legacy alias) [ui-hidden]",
        "carom_worsted_heated",
        // catalog v15 (GH-490): the de-branded Chinese-eight class entry
        "chinese8_pro_9ft",
        "Chinese 8-ball tournament 9-ft",
        // catalog v8: the Measured-tier owner Pro-Am pair, listed with
        // the provenance doc as the badge text
        "pool_pro_9ft_measured",
        "pool_worsted_measured",
        "pool-9ft-measured-calibration.md (internal)",
        // catalog v9 (issue #91): the visual-variant pool ballsets
        "aramith_black",
        "arcos_reserve",
        "Black-cap tournament (legacy alias)",
        "Ivory gunsight (legacy alias)",
        // catalog v10 (issue #168): the per-cue miscue-cap trick cue
        "masse_trick",
        "Massé/trick cue (hard pressed tip)",
        // catalog v12 (issue #232): the dwell-calibrated trick cue
        "masse_trick_dwell",
        "Massé/trick cue, dwell-calibrated (soft pressed tip)",
        // catalog v14 (issue #283): the four archetypes, the generic
        // twins, and the superseded-by markers on the branded ids
        "carbon_ld",
        "jump_phenolic",
        "snooker_ash",
        "carom_conical",
        "Carbon-fiber ultra-LD shaft (leather tip)",
        "Snooker ash cue, 9.5 mm brass ferrule",
        "pro_ld_pivot_141",
        "pro_ld_pivot_118",
        "pro_ld_pivot_101",
        "Pro LD shaft, 14.1 in pivot (leather tip)",
        "[superseded-by pro_ld_pivot_141]",
        "[superseded-by pro_ld_pivot_118]",
        "[superseded-by pro_ld_pivot_101]",
    ] {
        assert!(text.contains(needle), "list missing {needle:?}:\n{text}");
    }

    let out = cli(&["catalog", "show", "worn_slow"]);
    assert!(out.status.success(), "{out:?}");
    let entry: serde_json::Value = serde_json::from_str(&stdout(&out)).unwrap();
    assert_eq!(entry["id"], "worn_slow");
    assert_eq!(entry["params"]["u_r"], 0.016);

    // Catalog v2 ballset-condition entry carries the fitted mu_bb curve.
    let out = cli(&["catalog", "show", "aramith_pool_worn"]);
    assert!(out.status.success(), "{out:?}");
    let entry: serde_json::Value = serde_json::from_str(&stdout(&out)).unwrap();
    assert_eq!(entry["bb_friction"]["a"], 0.035);

    let out = cli(&["catalog", "json"]);
    assert!(out.status.success(), "{out:?}");
    let cat: serde_json::Value = serde_json::from_str(&stdout(&out)).unwrap();
    // Catalog v4 (catalog-policy ruling): honest legacy metadata + the
    // wpa_spec_9ft / re-derived redlabel entries; ui_hidden serialized only
    // when true (additive serde). v5: Diamond factory-cut facing repin.
    // v6 (feature 012): version + entry-count asserts — 8 tables (5 v5 +
    // snooker/carom/joy), 5 cloths (4 v5 + carom_worsted_heated), and NO
    // new ballsets/cues/cushion models. v7 (Amendment A1): snooker/joy
    // arc-span re-derivation — entry sets unchanged. v8: +1 Measured
    // owner Pro-Am table and +1 cloth (9 tables, 6 cloths). v9 (issue
    // #91): +2 visual-variant ballsets (aramith_black, arcos_reserve).
    // v10 (issue #168): +1 cue (masse_trick, per-cue miscue contact cap).
    // v11 (issue #212): masse_trick gained the Amendment-024 dwell quartet
    // in place — reverted in v12. v12 (issue #232): +1 cue
    // (masse_trick_dwell, the dwell-calibration carrier); masse_trick
    // back to its v10 bytes. v13 (issue #277, Amendment 025): SCHEMA-ONLY
    // — CueParams gains the two structural shaft fields (serde-skipped at
    // their defaults), no entry added or changed. v14 (issue #283): +7
    // cues (carbon_ld/jump_phenolic/snooker_ash/carom_conical + the three
    // pro_ld_pivot_* de-branding twins); the three branded ids gain the
    // superseded_by metadata key, params untouched. v15 (GH-490): +1
    // table (chinese8_pro_9ft, the de-branded Chinese-eight class);
    // joy_q8_9ft stays as its ui_hidden resolve-only alias. v16
    // (calibration B1): chinese8 CORNER geometry repin only — no entry
    // added or removed. v17 (calibration B2 CAL-1): predator SIDE-mouth
    // repin only — likewise no entry added or removed. v18 (GH-621):
    // diamond_proam_8ft + diamond_proam_7ft APPENDED (additive only).
    // repin only — likewise no entry added or removed. v18 (Rasson lane
    // OX-A1): +1 table (rasson_ox_9ft, the Rasson OX American-pool
    // geometry, canonical definition
    // docs/geometry/rasson-ox-9ft-table-definition.json), additive only.
    // v21 (GH-1080): chinese8 corner + middle repin, in place (no entry
    // added or removed).
    assert_eq!(cat["version"], 21);
    // v20 (#789): + the de-branded twins (7 tables, 3 cloths, 4 ballsets),
    // and removed the two v8 Measured entries, whose twins carry them.
    assert_eq!(cat["tables"].as_array().unwrap().len(), 19);
    assert_eq!(cat["cloths"].as_array().unwrap().len(), 8);
    assert_eq!(cat["ballsets"].as_array().unwrap().len(), 10);
    assert_eq!(cat["cues"].as_array().unwrap().len(), 16);
    assert_eq!(cat["cushion_models"].as_array().unwrap().len(), 4);
    let cues = cat["cues"].as_array().unwrap();
    assert_eq!(
        cues.iter()
            .filter_map(|e| e.get("superseded_by").and_then(|v| v.as_str()))
            .collect::<Vec<_>>(),
        ["pro_ld_pivot_141", "pro_ld_pivot_118", "pro_ld_pivot_101"]
    );
    let tables = cat["tables"].as_array().unwrap();
    assert_eq!(tables[0]["id"], "wpa_generic_9ft");
    assert_eq!(tables[0]["ui_hidden"], true);
    assert!(tables.iter().any(|t| t["id"] == "wpa_spec_9ft"));
    for id in [
        "wpbsa_snooker_12ft",
        "umb_carom_284",
        "joy_q8_9ft",
        "chinese8_pro_9ft",
        "diamond_proam_8ft",
        "diamond_proam_7ft",
        "rasson_ox_9ft",
    ] {
        assert!(tables.iter().any(|t| t["id"] == id), "missing table {id}");
    }
    // v15 (GH-490): joy_q8_9ft joins the legacy default as the only
    // ui_hidden table entries (the de-brand resolve-only alias regime).
    // v20 (#789): so does every entry superseded by a de-branded twin; each
    // target is a listed table that is not ui_hidden.
    for t in tables {
        let superseded = t.get("superseded_by").and_then(|v| v.as_str());
        let hidden = t["id"] == "wpa_generic_9ft" || t["id"] == "joy_q8_9ft" || superseded.is_some();
        if hidden {
            assert_eq!(t["ui_hidden"], true, "{}", t["id"]);
        } else {
            assert!(t.get("ui_hidden").is_none(), "{}", t["id"]);
        }
        if let Some(twin) = superseded {
            assert!(
                tables
                    .iter()
                    .any(|u| u["id"] == twin && u.get("ui_hidden").is_none()),
                "{}: superseded_by target {twin} missing or hidden",
                t["id"]
            );
        }
    }
    assert_eq!(
        tables.iter().filter(|t| t.get("superseded_by").is_some()).count(),
        6
    );
    assert!(tables
        .iter()
        .find(|t| t["id"] == "joy_q8_9ft")
        .is_some_and(|t| t["ui_hidden"] == true));

    assert_eq!(cli(&["catalog", "show", "nope"]).status.code(), Some(2));
    assert_eq!(cli(&["catalog"]).status.code(), Some(2));
    assert!(cli(&["catalog", "--help"]).status.success());
}

/// Catalog v20 (#789): a scenario whose `"table"` preset is a retired v8
/// Measured id expands to its neutral twin's table (the record's initial
/// table equals the twin's), and `catalog show` of a retired table or
/// cloth id prints the twin's entry.
#[test]
fn retired_measured_ids_expand_as_their_twins() {
    let initial_table = |id: &str| {
        let scen = tmp(&format!("retired_{id}.json"));
        std::fs::write(
            &scen,
            format!(
                r#"{{"system":{{"table":"{id}","balls":[
                {{"id":0,"params":{{"m":0.17,"r":0.028575,"u_s":0.2,"u_r":0.01,
                 "u_sp":0.0127,"e_b":0.95,"e_c":0.85,"f_c":0.2,"e_t":0.5}},
                 "state":{{"pos":{{"x":0.0,"y":-0.5,"z":0.028575}},
                 "vel":{{"x":0.0,"y":0.0,"z":0.0}},"avel":{{"x":0.0,"y":0.0,"z":0.0}},
                 "motion":"Stationary"}}}}]}},
               "shot":{{"v0":1.0,"phi":1.5707963267948966,"theta":0.0,
                       "a":0.0,"b":0.0,"seed":0}}}}"#
            ),
        )
        .unwrap();
        let rec_path = tmp(&format!("retired_{id}_rec.json"));
        let out = cli(&["run", "--scenario", &scen, "--out", &rec_path]);
        assert!(out.status.success(), "{id}: {out:?}");
        let rec: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&rec_path).unwrap()).unwrap();
        std::fs::remove_file(&scen).ok();
        std::fs::remove_file(&rec_path).ok();
        rec["initial"]["table"].clone()
    };
    let twin = initial_table("pool_pro_9ft_measured");
    assert!(twin.is_object(), "{twin}");
    assert_eq!(initial_table("owner_proam_9ft_2026_07"), twin);

    for (retired, neutral) in [
        ("owner_proam_9ft_2026_07", "pool_pro_9ft_measured"),
        ("owner_proam_cloth_2026_07", "pool_worsted_measured"),
    ] {
        let a = cli(&["catalog", "show", retired]);
        let b = cli(&["catalog", "show", neutral]);
        assert!(a.status.success(), "{retired}: {a:?}");
        assert!(b.status.success(), "{neutral}: {b:?}");
        assert_eq!(stdout(&a), stdout(&b), "{retired}");
    }
}

/// Feature 012 (T012): catalog table ids expand as `"table"` presets
/// alongside the frozen `"wpa_9ft"` literal, and the new `"snooker"` /
/// `"carom"` rack kinds simulate end-to-end on their default pairings;
/// unknown presets exit 2 with an actionable message.
#[test]
fn discipline_table_presets_and_rack_kinds() {
    // catalog table preset: one snooker-size ball on the 12-ft table
    let scen = tmp("snooker_preset.json");
    std::fs::write(
        &scen,
        r#"{"system":{"table":"wpbsa_snooker_12ft","balls":[
            {"id":0,"params":{"m":0.1406,"r":0.02625,"u_s":0.2,"u_r":0.01,
             "u_sp":0.0127,"e_b":0.95,"e_c":0.85,"f_c":0.14,"e_t":0.5},
             "state":{"pos":{"x":0.0,"y":-1.0475,"z":0.02625},
             "vel":{"x":0.0,"y":0.0,"z":0.0},"avel":{"x":0.0,"y":0.0,"z":0.0},
             "motion":"Stationary"}}]},
           "shot":{"v0":2.0,"phi":1.5707963267948966,"theta":0.0,
                   "a":0.0,"b":0.0,"seed":0}}"#,
    )
    .unwrap();
    let rec_path = tmp("snooker_preset_rec.json");
    let out = cli(&["run", "--scenario", &scen, "--out", &rec_path]);
    assert!(out.status.success(), "{out:?}");
    let rec: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&rec_path).unwrap()).unwrap();
    assert_eq!(rec["initial"]["table"]["length"], 3.569);
    assert_eq!(
        rec["initial"]["table"]["pockets"].as_array().unwrap().len(),
        6
    );

    // unknown preset exits 2
    let bad = tmp("bad_preset.json");
    std::fs::write(
        &bad,
        r#"{"system":{"table":"unlisted_table_8ft","balls":[
            {"id":0,"params":{"m":0.17,"r":0.028575,"u_s":0.2,"u_r":0.01,
             "u_sp":0.0127,"e_b":0.95,"e_c":0.85,"f_c":0.2,"e_t":0.5},
             "state":{"pos":{"x":0.0,"y":0.0,"z":0.028575},
             "vel":{"x":0.0,"y":0.0,"z":0.0},"avel":{"x":0.0,"y":0.0,"z":0.0},
             "motion":"Stationary"}}]},
           "shot":{"v0":2.0,"phi":0.0,"theta":0.0,"a":0.0,"b":0.0,"seed":0}}"#,
    )
    .unwrap();
    assert_eq!(cli(&["run", "--scenario", &bad]).status.code(), Some(2));

    // snooker / carom rack kinds simulate on the default pairings
    for (kind, n_balls, table_len) in
        [("snooker", 22, 3.569), ("carom", 3, 2.84)]
    {
        let scen = tmp(&format!("{kind}_rack.json"));
        std::fs::write(
            &scen,
            format!(
                r#"{{"system":{{"rack":"{kind}"}},
                    "shot":{{"v0":2.5,"phi":1.5707963267948966,"theta":0.0,
                            "a":0.0,"b":0.0,"seed":5}}}}"#
            ),
        )
        .unwrap();
        let rec_path = tmp(&format!("{kind}_rack_rec.json"));
        let out = cli(&["run", "--scenario", &scen, "--out", &rec_path]);
        assert!(out.status.success(), "{kind}: {out:?}");
        let rec: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&rec_path).unwrap()).unwrap();
        assert_eq!(
            rec["initial"]["balls"].as_array().unwrap().len(),
            n_balls,
            "{kind}"
        );
        assert_eq!(rec["initial"]["table"]["length"], table_len, "{kind}");
        std::fs::remove_file(&scen).ok();
        std::fs::remove_file(&rec_path).ok();
    }
    // discipline rack kinds reject mismatched --equipment tables
    let scen = tmp("carom_rack_bad_eq.json");
    std::fs::write(
        &scen,
        r#"{"system":{"rack":"carom"},
           "shot":{"v0":2.5,"phi":0.0,"theta":0.0,"a":0.0,"b":0.0,"seed":5}}"#,
    )
    .unwrap();
    let out = cli(&[
        "run", "--scenario", &scen,
        "--equipment", "table=diamond_proam_9ft",
    ]);
    assert_eq!(out.status.code(), Some(2), "{out:?}");
    for p in [scen, bad] {
        std::fs::remove_file(p).ok();
    }
}

// ---- feature 013: `judge` — the native rules-conformance surface ----------
// (contracts/rules-crate-api.md §4d; T036)

fn rules_corpus() -> serde_json::Value {
    serde_json::from_str(
        &std::fs::read_to_string(repo("scripts/fixtures/rules-corpus.json"))
            .expect("frozen corpus exists"),
    )
    .expect("corpus is JSON")
}

/// Batch mode replays the ENTIRE frozen corpus and the output file is
/// `cmp`-equal to the harvested `expect` lines: one crate-byte line per
/// case, case order, error cases as canonical error payloads (the M4 gate
/// and the CLI leg of conformance-gate.md §3, byte-for-byte).
#[test]
fn judge_batch_output_cmp_equal_to_corpus_expect() {
    let out_path = tmp("judgments.jsonl");
    let out = cli(&[
        "judge",
        "--cases",
        &repo("scripts/fixtures/rules-corpus.json"),
        "--out",
        &out_path,
    ]);
    assert!(out.status.success(), "{out:?}");

    let corpus = rules_corpus();
    let expect: String = corpus["cases"]
        .as_array()
        .expect("cases array")
        .iter()
        .map(|c| format!("{}\n", c["expect"].as_str().expect("expect line")))
        .collect();
    let written = std::fs::read_to_string(&out_path).expect("judgments written");
    assert_eq!(written, expect, "cmp-strength equality, no normalization");
    std::fs::remove_file(&out_path).ok();
}

/// `--ruleset` filters batch mode to one ruleset's corpus subset (the
/// per-port migration-gate M4 shape); an unknown id selects nothing and is
/// a usage error.
#[test]
fn judge_batch_ruleset_filter() {
    let out_path = tmp("judgments_nine.jsonl");
    let corpus_path = repo("scripts/fixtures/rules-corpus.json");
    let out = cli(&[
        "judge", "--cases", &corpus_path,
        "--ruleset", "nineball-v1",
        "--out", &out_path,
    ]);
    assert!(out.status.success(), "{out:?}");

    let corpus = rules_corpus();
    let expect: String = corpus["cases"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| c["ruleset"] == "nineball-v1")
        .map(|c| format!("{}\n", c["expect"].as_str().unwrap()))
        .collect();
    assert_eq!(std::fs::read_to_string(&out_path).unwrap(), expect);
    std::fs::remove_file(&out_path).ok();

    let out = cli(&[
        "judge", "--cases", &corpus_path,
        "--ruleset", "nope-v0",
        "--out", &tmp("judgments_none.jsonl"),
    ]);
    assert_eq!(out.status.code(), Some(2), "empty subset is a usage error");
}

/// Single-case form writes the crate bytes VERBATIM (no trailing newline),
/// both for a judgment and for the canonical error payload of an
/// error-kind case; `--call` defaults to JSON null.
#[test]
fn judge_single_case_bytes_verbatim() {
    let corpus = rules_corpus();
    let cases = corpus["cases"].as_array().unwrap();
    let write_inputs = |case: &serde_json::Value, tag: &str| -> Vec<String> {
        ["state", "record", "call"]
            .iter()
            .map(|k| {
                let p = tmp(&format!("judge_{tag}_{k}.json"));
                std::fs::write(&p, case[*k].to_string()).unwrap();
                p
            })
            .collect()
    };

    // A judge case with a non-null call (call fidelity through the file).
    let case = cases
        .iter()
        .find(|c| c["kind"] == "judge" && !c["call"].is_null())
        .expect("a called judge case exists");
    let inputs = write_inputs(case, "ok");
    let out_path = tmp("judge_ok_out.json");
    let out = cli(&[
        "judge",
        "--ruleset", case["ruleset"].as_str().unwrap(),
        "--state", &inputs[0],
        "--record", &inputs[1],
        "--call", &inputs[2],
        "--out", &out_path,
    ]);
    assert!(out.status.success(), "{out:?}");
    assert_eq!(
        std::fs::read_to_string(&out_path).unwrap(),
        case["expect"].as_str().unwrap(),
        "crate bytes verbatim, no trailing newline"
    );

    // An error-kind case ships the canonical error payload bytes.
    let case = cases
        .iter()
        .find(|c| c["kind"] == "judge-error" && c["ruleset"] != "stub-v0")
        .expect("a judge-error case exists");
    let inputs = write_inputs(case, "err");
    let out_path2 = tmp("judge_err_out.json");
    let out = cli(&[
        "judge",
        "--ruleset", case["ruleset"].as_str().unwrap(),
        "--state", &inputs[0],
        "--record", &inputs[1],
        "--call", &inputs[2],
        "--out", &out_path2,
    ]);
    assert!(out.status.success(), "error bytes are output, not failure: {out:?}");
    assert_eq!(
        std::fs::read_to_string(&out_path2).unwrap(),
        case["expect"].as_str().unwrap()
    );
    for p in inputs {
        std::fs::remove_file(p).ok();
    }
    for p in [out_path, out_path2] {
        std::fs::remove_file(p).ok();
    }
}

/// `judge --version` prints RULES_VERSION (the rules stamp, independent of
/// the physics kernel stamp — FR-006); `--bench` prints per-case timing
/// stats and the < 1 ms/judgment gate line (scaled generously here: a
/// debug test binary is not the release reference build).
#[test]
fn judge_version_and_bench() {
    let out = cli(&["judge", "--version"]);
    assert!(out.status.success(), "{out:?}");
    assert_eq!(stdout(&out), format!("{}\n", pool_rules::RULES_VERSION));

    let out_path = tmp("judgments_bench.jsonl");
    let out = Command::new(env!("CARGO_BIN_EXE_pool-cli"))
        .args([
            "judge",
            "--cases",
            &repo("scripts/fixtures/rules-corpus.json"),
            "--ruleset",
            "nineball-v1",
            "--out",
            &out_path,
            "--bench",
        ])
        .env("OB_PERF_BUDGET_SCALE", "1000")
        .output()
        .expect("pool-cli must spawn");
    assert!(out.status.success(), "{out:?}");
    let text = stdout(&out);
    assert!(text.contains("judge bench: mean"), "stats line: {text}");
    assert!(text.contains("worst case"), "gate line: {text}");
    assert!(text.contains("PASS"), "gate passes at x1000: {text}");
    std::fs::remove_file(&out_path).ok();

    // usage errors: no mode selected / missing --out
    assert_eq!(cli(&["judge"]).status.code(), Some(2));
    assert_eq!(
        cli(&["judge", "--cases", &repo("scripts/fixtures/rules-corpus.json")])
            .status
            .code(),
        Some(2),
        "batch without --out"
    );
    assert!(cli(&["judge", "--help"]).status.success());
}

/// `run --equipment` — rack scenarios re-rack on the resolved composition
/// (deterministic per id set), explicit scenarios apply cloth + options,
/// table/ballset axes demand a rack, unknown ids and preset+equipment
/// combos exit 2.
#[test]
fn run_equipment_flag() {
    let (p1, p2, p3) = (tmp("eq1.json"), tmp("eq2.json"), tmp("eq3.json"));
    // rack scenario: worn cloth re-rack, byte-deterministic
    for path in [&p1, &p2] {
        let out = cli(&[
            "run", "--scenario", &golden("break"),
            "--equipment", "cloth=worn_slow,cue=low_deflection",
            "--out", path,
        ]);
        assert!(out.status.success(), "{out:?}");
    }
    let (b1, b2) = (std::fs::read(&p1).unwrap(), std::fs::read(&p2).unwrap());
    assert_eq!(b1, b2, "same equipment must be byte-identical");
    let rec: serde_json::Value = serde_json::from_slice(&b1).unwrap();
    assert_eq!(rec["initial"]["equipment"]["cloth_id"], "worn_slow");
    assert_eq!(rec["initial"]["balls"][0]["params"]["u_r"], 0.016);
    assert_eq!(rec["options"]["cue"]["end_mass"], 0.00170097);

    // explicit-placement scenario: cloth + options apply, geometry kept
    let out = cli(&[
        "run", "--scenario", &golden("cut_side"),
        "--equipment", "cloth=snooker_napped,cushion_model=grip_fitted",
        "--out", &p3,
    ]);
    assert!(out.status.success(), "{out:?}");
    let rec: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&p3).unwrap()).unwrap();
    assert_eq!(rec["initial"]["equipment"]["cushion_model_id"], "grip_fitted");
    assert_eq!(rec["initial"]["table"]["cushion_response"]["ee0"], 0.65);
    assert_eq!(rec["initial"]["balls"][0]["params"]["u_s"], 0.212);

    // guardrails
    let out = cli(&[
        "run", "--scenario", &golden("cut_side"),
        "--equipment", "ballset=snooker",
    ]);
    assert_eq!(out.status.code(), Some(2), "ballset needs a rack scenario");
    for bad in ["cloth=velvet", "hat=fedora", "cloth"] {
        let out = cli(&["run", "--scenario", &golden("break"), "--equipment", bad]);
        assert_eq!(out.status.code(), Some(2), "{bad}: {out:?}");
    }
    let out = cli(&[
        "run", "--scenario", &golden("break"),
        "--equipment", "cloth=worn_slow", "--options-preset", "realistic",
    ]);
    assert_eq!(out.status.code(), Some(2), "preset+equipment must be rejected");

    for p in [p1, p2, p3] {
        std::fs::remove_file(p).ok();
    }
}

/// `tmp()` gives every test thread its own path: cargo runs the tests of
/// one binary as threads of one process, and a shared path let one test
/// delete another test's record between its write and its read.
#[test]
fn tmp_paths_are_unique_per_test_thread() {
    let named = |label: &str| {
        std::thread::Builder::new()
            .name(label.into())
            .spawn(|| tmp("draw.rec.json"))
            .unwrap()
            .join()
            .unwrap()
    };
    let unnamed = || std::thread::spawn(|| tmp("draw.rec.json")).join().unwrap();
    let pairs = [
        ("named", named("gh924_probe_a"), named("gh924_probe_b")),
        ("unnamed", unnamed(), unnamed()),
    ];
    let shared: Vec<&str> = pairs
        .iter()
        .filter(|(_, a, b)| a == b)
        .map(|(kind, _, _)| *kind)
        .collect();
    assert!(
        shared.is_empty(),
        "two test threads must never share a tmp path: {shared:?}"
    );
    assert_eq!(tmp("x"), tmp("x"), "one test thread keeps one path per name");
}
