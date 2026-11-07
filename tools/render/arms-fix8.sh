#!/usr/bin/env bash

# Copyright (c) Meta Platforms, Inc. and affiliates.

# arms-fix8.sh <cammatch-489-modes|cammatch-488d-modes|overlay-gate-modes|selection-before-deletion|asmodeled-488p-modes|c14-488p-modes|
#   fullview-selftest|meshident-modes|coplanar-scope|census-selection|py-modes|c14-488d-inventory|orbitsweep-488d-modes|asmodeled-490-plant|asmodeled-490-coexist> — ORDER-CN8-731-FIX8 arms
# through the REAL entry points (review round 8 on #731, 2 × P2: (A) mode-scoped invalidation in every tool via ONE shared
# resolver, (B) a selection validated BEFORE any deletion path). Every arm is Chrome-free: each mode is entered for real and
# refused at its own --web guard, which sits AFTER the first-effect invalidation — so the artefacts that vanish are exactly the
# resolved mode's own set. Prints `[arm-<name>] ARMED` and exits 0 only when the rule holds. Run from the tree under test.
# c14-488d-inventory is the one Chrome arm (the inventory boots the page): it needs the lane's OB_E2E_PORT / OB_E2E_CDP_PORT pins.
set -u
arm="${1:?arm name}"; T=tools/render
TMPD=""; PLANTED=(); trap '[ -n "$TMPD" ] && rm -rf "$TMPD"; [ ${#PLANTED[@]} -gt 0 ] && rm -f -- "${PLANTED[@]}"' EXIT   # PLANTED = this arm's own decoy files: a Bash ARRAY of literal paths expanded quoted (COMPANION-1, review r12 P2: the string list split a space-bearing OB_ARM_ASM490_DIR into unrelated targets), removed on every exit
nope(){ echo "[arm-$arm] NOT ARMED — $*"; exit 1; }
sha(){ shasum -a 256 "$1" | cut -c1-16; }
seed(){ local d="$1"; shift; local f; for f in "$@"; do [ -e "$d/$f" ] || printf '{"seed":"%s"}\n' "$f" > "$d/$f"; done; }
gone(){ local d="$1"; shift; local f out=""; for f in "$@"; do [ -e "$d/$f" ] || out="$out$f "; done; echo "$out"; }
case "$arm" in
  cammatch-489-modes)
    TMPD=$(mktemp -d /tmp/ob-arm-cm489-XXXXXX); : "${TMPD:?}"; d="$TMPD/o"; mkdir -p "$d"
    PRESET=$(python3 -c "import json;print(sorted(json.load(open('$T/cammatch-489-registry.json'))['light_presets'])[0])")
    FRAME=$(python3 -c "import json;print(json.load(open('$T/cammatch-489-registry.json'))['frames'][0]['id'])")
    SET="cammatch-489-report.json cammatch-red-basis-489.json fit-$PRESET.json solve-$FRAME.json"
    expect(){ # expect <mode args…> -- <exactly the files that must vanish>
      local modeargs=() ; while [ "$1" != "--" ]; do modeargs+=("$1"); shift; done; shift; local want="$*"
      seed "$d" $SET; node $T/cammatch-489.mjs "${modeargs[@]}" --web /nonexistent/web --out "$d" > "$d/log" 2>&1; rc=$?
      [ "$rc" -eq 2 ] || nope "${modeargs[*]}: expected the --web refusal (rc 2), got $rc: $(tail -1 "$d/log" | cut -c1-120)"
      local got; got=$(gone "$d" $SET); [ "$(echo $got)" = "$(echo $want)" ] || nope "${modeargs[*]} removed [$got] — expected [$want]"
    }
    expect --compare -- cammatch-489-report.json
    expect --capture -- cammatch-489-report.json
    expect --red-arm -- cammatch-red-basis-489.json
    expect --fit-light "$PRESET" -- "fit-$PRESET.json"
    expect --solve "$FRAME" -- "solve-$FRAME.json"
    # (B) an unknown preset / frame id refuses BEFORE any deletion path exists — nothing removed, the refusal names the selection
    for bad in "--fit-light bogus-preset" "--solve bogus-frame"; do
      seed "$d" $SET; node $T/cammatch-489.mjs ${bad} --web /nonexistent/web --out "$d" > "$d/log" 2>&1; rc=$?
      [ "$rc" -eq 2 ] && grep -q 'REFUSED — unknown .*bogus.*nothing was removed' "$d/log" || nope "$bad: no named selection refusal (rc $rc): $(tail -1 "$d/log" | cut -c1-120)"
      [ -z "$(gone "$d" $SET)" ] || nope "$bad removed [$(gone "$d" $SET)]"
    done
    echo "[arm-cammatch-489-modes] ARMED — compare/capture own the report, red-arm the red basis, fit-light fit-<preset>.json, solve solve-<frame>.json (each mode removes only its own set); an unknown preset / frame id refuses with nothing removed"; exit 0;;
  cammatch-488d-modes)
    TMPD=$(mktemp -d /tmp/ob-arm-cm488d-XXXXXX); : "${TMPD:?}"; d="$TMPD/o"; mkdir -p "$d"
    SET="verify-registry-488d.json redarm-488d.json solve-488d-report.json cammatch-488d-report.json photo-ratios-488d.json loopback-488d.json camswing-488d.json pixel-selftest-488d.json"
    check(){ local flag="$1" want="$2"; seed "$d" $SET; timeout 120 node $T/cammatch-488d.mjs "$flag" --web /nonexistent/web --out "$d" > "$d/log" 2>&1; rc=$?
      [ "$rc" -eq 2 ] || nope "$flag: expected the --web refusal (rc 2), got $rc: $(tail -1 "$d/log" | cut -c1-120)"
      local got; got=$(gone "$d" $SET); [ "$(echo $got)" = "$want" ] || nope "$flag removed [$got] — expected [$want]"; }
    check --verify-registry verify-registry-488d.json; check --solve solve-488d-report.json; check --capture cammatch-488d-report.json
    check --compare cammatch-488d-report.json; check --red-arm redarm-488d.json; check --photo-ratios photo-ratios-488d.json
    check --loopback loopback-488d.json; check --camswing camswing-488d.json; check --pixel-selftest pixel-selftest-488d.json
    echo "[arm-cammatch-488d-modes] ARMED — each of the nine modes removes exactly its own verdict artefact (the FIX3 list removed all eight in every mode)"; exit 0;;
  overlay-gate-modes)
    TMPD=$(mktemp -d /tmp/ob-arm-ovl-XXXXXX); : "${TMPD:?}"; d="$TMPD/o"; mkdir -p "$d"
    printf '{"seed":44}\n' > "$d/overlay-r44.json"; printf '{"seed":45}\n' > "$d/overlay-r45.json"; H44=$(sha "$d/overlay-r44.json"); H45=$(sha "$d/overlay-r45.json")
    # red-arm owns nothing under --out: the gate's pinned report survives byte-identical (pre-fix: overlay-r45.json removed)
    node $T/overlay-490-gate.mjs --red-arm --rev 45 --out "$d" > "$d/log" 2>&1; rc=$?
    [ -e "$d/overlay-r45.json" ] && [ "$(sha "$d/overlay-r45.json")" = "$H45" ] || nope "--red-arm --out removed/changed the gate's overlay-r45.json (rc $rc)"
    [ "$(sha "$d/overlay-r44.json")" = "$H44" ] || nope "--red-arm touched overlay-r44.json"
    # gate removes ONLY its own rev's report, then refuses at --web
    node $T/overlay-490-gate.mjs --gate --rev 45 --web /nonexistent/web --out "$d" > "$d/log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && [ ! -e "$d/overlay-r45.json" ] || nope "--gate --rev 45 (refused --web) did not remove its own overlay-r45.json (rc $rc)"
    [ "$(sha "$d/overlay-r44.json")" = "$H44" ] || nope "--gate --rev 45 touched overlay-r44.json"
    # (B) an invalid rev refuses BEFORE the deletion path exists
    printf '{"seed":45}\n' > "$d/overlay-r45.json"
    node $T/overlay-490-gate.mjs --gate --rev 4x --web /nonexistent/web --out "$d" > "$d/log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && grep -q 'REFUSED — rev 4x .*nothing was removed' "$d/log" || nope "--gate --rev 4x: no named rev refusal (rc $rc): $(tail -1 "$d/log" | cut -c1-120)"
    [ "$(sha "$d/overlay-r44.json")" = "$H44" ] && [ -e "$d/overlay-r45.json" ] || nope "--gate --rev 4x removed a report"
    node $T/overlay-490-gate.mjs --red-arm --revs 44,abc > "$d/log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && grep -q 'REFUSED — rev abc' "$d/log" || nope "--red-arm --revs 44,abc: no named rev refusal (rc $rc)"
    echo "[arm-overlay-gate-modes] ARMED — --red-arm leaves the gate's overlay-r<rev>.json byte-identical, --gate removes only its own rev's report, an invalid --rev / --revs refuses with nothing removed"; exit 0;;
  selection-before-deletion)
    # (B) orbitsweep-489/490: an unknown / non-token --orbits refuses BEFORE any deletion path — a planted foreign report under
    # --out stays byte-identical (pre-fix: X/unrelated/report.json was removed first, then the unknown orbit rejected)
    TMPD=$(mktemp -d /tmp/ob-arm-sel-XXXXXX); : "${TMPD:?}"
    for N in 490 489; do
      d="$TMPD/o$N"; mkdir -p "$d/unrelated" "$d/corner"; printf '{"planted":"foreign"}\n' > "$d/unrelated/report.json"; printf '{"seed":"sweep"}\n' > "$d/orbitsweep-$N-report.json"; printf '{"seed":"corner"}\n' > "$d/corner/report.json"
      H=$(sha "$d/unrelated/report.json"); HR=$(sha "$d/orbitsweep-$N-report.json"); HC=$(sha "$d/corner/report.json")
      # two-tier: the judge mode's FIXED RED/GREEN report is the first effect (a prior verdict never survives a refused run, FIX3);
      # the reports DERIVED from --orbits are touched only after the selection is validated — the planted foreign report and the
      # other orbit's report stay byte-identical; the `=` form is read the same way
      for form in "--orbits unrelated" "--orbits=unrelated"; do
        printf '{"seed":"sweep"}\n' > "$d/orbitsweep-$N-report.json"
        node $T/orbitsweep-$N.mjs --judge-only $form --out "$d" > "$d/l1" 2>&1; rc=$?
        [ "$(sha "$d/unrelated/report.json")" = "$H" ] || nope "$N $form removed/changed the planted foreign report (the r8 defect; rc $rc)"
        [ "$(sha "$d/corner/report.json")" = "$HC" ] || nope "$N $form removed another orbit's report (rc $rc)"
        [ "$rc" -eq 2 ] && grep -q 'REFUSED — unknown orbit unrelated .*nothing further was removed (this run.s own first effect went first: .*orbitsweep-'"$N"'-report.json)' "$d/l1" || nope "$N $form: no named refusal naming the tier-1 removal (rc $rc): $(grep -o 'REFUSED.*' "$d/l1" | head -1 | cut -c1-160)"
        [ ! -e "$d/orbitsweep-$N-report.json" ] || nope "$N $form left the prior RED/GREEN report standing (tier 1)"
      done
      # a KNOWN orbit in the `=` form reaches the run's reader as the same selection (Fable pass 3: the judge tested the exact token and
      # fell back to the manifest list, judging an orbit the load-time invalidation never named): under a manifest [corner,fulltable]
      # with both dirs captured (stub meta), `--orbits=fulltable` must remove fulltable/report.json only and never touch corner/
      mkdir -p "$d/fulltable"; printf '{"orbits":["corner","fulltable"],"frames":75,"when":"seed"}\n' > "$d/capture-manifest.json"
      printf '{"orbit":"corner","frames":1,"windows":{},"poses":[]}\n' > "$d/corner/meta.json"; printf '{"orbit":"fulltable","frames":1,"windows":{},"poses":[]}\n' > "$d/fulltable/meta.json"
      printf '{"seed":"corner"}\n' > "$d/corner/report.json"; printf '{"seed":"fulltable"}\n' > "$d/fulltable/report.json"; HC=$(sha "$d/corner/report.json")
      timeout 120 node $T/orbitsweep-$N.mjs --judge-only --orbits=fulltable --out "$d" > "$d/l3" 2>&1; rc=$?
      grep -q 'invalidated before any guard: .*'"$d"'/fulltable/report.json' "$d/l3" || nope "$N --orbits=fulltable did not invalidate fulltable/report.json at load"
      [ "$(sha "$d/corner/report.json")" = "$HC" ] || nope "$N --orbits=fulltable touched corner/report.json — the run judged an orbit the selection never named (rc $rc)"
      grep -q 'corner' "$d/l3" && ! grep -q 'no report for fulltable' "$d/l3" && nope "$N --orbits=fulltable: the run took the manifest list instead of the selection: $(grep -o 'REFUSED.*' "$d/l3" | head -1 | cut -c1-120)"
      rm -f "$d/capture-manifest.json" "$d/corner/meta.json" "$d/fulltable/meta.json"; printf '{"seed":"corner"}\n' > "$d/corner/report.json"; HC=$(sha "$d/corner/report.json")
      # FIX9 (P2 A / A4): a VALUE the writer would refuse — blank, whitespace-only, `--orbits=`, trailing --orbits — owns nothing: exit 2,
      # the refusal names the flag, and NOTHING is removed (not even the mode's own RED/GREEN report: the run exits before its first effect)
      printf '{"seed":"sweep"}\n' > "$d/orbitsweep-$N-report.json"; HR=$(sha "$d/orbitsweep-$N-report.json")
      for bf in "--orbits ''" "--orbits '   '" "--orbits="; do
        eval "node $T/orbitsweep-$N.mjs --judge-only $bf --out '$d'" > "$d/lb" 2>&1; rc=$?
        [ "$rc" -eq 2 ] && grep -q 'REFUSED — --orbits given without a value (blank or trailing)' "$d/lb" || nope "$N $bf: expected the writer's blank refusal (rc $rc): $(tail -1 "$d/lb" | cut -c1-120)"
        [ "$(sha "$d/orbitsweep-$N-report.json")" = "$HR" ] && [ "$(sha "$d/unrelated/report.json")" = "$H" ] && [ "$(sha "$d/corner/report.json")" = "$HC" ] || nope "$N $bf removed an artefact before refusing the blank value"
      done
      node $T/orbitsweep-$N.mjs --judge-only --out "$d" --orbits > "$d/lb" 2>&1; rc=$?
      [ "$rc" -eq 2 ] && grep -q 'REFUSED — --orbits given without a value (blank or trailing)' "$d/lb" && [ "$(sha "$d/orbitsweep-$N-report.json")" = "$HR" ] || nope "$N trailing --orbits: expected the blank refusal with nothing removed (rc $rc)"
      node $T/orbitsweep-$N.mjs --judge-only --orbits 'corner,../unrelated' --out "$d" > "$d/l2" 2>&1; rc=$?
      [ "$rc" -eq 2 ] && grep -q -E 'is not a plain token; nothing( further)? was removed' "$d/l2" || nope "$N --orbits corner,../unrelated: no token refusal (rc $rc): $(grep -o 'REFUSED.*' "$d/l2" | head -1 | cut -c1-120)"
      [ "$(sha "$d/corner/report.json")" = "$HC" ] && [ "$(sha "$d/unrelated/report.json")" = "$H" ] || nope "$N --orbits corner,../unrelated removed a derived report before the refusal"
    done
    echo "[arm-selection-before-deletion] ARMED — orbitsweep-489/490: an unknown or non-token --orbits (space and = forms) refuses by name; the mode's fixed RED/GREEN report is the first effect, every selection-derived and foreign report stays byte-identical"; exit 0;;
  asmodeled-488p-modes)
    TMPD=$(mktemp -d /tmp/ob-arm-asm488p-XXXXXX); : "${TMPD:?}"; d="$TMPD/o"; mkdir -p "$d"
    printf '{"seed":"report"}\n' > "$d/asmodeled-488p.json"; printf '{"seed":"rb"}\n' > "$d/rb.json"; H=$(sha "$d/asmodeled-488p.json")
    node $T/asmodeled-drawings-488p.mjs --red-basis "$d/rb.json" --from-dump /nonexistent-dump --out "$d" > "$d/log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && [ "$(sha "$d/asmodeled-488p.json")" = "$H" ] && [ ! -e "$d/rb.json" ] || nope "--red-basis: report kept=$([ -e "$d/asmodeled-488p.json" ] && echo yes || echo no) rb removed=$([ ! -e "$d/rb.json" ] && echo yes || echo no) (rc $rc)"
    # the `=` form of the value-flag mode resolves the same way (Fable pass 2: it used to resolve `report` and remove the judge report)
    printf '{"seed":"report"}\n' > "$d/asmodeled-488p.json"; printf '{"seed":"rb"}\n' > "$d/rb.json"; H=$(sha "$d/asmodeled-488p.json")
    node $T/asmodeled-drawings-488p.mjs --red-basis="$d/rb.json" --from-dump /nonexistent-dump --out "$d" > "$d/log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && [ "$(sha "$d/asmodeled-488p.json")" = "$H" ] && [ ! -e "$d/rb.json" ] || nope "--red-basis=FILE: report kept=$([ -e "$d/asmodeled-488p.json" ] && echo yes || echo no) rb removed=$([ ! -e "$d/rb.json" ] && echo yes || echo no) (rc $rc)"
    printf '{"seed":"rb"}\n' > "$d/rb.json"; node $T/asmodeled-drawings-488p.mjs --from-dump /nonexistent-dump --out "$d" > "$d/log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && [ ! -e "$d/asmodeled-488p.json" ] && [ -e "$d/rb.json" ] || nope "report mode: report removed=$([ ! -e "$d/asmodeled-488p.json" ] && echo yes || echo no) rb kept=$([ -e "$d/rb.json" ] && echo yes || echo no) (rc $rc)"
    echo "[arm-asmodeled-488p-modes] ARMED — --red-basis FILE removes only FILE (the judge report survives), the report mode removes only asmodeled-488p.json"; exit 0;;
  c14-488p-modes)
    TMPD=$(mktemp -d /tmp/ob-arm-c14488p-XXXXXX); : "${TMPD:?}"; d="$TMPD/o"; mkdir -p "$d"
    printf '{"seed":"report"}\n' > "$d/c14-488p.json"; printf '{"seed":"rb"}\n' > "$d/rb.json"; H=$(sha "$d/c14-488p.json")
    node $T/c14-488p.mjs --red-basis "$d/rb.json" --out "$d" > "$d/log" 2>&1; rc=$?   # no --from-dump → the tool's own throw, after the first effect
    [ "$rc" -ne 0 ] && grep -q 'from-dump FILE is required' "$d/log" && [ "$(sha "$d/c14-488p.json")" = "$H" ] && [ ! -e "$d/rb.json" ] || nope "--red-basis: report kept=$([ -e "$d/c14-488p.json" ] && echo yes || echo no) rb removed=$([ ! -e "$d/rb.json" ] && echo yes || echo no) (rc $rc)"
    printf '{"seed":"report"}\n' > "$d/c14-488p.json"; printf '{"seed":"rb"}\n' > "$d/rb.json"; H=$(sha "$d/c14-488p.json")
    node $T/c14-488p.mjs --red-basis="$d/rb.json" --out "$d" > "$d/log" 2>&1; rc=$?
    [ "$rc" -ne 0 ] && grep -q 'from-dump FILE is required' "$d/log" && [ "$(sha "$d/c14-488p.json")" = "$H" ] && [ ! -e "$d/rb.json" ] || nope "--red-basis=FILE: report kept=$([ -e "$d/c14-488p.json" ] && echo yes || echo no) rb removed=$([ ! -e "$d/rb.json" ] && echo yes || echo no) (rc $rc)"
    printf '{"seed":"rb"}\n' > "$d/rb.json"; node $T/c14-488p.mjs --out "$d" > "$d/log" 2>&1; rc=$?
    [ "$rc" -ne 0 ] && grep -q 'from-dump FILE is required' "$d/log" && [ ! -e "$d/c14-488p.json" ] && [ -e "$d/rb.json" ] || nope "report mode: report removed=$([ ! -e "$d/c14-488p.json" ] && echo yes || echo no) rb kept=$([ -e "$d/rb.json" ] && echo yes || echo no) (rc $rc)"
    echo "[arm-c14-488p-modes] ARMED — --red-basis FILE removes only FILE (the C14 judge report survives), the report mode removes only c14-488p.json"; exit 0;;
  fullview-selftest)
    # the real --selftest of each fullview overlay (fixtures, no Chrome) must leave the live report standing; the report mode removes it
    TMPD=$(mktemp -d /tmp/ob-arm-fv-XXXXXX); : "${TMPD:?}"
    for N in 488d 489 490; do
      d="$TMPD/o$N"; mkdir -p "$d"; printf '{"seed":"live report"}\n' > "$d/fullview-$N.json"; H=$(sha "$d/fullview-$N.json")
      timeout "${OB_ARM_TIMEOUT:-600}" node $T/fullview-overlay-$N.mjs --selftest --out "$d" > "$d/l1" 2>&1; rc=$?
      if [ "$N" = 490 ]; then
        # fullview-490's selftest is RED on main b430d377 and on every export since (SELFTEST corrected: FAIL — FV490-HAUS-OUTERARC,
        # FV490-HAUS-WINDOW; the perturbed RED-PROOF is OK) — a pre-existing open row, not this round's object: the arm requires
        # exactly that documented verdict (exit 3) so a NEW red or a silent green would both fail it (Fable pass 1 on FIX8)
        [ "$rc" -eq 3 ] && grep -q '^SELFTEST corrected: FAIL — FV490-HAUS-OUTERARC, FV490-HAUS-WINDOW' "$d/l1" && grep -q '^SELFTEST perturbed RED-PROOF OK' "$d/l1" || nope "490 --selftest did not reproduce its documented verdict (rc $rc, expected 3 with the HAUS-OUTERARC/WINDOW corrected FAIL + RED-PROOF OK): $(grep '^SELFTEST' "$d/l1" | head -2 | cut -c1-140)"
      else
        [ "$rc" -eq 0 ] && grep -q '^SELFTEST OK' "$d/l1" || nope "$N --selftest is not green (rc $rc): $(grep '^SELFTEST' "$d/l1" | head -1 | cut -c1-140)"
      fi
      [ "$(sha "$d/fullview-$N.json")" = "$H" ] || nope "$N --selftest removed/changed the live report fullview-$N.json"
      node $T/fullview-overlay-$N.mjs --from-dump /nonexistent-dump --out "$d" > "$d/l2" 2>&1; rc=$?
      [ "$rc" -eq 2 ] && [ ! -e "$d/fullview-$N.json" ] || nope "$N report mode (refused --from-dump) did not remove its own fullview-$N.json (rc $rc)"
    done
    echo "[arm-fullview-selftest] ARMED — fullview-overlay-488d/489 selftests green, 490 reproduces its documented pre-existing red (exit 3); each leaves the live report byte-identical, the report mode removes only its own fullview-<n>.json"; exit 0;;
  meshident-modes)
    TMPD=$(mktemp -d /tmp/ob-arm-mi-XXXXXX); : "${TMPD:?}"; d="$TMPD/o"; mkdir -p "$d"
    printf '{"seed":"identity"}\n' > "$d/id.json"; H=$(sha "$d/id.json")
    node $T/meshident-488d.mjs --compare /nonexistent-a.json /nonexistent-b.json --out "$d/id.json" > "$d/log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && grep -q 'REFUSED — --compare' "$d/log" && [ "$(sha "$d/id.json")" = "$H" ] || nope "--compare with --out removed/changed the identity JSON (rc $rc): $(tail -1 "$d/log" | cut -c1-100)"
    node $T/meshident-488d.mjs --out "$d/id.json" --web /nonexistent/web > "$d/log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && [ ! -e "$d/id.json" ] || nope "capture (refused --web) did not remove its own identity JSON (rc $rc)"
    echo "[arm-meshident-modes] ARMED — --compare owns nothing at --out (the identity JSON survives byte-identical), capture removes only its own --out file"; exit 0;;
  coplanar-scope)
    TMPD=$(mktemp -d /tmp/ob-arm-cop-XXXXXX); : "${TMPD:?}"; d="$TMPD/o"; mkdir -p "$d"
    for t in chinese8_pro_9ft joy_q8_9ft wpa_generic_9ft; do printf '{"tool":"tools/render/check-coplanar-pairs.mjs","seed":"%s"}\n' "$t" > "$d/$t.json"; done
    HJ=$(sha "$d/joy_q8_9ft.json"); HW=$(sha "$d/wpa_generic_9ft.json"); HC=$(sha "$d/chinese8_pro_9ft.json")
    node $T/check-coplanar-pairs.mjs --tables nosuch_table --out "$d" --expect-zero > "$d/l0" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && grep -q 'REFUSED — unknown table id nosuch_table' "$d/l0" || nope "--tables nosuch_table: no catalog refusal (rc $rc)"
    [ "$(sha "$d/chinese8_pro_9ft.json")" = "$HC" ] && [ "$(sha "$d/joy_q8_9ft.json")" = "$HJ" ] && [ "$(sha "$d/wpa_generic_9ft.json")" = "$HW" ] || nope "--tables nosuch_table removed a doc before the refusal"
    node $T/check-coplanar-pairs.mjs --tables chinese8_pro_9ft --perturb=cdp-drop --web /nonexistent/web --out "$d" --expect-zero > "$d/l1" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && [ "$(sha "$d/chinese8_pro_9ft.json")" = "$HC" ] || nope "a refusal-only perturb (cdp-drop) removed the clean census it never regenerates (rc $rc)"
    # a repeated --perturb resolves to its LAST value (the run's own reading): clone-tri then cdp-drop = a refusal-only mode, nothing removed
    node $T/check-coplanar-pairs.mjs --tables chinese8_pro_9ft --perturb clone-tri --perturb cdp-drop --web /nonexistent/web --out "$d" --expect-zero > "$d/l1b" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && [ "$(sha "$d/chinese8_pro_9ft.json")" = "$HC" ] || nope "a repeated --perturb (last = cdp-drop) removed the clean census — the resolver read the first value (rc $rc)"
    node $T/check-coplanar-pairs.mjs --tables chinese8_pro_9ft --perturb=bogus --web /nonexistent/web --out "$d" --expect-zero > "$d/l1c" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && [ "$(sha "$d/chinese8_pro_9ft.json")" = "$HC" ] || nope "an unknown --perturb removed a doc (rc $rc)"
    node $T/check-coplanar-pairs.mjs --tables chinese8_pro_9ft --web /nonexistent/web --out "$d" --expect-zero > "$d/l2" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && [ ! -e "$d/chinese8_pro_9ft.json" ] || nope "the census mode (refused --web) did not remove its own chinese8 doc (rc $rc)"
    [ "$(sha "$d/joy_q8_9ft.json")" = "$HJ" ] && [ "$(sha "$d/wpa_generic_9ft.json")" = "$HW" ] || nope "the census mode removed another table's doc (the FIX3 whole-dir sweep)"
    echo "[arm-coplanar-scope] ARMED — check-coplanar-pairs: an unknown table refuses with every doc byte-identical, a refusal-only perturb removes nothing, the census removes only the selected tables' docs (other tables' docs survive)"; exit 0;;
  census-selection)
    # a DEFAULT destination is derived from the selection → the selection is validated first: `--table nosuch` / `--switch-to nosuch`
    # leave the planted default-path files byte-identical; an explicit --out stays the first effect (FIX4) and a valid table removes it.
    # The two decoys are planted under the tool's fixed default root /tmp/ob-census-490 (shared with the fence census) under names no
    # table can have and removed by the EXIT trap on every exit path; only a SIGKILL could leave them (fence-judge-490 reads named
    # table docs, never a directory listing).
    TMPD=$(mktemp -d /tmp/ob-arm-cen-XXXXXX); : "${TMPD:?}"; mkdir -p /tmp/ob-census-490
    PLANTED=(/tmp/ob-census-490/nosuch_arm8.json /tmp/ob-census-490/nosuch_arm8.switched.json)
    printf '{"planted":1}\n' > /tmp/ob-census-490/nosuch_arm8.json; printf '{"planted":2}\n' > /tmp/ob-census-490/nosuch_arm8.switched.json
    H1=$(sha /tmp/ob-census-490/nosuch_arm8.json); H2=$(sha /tmp/ob-census-490/nosuch_arm8.switched.json)
    node $T/census-490-tables.mjs --table nosuch_arm8 --web /nonexistent/web > "$TMPD/l1" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && grep -q 'REFUSED — unknown table id nosuch_arm8' "$TMPD/l1" && [ "$(sha /tmp/ob-census-490/nosuch_arm8.json)" = "$H1" ] || nope "--table nosuch_arm8 removed the derived default destination before the catalog refusal (rc $rc)"
    node $T/census-490-tables.mjs --table chinese8_pro_9ft --switch-to nosuch_arm8 --web /nonexistent/web > "$TMPD/l2" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && grep -q 'REFUSED — unknown table id nosuch_arm8' "$TMPD/l2" && [ "$(sha /tmp/ob-census-490/nosuch_arm8.switched.json)" = "$H2" ] || nope "--switch-to nosuch_arm8 removed the derived switched destination before the catalog refusal (rc $rc)"
    printf '{"seed":"x"}\n' > "$TMPD/x.json"; HX=$(sha "$TMPD/x.json")
    node $T/census-490-tables.mjs --table chinese8_pro_9ft --out "$TMPD/x.json" --perturb bogus --web /nonexistent/web > "$TMPD/l3a" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && [ "$(sha "$TMPD/x.json")" = "$HX" ] || nope "an unknown --perturb (a mode nobody owns) removed the explicit --out (rc $rc)"
    node $T/census-490-tables.mjs --table chinese8_pro_9ft --out "$TMPD/x.json" --perturb material --perturb=bogus --web /nonexistent/web > "$TMPD/l3b" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && [ "$(sha "$TMPD/x.json")" = "$HX" ] || nope "a repeated --perturb whose LAST value is unknown removed the explicit --out (rc $rc)"
    node $T/census-490-tables.mjs --table chinese8_pro_9ft --out "$TMPD/x.json" --web /nonexistent/web > "$TMPD/l3" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && [ ! -e "$TMPD/x.json" ] || nope "a valid table with an explicit --out (refused --web) did not remove its own destination first (rc $rc)"
    # FIX4 literal-destination law kept for FILE destinations (Fable pass 2: a filename whitelist had started refusing them): a bracket
    # and a trailing space in the --out FILENAME are lawful — the file as given goes first, the --web guard then refuses
    for f in "census (2).json" "result[1].json" "c.json "; do
      printf '{"seed":"lit"}\n' > "$TMPD/$f"; node $T/census-490-tables.mjs --table chinese8_pro_9ft --out "$TMPD/$f" --web /nonexistent/web > "$TMPD/l4" 2>&1; rc=$?
      [ "$rc" -eq 2 ] && [ ! -e "$TMPD/$f" ] && grep -q 'REFUSED — --web /nonexistent/web' "$TMPD/l4" || nope "literal --out '$f': expected the file removed first then the --web refusal, got rc $rc: $(grep -o 'REFUSED.*' "$TMPD/l4" | head -1 | cut -c1-120)"
    done
    echo "[arm-census-selection] ARMED — census-490: --table / --switch-to nosuch refuse with the derived default destinations byte-identical; an unknown --perturb owns nothing (the explicit --out survives); a valid run removes its explicit --out first"; exit 0;;
  py-modes)
    TMPD=$(mktemp -d /tmp/ob-arm-py-XXXXXX); : "${TMPD:?}"; d="$TMPD/o"; mkdir -p "$d"
    printf '{"seed":"census"}\n' > "$d/census.json"; H=$(sha "$d/census.json")
    python3 $T/cammatch-488p-admit.py --write --red-basis /nonexistent-basis --out "$d/census.json" > "$d/l1" 2>&1; rc=$?
    [ -e "$d/census.json" ] && [ "$(sha "$d/census.json")" = "$H" ] || nope "488p-admit --write --red-basis removed/changed the census the red arm never regenerates (rc $rc)"
    [ "$rc" -eq 2 ] && grep -q "REFUSED — --red-basis '/nonexistent-basis': file not found" "$d/l1" || nope "488p-admit --write --red-basis: expected its own red-basis refusal (rc $rc)"
    python3 $T/cammatch-488p-admit.py --write --out "$d/census.json" --root /nonexistent-root > "$d/l2" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && [ ! -e "$d/census.json" ] || nope "488p-admit --write (refused --root) did not remove its own explicit --out first (rc $rc)"
    printf 'plate' > "$d/plate.png"; H=$(sha "$d/plate.png")
    python3 $T/gh488d/make_card_488d.py --print-font --out "$d/plate.png" --title t > "$d/l3" 2>&1; rc=$?
    [ "$rc" -eq 0 ] && [ "$(sha "$d/plate.png")" = "$H" ] || nope "make_card --print-font removed/changed the plate it never regenerates (rc $rc)"
    python3 $T/gh488d/make_card_488d.py --out "$d/plate.png" > "$d/l4" 2>&1; rc=$?   # FIX10: a missing --title is a PARSER error — exit 2 with the plate byte-identical (pre-FIX10 the plate went first)
    [ "$rc" -eq 2 ] && [ "$(sha "$d/plate.png")" = "$H" ] || nope "make_card plate mode with --title missing: expected the parser's exit 2 with the plate byte-identical (rc $rc)"
    python3 $T/gh488d/make_card_488d.py --out "$d/plate.png" --title t --width 320 --height 200 > "$d/l5" 2>&1; rc=$?   # a plate run that PARSES owns its --out: the prior plate is removed first and regenerated
    [ "$rc" -eq 0 ] && grep -q 'prior artefact(s) invalidated' "$d/l5" && [ -e "$d/plate.png" ] && [ "$(sha "$d/plate.png")" != "$H" ] || nope "make_card plate mode (a parsing run) did not remove and regenerate its own --out (rc $rc)"
    echo "[arm-py-modes] ARMED — cammatch-488p-admit: --red-basis owns nothing (the census survives), --write removes its explicit --out first; make_card_488d: --print-font owns nothing (the plate survives), a plate run removes its --out first"; exit 0;;
  c14-488d-inventory)
    # Chrome arm (band pins required): the REAL --inventory lists the bays and returns before the record write, so a seeded --json record
    # must survive; `--cups bogus` refuses BEFORE any removal (an unknown value used to census zero bays over a removed record)
    TMPD=$(mktemp -d /tmp/ob-arm-c14-XXXXXX); : "${TMPD:?}"; d="$TMPD/o"; mkdir -p "$d"
    printf '{"seed":"record"}\n' > "$d/rec.json"; H=$(sha "$d/rec.json")
    # two-tier: the explicit --json record is the tool's own fixed destination (removed first); the unknown --cups then refuses
    # before any census can run over it (pre-fix: no refusal at all — zero bays were censused and the record rewritten)
    node $T/c14-488d.mjs --cups bogus --json "$d/rec.json" > "$d/l0" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && grep -q 'REFUSED — unknown cups selection bogus .*nothing further was removed (this run.s own first effect went first: .*rec.json)' "$d/l0" && [ ! -e "$d/rec.json" ] || nope "--cups bogus: expected the record removed (tier 1) and a named selection refusal (rc $rc): $(tail -1 "$d/l0" | cut -c1-100)"
    printf '{"seed":"record"}\n' > "$d/rec.json"; H=$(sha "$d/rec.json")
    : "${OB_E2E_PORT:?}" "${OB_E2E_CDP_PORT:?}"
    timeout "${OB_ARM_TIMEOUT:-600}" node $T/c14-488d.mjs --inventory --json "$d/rec.json" > "$d/l1" 2>&1; rc=$?
    [ "$rc" -eq 0 ] || nope "--inventory did not complete (rc $rc): $(tail -2 "$d/l1" | cut -c1-160)"
    [ "$(sha "$d/rec.json")" = "$H" ] || nope "--inventory removed/changed the C14 record it never regenerates"
    # FIX2l (COMPANION-1c): a bounded settle — under load a headless-shell child can still be exiting in the instant after the tool
    # returns (the FIX8 check fired at 55 load with the profile dir and the listeners already gone); a real survivor is still there after 5 s
    for _settle in $(seq 1 25); do pgrep -f "obw-e2e-profile-${OB_E2E_CDP_PORT}" > /dev/null || break; sleep 0.2; done
    pgrep -f "obw-e2e-profile-${OB_E2E_CDP_PORT}" > /dev/null && nope "a Chrome with this run's profile survived (5 s after the tool returned)"
    echo "[arm-c14-488d-inventory] ARMED — c14-488d: an unknown --cups refuses by name (after the record, its own destination, went first); the real --inventory leaves the seeded record byte-identical"; exit 0;;
  asmodeled-490-plant|asmodeled-490-coexist)
    # asmodeled-drawings-490 boots Chrome in both modes, so its coexistence is checked around the battery's REAL `letters` row
    # (--letters --judge into the default --out). FIX9 (review round 9 on #731 P2 B): a legitimate prior plain-mode verdict is NEVER
    # a precondition failure — `plant` HASHES AND PRESERVES a real asmodeled-metrics.json (records REAL <sha>) and plants a decoy
    # only where none stands (DECOY <sha>); `coexist` asserts after the letters row that the recorded file is byte-identical, leaves a
    # real one in place and removes only its own decoy. OB_ARM_ASM490_DIR isolates the pair for the red arm (arms-fix9.sh).
    D="${OB_ARM_ASM490_DIR:-/tmp/ob-490r30-asmodeled}"; mkdir -p "$D"; REC="$D/.arm-fix8-decoy.sha"
    if [ "$arm" = asmodeled-490-plant ]; then
      if [ -e "$D/asmodeled-metrics.json" ] && ! grep -q -E '"tool":"arm-fix[89]-decoy' "$D/asmodeled-metrics.json"; then   # one marker regex everywhere (Fable pass 1 on FIX9)
        echo "REAL $(sha "$D/asmodeled-metrics.json")" > "$REC"; echo "[arm-asmodeled-490-plant] ARMED — a real plain-mode verdict stands at $D/asmodeled-metrics.json: preserved, hashed ($(cat "$REC")); coexist asserts it byte-identical after the letters row"; exit 0
      fi
      printf '{"tool":"arm-fix8-decoy (stands in for asmodeled-drawings-490 plain mode)","mode":"plain","seed":"%s"}\n' "$(date +%s)" > "$D/asmodeled-metrics.json"
      echo "DECOY $(sha "$D/asmodeled-metrics.json")" > "$REC"; echo "[arm-asmodeled-490-plant] ARMED — decoy plain-mode verdict planted at $D/asmodeled-metrics.json ($(cat "$REC"))"; exit 0
    fi
    [ -f "$REC" ] || nope "no plant record — run asmodeled-490-plant before the letters row"
    kind=$(cut -d' ' -f1 "$REC"); want=$(cut -d' ' -f2 "$REC")
    if [ "$kind" = DECOY ]; then
      grep -q '"tool":"arm-fix8-decoy' "$D/asmodeled-metrics.json" 2>/dev/null || { PLANTED=("$REC"); nope "$D/asmodeled-metrics.json is not this arm's decoy any more (the letters run removed or replaced it) — left untouched"; }
      PLANTED=("$D/asmodeled-metrics.json" "$REC")   # the decoy + its record go on EVERY exit path from here — set only after the content check above
    elif grep -q '"stand_in":' "$D/asmodeled-metrics.json" 2>/dev/null; then
      PLANTED=("$D/asmodeled-metrics.json" "$REC")   # the B1 stand-in is this lane's own authored report: it goes with the record once judged, never left in the tool's real default dir
    else
      PLANTED=("$REC")   # a REAL verdict is never removed by this arm — only the record goes
    fi
    [ -e "$D/asmodeled-metrics.json" ] || nope "the letters run REMOVED the plain-mode verdict asmodeled-metrics.json ($kind)"
    [ "$(sha "$D/asmodeled-metrics.json")" = "$want" ] || nope "the plain-mode verdict changed under the letters run ($kind; was $want, now $(sha "$D/asmodeled-metrics.json"))"
    [ -e "$D/letters-compare.json" ] && [ "$D/letters-compare.json" -nt "$REC" ] || nope "no fresh letters-compare.json beside the $kind verdict — the letters row did not run after the plant"
    echo "[arm-asmodeled-490-coexist] ARMED — asmodeled-drawings-490 --letters left the $kind plain-mode verdict byte-identical beside its fresh letters-compare.json$([ "$kind" = REAL ] && echo ' (the real verdict stays in place)')"; exit 0;;
  orbitsweep-488d-modes)
    # orbitsweep-488d on the shared resolver (Fable pass 1 on FIX8): zero or several mode flags own nothing — the five verdicts under
    # --pack / --out survive (the FIX3 blanket sweep removed them all ahead of the mode refusal); a single mode removes only its own set
    TMPD=$(mktemp -d /tmp/ob-arm-os488d-XXXXXX); : "${TMPD:?}"; P="$TMPD/pack"; O="$TMPD/out"; mkdir -p "$P/r2" "$O"
    for f in encoded-bars-488d.json red-arm-488d.json judge-488d.json verify-488d.json; do printf '{"seed":"%s"}\n' "$f" > "$P/$f"; done
    printf '{"seed":"cards"}\n' > "$P/r2/cards-only-488d.json"; printf '{"seed":"cards-out"}\n' > "$O/cards-only-488d.json"; printf '{"seed":"verify-out"}\n' > "$O/verify-488d.json"
    ALL="$P/encoded-bars-488d.json $P/red-arm-488d.json $P/judge-488d.json $P/verify-488d.json $P/r2/cards-only-488d.json $O/cards-only-488d.json $O/verify-488d.json"
    snap(){ local f; for f in $ALL; do [ -e "$f" ] && sha "$f" || echo gone; done | tr '\n' ' '; }
    S0=$(snap)
    node $T/orbitsweep-488d.mjs --encoded --red-arm --pack "$P" --out "$O" > "$TMPD/l1" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && grep -q 'exactly one mode flag required' "$TMPD/l1" && [ "$(snap)" = "$S0" ] || nope "two mode flags: expected the mode refusal with every verdict byte-identical (rc $rc): $(tail -1 "$TMPD/l1" | cut -c1-120)"
    node $T/orbitsweep-488d.mjs --pack "$P" --out "$O" > "$TMPD/l2" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && [ "$(snap)" = "$S0" ] || nope "no mode flag: expected the mode refusal with every verdict byte-identical (rc $rc)"
    node $T/orbitsweep-488d.mjs --cards-only --encoded --pack "$P" --out "$O" > "$TMPD/l3" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && [ "$(snap)" = "$S0" ] || nope "--cards-only beside a second mode removed the --out verdict ahead of the refusal (rc $rc)"
    # one mode removes only its own set: --red-arm owns red-arm-488d.json (the run then refuses / fails on the empty pack)
    node $T/orbitsweep-488d.mjs --red-arm --pack "$P" > "$TMPD/l4" 2>&1; rc=$?
    [ "$rc" -ne 0 ] && [ ! -e "$P/red-arm-488d.json" ] && [ -e "$P/encoded-bars-488d.json" ] && [ -e "$P/judge-488d.json" ] && [ -e "$P/verify-488d.json" ] && [ -e "$P/r2/cards-only-488d.json" ] || nope "--red-arm did not remove exactly red-arm-488d.json (rc $rc): $(ls "$P" | tr '\n' ' ')"
    echo "[arm-orbitsweep-488d-modes] ARMED — orbitsweep-488d: zero / several mode flags remove nothing (five verdicts byte-identical ahead of the refusal); --red-arm removes only red-arm-488d.json"; exit 0;;
  *) echo "unknown arm $arm"; exit 2;;
esac
