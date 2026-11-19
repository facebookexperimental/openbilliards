# Dr. Dave matched-english cushion pairs → reverse/running observable ratios

Issue #18 Phase 1a. Reduction date: 2026-07-07. Everything here lives under
`tools/hsv/thirdparty/drdave-pairs/`; **no kernel, SDK, or fixture files were
touched**. Source hunt + URLs: `an internal data-hunt note`
(§3.2, §5a). Question under test: do the matched-condition HSV pairs (same
geometry/speed, only english sense varied) show reverse english losing MORE
speed than running — and if so, in which channel (normal restitution vs
tangential/friction), at what magnitude vs the kernel's `mu(2.6) ~ 0.16`
reverse-quadrant pin (TOPRIGHT-02/04 need `mu >= 0.24`)?

## 1. Material

14 clips fetched from Wayback `id_` mirrors (`fetch.sh`; live site 403-blocks
datacenter IPs). All verified with ffprobe: 320×240, 30 fps containers, all
play and decode cleanly.

| clip | frames | content | camera view |
|---|---|---|---|
| HSV6-6/6-7 | 96/87 | bank fast, reverse/running | perpendicular to right cushion |
| HSV6-8/6-9 | 188/122 | bank slow, reverse/running | same |
| HSV6-11/6-12 | 75/72 | kick medium, reverse/running (supplementary — completes the medium pair) | top cushion |
| HSV6-10 | 130 | straight-in + sidespin | top cushion |
| HSVA-26 | 96 | straight-in kick + english | bottom cushion, Redlake OSD |
| HSVA-27/28 | 70/66 | small-angle kick, reverse/running (supplementary) | same |
| HSVA-68–71 | 577/210/525/203 | large-angle kick {run,rev}×{slow,fast} | **along the rail** (see §5) |

Provenance niceties recovered from the OSD session stamps: A-26/27/28 are
consecutive shots #24/#25/#26 of one session (17:38–17:41); A-68/69/70/71 are
shots #03/#04/#05/#07 of one session (13:21–13:28) — the "matched staging"
claim is corroborated by the camera itself. Equipment caveat (inherited from
`tools/hsv/README.md`): ~2004 home table, unspecified cushion rubber — **not a
spec K-66**; functional shapes and pair ratios only.

## 2. Method

