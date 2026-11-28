// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Shot record: versioned, serializable event stream (types trunk-frozen;
//! serialization + sampling impls M8-owned).
//!
//! Losslessness: `serde_json` is built with the `float_roundtrip` feature
//! (workspace `Cargo.toml`), so every finite f64 survives
//! `to_json` → `from_json` bit-identically (ryu shortest serialization +
//! exact nearest-double parsing), including subnormals and −0.0. Replays and
//! network transfer therefore reproduce trajectories exactly
//! (constitution P-III).

use crate::events::Event;
use crate::shot::{ShotParams, SimError, SimOptions};
use crate::state::{MotionState, SystemState};
use crate::types::{BallId, Quat, Vec3};
use serde::{Deserialize, Serialize};

/// Shot-record format version (bumped on breaking schema changes).
pub const FORMAT_VERSION: u32 = 1;

/// Complete, replayable record of one simulated shot (FR-010): initial state
/// + inputs + event stream reconstruct the trajectory at any time.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ShotRecord {
    /// Kernel that produced this record ([`crate::consts::KERNEL_VERSION`]).
    pub kernel_version: String,
    /// Schema version ([`FORMAT_VERSION`]).
    pub format_version: u32,
    pub initial: SystemState,
    pub shot: ShotParams,
    pub options: SimOptions,
    pub events: Vec<Event>,
    /// Diagnostic shot statistics (cushion-v3 stage 2, issue #9 checklist
    /// item: the > 2.5 m/s Mathavan validity-domain flag). ADDITIVE: serde-
    /// defaulted AND skipped when default, so every pre-stage-2 JSON record
    /// parses unchanged and default-stats records serialize to the exact
    /// pre-stage-2 bytes (the pinned-record byte-parity gate).
    #[serde(default, skip_serializing_if = "ShotStats::is_default")]
    pub stats: ShotStats,
}

/// Per-shot diagnostic counters (never physics inputs — replay ignores them).
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct ShotStats {
    /// Number of bed-contact cushion impacts resolved by the Mathavan 2010
    /// model whose pre-impact NORMAL speed exceeded
    /// [`crate::resolve::cushion_mathavan::MATHAVAN_VALIDITY_VN_MAX`]
    /// (2.5 m/s) — outside the rigid dual-contact scheme's experimentally
    /// validated domain (Mathavan 2010 §3.3 tests span 0.28–3.5 m/s ARRIVAL
    /// speed; the rigid-impact assumptions degrade with cushion deformation
    /// above ~2.5 m/s normal speed, issue #9 checklist). Only the
    /// Mathavan2010 model counts (the flag is defined for ITS validity
    /// domain), so Han/Stronge records keep default stats and byte-identical
    /// serialization.
    #[serde(default)]
    pub cushion_impacts_beyond_validity: u32,
    /// Number of escalated frozen-cluster resolutions that entered the
    /// compliant path (`ClusterModel::CompliantChain`, feature 018 /
    /// GitHub issue #20) but failed a post-window guard — non-finite
    /// state, kinetic-energy gain beyond the restitution-consistent bound
    /// (the Gismeros Moreno et al. 2022 §1.3 artifact class,
    /// DOI 10.1007/s11071-021-07117-4), or penetrating-while-approaching
    /// contact at the step cap — and deterministically fell back to the
    /// legacy `resolve_cluster` on the pre-window state
    /// (the cluster-model API contract §3;
    /// research R8). Incremented once per fallback. ADDITIVE (the
    /// `cushion_impacts_beyond_validity` precedent) and additionally
    /// field-skipped at 0: the default `SequentialImpulse` path never
    /// routes through the compliant resolver, so every pre-018 and
    /// default-path record — including records whose stats already
    /// serialize for the cushion counter (e.g. the rules-corpus fixtures)
    /// — keeps byte-identical serialization. A nonzero count in normal
    /// play is a defect signal: the feature-018 validation sweeps gate it
    /// to zero (the validation-gates contract §G-DET).
    #[serde(default, skip_serializing_if = "u32_is_zero")]
    pub cluster_compliant_fallbacks: u32,
}

/// Serde field-skip predicate for additive `ShotStats` counters whose 0
/// value must leave pre-existing record bytes untouched (feature 018).
fn u32_is_zero(n: &u32) -> bool {
    *n == 0
}

