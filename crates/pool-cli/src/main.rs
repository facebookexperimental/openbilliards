// Copyright (c) Meta Platforms, Inc. and affiliates.

//! pool-cli — headless SDK harness for pool-core (M9-owned; SDK story and
//! cookbook: `docs/sdk/README.md`, GitHub issue #12).
//!
//! Subcommands (each supports `--help`):
//!   run      simulate one scenario JSON → ShotRecord (was `simulate`)
//!   batch    seed range and/or shot-param sweep, parallel + deterministic
//!   sweep    2-parameter grid, CSV output
//!   compare  diff a ShotRecord against a pooltool oracle fixture
//!   sample   record + time(s) → CSV/JSON ball positions for plotting
//!   catalog  equipment registry: list / show <id> / json (issue #15)
//!   judge    adjudicate shots via the pool-rules crate (feature 013)
//!   task-hash  task-config canonical bytes + hash via pool-rules (022)
//!   version  kernel version hash + format versions
//!
//! Scenario JSON schema (shared with `pool-wasm::simulate_json` and the
//! SDKs): `{ "system": SystemState, "shot": ShotParams, "options":
//! SimOptions? }` — see `scenario.rs` for the committed-file conveniences
//! (`"table": "wpa_9ft"` preset, `{"rack": "nine"|"fifteen"}` seeded racks)
//! and the golden library in `docs/sdk/scenarios/`.
//!
//! Exit codes: 0 = pass, 1 = comparison failed (compare only), 2 = error
//! (I/O, parse, usage).

mod batch;
mod catalogcmd;
mod cliargs;
mod compare;
mod judge;
mod runcmd;
mod samplecmd;
mod scenario;
mod taskhash;

use std::process::ExitCode;

const USAGE: &str = "\
pool-cli — headless simulation harness for the openbilliards kernel

usage: pool-cli <subcommand> [args]   (each subcommand supports --help)

  run        simulate a scenario JSON to a ShotRecord
  batch      run a scenario template over a seed range and/or parameter sweep
  sweep      2-parameter grid over a scenario, CSV output
  compare    diff a ShotRecord against a pooltool oracle fixture
  sample     evaluate a record's trajectory at query times (CSV/JSON)
  catalog    list/show the equipment registry (ids for --equipment)
  judge      adjudicate shots natively via the pool-rules crate (013)
  task-hash  task-config canonical bytes + hash via pool-rules (022)
  version    print kernel version hash + format versions

docs: docs/sdk/README.md (cookbook), docs/sdk/scenarios/ (golden scenarios)";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        // `simulate` is the deprecated v1 spelling of `run` (same args).
        Some("run") | Some("simulate") => runcmd::cmd_run(&args[1..]),
        Some("batch") => batch::cmd_batch(&args[1..]),
        Some("sweep") => batch::cmd_sweep(&args[1..]),
        Some("compare") => compare::cmd_compare(&args[1..]),
        Some("catalog") => catalogcmd::cmd_catalog(&args[1..]),
        Some("sample") => samplecmd::cmd_sample(&args[1..]),
        Some("judge") => judge::cmd_judge(&args[1..]),
        Some("task-hash") => taskhash::cmd_task_hash(&args[1..]),
        Some("version") => cmd_version(),
        Some("help") | Some("--help") | Some("-h") => {
            println!("{USAGE}");
            ExitCode::SUCCESS
        }
        _ => {
            eprintln!("{USAGE}");
            ExitCode::from(2)
        }
    }
}

/// `pool-cli version` — the determinism identity card (constitution P-III):
/// which kernel build this binary embeds and which serialized formats it
/// reads/writes. NOTE the canonical physics for replays is the committed
/// wasm (`web/dist/pool-wasm`); the native CLI is a dev/CI harness whose
/// records carry the SAME kernel_version discipline.
fn cmd_version() -> ExitCode {
    println!("pool-cli {}", env!("CARGO_PKG_VERSION"));
    println!("kernel_version: {}", pool_core::KERNEL_VERSION);
    println!("shot_record format_version: {}", pool_core::FORMAT_VERSION);
    println!("scenario schema: {{system, shot, options?}} (see pool-cli run --help)");
    println!("oracle fixture format: openbilliards.oracle.v1");
    ExitCode::SUCCESS
}
