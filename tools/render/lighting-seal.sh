#!/bin/zsh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# lighting-seal.sh — the venue-lighting lane's AFTER pipeline, one background run, FAIL-FAST (ORDER-LIGHT-7 R-D):
#   1. AFTER capture (10 tables × default/sp, 14 poses, HDR + identity + compiled-programs census) on the current tree
#   2. the Predator arm captures: scope (fill on/off, dressing hidden, stand-ins zeroed), arm (?venueArm=wallfill),
#      off (?venue=off), switch (live Predator → JOY), hookleak (the same under ?venueHook=leak), settle (fixture change
#      during capture under ?giDelay=1500) and settlelegacy (the same under venueSettle=legacy)
#   3. derived reads on every capture set (+ BEFORE), the on/off room-mask rows, the switch-arm pixel rows
#   4. photometric gate (spec, --regen-check) with every arm; 5. identity + programs fence; 6. pixel-delta sheets
# Every step propagates its exit: the first failure ends the run with that code and a "[seal] FAILED at <step>" line;
# a failed gate is a failed seal. OB_SEAL_ARM=gate makes the gate fail on purpose (the R-D arm: the seal must exit ≠ 0);
# OB_SEAL_ARM=pinmove (ORDER-LAND-638-FIX4 verifier item 3) runs the gate with --force-pin-shift 2 (the committed probe pin
# moved in memory by 2 × its tolerance: the PROBE-pin rows must FAIL on their real reads, the seal must exit ≠ 0).
# usage: tools/render/lighting-seal.sh <tag> [gate-spec.json] [photo-map.json] [--no-capture]
set -euo pipefail
TAG="${1:?tag}"; SPEC="${2:-tools/render/fixtures/lighting-gate-spec.json}"; PHOTOMAP="${3:-tools/render/fixtures/lighting-photo-map.json}"
NOCAP="${4:-}"
ROOT=output/lighting; AFTER=$ROOT/after-$TAG; BEFORE=$ROOT/before
MAINALT="${OB_MAIN_ALT:-}"  # optional LIVE re-measurement of main's flip; the committed fixture tools/render/fixtures/lighting-main-flip.json is the default (ORDER-LIGHT-9 Q6)
ARMS=(flushoff flushdup scope arm off switch hookleak settle settlelegacy shmove offscope ledgerarm legacyrect occ occoff cup cupoff fixcanopy fixback switchback nogi nogioff pendant pendantoff nogiarm pendantarm mixoldgi mixoldgioff mixoldballset mixoldballsetoff mixoldmain mixoldmainoff mixold662main mixold662mainoff mixoldroom mixoldroomoff mixoldlv mixoldlvoff pdtcanopy pdtring fixtrip fixctl settleoff pdtringoff gierr nofloat throwrender throwreadback gifail gifailoff gifailarm pmremarm pmremarmoff conv gidelay gidelayprefix readnoop readnoopprefix throwrerack throwrerackprefix mixnolut mixnolutoff mixoldshading mixoldshadingoff mixoldlook mixoldlookoff mixnoflag mixnoflagoff lookswitch lookswitchprefix gistall gilate leafstall leafstall2 gistallpre leafstall3 leafstall3pre gistalloff leafstall2off leafstall3off churn churnoff lookfail lookthrow lookfailnet lookfailpre livestall degradehold dbq dbqlegacy dbq0px dbq0pxlegacy studio studiolegacy studiopre studionoop studiolate studiofail studiofailpre studiofaillegacypark studioqueue studioqueuepre studioqueuelong studioqueuelonglegacy lifecycle lifecyclelegacy rebakedefer rebakedeferlegacy rebakesingle gridshadow gridshadowlegacy rebakecancel rebakecancellegacy convlegacy gridshadowfix3 gridneg gridnegfix3 applyseq applyseqlegacy probefadelegacy welllegacy cupwell cupwelllegacy gikey gikeylegacy gikeymain convfix3 nogilegacy slowbake slowbakelegacy cupsplit cupsplitfix5 slowbakefix6 ctrla1 ctrlb1 ctrlb2 ctrla2 h3unbounded pendantfix7 lookswitchfix7 dbq0pxfix7 dbq0pxlegacyfix7 h3bounded h3boundedfix7 studiofill studiofill0 studiofilllegacy samplercancel samplercancellegacy samplerfail samplerfaillegacy samplerhold samplerholdlegacy h3stallstraddle h3stallstraddlewall giball giballreader ctrla1reader absentkey ballift balliftlegacy pendantnk kneecanopy kneering kneependant kneesnookerlum kneecaromlum kneeauto kneecanopyon kneecanopynk nogink gifailnk snookerpendant snookerpendantnk pdtringnk)
MIXED=(oldgi oldshading oldroom oldlook oldlv nolut noflag oldballset oldmain old662main)  # ORDER-LIGHT-FIX6: the ONE-STALE-LEAF MATRIX (8 trees, one participating leaf in main's state each) + oldmain, the reverse pairing (tools/render/lighting-mixed-trees.sh)
MIXROOT="${OB_MIX_ROOT:-/tmp/ob-lighting-mix-$TAG}"
LOG=$ROOT/seal-$TAG.log
[ "$NOCAP" = "--no-capture" ] && LOG=$ROOT/seal-$TAG-regate.log
[ -n "${OB_SEAL_ARM:-}" ] && LOG=$ROOT/seal-$TAG-arm-${OB_SEAL_ARM}.log
STEP=start; STEP_EXPORT=""; typeset -a EXECUTED_STEPS REUSED_STEPS; EXECUTED_STEPS=(); REUSED_STEPS=(); CAPTURE_ENTRIES=0
# step(): the one FAILED witness (see below) — defined HERE because the review-r6 tool arms right below call it (third land5
# regate: 'command not found: step' → exit 127, the arms had never run)
# ORDER-LIGHT-L25 (maintainer, attempt-4 finding): every arm DECLARES the step and exit code it must fail at. An arm that
# exits non-zero at a different step proved nothing (attempt 4: gate/silent/missing/pinmove all exited 5 at check-runs, refused
# by an unrelated failed capture set, and were read as fired), and an arm that exits 0 did not fire at all. Both are FAILED
# proofs and both now say so in one machine-readable line.
typeset -A ARM_EXPECT=(studiofill 'check-studiofill:3' noarm 'arm-noarm:4' flipoff 'arm-flipoff:4' flipmissing 'arm-flipmissing:6' hdrleak 'arm-hdrleak:4' nolutprefix 'arm-nolutprefix:4' armgatedegrade 'check-armgate:15' armgatelatejoin 'check-armgate:16' gridwell 'check-gridwell:14' ctrlstrict 'check-ctrl:3' ctrlblind 'check-ctrl:3' ctrlselfcheck 'check-ctrl:3' ctrlnovenue 'check-ctrl:3' ctrldecl 'check-ctrl:3' ctrlwpabroken 'check-ctrl:3' fencedead 'arm-fencenullroom-null:12' texhash 'check-texhash:13' gate 'gate:3' silent 'gate:3' missing 'gate:3' pinmove 'gate:3' capfail 'arm-capfail:2' nohdr 'arm-nohdr:4' stale 'arm-stale:5' armbase 'check-arms:3' pokestuck 'arm-pokestuck:2' pinzero 'gate:7' noreadpin 'gate:3' stepexport 'capture-giball:20' partitiondrop 'check-capture-partition:22' noreadexpire 'gate:3' unarmednote 'gate:3' giballreader 'fence-giball:12' absentkeylegacy 'fence-absentcensus:12' studiofillmissing 'check-studiofill:3' studiofillpng 'check-studiofill:3' pixelrgb 'pixel-fixture:3' gridwelllook 'check-gridwell:14' gistallforever 'arm-gistallforever:2' leafstallforever 'arm-leafstallforever:2' tablefallback 'arm-tablefallback:2' posemissing 'arm-posemissing:2' fliphdr 'arm-fliphdr:7' nullrunid 'arm-nullrunid:5' packcensus 'arm-packcensus:2' carrymix 'arm-carrymix:5' degradeholdforever 'arm-degradeholdforever:2' noredarm 'arm-noredarm:3' fencenullroom 'fence:3' occlutpre 'arm-occlutpre:4' occlutnotail 'arm-occlutnotail:4' fenceflushoff 'fence:3' resumebake 'arm-resumebake:2' settledpending 'check-settled:3' nobasekeep 'check-nobase:6' speckey 'check-spec-keys:7' pokefailcap 'check-pokefail:8' writeonce 'check-writeonce:11' danglinglink 'check-links:10' armgate 'check-armgate:12' ctrlunattrib 'check-ctrl:3' ctrlattribmissing 'check-ctrl:3')
# ORDER-LIGHT-C2-FIX10 condition 1: three ctrl arms share exit 3 — the declared WORD (read from the tool's own verdict file, never from this log) tells them apart
# the arm list the control judge prints per truth-table cell: the DRIVER's ARMLIST when it exports OB_CTRL_ARMS (the run's actual list), else this seal's declared arms
export OB_CTRL_ARMS="${OB_CTRL_ARMS:-${(kj: :)ARM_EXPECT}}" OB_CTRL_ARMS_SRC="${OB_CTRL_ARMS_SRC:-seal ARM_EXPECT (declared arms)}"
typeset -A ARM_EXPECT_WORD=(ctrlstrict 'FAIL —' ctrlblind 'UNJUDGEABLE (instrument blind)' ctrlselfcheck 'UNJUDGEABLE (instrument) —' ctrlnovenue 'did not run where it is declared to run' ctrldecl 'changed under the declaration' ctrlwpabroken 'the excluded surface is broken' ctrlunattrib 'FAIL (a-lane)' ctrlattribmissing 'attribution variant T declared at')
armverdict() {  # $1 = step that failed, $2 = its exit code
  local A="${OB_SEAL_ARM:-}" want word vf; [ -n "$A" ] || return 0; want="${ARM_EXPECT[$A]:-}"; [ -n "$want" ] || return 0
  if [ "$1:$2" = "$want" ]; then
    word="${ARM_EXPECT_WORD[$A]:-}"
    if [ -n "$word" ]; then vf="$ROOT/check-ctrl-$TAG-verdict.txt"
      if [ -f "$vf" ] && grep -qF -- "$word" "$vf"; then echo "[seal] ARM-VERDICT $A FIRED: step $1 exit $2 = declared $want AND the verdict word '$word' read in $vf -> FAILED for the right reason (the arm fires)"
      else echo "[seal] ARM-VERDICT $A WRONG-REASON: exit matched ($1:$2) but the declared verdict word '$word' is NOT in $vf ($(head -c 200 "$vf" 2>/dev/null || echo 'no verdict file')) - the step failed for another reason, this run proves nothing"; fi
    else echo "[seal] ARM-VERDICT $A FIRED: step $1 exit $2 = declared $want -> FAILED for the right reason (the arm fires)"; fi
  else echo "[seal] ARM-VERDICT $A WRONG-REASON: declared $want, got $1:$2 - the arm never reached its own step, this run proves nothing"; fi; }
armdead() { echo "[seal] ARM-VERDICT ${OB_SEAL_ARM:-?} DID-NOT-FIRE: the seal is exiting 0 - a failed proof, never a pass"; exit 0; }
# ORDER-LIGHT-C2-FIX10 (maintainer, 2026-09-14 15:1xZ — the reaper has a name: /usr/libexec/tmp_cleaner, daily at 00:00 local = 07:00Z, age-selected): a
# worktree under /tmp that a step READS is asserted at the point of use, not only at launch — a chain crossing 07:00Z would otherwise run its tail on a void.
# assert_export <dir> <sha> <step>: the dir must be a git worktree at <sha> with web/app.html and web/tools/cdp.mjs present; otherwise the STEP fails by name
# (exit 20) — in a capturing run the seal stops red, in an arm run the arm reads WRONG-REASON — the chain grade degrades, nothing passes on a hollow tree.
assert_export() { local d="$1" sha="$2" st="$3" h
  h=$(git -C "$d" rev-parse --short=8 HEAD 2>/dev/null || echo NOGIT)
  if [ "$h" = "$sha" ] && [ -f "$d/web/app.html" ] && [ -f "$d/web/tools/cdp.mjs" ]; then echo "[seal] export $d verified at $sha (web/ present) for $st"; return 0; fi
  echo "[seal] FAILED at $st exit 20 $(date -u +%FT%TZ) (export $d is not a real worktree at $sha with web/ present — HEAD $h; the tmp_cleaner reaper or a stale registration: restore it, never proceed on a void)"; armverdict "$st" 20; exit 20; }
# (land31 arm phase, C2-FIX9 N9 P3-2 follow-through) five arms exit with their own `echo FAILED …; exit N` instead of through step(): they call armverdict
# themselves right before the exit (noarm, flipoff, flipmissing, hdrleak, nolutprefix) — a declared arm that cannot print its own verdict read as UNDECLARED
# in the land31 arm phase (the fourth branch is a fail, as ordered)
# ORDER-LIGHT-FIX6 targeted regate: OB_SEAL_CAPTURE_ONLY = space-separated capture-step suffixes (zsh globs allowed, e.g. "after off conv
# mix*"); every OTHER capture step is not run — its set is REUSED from the previous tag OB_SEAL_REUSE_TAG through a symlink
# after-$TAG-X → after-$REUSE-X made here and LOGGED by name (a set that is neither captured nor reusable fails the step). Sets whose
# name carries no tag (the shared main baseline) are reused in place. Never a silent skip, never a silent capture.
reuse_or_skip() {  # $1 = step name (capture-X), rest = the step's command line; returns 0 = reused (skip), 1 = run it
  local name="${1#capture-}"; shift; local pat want=0
  for pat in ${=OB_SEAL_CAPTURE_ONLY}; do [[ "$name" == ${~pat} ]] && want=1; done
  [ $want = 1 ] && return 1
  local out="" prev=""; while [ $# -gt 0 ]; do [ "$1" = "--out" ] && { out="$2"; break; }; shift; done
  [ -n "$out" ] || { echo "[seal] capture-$name: no --out to reuse — refusing to skip"; return 2; }
  local base="$(basename "$out")" dir="$(dirname "$out")"
  if [[ "$base" != *"-$TAG"* ]]; then echo "[seal] capture-$name SKIPPED (targeted regate): $base is a shared set, reused in place"; return 0; fi
  [ -n "${OB_SEAL_REUSE_TAG:-}" ] || { echo "[seal] capture-$name: OB_SEAL_CAPTURE_ONLY is set but OB_SEAL_REUSE_TAG is not — refusing to skip"; return 2; }
  local src="${base/-$TAG/-$OB_SEAL_REUSE_TAG}"
  if [ -e "$out" ] && [ ! -L "$out" ]; then
    # (refuter round 2) a real set under this tag is reused only if its manifest names THIS tree — a set left by a killed earlier
    # attempt on another commit must not be judged as this tree's
    local msha; msha=$(python3 -c "import json;print(str(json.load(open('$out/manifest.json')).get('sha',''))[:8])" 2>/dev/null || echo '?')
    local hsha; hsha=$(git rev-parse --short=8 HEAD 2>/dev/null || echo '??')
    if [ "$msha" = "$hsha" ]; then echo "[seal] capture-$name SKIPPED (targeted regate): $out already exists as a real set of THIS tree (manifest sha $msha = HEAD)"; return 0; fi
    echo "[seal] capture-$name: $out exists but its manifest names tree $msha ≠ HEAD $hsha — refusing to reuse a killed attempt's set"; return 2
  fi
  [ -d "$dir/$src" ] || { echo "[seal] capture-$name: nothing to reuse — $dir/$src does not exist"; return 2; }
  ln -sfn "$src" "$out"; echo "[seal] capture-$name SKIPPED (targeted regate): $base → $src REUSED from tag $OB_SEAL_REUSE_TAG ($(python3 -c "import json,sys;m=json.load(open('$dir/$src/manifest.json'));print(len(m.get('runs',[])),'runs, sha',str(m.get('sha',''))[:8])" 2>/dev/null))"; return 0; }
step() { STEP="$1"; shift
  # C2-FIX10 (land32 attempt 1 stopped at capture-studiopre): an export a step READS is asserted only when the step actually EXECUTES — a step reused by
  # link never boots its export, so the assert set beside it (STEP_EXPORT="<dir>:<sha>") is consumed here, after the reuse decision, never before the call
  local sx="${STEP_EXPORT:-}"; STEP_EXPORT=""
  local pout="" pa=("$@"); while [ ${#pa[@]} -gt 0 ]; do [ "${pa[1]}" = "--out" ] && { pout="${pa[2]}"; break; }; shift pa; done
  [[ "$STEP" == capture-* ]] && CAPTURE_ENTRIES=$((CAPTURE_ENTRIES+1))
  # CLASS R arm (partitiondrop): a planted THIRD branch — one named set leaves step() counted in neither partition; the partition total must red it
  if [[ "$STEP" == capture-* && -n "${OB_PARTITION_DROP:-}" && "$STEP" == "capture-${OB_PARTITION_DROP}" ]]; then echo "[seal] $STEP: PLANTED drop (OB_PARTITION_DROP) — counted in neither branch"; return 0; fi
  if [[ "$STEP" == capture-* && -n "${OB_SEAL_CAPTURE_ONLY:-}" ]]; then
    # (this file runs under set -e: a bare non-zero return here would end the seal with no witness — land9 attempt 1 did exactly that)
    local r=0; reuse_or_skip "$STEP" "$@" || r=$?
    if [ $r = 0 ]; then
      # CLASS R (maintainer, land32 attempt 1): the reused branch is COUNTED, not just logged — the link target's tag and manifest sha go into the partition
      local lt="" ls_=""; lt=$(readlink "$pout" 2>/dev/null || echo '?'); ls_=$(python3 -c "import json,sys;print(str(json.load(open(sys.argv[1]+'/manifest.json')).get('sha',''))[:8])" "$pout" 2>/dev/null || echo '?')
      REUSED_STEPS+=("$STEP ← ${lt##*/} sha $ls_")
      [ -n "$sx" ] && echo "[seal] $STEP: export assert not applicable (reused by link — ${sx%%:*} not booted)"
      return 0
    fi
    [ $r = 2 ] && { echo "[seal] FAILED at $STEP exit 8 (targeted regate: cannot reuse)"; armverdict "$STEP" 8; exit 8; }
  fi
  if [[ "$STEP" == capture-* ]]; then
    # ORDER-LIGHT-C2-FIX4 class B: a sealed set is write-once and a capture never writes THROUGH a symlink — the guard detaches a reuse link at
    # --out (the capture lands in a fresh directory under the link's name) and REFUSES by name a directory another set links to or a sealed one
    local gout="" ga=("$@"); while [ ${#ga[@]} -gt 0 ]; do [ "${ga[1]}" = "--out" ] && { gout="${ga[2]}"; break; }; shift ga; done
    if [ -n "$gout" ]; then tools/render/lighting-out-guard.sh "$gout" || { rc=$?; echo "[seal] FAILED at $STEP exit $rc $(date -u +%FT%TZ) (write-once guard refused --out $gout)"; armverdict "$STEP" "$rc"; exit $rc; }; fi
  fi
  [ -n "$sx" ] && assert_export "${sx%%:*}" "${sx##*:}" "$STEP"
  [[ "$STEP" == capture-* ]] && EXECUTED_STEPS+=("$STEP${sx:+ (export ${sx%%:*} @ ${sx##*:} asserted)}")
  # (maintainer 19:1xZ, after land38\'s base boot drifted under the CI drain) every executed CAPTURE step records the box it booted on: one nice-0 runnable sample + load;
  # the census of the set carries venueStallMs / venueLongestFrameMs / venueSettleRel per cell, so a drift is attributable rather than mysterious
  [[ "$STEP" == capture-* ]] && echo "[seal] step $STEP box: nice-0 runnable $(ps -axo nice=,stat= | awk '$1==0 && $2 ~ /^R/ {n++} END {print n+0}') load $(uptime | sed 's/.*averages*: *//')"
  echo "[seal] step $STEP $(date -u +%FT%TZ)"; "$@" || { rc=$?; echo "[seal] FAILED at $STEP exit $rc $(date -u +%FT%TZ)"; armverdict "$STEP" "$rc"; exit $rc; }; echo "[seal] $STEP EXIT 0"; }
# CLASS R: the capture partition, printed and ASSERTED at the end of the capture block — N executed must equal the fresh list exactly (no extra, no missing), every
# other capture step must have been reused (M counted with its tag + sha); a mismatch in either direction FAILS the seal (exit 21), never a warning
partition_check() {
  local n=${#EXECUTED_STEPS[@]} m=${#REUSED_STEPS[@]} want=0 miss=() extra=() x setn
  echo "[seal] CAPTURE PARTITION: $n executed + $m reused by link = $((n+m)) of $CAPTURE_ENTRIES capture steps entered (targeted form: fresh list = ${OB_SEAL_CAPTURE_ONLY:-<none: full capture>})"
  for x in "${EXECUTED_STEPS[@]}"; do echo "[seal]   executed: $x"; done
  for x in "${REUSED_STEPS[@]}"; do echo "[seal]   reused:   $x"; done
  [ -z "${OB_SEAL_CAPTURE_ONLY:-}" ] && { echo "[seal] partition: full capture (no fresh list) — $n executed, $m reused"; return 0; }
  for setn in ${=OB_SEAL_CAPTURE_ONLY}; do want=$((want+1)); local found=0; for x in "${EXECUTED_STEPS[@]}"; do [ "${x%% *}" = "capture-$setn" ] && found=1; done; [ $found = 1 ] || miss+=("$setn"); done
  for x in "${EXECUTED_STEPS[@]}"; do setn="${x%% *}"; setn="${setn#capture-}"; local ok=0; for w in ${=OB_SEAL_CAPTURE_ONLY}; do [ "$w" = "$setn" ] && ok=1; done; [ $ok = 1 ] || extra+=("$setn"); done
  if [ $((n+m)) != "$CAPTURE_ENTRIES" ]; then echo "[seal] FAILED at check-capture-partition exit 22 $(date -u +%FT%TZ) (total: executed $n + reused $m = $((n+m)) != $CAPTURE_ENTRIES capture steps entered — a capture step left step() counted in neither branch)"; armverdict check-capture-partition 22; exit 22; fi
  if [ ${#miss[@]} = 0 ] && [ ${#extra[@]} = 0 ] && [ $n = $want ]; then echo "[seal] partition ASSERTED: executed $n == fresh list $want (every listed set booted, nothing beyond it), reused $m, total $((n+m)) == $CAPTURE_ENTRIES entered"; return 0; fi
  echo "[seal] FAILED at check-capture-partition exit 21 $(date -u +%FT%TZ) (executed $n vs fresh list $want; missing: ${miss[*]:-none}; beyond the list: ${extra[*]:-none})"; armverdict check-capture-partition 21; exit 21; }
# ORDER-LAND-638-FIX2 (review r6) negative arms for the TOOLS — each runs one step that must FAIL (the seal exits ≠ 0):
#   capfail: a capture whose every attempt is exhausted must exit non-zero (a poke that throws on every attempt)
#   nohdr:   an offcheck cell without its HDR pair must FAIL (a copy of the off set with one .hdr.f32 removed)
#   stale:   a RESUMED capture dir must be refused by check-runs (a stale seeded cell + one re-captured cell → priorRunIds)
# ORDER-LIGHT-C2-FIX1 A(ii): the studio poke prelude and the studiofail poke are defined HERE (hoisted from the capture block) because the resumebake
# arm below runs the studiofail capture under --no-capture; the capture steps use the same two variables
STUDIO_FN='const __obStudio = async (f) => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const d = window.__dbg; let h0 = null; d.scene.traverse((o) => { if (o.isHemisphereLight) h0 = o; }); window.__studioHemi0 = h0 ? h0.intensity : null; const m = await import("/app/cinelight.js"); const h = m.installCineLight({ scene: d.scene, renderer: d.renderer, camera: d.camera, cubeCam: d.cubeCam, ballMeshes: (window.__test && window.__test.ballMeshes) ? window.__test.ballMeshes() : [] }); const rects = []; const points = []; d.scene.traverse((o) => { if (o.isRectAreaLight && o.visible) rects.push(o); if (o.isPointLight) points.push(o.intensity); }); const base = rects.map((l) => l.intensity); for (const l of rects) l.intensity *= f; window.__studio = { handle: h, rects, factor: f, base, points }; await w(150); return { ok: true, factor: f, rects: rects.length }; }; const __obStudioRun = (f, after) => { window.__pokePending = true; __obStudio(f).then(async (r) => { try { if (after) await after(); window.__pokeResult = r; } catch (e) { window.__pokeResult = { error: "studio poke (after): " + String(e && e.message || e) }; } window.__pokePending = false; }, (e) => { window.__studio = { error: String(e && e.message || e), rects: [], factor: null }; window.__pokeResult = { error: "studio poke: " + String(e && e.message || e) }; window.__pokePending = false; }); };'
# B21 (ruling 92d6ce0e): the studiofail poke reaches its subjects through gi.js's C2 seam. lightingvisuals' regrade starts a venue
# apply whose capture parks in the window, and G.reapply() makes the live look apply fail there (giFail=look:live:1). The old stimulus,
# __test.setLook("sp"), no longer reaches them: since GH-973 (11405ce5) look.js retries a rejected setLook with the legacy id, which
# recovers the injected failure, and look.js parks a pick made inside the window until its close (ruling 741c231d). The poke leaves
# lightingvisuals' look at tournament while the scene stays default; no row of the set reads it. STUDIOFAIL_PRE_JS keeps the setLook
# poke for the studiofailpre arm: the pre-C2 tree predates both the retry and the park, and has no gi.reapply.
STUDIOFAIL_JS="studiofail=$STUDIO_FN __obStudioRun(1, async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const G = window.__gi; try { window.__lighting.regrade(\"sp\"); await G.reapply(); } catch (e) { window.__studioFailErr = String(e && e.message || e); } for (let i = 0; i < 100 && G.state.appliedSeq !== G.state.applySeq; i++) await w(100); await w(200); window.__studio.handle.revert(); window.__studio.reverted = true; await w(300); });"
STUDIOFAIL_PRE_JS="studiofail=$STUDIO_FN __obStudioRun(1, async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const G = window.__gi; try { await window.__test.setLook(\"sp\"); } catch (e) { window.__studioFailErr = String(e && e.message || e); } for (let i = 0; i < 100 && G.state.appliedSeq !== G.state.applySeq; i++) await w(100); await w(200); window.__studio.handle.revert(); window.__studio.reverted = true; await w(300); });"
case "${OB_SEAL_ARM:-}" in
  capfail)
    # (an unknown table id is NOT a trigger: the app falls back to its default table and settles — the land5 regate's re-run
    # printed 'did NOT fail'; a poke that throws fails every attempt of its run and exits 2 naming the cell)
    step arm-capfail node tools/render/lighting-capture.mjs --out "$ROOT/arm-capfail-$TAG" --tables predator_apex_9ft --look default --poses full34 --poke-raw 'capfail=(() => { throw new Error("arm: forced poke failure - every attempt of this run must fail"); })()'
    echo "[seal] arm capfail: the capture step did NOT fail (this line must never print)"; armdead;;
  # ORDER-LIGHT-C2-FIX1 A(ii) (land16 attempt 5, capture-studiofail): under the PRE-FIX resume rule (?venueResumeBake=legacy) the studiofail boot
  # never settles — the capture must exhaust its attempts (exit 2); a seal whose studiofail capture SETTLES under that flag has lost the fix
  resumebake)
    step arm-resumebake node tools/render/lighting-capture.mjs --out "$ROOT/arm-resumebake-$TAG" --tables predator_apex_9ft --look default --poses cueball_level --flags "fixture=canopy_panel&giFail=look:live:1&venueResumeBake=legacy" --no-base --poke-raw "$STUDIOFAIL_JS"
    echo "[seal] arm resumebake: the studiofail capture SETTLED under the pre-fix resume rule (this line must never print)"; armdead;;
  # the GENERIC settle invariant's arm: one sealed census with venueCapturePending flipped to 1 must be refused by check-settled (exit 3)
  settledpending)
    SP="$ROOT/arm-settledpending-$TAG"; [ -e "$SP" ] && chmod -R u+w "$SP"; rm -rf -- "${SP:?}"; mkdir -p "$SP/default/predator_apex_9ft"
    cp "$AFTER/manifest.json" "$SP/" && cp "$AFTER/default/predator_apex_9ft/census.json" "$SP/default/predator_apex_9ft/" && chmod -R u+w "$SP"  # the copies of a SEALED set inherit its read-only modes (class B); the arm rewrites its own copy
    python3 - "$SP/default/predator_apex_9ft/census.json" <<'PY'
import json,sys
c=json.load(open(sys.argv[1])); c.setdefault('contract',{})['venueCapturePending']=1; json.dump(c,open(sys.argv[1],'w'),indent=1); print('[seal] arm settledpending: flipped venueCapturePending -> 1 in', sys.argv[1])
PY
    step check-settled python3 tools/render/lighting-check-settled.py "$SP"
    echo "[seal] arm settledpending: check-settled ACCEPTED a dump with the venue capture pending (this line must never print)"; armdead;;
  # ORDER-LIGHT-C2-FIX2 class C: under the PRE-FIX manifest filter (OB_CAPTURE_NOBASE_FILTER=legacy) a --no-base continuation drops the baseline
  # record — lighting-check-nobase.sh must refuse (exit 6); the same check runs as a judged step in the capturing seal
  nobasekeep)
    step check-nobase env OB_CAPTURE_NOBASE_FILTER=legacy tools/render/lighting-check-nobase.sh "$ROOT/arm-nobasekeep-$TAG"
    echo "[seal] arm nobasekeep: check-nobase ACCEPTED the pre-fix filter that drops the baseline record (this line must never print)"; armdead;;
  # ORDER-LIGHT-C2-FIX3 class C arm: under OB_CAPTURE_POKERESULT=legacy the capture tool skips the result check for an async poke that failed inside
  # its 400 ms sleep and captures with pokeApplied=true — lighting-check-pokefail.sh must refuse (exit 8); the same check runs as a judged step below
  pokefailcap)
    step check-pokefail env OB_CAPTURE_POKERESULT=legacy tools/render/lighting-check-pokefail.sh "$ROOT/arm-pokefailcap-$TAG"
    echo "[seal] arm pokefailcap: check-pokefail ACCEPTED the pre-fix tool that captured over an immediately-failed poke (this line must never print)"; armdead;;
  # ORDER-LIGHT-C2-FIX4 class B arms: writeonce = the write-once check under the pre-fix rule (no guard: a recapture writes THROUGH the reuse link
  # and the previous tag's scratch set changes → exit 11); danglinglink = a dangling link planted among the sets → check-links must refuse (exit 10)
  writeonce)
    step check-writeonce env OB_SEAL_WRITEONCE=legacy tools/render/lighting-check-writeonce.sh "$ROOT/arm-writeonce-$TAG"
    echo "[seal] arm writeonce: check-writeonce ACCEPTED a recapture through a reuse link (this line must never print)"; armdead;;
  danglinglink)
    DL="$ROOT/after-armdangle-$TAG"; case "$DL" in output/lighting/after-armdangle-*) ;; *) echo "refusing $DL"; exit 9;; esac
    ln -sfn "after-armdangle-nowhere-$TAG" "$DL"; echo "[seal] arm danglinglink: planted $DL -> after-armdangle-nowhere-$TAG"
    trap 'rm -f -- "$DL"' EXIT
    step check-links tools/render/lighting-check-links.sh "$ROOT" "$TAG"
    echo "[seal] arm danglinglink: check-links ACCEPTED a dangling link (this line must never print)"; armdead;;
  # ORDER-LIGHT-C2-FIX4 (maintainer condition) arm: the flagged boot made SCRIPTED — the arm switches take effect and the identity check must refuse (exit 12)
  texhash)
    step check-texhash env OB_TEXHASH_ARM=legacy node tools/render/lighting-check-texhash.mjs
    echo "[seal] arm texhash: the sampled-element hash separated the half-float plant (this line must never print)"; armdead;;
  armgate)
    step check-armgate env OB_ARMGATE_ARM=scripted node tools/render/lighting-check-armgate.mjs
    echo "[seal] arm armgate: check-armgate ACCEPTED a scripted boot whose arm strings changed the programs (this line must never print)"; armdead;;
  # ORDER-LIGHT-C2-FIX8 class J2 arms: (degrade) the second default-form boot is made to DEGRADE at the budget (an unbounded hold) — the judge must report
  # the DEGRADED DEFAULT BOOT row (exit 15), never a flag-leak verdict; (latejoin) a SpotLight joins the scene AFTER the settled read — the late-join judge must red (exit 16)
  armgatedegrade)
    step check-armgate env OB_ARMGATE_PLANT=degrade node tools/render/lighting-check-armgate.mjs
    echo "[seal] arm armgatedegrade: check-armgate compared a degraded boot with a derived one without the DEGRADED DEFAULT BOOT row (this line must never print)"; armdead;;
  armgatelatejoin)
    step check-armgate env OB_ARMGATE_PLANT=latejoin node tools/render/lighting-check-armgate.mjs
    echo "[seal] arm armgatelatejoin: a light that joined after the settled read was not caught (this line must never print)"; armdead;;
  # ORDER-LIGHT-C2-FIX7 class L arm: the 85f77c16 witness binding put back (scripted boots, ?gridWellWitness=legacy) — check-gridwell must FAIL (exit 14)
  gridwell)
    step check-gridwell env OB_GRIDWELL_ARM=legacy node tools/render/lighting-check-gridwell.mjs
    echo "[seal] arm gridwell: check-gridwell ACCEPTED the 85f77c16 witness binding on intact splices (this line must never print)"; armdead;;
  # ORDER-LIGHT-C2-FIX7 (the proportionate seal form) arm: the strict pixel control compared against the ?venue=off set must FAIL (exit 3)
  ctrlstrict)
    step check-ctrl env OB_CTRL_ARM=off tools/render/lighting-check-ctrl.sh "$ROOT" "$TAG" --stage regate
    echo "[seal] arm ctrlstrict: check-ctrl read 0 changed pixels between the venue-ON control and the ?venue=off set (this line must never print)"; armdead;;
  # ORDER-LIGHT-C2-FIX10 condition 1 arms (judges-only, reuse the record's sets): ctrlblind feeds the sensitivity row B2 ITSELF in place of the perturbed set — the row
  # must read identical and the verdict must be UNJUDGEABLE (instrument blind), exit 3 (a sensitivity row that cannot declare blindness is decoration);
  # ctrlselfcheck puts the perturbed set in A2's place — the A-side self-check differs and the verdict must be UNJUDGEABLE (instrument), NOT FAIL (the word is checked)
  ctrlblind)
    step check-ctrl env OB_CTRL_ARM=blind tools/render/lighting-check-ctrl.sh "$ROOT" "$TAG" --stage regate
    echo "[seal] arm ctrlblind: check-ctrl accepted a sensitivity row that read identical (this line must never print)"; armdead;;
  ctrlselfcheck)
    step check-ctrl env OB_CTRL_ARM=selfcheck tools/render/lighting-check-ctrl.sh "$ROOT" "$TAG" --stage regate
    echo "[seal] arm ctrlselfcheck: check-ctrl judged a cross pair whose A-side self-check had moved (this line must never print)"; armdead;;
  # ORDER-LIGHT-C2-FIX10 (maintainer ruling 17:2xZ — an exclusion derived from the census it exempts): the venue declaration is asserted both ways; ctrlnovenue = the
  # ?venue=off boot in B2's place on the DECLARED-runs table → RED "did not run where it is declared to run" (never n/a); ctrldecl = a PLANTED declaration calling
  # predator identity-by-design while its census reads derived 1 → UNJUDGEABLE "changed under the declaration"
  ctrlnovenue)
    step check-ctrl env OB_CTRL_ARM=novenue tools/render/lighting-check-ctrl.sh "$ROOT" "$TAG" --stage regate
    echo "[seal] arm ctrlnovenue: check-ctrl read a venue-off boot on the declared-runs table as identity by design (this line must never print)"; armdead;;
  ctrldecl)
    step check-ctrl env OB_CTRL_ARM=decl tools/render/lighting-check-ctrl.sh "$ROOT" "$TAG" --stage regate
    echo "[seal] arm ctrldecl: check-ctrl accepted a declaration its census contradicts (this line must never print)"; armdead;;
  # (maintainer 17:3xZ — the arm the ruling actually named: a REAL defect in the EXCLUDED surface) ctrlwpabroken = a copy of B2 whose wpa census reads derived 0 WITH
  # an error name and a bake — neither derived 1 nor the never-ran signature — under the identity declaration → RED "the excluded surface is broken", never n/a
  ctrlwpabroken)
    step check-ctrl env OB_CTRL_ARM=wpabroken tools/render/lighting-check-ctrl.sh "$ROOT" "$TAG" --stage regate
    echo "[seal] arm ctrlwpabroken: check-ctrl read a degraded venue term on the excluded table as identity by design (this line must never print)"; armdead;;
  # --- ATTRIBUTION arms (maintainer ruling 2026-09-15 00:5xZ): ctrlunattrib = both main-only variants pointed at A1 (nothing reproduces B1) → a cross-pair difference
  # must read UNATTRIBUTED, FAIL (a-lane), never PASS-WITH-ATTRIBUTED; ctrlattribmissing = a variant declared at an absent path → UNJUDGEABLE (instrument), never attributed
  ctrlunattrib)
    step check-ctrl env OB_CTRL_ARM=unattrib tools/render/lighting-check-ctrl.sh "$ROOT" "$TAG" --stage regate
    echo "[seal] arm ctrlunattrib: check-ctrl attributed (or passed) a cross-pair difference no main-only variant reproduced (this line must never print)"; armdead;;
  ctrlattribmissing)
    step check-ctrl env OB_CTRL_ARM=attribmissing tools/render/lighting-check-ctrl.sh "$ROOT" "$TAG" --stage regate
    echo "[seal] arm ctrlattribmissing: check-ctrl read an absent attribution set as attributed or passed (this line must never print)"; armdead;;
  studiofill)  # ORDER-LIGHT-C2-FIX9 N1 (c): the ?venueStudioGate=legacy boot (the 6a076a6d rule) against gain 0 — the studio frames must differ → check-studiofill FAILS 3
    step check-studiofill env OB_STUDIOFILL_ARM=legacy tools/render/lighting-check-studiofill.sh "$ROOT" "$TAG"
    echo "[seal] arm studiofill: check-studiofill read identical studio frames for the UNGATED fill (this line must never print)"; armdead;;
  partitiondrop)
    # C2-FIX10 CLASS R arm (the fold): the partition TOTAL is asserted, not only N — on a temp root, two not-listed steps are reused, one listed step executes,
    # and one further step is PLANTED to leave step() counted in neither branch (OB_PARTITION_DROP); check-capture-partition must FAIL with exit 22
    TR=$(mktemp -d /tmp/ob-seal-partitiondrop.XXXXXX); for x in studiopre studiolegacy churn; do mkdir -p "$TR/after-land31-$x"; echo '{"sha":"fb5b8f58"}' > "$TR/after-land31-$x/manifest.json"; done
    ROOT_SAVE="$ROOT"; ROOT="$TR"; TAGSAVE="$TAG"; TAG=partitiondrop; OB_SEAL_CAPTURE_ONLY="giball"; OB_SEAL_REUSE_TAG=land31; OB_PARTITION_DROP=churn
    echo "[seal] step arm-partitiondrop $(date -u +%FT%TZ) (temp root $TR; churn planted to drop)"
    pd1=capture-studiopre; pd2=capture-studiolegacy; pd3=capture-giball; pd4=capture-churn  # names via variables: the literal-declaration census stays the capture block's
    step "$pd1" true --out "$TR/after-partitiondrop-studiopre"; step "$pd2" true --out "$TR/after-partitiondrop-studiolegacy"
    mkdir -p "$TR/after-partitiondrop-giball"; step "$pd3" true --out "$TR/after-partitiondrop-giball"
    step "$pd4" true --out "$TR/after-partitiondrop-churn"
    partition_check
    ROOT="$ROOT_SAVE"; TAG="$TAGSAVE"; echo "[seal] arm partitiondrop: the partition total did not red a dropped step (this line must never print)"; armdead;;
  stepexport)
    # C2-FIX10 CLASS R arm (land32 attempt 1): the export assertion fires ONLY when a capture step executes. On a temp root: capture-studiopre (not in the fresh
    # list, a land31 set present) must be REUSED with "export assert not applicable" even though its STEP_EXPORT names a hollow dir; then capture-giball (listed)
    # with a hollow export must FAIL at capture-giball exit 20 — the declared exit. A wrong placement fails at capture-studiopre first (WRONG-REASON).
    TR=$(mktemp -d /tmp/ob-seal-stepexport.XXXXXX); mkdir -p "$TR/after-land31-studiopre"; echo '{"sha":"fb5b8f58"}' > "$TR/after-land31-studiopre/manifest.json"
    ROOT_SAVE="$ROOT"; ROOT="$TR"; TAGSAVE="$TAG"; TAG=stepexport; OB_SEAL_CAPTURE_ONLY="giball"; OB_SEAL_REUSE_TAG=land31
    echo "[seal] step arm-stepexport $(date -u +%FT%TZ) (temp root $TR)"
    # (the step names are passed through variables so the checklist's "no literal capture step declared twice" rule sees the capture block's declarations only)
    local_s1=capture-studiopre; local_s2=capture-giball
    # the fixture is drawn from the REAL inventory (the maintainer's law after land33): e6dfa6f2 is armv1-tooling's sha, the one whose `:e` fired — an invented `deadbeef`
    # (`d` starts no modifier run) could not exercise the defect; the measured pair is printed so a regression of the brace reads as the wrong dir name
    HX=/nonexistent-hollow-export; echo "[seal] arm stepexport: fixture sha e6dfa6f2 (armv1-tooling's, from the real inventory; the braced form '${HX}:e6dfa6f2' — the checklist's item-12 sweep measures the unbraced pair)"
    STEP_EXPORT="${HX}:e6dfa6f2"; step "$local_s1" true --out "$TR/after-stepexport-studiopre"
    STEP_EXPORT="${HX}:e6dfa6f2"; step "$local_s2" true --out "$TR/after-stepexport-giball"
    ROOT="$ROOT_SAVE"; TAG="$TAGSAVE"; echo "[seal] arm stepexport: the listed step with a hollow export did NOT fail (this line must never print)"; armdead;;
  studiofillmissing)
    # C2-FIX10 class A arm (i): a COPY of the legacy set with one .hdr.f32 removed — the CALLER must print UNMEASURED and FAIL (exit 3), never PASS
    step check-studiofill env OB_STUDIOFILL_ARM=missing tools/render/lighting-check-studiofill.sh "$ROOT" "$TAG"
    echo "[seal] arm studiofillmissing: check-studiofill PASSED on a control set with a missing capture (this line must never print)"; armdead;;
  studiofillpng)
    # C2-FIX10 class A arm (ii): a COPY of studiofill with ONE PNG byte perturbed, HDR identical — the in-window branch must FAIL (exit 3)
    step check-studiofill env OB_STUDIOFILL_ARM=png tools/render/lighting-check-studiofill.sh "$ROOT" "$TAG"
    echo "[seal] arm studiofillpng: check-studiofill PASSED a PNG difference inside the window (this line must never print)"; armdead;;
  pixelrgb)
    # C2-FIX10 class A arm (iii): the 4-pixel RGB fixture through the pre-FIX10 grouping-by-4 rule must FAIL (exit 3)
    step pixel-fixture python3 tools/render/lighting-pixel-strict.py --fixture-check-arm
    echo "[seal] arm pixelrgb: the grouping-by-4 rule counted the RGB fixture correctly (this line must never print)"; armdead;;
  gridwelllook)
    # C2-FIX10 class C arm: both L1 cases requested as look=default (the pre-FIX10 query) resolve to the SAME look — check-gridwell must exit 14
    step check-gridwell env OB_GRIDWELL_ARM=look node tools/render/lighting-check-gridwell.mjs
    echo "[seal] arm gridwelllook: check-gridwell accepted two L1 cases that resolved to one look (this line must never print)"; armdead;;
  # ORDER-LIGHT-C2-FIX2 (maintainer, the plan-key law): a fixture whose armed row names a dataset key the plan does not produce must be refused by
  # the spec builder's --check-keys in seconds (exit 7) — the arm re-introduces the land17 slip (@rebakedefer for the rebake2 poke) on a copy
  speckey)
    SK="$ROOT/arm-speckey-$TAG"; case "$SK" in output/lighting/arm-speckey-*) ;; *) echo "refusing $SK"; exit 9;; esac; rm -rf -- "${SK:?}"; mkdir -p "$SK"
    python3 - "$SPEC" "$SK/spec-badkey.json" <<'PY'
