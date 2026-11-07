# SOURCES — validated-physics scenario videos (site gallery wave)

Byte-identical copies of the published **scenario-video pack** (owner Drive,
`openbilliards/showcase/scenario-videos/`). Base publication: the **GH-321/#277
CUEPOST WAVE, RESOLVED 2026-08-05** — all sixteen entries re-rendered with the
post-strike cue armed (`--cuepost`; the knob is part of captureDigest's
presentation, carried on render AND verify) and re-carded. Four r1 entries
(`cit-throw-curve`, `squirt-endmass`, `ten-times-fuller`, `break-squat`) are
final per the OWNER DESCOPE RULING 2026-08-04 (their pre-env-rebake
reflection-state nonuniformity is documented in the pack's BATCH-LEDGER.tsv,
not fixed). `jump-min-elevation` additionally carries the #357/#358
staging-race fix (env-cube fixed-point bake + warm-up staging; Tier A AND B
verifies 472/472 + 349/349 byte-identical). Sixteen entries, each a **gated**
render by this repository's own pipeline (`web/tools/scenario-*.mjs` family):
the battery grid cell the video claims is re-simulated on the canonical WASM
kernel and must reproduce its pinned normalized record sha256 byte-for-byte
before a single frame is captured, and every number burned into the frame is
re-measured from that record at render time. Kernel stamps:
**`0.1.0+208e1dc4`** (9 entries) and **`0.1.0+dedc61cd`** (7 entries) — a
version-only-PROVEN lineage pair (GH-343 splice-proof; physics
byte-identical). Verify-law provenance: the five 08-05
entries carry the machine-readable
`verifyLaw: sameboot-x2+crossboot-envelope/v1-chunked` in their
`<id>-gates.json` (the wave's #348/#355 law; the field is
schema-additive). The earlier eleven predate the field and their exact
per-entry verify posture is NOT uniform — it is recorded per entry in the
pack's BATCH-LEDGER.tsv (owner Drive): the five 08-03 batch entries ran
the pre-#348 byte-identity law; `cling-chalk-skid` and
`gearing-zero-throw` ran the #348 two-tier law; the four r1 entries
(`cit-throw-curve`, `squirt-endmass`, `ten-times-fuller`, `break-squat`)
are DESCOPE-FINAL per the owner ruling 2026-08-04, published on their r1
verify evidence as documented there. No
stock imagery, no photographs — the product renders itself.

Per-entry provenance (record shas, marks, plans, title-card determinism
proofs) lives in each committed `<id>-gates.json`; every `<id>.mp4` here is
sha-verified against its gates `titleCard.mp4Sha256` pin by
`scripts/site-physics-data.mjs`, which derives `physics-data.json` and all
tile markup from these records (drift-gated in CI — see that script's
header).

## Swapping in a re-rendered pack

1. Copy the new `<id>.mp4`, `<id>-poster.webp`, `<id>-gates.json` over this
   directory (16 entries; delete removed ids), and any re-encoded
   `preview/<id>-preview.mp4` renditions (section below).
2. Update the pack date / kernel / sha table in this file.
3. `node scripts/site-physics-data.mjs` — regenerates `physics-data.json`
   plus the tile markup in `site/docs/physics.html` and `site/index.html`.
4. `node scripts/site-physics-data.mjs --check` must pass (CI runs it).

## Preview renditions — `preview/<id>-preview.mp4`

In-tile playback uses **textless 720p preview renditions** per the the design charter
bb-clip dual-source rule (videos in small containers play textless previews;
the full annotated rendition is reserved for fullscreen/large surfaces). A
preview is a re-encode of the SAME graded timeline as its `<id>.mp4` with
the annotation/text layers disabled — never a re-simulation — so it needs
no gates pin of its own: the physics provenance is the parent mp4's.

