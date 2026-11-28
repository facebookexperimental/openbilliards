#!/bin/zsh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# GH-638 venue lighting — land41 VERDICT-ONLY re-derivation (orchestrator ruling 2026-09-15 08:5xZ, option (a)).
#
# Run 4 of resume 3 (driver /tmp/ob-land41-resume3.sh, sha256 prefix fd5120a5a944, mirrored at
# ~/ob-artifacts/lighting/tmp-scripts/ob-land41-resume3.sh) read `[chain41] VERDICT rc 1` for an INSTRUMENT reason: its B′₁ clause
# grepped the planted key uGiBallOn in output/lighting/check-ctrl-land41-bprime.log, but lighting-check-ctrl.sh:190 has the fence NAME
# the differing key only in the `$PFX-fence.md` it writes (--room-report --program-report); the check-ctrl log carries the fence's exit
# and word alone. The plants read exactly as designed (B′₁ fence.md: `material.injected.uGiBallOn` 1 → 'MISSING'; B′₂: 1 → 0).
#
# This driver re-derives the verdict from run 4's OWN record lines — no boot, no step re-run, nothing re-measured — with the SAME
# verdict() as run 4's driver and EXACTLY ONE change (the key check reads the fence md the fence writes), printed as a diff against
# run 4's driver into the record. Every parsed value is cross-checked against the file it names; any missing input REFUSES (exit 2,
# no verdict, no rc). The self-test rule (the lesson of run 4): every `-n VAR` guard in verdict() is SET in every cell here — the
# inputs are the record's, never stubbed — and a guard no cell sets leaves its clause UNVERIFIED by construction (the driver lists the
# guards and their values). Two cells, receipts beside the verdict, neither writes the record rc or the record log:
#   cell A   OB_CHAIN_SELFTEST=A-plantedfence      a COPY of the record (`--build-cell <dir> fence`) whose B′₁ fence md has every uGiBallOn
#            line removed → MUST read rc 1 ("planted control B' did not read");
#   cell A2  OB_CHAIN_SELFTEST=A2-plantedprobe     a COPY (`--build-cell <dir> probe`) whose Q698 probe verdict file is FABRICATED to name the
#            lane (LANE-CAUSED) → the atelier word not granted → MUST read rc 1 ("gate ATRC exit 1");
#   cell A3  OB_CHAIN_SELFTEST=A3-plantedstatic    a COPY (`--build-cell <dir> static`) whose static path check names a LANE hunk (the
#            lane-owned web/app/main.js planted onto the Q698 path list) → not granted → MUST read rc 1;
#   cell A4  OB_CHAIN_SELFTEST=A4-plantedruledarm  a COPY (`--build-cell <dir> ruledarm`) whose ruled-arms file names an arm other than
#            B2/H → not granted → MUST read rc 1;
#   cell A5  OB_CHAIN_SELFTEST=A5-plantedrulednostatic a COPY (`--build-cell <dir> rulednostatic`) whose B2 ruling entry lacks its
#            static-check files → not granted → MUST read rc 1;
#   cell A6  OB_CHAIN_SELFTEST=A6-plantednonrepo    a COPY (`--build-cell <dir> nonrepo`) that also carries a copy of THIS driver under
#            <dir>/tools/render/ and runs it from there, so LANE_ROOT is a NON-REPO path: every git call fails → the static checks
#            'could not run' → UNJUDGEABLE-INSTRUMENT, the word not granted → MUST read rc 1 by name (FIX11 L3);
#   cell A7  OB_CHAIN_SELFTEST=A7-plantedwindow     a COPY (`--build-cell <dir> window`) whose q698-window-plant.txt points the H window check at a
#            copy of e2e-atelier.mjs with ONE planted line inside the tap→floatPerf window → the H set-aside NOT granted, named → MUST read rc 1 (L5 ruling);
#   cell A8  OB_CHAIN_SELFTEST=A8-plantedwindowfile a COPY (`--build-cell <dir> windowfile`) that carries a q698-window-plant.txt while NOT being cell A7:
#            the plant is not honoured, the H set-aside is refused by name ('plant file present …') → MUST read rc 1 (FIX12 M4); with
#            OB_CHAIN_SELFTEST unset the whole pass REFUSES by name before any verdict;
#   GATE-JSON CELLS (A9–A19 and the A9ARM arms): every plant goes through plant_gate_json(), which writes the copy under `with open` and restores the RECORD
#   json's mtime (utime in ns from the record's own stat, re-stat, printed equality, a proof sidecar naming the plant beside the json) so the Q2 binding reads
#   BOUND and the cell reaches the term it was built for. TWO builders leave the mtime at NOW, by name: A16 (plant unbound — the binding IS its term; A16 is
#   bound to that plant through the sidecar) and the arm A9ARM-unrestored (plant gatearm-unrestored). Each cell has EXPECTED (term, planted id) PAIRS (table
#   in cell_receipt): THIS run's full '[chain41] GATE CLASSIFICATION (final regate):' line is PARSED left to right — term name, ': ', 'none' or a python list
#   literal consumed whole by ast.literal_eval, '; ' — and the planted id must be IN that term's list (never a substring over the line: row ids are free text).
#   A16/A17 pin the WORD (UNJUDGEABLE-INSTRUMENT) and the reason phrase. EVERY FACT A LATER READER CONSUMES IS A STRUCTURED FIELD the row ids cannot reach
#   (FIX18 V1/V2, C1): verdict() (frozen: run 4's function + the two ruled hunks) writes the selftest rc file; cell_receipt books it, bound to this
#   run by mtime, as chain-land41-selftest.verdict.json {rc, start}; refuse() writes chain-land41-selftest.refused {phase, start, reason} before exit 2;
#   stale per-run files older than this run are removed at run START; cell_receipt honours a marker only if its start == this run's (cross-checked against the verdict json's absence — disagreement reads INCONSISTENT, exit 3)
#   and books output/lighting/cell-<name>/cell-validity.json {cell, validity_word, expected_pairs, parsed_terms, rc_verdict, rc_file, exit, refused,
#   refusal_reason, driver_sha, start_utc, receipt_start_utc}; the chain line keeps the human text; the renderer reads validity ONLY from that json.
#   Booking is atomic and non-destructive (V3, C2): temp dir under the SAME output/lighting → files + json → rename dst→.prev → rename tmp→dst → chain append
#   (the LAST fallible write) → rmtree .prev; a failure between the renames rolls .prev back; a failed append is its own phase ('chain append failed; receipt dir
#   booked, no chain line'); any other failure leaves the previous dir intact and reads 'REFUSED (record not written at phase …) — unrecorded', exit 2; any exception in the receipt
#   step reads 'REFUSED (receipt step failed …)', exit 2 (V4); the word line and the rc file are written only after the booking. FOUR-WAY EXIT CONTRACT of a
#   cell run: exit 0/1 = a verdict (RED-VALID when rc 1 AND every pair is found; B reads its own rc); exit 2 = REFUSED (the marker names the phase: refuse |
#   record-unwritable | receipt-step; the trap re-exits the original status for refuse()); exit 3 = INVALID-CELL (did not reach its term) — a verdict exists
#   and a pair is absent (also ARM-BROKEN and INCONSISTENT); exit 4 = --build-cell failure. The validity word and the exit are computed in EVERY cell run; only
#   the booking is gated by OB_L41V_RECORD_DIR. Arm bindings by SHAPE (V5): A9ARM-unrestored → 'INVALID-CELL (did not reach its term) — as this ARM expects'
#   (exit 1) iff its sidecar names plant gatearm-unrestored AND its json carries the id ARM-force-silent-record as a SILENT ARM (arm true, arm_ok false, record
#   true) AND the word is UNJUDGEABLE-INSTRUMENT 'is OUTSIDE the gate step window' AND the silent-arms term did not name the row — arm_ok true under that id
#   reads ARM-BROKEN; A9ARM-forgedid / A9ARM-forgedvalid → the same expected word iff the forged id is in the value-fail list while the silent-arms list lacks
#   ARM-force-silent-record; A9ARM-extrasilent and A9ARM-refusingid → RED-VALID (a two-id list; an id carrying the REFUSING phrase is data). Cells A–A8, B and
#   the record pass keep their FIX15 line shape (no validity word unless REFUSED). (FIX16 S1 + CORRIGENDUM-1 + FIX17 R2–R4 + FIX18 V1–V8, Z2 typed validity_class / arm_expected + sanitized words, Z3 run-id scoping, Z4 json after the append, Z5 build exit 4, Z7(b′) non-finite measured on any judged row is a missing read except a self-consistent boolean check; FIX19 F2(b) RUN_ID-keyed staging + /tmp scratch, orphan staging REFUSES by name, F4(a) failure branches assign the final fact, F4(b) the boolean rule is the producer's judge() on 1/0, F4(c) exempt rows excluded from the boolean count)
#   cell A9  OB_CHAIN_SELFTEST=A9-plantedgatearm    a COPY (`--build-cell <dir> gatearm`) whose gate json carries a silent-arm record row (the
#            --force-silent-record shape) beside the three exempted rows → binding BOUND, then the term 'silent or broken arms' names it, FRC not lifted,
#            VERDICT rc 1 naming the final regate while the atelier word is granted (FIX13 N1);
#   cell A10 OB_CHAIN_SELFTEST=A10-plantedmissrec   a COPY (`--build-cell <dir> missrec`) whose gate json carries a RECORD row with a missing read → FAIL naming it, rc 1 (FIX14 O1);
#   cell A11 OB_CHAIN_SELFTEST=A11-plantedundecl    a COPY (`--build-cell <dir> undecl`) whose gate json carries an UNDECLARED-UNARMED judged row → FAIL naming it, rc 1;
#   cell A12 OB_CHAIN_SELFTEST=A12-plantedspliced   a COPY (`--build-cell <dir> spliced`) whose gate json carries one row of EACH kind (silent record arm, missing-read record row,
#            undeclared-unarmed judged row, value-failing judged row, a declared row with its reverse pin broken) → FAIL naming every one, rc 1;
#   cell A13 OB_CHAIN_SELFTEST=A13-plantedexemptmiss the exempt-name row '…-degrade' with measured null → SURVIVES on column c (value failure), rc 1 (FIX15 Q1);
#   cell A14 OB_CHAIN_SELFTEST=A14-plantedexemptdup  a second '…-degrade' row from ANOTHER table whose source carries the token → SURVIVES on b (identity) and d (duplicate), rc 1;
#   cell A15 OB_CHAIN_SELFTEST=A15-plantedrecnokey   a record row WITHOUT a measured key → 'record rows with a missing read', rc 1;
#   cell A16 OB_CHAIN_SELFTEST=A16-plantedunbound    the gate json's mtime moved outside the regate's gate step window → UNBOUND → UNJUDGEABLE-INSTRUMENT, rc 1 (FIX15 Q2);
#   cell A17 OB_CHAIN_SELFTEST=A17-plantedzerofail   the three exempt rows made passing (mtime restored) beside the regate's exit 3 → UNJUDGEABLE-INSTRUMENT, never PASS, rc 1;
#   cell A18 OB_CHAIN_SELFTEST=A18-plantedexemptnonnum the three exempt rows given a NON-numeric measured ('abc', NaN, true) with pass:true → each SURVIVES on column c, rc 1 (FIX16 S5);
#   cell A19 OB_CHAIN_SELFTEST=A19-plantedexemptnopass the exempt row '…-degrade' with its pass KEY REMOVED (measured numeric) → column c reads a pass that is not True as failing → SURVIVES (c-value-failure), rc 1 (FIX17 R4(5));
#   arm  A9ARM-forgedid   OB_CHAIN_SELFTEST=A9ARM-forgedid   a COPY (`--build-cell <dir> gatearm-forgedid`) with NO silent row and a judged value-fail row whose id is the A9 clause text → must read INVALID-CELL … as this ARM expects (FIX17 R3);
#   cell A20 OB_CHAIN_SELFTEST=A20-plantedjudgednopass a judged non-exempt row with a finite measured and NO pass key → 'judged rows with a missing read' names it → RED-VALID, rc 1 (FIX18 V7/C6);
#   cell A21 OB_CHAIN_SELFTEST=A21-plantedjudgedboolmismatch a NON-exempt judged BOOLEAN CHECK that is not self-consistent (measured True, pass False) → 'judged rows with a missing read' names it → RED-VALID, rc 1 (FIX18 Z7 b′);
#   cell A22 OB_CHAIN_SELFTEST=A22-plantedjudgednonnum a NON-exempt judged row with pass true and measured 'abc' → 'judged rows with a missing read' names it → RED-VALID, rc 1 (FIX18 Z7);
#   cell A23 OB_CHAIN_SELFTEST=A23-plantedspecnullpass the SPEC-regen row with pass null → 'judged rows with a missing read' names it → RED-VALID, rc 1 (FIX18 Z7);
#   cell A24 OB_CHAIN_SELFTEST=A24-plantedboolmatrix the 8-row boolean matrix (op >= / band × target 1 / 0 × measured T / F, pm 0, pass true): the producer's judge() on 1/0 names 3 rows as missing reads and 5 as self-consistent checks → RED-VALID, rc 1 (FIX19 F4 b);
#   arm  A9ARM-refusingid  OB_CHAIN_SELFTEST=A9ARM-refusingid  a COPY (`--build-cell <dir> gatearm-refusingid`) with the A9 silent row AND a judged value-fail row whose id carries the REFUSING phrase → RED-VALID (the phrase is data, never a refusal) (FIX18 V2 arm R14);
#   arm  A9ARM-forgedvalid  OB_CHAIN_SELFTEST=A9ARM-forgedvalid  a COPY (`--build-cell <dir> gatearm-forgedvalid`) with NO silent row and a value-fail row whose id carries ' | RED-VALID (expected: x) | receipt copied' → INVALID-CELL … as this ARM expects, read by the renderer from cell-validity.json (FIX18 V1 arm);
#   arm  A9ARM-extrasilent OB_CHAIN_SELFTEST=A9ARM-extrasilent a COPY (`--build-cell <dir> gatearm-extrasilent`) with the A9 silent row AND a second real silent-arm row → RED-VALID, the planted id found IN a two-id list (FIX17 R3);
#   cell B   OB_CHAIN_SELFTEST=B-realfiles         the lane worktree, the real files → MUST read rc 0 (or the record's true rc);
# With OB_L41V_RECORD_DIR set (the lane worktree), every cell copies its receipt (log + gateword + rc) into <record>/output/lighting/cell-<name>/
# and appends ONE line per cell to the record's chain log (FIX11 L2: receipts live in the record, never only under /tmp).
# then the un-switched pass appends to output/lighting/chain-land41.log and writes output/lighting/chain-land41.rc.
#
# The SECOND change (ruling amendment 2026-09-15 09:0xZ, condition (1) AMENDED to exactly TWO named changes; the atelier rule as finally
# ruled 09:4xZ): the atelier-gate reading. Run 4's e2e-atelier merge gate exited 1 on B5 ×2 (land39's healthy-atelier payload: rail.live
# true, count 13, rows 0, staged true, card false) and Q698 ×2 (main's own arm, commits 30ae500c GH-698 / 491487cd GH-712, folded in by
# the merge 5838a3fd); a second run on the same export read Q698 red again (667x375) plus B2 ×1 and H ×1 (main's timing arms, green in
# run 4 and in main's CI). Main's CI for the same 7b838c06 on this runner (run 34868564371, job 104058477367) reads Q698 OK (its reds:
# A ×2, Q712), so INHERITED-RED is not available; the fresh-main export run died in main's arm D before Q698 (issue #838). Mechanism read
# from main's code: shell.js mounts the prompt and adds ob-shell-decision-up in one call; the yield rule delays visibility by --ob-t-fast
# (120 ms) as a CSS transition, which starts at the first style flush; the arm sleeps a fixed 200 ms and its own getComputedStyle is the
# flush when no frame rendered in between — a starved-renderer detector. Whose starvation it is was MEASURED page-side by
# tools/render/lighting-q698-probe.mjs (positive control first; 5 interleaved boots per tree; decision rule fixed numerically before the
# run). classify_atelier (a SCRIPT, not an eye) grants the ruled word iff ALL of: (1) run 4's B5 rows read by the land39 phase-3
# instrument UNCHANGED and no FAIL arm outside {B5, Q698} in run 4; (2) run 2 is in the record and every red arm outside {B5, Q698} in it
# is set aside BY A NAMED RULING in output/lighting/q698-run2-ruled-arms.txt — only B2 and H may be named, each entry carries its
# static-check files and the classifier RECOMPUTES `git diff --stat 7b838c06..0ba17deb -- <files>` (must be EMPTY); (3) main's CI job
# log prints Q698 OK; (4) the Q698 STATIC PATH CHECK: every web/app file that defines or styles what the census reads is enumerated by
# grep, the lane's diff over them is EMPTY, no lane-owned file is on the list, no lane hunk of web/app/main.js names one of those
# identifiers; (5) the probe's verdict file output/lighting/q698-probe-verdict.txt reads FLAKE-NAMED (positive control seen) — the word
# carries that file's sha256. ATRC is treated 0 for the verdict ONLY under exactly that word; anything else → the gate stays red, rc 1.
# FIX11 L3: every git call's returncode is checked — a git that could not run reads 'static path check could not run: git rc N: <stderr>' and
# the classification is UNJUDGEABLE-INSTRUMENT (never EMPTY, never granted). FIX11 L5: a ruled-arms entry may carry `window: <file> from "<anchor A>" to
# "<anchor B>"` — the classifier resolves the anchors in the WORKING TREE file, diffs the file against 7b838c06 (working tree, -U0) and requires that no
# hunk touches a line inside the window (the measured window is main's verbatim); H's entry names arm H's tap→floatPerf-read window in e2e-atelier.mjs.
#
# Usage (from a directory whose output/lighting/ holds the record):
#   zsh tools/render/lighting-land41-verdict.sh                       # the record pass
#   OB_CHAIN_SELFTEST=B-realfiles zsh tools/render/lighting-land41-verdict.sh
#   zsh tools/render/lighting-land41-verdict.sh --build-cell /tmp/ob-l41v-cellA fence && ( cd /tmp/ob-l41v-cellA && OB_CHAIN_SELFTEST=A-plantedfence zsh <this file> )
#   … --build-cell <dir> probe | static | ruledarm | rulednostatic (cells A2 … A5)
setopt nullglob
set +e
SELF=${0:A}
RUN4_DRIVER=${OB_L41V_RUN4_DRIVER:-$HOME/ob-artifacts/lighting/tmp-scripts/ob-land41-resume3.sh}
RUN4_SHA_PREFIX=fd5120a5a944
SEG_START='RESUME 3 START 2026-09-15T06:41:17Z'
L=output/lighting/chain-land41.log
RCFILE=output/lighting/chain-land41.rc
ST="${OB_CHAIN_SELFTEST:-unset}"

