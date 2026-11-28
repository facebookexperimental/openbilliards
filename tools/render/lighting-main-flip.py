#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-main-flip.py — regenerate tools/render/fixtures/lighting-main-flip.json: main c01bb535's own per-boot render
flip per offcheck cell, measured over every pair of INDEPENDENT main boots available (the verifiers' capture sets), as
the tolerance the seal's offcheck step applies to `?venue=off` vs the main baseline.
Floors (ORDER-LIGHT-12 item 3): PNG max 1 LSB and 2 % of pixels for a cell whose sampled pairs showed no flip; the HDR
floor is DERIVED — the smallest NON-zero flip amplitude observed on any cell across all main pairs (2.622e-3 in the
2026-09-05 sets: default/predator_apex_9ft/full34, obv-lighting7 main-1 vs main-2 — the fixture's floors.hdr_floor_source names
the cell and pair it came from; ORDER-LIGHT-13 item 2 corrected an earlier 'sp/predator/full34' attribution) — so a cell that happened to show no flip in the pairs sampled still admits one
flip of the size main produces elsewhere (the 1e-4 floor of seal 8 was arbitrary and sat below an observed `?venue=off`
per-boot flip of 1.4e-4).
  python3 tools/render/lighting-main-flip.py [--sets /tmp/obv-lighting7/cap,/tmp/obv-lighting5/cap] [--out tools/render/fixtures/lighting-main-flip.json]
"""
import argparse, json, os, glob, itertools, datetime, sys
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--main', default='163d7f25', help='the main tip the boot sets were rendered from (names the fixture)')
ap.add_argument('--sets', default='/tmp/obv-lighting7/cap,/tmp/obv-lighting5/cap', help='capture roots holding main-* boot dirs (<look>/<table>/<pose>.png + .hdr.f32)')
ap.add_argument('--out', default='tools/render/fixtures/lighting-main-flip.json')
ap.add_argument('--tables', default='predator_apex_9ft,wpa_spec_9ft'); ap.add_argument('--poses', default='full34,cueball_level'); ap.add_argument('--looks', default='default,sp')
ap.add_argument('--arm-synthetic', nargs=3, metavar=('MAIN_BOOT_A', 'MAIN_BOOT_B', 'TMP_ROOT'), help='ORDER-LAND-638-FIX4 verifier item 3: a DECLARED synthetic negative arm reproducible from any two main boots — builds TMP_ROOT with main-1 → A, main-2 → B, main-o1 → A (symlinks) and main-o2 = a COPY of B perturbed by a stated amount (PNG +3 × the main envelope\'s png max on the top 30 %% rows band; HDR × (1 + 3 × the hdr floor); the perturbation is written as data in main-o2/perturbation.json), then runs the normal generation over TMP_ROOT and asserts off_within_main 0 (exit 4, cells named; any other outcome is a non-firing arm, exit 7)')
a = ap.parse_args()


def png(p): return np.asarray(Image.open(p).convert('RGB')).astype(np.int16)
def hdr(p):
    j = json.load(open(p + '.json')); return np.fromfile(p, dtype='<f4').reshape(j['h'], j['w'], 3)
def cmp(x, y):
    A, B = png(x), png(y); d = np.abs(A - B).max(axis=2); r = {'png_max': int(d.max()), 'png_frac': float((d > 0).mean())}
    hx, hy = x.replace('.png', '.hdr.f32'), y.replace('.png', '.hdr.f32')
    # ORDER-LIGHT-COMPANION (review r12 P2, lighting-main-flip.py:31-33): a pair with PNGs but a missing HDR file / sidecar used to omit hdr_max
    # silently, pass completeness and receive the fallback HDR floor — fail-open. Every HDR input is REQUIRED: a missing one fails the
    # generator by name (exit 7), no fixture written.
    missing = [f for f in (hx, hy, hx + '.json', hy + '.json') if not os.path.exists(f)]
    if missing:
        print(f"[main-flip] FAIL: HDR input missing for the pair {x} vs {y}: {', '.join(missing)} — every pair needs its .hdr.f32 + .json on both sides"); sys.exit(7)
    r['hdr_max'] = float(np.abs(hdr(hx) - hdr(hy)).max())
    return r


def build_synthetic(A, B, root):
    """ORDER-LAND-638-FIX4 verifier item 3: the synthetic off population. Every amount is DERIVED from the two main boots given:
    - PNG: + 3 × env on the rows band [0, 30 %) of the frame, env = the A-vs-B png max of the cell pooled across looks (the
      generator's own pooling rule), floored at 1 (the generator's floor). 3 × > 1 × strictly exceeds the envelope's max on
      every unsaturated pixel, and 30 % of pixels > the 2 % fraction floor and any real main flip fraction (≤ ~1 %).
    - HDR: × (1 + 3 × hdr_floor), hdr_floor = the smallest non-zero A-vs-B HDR flip (the generator's own floor rule; fallback
      2.62e-3 as in the generator) — a relative move three floors deep on every texel.
    The perturbation is written beside the copy (main-o2/perturbation.json) so the arm is data, not prose."""
    A, B, root = os.path.abspath(A), os.path.abspath(B), os.path.abspath(root)
    if os.path.exists(root) and os.listdir(root):
        print(f'[main-flip] ARM synthetic: refusing to build into a non-empty TMP_ROOT {root} (delete it yourself)'); sys.exit(9)
    os.makedirs(root, exist_ok=True)
    for name, target in (('main-1', A), ('main-2', B), ('main-o1', A)):
        os.symlink(target, os.path.join(root, name))
    o2 = os.path.join(root, 'main-o2')
    expected = [(look, table, pose) for look in a.looks.split(',') for table in a.tables.split(',') for pose in a.poses.split(',')]
    missing = [f'{look}/{table}/{pose}' for look, table, pose in expected if not all(os.path.exists(os.path.join(d, look, table, pose + ext)) for d in (A, B) for ext in ('.png', '.hdr.f32', '.hdr.f32.json'))]
    if missing:
        print(f"[main-flip] ARM synthetic FAIL: main boot A/B lack the frame or HDR pair for cell(s): {', '.join(missing)}"); sys.exit(6)
    pair = {f'{look}/{table}/{pose}': cmp(os.path.join(A, look, table, pose + '.png'), os.path.join(B, look, table, pose + '.png')) for look, table, pose in expected}
    env = {}
    for look, table, pose in expected:
        pk = f'{table}/{pose}'; env[pk] = max(1, env.get(pk, 1), pair[f'{look}/{table}/{pose}']['png_max'])
    nz = sorted(v['hdr_max'] for v in pair.values() if v.get('hdr_max', 0.0) > 0)
    floor = nz[0] if nz else 2.62e-3
    note = {'what': 'ORDER-LAND-638-FIX4 verifier item 3: synthetic off population — main-o2 is a COPY of main boot B with a stated perturbation; main-1 = A, main-2 = B, main-o1 = A (symlinks)',
            'A': A, 'B': B, 'rows_band_fraction': 0.3, 'png_amplitude_rule': '+3 × env, env = A-vs-B png max pooled across looks per table/pose, floored at 1',
            'png_amplitude_per_cell': {}, 'hdr_floor': floor, 'hdr_floor_rule': 'smallest non-zero A-vs-B HDR flip (fallback 2.62e-3)', 'hdr_scale': 1.0 + 3.0 * floor, 'pairs': pair}
    for look, table, pose in expected:
        key = f'{look}/{table}/{pose}'; amp = 3 * env[f'{table}/{pose}']
        src = os.path.join(B, look, table, pose); dst_dir = os.path.join(o2, look, table); os.makedirs(dst_dir, exist_ok=True)
        img = png(src + '.png'); band = int(round(0.3 * img.shape[0]))
        img[:band] = np.clip(img[:band] + amp, 0, 255)
        Image.fromarray(img.astype(np.uint8), 'RGB').save(os.path.join(dst_dir, pose + '.png'))
        H = hdr(src + '.hdr.f32') * np.float32(1.0 + 3.0 * floor)
        H.astype('<f4').tofile(os.path.join(dst_dir, pose + '.hdr.f32'))
        with open(src + '.hdr.f32.json') as fi, open(os.path.join(dst_dir, pose + '.hdr.f32.json'), 'w') as fo: fo.write(fi.read())
        note['png_amplitude_per_cell'][key] = {'amp': amp, 'band_rows': band, 'of_rows': int(img.shape[0])}
    json.dump(note, open(os.path.join(o2, 'perturbation.json'), 'w'), indent=1)
    print(f"[main-flip] ARM synthetic: built {root} (main-1/main-o1 → {A}, main-2 → {B}, main-o2 = perturbed copy of B; png +{ {k: v['amp'] for k, v in note['png_amplitude_per_cell'].items()} } on the top 30 % rows, hdr × {note['hdr_scale']:.5f})")


if a.arm_synthetic:
    build_synthetic(*a.arm_synthetic)
    a.sets = os.path.abspath(a.arm_synthetic[2])
    fx_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')
    if os.path.abspath(a.out).startswith(fx_dir + os.sep):  # an arm run never writes the committed fixture
        a.out = os.path.join(a.sets, 'flip.json'); print(f'[main-flip] ARM synthetic: --out redirected to {a.out} (the committed fixture is never written by an arm run)')


# ORDER-LAND-638-FIX3 (review r7 P2 #5): the MAIN baseline comes from independent boots of the main export ONLY (`main-<n>`,
# `main-c<n>`); the `?venue=off` boots of the sealed tip (`main-o<n>`, `main-oc<n>`) are measured SEPARATELY as their own
# bound and never widen the tolerance that judges them (the old glob mixed the populations: a systematic off regression
# would have enlarged the envelope used to pass it — circular, fail-open)
def boot_dirs(root, off):
    # populations by name: `main-<n>` / `main-c<n>` = main export boots (the baseline), `main-o<n>` / `main-oc<n>` = ?venue=off boots
    # of the sealed tip (their own bound); both are UNLOADED boots. `main-oL*` = off boots captured under load (a landing chain's own
    # pins-step boot that landed in the load state D — §L23.3): RECORDED as off_load_cells, part of neither bound (FIX4 verifier 3.2)
    return sorted(d for d in glob.glob(os.path.join(root, 'main-*/')) if os.path.basename(d.rstrip('/')).startswith('main-o') == off and not os.path.basename(d.rstrip('/')).startswith('main-oL'))
def load_dirs(root):
    return sorted(glob.glob(os.path.join(root, 'main-oL*/')))
sets = {os.path.basename(os.path.dirname(root.rstrip('/'))) or root: boot_dirs(root, False) for root in a.sets.split(',')}
offsets = {os.path.basename(os.path.dirname(root.rstrip('/'))) or root: boot_dirs(root, True) for root in a.sets.split(',')}
def build_raw(setmap):
    out = {}
    for look in a.looks.split(','):
        for table in a.tables.split(','):
            for pose in a.poses.split(','):
                key = f'{look}/{table}/{pose}'; pairs = []
                for rnd, dirs in setmap.items():
                    files = [os.path.join(d, look, table, pose + '.png') for d in dirs]; files = [f for f in files if os.path.exists(f)]
                    for x, y in itertools.combinations(files, 2):
                        c = cmp(x, y); c['pair'] = f"{rnd}: {x.split('/')[-4]} vs {y.split('/')[-4]}"; pairs.append(c)
                if pairs: out[key] = pairs
    return out
raw = build_raw(sets)          # the baseline (main boots only)
raw_off = build_raw(offsets)   # the off boots' own bound (reported; a judged row checks it stays inside main's)
loadsets = {os.path.basename(os.path.dirname(root.rstrip('/'))) or root: load_dirs(root) for root in a.sets.split(',')}
# the load-state off boots against the UNLOADED main baseline boots (one pair per load boot per main boot): recorded, never a bound
raw_load = {}
for look in a.looks.split(','):
    for table in a.tables.split(','):
        for pose in a.poses.split(','):
            key = f'{look}/{table}/{pose}'; pairs = []
            for rnd, ldirs in loadsets.items():
                for ld in ldirs:
                    f = os.path.join(ld, look, table, pose + '.png')
                    if not os.path.exists(f): continue
                    for md in sets.get(rnd, [])[:3]:
                        g = os.path.join(md, look, table, pose + '.png')
                        if os.path.exists(g): c = cmp(f, g); c['pair'] = f"{os.path.basename(ld.rstrip('/'))} vs {os.path.basename(md.rstrip('/'))}"; pairs.append(c)
            if pairs: raw_load[key] = pairs
all_hdr = sorted(v.get('hdr_max', 0.0) for ps in raw.values() for v in ps if v.get('hdr_max', 0.0) > 0)
hdr_floor = all_hdr[0] if all_hdr else 2.62e-3
# the cell and pair the floor came from — written into the fixture so the attribution is data, not prose (ORDER-LIGHT-13 item 2)
hdr_floor_source = next((f"{key} ({v['pair']})" for key, ps in raw.items() for v in ps if v.get('hdr_max', 0.0) == hdr_floor), 'no non-zero flip observed (fallback floor)')
cells = {}
for key, pairs in raw.items():
    cells[key] = {'max': max(1, max(p['png_max'] for p in pairs)), 'frac': max(0.02, max(p['png_frac'] for p in pairs)), 'hdr': max(hdr_floor, max(p.get('hdr_max', 0.0) for p in pairs)), 'pairs': len(pairs), 'detail': pairs}
    print(f"{key:40s} max {cells[key]['max']} frac {cells[key]['frac'] * 100:.2f} % hdr {cells[key]['hdr']:.2e} ({len(pairs)} pairs)")
# ORDER-LAND-638-FIX (landing offcheck, land4 run 1): the flip is a TABLE property — it comes from the table's own
# materials / shaders under a per-boot ordering, and a look regrades tone and lights but cannot add or remove it — so
# each cell's tolerance is pooled across the looks of the same table/pose (the higher of the two); with two main boots
# a cell has ONE pair and a stochastic 1–3/255 flip on ~1 % of the Predator's pixels lands on either look's boot.
pooled = {}
for key, c in cells.items():
    look, table, pose = key.split('/')
    pk = f'{table}/{pose}'
    q = pooled.setdefault(pk, {'max': 0, 'frac': 0.0, 'hdr': 0.0})
    q['max'] = max(q['max'], c['max']); q['frac'] = max(q['frac'], c['frac']); q['hdr'] = max(q['hdr'], c['hdr'])
for key, c in cells.items():
    look, table, pose = key.split('/'); q = pooled[f'{table}/{pose}']
    c['own'] = {'max': c['max'], 'frac': c['frac'], 'hdr': c['hdr']}
    c['max'], c['frac'], c['hdr'] = q['max'], q['frac'], q['hdr']
    c['pooled_across_looks'] = True
main_dirs = [d for dirs in sets.values() for d in dirs]; off_dirs = [d for dirs in offsets.values() for d in dirs]
# the baseline counts MAIN boots only; the off boots are stated beside it (their own bound below)
boot_count = {'total': len(main_dirs), 'main_export': len(main_dirs), 'venue_off_tip': len(off_dirs), 'venue_off_load_recorded': sum(len(v) for v in loadsets.values()), 'baseline': 'main boots only (FIX3); venue_off_tip boots form their own bound (off_cells) and are NOT in the baseline'}
# ORDER-LAND-638-FIX4 (review r8 P2 #2): a bound is reported only for the FULL expected key set — every (look, table, pose) of
# the arguments must have pairs in BOTH populations; a missing cell FAILS the generator (exit 6, cell named) instead of a
# silently smaller bound that a later judge could read as complete
expected = [f'{look}/{table}/{pose}' for look in a.looks.split(',') for table in a.tables.split(',') for pose in a.poses.split(',')]
missing_main = [k for k in expected if k not in raw]; missing_off = [k for k in expected if k not in raw_off]
if missing_main or missing_off:
    if missing_main: print(f"[main-flip] FAIL: no MAIN pairs for cell(s): {', '.join(missing_main)}")
    if missing_off: print(f"[main-flip] FAIL: no OFF pairs for cell(s): {', '.join(missing_off)} (the off bound needs every expected cell)")
    sys.exit(6)
off_cells = {}
for key, pairs in raw_off.items():
    off_cells[key] = {'max': max(p['png_max'] for p in pairs), 'frac': max(p['png_frac'] for p in pairs), 'hdr': max(p.get('hdr_max', 0.0) for p in pairs), 'pairs': len(pairs)}
# every off cell inside main's (pooled) envelope → 1; any component outside → 0 (the FLIP-off-within-main row)
off_within_main = 1 if off_cells and all(k in cells and off_cells[k]['max'] <= cells[k]['max'] and off_cells[k]['frac'] <= cells[k]['frac'] and off_cells[k]['hdr'] <= cells[k]['hdr'] for k in off_cells) else 0
off_load_cells = {k: {'max': max(p['png_max'] for p in ps), 'frac': max(p['png_frac'] for p in ps), 'hdr': max(p.get('hdr_max', 0.0) for p in ps), 'pairs': len(ps), 'boots': sorted({p['pair'].split(' vs ')[0] for p in ps})} for k, ps in raw_load.items()}
for k, v in off_load_cells.items(): print(f"LOAD {k:36s} max {v['max']} frac {v['frac'] * 100:.2f} % hdr {v['hdr']:.2e} ({v['pairs']} pairs vs the first 3 main boots; boots {v['boots']}) — recorded, not a bound")
for k, v in off_cells.items(): print(f"off  {k:36s} max {v['max']} frac {v['frac'] * 100:.2f} % hdr {v['hdr']:.2e} ({v['pairs']} pairs) {'inside' if k in cells and v['max'] <= cells[k]['max'] and v['frac'] <= cells[k]['frac'] and v['hdr'] <= cells[k]['hdr'] else 'OUTSIDE'} main")
fx = {'main': a.main, 'boot_count': boot_count, 'boot_count_note': 'ORDER-LAND-638-FIX2 C1 / FIX3: the bound is derived from a STATED boot count of MAIN boots only — `main-<n>` / `main-c<n>` dirs are boots of the main export; `main-o<n>` / `main-oc<n>` dirs are ?venue=off boots of the sealed tip, measured as their OWN bound (off_cells, off_within_main) and never part of the baseline (their pixels are main\'s by the offcheck\'s own identity claim); every pair of boots within a set counts', 'pooling': 'per table/pose across looks (the flip is a table property; the higher of the two looks); each cell keeps its own-look values under `own`', 'what': f"main {a.main}'s own per-boot render flip, per offcheck cell: the max over every pair of independent main boots the verifiers captured (PNG max channel delta, differing-pixel fraction, HDR float max delta)",
      'floors': {'png_max': 1, 'png_frac': 0.02, 'hdr': hdr_floor, 'hdr_floor_source': hdr_floor_source, 'hdr_floor_derivation': f"the smallest NON-zero HDR flip observed on any cell across all main pairs ({hdr_floor:.3e}); observed set: {[f'{v:.2e}' for v in all_hdr]}; an observed ?venue=off per-boot flip of 1.4e-4 (verifier round 10) sits under it"},
      'sources': {k: v for k, v in ((rnd, [d.rstrip('/') for d in dirs]) for rnd, dirs in sets.items())},
      'off_sources': {k: v for k, v in ((rnd, [d.rstrip('/') for d in dirs]) for rnd, dirs in offsets.items())}, 'off_cells': off_cells, 'off_within_main': off_within_main, 'off_load_cells': off_load_cells, 'off_load_boots': sum(len(v) for v in loadsets.values()),
      'generator': 'tools/render/lighting-main-flip.py', 'measured_at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'cells': cells}
os.makedirs(os.path.dirname(a.out), exist_ok=True); json.dump(fx, open(a.out, 'w'), indent=1)
print(f'[main-flip] {len(cells)} cells, hdr floor {hdr_floor:.3e} → {a.out}')
if a.arm_synthetic:
    # the final assertion of the synthetic arm: the perturbed off population must read OUTSIDE main's envelope (exit 4 = fired,
    # the seal's convention for a negative arm that failed for the right reason); a non-firing arm exits 7 and names itself
    outside = [k for k, v in off_cells.items() if not (k in cells and v['max'] <= cells[k]['max'] and v['frac'] <= cells[k]['frac'] and v['hdr'] <= cells[k]['hdr'])]
    if off_within_main == 0 and outside:
        print(f"[main-flip] ARM synthetic: off_within_main 0, cells outside main's envelope: {', '.join(outside)} → FAILED for the right reason (the arm fires)"); sys.exit(4)
    print(f"[main-flip] ARM synthetic: the perturbed off population read INSIDE main's envelope (off_within_main {off_within_main}) — the arm did NOT fire (this line must never print)"); sys.exit(7)
