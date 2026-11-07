#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""GH-488P: generate the Predator Apex 9ft GB/T definition sheets from one
canonical JSON source (docs/geometry/gh488p-predator-apex-canonical.json).

Forked from the GH-490 single-source drawing generator pattern
(tools/render/gh490/generate.py): one machine-readable metric source, derived
sheets, source SHA-256 on every title block, deterministic output, --check
mode. This fork is self-contained (stdlib only, SVG output only) so the
GH-488P lane shares no files with sibling lanes.

Sheets:
  1. Corner pocket assembly - plan (flush-rim drop family)
  2. Side pocket assembly - plan (side mouth vs the official 4.92 in:
     conflict-flagged reference while divergent, single agreed dim once
     the values converge - CAL-1 closed at r4)
  3. K55 cushion profile - section
  4. Rail / apron elevation + furniture envelope plan (datum DD-1)
  5. Sources / derivations / conflicts tables

The canonical JSON and its hash are machine authority; displayed values are
emitted to the declared numerical tolerance. No runtime geometry is modified. The jaw construction mirrors the kernel's Table::from_pocket_spec, so it is derived from pooltool (Apache-2.0) and modified by the OpenBilliards authors.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import re
import struct
import sys
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

GENERATOR_ID = "gh488predator-drawing/1.0.0"
PAGE_W_MM = 420.0
PAGE_H_MM = 297.0
BLACK = "#111111"
GRAY = "#666666"
LIGHT = "#b8b8b8"
WHITE = "#ffffff"
WARN = "#8a5a00"
TBD_AMBER = "#9a5b00"
CONFLICT_RED = "#8f2d24"
REF_BLUE = "#1f4e79"
WARM_FILL = "#f6f2e9"

TYPE_PAGE = 5.0
TYPE_VIEW = 3.5
TYPE_BODY = 2.5
TYPE_META = 2.0

LINE_BORDER = 0.50
LINE_DEFINED = 0.70
LINE_OBJECT = 0.50
LINE_NORMAL = 0.35
LINE_DIMENSION = 0.18

Point = tuple[float, float]


def type_size(requested: float) -> float:
    if requested >= 4.0:
        return TYPE_PAGE
    if requested >= 2.8:
        return TYPE_VIEW
    if requested >= 2.15:
        return TYPE_BODY
    return TYPE_META


def line_weight(requested: float) -> float:
    if requested >= 0.60:
        return LINE_DEFINED
    if requested >= 0.45:
        return LINE_OBJECT
    if requested >= 0.25:
        return LINE_NORMAL
    return LINE_DIMENSION


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def fmt(value: float, decimals: int = 3) -> str:
    text = f"{value:.{decimals}f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


def svg_number(value: float) -> str:
    return fmt(float(value), 4)


def svg_color(value: str) -> str:
    return value if value else "none"


def vector_unit(a: Point) -> Point:
    length = math.hypot(a[0], a[1])
    if length == 0:
        return (0.0, 0.0)
    return (a[0] / length, a[1] / length)


@dataclass
class DrawingPage:
    sheet_number: int
    sheet_title: str
    short_title: str = ""
    commands: list[dict[str, Any]] = field(default_factory=list)

    def line(self, x1: float, y1: float, x2: float, y2: float, *, width: float = 0.25, color: str = BLACK, dash: tuple[float, ...] = ()) -> None:
        self.commands.append({"kind": "line", "x1": x1, "y1": y1, "x2": x2, "y2": y2, "width": line_weight(width), "color": color, "dash": dash})

    def polyline(self, points: Iterable[Point], *, width: float = 0.25, color: str = BLACK, dash: tuple[float, ...] = (), closed: bool = False, fill: str = "none") -> None:
        self.commands.append({"kind": "polyline", "points": list(points), "width": line_weight(width), "color": color, "dash": dash, "closed": closed, "fill": fill})

    def rect(self, x: float, y: float, width: float, height: float, *, line_width: float = 0.25, color: str = BLACK, fill: str = "none", dash: tuple[float, ...] = ()) -> None:
        self.commands.append({"kind": "rect", "x": x, "y": y, "w": width, "h": height, "width": line_weight(line_width), "color": color, "fill": fill, "dash": dash})

    def circle(self, x: float, y: float, radius: float, *, line_width: float = 0.25, color: str = BLACK, fill: str = "none", dash: tuple[float, ...] = ()) -> None:
        self.commands.append({"kind": "circle", "x": x, "y": y, "r": radius, "width": line_weight(line_width), "color": color, "fill": fill, "dash": dash})

    def arc(self, cx: float, cy: float, radius: float, start_deg: float, end_deg: float, *, width: float = 0.25, color: str = BLACK, dash: tuple[float, ...] = ()) -> None:
        self.commands.append({"kind": "arc", "cx": cx, "cy": cy, "r": radius, "a0": start_deg, "a1": end_deg, "width": line_weight(width), "color": color, "dash": dash})

    def text(self, x: float, y: float, value: str, *, size: float = TYPE_BODY, anchor: str = "start", bold: bool = False, mono: bool = False, color: str = BLACK, rotate: float = 0.0) -> None:
        self.commands.append({"kind": "text", "x": x, "y": y, "text": value, "size": type_size(size), "anchor": anchor, "bold": bold, "mono": mono, "color": color, "rotate": rotate})


def arrow_head(page: DrawingPage, tip: Point, direction: Point, size: float = 2.0, color: str = BLACK) -> None:
    unit = vector_unit(direction)
    normal = (-unit[1], unit[0])
    base = (tip[0] - unit[0] * size, tip[1] - unit[1] * size)
    page.polyline(
        [tip, (base[0] + normal[0] * size * 0.35, base[1] + normal[1] * size * 0.35), (base[0] - normal[0] * size * 0.35, base[1] - normal[1] * size * 0.35)],
        width=0.18,
        color=color,
        closed=True,
        fill=color,
    )


def dimension_horizontal(page: DrawingPage, x1: float, x2: float, object_y: float, dim_y: float, label: str, *, color: str = BLACK) -> None:
    direction = 1.0 if dim_y >= object_y else -1.0
    page.line(x1, object_y + direction * 1.5, x1, dim_y + direction * 1.5, width=LINE_DIMENSION, color=color)
    page.line(x2, object_y + direction * 1.5, x2, dim_y + direction * 1.5, width=LINE_DIMENSION, color=color)
    page.line(x1, dim_y, x2, dim_y, width=0.18, color=color)
    arrow_head(page, (x1, dim_y), (1.0, 0.0), 2.0, color=color)
    arrow_head(page, (x2, dim_y), (-1.0, 0.0), 2.0, color=color)
    knockout_width = max(13.0, len(label) * 1.35)
    page.rect((x1 + x2) / 2 - knockout_width / 2, dim_y - 4.2, knockout_width, 4.4, line_width=0.18, color=WHITE, fill=WHITE)
    page.text((x1 + x2) / 2, dim_y - 2.2, label, size=2.5, anchor="middle", color=color)


def dimension_vertical(page: DrawingPage, y1: float, y2: float, object_x: float, dim_x: float, label: str, *, color: str = BLACK) -> None:
    direction = 1.0 if dim_x >= object_x else -1.0
    page.line(object_x + direction * 1.5, y1, dim_x + direction * 1.5, y1, width=LINE_DIMENSION, color=color)
    page.line(object_x + direction * 1.5, y2, dim_x + direction * 1.5, y2, width=LINE_DIMENSION, color=color)
    page.line(dim_x, y1, dim_x, y2, width=0.18, color=color)
    arrow_head(page, (dim_x, y1), (0.0, 1.0), 2.0, color=color)
    arrow_head(page, (dim_x, y2), (0.0, -1.0), 2.0, color=color)
    knockout_height = max(13.0, len(label) * 1.35)
    page.rect(dim_x - 4.0, (y1 + y2) / 2 - knockout_height / 2, 4.4, knockout_height, line_width=0.18, color=WHITE, fill=WHITE)
    page.text(dim_x - 2.5, (y1 + y2) / 2, label, size=2.5, anchor="middle", rotate=-90, color=color)


def dimension_aligned(page: DrawingPage, p1: Point, p2: Point, offset: float, label: str, *, color: str = BLACK) -> None:
    """Aligned dimension parallel to p1-p2, displaced by offset along the left normal."""
    unit = vector_unit((p2[0] - p1[0], p2[1] - p1[1]))
    normal = (-unit[1], unit[0])
    q1 = (p1[0] + normal[0] * offset, p1[1] + normal[1] * offset)
    q2 = (p2[0] + normal[0] * offset, p2[1] + normal[1] * offset)
    over = 1.5 if offset >= 0 else -1.5
    page.line(p1[0], p1[1], q1[0] + normal[0] * over, q1[1] + normal[1] * over, width=LINE_DIMENSION, color=color)
    page.line(p2[0], p2[1], q2[0] + normal[0] * over, q2[1] + normal[1] * over, width=LINE_DIMENSION, color=color)
    page.line(q1[0], q1[1], q2[0], q2[1], width=0.18, color=color)
    arrow_head(page, q1, unit, 2.0, color=color)
    arrow_head(page, q2, (-unit[0], -unit[1]), 2.0, color=color)
    mid = ((q1[0] + q2[0]) / 2, (q1[1] + q2[1]) / 2)
    angle = math.degrees(math.atan2(unit[1], unit[0]))
    if angle > 90 or angle < -90:
        angle += 180
    page.text(mid[0] - normal[0] * 2.2, mid[1] - normal[1] * 2.2, label, size=2.5, anchor="middle", rotate=angle, color=color)


def leader(page: DrawingPage, tip: Point, elbow: Point, text_at: Point, lines: list[str], *, size: float = 2.2, color: str = BLACK) -> None:
    page.line(tip[0], tip[1], elbow[0], elbow[1], width=LINE_DIMENSION, color=color)
    page.line(elbow[0], elbow[1], text_at[0], text_at[1], width=LINE_DIMENSION, color=color)
    arrow_head(page, tip, (tip[0] - elbow[0], tip[1] - elbow[1]), 1.8, color=color)
    anchor = "start" if text_at[0] >= elbow[0] else "end"
    y = text_at[1] - 1.0
    for index, line in enumerate(lines):
        page.text(text_at[0] + (1.0 if anchor == "start" else -1.0), y + index * 3.2, line, size=size, anchor=anchor, color=color)


def wrap_text(value: str, width: int) -> list[str]:
    words = value.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or [""]


def text_block(page: DrawingPage, x: float, y: float, lines: Iterable[str], *, size: float = 2.4, leading: float = 3.5, bold_first: bool = False, color: str = BLACK) -> float:
    current_y = y
    for index, line in enumerate(lines):
        page.text(x, current_y, line, size=size, bold=bold_first and index == 0, color=color)
        current_y += leading
    return current_y


def draw_projection_symbol(page: DrawingPage, x: float, y: float) -> None:
    """First-angle symbol: frustum small end LEFT, end view (two solid
    concentric circles) on the RIGHT. Rationale: two SOLID circles are only
    seen from the small-end side (from the big end the small face is hidden);
    first angle places that view on the OPPOSITE side, adjacent to the big
    end. Circles adjacent to the small end would be the third-angle symbol.
    (Review r6 asked for the mirror; refuted on this visibility argument.)"""
    page.polyline([(x, y + 2.0), (x + 10.0, y), (x + 10.0, y + 8.0), (x, y + 6.0)], width=0.25, closed=True)
    page.line(x + 3.0, y + 1.4, x + 3.0, y + 6.6, width=0.18)
    page.circle(x + 15.0, y + 4.0, 3.7, line_width=0.25)
    page.circle(x + 15.0, y + 4.0, 1.0, line_width=0.18)
    page.text(x + 7.5, y + 10.2, "FIRST-ANGLE", size=1.8, anchor="middle", bold=True)


def draw_sheet_frame(page: DrawingPage) -> None:
    page.rect(20.0, 10.0, 390.0, 277.0, line_width=0.5)
    for x in (98.0, 176.0, 254.0, 332.0):
        page.line(x, 10.0, x, 13.0, width=0.18)
        page.line(x, 284.0, x, 287.0, width=0.18)
    for label, x in zip(("1", "2", "3", "4", "5"), (59.0, 137.0, 215.0, 293.0, 371.0)):
        page.text(x, 11.6, label, size=1.8, anchor="middle")
        page.text(x, 285.4, label, size=1.8, anchor="middle")
    for y in (79.25, 148.5, 217.75):
        page.line(20.0, y, 23.0, y, width=0.18)
        page.line(407.0, y, 410.0, y, width=0.18)
    for label, y in zip(("A", "B", "C", "D"), (44.6, 113.9, 183.1, 252.4)):
        page.text(21.7, y, label, size=1.8, anchor="middle")
        page.text(408.3, y, label, size=1.8, anchor="middle")


def title_block_value(value: Any) -> str:
    if value is None or value == "":
        return "TBD"
    return str(value)


