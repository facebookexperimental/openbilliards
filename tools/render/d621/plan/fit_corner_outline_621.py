#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""C7: dimension the purchased PLAN outlines, without exporting purchased meshes.

Sections are in model millimetres, Z up, bed Z=770. A support-line selection
separates the OUTER 45-degree facet from the similar inner face. TLS residuals
and four independent corners accompany every dimension. TurboSmooth is NOT
applied: C7's explicit cross-check ruling accepts these straight PLAN dimensions
as MODEL; junction radii remain TESSELLATION estimates, never limit-surface reads.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from scipy.spatial import ConvexHull

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "align"))
import objlib
sys.path.insert(0, str(HERE))
import planlib_621 as pl

BED = 770.0  # MODEL datum, not a fitted registration.
BLOCKS = ((1, 1, "pool_kant06"), (1, -1, "pool_kant08"),
          (-1, 1, "pool_kant03"), (-1, -1, "pool_kant01"))
CAP_Z = (770.001, 772, 775, 780, 785, 790, 795.136, 800, 803, 805, 808, 810, 812)
BAND_Z = (637.226, 640, 645, 670, 700, 730, 760, 766, 768, 769, 770)
FRAME_Z = (645, 670, 700, 730, 760, 766, 770)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def tls(points):
    """Orthogonal line fit; report the finite sampled interval as well as RMS."""
    p = np.asarray(points, float)
    centre = p.mean(axis=0)
    _, _, vh = np.linalg.svd(p - centre, full_matrices=False)
    tangent = vh[0]
    if tangent[0] < 0:
        tangent = -tangent
    normal = np.array([-tangent[1], tangent[0]])
    errors = (p - centre) @ normal
    t = (p - centre) @ tangent
    return dict(n=len(p), normal=normal.tolist(), intercept_mm=float(centre @ normal),
                angle_deg=float(np.degrees(np.arctan2(tangent[1], tangent[0]))),
                span_mm=float(t.max() - t.min()),
                rms_mm=float(np.sqrt(np.mean(errors ** 2))), max_mm=float(abs(errors).max()))


def points_at(nodes, names, z, sx, sy):
    segments = [objlib.section(nodes[name]["V"], nodes[name]["F"], 2, z) for name in names]
    p = np.concatenate(segments).reshape(-1, 3)[:, :2] * [sx, sy]
    # MODEL: the measured cap/boot furniture lies outside the nose intersection.
    # This crop selects one corner; it does not choose a favourable face.
    return np.unique(p[(p[:, 0] > 1152) & (p[:, 1] > 576)], axis=0)


def outline(p):
    X, Y = p.max(axis=0)
    support = p.sum(axis=1).max()
    # TESSELLATION: OBJ coordinates have 0.001 mm precision. The 0.005 mm
    # support band includes rounding noise, not the recessed inner 45° face.
    face = p[p.sum(axis=1) >= support - .005]
    fit = tls(face)
    h = p[ConvexHull(p).vertices]
    out = dict(outer_x_mm=float(X), outer_y_mm=float(Y),
               virtual_chamfer_leg_mm=float(X + Y - support),
               facet=fit)
    axis = h[np.abs(h[:, 0] - X) < .002]
    end = axis[np.argmax(axis[:, 1])]
    a = face[np.argmax(face[:, 0])]
    out.update(axis_setback_mm=float(Y - end[1]), shoulder_inset_mm=float(X - a[0]),
               facet_leg_mm=float((face[:, 0].max() - face[:, 0].min()
                                  + face[:, 1].max() - face[:, 1].min()) / 2))
    return out, h


def bevel_chords(h):
    """TESSELLATION: short cage loop edges between axis/22.5°/45° faces."""
    q = np.roll(h, -1, axis=0) - h
    lens = np.linalg.norm(q, axis=1)
    ang = np.degrees(np.arctan2(abs(q[:, 0]), abs(q[:, 1])))
    support = h.sum(axis=1).max()
    return [float(lens[i]) for i in range(len(h))
            if .05 < lens[i] < 1.5 and 10 < ang[i] < 80
            and min(h[i].sum(), h[(i + 1) % len(h)].sum()) > support - 6]