Tracking reuses `tools/hsv/hsvlib.py` unchanged (median background →
bright-pixel intensity-moment centroid, sub-pixel; cushion line from
intensity-edge fit where visible, else axis-aligned + 2° penalty; linear
velocity fits on pre/post windows; 1σ errors from fit residual standard
errors, first-order propagated into angles/ratios). Per-clip configs mirror
`tools/hsv/clips.json`. Scale: 57.15 mm ball diameter over the blob radius
(±15%); clips look like pool (Dr. Dave's table), not snooker.

New over the existing pipeline:

1. **Exact A-series time base** (`ocr_osd.py`): the Redlake `PLAY-######`
   capture-frame counter (top OSD row, digit cells at x=228+12k, y=10..23) is
   OCR'd per frame by normalized cross-correlation against grayscale
   templates harvested from 25 eyeball-labeled frames (self-check 25/25;
   readable on 100% of 1,697 A-series frames). Decoded structure:
   - A-26: uniform 2 capture-frames/video-frame (OSD `FWD60`), no cuts →
     the mp4 *skips* every other capture frame.
   - A-27: 2 cf/vf with two duplicated frames; A-28: uniform 2 cf/vf.
   - A-68/A-70: live segment at 1 cf/vf (459/417 frames), then an in-clip
     REPLAY of the same shot at 4 cf/vf. Fits use the live segment only.
   - A-69/A-71: slow-motion segment at 0.5 cf/vf (167/161 frames) then a
     2 cf/vf replay. Same policy.
   Velocity fits regress position against this counter (ms at the stamped
   1000FPS), so A-series speeds are absolute; 6.x clips have no OSD and stay
   ratio-only (see §6 fps ambiguity).
2. **Fade/clip gating** for the along-rail quartet: the scene fades to black
   at the frame edges; an emerging ball has only its lit fraction counted,
   faking a slow-down (blob area 90→1900 px over ~30 frames). Frames with
   blob area <1500 px or centroid within ~1 ball radius of the x edges are
   dropped from fits.
3. **μ_eff column**: translational impulse ratio
   `|J_t|/|J_n| = (vt_in − vt_out)/(vn_in + vn_out)` per event — equals the
   contact μ when the nose slips in one direction throughout, and is a
   **lower bound on μ_k** if the contact sticks partway. Spin is NOT
   measured (stripe great-circle fitting remains future work; spin sense
   comes from clip titles + rebound behavior), so μ_eff cannot be indexed
   against nose-slip ratio.

Every track was eyeball-verified via overlay PNGs (`out/overlays/`,
QC montages `out/qc_*.png`). Raw tracks: `out/tracks/<clip>.csv`
(video frame, capture-time, x, y, blob area). Per-clip JSON:
`out/measurements/`. Machine-readable tables: `out/pair_ratios.{json,md}`.

## 3. Matched-pair tables

Full tables with 1σ errors in `out/pair_ratios.md`. Summary (reverse vs
running; θ from cushion normal; `v_ratio` = |v_out|/|v_in|; `tr` =
tangential velocity ratio out/in):

| pair | condition | clip (rev / run) | θ_in | vn_in m/s* | v_ratio | e_n | tr | μ_eff |
|---|---|---|---|---|---|---|---|---|
| P-fast | bank ~28°, fast | 6-6 / 6-7 | 28.5 / 27.2 | 5.1 / 4.3 | 0.632±0.006 / 0.754±0.011 | 0.670±0.006 / 0.658±0.009 | 0.48 / 1.04 | 0.169±0.003 / 0.013±0.006 |
| P-slow | bank ~24°, slow | 6-8 / 6-9 | 23.9 / 23.9 | 2.3 / 5.7† | 0.803±0.006 / 0.847±0.043 | 0.858±0.005 / 0.631±0.034 | 0.42 / 1.53 | 0.138±0.003 / 0.145±0.015 |
| P-med | kick ~28°, medium | 6-11 / 6-12 | 28.1 / 27.7 | 5.3 / 6.9† | 0.624±0.004 / 0.762±0.152 | 0.685±0.004 / 0.722±0.145 | 0.33 / 0.89 | 0.213±0.002 / 0.033±0.059 |
| P-small | small-angle kick, medium | A-27 / A-28 | 19.5 / **11.9** | 4.7 / 4.8 (exact) | 0.715±0.010 / 0.934±0.031 | 0.746±0.009 / 0.828±0.025 | −0.38 / 2.27 | 0.279±0.005 / 0.145±0.009 |

\* nominal: A-series exact (OSD); 6.x assumes 1000 fps capture and ±15% blob
scale. † duplicated-frame encodes — could be 500 fps captures (§6), which
would halve these; ratios are immune.

**Headline reverse/running ratios** (the slip-sense observable):

| pair | v_ratio rev/run | e_n rev/run | rebound-angle shift (rev − run) |
|---|---|---|---|
| P-fast | **0.837 ± 0.015** | 1.018 ± 0.017 | −17.8° ± 0.3 |
| P-slow | 0.948 ± 0.048 | 1.361 ± 0.073 (confounded†) | −34.8° ± 1.3 |
| P-med | 0.819 ± 0.163 | 0.950 ± 0.191 | −18.8° ± 1.0 |
| P-small | **0.765 ± 0.028** | 0.901 ± 0.029 (θ-mismatch confound) | −19.7° ± 2.8 |

† P-slow's e_n contrast rides on a possible 2.5× vn mismatch (6-8 vn 2.26 vs
6-9 vn 2.83–5.67 m/s depending on the fps ambiguity) and normal restitution
rises steeply at low speed (Mathavan 2009 e(v)); it cannot be read as a
slip-sense effect. P-small's e_n contrast is confounded by the 19.5° vs 11.9°
incidence mismatch.

