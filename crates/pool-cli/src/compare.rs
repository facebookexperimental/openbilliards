// Copyright (c) Meta Platforms, Inc. and affiliates.

//! `pool-cli compare` — diff a pool-core `ShotRecord` against a pooltool
//! oracle fixture (`tools/fixtures/dump_pooltool.py` format
//! `openbilliards.oracle.v1`), reporting per event: index, type match, Δt,
//! and per-ball position/velocity deltas, then final-state deltas.
//! Gates: event-type sequence equality, |Δt| ≤ tol-time, final positions
//! ≤ tol-pos (spec SC-003; velocity deltas are informational). For
//! `Pocketed` balls only x/y are compared — the park depth below the bed is
//! a documented bookkeeping difference (see
//! `crates/pool-core/tests/fixtures/oracle/waivers.json`).

use crate::cliargs::{get, parse_kv};
use pool_core::{BallId, Event, EventKind, MotionState, ShotRecord, Vec3};
use serde_json::Value;
use std::process::ExitCode;

// --- compare ------------------------------------------------------------------

/// Engine-neutral event descriptor used for the type-sequence gate.
#[derive(PartialEq, Clone)]
pub struct EvKey {
    kind: String,
    ids: Vec<u8>,
    index: Option<u16>,
    from: Option<String>,
    to: Option<String>,
}

impl std::fmt::Display for EvKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}{:?}", self.kind, self.ids)?;
        if let Some(i) = self.index {
            write!(f, "[{i}]")?;
        }
        if let (Some(a), Some(b)) = (&self.from, &self.to) {
            write!(f, "({a}->{b})")?;
        }
        Ok(())
    }
}

struct OracleBall {
    id: u8,
    pos: Vec3,
    vel: Vec3,
    pocketed: bool,
}

struct OracleEvent {
    t: f64,
    key: EvKey,
    post: Vec<OracleBall>,
}

fn motion_name(m: MotionState) -> &'static str {
    match m {
        MotionState::Stationary => "Stationary",
        MotionState::Spinning => "Spinning",
        MotionState::Sliding => "Sliding",
        MotionState::Rolling => "Rolling",
        MotionState::Pocketed => "Pocketed",
        MotionState::Airborne => "Airborne",
    }
}

pub fn key_of_ours(kind: &EventKind) -> EvKey {
    let (kind, ids, index, from, to) = match kind {
        EventKind::Strike { ball } => ("Strike", vec![ball.0], None, None, None),
        EventKind::BallBall { b1, b2 } => ("BallBall", vec![b1.0, b2.0], None, None, None),
        EventKind::BallLinearCushion { ball, seg } => {
            ("BallLinearCushion", vec![ball.0], Some(*seg), None, None)
        }
        EventKind::BallCircularCushion { ball, arc } => {
            ("BallCircularCushion", vec![ball.0], Some(*arc), None, None)
        }
        EventKind::BallPocket { ball, pocket } => {
            ("BallPocket", vec![ball.0], Some(*pocket), None, None)
        }
        EventKind::Transition { ball, from, to } => (
            "Transition",
            vec![ball.0],
            None,
            Some(motion_name(*from).to_string()),
            Some(motion_name(*to).to_string()),
        ),
        EventKind::BallTable { ball } => ("BallTable", vec![ball.0], None, None, None),
        EventKind::BallOffTable { ball } => ("BallOffTable", vec![ball.0], None, None, None),
        EventKind::Rest => ("Rest", vec![], None, None, None),
    };
    EvKey {
        kind: kind.to_string(),
        ids,
        index,
        from,
        to,
    }
}

fn json_f64(v: &Value, what: &str) -> Result<f64, String> {
    v.as_f64()
        .ok_or_else(|| format!("oracle fixture: {what} is not a number"))
}

fn json_vec3(v: &Value, what: &str) -> Result<Vec3, String> {
    let arr = v
        .as_array()
        .filter(|a| a.len() == 3)
        .ok_or_else(|| format!("oracle fixture: {what} is not a 3-array"))?;
    Ok(Vec3::new(
        json_f64(&arr[0], what)?,
        json_f64(&arr[1], what)?,
        json_f64(&arr[2], what)?,
    ))
}

