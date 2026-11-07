The defect was the corner cushion terminal face on all 9, 8 and 7 ft Pro-Am sizes; C7 cover placement was unchanged, and facing material thickness remains **UNRESOLVED**.

# C9 review record

This record corrects the disclosures for geometry seal
`646cba9ae3302b1b69d5979c83d096d8350355ab`, compared with C7
`0d48c03c1a47a96672656645a80dd5afd849634e`, on PR #745.
The C7 cover placement was unchanged: the original ball-facing plane extended
to the rubber back and left a terminal point inside the cover opening.
The two Fable refuter lenses reproduced the geometry and evidence claims;
their report findings concern the disclosures below.

The original evidence root is
`<private evidence>/d621/o22-c9-20260911T200217Z/`.
Its report v1 and 455-record manifest remain preserved with their original
bytes. The corrected report and card material are under
`<private evidence>/d621/o22-c9-docs-seal-20260912T000210Z/`.
The source reports are `<private evidence>/refute-745-c9/lensA/REPORT.md`
and `lensB/REPORT.md`. This record does not establish owner sign-off or replace
the separate inherited full-card failure against the pre-C5 Chinese-8 baseline.

## Correction and source tags

At the common Z805.88 mm nose cut [MODEL recipe], 8 ft `corner_EN`,
the old render endpoint was **44.15 mm [DERIVED, rendered section]** in
absolute pocket-lateral coordinate, versus **56.59 mm [MODEL, cage section]**.
The cover-arm inner edge stayed at **55.02 mm [DERIVED, rendered section]**;
the exposed strip was **+10.87 mm [DERIVED, section difference]**.
The corrected endpoint is **56.56 mm [DERIVED, rendered section]**, giving
**−1.54 mm [DERIVED, section difference]**. These are the PLAN gate's INFO
`corner_EN` nose-cut values, rounded to two decimals, rather than the A1
all-vertex metric. At the renderer's own nose plane,
**Z806.512505 mm [DERIVED, emitted nose row]**, the endpoint is
**56.59 mm [DERIVED, rendered section]** and the cover arm is approximately
**55.04 mm [DERIVED, rendered section]**.

The bound [CU-14 receipt](../law/cushion_end_621.json) supplies
**37.789087° [MODEL, cage macro fit]** and
**56.587766 mm [MODEL, cage endpoint]**. The purchased Diamond model's
TurboSmooth modifier was not decoded or applied. No separate facing solid
could be bounded, so no facing material thickness was measured or consumed.
The C4B **1.93 mm [MODEL, Rasson CU-09]** nose radius and the C2 cage foot/lean
disclosures are unchanged. The kernel mouths remain
**114.3 mm [MFR, CP-01]** and **127.0 mm [EST, SP-01 frozen legacy value]**;
SP-01 still discloses that no Pro-Am-specific manufacturer side-mouth number
was found.

## C9: A1 and its limits

A1 measures every stored cushion vertex against the cover section at that
vertex's own height. The two measured arm tips close the finite U opening;
positive signed distance means inside the opening. BEFORE and AFTER are
DERIVED measurements of the emitted meshes; the MODEL column uses the same
algorithm on the disclosed control cage. No missing section is treated as zero.

| Size | Corner | BEFORE mm | AFTER mm | MODEL own maximum mm | A1 |
|---|---|---:|---:|---:|---|
| 9ft | corner_WS | +11.009575 | −2.176264 | +5.862622 | PASS |
| 9ft | corner_WN | +11.009672 | −2.176254 | +5.863329 | PASS |
| 9ft | corner_ES | +11.009672 | −2.176254 | +5.863255 | PASS |
| 9ft | corner_EN | +11.009575 | −2.176264 | +5.863255 | PASS |
| 8ft | corner_WS | +11.009626 | −2.176238 | +5.862622 | PASS |
| 8ft | corner_WN | +11.009621 | −2.176301 | +5.863329 | PASS |
| 8ft | corner_ES | +11.009621 | −2.176301 | +5.863255 | PASS |
| 8ft | corner_EN | +11.009626 | −2.176238 | +5.863255 | PASS |
| 7ft | corner_WS | +11.009635 | −2.176272 | +5.862622 | PASS |
| 7ft | corner_WN | +11.009612 | −2.176318 | +5.863329 | PASS |
| 7ft | corner_ES | +11.009612 | −2.176318 | +5.863255 | PASS |
| 7ft | corner_EN | +11.009635 | −2.176272 | +5.863255 | PASS |

