# D621 alignment gate — our Diamond Pro-Am 8 ft vs the purchased 3dsky model (mesh-to-mesh)

Standing gate for GH-621 (owner law: alignment is proven mesh-to-mesh against the purchased-model baseline; side-by-sides
are presentation). This package is the repo port of the maintainer's `d621-align` analysis chain (Task A export, Task B
model measurements, Task C alignment; `ALIGNMENT-D621.md`, 2026-09-02). Algorithms, sampling counts, seeds (621) and
pixel mappings are unchanged, so a run on the same export reproduces the analysis numbers bit for bit.

## Quarantine law (absolute)

* The purchased model's OBJ cages are READ from the quarantine dir at run time only (`--model-obj-dir`, default
  `/tmp/ob-3dm-quarantine/diamond-proam-8ft/obj`). Zero vertices, textures, baked maps, silhouette rasters or section
  polylines may be written into the repo. The gate REGENERATES the model-side measurements, silhouettes and sections
  under `<out>/model/` on every run (`measure_model.py`, `silhouettes_model.py`, `sections_model.py`).
* `<out>` must be outside the repository (`paths.Config.assert_out_outside_repo`; default
  `/tmp/d621-align/gate/<YYYYmmdd-HHMMSS>/`).
* Only NUMBERS with method strings are committed: `docs/geometry/diamond-proam-8ft-purchased-model-measurements.json`
  (146 keys; no array longer than 64 numbers; no base64). `quarantine_check_621.py` grep-gates this package and that file.
* `dump-ours-621.mjs` (our export; not part of the gate run) is the only script that starts a browser; the gate itself
  never does. No cargo.

## Commands

```bash
# 1. export OUR served tree (needs the app served + chrome-headless-shell; see the header of dump-ours-621.mjs)
node tools/render/d621/align/dump-ours-621.mjs --table diamond_proam_8ft --out /tmp/d621-align/ours/ours-8ft.json

# 2. the gate (about 2 minutes on the M4; deviation ~105 s; --no-heatmaps saves ~40 s, numbers unaffected)
python3 tools/render/d621/align/align_gate_621.py \
    --ours /tmp/d621-align/ours/ours-8ft.json --out /tmp/d621-align/gate/<run-id> --label <code-sha>
#    exit 0 = all standing targets pass; 3 = any fail; 2 = the run itself failed

# red arm / reproduction of the a39f14cd analysis (must print FAIL and the numbers of ALIGNMENT-D621.md)
python3 tools/render/d621/align/align_gate_621.py --ours /tmp/d621-align/ours/ours-8ft.json \
    --out /tmp/d621-align/gate/redarm-a39f14cd --label a39f14cd

# with the LAW-ADJUSTED silhouettes (MFR-decided deltas removed from OUR silhouette, residual reported next to the raw rows;
# bare --law-adjust = tools/render/d621/align/law_adjust_d621.json; adds ALIGNMENT.md §0b, gate.json "law_adjusted", the *_law targets)
python3 tools/render/d621/align/align_gate_621.py --ours /tmp/d621-align/lane/ours-dev6.json \
    --law-adjust tools/render/d621/align/law_adjust_d621.json --out /tmp/d621-align/gate/dev6c --label dev6c

# re-evaluate targets (e.g. with overridden thresholds) on an existing run dir without recomputing
python3 tools/render/d621/align/align_gate_621.py --out /tmp/d621-align/gate/<run-id> --evaluate-only --targets-json my-targets.json
# quick re-eval that recomputes ONLY the law-adjust stage (~2 s + mesh load) on an existing run dir
python3 tools/render/d621/align/align_gate_621.py --out /tmp/d621-align/gate/<run-id> --evaluate-only --law-adjust

# quarantine grep gate (exit 0/1 with a listing)
python3 tools/render/d621/align/quarantine_check_621.py
```

Paths resolve CLI flag > env (`D621_MODEL_OBJ_DIR`, `D621_OURS`, `D621_OUT`) > default (`paths.py`). Every stage module
also runs standalone with the same flags (`python3 tools/render/d621/align/deviation.py --ours ... --out ...`).

## Standing targets (`align_gate_621.py` TARGETS; override with `--targets-json`, either `{key: threshold}` or a full list)

