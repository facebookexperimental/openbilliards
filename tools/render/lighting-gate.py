#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-gate.py — the venue-lighting lane's photometric gate (one row per symptom, targets = photo reads ± their
read uncertainty), judged on lighting-render-reads.py output, with a RED ARM on the pre-lane rig.

  lighting-gate.py --spec rows.json --reads DIR [--red-arm-reads BEFORE_DIR] [--out report.md] [--json out.json]

rows.json: {"rows": [{"id", "symptom", "table", "look", "pose", "quantity", "op", "target", "pm", "source", "arm"}]}
  quantity: "ratio:<name>"            a ratio from reads.json (shadow_floor, jawS_over_bed, ball0_crown_over_bed, ...)
            "ball:<id>:<key>"         a ball read (crown_Y, under_over_crown, equator_over_crown, crown_sat, disc_sat, ...)
            "read:<roi>:Y"            a patch radiance
  op: "band" (|v − target| ≤ pm), "<=" (v ≤ target + pm), ">=" (v ≥ target − pm), "<" / ">" (strict: v < target − pm / v > target + pm; C2-FIX3)
  arm: true → this row must FAIL on the red-arm reads (the current rig); a gate that cannot red is not a gate.
exit 0 = every row PASS on --reads and every armed row FAILS on --red-arm-reads; 3 otherwise.
"""
import argparse, json, math, os, sys


ALTS = {}


class ReadErr(str):
    """the TYPED reason a read is missing (ORDER-LIGHT-C2-FIX20 CORRIGENDUM-1 C1): a str — so every printed word ('no read: nan', 'no read (nan) → NO-READ',
    'missing pose p') is unchanged — carrying .kind ∈ {'missing', 'nonfinite', 'nonnumeric'} and .text; callers test the KIND, never the word."""
    def __new__(cls, text, kind):
        o = super().__new__(cls, text); o.kind = kind; o.text = text; return o
def read_kind(err):
    """'missing' | 'nonfinite' | 'nonnumeric' | None (no error)"""
    return getattr(err, 'kind', None) if err is not None else None
def get(reads_dir, row):
    """ORDER-LIGHT-C2-FIX20 X2 (review 727 r12 P2): finiteness is checked HERE, at the ONE choke point every resolver returns through, so the
    measured path (the row loop), the control path (the arm read), --force-missing, the --force-pin-shift already-red check and the reverse-pin
    arm (both read through get()) inherit it and the existing words carry it. finite := isinstance(v, (bool, int, float)) and math.isfinite(v);
    a non-finite read (nan / inf / -inf) → (None, ReadErr('nan', 'nonfinite')); any other type → (None, ReadErr('non-numeric read <type>', 'nonnumeric'))
    — a missing read by name, never a TypeError, never evidence; a resolver's own miss → ReadErr(<its text>, 'missing'). judge() is unchanged (the
    record driver's replica judge01 stays faithful); booleans stay judgeable (the producer reads them as 1/0)."""
    v, err = _get_raw(reads_dir, row)
    if v is None: return None, (err if isinstance(err, ReadErr) else ReadErr(str(err), 'missing'))   # only a BARE str is re-typed; a composite's ReadErr keeps its kind (CORRIGENDUM-2 D1)
    if isinstance(v, (bool, int, float)):
        try: fin = math.isfinite(v)
        except OverflowError: return None, ReadErr('non-numeric read int (out of float range)', 'nonnumeric')   # a 400-digit int is not a measurement; never a traceback
        if fin: return v, None
        return None, ReadErr(str(float(v)), 'nonfinite')
    return None, ReadErr(f'non-numeric read {type(v).__name__}', 'nonnumeric')
def get_text(reads_dir, row):
    """ORDER-LIGHT-C2-FIX20 CORRIGENDUM-3 E1 (companion review c1 P2): the accessor for EVIDENCE that is text by design — the noread_basis fields a
    declared row prints (venueError, venueH3Why, …). Returns the raw census value UNCHANGED (str / number / bool) and a typed ReadErr only when the
    field is absent; the numeric finiteness rule of get() never runs here, and nothing read here may reach judge() or the arm column — the
    judged measurement and the control read always go through get()."""
    v, err = _get_raw(reads_dir, row)
    if v is None: return None, (err if isinstance(err, ReadErr) else ReadErr(str(err), 'missing'))
    return v, None