- **Source timeline**: the per-entry textless, ungraded 2560×1440 crf-12
  **provenance master** (`<id>-master.mp4`) that `scenario-render.mjs
  assembleMontage` writes from the exact delivered frame sequence of the
  gated render run — REPLAY dissolves already blended, no badge, no
  annotations, no title card, no grade/fades/grain. All 16 masters are the
  preserved intermediates of the exact runs that produced the published
  mp4s of the cuepost wave. Masters + assembly manifests + the run ledger +
  the wave's forensics are preserved outside the repo
  in a private archive.
  Mixed-tree provenance is deliberate and documented in the pack's
  BATCH-LEDGER.tsv (15 pre-#358 entries stand as published owner-verified
  bytes; only `jump-min-elevation` required the post-#358 tree):

  | master | sha256/16 | render tree |
  |---|---|---|
  | `bank-ladder-b28-master.mp4` | `c0ec9e177024520c` | cuepost batch 08-03, kernel 208e1dc4 |
  | `break-squat-master.mp4` | `c196583cefc16f91` | cuepost r1 (descope-final), kernel 208e1dc4 |
  | `cit-throw-curve-master.mp4` | `674c21c5ece1843e` | cuepost r1 (descope-final), kernel 208e1dc4 |
  | `cling-chalk-skid-master.mp4` | `1bb1fd570db7d1a0` | cuepost night-2 batch 08-03, kernel dedc61cd |
  | `corner-5-three-rail-master.mp4` | `bb57c97c24377414` | cuepost batch 08-03, kernel 208e1dc4 |
  | `draw-arc-ladder-master.mp4` | `9e72e3c36202fa5b` | post-reboot batch 08-05 @ ob-6a0674b5, kernel dedc61cd |
  | `gearing-zero-throw-master.mp4` | `d33e7aac8d430535` | cuepost night-2 batch 08-03, kernel dedc61cd |
  | `jump-min-elevation-master.mp4` | `4455b338a067b85b` | post-#358 render 08-05 @ ob-882226be, kernel dedc61cd |
  | `masse-bar-aiming-master.mp4` | `c9b42ba8b6bcb1d8` | post-reboot batch 08-05 @ ob-6a0674b5, kernel dedc61cd |
  | `ninety-rule-master.mp4` | `7b34fadc70304b9e` | post-reboot batch 08-05 @ ob-6a0674b5, kernel dedc61cd |
  | `sidespin-kicks-master.mp4` | `2cabe3f456de36fc` | cuepost batch 08-03, kernel 208e1dc4 |
  | `squirt-endmass-master.mp4` | `d6e2b360c704b511` | cuepost r1 (descope-final), kernel 208e1dc4 |
  | `ten-times-fuller-master.mp4` | `f2a7ce131e04de8b` | cuepost r1 (descope-final), kernel 208e1dc4 |
  | `thirty-rule-master.mp4` | `8670aac0bb1e2581` | post-reboot batch 08-05 @ ob-6a0674b5, kernel dedc61cd |
  | `wpa-lag-master.mp4` | `2137bfd3bc136fc0` | cuepost batch 08-03, kernel 208e1dc4 |

- **Encode recipe** (one ffmpeg pass per master — the `gradeVfOf()`
  scale+curves chain from `tools/render/grade.json` retargeted at 1280×720,
  then the same head/tail fades and grain-last tail as `assembleMontage`,
  encoded with the pack mp4 delivery law at the lower resolution):

  ```sh
  # FRAMES = ffprobe -count_frames of the master; FADEOUT = max(0, FRAMES/60 - 0.7)
  ffmpeg -y -i <id>-master.mp4 \
    -vf "scale=1280:720:flags=lanczos,curves=master='0/0.004 0.02/0.028 0.10/0.072 0.45/0.345 0.62/0.46 0.80/0.60 0.93/0.83 1/1',vignette=angle=0.1,fade=t=in:st=0:d=0.5,fade=t=out:st=<FADEOUT>:d=0.7,noise=alls=2.5:allf=t+u,format=yuv420p" \
    -c:v libx264 -crf 23 -preset slow -movflags +faststart -an \
    preview/<id>-preview.mp4
  ```

- **Duration policy**: full timeline, no trim. Every preview carries
  exactly the master's (= the published mp4's) delivered frame count at
  60 fps, ffprobe-asserted per file at encode time — so bb-clip's
  proportional `currentTime` carry across the fullscreen swap is EXACT.
- **File manifest (sha256/16)**: the `preview/` rows in the table below.

## File manifest (sha256, first 16 hex)

