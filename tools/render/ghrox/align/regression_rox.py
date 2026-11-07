#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""FIX2 fixed-MODEL replay, using the UNCHANGED FULL lane deviation estimator.

The published align gate judges median/p90. ORDER-ROX-A4-FIX1 additionally
requires side_above's reported maximum <= the pre-A4 2.07 mm and a HELD-A4
negative control that read 22.27 mm under the historical A3 fitted datum.
FIX2 changes only the datum: the section 10.5 preview predicts 2.09 / 20.49 /
1.96 mm (before / HELD / FIX1). These are replay expectations, not new limits.
The max-only limit stays 2.07 mm; the before row may honestly be RED.
There is no live OURS-fit mode. FIX1's classifier remains available for archived
results only. Neither masks nor thresholds.py are edited.
Only statistics and OUR maximum sample coordinates leave memory; never MODEL arrays.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import deviation
import objsoup
import ours
import register
import pocket_reference

# Explicit FIX1 ruling; two-decimal reporting is deviation.stats's existing rule.
SIDE_MAX_MM = 2.07
FIXED_PROTOCOL = 'FIX2-fixed-MODEL'
LEGACY_PROTOCOL = 'FIX1-legacy-A3'
REPLAY_EXPECTED = {FIXED_PROTOCOL: dict(before=2.09, held=20.49),
                   LEGACY_PROTOCOL: dict(before=2.07, held=22.27)}


def max_row(value, *, regression=False, protocol=FIXED_PROTOCOL):
    expected_held = REPLAY_EXPECTED[protocol]['held']
    finite = isinstance(value, (int, float)) and math.isfinite(value)
    red = finite and value > SIDE_MAX_MM
    fired = bool(red and value == expected_held) if regression else None
    return dict(value_mm=value if finite else None, limit_mm=SIDE_MAX_MM,
                verdict='RED' if not finite or red else 'GREEN', finite=finite,
                expected_mm=expected_held if regression else None,
                fired=fired, kind='REGRESSION' if regression else 'MAX-ONLY', protocol=protocol)


def measure(path, model_triangles, model_datums, reference_path=pocket_reference.DEFAULT):
    dump = ours.Dump(str(path), reference_path=reference_path)
    result = dict(path=str(path), sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                  cup_datums={key: list(dump.datums[key]) for key in ('cup_side', 'cup_corner')},
                  elements={}, pocket_reference=dump.reference.metadata(), cup_observations=dump.cup_observations)
    for name in ('side_above', 'corner_above'):
        w = objsoup.WINDOWS[name]
        box, anchor = w['box'], w['anchor']
        own_datums = dump.comparison_datums(anchor)
        excluded = ('dm-spot', *w.get('exclude_ours', ()))
        selected = [m for m in dump.meshes if not m['name'].startswith(excluded)]
        model_local = objsoup.tris_local(model_triangles, anchor, model_datums, box, margin=3.0)
        own_local = objsoup.tris_local(dump.comparison_tris(anchor, selected), anchor, own_datums, box, margin=3.0)
        mask_model = objsoup.window_mask(w, anchor, model_datums, side='model', other=own_datums)
        mask_own = objsoup.window_mask(w, anchor, own_datums, other=model_datums)
        stats, points, distances = deviation.element(model_local, own_local, box,
                                                   mask_m=mask_model, mask_o=mask_own)
        stats.pop('_sdM', None)
        winner = int(np.argmax(distances)) if len(distances) else None
        stats['maximum_sample'] = None if winner is None else dict(
            kept_index=winner, own_local_mm=points[winner].tolist(),
            distance_unrounded_mm=float(distances[winner]))
        result['elements'][name] = stats
        print(f"[max-only] {path.name} {name}: "
              f"o->m {stats['ours_to_model']} m->o {stats['model_to_ours']}", flush=True)
    return result


