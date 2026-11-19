// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Feature 003 stage 1 (contract Amendment 002): 2.5D jump-shot integration
//! tests — the legal-jump event chain, airborne ball–ball physics, the
//! bounce-cascade Zeno cap, mechanical-energy monotonicity, and determinism
//! with jumps. Self-contained: each scenario builds its own table/balls.

use pool_core::{
    simulate, Ball, BallId, BallParams, BallState, EventKind, MotionState, ShotParams, ShotRecord,
    SimOptions, SystemState, Table, Vec3,
};
use std::f64::consts::FRAC_PI_2;

const R: f64 = 0.028575;
const G: f64 = 9.81;

fn ball_at(id: u8, x: f64, y: f64) -> Ball {
    Ball {
        id: BallId(id),
        params: BallParams::default(),
        state: BallState {
            pos: Vec3::new(x, y, R),
            vel: Vec3::ZERO,
            avel: Vec3::ZERO,
            motion: MotionState::Stationary,
            pinch: None,
        },
    }
}

fn table_with(balls: Vec<Ball>) -> SystemState {
    SystemState {
        balls,
        table: Table::wpa_9ft(R),
        equipment: Default::default(),
    }
}

/// Center-ball strike at elevation `theta_deg` toward +y.
fn jump_shot(v0: f64, theta_deg: f64) -> ShotParams {
    ShotParams {
        v0,
        phi: FRAC_PI_2,
        theta: theta_deg.to_radians(),
        a: 0.0,
        b: 0.0,
        seed: 7,
    }
}

fn run(sys: &SystemState, shot: &ShotParams) -> ShotRecord {
    simulate(sys, shot, &SimOptions::default()).expect("simulate")
}

/// Ball-table events of `ball`, in order.
fn bounces(rec: &ShotRecord, ball: u8) -> Vec<&pool_core::Event> {
    rec.events
        .iter()
        .filter(|e| matches!(e.kind, EventKind::BallTable { ball: b } if b == BallId(ball)))
        .collect()
}

/// The LEGAL JUMP mechanism (WPA 2.11, research doc §1.2): an elevated
/// strike drives the cue DOWN (Airborne, vz < 0), an immediate BallTable
/// event at t ≈ 0 bounces it off the slate, a cascade of geometrically
/// decaying bounces follows, the min-bounce-height guard grounds it, and
/// the ball rolls out to rest.
#[test]
fn legal_jump_event_chain() {
    let sys = table_with(vec![ball_at(0, 0.0, -0.6)]);
    let rec = run(&sys, &jump_shot(2.0, 60.0));

    // Strike: Airborne with downward vz at bed height.
    let strike = &rec.events[0];
    assert!(matches!(strike.kind, EventKind::Strike { ball: BallId(0) }));
    let (_, s0) = strike.post[0];
    assert_eq!(s0.motion, MotionState::Airborne);
    assert!(s0.vel.z < -0.5, "elevated strike must drive down: {s0:?}");
    assert!((s0.pos.z - R).abs() < 1e-12);

    // Immediate slate bounce: the very next event, at t ≈ 0.
    let b = bounces(&rec, 0);
    assert!(b.len() >= 2, "need a bounce cascade, got {}", b.len());
    assert!(std::ptr::eq(&rec.events[1], b[0]));
    assert!(b[0].t < 1e-6, "first bounce must be immediate: {}", b[0].t);
    let (_, s1) = b[0].post[0];
    assert_eq!(s1.motion, MotionState::Airborne);
    // vz' = −e_t·vz (up to the 1 ns of gravity before the immediate bounce).
    assert!((s1.vel.z - -sys.balls[0].params.e_t * s0.vel.z).abs() < 1e-6);

    // Cascade: outgoing vz decays geometrically; the last bounce grounds it.
    let outgoing: Vec<f64> = b.iter().map(|e| e.post[0].1.vel.z).collect();
    for w in outgoing.windows(2) {
        assert!(w[1] < w[0], "bounce vz must decay: {outgoing:?}");
    }
    let last = *outgoing.last().unwrap();
    assert_eq!(last, 0.0, "cascade must end grounded: {outgoing:?}");
    let (_, s_last) = b.last().unwrap().post[0];
    assert!(matches!(
        s_last.motion,
        MotionState::Sliding | MotionState::Rolling
    ));

    // Afterwards: normal cloth life (rolls, stops), and it MOVED downrange.
    assert!(matches!(rec.events.last().unwrap().kind, EventKind::Rest));
    let rest = rec
        .events
        .iter()
        .rev()
        .find_map(|e| e.post.iter().find(|(id, _)| *id == BallId(0)))
        .unwrap()
        .1;
    assert_eq!(rest.motion, MotionState::Stationary);
    assert!(rest.pos.y > -0.55, "jump shot must travel downrange");
}

