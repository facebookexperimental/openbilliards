#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

# GH-638 / #727 — B-PASS LEDGER generator (ORDER-LIGHT-C2-FIX16 S3): every cell-B run across every rotation of its receipt, one row per
# `VERDICT RE-DERIVATION START` line, with the run's driver sha, its commit binding (by BLOB content over `git log -- driver`; a binding
# whose commit time is AFTER the START is said so — the run was under a then-uncommitted working tree) and its outcome read from the
# segment's own SELFTEST-VERDICT line (no default word: a segment without one reads NO VERDICT LINE).
#   python3 tools/render/lighting-bpass-ledger.py <out.md> [--chain]      --chain appends ONE line to output/lighting/chain-land41.log (real regeneration only)
import glob, hashlib, os, re, subprocess, sys, datetime, json
OUT = sys.argv[1]; CHAIN = '--chain' in sys.argv[2:]
DRIVER = 'tools/render/lighting-land41-verdict.sh'
GEN = os.path.relpath(os.path.abspath(__file__)) if os.path.abspath(__file__).startswith(os.getcwd() + os.sep) else os.path.abspath(__file__); GEN_SHA = hashlib.sha256(open(GEN, 'rb').read()).hexdigest()[:12]
now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
def git(*a): return subprocess.run(['git', *a], capture_output=True, text=True, check=True).stdout
# blob-content → commit map over the driver's history (newest first; the OLDEST commit carrying that content is the binding)
binding = {}
for line in git('log', '--format=%h %cI %H', '--', DRIVER).splitlines():
    short, ctime, full = line.split(' ')
    blob = subprocess.run(['git', 'show', f'{full}:{DRIVER}'], capture_output=True, check=True).stdout
    binding[hashlib.sha256(blob).hexdigest()[:12]] = (short, ctime)  # later (older) entries overwrite → oldest commit with that content
files = sorted(glob.glob('output/lighting/chain-land41-verdict-selftest-B-realfiles*.log'))
rows = []; starts_total = 0
START = re.compile(r'^\[chain41\] VERDICT RE-DERIVATION START (\S+) driver \S+ sha ([0-9a-f]{12})')
for f in files:
    L = open(f, errors='replace').read().split('\n')
    idx = [i for i, l in enumerate(L) if START.match(l)]
    starts_total += len(idx)
    mt = datetime.datetime.fromtimestamp(os.stat(f).st_mtime, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    for k, i in enumerate(idx):
        j = idx[k + 1] if k + 1 < len(idx) else len(L)
        m = START.match(L[i]); t, sha = m.group(1), m.group(2)
        seg = L[i:j]
        v = next((l for l in seg if l.startswith('[chain41] SELFTEST-VERDICT rc ')), None)
        if v is None:
            out = f'NO VERDICT LINE (the run ended before its verdict; segment L{i + 1}–L{j})'
        else:
            rc = re.match(r'\[chain41\] SELFTEST-VERDICT rc (\d+)', v).group(1)
            red = re.search(r'\| RED: (.*)$', v)
            if red: out = f'rc {rc} RED: {red.group(1)[:140]}'
            elif rc == '0': out = 'rc 0 GREEN (no red clause on the verdict line)'
            else: out = f'rc {rc} — the verdict line carries no RED clause (segment L{i + 1}–L{j}; read it)'
        b = binding.get(sha)
        if b is None: bind = 'UNCOMMITTED (matches no commit of the driver file)'
        else:
            short, ctime = b
            cdt = datetime.datetime.fromisoformat(ctime).astimezone(datetime.timezone.utc)
            sdt = datetime.datetime.strptime(t, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc)
            bind = f'commit {short}' if sdt >= cdt else f'commit {short} — committed {cdt.strftime("%Y-%m-%dT%H:%M:%SZ")}, AFTER this START: the run was under the then-uncommitted working tree with that content'
        rows.append((os.path.basename(f), mt, t, sha, bind, out))
rows.sort(key=lambda r: r[2])
n_rc0 = sum(1 for r in rows if r[5].startswith('rc 0')); n_red = sum(1 for r in rows if ' RED: ' in r[5]); n_nov = sum(1 for r in rows if r[5].startswith('NO VERDICT')); n_other = len(rows) - n_rc0 - n_red - n_nov
n_unc = sum(1 for r in rows if r[4].startswith('UNCOMMITTED')); n_after = sum(1 for r in rows if 'AFTER this START' in r[4]); n_bound = len(rows) - n_unc - n_after
disclosed = 'YES' if len(rows) == starts_total else f'NO (rows {len(rows)} != START lines {starts_total})'
hdr = [f'# B-PASS LEDGER — every cell-B run across every rotation of its receipt (FIX16 S3)', '',
       f'generated {now} by {GEN} (sha {GEN_SHA}); files {len(files)}: {", ".join(os.path.basename(f) for f in files)}.', '',
       f'AS OF {now}: rows {len(rows)}; START lines across all rotations + the live receipt {starts_total}; every pass disclosed: {disclosed}. (CORRIGENDUM-1 C7: both counts are stated at this instant; a later run under any tag adds a START line and the ledger must be regenerated.)',
       f'outcomes: {n_rc0} rc 0 GREEN, {n_red} RED, {n_nov} NO VERDICT LINE, {n_other} other; bindings: {n_bound} committed before their START, {n_after} committed AFTER their START (then-uncommitted working tree), {n_unc} UNCOMMITTED.', '',
       '| file (rotation) | file mtime UTC | run START UTC | driver sha | commit binding | outcome |', '|---|---|---|---|---|---|']
body = [f'| {a} | {b} | {c} | {d} | {e} | {f} |' for a, b, c, d, e, f in rows]
open(OUT, 'w').write('\n'.join(hdr + body) + '\n')
# FIX19 F1: the STRUCTURED sidecar the renderer reads (no regex over the markdown): as_of, rows, start_lines, generator (repo-relative), per-file anchored START counts
per_file = {os.path.basename(f): len(re.findall(r'^\[chain41\] VERDICT RE-DERIVATION START (\S+) driver \S+ sha ([0-9a-f]{12})', open(f, errors='replace').read(), re.M)) for f in files}
with open(OUT[:-3] + '.json' if OUT.endswith('.md') else OUT + '.json', 'w') as fh: json.dump({'as_of': now, 'rows': len(rows), 'start_lines': starts_total, 'generator': GEN, 'generator_sha': GEN_SHA, 'files': per_file, 'nice': os.nice(0)}, fh, indent=1)
line = f'[chain41] FIX16 S3 B-PASS LEDGER regenerated — AS OF {now}: {OUT} — rows {len(rows)} vs START lines {starts_total} across {len(files)} files → every pass disclosed: {disclosed}; outcomes {n_rc0} rc 0 GREEN / {n_red} RED / {n_nov} NO VERDICT LINE / {n_other} other; bindings {n_bound} committed before their START / {n_after} committed AFTER their START (then-uncommitted working tree) / {n_unc} UNCOMMITTED; generator {GEN} sha {GEN_SHA}; nice={os.nice(0)}'
print(line)
if CHAIN: open(os.path.join(os.environ.get('OB_L41V_RECORD_DIR', '.'), 'output/lighting/chain-land41.log'), 'a').write(line + '\n')  # the record dir, as the verdict driver reads it
sys.exit(0 if len(rows) == starts_total else 1)
