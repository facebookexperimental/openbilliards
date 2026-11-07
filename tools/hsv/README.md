# tools/hsv — Dr. Dave HSV cushion-clip measurement pipeline

> Also home to the re-audit scripts for the third-party slow-motion reference footage (issue #13;
> private: excluded from the public snapshot):
> `slowmo_audit.py` (color gated tracking + line fits), `slowmo_recon.py`
> (single-view ground-plane camera solve), and the per-scenario drivers
> `slowmo_audit_{follow,cutthrow}{,_recon}.py`. Frames: `ffmpeg -ss <t0>
> -to <t1> -i <footage>.mp4 -vf "fps=30,scale=960:540" frames/<scene>/%04d.png`.
> Measured numbers and their catalog corrections live in the internal
> slow-motion reference catalog (secs 2 and 7).
> The fixture-fidelity sweep adds `slowmo_staging.py` (stun/drag scene
> staging reads at 15 fps: ball centroids + radii, rail nose lines, rail
> diamonds as along-rail scale; perpendicular standoffs from these grazing
> cameras are image-plane LOWER bounds only). Its record is
> `slowmo_staging_fidelity.json` (internal verification records).
> The issue-#16 hop wave adds `slowmo_topspin_hop.py` (60 fps FULL-RES
> frames: `ffmpeg -ss 16.5 -t 7.8 -i <footage>.mp4 -vf fps=60
> frames/topspin/f%04d.png`) — cue-ball hop measurement across the
> topspin angle-2 near-full contact (top-arc circle fits over dual clean
> backgrounds; grounded-baseline lift decomposition). Record:
> `topspin_hop.json` (internal verification records).
> The strike-hop wave (feat/gen-strikehop) adds `slowmo_strike_hop.py`
> (60 fps FULL-RES frames: `ffmpeg -ss 14.5 -t 5.5 -i <footage>.mp4 -vf
> fps=60 frames/strike/f%04d.png`) — cue-ball STRIKE-moment hop across
> the topspin angle-1 tip contact at 17.62 s (warm-chroma right-half
> ring fits — the stick only ever overlaps the upper-LEFT limb; grounded
> baseline anchored on both sides of the flight; ballistic slow-mo
> factor cross-check ~9.8x). Record:
> `strike_hop.json` (internal verification records).
> The mu_bb wave adds `slowmo_mu_tracks.py` (30 fps
> half-res gated tracks of the follow angle-1 and stun A cut scenes) and
> `slowmo_mu_refine.py` (mask top-arc circle-fit refinement — blob
> centroids are stick/shadow/occlusion-biased); throw extraction and its
> observables data live in the private staging tools.
> The gen-backspin wave adds `slowmo_backspin_wide.py` (60 fps FULL-RES
> frames: `ffmpeg -ss 5.5 -t 6.2 -i <footage>.mp4 -vf fps=60
> frames/wide60/f%04d.png`) — cue + red gated tracks of the 'Back spin'
> WIDE sub-clip through the `draw_wide` camera solve (v_top +
> model-radius centers remove the 68–119 mm blob-centroid depth bias;
> apparent image overlap ≠ 3D contact — the red's top edge pins the
> contact). It overturned the wide near-stun read (delayed draw-back)
> and hunted the 0:09 bounce. Record:
> `backspin_wide_draw.json` (internal verification records).

