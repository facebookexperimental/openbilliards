# Break forensics: why the cue ball comes out dead, and the frozen-rack back-reaction

Status: forensics + analytic baseline for the Fix phase (feat/break-physics).
Companion tests: `crates/pool-core/src/resolve/cluster.rs`
(`cue_on_frozen_wedge_matches_hand_derivation`, `cue_on_frozen_nine_ball_diamond_back_reaction`,
`cue_on_frozen_fifteen_ball_triangle_back_reaction`).

## 1. Observed defect (event trace, seeds 1–5, v0 = 9 and 12 m/s, center break)

Rack gaps at the moment of cue–apex impact (seed 1): apex–2 = 0.498 mm,
apex–3 = 0.522 mm — `rack.rs` seeds ALL inter-ball gaps in [0.05, 0.5] mm
(realized pair gaps up to ~0.95 mm), which is 5–95× the event loop's
`CLUSTER_CONTACT_EPS = 1e-5 m`. Consequence, confirmed with a temporary
counter on the T021 escalation branch:

- `contact_cluster` at the cue–apex impact always returns 2 members
  ⇒ `resolve_cluster` NEVER fires on a break (10/10 runs; one incidental
  3-member cluster mid-break in 1 run, never at the apex).
- Cue post-impact velocity after the first BallBall event: +0.342 m/s
  forward at v0 = 9 (impact speed 13.85 m/s) — exactly the sequential
  equal-mass residue (1 − e_b)/2 = 0.025 of impact speed. No back-reaction
  is possible in a pairwise impulse.
- The only backward motion the cue ever gets is an accidental re-kiss: the
  apex rebounds off row 2 and re-hits the still-crawling cue ~0.4 ms later
  (−1.26 m/s at v0 = 9). Net cue displacement after friction: −2.3 cm
  (seed 1) — the "perfectly dead" cue.

## 2. Escalation audit (verdict: logic correct, topology starves it)

`resolve_event` (event_loop.rs): on a BallBall impact it builds the
transitive contact graph with surface-gap tolerance `CLUSTER_CONTACT_EPS =
1e-5 m` and escalates to `resolve_cluster` iff the component has > 2
members. Frozen rack contacts (gap ≤ Eps::KISS = 1e-6 m) are inside that
tolerance, so a frozen rack WOULD escalate correctly at the cue–apex event.
The gapped rack (min gap 5e-5 m = 5× the tolerance, by construction) can
never present a frozen neighbor at impact time. The bug is rack topology,
not the escalation condition.

## 3. Analytic baseline: 3-ball wedge + cue (e_b = 0.95, equal masses)

Geometry: apex at origin; two wing balls frozen against it at ±30° from the
cue line (rack row 2, lattice directions (±1/2, √3/2)); cue hits the apex
square along +y with impact speed v. Contacts, in resolve_cluster's sorted
order: (cue,apex), (apex,L), (apex,R), (L,R).

### (a) Iterative-sweep cluster algorithm (Gauss–Seidel, hand-traced)

Sweep 1 — with k = (1+e)/2 = 0.975 and c = cos 30° = √3/2:
1. (cue,apex): vn = −v, impulse p/m = k·v.
   cue → 0.0250·v ŷ, apex → 0.9750·v ŷ.
2. (apex,L), n = (−1/2, c): vn = −0.9750·c·v = −0.84438·v, p/m = 0.82327·v.
   apex → (+0.41163, +0.26203)·v, L → (−0.41163, +0.71297)·v.
3. (apex,R), n = (+1/2, c): vn = −0.43274·v, p/m = 0.42192·v.
   apex → (+0.20067, −0.10337)·v — the apex now moves BACKWARD.
4. (L,R): separating, no-op.

Sweep 2:
1. (cue,apex): vn = −0.10337·v − 0.02500·v = −0.12837·v, p/m = 0.12516·v.
   cue → −0.10016·v ŷ (back-reaction), apex → +0.02179·v ŷ.
2–4. all separating. Sweep 3 applies nothing ⇒ converged, sweeps = 2.

