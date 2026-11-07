#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-offcheck.py — ORDER-LIGHT-8 C1: is `?venue=off` still MAIN-identical? Pixel identity of the off capture
against the main baseline (`before/`, main c01bb535 booted by the same tool), PNG (8-bit) and the scene-linear HDR
readback, per look / table / pose. Tolerance = main's OWN per-boot flip, MEASURED from a second main boot state when
`--main-alt` holds one (a live re-measurement), else the COMMITTED fixture tools/render/fixtures/lighting-main-flip.json
(measured from the verifiers' independent main boots); a cell absent from both FAILS (no silent degrade). A red arm (`--arm <dir>`) runs the same comparison on a capture that must FAIL (the seal-7 off capture,
whose legacy walls carried the 1024 px plaster: 10/255). Exit 0 = identical within main's flip on every cell and the
arm RED; exit 4 otherwise. `--arm2 <dir> --arm2-sub <poke>` (ORDER-LAND-638-FIX4 verifier item 5) adds a second, FINE-scale
arm at the judged 1–3/255 scale (the off boot's converged sub-run vs the main-side frame) that must fire too.
"""
import argparse, glob, json, os, sys
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--off-sub', default='', help='ORDER-LAND-638-FIX2: a poke label — the OFF frames live under <look>/<table>/<off-sub>/ (the fixture round-trip set)')
ap.add_argument('--off', required=True); ap.add_argument('--main', required=True); ap.add_argument('--main-alt', default='')
ap.add_argument('--main-sub', default='', help='ORDER-LAND-638-FIX2 B1: a poke label — the MAIN-side frames live under <look>/<table>/<main-sub>/ (the round-trip control set)')
ap.add_argument('--arm', default=''); ap.add_argument('--tables', default='predator_apex_9ft,wpa_spec_9ft')
# ORDER-LAND-638-FIX4 verifier item 5: a SECOND, fine-scale arm. The first arm (the tip's venue-ON frame) differs from main by
# 83–246/255, so it would still fire under a tolerance widened far past the 1–3/255 flip it judges. arm2 = a REAL state at
# the judged scale: the off boot's CONVERGED sub-run (`conv`: main's own further bakes move the frame 1/255 on 14 % of the
# Predator pixels, 27/255 on 51 % of wpa) — compared against the main-side frame it must fire under the current tolerance;
# a widened tolerance that hides that scale reads SILENT here and fails the check. A missing arm2 frame FAILS the cell.
ap.add_argument('--arm2', default='', help='second (fine-scale) arm set root; frames at <arm2>/<look>/<table>/<arm2-sub>/<pose>.png')
ap.add_argument('--arm2-sub', default='', help='poke label sub-dir of the arm2 frames (the seal passes conv)')
ap.add_argument('--alt-record', action='append', default=[], help='ORDER-LIGHT-C2-FIX4 (land19): other main boot states whose BOOT-vs-BOOT reading against the main baseline is PRINTED per cell (the old live-flip form and its modes), never judged')
ap.add_argument('--arm-weaken', default='', choices=['', 'hdr', 'png', 'all'], help='ARM ONLY (ORDER LIGHT-L24-B): drop the named criterion from the JUDGEMENT (hdr = the HDR max test; png = the PNG max + fraction tests; all = both) to prove a committed near-threshold leak is caught by exactly that criterion — the seal never passes this on a judged step; a loud line marks every run that uses it')
ap.add_argument('--poses', default='full34,cueball_level'); ap.add_argument('--looks', default='default,sp')
ap.add_argument('--out', required=True); ap.add_argument('--json', required=True)
ap.add_argument('--flip-fixture', default='tools/render/fixtures/lighting-main-flip.json', help="main's measured per-boot flip per cell (committed); a cell missing from it FAILS the check (ORDER-LIGHT-9 Q6: no /tmp dependency, no silent degrade)")
a = ap.parse_args()
TABLES, POSES, LOOKS = a.tables.split(','), a.poses.split(','), a.looks.split(',')


def png(p): return np.asarray(Image.open(p).convert('RGB')).astype(np.int16)
def hdr(p):
    j = json.load(open(p + '.json')); w, h = j['w'], j['h']
    return np.fromfile(p, dtype='<f4').reshape(h, w, 3)
def find_alt(root, look, table, pose):
    """the second main state: `<root>/main*/<look>/<table>/<pose>.png` (only dirs named main*: the verifier's cap/ also
    holds ARMED lane boots, which are not main) or `<root>/<look>/<table>/<pose>.png`"""
    hits = sorted(glob.glob(os.path.join(root, 'main*', look, table, pose + '.png')) + glob.glob(os.path.join(root, look, table, pose + '.png')))
    # ORDER-LAND-638-FIX3 (adversarial review of the fix, P2): the LIVE tolerance is a MAIN-only measurement too — `main-o<n>` /
    # `main-oc<n>` dirs are ?venue=off boots of the sealed tip and must never widen the tolerance that judges the off path
    hits = [h for h in hits if not os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(h)))).startswith('main-o')]
    return hits
def cmp(p1, p2):
    A, B = png(p1), png(p2)
    if A.shape != B.shape: return {'err': f'shape {A.shape} vs {B.shape}'}
    d = np.abs(A - B).max(axis=2)
    r = {'png_max': int(d.max()), 'png_frac': round(float((d > 0).mean()), 5), 'png_px': int((d > 0).sum()),
         'png_max_rows_0_400': int(d[:400].max()) if d.shape[0] > 400 else None}
    h1, h2 = p1.replace('.png', '.hdr.f32'), p2.replace('.png', '.hdr.f32')
    # ORDER-LAND-638-FIX2 (review r6): HDR evidence that is missing or incompatible is reported as `hdr_err` (never
    # silently omitted) so an OFF vs MAIN cell cannot PASS on PNG evidence alone — the identity contract is PNG+HDR
    missing = [q for q in (h1, h2, h1 + '.json', h2 + '.json') if not os.path.exists(q)]
    if missing:
        r['hdr_err'] = 'no HDR evidence (missing ' + ('sidecar' if all(q.endswith('.json') for q in missing) else 'payload') + f': {os.path.basename(missing[0])})'
        return r
    H1, H2 = hdr(h1), hdr(h2)
    if H1.shape != H2.shape:
        r['hdr_err'] = f'HDR shape mismatch {H1.shape} vs {H2.shape}'; return r
    dh = np.abs(H1 - H2).max(axis=2); r['hdr_max'] = float(dh.max()); r['hdr_frac'] = round(float((dh > 0).mean()), 5)
    return r


FLIP = json.load(open(a.flip_fixture)) if a.flip_fixture and os.path.exists(a.flip_fixture) else {}
rows, cells, arm_cells, arm2_cells, flips = [], {}, {}, {}, {}
ok = True
for look in LOOKS:
    for table in TABLES:
        for pose in POSES:
            key = f'{look}/{table}/{pose}'
            p_off = os.path.join(a.off, look, table, a.off_sub, pose + '.png') if a.off_sub else os.path.join(a.off, look, table, pose + '.png'); p_main = os.path.join(a.main, look, table, a.main_sub, pose + '.png') if a.main_sub else os.path.join(a.main, look, table, pose + '.png')
            if not (os.path.exists(p_off) and os.path.exists(p_main)):
                cells[key] = {'err': 'missing frame'}; ok = False; continue
            # main's own flip for this cell: the committed fixture (the max over every pair of a STATED set of main / off
            # boots) COMPOSED with the live remeasurement (--main-alt: the main baseline vs other live main boots) — per
            # component the HIGHER of the two, floored by the fixture's global floors. ORDER-LAND-638-FIX2 (third land5
            # chain): a live main pair that happened to be byte-identical used to OVERRIDE the fixture cell and collapse the
            # tolerance to the floors (png 1 / hdr 2.62e-3 on a cell whose 190-pair envelope is png 2 / hdr 3.83e-2) — the
            # envelope from many boots is the floor of the tolerance, never something one lucky pair can shrink
            fl = None
            fx = FLIP.get('cells', {}).get(key)
            alts = find_alt(a.main_alt, look, table, pose) if a.main_alt else []
            live = None
            live_form = None
            if alts:
                # land8 (2026-09-07): the live pair is a BOOT-vs-BOOT measurement — main's boot frame against the other main boots. It
                # used to take p_main, which is the CONVERGED main frame under --main-sub conv, so boot-vs-converged deltas (1/255 on
                # 15 % Predator, 27–86/255 on 32–54 % wpa) entered the tolerance and swallowed the fine-scale arm (arm2 SILENT 0/8 with
                # every arm2 cell at exactly those magnitudes). Like with like: the main BASE frame, whatever sub-run is judged.
                # ORDER-LIGHT-C2-FIX4 (land19, maintainer ruling): like with like at the JUDGED sub-run when the alt carries it — main's
                # boot frames are BIMODAL at the fine-arm scale (an env re-bake racing the capture: default/predator full34 lands either ≈
                # converged or 3/255 on ~30 % from it, sp/full34 up to 21/255 on 44 %, under both settle rules), so a boot-vs-boot pair
                # from ONE alt boot is a coin flip on the mode and measures the race, not the judged state. When --main-sub is set and the
                # alt has that sub-run, the live pair is main's judged frame (conv) vs the alt's conv: converged-vs-converged NARROWS the
                # envelope (a tightening; the committed fixture stays the floor). Without a conv alt the boot form stays, as documented.
                alts_sub = [q for q in (find_alt(a.main_alt, look, table, os.path.join(a.main_sub, pose)) if a.main_sub else [])]
                if alts_sub:
                    ms = [cmp(p_main, q) for q in alts_sub]; ms = [m for m in ms if 'err' not in m]; live_form = f'main {a.main_sub.upper()} frame vs {len(ms)} alt {a.main_sub} frame(s)'
                else:
                    p_main_base = os.path.join(a.main, look, table, pose + '.png')
                    ms = [cmp(p_main_base, q) for q in alts] if os.path.exists(p_main_base) else []; ms = [m for m in ms if 'err' not in m]; live_form = f'main BOOT frame vs {len(ms)} other main boot(s)'
                if ms: live = {'max': max(m['png_max'] for m in ms), 'frac': max(m['png_frac'] for m in ms), 'hdr': max(m.get('hdr_max', 0.0) for m in ms), 'n': len(ms), 'form': live_form}
            # the RECORD column: the old boot-vs-boot reading against every --alt-record state (the modes, side by side), never judged
            rec_txt = '—'
            if a.alt_record:
                p_main_base = os.path.join(a.main, look, table, pose + '.png'); parts = []
                for rd_ in a.alt_record:
                    qs = find_alt(rd_, look, table, pose)
                    for q in qs:
                        m = cmp(p_main_base, q) if os.path.exists(p_main_base) else {'err': 'no main boot frame'}
                        parts.append(f"{os.path.basename(rd_.rstrip('/'))} {m.get('png_max', '?')}/255 on {m.get('png_frac', 0) * 100:.1f} %" if 'err' not in m else f"{os.path.basename(rd_)} {m['err']}")
                rec_txt = ' · '.join(parts) if parts else 'no record boots'
            floors = FLIP.get('floors') or {}
            if fx or live:
                fl = {'max': max(int(floors.get('png_max', 1)), fx['max'] if fx else 0, live['max'] if live else 0),
                      'frac': max(float(floors.get('png_frac', 0.02)), fx['frac'] if fx else 0.0, live['frac'] if live else 0.0),
                      'hdr': max(float(floors.get('hdr', 2.62e-3)), fx['hdr'] if fx else 0.0, live['hdr'] if live else 0.0),
                      'source': ' + '.join(([f"fixture {os.path.basename(a.flip_fixture)} ({fx.get('pairs')} pairs)"] if fx else []) + ([f"live: {live.get('form')} under {a.main_alt}"] if live else []) + ['floors'])}
            if fl is None:
                cells[key] = {'err': f'no flip measurement for this cell (fixture {a.flip_fixture})'}; ok = False
                rows.append(f"| {key} | — | — | **no flip measurement** | **FAIL** | — |"); continue
            flips[key] = fl
            c = cmp(p_off, p_main); cells[key] = c
            # ORDER-LAND-638-FIX2 (review r6): no `hdr_max` (missing / incompatible HDR) FAILS the cell — no 0.0 stand-in
            # L24-B: the judgement, with an ARM-ONLY weakening switch (never set by a judged step)
            png_ok = (c['png_max'] <= fl['max'] and c['png_frac'] <= fl['frac']) if a.arm_weaken not in ('png', 'all') else True
            hdr_ok = (('hdr_max' in c) and c['hdr_max'] <= fl['hdr']) if a.arm_weaken not in ('hdr', 'all') else True
            passed = ('err' not in c) and png_ok and hdr_ok
            c['pass'] = passed; ok = ok and passed
            hdr_txt = f"{c['hdr_max']:.2e}" if 'hdr_max' in c else f"**{c.get('hdr_err') or c.get('err')}**"
            arm_txt = '—'
            if a.arm:
                p_arm = os.path.join(a.arm, look, table, pose + '.png')
                if os.path.exists(p_arm):
                    ca = cmp(p_arm, p_main); arm_cells[key] = ca
                    fired = ('err' not in ca) and not (ca['png_max'] <= fl['max'] and ca['png_frac'] <= fl['frac'])
                    ca['fired'] = fired; ok = ok and fired
                    arm_txt = f"{ca.get('png_max')}/255 on {ca.get('png_frac', 0) * 100:.1f} % → {'RED' if fired else 'SILENT'}"
                else:
                    # ORDER-LAND-638-FIX3 (review r7 P2 #3): a requested arm with no frame for this cell is NOT evidence — the cell
                    # FAILS (exit 4, cell named); the arm set must cover every judged cell (the seal passes the tip's own
                    # venue-ON capture, which covers all of them and differs from main on all of them)
                    arm_cells[key] = {'err': 'missing arm frame', 'fired': False}; ok = False
                    arm_txt = '**no arm frame → FAIL** (the arm set must cover every judged cell)'
            arm2_txt = '—'
            if a.arm2:
                p_arm2 = os.path.join(a.arm2, look, table, a.arm2_sub, pose + '.png') if a.arm2_sub else os.path.join(a.arm2, look, table, pose + '.png')
                if os.path.exists(p_arm2):
                    cb = cmp(p_arm2, p_main); arm2_cells[key] = cb
                    # fired = the cell's OWN identity rule negated (PNG max, PNG fraction, HDR max — all three components); an
                    # arm2 frame without HDR evidence is not a fired arm (fail closed, the same rule as the judged cell)
                    fired2 = ('err' not in cb) and ('hdr_max' in cb) and not (cb['png_max'] <= fl['max'] and cb['png_frac'] <= fl['frac'] and cb['hdr_max'] <= fl['hdr'])
                    # ORDER-LIGHT-C2-FIX4 (land19, maintainer ruling): MARGINAL = the fine arm fires against the LIVE measured envelope (the state
                    # the check judges) but sits inside the COMMITTED fixture floor alone — the floor, not the measurement, swallows it. Reported
                    # per cell, never a failure, never tuned: the open question (was that floor set from a wide-mode boot pair?) rides the report.
                    marginal2 = (not fired2) and ('err' not in cb) and ('hdr_max' in cb) and live is not None and not (cb['png_max'] <= live['max'] and cb['png_frac'] <= live['frac'] and cb['hdr_max'] <= live['hdr']) and fx is not None
                    cb['fired'] = fired2; cb['marginal'] = marginal2; ok = ok and (fired2 or marginal2)
                    if 'err' not in cb and 'hdr_max' not in cb: cb['err'] = cb.get('hdr_err')
                    live_txt = f"max {live['max']}, frac {live['frac'] * 100:.1f} %" if live else ''  # hoisted: a nested same-quote f-string is Python 3.12-only (0619366c broke 3.9–3.11)
                    arm2_txt = f"{cb.get('png_max')}/255 on {cb.get('png_frac', 0) * 100:.1f} %, hdr {cb['hdr_max']:.1e} → {'RED' if fired2 else ('MARGINAL (fires against the live envelope ' + live_txt + '; inside the committed floor alone)' if marginal2 else 'SILENT')}" if 'hdr_max' in cb else f"**{cb.get('err')} → FAIL**"
                else:
                    arm2_cells[key] = {'err': 'missing arm2 frame', 'fired': False}; ok = False
                    arm2_txt = '**no arm2 frame → FAIL** (the arm2 set must cover every judged cell)'
            rows.append(f"| {key} | {c.get('png_max')}/255 on {c.get('png_frac', 0) * 100:.2f} % ({c.get('png_px')} px) | {hdr_txt} | max {fl['max']}, frac {fl['frac'] * 100:.1f} %, hdr {fl['hdr']:.1e} ({fl['source'][:9]}) | {'PASS' if passed else '**FAIL**'} | {arm_txt} | {arm2_txt} |" + (f" {rec_txt} |" if a.alt_record else ''))
if a.arm_weaken: print(f'[offcheck] ARM: JUDGEMENT WEAKENED (--arm-weaken {a.arm_weaken}) — this run proves an arm, it is not a seal verdict')
md = ['# offcheck — `?venue=off` vs main baseline (ORDER-LIGHT-8 C1)' + (f' — **ARM RUN: judgement weakened ({a.arm_weaken})**' if a.arm_weaken else ''), '',
      f'off = `{a.off}`, main = `{a.main}`, second main state = `{a.main_alt or "(none)"}`, arm = `{a.arm or "(none)"}`, arm2 (fine scale) = `{(a.arm2 + "/<look>/<table>/" + a.arm2_sub) if a.arm2 else "(none)"}`. Identity rule per cell: PNG max |Δ| ≤ main\'s flip max AND differing fraction ≤ main\'s flip fraction AND HDR max |Δ| ≤ main\'s flip HDR amplitude.', '',
      '| look/table/pose | off vs main (PNG) | HDR max Δ | tolerance = main\'s own flip | verdict | red arm (the tip\'s venue-ON frame of the same cell; a missing frame FAILS) | red arm 2 (fine scale: the off BOOT frame vs the main-side judged frame; a missing frame FAILS) |' + (' other main BOOT states vs main\'s boot frame (the old boot-vs-boot live form, RECORD: the modes) |' if a.alt_record else ''), '|---|---|---|---|---|---|---|' + ('---|' if a.alt_record else '')] + rows
_m2 = sum(1 for c in arm2_cells.values() if c.get('marginal'))
md += ['', f"**OFFCHECK: {'PASS' if ok else 'FAIL'}** ({sum(1 for c in cells.values() if c.get('pass'))}/{len(cells)} cells identical within main's flip; arm {sum(1 for c in arm_cells.values() if c.get('fired'))}/{len(arm_cells)} RED; arm2 {(str(sum(1 for c in arm2_cells.values() if c.get('fired'))) + '/' + str(len(arm2_cells)) + ' RED' + (f', {_m2} MARGINAL (fire against the live envelope, inside the committed floor alone — OPEN: was that floor set from a wide-mode boot pair?)' if _m2 else '')) if a.arm2 else 'not given (single-arm call)'})"]
open(a.out, 'w').write('\n'.join(md) + '\n')
json.dump({'ok': ok, 'cells': cells, 'arm': arm_cells, 'arm2': arm2_cells, 'flips': flips, 'off': a.off, 'main': a.main, 'main_alt': a.main_alt, 'arm_dir': a.arm, 'arm2_dir': a.arm2, 'arm2_sub': a.arm2_sub}, open(a.json, 'w'), indent=1)
missing_arm = [k for k, v in arm_cells.items() if v.get('err')]
if missing_arm: print(f"[offcheck] missing arm frame(s) → FAIL: {', '.join(missing_arm)}")
missing_arm2 = [k for k, v in arm2_cells.items() if v.get('err')]
if missing_arm2: print(f"[offcheck] missing / unusable arm2 frame(s) → FAIL: {', '.join(missing_arm2)}")
silent2 = [k for k, v in arm2_cells.items() if not v.get('err') and not v.get('fired')]
if silent2: print(f"[offcheck] arm2 SILENT (the fine-scale state sits inside the tolerance) → FAIL: {', '.join(silent2)}")
print(md[-1]); sys.exit(0 if ok else 4)
