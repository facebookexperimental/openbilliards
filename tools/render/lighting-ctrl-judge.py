#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-ctrl-judge.py — ORDER-LIGHT-C2-FIX8 seal form 2 (maintainer ruling 2026-09-13 ~18:05Z, after land25): reads the strict comparisons
check-ctrl wrote (A1 vs B1, B2 vs A2 = the CROSS pairs; A1 vs A2, B1 vs B2 = the SAME-WEB pairs) and JUDGES, per cell, ONE thing: every cross pair's
PNG bytes are identical (0 changed pixels at the displayed 8-bit precision, strict — the display quantum). The linear-HDR difference is RECORDED, not
judged: changed px, max |d|, max ULP and the share of differing floats within one ULP.

ORDER-LIGHT-C2-FIX10 (maintainer rulings 2026-09-14 16:2xZ / 16:4xZ / 17:0xZ, after land34 + land35 attempt 1 and the strict smoke):
 0. AMENDMENT 3 — the control BOOTS are asserted first (--boots: per set, cell and frame, the census numbers): under venueConverge=strict every boot
    must read mode strict, settleRel == 0 AND venueSettleRounds < venueConvergeMax. A boot that stopped at the cap with a residual is "stop at round
    8" — the original defect under the new name — and voids the capture: `UNJUDGEABLE (instrument)` naming the boot with both numbers, exit 3, never
    PASS and never FAIL (a capped boot is a measurement that did not finish, not a disagreement). Under a non-strict law each boot must read settled.
 1. the two SAME-WEB pairs are the instrument's SELF-CHECKS and are evaluated before the cross pairs. If either side's two boots disagree on a cell's
    PNG bytes (or a same-web comparison is missing), that cell's cross-pair verdict is WITHHELD and reads `UNJUDGEABLE (instrument) — <side>
    self-check differs: …` naming the side that moved, with the HDR numbers as EVIDENCE (never in a predicate — there is no tolerance in this judge).
    UNJUDGEABLE exits 3 exactly like FAIL and halts the chain: a named non-pass that forces a re-run, not a skip and not a softening.
 2. BOTH frames of a cell are judged: the boot frame (--cross/--same) and the converged frame after the poke's re-bakes (--cross-conv/--same-conv).
 3. the SENSITIVITY row (--sens: B2 vs the boot whose declared SH coefficient moved by 2e-5 relative after its last re-bake, conv frame): the
    comparator must see it — at least one cell's PNG bytes must differ, and every differing cell is NAMED. Identical on every cell = the instrument is
    BLIND below the shipped tolerance floor: `UNJUDGEABLE (instrument blind)`, exit 3.
 4. AMENDMENT 1 — the row also decides WHICH cells carry the verdict: a cell whose PNG bytes the 2e-5 move breaks is LOAD-BEARING; a cell it leaves
    PNG-identical is NOT (there, "cross pair identical" is what a 2e-5 divergence also produces — agreement the construction forces): those cells read
    `IDENTICAL — not load-bearing at 2e-5 (unjudgeable at the tolerance scale)`, and the CLAIM names both lists. The row is measured on the converged
    frame; the boot frame's cells inherit the classification by pose (same camera, same ball footprint) — stated as a transfer, not a measurement.
 5. AMENDMENT 2 — the NON-CLAIM names the ONE direction the row measured (the perturbed coefficient, self-declared by the set): no claim is made about
    an equal-magnitude move along the higher SH bands.
 6. --stage, --mode (the law read from B2's census), --provenance, --perturb are printed in the verdict block; --claim-out receives the CLAIM and
    NON-CLAIM sentences check-ctrl quotes whole.
usage: lighting-ctrl-judge.py --cross a1b1.json b2a2.json --same a1a2.json b1b2.json [--cross-conv … --same-conv …] --sens b2sens.json --boots boots.json
       [--stage S --mode M --provenance F --perturb JSON --claim-out F] [--out judge.md]   exit 0 = PASS, 3 = FAIL or UNJUDGEABLE (instrument[ blind])"""
import argparse, json, sys
# --- ATTRIBUTION (guarded by --attrib / --attrib-selftest; maintainer ruling 2026-09-15 00:5xZ — the four-word reading on a merged tree) BEGIN
ATTRIB_FILES = {'T': 'web/scene/table.js', 'H': 'web/app.html+kit.css'}   # what each main-only variant carries (named by the caller's construction; printed, never judged)
def attrib_classify(cell, per_variant):
    """per_variant: {name: {'A1': rec|None, 'B1': rec|None}} — rec is a pixel-strict cell record ({'png': 'identical bytes'|..., 'changed': n, 'maxabs': x}) of the
    main-only variant against A1 (the pre-merge lane web) and against B1 (the merged web). A variant REPRODUCES B1 when its PNG bytes equal B1's and differ from A1's;
    it EQUALS A1 when its PNG bytes equal A1's and differ from B1's. ATTRIBUTED only when EXACTLY ONE variant reproduces B1 and EVERY other variant equals A1;
    both / neither / a variant that matches neither → NOT attributed; a missing or unreadable record → UNREADABLE (never attributed)."""
    rep, eq, bad, other = [], [], [], []
    for v, d in sorted(per_variant.items()):
        ra, rb = d.get('A1'), d.get('B1')
        if not isinstance(ra, dict) or not isinstance(rb, dict) or ra.get('changed') is None or rb.get('changed') is None or ra.get('png') is None or rb.get('png') is None: bad.append(v); continue
        ia, ib = ra.get('png') == 'identical bytes', rb.get('png') == 'identical bytes'
        if ib and not ia: rep.append(v)
        elif ia and not ib: eq.append(v)
        else: other.append(f"{v} ({'equals both' if ia and ib else 'differs from both'})")
    if bad: return ('UNREADABLE', f"attribution set(s) {', '.join(bad)} unreadable or missing this cell")
    if len(rep) == 1 and len(eq) == len(per_variant) - 1: return ('ATTRIBUTED', rep[0])
    if len(rep) == 1: return ('NOT-ATTRIBUTED', f"variant {rep[0]} reproduces B1 but the other does not equal A1: {', '.join(other)}")
    if not rep: return ('NOT-ATTRIBUTED', 'no variant reproduces B1 (' + ', '.join([f"{v} equals A1" for v in eq] + other) + ')')
    return ('NOT-ATTRIBUTED', f"{len(rep)} variants reproduce B1 ({', '.join(rep)}) — not exactly one")
if '--attrib-selftest' in sys.argv:
    I = {'png': 'identical bytes', 'changed': 0}; D = {'png': 'differs', 'changed': 48, 'maxabs': 5.24e-05}
    cases = [('one variant: T reproduces B1, H equals A1', {'T': {'A1': D, 'B1': I}, 'H': {'A1': I, 'B1': D}}, 'ATTRIBUTED'),
             ('both variants reproduce B1', {'T': {'A1': D, 'B1': I}, 'H': {'A1': D, 'B1': I}}, 'NOT-ATTRIBUTED'),
             ('neither reproduces B1 (both equal A1)', {'T': {'A1': I, 'B1': D}, 'H': {'A1': I, 'B1': D}}, 'NOT-ATTRIBUTED'),
             ('one reproduces, the other differs from both', {'T': {'A1': D, 'B1': I}, 'H': {'A1': D, 'B1': D}}, 'NOT-ATTRIBUTED'),
             ('unreadable variant record', {'T': {'A1': None, 'B1': I}, 'H': {'A1': I, 'B1': D}}, 'UNREADABLE')]
    ok = True
    for name, pv, want in cases:
        got = attrib_classify('cell', pv); ok = ok and got[0] == want; print(f"[ctrl-judge] attrib-selftest {name}: {got} -> {'ok' if got[0] == want else 'WRONG (want ' + want + ')'}")
    print(f"[ctrl-judge] ATTRIB-SELFTEST {'PASS' if ok else 'FAIL'} — {len(cases)} cell cases"); sys.exit(0 if ok else 1)
# --- ATTRIBUTION END
ap = argparse.ArgumentParser()
_REQ = '--bootframe-selftest' not in sys.argv
ap.add_argument('--cross', nargs=2, required=_REQ); ap.add_argument('--same', nargs=2, required=_REQ)
# BOOT-FRAME LAW (maintainer ruling 2026-09-15 01:4xZ, coldwarm-l41): the boot frame is bimodal on identical bytes (two states 48–49 px / 5.24e-05 apart, independent of root, freshness and tree bytes;
# 9 boots of 5 roots, 00:14–01:36Z) while every converged frame was identical — so the converged frame carries EVERY verdict (cross pairs, self-checks, sensitivity) and the boot frame is RECORD only.
# `--boot-frame judge` reproduces the old law for the record and the selftest; it is not the law.
ap.add_argument('--boot-frame', default='record', choices=['record', 'judge'])
ap.add_argument('--bootframe-selftest', action='store_true')
ap.add_argument('--cross-conv', nargs=2, default=None); ap.add_argument('--same-conv', nargs=2, default=None)
ap.add_argument('--sens', default=None); ap.add_argument('--boots', default=None); ap.add_argument('--stage', default='regate'); ap.add_argument('--mode', default='unknown')
ap.add_argument('--provenance', default=''); ap.add_argument('--perturb', default=''); ap.add_argument('--claim-out', default=''); ap.add_argument('--out', default='')
ap.add_argument('--venue-decl', default=None, help='per table x look declaration (venue: runs | identity-by-design) — asserted against the census in BOTH directions')
ap.add_argument('--arms', default='', help='the arm list of THIS run (space-separated; from the driver ARMLIST or the seal ARM_EXPECT) — the truth table prints which cells have an arm in it')
ap.add_argument('--arms-src', default='', help='where --arms came from (printed)')
ap.add_argument('--frames', default=None, help='pixel-strict JSON of ONE boot\'s boot frame vs its conv frame (B2): the measured distance the pose transfer crosses')
# --- ATTRIBUTION (guarded by --attrib) BEGIN
ap.add_argument('--attrib', nargs='*', default=None, help='NAME=PREFIX pairs of main-only variants; PREFIX-vsA1-boot.json / -vsB1-boot.json / -vsA1-conv.json / -vsB1-conv.json are pixel-strict JSONs of the variant against A1 and B1; every cross-pair PNG difference is classified per cell from them (ATTRIBUTED only when exactly one variant reproduces B1 and the other equals A1)')
# --- ATTRIBUTION END
a = ap.parse_args()
STRICT = a.mode == 'strict'
def load(p):
    try: return {r['cell']: r for r in json.load(open(p))['rows']}
    except Exception as e: print(f'[ctrl-judge] DEAD: cannot read {p}: {e}'); sys.exit(3)
def rec(r):
    if not r or r.get('changed') is None: return 'MISSING'
    if r['changed'] == 0: return '0 px'
    um = r.get('ulpMax'); le = r.get('ulpLe1')
    return f"{r['changed']} px / max |d| {r['maxabs']:.3g}" + (f" / max {um:.2f} ULP / {100*le:.1f} % <= 1 ULP" if um is not None else ' / ULP n/a')
lines = []
# 0) the boots (AMENDMENT 3)
boot_bad = []; boot_red = []; boots = []; rounds = []; novenue = set()
if a.boots:
    try: boots = json.load(open(a.boots))
    except Exception as e: print(f'[ctrl-judge] DEAD: cannot read {a.boots}: {e}'); sys.exit(3)
    lines.append('\n### control boots (census numbers; asserted first)\n')
    lines.append('| set | cell | frame | mode | tol | settleRel | rounds / max | bakes (cold 1st) | derived | verdict |'); lines.append('|---|---|---|---|---|---|---|---|---|---|')
    def no_venue_signature(b):
        """the census of a venue term that never ran: derived 0, no error, no bake, no wait, zero/absent uniform — the SAME reading a silently stopped term produces, which is why it never decides the class alone"""
        return b.get('derived') == 0 and b.get('error') in (None, '') and b.get('bakeCount') is None and (b.get('uniformL1') in (0, 0.0, None)) and b.get('waitedMs') is None
    novenue = set(); DECL = {}
    if a.venue_decl:
        try: DECL = json.load(open(a.venue_decl))
        except Exception as e: print(f'[ctrl-judge] DEAD: cannot read the venue declaration {a.venue_decl}: {e}'); sys.exit(3)
    def declared(cell):
        look, table = cell.split('/')[:2]; d = DECL.get(table, {}).get(look) if isinstance(DECL.get(table), dict) else None
        return (d.get('venue'), d.get('why', '')) if isinstance(d, dict) else (None, '')
    TT = {}  # truth-table counts: (declaration, census) -> readings
    def census_state(b):
        if 'error' in b and 'derived' not in b: return 'unreadable'
        if b.get('derived') == 1: return 'derived1'
        return 'never-ran' if no_venue_signature(b) else 'mismatched'
    for b in boots:
        why = None; red = None
        dv, dwhy = declared(b['cell']); cs = census_state(b); dk = dv if dv in ('runs', 'identity-by-design') else ('undeclared' if dv is None else f'unknown:{dv}')
        TT[(dk, cs)] = TT.get((dk, cs), 0) + 1
        mism = f"derived {b.get('derived')} with error {b.get('error')!r}, bakes {b.get('bakeCount')}, waited {b.get('waitedMs')} ms, uniform L1 {b.get('uniformL1')}"
        if cs == 'unreadable': why = f"census unreadable: {b['error']}"
        elif dk == 'undeclared': why = f"no venue declaration for {b['cell']} in {a.venue_decl or '(no --venue-decl)'} — an undeclared table is not judged"
        elif dk.startswith('unknown'): why = f"unknown declaration {dv!r} for {b['cell']}"
        elif dk == 'identity-by-design':
            if cs == 'derived1': why = f"declared identity-by-design but the census reads derived 1 — the fixture changed under the declaration ({dwhy[:80]})"
            elif cs == 'mismatched': red = f"declared identity-by-design but the census is NOT the never-ran signature ({mism}) — the excluded surface is broken: the venue term attempted or degraded where it is declared never to run; never by design"
            else:
                novenue.add(b['cell']); lines.append(f"| {b['set']} | {b['cell']} | {b['frame']} | — | — | — | — | — | 0 | n/a — identity by design, DECLARED in {a.venue_decl} ({dwhy[:90]}); census agrees (derived 0, no error, no bake, no wait, uniform L1 {b.get('uniformL1')}) |"); continue
        elif dk == 'runs':
            if cs != 'derived1': red = f"declared to RUN ({dwhy[:60]}) but the census reads {mism} — the venue term did not run where it is declared to run" + (' (degraded, not silent)' if cs == 'mismatched' else ' (never ran)')
        if red: boot_red.append(f"{b['set']} {b['cell']} [{b['frame']}]: {red}")
        elif why is None and dv == 'runs' and STRICT:
            if b.get('mode') != 'strict': why = f"mode {b.get('mode')!r}, not strict"
            elif b.get('settleRel') != 0: why = f"settleRel {b.get('settleRel')} != 0"
            elif not isinstance(b.get('settleRounds'), (int, float)) or not isinstance(b.get('max'), (int, float)): why = f"rounds {b.get('settleRounds')} / max {b.get('max')} unrecorded"
            elif b['settleRounds'] >= b['max']: why = f"rounds {b['settleRounds']} reached max {b['max']} with settleRel {b.get('settleRel')} — stopped by the cap, not by convergence"
            else: rounds.append(b['settleRounds'])
        elif why is None and dv == 'runs':
            if b.get('settled') != 1: why = f"settled {b.get('settled')} != 1 under venueConverge={b.get('mode')}"
        if why: boot_bad.append(f"{b['set']} {b['cell']} [{b['frame']}]: {why}")
        lines.append(f"| {b['set']} | {b['cell']} | {b['frame']} | {b.get('mode')} | {b.get('rel')} | {b.get('settleRel')} | {b.get('settleRounds')} / {b.get('max')} | {b.get('bakeCount')} ({b.get('bakeCold1')}) | {b.get('derived')} | {'RED — ' + red if red else ('OK (declared runs)' if not why else 'UNJUDGEABLE — ' + why)} |")
elif STRICT: boot_bad.append('no --boots given under venueConverge=strict — the cap assertion could not run')
# 1–2) the pairs, both frames
fail = 0; unj = 0; unj_cells = {}; ncells = 0; cross_ok = {}   # cross_ok[(frame, cell)] = True when both cross pairs are PNG-identical and self-checks held
SIDES = ('A', 'B')
def judge_frame(label, cross_p, same_p, judged=True):
    global fail, unj, ncells
    cross = [load(p) for p in cross_p]; same = [load(p) for p in same_p]
    cells = sorted(set().union(*[set(d) for d in cross + same]))
    if judged: ncells += len(cells)
    lines.append(f"\n### {label}\n")
    lines.append('| cell | A1 vs B1: PNG (JUDGED) / HDR (record) | B2 vs A2: PNG (JUDGED) / HDR (record) | same-web A1 vs A2 (self-check) | same-web B1 vs B2 (self-check) | verdict |'); lines.append('|---|---|---|---|---|---|')
    rows = []
    for c in cells:
        moved = []; scols = []
        for side, d in zip(SIDES, same):
            r = d.get(c); ok = bool(r) and r.get('changed') is not None and r.get('png') == 'identical bytes'
            scols.append(f"png {(r or {}).get('png', 'MISSING')} / hdr {rec(r)}")
            if not ok: moved.append((side, r))
        ccols = []; verdict = 'PASS'
        for d in cross:
            r = d.get(c)
            if not r or r.get('changed') is None: ccols.append('MISSING'); verdict = 'FAIL'; continue
            ok = r.get('png') == 'identical bytes'
            ccols.append(f"png {r.get('png')}{'' if ok else ' ✗'} / hdr {rec(r)}")
            if not ok: verdict = 'FAIL'
        if not judged:   # RECORD ONLY (the boot-frame law): printed, never counted; the A/B state named where the 48-px signature shows
            st = 'boot state differs across the pair' if verdict != 'PASS' else 'boot state identical across the pair'
            if moved: st += '; a same-web pair differs too (' + '/'.join(s for s, _ in moved) + '-side)'
            verdict = f"record — boot frame not judged (bistable: ruling 2026-09-15 01:39Z, coldwarm-l41 — bimodal on identical bytes; the converged frame carries the verdict): {st}"
        elif moved:
            ev = '; '.join(f"{s}-side self-check differs: PNG {(r or {}).get('png', 'MISSING')}, HDR {rec(r)}" for s, r in moved)
            verdict = f"UNJUDGEABLE (instrument) — {ev} — cross-pair verdict WITHHELD"; ccols = [x + ' (withheld)' for x in ccols]
            unj += 1; unj_cells[f'{label}:{c}'] = [s for s, _ in moved]
        elif verdict != 'PASS': fail += 1
        else: cross_ok[(label, c)] = True
        rows.append([c, ccols[0], ccols[1], scols[0], scols[1], verdict])
    return rows
if a.bootframe_selftest:
    # synthetic cells (the boot-frame law): the loader is replaced by an in-memory table; each case rebuilds the counters
    I = {'png': 'identical bytes', 'changed': 0}; D = {'png': 'bytes differ', 'changed': 48, 'maxabs': 5.24e-05}
    X = 'default/predator_apex_9ft/cueball_level'
    SYN = {}
    def synth(boot_cross, conv_cross):
        SYN.clear()
        for k in ('c1', 'c2'): SYN[f'{k}-boot'] = {X: boot_cross}; SYN[f'{k}-conv'] = {X: conv_cross}
        for k in ('sA', 'sB'): SYN[f'{k}-boot'] = {X: I}; SYN[f'{k}-conv'] = {X: I}
    load = lambda p: dict(SYN[p])
    ok = True
    for name, bc, cc, mode, want_fail in (('boot-only difference, record law', D, I, 'record', 0), ('boot-only difference, old judge law', D, I, 'judge', 1), ('conv difference, record law', I, D, 'record', 1), ('conv difference, old judge law', D, D, 'judge', 2), ('all identical, record law', I, I, 'record', 0)):
        synth(bc, cc); fail = 0; unj = 0; ncells = 0; cross_ok.clear(); unj_cells.clear(); lines.clear()
        rows_b = judge_frame('boot frame', ['c1-boot', 'c2-boot'], ['sA-boot', 'sB-boot'], judged=(mode == 'judge')); rows_c = judge_frame('converged frame (conv)', ['c1-conv', 'c2-conv'], ['sA-conv', 'sB-conv'])
        rec_ok = mode != 'record' or rows_b[0][5].startswith('record — boot frame not judged')
        good = (fail == want_fail) and rec_ok; ok = ok and good
        print(f"[ctrl-judge] bootframe-selftest {name}: fail={fail} (want {want_fail}); boot row verdict '{rows_b[0][5][:60]}…'; conv row verdict '{rows_c[0][5][:40]}' -> {'ok' if good else 'WRONG'}")
    print(f"[ctrl-judge] BOOTFRAME-SELFTEST {'PASS' if ok else 'FAIL'} — 5 cells"); sys.exit(0 if ok else 1)
frames = [('boot frame', judge_frame('boot frame', a.cross, a.same, judged=(a.boot_frame == 'judge')))]
if a.cross_conv and a.same_conv: frames.append(('converged frame (conv)', judge_frame('converged frame (conv)', a.cross_conv, a.same_conv)))
elif a.boot_frame == 'record': boot_bad.append('no converged-frame comparison given (--cross-conv/--same-conv) and the boot frame is record-only by law — nothing carries a verdict')
# --- ATTRIBUTION (guarded by --attrib) BEGIN
attrib = {}; attrib_bad = []; attrib_rows = []
if a.attrib:
    def aload(p):   # the same re-keying as load() (pixel-strict writes {a, b, rows: [...]}), non-fatal: an unreadable variant is UNJUDGEABLE, never DEAD and never attributed
        try: return {r['cell']: r for r in json.load(open(p))['rows']}
        except Exception as e: attrib_bad.append(f"{p}: {e}"); return None
    AV = {}
    for kv in a.attrib:
        name, pfx = kv.split('=', 1); AV[name] = {fr: {'A1': aload(f"{pfx}-vsA1-{fr}.json"), 'B1': aload(f"{pfx}-vsB1-{fr}.json")} for fr in ('boot', 'conv')}
    for label, rows in frames:
        fr = 'conv' if label.startswith('converged') else 'boot'
        for row in rows:
            c = row[0]
            if row[5] != 'FAIL' or 'MISSING' in (row[1] + row[2]): continue   # only a MEASURED cross-pair PNG difference is a candidate; withheld, void or missing cells are not
            pv = {v: {'A1': (AV[v][fr]['A1'] or {}).get(c) if AV[v][fr]['A1'] is not None else None, 'B1': (AV[v][fr]['B1'] or {}).get(c) if AV[v][fr]['B1'] is not None else None} for v in AV}
            w_, why_ = attrib_classify(c, pv)
            if w_ == 'ATTRIBUTED':
                fail -= 1; attrib[(fr, c)] = why_
                row[5] = f"ATTRIBUTED (main:{ATTRIB_FILES.get(why_, why_)}) — not the lane's: variant {why_} reproduces B1 byte-for-byte and differs from A1; the other variant equals A1"
                attrib_rows.append(f"{fr} {c}: A1 vs B1 {row[1]} → ATTRIBUTED to main:{ATTRIB_FILES.get(why_, why_)} (variant {why_} reproduces B1 byte-for-byte; the other equals A1)")
            elif w_ == 'UNREADABLE': attrib_bad.append(f"{fr} {c}: {why_}"); row[5] = f"UNJUDGEABLE (instrument) — {why_}"
            else: row[5] = f"FAIL (a-lane) — UNATTRIBUTED: {why_}"; attrib_rows.append(f"{fr} {c}: A1 vs B1 {row[1]} → UNATTRIBUTED ({why_})")
    if attrib_bad: unj += 1; unj_cells['attribution:unreadable'] = ['attribution']   # routes the verdict word to UNJUDGEABLE (instrument); the summary is written below
# --- ATTRIBUTION END
# 3–4) the sensitivity row → blindness and the load-bearing classification (AMENDMENT 1)
blind = False; lb = {}; sens_named = []; sens_flat = []; sens_desc = 'no --sens comparison given'; S = {}
try: pert = json.loads(a.perturb) if a.perturb else {}
except Exception: pert = {'raw': a.perturb}
if not isinstance(pert, dict): pert = {}
def pert_of(cell):
    """the perturbation record of a cell's look/table (cells are look/table/pose); None when the set declared none"""
    lt = '/'.join(cell.split('/')[:2]); v = pert.get(lt); return v if isinstance(v, dict) else None
def pert_applicable(cell):
    """a cell's sensitivity is applicable exactly where the venue term is DECLARED to run (the declaration, asserted above, never the census alone)"""
    lt = '/'.join(cell.split('/')[:2])
    return lt not in novenue and declared(cell)[0] == 'runs'
def pert_declared(cell):
    """the sensitivity set must SELF-DECLARE its perturbation for this cell's look/table: a coeff, a rel and a non-zero coefficient moved"""
    v = pert_of(cell); q = v.get('perturb') if v else None
    return isinstance(q, dict) and not q.get('error') and q.get('coeff') and q.get('rel') is not None and any(abs(float(x)) > 0 for x in (q.get('before') or []))
na_cells = []; undeclared_pert = []
if a.sens:
    S = load(a.sens); ok_cells = [c for c, r in S.items() if r.get('changed') is not None and pert_applicable(c)]
    for c, r in sorted(S.items()):
        if r.get('changed') is None: continue
        if not pert_applicable(c): lb[c] = None; na_cells.append(c); continue
        if not pert_declared(c): undeclared_pert.append(c); continue
        if r.get('png') not in (None, 'identical bytes'): lb[c] = True; sens_named.append(f"{c} ({r['changed']} px, max |d| {r['maxabs']:.3g})")
        else: lb[c] = False; sens_flat.append(f"{c} (HDR {rec(r)})")
    if not ok_cells: blind = True; sens_desc = 'sensitivity comparison UNMEASURED/MISSING or not applicable on every cell'
    elif not sens_named: blind = True; sens_desc = f"identical PNG bytes on all {len(ok_cells)} applicable cells (HDR: " + '; '.join(f"{c} {rec(r)}" for c, r in sorted(S.items()) if pert_applicable(c)) + ')'
    else: sens_desc = f"RED on {len(sens_named)}/{len(ok_cells)} applicable cells: " + '; '.join(sens_named) + (('; PNG-identical (not load-bearing) on: ' + '; '.join(sens_flat)) if sens_flat else '') + ((f"; not applicable (no venue term on the table) on {len(na_cells)} cells: " + ', '.join(na_cells)) if na_cells else '')
else: blind = True
coeffs = sorted({str(v['perturb'].get('coeff')) for v in pert.values() if isinstance(v, dict) and isinstance(v.get('perturb'), dict) and v['perturb'].get('coeff')})
rels = sorted({str(v['perturb'].get('rel')) for v in pert.values() if isinstance(v, dict) and isinstance(v.get('perturb'), dict) and v['perturb'].get('rel') is not None})
coeff_txt = ' / '.join(coeffs) if coeffs else 'UNDECLARED coefficient'; rel_txt = ' / '.join(rels) if rels else '2e-5 (undeclared by the set)'
# the per-cell verdict words carry the classification (the boot frame's by pose)
for label, rows in frames:
    lines_out = []
    for row in rows:
        c = row[0]
        if row[5] == 'PASS':
            k = lb.get(c)
            tr = '' if label.startswith('converged') else '; by pose — sensitivity measured on the conv frame (boot frame judged only under --boot-frame judge)'
            if k is True: row[5] = f'PASS (load-bearing: a {rel_txt} move on {coeff_txt} breaks this cell\'s PNG identity{tr})'
            elif k is False: row[5] = f'IDENTICAL — not load-bearing at {rel_txt} (the same move leaves this cell\'s PNG identical: unjudgeable at the tolerance scale{tr})'
            elif c in na_cells: row[5] = 'PASS (plain-render identity: no venue term on this table — outside the tolerance scale)'
            else: row[5] = 'IDENTICAL — sensitivity UNMEASURED on this cell (not load-bearing by default)'
        lines_out.append('| ' + ' | '.join(row) + ' |')
    # splice the rows under their header (the header + separator were appended by judge_frame)
    i = lines.index(f"\n### {label}\n"); lines[i+3:i+3] = lines_out
lines.append(f"\n### sensitivity row (B2 vs the {rel_txt}-perturbed boot of this web on {coeff_txt}, conv frame)\n\n[ctrl-judge] sensitivity {'BLIND — ' if blind else ''}{sens_desc}; perturbation self-declared by the set: {a.perturb or '(none given)'}\n")
# the verdict word — the order is the law's: boots, self-checks, blindness, cross pairs
if boot_red:
    word = 'FAIL'; summ = f"FAIL — {len(boot_red)} control boot reading(s) contradict the venue declaration as a DEFECT: " + '; '.join(boot_red) + ' — a regression on the declared or the excluded surface, never n/a'
elif boot_bad:
    word = 'UNJUDGEABLE (instrument)'; summ = f"{word} — {len(boot_bad)} control boot reading(s) void the capture: " + '; '.join(boot_bad) + ' — a capped or unconverged control boot is a measurement that did not finish (never PASS, never FAIL); re-capture the control block'
elif unj:
    sides = sorted({s for v in unj_cells.values() for s in v}); word = 'UNJUDGEABLE (instrument)'
    summ = f"{word} — {unj} cell(s) where the {'/'.join(sides)}-side self-check differs ({', '.join(unj_cells)}); the cross-pair verdict is withheld on them; {fail} other cell(s) FAIL on the cross pair; re-run the control block on a quiet box"
elif undeclared_pert:
    word = 'UNJUDGEABLE (instrument)'; summ = f"{word} — the sensitivity set did not self-declare its perturbation (ctrlPerturb: coeff, rel, a non-zero coefficient) on {len(undeclared_pert)} declared-runs cell(s): {', '.join(undeclared_pert)} — a row whose stimulus is unknown has no verdict"
elif blind:
    word = 'UNJUDGEABLE (instrument blind)'; summ = f"{word} — the sensitivity row read no PNG difference ({sens_desc}): the comparator cannot see inside the shipped tolerance, so {ncells} identical cross-pair cells are not evidence"
elif fail: word = 'FAIL'; summ = f"FAIL — {ncells} cells, {fail} with a cross-pair PNG difference / missing (HDR recorded in ULP, not judged); self-checks held on every cell; sensitivity {sens_desc}"
else: word = 'PASS'; summ = f"PASS — {ncells} cells (both frames); self-checks held on every cell; every cross pair PNG-identical (HDR recorded in ULP, not judged); load-bearing on {sum(1 for v in lb.values() if v is True)} of {len(lb)} cells ({len(na_cells)} with no venue term); sensitivity {sens_desc}"
# the transfer's measured cost: how far the boot frame sits from the conv frame on the same boot (max |d| linear, per cell)
ftxt = 'boot-vs-conv distance UNMEASURED (no --frames)'
if a.frames:
    F = load(a.frames); fm = [(r.get('maxabs') or 0, c) for c, r in F.items() if r.get('changed') is not None]
    if fm: mx, mc = max(fm); ftxt = f"the two frames of one boot (B2) differ by up to {mx:.3g} linear ({mc})"
    else: ftxt = 'boot-vs-conv distance UNMEASURED on every cell'
# the CLAIM / NON-CLAIM (AMENDMENTS 1 + 2), written from the data
lbc = sorted(c for c, v in lb.items() if v is True); nlbc = sorted(c for c, v in lb.items() if v is False); nac = sorted(na_cells)
ulp_flat = max([S[c].get('ulpMax') or 0 for c in nlbc], default=0)
rtxt = (f"every strict control boot reached settleRel 0 in {min(rounds)}–{max(rounds)} rounds of max {boots[0].get('max') if boots else '?'} (asserted per boot and frame)" if STRICT and rounds else 'every control boot read settled under its law')
if STRICT:
    claim = (f"CLAIM: under venueConverge=strict the two webs converge to the SAME FIXED POINT — every cross pair PNG-identical on the CONVERGED frame (the boot frame is recorded, not judged — bimodal on identical bytes, coldwarm-l41 2026-09-15); "
             f"the identity is LOAD-BEARING on {', '.join(lbc) or 'NO cell'} (a {rel_txt} relative move on {coeff_txt} is measured to break PNG identity there: {'; '.join(sens_named) or '—'}) "
             f"and NOT load-bearing on {', '.join(nlbc) or 'no cell'} (the same move leaves the PNG bytes identical there, HDR d <= {ulp_flat:.0f} ULP) — on those cells the pair is UNJUDGEABLE at the tolerance scale, not passing; no venue term on {', '.join(nac) or 'no cell'} (identity by design as DECLARED in {a.venue_decl}, census agreeing on every boot: there the cross pair is a plain-render identity, judged as bytes, outside the tolerance scale — asserted both ways: a derived-1 reading there would be UNJUDGEABLE because the declaration may be the stale party, an attempted-or-errored reading RED because no declaration can make it correct); "
             f"the sensitivity was measured on the converged frame and is applied to the boot frame's cells by pose, not measured there — {ftxt}, so the transfer is an inference and OWED (one boot perturbed at page init, before the boot frame is shot, measures it directly); {rtxt};")
    nonclaim = (f"NON-CLAIM: (i) shipped-tolerance pixel identity between the two webs (venueConverge=iterate, rel <= 1e-4) is NOT judged by this line — UNJUDGEABLE on a loaded box (the stopping round is a free variable) and OWED on a calm one; "
                f"(ii) the sensitivity was established for a {rel_txt} relative move on the {coeff_txt} coefficient ONLY — no claim is made about an equal-magnitude move along the higher SH bands (L1/L2), where per unit norm the image may move less; one perturbed boot on an L2 coefficient converts this from a scope caveat into a measurement (OWED after the landing window).")
else:
    claim = (f"CLAIM: under venueConverge={a.mode} the two webs render the same pixels on this box — every cross pair PNG-identical on the CONVERGED frame (the boot frame is recorded, not judged — bimodal on identical bytes, coldwarm-l41 2026-09-15); "
             f"the identity is LOAD-BEARING on {', '.join(lbc) or 'NO cell'} (a {rel_txt} relative move on {coeff_txt} is measured to break PNG identity there) and NOT load-bearing on {', '.join(nlbc) or 'no cell'} (the same move leaves the PNG bytes identical there, HDR d <= {ulp_flat:.0f} ULP) — on those cells the pair is UNJUDGEABLE at the tolerance scale, not passing; no venue term on {', '.join(nac) or 'no cell'} (identity by design as DECLARED in {a.venue_decl}, census agreeing on every boot: there the cross pair is a plain-render identity, judged as bytes, outside the tolerance scale — asserted both ways: a derived-1 reading there would be UNJUDGEABLE because the declaration may be the stale party, an attempted-or-errored reading RED because no declaration can make it correct); "
             f"the sensitivity was measured on the converged frame and is applied to the boot frame's cells by pose, not measured there — {ftxt}, so the transfer is an inference and OWED (one boot perturbed at page init, before the boot frame is shot, measures it directly); {rtxt};")
    nonclaim = (f"NON-CLAIM: the sensitivity was established for a {rel_txt} relative move on the {coeff_txt} coefficient ONLY — no claim is made about an equal-magnitude move along the higher SH bands (L1/L2).")
# --- ATTRIBUTION (guarded by --attrib) BEGIN
if a.attrib:
    if attrib_bad:
        word = 'UNJUDGEABLE (instrument)'; summ = f"{word} — attribution set unreadable: " + '; '.join(attrib_bad)[:400] + " — a declared variant that cannot be read never reads attributed"
    elif attrib and fail == 0 and word == 'PASS':
        word = 'PASS-WITH-ATTRIBUTED'
        summ = (f"PASS-WITH-ATTRIBUTED (a-main) — {ncells} cells (both frames); {len(attrib)} cross-pair difference(s), each reproduced by exactly one main-only variant and absent from the other: " + '; '.join(attrib_rows)
                + f"; every other cross pair PNG-identical; self-checks held on every cell; sensitivity {sens_desc}")
        exc = f"EXCEPT {len(attrib)} cell-frame(s) whose difference is ATTRIBUTED to main by measurement ({'; '.join(f'{fr} {c} → main:' + ATTRIB_FILES.get(v, v) for (fr, c), v in sorted(attrib.items()))}) — not the lane's; "
        claim = claim.replace('every cross pair PNG-identical on the CONVERGED frame (the boot frame is recorded, not judged — bimodal on identical bytes, coldwarm-l41 2026-09-15); ', 'every cross pair PNG-identical on the CONVERGED frame (the boot frame is recorded, not judged — bimodal on identical bytes, coldwarm-l41 2026-09-15) ' + exc, 1)
    elif fail:
        summ = f"FAIL (a-lane) — {fail} cross-pair difference(s) NOT attributed to a main-only variant: " + '; '.join(r for r in attrib_rows if 'UNATTRIBUTED' in r)[:600] + (f"; attributed: {len(attrib)}" if attrib else '') + f"; self-checks held on every cell; sensitivity {sens_desc}"
    for r in attrib_rows: lines.append(f"\n[ctrl-judge] main-side render delta: {r}\n")
    L40C = 'default/predator_apex_9ft/cueball_level'
    for label, rows in frames:
        fr = 'conv' if label.startswith('converged') else 'boot'
        for row in rows:
            if row[0] == L40C: lines.append(f"\n[ctrl-judge] cell {L40C} ({fr}; the cell land40's early control stopped on, 2026-09-15 00:29:47Z: 48 px, max |d| 5.24e-05): A1 vs B1 {row[1]} | B2 vs A2 {row[2]} | {row[5]}\n")
# --- ATTRIBUTION END
prov = ''
if a.provenance:
    try: prov = open(a.provenance).read().strip()
    except Exception as e: prov = f'(provenance file unreadable: {e})'
head = [f"## CTRL-JUDGE stage {a.stage} — convergence law in force: venueConverge={a.mode}", f"boot frame {'record-only since 2026-09-15 (coldwarm-l41: bimodal on identical bytes)' if a.boot_frame == 'record' else 'JUDGED (--boot-frame judge: the pre-2026-09-15 law, for the record only)'}", '', '### inputs (as seen by this run)', '', '```', prov or '(no provenance given)', '```']
CELLS = [('runs','derived1','OK → cap rule'), ('runs','never-ran','RED'), ('runs','mismatched','RED'), ('identity-by-design','derived1','UNJUDGEABLE'), ('identity-by-design','never-ran','n/a'), ('identity-by-design','mismatched','RED'), ('undeclared','*','UNJUDGEABLE'), ('unknown:','*','UNJUDGEABLE'), ('*','unreadable','UNJUDGEABLE')]
def ttcount(d, c): return sum(v for (dd, cc), v in TT.items() if (d == '*' or dd == d or (d == 'unknown:' and dd.startswith('unknown:'))) and (c == '*' or cc == c))
# which cells have an ARM in this run's list (the arm→cell mapping lives with the arms' construction; presence comes from the list passed in, never typed here)
ARM_OF_CELL = {('runs', 'never-ran'): 'ctrlnovenue', ('identity-by-design', 'derived1'): 'ctrldecl', ('identity-by-design', 'mismatched'): 'ctrlwpabroken'}
ARMS = set(a.arms.split()) if a.arms else None
def armed(d, c):
    n = ARM_OF_CELL.get((d, c))
    if not n: return 'armed: no'
    if ARMS is None: return f'armed: unknown ({n} exists; no arm list given)'
    return f'armed: yes ({n})' if n in ARMS else f'armed: NO — {n} declared but not in this run\'s list'
narmed = sum(1 for d, c, _ in CELLS if ARMS is not None and ARM_OF_CELL.get((d, c)) in ARMS)
tt = ('declaration × census truth table (readings this run → outcome | armed): ' + '; '.join(f"{d}×{c} {ttcount(d, c)} → {o} | {armed(d, c)}" for d, c, o in CELLS)
      + f"; total {sum(TT.values())} of {len(boots)}; {narmed} of {len(CELLS)} cells armed" + (f" (arm list: {a.arms_src or 'given'}, {len(ARMS)} arms)" if ARMS is not None else ' (NO arm list given: the armed column is unknown)')
      + "; identity×derived1 reads UNJUDGEABLE because the declaration may be the stale party; identity×mismatched reads RED because no declaration can make an attempted-and-errored venue term correct on a table declared never to run — the two cells differ in which party can be stale")
# the table must RECONCILE itself: every reading lands in exactly one row (unreadable is counted once even when the declaration is also undeclared/unknown)
covered = sum(ttcount(d, c) for d, c, _ in CELLS) - sum(v for (dd, cc), v in TT.items() if cc == 'unreadable' and (dd == 'undeclared' or dd.startswith('unknown:')))
if covered != len(boots): boot_bad.append(f"truth table does not reconcile: {covered} readings in its rows vs {len(boots)} boot readings — a reading landed in no row (TT keys: {sorted(TT)})"); tt_recon = 'DOES NOT RECONCILE'
else: tt_recon = 'reconciles'
tt += f"; rows sum {covered} of {len(boots)} readings ({tt_recon})"
lines.append(f"\n[ctrl-judge] {tt}\n")
provq = 0
if a.provenance:
    try: provq = sum(1 for l in open(a.provenance) if l.startswith('[check-ctrl] input') and (' run ? ' in l or ' sha ? ' in l or ' web ? ' in l or 'digest failed' in l))
    except Exception: provq = -1
nlt = len({'/'.join(c.split('/')[:2]) for c in lb}) or 0; nfr = len(frames); nboots = len({b['set'] for b in boots}); nbl = len({b['cell'] for b in boots})
denom = (f"denominators: {ncells} judged cell-frames = {ncells // nfr if nfr else 0} cells per frame x {nfr} frames, each over 2 cross pairs; {len(boots)} boot readings = {nboots} boots x {nbl} look/table x 2 frames "
         f"= {len(boots) - sum(1 for b in boots if b['cell'] in novenue)} asserted (declared runs) + {sum(1 for b in boots if b['cell'] in novenue)} n/a (declared identity by design); "
         f"{len(lb)} sensitivity cells = {nlt} look/table x {len(lb) // nlt if nlt else 0} poses on the conv frame = {len(lbc)} load-bearing + {len(nlbc)} not load-bearing + {len(nac)} identity by design; provenance inputs with an unresolved field: {provq}")
lines.append(f"\n[ctrl-judge] {denom}\n")
try:
    i = lines.index("\n### boot frame\n"); lines[i] = (f"\n### boot frame — RECORD ONLY since 2026-09-15 (coldwarm-l41: bimodal on identical bytes, two states 48–49 px / 5.24e-05 apart, independent of root, freshness and tree bytes; the converged frame carries every verdict) — {ftxt}\n" if a.boot_frame == 'record' else f"\n### boot frame — JUDGED under --boot-frame judge (the pre-2026-09-15 law; the record law is record-only) — classification TRANSFERRED from the conv frame by pose ({ftxt})\n")
except ValueError: pass
print(f"[ctrl-judge] boot frame {'record-only since 2026-09-15 (coldwarm-l41: bimodal on identical bytes — two boot states 48–49 px / 5.24e-05 apart on identical bytes across 9 boots of 5 roots; every converged frame identical; the converged frame carries every verdict)' if a.boot_frame == 'record' else 'JUDGED under --boot-frame judge (the pre-2026-09-15 law; not the record law)'}"); print('\n'.join(lines)); print(f"[ctrl-judge] {summ}"); print(f"[ctrl-judge] {tt}"); print(f"[ctrl-judge] {denom}"); print('[ctrl-judge] ' + claim); print('[ctrl-judge] ' + nonclaim)
if a.claim_out: open(a.claim_out, 'w').write(claim + '\n' + nonclaim + '\n')
if a.out:
    open(a.out, 'w').write('\n'.join(head + lines) + f"\n\n[ctrl-judge] {summ}\n\n{claim}\n\n{nonclaim}\n\n**CTRL-JUDGE: {word}** ({ncells} cells, {unj} unjudgeable, {fail} failing, {len(boot_bad)} boot readings void, sensitivity {'BLIND' if blind else 'RED'} on {len(lbc)}/{len(lb)} cells; stage {a.stage}; venueConverge={a.mode}; boots first, then self-checks, then judged = cross-pair PNG byte identity on both frames; HDR recorded in float32 ULP of the pixel magnitude; no tolerance anywhere)\n")
sys.exit(0 if (fail == 0 and unj == 0 and not blind and not boot_bad and not boot_red and not undeclared_pert) else 3)