def draw_title_block(page: DrawingPage, data: dict[str, Any], source_hash: str, total_sheets: int, scale_label: str) -> None:
    x, y, width = 226.0, 235.0, 184.0
    document = data["document"]
    approvals = data["approvals"]
    page.rect(x, 226.0, width, 61.0, line_width=LINE_BORDER, fill=WHITE)
    page.line(x, 235.0, x + width, 235.0, width=LINE_NORMAL)
    page.line(256.0, 226.0, 256.0, 235.0, width=LINE_DIMENSION)
    page.line(276.0, 226.0, 276.0, 235.0, width=LINE_DIMENSION)
    page.line(309.0, 226.0, 309.0, 235.0, width=LINE_DIMENSION)
    page.line(392.0, 226.0, 392.0, 235.0, width=LINE_DIMENSION)
    page.text(228.0, 228.5, "REV HISTORY", size=TYPE_META, bold=True)
    page.text(258.0, 228.5, document["revision"], size=TYPE_META, bold=True)
    page.text(278.0, 228.5, document["issue_date"], size=TYPE_META)
    for line_index, line in enumerate(wrap_text(document["change_summary"], 58)[:3]):
        page.text(311.0, 227.3 + line_index * 2.6, line, size=1.5)
    page.text(408.0, 228.5, title_block_value(approvals["drawn_by"]["name"]), size=TYPE_META, anchor="end")
    page.rect(378.0, 235.0, 32.0, 12.0, line_width=LINE_NORMAL, color=BLACK, fill=WARM_FILL)
    for row_y in (247.0, 256.0, 266.0, 276.0):
        page.line(x, row_y, x + width, row_y, width=0.25)
    page.line(336.0, y, 336.0, 247.0, width=0.25)
    page.line(378.0, y, 378.0, 247.0, width=0.25)
    page.line(300.0, 247.0, 300.0, 256.0, width=0.25)
    page.line(354.0, 247.0, 354.0, 256.0, width=0.25)
    page.line(282.0, 256.0, 282.0, 266.0, width=0.25)
    page.line(326.0, 256.0, 326.0, 266.0, width=0.25)
    page.line(362.0, 256.0, 362.0, 266.0, width=0.25)
    page.line(287.0, 276.0, 287.0, 287.0, width=0.25)
    page.line(348.0, 276.0, 348.0, 287.0, width=0.25)

    page.text(x + 2.0, y + 3.0, document["title"][:78], size=2.4, bold=True)
    tolerances = data["tolerances"]
    mfg = tolerances["manufacturing_profile"]
    numerical = tolerances["numerical"]
    gbt = "/".join(s.removeprefix("GB/T ") for s in data["drafting"]["standards"] if s.startswith("GB/T"))
    iso = "/".join(s.removeprefix("ISO ") for s in data["drafting"]["standards"] if s.startswith("ISO"))
    page.text(x + 2.0, y + 7.5, f"STANDARDS: GB/T {gbt} + ISO {iso}", size=1.5)
    page.text(x + 2.0, y + 10.3,
              f"MFG PROFILE TOL: {title_block_value(mfg)} | NUM TOL: POS {fmt(numerical['position'])} / ANG {fmt(numerical['angle_deg'])} DEG",
              size=1.5, color=WARN if mfg is None else BLACK)
    page.text(338.0, y + 3.0, "REV", size=1.7)
    page.text(338.0, y + 8.0, document["revision"], size=3.0, bold=True)
    page.text(380.0, y + 3.0, "STATUS", size=1.7)
    page.text(380.0, y + 8.0, document["status"], size=2.4, bold=True, color=WARN if document["status"] != "RELEASED" else BLACK)

    page.text(x + 2.0, 249.0, "DOCUMENT NUMBER", size=1.6)
    page.text(x + 2.0, 253.5, document["number"], size=2.5, bold=True)
    page.text(302.0, 249.0, "APPLIES TO", size=1.6)
    page.text(302.0, 253.5, ", ".join(document["table_ids"]) + f" ({document['in_game_id']})", size=2.0, bold=True)
    page.text(356.0, 249.0, "SHEET TITLE", size=1.6)
    page.text(356.0, 253.5, (page.short_title or page.sheet_title)[:24], size=2.0, bold=True)

    page.text(x + 2.0, 258.0, "UNITS", size=1.6)
    page.text(x + 2.0, 263.0, "mm", size=2.4, bold=True)
    page.text(284.0, 258.0, "SCALE", size=1.6)
    page.text(284.0, 263.0, scale_label, size=2.4, bold=True)
    page.text(328.0, 258.0, "SHEET", size=1.6)
    page.text(328.0, 263.0, f"{page.sheet_number}/{total_sheets}", size=2.4, bold=True)
    draw_projection_symbol(page, 366.0, 256.4)

    page.text(x + 2.0, 268.0, f"SOURCE SHA-256 / GENERATOR {GENERATOR_ID}", size=1.6)
    page.text(x + 2.0, 272.7, source_hash[:32], size=1.9, mono=True)
    page.text(296.0, 272.7, source_hash[32:], size=1.9, mono=True)

    drawn = approvals["drawn_by"]
    checked = approvals["checked_by"]
    approved = approvals["approved_by"]
    page.text(x + 2.0, 278.0, "DRAWN", size=1.6)
    page.text(x + 2.0, 282.0, title_block_value(drawn["name"]), size=2.0, bold=True)
    page.text(x + 2.0, 285.2, title_block_value(drawn["date"]), size=1.7)
    page.text(289.0, 278.0, "CHECKED", size=1.6)
    page.text(289.0, 282.0, title_block_value(checked["name"]), size=2.0, bold=True)
    page.text(289.0, 285.2, title_block_value(checked["date"]), size=1.7)
    page.text(350.0, 278.0, "APPROVED", size=1.6)
    page.text(350.0, 282.0, title_block_value(approved["name"]), size=2.0, bold=True)
    page.text(350.0, 285.2, title_block_value(approved["date"]), size=1.7)
    page.text(408.0, 284.8, "DO NOT SCALE DRAWING", size=2.2, anchor="end", bold=True)


def draw_watermark(page: DrawingPage, status: str) -> None:
    if status != "RELEASED":
        page.rect(314.0, 17.0, 88.0, 11.0, line_width=LINE_NORMAL, color=TBD_AMBER, fill=WARM_FILL)
        page.text(358.0, 22.5, f"{status} / NOT FOR PRODUCTION", size=TYPE_BODY, anchor="middle", bold=True, color=TBD_AMBER)


def draw_page_heading(page: DrawingPage, subtitle: str) -> None:
    page.text(28.0, 22.0, page.sheet_title, size=5.2, bold=True)
    page.text(28.0, 29.0, subtitle, size=2.6, color=GRAY)
    page.line(28.0, 33.0, 402.0, 33.0, width=0.35)


def draw_legend(page: DrawingPage, x: float, y: float) -> None:
    text_block(
        page,
        x,
        y,
        [
            "LEGEND",
            "( ) REFERENCE DIMENSION - not production authority",
            "*  ASSUMPTION TIER - kernel-pinned, unpublished by Predator",
            "RED = ledgered conflict (see sheet 5 ledger)",
            "BLUE = official reference value awaiting calibration ceremony",
        ],
        size=1.9,
        leading=3.0,
        bold_first=True,
        color=GRAY,
    )


# ---------------------------------------------------------------------------
# canonical value access + geometric construction (all mm, table frame)
# ---------------------------------------------------------------------------


def feature(data: dict[str, Any], feature_id: str) -> dict[str, Any]:
    for item in data["features"]:
        if item["id"] == feature_id:
            return item
    raise KeyError(feature_id)


def fval(data: dict[str, Any], feature_id: str, key: str) -> float:
    return float(feature(data, feature_id)["value_mm"][key])


@dataclass
class Model:
    """Derived geometric model in the TCS-PDT-01 table frame (mm)."""

    half_len: float
    half_wid: float
    cushion_w: float
    rail_band: float
    corner_mouth: float
    side_mouth: float
    side_mouth_ref: float
    corner_facing_deg: float
    side_facing_deg: float
    corner_jaw_r: float
    side_jaw_r: float
    corner_throat: float
    side_throat: float
    corner_shelf: float
    side_shelf: float
    corner_depth: float
    side_depth: float
    nose_height: float
    ball_d: float
    env_len: float
    env_wid: float
    env_hgt: float
    apron_h: float
    overhang_long: float
    overhang_short: float
    slate_t: float
    sight_spacing: float
    sight_inset: float
    sight_r: float
    exact_side_facing: bool
    cp_origin: tuple[float, float, float]
    sp_origin: tuple[float, float, float]
    cp_instances: list[dict[str, Any]]
    sp_instances: list[dict[str, Any]]


def construction_frame(data: dict[str, Any], frame_id: str) -> dict[str, Any]:
    for item in data["frames"]["construction"]:
        if item["id"] == frame_id:
            return item
    raise KeyError(frame_id)


def build_model(data: dict[str, Any]) -> Model:
    return Model(
        half_len=fval(data, "FT-PLAYFIELD", "length") / 2.0,
        half_wid=fval(data, "FT-PLAYFIELD", "width") / 2.0,
        cushion_w=fval(data, "FT-CUSHION-WIDTH", "width"),
        rail_band=fval(data, "FT-RAIL-BAND", "width"),
        corner_mouth=fval(data, "FT-CORNER-MOUTH", "mouth"),
        side_mouth=fval(data, "FT-SIDE-MOUTH", "mouth"),
        side_mouth_ref=float(feature(data, "FT-SIDE-MOUTH")["official_reference_mm"]),
        corner_facing_deg=float(feature(data, "FT-CORNER-FACING")["value_deg"]),
        side_facing_deg=float(feature(data, "FT-SIDE-FACING")["value_deg"]),
        corner_jaw_r=fval(data, "FT-CORNER-JAW-RADIUS", "radius"),
        side_jaw_r=fval(data, "FT-SIDE-JAW-RADIUS", "radius"),
        corner_throat=fval(data, "FT-CORNER-THROAT", "throat"),
        side_throat=fval(data, "FT-SIDE-THROAT", "throat"),
        corner_shelf=fval(data, "FT-CORNER-SHELF", "shelf"),
        side_shelf=fval(data, "FT-SIDE-SHELF", "shelf"),
        corner_depth=fval(data, "FT-CORNER-DEPTH", "depth"),
        side_depth=fval(data, "FT-SIDE-DEPTH", "depth"),
        nose_height=fval(data, "FT-CUSHION-NOSE-HEIGHT", "height"),
        ball_d=fval(data, "FT-BALL", "diameter"),
        env_len=fval(data, "FT-ENVELOPE", "length"),
        env_wid=fval(data, "FT-ENVELOPE", "width"),
        env_hgt=fval(data, "FT-ENVELOPE", "height"),
        apron_h=fval(data, "FT-APRON", "height"),
        overhang_long=fval(data, "FT-OVERHANG-LONG", "overhang"),
        overhang_short=fval(data, "FT-OVERHANG-SHORT", "overhang"),
        slate_t=fval(data, "FT-SLATE", "thickness"),
        sight_spacing=fval(data, "FT-SIGHTS", "spacing"),
        sight_inset=fval(data, "FT-SIGHTS", "inset_from_nose"),
        sight_r=fval(data, "FT-SIGHTS", "radius"),
        exact_side_facing=feature(data, "FT-EXACT-SIDE-FACING")["value_text"].strip().lower() == "true",
        cp_origin=tuple(construction_frame(data, "PCF-PDT-CP")["canonical_origin_in_global"]),
        sp_origin=tuple(construction_frame(data, "PCF-PDT-SP")["canonical_origin_in_global"]),
        cp_instances=construction_frame(data, "PCF-PDT-CP")["instances"],
        sp_instances=construction_frame(data, "PCF-PDT-SP")["instances"],
    )


def corner_construction(model: Model) -> dict[str, Any]:
    """Exact kernel jaw construction (Table::from_pocket_spec), canonical
    corner CP-FOOT-RIGHT at K = (u, v) = (half_len, half_wid) in the plan
    coords (u = global +Y, v = global +X), pocket toward +u +v.

    ca = 45 deg + deviation; dc = rc / tan((90 deg + ca)/2); the rail nose
    ends mouth/sqrt(2) from K; the jaw arc (radius rc) is tangent to the rail
    nose line at its end and to the facing line; the facing runs to the
    cushion back plane. Fall centre sits corner_pocket_depth behind K along
    the diagonal.
    """
    # canonical origin from the JSON construction frame (global [X, Y, Z]
    # with X across the width, Y along the length): plan u = Y, v = X.
    hl, hw = model.cp_origin[1], model.cp_origin[0]
    ca = math.radians(45.0 + model.corner_facing_deg)
    rc = model.corner_jaw_r
    dc = rc / math.tan((math.pi / 2.0 + ca) / 2.0)
    setback = model.corner_mouth / math.sqrt(2.0)
    pwc = setback - dc
    cw = model.cushion_w
    n1 = (hl - setback, hw)
    c1 = (hl - setback, hw + rc)
    t1 = (hl - (pwc - dc * math.sin(ca)), hw + dc * math.cos(ca))
    d1 = (hl - (pwc - cw * math.tan(ca)), hw + cw)
    n2 = (hl, hw - setback)
    c2 = (hl + rc, hw - setback)
    t2 = (hl + dc * math.cos(ca), hw - (pwc - dc * math.sin(ca)))
    d2 = (hl + cw, hw - (pwc - cw * math.tan(ca)))
    bis = (math.sqrt(0.5), math.sqrt(0.5))
    fall_c = (hl + bis[0] * model.corner_depth, hw + bis[1] * model.corner_depth)
    mouth_mid = ((n1[0] + n2[0]) / 2.0, (n1[1] + n2[1]) / 2.0)
    return {"n1": n1, "c1": c1, "t1": t1, "d1": d1, "n2": n2, "c2": c2, "t2": t2, "d2": d2,
            "fall_c": fall_c, "mouth_mid": mouth_mid, "bis": bis, "dc": dc, "setback": setback}


