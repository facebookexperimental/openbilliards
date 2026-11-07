// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Compliant multibody frozen-cluster resolution (feature 018, GitHub
//! issue #20) — the `ClusterModel::CompliantChain` implementation.
//!
//! Cluster-local, fixed-step, time-domain compliant integration: every
//! active contact carries a Hertz + Lankarani–Nikravesh normal force plus a
//! Coulomb tangential force with the kernel's Alciatore μ(v_slip) curve; all
//! contacts advance CONCURRENTLY with a semi-implicit Euler step at fixed
//! `dt` until every contact has terminated (early exit) or a hard step cap
//! fires. This carries the wave physics the sequential Gauss–Seidel sweeps
//! (`resolve/cluster.rs`) provably cannot: 2D wedge bracing (the apex is
//! loaded by both wing contacts while the cue contact still compresses —
//! the source of back-reaction beyond the 1-D dispersion value), partial
//! middle-ball retention (dispersion instead of ideal-cradle starvation),
//! and no sweep order (Jacobi force accumulation, mirror-equivariant).
//!
//! Literature (Principle I; every model element cites its source):
//!
//! - **Gismeros Moreno et al. 2022** (Nonlinear Dyn 107:1859–1886,
//!   DOI 10.1007/s11071-021-07117-4): billiard-specific Hertz +
//!   Lankarani–Nikravesh application; material parameters (Table 1:
//!   E = 3800 MPa, ν = 0.375 phenolic resin) feeding
//!   [`K_HERTZ_BILLIARD`]; their §3 LN damping form with c_r; documented
//!   compliant-model failure modes (z-direction energy gain at too-small
//!   gaps, step-size sensitivity) that the post-window guards fail closed
//!   on (the cluster-model API contract §3, research R8).
//! - **Lankarani & Nikravesh 1990** (ASME J Mech Des 112:369–376):
//!   hysteretic damping `F = δ^{3/2}·(K + χ·δ̇)` with
//!   `χ = 3K(1−e²)/(4·δ̇⁻)` — the continuous-contact restitution form used
//!   by Gismeros 2022 §3.
//! - **Hinch & Saint-Jean 1999** (Proc R Soc A 455:3201–3220): the elastic
//!   Hertz ball chain — dispersive wave propagation, striker rebound
//!   −0.07·V, far-ball 0.986·V (the G-ANCHOR-NEW chain anchor); the
//!   cohesionless condition (normal force clamped ≥ 0, no adhesive pull).
//! - **Leonard, Chong, Kevrekidis & Daraio 2014** (Granular Matter
//!   16:531–542): impulsively excited uncompressed hexagonal sphere
//!   packings — the rack lattice — with fixed-step Hertzian integration
//!   reproducing measured wavefront decay along lattice directions (the
//!   qualitative lattice anchor).
//! - **Nesterenko 1983 / Coste, Falcon & Fauve 1997**: the uncompressed
//!   ("sonic vacuum") strongly nonlinear regime grounding the fixed-step
//!   discretization scale (research R3).
//! - Local syntheses: `docs/research/gap-break-multibody.md` §(b),
//!   `docs/research/break-cue-back-reaction.md` §3b.
//!
//! Determinism by construction (constitution P-III, FR-007): fixed `dt`,
//! fixed sorted contact traversal, Jacobi force accumulation reading ONLY
//! previous-step state, hard step cap, early exit as a pure state check —
//! the step count is a pure function of the input state (SC-006). Numeric
//! discipline: `+ − × ÷`, `libm::sqrt`, and the existing `libm::exp` inside
//! the Alciatore μ(v) curve ONLY — `δ^{3/2}` is written `δ * libm::sqrt(δ)`,
//! no `powf`, no trig, no new libm surface (wasm-bit-exact).

/// Hertz stiffness [N/m^1.5] for regulation phenolic billiard balls.
///
/// DERIVED (Hertz theory over Gismeros Moreno et al. 2022 Table 1 +
/// kernel ball radius; provenance FR-002/research R2):
/// `K = (4/3)·E*·sqrt(R*)` with `1/E* = 2·(1−ν²)/E` (identical spheres)
/// and `R* = R/2`; E = 3800 MPa, ν = 0.375 (phenolic resin, Gismeros 2022
/// Table 1), R = 28.575 mm (kernel `BallParams::default().r`):
/// `E* = 3.8e9 / (2·(1 − 0.375²)) ≈ 2.211e9 Pa`,
/// `K = (4/3)·2.211e9·sqrt(0.0142875) ≈ 3.524e8 N/m^1.5`.
/// The paper gives the materials, not K — the derivation is ours
/// (gap-break-multibody.md §1.1 note). Runtime-overridable via
/// `ClusterModel::CompliantChain { k_hertz }` for non-default ballsets;
/// a ±2× insensitivity study is a validation deliverable (K sets contact
/// time and stiffness, not restitution).
pub const K_HERTZ_BILLIARD: f64 = 3.524e8;

/// Default fixed integration step [s] (research R3): the Hertz contact time
/// for billiard balls is ~100–300 µs (≈ 270 µs at the 13.85 m/s break
/// impact, v^{−1/5} scaling), so 1 µs gives ≥ 100–270 steps per contact —
/// the fixed-step regime the granular-crystal literature validated
/// (Leonard et al. 2014; Nguyen & Brogliato 2012, Granular Matter
/// 14:341–362). 10× finer than Gismeros 2022's converged 1e-5 s step
/// (their §1.2 step-size-sensitivity trap is guarded by the dt-halving
/// validation study, G-DET 3).
pub const COMPLIANT_DT_DEFAULT: f64 = 1e-6;

/// Default hard step cap (window = dt·max_steps = 3 ms at the default dt;
/// research R3): the observed break transient (primary wave + wing
/// separations + the ~0.4 ms apex–cue re-kiss, which lands INSIDE the
/// window) completes in ~1–2 ms; 3 ms caps it with margin. A cap hit with
/// residual approaching penetration falls back deterministically to the
/// legacy resolver (contract §3, research R8).
pub const COMPLIANT_MAX_STEPS_DEFAULT: u32 = 3000;

/// Lower clamp [m/s] on the latched normal approach speed δ̇⁻ feeding the
/// Lankarani–Nikravesh damping factor χ = 3K(1−e²)/(4·δ̇⁻): χ → ∞ as
/// δ̇⁻ → 0 is the LN grazing singularity; the clamp bounds it
/// deterministically (documented numerical guard, same class as the
/// kernel's Zeno thresholds — research R2).
pub const GRAZING_CLAMP: f64 = 1e-3;

use crate::consts::Eps;
use crate::params::BallBallFriction;
use crate::resolve::cluster::resolve_cluster;
use crate::shot::BallBallSlipLaw;
use crate::state::{Ball, MotionState};
use crate::types::Vec3;

/// Legacy Gauss–Seidel sweep bound used by the deterministic guard
/// fallback (the cluster-model API contract §3.4): identical to
/// `sim/event_loop.rs::CLUSTER_MAX_ITERS` — the fallback must equal a
/// direct legacy `resolve_cluster` run on the same inputs.
const LEGACY_CLUSTER_MAX_ITERS: u32 = 256;

/// Cluster boundary tolerance [m] for the mid-window hand-off guard:
/// identical to `sim/event_loop.rs::CLUSTER_CONTACT_EPS` (the escalation's
/// touching predicate). The window integrates END-OF-WINDOW POSITIONS
/// (research R6: member displacements reach mm scale in a zero-sim-time
/// event), so a member can close on a ball OUTSIDE the fixed contact set —
/// a gapped rack neighbor 0.05–0.5 mm away, or a fellow member with no
/// contact edge. Integrating past that contact would hand the event loop a
/// deeply penetrating pair (measured: up to 2.5 mm ≈ 44 J of phantom Hertz
/// energy at the next escalation — the exact R6 hand-off-invariant
/// violation). The window therefore STOPS when any such non-edge pair
/// first comes within this tolerance while approaching; the event loop
/// detects the new contact as its own event and re-escalates with the
/// newcomer as a member (the wave continues across windows). Non-edge
/// pairs start strictly OUTSIDE this tolerance (anything inside it was
/// already swept into the cluster by `contact_cluster`), so every window
/// advances ≥ 1 step — no Zeno stall.
const CLUSTER_BOUNDARY_EPS: f64 = 1e-5;

