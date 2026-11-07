#!/bin/zsh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# ORDER-LIGHT-C2-FIX2 class C — the judged step (C1 + C2) and, under OB_CAPTURE_NOBASE_FILTER=legacy, the red arm (nobasekeep):
#   1. a base capture of ONE table / pose into a scratch dir (venue=off: cheap, no venue settle);
#   2. a --no-base --poke-raw continuation on the same dir → manifest.runs MUST still hold the baseline (poke null) record, and
#      lighting-render-reads.py MUST process that baseline (its table key appears in the reads) — C1;
#   3. a full recapture of the base → exactly ONE baseline record for (table, look) — C2.
# Exit 6 on any violation. Usage: tools/render/lighting-check-nobase.sh <scratch dir>
set +e
D="${1:?scratch dir}"; case "$D" in output/lighting/*nobase*) ;; *) echo "[check-nobase] refusing $D (not under output/lighting/*nobase*)"; exit 9;; esac
[ -e "$D" ] && rm -rf -- "${D:?}"; mkdir -p "$D"
CAP=(node tools/render/lighting-capture.mjs --tables predator_apex_9ft --look default --poses full34 --flags venue=off)
"${CAP[@]}" --out "$D" > "$D/1-base.log" 2>&1 || { echo "[check-nobase] the base capture failed ($(tail -1 "$D/1-base.log" | cut -c1-120))"; exit 6; }
"${CAP[@]}" --out "$D" --no-base --poke-raw 'noop=window.__pokeResult = { ok: true }' > "$D/2-nobase.log" 2>&1 || { echo "[check-nobase] the --no-base continuation failed ($(tail -1 "$D/2-nobase.log" | cut -c1-120))"; exit 6; }
python3 - "$D" <<'PY'
import json, sys
d = sys.argv[1]; m = json.load(open(f'{d}/manifest.json'))
base = [r for r in m['runs'] if r.get('table') == 'predator_apex_9ft' and r.get('look') == 'default' and (r.get('poke') or None) is None]
noop = [r for r in m['runs'] if r.get('poke') == 'noop']
print(f'[check-nobase] after the continuation: baseline records {len(base)}, noop records {len(noop)} (runs {len(m["runs"])})')
if len(base) != 1: print('[check-nobase] C1 VIOLATION: the baseline record was dropped by a --no-base continuation that never recaptured it'); sys.exit(6)
if len(noop) != 1: print('[check-nobase] C1 VIOLATION: the poke record is not exactly one'); sys.exit(6)
PY
[ $? = 0 ] || exit 6
python3 tools/render/lighting-render-reads.py --capture "$D" --out "$D/reads" > "$D/3-reads.log" 2>&1 || { echo "[check-nobase] render-reads failed ($(tail -1 "$D/3-reads.log" | cut -c1-120))"; exit 6; }
python3 - "$D" <<'PY'
import json, sys, glob
d = sys.argv[1]; hit = False
for f in glob.glob(f'{d}/reads/**/*.json', recursive=True):
    try: t = json.load(open(f))
    except Exception: continue
    s = json.dumps(t)
    if '"table": "predator_apex_9ft"' in s or "'predator_apex_9ft'" in s or '"predator_apex_9ft"' in s: hit = True; break
print(f'[check-nobase] render-reads processed the baseline: {hit}')
if not hit: print('[check-nobase] C1 VIOLATION: lighting-render-reads.py did not process the baseline (its key is absent from the reads)'); sys.exit(6)
PY
[ $? = 0 ] || exit 6
"${CAP[@]}" --out "$D" > "$D/4-recapture.log" 2>&1 || { echo "[check-nobase] the full recapture failed"; exit 6; }
python3 - "$D" <<'PY'
import json, sys
d = sys.argv[1]; m = json.load(open(f'{d}/manifest.json'))
base = [r for r in m['runs'] if r.get('table') == 'predator_apex_9ft' and r.get('look') == 'default' and (r.get('poke') or None) is None]
print(f'[check-nobase] after the full recapture: baseline records {len(base)} (C2: replaced exactly once)')
if len(base) != 1: print('[check-nobase] C2 VIOLATION: the recapture did not replace the baseline exactly once'); sys.exit(6)
print('[check-nobase] PASS — a baseline record is removed only by the invocation that recaptures it')
PY
exit $?
