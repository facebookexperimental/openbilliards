// Copyright (c) Meta Platforms, Inc. and affiliates.

//! `pool-cli batch` / `pool-cli sweep` — many shots from one scenario
//! template: a seed range and/or a shot-parameter grid, simulated in
//! parallel with DETERMINISTIC, thread-count-independent output (results
//! are collected by job index; the kernel itself is bit-deterministic).

use crate::cliargs::{get, parse_kv, parse_seed_range, wants_help};
use crate::scenario;
use pool_core::{simulate, EquipmentSpec, EventKind};
use serde_json::Value;
use std::process::ExitCode;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

/// One axis of a sweep: `{"param": "phi", "from": 0.0, "to": 1.0,
/// "steps": 11}`. `steps == 1` pins the axis at `from`. The sweep file is
/// one spec or an array of specs (cartesian product, LAST axis fastest).
struct SweepSpec {
    param: String,
    from: f64,
    to: f64,
    steps: usize,
}

impl SweepSpec {
    fn value(&self, i: usize) -> f64 {
        if self.steps <= 1 {
            self.from
        } else {
            self.from + (self.to - self.from) * (i as f64) / ((self.steps - 1) as f64)
        }
    }
}

fn parse_spec(v: &Value) -> Result<SweepSpec, String> {
    let param = v["param"]
        .as_str()
        .ok_or("sweep spec: missing \"param\"")?
        .to_string();
    let num = |k: &str| {
        v[k].as_f64()
            .ok_or_else(|| format!("sweep spec {param:?}: missing \"{k}\""))
    };
    let steps = v["steps"]
        .as_u64()
        .ok_or_else(|| format!("sweep spec {param:?}: missing \"steps\""))?
        as usize;
    if steps == 0 {
        return Err(format!("sweep spec {param:?}: steps must be >= 1"));
    }
    let (from, to) = (num("from")?, num("to")?);
    Ok(SweepSpec {
        param,
        from,
        to,
        steps,
    })
}

fn parse_sweep_file(path: &str) -> Result<Vec<SweepSpec>, String> {
    let data = std::fs::read_to_string(path).map_err(|e| format!("cannot read {path}: {e}"))?;
    let v: Value = serde_json::from_str(&data).map_err(|e| format!("sweep JSON: {e}"))?;
    match &v {
        Value::Array(items) => items.iter().map(parse_spec).collect(),
        Value::Object(_) => Ok(vec![parse_spec(&v)?]),
        _ => Err("sweep file must be a spec object or an array of specs".into()),
    }
}

/// One simulation job (seed × grid point) and its result row.
struct Job {
    seed: Option<u64>,
    overrides: Vec<(String, f64)>,
}

struct Row {
    seed: u64,
    overrides: Vec<(String, f64)>,
    events: usize,
    duration: f64,
    pocketed: Vec<u8>,
    error: Option<String>,
}

/// Expand seeds × grid (row-major over the specs, last axis fastest).
fn expand_jobs(seeds: Option<std::ops::Range<u64>>, specs: &[SweepSpec]) -> Vec<Job> {
    let grid_len: usize = specs.iter().map(|s| s.steps).product::<usize>().max(1);
    let seed_list: Vec<Option<u64>> = match seeds {
        Some(r) => r.map(Some).collect(),
        None => vec![None],
    };
    let mut jobs = Vec::with_capacity(seed_list.len() * grid_len);
    for seed in seed_list {
        for flat in 0..grid_len {
            let mut overrides = Vec::with_capacity(specs.len());
            let mut rem = flat;
            for spec in specs.iter().rev() {
                overrides.push((spec.param.clone(), spec.value(rem % spec.steps)));
                rem /= spec.steps;
            }
            overrides.reverse();
            jobs.push(Job { seed, overrides });
        }
    }
    jobs
}

/// Run all jobs; results come back in job order regardless of `threads`.
fn run_jobs(
    template: &Value,
    preset: Option<&str>,
    equipment: Option<&EquipmentSpec>,
    jobs: &[Job],
    threads: usize,
) -> Vec<Row> {
    let next = AtomicUsize::new(0);
    let slots: Mutex<Vec<Option<Row>>> = Mutex::new((0..jobs.len()).map(|_| None).collect());
    std::thread::scope(|scope| {
        for _ in 0..threads.max(1) {
            scope.spawn(|| loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                if i >= jobs.len() {
                    return;
                }
                let row = run_one(template, preset, equipment, &jobs[i]);
                slots.lock().unwrap()[i] = Some(row);
            });
        }
    });
    slots
        .into_inner()
        .unwrap()
        .into_iter()
        .map(|r| r.expect("every job slot filled"))
        .collect()
}