/// Jump OVER an obstructing ball: with enough elevation the flight clears
/// the obstruction (no ball–ball contact with it); a flatter strike on the
/// same layout clips it. Verifies the 3D ball-ball detection (z enters the
/// quartic through c2.z = −g/2).
#[test]
fn jump_clears_obstruction_when_high_enough() {
    let layout = || {
        table_with(vec![
            ball_at(0, 0.0, -0.6),
            ball_at(1, 0.0, -0.25), // obstruction 0.35 m downrange
        ])
    };

    // High jump: the ENTIRE airborne phase (through the grounding bounce)
    // passes over ball 1 without contact. (Afterwards the cue rolls to the
    // far rail and may legitimately come back — an open-table 9ft rollout —
    // so the clearance claim is scoped to the flight.)
    let rec = run(&layout(), &jump_shot(3.5, 45.0));
    let t_land = bounces(&rec, 0).last().unwrap().t;
    assert!(
        !rec.events
            .iter()
            .any(|e| { e.t <= t_land + 1e-9 && e.post.iter().any(|(id, _)| *id == BallId(1)) }),
        "high jump must clear the obstruction in flight: {:?}",
        rec.events
            .iter()
            .map(|e| (e.t, &e.kind))
            .collect::<Vec<_>>()
    );
    // ... and it genuinely flew: airborne (off the bed) past the
    // obstruction's y before landing.
    let cleared = rec.events.iter().any(|e| {
        e.t <= t_land + 1e-9
            && e.post
                .iter()
                .any(|(id, s)| *id == BallId(0) && s.pos.y > -0.25 && s.pos.z > R + 1e-6)
    });
    assert!(cleared, "cue must still be airborne past the obstruction");

    // Flat, slow strike on the same layout: hits ball 1 first.
    let rec = run(&layout(), &jump_shot(2.0, 10.0));
    let first_contact = rec
        .events
        .iter()
        .find(|e| matches!(e.kind, EventKind::BallBall { .. }))
        .expect("flat strike must contact the obstruction");
    assert!(matches!(
        first_contact.kind,
        EventKind::BallBall {
            b1: BallId(0),
            b2: BallId(1)
        }
    ));
}

/// Airborne full hit: a descending cue striking a bed ball transfers
/// momentum along the TRUE 3D line of centers — the object ball is driven
/// DOWNWARD, its own immediate BallTable event bounces it (the object-ball
/// hop), and full 3D momentum is conserved at the impact.
#[test]
fn airborne_full_hit_hops_the_object_ball() {
    let sys = table_with(vec![ball_at(0, 0.0, -0.6), ball_at(1, 0.0, 0.0)]);
    // Carry tuned so the first flight arc DESCENDS onto the object ball 0.6 m
    // downrange (landing point ≈ 0.63 m): the cue meets it a few mm above
    // bed height, from above.
    let rec = run(&sys, &jump_shot(2.35, 35.0));

    let hit = rec
        .events
        .iter()
        .find(|e| {
            matches!(
                e.kind,
                EventKind::BallBall {
                    b1: BallId(0),
                    b2: BallId(1)
                }
            )
        })
        .expect("cue must land on the object ball");
    let cue = hit.post.iter().find(|(id, _)| *id == BallId(0)).unwrap().1;
    let ob = hit.post.iter().find(|(id, _)| *id == BallId(1)).unwrap().1;

    // Cue was airborne at impact (above bed height).
    assert!(cue.pos.z > R + 1e-4, "cue must hit from above: {cue:?}");
    // Object ball driven downward → labeled Airborne with vz < 0 …
    assert!(ob.vel.z < -1e-3, "object ball must be pressed down: {ob:?}");
    assert_eq!(ob.motion, MotionState::Airborne);
    // … and its own slate bounce (the hop) follows as its next event.
    let hop = bounces(&rec, 1)
        .into_iter()
        .find(|e| e.t >= hit.t)
        .expect("object ball must bounce off the slate (hop)");
    assert!(hop.t - hit.t < 1e-3, "hop must be immediate");
    // Post-hop the object ball moves downrange.
    let (_, s_hop) = hop.post[0];
    assert!(
        s_hop.vel.y > 0.1,
        "object ball must take momentum: {s_hop:?}"
    );
}

