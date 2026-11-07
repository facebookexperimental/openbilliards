# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Measure Star locally and derive the first Q8Pro corner section.

Purchased surfaces stay in quarantine. Outputs are measurement polylines,
analytic construction inputs and private drawings, never imported assets.
"""
from pathlib import Path
import argparse
import collections
import hashlib
import heapq
import json
import re

import numpy as np

from measure_xingpai import SOURCE, load_material_meshes, obj, sections

ART = Path.home() / 'ob-artifacts/astra-cn8'
ROOT = Path(__file__).resolve().parents[3]
PACK = ART / 'phase2-d2/seal-1'
FBX_SHA = '80dc70e0991d832bba48c88786b285e2255e8df865882074a146feb7f4f360cc'


def ordered_section(segments, bridge=False):
    # TESSELLATION: 0.001 mm endpoint weld; not a physical clearance.
    points, keys, edges = [], {}, set()
    for segment in segments:
        ids = []
        for p in segment:
            key = tuple(np.round(p, 3))
            if key not in keys:
                keys[key] = len(points)
                points.append(p)
            ids.append(keys[key])
        if ids[0] != ids[1]:
            edges.add(tuple(sorted(ids)))
    points = np.asarray(points)
    adj = collections.defaultdict(list)
    for i, j in edges:
        adj[i].append(j)
        adj[j].append(i)
    ends = [i for i, v in adj.items() if len(v) == 1]
    repairs = []
    if bridge and len(ends) == 4:
        a, b = min(((a, b) for a in ends for b in ends if a < b),
                   key=lambda ij: np.linalg.norm(points[ij[0]]-points[ij[1]]))
        repairs.append({'endpoints_mm': points[[a, b]].tolist(),
                        'length_mm': float(np.linalg.norm(points[a]-points[b])),
                        'tag': 'EST',
                        'reason': 'Straight continuation across the source material gap; no hidden detail inferred.'})
        adj[a].append(b)
        adj[b].append(a)
        ends = [i for i, v in adj.items() if len(v) == 1]
    if len(ends) != 2:
        raise ValueError(f'Expected two open-section ends, got {len(ends)}')
    start, finish = sorted(ends, key=lambda i: points[i, 0])
    queue, distances, previous = [(0, start)], {start: 0}, {}
    while queue:
        distance, i = heapq.heappop(queue)
        if i == finish:
            break
        if distance > distances[i]:
            continue
        for j in adj[i]:
            candidate = distance + np.linalg.norm(points[j]-points[i])
            if candidate < distances.get(j, float('inf')):
                distances[j], previous[j] = candidate, i
                heapq.heappush(queue, (candidate, j))
    route = [finish]
    while route[-1] != start:
        route.append(previous[route[-1]])
    return points[route[::-1]], repairs


def simplify(points, tolerance=0.03):
    # TESSELLATION: bounded section-polyline simplification, mm.
    if len(points) < 3:
        return points
    chord = points[-1] - points[0]
    delta = points - points[0]
    distance = abs(chord[0]*delta[:, 1]-chord[1]*delta[:, 0])/np.linalg.norm(chord)
    i = int(np.argmax(distance))
    if distance[i] <= tolerance:
        return points[[0, -1]]
    return np.vstack([simplify(points[:i+1], tolerance)[:-1],
                      simplify(points[i:], tolerance)])


def landmark_parameter(profile):
    # Feature correspondence uses measured extrema, not invented stations.
    # TESSELLATION: 30 mm classifies the upper roll between the measured
    # 29.6 mm side station and 38.9 mm crown; it does not move either point.
    inner = int(np.argmin(profile[:, 0]))
    crown = int(np.argmax(profile[:, 1]))
    outer = crown + int(np.argmax(profile[crown:, 0] * (profile[crown:, 1] > 30)))
    waist_candidates = np.where((np.arange(len(profile)) > outer)
                                & (profile[:, 1] < 0))[0]
    waist = int(waist_candidates[np.argmin(profile[waist_candidates, 0])])
    anchors = [0, inner, crown, outer, waist, len(profile)-1]
    if not all(a < b for a, b in zip(anchors, anchors[1:])):
        raise ValueError(f'Non-monotone section landmarks: {anchors}')
    parameter = np.zeros(len(profile))
    for leg, (a, b) in enumerate(zip(anchors, anchors[1:])):
        length = np.r_[0, np.cumsum(np.linalg.norm(np.diff(profile[a:b+1], axis=0), axis=1))]
        parameter[a:b+1] = leg + length/length[-1]
    return parameter, anchors


def derive():
    fbx = SOURCE / 'src/SNOOKER+TABLE+CGTRADER.fbx'
    if hashlib.sha256(fbx.read_bytes()).hexdigest() != FBX_SHA:
        raise ValueError('Purchased source digest mismatch')
    datum_block = (ROOT / 'web/scene/table.js').read_text().split('const CN8_R82 = {', 1)[1].split('\n};', 1)[0]
    rail_top_mm = float(re.search(r'\bDECK:\s*([0-9.]+)', datum_block).group(1)) * 1000
    meshes, version = load_material_meshes()
    mesh = next(m for m in meshes if m['object'] == 'Plane.065' and m['material'] == 'Leather')
    bed, _ = obj(SOURCE / 'obj/Snooker_table_bed.002__402294236.obj')
    bed_z = float(bed[:, 2].max())
    bed_center = float((bed[:, 0].min()+bed[:, 0].max())/2)
    v = mesh['v'].copy()
    v[:, 0] -= bed_center + 1780  # MODEL(Star): measured snooker nose half-length.
    v[:, 1] -= 890  # MODEL(Star): measured snooker nose half-width.
    v[:, 2] -= bed_z
    diagonal = v.copy()
    diagonal[:, 0] = (v[:, 0]-v[:, 1])/np.sqrt(2)
    diagonal[:, 1] = (v[:, 0]+v[:, 1])/np.sqrt(2)
    central_raw, _ = ordered_section(sections(diagonal, mesh['f'], 0, 0.00013)[:, :, 1:])
    terminal_raw, repairs = ordered_section(sections(v, mesh['f'], 1, 0.00013)[:, :, [0, 2]], True)
    central, terminal = simplify(central_raw), simplify(terminal_raw)
    gauge = float(abs(central[0, 0]-central[1, 0]))
    # EST: the central measured hem return supplies the terminal return
    # and shell gauge. The source is an open surface, not a thickness scan.
    terminal = np.vstack([terminal[0] + [gauge, 0], terminal])
    cp, ca = landmark_parameter(central)
    ep, ea = landmark_parameter(terminal)
    knots = np.unique(np.r_[cp, ep])
    # Include every source-polyline knot on both loft sections.
    cc = np.column_stack([np.interp(knots, cp, central[:, k]) for k in range(2)])
    ee = np.column_stack([np.interp(knots, ep, terminal[:, k]) for k in range(2)])
    prior = json.loads((ART / 'phase2-d2/measurements/pro-camera-identifiability.json').read_text())
    camera = json.loads((ART / 'phase2-d2/measurements/pro-post-calibration-eligibility.json').read_text())
    intr = camera['best_fixed_plan_sample']['intrinsics_in_detail_crop_px']
    K = np.array([[intr['f'], 0, intr['cx']], [0, intr['f'], intr['cy']], [0, 0, 1]])
    H = np.asarray(prior['homography'])
    nh = np.linalg.solve(K, H)
    scale = 2/(np.linalg.norm(nh[:, 0])+np.linalg.norm(nh[:, 1]))
    r1, r2, t = nh[:, 0]*scale, nh[:, 1]*scale, nh[:, 2]*scale
    projection = K @ np.column_stack([r1, r2, np.cross(r1, r2), t])
    crop_registration = np.array([[0.5448321324189892, 0.0000012713969900895874, 767.0208924824552],
                                  [-0.0000012713969900895874, 0.5448321324189892, 73.7571400358058],
                                  [0, 0, 1]])
    projection = np.linalg.solve(crop_registration, projection)
    outer_corner = 3.5 + 136.5/np.sqrt(2)  # DERIVED: retained owner envelope.
    q = projection @ [2680+outer_corner, 140-outer_corner, 0, 1]
    dq = projection[:, 2]
    pixels_per_mm = float(np.linalg.norm((dq[:2]*q[2]-q[:2]*dq[2])/q[2]**2))
    photo = json.loads((PACK / 'measurements/pro-photo-inputs.json').read_text())
    register = json.loads((ROOT / 'docs/geometry/cn8-pocket-d2-reference-register.json').read_text())
    edition = next(row for row in register['sources'] if row['id'] == register['active_pro_strip_edition'])
    if photo['source_sha256'] != edition['sha256']:
        raise ValueError('Photo reads do not belong to the single active Pro strip edition')
    crest = np.asarray(photo['points_px']['crest'])
    hem = np.asarray(photo['points_px']['hem'])
    drop = float(np.linalg.norm(hem-crest)/pixels_per_mm)
    source_top = float(central[:, 1].max())
    source_drop = source_top-float(central[:, 1].min())
    vertical_scale = drop/source_drop
    sections_out = {}
    for name, raw, samples, anchors in [('central', central, cc, ca), ('terminal', terminal, ee, ea)]:
        lo, hi = raw[:, 0].min(), raw[:, 0].max()
        sections_out[name] = {
            'source_tag': 'MODEL(Star), cross-model',
            'source_profile_mm': raw.tolist(),
            'source_profile_point_tags': ['EST' if name == 'terminal' and i == 0
                                          else 'MODEL(Star), cross-model' for i in range(len(raw))],
            'source_profile_est_note': ('Point 0 extends the measured terminal hem by the measured central return; '
                                        'it is the explicitly estimated terminal fold, not a measured terminal vertex.'
                                        if name == 'terminal' else None),
            'feature_indices': anchors,
            'source_radial_range_mm': [float(lo), float(hi)],
            'source_profile_is_open': True,
            'loft_profile': [[float((x-lo)/(hi-lo)), float((z-source_top)*vertical_scale)] for x, z in samples],
            'loft_profile_units': '[fraction of source section width, mm relative to retained rail top]',
            'loft_profile_tag': 'EST height transfer; derived from MODEL(Star) sections, PHOTO pixel reads and an EST camera; MFR/owner plan retained',
        }
    rgb = photo['working_srgb']
    definition = {
        'schema': 'ob-cn8-d2-section/1',
        'status': 'D2 first prototype; authorized order 3 source hierarchy',
        'source': {'file': fbx.name, 'sha256': FBX_SHA, 'object': 'Plane.065', 'material': 'Leather',
                   'identity': 'Purchased Star/XingPai snooker model; cross-model construction prototype',
                   'fbx_version': version, 'topology_check': 'Every FBX fan triangle and material assignment matched intake OBJ'},
        'derivation': {'recipe': 'tools/render/ghcn8/derive_d2_section.py',
                       'recipe_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                       'reader': 'tools/render/ghcn8/measure_xingpai.py',
                       'reader_sha256': hashlib.sha256((Path(__file__).parent / 'measure_xingpai.py').read_bytes()).hexdigest(),
                       'boundary': 'Measurement-density 2D plane-cut sections under MODEL provenance, with individually marked EST additions. No raw mesh vertex/index arrays, dense point clouds or images.'},
        'reference_register': {'file': 'docs/geometry/cn8-pocket-d2-reference-register.json',
                               'active_edition': edition['id'], 'source_sha256': edition['sha256']},
        'sections': sections_out,
        'profile_parameters': knots.tolist(),
        'profile_parameter_meaning': 'Measured feature arclength: 0 inner hem, 1 inner minimum, 2 inner crown, 3 outer crown, 4 waist, 5 outer hem.',
        'parameters': {
            'rail_top_mm': {'value': rail_top_mm, 'tag': 'DERIVED', 'basis': 'CN8_R82.DECK in web/scene/table.js, converted from metres to millimetres. Retained interface, not a newly measured Q8Pro local dimension.'},
            'source_rail_top_mm': {'value': source_top, 'tag': 'MODEL(Star), cross-model', 'basis': 'Plane.065 crown; Plane.063 rail agrees within 0.001 mm.'},
            'source_drop_mm': {'value': source_drop, 'tag': 'MODEL(Star), cross-model', 'basis': 'Measured central source section maximum to outer hem.'},
            'central_hem_return_mm': {'value': gauge, 'tag': 'MODEL(Star), cross-model', 'basis': 'Horizontal return at the source inner hem.'},
            'shell_gauge_mm': {'value': gauge/2, 'tag': 'EST', 'basis': 'Treat the measured Star return as a folded two-layer hem: one layer is half its measured width. The full-return-as-one-layer trial self-intersected at the folded end; the source provides no volumetric thickness. A cut-edge caliper section would resolve this assumption.'},
            'hem_layers': {'value': 2, 'tag': 'EST', 'basis': 'Folded-return construction assumption; the measured return width itself is unchanged.'},
            'photo_drop_mm': {'value': drop, 'tag': 'EST', 'basis': 'PHOTO crest-to-hem pixel read divided by the EST orthogonal-rail/post camera sensitivity; weakest-link tag.',
                              'depends_on': ['photo_camera', 'PHOTO-height-read'],
                              'read_only_uncertainty_mm': float(8/pixels_per_mm),
                              'uncertainty': 'Read bound uses +/-4 native px at each endpoint. Camera/plane correspondence and same-station identification remain EST; this is not a manufacturer tolerance or full confidence interval.'},
            'height_scale': {'value': vertical_scale, 'tag': 'EST', 'basis': 'photo_drop_mm / source_drop_mm; inherits the EST camera scale.',
                             'depends_on': ['photo_drop_mm', 'source_drop_mm'],
                             'read_only_uncertainty': float(8/pixels_per_mm/source_drop),
                             'uncertainty': 'Read-noise bound only; unquantified EST camera scale is additional.'},
            'photo_stitch_drop_mm': {'value': float(np.linalg.norm(np.asarray(photo['points_px']['stitch'])-crest)/pixels_per_mm), 'tag': 'EST', 'basis': 'PHOTO stitch-to-crest pixel read divided by the same EST camera sensitivity.',
                                    'depends_on': ['photo_camera', 'PHOTO-height-read'],
                                    'read_only_uncertainty_mm': float(8/pixels_per_mm),
                                    'uncertainty': 'Read-noise bound only (+/-4 native px per endpoint); unquantified EST camera scale is additional.'},
            'brown_srgb': {'value': rgb, 'tag': 'PHOTO', 'basis': 'Mean of two official-image ROI medians; observed pixels only.'},
            'brown_albedo_hex': {'value': ''.join(f'{n:02x}' for n in rgb), 'tag': 'EST',
                                 'basis': 'Working brown suggested by the two ROI medians in the fresh official-page-linked Q8Pro sheet (M-PRO, e9adcee19a7848dd6397654641029bf829112e3490c032b0dd1c31a3a9d33ca3). No numerical reflectance from photos. Retain existing roughness and micro-grain.',
                                 'uncertainty': 'Lighting, exposure, white balance, compression and surface response are uncalibrated; no numerical reflectance interval is established.',
                                 'resolving_evidence': 'Official JOY Q8Pro material/reflectance data takes precedence when available; otherwise a calibrated measurement of the same brown cover under known lighting.'},
            'section_interpolation': {'value': 'linear across corresponding measured feature/arclength stations; smoothstep central-to-terminal mix on analytic limbs', 'tag': 'EST', 'basis': 'No intermediate Q8Pro section exists. An intermediate cut/scan would resolve this transfer.'},
            'plan_span_mapping': {'value': 'Preserve MODEL local radial dimensions on both bent sides; put the MFR/owner span difference into the measured near-flat crown span between feature parameters 2 and 3.', 'tag': 'DERIVED', 'basis': 'Official table dimensions change the rail span, not the local roll, waist or fold gauge. Uniform radial scaling would multiply an uncorrected local model dimension.'},
            'terminal_fold': {'value': 'central measured return reused at terminal inner hem', 'tag': 'EST', 'basis': 'Source terminal cut ends open; central source return supplies the end treatment.'},
            'profile_simplification_mm': {'value': 0.03, 'tag': 'TESSELLATION', 'basis': 'Maximum chord error on measured 2D polylines.'},
            'section_plane_offset_mm': {'value': 0.00013, 'tag': 'TESSELLATION', 'basis': 'Avoid coincident source triangle planes.'},
            'endpoint_weld_mm': {'value': 0.001, 'tag': 'TESSELLATION', 'basis': 'Join triangle-plane intersection endpoints.'},
        },
        'terminal_source_gap_repairs': repairs,
        'photo_camera': {'tag': 'EST', 'projection_hero_px': projection.tolist(),
                         'vertical_sensitivity_px_per_mm': pixels_per_mm,
                         'basis': 'Prior camera diagnostics; uniform pixels, orthogonal nominal outer rail rectangle and vertical post trims. Local image translation does not change the height derivative.',
                         'frame': 'official-pro-section-reads.png'},
        'protected_plan': {'tag': 'DERIVED / retained owner contract', 'c_mm': 3.5, 'mouth_radius_mm': 52.5, 'mouth_width_mm': 85,
                           'outer_rail_mm': 140, 'outer_arc_mm': 136.5, 'cut_mm': -40, 'back_arc_radius_mm': 45,
                           'official_correction': 'MFR JOY Q8Pro: (1540-1260)/2=140; (2820-2540)/2=140. Source snooker table size and corner center do not transfer.'},
        'deferred': 'D3 middle pocket, D4 bag/hardware/fall presentation, D5 legs; protected physics and sinkpivot are unchanged.',
    }
    return definition


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=PACK/'measurements/d2-section-definition.json')
    args = parser.parse_args()
    result = derive()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2)+'\n')
    print(args.out)
    print(json.dumps({k: result['parameters'][k] for k in ['source_drop_mm', 'shell_gauge_mm', 'photo_drop_mm', 'height_scale']}, indent=2))