fn json_ball(v: &Value, what: &str) -> Result<OracleBall, String> {
    Ok(OracleBall {
        id: v["id"]
            .as_u64()
            .ok_or_else(|| format!("oracle fixture: {what}.id"))? as u8,
        pos: json_vec3(&v["pos"], &format!("{what}.pos"))?,
        vel: json_vec3(&v["vel"], &format!("{what}.vel"))?,
        pocketed: v["motion"] == "Pocketed",
    })
}

fn parse_oracle(value: &Value) -> Result<(Vec<OracleEvent>, Vec<OracleBall>), String> {
    if value["format"] != "openbilliards.oracle.v1" {
        return Err(
            "oracle fixture: missing/unknown \"format\" (expected openbilliards.oracle.v1)".into(),
        );
    }
    let events = value
        .pointer("/oracle/events")
        .and_then(Value::as_array)
        .ok_or("oracle fixture: missing oracle.events")?;
    let mut out = Vec::with_capacity(events.len());
    for (i, e) in events.iter().enumerate() {
        let what = format!("events[{i}]");
        let ids = e["ids"]
            .as_array()
            .ok_or_else(|| format!("oracle fixture: {what}.ids"))?
            .iter()
            .map(|v| v.as_u64().map(|x| x as u8))
            .collect::<Option<Vec<u8>>>()
            .ok_or_else(|| format!("oracle fixture: {what}.ids"))?;
        let key = EvKey {
            kind: e["type"]
                .as_str()
                .ok_or_else(|| format!("oracle fixture: {what}.type"))?
                .to_string(),
            ids,
            index: e.get("index").and_then(Value::as_u64).map(|x| x as u16),
            from: e.get("from").and_then(Value::as_str).map(str::to_string),
            to: e.get("to").and_then(Value::as_str).map(str::to_string),
        };
        let post = e["post"]
            .as_array()
            .ok_or_else(|| format!("oracle fixture: {what}.post"))?
            .iter()
            .map(|b| json_ball(b, &format!("{what}.post")))
            .collect::<Result<Vec<_>, _>>()?;
        out.push(OracleEvent {
            t: json_f64(&e["t"], &format!("{what}.t"))?,
            key,
            post,
        });
    }
    let finals = value
        .pointer("/oracle/final")
        .and_then(Value::as_array)
        .ok_or("oracle fixture: missing oracle.final")?
        .iter()
        .map(|b| json_ball(b, "final"))
        .collect::<Result<Vec<_>, _>>()?;
    Ok((out, finals))
}

/// Position delta honoring the pocketed park-depth convention (x/y only for
/// pocketed balls; see module docs).
fn pos_delta(oracle: &OracleBall, ours: Vec3) -> f64 {
    let (dx, dy) = (oracle.pos.x - ours.x, oracle.pos.y - ours.y);
    let dz = if oracle.pocketed {
        0.0
    } else {
        oracle.pos.z - ours.z
    };
    (dx * dx + dy * dy + dz * dz).sqrt()
}

pub const HELP: &str = "\
pool-cli compare — diff a ShotRecord against a pooltool oracle fixture

usage: pool-cli compare --ours <record.json> --oracle <fixture.json>
                        [--tol-time 1e-6] [--tol-pos 1e-4]

  --ours      ShotRecord written by `pool-cli run --out` (same kernel build)
  --oracle    pooltool dump (tools/fixtures/dump_pooltool.py,
              format openbilliards.oracle.v1)
  --tol-time  |dt| gate per event [s]; some fixtures carry documented model-
              difference waivers with LOOSER per-event bounds (see
              crates/pool-core/tests/fixtures/oracle/waivers.json) — pass
              the waiver bound here to reproduce the test-suite verdict
  --tol-pos   final-position gate [m] (spec SC-003)

gates: event-type sequence equality, |dt| <= tol-time, final positions <=
tol-pos (velocity deltas informational; pocketed balls compare x/y only).
exit codes: 0 pass, 1 comparison failed, 2 error.";

pub fn cmd_compare(args: &[String]) -> ExitCode {
    if crate::cliargs::wants_help(args) {
        println!("{HELP}");
        return ExitCode::SUCCESS;
    }
    match run_compare(args) {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::from(1),
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::from(2)
        }
    }
}

