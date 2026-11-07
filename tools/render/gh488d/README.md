# GH-488d — Diamond Pro-Am 9 ft single-source drawing generator

Diamond lane of the pool 1:1 rebuild program (GH-484, wave D-A1/A2). The
single source of truth is the ADR-0015 canonical geometry definition:

- `docs/geometry/diamond-proam-9ft-table-definition.json` — every feature
  carries its value, scope (`kernel-collision` / `render-only` / `envelope`),
  source (dossier file or manufacturer doc), tier, and conflict reference.
  Kernel-collision values are PINS of the shipped catalog v5 spec
  (`PocketTableSpec::diamond_proam_9ft`); the kernel stays byte-frozen —
  any change is owned by calibration waves B2/B4.

The generator derives four GB/T-styled sheets plus a solved JSON twin from
that JSON, asserting the declared arithmetic identities before drawing:

- S1 corner-pocket assembly (plan, PCF-CP-NLS frame)
- S2 side-pocket assembly (plan)
- S3 cushion profile section (Artemis No. 66 rubber, K55 profile)
- S4 rail / apron / envelope elevation + conflict ledger + sight detail

Pattern forked from the GH-489/490 Drive generators (`gen_drawing_489_ext*`,
`gen_drawing_rev8*` in Drive `pocket-drawing-489/` and `-490/`). Namespaced
`-488d` throughout (the parallel Predator lane uses `-488p`); sheets publish
to Drive `openbilliards/pocket-drawing-488d/`.

Run (stdlib only, deterministic — byte-identical for identical input):

```sh
python3 tools/render/gh488d/gen_drawing_488d.py --output-dir output/gh488d
python3 tools/render/gh488d/gen_drawing_488d.py --output-dir output/gh488d --check
```

`--stroke-suite` is a declared STUB: the S1–S4-style stroke-class
conformance suite lands with the wave D-A3 instrument forks (see FORKS.md in
the Drive folder); until then the hook reports SKIPPED, never a silent green.

## Size variants (GH-621): 8 ft and 7 ft

The Pro-Am 8 ft and 7 ft (bar box) sheets are **derived**, never hand-copied:

```sh
python3 tools/render/gh488d/derive_size_variant_621.py --size 8ft --write   # -> docs/geometry/diamond-proam-8ft-table-definition.json
python3 tools/render/gh488d/derive_size_variant_621.py --size 7ft --write
python3 tools/render/gh488d/derive_size_variant_621.py --size 8ft --check   # byte-identical derivation, or exit 1
python3 tools/render/gh488d/gen_drawing_488d.py --input docs/geometry/diamond-proam-8ft-table-definition.json --output-dir output/d621/drawings/8ft
python3 tools/render/gh488d/gen_drawing_488d.py --input docs/geometry/diamond-proam-7ft-table-definition.json --output-dir output/d621/drawings/7ft
```

The deriver reads the accepted 9 ft sheet (pinned by sha — a 9 ft revision
forces a deliberate re-pin) and applies the per-size delta table, every number
of which is a printed label of the official Diamond factory drawing of that
size (`dossier-diamond-proam/01-official/official-specsheet-{7,8}ft-proam.png`).
Only PF-01, EN-01, EN-05, RB-04 (= L/8) and CU-01 (Black Diamond K55 rubber on
7'/8') move; EN-02, EN-06 and RB-01 keep their values and are re-cited to the
drawing of their own size; every pocket/cushion/rail row is byte-identical to
the 9 ft. Before writing, the deriver asserts the drawings' own arithmetic:
rail band (overall − play)/2 = 7.0 in and leg inset (overall − legs)/2 =
7 1/8 in on both axes of every size. The generator is the SAME file, driven by
`--input`: `doc.drawing_slug` names the outputs (`pocket-drawing-621-8ft-r1-*`,
`gh621-8ft-solved-r1.json`), `doc.generator_banner` replaces the 9 ft
"kernel BYTE-FROZEN" chain line (these entries are NEW on the declared GH-621
kernel branch), and the S4 inch call-outs are computed from the values. The 9 ft
output stays byte-identical (`--check` against the committed r2 set).

Honest limit, printed on every derived sheet (open item O7): the official
drawings carry **no pocket dimension**. Pocket-furniture invariance across the
three sizes is corroborated from manufacturer statements (size-agnostic
factory pro-cut 4 1/2 in; one OEM pocket SKU for Pro-Am and Smart tables; the
identical 7.0 in rail band on all three drawings), not read off a drawing.