# ---------------------------------------------------------------- cell builder: a COPY of the record with ONE planted negative (fence | probe | static | ruledarm | rulednostatic)
if [ "${1:-}" = --build-cell ]; then
  [ -n "${2:-}" ] && [ -n "${3:-}" ] || { echo "[cell] BUILD FAILED: usage --build-cell <dir> <plant> (exit 4)"; exit 4; }   # FIX18 Z5
  D=${2:?dir}; PLANT=${3:?plant: fence | probe | static | ruledarm | rulednostatic | nonrepo | window | windowfile | gatearm | gatearm-unrestored | missrec | undecl | spliced | exemptmiss | exemptdup | recnokey | unbound | zerofail | exemptnonnum | exemptnopass | gatearm-forgedid | gatearm-extrasilent | gatearm-refusingid | gatearm-forgedvalid | gatearm-notsilent-unrestored | judgednopass | judgedboolmismatch | judgednonnum | specnullpass | boolmatrix}; /usr/local/bin/python3 - "$D" "$PLANT" <<'PY'
import sys as _sys, os as _os
def _build_hook(t, v, tb):  # FIX18 Z5: ANY exception in the builder is a build failure, exit 4 (never 1, never a bare traceback exit)
    print(f'[cell] BUILD FAILED: {t.__name__}: {str(v)[:200]}', flush=True); _os._exit(4)
_sys.excepthook = _build_hook
import os, sys, shutil, re, json
d, plant = sys.argv[1], sys.argv[2]; src = 'output/lighting'; dst = os.path.join(d, 'output/lighting')
if plant not in ('fence', 'probe', 'static', 'ruledarm', 'rulednostatic', 'nonrepo', 'window', 'windowfile', 'gatearm', 'gatearm-unrestored', 'missrec', 'undecl', 'spliced', 'exemptmiss', 'exemptdup', 'recnokey', 'unbound', 'zerofail', 'exemptnonnum', 'exemptnopass', 'gatearm-forgedid', 'gatearm-extrasilent', 'gatearm-refusingid', 'gatearm-forgedvalid', 'gatearm-notsilent-unrestored', 'judgednopass', 'judgedboolmismatch', 'judgednonnum', 'specnullpass', 'boolmatrix'): print(f'[cell] unknown plant {plant}'); sys.exit(4)
if os.path.isdir(d):
    for root_, dirs, files in os.walk(d):
        for x in dirs: os.chmod(os.path.join(root_, x), 0o755)
    shutil.rmtree(d)
os.makedirs(dst)
files = ['chain-land41.log', 'chain-land41.gateword', 'seal-land41-regate-final.log', 'check-ctrl-land41-bprime.log', 'check-ctrl-land41-bprime2.log',
         'check-ctrl-land41-bprime-fence.md', 'check-ctrl-land41-bprime2-fence.md', 'land41-atelier.log', 'land41-atelier-run2.log',
         'ci-34868564371-e2e-atelier-job104058477367.log', 'land41-pass2.log', 'land41-fullview.log', 'land41-sinkrest.log', 'gate-land41.json',
         'q698-probe-l41.jsonl', 'q698-probe-verdict.txt', 'q698-run2-ruled-arms.txt']
optional = ['atelier-mainfresh-7b838c06.log']
files += [f for f in os.listdir(src) if re.match(r'seal-land41-arm-.*\.log$', f)]
for f in files:
    q = os.path.join(src, f)
    if not os.path.exists(q): print(f'[cell] MISSING source {q}'); sys.exit(4)
    shutil.copy2(q, os.path.join(dst, f))
for f in optional:
    q = os.path.join(src, f)
    if os.path.exists(q): shutil.copy2(q, os.path.join(dst, f))
for sset in ('after-land41-studioqueuelonglegacy.attempt3-stall8583-kept', 'after-land41-studioqueuelonglegacy', 'diag-l41-studioqueuelonglegacy-Aroot'):
    c = os.path.join(src, sset, 'default/predator_apex_9ft/studioqueue/census.json')
    if not os.path.exists(c): print(f'[cell] MISSING census {c}'); sys.exit(4)
    os.makedirs(os.path.dirname(os.path.join(dst, sset, 'default/predator_apex_9ft/studioqueue/census.json')), exist_ok=True)
    shutil.copy2(c, os.path.join(dst, sset, 'default/predator_apex_9ft/studioqueue/census.json'))
def plant_gate_json(mutate, restore=True, why=''):
    # FIX16 S1(a) + CORRIGENDUM-1 C4: the ONE way a cell plants the gate json — load, mutate, write under `with open` (a handle still open when utime runs would
    # make the mtime NOW silently), then restore the RECORD json's mtime in ns from the record's own stat, re-stat and print the equality; only plant 'unbound'
    # (cell A16) passes restore=False, by name, because the binding IS its term. The proof is written beside the json so the cell's receipt can re-state it.
    gp = os.path.join(dst, 'gate-land41.json'); rst = os.stat(os.path.join(src, 'gate-land41.json'))
    with open(gp) as fh: G = json.load(fh)
    rows = mutate(G) or []
    with open(gp, 'w') as fh: json.dump(G, fh)
    if restore:
        os.utime(gp, ns=(rst.st_atime_ns, rst.st_mtime_ns)); now = os.stat(gp)
        print(f"[cell] gate json planted ({why}): {[r.get('id') for r in rows] if rows else 'rows edited in place'}; json mtime restored {now.st_mtime_ns} == record {rst.st_mtime_ns}")
        assert now.st_mtime_ns == rst.st_mtime_ns, ('json mtime NOT restored', now.st_mtime_ns, rst.st_mtime_ns)
        proof = f'json mtime restored {now.st_mtime_ns} == record {rst.st_mtime_ns}'
    else:
        os.utime(gp, None); now = os.stat(gp)
        print(f"[cell] gate json planted ({why}) with its mtime left at NOW ({now.st_mtime_ns}; record {rst.st_mtime_ns}) — this cell's term IS the binding")
        proof = f"json mtime left at NOW {now.st_mtime_ns} (record {rst.st_mtime_ns}) — the binding is this cell's term"
    with open(gp + '.mtime-proof', 'w') as fh: fh.write(f'{plant}: {proof}\n')
    return rows
if plant == 'fence':
    # the B′₁ fence md loses every line naming the key — the B′₁ clause must then read rc 1
    f1 = os.path.join(dst, 'check-ctrl-land41-bprime-fence.md'); lines = open(f1).read().split('\n'); kept = [l for l in lines if 'uGiBallOn' not in l]
    open(f1, 'w').write('\n'.join(kept)); print(f'[cell] built {d} (plant fence): {len(files)} record files + 3 census files; the planted fence md dropped {len(lines) - len(kept)} uGiBallOn line(s)')
elif plant == 'probe':
    # the probe verdict file is FABRICATED to name the lane — the atelier word must NOT be granted, rc 1 (the ruling's planted negative)
    f2 = os.path.join(dst, 'q698-probe-verdict.txt'); real = open(f2).read().split('\n')[0]
    open(f2, 'w').write('LANE-CAUSED\n[q698-analyze] VERDICT LANE-CAUSED — PLANTED (cell A2): a fabricated probe result naming the lane; the real file read ' + real + '\n')
    print(f'[cell] built {d} (plant probe): {len(files)} record files + 3 census files; the planted probe verdict reads LANE-CAUSED (real: {real})')
elif plant == 'ruledarm':
    # the ruled-arms file names an arm other than B2/H — a ruling text cannot set aside an arm the ruling did not name, rc 1
    f3 = os.path.join(dst, 'q698-run2-ruled-arms.txt'); open(f3, 'a').write('D | PLANTED (cell A4): an arm the ruling did not name | files: web/app/shell.js\n')
    print(f'[cell] built {d} (plant ruledarm): {len(files)} record files + 3 census files; the ruled-arms file gained a line naming arm D')
elif plant == 'window':
    # ONE planted line inside arm H's tap→floatPerf window of a COPY of e2e-atelier.mjs; q698-window-plant.txt points the classifier's window check at that copy
    src_f = 'web/tools/e2e-atelier.mjs'; lines = open(src_f, errors='replace').read().split('\n')
    anchor = "for (const [ix, id] of ['low_deflection', 'standard'].entries())"; ia = next((i for i, l in enumerate(lines) if anchor in l), None)
    if ia is None: print('[cell] the window anchor was not found in web/tools/e2e-atelier.mjs'); sys.exit(4)
    lines.insert(ia + 1, '      await sleep(1); // PLANTED (cell A7): a lane line INSIDE the tap→floatPerf window — the H set-aside must refuse it by name')
    os.makedirs(os.path.join(d, 'web/tools'), exist_ok=True); pf = os.path.join(d, 'web/tools/e2e-atelier.mjs'); open(pf, 'w').write('\n'.join(lines))
    open(os.path.join(dst, 'q698-window-plant.txt'), 'w').write(pf + '\n'); print(f'[cell] built {d} (plant window): {len(files)} record files + 3 census files; q698-window-plant.txt → {pf} (one line planted after the window anchor)')
elif plant in ('gatearm', 'gatearm-unrestored', 'gatearm-forgedid', 'gatearm-extrasilent', 'gatearm-refusingid', 'gatearm-forgedvalid', 'gatearm-notsilent-unrestored'):
    # FIX13 N1 / cell A9: the gate json gains lighting-gate.py --force-silent-record's synthetic row (pass:true, record:true, arm:true, arm_ok:false) beside the
    # three exempted rows — the reclassification must NOT lift it: the gate word stays FAIL, FRC stays 3, the VERDICT reads rc 1 naming the final regate,
    # while the atelier word is still granted (the arm failure is not lifted by another term's grant)
    silent_row = {'id': 'ARM-force-silent-record', 'pass': True, 'record': True, 'arm': True, 'arm_ok': False, 'measured': 0, 'target': 0, 'arm_value': 0, 'arm_cause': 'NOT-AN-ARM', 'arm_txt': '0.0000 → NOT-AN-ARM (synthetic)', 'note': 'PLANTED (cell A9): the --force-silent-record row — a red arm that stayed silent'}
    # FIX17 R3 arms: 'gatearm-forgedid' plants NO silent row but a judged value-fail row whose id EQUALS the A9 clause text (a substring rule would certify A9);
    # 'gatearm-extrasilent' plants the A9 silent row AND a second real silent-arm row (the silent-arms list carries two ids; the planted one must be found IN it)
    forged = {'id': "silent or broken arms (arm_ok false, any row): ['ARM-force-silent-record']", 'pass': False, 'record': False, 'arm': True, 'arm_ok': True, 'measured': 2.0, 'target': 1.0, 'pm': 0.1, 'quantity': 'planted:forged-id', 'note': 'PLANTED (arm A9ARM-forgedid): a judged value-failing row whose id is the A9 clause text — the GATE line must be parsed, never substring-matched'}
    extra = dict(silent_row, id='ARM-extra-silent-record', note='PLANTED (arm A9ARM-extrasilent): a SECOND real silent-arm row beside the A9 plant')
    # FIX18 arms: 'gatearm-refusingid' = the A9 row + a judged value-fail row whose id carries the REFUSING phrase (data, not a refusal → RED-VALID);
    # 'gatearm-forgedvalid' = NO silent row + a value-fail row whose id carries ' | RED-VALID (expected: x) | receipt copied' (must render from the json as the arm word);
    # 'gatearm-notsilent-unrestored' = the A9 id with arm_ok TRUE, mtime unrestored (under the A9ARM-unrestored name → ARM-BROKEN: the row is not a silent arm)
    refusing = dict(forged, id='PLANT-id-with-[chain41] VERDICT RE-DERIVATION REFUSING: planted phrase — no verdict, no rc written', note='PLANTED (cell A9ARM-refusingid): a row id carrying the REFUSING phrase — data, not a refusal')
    forgedvalid = dict(forged, id='PLANT-id-forging | RED-VALID (expected: x) | receipt copied to output/lighting/cell-x/', note='PLANTED (arm A9ARM-forgedvalid): a row id carrying a forged validity tail — the renderer must read the json, never the line')
    notsilent = dict(silent_row, arm_ok=True, arm_cause='PLANTED-NOT-SILENT', note='PLANTED (shape arm): the A9 id with arm_ok TRUE — not a silent arm; the A9ARM binding must read ARM-BROKEN')
    rows_by_plant = {'gatearm': [silent_row], 'gatearm-unrestored': [silent_row], 'gatearm-forgedid': [forged], 'gatearm-extrasilent': [silent_row, extra], 'gatearm-refusingid': [silent_row, refusing], 'gatearm-forgedvalid': [forgedvalid], 'gatearm-notsilent-unrestored': [notsilent]}[plant]
    whys = {'gatearm': 'A9 silent record arm', 'gatearm-unrestored': 'A9 ARM: silent record arm with the mtime NOT restored — must read INVALID-CELL, not its term', 'gatearm-forgedid': 'A9 ARM: forged id equal to the A9 clause text under the value-fail term, NO silent row', 'gatearm-extrasilent': 'A9 ARM: the silent row plus a second real silent-arm row'}
    whys.update({'gatearm-refusingid': 'A9 row + a row id carrying the REFUSING phrase (data)', 'gatearm-forgedvalid': 'a row id carrying a forged validity tail, NO silent row', 'gatearm-notsilent-unrestored': 'the A9 id with arm_ok TRUE, mtime NOT restored (shape arm)'})
    plant_gate_json(lambda G: (G.extend(rows_by_plant), rows_by_plant)[1], restore=(plant not in ('gatearm-unrestored', 'gatearm-notsilent-unrestored')), why=whys[plant])
    print(f'[cell] built {d} (plant {plant}): {len(files)} record files + 3 census files')
