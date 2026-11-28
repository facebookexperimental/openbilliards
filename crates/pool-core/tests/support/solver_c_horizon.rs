// Copyright (c) Meta Platforms, Inc. and affiliates.

use super::*;

#[test]
fn conservative_horizon_keeps_absolute_time_ties_and_cached_values() {
    let system = SystemState::nine_ball_rack(0);
    let ball = &system.balls[0];
    let mut cache = Cache::default();
    let mut cases = 0;
    for now in [0.0, 1e-9, 1.0, 1e6, 1e100] {
        for dt in [0.0, 1e-12, 1e-9, 0.1, 1.0] {
            let absolute = now + dt;
            cache.insert(PairKey::Transition(ball.id), absolute);
            let hi = transition_horizon(&cache, ball, now);
            let mut candidate = absolute - now;
            for _ in 0..16 {
                if now + candidate <= absolute {
                    assert!(candidate <= hi);
                }
                candidate = candidate.next_up();
                cases += 1;
            }
            assert!(now + hi.next_up() > absolute);
        }
    }
    cache.times.clear();
    assert_eq!(transition_horizon(&cache, ball, 0.0), f64::INFINITY);
    println!("horizon rounding cases: n={cases}, mismatches=0");
}

#[test]
fn frozen_tiers_preserve_pocket_and_pair_transition_ties() {
    let system = SystemState::nine_ball_rack(0);
    let id = system.balls[0].id;
    let mut cache = Cache::default();
    cache.insert(PairKey::Transition(id), 1.0);
    cache.insert(PairKey::BallPocket(id, 0), 1.0);
    assert_eq!(
        select_earliest(&cache, &system.balls).unwrap().1,
        PairKey::BallPocket(id, 0)
    );
    cache.times.remove(&PairKey::BallPocket(id, 0));
    cache.insert(PairKey::BallBall(id, system.balls[1].id), 1.0);
    assert_eq!(
        select_earliest(&cache, &system.balls).unwrap().1,
        PairKey::Transition(id)
    );
}

#[test]
#[ignore = "C3 instrumented actual J v2 simulation paths; not a speed benchmark"]
fn solver_c3_jv2_profile() {
    use crate::math::roots_adapter;
    use serde::Deserialize;
    use serde_json::json;
    use std::fs;
    use std::path::Path;
    use std::time::Instant;
    #[derive(Deserialize)]
    struct Fixture {
        family: String,
        scenario: String,
    }
    #[derive(Deserialize)]
    struct Input {
        system: crate::SystemState,
        shot: crate::ShotParams,
        options: crate::SimOptions,
    }
    let source = fs::read_to_string(std::env::var("SOLVER_C3_FIXTURES").unwrap()).unwrap();
    let data: Vec<(String, Input)> = source
        .lines()
        .map(|line| {
            let row: Fixture = serde_json::from_str(line).unwrap();
            (row.family, serde_json::from_str(&row.scenario).unwrap())
        })
        .collect();
    let mut records = Vec::new();
    for family in ["mix", "breaks", "clusters", "grazes", "pockets"] {
        if std::env::var("SOLVER_C3_PROFILE_FAMILY").is_ok_and(|name| name != family) {
            continue;
        }
        roots_adapter::take_filter_counts();
        roots_adapter::take_profile();
        roots_adapter::take_minimum_inputs();
        roots_adapter::take_slow_roots();
        roots_adapter::take_counterfactual();
        roots_adapter::profile_enable(true);
        let start = Instant::now();
        let mut shots = 0;
        let mut events = 0;
        for (_, sc) in data.iter().filter(|(f, _)| f == family) {
            events += crate::simulate(&sc.system, &sc.shot, &sc.options)
                .unwrap()
                .events
                .len();
            shots += 1;
        }
        let elapsed = start.elapsed().as_nanos();
        roots_adapter::profile_enable(false);
        let record = json!({"family":family,"shots":shots,"events":events,"elapsed_ns":elapsed,"filters":roots_adapter::take_filter_counts(),"call_count_and_ns":roots_adapter::take_profile(),"fallback_inputs":roots_adapter::take_minimum_inputs(),"slow_roots":roots_adapter::take_slow_roots(),"screen_counterfactual":roots_adapter::take_counterfactual()});
        println!("{record}");
        records.push(record);
    }
    let path =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../target/solver-c3/jv2-profile.json");
    fs::write(path, serde_json::to_vec_pretty(&records).unwrap()).unwrap();
}