def side_construction(model: Model) -> dict[str, Any]:
    """Exact kernel jaw construction, canonical side SP-RIGHT at
    (u, v) = (0, half_wid) in the plan coords, pocket toward +v.
    The back-endpoint rise follows the canonical
    exact_side_facing flag: cw * tan(sa) (exact facing line) when true,
    pooltool's cw * sin(sa) quirk when false — kernel from_pocket_spec
    verbatim."""
    u_c, hw = model.sp_origin[1], model.sp_origin[0]
    sa = math.radians(model.side_facing_deg)
    rs = model.side_jaw_r
    ds = rs / math.tan((math.pi / 2.0 + sa) / 2.0)
    sw = model.side_mouth - 2.0 * ds
    cw = model.cushion_w
    sjb = cw * math.tan(sa) if model.exact_side_facing else cw * math.sin(sa)
    half_mouth = model.side_mouth / 2.0
    n_l = (u_c - half_mouth, hw)
    c_l = (u_c - half_mouth, hw + rs)
    t_l = (u_c - (sw / 2.0 - ds * math.sin(sa)), hw + ds * math.cos(sa))
    d_l = (u_c - (sw / 2.0 - sjb), hw + cw)
    fall_c = (u_c, hw + model.side_depth)

    def mirror(point: Point) -> Point:
        return (2.0 * u_c - point[0], point[1])

    return {"n_l": n_l, "c_l": c_l, "t_l": t_l, "d_l": d_l,
            "n_r": mirror(n_l), "c_r": mirror(c_l), "t_r": mirror(t_l), "d_r": mirror(d_l),
            "fall_c": fall_c, "ds": ds, "sw": sw, "sjb": sjb}


def point_line_distance(point: Point, on_line: Point, direction: Point) -> float:
    unit = vector_unit(direction)
    dx, dy = point[0] - on_line[0], point[1] - on_line[1]
    return abs(unit[0] * dy - unit[1] * dx)


class View:
    """Maps plan coordinates (u, v) in mm to page mm. Plan sheets are viewed
    from global +Z: u = global +Y (length toward the foot, drawn to the page
    right), v = global +X (width toward the right rail, drawn down-page).
    This is a rigid rotation of the right-handed TCS-PDT-01, not a mirror."""

    def __init__(self, page_x: float, page_y: float, table_x0: float, table_y0: float, scale: float):
        self.page_x = page_x
        self.page_y = page_y
        self.table_x0 = table_x0
        self.table_y0 = table_y0
        self.scale = scale

    def to_page(self, tx: float, ty: float) -> Point:
        return (self.page_x + (tx - self.table_x0) * self.scale, self.page_y + (ty - self.table_y0) * self.scale)

    def d(self, value: float) -> float:
        return value * self.scale


# ---------------------------------------------------------------------------
# sheet 1: corner pocket assembly plan
# ---------------------------------------------------------------------------


def build_corner_sheet(data: dict[str, Any], model: Model, source_hash: str, total_sheets: int) -> DrawingPage:
    page = DrawingPage(1, "CORNER POCKET ASSEMBLY - PLAN", "CORNER POCKET - PLAN")
    draw_sheet_frame(page)
    draw_page_heading(page, "Flush-rim drop family; canonical instance CP-FOOT-RIGHT in PCF-PDT-CP; jaw geometry = exact kernel construction (Table::from_pocket_spec)")
    draw_watermark(page, data["document"]["status"])

    geo = corner_construction(model)
    # page origin chosen so the outer envelope corner (1447.5, 807.5) maps to
    # (223.75, 227.25), clear of the title block at x>=226
    view = View(30.0, 36.0, 1060.0, 425.0, 0.5)
    p = view.to_page
    hl, hw, cw = model.half_len, model.half_wid, model.cushion_w
    n1, t1, d1 = geo["n1"], geo["t1"], geo["d1"]
    n2, t2, d2 = geo["n2"], geo["t2"], geo["d2"]
    c1, c2 = geo["c1"], geo["c2"]
    fall_c, mouth_mid, bis = geo["fall_c"], geo["mouth_mid"], geo["bis"]
    fall_r = model.corner_throat / 2.0
    rail_outer_x = hl + model.overhang_long
    rail_outer_y = hw + model.overhang_short

    # nose lines end at the true-mouth nose points
    page.line(*p(1060.0, hw), *p(*n1), width=LINE_DEFINED)
    page.line(*p(hl, 425.0), *p(*n2), width=LINE_DEFINED)
    # jaw arcs (kernel radius, tangent to nose line and facing). The kernel
    # primitive is a FULL CIRCLE (CircularCushionSegment span: None,
    # collision-active on the whole circle); the dashed circle discloses it,
    # the solid subarc is the furniture-visible nose blend.
    page.circle(*p(*c1), view.d(model.corner_jaw_r), line_width=LINE_DIMENSION, dash=(1.5, 1.2), color=GRAY)
    page.circle(*p(*c2), view.d(model.corner_jaw_r), line_width=LINE_DIMENSION, dash=(1.5, 1.2), color=GRAY)
    a1_start = math.degrees(math.atan2(n1[1] - c1[1], n1[0] - c1[0]))
    a1_end = math.degrees(math.atan2(t1[1] - c1[1], t1[0] - c1[0]))
    page.arc(*p(*c1), view.d(model.corner_jaw_r), a1_start, a1_end, width=LINE_DEFINED)
    a2_start = math.degrees(math.atan2(n2[1] - c2[1], n2[0] - c2[0]))
    a2_end = math.degrees(math.atan2(t2[1] - c2[1], t2[0] - c2[0]))
    page.arc(*p(*c2), view.d(model.corner_jaw_r), a2_start, a2_end, width=LINE_DEFINED)
    # facings (converging: throat narrower than mouth)
    page.line(*p(*t1), *p(*d1), width=LINE_DEFINED)
    page.line(*p(*t2), *p(*d2), width=LINE_DEFINED)
    # cushion back edges meet the facing ends at the back plane
    page.line(*p(1060.0, hw + cw), *p(*d1), width=LINE_OBJECT)
    page.line(*p(hl + cw, 425.0), *p(*d2), width=LINE_OBJECT)
    # rail outer envelope (sharp corner = envelope REF; furniture wrap is the
    # modeling wave's)
    page.line(*p(1060.0, rail_outer_y), *p(rail_outer_x, rail_outer_y), width=LINE_NORMAL, color=GRAY)
    page.line(*p(rail_outer_x, 425.0), *p(rail_outer_x, rail_outer_y), width=LINE_NORMAL, color=GRAY)
    # mouth chain line
    page.line(*p(*n1), *p(*n2), width=LINE_DIMENSION, dash=(4.0, 1.5))
    # fall circle + flush-rim REF annulus
    page.circle(*p(*fall_c), view.d(fall_r), line_width=LINE_DEFINED)
    page.circle(*p(*fall_c), view.d(fall_r + 18.0), line_width=LINE_DIMENSION, dash=(2.5, 1.5), color=REF_BLUE)
    # pocket diagonal centreline
    page.line(*p(mouth_mid[0] - bis[0] * 55.0, mouth_mid[1] - bis[1] * 55.0), *p(fall_c[0] + bis[0] * 70.0, fall_c[1] + bis[1] * 70.0), width=LINE_DIMENSION, dash=(6.0, 1.5, 1.0, 1.5), color=GRAY)

    # dimensions
    dimension_aligned(page, p(*n1), p(*n2), -14.0, f"{fmt(model.corner_mouth)} MOUTH (4.25 IN OFFICIAL) [FT-CORNER-MOUTH]")
    # K -> fall-centre distance: datum dots on the diagonal + leader (a
    # rotated aligned dim here crossed the jaw leader; review r10)
    page.circle(*p(hl, hw), 0.8, line_width=0.18, fill=BLACK)
    page.circle(*p(*fall_c), 0.8, line_width=0.18, fill=BLACK)
    fc_page = p(*fall_c)
    leader(page, fc_page, (fc_page[0] + 42.0, fc_page[1] - 4.0), (fc_page[0] + 44.0, fc_page[1] - 4.0),
           [f"K->FALL CTR {fmt(model.corner_depth)} (DRV-2)*", "CORNER POINT -> FALL CENTRE (KERNEL)", "[FT-CORNER-DEPTH]"])
    lip = (fall_c[0] - bis[0] * fall_r, fall_c[1] - bis[1] * fall_r)
    lip_page = p(*lip)
    leader(page, lip_page, (lip_page[0] - 34.0, lip_page[1] + 38.0), (lip_page[0] - 36.0, lip_page[1] + 38.0),
           [f"SHELF* {fmt(model.corner_shelf)} (DRV-2)", "MOUTH LINE -> FALL LIP (WPA CONV.)", "[FT-CORNER-SHELF]"])
    dimension_horizontal(page, p(hl, hw)[0], p(rail_outer_x, hw)[0], p(hl, 425.0)[1] + 4.0, p(hl, 425.0)[1] + 10.0, f"{fmt(model.overhang_long)} (DRV-4) [FT-OVERHANG-LONG]")
    dimension_vertical(page, p(1060.0, hw)[1], p(1060.0, rail_outer_y)[1], p(1075.0, hw)[0], p(1066.0, hw)[0], f"{fmt(model.overhang_short)} (DRV-5) [FT-OVERHANG-SHORT]")
    dimension_vertical(page, p(1110.0, hw)[1], p(1110.0, hw + cw)[1], p(1110.0, hw)[0], p(1102.0, hw)[0], f"{fmt(cw)}* [FT-CUSHION-WIDTH]")

    fall_edge = (fall_c[0] + fall_r * bis[0], fall_c[1] + fall_r * bis[1])
    leader(page, p(*fall_edge), (p(*fall_edge)[0] + 14.0, p(*fall_edge)[1] + 16.0), (p(*fall_edge)[0] + 16.0, p(*fall_edge)[1] + 16.0),
           [f"FALL DIA {fmt(model.corner_throat)}* (THROAT, DRV-6) [FT-CORNER-THROAT]"])
    rim_r = fall_r + 18.0
    rim_pt = (fall_c[0] - rim_r / math.sqrt(2.0), fall_c[1] + rim_r / math.sqrt(2.0))
    leader(page, p(*rim_pt), (p(*rim_pt)[0] - 30.0, p(*rim_pt)[1] + 12.0), (p(*rim_pt)[0] - 32.0, p(*rim_pt)[1] + 12.0),
           ["FLUSH SILVER RIM + FOAM DAMPENER PLUG", "(RIM BAND REF ONLY - WIDTH TBD, IN-488P-6)", "[FT-POCKET-FAMILY]"], color=REF_BLUE)
    f_mid = ((t1[0] + d1[0]) / 2.0, (t1[1] + d1[1]) / 2.0)
    leader(page, p(*f_mid), (p(*f_mid)[0] - 10.0, p(*f_mid)[1] + 41.0), (p(*f_mid)[0] - 8.0, p(*f_mid)[1] + 41.0),
           [f"FACING 135 DEG + {fmt(model.corner_facing_deg)} DEG* = 142 DEG INCL.", "(ASSUMPTION - NO PUBLISHED VALUE)", "FACINGS CONVERGE TO THE THROAT (KERNEL)", "[FT-CORNER-FACING]"])
    leader(page, p(*t2), (p(*t2)[0] + 34.0, p(*t2)[1] - 20.0), (p(*t2)[0] + 36.0, p(*t2)[1] - 20.0),
           [f"JAW ARC R{fmt(model.corner_jaw_r)}* (BOTH NOSES,", "TANGENT TO NOSE LINE + FACING)", "[FT-CORNER-JAW-RADIUS]"])

    notes_x = 268.0
    notes_end = text_block(
        page,
        notes_x,
        44.0,
        [
            "NOTES",
            "1. Canonical corner instance CP-FOOT-RIGHT; the other three",
            "   corners place this construction with the sx (width) / sy",
            "   (length) mirror signs (JSON frames).",
            "2. Mouth is the kernel TRUE MOUTH: nose-to-nose across the",
            "   corner diagonal; noses set back mouth/sqrt(2) along each rail.",
            "3. K-FALL CTR: fall-disc centre behind the theoretical corner",
            "   nose point K along the diagonal (kernel convention).",
            "   SHELF* = mouth line -> fall lip (WPA convention); the kernel",
            "   corner_depth_for_shelf formula ties the two (sheet 5, DRV-2).",
            "4. Pro-cut 4.25 in corner is OUTSIDE the WPA recommended",
            "   4.5-4.625 in band (CFL-6): PBS sanctioning context, not error.",
            "5. Jaw geometry above IS the kernel construction (facing angle,",
            "   jaw arc, tangency) - re-derived, not re-authored; mechanical",
            "   tangency checks ride the validation report.",
            "6. Flush-rim drop family: no boot, no net (third family vs",
            "   GH-489 net / GH-490 ring / Diamond horseshoe).",
            "7. No installed corner top-down exists publicly (dossier gap 1);",
            "   corner rim band remains REF until photo harvest lands.",
            "8. Rail outer envelope corner drawn sharp (grey): furniture wrap",
            "   around the pocket belongs to the modeling wave (P-A3).",
            "9. Dashed nose circles: the kernel jaw primitive is a FULL",
            "   CIRCLE (span: None, collision-active everywhere); the solid",
            "   subarc is the furniture-visible nose blend.",
        ],
        size=2.0,
        leading=3.2,
        bold_first=True,
    )
    draw_legend(page, notes_x, notes_end + 4.0)

    draw_title_block(page, data, source_hash, total_sheets, "1:2")
    return page