def _get_raw(reads_dir, row):
    p = os.path.join(reads_dir, row['look'], row['table'], 'reads.json')
    q0 = row['quantity'].split(':')
    if q0[0] == 'fixture':  # fixture:<name>:<field> — a committed fixture, no reads file involved (ORDER-LIGHT-10 item 4)
        fp = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', f'lighting-{q0[1]}.json')
        if not os.path.exists(fp):
            return None, f'missing fixture {fp}'
        v = json.load(open(fp)).get(q0[2])
        if v is None:
            return None, f'missing field {q0[2]} in {os.path.basename(fp)}'  # ORDER-LIGHT-12: a missing field is a missing read — FAILS every operator (was +inf: fail-open for >=)
        return v, None
    if not os.path.exists(p):
        return None, f'missing {p}'
    d = json.load(open(p))
    P = d['poses'].get(row['pose']) if row.get('pose') else {}
    if P is None:
        return None, f'missing pose {row["pose"]}'
    q = row['quantity'].split(':')
    try:
        if q[0] == 'venue':
            v = d.get('venue') or {}
            sh = v.get('sh') if isinstance(v, dict) else None
            if q[1] == 'sh':
                pin = row.get('pin')
                if not pin:
                    return None, 'row carries no pin'
                if not sh or len(sh) != len(pin):
                    # the census exists but carries no derived probe (a ?venue=off / legacy boot). ORDER-LAND-638-FIX4 verifier
                    # item 3: this used to read +inf ("infinitely far from the pin") — which made the ?venue=off arm RED BY
                    # CONSTRUCTION and blind to a MOVED pin. An absent probe is a MISSING read like every other resolver
                    # (fixture: / ledger: / census:): (None, reason) fails every operator AND every arm (a missing arm read is
                    # not a fired arm, ORDER-LIGHT-6). The pin rows arm on a REAL, different probe instead (lighting-gate-spec.py).
                    return None, f'missing derived probe (venue.sh {"absent" if not sh else f"len {len(sh)} != pin {len(pin)}"})'
                return max(abs(x - y) for x, y in zip(sh, pin)), None  # max |Δ coefficient|
            if q[1] == 'giseqgap':
                # ORDER-LIGHT-7 R-B: how many GI applies were still in flight when the fill was captured
                # (giSeq.started − giSeq.completed at capture time). 0 = the capture is tied to the CURRENT apply.
                g = v.get('giSeq') if isinstance(v, dict) else None
                if not isinstance(g, dict) or g.get('started') is None or g.get('completed') is None:
                    return None, 'missing giSeq witness (no probe / no apply witness in the census)'  # review round 3: a missing witness is a missing read — FAILS every operator (venue:sh above too since ORDER-LAND-638-FIX4 item 3: no +inf convention remains)
                return int(g['started']) - int(g['completed']), None
            if q[1] == 'E':  # per-axis irradiance of the derived probe, e.g. venue:E:ny
                return (v.get('E') or {}).get(q[2]), None
        if q[0] == 'scope':  # scope:<pose>:<mask>:<field> — lighting-probe-scope.py rows merged into reads.json
            return d['scope'][q[1]][q[2]][q[3]], None
        if q[0] == 'programs':  # programs:<class>:<field> — compiled-GLSL census carried from census.json
            return d['programs']['classes'][q[1]][q[2]], None
        # (the fixture: resolver lives above the reads-file check — review round 3 flagged this unreachable duplicate; removed)
        if q[0] == 'ledger':  # ledger:<class>:<field> — lighting-ledger.py rows merged into the poke set's reads.json (ORDER-LIGHT-11 R-A)
            blk = (d.get('ledger') or {}).get(q[1])
            if not isinstance(blk, dict) or blk.get(q[2]) is None:
                return None, f'missing ledger field {q[1]}:{q[2]}'  # ORDER-LIGHT-12: fail-closed for every operator (was +inf)
            return blk[q[2]], None
        if q[0] == 'census':  # census:<block>:<field> — a census block carried into reads.json (giBlocks, occLut, shMove)
            blk = d.get(q[1])
            if not isinstance(blk, dict) or blk.get(q[2]) is None:
                return None, f'missing census field {q[1]}:{q[2]}'  # ORDER-LIGHT-12: fail-closed for every operator (was +inf); the arms read REAL values on the off boot (zero blocks, unbound programs)
            return blk[q[2]], None
        if q[0] == 'relx':
            # ORDER-LIGHT-C2 refuter: relx:<alt>:<quantity...> — this cell's <quantity> divided by the SAME cell's <quantity> in the reads dir
            # of alt <alt> (fixed app vs the pre-C2 app under the same rig). A missing side is a missing read.
            other_dir = ALTS.get(q[1])
            if not other_dir: return None, f'relx: alt {q[1]!r} not given'
            inner = ':'.join(q[2:])
            va, ea = get(reads_dir, {**row, 'quantity': inner})
            vb, eb = get(other_dir, {**row, 'quantity': inner})
            if va is None: return None, ReadErr(f'relx: this cell: {ea}', read_kind(ea) or 'missing')   # FIX20 CORRIGENDUM-2 D1: the inner kind survives the composite
            if vb is None: return None, ReadErr(f'relx: alt {q[1]} cell: {eb}', read_kind(eb) or 'missing')
            if not vb: return None, f'relx: alt {q[1]} cell reads 0'
            return va / vb, None
        if q[0] == 'relset':
            # ORDER-LIGHT-C2-FIX3 class A: relset:<set>:<quantity...> — this cell's <quantity> divided by the SAME cell (table@poke, look, pose) in
            # the reads dir of alt <set> (the fixed fixture over its legacy twin, captured by the same poke under the legacy flag). A missing
            # side or a zero divisor is a missing read. Evaluated on the twin itself (the row's arm) it reads exactly 1 — the strict '<' fails.
            other_dir = ALTS.get(q[1])
            if not other_dir: return None, f'relset: alt {q[1]!r} not given'
            inner = ':'.join(q[2:])
            va, ea = get(reads_dir, {**row, 'quantity': inner})
            vb, eb = get(other_dir, {**row, 'quantity': inner})
            if va is None: return None, ReadErr(f'relset: this cell: {ea}', read_kind(ea) or 'missing')   # FIX20 CORRIGENDUM-2 D1: the inner kind survives the composite
            if vb is None: return None, ReadErr(f'relset: set {q[1]} cell: {eb}', read_kind(eb) or 'missing')
            if not vb: return None, f'relset: set {q[1]} cell reads 0'
            return va / vb, None
        if q[0] == 'rel':
            # ORDER-LIGHT-C2 (a): rel:<other-poke>:<quantity...> — this cell's <quantity> divided by the SAME table's <other-poke> cell's
            # <quantity> in the same reads dir (the studio-dim law: L(dim)/L(installed) within ONE boot). A missing side is a missing read.
            other = row['table'].split('@')[0] + '@' + q[1]
            inner = ':'.join(q[2:])
            va, ea = get(reads_dir, {**row, 'quantity': inner})
            vb, eb = get(reads_dir, {**row, 'table': other, 'quantity': inner})
            if va is None: return None, ReadErr(f'rel: this cell: {ea}', read_kind(ea) or 'missing')   # FIX20 CORRIGENDUM-2 D1: the inner kind survives the composite
            if vb is None: return None, ReadErr(f'rel: other cell {other}: {eb}', read_kind(eb) or 'missing')
            if not vb: return None, f'rel: other cell {other} reads 0'
            return va / vb, None
        if q[0] == 'ratio':
            return P['ratios'][q[1]], None
        if q[0] == 'ball':
            return P['balls'][q[1]][q[2]], None
        if q[0] == 'read':
            return P['reads'][q[1]]['Y'], None
    except KeyError as e:
        return None, f'missing {row["quantity"]} ({e})'
    return None, 'bad quantity'


def judge(row, v):
    if v is None:
        return False
    t, pm = row['target'], row.get('pm', 0.0)
    op = row.get('op', 'band')
    if op == 'band':
        return abs(v - t) <= pm
    if op == '<=':
        return v <= t + pm
    if op == '>=':
        return v >= t - pm
    # ORDER-LIGHT-C2-FIX3 class A: STRICT operators — an inequality a twin must fail by reading EXACTLY the target (relset on itself = 1)
    if op == '<':
        return v < t - pm
    if op == '>':
        return v > t + pm
    return False



