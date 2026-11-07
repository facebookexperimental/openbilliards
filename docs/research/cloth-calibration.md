# Cloth calibration — worsted pool-cloth parameters and preset provenance

Deep-research synthesis backing the kernel cloth presets
(`crates/pool-core/src/params.rs::ClothPreset`), the anchor tests
(`crates/pool-core/tests/anchors_cloth.rs`), and the measurement harness
(`tools/cloth/measure.py`). Companion to `literature.md` (Mathavan snooker
measurements) and `gap-k66-cushion-params.md` (the joint (u_r, e_c) lag
constraint).

## 1. Protocol math (used for every derived number)

Rolling ball under constant rolling resistance decelerates at `a = μ_roll·g`.

- **Stopwatch lag (Jewett/Dr. Dave)** — time a lag's last lap (far rail →
  stops at the near rail, distance d): `μ_roll = 2d/(g·t²)`. On a 9-ft
  (d = 2.54 m nose-to-nose): `μ_roll ≈ 0.518/t²`.
- **Jewett "table speed number"** `S ≈ 2t²` (9-ft; 1.8t² on 10-ft carom) is
  exactly `1/μ_roll`. Absolute scale: slow pool cloth S≈80 (μ_roll 0.0125),
  competition speed S≈100 = 7-second lag (μ_roll 0.0106), fast carom cloth
  S≈200 (μ_roll 0.005).
  Sources: Dr. Dave cloth-speed FAQ (drdavepoolinfo.com/faq/table/cloth-speed/)
  quoting Bob Jewett; Ron Shepard APAPP (sfbilliards.com) for the 2t² formula.
- **Roll distance from launch speed**: `d = v²/(2·μ_roll·g)`. Sanity vs the
  WPA lag anchor: μ_roll = 0.010, v = 1.45 m/s → 10.7 m ≈ 4.2 table lengths.
- **"X% faster" (roll-distance) claims** → μ_roll ratio is the inverse:
  `μ_new = μ_ref/(1+X)`.
- **Sidespin decay** is linear, `ω_z(t) = ω₀ − α·t`, with
  `α = 5·μ_sp·g/(2R)` (pooltool theory; kernel `evolve.rs`). The kernel's
  R-proportional convention: `u_sp = u_sp_scale·R`, so
  `u_sp_scale = α·2/(5·g)`.
- **WPA §8 table-speed spec** (the only codified equipment gate): a firm
  center-ball lag from the head spot travels **4–4.5 table lengths**. Note
  (TP B.6 / gap-k66 §8): this gate constrains **(u_r, e_c) jointly**, not
  u_r alone — cloth presets therefore hold the cushion configuration fixed.
- **Waldron pool-table stimpmeter** (Dr. Dave PB review): ramp-launched roll
  measures 7 diamonds lengthwise on new Simonis 860 at ≈ competition speed;
  repeatability within one ball width. Discrimination floor: 20% RH change
  ≈ ±0.5 diamond; one loose rail bolt ≈ −0.5 diamond — presets whose
  roll-distance predictions differ by < 0.5 diamond are physically
  indistinguishable on a real table.

## 2. Parameter table (per cloth)

| Cloth | μ_slide | μ_roll | sidespin decay | lag (last lap / roll @1.45 m/s) | e_t | confidence |
|---|---|---|---|---|---|---|
| **Simonis 860 new** (worsted 90/10) | 0.15–0.4 (Dr. Dave published range; Mathavan 2010 measured 0.178–0.245 on napped cloth), point 0.2 | **0.0090–0.0105**, point 0.010 | ~10 rad/s² | 7.0–7.5 s / 4.2–4.7 TL | 0.5 (0.5–0.7) | μ_roll HIGH (Waldron); μ_slide MEDIUM (Dr. Dave typical; no instrumented Simonis μ_slide published) |
| **Simonis 860 worn/dirty/humid** | drifts up ("sticky"), no number → 0.25 | **0.0125–0.020** (extreme 0.024), point 0.016 | likely > 10 (no measurement) | 5.5–6.5 s / 2.6–3.4 TL | 0.5–0.7 | Jewett slow S≈80 HIGH; Marlow upper MEDIUM |
| **Simonis 760** (worsted 70/30) | ≤ 860's, unmeasured (GAP) → 0.2 | **0.0070–0.0090**, point 0.008 | no measurement, assume ≤ 10 | ~8 s / ~5.3 TL | 0.5–0.7 | MEDIUM (Diamond Billiards employee, AzBilliards forums — forums.azbilliards.com/threads/simonis-860-vs-simonis-760.262004/: 760 ≈ 30% faster than 860; other installers there estimate 10–20%) |
| **Simonis 860HR** (70/30 @860 count) | ≈ 860 | 0.0080–0.0100 | no measurement | ~7.5 s / ~4.8 TL | 0.5–0.7 | MEDIUM-LOW — **no preset shipped** |
| **Championship Tour Ed 3030** (70/30, 2-ply) | unmeasured | 0.0070–0.0090 new, speeds up with wear, wide install variance | no measurement | ≈ 760 or faster | 0.5–0.7 | LOW-MEDIUM — **no preset shipped** |
| **Carom (Simonis 300 Rapide)** | — | ~0.005 | — | 10-s last lap on 10-ft | — | HIGH (Jewett S≈200) — no preset yet |
| **Snooker napped** (Mathavan 2010) | 0.178–0.245, avg 0.212 | 0.0127–0.0129, point 0.0128 | 22 rad/s² | — | — | HIGH (first-hand academic measurement) |

