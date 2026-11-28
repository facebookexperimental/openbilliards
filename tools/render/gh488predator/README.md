# GH-488P single-source drawing generator (Predator Apex 9ft Professional)

Fork of the GH-490 single-source drawing pattern for the GH-484 pool 1:1
Predator lane (wave P-A1). One canonical metric JSON is machine authority
(`docs/geometry/gh488p-predator-apex-canonical.json`, ADR-0015); this
generator derives the GB/T definition sheets from it and never modifies
runtime geometry. Self-contained (stdlib only, SVG output) so the lane
shares no files with the sibling Diamond lane.

Sheets:

1. `gh488p-apex-sheet1-corner-pocket.svg` — corner pocket assembly plan
   (flush-rim drop family; exact kernel jaw construction).
2. `gh488p-apex-sheet2-side-pocket.svg` — side pocket assembly plan
   (production mouth kernel-pinned at 127.0; official 4.92 in as a
   REFERENCE dimension with the CAL-1 conflict flag).
3. `gh488p-apex-sheet3-cushion-section.svg` — K55 cushion profile section
   (sourced controls only; rubber body outline is REFERENCE).
4. `gh488p-apex-sheet4-envelope-elevation.svg` — furniture envelope plan +
   long-side elevation (datum decision DD-1: official mm column).
5. `gh488p-apex-sheet5-ledger-tables.svg` — sources / derivations /
   conflict ledger / calibration + uplift items.
6. `gh488p-apex-sheet6-feature-table.svg` — every canonical feature record
   (id, tier, scope, value, sources, conflicts); the FT-* ids cited by the
   sheet callouts trace here.

Plus `gh488p-validation-report.{json,txt}`: every derivation is recomputed
from its inputs (including the ledger's own result rows), the datum
self-conflict deltas are verified, the full kernel-pinned tuple is compared
against the shipped catalog, the datum frames are checked orthonormal /
right-handed and consumed by the builders, provenance references must
resolve, and the drawn jaw construction is mechanically checked
(arc-to-facing tangency, nose-to-nose mouth distances) — drawing == JSON or
the run fails. The kernel jaw primitive is disclosed as a full circle
(span: None) on the pocket sheets. A
FOR_REVIEW source is correctly blocked from release (WARN) while approvals,
the manufacturing tolerance, and the owner-gated calibration items
(CAL-1..3) remain open.

Run:

```sh
python3 tools/render/gh488predator/generate.py \
  --input docs/geometry/gh488p-predator-apex-canonical.json \
  --output-dir output/pdf/gh488p
```

Deterministic-output check (byte-identical regeneration):

```sh
python3 tools/render/gh488predator/generate.py \
  --input docs/geometry/gh488p-predator-apex-canonical.json \
  --output-dir output/pdf/gh488p \
  --check
```

The drawing uses millimetres, first-angle projection, GB/T conventions with
listed ISO supplements, the source SHA-256 on every title block, and
`DO NOT SCALE DRAWING`. Kernel-collision features are pinned byte-for-byte
to the shipped catalog (zero-drift law); official divergences (side mouth
4.92 in, K55 render label, envelope re-pin) ride the drawings as flagged
reference material only — kernel changes require the calibration-wave
ceremony.

PNG rasterization for Drive review packs (macOS, playwright
chrome-headless-shell):

```sh
chrome-headless-shell --headless --disable-gpu --no-sandbox \
  --single-process --no-zygote --force-device-scale-factor=2 \
  --window-size=1680,1188 --screenshot=<sheet>.svg.png <sheet>.svg
```
