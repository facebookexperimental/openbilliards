#!/bin/zsh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# lighting-check-ctrl.sh — ORDER-LIGHT-C2-FIX7 (the proportionate seal form): the control sets of the two CONTROL tables — predator_apex_9ft (the venue term runs) and wpa_spec_9ft (identity by design under its class-default canopy; declared per table x look in tools/render/fixtures/lighting-ctrl-venue.json and asserted both ways every run) — (A1 B1 B2 A2: A = the previous export's web root,
# B = this export's) are compared strictly (lighting-pixel-strict.py: float-for-float on the linear HDR + PNG bytes) in both orders (A1 vs B1, B2 vs A2)
# and same-web (A1 vs A2, B1 vs B2), and JUDGED by lighting-ctrl-judge.py with no authored number — C2-FIX8 seal form 2 (ruling 2026-09-13 after land25):
# the judged criterion is the cross pairs' PNG byte identity alone (the display quantum, strict); the HDR difference is RECORDED per cell in float32 ULP
# units beside the same-web pairs' statistics; plus the fence identity A1 vs B1 (--room-strict).
# ORDER-LIGHT-C2-FIX10 (maintainer rulings 2026-09-14 16:2xZ / 16:4xZ, after land34 + land35 attempt 1):
#  * the same-web pairs are the instrument's SELF-CHECKS and are evaluated FIRST — a cell whose side moved reads UNJUDGEABLE (instrument), exit 3, no tolerance;
#  * BOTH frames of every cell are judged: the boot frame (<look>/<table>/) and the converged frame (<look>/<table>/conv/, the poke's frame after its re-bakes);
#  * the SENSITIVITY row (condition 1): B2 vs after-<tag>-ctrlsens — this export's web booted the same way and then ONE SH coefficient (obVenueSH[0], the L0
#    term) moved by 2e-5 relative, inside the shipped 1e-4 tolerance; the comparison lives in the conv frame (the poke applies the perturbation after the last
#    re-bake). It must go RED and name the cells; identical bytes = the instrument is BLIND below the floor = UNJUDGEABLE (instrument blind), exit 3;
#  * the verdict line carries the CLAIM and the NON-CLAIM (condition 2): under venueConverge=strict, PNG identity means the two webs converge to the SAME
#    FIXED POINT — it does NOT mean the two webs render the same pixels under the shipped convergence law (venueConverge=iterate, rel <= 1e-4), which is
#    UNJUDGEABLE on a loaded box (the stopping round is a free variable) and remains OWED on a calm one. The mode is READ from B2's census, never assumed;
#  * ONE judge, two call sites (condition 3): --stage early (right after capture-ctrla2/ctrlsens in a capturing seal) | regate (the judges' pass); the stage
#    and the provenance of every input (five control sets, the off set when armed, the A1/B1 identity dumps: resolved path, manifest run id + sha + web root,
#    content digest) are printed and written beside the verdict, so a reader can confirm the early run saw what the regate run sees. Early outputs carry
#    the -early- infix; the regate's keep the names the report reads.
# Exit 3 on any failure, an UNJUDGEABLE verdict or a dead instrument. Arms: OB_CTRL_ARM=off (B1 vs the ?venue=off set as the first cross pair → FAIL),
# =blind (B2 itself fed to the sensitivity row → UNJUDGEABLE (instrument blind)), =selfcheck (the perturbed set in A2's place → UNJUDGEABLE (instrument),
# not FAIL). The seal reads the WORD from check-ctrl-<tag>-verdict.txt (never from its own log).
# usage: lighting-check-ctrl.sh <root> <tag> [--stage early|regate]   (OB_CTRL_TABLES overrides the two venue-term tables — smoke seam)
set -o pipefail  # C2-FIX8 M7: the line the second header rewrite of e456b37c dropped (the commit message and §L37 claimed it)
R="${1:?root}"; TAG="${2:?tag}"; shift 2; STAGE=regate
while [ $# -gt 0 ]; do case "$1" in --stage) STAGE="${2:?--stage needs early|regate}"; shift 2;; *) echo "[check-ctrl] unknown argument $1"; exit 3;; esac; done
case "$STAGE" in early|regate) ;; *) echo "[check-ctrl] --stage must be early|regate (got $STAGE)"; exit 3;; esac
T2="${OB_CTRL_TABLES:-predator_apex_9ft,wpa_spec_9ft}"; bad=0; ARM="${OB_CTRL_ARM:-}"
SFX=""; [ "$STAGE" = early ] && SFX="-early"; PFX="$R/check-ctrl-$TAG$SFX"
A1=$R/after-$TAG-ctrla1; B1=$R/after-$TAG-ctrlb1; B2=$R/after-$TAG-ctrlb2; A2=$R/after-$TAG-ctrla2; OFF=$R/after-$TAG-off; SENS=$R/after-$TAG-ctrlsens
VF="$R/check-ctrl-$TAG-verdict.txt"; : > "$VF"
VENUE_DECL_SRC="${OB_CTRL_VENUE_DECL:-tools/render/fixtures/lighting-ctrl-venue.json}"; VENUE_DECL="$VENUE_DECL_SRC"
[ -f "$VENUE_DECL_SRC" ] || { echo "[check-ctrl] UNJUDGEABLE (instrument) — the venue declaration $VENUE_DECL_SRC is missing (exit 3)" | tee -a "$VF"; exit 3; }
say() { echo "$@"; echo "$@" >> "$VF"; }
for d in $A1 $B1 $B2 $A2 $SENS; do [ -d "$d" ] || { say "[check-ctrl] UNJUDGEABLE (instrument) — missing control set $d (stage $STAGE; the sensitivity set is an input, not an option) (exit 3)"; exit 3; }; done
case "$ARM" in
  "") ;;
  off) [ -d "$OFF" ] || { say "[check-ctrl] ARM off: missing the off set $OFF (exit 3)"; exit 3; }; echo "[check-ctrl] ARM off: the first cross pair is the venue-ON control against the ?venue=off set — the judge must FAIL";;
  blind) echo "[check-ctrl] ARM blind: the sensitivity row is fed B2 itself in place of the perturbed set — the judge must read UNJUDGEABLE (instrument blind)"; SENS="$B2";;
  selfcheck) echo "[check-ctrl] ARM selfcheck: the perturbed set stands in A2's place — the A-side self-check must move and the judge must read UNJUDGEABLE (instrument), not FAIL"; A2="$SENS";;
  novenue) [ -d "$OFF" ] || { say "[check-ctrl] ARM novenue: missing the off set $OFF (exit 3)"; exit 3; }; echo "[check-ctrl] ARM novenue: the ?venue=off boot stands in B2's place — predator is DECLARED to run its venue term, the census reads derived 0: the judge must read RED (did not run where declared), never n/a"; B2="$OFF";;
  wpabroken) WB="$PFX-wpabroken-set"; python3 - "$B2" "$WB" <<'PY'