| C9 row | Reading limit |
|---|---|
| PLAN-law-blind | In lens A's 8 ft before/after comparison, the corrected reader's 66-row PLAN law is value-identical; 198/198 across the three sizes is a regression check, and A1 supplies the evidence for fixing the terminal protrusion. |
| one-plane-return | The applied return is ONE vertical plane at the nose-plane values; the MODEL cage end twists from about 40.9° to 29.5° across Z790–813.7 mm, so this is a macro construction, not a recovered smooth surface. |
| generous-bar | A1 passes when AFTER ≤ the MODEL's own maximum, about +5.86 mm, a generous bar by construction because the cage has a low exposed facing vertex; the measured AFTER values are all negative, about −2.176 mm. |

The precise A1 rows and input digests are in
`pocket-overlays/CUSHION-END-OVERLAYS.json` at the original evidence root.
Its twelve `{9ft,8ft,7ft}-corner_{WS,WN,ES,EN}.png` figures compare BEFORE/AFTER
with unscaled MODEL sections at Z790, Z805.88 and Z813.7 mm.
Six separate side-pocket figures use the same recipe; the side metric stays
exactly equal before/after and negative (approximately −0.0294 mm).

## Owner pose and ROI chronology

`OWNER-POSE.json` records RMS projection residuals of **3.685 / 4.411 / 1.049 px**
for cushion noses / cover outline / cloth edge, with a **12.42 px worst cover
point residual**. The pose fits geometry; the owner's exposure is unknown.

The original statement that the ROI preceded inspection of corrected pixels
was wrong. On 2026-09-11 PDT, `app-before2/after-causal-preview.png` was saved
at **13:35:38** and `preview-pixel-diff.png` at **13:35:53**;
`make_owner_roi.py` and `OWNER-END-ROI.png` followed at **13:59:00–03**,
about 23 minutes later. The deciding A2 frames followed the ROI.

The mask is constructed geometrically from the C7 `dm-cushion-*` triangles
and the frozen camera: clip to `x >= L/2 - 0.150 m` and
`z <= -W/2 + 0.150 m` [DERIVED, standing PLAN pocket window], project and
rasterize, then apply a **2 px [TESSELLATION, raster edge support]** pad.
It contains **88,115 pixels**, **11.3%** of the frame, in two blobs tight to
the cushion-end blocks. The recipe reads no corrected image. **Lens B found
no sign that the preview shaped the mask.** The retained mask and later
receipts share SHA-256
`865ce1dcc60b7485f5350b9c41baab9f33328c89bd737537364513fc4b9a2c40`;
the record does not claim an independently proven pre-preview registration.

| Owner-pose comparison | Changed pixels | Outside the unchanged ROI |
|---|---:|---:|
| Fixed C7 reflection cache, six C9 cushion buffers substituted | 6575 | 0 |
| Fixed C9 reflection cache, C7/C9 cushion buffers compared | 6575 | 0 |
| Independent native C7/C9 cold boots | 6604 | 24 |
| Original exact-zero red arm: one deliberately changed outside pixel | — | 1: FAIL at the original bar |

The 24 native outside pixels differ by one channel code; that pair failed the
original literal zero-outside-pixel criterion. Both native and fixed-cache
pairs are retained. The later owner ruling below changes the record criterion;
the original pixel counts, mask and audit verdict remain intact.

## Round 5 and the owner's native-pixel ruling

`VISAUDIT-733-VERDICT-5.md` closes the owner's P2 at all twelve corners:
the all-vertex maximum is approximately **+11.010 → −2.176 mm [DERIVED,
auditor measurement]**, and the terminal faces read as cloth-wrapped ends,
with no visible bare rubber. Its original headline remains **FAIL against
the literal exact-zero requirements**, with three P3 findings preserved.
The owner subsequently authorized this docs-only seal and the following rule.