# ---------------------------------------------------------------------------
# sheet 2: side pocket assembly plan
# ---------------------------------------------------------------------------


def build_side_sheet(data: dict[str, Any], model: Model, source_hash: str, total_sheets: int) -> DrawingPage:
    page = DrawingPage(2, "SIDE POCKET ASSEMBLY - PLAN", "SIDE POCKET - PLAN")
    draw_sheet_frame(page)
    side_converged = abs(model.side_mouth - model.side_mouth_ref) <= 1e-6
    draw_page_heading(page, "Flush-rim drop family; canonical instance SP-RIGHT in PCF-PDT-SP; "
                      + ("production mouth = kernel = official 4.92 in (CAL-1 closed, PR #601)" if side_converged
                         else "production mouth = kernel-pinned; official 4.92 in rides as REFERENCE (CAL-1)"))
    draw_watermark(page, data["document"]["status"])

    geo = side_construction(model)
    view = View(60.0, 60.0, -230.0, 500.0, 0.5)
    p = view.to_page
    hw, cw = model.half_wid, model.cushion_w
    n_l, t_l, d_l, c_l = geo["n_l"], geo["t_l"], geo["d_l"], geo["c_l"]
    n_r, t_r, d_r, c_r = geo["n_r"], geo["t_r"], geo["d_r"], geo["c_r"]
    fall_c = geo["fall_c"]
    fall_r = model.side_throat / 2.0
    rail_outer = hw + model.overhang_short

    # nose lines end at the true-mouth nose points
    page.line(*p(-230.0, hw), *p(*n_l), width=LINE_DEFINED)
    page.line(*p(*n_r), *p(230.0, hw), width=LINE_DEFINED)
    # jaw arcs: kernel primitive is a FULL CIRCLE (span: None) - dashed
    # disclosure circle beneath the furniture-visible solid subarc
    page.circle(*p(*c_l), view.d(model.side_jaw_r), line_width=LINE_DIMENSION, dash=(1.5, 1.2), color=GRAY)
    page.circle(*p(*c_r), view.d(model.side_jaw_r), line_width=LINE_DIMENSION, dash=(1.5, 1.2), color=GRAY)
    al_start = math.degrees(math.atan2(n_l[1] - c_l[1], n_l[0] - c_l[0]))
    al_end = math.degrees(math.atan2(t_l[1] - c_l[1], t_l[0] - c_l[0]))
    page.arc(*p(*c_l), view.d(model.side_jaw_r), al_start, al_end, width=LINE_DEFINED)
    ar_start = math.degrees(math.atan2(n_r[1] - c_r[1], n_r[0] - c_r[0]))
    ar_end = math.degrees(math.atan2(t_r[1] - c_r[1], t_r[0] - c_r[0]))
    page.arc(*p(*c_r), view.d(model.side_jaw_r), ar_start, ar_end, width=LINE_DEFINED)
    # facings (converging per kernel; exact_side_facing branch)
    page.line(*p(*t_l), *p(*d_l), width=LINE_DEFINED)
    page.line(*p(*t_r), *p(*d_r), width=LINE_DEFINED)
    # cushion back edges meet the facing back ends
    page.line(*p(-230.0, hw + cw), *p(*d_l), width=LINE_OBJECT)
    page.line(*p(*d_r), *p(230.0, hw + cw), width=LINE_OBJECT)
    # rail outer edge
    page.line(*p(-230.0, rail_outer), *p(230.0, rail_outer), width=LINE_NORMAL, color=GRAY)
    # mouth chain line
    page.line(*p(*n_l), *p(*n_r), width=LINE_DIMENSION, dash=(4.0, 1.5))
    # fall circle + flush-rim REF annulus
    page.circle(*p(*fall_c), view.d(fall_r), line_width=LINE_DEFINED)
    page.circle(*p(*fall_c), view.d(fall_r + 18.0), line_width=LINE_DIMENSION, dash=(2.5, 1.5), color=REF_BLUE)
    # centreline
    page.line(*p(0.0, hw - 50.0), *p(0.0, fall_c[1] + fall_r + 28.0), width=LINE_DIMENSION, dash=(6.0, 1.5, 1.0, 1.5), color=GRAY)

    # dimensions
    y_nose = p(0.0, hw)[1]
    # r4 (CAL-1 closed): once the kernel adopts the official value the red
    # reference twin collapses into the single agreed mouth dimension; the
    # divergent two-dim form below is kept verbatim so re-opening the values
    # re-arms the conflict rendering with no generator change.
    if abs(model.side_mouth - model.side_mouth_ref) > 1e-6:
        dimension_horizontal(page, p(*n_l)[0], p(*n_r)[0], y_nose, y_nose - 12.0, f"{fmt(model.side_mouth)}* MOUTH (KERNEL-PINNED) [FT-SIDE-MOUTH]")
        dimension_horizontal(page, p(-model.side_mouth_ref / 2.0, hw)[0], p(model.side_mouth_ref / 2.0, hw)[0], y_nose, y_nose - 22.0,
                             f"({fmt(model.side_mouth_ref)}) OFFICIAL 4.92 IN - CONFLICT CAL-1 [FT-SIDE-MOUTH]", color=CONFLICT_RED)
    else:
        dimension_horizontal(page, p(*n_l)[0], p(*n_r)[0], y_nose, y_nose - 12.0, f"{fmt(model.side_mouth)}* MOUTH (OFFICIAL 4.92 IN = KERNEL, CAL-1 CLOSED) [FT-SIDE-MOUTH]")
    dimension_vertical(page, y_nose, p(0.0, fall_c[1])[1], p(0.0, hw)[0], p(-150.0, hw)[0], f"{fmt(model.side_depth)}* FALL CENTRE (DRV-3) [FT-SIDE-DEPTH]")
    dimension_vertical(page, y_nose, p(0.0, hw + cw)[1], p(-215.0, hw)[0], p(-222.0, hw)[0], f"{fmt(cw)}* [FT-CUSHION-WIDTH]")

    lip = (0.0, fall_c[1] - fall_r)
    leader(page, p(*lip), (p(*lip)[0] + 40.0, p(*lip)[1] - 14.0), (p(*lip)[0] + 42.0, p(*lip)[1] - 14.0),
           [f"FALL LIP {fmt(model.side_shelf)} BEHIND NOSE LINE = SHELF* (DRV-3) [FT-SIDE-SHELF]"])
    fall_edge = (fall_c[0] + fall_r * 0.7071, fall_c[1] + fall_r * 0.7071)
    leader(page, p(*fall_edge), (p(*fall_edge)[0] + 30.0, p(*fall_edge)[1] + 18.0), (p(*fall_edge)[0] + 32.0, p(*fall_edge)[1] + 18.0),
           [f"FALL DIA {fmt(model.side_throat)}* (THROAT) [FT-SIDE-THROAT]"])
    rim_pt = (fall_c[0] - (fall_r + 18.0) * 0.7071, fall_c[1] + (fall_r + 18.0) * 0.7071)
    leader(page, p(*rim_pt), (p(*rim_pt)[0] - 20.0, p(*rim_pt)[1] + 12.0), (p(*rim_pt)[0] - 22.0, p(*rim_pt)[1] + 12.0),
           ["FLUSH SILVER RIM + FOAM DAMPENER PLUG", "(RIM BAND REF ONLY - WIDTH TBD, IN-488P-6)", "FORM SOURCE: 4865 PX OFFICIAL TOP-DOWN", "[FT-POCKET-FAMILY]"], color=REF_BLUE)
    f_mid = ((t_r[0] + d_r[0]) / 2.0, (t_r[1] + d_r[1]) / 2.0)
    leader(page, p(*f_mid), (p(*f_mid)[0] + 30.0, p(*f_mid)[1] + 34.0), (p(*f_mid)[0] + 32.0, p(*f_mid)[1] + 34.0),
           [f"FACING 90 DEG + {fmt(model.side_facing_deg)} DEG* = 104 DEG INCL.", "(ASSUMPTION; PHOTO-MEASURE IN-488P-7 / CAL-2) [FT-SIDE-FACING]", "FACINGS CONVERGE TO THE THROAT (KERNEL,", f"exact_side_facing = {str(model.exact_side_facing).lower()})"])
    leader(page, p(*n_r), (p(*n_r)[0] + 30.0, p(*n_r)[1] - 30.0), (p(*n_r)[0] + 32.0, p(*n_r)[1] - 30.0),
           [f"JAW ARC R{fmt(model.side_jaw_r)}* (BOTH NOSES,", "TANGENT TO NOSE LINE + FACING)", "[FT-SIDE-JAW-RADIUS]"])

    notes_x = 292.0
    notes_end = text_block(
        page,
        notes_x,
        44.0,
        [
            "NOTES",
            "1. Canonical side instance SP-RIGHT; SP-LEFT mirrors with",
            "   the sx width-axis sign (JSON frames).",
            *(["2. PRODUCTION mouth = kernel = the OFFICIAL 4.92 in /",
               "   124.968 mm (CAL-1 CLOSED: catalog v17 ceremony landed",
               "   via PR #601, owner-approved; conflict CFL-2 RESOLVED).",
               "   The dealer-relayed 5.0 in / 127.0 assumption is retired."]
              if side_converged else
              ["2. PRODUCTION mouth stays the kernel catalog 127.0 (5.0 in",
               "   assumption) this wave - zero-drift law. The official",
               "   4.92 in / 124.968 value is REFERENCE ONLY until the",
               "   calibration-wave ceremony lands (CAL-1: catalog bump,",
               "   regression pack, TS mirror, replay pinning; owner-gated)."]),
            "3. Jaw geometry IS the kernel construction (facing angle,",
            "   jaw arc, tangency; exact_side_facing branch) - re-derived,",
            "   not re-authored; tangency checks ride the validation report.",
            "4. Side jaw cut angle is photo-measurable from the official",
            "   4865 x 3893 top-down; instrument IN-488P-7 feeds CAL-2.",
            "5. Dashed nose circles: the kernel jaw primitive is a FULL",
            "   CIRCLE (span: None, collision-active everywhere); the solid",
            "   subarc is the furniture-visible nose blend.",
        ],
        size=2.0,
        leading=3.2,
        bold_first=True,
    )
    draw_legend(page, notes_x, notes_end + 4.0)

    draw_title_block(page, data, source_hash, total_sheets, "1:2")
    return page


# ---------------------------------------------------------------------------
# sheet 3: cushion profile section
# ---------------------------------------------------------------------------


