#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""gi-delta-490.py — BUILD-3 (review round 12 P1-b (ii)): pixel-delta maps between two frame sets
(the same poses shot with the OLD chinese8 GI maps and with the REBAKED ones).

  python3 tools/render/gi-delta-490.py --before <dir> --after <dir> --out <dir> [--poses a,b,c]

Per pose: |after − before| per pixel (max over RGB), a heat map (black → yellow → white, 0…64/255),
the changed fraction (Δ > 4/255), mean / p99 / max Δ over the frame, and a side-by-side board
before | after | Δ.  Writes <out>/gi-delta-<pose>.png and <out>/gi-delta-490.json."""
import argparse, json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser(); ap.add_argument('--before', required=True); ap.add_argument('--after', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--poses', default='mid_close_diag,mid_tt_inside,c6_midext_owner_low,ev05_plan')
# FIX2 (review round 2 on #731): option presence is not option value — a blank or trailing path flag and a missing input path exit 2 by name
ap.allow_abbrev = False  # FIX2: no prefix matching — `--ou=` must not reach argparse as --out=''
import os as _os, sys as _sys; _sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "lib")); from argpaths import guard_paths as _guard_paths
a = ap.parse_args()
_guard_paths({'--before': 'dir', '--after': 'dir', '--out': 'out', '--poses': 'value'}, tag='gi-delta-490.py')  # FIX10 (Fable pass 2): after the parse — help exits 0 first; the guard is a post-parse value + existence check
B, A, O = Path(a.before), Path(a.after), Path(a.out); O.mkdir(parents=True, exist_ok=True)  # FIX10 (Fable pass 3): the mkdir follows the guard — a refused run creates nothing
try: F = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 16)
except Exception: F = ImageFont.load_default()
rep = {'tool': 'tools/render/gi-delta-490.py', 'before': str(B), 'after': str(A), 'poses': []}
def heat(d):
    # 0..64 → black→red→yellow→white
    t = np.clip(d / 64.0, 0, 1)
    r = np.clip(t * 3, 0, 1); g = np.clip(t * 3 - 1, 0, 1); b = np.clip(t * 3 - 2, 0, 1)
    return (np.dstack([r, g, b]) * 255).astype(np.uint8)
for pose in a.poses.split(','):
    fb, fa = B / f'{pose}.png', A / f'{pose}.png'
    if not fb.exists() or not fa.exists(): rep['poses'].append({'pose': pose, 'refuse': f'missing {fb if not fb.exists() else fa}'}); continue
    ib, ia = Image.open(fb).convert('RGB'), Image.open(fa).convert('RGB')
    if ib.size != ia.size: rep['poses'].append({'pose': pose, 'refuse': f'size mismatch {ib.size} vs {ia.size}'}); continue
    nb, na = np.asarray(ib).astype(np.int16), np.asarray(ia).astype(np.int16)
    d = np.abs(na - nb).max(axis=2)
    stats = {'pose': pose, 'size': ib.size, 'changed_fraction_gt4': round(float((d > 4).mean()), 4), 'mean_delta': round(float(d.mean()), 3), 'p99_delta': int(np.percentile(d, 99)), 'max_delta': int(d.max())}
    # where: bounding box of Δ > 8
    ys, xs = np.nonzero(d > 8)
    stats['bbox_gt8'] = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())] if len(xs) else None
    rep['poses'].append(stats)
    H = Image.fromarray(heat(d.astype(float)))
    W, Hh = ib.size; board = Image.new('RGB', (W * 3 + 24, Hh + 60), (247, 246, 243)); dr = ImageDraw.Draw(board)
    dr.text((8, 6), f"GI rebake delta · {pose} · before (old chinese8 GI maps) | after (rebaked on the live middle-pocket mirror) | |Δ| heat (0…64/255): changed {stats['changed_fraction_gt4']*100:.1f} % of pixels, mean {stats['mean_delta']}, p99 {stats['p99_delta']}, max {stats['max_delta']}", fill=(25, 25, 25), font=F)
    for i, im in enumerate((ib, ia, H)): board.paste(im, (6 + i * (W + 6), 36))
    for i, lab in enumerate(('before', 'after', '|Δ| heat')): dr.text((8 + i * (W + 6), Hh + 40), lab, fill=(25, 25, 25), font=F)
    board.save(O / f'gi-delta-{pose}.png'); print('[gi-delta-490]', pose, json.dumps(stats))
json.dump(rep, open(O / 'gi-delta-490.json', 'w'), indent=1)
print(f"[gi-delta-490] wrote {O}/gi-delta-490.json ({len(rep['poses'])} poses)")
sys.exit(0 if rep['poses'] and not any('refuse' in p for p in rep['poses']) else 2)
