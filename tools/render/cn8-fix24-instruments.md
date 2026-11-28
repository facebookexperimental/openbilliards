# FIX24 A1 / A3 / B1 instruments

These tools prepare the FIX24 measurements. CPU tests are instrument tests;
they do not close a served row. Page operations require the maintainer's
probe go, the lane's run-gate claim, and the existing warm/reload protocol.
No file here launches a browser except the existing census-490 CLI when run.

## A1: material and irradiance inputs

`census-490-tables.mjs --fix24` appends `doc.fix24` to its one-boot census.
Without the flag the schema-2 identity rows remain unchanged. Texture UUIDs
are capture-local identifiers, not a cross-boot identity assertion.

The extra census records the named corner and middle covers, every material
slot, polygon offset and factors/units, the requested material scalars and
texture UUIDs, hook source and SHA256, program cache key, full linked GLSL and
its SHA256, live analytic/ambient/hemisphere/GI uniforms, and `cn8Field`.
It also lists scene lights. A scene HemisphereLight is not proof that its
irradiance reaches a material.

Exterior triangles are selected geometrically: outward in table world x/z,
with horizontal normal magnitude greater than absolute vertical magnitude.
The census prints every selected triangle's center, normal and n dot l,
and the nonpositive fraction to the linked analytic centroid (or the first
emitter if only that linked uniform exists). All other emitter uniforms are
retained. This selector is separate from the A3 body bbox and is not a
photographic silhouette claim.

No active linked ambient/hemi uniform and zero linked uniforms are reported
separately. A nonzero input is `NONZERO_INPUT_TRANSFER_REQUIRES_GLSL_READ`:
the full GLSL must explain its transfer before a claim about output reach.
An uncompiled material is `UNCOMPILED`, never evidence of absent lighting.
Run A1 before the ID pass so a diagnostic program is never read as the
material's production program. The source is unchanged by the census.

## Page operations without a launcher

Import `pageExpression` from `cn8-fix24-instruments.mjs` in the authorized
capture script. Evaluate the returned expression in its already running page:

```js
const snapshot = await chrome.eval(pageExpression('snapshot'));
const census = await chrome.eval(pageExpression('census'));
const inventory = await chrome.eval(pageExpression('inventory'));
const id = await chrome.eval(pageExpression('idRender', { rules: [] }));
const packed = packId(id); // returns PNG bytes and a JSON sidecar with its SHA256
```

The ID pass renders a cloned scene through the actual renderer and camera
to an RGBA8 target, samples=0, hardware dither disabled, no tonemapping, no
color transfer or post-FX.
It restores the renderer target/viewport/scissor/clear/shadow/color state in
`finally`, including on a refused render. Original geometry and material
references are checked. Rails use geometric triangle normals to separate
top wood from sides; IDs also identify mesh path and material slot. Alpha
cutouts retain their texture alpha while texture RGB cannot tint an ID.

The pass discloses transparent-surface limitations. Meshes and line objects
get matched ID materials. Visible points/sprites, skinned or active morph
deformation refuse rather than producing an
unmatched position map. Explicit class rules are exact path or name matches
with a source: `{path, class, source}` or `{name, class, source}`. Unnamed
table/room parts remain UNCLASSIFIED until a source-cited rule identifies
them; a nonzero UNCLASSIFIED pixel class fails B1. No nearest-color ID guess.

Record the beauty PNG SHA256 beside the same snapshot `actual_state` schema.
The ID and beauty sidecars must agree on camera matrices, the raw renderer
activeTableId, table beacon, equipment, canvas rectangle and device scale.
The CPU reader currently requires a full-frame canvas; a different layout
refuses until its ID placement is explicit. No crop or resampling is hidden.

## A3: legibility

CPU invocation: `node tools/render/cn8-fix24-instruments.mjs --job JOB.json --out NEW.json`.
The output must not exist. All parsing/measurement occurs before a new
receipt is created. Input paths resolve relative to the job, and their
hashes are recorded.

An A3 job has `kind: "A3"`, `calibration: true|false`, and `rows`. Each row
names `frame`, `png`, `beauty_json`, `id_png`, `id_json`, and `selection`:
`{role, body_ids, bbox: [x0,y0,x1,y1], source}`. The body bbox must be stated
inside the cover-ID intersection, excluding crown, stitch and hem; pixel
colors never choose it. Net/rim/cloth IDs cannot count as a cover body.
The same reader reports the middle with role `middle` as a RECORD only.

Luma is **encoded 8-bit sRGB** `0.2126R + 0.7152G + 0.0722B`. The immutable
gate is fraction(luma < 24) <= 5% for base/new tip. Calibration contains
exactly G05/G06/G11/G12/G17/G18/G23/G24; the four old-tip rows must instead
detect >= 90% black. Thus a calibration PASS means the old defect was
detected, not that the old cover passed legibility. p5/p50/p95 use empirical
nearest-rank quantiles. Spread p95-p5 and exact-black share are advisory.
The base spread 22-23 is reference evidence, not a new threshold.

## B1: full-raster attribution and HUD

The ID render has no DOM. The HUD probe places an opaque black/white underlay
at the canvas's own DOM position without hiding or editing any HUD element.
Use `pageExpression('hudUnderlay', 'black')`, capture black, then white,
then black replay, and always `'end'` in the capture script's `finally`.
Check its rectangle/stacking at the served step. This is a measurement
probe, not a card image. No original canvas/material byte is changed.

Bare canvas white-black equals 255 on every encoded RGB channel. Smaller
differences identify DOM coverage, including antialiased text and shadows.
Pixels outside the canvas are HUD. The black replay must be exactly equal;
nonmonotone differences refuse. The two trees each need their own probe.

A B1 job has `kind: "B1"`, `before` and `after` with the four bound image
paths above, `replay_png`, and `hud: {black, white, black_replay, canvas_box}`. Both
beauty replay comparisons must be exactly zero or the pair refuses as
UNMEASURED. It also
names `repo`, full `base`/`head` commit SHAs and `mechanisms` keyed by class:
`{cause, file, line, evidence}`. Each line is checked against the PR's actual
diff. The eight classes are exported as `CLASSES` by the CPU module.

All nonzero RGB differences count, including one-code changes. HUD union
has priority; other pixels use the after ID, except newly exposed room
pixels retain the before foreground ID. All before/after class transitions
are printed. Counts sum to the entire changed raster and shares use that
denominator. Every nonzero class needs a named mechanism; none is inferred
from the count alone. A +1-pixel x shift of both ID masks must move class
counts; the unchanged HUD masks and both count tables are printed. A plant
with no response fails sensitivity. Real replay controls still govern
whether a pair may be scored at all.

## CPU check

`node --test tools/render/test-cn8-fix24-instruments.mjs`

This covers the fixed thresholds, the eight-row calibration population,
invalid/empty masks, 1-code differences, unnamed mechanisms, ID-edge plant,
HUD replay refusal, alias/camera mismatch, and renderer restoration on
success/refusal. A1's fixture distinguishes a scene light from linked
irradiance. No test is a substitute for the pending real-page readbacks.
