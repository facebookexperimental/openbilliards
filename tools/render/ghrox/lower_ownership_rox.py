#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""FIX5 lower ownership and source-class height ceilings, without name exemptions.

Purchased geometry is read in place. Only scalar cell observations are written.
SYMMETRIC_LOWER is an OWNERSHIP refusal, not an area-threshold manipulation.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

from evidence_deps_rox import require_evidence_deps
require_evidence_deps()

import numpy as np
import planlaw_rox as law
import provenance_rox

LOWER_SHA = 'cfb6edbbf962a94402ddb24d5ec34fa2c3c67b9220c4c7b78445bfedefa271a4'
FRONT_SHA = '7a0e856b45e98f5865189fd612d3c030196a9bb0acd40045bea5b8ce2535e3c7'
CLASSES = {46557: 'cup_transition_or_floor', 46537: 'curved_slab_notch',
           46560: 'lower_return', 46542: 'long_rubber'}
WINDOWS = {'long': (-45, 0, 38, 70), 'short': (38, 70, -45, 0)}


class OwnershipRefused(ValueError):
    """A source owner is missing or the construction gives it another owner."""


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sealed(path, expected):
    if sha(path) != expected:
        raise OwnershipRefused('OWNERSHIP_REFUSED: witness SHA differs: ' + str(path))
    return json.loads(path.read_text())


def owner(name):
    if name.endswith('-pan'):
        return 'lower_return'
    if '-cup-' in name:
        return 'cup_transition_or_floor'
    if '-cut' in name:
        return 'curved_slab_notch'
    if name.startswith('dm-cushion'):
        return 'long_rubber'
    return 'other'


def height_rules(definition):
    """Conservative physical class envelopes, not fitted per-cell tolerances.

    CP-12x/CP-14m-x already publish bed-relative physical front profiles.
    Their highest measured profile samples bound the lower source classes;
    they are not the +36 upper projection band or an OURS-derived ceiling.
    A wrong surface below this envelope can still require a shape/owner test.
    """
    provenance_rox.check(definition)
    rows = {r['id']: r for r in definition['features']}
    bed = rows['PF-05']['value_mm']['bed_cloth_plane_measured_z_mm']
    result = {'lower_return': dict(source='PK-03 lower_return ceiling (pan_top_z.corner - PF-05)',
                                   ceiling_z_bed_mm=rows['PK-03']['value']['below_cup']['pan_top_z']['corner'] - bed)}
    for part, letter in (('cup_transition_or_floor', 'CP-12x'), ('curved_slab_notch', 'CP-14m-x')):
        row = rows[letter]
        if row['source']['tier'] != 'MODEL':
            raise OwnershipRefused('OWNERSHIP_REFUSED: non-MODEL lower profile ' + letter)
        samples = [point[1] for s in row['value']['stations'] for point in (s['profile_mm'] or [])]
        if not samples or not np.all(np.isfinite(samples)):
            raise OwnershipRefused('OWNERSHIP_REFUSED: missing physical profile heights ' + letter)
        result[part] = dict(source=letter + ' maximum measured physical front-profile height',
                            ceiling_z_bed_mm=max(samples))
    return result


def census(build, witnesses, ceilings):
    # PK-03.below_cup.pan_top_z.corner - PF-05: the existing adopted return
    # plane, not a fitted ceiling or a new LAW band. Names cannot excuse a
    # covering surface above that owner. The scalar epsilon is the same
    # numerical precision used below for MODEL height/cache binding.
    for part in ('lower_return', 'cup_transition_or_floor', 'curved_slab_notch'):
        if part not in ceilings or not np.isfinite(ceilings[part]['ceiling_z_bed_mm']):
            raise OwnershipRefused('OWNERSHIP_REFUSED: missing source height ceiling ' + part)
    pan_top_mm = ceilings['lower_return']['ceiling_z_bed_mm']
    z, ids = build.height('corner')
    result = []
    for row in witnesses:
        i, j = row['grid_ij']
        if ids[i, j] < 0 or not np.isfinite(z[i, j]):
            raise OwnershipRefused('OWNERSHIP_REFUSED: OURS no-hit cell ' + row['id'])
        name = build.names[ids[i, j]]
        actual = owner(name)
        ours_z = float(z[i, j] - law.BED)
        return_cell = row['model_part'] == 'lower_return'
        rule = ceilings.get(row['model_part'])
        height_ok = rule is None or ours_z <= rule['ceiling_z_bed_mm'] + 1e-6
        result.append(dict(id=row['id'], window=row['window'], xy_mm=row['xy_mm'],
                           model_owner=row['model_part'], model_component=row['model_component'],
                           model_z_mm=row['model_top_z_bed_mm'], ours_owner=actual,
                           ours_mesh=name, ours_z_mm=ours_z,
                           return_ceiling_PK03_mm=pan_top_mm if return_cell else None,
                           source_height_rule=rule,
                           height_owner_match=bool(height_ok),
                           semantic_owner_match=actual == row['model_part'],
                           row_a_domain=row['model_part'] == 'long_rubber',
                           exact_owner_match=actual == row['model_part'] and bool(height_ok)))
    return result


