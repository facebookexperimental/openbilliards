#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""C9 A1/A3/A6: cushion vertices against each cover's finite inner opening.

Read the purchased OBJ only in memory. Write numeric measurements and PNG
sections outside the repository. Requires the optional evidence dependencies
in README.md; a missing or unclosed section is an error, never a zero metric.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import shapely
from shapely.geometry import LineString, Polygon

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.path.insert(0, str(HERE.parent / "align"))
import common
import objlib
import planlib_621 as pl
from corner_overlay_621 import GRID, dump_path, polygons, section
from cushion_end_source_621 import MODEL_MAX, MODEL_SET, end_section
from plan_gate_621 import model_obj_set_sha256

SIZES = ("9ft", "8ft", "7ft")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def inner_opening(mesh, z, frame):
    """The U's inner path, closed only across its two measured arm tips.

    Select the front rail-depth minimum on each leg using the standing PLAN
    gate's 1 mm arm-edge band. Of the two paths connecting those tips, the
    inner path has the smaller outboard maximum. Its front chord bounds the
    finite opening; cushion inboard of both arm tips is not an exposed fin.
    No nominal cover width, accepted result or trim leaf selects the path.
    """
    pieces = polygons(section([mesh], z))
    if len(pieces) != 1:
        raise ValueError(f"unresolved cover section {mesh['name']} at {z}: {len(pieces)} pieces")
    q = frame.to(np.asarray(pieces[0].exterior.coords)[:-1])
    indices = []
    for sign in (-1, 1):
        depth = frame.depth(q, sign)
        leg = sign*q[:, 1] > 0
        if frame.kind == "corner":
            leg &= q[:, 0] < (q[:, 0].max()+q[:, 0].min())/2
        if not leg.any():
            raise ValueError("missing cover arm")
        closest = depth[leg].min()
        candidates = np.flatnonzero(leg & (depth < closest+1.))
        indices.append(int(candidates[np.argmin(np.abs(q[candidates, 1]))]))
    a, b = sorted(indices)
    paths = [q[a:b+1], np.vstack([q[b:], q[:a+1]])]
    chain = min(paths, key=lambda points: points[:, 0].max())
    opening = Polygon(chain)
    if not opening.is_valid or opening.area <= 0:
        raise ValueError("unresolved finite inner opening")
    inner = LineString(chain)
    axis = inner.intersection(LineString([(-1000, 0), (1000, 0)]))
    # DERIVED: the axis intersects the inner arch, not the closing chord.
    axis_points = shapely.get_coordinates(axis)
    return opening, dict(tips_uw_mm=q[indices].tolist(), area_mm2=opening.area,
        inner_curve_length_mm=inner.length,
        arch_axis_u_mm=float(axis_points[:, 0].max()) if len(axis_points) else None,
        inner_halfwidth_mm=float(np.abs(chain[:, 1]).max()))


def signed_distance(opening, points):
    points = shapely.points(np.asarray(points))
    return np.where(shapely.covers(opening, points), 1., -1.) * shapely.distance(points, opening.boundary)


def vertical_span(mesh, xy):
    """Exact barycentric intersection of a vertical line with every triangle."""
    tri = mesh["V"][mesh["F"]]
    a = tri[:, 0, :2]
    v, w = tri[:, 1, :2]-a, tri[:, 2, :2]-a
    det = v[:, 0]*w[:, 1]-v[:, 1]*w[:, 0]
    keep = np.abs(det) > 1e-12  # TESSELLATION: degenerate projected triangles.
    tri, a, v, w, det = tri[keep], a[keep], v[keep], w[keep], det[keep]
    q = np.asarray(xy)-a
    u = (q[:, 0]*w[:, 1]-q[:, 1]*w[:, 0])/det
    t = (v[:, 0]*q[:, 1]-v[:, 1]*q[:, 0])/det
    hit = (u >= -1e-9) & (t >= -1e-9) & (u+t <= 1+1e-9)
    z = tri[:, 0, 2] + u*(tri[:, 1, 2]-tri[:, 0, 2]) + t*(tri[:, 2, 2]-tri[:, 0, 2])
    if not hit.any():
        return None
    return [float(z[hit].min()), float(z[hit].max())]


