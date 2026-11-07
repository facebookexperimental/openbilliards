# break-scrub — "Anatomy of a Break" scroll-scrub frame sequence

Self-rendered from the engine (no stock footage, no compositing): the
deterministic frame sequence behind the site's scroll-scrubbed break act.
Producer: `tools/render/break-scrub.mjs`; contract check:
`tools/render/break-scrub-verify.mjs`; consumer contract: `manifest.json`
in this directory.

Cue model: **cuepost armed** (design 277 post-strike engine; GH-365
re-record, see the revision note below). Greppable stamp: `cueModel` in
`manifest.json`.

## The GH-365 new-cue re-record (this revision, same record)

Owner ruling 2026-08-05 (media unification on the post-strike cue model):
the act re-records WITH the design-277 cue — the scrub opens ON the
strike, so the rod's post-strike states are content. Nothing about the
physics changed: the SAME committed `record.json` (seed 33, kernel
`0.1.0+fb3425ad`, 184 events — the live dist has moved on, so the
producer exercised its kernel-pin materialization and served the archival
`fb3425ad` wasm from git history), the same 255-frame non-uniform plan,
the same camera path, grade and budgets. The producer now REFUSES to
render cue-less (fail-closed live-lane arm assert, hero-extend doctrine).
The armed plan on this record: **class break / mode fade, pin-and-lean C
plan peak 27.2 mm, stay-down through the hop, fade 0.756 → 1.006 s
(D4: completes 0.05 s before the pack's 1.056 s rod-zone intrusion)** —
scrub positions show the strike-compression bend, the stay, and the fade
withdrawal; the rod is gone before the spread beat's tail. All frozen
gates re-asserted (replay identity 184 events ≤ 1e-9; apex 363.9 mm @
0.381 s; every-ball-moves; continuity worst 33.8 px < 48; crispness
0.916–0.989×; crop bands clear ≥ 10 px on both dirs; desktop q70
4.89 MB ≤ 6 / mobile q68 2.41 MB ≤ 2.5). `manifest.json` gains the
schema-additive `cueModel` field (motion.js validates only
version/frameCount/frameTimes/dirs — consumed unchanged).

## The issue-87 slip-law re-record (this revision, same seed 33)

The #77 Coulomb-cap slip law (issue-87 repin, canonical wasm
`0.1.0+fb3425ad`) legitimately reshapes the break event stream: the
seed-33 recipe re-simulated on the new dist gives **184 events, Rest
7.0835 s** (was 180 events / 6.7642 s), first divergence a slip-branch
BallTable time shift at event 36; the slip-only legacy pins
(`ball_ball_slip_law: PostImpactNormalDelta` + `slip_select:
LegacyBracket`) reproduce the old record's events exactly, so the delta
is attributable to #77/#83. Per the T022 SEED-bump precedent the act
re-records — on the SAME seed 33, which survives every frozen gate on
the new kernel: hop apex **363.9 mm** @ 0.381 s, landing 0.654 s, min
net displacement **0.133 m** by the 1.45 s window end / **0.584 m** by
Rest (both the cue ball), rack spread 0.060 → **0.740 m**, and still
**no pockets** anywhere in the record (the fifth beat stays the
pack-blossom spread dwell). Verified on the shipped pixels by
`break-scrub-verify.mjs` (continuity worst 33.8 px < 48; crispness
0.949–1.006×; crop bands clear; desktop 4.79 MB / mobile 2.37 MB).
Numbers quoted in the sections below describe the superseded
feature-018 seed-33 revision unless restated here.

## The seed-33 flip re-record (previous revision, feature-018 default flip)

Record history: the original showcase (natural seed-4 rack) left **ball
2 nearly motionless — 3.1 cm total** — a Newton's-cradle
conduction-starvation artifact of the sequential-impulse cluster solver
on the collinear 1→2→4 lattice line; the seed-19 revision (issue #20)
was the product remedy, a rack seed where every ball visibly moved
UNDER THAT solver. This revision re-records the SAME shot at the
feature-018 default flip (flip-cascade.md §3): the kernel default
cluster model is now the compliant multibody chain — the kernel-level
fix itself — so the starvation class is gone and the break physics
legitimately changed. The frozen gates re-ran on the flipped kernel
(`0.1.0+3856cb9`):

- **min net displacement ≥ 2 ball diameters (0.114 m) for every ball by
  the render window's end** — measured **0.135 m** (the cue ball) at
  1.45 s;
- **min net displacement ≥ 0.25 m for every ball by Rest** — measured
  **0.587 m** (the cue ball).

Seed choice, measured on the flipped kernel: the compliant model makes
the cue SQUAT (correct pro-break behavior), which parks the cue itself
under the displacement floors on many seeds (old seed 19 now parks ball
5 at 113 mm by window end; seed 4 leaves the cue at 223 mm by Rest). A
headless sweep over seeds 0–40 left survivors 0/17/25/26/29/33/38/40;
**seed 33** is the only survivor whose terminal composition also clears
the site module's croppable band (the squatting cue reads bottom-left of
the terminal pull-back frame — seed 17's shipped pixels failed
`break-scrub-verify.mjs` exactly there). Honest cost unchanged: the
record pockets NOTHING in its full 6.76 s, so the act's fifth beat stays
the pack-blossom **spread** dwell (voiced by the sanctioned derived
`Spread` mark), not a pocket drop. All gates are re-asserted by the
producer on every run and by `break-scrub-verify.mjs` on the committed
record.

