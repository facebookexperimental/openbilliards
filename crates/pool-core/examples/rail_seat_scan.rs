// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Feature 021 default-flip blast-radius scan (tasks T021, FR-009/G-SCAN;
//! research R11 step 3 — the 018 flip-cascade precedent, mechanical form).
//!
//! Re-simulates every NATIVELY re-simulable pinned artifact class twice on
//! the flipped kernel — once with `rail_seat: Planar` spliced (the pre-flip
//! physics, proven bit-identical to pre-021 during the opt-in phase) and
//! once under the new `NoseContact` default — and byte-diffs the event
//! streams (`serde_json` `float_roundtrip`: every finite f64 survives the
//! Value round-trip bit-identically). Verdicts:
//!
//! - `PROVEN-BYTE-IDENTICAL`: planar and nose-contact streams are equal —
//!   the flip cannot move this artifact.
//! - `DIVERGES-RAIL-FROZEN`: streams differ AND the first divergent event
//!   involves a ball in rail proximity (rest-seat transition, grounding
//!   reseat, nose micro-contact, pocket-mouth clip, or a downstream
//!   consequence thereof) — a repin candidate per tasks T022.
//! - `DIVERGES-OUT-OF-FAMILY`: streams differ and the first divergent event
//!   has NO rail-proximate ball — a defect finding that BLOCKS the flip
//!   (the honesty rule; exit code 1).
//! - `EXPLICIT-SEAT-PIN`: the artifact pins `rail_seat` explicitly — the
//!   flip cannot move it by construction.
//! - `NO-GEOMETRY`: the file carries no re-simulable scenario (expected
//!   values / schema fixtures) — covered by the standing-suite re-run.
//!
//! Pinned RECORDS (files with `initial` + `events`) additionally get the
//! pre-existing-drift check: the planar re-simulation is compared against
//! the pinned stream, so drift that predates this flip (older kernels,
//! earlier registered changes) is reported as `PRE-EXISTING-PIN-DRIFT` and
//! never mis-attributed to 021.
//!
//! Classes NOT scanned here (wasm-canonical; measured by their own arms and
//! merged into the internal rail-liftoff cascade record):
//! `web/tools/fixtures/kernel-corpus.json` + `legacy-links.json`
//! (`node web/tools/e2e-share.mjs --corpus` with the explicit-legacy
//! byte-reproduction rule) and the e2e planned outcomes (their drivers).
//! Slow-mo catalog scenarios are built in code and covered by the standing
//! suites (`fixtures/slowmo/*.json` carry only expected values — they scan
//! as `NO-GEOMETRY` here by shape).
//!
//! Run: `cargo run -p pool-core --release --example rail_seat_scan`
//! Dump the wasm-bench rail-hugger fixture (tasks T020; `frozen_seat`
//! helper is the single placement source, quickstart §6 rule):
//! `cargo run -p pool-core --release --example rail_seat_scan -- --dump-rail-hugger`

use pool_core::shot::RailSeat;
use pool_core::table::nose_seat_depth;
use pool_core::{
    simulate, Ball, BallId, BallParams, BallState, EquipmentCatalog, EquipmentSpec,
    LinearCushionSegment, MotionState, ShotParams, SimOptions, SystemState, Table, Vec3,
};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("repo root")
}

// ------------------------------------------------------------ loading ----

/// `"system"."table"` string convenience (the pool-cli scenario contract):
/// `"wpa_9ft"` literal or any catalog table id, built at the FIRST ball's
/// radius.
fn table_from_value(v: &Value, r: f64) -> Option<Table> {
    match v {
        Value::String(s) if s == "wpa_9ft" => Some(Table::wpa_9ft(r)),
        Value::String(s) => Some(EquipmentCatalog::get().table_by_any_id(s)?.geometry.build(r)),
        obj => serde_json::from_value(obj.clone()).ok(),
    }
}

/// Parse `{system, shot, options?}` (scenario) or `{initial, shot, options,
/// events}` (pinned record) into re-simulable parts + the raw options Value
/// (+ pinned events for records).
struct Loaded {
    system: SystemState,
    shot: ShotParams,
    options_raw: Value,
    pinned_events: Option<Vec<Value>>,
}