impl ShotStats {
    /// Serde skip predicate: default stats serialize to the pre-stage-2
    /// record shape (byte parity for pinned records).
    pub fn is_default(&self) -> bool {
        *self == ShotStats::default()
    }
}

/// One ball's sampled kinematic state at a query time (render consumption).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct BallSample {
    pub id: BallId,
    pub pos: Vec3,
    pub orient: Quat,
    pub motion: MotionState,
}

impl ShotRecord {
    /// Total simulated duration \[s\] (time of the final event; 0 if empty).
    pub fn duration(&self) -> f64 {
        self.events.last().map_or(0.0, |e| e.t)
    }

    /// Lossless JSON serialization (serde_json; the crate enables
    /// `float_roundtrip` so parse(serialize(x)) is bit-identical for f64).
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).expect("ShotRecord contains no non-finite floats")
    }

    /// Parse a record, enforcing versions — the STRICT variant (contract
    /// §M8):
    ///
    /// - `format_version` must equal [`FORMAT_VERSION`] exactly, otherwise
    ///   `Err(SimError::InvalidInput)`;
    /// - `kernel_version` must equal [`crate::consts::KERNEL_VERSION`]
    ///   exactly, otherwise `Err(SimError::InvalidInput)` with BOTH versions
    ///   surfaced in the message. Caveat (doc-noted): records from other
    ///   kernel builds parse structurally but are rejected here because
    ///   cross-version replay is not bit-reproducible (constitution P-III);
    ///   the integration phase may relax this to a parse-with-warning
    ///   policy.
    pub fn from_json(s: &str) -> Result<ShotRecord, SimError> {
        let rec: ShotRecord = serde_json::from_str(s)
            .map_err(|e| SimError::InvalidInput(format!("shot record JSON: {e}")))?;
        if rec.format_version != FORMAT_VERSION {
            return Err(SimError::InvalidInput(format!(
                "unsupported shot record format_version {} (expected {FORMAT_VERSION})",
                rec.format_version
            )));
        }
        if rec.kernel_version != crate::consts::KERNEL_VERSION {
            return Err(SimError::InvalidInput(format!(
                "kernel_version mismatch: record produced by \"{}\", this kernel is \"{}\" \
                 (strict replay policy, see ShotRecord::from_json docs)",
                rec.kernel_version,
                crate::consts::KERNEL_VERSION
            )));
        }
        Ok(rec)
    }

    /// Sample all balls at time `t` into `out` (cleared first).
    /// Convenience wrapper over [`crate::sample::Sampler`]: builds a fresh
    /// sampler per call (O(events)); hold [`ShotRecord::sampler`] across
    /// queries in hot paths.
    pub fn sample_at(&self, t: f64, out: &mut Vec<BallSample>) {
        self.sampler().sample_at(t, out);
    }

    /// Build a sampler holding the per-ball segment index (contract §M8).
    /// The sampler is fully owned — build it once per record and reuse it
    /// across queries (hot render paths must not rebuild it per frame).
    pub fn sampler(&self) -> crate::sample::Sampler {
        crate::sample::Sampler::new(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::consts::KERNEL_VERSION;
    use crate::events::EventKind;
    use crate::state::BallState;

    fn push_vec3(bits: &mut Vec<u64>, v: Vec3) {
        bits.extend([v.x.to_bits(), v.y.to_bits(), v.z.to_bits()]);
    }

    fn push_state(bits: &mut Vec<u64>, s: &BallState) {
        push_vec3(bits, s.pos);
        push_vec3(bits, s.vel);
        push_vec3(bits, s.avel);
    }

    /// Every f64 in the record as raw bits, in a fixed traversal order
    /// (shot, options, balls, table, events).
    fn record_f64_bits(rec: &ShotRecord) -> Vec<u64> {
        let mut bits = Vec::new();
        bits.extend(
            [
                rec.shot.v0,
                rec.shot.phi,
                rec.shot.theta,
                rec.shot.a,
                rec.shot.b,
            ]
            .map(f64::to_bits),
        );
        bits.push(rec.options.t_max.to_bits());
        let bb = &rec.options.bb_friction;
        bits.extend([bb.a, bb.b, bb.c].map(f64::to_bits));
        let cf = &rec.options.cushion_friction;
        bits.extend([cf.k, cf.v_ref, cf.mu_min, cf.mu_max].map(f64::to_bits));
        for b in &rec.initial.balls {
            let p = &b.params;
            bits.extend([p.m, p.r, p.u_s, p.u_r, p.u_sp, p.e_b, p.e_c, p.f_c].map(f64::to_bits));
            push_state(&mut bits, &b.state);
        }
        let t = &rec.initial.table;
        bits.extend([t.width, t.length].map(f64::to_bits));
        for s in &t.linear {
            push_vec3(&mut bits, s.p1);
            push_vec3(&mut bits, s.p2);
            bits.push(s.height.to_bits());
        }
        for a in &t.circular {
            push_vec3(&mut bits, a.center);
            bits.extend([a.radius, a.height].map(f64::to_bits));
        }
        for p in &t.pockets {
            push_vec3(&mut bits, p.center);
            bits.push(p.radius.to_bits());
        }
        let cr = &t.cushion_response;
        bits.extend([cr.e0, cr.k_v, cr.v_ref, cr.e_min, cr.e_max].map(f64::to_bits));
        for e in &rec.events {
            bits.push(e.t.to_bits());
            for (_, s) in &e.post {
                push_state(&mut bits, s);
            }
        }
        bits
    }

    /// Record stuffed with adversarial f64s: non-terminating decimals,
    /// subnormals (5e-324 = smallest positive double), extremes, −0.0,
    /// u64::MAX seed.
    fn tricky_record() -> ShotRecord {
        let mut sys = SystemState::nine_ball_rack(7);
        sys.balls[1].state.pos.x = 0.1 + 0.2; // 0.30000000000000004
        sys.balls[2].state.avel = Vec3::new(-0.0, 1.0 / 3.0, f64::MIN_POSITIVE);

        let post1 = BallState {
            pos: Vec3::new(std::f64::consts::PI, 5e-324, f64::MAX),
            vel: Vec3::new(f64::MIN_POSITIVE / 2.0, 1e300, -0.0),
            avel: Vec3::new(9.951e-3, -1.0 / 7.0, f64::MIN),
            motion: MotionState::Sliding,
            pinch: None,
        };
        let post2 = BallState {
            pos: Vec3::new(-0.1, 0.7, 2.0 / 3.0),
            vel: Vec3::new(0.1 + 0.2, -1e-300, 0.0),
            avel: Vec3::ZERO,
            motion: MotionState::Rolling,
            pinch: None,
        };
        let events = vec![
            Event {
                t: 0.0,
                kind: EventKind::Strike { ball: BallId(0) },
                post: vec![(BallId(0), post1)],
            },
            Event {
                t: 1.0 / 3.0,
                kind: EventKind::BallBall {
                    b1: BallId(0),
                    b2: BallId(1),
                },
                post: vec![(BallId(0), post2), (BallId(1), post1)],
            },
            Event {
                t: 2.5 + f64::EPSILON,
                kind: EventKind::Rest,
                post: vec![],
            },
        ];
        ShotRecord {
            kernel_version: KERNEL_VERSION.to_string(),
            format_version: FORMAT_VERSION,
            initial: sys,
            shot: ShotParams {
                v0: 1.0 + f64::EPSILON,
                phi: std::f64::consts::FRAC_PI_4 * 7.0,
                theta: std::f64::consts::PI / 180.0,
                a: -0.25,
                b: 0.1 + 0.2 - 0.05,
                seed: u64::MAX,
            },
            options: SimOptions::default(),
            events,
            stats: ShotStats::default(),
        }
    }

    /// Cushion-v3 stage 2 additive-compatibility: default stats serialize to
    /// the exact pre-stage-2 record bytes (no "stats" key — pinned-record
    /// byte parity), pre-stage-2 JSON parses with default stats, and
    /// non-default stats round-trip.
    #[test]
    fn stats_field_is_additive_skipped_at_default_and_round_trips() {
        let rec = tricky_record();
        let json = rec.to_json();
        assert!(
            !json.contains("stats"),
            "default stats must serialize to the pre-stage-2 shape"
        );
        // The default-stats serialization IS the legacy shape: parsing it
        // exercises the missing-field serde default.
        let back = ShotRecord::from_json(&json).unwrap();
        assert!(back.stats.is_default());
        assert_eq!(back, rec);

        let mut with = rec.clone();
        with.stats.cushion_impacts_beyond_validity = 3;
        let json2 = with.to_json();
        assert!(json2.contains("\"cushion_impacts_beyond_validity\":3"));
        assert_eq!(ShotRecord::from_json(&json2).unwrap(), with);
    }

    /// Feature 018 additive-compatibility
    /// (the cluster-model API contract §3, task T004): the
    /// `cluster_compliant_fallbacks` counter is serde-defaulted and
    /// field-skipped at 0, so (1) default-path records carry no new key,
    /// (2) records whose stats already serialize for the cushion counter
    /// keep their exact pre-018 byte shape, (3) pre-018 stats JSON parses
    /// with the counter defaulted to 0, and (4) a nonzero counter
    /// round-trips.
    #[test]
    fn cluster_fallbacks_field_is_additive_skipped_at_zero_and_round_trips() {
        // (1) default stats: no `stats` key at all (pre-018 default shape).
        let rec = tricky_record();
        assert!(
            !rec.to_json().contains("stats"),
            "default stats must keep the whole-struct skip"
        );

        // (2) non-default stats via the cushion counter only: serializes
        // WITHOUT the new key — byte-identical to the pre-018 shape of
        // pinned records carrying a nonzero cushion counter.
        let mut cushion_only = rec.clone();
        cushion_only.stats.cushion_impacts_beyond_validity = 3;
        let json = cushion_only.to_json();
        assert!(json.contains("\"cushion_impacts_beyond_validity\":3"));
        assert!(
            !json.contains("cluster_compliant_fallbacks"),
            "zero fallbacks must not appear in serialized stats"
        );

        // (3) that pre-018-shaped JSON parses with the counter defaulted.
        let back = ShotRecord::from_json(&json).unwrap();
        assert_eq!(back.stats.cluster_compliant_fallbacks, 0);
        assert_eq!(back, cushion_only);

        // (4) nonzero counter round-trips, alone (the cushion counter
        // keeps its always-serialized-when-stats-present shape) and
        // combined.
        let mut with = rec.clone();
        with.stats.cluster_compliant_fallbacks = 2;
        let json2 = with.to_json();
        assert!(json2.contains("\"cluster_compliant_fallbacks\":2"));
        assert!(json2.contains("\"cushion_impacts_beyond_validity\":0"));
        assert_eq!(ShotRecord::from_json(&json2).unwrap(), with);

        let mut both = rec.clone();
        both.stats.cushion_impacts_beyond_validity = 1;
        both.stats.cluster_compliant_fallbacks = 4;
        assert_eq!(ShotRecord::from_json(&both.to_json()).unwrap(), both);
        assert!(!both.stats.is_default());
    }

    /// to_json → from_json → to_json: f64-bit-identical across the WHOLE
    /// record, structurally equal, and byte-identical on re-serialization
    /// (float_roundtrip guarantee).
    #[test]
    fn json_round_trip_is_bit_identical() {
        let rec = tricky_record();
        let json = rec.to_json();
        let back = ShotRecord::from_json(&json).unwrap();
        assert_eq!(record_f64_bits(&back), record_f64_bits(&rec));
        assert_eq!(back, rec);
        assert_eq!(back.to_json(), json);
    }

    #[test]
    fn from_json_enforces_format_version() {
        let rec = tricky_record();
        assert_eq!(ShotRecord::from_json(&rec.to_json()).unwrap(), rec);

        let mut bad = rec.clone();
        bad.format_version = FORMAT_VERSION + 1;
        assert!(matches!(
            ShotRecord::from_json(&bad.to_json()),
            Err(SimError::InvalidInput(_))
        ));
    }

    /// Strict kernel_version policy: mismatch rejects, surfacing BOTH
    /// versions in the error message.
    #[test]
    fn from_json_rejects_kernel_version_mismatch() {
        let mut bad = tricky_record();
        bad.kernel_version = "9.9.9+other".to_string();
        match ShotRecord::from_json(&bad.to_json()) {
            Err(SimError::InvalidInput(msg)) => {
                assert!(msg.contains("9.9.9+other"), "{msg}");
                assert!(msg.contains(KERNEL_VERSION), "{msg}");
            }
            other => panic!("expected InvalidInput, got {other:?}"),
        }
    }

    /// Malformed JSON reports InvalidInput, not a panic.
    #[test]
    fn from_json_rejects_malformed_json() {
        assert!(matches!(
            ShotRecord::from_json("{ not json"),
            Err(SimError::InvalidInput(_))
        ));
    }
}
