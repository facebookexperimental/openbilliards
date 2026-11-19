#!/bin/zsh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# lighting-prelaunch.sh — the PRE-LAUNCH CHECKLIST (maintainer law 2026-09-13 ~18:40Z, after the land26 / land27 relaunches: a stale duplicate
# capture line, a stale symptom text and a generator SyntaxError each reached a launch; all were caught closed, none reached evidence, but five
# relaunches was the cost). Every seal / regate / arm driver runs this FIRST and prints its receipt as the first lines of its log; a launch
# without the receipt is not a launch. Checks (eleven receipt lines; any FAIL → exit 1):
#   1 shell syntax of the seal and of the driver;  2 every python tool under tools/render compiles;  3 the lighting mjs tools parse (node --check);
#   4 the fixture is FRESH (the generator, run to a temp path, reproduces the committed fixture byte for byte);  5 --check-keys;
#   6 the fixture's symptom texts vs the parameters they name: every `hold:<ms>` / `venueConverge=<mode>` token named in
#     a C2AC-h3-<set>-derived symptom appears in the seal's `step capture-<set>` line, and every such token in that step appears in the symptom;
#   7 no capture step is declared twice (literal `step capture-<name>` lines; loop-generated names with `$` are exempt);
#   8 the driver's OB_SEAL_CAPTURE_ONLY sets each have a `step capture-<set>` in the seal;  9 the tracked tree is clean (the export = HEAD).
#   11 (C2-FIX9, after land28/29): the fresh-capture list is DERIVED — every reuse target's censuses read, N8 / foreign-root / missing sets must be in the driver's list.
# usage: tools/render/lighting-prelaunch.sh <driver.sh> [--retroactive]   (from the lane worktree root)
set -u; set -o pipefail; setopt null_glob
DRIVER="${1:?driver script}"; SEAL=tools/render/lighting-seal.sh; GEN=tools/render/lighting-gate-spec.py; FIX=tools/render/fixtures/lighting-gate-spec.json
fail=0; n=0; BUD=$(grep -oE '^const VENUE_GI_WINDOW_MS = [0-9]+' web/app/main.js 2>/dev/null | grep -oE '[0-9]+$')
ok() { n=$((n+1)); echo "[prelaunch] ok  $1"; }
bad() { n=$((n+1)); fail=$((fail+1)); echo "[prelaunch] FAIL $1"; }
# ORDER-LIGHT-C2-FIX9 N9 P3-5 (refuter evidence): a receipt produced AFTER the launch it describes must say so in its own body. The tool derives the
# tag from the driver's name (ob-<tag>-<kind>.sh) and reads the chain log / pid file: a chain log with a START line, or a pid file naming a live driver,
# means the launch already happened → the body carries `RETROACTIVE CHECK — not a launch receipt` (also forced by --retroactive).
echo "[prelaunch] START $(date -u +%FT%TZ) HEAD $(git rev-parse --short=8 HEAD) driver $DRIVER"
DTAG=$(basename "$DRIVER" | sed -nE 's/^ob-(land[0-9]+)-.*\.sh$/\1/p'); RETRO=0; RETRO_WHY=""
[ "${2:-}" = "--retroactive" ] && { RETRO=1; RETRO_WHY="--retroactive given"; }
if [ -n "$DTAG" ] && [ -s "output/lighting/chain-$DTAG.log" ] && grep -q "\[chain[0-9]*\] START " "output/lighting/chain-$DTAG.log" 2>/dev/null; then RETRO=1; RETRO_WHY="output/lighting/chain-$DTAG.log already carries a START line ($(grep -m1 -o 'START [^ ]*' "output/lighting/chain-$DTAG.log"))"; fi
# the pid file may name THIS launch's own driver (the launcher writes it before the driver runs this checklist — land28 attempt 1 refused itself on it):
# a pid that is an ANCESTOR of this process is the launching driver, not a previous one
ANC=""; _p=$$; while [ "$_p" -gt 1 ] 2>/dev/null; do ANC="$ANC $_p"; _p=$(ps -o ppid= -p "$_p" 2>/dev/null | tr -d ' '); [ -n "$_p" ] || break; done
if [ -n "$DTAG" ] && [ -s "/tmp/ob-$DTAG-chain.pid" ]; then LP=$(cat "/tmp/ob-$DTAG-chain.pid" 2>/dev/null | tr -d ' ')
  case " $ANC " in *" $LP "*) echo "[prelaunch] note: /tmp/ob-$DTAG-chain.pid names this launch's own driver (pid $LP, an ancestor) — not a previous launch";;
    *) if [ -n "$LP" ] && kill -0 "$LP" 2>/dev/null; then RETRO=1; RETRO_WHY="${RETRO_WHY:+$RETRO_WHY; }/tmp/ob-$DTAG-chain.pid names a LIVE driver (pid $LP, not an ancestor of this check)"; fi;; esac