| key | target | threshold | today (a39f14cd) |
|---|---|---|---|
| `iou_side` | whole-table silhouette IoU, side view | ≥ 0.97 | 0.8735 |
| `iou_end` | whole-table silhouette IoU, end view | ≥ 0.97 | 0.8288 |
| `abovebed_p90` | above-bed set (`abovebed__all`) ours→model p90 | ≤ 10 mm | 16.58 |
| `apron_median` | `apronband_cabinet__apron` ours→model median | ≤ 5 mm | 59.74 |
| `legs_median` | `legs__leg_leveler` ours→model median | ≤ 5 mm | 24.14 |
| `corner_skirt` | `8.corner_boot_skirt_below_bed` \|ours − model\| (model 14.2) | ≤ 3 mm | 121.6 (ours 135.8) |
| `side_skirt` | `9.side_boot_skirt_below_bed` \|ours − model\| (model 14.2) | ≤ 3 mm | 121.6 (ours 135.8) |
| `iou_side_law` (group law) | side-view IoU of the **law-adjusted** ours silhouette (§0b; needs `--law-adjust`, else "not evaluated") | ≥ 0.97 | — |
| `iou_end_law` (group law) | end-view IoU of the law-adjusted ours silhouette | ≥ 0.97 | — |
| `legs_median_form` (group law) | `legs__leg_leveler_centroid_aligned` ours→model median (each of our legs translated onto the nearest model leg's plan centre = form only) | ≤ 5 mm | — |

The verdict line counts the two groups separately: `RAW k/7, LAW-ADJUSTED m/3, ALL n/10` (law rows that were not produced
are excluded from the counts; the exit code is 0 only when every evaluated target passes).

## Law-adjusted silhouettes (`law_adjust.py`, `--law-adjust JSON`, default `law_adjust_d621.json`)

Owner law (LAW-PURCHASED-BASELINE.md; ORDER-D621-ALIGN.md PRECEDENCE): manufacturer data beats the purchased model. Three
deltas in the elevations are therefore deliberate: legs on the drawing's feet datum (our c-c 2153.4 × 1010.4 vs the model's
2132 × 980 → `legs_dx_mm` 10.7 / `legs_dy_mm` 15.2 per leg), cabinet bottom at 15 in (ours floor + 381 vs the model's 360 →
`cabinet_bottom_dz_mm` 18) and the 104 × 59 in rail envelope (2641.6 × 1498.6 vs 2661.5 × 1509.5 → `envelope_dx_mm` 10 /
`envelope_dy_mm` 5.5 per side). The stage runs after the raw overlays (which stay untouched) and, per view, edits OUR
per-family rasters in pixel space before the union: leg + leveler rasters split at the view's centre column/row and moved
INWARD; the apron-family raster (band + cabinet panels + bottom board) extended DOWNWARD by a per-column fill of every
bottom-edge pixel within ±25 mm of the family's own minimum z (= floor + 381 on the current export); every other family
split at the centre and pushed OUTWARD, the centre stripe filled by replicating the centre column/row (scale-free half
shift; spanning members stretch by 2 d, small centre-straddling parts such as the side-pocket furniture stretch too — a
few px² in plan, invisible in the elevations). Shifts are whole pixels (`round(d_mm × px/mm)`; the applied px are
recorded). Recomputed for top / side / end and the two leg_cabinet zooms: `data/law_adjusted.json`, `ALIGNMENT.md` §0b,
`overlays/*_law_adjusted.png`, `data/silhouettes_ours_law/`. The raw rows remain the numbers of record.

## Pairing table (model group ↔ ours family; ALIGNMENT-D621.md §3, data in `families.py`)

Model groups come from the quarantine node names (`MODEL_GROUP_RULES`); `rail_caps` = kant02/04/05/07/09/10,
`rail_corners` = kant01/03/06/08 (45° blocks), `cabinet` = pool_front + pool_side01/02 + pool_bottom, `bedslab` = pool_top.
Ours families come from `OURS_FAMILIES` (anchored regexes on the `dm-` mesh names; first match wins).

