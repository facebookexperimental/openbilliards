#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Assemble the O22 engineering pack from bound, archive-produced evidence.

The third register panel is the labelled OEM/dealer reference, never a render
of the quarantined purchased model. Only section measurements represent that
model. --preview is conspicuously unsealed; a final pack requires archive PASS
or the explicitly named PASS-WITH-RULED-RED (f remains RED-BY-LAW),
all negative arms behaving, the full control proof and a passing tag census.
"""
import sys
sys.dont_write_bytecode = True
import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import shutil
import textwrap

from PIL import Image, ImageDraw, ImageEnhance, ImageFont
from matplotlib import font_manager

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "tools/render/d621/plan"))
import idmap_621 as idmap  # noqa: E402
SIZES = ("9ft", "8ft", "7ft")
DRAWING_SHEETS = ("s2-side", "s4-rail-apron-elevation")
# DERIVED: cushion_sheets_621.py emits these MODEL_RAILS names as file stems.
RAIL_STEMS = ("long_plusy_a", "long_plusy_b", "long_minusy_a", "long_minusy_b", "short_plusx", "short_minusx")


# DERIVED: the standing r8 station declarations in asmodeled-drawings-488d.mjs.
# feature identifies the lettered dimension; measures identifies its station.
# A..CA are the independent sheet labels. These are required keys, never
# inferred from a supplied result. Station text changes require a census edit.
LETTER_STATIONS = (
    ('A', 'PF-01', 'playfield length, nose plane to nose plane (x)'),
    ('B', 'PF-01', 'playfield width, nose plane to nose plane (z)'),
    ('C', 'CU-03', 'cushion nose crest height above the bed'),
    ('D', 'CU-04', 'cushion width, nose plane to back plane'),
    ('E', 'CU-09', 'rubber-rail top plane above the bed'),
    ('F', 'CU-11', 'nose edge radius (circle fit over the crest arc rows)'),
    ('G', 'CU-12', 'section base station, depth at the bed'),
    ('H', 'CU-12', 'section top station, depth at the rubber top'),
    # DERIVED: continued station identifiers; no numeric acceptance thresholds.
    ('I', 'CU-08', 'cloth-relief crease height above the bed'),
    ('J', 'CU-10', 'sub-rail bevel of the cushion rear face (deg)'),
    ('K', 'RB-01', 'rail band, nose plane to rail-top outer edge'),
    ('L', 'RB-02', 'rail-top plane above the bed'),
    ('M', 'RB-03', 'sight inset from the nose line (long rail)'),
    ('N', 'RB-03', 'sight inset from the nose line (short rail)'),
    ('O', 'RB-04', 'sight pitch along the long rail (median of the run)'),
    ('P', 'RB-05', 'sight rhombus long axis'),
    # DERIVED: continued station identifiers; no numeric acceptance thresholds.
    ('Q', 'RB-05', 'sight rhombus short axis'),
    ('R', 'CP-01', 'corner mouth chord, crest tangency P to P'),
    ('S', 'CP-02', 'corner facing (miter) angle, 90 + facing tilt (deg)'),
    ('T', 'CP-06', 'corner jaw radius implied by the P/F tangency construction'),
    ('U', 'CP-06', 'corner jaw arc sagitta realized between P and F'),
    ('V', 'CP-07', 'corner fall-wall radius (CP-07 + CP-11 wall offset)'),
    ('W', 'CP-08', 'corner pocket depth, nose-line intersection to capture centre'),
    ('X', 'CP-04', 'corner shelf implied by depth + mouth/2 - capture radius'),
    # DERIVED: continued station identifiers; no numeric acceptance thresholds.
    ('Y', 'CP-09', 'facing under-cut from vertical, below the nose plane (deg)'),
    ('Z', 'CP-15', 'corner block chamfer leg at the crown edge (RC-01)'),
    ('AA', 'CP-11', 'boot ring throat apex from the ring centre (throat_centre + throat_r − centre; MODEL circles, D621-PLAN-1)'),
    ('AB', 'CP-11', 'boot ring outer wall radius about the ring centre (MODEL, D621-PLAN-1)'),
    ('AC', 'CP-11', 'boot ring centre out along the diagonal from the nose intersection (MODEL, D621-PLAN-1) — via the fall-lip (kernel) centre + the declared offset'),
    ('AD', 'CP-11', 'boot ring apex band: outer wall radius − throat apex about the ring centre (D621-PLAN-1)'),
    ('AE', 'CP-11', 'boot-collar crest proud of the cap top (RB-02 plane)'),
    ('AF', 'CP-11', 'boot outer wall top above the bed at the apex (bearing <= 15° from the outboard axis; top_profile 0° row)'),
    # DERIVED: continued station identifiers; no numeric acceptance thresholds.
    ('AG', 'CP-11', 'boot outer wall top at the tangent rows (bearing >= 75°; MODEL top_profile 90° row, D621-PLAN-2)'),
    ('AH', 'CP-11', 'boot arm outer wall top along the legs (highest leg span; MODEL top_profile leg rows, D621-PLAN-2)'),
    ('AI', 'CP-11', 'boot crest above the bed'),
    ('AJ', 'CP-11', 'boot skirt (throat sleeve) below the bed'),
    ('AK', 'CP-11', "boot arm run from the tangent row to the arm end on the glue plane, at the arm's highest outer-wall row (leg wall top 44.6, top_profile; DERIVED centre + R_out − √2·glue(y), D621-PLAN-1/2)"),
    ('AL', 'SP-01', 'side mouth chord, crest tangency P to P'),
    ('AM', 'SP-02', 'side facing (miter) angle, 90 + facing tilt (deg)'),
    ('AN', 'SP-06', 'side jaw radius implied by the P/F tangency construction'),
    # DERIVED: continued station identifiers; no numeric acceptance thresholds.
    ('AO', 'SP-06', 'side jaw arc sagitta realized between P and F'),
    ('AP', 'SP-07', 'side fall-wall radius (SP-07 + CP-11 wall offset)'),
    ('AQ', 'SP-08', 'side pocket depth, nose line to capture centre (trap cup semicircle axis — the boot ring is on the model centre, D621-PLAN-1)'),
    ('AR', 'SP-04', 'side shelf implied by depth - capture radius'),
    ('AS', 'SL-01', 'side opening radius (roll bed-edge arc fit)'),
    ('AT', 'SL-01', 'side opening centre outboard of the nose line'),
    ('AU', 'SL-01', 'side opening apex shelf (centre − radius, from the nose line)'),
    ('AV', 'SL-01', 'roll arc end lateral = opening edge ∩ facing feet (derived from SP-01/SP-02)'),
    # DERIVED: continued station identifiers; no numeric acceptance thresholds.
    ('AW', 'SP-10', 'side D throat apex from the ring centre (throat_centre + throat_r − centre; MODEL circles, D621-PLAN-1)'),
    ('AX', 'SP-10', 'side D outer wall radius about the ring centre (MODEL, D621-PLAN-1)'),
    ('AY', 'SP-10', 'side D apex band: outer wall radius − throat apex about the ring centre (D621-PLAN-1)'),
    ('AZ', 'SP-10', 'side boot crest proud of the cap top'),
    ('BA', 'SP-10', 'side boot outer wall top above the bed at the apex (bearing <= 15°; top_profile 0° row)'),
    ('BB', 'SP-10', 'side D outer wall top at the tangent rows (bearing >= 75°; MODEL top_profile 90° row, D621-PLAN-2)'),
    ('BC', 'SP-10', 'side boot skirt below the bed'),
    ('BD', 'SP-10', "side D front on the glue plane: reach in front of the tangent row at the family's lowest above-bed row (y 21; DERIVED centre − glue(y), D621-PLAN-1)"),
    # DERIVED: continued station identifiers; no numeric acceptance thresholds.
    ('BE', 'EN-01', 'assembly hard extreme, length'),
    ('BF', 'EN-01', 'assembly hard extreme, width'),
    ('BG', 'EN-02', 'rail-stack extreme above the floor'),
    ('BH', 'EN-03', 'bed (playing surface) above the floor'),
    ('BI', 'EN-04', 'rail stack, bed to rail-top extreme'),
    ('BJ', 'EN-05', "leg footprint spacing, long axis (leg outer faces at the floor: leveler centres + the columns' sole width)"),
    ('BK', 'EN-05', "leg footprint spacing, short axis (leg outer faces at the floor: leveler centres + the columns' sole width)"),
    ('BL', 'EN-06', 'underside clearance, floor to the cabinet (body) bottom'),
    # DERIVED: continued station identifiers; no numeric acceptance thresholds.
    ('BM', 'AB-01', 'apron band height'),
    ('BN', 'AB-01', 'apron band face lean, out going up (deg)'),
    ('BO', 'AB-01', 'apron band top lip inset from the cap outer edge'),
    ('BP', 'CB-01', 'cabinet recess: cap outer edge to the end wall (top)'),
    ('BQ', 'CB-01', 'cabinet recess: cap outer edge to the side panel (top)'),
    ('BR', 'CB-01', 'cabinet top below the bed'),
    ('BS', 'CB-01', 'cabinet bottom above the floor (= EN-06)'),
    ('BT', 'LG-01', 'leg width at the foot'),
    # DERIVED: continued station identifiers; no numeric acceptance thresholds.
    ('BU', 'LG-01', 'leg taper (mm of width per mm of height)'),
    ('BV', 'LG-01', 'leg foot above the floor'),
    ('BW', 'LG-01', 'leg top = the apron band bottom'),
    ('BX', 'PC-01', 'trap cup half-width (lateral from the pocket axis)'),
    ('BY', 'PC-01', 'trap cup inboard run from the ring centre (corner)'),
    ('BZ', 'PC-01', 'trap cup top below the bed'),
    ('CA', 'PC-01', 'trap cup bottom below the bed (corner: 1 above the leg top, PC-01 corner_floor_rule)'),
)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def require_unique_keys(name, keys, expected):
    """Every required evidence key occurs once, with no extra or duplicate key.

    Canonical JSON preserves compound station keys and distinguishes identity
    integers from booleans, floats and strings. Diagnostics retain actual names.
    """
    counts = Counter(json.dumps(key, sort_keys=True) for key in keys)
    required = {json.dumps(key, sort_keys=True) for key in expected}
    # DERIVED: multiplicity is exactly one for each required evidence key.
    duplicated = [key for key in sorted(counts) if counts[key] > 1]
    missing = sorted(required - counts.keys())
    extra = sorted(counts.keys() - required)
    require(not duplicated and not missing and not extra,
            f"{name} key census: duplicated=[{', '.join(duplicated)}]; "
            f"missing=[{', '.join(missing)}]; extra=[{', '.join(extra)}]")


def bind_evidence(name, evidence, expected):
    """One fail-closed binding for PLAN, sections, letters and their gate anchors.

    Fields are dotted JSON paths; missing/malformed parents never fall back to
    a mutable input path. Missing expectations must not authorize missing data.
    """
    for field, bound in expected.items():
        supplied = evidence
        for key in field.split("."):
            supplied = supplied.get(key) if isinstance(supplied, dict) else None
        require(bound is not None and supplied == bound,
                f"{name} {field} mismatch: supplied {supplied!r} != deciding gate/archive {bound!r}")


def bound_before(arms, gate):
    """Resolve BEFORE from the recorded baseline arm, never a supplemental path."""
    require(isinstance(arms, dict), "BEFORE comparison requires --arms with the deciding baseline capture")
    fence_path = "tools/render/d621/law/cushion_fence_621.json"
    bind_evidence("archive BEFORE fence", {"sha256": sha(ROOT / fence_path)},
                  {"sha256": gate["provenance"]["law_files"].get(fence_path)})
    fence = read(ROOT / fence_path)
    bind_evidence("BEFORE arm", arms, {
        "commit": gate["provenance"]["head_commit"],
        "baseline_red.instrument_commit": gate["provenance"]["head_commit"],
        "baseline_red.behaves": True,
        "baseline_red.source_commit": fence["source_commit"],
        "baseline_red.source_table_js_sha256": fence["entry_snapshot"]["source_table_js_sha256"],
    })
    baseline = arms["baseline_red"]
    builds = [build for build in arms.get("builds", [])
              if build.get("commit") and build["commit"] == baseline.get("scratch_commit")]
    require_unique_keys("BEFORE baseline build", (build.get("commit") for build in builds),
                        [baseline.get("scratch_commit")])
    build = builds[0]
    require(isinstance(build.get("durable"), str) and build["durable"],
            "BEFORE arm is missing its durable capture directory")
    directory = Path(build["durable"])
    for relative in ("gate/gate.json", "ours-8ft.json"):
        records = [record for record in build.get("files", []) if record.get("path") == relative]
        require_unique_keys(f"BEFORE archive digest {relative}", (record.get("path") for record in records), [relative])
        bind_evidence(f"BEFORE archive {directory / relative}", {"sha256": sha(directory / relative)},
                      {"sha256": records[0].get("sha256")})
    before_gate = read(directory / "gate/gate.json")
    before_sha256 = sha(directory / "ours-8ft.json")
    bind_evidence("deciding BEFORE gate", before_gate, {
        "provenance.head_commit": baseline["scratch_commit"],
        "provenance.head_commit_table_js_sha256": baseline["source_table_js_sha256"],
        "provenance.ours_dump_sha256": before_sha256,
        "inputs.ours_sha256": before_sha256,
    })
    after_sha256 = gate["plan_gate"]["ours_sha256"]
    require(before_sha256 != after_sha256,
            f"BEFORE before_sha256 equals AFTER after_sha256: {before_sha256}")
    return dict(before_sha256=before_sha256, after_sha256=after_sha256,
                before_gate=str(directory / "gate/gate.json"), before_gate_sha256=sha(directory / "gate/gate.json"))


def require_plan_before(name, plan, law):
    """A comparison needs the measured BEFORE row at every declared pocket/cut."""
    require_unique_keys(f"{name} pockets", plan.get("per_pocket", {}), law["pockets"])
    require(isinstance(plan.get("prev"), str) and plan["prev"],
            f"{name} BEFORE is missing: --prev is required for comparison evidence")
    for pocket in law["pockets"]:
        cuts = plan["per_pocket"].get(pocket, {}).get("cuts", {})
        require_unique_keys(f"{name} {pocket} cuts", cuts, law["cuts"])
        for cut in law["cuts"]:
            row = cuts.get(cut, {})
            require(isinstance(row.get("prev"), dict) and row["prev"] and row.get("prev_ring_iou") is not None,
                    f"{name} BEFORE row is missing/incomplete at {pocket}/{cut}: remeasure with --prev")


def renderer_digest(web_root):
    """Same named-file digest as the letters instrument's HTTP capture."""
    files = {name: sha(web_root / name) for name in
             ("scene/table.js", "scene/shading.js", "scene/clothvisuals.js", "scene/diamondproam_nose.js",
              "scene/diamondproam_corner.js")}
    payload = "".join(f"{name}:{files[name]}\n" for name in sorted(files))
    return dict(sha256=hashlib.sha256(payload.encode()).hexdigest(), files=files)