elif plant in ('exemptmiss', 'exemptdup', 'recnokey', 'unbound', 'zerofail', 'exemptnonnum', 'exemptnopass'):
    # FIX15 Q1/Q2 cells A13–A17 and FIX16 S5 cell A18 — every plant through the one helper; 'unbound' is the only unrestored mtime
    ex = 'C2F-queuelong-legacy-asserts-degrade'; three = ('C2F-queuelong-legacy-asserts-bakes-one', 'C2F-queuelong-legacy-asserts-degrade', 'C2F-queuelong-legacy-asserts-unbounded')
    def mut(G):
        out = []
        if plant == 'exemptmiss':
            for r in G:
                if r['id'] == ex: r['measured'] = None; r['pass'] = False; r['note'] = 'PLANTED (cell A13): the exempt-name row with NO read — column c must refuse it'; out.append(r)
        elif plant == 'exemptdup':
            row = {'id': ex, 'pass': False, 'record': False, 'arm': True, 'arm_ok': True, 'measured': 0, 'target': 1, 'pm': 0, 'table': 'wpa_spec_9ft@studioqueue', 'quantity': 'census:contract:venueBudgetDegrade', 'source': 'studioqueuelonglegacy studioqueue census; arm = studioqueuelong (0) — ANOTHER table (planted)', 'note': 'PLANTED (cell A14): an exempt-name row from another table whose source carries the token — columns b (identity) and d (duplicate) must refuse it'}
            G.append(row); out.append(row)
        elif plant == 'recnokey':
            row = {'id': 'PLANT-record-no-measured-key', 'pass': True, 'record': True, 'arm': False, 'arm_note': 'record row', 'target': 0.0, 'quantity': 'planted:nokey', 'note': 'PLANTED (cell A15): a record row WITHOUT a measured key — a missing read'}
            G.append(row); out.append(row)
        elif plant == 'zerofail':
            for r in G:
                if r['id'] in three: r['pass'] = True; r['note'] = 'PLANTED (cell A17): the exempt rows made passing — a zero-failure json beside a regate exit 3 must read UNJUDGEABLE-INSTRUMENT, never PASS'; out.append(r)
        elif plant == 'exemptnopass':
            # FIX17 R4(5): the exempt row with its pass KEY REMOVED (measured numeric) — column c must read 'pass is not True' as failing → SURVIVES
            for r in G:
                if r['id'] == ex: r.pop('pass', None); r['note'] = 'PLANTED (cell A19): the exempt row without a pass key — column c must refuse it'; out.append(r)
        elif plant == 'exemptnonnum':
            # FIX16 S5: NON-finite measured on exempt-name rows WITH pass:true — 'abc' (a str), NaN, and a bool — every one must SURVIVE on column c whatever pass says
            variants = {three[0]: 'abc', three[1]: float('nan'), three[2]: True}
            for r in G:
                if r['id'] in variants: r['measured'] = variants[r['id']]; r['pass'] = True; r['note'] = 'PLANTED (cell A18): non-numeric measured with pass:true — column c must refuse it'; out.append(r)
        return out
    plant_gate_json(mut, restore=(plant != 'unbound'), why=plant); print(f'[cell] built {d} (plant {plant}): {len(files)} record files + 3 census files')
elif plant == 'judgednopass':
    # FIX18 C6 / V7 cell A20: a judged, non-exempt row with a finite measured and NO pass key — classify_gate must name it under 'judged rows with a missing read'
    row = {'id': 'PLANT-judged-no-bool-pass', 'record': False, 'arm': True, 'arm_ok': True, 'measured': 0.5, 'target': 0.5, 'pm': 0.1, 'quantity': 'planted:nobool', 'note': 'PLANTED (cell A20): a judged row without a boolean pass — a missing read, whatever its measured value'}
    plant_gate_json(lambda G: (G.append(row), [row])[1], why='A20: judged row without a boolean pass'); print(f'[cell] built {d} (plant judgednopass): {len(files)} record files + 3 census files')
elif plant == 'judgedboolmismatch':
    # FIX18 Z7(b′) cell A21: a NON-exempt judged boolean check that is NOT self-consistent (measured True, pass False, target 1) — a missing read
    row = {'id': 'PLANT-judged-bool-mismatch', 'record': False, 'arm': True, 'arm_ok': True, 'pass': False, 'measured': True, 'target': 1, 'pm': 0, 'quantity': 'planted:boolmismatch', 'note': 'PLANTED (cell A21): a boolean check whose pass disagrees with its measured — not self-consistent'}
    plant_gate_json(lambda G: (G.append(row), [row])[1], why='A21: boolean check with pass != measured'); print(f'[cell] built {d} (plant judgedboolmismatch): {len(files)} record files + 3 census files')
elif plant == 'boolmatrix':
    # FIX19 F4(b) cell A24: the boolean matrix op ∈ {'>=', 'band'} × target ∈ {1, 0} × measured ∈ {True, False}, pm 0, pass true on every row — the producer's
    # judge() on 1/0 decides: 5 rows self-consistent, 3 rows ('>=' t1 mF, 'band' t1 mF, 'band' t0 mT) are missing reads
    rows = []
    for op, tag in (('>=', 'ge'), ('band', 'band')):
        for t in (1, 0):
            for m in (True, False):
                rows.append({'id': f'PLANT-bool-{tag}-t{t}-m{"T" if m else "F"}', 'record': False, 'arm': True, 'arm_ok': True, 'pass': True, 'measured': m, 'op': op, 'target': t, 'pm': 0, 'quantity': 'planted:boolmatrix', 'note': 'PLANTED (cell A24): boolean matrix row'})
    plant_gate_json(lambda G: (G.extend(rows), rows)[1], why='A24: the 8-row boolean matrix'); print(f'[cell] built {d} (plant boolmatrix): {len(files)} record files + 3 census files')
elif plant == 'judgednonnum':
    # FIX18 Z7 cell A22: a judged, NON-exempt row with pass true and measured 'abc' — a non-finite measured is a missing read whatever pass says
    row = {'id': 'PLANT-judged-nonnum-measured', 'record': False, 'arm': True, 'arm_ok': True, 'pass': True, 'measured': 'abc', 'target': 0.5, 'pm': 0.1, 'quantity': 'planted:nonnum', 'note': 'PLANTED (cell A22): a non-exempt judged row whose measured is a str — never a measurement'}
    plant_gate_json(lambda G: (G.append(row), [row])[1], why='A22: non-exempt judged row with a non-finite measured'); print(f'[cell] built {d} (plant judgednonnum): {len(files)} record files + 3 census files')
elif plant == 'specnullpass':
    # FIX18 Z7 cell A23: the SPEC-regen row with pass null — a non-bool pass on the regen row is a missing read
    def mut(G):
        out = []
        for r in G:
            if r.get('id') == 'SPEC-regen': r['pass'] = None; r['note'] = 'PLANTED (cell A23): SPEC-regen with pass null'; out.append(r)
        return out
    plant_gate_json(mut, why='A23: SPEC-regen pass null'); print(f'[cell] built {d} (plant specnullpass): {len(files)} record files + 3 census files')
elif plant in ('missrec', 'undecl', 'spliced'):
    # FIX14 O1 cells A10 / A11 / A12: rows lighting-gate.py itself fails, spliced into a copy's gate json — the positive exemption must name each
    G = json.load(open(os.path.join(dst, 'gate-land41.json')))
    missrec = {'id': 'PLANT-record-missing-read', 'pass': True, 'record': True, 'arm': False, 'arm_note': 'record row (a measured verdict the lane cannot close)', 'measured': None, 'target': 0.0, 'quantity': 'planted:missing', 'note': 'PLANTED (cell A10/A12): a record row whose read is missing — lighting-gate.py: ok = ok and (v is not None) and arm_ok'}
    undecl = {'id': 'PLANT-undeclared-unarmed', 'pass': True, 'record': False, 'arm': False, 'arm_ok': False, 'arm_cause': 'UNDECLARED', 'arm_txt': 'UNARMED AND UNDECLARED — a judged row with arm:false and no arm_note (C2-FIX10)', 'measured': 0.5, 'target': 0.5, 'pm': 0.1, 'quantity': 'planted:undeclared', 'note': 'PLANTED (cell A11/A12): the --force-unarmed shape'}
    silent = {'id': 'ARM-force-silent-record', 'pass': True, 'record': True, 'arm': True, 'arm_ok': False, 'measured': 0, 'target': 0, 'arm_value': 0, 'arm_cause': 'NOT-AN-ARM', 'arm_txt': '0.0000 → NOT-AN-ARM (synthetic)', 'note': 'PLANTED (cell A12): the --force-silent-record row'}
    valuefail = {'id': 'PLANT-judged-value-fail', 'pass': False, 'record': False, 'arm': True, 'arm_ok': True, 'measured': 2.0, 'target': 1.0, 'pm': 0.1, 'quantity': 'planted:value', 'note': 'PLANTED (cell A12): a judged row failing on its value, outside the exemption'}
    decl = next((r for r in G if r.get('declared_noread')), None)
    pinbroken = dict(decl, id='PLANT-reverse-pin-broken', noread_pin_ok=False, noread_pin_txt='PLANTED (cell A12): the reverse pin broken in memory') if decl else None
    rows = {'missrec': [missrec], 'undecl': [undecl], 'spliced': [silent, missrec, undecl, valuefail] + ([pinbroken] if pinbroken else [])}[plant]
    plant_gate_json(lambda G: (G.extend(rows), rows)[1], why=f'{plant}: {len(rows)} spliced row(s)'); print(f'[cell] built {d} (plant {plant}): {len(files)} record files + 3 census files')
elif plant == 'windowfile':
    # a plant file present in a copy that is NOT cell A7 — the record pass must never honour it (FIX12 M4)
    open(os.path.join(dst, 'q698-window-plant.txt'), 'w').write(os.path.abspath('web/tools/e2e-atelier.mjs') + '\n'); print(f'[cell] built {d} (plant windowfile): {len(files)} record files + 3 census files; q698-window-plant.txt present (points at the real file) — outside cell A7 it must be refused by name')
elif plant == 'nonrepo':
    # a copy of THIS driver under the copy tree: run from there, LANE_ROOT = the copy tree, which is not a git repository — every static check must REFUSE by name
    os.makedirs(os.path.join(d, 'tools/render'), exist_ok=True); shutil.copy2('tools/render/lighting-land41-verdict.sh', os.path.join(d, 'tools/render/lighting-land41-verdict.sh'))  # built from the lane worktree
    print(f'[cell] built {d} (plant nonrepo): {len(files)} record files + 3 census files; the driver copied to {d}/tools/render/ — run THAT copy: its LANE_ROOT is a non-repo path')
elif plant == 'rulednostatic':
    # the B2 ruling entry loses its static-check files — a set-aside without its static check is not a set-aside, rc 1
    f3 = os.path.join(dst, 'q698-run2-ruled-arms.txt'); lines = open(f3).read().split('\n'); out = []
    for l in lines:
        if l.startswith('B2 |'): l = ' | '.join(x for x in l.split(' | ') if not x.strip().startswith('files:'))
        out.append(l)
    open(f3, 'w').write('\n'.join(out)); print(f'[cell] built {d} (plant rulednostatic): {len(files)} record files + 3 census files; the B2 ruling entry lost its files: field')
else:
    # the static path check names a LANE hunk: the lane-owned web/app/main.js (358 changed lines vs main) is planted onto the path list
    open(os.path.join(dst, 'q698-path-extra.txt'), 'w').write('web/app/main.js\n'); print(f'[cell] built {d} (plant static): {len(files)} record files + 3 census files; q698-path-extra.txt plants web/app/main.js onto the Q698 path list')
PY
  exit $?
