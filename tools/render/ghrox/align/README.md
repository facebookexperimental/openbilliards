# `tools/render/ghrox/align/` — Rasson OX A2 mesh-level alignment gate

The gate of A2-PLAN §4a (rulings A2-2 / A2-4): the OX render model, extracted from the LIVE scene by
`tools/render/ghrox/dump_rox_scene.mjs`, is compared with the purchased Rasson OX mesh **numerically** — silhouettes,
section stations, per-element point-to-surface deviation, a dimension Δ table — and the numbers gate the wave.
Method = the Diamond alignment (`/tmp/d621-align/`): 1 px = 1 mm filled silhouettes, plane sections at named A1
stations, area-weighted surface sampling + cKDTree nearest-surface deviation, a dimension delta table.

```
python3 tools/render/ghrox/align/gate.py --ours <dump.json> --out /tmp/ox-a2/align/<tag> [--judge] [--redarm] [--quick]
```

Outputs in `--out`: `align-rox.json` (all numbers), `ALIGN-ROX.md` (frame / registration / datum decisions, silhouette
table, section table, deviation table, Δ table, thresholds + justification, per-element verdict, overall, red arm),
`silhouette_*.png`, `zoom_*.png`, `section_*.png`, `heat_*.png`, `gate.log`.  `--judge` exits 1 on RED (2 when the
red arm fails); `--redarm` shifts OUR mesh of one element (`--redarm-element`, default `cushion_long`) by +5 mm and
proves that row goes RED; `--quick` is the subsampled iteration mode (about 20 s); the full mode should be run in the
background with a log (`nohup ... > run.log 2>&1 &`) and polled.

## QUARANTINE RULE (owner law)

The purchased model lives ONLY at `/tmp/ob-3dm-quarantine/rasson-9ft/src/obj/RASSON_Pool_Table_OBJ.obj` and is a
MEASUREMENT reference.  This tool reads it in place; the parsed vertex / triangle arrays are cached ONLY under `/tmp`
(`/tmp/ox-r6-meas/*.npy` from lane A1, else `/tmp/ox-a2/align/cache/`); silhouette masks of the model and the noise
numbers are cached under `/tmp/ox-a2/align/cache/`.  The outputs are NUMBERS, masks and plots.  No vertex, triangle
list or texture of the model is written into the repo, into any pack, or anywhere but `/tmp`; the section polylines
saved beside the report are OURS only.

## Modules

| file | what |
|---|---|
| `objsoup.py` | soup loader (npy cache, OBJ fallback), the lane A1 frame (X along the length, Y = −OBJ z across, Z up; bed 785.828; K = (1174.066, 588.123)), plan-centre / nose-line checks, the element WINDOWS and section STATIONS (documented constants), local frames, EN-07 scaling, plane sections |
| `ours.py` | live-scene dump loader; `X_m = 1000·x_o ; Y_m = +1000·z_o ; Z_m = 1000·(y_o − y_bed_o) + 785.828` (Y_SIGN = +1: lane +Y = app +z = kernel kx; an improper rotation, recorded); selection by `dm-<part>` prefix or by window; datums (nose lines by the PF-01m rule, foot centroid, sight anchor) |
| `register.py` | datum registration (bed plane, plan centre from the nose rectangle, long axis; NO ICP), EN-07 scaling of the MODEL for carried lengths only, the per-element DATUM DECISION table (raw / EN-07-scaled / photo-referenced) |
| `silhouettes.py` | 1 px = 1 mm masks top / side / end (model scaled = gated, raw = information), IoU, symmetric boundary distance, difference PNGs with the datum cross; zooms (pockets 4 px/mm, pedestal end 2 px/mm) in local frames |
| `sections.py` | section polylines at the stations, chaining, symmetric Hausdorff (all chains) + discrete Fréchet (longest chains), plots at scale with a mm grid |
| `deviation.py` | per-element two-way point-to-surface deviation (≤ 200 000 samples per side per element; k-nearest exact refinement), median / p90 / max, heatmaps |
| `dims.py` | dimension Δ table for every JSON row the scene consumes (kernel rows + any `a2` / `RC-` rows present at run time), per-row measurement rules, tolerance per class |
| `thresholds.py` | gate thresholds stated and justified from the soup's own noise (facet kink per station, ±X/±Y mirror residuals, quoted A1/r6 fit rms, EN-05 camber); `--measure` re-measures |
| `gate.py` | entry point, verdicts, red arm, report |

## Datum law in one paragraph

LAW-PURCHASED-BASELINE / R1: the model is compared at its true millimetres.  EN-07 (1.0817 along the length, 1.0797
across the width, 1.0 in z) is applied to the MODEL only where a LENGTH is carried from the 8-ft-pro model to the 9-ft
datum (envelope silhouettes, the nose rectangle, playfield-proportional positions); angles, radii, sections, profiles,
lips and furniture plans are compared raw in local frames anchored on datums both meshes can measure (nose line for the
cushions, the rail-cap OUTER edge for the cap / lip / apron profiles, corner K and the side nose line for the pocket
furniture — trimmed to +150 so the envelope-governed outer edge stays out —, foot centroid, sight centre).  The rail
band width nose → outer edge (RB-01/RB-02 envelope-derived vs the model's raw 159.3) is printed in the datum table and
judged by the global silhouettes, not smeared into the profile rows.  The two pedestal plates (C9/O10), the sight positions (C13) and the retail mouth (O4)
are photo-referenced, not mesh-gated.  The A1 ball-scale k = 1.0257 is rejected and never applied.