fn run_one(
    template: &Value,
    preset: Option<&str>,
    equipment: Option<&EquipmentSpec>,
    job: &Job,
) -> Row {
    let mut row = Row {
        seed: 0,
        overrides: job.overrides.clone(),
        events: 0,
        duration: 0.0,
        pocketed: Vec::new(),
        error: None,
    };
    let sc = match scenario::instantiate(template, preset, equipment, job.seed, &job.overrides) {
        Ok(sc) => sc,
        Err(e) => {
            row.error = Some(e);
            return row;
        }
    };
    row.seed = sc.shot.seed;
    match simulate(&sc.system, &sc.shot, &sc.options) {
        Ok(rec) => {
            row.events = rec.events.len();
            row.duration = rec.duration();
            for e in &rec.events {
                if let EventKind::BallPocket { ball, .. } = e.kind {
                    row.pocketed.push(ball.0);
                }
            }
        }
        Err(e) => row.error = Some(e.to_string()),
    }
    row
}

/// JSONL rendering of one result row (stable key order).
fn row_json(i: usize, row: &Row) -> String {
    let mut o = serde_json::Map::new();
    o.insert("i".into(), i.into());
    o.insert("seed".into(), row.seed.into());
    for (k, v) in &row.overrides {
        o.insert(k.clone(), Value::from(*v));
    }
    o.insert("events".into(), row.events.into());
    o.insert("duration".into(), row.duration.into());
    o.insert(
        "pocketed".into(),
        row.pocketed.iter().map(|b| Value::from(*b)).collect(),
    );
    if let Some(e) = &row.error {
        o.insert("error".into(), e.clone().into());
    }
    Value::Object(o).to_string()
}

/// Nearest-rank percentile of an ASCENDING-sorted slice.
fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let rank = ((p / 100.0) * sorted.len() as f64).ceil() as usize;
    sorted[rank.clamp(1, sorted.len()) - 1]
}

fn print_summary(rows: &[Row]) {
    let ok: Vec<&Row> = rows.iter().filter(|r| r.error.is_none()).collect();
    println!(
        "batch: {} shots, {} errors",
        rows.len(),
        rows.len() - ok.len()
    );
    if ok.is_empty() {
        return;
    }
    let total_pocketed: usize = ok.iter().map(|r| r.pocketed.len()).sum();
    let mut per_ball = std::collections::BTreeMap::<u8, usize>::new();
    for r in &ok {
        for b in &r.pocketed {
            *per_ball.entry(*b).or_default() += 1;
        }
    }
    let counts: Vec<usize> = ok.iter().map(|r| r.pocketed.len()).collect();
    println!(
        "pocketed: total {total_pocketed}, per-shot min {} / mean {:.2} / max {}",
        counts.iter().min().unwrap(),
        total_pocketed as f64 / ok.len() as f64,
        counts.iter().max().unwrap()
    );
    let by_ball: Vec<String> = per_ball.iter().map(|(b, n)| format!("{b}:{n}")).collect();
    println!(
        "pocketed by ball: {}",
        if by_ball.is_empty() {
            "-".into()
        } else {
            by_ball.join(" ")
        }
    );
    let evs: Vec<usize> = ok.iter().map(|r| r.events).collect();
    println!(
        "events: min {} / mean {:.1} / max {}",
        evs.iter().min().unwrap(),
        evs.iter().sum::<usize>() as f64 / ok.len() as f64,
        evs.iter().max().unwrap()
    );
    let mut durs: Vec<f64> = ok.iter().map(|r| r.duration).collect();
    durs.sort_by(f64::total_cmp);
    println!(
        "duration [s]: p10 {:.3} / p50 {:.3} / p90 {:.3} / max {:.3}",
        percentile(&durs, 10.0),
        percentile(&durs, 50.0),
        percentile(&durs, 90.0),
        durs[durs.len() - 1]
    );
}

pub const HELP_BATCH: &str = "\
pool-cli batch — many shots from one scenario template (parallel, deterministic)

usage: pool-cli batch --scenario <tmpl.json> [--seeds A..B | A..=B]
                      [--sweep <sweep.json>] [--options-preset <preset>]
                      [--equipment axis=id[,...]] [--threads N]
                      [--out <results.jsonl>]

  --seeds    seed range; each seed re-instantiates the scenario (seeded
             rack scenarios re-rack). Composable with --sweep (cartesian).
  --sweep    one spec or an array: {\"param\": \"phi\"|\"v0\"|\"theta\"|\"a\"|\"b\",
             \"from\": F, \"to\": T, \"steps\": N} — arrays compose as a grid
             (last axis fastest).
  --equipment  catalog ids (axes table|cloth|ballset|cue|cushion_model, see
             pool-cli catalog list / run --help); mutually exclusive with
             --options-preset.
  --threads  worker threads (default: available parallelism). Output is
             identical for every thread count.
  --out      write per-shot JSONL rows there (default: stdout, before the
             summary). Row: {i, seed, <overrides…>, events, duration,
             pocketed[, error]}.

summary (always stdout): shot/error counts, pocketed stats, event counts,
duration percentiles. exit codes: 0 ok, 2 error.";

pub const HELP_SWEEP: &str = "\
pool-cli sweep — 2-parameter grid over a scenario, CSV output

usage: pool-cli sweep --scenario <tmpl.json> --sweep <sweep2.json>
                      [--options-preset <preset>] [--equipment axis=id[,...]]
                      [--threads N] [--out <grid.csv>]

  --sweep  an ARRAY of exactly two batch sweep specs (see pool-cli batch
           --help); rows iterate the first spec, columns-fastest the second.

CSV columns: <param1>,<param2>,events,duration,n_pocketed,pocketed,error
(pocketed is ';'-joined ball ids; error is RFC-4180-quoted when it contains
a comma/quote/newline). exit codes: 0 ok, 2 error.";

fn threads_arg(kv: &[(String, String)]) -> Result<usize, String> {
    match get(kv, "threads") {
        None => Ok(std::thread::available_parallelism().map_or(1, |n| n.get())),
        Some(s) => s.parse().map_err(|e| format!("--threads: {e}")),
    }
}

pub fn cmd_batch(args: &[String]) -> ExitCode {
    if wants_help(args) {
        println!("{HELP_BATCH}");
        return ExitCode::SUCCESS;
    }
    match run_batch(args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::from(2)
        }
    }
}