def measure_vertices(rubbers, cover, frame):
    points = np.vstack([mesh["V"] for mesh in rubbers])
    names = np.concatenate([np.full(len(mesh["V"]), mesh["name"], object) for mesh in rubbers])
    vertex_ids = np.concatenate([np.arange(len(mesh["V"])) for mesh in rubbers])
    if not np.isfinite(points).all():
        raise ValueError("nonfinite cushion vertex")
    rows = []
    # Every stored vertex, including the foot and cap, at its own exact
    # height. No clipping to a chosen height band or positive-only subset.
    for z in np.unique(points[:, 2]):
        mask = points[:, 2] == z
        p = points[mask]
        opening, curve = inner_opening(cover, float(z), frame)
        uv = frame.to(p[:, :2])
        distances = signed_distance(opening, uv)
        i = int(np.argmax(distances))
        span = vertical_span(cover, p[i, :2])
        rows.append(dict(z_mm=float(z), vertex_count=int(mask.sum()),
            metric_mm=float(distances[i]), mesh=str(names[mask][i]), vertex=int(vertex_ids[mask][i]),
            point_xyz_mm=p[i].tolist(), point_uw_mm=uv[i].tolist(),
            cover_vertical_span_mm=span,
            cover_over_witness_mm=None if span is None else float(span[1]-z),
            **curve))
    return dict(vertex_count=len(points), height_count=len(rows),
        maximum=max(rows, key=lambda row: row["metric_mm"]), heights=rows)


def dataset(meshes, model=False):
    rubber_pred = lambda name: name.startswith("pool_rubber" if model else "dm-cushion-")
    cover_pred = lambda name: name.startswith("pool_leather" if model else "dm-bootcollar-")
    for name, mesh in meshes.items():
        mesh["name"] = name
    rubbers = [mesh for name, mesh in meshes.items() if rubber_pred(name)]
    expected = {f"pool_rubber{i:02}" for i in range(1, 7)} if model else {f"dm-cushion-{i}" for i in range(6)}
    if {mesh["name"] for mesh in rubbers} != expected:
        raise ValueError("require the exact six cushion mesh keys")
    apex = pl.exact_nose_apex(objlib, meshes, rubber_pred)
    nose = pl.nose_lines(objlib, meshes, rubber_pred, z=apex["height_mm"])
    if not np.isfinite(nose).all():
        raise ValueError("unresolved nose datum")
    pockets = {}
    for kind, name, frame in pl.pocket_frames(*nose):
        cover_name, _ = pl.nearest_mesh(meshes, cover_pred, frame.N+100*frame.u)
        cover = meshes[cover_name]
        pockets[name] = dict(kind=kind, frame=frame, cover=cover,
            result=measure_vertices(rubbers, cover, frame))
    return dict(meshes=meshes, rubbers=rubbers, apex=apex, nose_mm=list(nose), pockets=pockets)


def draw_segments(ax, segments, color, label, style="-"):
    if not len(segments):
        return
    # Matplotlib collections avoid a separate artist for every triangle cut.
    from matplotlib.collections import LineCollection
    ax.add_collection(LineCollection(segments[:, :, ::-1], colors=color,
        linewidths=.9, linestyles=style, label=label))