| file | sha256/16 |
|---|---|
| `bank-ladder-b28.mp4` | `770aac20125f9e33` |
| `break-squat.mp4` | `6f051b0bc36e5e51` |
| `cit-throw-curve.mp4` | `3b85d7e94a3eacd9` |
| `cling-chalk-skid.mp4` | `1bf601c12ac53164` |
| `corner-5-three-rail.mp4` | `8d2acedc9e38bf33` |
| `draw-arc-ladder.mp4` | `a7e3a82a69ef5bed` |
| `gearing-zero-throw.mp4` | `695f7d6eb0386969` |
| `jump-min-elevation.mp4` | `8aba95ec0c29b553` |
| `masse-bar-aiming.mp4` | `b3df24fc50bb1ed9` |
| `ninety-rule.mp4` | `50cf1be7c9866e23` |
| `sidespin-kicks.mp4` | `936142537a99064c` |
| `squirt-endmass.mp4` | `f862fa854ce92bab` |
| `ten-times-fuller.mp4` | `9e360a09ea20744f` |
| `thirty-rule.mp4` | `d4c9dfe050314a67` |
| `wpa-lag.mp4` | `97dcd7f0301271de` |
| `bank-ladder-b28-poster.webp` | `8832d9d81b0e8fcd` |
| `break-squat-poster.webp` | `409b46827f652489` |
| `cit-throw-curve-poster.webp` | `479605d803208d9c` |
| `cling-chalk-skid-poster.webp` | `f5f6cab18144aa57` |
| `corner-5-three-rail-poster.webp` | `23222bbef79b224f` |
| `draw-arc-ladder-poster.webp` | `573b42dc233dc209` |
| `gearing-zero-throw-poster.webp` | `abbfe4d2c5fb91bc` |
| `jump-min-elevation-poster.webp` | `9dae1ee98f458c79` |
| `masse-bar-aiming-poster.webp` | `8089eb16dc799cc6` |
| `ninety-rule-poster.webp` | `bf39faab52fbb457` |
| `sidespin-kicks-poster.webp` | `d9fc2ce19ae550c8` |
| `squirt-endmass-poster.webp` | `ec4f0b6b06edf87f` |
| `ten-times-fuller-poster.webp` | `b766a58922a4439b` |
| `thirty-rule-poster.webp` | `2106b7e19427f21b` |
| `wpa-lag-poster.webp` | `214a39ce599c091e` |
| `bank-ladder-b28-gates.json` | `facf0895eafd5245` |
| `break-squat-gates.json` | `e0e5aca7fbeda325` |
| `cit-throw-curve-gates.json` | `7ef40e739be3d7c7` |
| `cling-chalk-skid-gates.json` | `2808595d73665bd3` |
| `corner-5-three-rail-gates.json` | `5ea2456437297f0c` |
| `draw-arc-ladder-gates.json` | `2bf23d6fc1bbc9f5` |
| `gearing-zero-throw-gates.json` | `637e5b2401cbc8f8` |
| `jump-min-elevation-gates.json` | `ae1be549123a3768` |
| `masse-bar-aiming-gates.json` | `843e50261e29f10a` |
| `ninety-rule-gates.json` | `55e37d8353055411` |
| `sidespin-kicks-gates.json` | `2729e87c370cea63` |
| `squirt-endmass-gates.json` | `4abe086765de5177` |
| `ten-times-fuller-gates.json` | `2e1637a81039e643` |
| `thirty-rule-gates.json` | `aebb84dd93ec5951` |
| `wpa-lag-gates.json` | `4f49050b5aa07b4f` |
| `preview/bank-ladder-b28-preview.mp4` | `67e9a60946c0800b` |
| `preview/break-squat-preview.mp4` | `be16dff1c7b3b543` |
| `preview/cit-throw-curve-preview.mp4` | `0fdcda3c1e4163e4` |
| `preview/cling-chalk-skid-preview.mp4` | `2bff4db42dc2df56` |
| `preview/corner-5-three-rail-preview.mp4` | `dd28035dceca61c2` |
| `preview/draw-arc-ladder-preview.mp4` | `28478bc12e873f69` |
| `preview/gearing-zero-throw-preview.mp4` | `22393f2eab26bbdb` |
| `preview/jump-min-elevation-preview.mp4` | `eef9107c8460532b` |
| `preview/masse-bar-aiming-preview.mp4` | `0d7a811c94b87b01` |
| `preview/ninety-rule-preview.mp4` | `ef8af25976950e23` |
| `preview/sidespin-kicks-preview.mp4` | `bde020480b95f0af` |
| `preview/squirt-endmass-preview.mp4` | `774d0294a6dda571` |
| `preview/ten-times-fuller-preview.mp4` | `e052074b23ca2b04` |
| `preview/thirty-rule-preview.mp4` | `85bb96f31bbb712c` |
| `preview/wpa-lag-preview.mp4` | `baf197f5028c3247` |

## Known deviations

- **`cit-throw-curve.mp4` container duration** reads 7.933008 s instead of
  the exact 476/60 = 7.933333 s — a single-encode-generation mux rounding
  in the published (owner-descope-final, 2026-08-04) file. The FRAME COUNT
  is verified exactly 476 across all four artifacts (Drive mp4, provenance
  master, preview, this site copy). Worst-case effect on the bb-clip
  dual-source contract (fraction-based `currentTime` transfer): a
  misplacement of <= 0.33 ms, i.e. 2 % of one frame period — a one-frame
  jump only if a swap lands within 0.33 ms of a frame boundary. Ruled
  ship-as-is (coordinator, 2026-08-05): the bytes carry an owner verdict
  and are not re-pinned over a metadata nit; any future natural re-render
  of `cit-throw-curve` folds in the exact-duration remux for free (noted
  in the pack's BATCH-LEDGER.tsv).

(`physics-data.json` is generated — not listed; regenerate, never edit.)

## Draw-arc caption amendment

The corner caption now reads “DRAW-ARC POWER LADDER · THREE CUT SHOTS AT INCREASING CUE SPEED”. The clip is recomposed from its preserved textless master; simulation segments, measurements, camera timing and the top title card are unchanged. The gates record’s `composite` block pins the source plates, all 978 rebuilt text frames, their verification on a fresh browser boot, and the final video. Only the caption’s second line changes in the text layer.
