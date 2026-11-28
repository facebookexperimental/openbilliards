#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""FIX8: emitted liner/cushion junctions and 32 purchased-MODEL cushion sections.

Uses the full current scene dump, never constructor constants or fitted MODEL
registration. Source triangles stay in memory; outputs are measurements/plots.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

from evidence_deps_rox import require_evidence_deps
require_evidence_deps()

import numpy as np
from shapely.geometry import LineString
from shapely.ops import unary_union, nearest_points

import physical_rox
import objsoup

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'align'))
import thresholds

SLOTS = [('nxnz', 46554), ('pxnz', 46555), ('pxpz', 46557),
         ('nxpz', 46556), ('nz', 46558), ('pz', 46559)]
DEFINITION = HERE.parents[2] / 'docs/geometry/rasson-ox-9ft-table-definition.json'
# RC-29.fix8_sweep.junction_tolerance: retained FIX8 engineering allowance.
# EST, not a MODEL dimension or a derived sampling-error bound. Exact polyline
# contact is also checked with a zero-tolerance arm; the default is unchanged.
JUNCTION_TOL_MM = .6
JUNCTION_TOL_REASON = 'Retained FIX8 discretionary section-clearance allowance; no sampling-error derivation is claimed.'


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def triangles(dump):
    result = {}
    for mesh in dump['meshes']:
        name = mesh['name']
        if name in result:
            raise ValueError('SECTION_DUPLICATE_MESH: ' + name)
        p = np.asarray(mesh.get('raw_positions', mesh['positions'])).reshape(-1, 3)[:, [0, 2, 1]] * 1000
        f = np.asarray(mesh['indices'], dtype=int).reshape(-1, 3) if mesh['indices'] else np.arange(len(p)).reshape(-1, 3)
        result[name] = p[f]
    return result


def section(t, axis, value, coordinates):
    return objsoup.section(t, axis, value)[:, :, coordinates]


def lines(s):
    return unary_union([LineString(edge) for edge in s if np.linalg.norm(edge[1] - edge[0]) > 1e-8])


def samples(s, spacing=.1):
    return np.concatenate([np.linspace(a, b, max(2, int(np.ceil(np.linalg.norm(b - a) / spacing)) + 1)) for a, b in s])


def distances(points, segments):
    a = segments[:, 0]
    ab = segments[:, 1] - a
    squared = (ab * ab).sum(1)
    valid = squared > 1e-16
    a, ab, squared = a[valid], ab[valid], squared[valid]
    result = []
    for p in np.array_split(points, max(1, int(np.ceil(len(points) / 512)))):
        ap = p[:, None] - a
        t = np.clip((ap * ab).sum(2) / squared, 0, 1)
        result.extend(np.sqrt(((ap - t[:, :, None] * ab) ** 2).sum(2).min(1)))
    return np.asarray(result)


def stats(values):
    return dict(n=len(values), p50_mm=float(np.median(values)),
                p90_mm=float(np.percentile(values, 90)), max_mm=float(np.max(values)))


def face_hits(s, heights):
    a, b = s[:, 0], s[:, 1]
    dz = b[:, 1] - a[:, 1]
    result = []
    for z in heights:
        hit = (abs(dz) > 1e-10) & (np.minimum(a[:, 1], b[:, 1]) <= z) & (np.maximum(a[:, 1], b[:, 1]) >= z)
        x = a[hit, 0] + (z - a[hit, 1]) / dz[hit] * (b[hit, 0] - a[hit, 0])
        if not len(x):
            raise ValueError(f'SECTION_FACE_MISSING: bed+{z}')
        result.append([float(x.min()), float(z)])
    return np.asarray(result)


def circle(points):
    centre, _, rank, _ = np.linalg.lstsq(np.c_[2 * points, np.ones(len(points))], (points * points).sum(1), rcond=None)
    r = float(np.sqrt(max(0, centre[2] + (centre[:2] ** 2).sum())))
    errors = np.linalg.norm(points - centre[:2], axis=1) - r
    return dict(radius_mm=r, rms_mm=float(np.sqrt(np.mean(errors ** 2))), rank=int(rank), samples=len(points))


def cushion_key(t):
    p = t.reshape(-1, 3)
    along = int(np.argmax(np.ptp(p[:, :2], axis=0)))
    return along, int(np.sign(p[:, 1 - along].mean())), int(np.sign(p[:, along].mean())) if along == 0 else 0


