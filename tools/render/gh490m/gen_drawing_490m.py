#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""GH-490m — Chinese 8-ball middle-pocket exterior furniture drawing generator.

Single-source pipeline per ADR-0015: the ONLY input is the canonical geometry
definition `docs/geometry/cn8-middle-furniture-definition.json`; this script
re-derives every drawn line and dimension from that JSON, asserts the declared
arithmetic identities before any sheet is emitted, and writes:

  - sheet M1: transverse section on the pocket centreline (u = 0) — the sheet
              that kills the revolve: cover face plane vs the rail-plank arris
  - sheet M2: exterior elevation looking inboard (the owner's viewing pose) —
              cover face, top edge, wrap fold, scalloped hem, rail ends, sock
  - sheet M3: plan looking down — the STRAIGHT back line parallel to datum B,
              the inboard slate-mating crown arc, and the cloth termination
  - a solved JSON twin (constructed points, check results, source SHA-256)

Scope: RENDER GEOMETRY ONLY (ADR-0015 declaration clause). No kernel bytes.

Run:
  python3 tools/render/gh490m/gen_drawing_490m.py --output-dir output/gh490m
  python3 tools/render/gh490m/gen_drawing_490m.py --output-dir output/gh490m --check

Deterministic: byte-identical output for identical input JSON (no clocks, no
environment reads; --check regenerates in memory and byte-compares).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

GENERATOR_ID = "gh490m-drawing/1.1.0"
SOURCE_DEFAULT = "docs/geometry/cn8-middle-furniture-definition.json"

# ---------------------------------------------------------------- input


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def load_source(path: Path) -> tuple[dict, str, bytes]:
    raw = path.read_bytes()
    doc = json.loads(raw.decode("utf-8"))
    return doc, hashlib.sha256(raw).hexdigest(), raw


def feature_map(doc: dict) -> dict[str, dict]:
    return {feat["id"]: feat for feat in doc["features"]}


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
    gap = val(f, "DT-09")
    arris, rail_top, plank_under, apron = (val(f, "DT-04"), val(f, "DT-05"),
                                           val(f, "DT-06"), val(f, "DT-07"))
    half, height = val(f, "BC-01"), val(f, "BC-02")
    face, top, hem = val(f, "BC-03"), val(f, "BC-04"), val(f, "BC-09")
    thick, clear = val(f, "BC-10"), val(f, "BC-11")
    pitch, depth = val(f, "BC-07")
    fold = val(f, "BC-08")
    crown_end = val(f, "MC-03")

    check("BC-01 cover half-width", abs(gap - clear - half) < 1e-9,
          f"DT-09 {gap} − BC-11 {clear} = {half}")
    check("BC-02 face height", abs(top - hem - height) < 1e-9,
          f"BC-04 {top} − BC-09 {hem} = {height}")
    recess = arris - face
    check("BC-03 arris recess", recess > 0.0,
          f"DT-04 {arris} − BC-03 {face} = {recess} > 0 — no furniture crosses the arris")
    check("BC-04 top edge on the rail top plane", abs(top - rail_top) < 1e-9,
          f"BC-04 {top} = DT-05 {rail_top}")
    check("MC-03 crown termination", abs(face - thick - crown_end) < 1e-9,
          f"BC-03 {face} − BC-10 {thick} = {crown_end}")
    check("CT-01 single termination plane", abs(val(f, "CT-01") - crown_end) < 1e-9,
          f"CT-01 {val(f, 'CT-01')} = MC-03 {crown_end}")
    # CT-04 (r9): the SECOND cloth bound, and the reason there are two. CT-01
    # holds under the plate, where MC-03 is the plate's inner face and cloth
    # outboard of it would come through the leather. In the rail-end slot
    # BC-01 < |u| <= DT-09 there is no plate at that u, so the same law —
    # cloth is never the outboard-most surface — binds on the plate's FACE.
    # Drawing the slot at MC-03 instead buried the CT-03 fold 2.0 mm behind a
    # BC-11 aperture that admits 0.8 mm, which is open item O-7.
    check("CT-04 slot termination on the cover face",
          abs(val(f, "CT-04") - face) < 1e-9,
          f"CT-04 {val(f, 'CT-04')} = BC-03 {face} — cloth in the rail-end slot "
          f"stops at the leather face, never proud of it")
    check("CT-02 cloth ceiling", abs(val(f, "CT-02") - top) < 1e-9,
          f"CT-02 {val(f, 'CT-02')} = BC-04 {top}")
    # CT-03 (r10): the rail-end WRAP. Evidence 05 (the plan straight down into
    # the mouth) shows the rail cloth running continuously over the plank's end
    # face from the cushion jaw to the cover, so the row is no longer a fold
    # width typed from a caption — it is the distance between two drawn planes,
    # the plank's inboard face (DT-10, as-modeled) and the slot termination
    # (CT-04). Asserted so the value cannot drift from either bound.
    plank_in = val(f, "DT-10")
    check("CT-03 wrap spans DT-10 to CT-04",
          abs(val(f, "CT-04") - plank_in - val(f, "CT-03")) < 1e-9,
          f"CT-04 {val(f, 'CT-04')} − DT-10 {plank_in} = {val(f, 'CT-03')} — the cloth "
          f"wraps the plank end face from the cushion back to the cover face")
    check("DT plank overhang", abs(arris - apron - 16.0) < 1e-9,
          f"DT-04 {arris} − DT-07 {apron} = 16.0")
    check("DT plank thickness", abs(rail_top - plank_under - 36.0) < 1e-9,
          f"DT-05 {rail_top} − DT-06 {plank_under} = 36.0")
    scallops = 2.0 * half / pitch
    check("BC-07 whole scallops", abs(scallops - round(scallops)) < 1e-9,
          f"2 × BC-01 / pitch = {scallops:.2f} whole scallops across the face")
    check("BC-08 fold inside the face", fold < height,
          f"BC-08 {fold} < BC-02 {height}")
    check("BC-07 hem depth inside the face", depth < height,
          f"hem depth {depth} < BC-02 {height}")
    check("SK-01 ring below the hem", val(f, "SK-01") < hem,
          f"SK-01 {val(f, 'SK-01')} < BC-09 {hem}")
    # SK-04 (r8 → r11): the sock's selvedge plane. The photographs show no bare
    # casting between the leather hem's EDGE and the first course of knit —
    # and that edge is the scallop tips (r11, frames 07/08: first knit row at
    # the tips' level — the instrument reads 7 / 5 px = 2.4 / 1.7 mm below the
    # crest, 1.1 / 1.8 mm above the tips; the notches carry no knit — R1-FIX11) —
    # so the plane is not an independent measurement, it IS BC-09 − BC-07
    # depth, and this assertion is the whole content of the row. The second
    # check keeps the sock's own two stations in order: a bag cannot gather
    # above the clamp it hangs from.
    selvedge = val(f, "SK-04")
    check("SK-04 selvedge at the scallop tips", abs(selvedge - (hem - depth)) < 1e-9,
          f"SK-04 {selvedge} = BC-09 {hem} − BC-07 depth {depth}")
    check("SK-01 ring below the selvedge", val(f, "SK-01") < selvedge,
          f"SK-01 {val(f, 'SK-01')} < SK-04 {selvedge}")

    # crown construction: the slate-mating circle centred on the pocket centre,
    # truncated by the cover's inner face. Solve the truncation angle.
    r_c, v_c = val(f, "MC-01")
    centre_w = val(f, "DT-03")
    cos_t = (crown_end - centre_w) / r_c
    check("MC-03 crown truncation is real", -1.0 < cos_t < 1.0,
          f"(MC-03 {crown_end} − DT-03 {centre_w}) / r {r_c} = {cos_t:.4f} — the "
          f"crown circle genuinely crosses the cover's inner face")
    theta = math.degrees(math.acos(cos_t))

    # MC-04: the throat lip wall is a second revolve about the same axis, and
    # r4 clamps its outboard half to the same plane. The closure identity is
    # what makes the clamp a drawn decision rather than a convenient seam —
    # the clamped wall's span must be the cover's own half-width.
    lip_end, lip_r = val(f, "MC-04"), val(f, "MC-05")
    check("MC-04 single termination plane", abs(lip_end - crown_end) < 1e-9,
          f"MC-04 {lip_end} = MC-03 {crown_end}")
    lip_u = math.sqrt(lip_r ** 2 - (lip_end - centre_w) ** 2)
    check("MC-04 lip wall closes on the cover edge", abs(lip_u - half) < 0.10,
          f"sqrt(MC-05 {lip_r}² − (MC-04 {lip_end} − DT-03 {centre_w})²) = "
          f"{lip_u:.2f} vs BC-01 {half} — the clamped wall spans the cover's "
          f"own half-width to within 0.10 mm")

    # BC-08 (r5): the wrap fold has to live on the face it folds. This is a
    # well-formedness identity, not a fit — it is what stops someone setting
    # BC-08 past BC-02 and drawing a crease in mid-air below the hem.
    crease_v = top - fold
    check("BC-08 crease lies on the cover face", hem < crease_v < top,
          f"BC-09 {hem} < BC-04 − BC-08 = {crease_v:.2f} < BC-04 {top}")
    # BC-12/13/14 (r7): the stitch row. The pitch is an IDENTITY — a stitch
    # row has a whole number of dashes across the drawn face, so 2 × BC-01 is
    # divisible by BC-12. The other three keep the scalloped crease on the
    # cover and the pinched gap between the dashes real.
    s_pitch, s_land, s_sag = val(f, "BC-12"), val(f, "BC-13"), val(f, "BC-14")
    n_dash = 2.0 * half / s_pitch
    check("BC-12 whole dashes", abs(n_dash - round(n_dash)) < 5e-4,
          f"2 × BC-01 / BC-12 = {n_dash:.4f} ≈ {round(n_dash)}")
    check("BC-13 land inside the pitch", 0.0 < s_land < s_pitch,
          f"0 < BC-13 {s_land} < BC-12 {s_pitch}")
    check("BC-14 sag inside the fold span", s_sag < fold,
          f"BC-14 {s_sag} < BC-08 {fold}")
    check("BC-14 sagged crease stays above the hem", crease_v - s_sag > hem,
          f"BC-04 − BC-08 − BC-14 = {crease_v - s_sag:.2f} > BC-09 {hem}")

    check("MC-01 mouth reaches the nose line", abs(centre_w - r_c) < 1.0,
          f"DT-03 {centre_w} − MC-01.r {r_c} = {centre_w - r_c:.2f} mm — the crown's "
          f"inboard extreme sits on datum B (the nose line) to within 1 mm")
    return {
        "crown_truncation_deg": theta,
        "crown_truncation_u": r_c * math.sin(math.radians(theta)),
        "crown_rim_v": v_c,
        "arris_recess": recess,
        "scallops": round(scallops),
        "hem_tip_v": hem - depth,
    }


# ---------------------------------------------------------------- svg helpers


class Sheet:
    """One GB/T-styled SVG sheet with a shared title block."""

    W = 1680
    H = 1180

    def __init__(self, sheet_no: str, title: str, doc: dict, sha: str, scale_note: str,
                 source_label: str = SOURCE_DEFAULT):
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

    def line(self, x1, y1, x2, y2, stroke="#111", w=1.1, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.buf.append(f'<line x1="{self.c(x1)}" y1="{self.c(y1)}" x2="{self.c(x2)}" '
                        f'y2="{self.c(y2)}" stroke="{stroke}" stroke-width="{w}"{d}/>')

    def path(self, d, stroke="#111", w=1.1, fill="none", dash=None):
        dd = f' stroke-dasharray="{dash}"' if dash else ""
        self.buf.append(f'<path d="{d}" stroke="{stroke}" stroke-width="{w}" fill="{fill}"{dd}/>')

    def rect(self, x, y, w, h, fill="none", stroke="#333", sw=1.0):
        self.buf.append(f'<rect x="{self.c(x)}" y="{self.c(y)}" width="{self.c(w)}" '
                        f'height="{self.c(h)}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

    def circle(self, cx, cy, r, stroke="#111", w=1.1, fill="none", dash=None):
        dd = f' stroke-dasharray="{dash}"' if dash else ""
        self.buf.append(f'<circle cx="{self.c(cx)}" cy="{self.c(cy)}" r="{self.c(r)}" '
                        f'stroke="{stroke}" stroke-width="{w}" fill="{fill}"{dd}/>')

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
        """rows: (feature id, value, tier, scope, source) tuples."""
        rh = 16
        self.rect(x, y, w, 24 + rh * len(rows) + 8, fill="#fbf9f2", stroke="#4a6a8a", sw=0.9)
        self.text(x + 10, y + 17, title, 11, weight="700", fill="#0a2a6a")
        yy = y + 24 + 11
        for fid, value, tier, scope, source in rows:
            self.text(x + 10, yy, fid, 9.2, weight="700")
            self.text(x + 64, yy, value, 9.2, fill="#222")
            self.text(x + 244, yy, tier, 8.4, fill="#7a3a10")
            self.text(x + 344, yy, scope, 8.4,
                      fill="#1d7a38" if scope == "render" else "#3a3a8a")
            self.text(x + 412, yy, source, 8.4, fill="#555")
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
        self.text(34, y0 + 88,
                  f"generator {GENERATOR_ID} · ADR-0015 chain: drawing == JSON == model == gate — "
                  f"model+gate parity ARMED (gate rows MIDEXT-STRAIGHT / MIDEXT-PROTRUDE / "
                  f"MIDEXT-CLOTHFREE read BC-05, BC-03 and CT-01/CT-02 from this source) · "
                  f"RENDER GEOMETRY ONLY — zero kernel bytes (ADR-0015 declaration clause)",
                  8.6, fill="#8a1010")
        if extra:
            self.text(34, y0 + 104, extra, 8.6, fill="#1d7a38")
        # first-angle projection symbol (truncated cone, two views)
        sx = self.W - 190
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

# px per mm, chosen per sheet so the full drawn extent — down to SK-01 at
# v = -152.00 — clears the title block. Reported in each title block.
SCALE_M1, ORIGIN_M1 = 3.2, (340.0, 360.0)   # section: +w right, +v up
SCALE_M2, ORIGIN_M2 = 3.0, (610.0, 360.0)   # elevation: +u right, +v up
SCALE_M3, ORIGIN_M3 = 3.4, (700.0, 300.0)   # plan: +u right, +w down


def scale_note(s: float) -> str:
    return f"drawn {s:.2f} px/mm"

TIER_SHORT = {
    "KERNEL": "kernel", "AS-MODELED": "as-modeled", "AS-MODELED-PIN": "as-modeled PIN",
    "DERIVED": "derived", "PHOTO": "photo", "PHOTO-FORM": "photo form",
    "OWNER+PHOTO": "owner+photo", "EST": "estimated",
}


def row_of(f: dict[str, dict], fid: str, value: str) -> tuple:
    feat = f[fid]
    src = feat["source"].get("dossier_file") or feat["source"]["doc"]
    if src.startswith("EVIDENCE/"):
        src = src.split("-", 1)[0] + " " + src.split("-", 1)[1][:34] + "…"
    elif len(src) > 46:
        src = src[:44] + "…"
    tier = TIER_SHORT.get(feat["source"]["tier"], feat["source"]["tier"])
    if feat.get("status") == "ESTIMATED":
        tier += " (EST)"
    mark = f"  [{feat['conflict']}]" if "conflict" in feat else ""
    scope = {"render-only": "render", "datum": "datum",
             "reference-only": "reference"}[feat["scope"]]
    return (fid, value + mark, tier, scope, src)


def _frame(sh: Sheet, x0: float, y0: float, w: float, h: float, label: str) -> None:
    sh.rect(x0, y0, w, h, fill="#ffffff", stroke="#c9c2b0", sw=0.8)
    sh.text(x0 + 6, y0 - 6, label, 9.6, fill="#666")


def sheet_section(doc, f, sha, solved, src) -> str:
    """M1 — transverse section on the pocket centreline u = 0."""
    S = SCALE_M1
    sh = Sheet("M1", "middle-pocket furniture — SECTION A-A, plane u = 0 (pocket centreline)",
               doc, sha, scale_note(S), src)
    ox, oy = ORIGIN_M1

    def P(w, v):
        return (ox + w * S, oy - v * S)

    _frame(sh, ox - 42 * S, oy - 62 * S, 210 * S, 230 * S,
           "SECTION A-A — looking along +u; +w outboard to the right, +v up")

    arris, rail_top = val(f, "DT-04"), val(f, "DT-05")
    plank_under, apron = val(f, "DT-06"), val(f, "DT-07")
    apron_top, apron_bot = val(f, "DT-08")
    face, top, hem = val(f, "BC-03"), val(f, "BC-04"), val(f, "BC-09")
    thick, ret = val(f, "BC-10"), val(f, "BC-06")
    fold = val(f, "BC-08")
    crown_end = val(f, "MC-03")
    centre_w = val(f, "DT-03")
    r_c, rim_v = val(f, "MC-01")
    r_fl, fl_v = val(f, "MC-02")
    ring_v = val(f, "SK-01")
    selvedge = val(f, "SK-04")
    plank_in = val(f, "DT-10")  # r10: the plank's inboard face is a drawn datum, no longer a typed 41.5

    # ---- datums -----------------------------------------------------------
    sh.line(*P(-36, 0), *P(160, 0), "#0a2a6a", 1.0, dash="9 4 2 4")
    sh.text(*P(-38, 0), "A", 12, fill="#0a2a6a", anchor="end", weight="700")
    sh.text(*P(132, 2.5), "datum A · bed plane v = 0", 9, fill="#0a2a6a")
    sh.line(*P(0, -158), *P(0, 52), "#0a2a6a", 1.0, dash="9 4 2 4")
    sh.text(*P(0, 54), "B", 12, fill="#0a2a6a", anchor="middle", weight="700")
    sh.text(*P(-2, -158), "datum B · nose line w = 0", 9, fill="#0a2a6a", anchor="end")

    # ---- body -------------------------------------------------------------
    # the rail plank is CUT AWAY on this plane (the bay) — phantom outline only
    px0, py0 = P(plank_in, rail_top)
    px1, py1 = P(arris, plank_under)
    sh.rect(px0, py0, px1 - px0, py1 - py0, fill="none", stroke="#b09a70", sw=1.0)
    sh.path(f"M {Sheet.c(px0)} {Sheet.c(py1)} L {Sheet.c(px1)} {Sheet.c(py0)}",
            "#d8c8a4", 0.8, dash="4 4")
    sh.text(*P(plank_in - 2, rail_top + 16),
            "rail plank — PHANTOM: cut away on this plane (bay, DT-09)", 8.8, fill="#8a6a20")
    # apron / blind beam: DT-07 is its OUTER face; the member runs inboard of it
    ax, ay = P(apron - 12, apron_top)
    bx, by = P(apron, apron_bot)
    sh.rect(min(ax, bx), ay, abs(bx - ax), by - ay, fill="#efe7db", stroke="#8a7a60", sw=1.1)
    sh.text(*P(apron + 4, apron_bot + 8), "apron / blind beam — DT-07 outer face, DT-08 span",
            9, fill="#6a5a40")

    # ---- the cover: a PLANE face, a straight vertical line on this section --
    cx0, cy0 = P(face - thick, top)
    cx1, cy1 = P(face, hem)
    sh.rect(cx0, cy0, cx1 - cx0, cy1 - cy0, fill="#f6ead6", stroke="#8a1010", sw=2.2)
    sh.text(*P(face + 6, top - 6), "BC — bay cover (leather)", 10.5,
            fill="#8a1010", weight="700")
    sh.text(*P(face + 6, top - 17),
            f"back face is a PLANE at w = {Sheet.f(face)}; no revolve, no drum", 8.8,
            fill="#8a1010")
    sh.line(*P(face - thick, top - fold), *P(face, top - fold), "#8a1010", 0.9, dash="4 3")
    sh.text(*P(face + 6, top - fold), f"BC-08 wrap fold {Sheet.f(fold)}", 8.6, fill="#8a1010")
    # side return (seen edge-on here, dimensioned on M3)
    sh.line(*P(face - thick - ret, top), *P(face - thick, top), "#8a1010", 0.9, dash="3 2")
    sh.text(*P(face - thick - ret - 2, top - 4), f"BC-06 return {Sheet.f(ret)}", 8.4,
            fill="#8a1010", anchor="end")

    # ---- crown: the slate-mating arc, inboard only --------------------------
    sh.circle(*P(centre_w - r_c, rim_v), 3.0, "#1d7a38", 1.4)
    sh.text(*P(centre_w - r_c - 9, rim_v - 3),
            f"MC-01 rim  r {Sheet.f(r_c)} @ v {Sheet.f(rim_v)}", 8.8,
            fill="#1d7a38", anchor="end")
    sh.circle(*P(centre_w - r_fl, fl_v), 3.0, "#1d7a38", 1.4)
    sh.text(*P(centre_w - r_fl - 9, fl_v + 12),
            f"MC-02 flare  r {Sheet.f(r_fl)} @ v {Sheet.f(fl_v)}", 8.8,
            fill="#1d7a38", anchor="end")
    sh.line(*P(centre_w - r_c, rim_v), *P(crown_end, rim_v), "#1d7a38", 1.3, dash="7 3")
    sh.line(*P(crown_end, rim_v + 6), *P(crown_end, hem - 6), "#1d7a38", 1.0, dash="3 3")
    sh.text(*P(crown_end - 3, rim_v - 8),
            f"crown terminates at MC-03 w = {Sheet.f(crown_end)}", 8.8,
            fill="#1d7a38", anchor="end")

    # ---- sock + brass ring (reference only) --------------------------------
    sh.line(*P(centre_w + 11, hem), *P(centre_w + 15, ring_v), "#999", 1.0, dash="3 3")
    sh.line(*P(centre_w - 11, hem), *P(centre_w - 15, ring_v), "#999", 1.0, dash="3 3")
    sh.text(*P(centre_w, hem - 30), "SK-02 sock", 8.6, fill="#777", anchor="middle")
    # r8 → r11: SK-04, the selvedge plane — the scallop tips (BC-09 − BC-07
    # depth), drawn as a short tick 3.5 below the hem line: the knit's first
    # course meets the hem's lower edge and the notches carry no knit.
    sh.line(*P(centre_w - 26, selvedge), *P(centre_w - 12, selvedge), "#777", 1.6)
    sh.text(*P(centre_w - 29, selvedge - 3),
            f"SK-04 selvedge v = {Sheet.f(selvedge)} (= BC-09 − BC-07 depth — knit clamped behind the hem's lobes)",
            8.2, fill="#777", anchor="end")
    sh.line(*P(centre_w - 20, ring_v), *P(centre_w + 20, ring_v), "#8a6a10", 2.4)
    sh.text(*P(centre_w + 30, ring_v + 3), f"SK-01 brass ring v = {Sheet.f(ring_v)}", 8.8,
            fill="#8a6a10")
    sh.text(*P(centre_w + 30, ring_v - 8), "reference only — NOT revised by r1 (conflict C3)",
            8.2, fill="#8a6a10")

    # ---- dimensions --------------------------------------------------------
    sh.dim(*P(face, rail_top + 26), *P(arris, rail_top + 26),
           f"{Sheet.f(arris - face)}", off=0, size=9.0)
    sh.text(*P(arris + 4, rail_top + 27), "BC-03 recess under the arris", 8.6, fill="#333")
    sh.dim(*P(face + 30, top), *P(face + 30, hem), f"{Sheet.f(val(f, 'BC-02'))}  BC-02", off=0)
    for i, (fid, v_at, lab) in enumerate((
            ("DT-03", centre_w, "pocket centre"),
            ("MC-03", crown_end, "crown termination"),
            ("BC-03", face, "cover back face"),
            ("DT-04", arris, "plank arris"),
            ("DT-07", apron, "apron outer face"))):
        vv = -104.0 - 11.0 * i
        sh.dim(*P(0, vv), *P(v_at, vv), f"{Sheet.f(v_at)}  {fid} {lab}", off=0, size=8.8)

    # ---- table + the defect statement --------------------------------------
    sh.letters_table(
        960, 130, 690, "SECTION A-A — governing rows",
        [row_of(f, "DT-04", f"w = {Sheet.f(arris)}"),
         row_of(f, "DT-10", f"w = {Sheet.f(plank_in)}"),
         row_of(f, "DT-05", f"v = {Sheet.f(rail_top)}"),
         row_of(f, "DT-07", f"w = {Sheet.f(apron)}"),
         row_of(f, "BC-03", f"w = {Sheet.f(face)}"),
         row_of(f, "BC-04", f"v = {Sheet.f(top)}"),
         row_of(f, "BC-09", f"v = {Sheet.f(hem)}"),
         row_of(f, "BC-10", f"t = {Sheet.f(thick)}"),
         row_of(f, "MC-01", f"r {Sheet.f(r_c)} @ v {Sheet.f(rim_v)}"),
         row_of(f, "MC-02", f"r {Sheet.f(r_fl)} @ v {Sheet.f(fl_v)}"),
         row_of(f, "MC-03", f"w = {Sheet.f(crown_end)}"),
         # r4: MC-04 shares MC-03's plane, so it adds no line to the section —
         # but a governing row that appears on no sheet is a chain gap, and the
         # lip wall is the third body this plane truncates.
         row_of(f, "MC-04", f"w = {Sheet.f(val(f, 'MC-04'))} (= MC-03)"),
         row_of(f, "MC-05", f"r = {Sheet.f(val(f, 'MC-05'))} REF"),
         row_of(f, "SK-04", f"v = {Sheet.f(selvedge)} (= BC-09)"),
         row_of(f, "SK-01", f"v = {Sheet.f(ring_v)}")])
    y = 420
    sh.text(960, y, "WHAT THIS SECTION RETIRES", 11.5, weight="700", fill="#8a1010")
    for k, s in enumerate((
            "The as-modeled middle reuses the CORNER molded-cap REVOLVE family —",
            "cn8cap-band / cn8cap-roll / cn8cap-seat / cn8cap-skirt. Its skirt drum",
            f"stands at w = +146.30 and the cloth margin at w = +148.60, i.e.",
            f"{Sheet.f(146.3 - arris)} mm and {Sheet.f(148.6 - arris)} mm PROUD of the plank "
            f"arris drawn here at w = {Sheet.f(arris)}.",
            f"The drawn cover sits {Sheet.f(arris - face)} mm INSIDE that arris.",
            "",
            "Gate row MIDEXT-PROTRUDE reads exactly this pair (BC-03 vs DT-04) and",
            "is red-armed on the as-modeled tree before the rebuild lands.")):
        sh.text(960, y + 20 + 15 * k, s, 9.4, fill="#8a1010" if k < 5 else "#1d7a38")

    solved["section"] = {
        "cover_face_w": face, "cover_inner_w": face - thick,
        "arris_recess": arris - face, "crown_rim": [r_c, rim_v],
        "crown_flare": [r_fl, fl_v], "ring_v": ring_v,
    }
    sh.title_block("sheet M1 of 3 · section plane u = 0 · MIDEXT-PROTRUDE reads BC-03 vs DT-04")
    return sh.finish()


def sheet_elevation(doc, f, sha, solved, src) -> str:
    """M2 — exterior elevation, looking inboard (the owner's pose)."""
    S = SCALE_M2
    sh = Sheet("M2", "middle-pocket furniture — EXTERIOR ELEVATION (view on datum B, looking inboard)",
               doc, sha, scale_note(S), src)
    ox, oy = ORIGIN_M2

    def P(u, v):
        return (ox + u * S, oy - v * S)

    _frame(sh, ox - 112 * S, oy - 62 * S, 224 * S, 230 * S,
           "VIEW ON B — looking inboard (−w); +u right, +v up. This is the owner's reported pose.")

    gap = val(f, "DT-09")
    rail_top, plank_under = val(f, "DT-05"), val(f, "DT-06")
    apron_top, apron_bot = val(f, "DT-08")
    half, top, hem = val(f, "BC-01"), val(f, "BC-04"), val(f, "BC-09")
    pitch, depth = val(f, "BC-07")
    fold, clear = val(f, "BC-08"), val(f, "BC-11")
    ring_v = val(f, "SK-01")
    selvedge = val(f, "SK-04")
    U_END = 106.0

    sh.line(*P(-U_END, 0), *P(U_END, 0), "#0a2a6a", 1.0, dash="9 4 2 4")
    sh.text(*P(-U_END - 2, 0), "A", 12, fill="#0a2a6a", anchor="end", weight="700")
    sh.line(*P(0, -164), *P(0, 52), "#0a2a6a", 1.0, dash="9 4 2 4")
    sh.text(*P(0, -172), "C", 12, fill="#0a2a6a", anchor="middle", weight="700")

    # rail ends and apron, left and right of the bay
    for sgn in (-1, 1):
        x0, y0 = P(sgn * gap, rail_top)
        x1, y1 = P(sgn * U_END, plank_under)
        sh.rect(min(x0, x1), y0, abs(x1 - x0), y1 - y0, fill="#e6d9bf", stroke="#8a7a60", sw=1.2)
        ax0, ay0 = P(sgn * gap, apron_top)
        ax1, ay1 = P(sgn * U_END, apron_bot)
        sh.rect(min(ax0, ax1), ay0, abs(ax1 - ax0), ay1 - ay0,
                fill="#efe7db", stroke="#8a7a60", sw=1.0)
    sh.text(*P(-U_END + 3, rail_top + 6), "rail plank (DT-05 / DT-06)", 9, fill="#6a5a40")
    sh.text(*P(-U_END + 3, apron_bot + 8), "apron beam (DT-08)", 9, fill="#6a5a40")

    # the bay opening
    bx0, by0 = P(-gap, rail_top)
    bx1, by1 = P(gap, apron_bot)
    sh.rect(bx0, by0, bx1 - bx0, by1 - by0, fill="none", stroke="#0a2a6a", sw=1.0)

    # sock through the open bay, then the brass ring — drawn BEHIND the cover
    sh.line(*P(-26, hem - depth), *P(-30, ring_v), "#999", 1.0, dash="3 3")
    sh.line(*P(26, hem - depth), *P(30, ring_v), "#999", 1.0, dash="3 3")
    sh.text(*P(0, ring_v + 16), "SK-02 sock — through the OPEN bay below BC-09", 8.8,
            fill="#777", anchor="middle")
    # r8: SK-04. The selvedge is CLAMPED at the hem crest, so on this elevation
    # it is the same rule as BC-09 and the sock's leaders start ON it — the
    # drawn statement is that no casting is bare between the two.
    sh.line(*P(-gap, selvedge), *P(gap, selvedge), "#777", 1.0, dash="2 4")
    sh.text(*P(gap + 4, selvedge - 4),
            f"SK-04 selvedge v = {Sheet.f(selvedge)} (= BC-09)", 8.4, fill="#777")
    sh.line(*P(-34, ring_v), *P(34, ring_v), "#8a6a10", 2.4)
    sh.text(*P(38, ring_v + 3), f"SK-01 brass ring v = {Sheet.f(ring_v)} (reference only, C3)",
            8.8, fill="#8a6a10")

    # the cover: straight top edge, straight sides, scalloped hem.
    # r2 — BC-07 profile correction. r1 drew straight-flanked pinking-shear
    # teeth; frames 07/08 show ROUNDED lobes joined by narrow cusps, so each
    # lobe is the half-ellipse BC-07.profile states, cusps ON the pitch
    # stations and the apex at half pitch. Same pitch, same depth, same
    # scallop count — only the curve between cusps moved. The renderer
    # builds this identical function (web/scene/table.js hemV), which is
    # what makes the drawing == model half of the chain checkable.
    n = int(round(2 * half / pitch))
    LOBE = 12  # polyline stations per lobe
    pts = [P(-half, top), P(half, top), P(half, hem)]
    for i in range(n):
        for s in range(1, LOBE + 1):
            fr = s / LOBE
            t = 2.0 * fr - 1.0
            pts.append(P(half - (i + fr) * pitch,
                         hem - depth * math.sqrt(max(0.0, 1.0 - t * t))))
    pts.append(P(-half, hem))
    d = "M " + " L ".join(f"{Sheet.c(x)} {Sheet.c(y)}" for x, y in pts) + " Z"
    sh.path(d, "#8a1010", 2.2, fill="#f6ead6")
    # r7 — the stitch row is DRAWN, not described. BC-12/BC-13/BC-14 replace
    # the r5 dashed straight line: the crease is pulled tight at each stitch
    # and sags by BC-14 across the BC-13 land between them, which is what the
    # dashes in frame 07 actually are (the wrap lip, not thread lying on it).
    # web/scene/table.js stitchSag() builds this identical function.
    s_pitch, s_land, s_sag = val(f, "BC-12"), val(f, "BC-13"), val(f, "BC-14")
    n_dash = int(round(2 * half / s_pitch))
    crease_v = top - fold
    s_half = (1.0 - s_land / s_pitch) / 2.0  # pinched land each side, in phase
    spts = []
    for i in range(n_dash):
        for s in range(0, LOBE + 1):
            fr = i + s / LOBE
            ph = fr - math.floor(fr)
            if ph < s_half or ph > 1.0 - s_half:
                sag = 0.0
            else:
                t = 2.0 * (ph - s_half) / (s_land / s_pitch) - 1.0
                sag = s_sag * math.sqrt(max(0.0, 1.0 - t * t))
            spts.append(P(-half + fr * s_pitch, crease_v - sag))
    spts.append(P(half, crease_v))
    sh.path("M " + " L ".join(f"{Sheet.c(x)} {Sheet.c(y)}" for x, y in spts),
            "#8a1010", 1.2, fill="none")
    sh.text(*P(0, crease_v + 5),
            f"BC-08 wrap fold {Sheet.f(fold)} below the top edge — "
            f"BC-12 {n_dash} dashes at pitch {Sheet.f(s_pitch)}, "
            f"BC-13 land {Sheet.f(s_land)}, BC-14 sag {Sheet.f(s_sag)}", 8.6,
            fill="#8a1010", anchor="middle")
    sh.dim(*P(-half, crease_v - s_sag - 7), *P(-half + s_pitch, crease_v - s_sag - 7),
           f"{Sheet.f(s_pitch)} BC-12", off=0, size=8.0)
    sh.text(*P(0, hem + 20), "BC — bay cover", 11, fill="#8a1010", anchor="middle", weight="700")
    sh.text(*P(0, hem + 9),
            f"BC-07 scalloped hem: {n} half-ellipse lobes, pitch {Sheet.f(pitch)}, "
            f"depth {Sheet.f(depth)} (cusps on the pitch stations)",
            8.6, fill="#8a1010", anchor="middle")

    # dimensions
    sh.dim(*P(-half, top + 11), *P(half, top + 11), f"{Sheet.f(2 * half)}  2 × BC-01", off=0)
    sh.dim(*P(-gap, top + 27), *P(gap, top + 27), f"{Sheet.f(2 * gap)}  2 × DT-09", off=0)
    sh.dim(*P(half, top + 4), *P(gap, top + 4), "", off=0)
    sh.line(*P(gap, top + 4), *P(gap + 15, top + 9), "#333", 0.7)
    sh.text(*P(gap + 17, top + 10), f"BC-11 {Sheet.f(clear)} side clearance", 8.6,
            fill="#333")
    sh.dim(*P(half + 22, top), *P(half + 22, hem), f"{Sheet.f(val(f, 'BC-02'))}  BC-02", off=0)
    sh.dim(*P(-U_END + 10, 0), *P(-U_END + 10, top), f"{Sheet.f(top)}  BC-04 = DT-05", off=0,
           size=8.8)

    sh.letters_table(
        1020, 130, 632, "VIEW ON B — governing rows",
        [row_of(f, "DT-09", f"|u| = {Sheet.f(gap)}"),
         row_of(f, "BC-01", f"|u| = {Sheet.f(half)}"),
         row_of(f, "BC-02", f"h = {Sheet.f(val(f, 'BC-02'))}"),
         row_of(f, "BC-04", f"v = {Sheet.f(top)}"),
         row_of(f, "BC-07", f"{Sheet.f(pitch)} / {Sheet.f(depth)}"),
         row_of(f, "BC-08", f"{Sheet.f(fold)}  (hard fold)"),
         # r5: BC-12 is REFERENCE-ONLY and deliberately unresolved — it is
         # drawn as a range so the sheet states the refusal instead of
         # implying a pitch nobody measured.
         # r7: BC-12 is RESOLVED — the pitch is the identity 2 × BC-01 / 13,
         # the only integer count consistent with the measured pixel pitch.
         row_of(f, "BC-12", f"{Sheet.f(s_pitch)} × {n_dash} dashes"),
         row_of(f, "BC-13", f"land {Sheet.f(s_land)}"),
         row_of(f, "BC-14", f"sag {Sheet.f(s_sag)}"),
         row_of(f, "BC-09", f"v = {Sheet.f(hem)}"),
         row_of(f, "BC-11", f"{Sheet.f(clear)}"),
         row_of(f, "SK-04", f"v = {Sheet.f(selvedge)} (= BC-09)"),
         row_of(f, "SK-02", "open bay below BC-09")])

    drawn_ratio = val(f, "BC-02") / (2.0 * half)
    y = 380
    sh.text(1020, y, "AS-MODELED DEPARTURE", 11.5, weight="700", fill="#8a1010")
    for k, s in enumerate((
            f"cn8cap-boot is drawn 129.00 wide × 125.50 tall (h/w = {125.5 / 129.0:.2f}).",
            f"This sheet draws {Sheet.f(2 * half)} × {Sheet.f(val(f, 'BC-02'))} "
            f"(h/w = {drawn_ratio:.2f}), from frame 07's",
            "same-plane pixel ratios (conflict C1: no metric scale in evidence).",
            f"The as-modeled tab therefore laps {Sheet.f((129.0 - 2 * half) / 2)} mm behind "
            f"each rail end and",
            f"stands {Sheet.f(125.5 - val(f, 'BC-02'))} mm too tall. Its scallop pitch "
            f"({Sheet.f(pitch)}) and wrap band",
            f"({Sheet.f(fold)}) already match this contract and are RETAINED; r2 re-cuts\n"
            f"only the PROFILE between cusps, from shear teeth to half-ellipse lobes.")):
        sh.text(1020, y + 20 + 15 * k, s, 9.4, fill="#8a1010")
    sh.text(1020, y + 128,
            "BC-02 and BC-09 are ESTIMATED (photo ratio, no metric scale).", 9.2, fill="#7a3a10")
    sh.text(1020, y + 143,
            "Open item O-1 / CAL-1 pins them by a cammatch solve on frame 07.", 9.2,
            fill="#7a3a10")

    solved["elevation"] = {"scallops": n, "hem_profile": "half-ellipse",
                           "cover_span_u": [-half, half],
                           "cover_span_v": [hem, top], "hem_tip_v": hem - depth}
    sh.title_block("sheet M2 of 3 · view on datum B · MIDEXT-CLOTHFREE aims its ray fan at this face")
    return sh.finish()


def sheet_plan(doc, f, sha, solved, src) -> str:
    """M3 — plan looking down: the straight back line vs the inboard crown arc."""
    S = SCALE_M3
    sh = Sheet("M3", "middle-pocket furniture — PLAN (view on datum A, looking down)",
               doc, sha, scale_note(S), src)
    ox, oy = ORIGIN_M3

    def P(u, w):
        return (ox + u * S, oy + w * S)

    _frame(sh, ox - 122 * S, oy - 34 * S, 244 * S, 160 * S,
           "VIEW ON A — looking down; +u right, +w down the sheet (outboard)")

    gap = val(f, "DT-09")
    arris, apron = val(f, "DT-04"), val(f, "DT-07")
    centre_w = val(f, "DT-03")
    half, face, thick = val(f, "BC-01"), val(f, "BC-03"), val(f, "BC-10")
    tol, ret = val(f, "BC-05"), val(f, "BC-06")
    crown_end, ct_w = val(f, "MC-03"), val(f, "CT-01")
    r_c, _rim_v = val(f, "MC-01")
    plank_in = val(f, "DT-10")  # r10: read from the row, not typed
    U_END = 118.0

    sh.line(*P(-U_END, 0), *P(U_END, 0), "#0a2a6a", 1.0, dash="9 4 2 4")
    sh.text(*P(-U_END - 2, 0), "B", 12, fill="#0a2a6a", anchor="end", weight="700")
    sh.line(*P(0, -30), *P(0, 122), "#0a2a6a", 1.0, dash="9 4 2 4")
    sh.text(*P(0, -32), "C", 12, fill="#0a2a6a", anchor="middle", weight="700")

    # rail plank in plan: present outboard of the nose line, cut away for |u| < DT-09
    for sgn in (-1, 1):
        x0, y0 = P(sgn * gap, plank_in)
        x1, y1 = P(sgn * U_END, arris)
        sh.rect(min(x0, x1), y0, abs(x1 - x0), y1 - y0, fill="#e6d9bf", stroke="#8a7a60", sw=1.2)
        sh.line(*P(sgn * gap, apron), *P(sgn * U_END, apron), "#8a7a60", 0.9, dash="6 3")
    sh.text(*P(-U_END + 3, arris + 11), "rail plank (cut away for |u| < DT-09)", 9, fill="#6a5a40")
    sh.text(*P(U_END - 3, apron - 5), "DT-07 apron face", 8.6, fill="#6a5a40", anchor="end")

    # THE LAW: the cover's back face is a STRAIGHT LINE parallel to datum B
    sh.line(*P(-half, face), *P(half, face), "#8a1010", 2.8)
    sh.line(*P(-half, face - thick), *P(half, face - thick), "#8a1010", 1.2)
    for sgn in (-1, 1):
        sh.line(*P(sgn * half, face), *P(sgn * half, face - thick - ret), "#8a1010", 1.6)
    sh.text(*P(0, face + 14),
            "BC-03 / BC-05 — cover back face: PLANE, parallel to datum B", 11,
            fill="#8a1010", anchor="middle", weight="700")
    sh.text(*P(0, face + 25),
            f"ISO 1101: flatness {Sheet.f(tol)} on the face · parallelism {Sheet.f(tol)} to B "
            f"— gate row MIDEXT-STRAIGHT holds this window over |u| ≤ BC-01",
            8.8, fill="#8a1010", anchor="middle")
    sh.line(*P(-half, face - tol / 2), *P(half, face - tol / 2), "#c08080", 0.7, dash="3 3")
    sh.line(*P(-half, face + tol / 2), *P(half, face + tol / 2), "#c08080", 0.7, dash="3 3")
    sh.text(*P(-half - 4, face - thick - ret / 2), f"BC-06 {Sheet.f(ret)}", 8.4,
            fill="#8a1010", anchor="end")

    # the ONLY arc: the inboard slate-mating crown, truncated at MC-03
    # ISO 128 line grammar: the crown is a VISIBLE outline where the plank is cut
    # away (|u| <= DT-09) and a HIDDEN outline where it runs on under the plank.
    theta = math.degrees(math.acos((crown_end - centre_w) / r_c))
    steps = 192
    run, run_hidden = [], None
    for i in range(steps + 1):
        ang = math.radians(theta + (360.0 - 2.0 * theta) * i / steps)
        u_a, w_a = r_c * math.sin(ang), centre_w + r_c * math.cos(ang)
        hidden = abs(u_a) > gap
        if run_hidden is None:
            run_hidden = hidden
        if hidden != run_hidden:
            sh.path("M " + " L ".join(f"{Sheet.c(x)} {Sheet.c(y)}" for x, y in run),
                    "#1d7a38", 1.4 if run_hidden else 2.2,
                    dash="7 4" if run_hidden else None)
            run, run_hidden = [run[-1]], hidden
        run.append(P(u_a, w_a))
    sh.path("M " + " L ".join(f"{Sheet.c(x)} {Sheet.c(y)}" for x, y in run),
            "#1d7a38", 1.4 if run_hidden else 2.2, dash="7 4" if run_hidden else None)
    sh.circle(*P(0, centre_w), 2.6, "#1d7a38", 1.2)
    sh.text(*P(3, centre_w - 4), "DT-03", 8.6, fill="#1d7a38")
    u_lead = -math.sqrt(max(0.0, r_c * r_c - (centre_w - 24.0) ** 2))
    sh.line(*P(u_lead, 24.0), *P(-66, 18.0), "#1d7a38", 0.8)
    sh.text(*P(-68, 10), "MC — slate-mating crown (the ONLY arc)", 9.8,
            fill="#1d7a38", anchor="end", weight="700")
    sh.text(*P(-68, 22),
            f"r {Sheet.f(r_c)} about DT-03, truncated at MC-03 w = {Sheet.f(crown_end)}",
            8.8, fill="#1d7a38", anchor="end")
    sh.text(*P(-68, 33),
            f"(±{Sheet.f(theta)}° from +w; crosses |u| = {Sheet.f(gap)} at "
            f"w = {Sheet.f(centre_w - math.sqrt(max(0.0, r_c * r_c - gap * gap)))} "
            f"and {Sheet.f(centre_w + math.sqrt(max(0.0, r_c * r_c - gap * gap)))})",
            8.4, fill="#1d7a38", anchor="end")

    # cloth termination plane
    sh.line(*P(-52, ct_w), *P(52, ct_w), "#0a7a2f", 1.6, dash="8 3")
    sh.text(*P(54, ct_w + 3), f"CT-01 cloth termination w = {Sheet.f(ct_w)} (|u| ≤ 50)",
            9, fill="#0a7a2f")
    # CT-04 (r9): the slot bound. Two short segments in the BC-11 gaps between
    # the cover edge and the rail ends, drawn on the cover FACE plane — this is
    # the one place cloth is legal out to BC-03, and it is what makes the cloth
    # at the rail ends visible from outside at all.
    ct4_w = val(f, "CT-04")
    for s in (-1, 1):
        sh.line(*P(s * half, ct4_w), *P(s * gap, ct4_w), "#0a7a2f", 2.2)
    sh.text(*P(0, ct4_w + 12),
            f"CT-04 = BC-03 {Sheet.f(ct4_w)} — cloth in the BC-11 slot only",
            8.6, fill="#0a7a2f", anchor="middle")
    # CT-03 (r10): the rail-end WRAP. Evidence 05 (plan) shows the rail cloth
    # running continuously over the plank's end face from the cushion jaw to
    # the cover, so the flank is drawn on the bay side of each rail end from the
    # plank's inboard face DT-10 out to CT-04 — the r1..r9 10 mm tucked fold is
    # retired. In plan a flank is a line along w at |u| = DT-09.
    wrap_len = val(f, "CT-03")
    for s in (-1, 1):
        sh.line(*P(s * gap, plank_in), *P(s * gap, ct4_w), "#0a7a2f", 2.6)
    sh.dim(*P(-gap - 22, plank_in), *P(-gap - 22, ct4_w),
           f"{Sheet.f(wrap_len)}  CT-03 = CT-04 − DT-10", off=0, size=8.8)
    sh.text(*P(0, ct4_w + 33),
            f"CT-03 (r10) = CT-04 − DT-10 = {Sheet.f(wrap_len)}: the rail cloth WRAPS the "
            f"plank end face from DT-10 {Sheet.f(plank_in)} to CT-04, at |u| = DT-09 — "
            f"evidence 05 plan: the wall beside the visible run is clothed "
            f"(20.7 / 23.6 mm at uncalibrated anchors; reach inferred, C1 / O-12)",
            8.6, fill="#0a7a2f", anchor="middle")

    # dimensions
    sh.dim(*P(-half, -12), *P(half, -12), f"{Sheet.f(2 * half)}  2 × BC-01", off=0)
    sh.dim(*P(-U_END + 8, 0), *P(-U_END + 8, face), f"{Sheet.f(face)}  BC-03", off=0)
    sh.dim(*P(U_END - 8, 0), *P(U_END - 8, arris), f"{Sheet.f(arris)}  DT-04", off=0)

    sh.letters_table(
        60, 756, 700, "PLAN — governing rows",
        [row_of(f, "BC-05", f"flatness / parallelism {Sheet.f(tol)}"),
         row_of(f, "BC-03", f"w = {Sheet.f(face)}"),
         row_of(f, "BC-06", f"return {Sheet.f(ret)}"),
         row_of(f, "MC-01", f"r = {Sheet.f(r_c)}"),
         row_of(f, "MC-03", f"w = {Sheet.f(crown_end)}"),
         row_of(f, "DT-10", f"w = {Sheet.f(plank_in)}"),
         row_of(f, "CT-01", f"w = {Sheet.f(ct_w)}"),
         row_of(f, "CT-02", f"v = {Sheet.f(val(f, 'CT-02'))}"),
         row_of(f, "CT-03", f"wrap {Sheet.f(val(f, 'CT-03'))} = CT-04 − DT-10"),
         row_of(f, "CT-04", f"w = {Sheet.f(val(f, 'CT-04'))} in the slot")])

    x = 810
    sh.text(x, 756, "OWNER FINDING, 2026-08-29 — what this sheet answers", 11.5,
            weight="700", fill="#8a1010")
    sh.text(x, 780, "「你照片里面的皮环后面是平直的, 跟桌子平行的, 你的皮环后面是一个圆弧?」",
            11, fill="#111")
    sh.text(x, 800,
            "(in your photo the back of the leather ring is straight and parallel to the table; "
            "yours is an arc)", 9, fill="#555")
    for k, s in enumerate((
            "As-modeled plan silhouette of the leather-ring family at this pocket",
            "(cn8cap-band / roll / seat): an ARC — 25 mm departure over the drawn",
            "span |u| ≤ 45.00, 34 mm over |u| ≤ 70 (conflict C2: the number the",
            "diagnosis quoted is span-dependent, so r1 fixes the span here).")):
        sh.text(x, 828 + 15 * k, s, 9.4, fill="#8a1010")
    for k, s in enumerate((
            f"r1 draws a PLANE with a {Sheet.f(tol)} mm ISO 1101 window. Gate row",
            "MIDEXT-STRAIGHT is red-armed on the as-modeled tree and holds this",
            "window afterwards. The crown above is the only arc that survives.")):
        sh.text(x, 900 + 15 * k, s, 9.4, fill="#1d7a38")

    solved["plan"] = {
        "crown_truncation_deg": theta,
        "crown_truncation_u": r_c * math.sin(math.radians(theta)),
        "wrap_w": [plank_in, ct4_w],
        "back_face_w": face,
        "tolerance_zone_w": [face - tol / 2, face + tol / 2],
        "cover_return_inner_w": face - thick - ret,
    }
    sh.title_block("sheet M3 of 3 · view on datum A · MIDEXT-STRAIGHT reads BC-05 over |u| ≤ BC-01")
    return sh.finish()


# ---------------------------------------------------------------- stroke suite


def stroke_suite_stub(doc: dict) -> dict:
    """Stroke-class conformance hook — declared STUB.

    The 489/490 lanes judge sheets with a stroke-class suite (line classes,
    weights, dash grammar). That instrument has not been forked for the
    middle-furniture sheet family; until it lands this generator reports
    SKIPPED so the gap is explicit, never silently green.
    """
    return {"status": "SKIPPED (STUB)", "reason": doc["stroke_suite"]["note"]}


# ---------------------------------------------------------------- main


def generate(source_path: Path) -> tuple[dict[str, str], dict]:
    doc, sha, _raw = load_source(source_path)
    resolved = source_path.resolve()
    try:
        src = resolved.relative_to(repo_root()).as_posix()
    except ValueError:
        src = str(resolved)
    features = feature_map(doc)
    solved: dict = {}
    checks: list[tuple[str, bool, str]] = []
    derived = run_checks(features, checks)
    # ADR-0015 chain guard: the JSON DECLARES the identities, this file ASSERTS them.
    # If the two drift apart, one of them is lying about what was verified.
    declared = len(doc["checks"]["identities"])
    if declared != len(checks):
        raise AssertionError(
            f"identity-count drift: the source declares {declared} identities in "
            f"checks.identities but run_checks() asserted {len(checks)} — the JSON and the "
            f"generator no longer agree on what is verified")
    sheets = {
        "m1-section": sheet_section(doc, features, sha, solved, src),
        "m2-elevation": sheet_elevation(doc, features, sha, solved, src),
        "m3-plan": sheet_plan(doc, features, sha, solved, src),
    }
    rev = doc["doc"]["revision"]
    files = {f"midpocket-drawing-490m-{rev}-{name}.svg": svg for name, svg in sheets.items()}
    twin = {
        "id": f"gh490m-solved-{rev}",
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
    files[f"gh490m-solved-{rev}.json"] = json.dumps(twin, ensure_ascii=False, indent=1) + "\n"
    return files, twin


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--input", type=Path, default=repo_root() / SOURCE_DEFAULT)
    parser.add_argument("--output-dir", type=Path, help="required unless --stroke-suite")
    parser.add_argument("--check", action="store_true",
                        help="regenerate and byte-compare against --output-dir")
    parser.add_argument("--stroke-suite", action="store_true",
                        help="report the stroke-suite hook status (currently a declared stub)")
    # FIX2 (review round 2 on #731): option presence is not option value — a blank or trailing path flag and a missing input path exit 2 by name
    import os as _os, sys as _sys; _sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "lib")); from argpaths import guard_paths as _guard_paths
    parser.allow_abbrev = False  # FIX2: no prefix matching — `--ou=` must not reach argparse as --out=''
    args = parser.parse_args()
    _guard_paths({'--input': 'file', '--output-dir': 'out'}, tag='gen_drawing_490m.py')  # FIX10 (Fable pass 2): after the parse — help exits 0 first; the guard is a post-parse value + existence check

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