def build_cushion_sheet(data: dict[str, Any], model: Model, source_hash: str, total_sheets: int) -> DrawingPage:
    page = DrawingPage(3, "K55 CUSHION PROFILE - SECTION", "K55 CUSHION SECTION")
    draw_sheet_frame(page)
    draw_page_heading(page, "Section normal to the long rail; sourced controls only - rubber body form is REFERENCE (no published K55 dims); Z0 datum = bed cloth top")
    draw_watermark(page, data["document"]["status"])

    # section frame: sx = horizontal from the nose plane (positive outward
    # into the rail), sz = height above the bed cloth. 1:1.
    ox, oy = 96.0, 158.0

    def q(sx: float, sz: float) -> Point:
        return (ox + sx, oy - sz)

    nose_h = model.nose_height
    rail_top = nose_h + 11.0  # REFERENCE only: offset above nose unpublished
    rail_out = model.cushion_w + model.rail_band
    # bed cloth (defined) + slate
    page.line(*q(-60.0, 0.0), *q(0.0, 0.0), width=LINE_DEFINED)
    page.line(*q(0.0, 0.0), *q(rail_out, 0.0), width=LINE_DIMENSION, dash=(2.5, 1.5), color=GRAY)
    page.line(*q(-60.0, -model.slate_t), *q(rail_out, -model.slate_t), width=LINE_OBJECT)
    page.line(*q(-60.0, 0.0), *q(-60.0, -model.slate_t), width=LINE_DIMENSION)
    # nose plane control edge (defined): bed -> nose point
    page.line(*q(0.0, 0.0), *q(0.0, nose_h), width=LINE_DEFINED)
    # cushion rubber body: REFERENCE outline only
    page.polyline(
        [q(0.0, nose_h), q(12.0, nose_h + 9.0), q(model.cushion_w, rail_top), q(model.cushion_w, 8.0), q(8.0, 1.5), q(0.0, nose_h)],
        width=LINE_DIMENSION,
        dash=(2.5, 1.5),
        color=REF_BLUE,
    )
    # rail wood band: REFERENCE
    page.polyline(
        [q(model.cushion_w, rail_top), q(rail_out, rail_top), q(rail_out, -35.0)],
        width=LINE_NORMAL,
        dash=(2.5, 1.5),
        color=GRAY,
    )
    # sight inlay on the rail top, edge-on in this section: flush chord of
    # length 2*R on the rail-top line + dashed REF body below (inlay depth
    # unpublished)
    sight_x = model.sight_inset
    page.line(*q(sight_x - model.sight_r, rail_top), *q(sight_x + model.sight_r, rail_top), width=LINE_OBJECT, color=GRAY)
    page.polyline(
        [q(sight_x - model.sight_r, rail_top), q(sight_x - model.sight_r, rail_top - 2.0), q(sight_x + model.sight_r, rail_top - 2.0), q(sight_x + model.sight_r, rail_top)],
        width=LINE_DIMENSION,
        dash=(1.5, 1.2),
        color=GRAY,
    )
    # ball reference: resting on the bed, touching the nose plane at nose_h
    ball_r = model.ball_d / 2.0
    ball_cx = -math.sqrt(max(ball_r * ball_r - (nose_h - ball_r) ** 2, 0.0))
    page.circle(*q(ball_cx, ball_r), ball_r, line_width=LINE_DIMENSION, dash=(3.0, 1.5), color=GRAY)
    # nose-height chain line through the contact point
    page.line(*q(-58.0, nose_h), *q(10.0, nose_h), width=LINE_DIMENSION, dash=(6.0, 1.5, 1.0, 1.5), color=GRAY)

    # dimensions
    dimension_vertical(page, q(0.0, nose_h)[1], q(0.0, 0.0)[1], q(0.0, 0.0)[0], q(-46.0, 0.0)[0], f"{fmt(model.nose_height)} NOSE (DRV-1)* [FT-CUSHION-NOSE-HEIGHT]")
    dimension_vertical(page, q(0.0, 0.0)[1], q(0.0, -model.slate_t)[1], q(-55.0, 0.0)[0], q(-58.0, 0.0)[0], f"{fmt(model.slate_t)} SLATE [FT-SLATE]")
    dimension_horizontal(page, q(0.0, 0.0)[0], q(model.cushion_w, 0.0)[0], q(0.0, rail_top)[1], q(0.0, nose_h + 24.0)[1], f"{fmt(model.cushion_w)}* CUSHION [FT-CUSHION-WIDTH]")
    dimension_horizontal(page, q(model.cushion_w, 0.0)[0], q(rail_out, 0.0)[0], q(0.0, rail_top)[1], q(0.0, nose_h + 36.0)[1], f"({fmt(model.rail_band)})* RAIL BAND (DRV-7) [FT-RAIL-BAND]")

    k55_tip = q(25.0, nose_h + 10.2)
    leader(page, k55_tip, (k55_tip[0] + 34.0, k55_tip[1] - 44.0), (k55_tip[0] + 36.0, k55_tip[1] - 44.0),
           ["K55 PRO SPEED (OFFICIAL DESIGNATION) [FT-CUSHION-FAMILY]", "RUBBER BODY OUTLINE = REFERENCE ONLY", "(NO PUBLISHED PROFILE DIMS; PHOTO EVIDENCE", "INSTALL2 RAIL-RECLOTH FRAMES)"], color=REF_BLUE)
    ball_tip = q(ball_cx - ball_r * 0.6, ball_r * 1.75)
    leader(page, ball_tip, (ball_tip[0] - 10.0, ball_tip[1] - 18.0), (ball_tip[0] - 8.0, ball_tip[1] - 18.0),
           [f"BALL DIA ({fmt(model.ball_d)}) REF", "WPA 2 1/4 IN [FT-BALL]"], color=GRAY)
    sight_tip = q(sight_x, rail_top)
    leader(page, sight_tip, (sight_tip[0] + 18.0, sight_tip[1] - 12.0), (sight_tip[0] + 20.0, sight_tip[1] - 12.0),
           [f"SIGHT INLAY R{fmt(model.sight_r)} FLUSH, EDGE-ON (RENDER VALUE),", f"INSET ({fmt(model.sight_inset)}) FROM NOSE*; DEPTH REF", "[FT-SIGHTS]"], color=GRAY)
    rt_tip = q(rail_out - 30.0, rail_top)
    leader(page, rt_tip, (rt_tip[0] + 4.0, rt_tip[1] - 58.0), (rt_tip[0] + 2.0, rt_tip[1] - 58.0),
           ["RAIL TOP: OFFSET ABOVE NOSE", "UNPUBLISHED - REFERENCE (RU-1)"], color=GRAY)

    notes_x = 286.0
    notes_end = text_block(
        page,
        notes_x,
        44.0,
        [
            "NOTES",
            "1. NOSE* = 0.635 x ball diameter (WPA 63.5% nominal,",
            "   kernel nose_height_frac). Nothing published by Predator;",
            "   flagged to the K55 cushion calibration program (CAL-3).",
            "2. Render label 'us_pool_k66' is a ledgered MISLABEL vs the",
            "   official K55 Pro Speed (CFL-4); rename = uplift item RU-2.",
            "   Zero physics impact; NOT changed by this document.",
            "3. Rail-top offset above the nose and the floor-datum split of",
            "   the 800 envelope height are unpublished: dashed lines are",
            "   REFERENCE (RU-1 re-pin decision inputs).",
            "4. Sights: round brushed inlays, spacing 317.5 = playfield/8",
            "   (WPA section 6, assumption; sheet 4 plan).",
        ],
        size=2.0,
        leading=3.2,
        bold_first=True,
    )
    draw_legend(page, notes_x, notes_end + 4.0)

    draw_title_block(page, data, source_hash, total_sheets, "1:1")
    return page


# ---------------------------------------------------------------------------
# sheet 4: envelope plan + rail/apron elevation
# ---------------------------------------------------------------------------


def build_envelope_sheet(data: dict[str, Any], model: Model, source_hash: str, total_sheets: int) -> DrawingPage:
    page = DrawingPage(4, "ENVELOPE PLAN + RAIL/APRON ELEVATION", "ENVELOPE + ELEVATION")
    draw_sheet_frame(page)
    draw_page_heading(page, "Datum decision DD-1: official mm column primary (2895 x 1615 x 800); inch column display-only; repo P8 superseded (CFL-3 -> RU-1)")
    draw_watermark(page, data["document"]["status"])

    s = 0.05  # 1:20 for both views
    # FIRST-ANGLE arrangement: the elevation (front view) sits on top and the
    # plan (view from above) is placed BELOW it.
    # --- envelope plan --------------------------------------------------
    ex, ey = 40.0, 150.0
    env_w = model.env_len * s
    env_h = model.env_wid * s
    page.rect(ex, ey, env_w, env_h, line_width=LINE_OBJECT)
    pf_w = 2.0 * model.half_len * s
    pf_h = 2.0 * model.half_wid * s
    pf_x = ex + (env_w - pf_w) / 2.0
    pf_y = ey + (env_h - pf_h) / 2.0
    page.rect(pf_x, pf_y, pf_w, pf_h, line_width=LINE_DEFINED)
    page.rect(pf_x - model.cushion_w * s, pf_y - model.cushion_w * s, pf_w + 2.0 * model.cushion_w * s, pf_h + 2.0 * model.cushion_w * s, line_width=LINE_DIMENSION, color=GRAY)
    # pocket fall circles: corners offset corner_depth/sqrt(2) outward per axis
    off = model.corner_depth / math.sqrt(2.0) * s
    fall_r = model.corner_throat / 2.0 * s
    for cxs, cys, sx_, sy_ in ((pf_x, pf_y, -1, -1), (pf_x + pf_w, pf_y, 1, -1), (pf_x, pf_y + pf_h, -1, 1), (pf_x + pf_w, pf_y + pf_h, 1, 1)):
        page.circle(cxs + sx_ * off, cys + sy_ * off, fall_r, line_width=LINE_NORMAL)
    side_r = model.side_throat / 2.0 * s
    mid_x = ex + env_w / 2.0
    mid_y = ey + env_h / 2.0
    page.circle(mid_x, pf_y - model.side_depth * s, side_r, line_width=LINE_NORMAL)
    page.circle(mid_x, pf_y + pf_h + model.side_depth * s, side_r, line_width=LINE_NORMAL)
    # sights: long rails 3 per quadrant, end rails 3 each (WPA layout, REF);
    # centres at the declared inset from the nose line, declared radius
    inset = model.sight_inset * s
    sight_r = model.sight_r * s
    for i in (1, 2, 3):
        for sx_ in (mid_x - i * model.sight_spacing * s, mid_x + i * model.sight_spacing * s):
            page.circle(sx_, pf_y - inset, sight_r, line_width=LINE_DIMENSION, color=GRAY)
            page.circle(sx_, pf_y + pf_h + inset, sight_r, line_width=LINE_DIMENSION, color=GRAY)
    for j in (-1, 0, 1):
        for sy_ in (pf_x - inset, pf_x + pf_w + inset):
            page.circle(sy_, mid_y + j * model.sight_spacing * s, sight_r, line_width=LINE_DIMENSION, color=GRAY)

    dimension_horizontal(page, ex, ex + env_w, ey + env_h, ey + env_h + 12.0, f"{fmt(model.env_len)} (DD-1) [FT-ENVELOPE]")
    dimension_horizontal(page, pf_x, pf_x + pf_w, ey + env_h, ey + env_h + 21.0, f"{fmt(2.0 * model.half_len)} PLAYFIELD [FT-PLAYFIELD]")
    dimension_vertical(page, ey, ey + env_h, ex + env_w, ex + env_w + 12.0, f"{fmt(model.env_wid)} (DD-1) [FT-ENVELOPE]")
    dimension_vertical(page, pf_y, pf_y + pf_h, ex + env_w, ex + env_w + 21.0, f"{fmt(2.0 * model.half_wid)} PLAYFIELD [FT-PLAYFIELD]")
    dimension_horizontal(page, ex, pf_x, ey + env_h, ey + env_h + 30.0, f"{fmt(model.overhang_long)} (DRV-4) [FT-OVERHANG-LONG]")
    dimension_vertical(page, ey, pf_y, ex, ex - 8.0, f"{fmt(model.overhang_short)} (DRV-5) [FT-OVERHANG-SHORT]")
    dimension_horizontal(page, mid_x, mid_x + model.sight_spacing * s, ey, ey - 8.0, f"({fmt(model.sight_spacing)}) SIGHT PITCH* [FT-SIGHTS]")
    page.text(ex + env_w - 14.0, ey + env_h + 27.0, "PLAN", size=2.8, bold=True)

    # --- long-side elevation (front view, above the plan: first angle) ---
    vx, vy = 40.0, 62.0  # vy = rail-top line
    elev_w = model.env_len * s
    floor_y = vy + model.env_hgt * s
    apron_bot = vy + model.apron_h * s
    page.text(vx, vy - 6.0, "ELEVATION - LONG SIDE", size=2.8, bold=True)
    page.line(vx, vy, vx + elev_w, vy, width=LINE_DEFINED)
    page.rect(vx, vy, elev_w, model.apron_h * s, line_width=LINE_OBJECT)
    page.line(vx - 10.0, floor_y, vx + elev_w + 10.0, floor_y, width=LINE_OBJECT)
    leg_w = 420.0 * s
    for lx in (vx + 260.0 * s, vx + elev_w - 260.0 * s - leg_w):
        page.rect(lx, apron_bot, leg_w, floor_y - apron_bot, line_width=LINE_NORMAL, dash=(2.5, 1.5), color=GRAY)
    page.text(vx, floor_y + 13.0, "SLAB LEGS (OPTIONAL LED): POSITIONS/WIDTHS UNPUBLISHED - REFERENCE OUTLINE ONLY, UNDIMENSIONED (FT-LEGS)", size=1.8, color=GRAY)

    dimension_horizontal(page, vx, vx + elev_w, floor_y, floor_y + 9.0, f"{fmt(model.env_len)} (DD-1) [FT-ENVELOPE]")
    dimension_vertical(page, vy, floor_y, vx + elev_w, vx + elev_w + 10.0, f"{fmt(model.env_hgt)} (DD-1, CFL-8) [FT-ENVELOPE]")
    dimension_vertical(page, vy, apron_bot, vx, vx - 9.0, f"{fmt(model.apron_h)} APRON (CFL-5) [FT-APRON]")

    notes_x = 262.0
    notes_end = text_block(
        page,
        notes_x,
        44.0,
        [
            "NOTES",
            "1. DD-1: official mm column adopted (systematic inch round-up",
            "   pattern, deltas +26/+36/+12.8 - DRV-10; apron repeats it,",
            "   DRV-11). Inch column 115 x 65 x 32 display-only.",
            "2. Repo P8 render footprint 2875 x 1605 / rail top 786 matches",
            "   NEITHER official column: superseded for authoring, render",
            "   re-pin = uplift item RU-1 (CFL-3). Not changed here.",
            "3. Height 800 (floor-rail top) exceeds the WPA recommended",
            "   743-787 band (CFL-8); PBS sanctioning context.",
            "4. 1-piece 25 mm Brazilian slate (flips into cart) vs WPA",
            "   3-piece tournament clause: ledger CFL-7.",
            "5. Elevation shows the long side; matte black flat skirt +",
            "   silver rim pockets = Apex-vs-ARC broadcast discriminator.",
            "6. Corner fall circles drawn at the kernel placement (centre",
            "   corner_pocket_depth behind each corner along the diagonal).",
            "7. Sights (REF): 3 per long-rail quadrant + 3 per end rail,",
            "   pitch 317.5 = playfield/8 (WPA section 6, assumption).",
        ],
        size=2.0,
        leading=3.2,
        bold_first=True,
    )
    draw_legend(page, notes_x, notes_end + 4.0)

    draw_title_block(page, data, source_hash, total_sheets, "1:20")
    return page