def measure(dump, model, ids, definition, junction_tolerance_mm=JUNCTION_TOL_MM):
    if not np.isfinite(junction_tolerance_mm) or not 0 <= junction_tolerance_mm <= JUNCTION_TOL_MM:
        raise ValueError('SECTION_JUNCTION_TOLERANCE_REFUSED: only tightening the default is allowed')
    ours = triangles(dump)
    cushion_names = {f'dm-cushion-{i}' for i in range(6)}
    actual = {name for name in ours if name.startswith('dm-cushion-')}
    if actual != cushion_names:
        raise ValueError(f'SECTION_CUSHION_INVENTORY: removed={sorted(cushion_names-actual)} added={sorted(actual-cushion_names)}')
    cushions = {name: ours[name] for name in sorted(actual)}
    model_cushions = {cid: model[ids == cid] for cid in physical_rox.RUBBER}
    gaps, plots = [], []
    for tag, cid in SLOTS:
        kind, suffix = ('corner', 'cup-c') if len(tag) == 4 else ('side', 'cup-ring')
        name = f'dm-pocket-rox-{kind}-{tag}-{suffix}'
        if name not in ours:
            raise ValueError('SECTION_LINER_MISSING: ' + name)
        for z in [20, 28, 36]:
            row = dict(pocket=tag, height_mm=z)
            for label, ring, rubber in [('ours', ours[name], cushions), ('model', model[ids == cid], model_cushions)]:
                wall = lines(section(ring, 2, z, [0, 1]))
                candidates = []
                for key, t in rubber.items():
                    cheek = lines(section(t, 2, z, [0, 1]))
                    a, b = nearest_points(wall, cheek)
                    candidates.append(dict(cushion=key, gap_mm=float(wall.distance(cheek)),
                                           liner_xy_mm=list(a.coords)[0], cushion_xy_mm=list(b.coords)[0]))
                row[label] = sorted(candidates, key=lambda r: r['gap_mm'])[:2]
            row['passed'] = all(r['gap_mm'] <= junction_tolerance_mm for r in row['ours'])
            gaps.append(row)
        plots.append((tag, section(ours[name], 2, 20, [0, 1]),
                      [section(cushions[r['cushion']], 2, 20, [0, 1]) for r in gaps[-1]['ours']]))

    rows = {r['id']: r for r in definition['features']}
    cu9, cu12 = rows['CU-09']['value'], rows['CU-12']['value']
    radius, foot = cu9['tip_fillet_R_mm'], cu12['foot_fillet']
    h = dump['kernel']['noseHeightFrac'] * 57.15  # CU-02 x PF-02, never a fitted visual nose
    foot_z = .05 - (objsoup.BEDTOP - 785.8)  # CU-12 legacy bed -> true cloth plane
    limits = thresholds.table(thresholds.noise(log=lambda _: None))
    sections, profile_plots, all_distances = [], [], []
    keyed = {cushion_key(t): (name, t) for name, t in cushions.items()}
    if len(keyed) != 6:
        raise ValueError('SECTION_CUSHION_PLACEMENT: expected four long halves and two short rails')
    for cid, mt in model_cushions.items():
        along, side, half = cushion_key(mt)
        name, ot = keyed[along, side, half]
        count, across = (6 if along == 0 else 4), 1 - along
        for k in range(1, count + 1):
            fraction = k / (count + 1)
            ms = mt[:, :, along].min() + np.ptp(mt[:, :, along]) * fraction
            os = ot[:, :, along].min() + np.ptp(ot[:, :, along]) * fraction
            sm = section(mt, along, ms, [across, 2]); sm[:, :, 0] *= side
            sm[:, :, 0] -= sm[:, :, 0].min()  # source nose, independently measured
            so = section(ot, along, os, [across, 2]); so[:, :, 0] *= side
            so[:, :, 0] -= dump['kernel']['width' if along == 0 else 'length'] * 500
            om = distances(samples(so), sm); mo = distances(samples(sm), so)
            two_way = np.r_[om, mo]; all_distances.extend(two_way)
            tip_fit = circle(face_hits(so, np.arange(h - radius / 2, h + radius / 2, .02)))
            foot_fit = circle(face_hits(so, np.arange(foot_z, foot['starts_z_mm'], .02)))
            face = face_hits(so, np.arange(3, 33.65, .05))
            slope = np.polyfit(face[:, 1], face[:, 0], 1)[0]
            rake = float(np.degrees(np.arctan(-slope)))
            foot_u = float(face_hits(so, [foot_z])[0, 0])
            quant = float(np.spacing(np.float32(abs(ot).max() / 1000)) * 1000)
            rake_tolerance = cu12['straightness']['rake_spread_deg'] + np.degrees(np.arctan(2 * quant / (33.65 - 3)))
            checks = dict(profile_p90=stats(two_way)['p90_mm'] <= limits['cushion_long' if along == 0 else 'cushion_short']['p90'],
                          nose_radius=abs(tip_fit['radius_mm'] - radius) <= cu9['tip_fit']['rms'] and tip_fit['rank'] == 3,
                          foot_radius=abs(foot_fit['radius_mm'] - foot['R_mm']) <= foot['fit_rms'] and foot_fit['rank'] == 3,
                          foot_witness=abs(foot_u - foot['ends_at_bed_du_mm']) <= .001 + 2 * quant,
                          face_rake=abs(rake - cu12['rake_deg_from_vertical']) <= rake_tolerance)
            checks = {key: bool(value) for key, value in checks.items()}
            record = dict(mesh=name, model_component=cid, station_fraction=fraction, model_station_mm=float(ms),
                          ours_station_mm=float(os), ours_to_model=stats(om), model_to_ours=stats(mo), two_way=stats(two_way),
                          nose=tip_fit, foot=foot_fit, foot_witness_u_mm=foot_u, rake_deg=rake,
                          rake_tolerance_deg=float(rake_tolerance), checks=checks, passed=all(checks.values()))
            sections.append(record)
            if k == count // 2:
                profile_plots.append((name, sm, so))
    if len(sections) != 32 or {r['mesh'] for r in sections} != cushion_names:
        raise ValueError('SECTION_STATION_CENSUS: expected 32 stations over all six cushions')
    return dict(junctions=gaps, sections=sections, section_summary=stats(all_distances),
                junction_tolerance=dict(value_mm=junction_tolerance_mm,
                                        source_tag='EST' if junction_tolerance_mm == JUNCTION_TOL_MM else 'ARM',
                                        default_mm=JUNCTION_TOL_MM, reason=JUNCTION_TOL_REASON),
                junction_max_mm=max(r['gap_mm'] for g in gaps for r in g['ours']),
                failed_pockets=sorted({g['pocket'] for g in gaps if not g['passed']}),
                section_failed_stations=sum(not s['passed'] for s in sections),
                passed=all(g['passed'] for g in gaps) and all(s['passed'] for s in sections)), plots, profile_plots