**Cue rebound fraction = −0.100156 of impact speed** (10.0% straight back).
Momentum conserved exactly; KE ratio 0.9066 (loss consistent with e = 0.95
over three effective impacts). The number is identical for the full frozen
9-ball diamond and 15-ball triangle (sweeps 2 and 2–4): the cue separates
from the apex during sweep 2, before deeper rows can feed anything back, so
the cluster's back-reaction saturates at the 3-ball wedge value.

### (b) Rigid-aggregate effective-mass estimate

Cue (m) against a rigid target of mass M with restitution e:
v'/v = (1 − e·M/m)/(1 + M/m).

| target model                          | M/m | v'/v    |
|---------------------------------------|-----|---------|
| wedge, wings projected (1 + 2cos²30°) | 2.5 | −0.393  |
| wedge, fully rigid                    | 3   | −0.4625 |
| 9-ball rack rigid                     | 9   | −0.755  |
| 15-ball rack rigid                    | 15  | −0.828  |

The rigid-aggregate is a gross upper bound: it forbids the wings from
carrying energy away along their own contact normals. The sequential-impulse
cluster (−0.100) is the physical middle ground between it and the pairwise
chain (+0.025, no back-reaction at all); real breaks (cue hops back a
fraction of a meter and dies near center) sit in the cluster regime.

### (c) Full frozen racks through resolve_cluster (unit tests)

Perfect frozen 9-ball diamond + cue at contact, impact speed v:
cue → (0, −0.100156·v), 17 contacts, sweeps = 2, converged well under the
256 budget, momentum conserved to 1e-9, deterministic (two runs
byte-identical). 15-ball triangle: 31 contacts, same cue rebound.
Known artifact: Gauss–Seidel sweep order (sorted pair indices) distributes
wing energy asymmetrically (left wing 0.82·v vs right 0.42·v in the wedge);
totals conserve, direction structure is lattice-locked (research doc §2.4),
and spread statistics remain inside the study bands (§4 below) — acceptable
for the baseline, revisit only if future calibration evidence demands it.

## 4. Prototype (this branch, opt-in only — default rack unchanged)