/// Zeno cap: a hard legal jump produces a FINITE bounce cascade
/// (min-bounce-height guard), well inside the event budget. (Stage 2: the
/// launch is capped so the cascade stays ON the table — harder strikes now
/// legitimately fly over the head rail into the BallOffTable terminal,
/// covered by `hard_jump_flies_off_the_table`.)
#[test]
fn bounce_cascade_terminates_zeno_cap() {
    let sys = table_with(vec![ball_at(0, 0.0, -1.1)]);
    let rec = run(&sys, &jump_shot(4.0, 60.0));
    let b = bounces(&rec, 0);
    assert!(
        (2..=40).contains(&b.len()),
        "bounce cascade must be finite and short, got {}",
        b.len()
    );
    // Strictly decaying outgoing vz, ending at exactly 0.
    let outgoing: Vec<f64> = b.iter().map(|e| e.post[0].1.vel.z).collect();
    assert_eq!(*outgoing.last().unwrap(), 0.0);
    assert!(matches!(rec.events.last().unwrap().kind, EventKind::Rest));
}

/// Total mechanical energy (KE + m·g·(z − R)) is monotonically
/// non-increasing across every event of a jump shot.
#[test]
fn jump_shot_mechanical_energy_monotone() {
    let sys = table_with(vec![
        ball_at(0, 0.0, -0.6),
        ball_at(1, 0.02, 0.0),
        ball_at(2, -0.15, 0.3),
    ]);
    let rec = run(&sys, &jump_shot(3.0, 40.0));

    let energy = |s: &BallState, p: &BallParams| {
        let i = 0.4 * p.m * p.r * p.r;
        let pe = if s.motion == MotionState::Pocketed {
            0.0
        } else {
            p.m * G * (s.pos.z - p.r)
        };
        0.5 * p.m * s.vel.norm_sq() + 0.5 * i * s.avel.norm_sq() + pe
    };
    // Track post-event energies only (flight conserves; resolvers dissipate).
    let mut states: std::collections::BTreeMap<u8, BallState> =
        sys.balls.iter().map(|b| (b.id.0, b.state)).collect();
    let params: std::collections::BTreeMap<u8, BallParams> =
        sys.balls.iter().map(|b| (b.id.0, b.params)).collect();
    // Monotone chain on POST-EVENT snapshot totals: between events every leg
    // conserves (flight) or dissipates (cloth friction) mechanical energy,
    // and every resolver dissipates, so the post-event totals must be
    // non-increasing after the strike. (The exact time-evolved variant of
    // this invariant runs over every fuzz shot in fuzz.rs.)
    let mut prev = f64::INFINITY;
    for ev in &rec.events {
        for (id, s) in &ev.post {
            states.insert(id.0, *s);
        }
        let total: f64 = states.iter().map(|(id, s)| energy(s, &params[id])).sum();
        if matches!(ev.kind, EventKind::Strike { .. }) {
            prev = total;
            continue;
        }
        assert!(
            total <= prev + 1e-6,
            "post-event energy grew across {:?} at t={}: {prev} -> {total}",
            ev.kind,
            ev.t
        );
        prev = total;
    }
}