import json, os, shutil, sys
src, dst = sys.argv[1], sys.argv[2]
if os.path.isdir(dst): shutil.rmtree(dst)
shutil.copytree(src, dst, symlinks=False)                      # a REAL control set (links resolved), write-enabled copy
for root, _, files in os.walk(dst):
    for f in files: os.chmod(os.path.join(root, f), 0o644)
n = 0
for look in ('default', 'sp'):
    for frame in ('', 'conv'):
        p = os.path.join(dst, look, 'wpa_spec_9ft', frame, 'census.json') if frame else os.path.join(dst, look, 'wpa_spec_9ft', 'census.json')
        if not os.path.exists(p): continue
        j = json.load(open(p)); c = j.setdefault('contract', {})
        c['venueDerived'] = 0; c['venueError'] = 'PLANTED by OB_CTRL_ARM=wpabroken: canopy bake failed'; c['venueBakeCount'] = 1   # a defect in the EXCLUDED surface: not derived 1, not the never-ran signature
        json.dump(j, open(p, 'w'), indent=1); n += 1
print(f'[check-ctrl] ARM wpabroken: {n} wpa census file(s) of a copy of B2 planted with venueDerived 0 + venueError + bakeCount 1 (pixels untouched)')
PY
    echo "[check-ctrl] ARM wpabroken: the planted copy stands in B2's place — wpa is DECLARED identity by design, its census now shows an attempted/degraded venue term: the judge must read RED (the excluded surface is broken), never n/a"; B2="$WB";;
  decl) VENUE_DECL="$PFX-decl-arm.json"; python3 - "$VENUE_DECL_SRC" "$VENUE_DECL" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); d['predator_apex_9ft']['default'] = {'venue': 'identity-by-design', 'why': 'PLANTED by OB_CTRL_ARM=decl: a declaration the census contradicts'}
