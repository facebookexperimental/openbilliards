# D621 card 19 — built from git archives only

**Entry point (the only one): `tools/render/d621/card/build_card_pack_621.sh <commit>`** — exactly one argument, a commit id; no flags.

The wrapper extracts `git archive <commit>` (HEAD) and `git archive <pinned merge base> -- web tools` (BASE — the merge base recorded
in the archive's `tools/render/d621/law/identity_law_621.json` `base.commit` — be25b147 since the ADOPTION (the C5 folded main
be25b147 into the branch, so the RECORDED merge base moved with it; the pre-fold pin c01bb535 and its archived evidence stay in
`base.previous`); never a moving branch — CEREMONY-PREP-2 ruling B2; both commit ids and tree hashes are in the verdict) into a throwaway directory under `/tmp/d621-card/<commit8>-<utc>/` and runs **the
archive's own copy** of `card_621.py`. That script, executing from the HEAD archive:

1. serves the HEAD web tree (archive web + the wasm overlay, below) and dumps the 8 ft scene (`dump-ours-621.mjs`);
2. runs the ALIGN gate in card mode in-process (`align_gate_621.run_gate(card=…)`): every RAW / LAW row recomputed (nothing is
   evaluate-only, the standing targets cannot be replaced, the law-adjust deltas are the archive's committed file), the PLAN rows
   re-measured against the archive's committed law (`tools/render/d621/law/plan_law_621.json`), the HEAD and BASE material-identity
   captures made by the run with the archive's instrument (`meshident-488d.mjs`) and compared in-process against the identity law (11
   catalog tables; `rasson_ox_9ft` is PENDING until it lands at the ceremony — a stated free row; after the landing the merged tree is
   audited by the merged-tree fences against the same pinned base, not by re-running this fold);
3. only on PASS: the card plan figures (per pocket the three-cut overlay and the cap−1 cut), the straight-down owner frames
   (`topdown_621.mjs`) and the whole-table silhouettes, plus `gate.json` / `ALIGNMENT.md`;
4. the verdict embeds both commit ids and tree hashes, the served trees' table.js digests, the sha256 of every law / manifest /
   definition file read from the archive, a GENERATED list of every module that executed (with archive shas — no hand-maintained
   allowlist), and the two external pins below.

Exit code = the gate's (0 only on PASS with figures written). The working tree is never read; a working-copy edit has no effect
(arm 0). A lane editing tracked files is visible in the commit's diff — that is the reviewer's job, not this gate's.

**Two external runtime inputs, pinned by sha256 in the verdict (they cannot live in git):**
- the purchased model's quarantine OBJ set (`/tmp/ob-3dm-quarantine/diamond-proam-8ft/obj`; checked against the archive's committed
  `tools/render/d621/law/model_manifest_621.json`, per-file sha256 — vertices never enter the repo);
- the lane's locally rebaked wasm overlay for the 8 / 7 ft catalog entries (`/tmp/d621/web-overlay/dist/pool-wasm`; the canonical
  wasm is rebuilt only at the landing ceremony) — the served `pool_wasm_bg.wasm` sha and the app's kernel string are recorded.