| deviation pair key | model side | ours side | note |
|---|---|---|---|
| `railassembly__railtop_subrail_casting_liner` | rail caps + 45° corner blocks | railtop + subrail + casting + liner | fair rail-top pairing: ours' casting = the model's cap ends + arc |
| `rails_apronband__railtop_subrail` | rails + kant_side | railtop + subrail | task mapping as written; kant_side is the below-bed apron band (ours carries it in apron) |
| `railcaps__railtop_subrail` | rail caps only | railtop + subrail | caps above the bed only |
| `rubber__cushion` | rubber01..06 | cushion | |
| `cabinet__apron` | cabinet (front + sides + bottom) | apron + brdoor | task mapping |
| `apronband_cabinet__apron` | kant_side band + cabinet | apron + brdoor | everything the model shows below the bed line on the outside (**gated**) |
| `apronband__rail_side` | kant_side band | `dm-apronband*` (regex split of the apron family) | split row: the band alone |
| `cabinet__cabinet` | cabinet (front + sides + bottom) | `dm-cabinet-*` except `-screw-`/`-trough-` | split row: the cabinet alone |
| `legs__leg_leveler` | legs_out + legs_in | leg + leveler | **gated** |
| `legs__leg_leveler_centroid_aligned` | legs_out + legs_in | leg + leveler, each leg (+ its leveler) translated in plan onto the nearest model leg's plan AABB centre | form-only residual (**gated**, `legs_median_form`); shifts recorded in `deviation.json → centroid_shifts` |
| `leather__boot` | leather01..06 | boot* (collar/rim/bowl/skirt/hem/stitch — leather only) | |
| `romb__sight` | romb01..18 | sight | flat cages both sides |
| `cornerblocks__casting` | kant 45° corner blocks | casting | task mapping; partition artefact, read the rail-assembly row |
| `traps__ballreturn` | trap01..06 (pocket cups) | ballreturn (returnshaft + returnfloor, pocketcup) | below-bed, invisible in poses |
| `bedslab__bedcloth` | pool_top | bed | 10 mm slab vs cloth plane |
| `screws__legbolts` | screw_01..16 | legbolt (anon leg-bolt meshes, cabinet-screw) | different placement |
| `railcaps_boots__liner` | rail caps + boots | liner | model has no side liner; ours→model direction meaningful |
| `abovebed__all` | caps + corners + rubber + leather + romb | railtop + subrail + casting + liner + cushion + boot* + facing + sight | what every gameplay camera sees (**gated**) |
| `whole_table` | visible set (caps, corners, kant_side, cabinet, pool_top, legs, rubber, leather, traps, romb, screws) | everything except decals | kant_support / pool_midle / label / cue / rack excluded |

Ours family rules (`families.OURS_FAMILIES`), including the names added for the lane's next meshes:

| family | `dm-` names | paired model group |
|---|---|---|
| railtop | `dm-railtop*` | rail_caps |
| subrail | `dm-subrail*` | (with railtop) |
| cushion | `dm-cushion*` | cushions |
| apron | `dm-apron-skirt`, **`dm-apronband-*`**, **`dm-cabinet-*`** (except `dm-cabinet-screw-*`) | rail_side + cabinet |
| brdoor | `dm-ballreturn-door` | (with apron) |
| leg / leveler | `dm-leg-(hl\|hr\|fl\|fr)` / `dm-leveler*` | legs_out + legs_in |
| legbolt | anonymous meshes under `dm-leg-bolt*`, **`dm-cabinet-screw-*`** | screws |
| casting | `dm-casting-corner*`, **`dm-cornerblock-*`** | rail_corners |
| liner | `dm-liner-side*` | (ours-only) |
| boot | `dm-(bootcollar\|bootrim\|bootbowl\|bootskirt\|boothem\|bootstitch)-*` | boots (leather only) |
| facing | `dm-bootsleeve-*` (cloth jaw-facing wedges — bed cloth, not leather) | (unpaired; kept in the silhouettes and in `abovebed__all`) |
| bed | `dm-bed-cloth`, `dm-falllip-*` (cloth roll at the bed-hole edge) | bedslab (the model has no falllip) |
| sight | `dm-sight*` | sights |
| ballreturn | `dm-(returnshaft\|returnfloor)-*`, **`dm-pocketcup-*`** | traps |
| decal | `dm-(shelfshadow\|tongueao\|spot-foot)*` | excluded |

Meshes that match no rule land in family `unknown` (the gate prints a warning; they are then outside every pair and
outside the silhouettes, so add a rule).