fn run_batch(args: &[String]) -> Result<(), String> {
    let kv = parse_kv(args)?;
    let template = scenario::read(get(&kv, "scenario").ok_or("batch requires --scenario")?)?;
    let seeds = get(&kv, "seeds").map(parse_seed_range).transpose()?;
    let specs = match get(&kv, "sweep") {
        Some(path) => parse_sweep_file(path)?,
        None => Vec::new(),
    };
    if seeds.is_none() && specs.is_empty() {
        return Err("batch requires --seeds and/or --sweep".into());
    }
    let preset = get(&kv, "options-preset");
    let equipment = get(&kv, "equipment")
        .map(scenario::parse_equipment_arg)
        .transpose()?;
    let jobs = expand_jobs(seeds, &specs);
    let rows = run_jobs(&template, preset, equipment.as_ref(), &jobs, threads_arg(&kv)?);

    let lines: String = rows
        .iter()
        .enumerate()
        .map(|(i, r)| row_json(i, r) + "\n")
        .collect();
    match get(&kv, "out") {
        Some(path) => {
            std::fs::write(path, lines).map_err(|e| format!("cannot write {path}: {e}"))?
        }
        None => print!("{lines}"),
    }
    print_summary(&rows);
    Ok(())
}

pub fn cmd_sweep(args: &[String]) -> ExitCode {
    if wants_help(args) {
        println!("{HELP_SWEEP}");
        return ExitCode::SUCCESS;
    }
    match run_sweep(args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::from(2)
        }
    }
}

/// RFC-4180-quote a CSV field when needed (kernel validation messages
/// contain commas — e.g. "v0 must be in (0, 15] m/s" — which would
/// otherwise break the 7-column contract of HELP_SWEEP). Only the error
/// column can need this: numeric columns and the ';'-joined pocketed ids
/// never contain commas/quotes/newlines.
fn csv_escape(s: &str) -> std::borrow::Cow<'_, str> {
    if s.contains([',', '"', '\n', '\r']) {
        std::borrow::Cow::Owned(format!("\"{}\"", s.replace('"', "\"\"")))
    } else {
        std::borrow::Cow::Borrowed(s)
    }
}

fn run_sweep(args: &[String]) -> Result<(), String> {
    let kv = parse_kv(args)?;
    let template = scenario::read(get(&kv, "scenario").ok_or("sweep requires --scenario")?)?;
    let specs = parse_sweep_file(get(&kv, "sweep").ok_or("sweep requires --sweep")?)?;
    if specs.len() != 2 {
        return Err(format!(
            "sweep requires exactly 2 sweep specs (got {}); use batch for other arities",
            specs.len()
        ));
    }
    let preset = get(&kv, "options-preset");
    let equipment = get(&kv, "equipment")
        .map(scenario::parse_equipment_arg)
        .transpose()?;
    let jobs = expand_jobs(None, &specs);
    let rows = run_jobs(&template, preset, equipment.as_ref(), &jobs, threads_arg(&kv)?);

    let mut csv = format!(
        "{},{},events,duration,n_pocketed,pocketed,error\n",
        specs[0].param, specs[1].param
    );
    for r in &rows {
        let ids: Vec<String> = r.pocketed.iter().map(u8::to_string).collect();
        csv.push_str(&format!(
            "{},{},{},{},{},{},{}\n",
            r.overrides[0].1,
            r.overrides[1].1,
            r.events,
            r.duration,
            r.pocketed.len(),
            ids.join(";"),
            csv_escape(r.error.as_deref().unwrap_or(""))
        ));
    }
    match get(&kv, "out") {
        Some(path) => std::fs::write(path, csv).map_err(|e| format!("cannot write {path}: {e}"))?,
        None => print!("{csv}"),
    }
    Ok(())
}