# ---------------------------------------------------------------------------
# sheet 5: sources / derivations / conflicts tables
# ---------------------------------------------------------------------------


def build_tables_sheet(data: dict[str, Any], model: Model, source_hash: str, total_sheets: int) -> DrawingPage:
    page = DrawingPage(5, "SOURCES / DERIVATIONS / CONFLICTS")
    draw_sheet_frame(page)
    draw_page_heading(page, "Machine authority = the canonical JSON + SHA-256 below; this sheet is a derived rendering of its ledger tables")
    draw_watermark(page, data["document"]["status"])

    y = 40.0
    page.text(28.0, y, "DERIVATION TABLE", size=2.8, bold=True)
    y += 4.5
    for item in data["derivations"]:
        result = "-" if item["result_mm"] is None else fmt(float(item["result_mm"]))
        line = f"{item['id']}  {item['formula']}  = {result}"
        for wrapped in wrap_text(line, 118):
            page.text(28.0, y, wrapped, size=1.9, mono=True)
            y += 3.0
    y += 3.0
    page.text(28.0, y, "CONFLICT LEDGER (HONEST - NOTHING FIXED OUT OF CEREMONY)", size=2.8, bold=True, color=CONFLICT_RED)
    y += 4.5
    for item in data["conflicts"]:
        for index, wrapped in enumerate(wrap_text(f"{item['id']} [{item['severity']}] {item['statement']} RESOLUTION: {item['resolution']}", 128)):
            page.text(28.0, y, wrapped, size=1.8, color=CONFLICT_RED if index == 0 else BLACK)
            y += 2.8
        y += 0.8
    y += 2.0
    page.text(28.0, y, "CALIBRATION ITEMS (KERNEL, OWNER-GATED) + UPLIFT ITEMS (RENDER)", size=2.8, bold=True)
    y += 4.5
    for item in data["calibration_items"]:
        for wrapped in wrap_text(f"{item['id']}  {item['title']}  CEREMONY: {item['ceremony']}", 128):
            page.text(28.0, y, wrapped, size=1.8)
            y += 2.8
    for item in data["uplift_items"]:
        for wrapped in wrap_text(f"{item['id']}  {item['title']}  WAVE: {item['wave']}", 128):
            page.text(28.0, y, wrapped, size=1.8)
            y += 2.8

    sy = 40.0
    page.text(262.0, sy, "SOURCES", size=2.8, bold=True)
    sy += 4.5
    for item in data["sources"]:
        auth = "AUTH" if item["dimensional_authority"] else "ref"
        for wrapped in wrap_text(f"{item['id']} [{auth}] {item['reference']}", 62):
            page.text(262.0, sy, wrapped, size=1.7)
            sy += 2.6
        sy += 0.6
    sy += 2.0
    page.text(262.0, sy, "DATUM DECISION DD-1", size=2.8, bold=True)
    sy += 4.5
    for line in wrap_text(data["datum_decision"]["decision"], 62):
        page.text(262.0, sy, line, size=1.8)
        sy += 2.8
    sy += 1.0
    for line in wrap_text("DECIDED BY: " + data["datum_decision"]["decided_by"], 62):
        page.text(262.0, sy, line, size=1.7, color=GRAY)
        sy += 2.6

    draw_title_block(page, data, source_hash, total_sheets, "-")
    return page


def feature_value_text(item: dict[str, Any]) -> str:
    parts: list[str] = []
    if "value_mm" in item:
        parts.append(", ".join(f"{k}={fmt(float(v))}" for k, v in item["value_mm"].items()))
    if "value_deg" in item:
        parts.append(f"{fmt(float(item['value_deg']))} deg")
    if "value_ratio" in item:
        # A DIMENSIONLESS feature. It is printed with its own unit word because
        # every other column on this sheet is millimetres, and a bare 0.2565 in
        # a millimetre table reads as a quarter of a millimetre. The tolerance
        # rides the same row for the same reason.
        ratio = dict(item["value_ratio"])
        tol = ratio.pop("tolerance", None)
        body = ", ".join(f"{k}={fmt(float(v), 4)}" for k, v in ratio.items())
        parts.append(f"{body} (RATIO, dimensionless)"
                     + (f" +/- {fmt(float(tol), 4)}" if tol is not None else ""))
    if "official_reference_mm" in item:
        parts.append(f"official ref {fmt(float(item['official_reference_mm']))}")
    if "value_text" in item:
        parts.append(str(item["value_text"]))
    return "; ".join(parts)


def build_features_sheet(data: dict[str, Any], model: Model, source_hash: str, total_sheets: int) -> DrawingPage:
    page = DrawingPage(6, "FEATURE TABLE", "FEATURE TABLE")
    draw_sheet_frame(page)
    draw_page_heading(page, "Every canonical feature record: the FT-* ids cited by the sheet callouts trace to these rows; the JSON is machine authority")
    draw_watermark(page, data["document"]["status"])

    columns = [(28.0, 44.0), (218.0, 44.0)]
    column_index = 0
    x, y = columns[column_index]
    for item in data["features"]:
        scope = item["scope"]
        conflicts = " ".join(item.get("conflicts", []))
        header = f"{item['id']}  [{item['tier']} / {scope}]" + (f"  conflicts: {conflicts}" if conflicts else "")
        lines = [header]
        for wrapped in wrap_text(feature_value_text(item), 96):
            lines.append("  " + wrapped)
        lines.append("  src: " + ", ".join(item["sources"]))
        needed = len(lines) * 2.4 + 1.4
        if y + needed > 220.0 and column_index == 0:
            column_index = 1
            x, y = columns[column_index]
        for index, line in enumerate(lines):
            page.text(x, y, line, size=1.7, bold=index == 0, color=CONFLICT_RED if index == 0 and conflicts else BLACK)
            y += 2.4
        y += 1.4
    draw_title_block(page, data, source_hash, total_sheets, "-")
    return page


# ---------------------------------------------------------------------------
# validation
# ---------------------------------------------------------------------------


