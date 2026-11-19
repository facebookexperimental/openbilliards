#!/usr/bin/env bash

# Copyright (c) Meta Platforms, Inc. and affiliates.

# arms-fix9.sh <blank-destination-488d|blank-forms-families|blank-destination-sweep|eqdir-only|asmodeled-490-coexist-red|asmodeled-490-prior-report> — ORDER-CN8-731-FIX9 arms
# through the REAL entry points (review round 9 on #731, 2 × P2). Class A: ONE reader — a destination / selection VALUE the writer
# would refuse (blank, whitespace-only, `--out=`, trailing) owns NOTHING: exit 2 by name BEFORE any effect; every previously existing
# report byte-identical (pre-fix: the pre-scan collapsed a blank --out to the DEFAULT destination and deleted there). Class B: an arm
# never requires the absence of a legitimate report — plant_or_hash preserves a real artefact (hash) and plants a decoy only where none
# stands; decoys are removed on every exit path, real files never. Chrome-free; every tool refuses at load.
set -u
arm="${1:?arm name}"; T=tools/render
TMPD=""; PLANTED=()   # COMPANION-1 (review r12 P2 class): the decoy list is a Bash ARRAY of literal paths, appended one path at a time, expanded quoted
cleanup_planted(){ local i f; for ((i = 0; i < ${#PLANTED[@]}; i++)); do f="${PLANTED[$i]}"; [ -e "$f" ] && grep -q '"tool":"arm-fix9-decoy"' "$f" && rm -f -- "$f"; done; return 0; }   # content-checked: only a file that is STILL this arm's decoy goes
trap '[ -n "$TMPD" ] && rm -rf "$TMPD"; cleanup_planted' EXIT
nope(){ echo "[arm-$arm] NOT ARMED — $*"; exit 1; }
sha(){ shasum -a 256 "$1" | cut -c1-16; }
# plant_or_hash FILE → sets PH_SHA to the sha the file must still have afterwards; a real file is preserved (never touched), an absent one
# gets a decoy that the EXIT trap removes (a plain function, never a $(...) subshell — a subshell's PLANTED list never reaches the trap)
plant_or_hash(){ local f="$1"; mkdir -p "$(dirname "$f")"; if [ -e "$f" ]; then PH_SHA=$(sha "$f"); else printf '{"tool":"arm-fix9-decoy","seed":"%s"}\n' "$(basename "$f")" > "$f"; PLANTED+=("$f"); PH_SHA=$(sha "$f"); fi; }
same(){ [ -e "$1" ] && [ "$(sha "$1")" = "$2" ]; }
BLANK_MSG='given without a value (blank or trailing)'
case "$arm" in
  blank-destination-488d)
    # A1 / A2: orbitsweep-488d --verify / --cards-only with a blank --out in every form → exit 2, the existing verify-488d.json and
    # r2/cards-only-488d.json under the pack byte-identical; also a blank --pack beside --cards-only --out O leaves O's report standing
    TMPD=$(mktemp -d /tmp/ob-arm-b488d-XXXXXX); : "${TMPD:?}"; P="$TMPD/pack"; O="$TMPD/out"; mkdir -p "$P/r2" "$O"
    for f in encoded-bars-488d.json red-arm-488d.json judge-488d.json verify-488d.json; do printf '{"seed":"%s"}\n' "$f" > "$P/$f"; done
    printf '{"seed":"cards"}\n' > "$P/r2/cards-only-488d.json"; printf '{"seed":"cards-out"}\n' > "$O/cards-only-488d.json"
    ALL="$P/encoded-bars-488d.json $P/red-arm-488d.json $P/judge-488d.json $P/verify-488d.json $P/r2/cards-only-488d.json $O/cards-only-488d.json"
    snap(){ local f; for f in $ALL; do [ -e "$f" ] && sha "$f" || echo gone; done | tr '\n' ' '; }; S0=$(snap)
    for mode in --verify --cards-only; do
      for form in "--out ''" "--out '   '" "--out="; do
        eval "node $T/orbitsweep-488d.mjs $mode --pack '$P' $form" > "$TMPD/log" 2>&1; rc=$?
        [ "$(snap)" = "$S0" ] || nope "$mode $form removed a report before refusing the blank --out (rc $rc): $(snap)"
        [ "$rc" -eq 2 ] && grep -q "REFUSED — --out $BLANK_MSG" "$TMPD/log" || nope "$mode $form: expected the writer's blank refusal (exit 2), got $rc: $(tail -1 "$TMPD/log" | cut -c1-120)"
      done
      node $T/orbitsweep-488d.mjs $mode --pack "$P" --out > "$TMPD/log" 2>&1; rc=$?
      [ "$(snap)" = "$S0" ] && [ "$rc" -eq 2 ] && grep -q "REFUSED — --out $BLANK_MSG" "$TMPD/log" || nope "$mode trailing --out: expected the blank refusal with nothing removed (rc $rc)"
    done
    node $T/orbitsweep-488d.mjs --cards-only --pack '' --out "$O" > "$TMPD/log" 2>&1; rc=$?
    [ "$(snap)" = "$S0" ] && [ "$rc" -eq 2 ] && grep -q "REFUSED — --pack $BLANK_MSG" "$TMPD/log" || nope "--cards-only --pack '' --out O: expected the blank --pack refusal with O's report standing (rc $rc): $(tail -1 "$TMPD/log" | cut -c1-120)"
    echo "[arm-blank-destination-488d] ARMED — orbitsweep-488d: a blank / whitespace / = / trailing --out under --verify and --cards-only (and a blank --pack) is refused by name before any effect; every pack and --out report byte-identical"; exit 0;;
  blank-forms-families)
    # A3: one tool per family at its DEFAULT destination (the pre-fix deletion target): cammatch-488d (--verify-registry), fullview-490,
    # census-490 (a blank --table with an explicit --out; a blank --out with a valid table) — whitespace-only and `--out=` forms
    TMPD=$(mktemp -d /tmp/ob-arm-bfam-XXXXXX); : "${TMPD:?}"
    # census first: pre-FIX9 the explicit --out went BEFORE the blank --table refusal (a real deletion on the FIX8 export); the two other
    # families skipped a blank by a second reader that happened to agree with pathOpt — their pre-fix difference is the refusal FORM only
    printf '{"seed":"x"}\n' > "$TMPD/x.json"; HX=$(sha "$TMPD/x.json")
    for form in "--table '   '" "--table=" "--switch-to '  '" "--perturb="; do
      eval "node $T/census-490-tables.mjs --out '$TMPD/x.json' $form --web /nonexistent/web" > "$TMPD/log" 2>&1; rc=$?
      same "$TMPD/x.json" "$HX" || nope "census-490 $form removed the explicit --out before refusing the blank value (rc $rc)"
      [ "$rc" -eq 2 ] && grep -q "REFUSED — --[a-z-]* $BLANK_MSG" "$TMPD/log" || nope "census-490 $form: expected the writer's blank refusal (rc $rc): $(tail -1 "$TMPD/log" | cut -c1-120)"
    done
    plant_or_hash /tmp/ob-census-490/chinese8_pro_9ft.json; H3=$PH_SHA
    for form in "--out '   '" "--out="; do
      eval "node $T/census-490-tables.mjs --table chinese8_pro_9ft $form --web /nonexistent/web" > "$TMPD/log" 2>&1; rc=$?
      same /tmp/ob-census-490/chinese8_pro_9ft.json "$H3" || nope "census-490 $form touched the default census (rc $rc)"
      [ "$rc" -eq 2 ] && grep -q "REFUSED — --out $BLANK_MSG" "$TMPD/log" || nope "census-490 $form: expected the blank --out refusal (rc $rc)"
    done
    plant_or_hash /tmp/ob-cammatch-488d/verify-registry-488d.json; H1=$PH_SHA
    for form in "--out '   '" "--out="; do
      eval "node $T/cammatch-488d.mjs --verify-registry $form" > "$TMPD/log" 2>&1; rc=$?
      same /tmp/ob-cammatch-488d/verify-registry-488d.json "$H1" || nope "cammatch-488d --verify-registry $form removed/changed the default-destination report (rc $rc)"
      [ "$rc" -eq 2 ] && grep -q "REFUSED — --out $BLANK_MSG" "$TMPD/log" || nope "cammatch-488d $form: expected the blank refusal (rc $rc): $(tail -1 "$TMPD/log" | cut -c1-120)"
    done
    plant_or_hash /tmp/ob-fullview-490/fullview-490.json; H2=$PH_SHA
    for form in "--out '   '" "--out="; do
      eval "node $T/fullview-overlay-490.mjs $form" > "$TMPD/log" 2>&1; rc=$?
      same /tmp/ob-fullview-490/fullview-490.json "$H2" || nope "fullview-overlay-490 $form removed/changed the default-destination report (rc $rc)"
      [ "$rc" -eq 2 ] && grep -q "REFUSED — --out $BLANK_MSG" "$TMPD/log" || nope "fullview-490 $form: expected the blank refusal (rc $rc): $(tail -1 "$TMPD/log" | cut -c1-120)"
    done
    echo "[arm-blank-forms-families] ARMED — cammatch-488d / fullview-490 / census-490: whitespace-only and = forms of --out (and census's --table / --switch-to / --perturb) are refused by name before any effect; the default-destination and explicit reports byte-identical (real files preserved by hash)"; exit 0;;
  blank-destination-sweep)
    # every other converted tool with a destination pre-scan: blank and = forms of --out (or --json) → exit 2 by name, the default
    # destination's report byte-identical (real files preserved by hash, decoys planted only where none stands)
    TMPD=$(mktemp -d /tmp/ob-arm-bsweep-XXXXXX); : "${TMPD:?}"
    check(){ local tool="$1" flag="$2" dest="$3"; shift 3; local H=""; [ -n "$dest" ] && plant_or_hash "$dest"; H=$PH_SHA
      for form in "$flag ''" "$flag="; do
        eval "node $T/$tool $* $form" > "$TMPD/log" 2>&1; local rc=$?
        if [ -n "$dest" ]; then same "$dest" "$H" || nope "$tool $* $form removed/changed $dest (rc $rc)"; fi
        [ "$rc" -eq 2 ] && grep -q "REFUSED — $flag $BLANK_MSG" "$TMPD/log" || nope "$tool $* $form: expected the writer's blank refusal (rc $rc): $(tail -1 "$TMPD/log" | cut -c1-120)"
      done; }
    check asmodeled-drawings-488p.mjs --out /tmp/ob-asmodeled-488p/asmodeled-488p.json
    check asmodeled-drawings-490.mjs --out /tmp/ob-490r30-asmodeled/asmodeled-metrics.json
    check asmodeled-drawings-490.mjs --out /tmp/ob-490r30-asmodeled/letters-compare.json --letters
    check asmodeled-drawings-488d.mjs --out /tmp/ob-488d-asmodeled/letters-compare-488d.json
    check asmodeled-drawings-489.mjs --out /tmp/ob-489w14-asmodeled/letters-489.json
    check c14-488p.mjs --out /tmp/ob-c14-488p/c14-488p.json
    check c14-488d.mjs --json ""
    check fullview-overlay-488d.mjs --out /tmp/ob-fullview-488d/fullview-488d.json
    check fullview-overlay-488p.mjs --out /tmp/ob-fullview-488p/fullview-488p.json
    check fullview-overlay-489.mjs --out /tmp/ob-fullview-489/fullview-489.json
    check meshident-488d.mjs --out ""
    check liveswitch-628.mjs --out /tmp/ob628-liveswitch/liveswitch-628.json
    check regdiff-628.mjs --out ""
    check cammatch-489.mjs --out /tmp/ob-cammatch-489/cammatch-489-report.json --compare
    check orbitsweep-489.mjs --out /tmp/ob-orbitsweep-489/orbitsweep-489-report.json --judge-only
    check orbitsweep-490.mjs --out /tmp/ob-orbitsweep-490/orbitsweep-490-report.json --judge-only
    check overlay-490-gate.mjs --out "" --gate
    check check-coplanar-pairs.mjs --out /tmp/ob-coplanar-490/chinese8_pro_9ft.json --tables chinese8_pro_9ft --expect-zero
    printf '{"seed":"rb"}\n' > "$TMPD/rb.json"; HRB=$(sha "$TMPD/rb.json"); plant_or_hash /tmp/ob-asmodeled-488p/asmodeled-488p.json; HA=$PH_SHA; plant_or_hash /tmp/ob-c14-488p/c14-488p.json; HC=$PH_SHA
    for form in "--red-basis ''" "--red-basis="; do
      eval "node $T/asmodeled-drawings-488p.mjs $form --from-dump /nonexistent-dump" > "$TMPD/log" 2>&1; rc=$?
      [ "$rc" -eq 2 ] && grep -q "REFUSED — --red-basis $BLANK_MSG" "$TMPD/log" && same /tmp/ob-asmodeled-488p/asmodeled-488p.json "$HA" || nope "asmodeled-488p $form: expected the blank --red-basis refusal with the report byte-identical (rc $rc)"
      eval "node $T/c14-488p.mjs $form" > "$TMPD/log" 2>&1; rc=$?
      [ "$rc" -eq 2 ] && grep -q "REFUSED — --red-basis $BLANK_MSG" "$TMPD/log" && same /tmp/ob-c14-488p/c14-488p.json "$HC" || nope "c14-488p $form: expected the blank --red-basis refusal with the report byte-identical (rc $rc)"
    done
    # the strict-loop tools accept `--out=DIR` exactly as the pre-scan does (Fable pass 1: the pre-scan removed under DIR, then the loop
    # refused the line as an unknown flag): a `--out=DIR` line now proceeds past argv and is refused only by a LATER input guard —
    # the removal under DIR is then the run's own lawful first effect; the log must never say "unknown"
    eqdir(){ local tool="$1" name="$2"; shift 2; local d="$TMPD/eq-$name"; mkdir -p "$d"; printf '{"seed":"eq"}\n' > "$d/$name"
      node $T/$tool "$@" "--out=$d" > "$TMPD/log" 2>&1; local rc=$?
      grep -q -i -E 'unknown (argument|flag)' "$TMPD/log" && nope "$tool --out=DIR: the strict loop still refuses the = form the pre-scan accepted: $(grep -i -E 'unknown (argument|flag)' "$TMPD/log" | head -1 | cut -c1-100)"
      [ "$rc" -ne 0 ] || nope "$tool --out=DIR with a refused input exited 0"
      [ ! -e "$d/$name" ] || nope "$tool --out=DIR: a lawful destination's prior report was not the first effect (the = form did not reach the writer)"; }
    eqdir cammatch-488d.mjs verify-registry-488d.json --verify-registry --web /nonexistent/web
    eqdir fullview-overlay-488d.mjs fullview-488d.json --from-dump /nonexistent-dump
    eqdir liveswitch-628.mjs liveswitch-628.json --web /nonexistent/web
    d="$TMPD/eq-mi"; mkdir -p "$d"; printf '{"seed":"eq"}\n' > "$d/id.json"; node $T/meshident-488d.mjs "--out=$d/id.json" --web /nonexistent/web > "$TMPD/log" 2>&1; rc=$?
    grep -q -i -E 'unknown (argument|flag)' "$TMPD/log" && nope "meshident --out=FILE: the strict loop still refuses the = form"; [ "$rc" -ne 0 ] && [ ! -e "$d/id.json" ] || nope "meshident --out=FILE: expected the prior identity removed then the --web refusal (rc $rc)"
    eqdir regdiff-628.mjs regdiff.json --a /nonexistent-a --b /nonexistent-b
    # a bool mode flag in the = form is one reader too: `--out D --selftest=1` is `--selftest 1` to the pre-scan, the loop and the run — refused as
    # an unknown token with the report under D byte-identical (Fable pass 2: the pre-scan read raw argv and removed it as report mode)
    d="$TMPD/eq-st"; mkdir -p "$d"; printf '{"seed":"st"}\n' > "$d/fullview-488d.json"; HST=$(sha "$d/fullview-488d.json")
    node $T/fullview-overlay-488d.mjs --out "$d" --selftest=1 > "$TMPD/log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && grep -q -E 'is a switch and takes no value|unexpected positional argument "1"|unknown argument: 1' "$TMPD/log" && [ "$(sha "$d/fullview-488d.json")" = "$HST" ] && ! grep -q 'invalidated before any guard' "$TMPD/log" || nope "fullview-488d --out D --selftest=1: expected the unknown-token refusal with D's report byte-identical and no removal (rc $rc): $(grep -o -E 'invalidated.*|unknown.*' "$TMPD/log" | head -1 | cut -c1-100)"
    printf '{"seed":"census"}\n' > "$TMPD/census.json"; HP=$(sha "$TMPD/census.json")
    # the python twin judges EVERY occurrence like guard_paths: `--out '' --out X` is refused with X byte-identical
    python3 $T/cammatch-488p-admit.py --write --out '' --out "$TMPD/census.json" > "$TMPD/log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && grep -q "REFUSED — --out $BLANK_MSG" "$TMPD/log" && [ "$(sha "$TMPD/census.json")" = "$HP" ] || nope "488p-admit --write --out '' --out X: expected the any-blank refusal with X byte-identical (rc $rc): $(tail -1 "$TMPD/log" | cut -c1-120)"
    python3 $T/cammatch-488p-admit.py --write --out '' > "$TMPD/log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && grep -q "REFUSED — --out $BLANK_MSG" "$TMPD/log" || nope "488p-admit --write --out '': expected the python twin's blank refusal (rc $rc): $(tail -1 "$TMPD/log" | cut -c1-120)"
    printf 'plate' > "$TMPD/plate.png"; python3 $T/gh488d/make_card_488d.py --out= --title t > "$TMPD/log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && grep -q "REFUSED — --out $BLANK_MSG" "$TMPD/log" || nope "make_card --out=: expected the python twin's blank refusal (rc $rc): $(tail -1 "$TMPD/log" | cut -c1-120)"
    echo "[arm-blank-destination-sweep] ARMED — 16 more converted tools + overlay-490-gate (already on pathOpt) + both python twins: a blank / = destination (and a blank --red-basis) is refused by name before any effect, every default-destination report byte-identical; the five strict-loop tools read --out=DIR as the pre-scan does; the python twin refuses a repeated blank with the other destination byte-identical"; exit 0;;
  eqdir-only)
    # the strict-loop `--out=DIR` case alone — the BEFORE log on the FIX8 export names the deletion the pass-1 refuter found
    TMPD=$(mktemp -d /tmp/ob-arm-eqonly-XXXXXX); : "${TMPD:?}"
    eqdir(){ local tool="$1" name="$2"; shift 2; local d="$TMPD/eq-$name"; mkdir -p "$d"; printf '{"seed":"eq"}\n' > "$d/$name"
      node $T/$tool "$@" "--out=$d" > "$TMPD/log" 2>&1; local rc=$?
      grep -q -i -E 'unknown (argument|flag)' "$TMPD/log" && { [ -e "$d/$name" ] || nope "$tool --out=DIR: the pre-scan REMOVED $name under DIR and the strict loop then refused the line as an unknown flag (two readers)"; nope "$tool --out=DIR: the strict loop refuses the = form the pre-scan accepted"; }
      [ "$rc" -ne 0 ] || nope "$tool --out=DIR with a refused input exited 0"
      [ ! -e "$d/$name" ] || nope "$tool --out=DIR: a lawful destination's prior report was not the first effect"; }
    eqdir cammatch-488d.mjs verify-registry-488d.json --verify-registry --web /nonexistent/web
    eqdir fullview-overlay-488d.mjs fullview-488d.json --from-dump /nonexistent-dump
    eqdir liveswitch-628.mjs liveswitch-628.json --web /nonexistent/web
    eqdir regdiff-628.mjs regdiff.json --a /nonexistent-a --b /nonexistent-b
    echo "[arm-eqdir-only] ARMED — the four strict-loop tools read --out=DIR as the pre-scan does (the removal under DIR is the run's lawful first effect, a later input guard refuses)"; exit 0;;
  asmodeled-490-coexist-red)
    # B2: the coexistence pair still bites, in an ISOLATED dir (OB_ARM_ASM490_DIR): a tampered decoy, a removed decoy, and a real
    # verdict preserved by hash — the pair never touches the real file
    TMPD=$(mktemp -d /tmp/ob-arm-coexred-XXXXXX); : "${TMPD:?}"; export OB_ARM_ASM490_DIR="$TMPD/iso"
    bash $T/arms-fix8.sh asmodeled-490-plant > "$TMPD/p1" 2>&1 || nope "plant (empty dir) did not arm: $(tail -1 "$TMPD/p1")"; grep -q '^DECOY ' "$TMPD/iso/.arm-fix8-decoy.sha" || nope "plant did not record a DECOY"
    printf 'x' >> "$TMPD/iso/asmodeled-metrics.json"; touch "$TMPD/iso/letters-compare.json"
    bash $T/arms-fix8.sh asmodeled-490-coexist > "$TMPD/c1" 2>&1 && nope "coexist ARMED over a tampered decoy"; grep -q 'changed under the letters run' "$TMPD/c1" || nope "coexist did not name the tampering: $(tail -1 "$TMPD/c1")"
    bash $T/arms-fix8.sh asmodeled-490-plant > "$TMPD/p2" 2>&1 || nope "re-plant did not arm"; rm -f "$TMPD/iso/asmodeled-metrics.json"; touch "$TMPD/iso/letters-compare.json"
    bash $T/arms-fix8.sh asmodeled-490-coexist > "$TMPD/c2" 2>&1 && nope "coexist ARMED over a removed decoy"; grep -q -E 'REMOVED|not this arm.s decoy any more' "$TMPD/c2" || nope "coexist did not name the removal: $(tail -1 "$TMPD/c2")"
    printf '{"tool":"tools/render/asmodeled-drawings-490.mjs","mode":"plain","real":true}\n' > "$TMPD/iso/asmodeled-metrics.json"; HREAL=$(sha "$TMPD/iso/asmodeled-metrics.json")
    bash $T/arms-fix8.sh asmodeled-490-plant > "$TMPD/p3" 2>&1 || nope "plant over a REAL verdict did not arm (a valid prior artefact must never be a precondition failure): $(tail -1 "$TMPD/p3")"
    grep -q '^REAL ' "$TMPD/iso/.arm-fix8-decoy.sha" || nope "plant did not record REAL"; same "$TMPD/iso/asmodeled-metrics.json" "$HREAL" || nope "plant touched the real verdict"
    sleep 1; touch "$TMPD/iso/letters-compare.json"; bash $T/arms-fix8.sh asmodeled-490-coexist > "$TMPD/c3" 2>&1 || nope "coexist over a preserved REAL verdict did not arm: $(tail -1 "$TMPD/c3")"
    same "$TMPD/iso/asmodeled-metrics.json" "$HREAL" || nope "coexist removed/changed the REAL verdict"
    printf 'y' >> "$TMPD/iso/asmodeled-metrics.json"; echo "REAL $HREAL" > "$TMPD/iso/.arm-fix8-decoy.sha"; touch "$TMPD/iso/letters-compare.json"
    bash $T/arms-fix8.sh asmodeled-490-coexist > "$TMPD/c4" 2>&1 && nope "coexist ARMED over a changed REAL verdict"; [ -e "$TMPD/iso/asmodeled-metrics.json" ] || nope "coexist removed a REAL verdict on its red path"
    echo "[arm-asmodeled-490-coexist-red] ARMED — the plant/coexist pair bites on a tampered or removed decoy and on a changed real verdict, preserves a real verdict by hash and never removes it"; exit 0;;
  asmodeled-490-prior-report)
    # B1 stand-in: a legitimate prior plain-mode report stands in the default output before the battery's plant row (a real plain run
    # is impossible on this tree and on main b430d377 — TIP_FACE_Y, pre-existing). Never overwrites a real report; replaces only an
    # arm decoy; the stand-in carries the real tool + mode fields and is NOT registered for removal (the coexist row preserves it).
    D="${OB_ARM_ASM490_DIR:-/tmp/ob-490r30-asmodeled}"; mkdir -p "$D"
    if [ -e "$D/asmodeled-metrics.json" ] && ! grep -q -E '"tool":"arm-fix[89]-decoy|"stand_in":' "$D/asmodeled-metrics.json"; then echo "[prior-report] standing — a real plain-mode report already stands at $D/asmodeled-metrics.json ($(sha "$D/asmodeled-metrics.json")); untouched"; exit 0; fi
    printf '{"tool":"tools/render/asmodeled-drawings-490.mjs","mode":"plain","stand_in":"FIX9 B1 — the plain path cannot run on this tree (TIP_FACE_Y absent from web/scene/table.js since the r30/r31 model rounds, also on main b430d377)","when":"%s"}\n' "$(date -u +%FT%TZ)" > "$D/asmodeled-metrics.json"
    echo "[prior-report] standing — prior plain-mode report placed at $D/asmodeled-metrics.json ($(sha "$D/asmodeled-metrics.json")) for the plant to hash and preserve"; exit 0;;
  *) echo "unknown arm $arm"; exit 2;;
esac