def fixture_check():
    """ORDER-LIGHT-C2-FIX20 X2 self-test: temp spec + reads + red-arm-reads under tempfile, each (target, pm, measured, control) triple run through THIS
    script by subprocess (the --regen-check precedent) — the real main path (row loop, words, exit), never an in-memory replica; one line per triple
    <inputs> → <word> exit <n> — PASS/FAIL; exit 0 iff all hold. Seal-step wiring is b19 (GH-846)."""
    import subprocess, tempfile
    cases = [
        # id, target, pm, measured, control, noread_ok, expected substrings in the row line / verdict line, expected exit
        ('fx-red', 1, 0, 1, 0, None, ['0.0000 → RED', 'GATE: PASS'], 0),
        ('fx-control-nan', 1, 0, 1, float('nan'), None, ['no read (nan) → NO-READ', 'GATE: FAIL'], 3),
        ('fx-measured-nan', 1, 0, float('nan'), 0, None, ['no read: nan', '| **FAIL** |', 'GATE: FAIL'], 3),
        ('fx-not-an-arm', 1, 0, 1, 1, None, ['NOT-AN-ARM (bit-identical to the measured read', 'GATE: FAIL'], 3),
        ('fx-no-fire', 1, 0.5, 1.0, 1.2, None, ['1.2000 → NO-FIRE', 'GATE: FAIL'], 3),
        ('fx-noreadok-nan', 1, 0, float('nan'), 0, 'fixture: declared reason that must NOT apply — the quantity is present', ['no read: nan', '| **FAIL** |', 'GATE: FAIL'], 3),
        ('fx-control-string', 1, 0, 1, 'abc', None, ['no read (non-numeric read str) → NO-READ', 'GATE: FAIL'], 3),
    ]
    # composite cases (CORRIGENDUM-2 D1): (id, quantity, this cell's inner q, the other side's inner q, the control cell's q, noread_ok, words, want_exit, no_declared)
    # the control set is COMPLETE (fx_table@a and fx_table@b, and alt1 carries the cell) so the control's own composite read resolves and the row's fate is decided by the measured side
    comp = [
        ('fx-rel-nan-noreadok', 'rel:b:read:q', float('nan'), 1, 0, 'declared reason', ['no read: rel: this cell: nan', '| **FAIL** |', 'GATE: FAIL'], 3, True),
        ('fx-rel-absent-noreadok', 'rel:b:read:q', None, 1, 0, 'declared reason', ['no read (declared): rel: this cell:', 'DECLARED NO-READ', 'GATE: PASS'], 0, False),
        ('fx-relx-nan-noreadok', 'relx:alt1:read:q', float('nan'), 1, 0, 'declared reason', ['no read: relx: this cell: nan', '| **FAIL** |', 'GATE: FAIL'], 3, True),
        ('fx-relset-nan-noreadok', 'relset:alt1:read:q', float('nan'), 1, 0, 'declared reason', ['no read: relset: this cell: nan', '| **FAIL** |', 'GATE: FAIL'], 3, True),
        ('fx-bigint-control', 'read:q', 1, 1, int('9' * 400), None, ['no read (non-numeric read int (out of float range)) → NO-READ', 'GATE: FAIL'], 3, False),
    ]
    # CORRIGENDUM-3 E1: the C2F-queuelong-legacy-sqShL2Rel shape — a degraded row (quantity absent → declared) whose noread_basis names TEXT census fields; the report row and the JSON noread_txt must carry the strings verbatim
    text_case = ('fx-legacy-text-basis', 'read:q', None, 1, 0, 'legacy queue boot degraded (fixture)', ["venueError = 'EGL context lost (fixture)'", "venueH3Why = 'budget exceeded (fixture)'", 'venueBakeCount = 0', 'DECLARED NO-READ', 'GATE: PASS'], 0, False)
    root = tempfile.mkdtemp(prefix='ob-gate-fixture-'); bad = 0
    for cid, tgt, pm, meas, ctrl, noread_ok, words, want_exit in cases:
        d = os.path.join(root, cid); m = os.path.join(d, 'm', 'default', 'fx_table'); c = os.path.join(d, 'c', 'default', 'fx_table')
        os.makedirs(m); os.makedirs(c)
        json.dump({'poses': {'p': {'reads': {'q': {'Y': meas}}}}}, open(os.path.join(m, 'reads.json'), 'w'))
        json.dump({'poses': {'p': {'reads': {'q': {'Y': ctrl}}}}}, open(os.path.join(c, 'reads.json'), 'w'))
        row = {'id': cid, 'symptom': 'FIX20 X2 fixture', 'table': 'fx_table', 'look': 'default', 'pose': 'p', 'quantity': 'read:q', 'op': 'band', 'target': tgt, 'pm': pm, 'arm': True}
        if noread_ok: row['noread_ok'] = noread_ok
        json.dump({'rows': [row]}, open(os.path.join(d, 'spec.json'), 'w'))
        r = subprocess.run([sys.executable, os.path.abspath(__file__), '--spec', os.path.join(d, 'spec.json'), '--reads', os.path.join(d, 'm'), '--red-arm-reads', os.path.join(d, 'c')], capture_output=True, text=True)
        outp = r.stdout + r.stderr; missing = [w for w in words if w not in outp]
        declared = 'DECLARED NO-READ' in outp
        ok = (r.returncode == want_exit) and not missing and (not noread_ok or not declared)
        rowline = next((l for l in outp.split('\n') if l.startswith(f'| {cid} |')), '(no row line)')
        print(f"[gate] fixture-check {cid}: target {tgt} pm {pm} measured {meas!r} control {ctrl!r}{' noread_ok' if noread_ok else ''} → exit {r.returncode} (want {want_exit}); words {'all present' if not missing else 'MISSING ' + repr(missing)}{'; DECLARED NO-READ printed although the quantity is present' if noread_ok and declared else ''} — {'as expected' if ok else 'UNEXPECTED'}")
        print(f"[gate]   row: {rowline[:230]}")
        if not ok: bad += 1
    for cid, qty, inner_this, inner_other, ctrl, noread_ok, words, want_exit, no_declared in comp:
        d = os.path.join(root, cid); os.makedirs(d)
        # this cell = fx_table@a in reads dir m; 'rel' reads the other poke fx_table@b in the SAME dir; 'relx'/'relset' read alt1 = another reads dir with the same cell; the control dir c arms the row (complete: both pokes)
        for base, tbl, val in (('m', 'fx_table@a', inner_this), ('m', 'fx_table@b', inner_other), ('alt1', 'fx_table@a', inner_other), ('c', 'fx_table@a', ctrl), ('c', 'fx_table@b', inner_other)):
            cd = os.path.join(d, base, 'default', tbl); os.makedirs(cd, exist_ok=True)
            reads = ({} if val is None else {'q': {'Y': val}}); reads['pin'] = {'Y': 7}   # 'pin' = the reverse-pin basis a DECLARED row must read (C2-FIX9): present in every cell
            json.dump({'poses': {'p': {'reads': reads}}}, open(os.path.join(cd, 'reads.json'), 'w'))
        row = {'id': cid, 'symptom': 'FIX20 D1 fixture', 'table': 'fx_table@a', 'look': 'default', 'pose': 'p', 'quantity': qty, 'op': 'band', 'target': 1, 'pm': 0, 'arm': True}
        if noread_ok: row['noread_ok'] = noread_ok; row['noread_pin'] = {'read:pin': 7}   # a declaration without a reverse pin is refused by the gate (C2-FIX9) — the fixture declares like a real row
        json.dump({'rows': [row]}, open(os.path.join(d, 'spec.json'), 'w'))
        cmd = [sys.executable, os.path.abspath(__file__), '--spec', os.path.join(d, 'spec.json'), '--reads', os.path.join(d, 'm'), '--red-arm-reads', os.path.join(d, 'c'), '--alt', f"alt1={os.path.join(d, 'alt1')}"]
        r = subprocess.run(cmd, capture_output=True, text=True); outp = r.stdout + r.stderr; missing = [w for w in words if w not in outp]
        declared = 'DECLARED NO-READ' in outp; tb = 'Traceback' in outp
        ok = (r.returncode == want_exit) and not missing and (not no_declared or not declared) and not tb
        rowline = next((l for l in outp.split('\n') if l.startswith(f'| {cid} |')), '(no row line)')
        print(f"[gate] fixture-check {cid}: quantity {qty} this-inner {inner_this!r} other-inner {inner_other!r} control {str(ctrl)[:12] + ('…' if len(str(ctrl)) > 12 else '')}{' noread_ok' if noread_ok else ''} → exit {r.returncode} (want {want_exit}); words {'all present' if not missing else 'MISSING ' + repr(missing)}{'; DECLARED NO-READ printed although the quantity is present' if no_declared and declared else ''}{'; TRACEBACK' if tb else ''} — {'as expected' if ok else 'UNEXPECTED'}")
        print(f"[gate]   row: {rowline[:230]}")
        if not ok: bad += 1
    cid, qty, inner_this, inner_other, ctrl, noread_ok, words, want_exit, no_declared = text_case
    d = os.path.join(root, cid); os.makedirs(d)
    for base, tbl, val in (('m', 'fx_table@a', inner_this), ('c', 'fx_table@a', ctrl)):
        cd = os.path.join(d, base, 'default', tbl); os.makedirs(cd, exist_ok=True)
        reads = ({} if val is None else {'q': {'Y': val}}); reads['pin'] = {'Y': 7}
        json.dump({'poses': {'p': {'reads': reads}}, 'contract': {'venueError': 'EGL context lost (fixture)', 'venueH3Why': 'budget exceeded (fixture)', 'venueBakeCount': 0}}, open(os.path.join(cd, 'reads.json'), 'w'))
    row = {'id': cid, 'symptom': 'FIX20 E1 fixture', 'table': 'fx_table@a', 'look': 'default', 'pose': 'p', 'quantity': qty, 'op': 'band', 'target': 1, 'pm': 0, 'arm': True, 'noread_ok': noread_ok, 'noread_pin': {'read:pin': 7}, 'noread_basis': 'census:contract:venueError,census:contract:venueH3Why,census:contract:venueBakeCount'}
    json.dump({'rows': [row]}, open(os.path.join(d, 'spec.json'), 'w')); jout = os.path.join(d, 'gate.json')
    r = subprocess.run([sys.executable, os.path.abspath(__file__), '--spec', os.path.join(d, 'spec.json'), '--reads', os.path.join(d, 'm'), '--red-arm-reads', os.path.join(d, 'c'), '--json', jout], capture_output=True, text=True)
    outp = r.stdout + r.stderr; missing = [w for w in words if w not in outp]
    try: jtxt = next(o.get('noread_txt') or '' for o in json.load(open(jout)) if o.get('id') == cid)
    except Exception: jtxt = '(no json row)'
    jmissing = [w for w in words[:3] if w not in jtxt]
    ok = r.returncode == want_exit and not missing and not jmissing
    rowline = next((l for l in outp.split('\n') if l.startswith(f'| {cid} |')), '(no row line)')
    print(f"[gate] fixture-check {cid}: a declared row whose noread_basis names TEXT census fields (venueError, venueH3Why) + a numeric one (venueBakeCount) → exit {r.returncode} (want {want_exit}); report words {'all present verbatim' if not missing else 'MISSING ' + repr(missing)}; JSON noread_txt {'carries the strings verbatim' if not jmissing else 'MISSING ' + repr(jmissing)} — {'as expected' if ok else 'UNEXPECTED'}")
    print(f"[gate]   row: {rowline[:260]}")
    if not ok: bad += 1
    n = len(cases) + len(comp) + 1
    print(f"[gate] fixture-check {'PASS' if bad == 0 else 'FAIL'} — {n - bad}/{n} cases read as expected (exit {0 if bad == 0 else 3}); fixtures under {root}")
    sys.exit(0 if bad == 0 else 3)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec'); ap.add_argument('--reads'); ap.add_argument('--red-arm-reads')
    ap.add_argument('--fixture-check', action='store_true', help='ORDER-LIGHT-C2-FIX20 X2 self-test: temp spec + reads + red-arm-reads under tempfile, each triple run through THIS script by subprocess (the --regen-check precedent) — the real main path, never a replica; one line per triple <inputs> → <word> exit <n> — PASS/FAIL; exit 0 iff all hold, 3 otherwise')
    ap.add_argument('--out'); ap.add_argument('--json')
    ap.add_argument('--alt', action='append', default=[], help='name=reads-dir for rows carrying reads_from / arm_from (ORDER-LIGHT-6: scope, arm, off)')
    ap.add_argument('--force-fail', action='store_true', help='ORDER-LIGHT-7 R-D arm: append a synthetic judged row that FAILS (the seal must exit non-zero)')
    ap.add_argument('--force-silent-record', action='store_true', help='ORDER-LIGHT-11 R-B arm: append a synthetic record:true, arm:true row whose arm is SILENT (the gate must exit non-zero)')
    ap.add_argument('--force-missing', action='append', default=[], choices=['fixture', 'ledger', 'census'], help='ORDER-LIGHT-12 arm: append a synthetic >= row whose quantity names a field the resolver cannot find (the gate must exit non-zero: a missing field fails every operator)')
    ap.add_argument('--force-pin-shift', type=float, default=None, metavar='REL', help='ORDER-LAND-638-FIX4 verifier item 3 arm: shift every pinned row\'s committed coefficients IN MEMORY by REL × that row\'s own tolerance (pm) — the seal passes 2: a pin that passed with deviation d ≤ pm then reads ≥ 2·pm − d ≥ pm on EVERY coefficient, strictly outside the band unless d equalled pm exactly (the pin fixture measured boot_noise 0.0), so the PROBE-pin rows must FAIL and the gate exit non-zero (a MOVED pin is caught on a real read)')
    ap.add_argument('--force-noread-pin', action='store_true', help='C2-FIX9 reverse-pin arm (maintainer condition on land31): break every DECLARED NO-READ row\'s reverse pin IN MEMORY (numeric pins +1, pinned-by ids suffixed) — every declared row must FAIL its reverse pin by name and the gate must exit 3 with the same row counts; a spec with no declared row is NOT FIRED (exit 7)')
    ap.add_argument('--force-noread-expire', action='store_true', help='C2-FIX10 forward-expiry arm (noreadexpire): inject every DECLARED NO-READ row\'s quantity IN MEMORY with a value that must FAIL the row — each declared row must become a JUDGED row and FAIL by name (exit 3); a spec with no declared row is NOT FIRED (exit 7)')
    ap.add_argument('--force-unarmed', action='store_true', help='C2-FIX10 arm (unarmednote): append a synthetic JUDGED row with arm:false and no arm_note — the gate must refuse it (exit 3): an unarmed judged row declares itself or fails')
    ap.add_argument('--force-armbase', action='append', default=[], metavar='ARMALT=READSALT', help='land8 attempt 6 arm: re-point an arm alt at the very reads it is supposed to differ from (ARMALT=READSALT, or ARMALT=reads for the default set). Every row arming from ARMALT must then be caught as NOT-AN-ARM and the gate exit non-zero — the synthetic trigger for the detector that attempt 6\'s nine mis-based arms slipped past')
    ap.add_argument('--check-arms', action='store_true', help='precondition mode: resolve every armed row\'s arm read and exit 3 if any is unreadable (a wiped baseline pose, a missing alt). Writes no gate files')
    ap.add_argument('--regen-check', action='store_true', help='add a SPEC-regen row: the committed spec must equal lighting-gate-spec.py regenerated from the committed reads fixture')
    a = ap.parse_args()
    if a.fixture_check: return fixture_check()
    if not a.spec or not a.reads: ap.error('--spec and --reads are required (unless --fixture-check)')
    spec_doc = json.load(open(a.spec))
    rows = spec_doc['rows']
    ok = True; out = []
    regen_row = None
    if a.regen_check:
        import subprocess, tempfile
        gen = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lighting-gate-spec.py')
        with tempfile.TemporaryDirectory() as td:
            tmp = os.path.join(td, 'spec.json')
            r = subprocess.run([sys.executable, gen, '--out', tmp], capture_output=True, text=True)
            regen = json.load(open(tmp)) if r.returncode == 0 and os.path.exists(tmp) else None
        same = regen is not None and regen.get('rows') == spec_doc.get('rows') and regen.get('bands') == spec_doc.get('bands')
        regen_row = {'id': 'SPEC-regen', 'pass': same, 'note': 'spec == generator(tools/render/fixtures/lighting-ball-reads.json)' if same else f'MISMATCH (generator exit {r.returncode}: {r.stderr.strip()[:120]})'}
        ok = ok and same
    lines = ['| id | symptom | table/look/pose | quantity | target (band rule) | measured (after) | verdict | strict range (values only) | red arm (before) | provenance | source |', '|---|---|---|---|---|---|---|---|---|---|---|']
    alts = dict(x.split('=', 1) for x in a.alt); ALTS.clear(); ALTS.update(alts)  # (relx: reachable from get())
    for spec_ in a.force_armbase:
        # the arm alt is pointed at the reads it must differ from: the exact shape of attempt 6's nine silent rows,
        # whose arm base (2b415aa7) already carried the fix they exist to prove absent
        aa, _, bb = spec_.partition('=')
        src = a.reads if bb in ('', 'reads') else alts.get(bb)
        assert src, f'--force-armbase {spec_}: no reads for {bb!r}'
        alts[aa] = src
        print(f"[gate] ARM --force-armbase {spec_}: arm alt {aa!r} now reads {src} — every row arming from it must be caught as NOT-AN-ARM")
    pin_shifted = []
    if a.force_pin_shift is not None:
        # the committed fixture on disk is untouched; only the in-memory copy of each pinned row moves, by REL × its own pm
        unshiftable = []
        for r in rows:
            if r.get('pin'):
                # ORDER-LIGHT-FIX6: a pinned row with pm 0 cannot be moved by REL × pm at all (the *-prefix-pin rows: their pin is a
                # reference, their test a distance floor) — it is listed, never counted as "shifted", so the fired / NOT FIRED verdict
                # below is over rows the shift can actually move
                if float(r.get('pm', 0.0)) <= 0: unshiftable.append(r['id']); continue
                dv = a.force_pin_shift * float(r.get('pm', 0.0))
                r['pin_orig'] = list(r['pin']); r['pin'] = [x + dv for x in r['pin']]; r['pin_shift'] = dv; pin_shifted.append(r['id'])
        print(f"[gate] ARM --force-pin-shift {a.force_pin_shift}: {len(pin_shifted)} pinned row(s) shifted in memory by REL × pm: {', '.join(pin_shifted)}"
              + (f"; {len(unshiftable)} pinned row(s) with pm 0 cannot be shifted and are not counted: {', '.join(unshiftable)}" if unshiftable else ''))
    for r in rows:
        rd = alts.get(r['reads_from'], None) if r.get('reads_from') else a.reads
        v, err = get(rd, r) if rd else (None, ReadErr(f"alt reads '{r.get('reads_from')}' not given", 'missing'))   # CORRIGENDUM-2 D1: the harness miss is typed 'missing' — an absent alt reads dir stays a declared no-read on a noread_ok row, as before FIX20 (fail-closed either way)
        # FIX20 X2 / CORRIGENDUM-1 C1: only a read the resolver could not find (kind 'missing') can be a DECLARED no-read; a present-but-non-finite or
        # non-numeric quantity (kind 'nonfinite' / 'nonnumeric') is judged and fails by name — tested on the typed kind, never on the word
        if a.force_noread_expire and r.get('noread_ok') and v is None and read_kind(err) == 'missing':
            # C2-FIX10 forward-expiry arm: the quantity 'appears' with a value that must fail the row — the row must leave the declared bucket and be judged
            t_ = float(r['target']); op_ = r.get('op', 'band'); pm_ = float(r.get('pm', 0.0))
            v = (t_ + pm_ + 1.0) if op_ in ('<=', '<') else ((t_ - pm_ - 1.0) if op_ in ('>=', '>') else (t_ + pm_ + 1.0)); err = None
            r = {**r, 'expired_by_arm': True}
        passed = judge(r, v)
        # ORDER-LIGHT-C2-FIX9 (maintainer doctrine, land31): a row that CANNOT be judged is named, never deleted, and never reads as a pass. A row carrying
        # `noread_ok` (the reason) whose quantity resolves to no read is a DECLARED NO-READ: it prints its reason and the measurement behind it
        # (`noread_basis`, a quantity read from the same cell), counts in its own bucket of the summary, and does not fail the gate; the moment the cell
        # DOES carry the quantity (a table that gains a venue term) the row is judged like any other — nothing stays silently green.
        declared_noread = False; noread_txt = ''
        if r.get('noread_ok') and v is None and read_kind(err) == 'missing':
            declared_noread = True; passed = False
            bases = []
            for bq in [x.strip() for x in str(r.get('noread_basis') or '').split(',') if x.strip()]:  # several bases print side by side (C2-FIX9: the degrade name, the emitted why, the bake count)
                try: bv, _be = get_text(rd, {**r, 'quantity': bq}) if rd else (None, 'no reads')   # CORRIGENDUM-3 E1: textual evidence stays verbatim (get_text), never the numeric rule
                except Exception: bv = None
                bases.append(f"{bq.split(':')[-1]} = {bv!r}")
            noread_txt = f"DECLARED NO-READ — {r['noread_ok']}" + (f" (basis: {'; '.join(bases)})" if bases else '') + (f"; post-expiry arm: {r.get('arm_from') or 'default control source'}" if r.get('arm') else '; post-expiry arm: NONE')
        arm_txt = '—'; arm_ok = True; vb = None; arm_cause = None  # vb = the arm's read (also written to the JSON row)
        if r.get('arm') is False and r.get('arm_note'):
            arm_txt = 'unarmed (weak arm, declared)'
        ad = alts.get(r['arm_from'], None) if r.get('arm_from') else a.red_arm_reads
        # ORDER-LIGHT-C2 (b) (review r2 P2, lighting-gate.py:159): an armed row whose control dataset does not resolve — a named alt
        # not given OR the default source (--red-arm-reads) not given — is NO-READ. It used to pass with nothing read when the
        # default source was absent (arm_ok stayed True); 14 committed rows arm from the default source.
        if r.get('arm') and not ad:
            arm_ok = False; arm_cause = 'NO-READ'
            arm_txt = (f"no arm reads (alt '{r['arm_from']}' not given) → NO-READ" if r.get('arm_from')
                       else 'no arm reads (default control source: --red-arm-reads not given) → NO-READ')
        elif ad and r.get('arm'):
            # ORDER-LAND-638-FIX: an arm set may hold the table under another key (a poke label, or none) — arm_table names it
            vb, errb = get(ad, {**r, 'table': r.get('arm_table') or r['table'], 'look': r.get('arm_look') or r['look']})  # C2-FIX10: arm_look — a plant captured in one look arms rows of another (slowbake is default-only)
            armed = not judge(r, vb)  # must FAIL on the current rig / the armed boot
            arm_ok = armed
            # land8 attempt 6: one undifferentiated "SILENT" hid two different harness defects behind the same word —
            # a baseline whose pose a later capture wiped, and an arm base that already contained the fix. Every
            # non-firing arm now names its own cause; all three causes still FAIL the gate (ORDER-LIGHT-6 / R-B).
            if vb is None:
                arm_ok = False; arm_cause = 'NO-READ'          # missing capture, missing pose, missing field
                arm_txt = f'no read ({errb}) → NO-READ'
            elif not armed and v is not None and vb == v:
                arm_ok = False; arm_cause = 'NOT-AN-ARM'       # the arm base carries the fix / the same tree twice
                arm_txt = f'{vb:.4f} → NOT-AN-ARM (bit-identical to the measured read — the arm set is the same tree, or its base already carries the fix under test)'
            elif not armed:
                arm_cause = 'NO-FIRE'                          # a real, different read that still passes the row
                arm_txt = f'{vb:.4f} → NO-FIRE'
            else:
                arm_txt = f'{vb:.4f} → RED'
        # record-only rows (a measured verdict the lane cannot close by a rig term) never fail the gate on their
        # VALUE — but they keep their own consistency check inside ok (ORDER-LIGHT-7 R-D): a record row with no read
        # (missing capture, missing pose, broken quantity) is a broken seal, not a recorded gap
        # ORDER-LIGHT-11 R-B (review round 2 F): FAIL-CLOSED for record rows too — a record row's value never fails
        # the gate, but a missing read OR a SILENT red arm does (the arm is the row's negative control; a seal must
        # not pass with a broken control on an armed row of either kind)
        undeclared_unarmed = (not r.get('record')) and (not declared_noread) and (not r.get('arm')) and (not r.get('arm_note'))
        if undeclared_unarmed:
            arm_txt = 'UNARMED AND UNDECLARED — a judged row with arm:false and no arm_note (C2-FIX10): it must declare why it has no negative control, or carry one'; arm_ok = False; arm_cause = 'UNDECLARED'
        if declared_noread:
            pass  # named, not a pass, not a fail (the reason and the basis are printed on the row)
        elif not r.get('record'):
            ok = ok and passed and arm_ok
        else:
            ok = ok and (v is not None) and arm_ok
        tgt = f"{r.get('op', 'band')} {r['target']:.4f} ± {r.get('pm', 0):.4f}"
        strict = ''
        st_ = (r.get('band') or {}).get('strict')
        if r.get('band') and st_ is None and (r.get('band') or {}).get('n_admissible') == 1:
            strict = 'single read'
        if st_ and v is not None:
            inside = st_['lo'] <= v <= st_['hi'] if r.get('op', 'band') == 'band' else (v <= st_['hi'] if r.get('op') == '<=' else v >= st_['lo'])
            strict = f"{st_['lo']:.3f}–{st_['hi']:.3f}: {'inside' if inside else 'OUTSIDE'}"
        lines.append(f"| {r['id']} | {r.get('symptom', '')} | {r['table']}/{r['look']}/{r.get('pose') or '—'} | {r['quantity']} | {tgt} | "
                     f"{(f'{v:.4f}' if v is not None else ('no read (declared): ' + str(err) if declared_noread else 'no read: ' + str(err)))} | {noread_txt if declared_noread else (('PASS' if passed else '**FAIL**') if not r.get('record') else ('in band' if passed else 'GAP (recorded)'))} | {strict} | {arm_txt} | {r.get('provenance', '')} | {r.get('source', '')} |")
        # ORDER-LAND-638-FIX: the JSON carries the SAME arm read the verdict used (an arm_table row re-read with the bare
        # row here came back None while the markdown showed the fired value)
        out.append({**r, 'measured': v, 'pass': passed, 'declared_noread': declared_noread, 'noread_txt': noread_txt, 'arm_ok': arm_ok, 'strict_verdict': strict, 'arm_value': (vb if (ad and r.get('arm')) else None), 'arm_txt': arm_txt, 'arm_cause': arm_cause,
                    'arm_source': (ad if r.get('arm') else None), 'arm_source_kind': ('alt:' + r['arm_from'] if r.get('arm_from') else 'default:--red-arm-reads') if r.get('arm') else None})  # C2 (b): the resolved control dataset rides in the JSON
    if a.check_arms:
        armed_rows = [o for o in out if o.get('arm')]
        bad = [o for o in armed_rows if o.get('arm_cause') in ('NO-READ', 'NOT-AN-ARM')]
        for o in bad:
            print(f"[check-arms] {o['arm_cause']:11s} {o['id']:30s} arm_from={o.get('arm_from') or '(red-arm-reads)'} "
                  f"{o['table']}/{o['look']}/{o.get('pose') or '-'} :: {o['arm_txt']}")
        # ORDER-LIGHT-C2 (b): the sweep — every armed row's resolved control dataset, default-source rows listed by name
        dflt = [o for o in armed_rows if not o.get('arm_from')]
        srcs = sorted({str(o.get('arm_source')) for o in armed_rows})
        print(f"[check-arms] control datasets resolved: {len(armed_rows)} armed rows over {len(srcs)} dataset(s): " + ', '.join(srcs))
        print(f"[check-arms] default-source rows ({len(dflt)}, --red-arm-reads = {a.red_arm_reads!r}): " + ', '.join(f"{o['id']}→{'NO-READ' if o.get('arm_cause') == 'NO-READ' else os.path.relpath(str(o.get('arm_source')))}" for o in dflt))
        print(f"[check-arms] {len(armed_rows)} armed rows, {len(bad)} cannot prove anything "
              f"({sum(1 for o in bad if o['arm_cause'] == 'NO-READ')} NO-READ, {sum(1 for o in bad if o['arm_cause'] == 'NOT-AN-ARM')} NOT-AN-ARM)")
        sys.exit(3 if bad else 0)
    if a.force_fail:
        lines.append('| ARM-force-fail | R-D arm: a synthetic judged row that fails | — | forced | 0 | 1 | **FAIL** | — | — | ARM |')
        out.append({'id': 'ARM-force-fail', 'pass': False, 'record': False, 'arm': False, 'measured': 1, 'target': 0, 'note': 'synthetic (--force-fail)'})
        ok = False
    for res in a.force_missing:
        # a >= row on a field that does not exist: with the old +inf convention it PASSED; now it reads 'no read' and FAILS
        q = {'fixture': 'fixture:occlusion-check:no_such_field', 'ledger': 'ledger:ball_crown:no_such_field', 'census': 'census:giBlocks:no_such_field'}[res]
        rr = {'id': f'ARM-missing-{res}', 'table': 'predator_apex_9ft@barsoff' if res == 'ledger' else 'predator_apex_9ft', 'look': 'default', 'pose': None, 'quantity': q, 'op': '>=', 'target': 0.0, 'pm': 0.0, 'reads_from': 'scope' if res == 'ledger' else None}
        rd_ = alts.get('scope') if res == 'ledger' else a.reads
        vv, ee = get(rd_, rr) if rd_ else (None, 'no scope reads')
        pv = judge(rr, vv)
        lines.append(f"| ARM-missing-{res} | ORDER-LIGHT-12 arm: a synthetic >= row on a field the {res} resolver cannot find | — | {q} | >= 0.0000 ± 0.0000 | {('no read: ' + str(ee)) if vv is None else f'{vv:.4f}'} | {'PASS' if pv else '**FAIL**'} | — | — | ARM |")
        out.append({'id': f'ARM-missing-{res}', 'pass': pv, 'record': False, 'arm': False, 'measured': vv, 'target': 0.0, 'note': f'synthetic (--force-missing {res}): {ee}'})
        ok = ok and pv
    if a.force_silent_record:
        lines.append('| ARM-force-silent-record | R-B arm: a synthetic record:true, arm:true row whose red arm is SILENT | — | forced | 0 | 0 | in band | — | 0.0000 → SILENT | ARM |')
        out.append({'id': 'ARM-force-silent-record', 'pass': True, 'record': True, 'arm': True, 'arm_ok': False, 'measured': 0, 'target': 0, 'arm_value': 0, 'arm_cause': 'NOT-AN-ARM', 'arm_txt': '0.0000 → NOT-AN-ARM (synthetic)', 'note': 'synthetic (--force-silent-record): the arm reads the same value as the row → SILENT → the gate must fail'})
        ok = False
    if a.force_unarmed:
        lines.append('| ARM-force-unarmed | C2-FIX10 arm: a synthetic JUDGED row with arm:false and no arm_note | — | forced | 0 | 0 | in band | — | UNARMED AND UNDECLARED → the gate refuses | ARM |')
        out.append({'id': 'ARM-force-unarmed', 'pass': True, 'record': False, 'arm': False, 'arm_ok': False, 'arm_cause': 'UNDECLARED', 'measured': 0, 'target': 0, 'note': 'synthetic (--force-unarmed)'})
        ok = False
    if regen_row is not None:
        lines.append(f"| SPEC-regen | gate spec regenerates from the repo | — | spec == generator(fixture) | equal | {'equal' if regen_row['pass'] else 'DIFFERENT'} | {'PASS' if regen_row['pass'] else '**FAIL**'} | | — | GENERATOR | {regen_row['note']} |")
        out.append({**regen_row, 'record': False, 'arm': False, 'arm_note': 'synthetic: the generator equality has no control dataset; its negative control is the seal arm speckey (a mis-keyed spec is refused by name)'})
    # ORDER-LIGHT-C2-FIX9 (maintainer condition on land31, after the regate of record): a DECLARED NO-READ asserts in the OTHER direction too —
    # that the cause it names still holds. Without this a declaration goes quiet and outlives its cause (venueDerived flips 0 → 1 on a table that
    # gained a term while venueBudgetDegrade stays null: the row would keep printing "declared" and nothing would red). Two forms, one law:
    #   noread_pin       — {basis quantity: value at declaration}; the basis must READ and must EQUAL the pin (exact; a pin is a fact, not a band)
    #   noread_pinned_by — ids of JUDGED, ARMED rows on the same cell that pin the cause (the legacy row: the three condition-2 assertions);
    #                      each must exist, be judged (not record, not declared), be armed, PASS and have a fired arm
    # A declared row with neither, an unreadable pin, or a pin that reads otherwise FAILS the gate; the message names the pin and its read.
    # The FORWARD expiry above is untouched: the moment the quantity reads, the row is judged like any other. --force-noread-pin is the arm.
    byid_all = {o['id']: o for o in out}; rp_lines = []; rp_fail = []; rp_n = 0
    for o in out:
        if not o.get('declared_noread'): continue
        rp_n += 1
        rd_ = alts.get(o['reads_from'], None) if o.get('reads_from') else a.reads
        pins = dict(o.get('noread_pin') or {}); by = list(o.get('noread_pinned_by') or [])
        if a.force_noread_pin:
            pins = {k: ((v + 1) if isinstance(v, (int, float)) and not isinstance(v, bool) else f'{v}!ARM') for k, v in pins.items()}
            by = [f'{x}-BROKEN-BY-ARM' for x in by]
        parts = []; holds = True
        if not pins and not by:
            holds = False; parts.append('NO REVERSE PIN — a declaration without noread_pin / noread_pinned_by is refused')
        for bq, exp in pins.items():
            name = bq.split(':')[-1]
            try: bv, be = get(rd_, {**o, 'quantity': bq}) if rd_ else (None, 'no reads')
            except Exception as e: bv, be = None, str(e)
            num = isinstance(exp, (int, float)) and not isinstance(exp, bool) and isinstance(bv, (int, float)) and not isinstance(bv, bool)
            if bv is None:
                holds = False; parts.append(f'{name}: UNREADABLE ({be}) — pinned {exp!r}; the declared cause cannot be confirmed')
            elif (abs(bv - exp) > 0) if num else (str(bv) != str(exp)):
                holds = False; parts.append(f'{name} reads {bv!r} ≠ pinned {exp!r} — the declared cause no longer holds')
            else:
                parts.append(f'{name} reads {bv!r} = pinned {exp!r}')
        for pid in by:
            q_ = byid_all.get(pid)
            if q_ is None:
                holds = False; parts.append(f'pinned-by row {pid}: MISSING from the spec')
            elif q_.get('record') or q_.get('declared_noread'):
                holds = False; parts.append(f'pinned-by row {pid}: not a judged row')
            elif not q_.get('arm'):
                holds = False; parts.append(f'pinned-by row {pid}: not armed')
            else:
                exp_txt = f"{q_.get('op', 'band')} {q_['target']} ± {q_.get('pm', 0)}"
                if not q_.get('pass') or not q_.get('arm_ok'):
                    holds = False; parts.append(f"pinned-by row {pid}: {'FAIL' if not q_.get('pass') else 'arm silent'} (reads {q_.get('measured')!r}, expects {exp_txt}, arm {q_.get('arm_txt')})")
                else:
                    parts.append(f"pinned-by row {pid}: PASS (reads {q_.get('measured')!r}, expects {exp_txt}, arm {q_.get('arm_txt')})")
        o['noread_pin_ok'] = holds; o['noread_pin_txt'] = '; '.join(parts)
        if not holds: rp_fail.append(o['id'])
        rp_lines.append(f"| {o['id']} | {'HOLDS' if holds else '**FAILED**'} | {'; '.join(parts)} |")
    nr_not_fired = False; ok_before_nr = ok
    if a.force_noread_expire:
        exp_rows = [o for o in out if o.get('expired_by_arm')]; exp_fail = [o['id'] for o in exp_rows if not o.get('pass')]
        fired_e = bool(exp_rows) and len(exp_fail) == len(exp_rows)
        lines += ['', f"ARM --force-noread-expire: {len(exp_rows)} declared row(s) given their quantity in memory (a value that must fail), {len(exp_fail)} judged and FAILED ({', '.join(exp_fail) if exp_fail else 'NONE'}) → " + ('FIRED (the gate exits 3): the forward expiry is live — a declared row whose quantity appears is judged like any other' if fired_e else 'NOT FIRED — no declared row expired into a failing judged row: the arm proves nothing (exit 7, the NO-FIRE class)')]
        print(f"[gate] ARM --force-noread-expire: {'FIRED' if fired_e else 'NOT FIRED'} ({len(exp_fail)}/{len(exp_rows)} declared rows expired and failed)")
        if not fired_e: ok = False; nr_not_fired = True
    if rp_n:
        lines += ['', 'DECLARED NO-READ rows — the reverse direction (C2-FIX9, maintainer condition on land31): each declaration asserts that its cause still holds — a pinned basis value (`noread_pin`, exact) or named judged, armed rows (`noread_pinned_by`, each must PASS with a fired arm); a pin that reads otherwise, is unreadable or is absent FAILS the gate. The forward expiry (the row is judged the moment its quantity reads) is unchanged.', '',
                  '| declared row | reverse pin | reads |', '|---|---|---|'] + rp_lines
        ok = ok and not rp_fail
    if a.force_noread_pin:
        fired = rp_n > 0 and len(rp_fail) == rp_n
        lines += ['', f"ARM --force-noread-pin: {rp_n} declared row(s) with their reverse pin broken in memory, {len(rp_fail)} failed ({', '.join(rp_fail) if rp_fail else 'NONE'}) → "
                      f"{'FIRED (the gate exits 3)' if fired else 'NOT FIRED — no declared row failed its broken pin: the arm proves nothing (exit 7, the NO-FIRE class)'}"]
        print(f"[gate] ARM --force-noread-pin: {'FIRED' if fired else 'NOT FIRED'} ({len(rp_fail)}/{rp_n} declared rows failed their broken reverse pin)")
        if not fired: ok = False; nr_not_fired = True
    pin_not_fired = False; ok_before_pin = ok
    if pin_shifted:
        # ORDER-LIGHT-FIX6 (refuter round 2, P3): a pinned row FIRES only if it has a READ, PASSES on its unshifted pin and FAILS on the
        # shifted one — a row with no derived probe fails identically at shift 0 and proved nothing (it is a NO-READ, named)
        byid = {r['id']: r for r in rows}; failed_pins = []; noread_pins = []; already_red = []
        for o in out:
            if o['id'] not in pin_shifted: continue
            r = byid[o['id']]; rd_ = alts.get(r['reads_from'], None) if r.get('reads_from') else a.reads
            if o.get('measured') is None: noread_pins.append(o['id']); continue
            v0, _e0 = get(rd_, {**r, 'pin': r['pin_orig']}) if rd_ else (None, 'no reads')
            if v0 is None or not judge({**r, 'pin': r['pin_orig']}, v0): already_red.append(o['id']); continue
            if not o['pass']: failed_pins.append(o['id'])
        fired = bool(failed_pins)
        if noread_pins or already_red:
            lines += ['', f"ARM --force-pin-shift: NOT counted — no read: {', '.join(noread_pins) or 'none'}; already failing unshifted: {', '.join(already_red) or 'none'}"]
        # ORDER-LIGHT-FIX6 (review r10 P2, lighting-gate.py:228-231): the arm FIRES only if the shifted rows actually failed. A shift no
        # pinned row fails on (a zero shift, or a gate insensitive to moved pins) is NOT FIRED — the NO-FIRE class — and exits 7, a
        # code the seal's `pinmove` arm does not declare (its step:code is gate:3), so the seal reads it as a proof of nothing instead
        # of a fired arm; the `pinzero` arm (--force-pin-shift 0) declares gate:7 and must read exactly that.
        lines += ['', f"ARM --force-pin-shift {a.force_pin_shift}: pinned rows shifted {len(pin_shifted)}, failing {len(failed_pins)} ({', '.join(failed_pins) if fired else 'NONE'}) → "
                      f"{'FIRED (the gate exits 3)' if fired else 'NOT FIRED — no pinned row failed under the shift: the arm proves nothing (exit 7, the NO-FIRE class)'}"]
        print(f"[gate] ARM --force-pin-shift {a.force_pin_shift}: {'FIRED' if fired else 'NOT FIRED'} ({len(failed_pins)}/{len(pin_shifted)} shifted pins failed)")
        ok = False; pin_not_fired = not fired
    declared_rows = [o for o in out if o.get('declared_noread')]
    judged = [o for o in out if not o.get('record') and not o.get('declared_noread')]
    armed_rows = [o for o in out if o.get('arm')]
    silent = [o for o in armed_rows if not o['arm_ok']]
    undecl = [o for o in out if (not o.get('record')) and (not o.get('declared_noread')) and (not o.get('arm')) and (not o.get('arm_note'))]
    if undecl: ok = False
    causes = [(c, sum(1 for o in silent if o.get('arm_cause') == c)) for c in ('NO-READ', 'NOT-AN-ARM', 'NO-FIRE')]
    breakdown = ' [' + ', '.join(f'{c} {n}' for c, n in causes if n) + ']' if silent else ''
    decl_txt = (f"{len(declared_rows)} DECLARED NO-READ ({', '.join(o['id'] for o in declared_rows)}) — named, not a pass; reverse pins "
                + (f"{len(declared_rows) - len(rp_fail)} hold, {len(rp_fail)} FAILED ({', '.join(rp_fail)}); " if rp_fail else f"{len(declared_rows)}/{len(declared_rows)} hold; ") if declared_rows else '')
    lines += ['', f"**GATE: {'PASS' if ok else 'FAIL'}** ({sum(1 for o in judged if o['pass'])}/{len(judged)} judged rows pass; {decl_txt}"
                  f"{sum(1 for o in out if o.get('record'))} record-only rows; unarmed judged rows without a declaration {len(undecl)}{(' (' + ', '.join(o['id'] for o in undecl[:6]) + (', …' if len(undecl) > 6 else '') + ') — FAIL') if undecl else ''}; red arm {len(armed_rows)} armed rows, "
                  f"{len(armed_rows) - len(silent)} fired, {len(silent)} silent{breakdown} — fail-closed for judged AND record rows)"]
    rep = '\n'.join(lines); print(rep)
    if a.out:
        open(a.out, 'w').write(rep + '\n')
    if a.json:
        json.dump(out, open(a.json, 'w'), indent=1)
    # exit 7 (NOT FIRED) only when the pin arm is the SOLE reason the gate is red — a genuine failure elsewhere keeps exit 3, so the
    # pinzero arm (declared gate:7) reads WRONG-REASON on a red gate instead of FIRED (refuter round 2, note)
    sys.exit(0 if ok else (7 if ((pin_not_fired and ok_before_pin) or (nr_not_fired and ok_before_nr)) else 3))


if __name__ == '__main__':
    main()
