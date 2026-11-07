#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""RC-34 nose-extreme mouths from horizontal sections of the sealed MODEL.

The section plane and nose lines are measured from the six source cushions.
Only scalar measurements and input hashes leave memory; no source sections,
vertices or indices are serialized. The renderer is never an input.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
RECORD = HERE / 'measurements/model-mouth-rox.json'
TAGS = ('nxnz', 'pxnz', 'pxpz', 'nxpz', 'nz', 'pz')
SCHEMA = 'openbilliards/rox-model-mouth-measurement/1'


def published(rows):
    if len(rows) != len(TAGS) or {r['pocket'] for r in rows} != set(TAGS):
        raise ValueError('MODEL_MOUTH_INVENTORY_REFUSED: six distinct pockets required')
    if any(not math.isfinite(r['width_mm']) or r['width_mm'] <= 0 for r in rows):
        raise ValueError('MODEL_MOUTH_VALUE_REFUSED: finite positive widths required')
    corner = [r['width_mm'] for r in rows if len(r['pocket']) == 4]
    side = {round(r['width_mm'], 3) for r in rows if len(r['pocket']) == 2}
    if len(side) != 1:
        raise ValueError('MODEL_MOUTH_SIDE_ASYMMETRY_REFUSED: a single RC-34 value cannot represent both sides')
    return dict(corner_mouth_model_nose_extreme_range=[round(min(corner), 3), round(max(corner), 3)],
                side_mouth_model_nose_extreme=side.pop())


def load_record(path=RECORD):
    result = json.loads(Path(path).read_text())
    fixed = json.loads((HERE / 'align/pocket-reference-rox.json').read_text())
    if (result.get('schema') != SCHEMA or result.get('source_tag') != 'MODEL'
            or result['sealed_model']['source_sha256'] != fixed['source']['sha256']
            or result['sealed_model']['reference_sha256'] != hashlib.sha256(
                (HERE / 'align/pocket-reference-rox.json').read_bytes()).hexdigest()
            or result['published'] != published(result['measurements'])):
        raise ValueError('MODEL_MOUTH_RECORD_REFUSED: source seal or published measurements differ')
    return result


def measure_sections(segments, nose_x, nose_y, height):
    import numpy as np
    q = np.asarray(segments).reshape(-1, 3)
    if not len(q) or not np.isfinite(q).all():
        raise ValueError('MODEL_MOUTH_SECTION_REFUSED: empty or non-finite section')
    result = []
    for tag in TAGS:
        sx = -1 if tag.startswith('nx') else 1 if tag.startswith('px') else 0
        sy = -1 if tag.endswith('nz') else 1
        # Retain the original audit's 0.001 mm nose-line membership band.
        # It selects section points; it is not a mouth acceptance tolerance.
        long = q[abs(q[:, 1] - sy * nose_y) < .001]
        if sx:
            short = q[abs(q[:, 0] - sx * nose_x) < .001]
            if not len(long) or not len(short):
                raise ValueError('MODEL_MOUTH_SECTION_REFUSED: missing nose line at ' + tag)
            a = long[np.argmax(long[:, 0] * sx), :2]
            b = short[np.argmax(short[:, 1] * sy), :2]
            width = float(np.linalg.norm(a - b))
        else:
            left, right = long[long[:, 0] < 0], long[long[:, 0] > 0]
            if not len(left) or not len(right):
                raise ValueError('MODEL_MOUTH_SECTION_REFUSED: missing side half at ' + tag)
            width = float(right[:, 0].min() - left[:, 0].max())
        result.append(dict(pocket=tag, height_mm=height, width_mm=width))
    published(result)  # Inventory and numeric refusals apply before publication.
    return result


def measure(cache):
    from evidence_deps_rox import require_evidence_deps
    require_evidence_deps()
    import numpy as np
    import physical_rox
    import objsoup
    v, _, faces, ids, metadata = physical_rox.load(cache)
    model = v[faces]
    model[:, :, 2] -= objsoup.BEDTOP
    fibres = []
    for cid in physical_rox.RUBBER:
        p = model[ids == cid].reshape(-1, 3)
        along = int(np.argmax(np.ptp(p[:, :2], axis=0)))
        side = int(np.sign(p[:, 1 - along].mean()))
        u = p[:, 1 - along] * side
        # Floating-point equality of source fibres, not a geometric fit band.
        fibre = p[abs(u - u.min()) < 1e-8]
        fibres.append(dict(component=cid, along_axis=along, side=side,
                           nose_u_mm=float(u.min()), lowest_nose_z_mm=float(fibre[:, 2].min())))
    height = min(r['lowest_nose_z_mm'] for r in fibres)
    nose_x = max(r['nose_u_mm'] for r in fibres if r['along_axis'] == 1)
    nose_y = max(r['nose_u_mm'] for r in fibres if r['along_axis'] == 0)
    sections = objsoup.section(model[np.isin(ids, physical_rox.RUBBER)], 2, height)
    rows = measure_sections(sections, nose_x, nose_y, height)
    return dict(schema=SCHEMA, source_tag='MODEL',
                sealed_model=dict(source_sha256=metadata['source_sha256'],
                                  reference_sha256=metadata['reference_sha256']),
                section=dict(plane_z_above_true_bed_mm=height, nose_x_mm=nose_x, nose_y_mm=nose_y,
                             segments=len(sections),
                             sha256=hashlib.sha256(np.asarray(sections, dtype='<f8').tobytes()).hexdigest()),
                source_fibres=fibres, measurements=rows, published=published(rows),
                instrument=dict(path='tools/render/ghrox/model_mouth_rox.py',
                                sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()),
                protocol='Lowest actual extreme nose fibre; corner chord between long/short nose-line endpoints; side distance between the two inner nose-line endpoints; three-decimal publication; unscaled MODEL sections.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', default='/tmp/ox-a2/align/cache')
    parser.add_argument('--out', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if not args.out and not args.check:
        parser.error('--out <new-file> or --check required')
    result = measure(args.cache)
    if args.check and result != load_record():
        raise ValueError('MODEL_MOUTH_SEAL_MISMATCH: fresh sealed sections differ from the committed measurement')
    if args.out:
        with args.out.open('x') as stream:
            json.dump(result, stream, indent=2)
            stream.write('\n')
    print('MODEL_MOUTH_MEASUREMENT', json.dumps(result['published'], sort_keys=True))


if __name__ == '__main__':
    main()
