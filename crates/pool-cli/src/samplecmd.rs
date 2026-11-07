// Copyright (c) Meta Platforms, Inc. and affiliates.

//! `pool-cli sample` — evaluate a ShotRecord's continuous trajectory at
//! query times (single `--t` or a uniform `--fps` grid) for plotting.
//! Exact-time reconstruction via the kernel `Sampler` (contract §M8) —
//! never resampled physics.

use crate::cliargs::{get, get_f64, parse_kv, wants_help};
use pool_core::{BallSample, ShotRecord};
use std::process::ExitCode;

pub const HELP: &str = "\
pool-cli sample — positions/orientations from a ShotRecord at query times

usage: pool-cli sample --record <record.json> (--t <seconds> | --fps <hz>)
                       [--format csv|json] [--out <file>]

  --record  a ShotRecord written by `pool-cli run --out` (same kernel build:
            strict replay policy)
  --t       sample once at this time (clamped to [0, duration])
  --fps     sample the whole record on a uniform grid at this rate
            (t = 0, 1/fps, …, duration — final time always included)
  --format  csv (default): t,ball,x,y,z,qw,qx,qy,qz,motion
            json: [{\"t\": …, \"balls\": [BallSample…]}, …]

exit codes: 0 ok, 2 error.";

pub fn cmd_sample(args: &[String]) -> ExitCode {
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

fn times(record: &ShotRecord, kv: &[(String, String)]) -> Result<Vec<f64>, String> {
    match (get(kv, "t"), get(kv, "fps")) {
        (Some(_), Some(_)) => Err("pass either --t or --fps, not both".into()),
        (Some(_), None) => Ok(vec![get_f64(kv, "t", 0.0)?.clamp(0.0, record.duration())]),
        (None, Some(_)) => {
            let fps = get_f64(kv, "fps", 0.0)?;
            if !(fps > 0.0 && fps.is_finite()) {
                return Err("--fps must be a positive number".into());
            }
            let d = record.duration();
            let n = (d * fps).floor() as usize;
            let mut ts: Vec<f64> = (0..=n).map(|i| i as f64 / fps).collect();
            if *ts.last().unwrap() < d {
                ts.push(d);
            }
            Ok(ts)
        }
        (None, None) => Err("sample requires --t or --fps".into()),
    }
}

fn run(args: &[String]) -> Result<(), String> {
    let kv = parse_kv(args)?;
    let path = get(&kv, "record").ok_or("sample requires --record")?;
    let data = std::fs::read_to_string(path).map_err(|e| format!("cannot read {path}: {e}"))?;
    let record = ShotRecord::from_json(&data).map_err(|e| format!("{path}: {e}"))?;
    let ts = times(&record, &kv)?;
    let sampler = record.sampler();

    let format = get(&kv, "format").unwrap_or("csv");
    let mut out = String::new();
    let mut balls: Vec<BallSample> = Vec::new();
    match format {
        "csv" => {
            out.push_str("t,ball,x,y,z,qw,qx,qy,qz,motion\n");
            for &t in &ts {
                sampler.sample_at(t, &mut balls);
                for b in &balls {
                    out.push_str(&format!(
                        "{t},{},{},{},{},{},{},{},{},{:?}\n",
                        b.id.0,
                        b.pos.x,
                        b.pos.y,
                        b.pos.z,
                        b.orient.w,
                        b.orient.x,
                        b.orient.y,
                        b.orient.z,
                        b.motion
                    ));
                }
            }
        }
        "json" => {
            let frames: Vec<serde_json::Value> = ts
                .iter()
                .map(|&t| {
                    sampler.sample_at(t, &mut balls);
                    serde_json::json!({ "t": t, "balls": balls })
                })
                .collect();
            out = serde_json::Value::Array(frames).to_string();
            out.push('\n');
        }
        other => return Err(format!("unknown --format {other:?} (expected csv|json)")),
    }
    match get(&kv, "out") {
        Some(path) => std::fs::write(path, out).map_err(|e| format!("cannot write {path}: {e}"))?,
        None => print!("{out}"),
    }
    Ok(())
}