def bound_twin_svgs(letters_path, letters):
    """Verify generated SVGs against the digests captured in the letters record."""
    twin = letters_path.parent / "twin"
    record = letters.get("twin")
    digests = record.get("svg_sha256") if isinstance(record, dict) else None
    require(isinstance(digests, dict) and bool(digests),
            f"letters {letters_path} requires twin.svg_sha256 recorded at generation time; supplied {digests!r}")
    files = sorted(twin.glob("*.svg"))
    require_unique_keys(f"letters {letters_path} twin SVG files", (file.name for file in files), digests)
    for file in files:
        bind_evidence(f"letters {letters_path} twin SVG {file}", {"sha256": sha(file)},
                      {"sha256": digests[file.name]})
    return digests


def load_bound_letters(letters_root, archive_renderer, model_sha256, definitions):
    law_sha256 = sha(ROOT / "tools/render/d621/law/letters_law_621.json")
    instruments = {name: sha(ROOT / "tools/render/d621/plan" / name)
                   for name in ("letters_sampling_621.mjs", "letters_model_621.mjs")}
    paths = {}
    for size in SIZES:
        letters_path = letters_root / ("letters-" + size) / "letters-compare-488d.json"
        letters = read(letters_path)
        # Runtime letters have no dump input: FIX4 binds the captured source
        # through its served renderer, alongside this size's gate-bound defs.
        bind_evidence(f"letters {letters_path}", letters, {
            "table": "diamond_proam_" + size,
            "served_renderer.sha256": archive_renderer["sha256"],
            "served_renderer.files": archive_renderer["files"],
            "spec_sha256": definitions[size],
            "sampling_method.law_sha256": law_sha256,
            "sampling_method.instruments": instruments,
            "sampling_method.purchased_model.law_sha256": law_sha256,
            "sampling_method.purchased_model.model_obj_set_sha256": model_sha256,
            "evidence_starved": [],
        })
        require_unique_keys(f"letters {letters_path} stations",
                            ((row.get("feature"), row.get("measures")) for row in letters["rows"]),
                            ((feature, station) for label, feature, station in LETTER_STATIONS))
        require_unique_keys(f"letters {letters_path} labels",
                            ((row.get("letter"), row.get("feature"), row.get("measures")) for row in letters["rows"]),
                            LETTER_STATIONS)
        definition = read(ROOT / f"docs/geometry/diamond-proam-{size}-table-definition.json")
        require_unique_keys(f"letters {letters_path} identities", (row.get("n") for row in letters["identities"]),
                            range(len(definition["checks"]["identities"])))
        require(all(row["pass"] for row in letters["rows"])
                and all(row["status"] == "HOLDS" for row in letters["identities"]),
                f"letters {letters_path} or mesh identities are red")
        require(set(row["feature"] for row in letters["rows"] if row.get("secondary")) == {"CP-01", "CP-09"},
                "old CP-01/CP-09 readings must remain secondary")
        bound_twin_svgs(letters_path, letters)
        paths[size] = letters_path
    return paths