import json,sys
s=json.load(open(sys.argv[1]))
for r in s['rows']:
    if r['id'] in ('C2X-rebake-overlap-bakes','C2X-rebake-overlap-pending'): r['table']='predator_apex_9ft@rebakedefer'; r['arm_table']='predator_apex_9ft@rebakedefer'
json.dump(s, open(sys.argv[2],'w'), indent=1); print('[seal] arm speckey: two rows re-keyed @rebakedefer in', sys.argv[2])
PY
    step check-spec-keys python3 tools/render/lighting-gate-spec.py --check-keys --spec "$SK/spec-badkey.json"
    echo "[seal] arm speckey: --check-keys ACCEPTED a fixture keyed by the set name (this line must never print)"; armdead;;
  nohdr)
    NH="$ROOT/arm-nohdr-$TAG"; case "$NH" in output/lighting/arm-nohdr-*) ;; *) echo "refusing $NH"; exit 9;; esac
    [ -e "$NH" ] && { chmod -R u+w "$NH"; rm -rf -- "${NH:?}"; }; cp -R "$(python3 -c "import os;print(os.path.realpath('$ROOT/after-$TAG-off'))")" "$NH"; chmod -R u+w "$NH"; rm -f -- "$NH/default/predator_apex_9ft/full34.hdr.f32"  # realpath: never copy a reuse symlink itself (refuter round 2)
    step arm-nohdr python3 tools/render/lighting-offcheck.py --off "$NH" --main "$ROOT/before" --tables predator_apex_9ft,wpa_spec_9ft --poses full34,cueball_level --looks default,sp --out "$NH/offcheck.md" --json "$NH/offcheck.json"
    echo "[seal] arm nohdr: the offcheck did NOT fail (this line must never print)"; armdead;;
  noarm)
    # ORDER-LAND-638-FIX3 (review r7 P2 #3): an arm set missing ONE requested frame must FAIL the offcheck for THAT reason (the
    # cell named). zsh: an empty glob aborts a multi-glob cp, so null_glob + one cp per pattern (review note)
    # ORDER-LIGHT-L25 (attempt 4): the judged pair was two main boots from DIFFERENT sessions (main163-2 vs before) and the
    # stricter live pairing of 8914fb90 made 2 of its 8 cells non-identical (sp/predator full34 png 1/255 on 14.0 %,
    # cueball_level hdr 3.2e-2), so the arm reported "NOT the expected failure" for a reason unrelated to the deleted frame
    # and exited 0. The pair is now a BYTE COPY of before judged against before — every judged delta is 0 by construction and
    # the deleted arm frame is the sole failure. Superseded note (FIX4 item 5): the judged pair is two MAIN boots, not the off boot —
    # an outlier off boot made this arm report "NOT the expected failure" for a reason unrelated to the deleted frame; with
    # two main boots the only failure left is the missing arm frame. Single-arm on purpose: arm2 would add a second failure path
    # and the assertion below isolates the deleted frame as the SOLE cause.
    setopt local_options null_glob
    NA="$ROOT/arm-noarm-$TAG"; case "$NA" in output/lighting/arm-noarm-*) ;; *) echo "refusing $NA"; exit 9;; esac
    [ -e "$NA" ] && { chmod -R u+w "$NA"; rm -rf -- "${NA:?}"; }; for LK in default sp; do for TB in predator_apex_9ft wpa_spec_9ft; do mkdir -p "$NA/$LK/$TB"; cp "$AFTER/$LK/$TB/"*.png "$NA/$LK/$TB/"; cp "$AFTER/$LK/$TB/"*.hdr.f32* "$NA/$LK/$TB/"; done; done
    rm -f -- "$NA/sp/wpa_spec_9ft/cueball_level.png"
    echo "[seal] step arm-noarm $(date -u +%FT%TZ)"
    NB="$ROOT/arm-noarm-main-$TAG"; case "$NB" in output/lighting/arm-noarm-main-*) ;; *) echo "refusing $NB"; exit 9;; esac
    [ -e "$NB" ] && { chmod -R u+w "$NB"; rm -rf -- "${NB:?}"; }; for LK in default sp; do for TB in predator_apex_9ft wpa_spec_9ft; do mkdir -p "$NB/$LK/$TB"; cp -R "$ROOT/before/$LK/$TB/"* "$NB/$LK/$TB/"; done; done; chmod -R u+w "$NB"
    RC=0; python3 tools/render/lighting-offcheck.py --off "$NB" --main "$ROOT/before" --arm "$NA" --tables predator_apex_9ft,wpa_spec_9ft --poses full34,cueball_level --looks default,sp --out "$NA/offcheck.md" --json "$NA/offcheck.json" || RC=$?  # (set -e: capture the exit, do not die here)
    RC2=0; python3 - "$NA/offcheck.json" "$RC" <<'PY' || RC2=$?
import json, sys
j = json.load(open(sys.argv[1])); rc = int(sys.argv[2])
missing = [k for k, v in j['arm'].items() if v.get('err') == 'missing arm frame']; cells_ok = all(c.get('pass') for c in j['cells'].values())
ok = rc == 4 and missing == ['sp/wpa_spec_9ft/cueball_level'] and cells_ok
print(f"[seal] arm noarm (a byte copy of before judged against before: every judged delta 0 by construction): rc {rc}, missing arm frame(s) {missing}, every judged cell identical {cells_ok} → {'FAILED for the right reason (the arm fires)' if ok else 'NOT the expected failure'}")
sys.exit(4 if ok else 0)
PY
    [ "$RC2" = 4 ] && { echo "[seal] FAILED at arm-noarm exit 4 $(date -u +%FT%TZ)"; armverdict arm-noarm 4; exit 4; }
    echo "[seal] arm noarm: the offcheck did NOT fail on the missing arm frame alone (this line must never print)"; armdead;;
  nolutprefix)
    # ORDER-LIGHT-FIX5 P1 arm on the PRE-FIX code: the nolut pairing built from the FIX5 base export (shading.js still importing the
    # leaf statically) must FAIL to boot — ESM linking rejects before main.js runs, so the capture never settles (non-zero exit)
    # The base tree is served FROM a detached worktree at the base commit (cdp.mjs's served-tree preflight expects its own checkout's
    # app tree) with this lane's tools/render overlaid and the leaf REMOVED there — the nolut pairing on the pre-FIX5 code. The arm
    # fires only for the RIGHT reason: the boot fails (never settled / a module error), never on a preflight line.
    PRE="${OB_FIX5_BASE:-2b415aa7}"; PX="/tmp/ob-land-638/base-tooling"; case "$PX" in /tmp/ob-land-638/base-tooling) ;; *) echo "refusing $PX"; exit 9;; esac
    echo "[seal] step arm-nolutprefix $(date -u +%FT%TZ) base=$PRE"
    if [ ! -d "$PX/.git" ] && [ ! -f "$PX/.git" ]; then git worktree add -q --detach "$PX" "$PRE" || { echo "[seal] arm nolutprefix: could not create the base worktree"; exit 0; }; fi
    [ "$(git -C "$PX" rev-parse --short=8 HEAD)" = "$PRE" ] || { echo "[seal] arm nolutprefix: $PX is not at $PRE"; exit 0; }
    assert_export "$PX" "$PRE" arm-nolutprefix
    rm -rf -- "${PX:?}/tools/render" && cp -R tools/render "$PX/tools/render" && rm -f -- "${PX:?}/web/scene/occlusionlut.js"
    CAPL="$ROOT/arm-nolutprefix-$TAG.log"; RC=0; tools/render/lighting-capture-from.sh "$PX" --out "$PWD/$ROOT/arm-nolutprefix-$TAG" --tables predator_apex_9ft --look default --poses cueball_level > "$CAPL" 2>&1 || RC=$?
    NS=$(grep -c 'never settled\|exhausted their attempts' "$CAPL" || true); PF=$(grep -c 'served-tree preflight' "$CAPL" || true)  # grep -c exits 1 on a zero count (set -e)
    echo "[seal] arm nolutprefix: base $PRE + absent leaf → capture exit $RC; never-settled/exhausted lines $NS; preflight lines $PF (must be 0)"
    if [ "$RC" != 0 ] && [ "$NS" -gt 0 ] && [ "$PF" = 0 ]; then echo "[seal] arm nolutprefix: the pre-FIX5 tree does not boot without the leaf (static import on the boot graph) — FAILED for the right reason (the arm fires)"; echo "[seal] FAILED at arm-nolutprefix exit 4 $(date -u +%FT%TZ)"; armverdict arm-nolutprefix 4; exit 4; fi
    echo "[seal] arm nolutprefix: the pre-fix tree BOOTED without the leaf (this line must never print)"; armdead;;
  hdrleak)
    # ORDER LIGHT-L24-B: the judged (converged-vs-converged) offcheck still has teeth on the class it is most likely to miss — a
    # COMMITTED near-threshold HDR-ONLY leak (tools/render/fixtures/hdr-leak: a crop of main's converged frame; leak-over = +1.05 ×
    # the cell's hdr tolerance on the room band, leak-under = +0.95 ×; the PNG is main's byte for byte). Four assertions:
    # over FAILS (exit 4, HDR named) · under PASSES · over with the JUDGEMENT weakened (--arm-weaken hdr) goes GREEN · over with the
    # PNG criterion weakened still FAILS (the HDR criterion is what catches it)
    HL=tools/render/fixtures/hdr-leak; HO="$ROOT/arm-hdrleak-$TAG"; case "$HO" in output/lighting/arm-hdrleak-*) ;; *) echo "refusing $HO"; exit 9;; esac; mkdir -p "$HO"
    echo "[seal] step arm-hdrleak $(date -u +%FT%TZ)"
    OC=(python3 tools/render/lighting-offcheck.py --main "$HL/main" --main-sub conv --tables predator_apex_9ft --poses full34 --looks default)
    R1=0; "${OC[@]}" --off "$HL/leak-over" --off-sub conv --out "$HO/over.md" --json "$HO/over.json" > "$HO/over.out" 2>&1 || R1=$?
    R2=0; "${OC[@]}" --off "$HL/leak-under" --off-sub conv --out "$HO/under.md" --json "$HO/under.json" > "$HO/under.out" 2>&1 || R2=$?
    R3=0; "${OC[@]}" --off "$HL/leak-over" --off-sub conv --arm-weaken hdr --out "$HO/over-weak-hdr.md" --json "$HO/over-weak-hdr.json" > "$HO/over-weak-hdr.out" 2>&1 || R3=$?
    R4=0; "${OC[@]}" --off "$HL/leak-over" --off-sub conv --arm-weaken png --out "$HO/over-weak-png.md" --json "$HO/over-weak-png.json" > "$HO/over-weak-png.out" 2>&1 || R4=$?
    HDRO=$(python3 -c "import json;c=json.load(open('$HO/over.json'))['cells'];k=list(c)[0];print('%s: png %s/255 on %.2f %%, hdr %.2e' % (k, c[k].get('png_max'), 100*c[k].get('png_frac',0), c[k].get('hdr_max',0)))" 2>/dev/null)
    echo "[seal] arm hdrleak: over $R1 (want 4) · under $R2 (want 0) · over+weaken-hdr $R3 (want 0) · over+weaken-png $R4 (want 4) · over cell: $HDRO"
    if [ "$R1" = 4 ] && [ "$R2" = 0 ] && [ "$R3" = 0 ] && [ "$R4" = 4 ]; then echo "[seal] arm hdrleak: the HDR-only near-threshold leak is caught by the HDR criterion and only by it — FAILED for the right reason (the arm fires)"; echo "[seal] FAILED at arm-hdrleak exit 4 $(date -u +%FT%TZ)"; armverdict arm-hdrleak 4; exit 4; fi
    echo "[seal] arm hdrleak: the four assertions did not all hold (this line must never print)"; armdead;;
  flipmissing)
    # ORDER-LAND-638-FIX4 (review r8 P2 #2): the generator must FAIL (exit 6, cell named) when an expected cell has no OFF pairs —
    # the same leak root as flipoff (its off population covers the Predator full34 cells only) asked for the FULL key set
    FM="$ROOT/arm-flipmissing-$TAG"; case "$FM" in output/lighting/arm-flipmissing-*) ;; *) echo "refusing $FM"; exit 9;; esac
    [ -e "$FM" ] && rm -rf -- "${FM:?}"; mkdir -p "$FM/root"
    for D in output/lighting/main163/main-*/; do B=$(basename "$D"); case "$B" in main-o*) ;; *) ln -s "$(cd "$D" && pwd)" "$FM/root/$B";; esac; done
    ln -s "$(cd "$ROOT/after-s7-off" && pwd)" "$FM/root/main-o-s7leak"; ln -s "$(cd output/lighting/main163/main-o1 && pwd)" "$FM/root/main-o-real1"
    echo "[seal] step arm-flipmissing $(date -u +%FT%TZ)"
    RC4=0; python3 tools/render/lighting-main-flip.py --main 163d7f25 --sets "$FM/root" --out "$FM/flip.json" --tables predator_apex_9ft,wpa_spec_9ft --poses full34,cueball_level --looks default,sp > "$FM/gen.log" 2>&1 || RC4=$?
    (grep "FAIL" "$FM/gen.log" || true) | head -2  # C2-FIX8 M7: a display grep must not abort the seal when the text is absent (set -euo pipefail)
    if [ "$RC4" = 6 ] && grep -q "no OFF pairs for cell(s): .*wpa_spec_9ft" "$FM/gen.log" && [ ! -e "$FM/flip.json" ]; then echo "[seal] arm flipmissing: exit 6, the missing off cells named, no fixture written → FAILED for the right reason (the arm fires)"; echo "[seal] FAILED at arm-flipmissing exit 6 $(date -u +%FT%TZ)"; armverdict arm-flipmissing 6; exit 6; fi
    echo "[seal] arm flipmissing: the generator did NOT fail on the missing off cells (rc $RC4; this line must never print)"; armdead;;
  flipoff)
    # ORDER-LAND-638-FIX4 verifier item 3: the arm runs FIRST in its reproducible form — a DECLARED synthetic off population built
    # from two main boots that exist in every lane run (before = the main boot the seal judges against, main163-2 = a second
    # main boot; any verifier substitutes their own two): lighting-main-flip.py --arm-synthetic perturbs a copy of B by a stated,
    # derived amount (main-o2/perturbation.json) and must read off_within_main 0 (exit 4, cells named)
    setopt local_options null_glob
    FS="$ROOT/arm-flipsyn-$TAG"; case "$FS" in output/lighting/arm-flipsyn-*) ;; *) echo "refusing $FS"; exit 9;; esac
    [ -e "$FS" ] && rm -rf -- "${FS:?}"; mkdir -p "$FS"
    echo "[seal] step arm-flipoff-synthetic $(date -u +%FT%TZ)"
    RCS=0; python3 tools/render/lighting-main-flip.py --main "${OB_MAIN_SHA:-163d7f25}" --arm-synthetic "$ROOT/before" "$ROOT/main163-2" "$FS/root" --out "$FS/flip.json" --tables predator_apex_9ft,wpa_spec_9ft --poses full34,cueball_level --looks default,sp > "$FS/gen.log" 2>&1 || RCS=$?
    (grep -E "ARM synthetic|OUTSIDE|FAIL" "$FS/gen.log" || true) | tail -4  # C2-FIX8 M7: display only, never a verdict
    [ "$RCS" = 4 ] || { echo "[seal] arm flipoff (synthetic): the generator did NOT read the perturbed off population as outside main's envelope (rc $RCS, see $FS/gen.log; this line must never print)"; armdead; }
    echo "[seal] arm flipoff (synthetic): exit 4, off_within_main 0, cells named → FAILED for the right reason (the arm fires)"
    # ORDER-LAND-638-FIX3 (review P3): the REAL arm — the generator on a root whose OFF population is a known off leak (the seal-7
    # off frames, predator 9–10/255 on 27 %) must write off_within_main 0. It needs the lane's untracked main163 boots and
    # after-s7-off: run only when they exist, else skip with a note (the synthetic arm above already fired)
    REALMAIN=(output/lighting/main163/main-*/)
    if [ "${#REALMAIN[@]}" -eq 0 ] || [ ! -d output/lighting/main163/main-o1 ] || [ ! -d "$ROOT/after-s7-off" ]; then
      echo "[seal] arm flipoff (real main163 / seal-7 leak): SKIPPED — output/lighting/main163/main-*, main163/main-o1 or $ROOT/after-s7-off absent (lane-local boots, not in the repository); the synthetic arm is the reproducible one"
      echo "[seal] FAILED at arm-flipoff exit 4 $(date -u +%FT%TZ)"; armverdict arm-flipoff 4; exit 4
    fi
    FO="$ROOT/arm-flipoff-$TAG"; case "$FO" in output/lighting/arm-flipoff-*) ;; *) echo "refusing $FO"; exit 9;; esac
    [ -e "$FO" ] && rm -rf -- "${FO:?}"; mkdir -p "$FO/root"
    for D in output/lighting/main163/main-*/; do B=$(basename "$D"); case "$B" in main-o*) ;; *) ln -s "$(cd "$D" && pwd)" "$FO/root/$B";; esac; done
    ln -s "$(cd "$ROOT/after-s7-off" && pwd)" "$FO/root/main-o-s7leak"
    ln -s "$(cd output/lighting/main163/main-o1 && pwd)" "$FO/root/main-o-real1"  # an off population needs a PAIR: the leak against one real off boot
    echo "[seal] step arm-flipoff $(date -u +%FT%TZ)"
    # C2-FIX7 audit (pipeline-exit class): the tool's own exit is captured, its log tailed afterwards — a pipe into tail took tail's status (or, under pipefail, aborted the seal without a witness)
    RCF=0; python3 tools/render/lighting-main-flip.py --main 163d7f25 --sets "$FO/root" --out "$FO/flip.json" --tables predator_apex_9ft --poses full34 --looks default,sp > "$FO/flip.log" 2>&1 || RCF=$?; tail -3 "$FO/flip.log"; [ "$RCF" = 0 ] || { echo "[seal] FAILED at arm-flipoff-flip exit $RCF (lighting-main-flip.py did not complete)"; armverdict arm-flipoff-flip "$RCF"; exit $RCF; }
    RC3=0; python3 - "$FO/flip.json" <<'PY' || RC3=$?
