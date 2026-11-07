# Break evidence: what the cue ball really does on a square hard break into a tight rack

**Claim under test.** Tight rack ⇒ apex ball is wedged ⇒ effective mass > one
ball ⇒ the cue ball should rebound BACKWARD on a square hit; a perfect dead
stop is implausible.

**Verdict: CONFIRMED.** Two independent frame-tracked clips (the third-party slow-motion
reference footage's uncataloged break segment and Dr. Dave's real 1000 fps HSV B.43) plus the
instructional-physics literature agree: with ~zero vertical spin the cue ball
reverses within milliseconds of contact and retreats at **0.15–0.35** of its
incoming speed, usually with a small backward hop. Dead stop on the break only
happens when slight topspin cancels the rebound (that is what "squatting the
rock" *is*). Data + acceptance band: `tools/staging/break_evidence.json`.

## 1. Reference-footage break segment (38.8–41.7 s) — first cataloging pass

The segment the slow-mo catalog notes as observed-but-not-cataloged. Correction
to the catalog's Method note: it is a **9-ball diamond**, not a 15-ball rack.

Method: 60 fps full-res frames (`ffmpeg -ss 38.8 -t 2.9 -vf fps=60`); gated
white-component tracker for the cue (BFS connected components + linear
prediction, gate 110 px — a plain white-mask centroid is poisoned by the white
crest logos on the rack balls); yellow gate for the apex 1. Camera verified
static (3 background patches < 1 gray level mean drift over 96 pre-crossfade
frames). Slow-mo factor unknown ⇒ time-base-free ratios only; the in/out fit
windows cover the same image region, so depth scale cancels to ~5%.

Observed sequence: cue flies in with a low hop (airborne at 39.3 s), is at/near
bed height one frame before contact, hits the frozen diamond square-ish on the
apex 1 (contact frame 59 ± 1, t ≈ 39.77 s). Then:

| quantity | value |
| --- | --- |
| v_in (image, f44–57) | (20.41 ± 0.38, 10.39 ± 0.21) px/frame |
| v_out (image, f62–82) | (−6.53 ± 0.07, −3.91 ± 0.06) px/frame |
| speed ratio | **0.332** image, **0.320** x-only (± ~0.04) |
| direction | reversed, 3.9° off the reversed incoming line |
| rebound hop | out-track rides up to ~35 px (~0.23 ball dia) above the incoming ground-track, ballistic shape, lands then keeps sliding backward at −6.52 px/f, still moving at the crossfade |
| apex 1 | departs at ~0.58·v_in image speed toward the wing direction |
| rack center 9 | no visible displacement in the first ~20 frames |

## 2. Dr. Dave HSV B.43 "break squat" — real 1000 fps anchor

Source: <https://billiards.colostate.edu/high-speed-video/hsv-b-43/> (YouTube
`cwenzuIPdJQ`), same Kodak Motion Corder rig as the repo's cushion HSV fixture.
Scenario 1 is "stun (very slight draw), close to the equator" — the clean
no-spin test. The playback speed varies (FWD2→FWD15) but the OSD PLAY counter
stamps capture time at 1 ms/count (rates 15/6/3/2 playback frames per capture
ms verified self-consistent), so velocities are on a real timebase.

Result: cue (stripe-marked ball) reverses within ≤ 2 ms of contact;
v_in,x = 18.7 px/ms → v_out,x = 3.1 px/ms: ratio **0.167** raw, **0.180**
scale-corrected; incoming slightly descending, outgoing rising (rebound hop);
absolute incoming speed ~12–14 m/s image-plane (ball-width scale), matching
Dr. Dave's "powerful break = 25–30 mph". The visible rack ball barely moves in
the +35 ms window.

## 3. Literature

