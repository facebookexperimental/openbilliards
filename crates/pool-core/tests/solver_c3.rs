// Copyright (c) Meta Platforms, Inc. and affiliates.

//! J v2 one-simulation-per-scenario timing and complete event-log comparison.

use pool_core::{simulate, ShotParams, SimOptions, SystemState};
use serde::Deserialize;
use serde_json::json;
use std::fs;
use std::hint::black_box;
use std::path::{Path, PathBuf};
use std::time::Instant;

#[derive(Deserialize)]
struct Fixture {
    family: String,
    scenario: String,
}

#[derive(Deserialize)]
struct Input {
    system: SystemState,
    shot: ShotParams,
    options: SimOptions,
}

const ROWS: [(&str, usize); 5] = [
    ("mix", 1029),
    ("breaks", 1029),
    ("clusters", 1008),
    ("grazes", 4410),
    ("pockets", 2208),
];

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn inputs() -> Vec<(String, Input)> {
    let path = std::env::var("SOLVER_C3_FIXTURES").expect("set SOLVER_C3_FIXTURES");
    let bytes = fs::read_to_string(path).unwrap();
    let rows: Vec<_> = bytes
        .lines()
        .map(|line| {
            let row: Fixture = serde_json::from_str(line).unwrap();
            (row.family, serde_json::from_str(&row.scenario).unwrap())
        })
        .collect();
    assert_eq!(rows.len(), 9684);
    for (name, count) in ROWS {
        assert_eq!(rows.iter().filter(|(f, _)| f == name).count(), count);
    }
    rows
}

#[test]
#[ignore = "release J v2 benchmark; run alternating feature arms"]
fn solver_c3_jv2_speed() {
    assert!(!black_box(cfg!(debug_assertions)), "release build required");
    // Both layers of JSON parsing and row grouping finish before any clock.
    let rows = inputs();
    let arm = "NEW";
    for (family, count) in ROWS {
        let selected: Vec<_> = rows.iter().filter(|(f, _)| f == family).collect();
        let mut ns = 0_u128;
        let mut events = 0;
        for (_, sc) in selected {
            let start = Instant::now();
            let result = black_box(simulate(black_box(&sc.system), &sc.shot, &sc.options));
            ns += start.elapsed().as_nanos();
            // Result checking and destruction are outside the measured call.
            events += result.unwrap().events.len();
        }
        println!(
            "{}",
            json!({"arm":arm,"family":family,"scenarios":count,"ns":ns,"events":events})
        );
    }
}

#[test]
#[ignore = "two-build bounded/unbounded J v2 event-log comparison"]
fn solver_c3_jv2_events() {
    let rows = inputs();
    let dir = root().join("target/solver-c3/events-unbounded");
    fs::create_dir_all(&dir).unwrap();
    let export = std::env::var_os("SOLVER_C3_EXPORT_EVENTS").is_some();
    for (family, count) in ROWS {
        let selected: Vec<_> = rows
            .iter()
            .enumerate()
            .filter(|(_, (f, _))| f == family)
            .collect();
        let mut events = 0;
        // Deterministic equally spaced sample: 200 distinct inputs per row.
        for k in 0..200 {
            let (index, (_, sc)) = selected[k * count / 200];
            let record = simulate(&sc.system, &sc.shot, &sc.options).unwrap();
            events += record.events.len();
            let bytes = serde_json::to_vec(&record.events).unwrap();
            let file = dir.join(format!("{family}-{index}.json"));
            if export {
                fs::write(file, bytes).unwrap();
            } else {
                assert!(bytes == fs::read(file).unwrap(), "{family} fixture {index}");
            }
        }
        println!(
            "{}",
            json!({"family":family,"shots":200,"events":events,"mismatches":0,"export":export})
        );
    }
}