/// Airborne pocket capture (documented 7/5R heuristic): a jump aimed dead at
/// a corner pocket drops in from the air.
#[test]
fn airborne_ball_can_be_pocketed() {
    // Corner pocket center (wpa_9ft): (0.6645, -1.2995). Aim from a spot on
    // the diagonal so the descending arc crosses the pocket circle.
    let pocket = Vec3::new(0.664486352775479, -1.299486352775479, 0.0);
    let start = Vec3::new(0.2, -0.7, R);
    let dir = pocket - start;
    let phi = dir.y.atan2(dir.x);
    let sys = table_with(vec![ball_at(0, start.x, start.y)]);
    let dist = (dir.x * dir.x + dir.y * dir.y).sqrt();
    // Choose v0 so the SECOND arc (post-cascade rollout still short) covers
    // `dist`: simplest is a sweep over a few speeds until a pocket event
    // appears while airborne-capable.
    let mut pocketed = false;
    for v0 in [2.6, 2.8, 3.0, 3.2, 3.4, 3.6, 3.8, 4.0] {
        let shot = ShotParams {
            v0,
            phi,
            theta: 35.0_f64.to_radians(),
            a: 0.0,
            b: 0.0,
            seed: 1,
        };
        let rec = run(&sys, &shot);
        if rec.events.iter().any(|e| {
            matches!(
                e.kind,
                EventKind::BallPocket {
                    ball: BallId(0),
                    ..
                }
            )
        }) {
            pocketed = true;
            break;
        }
    }
    assert!(
        pocketed,
        "a jump aimed at the corner pocket ({dist:.2} m away) must drop for some speed"
    );
}

/// Stage 2: a hard high jump clears the head rail entirely — the record
/// terminates with the BallOffTable terminal (frozen out of play beyond the
/// rails), never an endless off-bed rollout and never a phantom fence hit.
#[test]
fn hard_jump_flies_off_the_table() {
    let sys = table_with(vec![ball_at(0, 0.0, -0.6)]);
    let rec = run(&sys, &jump_shot(6.0, 55.0));
    let off = rec
        .events
        .iter()
        .find(|e| matches!(e.kind, EventKind::BallOffTable { ball: BallId(0) }))
        .expect("over-the-rail flight must end off-table");
    let (_, s) = off.post[0];
    assert_eq!(s.motion, MotionState::Pocketed, "out of play");
    assert_eq!(s.vel, Vec3::ZERO);
    assert!(
        s.pos.y >= sys.table.length / 2.0 + R,
        "must be clamped beyond the head rail: {:?}",
        s.pos
    );
    assert!(
        !rec.events.iter().any(|e| matches!(
            e.kind,
            EventKind::BallLinearCushion { .. } | EventKind::BallCircularCushion { .. }
        )),
        "a clean fly-over must not touch a cushion"
    );
    assert!(matches!(rec.events.last().unwrap().kind, EventKind::Rest));
}

/// Stage 2 z-gate: the SAME aim at the head rail hits the nose when the
/// flight is low (cushion event, ball stays on the table) and clears it
/// when high (off-table) — the airborne-vs-cushion decision is genuinely
/// 3D, not an infinite fence.
#[test]
fn low_flight_hits_nose_high_flight_clears_it() {
    // Low: a flat-ish jump arriving at the head rail below nose height.
    let sys = table_with(vec![ball_at(0, 0.0, 0.4)]);
    let rec = run(&sys, &jump_shot(3.4, 14.0));
    let hit = rec.events.iter().find(|e| {
        matches!(
            e.kind,
            EventKind::BallLinearCushion {
                ball: BallId(0),
                ..
            }
        )
    });
    assert!(
        hit.is_some(),
        "low flier must rebound off the nose: {:?}",
        rec.events
            .iter()
            .map(|e| (e.t, &e.kind))
            .collect::<Vec<_>>()
    );
    assert!(
        !rec.events
            .iter()
            .any(|e| matches!(e.kind, EventKind::BallOffTable { .. })),
        "the rebound must keep the ball on the table"
    );
    // The rebound of an AIRBORNE hit keeps a real vertical component: the
    // post-state is falling/rising or immediately grounded, never a fence
    // artifact with frozen z; and the ball ends at rest on the bed.
    let rest = rec
        .events
        .iter()
        .rev()
        .find_map(|e| e.post.iter().find(|(id, _)| *id == BallId(0)))
        .unwrap()
        .1;
    assert_eq!(rest.motion, MotionState::Stationary);
    assert!((rest.pos.z - R).abs() < 1e-9);

    // High: same spot, steep+fast → clears the rail, terminal off-table.
    let rec = run(&sys, &jump_shot(6.0, 55.0));
    assert!(
        rec.events
            .iter()
            .any(|e| matches!(e.kind, EventKind::BallOffTable { ball: BallId(0) })),
        "high flight over the same rail must leave the table: {:?}",
        rec.events
            .iter()
            .map(|e| (e.t, &e.kind))
            .collect::<Vec<_>>()
    );
}

