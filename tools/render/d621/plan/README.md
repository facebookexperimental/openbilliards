# Diamond PLAN measurements

The numerical section tools require Python 3, NumPy and SciPy. The C7 PLAN
overlays (`corner_overlay_621.py`) and C9 cushion-end overlays
(`cushion_end_overlay_621.py`) additionally require Matplotlib and
**Shapely >= 2.0**. These are measurement dependencies; none ships in the app.

The local evidence mirror is
`<private evidence>/d621/evidence-deps` (Shapely 2.1.2 on the current macOS
Python 3.12 lane). The lane's Python already supplies NumPy, SciPy, Matplotlib
and pytest. To run the overlay arms with that mirror:

```sh
PYTHONPATH="<private evidence>/d621/evidence-deps${PYTHONPATH:+:$PYTHONPATH}" \
  python3 -m pytest -v tools/render/d621/plan/test_corner_overlay_621.py
```

In a separate environment, install `numpy scipy matplotlib 'shapely>=2' pytest`
using that environment's Python package manager. A clean CI export without
Shapely collects the full suite and reports each of the four C7 overlay arms
and three C9 opening arms as
**SKIPPED** with its name and dependency reason. Skipping those arms does not
establish that the model overlays passed; evidence runs must install the
dependencies and run them.

Purchased model files remain in the measurement quarantine. Supply their
location with `--model-obj-dir`; write overlays and receipts outside the
repository. The tools persist derived measurements and figures, never model
mesh assets in the application tree.

C9's `cushion_end_source_621.py --measure --out /path/outside/repo/receipt.json`
measures the eight corner ends at the supplied model's nose plane. The
continuous two-line fit reports its residual: the cage's curved end is not
asserted to be a planar or evaluated TurboSmooth surface. A separate facing
material thickness is unresolved and is never authored. `--write` projects
that reviewed numeric receipt to the three CU-14 leaves and the renderer;
`--check` requires their exact agreement.

`cushion_end_overlay_621.py --before DIR --after DIR --out DIR` measures all
six pockets for all three sizes. It evaluates every stored cushion vertex
against the cover section at the vertex's own height. The two measured arm
tips close the finite U opening; positive means a point lies in that opening.
The same algorithm measures the purchased model's own residual. It does not
assume the source is flush or silently discard a low facing vertex.

The C9 node and C3 orientation tests run with `node <file>`; they enable VM
modules in a child process when the host Node requires that flag. The standing
`check-cushion-profile.mjs` verifies the base kernel loft. C9's separate test
checks the final terminal cuts, preserved contact/side vertices, surviving
normal/UV attributes and outward terminal caps. PLAN d2 measures the initial
straight facing after the measured circular jaw; CU-14 owns the separate
terminal plane. Neither measurement selects an angle by its expected value.

The shared MODEL/OURS letters sampler uses the same initial-face distinction
for CP-02, CP-06 and CP-09. Its existing coordinate precision, letter bars and
three-height undercut minimum are unchanged. With a separate terminal plane,
CP-09 reads existing horizontal triangle edges on the initial face; it does
not infer undercut from the terminal plane. The writer retains both FIX1's
legacy secondary column and the pre-C9 back-plane-facing read.

[C9 review record](C9-RECORD.md) documents the owner-pose ROI chronology,
both coordinate-precision results, the source attribution, A1's limits and
the owner's post-round-5 native-pixel ruling with the auditor's counts.
The standing 66-row PLAN law is value-identical before and after the terminal
cut; A1's all-vertex measurement supplies the evidence for that correction.

## Gully (GH-650) tools, node-only

`gully_route_arm_621.mjs` builds the served `web/scene/table.js` headless (the
vendored three plus a 2D-canvas stub) and measures the ball-return module's
runways against every body mesh (r 28.575 mm), the entry openings, the
collector box, and the sightline fans (head-end, oblique, per-cutout side
fans with elevation; review's named rays are fixed rows). Its exit status is
the verdict; it writes the report the caller names. `gully_receipt_621.py`
binds the census's delegation of `web/scene/ballreturn/` to the module's own
validators by byte (`--write` / `--check` / `--red-arm`).
`offline_scene_dump_621.mjs` writes a full-scene dump in the exact format of
`align/dump-ours-621.mjs` without Chrome (`--digests-only`, `--compare`); it
was validated against the B2 app dumps (106 / 107 / 106 of 113 meshes
byte-identical — `dm-bed-cloth` and `dm-bootcollar-*` are canvas-sampled and
are not reproduced) and re-derives `law/cushion_mesh_fence_621.json` between
app captures. It is not an app capture and never substitutes for the card's.