def draw_overlay(size, name, before, after, model, out):
    fig, axes = plt.subplots(3, 2, figsize=(13, 14), constrained_layout=True)
    for row, (cut, z) in enumerate(pl.CUTS.items()):
        mp = model["pockets"][name]
        for col, (label, data) in enumerate((("BEFORE C7", before), ("AFTER C9", after))):
            ax = axes[row, col]
            pocket = data["pockets"][name]
            opening, _ = inner_opening(pocket["cover"], z, pocket["frame"])
            q = np.asarray(opening.exterior.coords)
            ax.fill(q[:, 1], q[:, 0], color="#e8e3f2", alpha=.8, label="cover inner opening")
            for source, current, color, line in (("MODEL", model, "#39804b", "--"),
                                                (label, data, "#117fa6" if col else "#bd4534", "-")):
                part = current["pockets"][name]
                for family, meshes in (("cover", [part["cover"]]), ("cushion", current["rubbers"])):
                    segments = np.concatenate([pl.section_xy(objlib, mesh, z) for mesh in meshes])
                    draw_segments(ax, part["frame"].segs(segments), color,
                        source+" "+family, line)
            ax.set(xlim=(-110, 110), ylim=(-75, 140), aspect="equal",
                xlabel="w lateral (mm)", ylabel="u outboard (mm)",
                title=f"{label} · {cut} Z={z:g} mm")
            ax.grid(alpha=.25)
            if row == 0:
                ax.legend(fontsize=7, loc="upper right")
    values = [x["pockets"][name]["result"]["maximum"]["metric_mm"] for x in (before, after, model)]
    fig.suptitle(f"{size} {name} · all-vertex protrusion: before {values[0]:+.5f}, "
                 f"after {values[1]:+.5f}, MODEL {values[2]:+.5f} mm\n"
                 "Same unscaled pocket nose frame; MODEL is the disclosed TurboSmooth cage; positive = inside opening",
                 fontsize=12)
    path = out/f"{size}-{name}.png"
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return dict(path=path.name, sha256=sha(path))


def model_end_relations(data):
    """Independent numeric witnesses for the ordered nose/cover relationship."""
    records = []
    for name, pocket in data["pockets"].items():
        if pocket["kind"] != "corner":
            continue
        frame, cover = pocket["frame"], pocket["cover"]
        sx, sy = (int(np.sign(c)) for c in frame.N)
        opening, curve = inner_opening(cover, pl.CUTS["nose"], frame)
        for mesh in data["rubbers"]:
            span = np.ptp(mesh["V"], axis=0)
            axis = 0 if span[1] > span[0] else 1
            if axis == 0 and np.sign(mesh["V"][:, 0].mean()) != sx:
                continue
            if axis == 1 and (np.sign(mesh["V"][:, 1].mean()) != sy or np.sign(mesh["V"][:, 0].mean()) != sx):
                continue
            for z in pl.CUTS.values():
                end = end_section(mesh, axis, sx, sy, z)
                witnesses = {}
                for label, depth, along in (("nose", end["nose_depth_mm"], end["nose_end_along_mm"]),
                    ("terminal", end["end_depth_mm"], end["end_along_mm"])):
                    xy = np.array([sx*(1152+depth), sy*(576-along)] if axis == 0
                                  else [sx*(1152-along), sy*(576+depth)])
                    current, _ = inner_opening(cover, z, frame)
                    cover_span = vertical_span(cover, xy)
                    rubber_span = vertical_span(mesh, xy)
                    witnesses[label] = dict(xy_mm=xy.tolist(), uw_mm=frame.to([xy])[0].tolist(),
                        signed_to_opening_mm=float(signed_distance(current, frame.to([xy]))[0]),
                        cover_vertical_span_mm=cover_span, rubber_vertical_span_mm=rubber_span,
                        local_cover_over_rubber_mm=None if cover_span is None or rubber_span is None
                            else cover_span[1]-rubber_span[1])
                records.append(dict(pocket=name, rail_axis=axis, mesh=mesh["name"], cover=cover["name"],
                    z_mm=z, end=end, witnesses=witnesses, nose_plane_opening=curve))
    keys = [(row["pocket"], row["rail_axis"], row["z_mm"]) for row in records]
    expected = {(name, axis, z) for name, part in data["pockets"].items()
                if part["kind"] == "corner" for axis in (0, 1) for z in pl.CUTS.values()}
    if len(keys) != len(set(keys)) or set(keys) != expected:
        raise ValueError("require eight distinct model ends at all three section heights")
    return records


