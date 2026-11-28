#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""FIX9: construction-derived corner seams, with FIX3 witnesses in history.

Reflect each actual corner to the lane's +X+Y MODEL reference; never refit a
datum or reconstruct a corner. The original FIX4 calculation below is retained
verbatim as history: FIX8's swept opening retired its fixed witness locations.
The current construction supplies acceptance locations through corner_seam_current_rox.
Use --legacy to reproduce the retired verdict, including RED.
"""
import argparse
import hashlib
import json
from pathlib import Path

from evidence_deps_rox import require_evidence_deps
require_evidence_deps()

import numpy as np

import planlaw_rox as law

FIX3_SHA = '85bdbef49ec44bb48bd77cf35ac1607cfa2450f392f3193c4e9ee06711a588d9'
WINDOWS = {'long': (-45, 0, 38, 70), 'short': (38, 70, -45, 0)}
CORNERS = {'pxpz': (1, 1), 'nxpz': (-1, 1), 'pxnz': (1, -1), 'nxnz': (-1, -1)}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def reflected(build, sx, sy):
    vertices = build.V * np.asarray([sx, sy, 1])
    return law.Build(build.tag, vertices, build.F, build.names, build.ids,
                     build.origin['middle'], build.origin['corner'])


def masks(build, model, window):
    """List the cells of the existing exposed() bands; judgment still calls it."""
    g = np.arange(law.N) + .5
    x, y = np.meshgrid(-law.HALF + g / law.PPM, law.HALF - g / law.PPM)
    x0, x1, y0, y1 = window
    selected = (x >= x0) & (x <= x1) & (y >= y0) & (y <= y1)
    z, ids = build.height('corner')
    mz, components = model.height('corner')
    eligible = law.physical_rox.eligibility(mz - law.BED, components, selected)
    # Exactly planlaw.exposed's existing bands; cell counts are cross-checked.
    low = ((z - law.BED < -100) | ((z - law.BED >= -24) & (z - law.BED < 5))) & selected
    pan = (z - law.BED < -100) & selected
    return x, y, z, ids, mz, components, low & eligible, pan & eligible


def cells(mask, arrays, build):
    x, y, z, ids, mz, components = arrays[:6]
    result = []
    for i, j in np.argwhere(mask):
        result.append(dict(grid_ij=[int(i), int(j)], xy_mm=[float(x[i, j]), float(y[i, j])],
                           ours_mesh=build.names[int(ids[i, j])] if ids[i, j] >= 0 else None,
                           ours_z_mm=float(z[i, j] - law.BED),
                           model_component=int(components[i, j]), model_z_mm=float(mz[i, j] - law.BED)))
    return result


def run(args):
    if sha(args.fix3) != FIX3_SHA:
        raise ValueError('SEAM_CONTROL_REFUSED: not the sealed FIX3 dump')
    definition = json.loads((law.REPO / 'docs/geometry/rasson-ox-9ft-table-definition.json').read_text())
    rows = {row['id']: row for row in definition['features']}
    cp12 = rows['CP-12']['value_mm']
    span = cp12['angular_span_of_the_open_C']['total_wall_arc_deg'] / 2
    radius = cp12['inner_wall_circle']['R_mm'] + cp12['wall_thickness_mm']['value']
    centre = rows['RC-32']['value_mm']['corner_pocket']['adopted_render_centre_u_along_diagonal'] / np.sqrt(2)
    kernel = law.load_rows()
    model = law.model_build(args.cache)
    fixed = law.ours_build(args.dump, 'FIX4', kernel)
    before = law.ours_build(args.fix3, 'sealed FIX3', kernel)
    result = dict(inputs={str(args.dump): sha(args.dump), str(args.fix3): FIX3_SHA},
                  source_reference=model.reference_metadata,
                  corner_rule='Actual exported corner reflected about table axes to the fixed +X+Y source window; no refit and no independent MODEL-corner claim',
                  witness_rule='Sealed FIX3 LAW cells on MODEL cup/flange outside the actual C radius, within one existing 0.1-degree fan step of either C endpoint',
                  corners={})
    for tag, (sx, sy) in CORNERS.items():
        a, b = reflected(before, sx, sy), reflected(fixed, sx, sy)
        record = dict(reflection=[sx, sy], windows={}, seam_witnesses=[], remaining_seam_cells=[])
        for side, window in WINDOWS.items():
            sa = law.exposed(a, 'corner', window, kernel, model)
            sb = law.exposed(b, 'corner', window, kernel, model)
            aa, bb = masks(a, model, window), masks(b, model, window)
            for score, data in ((sa, aa), (sb, bb)):
                if float(data[6].sum() * law.CELL) != score['LAW_mm2'] or float(data[7].sum() * law.CELL) != score['SLIT_mm2']:
                    raise ValueError('SEAM_CELL_READ_REFUSED: disagrees with unchanged planlaw')
            x, y = aa[:2]
            dx, dy = x - centre, y - centre
            r = np.hypot(dx, dy)
            phi = (np.degrees(np.arctan2(dy, dx)) - 45 + 180) % 360 - 180
            # The source fan already samples every 1/10 degree near +/-span.
            seam = aa[6] & (aa[5] == 46557) & (r >= radius) & (abs(abs(phi) - span) <= 1 / 10)
            witness = cells(seam, aa, a)
            for row in witness:
                i, j = row['grid_ij']
                row.update(window=side, radius_mm=float(r[i, j]), phi_deg=float(phi[i, j]),
                           fixed_z_mm=float(bb[2][i, j] - law.BED),
                           fixed_mesh=b.names[int(bb[3][i, j])],
                           was_slit=bool(aa[7][i, j]), fixed_high=bool(bb[2][i, j] >= law.BED + 36))
            record['seam_witnesses'].extend(witness)
            record['remaining_seam_cells'].extend(row for row in witness if not row['fixed_high'])
            record['windows'][side] = dict(
                FIX3={key: sa[key] for key in ('LITERAL_mm2', 'LAW_mm2', 'SLIT_mm2')},
                FIX4={key: sb[key] for key in ('LITERAL_mm2', 'LAW_mm2', 'SLIT_mm2')},
                FIX3_law_cells=cells(aa[6], aa, a), FIX4_law_cells=cells(bb[6], bb, b),
                exclusions={key: sb[key] for key in ('model_open_counts', 'excluded_low_counts', 'excluded_pan_counts', 'model_rubber_cells', 'model_no_hit_cells')},
                passed=bool(np.isfinite(sb['LAW_mm2']) and np.isfinite(sb['SLIT_mm2'])
                            and sb['LAW_mm2'] <= law.LAW['b'] and sb['SLIT_mm2'] <= law.LAW["b''"]
                            and sb['LITERAL_mm2'] <= law.LITERAL_RATCHET['corner']))
        if not record['seam_witnesses']:
            raise ValueError('SEAM_CONTROL_REFUSED: no defective FIX3 endpoint witnesses for ' + tag)
        record['frozen_FIX3_control_refused'] = True
        record['seam_passed'] = not record['remaining_seam_cells']
        record['passed'] = record['seam_passed'] and all(row['passed'] for row in record['windows'].values())
        result['corners'][tag] = record
        print(tag, 'FIX3 -> FIX4', json.dumps({side: {key: row[key] for key in ('FIX3', 'FIX4')} for side, row in record['windows'].items()}))
        print(tag, 'SEAM', len(record['seam_witnesses']), 'FIX3 low; FIX4 remaining', len(record['remaining_seam_cells']),
              '; FIX3 slit witnesses', sum(row['was_slit'] for row in record['seam_witnesses']))
    result['ok'] = all(row['passed'] for row in result['corners'].values())
    if not args.legacy:
        from corner_seam_current_rox import measure
        result = measure(args.dump, fixed, model, kernel, result)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / 'corner-seam-rox.json').write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
    print('LEGACY FIX3 / PLANLAW GATE' if args.legacy else 'CURRENT FOUR-CORNER SEAM GATE', 'OK' if result['ok'] else 'RED')
    return 0 if result['ok'] or not args.judge else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('dump', 'fix3', 'out'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--cache', type=Path, default=Path('/tmp/ox-a2/align/cache'))
    parser.add_argument('--judge', action='store_true')
    parser.add_argument('--legacy', action='store_true', help='Judge the retired fixed FIX3 witnesses and wide windows')
    return run(parser.parse_args())


if __name__ == '__main__':
    raise SystemExit(main())