| Record rule | Requirement and result |
|---|---|
| Owner ruling after round 5 | **0 pixels differ by more than 1 code AND geometry/material/program identity holds, with the one-code counts printed.** The protected regions below meet this rule. |

The comparison region is the full native frame for side-pocket views, and
the area outside the BEFORE-defined cushion-end ROI for owner/corner views.
Viewer comparisons retain the auditor's common scene rows `y=115..969`,
excluding the identity HUD, picker and footer. The intended cushion-end
changes inside the ROI are separately proved by A1. Neither image alignment
nor a new mask is used to accept the one-code differences.

| Auditor comparison | One-code changed-pixel counts | Pixels differing by more than 1 code |
|---|---|---:|
| Native side pockets, 24 pairs | **921 total**, 23/24 pairs nonzero; largest **219/1,600,000 px**, 7 ft side 5 low exterior | **0** |
| Fitted owner views, outside end ROI, 9/8/7 ft | **24 / 4 / 12** | **0** |
| Original round-4 C7 PNG / C9 T-corner, outside end ROI, 9 ft corners 1–4 | **8 / 6 / 11 / 6** | **0** |
| Same original-frame comparison, 8 ft corners 1–4 | **8 / 9 / 6 / 14** | **0** |
| Same original-frame comparison, 7 ft corners 1–4 | **9 / 10 / 9 / 16** | **0** |
| Fresh C7 / C9 viewer pairs, all 48 Diamond views, outside end ROI in the common scene rectangle | **0** | **0** |

All nonzero counts above have maximum channel delta **1**. The side-pocket
counts by inboard / outboard / low-exterior / plan view are:

| Size / side | Inboard | Outboard | Low exterior | Plan |
|---|---:|---:|---:|---:|
| 9ft / 5 | 44 | 39 | 4 | 41 |
| 9ft / 6 | 42 | 52 | 0 | 34 |
| 8ft / 5 | 10 | 69 | 23 | 12 |
| 8ft / 6 | 28 | 56 | 8 | 9 |
| 7ft / 5 | 11 | 40 | 219 | 7 |
| 7ft / 6 | 120 | 48 | 2 | 3 |

The 500 regular frames form **250 identical pairs across independent boots**;
the reported C7/C9 one-code counts repeat across boots. Fresh C7 renders also
differ from the original round-4 C7 PNGs by one-code pixels, establishing the
baseline-sensitive renderer drift cited in the owner's ruling. The **6–16 px**
original-frame differences are retained, not attributed to a C9 geometry change.

Identity applies to the protected geometry: **107/113 meshes per size** are
unchanged, only `dm-cushion-0..5` changed in C9, and referenced local
side-pocket attributes remain equal for all eighteen cushion meshes.
All **27 Diamond materials** and compiled program sets are unchanged
(**49 in the app / 12 in the viewer**). The auditor also preserved all
**144 complete-boundary corner-section rows** for the C7 wood/frame/apron. The docs-only seal
does not change any geometry, material, program or renderer byte from C9.

The third P3 is an omission in the **auditor's** launch-PID recorder: one
unsuccessful `about:blank` launch had no persisted numeric PID. The helper
completed teardown, all 48 persisted Chrome PIDs were absent, and ports and
profile were cleaned up. This remains a disclosed audit-procedure finding;
it is not an application defect or a missing capture PID.

The unmodified verdict, pixel-comparison records, original/fresh C7 control,
geometry/material fence and local-side attribute proof are copied into the
seal evidence directory's `inputs/`. Their original source is
`<private evidence>/visaudit-733/round5/`.

## Precision disclosure and unchanged bars

Mouths, original P/F vertices and complete side-pocket readings remain equal.
Fitting the shorter initial face changes recovered floating-point values;
both pipelines must be stated.

| Initial-face read | Angle drift, degrees | Implied-radius drift, mm | Undercut drift, degrees |
|---|---:|---:|---:|
| Raw-capture pipeline maximum [DERIVED] | 0.00028136 | 0.00016348 | 0.00017161 |
| Committed writer precision, 1e-7 m, maximum rounded [DERIVED] | 0.000868 | 0.000504 | 0.000298 |
| Unchanged standing acceptance bar [DERIVED, letters declarations] | 0.25 | 0.25 | 1 |