def run(args):
    out = args.out.resolve()
    if out.is_relative_to(ROOT):
        raise ValueError("measurement output must be outside the repository")
    out.mkdir(parents=True, exist_ok=True)
    if model_obj_set_sha256(str(args.model_obj_dir)) != MODEL_SET:
        raise ValueError("wrong purchased model identity")
    model = dataset(objlib.load_all(str(args.model_obj_dir)), model=True)
    record = dict(schema="d621-cushion-end-overlay/1", instrument_sha256=sha(__file__),
        dependency_sha256={name:sha(HERE/name) for name in (
            "corner_overlay_621.py", "planlib_621.py", "cushion_end_source_621.py")},
        model_obj_set_sha256=MODEL_SET, source_max_sha256=MODEL_MAX,
        source_caveat="MODEL macro sections of the supplied TurboSmooth cage; modifier not evaluated.",
        units="mm", sign="positive = inside finite cover opening; negative = outside",
        recipe="Every stored cushion vertex at its own exact height; signed Euclidean distance to the cover's triangle-plane inner path closed across its two arm tips. All six cushions; all six pockets; same algorithm for MODEL/BEFORE/AFTER. No height or positive-value filter.",
        section_grid_mm=GRID,
        registration="Unscaled independent pocket frames at the exact straight-rail nose apex; bed Z=770 mm. No ICP or per-size geometry fit.",
        model=dict(apex=model["apex"], nose_mm=model["nose_mm"], pockets={
            name:dict(cover=p["cover"]["name"], **p["result"]) for name,p in model["pockets"].items()},
            end_relations=model_end_relations(model)),
        rows=[], inputs={}, overlays=[])
    for size in SIZES:
        datasets = []
        record["inputs"][size] = {}
        for label, directory in (("before", args.before), ("after", args.after)):
            file = dump_path(directory, size)
            raw, meshes = common.load_ours(file)
            if raw["table"] != "diamond_proam_"+size:
                raise ValueError("wrong table entry")
            record["inputs"][size][label] = dict(path=str(file.resolve()), sha256=sha(file),
                source_table_js_sha256=raw.get("source_table_js_sha256"), served_renderer=raw.get("served_renderer"))
            datasets.append(dataset(meshes))
        before, after = datasets
        for name, part in before["pockets"].items():
            b, a, m = (data["pockets"][name]["result"] for data in (before, after, model))
            bv, av, mv = (data["maximum"]["metric_mm"] for data in (b, a, m))
            side = part["kind"] == "side"
            row = dict(size=size, pocket=name, kind=part["kind"], before=b, after=a,
                model_value_mm=mv, unchanged=av == bv,
                **{"pass": (bv <= 0 and av <= 0 and av == bv) if side else av <= mv})
            record["rows"].append(row)
            print(json.dumps(dict(size=size, pocket=name, before_mm=bv, after_mm=av,
                                  model_mm=mv, **{"pass":row["pass"]})), flush=True)
            if not args.no_overlays:
                record["overlays"].append(draw_overlay(size, name, before, after, model, out))
    expected = {(size, name) for size in SIZES for _,name,_ in pl.pocket_frames(1,1)}
    keys = [(row["size"], row["pocket"]) for row in record["rows"]]
    if len(keys) != len(set(keys)) or set(keys) != expected:
        raise ValueError("missing or duplicated pocket row")
    reported = next(row for row in record["rows"] if (row["size"], row["pocket"]) == ("9ft", "corner_EN"))
    record["reported_corner_was_positive"] = reported["before"]["maximum"]["metric_mm"] > 0
    record["verdict"] = "PASS" if all(row["pass"] for row in record["rows"]) and record["reported_corner_was_positive"] else "FAIL"
    (out/"CUSHION-END-OVERLAYS.json").write_text(json.dumps(record, indent=2)+"\n")
    return 0 if record["verdict"] == "PASS" else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", type=Path, required=True)
    parser.add_argument("--after", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--model-obj-dir", type=Path,
        default=Path("/tmp/ob-3dm-quarantine/diamond-proam-8ft/obj"))
    parser.add_argument("--no-overlays", action="store_true")
    sys.exit(run(parser.parse_args()))