json.dump(d, open(sys.argv[2], 'w'), indent=1)
PY
    echo "[check-ctrl] ARM decl: a PLANTED declaration says predator/default is identity by design while its census reads derived 1 — the judge must read UNJUDGEABLE (instrument): the fixture changed under the declaration";;
  # --- ATTRIBUTION arms (maintainer ruling 2026-09-15 00:5xZ) BEGIN
  unattrib) UA="$PFX-unattrib-set"; python3 - "$B1" "$UA" <<'PY'
import os, shutil, sys
src, dst = sys.argv[1], sys.argv[2]
if os.path.isdir(dst): shutil.rmtree(dst)
shutil.copytree(src, dst, symlinks=False)                      # a REAL copy of B1 (links resolved), write-enabled
for root, _, files in os.walk(dst):
    for f in files: os.chmod(os.path.join(root, f), 0o644)
p = os.path.join(dst, 'default', 'predator_apex_9ft', 'conv', 'cueball_level.png'); b = bytearray(open(p, 'rb').read()); b[-1] ^= 0xFF; open(p, 'wb').write(bytes(b))
print(f'[check-ctrl] ARM unattrib: a copy of B1 with the LAST BYTE of {p} flipped (a CONVERGED-frame PNG difference; HDR, census and identity untouched) stands in for BOTH B1 and B2')
PY
    echo "[check-ctrl] ARM unattrib: the planted copy is B1 AND B2 (the B-side self-check holds, the sensitivity row still reads B2 vs the perturbed set, the boots are the real ones) and both attribution variants are pointed at A1 itself — no variant reproduces the planted conv difference, so it must read UNATTRIBUTED (a-lane) and the judge must FAIL, never PASS-WITH-ATTRIBUTED"; B1="$UA"; B2="$UA"; export OB_CTRL_ATTRIB_T="$A1" OB_CTRL_ATTRIB_H="$A1";;
  attribmissing) echo "[check-ctrl] ARM attribmissing: variant T is DECLARED at a path that holds no set — the judge must read UNJUDGEABLE (instrument), never ATTRIBUTED"; export OB_CTRL_ATTRIB_T="$R/after-$TAG-attribT-ABSENT-PLANT" OB_CTRL_ATTRIB_H="$A1";;
  # --- ATTRIBUTION arms END
  *) say "[check-ctrl] unknown OB_CTRL_ARM=$ARM (exit 3)"; exit 3;;
esac
# provenance of every input (condition 3): resolved path, manifest run id / sha / web root, a content digest over every file (links followed)
PROV="$PFX-inputs.txt"; : > "$PROV"
prov() { local name="$1" d="$2" rp mf rid sha web dg
  rp=$(readlink -f "$d" 2>/dev/null || echo "$d"); mf="$d/manifest.json"
  if [ -f "$mf" ]; then read -r rid sha web < <(python3 -c "import json,sys;m=json.load(open(sys.argv[1]));print(m.get('runId','?'),str(m.get('sha','?'))[:8],m.get('webDir','?'))" "$mf" 2>/dev/null || echo '? ? ?'); else rid='?'; sha='?'; web='?'; fi
  dg=$(cd "$d" 2>/dev/null && find -L . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256 2>/dev/null | shasum -a 256 | cut -c1-16); [ -n "$dg" ] || dg='(digest failed)'
  echo "[check-ctrl] input $name: $d -> $rp | run $rid sha $sha web $web | digest $dg" | tee -a "$PROV"; }