fn load_artifact(v: &Value) -> Option<Loaded> {
    let (sys_key, pinned_events) = if v.get("system").is_some() {
        ("system", None)
    } else if v.get("initial").is_some() {
        (
            "initial",
            Some(v.get("events")?.as_array()?.to_vec()),
        )
    } else {
        return None;
    };
    let mut sys_v = v.get(sys_key)?.clone();
    if sys_v.get("table").map(Value::is_string) == Some(true) {
        let r = sys_v["balls"][0]["params"]["r"].as_f64()?;
        let table = table_from_value(&sys_v["table"], r)?;
        sys_v["table"] = serde_json::to_value(&table).ok()?;
    }
    let system: SystemState = serde_json::from_value(sys_v).ok()?;
    let shot: ShotParams = serde_json::from_value(v.get("shot")?.clone()).ok()?;
    let options_raw = v.get("options").cloned().unwrap_or_else(|| json!({}));
    Some(Loaded {
        system,
        shot,
        options_raw,
        pinned_events,
    })
}

/// Oracle parity fixtures ({provenance, scenario:{balls,shot}, oracle}) —
/// reconstructed exactly as tests/oracle.rs does: provenance ball params,
/// `Table::wpa_9ft(r)`, balls stationary at (x, y, r), `SimOptions::default()`.
fn load_oracle_fixture(v: &Value) -> Option<Loaded> {
    let prov = v.get("provenance")?;
    let bp = prov.get("ball_params")?;
    let r = bp.get("r")?.as_f64()?;
    let params = BallParams {
        m: bp["m"].as_f64()?,
        r,
        u_s: bp["u_s"].as_f64()?,
        u_r: bp["u_r"].as_f64()?,
        u_sp: bp["u_sp"].as_f64()?,
        e_b: bp["e_b"].as_f64()?,
        e_c: bp["e_c"].as_f64()?,
        f_c: bp["f_c"].as_f64()?,
        ..BallParams::default()
    };
    let balls = v["scenario"]["balls"]
        .as_array()?
        .iter()
        .map(|b| {
            Some(Ball {
                id: BallId(b["id"].as_u64()? as u8),
                params,
                state: BallState {
                    pos: Vec3::new(b["x"].as_f64()?, b["y"].as_f64()?, r),
                    vel: Vec3::ZERO,
                    avel: Vec3::ZERO,
                    motion: MotionState::Stationary,
                    pinch: None,
                },
            })
        })
        .collect::<Option<Vec<_>>>()?;
    let shot: ShotParams = serde_json::from_value(v["scenario"]["shot"].clone()).ok()?;
    Some(Loaded {
        system: SystemState {
            balls,
            table: Table::wpa_9ft(r),
            equipment: Default::default(),
        },
        shot,
        options_raw: json!({}),
        pinned_events: None,
    })
}

// --------------------------------------------------------- simulation ----

fn opts_with_seat(options_raw: &Value, seat: RailSeat) -> SimOptions {
    let mut o = options_raw.clone();
    o["rail_seat"] = json!(match seat {
        RailSeat::Planar => "Planar",
        RailSeat::NoseContact => "NoseContact",
    });
    serde_json::from_value(o).expect("artifact options parse into SimOptions")
}

fn events_values(system: &SystemState, shot: &ShotParams, opts: &SimOptions) -> Vec<Value> {
    let rec = simulate(system, shot, opts).expect("artifact re-simulation");
    rec.events
        .iter()
        .map(|e| serde_json::to_value(e).expect("event serializes"))
        .collect()
}

fn first_diff(a: &[Value], b: &[Value]) -> Option<usize> {
    let n = a.len().min(b.len());
    (0..n)
        .find(|&i| a[i] != b[i])
        .or_else(|| (a.len() != b.len()).then_some(n))
}

// ------------------------------------------------------ classification ----

fn kind_name(ev: Option<&Value>) -> String {
    match ev.and_then(|e| e.get("kind")) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Object(m)) => m.keys().next().cloned().unwrap_or_default(),
        _ => "<end-of-stream>".to_string(),
    }
}

