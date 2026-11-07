#!/bin/bash

# Copyright (c) Meta Platforms, Inc. and affiliates.

# battery-490-craft.sh — the craft-uplift chinese-8 middle-pocket gate battery (R1 seals).
#
# BUILD-3 (review round 12 P2-a): the battery FAILS as a battery.  `set -euo pipefail`, every
# instrument runs through `step`, which (1) writes the instrument's full output to
# $BATTERY_LOG_DIR/<name>.log, (2) fails on a non-zero exit, (3) fails when the REQUIRED verdict
# pattern is absent from the output (instruments that carry no exit code — mouthgrid, jawrake —
# are held by their verdict lines), (4) prints the verdict tail.  The first red stops the battery
# with `BATTERY-FAIL <name> rc=<n>`; BATTERY-DONE is printed only when every step passed.
# `--selftest` runs a deliberately failing first step and must exit non-zero (the arm that proves
# the battery can fail).  The drawing check runs the generator in WRITE mode first (a clean
# archive carries no output/) and then `--check`, whose STALE exit 1 now stops the battery.
#
# History: R1-FIX9-PREFIRE (every [pass2] row printed); R1-FIX10 (mouthgrid census); R1-FIX12
# (pinned port pair OB_E2E_PORT / OB_E2E_CDP_PORT — the lane's band is 9780-9789); R1-FIX13
# (knit-rise / cover-lift arms); R1-MIDPOCKET-BUILD (r12 arms knit-rise / cover-lift / body-hide,
# the r12 generator, the mesh+material FENCE); BUILD-2 (sight-ride arm, seven-table material arm).
set -euo pipefail
cd "$(dirname "$0")/../.."
export OB_E2E_PORT="${OB_E2E_PORT:-10300}" OB_E2E_CDP_PORT="${OB_E2E_CDP_PORT:-10301}"
BATTERY_LOG_DIR="${BATTERY_LOG_DIR:-/tmp/ob-battery-490-$$}"; mkdir -p "$BATTERY_LOG_DIR"
echo "[battery] logs in $BATTERY_LOG_DIR"
STEPS=0
# step <name> <required-pattern (grep -E; empty = exit code only)> <tail-lines> -- <command...>
# FIX9 (review round 9 on #731 P2 B, Fable pass 2): if the battery stops between asmodeled-prior-report / plant and coexist, this lane's
# authored stand-in (or a decoy) would outlive the run in the tool's REAL default output — remove exactly that, content-checked, on exit
__asm490_cleanup() { local D="${OB_ARM_ASM490_DIR:-/tmp/ob-490r30-asmodeled}"; if [ -f "$D/asmodeled-metrics.json" ] && grep -q -E '"tool":"arm-fix[89]-decoy|"stand_in":' "$D/asmodeled-metrics.json"; then rm -f "$D/asmodeled-metrics.json" "$D/.arm-fix8-decoy.sha"; echo "[battery] stand-in / decoy asmodeled-metrics.json removed on exit"; fi; }
trap __asm490_cleanup EXIT
step() {
  local name="$1" pattern="$2" tail_n="$3"; shift 3; [ "$1" = "--" ] && shift
  local log="$BATTERY_LOG_DIR/$name.log"; local rc=0
  "$@" > "$log" 2>&1 || rc=$?
  grep -v '^\[cdp\]' "$log" | tail -n "$tail_n" || true
  if [ "$rc" -ne 0 ]; then echo "BATTERY-FAIL $name rc=$rc (log $log)"; exit "$rc"; fi
  if [ -n "$pattern" ] && ! grep -Eq -- "$pattern" "$log"; then echo "BATTERY-FAIL $name: required verdict '$pattern' absent (log $log)"; exit 1; fi
  STEPS=$((STEPS + 1))
}
# an arm that must FAIL: the command's non-zero exit is the pass condition
step_expect_fail() {
  local name="$1" pattern="$2"; shift 2; [ "$1" = "--" ] && shift
  local log="$BATTERY_LOG_DIR/$name.log"; local rc=0
  "$@" > "$log" 2>&1 || rc=$?
  grep -v '^\[cdp\]' "$log" | tail -n 2 || true
  if [ "$rc" -eq 0 ]; then echo "BATTERY-FAIL $name: expected a non-zero exit, got 0 (log $log)"; exit 1; fi
  if [ -n "$pattern" ] && ! grep -Eq -- "$pattern" "$log"; then echo "BATTERY-FAIL $name: expected '$pattern' in the output (log $log)"; exit 1; fi
  echo "[battery] $name: failed as required (rc=$rc)"; STEPS=$((STEPS + 1))
}
# COMPANION-1d: a RECORD row — the command runs, its verdict line is printed and logged, the row never goes red (the advisory
# audit-unquoted-cleanup report: a lexer that is not a parser; the class-A gate is arm-literal-cleanup + the array-quoted scripts)
step_record() {
  local name="$1" pattern="$2"; shift 2; [ "$1" = "--" ] && shift
  local log="$BATTERY_LOG_DIR/$name.log"; local rc=0
  "$@" > "$log" 2>&1 || rc=$?
  echo "[battery] $name: RECORD (rc=$rc) :: $(grep -E -- "$pattern" "$log" | tail -n 1 | cut -c1-200)"; STEPS=$((STEPS + 1))
}
# A KNOWN-RED row. A step that is red on main for a filed issue runs to the end, and
# tools/render/battery-known-red.py compares its red set with the set pinned for it in
# tools/render/fixtures/battery-490-known-red.json. The row holds only when the sets are equal: a new red, a vanished
# red (the fix landed: re-pin) or a planted red breaks it, and an unreadable verdict is a refusal. Later rows run.
step_known_red() {
  local name="$1" tail_n="$2"; shift 2; [ "$1" = "--" ] && shift
  local log="$BATTERY_LOG_DIR/$name.log"; local rc=0 vr=0 verdict t0 rid
  t0=$(date +%s)   # the run's start: a JSON report older than this is a stale verdict (review b21 P1)
  rid="$name.$$.$t0.$RANDOM"   # this invocation's id: the instrument stamps it into its report (review b21 round 2)
  OB_RUN_ID="$rid" "$@" > "$log" 2>&1 || rc=$?
  grep -v '^\[cdp\]' "$log" | tail -n "$tail_n" || true
  verdict=$(python3 tools/render/battery-known-red.py --fixture tools/render/fixtures/battery-490-known-red.json --step "$name" --log "$log" --rc "$rc" --since "$t0" --run-id "$rid" 2>&1) || vr=$?
  echo "$verdict"
  if [ "$vr" -ne 0 ]; then echo "BATTERY-FAIL $name: the pinned red set moved or the verdict is unreadable (rc=$vr, log $log)"; exit 1; fi
  STEPS=$((STEPS + 1))
}
if [ "${1:-}" = "--selftest" ]; then
  echo "[battery] SELFTEST: a failing first step must stop the battery"
  step selftest-false '' 1 -- false
  echo "BATTERY-DONE (selftest reached the end — THIS IS A DEFECT)"; exit 0