## The high-speed spec (kept from the reshoot revision)

The act is shot like ultra-high-speed camera footage, not slow-motion
video. Three consequences drive the whole recipe:

1. **Core action only.** The record runs to Rest at 6.76 s; the window
   covers 0 → **1.45 s** — strike, rack contact, hop, landing, the
   11-cushion flurry, and the spread blossoming into a deliberate
   mid-spread terminal freeze. The long settle tail is narrated by the
   terminal `Rest` mark, not scrubbed through.
2. **Every frame is a crisp Phantom-style still.** No shutter
   accumulation at all — each frame is a single-sample
   `__test.renderAt` at its exact record time. A crispness gate compares
   p99.9 Sobel edge-gradient magnitude of the fastest frames against the
   static strike frame (measured 0.97–1.03×; baked motion blur suppresses
   peak edge gradients long before the eye gives up).
3. **Temporal density carries the motion.** 255 non-uniform frames:
   1.1–2 ms spacing INTO every beat, nothing wider than 15 ms in the
   settle tail. Continuity gate on the measured screen-space inter-frame
   ball displacement: mean 8.4 px, worst 33.8 px on the 1600×900 frame
   (the cue-ball run-up), under the 48 px spike limit — scrubbing reads
   as continuous motion with no baked blur anywhere.

## Provenance