def bind_drawings(drawings, drawings_root, letters_paths):
    """Bind original SVG bytes to the canonical twins of the validated letters run."""
    require_unique_keys("drawings sheets", ((row.get("size"), row.get("sheet")) for row in drawings["records"]),
                        ((size, sheet) for size in SIZES for sheet in DRAWING_SHEETS))
    bindings = []
    for row in drawings["records"]:
        name = f"{row['size']}-{row['sheet']}.svg"
        require(row["size"] in letters_paths, "drawing has no bound letters run: " + name)
        twin = letters_paths[row["size"]].parent / "twin"
        canonical = sorted(twin.glob(f"*-{row['sheet']}.svg"))
        # Each match claims this single sheet; a second filename is ambiguous.
        require_unique_keys(f"drawing {name} canonical letters twin in {twin}",
                            ((row["size"], row["sheet"]) for path in canonical), [(row["size"], row["sheet"])])
        supplied_bytes = (drawings_root / name).read_bytes()
        canonical_bytes = canonical[0].read_bytes()
        supplied_sha = hashlib.sha256(supplied_bytes).hexdigest()
        canonical_sha = hashlib.sha256(canonical_bytes).hexdigest()
        # Recheck the recorded binding when consuming the SVGs, so replacing
        # both copies after letters validation cannot authorize stale bytes.
        recorded = bound_twin_svgs(letters_paths[row["size"]], read(letters_paths[row["size"]]))
        recorded_sha = recorded[canonical[0].name]
        bind_evidence(f"drawing {name} letters twin {canonical[0]}", {"sha256": canonical_sha},
                      {"sha256": recorded_sha})
        require(supplied_bytes == canonical_bytes,
                f"drawing {name}: supplied SVG sha256 {supplied_sha} differs from "
                f"bound letters twin {canonical[0]} sha256 {canonical_sha}")
        bindings.append(dict(file=name, svg_sha256=supplied_sha,
                             letters_twin=str(canonical[0]), letters_twin_sha256=canonical_sha,
                             letters_recorded_svg_sha256=recorded_sha))
    return bindings