/// Determinism: byte-identical serialized records for repeated jump-shot
/// simulations (SC-001 with airborne physics in play).
#[test]
fn jump_shots_are_byte_identical() {
    let sys = table_with(vec![
        ball_at(0, 0.0, -0.6),
        ball_at(1, 0.02, 0.0),
        ball_at(2, -0.15, 0.3),
    ]);
    for (v0, theta) in [(2.5, 40.0), (4.0, 55.0), (6.0, 30.0)] {
        let shot = jump_shot(v0, theta);
        let a = simulate(&sys, &shot, &SimOptions::default())
            .unwrap()
            .to_json();
        let b = simulate(&sys, &shot, &SimOptions::default())
            .unwrap()
            .to_json();
        assert!(
            a.as_bytes() == b.as_bytes(),
            "jump shot v0={v0} theta={theta} not byte-identical"
        );
    }
}

// ---- issue #215: airborne re-collision after a same-instant compound ----

/// The hero-v2 venomjump beat (issue #215 repro, verbatim): an airborne cue
/// lands on the nine's crown — BallBall[0,9] at exactly d = 2R drives the
/// nine into the slate, the same-instant BallTable[9] bounce re-establishes
/// closing velocity while the pair still sits at d = 2R (both Airborne,
/// linear relative motion). Shipped equipment: wpa_generic_9ft +
/// stronge_realistic (the resolved options — realistic hop/bounce floors —
/// keep the nine airborne through the window, which is what arms the
/// defect).
fn venomjump() -> (SystemState, ShotParams, SimOptions) {
    let spec = pool_core::EquipmentSpec {
        cushion_model_id: "stronge_realistic".into(),
        ..Default::default()
    };
    let resolved = pool_core::EquipmentCatalog::get()
        .resolve(&spec)
        .expect("stronge_realistic pairing resolves");
    let params = resolved.ball_params();
    let ball = |id: u8, x: f64, y: f64| Ball {
        id: BallId(id),
        params,
        state: BallState {
            pos: Vec3::new(x, y, params.r),
            vel: Vec3::ZERO,
            avel: Vec3::ZERO,
            motion: MotionState::Stationary,
            pinch: None,
        },
    };
    let system = SystemState {
        balls: vec![
            ball(0, 0.498363, 0.142187),
            ball(9, 0.498363, 0.2075994),
            ball(5, 0.6358039, 1.2433943),
        ],
        table: resolved.table.clone(),
        equipment: spec,
    };
    let shot = ShotParams {
        v0: 4.414012,
        phi: 1.4279868725988556,
        theta: 1.5437886481639307,
        a: 0.09874841907261592,
        b: -0.6705676946631671,
        seed: 0,
    };
    (system, shot, resolved.options)
}