Note (2026-09-02): the original a39f14cd analysis counted `dm-bootsleeve-*` and `dm-falllip-*` as boot, so its boot rows
(`leather__boot`, dims 8.*/9.*: corner 202.9 sq, side 204.0 × 162.8 plans, skirt 135.8 below the bed) included cloth; the
gate now reads them on the leather-only set (`8.corner_boot_skirt_below_bed` / `9.side_boot_skirt_below_bed` = the leather's
own extent below the bed).

## Frame and pixel mapping

Ours (three.js, metres, Y-up, bed cloth y = 0) → model frame (3ds Max, mm, Z-up, bed top z = 770):
`X_m = 1000·x_o ; Y_m = −1000·z_o ; Z_m = 1000·y_o + 770` (proper rotation, scale 1.0, no ICP). Silhouettes at 1 px = 1 mm:
top col = x+1400, row = 800−y (2800×1600); side col = x+1400, row = 880−z (2800×900); end col = y+800, row = 880−z
(1600×900). Zooms: corner pocket plan x 1000..1350 / y 425..775 @ 4 px/mm, side pocket plan x −175..175 / y 450..800
@ 4 px/mm, leg+cabinet elevations @ 2 px/mm. Heatmaps at 0.5 px/mm, 0–60 mm ramp. Deviation: area-weighted sampling at
2 mm spacing (3 mm for `whole_table`), ≤ 600 000 samples/side, cKDTree over samples + vertices, exact point–triangle
refinement over the 4 nearest samples' triangles.

## Run directory layout (`<out>/`)

`gate.json` (targets with group raw/law, verdict + `verdict_line`, inputs incl. ours sha256, timings, measurements-vs-committed
diff, `law_adjusted` block when run with `--law-adjust`), `ALIGNMENT.md`, `summary-sheet.png`, `model/{measurements.json,
silhouettes/, sections/}` (regenerated), `data/{registration, dims, dims_rows, deviation, overlay_index, visual_weight,
visual_weight_attributed}.json`, `data/dev_<pair>.npz` (OUR samples + distances only), `data/silhouettes_ours/`,
`heatmaps/`, `overlays/`, `sections/`; with `--law-adjust` also `data/law_adjusted.json`, `data/silhouettes_ours_law/`,
`overlays/{top,side,end}_overlay_law_adjusted.png`, `overlays/zoom_leg_cabinet_*_law_adjusted.png`.

## Deviations from the source scripts (documented on purpose)

* Script-style modules became `run(cfg, ...)` functions driven by one config (`paths.py`); the algorithms are unchanged.
  `deviation.py` + `deviation_extra.py` share one heat-map helper module (`heat.py`; the source carried two identical
  copies). `dims.py` tolerates absent families (`OG.get`), the source indexed them directly.
* `measure1` of Task B was never archived; it is reconstructed from the method strings (37/39 keys byte-identical to the
  committed record; the two `recess.*.z_runs_at_y0` rows start one 1 mm step later; the two `recess.neg_x.*` rows are
  evaluated sign-correctly where the source recorded nulls — see the `known_artefacts` header of the committed JSON).
* `ALIGNMENT.md` is generated from `report_body.md`: the tables are the source's, the analysis-specific G1–G7 prose of
  ALIGNMENT-D621.md §5 is replaced by the generated ranking table, and §0 (targets) / §6 (measurements vs committed)
  are new.
* The summary sheet's title takes the run label + kernel console line instead of the hard-coded a39f14cd string.
* Added 2026-09-02 (new rows/keys only, existing algorithms untouched): `law_adjust.py` (§ above), the split apron rows,
  the centroid-aligned legs row (`deviation.centroid_aligned_legs`), the `facing` family and the leather-only boot set.

## Reproduction (red arm on `/tmp/d621-align/ours/ours-8ft.json`, code a39f14cd)

All numbers of ALIGNMENT-D621.md reproduce exactly (16 deviation pairs, 305 dims rows, 9 overlay IoUs, visual weight
A/B/C, registration); model silhouettes (33 rasters) and sections (15 polylines) are byte-identical to the Task B
artefacts. Gate verdict on that export: FAIL (0/7 targets), as intended for the red arm. Since the 2026-09-02 family
change the red arm's boot rows (`leather__boot`, dims 8.*/9.*, `abovebed__all`, `bedslab__bedcloth`) read the leather-only
set and differ from the analysis; the gated raw numbers (IoU 0.8735 / 0.8288, apron 59.74, legs 24.14, skirt 135.8 →
leather-only value) are re-checked by `redarm2-a39f14cd`.