`rack.rs` gains `*_rack_frozen(table, params, seed, frozen_fraction)`:
lattice pitch 2R + FROZEN_GAP (5e-7 m, inside Eps::KISS so the T021
escalation sees the contacts); each rack ball keeps its lattice node with
probability `frozen_fraction`, otherwise it is displaced by a seeded
U[0.05, 0.5] mm micro-gap along a seeded angle, clamped in closed form so
no pair ever drops below the frozen pitch (legality invariant identical in
spirit to the gapped constructor's proof). frozen_fraction = 1 ⇒ perfect
frozen rack; 0 ⇒ mostly-gapped rack that still keeps squeezed contacts
frozen. Event-loop integration verified: the first BallBall event of a
frozen-rack break escalates (>2 participants) and the cue exits backward at
−0.100·(impact speed). Reproduce all tables with
`cargo test --release -p pool-core --lib -- --ignored break_prototype_measurement --nocapture`.

### Measured: cue post-break velocity (9-ball, seeds 0–9, center break)

| rack           | v0 = 9 first-BB cue vel   | v0 = 12 first-BB cue vel  |
|----------------|---------------------------|---------------------------|
| gapped default | +0.342 m/s (+0.0247·imp)  | +0.458 m/s (+0.0248·imp)  |
| frozen f = 1.0 | −1.369 m/s (−0.0989·imp)  | −1.836 m/s (−0.0995·imp)  |
| frozen f = 0.7 | bimodal: −1.369 (5/10 seeds, apex frozen) or +0.342 (apex contact opened) |

Direction: straight back down the cue line (x component 0 by symmetry; the
gapped rack's ±0.04 m/s x-noise comes from its jittered apex). The −0.099
measured vs −0.1002 analytic gap is cloth friction between strike and
impact. f = 0.7's bimodality is physical: a tight rack gives the breaker
cue rebound, a loose apex kills it — matches racking lore and gives the
imperfection stream a lever.

### Measured: spread (mean pairwise distance of on-table balls at rest, m)

| condition                    | spread                    | study band (§2.2) |
|------------------------------|---------------------------|-------------------|
| 15-ball gapped, v0 = 8       | 0.689 ± 0.16 (0.42–1.02)  | 0.545–0.653 ± 0.07–0.17 ✓ |
| 15-ball frozen 1.0, v0 = 8   | 1.047 (seed-invariant)    | high by ~2.5σ ✗   |
| 15-ball frozen 0.7, v0 = 8   | 0.925 ± 0.07 (0.81–1.01)  | high by ~1.5σ, overlaps gapped upper range |
| 9-ball gapped, v0 = 9        | 0.999 ± 0.19              | (no study band)   |
| 9-ball frozen 0.7, v0 = 9    | 0.973 ± 0.13              | matches gapped ✓  |

Fix-phase items before making frozen the default: (1) f = 1.0 is
seed-invariant (perfect lattice) — a seeded imperfection (f < 1) is
mandatory, not optional; (2) the frozen-cluster spread runs hot vs the
study band because `resolve_cluster` is frictionless while the pairwise
resolver carries Alciatore friction — swap the per-contact exchange to the
full resolver (the `friction` parameter is already plumbed) and re-measure;
(3) Gauss–Seidel sweep-order asymmetry (§3c) should be revisited (e.g.
symmetric sweep or ordering by approach speed) if future calibration
evidence shows a lateral bias.

## 5. Fix phase (feat/break-integration, 2026-07): frozen topology SHIPPED as the default

- `rack.rs`: `nine_ball_rack` / `fifteen_ball_rack` now build the frozen
  topology at `DEFAULT_FROZEN_FRACTION = 0.7` (provenance in the constant's
  doc). Fix-phase item 1 addressed: the seeded imperfection is mandatory and
  APEX-PROTECTED — the apex wedge (rows 0–1) never opens (racking consensus:
  apex freeze matters most; the f = 0.7 bimodality of §4 came from apex
  jitter and is gone), per-ball micro-gap jitter and row loosening reach
  rows ≥ 2 only. The all-gapped construction survives as
  `*_rack_gapped` for research/regression contrast.
- Fix-phase item 2 addressed: `resolve_cluster` per-contact exchange swapped
  to the FULL frictional M5 resolver (`resolve_ball_ball`; the plumbed
  `friction` parameter is now live). Zero-μ reduces algebraically exactly
  to the frictionless exchange (the wedge-analytic agreement tests pin it
  to the §3a hand derivation within 1e-5..1e-3·v tolerances, not
  bit-equality — the removed prototype used a different FP operation
  order). ATTRIBUTION (measured separately, `break_prototype_measurement`
  at HEAD): the exchange swap ALONE moves the frozen f = 1.0 15-ball
  spread at v0 = 8 from 1.047 (2.5σ hot, seed-invariant) to 0.987 (still
  seed-invariant); the rest of the drop comes from item 1's
  `DEFAULT_FROZEN_FRACTION = 0.7` back-row micro-gaps — combined, the
  SHIPPED default measures 0.846 ± 0.16 (range 0.67–1.11, pocketed
  1.1 ± 0.9) — overlapping the gapped seed distribution (0.42–0.99, mean
  0.68) with the mean still ~1.2σ above the study's mean band
  (0.545–0.653 ± 0.07–0.17). (Earlier revisions of this doc, and merge
  c3143fc / commit 516e06b, credited the whole 1.047 → 0.846 drop to the
  friction swap; roughly half of it is item 1's imperfection.) Honest
  reading: tight racks DO transmit more
  energy outward (also the racking lore), and the study band is itself an
  UNVALIDATED gapped-sequential simulation statistic (gap-break-multibody
  §1.4: no experimental 15-ball spread data exists); the frozen default's
  offset is recorded here rather than tuned away. Reproduce via the
  `break_prototype_measurement` ignored test.
- Fix-phase item 3 (Gauss–Seidel sweep-order asymmetry): unchanged,
  re-visit only on future lateral-bias calibration evidence.
- REPLAY COMPATIBILITY (scope of the merge claim "old replays byte-replay"):
  SAME-version embedded-state replays are byte-identical (golden fixture
  pinned). Cross-version replay of PRE-fix records is NOT byte-identical
  when the record contains cluster-escalated BallBall events — the
  frictionless→frictional exchange swap changes escalated-event post
  states (measured: 3/30 old break records built on 0.1.0+48ce68a diverge
  when re-simulated on the new kernel from their embedded initial state;
  seeds 0–14 at v0 = 9/12 — ~10% of old breaks, the record class this fix
  concerns). The SDK's strict `kernel_version` gate (record.ts) refuses
  cross-version records by design, so nothing breaks silently.
- MEASURED cue rebound (default rack, realistic preset, post-transient
  60 ms window, momentum-recovered incoming speed): center strike (arrives
  with cloth-picked topspin) 0.093–0.096 of impact speed straight back;
  slight-draw strike (arrives ~zero vertical spin — the evidence band's
  predicate) 0.102–0.108 across v0 = 6/9/12 and seeds. Direction: 180.0°
  (apex wedge frozen ⇒ symmetric). Evidence band [0.10, 0.40] (target
  0.15–0.35, clips 0.17–0.33): the sequential-impulse cluster SATURATES at
  the analytic 3-ball-wedge value ≈ 0.100 (§3a) — the shipped physics sits
  AT the band floor, honestly short of the clip center. Closing the gap
  needs compliant multibody wave physics (research doc §3b hybrid), not
  parameter tuning; recorded as a documented residual in the
  generalization audit (internal).

## 6. Saturation closed (feature-018 default flip, 2026-07-11)

The §3a saturation is CLOSED by the compliant multibody cluster model —
the §3b hybrid direction, delivered as `ClusterModel::CompliantChain`
(Hertz + Lankarani–Nikravesh normal force, Alciatore Coulomb tangential,
Jacobi concurrent advance; `resolve/cluster_compliant.rs`) and flipped to
the KERNEL DEFAULT by the break-compliance feature (its flip-cascade
contract; constitution v1.3.0 names it the reference resolution).
The sequential Gauss–Seidel resolver is retained as the explicit-option
legacy path (`SequentialImpulse`) and the guard fallback — explicit-legacy
records byte-replay forever (research R12; proven per pin by
`e2e-share.mjs --corpus`).

Measured on the flipped default (same predicates as §5's fix-phase rows):

- **Cue rebound fraction** (post-transient 60 ms window): tight rack
  0.157–0.165 across the pinned matrix — INSIDE the clip target
  0.15–0.35 (vs the sequential saturation 0.102–0.108 at the analytic
  ≈ 0.100 floor); default construction 0.121–0.164 (seeded back-row gaps
  degrade the reflected wave — the Gismeros 2022 direction). Direction
  ≤ 0.1° off the reversed line; `cluster_compliant_fallbacks = 0`
  everywhere measured.
- **Conduction** (the §1 starvation class): the collinear-chain
  starvation is gone — the break-scrub gate sweep measures every ball
  moving on gate-passing seeds with margins (min net displacement
  0.135 m by 1.45 s / 0.587 m by Rest on the shipped seed-33 record) and
  the formerly starved showcase seeds are admissible again
  (tools/render/break-scrub.mjs seed note).
- **Symmetry**: the first-BB fraction is seed-symmetric within the G-SYM
  pinned tolerance (mirror slots retain equal speed within
  1e-9·impact-speed — `event_loop.rs` mirror gate).
- **Cost**: canonical-wasm pool 15-ball break 7.919 ms p50 vs the
  re-based < 10 ms budget (constitution v1.3.0 Principle V;
  the app-perf verification ledger (internal), T022 rows).

Cross-version posture for pre-flip records mirrors the §5 replay note at
the flip boundary: cluster-escalated break events diverge (measured: ALL
full-rack break pins — 5/14 of the G-KERNEL corpus), the strict
`kernel_version` gate refuses with view-anyway, and the (old, new) pair
is NOT added to `KERNEL_COMPAT_LINEAGE`
(the break-compliance compat ledger, internal).