import json, sys
f = json.load(open(sys.argv[1])); v = f.get('off_within_main'); oc = f.get('off_cells') or {}
print(f"[seal] arm flipoff: off_within_main {v}; off cells {[(k, c['max'], round(c['frac'] * 100, 1)) for k, c in oc.items()]}")
sys.exit(4 if v == 0 and oc else 0)
PY
    [ "$RC3" = 4 ] && { echo "[seal] FAILED at arm-flipoff exit 4 $(date -u +%FT%TZ)"; armverdict arm-flipoff 4; exit 4; }
    echo "[seal] arm flipoff: the generator did NOT read the off leak as outside main's envelope (this line must never print)"; armdead;;
  stale)
    ST="$ROOT/arm-stale-$TAG"; case "$ST" in output/lighting/arm-stale-*) ;; *) echo "refusing $ST"; exit 9;; esac
    [ -e "$ST" ] && { chmod -R u+w "$ST"; rm -rf -- "${ST:?}"; }; mkdir -p "$ST/default"; cp -R "$(python3 -c "import os;print(os.path.realpath('$ROOT/after-$TAG-off/default/predator_apex_9ft'))")" "$ST/default/predator_apex_9ft"; chmod -R u+w "$ST"; cp "$ROOT/after-$TAG-off/manifest.json" "$ST/manifest.json" && chmod -R u+w "$ST"
    printf 'STALE' > "$ST/default/predator_apex_9ft/stale-seed.png"   # a file no capture writes: must be gone after the resume
    node tools/render/lighting-capture.mjs --out "$ST" --tables predator_apex_9ft --look default --poses full34 --flags venue=off > "$ST/resume.log" 2>&1 || true
    step arm-stale python3 tools/render/lighting-check-runs.py "$ST"
    echo "[seal] arm stale: check-runs did NOT refuse the resumed dir (this line must never print)"; armdead;;
  pokestuck)
    # ORDER-LIGHT-FIX6 (review r10 P2, lighting-capture.mjs:227-230): a NON-RAW poke that never settles must FAIL the capture — exit 2,
    # the run recorded `failed` by name, NO screenshot — on the fixed tool; and the PRE-FIX6 tool (a detached worktree at the round's
    # base, serving ITS OWN web/: its cdp.mjs preflight expects its own checkout, and its lighting-capture.mjs imports
    # ../../web/tools/cdp.mjs) must write a SUCCESSFUL run for the same poke with only a warning (the finding). Both halves are
    # asserted, each on its base run having settled (so a boot failure cannot stand in for the poke's). The poke patches
    # __lighting.state() so the settle predicate reads venue.pending = true forever. (refuter round 2: this block runs BEFORE the
    # PRED assignment — the table is a literal; every status is read through `||` under set -e.)
    STUCK_JS='stuck=(() => { const L = window.__lighting; const s0 = L.state.bind(L); L.state = () => { const s = s0(); s.venue = Object.assign({}, s.venue || {}, { pending: true }); return s; }; })()'
    echo "[seal] step arm-pokestuck $(date -u +%FT%TZ)"
    OUTD="$ROOT/arm-pokestuck-$TAG"; case "$OUTD" in output/lighting/arm-pokestuck-*) [ -e "$OUTD" ] && rm -rf -- "${OUTD:?}";; *) echo "refusing $OUTD"; exit 9;; esac
    RC=0; node tools/render/lighting-capture.mjs --out "$OUTD" --tables predator_apex_9ft --look default --poses cueball_level --poke "$STUCK_JS" > "$ROOT/arm-pokestuck-$TAG.log" 2>&1 || RC=$?
    NS=$(grep -c 'poke stuck: never settled' "$ROOT/arm-pokestuck-$TAG.log" || true); PNG=$( (find "$OUTD/default/predator_apex_9ft/stuck" -maxdepth 1 -name '*.png' 2>/dev/null || true) | wc -l | tr -d ' ')  # find, not a glob: zsh NOMATCH aborts on an empty glob even under 2>/dev/null
    FAILED=$(python3 -c "import json;m=json.load(open('$OUTD/manifest.json'));print(sum(1 for x in m['runs'] if x.get('poke')=='stuck' and str(x.get('failed','')).startswith('poke stuck: never settled')))" 2>/dev/null || echo 0)
    BASEOK=$(python3 -c "import json;m=json.load(open('$OUTD/manifest.json'));print(sum(1 for x in m['runs'] if not x.get('poke') and not x.get('failed')))" 2>/dev/null || echo 0)
    PRE="${OB_FIX6_BASE:-7ca3ba3c}"; PX="/tmp/ob-land-638/prefix6-$PRE"
    if [ ! -f "$PX/tools/render/lighting-capture.mjs" ]; then git worktree add -q --detach "$PX" "$PRE" 2>/dev/null || { echo "[seal] arm pokestuck: could not create the pre-fix worktree $PX (this line must never print)"; armdead; }; fi
    [ "$(git -C "$PX" rev-parse --short=8 HEAD 2>/dev/null)" = "$PRE" ] || { echo "[seal] arm pokestuck: $PX is not at $PRE (this line must never print)"; armdead; }
    OUTP="$PWD/$ROOT/arm-pokestuck-prefix-$TAG"; case "$OUTP" in */output/lighting/arm-pokestuck-prefix-*) [ -e "$OUTP" ] && rm -rf -- "${OUTP:?}";; *) echo "refusing $OUTP"; exit 9;; esac
    RCP=0; ( cd "$PX" && env -u OB_LIGHTING_WEB -u OB_LIGHTING_WEB_ARM -u OB_LIGHTING_PORT -u OB_LIGHTING_CDP -u OB_LIGHTING_BAND_START -u OB_LIGHTING_BAND_END node tools/render/lighting-capture.mjs --out "$OUTP" --tables predator_apex_9ft --look default --poses cueball_level --poke "$STUCK_JS" ) > "$ROOT/arm-pokestuck-prefix-$TAG.log" 2>&1 || RCP=$?
    OKP=$(python3 -c "import json;m=json.load(open('$OUTP/manifest.json'));print(sum(1 for x in m['runs'] if x.get('poke')=='stuck' and not x.get('failed') and x.get('pokeStable') and x['pokeStable'].get('stable') is False))" 2>/dev/null || echo 0)
    BASEOKP=$(python3 -c "import json;m=json.load(open('$OUTP/manifest.json'));print(sum(1 for x in m['runs'] if not x.get('poke') and not x.get('failed')))" 2>/dev/null || echo 0)
    PNGP=$( (find "$OUTP/default/predator_apex_9ft/stuck" -maxdepth 1 -name '*.png' 2>/dev/null || true) | wc -l | tr -d ' ')
    echo "[seal] arm pokestuck: fixed tool exit $RC (base run settled $BASEOK, stuck run failed-by-name $FAILED, stuck PNGs $PNG, 'poke stuck: never settled' lines $NS); pre-fix tool $PRE @ $PX exit $RCP (base run settled $BASEOKP, successful-but-unstable stuck run $OKP, stuck PNGs $PNGP)"
    if [ "$RC" = 2 ] && [ "$BASEOK" = 1 ] && [ "$FAILED" = 1 ] && [ "$PNG" = 0 ] && [ "$NS" -ge 2 ] && [ "$RCP" = 0 ] && [ "$BASEOKP" = 1 ] && [ "$OKP" = 1 ] && [ "$PNGP" -ge 1 ]; then
      echo "[seal] arm pokestuck: the never-settling poke FAILS the fixed capture (no screenshot, the run failed by name, the boot itself had settled) and PASSED the pre-FIX6 tool with a warning → FAILED for the right reason (the arm fires)"
      echo "[seal] FAILED at arm-pokestuck exit 2 $(date -u +%FT%TZ)"; armverdict arm-pokestuck 2; exit 2; fi
    echo "[seal] arm pokestuck: the assertion did not hold (this line must never print)"; armdead;;
  gistallforever)
    # ORDER-LIGHT-FIX7 (review r11 P2 #2) arm: under the PRE-FIX7 rule (`venueGiHold=forever`) a stalled GI manifest holds the venue term
    # forever — venue.pending never clears, __test.ready never turns true (the loading overlay), the capture tool's settle predicate never
    # settles: the capture must FAIL by never settling (exit 2, the run failed 'never settled' with ready=false in its last settle state,
    # 0 preflight refusals). The fixed rule is the `gistall` set (settled within window + hold). Literal table: this block runs before PRED.
    echo "[seal] step arm-gistallforever $(date -u +%FT%TZ)"
    OUTD="$ROOT/arm-gistallforever-$TAG"; case "$OUTD" in output/lighting/arm-gistallforever-*) [ -e "$OUTD" ] && rm -rf -- "${OUTD:?}";; *) echo "refusing $OUTD"; exit 9;; esac
    RC=0; node tools/render/lighting-capture.mjs --out "$OUTD" --tables predator_apex_9ft --look default --poses cueball_level --flags "giStall=manifest&venueGiHold=forever" > "$ROOT/arm-gistallforever-$TAG.log" 2>&1 || RC=$?
    NS=$(grep -c 'never settled' "$ROOT/arm-gistallforever-$TAG.log" || true); PF=$(grep -c 'preflight' "$ROOT/arm-gistallforever-$TAG.log" || true)
    NOTREADY=$( (grep -o 'never settled: {[^}]*"ready":false' "$ROOT/arm-gistallforever-$TAG.log" || true) | wc -l | tr -d ' ')  # C2-FIX7 audit: grep exit 1 on a zero count must not abort the seal under pipefail
    FAILED=$(python3 -c "import json;m=json.load(open('$OUTD/manifest.json'));print(sum(1 for x in m['runs'] if not x.get('poke') and str(x.get('failed','')).startswith('predator_apex_9ft/default: never settled')))" 2>/dev/null || echo 0)
    echo "[seal] arm gistallforever: capture exit $RC, never-settled attempts $NS (ready=false in $NOTREADY of them), failed run $FAILED, preflight lines $PF"
    if [ "$RC" = 2 ] && [ "$NS" -ge 2 ] && [ "$NOTREADY" -ge 2 ] && [ "$FAILED" = 1 ] && [ "$PF" = 0 ]; then
      echo "[seal] arm gistallforever: under the pre-FIX7 rule the stalled GI request holds readiness forever — the boot never settles → FAILED for the right reason (the arm fires)"
      echo "[seal] FAILED at arm-gistallforever exit 2 $(date -u +%FT%TZ)"; armverdict arm-gistallforever 2; exit 2; fi
    echo "[seal] arm gistallforever: the assertion did not hold (this line must never print)"; armdead;;
  leafstallforever)
    # ORDER-LIGHT-COMPANION (review r12 P1) arm: under the PRE-companion rule (`leafBound=off`) a stalled optional-leaf import blocks boot()
    # before __test is published — the settle predicate never sees ready, the capture fails 'never settled' (exit 2); the fixed rule is the
    # `leafstall` set (ready within the budget on the legacy path). Literal table: this block runs before PRED.
    echo "[seal] step arm-leafstallforever $(date -u +%FT%TZ)"
    OUTD="$ROOT/arm-leafstallforever-$TAG"; case "$OUTD" in output/lighting/arm-leafstallforever-*) [ -e "$OUTD" ] && rm -rf -- "${OUTD:?}";; *) echo "refusing $OUTD"; exit 9;; esac
    RC=0; node tools/render/lighting-capture.mjs --out "$OUTD" --tables predator_apex_9ft --look default --poses cueball_level --flags "leafStall=venueflag&leafBound=off" > "$ROOT/arm-leafstallforever-$TAG.log" 2>&1 || RC=$?
    NS=$(grep -c 'never settled' "$ROOT/arm-leafstallforever-$TAG.log" || true); PF=$(grep -c 'preflight' "$ROOT/arm-leafstallforever-$TAG.log" || true)
    NOTEST=$(grep -c 'never settled: {"settled":false,"ready":false,"handshake":false' "$ROOT/arm-leafstallforever-$TAG.log" || true) # refuter round: the boot never REACHED the handshake (blocked before it = the unbounded await), not merely slow
    FAILED=$(python3 -c "import json;m=json.load(open('$OUTD/manifest.json'));print(sum(1 for x in m['runs'] if not x.get('poke') and str(x.get('failed','')).startswith('predator_apex_9ft/default: never settled')))" 2>/dev/null || echo 0)
    echo "[seal] arm leafstallforever: capture exit $RC, never-settled attempts $NS (ready=false AND the handshake never reached in $NOTEST of them), failed run $FAILED, preflight lines $PF"
    if [ "$RC" = 2 ] && [ "$NS" -ge 2 ] && [ "$NOTEST" -ge 2 ] && [ "$FAILED" = 1 ] && [ "$PF" = 0 ]; then
      echo "[seal] arm leafstallforever: under the pre-companion rule the stalled import blocks boot before readiness — the boot never settles → FAILED for the right reason (the arm fires)"
      echo "[seal] FAILED at arm-leafstallforever exit 2 $(date -u +%FT%TZ)"; armverdict arm-leafstallforever 2; exit 2; fi
    echo "[seal] arm leafstallforever: the assertion did not hold (this line must never print)"; armdead;;
  tablefallback)
    # ORDER-LIGHT-COMPANION (review r12 P2, lighting-capture.mjs:242) arm: a table id the app does not know → the fixed tool REFUSES the fallback
    # (exit 2, the run failed by name, NO frame under the requested key); the pre-companion tool (the 2eab3fad worktree, its own web) writes the
    # default table's frames under the requested key and exits 0 — the finding.
    echo "[seal] step arm-tablefallback $(date -u +%FT%TZ)"
    OUTD="$ROOT/arm-tablefallback-$TAG"; case "$OUTD" in output/lighting/arm-tablefallback-*) [ -e "$OUTD" ] && rm -rf -- "${OUTD:?}";; *) echo "refusing $OUTD"; exit 9;; esac
    RC=0; node tools/render/lighting-capture.mjs --out "$OUTD" --tables no_such_table --look default --poses cueball_level > "$ROOT/arm-tablefallback-$TAG.log" 2>&1 || RC=$?
    PNG=$( (find "$OUTD/default/no_such_table" -maxdepth 1 -name '*.png' 2>/dev/null || true) | wc -l | tr -d ' ')
    FAILED=$(python3 -c "import json;m=json.load(open('$OUTD/manifest.json'));print(sum(1 for x in m['runs'] if str(x.get('failed','')).startswith('table fallback refused')))" 2>/dev/null || echo 0)
    PX="${OB_PREFIX8_TOOLING:-/tmp/ob-land-638/prefix8-2eab3fad}"; assert_export "$PX" 2eab3fad arm-tablefallback; [ -f "$PX/tools/render/lighting-capture.mjs" ] || { echo "[seal] arm tablefallback: pre-companion worktree $PX missing (this line must never print)"; armdead; }
    OUTP="$PWD/$ROOT/arm-tablefallback-prefix-$TAG"; case "$OUTP" in */output/lighting/arm-tablefallback-prefix-*) [ -e "$OUTP" ] && rm -rf -- "${OUTP:?}";; *) echo "refusing $OUTP"; exit 9;; esac
    RCP=0; ( cd "$PX" && env -u OB_LIGHTING_WEB -u OB_LIGHTING_WEB_ARM -u OB_LIGHTING_PORT -u OB_LIGHTING_CDP -u OB_LIGHTING_BAND_START -u OB_LIGHTING_BAND_END node tools/render/lighting-capture.mjs --out "$OUTP" --tables no_such_table --look default --poses cueball_level ) > "$ROOT/arm-tablefallback-prefix-$TAG.log" 2>&1 || RCP=$?
    PNGP=$( (find "$OUTP/default/no_such_table" -maxdepth 1 -name '*.png' 2>/dev/null || true) | wc -l | tr -d ' ')
    WARNP=$(python3 -c "import json;m=json.load(open('$OUTP/manifest.json'));print(sum(1 for x in m['runs'] if not x.get('failed') and any('!= requested' in str(w) for w in (x.get('warnings') or []))))" 2>/dev/null || echo 0)
    echo "[seal] arm tablefallback: fixed tool exit $RC (failed-by-name run $FAILED, frames under no_such_table $PNG); pre-companion tool @ $PX exit $RCP (successful run with the fallback warning $WARNP, frames under no_such_table $PNGP)"
    if [ "$RC" = 2 ] && [ "$FAILED" = 1 ] && [ "$PNG" = 0 ] && [ "$RCP" = 0 ] && [ "$WARNP" = 1 ] && [ "$PNGP" -ge 1 ]; then
      echo "[seal] arm tablefallback: the fixed tool refuses the fallback (no frame under the requested key) and the pre-companion tool filed the wrong table's frames under it → FAILED for the right reason (the arm fires)"
      echo "[seal] FAILED at arm-tablefallback exit 2 $(date -u +%FT%TZ)"; armverdict arm-tablefallback 2; exit 2; fi
    echo "[seal] arm tablefallback: the assertion did not hold (this line must never print)"; armdead;;
  posemissing)
    # ORDER-LIGHT-COMPANION (review r12 P2, lighting-capture.mjs:267) arm: a requested pose the app does not offer (the same completeness rule
    # fails a pose __test.cameraPose rejects) → the fixed tool fails the run by name (exit 2, 0 poses recorded as failed); the pre-companion
    # tool records a 'successful' EMPTY run (exit 0, 0 poses) — the finding.
    echo "[seal] step arm-posemissing $(date -u +%FT%TZ)"
    OUTD="$ROOT/arm-posemissing-$TAG"; case "$OUTD" in output/lighting/arm-posemissing-*) [ -e "$OUTD" ] && rm -rf -- "${OUTD:?}";; *) echo "refusing $OUTD"; exit 9;; esac
    RC=0; node tools/render/lighting-capture.mjs --out "$OUTD" --tables predator_apex_9ft --look default --poses no_such_pose > "$ROOT/arm-posemissing-$TAG.log" 2>&1 || RC=$?
    FAILED=$(python3 -c "import json;m=json.load(open('$OUTD/manifest.json'));print(sum(1 for x in m['runs'] if str(x.get('failed','')).startswith('requested pose(s) not offered')))" 2>/dev/null || echo 0)
    PX="${OB_PREFIX8_TOOLING:-/tmp/ob-land-638/prefix8-2eab3fad}"; assert_export "$PX" 2eab3fad arm-posemissing; [ -f "$PX/tools/render/lighting-capture.mjs" ] || { echo "[seal] arm posemissing: pre-companion worktree $PX missing (this line must never print)"; armdead; }
    OUTP="$PWD/$ROOT/arm-posemissing-prefix-$TAG"; case "$OUTP" in */output/lighting/arm-posemissing-prefix-*) [ -e "$OUTP" ] && rm -rf -- "${OUTP:?}";; *) echo "refusing $OUTP"; exit 9;; esac
    RCP=0; ( cd "$PX" && env -u OB_LIGHTING_WEB -u OB_LIGHTING_WEB_ARM -u OB_LIGHTING_PORT -u OB_LIGHTING_CDP -u OB_LIGHTING_BAND_START -u OB_LIGHTING_BAND_END node tools/render/lighting-capture.mjs --out "$OUTP" --tables predator_apex_9ft --look default --poses no_such_pose ) > "$ROOT/arm-posemissing-prefix-$TAG.log" 2>&1 || RCP=$?
    EMPTYP=$(python3 -c "import json;m=json.load(open('$OUTP/manifest.json'));print(sum(1 for x in m['runs'] if not x.get('failed') and len(x.get('poses') or [])==0))" 2>/dev/null || echo 0)
    echo "[seal] arm posemissing: fixed tool exit $RC (failed-by-name run $FAILED); pre-companion tool exit $RCP (successful EMPTY run $EMPTYP)"
    if [ "$RC" = 2 ] && [ "$FAILED" = 1 ] && [ "$RCP" = 0 ] && [ "$EMPTYP" = 1 ]; then
      echo "[seal] arm posemissing: the fixed tool fails a run whose requested pose was not captured; the pre-companion tool recorded an empty run as success → FAILED for the right reason (the arm fires)"
      echo "[seal] FAILED at arm-posemissing exit 2 $(date -u +%FT%TZ)"; armverdict arm-posemissing 2; exit 2; fi
    echo "[seal] arm posemissing: the assertion did not hold (this line must never print)"; armdead;;
  fliphdr)
    # ORDER-LIGHT-COMPANION (review r12 P2, lighting-main-flip.py:31-33) arm: two main boots with ONE HDR file missing on a cell → the fixed
    # generator FAILS by name (exit 7, no fixture written); the pre-companion generator omits hdr_max, passes completeness and writes a fixture
    # with the fallback HDR floor for that cell — the finding.
    FH="$ROOT/arm-fliphdr-$TAG"; case "$FH" in output/lighting/arm-fliphdr-*) ;; *) echo "refusing $FH"; exit 9;; esac
    [ -e "$FH" ] && rm -rf -- "${FH:?}"; mkdir -p "$FH/root"
    for B in main-1 main-2; do for LK in default sp; do for TB in predator_apex_9ft wpa_spec_9ft; do mkdir -p "$FH/root/$B/$LK/$TB"; for PO in full34 cueball_level; do for EXT in .png .hdr.f32 .hdr.f32.json; do cp "output/lighting/main163/$B/$LK/$TB/$PO$EXT" "$FH/root/$B/$LK/$TB/"; done; done; done; done; done
    rm -f -- "$FH/root/main-2/default/predator_apex_9ft/full34.hdr.f32"
    for D in output/lighting/main163/main-o[0-9]*/; do B=$(basename "$D"); ln -s "$(cd "$D" && pwd)" "$FH/root/$B"; done  # the off population (the generator needs OFF pairs per cell)
    echo "[seal] step arm-fliphdr $(date -u +%FT%TZ)"
    RC=0; python3 tools/render/lighting-main-flip.py --main 163d7f25 --sets "$FH/root" --out "$FH/flip.json" --tables predator_apex_9ft,wpa_spec_9ft --poses full34,cueball_level --looks default,sp > "$FH/gen.log" 2>&1 || RC=$?
    PX="${OB_PREFIX8_TOOLING:-/tmp/ob-land-638/prefix8-2eab3fad}"; assert_export "$PX" 2eab3fad arm-fliphdr
    RCP=0; python3 "$PX/tools/render/lighting-main-flip.py" --main 163d7f25 --sets "$FH/root" --out "$FH/flip-prefix.json" --tables predator_apex_9ft,wpa_spec_9ft --poses full34,cueball_level --looks default,sp > "$FH/gen-prefix.log" 2>&1 || RCP=$?
    NAMED=$(grep -c 'HDR input missing for the pair .*main-2/default/predator_apex_9ft/full34' "$FH/gen.log" || true)
    echo "[seal] arm fliphdr: fixed generator exit $RC (missing HDR named $NAMED, fixture written $([ -e "$FH/flip.json" ] && echo yes || echo no)); pre-companion generator exit $RCP (fixture written $([ -e "$FH/flip-prefix.json" ] && echo yes || echo no))"
    if [ "$RC" = 7 ] && [ "$NAMED" -ge 1 ] && [ ! -e "$FH/flip.json" ] && [ "$RCP" = 0 ] && [ -e "$FH/flip-prefix.json" ]; then
      echo "[seal] arm fliphdr: the fixed generator refuses the pair with a missing HDR input by name; the pre-companion one wrote a fixture over it → FAILED for the right reason (the arm fires)"
      echo "[seal] FAILED at arm-fliphdr exit 7 $(date -u +%FT%TZ)"; armverdict arm-fliphdr 7; exit 7; fi
    echo "[seal] arm fliphdr: the assertion did not hold (this line must never print)"; armdead;;
  nullrunid)
    # ORDER-LIGHT-COMPANION (review r12 P2, lighting-check-runs.py:18-19) arm: a manifest whose run id is null (and whose runs carry null ids)
    # must be REFUSED (exit 5); the pre-companion check read it clean (exit 0) — the finding.
    NR="$ROOT/arm-nullrunid-$TAG"; case "$NR" in output/lighting/arm-nullrunid-*) ;; *) echo "refusing $NR"; exit 9;; esac
    [ -e "$NR" ] && rm -rf -- "${NR:?}"; mkdir -p "$NR/set"
    python3 -c "