Digitizes the cushion response surface (rebound angle, speed ratio, normal
restitution e_n, tangential velocity ratio, contact dwell) from Dr. Dave's
classic high-speed-video archive into the anchor fixture
`crates/pool-core/tests/fixtures/anchors/hsv_response_surface.json`.
Plan/context: `docs/research/cushion-tangential-plan.md` §2.1 and §6 step 3
(issues #5, #9). Videos are NOT committed — only scripts and derived data.

## Source material and provenance

- Index: <https://drdavepoolinfo.com/high-speed-video/>. Direct MP4s at
  `https://drdavepoolinfo.com/high_speed_videos/<name>.mp4` (A-series under
  `high_speed_videos/new/`). Per-clip URLs are in `clips.json` and in each
  fixture record.
- Camera: Kodak Motion Corder Analyzer PS-110 (verified at
  <https://high-speed-video.colostate.edu/camera/>). **Capture fps caveat**:
  A-series clips carry a camera OSD stamping `1/1000 ... 1000FPS` (verified
  on extracted frames — upgraded from inferred); classic 6.x clips have no
  OSD, so 1000 fps is **inferred** from the shared rig. Angles and velocity
  ratios are independent of the fps assumption; `*_if_1000fps` fields are not.
- Equipment: ~2004 **home table, unspecified cushion rubber — NOT a spec
  K-66**. Fixture is for functional-shape fitting only.
- Playback MP4s are 30 fps 320x240 grayscale; some encodes duplicate each
  capture frame twice (`frame_duplication_factor` = 2, detected from
  consecutive-identical centroids and corrected in capture-frame units).

## Method

1. `ffmpeg -i <clip>.mp4 frames/<stem>/%04d.png` (see Usage).
2. Median-frame background; per-frame bright-pixel (`frame-bg > 30`)
   centroid (`hsvlib.track`); optional ROI to mask the moving A-series OSD
   counters; optional gated tracking for two-moving-ball scenes (6.13/6.14,
   where a glancing ball would contaminate the plain centroid).
3. Cushion line from an intensity-gradient edge fit where the cushion band
   is visible (`hsvlib.fit_cushion_edge`); axis-aligned fallback adds ±2°
   to angle uncertainties (QC-flagged).
4. Apex split along the cushion normal; least-squares linear velocity fits
   over pre/post windows (per-clip overrides in `clips.json`); angles and
   ratios w.r.t. the cushion tangent/normal.
5. Dwell: frames strictly between the last point consistent with the
   incoming free-flight fit line and the first consistent with the outgoing
   one (±2–3 frames; unreliable values QC-flagged).
6. Uncertainties (1σ): fit residual standard errors (absorbing the ~1–2 px
   ≈ 0.5–0.8 mm centroid jitter at 320x240) propagated first-order; ball
   scale from the 57.15 mm ball's blob radius (±15%).
7. Every track is eyeball-verified via the annotated overlay PNGs the
   pipeline writes (track colored by time, green/cyan fit windows, blue apex
   cross, magenta cushion line).

## Usage

```sh
python -m venv venv && venv/bin/pip install numpy Pillow
mkdir -p work/frames && cd work
for u in $(python -c "import json;print('\n'.join(c['url'] for c in json.load(open('../clips.json'))['clips']))"); do
  curl -sO "https://drdavepoolinfo.com/$u"; done
for f in *.mp4; do d=frames/${f%.mp4}; mkdir -p $d; ffmpeg -i $f $d/%04d.png; done
python ../measure_clips.py frames out     # per-clip JSON + overlay PNGs
python ../spin_stripe.py frames out       # stripe periodicity (writes out/spin_stripe.json)
python ../build_fixture.py out ../../../crates/pool-core/tests/fixtures/anchors/hsv_response_surface.json
```

## Clip coverage

- **Quantitative (16)**: HSV 6.2–6.14 (angled kicks with top/bottom/roll/
  stun spin; the 6.6–6.9 speed × spin-sense bank quadrant; 6.10 straight-in
  sidespin; 6.11/6.12 reverse/running; 6.13/6.14 glance-induced-spin banks)
  and HSV A.26–A.28 (kick with english / reverse / running).
- **Qualitative only (8)**: HSV A.68–A.75 (large-angle kick factorial). The
  camera looks along the rail against a black background with no reference
  line; the normal component is depth-foreshortened and the clips contain
  replay cuts — image-plane kinematics are not honestly measurable, so the
  records carry conditions + QC reasons only.
- **Not measured (1)**: HSV B.41 (bank speed effects) is a narrated
  multi-scene broadcast edit. 2026-07 re-attempt with scene-cut
  segmentation (issue #13 audit; ffmpeg scene threshold 0.12 → cuts at
  26.8 / 32.8 / 74.0 / 134.5 / 145.6 s over 154 s) confirmed it stays
  qualitative-only: segments 1/3/6 are live-table oblique consumer takes
  (480×360, ball 8–12 px, banks demonstrated with cue sticks laid on the
  cloth as line markers; far-rail diamonds unresolvable, so the diamond
  homography is rank-deficient exactly where the banks land) and segment
  74.0–134.5 s is a block of 1000FPS contact-zone close-ups (session
  08-24-08 counters 03–09, FOV ~3 ball widths, one rail diamond, oblique,
  1/1000 and 1/5000 shutter) with no incoming/outgoing legs long enough
  for angle fits and no second in-frame reference. It remains a step-6
  behavioral cross-check in the plan, not a fixture row.

## Spin (stripe periodicity)

`spin_stripe.py` autocorrelates the dark-stripe fraction inside a disc on
the ball. Only HSV 6.9 shows a clean period in both windows (32 video frames
pre-contact → 20 post, i.e. spin rate ×1.6 through contact — consistent with
its tangential-velocity gain of 1.53). Absolute |ω| is NOT trusted (×2
stripe-arc-per-revolution harmonic ambiguity; single-cycle values exceed
achievable cue-induced spin), spin about the stripe axis is invisible, and
the axis is not recovered — spin sense comes from clip titles. Recovering
full spin vectors needs stripe great-circle fitting (future work).

## QC flag glossary

`perspective_skew_uncorrected` (all clips: no in-frame markings) ·
`no_cushion_edge_fit_axis_aligned` · `short_pre_contact_capture` (6.2/6.12
start almost at contact) · `duplicated_frames_factor_2` ·
`dwell_estimate_unreliable` · `near_perpendicular_tangential_ratio_ill_conditioned`
(|vt_in| < 1 px/f: ratio sign flip is real spin-induced reversal but the
magnitude is ill-conditioned) · `two_moving_balls` + `post_contact_curvature`
(6.13/6.14) · `occlusion_gaps_near_contact` · A.68–A.75 reasons listed above.
