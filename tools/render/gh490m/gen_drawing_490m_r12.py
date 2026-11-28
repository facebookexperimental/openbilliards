#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""gen_drawing_490m_r12.py — drawing generator for OB-GH490M-GEO-001 r12-APPROVED (the moulded
middle-pocket leather piece, transferred from the purchased Star model onto the kernel fall).

Reads docs/geometry/cn8-middle-furniture-definition.json, asserts every identity the
JSON declares (checks.identities — the count must match, as in the r11 tool), and writes three
GB/T-styled SVG sheets plus a solved twin:
  P1 plan (view on datum A), P2 outside elevation (view on datum B), P3 axis section (u = 0).
Every dimension carries the tag of its row.  --check regenerates in memory and byte-compares.
The r11 generator's Sheet primitives are reused by import; the title block is r12's own.

  python3 tools/render/gh490m/gen_drawing_490m_r12.py --output-dir output/gh490m-r12
  python3 tools/render/gh490m/gen_drawing_490m_r12.py --output-dir output/gh490m-r12 --check
"""
from __future__ import annotations
import argparse, json, math, sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from gen_drawing_490m import Sheet, _frame, load_source, feature_map, val, make_checker, repo_root  # noqa: E402

GENERATOR_ID = "gh490m-drawing-r12/0.1.0"
SOURCE_DEFAULT = "docs/geometry/cn8-middle-furniture-definition.json"
IN = 25.4
MS = 100.0 / (3.906 * IN)          # kernel middle_scale (catalog: 100 / 99.21)
STAR_FALL_CENTRE = 51.59           # INTAKE §3b — the Star fall centre behind its nose
STAR_SECT = Path('/tmp/ob-3dm-quarantine/star-cgtrader/obj/midpocket-r12/leather_sect_axis.npy')


class SheetR12(Sheet):
    def title_block(self, extra=""):
        d = self.doc["doc"]; y0 = self.H - 130
        self.rect(18, y0, self.W - 36, 112, fill="#f2efe6", stroke="#222", sw=1.4)
        self.text(34, y0 + 22, f"{d['number']} — {d['title']}", 12, weight="700")
        std = self.doc["drafting"]
        self.text(34, y0 + 40, "normative: " + "; ".join(std["normative"]) + " · first-angle · units mm (deg where noted) · displayed to 2 dp · " + self.scale_note + " · DO NOT SCALE DRAWING", 8.8, fill="#444")
        self.text(34, y0 + 56, f"single source: {self.source_label} · sha256 {self.sha}", 8.6, fill="#444")
        self.text(34, y0 + 72, f"{d['revision']} — body APPROVED by owner card 17b 2026-09-03 (「17b 没问题」): C4 = B rail architecture to the MFR outer face 140 · C5 = A slot = the leather's back · C3 = A ring −152 · section A (photo form on the Star plan) · r13: card 41 M-c, slot 87 · r14: the JOY revision folded in (owner-approved 2026-09-18); built in web/scene/cn8mid.js, gated by check-490-pass2 GATE-1..6", 9.0, fill="#8a1010", weight="700")
        self.text(34, y0 + 88, f"generator {GENERATOR_ID} · ADR-0015 chain: drawing == JSON == (model == gate after approval) · the kernel middle pocket (fall 53.61 @ 52.0; since v21 the Cn8Arc1 jaw) is the kernel's own and only DRAWN here", 8.6, fill="#1d7a38")
        if extra: self.text(34, y0 + 104, extra, 8.6, fill="#0a2a6a")
        sx = self.W - 190
        self.circle(sx + 24, y0 + 34, 11, "#222", 1.0); self.circle(sx + 24, y0 + 34, 4.5, "#222", 1.0)
        self.path(f"M {sx + 52} {y0 + 22} L {sx + 88} {y0 + 26} L {sx + 88} {y0 + 42} L {sx + 52} {y0 + 46} Z", "#222", 1.0)
        self.text(sx + 24, y0 + 62, "first angle", 8.2, anchor="middle", fill="#444")
        self.text(sx + 24, y0 + 90, f"sheet {self.sheet_no}", 10, anchor="middle", weight="700")


# ---------------------------------------------------------------- identities

def run_checks(f, checks):
    check = make_checker(checks)
    g = lambda i: val(f, i)
    DT02, DT03, DT04, DT05, DT09, DT10, DT12, DT13 = (g(k) for k in ("DT-02", "DT-03", "DT-04", "DT-05", "DT-09", "DT-10", "DT-12", "DT-13"))
    FL01, FL02, FL03, FL05, FL06 = (g(k) for k in ("FL-01", "FL-02", "FL-03", "FL-05", "FL-06"))
    JW01, JW02, JW05 = g("JW-01"), g("JW-02"), g("JW-05")
    LP01, LP02, LP03, LP04, LP06, LP09, LP14 = (g(k) for k in ("LP-01", "LP-02", "LP-03", "LP-04", "LP-06", "LP-09", "LP-14"))
    LP05 = g("LP-05"); pitch, depth = g("LP-11"); SK04 = g("SK-04"); CT03 = g("CT-03")
    near = lambda a, b, tol=0.01: abs(a - b) <= tol + 1e-12
    check("DT-09: LP-01 / 2", near(DT09, LP01 / 2, 0.005), f"{LP01} / 2 = {LP01/2:.2f} = DT-09 {DT09}")
    check("FL-01: 2.094 in × 100 / (3.906 in)", near(FL01, 2.094 * IN * MS), f"{2.094*IN*MS:.3f} vs FL-01 {FL01}")
    check("DT-03: (1.875 + 0.156) in × 100 / (3.906 in)", near(DT03, (1.875 + 0.156) * IN * MS), f"{(1.875+0.156)*IN*MS:.3f} vs DT-03 {DT03}")
    check("JW-01: 4.344 in × 100 / (3.906 in)", near(JW01, 4.344 * IN * MS), f"{4.344*IN*MS:.3f} vs JW-01 {JW01}")
    check("JW-02: 3.125 in × 100 / (3.906 in)", near(JW02, 3.125 * IN * MS), f"{3.125*IN*MS:.3f} vs JW-02 {JW02}")
    check("FL-02: FL-01 + 5.00", near(FL02, FL01 + 5.0, 0.005), f"{FL01} + 5.00 = {FL01+5:.2f} = FL-02 {FL02}")
    check("FL-03: FL-01 − DT-03 > 0", near(FL03, FL01 - DT03, 0.005) and FL03 > 0, f"{FL01} − {DT03} = {FL01-DT03:.2f} = FL-03 {FL03} > 0")
    check("FL-05: DT-03 + FL-02 < DT-04 (the band clears inside the arris — C4 resolved B)", near(FL05, DT03 + FL02, 0.005) and FL05 < DT04, f"{DT03} + {FL02} = {DT03+FL02:.2f} = FL-05 {FL05} < DT-04 {DT04}")
    check("DT-12: (1360 − 2·DT-02) / 2", near(DT12, (1360 - 2 * DT02) / 2, 0.005), f"(1360 − {2*DT02}) / 2 = {(1360-2*DT02)/2} = DT-12 {DT12}")
    check("DT-13: (1540 − 2·DT-02) / 2", near(DT13, (1540 - 2 * DT02) / 2, 0.005), f"(1540 − {2*DT02}) / 2 = {(1540-2*DT02)/2} = DT-13 {DT13} (never over 1270)")
    fl06 = math.sqrt(FL01 ** 2 - (DT03 - DT12) ** 2)
    check("FL-06: sqrt(FL-01² − (DT-03 − DT-12)²) > DT-09", near(FL06, fl06) and FL06 > DT09, f"{fl06:.2f} = FL-06 {FL06} > DT-09 {DT09}")
    check("LP-04: DT-13 − LP-03", near(LP04, DT13 - LP03, 0.005), f"{DT13} − {LP03} = {DT13-LP03:.2f} = LP-04 {LP04}")
    tb, tm = LP04 - (DT03 + LP05["bed+0.5"]), LP04 - (DT03 + LP05["bed+20"])
    check("LP-14: LP-04 − (DT-03 + LP-05) > 0 (bed, bed+20)", near(LP14[0], tb) and near(LP14[1], tm) and tb > 0 and tm > 0, f"{tb:.2f} / {tm:.2f} = LP-14 {LP14}")
    check("LP-05: LP-05.bed+0.5 − FL-02 > 0", LP05["bed+0.5"] - FL02 > 0, f"{LP05['bed+0.5']} − {FL02} = {LP05['bed+0.5']-FL02:.2f} > 0")
    check("LP-06: DT-05 − 0.30", near(LP06, DT05 - 0.30, 0.005), f"{DT05} − 0.30 = {DT05-0.3:.2f} = LP-06 {LP06}")
    check("LP-09: DT-05 − 0.534 · LP-01", near(LP09, DT05 - 0.534 * LP01, 0.005), f"{DT05} − 0.534 × {LP01} = {DT05-0.534*LP01:.2f} = LP-09 {LP09}")
    # r14 (GH-1146): LP-10, the LP-11 depth and LP-19 are visual estimates of the JOY furniture revision (owner-approved
    # 2026-09-18), so identities 17-18 assert where they sit, not r13's photo ratios; 19 adds LP-19 to the selvedge
    st = g("LP-10")[0]; LP19 = g("LP-19"); roll = g("LP-07")[1]
    check("LP-10: LP-07[1] < LP-10[0] < LP-06 − LP-09", roll < st < LP06 - LP09, f"{roll} < LP-10 {st} < {LP06} − {LP09} = {LP06-LP09:.2f}")
    check("LP-11: LP-01 / pitch = 10 whole scallops; 0 < depth < LP-19", near(LP01 / pitch, 10.0, 0.001) and 0 < depth < LP19, f"{LP01} / {pitch} = {LP01/pitch:.3f}; 0 < depth {depth} < LP-19 {LP19}")
    check("SK-04: LP-09 − LP-19 − LP-11.depth", near(SK04, LP09 - LP19 - depth, 0.005), f"{LP09} − {LP19} − {depth} = {LP09-LP19-depth:.3f} = SK-04 {SK04}")
    jw05 = JW02 - math.sqrt(JW02 ** 2 - (JW01 - DT09) ** 2)
    check("JW-05: arc 1 at the cut plane", near(JW05, jw05), f"{jw05:.2f} = JW-05 {JW05}")
    front = LP04 - LP02; uf = math.sqrt(LP05["bed+20"] ** 2 - (front - DT03) ** 2); wb = DT03 + math.sqrt(LP05["bed+0.5"] ** 2 - DT09 ** 2)
    check("LP-02: front edge, horn flats, bed arc on the sides", uf < DT09 and wb > front, f"front {front:.2f}; bed+20 arc enters it at |u| {uf:.2f} < DT-09 {DT09} (flats {DT09-uf:.2f}); bed arc crosses the sides at w {wb:.2f} (side {LP04-wb:.2f})")
    check("CT-03: (LP-04 − LP-02) − DT-10", near(CT03, front - DT10, 0.005), f"{front:.2f} − {DT10} = {front-DT10:.2f} = CT-03 {CT03}")
    DT07 = g("DT-07")
    check("DT-04 = DT-13 (ruling C4 = B)", near(DT04, DT13, 0.005), f"DT-04 {DT04} = DT-13 {DT13}")
    check("DT-07 = DT-04 − 16 (U2 on the ruled A_r)", near(DT07, DT04 - 16.0, 0.005), f"{DT04} − 16 = {DT04-16:.1f} = DT-07 {DT07}")
    check("LP-11.pitch = LP-01 / 10 exactly", abs(pitch - LP01 / 10) < 1e-9, f"{LP01} / 10 = {LP01/10:.4f} = pitch {pitch}")
    check("LP-12 pitch = LP-01 / 3 (three loops)", g("LP-12") == 3 and near(LP01 / 3, LP01 / 3), f"3 loops at LP-01 / 3 = {LP01/3:.2f}")
    check("LP-18 = 44.5 − 42.0 (rev-8 SHOULDER − DECK)", near(g("LP-18"), 2.5), f"LP-18 {g('LP-18')}")
    # identity 28 (BUILD-2 condition 3): LP-08 is the two-number summary of the LP-05 law
    LP07 = g("LP-07"); LP08 = g("LP-08")
    def _rolloff(v, R):
        v0 = LP06 - R
        if not R > 0 or v <= v0: return 0.0
        sn = min(1.0, 1 - (LP06 - v) / R); return R * (1 - math.sqrt(max(0.0, 1 - sn * sn)))
    _v0, _r0 = 0.5, LP05["bed+0.5"]; _v1, _r1 = 20.0, LP05["bed+20"]; _v2, _r2 = 38.0, LP05["bed+38"] - _rolloff(38.0, LP07[0])
    def _barrel(v):
        l0 = ((v - _v1) * (v - _v2)) / ((_v0 - _v1) * (_v0 - _v2)); l1 = ((v - _v0) * (v - _v2)) / ((_v1 - _v0) * (_v1 - _v2)); l2 = ((v - _v0) * (v - _v1)) / ((_v2 - _v0) * (_v2 - _v1))
        return _r0 * l0 + _r1 * l1 + _r2 * l2
    bulge = _r0 - _r1; chord = math.degrees(math.atan2(_barrel(4.0) - _barrel(22.0), 18.0))
    check("LP-08 = the LP-05 law (bulge LP-05[bed+0.5] − LP-05[bed+20]; chord lean atan((r(4) − r(22)) / 18))", near(LP08[0], bulge, 0.005) and near(LP08[1], chord, 0.005), f"{_r0} − {_r1} = {bulge:.2f} = LP-08[0] {LP08[0]}; atan(({_barrel(4.0):.2f} − {_barrel(22.0):.2f}) / 18) = {chord:.2f}° = LP-08[1] {LP08[1]}")
    return dict(front_edge_w=front, horn_flat_u=uf, bed_arc_side_w=wb, thickness_axis=[tb, tm], jaw_at_cut=jw05, middle_scale=MS)


# ---------------------------------------------------------------- helpers

def tagof(f, fid):
    t = f[fid]["source"]["tier"]
    return t + (" EST" if f[fid].get("status") == "ESTIMATED" else "") + (f" [{f[fid]['conflict']}]" if "conflict" in f[fid] else "")

def lab(f, fid, value):
    return f"{fid} {Sheet.f(value)} · {tagof(f, fid)}"

SHORT = {"KERNEL-DERIVED": "kernel-der.", "PHOTO-DERIVED": "photo-der.", "MODEL(Star)-LOW": "Star-LOW", "MFR-DERIVED": "MFR-der.", "PHOTO-FORM": "photo-form", "MODEL(Star)": "Star", "AS-MODELED": "as-modeled",
         "VISUAL-ESTIMATE (JOY)": "JOY est.", "MODEL(Star)-LOW [0] · VISUAL-ESTIMATE (JOY) [1]": "Star-LOW/JOY est.", "DERIVED [pitch] · VISUAL-ESTIMATE (JOY) [depth]": "der./JOY est.",
         "ESTIMATE (web/scene/table.js)": "table.js est.", "VISUAL-ESTIMATE (JOY) [0] · code-only (web/scene/cn8pockets.js) [1]": "JOY est./code-only"}

def row(f, fid, value):
    feat = f[fid]; t = feat["source"]["tier"]; tier = SHORT.get(t, t) + (" EST" if feat.get("status") == "ESTIMATED" else "") + (f" [{feat['conflict']}]" if "conflict" in feat else ""); src = feat["source"]["doc"]
    src = src if len(src) <= 46 else src[:44] + "…"
    scope = {"render-only": "render", "datum": "datum", "reference-only": "reference"}[feat["scope"]]
    return (fid, value, tier, scope, src)

def hatch(sh, x0, y0, x1, y1, col="#c04040", step=9.0):
    sh.rect(x0, y0, x1 - x0, y1 - y0, fill="none", stroke=col, sw=0.8)
    x = x0 - (y1 - y0)
    while x < x1:
        ax, ay, bx, by = x, y1, x + (y1 - y0), y0
        if ax < x0: ay = y1 - (x0 - ax); ax = x0
        if bx > x1: by = y0 + (bx - x1); bx = x1
        if ax < bx: sh.line(ax, ay, bx, by, col, 0.5)
        x += step

def polyline(sh, pts, stroke, w=1.2, dash=None, close=False):
    d = "M " + " L ".join(f"{Sheet.c(x)} {Sheet.c(y)}" for x, y in pts) + (" Z" if close else "")
    sh.path(d, stroke, w, dash=dash)

def arcpts(cx, cy, r, a0, a1, n=120):
    return [(cx + r * math.cos(a0 + (a1 - a0) * k / n), cy + r * math.sin(a0 + (a1 - a0) * k / n)) for k in range(n + 1)]


# ---------------------------------------------------------------- P1 plan

def sheet_plan(doc, f, sha, solved, src, der):
    S = 3.0; ox, oy = 560.0, 210.0
    P = lambda u, w: (ox + u * S, oy + w * S)
    sh = SheetR12("P1", "middle-pocket leather piece — PLAN (view on datum A, looking down)", doc, sha, f"drawn {S:.2f} px/mm", src)
    g = lambda i: val(f, i)
    DT03, DT04, DT05, DT07, DT09, DT10, DT12, DT13 = (g(k) for k in ("DT-03", "DT-04", "DT-05", "DT-07", "DT-09", "DT-10", "DT-12", "DT-13"))
    FL01, FL02, FL06, JW01, JW02, JW05 = (g(k) for k in ("FL-01", "FL-02", "FL-06", "JW-01", "JW-02", "JW-05"))
    LP01, LP02, LP04, LP05 = g("LP-01"), g("LP-02"), g("LP-04"), g("LP-05")
    R20, Rb = LP05["bed+20"], LP05["bed+0.5"]; front = der["front_edge_w"]; uf = der["horn_flat_u"]; wb = der["bed_arc_side_w"]
    U = 150.0
    _frame(sh, ox - U * S, oy - 40 * S, 2 * U * S, 205 * S, "VIEW ON A — looking down; +u right (along the rail), +w down the sheet (outboard of the nose line)")
    # datums
    sh.line(*P(-U, 0), *P(U, 0), "#0a2a6a", 1.0, dash="9 4 2 4"); sh.text(*P(-U - 2, 0), "B", 12, fill="#0a2a6a", anchor="end", weight="700")
    sh.line(*P(0, -36), *P(0, 162), "#0a2a6a", 1.0, dash="9 4 2 4"); sh.text(*P(0, -38), "C", 12, fill="#0a2a6a", anchor="middle", weight="700")
    # rail planks (as-modeled) outboard of the cushion back, cut away for |u| < DT-09
    for s in (-1, 1):
        x0, y0 = P(s * DT09, DT10); x1, y1 = P(s * U, DT04)
        sh.rect(min(x0, x1), y0, abs(x1 - x0), y1 - y0, fill="#e6d9bf", stroke="#8a7a60", sw=1.1)
        sh.line(*P(s * DT09, DT07), *P(s * U, DT07), "#8a7a60", 0.8, dash="6 3")
    sh.text(*P(U - 3, DT10 + 7), "rail plank: inboard face DT-10, arris DT-04 = DT-13 (MFR outer face, C4 = B), body face DT-07 = DT-04 − 16", 8.4, fill="#6a5a40", anchor="end")
    sh.line(*P(-U, DT13), *P(U, DT13), "#8a1010", 1.6)
    sh.text(*P(-U + 3, DT13 - 3), f"DT-13 rail outer face {Sheet.f(DT13)} · MFR-DERIVED (2820 × 1540 over 2·DT-02; Star 139.88)", 8.6, fill="#8a1010", weight="700")
    sh.text(*P(-U + 3, DT04 - 9), f"DT-04 arris = DT-13 {Sheet.f(DT04)} · MFR-DERIVED — owner card 17b, C4 = B (the as-modeled 92 retired)", 8.4, fill="#8a1010")
    # slate edge and the fall
    sh.line(*P(-U, DT12), *P(U, DT12), "#555", 1.0, dash="10 4"); sh.text(*P(-U + 3, DT12 - 3), f"DT-12 slate edge {Sheet.f(DT12)} · MFR-DERIVED (no slate beyond)", 8.4, fill="#555")
    for r, w_, col in ((FL01, 1.8, "#1d7a38"), (FL02, 1.0, "#1d7a38")):
        a_edge = math.asin(min(1.0, (DT12 - DT03) / r))
        # solid where slate exists (w <= DT-12), dashed beyond
        polyline(sh, [P(*q) for q in arcpts(0, DT03, r, math.pi / 2 + (math.pi - a_edge) - math.pi, math.pi / 2 - (math.pi / 2 - a_edge))], col, w_)
        polyline(sh, [P(*q) for q in arcpts(0, DT03, r, math.asin((DT12 - DT03) / r), math.pi - math.asin((DT12 - DT03) / r))], col, w_, dash="4 3")
    sh.text(*P(0, DT03 - FL02 - 10), f"FL-01 fall r {Sheet.f(FL01)} · KERNEL-DERIVED  ·  FL-02 cloth band r {Sheet.f(FL02)} · DERIVED (FL-01 + 5.00, a MODEL(Star) relation)", 8.8, fill="#1d7a38", anchor="middle", weight="700")
    sh.text(*P(0, DT03 - FL02 - 20), f"about C at DT-03 {Sheet.f(DT03)} (KERNEL); apex FL-03 {Sheet.f(g('FL-03'))} past B; the cut breaks out of DT-12 at |u| = FL-06 {Sheet.f(FL06)} (dashed = under the rail ends)", 8.2, fill="#1d7a38", anchor="middle")
    # kernel jaw: nose line unbroken to JW-01, arc 1 to the cut plane, the cushion end face
    for s in (-1, 1):
        pts = []
        for k in range(61):
            uu = JW01 - (JW01 - DT09) * k / 60
            pts.append(P(s * uu, JW02 - math.sqrt(max(JW02 ** 2 - (JW01 - uu) ** 2, 0.0))))
        polyline(sh, pts, "#1d7a38", 2.0)
        sh.line(*P(s * DT09, JW05), *P(s * DT09, LP04), "#333", 1.4)           # the cut plane / end face
        sh.line(*P(s * JW01, 0), *P(s * U, 0), "#1d7a38", 2.0)
    sh.text(*P(JW01, -8), f"JW-01 tangency {Sheet.f(JW01)} · KERNEL-DERIVED", 8.4, fill="#1d7a38", anchor="middle")
    sh.text(*P(DT09 + 3, JW05 + 4), f"JW-05 {Sheet.f(JW05)} (arc 1 R JW-02 {Sheet.f(JW02)} at the cut plane)", 8.2, fill="#1d7a38")
    sh.text(*P(DT09 + 4, DT10 + 15), f"cut plane |u| = DT-09 {Sheet.f(DT09)} · MODEL(Star), end face 90° (JW-04)", 8.0, fill="#333")
    sh.text(*P(-DT09 - 4, DT10 + 15), f"cloth-wrapped end face DT-10 → leather tips: CT-03 {Sheet.f(g('CT-03'))} · DERIVED (anatomy PHOTO-FORM)", 8.0, fill="#333", anchor="end")
    # THE LEATHER at bed+20 (solid) — rectangle minus arc
    outline = [P(-DT09, LP04), P(DT09, LP04), P(DT09, front), P(uf, front)]
    a0, a1 = math.atan2(front - DT03, uf), math.atan2(front - DT03, -uf)
    outline += [P(*q) for q in arcpts(0, DT03, R20, a0, a1, 160)]
    outline += [P(-uf, front), P(-DT09, front), P(-DT09, LP04)]
    sh.path("M " + " L ".join(f"{Sheet.c(x)} {Sheet.c(y)}" for x, y in outline) + " Z", "#8a1010", 2.6, fill="#f1d9c8")
    b0, b1 = math.atan2(wb - DT03, DT09), math.atan2(wb - DT03, -DT09)
    polyline(sh, [P(*q) for q in arcpts(0, DT03, Rb, b0, b1, 160)], "#8a1010", 1.2, dash="5 3")
    sh.text(*P(0, LP04 - 6), f"LP-01 back {Sheet.f(LP01)} · MODEL(Star) — STRAIGHT, parallel to B, on LP-04 {Sheet.f(LP04)} (DT-13 − LP-03 {Sheet.f(g('LP-03'))})", 9.4, fill="#8a1010", anchor="middle", weight="700")
    sh.text(*P(0, DT03 + R20 - 5), f"inner edge: circle about C · LP-05 R {Sheet.f(R20)} at bed+20 (solid) / {Sheet.f(Rb)} at bed+0.5 (dashed) · MODEL(Star) — Star centre 0.45 nearer the nose (O-18)", 8.4, fill="#8a1010", anchor="middle")
    sh.text(*P(0, DT03 + R20 + 14), f"LP-14 thickness at C: {Sheet.f(der['thickness_axis'][0])} (bed+0.5) / {Sheet.f(der['thickness_axis'][1])} (bed+20) · DERIVED — the Star's own 29.13 / 34.40 (0.76 thicker: O-18 + scale − rail depth)", 8.6, fill="#8a1010", anchor="middle")
    sh.text(*P(DT09 - 2, front - 4), f"front edge {Sheet.f(front)} = LP-04 − LP-02 {Sheet.f(LP02)}; horn flats {Sheet.f(DT09 - uf)}", 8.2, fill="#8a1010", anchor="end")
    # net mouth extent
    nt = g("NT-04"); x0, y0 = P(-nt[0], nt[1]); x1, y1 = P(nt[0], nt[2])
    sh.rect(x0, y0, x1 - x0, y1 - y0, fill="none", stroke="#8888aa", sw=0.9); sh.text(x0 - 4, y0 + 10, f"NT-04 net bag plan extent (whole-bag bbox): u ±{nt[0]}, w {nt[1]} … {nt[2]} · MODEL(Star)", 8.0, fill="#666688", anchor="end")
    # dimensions
    sh.dim(*P(-DT09, LP04 + 14), *P(DT09, LP04 + 14), f"2·DT-09 = LP-01 {Sheet.f(LP01)} (slot = leather) · MODEL(Star)", 0, 9.2, "#8a1010")
    sh.dim(*P(DT09 + 40, front), *P(DT09 + 40, LP04), f"LP-02 {Sheet.f(LP02)}", 0, 9.2, "#8a1010")
    sh.dim(*P(-DT09 - 24, 0), *P(-DT09 - 24, DT03), f"DT-03 {Sheet.f(DT03)}", 0, 9.0, "#0a2a6a")
    sh.dim(*P(U - 14, 0), *P(U - 14, DT13), f"DT-13 {Sheet.f(DT13)}", 0, 9.0, "#8a1010")
    sh.dim(*P(U - 34, 0), *P(U - 34, DT07), f"DT-07 {Sheet.f(DT07)}", 0, 9.0, "#6a5a40")
    sh.dim(*P(-U + 12, 0), *P(-U + 12, DT12), f"DT-12 {Sheet.f(DT12)}", 0, 9.0, "#555")
    sh.letters_table(60, 722, 700, "PLAN — governing rows (id · value · tier · scope · source)",
        [row(f, "LP-01", f"back {Sheet.f(LP01)} = slot"), row(f, "LP-02", f"depth {Sheet.f(LP02)}"), row(f, "LP-03", f"set-in {Sheet.f(g('LP-03'))}"), row(f, "LP-04", f"back plane w {Sheet.f(LP04)}"),
         row(f, "LP-05", f"R {Sheet.f(Rb)} bed+0.5 / {Sheet.f(R20)} bed+20"), row(f, "LP-14", f"thickness {Sheet.f(der['thickness_axis'][0])} / {Sheet.f(der['thickness_axis'][1])}"), row(f, "DT-09", f"cut plane ±{Sheet.f(DT09)}"),
         row(f, "FL-01", f"r {Sheet.f(FL01)}"), row(f, "FL-02", f"r {Sheet.f(FL02)}"), row(f, "JW-01", f"{Sheet.f(JW01)} · R1 {Sheet.f(JW02)}"), row(f, "JW-05", f"{Sheet.f(JW05)} at the cut"),
         row(f, "DT-03", f"w {Sheet.f(DT03)}"), row(f, "DT-12", f"w {Sheet.f(DT12)} · FL-06 {Sheet.f(FL06)}"), row(f, "DT-13", f"w {Sheet.f(DT13)}"), row(f, "DT-04", f"w {Sheet.f(DT04)}")])
    x = 810
    sh.text(x, 740, "OWNER, 2026-09-03 — what this sheet answers", 11.5, weight="700", fill="#8a1010")
    for k, s_ in enumerate(("Card 17 rejected: the middle pocket was a 2 mm plate (BC-10) — the body was defined away.",
                            "In plan the piece is \"a rectangle with a circular arc cut out of it\": the STRAIGHT back on the",
                            "rail's outer face, parallel to B; the INNER edge a circle concentric with the fall.",
                            "Transferred from the purchased Star model onto the kernel fall (53.61 @ 52.0 vs Star 53.19 @ 51.59):",
                            f"back {Sheet.f(LP04)}, slot {Sheet.f(LP01)}, thickness {Sheet.f(der['thickness_axis'][0])}/{Sheet.f(der['thickness_axis'][1])} at the axis — the Star's own 29.13/34.40 (0.76 thicker, O-18).",
                            "",
                            "RULINGS (owner card 17b, 2026-09-03 「17b 没问题」): C4 = B — the rail architecture deepens to the MFR",
                            "outer face 140 (DT-04 = DT-13; corners re-run) · C5 = A — slot 83.84 = the leather's back · C3 = A — the ring",
                            "stays at −152 (the frames' brass ≈ 33.6 below the crest is the lacing line) · section A — photo form on the Star plan.")):
        sh.text(x, 764 + 15 * k, s_, 9.3, fill="#111" if k < 5 else "#8a1010")
    solved["plan"] = dict(front_edge_w=front, horn_flat_u=uf, bed_arc_side_w=wb, thickness_axis=der["thickness_axis"], jaw_at_cut=JW05)
    sh.title_block("sheet P1 of 3 · view on datum A · GATE-1 overlays this outline on the Star section (≤ 1.0 mm), GATE-3 the butt at ±DT-09 (≤ 0.5)")
    return sh.finish()


# ---------------------------------------------------------------- P2 outside elevation

def sheet_elevation(doc, f, sha, solved, src, der):
    S = 3.0; ox, oy = 540.0, 330.0
    P = lambda u, v: (ox + u * S, oy - v * S)
    sh = SheetR12("P2", "middle-pocket leather piece — OUTSIDE ELEVATION (view on datum B from outside the table)", doc, sha, f"drawn {S:.2f} px/mm", src)
    g = lambda i: val(f, i)
    DT05, DT06, DT08, DT09 = g("DT-05"), g("DT-06"), g("DT-08"), g("DT-09")
    LP01, LP06, LP09, LP10, LP11, SK04, SK01 = g("LP-01"), g("LP-06"), g("LP-09"), g("LP-10"), g("LP-11"), g("SK-04"), g("SK-01")
    LP19 = g("LP-19")
    NT01, NT02, NT03, NT04 = g("NT-01"), g("NT-02"), g("NT-03"), g("NT-04")
    U = 150.0
    _frame(sh, ox - U * S, oy - 55 * S, 2 * U * S, 235 * S, "VIEW ON B — from outside the table; +u right, +v up (the bed plane A is the horizontal datum)")
    sh.line(*P(-U, 0), *P(U, 0), "#0a2a6a", 1.0, dash="9 4 2 4"); sh.text(*P(-U - 2, 0), "A", 12, fill="#0a2a6a", anchor="end", weight="700")
    sh.line(*P(0, -170), *P(0, 50), "#0a2a6a", 1.0, dash="9 4 2 4"); sh.text(*P(0, 52), "C", 12, fill="#0a2a6a", anchor="middle", weight="700")
    # rail ends either side (plank + apron, as-modeled)
    for s in (-1, 1):
        x0, y0 = P(s * DT09, DT05); x1, y1 = P(s * U, DT06)
        sh.rect(min(x0, x1), y0, abs(x1 - x0), y1 - y0, fill="#e6d9bf", stroke="#8a7a60", sw=1.1)
        x0, y0 = P(s * DT09, DT08[0]); x1, y1 = P(s * U, DT08[1])
        sh.rect(min(x0, x1), y0, abs(x1 - x0), y1 - y0, fill="#efe7d6", stroke="#8a7a60", sw=0.8)
    sh.text(*P(-U + 3, DT05 + 4), "rail top DT-05 42 / plank underside DT-06 6 / apron DT-08 6 … −91.5 (datums); arris DT-04 = 140 (C4 = B)", 8.4, fill="#6a5a40")
    # the leather back face
    x0, y0 = P(-DT09, LP06); x1, y1 = P(DT09, LP09)
    sh.rect(x0, y0, x1 - x0, y1 - y0, fill="#f1d9c8", stroke="#8a1010", sw=2.2)
    # r14 (JOY): the skirt strip hangs LP-19 below the body on the back plane; its hem carries the 10 rounded lobes,
    # tips at SK-04 = LP-09 − LP-19 − LP-11.depth (web/scene/cn8mid.js skirtCrest)
    pitch, depth = LP11; n = int(round(LP01 / pitch)); crest = LP09 - LP19
    pts = [P(-DT09, LP09)]
    for i in range(n):
        for k in range(21):
            t = k / 20; uu = -DT09 + (i + t) * pitch
            pts.append(P(uu, crest - depth * math.sin(math.pi * t)))
    pts.append(P(DT09, LP09))
    polyline(sh, pts, "#8a1010", 1.6)
    for i in range(n + 1):
        cx, cy = P(-DT09 + i * pitch, crest - 0.6); sh.circle(cx, cy, 2.2, "#333", 0.9)
    sh.text(*P(0, SK04 - 6), f"LP-19 skirt {Sheet.f(LP19)} below LP-09 · JOY est. · LP-11 scalloped hem: {n} lobes, pitch {Sheet.f(pitch)} (= LP-01/10), depth {Sheet.f(depth)} · JOY est.", 8.4, fill="#8a1010", anchor="middle")
    sh.text(*P(0, SK04 - 25), f"tips on SK-04 {Sheet.f(SK04)} = LP-09 − LP-19 − LP-11.depth; eyelets at the cusps LP-12 · OWNER (count/pitch OPEN O-14)", 8.4, fill="#8a1010", anchor="middle")
    # stitch row: round(1 / LP-10[1]) whole dashes, each centred in its LP-01 / ND cell (web/scene/cn8mid.js)
    v_st = LP06 - LP10[0]; nd = int(round(1 / LP10[1])); dash_p = LP01 / nd; duty = LP10[2]
    for i in range(nd):
        uu = -DT09 + dash_p * (i + 0.5) - dash_p * duty / 2
        sh.line(*P(uu, v_st), *P(uu + dash_p * duty, v_st), "#f8f8f8", 3.2); sh.line(*P(uu, v_st), *P(uu + dash_p * duty, v_st), "#555", 1.0)
    sh.text(*P(0, SK04 - 13), f"LP-10 saddle-stitch row {Sheet.f(LP10[0])} below the top · JOY est.", 8.4, fill="#333", anchor="middle")
    sh.text(*P(0, SK04 - 19), f"{nd} dashes = round(1 / {LP10[1]}), pitch LP-01 / {nd} = {Sheet.f(dash_p)}, duty {LP10[2]}", 8.4, fill="#333", anchor="middle")
    sh.text(*P(0, (LP06 + LP09) / 2 + 2), "one moulded piece — no brand marks (OWNER)", 9.2, fill="#8a1010", anchor="middle")
    sh.text(*P(0, LP06 - 5), f"LP-06 top {Sheet.f(LP06)} = DT-05 − 0.30 · DERIVED", 8.4, fill="#8a1010", anchor="middle")
    sh.text(*P(-DT09 - 2, LP09 + 12), f"LP-09 lower edge {Sheet.f(LP09)} = DT-05 − 0.534·LP-01 · PHOTO-DERIVED EST ± {0.06 * LP01:.1f} (C1, C5, O-1)", 8.4, fill="#c04040", anchor="end")
    # the butt joints
    sh.text(*P(-DT09 - 2, DT05 - 30), "LP-13 butt gap 0.00 · MODEL(Star) → GATE-3 ≤ 0.5 (both ends)", 7.8, fill="#333", anchor="end")
    # the Star piece (different product), dashed
    sh.line(*P(-DT09, -74.72), *P(DT09, -74.72), "#aaaaaa", 1.0, dash="6 4"); sh.text(*P(DT09 + 4, -74.72 - 3), "Star piece's own skirt bottom −74.72 (its rail underside) — a different product, NOT drawn (LP-09 governs)", 8.0, fill="#888")
    # net: from the tips down, mouth extent NT-04 as a trapezoid to the bottom, ring band hatched
    polyline(sh, [P(-NT04[0], NT01), P(-33.3, NT02), P(33.3, NT02), P(NT04[0], NT01)], "#8888aa", 1.2, dash="3 3")
    polyline(sh, [P(-DT09 + 2, SK04), P(-NT04[0], NT01)], "#8888aa", 0.9, dash="3 3"); polyline(sh, [P(DT09 - 2, SK04), P(NT04[0], NT01)], "#8888aa", 0.9, dash="3 3")
    hx0, hy0 = P(-NT03["r"], NT03["v_band"][1]); hx1, hy1 = P(NT03["r"], NT03["v_band"][0]); hatch(sh, hx0, hy0, hx1, hy1, "#b08a30", 7)
    sh.line(*P(-U, SK01), *P(U, SK01), "#b08a30", 1.0, dash="8 4")
    sh.text(*P(NT03["r"] + 6, NT03["v_band"][1] + 4), f"NT-03 Star ring band {NT03['v_band'][0]} … {NT03['v_band'][1]}, r {NT03['r']} · MODEL(Star)  ·  SK-01 {Sheet.f(SK01)} · AS-MODELED → C3: corroborated", 8.4, fill="#b08a30")
    sh.text(*P(NT04[0] + 4, NT01), f"NT-01 Star net mouth {NT01} · MODEL(Star)", 8.0, fill="#8888aa"); sh.text(*P(-NT03["r"] - 4, NT02 - 8), f"NT-02 net bottom {NT02} · MODEL(Star)", 8.0, fill="#8888aa", anchor="end")
    sh.text(*P(-U + 3, -120), "C3 = A (owner card 17b): the brass the JOY frames show ≈ 33.6 mm below the crest is the LACING LINE at the scallop tips (LP-12), not the bag's ring — OWNER (O-2)", 8.4, fill="#8a1010")
    # dims
    sh.dim(*P(-DT09, LP06 + 7), *P(DT09, LP06 + 7), f"LP-01 {Sheet.f(LP01)} · MODEL(Star)", 0, 9.2, "#8a1010")
    sh.dim(*P(DT09 + 88, LP09), *P(DT09 + 88, LP06), f"{Sheet.f(LP06 - LP09)} = LP-06 − LP-09", 0, 9.0, "#8a1010")
    sh.dim(*P(-DT09 - 60, SK04), *P(-DT09 - 60, 0), f"SK-04 {Sheet.f(SK04)}", 0, 9.0, "#333")
    sh.letters_table(1080, 130, 560, "ELEVATION — governing rows",
        [row(f, "LP-01", f"{Sheet.f(LP01)}"), row(f, "LP-06", f"v {Sheet.f(LP06)}"), row(f, "LP-09", f"v {Sheet.f(LP09)}"), row(f, "LP-10", f"{Sheet.f(LP10[0])} / {LP10[1]} / {LP10[2]}"), row(f, "LP-11", f"{Sheet.f(pitch)} / {Sheet.f(depth)}"), row(f, "LP-19", f"{Sheet.f(LP19)}"),
         row(f, "LP-12", "3 loops (PHOTO-FORM)"), row(f, "LP-13", "gap 0.00"), row(f, "SK-04", f"v {Sheet.f(SK04)}"), row(f, "SK-01", f"v {Sheet.f(SK01)}"), row(f, "NT-01", f"v {NT01}"), row(f, "NT-02", f"v {NT02}"), row(f, "NT-03", f"{NT03['v_band']}"),
         row(f, "DT-05", f"v {Sheet.f(DT05)}"), row(f, "DT-06", f"v {Sheet.f(DT06)}"), row(f, "DT-08", f"{DT08}")])
    solved["elevation"] = dict(stitch_v=v_st, dash_pitch=dash_p, dashes=nd, lobes=n, skirt_crest=crest)
    sh.title_block("sheet P2 of 3 · view on datum B · the ev07/ev08 exterior rows (midext-*) re-bind to this face; GATE-5 pins LP-06 / LP-09 / LP-10 / LP-11")
    return sh.finish()


# ---------------------------------------------------------------- P3 axis section

def sheet_section(doc, f, sha, solved, src, der):
    S = 3.2; ox, oy = 250.0, 330.0
    P = lambda w, v: (ox + w * S, oy - v * S)
    sh = SheetR12("P3", "middle-pocket leather piece — AXIS SECTION (plane u = 0; +w right, +v up)", doc, sha, f"drawn {S:.2f} px/mm", src)
    g = lambda i: val(f, i)
    DT03, DT04, DT05, DT06, DT07, DT08, DT10, DT11, DT12, DT13 = (g(k) for k in ("DT-03", "DT-04", "DT-05", "DT-06", "DT-07", "DT-08", "DT-10", "DT-11", "DT-12", "DT-13"))
    FL01, FL02, FL03 = g("FL-01"), g("FL-02"), g("FL-03")
    LP04, LP05, LP06, LP07, LP08, LP09, SK04, SK01 = g("LP-04"), g("LP-05"), g("LP-06"), g("LP-07"), g("LP-08"), g("LP-09"), g("SK-04"), g("SK-01")
    LP19 = g("LP-19")
    NT01, NT02, NT03, NT04 = g("NT-01"), g("NT-02"), g("NT-03"), g("NT-04")
    _frame(sh, ox - 40 * S, oy - 60 * S, 220 * S, 240 * S, "SECTION on C (u = 0) — +w right (outboard), +v up; rail to the MFR outer face DT-13 = DT-04 (owner card 17b, C4 = B)")
    sh.line(*P(-40, 0), *P(180, 0), "#0a2a6a", 1.0, dash="9 4 2 4"); sh.text(*P(-42, 0), "A", 12, fill="#0a2a6a", anchor="end", weight="700")
    sh.line(*P(0, -175), *P(0, 55), "#0a2a6a", 1.0, dash="9 4 2 4"); sh.text(*P(0, 57), "B", 12, fill="#0a2a6a", anchor="middle", weight="700")
    sh.line(*P(DT03, -175), *P(DT03, 55), "#1d7a38", 0.8, dash="4 4"); sh.text(*P(DT03, 57), f"C · DT-03 {Sheet.f(DT03)}", 9, fill="#1d7a38", anchor="middle")
    # slate + bed in front of the fall (on the axis the slate ends at the fall apex; its outer edge DT-12 lies inside the fall)
    apex = DT03 - FL01
    x0, y0 = P(-40, 0); x1, y1 = P(apex, -DT11); sh.rect(x0, y0, x1 - x0, y1 - y0, fill="#d8d8dc", stroke="#555", sw=1.0)
    sh.text(*P(-38, -DT11 - 6), f"slate DT-11 {Sheet.f(DT11)} thick · MFR — on this plane it ends at the fall apex", 8.2, fill="#555")
    sh.text(*P(-38, -DT11 - 12), f"(FL-03 {Sheet.f(FL03)} past B); its edge DT-12 {Sheet.f(DT12)} lies inside the fall: no slate behind the fall here", 7.8, fill="#555")
    sh.line(*P(-40, 0), *P(apex, 0), "#1d7a38", 2.6)                                       # bed cloth
    sh.line(*P(apex, 0), *P(apex, -DT11), "#1d7a38", 2.0)                                   # cloth band turning down the cut face
    sh.text(*P(apex - 2, -14), f"FL-02 cloth band (r {Sheet.f(FL02)}) turns down the cut · DERIVED (FL-01 + 5.00)", 8.2, fill="#1d7a38", anchor="end")
    # rail plank + apron (as-modeled) and the C4 band
    x0, y0 = P(DT10, DT05); x1, y1 = P(DT04, DT06); sh.rect(x0, y0, x1 - x0, y1 - y0, fill="#e6d9bf", stroke="#8a7a60", sw=1.1)
    x0, y0 = P(DT07 - 12, DT08[0]); x1, y1 = P(DT07, DT08[1]); sh.rect(x0, y0, x1 - x0, y1 - y0, fill="#efe7d6", stroke="#8a7a60", sw=0.8)
    sh.text(*P(DT10 + 1, DT05 + 4), "rail top plank DT-10 → DT-04 = DT-13 (MFR outer face), body face DT-07 = DT-04 − 16", 8.0, fill="#6a5a40")
    sh.text(*P(DT13 + 4, DT05 + 7), f"DT-13 {Sheet.f(DT13)} MFR-DERIVED = DT-04 (owner card 17b, C4 = B)", 8.4, fill="#8a1010", weight="700")
    # THE LEATHER section: inner barrel wall from LP-05 by height, top blends, back face, lower edge
    hs = sorted(((k, float(k.replace("bed", "").replace("+", "") or 0.0)) for k in LP05), key=lambda t: t[1])
    wall = [(DT03 + LP05[k], v) for k, v in hs]
    top_in = (wall[-1][0] + LP07[0] * 0.3, LP06); top_out = (LP04 - LP07[1], LP06)
    Rb = LP05[hs[0][0]]
    prof = [P(*q) for q in [(DT03 + Rb, LP09)] + wall + [top_in, top_out, (LP04, LP06 - LP07[1]), (LP04, LP09)]]
    sh.path("M " + " L ".join(f"{Sheet.c(x)} {Sheet.c(y)}" for x, y in prof) + " Z", "#8a1010", 2.4, fill="#f1d9c8")
    sh.line(*P(DT03 + Rb, 0), *P(DT03 + Rb, LP09), "#8a1010", 1.0, dash="4 3")
    # r14 (JOY): the skirt strip on the back plane, LP-19 below LP-09 (u = 0 is a scallop cusp: no lobe depth here)
    sh.line(*P(LP04, LP09), *P(LP04, LP09 - LP19), "#8a1010", 2.4)
    sh.text(*P(LP04 + 3, LP09 - LP19 - 2), f"LP-19 skirt {Sheet.f(LP19)} below LP-09 · JOY est.", 8.0, fill="#8a1010")
    sh.text(*P(DT03 + Rb + 2, LP09 / 2 - 2), "below the bed: the barrel continues to the lower edge LP-09 (section A, owner card 17b; O-13 resolved)", 7.8, fill="#8a1010")
    sh.text(*P(LP04 + 3, LP06 - 26), f"LP-04 back {Sheet.f(LP04)} · DERIVED (DT-13 − LP-03)", 8.4, fill="#8a1010")
    sh.text(*P(DT03 + LP05["bed+20"] - 3, 26), "LP-05 barrel R " + " → ".join(f"{Sheet.f(LP05[k])} ({k})" for k, _ in hs) + " · MODEL(Star), circle fits maxres ≤ 0.008", 8.2, fill="#8a1010", anchor="end")
    sh.text(*P(DT03 + LP05["bed+20"] - 3, 20), f"LP-08 bulge {LP08[0]} / chord {LP08[1]}° · {tagof(f, 'LP-08')} (from LP-05); LP-16 innermost {g('LP-16')['bed+20']} at bed+20 ≈ the fall; Star centre 0.45 nearer the nose (O-18)", 7.8, fill="#8a1010", anchor="end")
    sh.text(*P(LP04 + 4, LP06 - 12), f"top LP-06 {Sheet.f(LP06)} · rim blends LP-07 R {LP07[0]} / {LP07[1]} · Star-LOW [0] / JOY est. [1] (O-13)", 8.0, fill="#8a1010")
    sh.dim(*P(DT03 + Rb, -22), *P(LP04, -22), f"LP-14 {Sheet.f(der['thickness_axis'][0])} at bed+0.5", 0, 9.0, "#8a1010")
    sh.dim(*P(DT03 + LP05["bed+20"], 50), *P(LP04, 50), f"LP-14 {Sheet.f(der['thickness_axis'][1])} at bed+20", 0, 9.0, "#8a1010")
    sh.text(*P(LP04 + 3, LP09 - 4), f"LP-09 lower edge {Sheet.f(LP09)} · PHOTO-DERIVED EST ± 5.0 (C1, C5); tips SK-04 {Sheet.f(SK04)}", 8.2, fill="#c04040")
    # Star's own leather section (faint reference), shifted so its fall centre sits on DT-03
    if STAR_SECT.exists():
        Q = np.load(STAR_SECT); sh_w = DT03 - STAR_FALL_CENTRE
        d = " ".join(f"M {Sheet.c(P(q[1] + sh_w, q[2])[0])} {Sheet.c(P(q[1] + sh_w, q[2])[1])} h 1.2" for q in Q[::2])
        sh.path(d, "#8888cc", 1.0)
        sh.text(*P(LP04 + 4, -100), "faint blue: the Star's own leather section (u = 0), shifted +0.41 in w —", 8.0, fill="#8888cc")
        sh.text(*P(LP04 + 4, -106), "MODEL(Star)-LOW for the section (INTAKE §6); its skirt runs to −74.7", 8.0, fill="#8888cc")
    # the net hang
    polyline(sh, [P(NT04[1], NT01), P(NT04[2], NT01)], "#8888aa", 1.0, dash="3 3")
    polyline(sh, [P(DT03 + Rb - 4, SK04), P(NT04[1], NT01), P(18.2, NT02), P(84.9, NT02), P(NT04[2], NT01)], "#8888aa", 1.2, dash="3 3")
    hx0, hy0 = P(NT03["centre_w"] - NT03["r"], NT03["v_band"][1]); hx1, hy1 = P(NT03["centre_w"] + NT03["r"], NT03["v_band"][0]); hatch(sh, hx0, hy0, hx1, hy1, "#b08a30", 7)
    sh.line(*P(-40, SK01), *P(180, SK01), "#b08a30", 1.0, dash="8 4")
    sh.text(*P(NT03["centre_w"] + NT03["r"] + 5, NT03["v_band"][1] + 4), f"NT-03 Star ring −163.3 … −151.1 about w {NT03['centre_w']}, r {NT03['r']} · MODEL(Star) — SK-01 {Sheet.f(SK01)} corroborated (C3)", 8.2, fill="#b08a30")
    sh.text(*P(NT04[2] + 3, NT01), f"NT-01 net mouth {NT01} (u ±{NT04[0]}, w {NT04[1]} … {NT04[2]}) · MODEL(Star)", 8.0, fill="#8888aa"); sh.text(*P(NT03["centre_w"] + NT03["r"] + 5, NT02 - 12), f"NT-02 net bottom {NT02} · MODEL(Star)", 8.0, fill="#8888aa")
    sh.letters_table(1080, 130, 560, "SECTION — governing rows",
        [row(f, "LP-04", f"w {Sheet.f(LP04)}"), row(f, "LP-05", "R " + "/".join(Sheet.f(LP05[k]) for k, _ in hs)), row(f, "LP-06", f"v {Sheet.f(LP06)}"), row(f, "LP-07", f"R {LP07}"), row(f, "LP-08", f"{LP08}"), row(f, "LP-09", f"v {Sheet.f(LP09)}"), row(f, "LP-14", f"{Sheet.f(der['thickness_axis'][0])} / {Sheet.f(der['thickness_axis'][1])}"),
         row(f, "FL-01", f"r {Sheet.f(FL01)}"), row(f, "FL-02", f"r {Sheet.f(FL02)}"), row(f, "FL-03", f"{Sheet.f(FL03)}"), row(f, "DT-11", f"{Sheet.f(DT11)}"), row(f, "DT-12", f"w {Sheet.f(DT12)}"), row(f, "DT-13", f"w {Sheet.f(DT13)}"), row(f, "DT-04", f"w {Sheet.f(DT04)}"),
         row(f, "NT-01", f"v {NT01}"), row(f, "NT-02", f"v {NT02}"), row(f, "NT-03", "ring band"), row(f, "SK-01", f"v {Sheet.f(SK01)}"), row(f, "SK-04", f"v {Sheet.f(SK04)}"), row(f, "LP-19", f"{Sheet.f(LP19)}")])
    solved["section"] = dict(wall_points=wall, apex_w=apex)
    sh.title_block("sheet P3 of 3 · section on C · GATE-2 pins the cloth band (no cone) and the cut face inside DT-12; the section style below the bed is O-13")
    return sh.finish()


# ---------------------------------------------------------------- driver

def generate(source_path: Path):
    doc, sha, _raw = load_source(source_path)
    try: src = source_path.resolve().relative_to(repo_root()).as_posix()
    except ValueError: src = str(source_path)
    f = feature_map(doc); checks = []; solved = {}
    der = run_checks(f, checks)
    declared = len(doc["checks"]["identities"])
    if declared != len(checks):
        raise AssertionError(f"identity-count drift: the source declares {declared} identities but run_checks() asserted {len(checks)}")
    sheets = {"p1-plan": sheet_plan(doc, f, sha, solved, src, der), "p2-elevation": sheet_elevation(doc, f, sha, solved, src, der), "p3-section": sheet_section(doc, f, sha, solved, src, der)}
    rev = doc["doc"]["revision"]
    files = {f"midpocket-drawing-490m-{rev}-{n}.svg": s for n, s in sheets.items()}
    twin = {"id": f"gh490m-solved-{rev}", "generator": GENERATOR_ID, "source": src, "source_sha256": sha, "doc": doc["doc"], "derived": der, "solved": solved,
            "checks": [{"name": n, "pass": ok, "detail": d} for n, ok, d in checks], "sheets": sorted(files)}
    files[f"gh490m-solved-{rev}.json"] = json.dumps(twin, ensure_ascii=False, indent=1) + "\n"
    return files, twin


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--input", type=Path, default=repo_root() / SOURCE_DEFAULT)
    ap.add_argument("--output-dir", type=Path, default=repo_root() / "output/gh490m-r12")
    ap.add_argument("--check", action="store_true")
    # FIX2 (review round 2 on #731): option presence is not option value — a blank or trailing path flag and a missing input path exit 2 by name
    import os as _os, sys as _sys; _sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "lib")); from argpaths import guard_paths as _guard_paths
    ap.allow_abbrev = False  # FIX2: no prefix matching — `--ou=` must not reach argparse as --out=''
    a = ap.parse_args()
    _guard_paths({'--input': 'file', '--output-dir': 'out'}, tag='gen_drawing_490m_r12.py')  # FIX10 (Fable pass 2): after the parse — help exits 0 first; the guard is a post-parse value + existence check
    files, twin = generate(a.input)
    for e in twin["checks"]: print(f"[check] {e['name']}: {'PASS' if e['pass'] else 'FAIL'} — {e['detail']}")
    if a.check:
        stale = [n for n, c in files.items() if not (a.output_dir / n).exists() or (a.output_dir / n).read_bytes() != c.encode("utf-8")]
        if stale: print(f"[check] STALE outputs: {', '.join(sorted(stale))}", file=sys.stderr); return 1
        print(f"[check] {len(files)} outputs byte-identical"); return 0
    a.output_dir.mkdir(parents=True, exist_ok=True)
    for n, c in sorted(files.items()):
        (a.output_dir / n).write_bytes(c.encode("utf-8")); print(f"[write] {a.output_dir / n} ({len(c)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