fn run_compare(args: &[String]) -> Result<bool, String> {
    let kv = parse_kv(args)?;
    let ours_path = get(&kv, "ours").ok_or("compare requires --ours")?;
    let oracle_path = get(&kv, "oracle").ok_or("compare requires --oracle")?;
    let tol_time: f64 = get(&kv, "tol-time")
        .map_or(Ok(1e-6), str::parse)
        .map_err(|e| format!("--tol-time: {e}"))?;
    let tol_pos: f64 = get(&kv, "tol-pos")
        .map_or(Ok(1e-4), str::parse)
        .map_err(|e| format!("--tol-pos: {e}"))?;

    let ours_data =
        std::fs::read_to_string(ours_path).map_err(|e| format!("cannot read {ours_path}: {e}"))?;
    let record = ShotRecord::from_json(&ours_data).map_err(|e| format!("{ours_path}: {e}"))?;
    let oracle_data = std::fs::read_to_string(oracle_path)
        .map_err(|e| format!("cannot read {oracle_path}: {e}"))?;
    let oracle_value: Value =
        serde_json::from_str(&oracle_data).map_err(|e| format!("{oracle_path}: {e}"))?;
    let (oracle_events, oracle_finals) = parse_oracle(&oracle_value)?;

    // Our stream minus the terminal Rest (bookkeeping; no oracle counterpart).
    let ours: Vec<&Event> = record
        .events
        .iter()
        .filter(|e| !matches!(e.kind, EventKind::Rest))
        .collect();

    let mut pass = true;
    println!(
        "comparing {} events (ours, Rest excluded) vs {} (oracle); tol-time {tol_time:.1e} s, tol-pos {tol_pos:.1e} m",
        ours.len(),
        oracle_events.len()
    );

    let n = ours.len().max(oracle_events.len());
    for i in 0..n {
        match (ours.get(i), oracle_events.get(i)) {
            (Some(oe), Some(fe)) => {
                let our_key = key_of_ours(&oe.kind);
                let type_ok = our_key == fe.key;
                let dt = (oe.t - fe.t).abs();
                let time_ok = dt <= tol_time;
                let mut line = format!(
                    "#{i:<3} {} {}  dt={dt:.3e}",
                    if type_ok && time_ok { "ok  " } else { "FAIL" },
                    fe.key
                );
                if !type_ok {
                    line.push_str(&format!("  TYPE ours={our_key}"));
                    pass = false;
                }
                if !time_ok {
                    pass = false;
                }
                for ob in &fe.post {
                    match oe.post.iter().find(|(id, _)| *id == BallId(ob.id)) {
                        Some((_, s)) => {
                            let dp = pos_delta(ob, s.pos);
                            let dv = (ob.vel - s.vel).norm();
                            line.push_str(&format!("  b{}: dpos={dp:.3e} dvel={dv:.3e}", ob.id));
                        }
                        None => {
                            line.push_str(&format!("  b{}: MISSING", ob.id));
                            pass = false;
                        }
                    }
                }
                println!("{line}");
            }
            (Some(oe), None) => {
                println!(
                    "#{i:<3} FAIL extra event (ours): {} at t={}",
                    key_of_ours(&oe.kind),
                    oe.t
                );
                pass = false;
            }
            (None, Some(fe)) => {
                println!(
                    "#{i:<3} FAIL missing event (oracle): {} at t={}",
                    fe.key, fe.t
                );
                pass = false;
            }
            (None, None) => unreachable!(),
        }
    }

    // Final states: initial states patched by post-event snapshots.
    let mut finals: std::collections::BTreeMap<u8, (Vec3, Vec3)> = record
        .initial
        .balls
        .iter()
        .map(|b| (b.id.0, (b.state.pos, b.state.vel)))
        .collect();
    for e in &record.events {
        for (id, s) in &e.post {
            finals.insert(id.0, (s.pos, s.vel));
        }
    }
    for ob in &oracle_finals {
        match finals.get(&ob.id) {
            Some((pos, vel)) => {
                let dp = pos_delta(ob, *pos);
                let dv = (ob.vel - *vel).norm();
                let ok = dp <= tol_pos;
                if !ok {
                    pass = false;
                }
                println!(
                    "final b{} {}  dpos={dp:.3e} dvel={dv:.3e}",
                    ob.id,
                    if ok { "ok  " } else { "FAIL" }
                );
            }
            None => {
                println!("final b{} FAIL missing from our record", ob.id);
                pass = false;
            }
        }
    }

    println!("result: {}", if pass { "PASS" } else { "FAIL" });
    Ok(pass)
}
