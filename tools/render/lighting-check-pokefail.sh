#!/bin/zsh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# ORDER-LIGHT-C2-FIX3 class C — the judged step (C1 + C2) and, under OB_CAPTURE_POKERESULT=legacy, the red arm (pokefailcap):
#   C1. a --no-base --poke-raw run whose ASYNC poke rejects at once (inside the tool's 400 ms post-poke sleep: __pokeResult.error written and
#       __pokePending cleared before the tool looks) MUST be refused by name — the run is recorded failed, no frame is written under the poke,
#       the error names the poke label; the pre-fix tool skipped the inspection and captured with pokeApplied=true.
#   C2. a --no-base --poke-raw run whose async poke resolves LATE (1.5 s) is captured as before (pokeApplied=true, one run, unchanged).
# Exit 8 on any violation. Usage: tools/render/lighting-check-pokefail.sh <scratch dir>
set +e
D="${1:?scratch dir}"; case "$D" in output/lighting/*pokefail*) ;; *) echo "[check-pokefail] refusing $D (not under output/lighting/*pokefail*)"; exit 9;; esac
[ -e "$D" ] && rm -rf -- "${D:?}"; mkdir -p "$D"
CAP=(node tools/render/lighting-capture.mjs --tables predator_apex_9ft --look default --poses cueball_level --flags venue=off)
"${CAP[@]}" --out "$D" > "$D/1-base.log" 2>&1 || { echo "[check-pokefail] the base capture failed ($(tail -1 "$D/1-base.log" | cut -c1-120))"; exit 8; }
FAILJS='pokefail=window.__pokePending = true; window.__pokeResult = null; Promise.reject(new Error("immediate rejection (the studio import shape)")).catch((e) => { window.__pokeResult = { error: "pokefail: " + String(e && e.message || e) }; window.__pokePending = false; });'
"${CAP[@]}" --out "$D" --no-base --poke-raw "$FAILJS" > "$D/2-pokefail.log" 2>&1; RC1=$?
LATEJS='pokelate=window.__pokePending = true; window.__pokeResult = null; setTimeout(() => { window.__pokeResult = { ok: true, late: true }; window.__pokePending = false; }, 1500);'
"${CAP[@]}" --out "$D" --no-base --poke-raw "$LATEJS" > "$D/3-pokelate.log" 2>&1; RC2=$?
python3 - "$D" "$RC1" "$RC2" <<'PY'
import json, sys, os, glob
d, rc1, rc2 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
m = json.load(open(f'{d}/manifest.json'))
pf = [r for r in m['runs'] if r.get('poke') == 'pokefail']; pl = [r for r in m['runs'] if r.get('poke') == 'pokelate']
log = open(f'{d}/2-pokefail.log', errors='replace').read()
frames = glob.glob(f'{d}/default/predator_apex_9ft/pokefail/*.png')
named = 'poke-raw pokefail: pokefail: immediate rejection' in log or any('pokefail: immediate rejection' in str(r.get('error') or '') for r in pf)
captured = any(r.get('pokeApplied') and not r.get('failed') for r in pf)
print(f'[check-pokefail] C1 pokefail: capture exit {rc1}, runs {len(pf)} (failed {sum(1 for r in pf if r.get("failed"))}, captured-as-success {sum(1 for r in pf if r.get("pokeApplied") and not r.get("failed"))}), frames under the poke {len(frames)}, refusal names the poke: {named}')
if rc1 == 0 or captured or frames or not named:
    print('[check-pokefail] C1 VIOLATION: an immediately-failed async poke was captured (or the refusal does not name the poke)'); sys.exit(8)
late_ok = rc2 == 0 and len(pl) == 1 and pl[0].get('pokeApplied') and not pl[0].get('failed') and (pl[0].get('pokeResult') or {}).get('late') is True
print(f'[check-pokefail] C2 pokelate: capture exit {rc2}, runs {len(pl)}, pokeApplied {pl[0].get("pokeApplied") if pl else None}, result {pl[0].get("pokeResult") if pl else None}')
if not late_ok:
    print('[check-pokefail] C2 VIOLATION: a late-resolving async poke is no longer captured as before'); sys.exit(8)
print('[check-pokefail] PASS — an async poke result is validated after the wait, always; an error is a refusal by name, never a capture')
PY
exit $?
