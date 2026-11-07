#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Provenance tag census over the three Diamond sheets (D621-ALIGN-2 B4 proof).
Verdict A (the B4 proof): rows tagged MFR whose source.tier is COM or EST == 0 in every sheet.
Verdict B (the ruling's render sentence): live render-scope rows tagged EST == 0 (retired rows excluded) — reported, and it fails
the exit code too, so a disclosed deviation stays visible in every run.
Also lists MFR rows on a standards tier (WPA / MFR+WPA / MFR-derived), which the sheets' tier_legend grants MFR."""
import json, sys
from collections import Counter
bad_a = bad_b = 0
for sz in ('9ft', '8ft', '7ft'):
    d = json.load(open(f'docs/geometry/diamond-proam-{sz}-table-definition.json')); F = d['features']
    tag = lambda f: (f.get('provenance') or {}).get('tag', '—')
    c = Counter(tag(f) for f in F)
    a = [f['id'] for f in F if tag(f) == 'MFR' and f['source'].get('tier') in ('COM', 'EST')]
    std = [(f['id'], f['source'].get('tier')) for f in F if tag(f) == 'MFR' and f['source'].get('tier') not in ('MFR', 'COM', 'EST')]
    b = [f['id'] for f in F if tag(f) == 'EST' and f.get('scope') != 'kernel-collision' and f.get('status') != 'RETIRED']
    retired = [f['id'] for f in F if f.get('status') == 'RETIRED']
    print(f"{sz}: {dict(c)} of {len(F)} rows, retired {retired}")
    print(f"  A  MFR tag on a COM/EST tier: {a or 'none'}")
    print(f"  B  live render-scope rows tagged EST: {b or 'none'}")
    print(f"     MFR tag on a standards tier (tier_legend grants MFR to the standard cited): {std}")
    bad_a += len(a); bad_b += len(b)
print(f"VERDICT A (B4 proof, MFR on COM/EST tier == 0): {'PASS' if bad_a == 0 else 'FAIL'}")
print(f"VERDICT B (ruling: no render-scope EST): {'PASS' if bad_b == 0 else 'FAIL — disclosed deviation, see O22'}")
sys.exit(0 if bad_a == 0 and bad_b == 0 else 1)