def draw(out, pockets, profiles):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.collections import LineCollection
    for filename, collection in [('junctions.png', pockets), ('cushion-sections.png', profiles)]:
        fig, axes = plt.subplots(2, 3, figsize=(15, 9))
        for ax, (name, a, b) in zip(axes.flat, collection):
            if filename == 'junctions.png':
                centre = a.mean((0, 1)); a = a - centre
                b = np.concatenate(b) - centre
                b = b[(abs(b).max((1, 2)) < 150)]
                labels = ['Emitted liner', 'Emitted cushions']; colors = ['#225eaa', '#b45f2b']
            else:
                labels = ['Purchased MODEL', 'Emitted cushion']; colors = ['#b45f2b', '#225eaa']
            for s, color, label in zip([a, b], colors, labels):
                ax.add_collection(LineCollection(s, colors=color, linewidths=1, label=label))
            ax.autoscale(); ax.set_aspect('equal'); ax.grid(alpha=.2); ax.legend(fontsize=8)
            ax.set_title(name); ax.set_xlabel('Offset (mm)'); ax.set_ylabel('Offset / true-bed height (mm)')
        fig.tight_layout(); fig.savefig(out / filename, dpi=160); plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dump', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--cache', default='/tmp/ox-a2/align/cache')
    parser.add_argument('--definition', type=Path, default=DEFINITION)
    parser.add_argument('--junction-tolerance-mm', type=float, default=JUNCTION_TOL_MM,
                        help='Tighten the EST junction allowance (0 runs the exact-contact arm)')
    parser.add_argument('--judge', action='store_true')
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=False)
    dump = json.loads(args.dump.read_text())
    if not dump.get('attribute_gate', {}).get('passed') or dump.get('meshCount') != len(dump['meshes']):
        raise ValueError('SECTION_SCENE_REFUSED: valid current full-scene attribute census required')
    v, _, f, ids, metadata = physical_rox.load(args.cache)
    model = v[f]; model[:, :, 2] -= objsoup.BEDTOP
    result, pockets, profiles = measure(dump, model, ids, json.loads(args.definition.read_text()),
                                       args.junction_tolerance_mm)
    result.update(dump=str(args.dump.resolve()), dump_sha256=digest(args.dump), source=metadata,
                  renderer_sha256=dump['source_sha256'], definition_sha256=digest(args.definition),
                  instrument_sha256=digest(__file__),
                  protocol='36 actual liner/cushion clearances at bed+20/28/36; 32 transverse stations at matching rail fractions; MODEL nose and true bed registered independently; bidirectional segment distances at 0.1 mm spacing; emitted nose/foot circle fits and CU-12 rake/foot witness; existing align p90 threshold unchanged')
    (args.out / 'sections.json').write_text(json.dumps(result, indent=2) + '\n')
    draw(args.out, pockets, profiles)
    print(json.dumps({k: result[k] for k in ['passed', 'junction_tolerance', 'junction_max_mm', 'failed_pockets', 'section_summary', 'section_failed_stations']}, indent=2))
    if args.judge and not result['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
