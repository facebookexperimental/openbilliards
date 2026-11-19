# ghrmagnum — Rasson Magnum II 12 ft snooker, canonical-geometry drawing generator (wave A1)

Single source: `docs/geometry/rasson-magnum2-12ft-table-definition.json`
(doc `OB-RMAG-GEO-001` r5, schema `openbilliards/table-geometry-definition/1` + declared
extensions, ADR-0015). Repo-side artifacts are the JSON and this generator; the generated
sheets are Drive artifacts (`openbilliards/pocket-drawing-rmagnum/`).

## What it does

```
python3 tools/render/ghrmagnum/gen_drawing_rmagnum.py --output-dir /tmp/rmag-sheets
python3 tools/render/ghrmagnum/gen_drawing_rmagnum.py --output-dir /tmp/rmag-sheets --check
python3 tools/render/ghrmagnum/gen_drawing_rmagnum.py --stroke-suite      # declared STUB
```

Requirements and scope, stated after review review round 1 of the OX-A1 seal (2026-09-02):

- `--output-dir` must lie **outside the repository tree** (refused otherwise, as for `ghrox`); the
  sheets are Drive artifacts.
- The generator needs **full git history**: `KERNEL-SOURCE pinned commit` runs
  `git show ad5d422c:crates/pool-core/src/table.rs` and compares **every block that determines the
  Magnum geometry** — the 15 CEBP constant lines, `cebp::IN`, the `wpbsa_snooker_12ft` constructor and
  the construction functions `corner_canonical`, `middle_canonical`, `Table::from_curved_pocket_spec`
  and `PocketFrame::place` (brace-matched) — with the live file (review review round 5 widened it from
  constants + constructor; a comment inserted inside `corner_canonical` in a scratch copy → refusal). It used to
  `git diff --quiet` the whole file, which aborted the generator on its own branch once OX-A1 appended
  `rasson_ox_9ft()` to `table.rs` and made the red-arm 19/20 for one wrong reason; the scoped check
  refuses when a Magnum block moves (demonstrated: a comment inside the constructor block →
  `differs: wpbsa_snooker_12ft`) and passes when only other constructors are appended. A shallow clone
  or a `git archive` export reports `unknown-commit` and the check refuses.
- **git unavailable or timed out is a refusal** (`KERNEL-SOURCE pinned commit` names it) — review
  review round 2 found that `None` from the git helper was accepted as success, so a run without git
  could report every check green without replaying the pinned-commit comparison. Demonstrated with a
  PATH holding only the Python binary.
- **Text anchors are bounds-checked on the whole sheet** (review review round 5): inside a clipped view
  against the drawing frame, everywhere else against the sheet border — headers, letters tables and
  title blocks included; red-armed by a generator-code mutation (title-block anchor pushed off the sheet).
- **The identities list is matched two-way** against the families that actually executed (first token
  of every recorded check name): an executed-but-undeclared family or a declared-but-never-run one
  refuses; `LABEL-EXACT` is now declared (it had run undeclared) and the stray check names were folded
  into their families (`CONSTRUCT-*`, `DERIVED`, `KERNEL-PINS`, `ORDER`, `COVERAGE vocab …`).
- **Schema failures inside `feature_map` are named** `STRUCTURE` refusals (duplicate id, wrong value-key
  count). Red-arm: **26/26** (22 definition arms, 1 generator-code arm, plus the required-PASS case).
- **Provenance tags (LAW-PURCHASED-BASELINE, r5 — tags only, kernel untouched):** every row carries a
  `provenance_tag`; the 26 kernel rows are MFR (the WPBSA/CEBP template the alias rides, byte-frozen),
  11 station rows MODEL, 13 DERIVED, 3 non-kernel rows REF (CP-08, MP-08, EN-06 — r6, maintainer ruling
  C6: reference-only evidence no kernel or render number consumes, 'not a build number'; the r5 head
  MFR-ADJACENT is retired and refused). New family `PROVENANCE-TAG` (64 checks). Review review round 6: the
  pinned-commit scope also covers `circle_intersections` and the whole `impl PocketFrame` (point /
  angle / place).
- **`IMPERIAL-EXACT` means a BINARY fraction of an inch** (review review round 4): the predicate now requires a
  power-of-two denominator — `25.4/3` mm labelled `1/3 in` used to pass; red-armed, red-arm 22/22. The S4
  stack-residual caption formats its `(H − bed)` term from EN-02 instead of a typed `850`.
- **A definition without a `features` list is a named `STRUCTURE` refusal** (review review round 3: it
  was a `KeyError` before any check ran); red-armed (`features block deleted`), red-arm 21/21.
- The sha256 quoted above is the r3 JSON's; it is printed in every title block and in the solved
  twin, which are authoritative over this file.