def validate(data: dict[str, Any], model: Model, source_hash: str) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []

    def round_floats(value: Any) -> Any:
        """Round diagnostic floats so the report is byte-stable across
        compatible Python/libm versions (ULP noise otherwise breaks --check)."""
        if isinstance(value, float):
            return round(value, 9)
        if isinstance(value, list):
            return [round_floats(item) for item in value]
        if isinstance(value, tuple):
            return [round_floats(item) for item in value]
        if isinstance(value, dict):
            return {key: round_floats(item) for key, item in value.items()}
        return value

    def add(check_id: str, status: str, message: str, **values: Any) -> None:
        checks.append({"id": check_id, "status": status, "message": message, **{k: round_floats(v) for k, v in values.items()}})

    def close(check_id: str, actual: float, expected: float, message: str, tol: float = 1e-6) -> None:
        if abs(actual - expected) <= tol:
            add(check_id, "PASS", message, actual=actual, expected=expected)
        else:
            add(check_id, "FAIL", message, actual=actual, expected=expected)

    close("DRV-1", model.nose_height, 0.635 * model.ball_d, "nose height = 0.635 x ball")
    close("DRV-2", model.corner_depth, model.corner_shelf + model.corner_throat / 2.0 - model.corner_mouth / 2.0, "corner depth formula (kernel verbatim)")
    close("DRV-3", model.side_depth, model.side_shelf + model.side_throat / 2.0, "side depth formula (kernel verbatim)")
    close("DRV-4", model.overhang_long, (model.env_len - 2.0 * model.half_len) / 2.0, "long overhang")
    close("DRV-5", model.overhang_short, (model.env_wid - 2.0 * model.half_wid) / 2.0, "short overhang")
    close("DRV-6", model.corner_throat, (4.25 - 0.7) * 25.4, "corner throat = mouth - 0.7 in", tol=1e-9)
    close("DRV-7", model.rail_band, model.overhang_short - model.cushion_w, "rail band = short overhang - cushion width")
    close("DRV-8", model.sight_spacing, 2.0 * model.half_len / 8.0, "sight spacing = playfield/8")
    close("DRV-9", model.side_mouth_ref, 4.92 * 25.4, "official side mouth = 4.92 in exact")
    close("KERNEL-CORNER-MOUTH", model.corner_mouth, 4.25 * 25.4, "corner mouth = 4.25 in exact (official + kernel)")
    # r4: the pin moved WITH the kernel (CAL-1 closed via PR #601) — the
    # production side mouth now equals the official 4.92 in exactly.
    close("KERNEL-SIDE-MOUTH-PIN", model.side_mouth, 4.92 * 25.4, "production side mouth = kernel = official 4.92 in (CAL-1 closed)")
    # zero-drift law: the COMPLETE kernel-collision tuple must equal the shipped
    # catalog (PocketTableSpec::predator_apex_9ft @ the pinned commit, mm)
    kernel_baseline = {
        "playfield_length": (2.0 * model.half_len, 2540.0),
        "playfield_width": (2.0 * model.half_wid, 1270.0),
        "ball_diameter": (model.ball_d, 57.15),
        "cushion_width": (model.cushion_w, 50.8),
        "nose_height": (model.nose_height, 0.635 * 57.15),
        "corner_mouth": (model.corner_mouth, 107.95),
        "side_mouth": (model.side_mouth, 124.968),  # r4: CAL-1 closed, PR #601
        "corner_facing_deg": (model.corner_facing_deg, 7.0),
        "side_facing_deg": (model.side_facing_deg, 14.0),
        "corner_jaw_radius": (model.corner_jaw_r, 20.95),
        "side_jaw_radius": (model.side_jaw_r, 7.95),
        "corner_throat": (model.corner_throat, 90.17),
        "side_throat": (model.side_throat, 101.6),
        "corner_depth": (model.corner_depth, 38.1 + 90.17 / 2.0 - 107.95 / 2.0),
        "side_depth": (model.side_depth, 4.8 + 101.6 / 2.0),
    }
    for name, (actual, expected) in kernel_baseline.items():
        close(f"KERNEL-PIN-{name}", actual, expected, f"kernel-pinned {name} equals catalog @ pinned commit", tol=1e-9)

    # AUTHORITATIVE zero-drift pin: the catalog's runtime-unit f64 values,
    # recomputed here with the catalog's exact executable expressions (same
    # IEEE-754 double ops as the Rust literals), must match the stored bit
    # patterns EXACTLY. The mm feature values are display projections only.
    def f64_bits(value: float) -> str:
        return "0x" + struct.pack(">d", value).hex()

    catalog_runtime = {
        "length_m": 2.54,
        "width_m": 1.27,
        "nose_height_frac": 0.635,
        "cushion_width_m": 0.0508,
        "corner_mouth_m": 0.10795,
        # r4: the kernel adopted the official 4.92 in (CAL-1, PR #601)
        "side_mouth_m": 0.124968,
        "corner_facing_deviation_deg": 7.0,
        "side_facing_deviation_deg": 14.0,
        "corner_jaw_radius_m": 0.02095,
        "side_jaw_radius_m": 0.00795,
        "corner_pocket_radius_m": 0.09017 / 2.0,
        "side_pocket_radius_m": 0.1016 / 2.0,
        "corner_pocket_depth_m": 0.0381 + 0.09017 / 2.0 - 0.10795 / 2.0,
        "side_pocket_depth_m": 0.0048 + 0.1016 / 2.0,
    }
    stored_bits = data["scope"]["kernel_pinning"]["runtime_f64_bits"]
    if set(stored_bits) != set(catalog_runtime):
        add("KERNEL-BITS-COVERAGE", "FAIL", "runtime_f64_bits does not cover exactly the catalog runtime tuple", missing=sorted(set(catalog_runtime) - set(stored_bits)), extra=sorted(set(stored_bits) - set(catalog_runtime)))
    else:
        add("KERNEL-BITS-COVERAGE", "PASS", "runtime_f64_bits covers exactly the catalog runtime tuple")
    for name, value in catalog_runtime.items():
        actual_bits = f64_bits(value)
        if stored_bits.get(name) == actual_bits:
            add(f"KERNEL-BITS-{name}", "PASS", "stored f64 bit pattern equals the catalog expression bit-for-bit")
        else:
            add(f"KERNEL-BITS-{name}", "FAIL", "stored f64 bit pattern diverges from the catalog expression", stored=stored_bits.get(name), computed=actual_bits)
    # display projections must stay within the declared display tolerance of
    # the authoritative runtime values
    display_pairs = {
        "corner_pocket_depth_m": model.corner_depth,
        "side_pocket_depth_m": model.side_depth,
        "corner_mouth_m": model.corner_mouth,
        "side_mouth_m": model.side_mouth,
        "cushion_width_m": model.cushion_w,
        "corner_jaw_radius_m": model.corner_jaw_r,
        "side_jaw_radius_m": model.side_jaw_r,
    }
    for name, display_mm in display_pairs.items():
        close(f"KERNEL-DISPLAY-{name}", display_mm, catalog_runtime[name] * 1000.0, "mm display value projects the runtime f64 within display tolerance", tol=5e-4)
    if model.exact_side_facing is True:
        add("KERNEL-PIN-exact_side_facing", "PASS", "exact_side_facing equals catalog value true")
    else:
        add("KERNEL-PIN-exact_side_facing", "FAIL", "exact_side_facing diverges from catalog value true")
    # datum self-conflict quantification must match the ledger claim
    close("DD1-DELTA-L", 115.0 * 25.4 - model.env_len, 26.0, "inch column length delta", tol=1e-9)
    close("DD1-DELTA-W", 65.0 * 25.4 - model.env_wid, 36.0, "inch column width delta", tol=1e-9)
    close("DD1-DELTA-H", 32.0 * 25.4 - model.env_hgt, 12.8, "inch column height delta", tol=1e-9)
    close("DD1-DELTA-APRON", 8.5 * 25.4 - model.apron_h, 5.9, "apron inch delta", tol=1e-9)
    # the declared drafting settings must match what this generator emits
    drafting = data["drafting"]
    if drafting["sheet"] == "A3_LANDSCAPE" and drafting["projection"] == "FIRST_ANGLE":
        add("DRAFTING-SUPPORTED", "PASS", "declared sheet A3_LANDSCAPE and FIRST_ANGLE projection match the emitted drawing")
    else:
        add("DRAFTING-SUPPORTED", "FAIL", "generator emits 420x297 first-angle sheets only; the declared drafting settings contradict the output", sheet=drafting["sheet"], projection=drafting["projection"])

    # the declared global frame must be orthonormal and right-handed
    gframe = data["frames"]["global"]
    a1, a2, a3 = gframe["axis_1"], gframe["axis_2"], gframe["axis_3"]
    cross3 = (
        a1[1] * a2[2] - a1[2] * a2[1],
        a1[2] * a2[0] - a1[0] * a2[2],
        a1[0] * a2[1] - a1[1] * a2[0],
    )
    handed_err = max(abs(cross3[i] - a3[i]) for i in range(3))
    norm_err = max(abs(math.hypot(*axis) - 1.0) for axis in (a1, a2, a3))
    dot_err = max(
        abs(sum(u * v for u, v in zip(p, q)))
        for p, q in ((a1, a2), (a1, a3), (a2, a3))
    )
    if gframe["handedness"] == "RIGHT_HANDED" and handed_err <= 1e-12 and norm_err <= 1e-12 and dot_err <= 1e-12:
        add("FRAME-RIGHT-HANDED", "PASS", "global frame is orthonormal and right-handed (unit axes, orthogonal, axis_1 x axis_2 = axis_3)")
    else:
        add("FRAME-RIGHT-HANDED", "FAIL", "global frame is not an orthonormal right-handed frame as declared", handed_error=handed_err, norm_error=norm_err, dot_error=dot_err)
    # the renderer consumes exactly the identity canonical basis (plan
    # u = +Y, v = +X, origin at the playfield centre); any other declared
    # basis would silently disagree with the drawn sheets
    if gframe["origin"] == [0.0, 0.0, 0.0] and a1 == [1.0, 0.0, 0.0] and a2 == [0.0, 1.0, 0.0] and a3 == [0.0, 0.0, 1.0]:
        add("FRAME-CANONICAL-BASIS", "PASS", "global frame is the identity canonical basis this generator consumes")
    else:
        add("FRAME-CANONICAL-BASIS", "FAIL", "generator consumes only the identity canonical basis (origin [0,0,0], axes X/Y/Z unit); the declared frame would not be honored by the views", origin=gframe["origin"], axis_1=a1, axis_2=a2, axis_3=a3)

    # the construction-frame records feed the builders; they must agree with
    # the playfield and carry the full mirror-instance sets
    close("FRAME-CP-ORIGIN-X", model.cp_origin[0], model.half_wid, "corner construction origin X = playfield half width", tol=1e-9)
    close("FRAME-CP-ORIGIN-Y", model.cp_origin[1], model.half_len, "corner construction origin Y = playfield half length", tol=1e-9)
    close("FRAME-CP-ORIGIN-Z", model.cp_origin[2], 0.0, "corner construction origin on the bed plane", tol=1e-9)
    close("FRAME-SP-ORIGIN-X", model.sp_origin[0], model.half_wid, "side construction origin X = playfield half width", tol=1e-9)
    close("FRAME-SP-ORIGIN-Y", model.sp_origin[1], 0.0, "side construction origin at mid length", tol=1e-9)
    close("FRAME-SP-ORIGIN-Z", model.sp_origin[2], 0.0, "side construction origin on the bed plane", tol=1e-9)
    cp_expected = {"CP-FOOT-RIGHT": (1, 1), "CP-FOOT-LEFT": (-1, 1), "CP-HEAD-RIGHT": (1, -1), "CP-HEAD-LEFT": (-1, -1)}
    cp_actual = {item["id"]: (item.get("sx"), item.get("sy")) for item in model.cp_instances}
    if cp_actual == cp_expected:
        add("FRAME-CP-INSTANCES", "PASS", "corner instances carry the four width/length mirror sign pairs with matching names")
    else:
        add("FRAME-CP-INSTANCES", "FAIL", "corner instance signs disagree with their names (sx = width RIGHT=+1, sy = length FOOT=+1)", actual=cp_actual)
    sp_expected = {"SP-RIGHT": 1, "SP-LEFT": -1}
    sp_actual = {item["id"]: item.get("sx") for item in model.sp_instances}
    if sp_actual == sp_expected:
        add("FRAME-SP-INSTANCES", "PASS", "side instances carry the width mirror signs with matching names")
    else:
        add("FRAME-SP-INSTANCES", "FAIL", "side instance signs disagree with their names (sx = width RIGHT=+1)", actual=sp_actual)

    # mechanical tangency verification of the drawn kernel jaw construction
    cg = corner_construction(model)
    d_c = point_line_distance(cg["c1"], cg["t1"], (cg["d1"][0] - cg["t1"][0], cg["d1"][1] - cg["t1"][1]))
    close("CONSTRUCT-CORNER-TANGENCY", d_c, model.corner_jaw_r, "corner jaw arc is tangent to the facing line", tol=1e-9)
    close("CONSTRUCT-CORNER-NOSE", math.hypot(cg["n1"][0] - cg["n2"][0], cg["n1"][1] - cg["n2"][1]), model.corner_mouth, "corner nose-to-nose distance equals the true mouth", tol=1e-9)
    sg = side_construction(model)
    d_s = point_line_distance(sg["c_l"], sg["t_l"], (sg["d_l"][0] - sg["t_l"][0], sg["d_l"][1] - sg["t_l"][1]))
    close("CONSTRUCT-SIDE-TANGENCY", d_s, model.side_jaw_r, "side jaw arc is tangent to the facing line (exact_side_facing branch)", tol=1e-9)
    close("CONSTRUCT-SIDE-NOSE", sg["n_r"][0] - sg["n_l"][0], model.side_mouth, "side nose-to-nose distance equals the true mouth", tol=1e-9)
    if abs(model.side_mouth - model.side_mouth_ref) <= 1e-6:
        add("CAL-1-DIRECTION", "PASS", "official side mouth ADOPTED by the kernel (CAL-1 closed, PR #601) — values agree")
    elif model.side_mouth_ref < model.side_mouth:
        add("CAL-1-DIRECTION", "PASS", "official side mouth is tighter than the pinned kernel value (correction direction -2.032)")
    else:
        add("CAL-1-DIRECTION", "FAIL", "conflict ledger direction is wrong")

    # the ledger's own result_mm rows must equal the recomputed values
    expected_ledger = {
        "DRV-1": 0.635 * model.ball_d,
        "DRV-2": model.corner_shelf + model.corner_throat / 2.0 - model.corner_mouth / 2.0,
        "DRV-3": model.side_shelf + model.side_throat / 2.0,
        "DRV-4": (model.env_len - 2.0 * model.half_len) / 2.0,
        "DRV-5": (model.env_wid - 2.0 * model.half_wid) / 2.0,
        "DRV-6": (4.25 - 0.7) * 25.4,
        "DRV-7": model.overhang_short - model.cushion_w,
        "DRV-8": 2.0 * model.half_len / 8.0,
        "DRV-9": 4.92 * 25.4,
        "DRV-11": 8.5 * 25.4 - model.apron_h,
    }
    # DRV-12 is the first row whose target is a RENDER constant rather than a
    # drawn dimension, and the first with a DIMENSIONLESS input. Neither fact
    # earns it an exemption from the recompute law, so both are handled: the
    # ratio is read from FT-RIM-BAND.value_ratio, the aperture radius from the
    # pinned side throat, and the render's bed lip is PARSED OUT OF THE FORMULA
    # STRING that sheet 5 prints. The bed lip is not a canonical feature (this
    # lane has measured no provenance for it, and inventing a tier for it would
    # be worse than quoting it), so parsing is what keeps the arithmetic here
    # and the arithmetic a reader sees on the sheet the same arithmetic: a bed
    # lip that moves in one place and not the other cannot survive this check.
    rim_row = next((item for item in data["derivations"] if item["id"] == "DRV-12"), None)
    rim_feat = next((item for item in data["features"] if item["id"] == "FT-RIM-BAND"), None)
    bed_lip_match = re.search(r"bed lip\s+([0-9]+(?:\.[0-9]+)?)", (rim_row or {}).get("formula", ""))
    if rim_row is not None:
        if rim_feat is None or bed_lip_match is None or "value_ratio" not in (rim_feat or {}):
            add("LEDGER-DRV-12-INPUTS", "FAIL", "DRV-12 cannot be recomputed: FT-RIM-BAND.value_ratio or the bed-lip literal in its formula is missing")
        else:
            expected_ledger["DRV-12"] = float(rim_feat["value_ratio"]["band_over_aperture_radius"]) * (
                model.side_throat / 2.0 + float(bed_lip_match.group(1)))
    # DRV-13..16 are the plug group, and they CHAIN: the vent, the relief line
    # and the thickness ceiling are all fractions of the plug radius, which is
    # itself a fraction of the aperture. Each rule below therefore recomputes
    # from the RATIOS all the way down rather than reading the row above it out
    # of the ledger, because a ledger row that recomputes from another ledger
    # row can only ever prove the two are consistent with each other - it cannot
    # notice that both drifted off the features they claim to project. The two
    # render literals these formulas need (the bed lip again, and the well depth
    # that turns the relief line into a thickness ceiling) are parsed out of the
    # printed formula strings for the reason DRV-12 gives above.
    def ratio_of(feature_id: str, key: str) -> float | None:
        item = next((f for f in data["features"] if f["id"] == feature_id), None)
        if item is None or key not in item.get("value_ratio", {}):
            return None
        return float(item["value_ratio"][key])

    def literal_in(row_id: str, label: str) -> float | None:
        row = next((d for d in data["derivations"] if d["id"] == row_id), None)
        if row is None:
            return None
        hit = re.search(rf"{label}\s+([0-9]+(?:\.[0-9]+)?)", row.get("formula", ""))
        return float(hit.group(1)) if hit else None

    plug_frac = ratio_of("FT-PLUG-FRACTION", "plug_radius_over_aperture_radius")
    vent_frac = ratio_of("FT-PLUG-VENT", "vent_radius_over_plug_radius")
    relief_frac = ratio_of("FT-PLUG-RELIEF", "plan_gap_over_plug_radius")
    plug_lip = literal_in("DRV-13", "bed lip")
    well_depth = literal_in("DRV-16", "well depth")
    plug_rows = {"DRV-13", "DRV-14", "DRV-15", "DRV-16"}
    if any(item["id"] in plug_rows for item in data["derivations"]):
        if plug_frac is None or plug_lip is None:
            add("LEDGER-DRV-13-INPUTS", "FAIL", "the plug group cannot be recomputed: FT-PLUG-FRACTION.value_ratio or the bed-lip literal in DRV-13's formula is missing")
        else:
            aperture_r = model.side_throat / 2.0 + plug_lip
            plug_r = plug_frac * aperture_r
            expected_ledger["DRV-13"] = plug_r
            if vent_frac is not None:
                expected_ledger["DRV-14"] = vent_frac * plug_r
            if relief_frac is not None:
                relief = relief_frac * plug_r
                expected_ledger["DRV-15"] = relief
                if well_depth is not None and aperture_r > plug_r:
                    expected_ledger["DRV-16"] = relief * well_depth / (aperture_r - plug_r)
    ledger_ids = {item["id"] for item in data["derivations"]}
    # Review landing review (P2): DRV-13..16 must be required UNCONDITIONALLY,
    # not only once their inputs already produced expected_ledger entries —
    # otherwise removing the four plug features together still reports
    # "DRV-1..16 present". The recompute above stays input-gated; presence
    # does not.
    required_ledger = (set(expected_ledger)
                       | {"DRV-10", "DRV-12", "DRV-13", "DRV-14", "DRV-15", "DRV-16"})
    missing_rows = sorted(required_ledger - ledger_ids)
    if missing_rows:
        add("LEDGER-COMPLETE", "FAIL", "required derivation rows are missing from the ledger", missing=missing_rows)
    else:
        add("LEDGER-COMPLETE", "PASS", "every required derivation row (DRV-1..16) is present")
    known_features = {item["id"] for item in data["features"]}
    known_conflict_ids = {item["id"] for item in data["conflicts"]}
    for item in data["derivations"]:
        tokens = re.findall(r"\bFT-[A-Z0-9-]+\b|\bCFL-\d+\b", item["target"])
        if not tokens or not all(token in known_features | known_conflict_ids for token in tokens):
            add(f"LEDGER-TARGET-{item['id']}", "FAIL", "derivation target does not resolve to a known feature/conflict id", target=item["target"])
        if item["result_mm"] is None:
            continue
        expected = expected_ledger.get(item["id"])
        if expected is None:
            add(f"LEDGER-{item['id']}", "FAIL", "derivation row has a result but no recomputation rule")
        else:
            close(f"LEDGER-{item['id']}", float(item["result_mm"]), round(expected, 6), "ledger result_mm equals the recomputed value", tol=5e-4)
    for item in data["features"]:
        ref = item.get("derivation")
        if ref is not None and ref not in ledger_ids:
            add(f"LEDGER-REF-{item['id']}", "FAIL", "feature cites a derivation id that does not exist", derivation=ref)

    kernel_scoped = [item for item in data["features"] if item["scope"] == "kernel_collision"]
    known_sources = {item["id"] for item in data["sources"]}
    known_conflicts = {item["id"] for item in data["conflicts"]}
    dangling: list[str] = []
    for item in data["features"]:
        if not item.get("sources"):
            dangling.append(f"{item['id']}: no sources")
            continue
        for ref in item["sources"]:
            if ref not in known_sources:
                dangling.append(f"{item['id']}: unknown source {ref}")
        for ref in item.get("conflicts", []):
            if ref not in known_conflicts:
                dangling.append(f"{item['id']}: unknown conflict {ref}")
    if dangling:
        add("SOURCED", "FAIL", "feature provenance references do not resolve", dangling=dangling)
    else:
        add("SOURCED", "PASS", "every feature names at least one source and all source/conflict references resolve")
    if any(item["id"] == "FT-SIDE-MOUTH" and "CFL-2" in item.get("conflicts", []) for item in kernel_scoped):
        add("CFL-2-FLAGGED", "PASS", "side-mouth conflict is flagged on the kernel feature")
    else:
        add("CFL-2-FLAGGED", "FAIL", "side-mouth conflict flag missing")

    blockers: list[str] = []
    status = data["document"]["status"]
    if data["tolerances"]["manufacturing_profile"] is None:
        blockers.append("Manufacturing profile tolerance is TBD (authoring wave).")
    for role in ("drawn_by", "checked_by", "approved_by"):
        approval = data["approvals"][role]
        if not approval["name"] or not approval["date"]:
            blockers.append(f"{role.replace('_', ' ').title()} is incomplete.")
    # conflict-ledger linkage: every CAL-*/RU-* id a conflict resolution cites
    # must exist, and value-level conflicts must still be ledgered while the
    # divergent values persist
    item_ids = {item["id"] for item in data["calibration_items"]} | {item["id"] for item in data["uplift_items"]}
    broken_links: list[str] = []
    for conflict in data["conflicts"]:
        for ref in re.findall(r"\b(?:CAL|RU)-\d+\b", conflict["resolution"]):
            if ref not in item_ids:
                broken_links.append(f"{conflict['id']} cites missing item {ref}")
    if broken_links:
        add("CONFLICT-LINKAGE", "FAIL", "conflict resolutions cite calibration/uplift items that do not exist", broken=broken_links)
    else:
        add("CONFLICT-LINKAGE", "PASS", "every conflict-cited calibration/uplift item exists")
    if abs(model.side_mouth - model.side_mouth_ref) > 1e-6:
        has_cfl2 = any(item["id"] == "CFL-2" for item in data["conflicts"])
        has_cal = any("4.92" in item["title"] for item in data["calibration_items"])
        if has_cfl2 and has_cal:
            add("SIDE-MOUTH-CONFLICT-STRUCTURAL", "PASS", "the live side-mouth divergence stays ledgered (CFL-2) with an open calibration item")
        else:
            add("SIDE-MOUTH-CONFLICT-STRUCTURAL", "FAIL", "side mouth still diverges from the official value but the ledger/calibration entry is gone")

    open_cal = [item["id"] for item in data["calibration_items"]]
    if open_cal:
        blockers.append(f"Open calibration items: {', '.join(open_cal)} (owner-gated; kernel divergences recorded, not fixed).")
    open_uplift = [item["id"] for item in data["uplift_items"]]
    if open_uplift:
        blockers.append(f"Open render uplift items: {', '.join(open_uplift)} - the runtime model has not adopted this definition yet, so source/drawing/model agreement (ADR-0015) is pending model conformance.")
    blocking_conflicts = [item["id"] for item in data["conflicts"] if item["severity"] in ("KERNEL", "RENDER", "RENDER_LABEL")]
    if blocking_conflicts:
        blockers.append(f"Unresolved geometry-affecting conflicts: {', '.join(blocking_conflicts)} - a KERNEL/RENDER conflict blocks release until its ceremony closes it (ADR-0015 agreement clause).")

    failures = [check for check in checks if check["status"] == "FAIL"]
    release_ready = not blockers and not failures
    if release_ready:
        checks.append({"id": "RELEASE-GATE", "status": "PASS", "message": "No unresolved release blocker remains."})
    elif status == "RELEASED":
        checks.append({"id": "RELEASE-GATE", "status": "FAIL", "message": "A RELEASED source contains unresolved definition data.", "blockers": blockers})
    else:
        checks.append({"id": "RELEASE-GATE", "status": "WARN", "message": f"{status} is correctly blocked from release while definition data remains unresolved.", "blockers": blockers})

    failures = [check for check in checks if check["status"] == "FAIL"]
    warnings = [check for check in checks if check["status"] == "WARN"]
    return {
        "source_sha256": source_hash,
        "generator": GENERATOR_ID,
        "document_status": status,
        "overall": "FAIL" if failures else ("PASS_WITH_WARNINGS" if warnings else "PASS"),
        "release_ready": release_ready,
        "release_blockers": blockers,
        "checks": checks,
    }


