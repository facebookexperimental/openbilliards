# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Reproduce ORDER-7's Star measurement fallback without a private camera.

The raw D2 plane-cut measurement is the source, not D2's photo-scaled loft.
The physical hem boundary supplies the measured side-period polyline. Only
2D section/edge measurements are delivered; no purchased mesh is published.
"""
import argparse
import hashlib
import json
import re
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
INPUT_PATH = ROOT / "docs/geometry/cn8-pocket-d3-source-inputs.json"


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def rebuilt_side_bevels_mm(renderer):
    """The apron rebuild (f93c0276..ef4bb211) removed the per-builder `const BV`
    literals. Both rail-plan builders now take the side bevel as `sideInset` from
    cn8D3RailGeometry (options.bevelSize of the cn8 wood options, spread from
    railWoodOpts) and draw the back line from cn8JoyWoodCorner, whose W_C inset is
    the same retained 3.5 mm. The two shipped sites are read independently and
    must agree, as the two BV literals did; the derived value is unchanged."""
    try:
        head, _ = renderer.split("const cn8WoodOpts = { ...railWoodOpts", 1)
        options = head.rsplit("const railWoodOpts = {", 1)[1].split("};", 1)[0]
        bevel_match = re.search(r"bevelSize: ([0-9.]+),", options)
    except (ValueError, IndexError):
        bevel_match = None
    if not bevel_match:
        raise ValueError("Retained side bevel site is absent: railWoodOpts bevelSize")
    try:
        corner = renderer.split("function cn8JoyWoodCorner(", 1)[1].split("\n}", 1)[0]
        across_match = re.search(r"const across = K\.W_C - ([0-9.]+) \+ sideInset;", corner)
    except (ValueError, IndexError):
        across_match = None
    if not across_match:
        raise ValueError("Retained side bevel site is absent: cn8JoyWoodCorner const across")
    return [float(bevel_match[1]) * 1000, float(across_match[1]) * 1000]


def read_retained_plan(source, names):
    """Read property literals, never historical dimensions in comments."""
    head = "const CN8_R82 = {"
    body = source.split(head, 1)[1].split("\n};", 1)[0]
    properties = re.sub(r"//[^\n]*", "", body)
    values = {}
    for name in names:
        match = re.search(r"(?:^|,)\s*" + re.escape(name) + r":\s*([-0-9.]+)", properties, re.M)
        if not match:
            raise ValueError(f"Retained datum {name} is absent")
        values[name] = float(match[1]) * 1000
    return values, hashlib.sha256((head + body + "\n};").encode()).hexdigest()


def validate_sources(inputs):
    paths = [(inputs["model"]["section_definition"], inputs["model"]["section_sha256"]),
             (inputs["hem"]["definition"], inputs["hem"]["sha256"]),
             (inputs["reference_register"]["file"], inputs["reference_register"]["sha256"])]
    loaded = []
    for name, expected in paths:
        if digest(ROOT / name) != expected:
            raise ValueError(f"Source digest differs: {name}")
        loaded.append(json.loads((ROOT / name).read_text()))
    model, hem, register = loaded
    if model["source"]["sha256"] != inputs["model"]["source_sha256"] or hem["source"]["sha256"] != model["source"]["sha256"]:
        raise ValueError("MODEL(Star) measurements name different purchased sources")
    if digest(ROOT / hem["derivation"]["recipe"]) != hem["derivation"]["recipe_sha256"]:
        raise ValueError("Hem measurement recipe digest differs")
    attempts = register["camera_attempts"]
    if register["metric_camera_of_record"] is not None or not 1 <= len(attempts) <= 3:
        raise ValueError("ORDER-7 fallback requires completed official-image binding attempts")
    for attempt in attempts:
        residuals = attempt["held_out_rms_px"]
        if len(residuals) != 4 or attempt["status"] != "FAIL" or all(v <= attempt["threshold_px"] for v in residuals.values()):
            raise ValueError("A passing or incomplete camera attempt forbids this fallback")
        if not attempt["all_held_out_training_leakage_controls_pass"]:
            raise ValueError("The held-out diagnostic lacks its leakage control")
    values, block_hash = read_retained_plan((ROOT / "web/scene/table.js").read_text(), inputs["retained_plan"]["value"])
    if values != inputs["retained_plan"]["value"] or block_hash != inputs["retained_plan"]["block_sha256"]:
        raise ValueError("The protected CN8_R82 block differs from the retained datums")
    return model, hem, register


def measure_section(model):
    """Transfer the unscaled source section relative to its measured crown."""
    central = np.array(model["sections"]["central"]["source_profile_mm"], dtype=float)
    crown = int(np.argmax(central[:, 1]))
    top = float(central[crown, 1])
    points = central[crown - 2:crown + 1]
    centre = np.linalg.solve(2 * (points[1:] - points[0]),
                            np.sum(points[1:] ** 2 - points[0] ** 2, axis=1))
    body = np.column_stack([top - central[crown + 2:, 1],
                            central[:, 0].max() - central[crown + 2:, 0]])
    if not np.all(np.diff(body[:, 0]) > 0) or body[-1, 1] != 0:
        raise ValueError("Source body must progress to the outermost hem")
    neck = int(np.argmax(body[:, 1]))
    return {"source_profile_mm": central.tolist(), "source_top_mm": top,
            "source_width_mm": float(np.ptp(central[:, 0])),
            "drop_mm": float(top - central[-1, 1]),
            "body_profile_mm": body.tolist(),
            "body_source_indices": list(range(crown + 2, len(central))),
            "roll_points_mm": points.tolist(), "roll_centre_mm": centre.tolist(),
            "roll_radius_mm": float(np.linalg.norm(points[0] - centre)),
            "neck_depth_mm": float(body[neck, 0]), "neck_setback_mm": float(body[neck, 1]),
            "return_mm": float(abs(central[0, 0] - central[1, 0]))}


def derive(input_path=INPUT_PATH):
    inputs = json.loads(Path(input_path).read_text())
    model, hem, register = validate_sources(inputs)
    joint_path = ROOT / inputs["joint"]["definition"]
    if digest(joint_path) != inputs["joint"]["sha256"]:
        raise ValueError("Source digest differs: Star rail/cover joint")
    joint = json.loads(joint_path.read_text())
    if joint["source"]["sha256"] != inputs["model"]["source_sha256"] \
            or digest(ROOT / joint["derivation"]["recipe"]) != joint["derivation"]["recipe_sha256"]:
        raise ValueError("Star joint source or recipe digest differs")
    tongue_path = ROOT / inputs["tongue"]["definition"]
    if digest(tongue_path) != inputs["tongue"]["sha256"]:
        raise ValueError("Source digest differs: Star tongue/return measurements")
    tongue = json.loads(tongue_path.read_text())
    if tongue["source"]["sha256"] != inputs["model"]["source_sha256"] \
            or digest(ROOT / tongue["derivation"]["recipe"]) != tongue["derivation"]["recipe_sha256"]:
        raise ValueError("Star tongue source or recipe digest differs")
    caps_path = ROOT / inputs["caps"]["definition"]
    if digest(caps_path) != inputs["caps"]["sha256"]:
        raise ValueError("Source digest differs: Star end-cap texture measurements")
    caps = json.loads(caps_path.read_text())
    if caps["source"]["sha256"] != inputs["model"]["source_sha256"] \
            or digest(ROOT / caps["derivation"]["recipe"]) != caps["derivation"]["recipe_sha256"]:
        raise ValueError("Star cap source or recipe digest differs")
    wood_path = ROOT / inputs["wood_uv"]["definition"]
    if digest(wood_path) != inputs["wood_uv"]["sha256"]:
        raise ValueError("Source digest differs: Star whole-rail UV measurements")
    wood_uv = json.loads(wood_path.read_text())
    if wood_uv["source"]["sha256"] != inputs["model"]["source_sha256"] \
            or digest(ROOT / wood_uv["derivation"]["recipe"]) != wood_uv["derivation"]["recipe_sha256"]:
        raise ValueError("Star wood UV source or recipe digest differs")
    grain_path = ROOT / inputs["wood_grain"]["definition"]
    if digest(grain_path) != inputs["wood_grain"]["sha256"]:
        raise ValueError("Source digest differs: packed Star wood-grain measurement")
    wood_grain = json.loads(grain_path.read_text())
    if wood_grain["source"]["sha256"] != inputs["wood_grain"]["blend_sha256"] \
            or wood_grain["source"]["wood_density_sha256"] != inputs["wood_uv"]["sha256"] \
            or digest(ROOT / wood_grain["derivation"]["recipe"]) != wood_grain["derivation"]["recipe_sha256"] \
            or digest(HERE / "read_blend_measurements.py") != wood_grain["derivation"]["reader_sha256"]:
        raise ValueError("Star packed grain source, UV density or recipe digest differs")
    photo_path = ROOT / inputs["wood_photo"]["definition"]
    if digest(photo_path) != inputs["wood_photo"]["sha256"]:
        raise ValueError("Source digest differs: JOY wood-photo consistency measurement")
    wood_photo = json.loads(photo_path.read_text())
    if digest(ROOT / wood_photo["derivation"]["recipe"]) != wood_photo["derivation"]["recipe_sha256"]:
        raise ValueError("JOY wood-photo recipe digest differs")
    if not any(row["sha256"] == wood_photo["source"]["sha256"]
               and row["url"] == wood_photo["source"]["url"] for row in register["official_assets"]):
        raise ValueError("JOY wood-photo source is absent from the official reference register")
    measured = measure_section(model)
    reads = hem["measurements"]
    amplitude = reads["height_course_separation_mm"]["value"]
    period = reads["selected_period_plan_arclength_mm"]["value"]
    template = [[s / period, h] for s, h in reads["period_arclength_relief_mm"]["value"]]
    drop = measured["drop_mm"]
    anchor = max(h for h, _ in measured["body_profile_mm"]
                 if h < drop - amplitude - reads["level_pooling_tolerance_mm"]["value"])
    k = inputs["retained_plan"]["value"]
    half_length = k["C"] - k["Y_CUT"] + np.pi * (k["R"] + k["W_L"]) / 4
    half_count = inputs["hem_count_per_side"]["value"]
    stitch = model["parameters"]["photo_stitch_drop_mm"]
    brown = model["parameters"]["brown_albedo_hex"]
    widths = [k["W_L"], k["A_R"] - k["X_BC"]]
    source_width = measured["source_width_mm"]
    roll_and_shoulder = 2 * measured["roll_radius_mm"] + measured["body_profile_mm"][0][1]
    renderer = (ROOT / "web/scene/table.js").read_text()
    wood, _ = read_retained_plan(renderer, ["R_B", "W_C"])
    bevels = []
    for name in ["cn8LeftRailPlanHalves", "cn8EndRailPlan"]:
        body = renderer.split("function " + name + "(", 1)[1].split("\n}", 1)[0]
        legacy = re.search(r"const BV = ([0-9.]+);", body)
        if legacy:
            bevels.append(float(legacy[1]) * 1000)
        elif "cn8JoyWoodCorner(CN8_R82, sideInset, endInset)" not in body:
            raise ValueError("Retained side bevel is absent from " + name)
    if not bevels:
        bevels = rebuilt_side_bevels_mm(renderer)
    if len(bevels) != 2 or bevels[0] != bevels[1] or wood["R_B"] != wood["W_C"]:
        raise ValueError("Retained wood back-line/arc offset inputs disagree")
    bevel = bevels[0]

    def field(value, tag, basis, **extra):
        return {"value": value, "tag": tag, "basis": basis, **extra}

    parameters = {
        "rail_top_mm": field(k["DECK"], "DERIVED", "Retained CN8_R82.DECK; renderer reads its getter, never a second physical literal."),
        "crown_to_rail_top_mm": field(joint["transfer"]["crown_to_rail_top_mm"]["value"], "MODEL(Star)", "Area-weighted source rail top versus the source crown support plane; only the recorded sub-micron export noise is pooled."),
        "wood_stop_to_cover_end_mm": field(joint["transfer"]["wood_stop_to_cover_end_mm"]["value"], "MODEL(Star)", "Source wood and cover share an axis-aligned butt plane; translate that relation to the held target Y_CUT."),
        "wood_joint_top_inset_mm": field(joint["transfer"]["wood_joint_top_inset_mm"]["value"], "MODEL(Star)", "Mean source rail-top boundary inset from the shared butt plane; the two source end reads differ only by export noise.", digital_source_range_mm=joint["transfer"]["wood_joint_top_inset_mm"]["range_mm"]),
        "wood_joint_top_drop_mm": field(joint["transfer"]["wood_joint_top_drop_mm"]["value"], "MODEL(Star)", "Mean upper butt-edge drop below the rail-top plane.", digital_source_range_mm=joint["transfer"]["wood_joint_top_drop_mm"]["range_mm"]),
        "wood_joint_bevel_interpolation": field(joint["transfer"]["wood_joint_bevel_interpolation"]["value"], "EST", "Only the two source intercepts are measured; the straight interpolation is a prototype closure rule."),
        "wood_side_bevel_mm": field(bevel, "EST", "Retained side bevel read from its two shipped sites, which must agree: the railWoodOpts bevelSize and the cn8JoyWoodCorner `across` literal; no new physical bevel dimension."),
        "wood_back_arc_offset_mm": field({"drawing_radius_mm": wood["R_B"],
            "before_mid_radius_mm": wood["R_B"] - bevel,
            "after_mid_radius_mm": wood["R_B"] + bevel,
            "before_top_radius_mm": wood["R_B"] - 2 * bevel,
            "after_top_radius_mm": wood["R_B"],
            "mid_radius_delta_mm": 2 * bevel, "top_radius_delta_mm": 2 * bevel},
            "DERIVED", "FIX1 corrected R_B-BV to R_B+BV before layer inset, so the top lands on the signed drawing arc and the offset arc is tangent to W_C-BV. The 7 mm wood-plan correction is intentional; cover-plan invariance does not assert wood-plan invariance.",
            depends_on=["wood_side_bevel_mm", "retained CN8_R82.R_B/W_C"],
            drawing={"file": "proposal_rev8_2.json", "sha256": "958b746f2b6490f1171b54a0af1c6db5807d8707e2073817a4284fae0d433554",
                     "letter": "R_N / R_B", "contract": "docs/geometry/cn8-corner-furniture-definition-contract.json", "ancestry": "OWNER signed drawing; bevel input is retained EST"}),
        "cloth_below_cover_upper_plane_mm": tongue["transfer"]["cloth_below_cover_upper_plane_mm"],
        "tongue_return_mapping": field(tongue["transfer"]["mapping"]["value"], "EST", "EST BY CONSTRUCTION: the source does not provide a closed tongue/inner-lip contact. MODEL end-face angle, plan gap and inner-most lip height are measured but NOT EMITTED; the tongue end remains the retained r30 curl, tagged EST."),
        "tongue_return_closure_mm": field([0, 0], "EST", "ORDER-8 target construction contract: no positive cloth-to-return step and no exposed plan point. Proud tip = 0 is EST BY CONSTRUCTION, not a measured source match; the actual-buffer residual is a separate DERIVED verification."),
        "return_lip_height_interval_mm": field([k["H_NOSE"] + tongue["transfer"]["cloth_below_cover_upper_plane_mm"]["value"], k["DECK"]], "EST", "Clip the inner MODEL-radius quarter-roll above the retained cloth support plus the measured cloth recess. The target nose height and deck are held; the outer neck/body is unchanged."),
        "star_section_width_mm": field(source_width, "MODEL(Star)", "Maximum minus minimum radial coordinate of the raw Star central section."),
        "joy_annulus_central_terminal_mm": field(widths, "DERIVED", "Retained MFR/owner plan: W_L at the diagonal and A_R minus X_BC at the rail cut. The printed manufacturer dimensions set A_R."),
        "plan_span_mapping": field([width - source_width for width in widths], "DERIVED", "Additional crown span at diagonal/terminal = JOY annulus minus Star section width; the unscaled source rolls/body retain their physical dimensions.", units="mm", depends_on=["joy_annulus_central_terminal_mm", "star_section_width_mm"]),
        "flat_crown_span_mm": field([width - roll_and_shoulder for width in widths], "DERIVED", "Guaranteed flat crown between the two MODEL-radius footprints at diagonal/terminal. Where the shared mating plane reaches the crown, the clipped inner roll also becomes a flat land; that additional patch is separately disclosed.", formula="width(station) - 2 * roll_radius_mm - body_profile_mm[0][1]"),
        "terminal_crown_land_mm": field(measured["roll_radius_mm"], "DERIVED", "Additional terminal flat land created where the EST shared mating plane reaches the crown; the footprint is one MODEL roll radius. It is not a measured flat Star crown."),
        "section_interpolation": field("Retired central-to-terminal source loft; the same measured central body follows the changing target width", "EST", "ORDER-7's gap-fill uses the unscaled central neck/body and measured roll radius, so the photo-scaled terminal loft no longer supplies a section; the dead mix path is removed."),
        "terminal_fold": field("Retired separate Star terminal fold; close the terminal cut with the central section and the numeric EST wall gauge", "EST", "The closed prototype uses one central-section construction at the measured shared butt plane; it does not claim a measured closed Q8Pro terminal thickness."),
        "cover_drop_mm": field(drop, "MODEL(Star)", "Raw central section crown minus outer hem; cross-model, no photo height scale."),
        "neck_depth_mm": field(measured["neck_depth_mm"], "MODEL(Star)", "Crown-relative depth of the raw outer section's maximum setback."),
        "neck_setback_mm": field(measured["neck_setback_mm"], "MODEL(Star)", "Raw outer section setback from its outermost radial extent."),
        "roll_radius_mm": field(measured["roll_radius_mm"], "MODEL(Star)", "Circumcircle through the three measured points ending at the source crown maximum."),
        "model_return_mm": field(measured["return_mm"], "MODEL(Star)", "Whole horizontal return span at the source inner hem; not a wall-thickness scan."),
        "shell_gauge_mm": field(measured["return_mm"], "EST", "The numeric whole MODEL return is mapped to a closed wall gauge. The open source is not a thickness scan; weakest-link EST applies to the renderer-consumed parameter."),
        "gauge_mapping": field({"d2_est_mm": model["parameters"]["shell_gauge_mm"]["value"], "d3_published_model_tag_mm": measured["return_mm"], "d3_fix1_est_mm": measured["return_mm"]}, "EST", "D2 halved the measured return for a folded two-layer assumption; D3 used the whole return for a closed offset shell. FIX1 corrects the numeric parameter's grade to EST without changing its consumed value; the MODEL whole-return measurement remains separate."),
        "hem_amplitude_mm": field(amplitude, "MODEL(Star)", "Height separation of the complete component's two lowest physical boundary courses.",
            digital_source_spread_mm=reads["height_course_separation_mm"]["digital_source_spread_mm"],
            uncertainty="Digital source spread only; no physical Q8Pro manufacturing tolerance is claimed."),
        "hem_transition_start_mm": field(anchor, "MODEL(Star)", "Last measured body knot above the highest installed hem course; neck and upper body stay unscaled."),
        "hem_source_period_mm": field(period, "MODEL(Star)", "Complete side cycle nearest the central section, excluding the plateau crossing the symmetry plane."),
        "hem_lobes_per_half": field(half_count, "PHOTO", inputs["hem_count_per_side"]["basis"],
            observed_interval=inputs["hem_count_per_side"]["observed_interval"]),
        "hem_count": field(2 * half_count, "DERIVED", "Mirror the recorded per-side PHOTO integer; the Star source count is not installed."),
        "hem_period_installed_mm": field(float(half_length / half_count), "DERIVED", "Retained analytic outer half-path length divided by the PHOTO per-side count."),
        "hem_placement": field("Repeat the measured side-period polyline and mirror it on the retained path", "DERIVED", "Normalized phase changes spacing only. No authored rounded or sinusoidal wave."),
        "lowest_course_interpolation": field("Interpolate only below the last source knot above the highest hem course", "EST", "A ruled correspondence closes the prototype; all upper-body and neck source depths remain unchanged."),
        "stitch_drop_mm": field(stitch["value"], "EST", inputs["stitch_rule"]["value"],
            read_only_uncertainty_mm=stitch["read_only_uncertainty_mm"], uncertainty=stitch["uncertainty"],
            depends_on=["D2-EST-camera", "D2-PHOTO-stitch-read"]),
        "brown_albedo_hex": field(brown["value"], "EST", "Retain the D1/D2 working brown, roughness and micro-grain; no B1 ratio fitting.", uncertainty=brown["uncertainty"]),
        "grain_repeat_mm": inputs["grain_repeat_mm"],
        "cap_uv_mapping": field(caps["transfer"]["value"], "DERIVED",
            "The Star end planes have Leather diffuse-texture assignments and nonzero UV areas. Retain texture intent, use an independent orthonormal cap UV channel at the existing EST repeat; no source UV coordinates or texture pixels are copied.",
            depends_on=["grain_repeat_mm", "STAR-cap-X", "STAR-cap-Y"]),
        "wood_uv_spans": field(wood_uv["transfer"]["family_spans"], "EST", wood_uv["transfer"]["value"],
            status="RETIRED / FIX3 occupancy transfer, not a renderer input",
            depends_on=["STAR-wood-" + row["object"] for row in wood_uv["rails"]]),
        "wood_grain_repeat_mm": field(wood_uv["shared_body_density"]["along_across_repeat_mm"], "DERIVED",
            wood_uv["shared_body_density"]["formula"],
            depends_on=["STAR-wood-" + row["object"] for row in wood_uv["rails"]]),
        "wood_phase_reference_repeat": field(wood_uv["phase_reference"]["repeat"], "DERIVED",
            wood_uv["phase_reference"]["role"], source=wood_uv["phase_reference"]["functions"]),
        "wood_grain_transfer": field(wood_uv["transfer"]["value"], "EST",
            "Physical UV atlas density is measured on the Star upper body planes. The packed Blender bitmap and its active UV/color path supply separate millimetre grain evidence; assigning that density to the retained procedural bitmap remains a cross-model material mapping. The JOY grain camera remains unbound.",
            depends_on=["wood_grain_repeat_mm"]),
        "wood_uv_mapping": field(wood_uv["transfer"]["construction"]["formula"], "DERIVED",
            "Keep one physical repeat on all six planks. Separate each body-axis and horizontal-cap planar domain through material groups. Derive its offset from its own bounds and retain raw UVs and bitmap bytes, including the shared-plan-edge U1 cure. No offset is tuned from a rendered strip.",
            depends_on=["wood_grain_repeat_mm", "wood_phase_reference_repeat"]),
        "wood_sampler_ownership": field("Each style receives fresh owned normal-map samplers from unrendered factory sources; each CN8 plank/domain clones every sampler before its own transform writes", "DERIVED",
            "The measured b611 settings sequence writes the shared clearcoatNormalMap matrix through Three.refreshMaterialUniforms when an active clearcoat is drawn. Predator's inactive clearcoat then retained that prior matrix. Cloning factory sampler state per style makes its descriptor match a direct build; pixel sources and material values are unchanged. This is resource ownership, not a grain or luminance adjustment."),
        "mouth_occluder": field("Raycast the Float32 triangles from the same D3 cover builder; all profile stations and both caps are included", "DERIVED",
            "ORDER-11 retires the deck/boot proxy planes. The cover profile is MODEL(Star), with the existing DERIVED/EST transfer. Acceleration boxes partition these triangles only and never substitute an authored occluder volume.",
            depends_on=["crown_to_rail_top_mm", "cover_drop_mm", "plan_span_mapping", "section_interpolation"]),
    }
    result = {
        "schema": "ob-cn8-d3-section/2",
        "status": "Source-defined D3 input; acceptance and geometry digests live in cn8-pocket-d3-seal.json",
        "source_ruling": "ORDER-7 STEP-3 MODEL FALLBACK",
        "source": {"model_sha256": model["source"]["sha256"],
                   "model_section_sha256": inputs["model"]["section_sha256"],
                   "model_hem_sha256": inputs["hem"]["sha256"],
                   "model_joint_sha256": inputs["joint"]["sha256"],
                   "model_tongue_sha256": inputs["tongue"]["sha256"],
                   "model_caps_sha256": inputs["caps"]["sha256"],
                   "model_wood_uv_sha256": inputs["wood_uv"]["sha256"],
                   "model_wood_grain_sha256": inputs["wood_grain"]["sha256"],
                   "identity": "Purchased Star/XingPai Plane.065; cross-model component construction"},
        "derivation": {"input": "docs/geometry/cn8-pocket-d3-source-inputs.json", "input_sha256": digest(input_path),
                       "recipe": "tools/render/ghcn8/derive_d3_section.py", "recipe_sha256": digest(__file__),
                       "boundary": "Measurement-density 2D sections and edge polylines only. No source XYZ/index arrays, raster bytes, dense point clouds or private camera calibration."},
        "reference_register": inputs["reference_register"],
        "photo_camera": {"tag": "EST", "metric_camera_of_record": None,
                         "role": "CONSISTENCY ONLY", **register["conditional_source_pose"],
                         "uncertainty": "All selected official-image held-out arms failed. The conditional pose supplies no metric geometry parameter."},
        "parameters": parameters,
        "joint_measurement": inputs["joint"], "source_datums": joint["source_datums"],
        "tongue_measurement": inputs["tongue"], "tongue_support": inputs["tongue_support"],
        "cap_measurement": inputs["caps"],
        "wood_uv_measurement": inputs["wood_uv"],
        "wood_grain_measurement": inputs["wood_grain"],
        "wood_photo_measurement": inputs["wood_photo"],
        "joint_polygon_offset": joint["transfer"]["polygon_offset"],
        "source_profile_mm": measured["source_profile_mm"],
        "body_profile_mm": measured["body_profile_mm"],
        "body_source_indices": measured["body_source_indices"],
        "roll_points_mm": measured["roll_points_mm"], "roll_centre_mm": measured["roll_centre_mm"],
        "hem_template_phase_mm": template,
        "sampling": inputs["sampling"], "protected_plan": inputs["retained_plan"],
        "retained_code": inputs["retained_code"],
        "construction_limits": [register["owner_card_first_line"],
            "The purchased hem is step-shaped. This cross-model prototype does not claim the rounded Q8Pro photo silhouette as a metric section.",
            "The PHOTO count is installed on both retained analytic half-paths; the purchased whole-component count is superseded.",
            "The full return is a MODEL measurement, while mapping it to a closed prototype wall is EST.",
            "The broad flat crown is DERIVED from the target annulus and Star roll/body spans; it is not a measured flat patch on the source model.",
            joint["transfer"]["butt_plane_mapping"]["value"],
            joint["transfer"]["shared_face_policy"]["value"],
            tongue["transfer"]["matched_contact"]["basis"],
            "The target shared return is EST BY CONSTRUCTION: the tongue end remains the retained r30 curl (EST). MODEL end-face angles, plan gaps and the separated inner-most lip heights are measured but NOT EMITTED. Proud tip = 0 is a construction contract, not a measured source match; only the measured upper-plane cloth recess transfers directly.",
            "FIX1 wood back-arc offset changed R_B-BV to R_B+BV: body radius 41.5 to 48.5 mm and top radius 38 to 45 mm, DERIVED from the signed drawing and retained EST bevel. The plan-invariance arm covers the cover plan only.",
            "The source neck stays at its measured depth and setback. Only the lowest course is interpolated to the measured hem relief.",
            "Cap texture intent is MODEL(Star), cross-model: both terminal planes have nondegenerate Leather UVs. The source bitmap is not embedded in the FBX; no photographed grain-frequency match is claimed. The cap plane uses the same retained EST repeat as the skin, through a separate UV/material binding.",
            "The six Star Mahogany rail bodies each occupy one unit UV tile. FIX3's per-plank span fit is retired. The new common physical atlas period is DERIVED from measured upper-body-plane UV density; its transfer to the procedural grain is EST. Body/cap offsets are DERIVED separately, with no per-plank scale. Packed Blender grain measurements are comparison evidence only: existing procedural pixels and material class are retained, no source pixels or material graph are installed, and no metric JOY wood-grain measurement is claimed.",
            "The existing net, gathering band, material class, stitch height and protected kernel/construction datums are retained."]}
    return result, make_ledger(result)


def count_numbers(value):
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return 1
    if isinstance(value, list):
        return sum(map(count_numbers, value))
    if isinstance(value, dict):
        return sum(map(count_numbers, value.values()))
    return 0


def make_ledger(definition):
    inputs = json.loads((ROOT / definition["derivation"]["input"]).read_text())
    hem = json.loads((ROOT / inputs["hem"]["definition"]).read_text())
    joint = json.loads((ROOT / inputs["joint"]["definition"]).read_text())
    tongue = json.loads((ROOT / inputs["tongue"]["definition"]).read_text())
    caps = json.loads((ROOT / inputs["caps"]["definition"]).read_text())
    wood = json.loads((ROOT / inputs["wood_uv"]["definition"]).read_text())
    wood_grain = json.loads((ROOT / inputs["wood_grain"]["definition"]).read_text())
    wood_photo = json.loads((ROOT / inputs["wood_photo"]["definition"]).read_text())
    rows = [{"id": "PARAM-" + name, **field} for name, field in definition["parameters"].items()]
    for name in ["mfr_outer_envelope_mm", "mfr_playing_dimensions_mm", "mfr_print_crop_px", "hem_count_per_side", "retained_plan", "sampling", "tongue_support"]:
        rows.append({"id": "INPUT-" + name, **inputs[name]})
    model_sha = definition["source"]["model_sha256"]
    for name, key in [("STAR-central", "source_profile_mm"), ("STAR-roll", "roll_points_mm"),
                      ("STAR-roll-centre", "roll_centre_mm"), ("BODY", "body_profile_mm")]:
        rows.append({"id": name, "tag": "MODEL(Star)", "value": definition[key], "source_sha256": model_sha})
    rows.extend([
        {"id": "BODY-source-indices", "tag": "DERIVED", "value": definition["body_source_indices"],
         "scope": "Indices of the delivered 2D section only, never source mesh indices."},
        {"id": "HEM-template", "tag": "DERIVED", "value": definition["hem_template_phase_mm"],
         "coordinate_ancestry": ["Normalized arclength: DERIVED", "Relief: MODEL(Star)"],
         "depends_on": ["STAR-hem-period_arclength_relief_mm"]},
        {"id": "CAMERA", "tag": "EST", "value": "Conditional photo pose; consistency only, no metric geometry dependency"}])
    rows.extend({"id": "STAR-hem-" + name, **field} for name, field in hem["measurements"].items())
    rows.extend({**row, "id": "STAR-joint-" + row["id"]} for row in joint["joints"])
    rows.extend({**row, "id": "STAR-tongue-" + row["id"]} for row in tongue["joints"])
    rows.extend({"id": "STAR-cap-" + row["axis"], **row} for row in caps["ends"])
    rows.extend({"id": "STAR-cap-" + key, **caps[key]} for key in ["numeric_pooling", "texture_assignments"])
    rows.extend({"id": "STAR-wood-" + row["object"], **row} for row in wood["rails"])
    rows.extend({"id": "STAR-wood-" + key, **wood[key]} for key in ["numeric_pooling", "texture_assignments"])
    rows.extend({"id": "STAR-grain-" + str(i), **row} for i, row in enumerate(wood_grain["transects"]))
    rows.extend({"id": "STAR-grain-" + key, **wood_grain[key]}
                for key in ["source", "material_binding", "protocol", "transfer"])
    rows.extend({"id": "JOY-wood-photo-" + str(row["ordinal"]), **row} for row in wood_photo["transects"])
    rows.extend({**wood_photo[key], "id": "JOY-wood-photo-" + key}
                for key in ["source", "sampling", "crop", "camera", "physical_pitch"])
    rows.extend({"id": "STAR-tongue-" + key, **tongue[key]} for key in ["measurement_window", "numeric_pooling"])
    rows.extend([{ "id": "STAR-joint-source-datums", **joint["source_datums"] },
                 { "id": "STAR-joint-numeric-pooling", **joint["numeric_pooling"] },
                 { "id": "RENDER-shared-face-policy", **definition["joint_polygon_offset"] }])
    census = {}
    for row in rows:
        entry = census.setdefault(row["tag"], {"rows": 0, "numeric_scalars": 0})
        entry["rows"] += 1
        entry["numeric_scalars"] += count_numbers(row)
    return {"schema": "ob-cn8-d3-ledger/2", "status": definition["status"], "rows": rows, "census": census,
            "count_note": "Every numeric member in each row is counted, including bounds and repeated derived values. These are not independent measurements.",
            "provenance_rule": "Metric PHOTO over an EST camera is refused structurally. Direct photo counts remain PHOTO; MODEL fallback lengths do not depend on the conditional camera."}


def provenance_failures(definition, ledger):
    failures = []
    by_id = {row["id"]: row for row in ledger["rows"]}
    if len(by_id) != len(ledger["rows"]):
        failures.append("census: duplicate ledger row id")
    expected = make_ledger(definition)
    if set(by_id) != {row["id"] for row in expected["rows"]}:
        failures.append("census: ledger row set differs")
    for row in expected["rows"]:
        if by_id.get(row["id"]) != row:
            failures.append(f"census: {row['id']} differs from its source")
    if ledger["census"] != expected["census"]:
        failures.append("census: numeric-value counts differ")
    fields = definition["parameters"]
    structural = ["cover_drop_mm", "neck_depth_mm", "neck_setback_mm", "roll_radius_mm", "hem_amplitude_mm"]
    for name in structural + ["stitch_drop_mm"]:
        if definition["photo_camera"]["tag"] == "EST" and fields[name]["tag"] == "PHOTO":
            failures.append(f"census: REFUSE PARAM-{name}: PHOTO-over-EST-camera")
    for name in structural:
        if fields[name]["tag"] != "MODEL(Star)":
            failures.append(f"fallback: PARAM-{name} must retain MODEL(Star)")
    if fields["stitch_drop_mm"]["tag"] != "EST" or not fields["stitch_drop_mm"].get("uncertainty"):
        failures.append("fallback: inherited stitch must retain its EST camera uncertainty")
    if fields["cap_uv_mapping"]["tag"] != "DERIVED" or fields["grain_repeat_mm"]["tag"] != "EST":
        failures.append("cap: derived plane mapping must retain the EST texture repeat")
    if fields["wood_uv_spans"]["tag"] != "EST" or fields["wood_uv_mapping"]["tag"] != "DERIVED":
        failures.append("wood: retired cross-model occupancy remains EST; offset mapping is DERIVED")
    for spans in fields["wood_uv_spans"]["value"].values():
        if len(spans) != 2 or any(not 0 < value < 1 for value in spans):
            failures.append("wood: historical source occupancy must remain inside one texture tile")
    wood = json.loads((ROOT / definition["wood_uv_measurement"]["definition"]).read_text())
    if fields["wood_phase_reference_repeat"]["tag"] != "DERIVED" \
            or fields["wood_phase_reference_repeat"]["value"] != wood["phase_reference"]["repeat"]:
        failures.append("wood: phase registration must bind to the retained sampler measurement")
    if fields["wood_grain_repeat_mm"]["tag"] != "DERIVED" \
            or fields["wood_grain_repeat_mm"]["value"] != wood["shared_body_density"]["along_across_repeat_mm"] \
            or fields["wood_grain_transfer"]["tag"] != "EST":
        failures.append("wood: shared measured density must stay DERIVED and its material transfer EST")
    if fields["mouth_occluder"]["tag"] != "DERIVED":
        failures.append("occlusion: the shadow caster must be derived from the emitted cover definition")
    photo = json.loads((ROOT / definition["wood_photo_measurement"]["definition"]).read_text())
    if photo["camera"]["metric_camera_of_record"] is not None \
            or photo["physical_pitch"]["value_mm"] is not None or photo["physical_pitch"]["tag"] != "EST":
        failures.append("wood: unbound photo camera cannot supply a millimetre grain pitch")
    grain = json.loads((ROOT / definition["wood_grain_measurement"]["definition"]).read_text())
    if grain["source"]["wood_density_sha256"] != definition["source"]["model_wood_uv_sha256"] \
            or grain["transfer"]["tag"] != "EST" or not all(row["tag"].startswith("MODEL(Star)") for row in grain["transects"]):
        failures.append("wood: packed grain is MODEL evidence and the procedural appearance transfer remains EST")
    if by_id.get("BODY", {}).get("tag") != "MODEL(Star)":
        failures.append("fallback: body must retain MODEL(Star)")
    if fields["shell_gauge_mm"]["tag"] != "EST" or fields["gauge_mapping"]["tag"] != "EST":
        failures.append("gauge: renderer-consumed wall thickness must be numeric EST, not MODEL")
    mapping = fields["gauge_mapping"]["value"]
    if not isinstance(mapping, dict) or mapping.get("d3_fix1_est_mm") != fields["shell_gauge_mm"]["value"] \
            or fields["shell_gauge_mm"]["value"] != fields["model_return_mm"]["value"] \
            or mapping.get("d2_est_mm") != fields["model_return_mm"]["value"] / 2:
        failures.append("gauge: numeric D2/D3 mapping does not list the consumed wall value")
    if fields["hem_lobes_per_half"]["value"] != 7 or fields["hem_lobes_per_half"]["tag"] != "PHOTO":
        failures.append("hem: record must be seven per side PHOTO")
    if fields["hem_count"]["value"] != 14 or fields["hem_count"]["tag"] != "DERIVED":
        failures.append("hem: mirrored whole count must be fourteen DERIVED")
    amplitude = fields["hem_amplitude_mm"]
    lo, hi = amplitude["digital_source_spread_mm"]
    if not 0 < lo <= amplitude["value"] <= hi or max(h for _, h in definition["hem_template_phase_mm"]) != amplitude["value"]:
        failures.append("hem: relief differs from the measured source courses")
    if definition["photo_camera"]["metric_camera_of_record"] is not None:
        failures.append("fallback: a metric camera requires the PHOTO branch instead")
    return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, help="Output directory; default is a new temporary directory")
    args = parser.parse_args()
    out = args.out or Path(tempfile.mkdtemp(prefix="cn8-d3-derive-"))
    out.mkdir(parents=True, exist_ok=True)
    definition, ledger = derive()
    failures = provenance_failures(definition, ledger)
    if failures:
        raise ValueError("; ".join(failures))
    for name, value in [("cn8-pocket-d3-section.json", definition), ("cn8-pocket-d3-ledger.json", ledger)]:
        (out / name).write_text(json.dumps(value, indent=2) + "\n")
    print(out)


if __name__ == "__main__":
    main()