def failures(rows):
    return [r for r in rows if not r['row_a_domain'] and not r['exact_owner_match']]


def require_ownership(rows, label):
    bad = failures(rows)
    if bad:
        first = bad[0]
        if not first['height_owner_match']:
            raise OwnershipRefused(f"{label}: OWNERSHIP_REFUSED {len(bad)} cells; {first['id']} "
                                   f"{first['xy_mm']} mesh {first['ours_mesh']} MODEL {first['model_owner']} "
                                   f"OURS top {first['ours_z_mm']} above {first['source_height_rule']['source']} "
                                   f"{first['source_height_rule']['ceiling_z_bed_mm']}")
        raise OwnershipRefused(f"{label}: OWNERSHIP_REFUSED {len(bad)} cells; {first['id']} "
                               f"{first['xy_mm']} mesh {first['ours_mesh']} MODEL {first['model_owner']} != OURS {first['ours_owner']}")


def scores(build, kernel, model):
    result = {}
    for tag, window in WINDOWS.items():
        score = law.exposed(build, 'corner', window, kernel, model)
        result[tag] = {key: score[key] for key in ('LITERAL_mm2', 'LAW_mm2', 'SLIT_mm2')}
        if not all(np.isfinite(v) for v in result[tag].values()):
            raise OwnershipRefused('OWNERSHIP_REFUSED: non-finite area CONTROL ' + tag)
    return result


def extend(build, vertices, faces, name):
    return law.Build(name, np.r_[build.V, vertices], np.r_[build.F, faces + len(build.V)],
                     [*build.names, name], np.r_[build.ids, np.full(len(faces), len(build.names))],
                     build.origin['middle'], build.origin['corner'])


def clip_half(tri, axis, keep_long):
    """Clip actual triangles at the cup diagonal; no station reconstruction."""
    out = []
    for a, b in zip(tri, np.roll(tri, -1, axis=0)):
        da = (a[1] - axis[1]) - (a[0] - axis[0])
        db = (b[1] - axis[1]) - (b[0] - axis[0])
        if not keep_long:
            da, db = -da, -db
        if da >= 0:
            out.append(a)
        if da * db < 0:
            out.append(a + (b - a) * da / (da - db))
    return out


def symmetric_substitute(build, axis, keep_long):
    """Replace BOTH measured lower meshes by one actual half and its reflection.

    The C, old cut behind its ends, upper flange, rubber, bed hole and datum do
    not move. The lower mesh names continue to describe real cup/cut parts.
    """
    targets = [name for name in build.names if name in (
        'dm-pocket-rox-corner-pxpz-cup-bucket-measured',
        'dm-pocket-rox-corner-pxpz-cut-model-front')]
    if len(targets) != 2:
        raise OwnershipRefused('SYMMETRIC_LOWER: missing measured cup or front-cut mesh')
    remove = [build.names.index(name) for name in targets]
    vertices, faces, ids = [build.V], [build.F[~np.isin(build.ids, remove)]], [build.ids[~np.isin(build.ids, remove)]]
    offset = len(build.V)
    triangles = 0
    for name in targets:
        ident = build.names.index(name)
        points = []
        for tri in build.V[build.F[build.ids == ident]]:
            poly = clip_half(tri, axis, keep_long)
            for j in range(1, len(poly) - 1):
                triangle = np.asarray([poly[0], poly[j], poly[j + 1]])
                mirror = triangle.copy()
                mirror[:, :2] = axis + (triangle[:, :2] - axis)[:, ::-1]
                points.extend(triangle)
                points.extend(mirror[::-1])
        v = np.asarray(points)
        if not len(v):
            raise OwnershipRefused('SYMMETRIC_LOWER: empty actual source half ' + name)
        f = np.arange(len(v)).reshape(-1, 3)
        vertices.append(v)
        faces.append(f + offset)
        ids.append(np.full(len(f), ident))
        offset += len(v)
        triangles += len(f)
    return law.Build('SYMMETRIC_LOWER', np.concatenate(vertices), np.concatenate(faces),
                     build.names, np.concatenate(ids), build.origin['middle'], build.origin['corner']), triangles