fi
# ---------------------------------------------------------------- output: the record log for the pass, a receipt file for a cell
if [ "$ST" = unset ]; then exec >> "$L" 2>&1; else exec >> "output/lighting/chain-land41-verdict-selftest-$ST.log" 2>&1; fi
[ -z "${OB_L41V_NOTE:-}" ] || echo "[chain41] RE-DERIVATION NOTE ($(date -u +%FT%TZ)): $OB_L41V_NOTE"
# FIX11 L2: a cell's receipt is copied into the RECORD (OB_L41V_RECORD_DIR = the lane worktree) on exit, with one chain-log line per cell
CELL_START=$(date -u +%FT%TZ); RUN_EPOCH=$(TZ=UTC date -j -f %Y-%m-%dT%H:%M:%SZ "$CELL_START" +%s); RUN_ID="${CELL_START}-$$-$(head -c 4 /dev/urandom | xxd -p)"   # FIX18 Z3: the run id (start-pid-8hex) every per-run artefact carries
export OB_L41V_TMPP="/tmp/ob-l41v-${RUN_ID//:/}"   # FIX19 F2(b): every /tmp scratch file of this run is keyed by RUN_ID (concurrent same-second runs never share a file)   # FIX18 C8: one clock — the epoch is derived from CELL_START, never a second date call
cell_receipt() {
  local orig=$?   # FIX17 R2: the ORIGINAL exit status — a refuse() (exit 2) must leave this trap as exit 2, never as INVALID-CELL
  [ "$ST" = unset ] && return 0
  /usr/local/bin/python3 - "${OB_L41V_RECORD_DIR:-}" "$ST" "$CELL_START" "$PWD" "$(shasum -a 256 "$SELF" | cut -c1-12)" "$orig" "$RUN_EPOCH" "$RUN_ID" <<'PY'
import os, sys, shutil, re, ast, json, datetime
rec, st, t0, cwd, dsha, orig, epoch, run_id = sys.argv[1:9]
def san(x, n=80):  # FIX18 Z2: every token interpolated into a free-text word is repr'd, newline-free and length-capped
    r = repr(x); r = r.replace('\n', '\\n').replace('\r', '\\r'); return r if len(r) <= n else r[:n] + '…'
def out(m): print(m, flush=True)
code = 0; word = None; vclass = 'NONE'; booked = False; src = os.path.join(cwd, 'output/lighting'); rcfile = os.path.join(src, 'chain-land41-selftest.rc')
def write_rc(v):
    try:
        with open(rcfile, 'w') as fh: fh.write(f'{v}\n')
    except Exception as e: out(f'[chain41] GATE CELL VALIDITY: the selftest rc file could not be written: {e!r}')
def marker(phase, reason):
    try:
        with open(os.path.join(src, 'chain-land41-selftest.refused'), 'w') as fh: fh.write(f'phase {phase}\nrun_id {run_id}\nstart {t0}\nutc {datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}\nreason {reason}\n')
    except Exception: pass
try:
    SURV = 'exempt-name rows SURVIVING a truth-table column'; SIL = 'silent or broken arms (arm_ok false, any row)'; MISS = 'record rows with a missing read'; VF = 'judged rows failing on value outside the exemption'
    TERMS = [SURV, VF, MISS, 'judged rows with a missing read', SIL, 'undeclared unarmed judged rows', 'reverse pins broken (declared no-read rows)', 'spec regeneration mismatch', 'synthetic force rows present']
    A9ID = 'ARM-force-silent-record'
    EXPECTED = {
      'A9-plantedgatearm': [(SIL, A9ID)], 'A9ARM-extrasilent': [(SIL, A9ID)], 'A9ARM-refusingid': [(SIL, A9ID)],
      'A10-plantedmissrec': [(MISS, 'PLANT-record-missing-read')],
      'A11-plantedundecl': [('undeclared unarmed judged rows', 'PLANT-undeclared-unarmed')],
      'A12-plantedspliced': [(VF, 'PLANT-judged-value-fail'), (MISS, 'PLANT-record-missing-read'), (SIL, A9ID), (SIL, 'PLANT-undeclared-unarmed'), ('undeclared unarmed judged rows', 'PLANT-undeclared-unarmed'), ('reverse pins broken (declared no-read rows)', 'PLANT-reverse-pin-broken')],
      'A13-plantedexemptmiss': [(SURV, 'C2F-queuelong-legacy-asserts-degrade (c-value-failure)')],
      'A14-plantedexemptdup': [(SURV, 'C2F-queuelong-legacy-asserts-degrade (b-identity, d-unique)'), (SURV, 'C2F-queuelong-legacy-asserts-degrade (d-unique)')],
      'A15-plantedrecnokey': [(MISS, 'PLANT-record-no-measured-key')],
      'A16-plantedunbound': [('WORD', 'UNJUDGEABLE-INSTRUMENT'), ('REASON', 'is OUTSIDE the gate step window'), ('PLANT', 'unbound')],
      'A17-plantedzerofail': [('WORD', 'UNJUDGEABLE-INSTRUMENT'), ('REASON', 'the regate exited 3 but the bound json carries NO failing row and no surviving term')],
      'A18-plantedexemptnonnum': [(SURV, 'C2F-queuelong-legacy-asserts-bakes-one (c-value-failure)'), (SURV, 'C2F-queuelong-legacy-asserts-degrade (c-value-failure)'), (SURV, 'C2F-queuelong-legacy-asserts-unbounded (c-value-failure)')],
      'A19-plantedexemptnopass': [(SURV, 'C2F-queuelong-legacy-asserts-degrade (c-value-failure)')],
      'A20-plantedjudgednopass': [('judged rows with a missing read', 'PLANT-judged-no-bool-pass')],
      'A21-plantedjudgedboolmismatch': [('judged rows with a missing read', 'PLANT-judged-bool-mismatch')],
      'A22-plantedjudgednonnum': [('judged rows with a missing read', 'PLANT-judged-nonnum-measured')],
      'A23-plantedspecnullpass': [('judged rows with a missing read', 'SPEC-regen')],
      'A24-plantedboolmatrix': [('judged rows with a missing read', 'PLANT-bool-ge-t1-mF'), ('judged rows with a missing read', 'PLANT-bool-band-t1-mF'), ('judged rows with a missing read', 'PLANT-bool-band-t0-mT'), ('boolean checks self-consistent', 'PLANT-bool-ge-t1-mT'), ('boolean checks self-consistent', 'PLANT-bool-ge-t0-mT'), ('boolean checks self-consistent', 'PLANT-bool-ge-t0-mF'), ('boolean checks self-consistent', 'PLANT-bool-band-t1-mT'), ('boolean checks self-consistent', 'PLANT-bool-band-t0-mF')],
      'A9ARM-unrestored': 'ARM-INVALID', 'A9ARM-forgedid': 'ARM-INVALID', 'A9ARM-forgedvalid': 'ARM-INVALID',
    }
    ANCHOR = 'FAIL — a failure the exemption may not lift survives — '
    def parse_terms(line):
        k = line.find(ANCHOR); res = {}
        if k < 0: return res
        i = k + len(ANCHOR)
        while True:
            t = next((t for t in TERMS if line.startswith(t + ': ', i)), None)
            if t is None: break
            i += len(t) + 2
            if line.startswith('none', i): res[t] = []; i += 4
            elif line.startswith('[', i):
                val = None
                for m in re.finditer(r'\]', line[i:]):
                    try: val = ast.literal_eval(line[i:i + m.end()]); j = i + m.end(); break
                    except Exception: continue
                if val is None: break
                res[t] = val if isinstance(val, list) else []; i = j
            else: break
            if line.startswith('; ', i): i += 2
            else: break
        return res
    def word_and_reason(line):
        m = re.match(r'\[chain41\] GATE CLASSIFICATION \(final regate\): (PASS-WITH-UNJUDGEABLE|UNJUDGEABLE-INSTRUMENT|FAIL|PASS)(?: \([^)]*\))? — (.*)$', line)
        return (m.group(1), m.group(2)) if m else ('(no word)', '')
    names = [f'chain-land41-verdict-selftest-{st}.log', f'chain-land41.gateword.selftest-{st}', f'chain-land41.gateword.selftest-{st}.last-red', 'chain-land41-selftest.rc', 'chain-land41-selftest.verdict.json', 'chain-land41-selftest.refused', 'gate-land41.json.mtime-proof']
    logp = os.path.join(src, names[0]); full = open(logp, errors='replace').read().split('\n') if os.path.exists(logp) else []
    starts = [i for i, l in enumerate(full) if l.startswith('[chain41] VERDICT RE-DERIVATION START ')]
    mine = [i for i in starts if full[i].startswith(f'[chain41] VERDICT RE-DERIVATION START {t0} ')]
    seg0 = (mine[-1] if mine else (starts[-1] if starts else 0)); log = full[seg0:]
    receipt_start = (re.match(r'\[chain41\] VERDICT RE-DERIVATION START (\S+)', full[seg0]).group(1) if full and full[seg0].startswith('[chain41] VERDICT RE-DERIVATION START ') else '')
    # ---- STRUCTURED facts (FIX18 V2): the refusal marker and the verdict json, both bound to THIS run's start
    def kv(path):
        d = {}
        if os.path.exists(path):
            for l in open(path).read().split('\n'):
                if ' ' in l: k, v = l.split(' ', 1); d[k] = v
        return d
    mk = kv(os.path.join(src, 'chain-land41-selftest.refused')); mk_mine = mk if mk.get('run_id') == run_id else {}   # Z3: honoured by run id only
    # the verdict fact: verdict() (run 4's function, frozen) writes output/lighting/chain-land41-selftest.rc as its last act; it is THIS run's iff its mtime is not
    # older than the run epoch; read it BEFORE anything below overwrites it, and book it as chain-land41-selftest.verdict.json (structured, start-bound)
    vj = {}
    try:
        if os.path.exists(rcfile) and os.stat(rcfile).st_mtime >= float(epoch) - 1:
            t = open(rcfile).read().strip()
            if t.isdigit(): vj = {'rc': int(t), 'start': t0, 'run_id': run_id, 'source': 'chain-land41-selftest.rc written by verdict() within this run (the file was purged at this run\'s START; mtime >= run epoch)'}
    except Exception: vj = {}
    vjp = os.path.join(src, 'chain-land41-selftest.verdict.json')
    try:
        with open(vjp, 'w') as fh: json.dump(vj or {'rc': None, 'start': t0, 'run_id': run_id, 'source': 'no rc file written by verdict() within this run'}, fh)
    except Exception: pass
    has_vline = any(l.startswith('[chain41] SELFTEST-VERDICT rc ') for l in log)  # line-START anchored cross-check, not a substring
    if mk_mine and not vj: refused = True; refusal_reason = f"{mk_mine.get('phase', '?')}: {mk_mine.get('reason', '?')}"
    elif vj and not mk_mine: refused = False; refusal_reason = ''
    else: refused = None; refusal_reason = f"INCONSISTENT: refusal marker for this start {'present' if mk_mine else 'absent'}, verdict json {'present' if vj else 'absent'}, verdict line {'present' if has_vline else 'absent'}"
    rcv = str(vj.get('rc')) if vj else '?'
    # human text for the chain line (never parsed back by anyone)
    def word_of(prefix):
        l = next((x for x in reversed(log) if x.startswith('[chain41] ' + prefix)), '')
        m = re.match(r'\[chain41\] ' + re.escape(prefix) + r' (PASS-WITH-UNJUDGEABLE \([^)]*\)|PASS-WITH-UNJUDGEABLE|UNJUDGEABLE-INSTRUMENT|FAIL|PASS)(?:[^—]*)— (.*)$', l)
        if not m: return prefix.split(' ')[0] + ' (no line)'
        w, why = m.group(1), m.group(2); why = '; '.join(seg for seg in why.split('; ') if not seg.endswith(': none') and not seg.startswith('truth table:'))
        return f"{prefix.split(' ')[0]} {w.split(' (')[0]}: {why[:230]}"
    clause = word_of('GATE CLASSIFICATION (final regate):') + ' | ' + word_of('ATELIER CLASSIFICATION:')
    vline = next((l for l in reversed(log) if l.startswith('[chain41] SELFTEST-VERDICT rc ')), '')
    red = re.search(r'\| RED: (.*)$', vline)
    named = ('REFUSED: ' + refusal_reason[:200]) if refused else (('RED: ' + red.group(1)[:200] + ' | CLAUSE ' + clause) if red else 'no red clause | CLAUSE ' + clause)
    gate_line = next((l for l in reversed(log) if l.startswith('[chain41] GATE CLASSIFICATION (final regate):')), '')
    BCP = '[chain41] GATE BOOLEAN CHECKS (final regate, Z7 b′): self-consistent boolean checks on judged rows '
    bc_line = next((l for l in reversed(log) if l.startswith(BCP)), '')
    def parse_bool_checks(line):  # the first python list literal after the prefix, consumed whole
        if not line: return None
        i = line.find('[', len(BCP))
        if i < 0: return None
        for m in re.finditer(r'\]', line[i:]):
            try:
                v = ast.literal_eval(line[i:i + m.end()]); return v if isinstance(v, list) else None
            except Exception: continue
        return None
    exp = EXPECTED.get(st); terms = {}; detail = ''
    pf = os.path.join(src, 'gate-land41.json.mtime-proof'); gj = os.path.join(src, 'gate-land41.json'); sidecar = open(pf).read().strip() if os.path.exists(pf) else ''
    plant = sidecar.split(':', 1)[0] if sidecar else ''
    if exp: out(f"[chain41] GATE JSON MTIME PROOF (builder): {sidecar}; re-stat at receipt time {os.stat(gj).st_mtime_ns}" if sidecar and os.path.exists(gj) else f"[chain41] GATE JSON MTIME PROOF: no proof sidecar beside {gj} — the json was not planted through plant_gate_json()")
    if refused is None:
        word = f'INCONSISTENT ({san(refusal_reason, 160)})'; vclass = 'INCONSISTENT'; code = 3; detail = 'the structured facts disagree — exit 3'
    elif refused:
        word = 'REFUSED (no verdict — not a cell result)'; vclass = 'REFUSED'; code = 2; detail = san(refusal_reason, 200)
    elif exp == 'ARM-INVALID':
        w, reason = word_and_reason(gate_line); terms = parse_terms(gate_line)
        try: rows = {r.get('id'): r for r in json.load(open(gj))}
        except Exception: rows = {}
        reached = A9ID in terms.get(SIL, [])
        if st == 'A9ARM-unrestored':
            r9 = rows.get(A9ID); silent_shape = bool(r9) and r9.get('arm') is True and r9.get('arm_ok') is False and r9.get('record') is True
            plant_ok = plant == 'gatearm-unrestored'; bind_ok = w == 'UNJUDGEABLE-INSTRUMENT' and 'is OUTSIDE the gate step window' in reason
            arm_ok = rcv == '1' and plant_ok and silent_shape and bind_ok and not reached
            broken = ('the term was reached: the silent-arms list names the planted row — the binding did not fire' if reached else f'the cell was not built by plant gatearm-unrestored (sidecar plant {san(plant or "absent", 40)})' if not plant_ok else f'the row {A9ID} is not a silent arm by SHAPE (arm {san(r9.get("arm") if r9 else None, 20)}, arm_ok {san(r9.get("arm_ok") if r9 else None, 20)}, record {san(r9.get("record") if r9 else None, 20)})' if not silent_shape else f'the word is not UNJUDGEABLE-INSTRUMENT / OUTSIDE the window: {san(w, 40)} — {san(reason, 80)}')
        else:
            want_plant = {'A9ARM-forgedid': 'gatearm-forgedid', 'A9ARM-forgedvalid': 'gatearm-forgedvalid'}[st]; plant_ok = plant == want_plant
            fid = next((i for i in terms.get(VF, []) if isinstance(i, str) and i.startswith('PLANT-id-forging' if st == 'A9ARM-forgedvalid' else 'silent or broken arms')), None)
            arm_ok = rcv == '1' and plant_ok and w == 'FAIL' and fid is not None and not reached
            broken = ('the term was reached: the silent-arms list names ' + A9ID if reached else f'the cell was not built by plant {want_plant} (sidecar plant {san(plant or "absent", 40)})' if not plant_ok else f'the forged id is not in the value-fail list / the word is {san(w, 40)}')
        word = 'INVALID-CELL (did not reach its term) — as this ARM expects' if arm_ok else f'ARM-BROKEN ({broken})'; vclass = 'ARM-AS-EXPECTED' if arm_ok else 'ARM-BROKEN'; code = 0 if arm_ok else 3
        detail = f"parsed terms with rows: {san({k: v for k, v in terms.items() if v}, 400)}; word {san(w, 40)}; plant {san(plant, 40)}"
    elif exp:
        w, reason = word_and_reason(gate_line); terms = parse_terms(gate_line); miss = []
        bcl = parse_bool_checks(bc_line)
        if bcl is not None: terms['boolean checks self-consistent'] = bcl
        for term, pid in exp:
            if term == 'WORD': ok = w == pid
            elif term == 'REASON': ok = pid in reason
            elif term == 'PLANT': ok = plant == pid
            else: ok = pid in terms.get(term, [])
            if not ok: miss.append((term, pid))
        if rcv == '1' and not miss: word = 'RED-VALID'; vclass = 'RED-VALID'; code = 0
        elif any(t == 'PLANT' for t, _ in miss): word = f'ARM-BROKEN (the cell was not built by plant {san(dict(exp).get("PLANT"), 30)}: sidecar plant {san(plant or "absent", 40)})'; vclass = 'ARM-BROKEN'; code = 3
        else: word = 'INVALID-CELL (did not reach its term)'; vclass = 'INVALID-CELL'; code = 3
        detail = f"parsed terms with rows: {san({k: v for k, v in terms.items() if v}, 400)}; word {san(w, 40)}; plant {san(plant, 40)}; pairs missing: {san(miss, 200)}"
    # ---- booking (FIX18 V1/V3): temp dir → files + cell-validity.json → chain append → rename; the previous dir survives every failure
    exit_code = {0: int(orig) if orig.isdigit() else 1, 2: int(orig) if orig.isdigit() else 2, 3: 3}.get(code, 2)
    rc_file_val = 3 if code == 3 else (2 if code == 2 else (int(rcv) if rcv.isdigit() else None))
    fact = {'cell': st, 'validity_word': word, 'validity_class': vclass, 'arm_expected': exp == 'ARM-INVALID', 'run_id': run_id, 'expected_pairs': exp, 'parsed_terms': {k: v for k, v in terms.items() if v}, 'rc_verdict': int(rcv) if rcv.isdigit() else None, 'rc_file': rc_file_val, 'exit': exit_code, 'refused': bool(refused), 'refusal_reason': refusal_reason, 'driver_sha': dsha, 'start_utc': t0, 'receipt_start_utc': receipt_start, 'sidecar_plant': plant, 'booked_utc': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
    cwd_json = os.path.join(src, 'chain-land41-selftest.validity.json')   # the cwd-side fact (this run's), written whatever the record outcome
    if rec:
        base = os.path.join(rec, 'output/lighting'); final = os.path.join(base, f'cell-{st}'); tag = run_id.replace(':', ''); tmp = os.path.join(base, f'cell-{st}.tmp-{tag}'); prev = os.path.join(base, f'cell-{st}.prev-{tag}')   # FIX19 F2(b): staging keyed by RUN_ID, never by the second
        import glob as _glob
        orphans = sorted(_glob.glob(os.path.join(base, f'cell-{st}.tmp-*')) + _glob.glob(os.path.join(base, f'cell-{st}.prev-*')))
        tail = (f" | {word} (expected: {san(exp, 300)})" if word else '') + f" | receipt copied to output/lighting/cell-{st}/ | run_id {run_id}"
        line = f"[chain41] cell {st}: START {t0} driver {dsha} cwd {cwd} → SELFTEST-VERDICT rc {rcv} — {named}{tail}"
        phase = 'tmp-dir'; had_prev = False
        try:
            if orphans: phase = 'orphan-staging'; raise RuntimeError('orphan staging dir(s) for this cell: ' + ', '.join(os.path.basename(o) for o in orphans) + ' — the driver never sweeps; cleared only by a receipted manual removal')
            # FIX18 C2 + Z4: same output/lighting; tmp → rename dst→.prev → rename tmp→dst → chain append (the LAST fallible write) → cell-validity.json → rmtree .prev
            os.makedirs(tmp)   # FIX19 C4: no silent rmtree of a pre-existing tmp — an orphan REFUSED above
            for n in names:
                q = os.path.join(src, n)
                if os.path.exists(q): shutil.copy2(q, os.path.join(tmp, n))
            if word: open(os.path.join(tmp, 'cell-validity.txt'), 'w').write(word + '\n')
            phase = 'rename-prev'; had_prev = os.path.isdir(final)
            if had_prev: os.rename(final, prev)
            phase = 'rename-tmp'
            try: os.rename(tmp, final)
            except Exception:
                if had_prev and os.path.isdir(prev) and not os.path.isdir(final): os.rename(prev, final)
                raise
            phase = 'chain-append'
            with open(os.path.join(base, 'chain-land41.log'), 'a') as fh: fh.write(line + '\n')
            phase = 'json'
            with open(os.path.join(final, 'cell-validity.json'), 'w') as fh: json.dump(fact, fh, indent=1)   # Z4: the final fact is written only after the append succeeded
            phase = 'rmtree-prev'
            if had_prev and os.path.isdir(prev): shutil.rmtree(prev)
            booked = True; out(line[:160])
        except Exception as e:
            if phase == 'chain-append':
                # Z4 rollback: the new dir (no json yet) goes, the previous dir comes back; no .prev leftover; the failure is booked on the cwd side only
                try:
                    if os.path.isdir(final): shutil.rmtree(final)
                    if had_prev and os.path.isdir(prev): os.rename(prev, final)
                except Exception as e2: out(f'[chain41] GATE CELL VALIDITY: note — rollback after the failed append hit {san(e2, 120)}')
                word = f'REFUSED (chain append failed: {san(e, 120)}; previous receipt dir restored, no chain line, no new json facts)'; vclass = 'REFUSED'; code = 4; marker('chain-append', repr(e)); detail = 'the previous receipt dir stands; the record must be re-run for this cell'; failed_phase = 'chain-append'
            elif phase in ('json', 'rmtree-prev'):
                booked = True; out(line[:160]); out(f'[chain41] GATE CELL VALIDITY: note — after the append, phase {phase} hit {san(e, 120)} (the chain line stands; the json may be missing — the renderer refuses a missing json)')
            else:
                try:
                    if os.path.isdir(tmp): shutil.rmtree(tmp)
                except Exception: pass
                word = f'REFUSED (record not written at phase {phase}: {san(e, 120)}) — unrecorded'; vclass = 'REFUSED'; code = 4; marker(('orphan-staging' if phase == 'orphan-staging' else 'record-unwritable:' + phase), repr(e)); detail = 'the previous receipt dir is left intact'; failed_phase = ('orphan-staging' if phase == 'orphan-staging' else 'record-unwritable:' + phase)
        fact.update({'validity_word': word, 'validity_class': vclass, 'booked': booked, 'phase_failed': None if booked else phase})
        if code == 4: fact.update({'exit': 2, 'rc_file': 2, 'refused': True, 'refusal_reason': failed_phase})   # FIX19 F4(a): the failure branch ASSIGNS the final fact — process exit 2, rc file 2, refused, reason = the marker phase
    else:
        out('[chain41] GATE CELL VALIDITY: no OB_L41V_RECORD_DIR — the word and the exit stand, nothing copied, no chain line')
    try:
        with open(cwd_json, 'w') as fh: json.dump(fact, fh, indent=1)
    except Exception as e: out(f'[chain41] GATE CELL VALIDITY: note — the cwd-side validity json could not be written: {san(e, 120)}')
    # ---- the word line and the rc file, AFTER the booking (V3)
    if word:
        out(f"[chain41] GATE CELL VALIDITY: {word} — class {vclass} — cell {st} rc {rcv} original exit {orig} run {run_id}; expected pairs: {san(exp, 300)}; {detail}; this run's GATE CLASSIFICATION line: {gate_line[:420] if gate_line else '(none)'}")
        if code == 3: write_rc(3); out('[chain41] GATE CELL VALIDITY: the cell selftest rc file reads 3 (exit 3)')
        elif code in (2, 4): write_rc(2); out(f'[chain41] GATE CELL VALIDITY: the cell selftest rc file reads 2 (exit {orig if code == 2 else 2})')
    if booked:
        try: shutil.copy2(logp, os.path.join(final, names[0]))  # the booked copy of the receipt now carries the word line too; the json is the consumed field
        except Exception as e: out(f'[chain41] GATE CELL VALIDITY: note — the receipt log re-copy failed: {e!r} (the json stands)')
except Exception as e:
    out(f'[chain41] GATE CELL VALIDITY: REFUSED (receipt step failed: {san(e, 160)}) — class REFUSED — exit 2'); write_rc(2); marker('receipt-step', repr(e)); code = 4
sys.exit(code)
PY
  local vrc=$?
  # FIX18 V8 four-way exit: 0/1 = the verdict's own exit (kept) · 2 = REFUSED (refuse(): the ORIGINAL status re-exited; record-unwritable / receipt-step: exit 2) · 3 = INVALID-CELL / ARM-BROKEN / INCONSISTENT · 4 = --build-cell failure (never reaches this trap)
  case $vrc in
    3) echo "[chain41] INVALID-CELL / ARM-BROKEN / INCONSISTENT: $ST — exit 3 (its selftest rc file reads 3; the word in cell-validity.json is the proof, the rc follows it)"; exit 3;;
    2) echo "[chain41] REFUSED (no verdict — not a cell result): $ST — the trap re-exits the original status $orig"; exit $orig;;
    4) echo "[chain41] REFUSED (record not written / receipt step failed): $ST — exit 2"; exit 2;;
    *) return 0;;
  esac
}
trap cell_receipt EXIT
echo "[chain41] VERDICT RE-DERIVATION START $CELL_START driver tools/render/lighting-land41-verdict.sh sha $(shasum -a 256 "$SELF" | cut -c1-12) selftest=$ST nice=$(ps -o nice= -p $$ | tr -d " ") run $RUN_ID cwd $PWD — ruling 2026-09-15 08:5xZ (a): verdict-only, no boot, no step re-run"
if [ "$ST" != unset ]; then  # FIX18 C1 + Z3: at run START every per-run artefact of ANY other run is purged regardless of mtime (future mtimes included); this run's id is written
  /usr/local/bin/python3 - "$PWD/output/lighting" "$RUN_ID" <<'PY'