prov ctrla1 "$A1"; prov ctrlb1 "$B1"; prov ctrlb2 "$B2"; prov ctrla2 "$A2"; prov ctrlsens "$SENS"; [ "$ARM" = off ] && prov off "$OFF"
idprov() { local name="$1" d="$2" dg; dg=$(cd "$d" 2>/dev/null && find -L . -name identity.json -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256 2>/dev/null | shasum -a 256 | cut -c1-16)
  echo "[check-ctrl] input identity-$name: $d/*/*/identity.json ($(cd "$d" && find -L . -name identity.json | wc -l | tr -d ' ') files) | digest ${dg:-(digest failed)}" | tee -a "$PROV"; }
idprov a1 "$A1"; idprov b1 "$B1"
echo "[check-ctrl] stage $STAGE $(date -u +%FT%TZ) tables $T2 arm ${ARM:-none}" | tee -a "$PROV"
# the convergence law IN FORCE, read from B2's census (the B web's boot frame cell), never assumed
MODE=$(python3 - "$R/after-$TAG-ctrlb2" "${T2%%,*}" <<'PY'
import json, sys, os
d, t = sys.argv[1], sys.argv[2]
found = None
for sub in ('', 'conv'):
    p = os.path.join(d, 'default', t, sub, 'census.json') if sub else os.path.join(d, 'default', t, 'census.json')
    if not os.path.exists(p): continue
    m = json.load(open(p)).get('contract', {}).get('venueConvergeMode')
    if isinstance(m, str): found = m; break
    found = found or 'iterate(unrecorded)'
print(found or 'unknown')
PY
)
echo "[check-ctrl] convergence law in force (B2 census): venueConverge=$MODE" | tee -a "$PROV"
case "$MODE" in strict|iterate|off|"iterate(unrecorded)") ;; *) say "[check-ctrl] UNJUDGEABLE (instrument) — the convergence law could not be read from B2's census ($MODE) (exit 3)"; exit 3;; esac
echo "[check-ctrl] venue declaration: $VENUE_DECL$([ "$VENUE_DECL" != "$VENUE_DECL_SRC" ] && echo " (PLANTED arm copy of $VENUE_DECL_SRC)")" | tee -a "$PROV"
# the comparisons: cross + same on BOTH frames (boot, conv); the sensitivity pair on the conv frame
cmp() { local a="$1" b="$2" sub="$3" key="$4" LOGF JF prc  # key = file stem
  JF="$PFX-$key.json"; LOGF="$PFX-$key.log"
  echo "[check-ctrl] strict pixels ($sub): $(basename $a) vs $(basename $b)"
  # FAIL-CLOSED (C2-FIX7 slip 3, land23): the comparator's OWN exit decides (0 = identical, 3 = a difference, 4 = a cell it could not measure, anything else = dead)
  python3 tools/render/lighting-pixel-strict.py --a "$a" --b "$b" --tables $T2 --looks default,sp --poses full34,cueball_level ${sub:+--sub} ${sub:+$sub} --json "$JF" > "$LOGF" 2>&1; prc=$?
  grep '^\[pixel-strict\] \(PASS\|FAIL\|UNMEASURED\)' "$LOGF" || echo "[check-ctrl] DEAD: the comparator printed no verdict line (exit $prc)"
  case $prc in 0|3|4) ;; *) echo "[check-ctrl] DEAD INSTRUMENT: comparator exit $prc"; bad=$((bad+1));; esac; }