def front_wrong(build, front, source_z, source_ids):
    z, ids = build.height('corner')
    source_owner = law.physical_rox.owner_classes(source_ids, source_z - law.BED)
    result = []
    for row in front:
        i, j = row['grid_ij']
        if ids[i, j] < 0 or not np.isfinite(z[i, j]):
            raise OwnershipRefused('UPPER_SOURCE_FRONT: OURS no-hit cell ' + row['id'])
        if source_ids[i, j] < 0 or not np.isfinite(source_z[i, j]):
            raise OwnershipRefused('UPPER_SOURCE_FRONT: MODEL no-hit cell ' + row['id'])
        name = build.names[ids[i, j]]
        # The sealed witnesses have no physical MODEL upper cup/flange at +36.
        # Test the actual highest surface, regardless of its advertised name.
        if z[i, j] - law.BED >= 36:
            result.append(dict(id=row['id'], xy_mm=row['xy'], ours_mesh=name,
                               ours_z_mm=float(z[i, j] - law.BED),
                               model_component=int(source_ids[i, j]),
                               model_owner=str(source_owner[i, j]),
                               model_physical_z_mm=float(source_z[i, j] - law.BED)))
    return result


def run(args):
    lower = sealed(args.lower_cells, LOWER_SHA)['rows']
    front = sealed(args.front_cells, FRONT_SHA)['cells']
    if len(lower) != 184 or len(front) != 6102:
        raise OwnershipRefused('OWNERSHIP_REFUSED: incomplete source census')
    kernel = law.load_rows()
    definition = json.loads((law.REPO / 'docs/geometry/rasson-ox-9ft-table-definition.json').read_text())
    rc32 = next(f['value_mm'] for f in definition['features'] if f['id'] == 'RC-32')
    ceilings = height_rules(definition)
    pan_top_mm = ceilings['lower_return']['ceiling_z_bed_mm']
    model = law.model_build(args.cache)
    candidate = law.ours_build(args.dump, 'FIX5 MODEL fronts + exact endpoints + lower', kernel)
    source_z, source_ids = model.height('corner')
    for row in lower:
        i, j = row['grid_ij']
        if not np.isfinite(source_z[i, j]):
            raise OwnershipRefused('OWNERSHIP_REFUSED: MODEL physical no-hit ' + row['id'])
        if source_ids[i, j] != row['model_component'] or CLASSES.get(int(source_ids[i, j])) != row['model_part']:
            raise OwnershipRefused('OWNERSHIP_REFUSED: MODEL source component/class drift ' + row['id'])
        if abs(source_z[i, j] - law.BED - row['model_top_z_bed_mm']) >= 1e-6:
            raise OwnershipRefused('OWNERSHIP_REFUSED: MODEL height drift ' + row['id'])
    cup = law.Build('MODEL physical cup', model.physical.V,
                    model.physical.F[model.physical.ids == 46557], None, None,
                    model.origin['middle'], model.origin['corner'])
    cup_z = cup.height('corner')[0]
    if any(cup_z[tuple(r['grid_ij'])] - law.BED >= 36 for r in front):
        raise OwnershipRefused('UPPER_SOURCE_FRONT: witness is not below the physical MODEL cup front')
    rows = census(candidate, lower, ceilings)
    unsupported = front_wrong(candidate, front, source_z, source_ids)
    result = dict(source_reference=model.reference_metadata, source_lower_184_reproduced=True,
                  return_height_rule=dict(source='PK-03.value.below_cup.pan_top_z.corner - PF-05',
                                          ceiling_z_bed_mm=pan_top_mm, mesh_name_can_exempt=False),
                  lower_height_rules=ceilings,
                  lower_height_qualification='Conservative maxima of the existing MODEL lower-profile letters, not per-cell fit tolerances; names cannot excuse height. This does not claim to reject every shape below a class envelope.',
                  upper_front_rule='Highest OURS surface at sealed unsupported +36 MODEL-cup witnesses; no name filter',
                  inputs={str(path): sha(path) for path in (args.dump, args.fix1, args.lower_cells, args.front_cells)},
                  lower_rows=rows, lower_class_counts=dict(Counter(r['model_owner'] for r in rows)),
                  lower_exact_matches=dict(Counter(r['model_owner'] for r in rows if r['exact_owner_match'])),
                  ownership_failures=failures(rows), unsupported_upper_cells=unsupported,
                  area_controls=scores(candidate, kernel, model), arms=[])
    if args.redarm:
        for keep_long in (True, False):
            axis = np.asarray(candidate.origin['corner']) + rc32['corner_pocket']['adopted_render_centre_u_along_diagonal'] / np.sqrt(2)
            mutant, triangles = symmetric_substitute(candidate, axis, keep_long)
            measured = census(mutant, lower, ceilings)
            refusal = None
            try:
                require_ownership(measured, 'SYMMETRIC_LOWER')
            except OwnershipRefused as exc:
                refusal = str(exc)
            result['arms'].append(dict(name='SYMMETRIC_LOWER', detector='OWNERSHIP',
                                       direction='long-to-short' if keep_long else 'short-to-long',
                                       real_mutant_triangles=triangles, refusal=refusal,
                                       named_cell_failures=failures(measured),
                                       LAW_slit_CONTROLS=scores(mutant, kernel, model), fired=refusal is not None))
        xy = np.asarray([r['xy_mm'] for r in lower])
        lo, hi = xy.min(0) - 1 / law.PPM, xy.max(0) + 1 / law.PPM
        quad = np.asarray([[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]]) + candidate.origin['corner']
        # FIX4's refuter supplied the -24.1 pan-named counterexample; retain
        # the original bed-height arm too. Neither spelling can evade height.
        for height in (-24.1, 0.0):
            mutant = extend(candidate, np.c_[quad, np.full(4, law.BED + height)],
                            np.asarray([[0, 1, 2], [0, 2, 3]]), 'dm-pocket-rox-corner-pxpz-cover-pan')
            wrong = [r for r in census(mutant, lower, ceilings)
                     if r['model_owner'] == 'lower_return' and not r['height_owner_match']]
            result['arms'].append(dict(name='NO_RETURN_COVER', detector='HEIGHT/OWNERSHIP', cover_z_mm=height,
                                       mutant_mesh=mutant.names[-1],
                                       real_mutant_triangles=2, named_cell_failures=wrong,
                                       LAW_slit_CONTROLS=scores(mutant, kernel, model), fired=len(wrong) == 110))
        # FIX5 C: flatten the actual lower mesh footprint to the refuter's
        # +20 mm height. These are real triangles, not painted witness cells.
        for part, suffix, expected in (('cup_transition_or_floor', 'cup-bucket-measured', 54),
                                       ('curved_slab_notch', 'cut-model-front', 11)):
            original = 'dm-pocket-rox-corner-pxpz-' + suffix
            ident = candidate.names.index(original)
            sheet = candidate.V[candidate.F[candidate.ids == ident]].reshape(-1, 3).copy()
            sheet[:, 2] = law.BED + 20
            mutant = extend(candidate, sheet, np.arange(len(sheet)).reshape(-1, 3), original + '-cover-sheet')
            observed = census(mutant, lower, ceilings)
            wrong = [r for r in observed if r['model_owner'] == part and not r['height_owner_match']]
            refusal = None
            try:
                require_ownership([r for r in observed if r['model_owner'] == part], 'LOWER_SOURCE_HEIGHT')
            except OwnershipRefused as exc:
                refusal = str(exc)
            result['arms'].append(dict(name='LOWER_SOURCE_HEIGHT', detector='HEIGHT/OWNERSHIP',
                                       source_class=part, cover_z_mm=20, mutant_mesh=mutant.names[-1],
                                       real_mutant_triangles=len(sheet) // 3, named_cell_failures=wrong,
                                       refusal=refusal, LAW_slit_CONTROLS=scores(mutant, kernel, model),
                                       fired=len(wrong) == expected and refusal is not None))
        fixed = law.ours_build(args.fix1, 'FIX1 frozen loop', kernel)
        ident = fixed.names.index('dm-pocket-rox-corner-pxpz-flange')
        faces = fixed.F[fixed.ids == ident]
        mutant = extend(candidate, fixed.V, faces, 'dm-pocket-rox-UPPER_SOURCE_FRONT-flange')
        wrong = front_wrong(mutant, front, source_z, source_ids)
        result['arms'].append(dict(name='UPPER_SOURCE_FRONT', detector='HEIGHT',
                                   mutant_mesh=mutant.names[-1], real_mutant_triangles=len(faces),
                                   named_cell_failures=wrong, LAW_slit_CONTROLS=scores(mutant, kernel, model),
                                   fired=len(wrong) == len(front)))
        xy = np.asarray([r['xy'] for r in front])
        lo, hi = xy.min(0) - 1 / law.PPM, xy.max(0) + 1 / law.PPM
        quad = np.asarray([[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]]) + candidate.origin['corner']
        # ORDER-ROX-A4-FIX4 item 3: the refuter's renamed +42.5 sheet.
        mutant = extend(candidate, np.c_[quad, np.full(4, law.BED + 42.5)],
                        np.asarray([[0, 1, 2], [0, 2, 3]]), 'dm-pocket-rox-corner-pxpz-cap-cover')
        wrong = front_wrong(mutant, front, source_z, source_ids)
        result['arms'].append(dict(name='UPPER_SOURCE_FRONT', detector='HEIGHT',
                                   mutant_mesh=mutant.names[-1], cover_z_mm=42.5, real_mutant_triangles=2,
                                   named_cell_failures=wrong, LAW_slit_CONTROLS=scores(mutant, kernel, model),
                                   fired=len(wrong) == len(front)))
    result['ok'] = not failures(rows) and not unsupported and all(a['fired'] for a in result['arms'])
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / 'lower-ownership-rox.json').write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
    print('MODEL OWNERS reproduced:', len(lower), result['lower_class_counts'])
    print('FIX5 exact owner matches:', result['lower_exact_matches'], '; rubber is row (a) domain')
    print('MODEL lower height ceilings:', json.dumps(ceilings, sort_keys=True))
    print('NO_RETURN_COVER PK-03 height ceiling:', pan_top_mm, '; no mesh-name exemption')
    print('UPPER_SOURCE_FRONT positive unsupported high cells:', len(unsupported))
    print('FIX5 LAW/slit:', json.dumps(result['area_controls']))
    for arm in result['arms']:
        print(arm['name'], arm.get('direction', arm.get('cover_z_mm', '')), 'FIRED' if arm['fired'] else 'FAILED',
              'ownership/upper cells', len(arm['named_cell_failures']), 'CONTROLS', json.dumps(arm['LAW_slit_CONTROLS']))
        if arm.get('mutant_mesh'):
            print(' ', arm['detector'], arm['mutant_mesh'])
        if arm['name'] in ('SYMMETRIC_LOWER', 'LOWER_SOURCE_HEIGHT'):
            print(arm['refusal'])
            for cell in arm['named_cell_failures']:
                print(' ', json.dumps(cell, sort_keys=True))
    for cell in failures(rows):
        print('POSITIVE OWNERSHIP_REFUSED:', json.dumps(cell, sort_keys=True))
    print('LOWER OWNERSHIP GATE', 'OK' if result['ok'] else 'RED')
    return 0 if result['ok'] or not args.judge else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('dump', 'fix1', 'lower-cells', 'front-cells', 'out'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--cache', type=Path, default=Path('/tmp/ox-a2/align/cache'))
    parser.add_argument('--redarm', action='store_true')
    parser.add_argument('--judge', action='store_true')
    args = parser.parse_args()
    return run(args)


if __name__ == '__main__':
    raise SystemExit(main())
