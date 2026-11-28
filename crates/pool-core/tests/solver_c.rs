// Copyright (c) Meta Platforms, Inc. and affiliates.

//! SOLVER-C corpus differential, scenario harvest, and release speed indicator.
//! Run ignored tests explicitly with SOLVER_C_CORPUS set to the prepared corpus.

#[allow(dead_code)]
#[path = "../src/math/roots_adapter.rs"]
mod adapter;
#[allow(dead_code)]
#[path = "../../pool-cli/src/scenario.rs"]
mod scenario;

use pool_core::evolve::{evolve_ball, next_transition, position_poly};
use pool_core::sim::detect::{
    ball_ball_time, ball_ball_time_in, ball_pocket_time, ball_pocket_time_in,
};
use pool_core::table::Pocket;
use pool_core::{simulate, MotionState, PosPoly, Vec3};
use serde_json::json;
use std::fs::{self, File};
use std::hint::black_box;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::time::Instant;

const REST_APPROACH: f64 = 1e-5;

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn corpus() -> PathBuf {
    PathBuf::from(std::env::var("SOLVER_C_CORPUS").expect("set SOLVER_C_CORPUS"))
}

fn output() -> PathBuf {
    let dir = root().join("target/solver-c2/corpus");
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn scenario_corpus(name: &str) -> PathBuf {
    let local = output().join(name);
    if local.exists() {
        local
    } else {
        corpus().join(name)
    }
}

fn poly(v: &[f64]) -> PosPoly {
    PosPoly {
        c0: Vec3::new(v[0], v[1], v[2]),
        c1: Vec3::new(v[3], v[4], v[5]),
        c2: Vec3::new(v[6], v[7], v[8]),
    }
}

fn values(p: &PosPoly) -> [f64; 9] {
    [
        p.c0.x, p.c0.y, p.c0.z, p.c1.x, p.c1.y, p.c1.z, p.c2.x, p.c2.y, p.c2.z,
    ]
}

fn rows<const N: usize>(path: &Path) -> Vec<[f64; N]> {
    let bytes = fs::read(path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    assert_eq!(bytes.len() % (N * 8), 0, "truncated corpus");
    bytes
        .chunks_exact(N * 8)
        .map(|row| {
            std::array::from_fn(|i| f64::from_le_bytes(row[8 * i..8 * i + 8].try_into().unwrap()))
        })
        .collect()
}

fn write_row(out: &mut impl Write, row: &[f64]) {
    for v in row {
        out.write_all(&v.to_le_bytes()).unwrap();
    }
}

fn pair_args(row: &[f64; 21]) -> (PosPoly, PosPoly, f64, f64, f64) {
    (poly(row), poly(&row[9..]), row[18], row[19], row[20])
}

fn pocket_args(row: &[f64; 13]) -> (PosPoly, Pocket, f64) {
    (
        poly(row),
        Pocket {
            center: Vec3::new(row[9], row[10], 0.0),
            radius: row[11],
        },
        row[12],
    )
}

/// Mirrors ONLY the unchanged detection geometry/guard operations, in their
/// original order. Both root arms use the same rounded polynomial coefficients.
fn pair_eval(row: &[f64; 21], exact: bool) -> (Option<f64>, bool) {
    pair_eval_in(row, exact, f64::INFINITY)
}

fn pair_eval_in(row: &[f64; 21], exact: bool, hi: f64) -> (Option<f64>, bool) {
    let (a, b, ra, rb, lo) = pair_args(row);
    let distance = ra + rb;
    let gap = a.c0 - b.c0;
    if gap.norm_sq() < distance * distance {
        return (
            (gap.dot(a.c1 - b.c1) < -REST_APPROACH * distance).then_some(lo),
            false,
        );
    }
    let dist = gap.norm();
    let sep = dist - distance;
    let approach = -gap.dot(a.c1 - b.c1) / dist;
    if approach > REST_APPROACH && sep <= approach * lo {
        return (Some(lo), false);
    }
    let (ca, cb, cc) = (a.c2 - b.c2, a.c1 - b.c1, a.c0 - b.c0);
    let c = [
        cc.dot(cc) - distance * distance,
        2.0 * cb.dot(cc),
        cb.dot(cb) + 2.0 * ca.dot(cc),
        2.0 * ca.dot(cb),
        ca.dot(ca),
    ];
    let t = if exact {
        adapter::gap_candidate_exact(&c, distance, 1.0, lo, hi)
    } else {
        adapter::ball_ball(&[c[4], c[3], c[2], c[1], c[0]], distance, lo, hi)
    };
    (t, true)
}

fn pocket_eval(row: &[f64; 13], exact: bool) -> (Option<f64>, bool) {
    pocket_eval_in(row, exact, f64::INFINITY)
}

fn pocket_eval_in(row: &[f64; 13], exact: bool, hi: f64) -> (Option<f64>, bool) {
    let (p, pocket, lo) = pocket_args(row);
    let (dx, dy) = (p.c0.x - pocket.center.x, p.c0.y - pocket.center.y);
    let rho = libm::sqrt(dx * dx + dy * dy);
    let approach = -(dx * p.c1.x + dy * p.c1.y) / rho;
    let gap = rho - pocket.radius;
    if gap <= 0.0 || (approach > REST_APPROACH && gap <= approach * lo) {
        return (Some(lo), false);
    }
    let (ax, ay, bx, by, px, py, cx, cy, d) = (
        p.c2.x,
        p.c2.y,
        p.c1.x,
        p.c1.y,
        p.c0.x,
        p.c0.y,
        pocket.center.x,
        pocket.center.y,
        pocket.radius,
    );
    let k = [
        0.5 * (ax * ax + ay * ay),
        ax * bx + ay * by,
        ax * (px - cx) + ay * (py - cy) + 0.5 * (bx * bx + by * by),
        bx * (px - cx) + by * (py - cy),
        0.5 * (cx * cx + cy * cy + px * px + py * py - d * d) - (px * cx + py * cy),
    ];
    let t = if exact {
        adapter::gap_candidate_exact(&[k[4], k[3], k[2], k[1], k[0]], d, 0.5, lo, hi)
    } else {
        adapter::pocket(&k, d, lo, hi)
    };
    (t, true)
}

fn pair_actual(row: &[f64; 21]) -> Option<f64> {
    let (a, b, ra, rb, lo) = pair_args(row);
    ball_ball_time(&a, &b, ra, rb, lo)
}

fn pocket_actual(row: &[f64; 13]) -> Option<f64> {
    let (p, pk, lo) = pocket_args(row);
    ball_pocket_time(&p, &pk, lo)
}

fn compare<const N: usize>(
    name: &str,
    input: &[[f64; N]],
    eval: impl Fn(&[f64; N], bool) -> (Option<f64>, bool),
    actual: impl Fn(&[f64; N]) -> Option<f64>,
) {
    let mut counts = [0_u64; 17];
    let (mut adapter_calls, mut exact_calls) = (0_u64, 0_u64);
    let start = Instant::now();
    adapter::take_filter_counts();
    for (i, row) in input.iter().enumerate() {
        let (new, reached) = eval(row, false);
        let trace = adapter::take_filter_counts();
        for (sum, n) in counts.iter_mut().zip(trace) {
            *sum += n;
        }
        adapter_calls += u64::from(reached);
        exact_calls += u64::from(trace[4] != 0 || trace[5] != 0);
        let (old, _) = eval(row, true);
        assert_eq!(
            new.map(f64::to_bits),
            old.map(f64::to_bits),
            "{name}:{i} {row:?}"
        );
        assert_eq!(
            new.map(f64::to_bits),
            actual(row).map(f64::to_bits),
            "production {name}:{i}"
        );
        if i % 100_000 == 99_999 {
            eprintln!(
                "{name}: {}/{} ({:.1}s)",
                i + 1,
                input.len(),
                start.elapsed().as_secs_f64()
            );
        }
    }
    println!(
        "{}",
        json!({"corpus":name,"n":input.len(),"mismatches":0,
        "adapter_calls":adapter_calls,"exact_calls":exact_calls,"filters":counts,
        "seconds":start.elapsed().as_secs_f64()})
    );
}

#[test]
#[ignore = "external frozen corpus; run explicitly under the host lease"]
fn solver_c_pair_corpora() {
    let dir = corpus();
    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(dir.join("manifest.json")).unwrap()).unwrap();
    for row in manifest.as_array().unwrap() {
        let name = Path::new(row["output"].as_str().unwrap())
            .file_name()
            .unwrap();
        if std::env::var("SOLVER_C_SELECT").is_ok_and(|s| !name.to_string_lossy().contains(&s)) {
            continue;
        }
        let data = rows::<21>(&dir.join(name));
        assert_eq!(data.len() as u64, row["count"].as_u64().unwrap());
        compare(&name.to_string_lossy(), &data, pair_eval, pair_actual);
    }
}

const SCENARIOS: &[&str] = &[
    "docs/sdk/scenarios/bank.json",
    "docs/sdk/scenarios/break.json",
    "docs/sdk/scenarios/cut_side.json",
    "docs/sdk/scenarios/draw.json",
    "docs/sdk/scenarios/jump.json",
    "docs/sdk/scenarios/kick.json",
    "docs/sdk/scenarios/lag.json",
    "docs/sdk/scenarios/masse.json",
    "crates/pool-core/tests/fixtures/scenarios/bank_two_cushion.json",
    "crates/pool-core/tests/fixtures/scenarios/cut_30_side.json",
    "crates/pool-core/tests/fixtures/scenarios/draw_shot.json",
    "crates/pool-core/tests/fixtures/scenarios/straight_pot.json",
    "crates/pool-core/tests/fixtures/scenarios/three_ball_chain.json",
];

#[test]
#[ignore = "scenario corpus generation; run explicitly under the host lease"]
fn solver_c_harvest() {
    let dir = output();
    let mut pair_out = BufWriter::new(File::create(dir.join("scenario-pairs.bin")).unwrap());
    let mut pocket_out = BufWriter::new(File::create(dir.join("scenario-pockets.bin")).unwrap());
    let mut pair_windows =
        BufWriter::new(File::create(dir.join("scenario-pair-windows.bin")).unwrap());
    let mut pocket_windows =
        BufWriter::new(File::create(dir.join("scenario-pocket-windows.bin")).unwrap());
    let mut summary = Vec::new();
    for path in SCENARIOS {
        for seed in [0, 1, 7, 42] {
            let sc = scenario::load(root().join(path).to_str().unwrap(), None, None, Some(seed))
                .unwrap();
            let rec = simulate(&sc.system, &sc.shot, &sc.options).unwrap();
            let mut balls = rec.initial.balls.clone();
            let mut last = 0.0;
            let (mut pairs, mut pockets) = (0, 0);
            for event in &rec.events {
                for ball in &mut balls {
                    ball.state = evolve_ball(&ball.state, &ball.params, event.t - last);
                }
                for (id, state) in &event.post {
                    balls.iter_mut().find(|ball| ball.id == *id).unwrap().state = *state;
                }
                last = event.t;
                for (i, ball) in balls.iter().enumerate() {
                    if matches!(ball.state.motion, MotionState::Pocketed) {
                        continue;
                    }
                    let p = position_poly(&ball.state, &ball.params);
                    let horizon = |b: &pool_core::Ball| {
                        next_transition(&b.state, &b.params).map_or(f64::INFINITY, |(dt, _)| {
                            ((last + dt).next_up() - last).next_up()
                        })
                    };
                    if matches!(
                        ball.state.motion,
                        MotionState::Sliding | MotionState::Rolling
                    ) {
                        for pocket in &sc.system.table.pockets {
                            let mut row = values(&p).to_vec();
                            row.extend([
                                pocket.center.x,
                                pocket.center.y,
                                pocket.radius,
                                pool_core::consts::Eps::TIME,
                            ]);
                            write_row(&mut pocket_out, &row);
                            write_row(&mut pocket_windows, &[horizon(ball)]);
                            pockets += 1;
                        }
                    }
                    for other in &balls[i + 1..] {
                        let moving = |s| {
                            matches!(
                                s,
                                MotionState::Sliding | MotionState::Rolling | MotionState::Airborne
                            )
                        };
                        if other.state.motion == MotionState::Pocketed
                            || !(moving(ball.state.motion) || moving(other.state.motion))
                        {
                            continue;
                        }
                        let mut row = values(&p).to_vec();
                        row.extend(values(&position_poly(&other.state, &other.params)));
                        row.extend([ball.params.r, other.params.r, pool_core::consts::Eps::TIME]);
                        write_row(&mut pair_out, &row);
                        write_row(&mut pair_windows, &[horizon(ball).min(horizon(other))]);
                        pairs += 1;
                    }
                }
            }
            let row = json!({"scenario":path,"seed":seed,"events":rec.events.len(),"pairs":pairs,"pockets":pockets});
            println!("{row}");
            summary.push(row);
        }
    }
    pair_out.flush().unwrap();
    pocket_out.flush().unwrap();
    pair_windows.flush().unwrap();
    pocket_windows.flush().unwrap();
    fs::write(
        dir.join("scenario-manifest.json"),
        serde_json::to_vec_pretty(&summary).unwrap(),
    )
    .unwrap();
}

#[test]
#[ignore = "scenario corpus differential; run explicitly under the host lease"]
fn solver_c_scenario_corpora() {
    compare(
        "scenario-pairs",
        &rows::<21>(&scenario_corpus("scenario-pairs.bin")),
        pair_eval,
        pair_actual,
    );
    compare(
        "scenario-pockets",
        &rows::<13>(&scenario_corpus("scenario-pockets.bin")),
        pocket_eval,
        pocket_actual,
    );
}

fn median_ns<const N: usize>(input: &[[f64; N]], call: impl Fn(&[f64; N]) -> Option<f64>) -> f64 {
    let mut samples = Vec::new();
    for _ in 0..11 {
        let start = Instant::now();
        let mut n = 0;
        loop {
            for row in input {
                black_box(call(black_box(row)));
            }
            n += input.len();
            if start.elapsed().as_millis() >= 150 {
                break;
            }
        }
        samples.push(start.elapsed().as_nanos() as f64 / n as f64);
    }
    samples.sort_by(f64::total_cmp);
    samples[samples.len() / 2]
}

#[test]
#[ignore = "release microbench; run under the lease"]
fn solver_c_speed() {
    assert!(!black_box(cfg!(debug_assertions)), "release build required");
    let dir = corpus();
    let arm = "NEW";
    for name in ["fcorpus-v1_f-07.rec.bin", "scenario-pairs.bin"] {
        let data = rows::<21>(&if name.starts_with("scenario-") {
            scenario_corpus(name)
        } else {
            dir.join(name)
        });
        println!(
            "{}",
            json!({"arm":arm,"site":"ball_ball_time","corpus":name,"n":data.len(),"median_ns":median_ns(&data,pair_actual)})
        );
    }
    let data = rows::<13>(&scenario_corpus("scenario-pockets.bin"));
    println!(
        "{}",
        json!({"arm":arm,"site":"ball_pocket_time","corpus":"scenario-pockets","n":data.len(),"median_ns":median_ns(&data,pocket_actual)})
    );
    for path in [
        "docs/sdk/scenarios/break.json",
        "docs/sdk/scenarios/cut_side.json",
    ] {
        let sc = scenario::load(root().join(path).to_str().unwrap(), None, None, None).unwrap();
        let mut samples = Vec::new();
        for _ in 0..11 {
            let start = Instant::now();
            for _ in 0..20 {
                black_box(simulate(black_box(&sc.system), &sc.shot, &sc.options).unwrap());
            }
            samples.push(start.elapsed().as_nanos() as f64 / 20.0);
        }
        samples.sort_by(f64::total_cmp);
        println!(
            "{}",
            json!({"arm":arm,"site":"whole-shot","corpus":path,"n":220,"median_ns":samples[5]})
        );
    }
}

#[test]
#[ignore = "random near-graze geometry; run explicitly under the host lease"]
fn solver_c_random_grazes() {
    let mut state = 0x489d_63be_27af_0001_u64;
    let mut uniform = || {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        (state >> 11) as f64 / 9007199254740992.0
    };
    let mut pairs = Vec::new();
    let mut pockets = Vec::new();
    for i in 0..1024 {
        let d = 0.02 + 0.1 * uniform();
        let speed = 0.01 + 5.0 * uniform();
        let m = 0.05 + 2.0 * uniform();
        let mut offset = d + match i % 4 {
            0 => 0.0,
            1 => 1e-12,
            2 => 1e-12 * uniform(),
            _ => -1e-12 * uniform(),
        };
        for _ in 0..i % 5 {
            offset = if i % 2 == 0 {
                offset.next_up()
            } else {
                offset.next_down()
            };
        }
        // The transverse component controls the minimum distance directly.
        // A quadratic transverse path gives quartic stationary cases as well.
        let acceleration = if i % 2 == 0 { 0.0 } else { uniform() };
        let p = PosPoly {
            c0: Vec3::new(-speed * m, offset + acceleration * m * m, 0.0),
            c1: Vec3::new(speed, -2.0 * acceleration * m, 0.0),
            c2: Vec3::new(0.0, acceleration, 0.0),
        };
        for lo in [0.0, 1e-9, m.next_down(), m, m.next_up()] {
            let mut pair = [0.0; 21];
            pair[..9].copy_from_slice(&values(&p));
            pair[18] = d * 0.5;
            pair[19] = d * 0.5;
            pair[20] = lo;
            pairs.push(pair);
            let mut pocket = [0.0; 13];
            pocket[..9].copy_from_slice(&values(&p));
            pocket[11] = d;
            pocket[12] = lo;
            pockets.push(pocket);
        }
    }
    compare("random-near-graze-pairs", &pairs, pair_eval, pair_actual);
    compare(
        "random-near-graze-pockets",
        &pockets,
        pocket_eval,
        pocket_actual,
    );
}

/// Two-build regression: first export with the saved unbounded event loop,
/// then compare these complete serialized events with the production build.
#[test]
#[ignore = "two-build full event-log comparison; see target/solver-c2 baseline"]
fn solver_c_event_logs() {
    let dir = root().join("target/solver-c2/events-unbounded");
    fs::create_dir_all(&dir).unwrap();
    let export = std::env::var_os("SOLVER_C_EXPORT_EVENTS").is_some();
    let mut shots = 0;
    let mut events = 0;
    for (i, path) in SCENARIOS.iter().enumerate() {
        for seed in [0, 1, 7, 42] {
            for variant in
                0..if path.ends_with("/break.json") || path.ends_with("/three_ball_chain.json") {
                    4
                } else {
                    1
                }
            {
                let mut sc =
                    scenario::load(root().join(path).to_str().unwrap(), None, None, Some(seed))
                        .unwrap();
                if variant > 0 {
                    sc.shot.v0 = (sc.shot.v0 * [1.0, 0.5, 1.5, 2.0][variant]).min(15.0);
                    if path.ends_with("/break.json") && variant == 3 {
                        sc.system = pool_core::SystemState::fifteen_ball_rack(seed);
                    }
                }
                let record = simulate(&sc.system, &sc.shot, &sc.options).unwrap();
                let bytes = serde_json::to_vec(&record.events).unwrap();
                let file = dir.join(format!("{i}-{seed}-{variant}.json"));
                if export {
                    fs::write(file, &bytes).unwrap();
                } else {
                    let expected = fs::read(file).expect("export the unbounded baseline first");
                    assert!(
                        bytes == expected,
                        "event-log mismatch: {path} seed={seed} variant={variant}"
                    );
                }
                events += record.events.len();
                shots += 1;
            }
        }
    }
    println!(
        "{}",
        json!({"event_log_shots":shots,"events":events,"export":export,"mismatches":0})
    );
}

fn window_pairs() -> Vec<[f64; 22]> {
    let data = rows::<21>(&scenario_corpus("scenario-pairs.bin"));
    let windows = rows::<1>(&scenario_corpus("scenario-pair-windows.bin"));
    assert_eq!(data.len(), windows.len());
    data.iter()
        .zip(windows)
        .map(|(r, hi)| {
            let mut row = [0.0; 22];
            row[..21].copy_from_slice(r);
            row[21] = hi[0];
            row
        })
        .collect()
}

fn window_pockets() -> Vec<[f64; 14]> {
    let data = rows::<13>(&scenario_corpus("scenario-pockets.bin"));
    let windows = rows::<1>(&scenario_corpus("scenario-pocket-windows.bin"));
    assert_eq!(data.len(), windows.len());
    data.iter()
        .zip(windows)
        .map(|(r, hi)| {
            let mut row = [0.0; 14];
            row[..13].copy_from_slice(r);
            row[13] = hi[0];
            row
        })
        .collect()
}

fn pair_window_actual(row: &[f64; 22]) -> Option<f64> {
    let (a, b, ra, rb, lo) = pair_args(row[..21].try_into().unwrap());
    ball_ball_time_in(&a, &b, ra, rb, lo, row[21])
}
fn pocket_window_actual(row: &[f64; 14]) -> Option<f64> {
    let (p, pk, lo) = pocket_args(row[..13].try_into().unwrap());
    ball_pocket_time_in(&p, &pk, lo, row[13])
}

#[test]
#[ignore = "finite-horizon scenario corpus differential"]
fn solver_c_window_corpora() {
    compare(
        "scenario-pairs-bounded",
        &window_pairs(),
        |r, e| pair_eval_in(r[..21].try_into().unwrap(), e, r[21]),
        pair_window_actual,
    );
    compare(
        "scenario-pockets-bounded",
        &window_pockets(),
        |r, e| pocket_eval_in(r[..13].try_into().unwrap(), e, r[13]),
        pocket_window_actual,
    );
}

#[test]
#[ignore = "release bounded-window microbench"]
fn solver_c_window_speed() {
    assert!(!black_box(cfg!(debug_assertions)), "release build required");
    let arm = "NEW";
    let pairs = window_pairs();
    let pockets = window_pockets();
    println!(
        "{}",
        json!({"arm":arm,"site":"ball_ball_time-bounded","n":pairs.len(),"median_ns":median_ns(&pairs,pair_window_actual)})
    );
    println!(
        "{}",
        json!({"arm":arm,"site":"ball_pocket_time-bounded","n":pockets.len(),"median_ns":median_ns(&pockets,pocket_window_actual)})
    );
}

fn profile_corpus<const N: usize>(name: &str, data: &[[f64; N]], eval: impl Fn(&[f64; N])) {
    adapter::take_profile();
    adapter::take_filter_counts();
    adapter::take_counterfactual();
    adapter::profile_enable(true);
    let start = Instant::now();
    for row in data {
        eval(row);
    }
    let elapsed = start.elapsed().as_nanos();
    adapter::profile_enable(false);
    println!(
        "{}",
        json!({"profile":name,"n":data.len(),"elapsed_ns":elapsed,"filters":adapter::take_filter_counts(),"call_count_and_ns":adapter::take_profile(),"screen_counterfactual":adapter::take_counterfactual()})
    );
}

#[test]
#[ignore = "diagnostic timings include test-only timer overhead"]
fn solver_c_profile() {
    profile_corpus(
        "fcorpus-pairs",
        &rows::<21>(&corpus().join("fcorpus-v1_f-07.rec.bin")),
        |r| {
            black_box(pair_eval(r, false));
        },
    );
    profile_corpus(
        "scenario-pairs",
        &rows::<21>(&scenario_corpus("scenario-pairs.bin")),
        |r| {
            black_box(pair_eval(r, false));
        },
    );
    profile_corpus(
        "scenario-pockets",
        &rows::<13>(&scenario_corpus("scenario-pockets.bin")),
        |r| {
            black_box(pocket_eval(r, false));
        },
    );
    let pairs = window_pairs();
    let pockets = window_pockets();
    profile_corpus("scenario-pairs-bounded", &pairs, |r| {
        black_box(pair_eval_in(r[..21].try_into().unwrap(), false, r[21]));
    });
    profile_corpus("scenario-pockets-bounded", &pockets, |r| {
        black_box(pocket_eval_in(r[..13].try_into().unwrap(), false, r[13]));
    });
    for (name, mut windows) in [
        (
            "pairs",
            pairs.iter().map(|r| r[21] - r[20]).collect::<Vec<_>>(),
        ),
        ("pockets", pockets.iter().map(|r| r[13] - r[12]).collect()),
    ] {
        let total = windows.len();
        windows.retain(|v| v.is_finite());
        windows.sort_by(f64::total_cmp);
        println!(
            "{}",
            json!({"windows":name,"total":total,"finite":windows.len(),"min":windows[0],"median":windows[windows.len()/2],"p95":windows[windows.len()*95/100],"max":windows[windows.len()-1]})
        );
    }
}

const FAMILIES: &[(&str, &str)] = &[
    ("break", "docs/sdk/scenarios/break.json"),
    (
        "cluster",
        "crates/pool-core/tests/fixtures/scenarios/three_ball_chain.json",
    ),
    ("cut", "docs/sdk/scenarios/cut_side.json"),
    (
        "graze-heavy",
        "crates/pool-core/tests/fixtures/scenarios/cut_30_side.json",
    ),
    (
        "pocket-heavy",
        "crates/pool-core/tests/fixtures/scenarios/straight_pot.json",
    ),
];

fn family(index: usize, seed: u64) -> scenario::Scenario {
    let mut sc = scenario::load(
        root().join(FAMILIES[index].1).to_str().unwrap(),
        None,
        None,
        Some(seed),
    )
    .unwrap();
    let r = sc.system.balls[0].params.r;
    match index {
        1 => {
            // Frozen object pair, struck along its contact normal.
            for (i, b) in sc.system.balls.iter_mut().enumerate() {
                b.state.pos = Vec3::new(0.0, [-0.4, 0.0, 2.0 * r][i], r);
            }
            sc.shot.a = 0.0;
            sc.shot.b = 0.0;
        }
        3 => {
            // Six consecutive near-grazes on a straight centerline shot.
            let template = sc.system.balls[1];
            sc.system.balls.truncate(1);
            sc.system.balls[0].state.pos = Vec3::new(-0.5, 0.0, r);
            for i in 0..6 {
                let mut b = template;
                b.id = pool_core::BallId(i + 1);
                let side = if i % 2 == 0 { 1.0 } else { -1.0 };
                b.state.pos = Vec3::new(-0.3 + f64::from(i) * 0.14, side * (2.0 * r + 5e-13), r);
                sc.system.balls.push(b);
            }
            sc.shot.phi = 0.0;
            sc.shot.a = 0.0;
            sc.shot.b = 0.0;
            sc.shot.v0 = 2.0;
        }
        4 => {
            // One rolling ball approaches each pocket simultaneously.
            let template = sc.system.balls[1];
            sc.system.balls.truncate(1);
            sc.system.balls[0].state.pos = Vec3::new(0.0, 0.0, r);
            for (i, pocket) in sc.system.table.pockets.iter().enumerate() {
                let mut b = template;
                b.id = pool_core::BallId((i + 1) as u8);
                let center = Vec3::new(pocket.center.x, pocket.center.y, 0.0);
                let outward = center * (1.0 / center.norm());
                b.state.pos = center - outward * 0.25 + Vec3::new(0.0, 0.0, r);
                b.state.vel = outward * 0.8;
                b.state.avel = Vec3::new(-b.state.vel.y / r, b.state.vel.x / r, 0.0);
                b.state.motion = MotionState::Rolling;
                sc.system.balls.push(b);
            }
            sc.shot.phi = 0.0;
            sc.shot.a = 0.0;
            sc.shot.b = 0.0;
            sc.shot.v0 = 0.1;
        }
        _ => {}
    }
    sc
}

#[test]
#[ignore = "five-family full-event comparison between unbounded and bounded builds"]
fn solver_c_family_events() {
    let dir = root().join("target/solver-c2/events-unbounded");
    fs::create_dir_all(&dir).unwrap();
    let export = std::env::var_os("SOLVER_C_EXPORT_EVENTS").is_some();
    for (i, (name, path)) in FAMILIES.iter().enumerate() {
        let mut events = 0;
        for seed in [0, 1, 7, 42] {
            let sc = family(i, seed);
            let rec = simulate(&sc.system, &sc.shot, &sc.options).unwrap();
            let bytes = serde_json::to_vec(&rec.events).unwrap();
            let file = dir.join(format!("family-{i}-{seed}.json"));
            if export {
                fs::write(file, &bytes).unwrap();
            } else {
                assert!(
                    bytes == fs::read(file).expect("export unbounded family baseline first"),
                    "{name} seed={seed}"
                );
            }
            events += rec.events.len();
        }
        println!(
            "{}",
            json!({"family":name,"scenario":path,"shots":4,"events":events,"export":export,"mismatches":0})
        );
    }
}

#[test]
#[ignore = "five-family release speed indicator"]
fn solver_c_family_speed() {
    assert!(!black_box(cfg!(debug_assertions)), "release build required");
    let arm = "NEW";
    for (i, (name, path)) in FAMILIES.iter().enumerate() {
        let sc = family(i, 0);
        let events = simulate(&sc.system, &sc.shot, &sc.options)
            .unwrap()
            .events
            .len();
        let mut samples = Vec::new();
        for _ in 0..11 {
            let start = Instant::now();
            for _ in 0..20 {
                black_box(simulate(black_box(&sc.system), &sc.shot, &sc.options).unwrap());
            }
            samples.push(start.elapsed().as_nanos() as f64 / 20.0);
        }
        samples.sort_by(f64::total_cmp);
        println!(
            "{}",
            json!({"arm":arm,"family":name,"scenario":path,"n":220,"events":events,"median_ns":samples[5]})
        );
    }
}

#[test]
#[ignore = "every retained horizon candidate must preserve its unbounded bits"]
fn solver_c_window_prefix() {
    let mut pairs = 0;
    for row in window_pairs() {
        let args = row[..21].try_into().unwrap();
        let (full, reached) = pair_eval_in(args, true, f64::INFINITY);
        let bounded = pair_eval_in(args, false, row[21]).0;
        let expected = if reached {
            full.filter(|&t| t <= row[21])
        } else {
            full
        };
        assert_eq!(
            bounded.map(f64::to_bits),
            expected.map(f64::to_bits),
            "pair prefix {pairs}: {row:?}"
        );
        pairs += 1;
    }
    let mut pockets = 0;
    for row in window_pockets() {
        let args = row[..13].try_into().unwrap();
        let (full, reached) = pocket_eval_in(args, true, f64::INFINITY);
        let bounded = pocket_eval_in(args, false, row[13]).0;
        let expected = if reached {
            full.filter(|&t| t <= row[13])
        } else {
            full
        };
        assert_eq!(
            bounded.map(f64::to_bits),
            expected.map(f64::to_bits),
            "pocket prefix {pockets}: {row:?}"
        );
        pockets += 1;
    }
    println!(
        "{}",
        json!({"horizon_prefix_pairs":pairs,"horizon_prefix_pockets":pockets,"mismatches":0})
    );
}

#[test]
#[ignore = "C3 event explanations and pre-event state evidence"]
fn solver_c3_explanations() {
    let arm = "NEW";
    let dir = root().join("target/solver-c3/explanations").join(arm);
    fs::create_dir_all(&dir).unwrap();
    for i in [0, 3] {
        let sc = family(i, 0);
        let record = simulate(&sc.system, &sc.shot, &sc.options).unwrap();
        fs::write(
            dir.join(format!("{}.json", FAMILIES[i].0)),
            serde_json::to_vec(&record).unwrap(),
        )
        .unwrap();
        let mut balls = record.initial.balls.clone();
        let mut last = 0.0;
        let mut before = Vec::new();
        for event in &record.events {
            before.push(json!({"last":last,"event":event,"balls":balls}));
            for ball in &mut balls {
                ball.state = evolve_ball(&ball.state, &ball.params, event.t - last);
            }
            for (id, state) in &event.post {
                balls.iter_mut().find(|b| b.id == *id).unwrap().state = *state;
            }
            last = event.t;
        }
        fs::write(
            dir.join(format!("{}-before.json", FAMILIES[i].0)),
            serde_json::to_vec(&before).unwrap(),
        )
        .unwrap();
        println!(
            "{}",
            json!({"arm":arm,"family":FAMILIES[i].0,"events":record.events.len()})
        );
    }
}

#[test]
#[ignore = "requires both C3 explanation exports; diagnoses identical saved states"]
fn solver_c3_gap_evidence() {
    let mut evidence = Vec::new();
    for (arm, name) in [("OLD", "break"), ("NEW", "graze-heavy")] {
        let path = root().join(format!(
            "target/solver-c3/explanations/{arm}/{name}-before.json"
        ));
        let data: serde_json::Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
        for (index, row) in data.as_array().unwrap().iter().enumerate() {
            let Some(pair) = row["event"]["kind"].get("BallBall") else {
                continue;
            };
            let b1 = pair["b1"].as_u64().unwrap() as u8;
            let b2 = pair["b2"].as_u64().unwrap() as u8;
            let balls: Vec<pool_core::Ball> = serde_json::from_value(row["balls"].clone()).unwrap();
            let a = balls.iter().find(|b| b.id.0 == b1).unwrap();
            let b = balls.iter().find(|b| b.id.0 == b2).unwrap();
            let pa = position_poly(&a.state, &a.params);
            let pb = position_poly(&b.state, &b.params);
            let (ca, cb, cc) = (pa.c2 - pb.c2, pa.c1 - pb.c1, pa.c0 - pb.c0);
            let distance = a.params.r + b.params.r;
            let c = [
                cc.dot(cc) - distance * distance,
                2.0 * cb.dot(cc),
                cb.dot(cb) + 2.0 * ca.dot(cc),
                2.0 * ca.dot(cb),
                ca.dot(ca),
            ];
            let lo = pool_core::Eps::TIME;
            adapter::take_filter_counts();
            let new =
                adapter::ball_ball(&[c[4], c[3], c[2], c[1], c[0]], distance, lo, f64::INFINITY);
            let filters = adapter::take_filter_counts();
            let exact = adapter::gap_candidate_exact(&c, distance, 1.0, lo, f64::INFINITY);
            assert_eq!(new.map(f64::to_bits), exact.map(f64::to_bits));
            evidence.push(json!({"source_arm":arm,"family":name,"index":index,"last":row["last"],"event":row["event"],"c":c,"distance":distance,"position_a":values(&pa),"position_b":values(&pb),"new":new,"exact":exact,"ordinary_contact":kroots::earliest_root_in(&c,lo,f64::INFINITY),"filters":filters}));
        }
    }
    fs::write(
        root().join("target/solver-c3/gap-evidence.json"),
        serde_json::to_vec_pretty(&evidence).unwrap(),
    )
    .unwrap();
    let old_before: serde_json::Value = serde_json::from_slice(
        &fs::read(root().join("target/solver-c3/explanations/OLD/break-before.json")).unwrap(),
    )
    .unwrap();
    let extra = &old_before[76];
    assert_eq!(extra["event"]["kind"], json!({"BallBall":{"b1":1,"b2":4}}));
    let time = extra["event"]["t"].as_f64().unwrap();
    let last = extra["last"].as_f64().unwrap();
    let balls: Vec<pool_core::Ball> = serde_json::from_value(extra["balls"].clone()).unwrap();
    let a = balls.iter().find(|b| b.id.0 == 1).unwrap();
    let b = balls.iter().find(|b| b.id.0 == 4).unwrap();
    let pa = evolve_ball(&a.state, &a.params, time - last);
    let pb = evolve_ball(&b.state, &b.params, time - last);
    let gap = pa.pos - pb.pos;
    let new_record: pool_core::ShotRecord = serde_json::from_slice(
        &fs::read(root().join("target/solver-c3/explanations/NEW/break.json")).unwrap(),
    )
    .unwrap();
    let mut samples = Vec::new();
    new_record.sampler().sample_at(time, &mut samples);
    let na = samples.iter().find(|s| s.id.0 == 1).unwrap();
    let nb = samples.iter().find(|s| s.id.0 == 4).unwrap();
    let explanation = json!({"time":time,"balls":[1,4],"old_gap_m":gap.norm()-a.params.r-b.params.r,"old_approach_m_s":-gap.dot(pa.vel-pb.vel)/gap.norm(),"new_gap_at_old_time_m":(na.pos-nb.pos).norm()-a.params.r-b.params.r});
    fs::write(
        root().join("target/solver-c3/break-extra-event.json"),
        serde_json::to_vec_pretty(&explanation).unwrap(),
    )
    .unwrap();
    println!("{explanation}");
    println!(
        "{}",
        json!({"gap_evidence_cases":evidence.len(),"mismatches":0})
    );
}

#[test]
#[ignore = "C3 root API diagnostic on captured slow inputs"]
fn solver_c3_root_windows() {
    let path = root().join("target/solver-c3/jv2-profile.json");
    let profile: serde_json::Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
    let mut output = Vec::new();
    for row in profile.as_array().unwrap() {
        for (index, input) in row["slow_roots"].as_array().unwrap().iter().enumerate() {
            let c = std::array::from_fn(|i| input[i].as_f64().unwrap());
            let lo = input[5].as_f64().unwrap();
            // serde_json serializes the captured +infinity horizon as null.
            let hi = if input[6].is_null() {
                f64::INFINITY
            } else {
                input[6].as_f64().unwrap()
            };
            let expected = kroots::earliest_root_in(&c, lo, hi);
            let mut samples = Vec::new();
            for mode in 0..5 {
                let a = if mode == 3 {
                    expected.map_or(lo, |m| m.next_down().next_down())
                } else {
                    lo
                };
                let b = if mode >= 2 {
                    expected.map_or(hi, |m| m.next_up())
                } else {
                    hi
                };
                let start = Instant::now();
                for _ in 0..10 {
                    let result = if mode == 0 {
                        kroots::real_roots_in(black_box(&c), lo, hi).first()
                    } else if mode == 4 {
                        if adapter::refined_positive(black_box(&c), lo, hi) {
                            None
                        } else {
                            expected
                        }
                    } else {
                        kroots::earliest_root_in(black_box(&c), a, b)
                    };
                    assert_eq!(result.map(f64::to_bits), expected.map(f64::to_bits));
                    black_box(result);
                }
                samples.push(start.elapsed().as_nanos() as f64 / 10.0);
            }
            output.push(json!({"family":row["family"],"index":index,"input":input,"root":expected,"refined_positive":adapter::refined_positive(&c,lo,hi),"ns_all_first_prefix_cell_positive":samples}));
        }
    }
    fs::write(
        root().join("target/solver-c3/root-windows.json"),
        serde_json::to_vec_pretty(&output).unwrap(),
    )
    .unwrap();
    println!(
        "{}",
        json!({"root_window_cases":output.len(),"mismatches":0})
    );
}

/// The ordinary-contact polynomial, D and lo exactly as `pair_eval_in` hands
/// them to the adapter; None when a geometry guard returns first.
fn pair_poly(row: &[f64; 21]) -> Option<([f64; 5], f64, f64)> {
    let (a, b, ra, rb, lo) = pair_args(row);
    let distance = ra + rb;
    let gap = a.c0 - b.c0;
    if gap.norm_sq() < distance * distance {
        return None;
    }
    let dist = gap.norm();
    let sep = dist - distance;
    let approach = -gap.dot(a.c1 - b.c1) / dist;
    if approach > REST_APPROACH && sep <= approach * lo {
        return None;
    }
    let (ca, cb, cc) = (a.c2 - b.c2, a.c1 - b.c1, a.c0 - b.c0);
    let c = [
        cc.dot(cc) - distance * distance,
        2.0 * cb.dot(cc),
        cb.dot(cb) + 2.0 * ca.dot(cc),
        2.0 * ca.dot(cb),
        ca.dot(ca),
    ];
    Some((c, distance, lo))
}

/// The half-scaled pocket polynomial (ascending), D and lo as `pocket_eval_in` uses them.
fn pocket_poly(row: &[f64; 13]) -> Option<([f64; 5], f64, f64)> {
    let (p, pocket, lo) = pocket_args(row);
    let (dx, dy) = (p.c0.x - pocket.center.x, p.c0.y - pocket.center.y);
    let rho = libm::sqrt(dx * dx + dy * dy);
    let approach = -(dx * p.c1.x + dy * p.c1.y) / rho;
    let gap = rho - pocket.radius;
    if gap <= 0.0 || (approach > REST_APPROACH && gap <= approach * lo) {
        return None;
    }
    let (ax, ay, bx, by, px, py, cx, cy, d) = (
        p.c2.x,
        p.c2.y,
        p.c1.x,
        p.c1.y,
        p.c0.x,
        p.c0.y,
        pocket.center.x,
        pocket.center.y,
        pocket.radius,
    );
    let k = [
        0.5 * (ax * ax + ay * ay),
        ax * bx + ay * by,
        ax * (px - cx) + ay * (py - cy) + 0.5 * (bx * bx + by * by),
        bx * (px - cx) + by * (py - cy),
        0.5 * (cx * cx + cy * cy + px * px + py * py - d * d) - (px * cx + py * cy),
    ];
    Some(([k[4], k[3], k[2], k[1], k[0]], d, lo))
}

/// F12 alone against the delivered query, on the contact polynomial and on
/// the adapter's outward shifted screen, for every corpus input that reaches
/// a polynomial. Counts: [rows reaching a polynomial, contact roots, contact
/// empties, contact attempted-undecided, screen roots, screen empties].
fn direct_compare(name: &str, cases: impl Iterator<Item = ([f64; 5], f64, f64, f64, f64)>) {
    // GRAZE_GAP_M of the adapter (SPEC-DETECT-v2.2 D-6), as private there.
    const EPSILON: f64 = 1e-12;
    let mut counts = [0_u64; 6];
    let start = Instant::now();
    adapter::take_filter_counts();
    for (c, distance, scale, lo, hi) in cases {
        counts[0] += 1;
        if let Some(decided) = adapter::ordinary_contact(&c, lo, hi) {
            assert_eq!(
                decided.map(f64::to_bits),
                kroots::earliest_root_in(&c, lo, hi).map(f64::to_bits),
                "{name} contact {c:?} ({lo:?}, {hi:?}]"
            );
        }
        let delta = ((2.0 * distance).next_up() * EPSILON).next_up();
        let delta = (delta + (EPSILON * EPSILON).next_up()).next_up();
        let delta = (scale * delta).next_up();
        let mut screen = c;
        screen[0] = (c[0] - delta).next_down();
        let trace = adapter::take_filter_counts();
        counts[1] += trace[15];
        counts[2] += trace[14];
        counts[3] += trace[16];
        if screen[0].is_finite() && screen[0] < c[0] {
            if let Some(decided) = adapter::ordinary_contact(&screen, lo, hi) {
                assert_eq!(
                    decided.map(f64::to_bits),
                    kroots::earliest_root_in(&screen, lo, hi).map(f64::to_bits),
                    "{name} screen {screen:?} ({lo:?}, {hi:?}]"
                );
                counts[if decided.is_some() { 4 } else { 5 }] += 1;
            }
            adapter::take_filter_counts();
        }
    }
    println!(
        "{}",
        json!({"direct":name,"reached":counts[0],"contact_roots":counts[1],"contact_empties":counts[2],
        "contact_undecided":counts[3],"screen_roots":counts[4],"screen_empties":counts[5],
        "mismatches":0,"seconds":start.elapsed().as_secs_f64()})
    );
}

/// The `solver_c_random_grazes` inputs, regenerated by the same recipe.
fn random_graze_rows() -> (Vec<[f64; 21]>, Vec<[f64; 13]>) {
    let mut state = 0x489d_63be_27af_0001_u64;
    let mut uniform = || {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        (state >> 11) as f64 / 9007199254740992.0
    };
    let mut pairs = Vec::new();
    let mut pockets = Vec::new();
    for i in 0..1024 {
        let d = 0.02 + 0.1 * uniform();
        let speed = 0.01 + 5.0 * uniform();
        let m = 0.05 + 2.0 * uniform();
        let mut offset = d + match i % 4 {
            0 => 0.0,
            1 => 1e-12,
            2 => 1e-12 * uniform(),
            _ => -1e-12 * uniform(),
        };
        for _ in 0..i % 5 {
            offset = if i % 2 == 0 {
                offset.next_up()
            } else {
                offset.next_down()
            };
        }
        let acceleration = if i % 2 == 0 { 0.0 } else { uniform() };
        let p = PosPoly {
            c0: Vec3::new(-speed * m, offset + acceleration * m * m, 0.0),
            c1: Vec3::new(speed, -2.0 * acceleration * m, 0.0),
            c2: Vec3::new(0.0, acceleration, 0.0),
        };
        for lo in [0.0, 1e-9, m.next_down(), m, m.next_up()] {
            let mut pair = [0.0; 21];
            pair[..9].copy_from_slice(&values(&p));
            pair[18] = d * 0.5;
            pair[19] = d * 0.5;
            pair[20] = lo;
            pairs.push(pair);
            let mut pocket = [0.0; 13];
            pocket[..9].copy_from_slice(&values(&p));
            pocket[11] = d;
            pocket[12] = lo;
            pockets.push(pocket);
        }
    }
    (pairs, pockets)
}

#[test]
#[ignore = "F12 against the delivered query on every corpus; run explicitly under the host lease"]
fn solver_fastpath_direct() {
    let dir = corpus();
    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(dir.join("manifest.json")).unwrap()).unwrap();
    for row in manifest.as_array().unwrap() {
        let name = Path::new(row["output"].as_str().unwrap())
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let data = rows::<21>(&dir.join(&name));
        direct_compare(
            &name,
            data.iter()
                .filter_map(pair_poly)
                .map(|(c, d, lo)| (c, d, 1.0, lo, f64::INFINITY)),
        );
    }
    let pairs = rows::<21>(&scenario_corpus("scenario-pairs.bin"));
    let pockets = rows::<13>(&scenario_corpus("scenario-pockets.bin"));
    direct_compare(
        "scenario-pairs",
        pairs
            .iter()
            .filter_map(pair_poly)
            .map(|(c, d, lo)| (c, d, 1.0, lo, f64::INFINITY)),
    );
    direct_compare(
        "scenario-pockets",
        pockets
            .iter()
            .filter_map(pocket_poly)
            .map(|(c, d, lo)| (c, d, 0.5, lo, f64::INFINITY)),
    );
    direct_compare(
        "scenario-pairs-bounded",
        window_pairs().iter().filter_map(|r| {
            pair_poly(r[..21].try_into().unwrap()).map(|(c, d, lo)| (c, d, 1.0, lo, r[21]))
        }),
    );
    direct_compare(
        "scenario-pockets-bounded",
        window_pockets().iter().filter_map(|r| {
            pocket_poly(r[..13].try_into().unwrap()).map(|(c, d, lo)| (c, d, 0.5, lo, r[13]))
        }),
    );
    let (graze_pairs, graze_pockets) = random_graze_rows();
    direct_compare(
        "random-near-graze-pairs",
        graze_pairs
            .iter()
            .filter_map(pair_poly)
            .map(|(c, d, lo)| (c, d, 1.0, lo, f64::INFINITY)),
    );
    direct_compare(
        "random-near-graze-pockets",
        graze_pockets
            .iter()
            .filter_map(pocket_poly)
            .map(|(c, d, lo)| (c, d, 0.5, lo, f64::INFINITY)),
    );
}
