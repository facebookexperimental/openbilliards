// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! Wire-drift guard (feature 013 research R1, migration-gate check M7):
//! pool-rules deliberately re-mirrors the pool-core ShotRecord wire
//! schema instead of depending on the kernel crate (open boundary +
//! kernel_version leniency). This test is the drift alarm: serialize a
//! REAL native `pool_core::ShotRecord`, parse it with
//! `pool_rules::wire::parse_record`, and assert every judged-upon field
//! round-trips — event kinds/ids/pocket indices in emission order,
//! `post[]` poses, the initial ball snapshot (ids/positions/radii),
//! table pocket count. Runs in the default `cargo test` workspace
//! invocation; a kernel serde-shape change fails HERE, not at a
//! conformance gate three surfaces away.

use pool_core::{simulate, EventKind, ShotParams, SimOptions, SystemState};
use pool_rules::wire::{parse_record, WireEventKind};

#[test]
fn native_record_round_trips_every_judged_field() {
    // A seeded break: dense event stream (Strike, BallBall, cushions,
    // pockets on lucky seeds, Transitions, Rest) — the full kind surface
    // minus the rare off-table branch.
    let system = SystemState::nine_ball_rack(7);
    let shot = ShotParams {
        v0: 8.0,
        phi: std::f64::consts::FRAC_PI_2,
        theta: 0.0,
        a: 0.0,
        b: 0.0,
        seed: 7,
    };
    let opts = SimOptions::realistic();
    let record = simulate(&system, &shot, &opts).expect("break simulates");
    let json = record.to_json();

    let wire = parse_record(&json).expect("pool-rules wire mirror parses");

    // kernel_version accepted verbatim (never validated — research R1)
    assert_eq!(wire.kernel_version, record.kernel_version);

    // initial snapshot: ids, positions, radii (P10 geometry inputs)
    assert_eq!(wire.initial.balls.len(), record.initial.balls.len());
    for (w, k) in wire.initial.balls.iter().zip(&record.initial.balls) {
        assert_eq!(w.id, k.id.0 as i64);
        assert_eq!(w.params.r, k.params.r);
        assert_eq!(w.state.pos.x, k.state.pos.x);
        assert_eq!(w.state.pos.y, k.state.pos.y);
        assert_eq!(w.state.pos.z, k.state.pos.z);
        assert_eq!(w.state.motion, format!("{:?}", k.state.motion));
    }

    // table pockets: count survives (kernel pocket indexing)
    assert_eq!(wire.initial.table.pockets.len(),
        record.initial.table.pockets.len());

    // events: emission order, kinds, ids, pocket indices, post poses
    assert_eq!(wire.events.len(), record.events.len());
    let mut strikes = 0;
    let mut contacts = 0;
    let mut cushions = 0;
    for (w, k) in wire.events.iter().zip(&record.events) {
        match (&w.kind, &k.kind) {
            (WireEventKind::Rest, EventKind::Rest) => {}
            (WireEventKind::Strike { ball }, EventKind::Strike { ball: kb }) => {
                assert_eq!(*ball, kb.0 as i64);
                strikes += 1;
            }
            (WireEventKind::BallBall { b1, b2 },
                EventKind::BallBall { b1: k1, b2: k2 }) => {
                assert_eq!(*b1, k1.0 as i64);
                assert_eq!(*b2, k2.0 as i64);
                contacts += 1;
            }
            (WireEventKind::BallLinearCushion { ball },
                EventKind::BallLinearCushion { ball: kb, .. }) => {
                assert_eq!(*ball, kb.0 as i64);
                cushions += 1;
            }
            (WireEventKind::BallCircularCushion { ball },
                EventKind::BallCircularCushion { ball: kb, .. }) => {
                assert_eq!(*ball, kb.0 as i64);
                cushions += 1;
            }
            (WireEventKind::BallPocket { ball, pocket },
                EventKind::BallPocket { ball: kb, pocket: kp }) => {
                assert_eq!(*ball, kb.0 as i64);
                assert_eq!(*pocket, *kp as i64);
            }
            (WireEventKind::BallTable { ball },
                EventKind::BallTable { ball: kb }) => {
                assert_eq!(*ball, kb.0 as i64);
            }
            (WireEventKind::BallOffTable { ball },
                EventKind::BallOffTable { ball: kb }) => {
                assert_eq!(*ball, kb.0 as i64);
            }
            (WireEventKind::Transition { ball },
                EventKind::Transition { ball: kb, .. }) => {
                assert_eq!(*ball, kb.0 as i64);
            }
            (w, k) => panic!("event kind drift: wire {w:?} vs kernel {k:?}"),
        }
        assert_eq!(w.post.len(), k.post.len(), "post pose count");
        for ((wid, ws), (kid, ks)) in w.post.iter().zip(&k.post) {
            assert_eq!(*wid, kid.0 as i64);
            assert_eq!(ws.pos.x, ks.pos.x);
            assert_eq!(ws.pos.y, ks.pos.y);
            assert_eq!(ws.pos.z, ks.pos.z);
            assert_eq!(ws.motion, format!("{:?}", ks.motion));
        }
    }
    assert_eq!(strikes, 1, "exactly one Strike");
    assert!(contacts > 0, "a break has ball-ball contacts");
    assert!(cushions > 0, "a break reaches cushions");
}
