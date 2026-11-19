// Copyright (c) Meta Platforms, Inc. and affiliates.

//! `pool-cli run` — simulate one scenario file to a `ShotRecord`.

use crate::cliargs::{get, parse_kv_flags, wants_help};
use crate::compare::key_of_ours;
use crate::scenario;
use pool_core::simulate;
use std::process::ExitCode;

pub const HELP: &str = "\
pool-cli run — simulate a scenario JSON to a ShotRecord

usage: pool-cli run --scenario <in.json> [--out <record.json>]
                    [--options-preset default|realistic|mathavan-fitted|grip-fitted]
                    [--equipment axis=id[,axis=id...]] [--seed <u64>] [--events]

  --scenario        scenario file: {\"system\", \"shot\", \"options\"?}
                    (system may be {\"rack\": \"nine\"|\"fifteen\"};
                    system.table may be the preset string \"wpa_9ft\")
  --out             write the full ShotRecord JSON here
  --options-preset  replace the scenario's options with a named kernel
                    preset (fitted presets also patch table.cushion_response)
  --equipment       catalog ids (see pool-cli catalog list), axes
                    table|cloth|ballset|cue|cushion_model; re-racks rack
                    scenarios on the resolved equipment, applies
                    cloth/cushion-response/options+cue to explicit ones
                    (ballset variants allowed there when the radius
                    matches, e.g. the aramith_pool_worn condition).
                    Mutually exclusive with --options-preset
  --seed            override shot.seed (re-racks seeded rack scenarios)
  --events          print the event stream (index, t, event) to stdout

exit codes: 0 ok, 2 error. `simulate` is a deprecated alias of `run`.";

pub fn cmd_run(args: &[String]) -> ExitCode {
    if wants_help(args) {
        println!("{HELP}");
        return ExitCode::SUCCESS;
    }
    match run(args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::from(2)
        }
    }
}

fn run(args: &[String]) -> Result<(), String> {
    let kv = parse_kv_flags(args, &["events"])?;
    let scenario_path = get(&kv, "scenario").ok_or("run requires --scenario")?;
    let preset = get(&kv, "options-preset");
    let equipment = get(&kv, "equipment")
        .map(scenario::parse_equipment_arg)
        .transpose()?;
    let seed = get(&kv, "seed")
        .map(|s| s.parse::<u64>().map_err(|e| format!("--seed: {e}")))
        .transpose()?;

    let sc = scenario::load(scenario_path, preset, equipment.as_ref(), seed)?;
    let record =
        simulate(&sc.system, &sc.shot, &sc.options).map_err(|e| format!("simulation: {e}"))?;

    if get(&kv, "events").is_some() {
        for (i, e) in record.events.iter().enumerate() {
            println!("#{i:<4} t={:<12.6} {}", e.t, key_of_ours(&e.kind));
        }
    }
    if let Some(out_path) = get(&kv, "out") {
        std::fs::write(out_path, record.to_json())
            .map_err(|e| format!("cannot write {out_path}: {e}"))?;
        println!(
            "wrote {out_path}: {} events, duration {:.6} s",
            record.events.len(),
            record.duration()
        );
    } else {
        println!(
            "{} events, duration {:.6} s (no --out; record discarded)",
            record.events.len(),
            record.duration()
        );
    }
    Ok(())
}