/// Why the compliant integration was discarded and the legacy resolver run
/// instead (contract §3; research R8 — the literature's compliant-model
/// failure modes fail closed).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClusterFallbackReason {
    /// A touched state came out non-finite (Principle III: no NaN).
    NonFinite,
    /// Post-window cluster kinetic energy exceeded the restitution-
    /// consistent bound KE_pre + 1e-9 (LN damping and Coulomb friction only
    /// dissipate; the Gismeros 2022 §1.3 z-energy-gain artifact class must
    /// be unreachable).
    EnergyGain,
    /// The step cap fired while some pair still penetrates beyond
    /// `Eps::SPACE` approaching — an illegal hand-off geometry (research
    /// R6 hand-off invariants).
    PenetratingAtCap,
}

/// Outcome of [`resolve_cluster_compliant`].
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClusterOutcome {
    /// The compliant window completed and the guards passed; `steps` is a
    /// pure function of the input state (SC-006).
    Integrated { steps: u32 },
    /// A guard fired: the pre-window states were restored and the legacy
    /// `resolve_cluster` resolved the cluster instead (deterministically —
    /// pure function of the same inputs, research R8).
    FellBack { reason: ClusterFallbackReason },
}

/// Alciatore TP A-14 friction fit μ(v) = a + b·exp(−c·v) — the same curve
/// (and the same `libm::exp` surface) as
/// `resolve/ball_ball.rs::alciatore_mu` / Gismeros 2022 Eq. 3.8, reused
/// verbatim from `SimOptions::bb_friction` (research R2: zero new
/// calibration surface).
fn alciatore_mu(friction: &BallBallFriction, v_rel: f64) -> f64 {
    friction.a + friction.b * libm::exp(-friction.c * v_rel)
}

/// True when either endpoint of a contact cannot participate.
fn degenerate(balls: &[Ball], i: usize, j: usize) -> bool {
    balls[i].state.motion == MotionState::Pocketed
        || balls[j].state.motion == MotionState::Pocketed
}

/// Pure early-exit predicate (contract §2 step (iv)): every contact is
/// open (δ ≤ 0) AND non-approaching (normal relative velocity
/// ≥ −`Eps::VEL`). A separated pair still approaching keeps the window
/// open — that is how the ~0.4 ms apex–cue re-kiss resolves INSIDE the
/// window (research R6). Coincident-center contacts are skipped (no
/// defined normal — same as the legacy resolver).
fn all_contacts_terminated(balls: &[Ball], order: &[(usize, usize)]) -> bool {
    for &(i, j) in order {
        if degenerate(balls, i, j) {
            continue;
        }
        let d = balls[j].state.pos - balls[i].state.pos;
        let lim = balls[i].params.r + balls[j].params.r;
        let dist_sq = d.norm_sq();
        if dist_sq < lim * lim {
            return false; // still penetrating (δ > 0)
        }
        let approach = (balls[j].state.vel - balls[i].state.vel).dot(d);
        if approach >= 0.0 {
            continue; // separating along the center line
        }
        let dist = libm::sqrt(dist_sq);
        if dist <= Eps::SPACE {
            continue; // coincident centers: no defined normal
        }
        if approach / dist < -Eps::VEL {
            return false; // open but approaching: re-kiss pending
        }
    }
    true
}

/// Cluster kinetic energy (linear + rotational, I = (2/5)·m·r²) over the
/// member set — the kinetic part of the energy-audit observable.
fn cluster_ke(balls: &[Ball], members: &[usize]) -> f64 {
    members
        .iter()
        .map(|&m| {
            let p = &balls[m].params;
            let s = &balls[m].state;
            let inertia = 0.4 * p.m * p.r * p.r;
            0.5 * p.m * s.vel.norm_sq() + 0.5 * inertia * s.avel.norm_sq()
        })
        .sum()
}

/// Hertz elastic potential energy stored in penetrating contact edges:
/// `PE = ∫F_elastic dδ = (2/5)·K·δ^{5/2}` per contact (the conservative
/// part of the LN force; the χ term is pure dissipation). The audit
/// observable is `KE + PE`: on a CLEAN window (all contacts open at both
/// ends — every anchor case and every first-touch escalation) both PE
/// terms are zero and the audit reduces EXACTLY to the contract §3.2
/// kinetic bound; on a mid-wave continuation window (a boundary hand-off
/// left edges compressed, [`CLUSTER_BOUNDARY_EPS`]) it credits the stored
/// elastic energy the kinetic-only bound would misread as gain.
/// `δ^{5/2}` is written `δ·δ·sqrt(δ)` (numeric discipline, no `powf`).
fn cluster_pe(balls: &[Ball], order: &[(usize, usize)], k_hertz: f64) -> f64 {
    let mut pe = 0.0;
    for &(i, j) in order {
        if degenerate(balls, i, j) {
            continue;
        }
        let d = balls[j].state.pos - balls[i].state.pos;
        let lim = balls[i].params.r + balls[j].params.r;
        let dist_sq = d.norm_sq();
        if dist_sq >= lim * lim {
            continue;
        }
        let dist = libm::sqrt(dist_sq);
        if dist <= Eps::SPACE {
            continue;
        }
        let delta = lim - dist;
        pe += 0.4 * k_hertz * (delta * delta * libm::sqrt(delta));
    }
    pe
}

/// Mid-window boundary hand-off predicate (see [`CLUSTER_BOUNDARY_EPS`]):
/// true when any candidate non-edge pair is within the boundary tolerance
/// while approaching. A pure any-pair predicate over a fixed list — no
/// per-pair state, so it is order-independent and mirror-equivariant.
fn boundary_reached(balls: &[Ball], candidates: &[(usize, usize)]) -> bool {
    for &(i, j) in candidates {
        if degenerate(balls, i, j) {
            continue;
        }
        let d = balls[j].state.pos - balls[i].state.pos;
        let lim = balls[i].params.r + balls[j].params.r + CLUSTER_BOUNDARY_EPS;
        if d.norm_sq() > lim * lim {
            continue;
        }
        // Within the boundary tolerance: stop only if actually approaching.
        if (balls[j].state.vel - balls[i].state.vel).dot(d) < 0.0 {
            return true;
        }
    }
    false
}