/// Rail proximity of any post-state ball in either stream's first divergent
/// event: within `R + 3 mm` plane distance of a linear nose (in span) or
/// radially inside `arc radius + R + 3 mm` of a jaw arc. The mechanical
/// fence for the rail-frozen family (the divergence is attributable to the
/// seat option BY CONSTRUCTION — same kernel, one option flipped; the fence
/// verifies the first delta originates at a rail interaction).
fn rail_proximity(ev: Option<&Value>, table: &Table) -> Option<String> {
    let posts = ev?.get("post")?.as_array()?;
    for entry in posts {
        let st = entry.get(1)?;
        let p = st.get("pos")?;
        let (x, y) = (p["x"].as_f64()?, p["y"].as_f64()?);
        let r = 0.028575_f64.max(0.0); // WPA default radius; fence tolerance below absorbs sets
        for s in &table.linear {
            let n = s.normal_2d();
            let (dx, dy) = (x - s.p1.x, y - s.p1.y);
            let d = n.x * dx + n.y * dy;
            let (ex, ey) = (s.p2.x - s.p1.x, s.p2.y - s.p1.y);
            let t = (dx * ex + dy * ey) / (ex * ex + ey * ey);
            if (-0.05..=1.05).contains(&t) && d > 0.0 && d < r + 0.003 {
                return Some(format!("linear nose, plane d = {:.3} mm", d * 1000.0));
            }
        }
        for a in &table.circular {
            let rho = ((x - a.center.x).powi(2) + (y - a.center.y).powi(2)).sqrt();
            let gap = rho - a.radius;
            if gap > -0.001 && gap < r + 0.003 {
                return Some(format!("jaw arc, gap = {:.3} mm", gap * 1000.0));
            }
        }
    }
    None
}

// -------------------------------------------------------------- rows ----

struct Row {
    artifact: String,
    verdict: &'static str,
    detail: String,
}

fn scan_file(rel: &str, root: &Path, rows: &mut Vec<Row>, blocking: &mut u32) {
    let text = std::fs::read_to_string(root.join(rel)).expect("artifact readable");
    let v: Value = serde_json::from_str(&text).expect("artifact is JSON");
    let loaded = if v.get("oracle").is_some() && v.get("scenario").is_some() {
        load_oracle_fixture(&v)
    } else {
        load_artifact(&v)
    };
    let Some(l) = loaded else {
        rows.push(Row {
            artifact: rel.to_string(),
            verdict: "NO-GEOMETRY",
            detail: "no re-simulable scenario (suite-covered)".to_string(),
        });
        return;
    };
    scan_loaded(rel, l, rows, blocking);
}

fn scan_loaded(rel: &str, l: Loaded, rows: &mut Vec<Row>, blocking: &mut u32) {
    if let Some(seat) = l.options_raw.get("rail_seat") {
        rows.push(Row {
            artifact: rel.to_string(),
            verdict: "EXPLICIT-SEAT-PIN",
            detail: format!("pins rail_seat = {seat} — flip-immune by construction"),
        });
        return;
    }
    let planar = events_values(
        &l.system,
        &l.shot,
        &opts_with_seat(&l.options_raw, RailSeat::Planar),
    );
    let nose = events_values(
        &l.system,
        &l.shot,
        &opts_with_seat(&l.options_raw, RailSeat::NoseContact),
    );
    let mut detail = String::new();
    if let Some(pinned) = &l.pinned_events {
        match first_diff(&planar, pinned) {
            None => detail.push_str("planar resim == pinned stream; "),
            Some(i) => detail.push_str(&format!(
                "PRE-EXISTING-PIN-DRIFT (planar resim != pin at event {i}, \
                 {} vs {} — predates 021); ",
                kind_name(planar.get(i)),
                kind_name(pinned.get(i)),
            )),
        }
    }
    match first_diff(&planar, &nose) {
        None => rows.push(Row {
            artifact: rel.to_string(),
            verdict: "PROVEN-BYTE-IDENTICAL",
            detail: format!("{detail}{} events equal planar vs nose-contact", planar.len()),
        }),
        Some(i) => {
            let table = &l.system.table;
            let prox = rail_proximity(nose.get(i), table)
                .or_else(|| rail_proximity(planar.get(i), table))
                // end-of-stream divergence: check the last common event.
                .or_else(|| {
                    (i > 0).then(|| rail_proximity(nose.get(i - 1), table)).flatten()
                });
            match prox {
                Some(why) => rows.push(Row {
                    artifact: rel.to_string(),
                    verdict: "DIVERGES-RAIL-FROZEN",
                    detail: format!(
                        "{detail}first divergent event [{i}]: {} -> {} ({why}); \
                         {} -> {} events",
                        kind_name(planar.get(i)),
                        kind_name(nose.get(i)),
                        planar.len(),
                        nose.len(),
                    ),
                }),
                None => {
                    *blocking += 1;
                    rows.push(Row {
                        artifact: rel.to_string(),
                        verdict: "DIVERGES-OUT-OF-FAMILY",
                        detail: format!(
                            "{detail}first divergent event [{i}]: {} -> {} with NO \
                             rail-proximate ball — BLOCKS the flip (honesty rule)",
                            kind_name(planar.get(i)),
                            kind_name(nose.get(i)),
                        ),
                    });
                }
            }
        }
    }
}