fi
[ $RETRO = 1 ] && echo "[prelaunch] RETROACTIVE CHECK — not a launch receipt ($RETRO_WHY)"
# 1 shell syntax
zsh -n "$SEAL" 2>/dev/null && ok "seal shell syntax ($SEAL)" || bad "seal shell syntax"
zsh -n "$DRIVER" 2>/dev/null && ok "driver shell syntax ($DRIVER)" || bad "driver shell syntax"
# C2-FIX10 item 12 (land33 attempt 1; the maintainer's ruling 2026-09-14 15:5xZ): zsh applies history-style MODIFIERS to `$name:x` and consumes a MAXIMAL RUN of
# modifier letters after the colon (`:w` is the identity on a one-word value and invisible to a probe, then `:e` fires) — so this check is NOT keyed on an alphabet.
# It flags EVERY unbraced `$NAME:` followed by a letter in every tracked lane shell file and resolves each hit by MEASUREMENT: the braced and unbraced expansions
# of the literal are printed side by side under a probe value; identical ⇒ the line may carry the annotation `# zsh-colon: measured identical` (with the pair) and
# stops being a hit; different ⇒ FAIL until braced. Default remedy: brace it — braces cost nothing and remove the class. Lines that are comments or quoted grep
# patterns (this check's own) are data, not expansion, and carry the same annotation.
Z12=$(python3 - <<'PY'
import re, sys, subprocess, os, glob
# the file set is globbed HERE (a shell glob with no match aborts a zsh command line; python's glob does not); an escaped dollar (\$) is data, not an expansion
files = sorted(set(glob.glob('tools/render/*.sh') + glob.glob('tools/render/lib/*.sh') + glob.glob('web/tools/*.sh')))
hits = []
for f in files:
    for n, line in enumerate(open(f, errors='ignore').read().split('\n'), 1):
        for m in re.finditer(r'\$([A-Za-z_][A-Za-z0-9_]*):([A-Za-z][A-Za-z0-9_./-]*)', line):
            if 'zsh-colon: measured identical' in line or line.lstrip().startswith('#') or (m.start() > 0 and line[m.start()-1] == '\\'):
                continue
            name, tail = m.group(1), m.group(2)
            # measure: a probe value with no dot and one word (the shape of an export path) under both spellings
            probe = '/tmp/probe-value'
            br = subprocess.run(['zsh', '-c', f'{name}="{probe}"; print -r -- "${{{name}}}:{tail}"'], capture_output=True, text=True).stdout.strip()
            un = subprocess.run(['zsh', '-c', f'{name}="{probe}"; print -r -- "${name}:{tail}"'], capture_output=True, text=True).stdout.strip()
            hits.append((f, n, m.group(0), br, un, br == un))
bad = [h for h in hits if not h[5]]
for f, n, lit, br, un, same in hits:
    print(f"{'ok ' if same else 'BAD'} {f}:{n} {lit} → braced '{br}' unbraced '{un}'")
sys.exit(1 if bad else 0)
PY
)
Z12RC=$?; if [ $Z12RC = 0 ]; then ok "zsh colon-modifier sweep: every unbraced \$NAME:letter in the lane's shell files measures identical braced vs unbraced ($(echo "$Z12" | grep -c '^ok ' ) site(s) annotated/benign)"; else bad "zsh colon-modifier sweep: an unbraced \$NAME:letter expands DIFFERENTLY braced vs unbraced — brace it: $(echo "$Z12" | grep '^BAD' | head -3 | tr '\n' ' ')"; fi
# 2 python tools compile
PYBAD=$(for f in tools/render/*.py tools/render/lib/*.py; do [ -f "$f" ] || continue; python3 -m py_compile "$f" 2>/dev/null || echo "$f"; done)
[ -z "$PYBAD" ] && ok "python tools compile ($(ls tools/render/*.py | wc -l | tr -d ' ') files)" || bad "python tools do not compile: $(echo $PYBAD | tr '\n' ' ')"
# 3 mjs tools parse
JSBAD=$(for f in tools/render/lighting-*.mjs tools/render/lib/lighting-*.mjs; do [ -f "$f" ] || continue; node --check "$f" 2>/dev/null || echo "$f"; done)
[ -z "$JSBAD" ] && ok "lighting mjs tools parse" || bad "mjs tools do not parse: $(echo $JSBAD | tr '\n' ' ')"
# 4 fixture freshness
TMPF=$(mktemp /tmp/ob-prelaunch-fixture.XXXXXX)
if python3 "$GEN" --out "$TMPF" > /dev/null 2>&1; then
  if cmp -s "$TMPF" "$FIX"; then ok "fixture fresh (the generator reproduces $FIX byte for byte)"; else bad "fixture STALE: the generator's output differs from the committed $FIX ($(diff <(python3 -c "import json,sys; [print(r['id']) for r in json.load(open(sys.argv[1]))['rows']]" "$FIX" 2>/dev/null) <(python3 -c "import json,sys; [print(r['id']) for r in json.load(open(sys.argv[1]))['rows']]" "$TMPF" 2>/dev/null) | grep -c '^[<>]') row ids differ; content diff otherwise)"; fi
else bad "the generator failed to run"; fi
[ -f "$TMPF" ] && : > "$TMPF"
# 5 check-keys
python3 "$GEN" --check-keys > /tmp/ob-prelaunch-keys.log 2>&1 && ok "--check-keys ($(grep -o 'OK[^\n]\{0,40\}' /tmp/ob-prelaunch-keys.log | head -1 | cut -c1-40))" || bad "--check-keys exit $? ($(tail -1 /tmp/ob-prelaunch-keys.log | cut -c1-120))"
# 6 symptom texts vs the seal's parameters
python3 - "$FIX" "$SEAL" <<'PY' && ok "symptom texts name the seal's parameters (C2AC-h3-*-derived rows)" || bad "a symptom text names a parameter the seal does not run (see above)"
import json, re, sys
rows = json.load(open(sys.argv[1]))['rows']; seal = open(sys.argv[2]).read(); bad = 0
def toks(t): return set(re.findall(r'hold:\d+|venueConverge=\w+', t))  # the parameters; venueAccept names the twin's rule on both sides and is not compared
for r in rows:
    m = re.match(r'C2AC-h3-(\w+)-derived$', r['id'])
    if not m: continue
    s = m.group(1); st = re.search(rf'^\s*step capture-{s} .*$', seal, re.M)
    if not st: print(f'[prelaunch]   {r["id"]}: no `step capture-{s}` in the seal'); bad += 1; continue
    a = toks(r.get('symptom', '')); b = toks(st.group(0))
    if not a: continue
    if a - b: print(f'[prelaunch]   {r["id"]}: symptom names {sorted(a - b)} not in `step capture-{s}` ({sorted(b)})'); bad += 1
    if b - a: print(f'[prelaunch]   {r["id"]}: `step capture-{s}` runs {sorted(b - a)} the symptom does not name'); bad += 1
sys.exit(1 if bad else 0)
PY
# 7 duplicate capture steps
DUP=$(grep -oE '^\s*step capture-[A-Za-z0-9_-]+( |$)' "$SEAL" | awk '{print $2}' | sort | uniq -d)
[ -z "$DUP" ] && ok "no literal capture step declared twice ($(grep -cE '^\s*step capture-[A-Za-z0-9_-]+( |$)' "$SEAL") literal capture steps)" || bad "capture step declared twice: $(echo $DUP | tr '\n' ' ')"
# 8 the driver's capture-only sets exist in the seal
CO=$(grep -oE 'OB_SEAL_CAPTURE_ONLY="[^"]*"' "$DRIVER" | head -1 | sed 's/.*="//; s/"$//')
MISS=""; for s in ${=CO}; do grep -qE "^\s*step capture-$s( |$)" "$SEAL" || MISS="$MISS $s"; done
[ -z "$MISS" ] && ok "driver capture-only sets all declared in the seal ($(echo $CO | wc -w | tr -d ' ') sets)" || bad "capture-only sets without a seal step:$MISS"
# 11 (ORDER-LIGHT-C2-FIX9, maintainer steer after land28/land29 stopped three times on the same rule): the fresh-capture list is DERIVED here, never hand-listed.
#    For every literal `step capture-<set>` of the seal the driver would REUSE (not in OB_SEAL_CAPTURE_ONLY), the reuse target after-<REUSE_TAG>-<set> is
#    resolved through its link chain and every census under it is read: a cell with venueWaitedMs >= VENUE_GI_WINDOW_MS (main.js) makes the set FRESH by the
#    N8 rule; a set the reuse tag does not have is FRESH; a REAL set of this tag left by a stopped attempt whose manifest names another tree (a foreign-root
#    step) cannot be reused by the manifest-sha rule — FRESH, or a NEW TAG if it is already sealed.
#    The derived list is printed with its numbers; the driver's list must contain every derived set, else REFUSED.
# C2-FIX10 (land37 attempt 1 stopped at check-arms, 17:56Z): the derivation is re-built. It iterates EVERY `step capture-<set>` of the seal — the sets the driver
# would REUSE as well as the ones it lists — and REFUSES when a set the rule requires fresh is absent from the driver's list (the previous form iterated the
# driver's own list only, so it could describe but never refuse: a PASS-only receipt). New rule beside N8 / missing / foreign-root: a set that an ARMED row
# (arm_from) or a JUDGED row (reads_from) reads a `census:` quantity from must carry that census field under the reuse tag — a reused set captured by an older
# page.mjs lacks every key added since, and the row can only NO-READ at check-arms an hour in (land37: C2AE-b-ballift-lifted on the reused `after`).
if [ -n "${CO:-}" ]; then
DER=$(python3 - "$SEAL" "$DRIVER" "$CO" "${OB_PRELAUNCH_ARM:-}" <<'PY'
import os, re, sys, glob, json
seal, driver, co, ARM = open(sys.argv[1]).read(), open(sys.argv[2]).read(), set(sys.argv[3].split()), sys.argv[4]
def resolve_out(cmd, seal):
    om = re.search(r'--out\s+("[^"]*"|\S+)', cmd)
    if not om: return None
    v = om.group(1).strip('"'); assigns = dict(re.findall(r'(?:^|;)\s*([A-Z][A-Z0-9_]*)=("[^"]*"|[^;\s]+)', seal, re.M))
    for _ in range(4):
        def sub(mm):
            k = mm.group(1)
            if k in ('TAG', 'ROOT', 'PWD'): return mm.group(0)
            return assigns.get(k, mm.group(0)).strip('"') if k in assigns else mm.group(0)
        nv = re.sub(r'\$\{?([A-Z][A-Z0-9_]*)\}?', sub, v)
        if nv == v: break
        v = nv
    v = v.replace('$PWD/', '').replace('$ROOT/', '').replace('output/lighting/', '')
    return v
m = re.search(r'OB_SEAL_REUSE_TAG=(\S+)', driver); reuse = m.group(1).strip('"\'') if m else None
bud = int((re.search(r'^const VENUE_GI_WINDOW_MS = (\d+)', open('web/app/main.js').read(), re.M) or [None, '0'])[1])
cmds = dict(re.findall(r'^\s*step capture-([A-Za-z0-9_-]+) (.*)$', seal, re.M))
# A1 (maintainer 18:0xZ): a reuse target is a LINK into an older tag as often as not — every set is resolved to its REAL capturing root (realpath) and the
# census is read THERE; the resolved root is printed per set (the list, not a count); a dangling link anywhere under the reuse tag's set tree is a refusal now
dangling = []
if reuse:
    for d in glob.glob(f'output/lighting/after-{reuse}*'):
        for root, dirs, files in os.walk(d, followlinks=True):
            for nme in files + dirs:
                pp = os.path.join(root, nme)
                if os.path.islink(pp) and not os.path.exists(pp): dangling.append(pp)
        if os.path.islink(d) and not os.path.exists(d): dangling.append(d)
# the RAW-key witness: a census key counts as raw (capturable) only if some REAL set of the reuse tag records it — derived blocks (contractPairs / roomPairs,
# the reads step's enrichments) never appear in a raw census.json; this discriminator is measured from the inventory, never from a name
def paths_of(j, prefix=()):
    out = set()
    if isinstance(j, dict):
        for k, v in j.items(): out.add(prefix + (k,)); out |= paths_of(v, prefix + (k,))
    return out
rawkeys = set(); witness_files = 0; witness_sets = []
if reuse:
    for d in sorted(glob.glob(f'output/lighting/after-{reuse}*')):
        if os.path.islink(d): continue
        witness_sets.append(os.path.basename(d))
        for f in glob.glob(os.path.join(d, '**', 'census.json'), recursive=True):
            try: rawkeys |= paths_of(json.load(open(f))); witness_files += 1
            except Exception: pass
# the CURRENT tool's schema is the first witness (the reuse tag's real sets predate the very keys this rule exists for): a quantity's LEAF key that lighting-page.mjs
# emits (`key:` in its census source) is a raw census key; the inventory union stays as the second witness
pagesrc = open('tools/render/lib/lighting-page.mjs').read(); pagekeys = set(re.findall(r'\b([A-Za-z_][A-Za-z0-9_]*)\s*:', pagesrc))
def is_raw(path): return bool(path) and (path in rawkeys or path[-1] in pagekeys)
fx = json.load(open('tools/render/fixtures/lighting-gate-spec.json')); rows = fx['rows'] if isinstance(fx, dict) and 'rows' in fx else fx
if ARM == 'readsfrom':  # A2 constructed cell: a JUDGED row (reads_from) whose census field the reuse target lacks — the receipt must name row and key
    rows = list(rows) + [{'id': 'ARM-readsfrom-planted', 'quantity': 'census:contract:venueBallLiftApplied', 'reads_from': 'occ', 'table': 'predator_apex_9ft', 'look': 'default', 'pose': 'cueball_level'}]
reads = {}
for r in rows:
    q = str(r.get('quantity') or '')
    if not q.startswith('census:'): continue
    path = tuple(q.split(':')[1:])
    for key, tbl in (('reads_from', r.get('table')), ('arm_from', r.get('arm_table') or r.get('table'))):
        st = r.get(key)
        if key == 'arm_from' and not r.get('arm'): continue
        if st: reads.setdefault(st, []).append((r.get('id'), key, r.get('look'), tbl, path))
def has_field(real, look, table, path):
    base = os.path.join(real, look or '', table or '')
    files = glob.glob(os.path.join(base, '**', 'census.json'), recursive=True) if os.path.isdir(base) else []
    if not files: return None
    for f in files:
        try: j = json.load(open(f))
        except Exception: continue
        cur = j; ok = True
        for k in path:
            if isinstance(cur, dict) and k in cur: cur = cur[k]
            else: ok = False; break
        if ok: return True
    return False
ASSIGNS = dict(re.findall(r'(?:^|;)\s*([A-Z][A-Z0-9_]*)=("[^"]*"|\'[^\']*\'|[^;\s]+)', seal, re.M))
def resolve_flags(v):
    for _ in range(6):
        nv = re.sub(r'\$\{([A-Za-z_][A-Za-z0-9_]*):-([^}]*)\}', lambda m: m.group(2), v)            # ${X:-default} → default (the seal's own fallback value)
        nv = re.sub(r'\$\{?([A-Z][A-Z0-9_]*)\}?', lambda m: ASSIGNS[m.group(1)].strip('"\'') if m.group(1) in ASSIGNS and m.group(1) not in ('TAG', 'ROOT') else m.group(0), nv)
        if nv == v: break
        v = nv
    return v
flags_unjudged = []
listed, missing, resolved, fresh_named = [], [], [], {}
for name, cmd in sorted(cmds.items()):
    why = []
    out = resolve_out(cmd, seal) or f'after-$TAG-{name}'
    if '$TAG' not in out: continue
    if 'lighting-capture-from.sh' in cmd and name in co: why.append('foreign-root (its manifest names another tree; fine by link, never as a real set of this tag)')
    tgt = ('output/lighting/' + out.replace('$TAG', reuse)) if reuse else None; worst = None
    if tgt and os.path.exists(tgt):
        real = os.path.realpath(tgt); rtag = (re.search(r'after-(land\d+)', os.path.basename(real)) or [None, '?'])[1]
        resolved.append(f"{name}: {tgt} -> {real} (really lives in {rtag})")
        for f in glob.glob(os.path.join(real, '**', 'census.json'), recursive=True):
            try: w = (json.load(open(f)).get('contract') or {}).get('venueWaitedMs')
            except Exception: continue
            if isinstance(w, (int, float)) and (worst is None or w > worst): worst = w
        if worst is not None and worst >= bud: why.append(f'reuse target waited {int(worst)} ms >= {bud} (N8)')
        lacking = []
        for rid, key, look, tbl, path in reads.get(name, []):
            if not is_raw(path): continue   # not a raw census key by either witness (page.mjs schema, inventory): the reads/pairs steps derive it — not this rule's call
            if has_field(real, look, tbl, path) is False: lacking.append(f"{rid} ({key}) reads {':'.join(path)} at {look}/{tbl}")
        # a capture-side FLAG change on the set itself (land39: venueConverge=strict added to ballift): the reuse target's manifest.flags must equal the seal step's --flags
        fm = re.search(r'--flags\s+("([^"]*)"|\'([^\']*)\'|(\S+))', cmd); want = next((x for x in (fm.groups()[1:] if fm else []) if x is not None), '') if fm else ''
        want = resolve_flags(want.strip('"\''))
        try: have = str(json.load(open(os.path.join(real, 'manifest.json'))).get('flags', '') or '')
        except Exception: have = '(manifest unreadable)'
        if '$' in want: flags_unjudged.append(f"{name} ({want!r})")
        elif want != have: why.append(f"reuse target was captured with flags {have!r} but the seal now captures {name} with {want!r} (a capture-side change on the set)")
        if lacking: why.append('reuse target lacks a census field a row reads: ' + '; '.join(sorted(set(lacking))[:4]) + (f' (+{len(set(lacking))-4} more)' if len(set(lacking)) > 4 else ''))
    elif tgt: why.append(f'no set under {reuse}')
    if why: fresh_named[name] = '; '.join(why)
    if name in co: listed.append(f"{name} ({'; '.join(why) if why else 'listed by the driver, not required by the rule'})")
    elif why: missing.append(f"{name} ({'; '.join(why)})")
req = [r for r in listed if 'not required by the rule' not in r]; extra = [r for r in listed if 'not required by the rule' in r]
print(f'[prelaunch] fresh-capture derivation over {len(cmds)} capture steps of the seal (reuse tag {reuse}; rules: N8 >= {bud} ms, missing under the reuse tag, foreign-root, a RAW census field an armed/judged row reads): driver lists {len(co)} = {len(req)} required + {len(extra)} beyond the rule' + (f'; ARM {ARM} (a planted reads_from row)' if ARM else ''))
print(f'[prelaunch] raw-key witness: {len(pagekeys)} key names emitted by the CURRENT lighting-page.mjs + {len(rawkeys)} key paths over {witness_files} census files of the {len(witness_sets)} REAL set(s) of {reuse} ({", ".join(witness_sets[:4])}{" …" if len(witness_sets) > 4 else ""})')
# A3: the guard scored in the other direction — how much it marks FRESH, and what named each set
n8 = [n for n, w in fresh_named.items() if '(N8)' in w]; keyed = [n for n, w in fresh_named.items() if 'lacks a census field' in w]; nos = [n for n, w in fresh_named.items() if 'no set under' in w]; flg = [n for n, w in fresh_named.items() if 'captured with flags' in w]
print(f'[prelaunch] FRESH-required by the rule: {len(fresh_named)} set(s) = {len(n8)} N8 ({", ".join(sorted(n8))}) + {len(keyed)} census-field ({", ".join(sorted(keyed))}) + {len(flg)} flags-changed ({", ".join(sorted(flg))}) + {len(nos)} missing under the reuse tag ({", ".join(sorted(nos))})')
for n in sorted(keyed): print(f'[prelaunch]   named by: {n} <- {fresh_named[n]}')
for n in sorted(flg): print(f'[prelaunch]   named by: {n} <- {fresh_named[n]}')
print(f'[prelaunch] flags rule: {len(flags_unjudged)} set(s) UNJUDGED (their --flags carry a shell value the receipt cannot resolve): ' + (', '.join(flags_unjudged) if flags_unjudged else 'none'))
for r in resolved: print('[prelaunch]   resolved: ' + r)
for r in listed: print('[prelaunch]   listed: ' + r)
for r in missing: print('[prelaunch]   REQUIRED BUT NOT LISTED: ' + r)
for d in dangling: print('[prelaunch]   DANGLING LINK under the reuse tag: ' + d)
sys.exit(1 if (missing or dangling) else 0)
PY
)
DRC=$?; echo "$DER"
if [ "$DRC" = 0 ]; then ok "fresh-capture list DERIVED over every capture step (reuse targets read: N8, missing, foreign-root, census fields the armed/judged rows read) — the driver's list covers every required set"
else bad "fresh-capture list INCOMPLETE or a dangling link: $(echo "$DER" | grep -c 'REQUIRED BUT NOT LISTED') required set(s) missing from the driver's list, $(echo "$DER" | grep -c 'DANGLING LINK') dangling link(s) — $(echo "$DER" | grep -m1 -E 'REQUIRED BUT NOT LISTED|DANGLING LINK' | cut -c1-200)"; fi
else ok "fresh-capture list: the driver reuses nothing (no OB_SEAL_CAPTURE_ONLY) — nothing to derive"; fi
# 13 (C2-FIX10 condition 1) the sensitivity poke is DERIVED from the seal's one converged-frame text: CONV_JS must end with CONV_TAIL exactly (else the seal
# stops at derive-sens-poke exit 24 — better refused here than nine minutes into a control block)
python3 - <<'PY' && ok "sensitivity poke derivable: the seal's CONV_JS ends with its CONV_TAIL (one converged-frame text, no second copy)" || bad "sensitivity poke NOT derivable from CONV_JS (CONV_TAIL mismatch) — the seal would stop at derive-sens-poke exit 24"
import re, sys
s = open('tools/render/lighting-seal.sh').read()
m = re.search(r"^\s*CONV_JS='(.*?)'\s*$", s, re.M); t = re.search(r'^\s*CONV_TAIL="(.*?)"\s*$', s, re.M)
if not m or not t: print('[prelaunch] CONV_JS or CONV_TAIL literal not found'); sys.exit(1)
ok = m.group(1).endswith(t.group(1)); print(f"[prelaunch] CONV_JS {len(m.group(1))} bytes, CONV_TAIL {t.group(1)!r}: {'ends with it' if ok else 'DOES NOT end with it'}"); sys.exit(0 if ok else 1)
PY
# 9 clean tracked tree
[ "$(git status --porcelain | grep -v '^??' | wc -l | tr -d ' ')" = 0 ] && ok "tracked tree clean (the export will equal HEAD)" || bad "tracked tree dirty: $(git status --porcelain | grep -v '^??' | head -3 | tr '\n' ' ')"
if [ $fail = 0 ]; then if [ $RETRO = 1 ]; then echo "[prelaunch] RETROACTIVE CHECK OK — $n checks passed $(date -u +%FT%TZ) HEAD $(git rev-parse --short=8 HEAD) — NOT a launch receipt"; else echo "[prelaunch] RECEIPT OK — $n checks passed $(date -u +%FT%TZ) HEAD $(git rev-parse --short=8 HEAD)"; fi; exit 0; fi
echo "[prelaunch] REFUSED — $fail of $n checks failed $(date -u +%FT%TZ)"; exit 1
