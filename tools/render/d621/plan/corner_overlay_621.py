#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""C7 measured PLAN overlays (numpy, scipy, matplotlib, shapely >= 2).

Read quarantined OBJ in memory. Write only derived metrics and PNG figures to
--out OUTSIDE the repository. Both comparisons use the same fixed nose datums;
unscaled furniture is translated, and only intervening straight spans change.
The silhouette is the union of projected triangles, NOT a convex hull: source
joint recesses remain visible and contribute to the reported deviations.
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
from shapely.geometry import GeometryCollection, LineString, Polygon, box

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.path.insert(0, str(HERE.parent / "align"))
import objlib
import cushion_profile_621 as profile

SIZES = ("9ft", "8ft", "7ft")
CORNERS = ((1, -1, 1), (2, 1, 1), (3, 1, -1), (4, -1, -1))
STEP = .25  # TESSELLATION: arc-length sampling in mm; never a fit tolerance.
GRID = .001  # TESSELLATION: OBJ coordinate precision, used only by the 2-D union.


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def polygons(geometry):
    if geometry.geom_type == "Polygon":
        return [geometry]
    return [p for g in getattr(geometry, "geoms", []) for p in polygons(g)]


def lines(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type in ("LineString", "LinearRing"):
        return [LineString(geometry.coords)]
    return [p for g in getattr(geometry, "geoms", []) for p in lines(g)]


def outer(geometry):
    """The outside contour, excluding islands enclosed by another contour.

    A projected wood part inside the apron ring's hole is an interior detail,
    not the table's outer outline. Keep all recesses of the enclosing contour;
    no convex hull, radius fit, smoothing or distance-based trimming is used.
    Full cap/boot/rubber section metrics below retain every interior contour.
    """
    contours = sorted((Polygon(p.exterior) for p in polygons(geometry)), key=lambda p:p.area, reverse=True)
    outside = []
    for candidate in contours:
        if not any(parent.covers(candidate) for parent in outside):
            outside.append(candidate)
    return shapely.union_all([p.exterior for p in outside])


def projection(meshes):
    pieces = []
    for mesh in meshes:
        triangles = mesh["V"][mesh["F"], :2]
        shapes = shapely.polygons(triangles)
        # DERIVED: vertical/collapsed projections have no filled footprint.
        shapes = shapes[shapely.area(shapes) > GRID * GRID]
        pieces.append(shapely.union_all(shapes, grid_size=GRID))
    return shapely.union_all(pieces, grid_size=GRID)


def section(meshes, z):
    parts = []
    for mesh in meshes:
        segments = objlib.section(mesh["V"], mesh["F"], 2, z)[:, :, :2]
        if not len(segments):
            continue
        wire = shapely.union_all(shapely.linestrings(segments), grid_size=GRID)
        # Polygonization also emits a face for an annulus's EMPTY inner hole.
        # Retain only faces inside the original section by even-odd parity;
        # otherwise the support frame fills the table and hides pocket cuts.
        faces = shapely.polygonize(shapely.get_parts(wire))
        if faces.is_empty:
            raise ValueError(f"unclosed section at Z={z}: {mesh.get('name')}")
        kept = []
        for face in shapely.get_parts(faces):
            point = face.representative_point()
            start, end = segments[:, 0], segments[:, 1]
            crosses = (start[:, 1] > point.y) != (end[:, 1] > point.y)
            start, end = start[crosses], end[crosses]
            hits = start[:, 0] + (point.y-start[:, 1]) * (end[:, 0]-start[:, 0]) / (end[:, 1]-start[:, 1])
            if np.count_nonzero(hits > point.x) % 2:
                kept.append(face)
        if not kept:
            raise ValueError(f"section has no solid interior at Z={z}: {mesh.get('name')}")
        parts.append(shapely.union_all(kept, grid_size=GRID))
    if not parts:
        return GeometryCollection()
    return shapely.union_all(parts, grid_size=GRID)


def component_boundaries(meshes, z):
    # DERIVED: retain each component's construction seams on BOTH sides.
    # A zero-width render joint must not disappear merely because its two
    # solids touch, while a purchased assembly's narrow seam remains a line.
    return shapely.union_all([section([mesh],z).boundary for mesh in meshes], grid_size=GRID)


def samples(geometry):
    points, weights, vertices = [], [], []
    for line in lines(geometry):
        n = max(1, int(np.ceil(line.length / STEP)))
        distances = (np.arange(n) + .5) * line.length / n
        points.append(shapely.line_interpolate_point(line, distances))
        weights.append(np.full(n, line.length / n))
        vertices.extend(line.coords)
    if not points:
        raise ValueError("missing outline, cannot report zero deviation")
    return np.concatenate(points), np.concatenate(weights), shapely.points(vertices)


def metrics(a, b):
    """Symmetric, arc-length-weighted distances; no tessellation-count weighting."""
    pa, wa, va = samples(a)
    pb, wb, vb = samples(b)
    da, db = shapely.distance(pa, b), shapely.distance(pb, a)
    d = np.r_[da, db]
    w = np.r_[wa / wa.sum() / 2, wb / wb.sum() / 2]
    order = np.argsort(d)
    cdf = np.cumsum(w[order])
    q = lambda p: float(d[order[min(len(order)-1, np.searchsorted(cdf, p))]])
    witnesses = []
    for direction, points, target in (("render-to-model", np.r_[pa,va], b), ("model-to-render", np.r_[pb,vb], a)):
        distances = shapely.distance(points, target)
        index = int(distances.argmax())
        nearest = shapely.shortest_line(points[index], target)
        witnesses.append(dict(direction=direction, distance_mm=float(distances[index]),
                              segment_xy_mm=[list(p) for p in nearest.coords]))
    worst = max(witnesses, key=lambda row: row["distance_mm"])
    maximum = worst["distance_mm"]
    return dict(median_mm=q(.5), p90_mm=q(.9), max_mm=float(maximum),
                max_sampling_bound_mm=STEP/2, samples=int(len(d)),
                reference_length_mm=float(wb.sum()), rendered_length_mm=float(wa.sum()), worst=worst)


def dump_path(directory, size):
    for name in (f"diamond_proam_{size}-meshes.json", f"ours-{size}.json"):
        path = directory / name
        if path.exists():
            return path
    raise FileNotFoundError(f"{directory}: missing {size} mesh dump")


def read_ours(path):
    raw = json.loads(path.read_text())
    result = dict(cap=[], frame=[], apron=[], boots=[], rubber=[])
    for mesh in raw["meshes"]:
        p = np.asarray(mesh["positions"]).reshape(-1, 3) * 1000
        p = np.c_[p[:, 0], -p[:, 2], p[:, 1] + 770]  # DERIVED: the standing proper rotation and bed datum.
        ix = mesh["indices"] or list(range(len(p)))
        record = dict(name=mesh["name"], V=p, F=np.asarray(ix).reshape(-1, 3))
        name = mesh["name"]
        if name.startswith(("dm-railtop-", "dm-cornerblock-")):
            result["cap"].append(record)
        elif name == "dm-apronband":
            if mesh.get("outline_parts"):
                for part in mesh["outline_parts"]:
                    lo, hi = part["start"], part["start"] + part["count"]
                    result[part["family"]].append(dict(name=part["family"], V=p[lo:hi],
                                                     F=np.arange(hi-lo).reshape(-1, 3)))
            else:
                result["apron"].append(record)
        elif name.startswith("dm-cushion-"):
            result["rubber"].append(record)
        elif name.startswith("dm-bootcollar-"):
            result["boots"].append(record)
    if len(result["cap"]) != 10 or len(result["rubber"]) != 6 or len(result["boots"]) != 6:
        raise ValueError("incomplete scene dump for corner/whole-table comparison")
    return raw, result


def registration(nodes, G):
    corner, side = [], []
    for name, node in nodes.items():
        if not name.startswith("pool_leather"):
            continue
        p = node["V"][:, :2]
        if abs(p.mean(axis=0)[0]) < 1152/2:  # MODEL: identify the two centre pockets.
            side.append(float(abs(p[:, 0]).max()))
        else:
            corner.append(abs(p).min(axis=0))
    guards = np.min(corner, axis=0)
    side_guard = max(side)
    deltas = np.asarray([G["L"] * 500-1152, G["W"] * 500-576])

    def transform(xy):
        p = np.asarray(xy, float).copy()
        for axis, inner in ((0, side_guard), (1, 0)):
            weight = np.clip((abs(p[:, axis])-inner)/(guards[axis]-inner), 0, 1)
            p[:, axis] += np.sign(p[:, axis]) * weight * deltas[axis]
        return p

    note = dict(method="Fixed nose-intersection registration; unscaled corner/side-pocket furniture. Only straight spans between measured hardware bounds stretch. No ICP or uniform scale.",
                model_nose_half_extents_mm=[1152,576], target_nose_half_extents_mm=[G["L"]*500,G["W"]*500],
                corner_translation_mm=deltas.tolist(), corner_guard_mm=guards.tolist(), side_guard_x_mm=side_guard,
                mfr_rail_band_mm=177.8,  # MFR: the unchanged seven-inch rail band.
                residual_note="The purchased maximum cap band is 178.743 mm versus the standing MFR 177.8 mm: its 0.943 mm datum residual is INCLUDED, not fitted away.")
    return lambda geometry: shapely.transform(geometry, transform), note


def draw(ax, geometry, color, label, style="-", width=1.2):
    for i, line in enumerate(lines(geometry)):
        p = np.asarray(line.coords)
        ax.plot(p[:,0], p[:,1], color=color, linestyle=style, linewidth=width, label=label if i == 0 else None)


def text_metrics(value):
    return f"{value['median_mm']:.2f} / {value['p90_mm']:.2f} / {value['max_mm']:.2f} mm"


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--before", type=Path, required=True)
    p.add_argument("--after", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--model-obj-dir", default="/tmp/ob-3dm-quarantine/diamond-proam-8ft/obj")
    a = p.parse_args()
    if a.out.resolve().is_relative_to(ROOT):
        raise ValueError("derived purchased-model overlays must stay outside the repository")
    a.out.mkdir(parents=True, exist_ok=True)
    nodes = objlib.load_all(a.model_obj_dir)
    model = dict(cap=[nodes[f"pool_kant{i:02}"] for i in range(1,11)],
                 frame=[nodes["pool_kant_support"]], apron=[nodes["pool_kant_side01"],nodes["pool_kant_side02"]],
                 boots=[node for name,node in nodes.items() if name.startswith("pool_leather")],
                 rubber=[nodes[row[0]] for row in profile.MODEL_RAILS.values()])
    source_shadow = projection(model["cap"]+model["frame"]+model["apron"])
    source = {"silhouette":outer(source_shadow)}
    for family, levels in (("cap",(790,800)),("frame",(700,760)),("apron",(700,760))):
        for z in levels:
            # The purchased support ring closes the skirt assembly seams.
            # Include it at the SAME height before selecting the exterior;
            # otherwise a part's inward face masquerades as its outer outline.
            assembly=model[family]+(model["frame"] if family=="apron" else [])
            source[f"{family}_{z}"] = component_boundaries(assembly,z) if family=="cap" else outer(section(assembly,z))
    for family in ("cap","boots","rubber"):
        source[f"whole_{family}"] = component_boundaries(model[family],800)
    result = dict(schema="d621-corner-overlays/1", instrument_sha256=sha(__file__),
        source_note="Purchased OBJ control-cage sections and true projected union; TurboSmooth unapplied. C7 rules straight macro PLAN dimensions MODEL; junction rounds remain TESSELLATION/EST.",
        source_obj_sha256={Path(node["path"]).name:sha(node["path"]) for group in model.values() for node in group},
        sampling=dict(step_mm=STEP, union_grid_mm=GRID, metric="Symmetric arc-length-weighted point-to-polyline distances, including all vertices in max. Max has a 0.125 mm sampling bound; no sample is dropped."),
        section_outline_rule="Silhouette/frame/apron: outside contour of the projected/sectioned assembly, excluding contours enclosed inside it; no convex hull. Cap/boot/rubber: union of each COMPONENT'S section boundaries, retaining pocket-facing sides, kerfs and even zero-width construction joints. Cap sections use cap parts on both sides, without substituting the support frame.",
        versions=dict(numpy=np.__version__,shapely=shapely.__version__,matplotlib=matplotlib.__version__),tables={})
    for size in SIZES:
        print("measuring " + size, flush=True)
        inv = json.loads((a.before/f"diamond_proam_{size}-inventory.json").read_text())
        G=inv["geom"]
        register, rule=registration(nodes,G)
        ref={k:register(v) for k,v in source.items()}
        phases, inputs = {}, {}
        for phase, directory in (("before",a.before),("after",a.after)):
            path=dump_path(directory,size);raw,groups=read_ours(path)
            inputs[phase]=dict(path=str(path),sha256=sha(path),served_renderer=raw.get("served_renderer"))
            phase_data={"silhouette":outer(projection(groups["cap"]+groups["apron"]+groups["frame"]))}
            for family, levels in (("cap",(790,800)),("frame",(700,760)),("apron",(700,760))):
                for z in levels:
                    assembly=groups[family]+(groups["frame"] if family=="apron" else [])
                    phase_data[f"{family}_{z}"]=component_boundaries(assembly,z) if family=="cap" else outer(section(assembly,z))
            for family in ("cap","boots","rubber"):
                phase_data[f"whole_{family}"]=component_boundaries(groups[family],800)
            phases[phase]=phase_data
        whole={key:{phase:metrics(phases[phase][key],ref[key]) for phase in phases}
               for key in ("silhouette","whole_cap","whole_boots","whole_rubber")}
        corners=[]
        for number,sx,sy in CORNERS:
            # DERIVED: local axes measure inward from the fixed MFR sharp corner.
            X=G["L"]*500+177.8;Y=G["W"]*500+177.8
            def local(geometry):
                return shapely.transform(geometry,lambda xy:np.c_[X-sx*xy[:,0],Y-sy*xy[:,1]]).intersection(box(-5,-5,160,160))
            src={k:local(v) for k,v in ref.items() if not k.startswith("whole_")}
            records={}
            for key in src:
                records[key]={phase:metrics(local(phases[phase][key]),src[key])
                              for phase in phases if not phases[phase][key].is_empty}
            fig,axs=plt.subplots(2,2,figsize=(12,11),constrained_layout=True)
            panels=[("silhouette", "True PLAN outer silhouette"),("cap_800","Cap component boundaries at Z=800 mm"),
                    ("apron_760","Apron (solid) / frame (dashed), Z=760"),
                    ("apron_700","Apron (solid) / frame (dashed), Z=700")]
            for ax,(key,title) in zip(axs.ravel(),panels):
                for phase,color,label in (("model","#30343b","Purchased cage"),("before","#cb732d","Before"),("after","#126eaa","C7")):
                    geom=src[key] if phase=="model" else local(phases[phase][key])
                    draw(ax,geom,color,label,width=1.6 if phase=="model" else 1.1)  # TESSELLATION: plot stroke widths.
                    if key.startswith("apron"):
                        fk=key.replace("apron","frame")
                        fg=src[fk] if phase=="model" else local(phases[phase][fk])
                        draw(ax,fg,color,None,"--")
                ax.set(xlim=(-5,145),ylim=(145,-5),aspect="equal",xlabel="Inward along length (mm)",ylabel="Inward along width (mm)")
                ax.grid(alpha=.2);ax.legend(fontsize=8)
                ax.set_title(title+"\nC7 median / p90 / max: "+text_metrics(records[key]["after"]),fontsize=10)
            fig.suptitle(f"Diamond Pro-Am {size}, corner {number} — fixed nose datums\nStraight MODEL chamfer; 1.78 mm junction radius is TESSELLATION/EST",fontsize=14)
            name=f"corner-{size}-{number}.png";fig.savefig(a.out/name,dpi=150);plt.close(fig)
            corners.append(dict(corner=number,model_signs=[sx,sy],metrics=records,figure=name,figure_sha256=sha(a.out/name)))
        fig,axs=plt.subplots(1,2,figsize=(19,9),constrained_layout=True)
        for ax,phase in zip(axs,("before","after")):
            draw(ax,ref["silhouette"],"#24282d","Purchased silhouette",width=1.8)
            draw(ax,phases[phase]["silhouette"],"#cb732d" if phase=="before" else "#126eaa",phase.upper(),width=1.1)
            for key,color,label in (("whole_cap","#126eaa","Wood cuts"),("whole_boots","#77519b","Boots"),("whole_rubber","#2e8763","Rubber")):
                draw(ax,ref[key],"#9a9a9a",None,width=.7)
                draw(ax,phases[phase][key],color,label,width=.65)
            ax.set(aspect="equal",xlabel="Model-frame X (mm)",ylabel="Model-frame Y (mm)")
            ax.grid(alpha=.15);ax.legend(loc="upper right",fontsize=8)
            ax.set_title(phase.upper()+" vs purchased model\n"+"\n".join(k.replace("whole_","")+": "+text_metrics(v[phase]) for k,v in whole.items()),fontsize=10)
        fig.suptitle(f"Diamond Pro-Am {size}: whole-table PLAN / sections at Z=800\nMedian / p90 / max; unscaled furniture, only straight spans change. Includes the fixed 0.943 mm MFR cap-band residual.",fontsize=13)
        name=f"whole-{size}.png";fig.savefig(a.out/name,dpi=150);plt.close(fig)
        result["tables"][size]=dict(inputs=inputs,registration=rule,whole=whole,corners=corners,figure=name,figure_sha256=sha(a.out/name))
        (a.out/"CORNER-OVERLAYS.json").write_text(json.dumps(result,indent=2)+"\n")
        print(json.dumps(dict(size=size,whole=whole)),flush=True)


if __name__ == "__main__":
    main()