def selected_frame(directory, register):
    manifest = read(directory / "manifest.json")
    frames = [frame for frame in manifest["frames"] if frame["register"] == register and frame["zoom"] == 1]
    # DERIVED: exactly the requested register at one-times zoom.
    require_unique_keys(f"register {directory}", ((frame["register"], frame["zoom"]) for frame in frames), [(register, 1)])
    source = directory / frames[0]["file"]
    require(sha(source) == frames[0]["sha256"], "register PNG changed after capture")
    return source


def reference_photos(rows, drive_root=None):
    """Each register's reference photo and note (photo_override wins over photo), resolved before the pack writes
    anything. The committed poses-plan3.json names the private dossier as <drive>/..., the project Drive folder:
    --drive-root, else OB_DRIVE_DIR (a relative root resolves against the caller's cwd); without one, or with a photo
    missing there or inside quarantine, the pack refuses by register."""
    drive_root = drive_root or os.environ.get("OB_DRIVE_DIR")
    photos = {}
    for row in rows:
        ref = row.get("photo_override") or dict(path=row["photo"], note=row["photo_note"])
        path = ref["path"]
        if path.startswith("<drive>/"):
            require(drive_root, f"register {row['id']}: {path} needs --drive-root DIR or OB_DRIVE_DIR (the project Drive folder)")
            path = str(Path(drive_root) / path[len("<drive>/"):])
        require(not path.startswith("<"), f"register {row['id']}: unknown placeholder in {path}")
        path = os.path.abspath(path)
        require(Path(path).is_file(), f"register {row['id']}: reference photo not found: {path}")
        require("ob-3dm-quarantine" not in str(Path(path).resolve()), "purchased-model pixels cannot leave quarantine")
        photos[row["id"]] = (Path(path), ref["note"])
    return photos


def require_byte_controls(identity, fence):
    targets = {"diamond_proam_" + size for size in SIZES}
    expected = set(fence["entry_snapshot"]["entries"]) - targets
    require_unique_keys("byte controls", (row.get("table") for row in identity["byte_controls"]), expected)
    require(all(row["identical"] or (idmap.current_table_id(row["table"]) == "pool_pro_9ft_measured" and row.get("accepted") is True)
                for row in identity["byte_controls"]),
            "byte controls require eight identical tables and the ruled owner-alias delta")