if [ "$ARM" = off ]; then C1A="$B1"; C1B="$OFF"; else C1A="$A1"; C1B="$B1"; fi
cmp "$C1A" "$C1B" ""     cross1-boot;  cmp "$B2" "$A2" ""     cross2-boot;  cmp "$A1" "$A2" ""     sameA-boot;  cmp "$B1" "$B2" ""     sameB-boot
cmp "$C1A" "$C1B" conv   cross1-conv;  cmp "$B2" "$A2" conv   cross2-conv;  cmp "$A1" "$A2" conv   sameA-conv;  cmp "$B1" "$B2" conv   sameB-conv
cmp "$B2" "$SENS" conv   sens-conv
# AMENDMENT 1 follow-through (maintainer 17:1xZ): the boot frame's classification is a TRANSFER from the conv frame — the two frames of one boot are two
# different images (the poke's re-bakes refresh the environment), and how far apart they sit decides how much the transfer is worth; measured on B2 here
cmp2() { local a="$1" b="$2" suba="$3" subb="$4" key="$5" JF LOGF prc; JF="$PFX-$key.json"; LOGF="$PFX-$key.log"
  echo "[check-ctrl] strict pixels (${suba:-boot} vs ${subb:-boot}): $(basename $a) vs $(basename $b)"
  python3 tools/render/lighting-pixel-strict.py --a "$a" --b "$b" --tables $T2 --looks default,sp --poses full34,cueball_level --sub-a "$suba" --sub-b "$subb" --json "$JF" > "$LOGF" 2>&1; prc=$?
  grep '^\[pixel-strict\] \(PASS\|FAIL\|UNMEASURED\)' "$LOGF" || echo "[check-ctrl] DEAD: the comparator printed no verdict line (exit $prc)"
  case $prc in 0|3|4) ;; *) echo "[check-ctrl] DEAD INSTRUMENT: comparator exit $prc"; bad=$((bad+1));; esac; }