1. Loads the JSON, pins its SHA-256 on every title block and in the solved twin.
2. **Refuses to draw unless every check passes** (324 for the r5 JSON; the sha256 is printed in every title block and in the solved twin — read it there; the count scales with the row count). Structural defects (a deleted kernel row, a row without source.tier, a missing top-level block) fail with a NAMED COVERAGE/VOCAB identity, never a traceback. The kernel guards are NOT JSON-vs-JSON:
   - `KERNEL-BITS-*` — the alias rides `CurvedPocketTableSpec::wpbsa_snooker_12ft` bit-for-bit
     (`3.569`, `1.778`, `0.70`, scales `1.0`): code literals, compared to the JSON bits AND to the
     rows.
   - `KERNEL-PINS *` — the JSON's `kernel_pinning.canonical_values_m` must EQUAL the generator's
     code-literal transcript of the table.rs test `curved_pocket_canonical_values_pinned`.
   - `KERNEL-SOURCE *` — the CEBP inch labels (CP-01/02/03/06/07/08, MP-01/02/03/04/06/07/08, the
     CP-04 junction offsets) and the spec literals are parsed **live** from
     `crates/pool-core/src/table.rs` (`mod cebp`, `wpbsa_snooker_12ft`) and must match; when git is
     available, the pinned commit's `table.rs` must be byte-identical to HEAD's.
   - `CONSTRUCT-CORNER` / `CONSTRUCT-MIDDLE` — recomputes the CEBP two-arc construction from the
     inch labels and matches the code pins within **5e-7 m / 5e-6 rad (hard-coded)**;
     `DERIVED *` rows must equal the recomputation to their last printed digit.
   - `TANGENCY *` — true geometric tangency (C1.v = −R1; |C1−C2| = R2−R1; arc end ON the fall circle).
   - `IMPERIAL-EXACT` (binary fractions of an inch: CU-04..09, CP-02/03/06, MP-02) and
     `LABEL-EXACT` (every row whose `published` ends in `in` has `value_mm = label × 25.4`, e.g.
     CP-01 3.555, CP-08 3.313, MP-01 4.344, MP-03/06 2.094, MP-07 2.031, MP-08 3.906).
   - `ENVELOPE`, `ORDER`, `COVERAGE` (the kernel-collision row set equals exactly the rows the
     kernel checks consume; the JSON identities list names every executed check family; scope /
     tier / status vocabularies), and an in-frame assertion on every `<text>` anchor.
3. Writes four GB/T-styled first-angle SVG sheets and a solved JSON twin. **Every number printed
   on a sheet is formatted from the JSON or the solved construction** through one half-up
   formatter honouring `drafting.displayed_decimals` (inch labels printed alongside), so a JSON
   change cannot leave a stale literal on a sheet:
   - S1 corner pocket plan (kernel local jaw frame; both jaws, fall circle, closure)
   - S2 middle pocket plan
   - S3 steel-block rail stack — SCHEMATIC ordering (dashed, unfilled, labelled NOT TO SCALE for
     unregistered extents) + the dimensioned Northern L-profile detail + the reference-model face
     drawn through its two measured points (EST)
   - S4 envelope plan / elevation (placeholders dashed) + conflict ledger + open items
4. `--check` regenerates in memory and byte-compares (deterministic: no clocks; the git and
   table.rs reads are assertions only and never reach the output).
5. `redarm_rmagnum.py` shows the red: 20 mutations of a JSON copy (kernel radius, runtime bits,
   playfield width, imperial exactness, the middle-jaw exactness knob, datum order, envelope arithmetic, a
   last-digit change, loosened JSON tolerances, an edited canonical pin, an emptied identities list, a
   rescoped kernel row, an unknown pinned commit, a wrong inch label, an illegal status token, a moved
   junction offset, a deleted kernel row, a removed source.tier, a bed above the rail top) must each be REFUSED
   WITH A NAMED IDENTITY; the one display-precision change must be accepted. Exit 0 only when all 20 behave
   (ADR-0009: a green gate that cannot show its red is not trusted).
6. Known limit (ledger §6.4 item 3): a table.rs TEST-only edit (constants untouched) is not detected here — only
   `cargo test -p pool-core` catches it; the construction, constants, spec literals and pinned commit ARE checked live.

## Scope declarations

- **kernel-collision** (26 rows) — the byte-frozen `wpbsa_snooker_12ft` construction the Magnum II
  rides as a documented alias (dossier verdict: no kernel-level correction). The catalog alias
  entry is an A2+ edit; the canonical wasm is not rebaked in this lane.
- **render-only** — Rasson's official technology sheet (12 mm steel plate, 50 mm 5-pc slate,
  L-profile, Adamath rail) and the catalog envelope 3838 × 2047 × 850.
- **reference-only** (declared extension) — the manufacturer rubber datasheet (Shore A 43 ± 3,
  DIN 53512 75 ± 5 %) registered as a calibration prior, the CEBP label datums CP-08/MP-08 (zero
  collision bytes at scale 1.0), and the 3dsky reference-model estimator rows (single-user licence;
  no asset bytes anywhere; placeholders for A2 measurements).

## Not in this wave

Model conformance gates (fullview overlay, C14, construction rows), cammatch, the stroke suite
(reported `SKIPPED (STUB)`), and the catalog alias entry. FORKS.md for the `-rmagnum` instruments is
the first artifact of wave A3. One-time check filed: the first-angle projection symbol layout is
inherited verbatim from `gh488d`; compare once against the GB/T 14689 figure.