The first row is from `POCKET-PRESERVATION.json`; the second is reproduced by
lens A's `letters/c9samp-c7geom.json` and `letters/c9samp-c9geom.json`.
The lane's own `POCKETS-C9-WRITER-PRECISION-AFTER.json` contains the same
9 ft angle witness, **141.00089749050858°**. These are rounded measured maxima,
not replacement acceptance thresholds.

## C7 attribution

**Apex inset 53.82 mm** is the **round-4 visual auditor's measurement** in
`VISAUDIT-733-VERDICT-4.md`: its MODEL column spans **53.8176–53.8182 mm**;
the emitted virtual apex column spans **53.8176–53.8184 mm**.
It is not a lane-produced C7/C9 receipt value. The lane-owned values retained
on C9 are **76.11 mm [MODEL]**, CP-15's cap leg (its rounded-end letter read is
76.07 mm), and **1.78 mm [TESSELLATION/EST]**, the junction radius in
`gates-archive/GATES.json` → `corner_binding.round`.
The original auditor report is preserved under
`<private evidence>/visaudit-733/VISAUDIT-733-VERDICT-4.md`.

## Whole-plan statistic: round-4 auditor values preserved in round 5

The owner's order quoted **p90 0.82 mm** incorrectly. The round-4 auditor's
complete-boundary whole-wood **Z800** measurements, reproduced unchanged
in round 5, are the following **DERIVED auditor measurements**:

| Size | Median, mm | p90, mm | Maximum, mm | C9 − C7 p90, mm |
|---|---:|---:|---:|---:|
| 9ft | 0.942470 | **0.943950** | 4.444219 | 0.000000 |
| 8ft | 0.942732 | **1.046079** | 4.444225 | 0.000000 |
| 7ft | 0.942960 | **1.136187** | 4.444171 | 0.000000 |

Source: `VISAUDIT-733-VERDICT-4.md`, preserved by round 5's
`independent-plan-sections.json` (`whole`, `layer: cap800`). These distances
include complete section boundaries, joints and pocket cuts. The lane's
separate outer-only silhouette result, p90 **0.943 mm** / max **4.400 mm**,
is a different measurement and does not substitute for the auditor's whole-plan
statistic. No whole-table exact-match claim is made.

## Fold items for the card record

| Item | Correction |
|---|---|
| Lens B F1 | The saved preview predates the geometrically constructed ROI by about 23 minutes; lens B found no sign that the preview shaped the mask. |
| Lens B F3 | The first line names the terminal-face defect on all three sizes and keeps facing thickness UNRESOLVED. |
| Lens B F4 | The 12.42 px worst cover residual is stated beside the 3.685 / 4.411 / 1.049 px RMS values. |
| Lens B F2 | The 53.82 mm apex inset is attributed to the round-4 visual auditor; lane receipts own the 76.11 mm cap leg and 1.78 mm junction estimate. |
| Lens A P3-1 | Both raw-capture and writer-precision drift maxima are disclosed with the unchanged 0.25° / 0.25 mm / 1° bars. |
| Lens A P3-2 | The correction paragraph's render section values now carry inline DERIVED tags and the source value carries MODEL. |
| Lens A NOTE-1 | The value-identical 66-row PLAN law is explicitly identified as blind to the defect; A1 is the correction evidence. |
| Lens A NOTE-2 | The single vertical return plane is disclosed beside A1 together with the MODEL end's height-dependent twist. |
| Lens A NOTE-3 | A1's AFTER ≤ MODEL-own-maximum threshold is explicitly described as generous by construction. |
| Owner round-5 pixel ruling | The record requires zero protected pixels above one code plus geometry/material/program identity, and prints the auditor's 921 side pixels, owner 24/4/12 and T-corner 6–16 counts. |
| Whole-plan correction | The round-4 auditor owns the whole-wood p90 values 0.943950 / 1.046079 / 1.136187 mm for 9/8/7 ft, replacing the order's incorrect 0.82 mm claim. |
| Auditor PID disclosure | The one unrecorded about:blank PID remains attributed to the auditor's recorder, with its cleanup and all 48 persisted-PID exits disclosed. |
