#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-pixel-strict.py — ORDER-LIGHT-C2-FIX7 (the proportionate seal form): a STRICT pixel comparator between two capture sets. Every cell
(look / table / pose) present in either set must exist in both, and its linear HDR dump (.hdr.f32, the pixel truth) must be identical float for
float (0 changed pixels); the PNG bytes are compared as a second witness. Sub-run frames (a poke label such as conv) are found under
<look>/<table>/<sub>/. usage: --a <set> --b <set> --tables t1,t2 --looks default,sp --poses p1,p2 [--sub conv]

ORDER-LIGHT-C2-FIX10 class A (review r10 P2 ×2 + P3): three channels, never one —
  exit 0 = every cell MEASURED and identical (HDR float for float; the PNG verdict is in the rows and judged by the caller)
  exit 3 = every cell MEASURED and at least one DIFFERS
  exit 4 = the instrument COULD NOT MEASURE at least one cell (a missing .hdr.f32 on either side, or a shape mismatch) — a non-answer, reported
           in its own channel so that no control can read "absent input" as "the control fired" (the P6 fail-only-reporter class)
The pixel count groups floats by the sidecar's declared `channels` (<pose>.hdr.f32.json, written by lighting-capture.mjs: 3 = RGB), never by a
hard-coded 4: a 4-pixel RGB frame reports 4 px and a 1-pixel change reports 1 changed px. `--fixture-check` proves that on a synthetic 4-px RGB pair
(exit 0 = 4 px / 1 changed as expected; exit 3 otherwise); `--fixture-check-arm` runs the same fixture through the OLD grouping-by-4 and must FAIL.
"""
import argparse, os, sys, json, tempfile
import numpy as np
ap = argparse.ArgumentParser(); ap.add_argument('--a'); ap.add_argument('--b'); ap.add_argument('--tables'); ap.add_argument('--looks', default='default')
ap.add_argument('--poses'); ap.add_argument('--sub', default=''); ap.add_argument('--sub-a', default=None); ap.add_argument('--sub-b', default=None); ap.add_argument('--json')
ap.add_argument('--fixture-check', action='store_true', help='C2-FIX10 class A arm (iii): a synthetic 4-pixel RGB pair with ONE changed pixel must report px 4 / changed 1 (exit 0); anything else exits 3')
ap.add_argument('--fixture-check-dims', action='store_true', help='ORDER-LIGHT-C2-FIX20 X3 self-test: 2x3 vs 3x2 (same payload) → UNMEASURED: DIMENSION exit 4; equal dims identical → PASS exit 0; equal dims one pixel changed → FAIL exit 3; 2x3 vs 3x2 with different payloads → UNMEASURED exit 4 — real files WITH sidecars under tempfile, through this very script')
ap.add_argument('--fixture-check-arm', action='store_true', help='the arm of --fixture-check: group by 4 (the pre-FIX10 rule) — the fixture check must FAIL (exit 3)')
a = ap.parse_args()

def read_channels(f32_path, default=3):
    """the sidecar's declared channel count (lighting-capture.mjs writes channels: 3); a sidecar without the field or without a sidecar reads the default"""
    try:
        j = json.load(open(f32_path + '.json'))
        c = int(j.get('channels', default)); return c if c > 0 else default
    except Exception: return default

def sidecar_dims(f32_path):
    """(w, h, channels) from the sidecar; None when the sidecar is missing or does not declare positive dimensions — the payload cannot be validated"""
    try:
        j = json.load(open(f32_path + '.json')); w, h, c = int(j.get('w', 0)), int(j.get('h', 0)), int(j.get('channels', 3))
        return (w, h, c) if w > 0 and h > 0 and c > 0 else None
    except Exception: return None

def payload_check(f32_path):
    """ORDER-LIGHT-C2-FIX13 N3 (review r11 P2): the float payload's byte size must equal w x h x channels x 4 from its sidecar BEFORE any statistic —
    two payloads truncated to the same length used to pass the shape test and be marked measured. Returns (ok, actual, expected, dims, why)."""
    actual = os.path.getsize(f32_path) if os.path.isfile(f32_path) else -1
    dims = sidecar_dims(f32_path)
    if dims is None: return (False, actual, None, None, 'sidecar missing or without positive w/h/channels')
    expected = dims[0] * dims[1] * dims[2] * 4
    if actual != expected: return (False, actual, expected, dims, f'payload {actual} bytes != expected {dims[0]}x{dims[1]}x{dims[2]}x4 = {expected}')
    return (True, actual, expected, dims, 'ok')