**Straight-in (near-normal incidence) sidespin probes** — priority 1: at
normal incidence the entire tangential channel is spin-driven, and any
"grinding" normal loss should depress e_n below the no-spin baseline:

| clip | θ_in | θ_out | v_ratio | e_n | μ_eff | v_in |
|---|---|---|---|---|---|---|
| HSV6-10 | 4.2° ± 0.7 | 20.6° ± 0.7 | 0.666±0.019 | 0.626±0.014 | 0.190±0.009 | 3.7 m/s (if 1000fps) |
| HSVA-26 | 4.1° ± 2.1 | 23.9° ± 2.0 | 0.758±0.014 | 0.695±0.008 | 0.225±0.008 | **3.49 m/s (exact)** |

No-spin baselines at comparable speed: Dr. Dave e_c ≈ 0.70 (B.15/TP 7.3
class), HSV 6-5 stun e_n = 0.649, Mathavan 2009 (snooker) e(3.5 m/s) ≈ 0.80.
The sidespin e_n values (0.63–0.70) sit ON the pool baselines: **no
measurable sidespin-induced normal-channel loss at normal incidence**
(bound: ≲8% given the baseline scatter). The sidespin signal instead appears
as the 20–24° rebound deflection and the 0.19–0.23 friction impulse ratio.

## 4. Spin-sense confirmation

Ball markings (stripes) are visible and clearly rotating in 6-6..6-12, 6-10,
A-26/27/28, A-68–71, but per the existing `tools/hsv` analysis
(`spin_stripe.py`) stripe autocorrelation recovers only a period (and only
cleanly on 6-9: spin rate ×1.6 through contact, consistent with its tr =
1.53), never the axis or sense — spin sense here rests on clip titles plus
internally consistent rebound signatures (reverse: rebound pulled toward the
normal, tangential speed collapses/reverses; running: rebound widened,
tangential speed amplified). All 14 clips show the title-consistent
signature. A-27's tr = −0.38 (tangential velocity REVERSES through contact)
is the strongest direct evidence of reverse-english regrip in the set.

## 5. A.68–71 along-rail quartet — honest status: not quantitatively reducible (fast pair), indicative only (slow pair)

The camera looks along the rail from table level (no reference line, black
background). Image x ≈ along-rail (tangential) channel; the cushion-normal
channel lies near the optical axis and is invisible in-plane. The OSD OCR
plus fade gating (this work) fixes the time base and the biggest centroid
biases the prior wave flagged, but the geometry still defeats honest
reduction:

- Blob-radius depth drift through the fit windows (transverse-scale
  systematic, measured): A-68 −2.0%, A-70 +5.5%, A-71 −3.4%, **A-69 −8.1%**
  — same order as the expected contrast, and NOT matched within pairs.
- Stripe rotation modulates the lit-pixel centroid (±few px) on top.
- **P-largeangle-fast (A-71/A-69) FAILS validation**: raw tangential-ratio
  contrast rev/run = 1.41±0.04 (reverse *gaining* 14% while running loses
  19%), radius-corrected 1.48 — opposite sign to every measurable pair and to
  the FAQ; the two clips' depth trajectories are mutually inconsistent.
  Excluded from the verdict.
- **P-largeangle-slow (A-70/A-68)**: tangential ratio rev/run = 0.99±0.03
  raw, 1.06±0.03 radius-corrected → **no reverse/running contrast at grazing
  incidence**, consistent with Dr. Dave's FAQ claim ("sidespin has little
  effect at shallow angles", which cites A.71). Indicative only — the
  depth-drift systematic is the size of the effect.