- **The frames VISUALIZE the committed record — the shot is never
  re-simulated on a drifted kernel.** `record.json` (kernel
  `0.1.0+fb3425ad` since the issue-87 re-record, seed 33, 184 events,
  gate measurements) is the source of truth. The producer pins the record's exact canonical wasm
  (materializing it from git history if the live `web/dist` build ever
  moves on — determinism doctrine: the canonical physics IS the shipped
  binary), replays the shot on it, and gate-asserts the replayed event
  stream is IDENTICAL to `record.json` (count, times ≤ 1e-9, kinds)
  before any frame is captured. This revision's record was SIMULATED
  ONCE on the then-current committed canonical wasm (`0.1.0+3856cb9` —
  a new record needs no historical materialization; it is stamped with
  the live build's own version) and every later run replays it.
- **Physics**: real kernel simulation on the byte-frozen legacy WPA
  equipment — `table_id wpa_generic_9ft`, `cushion_model_id
  stronge_realistic` (the same pin every scripted `record.mjs` preset
  applies). Natural seed-33 rack, no `layout()`.
- **Shot** (the feature-008 hero-v2 beat-1 hop-break pose family):
  `v0 7.5 m/s, phi π/2, theta 7°, a 0, b +0.2R`.
- **Gates asserted before encoding** (a dead payoff fails the render):
  replay identity (above); every-ball-moves displacement minima (above);
  first cue contact 0.1146 s; cue ball genuinely airborne after the rack
  impact — measured hop apex **363.9 mm** at 0.381 s (2 ms sampling,
  cross-checked against `record.json` gates), landing (`BallTable`) at
  0.654 s; rack spread 0.060 → 0.740 m mean distance from the rack
  centroid by 1.45 s (issue-87 re-record; the flip revision measured
  0.739 m); no `BallPocket` anywhere in this record (see the seed note —
  nothing is captioned as pocketed). Every number in `manifest.events`
  comes from this record or the shot parameters.

## Render

- Ultra-high-speed convention: single-sample `__test.renderAt` per frame
  (shutter accumulation OFF — the old 310° 8-subframe blur smeared every
  fast frame the moment the visitor parked the scrub), captured at
  3200×1800 over CDP (SSAA 2), lanczos-downscaled and graded with the
  committed film grade (`tools/render/grade.json`: filmic curve →
  vignette → grain).
- Look: `setLook('tournament')` (steel_gray tournament cloth) + the brand
  photography rig from the imagery provenance ledger (far prop table hidden,
  `darkenWorld 0.55`, `dim 7.6/0.05/0.4`, `expose 0.80`, rack-zone +
  cue-ball-key warm rims) — grade-continuous with the existing site imagery.
- Camera: per-beat escalating three-quarter path (fov 34), piecewise
  smoothstep between six keyframes so camera velocity is zero exactly at
  every beat's hold frame — WIDE at the strike hold (`[2.05, −1.85,
  1.45]` → `[0, −0.05, 0.10]`, the act's approved opening pose), a dolly
  push through the contact hold (`[1.50, −0.70, 1.02]` → `[0, 0.42,
  0.10]`) into a high close-up for the hop-apex hold (`[1.19, −0.20,
  1.17]` → `[0, 0.52, 0.20]`: the airborne cue ball reads against clean
  cloth with its lamp shadow visibly separated below, so the pixels
  corroborate the 364 mm caption; the pull-back inherited from the
  seed-19 retune keeps the crop-band top clear with real margin), a half
  pull-back parking exactly on
  the landing hold (`[1.60, −0.75, 1.22]` → `[0, 0.45, 0.12]`), the rest
  of the pull-back parking wide on the spread hold (`[2.05,
  −1.35, 1.40]` → `[0, 0.40, 0.10]`), then a slow settle drift to
  `[2.05, −1.25, 1.37]` → `[0, 0.40, 0.10]` for the terminal freeze
  (terminal look ky retuned 0.45 → 0.40 at the seed-33 flip reshoot: the
  compliant squat drifts the cue toward head-left through the tail, and
  its silhouette crossed the band's left edge by ~14 px under the old
  look; matching the spread-hold look makes the drift a pure dolly). A
  pure function of the frame index, so backward scrubbing replays the
  identical smooth path.
- Terminal composition (measured, not hoped): over the gate frames every
  ball silhouette on the graded frame sits inside y 0.342–0.813 of
  source height — clear of the module's croppable band (constant bottom
  anchor 0.845; worst-case top edge ~0.289 at the 3.2:1 stage cap). The
  x axis carries the twin law (fix round 2 2026-07): the band's right
  edge pins at the source right edge — all x-crop comes off the left —
  and the canvas-box aspect floors at 1.6:1, limiting the left-edge
  sweep to x 0.10; the record's leftmost gate silhouette is the
  squatting cue at x 0.1106 (17 px source margin to the band edge, past
  the 10 px requirement — the tightest number in the composition; the
  terminal-pose retune above bought it), the rightmost at x 0.8475. `framing.json` (written by the producer alongside the
  manifest) ships the analytic kernel-sphere seed boxes for the crop
  law's gate population — the five beat frames + the last 10 — and
  `break-scrub-verify.mjs` re-measures the real pixel silhouettes on
  the SHIPPED frames inside those windows, asserting every crop-band
  extreme clears every silhouette by ≥10 source px on both frame dirs
  (measured extremes clear by ≥26 px on this record).

## Temporal mapping

255 frames over the first 1.45 s of record time, NON-uniform (all times
in `manifest.frameTimes`): four cosine-eased dense segments — strike run-up
(f0–21), contact → apex (f22–85), apex → landing (f86–133), landing →
spread beat (f134–181) — each entering/leaving its beat at 1.1–2 ms
spacing, then a linear dt-ramp settle tail (f182–254) from 2 ms out to
13.9 ms at 1.45 s. Beats (holds in `manifest.beats`): strike f0, contact
f22 (t 0.1146), apex f86 (t 0.3466), land f134 (t 0.5851), spread f182
(t 0.88).

## Encode (budgets: desktop ≤ 6 MB, mobile ≤ 2.5 MB)

- `frames/` desktop 1600×900 WebP q70 (Pillow, method 6): **4.70 MB**
  total, 18.9 KB/frame avg.
- `frames-m/` mobile 960×540 WebP q68: **2.31 MB** total, 9.3 KB/frame avg.
- `poster.webp` = the hop-apex frame (f0086) at 1600×900, q82, 24 KB.
- 255 crisp frames carry more real detail per frame than the old blurred
  183, hence the lower q; checked visually at 1:1 on both sizes: no
  banding on the gray cloth (the grade grain dithers the lamp falloff),
  ball edges stay clean.

## Regenerate / verify

```sh
node tools/render/break-scrub.mjs           # ~10 min on Apple Silicon
node tools/render/break-scrub-verify.mjs    # contract + budget assertions
```

The GPU raster is not bit-deterministic run-to-run. The record, the
kernel pin, the frame plan, the manifest and the gates are
deterministic.