def compare(A, B, channels):
    """(px, changed, maxabs, ulpMax, ulpLe1, nfloat) over two equal-shape float32 arrays grouped by `channels` floats per pixel"""
    diff = A != B; n = A.size
    if channels > 0 and n % channels == 0:
        px = n // channels; changed = int(np.count_nonzero(diff.reshape(-1, channels).any(axis=1)))
    else:
        px = n; changed = int(np.count_nonzero(diff))  # a frame whose float count is not a multiple of its channels: every float is its own cell (named in the row)
    maxabs = float(np.max(np.abs(A - B))) if n else 0.0
    if diff.any():
        mag = np.maximum(np.abs(A[diff]), np.abs(B[diff])).astype(np.float32); ulp = np.abs(A[diff] - B[diff]) / np.maximum(np.spacing(mag), np.float32(1e-45))
        return px, changed, maxabs, float(ulp.max()), float((ulp <= 1.0).mean()), int(diff.sum())
    return px, changed, maxabs, 0.0, 1.0, 0

if a.fixture_check_dims:
    import subprocess
    import shutil
    root = tempfile.mkdtemp(prefix='ob-pixel-strict-dims-'); bad = 0
    def cell(side, name, w, h, payload):
        d = os.path.join(root, name, side, 'default', 't'); os.makedirs(d, exist_ok=True)
        payload.astype(np.float32).tofile(os.path.join(d, 'p.hdr.f32'))
        json.dump({'w': w, 'h': h, 'ds': 1, 'W': w, 'H': h, 'channels': 3, 'dtype': 'float32le', 'rows': 'top-down', 'nan': 0, 'neg': 0, 'max': float(payload.max())}, open(os.path.join(d, 'p.hdr.f32.json'), 'w'))
        return os.path.join(root, name, side)
    base = np.arange(18, dtype=np.float32) * 0.125; changed = base.copy(); changed[7] += 0.5; other = base[::-1].copy()
    cases = [('dims-2x3-vs-3x2-same-payload', (2, 3, base), (3, 2, base), 'UNMEASURED', 4, 'UNMEASURED: DIMENSION 2x3x3 vs 3x2x3'),
             ('dims-equal-identical', (2, 3, base), (2, 3, base), 'PASS', 0, 'identical'),
             ('dims-equal-one-pixel', (2, 3, base), (2, 3, changed), 'FAIL', 3, 'DIFFERS (1 px'),
             ('dims-2x3-vs-3x2-other-payload', (2, 3, base), (3, 2, other), 'UNMEASURED', 4, 'UNMEASURED: DIMENSION 2x3x3 vs 3x2x3')]
    try:
     for name, (wa, ha, pa_), (wb, hb, pb_), want_word, want_exit, want_row in cases:
        da = cell('a', name, wa, ha, pa_); db = cell('b', name, wb, hb, pb_)
        r = subprocess.run([sys.executable, os.path.abspath(__file__), '--a', da, '--b', db, '--tables', 't', '--poses', 'p', '--looks', 'default'], capture_output=True, text=True)
        outp = r.stdout + r.stderr; vline = next((l for l in outp.split('\n') if l.startswith(f'[pixel-strict] {want_word} ') or l.startswith('[pixel-strict] PASS ') or l.startswith('[pixel-strict] FAIL ') or l.startswith('[pixel-strict] UNMEASURED ')), '(no verdict line)')
        ok = r.returncode == want_exit and vline.startswith(f'[pixel-strict] {want_word} ') and want_row in outp
        print(f"[pixel-strict] fixture-check-dims {name}: a {wa}x{ha}x3 vs b {wb}x{hb}x3 → {want_word} exit {r.returncode} (want exit {want_exit}); row word {'present' if want_row in outp else 'MISSING'} ({want_row}) — {'as expected' if ok else 'UNEXPECTED: ' + vline[:120]}")
        if not ok: bad += 1
    finally:
        pass
    print(f"[pixel-strict] fixture-check-dims {'PASS' if bad == 0 else 'FAIL'} — {len(cases) - bad}/{len(cases)} pairs read as expected (exit {0 if bad == 0 else 3}); fixtures were under {root} (removed)")
    shutil.rmtree(root, ignore_errors=True)   # CORRIGENDUM-2 D2: the fixture root does not outlive the run
    sys.exit(0 if bad == 0 else 3)

if a.fixture_check or a.fixture_check_arm:
    # the fixture: a 4-pixel RGB frame (12 floats) and a copy with exactly ONE pixel changed (pixel 2, channel G)
    A = np.arange(12, dtype=np.float32) * 0.125; B = A.copy(); B[7] += 0.5
    ch = 4 if a.fixture_check_arm else 3
    px, changed, *_ = compare(A, B, ch)
    ok = (px == 4 and changed == 1)
    print(f"[pixel-strict] fixture-check{' ARM (grouping by 4)' if a.fixture_check_arm else ''}: 4-pixel RGB frame, 1 pixel changed → reports px {px}, changed {changed} — {'PASS' if ok else 'FAIL'} (want px 4, changed 1)")
    if a.fixture_check_arm: print('[pixel-strict] ARM ' + ('FIRED: the grouping-by-4 rule miscounts the RGB fixture (exit 3)' if not ok else 'DEAD: the grouping-by-4 rule counted the RGB fixture correctly — a failed proof (exit 0)'))
    sys.exit(0 if ok else 3)

