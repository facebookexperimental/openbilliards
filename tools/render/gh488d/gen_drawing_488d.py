#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""GH-488d — Diamond Pro-Am 9 ft GB/T-style drawing set generator.

Single-source pipeline per ADR-0015: the ONLY input is the canonical geometry
definition `docs/geometry/diamond-proam-9ft-table-definition.json`; this
script re-derives every drawn curve and dimension from that JSON, asserts the
declared arithmetic identities before any sheet is emitted, and writes:

  - sheet S1: corner-pocket assembly, plan (PCF-CP-NLS frame)
  - sheet S2: side-pocket assembly, plan
  - sheet S3: cushion profile section (Artemis No. 66 rubber, K55 profile)
  - sheet S4: rail / apron / envelope elevation (transverse half-section)
  - a solved JSON twin (constructed points, check results, source SHA-256)

Drawings are Drive artifacts (published to openbilliards/pocket-drawing-488d/);
this generator and its source JSON are the repo-side artifacts. Pattern forked
from the GH-489/490 Drive generators (gen_drawing_489_ext / gen_drawing_rev8
family); the S1-S4-style stroke-suite conformance hook is a declared STUB
until the wave D-A3 instrument forks land (see --stroke-suite).

Run:
  python3 tools/render/gh488d/gen_drawing_488d.py --output-dir output/gh488d
  python3 tools/render/gh488d/gen_drawing_488d.py --output-dir output/gh488d --check

Size variants (GH-621): the SAME generator, parameterised by its input — the
8 ft / 7 ft definitions are derived from the 9 ft one by
tools/render/gh488d/derive_size_variant_621.py and carry their own doc block
(`doc.drawing_slug` names the output files, `doc.generator_banner` the
title-block chain line). Nothing here is size-specific: every drawn number
comes from the input JSON, and the inch labels on S4 are computed from the
values (the 9 ft output is byte-identical to the pre-GH-621 generator —
proven by --check against the committed r2 sheets):
  python3 tools/render/gh488d/gen_drawing_488d.py \
      --input docs/geometry/diamond-proam-8ft-table-definition.json \
      --output-dir output/d621/drawings/8ft

Deterministic: byte-identical output for identical input JSON (no clocks,
no environment reads; --check regenerates in memory and byte-compares). The pocket and cushion construction mirrors the kernel's table layout (crates/pool-core/src/table.rs, web/scene/table.js), so it is derived from pooltool (Apache-2.0) and modified by the OpenBilliards authors.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

GENERATOR_ID = "gh488d-drawing/1.0.0"

# ---------------------------------------------------------------- input


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def load_source(path: Path) -> tuple[dict, str, bytes]:
    raw = path.read_bytes()
    doc = json.loads(raw.decode("utf-8"))
    return doc, hashlib.sha256(raw).hexdigest(), raw


def feature_map(doc: dict) -> dict[str, dict]:
    out = {}
    for feat in doc["features"]:
        out[feat["id"]] = feat
    return out


def val(features: dict[str, dict], fid: str):
    feat = features[fid]
    for key in ("value_mm", "value_deg", "value"):
        if key in feat:
            return feat[key]
    raise KeyError(f"feature {fid} carries no value")


# ---------------------------------------------------------------- checks


def make_checker(checks: list[tuple[str, bool, str]]):
    def check(name: str, cond: bool, detail: str) -> None:
        checks.append((name, bool(cond), detail))
        if not cond:
            raise AssertionError(f"identity check FAILED: {name} — {detail}")
    return check


def run_checks(f: dict[str, dict], checks: list[tuple[str, bool, str]]) -> dict:
    check = make_checker(checks)
    ball = val(f, "PF-04")
    length, width = val(f, "PF-01")
    m_c, m_s = val(f, "CP-01"), val(f, "SP-01")
    dev_c = f["CP-02"]["kernel_deviation_deg"]
    dev_s = f["SP-02"]["kernel_deviation_deg"]
    check("CP-02 miter", abs(135.0 + dev_c - val(f, "CP-02")) < 1e-9,
          f"135 + {dev_c} = {val(f, 'CP-02')}")
    check("SP-02 miter", abs(90.0 + dev_s - val(f, "SP-02")) < 1e-9,
          f"90 + {dev_s} = {val(f, 'SP-02')}")
    check("CU-03 nose fraction", abs(val(f, "CU-03") / ball - 0.638889) < 1e-6,
          f"{val(f, 'CU-03')} / {ball} = kernel noseHeightFrac 0.638889")
    depth_c = val(f, "CP-04") + val(f, "CP-07") - m_c / 2.0
    check("CP-08 corner depth", abs(depth_c - val(f, "CP-08")) < 1e-9,
          f"shelf + r − mouth/2 = {depth_c}")
    depth_s = val(f, "SP-04") + val(f, "SP-07")
    check("SP-08 side depth", abs(depth_s - val(f, "SP-08")) < 1e-9,
          f"shelf + r = {depth_s}")
    mt = m_c - val(f, "CP-05")
    check("CP-05 mouth−throat", abs(mt - 17.78) < 1e-9 and 15.875 <= mt <= 19.05,
          f"mouth − throat = {mt} (BU TDF band 5/8–3/4 in)")
    band = val(f, "RB-01")
    env_l, env_w = val(f, "EN-01")
    check("EN-01 envelope L", abs(length + 2 * band - env_l) < 1e-9,
          f"{length} + 2×{band} = {env_l}")
    check("EN-01 envelope W", abs(width + 2 * band - env_w) < 1e-9,
          f"{width} + 2×{band} = {env_w}")
    stack = val(f, "EN-02") - val(f, "EN-03")
    check("EN-04 rail stack", abs(stack - val(f, "EN-04")) < 1e-9,
          f"{val(f, 'EN-02')} − {val(f, 'EN-03')} = {stack}")
    # GH-488D wave A2.5 (A11): the upper bound is NON-STRICT — RB-02 and
    # EN-04 name the same plane. r6 (D621-ALIGN): both are the purchased
    # model's cap plateau, 44.68 above the bed; the cushion top CU-09 sits
    # 0.23 below it (identity 12). The lower bound stays strict.
    check("C4 plane order", val(f, "CU-09") < val(f, "RB-02") <= val(f, "EN-04"),
          "rubber plane < rail top <= stack extreme")
    # The machine half of identity 12 (checks.identities). The plane-order
    # check above only bounds RB-02; these two assert the arithmetic the
    # sheet's prose makes. r6: the r2 "6.35 = 0.250 in finished cap" is
    # RETIRED with the 2 in route — the model's cap plateau stands 0.23 above
    # its own cushion top (RB-02 44.68 − CU-09 44.45), and that is what the
    # cushion-section sheet now labels.
    check("RB-02 = EN-04 one plane",
          abs(val(f, "RB-02") - val(f, "EN-04")) < 1e-9,
          f"render twin {val(f, 'RB-02')} = envelope anchor {val(f, 'EN-04')}")
    cap = val(f, "RB-02") - val(f, "CU-09")
    check("RB-02 cap plateau over the cushion top (r6)", abs(cap - 0.23) < 1e-9,
          f"{val(f, 'RB-02')} − {val(f, 'CU-09')} = {cap} (identity 12, r6; the r2 6.35 cap is RETIRED)")
    check("RB-04 sight spacing", abs(length / 8.0 - val(f, "RB-04")) < 1e-9,
          f"{length}/8 = {val(f, 'RB-04')}")
    a = m_c / math.sqrt(2.0)
    chord = math.hypot(a, a)
    check("CP-01 mouth chord", abs(chord - m_c) < 1e-9,
          f"|P_L − P_S| for nose offsets a = m/√2 = {a}")
    near = -(val(f, "SP-08") - val(f, "SP-07"))
    check("SP-04 shelf edge", abs(near + val(f, "SP-04")) < 1e-9,
          f"disc near edge at y = {near} = −shelf")
    # kernel jaw construction (from_pocket_spec): mouth points are the
    # rail↔jaw-arc tangencies; pwc/sw recover the mouths exactly.
    corner = corner_jaw_construction(f)
    check("CP-06 jaw tangency", abs(dist(corner["F"], corner["J"]) - val(f, "CP-06")) < 1e-9
          and abs(dist(corner["P"], corner["J"]) - val(f, "CP-06")) < 1e-9,
          "corner jaw arc tangent to nose at P and to the facing at F (|PJ| = |FJ| = rc)")
    side = side_jaw_construction(f)
    check("SP-06 jaw tangency", abs(dist(side["F"], side["J"]) - val(f, "SP-06")) < 1e-9
          and abs(dist(side["P"], side["J"]) - val(f, "SP-06")) < 1e-9,
          "side jaw arc tangent to nose at P and to the facing at F (|PJ| = |FJ| = rs)")
    for name, kjc in (("CP-06", corner), ("SP-06", side)):
        jx, jy = kjc["J"]
        fx, fy = kjc["F"]
        ex, ey = kjc["E"]
        dot = (fx - jx) * (ex - fx) + (fy - jy) * (ey - fy)
        check(f"{name} facing orthogonality", abs(dot) < 1e-9,
              f"radius J→F ⊥ facing F→E (dot = {dot:.3e}) — true tangency, not just |FJ| = r")
    return {
        "a_corner_nose_offset": a,
        "depth_corner": depth_c,
        "depth_side": depth_s,
    }


# ---------------------------------------------------------------- geometry