# ---------------------------------------------------------------------------
# svg output
# ---------------------------------------------------------------------------


def render_svg(page: DrawingPage, data: dict[str, Any], source_hash: str) -> bytes:
    output: list[str] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{PAGE_W_MM}mm" height="{PAGE_H_MM}mm" viewBox="0 0 {PAGE_W_MM} {PAGE_H_MM}">',
        f'<title>{html.escape(data["document"]["number"] + " - " + page.sheet_title)}</title>',
        f'<desc>Generated by {GENERATOR_ID}; source SHA-256 {source_hash}; dimensions in millimetres; first-angle projection; do not scale.</desc>',
        "<metadata>",
        html.escape(canonical_json({"source_sha256": source_hash, "generator": GENERATOR_ID, "sheet": page.sheet_number})),
        "</metadata>",
        '<rect x="0" y="0" width="420" height="297" fill="#ffffff"/>',
        '<g fill="none" stroke-linejoin="round" stroke-linecap="round">',
    ]
    for command in page.commands:
        kind = command["kind"]
        dash = ""
        if command.get("dash"):
            dash = f' stroke-dasharray="{" ".join(svg_number(value) for value in command["dash"])}"'
        if kind == "line":
            output.append(
                f'<line x1="{svg_number(command["x1"])}" y1="{svg_number(command["y1"])}" '
                f'x2="{svg_number(command["x2"])}" y2="{svg_number(command["y2"])}" '
                f'stroke="{command["color"]}" stroke-width="{svg_number(command["width"])}"{dash}/>'
            )
        elif kind == "polyline":
            tag = "polygon" if command["closed"] else "polyline"
            points = " ".join(f"{svg_number(x)},{svg_number(y)}" for x, y in command["points"])
            output.append(
                f'<{tag} points="{points}" stroke="{command["color"]}" stroke-width="{svg_number(command["width"])}" '
                f'fill="{svg_color(command["fill"])}"{dash}/>'
            )
        elif kind == "rect":
            output.append(
                f'<rect x="{svg_number(command["x"])}" y="{svg_number(command["y"])}" width="{svg_number(command["w"])}" '
                f'height="{svg_number(command["h"])}" stroke="{command["color"]}" stroke-width="{svg_number(command["width"])}" '
                f'fill="{svg_color(command["fill"])}"{dash}/>'
            )
        elif kind == "circle":
            output.append(
                f'<circle cx="{svg_number(command["x"])}" cy="{svg_number(command["y"])}" r="{svg_number(command["r"])}" '
                f'stroke="{command["color"]}" stroke-width="{svg_number(command["width"])}" fill="{svg_color(command["fill"])}"{dash}/>'
            )
        elif kind == "arc":
            a0 = math.radians(command["a0"])
            a1 = math.radians(command["a1"])
            x0 = command["cx"] + command["r"] * math.cos(a0)
            y0 = command["cy"] + command["r"] * math.sin(a0)
            x1 = command["cx"] + command["r"] * math.cos(a1)
            y1 = command["cy"] + command["r"] * math.sin(a1)
            large = 1 if abs(command["a1"] - command["a0"]) > 180.0 else 0
            sweep = 1 if command["a1"] > command["a0"] else 0
            output.append(
                f'<path d="M {svg_number(x0)} {svg_number(y0)} A {svg_number(command["r"])} {svg_number(command["r"])} 0 {large} {sweep} '
                f'{svg_number(x1)} {svg_number(y1)}" stroke="{command["color"]}" stroke-width="{svg_number(command["width"])}"{dash}/>'
            )
        elif kind == "text":
            anchor = {"start": "start", "middle": "middle", "end": "end"}[command["anchor"]]
            family = "ui-monospace, SFMono-Regular, Menlo, monospace" if command["mono"] else "Arial, Helvetica, sans-serif"
            weight = "700" if command["bold"] else "400"
            transform = ""
            if command["rotate"]:
                transform = f' transform="rotate({svg_number(command["rotate"])} {svg_number(command["x"])} {svg_number(command["y"])})"'
            output.append(
                f'<text x="{svg_number(command["x"])}" y="{svg_number(command["y"])}" font-family="{family}" '
                f'font-size="{svg_number(command["size"])}" font-weight="{weight}" text-anchor="{anchor}" '
                f'dominant-baseline="middle" fill="{command["color"]}" stroke="none"{transform}>'
                f'{html.escape(command["text"])}</text>'
            )
    output.extend(["</g>", "</svg>", ""])
    return "\n".join(output).encode("utf-8")


def build_artifacts(data: dict[str, Any], source_hash: str) -> dict[str, bytes]:
    model = build_model(data)
    report = validate(data, model, source_hash)
    total = 6
    pages = [
        build_corner_sheet(data, model, source_hash, total),
        build_side_sheet(data, model, source_hash, total),
        build_cushion_sheet(data, model, source_hash, total),
        build_envelope_sheet(data, model, source_hash, total),
        build_tables_sheet(data, model, source_hash, total),
        build_features_sheet(data, model, source_hash, total),
    ]
    artifacts: dict[str, bytes] = {}
    slug = ["corner-pocket", "side-pocket", "cushion-section", "envelope-elevation", "ledger-tables", "feature-table"]
    for index, sheet in enumerate(pages):
        artifacts[f"gh488p-apex-sheet{index + 1}-{slug[index]}.svg"] = render_svg(sheet, data, source_hash)
    artifacts["gh488p-validation-report.json"] = (json.dumps(report, indent=2, sort_keys=True) + "\n").encode("utf-8")
    lines = [f"GH-488P validation report - {report['overall']} (release_ready={report['release_ready']})", f"source sha256 {source_hash}", ""]
    for check in report["checks"]:
        lines.append(f"[{check['status']:>4}] {check['id']}: {check['message']}")
    for blocker in report["release_blockers"]:
        lines.append(f"BLOCKER: {blocker}")
    artifacts["gh488p-validation-report.txt"] = ("\n".join(lines) + "\n").encode("utf-8")
    return artifacts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--check", action="store_true", help="verify existing outputs are byte-identical (deterministic)")
    # FIX2 (review round 2 on #731): option presence is not option value — a blank or trailing path flag and a missing input path exit 2 by name
    import os as _os, sys as _sys; _sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "lib")); from argpaths import guard_paths as _guard_paths
    parser.allow_abbrev = False  # FIX2: no prefix matching — `--ou=` must not reach argparse as --out=''
    args = parser.parse_args(argv)
    _guard_paths({'--input': 'file', '--output-dir': 'out'}, tag='generate.py', argv=argv)  # FIX10 (Fable pass 2): after the parse — help exits 0 first; the guard is a post-parse value + existence check

    raw = args.input.read_bytes()
    source_hash = sha256_bytes(raw)
    data = json.loads(raw)
    artifacts = build_artifacts(data, source_hash)

    if args.check:
        stale: list[str] = []
        for name, blob in artifacts.items():
            path = args.output_dir / name
            if not path.exists() or path.read_bytes() != blob:
                stale.append(name)
        if stale:
            print(f"STALE: {', '.join(stale)}", file=sys.stderr)
            return 1
        report = json.loads(artifacts["gh488p-validation-report.json"])
        if report["overall"] == "FAIL":
            print(f"FAIL: artifacts are deterministic but validation reports {report['overall']}", file=sys.stderr)
            return 1
        print(f"OK: {len(artifacts)} artifacts deterministic against {args.input.name} @ {source_hash[:12]} (validation {report['overall']})")
        return 0

    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, blob in artifacts.items():
        (args.output_dir / name).write_bytes(blob)
    report = json.loads(artifacts["gh488p-validation-report.json"])
    print(f"{report['overall']}: wrote {len(artifacts)} artifacts to {args.output_dir} (source {source_hash[:12]})")
    if report["overall"] == "FAIL":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