for req in ('a', 'b', 'tables', 'poses'):
    if getattr(a, req) is None: print(f'[pixel-strict] --{req} required'); sys.exit(2)
def cell_dir(root, look, table, sub):
    d = os.path.join(root, look, table)
    if sub == 'auto':
        for cand in ('conv',):
            if os.path.isdir(os.path.join(d, cand)): return os.path.join(d, cand)
        return d
    return os.path.join(d, sub) if sub else d
rows = []; bad = 0; unmeasured = 0
for look in a.looks.split(','):
    for t in a.tables.split(','):
        da, db = cell_dir(a.a, look, t, a.sub if a.sub_a is None else a.sub_a), cell_dir(a.b, look, t, a.sub if a.sub_b is None else a.sub_b)  # C2-FIX9: a per-side sub (base vs studiorevert)
        for pose in a.poses.split(','):
            fa, fb = os.path.join(da, pose + '.hdr.f32'), os.path.join(db, pose + '.hdr.f32')
            pa, pb = os.path.join(da, pose + '.png'), os.path.join(db, pose + '.png')
            r = {'cell': f'{look}/{t}/{pose}', 'hdr': None, 'png': None, 'px': None, 'changed': None, 'maxabs': None, 'ulpMax': None, 'ulpLe1': None, 'nfloat': None, 'channels': None, 'measured': False, 'sizes': None}
            if not (os.path.isfile(fa) and os.path.isfile(fb)):
                r['hdr'] = 'UNMEASURED: MISSING (' + ('a' if not os.path.isfile(fa) else '') + ('b' if not os.path.isfile(fb) else '') + ')'; unmeasured += 1
            else:
                oka, acta, expa, dima, whya = payload_check(fa); okb, actb, expb, dimb, whyb = payload_check(fb)
                r['sizes'] = {'a': {'actual': acta, 'expected': expa, 'dims': dima}, 'b': {'actual': actb, 'expected': expb, 'dims': dimb}}
                print(f"[pixel-strict] sizes {look}/{t}/{pose}: a {acta} bytes (expected {expa}, dims {dima}); b {actb} bytes (expected {expb}, dims {dimb})")
                A = np.fromfile(fa, dtype=np.float32); B = np.fromfile(fb, dtype=np.float32)
                ca, cb = read_channels(fa), read_channels(fb)
                if not (oka and okb): r['hdr'] = f'UNMEASURED: PAYLOAD (UNJUDGEABLE-INSTRUMENT) a: {whya}; b: {whyb} — an incomplete or mis-declared capture is never measured (FIX13 N3)'; unmeasured += 1
                elif dima != dimb: r['hdr'] = f'UNMEASURED: DIMENSION {dima[0]}x{dima[1]}x{dima[2]} vs {dimb[0]}x{dimb[1]}x{dimb[2]}'; unmeasured += 1   # ORDER-LIGHT-C2-FIX20 X3 (review 727 r12 P2): np.fromfile is one-dimensional, so count-equal shape-DIFFERENT captures (2x3 vs 3x2) passed the shape compare below; the sidecar dims are compared FIRST (payload_check guarantees non-None dims when ok)
                # (the former 'UNMEASURED: SHAPE' branch is unreachable after the DIMENSION compare: equal (w, h, channels) with an ok payload_check on both sides implies equal flat shapes and equal declared channels — removed, FIX20 CORRIGENDUM-2 D2. The identity compared is (w, h, channels) from the sidecar; the sidecar's source W/H/ds are NOT compared — a b19 note, not a change.)
                else:
                    r['channels'] = ca; r['measured'] = True
                    r['px'], r['changed'], r['maxabs'], r['ulpMax'], r['ulpLe1'], r['nfloat'] = compare(A, B, ca)
                    r['hdr'] = 'identical' if r['changed'] == 0 else f"DIFFERS ({r['changed']} px, max |d| {r['maxabs']:.3g}, max {r['ulpMax']:.2f} ULP, {100*r['ulpLe1']:.1f}% of changed floats ≤ 1 ULP)"
                    if r['changed']: bad += 1
            if os.path.isfile(pa) and os.path.isfile(pb): r['png'] = 'identical bytes' if open(pa, 'rb').read() == open(pb, 'rb').read() else 'bytes differ'
            else: r['png'] = 'UNMEASURED: missing'
            rows.append(r); print(f"[pixel-strict] {r['cell']}: hdr {r['hdr']} ({r['px']} px @ {r['channels']} ch); png {r['png']}")
verdict = 'UNMEASURED' if unmeasured else ('PASS' if bad == 0 else 'FAIL')
print(f"[pixel-strict] {verdict} — {len(rows)} cells, {bad} with a measured difference, {unmeasured} the instrument could not measure ({a.a} vs {a.b})")
if a.json: json.dump({'a': a.a, 'b': a.b, 'rows': rows, 'bad': bad, 'unmeasured': unmeasured, 'verdict': verdict}, open(a.json, 'w'), indent=1)
sys.exit(4 if unmeasured else (0 if bad == 0 else 3))