- **Dr. Dave break FAQ** (<https://drdavepoolinfo.com/faq/break/ball-hop/>):
  "The larger effective mass of the rack of balls makes the CB bounce back, so
  slight follow is required to stop that motion." Squat requires a tip "a hair
  above center"; a firm-break cue ball is always airborne/hopping on the way in
  and hops after contact if airborne at impact. No numeric fraction published.
- **BD March 2018** (rack & break 9-ball): with a tight rack the center 9
  "doesn't move during the break"; the 1's direction is "very sensitive to the
  square-ness of the hit and any gaps in the rack".
- **Gismeros Moreno 2022** (DOI 10.1007/s11071-021-07117-4; full read in
  `gap-break-multibody.md`): cue + 3-ball frozen break benchmark at 10.729 m/s;
  smooth-contact model needs initial gaps α ∈ 1e-9–1e-7 m; at α = 0.2 mm it
  produced a qualitatively wrong apex direction (disproved by a non-smooth
  model) — gap size decisively changes multiple-impact outcomes.
- **Racking practice** (AZB gaps thread, Dr. Dave tight-rack FAQ, PoolDawg/
  Kohler): a proper rack is all-frozen and template racks exist to guarantee
  it; worn/out-of-round sets often cannot be fully frozen (wooden-triangle
  racks routinely carry ≥ 1 small gap); even paper-thin gaps measurably change
  the break; apex-adjacent freeze matters most. No published statistics on the
  frozen-contact fraction were found — recorded as practitioner consensus.

## 4. Effective-mass anchor and acceptance band

Elastic 1-D map r → M_eff/m = (1+r)/(1−r): r = 0.18 ⇒ 1.44, r = 0.32 ⇒ 1.94;
a rigid 3-ball wedge bounds r at 0.5. Both clips sit inside [1-ball,
3-ball-wedge], as a wedged apex requires. A gapped apex degenerates to an
equal-mass pair collision ⇒ r ≈ 0.

Band (square center-ball break, ≥ ~5 m/s, ~zero vertical spin, frozen rack):

- **direction**: reversed within ±15°;
- **fraction**: |v_out,h|/|v_in,h| ∈ [0.10, 0.40] (anchors 0.18 real / 0.32 reference footage;
  clip-derived TARGET center 0.15–0.35);
- **dead stop** (< 0.05) or forward roll-through with zero/backspin: FAIL;
- **topspin** shrinks the retreat toward zero (squat); draw amplifies it;
- **hop**: backward hop apex ≲ 0.3 ball dia expected when arriving descending;
- **center ball** displacement ≈ 0 during the transient;
- **gapped apex ≥ 0.2 mm**: fraction falls toward 0–0.10 (medium-low
  confidence — no direct gapped-break HSV; theory + Gismeros + consensus).

Confidence: direction HIGH; frozen numeric band MEDIUM (two independent clips
agree within 2×); gapped band MEDIUM-LOW.

CAVEAT RETIRED (feature-018 default flip, 2026-07-11). The paragraph that
stood here recorded that the 0.10 floor coincided with the
sequential-impulse cluster model's own analytic 3-ball-wedge saturation
≈ 0.100 (break-cue-back-reaction.md §3a) — the then-shipped kernel passed
the band gate only AT the floor (measured 0.102–0.108) and clip fidelity
was a recorded residual. The compliant multibody cluster model
(`ClusterModel::CompliantChain`) is now the KERNEL DEFAULT
(feature 018 (internal spec), flip-cascade.md), and the measured default
fractions sit next to the clip anchors instead of at the floor:

- **tight rack** (fully frozen lattice — the topology both clips
  measured; the clip-band predicate): **0.157–0.165** across the pinned
  (seed, v0) matrix — inside the clip target 0.15–0.35, bracketing the
  Dr. Dave B.43 anchor 0.18±0.04's lower edge;
- **default construction** (imperfect racking, ~30% open back-row
  boundaries): **0.121–0.164** — seeds whose first cluster truncates at
  a seeded gap rebound lower (the Gismeros 2022 gap-degradation
  direction this evidence itself expects), fenced by the outer band;
- direction ≤ 0.1° off the reversed line everywhere; zero guard
  fallbacks.

The clip-target test `break_cue_rebound_clip_target_residual`
(event_loop.rs) is UN-ignored since the flip: it asserts 0.15–0.35 on
the tight-rack predicate as a PERMANENT gate in every `cargo test`
(FR-011/SC-001), with the default-construction rows fenced by the outer
[0.10, 0.40] band. The 0.10 floor remains in the outer band as the
dead-cue regression fence only — the default model no longer saturates
anywhere near it.

## 5. Repro recipe

Ad-hoc scripts (docs-only wave, not committed) under `/tmp/breakhunt/`:
`track2.py` (reference-footage cue component tracker), `track_break.py` (apex/first-pass),
`b43_osd.py`/`b43_track.py`/`b43fit.py` (B.43 OSD timebase + two-ball tracks),
`fit.py` (reference-footage velocity fits). B.43 download: scrape the mp4/YouTube id off the
HSV page, `yt-dlp --no-check-certificates`. Reference footage: see the tools docs
re-download recipe.