def measure(qdir):
    nodes = objlib.load_all(str(qdir))
    rails = [f"pool_kant{i:02}" for i in (2, 4, 5, 7, 9, 10)]
    ext = np.max(np.vstack([abs(nodes[n]["V"][:, :2]) for n in rails]), axis=0)
    records, loops, joints = [], [], []
    for sx, sy, block in BLOCKS:
        for z in CAP_Z:
            bp = points_at(nodes, [block], z, sx, sy)
            rp = points_at(nodes, rails, z, sx, sy)
            b, hull = outline(bp)
            if z == 800:
                edges = np.roll(hull, -1, axis=0) - hull
                for e in edges:
                    angle = np.degrees(np.arctan2(abs(e[1]), abs(e[0])))
                    if np.linalg.norm(e) > 20 and (20 < angle < 25 or 65 < angle < 70):
                        joints.append(float(min(angle, 90-angle)))
            X, Y = rp.max(axis=0)
            rx = rp[abs(rp[:, 0] - X) < .002]
            ry = rp[abs(rp[:, 1] - Y) < .002]
            rail_end = float(((Y - rx[:, 1].max()) + (X - ry[:, 0].max())) / 2)
            records.append(dict(family="cap", corner=[sx, sy], source=block, z_mm=z,
                above_bed_mm=z-BED, **b,
                rail_outer_inset_mm=float(np.mean(ext - [X, Y])),
                block_inset_from_rail_mm=float(np.mean([X-b["outer_x_mm"], Y-b["outer_y_mm"]])),
                rail_end_setback_mm=rail_end))
        for family, names in (("frame", ["pool_kant_support"]),
                              ("apron", ["pool_kant_side01", "pool_kant_side02"])):
            for z in (FRAME_Z if family == "frame" else BAND_Z):
                p = points_at(nodes, names, z, sx, sy)
                if len(p) < 3:
                    continue
                b, h = outline(p)
                row = dict(family=family, corner=[sx, sy], source=names,
                    z_mm=z, above_bed_mm=z-BED, **b,
                    outer_inset_from_cap_mm=float(np.mean(ext-[b["outer_x_mm"], b["outer_y_mm"]])))
                if family == "frame":
                    m = nodes[names[0]]
                    sections = pl.loops(objlib.section(m["V"], m["F"], 2, z)[:, :, :2], .005)
                    if len(sections) != 2 or not all(closed for _, closed in sections):
                        raise ValueError(f"frame {z}: expected its two closed boundary loops")
                    inner = min((points for points, _ in sections), key=lambda a: abs(a).max(axis=0).prod())
                    inner = inner * [sx, sy]
                    inner = inner[(inner[:, 0] > 1152) & (inner[:, 1] > 576)]
                    ib, _ = outline(inner)
                    row["inner"] = dict(**ib, outer_inset_from_cap_mm=float(np.mean(ext-[ib["outer_x_mm"], ib["outer_y_mm"]])))
                records.append(row)
                if family == "apron" and z in (700, 760):
                    loops.extend(bevel_chords(h))
    # Four corners and both levels carry several triangulation subdivisions of
    # each control-loop edge. Keep the physical ~0.7 mm chord class, not those
    # shorter subdivisions, using a length-weighted median over the raw edges.
    chords = np.asarray(loops)
    chord = float(np.median(chords[chords > .5]))
    radius = chord / (2 * np.sin(np.radians(22.5) / 2))  # TESSELLATION: circular-envelope estimate.
    wanted = set(rails + [b[2] for b in BLOCKS] +
                 ["pool_kant_support", "pool_kant_side01", "pool_kant_side02"])
    return dict(schema="d621-corner-outline-fit/1", tag="DERIVED",
        method="Horizontal triangle sections, fixed model datum, outward support line then TLS; no ICP, scale or circle fit for the chamfer.",
        source=dict(obj_files=[dict(name=n, file=Path(nodes[n]["path"]).name,
                                   sha256=sha(nodes[n]["path"])) for n in sorted(wanted)],
                    units="mm", up="Z", bed_z_mm=BED,
                    cap_outer_half_extents_mm=ext.tolist(),
                    modifier_status="TurboSmooth unapplied on caps. C7 CROSS-CHECK accepts the straight PLAN dimensions; radii are estimates."),
        records=records, joint_angle=dict(tag="MODEL", value_deg=float(np.median(joints)),
            range_deg=[min(joints), max(joints)], n=len(joints),
            method="Directions of the two long block-joint section edges at Z=800, four corners; acute angle to the transverse axis."),
        junction_round=dict(tag="TESSELLATION", radius_mm=round(radius, 2),
            raw_estimate_mm=radius, cage_chord_median_mm=chord,
            cage_chord_range_mm=[float(chords.min()), float(chords.max())], n=len(chords),
            turning_angle_deg=22.5,
            method="R = median complete bevel-loop chord / (2 sin(turn/2)). EST circular finish envelope from apron loops, transferred to cap junctions. Not decoded TurboSmooth, not a measured smooth radius.",
            caveat="The cap junctions themselves are sharp in the cage. This small round is TESSELLATION/EST, not MODEL."))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--model-obj-dir", default="/tmp/ob-3dm-quarantine/diamond-proam-8ft/obj")
    p.add_argument("--out", type=Path, required=True)
    a = p.parse_args()
    result = measure(a.model_obj_dir)
    result["instrument_sha256"] = sha(__file__)
    a.out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(dict(out=str(a.out), rows=len(result["records"]), round=result["junction_round"])))


if __name__ == "__main__":
    main()