import json,os
m=json.load(open(os.path.realpath('$ROOT/before/manifest.json'))); m['runId']=None; m['resumed']=False; m['priorRunIds']=[]; m['exhausted']=0
for r in m['runs']: r['runId']=None; r.pop('failed', None)
json.dump(m, open('$NR/set/manifest.json','w'), indent=1)"
    echo "[seal] step arm-nullrunid $(date -u +%FT%TZ)"
    RC=0; python3 tools/render/lighting-check-runs.py "$NR/set" > "$NR/check.log" 2>&1 || RC=$?
    PX="${OB_PREFIX8_TOOLING:-/tmp/ob-land-638/prefix8-2eab3fad}"; assert_export "$PX" 2eab3fad arm-nullrunid
    RCP=0; python3 "$PX/tools/render/lighting-check-runs.py" "$NR/set" > "$NR/check-prefix.log" 2>&1 || RCP=$?
    NAMED=$(grep -c 'manifest carries no run id' "$NR/check.log" || true)
    echo "[seal] arm nullrunid: fixed check-runs exit $RC (null id named $NAMED); pre-companion check-runs exit $RCP ($(tail -1 "$NR/check-prefix.log" | cut -c1-60))"
    if [ "$RC" = 5 ] && [ "$NAMED" -ge 1 ] && [ "$RCP" = 0 ]; then
      echo "[seal] arm nullrunid: the fixed check refuses a null manifest id (and null run ids) by name; the pre-companion check read the set clean → FAILED for the right reason (the arm fires)"
      echo "[seal] FAILED at arm-nullrunid exit 5 $(date -u +%FT%TZ)"; armverdict arm-nullrunid 5; exit 5; fi
    echo "[seal] arm nullrunid: the assertion did not hold (this line must never print)"; armdead;;
  degradeholdforever)
    # ORDER-LIGHT-C1 (b) arm: under the PRE-C1 degrade rule (`venueDegradeCancel=off`: the degrade leaves its queued re-bake armed) with the debounce
    # HELD, readiness now reads NOT settled forever (the queued mutation is pending) — the capture must fail 'never settled' with "queued":true in
    # every settle state (exit 2). The fixed rule is the `degradehold` set (the degrade drops the queue → settled). Literal table: this block runs before PRED.
    echo "[seal] step arm-degradeholdforever $(date -u +%FT%TZ)"
    OUTD="$ROOT/arm-degradeholdforever-$TAG"; case "$OUTD" in output/lighting/arm-degradeholdforever-*) [ -e "$OUTD" ] && rm -rf -- "${OUTD:?}";; *) echo "refusing $OUTD"; exit 9;; esac
    RC=0; node tools/render/lighting-capture.mjs --out "$OUTD" --tables predator_apex_9ft --look default --poses cueball_level --flags "venueThrow=render&venueDebounce=hold&venueDegradeCancel=off" > "$ROOT/arm-degradeholdforever-$TAG.log" 2>&1 || RC=$?
    NS=$(grep -c 'never settled' "$ROOT/arm-degradeholdforever-$TAG.log" || true); QD=$(grep -c 'never settled: {[^}]*"queued":true' "$ROOT/arm-degradeholdforever-$TAG.log" || true); PF=$(grep -c 'preflight' "$ROOT/arm-degradeholdforever-$TAG.log" || true)
    FAILED=$(python3 -c "import json;m=json.load(open('$OUTD/manifest.json'));print(sum(1 for x in m['runs'] if not x.get('poke') and str(x.get('failed','')).startswith('predator_apex_9ft/default: never settled')))" 2>/dev/null || echo 0)
    echo "[seal] arm degradeholdforever: capture exit $RC, never-settled attempts $NS (queued:true in $QD of them), failed run $FAILED, preflight lines $PF"
    if [ "$RC" = 2 ] && [ "$NS" -ge 2 ] && [ "$QD" -ge 2 ] && [ "$FAILED" = 1 ] && [ "$PF" = 0 ]; then
      echo "[seal] arm degradeholdforever: under the pre-C1 degrade rule the queued re-bake outlives the degrade and readiness never settles → FAILED for the right reason (the arm fires)"
      echo "[seal] FAILED at arm-degradeholdforever exit 2 $(date -u +%FT%TZ)"; armverdict arm-degradeholdforever 2; exit 2; fi
    echo "[seal] arm degradeholdforever: the assertion did not hold (this line must never print)"; armdead;;
  noredarm)
    # ORDER-LIGHT-C2 (b) (review r2 P2, lighting-gate.py:159-162) arm: a minimal spec — ONE committed armed row that arms from the DEFAULT
    # control source (no arm_from) — run through --check-arms WITHOUT --red-arm-reads must read NO-READ (gate exit 3). The pre-C2 gate
    # exited 0 with nothing read (arm_ok stayed true when the default source was absent; 14 committed rows arm that way).
    echo "[seal] step arm-noredarm $(date -u +%FT%TZ)"
    MS="$ROOT/arm-noredarm-$TAG-spec.json"
    python3 -c "import json,sys; s=json.load(open(sys.argv[1])); row=[r for r in s['rows'] if r.get('arm') and not r.get('arm_from')][0]; json.dump({**{k: v for k, v in s.items() if k != 'rows'}, 'rows': [row]}, open(sys.argv[2], 'w')); print('[seal] arm noredarm: minimal spec = row', row['id'], '(default control source, --red-arm-reads withheld)')" "$SPEC" "$MS"
    step arm-noredarm python3 tools/render/lighting-gate.py --spec "$MS" --reads "$ROOT/reads-render/after-$TAG" --check-arms
    echo "[seal] arm noredarm: the gate accepted an armed row with no resolved control dataset (this line must never print)"; armdead;;
  fencenullroom|fencedead)
    # ORDER-LIGHT-C2-FIX1 class B (review r3 P2, lighting-fence.py:450-451) arm: the seal's OWN fence form (no --room-strict) on a NEW root where one
    # VISIBLE room mesh's material.progHash is nulled must exit 3 and name the mesh; the pre-FIX1 fence (df17fb67) on the same root exits 0 — logged.
    FN="$ROOT/arm-fencenullroom-$TAG"; [ "${OB_SEAL_ARM:-}" = fencedead ] && FN="$ROOT/arm-fencedead-$TAG"  # C2-FIX7 M2: fencedead never touches another arm's directory (it destroyed re-run 3's reports on land22)
    case "$FN" in output/lighting/arm-fencenullroom-*|output/lighting/arm-fencedead-*) ;; *) echo "refusing $FN"; exit 9;; esac
    [ -e "$FN" ] && rm -rf -- "${FN:?}"; mkdir -p "$FN/root/default" "$FN/root/sp"
    for LK in default sp; do for TB in "$AFTER"/$LK/*/; do TB=$(basename "$TB"); ln -s "$(cd "$AFTER/$LK/$TB" && pwd -P)" "$FN/root/$LK/$TB"; done; done
    rm -f "$FN/root/default/predator_apex_9ft"; mkdir -p "$FN/root/default/predator_apex_9ft"; cp "$AFTER/default/predator_apex_9ft/census.json" "$FN/root/default/predator_apex_9ft/"
    python3 tools/render/lighting-fence-nullroom.py "$AFTER/default/predator_apex_9ft/identity.json" "$FN/root/default/predator_apex_9ft/identity.json"
    git show df17fb67:tools/render/lighting-fence.py > "$FN/fence-prefix.py"
    # ORDER-LIGHT-C2-FIX6 (land22 arm phase, class-J finding): the pre-FIX1 fence is NOT comparable across dump-format versions — the dumps now carry
    # hashBytes / elem / bytes on data textures (present on chinese8 / joy only), and df17fb67's record comparison read them as changed table meshes
    # (base = main's `before`, exit 3 on both tables) BEFORE the plant could be judged. The negative control is therefore the SAME-TREE pair: base =
    # the tree's own sealed set, new = the planted root — the plant is the only difference and the old fence reading PASS on it is the blindness
    # finding; a NULL check first (old fence AFTER vs AFTER, no plant) must read PASS with ZERO difference records, or the pair proves nothing.
    OLDFENCE=(python3 "$FN/fence-prefix.py"); [ "${OB_SEAL_ARM:-}" = fencedead ] && OLDFENCE=(false)  # fencedead: the instrument dies (no report) — the NULL check must FAIL CLOSED (exit 12)
    RCN=0; "${OLDFENCE[@]}" --base "$AFTER" --new "$AFTER" --tables wpa_generic_9ft,wpa_spec_9ft,diamond_redlabel_9ft,diamond_proam_9ft,predator_apex_9ft,wpbsa_snooker_12ft,umb_carom_284,chinese8_pro_9ft,joy_q8_9ft,pool_pro_9ft_measured --looks default,sp --red-arm --room-report --program-report --out "$FN/fence-null.md" > "$FN/fence-null.log" 2>&1 || RCN=$?
    # FAIL-CLOSED read (lighting-fence-nullcheck.sh): report present + the old fence's own verdict line + grep 0/1 only; a dead instrument = exit 12 → `[seal] FAILED at`
    NC=$(tools/render/lighting-fence-nullcheck.sh --expect-null "$FN/fence-null.md" "$RCN") || { rc=$?; echo "[seal] arm fencenullroom: NULL check FAILED CLOSED — $NC"; echo "[seal] FAILED at arm-fencenullroom-null exit $rc $(date -u +%FT%TZ)"; armverdict "arm-fencenullroom-null" "$rc"; exit $rc; }
    echo "[seal] arm fencenullroom: NULL check — the pre-FIX1 fence on AFTER vs AFTER (no plant) exits $RCN ($NC; PASS with 0 records required)"
    RCP=0; "${OLDFENCE[@]}" --base "$AFTER" --new "$FN/root" --tables wpa_generic_9ft,wpa_spec_9ft,diamond_redlabel_9ft,diamond_proam_9ft,predator_apex_9ft,wpbsa_snooker_12ft,umb_carom_284,chinese8_pro_9ft,joy_q8_9ft,pool_pro_9ft_measured --looks default,sp --red-arm --room-report --program-report --out "$FN/fence-prefix.md" > "$FN/fence-prefix.log" 2>&1 || RCP=$?
    PC=$(tools/render/lighting-fence-nullcheck.sh --expect-blind "$FN/fence-prefix.md" "$RCP") || { rc=$?; echo "[seal] arm fencenullroom: the planted CONTROL read FAILED CLOSED — $PC (a control that is dead, or that is not blind to the plant, proves nothing)"; echo "[seal] FAILED at arm-fencenullroom-control exit $rc $(date -u +%FT%TZ)"; armverdict "arm-fencenullroom-control" "$rc"; exit $rc; }
    echo "[seal] arm fencenullroom: the pre-FIX1 fence (df17fb67) on the SAME-TREE pair (base AFTER, new = the nulled root) exits $RCP ($PC) — the blindness finding; the fixed fence runs as the seal's own fence step below"
    export FENCE_NEW_OVERRIDE="$FN/root";;
  fenceflushoff)
    # ORDER-LIGHT-C2-FIX1 §L31 arm: the seal's OWN fence form on a NEW root where ONE dump's occlusion-trace flush record reads 'off' (the shape a
    # capture under OB_SETTLE_FLUSH=off writes) must exit 3 and name the dump — an unflushed dump photographs whichever async transport traces had
    # landed (the land15 attempt-2 finding: 144 -> 154 aOccl meshes across two sealed runs of ONE tree). The pre-§L31 fence (df17fb67) reads the same
    # root PASS / exit 0 — the finding, judged here as the negative control.
    FF="$ROOT/arm-fenceflushoff-$TAG"; case "$FF" in output/lighting/arm-fenceflushoff-*) ;; *) echo "refusing $FF"; exit 9;; esac
    [ -e "$FF" ] && rm -rf -- "${FF:?}"; mkdir -p "$FF/root/default" "$FF/root/sp"
    for LK in default sp; do for TB in "$AFTER"/$LK/*/; do TB=$(basename "$TB"); ln -s "$(cd "$AFTER/$LK/$TB" && pwd -P)" "$FF/root/$LK/$TB"; done; done
    rm -f "$FF/root/default/wpbsa_snooker_12ft"; mkdir -p "$FF/root/default/wpbsa_snooker_12ft"; cp "$AFTER/default/wpbsa_snooker_12ft/census.json" "$FF/root/default/wpbsa_snooker_12ft/"
    python3 tools/render/lighting-fence-flushoff.py "$AFTER/default/wpbsa_snooker_12ft/identity.json" "$FF/root/default/wpbsa_snooker_12ft/identity.json"
    git show df17fb67:tools/render/lighting-fence.py > "$FF/fence-prefix.py"
    # ORDER-LIGHT-C2-FIX6 (land22 arm phase, class-J finding): the pre-FIX1 fence is NOT comparable across dump-format versions — the dumps now carry
    # hashBytes / elem / bytes on data textures (present on chinese8 / joy only), and df17fb67's record comparison read them as changed table meshes
    # (base = main's `before`, exit 3 on both tables) BEFORE the plant could be judged. The negative control is therefore the SAME-TREE pair: base =
    # the tree's own sealed set, new = the planted root — the plant is the only difference and the old fence reading PASS on it is the blindness
    # finding; a NULL check first (old fence AFTER vs AFTER, no plant) must read PASS with ZERO difference records, or the pair proves nothing.
    OLDFENCE=(python3 "$FF/fence-prefix.py"); [ "${OB_SEAL_ARM:-}" = fencedead ] && OLDFENCE=(false)  # fencedead: the instrument dies (no report) — the NULL check must FAIL CLOSED (exit 12)
    RCN=0; "${OLDFENCE[@]}" --base "$AFTER" --new "$AFTER" --tables wpa_generic_9ft,wpa_spec_9ft,diamond_redlabel_9ft,diamond_proam_9ft,predator_apex_9ft,wpbsa_snooker_12ft,umb_carom_284,chinese8_pro_9ft,joy_q8_9ft,pool_pro_9ft_measured --looks default,sp --red-arm --room-report --program-report --out "$FF/fence-null.md" > "$FF/fence-null.log" 2>&1 || RCN=$?
    # FAIL-CLOSED read (lighting-fence-nullcheck.sh): report present + the old fence's own verdict line + grep 0/1 only; a dead instrument = exit 12 → `[seal] FAILED at`
    NC=$(tools/render/lighting-fence-nullcheck.sh --expect-null "$FF/fence-null.md" "$RCN") || { rc=$?; echo "[seal] arm fenceflushoff: NULL check FAILED CLOSED — $NC"; echo "[seal] FAILED at arm-fenceflushoff-null exit $rc $(date -u +%FT%TZ)"; armverdict "arm-fenceflushoff-null" "$rc"; exit $rc; }
    echo "[seal] arm fenceflushoff: NULL check — the pre-§L31 fence on AFTER vs AFTER (no plant) exits $RCN ($NC; PASS with 0 records required)"
    RCP=0; "${OLDFENCE[@]}" --base "$AFTER" --new "$FF/root" --tables wpa_generic_9ft,wpa_spec_9ft,diamond_redlabel_9ft,diamond_proam_9ft,predator_apex_9ft,wpbsa_snooker_12ft,umb_carom_284,chinese8_pro_9ft,joy_q8_9ft,pool_pro_9ft_measured --looks default,sp --red-arm --room-report --program-report --out "$FF/fence-prefix.md" > "$FF/fence-prefix.log" 2>&1 || RCP=$?
    PC=$(tools/render/lighting-fence-nullcheck.sh --expect-blind "$FF/fence-prefix.md" "$RCP") || { rc=$?; echo "[seal] arm fenceflushoff: the planted CONTROL read FAILED CLOSED — $PC (a control that is dead, or that is not blind to the plant, proves nothing)"; echo "[seal] FAILED at arm-fenceflushoff-control exit $rc $(date -u +%FT%TZ)"; armverdict "arm-fenceflushoff-control" "$rc"; exit $rc; }
    echo "[seal] arm fenceflushoff: the pre-§L31 fence (df17fb67) on the SAME-TREE pair (base AFTER, new = the unflushed root) exits $RCP ($PC) — the blindness finding; the fixed fence runs as the seal's own fence step below"
    export FENCE_NEW_OVERRIDE="$FF/root";;
  occlutnotail)
    # ORDER-LIGHT-C2-FIX1 class C arm (refuter): the COMMITTED 65×65 data declared WITHOUT its far law (tail 'none' → the clamped read) must fail the
    # same --check — the far bound is the table's own far-row interpolation error, which a domain-only extension does not meet (5.1e-3 vs 8.8e-5)
    ON="$ROOT/arm-occlutnotail-$TAG"; case "$ON" in output/lighting/arm-occlutnotail-*) ;; *) echo "refusing $ON"; exit 9;; esac
    [ -e "$ON" ] && rm -rf -- "${ON:?}"; mkdir -p "$ON"; sed "s/tail: 'inv-c2'/tail: 'none'/" web/scene/occlusionlut.js > "$ON/occlusionlut-notail.js"
    grep -q "tail: 'none'" "$ON/occlusionlut-notail.js" || { echo "[seal] arm occlutnotail: could not strip the tail declaration (this line must never print)"; armdead; }
    step arm-occlutnotail node tools/render/lighting-occlusion-lut.mjs --check --lut "$ON/occlusionlut-notail.js"
    echo "[seal] arm occlutnotail: the tail-less read passed the far check (this line must never print)"; armdead;;
  occlutpre)
    # ORDER-LIGHT-C2-FIX1 class C arm: the pre-FIX1 LUT (df17fb67's web/scene/occlusionlut.js: 65×33 over h/r [0, 2], no far law) judged by the same
    # --check — the clamped read at h/r 10 (0.9398 vs the integral 0.9964) exceeds the table's own interpolation error → exit 4
    OP="$ROOT/arm-occlutpre-$TAG"; case "$OP" in output/lighting/arm-occlutpre-*) ;; *) echo "refusing $OP"; exit 9;; esac
    [ -e "$OP" ] && rm -rf -- "${OP:?}"; mkdir -p "$OP"; git show df17fb67:web/scene/occlusionlut.js > "$OP/occlusionlut-prefix.js"
    step arm-occlutpre node tools/render/lighting-occlusion-lut.mjs --check --lut "$OP/occlusionlut-prefix.js"
    echo "[seal] arm occlutpre: the pre-FIX1 LUT passed the far check (this line must never print)"; armdead;;
  carrymix)
    # ORDER-LIGHT-C1 (review r1 P2, lighting-capture.mjs:324-326) arm: a single-run set re-captured for ONE pose with --no-clean carries the other
    # pose's file from the earlier run. FIXED tool: the carried run id rides in priorRunIds, the cell is named in carriedCells, and with no
    # --declare-carry the FIXED checker REFUSES the set by name (exit 5); the same re-capture with --declare-carry passes. PRE-C1 tool + checker
    # (the 26d556d8 worktree, its own tools; the negative control): priorRunIds stays empty and the checker reads 0 refusals — the finding.
    # Literal table: this block runs before PRED is set (set -u: `$PRED` killed the first run of this arm in land13 with no verdict).
    echo "[seal] step arm-carrymix $(date -u +%FT%TZ)"
    PX="${OB_PREFIX10_TOOLING:-/tmp/ob-land-638/prefix10-26d556d8}"; assert_export "$PX" 26d556d8 arm-carrymix; [ -f "$PX/tools/render/lighting-check-runs.py" ] || { echo "[seal] arm carrymix: pre-C1 worktree $PX missing (this line must never print)"; armdead; }
    SRC="$ROOT/after-$TAG-leafstall"; [ -f "$SRC/manifest.json" ] || { echo "[seal] arm carrymix: source set $SRC missing (this line must never print)"; armdead; }
    # (chain14 final regate, 12:26Z) the SOURCE set may be a SYMLINK into the previous seal's tree (a targeted regate reuses sets by symlink):
    # `cp -R` copies the LINK, and the three --no-clean captures below then wrote INTO the reused land13 set (a carried run id in its manifest;
    # the seal of record's check-runs then refused it). The copy resolves the link first and the arm refuses a symlinked working dir by name.
    SRCR="$(cd "$SRC" && pwd -P)"
    for V in fixed declared pre; do D="$ROOT/arm-carrymix-$V-$TAG"; case "$D" in output/lighting/arm-carrymix-*) [ -e "$D" ] || [ -L "$D" ] && { [ -d "$D" ] && [ ! -L "$D" ] && chmod -R u+w "$D"; rm -rf -- "${D:?}"; };; *) echo "refusing $D"; exit 9;; esac; cp -R "$SRCR" "$D"; chmod -R u+w "$D"; [ -L "$D" ] && { echo "[seal] arm carrymix: $D is a symlink — refusing to capture into it (this line must never print)"; armdead; }; done
    echo "[seal] arm carrymix: source $SRC -> $SRCR (resolved), working copies are real directories"
    OLDID=$(python3 -c "import json;print(json.load(open('$SRC/manifest.json'))['runId'])")
    RC=0; node tools/render/lighting-capture.mjs --out "$ROOT/arm-carrymix-fixed-$TAG" --no-clean --tables predator_apex_9ft --look default --poses cueball_level --flags leafStall=venueflag > "$ROOT/arm-carrymix-fixed-$TAG.log" 2>&1 || RC=$?
    CK=0; python3 tools/render/lighting-check-runs.py "$ROOT/arm-carrymix-fixed-$TAG" > "$ROOT/arm-carrymix-fixed-$TAG.check" 2>&1 || CK=$?
    NAMED=$(grep -c 'with NO declared carry' "$ROOT/arm-carrymix-fixed-$TAG.check" || true)
    PROP=$(python3 -c "import json;m=json.load(open('$ROOT/arm-carrymix-fixed-$TAG/manifest.json'));print(int('$OLDID' in [str(x) for x in (m.get('priorRunIds') or [])] and any('full34' in (c.get('poses') or []) for c in (m.get('carriedCells') or []))))" 2>/dev/null || echo 0)
    RCD=0; node tools/render/lighting-capture.mjs --out "$ROOT/arm-carrymix-declared-$TAG" --no-clean --tables predator_apex_9ft --look default --poses cueball_level --flags leafStall=venueflag --declare-carry "arm carrymix: the earlier full34 is admissible beside the re-captured cueball_level" > "$ROOT/arm-carrymix-declared-$TAG.log" 2>&1 || RCD=$?
    CKD=0; python3 tools/render/lighting-check-runs.py "$ROOT/arm-carrymix-declared-$TAG" > "$ROOT/arm-carrymix-declared-$TAG.check" 2>&1 || CKD=$?
    HERE="$PWD"  # (refuter: $PWD inside the subshell resolves AFTER the cd — the pre-C1 capture would write into the negative control and the arm would judge an untouched copy)
    RCP=0; ( cd "$PX" && env -u OB_LIGHTING_WEB -u OB_LIGHTING_WEB_ARM -u OB_LIGHTING_PORT -u OB_LIGHTING_CDP -u OB_LIGHTING_BAND_START -u OB_LIGHTING_BAND_END node tools/render/lighting-capture.mjs --out "$HERE/$ROOT/arm-carrymix-pre-$TAG" --no-clean --tables predator_apex_9ft --look default --poses cueball_level --flags leafStall=venueflag ) > "$ROOT/arm-carrymix-pre-$TAG.log" 2>&1 || RCP=$?
    CKP=0; python3 "$PX/tools/render/lighting-check-runs.py" "$ROOT/arm-carrymix-pre-$TAG" > "$ROOT/arm-carrymix-pre-$TAG.check" 2>&1 || CKP=$?
    PRIORP=$(python3 -c "import json;m=json.load(open('$ROOT/arm-carrymix-pre-$TAG/manifest.json'));print(len(m.get('priorRunIds') or []))" 2>/dev/null || echo -1)
    CARRIEDP=$(python3 -c "import json;m=json.load(open('$ROOT/arm-carrymix-pre-$TAG/manifest.json'));print(sum(1 for r in m['runs'] for p in (r.get('poses') or []) if p.get('carriedFromRunId')))" 2>/dev/null || echo -1)
    echo "[seal] arm carrymix: FIXED capture exit $RC → checker exit $CK (refused by name $NAMED, carried id in priorRunIds + cell named $PROP); DECLARED capture exit $RCD → checker exit $CKD; PRE-C1 tool @ $PX capture exit $RCP → its checker exit $CKP (priorRunIds $PRIORP, carried pose files $CARRIEDP)"
    if [ "$RC" = 0 ] && [ "$CK" = 5 ] && [ "$NAMED" -ge 1 ] && [ "$PROP" = 1 ] && [ "$RCD" = 0 ] && [ "$CKD" = 0 ] && [ "$RCP" = 0 ] && [ "$CKP" = 0 ] && [ "$PRIORP" = 0 ] && [ "$CARRIEDP" -ge 1 ]; then
      echo "[seal] arm carrymix: the fixed tool names the carried file's origin and its checker refuses the undeclared carry; the pre-C1 tool carried the same file with an empty priorRunIds and its checker read clean → FAILED for the right reason (the arm fires)"
      echo "[seal] FAILED at arm-carrymix exit 5 $(date -u +%FT%TZ)"; armverdict arm-carrymix 5; exit 5; fi
    echo "[seal] arm carrymix: the assertion did not hold (this line must never print)"; armdead;;
  packcensus)
    # ORDER-LIGHT-COMPANION (review r12 P3, lighting-pack.py:52-53) arm: the pack's census diff must READ the derived venue term (sh / E) on the
    # venue-ON set; the pre-companion pack read the retired up/down fields and printed 'none' for every derived term — the finding.
    PC="$ROOT/arm-packcensus-$TAG"; case "$PC" in output/lighting/arm-packcensus-*) ;; *) echo "refusing $PC"; exit 9;; esac
    [ -e "$PC" ] && rm -rf -- "${PC:?}"; mkdir -p "$PC"
    echo "[seal] step arm-packcensus $(date -u +%FT%TZ)"
    PX="${OB_PREFIX8_TOOLING:-/tmp/ob-land-638/prefix8-2eab3fad}"; assert_export "$PX" 2eab3fad arm-packcensus
    RC=0; python3 - "$PX" "$ROOT" "$TAG" > "$PC/diff.log" 2>&1 <<'PY' || RC=$?
import importlib.util, sys, os, re
PX, ROOT, TAG = sys.argv[1], sys.argv[2], sys.argv[3]
def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
fixed = load('tools/render/lighting-pack.py', 'pack_fixed'); pre = load(os.path.join(PX, 'tools/render/lighting-pack.py'), 'pack_pre')
before, after = os.path.join(ROOT, 'before'), os.path.join(ROOT, f'after-{TAG}')
rf = fixed.census_diff(before, after, ['predator_apex_9ft'], ['default']); rp = pre.census_diff(before, after, ['predator_apex_9ft'], ['default'])
print('FIXED:', rf.splitlines()[-1]); print('PRE:', rp.splitlines()[-1])
# refuter round: the fixed pack must also READ a set whose rig leaf never landed (lighting: null — leafstall2) as 'none' instead of raising
try: r2 = fixed.census_diff(before, os.path.join(ROOT, f'after-{TAG}-leafstall2'), ['predator_apex_9ft'], ['default']); print('FIXED leafstall2:', r2.splitlines()[-1]); null_ok = r2.splitlines()[-1].rstrip('| ').endswith('none')
except Exception as e: print('FIXED leafstall2 RAISED:', repr(e)); null_ok = False
ok = ('derived: E(+y)' in rf) and rf.splitlines()[-1].rstrip('| ').endswith('none') is False and rp.splitlines()[-1].rstrip('| ').endswith('none') and null_ok
sys.exit(2 if ok else 0)
PY
    cat "$PC/diff.log" | cut -c1-200
    if [ "$RC" = 2 ]; then
      echo "[seal] arm packcensus: the fixed pack reads the derived term (sh / E) where the pre-companion pack printed 'none' → FAILED for the right reason (the arm fires)"
      echo "[seal] FAILED at arm-packcensus exit 2 $(date -u +%FT%TZ)"; armverdict arm-packcensus 2; exit 2; fi
    echo "[seal] arm packcensus: the assertion did not hold (rc $RC; this line must never print)"; armdead;;