fi
step sw-precache   'SW-PRECACHE ok'                          1 -- node web/tools/gen-sw-precache.mjs --check
# pass2 --gate is a known-red row (the JOY-era rows awaiting their re-derivation, and rail-end-face);
# its set is pinned in tools/render/fixtures/battery-490-known-red.json
step_known_red gate 400 -- node web/tools/check-490-pass2.mjs --gate
step arm-known-red-selftest '^\[known-red\] SELFTEST 18/18' 1 -- python3 tools/render/battery-known-red.py --selftest
# review b21 P2: the net-hide arm's control on the CPU (a crossing test that sees no crossing must leave the arm unarmed)
step arm-pass2-selftest '^\[pass2-selftest\] SELFTEST 9/9' 1 -- node web/tools/check-490-pass2.mjs --selftest
step red-arm       '^\[red-arm\] OK'                          2 -- node web/tools/check-490-pass2.mjs --red-arm
step arm-knit-rise  '^\[perturb knit-rise\] ARMED'            1 -- node web/tools/check-490-pass2.mjs --gate --perturb=knit-rise
step arm-cover-lift '^\[perturb cover-lift\] ARMED'           1 -- node web/tools/check-490-pass2.mjs --gate --perturb=cover-lift
step arm-body-hide  '^\[perturb body-hide\] ARMED'            1 -- node web/tools/check-490-pass2.mjs --gate --perturb=body-hide
step arm-sight-add  '^\[perturb sight-add\] ARMED'            1 -- node web/tools/check-490-pass2.mjs --gate --perturb=sight-add
# GH-1146: the plants of the rows re-derived for the D3 loft and the JOY bag (boot-tip-crack-dogear, midmouth-void, midmouth-beam)
step arm-dogear     '^\[perturb dogear\] ARMED'               1 -- node web/tools/check-490-pass2.mjs --gate --perturb=dogear
step arm-net-shift  '^\[perturb net-shift\] ARMED'            1 -- node web/tools/check-490-pass2.mjs --gate --perturb=net-shift
step arm-net-hide   '^\[perturb net-hide\] ARMED'             1 -- node web/tools/check-490-pass2.mjs --gate --perturb=net-hide
# GH-1146: gate6-planlaw's corner half, re-derived on the D3 loft and fail-closed
step arm-ring-push  '^\[perturb ring-push\] ARMED'            1 -- node web/tools/check-490-pass2.mjs --gate --perturb=ring-push
# BUILD-3 (review round 12 P2-b): the judge must fail CLOSED — a dropped measurement is RED
step_expect_fail arm-drop-measure '^\[pass2\] RED: schema' -- node web/tools/check-490-pass2.mjs --gate --drop-measure=gate3_butt_mm
# The live planted red for the known-red row: the drop-measure run adds a schema red to the pinned
# set, so the gate pin must read MOVED on that log (the run's verdict exit is 3; the reader refuses any other code)
step_expect_fail arm-known-red-planted '^\[known-red\] gate MOVED .*schema' -- python3 tools/render/battery-known-red.py --fixture tools/render/fixtures/battery-490-known-red.json --step gate --log "$BATTERY_LOG_DIR/arm-drop-measure.log" --rc 3
step mouthgrid     '^\[mouthgrid-490\] mid_close_diag'        5 -- node tools/render/mouthgrid-490.mjs --poses mid_close_diag,mid_tt_inside,c6_midext_owner_low,c7_rail25e_midext_aperture --out /tmp/ob-mouthgrid-490
# FIX9 (review round 9 on #731 P2 B): a legitimate PRIOR plain-mode report stands in the default output before the plant — the plant
# hashes and preserves it, the coexist row asserts it byte-identical after the letters row (a valid prior artefact is never a
# precondition failure). A REAL plain run is impossible on this tree AND on main b430d377 (the plain path parses `TIP_FACE_Y` out of
# web/scene/table.js, a constant the r30/r31 model rounds removed — a pre-existing open row filed on the PR, not this lane's object), so
# the prior report is a stand-in carrying the real tool + mode fields; the plant cannot tell it from a real one, which is the point.
step asmodeled-prior-report '^\[prior-report\] standing' 1 -- bash tools/render/arms-fix9.sh asmodeled-490-prior-report
step arm-asmodeled-490-plant '^\[arm-asmodeled-490-plant\] ARMED' 1 -- bash tools/render/arms-fix8.sh asmodeled-490-plant
# Letters and orbitsweep are known-red rows too (pinned sets and issues in the fixture); fullview-rows is a
# plain row again, since the corner contract r2 re-derivation of HAUS-LIP / HAUS-CUT left no fullview row red
step_known_red letters 2 -- node tools/render/asmodeled-drawings-490.mjs --letters --judge
step arm-asmodeled-490-coexist '^\[arm-asmodeled-490-coexist\] ARMED' 1 -- bash tools/render/arms-fix8.sh asmodeled-490-coexist
step jawrake       'JAWRAKE captures DONE'                    1 -- node tools/render/jawrake-490.mjs
step jawstep       '-> GREEN'                                 2 -- python3 tools/audit/jawstep_490.py --gate --caps /tmp/ob-jawrake-490
# The re-pinned ceiling's live red arm. The stored-shading ladder (k 0.85) planted on every tongue's curl side
# must read RED; a crashed capture never satisfies it (the jawstep verdict line is required)
step_expect_fail arm-jawstep-ladder '-> RED' -- sh -c 'node tools/render/jawrake-490.mjs --perturb=ladder-0.85 --out /tmp/ob-jawrake-490-ladder && python3 tools/audit/jawstep_490.py --gate --caps /tmp/ob-jawrake-490-ladder'
step crosstable    'CROSSTABLE-488P: CLEAN'                   1 -- node tools/render/crosstable-spot-488p.mjs
step fullview      ''                                         1 -- node tools/render/fullview-overlay-490.mjs
step fullview-rows '^\[fullview-490\] rows [0-9]+ failing 0'  1 -- python3 -c "import json,sys;d=json.load(open('/tmp/ob-fullview-490/fullview-490.json'));r=d['rows'];m=d.get('mid') or {};mr=m.get('rows') if isinstance(m,dict) else None;f=sum(1 for x in r if not x.get('pass'));print('[fullview-490] rows',len(r),'failing',f,('mid rows %d failing %d'%(len(mr),sum(1 for x in mr if not x.get('pass'))) if isinstance(mr,list) else ''));sys.exit(1 if f else 0)"
step construction  'check-pocket-construction: all bars OK'   1 -- node tools/render/check-pocket-construction.mjs
# COMPANION-1d FIX4 (4), GH-1080: the post-sample plant — an obPocketCap attribute written just before the post-sample read → REFUSED by name, no bar printed.
# It replaces the early-sample plant, which needs the switch to write the table group late; since GH-1131 ships the snooker occlusion precomputed, that group is complete at once and the early-sample plant has nothing to catch
step_expect_fail arm-construction-pocket-write '^\[check-pocket-construction\] REFUSED — the geometry signature changed while the instruments ran' -- node tools/render/check-pocket-construction.mjs --perturb=pocket-write-during
step_known_red orbitsweep 2 -- node tools/render/orbitsweep-490.mjs --sweep --web "$PWD/web"
# the drawing chain: generate (write mode; identities asserted) then the byte-identity check
step drawing-write ''                                         1 -- python3 tools/render/gh490m/gen_drawing_490m_r12.py --output-dir output/gh490m-r12
step drawing-check '^\[check\] [0-9]+ outputs byte-identical' 1 -- python3 tools/render/gh490m/gen_drawing_490m_r12.py --output-dir output/gh490m-r12 --check
# BUILD-3 (review round 12 P1-b): the GI bake mirror == the live middle-pocket geometry
step gi-mirror     '^\[gi-mirror-490\] PASS'                  5 -- sh -c 'node tools/render/gi-mirror-dump-490.mjs --out /tmp/ob-gi-mirror-490-dump.json && node tools/render/gi-mirror-census-490.mjs --dump /tmp/ob-gi-mirror-490-dump.json --out /tmp/ob-gi-mirror-490.json'
# COMPANION-1c L2 (review r2 on #761): the boot-time console line reached a listener registered before navigation (reads the row's dump)
step arm-early-console '^\[arm-early-console\] ARMED' 1 -- bash tools/render/arms-companion1.sh early-console /tmp/ob-gi-mirror-490-dump.json
# GH-666 (review rounds 1-2 on #672): the cn8 lofts are CLOSED where they are meant to be — zero open
# edges after positional welding (bed ring and the DT-09 clip contour excluded) — and the UNPERTURBED
# cushion-profile gate runs as its own row: its failure set must equal the committed baseline by row
# identity (tools/render/fixtures/cushion-profile-baseline-490.json = predator's 18, issue #671 — a
# pinned, owned red, not an allowlist: a row appearing OR vanishing breaks the row). The arms are
# DIFFERENTIAL inside one invocation: the tuck skirt removed must open every tucked loft against the
# same run's clean count; a reversed tucked cap must add exactly the tucked-cap rule-5 rows to the
# unperturbed set (which must itself equal the baseline).
# Issue #728: both gates read the ONE degenerate-triangle definition (lib/loft-degenerate.mjs —
# a zero-area triangle carries no surface): the plant arm adds one by index reuse (rule 5 must
# skip it, the manifold count must rise by exactly 1 with open+T unchanged), the inflate arm adds
# one finite down-facing cap triangle (both gates must move on every loft), and the agree arm
# holds the two gates' DEGENERATE census lines byte-identical across clean / plant / inflate.
step loft-manifold     '^\[loft-manifold\] PASS'                 1 -- node tools/render/check-loft-manifold.mjs
step arm-loft-manifold '^\[perturb drop-closure\] ARMED'         1 -- node tools/render/check-loft-manifold.mjs --perturb=drop-closure
step arm-clip-cap      '^\[perturb drop-clip-cap\] ARMED'        1 -- node tools/render/check-loft-manifold.mjs --perturb=drop-clip-cap
step cushion-profile   '^\[cushion-profile\] BASELINE HELD'       1 -- node tools/render/check-cushion-profile.mjs --expect-baseline
step arm-cap-flip      '^\[perturb flip-tucked-cap\] ARMED'      1 -- node tools/render/check-cushion-profile.mjs --perturb=flip-tucked-cap
step arm-degenerate-plant-manifold   '^\[perturb plant-degenerate\] ARMED'   1 -- node tools/render/check-loft-manifold.mjs --perturb=plant-degenerate
step arm-degenerate-inflate-manifold '^\[perturb inflate-degenerate\] ARMED' 1 -- node tools/render/check-loft-manifold.mjs --perturb=inflate-degenerate
step arm-degenerate-plant-profile    '^\[perturb plant-degenerate\] ARMED'   1 -- node tools/render/check-cushion-profile.mjs --perturb=plant-degenerate
step arm-degenerate-inflate-profile  '^\[perturb inflate-degenerate\] ARMED' 1 -- node tools/render/check-cushion-profile.mjs --perturb=inflate-degenerate
step arm-728-agree     '^\[arm-728-agree\] ARMED'                1 -- bash tools/render/arms-728.sh agree
# L-CCP (landing rule 2026-09-11): the PROFILE-SOURCE CENSUS — per catalog table, which cushion-profile source the two L-CCP call
# statements resolved, pinned by tools/render/fixtures/cushion-profile-sources-490.json (later landing lanes extend the table);
# the red plant drops the first table's family before the unchanged statement and the census must read DIFF
step profile-sources   '^\[cushion-profile\] PROFILE-SOURCES HELD' 1 -- node tools/render/check-cushion-profile.mjs --profile-sources tools/render/fixtures/cushion-profile-sources-490.json
step_expect_fail arm-profile-source-drop '^\[cushion-profile\] PROFILE-SOURCES DIFF' -- node tools/render/check-cushion-profile.mjs --profile-sources tools/render/fixtures/cushion-profile-sources-490.json --perturb=drop-profile-argument
# COPLANAR-PAIR census (ORDER-CN8-SLIT-FIX, GH-666 follow-up; refs #728): two front-facing triangles of
# different meshes on one plane with positive overlap fight in the depth buffer (the slot-pose slit:
# the cushion's cut cap and the half-plank's end face shared |u| = DT-09 over 185 mm² — cured by the
# plank's cut-face trim at the back line −CW). The row holds the two cn8 tables to the committed
# baseline by row identity (tools/render/fixtures/coplanar-baseline-490.json — the pre-existing pairs
# outside the plank/cap class, pinned and characterised there; a row appearing OR vanishing breaks the
# row). The arm clones the first census mesh in place and must read the clone pair at the mesh's own
# area. Chrome rows (the pinned port pair).
step coplanar          '^\[coplanar\] BASELINE HELD'             1 -- node tools/render/check-coplanar-pairs.mjs --web "$PWD/web" --expect-baseline tools/render/fixtures/coplanar-baseline-490.json
step arm-coplanar      '^\[perturb half-clone\] ARMED'           1 -- node tools/render/check-coplanar-pairs.mjs --web "$PWD/web" --tables chinese8_pro_9ft --perturb=half-clone
# ORDER-CN8-731-FIX1 (review round 1 on #731): rows are keyed by mesh IDENTITY — the swap arm relabels two
# different object pairs with one name pair and swaps their areas: the identity matcher must read two
# changed rows, a name-keyed matcher zero. Table selection FAILS CLOSED through the real entry points: a
# typo'd id and an empty list are refused before any boot (exit 2, the id named), for the coplanar gate
# and the fence census alike.
step arm-coplanar-identity '^\[perturb swap-same-named\] ARMED'  1 -- node tools/render/check-coplanar-pairs.mjs --web "$PWD/web" --tables chinese8_pro_9ft --expect-baseline tools/render/fixtures/coplanar-baseline-490.json --perturb=swap-same-named
step_expect_fail arm-tables-typo  'REFUSED — unknown table id chinese8_pro_9f' -- node tools/render/check-coplanar-pairs.mjs --web "$PWD/web" --tables chinese8_pro_9f --expect-zero
step_expect_fail arm-tables-empty 'REFUSED — empty table selection'         -- node tools/render/check-coplanar-pairs.mjs --web "$PWD/web" --tables , --expect-baseline tools/render/fixtures/coplanar-baseline-490.json
step_expect_fail arm-census-typo  'REFUSED — unknown table id chinese8_pro_9f' -- node tools/render/census-490-tables.mjs --table chinese8_pro_9f --web "$PWD/web" --out /tmp/ob-census-490-arm/typo.json
# ORDER-CN8-731-FIX2 (review round 2 on #731): (a) the validator's RETURN is the working list — a comma+space
# list must build BOTH tables under their own ids (the post-boot built-id guard asserts it) and a whitespace-only
# id is refused; (b) option presence is not option value — `--expect-baseline=` blank and a missing baseline
# file exit 2 naming the flag (the valid path is the `coplanar` row above); the manifold gate takes the same
# comma+space list and reports both entries.
step arm-tables-spaced   '^\[coplanar\] BASELINE HELD \(104 rows on chinese8_pro_9ft,joy_q8_9ft' 1 -- node tools/render/check-coplanar-pairs.mjs --web "$PWD/web" --tables "chinese8_pro_9ft, joy_q8_9ft" --expect-baseline tools/render/fixtures/coplanar-baseline-490.json
step_expect_fail arm-tables-whitespace 'REFUSED — --tables given without a value|REFUSED — empty table selection' -- node tools/render/check-coplanar-pairs.mjs --web "$PWD/web" --tables " " --expect-zero
step_expect_fail arm-baseline-blank   'REFUSED — --expect-baseline given without a value' -- node tools/render/check-coplanar-pairs.mjs --web "$PWD/web" --tables chinese8_pro_9ft --expect-baseline=
step_expect_fail arm-baseline-missing 'REFUSED — --expect-baseline /tmp/ob-no-such-baseline.json: path not found' -- node tools/render/check-coplanar-pairs.mjs --web "$PWD/web" --tables chinese8_pro_9ft --expect-baseline /tmp/ob-no-such-baseline.json
step arm-manifold-spaced '^\[loft-manifold\] PASS .*coverage 2 of [0-9]+ catalog entries \(chinese8_pro_9ft,joy_q8_9ft\)' 1 -- node tools/render/check-loft-manifold.mjs --tables "chinese8_pro_9ft, joy_q8_9ft"
step_expect_fail arm-profile-baseline-blank 'REFUSED — --expect-baseline= given without a value' -- node tools/render/check-cushion-profile.mjs --expect-baseline=
# ORDER-CN8-731-FIX3 (review round 3 on #731): (a) prior evidence is invalidated before any refusal — a reused --out
# with a prior verdict + a refused input leaves no verdict behind; (b) a census owns its listener and knows its
# tree — a foreign server pre-bound on the port is refused by name (no Chrome), a listener serving another tree
# is refused on the served-tree identity; (c) pending CDP requests settle on disconnect — the socket closed with
# a request pending exits non-zero within the command deadline.
step arm-stale-verdict    '^\[arm-stale-verdict\] ARMED'   1 -- bash tools/render/arms-fix3.sh stale-verdict
step arm-foreign-listener '^\[arm-foreign-listener\] ARMED' 1 -- bash tools/render/arms-fix3.sh foreign-listener
# FIX4 (review round 4 on #731, 3 × P2 in the invalidation layer): a destination is a literal path; one resolver for invalidation and
# writing; invalidation is literally the first effect
step arm-literal-destination '^\[arm-literal-destination\] ARMED' 1 -- bash tools/render/arms-fix4.sh literal-destination
step arm-one-resolver        '^\[arm-one-resolver\] ARMED'        1 -- bash tools/render/arms-fix4.sh one-resolver
step arm-first-effect        '^\[arm-first-effect\] ARMED'        1 -- bash tools/render/arms-fix4.sh first-effect
# FIX5 (review round 5 on #731, 1 × P2): the built-id beacon follows a rebuild — boot chinese8, switch to wpa_generic (a geometrically
# different table: 272 → 57 obTable meshes, so the rebuild is real, not an alias relabel) in-page; the beacon must certify wpa_generic
# and refuse chinese8 by name (through the census tool's own served-tree preflight and listener guards)
step arm-beacon-switch       '^\[census-490\] ARMED — beacon follows the rebuild' 1 -- node tools/render/census-490-tables.mjs --table chinese8_pro_9ft --switch-to wpa_generic_9ft --web "$PWD/web" --out /tmp/ob-census-490-arm/switch-wpa_generic.json
# FIX6 (review round 6 on #731, 2 × P2 in check-coplanar-pairs): (A) a foreign DevTools endpoint on the band's CDP port is refused by
# name, never attached to; (B) a baseline holds only for tables it pins — unpinned table / no rows / no perTable refused pre-boot,
# a pair-free table pinned with rows: [] HELD
step arm-foreign-cdp         '^\[arm-foreign-cdp\] ARMED'         1 -- bash tools/render/arms-fix6.sh foreign-cdp
step arm-baseline-coverage   '^\[arm-baseline-coverage\] ARMED'   1 -- bash tools/render/arms-fix6.sh baseline-coverage
step arm-pairfree-held       '^\[arm-pairfree-held\] ARMED'       1 -- bash tools/render/arms-fix6.sh pairfree-held
# FIX7 (review round 7 on #731, 2 × P2): (A) each orbitsweep mode invalidates only its own output set — the result sets coexist;
# (B) a CDP command deadline / closed socket leaves a readiness poll as a named refusal (a 5 s deadline for the arm)
step arm-mode-coexist        '^\[arm-mode-coexist\] ARMED'        1 -- bash tools/render/arms-fix7.sh mode-coexist
step arm-cdp-stall           '^\[arm-cdp-stall\] ARMED'           1 -- env OB_CDP_COMMAND_DEADLINE_MS=5000 bash tools/render/arms-fix7.sh cdp-stall
step arm-manifest-fail-closed '^\[arm-manifest-fail-closed\] ARMED' 1 -- bash tools/render/arms-fix7.sh manifest-fail-closed
# FIX8 (review round 8 on #731): mode-scoped invalidation through ONE shared resolver in every invalidating tool, and every
# selection validated before a deletion path is built from it — one arm per converted tool through its real entry point
step arm-cammatch-489-modes  '^\[arm-cammatch-489-modes\] ARMED'  1 -- bash tools/render/arms-fix8.sh cammatch-489-modes
step arm-cammatch-488d-modes '^\[arm-cammatch-488d-modes\] ARMED' 1 -- bash tools/render/arms-fix8.sh cammatch-488d-modes
step arm-overlay-gate-modes  '^\[arm-overlay-gate-modes\] ARMED'  1 -- bash tools/render/arms-fix8.sh overlay-gate-modes
step arm-selection-before-deletion '^\[arm-selection-before-deletion\] ARMED' 1 -- bash tools/render/arms-fix8.sh selection-before-deletion
step arm-asmodeled-488p-modes '^\[arm-asmodeled-488p-modes\] ARMED' 1 -- bash tools/render/arms-fix8.sh asmodeled-488p-modes
step arm-c14-488p-modes      '^\[arm-c14-488p-modes\] ARMED'      1 -- bash tools/render/arms-fix8.sh c14-488p-modes
step arm-fullview-selftest   '^\[arm-fullview-selftest\] ARMED'   1 -- bash tools/render/arms-fix8.sh fullview-selftest
step arm-meshident-modes     '^\[arm-meshident-modes\] ARMED'     1 -- bash tools/render/arms-fix8.sh meshident-modes
step arm-coplanar-scope      '^\[arm-coplanar-scope\] ARMED'      1 -- bash tools/render/arms-fix8.sh coplanar-scope
step arm-census-selection    '^\[arm-census-selection\] ARMED'    1 -- bash tools/render/arms-fix8.sh census-selection
step arm-py-modes            '^\[arm-py-modes\] ARMED'            1 -- bash tools/render/arms-fix8.sh py-modes
step arm-c14-488d-inventory  '^\[arm-c14-488d-inventory\] ARMED'  1 -- bash tools/render/arms-fix8.sh c14-488d-inventory
step arm-orbitsweep-488d-modes '^\[arm-orbitsweep-488d-modes\] ARMED' 1 -- bash tools/render/arms-fix8.sh orbitsweep-488d-modes
# FIX9 (review round 9 on #731): one reader for argument validity — a blank / whitespace / = / trailing destination or selection owns nothing
step arm-blank-destination-488d '^\[arm-blank-destination-488d\] ARMED' 1 -- bash tools/render/arms-fix9.sh blank-destination-488d
step arm-blank-forms-families '^\[arm-blank-forms-families\] ARMED' 1 -- bash tools/render/arms-fix9.sh blank-forms-families
step arm-blank-destination-sweep '^\[arm-blank-destination-sweep\] ARMED' 1 -- bash tools/render/arms-fix9.sh blank-destination-sweep
step arm-eqdir-only          '^\[arm-eqdir-only\] ARMED'          1 -- bash tools/render/arms-fix9.sh eqdir-only
step arm-asmodeled-490-coexist-red '^\[arm-asmodeled-490-coexist-red\] ARMED' 1 -- bash tools/render/arms-fix9.sh asmodeled-490-coexist-red
# FIX10 (review round 10 on #731): ONE parse to completion before any effect — help-only / repeated-blank / error forms per family with a populated
# destination byte-identical, and the source fence (no invalidation ahead of its parser's return; red arm re-inserts a pre-scan)
step arm-help-only          '^\[arm-help-only\] ARMED'          1 -- bash tools/render/arms-fix10.sh help-only
step arm-repeated-blank     '^\[arm-repeated-blank\] ARMED'     1 -- bash tools/render/arms-fix10.sh repeated-blank
step arm-error-forms        '^\[arm-error-forms\] ARMED'        1 -- bash tools/render/arms-fix10.sh error-forms
step arm-parse-first-fence  '^\[arm-parse-first-fence\] ARMED'  1 -- bash tools/render/arms-fix10.sh parse-first-fence
# FIX11 (review round 11 on #731): one readiness law for owned servers (the shared preflight's bounded wait, then the FIX3 checks; never-binds exit 78)
# and input existence on the effective (last) value; the three in-page tools proceed through a 4 s-delayed owned server (pre-fix exit 2): the two check-* tools to the
# readiness boundary (`slow-server-only` — their full browser run stalls at a CDP evaluate under load on the FIX10 tree as well: an OPEN row), meshident end to end
step arm-owned-server-wait  '^\[arm-owned-server-wait\] ARMED'  1 -- bash tools/render/arms-fix11.sh owned-server-wait
step arm-effective-input    '^\[arm-effective-input\] ARMED'    1 -- bash tools/render/arms-fix11.sh effective-input
step slow-server-corner     '^\[check-corner-form\] readiness: .* proceeded after [0-9]+ ms' 1 -- node tools/render/check-corner-form.mjs --perturb=slow-server-only --out /tmp/ob-490r30-corner-slow/corner-form.json
step slow-server-pocket     '^\[check-pocket-construction\] readiness: .* proceeded after [0-9]+ ms' 1 -- node tools/render/check-pocket-construction.mjs --perturb=slow-server-only --out /tmp/ob-490r30-pocket-slow/pocket-construction.json
step slow-server-meshident  '^\[meshident\] wrote' 1 -- node tools/render/meshident-488d.mjs --out /tmp/ob-490r30-meshident-slow/identity.json --web "$PWD/web" --tables chinese8_pro_9ft --perturb=slow-server
# COMPANION-1 (review round 12 on #731 P2, arms-fix8.sh:11 `rm -f $PLANTED`): cleanup / teardown / kill targets are literal paths in a Bash
# array expanded quoted, never a word-split list — the audit helper at zero rows over the lane's shell scripts (a static lexer; shellcheck is
# absent on this host), the helper's own red arm (every planted spelling in a scratch copy reported once, the negatives silent, an
# unreadable file and an empty set refused), and the
# plant/coexist pair through the real entry point with a space-bearing OB_ARM_ASM490_DIR and a sentinel beside it (before = 4dc5154d: NOT ARMED)
# COMPANION-1d: the audit is an ADVISORY report (its known blind spots are in its header) — a RECORD row, never a gate; the plant arm
# (arms-companion1.sh audit-helper) left the battery and certifies the advisory's coverage on its own; the class-A GATE is arm-literal-cleanup
step_record audit-unquoted-cleanup '^\[audit-unquoted-cleanup\] ([0-9]+ rows over|REFUSED — [0-9]+ of)' -- python3 tools/render/lib/audit-unquoted-cleanup.py --root "$PWD"
step arm-literal-cleanup    '^\[arm-literal-cleanup\] ARMED'    1 -- bash tools/render/arms-companion1.sh literal-cleanup
# COMPANION-1c L1 (review r2 on #761): a byte-different --web copy is served, preflighted and booted through that tree's own launcher
step arm-cross-web-census   '^\[arm-cross-web-census\] ARMED'   1 -- bash tools/render/arms-companion1.sh cross-web-census
step_expect_fail arm-wrong-tree 'serves a different /sw.js' -- node tools/render/check-coplanar-pairs.mjs --web "$PWD/web" --tables chinese8_pro_9ft --expect-zero --perturb=wrong-tree
step_expect_fail arm-cdp-drop   'pending request rejected on close' -- node tools/render/check-coplanar-pairs.mjs --web "$PWD/web" --tables chinese8_pro_9ft --expect-zero --perturb=cdp-drop
# FENCE (maintainer law 2026-09-04; BUILD-3 review round 12 P2-c): per-table MESH (every geometry
# attribute) + FLAGS + MATERIAL (+ texture content) identity of every non-target table vs the
# committed base export tools/render/fixtures/fence-base-490/ (the MAIN merge base); then the arms.
mkdir -p /tmp/ob-census-490 /tmp/ob-census-490-arm
for T in wpa_generic_9ft wpa_spec_9ft diamond_redlabel_9ft diamond_proam_9ft predator_apex_9ft wpbsa_snooker_12ft umb_carom_284 pool_pro_9ft_measured joy_q8_9ft chinese8_pro_9ft; do
  step "census-$T" '^\[census-490\] wrote' 1 -- node tools/render/census-490-tables.mjs --table $T --web "$PWD/web" --out /tmp/ob-census-490/$T.json