import os, sys
d, run_id = os.path.realpath(sys.argv[1]), sys.argv[2]
assert d.endswith('/output/lighting'), d   # resolve before you delete: only per-run files under <cwd>/output/lighting
for n in ('chain-land41-selftest.refused', 'chain-land41-selftest.rc', 'chain-land41-selftest.verdict.json', 'chain-land41-selftest.validity.json'):
    q = os.path.join(d, n)
    if os.path.exists(q): os.unlink(q); print(f'[chain41] run START: {n} of another run purged (run id scoping, not mtime)')
with open(os.path.join(d, 'chain-land41-run.id'), 'w') as fh: fh.write(run_id + '\n')
PY
fi
refuse() {
  echo "[chain41] VERDICT RE-DERIVATION REFUSING: $1 — no verdict, no rc written"
  # FIX18 V2: a STRUCTURED marker the row ids cannot reach — cell_receipt decides REFUSED from it, never from a phrase in the log
  [ "$ST" = unset ] || printf 'phase refuse\nrun_id %s\nstart %s\nutc %s\nreason %s\n' "$RUN_ID" "$CELL_START" "$(date -u +%FT%TZ)" "$1" > output/lighting/chain-land41-selftest.refused
  exit 2
}
[ -f "$L" ] || refuse "no record log at $L"
[ -f output/lighting/q698-window-plant.txt ] && [ "$ST" = unset ] && refuse "plant file present in the record: output/lighting/q698-window-plant.txt — the record pass never honours a plant (FIX12 M4)"
[ -f "$RUN4_DRIVER" ] || refuse "run 4's driver mirror is absent at $RUN4_DRIVER"
[ "$(shasum -a 256 "$RUN4_DRIVER" | cut -c1-12)" = "$RUN4_SHA_PREFIX" ] || refuse "run 4's driver mirror sha $(shasum -a 256 "$RUN4_DRIVER" | cut -c1-12) != $RUN4_SHA_PREFIX"

# ---------------------------------------------------------------- 1. parse run 4's record segment; cross-check every value against the file it names
PARSED=$(/usr/local/bin/python3 - "$L" "$SEG_START" "$RUN4_SHA_PREFIX" <<'PY'
import re, sys, os, json
L, seg_start, sha = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(L, encoding='utf-8', errors='replace').read().split('\n')
starts = [i for i, l in enumerate(lines) if seg_start in l]
if not starts: print('REFUSE run 4 START line not found'); sys.exit(0)
i0 = starts[-1]; seg = lines[i0:]
ends = [j for j, l in enumerate(seg) if re.match(r'\[chain41\] VERDICT rc \d', l)]
if not ends: print('REFUSE run 4 has not printed its VERDICT line yet'); sys.exit(0)
seg = seg[:ends[0] + 1]
out, checks = {}, []
def one(pat, name, flags=0):
    m = [re.search(pat, l) for l in seg]; m = [x for x in m if x]
    if not m: print(f'REFUSE record line for {name} not found (pattern {pat!r})'); sys.exit(0)
    return m[-1]
m = one(r'RESUME 3 START \S+ driver (\w{12})', 'driver sha'); checks.append(('run 4 driver sha on the START line == mirror', m.group(1) == sha, m.group(1)))
one(r'resume 3: SEAL_RC taken as 0 under the classification', 'SEAL_RC line'); one(r"GATE CLASSIFICATION \(after resume 2's regate\): PASS", 'gate classification line'); out['SEAL_RC'] = '0'
gw = open('output/lighting/chain-land41.gateword').read() if os.path.exists('output/lighting/chain-land41.gateword') else ''
checks.append(('chain-land41.gateword carries the ruled word', 'PASS-WITH-UNJUDGEABLE (3 rows: plant precondition not met — instrument, #837)' in gw, gw.strip()[:60]))
m = one(r'\[chain41\] ARM PHASE: (\d+)/(\d+) fired, (\d+) failed -> (PASS|FAIL)', 'ARM PHASE'); out['FIRED'], out['NARMS'], out['ARMFAIL'] = m.group(1), m.group(2), m.group(3)
fired_lines = [l for l in seg if re.match(r'\[chain41\] arm \S+ exit \d+ -> FIRED', l)]
checks.append(('FIRED count == the arm lines reading FIRED', len(fired_lines) == int(m.group(1)), f'{len(fired_lines)} lines'))
arms = [re.match(r'\[chain41\] arm (\S+) exit', l).group(1) for l in fired_lines]
missing = [a for a in arms if not os.path.exists(f'output/lighting/seal-land41-arm-{a}.log')]
checks.append(('every FIRED arm has its seal log', not missing, f'missing {missing}' if missing else f'{len(arms)} logs'))
m = one(r'\[chain41\] final regate exit (\d+)', 'final regate'); out['FRC'] = m.group(1)
rf = 'output/lighting/seal-land41-regate-final.log'
if os.path.exists(rf):
    t = open(rf, encoding='utf-8', errors='replace').read(); mm = re.findall(r'FAILED at gate exit (\d+)', t)
    checks.append(('final regate exit == the regate-final log', (out['FRC'] == '0' and not mm) or (mm and mm[-1] == out['FRC']), f'log says {mm[-1] if mm else "no FAILED line"}'))
else: checks.append(('seal-land41-regate-final.log present', False, 'absent'))
m = one(r"\[chain41\] B' capture \(merged web, strict, identityDropKey=uGiBallOn\) exit (\d+)", "B'1 capture"); out['BPRC'] = m.group(1)
m = one(r"\[chain41\] B' \(planted: identityDropKey=uGiBallOn\) — .*\(exit (\d+)\)", "B'1 line"); out['BPJ'] = m.group(1)
m = one(r"\[chain41\] B'2 capture \(merged web, strict, identityGiBall=0\) exit (\d+)", "B'2 capture"); out['BP2RC'] = m.group(1)
m = one(r"\[chain41\] B'2 \(planted: identityGiBall=0\) — .*check-ctrl exit (\d+) —", "B'2 line"); out['BP2J'] = m.group(1)
for tag, var in (('bprime', 'BPJ'), ('bprime2', 'BP2J')):
    p = f'output/lighting/check-ctrl-land41-{tag}.log'
    if not os.path.exists(p): checks.append((f'{p} present', False, 'absent')); continue
    mm = [re.search(r'^\[check-ctrl\] (?:PASS|FAIL|UNJUDGEABLE).*exit (\d+)\)', l) for l in open(p, encoding='utf-8', errors='replace')]
    mm = [x.group(1) for x in mm if x]
    checks.append((f'{var} == the check-ctrl verdict exit in {p}', bool(mm) and mm[-1] == out[var], f'log says {mm[-1] if mm else "no verdict line"}'))
m = one(r'\[chain41\] RENDER-NEUTRALITY READING: (.*)$', 'READING'); out['READING'] = m.group(1)
if os.path.exists(rf):
    bjw = re.search(r'^\[ctrl-judge\] (PASS-WITH-ATTRIBUTED|PASS|FAIL|UNJUDGEABLE)', t, re.M); bfx = re.search(r'fence identity A1 vs B1 \(--room-strict\) exit (\d+)', t)
    exp = '(c)' if (bjw and bjw.group(1) == 'PASS' and bfx and bfx.group(1) == '0') else ('(a-main)' if (bjw and bjw.group(1) == 'PASS-WITH-ATTRIBUTED' and bfx and bfx.group(1) == '0') else None)
    if exp: checks.append(('READING prefix agrees with the regate-final judge word + fence exit', out['READING'].startswith(exp), f'expected {exp}; judge {bjw.group(1) if bjw else "?"} fence {bfx.group(1) if bfx else "?"}'))
out['REDERIVED'] = '0'
m = one(r'\[chain41\] e2e-atelier exit (\d+) .*FAIL rows: (\d+)', 'e2e-atelier'); out['ATRC'] = m.group(1)
p = 'output/lighting/land41-atelier.log'
if os.path.exists(p):
    n = sum(1 for l in open(p, encoding='utf-8', errors='replace') if l.startswith('E2E-ATELIER FAIL')); checks.append(('atelier FAIL rows on the line == the log', n == int(m.group(2)), f'log {n}, line {m.group(2)}'))
else: checks.append(('land41-atelier.log present', False, 'absent'))
m = one(r'\[chain41\] sw-precache --check exit (\d+)', 'sw-precache'); out['SWRC'] = m.group(1)
m = one(r'\[chain41\] pass2 --gate exit (\d+)', 'pass2'); out['P2RC'] = m.group(1)
p = 'output/lighting/land41-pass2.log'
if os.path.exists(p): ok = '[pass2] PASS' in open(p, encoding='utf-8', errors='replace').read(); checks.append(('pass2 exit 0 iff the log carries [pass2] PASS', ok == (out['P2RC'] == '0'), f'PASS line {"present" if ok else "absent"}'))
else: checks.append(('land41-pass2.log present', False, 'absent'))
m = one(r'\[chain41\] fullview --judge exit (\d+)', 'fullview'); out['FVRC'] = m.group(1); checks.append(('land41-fullview.log present', os.path.exists('output/lighting/land41-fullview.log'), ''))
m = one(r'\[chain41\] sinkrest exit (\d+) PASS (\d+)', 'sinkrest'); out['SRRC'] = m.group(1)
p = 'output/lighting/land41-sinkrest.log'
if os.path.exists(p): n = sum(1 for l in open(p, encoding='utf-8', errors='replace') if l.startswith('PASS ')); checks.append(('sinkrest PASS count on the line == the log', n == int(m.group(2)), f'log {n}, line {m.group(2)}'))
else: checks.append(('land41-sinkrest.log present', False, 'absent'))
m = one(r'\[chain41\] e2e-lighting exit (\d+)', 'e2e-lighting'); out['E2ERC'] = m.group(1)
m = one(r'\[chain41\] VERDICT rc (\d): selftest=unset', 'run 4 VERDICT'); out['RUN4_RC'] = m.group(1); out['RUN4_VERDICT_LINE'] = seg[-1].replace("'", "'\\''")
for k, v in out.items(): print(f"{k}='{v}'")
for name, ok, detail in checks: print(f"CHECK {'OK' if ok else 'FAIL'}: {name} ({detail})")
PY
)
echo "$PARSED" | grep -E '^(REFUSE|CHECK)' | sed 's/^/[chain41] record parse: /'
echo "$PARSED" | grep -q '^REFUSE' && refuse "$(echo "$PARSED" | grep -m1 '^REFUSE' | cut -c8-)"
echo "$PARSED" | grep -q '^CHECK FAIL' && refuse "a parsed value differs from the file it names (see the CHECK FAIL line(s) above)"
eval "$(echo "$PARSED" | grep -E "^[A-Z0-9_]+='")"
echo "[chain41] record parse: inputs from run 4's own lines — seal $SEAL_RC | ARM PHASE $FIRED/$NARMS fired, $ARMFAIL failed | final regate $FRC | B'1 capture $BPRC check-ctrl $BPJ | B'2 capture $BP2RC check-ctrl $BP2J | reading ${READING:0:40} | gates atelier $ATRC sw $SWRC pass2 $P2RC fullview $FVRC sinkrest $SRRC | e2e-lighting $E2ERC | run 4 VERDICT rc $RUN4_RC"