esac
# (ORDER-LIGHT-9 Q6: the EXIT-trap echo is gone — step() writes the one FAILED witness; verifier round 7 saw it twice)
# ORDER-LIGHT-8 C2: the failure witness is written by the step itself — zsh ERR_EXIT inside a function within the
# redirected group never reaches the EXIT trap's echo (verifier round 6, reproduced), so the trap alone was a
# half-truth. `|| { …; exit rc; }` fires in every shell and carries the step's own exit code out of the group.
PRED=predator_apex_9ft
SWITCH_JS='switchjoy=window.__settings.changeEquipment("table_id","joy_q8_9ft",{ skipConfirm: true })'
SWITCHENV_JS='switchjoyenv=(() => { window.__settings.changeEquipment("table_id","joy_q8_9ft",{ skipConfirm: true }); let n = 0; const t = setInterval(() => { const g = window.__gi && window.__gi.state; if ((g && g.ready && g.fixture === "joy_lowrect") || ++n > 100) { clearInterval(t); try { const L = window.__lighting; const s = L.state(); L.apply(s.auto ? "auto" : s.fixture, s.brightness + 5e-4); setTimeout(() => { const s2 = L.state(); L.apply(s2.auto ? "auto" : s2.fixture, s.brightness); }, 400); } catch (e) { /* recorded by the frame */ } } }, 200); })()'
# ORDER-LIGHT-9 Q1 (moved balls): a shot, then 450 ms later the live blocks vs the grid at the live positions, and the
# PRE-shot blocks vs the post-shot positions (the not-updated hypothesis — the row's own arm). Written to window.__shMove
# for the census.
SHMOVE_JS='shmove=(() => { const T = window.__test, G = window.__gi, sc = window.__dbg.scene; const meshes = []; sc.traverse((o) => { if (o.isMesh && o.material && o.material.userData && o.material.userData.giSH) meshes.push(o); }); const t0 = meshes.map((o) => ({ pos: o.position.clone(), sh: Float32Array.from(o.material.userData.giSH.value) })); window.__shMove = { pending: true }; try { T.shoot({ v0: 1.5, theta: 0, a: 0, b: 0 }); } catch (e) { window.__shMove = { error: String(e) }; return; } setTimeout(() => { const tmp = new Float32Array(27); let maxD = 0, stale = 0, moved = 0, n = 0; meshes.forEach((o, i) => { if (!o.visible) return; n++; if (o.position.distanceTo(t0[i].pos) > 0.001) moved++; if (!G.sampleSH(o.position.x, o.position.z, tmp)) return; const sh = o.material.userData.giSH.value; let d = 0, ds = 0; for (let k = 0; k < 27; k++) { d = Math.max(d, Math.abs(sh[k] - tmp[k])); ds = Math.max(ds, Math.abs(t0[i].sh[k] - tmp[k])); } maxD = Math.max(maxD, d); if (o.position.distanceTo(t0[i].pos) > 0.001) stale = Math.max(stale, ds); }); window.__shMove = { pending: false, n, moved, maxDelta: maxD, staleDelta: stale, dtMs: 450 }; }, 450); })()'
FX_JS='fxchange=(() => { const L = window.__lighting; const s = L.state(); L.apply("canopy_panel", s.brightness); setTimeout(() => L.apply("auto", s.brightness), 300); })()'
ROOMHIDE_JS='roomhide=(() => { const sc = window.__dbg.scene; const root = sc.children.find((c) => { let f = false; c.traverse((o) => { if (o.name === "obFarPropTable") f = true; }); return f; }); for (const o of root.children) { if (o.isLight || o.isLightProbe) continue; if (o.userData && o.userData.obVenueClass === "fixture") continue; o.visible = false; } })()'
{
  echo "[seal] $(date -u +%FT%TZ) tag=$TAG sha=$(git rev-parse HEAD) dirty=$(git status --porcelain | wc -l | tr -d ' ')${NOCAP:+ mode=$NOCAP}${OB_SEAL_ARM:+ ARM=$OB_SEAL_ARM}"
  if [ "$NOCAP" = "--no-capture" ]; then echo "[seal] capture steps SKIPPED — reusing $AFTER and its arm sets"; else
    # ORDER-LIGHT-C2-FIX2 plan-key law: BEFORE the first capture, every armed row's dataset key must resolve to a read key this plan produces
    step check-spec-keys python3 tools/render/lighting-gate-spec.py --check-keys --spec "$SPEC"
    step capture-after node tools/render/lighting-capture.mjs --out "$AFTER" --look both
    step capture-scope node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-scope" --tables $PRED --look both --poses full34,cushion_shadow,cueball_level \
      --poke 'fill0=window.__lighting.setVenueFill(0)' --poke "$ROOMHIDE_JS" \
      --poke 'standins0=window.__dbg.scene.traverse((o) => { if (o.isHemisphereLight) o.intensity = 0; if (o.isPointLight && !/Led/i.test(o.name || "")) o.intensity = 0; })' \
      --poke 'bakeoff=window.__gi.uniforms.uGiIrr.value = 0' \
      --poke 'alloff=(() => { window.__lighting.setVenueFill(0); window.__gi.uniforms.uGiIrr.value = 0; window.__dbg.scene.traverse((o) => { if (o.isHemisphereLight) o.intensity = 0; if (o.isPointLight && !/Led/i.test(o.name || "")) o.intensity = 0; }); })()' \
      --poke 'barsoff=window.__dbg.scene.traverse((o) => { if (o.isRectAreaLight) o.intensity = 0; })'
    step capture-arm node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-arm" --tables $PRED --look both --poses full34,cushion_shadow --flags venueArm=wallfill \
      --poke 'fill0=window.__lighting.setVenueFill(0)' --poke "$ROOMHIDE_JS"
    # ORDER-LIGHT-8 C1: the off capture is the main-identity witness — 2 tables × 2 poses × 2 looks (offcheck below)
    # ORDER-LAND-638-FIX3 (P2 #1 / #4 arms, measured): main's OWN boot env cube is one fixed-point step in (its walls were baked
    # under an empty cube; on wpa six further bakes move the frame +0.87/255 mean, 27/255 on 51 % of pixels — a main property
    # that depends on the boot's bake count, i.e. on the table / fixture), and a degraded boot starts from the class state,
    # so "byte-for-byte equal to main's boot frame" is not a defined comparison across histories. The judged identity is
    # CONVERGED vs CONVERGED: both sides run the same derived convergence after HIDE_UI (bake → six face means → stop at
    # ≤ 1e-4 relative, bound 8 — the venue settle law's rule) as a `conv` sub-run; the unconverged comparisons and main's own
    # convergence delta are RECORDED (offcheck-*-boot / offcheck-mainconv)
    CONV_JS='conv=window.__pokePending = true; (async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const { renderer, cubeRT } = window.__dbg; const N = cubeRT.width, S = 4, buf = new Uint16Array(N * N * 4); const h2f = (h) => { const sg = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff; if (e === 0) return sg * Math.pow(2, -14) * (m / 1024); if (e === 31) return m ? NaN : sg * Infinity; return sg * Math.pow(2, e - 15) * (1 + m / 1024); }; const means = () => { const out = []; for (let f = 0; f < 6; f++) { renderer.readRenderTargetPixels(cubeRT, 0, 0, N, N, buf, f); let sum = 0, n = 0; for (let y = 0; y < N; y += S) for (let x = 0; x < N; x += S) { const i = 4 * (y * N + x); const l = 0.2126 * h2f(buf[i]) + 0.7152 * h2f(buf[i + 1]) + 0.0722 * h2f(buf[i + 2]); if (Number.isFinite(l)) { sum += l; n++; } } out.push(n ? sum / n : 0); } return out; }; let prev = null, bakes = 0, rel = null; for (let i = 0; i < 8; i++) { window.__rebakeEnv(); bakes++; const m = means(); if (prev) { rel = Math.max(...m.map((v, k) => Math.abs(v - prev[k]) / Math.max(Math.abs(prev[k]), 1e-9))); if (rel <= 1e-4) break; } prev = m; await w(120); } window.__convRecord = { bakes, lastRel: rel }; await w(600); window.__pokePending = false; })()'
    step capture-off node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-off" --tables $PRED,wpa_spec_9ft --look both --poses full34,cueball_level --flags venue=off --poke-raw "$CONV_JS"
    # ORDER-LAND-638-FIX4 (verifier item 5, measured §L23.3): the BOOT frame is load-dependent on main itself (state D: one env
    # fixed-point step, 1/255 on 3–14 % of the Predator frame, 3/6 main boots under 2× CPU throttle; 2 of the last 3 chain off
    # boots) — so the judged off==main identity is CONVERGED vs CONVERGED (the same derived convergence on both sides, after the
    # UI hide), and the boot-vs-boot comparison is RECORDED with its numbers (offcheck-$TAG-boot). The main baseline gets the conv
    # sub-run on the 8 offcheck cells here (a fresh main boot of the same export; its base cells are re-captured too)
    # ORDER-LIGHT-FIX5 (land8): main's export is captured FROM a checkout whose web/ is main's (lighting-capture-from.sh: the cdp.mjs
    # served-tree preflight expects its own checkout's app tree; this checkout's app.html no longer equals main 163d7f25's after the S4 merges)
    # land8 attempt 6 (the 13 silent rows, group 1): this step writes a 2-POSE run into the SHARED baseline $BEFORE, and
    # lighting-capture.mjs clears its output table directory before every run — so each seal run silently cut the two Predator
    # /wpa_spec baselines from 14 poses to 2, and the four P638 rack_level / cushion_shadow red arms then read 'missing pose'.
    # --no-clean keeps the sibling poses; the run still overwrites the two poses it captures.
    STEP_EXPORT="${OB_MAIN_TOOLING:-/tmp/ob-land-638/main-tooling}:163d7f25"
    step capture-beforeconv tools/render/lighting-capture-from.sh "${OB_MAIN_TOOLING:-/tmp/ob-land-638/main-tooling}" --out "$PWD/$BEFORE" --no-clean --declare-carry "the main 163d7f25 baseline: the conv step re-captures full34 + cueball_level beside its conv poke; the 12 other poses of the Predator / wpa_spec base runs remain the earlier baseline run's files (same tree, same tool) — admissible as the main baseline, named here" --tables $PRED,wpa_spec_9ft --look both --poses full34,cueball_level --poke-raw "$CONV_JS"
    step capture-switch node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-switch" --tables $PRED --look both --poses full34,cueball_level --poke-raw "$SWITCH_JS"
    step capture-hookleak node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-hookleak" --tables $PRED --look both --poses full34 --flags venueHook=leak --poke-raw "$SWITCH_JS"
    step capture-settle node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-settle" --tables $PRED --look both --poses full34 --flags giDelay=1500 --poke-raw "$FX_JS"
    step capture-settlelegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-settlelegacy" --tables $PRED --look both --poses full34 --flags 'giDelay=1500&venueSettle=legacy' --poke-raw "$FX_JS"
    step capture-shmove node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-shmove" --tables $PRED --look both --poses cueball_level --poke-raw "$SHMOVE_JS"
    # ORDER-LIGHT-11 R-A: the energy ledger's arms — the same runtime-lights-off / bake-off pokes under ?venue=off (main's
    # sourcing) and under ?ledgerArm=cloth (the cloth's rect-light diffuse removed: the cloth's direct IS the runtime
    # rect lights, so its lights-off delta must collapse → RED)
    step capture-offscope node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-offscope" --tables $PRED --look both --poses full34,cushion_shadow,cueball_level --flags venue=off \
      --poke 'barsoff=window.__dbg.scene.traverse((o) => { if (o.isRectAreaLight) o.intensity = 0; })' --poke 'bakeoff=window.__gi.uniforms.uGiIrr.value = 0'
    step capture-ledgerarm node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-ledgerarm" --tables $PRED --look both --poses full34,cushion_shadow,cueball_level --flags ledgerArm=cloth \
      --poke 'barsoff=window.__dbg.scene.traverse((o) => { if (o.isRectAreaLight) o.intensity = 0; })'
    # the same venue scene with ONLY the ball splice off — the reference the cloth / cushion / floor ledger rows compare against
    # review round 3: the browser census of the BOUND occlusion texture (nine interior texels + upload + binding), default and off
    step capture-occ node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-occ" --tables $PRED --look both --poses cueball_level
    step capture-occoff node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-occoff" --tables $PRED --look both --poses cueball_level --flags venue=off
    # ORDER-LAND-638 (d): the #638 SECOND symptom — a ball RESTING on the Predator foam plug (#633 sink-rest) at #633's
    # own register (02-rest-hi), staged by the committed drive; default = AFTER, ?venue=off = BEFORE (record rows)
    CUP_JS="cuprest=$(cat tools/render/lib/lighting-cup-drive.js)"
    # (C1 chain13 attempt 2: cup_rest exists only after the cup drive — the base run was recorded EMPTY before (0 poses, the silently-shorter run of
    # review r12 P2) and is refused by the fail-closed pose rule now; `--no-base` = the poke sub-run only, stated)
    step capture-cup node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-cup" --tables $PRED --look both --poses cup_rest --poke-raw "$CUP_JS" --no-base
    step capture-cupoff node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-cupoff" --tables $PRED --look both --poses cup_rest --poke-raw "$CUP_JS" --flags venue=off --no-base
    # ORDER-LAND-638-FIX (landing review review round 5) arms — the boot-compatibility / pre-GI degradation CONTRACT:
    # P2-a a fixture change away from pdt_studio restores the table-owned probe (fixcanopy), and back suppresses it again
    # with the same derived fill (fixback); a table round trip Predator → JOY → Predator re-derives the same fill (switchback)
    CANOPY_JS='fixcanopy=window.__lighting.apply("canopy_panel", window.__lighting.state().brightness)'
    # the round-trip pokes are ASYNCHRONOUS: they raise window.__pokePending and lower it only once the SECOND leg's fill is
    # derived (venue.pending false with coefficients present), so the capture's census reads the re-derived fill, never
    # the in-flight state (land4 run 1: the census ran between the legs → venue:sh read +inf)
    FIXBACK_JS='fixback=window.__pokePending = true; (async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const L = window.__lighting; const b = L.state().brightness; L.apply("canopy_panel", b); await w(400); L.apply("pdt_studio", b); for (let i = 0; i < 1200; i++) { await w(50); const v = L.state().venue; if (v && v.pending !== true && v.sh) break; } window.__pokePending = false; })()'
    SWITCHBACK_JS='switchback=window.__pokePending = true; (async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const L = window.__lighting; window.__settings.changeEquipment("table_id","joy_q8_9ft",{ skipConfirm: true }); await w(1500); window.__settings.changeEquipment("table_id","predator_apex_9ft",{ skipConfirm: true }); for (let i = 0; i < 1200; i++) { await w(50); const v = L.state().venue; if (v && v.pending !== true && v.sh) break; } window.__pokePending = false; })()'
    step capture-fixcanopy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-fixcanopy" --tables $PRED --look both --poses cueball_level --poke-raw "$CANOPY_JS"
    step capture-fixback node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-fixback" --tables $PRED --look both --poses cueball_level --poke-raw "$FIXBACK_JS"
    step capture-switchback node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-switchback" --tables $PRED --look both --poses cueball_level --poke-raw "$SWITCHBACK_JS"
    # P1-b / P2-c: no-GI boot (`?nogi`: uGiOn stays 0, no apply ever starts) and a public fixture without a committed bake
    # (pendant_bar: the honesty gate keeps uGiOn 0) — balls must keep main's LTC diffuse; each with its ?venue=off twin
    step capture-nogi node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-nogi" --tables $PRED,wpa_spec_9ft --look both --poses cueball_level --flags nogi
    step capture-nogioff node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-nogioff" --tables $PRED,wpa_spec_9ft --look both --poses cueball_level --flags "nogi&venue=off"
    # GH-996 (card 45): the same ?nogi boot with the ball knee off — FIX-nogi-lit-wpa judges the venue-path contract on it (the grid-off LTC crown passes T)
    step capture-nogink node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-nogink" --tables $PRED,wpa_spec_9ft --look both --poses cueball_level --flags "nogi&ballKnee=off"
    step capture-pendant node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-pendant" --tables $PRED,wpa_spec_9ft --look default --poses cueball_level --flags fixture=pendant_bar
    # ORDER-LIGHT-C2-FIX8 H3-4 red plant: the same boot under the fadd4ecb rule (?venueAccept=fix7) — a crossing cell degrades again
    step capture-pendantfix7 node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-pendantfix7" --tables $PRED,wpa_spec_9ft --look default --poses cueball_level --flags "venueAccept=fix7&fixture=pendant_bar"
    step capture-pendantoff node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-pendantoff" --tables $PRED,wpa_spec_9ft --look default --poses cueball_level --flags "fixture=pendant_bar&venue=off"
    # GH-996 (card 45): the same pendant boot with the ball knee OFF (?ballKnee=off) — FIX-pendant-lit-wpa judges the P1-b venue-path
    # contract on it (the knee compresses a lamp-blown crown BY DESIGN and is judged by its own KNEE rows; pairs-pendantnk below)
    step capture-pendantnk node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-pendantnk" --tables $PRED,wpa_spec_9ft --look default --poses cueball_level --flags "fixture=pendant_bar&ballKnee=off"
    # the red arm of the lit rows: the SAME no-grid boots on the PREVIOUS export (OB_LIGHTING_WEB_ARM: the unweighted
    # specular-only splice of 45634ea1 — a ball without a grid had no diffuse there)
    # land8 attempt 5 (2026-09-07 21:00Z): once the cfe40dca merge changed THIS checkout's web/app.html, serving the FIX5-base arm
    # tree from this checkout's capture tool tripped cdp.mjs's served-tree preflight (GH-248: served 38018 B vs local 49646 B) —
    # the same class that took attempt 1's main captures. Arm-tree captures now run like main's: from a tooling checkout whose
    # web/ IS the arm tree (a detached worktree at the FIX5 base 2b415aa7 with this lane's tools/render overlaid), absolute --out.
    # TWO arm bases exist by design, and a row must arm on the one that predates ITS OWN fix:
    #   OB_ARM_TOOLING     = the FIX5 base 2b415aa7 — the base for rows whose fix landed AFTER FIX5.
    #   OB_ARM_V1_TOOLING  = e6dfa6f2, the ORDER-LAND-638-FIX pre-fix tree (unweighted specular-only splice, no loadRequested
    #                        guard) — the base for the nine no-grid / pendant / mix / gifail rows, whose fix is a32bddf7
    #                        ("landing review review round 5"). a32bddf7 is an ANCESTOR of 2b415aa7 and NOT of e6dfa6f2.
    # land8 attempt 6 (the 13 silent rows, group 2): these two captures were moved to the FIX5 base with the rest, so the nine
    # rows armed on a tree that already carried the fix they exist to prove absent — five of them read a value bit-identical to
    # their own measurement. Mis-registered arms, not absent defects; the registry fix is here, at the capture step.
    ARMTOOL="${OB_ARM_TOOLING:-/tmp/ob-land-638/arm-tooling}"
    ARMV1TOOL="${OB_ARM_V1_TOOLING:-/tmp/ob-land-638/armv1-tooling}"
    STEP_EXPORT="${ARMV1TOOL}:e6dfa6f2"
    step capture-nogiarm tools/render/lighting-capture-from.sh "$ARMV1TOOL" --out "$PWD/$ROOT/after-$TAG-nogiarm" --tables $PRED,wpa_spec_9ft --look both --poses cueball_level --flags nogi
    # ORDER-LIGHT-C2-FIX5 E2: the red arm of the re-derived FIX-nogi-wait rows — the same ?nogi boot on THIS tree under the legacy settle rule (its fixed
    # 800 ms wait polls at 100 ms → tailPolls ≥ 8); the previous export's ?nogi boot (nogiarm) predates the tailPolls field (land20 capturing seal: NO-READ)
    step capture-nogilegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-nogilegacy" --tables $PRED,wpa_spec_9ft --look both --poses cueball_level --flags "nogi&venueSettle=legacy"
    STEP_EXPORT="${ARMV1TOOL}:e6dfa6f2"
    step capture-pendantarm tools/render/lighting-capture-from.sh "$ARMV1TOOL" --out "$PWD/$ROOT/after-$TAG-pendantarm" --tables $PRED,wpa_spec_9ft --look default --poses cueball_level --flags fixture=pendant_bar
    # ORDER-LAND-638-FIX2 B1: every Predator fixture carries the DERIVED room-only probe — canopy and ring boots (room rows
    # JUDGED in the club-class band, ball rows as outputs, pins per fixture) and the pdt → canopy → ring → pdt round trip
    # (frame identity against the fresh boot, offcheck-fixtrip below)
    step capture-pdtcanopy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-pdtcanopy" --tables $PRED --look both --poses full34,cueball_level,cushion_shadow --flags fixture=canopy_panel
    step capture-pdtring node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-pdtring" --tables $PRED --look both --poses full34,cueball_level,cushion_shadow --flags fixture=perimeter_ring
    # GH-996 (card 45 C2): the ball knee's PRE-knee crown reads (?ballKneeDebug=diffuse — the ball writes its diffuse before the knee)
    # at b = 1: the canopy on the four tables the card measured plus the snooker canopy (compressed by the owner's pick: the canopy
    # rows' arm and a pinned cell), and every other measured lamp (pinned: fixtures/lighting-ballknee-pin.json). gain11 = the same
    # boot with every lamp x1.1 (brightness 1.1 through the public seam): the pinned rows' arm (a brightened lamp must read RED)
    GAIN11_JS='gain11=(() => { const L = window.__lighting, s = L.state(); L.apply(s.auto ? "auto" : s.fixture, 1.1); })()'
    step capture-kneecanopy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-kneecanopy" --tables wpa_spec_9ft,$PRED,chinese8_pro_9ft,umb_carom_284,wpbsa_snooker_12ft --look both --poses cueball_level --flags "fixture=canopy_panel&ballKneeDebug=diffuse" --poke-raw "$GAIN11_JS"
    step capture-kneering node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-kneering" --tables wpa_spec_9ft,umb_carom_284,wpbsa_snooker_12ft --look both --poses cueball_level --flags "fixture=perimeter_ring&ballKneeDebug=diffuse" --poke-raw "$GAIN11_JS"
    step capture-kneependant node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-kneependant" --tables wpa_spec_9ft,umb_carom_284,wpbsa_snooker_12ft --look both --poses cueball_level --flags "fixture=pendant_bar&ballKneeDebug=diffuse" --poke-raw "$GAIN11_JS"
    step capture-kneesnookerlum node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-kneesnookerlum" --tables wpbsa_snooker_12ft --look both --poses cueball_level --flags "fixture=snooker_luminaire&ballKneeDebug=diffuse" --poke-raw "$GAIN11_JS"
    step capture-kneecaromlum node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-kneecaromlum" --tables umb_carom_284 --look both --poses cueball_level --flags "fixture=carom_luminaire&ballKneeDebug=diffuse" --poke-raw "$GAIN11_JS"
    step capture-kneeauto node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-kneeauto" --tables $PRED,chinese8_pro_9ft --look both --poses cueball_level --flags ballKneeDebug=diffuse --poke-raw "$GAIN11_JS"
    # the canopy's SHIPPED output with the knee on and its ?ballKnee=off twin (KNEE-canopy-identity: the knee leaves the canopy crown alone;
    # arm = the snooker canopy, which the knee compresses)
    step capture-kneecanopyon node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-kneecanopyon" --tables wpa_spec_9ft,$PRED,chinese8_pro_9ft,umb_carom_284,wpbsa_snooker_12ft --look both --poses cueball_level --flags fixture=canopy_panel
    step capture-kneecanopynk node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-kneecanopynk" --tables wpa_spec_9ft,$PRED,chinese8_pro_9ft,umb_carom_284,wpbsa_snooker_12ft --look both --poses cueball_level --flags "fixture=canopy_panel&ballKnee=off"
    # the snooker table under the PENDANT (not in the snooker class bake, so uGiOn 0 is its SHIPPED path; the snooker luminaire is baked for
    # its own table) and its ?ballKnee=off twin — the snooker grid-off cell of the KNEE-gioff rows
    step capture-snookerpendant node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-snookerpendant" --tables wpbsa_snooker_12ft --look both --poses cueball_level --flags fixture=pendant_bar
    step capture-snookerpendantnk node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-snookerpendantnk" --tables wpbsa_snooker_12ft --look both --poses cueball_level --flags "fixture=pendant_bar&ballKnee=off"
    # the metal-rim table under the perimeter ring (unbaked on the pool tables: grid-off is its shipped path) with the knee off — pdtring's twin
    step capture-pdtringnk node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-pdtringnk" --tables $PRED --look both --poses cueball_level --flags "fixture=perimeter_ring&ballKnee=off"
    FIXTRIP_JS='fixtrip=window.__pokePending = true; (async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const L = window.__lighting; const b = L.state().brightness; const settled = async () => { for (let i = 0; i < 1200; i++) { await w(50); const v = L.state().venue; if (v && v.pending !== true && v.sh) return; } }; L.apply("canopy_panel", b); await settled(); L.apply("perimeter_ring", b); await settled(); L.apply("pdt_studio", b); await settled(); L.apply("auto", b); await settled(); window.__pokePending = false; })()'
    step capture-fixtrip node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-fixtrip" --tables $PRED --look both --poses full34,cueball_level --poke-raw "$FIXTRIP_JS"
    # the round trip's CONTROL: the same last two rig writes (explicit pdt, then the boot's auto mode) without the canopy /
    # ring excursion — the same capture protocol (UI hidden → rig writes → the settle law's converged bakes → frame), so the
    # comparison isolates the excursion. The straight boot is NOT the reference: its last env bake ran before the tool
    # hid the cue and the aim overlay, so its cube (and its probe) still carry them (recorded below, offcheck-fixtrip-boot)
    FIXCTL_JS='fixctl=window.__pokePending = true; (async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const L = window.__lighting; const b = L.state().brightness; const settled = async () => { for (let i = 0; i < 1200; i++) { await w(50); const v = L.state().venue; if (v && v.pending !== true && v.sh) return; } }; L.apply("pdt_studio", b); await settled(); L.apply("auto", b); await settled(); window.__pokePending = false; })()'
    step capture-fixctl node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-fixctl" --tables $PRED --look both --poses full34,cueball_level --poke-raw "$FIXCTL_JS"
    # the settle rows' red arm: ring → pdt under ?venueConverge=off (ONE comparison round after a large rig change records the
    # first fixed-point step as lastDeltaRel ≈ 5e-4 and settled 0); and main's own ring boot (?venue=off) for the recorded ring floor row
    SETTLEOFF_JS='settleoff=window.__pokePending = true; (async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const L = window.__lighting; const b = L.state().brightness; const settled = async () => { for (let i = 0; i < 1200; i++) { await w(50); const v = L.state().venue; if (v && v.pending !== true && v.sh) return; } }; L.apply("perimeter_ring", b); await settled(); L.apply("pdt_studio", b); await settled(); window.__pokePending = false; })()'
    step capture-settleoff node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-settleoff" --tables $PRED --look both --poses cueball_level --flags venueConverge=off --poke-raw "$SETTLEOFF_JS"
    step capture-pdtringoff node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-pdtringoff" --tables $PRED --look both --poses full34,cueball_level --flags "fixture=perimeter_ring&venue=off"
    # ORDER-LAND-638-FIX3 (review r7 P2 #2): the first asset load fails (?giFail=assets:1), then canopy → auto retries and succeeds
    GIERR_JS='gierr=window.__pokePending = true; (async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const L = window.__lighting; const b = L.state().brightness; const settled = async () => { for (let i = 0; i < 1200; i++) { await w(50); const v = L.state().venue; if (v && v.pending !== true && v.sh) return; } }; L.apply("canopy_panel", b); await settled(); L.apply("auto", b); await settled(); window.__pokePending = false; })()'
    step capture-gierr node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-gierr" --tables $PRED --look both --poses cueball_level --flags giFail=assets:1 --poke-raw "$GIERR_JS"
    # ORDER-LAND-638-FIX3 (review r7 P2 #4): the float render-target capability forced absent → the feature is inert, frame = main
    step capture-nofloat node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-nofloat" --tables $PRED,wpa_spec_9ft --look both --poses full34,cueball_level --flags venueFloat=0 --poke-raw "$CONV_JS"
    # ORDER-LAND-638-FIX4 (review r8 P2 #1): a throw inside the cube render / the float readback takes the same degrade path —
    # the boot settles (__test.ready), the probe and hooks are restored, the term is inert with its law line, frame == off
    step capture-throwrender node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-throwrender" --tables $PRED,wpa_spec_9ft --look both --poses full34,cueball_level --flags venueThrow=render --poke-raw "$CONV_JS"
    step capture-throwreadback node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-throwreadback" --tables $PRED,wpa_spec_9ft --look both --poses full34,cueball_level --flags venueThrow=readback --poke-raw "$CONV_JS"
    # ORDER-LIGHT-FIX5 (review r9). conv = the normal boot's CONVERGED frame (the reference for the delayed-GI identity). P2#1: a 20 s GI
    # apply (?giDelay=20000, past the 15 s window) is WAITED for — arm = the pre-FIX5 rule (?venueGiWait=timeout) on the same delayed apply.
    # P2#2: a no-op readback (?venueReadNoop=1) is not derivable — arm = the pre-FIX5 rule (?venueReadCheck=off) accepting zeros. P3: after
    # a runtime throw a RERACK hooks nothing — arm = the pre-FIX5 wrapper rule (?venueHook=termonly). Predator only (the seams fire where a capture runs).
    RERACK_JS='rerack=window.__test.rerack(3)'
    # land8 (§L25): the shared-PMREM re-arm guard — a FIRST-TIME 2×2 environment cube (a table's own-cube class) generated after the boot,
    # then a rebake and a venue re-derive; the pre-fix rule (?pmremRearm=off) darkens the probe deterministically (Δpin 0.0124), the
    # guard keeps it on the pin; frames judged converged-vs-converged against the normal boot (conv set), arm = the off twin
    TINYENV_JS="tinyenv=$(cat tools/render/lib/poke-tinyenv.js)"  # own file: zsh single quotes keep \" literal (attempt-4 SyntaxError)
    step capture-pmremarm node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-pmremarm" --tables $PRED --look both --poses full34,cueball_level --poke-raw "$TINYENV_JS"
    step capture-pmremarmoff node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-pmremarmoff" --tables $PRED --look both --poses full34,cueball_level --flags pmremRearm=off --poke-raw "$TINYENV_JS"
    step capture-conv node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-conv" --tables $PRED --look both --poses full34,cueball_level --poke-raw "$CONV_JS"
    # ORDER-LIGHT-C2-FIX7 (the proportionate seal form): four converged-frame CONTROL sets of the two venue-term tables in both looks — A from the
    # PREVIOUS export's web root (OB_LIGHTING_WEB_PREV: the tree the reused sets were captured on), B from THIS export's, in both orders (A1 B1 B2 A2);
    # check-ctrl judges 0 changed pixels across every cell plus the fence's identity dumps (--room-strict). The env is required (fail-closed expansion).
    # ORDER-LIGHT-C2-FIX10 (maintainer ruling after land34 attempt 1): the CONTROL BLOCK alone waits for a quieter box than the chain's launch bar — the frozen A
    # web predates the settle law and its second boot moved under load 33 while B1 == B2 == A1. Operational bars, env-overridable, printed with their origin (the
    # launch bar 14 halved; the event-loop lag probe's quiet-box readings 1.2–1.5 ms): nice-0 RUNNABLE mean of 5 samples 2 s apart <= OB_CTRL_CALM_RUNNABLE and the
    # 2 s event-loop lag mean <= OB_CTRL_CALM_LAG_MS, sampled until both hold; bounded by OB_CTRL_CALM_MAX_MIN, after which the block FAILS by name (exit 23:
    # UNJUDGEABLE before capture) rather than asking a settle-blind instrument questions on a loud box.
    ctrl_calm_wait() {
      local bar=${OB_CTRL_CALM_RUNNABLE:-10} lag=${OB_CTRL_CALM_LAG_MS:-3} maxmin=${OB_CTRL_CALM_MAX_MIN:-20} t0=$(date +%s) tries=0 M L
      echo "[seal] control block: waiting for a quieter box — OPERATIONAL bars, not physics (maintainer 2026-09-14 16:2xZ): nice-0 runnable mean of 5 <= $bar (measured 16:20:07Z under the saturated runner: 12 15 10 10 5 = 10.4; a bar of 7 was unreachable), event-loop lag mean <= $lag ms (quiet-box probes 1.2–1.5 ms), bound $maxmin min; on timeout the block PROCEEDS — the A1-vs-A2 / B1-vs-B2 self-check judged right after the block is the arbiter, the bar only saves boots"
      while true; do
        tries=$((tries+1)); local S=(); local i; for i in 1 2 3 4 5; do S+=($(ps -axo nice=,stat= | awk '$1==0 && $2 ~ /^R/ {n++} END {print n+0}')); [ $i -lt 5 ] && sleep 2; done
        M=$(( (S[1]+S[2]+S[3]+S[4]+S[5]) / 5 ))
        L=$(node -e 'let n=0,sum=0,last=Date.now();const t=setInterval(()=>{const now=Date.now();sum+=now-last-10;last=now;n++;if(n>=200){clearInterval(t);console.log((sum/n).toFixed(1))}},10)' 2>/dev/null || echo 999)
        echo "[seal] control block calm sample $tries $(date -u +%T): runnable ${S[*]} mean $M, lag mean $L ms, load $(uptime | sed 's/.*averages*: *//')"
        if [ "$M" -le "$bar" ] && [ "$(printf '%.0f' "$L")" -le "$lag" ]; then echo "[seal] control block: quiet after $tries sample set(s) — capturing A1 B1 B2 A2 now"; return 0; fi
        if [ $(( $(date +%s) - t0 )) -ge $((maxmin*60)) ]; then echo "[seal] control block: bars not met after $maxmin min (runnable mean $M, lag $L ms) — proceeding; the self-check is the arbiter"; return 0; fi
        sleep 20
      done; }
    boot_load_note() { local S=() i; for i in 1 2 3 4 5; do S+=($(ps -axo nice=,stat= | awk '$1==0 && $2 ~ /^R/ {n++} END {print n+0}')); [ $i -lt 5 ] && sleep 2; done
      local L=$(node -e 'let n=0,sum=0,last=Date.now();const t=setInterval(()=>{const now=Date.now();sum+=now-last-10;last=now;n++;if(n>=200){clearInterval(t);console.log((sum/n).toFixed(1))}},10)' 2>/dev/null || echo 999)
      echo "[seal] control boot $1 at $(date -u +%T): nice-0 runnable ${S[*]} mean $(( (S[1]+S[2]+S[3]+S[4]+S[5]) / 5 )), event-loop lag mean $L ms, load $(uptime | sed 's/.*averages*: *//')"; }
    CTRL_CAPTURING=0; { [ -z "${OB_SEAL_CAPTURE_ONLY:-}" ] || case " $OB_SEAL_CAPTURE_ONLY " in *" ctrla1 "*) true;; *) false;; esac; } && CTRL_CAPTURING=1
    # ORDER-LIGHT-C2-FIX10 (land34/land35 attempt 1: two boots of ONE web accepted SH values differing by up to VENUE_CONVERGE_REL under load — the loop stops at the
    # first sub-tolerance round and a cold first bake moves that round): the four control boots run to the convergence FIXED POINT (venueConverge=strict: tolerance 0,
    # VENUE_CONVERGE_MAX rounds; supported identically by the branch web and by the frozen A web) — a STRICTER capture, symmetric on A and B, no tolerance in the judge.
    CTRL_FLAGS="${OB_CTRL_FLAGS:-venueConverge=strict}"
    # ORDER-LIGHT-C2-FIX10 condition 1 (maintainer 16:4xZ): strict must be shown to still DISAGREE — a fifth control boot of THIS export's web (the SENSITIVITY
    # boot) runs the same converged-frame poke and then moves ONE SH coefficient (obVenueSH[0], the L0 term, three channels) by 2e-5 relative = VENUE_CONVERGE_REL / 5,
    # a difference the shipped 1e-4 regime provably could not attribute; check-ctrl's sensitivity row (B2 vs ctrlsens) must go RED and name the cells, else the
    # instrument is BLIND below the floor and the control is UNJUDGEABLE. The poke text is DERIVED from CONV_JS here (one source: the converged-frame text never forks).
    CONV_TAIL="await w(600); window.__pokePending = false; })()"
    SENS_JS="${CONV_JS%"$CONV_TAIL"}await w(600); const pRel = 2e-5; let U = null; window.__dbg.scene.traverse((o) => { if (U) return; const m = o.material; if (!o.isMesh || !m || !m.userData || !m.userData.giSH) return; const mp = renderer.properties.get(m); const u = mp && mp.uniforms && mp.uniforms.obVenueSH; if (u && u.value && u.value.length === 27) U = u.value; }); if (!U) { window.__obCtrlPerturb = { error: 'no hooked obVenueSH uniform reachable from a ball material' }; } else { const before = [U[0], U[1], U[2]]; for (let k = 0; k < 3; k++) U[k] = U[k] * (1 + pRel); window.__obCtrlPerturb = { coeff: 'L0 = obVenueSH[0] (3 channels)', rel: pRel, before, after: [U[0], U[1], U[2]] }; } await w(120); window.__pokePending = false; })()"
    [ "$SENS_JS" != "$CONV_JS" ] && [ "${SENS_JS#"${CONV_JS%"$CONV_TAIL"}"}" != "$SENS_JS" ] || { echo "[seal] FAILED at derive-sens-poke exit 24 $(date -u +%FT%TZ) (the sensitivity poke could not be derived from CONV_JS: its tail changed — update CONV_TAIL with it)"; armverdict derive-sens-poke 24; exit 24; }
    [ $CTRL_CAPTURING = 1 ] && ctrl_calm_wait
    [ $CTRL_CAPTURING = 1 ] && boot_load_note ctrla1
    STEP_EXPORT="$(dirname "${OB_LIGHTING_WEB_PREV:-/nonexistent/web}"):$(git -C "$(dirname "${OB_LIGHTING_WEB_PREV:-/nonexistent/web}")" rev-parse --short=8 HEAD 2>/dev/null || echo NOGIT)"
    step capture-ctrla1 env OB_LIGHTING_WEB="${OB_LIGHTING_WEB_PREV:?the control needs the previous export web root (OB_LIGHTING_WEB_PREV)}" node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-ctrla1" --tables $PRED,wpa_spec_9ft --look both --poses full34,cueball_level --flags "$CTRL_FLAGS" --poke-raw "$CONV_JS"
    [ $CTRL_CAPTURING = 1 ] && boot_load_note ctrlb1
    step capture-ctrlb1 node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-ctrlb1" --tables $PRED,wpa_spec_9ft --look both --poses full34,cueball_level --flags "$CTRL_FLAGS" --poke-raw "$CONV_JS"
    [ $CTRL_CAPTURING = 1 ] && boot_load_note ctrlb2
    step capture-ctrlb2 node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-ctrlb2" --tables $PRED,wpa_spec_9ft --look both --poses full34,cueball_level --flags "$CTRL_FLAGS" --poke-raw "$CONV_JS"
    [ $CTRL_CAPTURING = 1 ] && boot_load_note ctrla2
    step capture-ctrla2 env OB_LIGHTING_WEB="${OB_LIGHTING_WEB_PREV:?the control needs the previous export web root (OB_LIGHTING_WEB_PREV)}" node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-ctrla2" --tables $PRED,wpa_spec_9ft --look both --poses full34,cueball_level --flags "$CTRL_FLAGS" --poke-raw "$CONV_JS"
    [ $CTRL_CAPTURING = 1 ] && boot_load_note ctrlsens
    step capture-ctrlsens node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-ctrlsens" --tables $PRED,wpa_spec_9ft --look both --poses full34,cueball_level --flags "$CTRL_FLAGS" --poke-raw "$SENS_JS"
    # ORDER-LIGHT-C2-FIX10 (maintainer, 16:3xZ — the finding land34 handed over: the control verdict was knowable at 15:51 and reported at 16:12, after the whole 166-step
    # block): check-ctrl consumes nothing but the four control sets (and the off set for its arm, captured earlier in this block) plus the A1/B1 identity dumps, so in a
    # CAPTURING run it is judged HERE, immediately after A2 — an instrument stop costs the block's nine minutes, not thirty. The regate-visible check-ctrl below still runs
    # (a --no-capture regate re-judges the same sets; a duplicate judgement of identical inputs is harmless and keeps the regate form whole).
    # condition 3 (maintainer 16:4xZ): ONE judge, two call sites — the same script with --stage early|regate; it prints its stage and the provenance of every input
    [ $CTRL_CAPTURING = 1 ] && step check-ctrl-early tools/render/lighting-check-ctrl.sh "$ROOT" "$TAG" --stage early
    # (land16 attempt 6 / first regate, offcheck-gidelay-on) the gidelay stimulus is DERIVED from the tree's own budget, not authored: the set proves
    # that an apply outstanding PAST the settle window is HELD and captured after (FIX5 P2#1), so the delay must exceed the window (main.js
    # VENUE_GI_WINDOW_MS) — and the hold that follows has the SAME budget, so the delay plus the apply's own arrival skew + bake must stay under
    # window + hold. The authored 20 s left (window + hold) − 20 s = 10 s for skew + bake; measured on this box the base boots used ~1 s of it
    # (held ≈ 6 s) and second boots under GPU contention (21–36 headless shells alive) 8 to > 10 s (held 12.9 s, then a timeout at 30.1 s
    # waited, twice in 12 boots incl. one at load1 30) — the set was measuring the box. Rule: delay = window × 1.1 (the studioqueuelong
    # "longer than the budget" derivation, sqWindowMs = 16500 = 15000 × 1.1), read from the tree at seal time; the census records the flag
    # (giDelayFlagMs) and the budget (venueBudgetMs) so the fixture is checkable per dump. Worst observed skew + bake (≈ 11 s) then holds
    # ≈ 12.5 s of the 15 s hold budget instead of timing out.
    GI_WINDOW_MS=$( (grep -oE "VENUE_GI_WINDOW_MS\s*=\s*[0-9]+" web/app/main.js || true) | grep -oE "[0-9]+$" | head -1 || true)  # C2-FIX7 audit: a missing constant is a witnessed refusal, not a silent abort
    [ -n "$GI_WINDOW_MS" ] || { echo "[seal] FAILED at derive-gi-window exit 9 (VENUE_GI_WINDOW_MS not found in web/app/main.js — the gidelay stimulus cannot be derived)"; exit 9; }
    [ -n "$GI_WINDOW_MS" ] && [ "$GI_WINDOW_MS" -gt 0 ] || { echo "[seal] gidelay: cannot read VENUE_GI_WINDOW_MS from web/app/main.js — the stimulus has no derivation"; exit 9; }
    GIDELAY_MS=$(( GI_WINDOW_MS + GI_WINDOW_MS / 10 ))
    echo "[seal] gidelay stimulus DERIVED: giDelay=${GIDELAY_MS} ms = VENUE_GI_WINDOW_MS ${GI_WINDOW_MS} × 1.1 (hold budget = the same ${GI_WINDOW_MS} ms)"
    step capture-gidelay node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-gidelay" --tables $PRED --look both --poses full34,cueball_level --flags "giDelay=${GIDELAY_MS}" --poke-raw "$CONV_JS"
    step capture-gidelayprefix node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-gidelayprefix" --tables $PRED --look both --poses full34,cueball_level --flags "giDelay=${GIDELAY_MS}&venueGiWait=timeout"
    # ORDER-LIGHT-FIX7 (review r11 P2 #1, lightingvisuals.js:1680): an UNTOUCHED identity default (explicit canopy_panel @ 1: `fixture=canopy_panel`;
    # the venue-default boot hangs the class lamp and is touched) switched green → SP must re-derive the venue probe — poke-raw `lookflip`
    # records the probe (venue.sh, the balls' obVenueSH source) before / after `__test.setLook('sp')`; `venueRegrade=touched` = the pre-FIX7
    # rule (identical before / after, no capture → the arm). The look system is a ONE-WAY regrade per page load (look.js: 'default' is valid
    # only before any switch), so the reverse SP → green has no in-page path — stated in §L27, not hidden; the fix is direction-free.
    LOOKFLIP_JS='lookflip=window.__pokePending = true; (async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const L = window.__lighting; const s0 = L.state(); const v0 = s0.venue || {}; const before = v0.sh ? Array.from(v0.sh) : null; const next = (s0.look === "sp" || s0.look === "tournament") ? "green" : "sp"; const ok = window.__test.setLook(next); await w(200); let s1 = L.state(); for (let i = 0; i < 600; i++) { s1 = L.state(); if (s1.venue && s1.venue.pending !== true && s1.venue.sh) break; await w(100); } const v1 = s1.venue || {}; const after = v1.sh ? Array.from(v1.sh) : null; let dmax = 0, amax = 0; if (before && after && before.length === after.length) { for (let i = 0; i < before.length; i++) { dmax = Math.max(dmax, Math.abs(after[i] - before[i])); amax = Math.max(amax, Math.abs(before[i])); } } window.__fix7Look = { from: s0.look, to: next, accepted: ok === true, touchedBefore: !!s0.touched, before, after, dmax, rel: amax > 0 ? dmax / amax : (dmax > 0 ? 1e9 : 0), capturesBefore: v0.captures == null ? null : v0.captures, capturesAfter: v1.captures == null ? null : v1.captures, lookAfter: s1.look, regradeMode: v1.regradeMode || null }; window.__pokeResult = window.__fix7Look; window.__pokePending = false; })()'
    step capture-lookswitch node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-lookswitch" --tables $PRED --look default --poses cueball_level,full34 --flags fixture=canopy_panel --poke-raw "$LOOKFLIP_JS"
    # ORDER-LIGHT-C2-FIX8 H3-4 red plant: the same boot under the fadd4ecb rule (?venueAccept=fix7) — a crossing cell degrades again
    step capture-lookswitchfix7 node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-lookswitchfix7" --tables $PRED --look default --poses cueball_level,full34 --flags "venueAccept=fix7&fixture=canopy_panel" --poke-raw "$LOOKFLIP_JS"
    # ORDER-LIGHT-C1 (review r1 P2 (a), gi.js:300): a FAILED live regrade lands on the documented pre-GI fallback before `settled` — never the
    # previous look's maps. `lookfail` = the same-key live regrade (green→SP through __test.setLook) with the asset fetch failing (giFail=assets:live:1:
    # only loads that start once state.ready), `lookthrow` = the look check throwing on the live apply (giFail=look:live:1: an ending outside the old
    # asset try), `lookfailnet` = the fixed app under a REAL network rejection injected by the poke (window.fetch rejects the probes JSON; no app seam),
    # `lookfailpre` = the PRE-C1 app (the 26d556d8 worktree's web, this lane's census) under the same network rejection — RECORD: the stale bake stays
    # bound (uGiOn 1) with loadError set — the finding; `livestall` = a live asset await that never settles (giStall=assets) — RECORD: no gi-side
    # ending exists (an open row). Arm for the judged rows = `lookswitch` (the same regrade succeeding: everything bound → RED).
    FETCHFAIL_JS='lookflip=window.__pokePending = true; (async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const L = window.__lighting; const G = window.__gi; const of = window.fetch; window.fetch = (u, ...a) => /probes/.test(String(u)) ? Promise.reject(new Error("arm lookfailnet: the probes fetch rejected (network-level, no app seam)")) : of(u, ...a); const s0 = L.state(); const next = (s0.look === "sp" || s0.look === "tournament") ? "green" : "sp"; const ok = window.__test.setLook(next); let s1 = L.state(); for (let i = 0; i < 400; i++) { await w(50); s1 = L.state(); const st = G && G.state; if (st && st.appliedSeq === st.applySeq && !(s1.venue && s1.venue.pending)) break; } window.__fix7Look = { from: s0.look, to: next, accepted: !!ok, lookAfter: s1.look, touchedBefore: !!s0.touched, capturesBefore: (s0.venue || {}).captures ?? 0, capturesAfter: (s1.venue || {}).captures ?? 0, rel: null, dmax: null }; window.fetch = of; window.__pokePending = false; })();'
    step capture-lookfail node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-lookfail" --tables $PRED --look default --poses cueball_level,full34 --flags "fixture=canopy_panel&giFail=assets:live:1" --poke-raw "$LOOKFLIP_JS"
    step capture-lookthrow node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-lookthrow" --tables $PRED --look default --poses cueball_level,full34 --flags "fixture=canopy_panel&giFail=look:live:1" --poke-raw "$LOOKFLIP_JS"
    step capture-lookfailnet node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-lookfailnet" --tables $PRED --look default --poses cueball_level,full34 --flags fixture=canopy_panel --poke-raw "$FETCHFAIL_JS"
    STEP_EXPORT="${OB_PREFIX10_TOOLING:-/tmp/ob-land-638/prefix10-26d556d8}:26d556d8"
    step capture-lookfailpre env OB_LIGHTING_WEB="${OB_PREFIX10_TOOLING:-/tmp/ob-land-638/prefix10-26d556d8}/web" node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-lookfailpre" --tables $PRED --look default --poses cueball_level,full34 --flags fixture=canopy_panel --poke-raw "$FETCHFAIL_JS"
    step capture-livestall node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-livestall" --tables $PRED --look default --poses cueball_level,full34 --flags "fixture=canopy_panel&giStall=assets" --poke-raw "$LOOKFLIP_JS"
    # ORDER-LIGHT-C1 (review r1 P2 (b), lightingvisuals.js:1681): READINESS INCLUDES EVERY QUEUED MUTATION. `degradehold` = a runtime degradation with
    # the leaf's re-bake debounce HELD (venueThrow=render&venueDebounce=hold): the degrade drops the queue (its own loop is the bake) → settled with
    # nothing queued; `dbq` = a held debounce armed by setVenue(false) from a raw poke that reads the app's readiness WHILE it is queued, then
    # releases it (flushRebake) — fixed: not ready while queued; `dbqlegacy` (+venueReadiness=legacy) = the pre-C1 readiness (ready while queued: the
    # arm); `dbq0px` / `dbq0pxlegacy` = the 0 px proof, in-page (below).
    DBQ_JS='dbq=window.__pokePending = true; (async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const L = window.__lighting; L.holdDebounce(true); L.setVenue(false); await w(50); const s = L.state().venue || {}; const rec = { queued: !!s.rebakeQueued, readyWhileQueued: !!window.__test.ready, pendingWhileQueued: !!s.pending }; rec.released = !!L.flushRebake(); await w(300); rec.readyAfter = !!window.__test.ready; rec.queuedAfter = !!(L.state().venue || {}).rebakeQueued; L.holdDebounce(false); window.__dbq = rec; window.__pokePending = false; })();'
    step capture-degradehold node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-degradehold" --tables $PRED --look default --poses cueball_level,full34 --flags "venueThrow=render&venueDebounce=hold"
    step capture-dbq node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-dbq" --tables $PRED --look default --poses cueball_level --poke-raw "$DBQ_JS"
    step capture-dbqlegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-dbqlegacy" --tables $PRED --look default --poses cueball_level --flags venueReadiness=legacy --poke-raw "$DBQ_JS"
    # the 0 px proof, IN-PAGE (one boot, two float readbacks of the live frame): under a 4000 ms debounce the poke queues a re-bake (setVenue(false)),
    # reads the frame at the FIRST moment __test.ready is true (C), waits past the debounce (D) and compares. Fixed: readiness arrives after the
    # bake fired (readyAtMs ≳ 4000) and C == D (max |Δ| 0, 0 px); `dbq0pxlegacy` (?venueReadiness=legacy): ready at once, the bake fires between
    # C and D → Δ > 0 — the frame a pre-C1 reader captured at readiness was about to change (the arm).
    DBQ0_JS='dbq0px=window.__pokePending = true; (async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const THREE = await import("three"); const L = window.__lighting; const read = () => { const r = window.__dbg.renderer, cam = window.__dbg.camera, sc = window.__dbg.scene; const W = r.domElement.width, H = r.domElement.height; const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType }); const prev = r.getRenderTarget(); r.setRenderTarget(rt); r.render(sc, cam); const buf = new Float32Array(W * H * 4); r.readRenderTargetPixels(rt, 0, 0, W, H, buf); r.setRenderTarget(prev); rt.dispose(); return buf; }; const t0 = performance.now(); L.setVenue(false); let readyAt = -1; for (let i = 0; i < 200; i++) { if (window.__test.ready) { readyAt = performance.now() - t0; break; } await w(50); } const C = read(); await w(5500); const D = read(); let mx = 0, n = 0; for (let i = 0; i < C.length; i += 4) { const d = Math.max(Math.abs(C[i] - D[i]), Math.abs(C[i + 1] - D[i + 1]), Math.abs(C[i + 2] - D[i + 2])); if (d > mx) mx = d; if (d > 1e-6) n++; } window.__dbq0 = { readyAtMs: Math.round(readyAt), maxDelta: mx, pctDiff: 100 * n / (C.length / 4), px: C.length / 4, queuedAtReady: null }; window.__pokePending = false; })();'
    step capture-dbq0px node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-dbq0px" --tables $PRED --look default --poses cueball_level --flags venueDebounce=hold:4000 --poke-raw "$DBQ0_JS"
    # ORDER-LIGHT-C2-FIX8 H3-4 red plant: the same boot under the fadd4ecb rule (?venueAccept=fix7) — a crossing cell degrades again
    step capture-dbq0pxfix7 node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-dbq0pxfix7" --tables $PRED --look default --poses cueball_level --flags "venueAccept=fix7&venueDebounce=hold:4000" --poke-raw "$DBQ0_JS"
    step capture-dbq0pxlegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-dbq0pxlegacy" --tables $PRED --look default --poses cueball_level --flags "venueDebounce=hold:4000&venueReadiness=legacy" --poke-raw "$DBQ0_JS"
    # ORDER-LIGHT-C2-FIX8 H3-4 red plant: the same boot under the fadd4ecb rule (?venueAccept=fix7) — a crossing cell degrades again
    step capture-dbq0pxlegacyfix7 node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-dbq0pxlegacyfix7" --tables $PRED --look default --poses cueball_level --flags "venueAccept=fix7&venueDebounce=hold:4000&venueReadiness=legacy" --poke-raw "$DBQ0_JS"
    # ORDER-LIGHT-C2-FIX8 H3-1 (the deterministic crossing pair ON THE EFFECTIVE CLOCK, seal form 2b after land26): a plain default boot whose loop has
    # NO convergence dependence — `venueConverge=off` (maxR 1: the loop stores the first capture, arms ONE seam-timed schedule, and accepts after the
    # second bake unconditionally) under a DERIVED spacing H. The first bake lands at t0 + H, the only schedule at t0 + 2H (t0 = the first arm, 646–794 ms
    # over the land24/25/26 dbq / h3bounded boots). Under ruling (B) the boot derives bounded r0 if the 15000 ms EFFECTIVE budget is crossed while that
    # schedule is pending: the first bake must land before B and the second after it for every stall in the band [0, S], S = 1803 ms (the dbq family's
    # largest stall on land25). Equal margins: B − (t0max + H) = (t0min + 2H − S) − B → H = (2B − t0max − t0min + S) / 3 = (30000 − 794 − 646 + 1803) / 3
    # = 10121 ms; margins 4085 ms on both sides. The fix7 twin (the fadd4ecb rule) degrades at B, inside the schedule's pending window [t0 + H, t0 + 2H]
    # = [10.8, 21.0] s wall for every stall in the band. WHY NOT the dbq form (land26 h3bounded, hold:4342 = the same arithmetic on "the loop converges
    # on the fourth bake"): the premise held only at hold:4000 — at 4342 the owed fourth schedule landed (18162 ms) and the loop re-armed a fifth
    # (rel > 1e-4 between the bakes at 9.5 s and 13.8 s) → unbounded r1 at 18431 ms; the venue SH probe of a static default boot drifts (smoke
    # 2026-09-13 18:19Z: rel 0.00746, bit-identical on two boots, between the bakes at 10.3 s and 20.5 s) — a convergence-dependent form is not
    # deterministic on this box. Smoked: two off-form boots derived bounded r0 at 20491 / 20458 ms wall (owed seq 2 due 20455 / 20453, bound 20507 /
    # 20505); the fix7 twin degraded at 15728 wall / 15024 effective. dbq0px / dbq0pxlegacy keep their C2X rows (H3 evidence rows).
    step capture-h3bounded node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-h3bounded" --tables $PRED --look default --poses cueball_level --flags "venueConverge=off&venueDebounce=hold:10121"
    step capture-h3boundedfix7 node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-h3boundedfix7" --tables $PRED --look default --poses cueball_level --flags "venueAccept=fix7&venueConverge=off&venueDebounce=hold:10121"
    # ORDER-LIGHT-C2-FIX9 class N2 (review r9 P3): the E1 rAF sampler must stop on EVERY terminal path of the capture state machine — three forms, each with its
    # ?venueSampler=legacy twin (the 6a076a6d tick: no stop on these exits, reschedules unconditionally): samplercancel = a pending apply (hold:16000) cancelled from
    # outside at 2 s (venueCancelAt → venue.on = false → the no-term apply); samplerfail = the runtime capture throw (venueThrow=render → the null-capture exit);
    # samplerhold = the GI-hold timeout (giStall=manifest → degradeOnHoldTimeout). The census reads samplerActive / samplerTicksSinceStop seconds later.
    step capture-samplercancel node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-samplercancel" --tables $PRED --look default --poses cueball_level --flags "venueDebounce=hold:16000&venueCancelAt=2000"
    step capture-samplercancellegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-samplercancellegacy" --tables $PRED --look default --poses cueball_level --flags "venueDebounce=hold:16000&venueCancelAt=2000&venueSampler=legacy"
    step capture-samplerfail node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-samplerfail" --tables $PRED --look default --poses cueball_level --flags venueThrow=render
    step capture-samplerfaillegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-samplerfaillegacy" --tables $PRED --look default --poses cueball_level --flags "venueThrow=render&venueSampler=legacy"
    step capture-samplerhold node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-samplerhold" --tables $PRED --look default --poses cueball_level --flags giStall=manifest
    step capture-samplerholdlegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-samplerholdlegacy" --tables $PRED --look default --poses cueball_level --flags "giStall=manifest&venueSampler=legacy"
    # ORDER-LIGHT-C2-FIX9 class N3 (refuter law F1): the owed schedule's bound on the loop-available clock with an ARMED timer pending. h3stallstraddle = the
    # convergence-free H3-1 form + ONE planted 900 ms main-thread stall starting 300 ms before the owed schedule's due (the refuter's smoke, declared as a seam):
    # the fixed rule derives bounded r0 with bakeCount 2; h3stallstraddlewall = the same boot under ?venueOwedClock=wall (the 6a076a6d rule) → degraded "overran".
    step capture-h3stallstraddle node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-h3stallstraddle" --tables $PRED --look default --poses cueball_level --flags "venueConverge=off&venueDebounce=hold:10121&venueStallStraddle=900"
    step capture-h3stallstraddlewall node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-h3stallstraddlewall" --tables $PRED --look default --poses cueball_level --flags "venueConverge=off&venueDebounce=hold:10121&venueStallStraddle=900&venueOwedClock=wall"
    step capture-lookswitchprefix node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-lookswitchprefix" --tables $PRED --look default --poses cueball_level --flags "fixture=canopy_panel&venueRegrade=touched" --poke-raw "$LOOKFLIP_JS"
    # ORDER-LIGHT-FIX7 (review r11 P2 #2, lightingvisuals.js:1282): a GI manifest request that STALLS (never settles: `giStall=manifest`) — the
    # hold is bounded by FIX5's window (VENUE_GI_WINDOW_MS): readiness on the legacy probe at window + hold, gi-hold-timeout named on the
    # census, a WATCH armed for the late completion; the pre-FIX7 rule (`venueGiHold=forever`) never settles = seal arm gistallforever.
    # `gilate` = a GI apply that lands AFTER the bound (giDelay=40000 > 2 × window): the watch re-derives the probe (poke-raw latewait
    # waits for it); FIX5's gidelay set (giDelay=20000, inside the hold) is the in-window late completion — cited, not duplicated.
    # ORDER-LIGHT-COMPANION (review r12 P2, lightingvisuals.js:1213): the stalled-GI timeout now DEGRADES (venue off for the table — probe,
    # dressing, shading together, through main.js's one degradeVenue) instead of restoring the 9.91 probe under the class room; full34 is
    # captured so the room reads (pairs-room-gistall vs the main baseline) prove the legacy envelope, not the ~10× hybrid. `gistallpre` = the
    # SAME boot on the pre-companion app (the 2eab3fad worktree, served from its own web/ through lighting-capture-from.sh): the hybrid, RECORDED.
    step capture-gistall node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-gistall" --tables $PRED --look both --poses cueball_level,full34 --flags giStall=manifest
    # refuter round: the OFF TWIN of every degraded boot (?venue=off from boot under the same condition) — the legacy envelope a degraded boot must
    # equal: its room pairs are JUDGED against this twin (a GI-stalled floor has no lightmap; a boot without the rig leaf has no fixture rig — neither
    # is main's GI-lit, rig-lit baseline) and its post-degrade frame is RECORDED against the twin's converged frame (offcheck-*-onoff, --main-sub conv;
    # every twin carries the conv sub-run). The GI twin is `?nogi&venue=off`: a `?venue=off&giStall=manifest` boot never settles for the capture tool
    # (GI requested, never ready, nothing records the stall under venue off — main's path), and a disabled GI is the same shader state as a stalled one
    # (giOn 0, giReady 0, uGiIrr 2 in both census)
    step capture-gistalloff node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-gistalloff" --tables $PRED --look both --poses cueball_level,full34 --flags "nogi&venue=off" --poke-raw "$CONV_JS"
    STEP_EXPORT="${OB_PREFIX8_TOOLING:-/tmp/ob-land-638/prefix8-2eab3fad}:2eab3fad"
    step capture-gistallpre env -u OB_LIGHTING_PORT -u OB_LIGHTING_CDP -u OB_LIGHTING_BAND_START -u OB_LIGHTING_BAND_END tools/render/lighting-capture-from.sh "${OB_PREFIX8_TOOLING:-/tmp/ob-land-638/prefix8-2eab3fad}" --out "$PWD/$ROOT/after-$TAG-gistallpre" --tables $PRED --look default --poses cueball_level,full34 --flags giStall=manifest
    # gilate: a GI apply landing AFTER the bound — under the companion the boot is already DEGRADED and stays legacy (the FIX7 watch is
    # superseded by the degrade); latewait waits for the GI runtime to be ready, then reads the state
    LATEWAIT_JS='latewait=window.__pokePending = true; (async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const G = window.__gi; let s = null; for (let i = 0; i < 900; i++) { s = G && G.state; if (s && s.ready && (s.appliedSeq || 0) >= 1) break; await w(100); } await w(1500); const L = window.__lighting; const v = (L && L.state().venue) || {}; window.__pokeResult = { giReady: !!(s && s.ready), derived: !!v.derived, on: v.on, pending: v.pending === true, degraded: !!(window.__venueDegrade) }; window.__pokePending = false; })()'
    step capture-gilate node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-gilate" --tables $PRED --look default --poses cueball_level --flags giDelay=40000 --poke-raw "$LATEWAIT_JS"
    # ORDER-LIGHT-COMPANION (review r12 P1, main.js:330-331): an optional leaf import that STALLS is bounded by the ONE budget; the app is ready
    # on the legacy path with the stalled leaf named (`leafStall=venueflag` = a boot leaf; `leafStall=lightingvisuals` = the dynamic rig leaf,
    # which the settle predicate reads through the protocol verdict since the leaf never lands); the pre-companion rule (`leafBound=off`)
    # never reaches __test at all = seal arm leafstallforever
    step capture-leafstall node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-leafstall" --tables $PRED --look default --poses cueball_level,full34 --flags leafStall=venueflag
    step capture-leafstall2 node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-leafstall2" --tables $PRED --look default --poses cueball_level,full34 --flags leafStall=lightingvisuals
    # refuter round (COMPANION): a table whose GI maps are keyed to a NON-canopy fixture (snooker → snooker_luminaire) with the rig leaf stalled — the
    # bound must re-pin the maps to main's canopy rig (census giFixture); `leafstall3pre` = the 4ea6b55f app under the same stall (RECORD: the maps
    # left on the luminaire under the canopy rig), captured by THIS lane's tool from a detached worktree of that commit
    step capture-leafstall2off node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-leafstall2off" --tables $PRED --look default --poses cueball_level,full34 --flags "leafStall=lightingvisuals&venue=off" --poke-raw "$CONV_JS"
    step capture-leafstall3 node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-leafstall3" --tables wpbsa_snooker_12ft --look default --poses cueball_level --flags leafStall=lightingvisuals
    step capture-leafstall3off node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-leafstall3off" --tables wpbsa_snooker_12ft --look default --poses cueball_level --flags "leafStall=lightingvisuals&venue=off" --poke-raw "$CONV_JS"
    STEP_EXPORT="${OB_PREFIX9_TOOLING:-/tmp/ob-land-638/prefix9-4ea6b55f}:4ea6b55f"
    step capture-leafstall3pre tools/render/lighting-capture-from.sh "${OB_PREFIX9_TOOLING:-/tmp/ob-land-638/prefix9-4ea6b55f}" --out "$PWD/$ROOT/after-$TAG-leafstall3pre" --tables wpbsa_snooker_12ft --look default --poses cueball_level --flags leafStall=lightingvisuals
    step capture-readnoop node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-readnoop" --tables $PRED --look both --poses full34,cueball_level --flags venueReadNoop=1 --poke-raw "$CONV_JS"
    step capture-readnoopprefix node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-readnoopprefix" --tables $PRED --look both --poses full34,cueball_level --flags "venueReadNoop=1&venueReadCheck=off"
    step capture-throwrerack node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-throwrerack" --tables $PRED --look both --poses full34,cueball_level --flags venueThrow=render --poke-raw "$RERACK_JS"
    step capture-throwrerackprefix node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-throwrerackprefix" --tables $PRED --look both --poses full34,cueball_level --flags "venueThrow=render&venueHook=termonly" --poke-raw "$RERACK_JS"
    # ORDER-LIGHT-C1 (review r1 P3, shading.js:2251): the INJECTED WeakRef set is bounded by the live materials — the churn poke registers 200
    # throwaway materials through the real injectAnalytic and disposes them; `churn` = the fixed rule (size unchanged), `churnoff`
    # (?injectedPrune=off) = the pre-C1 rule (the set grows by 200) — the red arm of the C1-churn-* rows
    CHURN_JS='churn=window.__venueChurn = window.__venueShading.churn(200)'
    step capture-churn node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-churn" --tables $PRED --look default --poses cueball_level --poke-raw "$CHURN_JS"
    step capture-churnoff node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-churnoff" --tables $PRED --look default --poses cueball_level --flags injectedPrune=off --poke-raw "$CHURN_JS"
    # ORDER-LIGHT-C2 (a) (review r2 P2, shading.js:2203): THE GI WEIGHT FOLLOWS THE ACTIVE RIG. One boot of the GI-backed Predator canopy
    # rig, then three pokes in that boot: `studio` installs the REAL cinematic-export rig (web/app/cinelight.js installCineLight over
    # window.__dbg's scene / renderer / camera / cubeCam and the live ball meshes — rect lights re-normalized to the recipe's 7.6 total,
    # rims, world crush, exposure, a private env cube; the announce flips window.__cinelight and dispatches ob:cinelight), `studiodim50`
    # and `studiodim25` install the same rig with its visible RectAreaLights scaled to 0.5 / 0.25 of the installed values (ONE BOOT PER
    # CELL — see below). The reads' cue-ball CROWN band luminance must FALL at each step by more than 2^-8 relative (gate C2-studio-mono-*;
    # the boot-to-boot floor is measured by studionoop and judged at 2^-10; the rims are PointLights and stay). Sets: studio = the fixed
    # app; studiolegacy = the same boot with ?rectDiffuse=legacy (main's rect-diffuse chunk verbatim on the ball programs: the documented
    # pre-GI direct term) — the fixed app under the rig must equal it pixel for pixel (offcheck-studio-legacy-*); studiopre = the PRE-C2
    # app (the c9e44692 negative control, this tooling) under the same rig — must NOT equal it (the arm2 of those offchecks) and reads
    # uGiOn 1 under the rig (the C2-studio-gioff arm); studionoop = the dim pokes at factor 1 (rel reads exactly 1: the mono rows' arm).
    # Each poke is its OWN boot (the capture tool boots per run), so every studio cell installs the rig itself and then scales the rig's
    # visible RectAreaLights by its factor (1, 0.5, 0.25); rel rows compare cells ACROSS boots — the studionoop set (factor 1 under the
    # dim labels) measures the boot-to-boot floor of that comparison and arms the mono rows (rel ≈ 1 → RED).
    STUDIO_JS="studio=$STUDIO_FN __obStudioRun(1);"
    STUDIODIM50_JS="studiodim50=$STUDIO_FN __obStudioRun(0.5);"
    STUDIODIM25_JS="studiodim25=$STUDIO_FN __obStudioRun(0.25);"
    STUDIONOOP50_JS="studiodim50=$STUDIO_FN __obStudioRun(1);"
    STUDIONOOP25_JS="studiodim25=$STUDIO_FN __obStudioRun(1);"
    # refuter P2 arms (hemi ownership across the window): studiolate = a bind that lands INSIDE the window (gi.reapply(), the C2 test seam) and
    # then the revert — the room must come back bound with the hemi at the bake's dim of the BUILD value (studioHemiRatio 1 = hemi now / hemi
    # before the install, both the bound dim; pre-fix: hemiBase captured from the studio hemi → 0.05 → ratio 0.45); studiofail = the bake
    # LEAVES inside the window (a live look apply that fails: ?giFail=look:live:1 + G.reapply(), the B21 re-arm of the setLook poke, see
    # STUDIOFAIL_JS → settleOnError → neutralize → restoreRoom's suspended branch) and then the revert — the hemi must be restored to its
    # base (ratio 2 = base / the bound dim); pre-C2: restoreRoom writes the base hemi INSIDE the window and cinelight's revert then restores
    # its snapshot of the dim → ratio 1, GI off, no bake.
    # (A table switch off the baked footprint was the first idea — settings.changeEquipment refuses a table outside the active game's class.)
    STUDIOLATE_JS="studiolate=$STUDIO_FN __obStudioRun(1, async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const G = window.__gi; await G.reapply(); for (let i = 0; i < 100 && G.state.appliedSeq !== G.state.applySeq; i++) await w(100); window.__studio.handle.revert(); window.__studio.reverted = true; await w(300); });"
    step capture-studio node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-studio" --tables $PRED --look default --poses cueball_level,full34 --flags fixture=canopy_panel --poke-raw "$STUDIO_JS" --poke-raw "$STUDIODIM50_JS" --poke-raw "$STUDIODIM25_JS"
    step capture-studiolegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-studiolegacy" --tables $PRED --look default --poses cueball_level,full34 --flags "fixture=canopy_panel&rectDiffuse=legacy" --poke-raw "$STUDIO_JS" --poke-raw "$STUDIODIM50_JS" --poke-raw "$STUDIODIM25_JS"
    STEP_EXPORT="${OB_PREFIX11_TOOLING:-/tmp/ob-land-638/prefix11-c9e44692}:c9e44692"
    step capture-studiopre env OB_LIGHTING_WEB="${OB_PREFIX11_TOOLING:-/tmp/ob-land-638/prefix11-c9e44692}/web" node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-studiopre" --tables $PRED --look default --poses cueball_level,full34 --flags fixture=canopy_panel --poke-raw "$STUDIO_JS" --poke-raw "$STUDIODIM50_JS" --poke-raw "$STUDIODIM25_JS"
    step capture-studionoop node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-studionoop" --tables $PRED --look default --poses cueball_level,full34 --flags fixture=canopy_panel --poke-raw "$STUDIO_JS" --poke-raw "$STUDIONOOP50_JS" --poke-raw "$STUDIONOOP25_JS"
    # ORDER-LIGHT-C2-FIX9 class N1 (review r9 P2): the venue fill inside the cinelight studio window. The seal's studio form (predator, fixture=canopy_panel, the REAL
    # rig via the studio poke) three ways: studiofill = venue ON, gain 1, with a second poke `studiorevert` (install → revert → the deferred bake and the parked
    # capture settle → the tool captures the FIRST gameplay frame after the window); studiofill0 = the same boot with setVenueFill(0) BEFORE the rig; studiofilllegacy
    # = ?venueStudioGate=legacy (the 6a076a6d rule: the fill stays live in the window — the arm). check-studiofill judges: studio frames of studiofill vs studiofill0
    # identical (float + PNG), the UNGATED studiofilllegacy vs studiofill0 frames DIFFERENT (the not-dead control — every poke is its own boot, so the sets' base frames are the same gain-1 boot), studiofill base vs studiorevert PNG-identical (HDR recorded). Measured before
    # the fix (2026-09-14 00:24Z): the in-window frames differed on 16116 px (8.39 % of cueball_level, max |Δ| 0.00406) and 326 px of full34, PNG bytes differ.
    STUDIOREVERT_JS="studiorevert=$STUDIO_FN __obStudioRun(1, async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); await w(300); const h = window.__studio && window.__studio.handle; if (h && typeof h.revert === 'function') h.revert(); const L = window.__lighting; const t0 = performance.now(); while (performance.now() - t0 < 20000) { const v = L.state().venue; if (window.__cinelight !== true && v && v.pending !== true && v.rebakeQueued !== true) break; await w(100); } await w(300); window.__studioRevert = { reverted: window.__cinelight !== true, waitedMs: Math.round(performance.now() - t0) }; });"
    STUDIOGAIN0_JS="studio=$STUDIO_FN window.__studioGain0 = window.__lighting.setVenueFill(0); __obStudioRun(1);"
    step capture-studiofill node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-studiofill" --tables $PRED --look default --poses cueball_level,full34 --flags fixture=canopy_panel --poke-raw "$STUDIO_JS" --poke-raw "$STUDIOREVERT_JS"
    # ORDER-LIGHT-C2-FIX10 class Z sets (predator default cueball_level; the identity dump is the subject): giball = ball GI toggled 1 → 0 on the live page
    # before the dump (the record MUST move: fence A1 vs giball must red); absentkey = the uGiBallOn reader broken in memory (the key vanishes: the fence
    # must red NAMING it); giballreader (arm-only) = the pre-FIX10 gv() reader (the key is never written: the fence must NOT red without the census — the
    # giballreader arm proves the reader fix is what moves the record)
    step capture-giball node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-giball" --tables $PRED --look default --poses cueball_level --flags identityGiBall=0
    step capture-absentkey node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-absentkey" --tables $PRED --look default --poses cueball_level --flags identityDropKey=uGiBallOn
    step capture-giballreader node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-giballreader" --tables $PRED --look default --poses cueball_level --flags "identityGiBall=0&identityGiBallReader=legacy"
    # ctrla1reader: the A control web (OB_LIGHTING_WEB_PREV) dumped under the pre-FIX10 reader — with giballreader it reproduces the pre-FIX10 pair exactly: the key
    # absent on BOTH sides, so no diff row can arise and only the expected-key census can red (the shape of the maintainer's erratum)
    step capture-ctrla1reader env OB_LIGHTING_WEB="${OB_LIGHTING_WEB_PREV:?the control needs the previous export web root (OB_LIGHTING_WEB_PREV)}" node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-ctrla1reader" --tables $PRED --look default --poses cueball_level --flags identityGiBallReader=legacy
    # ORDER-LIGHT-C2-FIX10 class B sets: ballift = one ball lifted 0.4 m (above the old 0.25 m filter) for the venue capture under the MARKER rule — the
    # room SH must equal the plain boot's within VENUE_CONVERGE_REL; balliftlegacy = the same lift under the pre-FIX10 HEIGHT rule (the arm: the airborne
    # ball enters the probe and the SH differs)
    # ORDER-LIGHT-C2-FIX10 class B, ruling 2026-09-14 19:1xZ (land38 gate): the lift is compared at the convergence FIXED POINT — both class-B captures run under
    # venueConverge=strict and their pairs read the strict plain control ctrlb2 (the same cell of the same web) instead of the base set: under the shipped law the
    # accepted SH varies boot to boot by up to 2.5e-3 (the base boot after38 vs the fixed point), 25x the row's tolerance, so a two-boot comparison there measured
    # the base boot's drift and not the lift (whose effect on the room-only probe measured exactly 0 across every fixed-point boot)
    step capture-ballift node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-ballift" --tables $PRED --look default --poses cueball_level --flags "venueBallLift=0.4&venueConverge=strict"
    step capture-balliftlegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-balliftlegacy" --tables $PRED --look default --poses cueball_level --flags "venueBallLift=0.4&venueBallHide=height&venueConverge=strict"
    step capture-studiofill0 node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-studiofill0" --tables $PRED --look default --poses cueball_level,full34 --flags fixture=canopy_panel --poke-raw "$STUDIOGAIN0_JS"
    step capture-studiofilllegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-studiofilllegacy" --tables $PRED --look default --poses cueball_level,full34 --flags "fixture=canopy_panel&venueStudioGate=legacy" --poke-raw "$STUDIO_JS"
    step capture-studiolate node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-studiolate" --tables $PRED --look default --poses cueball_level --flags fixture=canopy_panel --no-base --poke-raw "$STUDIOLATE_JS"
    step capture-studiofail node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-studiofail" --tables $PRED --look default --poses cueball_level --flags "fixture=canopy_panel&giFail=look:live:1" --no-base --poke-raw "$STUDIOFAIL_JS"
    STEP_EXPORT="${OB_PREFIX11_TOOLING:-/tmp/ob-land-638/prefix11-c9e44692}:c9e44692"
    step capture-studiofailpre env OB_LIGHTING_WEB="${OB_PREFIX11_TOOLING:-/tmp/ob-land-638/prefix11-c9e44692}/web" node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-studiofailpre" --tables $PRED --look default --poses cueball_level --flags "fixture=canopy_panel&giFail=look:live:1" --no-base --poke-raw "$STUDIOFAIL_PRE_JS"
    # C2-FIX1 A(ii): the same failed-apply boot under the LEGACY park budget (no resumeAwaitingBake, so no bake owed: resumeCaptureAfterBake 0,
    # resumeBakeOwed 0) — the arm twin of the C2F-studiofail-resumebake* rows
    step capture-studiofaillegacypark node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-studiofaillegacypark" --tables $PRED --look default --poses cueball_level --flags "fixture=canopy_panel&giFail=look:live:1&venueParkBudget=legacy" --no-base --poke-raw "$STUDIOFAIL_JS"
    # ORDER-LIGHT-C2-FIX1 class A (review r3 P2, lightingvisuals.js:1353): the venue capture / re-bake queues never run inside the studio window.
    # ONE boot, two rounds: (ref) a PLAIN reapply — queued behind a HELD debounce (setVenue(true): the capture attempt waits for rigQuiet),
    # released, settled → Href / Sref (the gameplay cubemap's six-face hash and venue.sh a re-derivation lands on); (window) the same reapply
    # queued, the rig installed INSIDE the pending window, the hold released and the bake flushed while the window is up (the pre-FIX1 leaf
    # bakes the studio world into the gameplay cube and captures under the rig HERE), revert, settle → H1 / S1. Fixed leaf: nothing baked or
    # captured inside the window (Hmid == Href, capturesInWindow 0) and the deferred bake + parked capture reproduce the plain reapply
    # (cubeSame 1, venue.sh within the capture's own convergence tolerance). studioqueuepre = the pre-FIX1 app (prefix12) — the arm.
    # (smoke 1 on the fixed leaf: nothing baked / captured inside the window, but the post-revert re-derivation differed from the BOOT values by
    # 1.2 % on the cube's face means — a re-derivation is not the boot state (the boot converged from a cold cube; a later reapply converges
    # from the warm one). The reference is therefore a PLAIN reapply in the same boot, run first: the windowed reapply must reproduce it.)
    STUDIOQUEUE_JS='studioqueue=window.__pokePending = true; (async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const d = window.__dbg, L = window.__lighting; const N = d.cubeRT.width; const buf = new Uint16Array(N * N * 4); const fnv = (b) => { let h = 0x811c9dc5; for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }; const h2f = (h) => { const sg = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff; if (e === 0) return sg * Math.pow(2, -14) * (m / 1024); if (e === 31) return m ? NaN : sg * Infinity; return sg * Math.pow(2, e - 15) * (1 + m / 1024); }; const cube = () => { const parts = [], means = [], raw = []; for (let f = 0; f < 6; f++) { d.renderer.readRenderTargetPixels(d.cubeRT, 0, 0, N, N, buf, f); parts.push(fnv(new Uint8Array(buf.buffer)).toString(16)); raw.push(Uint16Array.from(buf)); let sum = 0, n = 0; for (let k = 0; k < buf.length; k += 16) { sum += h2f(buf[k]) + h2f(buf[k + 1]) + h2f(buf[k + 2]); n += 3; } means.push(sum / n); } return { hash: parts.join(":"), means, raw }; }; const shOf = () => { const v = L.state().venue; return v && v.sh ? Array.from(v.sh) : null; }; const shDiff = (A, B) => { if (!A || !B || A.length !== B.length) return { l2: null, dc: null }; let d2 = 0, n2 = 0, dcMax = 0; const dcRef = Math.max(Math.abs(A[0]), Math.abs(A[1] ?? 0), Math.abs(A[2] ?? 0), 1e-6); for (let i = 0; i < A.length; i++) { const e = B[i] - A[i]; d2 += e * e; n2 += A[i] * A[i]; dcMax = Math.max(dcMax, Math.abs(e) / dcRef); } return { l2: Math.sqrt(d2) / Math.max(Math.sqrt(n2), 1e-9), dc: dcMax }; }; const meanDiff = (A, B) => { let m = 0; for (let f = 0; f < 6; f++) m = Math.max(m, Math.abs(B.means[f] - A.means[f]) / Math.max(Math.abs(A.means[f]), 1e-9)); return m; }; const texDiff = (A, B) => { let mx = 0, n = 0, tot = 0; for (let f = 0; f < 6; f++) { const a = A.raw[f], b = B.raw[f]; for (let k = 0; k < a.length; k += 4) { for (let c = 0; c < 3; c++) { const dd = Math.abs(h2f(a[k + c]) - h2f(b[k + c])); if (dd > mx) mx = dd; if (dd > 1e-4) { n++; break; } } tot++; } } return { maxAbs: mx, fracOver1e4: n / tot }; }; const settle = async () => { for (let i = 0; i < 150; i++) { const v = L.state().venue; if (v && v.pending !== true && v.rebakeQueued !== true) break; await w(100); } await w(600); }; const C0 = cube(), S0 = shOf(); const capA = L.state().venue.captures || 0; L.holdDebounce(true); L.setVenue(true); await w(250); L.holdDebounce(false); L.flushRebake(); await settle(); const Cref = cube(), Sref = shOf(); const capB = L.state().venue.captures || 0; L.holdDebounce(true); L.setVenue(true); await w(250); const m = await import("/app/cinelight.js"); const hd = m.installCineLight({ scene: d.scene, renderer: d.renderer, camera: d.camera, cubeCam: d.cubeCam, ballMeshes: (window.__test && window.__test.ballMeshes) ? window.__test.ballMeshes() : [] }); await w(200); L.holdDebounce(false); L.flushRebake(); const winMs = Number(new URLSearchParams(location.search).get("sqWindowMs")) || 1500; await w(winMs); const Cmid = cube(); const stMid = L.state().venue || {}; hd.revert(); await w(300); await settle(); const C1 = cube(), S1 = shOf(), v1 = L.state().venue || {}; const tol = Number.isFinite(v1.convergeRel) ? v1.convergeRel : 1e-4; const dRef = shDiff(S0, Sref), dWin = shDiff(Sref, S1); const td = texDiff(Cref, C1), tdm = texDiff(Cref, Cmid); const mmr = meanDiff(Cref, C1); window.__studioQueue = { windowMs: winMs, resumeCaptureAfterBake: v1.resumeCaptureAfterBake ?? null, parkedMs: v1.parkedMs ?? null, cubeWithinTol: mmr <= tol ? 1 : 0, cubeMaxAbs: td.maxAbs, cubeFracOver1e4: td.fracOver1e4, midMaxAbs: tdm.maxAbs, midFracOver1e4: tdm.fracOver1e4, cubeSame: Cref.hash === C1.hash ? 1 : 0, cubeSameVsBoot: C0.hash === C1.hash ? 1 : 0, refSameAsBoot: C0.hash === Cref.hash ? 1 : 0, bakedInWindow: (Cmid.hash !== Cref.hash && meanDiff(Cref, Cmid) > tol) ? 1 : 0, capturesInWindow: (stMid.captures || 0) - capB, capturesAfter: (v1.captures || 0) - capB, capturesRef: capB - capA, shL2Rel: dWin.l2, shDcRel: dWin.dc, shWithinTol: (dWin.l2 !== null && dWin.l2 <= tol) ? 1 : 0, refShL2Rel: dRef.l2, refShDcRel: dRef.dc, tol, meanMaxRel: mmr, refMeanMaxRel: meanDiff(C0, Cref), rigWindowMid: stMid.rigWindow === true ? 1 : 0, deferredMid: stMid.rebakeDeferred === true ? 1 : 0, parkedMid: stMid.rigParked || 0, H0: C0.hash, Href: Cref.hash, Hmid: Cmid.hash, H1: C1.hash }; window.__pokeResult = { ok: true }; window.__pokePending = false; })().catch((e) => { window.__pokeResult = { error: "studioqueue: " + String(e && e.message || e) }; window.__pokePending = false; });'
    step capture-studioqueue node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-studioqueue" --tables $PRED --look default --poses cueball_level --flags fixture=canopy_panel --no-base --poke-raw "$STUDIOQUEUE_JS"
    STEP_EXPORT="${OB_PREFIX12_TOOLING:-/tmp/ob-land-638/prefix12-df17fb67}:df17fb67"
    step capture-studioqueuepre env OB_LIGHTING_WEB="${OB_PREFIX12_TOOLING:-/tmp/ob-land-638/prefix12-df17fb67}/web" node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-studioqueuepre" --tables $PRED --look default --poses cueball_level --flags fixture=canopy_panel --no-base --poke-raw "$STUDIOQUEUE_JS"
    # (refuter P2) a window LONGER than the settle budget (VENUE_GI_WINDOW_MS 15 s): the park must pause the budget and the first capture after the
    # resume must follow a post-resume bake — studioqueuelong (16.5 s window) on the fixed leaf; studioqueuelonglegacy = the same window under
    # ?venueParkBudget=legacy (the pre-fix rule: the budget keeps counting through the park, the resumed capture reads the stale cube) — the arm
    step capture-studioqueuelong node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-studioqueuelong" --tables $PRED --look default --poses cueball_level --flags "fixture=canopy_panel&sqWindowMs=16500" --no-base --poke-raw "$STUDIOQUEUE_JS"
    step capture-studioqueuelonglegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-studioqueuelonglegacy" --tables $PRED --look default --poses cueball_level --flags "fixture=canopy_panel&sqWindowMs=16500&venueParkBudget=legacy" --no-base --poke-raw "$STUDIOQUEUE_JS"
    # ORDER-LIGHT-C2-FIX2 class A — the LIFECYCLE fixture: a shot is played and settles (main's own path samples the SH blocks: ballset.js
    # syncSphereUniforms → gi.updateBallProbes(balls, 'main')), then a venue capture is FORCED to fail at runtime (the armThrow seam + setVenue(true)
    # re-derives → the cube render throws → main.js degradeVenue → gi.setVenueShading(false)). Pre-fix: every block zeroed (blocks 0, the balls'
    # SH irradiance gone until the next move); fixed: the played table keeps its sampled blocks. lifecyclelegacy = ?venueDegradeBlocks=legacy (the arm).
    LIFECYCLE_JS='lifecycle=window.__pokePending = true; (async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const T = window.__test, L = window.__lighting, G = window.__gi; const blocks = () => { try { return G.probeState().ballBlocksNonZero; } catch (e) { return -1; } }; const shs = () => (T.ballMeshes ? T.ballMeshes() : []).map((m) => { const sh = m && m.material && m.material.userData && m.material.userData.giSH; return sh && sh.value ? Array.from(sh.value) : null; }); const shDelta = (A, B) => { let mx = 0; for (let i = 0; i < A.length; i++) { if (!A[i] || !B[i]) continue; for (let k = 0; k < A[i].length; k++) mx = Math.max(mx, Math.abs(A[i][k] - B[i][k])); } return mx; }; const blocksBoot = blocks(); T.shoot({}); await w(300); for (let i = 0; i < 600 && T.state() === "PLAYBACK"; i++) await w(100); const shot = T.state() !== "PLAYBACK"; await w(600); const blocksBefore = blocks(), shBefore = shs(); const armed = L.armThrow ? L.armThrow("render") : null; L.setVenue(true); for (let i = 0; i < 300 && !window.__venueDegrade; i++) await w(100); await w(400); const blocksAfter = blocks(), shAfter = shs(); const ps = G.probeState(); window.__lifecycle = { shot, state: T.state(), blocksBoot, blocksBefore, blocksAfter, shMaxDelta: shDelta(shBefore, shAfter), degraded: !!window.__venueDegrade, why: window.__venueDegrade ? String(window.__venueDegrade.why).slice(0, 80) : null, armed, mode: ps.degradeBlocksMode || null, fromMain: !!ps.ballBlocksFromMain }; window.__pokeResult = { ok: true }; window.__pokePending = false; })().catch((e) => { window.__pokeResult = { error: "lifecycle: " + String(e && e.message || e) }; window.__pokePending = false; });'
    step capture-lifecycle node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-lifecycle" --tables $PRED --look default --poses cueball_level --no-base --poke-raw "$LIFECYCLE_JS"
    step capture-lifecyclelegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-lifecyclelegacy" --tables $PRED --look default --poses cueball_level --flags venueDegradeBlocks=legacy --no-base --poke-raw "$LIFECYCLE_JS"
    # ORDER-LIGHT-C2-FIX2 class B — the public __rebakeEnv seam across TWO overlapping studio windows on a table WITHOUT a derived venue capture
    # (?venue=off: the leaf's own queue does not cover it): a request inside window A, A closes (the 120 ms debounce is armed), B opens inside
    # it, B closes — pre-fix the timer skipped its bake and the flag was already cleared (0 bakes, the request dropped); fixed: exactly ONE
    # bake after the last close. rebakedeferlegacy = ?venueRebakeDefer=legacy (the arm); rebakesingle = one window (unchanged: 1 bake).
    REBAKE_FN='const __obInstall = async () => { const d = window.__dbg; const m = await import("/app/cinelight.js"); return m.installCineLight({ scene: d.scene, renderer: d.renderer, camera: d.camera, cubeCam: d.cubeCam, ballMeshes: (window.__test && window.__test.ballMeshes) ? window.__test.ballMeshes() : [] }); }; const __obRebakeRun = (windows, body) => { window.__pokePending = true; (async () => { const R = window.__rebakeEnv; const b0 = R.bakes || 0; const tClose = await body(); await new Promise((r) => setTimeout(r, 700)); window.__rebakeProbe = { bakes: (R.bakes || 0) - b0, windows, delayMs: (R.lastBakeAt && tClose) ? Math.round(R.lastBakeAt - tClose) : null, pendingAfter: !!R.pending, mode: R.mode || null }; window.__pokeResult = { ok: true }; window.__pokePending = false; })().catch((e) => { window.__pokeResult = { error: "rebake: " + String(e && e.message || e) }; window.__pokePending = false; }); };'
    REBAKE2_JS="rebake2=$REBAKE_FN __obRebakeRun(2, async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const hA = await __obInstall(); await w(150); window.__rebakeEnv(); await w(100); hA.revert(); await w(30); const hB = await __obInstall(); await w(250); const t = performance.now(); hB.revert(); return t; });"
    REBAKE1_JS="rebake1=$REBAKE_FN __obRebakeRun(1, async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const h = await __obInstall(); await w(150); window.__rebakeEnv(); await w(100); const t = performance.now(); h.revert(); return t; });"
    step capture-rebakedefer node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-rebakedefer" --tables $PRED --look default --poses cueball_level --flags venue=off --no-base --poke-raw "$REBAKE2_JS"
    step capture-rebakedeferlegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-rebakedeferlegacy" --tables $PRED --look default --poses cueball_level --flags "venue=off&venueRebakeDefer=legacy" --no-base --poke-raw "$REBAKE2_JS"
    step capture-rebakesingle node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-rebakesingle" --tables $PRED --look default --poses cueball_level --flags venue=off --no-base --poke-raw "$REBAKE1_JS"
    # ORDER-LIGHT-C2-FIX2 class C — the judged step: a --no-base continuation keeps the baseline record and render-reads processes it; a full
    # recapture replaces it exactly once (tools/render/lighting-check-nobase.sh; the arm nobasekeep runs it under the pre-fix filter)
    step check-nobase tools/render/lighting-check-nobase.sh "$ROOT/check-nobase-$TAG"
    # ORDER-LIGHT-C2-FIX3 class A — the two-ball occlusion fixture: ball 1 laid TOUCHING the cue ball along the table's LONG axis toward the
    # bars' far end (kernel +y = three +x: the lowest-elevation lamp light reaches the cue ball from there, and the neighbour hides it from the
    # contact cap), venue ON, GI bound. Poses: cueball_level (the lone-looking cue ball from the head: the neighbour sits behind it) and the
    # fixture-only `crevice` register (lighting-page.mjs: the cueball_level standoff at 45° elevation, perpendicular to the pair's axis, looking
    # at the contact point). render-reads weights every disc pixel by the lamps' sampled visibility from its surface point (the rect bars from
    # the census, the neighbour as the occluder): lampshadow_Y = the shadow-weighted luminance. gridshadowlegacy = the same poke under
    # ?venueGridShadow=legacy (the pre-fix ball text: the arm of the relset rows). The layout uses the app's own ball radius (uSpheres[0].w).
    GRIDSHADOW_JS='gridshadow=window.__pokePending = true; window.__pokeResult = null; (async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const T = window.__test; const cue = (T.balls() || []).find((b) => b.id === 0 && !b.pocketed); if (!cue) throw new Error("no cue ball"); const U = window.__gi && window.__gi.uniforms && window.__gi.uniforms.uSpheres && window.__gi.uniforms.uSpheres.value; const R = (U && U[0] && U[0].w > 0.002) ? U[0].w : 0.028575; const gap = 0.0005; T.pause(false); T.layout([{ id: 0, x: cue.pos[2], y: cue.pos[0] }, { id: 1, x: cue.pos[2], y: cue.pos[0] + 2 * R + gap }]); await w(800); const b1 = (T.balls() || []).find((b) => b.id === 1); if (!b1 || b1.pocketed) throw new Error("ball 1 not on the bed"); window.__gridShadowFixture = { cue: cue.pos, ball1: b1.pos, r: R, gap }; window.__pokeResult = { ok: true }; window.__pokePending = false; })().catch((e) => { window.__pokeResult = { error: "gridshadow: " + String(e && e.message || e) }; window.__pokePending = false; });'
    step capture-gridshadow node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-gridshadow" --tables $PRED --look default --poses cueball_level,crevice --no-base --poke-raw "$GRIDSHADOW_JS"
    step capture-gridshadowlegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-gridshadowlegacy" --tables $PRED --look default --poses cueball_level,crevice --flags venueGridShadow=legacy --no-base --poke-raw "$GRIDSHADOW_JS"
    # ORDER-LIGHT-C2-FIX4 class A: the same fixture under the FIX3 post-BRDF text (a normal render) — the OVER-SUBTRACTION witness: the shadowed region
    # must read darker under fix3 than under the irradiance form (fix3 removed 1/(1 − max(totalScattering)) times what the grid had added)
    step capture-gridshadowfix3 node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-gridshadowfix3" --tables $PRED --look default --poses cueball_level,crevice --flags venueGridShadow=fix3 --no-base --poke-raw "$GRIDSHADOW_JS"
    # the converged Predator set under the LEGACY grid-shadow text: the identity witness of the tag-vs-tag converged offcheck (the chain judges
    # convlegacy vs the previous tag's conv at 0 px within main's flip on both poses; the fixed conv vs the previous conv is JUDGED on cueball_level
    # — a lone cue ball, no occluder, byte-identical — and RECORDED on full34, where the racked balls' contact shadows are the fix itself)
    step capture-convlegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-convlegacy" --tables $PRED --look both --poses full34,cueball_level --flags venueGridShadow=legacy --poke-raw "$CONV_JS"
    # ORDER-LIGHT-C2-FIX3 class B — a public rebake INSIDE the 120 ms debounce after a close: request inside the window, close (debounce armed),
    # window.__rebakeEnv() at +50 ms → ONE bake total by 300 ms (pre-fix 2: the debounce baked again at 120 ms). rebakecancellegacy = the arm.
    REBAKECANCEL_JS="rebakecancel=$REBAKE_FN __obRebakeRun(1, async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const h = await __obInstall(); await w(150); window.__rebakeEnv(); await w(100); const t = performance.now(); h.revert(); await w(50); window.__rebakeEnv(); return t; });"
    step capture-rebakecancel node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-rebakecancel" --tables $PRED --look default --poses cueball_level --flags venue=off --no-base --poke-raw "$REBAKECANCEL_JS"
    step capture-rebakecancellegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-rebakecancellegacy" --tables $PRED --look default --poses cueball_level --flags "venue=off&venueRebakeCancel=legacy" --no-base --poke-raw "$REBAKECANCEL_JS"
    # ORDER-LIGHT-C2-FIX3 class C — the judged step: an async poke that fails inside the 400 ms sleep is REFUSED by name (C1); a poke that resolves
    # late is captured as before (C2) (tools/render/lighting-check-pokefail.sh; the arm pokefailcap runs it under the pre-fix rule)
    step check-pokefail tools/render/lighting-check-pokefail.sh "$ROOT/check-pokefail-$TAG"
    # ORDER-LIGHT-C2-FIX4 class A — the negative-fragment witness: the two-ball fixture under ?venueGridDebug=neg (the ball writes 1.0 where its
    # indirect diffuse has a negative channel); gridneg = the irradiance form (0 by construction), gridnegfix3 = the FIX3 post-BRDF subtraction (the arm)
    step capture-gridneg node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-gridneg" --tables $PRED --look default --poses cueball_level,crevice --flags venueGridDebug=neg --no-base --poke-raw "$GRIDSHADOW_JS"
    step capture-gridnegfix3 node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-gridnegfix3" --tables $PRED --look default --poses cueball_level,crevice --flags "venueGridShadow=fix3&venueGridDebug=neg" --no-base --poke-raw "$GRIDSHADOW_JS"
    # ORDER-LIGHT-C2-FIX4 class C — a poke that STARTS a fixture apply on a table without a derived venue probe (?venue=off) while ?giDelay holds the
    # apply open for 3000 ms (twice the tool's own 1500 ms post-settle sleep, so a capture that settles at once provably lands INSIDE the hold): the
    # fixed settle predicate waits for the apply to complete (giSeqOpen 0 at the dump); applyseqlegacy = the same boot captured under
    # OB_SETTLE_APPLYSEQ=legacy (the pre-fix predicate certifies the old GI at once: giSeqOpen 1) — the arm
    APPLYSEQ_JS='applyseq=(() => { const G = window.__gi && window.__gi.state; window.__applySeqProbe = { before: G ? { applySeq: G.applySeq, appliedSeq: G.appliedSeq } : null }; window.__test.setLook("sp"); window.__pokeResult = { ok: true }; })()'
    step capture-applyseq node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-applyseq" --tables $PRED --look default --poses cueball_level --flags "venue=off&giDelay=3000" --no-base --poke-raw "$APPLYSEQ_JS"
    step capture-applyseqlegacy env OB_SETTLE_APPLYSEQ=legacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-applyseqlegacy" --tables $PRED --look default --poses cueball_level --flags "venue=off&giDelay=3000" --no-base --poke-raw "$APPLYSEQ_JS"
    # ---- ORDER-LIGHT-C2-FIX5 ----
    # E3: the venue probe renders inside the lamp-fade suspension (no fade wait, no post-fade bake); probefadelegacy = the same boot under the
    # pre-FIX5 rule (?venueProbeFade=legacy: fadeSettled + the post-fade bake) — the arm of the venuePostFadeBake rows
    step capture-probefadelegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-probefadelegacy" --tables $PRED --look both --poses cueball_level --flags venueProbeFade=legacy
    # class F: welllegacy = the default boots of the two tables under ?venueWellVis=legacy (the 793c8d67 replacement key: no shaft split) — F2 / F5
    # identity vs the sealed `after` on the OPEN bed (the chain's offcheck: 0 px on every cell — no ball outside a closure moves) and the F4 arm
    # (programs:ball:gridWell 0 on it, 10 on the fixed tree)
    step capture-welllegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-welllegacy" --tables $PRED,wpa_spec_9ft --look both --poses full34,cueball_level --flags venueWellVis=legacy
    # class F (F1 / F3): the seated ball (the cup drive) under ?venueGridDebug=lamp — the ball program writes R = the replacement key's lamp-accounted
    # diffuse as it lands, G = the live direct diffuse; cupwell = the fixed tree, cupwelllegacy = the 793c8d67 rule (hemisphere visibility on the
    # lamp portion) — the red arm reads the missing diffuse as the ratio's drop
    step capture-cupwell node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-cupwell" --tables $PRED --look both --poses cup_rest --poke-raw "$CUP_JS" --flags venueGridDebug=lamp --no-base
    step capture-cupwelllegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-cupwelllegacy" --tables $PRED --look both --poses cup_rest --poke-raw "$CUP_JS" --flags "venueGridDebug=lamp&venueWellVis=legacy" --no-base
    # class G (G1 / G2): the bake-key race as a scripted sequence (tools/render/lib/lighting-gikey-drive.js): studio window open → another baked
    # fixture requested with the apply held open (?giDelay=3000) → window closed while pending → per-frame trace until the request completes.
    # gikey = the fixed tree (GI stays off until the new bind), gikeylegacy = ?venueGiKey=legacy (the stale bake re-enabled at the close — the red
    # arm), gikeymain = main's export under the same script (GI off through the interval on main: the pairwise row)
    GIKEY_JS="gikey=$(cat tools/render/lib/lighting-gikey-drive.js)"
    step capture-gikey node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-gikey" --tables $PRED --look default --poses cueball_level --flags giDelay=3000 --no-base --poke-raw "$GIKEY_JS"
    step capture-gikeylegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-gikeylegacy" --tables $PRED --look default --poses cueball_level --flags "giDelay=3000&venueGiKey=legacy" --no-base --poke-raw "$GIKEY_JS"
    STEP_EXPORT="${OB_MAIN_TOOLING:-/tmp/ob-land-638/main-tooling}:163d7f25"
    step capture-gikeymain tools/render/lighting-capture-from.sh "${OB_MAIN_TOOLING:-/tmp/ob-land-638/main-tooling}" --out "$PWD/$ROOT/after-$TAG-gikeymain" --tables $PRED --look default --poses cueball_level --flags giDelay=3000 --no-base --poke-raw "$GIKEY_JS"
    # E (the §L34 step (1) premise error): convfix3 = the converged frames under ?venueGridShadow=fix3 — land19's shipped text (the FIX3 post-BRDF
    # form) — the identity twin the chain's reading (1) wanted (convlegacy was the PRE-FIX3 text)
    step capture-convfix3 node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-convfix3" --tables $PRED --look both --poses full34,cueball_level --flags venueGridShadow=fix3 --poke-raw "$CONV_JS"
    # ---- ORDER-LIGHT-C2-FIX6 ----
    # class H (H1 / H2): the slow-bake race — ?venueDebounce=hold:16000 arms every env re-bake 16 s out, so the apply crosses the 15 s settle budget with a
    # bake QUEUED (its timer armed). slowbake = the shipped rule (the gate reads the bake state: it waits for the queued bake past the budget, the accepted
    # probe follows the bake; acceptWhileQueued 0), slowbakelegacy = ?venueAccept=legacy (the 5667a488 rule: the clock releases the gate at 15 s, the
    # convergence loop accepts the zero delta from the SAME cube at +50 ms, the bake at 16 s changes the environment — staleProbeRel quantifies it)
    step capture-slowbake node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-slowbake" --tables $PRED --look default --poses cueball_level --flags venueDebounce=hold:16000
    step capture-slowbakelegacy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-slowbakelegacy" --tables $PRED --look default --poses cueball_level --flags "venueDebounce=hold:16000&venueAccept=legacy"
    # ORDER-LIGHT-C2-FIX7 class H2: the 7a522bd2 rule as the red plant (?venueAccept=fix6: a timer-armed bake is waited for past the budget — 64.8 s)
    step capture-slowbakefix6 node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-slowbakefix6" --tables $PRED --look default --poses cueball_level --flags "venueDebounce=hold:16000&venueAccept=fix6"
    # ORDER-LIGHT-C2-FIX8 H3-3: the loop's own schedule marked UNBOUNDED under the planted slow bake — the boot must degrade AT the budget (the classifier reads the schedule)
    step capture-h3unbounded node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-h3unbounded" --tables $PRED --look default --poses cueball_level --flags "venueDebounce=hold:16000&venueRebakeBound=unbounded"
    # class I (I1 / I3): the seated ball across the angular sweep under ?venueGridDebug=split — R = the reconstructed lamp term, G = the remainder × hemi,
    # B = the unsplit indirect diffuse; cupsplit = the weighted form (R + G ≤ B at every sample), cupsplitfix5 = ?venueWellVis=fix5 (the 5667a488 form:
    # the excess grows toward grazing — the red plant)
    step capture-cupsplit node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-cupsplit" --tables $PRED --look default --poses cup_rest,cup_sweep_1,cup_sweep_2,cup_sweep_3,cup_sweep_4,cup_sweep_5,cup_sweep_6,cup_sweep_7,cup_sweep_8,cup_sweep_9 --poke-raw "$CUP_JS" --flags venueGridDebug=split --no-base
    step capture-cupsplitfix5 node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-cupsplitfix5" --tables $PRED --look default --poses cup_rest,cup_sweep_1,cup_sweep_2,cup_sweep_3,cup_sweep_4,cup_sweep_5,cup_sweep_6,cup_sweep_7,cup_sweep_8,cup_sweep_9 --poke-raw "$CUP_JS" --flags "venueGridDebug=split&venueWellVis=fix5" --no-base
    # ORDER-LIGHT-C2-FIX4 class B — the judged step: a recapture never writes through a reuse link (scratch copies, hashes before/after)
    step check-writeonce tools/render/lighting-check-writeonce.sh "$ROOT/check-writeonce-$TAG"
    # ORDER-LIGHT-C2-FIX4 (maintainer condition) — the judged step: the URL arm switches are inert on a DEFAULT boot (two default boots, with and
    # without the strings, compile byte-identical ball programs: sources, cache keys; no fix3 / debug text); the arm makes the flagged boot scripted
    step check-armgate node tools/render/lighting-check-armgate.mjs
    # ORDER-LIGHT-C2-FIX7 class L — the judged step: zero grid-well witnesses on default boots with the (h) block compiled; the planted failure prints it in both modes
    step check-gridwell node tools/render/lighting-check-gridwell.mjs
    # ORDER-LIGHT-C2-FIX6 class J (J2) — the judged step: the byte-true texture hash separates the half-float / float plants the sampled-element hash was blind to
    step check-texhash node tools/render/lighting-check-texhash.mjs
    # ORDER-LAND-638-FIX2 C2 (review r6): a FAILED GI load (the manifest fetch rejects: ?giFail=manifest) is a settled state —
    # the venue capture proceeds at once, the balls keep main's LTC diffuse; the arm = the legacy settle rule (waits 4 s)
    # ORDER-LIGHT-C2-FIX1 §L31 (the aOccl race): the SAME capture with the occlusion-trace flush withheld (OB_SETTLE_FLUSH=off) on the one
    # table that carries the async transport attribute — the control the flush rows arm against (settleFlushed 1 -> 0, the record names the seam)
    step capture-flushoff env OB_SETTLE_FLUSH=off node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-flushoff" --tables wpbsa_snooker_12ft --look default --poses cueball_level
    # ORDER-LIGHT-C2-FIX1 §L31: flushdup = the SAME capture again, flushed, in a second process. after-$TAG-flushdup vs after-$TAG is the
    # determinism read the finding was made on (two flushed runs of the one table that carries the async transport attribute must agree on
    # attrHashes.aOccl); before the flush, two runs of this pair disagreed on 11 rows because the drain was still in flight.
    step capture-flushdup node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-flushdup" --tables wpbsa_snooker_12ft --look default --poses cueball_level
    step capture-gifail node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-gifail" --tables $PRED,wpa_spec_9ft --look both --poses cueball_level --flags giFail=manifest
    step capture-gifailoff node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-gifailoff" --tables $PRED,wpa_spec_9ft --look both --poses cueball_level --flags "giFail=manifest&venue=off"
    # GH-996: the same failed-load boot with the ball knee off (FIX-gifail-lit-wpa's twin)
    step capture-gifailnk node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-gifailnk" --tables $PRED,wpa_spec_9ft --look both --poses cueball_level --flags "giFail=manifest&ballKnee=off"
    step capture-gifailarm node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-gifailarm" --tables $PRED,wpa_spec_9ft --look both --poses cueball_level --flags "giFail=manifest&venueSettle=legacy"
    # P1-a / P2-b / P2-d: the MIXED-CACHE trees — the export with ONE peer replaced by main's (the ownership ledger (internal) rule 5)
    EXPORTROOT="$(dirname "${OB_LIGHTING_WEB:-$PWD/web}")"
    step mixed-trees tools/render/lighting-mixed-trees.sh "$EXPORTROOT" "${OB_MAIN_SHA:-163d7f25}" "$MIXROOT" "${OB_662_SHA:-2eab3fad}"
    for MX in "${MIXED[@]}"; do
      CONVARG=(--poke-raw "$CONV_JS")  # ORDER-LIGHT-FIX6: EVERY matrix tree carries the conv sub-run — its venue-ON conv frame is judged against its own off conv frame (offcheck-mix*-onoff below)
      step capture-mix$MX env OB_LIGHTING_WEB="$MIXROOT/$MX/web" node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-mix$MX" --tables $PRED,wpa_spec_9ft --look both --poses cueball_level,full34 "${CONVARG[@]}"
      step capture-mix${MX}off env OB_LIGHTING_WEB="$MIXROOT/$MX/web" node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-mix${MX}off" --tables $PRED,wpa_spec_9ft --look both --poses cueball_level,full34 --flags venue=off --poke-raw "$CONV_JS"
    done
    step capture-legacyrect node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-legacyrect" --tables $PRED --look both --poses full34,cushion_shadow,cueball_level --flags rectDiffuse=legacy \
      --poke 'barsoff=window.__dbg.scene.traverse((o) => { if (o.isRectAreaLight) o.intensity = 0; })' --poke 'bakeoff=window.__gi.uniforms.uGiIrr.value = 0'
    # ORDER-LIGHT-7 R-C: the live-switch residue vs a fresh boot is main's (table.js rebuilds without re-baking the env
    # cubemap). switchenv = the causal test (re-bake after the switch); offswitch/offjoy = the ?venue=off control pair.
    step capture-switchenv node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-switchenv" --tables $PRED --look both --poses full34,cueball_level --poke-raw "$SWITCHENV_JS"
    step capture-offswitch node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-offswitch" --tables $PRED --look both --poses full34,cueball_level --flags venue=off --poke-raw "$SWITCH_JS"
    step capture-offjoy node tools/render/lighting-capture.mjs --out "$ROOT/after-$TAG-offjoy" --tables joy_q8_9ft --look both --poses full34,cueball_level --flags venue=off
    # ORDER-LIGHT-C2-FIX4 class B — after the LAST capture step: this tag's sets are SEALED write-once (chmod -R a-w on every real after-$TAG* directory;
    # a later recapture is refused by lighting-out-guard.sh unless the operator lifts it with OB_SEAL_UNSEAL=1, logged) and the link check runs
    # (no dangling link among the sets; every reuse link of this tag points at a sealed target)
    step check-capture-partition partition_check  # CLASS R: the reused branch counted and asserted against the fresh list
  step seal-sets tools/render/lighting-seal-sets.sh "$ROOT" "$TAG"
    step check-links tools/render/lighting-check-links.sh "$ROOT" "$TAG"
  fi
  # ORDER-LAND-638-FIX2 (review r6): every set's manifest must be ONE run — no resumed mix of run ids, no exhausted or failed cell
  CR=("$AFTER"); for X in "${ARMS[@]}"; do CR+=("$ROOT/after-$TAG-$X"); done
  step check-runs python3 tools/render/lighting-check-runs.py "${CR[@]}"
  # ORDER-LIGHT-C2-FIX1 A(ii) (maintainer): the GENERIC settle invariant over EVERY sealed set — no dump with the venue capture pending, the
  # bound = the app's own budgetMs; a set whose boot never settled is already refused by check-runs (exhausted) — this step judges the dumps that exist
  step check-settled python3 tools/render/lighting-check-settled.py "${CR[@]}"
  # ORDER-LIGHT-C2-FIX7 (the proportionate seal form) — the judged step: the four converged control sets, every cross pair PNG-identical and inside the same-web HDR envelope
  # (lighting-ctrl-judge.py) plus the fence identity A1 vs B1. OUTSIDE the capture block on purpose: a --no-capture regate of record re-judges it with the tools tip
  # (check-armgate / check-texhash / check-gridwell / check-links stay capture-run steps: their tools did not move after their capturing run this round).
  step check-ctrl tools/render/lighting-check-ctrl.sh "$ROOT" "$TAG" --stage regate
  # ORDER-LIGHT-C2-FIX10 class A (iii): the comparator's 4-pixel RGB fixture — px 4 / changed 1 (arm pixelrgb: the grouping-by-4 rule fails it)
  step pixel-fixture python3 tools/render/lighting-pixel-strict.py --fixture-check
  # ORDER-LIGHT-C2-FIX10 class Z judgements — a judge that MUST red, read as a value (lighting-expect-exit.sh): the cross-web fence over the A1 control and the
  # giball dump must exit 3 (the record moved when ball GI was toggled 1 → 0); over A1 and the absentkey dump it must exit 3 naming uGiBallOn (the census).
  # Arms: giballreader points the first at the pre-FIX10-reader dump (no key written → the fence passes → expect-exit 12); absentkeylegacy runs the second
  # with --census-legacy (absence certified → exit 0 → expect-exit 12).
  # (smoked 14:5xZ on the scratch web: A1-vs-giball exit 3; A1-vs-absentkey exit 3 naming uGiBallOn 12×; the both-sides-absent pair is the only one the census alone decides)
  # fence-giball (judged): A1 (new reader, key 1) vs giball (toggled 0) must exit 3 — the record moved. Arm giballreader: the PRE-FIX10 world reproduced — the A web
  # and the toggled B web both dumped under the old gv() reader (key absent on both sides) and judged under the old rule (--census-legacy): the toggle is invisible
  # and the absence certified → the fence exits 0 → expect-exit 12.
  if [ "${OB_SEAL_ARM:-}" = "giballreader" ]; then
    step fence-giball tools/render/lighting-expect-exit.sh 3 "fence ctrla1reader vs giballreader under --census-legacy (the pre-FIX10 reader + rule: the toggle MUST be invisible)" python3 tools/render/lighting-fence.py --base "$ROOT/after-$TAG-ctrla1reader" --new "$ROOT/after-$TAG-giballreader" --tables $PRED --looks default --census-legacy --out "$ROOT/fence-$TAG-giball-arm.md" --json "$ROOT/fence-$TAG-giball-arm.json"
  else
    step fence-giball tools/render/lighting-expect-exit.sh 3 "fence A1 vs giball (ball GI 1 → 0 must move the record)" python3 tools/render/lighting-fence.py --base "$ROOT/after-$TAG-ctrla1" --new "$ROOT/after-$TAG-giball" --tables $PRED --looks default --out "$ROOT/fence-$TAG-giball.md" --json "$ROOT/fence-$TAG-giball.json"
  fi
  # fence-absentkey (judged, the named-key case): A1 vs absentkey (the B reader broken in memory) must exit 3 naming uGiBallOn
  step fence-absentkey tools/render/lighting-expect-exit.sh 3 "fence A1 vs absentkey (a vanished expected key must red by name)" python3 tools/render/lighting-fence.py --base "$ROOT/after-$TAG-ctrla1" --new "$ROOT/after-$TAG-absentkey" --tables $PRED --looks default --out "$ROOT/fence-$TAG-absentkey.md" --json "$ROOT/fence-$TAG-absentkey.json"
  # fence-absentcensus (judged, the erratum's own shape): ctrla1reader vs giballreader — the key absent on BOTH sides, no diff row possible — must exit 3 by the CENSUS
  # alone. Arm absentkeylegacy: the same pair under --census-legacy (the pre-FIX10 rule) certifies the absence → exit 0 → expect-exit 12.
  CENSUS_FLAG=(); [ "${OB_SEAL_ARM:-}" = "absentkeylegacy" ] && CENSUS_FLAG=(--census-legacy)
  step fence-absentcensus tools/render/lighting-expect-exit.sh 3 "fence ctrla1reader vs giballreader (an expected key absent on BOTH sides must red by the census)" python3 tools/render/lighting-fence.py --base "$ROOT/after-$TAG-ctrla1reader" --new "$ROOT/after-$TAG-giballreader" --tables $PRED --looks default "${CENSUS_FLAG[@]}" --out "$ROOT/fence-$TAG-absentcensus.md" --json "$ROOT/fence-$TAG-absentcensus.json"
  step check-studiofill tools/render/lighting-check-studiofill.sh "$ROOT" "$TAG"  # ORDER-LIGHT-C2-FIX9 N1: in-window identity + live gameplay control + restore (regate-visible; M6 law)
  step reads-after python3 tools/render/lighting-render-reads.py --capture "$AFTER" --out "$ROOT/reads-render/after-$TAG"
  for X in "${ARMS[@]}"; do
    step "reads-$X" python3 tools/render/lighting-render-reads.py --capture "$ROOT/after-$TAG-$X" --out "$ROOT/reads-render/after-$TAG-$X"
  done
  # ORDER-LIGHT-C1 (c), refuter: the main baseline `before` is two processes by design (capture-before + capture-beforeconv --no-clean through
  # main's own tooling adds the conv poke run beside the base run) and is EXEMPT from check-runs' one-run rules — never from the carry rules:
  # its base runs for Predator / wpa_spec CARRY 12 pose files each from an earlier baseline run (the finding, in the lane's own baseline, §L29.3);
  # the conv step now declares that carry and lists its origin, and this step refuses an undeclared / unlisted / id-less one
  step check-before-carry python3 tools/render/lighting-check-runs.py --carry-only "$BEFORE"
  step reads-before python3 tools/render/lighting-render-reads.py --capture "$BEFORE" --out "$ROOT/reads-render/before"
  step scope python3 tools/render/lighting-probe-scope.py --capture "$ROOT/after-$TAG-scope" --reads "$ROOT/reads-render/after-$TAG-scope" --out "$ROOT/scope-$TAG"
  step scope-arm python3 tools/render/lighting-probe-scope.py --capture "$ROOT/after-$TAG-arm" --reads "$ROOT/reads-render/after-$TAG-arm" --out "$ROOT/scope-$TAG-arm" --poses full34,cushion_shadow
  # ORDER-LIGHT-8 C1: pixel identity of ?venue=off against the main baseline (PNG + HDR), main's own per-boot flip as
  # the tolerance (measured from two main boots when given); red arm = the seal-7 off capture (legacy walls carried the
  # 1024 px plaster: 10/255) — must read RED
  MA=(); [ -n "$MAINALT" ] && MA=(--main-alt "$MAINALT")
  # ORDER-LIGHT-C2-FIX4 (land19): other main boot states printed per cell as the old boot-vs-boot form (the modes), never judged
  for RA in ${=OB_MAIN_ALT_RECORD:-}; do [ -d "$RA" ] && MA+=(--alt-record "$RA"); done
  # ORDER-LAND-638-FIX4 verifier item 5: a SECOND, fine-scale arm on every JUDGED off-vs-main offcheck — the off boot's CONVERGED
  # sub-run (conv) against main's boot frame: a real state at the judged scale (1/255 on 14 % of the Predator pixels, 27/255 on
  # 51 % of wpa) that a widened tolerance would hide; it must read RED beside the coarse venue-ON arm (83–246/255). The
  # recorded offcheck-*-boot / mainconv runs below stay single-arm: their exit is swallowed by design (recorded, not judged), so
  # an arm there gates nothing, and their off side IS the unconverged boot whose delta they record.
  ARM2=(--arm2 "$ROOT/after-$TAG-off")  # FIX4 item 5: the fine-scale arm = the off BOOT frame against the converged main side (one env step: 1/255 on 3–15 % Predator, 27–86/255 wpa)
  step offcheck python3 tools/render/lighting-offcheck.py --off "$ROOT/after-$TAG-off" --off-sub conv --main "$BEFORE" --main-sub conv "${MA[@]}" \
    --arm "$AFTER" "${ARM2[@]}" --tables $PRED,wpa_spec_9ft --poses full34,cueball_level --looks default,sp --out "$ROOT/offcheck-$TAG.md" --json "$ROOT/offcheck-$TAG.json"
  # ORDER-LAND-638-FIX: every mixed-cache tree's ?venue=off is main byte for byte (the same offcheck, its cells; the same two arms)
  for MX in "${MIXED[@]}"; do
    ARM2M=(--arm2 "$ROOT/after-$TAG-mix${MX}off")
    step offcheck-mix$MX python3 tools/render/lighting-offcheck.py --off "$ROOT/after-$TAG-mix${MX}off" --off-sub conv --main "$BEFORE" --main-sub conv "${MA[@]}" \
      --arm "$AFTER" "${ARM2M[@]}" --tables $PRED,wpa_spec_9ft --poses full34,cueball_level --looks default,sp --out "$ROOT/offcheck-$TAG-mix$MX.md" --json "$ROOT/offcheck-$TAG-mix$MX.json"
  done
  # ORDER-LIGHT-FIX6 (review r10 P2, the one-stale-leaf contract): on every matrix tree the venue-ON boot IS the legacy boot — its
  # CONVERGED frame must equal its own ?venue=off CONVERGED frame within main's flip (never a hybrid); arm = the fresh venue-ON set
  for MX in "${MIXED[@]}"; do
    # (refuter round 2 → land9 attempt 3 arm phase) NO --main-alt here: the live flip is a MAIN-vs-MAIN measurement (main's own boot pair);
    # against this tree's off set it read a 33 % "flip" and swallowed the fine-scale arm2 (3/255 on 33 % → SILENT, exit 4 on every
    # --no-capture pass). The committed per-cell fixture is the envelope for two converged boots of one tree; arm2 = the tree's own off
    # BOOT frame against its converged frame (one env fixed-point step: RED on every cell, 2–86/255)
    step offcheck-mix$MX-onoff python3 tools/render/lighting-offcheck.py --off "$ROOT/after-$TAG-mix$MX" --off-sub conv --main "$ROOT/after-$TAG-mix${MX}off" --main-sub conv \
      --arm "$AFTER" --arm2 "$ROOT/after-$TAG-mix${MX}off" --tables $PRED,wpa_spec_9ft --poses full34,cueball_level --looks default,sp --out "$ROOT/offcheck-$TAG-mix$MX-onoff.md" --json "$ROOT/offcheck-$TAG-mix$MX-onoff.json"
  done
  # refuter round (RECORDED, not judged — the boot-frame law): a DEGRADED boot (stalled GI / stalled rig leaf) against its off twin, twice —
  # boot frame vs the twin's BOOT frame (like for like: both shot 1.5 s after settle; smoke: 1/255 on 3–4 % of pixels) and vs the twin's CONVERGED
  # frame (--main-sub conv; smoke: 1/255 on 10–17 %, the same class as a boot vs its own converged frame, offcheck-mainconv 15.7 %). Arm = the
  # fresh venue-ON set. The JUDGED law for these boots is the room pairs against the twin (pairs-room-* below, ±5 %) and the census rows.
  for DG in gistall:$PRED:default,sp leafstall2:$PRED:default leafstall3:wpbsa_snooker_12ft:default; do  # zsh-colon: measured identical (braced 'wpa_generic_9ft:default' == unbraced 'wpa_generic_9ft:default'; `d` starts no modifier run)
    N="${DG%%:*}"; R="${DG#*:}"; T="${R%%:*}"; LK="${R#*:}"; PO="full34,cueball_level"; [ "$N" = leafstall3 ] && PO="cueball_level"
    echo "[seal] step offcheck-$N-onoff (recorded, not judged: the degraded boot vs its off twin's boot frame) $(date -u +%FT%TZ)"
    RC=0; python3 tools/render/lighting-offcheck.py --off "$ROOT/after-$TAG-$N" --main "$ROOT/after-$TAG-${N}off" --arm "$AFTER" --tables $T --poses $PO --looks $LK --out "$ROOT/offcheck-$TAG-$N-onoff.md" --json "$ROOT/offcheck-$TAG-$N-onoff.json" > /dev/null 2>&1 || RC=$?  # (set -e: a RECORD verdict exits 4 — capture it; land12's first seal died here without a witness)
    echo "[seal] offcheck-$N-onoff recorded exit $RC $(grep -m1 -o '\*\*OFFCHECK: .*' "$ROOT/offcheck-$TAG-$N-onoff.md" 2>/dev/null | cut -c1-120)"
    echo "[seal] step offcheck-$N-onoffconv (recorded, not judged: the degraded boot vs its off twin's converged frame) $(date -u +%FT%TZ)"
    RC=0; python3 tools/render/lighting-offcheck.py --off "$ROOT/after-$TAG-$N" --main "$ROOT/after-$TAG-${N}off" --main-sub conv --arm "$AFTER" --arm2 "$ROOT/after-$TAG-${N}off" --tables $T --poses $PO --looks $LK --out "$ROOT/offcheck-$TAG-$N-onoffconv.md" --json "$ROOT/offcheck-$TAG-$N-onoffconv.json" > /dev/null 2>&1 || RC=$?
    echo "[seal] offcheck-$N-onoffconv recorded exit $RC $(grep -m1 -o '\*\*OFFCHECK: .*' "$ROOT/offcheck-$TAG-$N-onoffconv.md" 2>/dev/null | cut -c1-120)"
  done
  # ORDER-LAND-638-FIX: the pre-GI / no-bake / mixed boots keep their diffuse — crown ratios against each set's ?venue=off twin
  step pairs-nogi python3 tools/render/lighting-contract-pairs.py --a "$ROOT/reads-render/after-$TAG-nogi" --b "$ROOT/reads-render/after-$TAG-nogioff" --label nogioff
  step pairs-nogink python3 tools/render/lighting-contract-pairs.py --a "$ROOT/reads-render/after-$TAG-nogink" --b "$ROOT/reads-render/after-$TAG-nogioff" --label nogioff
  step pairs-pendant python3 tools/render/lighting-contract-pairs.py --a "$ROOT/reads-render/after-$TAG-pendant" --b "$ROOT/reads-render/after-$TAG-pendantoff" --label pendantoff
  step pairs-pendantnk python3 tools/render/lighting-contract-pairs.py --a "$ROOT/reads-render/after-$TAG-pendantnk" --b "$ROOT/reads-render/after-$TAG-pendantoff" --label pendantoff
  step pairs-nogiarm python3 tools/render/lighting-contract-pairs.py --a "$ROOT/reads-render/after-$TAG-nogiarm" --b "$ROOT/reads-render/after-$TAG-nogioff" --label nogioff
  step pairs-pendantarm python3 tools/render/lighting-contract-pairs.py --a "$ROOT/reads-render/after-$TAG-pendantarm" --b "$ROOT/reads-render/after-$TAG-pendantoff" --label pendantoff
  # C2-FIX10 class B: the lifted-ball boots against the plain default boot (shL2RelAB into each lifted set's reads)
  step pairs-ballift python3 tools/render/lighting-contract-pairs.py --a "$ROOT/reads-render/after-$TAG-ballift" --b "$ROOT/reads-render/after-$TAG-ctrlb2" --label ctrlb2
  step pairs-balliftlegacy python3 tools/render/lighting-contract-pairs.py --a "$ROOT/reads-render/after-$TAG-balliftlegacy" --b "$ROOT/reads-render/after-$TAG-ctrlb2" --label ctrlb2
  # ORDER-LAND-638-FIX2 B1: the fixture round trip keeps frame identity with its same-protocol control (main's own flip as
  # the tolerance) — JUDGED; the straight-boot comparison is RECORDED (offcheck-fixtrip-boot: the boot cube carries the cue
  # and the aim overlay the tool hides only after the settle — a capture-protocol fact, not a lighting state; §21)
  step offcheck-fixtrip python3 tools/render/lighting-offcheck.py --off "$ROOT/after-$TAG-fixtrip" --off-sub fixtrip --main "$ROOT/after-$TAG-fixctl" --main-sub fixctl --tables $PRED --poses full34,cueball_level --looks default,sp --arm "$ROOT/after-$TAG-pdtring" --out "$ROOT/offcheck-$TAG-fixtrip.md" --json "$ROOT/offcheck-$TAG-fixtrip.json"
  echo "[seal] step offcheck-fixtrip-boot (recorded, not judged) $(date -u +%FT%TZ)"
  python3 tools/render/lighting-offcheck.py --off "$ROOT/after-$TAG-fixtrip" --off-sub fixtrip --main "$AFTER" --tables $PRED --poses full34,cueball_level --looks default,sp --arm "$ROOT/after-$TAG-pdtring" --out "$ROOT/offcheck-$TAG-fixtrip-boot.md" --json "$ROOT/offcheck-$TAG-fixtrip-boot.json" || echo "[seal] offcheck-fixtrip-boot recorded exit $? (the boot cube holds the cue + aim overlay; see §21)"
  # ORDER-LAND-638-FIX3 (review r7 P2 #1): the stale venue leaf pairing (main's lightingvisuals.js + the new main.js / room.js)
  # boots the DEGRADE path (legacy dressing, main's shading, the look re-applied, one re-bake): its venue-ON frame must equal
  # main's within main's own flip on every cell and both looks — not only the room rows
  step offcheck-mixoldlv-on python3 tools/render/lighting-offcheck.py --off "$ROOT/after-$TAG-mixoldlv" --off-sub conv --main "$ROOT/after-$TAG-off" --main-sub conv \
    --arm "$AFTER" --tables $PRED,wpa_spec_9ft --poses full34,cueball_level --looks default,sp --out "$ROOT/offcheck-$TAG-mixoldlv-on.md" --json "$ROOT/offcheck-$TAG-mixoldlv-on.json"
  # ORDER-LAND-638-FIX3 (review r7 P2 #4): without a float render target the whole feature is inert — converged vs converged
  step offcheck-nofloat python3 tools/render/lighting-offcheck.py --off "$ROOT/after-$TAG-nofloat" --off-sub conv --main "$ROOT/after-$TAG-off" --main-sub conv \
    --arm "$AFTER" --tables $PRED,wpa_spec_9ft --poses full34,cueball_level --looks default,sp --out "$ROOT/offcheck-$TAG-nofloat.md" --json "$ROOT/offcheck-$TAG-nofloat.json"
  # ORDER-LAND-638-FIX4 (review r8 P2 #1): the runtime-throw boots equal the off boot, converged vs converged
  # the runtime throw can only happen where a capture runs — a table WITH a venue term (the Predator); on a term-less table
  # applyVenue never attempts a capture, so the seam cannot fire and the boot is the ordinary venue-ON state (the land7 regate's
  # first run judged the wpa cells here and read exactly that: no degrade, dressingClass 1, giIrr 1 — not a failure of the fix)
  for TH in throwrender throwreadback; do
    step offcheck-$TH python3 tools/render/lighting-offcheck.py --off "$ROOT/after-$TAG-$TH" --off-sub conv --main "$ROOT/after-$TAG-off" --main-sub conv \
      --arm "$AFTER" --tables $PRED --poses full34,cueball_level --looks default,sp --out "$ROOT/offcheck-$TAG-$TH.md" --json "$ROOT/offcheck-$TAG-$TH.json"
  done
  # ORDER-LIGHT-FIX5 (review r9): P2#2 the no-op readback degrades to main's frame (its CONVERGED sub-run vs the off boot's, like the
  # throw arms; arm = the venue-ON after frame). P2#1 the delayed-GI boot's CONVERGED frame equals the normal boot's converged frame
  # (the probe accepted after the hold IS the boot's probe; arm = the off boot: main's frame, no venue term → RED)
  # land8 (§L25), RECORDED (not judged — each capture poke is its own boot, so a converged frame AFTER the tiny generation is not
  # capturable here; the judged witnesses are the pin rows FIX-pmrem-*): the tinyenv sub-run frame vs the normal boot frame, guard on
  # (expected: a boot-state flip at most) and guard off (expected: ~20/255 darker over the frame — the defect's frame)
  for PMX in pmremarm pmremarmoff; do
    echo "[seal] step offcheck-$PMX-tinyenv (recorded, not judged) $(date -u +%FT%TZ)"
    python3 tools/render/lighting-offcheck.py --off "$ROOT/after-$TAG-$PMX" --off-sub tinyenv --main "$AFTER" --arm "$ROOT/after-$TAG-off" --tables $PRED --poses full34,cueball_level --looks default,sp --out "$ROOT/offcheck-$TAG-$PMX-tinyenv.md" --json "$ROOT/offcheck-$TAG-$PMX-tinyenv.json" > /dev/null 2>&1 || true
  done
  step offcheck-readnoop python3 tools/render/lighting-offcheck.py --off "$ROOT/after-$TAG-readnoop" --off-sub conv --main "$ROOT/after-$TAG-off" --main-sub conv \
    --arm "$AFTER" --tables $PRED --poses full34,cueball_level --looks default,sp --out "$ROOT/offcheck-$TAG-readnoop.md" --json "$ROOT/offcheck-$TAG-readnoop.json"
  step offcheck-gidelay-on python3 tools/render/lighting-offcheck.py --off "$ROOT/after-$TAG-gidelay" --off-sub conv --main "$ROOT/after-$TAG-conv" --main-sub conv \
    --arm "$ROOT/after-$TAG-off" --tables $PRED --poses full34,cueball_level --looks default,sp --out "$ROOT/offcheck-$TAG-gidelay-on.md" --json "$ROOT/offcheck-$TAG-gidelay-on.json"
  # RECORDED (not judged): the BOOT-vs-BOOT off==main comparison (the chain's off boot against the chain's main boot — a load state
  # on either side reads here with its numbers; §L23.3) and the five mixed off boots likewise
  # ORDER-LIGHT-C2 (a): under the studio rig the FIXED app equals the ?rectDiffuse=legacy boot (main's rect-diffuse chunk verbatim) pixel
  # for pixel at every dim step — the GI weight is 1 − 1 = 0 = main's leg, algebraically the same program; and the PRE-C2 app (arm2, the
  # c9e44692 negative control under the same rig) does NOT: its weight still reads the gameplay bake's flags, so the balls keep NO rect
  # diffuse under the studio key (the finding). --arm = the venue-ON gameplay frame (coarse: a different rig, must differ).
  for SUB in studio studiodim50 studiodim25; do
    step offcheck-studio-legacy-$SUB python3 tools/render/lighting-offcheck.py --off "$ROOT/after-$TAG-studio" --off-sub $SUB --main "$ROOT/after-$TAG-studiolegacy" --main-sub $SUB \
      --arm "$AFTER" --arm2 "$ROOT/after-$TAG-studiopre" --arm2-sub $SUB --tables $PRED --poses full34,cueball_level --looks default --out "$ROOT/offcheck-$TAG-studio-legacy-$SUB.md" --json "$ROOT/offcheck-$TAG-studio-legacy-$SUB.json"
  done
  echo "[seal] step offcheck-boot (recorded, not judged) $(date -u +%FT%TZ)"
  python3 tools/render/lighting-offcheck.py --off "$ROOT/after-$TAG-off" --main "$BEFORE" "${MA[@]}" --arm "$AFTER" --tables $PRED,wpa_spec_9ft --poses full34,cueball_level --looks default,sp --out "$ROOT/offcheck-$TAG-boot.md" --json "$ROOT/offcheck-$TAG-boot.json" || echo "[seal] offcheck-boot recorded exit $? (a boot-vs-boot difference is a boot state, see §L23.3; the judged identity is converged vs converged)"
  for MX in "${MIXED[@]}"; do
    python3 tools/render/lighting-offcheck.py --off "$ROOT/after-$TAG-mix${MX}off" --main "$BEFORE" "${MA[@]}" --arm "$AFTER" --tables $PRED,wpa_spec_9ft --poses full34,cueball_level --looks default,sp --out "$ROOT/offcheck-$TAG-mix${MX}-boot.md" --json "$ROOT/offcheck-$TAG-mix${MX}-boot.json" || echo "[seal] offcheck-mix${MX}-boot recorded exit $?"
  done
  # RECORDED (not judged): the unconverged boot frames against main's boot, and main's own boot-convergence delta
  for REC in mixoldlv-on:after-$TAG-mixoldlv nofloat:after-$TAG-nofloat throwrender:after-$TAG-throwrender readnoop:after-$TAG-readnoop mixnolut-on:after-$TAG-mixnolut; do
    echo "[seal] step offcheck-${REC%%:*}-boot (recorded, not judged) $(date -u +%FT%TZ)"
    RT="$PRED,wpa_spec_9ft"; case "${REC%%:*}" in throwrender|readnoop) RT="$PRED";; esac
    python3 tools/render/lighting-offcheck.py --off "$ROOT/${REC#*:}" --main "$BEFORE" --arm "$AFTER" --tables $RT --poses full34,cueball_level --looks default,sp --out "$ROOT/offcheck-$TAG-${REC%%:*}-boot.md" --json "$ROOT/offcheck-$TAG-${REC%%:*}-boot.json" || echo "[seal] offcheck-${REC%%:*}-boot recorded exit $? (main's boot cube is one fixed-point step in; §L22.1)"
  done
  echo "[seal] step offcheck-mainconv (recorded: main's own convergence delta = off+conv vs the off boot) $(date -u +%FT%TZ)"
  python3 tools/render/lighting-offcheck.py --off "$ROOT/after-$TAG-off" --off-sub conv --main "$ROOT/after-$TAG-off" --arm "$AFTER" --tables $PRED,wpa_spec_9ft --poses full34,cueball_level --looks default,sp --out "$ROOT/offcheck-$TAG-mainconv.md" --json "$ROOT/offcheck-$TAG-mainconv.json" || echo "[seal] offcheck-mainconv recorded exit $? (main's boot env cube moves under further bakes; §L22.1)"
  # B1(b): the stale-leaf pairing renders MAIN's room (wall / floor / bench vs the main baseline); the after set is the arm (class room ≫ main)
  step pairs-room-oldlv python3 tools/render/lighting-room-pairs.py --a "$ROOT/reads-render/after-$TAG-mixoldlv" --b "$ROOT/reads-render/before" --label main
  step pairs-room-after python3 tools/render/lighting-room-pairs.py --a "$ROOT/reads-render/after-$TAG" --b "$ROOT/reads-render/before" --label main
  # (NOTE-705-LANDED: the pristine 2eab3fad negative control keeps its own legacy port claim 9710-9719 — the lane's plan-band pins are withheld from
  # it (env -u) so it binds inside its own claim; every other checkout receives this lane's migrated tools by rsync and the plan band by environment)
  # ORDER-LIGHT-COMPANION: the degraded boots render the LEGACY room; gistallpre = the pre-companion hybrid (RECORD, ≫ 1 vs main). Refuter round: a boot
  # whose GI stalled (no floor lightmap) or whose rig leaf never landed (no fixture rig) is compared with its OWN ?venue=off twin under the same
  # stall (land11: the floor read 1.18 / 0.89 of main's GI-lit, rig-lit baseline — not a hybrid, a different legacy room); leafstall (the rig leaf
  # present, the venue flag leaf stalled) keeps main's baseline
  for GS in gistallpre leafstall; do
    step pairs-room-$GS python3 tools/render/lighting-room-pairs.py --a "$ROOT/reads-render/after-$TAG-$GS" --b "$ROOT/reads-render/before" --label main
  done
  for GS in gistall leafstall2; do
    step pairs-room-$GS python3 tools/render/lighting-room-pairs.py --a "$ROOT/reads-render/after-$TAG-$GS" --b "$ROOT/reads-render/after-$TAG-${GS}off" --label off-twin
  done
  # C2: the failed-load boots keep their diffuse (crown vs the ?venue=off twin) and the legacy-settle arm waits
  step pairs-gifail python3 tools/render/lighting-contract-pairs.py --a "$ROOT/reads-render/after-$TAG-gifail" --b "$ROOT/reads-render/after-$TAG-gifailoff" --label gifailoff
  step pairs-gifailnk python3 tools/render/lighting-contract-pairs.py --a "$ROOT/reads-render/after-$TAG-gifailnk" --b "$ROOT/reads-render/after-$TAG-gifailoff" --label gifailoff
  for MX in "${MIXED[@]}"; do
    step pairs-mix$MX python3 tools/render/lighting-contract-pairs.py --a "$ROOT/reads-render/after-$TAG-mix$MX" --b "$ROOT/reads-render/after-$TAG-mix${MX}off" --label mix${MX}off
  done
  # ORDER-LIGHT-11 R-A: the per-receiver energy ledger (source cells + measured shares) merged into the poke sets' reads
  step ledger python3 tools/render/lighting-ledger.py --after "$ROOT/reads-render/after-$TAG" --scope "$ROOT/reads-render/after-$TAG-scope" --offscope "$ROOT/reads-render/after-$TAG-offscope" \
    --ledgerarm "$ROOT/reads-render/after-$TAG-ledgerarm" --legacyrect "$ROOT/reads-render/after-$TAG-legacyrect" --out "$ROOT/ledger-$TAG.md" --json "$ROOT/ledger-$TAG.json" --png "$ROOT/ledger-$TAG.png"
  step switch-arm python3 tools/render/lighting-switch-arm.py --switch "$ROOT/after-$TAG-switch" --fresh "$AFTER" --reads "$ROOT/reads-render/after-$TAG-switch" --poses full34,cueball_level \
    --case "reenv=$ROOT/after-$TAG-switchenv,$AFTER,switchjoyenv" --case "off=$ROOT/after-$TAG-offswitch,$ROOT/after-$TAG-offjoy,switchjoy"
  step switch-arm-leak python3 tools/render/lighting-switch-arm.py --switch "$ROOT/after-$TAG-hookleak" --fresh "$AFTER" --reads "$ROOT/reads-render/after-$TAG-hookleak" --poses full34
  # land8 attempt 6 arm: point the nogiarm alt at the very reads it must differ from. The nine rows arming from it must be
  # caught as NOT-AN-ARM by check-arms (exit 3) — the synthetic trigger for the detector attempt 6's mis-based arms slipped past.
  GATE_ARM=(); [ "${OB_SEAL_ARM:-}" = "armbase" ] && GATE_ARM=(--force-armbase nogiarm=nogi)
  [ "${OB_SEAL_ARM:-}" = "gate" ] && GATE_ARM=(--force-fail); [ "${OB_SEAL_ARM:-}" = "silent" ] && GATE_ARM=(--force-silent-record); [ "${OB_SEAL_ARM:-}" = "missing" ] && GATE_ARM=(--force-missing fixture --force-missing ledger --force-missing census)
  # ORDER-LAND-638-FIX4 verifier item 3: pinmove = the committed probe pin shifted in memory by 2 × each pinned row's own tolerance
  # (2·pm − pm = pm: outside the band on every coefficient) — the PROBE-pin rows must FAIL on their REAL reads (the +inf
  # "absent probe" convention is gone; the rows arm on a different real probe), the gate exits 3 and the seal ≠ 0
  [ "${OB_SEAL_ARM:-}" = "pinmove" ] && GATE_ARM=(--force-pin-shift 2)
  # ORDER-LIGHT-FIX6 (review r10 P2, gate.py:228-231): a shift no pinned row fails on must read NOT FIRED (gate exit 7), never "fired"
  [ "${OB_SEAL_ARM:-}" = "pinzero" ] && GATE_ARM=(--force-pin-shift 0)
  # C2-FIX9 reverse-pin arm (maintainer condition after the land31 regate of record): every DECLARED NO-READ row's reverse pin is broken in
  # memory — the gate must FAIL by name (exit 3) inside the gate, with the control's row counts on the GATE line
  [ "${OB_SEAL_ARM:-}" = "noreadpin" ] && GATE_ARM=(--force-noread-pin)
  # C2-FIX10: the forward-expiry arm (every declared row given its quantity in memory must become judged and FAIL) and the undeclared-unarmed refusal arm
  [ "${OB_SEAL_ARM:-}" = "noreadexpire" ] && GATE_ARM=(--force-noread-expire)
  [ "${OB_SEAL_ARM:-}" = "unarmednote" ] && GATE_ARM=(--force-unarmed)
  ALTS=(); for X in "${ARMS[@]}"; do ALTS+=(--alt "$X=$ROOT/reads-render/after-$TAG-$X"); done
  ALTS+=(--alt "after=$ROOT/reads-render/after-$TAG")  # ORDER-LAND-638-FIX: rows may arm against the default after set
  # ORDER-LIGHT-7 R-D: the armed run writes its OWN gate files — it must never overwrite the sealed gate-<tag>.*
  GATE_OUT="$ROOT/gate-$TAG"; [ -n "${OB_SEAL_ARM:-}" ] && GATE_OUT="$ROOT/gate-$TAG-arm-${OB_SEAL_ARM}"
  # ORDER-LIGHT-L25 (attempt 6): the arms' PRECONDITION, judged before the gate writes anything — every armed row's arm read
  # must resolve, and must not be bit-identical to the row's own measurement. Both failures are arms that prove nothing; they
  # used to reach the operator only as the one word "SILENT", mixed in with genuine non-firing arms.
  step check-arms python3 tools/render/lighting-gate.py --spec "$SPEC" --reads "$ROOT/reads-render/after-$TAG" --red-arm-reads "$ROOT/reads-render/before" \
    "${ALTS[@]}" "${GATE_ARM[@]}" --check-arms
  step gate python3 tools/render/lighting-gate.py --spec "$SPEC" --reads "$ROOT/reads-render/after-$TAG" --red-arm-reads "$ROOT/reads-render/before" --regen-check \
    "${ALTS[@]}" "${GATE_ARM[@]}" --out "$GATE_OUT.md" --json "$GATE_OUT.json"
  # ORDER-LIGHT-C2-FIX1 class C: the committed LUT judged against the exact integral at h/r 2 / 4 / 8 / 10 / 16 / 32 (the far tail's error must stay
  # under the table's own interpolation error) — exit 4 = FAIL; the arm occlutpre judges the pre-FIX1 LUT the same way (clamped read → fails at 10)
  step occlut-check node tools/render/lighting-occlusion-lut.mjs --check
  # ORDER-LIGHT-C2-FIX1 class B arm: FENCE_NEW_OVERRIDE points the SEAL's own fence invocation (no --room-strict) at a root with one visible room
  # mesh's shader witness nulled — the verdict must FAIL by name (exit 3)
  FENCE_NEW="${FENCE_NEW_OVERRIDE:-$AFTER}"
  # (refuter) an ARMED run writes its OWN fence files — the sealed fence-<tag>.md is never overwritten by an arm (the R-D law the gate already follows)
  FENCE_OUT="$ROOT/fence-$TAG"; [ -n "${OB_SEAL_ARM:-}" ] && FENCE_OUT="$ROOT/fence-$TAG-arm-${OB_SEAL_ARM}"
  step fence python3 tools/render/lighting-fence.py --base "$BEFORE" --new "$FENCE_NEW" \
    --tables wpa_generic_9ft,wpa_spec_9ft,diamond_redlabel_9ft,diamond_proam_9ft,predator_apex_9ft,wpbsa_snooker_12ft,umb_carom_284,chinese8_pro_9ft,joy_q8_9ft,pool_pro_9ft_measured \
    --expect-moved chinese8_pro_9ft:cn8-cushion --expect-moved joy_q8_9ft:cn8-cushion --expect-moved-reason "PR #672 (main bba046aa, merged at LANDPREP-1): the chinese8 middle-rail-end mesh (cn8mid / cn8midlaw / table.js jointTuck) — main's own change on the two non-target chinese8 tables, named per NOTE-672-LANDED; nothing re-pinned by the lane" \
    --looks default,sp --red-arm --room-report --program-report --program-arm "$ROOT/after-$TAG-arm" --out "$FENCE_OUT.md" --json "$FENCE_OUT.json"
  PM=(); [ -f "$PHOTOMAP" ] && PM=(--photo-map "$PHOTOMAP")
  step delta python3 tools/render/lighting-delta.py --before "$BEFORE" --after "$AFTER" --out "$ROOT/delta-$TAG" "${PM[@]}"
  echo "[seal] done $(date -u +%FT%TZ) exit 0"
} > "$LOG" 2>&1