fn walk_json(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(read) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in read.flatten() {
        let p = entry.path();
        if p.is_dir() {
            walk_json(&p, out);
        } else if p.extension().is_some_and(|e| e == "json") {
            out.push(p);
        }
    }
}

// -------------------------------------------------- rail-hugger fixture ----

/// The +x long rail's head-half main segment — the anchors-suite
/// standard-scenario rig (benches/rail_hugger.rs).
fn plus_x_head_rail(table: &Table) -> LinearCushionSegment {
    *table
        .linear
        .iter()
        .find(|s| {
            let n = s.normal_2d();
            let (dx, dy) = (s.p2.x - s.p1.x, s.p2.y - s.p1.y);
            n.x < -0.999 && (dx * dx + dy * dy).sqrt() > 0.5 && s.p1.y + s.p2.y < 0.0
        })
        .expect("WPA table has a +x head-half main rail")
}

/// Write scripts/fixtures/rail_hugger_scenario.json: the T014/T020
/// rail-hugger stress shot (CB via `frozen_seat` on a long rail, θ = 25°,
/// v0 = 4 m/s, realistic preset, the flipped NoseContact default) for the
/// scripts/bench-wasm.mjs stress row. Placement via the `frozen_seat`
/// helper — never a hand-derived constant (quickstart §6 rule).
fn dump_rail_hugger(root: &Path) {
    const R: f64 = 0.028575;
    let table = Table::wpa_9ft(R);
    let rail = plus_x_head_rail(&table);
    let span = (-0.9 - rail.p1.y) / (rail.p2.y - rail.p1.y);
    let pos = rail.frozen_seat(R, span);
    let system = SystemState {
        balls: vec![Ball {
            id: BallId(0),
            params: BallParams::default(),
            state: BallState {
                pos,
                vel: Vec3::ZERO,
                avel: Vec3::ZERO,
                motion: MotionState::Stationary,
                pinch: None,
            },
        }],
        table,
        equipment: Default::default(),
    };
    let shot = ShotParams {
        v0: 4.0,
        phi: std::f64::consts::FRAC_PI_2,
        theta: 25.0_f64.to_radians(),
        a: 0.0,
        b: 0.0,
        seed: 0,
    };
    let payload = json!({
        "name": "rail_hugger_stress",
        "description": "Feature 021 rail-hugger stress shot (tasks T014/T020): \
            CB frozen to the +x long rail via LinearCushionSegment::frozen_seat, \
            struck parallel at theta = 25 deg, v0 = 4 m/s, realistic preset, \
            NoseContact default — the maximal hop-event-count configuration. \
            Generated by `cargo run -p pool-core --release --example \
            rail_seat_scan -- --dump-rail-hugger`; regenerate, never hand-edit.",
        "system": system,
        "shot": shot,
        "options": SimOptions::realistic(),
    });
    let path = root.join("scripts/fixtures/rail_hugger_scenario.json");
    std::fs::write(&path, serde_json::to_string_pretty(&payload).unwrap())
        .expect("fixture written");
    println!("wrote {}", path.display());
}

