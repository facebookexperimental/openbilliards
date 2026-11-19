#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Six engineering section triptychs: BEFORE | AFTER | measured MODEL.

Only measurement plots and scalar ladders leave the process. No original model
vertices, materials, textures or rendered pixels are written or copied.
"""
import sys
sys.dont_write_bytecode = True
import argparse
import json
import os
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image
from matplotlib.patches import Circle

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cushion_gate_621 as gate
reader = gate.reader


def profile_panel(ax, meshes, spec, title, color, law):
    cushion, cap, along, across, nose, sign = spec
    V = meshes[cushion]["V"]
    margin = law["sampling"]["end_margin_mm"]
    stations = np.linspace(V[:, along].min() + margin, V[:, along].max() - margin,
                           law["sampling"]["stations_per_rail"])
    for ordinal, station in enumerate(stations):
        middle = ordinal == len(stations) // 2  # TESSELLATION: highlight the same middle station.
        for name in (cushion, cap):
            sec = reader.section_dz(meshes[name], along, across, station, nose, sign)
            if sec is None:
                raise ValueError("a requested section is absent: " + name)
            for segment in sec[1]:
                ax.plot(sign * segment[:, across] - nose, segment[:, 2] - reader.BED,
                        color=color, linewidth=1.7 if middle and name == cushion else .55,
                        alpha=1 if middle else .25)  # TESSELLATION: engineering-plot line hierarchy.
    targets = law["targets"]
    ax.axhline(targets["nose_z_mm"]["value"], color="gray", linewidth=.6, linestyle="--")
    ax.axvline(targets["nose_depth_mm"]["value"], color="gray", linewidth=.6, linestyle=":")
    ax.axvline(targets["cushion_width_mm"]["value"], color="gray", linewidth=.6, linestyle=":")
    # TESSELLATION: identical engineering viewports, never changes to measured geometry.
    ax.set_xlim(-2, 70)
    ax.set_ylim(-2, 50)
    ax.set_aspect("equal")
    ax.grid(alpha=.2)
    ax.set_title(title, fontsize=11)
    ax.set_xlabel("Depth behind kernel/model nose line [mm]", fontsize=9)
    ax.set_ylabel("Height above bed [mm]", fontsize=9)


def mean_ladder(rails, method, ladder):
    rows = gate.flatten_rails(rails)
    keys = next(iter(rows))[method][ladder]
    return {q: gate.summary([row[method][ladder][q] for row in rows if row[method][ladder][q] is not None]) for q in keys}


def nose_panel(ax, meshes, spec, title, color, law, readings):
    """Only a dimensioned section plot leaves memory, never MODEL vertices."""
    cushion, _, along, across, line, sign = spec
    mesh = meshes[cushion]
    margin = law["sampling"]["end_margin_mm"]
    stations = np.linspace(mesh["V"][:, along].min() + margin, mesh["V"][:, along].max() - margin,
                           law["sampling"]["stations_per_rail"])
    for ordinal, station in enumerate(stations):
        section = reader.objlib.section(mesh["V"], mesh["F"], along, station)
        dz = np.stack((sign * section[:, :, across] - line, section[:, :, 2] - reader.BED), axis=2)
        points = dz.reshape(-1, 2)
        apex = points[int(np.argmin(points[:, 0]))]
        # TESSELLATION: geometry-derived relative apex frame for the nose detail;
        # full-section plates still show the distinct frozen nose heights.
        for segment in dz - apex:
            ax.plot(segment[:, 0], segment[:, 1], color=color, linewidth=.8, alpha=.3)
        if ordinal == len(stations) // 2:
            result = readings[ordinal]["exact"]
            if result["circle_fit_status"] == "RESOLVED":
                ax.add_patch(Circle((result["circle_center_depth_mm"], result["circle_center_height_mm"]),
                                    result["circle_radius_mm"], fill=False, color="#c77b19", linewidth=1.5))
            for branch in result.get("facet_support", {}).values():
                ax.scatter([branch["shoulder_depth_mm"]], [branch["shoulder_height_from_apex_mm"]],
                           color="#c77b19", s=22, zorder=5)
    values = [row["exact"]["circle_radius_mm"] for row in readings if row["exact"]["circle_radius_mm"] is not None]
    stats = gate.summary(values)
    fitted = f"r={stats['mean']:.6f} mm; station rms={stats['rms']:.6f}" if values else "UNRESOLVED"
    # TESSELLATION: common detail viewport, not a fit window or deciding parameter.
    ax.set_xlim(-.2, 2.4); ax.set_ylim(-2.2, 2.2); ax.set_aspect("equal"); ax.grid(alpha=.2)
    ax.set_title(title + f"\n{len(values)}/{len(readings)} resolved; " + fitted, fontsize=10)
    ax.set_xlabel("Depth from measured apex [mm]"); ax.set_ylabel("Height from measured apex [mm]")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", required=True)
    parser.add_argument("--after", required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--model-obj-dir", default=reader.paths.DEFAULT_MODEL_OBJ_DIR)
    args = parser.parse_args(argv)
    output = args.out.resolve()
    if gate.ROOT == output or gate.ROOT in output.parents or Path(args.model_obj_dir).resolve() in output.parents:
        raise ValueError("measurement plots must be outside both repository and quarantine")
    output.mkdir(parents=True, exist_ok=True)
    law = json.loads(gate.LAW_PATH.read_text())
    model = reader.objlib.load_all(args.model_obj_dir)
    before_raw, before = reader.common.load_ours(args.before)
    after_raw, after = reader.common.load_ours(args.after)
    if before_raw["table"] != "diamond_proam_8ft" or after_raw["table"] != "diamond_proam_8ft":
        raise ValueError("the purchased-model section comparison uses eight-foot captures")
    if "OFFLINE" in after_raw.get("mode", ""):
        raise ValueError("final sheets require an app capture, not an offline preview")
    specs = reader.ours_rails("8ft")
    measurements = {"before": gate.measure_rails(before, specs, law),
                    "after": gate.measure_rails(after, specs, law),
                    "model": gate.measure_rails(model, reader.MODEL_RAILS, law, model=True)}
    section_dir = output / "sections"
    section_dir.mkdir(exist_ok=True)
    images, nose_images = [], []
    for rail in reader.MODEL_RAILS:
        fig, axes = plt.subplots(1, 3, figsize=(19, 6))  # TESSELLATION: ordered three-column section sheets.
        for ax, (side, meshes, table_spec, color) in zip(axes, (
            ("BEFORE", before, specs[rail], "#b63b32"),
            ("AFTER", after, specs[rail], "#202a34"),
            ("MODEL - measured section", model, reader.MODEL_RAILS[rail], "#205fa7"),
        )):
            profile_panel(ax, meshes, table_spec, side, color, law)
        fig.suptitle(f"O22 / {rail} / eight stations per panel\nR1 DECISION: MODEL 14.58 degrees accepted, owner-overridable; MFR upper trace retained", fontsize=13)
        fig.text(.02, .025, "Dashed: frozen CU-03 36.5125 mm. Dotted: nose line and frozen CU-04 50.8 mm.\n"
                 "MODEL is a section measurement, not an exported model render. Same axes in every panel.", fontsize=9)
        fig.tight_layout(rect=(0, .13, 1, .91))  # TESSELLATION: separate axis labels from the two-line footer.
        name = rail.replace(" ", "_").replace("+", "plus").replace("-", "minus") + "-before-after-model.png"
        path = section_dir / name
        fig.savefig(path, dpi=160)  # TESSELLATION: legible engineering linework.
        plt.close(fig)
        images.append(path)
        fig, axes = plt.subplots(1, 3, figsize=(16, 7))  # TESSELLATION: readable per-rail nose detail.
        for ax, (side, meshes, table_spec, title, color) in zip(axes, (
            ("before", before, specs[rail], "BEFORE / B apex fit", "#b63b32"),
            ("after", after, specs[rail], "AFTER / B apex fit", "#202a34"),
            ("model", model, reader.MODEL_RAILS[rail], "MODEL / face-tangent fit", "#205fa7"),
        )):
            nose_panel(ax, meshes, table_spec, title, color, law, measurements[side][rail])
        fig.suptitle(f"FIX1 / {rail} / nose facets and arc equivalents", fontsize=14)
        fig.text(.02, .035, "Blue/red/black: exact section measurements, eight stations. Gold: middle-station fitted circle and measured shoulders.\n"
                 "MODEL is a faceted knife edge; tangent-circle equivalence is not a claim of circular source geometry.\n"
                 "No target-derived window. 2-4 collinear apex vertices remain UNRESOLVED. Owner alias follows the render entry.", fontsize=10)
        fig.tight_layout(rect=(0, .14, 1, .94))
        nose_path = section_dir / name.replace("-before-after-model", "-nose-facets")
        fig.savefig(nose_path, dpi=160); plt.close(fig)  # TESSELLATION: same engineering-image resolution.
        nose_images.append(str(nose_path.relative_to(output)))
    opened = [Image.open(path).convert("RGB") for path in images]
    sheet = Image.new("RGB", (max(image.width for image in opened), sum(image.height for image in opened)), "white")
    y = 0
    for image in opened:
        sheet.paste(image, (0, y)); y += image.height
    sheet.save(output / "sections-before-after-model-6x3.png")
    result = dict(tool="cushion_sheets_621", tag="DERIVED", before_sha256=gate.sha(args.before),
                  after_sha256=gate.sha(args.after), law_sha256=gate.sha(gate.LAW_PATH),
                  model_obj_set_sha256=gate.plan_reader.model_obj_set_sha256(args.model_obj_dir),
                  load_average=os.getloadavg(), method_status=law["diagnostics"]["method_status"],
                  measurement_ruling=law["measurement_method"], overlay={}, ladders={}, radii={},
                  sections=[str(path.relative_to(output)) for path in images], nose_figures=nose_images)
    nose_record = dict(tag="MODEL", method=law["measurement_method"],
                       before_sha256=result["before_sha256"], after_sha256=result["after_sha256"],
                       rails={side: {rail: [dict(ordinal=row["ordinal"], measurement=row["exact"]) for row in rows]
                                      for rail, rows in rails.items()} for side, rails in measurements.items()})
    (output / "NOSE-FACETS.json").write_text(json.dumps(nose_record, indent=2) + "\n")  # TESSELLATION: scalar JSON only.
    for method in ("legacy", "exact"):
        result["overlay"][method] = {side: {key: gate.summary(value) for key, value in gate.overlay(
            measurements[side], measurements["model"], method).items()} for side in ("before", "after")}
        result["ladders"][method] = {side: {ladder: mean_ladder(rows, method, ladder)
                                             for ladder in ("top_ladder", "under_ladder", "back_ladder")}
                                      for side, rows in measurements.items()}
        field = "circle_radius_mm" if method == "exact" else "nose_round_r_est"
        result["radii"][method] = {}
        for side, rails in measurements.items():
            rows = gate.flatten_rails(rails)
            values = [row[method][field] for row in rows if row[method][field] is not None]
            result["radii"][method][side] = dict(gate.summary(values), attempted_sections=len(rows),
                                                unresolved_sections=len(rows) - len(values))
    (output / "ladders-before-after.json").write_text(json.dumps(result, indent=2) + "\n")  # TESSELLATION: JSON layout.
    lines = ["# O22 section overlay percentiles", "", law["measurement_method"]["ruling"], "",
             "Both measurement conventions are retained; no tolerance is changed. PREP is secondary for e/f/j only; h is unchanged.", "",
             law["measurement_method"]["reason"], "",
             "| Method | Ladder | n | Before p50 / p90 / max [mm] | After p50 / p90 / max [mm] |", "|---|---|---:|---|---|"]
    for method, sides in result["overlay"].items():
        for ladder in ("top", "under", "back"):
            b, a = sides["before"][ladder], sides["after"][ladder]
            fmt = lambda values: " / ".join(f"{values[key]:.4f}" for key in ("p50", "p90", "max"))
            lines.append(f"| {method} | {ladder} | {a['n']} | {fmt(b)} | {fmt(a)} |")
    lines += ["", "## Radius fits and identifiability", "",
              "FIX1 addendum: MODEL uses the adjacent-face-tangent circle through facet vertices; OURS keeps B's apex fit with facet-derived support. Unresolved on either side never passes.", "",
              "| Method | Side | Attempted | Resolved | Radius mean / min / max [mm] |", "|---|---|---:|---:|---|"]
    for method, sides in result["radii"].items():
        for side, stats in sides.items():
            values = " / ".join(f"{stats[key]:.6f}" if stats[key] is not None else "UNRESOLVED" for key in ("mean", "min", "max"))
            lines.append(f"| {method} | {side} | {stats['attempted_sections']} | {stats['n']} | {values} |")
    (output / "LADDERS.md").write_text("\n".join(lines) + "\n")
    print(json.dumps(dict(output=str(output), sections=len(images), overlays=result["overlay"]), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