def judge(measurements, protocol=FIXED_PROTOCOL):
    def side(label):
        return measurements[label]['elements']['side_above']['ours_to_model']['max']

    before, held, fixed = side('before'), side('held'), side('fixed')
    rows = dict(before=max_row(before, protocol=protocol), held=max_row(held, regression=True, protocol=protocol), fixed=max_row(fixed, protocol=protocol))
    before_reproduced = rows['before']['finite'] and before == REPLAY_EXPECTED[protocol]['before']
    corner_unchanged = all(
        measurements['held']['elements']['corner_above'][direction]
        == measurements['fixed']['elements']['corner_above'][direction]
        for direction in ('ours_to_model', 'model_to_ours'))
    ok = before_reproduced and rows['held']['fired'] and rows['fixed']['verdict'] == 'GREEN' and corner_unchanged
    return dict(protocol=protocol, rows=rows, before_reproduced=before_reproduced,
                corner_above_statistics_unchanged=corner_unchanged, ok=bool(ok))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--before', type=Path, required=True)
    parser.add_argument('--held', type=Path, required=True)
    parser.add_argument('--ours', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--judge', action='store_true')
    parser.add_argument('--reference', type=Path, default=pocket_reference.DEFAULT)
    parser.add_argument('--redarm', action='store_true')
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    try:
        reference = pocket_reference.load(args.reference)
    except pocket_reference.ReferenceRefused as exc:
        print(f'[fixed-model-replay] REFUSED {exc}', flush=True)
        return 4
    model = register.model_tris('raw')
    datums = objsoup.model_datums()
    phases = {'before': args.before, 'held': args.held, 'fixed': args.ours}
    measurements = {label: measure(path, model, datums, args.reference) for label, path in phases.items()}
    verdict = judge(measurements)
    arms = pocket_reference.redarms(args.reference) if args.redarm else []
    verdict['ok'] = verdict['ok'] and all(arm['armed'] for arm in arms)
    report = dict(tool='align/regression_rox.py', mode='FULL',
                  estimator='unchanged deviation.element defaults: spacing 1.5, max_n 200000, seed 642, k=4',
                  precision='unchanged deviation.stats two-decimal reporting; unrounded maxima also disclosed',
                  source='ORDER-ROX-A4-FIX2 B / approved section 10.5; FIX1 max-only limit retained',
                  quarantine='MODEL read through lane /tmp cache; no model sample/vertex/triangle export',
                  measurements=measurements, verdict=verdict, reference=reference.metadata(), reference_arms=arms,
                  legacy='2.07 / 22.27 / 2.00 mm belongs to FIX1-legacy-A3, not this fixed-datum run; no live fitted fallback')
    (args.out / 'regression-rox.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
    lines = ['# FIX2 fixed-MODEL replay / max-only alignment regression', '',
             'FULL unchanged lane estimator; only datum inputs changed. Existing median/p90 gate remains separate.', '',
             f'Reference `{reference.id}` SHA-256 `{reference.sha256}`. No OURS-fit mode.', '',
             '| Phase | side ours→MODEL median / p90 / max (mm) | Max-only row |', '|---|---|---|']
    for label in phases:
        st = measurements[label]['elements']['side_above']['ours_to_model']
        row = verdict['rows'][label]
        status = row['verdict'] + ('; REGRESSION FIRED' if row['fired'] else '')
        lines.append(f"| {label} | {st['median']} / {st['p90']} / {st['max']} | {status} |")
    lines.extend(['', f"Fixed-datum pre-A4 2.09 reproduced: {verdict['before_reproduced']}; its max-only row is RED against unchanged 2.07.",
                  f"Corner above-bed statistics byte-equal to HELD: {verdict['corner_above_statistics_unchanged']}.",
                  'Historical A3 2.07 / 22.27 / 2.00 are a separately versioned legacy replay, not this datum.',
                  f"Replay obligations: {'PASS' if verdict['ok'] else 'FAIL'} (not an all-rows-GREEN verdict).", ''])
    for arm in arms:
        lines.append(f"Reference red arm: {arm['result']}; fired={arm['armed']}.")
        print(f"[reference-arm] {arm['result']}; fired={arm['armed']}", flush=True)
    (args.out / 'REGRESSION-ROX.md').write_text('\n'.join(lines))
    print(json.dumps(verdict, indent=2), flush=True)
    return 1 if args.judge and not verdict['ok'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