Shipped presets (`ClothPreset::by_name`): `simonis_860_tournament` (= kernel
default, bit-exact), `simonis_760_fast`, `worn_slow`, `snooker_napped`.

## 3. Sidespin decay on worsted pool cloth

- Dr. Dave TP B.2 uses **10 rad/s²** static spin-down, "gleaned from videos"
  on pool cloth; his published generic range stays 5–15 rad/s².
- pooltool defaults (`params.py`): `u_sp = (10·2/5/9)·R = 0.0127` → decay
  α ≈ **10.9 rad/s²** — the de-facto open-source calibration matches
  Dr. Dave's 10. The kernel default (and both worsted presets) keeps this
  scale; the snooker preset uses Mathavan's 22 rad/s² exactly.
- **No brand-resolved worsted sidespin measurement exists** (GAP; encoded as
  `#[ignore]` targets in `anchors_cloth.rs`). Recommendation once measured:
  860 = 10, 760 ≈ 8–10, napped snooker = 22.

## 4. Speed-dependent sliding friction (low-speed swerve)

Multiple sources (Rod Cross's billiards notes; the classic Witters &
Duymelinck AJP 54, 80 (1986) — **unverified, from memory**) report μ_slide
dropping toward ~0 as slip speed → 0 on billiard cloth. This is the physical
basis for cloth-dependent low-speed swerve differences; a commercial simulator's
Aug-2019 release notes describe stronger low-speed deflection, the same direction. The
kernel currently models a CONSTANT u_s; a `μ_slide(v_slip)` hook (analogous
to `CushionFriction::mu_of`) is the identified follow-up for slow-shot
behavior at parity with the commercial reference. `tools/cloth/measure.py`'s
`swerve` matrix is the readout that would calibrate it.

## 5. Humidity / wear / per-table variance

- Waldron/Jewett: 20% RH change ≈ half-diamond return-distance change
  (~5% μ_roll shift; humid = slower). One loose rail bolt costs another
  half diamond.
- Installer stretch dominates brand: "you can make 760 slower than 860"
  (AZB installer) — so calibration must expose **per-table μ_roll**
  (`ClothPreset { u_r, .. }` is a plain value: clamp the knob to the
  physical 0.007–0.020 band), with the cloth preset only setting the prior.
- 90/10 (860) is more humidity-sensitive than 70/30 (760/860HR); Tour
  Edition is anecdotally MORE humidity-affected despite 70/30 (conflicting
  reports — one reason no Tour Ed preset ships).

## 6. Commercial-reference intel (parity target)

The commercial reference ships licensed Simonis 860/760/860HR/Rapide 300/920
plus the Strachan snooker range, each tuned to that cloth's published
characteristics; per-cloth cushion friction (raised on Rapide,
lowered on snooker cloth), directional nap on snooker cloth, and a
cloth/ball dirtiness slider. No numeric coefficients published. The preset
system here (cloth = ball-params bundle, cushion fixed) mirrors that
structure while keeping every number provenance-tagged.

## 7. What needs first-party measurement (GAPs)

1. **Simonis-specific μ_slide** — no instrumented publication; 0.2 is
   Dr. Dave's typical for (Simonis-covered) pool tables. Protocol: stun
   slide length `d = 12·v₀²/(49·μ_s·g)` from HSV footage.
2. **Brand-resolved worsted sidespin decay** — spin-down video of a
   full-english stationary ball (`α = ω₀/t_stop`); targets in
   `anchors_cloth.rs` (`simonis_760_sidespin_decay_measured`,
   `worn_slow_sidespin_decay_measured`).
3. **860HR / Championship Tour Edition μ_roll** — only retailer anecdotes;
   a timed-lag (7-s protocol) measurement on a fresh install would upgrade
   them to shippable presets (`low_confidence_cloths_not_shipped`).
4. **μ_slide(v_slip) taper below ~0.3 m/s** — needed for slow-shot swerve at
   parity with the commercial reference; kernel hook not yet built (see §4).
5. **Deep Green event-based simulator parameter table** — PDF unreachable
   during the hunt; constants widely reported to mirror Marlow/Alciatore
   (μ_s 0.2, μ_r 0.01) — unverified.

## 8. Kernel wiring summary

- `ClothPreset { u_s, u_r, u_sp_scale, e_t: Option }` — pure constructor
  bundle applied via `ClothPreset::apply(BallParams)` /
  `SystemState::with_cloth`; the default preset reproduces
  `BallParams::default()` bit-exactly (pinned test + WPA-lag record
  byte-identity test), so kernel default physics is unchanged.
- Surfaces: `pool_py SystemState.with_cloth(name)`,
  TS SDK `clothPreset(id)` / `applyCloth(system, id)` (drift-gated against
  `tools/fixtures/kernel-presets.json`), app Settings → 台呢 equipment
  picker (re-racks through the kernel's equipment resolve).
- Since the equipment-catalog wave (issue #15, kernel-api Amendment 012)
  these presets are ALSO first-class catalog entries (`ClothEntry` in
  `crates/pool-core/src/catalog.rs`, same ids, constructors kept as thin
  aliases with a bit-sync test) with per-entry calibration badges; select
  them via `pool-cli --equipment cloth=<id>`, `pool_py` rack kwargs, the TS
  `Engine.nineBallRack(seed, { cloth_id })`, or the app's equipment panel —
  see `docs/sdk/README.md` § Equipment catalog.
- Anchors: `cargo test -p pool-core --test anchors_cloth`; harness:
  `tools/cloth/measure.py` (README there).