done
step fence-judge   '^\[fence-490\] GREEN'                     12 -- python3 tools/render/fence-judge-490.py --base tools/render/fixtures/fence-base-490 --live /tmp/ob-census-490 --target chinese8_pro_9ft
NT=wpa_generic_9ft,wpa_spec_9ft,diamond_redlabel_9ft,diamond_proam_9ft,predator_apex_9ft,wpbsa_snooker_12ft,umb_carom_284,pool_pro_9ft_measured
for ARM in material normal flag; do
  for T in wpa_generic_9ft wpa_spec_9ft diamond_redlabel_9ft diamond_proam_9ft predator_apex_9ft wpbsa_snooker_12ft umb_carom_284 pool_pro_9ft_measured; do
    step "census-arm-$ARM-$T" '^\[census-490\] wrote' 1 -- node tools/render/census-490-tables.mjs --table $T --web "$PWD/web" --out /tmp/ob-census-490-arm/$T.json --perturb $ARM
  done
  step "fence-arm-$ARM" '^\[fence-490\] ARMED'               1 -- python3 tools/render/fence-judge-490.py --base tools/render/fixtures/fence-base-490 --live /tmp/ob-census-490-arm --target chinese8_pro_9ft --tables $NT --expect-red
done
# NOTE-FENCE-NORMALS (2026-09-09): one negative per geometry attribute class on one table — uv / tangent / color / groups
# (the same attr / groups comparison the normal arm exercises; the judge must read RED on the perturbed table)
mkdir -p /tmp/ob-census-490-arm1
for ARM in uv tangent color groups; do
  step "census-arm1-$ARM" '^\[census-490\] wrote' 1 -- node tools/render/census-490-tables.mjs --table wpa_generic_9ft --web "$PWD/web" --out /tmp/ob-census-490-arm1/wpa_generic_9ft.json --perturb $ARM
  step "fence-arm1-$ARM" '^\[fence-490\] ARMED' 1 -- python3 tools/render/fence-judge-490.py --base tools/render/fixtures/fence-base-490 --live /tmp/ob-census-490-arm1 --target chinese8_pro_9ft --tables wpa_generic_9ft --expect-red
done
echo "BATTERY-DONE ($STEPS steps green)"