// -------------------------------------------------------------- main ----

fn main() {
    let root = repo_root();
    if std::env::args().any(|a| a == "--dump-rail-hugger") {
        dump_rail_hugger(&root);
        return;
    }

    let mut rows: Vec<Row> = Vec::new();
    let mut blocking = 0u32;

    // Class 1: kernel goldens / pinned records / scenarios / oracle
    // fixtures (crates/pool-core/tests/fixtures, recursive).
    // Class 2: wasm fixtures (crates/pool-wasm/tests/fixtures).
    // Class 3: the internal verification records (skipped when absent).
    let mut files = Vec::new();
    for dir in [
        "crates/pool-core/tests/fixtures",
        "crates/pool-wasm/tests/fixtures",
        "docs/verification/records",
    ] {
        walk_json(&root.join(dir), &mut files);
    }
    files.sort();
    for f in &files {
        let rel = f.strip_prefix(&root).unwrap().to_string_lossy().to_string();
        scan_file(&rel, &root, &mut rows, &mut blocking);
    }

    // Class 4: showcase break-scrub record — a reshoot RECIPE (kernel +
    // seed + shot + equipment); divergence decided by re-simulating the
    // recipe (prescan RESIM-ONLY class).
    {
        let v: Value = serde_json::from_str(
            &std::fs::read_to_string(root.join("site/assets/break-scrub/record.json"))
                .expect("break-scrub record"),
        )
        .expect("break-scrub JSON");
        let spec: EquipmentSpec =
            serde_json::from_value(v["equipment"].clone()).expect("recipe equipment spec");
        let resolved = EquipmentCatalog::get()
            .resolve(&spec)
            .expect("recipe equipment resolves");
        let seed = v["seed"].as_u64().expect("recipe seed");
        let system = resolved.fifteen_ball_rack(seed);
        let shot = ShotParams {
            v0: v["shot"]["v0"].as_f64().unwrap(),
            phi: v["shot"]["phi"].as_f64().unwrap(),
            theta: v["shot"]["theta"].as_f64().unwrap(),
            a: v["shot"]["a"].as_f64().unwrap(),
            b: v["shot"]["b"].as_f64().unwrap(),
            seed,
        };
        scan_loaded(
            "site/assets/break-scrub/record.json (reshoot recipe)",
            Loaded {
                system,
                shot,
                options_raw: serde_json::to_value(resolved.options).unwrap(),
                pinned_events: None,
            },
            &mut rows,
            &mut blocking,
        );
    }

    // ----- report (markdown ledger body for rail-liftoff-cascade.md) -----
    println!("| artifact | verdict | first divergence / note |");
    println!("|---|---|---|");
    for r in &rows {
        println!("| {} | {} | {} |", r.artifact, r.verdict, r.detail);
    }
    let count = |v: &str| rows.iter().filter(|r| r.verdict == v).count();
    println!();
    println!("Summary:");
    println!("- PROVEN-BYTE-IDENTICAL: {}", count("PROVEN-BYTE-IDENTICAL"));
    println!("- DIVERGES-RAIL-FROZEN: {}", count("DIVERGES-RAIL-FROZEN"));
    println!("- DIVERGES-OUT-OF-FAMILY: {}", count("DIVERGES-OUT-OF-FAMILY"));
    println!("- EXPLICIT-SEAT-PIN: {}", count("EXPLICIT-SEAT-PIN"));
    println!("- NO-GEOMETRY (suite-covered): {}", count("NO-GEOMETRY"));
    println!(
        "- seat depth (WPA pool): {:.3} mm",
        nose_seat_depth(0.635 * 2.0 * 0.028575, 0.028575) * 1000.0
    );
    if blocking > 0 {
        eprintln!("{blocking} OUT-OF-FAMILY divergence(s) — the flip BLOCKS (honesty rule)");
        std::process::exit(1);
    }
}