def dist(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def corner_jaw_construction(f: dict[str, dict]) -> dict:
    """Kernel corner jaw (table.rs from_pocket_spec, segments "1"/"1t") in the
    long-rail local frame: nose line y=0 toward +x, pocket toward −x/−y.

    P = rail↔jaw-arc tangency (the TRUE mouth point), J = jaw-arc centre,
    F = jaw-arc↔facing tangency, E = facing end at featherstrip depth.
    """
    m, cw = val(f, "CP-01"), val(f, "CU-04")
    rc = val(f, "CP-06")
    ca = math.radians(45.0 + f["CP-02"]["kernel_deviation_deg"])
    dc = rc / math.tan((math.pi / 2.0 + ca) / 2.0)
    pwc = m / math.sqrt(2.0) - dc
    return {
        "P": (pwc + dc, 0.0),
        "J": (pwc + dc, -rc),
        "F": (pwc - dc * math.sin(ca), -dc * math.cos(ca)),
        "E": (pwc - cw * math.tan(ca), -cw),
        "dc": dc, "pwc": pwc, "ca_deg": math.degrees(ca),
    }


def side_jaw_construction(f: dict[str, dict]) -> dict:
    """Kernel side jaw (segments "4"/"4t", exact_side_facing branch) in the
    side-pocket local frame: nose line y=0, mouth centred on x=0, pocket −y.
    Right-hand mouth instance; the left is the x-mirror.
    """
    m, cw = val(f, "SP-01"), val(f, "CU-04")
    rs = val(f, "SP-06")
    sa = math.radians(f["SP-02"]["kernel_deviation_deg"])
    ds = rs / math.tan((math.pi / 2.0 + sa) / 2.0)
    sjb = cw * math.tan(sa)  # exact_side_facing = true on diamond_proam_9ft
    # kernel frame → local frame: local_x = l/2 − kernel_y, local_y = kernel_x
    # (mouth point y_m = (l−sw)/2 − ds = l/2 − m/2 recovers P = (m/2, 0)).
    return {
        "P": (m / 2.0, 0.0),
        "J": (m / 2.0, -rs),
        "F": (m / 2.0 - ds * (1.0 + math.sin(sa)), -ds * math.cos(sa)),
        "E": (m / 2.0 - ds - sjb, -cw),
        "ds": ds, "sjb": sjb, "sa_deg": math.degrees(sa),
    }


def arc_path(sh: "Sheet", P, c: tuple[float, float], r: float,
             ang0: float, ang1: float, stroke: str, w: float,
             dash: str | None = None, n: int = 32) -> None:
    """Sampled circular arc in the local mm frame (unambiguous vs SVG flags)."""
    pts = []
    for i in range(n + 1):
        ang = ang0 + (ang1 - ang0) * i / n
        pts.append(P(c[0] + r * math.cos(ang), c[1] + r * math.sin(ang)))
    d = "M " + " L ".join(f"{Sheet.c(x)} {Sheet.c(y)}" for x, y in pts)
    sh.path(d, stroke, w, dash=dash)


def boot_u_form(c: tuple[float, float], axis: float, r_lip: float, r_land: float,
                leg_run: float, leg_tip: str, fid: str,
                leg_labels: tuple[str, str]) -> dict:
    """Boot U-form plan (r4+: `leg_run_mm` / `leg_tip` on CP-11 / SP-10).

    The boot is a SEMICIRCULAR arch on the outboard half — axis − π/2 … axis + π/2
    about the capture centre c, between the lip radius R_lip = rw − lip_overhang
    and the outer landing radius R_land = rw + outer_landing — whose two edges
    continue from the tangent points T = c + R·perp (perp = unit vector at
    axis ∓ π/2) as STRAIGHT legs parallel to the into-table direction
    d_in = −(cos axis, sin axis) for `leg_run`, then the tip cut per `leg_tip`:
      flat                — both edges end at u = leg_run; the cut is ⊥ the axis
      mitre-rail-parallel — the outer edge ends at u = leg_run, the inner at
                            u = leg_run − (R_land − R_lip); the cut therefore
                            runs along perp + d_in, i.e. at 45° to the axis =
                            parallel to the adjacent rail nose line (corner)
    Every point is in the calling sheet's local mm frame. legs[0] is the
    axis − π/2 leg, legs[1] the axis + π/2 leg (labelled by the caller).
    """
    width = r_land - r_lip
    if leg_tip == "flat":
        inner_run = leg_run
    elif leg_tip == "mitre-rail-parallel":
        if not leg_run > width:
            raise AssertionError(
                f"{fid} leg_run_mm {leg_run} must exceed R_land − R_lip = {width:.2f} "
                f"(lip_overhang + outer_landing) for the mitre-rail-parallel tip to be "
                f"well-formed — the inner leg edge would have zero or negative run")
        inner_run = leg_run - width
    else:
        raise ValueError(f"{fid} leg_tip {leg_tip!r} is not one of 'flat' / 'mitre-rail-parallel'")
    if not leg_run > 0.0:
        raise AssertionError(f"{fid} leg_run_mm {leg_run} must be positive")
    d_in = (-math.cos(axis), -math.sin(axis))
    legs = []
    for sgn, label in ((-1.0, leg_labels[0]), (1.0, leg_labels[1])):
        perp = (math.cos(axis + sgn * math.pi / 2.0), math.sin(axis + sgn * math.pi / 2.0))
        edges = {}
        for name, rr, run in (("inner_edge", r_lip, inner_run), ("outer_edge", r_land, leg_run)):
            t = (c[0] + rr * perp[0], c[1] + rr * perp[1])
            tip = (t[0] + run * d_in[0], t[1] + run * d_in[1])
            edges[name] = {"radius": rr, "run_mm": run, "tangent": list(t), "tip": list(tip)}
        legs.append({
            "label": label,
            "perp_deg": math.degrees(axis + sgn * math.pi / 2.0),
            **edges,
            "tip_cut": [edges["inner_edge"]["tip"], edges["outer_edge"]["tip"]],
        })
    return {
        "axis_deg": math.degrees(axis),
        "into_table_dir": list(d_in),
        "r_lip": r_lip, "r_land": r_land, "band_mm": width,
        "leg_run_mm": leg_run, "inner_run_mm": inner_run, "leg_tip": leg_tip,
        "legs": legs,
    }


def draw_boot_u(sh: "Sheet", P, c: tuple[float, float], axis: float, u: dict,
                stroke: str = "#8a5a1a", w: float = 1.0, dash: str = "3 3") -> None:
    """The U outline: two half-arcs (lip / landing), four leg edges, two tip cuts."""
    for rr in (u["r_lip"], u["r_land"]):
        arc_path(sh, P, c, rr, axis - math.pi / 2.0, axis + math.pi / 2.0, stroke, w, dash=dash)
    for leg in u["legs"]:
        for edge in ("inner_edge", "outer_edge"):
            sh.line(*P(*leg[edge]["tangent"]), *P(*leg[edge]["tip"]), stroke, w, dash=dash)
        sh.line(*P(*leg["tip_cut"][0]), *P(*leg["tip_cut"][1]), stroke, w, dash=dash)


# ---------------------------------------------------------------- svg helpers


class Sheet:
    """One GB/T-styled SVG sheet with a shared title block."""

    W = 1680
    H = 1180

    def __init__(self, sheet_no: str, title: str, doc: dict, sha: str, scale_note: str,
                 source_label: str = "docs/geometry/diamond-proam-9ft-table-definition.json"):
        self.source_label = source_label
        self.buf: list[str] = []
        self.doc = doc
        self.sheet_no = sheet_no
        self.title = title
        self.sha = sha
        self.scale_note = scale_note
        d = doc["doc"]
        self.buf.append(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.W} {self.H}" '
            f'font-family="Helvetica, Arial, sans-serif">')
        self.rect(0, 0, self.W, self.H, fill="#f7f4ec", stroke="none")
        self.rect(18, 18, self.W - 36, self.H - 36, fill="#fffdf8", stroke="#222", sw=1.6)
        self.text(34, 46, f"{d['number']} · {sheet_no} — {title}", 19, weight="700")
        self.text(34, 68,
                  f"table {d['table_id']} · rev {d['revision']} · {d['status']} · {d['date']} · "
                  f"source sha256 {sha[:16]}…", 11, fill="#555")

    # -- primitives ---------------------------------------------------------
    @staticmethod
    def c(v: float) -> str:
        """SVG coordinate formatter (compact; NOT for displayed dimensions)."""
        s = f"{v:.2f}"
        return s.rstrip("0").rstrip(".") if "." in s else s

    @staticmethod
    def f(v: float) -> str:
        """Displayed dimension value — exactly the declared 2 decimals."""
        return f"{v:.2f}"

    def raw(self, s: str) -> None:
        self.buf.append(s)

    def line(self, x1, y1, x2, y2, stroke="#111", w=1.1, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.buf.append(f'<line x1="{self.c(x1)}" y1="{self.c(y1)}" x2="{self.c(x2)}" '
                        f'y2="{self.c(y2)}" stroke="{stroke}" stroke-width="{w}"{d}/>')

    def path(self, d, stroke="#111", w=1.1, fill="none", dash=None):
        dd = f' stroke-dasharray="{dash}"' if dash else ""
        self.buf.append(f'<path d="{d}" stroke="{stroke}" stroke-width="{w}" fill="{fill}"{dd}/>')

    def circle(self, cx, cy, r, stroke="#111", w=1.1, fill="none", dash=None):
        dd = f' stroke-dasharray="{dash}"' if dash else ""
        self.buf.append(f'<circle cx="{self.c(cx)}" cy="{self.c(cy)}" r="{self.c(r)}" '
                        f'stroke="{stroke}" stroke-width="{w}" fill="{fill}"{dd}/>')

    def rect(self, x, y, w, h, fill="none", stroke="#333", sw=1.0):
        self.buf.append(f'<rect x="{self.c(x)}" y="{self.c(y)}" width="{self.c(w)}" '
                        f'height="{self.c(h)}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

    def text(self, x, y, s, size=11.0, fill="#111", anchor="start", weight=None, rot=None):
        wa = f' font-weight="{weight}"' if weight else ""
        ra = f' transform="rotate({rot} {self.c(x)} {self.c(y)})"' if rot is not None else ""
        s = str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        self.buf.append(f'<text x="{self.c(x)}" y="{self.c(y)}" font-size="{size}" '
                        f'fill="{fill}" text-anchor="{anchor}"{wa}{ra}>{s}</text>')

    def dim(self, x1, y1, x2, y2, label, off=0.0, size=9.5, fill="#333"):
        """Linear dimension with end ticks; label at the midpoint."""
        nx, ny = y2 - y1, x1 - x2
        norm = math.hypot(nx, ny) or 1.0
        nx, ny = nx / norm, ny / norm
        ax, ay = x1 + nx * off, y1 + ny * off
        bx, by = x2 + nx * off, y2 + ny * off
        self.line(ax, ay, bx, by, "#333", 0.7)
        for px, py in ((ax, ay), (bx, by)):
            self.line(px - 3 * nx, py - 3 * ny, px + 3 * nx, py + 3 * ny, "#333", 0.7)
        self.text((ax + bx) / 2 + nx * 6, (ay + by) / 2 + ny * 6, label, size,
                  fill=fill, anchor="middle", weight="600")

    # -- shared furniture ---------------------------------------------------
    def letters_table(self, x, y, w, title, rows):
        """rows: (letter, value, tier, scope, source) tuples."""
        rh = 16
        self.rect(x, y, w, 24 + rh * len(rows) + 8, fill="#fbf9f2", stroke="#4a6a8a", sw=0.9)
        self.text(x + 10, y + 17, title, 11, weight="700", fill="#0a2a6a")
        yy = y + 24 + 11
        # r6: the value column carries the provenance tag — wider (x+64→x+300)
        for letter, value, tier, scope, source in rows:
            self.text(x + 10, yy, letter, 9.2, weight="700")
            self.text(x + 64, yy, value, 9.0, fill="#222")
            self.text(x + 300, yy, tier, 8.4, fill="#7a3a10")
            self.text(x + 378, yy, scope, 8.4,
                      fill="#8a1010" if scope == "kernel" else "#1d7a38")
            self.text(x + 438, yy, source, 8.4, fill="#555")
            yy += rh

    def title_block(self, extra=""):
        d = self.doc["doc"]
        y0 = self.H - 130
        self.rect(18, y0, self.W - 36, 112, fill="#f2efe6", stroke="#222", sw=1.4)
        self.text(34, y0 + 22, f"{d['number']} — {d['title']}", 12, weight="700")
        std = self.doc["drafting"]
        self.text(34, y0 + 40,
                  "normative: " + "; ".join(std["normative"]) +
                  "  ·  supplementary: " + "; ".join(std["supplementary_iso"]), 8.6, fill="#444")
        self.text(34, y0 + 56,
                  f"projection: {std['projection']} · units mm/deg · displayed to "
                  f"{std['displayed_decimals']} dp · {self.scale_note} · DO NOT SCALE DRAWING",
                  9.2, weight="600")
        self.text(34, y0 + 72,
                  f"single source: {self.source_label} · sha256 {self.sha}", 8.6, fill="#444")
        # GH-621: the chain line is a statement about the KERNEL STATE of the
        # table being drawn, so it cannot be one literal for every input —
        # for the 9 ft sheet the kernel is byte-frozen at catalog v5, for the
        # size variants the entries are NEW on a declared kernel branch. A
        # definition may therefore carry its own `doc.generator_banner`; the
        # 9 ft definition carries none and keeps the legacy literal verbatim
        # (byte-identical output, proven by --check).
        banner = self.doc["doc"].get("generator_banner") or (
            "ADR-0015 chain TARGET: drawing == JSON == model == gate — "
            "model+gate parity PENDING (wave D-A3; C3 open, stroke suite stubbed) · "
            "kernel BYTE-FROZEN (catalog v5 pins; changes owned by calibration waves B2/B4)")
        self.text(34, y0 + 88, f"generator {GENERATOR_ID} · {banner}", 8.6, fill="#8a1010")
        # r6: provenance census computed from the features (never typed in)
        tags: dict[str, int] = {}
        retired = 0
        for feat in self.doc["features"]:
            tags[(feat.get("provenance") or {}).get("tag", "—")] = tags.get((feat.get("provenance") or {}).get("tag", "—"), 0) + 1
            if feat.get("status") == "RETIRED":
                retired += 1
        # ALIGN-2: EST joins the vocabulary (kernel legacy values with neither an
        # MFR number nor a MODEL read, open to the owner) — counted, never typed in
        census = ("provenance: " + " / ".join(f"{tags.get(k, 0)} {k}" for k in ("MFR", "MODEL", "DERIVED", "EST"))
                  + f" of {len(self.doc['features'])} rows, {retired} retired")
        line = (extra + "  ·  " if extra else "") + census
        self.text(34, y0 + 104, line, 8.6, fill="#1d7a38")
        # first-angle projection symbol (truncated cone, two views)
        sx = self.W - 190
        # first-angle: the end view (circles) sits on the LARGE-end side of
        # the frustum (small end away from the circles)
        self.circle(sx + 24, y0 + 34, 11, "#222", 1.0)
        self.circle(sx + 24, y0 + 34, 4.5, "#222", 1.0)
        self.path(f"M {sx + 52} {y0 + 22} L {sx + 88} {y0 + 26} L {sx + 88} {y0 + 42} "
                  f"L {sx + 52} {y0 + 46} Z", "#222", 1.0)
        self.text(sx + 24, y0 + 62, "first angle", 8.2, anchor="middle", fill="#444")
        self.text(sx + 24, y0 + 90, f"sheet {self.sheet_no}", 10, anchor="middle", weight="700")

    def finish(self) -> str:
        self.buf.append("</svg>")
        return "\n".join(self.buf) + "\n"


# ---------------------------------------------------------------- sheets


def tier_of(feat: dict) -> str:
    return feat["source"]["tier"]


def scope_short(feat: dict) -> str:
    return {"kernel-collision": "kernel", "render-only": "render", "envelope": "envelope"}[feat["scope"]]


def status_note(f: dict[str, dict], fid: str) -> str:
    """Provisional-status suffix for a callout, READ FROM THE FEATURE.

    GH-488D wave A2.5 (A11): S3 and S4 used to spell 'TO-BE-MEASURED' into the
    RB-02 callouts as a string literal.  That was true under r1 and became false
    the moment the exact-imperial repin gave the row a derivation — a generated
    view that contradicts its own source is the defect this single-source
    pipeline exists to prevent.  Rows that carry no `status` are final and get
    no suffix, so this reads correctly for every revision in either direction.
    """
    st = f[fid].get("status")
    return f" {st}" if st else ""


def wrap_text(text: str, budget: int) -> list[str]:
    """Word-wrap to `budget` chars/line — never cut a claim mid-sentence.

    GH-488D wave A2.5 (A11): the S4 ledger used to TRUNCATE at a fixed char
    count and append an ellipsis.  Under r1 every entry happened to fit, so the
    cap was invisible; the r2 repin rewrote the C4 adjudication (433 chars) and
    opened O6 (719), and the sheet immediately began publishing claims cut
    mid-sentence — C4's cut landed BEFORE it named the two planes it
    adjudicates, O2's before the derivation that justifies the closure it
    claims.  A drawing that publishes half a claim is worse than one that
    publishes none: nothing on the sheet tells the reader the text was cut, so
    the cut reads as the whole claim.  That is exactly the ambiguity a
    fully-constrained drawing may not contain.  The ledger now wraps, the panel
    is SIZED from the real line count, and the fit is asserted (see the raise in
    sheet_elevation) rather than assumed — so a future revision that writes a
    longer entry gets a loud build failure, never a silent cut.
    """
    lines: list[str] = []
    cur = ""
    words: list[str] = []
    for word in text.split():
        # D621-PLAN-2: a single token longer than the budget (a dossier path)
        # used to overrun its column into the next one on the narrow layouts;
        # it is hard-broken at the budget — every character still published
        while len(word) > budget:
            words.append(word[:budget]); word = word[budget:]
        words.append(word)
    for word in words:
        cand = f"{cur} {word}" if cur else word
        if cur and len(cand) > budget:
            lines.append(cur)
            cur = word
        else:
            cur = cand
    if cur:
        lines.append(cur)
    return lines or [""]


def row_of(f: dict[str, dict], fid: str, value: str) -> tuple:
    feat = f[fid]
    src = feat["source"].get("dossier_file") or feat["source"]["doc"]
    if len(src) > 70:
        # The letters table's source column is a POINTER, so a prefix is fine
        # here where it is not fine in the ledger (see wrap_text) — but a bare
        # ellipsis lets a cut sentence read as a whole one. r2's RB-02 doc
        # starts "REPINNED in r2 by the exact-imperial ruling…", which cut at
        # 70 chars states a conclusion and hides the derivation behind it. Say
        # plainly that it is cut, and where the rest lives.
        src = src[:51].rstrip() + " […JSON " + fid + ".source]"
    mark = f"  [conflict {feat['conflict']}]" if "conflict" in feat else ""
    # r6: every row prints its provenance tag (MFR / MODEL / DERIVED / EST — the
    # owner's purchased-model baseline law; EST since ALIGN-2); the suffix is the
    # tag string itself, so an EST row prints "[EST]"; rows without one print "—"
    tag = (feat.get("provenance") or {}).get("tag", "—")
    return (fid, f"{value} [{tag}]" + mark, tier_of(feat), scope_short(feat), src)



def ring_plan(f: dict, fid: str) -> dict | None:
    """D621-PLAN-1: the boot ring hung on the purchased model's own circles (CP-11 / SP-10 value.ring) plus the
    cushion glue plane it ends on, every number a JSON letter: glue(z) = CU-04 − (CU-09 − z)·tan(CU-10) behind the
    nose line (table.js bootRingPlan glueAt); the plan is drawn at the kernel nose height CU-03. Returns None on
    pre-ring sheets (their drawing stays byte-identical)."""
    v = f[fid]["value"]
    ring = v.get("ring")
    if not isinstance(ring, dict):
        return None
    cw = val(f, "CU-04")
    z_top = val(f, "CU-09")
    z_nose = val(f, "CU-03")
    bevel = math.radians(f["CU-10"]["value_deg"])
    glue_nose = cw - (z_top - z_nose) * math.tan(bevel)
    return {
        "centre": ring["centre_from_nose_intersection_mm"], "r_out": ring["outer_wall_r_mm"],
        "throat_centre": ring["throat_centre_from_nose_intersection_mm"], "r_throat": ring["throat_r_mm"],
        "leg_inner": ring["leg_inner_edge_from_axis_mm"],
        "glue_nose": glue_nose, "z_nose": z_nose, "bevel_deg": f["CU-10"]["value_deg"], "cw": cw, "z_top": z_top,
    }


def boot_ring_form(rp: dict, N: tuple[float, float], axis: float, corner: bool, fid: str,
                   leg_labels: tuple[str, str]) -> dict:
    """The ring's plan outline at the nose height in the sheet's local frame: outer semicircle about c_ring (axis
    ± 90°), the throat arch about c_throat where its lateral |w| ≤ leg_inner, straight inner (|w| = leg_inner) and
    outer (|w| = r_out) leg edges from the tangent row (u = centre) into the table, each ending on the glue plane of
    ITS rail: corner u_tip = √2·glue − |w| (the 45° mitre), side u_tip = glue. u is measured OUTBOARD along the axis
    from N; lateral w along axis + 90°. legs[0] is the w < 0 leg, legs[1] the w > 0 leg."""
    ax = (math.cos(axis), math.sin(axis))            # outboard unit
    lt = (-ax[1], ax[0])                             # lateral unit (axis + 90°)

    def at(u, w):
        return (N[0] + u * ax[0] + w * lt[0], N[1] + u * ax[1] + w * lt[1])

    def u_tip(w):
        return (math.sqrt(2.0) * rp["glue_nose"] - abs(w)) if corner else rp["glue_nose"]

    c_ring = at(rp["centre"], 0.0)
    c_throat = at(rp["throat_centre"], 0.0)
    legs = []
    for sgn, label in ((-1.0, leg_labels[0]), (1.0, leg_labels[1])):
        edges = {}
        for name, w in (("inner_edge", sgn * rp["leg_inner"]), ("outer_edge", sgn * rp["r_out"])):
            ut = u_tip(w)
            edges[name] = {"lateral_mm": w, "run_mm": rp["centre"] - ut,
                           "tangent": list(at(rp["centre"], w)), "tip": list(at(ut, w))}
        legs.append({"label": label, **edges,
                     "tip_cut": [edges["inner_edge"]["tip"], edges["outer_edge"]["tip"]]})
    half = math.asin(min(1.0, rp["leg_inner"] / rp["r_throat"]))   # throat arch half-angle where |w| <= leg_inner
    return {
        "fid": fid, "axis_deg": math.degrees(axis), "c_ring": list(c_ring), "c_throat": list(c_throat),
        "r_out": rp["r_out"], "r_throat": rp["r_throat"], "leg_inner": rp["leg_inner"],
        "throat_arc_half_deg": math.degrees(half), "glue_nose_mm": rp["glue_nose"],
        "leg_run_outer_mm": legs[1]["outer_edge"]["run_mm"], "leg_run_inner_mm": legs[1]["inner_edge"]["run_mm"],
        "legs": legs,
    }


def draw_boot_ring(sh: "Sheet", P, u: dict, axis: float,
                   stroke: str = "#8a5a1a", w: float = 1.0, dash: str = "3 3") -> None:
    """The ring outline: outer semicircle, throat arch (clipped to the inner leg lines), four leg edges, two arm ends."""
    c_ring, c_throat = tuple(u["c_ring"]), tuple(u["c_throat"])
    arc_path(sh, P, c_ring, u["r_out"], axis - math.pi / 2.0, axis + math.pi / 2.0, stroke, w, dash=dash, n=64)
    half = math.radians(u["throat_arc_half_deg"])
    arc_path(sh, P, c_throat, u["r_throat"], axis - half, axis + half, stroke, w, dash=dash, n=48)
    # the inner leg lines run from the throat arch's ends (|w| = leg_inner on the circle) to the arm ends
    for leg, sgn in ((u["legs"][0], -1.0), (u["legs"][1], 1.0)):
        ang = axis + sgn * half
        start = (c_throat[0] + u["r_throat"] * math.cos(ang), c_throat[1] + u["r_throat"] * math.sin(ang))
        sh.line(*P(*start), *P(*leg["inner_edge"]["tip"]), stroke, w, dash=dash)
        sh.line(*P(*leg["outer_edge"]["tangent"]), *P(*leg["outer_edge"]["tip"]), stroke, w, dash=dash)
        sh.line(*P(*leg["tip_cut"][0]), *P(*leg["tip_cut"][1]), stroke, w, dash=dash)


def sheet_corner(doc, f, sha, solved, src) -> str:
    sh = Sheet("S1", "corner-pocket assembly — plan, PCF-CP-NLS frame", doc, sha,
               "drawn ≈3.2 px/mm", src)
    m = val(f, "CP-01")
    dev = f["CP-02"]["kernel_deviation_deg"]
    a = m / math.sqrt(2.0)
    depth, r = val(f, "CP-08"), val(f, "CP-07")
    shelf, pad = val(f, "CP-04"), val(f, "CP-03")
    cw, band = val(f, "CU-04"), val(f, "RB-01")
    # r4+ boot U-form letter (CP-11.leg_run_mm / leg_tip); absent on r3 and on
    # the derived size variants until re-derived — every branch below that
    # tests has_u leaves the r3 output byte-identical.
    # D621-PLAN-1: ring rows (CP-11.ring) hang the boot on the MODEL circles and end the arms on the cushion glue
    # plane; leg_run_mm is then a DERIVED note, not a number. Pre-ring sheets keep the U-form letter path.
    rpc = ring_plan(f, "CP-11")
    has_u = rpc is None and isinstance(f["CP-11"]["value"].get("leg_run_mm"), (int, float))

    sc = 3.2
    ox, oy = 900.0, 640.0  # px of local N=(0,0); +x right, +y UP

    def P(x, y):
        return (ox + x * sc, oy - y * sc)

    ext = 150.0
    # nose datum lines (long rail along +x, short rail along +y)
    sh.line(*P(-70, 0), *P(ext, 0), "#666", 0.8, dash="14 4 2.5 4")
    sh.line(*P(0, -70), *P(0, ext), "#666", 0.8, dash="14 4 2.5 4")
    sh.text(*P(ext + 4, -3), "long-rail nose datum", 8.6, fill="#666")
    sh.text(*P(3, ext + 6), "short-rail nose datum", 8.6, fill="#666")
    # playfield shading marker
    sh.text(*P(84, 110), "playing surface (PF-01)", 9.5, fill="#1d7a38")

    # kernel construction (table.rs from_pocket_spec "1"/"1t"): nose line →
    # jaw arc (tangent at the TRUE mouth point P) → straight facing F→E.
    kc = corner_jaw_construction(f)
    pl = kc["P"]                     # long-rail mouth point (= (a, 0))
    ps = (kc["P"][1], kc["P"][0])    # short-rail mirror across the diagonal
    jl, fl, el = kc["J"], kc["F"], kc["E"]
    js, fs_, es = (jl[1], jl[0]), (fl[1], fl[0]), (el[1], el[0])
    c = (-depth / math.sqrt(2.0), -depth / math.sqrt(2.0))

    # cushion bodies: nose → featherstrip band, ended on the facing plane
    for horiz in (True, False):
        if horiz:
            nose_a, fs_a = P(ext, 0), P(ext, -cw)
            nose_b, fs_b = P(*pl), P(*el)
        else:
            nose_a, fs_a = P(0, ext), P(-cw, ext)
            nose_b, fs_b = P(*ps), P(*es)
        sh.line(*nose_a, *nose_b, "#111", 2.2)                       # nose (contact) line
        sh.line(*fs_a, *fs_b, "#5a3a1a", 1.1)                        # featherstrip line
    # r4+: the long-rail boot leg crosses x ≈ 64 at this depth, so the two
    # featherstrip labels start further along the rail when the U is drawn
    fs_x = 100.0 if (has_u or rpc) else 64.0
    sh.text(*P(fs_x, -cw - 9), f"featherstrip (CU-04 = {Sheet.f(cw)})", 8.4, fill="#5a3a1a")
    sh.text(*P(fs_x, -cw - 19),
            f"rail-top outer at {Sheet.f(band)} behind the nose (RB-01, C3) — see S3/S4",
            8.2, fill="#888")

    # jaw arcs (kernel "1t"/"2t"): the PHYSICAL jaw face is the short P→F
    # sweep; the kernel collision object is the FULL circle (span: None in
    # from_pocket_spec — contains_angle treats it as a complete circle), so
    # the full circle is drawn as collision-virtual alongside the face.
    for jc, p0, f0 in ((jl, pl, fl), (js, ps, fs_)):
        sh.circle(*P(*jc), val(f, "CP-06") * sc, "#8a1010", 0.8, dash="4 4")
        a0 = math.atan2(p0[1] - jc[1], p0[0] - jc[0])
        a1 = math.atan2(f0[1] - jc[1], f0[0] - jc[0])
        if a1 - a0 > math.pi:
            a1 -= 2.0 * math.pi  # take the short (physical, convex) sweep
        elif a0 - a1 > math.pi:
            a1 += 2.0 * math.pi
        arc_path(sh, P, jc, val(f, "CP-06"), a0, a1, "#111", 2.2, n=24)
    # straight facings F→E + neoprene pads (render assembly outline)
    dfl = ((el[0] - fl[0]), (el[1] - fl[1]))
    norm = math.hypot(*dfl)
    dfl = (dfl[0] / norm, dfl[1] / norm)
    for p0, e0, dvec in ((fl, el, dfl), (fs_, es, (dfl[1], dfl[0]))):
        sh.line(*P(*p0), *P(*e0), "#111", 2.2)
        nx, ny = dvec[1], -dvec[0]  # normal, cushion-body side
        if nx + ny > 0:
            nx, ny = -nx, -ny
        q0 = (p0[0] + nx * pad, p0[1] + ny * pad)
        q1 = (e0[0] + nx * pad, e0[1] + ny * pad)
        sh.line(*P(*q0), *P(*q1), "#0a5a8a", 1.2)
        sh.line(*P(*p0), *P(*q0), "#0a5a8a", 1.0)
        sh.line(*P(*e0), *P(*q1), "#0a5a8a", 1.0)
    sh.text(*P(-160, 132), f"CP-03 facing pad {Sheet.f(pad)} (3/16 in neoprene, MFR verbatim)", 8.6, fill="#0a5a8a")
    sh.text(*P(-160, 122),
            f"vertical under-cut CP-09 = {Sheet.f(val(f, 'CP-09'))}° RENDER-ONLY (decision ①)",
            8.2, fill="#1d7a38")

    # kernel capture disc
    sh.circle(*P(c[0], c[1]), r * sc, "#8a1010", 1.4, dash="10 4")
    sh.text(*P(c[0] - 62, c[1] - 58), f"kernel capture disc CP-07 r{Sheet.f(r)} (dashed = collision virtual)",
            8.6, fill="#8a1010")
    # pocket diagonal + depth
    sh.line(*P(0, 0), *P(c[0] * 2.4, c[1] * 2.4), "#666", 0.7, dash="12 4 2 4")
    sh.dim(*P(0, 0), *P(c[0], c[1]), f"CP-08 depth {Sheet.f(depth)} (N → disc centre)", off=14)
    # mouth chord + dimension
    sh.line(*P(*pl), *P(*ps), "#1d7a38", 1.0, dash="5 4")
    sh.dim(*P(*pl), *P(*ps), f"CP-01 mouth {Sheet.f(m)} (4 1/2 in factory pro cut)", off=26, fill="#1d7a38")
    # shelf: mouth-chord centre → disc boundary
    mcx, mcy = a / 2.0, a / 2.0
    ub = (c[0] + r / math.sqrt(2.0), c[1] + r / math.sqrt(2.0))
    sh.dim(*P(mcx, mcy), *P(*ub), f"CP-04 shelf {Sheet.f(shelf)}", off=-12)
    # facing angle arcs
    sh.text(*P(pl[0] + 5, -16), f"CP-02 {Sheet.f(135.0 + dev)}° (RKC factory cut; WPA 142 → conflict C1)", 8.6, fill="#8a1010")
    sh.text(*P(pl[0] + 5, -25),
            f"jaw arc CP-06 r{Sheet.f(val(f, 'CP-06'))} tangent nose@P / facing@F — kernel 1t collision", 8.2, fill="#555")
    sh.text(*P(pl[0] + 5, -34),
            "= FULL circle (span None, dashed); physical face = the P→F sweep", 8.2, fill="#8a1010")
    # throat annotation
    sh.text(*P(c[0] - 62, c[1] - 68), f"CP-05 throat {Sheet.f(val(f, 'CP-05'))} consistency (mouth − {Sheet.f(m - val(f, 'CP-05'))})", 8.2, fill="#555")
    # C7: RC-01 distinguishes the measured block chamfer from the rail-end
    # setback. Its measured joint angle runs from the small TESSELLATION
    # junction round to the pocket cut circle. The cap is a keystone block
    # (CP-15, MFR Rail Cap), with no CP-10 casting. The cut = boot outer wall +
    # cut clearance about the capture centre, continued axis-parallel to
    # each cap's lip (CU-04 behind the nose). The leather boot is the MODEL
    # ring (CP-11 r6): outer wall R = rw + outer_landing, throat rT = rw −
    # lip_overhang, U legs of leg_run along the pocket axis (the U-form
    # below draws them). Every radius is derived from the JSON.
    cp11, cp15 = f["CP-11"]["value"], f["CP-15"]["value"]
    corner = val(f, "RC-01")
    cap = corner["cap"]
    reference = next(row for row in cap["rings"] if row["above_bed_mm"] == cap["reference_above_bed_mm"])
    crown_edge = cap["rings"][-1]
    block_leg = crown_edge["chamfer_leg_mm"]
    joint_deg = cap["joint_deg"]
    rw = r + cp11["wall_offset_mm"]
    lip_r = rw - cp11["lip_overhang_mm"]
    land_r = rw + cp11["outer_landing_mm"]
    axis = math.radians(225.0)
    # D621-PLAN-1: on ring rows the pocket cut (caps, keystone, sub-rail beam) is boot R_out + cut_clear about
    # the MODEL ring centre out along the diagonal; pre-ring sheets keep rw + outer_landing about the capture centre
    c_cut = (-rpc["centre"] / math.sqrt(2.0), -rpc["centre"] / math.sqrt(2.0)) if rpc else c
    r_boot = rpc["r_out"] if rpc else land_r
    r_cut = r_boot + cp15["cut_clear_mm"]
    band = val(f, "RB-01")   # nose line → cap outer edge
    lipw = val(f, "CU-04")   # nose line → cap lip
    s2 = 1.0 / math.sqrt(2.0)
    # NLS frame: long rail at y < 0 (outer edge y = −band), short rail at x < 0
    # DERIVED: the joint meets the midpoint sample of RC-01's block-junction
    # fillet, as in cornerQuarter(). The outer finish itself lies off-sheet.
    setback, inset, leg = (reference[key] for key in ("axis_setback_mm", "shoulder_inset_mm", "chamfer_leg_mm"))
    p0, p1, p2 = (setback, 0), (inset+leg, inset), (inset, inset+leg)
    la, lb = math.dist(p0, p1), math.dist(p1, p2)
    va, vb = [(p1[k]-p0[k])/la for k in range(2)], [(p2[k]-p1[k])/lb for k in range(2)]
    turn = math.atan2(va[0]*vb[1]-va[1]*vb[0], va[0]*vb[0]+va[1]*vb[1])
    radius = corner["junction_round"]["radius_mm"]
    trim = min(radius*math.tan(abs(turn)/2), la/2, lb/2)
    r_joint = trim/math.tan(abs(turn)/2)
    start = [p1[k]-trim*va[k] for k in range(2)]
    sign = math.copysign(1, turn)
    centre = (start[0]-sign*va[1]*r_joint, start[1]+sign*va[0]*r_joint)
    # TESSELLATION: the same 0.005 mm chord-error partition as cornerQuarter.
    segments = max(2, math.ceil((math.pi/2)/(2*math.acos(1-min(1, .005/radius)))))
    angle = math.atan2(start[1]-centre[1], start[0]-centre[0]) + turn*(segments//2)/segments
    c_l = (-band+reference["outer_inset_mm"]+centre[0]+r_joint*math.cos(angle),
           -band+reference["outer_inset_mm"]+centre[1]+r_joint*math.sin(angle))
    c_e = (c_l[1], c_l[0])
    th = math.radians(joint_deg)

    def joint_hit(c0, dx, dy):
        # joint ray c0 + λ(dx, dy) ∩ circle(c, r_cut), nearer root
        fx, fy = c0[0] - c_cut[0], c0[1] - c_cut[1]
        b = 2.0 * (fx * dx + fy * dy)
        cc = fx * fx + fy * fy - r_cut * r_cut
        disc = b * b - 4.0 * cc
        if disc < 0:
            raise AssertionError("CP-15 joint ray misses the pocket cut circle")
        lam = (-b - math.sqrt(disc)) / 2.0
        return (c0[0] + lam * dx, c0[1] + lam * dy)

    j_l = joint_hit(c_l, math.sin(th), math.cos(th))   # tilts away from the corner
    j_e = joint_hit(c_e, math.cos(th), math.sin(th))   # mirror across the diagonal
    t_l = (c_cut[0] + r_cut * s2, c_cut[1] - r_cut * s2)       # tangent row, long-rail side
    t_e = (c_cut[0] - r_cut * s2, c_cut[1] + r_cut * s2)       # tangent row, short-rail side
    a_l = (t_l[0] + (-lipw - t_l[1]), -lipw)            # axis-parallel run to the lip
    a_e = (-lipw, t_e[1] + (-lipw - t_e[0]))

    def bearing(q):
        return math.atan2(q[1] - c_cut[1], q[0] - c_cut[0])

    # the two joints (clipped at the sheet frame — the cap outer edge lies
    # 177.8 behind the nose, off this sheet; see S3/S4), the cut arc, the runs
    FRAME = -118.0

    def clip_to(q0, q1, lim_axis):
        # point on segment q0→q1 where the coordinate lim_axis reaches FRAME
        t = (FRAME - q0[lim_axis]) / (q1[lim_axis] - q0[lim_axis])
        return (q0[0] + (q1[0] - q0[0]) * t, q0[1] + (q1[1] - q0[1]) * t)

    k_l = clip_to(j_l, c_l, 1)
    k_e = clip_to(j_e, c_e, 0)
    sh.line(*P(*k_l), *P(*j_l), "#6a4a1a", 1.1)
    sh.line(*P(*k_e), *P(*j_e), "#6a4a1a", 1.1)
    b_te, b_tl = bearing(t_e), bearing(t_l)
    if b_tl < b_te:
        b_tl += 2.0 * math.pi
    arc_path(sh, P, c_cut, r_cut, b_te, b_tl, "#6a4a1a", 1.1, n=48)
    sh.line(*P(*t_l), *P(*a_l), "#6a4a1a", 1.1)
    sh.line(*P(*t_e), *P(*a_e), "#6a4a1a", 1.1)
    sh.line(*P(*a_l), *P(a_l[0] + 60.0, -lipw), "#6a4a1a", 0.8, dash="6 3")
    sh.line(*P(*a_e), *P(-lipw, a_e[1] + 60.0), "#6a4a1a", 0.8, dash="6 3")
    sh.text(*P(k_e[0] + 5, k_e[1] - 9),
            f"RC-01 joints {Sheet.f(joint_deg)}° from square; block leg {Sheet.f(block_leg)} at the crown edge "
            f"(outer finish off-sheet; band {Sheet.f(band)})", 8.2, fill="#6a4a1a")
    sh.text(*P(t_l[0] + 4, t_l[1] - 8),
            f"pocket cut r{Sheet.f(r_cut)} = boot R {Sheet.f(r_boot)} + {Sheet.f(cp15['cut_clear_mm'])} clear"
            + (" about the MODEL ring centre (D621-PLAN-1)" if rpc else ""), 8.2, fill="#6a4a1a")
    # the ring's throat (full circle, dashed): the U-form / ring form below draws the boot outline
    if rpc:
        arc_path(sh, P, (-rpc["throat_centre"] * s2, -rpc["throat_centre"] * s2), rpc["r_throat"], 0.0, 2.0 * math.pi,
                 "#8a5a1a", 0.7, dash="2 4", n=64)
    else:
        arc_path(sh, P, c, lip_r, 0.0, 2.0 * math.pi, "#8a5a1a", 0.7, dash="2 4", n=64)
    solved["corner_keystone"] = {
        "frame": "PCF-CP-NLS local mm (see boot_u_form)", "cut_centre": list(c_cut), "boot_r": r_boot,
        "chamfer_ends": [list(c_l), list(c_e)], "joint_hits": [list(j_l), list(j_e)],
        "cut_radius": r_cut, "tangent_rows": [list(t_l), list(t_e)], "lip_runs_end": [list(a_l), list(a_e)],
    }
    # boot U-form (r4+): semicircular arch on the outboard half between the
    # lip and landing radii, straight legs along the pocket axis into the
    # table from the axis ± 90° tangent points, tip mitred parallel to the
    # adjacent rail nose. The wing/shim arcs above stay: they describe the
    # collar inside the mouth window; the U is the boot's plan outline.
    u_form = None
    u_suffix = ""
    ring_form = None
    if rpc:
        # D621-PLAN-1: the ring form — MODEL circles, arm ends DERIVED on the CU-10 glue plane at the nose height
        ring_form = boot_ring_form(rpc, (0.0, 0.0), axis, True, "CP-11",
                                   ("short-rail leg (axis − 90°)", "long-rail leg (axis + 90°)"))
        for leg, rail_dir in ((ring_form["legs"][0], (0.0, 1.0)), (ring_form["legs"][1], (1.0, 0.0))):
            (x0, y0), (x1, y1) = leg["tip_cut"]
            cross = (x1 - x0) * rail_dir[1] - (y1 - y0) * rail_dir[0]
            if abs(cross) > 1e-6:
                raise AssertionError(
                    f"CP-11 {leg['label']} arm end is not on its rail's glue plane (cross {cross:.3e})")
        draw_boot_ring(sh, P, ring_form, axis)
        long_leg = ring_form["legs"][1]
        sh.dim(*P(*long_leg["outer_edge"]["tangent"]), *P(*long_leg["outer_edge"]["tip"]),
               f"CP-11 arm run {Sheet.f(ring_form['leg_run_outer_mm'])} (DERIVED: to the glue plane {Sheet.f(rpc['glue_nose'])} at the nose height)", off=-14)
        u_suffix = f" · arm run {Sheet.f(ring_form['leg_run_outer_mm'])} DERIVED"
        solved["corner_boot_ring"] = ring_form
    elif has_u:
        land_r = rw + cp11["outer_landing_mm"]
        u_form = boot_u_form(c, axis, lip_r, land_r, cp11["leg_run_mm"], cp11["leg_tip"],
                             "CP-11", ("short-rail leg (axis − 90°)", "long-rail leg (axis + 90°)"))
        # construction guard: the mitre cut of each leg must be parallel to
        # ITS rail nose line (short-rail leg ∥ +y, long-rail leg ∥ +x)
        for leg, rail_dir in ((u_form["legs"][0], (0.0, 1.0)), (u_form["legs"][1], (1.0, 0.0))):
            (x0, y0), (x1, y1) = leg["tip_cut"]
            cross = (x1 - x0) * rail_dir[1] - (y1 - y0) * rail_dir[0]
            if abs(cross) > 1e-6:
                raise AssertionError(
                    f"CP-11 {leg['label']} tip cut is not parallel to its rail nose (cross {cross:.3e})")
        draw_boot_u(sh, P, c, axis, u_form)
        long_leg = u_form["legs"][1]
        sh.dim(*P(*long_leg["outer_edge"]["tangent"]), *P(*long_leg["outer_edge"]["tip"]),
               f"CP-11 leg run {Sheet.f(cp11['leg_run_mm'])}", off=-14)
        u_suffix = f" · U run {Sheet.f(cp11['leg_run_mm'])}"
    # stacked callout block (fixed rows — no radial placement collisions)
    callouts = [
        (938, "#6a4a1a",
         f"CP-15 keystone / RC-01 MODEL block leg {Sheet.f(block_leg)} at crown edge; "
         f"joints {Sheet.f(joint_deg)}°; finish R{Sheet.f(radius)} TESSELLATION; cut r{Sheet.f(r_cut)}; "
         f"kerf {Sheet.f(cp15['kerf_mm'])}; block top {Sheet.f(cp15['top_below_cap_plateau_mm'])} below cap plateau"),
        (954, "#8a5a1a",
         (f"CP-11 boot ring (MODEL leather01 circles, D621-PLAN-1): wall R {Sheet.f(rpc['r_out'])} about {Sheet.f(rpc['centre'])} out along the axis, "
          f"throat r {Sheet.f(rpc['r_throat'])} about {Sheet.f(rpc['throat_centre'])}, leg inner edge {Sheet.f(rpc['leg_inner'])}; "
          f"wall top +{Sheet.f(cp11['outer_wall_top_mm'])}, crest +{Sheet.f(cp11['crest_above_bed_mm'])}, skirt to −{Sheet.f(cp11['skirt_below_bed_mm'])}")
         if rpc else
         (f"CP-11 boot ring (MODEL leather01): throat rT {Sheet.f(lip_r)} (rw {Sheet.f(rw)} − lip {Sheet.f(cp11['lip_overhang_mm'])}), "
          f"outer wall R {Sheet.f(land_r)}, wall top +{Sheet.f(cp11['outer_wall_top_mm'])}, crest +{Sheet.f(cp11['crest_above_bed_mm'])} "
          f"at band fraction {cp11['crest_at_band_fraction']}, skirt to −{Sheet.f(cp11['skirt_below_bed_mm'])}")),
        (970, "#8a5a1a",
         (f"top surface by bearing (MODEL leather01, D621-PLAN-2): crest +{Sheet.f(cp11['top_profile']['by_bearing'][0][1][0])} at the apex → "
          f"+{Sheet.f(cp11['top_profile']['by_bearing'][-1][1][0])} at the tangent rows; wall top +{Sheet.f(cp11['outer_wall_top_mm'])} → "
          f"+{Sheet.f(cp11['top_profile']['by_bearing'][-1][1][-1])}, +{Sheet.f(cp11['top_profile']['leg_by_span'][2][1][-1])} along the legs "
          f"(plateau +{Sheet.f(cp11['top_profile']['leg_by_span'][2][1][2])}); visible band {Sheet.f(cp11['band_mm'])} / proud {Sheet.f(cp11['proud_mm'])}")
         if cp11.get('top_profile') else
         (f"legs: crest {cp11['leg_crest_fraction']} of the rise, arc crest fade per bearing {cp11['crest_fade_deg_factor'][:3]}… "
          f"(MODEL leather01 15° bins); visible band {Sheet.f(cp11['band_mm'])} / proud {Sheet.f(cp11['proud_mm'])}")),
        (986, "#1d7a38",
         f"boot bottom OPEN → trap cup PC-01 (CP-12; MODEL pool_trap01: half-width {Sheet.f(val(f, 'PC-01')['half_width_mm'])}, "
         f"{Sheet.f(val(f, 'PC-01')['inboard_run_from_ring_centre_mm']['corner'])} inboard, "
         f"−{Sheet.f(val(f, 'PC-01')['top_below_bed_mm'])}..−{Sheet.f(val(f, 'PC-01')['bottom_below_bed_mm'])})"),
    ]
    if ring_form is not None:
        callouts.append(
            (1002, "#8a5a1a",
             f"arm ends (D621-PLAN-1, DERIVED): every row ends on the CU-10 glue plane of its rail (CU-04 {Sheet.f(rpc['cw'])} − "
             f"(CU-09 {Sheet.f(rpc['z_top'])} − z)·tan {Sheet.f(rpc['bevel_deg'])}° = {Sheet.f(rpc['glue_nose'])} at the nose height CU-03 {Sheet.f(rpc['z_nose'])}); "
             f"outer edge run {Sheet.f(ring_form['leg_run_outer_mm'])}, inner edge {Sheet.f(ring_form['leg_run_inner_mm'])} — the 45° mitre; "
             f"kernel disc centre {Sheet.f(depth)} keeps physics + the bed hole"))
    if u_form is not None:
        callouts.append(
            (1002, "#8a5a1a",
             f"boot U-form CP-11: legs along the pocket axis, run {Sheet.f(u_form['leg_run_mm'])} from the "
             f"tangent points (axis ± 90° on r{Sheet.f(u_form['r_lip'])} / r{Sheet.f(u_form['r_land'])}), "
             f"tip mitred parallel to the rail nose (45° to the axis; inner edge run "
             f"{Sheet.f(u_form['inner_run_mm'])})"))
    for yy, col, txt in callouts:
        sh.text(60, yy, txt, 8.4, fill=col)

    sh.letters_table(46, 96, 760, "S1 letters — corner pocket (value · tier · scope · source)", [
        row_of(f, "CP-01", f"mouth {Sheet.f(m)} (4.5 in)"),
        row_of(f, "CP-02", f"facing {Sheet.f(val(f, 'CP-02'))}° (dev {Sheet.f(dev)})"),
        row_of(f, "CP-03", f"facing pad {Sheet.f(pad)}"),
        row_of(f, "CP-04", f"shelf {Sheet.f(shelf)}"),
        row_of(f, "CP-05", f"throat {Sheet.f(val(f, 'CP-05'))}"),
        row_of(f, "CP-06", f"jaw r {Sheet.f(val(f, 'CP-06'))}"),
        row_of(f, "CP-07", f"disc r {Sheet.f(r)}"),
        row_of(f, "CP-08", f"depth {Sheet.f(depth)}"),
        row_of(f, "CP-09", f"under-cut {Sheet.f(val(f, 'CP-09'))}° render"),
        row_of(f, "CP-10", "RETIRED r6 — see CP-15"),
        row_of(f, "CP-11", (f"ring R {Sheet.f(rpc['r_out'])} @ {Sheet.f(rpc['centre'])} / throat r {Sheet.f(rpc['r_throat'])} · arm run {Sheet.f(ring_form['leg_run_outer_mm'])} DERIVED"
                            if rpc else f"rT {Sheet.f(lip_r)} / R {Sheet.f(land_r)} · run {Sheet.f(cp11['leg_run_mm'])}")),
        row_of(f, "CP-12", "OPEN → cup PC-01"),
        row_of(f, "CP-15", f"RC-01 leg {Sheet.f(block_leg)} / {Sheet.f(joint_deg)}° / cut r{Sheet.f(r_cut)}"),
        row_of(f, "PC-01", f"cup {Sheet.f(val(f, 'PC-01')['half_width_mm'])} × {Sheet.f(val(f, 'PC-01')['inboard_run_from_ring_centre_mm']['corner'])}"),
    ])
    solved["corner"] = {
        "nose_offset_a": a,
        "mouth_points": [list(pl), list(ps)],
        "jaw_centers": [list(jl), list(js)],
        "facing_tangencies": [list(fl), list(fs_)],
        "facing_ends": [list(el), list(es)],
        "construction": {k: kc[k] for k in ("dc", "pwc", "ca_deg")},
        "jaw_collision": "FULL circle per arc (span: None in from_pocket_spec); the P→F sweep is the physical face only",
        "disc_center": list(c), "disc_radius": r,
    }
    if u_form is not None:
        solved["corner"]["boot_u_form"] = {
            "frame": "PCF-CP-NLS local mm: N = nose-line intersection at (0, 0), long-rail nose "
                     "along +x, short-rail nose along +y, pocket toward −x/−y; radii about the "
                     "capture centre disc_center",
            "center": list(c),
            **u_form,
        }
    sh.title_block("S1 note: kernel jaw prisms are VERTICAL; the 15° under-cut exists in render only "
                   "(owner decision ① — physics hook deferred to the calibrated rattle program, wave B4)")
    return sh.finish()


def sheet_side(doc, f, sha, solved, src) -> str:
    sh = Sheet("S2", "side-pocket assembly — plan", doc, sha, "drawn ≈3.2 px/mm", src)
    m = val(f, "SP-01")
    dev = f["SP-02"]["kernel_deviation_deg"]
    depth, r = val(f, "SP-08"), val(f, "SP-07")
    shelf, pad = val(f, "SP-04"), val(f, "SP-03")
    cw, band = val(f, "CU-04"), val(f, "RB-01")

    sc = 3.2
    ox, oy = 840.0, 480.0

    def P(x, y):
        return (ox + x * sc, oy - y * sc)

    ext = 210.0
    sh.line(*P(-ext, 0), *P(ext, 0), "#666", 0.8, dash="14 4 2.5 4")
    sh.text(*P(ext + 4, -3), "long-rail nose datum", 8.6, fill="#666")
    sh.text(*P(120, 60), "playing surface (PF-01)", 9.5, fill="#1d7a38")

    # kernel construction (table.rs from_pocket_spec "4"/"4t", exact_side_facing):
    # nose line → jaw arc (tangent at the TRUE mouth point P) → facing F→E.
    ks = side_jaw_construction(f)
    pr, jr, fr, er = ks["P"], ks["J"], ks["F"], ks["E"]
    plft = (-pr[0], pr[1])
    jlf, flf, elf = (-jr[0], jr[1]), (-fr[0], fr[1]), (-er[0], er[1])
    c = (0.0, -depth)

    # cushion bodies both sides of the mouth
    for sign, p0, e0 in ((1.0, pr, er), (-1.0, plft, elf)):
        sh.line(*P(sign * ext, 0), *P(p0[0], 0), "#111", 2.2)
        sh.line(*P(sign * ext, -cw), *P(e0[0], -cw), "#5a3a1a", 1.1)
    sh.text(*P(120, -cw - 9), f"featherstrip (CU-04 = {Sheet.f(cw)})", 8.4, fill="#5a3a1a")
    sh.text(*P(120, -cw - 19),
            f"rail-top outer at {Sheet.f(band)} behind the nose (RB-01, C3) — see S3/S4",
            8.2, fill="#888")

    # jaw arcs ("4t"/"14t") + straight facings F→E + neoprene pads
    for jc, p0, f0, e0 in ((jr, pr, fr, er), (jlf, plft, flf, elf)):
        a0 = math.atan2(p0[1] - jc[1], p0[0] - jc[0])
        a1 = math.atan2(f0[1] - jc[1], f0[0] - jc[0])
        if a1 - a0 > math.pi:
            a1 -= 2.0 * math.pi
        elif a0 - a1 > math.pi:
            a1 += 2.0 * math.pi
        sh.circle(*P(*jc), val(f, "SP-06") * sc, "#8a1010", 0.8, dash="4 4")
        arc_path(sh, P, jc, val(f, "SP-06"), a0, a1, "#111", 2.2, n=24)
        sh.line(*P(*f0), *P(*e0), "#111", 2.2)
        dvec = ((e0[0] - f0[0]), (e0[1] - f0[1]))
        norm = math.hypot(*dvec)
        dvec = (dvec[0] / norm, dvec[1] / norm)
        nx, ny = dvec[1], -dvec[0]
        if ny > 0:
            nx, ny = -nx, -ny
        q0 = (f0[0] + nx * pad, f0[1] + ny * pad)
        q1 = (e0[0] + nx * pad, e0[1] + ny * pad)
        sh.line(*P(*q0), *P(*q1), "#0a5a8a", 1.2)
        sh.line(*P(*f0), *P(*q0), "#0a5a8a", 1.0)
        sh.line(*P(*e0), *P(*q1), "#0a5a8a", 1.0)
    sh.text(*P(-200, 40), f"SP-03 facing pad {Sheet.f(pad)} (3/16 in neoprene, MFR verbatim)", 8.6, fill="#0a5a8a")
    sh.text(*P(-200, 31),
            f"vertical under-cut SP-09 = {Sheet.f(val(f, 'SP-09'))}° RENDER-ONLY (decision ①)",
            8.2, fill="#1d7a38")

    sh.circle(*P(*c), r * sc, "#8a1010", 1.4, dash="10 4")
    sh.text(*P(58, c[1] - r - 10), f"kernel capture disc SP-07 r{Sheet.f(r)}", 8.6, fill="#8a1010")
    sh.dim(*P(0, 0), *P(*c), f"SP-08 depth {Sheet.f(depth)}", off=-52)
    sh.dim(*P(*plft), *P(*pr), f"SP-01 mouth {Sheet.f(m)} (5.0 in, inference C6)", off=30, fill="#1d7a38")
    sh.dim(*P(96, 0), *P(96, -(depth - r)), f"SP-04 shelf {Sheet.f(shelf)}", off=-46)
    sh.text(*P(pr[0] + 6, -16), f"SP-02 {Sheet.f(90.0 + dev)}° (RKC factory; OUTSIDE WPA [104,105] — conflict C1;", 8.6, fill="#8a1010")
    sh.text(*P(pr[0] + 6, -25), "kernel exact_side_facing = true)", 8.6, fill="#8a1010")
    sh.text(*P(58, c[1] - r - 20),
            f"SP-05 throat {Sheet.f(val(f, 'SP-05'))} consistency · jaw SP-06 r{Sheet.f(val(f, 'SP-06'))} "
            "EST tangent nose@P / facing@F (kernel 4t; collision = FULL circle, span None, dashed)",
            8.2, fill="#555")

    # r6 (D621-ALIGN): SP-11 liner RETIRED. The side boot is the MODEL D-ring
    # (SP-10 r6, leather06): outboard semicircles rT = rw − lip_overhang and
    # R = rw + outer_landing about the capture centre with a flat front face
    # on the tangent line (leg_run 0 — no legs); the caps are notched r = R
    # about the same centre and meet on the CP-15 kerf on the pocket axis;
    # the slate opening SL-01 (MODEL pool_top, apex MFR-clamped) is the
    # circle of SL-01 radius about a centre SL-01 centre outboard of the
    # nose line — its roll runs between the two points where the opening
    # edge meets the facing feet (SP-01/2 + dz·tan(SP-02 − 90)).
    sp10 = f["SP-10"]["value"]
    cp15 = f["CP-15"]["value"]
    rw = r + sp10["wall_offset_mm"]  # slate fall-wall radius (table.js rw = p.r + 0.004)
    lip_r = rw - sp10["lip_overhang_mm"]
    land_r = rw + sp10["outer_landing_mm"]
    axis = math.radians(270.0)
    band = val(f, "RB-01")
    lipw = val(f, "CU-04")
    half_pi = math.pi / 2.0
    u_form = None
    u_suffix = ""
    # D621-PLAN-1 (ring rows): the D is the MODEL circles about a centre out along the pocket axis from the nose
    # line, its front face the CU-10 glue plane; the cap notch is R_out about the same centre. Pre-ring sheets keep
    # the capture-centre construction byte-identically.
    rps = ring_plan(f, "SP-10")
    c_notch = (0.0, -rps["centre"]) if rps else c
    r_notch = rps["r_out"] if rps else land_r
    side_ring = None
    if rps:
        side_ring = boot_ring_form(rps, (0.0, 0.0), axis, False, "SP-10", ("−x arm", "+x arm"))
        draw_boot_ring(sh, P, side_ring, axis)
        solved["side_boot_ring"] = side_ring
    else:
        for rr in (lip_r, land_r):
            arc_path(sh, P, c, rr, axis - half_pi, axis + half_pi, "#8a5a1a", 1.0, dash="3 3")
        for sgn in (-1.0, 1.0):  # flat front face on the tangent line
            sh.line(*P(c[0] + sgn * lip_r, c[1]), *P(c[0] + sgn * land_r, c[1]), "#8a5a1a", 1.0, dash="3 3")
    # cap notch r = R about the ring centre, from lip crossing to lip crossing round the outboard side, split by the kerf
    kerf_h = cp15["kerf_mm"] / 2.0
    d_lip = math.sqrt(max(r_notch * r_notch - (-lipw - c_notch[1]) ** 2, 0.0))
    b_r = math.atan2(-lipw - c_notch[1], d_lip)            # right lip crossing bearing (just above 0)
    arc_path(sh, P, c_notch, r_notch, b_r, b_r - (math.pi + 2.0 * b_r), "#6a4a1a", 1.1, n=48)
    y_apex = c_notch[1] - math.sqrt(max(r_notch * r_notch - kerf_h * kerf_h, 0.0))
    for sgn in (-1.0, 1.0):  # kerf faces run to the outer edge (−177.8, off-sheet) — clipped at the frame
        sh.line(*P(sgn * kerf_h, y_apex), *P(sgn * kerf_h, -150.0), "#6a4a1a", 1.1)
    sh.line(*P(-140.0, -lipw), *P(-d_lip, -lipw), "#6a4a1a", 0.8, dash="6 3")
    sh.line(*P(d_lip, -lipw), *P(140.0, -lipw), "#6a4a1a", 0.8, dash="6 3")
    sh.text(*P(kerf_h + 4, -band + 8), f"CP-15 kerf {Sheet.f(cp15['kerf_mm'])} on the pocket axis", 8.2, fill="#6a4a1a")
    sh.text(*P(d_lip + 4, -lipw - 8), f"cap notch r{Sheet.f(r_notch)} = boot R (SP-10)"
            + (f" about the MODEL ring centre {Sheet.f(rps['centre'])} behind the nose (D621-PLAN-1)" if rps else ""), 8.2, fill="#6a4a1a")
    # SL-01 slate opening
    sl = f["SL-01"]["value"] if "SL-01" in f else None
    sl_txt = "SL-01 absent on this sheet"
    if sl is not None:
        R_o = sl["radius_mm"]
        c_o = (0.0, -sl["centre_outboard_of_nose_line_mm"])
        half_m = m / 2.0
        tan_dev = math.tan(math.radians(dev))

        def f_edge(dz):
            return math.sqrt(max(0.0, R_o * R_o - (-c_o[1] - dz) ** 2)) - (half_m + dz * tan_dev)

        lo, hi = sl["apex_shelf_mm"], -c_o[1]
        for _ in range(60):
            mid = (lo + hi) / 2.0
            if f_edge(mid) < 0:
                lo = mid
            else:
                hi = mid
        dz_c = (lo + hi) / 2.0
        lat_c = half_m + dz_c * tan_dev
        a_r = math.atan2(-dz_c - c_o[1], lat_c)
        a_l = math.atan2(-dz_c - c_o[1], -lat_c)
        a_clip = math.asin(max(-1.0, min(1.0, (-150.0 - c_o[1]) / R_o)))  # keep the dashed circle above the frame
        arc_path(sh, P, c_o, R_o, a_clip, math.pi - a_clip, "#2a6a9a", 0.7, dash="2 4", n=96)
        arc_path(sh, P, c_o, R_o, a_r, a_l, "#2a6a9a", 1.3, n=48)
        sh.text(*P(-lat_c - 4, -dz_c - 10),
                f"SL-01 slate opening r{Sheet.f(R_o)} about (0, −{Sheet.f(-c_o[1])}); apex shelf {Sheet.f(sl['apex_shelf_mm'])} "
                f"(MODEL r; apex MFR-clamped from −9.0 to the WPA band [0, 9.5])", 8.2, fill="#2a6a9a")
        sh.text(*P(-lat_c - 4, -dz_c - 19),
                f"roll {Sheet.f(sl['roll_radius_mm'])} from the apex to the facing feet — edge meets the foot "
                f"{Sheet.f(dz_c)} behind the nose at lateral {Sheet.f(lat_c)}", 8.2, fill="#2a6a9a")
        sl_txt = (f"SL-01 slate opening r{Sheet.f(R_o)}, centre {Sheet.f(-c_o[1])} outboard of the nose line, apex shelf "
                  f"{Sheet.f(sl['apex_shelf_mm'])}; roll {Sheet.f(sl['roll_radius_mm'])} ends at the facing feet "
                  f"({Sheet.f(dz_c)} behind the nose)")
        solved["side_slate_opening"] = {"radius_mm": R_o, "centre": list(c_o), "apex_shelf_mm": sl["apex_shelf_mm"],
                                        "roll_ends_behind_nose_mm": dz_c, "roll_ends_lateral_mm": lat_c}
    collar_txt = (
        (f"SP-10 boot D-ring (MODEL leather06 circles, D621-PLAN-1): wall R {Sheet.f(rps['r_out'])} about {Sheet.f(rps['centre'])} behind the nose, "
         f"throat r {Sheet.f(rps['r_throat'])} about {Sheet.f(rps['throat_centre'])}, inner edges {Sheet.f(rps['leg_inner'])}; front face = the CU-10 glue plane "
         f"({Sheet.f(rps['glue_nose'])} at the nose height, DERIVED; legs {Sheet.f(side_ring['leg_run_outer_mm'])}); wall top +{Sheet.f(sp10['outer_wall_top_mm'])}, "
         f"crest +{Sheet.f(sp10['crest_above_bed_mm'])}, skirt to −{Sheet.f(sp10['skirt_below_bed_mm'])}"
         + (f"; top by bearing (MODEL, D621-PLAN-2): crest → +{Sheet.f(sp10['top_profile']['by_bearing'][-1][1][0])}, "
            f"wall → +{Sheet.f(sp10['top_profile']['by_bearing'][-1][1][-1])} at the tangent rows" if sp10.get('top_profile') else ""))
        if rps else
        (f"SP-10 boot D-ring (MODEL leather06): throat rT {Sheet.f(lip_r)} (rw {Sheet.f(rw)} − lip {Sheet.f(sp10['lip_overhang_mm'])}), "
         f"outer wall R {Sheet.f(land_r)}, wall top +{Sheet.f(sp10['outer_wall_top_mm'])}, crest +{Sheet.f(sp10['crest_above_bed_mm'])}, "
         f"skirt to −{Sheet.f(sp10['skirt_below_bed_mm'])}; flat front face on the tangent line, leg run {Sheet.f(sp10['leg_run_mm'])} (no legs)"))
    notch_txt = (f"cap notch r{Sheet.f(land_r)} about the capture centre, kerf {Sheet.f(cp15['kerf_mm'])} on the pocket axis (CP-15); "
                 "SP-11 liner RETIRED (r6) — the D-ring stands on the cap lip")
    open_txt = (f"boot bottom OPEN → trap cup PC-01 (CP-12; MODEL: half-width {Sheet.f(val(f, 'PC-01')['half_width_mm'])}, "
                f"{Sheet.f(val(f, 'PC-01')['inboard_run_from_ring_centre_mm']['side'])} inboard) · {sl_txt}")
    for yy, col, txt in ((1002, "#8a5a1a", collar_txt), (1018, "#6a4a1a", notch_txt), (1034, "#1d7a38", open_txt)):
        sh.text(60, yy, txt, 8.2, fill=col)

    sh.letters_table(46, 96, 760, "S2 letters — side pocket (value · tier · scope · source)", [
        row_of(f, "SP-01", f"mouth {Sheet.f(m)} (5.0 in)"),
        row_of(f, "SP-02", f"facing {Sheet.f(val(f, 'SP-02'))}° (dev {Sheet.f(dev)})"),
        row_of(f, "SP-03", f"facing pad {Sheet.f(pad)}"),
        row_of(f, "SP-04", f"shelf {Sheet.f(shelf)} ASSUMPTION"),
        row_of(f, "SP-05", f"throat {Sheet.f(val(f, 'SP-05'))}"),
        row_of(f, "SP-06", f"jaw r {Sheet.f(val(f, 'SP-06'))}"),
        row_of(f, "SP-07", f"disc r {Sheet.f(r)}"),
        row_of(f, "SP-08", f"depth {Sheet.f(depth)}"),
        row_of(f, "SP-09", f"under-cut {Sheet.f(val(f, 'SP-09'))}° render"),
        row_of(f, "SP-10", f"D-ring R {Sheet.f(rps['r_out'])} @ {Sheet.f(rps['centre'])} / throat r {Sheet.f(rps['r_throat'])}" if rps
               else f"D-ring rT {Sheet.f(lip_r)} / R {Sheet.f(land_r)}"),
        row_of(f, "SP-11", "RETIRED r6 — D-ring on the lip"),
    ] + ([row_of(f, "SL-01", f"r{Sheet.f(sl['radius_mm'])} @ {Sheet.f(sl['centre_outboard_of_nose_line_mm'])} out · shelf {Sheet.f(sl['apex_shelf_mm'])}")]
         if sl is not None else []) + [
        row_of(f, "PC-01", f"cup {Sheet.f(val(f, 'PC-01')['half_width_mm'])} × {Sheet.f(val(f, 'PC-01')['inboard_run_from_ring_centre_mm']['side'])}"),
    ])
    solved["side"] = {
        "mouth_points": [list(pr), list(plft)],
        "jaw_centers": [list(jr), list(jlf)],
        "facing_tangencies": [list(fr), list(flf)],
        "facing_ends": [list(er), list(elf)],
        "construction": {k: ks[k] for k in ("ds", "sjb", "sa_deg")},
        "jaw_collision": "FULL circle per arc (span: None in from_pocket_spec); the P→F sweep is the physical face only",
        "disc_center": list(c), "disc_radius": r,
    }
    if u_form is not None:
        solved["side"]["boot_u_form"] = {
            "frame": "side-pocket local mm: nose line y = 0, mouth centred on x = 0, pocket toward "
                     "−y; radii about the capture centre disc_center",
            "center": list(c),
            **u_form,
        }
    sh.title_block("S2 note: SP-01/SP-04 carry documented inference/assumption status — upgrade path is the "
                   "installed-state top-down measure (open item O3), never a silent repin")
    return sh.finish()


def sheet_cushion(doc, f, sha, solved, src) -> str:
    sh = Sheet("S3", "cushion profile section — Artemis No. 66 rubber, K55 profile", doc, sha,
               "drawn ≈9 px/mm", src)
    ball = val(f, "PF-04")
    z_nose = val(f, "CU-03")
    cw = val(f, "CU-04")
    trace = f["CU-12"]["value"]
    nose_r = val(f, "CU-11")
    z_rail = val(f, "CU-09")
    z_cap, z_ext = val(f, "RB-02"), val(f, "EN-04")
    band = val(f, "RB-01")

    sc = 9.0
    ox, oy = 560.0, 830.0  # px of (o=0, z=0); o grows right (behind nose), z up

    def P(o, z):
        return (ox + o * sc, oy - z * sc)

    # bed / datum A
    sh.line(*P(-56, 0), *P(120, 0), "#111", 1.6)
    sh.text(*P(-52, -6), "datum A — playing surface z=0 (cloth top)", 8.6, fill="#666")

    # renderer nose-height remap (table.js cushionProfile): the trace is
    # authored against its own zNose reference; below-nose elevations SCALE
    # by z_nose/zRef and above-nose elevations SHIFT rigidly by the delta so
    # the mesh apex sits exactly on the kernel plane. Applied here so S3 and
    # the twin match the rendered profile even when CU-03 and CU-12 diverge.
    # cushionProfile() row construction, ported VERBATIM (table.js): below
    # rows scale in z (bed pinned), o clamps to cw − plan-depth clamp;
    # tangent ANGLES from the last-below / first-above vertices to the nose
    # arc; NA arc rows with the apex row pushed EXACT at i = NA/2; above
    # rows shift rigidly; the profile ENDS at the top row (oTop, zTop) —
    # the rail cap behind it is separate geometry.
    z_ref = trace["zNose"]
    z_scale = z_nose / z_ref
    z_shift = z_nose - z_ref
    clamp_o = cw - trace["plan_depth_clamp_mm"]

    def c_o(o):
        return min(o, clamp_o)

    rows = [(c_o(q["o_mm"]), q["z_mm"] * z_scale) for q in trace["below"]]
    base = rows[0]
    below = list(rows)
    p_lo = rows[-1]
    p_hi = (c_o(trace["above"][0]["o_mm"]), trace["above"][0]["z_mm"] + z_shift)

    def tang(pt, upper):
        dx, dzz = pt[0] - nose_r, pt[1] - z_nose
        half = math.acos(min(1.0, nose_r / math.hypot(dx, dzz)))
        return math.atan2(dzz, dx) + (half if upper else -half)

    t_lower = tang(p_lo, False) + 2.0 * math.pi  # ∈ (π, 2π)
    t_upper = tang(p_hi, True)                   # ∈ (π/2, π)
    na_arc = trace["arc_rows"]                   # 24 on us_pool_k55 (render NA)
    for i in range(na_arc + 1):
        if i == na_arc // 2:
            rows.append((0.0, z_nose))           # apex row pushed EXACT
            continue
        if i < na_arc // 2:
            t = t_lower + (math.pi - t_lower) * (i / (na_arc / 2.0))
        else:
            t = math.pi + (t_upper - math.pi) * ((i - na_arc / 2.0) / (na_arc / 2.0))
        rows.append((nose_r + nose_r * math.cos(t), z_nose + nose_r * math.sin(t)))
    above = [(c_o(q["o_mm"]), q["z_mm"] + z_shift) for q in trace["above"]]
    rows.extend(above)
    o_top, z_top = rows[-1]
    d = "M " + " L ".join(f"{Sheet.c(P(*q)[0])} {Sheet.c(P(*q)[1])}" for q in rows)
    sh.path(d, "#111", 2.0)
    status = f["CU-11"].get("status", "")
    sh.text(*P(6, z_nose + 9),
            f"nose apex o=0 (CU-11 r{Sheet.f(nose_r)}{' ' + status if status else ''})", 8.4, fill="#555")

    # rail planes (broken at o=118 — the full RB-01 band is off this scale);
    # the rubber-plane line continues from the profile TOP ROW (remapped
    # zTop) — the 44.45 callout is the CU-09 feature value, twin records
    # the z_shift delta.
    o_break = 118.0
    sh.line(*P(o_top, z_top), *P(o_break, z_rail), "#5a3a1a", 1.2)
    sh.text(*P(o_break - 58, z_rail - 3), f"CU-09 rubber-rail plane {Sheet.f(z_rail)} (field, C4)", 8.2, fill="#5a3a1a")
    # GH-488D wave A2.5 (A11): RB-02 and EN-04 name the SAME plane whenever the
    # spec says so (r2: both 50.8).  Drawing them as two lines was correct under
    # the r1 three-plane reading of C4 and becomes a DEFECT the instant they
    # coincide — two dashed lines at an identical y, in two colours, each with
    # its own callout, is precisely the ambiguity a fully-constrained drawing
    # may not contain, and the reader cannot tell whether the sheet means one
    # plane or two that failed to separate.  Decided from the VALUES, so the
    # sheet splits back automatically if a later revision separates them again.
    if abs(z_cap - z_ext) < 1e-9:
        sh.line(*P(cw - 6, z_cap), *P(o_break, z_cap), "#0a5a8a", 1.2, dash="14 4 2.5 4")
        sh.text(*P(o_break - 58, z_cap - 3),
                f"RB-02 = EN-04 rail top {Sheet.f(z_cap)}"
                f"{status_note(f, 'RB-02')} — ONE plane (C4; r6 = the model's cap plateau)", 8.2, fill="#0a5a8a")
        sh.text(*P(o_break - 58, z_cap + 2.5),
                f"= {Sheet.f(val(f, 'EN-02'))} − {Sheet.f(val(f, 'EN-03'))} (official "
                f"anchor); cap = {Sheet.f(z_cap - z_rail)} above CU-09", 8.2, fill="#888")
        planes = (z_rail, z_cap)
    else:
        sh.line(*P(cw - 6, z_cap), *P(o_break, z_cap), "#0a5a8a", 1.0, dash="7 4")
        sh.line(*P(cw - 6, z_ext), *P(o_break, z_ext), "#888", 0.9, dash="14 4 2.5 4")
        sh.text(*P(o_break - 58, z_cap - 3),
                f"RB-02 wood cap {Sheet.f(z_cap)}{status_note(f, 'RB-02')} "
                f"(render pin, C4)", 8.2, fill="#0a5a8a")
        sh.text(*P(o_break - 58, z_ext + 2),
                f"EN-04 stack extreme {Sheet.f(z_ext)} (= {Sheet.f(val(f, 'EN-02'))} − "
                f"{Sheet.f(val(f, 'EN-03'))}, official anchor)", 8.2, fill="#888")
        planes = (z_rail, z_cap, z_ext)
    # break marks + RB-01 note (band continues off-sheet)
    for zz in planes:
        sh.line(*P(o_break, zz - 2.2), *P(o_break + 3, zz + 2.2), "#555", 0.9)
    sh.text(*P(o_break - 58, z_rail - 9),
            f"→ rail band continues to RB-01 {Sheet.f(band)} (S4)", 8.2, fill="#888")

    # featherstrip — the datum runs the full rail stack, so its top must clear
    # the HIGHEST plane the section draws, not CU-09.  Under r1 (cap 47.0) the
    # old z_rail + 4 = 48.45 sat above every line; the r2 repin lifted the rail
    # top to 50.8 and left this datum stopping 2.35 mm SHORT, in empty space,
    # which reads as a real edge that isn't there.  Tie it to the drawn planes.
    sh.line(*P(cw, max(z_rail, z_cap, z_ext) + 4), *P(cw, -14), "#666", 0.8, dash="14 4 2.5 4")
    sh.dim(*P(0, -20), *P(cw, -20), f"CU-04 cushion width {Sheet.f(cw)} (2 in, featherstrip → nose)", off=0)

    # sub-rail bevel (23.5° from vertical, backing face under the rubber)
    bev = math.radians(val(f, "CU-10"))
    b0 = (base[0], 0.0)
    b1 = (base[0] + math.tan(bev) * 34.0, 34.0)
    sh.line(*P(*b0), *P(*b1), "#7a3a10", 1.3, dash="6 3")
    sh.text(*P(b1[0] + 2, b1[1] - 4),
            f"CU-10 sub-rail bevel {Sheet.f(val(f, 'CU-10'))}° "
            f"({Sheet.f(f['CU-10']['band_deg'][0])}° red label; re-measure O2)",
            8.2, fill="#7a3a10")

    # cloth relief
    crease_z = below[1][1] if len(below) > 1 else 0.0
    sh.text(*P(base[0] + 2, 4.5),
            f"cloth relief: drawn at the CU-12 trace crease {Sheet.f(crease_z)} (render); published "
            f"CU-08 {Sheet.f(val(f, 'CU-08'))} (1/16 in) — Δ disclosed", 8.2, fill="#555")

    # ball ghost at contact
    bz = ball / 2.0
    dxb = math.sqrt(bz * bz - (z_nose - bz) ** 2)
    sh.circle(*P(-dxb, bz), bz * sc, "#1d7a38", 1.0, dash="6 4")
    sh.line(*P(-42, z_nose), *P(14, z_nose), "#1d7a38", 0.7, dash="3 4")
    sh.dim(*P(-40, 0), *P(-40, z_nose), "", off=0, fill="#1d7a38")
    sh.text(*P(-38, 20), f"CU-03 nose height {Sheet.f(z_nose)}", 8.8, fill="#1d7a38", weight="600")
    sh.text(*P(-38, 15), "= 63.889% ball (kernel pin; C5)", 8.0, fill="#1d7a38")
    sh.text(*P(-dxb - 10, bz + 6), f"ball PF-04 ⌀{Sheet.f(ball)}", 8.4, fill="#1d7a38")

    # K55 rubber section letters (annotations; exact strip outline = OEM photos)
    sh.text(1052, 700, "K55 rubber section (Championship K-55 Tour Edition guide, FIG 3 = 64% variant):",
            10, weight="700", fill="#0a2a6a")
    for i, ln in enumerate([
        f"CU-05 top face {Sheet.f(val(f, 'CU-05'))} (1 1/4 in) · CU-06 back height "
        f"{Sheet.f(val(f, 'CU-06'))} (1 5/16 in) · CU-07 core bevel {Sheet.f(val(f, 'CU-07'))}°",
        "CU-01 rubber = Artemis Intercontinental No. 66 (MFR verbatim; 9/10 ft Diamond) — K55 is the PROFILE name",
        "CU-02 render family us_pool_k55; CU-12 trace: below "
        + " ".join(f"({Sheet.f(q['o_mm'])},{Sheet.f(q['z_mm'])}{' crease' if q.get('crease') else ''})"
                   for q in trace["below"])
        + " · above " + " ".join(f"({Sheet.f(q['o_mm'])},{Sheet.f(q['z_mm'])})" for q in trace["above"]),
        "section truth photos: 03-rails-hardware/oem-artemis-ic66-k55-cushion-01..03.jpg (3000 px, 3 bearings)",
    ]):
        sh.text(1052, 718 + 15 * i, ln, 8.8, fill="#333")

    sh.letters_table(46, 96, 760, "S3 letters — cushion section (value · tier · scope · source)", [
        row_of(f, "CU-01", "Artemis No. 66 rubber"),
        row_of(f, "CU-02", "K55 profile family"),
        row_of(f, "CU-03", f"nose height {Sheet.f(z_nose)}"),
        row_of(f, "CU-04", f"cushion width {Sheet.f(cw)}"),
        row_of(f, "CU-05", f"rubber top {Sheet.f(val(f, 'CU-05'))}"),
        row_of(f, "CU-06", f"rubber back {Sheet.f(val(f, 'CU-06'))}"),
        row_of(f, "CU-07", f"core bevel {Sheet.f(val(f, 'CU-07'))}°"),
        row_of(f, "CU-08", f"cloth relief {Sheet.f(val(f, 'CU-08'))}"),
        row_of(f, "CU-09", f"rubber plane {Sheet.f(z_rail)}"),
        row_of(f, "CU-10", f"sub-rail bevel {Sheet.f(val(f, 'CU-10'))}°"),
        row_of(f, "CU-11", f"nose r {Sheet.f(nose_r)}"),
        row_of(f, "CU-13", f"backing wood {Sheet.f(val(f, 'CU-13'))}"),
    ])
    solved["cushion_section"] = {
        "nose_arc_center": [nose_r, z_nose], "nose_arc_radius": nose_r,
        "trace_remap": {"z_ref": z_ref, "z_scale": z_scale, "z_shift": z_shift},
        "rows": [list(q) for q in rows],
        "tangent_angles": {"lower": t_lower, "upper": t_upper},
        "arc_rows": na_arc, "top_row": [o_top, z_top],
        "ball_ghost_center": [-dxb, bz],
    }
    sh.title_block("S3 note: nose height fraction is the kernel-collision value; the K55 strip outline is "
                   "render-only — Dr. Dave's 'lower + angled-down' Diamond nose stays a CALIBRATION band (C5)")
    return sh.finish()


def _partition_contiguous(items: list, lens: list[int], k: int) -> list[list]:
    """Split `items` (kept in order) into k contiguous groups minimising the largest group's total length
    (linear partition, O(n²k) DP — n is a few dozen). Empty trailing groups are allowed."""
    n = len(items)
    if n == 0:
        return [[] for _ in range(k)]
    pre = [0]
    for v in lens:
        pre.append(pre[-1] + v)
    INF = float("inf")
    # best[j][i] = minimal max-sum splitting the first i items into j groups
    best = [[INF] * (n + 1) for _ in range(k + 1)]
    cut = [[0] * (n + 1) for _ in range(k + 1)]
    best[0][0] = 0
    for j in range(1, k + 1):
        for i in range(0, n + 1):
            for m in range(0, i + 1):
                if best[j - 1][m] == INF:
                    continue
                cand = max(best[j - 1][m], pre[i] - pre[m])
                if cand < best[j][i]:
                    best[j][i], cut[j][i] = cand, m
    groups: list[list] = []
    i = n
    for j in range(k, 0, -1):
        m = cut[j][i]
        groups.append(items[m:i])
        i = m
    groups.reverse()
    return groups


def sheet_elevation(doc, f, sha, solved, src) -> str:
    sh = Sheet("S4", "rail / apron / envelope — transverse half-elevation + conflict ledger", doc, sha,
               "drawn ≈0.72 px/mm", src)
    length, width = val(f, "PF-01")
    band = val(f, "RB-01")
    env_l, env_w = val(f, "EN-01")
    z_floor = -val(f, "EN-03")
    z_ext = val(f, "EN-04")
    clear = val(f, "EN-06")
    slate = val(f, "PF-02")
    leg_half = val(f, "EN-05")[1] / 2.0

    sc = 0.72
    ox, oy = 250.0, 420.0  # px of (w=0 centreline, z=0 bed)

    def P(w, z):
        return (ox + w * sc, oy - z * sc)

    half_pf, half_env = width / 2.0, env_w / 2.0
    # centreline
    sh.line(*P(0, 90), *P(0, z_floor - 30), "#666", 0.8, dash="14 4 2.5 4")
    sh.text(*P(4, 84), "datum B — table centreline", 8.6, fill="#666")
    # floor
    sh.line(*P(-40, z_floor), *P(half_env + 160, z_floor), "#444", 1.4)
    sh.text(*P(half_env + 60, z_floor - 8), "floor", 8.6, fill="#444")
    # bed + slate + backer
    sh.line(*P(0, 0), *P(half_pf, 0), "#111", 1.8)
    sh.rect(*P(0, 0), (half_pf + band * 0.7) * sc, slate * sc, fill="#e8e2d2", stroke="#333", sw=0.9)
    sh.text(*P(30, -slate - 10),
            f"PF-02 slate {Sheet.f(slate)} (1 in, 1-pc/3-pc) + ≥3/4 in wood backer (WPA §4)", 8.4, fill="#555")
    # rail band + stack
    sh.rect(*P(half_pf, z_ext), band * sc, (z_ext + 20) * sc, fill="#e8d9c2", stroke="#111", sw=1.2)
    sh.line(*P(half_pf, 0), *P(half_pf, 60), "#666", 0.7, dash="10 4 2 4")
    # GH-621: the inch call-outs are COMPUTED from the values (25.4 mm/in,
    # `:g` = shortest exact rendering) so the same sheet code serves the 8 ft
    # and 7 ft definitions; on the 9 ft input they render the literals the
    # r2 sheet carried ("635", "64", "32", "15", "49.75") byte-for-byte.
    inch = lambda mm: f"{mm / 25.4:g}"  # noqa: E731
    sh.text(*P(half_pf - 4, 66), f"nose plane (playing surface {half_pf:g} half-width)", 8.2, fill="#666", anchor="end")
    sh.dim(*P(half_pf, 66), *P(half_env, 66), f"RB-01 {Sheet.f(band)} (C3)", off=0)
    sh.dim(*P(0, 92), *P(half_env, 92), f"EN-01 half overall {Sheet.f(half_env)} ({inch(env_w)} in / 2 hard extreme)", off=0)
    sh.dim(*P(-26, z_floor), *P(-26, 0), f"EN-03 bed {Sheet.f(-z_floor)} (derived, C4)", off=0)
    sh.dim(*P(half_env + 40, z_floor), *P(half_env + 40, z_ext),
           f"EN-02 overall {Sheet.f(val(f, 'EN-02'))} ({inch(val(f, 'EN-02'))} in official)", off=0)
    # apron / skirt (recessed face, TO-BE-MEASURED)
    skirt_w = half_env - 22.0
    sh.line(*P(skirt_w, -20), *P(skirt_w, z_floor + clear), "#0a5a8a", 1.2, dash="7 4")
    sh.line(*P(skirt_w, z_floor + clear), *P(half_pf - 60, z_floor + clear), "#0a5a8a", 1.2)
    sh.text(*P(half_pf + 8, z_floor + clear - 8),
            f"skirt bottom · EN-06 floor→skirt {Sheet.f(clear)} ({inch(clear)} in official)", 8.4, fill="#0a5a8a")
    sh.text(*P(skirt_w - 10, -300), "apron face recessed inboard of EN-01 (cn8 envelope law; station TO-BE-MEASURED O3)",
            8.2, fill="#0a5a8a", rot=-90)
    # leg
    sh.rect(*P(leg_half - 45, z_floor + clear), 90 * sc, (clear) * sc, fill="#dfd7c6", stroke="#333", sw=1.0)
    sh.dim(*P(0, z_floor + 24), *P(leg_half, z_floor + 24),
           f"EN-05 leg half-spacing {Sheet.f(leg_half)} ({inch(val(f, 'EN-05')[1])} in / 2)", off=0)
    sh.text(*P(leg_half - 45, z_floor + 12), "EN-07 leveler (3/4 in wrench) · 22-pt wedge leveling",
            8.2, fill="#555")
    # ball return (schematic, render-only)
    sh.line(*P(half_pf + 20, -slate - 30), *P(120, -slate - 90), "#1d7a38", 1.1, dash="9 4")
    sh.text(*P(96, -slate - 104),
            "BR-01 gravity ball return: open boot → rubber-lined channels → foot-end collector (MFR verbatim; render-only)",
            8.4, fill="#1d7a38")
    sh.text(*P(96, -slate - 118),
            f"BR-02 boot lower opening ≥ ⌀{Sheet.f(val(f, 'PF-04'))} + clearance, TO-BE-MEASURED (O3) — "
            "NEW topology vs 489 net / 490 ring",
            8.2, fill="#1d7a38")

    # sight detail inset (plan, RB-03/04/05 — not visible in the elevation)
    ix, iy = 60, 700
    sh.rect(ix, iy, 470, 190, fill="#fbf9f2", stroke="#4a6a8a", sw=0.9)
    sh.text(ix + 10, iy + 17, "DETAIL A — rail sights (plan, ×2)", 10, weight="700", fill="#0a2a6a")
    isc = 0.62
    nose_y = iy + 150
    sh.line(ix + 16, nose_y, ix + 454, nose_y, "#111", 1.6)
    sh.text(ix + 16, nose_y + 13, "nose line", 8.2, fill="#666")
    inset_px = val(f, "RB-03") * isc
    spacing_px = val(f, "RB-04") * isc
    rw, rh = val(f, "RB-05")[1] * isc * 2, val(f, "RB-05")[0] * isc * 2
    for k in (-1, 0, 1):
        cxr = ix + 235 + k * spacing_px
        cyr = nose_y - inset_px
        sh.path(f"M {Sheet.c(cxr - rw / 2)} {Sheet.c(cyr)} L {Sheet.c(cxr)} {Sheet.c(cyr - rh / 2)} "
                f"L {Sheet.c(cxr + rw / 2)} {Sheet.c(cyr)} L {Sheet.c(cxr)} {Sheet.c(cyr + rh / 2)} Z",
                "#7a3a10", 1.0, fill="#e8d9c2")
    sh.dim(ix + 235, nose_y, ix + 235, nose_y - inset_px,
           f"RB-03 inset {Sheet.f(val(f, 'RB-03'))}", off=-58)
    sh.dim(ix + 235, nose_y - inset_px, ix + 235 + spacing_px, nose_y - inset_px,
           f"RB-04 spacing {Sheet.f(val(f, 'RB-04'))} (= L/8)", off=24)
    sh.text(ix + 10, iy + 36,
            f"RB-05 rhombus {Sheet.f(val(f, 'RB-05')[0])} × {Sheet.f(val(f, 'RB-05')[1])} "
            "mother-of-pearl (COM, drawn ×2)", 8.4, fill="#555")

    # conflict ledger panel — wrapped, and the panel is SIZED from the wrapped
    # line count (see wrap_text: r2 made every fixed truncation cap a live
    # defect).  Every entry is drawn COMPLETE; if the ledger ever outgrows the
    # sheet the generator aborts instead of overflowing or cutting.
    cx0, cy0, cw0 = 900, 96, 736
    conf_body = [wrap_text("→ " + c["adjudication"], 118) for c in doc["conflicts"]]
    # r6: the open-item list grew to 20 rows (O9–O20, longer still on the
    # derived 8/7 ft sheets); the panel keeps every entry COMPLETE in two
    # columns (three since ALIGN-2, 6.2 px on 9 px lines) — the budget assertion below still decides,
    # never truncation
    # r6: 20 open items — laid out in TWO columns (80-char wrap, 7.2 px on
    # 11 px lines); the panel height follows the taller column
    # budget datum = the drawn floor plane, the lowest thing the elevation puts
    # under this panel's x-band, less a 28 px gutter
    panel_budget = P(0, z_floor)[1] - 28 - cy0
    # D621-PLAN-1: the open-item list keeps growing (O23 on every sheet; the
    # derived 8/7 ft sheets carry longer per-size rows) — the panel now picks
    # the first column layout that publishes every entry COMPLETE within the
    # budget: three 60-char columns (ALIGN-2's layout, byte-identical when it
    # fits), else four 46-char columns on 8 px lines, else five 38-char
    # columns on 7.5 px lines, else (D621-PLAN-2: O24 and the O21 / O23
    # dispositions) six 37-char columns on 6.6 px lines, else seven 35-char
    # columns on 6.2 px lines (wrap ≈ 0.8 × pitch / (0.55 × font), as the
    # earlier layouts fill their columns). The assertion below
    # still decides; truncation never does.
    LAYOUTS = [dict(cols=3, wrap=60, line=9, font=6.2, xoffs=(0, 242, 484)),
               dict(cols=4, wrap=46, line=8, font=5.6, xoffs=(0, 182, 364, 546)),
               dict(cols=5, wrap=38, line=7.5, font=5.2, xoffs=(0, 146, 292, 438, 584)),
               dict(cols=6, wrap=37, line=6.6, font=4.7, xoffs=(0, 122, 244, 366, 488, 610)),
               dict(cols=7, wrap=35, line=6.2, font=4.3, xoffs=(0, 105, 210, 315, 420, 525, 630))]
    for LAY in LAYOUTS:
        open_body = [wrap_text(f"{i['id']} ({i['owner_wave']}): {i['item']}", LAY["wrap"])
                     for i in doc["open_items"]]
        # balance the columns by LINE count, not item count — the items stay in
        # ledger order (O1 … On left to right) and the column breaks are the
        # contiguous partition that minimises the tallest column (DP), so one
        # long item (O22) no longer decides the panel height by landing late
        lens = [len(b) for b in open_body]
        open_cols = _partition_contiguous(open_body, lens, LAY["cols"])
        col_lines = max(sum(len(b) for b in col) for col in open_cols) if open_body else 0
        panel_h = (40
                   + sum(18 + 12 * len(b) for b in conf_body)
                   + 24 + 18
                   + LAY["line"] * col_lines
                   + 10)
        if panel_h <= panel_budget:
            break
    if panel_h > panel_budget:
        raise AssertionError(
            f"S4 conflict ledger needs {panel_h} px but the sheet allows "
            f"{panel_budget} px — the ledger text grew past what this panel can "
            "publish COMPLETE. Fix the layout (or split the panel); do NOT "
            "reintroduce truncation, which silently ships cut claims.")
    sh.rect(cx0, cy0, cw0, panel_h, fill="#fbf6f0", stroke="#8a5a1a", sw=1.0)
    sh.text(cx0 + 12, cy0 + 20, "Conflict ledger + adjudications (verbatim from the source JSON `conflicts`)",
            11, weight="700", fill="#7a3a10")
    yy = cy0 + 40
    for conf, body in zip(doc["conflicts"], conf_body):
        sh.text(cx0 + 12, yy, f"{conf['id']} — {conf['name']}", 8.8, weight="700", fill="#8a1010")
        for k, line_txt in enumerate(body):
            sh.text(cx0 + 12 if k == 0 else cx0 + 22, yy + 12 + 12 * k, line_txt, 8.4, fill="#333")
        yy += 18 + 12 * len(body)
    sh.text(cx0 + 12, yy + 6, "adjudication rules (task law): photo-measured > marketing copy; "
            "official drawings > both", 8.6, weight="600", fill="#7a3a10")
    yy += 24
    sh.text(cx0 + 12, yy + 4, "open items:", 9, weight="700", fill="#0a2a6a")
    yy += 18
    for col, xoff in zip(open_cols, LAY["xoffs"]):
        yy2 = yy
        for body in col:
            for k, line_txt in enumerate(body):
                sh.text(cx0 + 12 + xoff + (0 if k == 0 else 8), yy2, line_txt, LAY["font"], fill="#555")
                yy2 += LAY["line"]
    yy += LAY["line"] * col_lines

    pf = val(f, "PF-01")
    en1 = val(f, "EN-01")
    en5 = val(f, "EN-05")
    rb5 = val(f, "RB-05")
    sh.letters_table(46, 96, 760, "S4 letters — envelope / rail band (value · tier · scope · source)", [
        row_of(f, "PF-01", f"playfield {Sheet.f(pf[0])} × {Sheet.f(pf[1])}"),
        row_of(f, "PF-02", f"slate {Sheet.f(slate)}"),
        row_of(f, "RB-01", f"rail band {Sheet.f(band)}"),
        row_of(f, "RB-02", f"rail top {Sheet.f(val(f, 'RB-02'))}{status_note(f, 'RB-02')}"),
        row_of(f, "RB-03", f"sight inset {Sheet.f(val(f, 'RB-03'))}"),
        row_of(f, "RB-04", f"sight spacing {Sheet.f(val(f, 'RB-04'))}"),
        row_of(f, "RB-05", f"sight rhombus {Sheet.f(rb5[0])}×{Sheet.f(rb5[1])}"),
        row_of(f, "EN-01", f"overall {Sheet.f(en1[0])} × {Sheet.f(en1[1])}"),
        row_of(f, "EN-02", f"height {Sheet.f(val(f, 'EN-02'))}"),
        row_of(f, "EN-03", f"bed {Sheet.f(-z_floor)} derived"),
        row_of(f, "EN-05", f"legs {Sheet.f(en5[0])} × {Sheet.f(en5[1])}"),
        row_of(f, "EN-06", f"clearance {Sheet.f(clear)}"),
        row_of(f, "BR-01", "ball return topology"),
    ])
    solved["elevation"] = {
        "half_playfield": half_pf, "half_envelope": half_env,
        "bed_above_floor": -z_floor, "rail_stack_extreme": z_ext,
    }
    sh.title_block("S4 note: C3 consequence disclosed — the current render frameWidth chain realizes the poster "
                   "7 1/4 in band; re-anchoring the mesh to RB-01 is wave D-A3 model work, zero scene bytes here")
    return sh.finish()


# ---------------------------------------------------------------- stroke suite


def stroke_suite_stub(doc: dict) -> dict:
    """S1-S4-style stroke-suite conformance hook — declared STUB (wave D-A3).

    The 489/490 lanes judge sheets with a stroke-class suite (line classes,
    weights, dash grammar) wired into the drawing-law gates. That instrument
    is forked per-table in wave D-A3 (see FORKS.md in the Drive folder); until
    it lands this generator reports SKIPPED so the gap is explicit, never
    silently green.
    """
    return {
        "status": "SKIPPED (STUB)",
        "reason": doc["stroke_suite"]["note"],
    }


# ---------------------------------------------------------------- main


def generate(source_path: Path) -> tuple[dict[str, str], dict]:
    doc, sha, _raw = load_source(source_path)
    # provenance label = the ACTUAL input (repo-relative when applicable) so
    # a copied/edited --input can never masquerade as the canonical path
    resolved = source_path.resolve()
    try:
        src = resolved.relative_to(repo_root()).as_posix()
    except ValueError:
        src = str(resolved)
    features = feature_map(doc)
    solved: dict = {}
    checks: list[tuple[str, bool, str]] = []
    derived = run_checks(features, checks)
    sheets = {
        "s1-corner": sheet_corner(doc, features, sha, solved, src),
        "s2-side": sheet_side(doc, features, sha, solved, src),
        "s3-cushion-section": sheet_cushion(doc, features, sha, solved, src),
        "s4-rail-apron-elevation": sheet_elevation(doc, features, sha, solved, src),
    }
    rev = doc["doc"]["revision"]
    # GH-621: output names carry the definition's own slug so the three sizes
    # can never overwrite each other; absent (the 9 ft definition) = "488d",
    # which reproduces the r1/r2 file names byte-for-byte.
    slug = doc["doc"].get("drawing_slug", "488d")
    files = {f"pocket-drawing-{slug}-{rev}-{name}.svg": svg for name, svg in sheets.items()}
    twin = {
        "id": f"gh{slug}-solved-{rev}",
        "generator": GENERATOR_ID,
        "source": src,
        "source_sha256": sha,
        "doc": doc["doc"],
        "derived": derived,
        "solved": solved,
        "checks": [{"name": n, "pass": ok, "detail": d} for n, ok, d in checks],
        "stroke_suite": stroke_suite_stub(doc),
        "sheets": sorted(files),
    }
    files[f"gh{slug}-solved-{rev}.json"] = json.dumps(twin, ensure_ascii=False, indent=1) + "\n"
    return files, twin


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--input", type=Path,
                        default=repo_root() / "docs/geometry/diamond-proam-9ft-table-definition.json")
    parser.add_argument("--output-dir", type=Path,
                        help="required unless --stroke-suite")
    parser.add_argument("--check", action="store_true",
                        help="regenerate and byte-compare against --output-dir")
    parser.add_argument("--stroke-suite", action="store_true",
                        help="report the stroke-suite hook status (currently a declared stub)")
    # FIX2 (review round 2 on #731): option presence is not option value — a blank or trailing path flag and a missing input path exit 2 by name
    import os as _os, sys as _sys; _sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "lib")); from argpaths import guard_paths as _guard_paths
    parser.allow_abbrev = False  # FIX2: no prefix matching — `--ou=` must not reach argparse as --out=''
    args = parser.parse_args()
    _guard_paths({'--input': 'file', '--output-dir': 'out'}, tag='gen_drawing_488d.py')  # FIX10 (Fable pass 2): after the parse — help exits 0 first; the guard is a post-parse value + existence check

    if args.stroke_suite:
        doc, _sha, _raw = load_source(args.input)
        report = stroke_suite_stub(doc)
        print(f"[stroke-suite] {report['status']} — {report['reason']}")
        return 0

    if args.output_dir is None:
        parser.error("--output-dir is required unless --stroke-suite")
    files, twin = generate(args.input)
    for entry in twin["checks"]:
        print(f"[check] {entry['name']}: {'PASS' if entry['pass'] else 'FAIL'} — {entry['detail']}")
    print(f"[stroke-suite] {twin['stroke_suite']['status']}")

    if args.check:
        stale = []
        for name, content in files.items():
            path = args.output_dir / name
            if not path.exists() or path.read_bytes() != content.encode("utf-8"):
                stale.append(name)
        if stale:
            print(f"[check] STALE outputs: {', '.join(sorted(stale))}", file=sys.stderr)
            return 1
        print(f"[check] {len(files)} outputs byte-identical")
        return 0

    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, content in sorted(files.items()):
        (args.output_dir / name).write_bytes(content.encode("utf-8"))
        print(f"[write] {args.output_dir / name} ({len(content)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