cmp2 "$B2" "$B2" "" conv b2-boot-vs-conv
# the perturbation record comes from the REAL sensitivity set (an arm's stand-in for the pixels keeps the declared stimulus — the blind plant is "a declared move the comparator did not see")
PERT=$(python3 - "$R/after-$TAG-ctrlsens" "$T2" <<'PY'
import json, sys, os
d, tables = sys.argv[1], sys.argv[2].split(','); out = {}
for look in ('default', 'sp'):
    for t in tables:
        p = os.path.join(d, look, t, 'conv', 'census.json')
        try:
            c = json.load(open(p)).get('contract', {}); out[f'{look}/{t}'] = {'perturb': c.get('ctrlPerturb'), 'uniformL1': c.get('venueUniformL1'), 'derived': c.get('venueDerived')}
        except Exception as e: out[f'{look}/{t}'] = {'error': str(e)}
print(json.dumps(out))
PY
)
# --- ATTRIBUTION (guarded by OB_CTRL_ATTRIB_T / OB_CTRL_ATTRIB_H; maintainer ruling 2026-09-15 00:5xZ — the four-word reading on a merged tree) BEGIN
# A main-only VARIANT is a capture of the pre-merge lane web (A's web) with ONLY one of main's render inputs applied (T = web/scene/table.js; H = web/app.html + kit.css),
# control-shaped (same tables, looks, poses, poke). With both envs unset this block adds nothing and the judge runs its old path. A declared variant whose set is
# missing is UNJUDGEABLE (instrument) — never attributed. Each variant is compared against A1 and B1 on both frames; the judge classifies every cross-pair PNG
# difference per cell from those four records (ATTRIBUTED only when exactly one variant reproduces B1 and the other equals A1).
ATTRIB_OPT=()
if [ -n "${OB_CTRL_ATTRIB_T:-}${OB_CTRL_ATTRIB_H:-}" ]; then
  for V in T H; do eval "AD=\${OB_CTRL_ATTRIB_$V:-}"; [ -n "$AD" ] || continue
    [ -d "$AD" ] || { say "[check-ctrl] UNJUDGEABLE (instrument) — attribution variant $V declared at $AD but the set is missing (exit 3)"; exit 3; }
    prov "attrib$V" "$AD"
    cmp "$AD" "$A1" ""   attrib$V-vsA1-boot; cmp "$AD" "$B1" ""   attrib$V-vsB1-boot; cmp "$AD" "$A1" conv attrib$V-vsA1-conv; cmp "$AD" "$B1" conv attrib$V-vsB1-conv
    ATTRIB_OPT+=("$V=$PFX-attrib$V")
  done
  [ ${#ATTRIB_OPT} -gt 0 ] && ATTRIB_OPT=(--attrib "${ATTRIB_OPT[@]}")
  echo "[check-ctrl] attribution variants declared: ${ATTRIB_OPT[*]:-none}"
fi
# --- ATTRIBUTION END
# AMENDMENT 3 (maintainer 17:0xZ): every control boot's convergence numbers, per cell and frame, from the census — the judge asserts settleRel == 0 AND
# rounds < max on each strict boot BEFORE anything else (a boot that hit VENUE_CONVERGE_MAX with a residual is "stop at round 8" = the original defect
# under the new name: UNJUDGEABLE (instrument), never PASS, never FAIL); a table whose venue term never ran (identity by design) is n/a, a degraded boot is void
BOOTS="$PFX-boots.json"
python3 - "$BOOTS" "$T2" "ctrla1=$A1" "ctrlb1=$B1" "ctrlb2=$B2" "ctrla2=$A2" "ctrlsens=$SENS" <<'PY'
import json, sys, os
out, tables = [], sys.argv[2].split(',')
for kv in sys.argv[3:]:
    name, d = kv.split('=', 1)
    for look in ('default', 'sp'):
        for t in tables:
            for frame in ('boot', 'conv'):
                p = os.path.join(d, look, t, 'census.json') if frame == 'boot' else os.path.join(d, look, t, 'conv', 'census.json')
                rec = {'set': name, 'cell': f'{look}/{t}', 'frame': frame, 'path': p}
                try:
                    c = json.load(open(p)).get('contract', {})
                    for k, kk in (('mode', 'venueConvergeMode'), ('rel', 'venueConvergeRel'), ('max', 'venueConvergeMax'), ('settleRounds', 'venueSettleRounds'), ('settleRel', 'venueSettleRel'), ('settled', 'venueSettled'), ('bakeCount', 'venueBakeCount'), ('bakeCold1', 'venueBakeCold1'), ('derived', 'venueDerived'), ('derivable', 'venueDerivable'), ('error', 'venueError'), ('uniformL1', 'venueUniformL1'), ('waitedMs', 'venueWaitedMs')):
                        rec[k] = c.get(kk)
                except Exception as e: rec['error'] = str(e)
                out.append(rec)
json.dump(out, open(sys.argv[1], 'w'), indent=1)
PY
CLAIMF="$PFX-claim.txt"
python3 tools/render/lighting-ctrl-judge.py --stage "$STAGE" --mode "$MODE" --provenance "$PROV" --perturb "$PERT" --boots "$BOOTS" --claim-out "$CLAIMF" --frames "$PFX-b2-boot-vs-conv.json" --venue-decl "$VENUE_DECL" --arms "${OB_CTRL_ARMS:-}" --arms-src "${OB_CTRL_ARMS_SRC:-}" \
  --cross "$PFX-cross1-boot.json" "$PFX-cross2-boot.json" --same "$PFX-sameA-boot.json" "$PFX-sameB-boot.json" \
  --cross-conv "$PFX-cross1-conv.json" "$PFX-cross2-conv.json" --same-conv "$PFX-sameA-conv.json" "$PFX-sameB-conv.json" \
  --sens "$PFX-sens-conv.json" --out "$PFX-judge.md" "${ATTRIB_OPT[@]}"; jrc=$?
[ $jrc = 0 ] || { bad=$((bad+1)); [ $jrc = 3 ] || echo "[check-ctrl] DEAD INSTRUMENT: judge exit $jrc"; }
if [ "$ARM" != off ]; then
  python3 tools/render/lighting-fence.py --base "$A1" --new "$B1" --tables $T2 --looks default,sp --room-strict --room-report --program-report --out "$PFX-fence.md" > "$PFX-fence.log" 2>&1; frc=$?
  echo "[check-ctrl] fence identity A1 vs B1 (--room-strict) exit $frc $(grep -m1 -o '\*\*VERDICT: [A-Z]*' "$PFX-fence.md" 2>/dev/null)"; [ $frc = 0 ] || bad=$((bad+1))
fi
WORD=$(grep -m1 -o '\*\*CTRL-JUDGE: [A-Za-z() ]*' "$PFX-judge.md" 2>/dev/null | sed 's/\*\*CTRL-JUDGE: //'); JSUM=$(grep -m1 '^\[ctrl-judge\] \(PASS\|FAIL\|UNJUDGEABLE\)' "$PFX-judge.md" 2>/dev/null | sed 's/^\[ctrl-judge\] //' | head -c 700)
SENSLINE=$(grep -m1 '^\[ctrl-judge\] sensitivity' "$PFX-judge.md" 2>/dev/null | head -c 300)
# --- ATTRIBUTION (guarded by OB_CTRL_ATTRIB_T / OB_CTRL_ATTRIB_H) BEGIN
if [ ${#ATTRIB_OPT} -gt 0 ]; then
  AWORD=$(grep -m1 -oE '\*\*CTRL-JUDGE: [A-Za-z() -]*' "$PFX-judge.md" 2>/dev/null | sed 's/\*\*CTRL-JUDGE: //; s/ *$//')
  grep -E '^\[ctrl-judge\] (main-side render delta|cell default/predator_apex_9ft/cueball_level)' "$PFX-judge.md" 2>/dev/null | head -8
  case "$ARM" in
    unattrib) [ "$AWORD" = FAIL ] && grep -q 'FAIL (a-lane)' "$PFX-judge.md" || { say "[check-ctrl] ARM unattrib: the judge read '$AWORD' where FAIL (a-lane) was owed — the plant did not fire for its reason (exit 5)"; exit 5; };;
  esac
  if [ $bad = 0 ] && [ "$AWORD" = PASS-WITH-ATTRIBUTED ]; then
    CL=$(grep -m1 '^CLAIM:' "$CLAIMF" 2>/dev/null); NC=$(grep -m1 '^NON-CLAIM:' "$CLAIMF" 2>/dev/null)
    [ -n "$CL" ] && [ -n "$NC" ] || { say "[check-ctrl] DEAD INSTRUMENT: the judge wrote no CLAIM / NON-CLAIM ($CLAIMF) (exit 3)"; exit 3; }
    say "[check-ctrl] PASS-WITH-ATTRIBUTED (a-main; stage $STAGE, venueConverge=$MODE) — $JSUM | $CL the fence identity A vs B PASS. $NC"
    exit 0
  fi
fi
# --- ATTRIBUTION END
if [ $bad = 0 ]; then
  # AMENDMENTS 1 + 2 (maintainer 17:0xZ): the CLAIM names the cells that carry it (measured by the sensitivity row) and the NON-CLAIM names the one
  # direction the row measured (the perturbed coefficient) — both written by the judge from the data, quoted here whole, the fence appended
  CL=$(grep -m1 '^CLAIM:' "$CLAIMF" 2>/dev/null); NC=$(grep -m1 '^NON-CLAIM:' "$CLAIMF" 2>/dev/null)
  [ -n "$CL" ] && [ -n "$NC" ] || { say "[check-ctrl] DEAD INSTRUMENT: the judge wrote no CLAIM / NON-CLAIM ($CLAIMF) (exit 3)"; exit 3; }
  say "[check-ctrl] PASS (stage $STAGE, venueConverge=$MODE) — $CL the fence identity A vs B PASS. $NC"
  exit 0
fi
case "$WORD" in
  PASS) say "[check-ctrl] FAIL — the judge passed but ${bad} other check(s) failed (the fence identity A1 vs B1 and/or a dead comparator; see $PFX-fence.md) (stage $STAGE, venueConverge=$MODE; exit 3)";;
  *) say "[check-ctrl] ${JSUM:-DEAD INSTRUMENT: the judge printed no summary} (stage $STAGE, venueConverge=$MODE; a named non-pass, exit 3)";;
esac
exit 3