This upgrades the prior wave's "qualitative only" QC with quantified reasons
(and one new usable qualitative datum: the slow pair's null at grazing).

## 6. Cross-checks against the existing fixture + one erratum found

All angle/ratio values reproduce `hsv_response_surface.json` to the last
digit for the shared clips (same scenes, same hsvlib math — this is a
replication with a better time base, not an independent method). Two fixture
findings (reported here only; **fixture untouched** — feeds issue #5):

1. **A-series absolute speeds are 2× too high in the fixture.** The OSD
   proves A-26/27/28 mp4s skip every other capture frame (`FWD60` = 2
   capture-frames per video frame); the fixture's duplicated-frame detector
   can only see *repeated* frames, so its `v_*_mps_if_1000fps` (6.97/9.95/
   9.79 m/s) should be 3.49/4.98/4.90 m/s. A 10 m/s "medium kick" was
   implausible anyway. Angles, ratios, e_n unaffected.
2. **6.x duplicated encodes are fps-ambiguous.** 6-9/6-12 show true frame
   duplication; that is EITHER a 1000 fps capture duplicated in the encode
   (fixture assumption) OR a 500 fps capture — the OSD-less 6.x clips cannot
   distinguish. 6-9's "slow" bank at the 1000 fps assumption comes out at
   6.2 m/s, *faster* than the "fast" pair — the 500 fps reading (3.1 m/s) is
   more plausible. Dwell estimates are too noisy to discriminate. All 6.x
   `*_if_1000fps` fields should carry this caveat; ratios are immune.

## 7. Verdict

**The public matched pairs confirm the sign and size of the total-speed
effect but do NOT support a slip-sense-dependent NORMAL loss at measurable
precision — the effect lives in the friction channel.** Reverse english
loses 16–24% more total rebound speed than running at 12–28° incidence
(rev/run speed ratios 0.837±0.015 fast, 0.819±0.163 medium, 0.765±0.028
small-angle), shrinking to ~5% (confounded) at slow speed and to zero at
grazing incidence (A-70/68). But the normal channel shows no coherent
asymmetry: e_n(rev)/e_n(run) = 1.018±0.017 (the cleanest pair — consistent
with UNITY), 0.950±0.191, 0.901±0.029 (θ-confounded), 1.361±0.073
(v-confounded), and straight-in sidespin leaves e_n on the no-spin baseline
(≲8% bound). So a "grinding term" in the sense of *reverse slip depressing
normal restitution* is bounded to ≲2% at 28°/fast (P-fast) and ≲8% at normal
incidence by this data — the TOPRIGHT over-constraint cannot be resolved by a
large normal-channel grinding term without contradicting these pairs. What
the data DOES license is a slip-state-dependent **friction** channel: the
per-event impulse ratio μ_eff spans 0.138–0.279 across the reverse quadrant
(0.169±0.003 at 28° fast — the source regime of the kernel's `mu(2.6) ~ 0.16`
pin — but 0.213±0.002 at 28° medium and **0.279±0.005** at A-27's small-angle
condition, an OSD-exact measurement and a *lower bound* on slipping μ_k).
That is 0.86×–1.74× the 0.16 baseline: the `mu >= 0.24` that TOPRIGHT-02/04
need is NOT excluded by the public reverse-quadrant data — constant-μ is what
fails, exactly the μ(|slip|)-family reframing (Louge-Adams/Witters shape) the
research doc proposes. Because no public clip yields a spin readout, μ_eff
cannot be indexed against nose-slip ratio — pinning μ(2.6) absolutely still
requires the first-party Set A session (marked ball + overhead camera).

## 8. Files

- `fetch.sh` — Wayback downloads + frame extraction (reproducible).
- `ocr_osd.py` — Redlake OSD counter OCR → `out/osd_times/*.csv`.
- `measure_pairs.py` — tracking + kinematics → `out/tracks/*.csv` (raw
  per-frame tracks), `out/measurements/*.json`, `out/overlays/*.png`.
- `pair_tables.py` — matched-pair ratio tables → `out/pair_ratios.{json,md}`.
- `out/contact_sheets/`, `out/qc_*.png` — eyeball QC artifacts.
- `videos/`, `frames/` — local media (not for commit, per tools/hsv policy).