**Negative tests (`tools/render/d621/law/arms_621.py`)** invoke the real entry point on scratch commits (a detached worktree of the
audited commit with one tracked file modified and committed; removed afterwards): a forged input / second argument (usage exit 2)
and a working-copy law edit (no effect); HEAD as BASE (`web/scene/table.js` := main's → FAIL); a tampered threshold in the archive's
law (row c 0.99 → the c rows FAIL); a tampered model manifest (→ FAIL); a tampered PLAN measurement helper (→ the plan rows FAIL).

**Presentation (not part of the gate):** the four owner triptychs (r1 / r3 / r6 / r8: OURS | purchased-model study render |
dossier photo | previous seal) are composed by `compose_sidebyside_621.py` from `poses-plan3.json` / `captions-plan3.json` here,
the pack's registers, the quarantine study renders and the Drive dossier photos — reference pixels that never enter the repo. They
carry no gate claim; the plan frames do. The committed plan names those inputs by placeholder: `<drive>/…` is the project Drive
folder (`--drive-root`, default `OB_DRIVE_DIR`; `o22_pack_621.py` resolves its reference photos the same way) and `<worktree>/…` the
checkout whose `output/` holds the frames (`--worktree-root`, default this checkout).

## Ports (GH-687 / #705 band law)

The lane's Chrome (dump, top-down capture, identity captures, the wedge probe) runs on the **diamond PLAN band `9520-9549`** declared in `web/tools/lane-bands.json` (30 ports: an http half and a CDP half). The band is pinned **by environment at every start** — no tool carries a default inside any declared band (the `ci-bands-lint` job fails a tool default inside the CI reserved range, a lane plan row or, after its expiry, a legacy row):

```
OB_E2E_PORT=9520 OB_E2E_CDP_PORT=9535 tools/render/d621/card/build_card_pack_621.sh <commit>
```

`build_card_pack_621.sh` refuses to run (exit 2, before any archive is built) when either pin is missing. Each Chrome-launching tool declares `PORT_INVENTORY = { http: 1, cdp: 1 }` (one http port, one CDP port per run); their in-file defaults (dump-ours `26000`/`26001`, top-down `26002`/`26003`; the wedge probe `26004`/`26005`) lie outside every declared band and serve a hand run with no pins only. The legacy diamond row `9740-9759` expires on 2026-09-10; nothing in this tree refers to it any more.

## The served kernel is pinned (D621-WASM-PIN, 2026-09-08)

`identity_law_621.json` `wasm` pins the kernel the card serves: `mode` (`overlay` = the lane's local rebake with the 8 / 7 ft catalog entries, served from `D621_WASM_OVERLAY`, default `<private evidence>/diamond/wasm-overlay/pool-wasm` — never `/tmp`, which the host's temp-file cleaner empties by access age; `archive` = the tree's own `web/dist/pool-wasm` after the ceremony's rebake) and `pool_wasm_bg_sha256`. `card_621.py` verifies file presence and sha **before anything is served or dumped**: exit **4 `WASM_OVERLAY_MISSING`** / exit **5 `WASM_PIN_MISMATCH`** (fail-closed; the older code recorded a missing overlay as `null` and went on to a dump that could never become ready). O22 arms 6 / 7 in `arms_621.py` assert both refusals through the real entry point without starting a browser; archive extraction still contributes to elapsed time under load. The original overlay was reaped on 2026-09-07, so runs refused with exit 4 until the maintainer supplied the bit-identical durable overlay below. The modeling round does not rebuild it locally (no rebake without an order).

## O22 binding and durable evidence (maintainer, 2026-09-08)

For `d621-o22-2026-09` in the modeling clone, the round's explicit band
overrides the Diamond example above: `OB_E2E_PORT=9400` and
`OB_E2E_CDP_PORT=9415`. Use only the ordered Chrome headless shell, with
`OB_PROFILE_SWEEP=0` and `OB_SKIP_TREE_PREFLIGHT=1`, one Chrome at a time.
The flag skips only the checkout tree-identity comparison. HTTP readiness
remains mandatory, including before served-renderer fingerprint requests.
These are operational bindings, not geometry constants or threshold changes.

The overlay is now available at
`<private evidence>/diamond/overlay-dca88339/pool-wasm/`; bind that directory with
`D621_WASM_OVERLAY`. Its `pool_wasm_bg.wasm` SHA256 is
`da67acb01cebeeda35d8576e1e83af551049d751edf9f5b303ba655e4bf225ff`,
bit-identical to the unchanged law pin. The modeling round neither rebuilds nor re-pins it,
and never copies it into the repository. No `/tmp/d621` slot symlink is needed;
the driver's own disposable serving-tree symlinks are expected.

The one-argument wrapper remains unchanged and stages its git archives under
`/tmp/d621-card`. That staging directory is not durable evidence: both the
daily reaper and emergency lane pruning can remove it. Stream the entry log
to a new directory under `<private evidence>/d621/` from the start. After
either a completed PASS or a completed FAIL, immediately run the archived
`tools/render/d621/card/preserve_evidence_621.py` with `--run` naming that
staging run and `--out` naming a new durable directory. Verify its
`SHA256SUMS` there. The preserver deliberately excludes served trees, source
assets, purchased OBJ/textures and WASM; it retains generated measurements,
dumps, plots, logs and the actual verdict. Never overwrite an earlier record.

The maintainer reported the emergency deletion of the earlier `089db8d8`
staging run. Its already-preserved evidence, and the later `ee0388275`
evidence, both still pass their complete checksums. A missing staging tree
does not invalidate those durable records. If a new card run is needed,
invoke `build_card_pack_621.sh` on the desired commit with the bindings above;
do not reconstruct a verdict from a different commit's cached files.

## Option B ruling for O22

The maintainer accepted Option B as deciding for e/f/j on PR #733.
`cushion_law_621.json` records the exact scope and bias explanation. MODEL
and OURS use the same triangle sectioner, ordinal station grid, apex fit,
window and coordinate-precision guard. PREP secondary columns remain in
the measured rows and pack; every target, bar, count and the pin is unchanged.
Coarse MODEL facets with unresolved local circle support are disclosed,
never fitted with a different window or used to rewrite the ordered target.

For the sealing battery, run the archived `arms_621.py` with `--baseline-red`
as well as its complete default arms 0 through 8, `--commit` naming the
audited commit, `--repo` naming this checkout, and `--out` naming a new
durable evidence directory. The additional scratch commit restores all
pre-O22 `table.js` bytes and must fire c/e/f/i under the new B instruments;
the existing four-mm nose arm must independently fire e. The entry log is
streamed to durable storage before each archive build starts. A failed
named red-arm assertion is not covered by a different failing gate row.

## FIX1 addendum (supersedes the R2/family/alias clauses above)

MODEL row e now uses the per-station adjacent-face-tangent circle through
the nose-facet vertices; OURS keeps the B apex fit on geometry-derived
shoulder support. A collinear 2-4-point fit is UNRESOLVED, never a pass.
The original PREP secondary column remains. All bars and counts are unchanged.
The actual tangent read is near 0.80 mm, not the earlier approximate 0.53 mm
chord-equivalent convention; the decision block discloses the distinction.

The explicitly ruled sixth family is `dm-shelfshadow`: it follows the glue
plane because PLAN-1 derives the shadow leg from the arm end. The
`owner_proam_9ft_2026_07` render alias follows the entry, with physics/camera
inputs frozen. The nine byte checks are eight IDENTICAL controls plus this
named, fenced render delta. Cards and the PR must state that ruling.

Radius regression is arm 5; missing-overlay exit 4 and wrong-pin exit 5
are arms 6 and 7; a normals-only leak on a non-target table is arm 8. The future ceremony edits THREE identity-law fields:
`wasm.mode=archive`, `pool_wasm_bg_sha256`, and `kernel`. FIX1 does not rebake
or change any of these current values. Its alias `fence-base-490` re-pin is
explicitly deferred to that ceremony. Any genuine remaining f red stays red.

## ADOPTION addendum (2026-09-11; NOTE-FENCE-NORMALS + NOTE-CENSUS-SETTLE)

The identity capture is `d621-meshident-capture/3`: besides the world-space
POSITIONS hash (`geom_sha`, unchanged), every mesh carries `ab` — an
order-sensitive FNV hash over the RAW BYTES of every geometry attribute the
renderer reads (position, normal, uv, tangent, color and every custom
attribute such as the baked occlusion), the index, the groups and the draw
range — folded into the table-level `attr_sha`. The in-process compare adds
the diff `attributes`; a normals-only, uv-only or index-only change on a
non-target table is therefore a red identity row (arm 8 proves it through
the real entry point: `identity_predator_apex_9ft` FAIL with `attributes`
present and `geometry` absent).

Every capture and dump (`meshident-488d.mjs`, `dump-ours-621.mjs`,
`mesh_bytes_621.mjs`) first polls each mesh's attribute + index versions and
attribute set until they hold still for three consecutive reads at 250 ms
(cap 30 s); on the cap the run is REFUSED naming the mesh and attribute that
kept moving. The wait (`settle`: reads, seconds, changes, first/last change)
is recorded in the capture / dump record. A baked occlusion apply landing
after `ready` can no longer be hashed half-installed.

Finding on the first adoption card (4a4316e9, FAIL `identity_wpbsa_snooker_12ft`
got DIFFER (attributes)): the runtime occlusion transport (`snkApplyOccl` →
`aOccl`) traces in 12 ms slices and attaches each mesh's attribute only when
its job completes, so a version poll cannot see an undrained queue; two boots
of the SAME tree hashed different `aOccl` sets (11 snooker pocket meshes; the
positions hash never saw it). Every capture now calls the documented
render-determinism seam `window.__snkOccl.flush()` first (the same seam the
offline renders and `mesh_bytes_621.mjs` use), then polls to stillness; after
the flush the probe measured 0 attribute differences across boots and across
head/base (154 meshes carrying `aOccl`). `drained` / `drain_ms` ride the record.