/// Resolve an escalated frozen cluster by fixed-step compliant integration.
/// Pure function of its inputs; no RNG, no clock, no HashMap iteration.
///
/// Frozen step semantics (the cluster-model API contract §2):
///
/// 1. **Contact normalization**: `(i, j)` normalized to `i < j`, sorted,
///    deduplicated — identical to [`resolve_cluster`].
/// 2. **Force pass (Jacobi)**: traverse contacts in that sorted order,
///    computing from the PREVIOUS step's state only (order independence,
///    research R7): `δ = r_i + r_j − |d|`; if `δ > 0`, the
///    Lankarani–Nikravesh normal force
///    `F_N = δ^{3/2}·(K + χ·δ̇)` clamped ≥ 0 (no adhesive pull — Hinch
///    1999 cohesionless condition), with the hysteretic damping factor
///    `χ = 3·K·(1 − e²)/(4·max(δ̇⁻, GRAZING_CLAMP))` (Lankarani &
///    Nikravesh 1990 as used by Gismeros 2022 §3 — the contract §2 writes
///    the same force `K·δ^{3/2}·(1 + χ̃·δ̇)` with the stiffness factored
///    out, χ̃ = χ/K), `e = (e_b_i + e_b_j)/2` (the kernel's single
///    restitution truth), and `δ̇⁻` latched at that contact's first
///    penetrating step of the window. Tangential force = Coulomb
///    `μ(v_slip)·F_N` opposing the contact-point slip
///    ([`alciatore_mu`]; spin torque `r × F_t`).
/// 3. **Integration (semi-implicit Euler)**: members in ascending index
///    order — `v += (F/m)·dt`, `ω += (τ/I)·dt`, then `pos += v·dt`. No
///    gravity, no cloth force inside the window (research R6: ≤ 0.05%
///    velocity effect). The rigid bed cannot be penetrated: a center
///    integrated below `z = r` is re-seated to the bed (position only —
///    a downward vz survives to the post-window hop guard exactly like
///    the legacy path's press-down outputs, Amendment 010 semantics).
/// 4. **Early exit**: when every contact has δ ≤ 0 and normal relative
///    velocity ≥ −`Eps::VEL` ([`all_contacts_terminated`]); the step count
///    is a pure function of the input state (SC-006).
/// 5. **Guards, post-window in order** (contract §3): finite states →
///    energy audit (KE ≤ KE_pre + 1e-9) → cap-with-penetration; any
///    violation restores the pre-window snapshot and runs the legacy
///    [`resolve_cluster`] on the same inputs (deterministic fallback).
/// 6. **Relabeling**: every touched on-bed ball passes the same micro-hop
///    Zeno guard + `final_motion_state` relabeling as the legacy path
///    (Amendment 002 airborne semantics preserved verbatim).
///
/// `slip_law` (issue #77, Amendment 018) reaches ONLY the guard-fallback
/// [`resolve_cluster`] run — the compliant window itself is force-based
/// Coulomb (no impulse cap), so the law cannot affect a non-fallback
/// outcome.
#[allow(clippy::too_many_arguments)] // frozen contract signature (§2)
pub fn resolve_cluster_compliant(
    balls: &mut [Ball],
    contacts: &[(usize, usize)],
    friction: &BallBallFriction,
    dt: f64,
    max_steps: u32,
    k_hertz: f64,
    hop_min_height: f64,
    slip_law: BallBallSlipLaw,
) -> ClusterOutcome {
    // (1) Deterministic contact ordering: normalize (i, j) to i < j, sort,
    // dedup — identical to `resolve_cluster`.
    let mut order: Vec<(usize, usize)> = contacts
        .iter()
        .filter(|&&(i, j)| i != j && i < balls.len() && j < balls.len())
        .map(|&(i, j)| if i < j { (i, j) } else { (j, i) })
        .collect();
    order.sort_unstable();
    order.dedup();
    if order.is_empty() {
        return ClusterOutcome::Integrated { steps: 0 };
    }

    // Member set: sorted unique endpoints of the normalized contacts.
    let mut members: Vec<usize> = order.iter().flat_map(|&(i, j)| [i, j]).collect();
    members.sort_unstable();
    members.dedup();

    // Pre-window snapshot: the fallback restore point AND the energy-audit
    // baseline (contract §3; kinetic + stored Hertz elastic energy — see
    // `cluster_pe`).
    let snapshot: Vec<crate::state::BallState> =
        members.iter().map(|&m| balls[m].state).collect();
    let e_pre = cluster_ke(balls, &members) + cluster_pe(balls, &order, k_hertz);

    // Boundary hand-off candidates (see `CLUSTER_BOUNDARY_EPS`): every
    // (member, other-ball) and (member, member) pair WITHOUT a contact
    // edge, normalized/sorted/deduped for determinism. Pairs already
    // inside the boundary tolerance at window start are excluded (they can
    // only be crafted inputs — the escalation's transitive closure sweeps
    // everything inside the tolerance into the member set).
    let boundary_candidates: Vec<(usize, usize)> = {
        let mut cands: Vec<(usize, usize)> = Vec::new();
        for &m in &members {
            for b in 0..balls.len() {
                if b == m {
                    continue;
                }
                let pair = if m < b { (m, b) } else { (b, m) };
                cands.push(pair);
            }
        }
        cands.sort_unstable();
        cands.dedup();
        cands.retain(|pair| {
            if order.binary_search(pair).is_ok() {
                return false; // contact edge: handled by the force pass
            }
            let (i, j) = *pair;
            if degenerate(balls, i, j) {
                return false;
            }
            let d = balls[j].state.pos - balls[i].state.pos;
            let lim = balls[i].params.r + balls[j].params.r + CLUSTER_BOUNDARY_EPS;
            d.norm_sq() > lim * lim // keep only pairs starting outside
        });
        cands
    };

    // Per-contact LN reference speed δ̇⁻ [m/s], maintained as the LARGEST
    // EQUIVALENT IMPACT SPEED the contact has exhibited so far: the Hertz
    // energy inversion `sqrt(δ̇² + 4·K·δ^{5/2}/(5·m_eff))` — the approach
    // speed that would elastically produce the contact's current
    // mechanical energy (½·m_eff·δ̇² + (2/5)·K·δ^{5/2}), clamped ≥
    // GRAZING_CLAMP when consumed.
    //
    // Why not the contract's literal "δ̇⁻ latched at the first penetrating
    // step": (1) an initially-RESTING lattice contact (frozen rack, δ = 0,
    // relative speed 0) first penetrates at numerical-dust speed — the
    // literal latch clamps to GRAZING_CLAMP and yields χ ≈ 2.6e10, a
    // spuriously near-plastic contact that collapses the model onto the
    // rigid-aggregate bound (measured: −0.368 wedge ≈ the −0.39
    // Moreau-class failure research R1 rejects; cradle middle ball
    // retaining 61%). (2) a contact entering a CONTINUATION window
    // mid-compression (boundary hand-off, `CLUSTER_BOUNDARY_EPS`) has
    // δ̇ ≈ 0 at its compression peak — a current-speed latch forgets the
    // original impact and plasticizes the restitution half (measured: the
    // break rebound collapsing to 0.084 at v0 = 12). The energy inversion
    // restores LN's definition — δ̇⁻ is the contact's IMPACT velocity
    // (Lankarani & Nikravesh 1990) — for clean impacts it equals the
    // first-penetrating-step approach speed exactly (δ ≈ 0 ⇒ est = δ̇),
    // and it is dissipation-consistent for compressed hand-offs (the
    // estimate can only underestimate the true impact speed by the energy
    // already dissipated ⇒ never less damping than physical). Energy
    // safety is unconditional regardless of the χ history: the damping
    // component dissipates χ·δ^{3/2}·δ̇² ≥ 0 at every instant.
    let mut dd_max: Vec<f64> = vec![0.0; order.len()];

    // Per-ball force/torque accumulators (index-aligned with `balls`;
    // cleared each step — the feature data-model §3 ClusterSim).
    let mut force: Vec<Vec3> = vec![Vec3::ZERO; balls.len()];
    let mut torque: Vec<Vec3> = vec![Vec3::ZERO; balls.len()];

    let mut steps: u32 = 0;
    let mut capped = false;
    loop {
        // (4) Early exit as a pure state check (checked before each step,
        // which is the same predicate as "after each step" plus the no-op
        // fast path for an already-terminated cluster).
        if all_contacts_terminated(balls, &order) {
            break;
        }
        if steps == max_steps {
            capped = true;
            break;
        }

        // (2) Jacobi force pass in sorted contact order, reading ONLY the
        // previous step's state.
        for &m in &members {
            force[m] = Vec3::ZERO;
            torque[m] = Vec3::ZERO;
        }
        for (c, &(i, j)) in order.iter().enumerate() {
            if degenerate(balls, i, j) {
                continue;
            }
            let d = balls[j].state.pos - balls[i].state.pos;
            let lim = balls[i].params.r + balls[j].params.r;
            let dist_sq = d.norm_sq();
            if dist_sq >= lim * lim {
                continue; // open contact: ~5-flop gap check (research R10)
            }
            let dist = libm::sqrt(dist_sq);
            if dist <= Eps::SPACE {
                continue; // coincident centers: no defined normal
            }
            let n = d * (1.0 / dist);
            let delta = lim - dist;
            // Penetration rate δ̇ > 0 while approaching.
            let delta_dot = -(balls[j].state.vel - balls[i].state.vel).dot(n);
            let delta_32 = delta * libm::sqrt(delta); // δ^{3/2}, no powf
            // Equivalent impact speed (see `dd_max` doc): the Hertz energy
            // inversion over the contact's current mechanical energy.
            let m_eff = balls[i].params.m * balls[j].params.m
                / (balls[i].params.m + balls[j].params.m);
            let dd_est = libm::sqrt(
                delta_dot * delta_dot + 4.0 * k_hertz * (delta_32 * delta) / (5.0 * m_eff),
            );
            if dd_est > dd_max[c] {
                dd_max[c] = dd_est;
            }
            let e = 0.5 * (balls[i].params.e_b + balls[j].params.e_b);
            let dd_minus = if dd_max[c] > GRAZING_CLAMP {
                dd_max[c]
            } else {
                GRAZING_CLAMP // LN grazing-singularity clamp
            };
            let chi = 3.0 * k_hertz * (1.0 - e * e) / (4.0 * dd_minus);
            // LN normal force, cohesionless (Hinch 1999): never adhesive.
            let f_n = delta_32 * (k_hertz + chi * delta_dot);
            let f_n = if f_n > 0.0 { f_n } else { 0.0 };
            force[i] = force[i] - n * f_n;
            force[j] = force[j] + n * f_n;

            // Coulomb tangential force opposing the contact-point slip
            // (Alciatore μ(v_slip) — TP A-14, Gismeros 2022 Eq. 3.8) plus
            // the spin torque r × F_t on both balls.
            let ri = balls[i].params.r;
            let rj = balls[j].params.r;
            let vi_c = balls[i].state.vel + balls[i].state.avel.cross(n * ri);
            let vj_c = balls[j].state.vel + balls[j].state.avel.cross(n * (-rj));
            let v_rel = vi_c - vj_c;
            let v_t = v_rel - n * v_rel.dot(n);
            let slip = v_t.norm();
            if slip > Eps::VEL && f_n > 0.0 {
                let mu = alciatore_mu(friction, slip);
                let f_t = v_t * (-(mu * f_n) / slip); // on i, opposing its slip
                force[i] = force[i] + f_t;
                force[j] = force[j] - f_t;
                torque[i] = torque[i] + (n * ri).cross(f_t);
                // Lever arm on j is −r_j·n̂ and its force is −F_t:
                // (−r_j·n̂) × (−F_t) = (r_j·n̂) × F_t.
                torque[j] = torque[j] + (n * rj).cross(f_t);
            }
        }

        // (3) Semi-implicit Euler over members in ascending index order.
        for &m in &members {
            if balls[m].state.motion == MotionState::Pocketed {
                continue;
            }
            let (m_inv, inertia, r) = {
                let p = &balls[m].params;
                (1.0 / p.m, 0.4 * p.m * p.r * p.r, p.r)
            };
            let s = &mut balls[m].state;
            s.vel = s.vel + force[m] * (m_inv * dt);
            s.avel = s.avel + torque[m] * (dt / inertia);
            s.pos = s.pos + s.vel * dt;
            if s.pos.z < r {
                s.pos.z = r; // rigid bed support (no gravity in the window)
            }
        }
        steps += 1;

        // Boundary hand-off (see `CLUSTER_BOUNDARY_EPS`): a member reached
        // a ball outside the fixed contact set — stop the window HERE; the
        // event loop detects the new contact as its own event and
        // re-escalates with the newcomer as a member (mid-wave edges stay
        // compressed; the PE term of the energy audit accounts for them).
        if boundary_reached(balls, &boundary_candidates) {
            break;
        }
    }

    // (5) Post-window guards, in contract §3 order; any violation restores
    // the snapshot and runs the legacy resolver on the same inputs.
    let fall_back = |balls: &mut [Ball], reason: ClusterFallbackReason| {
        #[cfg(feature = "dbg-events")]
        eprintln!(
            "DBG018 fallback {reason:?} members={members:?} steps={steps} capped={capped}"
        );
        for (&m, s) in members.iter().zip(&snapshot) {
            balls[m].state = *s;
        }
        resolve_cluster(
            balls,
            contacts,
            friction,
            LEGACY_CLUSTER_MAX_ITERS,
            hop_min_height,
            slip_law,
        );
        ClusterOutcome::FellBack { reason }
    };

    for &m in &members {
        if !balls[m].state.is_finite() {
            return fall_back(balls, ClusterFallbackReason::NonFinite);
        }
    }
    if cluster_ke(balls, &members) + cluster_pe(balls, &order, k_hertz) > e_pre + 1e-9 {
        #[cfg(feature = "dbg-events")]
        {
            let lin = |s: &crate::state::BallState, p: &crate::params::BallParams| {
                0.5 * p.m * s.vel.norm_sq()
            };
            let rot = |s: &crate::state::BallState, p: &crate::params::BallParams| {
                0.5 * (0.4 * p.m * p.r * p.r) * s.avel.norm_sq()
            };
            let (mut pl, mut pr, mut ql, mut qr) = (0.0, 0.0, 0.0, 0.0);
            for (&m, s) in members.iter().zip(&snapshot) {
                pl += lin(s, &balls[m].params);
                pr += rot(s, &balls[m].params);
                ql += lin(&balls[m].state, &balls[m].params);
                qr += rot(&balls[m].state, &balls[m].params);
            }
            eprintln!(
                "DBG018 energy pre(lin={pl:.6e} rot={pr:.6e}) post(lin={ql:.6e} rot={qr:.6e}) d={:+.3e}",
                (ql + qr) - (pl + pr)
            );
            for (&m, s) in members.iter().zip(&snapshot) {
                eprintln!(
                    "DBG018   m={m} pre pos=({:.6},{:.6},{:.6}) vel=({:.4},{:.4},{:.4}) avel=({:.2},{:.2},{:.2}) {:?}",
                    s.pos.x, s.pos.y, s.pos.z, s.vel.x, s.vel.y, s.vel.z,
                    s.avel.x, s.avel.y, s.avel.z, s.motion
                );
            }
        }
        return fall_back(balls, ClusterFallbackReason::EnergyGain);
    }
    if capped {
        for &(i, j) in &order {
            if degenerate(balls, i, j) {
                continue;
            }
            let d = balls[j].state.pos - balls[i].state.pos;
            let lim = balls[i].params.r + balls[j].params.r;
            let dist = d.norm();
            if dist <= Eps::SPACE {
                continue;
            }
            let vn = (balls[j].state.vel - balls[i].state.vel).dot(d) / dist;
            if lim - dist > Eps::SPACE && vn < -Eps::VEL {
                #[cfg(feature = "dbg-events")]
                eprintln!(
                    "DBG018 pen-at-cap pair=({i},{j}) delta={:.3e} vn={:.3e}",
                    lim - dist,
                    vn
                );
                return fall_back(balls, ClusterFallbackReason::PenetratingAtCap);
            }
        }
    }

    // (6) Relabel touched balls — identical to the legacy path (Amendment
    // 002 airborne semantics; on-bed micro-hop Zeno guard first, then the
    // shared `final_motion_state` helper).
    for (&m, before) in members.iter().zip(&snapshot) {
        if balls[m].state == *before {
            continue;
        }
        let ball = &mut balls[m];
        if ball.state.pos.z <= ball.params.r + Eps::SPACE
            && crate::resolve::ball_table::bounce_height(ball.state.vel.z) < hop_min_height
        {
            ball.state.vel.z = 0.0;
        }
        ball.state.motion =
            crate::resolve::ball_table::final_motion_state(&ball.state, &ball.params);
    }
    ClusterOutcome::Integrated { steps }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::params::BallParams;
    use crate::state::BallState;
    use crate::types::{BallId, Vec3};

    const R: f64 = 0.028575;
    const E_B: f64 = 0.95; // BallParams::default().e_b
    /// Default micro-hop Zeno threshold (SimOptions::bb_hop_min_height).
    const HOP: f64 = crate::resolve::ball_table::MIN_BOUNCE_HEIGHT;
    /// Default slip law (Amendment 018): the compliant window is force-based
    /// (law-independent); only the guard fallback consumes it.
    const LAW: BallBallSlipLaw = BallBallSlipLaw::CoulombCap;

    /// Zero-μ friction curve (μ(v) ≡ 0): isolates the normal-force chain
    /// physics the Hinch 1999 anchor is stated for.
    fn no_friction() -> BallBallFriction {
        BallBallFriction { a: 0.0, b: 0.0, c: 1.0 }
    }

    fn ball(id: u8, pos: Vec3, vel: Vec3) -> Ball {
        Ball {
            id: BallId(id),
            params: BallParams::default(),
            state: BallState {
                pos,
                vel,
                avel: Vec3::ZERO,
                motion: if vel == Vec3::ZERO {
                    MotionState::Stationary
                } else {
                    MotionState::Sliding
                },
                pinch: None,
            },
        }
    }

    fn momentum(balls: &[Ball]) -> Vec3 {
        balls
            .iter()
            .fold(Vec3::ZERO, |acc, b| acc + b.state.vel * b.params.m)
    }

    fn kinetic_energy(balls: &[Ball]) -> f64 {
        balls
            .iter()
            .map(|b| {
                let i = 0.4 * b.params.m * b.params.r * b.params.r;
                0.5 * b.params.m * b.state.vel.norm_sq() + 0.5 * i * b.state.avel.norm_sq()
            })
            .sum()
    }

    /// A row of `n` touching balls along +x starting at the origin.
    fn touching_row(n: u8) -> Vec<Ball> {
        (0..n)
            .map(|i| ball(i, Vec3::new(2.0 * R * f64::from(i), 0.0, R), Vec3::ZERO))
            .collect()
    }

    fn resolve_defaults(balls: &mut [Ball], contacts: &[(usize, usize)]) -> ClusterOutcome {
        resolve_cluster_compliant(
            balls,
            contacts,
            &BallBallFriction::default(),
            COMPLIANT_DT_DEFAULT,
            COMPLIANT_MAX_STEPS_DEFAULT,
            K_HERTZ_BILLIARD,
            HOP,
            LAW,
        )
    }

    #[test]
    fn no_contacts_is_a_noop() {
        let mut balls = touching_row(3);
        balls[0].state.vel = Vec3::new(1.0, 0.0, 0.0);
        let before = balls.clone();
        let out = resolve_defaults(&mut balls, &[]);
        assert_eq!(out, ClusterOutcome::Integrated { steps: 0 });
        assert_eq!(balls, before);
    }

    #[test]
    fn separating_contacts_are_a_noop() {
        let mut balls = touching_row(2);
        balls[1].state.vel = Vec3::new(1.0, 0.0, 0.0); // moving away from ball 0
        let before = balls.clone();
        let out = resolve_defaults(&mut balls, &[(0, 1)]);
        assert_eq!(out, ClusterOutcome::Integrated { steps: 0 });
        assert_eq!(balls, before);
    }

    /// Symmetric head-on pair: the compliant window must reduce to the
    /// pairwise restitution formula — post velocities ∓e_eff·v with the
    /// Lankarani–Nikravesh effective restitution within 2% of the nominal
    /// e_b = 0.95 (LN's linear-damping construction is first-order accurate
    /// in (1−e); Lankarani & Nikravesh 1990 §4, Gismeros 2022 §3), plus
    /// exact conservation laws and clean hand-off (non-approaching,
    /// separated).
    #[test]
    fn head_on_pair_reduces_to_restitution_formula() {
        let v = 1.0;
        let mut balls = touching_row(2);
        balls[0].state.vel = Vec3::new(v, 0.0, 0.0);
        balls[1].state.vel = Vec3::new(-v, 0.0, 0.0);
        let p_before = momentum(&balls);
        let ke_before = kinetic_energy(&balls);
        let out = resolve_defaults(&mut balls, &[(0, 1)]);
        let ClusterOutcome::Integrated { steps } = out else {
            panic!("head-on pair must integrate, got {out:?}");
        };
        assert!(steps > 0 && steps < COMPLIANT_MAX_STEPS_DEFAULT, "steps = {steps}");
        let frac0 = balls[0].state.vel.x / v;
        let frac1 = balls[1].state.vel.x / v;
        assert!(
            (frac0 + E_B).abs() < 0.02 * E_B,
            "ball 0 exit fraction {frac0} vs −e_b {}",
            -E_B
        );
        assert!(
            (frac1 - E_B).abs() < 0.02 * E_B,
            "ball 1 exit fraction {frac1} vs +e_b {E_B}"
        );
        // exact mirror of the symmetric input
        assert_eq!(frac0.to_bits(), (-frac1).to_bits(), "symmetric pair must mirror");
        assert!((momentum(&balls) - p_before).norm() < 1e-9);
        assert!(kinetic_energy(&balls) <= ke_before + 1e-9);
        // hand-off geometry: separated (δ ≤ 0), not approaching
        let d = balls[1].state.pos - balls[0].state.pos;
        assert!(d.norm() >= 2.0 * R - Eps::SPACE);
        assert!((balls[1].state.vel - balls[0].state.vel).dot(d.normalized()) >= -Eps::VEL);
    }

    /// Cue into the frozen 3-ball wedge (the §3a break-forensics geometry,
    /// zero μ): conservation laws hold, the window terminates by early
    /// exit, and the cue exits BACKWARD — the 2D wedge bracing the
    /// sequential resolver cannot carry (research R1). The magnitude is
    /// pinned by the G-ANCHOR-NEW / G-CLIP gates, not here.
    #[test]
    fn wedge_conserves_and_rebounds_cue() {
        let v = 13.85;
        let row = libm::sqrt(3.0) * R;
        let mut balls = vec![
            ball(0, Vec3::new(0.0, -2.0 * R, R), Vec3::new(0.0, v, 0.0)),
            ball(1, Vec3::new(0.0, 0.0, R), Vec3::ZERO),
            ball(2, Vec3::new(-R, row, R), Vec3::ZERO),
            ball(3, Vec3::new(R, row, R), Vec3::ZERO),
        ];
        let contacts = [(0, 1), (1, 2), (1, 3), (2, 3)];
        let p_before = momentum(&balls);
        let ke_before = kinetic_energy(&balls);
        let out = resolve_cluster_compliant(
            &mut balls,
            &contacts,
            &no_friction(),
            COMPLIANT_DT_DEFAULT,
            COMPLIANT_MAX_STEPS_DEFAULT,
            K_HERTZ_BILLIARD,
            HOP,
            LAW,
        );
        let ClusterOutcome::Integrated { steps } = out else {
            panic!("wedge must integrate, got {out:?}");
        };
        assert!(steps > 0 && steps < COMPLIANT_MAX_STEPS_DEFAULT, "steps = {steps}");
        assert!(
            balls[0].state.vel.y < 0.0,
            "cue must rebound backward, got vy = {}",
            balls[0].state.vel.y
        );
        assert!(balls[0].state.vel.x.abs() < 1e-9 * v, "square hit stays square");
        assert!((momentum(&balls) - p_before).norm() < 1e-9 * v);
        assert!(kinetic_energy(&balls) <= ke_before + 1e-9);
        for b in &balls {
            assert!(b.state.is_finite());
        }
    }

    /// Contact lists that differ only in tuple order, list order, or
    /// duplicates resolve identically (normalization + sort + dedup —
    /// the `contact_order_is_normalized_and_deterministic` analog).
    #[test]
    fn contact_order_is_normalized_and_deterministic() {
        let make = || {
            let mut b = touching_row(3);
            b[0].state.vel = Vec3::new(1.0, 0.0, 0.0);
            b
        };
        let mut a = make();
        let oa = resolve_defaults(&mut a, &[(0, 1), (1, 2)]);
        let mut b = make();
        let ob = resolve_defaults(&mut b, &[(2, 1), (1, 0), (0, 1)]);
        assert_eq!(oa, ob);
        assert_eq!(a, b); // bit-identical
    }

    /// Raw f64 bit pattern of one ball's dynamic state (bit comparison is
    /// NaN-transparent, unlike PartialEq).
    fn state_bits(b: &Ball) -> ([u64; 9], MotionState) {
        let s = &b.state;
        (
            [
                s.pos.x.to_bits(),
                s.pos.y.to_bits(),
                s.pos.z.to_bits(),
                s.vel.x.to_bits(),
                s.vel.y.to_bits(),
                s.vel.z.to_bits(),
                s.avel.x.to_bits(),
                s.avel.y.to_bits(),
                s.avel.z.to_bits(),
            ],
            s.motion,
        )
    }

    /// Byte-equality helper for the guard tests: the fallback result must
    /// equal a DIRECT legacy `resolve_cluster` run on the same inputs
    /// (contract §3.4 — determinism survives the pathological branch).
    fn assert_matches_direct_legacy(
        fallen: &[Ball],
        make: impl Fn() -> Vec<Ball>,
        contacts: &[(usize, usize)],
        friction: &BallBallFriction,
    ) {
        let mut legacy = make();
        resolve_cluster(&mut legacy, contacts, friction, 256, HOP, LAW);
        for (a, b) in fallen.iter().zip(&legacy) {
            assert_eq!(
                state_bits(a),
                state_bits(b),
                "fallback must byte-equal a direct legacy run (ball {:?})",
                a.id
            );
        }
    }

    /// Guard 1 (contract §3.1): a non-finite state fails closed —
    /// `FellBack(NonFinite)` — and the cluster resolves exactly as a direct
    /// legacy run (which applies no impulse to a NaN-velocity contact).
    #[test]
    fn guard_non_finite_falls_back_to_legacy() {
        let make = || {
            let mut b = touching_row(2);
            b[0].state.vel = Vec3::new(f64::NAN, 0.0, 0.0);
            b[0].state.motion = MotionState::Sliding;
            b
        };
        let friction = BallBallFriction::default();
        let mut balls = make();
        let out = resolve_cluster_compliant(
            &mut balls,
            &[(0, 1)],
            &friction,
            COMPLIANT_DT_DEFAULT,
            COMPLIANT_MAX_STEPS_DEFAULT,
            K_HERTZ_BILLIARD,
            HOP,
            LAW,
        );
        assert_eq!(
            out,
            ClusterOutcome::FellBack { reason: ClusterFallbackReason::NonFinite }
        );
        assert_matches_direct_legacy(&balls, make, &[(0, 1)], &friction);
    }

    /// Guard 2, integration-produced variant: a pathological (but
    /// validation-legal, finite > 0) k_hertz makes the discretized Hertz
    /// spring impulsive — one step stores astronomical elastic energy that
    /// the next step releases as kinetic energy. The energy audit catches
    /// the pump and the resolver falls back deterministically (fail-closed
    /// for ANY parameter abuse, not just the literature failure modes).
    #[test]
    fn guard_pathological_stiffness_falls_back_energy_gain() {
        let make = || {
            let mut b = touching_row(2);
            b[0].state.vel = Vec3::new(1e-4, 0.0, 0.0); // slow graze
            b[0].state.motion = MotionState::Sliding;
            b
        };
        let friction = BallBallFriction::default();
        let mut balls = make();
        let out = resolve_cluster_compliant(
            &mut balls,
            &[(0, 1)],
            &friction,
            COMPLIANT_DT_DEFAULT,
            COMPLIANT_MAX_STEPS_DEFAULT,
            1e308, // finite > 0: passes input validation
            HOP,
            LAW,
        );
        assert_eq!(
            out,
            ClusterOutcome::FellBack { reason: ClusterFallbackReason::EnergyGain }
        );
        assert_matches_direct_legacy(&balls, make, &[(0, 1)], &friction);
    }

    /// Guard 2 (contract §3.2): the restitution-consistent energy audit.
    /// An e_b = 1 elastic chain at the DEFAULT dt carries a measured
    /// symplectic-Euler discretization energy gain of ≈ +6e-7 J (dt²-
    /// scaling; the Hinch anchor runs at dt = 2e-8 where the gain is
    /// ≈ 2e-11 J) — above the frozen 1e-9 J bound, so the guard MUST fire
    /// and the fallback MUST byte-equal a direct legacy run.
    #[test]
    fn guard_energy_gain_falls_back_to_legacy() {
        let elastic = |id: u8, x: f64, vel: f64| {
            let mut b = ball(id, Vec3::new(x, 0.0, R), Vec3::new(vel, 0.0, 0.0));
            b.params.e_b = 1.0;
            if vel == 0.0 {
                b.state.motion = MotionState::Stationary;
            }
            b
        };
        let make = || -> Vec<Ball> {
            (0..9)
                .map(|i| {
                    elastic(
                        i,
                        2.0 * R * f64::from(i),
                        if i == 0 { 5.0 } else { 0.0 },
                    )
                })
                .collect()
        };
        let contacts: Vec<(usize, usize)> = (0..8).map(|i| (i, i + 1)).collect();
        let friction = no_friction();
        let mut balls = make();
        let out = resolve_cluster_compliant(
            &mut balls,
            &contacts,
            &friction,
            COMPLIANT_DT_DEFAULT,
            COMPLIANT_MAX_STEPS_DEFAULT,
            K_HERTZ_BILLIARD,
            HOP,
            LAW,
        );
        assert_eq!(
            out,
            ClusterOutcome::FellBack { reason: ClusterFallbackReason::EnergyGain }
        );
        assert_matches_direct_legacy(&balls, make, &contacts, &friction);
    }

    /// Guard 3 (contract §3.3): a step cap sized below the compression
    /// transient leaves a pair penetrating while approaching — an illegal
    /// hand-off geometry — and MUST fall back deterministically.
    #[test]
    fn guard_penetrating_at_cap_falls_back_to_legacy() {
        let make = || {
            let mut b = touching_row(2);
            b[0].state.vel = Vec3::new(5.0, 0.0, 0.0);
            b
        };
        let friction = BallBallFriction::default();
        let mut balls = make();
        let out = resolve_cluster_compliant(
            &mut balls,
            &[(0, 1)],
            &friction,
            COMPLIANT_DT_DEFAULT,
            50, // window 50 µs — mid-compression (full contact ≈ 290 µs)
            K_HERTZ_BILLIARD,
            HOP,
            LAW,
        );
        assert_eq!(
            out,
            ClusterOutcome::FellBack { reason: ClusterFallbackReason::PenetratingAtCap }
        );
        assert_matches_direct_legacy(&balls, make, &[(0, 1)], &friction);
    }

    // ------------------------------------------------------------------
    // G-ANCHOR-NEW: published-physics anchors for the new mechanism
    // (the validation-gates contract; Principle IV). Cross 2023
    // (Am J Phys 91:879–884, oblique impacts on 2–3 frozen balls) is the
    // documented lab benchmark for the wedge topology in the audit row —
    // its numeric tables are paywalled, so it is NOT a CI anchor
    // (research R9, honest gap).
    // ------------------------------------------------------------------

    /// Hinch & Saint-Jean 1999 (Proc R Soc A 455:3201, Hertz elastic
    /// chain): with e = 1 and zero friction, a striker impacting a line of
    /// 8 stationary balls rebounds at −0.07·V while the far-end ball
    /// departs at 0.986·V and the next-to-last at 0.149·V (the paper's
    /// closed-form dispersion results). Anchor bands per the frozen gate:
    /// striker ∈ [0.04, 0.10] backward, far ≥ 0.95, next-to-last
    /// ∈ [0.10, 0.20]. Runs at dt = 2e-8 (validated domain [1e-8, 1e-4]):
    /// the elastic chain has ZERO physical dissipation, so the frozen
    /// 1e-9 J energy audit requires the dt²-scaling discretization gain
    /// (measured +3.3e-7 J at dt = 1e-6, +2e-11 J at dt = 2e-8) to sit
    /// under the bound — a real 8-contact wave needs the 100_000-step cap
    /// (2 ms window; the transient completes in ≈ 1.4 ms at 8 m/s).
    /// Measured at this configuration: striker −0.0711, far +0.9860,
    /// next-to-last +0.1464 — the paper's values, never fit inputs
    /// (FR-002 prediction test).
    #[test]
    fn hinch_1999_elastic_chain_anchor() {
        let v = 8.0;
        let n = 9usize; // striker + 8-ball line
        let mut balls: Vec<Ball> = (0..n)
            .map(|i| {
                let mut b = ball(
                    u8::try_from(i).unwrap(),
                    Vec3::new(2.0 * R * i as f64, 0.0, R),
                    if i == 0 {
                        Vec3::new(v, 0.0, 0.0)
                    } else {
                        Vec3::ZERO
                    },
                );
                b.params.e_b = 1.0; // elastic chain (paper's condition)
                b
            })
            .collect();
        let contacts: Vec<(usize, usize)> = (0..n - 1).map(|i| (i, i + 1)).collect();
        let p_before = momentum(&balls);
        let ke_before = kinetic_energy(&balls);
        let out = resolve_cluster_compliant(
            &mut balls,
            &contacts,
            &no_friction(),
            2e-8,
            100_000,
            K_HERTZ_BILLIARD,
            HOP,
            LAW,
        );
        let ClusterOutcome::Integrated { steps } = out else {
            panic!("elastic chain must integrate, got {out:?}");
        };
        assert!(steps < 100_000, "early exit required, got {steps}");

        let striker = balls[0].state.vel.x / v;
        let far = balls[n - 1].state.vel.x / v;
        let next_to_last = balls[n - 2].state.vel.x / v;
        assert!(
            (-0.10..=-0.04).contains(&striker),
            "striker rebound {striker} outside [−0.10, −0.04] (paper −0.07)"
        );
        assert!(far >= 0.95, "far-end ball {far} < 0.95 (paper 0.986)");
        assert!(
            (0.10..=0.20).contains(&next_to_last),
            "next-to-last {next_to_last} outside [0.10, 0.20] (paper 0.149)"
        );
        assert!((momentum(&balls) - p_before).norm() < 1e-9);
        assert!(kinetic_energy(&balls) <= ke_before + 1e-9);
        for b in &balls {
            assert!(b.state.is_finite());
        }
    }

    /// Newton's-cradle class (spec edge case "Small clusters in normal
    /// play"): default e_b/μ, 3-ball chain — the far ball carries the
    /// dominant share while the middle ball retains a small but NONZERO
    /// share (compliant dispersion; Hinch 1999 §2's finite-chain
    /// retention), re-asserting the legacy cradle test's physical content
    /// against the compliant path. Measured: far 0.946, middle 0.112,
    /// striker −0.058, early exit at 704 steps.
    #[test]
    fn compliant_cradle_far_ball_dominates_middle_retains_nonzero() {
        let v = 1.0;
        let mut balls = touching_row(3);
        balls[0].state.vel = Vec3::new(v, 0.0, 0.0);
        let p_before = momentum(&balls);
        let ke_before = kinetic_energy(&balls);
        let out = resolve_defaults(&mut balls, &[(0, 1), (1, 2)]);
        let ClusterOutcome::Integrated { steps } = out else {
            panic!("cradle must integrate, got {out:?}");
        };
        assert!(
            steps > 0 && steps < COMPLIANT_MAX_STEPS_DEFAULT,
            "early exit required, got {steps}"
        );
        let (left, mid, far) = (
            balls[0].state.vel.x,
            balls[1].state.vel.x,
            balls[2].state.vel.x,
        );
        assert!(far > 0.8 * v, "far ball must dominate, got {far}");
        assert!(
            mid > 0.01 * v && mid < 0.3 * v,
            "middle ball must retain a small but NONZERO share, got {mid}"
        );
        assert!(far > 3.0 * mid, "dominance ordering, got far {far} vs mid {mid}");
        assert!(left.abs() < 0.15 * v, "striker residue, got {left}");
        assert!((momentum(&balls) - p_before).norm() < 1e-9);
        assert!(kinetic_energy(&balls) <= ke_before + 1e-9);
        for b in &balls {
            assert!(b.state.is_finite());
        }
    }

    /// Leonard, Chong, Kevrekidis & Daraio 2014 (Granular Matter
    /// 16:531–542, impulsively excited uncompressed hexagonal packings —
    /// the rack lattice), qualitative anchor: a 15-ball frozen triangle
    /// struck at the apex propagates a wavefront whose speeds decay
    /// monotonically row by row along the lattice directions, and the
    /// back-corner balls exit lattice-locked near 60°/120° (the ±30°-to-
    /// the-strike lattice lines the wave rode). The FREE back row itself
    /// accumulates the arriving momentum (corner balls exit fastest —
    /// the chain far-ball effect at the free boundary), so the monotone
    /// decay is asserted over the interior rows 0–3. Measured: row maxima
    /// 1.76 / 1.20 / 0.99 / 0.90 m/s, corners 4.01 m/s at 58.4°/121.6°.
    #[test]
    fn leonard_2014_lattice_wavefront_decay_and_corner_lock() {
        let row_dy = libm::sqrt(3.0) * R;
        let mut balls = Vec::new();
        let mut rows: Vec<Vec<usize>> = Vec::new();
        let mut id = 0u8;
        for k in 0..5u8 {
            let mut this_row = Vec::new();
            for j in 0..=k {
                let x = (f64::from(j) - f64::from(k) / 2.0) * 2.0 * R;
                let y = f64::from(k) * row_dy;
                this_row.push(balls.len());
                balls.push(ball(id, Vec3::new(x, y, R), Vec3::ZERO));
                id += 1;
            }
            rows.push(this_row);
        }
        balls[0].state.vel = Vec3::new(0.0, 8.0, 0.0); // apex driven into the pack
        let mut contacts = Vec::new();
        for i in 0..balls.len() {
            for j in (i + 1)..balls.len() {
                if (balls[i].state.pos - balls[j].state.pos).norm() <= 2.0 * R + 1e-9 {
                    contacts.push((i, j));
                }
            }
        }
        assert_eq!(contacts.len(), 30);
        let p_before = momentum(&balls);
        let ke_before = kinetic_energy(&balls);
        let out = resolve_defaults(&mut balls, &contacts);
        let ClusterOutcome::Integrated { steps } = out else {
            panic!("lattice must integrate, got {out:?}");
        };
        assert!(
            steps > 0 && steps < COMPLIANT_MAX_STEPS_DEFAULT,
            "early exit required, got {steps}"
        );

        // Wavefront decay: interior-row maxima strictly decreasing.
        let row_max: Vec<f64> = rows
            .iter()
            .map(|r| {
                r.iter()
                    .map(|&i| balls[i].state.vel.norm())
                    .fold(0.0_f64, f64::max)
            })
            .collect();
        for k in 0..3 {
            assert!(
                row_max[k] > row_max[k + 1],
                "row maxima must decay monotonically: rows {:?}",
                row_max
            );
        }

        // Back corners: lattice-locked exit directions near 60°/120°.
        let vl = balls[rows[4][0]].state.vel; // back-left corner
        let vr = balls[rows[4][4]].state.vel; // back-right corner
        let angle = |v: Vec3| libm::atan2(v.y, v.x).to_degrees();
        assert!(
            (angle(vr) - 60.0).abs() < 5.0,
            "back-right corner exits at {}°, expected near 60°",
            angle(vr)
        );
        assert!(
            (angle(vl) - 120.0).abs() < 5.0,
            "back-left corner exits at {}°, expected near 120°",
            angle(vl)
        );
        // The free back row accumulates the wave: corners exit fastest.
        assert!(vl.norm() > row_max[0] && vr.norm() > row_max[0]);

        assert!((momentum(&balls) - p_before).norm() < 1e-9);
        assert!(kinetic_energy(&balls) <= ke_before + 1e-9);
        for b in &balls {
            assert!(b.state.is_finite());
        }
        // x-symmetry of the head-on lattice strike is preserved.
        assert!(momentum(&balls).x.abs() < 1e-9);
    }

    // ------------------------------------------------------------------
    // G-SYM: order independence (SC-003, FR-005, research R7) — the
    // resolver half. The tolerance PINNED here (1e-9·impact-speed per
    // component; measured worst deviation 8.4e-13 absolute ≈ 1.2e-13·v on
    // the diamond case) is consumed by the event-loop symmetric-rack test
    // (T010) and the conduction sweep (T012).
    // ------------------------------------------------------------------

    /// Constructed EXACTLY x-symmetric frozen cluster (cue + 9-ball
    /// diamond on the perfect lattice: every coordinate pair is an exact
    /// FP negation) + head-on center strike with draw: the post-window
    /// field is mirror-symmetric within 1e-9·(impact speed) per component
    /// (the DOCUMENTED G-SYM tolerance, research R7). Jacobi accumulation
    /// makes the step order-independent in exact arithmetic; in floating
    /// point, mirror partners accumulate their per-ball force sums in
    /// permuted contact order, so last-ULP drift is expected — measured
    /// worst component deviation 8.4e-13 (≈ 1.2e-13·v) over the 993-step
    /// window; NOT bit-exact (recorded honestly per the staged R7
    /// acceptance; the 13×-asymmetry defect class sits 12 orders above
    /// this tolerance). Axial balls (x = 0) must stay axial and the cue's
    /// sideways velocity vanishes at the same tolerance.
    #[test]
    fn mirror_symmetric_cluster_resolves_mirror_symmetric() {
        let v = 7.5;
        let row = libm::sqrt(3.0) * R;
        let offsets = [
            (0.0, 0.0), (-0.5, 1.0), (0.5, 1.0), (-1.0, 2.0), (0.0, 2.0),
            (1.0, 2.0), (-0.5, 3.0), (0.5, 3.0), (0.0, 4.0),
        ];
        let mut balls = vec![ball(0, Vec3::new(0.0, -2.0 * R, R), Vec3::new(0.0, v, 0.0))];
        balls[0].state.avel = Vec3::new(-30.0, 0.0, 0.0); // draw: x-mirror-symmetric
        for (k, &(ux, uy)) in offsets.iter().enumerate() {
            balls.push(ball(
                u8::try_from(k + 1).unwrap(),
                Vec3::new(ux * 2.0 * R, uy * row, R),
                Vec3::ZERO,
            ));
        }
        let mut contacts = Vec::new();
        for i in 0..balls.len() {
            for j in (i + 1)..balls.len() {
                if (balls[i].state.pos - balls[j].state.pos).norm() <= 2.0 * R + 1e-9 {
                    contacts.push((i, j));
                }
            }
        }
        assert_eq!(contacts.len(), 17);
        let out = resolve_defaults(&mut balls, &contacts);
        assert!(matches!(out, ClusterOutcome::Integrated { steps } if steps > 0));

        let tol = 1e-9 * v; // the pinned G-SYM tolerance
        // Mirror pairs under x → −x (cue is index 0; offsets shift by 1):
        // (2,3), (4,6), (7,8); axial: 0, 1, 5, 9.
        for &(l, r) in &[(2usize, 3usize), (4, 6), (7, 8)] {
            let (sl, sr) = (&balls[l].state, &balls[r].state);
            // velocity: (vx, vy, vz) ↔ (−vx, vy, vz)
            assert!((sl.vel.x + sr.vel.x).abs() < tol, "pair ({l},{r}) vx");
            assert!((sl.vel.y - sr.vel.y).abs() < tol, "pair ({l},{r}) vy");
            assert!((sl.vel.z - sr.vel.z).abs() < tol, "pair ({l},{r}) vz");
            // angular velocity (pseudovector): (ωx, ωy, ωz) ↔ (ωx, −ωy, −ωz)
            assert!((sl.avel.x - sr.avel.x).abs() < tol / R, "pair ({l},{r}) wx");
            assert!((sl.avel.y + sr.avel.y).abs() < tol / R, "pair ({l},{r}) wy");
            assert!((sl.avel.z + sr.avel.z).abs() < tol / R, "pair ({l},{r}) wz");
            // integrated positions mirror too
            assert!((sl.pos.x + sr.pos.x).abs() < tol, "pair ({l},{r}) px");
            assert!((sl.pos.y - sr.pos.y).abs() < tol, "pair ({l},{r}) py");
        }
        for &s in &[0usize, 1, 5, 9] {
            let st = &balls[s].state;
            assert!(st.vel.x.abs() < tol, "axial ball {s} gained vx {}", st.vel.x);
            assert!(st.pos.x.abs() < tol, "axial ball {s} drifted px {}", st.pos.x);
            assert!(st.avel.y.abs() < tol / R, "axial ball {s} gained wy");
            assert!(st.avel.z.abs() < tol / R, "axial ball {s} gained wz");
        }
        // The measured 13× starvation asymmetry class (0.13 vs 1.73 m/s on
        // mirror slots, issue #20 defect c) is dead at ANY tolerance in
        // this range: mirror-slot speeds agree to ~1e-13·v.
        let speed2 = balls[2].state.vel.norm();
        let speed3 = balls[3].state.vel.norm();
        assert!((speed2 - speed3).abs() < tol);
    }

    /// Ball relabeling (the order-preserving relabelings the kernel
    /// performs) permutes outputs EXACTLY: inserting an uninvolved
    /// bystander at index 0 shifts every cluster index by one without
    /// reordering, so the sorted contact traversal and ascending-index
    /// integration execute the identical FP sequence — outputs are
    /// bit-equal under the shift.
    #[test]
    fn relabeling_permutes_outputs_exactly() {
        let v = 7.5;
        let row = libm::sqrt(3.0) * R;
        let wedge = |ids: [u8; 4]| {
            vec![
                ball(ids[0], Vec3::new(0.0, -2.0 * R, R), Vec3::new(0.05, v, 0.0)),
                ball(ids[1], Vec3::new(0.0, 0.0, R), Vec3::ZERO),
                ball(ids[2], Vec3::new(-R, row, R), Vec3::ZERO),
                ball(ids[3], Vec3::new(R, row, R), Vec3::ZERO),
            ]
        };
        let friction = BallBallFriction::default();

        let mut plain = wedge([0, 1, 2, 3]);
        let out_plain = resolve_cluster_compliant(
            &mut plain,
            &[(0, 1), (1, 2), (1, 3), (2, 3)],
            &friction,
            COMPLIANT_DT_DEFAULT,
            COMPLIANT_MAX_STEPS_DEFAULT,
            K_HERTZ_BILLIARD,
            HOP,
            LAW,
        );

        // Same cluster with a far-away bystander occupying index 0 and
        // every contact index shifted by +1 (order-preserving relabeling).
        let mut shifted = vec![ball(9, Vec3::new(0.5, -0.5, R), Vec3::ZERO)];
        shifted.extend(wedge([0, 1, 2, 3]));
        let out_shifted = resolve_cluster_compliant(
            &mut shifted,
            &[(1, 2), (2, 3), (2, 4), (3, 4)],
            &friction,
            COMPLIANT_DT_DEFAULT,
            COMPLIANT_MAX_STEPS_DEFAULT,
            K_HERTZ_BILLIARD,
            HOP,
            LAW,
        );

        assert_eq!(out_plain, out_shifted, "outcome (incl. steps) must match");
        let bystander = &shifted[0];
        assert_eq!(bystander.state.vel, Vec3::ZERO, "bystander untouched");
        for (a, b) in plain.iter().zip(&shifted[1..]) {
            assert_eq!(
                state_bits(a),
                state_bits(b),
                "relabeled outputs must be bit-equal (ball {:?})",
                a.id
            );
        }
    }

    /// Repeat-run byte determinism + step-count purity (SC-006): the same
    /// input state yields a bit-identical output state and the exact same
    /// `steps` — the step count is a pure function of the input state.
    #[test]
    fn repeat_run_is_byte_identical_and_step_count_pure() {
        let make = || {
            let row = libm::sqrt(3.0) * R;
            let mut balls = vec![
                ball(0, Vec3::new(0.0, -2.0 * R, R), Vec3::new(0.1, 7.5, 0.0)),
                ball(1, Vec3::new(0.0, 0.0, R), Vec3::ZERO),
                ball(2, Vec3::new(-R, row, R), Vec3::ZERO),
                ball(3, Vec3::new(R, row, R), Vec3::ZERO),
            ];
            balls[0].state.avel = Vec3::new(-3.0, 0.4, 1.7); // draw + side
            balls
        };
        let contacts = [(0, 1), (1, 2), (1, 3), (2, 3)];
        let mut a = make();
        let oa = resolve_defaults(&mut a, &contacts);
        let mut b = make();
        let ob = resolve_defaults(&mut b, &contacts);
        assert_eq!(oa, ob, "outcome (incl. steps) must be a pure function");
        assert!(matches!(oa, ClusterOutcome::Integrated { steps } if steps > 0));
        for (x, y) in a.iter().zip(&b) {
            assert_eq!(x.state.pos.x.to_bits(), y.state.pos.x.to_bits());
            assert_eq!(x.state.pos.y.to_bits(), y.state.pos.y.to_bits());
            assert_eq!(x.state.pos.z.to_bits(), y.state.pos.z.to_bits());
            assert_eq!(x.state.vel.x.to_bits(), y.state.vel.x.to_bits());
            assert_eq!(x.state.vel.y.to_bits(), y.state.vel.y.to_bits());
            assert_eq!(x.state.vel.z.to_bits(), y.state.vel.z.to_bits());
            assert_eq!(x.state.avel.x.to_bits(), y.state.avel.x.to_bits());
            assert_eq!(x.state.avel.y.to_bits(), y.state.avel.y.to_bits());
            assert_eq!(x.state.avel.z.to_bits(), y.state.avel.z.to_bits());
            assert_eq!(x.state.motion, y.state.motion);
        }
    }
}