/// Sample-based no-penetration pin: min 3D center distance across the whole
/// record, all non-pocketed pairs, on a 2 kHz grid, must stay ≥ 2R − 1e-9.
fn assert_no_pair_penetration(rec: &ShotRecord) {
    let sampler = rec.sampler();
    let dur = rec.duration();
    let steps = (dur * 2000.0).ceil() as u64;
    let mut out = Vec::new();
    let mut worst = (f64::INFINITY, 0.0, BallId(0), BallId(0));
    for i in 0..=steps {
        let t = (i as f64 / 2000.0).min(dur);
        sampler.sample_at(t, &mut out);
        for i in 0..out.len() {
            for j in (i + 1)..out.len() {
                if out[i].motion == MotionState::Pocketed
                    || out[j].motion == MotionState::Pocketed
                {
                    continue;
                }
                let d = (out[i].pos - out[j].pos).norm();
                if d < worst.0 {
                    worst = (d, t, out[i].id, out[j].id);
                }
            }
        }
    }
    let (d, t, a, b) = worst;
    assert!(
        d >= 2.0 * R - 1e-9,
        "pair ({a:?}, {b:?}) interpenetrates: d = {d} < 2R = {} at t = {t}",
        2.0 * R
    );
}

/// Issue #215 regression: the re-collision must be detected AT the compound
/// instant — a pair left at d = 2R with closing velocity by a same-instant
/// BallBall+BallTable resolve fires the next BallBall immediately, and the
/// record carries no interpenetration anywhere. Before the fix the entry
/// root (τ ≈ 8e-11 s < Eps::TIME) was filtered, the pair's candidate became
/// the far-side EXIT crossing, and the pair sank to d = 47.457 mm (9.7 mm
/// deep) for ~106 ms until the nine's slate return at t = 0.690046 s
/// re-noticed it.
#[test]
fn airborne_recollision_detected_at_compound_instant() {
    let (sys, shot, opts) = venomjump();
    let rec = simulate(&sys, &shot, &opts).expect("simulate");

    // Defect-signature chain (loud guard against equipment/scenario drift):
    // cue lands on the nine at t ≈ 0.6377 s with a same-instant slate hit.
    let bb: Vec<f64> = rec
        .events
        .iter()
        .filter(|e| {
            matches!(e.kind, EventKind::BallBall { b1, b2 }
                if b1 == BallId(0) && b2 == BallId(9))
        })
        .map(|e| e.t)
        .collect();
    assert!(
        bb.len() >= 2,
        "expected the compound landing + immediate re-collision: {bb:?}"
    );
    assert!(
        (bb[0] - 0.6377083).abs() < 1e-3,
        "first cue-on-nine landing moved: {bb:?}"
    );
    // The re-collision fires at the compound instant (one t_min hop per
    // cascade step), NOT 52 ms later at the nine's slate return.
    assert!(
        bb[1] - bb[0] < 1e-6,
        "re-collision must be same-instant, got Δt = {} ({bb:?})",
        bb[1] - bb[0]
    );

    assert_no_pair_penetration(&rec);
    assert!(matches!(rec.events.last().unwrap().kind, EventKind::Rest));
}

/// Issue #215 Zeno guard: with e_b = 0 the ball-ball resolve zeroes the
/// pair's normal relative velocity exactly, so the new at-contact window
/// guard (REST_APPROACH-gated) must go quiet instead of re-firing at
/// d = 2R forever — the worst-case perfectly-plastic sandwich (cue pressing
/// the nine onto the slate) is a CONVERGING same-instant cascade that
/// terminates well inside the event budget.
///
/// Deliberately NOT pinned here: pair clearance. Once the cascade zeroes
/// the pair's normal velocity the cue is left RESTING on the grounded
/// nine — a ball-on-ball resting contact the event-driven kernel does not
/// model (the issue #44 frozen overlap-branch residual, vertical channel:
/// gravity rebuilds approach with no event to trigger a recompute, so the
/// cue sinks through until its own slate landing). That channel is only
/// reachable at e_b = 0 — no shipped ballset is below 0.9 — and is out of
/// #215's charter (re-arming detection for CLOSING pairs at d = 2R).
#[test]
fn airborne_recollision_e_b_zero_no_chatter() {
    let (mut sys, shot, opts) = venomjump();
    for b in &mut sys.balls {
        b.params.e_b = 0.0;
    }
    let rec = simulate(&sys, &shot, &opts).expect("e_b = 0 must not Zeno-loop");
    assert!(
        rec.events.len() < 300,
        "sandwich cascade too long: {} events",
        rec.events.len()
    );
    assert!(matches!(rec.events.last().unwrap().kind, EventKind::Rest));
}
