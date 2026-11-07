#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-room-pairs.py — ORDER-LAND-638-FIX2 B1: room-region ratios of set A against set B, merged into A's reads.json as a
`roomPairs` block (the contractPairs precedent). For every (look, table[@poke]) present in both, at --pose (full34):
  wallRatio  = Y(wall_side, A) / Y(wall_side, B)      floorRatio = Y(floor_beside, A) / Y(floor_beside, B)
  benchRatio = Y(bench_back, A) / Y(bench_back, B)    bedRatio   = Y(bed_open, A) / Y(bed_open, B)
(scene-linear medians of the derived kernel-frame patches; a missing read leaves the field null → a judged row fails closed).
  python3 tools/render/lighting-room-pairs.py --a <reads dir A> --b <reads dir B> [--pose full34] [--label B]"""
import argparse, json, os, glob
ap = argparse.ArgumentParser(); ap.add_argument('--a', required=True); ap.add_argument('--b', required=True)
ap.add_argument('--pose', default='full34'); ap.add_argument('--label', default='B')
a = ap.parse_args()
FIELDS = {'wallRatio': 'wall_side', 'floorRatio': 'floor_beside', 'benchRatio': 'bench_back', 'bedRatio': 'bed_open'}
n = 0
for pa in sorted(glob.glob(os.path.join(a.a, '*', '*', 'reads.json'))):
    look, key = pa.split(os.sep)[-3], pa.split(os.sep)[-2]
    pb = os.path.join(a.b, look, key, 'reads.json')
    if not os.path.exists(pb):
        cands = glob.glob(os.path.join(a.b, look, key.split('@')[0], 'reads.json')); pb = cands[0] if cands else None
    if not pb: continue
    A = json.load(open(pa)); B = json.load(open(pb))
    ra = ((A.get('poses') or {}).get(a.pose) or {}).get('reads', {}); rb = ((B.get('poses') or {}).get(a.pose) or {}).get('reads', {})
    out = {'pair': f'{a.label}: {os.path.basename(a.b.rstrip("/"))}', 'pose': a.pose}
    for name, patch in FIELDS.items():
        ya, yb = (ra.get(patch) or {}).get('Y'), (rb.get(patch) or {}).get('Y')
        out[name] = (ya / yb) if (ya and yb) else None; out[name + 'A'] = ya; out[name + 'B'] = yb
    A['roomPairs'] = out; json.dump(A, open(pa, 'w'), indent=1); n += 1
    print(f"[roompairs] {look}/{key}: wall {out['wallRatio']} floor {out['floorRatio']} bench {out['benchRatio']} bed {out['bedRatio']}")
print(f'[roompairs] {n} reads updated')