# ---------------------------------------------------------------- 2. the SAME verdict() as run 4's driver with EXACTLY ONE change (the B′₁ key check reads the fence md the fence writes)
verdict() {
  local rc=0 why=()
  [ "${SEAL_RC:-1}" = 0 ] || { rc=1; why+=("capturing seal exit ${SEAL_RC:-unset}"); }
  [ "${NARMS:-0}" -gt 0 ] && [ "${FIRED:-0}" -eq "${NARMS:-0}" ] && [ "${ARMFAIL:-1}" -eq 0 ] || { rc=1; why+=("ARM PHASE ${FIRED:-0}/${NARMS:-0} fired, ${ARMFAIL:-unset} failed"); }
  [ "${FRC:-1}" = 0 ] || { rc=1; why+=("final regate exit ${FRC:-unset}"); }
  [ -n "${BPRC:-}" ] && { [ "${BPJ:-0}" = 3 ] && grep -q 'uGiBallOn' output/lighting/check-ctrl-land41-bprime-fence.md 2>/dev/null && [ "$(awk '/strict pixels \(conv\): .*ctrla1 vs .*ctrlb1/{f=1;next} f&&/^\[pixel-strict\]/{print $2;exit}' output/lighting/check-ctrl-land41-bprime.log 2>/dev/null)" = PASS ] || { rc=1; why+=("planted control B' did not read: fence FAIL naming uGiBallOn with CONVERGED frames identical (check-ctrl exit ${BPJ:-unset})"); }; }
  [ -n "${BP2RC:-}" ] && { [ "${BP2J:-0}" = 3 ] && [ "$(awk '/strict pixels \(conv\): .*ctrla1 vs .*ctrlb1/{f=1;next} f&&/^\[pixel-strict\]/{print $2;exit}' output/lighting/check-ctrl-land41-bprime2.log 2>/dev/null)" = FAIL ] && grep -qE 'fence identity A1 vs B1 \(--room-strict\) exit [1-9]' output/lighting/check-ctrl-land41-bprime2.log 2>/dev/null || { rc=1; why+=("planted control B'2 did not read (CONVERGED frames must DIFFER): fence FAIL with frames DIFFERING (check-ctrl exit ${BP2J:-unset})"); }; }
  case "${READING:-}" in "(a-lane)"*) rc=1; why+=("render-neutrality reading (a-lane): an unattributed frame difference — full stop");; "(a-main)"*) ;; UNJUDGEABLE*) rc=1; why+=("render-neutrality reading UNJUDGEABLE");; "(b)"*) [ "${REDERIVED:-0}" = 1 ] || { rc=1; why+=("render-neutrality reading (b): baseline re-derivation owed (delta printed, re-derivation not run)"); };; esac
  [ "${ATRC:-1}" = 0 ] || { classify_atelier && { echo "[chain41] e2e-atelier exit ${ATRC} ACCEPTED under the atelier word ($(cat "$OB_L41V_TMPP-atelierword.txt")) — ATRC treated as 0 for the verdict; the word rides in the record"; ATRC=0; }; }
  local g; for g in ATRC SWRC P2RC FVRC SRRC; do [ "${(P)g:-1}" = 0 ] || { rc=1; why+=("gate $g exit ${(P)g:-unset}"); }; done
  local st="${OB_CHAIN_SELFTEST:-unset}" tok=VERDICT; [ "$st" = unset ] || tok=SELFTEST-VERDICT
  echo "[chain41] $tok rc $rc: selftest=$st | capturing seal ${SEAL_RC:-unset} | ARM PHASE ${FIRED:-0}/${NARMS:-0} fired, ${ARMFAIL:-unset} failed | final regate ${FRC:-unset} | gates atelier ${ATRC:-unset} sw ${SWRC:-unset} pass2 ${P2RC:-unset} fullview ${FVRC:-unset} sinkrest ${SRRC:-unset} | e2e-lighting exit ${E2ERC:-unset} (rows judged by the inherited-red rule, not by exit)${why:+ | RED: ${(j:; :)why}}"
  if [ "$st" = unset ]; then echo $rc > "$RCFILE"; else echo $rc > output/lighting/chain-land41-selftest.rc; echo "[chain41] $tok: the record rc file $RCFILE is NOT written while OB_CHAIN_SELFTEST is set"; fi
  exit $rc; }

# ---------------------------------------------------------------- 3. the one-line diff against run 4's driver, asserted, into the record
extract_verdict() { awk '/^verdict\(\) \{/{f=1} f{print} /^  exit \$rc; \}/{if(f)exit}' "$1"; }
extract_verdict "$RUN4_DRIVER" > "$OB_L41V_TMPP-run4-verdict.txt"; extract_verdict "$SELF" > "$OB_L41V_TMPP-this-verdict.txt"
[ -s "$OB_L41V_TMPP-run4-verdict.txt" ] && [ -s "$OB_L41V_TMPP-this-verdict.txt" ] || refuse "could not extract verdict() from both drivers"
DIFF=$(diff "$OB_L41V_TMPP-run4-verdict.txt" "$OB_L41V_TMPP-this-verdict.txt"); NCH=$(echo "$DIFF" | grep -c '^[<>]'); NHUNK=$(echo "$DIFF" | grep -cE '^[0-9,]+[acd][0-9,]+$')
echo "$DIFF" | sed 's/^/[chain41] verdict() diff (run 4 fd5120a5a944 → this driver): /' | cut -c1-400
H1=$(echo "$DIFF" | grep -m1 -E '^[0-9,]+[acd][0-9,]+$'); H2=$(echo "$DIFF" | grep -E '^[0-9,]+[acd][0-9,]+$' | sed -n 2p)
R4LINE=$(echo "$DIFF" | grep -m1 '^< ' | cut -c3-); MYLINE=$(echo "$DIFF" | grep -m1 '^> ' | cut -c3-); ADDED=$(echo "$DIFF" | grep '^> ' | sed -n 2p | cut -c3-)
[ "$NHUNK" = 2 ] && [ "$NCH" = 3 ] || refuse "the verdict() diff is not exactly the two ruled changes ($NHUNK hunks, $NCH changed lines)"
case "$H1" in *c*) ;; *) refuse "hunk 1 is not a one-line change ($H1)";; esac; case "$H2" in *a*) ;; *) refuse "hunk 2 is not a one-line addition ($H2)";; esac
[ "${R4LINE/check-ctrl-land41-bprime.log/check-ctrl-land41-bprime-fence.md}" = "$MYLINE" ] || refuse "hunk 1 is not the B′ key-check file target alone"
case "$ADDED" in '  [ "${ATRC:-1}" = 0 ] || { classify_atelier && { echo "[chain41] e2e-atelier exit ${ATRC} ACCEPTED under the atelier word'*) ;; *) refuse "hunk 2 is not the atelier-gate reading line";; esac
echo "[chain41] verdict() diff ASSERTED: exactly two hunks — hunk 1 ($H1) changes one line and only its first 'check-ctrl-land41-bprime.log' → 'check-ctrl-land41-bprime-fence.md' (the B′ key grep; the pixel awk still reads the check-ctrl log); hunk 2 ($H2) adds the one atelier-gate reading line (classify_atelier, ATRC treated 0 only under the ruled word); no other logic moved"

