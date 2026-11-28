# ALIGNMENT — our Diamond Pro-Am 8 ft ({{LABEL}}) vs the purchased 3dsky "Diamond Pro-Am 8ft" model

Generated {{DATE}} by `tools/render/d621/align/align_gate_621.py` (run `{{RUN_ID}}`). All numbers are **mm in the MODEL frame** (3ds Max world, Z-up, bed top z = 770, table centre (0,0), long axis X) unless stated. Δ is always **ours − model**. Nothing from the quarantined model was copied into the repository; this run directory holds numbers, PNG overlays/heatmaps, silhouette rasters and section polylines only, and lives outside the repo.

Inputs: {{INPUTS}}

One-screen summary: `summary-sheet.png`.

## 0. Standing targets

{{TARGETS}}

Overall verdict: **{{VERDICT}}**.

## 0b. Law-adjusted silhouettes (`data/law_adjusted.json`, `overlays/*_law_adjusted.png`)

The raw rows above and in §2 compare the exports as they are. The owner's law (LAW-PURCHASED-BASELINE.md; ORDER-D621-ALIGN.md PRECEDENCE) puts three manufacturer-decided figures above the purchased model — the leg stance from the feet datum (EN-05), the cabinet bottom at 15 in (EN-06) and the 104 × 59 in rail envelope (EN-01) — so those deltas are deliberate, not misalignment. This section removes them from OUR silhouette in pixel space (legs translated inward, cabinet bottom edge extended down, every other family pushed outward per half) and recomputes the overlap against the unchanged model silhouettes, so that the residual (form and everything else) is visible. The `*_law` targets in §0 read this table; the `legs_median_form` target reads the centroid-aligned legs pair in §3.

{{LAWTAB}}

## 1. Frame, transform, datum residuals (`data/registration.json`)

Transform ours → model: `X_m = 1000·x_o ; Y_m = −1000·z_o ; Z_m = 1000·y_o + 770.0`, i.e. R = [[1,0,0],[0,0,−1],[0,1,0]] (proper rotation, det +1), T = (0, 0, 770) mm, **scale 1.0**, `scaled_from_9ft: false`, `icp_applied: false`. The Y sign only keeps right-handedness; the table is mirror-symmetric in width so it has no geometric consequence.

Registration is datum-based, not ICP: bed-cloth top plane onto the model's bed top, plan centre onto plan centre, long axis onto long axis. A rigid ICP is deliberately not applied: when the cap heights differ it would only bias the height datum away from the bed plane (`registration.json → rail_cap_top_face_check`).

{{REGTAB}}

Datum residuals are zero by construction (bed plane, centre, axis); every other Δ in this report is geometry, not registration.

## 2. Overlay index (`data/overlay_index.json`, `overlays/`)

Silhouette overlays are filled orthographic projections, model vs ours, same pixel mapping as the model silhouettes (top: col = x+1400, row = 800−y; side: col = x+1400, row = 880−z; end: col = y+800, row = 880−z at 1 px/mm; zooms at 2 or 4 px/mm within the stated window). "IoU" = overlap / union of the two filled silhouettes.

{{OVTAB}}

Section-plane overlays (`sections/*_overlay.png`; model polylines regenerated into `model/sections/`, ours cut from the export and stored as `sections/*_ours.npy/json`):

{{SECTAB}}

Heatmaps (`heatmaps/heat_<pair>.png`, one per deviation pair in §3): sample points coloured by distance to the other surface (0–60 mm ramp, >60 dark; only samples visible from the view are drawn).

## 3. Per-group deviation (`data/deviation.json`)

Method (`deviation.py`): area-weighted surface sampling of both sides (≤ 600 000 samples per side per pair, seed 621), point → nearest triangle distance via a cKDTree over the other side's samples + the vertex set (so "max" is an upper bound on the true point-to-surface distance by at most the sample spacing). Both directions reported: **ours→model** (how far our surface is from anything in the model = things we have that the model does not) and **model→ours** (how far the model's surface is from ours = things the model has that we lack). All mm. Pairing table: `families.py` / `README.md`.

{{DEVTAB}}

## 4. Dimension delta table (`data/dims.txt`, `dims_rows.json`, `dims.json`)

Top {{NTOP}} flat rows by |Δ %| (full flat table in Appendix A). Model / ours / Δ = ours − model (mm) / Δ %. Row numbers follow the Task B measurement numbering.

{{TOPDIMS}}

## 5. Ranked gaps by visual weight (`data/visual_weight.json`, `data/visual_weight_attributed.json`)

Ranking source: **Metric C** (`visual_weight_attributed.json`): for each orthographic view take the XOR of the two ASSEMBLY silhouettes the eye actually sees (above-bed assembly for TOP; whole table for SIDE/END) and attribute each disagreeing pixel (1 px = 1 mm²) to the element pair(s) whose own masks differ there. This removes the partition artefact of the raw per-pair XOR (Metric A, `visual_weight.json`). Metric B = union area × symmetric mean surface deviation (cm³) is shown as a check. Both A and B are reported with their own ranks.

Whole-assembly disagreement per view:

| view | assembly | model px | ours px | XOR px | model-only | ours-only | IoU |
|---|---|---|---|---|---|---|---|
{{WHOLE}}

{{RANKTAB}}

## 6. Model measurements vs the committed record

{{MEASCMP}}

## 7. Caveats

* Model side = **base cages** (per-node OBJ export; TurboSmooth/Noise/Shell/FFD/VRayDisplacement not applied). Sweep-based mouldings, the balls and the dummies have no OBJ and are absent from every model-side number.
* Ours side: instanced meshes are expanded by the exporter; anonymous meshes are tagged by their parent (`families.py`). Family membership decides which pair a mesh lands in — add new `dm-` names there.
* Deviation "max" values are sample-based upper bounds; medians and p90 are robust.
* Two task-as-written pairings are partition artefacts (`cornerblocks__casting`, `rails_apronband__railtop_subrail`); read the alternative pairs (`railassembly__…`, `railcaps__…`, `apronband_cabinet__apron`). Both are kept in the table.

## Appendix A — full flat dimension table (`data/dims_rows.json`; list-valued rows truncated to 90 chars; {{SKIPPED}} per-height leg-section coordinate rows omitted, their sizes are kept)

{{APPENDIX}}
