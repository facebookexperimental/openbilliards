#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""GH-638 / #727 — §40.9 renderer (land42 → land49): renders the FIX11…FIX18 record section of SPIKE-REPORT-LIGHTING.md FROM THE RECORD and replaces the
trailing '### 40.9' block. Laws it enforces (FIX17 R1, FIX18 V1/V6/W1/W3/W6):
- a cell line is SELECTED BY RULE — START >= the driver's last commit time AND driver sha == the committed driver — the last such line per cell; a cell without
  an eligible line is a render FAILURE by name (exit 1, nothing written), never a substitution;
- a cell's validity word, rc and refusal are read ONLY from output/lighting/cell-<name>/cell-validity.json (the receipt dir the chain line names) — never from
  the human chain line, whose CLAUSE echoes row ids verbatim; the json must exist and its start_utc / receipt_start_utc / driver_sha / rc_verdict must equal the
  line's, else FAIL by name;
- gates on the selected set use TYPED fields with type-strict equality (FIX19 F3); thresholds are derived from the driver's EXPECTED literals; each gate is printed in the selection receipt;
- no contract prose lives in this file: the current contract is rendered from the COMMITTED driver header; every FIX paragraph is a labelled historical record;
- the verdict paragraph is the LAST record pass by START; the ledger's AS OF must follow the code commit and its rows must equal its START lines.
  python3 tools/render/lighting-land41-sec409.py [--chain <log>] [--record-root <dir>] [--header-source <driver file>] [--out <report.md>] [--allow-uncommitted]"""
import re, os, sys, hashlib, subprocess, argparse, datetime, json, ast
ap = argparse.ArgumentParser(); ap.add_argument('--chain', default='output/lighting/chain-land41.log'); ap.add_argument('--record-root', default='output/lighting'); ap.add_argument('--driver-source', help='a driver file to read the contract literals from (arms); default: the committed driver text'); ap.add_argument('--out'); ap.add_argument('--allow-uncommitted', action='store_true'); ap.add_argument('--contract-only', action='store_true', help='print only the contract block rendered from the driver literals (arms) and exit'); ap.add_argument('--arms-optional', action='store_true', help='arm-internal renders only: a missing or failed arm.json is printed as such instead of stopping the render; never allowed with --out'); args = ap.parse_args()
if args.arms_optional and args.out: print('[sec409] RENDER FAIL by name: --arms-optional may never write a report (--out) — nothing written', file=sys.stderr); sys.exit(1)
ROOT = args.record_root; DRIVER = 'tools/render/lighting-land41-verdict.sh'; SELF = 'tools/render/lighting-land41-sec409.py'
def die(msg):
    print(f'[sec409] RENDER FAIL by name: {msg} — nothing written', file=sys.stderr); sys.exit(1)
def git(*a):
    r = subprocess.run(['git', *a], capture_output=True, text=True)
    if r.returncode != 0: die(f'git {" ".join(a)} rc {r.returncode}: {r.stderr.strip()[:200]}')
    return r.stdout
def rd(p): return open(p, errors='ignore').read() if os.path.exists(p) else ''
ch = rd(args.chain)
if not ch: die(f'no chain at {args.chain}')
def alll(pat): return re.findall('(?m)^' + pat, ch)  # FIX18 Z6: every chain regex is anchored at LINE START — a row id echoed inside a line can never match
def lastline(prefix):  # the last chain LINE that starts with prefix, or '' (never a substring hit)
    ms = [l for l in ch.split('\n') if l.startswith(prefix)]; return ms[-1] if ms else ''
def short(s, n=260): return s if len(s) <= n else s[:n] + ' …'
def sha(p):
    if not os.path.exists(p): die(f'file to hash is missing: {p}')
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()
def utcz(iso): return datetime.datetime.fromisoformat(iso).astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
def is_int(v, n): return type(v) is int and v == n   # FIX19 F3(a): type-strict — a JSON boolean is never an int here (True == 1 in Python)
STRICT_UTC = re.compile(r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$')
# ---- provenance
cc = git('log', '-1', '--format=%h %H %cI', '--', DRIVER).split()
if len(cc) != 3: die(f'no commit touches {DRIVER}')
CC_SHORT, CC_FULL, CC_TIME = cc[0], cc[1], utcz(cc[2])
COMMITTED_TEXT = subprocess.run(['git', 'show', f'{CC_FULL}:{DRIVER}'], capture_output=True).stdout
COMMITTED = hashlib.sha256(COMMITTED_TEXT).hexdigest()[:12]; WT = sha(DRIVER)[:12]
if WT != COMMITTED:
    if args.allow_uncommitted:  # a THROWAWAY arm on a scratch record: eligibility by the WORKTREE driver, said so in the receipt; the real render never takes this branch
        print(f'[sec409] THROWAWAY: the worktree driver ({WT}) differs from the committed one ({COMMITTED}); eligibility judged by the worktree sha', file=sys.stderr); COMMITTED = WT
    else: die(f'the worktree driver ({WT}) differs from the committed driver ({COMMITTED}, commit {CC_SHORT}) — commit the code first')
tracked = subprocess.run(['git', 'ls-files', '--error-unmatch', SELF], capture_output=True).returncode == 0
clean = tracked and subprocess.run(['git', 'status', '--porcelain', '--', SELF], capture_output=True, text=True).stdout.strip() == ''
RSHA = sha(SELF)[:12]; RCOMMIT = git('log', '-1', '--format=%h', '--', SELF).strip() if tracked else ''
if not clean and not args.allow_uncommitted: die(f'this renderer is {"modified" if tracked else "untracked"} ({RSHA}) — commit it first, or pass --allow-uncommitted for a throwaway arm')
RPROV = f'renderer {SELF} sha {RSHA} ' + (f'committed in {RCOMMIT}' if clean else 'UNCOMMITTED (throwaway arm)')
# ---- the current contract, rendered from the driver's PYTHON LITERALS via ast (FIX18 C5(2)) — never from comment prose
drv_text = rd(args.driver_source) if args.driver_source else (rd(DRIVER) if (args.allow_uncommitted and WT == COMMITTED and sha(DRIVER)[:12] == WT and COMMITTED != hashlib.sha256(COMMITTED_TEXT).hexdigest()[:12]) else COMMITTED_TEXT.decode('utf-8', 'replace'))
CONTRACT_SRC = args.driver_source or (f'the WORKTREE driver {WT} (throwaway)' if drv_text != COMMITTED_TEXT.decode('utf-8', 'replace') else f'git show {CC_SHORT}:{DRIVER}')
def heredoc_after(anchor):
    i = drv_text.find(anchor)
    if i < 0: die(f'contract: anchor {anchor!r} not found in the driver source')
    j = drv_text.find("<<'PY'\n", i); k = drv_text.find('\nPY\n', j)
    if j < 0 or k < 0: die(f'contract: no python heredoc after {anchor!r}')
    return drv_text[j + 7:k]
try:
    rec_py = ast.parse(heredoc_after('cell_receipt() {')); build_py = ast.parse(heredoc_after('if [ "${1:-}" = --build-cell ]; then'))
except SyntaxError as e: die(f'contract: the driver heredoc does not parse: {e}')
def assigned(tree, name):
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in node.targets): return node.value
    return None
consts = {}
for nm in ('SURV', 'SIL', 'MISS', 'VF', 'A9ID'):
    v = assigned(rec_py, nm)
    if v is None: die(f'contract: literal {nm} not found in cell_receipt')
    consts[nm] = ast.literal_eval(v)
def eval_literal(node):
    return eval(compile(ast.Expression(node), '<driver-literal>', 'eval'), {'__builtins__': {}}, dict(consts))
EXP_NODE = assigned(rec_py, 'EXPECTED'); TERMS_NODE = assigned(rec_py, 'TERMS')
if EXP_NODE is None or TERMS_NODE is None: die('contract: EXPECTED / TERMS literals not found in cell_receipt')
if not (isinstance(EXP_NODE, ast.Dict) and all(isinstance(v, (ast.List, ast.Constant)) for v in EXP_NODE.values)): die('contract: EXPECTED is not a dict of list / string literals')
EXPECTED_C = eval_literal(EXP_NODE); TERMS_C = eval_literal(TERMS_NODE)
plant_tuple = None
for node in ast.walk(build_py):
    if isinstance(node, ast.Compare) and isinstance(node.left, ast.Name) and node.left.id == 'plant' and isinstance(node.ops[0], ast.NotIn) and isinstance(node.comparators[0], ast.Tuple):
        plant_tuple = ast.literal_eval(node.comparators[0]); break
if plant_tuple is None: die('contract: the plant tuple (if plant not in (...)) not found in the builder')
now_plants = set()
for node in ast.walk(build_py):
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'plant_gate_json':
        kw = next((k for k in node.keywords if k.arg == 'restore'), None)  # guarded: None → skipped below
        if kw is None: continue
        for pl in plant_tuple:
            try:
                if eval(compile(ast.Expression(kw.value), '<restore>', 'eval'), {'__builtins__': {}}, {'plant': pl}) is False: now_plants.add(pl)
            except Exception: pass
CONTRACT_LINES = [f"| cell | EXPECTED (term, planted id) pairs, or the ARM word | (literals of cell_receipt's EXPECTED in {CONTRACT_SRC}) |", '|---|---|---|']
for c, v in EXPECTED_C.items(): CONTRACT_LINES.append(f"| {c} | {'ARM: expects INVALID-CELL (did not reach its term) — as this ARM expects' if v == 'ARM-INVALID' else '; '.join(f'({t}, {i})' for t, i in v)} | |")
CONTRACT_LINES += ['', f"TERMS (the nine parsed term names, in the driver's order): {'; '.join(TERMS_C)}.", '', f"Plants the builder accepts ({len(plant_tuple)}): {', '.join(plant_tuple)}. Plants whose builder leaves the json mtime at NOW (restore=False under the literal): {', '.join(sorted(now_plants)) or 'none'}."]
if args.contract_only:
    sys.stdout.write('\n'.join(CONTRACT_LINES) + '\n'); sys.exit(0)
# ---- cells: SELECT BY RULE, then read every consumed fact from cell-validity.json (FIX18 Z2 typed fields; FIX19 F2(a) run_id binding, F3 type-strict)
ORDER = ['A-plantedfence', 'A2-plantedprobe', 'A3-plantedstatic', 'A4-plantedruledarm', 'A5-plantedrulednostatic', 'A6-plantednonrepo', 'A7-plantedwindow', 'A8-plantedwindowfile', 'A9-plantedgatearm', 'A9ARM-unrestored', 'A9ARM-forgedid', 'A9ARM-forgedvalid', 'A9ARM-extrasilent', 'A9ARM-refusingid', 'A10-plantedmissrec', 'A11-plantedundecl', 'A12-plantedspliced', 'A13-plantedexemptmiss', 'A14-plantedexemptdup', 'A15-plantedrecnokey', 'A16-plantedunbound', 'A17-plantedzerofail', 'A18-plantedexemptnonnum', 'A19-plantedexemptnopass', 'A20-plantedjudgednopass', 'A21-plantedjudgedboolmismatch', 'A22-plantedjudgednonnum', 'A23-plantedspecnullpass', 'A24-plantedboolmatrix', 'B-realfiles']
ARM_PLANT = {'A9ARM-unrestored': 'gatearm-unrestored', 'A9ARM-forgedid': 'gatearm-forgedid', 'A9ARM-forgedvalid': 'gatearm-forgedvalid'}   # FIX19 F3(b): the plant each arm NAME declares
GATE = [c for c in ORDER if c in EXPECTED_C]; NONGATE = [c for c in ORDER if c not in EXPECTED_C]
missing_in_order = [c for c in EXPECTED_C if c not in ORDER]
if missing_in_order: die(f'the driver EXPECTED table names cells this renderer does not order: {missing_in_order}')
N_PAIRS = sum(1 for v in EXPECTED_C.values() if isinstance(v, list)); N_ARMS = sum(1 for v in EXPECTED_C.values() if v == 'ARM-INVALID')
all_cell_lines = alll(r'\[chain41\] cell (\S+): START (\S+)')
raw = [(i, m) for i, m in enumerate(re.finditer(r'(?m)^\[chain41\] cell (\S+): START (\S+) driver (\w{12}) cwd \S+ → SELFTEST-VERDICT rc (\d|\?) — (.*?) \| receipt copied to (\S+)/ \| run_id (\S+)$', ch))]
n_old_shape = len(all_cell_lines) - len(raw)
for i, m in raw:
    if not STRICT_UTC.match(m.group(2)): die(f'INCONSISTENT: cell line for {m.group(1)} carries a START token that is not a strict UTC stamp: {m.group(2)!r} (FIX19 F3 c) — never compared, never selected')
elig = {c: sorted([(m.group(2), i, m.group(3), m.group(4), m.group(5), m.group(7)) for i, m in raw if m.group(1) == c and m.group(2) >= CC_TIME and m.group(3) == COMMITTED]) for c in ORDER}   # START-last; a same-second tie broken by chain ORDER (F2 a)
rejected_new = sum(1 for i, m in raw if not (m.group(2) >= CC_TIME and m.group(3) == COMMITTED))
missing = [c for c in ORDER if not elig[c]]
if missing: die(f'cells without an eligible line (START >= {CC_TIME} AND driver {COMMITTED}): {missing}; new-shape lines rejected by the rule: {rejected_new}; older-shape lines not parsed: {n_old_shape}')
n_fallbacks = len(missing)   # F5(a): a counter, not a constant — always 0 here because a missing cell dies above
cells = []; FACT = {}; CLASS = {}; ARMFLAG = {}
START_RX = re.compile(r'^\[chain41\] VERDICT RE-DERIVATION START (\S+) ')
for c in ORDER:
    t, idx, d, r, w, line_run = elig[c][-1]
    cdir = os.path.join(ROOT, f'cell-{c}'); jp = os.path.join(cdir, 'cell-validity.json')
    if not os.path.exists(jp): die(f'cell {c}: {jp} is missing — validity is read from the json only')
    try: f = json.load(open(jp))
    except Exception as e: die(f'cell {c}: {jp} unreadable: {e!r}')
    for k, want in (('cell', c), ('start_utc', t), ('receipt_start_utc', t), ('driver_sha', d), ('run_id', line_run)):
        if f.get(k) != want: die(f'cell {c}: cell-validity.json {k}={f.get(k)!r} disagrees with the selected chain line ({want!r})')
    for k in ('exit', 'rc_file', 'rc_verdict'):
        if type(f.get(k)) not in (int, type(None)): die(f'INCONSISTENT: cell {c}: cell-validity.json {k}={f.get(k)!r} is not an int (a JSON boolean is not an exit or rc; FIX19 F3 a)')
    if str(f.get('rc_verdict')) != (r if r != '?' else 'None'): die(f'cell {c}: cell-validity.json rc_verdict={f.get("rc_verdict")!r} disagrees with the chain line rc {r!r}')
    if f.get('validity_class') not in ('RED-VALID', 'INVALID-CELL', 'ARM-AS-EXPECTED', 'ARM-BROKEN', 'REFUSED', 'INCONSISTENT', 'NONE'): die(f'cell {c}: validity_class {f.get("validity_class")!r} is not a typed class')
    if type(f.get('arm_expected')) is not bool: die(f'cell {c}: arm_expected={f.get("arm_expected")!r} is not a boolean')
    blog = os.path.join(cdir, f'chain-land41-verdict-selftest-{c}.log')
    if not os.path.exists(blog): die(f'cell {c}: the booked receipt log {blog} is missing')
    bstarts = [m.group(1) for m in (START_RX.match(l) for l in rd(blog).split('\n')) if m]
    if not bstarts: die(f'cell {c}: the booked receipt log carries no START line')
    if bstarts[-1] != t: die(f'cell {c}: the booked receipt log\'s LAST START {bstarts[-1]} != the selected line\'s START {t}')
    if f.get('validity_class') == 'ARM-AS-EXPECTED':   # F3(b): the arm gate reads its own deliverable, every field spelled
        if EXPECTED_C.get(c) != 'ARM-INVALID' or c not in ARM_PLANT: die(f'cell {c}: class ARM-AS-EXPECTED on a cell whose EXPECTED entry is not ARM-INVALID ({EXPECTED_C.get(c)!r}) or whose declared plant is unknown')
        if f.get('arm_expected') is not True: die(f'cell {c}: class ARM-AS-EXPECTED but arm_expected={f.get("arm_expected")!r}')
        if not (is_int(f.get('exit'), 1) and is_int(f.get('rc_file'), 1) and is_int(f.get('rc_verdict'), 1)): die(f'cell {c}: class ARM-AS-EXPECTED requires exit 1, rc_file 1, rc_verdict 1 — read {f.get("exit")!r}/{f.get("rc_file")!r}/{f.get("rc_verdict")!r}')
        if f.get('sidecar_plant') != ARM_PLANT[c]: die(f'cell {c}: sidecar_plant={f.get("sidecar_plant")!r} is not the plant the name declares ({ARM_PLANT[c]})')
        if not os.path.exists(os.path.join(cdir, 'gate-land41.json.mtime-proof')): die(f'cell {c}: the mtime-proof sidecar is missing from the receipt dir')
    want_arm = EXPECTED_C.get(c) == 'ARM-INVALID'   # FIX19 CORRIGENDUM-1 C3: arm_expected == (EXPECTED_C[c] == 'ARM-INVALID') for EVERY cell — the name never decides
    if f.get('arm_expected') is not want_arm: die(f'cell {c}: arm_expected={f.get("arm_expected")!r} but the driver EXPECTED table says {want_arm} (entry {EXPECTED_C.get(c)!r})')
    cells.append((c, t + ' driver ' + d, r, w)); FACT[c] = f; CLASS[c] = f.get('validity_class'); ARMFLAG[c] = f.get('arm_expected')
superseded = sum(len(elig[c]) - 1 for c in ORDER)
def is_redvalid(c): f = FACT[c]; return CLASS[c] == 'RED-VALID' and is_int(f.get('exit'), 1) and is_int(f.get('rc_file'), 1)
n_rv = sum(1 for c in GATE if is_redvalid(c)); n_arm = sum(1 for c in GATE if CLASS[c] == 'ARM-AS-EXPECTED')
fb = FACT['B-realfiles']; b_ok = CLASS['B-realfiles'] == 'NONE' and is_int(fb.get('exit'), 0) and is_int(fb.get('rc_file'), 0) and is_int(fb.get('rc_verdict'), 0)
a_bad = [c for c in NONGATE if c != 'B-realfiles' and not (CLASS[c] == 'NONE' and is_int(FACT[c].get('exit'), 1))]
bad_classes = [(c, CLASS[c]) for c in ORDER if CLASS[c] in ('REFUSED', 'INCONSISTENT', 'ARM-BROKEN', 'INVALID-CELL')]
gates = [(f'>= {N_PAIRS} RED-VALID among the gate cells (class == RED-VALID AND exit is int 1 AND rc_file is int 1; threshold = the number of pair-valued EXPECTED entries)', n_rv >= N_PAIRS, n_rv), (f'>= {N_ARMS} arms as expected (class == ARM-AS-EXPECTED AND arm_expected true AND exit/rc_file/rc_verdict int 1 AND sidecar_plant == the declared plant AND mtime-proof present; threshold = the number of ARM entries)', n_arm >= N_ARMS, n_arm), ('B-realfiles class NONE AND exit int 0 AND rc_file int 0 AND rc_verdict int 0', b_ok, {k: fb.get(k) for k in ('validity_class', 'exit', 'rc_file', 'rc_verdict')}), ('A–A8 class NONE AND exit int 1', not a_bad, a_bad or 'all'), ('no REFUSED / INCONSISTENT / ARM-BROKEN / INVALID-CELL class in the selected set', not bad_classes, bad_classes or 'none')]
failed_gates = [g for g in gates if not g[1]]
if failed_gates: die('selection gates failed: ' + '; '.join(f'{n} (measured {v!r})' for n, ok, v in failed_gates))
SELECTION = (f"{len(ORDER)} cells selected under driver {COMMITTED} after {CC_TIME} (code commit {CC_SHORT}); cells without an eligible line: {n_fallbacks} (a non-zero count stops the render); earlier eligible lines superseded by a later run: {superseded} ({', '.join(c + ' ×' + str(len(elig[c]) - 1) for c in ORDER if len(elig[c]) > 1) or 'none'}); new-shape lines rejected by the rule: {rejected_new}; older-shape lines not parsed: {n_old_shape} (both from line-start-anchored matches); every consumed fact typed from cell-validity.json (cell, start_utc, receipt_start_utc, driver_sha, rc_verdict, run_id [end-anchored on the line] cross-checked per cell; START tokens validated; ints type-strict; the booked receipt log's LAST START compared); gates: " + '; '.join(f'{n} = {v!r} {"OK" if ok else "FAIL"}' for n, ok, v in gates) + f"; class counts over the selected set: { {k: sum(1 for c in ORDER if CLASS[c] == k) for k in ('RED-VALID', 'ARM-AS-EXPECTED', 'NONE', 'INVALID-CELL', 'ARM-BROKEN', 'REFUSED', 'INCONSISTENT')} }; {RPROV}; nice={os.nice(0)}")
print('[sec409] ' + SELECTION, file=sys.stderr)
# ---- the last record pass by START (anchored at line start; every lookup guarded → FAIL by name)
stamps = [(t, d) for t, d in alll(r'\[chain41\] VERDICT stamp (\S+) driver (\w{12}) ') if t >= CC_TIME and d == COMMITTED]
if not stamps: die(f'no line-start VERDICT stamp after {CC_TIME} under driver {COMMITTED} (record pass not run under the committed driver)')
st_t = stamps[-1][0]; stamp_line = lastline(f'[chain41] VERDICT stamp {st_t} driver {COMMITTED} ')
if not stamp_line: die(f'the VERDICT stamp {st_t} matched by regex has no line starting with it (a forged stamp inside another line?)')
after = ch[ch.rfind('\n' + stamp_line) + 1:] if ('\n' + stamp_line) in ch else ch[ch.rfind(stamp_line):]
vm = re.search(r'(?m)^\[chain41\] VERDICT rc \d: selftest=unset[^\n]*', after)
if not vm: die('no line-start VERDICT rc line after the last stamp')
verdict_line = vm.group(0)
notes = [(t, l) for t, l in [(m.group(1), m.group(0)) for m in re.finditer(r'(?m)^\[chain41\] RE-DERIVATION NOTE \((\S+)\): [^\n]*$', ch)] if t >= CC_TIME]
if not notes: die(f'no line-start RE-DERIVATION NOTE after {CC_TIME}')
note_line = notes[-1][1]
# ---- the ledger (FIX19 F1): facts from b-pass-ledger.json (no regex over the markdown), validated, THREE-WAY equality json.rows == table BODY rows == anchored START matches per rotation file
GEN_PAT = re.compile(r'^\[chain41\] VERDICT RE-DERIVATION START (\S+) driver \S+ sha ([0-9a-f]{12})', re.M)   # the generator's own pattern
lj_path = f'{ROOT}/b-pass-ledger.json'; ledger = rd(f'{ROOT}/b-pass-ledger.md')
if not os.path.exists(lj_path): die(f'the B-PASS LEDGER json sidecar {lj_path} is missing (generator older than FIX19 F1)')
try: lj = json.load(open(lj_path))
except Exception as e: die(f'{lj_path} unreadable: {e!r}')
if not (isinstance(lj.get('as_of'), str) and STRICT_UTC.match(lj['as_of'])): die(f'b-pass-ledger.json as_of={lj.get("as_of")!r} is not a strict UTC stamp')
if not (type(lj.get('rows')) is int and type(lj.get('start_lines')) is int): die(f'b-pass-ledger.json rows/start_lines are not ints: {lj.get("rows")!r}/{lj.get("start_lines")!r}')
LGEN = lj.get('generator')
if not (isinstance(LGEN, str) and not os.path.isabs(LGEN) and os.path.exists(LGEN)): die(f'b-pass-ledger.json generator={LGEN!r} is not an existing repo-relative path')
if lj['as_of'] < CC_TIME: die(f'the B-PASS LEDGER is stale: as_of {lj["as_of"]} < code commit {CC_TIME}')
llines = ledger.split('\n'); seps = [i for i, l in enumerate(llines) if l.startswith('|---')]
if not seps: die('the B-PASS LEDGER markdown carries no |---| separator')
ledger_rows = [l for l in llines[seps[0] + 1:] if l.startswith('| ')]   # table BODY rows only (the header row precedes the separator)
rot_files = sorted(x for x in os.listdir(ROOT) if x.startswith('chain-land41-verdict-selftest-B-realfiles') and x.endswith('.log'))
per_file = {f: len(GEN_PAT.findall(rd(os.path.join(ROOT, f)))) for f in rot_files}; total_starts = sum(per_file.values())
if not (lj['rows'] == len(ledger_rows) == total_starts == lj['start_lines']): die(f'B-PASS LEDGER three-way equality failed: json rows {lj["rows"]}, table body rows {len(ledger_rows)}, anchored START matches {total_starts} ({per_file}), json start_lines {lj["start_lines"]}')
rot = [f"{f} (mtime {datetime.datetime.fromtimestamp(os.stat(os.path.join(ROOT, f)).st_mtime, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}, anchored START matches {per_file[f]})" for f in rot_files]
out = []
def P(s=''): out.append(s)
def cellq(c): return f"{c} START {dict((x[0], x[1]) for x in cells)[c]} → rc {FACT[c].get('rc_verdict')} exit {FACT[c].get('exit')} rc_file {FACT[c].get('rc_file')} [class {CLASS[c]} | arm_expected {ARMFLAG[c]}]"
P("### 40.9 FIX11 … FIX18 (land42 → land49): the record's own defects, fixed — rendered from the record by " + RPROV)
P()
HIST = 'docs/orders/venue-lighting/sec409-history.md'
hist = rd(HIST)
if not hist: die(f'the frozen history sidecar {HIST} is missing')
P(f"_Historical paragraphs FIX11 … FIX17 below are FROZEN text from {HIST}, each byte-verbatim to the §40.9 section of commit 634332b8; the round tag stands on its own line above each paragraph; the renderer includes the file verbatim and carries no FIX prose of its own._")
P()
for l in hist.split('\n'):
    if not l.startswith('<!--') and not l.startswith('The renderer tools/render') and not l.startswith('Each paragraph stands'): P(l)
NOTES = 'docs/orders/venue-lighting/sec409-notes.md'; notes_txt = rd(NOTES)
if not notes_txt: die(f'the authored notes file {NOTES} is missing (FIX19 CORRIGENDUM-1 C2)')
P(f"_Authored notes below come from {NOTES} (printed after the frozen block; not frozen; never part of the Y2 byte-verbatim set)._")
P()
for l in notes_txt.split('\n'):
    if not l.startswith('<!--'): P(l)
P("**L2 — receipts live in the record, every pass disclosed (rendered from the CURRENT selection).** " + str(len(cells)) + " cells, each its last run under the committed driver, START from the cell's own clock, rc and validity word from its cell-validity.json: " + '; '.join(cellq(c) for c in ORDER) + ". Selection receipt: `" + SELECTION + "`. The B-PASS LEDGER is below.")
P()
ARMS = [('w5-prereceipts-render', 'FIX18 W5 pre-receipts render arm'), ('r2-refused', 'FIX18 R2 arm'), ('r4-norecorddir', 'FIX18 R4(1) arm'), ('v5-shape', 'FIX18 V5 shape arm'), ('v5-a16', 'FIX18 V5 A16 arm'), ('v3-unwritable', 'FIX18 V3 arm'), ('v8-build', 'FIX18 V8 arm'), ('z3-refuse-rerun', 'FIX18 Z3 arm 1'), ('z3-legit-refuse', 'FIX18 Z3 arm 2'), ('z4-append-failure', 'FIX18 Z4 arm'), ('z5-build-exits', 'FIX18 Z5 arm'), ('v7-z7-counts', 'FIX18 V7/Z7 counts'), ('r1-stripped', 'FIX18 R1 renderer arm (stripped chain)'), ('v1-disagreement', 'FIX18 V1 disagreement arm'), ('w1-literal', 'FIX18 W1 literal arm'), ('z6-stamp-id', 'FIX18 Z6 arm stamp-id'), ('z6-cellline-id', 'FIX18 Z6 arm cellline-id'), ('z6-edited-receipt', 'FIX18 Z6 arm edited-receipt'), ('y2-sidecar', 'FIX18 Y2 sidecar verbatim receipt'), ('y3-grep', 'FIX18 Y3 receipt'), ('y1-lint', 'FIX18 report-lint receipt'), ('f2-orphan-ls', 'FIX19 F2 orphan ls'), ('f2-orphan-refuse', 'FIX19 F2 orphan arm'), ('f2-tmp-scoped', 'FIX19 F2 tmp scoping receipt'), ('f2-concurrent', 'FIX19 F2 concurrency arm'), ('f4-failure-fact', 'FIX19 F4 failure-fact arm'), ('f1-ledger-forgery-md', 'FIX19 F1 arm (forged md header, truthful json)'), ('f1-ledger-forgery', 'FIX19 F1 arm'), ('f2a-runid-binding', 'FIX19 F2a arm'), ('f2a-runid-binding-pos', 'FIX19 F2a arm (positive: the chain-later real line wins the same-second tie)'), ('f3a-boolint', 'FIX19 F3a arm'), ('f3b-armgate', 'FIX19 F3b arm'), ('f3c-starttoken', 'FIX19 F3c arm'), ('f5-instruments', 'FIX19 F5 receipt')]
arm_rows = []
for slug, tag in ARMS:
    jp = os.path.join(ROOT, f'arm-fix18-{slug}', 'arm.json')
    if not os.path.exists(jp):
        if args.arms_optional: arm_rows.append(f'{slug}: (arm.json not yet written — arms-optional render, never a report)'); continue
        die(f'arm {slug}: {jp} is missing (FIX18 Z1: arm facts are files)')
    try: aj = json.load(open(jp))
    except Exception as e: die(f'arm {slug}: {jp} unreadable: {e!r}')
    if aj.get('ok') is not True and not args.arms_optional: die(f'arm {slug}: arm.json ok={aj.get("ok")!r} (exit {aj.get("exit")!r} vs expected {aj.get("expected_exit")!r}) — the render does not proceed over a failed arm')
    quote = lastline(f'[chain41] {tag}')
    arm_rows.append(f"{slug}: ok {aj.get('ok')}, exit {aj.get('exit')} (expected {aj.get('expected_exit')}), rc_file {aj.get('rc_file')}, start {aj.get('start_utc')} — display quote (line-start match, never a fact): `{short(quote, 300) if quote else '(no line-start chain line for this tag)'}`")
arm_dirs = sorted(x for x in os.listdir(ROOT) if x.startswith('arm-fix18-')); extra_dirs = [x for x in arm_dirs if x[10:] not in dict(ARMS)]
P("**FIX18 / FIX19 (the 634332b8 refuters and the FIX19 order; verdict-only) — typed facts only (the narrative is in the frozen sidecar and the FIX19 note).** Class counts over the selected cells (cell-validity.json validity_class): " + str({k: sum(1 for c in ORDER if CLASS[c] == k) for k in ('RED-VALID', 'ARM-AS-EXPECTED', 'NONE', 'INVALID-CELL', 'ARM-BROKEN', 'REFUSED', 'INCONSISTENT')}) + f"; thresholds derived from the driver's EXPECTED literals: RED-VALID >= {N_PAIRS}, arms >= {N_ARMS}. Arm facts: {len(arm_dirs)} arm-fix18-* dirs in the record root, {len(arm_rows)} arm facts read (the renderer's ARMS list is the source of the {len(ARMS)}); " + ('; '.join(f'{x} is a superseded land49 directory kept as history (no arm.json)' for x in extra_dirs) if extra_dirs else 'no extra dirs') + ". Quote rule (ADDENDUM-3 Z1, as-is): a forged line can appear only as a labelled display quote of at most 300 characters; no fact, class, count or verdict word is read from it (arm z6-cellline-id). Arm facts (output/lighting/arm-fix18-<slug>/arm.json; a missing or failed arm stops the render): " + ' | '.join(arm_rows) + ". Cells of the FIX18/FIX19 arms by class: " + '; '.join(f"{c} [class {CLASS[c]} | arm_expected {ARMFLAG[c]}]" for c in ('A9ARM-forgedvalid', 'A9ARM-refusingid', 'A20-plantedjudgednopass', 'A21-plantedjudgedboolmismatch', 'A22-plantedjudgednonnum', 'A23-plantedspecnullpass', 'A24-plantedboolmatrix')) + ".")
P()
P()
P("**Current cell contract — rendered from the driver's python literals via ast (" + CONTRACT_SRC + "), not from comments and not authored here:**")
P()
for l in CONTRACT_LINES: P(l)
P()
P("**B-PASS LEDGER (FIX16 S3, CORRIGENDUM-1 C7, FIX17 R1, FIX19 F1 — inside the report, because the record is gitignored and prunable).** From b-pass-ledger.json: as_of " + lj['as_of'] + ", rows " + str(lj['rows']) + ", start_lines " + str(lj['start_lines']) + "; three-way equality held: json rows == table body rows (" + str(len(ledger_rows)) + ") == anchored START matches over the rotation files (" + str(total_starts) + "). Rotations: " + '; '.join(rot) + ". Generator (from the json): " + LGEN + ". The table:")
P()
for l in ledger_rows: P(l)
P()
P("**The re-derived verdict (this round; verdict-only, no re-measurement; selected by START, not by a FIX-name regex):** the last record pass after the code commit — NOTE `" + short(note_line, 420) + "` → stamp `" + short(stamp_line, 200) + "` → `" + short(verdict_line, 300) + "`; chain-land41.rc = " + rd(f'{ROOT}/chain-land41.rc').strip() + "; gate word `" + short(rd(f'{ROOT}/chain-land41.gateword').strip(), 200) + "`.")
text = '\n'.join(out) + '\n'
PENDING = re.compile(r'\(pending\)|\(pending — ')  # FIX18 C8: the lint's own rule, the ONE instrument for both sides
if PENDING.search(text): die('the rendered section still carries a pending token: ' + ', '.join(sorted(set(m.group(0) for m in re.finditer(r'[^`]{0,60}(?:\(pending\)|\(pending — )', text))))[:400])
if args.out:
    rep = rd(args.out); RL = rep.split('\n'); idx = [i for i, l in enumerate(RL) if l.startswith('### 40.9 ')]
    if not idx: die(f'no ### 40.9 heading in {args.out}')
    open(args.out, 'w').write('\n'.join(RL[:idx[-1]]) + '\n' + text)
    print(f'[sec409] wrote {args.out}: the trailing §40.9 block (from line {idx[-1] + 1}) replaced by {len(out)} rendered lines', file=sys.stderr)
else:
    sys.stdout.write(text)