# ---------------------------------------------------------------- 4. the guard rule: every `-n VAR` guard in verdict() is SET in this cell
GUARDS=($(grep -oE '\[ -n "\$\{[A-Z0-9_]+:-\}" \]' "$OB_L41V_TMPP-this-verdict.txt" | grep -oE '[A-Z0-9_]+' | sort -u)); UNSET=()
GL=(); for g in $GUARDS; do [ -n "${(P)g:-}" ] || UNSET+=($g); GL+=("$g=${(P)g:-UNSET}"); done
echo "[chain41] verdict guards (rule: a \`-n VAR\` guard no cell sets leaves its clause UNVERIFIED by construction): ${(j:, :)GL} — cell $ST"
[ ${#UNSET} -eq 0 ] || refuse "guard variable(s) ${(j:, :)UNSET} unset in this cell — the guarded clause would be skipped, not exercised"

# ---------------------------------------------------------------- 5. the evidence and the CORRECTION line (before any verdict line)
F1=output/lighting/check-ctrl-land41-bprime-fence.md; F2=output/lighting/check-ctrl-land41-bprime2-fence.md
[ -f $F1 ] && [ -f $F2 ] || refuse "fence md copies absent ($F1 / $F2)"
KEYLOG=$(grep -c 'uGiBallOn' output/lighting/check-ctrl-land41-bprime.log); KF1=$(grep -c 'uGiBallOn' $F1); KF2=$(grep -c 'uGiBallOn' $F2)
M1=$(grep -c "uGiBallOn\` 1 → 'MISSING'" $F1); Z2=$(grep -c "uGiBallOn\` 1 → 0" $F2); SHA1=$(shasum -a 256 $F1 | cut -c1-16); SHA2=$(shasum -a 256 $F2 | cut -c1-16)
for pair in "/tmp/ob-l41-primeroot/check-ctrl-land41-fence.md:$F1" "/tmp/ob-l41-primeroot2/check-ctrl-land41-fence.md:$F2"; do
  o=${pair%%:*}; c=${pair#*:}
  if [ -f "$o" ]; then if cmp -s "$o" "$c"; then echo "[chain41] fence md copy $c == the file the fence wrote ($o)"; else echo "[chain41] fence md copy $c DIFFERS from $o$([ "$ST" = unset ] || echo " (expected in the planted cell)")"; [ "$ST" = unset ] && refuse "record copy $c differs from the fence's own file"; fi
  else echo "[chain41] fence md original $o no longer present (reap-eligible /tmp); the record copy stands"; fi
done
echo "[chain41] RUN 4 CORRECTION (in-band, $(date -u +%FT%TZ); ruling 2026-09-15 08:5xZ (a)): run 4's \`$RUN4_VERDICT_LINE\` — the B′₁ red in it was the INSTRUMENT's wrong-file read: the clause grepped uGiBallOn in output/lighting/check-ctrl-land41-bprime.log (grep -c = $KEYLOG) while the fence names the key only in the fence md it writes (lighting-check-ctrl.sh:190, --room-report --program-report): $F1 $KF1 mention(s), $M1 row(s) \`material.injected.uGiBallOn\` 1 → 'MISSING' (sha256 $SHA1…); $F2 $KF2 mention(s), $Z2 row(s) 1 → 0 (sha256 $SHA2…). The plants read as designed (B′₁: fence FAIL, converged frames identical; B′₂: fence FAIL, converged frames differ). The verdict below is re-derived from run 4's own record lines with the SAME verdict() and exactly the one change diffed above; no step re-ran, nothing booted, no value was stubbed (cell $ST)."

# ---------------------------------------------------------------- 6. run 4's classification-aware wrapper, verbatim (the final regate's gate re-classified by the same classifier)
classify_gate() {  # $1 = label, $2 = gate json (default the run's), $3 = boots root (default output/lighting), $4 = the regate log the json is bound to (default seal-land41-regate-final.log), $5 = the regate exit being lifted; prints the truth table, the binding and the word; writes "$OB_L41V_TMPP-gateword.txt"; returns 0 iff PASS or PASS-WITH-UNJUDGEABLE
  /usr/local/bin/python3 - "$1" "${2:-output/lighting/gate-land41.json}" "${3:-output/lighting}" "${4:-output/lighting/seal-land41-regate-final.log}" "${5:-3}" <<'PY'
import json, sys
label, gpath, root = sys.argv[1], sys.argv[2], sys.argv[3]
G = json.load(open(gpath))
# FIX15 Q1 (the 117920f6 behaviour refuter — the third hole in three exemption patches): the exemption is a TRUTH TABLE. A gate row is LIFTED only when
# EVERY column holds: (a) its id is one of the three studioqueuelonglegacy ids by exact equality; (b) its identity fields equal the PINNED row's — table,
# quantity and source compared as whole fields (the exact source string; nine real non-exempt rows carry the token in free text); (c) its measured value is
# a finite NUMBER and the failure is a VALUE failure (a missing read on an exempted-name row is NEVER lifted); (d) the id appears exactly once in the json;
# (e) arm_ok is true, the row is a judged row (not record, not declared) and not a synthetic force row. Every row failing any column SURVIVES under a term
# naming the column. Every other failure condition lighting-gate.py emits survives as before (FIX14 O1), with the missing-read terms freed of the id
# exclusion and of the key guard on RECORD rows (a record row without a measured key IS a missing read). FIX15 Q2: the json is BOUND to the regate exit it
# would lift — its mtime must fall inside the regate log's gate step window — and an exit 3 beside a json with no failing row is UNJUDGEABLE-INSTRUMENT.
import os, math, datetime
regate_log = sys.argv[4] if len(sys.argv) > 4 else None; regate_exit = sys.argv[5] if len(sys.argv) > 5 else None
PINS = {
    'C2F-queuelong-legacy-asserts-bakes-one': {'table': 'predator_apex_9ft@studioqueue', 'quantity': 'census:contract:venueBakeCount', 'source': 'studioqueuelonglegacy studioqueue census; arm = studioqueuelong (2)'},
    'C2F-queuelong-legacy-asserts-degrade': {'table': 'predator_apex_9ft@studioqueue', 'quantity': 'census:contract:venueBudgetDegrade', 'source': 'studioqueuelonglegacy studioqueue census; arm = studioqueuelong (0)'},
    'C2F-queuelong-legacy-asserts-unbounded': {'table': 'predator_apex_9ft@studioqueue', 'quantity': 'census:contract:venueH3Unbounded', 'source': 'studioqueuelonglegacy studioqueue census; arm = pendant base boot (0)'},
}
exempt = sorted(PINS); want = exempt
def isnum(v): return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
judged = [r for r in G if not r.get('record') and not r.get('declared_noread')]
def judge01(r, v):  # FIX19 F4(b): lighting-gate.py's judge() replicated (band / <= / >= / < / >, op absent → 'band'); a non-numeric or absent target/pm → None (the producer cannot emit that shape)
    t, pm, op = r.get('target'), r.get('pm', 0.0), r.get('op', 'band')
    if not isnum(t) or not isnum(pm): return None
    if op == 'band': return abs(v - t) <= pm
    if op == '<=': return v <= t + pm
    if op == '>=': return v >= t - pm
    if op == '<': return v < t - pm
    if op == '>': return v > t + pm
    return False   # the producer returns False for any other operator
def boolcheck_ok(r):  # FIX18 Z7(b′) ruling + FIX19 F4(b): a boolean check is self-consistent iff pass == judge(op, target, pm, 1 if measured else 0); no allowlist by id
    m = r.get('measured')
    if not isinstance(m, bool) or not isinstance(r.get('pass'), bool): return False
    j = judge01(r, 1 if m else 0); return j is not None and r.get('pass') == j
records = [r for r in G if r.get('record')]
declared = [r for r in G if r.get('declared_noread')]
# the truth table, one row per exempt id (every occurrence of the id is judged; a duplicate fails column d for all of them)
table_lines = []; lifted = []; survivors = []
for i in exempt:
    occ = [r for r in G if r.get('id') == i]
    if not occ: table_lines.append(f"{i}: NOT PRESENT — nothing to lift"); continue
    for r in occ:
        pin = PINS[i]
        cols = {'a-id': True,
                'b-identity': (r.get('table') == pin['table'] and r.get('quantity') == pin['quantity'] and r.get('source') == pin['source']),
                'c-value-failure': (isnum(r.get('measured')) and r.get('pass') is False),
                'd-unique': len(occ) == 1,
                'e-arm-and-kind': (r.get('arm_ok') is True and not r.get('record') and not r.get('declared_noread') and not str(i).startswith(('ARM-force-', 'ARM-missing-')))}
        nonnum = not isnum(r.get('measured'))  # FIX16 S5: str / NaN / bool / None / absent — never a measurement, whatever pass says
        failing_row = r.get('pass') is not True or nonnum  # FIX17 R4(5): a pass key absent or null on an exempt-name row is failing, like False
        ok = all(cols.values())
        bad = [k for k, v in cols.items() if not v]
        verdict = 'PASSING (nothing to lift)' if not failing_row else ('LIFTED' if ok else 'SURVIVES')  # a passing row with a finite number has nothing to lift; a non-numeric 'measured' is a failing row on column c
        if not failing_row: bad = []
        table_lines.append(f"{i}: table {r.get('table')!r} quantity {r.get('quantity')!r} source-match {cols['b-identity']} measured {r.get('measured')!r}{'' if isnum(r.get('measured')) else ' (NOT a finite number)'} judge {'FAIL' if r.get('pass') is False else ('PASS' if r.get('pass') else 'none')} duplicate {'no' if cols['d-unique'] else 'YES x' + str(len(occ))} arm_ok {r.get('arm_ok')!r} → {verdict}{(' on ' + ', '.join(bad)) if bad else ''}")
        (lifted if verdict == 'LIFTED' else survivors if verdict == 'SURVIVES' else []).append((i, bad))
# every other failure condition the gate emits (FIX14 O1), missing-read terms without the id exclusion / the record key guard
exempt_ids = set(exempt)
terms = {
    'exempt-name rows SURVIVING a truth-table column': sorted(f"{i} ({', '.join(bad)})" for i, bad in survivors),
    'judged rows failing on value outside the exemption': sorted(r['id'] for r in judged if r.get('pass') is False and r['id'] not in exempt_ids and r['id'] != 'SPEC-regen' and isnum(r.get('measured'))),
    'record rows with a missing read': sorted(r['id'] for r in records if ('measured' not in r) or r['measured'] is None),
    'judged rows with a missing read': sorted(r['id'] for r in judged if (r['id'] != 'SPEC-regen' and ((not isnum(r.get('measured')) and not boolcheck_ok(r)) or not isinstance(r.get('pass'), bool))) or (r['id'] == 'SPEC-regen' and not isinstance(r.get('pass'), bool))),  # FIX18 V7 + Z7(b′): a judged row whose measured is not a finite number is a missing read whatever pass says — except a SELF-CONSISTENT boolean check (bool measured, pass == measured, target ∈ {1, 0, absent}); a non-bool pass is a missing read; SPEC-regen: a non-bool pass
    'silent or broken arms (arm_ok false, any row)': sorted(r['id'] for r in G if r.get('arm_ok') is False),
    'undeclared unarmed judged rows': sorted(r['id'] for r in judged if not r.get('arm') and not r.get('arm_note') and r['id'] != 'SPEC-regen'),
    'reverse pins broken (declared no-read rows)': sorted(r['id'] for r in declared if r.get('noread_pin_ok') is False),
    'spec regeneration mismatch': sorted(r['id'] for r in G if r['id'] == 'SPEC-regen' and r.get('pass') is False),
    'synthetic force rows present': sorted(r['id'] for r in G if str(r.get('id', '')).startswith(('ARM-force-', 'ARM-missing-'))),
}
surv_txt = '; '.join(f"{k}: {v if v else 'none'}" for k, v in terms.items())
bool_rows = [r for r in judged if r['id'] != 'SPEC-regen' and isinstance(r.get('measured'), bool)]; bool_exempt = sorted(r['id'] for r in bool_rows if r['id'] in exempt_ids)   # FIX19 F4(c): exempt-name rows survive on column (c) and are NOT counted as boolean checks
bchecks = sorted(r['id'] for r in bool_rows if r['id'] not in exempt_ids and boolcheck_ok(r)); bbad = sorted(r['id'] for r in bool_rows if r['id'] not in exempt_ids and not boolcheck_ok(r)); nonnum_other = sorted(r['id'] for r in judged if r['id'] != 'SPEC-regen' and not isinstance(r.get('measured'), bool) and not isnum(r.get('measured'))); spec_nb = sorted(r['id'] for r in judged if r['id'] == 'SPEC-regen' and not isinstance(r.get('pass'), bool))
print(f"[chain41] GATE BOOLEAN CHECKS (final regate, Z7 b′): self-consistent boolean checks on judged rows {len(bchecks)} {bchecks}; boolean rows NOT self-consistent (missing read) {len(bbad)} {bbad}; of which exempt-name survivors (column c, not counted) {len(bool_exempt)} {bool_exempt}; judged rows with a str/NaN/None/absent measured (missing read) {len(nonnum_other)} {nonnum_other}; SPEC-regen with a non-bool pass {len(spec_nb)} {spec_nb} — rule: pass == the producer's judge(op, target, pm) on 1/0 (FIX19 F4 b); the producer's kind='boolean' field is tracked in GH-844")
fails = sorted(r['id'] for r in judged if r.get('pass') is False and r['id'] != 'SPEC-regen')
# Q2: the json is bound to the regate exit it would lift — mtime inside the regate log's gate step window; zero failing rows beside exit 3 is an instrument failure
binding = 'not checked (no regate log given)'; bound = True
if regate_log and os.path.exists(regate_log):
    import re as _re
    lt = open(regate_log, errors='replace').read()
    m1 = _re.findall(r'\[seal\] step gate (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)', lt); m2 = _re.findall(r'FAILED at gate exit \d+ (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)', lt)
    if not m1: binding = f'UNBOUND: the regate log {regate_log} carries no [seal] step gate line'; bound = False
    else:
        t0 = datetime.datetime.strptime(m1[-1], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc).timestamp() - 1
        t1 = (datetime.datetime.strptime(m2[-1], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc).timestamp() if m2 else t0 + 121) + 2
        mt = os.path.getmtime(gpath); mts = datetime.datetime.fromtimestamp(mt, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        if t0 <= mt <= t1: binding = f'BOUND: {gpath} mtime {mts} lies inside the gate step window [{m1[-1]}−1s, {(m2[-1] if m2 else "step+120s")}+2s] of {regate_log}'
        else: binding = f'UNBOUND: {gpath} mtime {mts} is OUTSIDE the gate step window [{m1[-1]}−1s, {(m2[-1] if m2 else "step+120s")}+2s] of {regate_log} — the json is not the one that regate wrote'; bound = False
elif regate_log: binding = f'UNBOUND: regate log {regate_log} absent'; bound = False
def cen(p):
    try: return json.load(open(p + '/default/predator_apex_9ft/studioqueue/census.json')).get('contract', {})
    except Exception: return {}
boots = [('attempt 3 (merged 0ba17deb, 04:12Z)', root + '/after-land41-studioqueuelonglegacy.attempt3-stall8583-kept'), ('resume 2 (merged 0ba17deb, 06:08Z)', root + '/after-land41-studioqueuelonglegacy'), ('DIAG on the A root (the lane\'s own 782b6a73, 06:21Z — the control)', root + '/diag-l41-studioqueuelonglegacy-Aroot')]
pre = []
for n, p in boots:
    c = cen(p); w, s = c.get('venueWaitedMs'), c.get('venueStallMs')
    notmet = isinstance(w, (int, float)) and isinstance(s, (int, float)) and s >= w - 15000
    pre.append((n, w, s, notmet))
allnotmet = len(pre) == 3 and all(x[3] for x in pre)
summ = '; '.join(f"{n}: waited {w} stall {s} → precondition {'NOT met' if nm else 'MET (the plant could have fired and did not)'}" for n, w, s, nm in pre)
ref = 'land39 reference (the last time the plant fired, 2026-09-14 19:xxZ on 782b6a73): waited 18031 stall 433 degrade 1 bakes 1'
for tl in table_lines: print(f"[chain41] GATE TRUTH TABLE ({label}): {tl}")
print(f"[chain41] GATE JSON BINDING ({label}): {binding}; regate exit given: {regate_exit} — an mtime-inside-window PROXY (the regate log names no digest or row count; a byte-edited json with its mtime preserved reads BOUND)")
import hashlib as _h; print(f"[chain41] GATE JSON DIGEST ({label}): sha256 {_h.sha256(open(gpath, 'rb').read()).hexdigest()} rows {len(G)} — recorded for a later round to bind by digest; not a binding this round")
anysurv = any(terms.values()); anyfail = bool(fails) or any(terms.values())
if not bound: word = 'UNJUDGEABLE-INSTRUMENT'; why = f"the gate json is not bound to the regate exit — {binding}; nothing is lifted"
elif regate_exit == '3' and not anyfail: word = 'UNJUDGEABLE-INSTRUMENT'; why = f"the regate exited 3 but the bound json carries NO failing row and no surviving term — the json cannot be the one that failed ({binding}); nothing is lifted"
elif anysurv: word = 'FAIL'; why = f"a failure the exemption may not lift survives — {surv_txt}; truth table: {' | '.join(table_lines)}; measured-value failing rows {fails}"
elif not fails: word = 'PASS'; why = f'no failing row; surviving terms — {surv_txt}; {binding}'
elif len(lifted) == len(fails) and allnotmet: word = 'PASS-WITH-UNJUDGEABLE (3 rows: plant precondition not met — instrument, #837)'; why = f"every failing row LIFTED on all truth-table columns ({len(lifted)}: {[i for i, _ in lifted]}); surviving terms — {surv_txt}; {binding}; {summ}; {ref}"
elif len(lifted) == len(fails): word = 'FAIL'; why = f"the exempted rows fail but the precondition was MET on a measured boot — a real red: {summ}"
else: word = 'FAIL'; why = f"failing rows {fails} are not all LIFTED ({len(lifted)} lifted) — surviving terms — {surv_txt}"
print(f"[chain41] GATE CLASSIFICATION ({label}): {word} — {why}")
open(os.environ['OB_L41V_TMPP'] + '-gateword.txt', 'w').write(word); sys.exit(0 if word.startswith('PASS') else 1)
PY
}
# ---------------------------------------------------------------- 6b. the atelier-gate reading (the SECOND ruled change; rule as re-ruled 09:2xZ)
LANE_ROOT=${SELF:h:h:h}
classify_atelier() {  # a SCRIPT: run 4's log (B5 by the land39 instrument), run 2's log (Q698 OK, no fresh red arm), main's CI job log (Q698 OK), the static path check (git, in the lane worktree); prints every reading; writes "$OB_L41V_TMPP-atelierword.txt"; returns 0 iff the word is the ruled one
  /usr/local/bin/python3 - output/lighting/land41-atelier.log output/lighting/land41-atelier-run2.log output/lighting/ci-34868564371-e2e-atelier-job104058477367.log "$LANE_ROOT" <<'PY'
import sys, re, json, hashlib, os, subprocess
run4, run2, ci, lane = sys.argv[1:5]
PV = 'output/lighting/q698-probe-verdict.txt'
PSHA = hashlib.sha256(open(PV, 'rb').read()).hexdigest() if os.path.exists(PV) else 'absent'
WORD = ("PASS-WITH-UNJUDGEABLE (B5 ×2 healthy payload) + FLAKE-NAMED (Q698 2/2 on the merged tree: main's 200 ms wall-clock guess against a 120 ms CSS delay; the probe shows the same starvation profile on both trees — numbers in output/lighting/q698-probe-verdict.txt sha256 " + PSHA + "; main 7b838c06 CI Q698 OK was one sample; static path check attached) + SET-ASIDE BY RULING (B2 ×1, H ×1 in run 2: main's timing arms, 1/2 on the merged tree, green in run 4 and main CI, static path checks attached, ruling text in q698-run2-ruled-arms.txt)")
IDS = ['ob-shell-quickplay-wrap', 'ob-shell-decision', 'osd-btns', 'ob-atelier-host', 'ob-shell-rail', 'ob-shell-place', 'ob-shell-cards', '__shell', '__atelier', '__rules', 'setMatchState', 'pendingDecision', 'syncDecisionPrompt']
IDRX = re.compile(r'ob-shell-quickplay-wrap|ob-shell-decision|decision-up|osd-btns|ob-atelier-host|ob-shell-rail|ob-shell-place|ob-shell-cards|__shell\b|__atelier\b|__rules\b|setMatchState|pendingDecision|syncDecisionPrompt')
LANE_OWNED = ['web/app/main.js', 'web/app/ballset.js', 'web/scene/gi.js', 'web/scene/ballset.js', 'web/scene/shading.js', 'web/scene/room.js', 'web/scene/venueflag.js', 'web/scene/occlusionlut.js', 'web/scene/lightingvisuals.js', 'web/scene/look.js', 'web/scene/lampfade.js']
def strip(l): return re.sub(r'^\d{4}-\d{2}-\d{2}T[\d:.]+Z ', '', l.rstrip('\r'))  # a CI job log prefixes every line with its timestamp
def read(p): return None if not os.path.exists(p) else [strip(l) for l in open(p, errors='replace').read().split('\n')]
def fails(L): return [l for l in L if l.startswith('E2E-ATELIER FAIL: ')]
def arm(l):
    m = re.match(r'E2E-ATELIER FAIL: ([A-Za-z0-9]+)[ :]', l); return m.group(1) if m else '?'
def payload(l):
    j = l.find(': {')
    if j < 0: return None
    try: return json.loads(l[j + 2:])
    except Exception as e: return {'_unparsable': str(e)}
def census(F):
    c = {}
    for l in F: c[arm(l)] = c.get(arm(l), 0) + 1
    return c
def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()
out, problems, instr = [], [], []
def gd(args):  # FIX11 L3: git is never trusted silently — a non-zero rc is an instrument failure, reported by name
    r = subprocess.run(['git', '-C', lane] + args, capture_output=True, text=True)
    if r.returncode != 0: e1 = (r.stderr.strip().split('\n')[0] + (' …' if '\n' in r.stderr.strip() else ''))[:160]; instr.append(f"git {' '.join(args[:3])}… could not run: git rc {r.returncode}: {e1}")
    return r
L4, L2, LC = read(run4), read(run2), read(ci)
for name, L, p in (('run 4', L4, run4), ('run 2', L2, run2), ('main CI 34868564371 job 104058477367', LC, ci)):
    if L is None: problems.append(f'{name} log absent ({p})')
    elif not any(l.startswith('E2E-ATELIER:') for l in L): problems.append(f'{name} log has no E2E-ATELIER summary line (the suite did not run to its end)')
if not problems:
    F4, F2, FC = fails(L4), fails(L2), fails(LC)
    out.append(f"[chain41] atelier run 4 (08:39–08:52Z, the gate as measured): FAIL rows {len(F4)} {census(F4)}; sha256 {sha(run4)}")
    out.append(f"[chain41] atelier run 2 (the land41 export again, ruling (A) 09:2xZ): FAIL rows {len(F2)} {census(F2)}; Q698 OK lines {sum(1 for l in L2 if l.startswith('Q698 OK'))}; sha256 {sha(run2)}")
    out.append(f"[chain41] atelier main CI (7b838c06, run 34868564371, job 104058477367, this runner class, < 24 h): FAIL rows {len(FC)} {census(FC)}; Q698 OK lines {sum(1 for l in LC if l.startswith('Q698 OK'))}; D OK lines {sum(1 for l in LC if l.startswith('D OK'))}; sha256 {sha(ci)}")
    for l in [l for l in F4 if arm(l) == 'Q698']: out.append('[chain41] atelier run 4 Q698 row (verbatim, for the main issue): ' + l)
    # (1) B5 by the land39 phase-3 instrument, unchanged, over run 4's rows; no FAIL arm outside {B5, Q698} in run 4
    b5 = [l for l in F4 if arm(l) == 'B5']; pay = [payload(l) for l in b5]; pay = [q for q in pay if q is not None]; live = [(q.get('rail') or {}).get('live') if isinstance(q, dict) else None for q in pay]
    other4 = sorted(set(census(F4)) - {'B5', 'Q698'})
    if other4: problems.append(f'run 4 FAIL arms {other4} are neither B5 nor Q698')
    if len(b5) != 2: problems.append(f'run 4 B5 rows x{len(b5)} (the ruled word names x2)')
    elif not pay: problems.append('B5 without any payload — the shape cannot be read')
    elif any(v is not True for v in live): problems.append(f'a B5 payload has rail.live {live} (a landed poison / a real degrade failure)')
    out.append(f"[chain41] atelier B5 by the land39 phase-3 instrument (unchanged): run 4 FAIL arms {sorted(census(F4))}; {len(pay)} B5 payload(s) rail.live {live} (the poison never landed: the healthy atelier); citation: ballreturn §29.26an (20 of 21 archived B5 reds carry exactly this payload), e2e-atelier.mjs:912-915 bare if falls through to clickRow")
    # (2) run 2 in the record; every red arm outside {B5, Q698} set aside BY A NAMED RULING (only B2 / H may be named; each entry carries its files; the diff stat is RECOMPUTED here)
    rp = 'output/lighting/q698-run2-ruled-arms.txt'; ruled = {}
    if os.path.exists(rp):
        for l in open(rp, errors='replace'):
            if '|' not in l or not l.strip(): continue
            parts = [x.strip() for x in l.split('|')]; a = parts[0]; text = parts[1] if len(parts) > 1 else ''
            filesf = next((x[len('files:'):].split() for x in parts if x.startswith('files:')), None)
            win = next((x[len('window:'):].strip() for x in parts if x.startswith('window:')), None)
            ruled[a] = {'text': text, 'files': filesf, 'window': win}
    q2 = [l for l in F2 if arm(l) == 'Q698']; ok2 = [l for l in L2 if l.startswith('Q698 OK')]
    out.append(f"[chain41] atelier run 2 Q698: FAIL rows {len(q2)} ({', '.join(m.group(1) for m in (re.match(r'E2E-ATELIER FAIL: Q698 (\S+)', l) for l in q2) if m)}), OK lines {len(ok2)} — with run 4: Q698 red on 2/2 runs of the merged tree (3 of 4 viewport cells); whose starvation it is is the PROBE's reading below, not this count's")
    for a, e in ruled.items():
        if a not in ('B2', 'H'): problems.append(f'the ruled-arms file names {a}, which the ruling did not name (only B2 / H)'); continue
        if not e['files']: problems.append(f'the {a} ruling entry carries no static-check files (a set-aside without its static check is not a set-aside)'); continue
        r = gd(['diff', '--stat', '7b838c06..0ba17deb', '--'] + e['files']); st = r.stdout.strip() if r.returncode == 0 else None
        lo = sorted(set(e['files']) & set(LANE_OWNED))
        out.append(f"[chain41] atelier run 2 arm {a} x{census(F2).get(a, 0)} set aside BY RULING: {e['text']} | static check recomputed over {len(e['files'])} file(s) [{' '.join(e['files'])}] → lane diff stat {('COULD NOT RUN (git rc ' + str(r.returncode) + ')') if st is None else ('EMPTY' if not st else 'NON-EMPTY: ' + st.replace(chr(10), ' | '))}; lane-owned on the path: {lo or 'none'}")
        if st is None: problems.append(f'the {a} set-aside static check could not run (git rc {r.returncode})')
        elif st or lo: problems.append(f'the {a} set-aside fails its static check (diff stat {"non-empty" if st else "empty"}, lane-owned {lo})')
        if e.get('window'):  # FIX11 L5 (ruling 13:3xZ): the measured window of the arm's own suite code must be main's verbatim — old side = git show 7b838c06:<file> (rc-checked), new side = the working-tree file (or, in cell A7, the planted copy named by output/lighting/q698-window-plant.txt); hunks by line ranges (difflib), touching = any hunk whose new-side range meets the window
            mw = re.match(r'(\S+) from \"(.+?)\" to \"(.+?)\"$', e['window'])
            if not mw: problems.append(f'the {a} window field is malformed: {e["window"]!r}')
            else:
                wf, anc_a, anc_b = mw.groups(); wp = os.path.join(lane, wf); plantf = 'output/lighting/q698-window-plant.txt'
                cell = os.environ.get('OB_CHAIN_SELFTEST', '')
                if os.path.exists(plantf) and cell == 'A7-plantedwindow': wp = open(plantf).read().strip().split('\n')[0]; out.append(f'[chain41] atelier run 2 arm {a} window check: NEW side read from the PLANT file {plantf} → {wp} (cell A7 only)')
                elif os.path.exists(plantf): problems.append(f'plant file present in the record: {plantf} — honoured only under OB_CHAIN_SELFTEST=A7-plantedwindow (this run: {cell or "unset"}); the H set-aside is refused by name')
                ro = gd(['show', f'7b838c06:{wf}'])
                wl = open(wp, errors='replace').read().split('\n') if os.path.exists(wp) else []
                la = next((i + 1 for i, l in enumerate(wl) if anc_a in l), None); lb = next((i + 1 for i, l in enumerate(wl) if anc_b in l and (la is None or i + 1 > la)), None)
                if ro.returncode != 0: problems.append(f'the {a} window check could not run (git show rc {ro.returncode})')
                elif not wl: problems.append(f'the {a} window check: the new-side file {wp} is unreadable')
                elif la is None or lb is None or la > lb: problems.append(f'the {a} window anchors did not resolve in {wp} (from line {la} to {lb})')
                else:
                    import difflib
                    ol = ro.stdout.split('\n'); hunks = []
                    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, ol, wl, autojunk=False).get_opcodes():
                        if tag == 'equal': continue
                        hunks.append((tag, j1 + 1, max(j2 - j1, 0)))  # new-side start (1-based), length (0 = a pure deletion at that point)
                    touching = [f'{t}@+{c},{n}' for t, c, n in hunks if c <= lb and c + max(n, 1) - 1 >= la]
                    out.append(f"[chain41] atelier run 2 arm {a} measured window: {wf} lines {la}–{lb} (from {anc_a!r} to {anc_b!r}; new side {wp}) vs git show 7b838c06:{wf} — lane hunks (kind@+new-start,len): {[f'{t}@+{c},{n}' for t, c, n in hunks]}; touching the window: {touching or 'NONE — the window is main' + chr(39) + 's verbatim'}")
                    if touching: problems.append(f'the {a} measured window carries a lane hunk: {touching}')
    fresh2 = sorted(set(census(F2)) - {'B5', 'Q698'} - set(ruled))
    if fresh2: problems.append(f'run 2 reads a red arm outside B5/Q698 that no ruling set aside: {fresh2} (rows: ' + ' || '.join(l[:160] for l in F2 if arm(l) in fresh2) + ') — reported, never absorbed')
    if census(F2).get('B2', 0) != 1 or census(F2).get('H', 0) != 1: problems.append(f"run 2's B2/H counts {census(F2).get('B2', 0)}/{census(F2).get('H', 0)} are not the ruled ×1/×1")
    # (3) main CI: Q698 OK and no Q698 row
    qc = [l for l in FC if arm(l) == 'Q698']; okc = [l for l in LC if l.startswith('Q698 OK')]
    if qc or not okc: problems.append(f'main CI does not read Q698 OK (Q698 FAIL rows {len(qc)}, OK lines {len(okc)})')
    # (4) the static path check, computed by git in the lane worktree: the files that define or style what the census reads
    files = set()
    for root_, _, fs in os.walk(os.path.join(lane, 'web/app')):
        for f in fs:
            if not f.endswith(('.js', '.css', '.html')): continue
            q = os.path.join(root_, f); t = open(q, errors='replace').read()
            if any(i in t for i in IDS): files.add(os.path.relpath(q, lane))
    extra = 'output/lighting/q698-path-extra.txt'
    if os.path.exists(extra):
        ex = [l.strip() for l in open(extra) if l.strip()]; files |= set(ex); out.append(f'[chain41] static path check: {len(ex)} extra path file(s) read from {extra}: {ex}')
    files = sorted(files)
    if not files: problems.append('the static path check enumerated no path file — the census identifiers were not found under web/app')
    rs = gd(['diff', '--stat', '7b838c06..0ba17deb', '--'] + (files or ['/dev/null'])); stat = rs.stdout.strip() if rs.returncode == 0 else None
    onpath = sorted(set(files) & set(LANE_OWNED))
    rh = gd(['diff', '7b838c06..0ba17deb', '--', 'web/app/main.js']); hunks = rh.stdout.split('\n') if rh.returncode == 0 else []
    hits = [l for l in hunks if l[:1] in '+-' and not l.startswith(('+++', '---')) and IDRX.search(l)]
    out.append(f"[chain41] static path check (git -C {lane} diff --stat 7b838c06..0ba17deb -- <path files>): {len(files)} path files [{' '.join(files)}] → lane diff stat {('COULD NOT RUN (git rc ' + str(rs.returncode) + ': ' + rs.stderr.strip()[:80] + ')') if stat is None else ('EMPTY' if not stat else 'NON-EMPTY: ' + stat.replace(chr(10), ' | '))}; lane-owned files on the path: {onpath or 'none'}; lane web/app/main.js hunk lines naming a path identifier: {('COULD NOT RUN' if rh.returncode != 0 else len(hits))}{' ' + str(hits[:3]) if hits else ''}")
    if stat is None: problems.append(f'static path check could not run: git rc {rs.returncode}: {rs.stderr.strip()[:120]}')
    elif stat: problems.append('the static path check names a lane hunk on the path (diff stat non-empty)')
    if onpath: problems.append(f'lane-owned file(s) on the path: {onpath}')
    if hits: problems.append(f'lane main.js hunk(s) name a path identifier: {hits[:3]}')
    # (5) the probe's verdict (tools/render/lighting-q698-probe.mjs --analyze over output/lighting/q698-probe-l41.jsonl; rule fixed by the ruling before the run)
    if not os.path.exists(PV): problems.append(f'no probe verdict at {PV} — the A/B has not been analyzed')
    else:
        pl = open(PV, errors='replace').read().split('\n'); pword = pl[0].strip(); pline = next((l for l in pl if 'VERDICT' in l), '')
        pj = 'output/lighting/q698-probe-l41.jsonl'; pjsha = hashlib.sha256(open(pj, 'rb').read()).hexdigest() if os.path.exists(pj) else 'absent'
        out.append(f'[chain41] atelier Q698 probe verdict ({PV} sha256 {PSHA}; jsonl sha256 {pjsha}): {pline[:420]}')
        if pword in ('UNJUDGEABLE-INSTRUMENT', 'VOID'): instr.append(f'the probe REFUSED to classify ({pword}): {pline[:200]} — the atelier classification is UNJUDGEABLE-INSTRUMENT, not FAIL (FIX14 O3e)')
        elif pword != 'FLAKE-NAMED': problems.append(f'the probe reads {pword}, not FLAKE-NAMED — ' + ("the lane's render cost is the cause (FIX round)" if pword == 'LANE-CAUSED' else 'UNDECIDED: the orchestrator decides with the numbers') + '; B2/H are NOT set aside under that reading either')
if not problems: word = WORD; why = "run 4's B5 rows carry the healthy-atelier payload; Q698 red on both merged-tree runs while main's CI reads Q698 OK; no lane hunk on the Q698 path; the page-side probe reads FLAKE-NAMED (both trees starve the same); B2/H of run 2 set aside by the named ruling with their static checks recomputed EMPTY"
elif instr: word = 'UNJUDGEABLE-INSTRUMENT'; why = 'a static check could not run — the word is not granted and nothing is read as EMPTY: ' + '; '.join(instr) + ((' | other problems: ' + '; '.join(problems)) if problems else '')
else: word = 'FAIL'; why = 'the ruled word is not granted: ' + '; '.join(problems)
for l in out: print(l)
print(f"[chain41] ATELIER CLASSIFICATION: {word} — {why}")
open(os.environ['OB_L41V_TMPP'] + '-atelierword.txt', 'w').write(word); sys.exit(0 if word == WORD else 1)
PY
}
GWOUT=output/lighting/chain-land41.gateword; [ "$ST" = unset ] || GWOUT=output/lighting/chain-land41.gateword.selftest-$ST
_verdict_orig=$(functions verdict); eval "${_verdict_orig/verdict ()/verdict_orig ()}"
verdict() {
  local GWTXT="(no reclassification this run: final regate exit ${FRC:-unset})"
  if [ "${FRC:-1}" = 3 ]; then classify_gate "final regate" output/lighting/gate-land41.json output/lighting output/lighting/seal-land41-regate-final.log 3 && { echo "[chain41] final regate exit 3 ACCEPTED under the classification ($(cat "$OB_L41V_TMPP-gateword.txt")) — FRC treated as 0 for the verdict; the word rides in the record"; FRC=0; }
    # FIX15 Q3: the word file must be THIS run's — never a stale /tmp file from an earlier invocation
    [ "$(stat -f %m "$OB_L41V_TMPP-gateword.txt" 2>/dev/null || echo 0)" -ge "${RUN_EPOCH:-0}" ] || refuse "$OB_L41V_TMPP-gateword.txt is older than this run's START — classify_gate did not write it this invocation"
    GWTXT=$(cat "$OB_L41V_TMPP-gateword.txt")
  fi
  # FIX13 (a defect this round surfaced): a NON-PASS word never overwrites the ruled gateword file — it goes to a .last-red sidecar; the record's word file keeps the classification that granted it
  local gwline="[chain41] GATE-WORD for the verdict: $GWTXT | stalls attempt 3 8583 / resume 2 7250 / DIAG A root 7767 (wait − budget ≈ 3033–3257 ms); land39 433 (2026-09-14 19:xxZ) | classifier arms: both RED arms read FAIL"
  case "$GWTXT" in PASS*) echo "$gwline" | tee $GWOUT;; *) echo "$gwline" | tee "$GWOUT.last-red"; echo "[chain41] GATE-WORD not written to $GWOUT (a non-PASS word never overwrites the ruled word file; kept in $GWOUT.last-red)";; esac
  echo "[chain41] VERDICT stamp $(date -u +%FT%TZ) driver $(shasum -a 256 "$SELF" | cut -c1-12) — the VERDICT line follows (verdict() is run 4's function plus the two ruled hunks; the stamp rides beside it, not inside it)"
  verdict_orig "$@"; }
verdict