def require_section_keys(section):
    for field, suffix in (("sections", "-before-after-model.png"), ("nose_figures", "-nose-facets.png")):
        require_unique_keys(f"sections {field}", section.get(field, []),
                            (f"sections/{rail}{suffix}" for rail in RAIL_STEMS))


def triptych(before, after, photo, output, title, reference_label, reference_note, gain=None, decision_footer=None):
    # TESSELLATION: fixed document layout in pixels; these values never touch the scene.
    margin, width, panel_height, header, footer, gap = 24, 960, 600, 110, 150, 24
    canvas = Image.new("RGB", (margin * 2 + width * 3 + gap * 2, header + panel_height + footer), "white")
    draw = ImageDraw.Draw(canvas)
    font_path = font_manager.findfont("DejaVu Sans")
    title_font = ImageFont.truetype(font_path, 28)
    label_font = ImageFont.truetype(font_path, 23)
    note_font = ImageFont.truetype(font_path, 18)
    draw.text((margin, 18), title, font=title_font, fill="#17212b")
    for ordinal, (file, label, note) in enumerate((
        (before, "BEFORE / fdfd64c0", "Same frozen camera, light rig, tone map and crop as AFTER."),
        (after, "AFTER / O22", "Entry-only R1-R4; MFR upper trace and all kernel datums retained."),
        (photo, reference_label, reference_note),
    )):
        x = margin + ordinal * (width + gap)
        draw.text((x, 70), label, font=label_font, fill="#17212b")
        picture = Image.open(file).convert("RGB")
        if gain is not None and ordinal < 2:  # TESSELLATION: paired display-only lift, never source pixels or scene lighting.
            picture = ImageEnhance.Brightness(picture).enhance(gain)
        picture.thumbnail((width, panel_height), Image.Resampling.LANCZOS)
        canvas.paste(picture, (x + (width - picture.width) // 2, header + (panel_height - picture.height) // 2))
        draw.multiline_text((x, header + panel_height + 12), textwrap.fill(note, 86),
                            font=note_font, fill="#334155", spacing=5)
    bottom = "R1 MODEL 14.58 deg (AZB 465370 alternative); R2 MODEL face-tangent read. Owner alias follows the entry (render only)."
    if decision_footer:
        bottom = decision_footer
    if gain is not None:
        bottom = f"DISPLAY ONLY: BEFORE and AFTER RGB codes multiplied by {gain:g}; not exposure EV, not a seal or lighting change."
    draw.text((margin, canvas.height - 36), bottom, font=note_font, fill="#334155")
    canvas.save(output)


def decision_card(output, decisions, row):
    """R1/R2 and the actual f RED-BY-LAW travel together on the owner card."""
    character = row["ruling"]["characterization"]
    spread, crease = character["station_p90_spread"], character["crease"]
    notes = [*decisions,
             f"Measured f: p90 {row['value']:.6f} mm > unchanged {row['threshold']:.2f} mm; {row['n']}/{row['expected_n']} samples. No compensation or subtraction.",
             f"Station p90 spread: {spread['min']:.6f} to {spread['max']:.6f} mm; mean {spread['mean']:.6f}, rms {spread['rms']:.6f}; {spread['n']} stations.",
             f"Retained CU-08: foot depth {crease['foot_depth_mm']:.2f} mm; crease at depth {crease['crease_depth_mm']:.2f}, height {crease['height_mm']:.2f} mm; run {crease['run_mm']:.2f} mm. MFR wins; the MODEL target is unchanged.",
             "Owner calibration alias follows the render entry. Its named fence-base-490 ceremony re-pin is expected; physics/camera stay fixed."]
    # TESSELLATION: document typography/spacing only; no scene parameter.
    font_path = font_manager.findfont("DejaVu Sans")
    font = ImageFont.truetype(font_path, 26)
    title_font = ImageFont.truetype(font_path, 36)
    wrapped = [textwrap.fill(note, 128) for note in notes]
    probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    heights = [probe.multiline_textbbox((0, 0), text, font=font, spacing=8)[3] for text in wrapped]
    canvas = Image.new("RGB", (2200, 160 + sum(heights) + 38 * len(notes)), "white")
    draw = ImageDraw.Draw(canvas)
    draw.text((48, 36), "D621-O22 FIX1 — SEALED WITH RULED RED", font=title_font, fill="#17212b")
    y = 118
    for ordinal, (note, height) in enumerate(zip(wrapped, heights)):
        draw.multiline_text((48, y), note, font=font, spacing=8,
                            fill="#aa2222" if ordinal in (2, 3, 4) else "#17212b")
        y += height + 38
    canvas.save(output)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ("archive-run", "sections", "plan", "registers", "letters", "drawings", "identity", "census", "out"):
        parser.add_argument("--" + flag, type=Path, required=True)
    parser.add_argument("--arms", type=Path)
    parser.add_argument("--letters-arm", type=Path)
    parser.add_argument("--drive-root", help="the project Drive folder holding the <drive>/ reference photos (default: OB_DRIVE_DIR)")
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args(argv)
    require(not (ROOT / ".git").exists(), "pack generation must execute from an archive")
    output = args.out.resolve()
    require(not output.exists(), "output exists; never overwrite previous evidence")
    require(ROOT != output and ROOT not in output.parents, "pack cannot be written into the archive")
    require(not str(output).startswith(("/tmp/", "/private/tmp/")), "pack must be durable")
    for key, value in vars(args).items():
        if isinstance(value, Path):
            require("ob-3dm-quarantine" not in str(value.resolve()), "pack only accepts generated evidence, never quarantined assets")

    gate = read(args.archive_run / "gate/gate.json")
    cushion = read(args.archive_run / "gate/cushion_gate.json")
    f_row = next(row for row in cushion["rows"] if row["key"] == "cushion_f_p90")
    section = read(args.sections / "ladders-before-after.json")
    plan = read(args.plan / "plan_gate.json")
    registers = read(args.registers / "EVIDENCE.json")
    identity = read(args.identity / "EVIDENCE.json")
    drawings = read(args.drawings / "DRAWINGS.json")
    census = read(args.census)
    source_sha = sha(ROOT / "web/scene/table.js")
    require(source_sha == gate["provenance"]["head_commit_table_js_sha256"], "pack archive and gate renderer differ")
    require(registers["table_js_sha256"]["after"] == source_sha, "registers are not this renderer")
    require(identity["table_js_sha256"]["after"] == source_sha, "identity is not this renderer")
    require(registers["verdict"] == identity["verdict"] == census["verdict"] == "PASS", "supplementary evidence is not all PASS")
    require_section_keys(section)
    # Validate reference anchors independently of supplementary claims. Even a
    # matching replacement dump cannot rebind the deciding gate's capture.
    plan_gate = gate["plan_gate"]
    plan_law_path = "tools/render/d621/law/plan_law_621.json"
    cushion_law_path = "tools/render/d621/law/cushion_law_621.json"
    plan_law = read(ROOT / plan_law_path)
    law_files = gate["provenance"]["law_files"]
    bind_evidence("deciding gate", gate, {
        "plan_gate.law_sha256": law_files.get(plan_law_path),
        "plan_gate.defs_sha256": law_files.get(plan_law["definition_json"]),
        "plan_gate.model_obj_set_sha256": plan_gate.get("manifest_set_sha256"),
        "plan_gate.ours_sha256": gate["provenance"].get("ours_dump_sha256"),
        "plan_gate.binding.bound": True,
        "inputs.ours_sha256": plan_gate.get("ours_sha256"),
        "cushion_gate.law_sha256": law_files.get(cushion_law_path),
    })
    bind_evidence("archive PLAN references", {
        "ours_sha256": sha(args.archive_run / "ours-8ft.json"),
        "law_sha256": sha(ROOT / plan_law_path),
        "model_obj_set_sha256": read(ROOT / "tools/render/d621/law/model_manifest_621.json")["set_sha256"],
        "defs_sha256": sha(ROOT / plan_law["definition_json"]),
        "registration_method": plan_law["registration_method"]["deciding"],
    }, {key: plan_gate.get(key) for key in
        ("ours_sha256", "law_sha256", "model_obj_set_sha256", "defs_sha256", "registration_method")})
    bind_evidence("archive cushion result", {"sha256": sha(args.archive_run / "gate/cushion_gate.json")},
                  {"sha256": gate["cushion_gate"].get("result_sha256")})
    bind_evidence("deciding cushion references", cushion, {
        "law_sha256": sha(ROOT / cushion_law_path),
        "model_obj_set_sha256": plan_gate["model_obj_set_sha256"],
        "source_table_js_sha256": source_sha,
        "inputs.8ft.sha256": plan_gate["ours_sha256"],
        "definitions.8ft.sha256": plan_gate["defs_sha256"],
    })
    definitions = {}
    for size in SIZES:
        path = f"docs/geometry/diamond-proam-{size}-table-definition.json"
        definitions[size] = sha(ROOT / path)
        bind_evidence(f"archive {size} definition", {"sha256": definitions[size]}, {"sha256": law_files.get(path)})
        bind_evidence(f"deciding cushion {size}", cushion, {
            f"definitions.{size}.sha256": definitions[size],
            f"inputs.{size}.sha256": gate["provenance"]["cushion_dump_sha256"].get(size),
        })
    arms = read(args.arms / "arms.json") if args.arms else None
    comparison = bound_before(arms, gate)
    require_byte_controls(identity, read(ROOT / "tools/render/d621/law/cushion_fence_621.json"))
    require_plan_before(f"PLAN {args.plan}", plan, plan_law)
    require(plan.get("before_sha256") != plan.get("ours_sha256"),
            f"PLAN {args.plan} before_sha256 equals after_sha256 (ours_sha256): {plan.get('before_sha256')}")
    bind_evidence(f"PLAN {args.plan}", plan, {
        "before_sha256": comparison["before_sha256"],
        "ours_sha256": plan_gate["ours_sha256"],
        "registration_method": plan_gate["registration_method"],
        "law.sha256": plan_gate["law_sha256"],
        "model_obj_set_sha256": plan_gate["model_obj_set_sha256"],
        "defs.sha256": plan_gate["defs_sha256"],
        "verdict": "PASS",
    })
    # Sections do not read an independent definition file or renderer. Their
    # exact capture/law/MODEL binding reaches the verified cushion record above,
    # whose definitions and served renderer are bound to this deciding gate.
    require(section.get("before_sha256") != section.get("after_sha256"),
            f"sections {args.sections} before_sha256 equals after_sha256: {section.get('before_sha256')}")
    bind_evidence(f"sections {args.sections}", section, {
        "before_sha256": comparison["before_sha256"],
        "after_sha256": plan_gate["ours_sha256"],
        "law_sha256": gate["cushion_gate"]["law_sha256"],
        "model_obj_set_sha256": plan_gate["model_obj_set_sha256"],
    })
    if not args.preview:
        accepted_red = (gate["verdict"] == "PASS-WITH-RULED-RED"
                        and gate.get("ruled_red_rows") == ["cushion_f_p90"])
        require(accepted_red, "FIX1 final requires the explicit PASS-WITH-RULED-RED; no unruled FAIL or hidden f PASS")
        require(census["commit"] == gate["provenance"]["head_commit"], "final census and archive gate name different commits")
        require(arms is not None and arms["all_behave"] and {row["arm"] for row in arms["results"]} == set(range(8)),
                "the complete real-entry arm battery is required")
        require(arms["commit"] == gate["provenance"]["head_commit"], "final arm battery and archive gate name different commits")
        require((arms.get("baseline_red") or {}).get("behaves") is True,
                "the pre-O22 renderer must also fire c/e/f/i through the Option B archive entry")
        require(cushion["verdict"] == "RED-BY-LAW" and f_row["pass"] is False
                and f_row.get("status") == "RED-BY-LAW" and f_row.get("decides") is False
                and f_row["ruling"]["accepted"] and f_row["ruling"]["binding_verified"]
                and f_row["ruling"]["renderer_sha256"] == source_sha,
                "f must remain a bound RED-BY-LAW, never relabelled PASS")
        require(args.letters_arm is not None, "the pre-O22 letters sampling arm is required")
        letters_arm = read(args.letters_arm / "EVIDENCE.json")
        require(letters_arm["behaves"] and set(letters_arm["sizes"]) == set(SIZES),
                "the three-size pre-O22 letters arm is incomplete/open")
        require(letters_arm["new_instrument_sha256"] == sha(ROOT / "tools/render/asmodeled-drawings-488d.mjs")
                and letters_arm["law_sha256"] == sha(ROOT / "tools/render/d621/law/letters_law_621.json"),
                "the letters method arm used another instrument/law")
        require(cushion["diagnostics"]["symmetry"]["paired_grid_complete"], "MODEL/OURS station symmetry is incomplete")
        require(set(cushion["diagnostics"]["prep_secondary_rows"]) == {"cushion_e", "cushion_f_p90", "cushion_f_max", "cushion_j"},
                "the four PREP secondary results for ruled rows must remain recorded")
        executed = gate.get("executed_from_archive", {}).get("files", {})
        require(bool(executed), "the gate has no executed-module provenance")
        for relative, digest in executed.items():
            require(sha(ROOT / relative) == digest, "pack archive differs from the deciding instrument: " + relative)

    archive_renderer = renderer_digest(ROOT / "web")
    letters_paths = load_bound_letters(args.letters, archive_renderer, plan_gate["model_obj_set_sha256"], definitions)
    drawing_bindings = bind_drawings(drawings, args.drawings, letters_paths)
    status = "ENGINEERING PREVIEW — NOT A SEAL" if args.preview else "FINAL — " + gate["verdict"] + "; complete arm battery"
    reference_rows = read(ROOT / "tools/render/d621/card/poses-plan3.json")
    photos = reference_photos(reference_rows, args.drive_root)
    output.mkdir(parents=True)
    assets = []
    def copy(source, relative):
        source = Path(source)
        destination = output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        assets.append(dict(path=relative, source=str(source), sha256=sha(destination)))

    copy(ROOT / "REPORT-D621-O22.md", "REPORT-D621-O22.md")
    copy(args.archive_run / "gate/gate.json", "evidence/gate.json")
    copy(args.archive_run / "gate/cushion_gate.json", "evidence/cushion_gate.json")
    copy(args.census, "evidence/tag-census.json")
    copy(args.identity / "EVIDENCE.json", "evidence/identity.json")
    copy(args.identity / "identity-verdict.json", "evidence/material-identity.json")
    copy(args.registers / "EVIDENCE.json", "evidence/registers.json")
    if args.arms:
        copy(args.arms / "arms.json", "evidence/arms.json")
    if args.letters_arm:
        copy(args.letters_arm / "EVIDENCE.json", "evidence/letters-method-arm.json")
    for name in ("LADDERS.md", "ladders-before-after.json", "sections-before-after-model-6x3.png"):
        copy(args.sections / name, name)
    for name in section["sections"]:
        copy(args.sections / name, name)
    for name in section["nose_figures"]:
        copy(args.sections / name, name)
    copy(args.sections / "NOSE-FACETS.json", "NOSE-FACETS.json")
    for pocket in plan["per_pocket"]:
        name = f"plan_{pocket}_3cuts.png"
        copy(args.plan / name, "plan/" + name)
    for name in ("PLAN.md", "plan_gate.json"):
        copy(args.plan / name, "plan/" + name)
    for row in drawings["records"]:
        for suffix in (".svg", ".png"):
            name = f"{row['size']}-{row['sheet']}{suffix}"
            require(sha(args.drawings / name) == row["svg_sha256" if suffix == ".svg" else "png_sha256"],
                    "a drawing changed after its manifest")
            copy(args.drawings / name, "drawings/" + name)
        if row.get("layout_svg"):
            name = row["layout_svg"]
            require(row["annotation_layout"]["text_unchanged"] and row["annotation_layout"]["geometry_unchanged"],
                    "drawing annotation layout changed its content or geometry")
            require(sha(args.drawings / name) == row["layout_svg_sha256"], "drawing layout SVG changed after its manifest")
            copy(args.drawings / name, "drawings/" + name)
    copy(args.drawings / "DRAWINGS.json", "drawings/DRAWINGS.json")

    triptychs = []
    for size in SIZES:
        letters_path = letters_paths[size]
        copy(letters_path, f"letters/{size}.json")
        copy(args.registers / ("regdiff-" + size) / "regdiff.json", f"regdiff/{size}.json")
        for side in ("before", "after"):
            directory = args.registers / (side + "-" + size)
            manifest = read(directory / "manifest.json")
            copy(directory / "manifest.json", f"registers/{side}-{size}/manifest.json")
            copy(args.registers / f"{side}-{size}.run.json", f"registers/{side}-{size}/capture-load.json")
            for frame in manifest["frames"]:
                source = directory / frame["file"]
                require(sha(source) == frame["sha256"], "a capture frame changed after its manifest")
                copy(source, f"registers/{side}-{size}/{frame['file']}")
        for row in reference_rows:
            register = row["id"]
            before = selected_frame(args.registers / ("before-" + size), register)
            after = selected_frame(args.registers / ("after-" + size), register)
            photo, note = photos[register]
            destination = output / "triptychs" / size
            destination.mkdir(parents=True, exist_ok=True)
            filename = register + ".png"
            triptych(before, after, photo, destination / filename, f"O22 / {size} / {register} / {status}",
                     row.get("photo_label", "OEM PART PHOTO / DOSSIER"), note,
                     decision_footer=f"R1 MODEL 14.58 deg / AZB 465370; R2 MODEL tangent 0.796881 mm; f RED-BY-LAW p90 {f_row['value']:.6f} > {f_row['threshold']:.2f} mm. Owner alias follows.")
            record = dict(size=size, register=register, path=f"triptychs/{size}/{filename}",
                          before_sha256=sha(before), after_sha256=sha(after), reference=str(photo),
                          reference_sha256=sha(photo), reference_note=note)
            if row.get("gain") is not None:
                lifted = register + "-display-lift.png"
                triptych(before, after, photo, destination / lifted, f"O22 / {size} / {register} / DISPLAY-ONLY DETAIL",
                         row.get("photo_label", "PHOTO / DOSSIER"), note, gain=row["gain"])
                record["display_lift"] = dict(path=f"triptychs/{size}/{lifted}", gain=row["gain"], domain="RGB codes, not EV")
            triptychs.append(record)

    # DERIVED: the new ruling requires R1, R2 and the retained f RED together.
    decision_lines = (ROOT / "REPORT-D621-O22.md").read_text().splitlines()[:3]
    require(decision_lines[0].startswith("R1 DECISION") and decision_lines[1].startswith("R2 DECISION")
            and decision_lines[2].startswith("f DECISION") and "RED-BY-LAW" in decision_lines[2],
            "the report must begin with the R1, R2 and f RED-BY-LAW decision rows")
    if not args.preview:
        decision_card(output / "DECISIONS.png", decision_lines, f_row)
        assets.append(dict(path="DECISIONS.png", source="archive report plus measured gate f characterization",
                           sha256=sha(output / "DECISIONS.png")))
    pack = dict(tool="o22_pack_621", status=status, archived_head=gate["provenance"]["head_commit"],
                assembly_archive=str(ROOT), census_commit=census["commit"], arms_commit=arms["commit"] if arms else None,
                renderer_sha256=source_sha, letters_renderer=archive_renderer, decision="\n".join(decision_lines),
                measurement_ruling=read(ROOT / "tools/render/d621/law/cushion_law_621.json")["measurement_method"],
                original_gate_verdict=gate["verdict"], quarantine_policy="no model asset or render pixel copied; measured sections only",
                ruled_red_rows=gate.get("ruled_red_rows", []), f_characterization=f_row.get("ruling"),
                letters_measurement_law=read(ROOT / "tools/render/d621/law/letters_law_621.json"),
                plan_registration_law=read(ROOT / "tools/render/d621/law/plan_law_621.json")["registration_method"],
                comparison_inputs=comparison, sections=section["sections"], overlays=section["overlay"], triptychs=triptychs,
                drawing_bindings=drawing_bindings, copied_assets=assets)
    (output / "PACK.json").write_text(json.dumps(pack, indent=2) + "\n")  # TESSELLATION: JSON layout.
    (output / "README.md").write_text(pack["decision"] + "\n\n" + pack["measurement_ruling"]["ruling"] + "\n\n# O22 engineering pack\n\n" + status + "\n\n"
        "Six rail triptychs and both ladder conventions are retained. Six pocket PLAN overlays show BEFORE/AFTER at three heights.\n"
        "S2/S4 are generated from the three canonical r8 definitions. Six nose-facet plates show the new MODEL tangent read.\n"
        "The owner calibration alias follows the render entry by explicit ruling; eight unrelated tables remain byte-identical.\n"
        "Original SVG bytes are retained; the labelled layout SVGs\n"
        "and paired Chrome rasterizations only reflow overlapping/clipped annotations, with text and all geometry verified unchanged.\n"
        "Register triptychs use BEFORE | AFTER | the labelled OEM/dealer reference. The hero is a 9-ft marketing/shape reference,\n"
        "not a photometric target. The cabinet reference shows an installed cabinet; the extra lifted view is display-only.\n"
        "No original purchased-model vertices, textures or render pixels are included. Capture load and input hashes are recorded.\n"
        "\nSVG provenance (SHA-256):\n\n"
        "| Original SVG | Recorded letters twin SHA-256 | Included SVG SHA-256 |\n"
        "| --- | --- | --- |\n"
        + "".join(f"| `{row['file']}` | `{row['letters_recorded_svg_sha256']}` | `{row['svg_sha256']}` |\n"
                  for row in drawing_bindings))
    sums = [sha(file) + "  " + str(file.relative_to(output)) for file in sorted(output.rglob("*")) if file.is_file()]
    (output / "SHA256SUMS").write_text("\n".join(sums) + "\n")
    print(json.dumps(dict(output=str(output), status=status, files=len(sums), triptychs=len(triptychs))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
