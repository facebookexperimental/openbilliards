#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-switch-arm.py — ORDER-LIGHT-7 R-C arm: after a LIVE Predator → JOY switch (poke-raw
`__settings.changeEquipment('table_id','joy_q8_9ft')` in a Predator boot) the JOY frame must equal a fresh JOY boot
(the same look, the same pose) — pixel delta 0 — and the compiled census must show no venue-fill term on the JOY
ball / cue programs (that part is a gate row on the switch reads' `programs` block). This script computes the pixel
delta and merges it into the switch reads.json as `scope.<pose>.joy_first_frame` (absdelta = max |Δ| over the frame,
px = pixels differing, frac). ORDER-LIGHT-7: the raw residue is NOT zero (109 / 124 of 255) because main rebuilds the
table without re-baking the env cubemap, so extra CASES measure the same residue under other configurations and land
beside it as `joy_first_frame_<name>`: `reenv` (the switch followed by window.__rebakeEnv()) is the causal test,
`off` (?venue=off on both sides) is the control that the residue survives with the venue subsystem switched off.
  python3 tools/render/lighting-switch-arm.py --switch output/lighting/after-s7-switch --fresh output/lighting/after-s7 \
      --reads output/lighting/reads-render/after-s7-switch --poke switchjoy --table predator_apex_9ft --fresh-table joy_q8_9ft
"""
import argparse, json, os
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--switch', required=True); ap.add_argument('--fresh', required=True); ap.add_argument('--reads', required=True)
ap.add_argument('--poke', default='switchjoy'); ap.add_argument('--table', default='predator_apex_9ft'); ap.add_argument('--fresh-table', default='joy_q8_9ft')
ap.add_argument('--looks', default='default,sp'); ap.add_argument('--poses', default='full34,cueball_level')
ap.add_argument('--case', action='append', default=[], metavar='NAME=SWITCHDIR,FRESHDIR[,POKE]',
                help='extra comparison merged into the SAME reads as joy_first_frame_<NAME> (repeatable)')
a = ap.parse_args()


def measure(switch_dir, fresh_dir, poke, look, pose, table, fresh_table):
    """max 8-bit channel delta between <switch_dir>/<look>/<table>/<poke>/<pose>.png and the fresh boot's frame."""
    p1 = os.path.join(switch_dir, look, table, poke, pose + '.png')
    p2 = os.path.join(fresh_dir, look, fresh_table, pose + '.png')
    if not (os.path.exists(p1) and os.path.exists(p2)):
        return {'absdelta': None, 'note': f'missing frame ({"switch" if not os.path.exists(p1) else "fresh"})'}
    A = np.asarray(Image.open(p1).convert('RGB')).astype(int); B = np.asarray(Image.open(p2).convert('RGB')).astype(int)
    if A.shape != B.shape:
        return {'absdelta': None, 'note': f'shape {A.shape} vs {B.shape}'}
    dd = np.abs(A - B).max(axis=2)
    return {'absdelta': int(dd.max()), 'px': int((dd > 0).sum()), 'frac': round(float((dd > 0).mean()), 5),
            'p99': float(np.percentile(dd, 99)), 'mean': round(float(dd.mean()), 4)}


CASES = [('', a.switch, a.fresh, a.poke)]
for spec in a.case:
    name, _, rest = spec.partition('=')
    parts = rest.split(',')
    CASES.append((name, parts[0], parts[1], parts[2] if len(parts) > 2 else a.poke))

for look in a.looks.split(','):
    rp = os.path.join(a.reads, look, f'{a.table}@{a.poke}', 'reads.json')
    if not os.path.exists(rp):
        print(f'[switch-arm] {look}: no reads at {rp}'); continue
    d = json.load(open(rp)); res = {}
    for pose in a.poses.split(','):
        cell = {}
        for name, sd, fd, poke in CASES:
            m = measure(sd, fd, poke, look, pose, a.table, a.fresh_table)
            cell['joy_first_frame' + (f'_{name}' if name else '')] = m
            tag = f'[{name}] ' if name else ''
            print(f"[switch-arm] {look}/{pose}: {tag}switched JOY vs fresh JOY boot max|Δ| {m.get('absdelta')}/255"
                  f" on {m.get('px')} px (p99 {m.get('p99')})" + (f" — {m['note']}" if m.get('note') else ''))
        res[pose] = cell
    d['scope'] = {**(d.get('scope') or {}), **{k: {**(d.get('scope') or {}).get(k, {}), **v} for k, v in res.items()}}
    d['scope_meta_switch'] = ('joy_first_frame = the live Predator → JOY switch frame vs a fresh JOY boot (same look/pose), 8-bit RGB max channel'
                              ' delta; _reenv = the same switch with the env cubemap re-baked afterwards; _off = the same switch with ?venue=off on both sides')
    json.dump(d, open(rp, 'w'), indent=1)
