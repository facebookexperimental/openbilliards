#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-contract-pairs.py — ORDER-LAND-638-FIX: cross-set ratios for the boot-compatibility / pre-GI arms, merged into
set A's reads.json as a `contractPairs` block (the gate reads census:contractPairs:<field>; the ledger precedent).
  python3 tools/render/lighting-contract-pairs.py --a <reads dir A> --b <reads dir B> [--pose cueball_level] [--ball 0]
For every (look, table[@poke]) present in BOTH: crownRatioAB = crown_Y(A)/crown_Y(B), plus the two crowns, the two
under/crown display ratios and the two crown clip fractions. A missing read on either side leaves the field null
(the gate then fails closed on a judged row)."""
import argparse, json, os, glob
import math
def _sh_rel(sa, sb):
    if not sa or not sb or len(sa) != len(sb): return None
    num = math.sqrt(sum((float(x) - float(y)) ** 2 for x, y in zip(sa, sb))); den = math.sqrt(sum(float(y) ** 2 for y in sb))
    return (num / den) if den > 0 else None
ap = argparse.ArgumentParser(); ap.add_argument('--a', required=True); ap.add_argument('--b', required=True)
ap.add_argument('--pose', default='cueball_level'); ap.add_argument('--ball', default='0'); ap.add_argument('--label', default='B')
a = ap.parse_args()
n = 0
for pa in sorted(glob.glob(os.path.join(a.a, '*', '*', 'reads.json'))):
    look, key = pa.split(os.sep)[-3], pa.split(os.sep)[-2]
    pb = os.path.join(a.b, look, key, 'reads.json')
    if not os.path.exists(pb):
        # the B set may carry the same table under a different poke label — match on the bare table
        cands = glob.glob(os.path.join(a.b, look, key.split('@')[0] + '*', 'reads.json')); pb = cands[0] if cands else None
    if not pb: continue
    A = json.load(open(pa)); B = json.load(open(pb))
    ba = ((A.get('poses') or {}).get(a.pose) or {}).get('balls', {}).get(a.ball) or {}
    bb = ((B.get('poses') or {}).get(a.pose) or {}).get('balls', {}).get(a.ball) or {}
    ca, cb = ba.get('crown_Y'), bb.get('crown_Y')
    A['contractPairs'] = {
        'pair': f'{a.label}: {os.path.basename(a.b.rstrip("/"))}', 'pose': a.pose, 'ball': a.ball,
        'crownA': ca, 'crownB': cb, 'crownRatioAB': (ca / cb) if (ca and cb) else None,
        'crownSatA': ba.get('crown_sat'), 'crownSatB': bb.get('crown_sat'),
        'underA': ba.get('under_over_crown_disp'), 'underB': bb.get('under_over_crown_disp'),
        'equatorA': ba.get('equator_over_crown_disp'), 'equatorB': bb.get('equator_over_crown_disp'),
        'discMaxA': ba.get('disc_max_lin'), 'discMaxB': bb.get('disc_max_lin'),
        # ORDER-LIGHT-C2-FIX10 class B: the two boots' derived venue probes compared — relative L2 |SH_A − SH_B| / |SH_B| (the same statistic the
        # in-page sqShL2Rel uses), null when either side carries no derived probe (the gate then fails closed on a judged row)
        'shL2RelAB': _sh_rel((A.get('venue') or {}).get('sh'), (B.get('venue') or {}).get('sh')),
        'shA': 1 if (A.get('venue') or {}).get('sh') else 0, 'shB': 1 if (B.get('venue') or {}).get('sh') else 0,
    }
    json.dump(A, open(pa, 'w'), indent=1); n += 1
    print(f"[pairs] {look}/{key}: crown {ca} vs {cb} → ratio {A['contractPairs']['crownRatioAB']}")
print(f'[pairs] {n} reads updated')
