#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""ghrox STEP 4 — pose-matched side-by-sides: purchased Rasson OX study render vs the ghrox drawing.

Standing law (owner, 2026-09-01): every RENDER stage ships a pose-matched side-by-side against
the purchased model, judged gestalt-first.  This tool builds those sheets.  Each sheet carries
three panels in ONE camera, ONE window and ONE scale:

    A  the purchased-model study render, untouched
    B  the ghrox construction alone, same window, same scale (the drawing)
    C  A and B on top of each other, plus the A1 station reads as a third colour

Panel C is the point: the render is ground truth for the purchased model, the station reads are
what I measured off it, and the ghrox construction is what the kernel entry shipped.  When all
three agree the measurement is confirmed; when B departs from A the delta is the OX-vs-model
delta the dossier already publishes, and the caption names it.

QUARANTINE.  The renders are study frames of a purchased model and live OUTSIDE the repo, under
/tmp/ob-3dm-quarantine/rasson-9ft/ortho (pass --renders to point elsewhere).  This script carries
camera parameters and numbers that are already published in the canonical JSON — no vertices, no
textures.  Its OUTPUT is a study artefact too: SVG/PNG to a scratch directory and, if the owner
wants them, to Drive labelled "never into repo/pack".  Nothing here is a deliverable drawing;
the deliverable drawings are the six ghrox sheets.

Construction comes from gen_drawing_rox — corner_construction / side_construction / val — so the
lines drawn here are the SAME single source as the sheets.  This file must never re-derive
geometry; if it needs a number that is not in the JSON, that is a finding, not a local constant.

    python3 tools/render/ghrox/sidebyside_rox.py --output-dir /tmp/ox-a1-sbs
"""
from __future__ import annotations

import argparse
import hashlib
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_drawing_rox as G  # noqa: E402

K = 1.0  # r5 / R1: the wave-A1 ball scale is REJECTED — kernel and model are both drawn in raw millimetres (G.BALL_K_CODE is a documented, rejected hypothesis)

INK = "#111111"
KERNEL = "#0b4f9e"      # what the kernel entry shipped
MODEL = "#b05a00"       # A1 station reads off the purchased model
MODEL2 = "#7a3a8a"      # second model definition (VSC vs tip, slate cut)
DATUM = "#7a7a7a"
BG = "#ffffff"


def esc(text: str) -> str:
    return (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def mm(value: float, nd: int = 2) -> str:
    return f"{G.rnd(value, nd):.{nd}f}"


# ---------------------------------------------------------------- panel frame


def render_window(pose: dict) -> tuple[float, float, float, float]:
    """The model-space rectangle the camera actually covers: (a0, a1, b0, b1)."""
    ppmm = pose["ppm"] / 1000.0
    cx, cy = pose["centre"]
    ha = pose["res"][0] / 2.0 / ppmm
    hb = pose["res"][1] / 2.0 / ppmm
    return (cx - ha, cx + ha, cy - hb, cy + hb)


class Panel:
    """One model-space window, mapped into a panel rectangle on the sheet.

    The pose fixes the camera; `win` says which part of that camera's frame this sheet shows
    (a crop, so the pocket details are not four per cent of a mostly-empty bed); the panel says
    where it lands.  Every model coordinate goes through P(), and the render image is placed
    through the SAME P(), so A, B and C are registered by construction and not by eye."""

    def __init__(self, pose: dict, x0: float, y0: float, width: float,
                 win: tuple[float, float, float, float]):
        self.pose = pose
        self.x0, self.y0, self.w = x0, y0, width
        self.wa0, self.wa1, self.wb0, self.wb1 = win
        self.s = width / (self.wa1 - self.wa0)          # sheet px per model mm
        self.h = (self.wb1 - self.wb0) * self.s

    def P(self, a: float, b: float) -> tuple[float, float]:
        return (self.x0 + (a - self.wa0) * self.s, self.y0 + (self.wb1 - b) * self.s)

    def K(self, u: float, v: float) -> tuple[float, float]:
        return self.P(*self.pose["kmap"](u, v))

    def image_rect(self) -> tuple[float, float, float, float]:
        ra0, ra1, rb0, rb1 = render_window(self.pose)
        x, y = self.P(ra0, rb1)
        return (x, y, (ra1 - ra0) * self.s, (rb1 - rb0) * self.s)


def poly(pn: Panel, pts, colour, w=1.4, dash="", fn=None, opacity=1.0) -> str:
    fn = fn or pn.P
    d = " ".join(("M" if i == 0 else "L") + f"{p[0]:.2f},{p[1]:.2f}"
                 for i, p in enumerate(fn(*q) for q in pts))
    da = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="{w}"'
            f' stroke-opacity="{opacity}"{da} stroke-linecap="round"/>')


def circle(pn: Panel, c, r, colour, w=1.4, dash="", fn=None) -> str:
    pts = [(c[0] + r * math.cos(math.radians(t)), c[1] + r * math.sin(math.radians(t)))
           for t in range(0, 361, 3)]
    return poly(pn, pts, colour, w, dash, fn)


def arc(pn: Panel, c, r, a_from, a_to, colour, w=1.4, dash="", fn=None) -> str:
    n = max(8, int(abs(a_to - a_from) / 2) + 1)
    pts = [(c[0] + r * math.cos(math.radians(a_from + (a_to - a_from) * i / n)),
            c[1] + r * math.sin(math.radians(a_from + (a_to - a_from) * i / n)))
           for i in range(n + 1)]
    return poly(pn, pts, colour, w, dash, fn)


def cross(pn: Panel, pt, colour, size=7.0, fn=None) -> str:
    fn = fn or pn.P
    x, y = fn(*pt)
    return (f'<path d="M{x - size:.2f},{y:.2f}L{x + size:.2f},{y:.2f}'
            f'M{x:.2f},{y - size:.2f}L{x:.2f},{y + size:.2f}" stroke="{colour}"'
            f' stroke-width="1.6" fill="none"/>')


def note(pn: Panel, pt, text, colour, dx=8.0, dy=-6.0, anchor="start", fn=None, size=11.0) -> str:
    fn = fn or pn.P
    x, y = fn(*pt)
    return (f'<text x="{x + dx:.2f}" y="{y + dy:.2f}" font-family="Helvetica,Arial" '
            f'font-size="{size}" fill="{colour}" text-anchor="{anchor}">{esc(text)}</text>')


def parse_side_cut_tail(sentence: str):
    """SP-14 publishes where the side slate cut leaves its fitted arc, and the leg and hook that
    carry it to the slab back edge, as a PROSE sentence rather than as structured leaves.  The
    drawing needs those three points, so it reads them back out of the published sentence instead
    of carrying a local copy that could drift from the record; if the sentence ever stops
    parsing, this refuses rather than guessing.  (Open item for r2: promote these to leaves.)"""
    dep = re.search(r"x=\+-([\d.]+), y=([\d.]+)", sentence)
    pts = re.findall(r"\(\+-([\d.]+), ([\d.]+)\)", sentence)
    if not dep or len(pts) != 2:
        raise AssertionError(
            "SP-14 arc_departure_and_hook no longer parses — refusing to draw the side slate cut: "
            + sentence)
    return ((float(dep.group(1)), float(dep.group(2))),
            (float(pts[0][0]), float(pts[0][1])),
            (float(pts[1][0]), float(pts[1][1])))


def slot(pn: Panel, i: int, text: str, colour: str) -> str:
    """A label in a fixed panel slot instead of hung off the geometry: on a crop this tight the
    geometry-anchored labels collided, ran off the panel edge and sat unreadably on the render.
    Backed by a translucent plate so panel C stays legible over the study frame."""
    # the plate was capped to the panel but the text was not, so a long caption ran out past the
    # panel edge and lost its tail; size down instead of overflowing.
    size = max(9.5, min(12.5, (pn.w - 30) / (0.585 * max(1, len(text)))))
    x, y = pn.x0 + 12, pn.y0 + pn.h - 14 - 19 * i
    w = min(pn.w - 18.0, 0.585 * size * len(text) + 10)
    return (f'<rect x="{x - 5:.1f}" y="{y - size + 1:.1f}" width="{w:.1f}" '
            f'height="{size + 6:.1f}" fill="#ffffff" fill-opacity="0.82"/>'
            + txt(x, y, text, size, colour, "bold"))


def azimuth(centre, pt) -> float:
    return math.degrees(math.atan2(pt[1] - centre[1], pt[0] - centre[0]))


def txt(x, y, text, size=12.0, colour=INK, weight="normal", anchor="start", family="Helvetica,Arial") -> str:
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{family}" font-size="{size}" '
            f'font-weight="{weight}" fill="{colour}" text-anchor="{anchor}">{esc(text)}</text>')


# ---------------------------------------------------------------- poses
# res / ppm / centre are copied from the quarantine register register-cameras.json; they are the
# camera, not a fit.  axes names the two model axes the camera projects, screen-right first.
#   plan_*  : camera on +Z looking down, up = +Y  ->  right = +X, up = +Y
#   elev_*  : camera on -Y looking along +Y, up = +Z  ->  right = +X, up = +Z


def build_poses(f: dict) -> list[dict]:
    cc, sc = G.corner_construction(f), G.side_construction(f)
    pf1 = G.val(f, "PF-01")                       # official playfield 2540 x 1270
    pf1m = G.val(f, "PF-01m")                     # model playfield, measured
    nose_x = pf1m["nose_lines"]["short_abs_x"]    # 1174.066
    nose_y = pf1m["nose_lines"]["long_abs_y"]     # 588.123
    cp9, sp9 = G.val(f, "CP-09"), G.val(f, "SP-09")
    cp14 = G.val(f, "CP-14m")
    sp14 = G.val(f, "SP-14")
    cu4m = G.val(f, "CU-04m")
    en1, en2 = G.val(f, "EN-01"), G.val(f, "EN-02")
    en3, en6 = G.val(f, "EN-03"), G.val(f, "EN-06")
    cu11 = G.val(f, "CU-11")
    rb9b = G.val(f, "RB-09b")
    sights = G.val(f, "RB-09-official") if "RB-09-official" in f else None

    back_long = cu4m["outer_wall_u"]["long"]      # 636.195 model cushion back, long rail
    back_short = cu4m["outer_wall_u"]["short"]    # 1222.139

    # ---- pose 1: corner
    def corner_draw(pn: Panel, model: bool, kernel: bool) -> list[str]:
        out = []
        lo, hi = -30.0, 250.0
        if kernel:
            # datum: the two nose lines and their intersection (shared by both frames)
            out += [poly(pn, [(lo, 0.0), (hi, 0.0)], DATUM, 1.0, "7 5", pn.K),
                    poly(pn, [(0.0, lo), (0.0, hi)], DATUM, 1.0, "7 5", pn.K),
                    cross(pn, (0.0, 0.0), DATUM, 6.0, pn.K)]
            cw, rc, rf = cc["cw"] / K, cc["rc"] / K, cc["rf"] / K
            for swap in (False, True):
                def m(u, v, sw=swap):
                    return pn.K(v, u) if sw else pn.K(u, v)
                out += [
                    poly(pn, [(lo, -cw), (hi, -cw)], KERNEL, 1.1, "4 3", m),
                    arc(pn, (cc["C"][0] / K, cc["C"][1] / K), rc,
                        cc["arc_from_deg"], cc["arc_to_deg"], KERNEL, 2.0, "", m),
                    poly(pn, [(cc["T"][0] / K, cc["T"][1] / K), (cc["D"][0] / K, cc["D"][1] / K)],
                         KERNEL, 2.0, "", m),
                ]
            out += [poly(pn, [(cc["N"][0] / K, 0.0), (0.0, cc["N"][0] / K)], KERNEL, 1.6, "9 5", pn.K),
                    circle(pn, (cc["F"][0] / K, cc["F"][1] / K), rf, KERNEL, 1.6, "5 4", pn.K),
                    cross(pn, (cc["F"][0] / K, cc["F"][1] / K), KERNEL, 6.0, pn.K),
                    slot(pn, 2, f"kernel mouth {mm(cc['mouth'], 1)} (MFR retail cut)"
                                f"  |  depth {mm(cc['depth'], 2)}"
                                f"  |  facing {mm(90.0 + math.degrees(cc['ca']), 2)} deg", KERNEL)]
        if model:
            a = cp9["def2_virtual_sharp_corner"]["vscA_long_rail_xy"]
            b = cp9["def2_virtual_sharp_corner"]["vscB_short_rail_xy"]
            ta = cp9["def1_tip_to_tip"]["tipA_long_rail_xy"]
            tb = cp9["def1_tip_to_tip"]["tipB_short_rail_xy"]
            cut_ends = cp14["arc_ends_where_the_cut_meets_the_straight_slab_edges_model_mm"]
            out += [poly(pn, [a, b], MODEL, 1.8, ""),
                    cross(pn, a, MODEL, 6.0), cross(pn, b, MODEL, 6.0),
                    poly(pn, [ta, tb], MODEL, 1.3, "5 4"),
                    arc(pn, cp14["centre_xy_model_mm"],
                        cp14["radius_vs_height_REPLICATED_mm"]["-10"],
                        azimuth(cp14["centre_xy_model_mm"], cut_ends[0]),
                        azimuth(cp14["centre_xy_model_mm"], cut_ends[1]) + 360.0,
                        MODEL2, 1.6, "6 4"),
                    cross(pn, cp14["centre_xy_model_mm"], MODEL2, 6.0),
                    slot(pn, 0, f"model VSC {mm(cp9['def2_virtual_sharp_corner']['mouth_raw_mm'], 2)}"
                                f"  /  tip-to-tip {mm(cp9['def1_tip_to_tip']['mouth_raw_mm'], 2)}",
                         MODEL),
                    slot(pn, 1, f"model slate cut R {mm(cp14['radius_vs_height_REPLICATED_mm']['-10'], 2)} "
                                f"about {mm(cp14['centre_xy_model_mm'][0], 1)}, "
                                f"{mm(cp14['centre_xy_model_mm'][1], 1)}"
                                f"  (arc only: the cut ends where it meets the straight slab edges)",
                         MODEL2),
                    poly(pn, [(nose_x - 240, back_long), (back_short, back_long),
                              (back_short, nose_y - 240)], MODEL, 1.1, "3 3")]
        return out

    # ---- pose 2: middle
    def side_draw(pn: Panel, model: bool, kernel: bool) -> list[str]:
        out = []
        lo, hi = -240.0, 240.0
        if kernel:
            out += [poly(pn, [(lo, 0.0), (hi, 0.0)], DATUM, 1.0, "7 5", pn.K),
                    poly(pn, [(0.0, -110.0), (0.0, 140.0)], DATUM, 1.0, "7 5", pn.K),
                    cross(pn, (0.0, 0.0), DATUM, 6.0, pn.K)]
            cw, rs, rf = sc["cw"] / K, sc["rs"] / K, sc["rf"] / K
            for sgn in (1.0, -1.0):
                def m(u, v, g=sgn):
                    return pn.K(g * u, v)
                out += [
                    poly(pn, [(lo, -cw), (hi, -cw)], KERNEL, 1.1, "4 3", m),
                    arc(pn, (sc["C"][0] / K, sc["C"][1] / K), rs,
                        sc["arc_from_deg"], sc["arc_to_deg"], KERNEL, 2.0, "", m),
                    poly(pn, [(sc["T"][0] / K, sc["T"][1] / K), (sc["D"][0] / K, sc["D"][1] / K)],
                         KERNEL, 2.0, "", m),
                ]
            out += [poly(pn, [(sc["N"][0] / K, 0.0), (-sc["N"][0] / K, 0.0)], KERNEL, 1.6, "9 5", pn.K),
                    circle(pn, (0.0, sc["F"][1] / K), rf, KERNEL, 1.6, "5 4", pn.K),
                    cross(pn, (0.0, sc["F"][1] / K), KERNEL, 6.0, pn.K),
                    slot(pn, 2, f"kernel mouth {mm(sc['mouth'], 1)} (MFR retail cut)"
                                f"  |  depth {mm(sc['depth'], 3)}"
                                f"  |  facing {mm(90.0 + sc['dev'], 2)} deg", KERNEL)]
        if model:
            vsc = sp9["vsc_at_nose_crest_bed+35.5"] / 2.0
            tip = sp9["nose_face_end_at_bed+35.5"] / 2.0
            fit = sp14["first_pass_fit"]
            dep, leg, hook = parse_side_cut_tail(sp14["arc_departure_and_hook"])
            out += [poly(pn, [(-vsc, nose_y), (vsc, nose_y)], MODEL, 1.8, ""),
                    cross(pn, (-vsc, nose_y), MODEL, 6.0), cross(pn, (vsc, nose_y), MODEL, 6.0),
                    poly(pn, [(-tip, nose_y), (tip, nose_y)], MODEL, 1.3, "5 4"),
                    arc(pn, fit["centre"], fit["R"],
                        azimuth(fit["centre"], (-dep[0], dep[1])),
                        azimuth(fit["centre"], dep), MODEL2, 1.6, "6 4"),
                    poly(pn, [dep, leg, hook], MODEL2, 1.4, "6 4"),
                    poly(pn, [(-dep[0], dep[1]), (-leg[0], leg[1]), (-hook[0], hook[1])],
                         MODEL2, 1.4, "6 4"),
                    cross(pn, fit["centre"], MODEL2, 6.0),
                    poly(pn, [(lo, back_long), (hi, back_long)], MODEL, 1.1, "3 3"),
                    slot(pn, 0, f"model VSC {mm(sp9['vsc_at_nose_crest_bed+35.5'], 2)}"
                                f"  /  nose-face end {mm(sp9['nose_face_end_at_bed+35.5'], 2)}"
                                f"  (both at the nose crest, bed+35.5)", MODEL),
                    slot(pn, 2, f"model slate cut: front arc R {mm(fit['R'], 2)} about 0, "
                                f"{mm(fit['centre'][1], 2)}  (R = "
                                f"{mm(sp14['fit_vs_window_bed-10_sampled']['|x|<25']['R'], 2)} "
                                f"if fitted on |x| < 25 only)", MODEL2),
                    slot(pn, 1, "not a circle: the arc departs, then legs and a hook carry the cut "
                                "to the slab back edge", MODEL2)]
        return out

    # ---- pose 3: whole plan
    def plan_draw(pn: Panel, model: bool, kernel: bool) -> list[str]:
        out = []
        L, W = pf1[0] / 2.0, pf1[1] / 2.0
        if kernel:
            out += [poly(pn, [(-L, -W), (L, -W), (L, W), (-L, W), (-L, -W)], KERNEL, 2.0),
                    poly(pn, [(-L / K, -W / K), (L / K, -W / K), (L / K, W / K),
                              (-L / K, W / K), (-L / K, -W / K)], KERNEL, 1.3, "8 5"),
                    slot(pn, 2, f"kernel {mm(pf1[0], 0)} x {mm(pf1[1], 0)} official 9-ft; "
                                f"(R1: no ball scale — the official datum is drawn raw)",
                         KERNEL)]
            # kernel pocket mouths, drawn where the official playfield puts them
            hm = cc["mouth"] / 2.0 / math.sqrt(2.0)
            for sx in (1, -1):
                for sy in (1, -1):
                    out.append(poly(pn, [(sx * (L - 2 * hm), sy * W), (sx * L, sy * (W - 2 * hm))],
                                    KERNEL, 2.2))
                out.append(poly(pn, [(-sc["mouth"] / 2.0, sx * W), (sc["mouth"] / 2.0, sx * W)],
                                KERNEL, 2.2))
        if model:
            lm, wm = pf1m["length_mm"] / 2.0, pf1m["width_mm"] / 2.0
            out += [poly(pn, [(-lm, -wm), (lm, -wm), (lm, wm), (-lm, wm), (-lm, -wm)], MODEL, 1.8),
                    slot(pn, 1, f"model {mm(pf1m['length_mm'], 1)} x {mm(pf1m['width_mm'], 1)} "
                                f"({rb9b['grid_vs_playfield']['playfield_in'][0]:.2f} x "
                                f"{rb9b['grid_vs_playfield']['playfield_in'][1]:.2f} in) = "
                                f"8-ft-pro", MODEL),
                    slot(pn, 0, f"short by {mm(pf1[0] - pf1m['length_mm'], 1)} "
                                f"({100 * (1 - pf1m['length_mm'] / pf1[0]):.2f} %) and "
                                f"{mm(pf1[1] - pf1m['width_mm'], 1)} "
                                f"({100 * (1 - pf1m['width_mm'] / pf1[1]):.2f} %) — the EN-07 build factors "
                                f"{G.val(f, 'EN-07')['along_the_length_TCS_Y']:g} / "
                                f"{G.val(f, 'EN-07')['across_the_width_TCS_X']:g} carry the length; no ball scale (R1)", MODEL)]
        return out

    # ---- pose 4: sights
    def sights_draw(pn: Panel, model: bool, kernel: bool) -> list[str]:
        out = []
        lr = rb9b["long_rails"]
        if kernel:
            # the WPA/official grid the kernel entry pins: L/8 pitch off the official 2540 playfield,
            # and the WPA sight inset, which is a published offset in its own right and NOT half a
            # rail width.  Drawn from the MODEL's nose line so the two layouts are comparable in
            # this pose; the disagreement is C13.
            # RB-07 = [317.5, 93.6625]: 12 1/2 in pitch (= playfield length / 8 on a 9 ft) and the
            # WPA "centre 3 11/16 in from the nose" inset, 3.6875 x 25.4 = 93.6625 mm.  Half of a
            # 6 in rail would be 76.2 mm, which is a different number and not what RB-07 carries.
            pitch, inset = G.val(f, "RB-07")
            y = nose_y + inset
            out.append(poly(pn, [(-60.0, y), (1300.0, y)], KERNEL, 1.0, "7 5"))
            for i in (1, 2, 3):   # three diamonds per half rail; the 4th station is the corner
                x = i * pitch
                out += [circle(pn, (x, y), 15.5, KERNEL, 1.8),
                        note(pn, (x, y), f"{mm(x, 1)}", KERNEL, 0, -22, "middle", None, 10.5)]
            # slot, not hung off the geometry: model x=0 is outside this crop, so a note anchored
            # there was clipped away to half a word.
            out.append(slot(pn, 1, f"kernel / WPA grid RB-07: pitch L/8 = {mm(pitch, 1)}, "
                                   f"inset {mm(inset, 2)} from the nose", KERNEL))
        if model:
            y = lr["abs_y_centre_mm"]
            out += [poly(pn, [(-60.0, nose_y), (1300.0, nose_y)], DATUM, 1.2, "9 5"),
                    note(pn, (1100.0, nose_y), "model long-rail nose line", DATUM, 0, -7, "end"),
                    poly(pn, [(-60.0, y), (1300.0, y)], MODEL, 1.0, "7 5")]
            for x in lr["x_mm"]:
                if x <= 0:
                    continue
                out += [circle(pn, (x, y), 15.5, MODEL, 1.8),
                        note(pn, (x, y), f"{mm(x, 1)}", MODEL, 0, 30, "middle", None, 10.5)]
            out.append(slot(pn, 0, f"model grid: pitch {mm(lr['pitch_mean_mm'], 2)}, "
                                   f"inset {mm(lr['inset_from_nose_mm'], 2)} from the nose", MODEL))
        return out

    # ---- pose 5: side elevation
    def elev_draw(pn: Panel, model: bool, kernel: bool) -> list[str]:
        out = []
        if kernel:
            hl = en1[0] / 2.0
            out += [poly(pn, [(-hl, 0.0), (hl, 0.0), (hl, en2), (-hl, en2), (-hl, 0.0)], KERNEL, 2.0),
                    note(pn, (0.0, en2), f"official envelope EN-01 {mm(en1[0], 0)} long x "
                                         f"EN-02 {mm(en2, 0)} high", KERNEL, 0, -10, "middle"),
                    poly(pn, [(-hl, en2 - cu11["rail_cap_crest_mm"]["long"]),
                              (hl, en2 - cu11["rail_cap_crest_mm"]["long"])], KERNEL, 1.2, "8 5"),
                    note(pn, (-hl, en2 - cu11["rail_cap_crest_mm"]["long"]),
                         f"official bed = EN-02 - crest = {mm(en2 - cu11['rail_cap_crest_mm']['long'], 2)}"
                         f"  (DERIVED, not published)", KERNEL, 8, -6)]
        if model:
            env = en6["table_envelope"]
            out += [poly(pn, [(env["x"][0], 0.0), (env["x"][1], 0.0), (env["x"][1], en6["height"]),
                              (env["x"][0], en6["height"]), (env["x"][0], 0.0)], MODEL, 1.8),
                    poly(pn, [(env["x"][0], en6["bed_top_z"]), (env["x"][1], en6["bed_top_z"])],
                         MODEL, 1.2, "8 5"),
                    note(pn, (env["x"][1], en6["bed_top_z"]),
                         f"model bed {mm(en6['bed_top_z'], 2)}", MODEL, -8, 16, "end"),
                    note(pn, (0.0, 0.0), f"model envelope {mm(en6['length'], 2)} long x "
                                         f"{mm(en6['height'], 2)} high", MODEL, 0, 24, "middle"),
                    poly(pn, [(env["x"][0] - 120, 0.0), (env["x"][1] + 120, 0.0)], DATUM, 1.4)]
        return out

    # ---- pose 6: pedestal elevation
    def ped_draw(pn: Panel, model: bool, kernel: bool) -> list[str]:
        out = []
        bow = en3["end_leg_bow"]
        ped = en6["pedestal_envelope"]
        if kernel:
            out += [slot(pn, 1, "no official pedestal geometry exists to draw", DATUM),
                    slot(pn, 0, "O10 / C9 keep the two-plate leg TO-BE-MEASURED", DATUM)]
        if model:
            c = bow["centre_xz"]
            top = ped["top_ring_z"]
            for r, w in ((bow["R_in"], 1.8), (bow["R_out"], 1.8)):
                a0 = math.degrees(math.asin(max(-1.0, min(1.0, (0.0 - c[1]) / r))))
                a1 = math.degrees(math.asin(max(-1.0, min(1.0, (top - c[1]) / r))))
                out.append(arc(pn, c, r, a0, a1, MODEL, w))
            out += [poly(pn, [(ped["abs_x_pads_z0.5"], 0.0), (100.0, 0.0)], DATUM, 1.4),
                    poly(pn, [(bow["abs_x_at_top_z635.16"]["inner"], top),
                              (bow["abs_x_at_top_z635.16"]["outer"], top)], MODEL, 1.6),
                    cross(pn, c, MODEL2, 7.0),
                    note(pn, c, f"bow centre {mm(c[0], 2)}, {mm(c[1], 2)}", MODEL2, 10, -8),
                    note(pn, (bow["abs_x_at_floor_z0"]["inner"], 90.0),
                         f"R_in {mm(bow['R_in'], 2)} / R_out {mm(bow['R_out'], 2)}  "
                         f"(rms {bow['fit_rms']}, max {bow['fit_max']})", MODEL, -14, 0, "end"),
                    note(pn, (bow["abs_x_at_top_z635.16"]["outer"], top),
                         f"top ring z {mm(top, 2)}", MODEL, 12, -8)]
        return out

    return [
        dict(key="corner", png="plan_corner.png", res=(1400, 1400), ppm=2800.0,
             centre=(1160.0, 575.0), axes=("+X", "+Y"), layout="row", draw=corner_draw,
             sheet_w=2200.0, win=(1078.0, 1328.0, 492.0, 742.0),
             kmap=lambda u, v: (nose_x - u, nose_y - v),
             title="POSE 1 - corner pocket, plan",
             sub="ghrox S1 corner construction vs the purchased model's +X+Y corner",
             ball="kernel and model both in raw millimetres (R1: the ball scale is rejected; the mouths differ by the cut)"),
        dict(key="middle", png="plan_middle.png", res=(1400, 1400), ppm=2800.0,
             centre=(0.0, 620.0), axes=("+X", "+Y"), layout="row", draw=side_draw,
             sheet_w=2200.0, win=(-155.0, 155.0, 505.0, 815.0),
             kmap=lambda u, v: (u, nose_y - v),
             title="POSE 2 - middle pocket, plan",
             sub="ghrox S2 side construction vs the purchased model's +Y middle",
             ball="kernel and model both in raw millimetres (R1: the ball scale is rejected; the mouths differ by the cut)"),
        dict(key="plan", png="plan_full.png", res=(1800, 1020), ppm=600.0,
             centre=(0.0, 0.0), axes=("+X", "+Y"), layout="row", draw=plan_draw,
             sheet_w=2200.0, win=(-1370.0, 1370.0, -790.0, 790.0),
             kmap=lambda u, v: (u, v),
             title="POSE 3 - whole playfield, plan",
             sub="ghrox S4 playfield extents vs the purchased model's footprint",
             ball="official mm take NO ball scale; the dashed rectangle is the same kernel "
                  "playfield divided by k, for reference only"),
        dict(key="sights", png="plan_sights.png", res=(1800, 500), ppm=1285.714,
             centre=(600.0, 660.0), axes=("+X", "+Y"), layout="stack", draw=sights_draw,
             sheet_w=1900.0, win=(150.0, 1120.0, 530.0, 775.0),
             kmap=lambda u, v: (u, v),
             title="POSE 4 - long-rail sight grid",
             sub="the grid the kernel pins vs the grid the purchased model carries (conflict C13)",
             ball="both grids drawn raw off the model's own nose line; no ball scale on either"),
        dict(key="elev", png="elev_side.png", res=(2400, 800), ppm=800.0,
             centre=(0.0, 420.0), axes=("+X", "+Z"), layout="stack", draw=elev_draw,
             sheet_w=1900.0, win=(-1520.0, 1520.0, -45.0, 905.0),
             kmap=lambda u, v: (u, v),
             title="POSE 5 - long-side elevation",
             sub="official OX envelope EN-01/EN-02 vs the purchased model's measured envelope",
             ball="official mm take NO ball scale"),
        dict(key="pedestal", png="elev_pedestal.png", res=(1600, 1050), ppm=1230.769,
             centre=(750.0, 400.0), axes=("+X", "+Z"), layout="row", draw=ped_draw,
             sheet_w=2200.0, win=(620.0, 1220.0, -40.0, 720.0),
             kmap=lambda u, v: (u, v),
             title="POSE 6 - pedestal leg bow, elevation",
             sub="the A1 measurement of the leg bow replayed onto the frame it was measured from",
             ball="measurement check only - no official pedestal geometry exists yet (O10)"),
    ]


# ---------------------------------------------------------------- sheet


PANELS = (
    ("A", "purchased-model study render, untouched", False, False, 1.00),
    ("B", "ghrox drawing - same camera, same window, same scale", False, True, 0.00),
    ("C", "overlay: render + drawing + A1 station reads", True, True, 0.60),
)

MARGIN = 26.0
GUTTER = 20.0
HEAD = 78.0
LABEL = 28.0

# The study renders are matte light-grey clay: edge contrast is poor and an overlay stroke on top
# of them reads as noise.  This stretches the 0.45-0.85 grey band across the full range so the
# silhouette the overlay is being judged against is actually visible.
# The clay greys measure 0.34 .. 0.78; this stretches that band to 0.03 .. 0.97.
# color-interpolation-filters="sRGB" is NOT optional: the SVG default is linearRGB, and the same
# slope applied there crushes the whole render to black.
POP = ('<filter id="pop" x="0%" y="0%" width="100%" height="100%" '
       'color-interpolation-filters="sRGB">'
       '<feComponentTransfer>'
       '<feFuncR type="linear" slope="2.087" intercept="-0.669"/>'
       '<feFuncG type="linear" slope="2.087" intercept="-0.669"/>'
       '<feFuncB type="linear" slope="2.087" intercept="-0.669"/>'
       '</feComponentTransfer></filter>')


def build_sheet(pose: dict, renders: Path, doc_id: str, rev: str, src_sha: str):
    sheet_w = float(pose.get("sheet_w", 1680.0))
    win = pose.get("win") or render_window(pose)
    if pose["layout"] == "row":
        pw = (sheet_w - 2 * MARGIN - 2 * GUTTER) / 3.0
        probe = Panel(pose, 0, 0, pw, win)
        rows = [(MARGIN + i * (pw + GUTTER), HEAD + LABEL) for i in range(3)]
        body_h = probe.h + LABEL
    else:
        pw = sheet_w - 2 * MARGIN
        probe = Panel(pose, 0, 0, pw, win)
        rows = [(MARGIN, HEAD + LABEL + i * (probe.h + LABEL + GUTTER)) for i in range(3)]
        body_h = 3 * (probe.h + LABEL) + 2 * GUTTER
    cap_y = HEAD + body_h + 34.0
    sheet_h = cap_y + 150.0

    href = pose["local_png"]  # F2: content-hashed copy name (see main)
    ra0, ra1, rb0, rb1 = render_window(pose)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
           f'width="{sheet_w:.0f}" height="{sheet_h:.0f}" '
           f'viewBox="0 0 {sheet_w:.0f} {sheet_h:.0f}">',
           f'<defs>{POP}</defs>',
           f'<rect width="{sheet_w:.0f}" height="{sheet_h:.0f}" fill="{BG}"/>']

    out += [txt(MARGIN, 30, pose["title"], 20, INK, "bold"),
            txt(MARGIN, 51, pose["sub"], 13, "#333333"),
            txt(MARGIN, 68, f'camera {pose["axes"][0]} right / {pose["axes"][1]} up, '
                            f'{pose["res"][0]}x{pose["res"][1]} px at {pose["ppm"]:.3f} px/m; '
                            f'panel window {pose["axes"][0][1]} {win[0]:.0f}..{win[1]:.0f}, '
                            f'{pose["axes"][1][1]} {win[2]:.0f}..{win[3]:.0f} mm at '
                            f'{pw / (win[1] - win[0]):.2f} px/mm - {pose["ball"]}', 11, "#555555"),
            txt(sheet_w - MARGIN, 30, f"{doc_id} {rev}  -  STUDY ARTEFACT, never into repo/pack",
                11.5, "#8a2b2b", "bold", "end"),
            txt(sheet_w - MARGIN, 47, f"canonical JSON sha256 {src_sha[:16]}", 10.5, "#666666",
                "normal", "end"),
            txt(sheet_w - MARGIN, 63, f"generator {G.GENERATOR_ID} / sidebyside_rox {SBS_VERSION}", 10.5,
                "#666666", "normal", "end"),
            txt(sheet_w - MARGIN, 79, f"render {pose['png']} sha256 {pose['render_sha'][:16]} "
                f"(quarantine, outside the repo; copied as {pose['local_png']})",
                10.5, "#666666", "normal", "end")]

    for (tag, cap, model, kernel, alpha), (px, py) in zip(PANELS, rows):
        pn = Panel(pose, px, py, pw, win)
        ix, iy, iw, ih = pn.image_rect()
        cid = f"clip-{pose['key']}-{tag}"
        out += [txt(px, py - 9, f"{tag}  -  {cap}", 12.5, INK, "bold"),
                f'<clipPath id="{cid}"><rect x="{px:.2f}" y="{py:.2f}" width="{pn.w:.2f}" '
                f'height="{pn.h:.2f}"/></clipPath>',
                f'<g clip-path="url(#{cid})">',
                f'<rect x="{px:.2f}" y="{py:.2f}" width="{pn.w:.2f}" height="{pn.h:.2f}" fill="{BG}"/>']
        if alpha > 0.0:
            out.append(f'<image x="{ix:.2f}" y="{iy:.2f}" width="{iw:.2f}" height="{ih:.2f}" '
                       f'xlink:href="{href}" opacity="{alpha:.2f}" filter="url(#pop)" '
                       f'preserveAspectRatio="none"/>')
        out += pose["draw"](pn, model, kernel)
        out += ['</g>',
                f'<rect x="{px:.2f}" y="{py:.2f}" width="{pn.w:.2f}" height="{pn.h:.2f}" '
                f'fill="none" stroke="#999999" stroke-width="1"/>']

    y = cap_y
    out.append(txt(MARGIN, y, "LEGEND", 12.5, INK, "bold"))
    for colour, label in ((KERNEL, "ghrox drawing - the geometry the kernel entry ships"),
                          (MODEL, "A1 station read off the purchased model (primary definition)"),
                          (MODEL2, "A1 station read, second definition / slate cut / fit centre"),
                          (DATUM, "datum shared by both frames")):
        y += 18
        out += [f'<rect x="{MARGIN:.0f}" y="{y - 8:.0f}" width="28" height="3" fill="{colour}"/>',
                txt(MARGIN + 38, y, label, 11.5, "#333333")]
    return out, sheet_w, sheet_h, cap_y


def finish(parts, sheet_w, cap_y, verdict: list[str]) -> str:
    out = list(parts)
    x = sheet_w * 0.34
    y = cap_y
    out.append(txt(x, y, "READ (written after opening this frame)", 12.5, INK, "bold"))
    for line in verdict:
        y += 18
        out.append(txt(x, y, line, 11.5, "#222222"))
    out.append('</svg>')
    return "\n".join(out)


# ---------------------------------------------------------------- reads
# Written by hand AFTER opening each rendered frame, one plain sentence per pose (owner law,
# 2026-09-01).  They are placed on the sheet so the judgement travels with the picture.
#
# F3 (review review round 1, P2): a read is a statement about ONE definition and ONE render, so each
# is PINNED to the sha256 of the definition JSON and of the study render it was written against.
# If either input changes, the tool REFUSES to draw that pose and names the stale read — a caption
# may not keep claiming what an older input said.  To refresh: open the new frame, re-write the
# sentence if needed, and paste the hashes `--print-read-pins` prints.  Every number inside a read
# is interpolated from the definition (never typed), so the text cannot drift from the JSON either.

SBS_VERSION = "1.2.1"


def read_text(key: str, f: dict, doc: dict) -> list[str]:
    """The hand-written read for a pose, with every number formatted from the JSON."""
    spec = doc["kernel_pinning"]["spec_m"]
    corner_k = spec["corner_mouth"] * 1000.0  # raw (R1): the MFR retail mouth, no ball scale
    side_k = spec["side_mouth"] * 1000.0
    cp09 = G.val(f, "CP-09")["def2_virtual_sharp_corner"]["mouth_raw_mm"]
    sp09 = G.val(f, "SP-09")["vsc_at_nose_crest_bed+35.5"]
    pf = G.val(f, "PF-01")
    en01 = G.val(f, "EN-01")
    bed_model = G.val(f, "PF-05")["bed_cloth_plane_measured_z_mm"]
    bed_official = G.val(f, "EN-02") - G.val(f, "CU-11")["rail_cap_crest_mm"]["long"]
    body_len = G.val(f, "EN-06")["length"]
    bow = G.val(f, "EN-03")["end_leg_bow"]
    inset_gap = G.val(f, "RB-07")[1] - G.val(f, "RB-09b")["long_rails"]["inset_from_nose_mm"]
    reads = {
        "corner": [
            "Same corner: the model's slate-cut arc lies on the render's cup edge and the model's jaw lines lie along the rendered facings, while the kernel's",
            f"official-mm construction stands outside them on a corner of the same shape and facing direction - a wider mouth ({corner_k:.1f} MFR retail cut vs the model's {cp09:g}",
            "VSC), not a different pocket.",
        ],
        "middle": [
            "Same middle pocket: the kernel's two jaw lines land on the rendered cushion ends and the model's fitted front arc lies on the render's cup edge, but",
            f"the kernel mouth is again the wider of the two ({side_k:.1f} MFR retail cut vs the model's {sp09:g} VSC event cut) and the cut behind the arc is plainly not a circle in the frame.",
        ],
        "plan": [
            f"Same table in outline, wrong size: the model rectangle sits exactly on the render's four cushion noses while the official {pf[0]:g} x {pf[1]:g} playfield stands",
            "off it on all four sides - the purchased model is an 8-ft-pro playfield (true-size in mm, R1) and only the EN-07 build",
            "factors carry its lengths to the 9-ft datum; the shapes are the model's.",
        ],
        "sights": [
            "The two grids disagree at a glance: the model circles sit on the rendered diamonds, while the WPA/RB-07 stations start slightly right of the first",
            f"diamond and walk further out at each one until the third is nearly a diamond's width off, and the kernel row also sits ~{inset_gap:.0f} mm deeper into the rail",
            "than the model's row - conflict C13, visible.",
        ],
        "elev": [
            f"Same silhouette from the side - flat rail deck carried on one bowed pedestal - and the bed heights agree almost exactly (model {bed_model:.2f} vs the official",
            f"EN-02-minus-crest {bed_official:.2f}), but the official envelope box hangs off both ends: the model body measures {body_len:g} long against EN-01's {en01[0]:g}.",
        ],
        "pedestal": [
            f"The measured bow is the render's bow: both fitted arcs (R_in {bow['R_in']:g} / R_out {bow['R_out']:g}, rms {bow['fit_rms']:.2f}) run along the leg's own edges from the top ring down to",
            "the floor pad with no daylight I can see, which is what a 0.3 mm fit should look like; there is nothing official to draw against it (O10/C9 still",
            "TO-BE-MEASURED).",
        ],
    }
    return reads[key]


# (definition sha256, study-render sha256) each read was written against.  Both must match the live
# inputs or the pose is refused.  Re-pin ONLY after re-opening the new frame.
# r9b: the definition sha moved (r7 -> r9b) because the document GREW the four appearance rows
# RC-24..27 and re-stated SP-07's stale derivation sentence.  Every leaf these six reads
# interpolate (kernel_pinning, CP-09, SP-09, PF-01/05, EN-01/02/03/06, CU-11, RB-07, RB-09b) is
# byte-identical across that move, and each of the six sheets was re-opened before re-pinning;
# the sentences stand as written.
READ_PINS: dict[str, tuple[str, str]] = {
    "corner":   ("7ad8326cb7f9d5742148a8cecbc9f2c77118d3a22341f8c471e5207226125e4a", "2be7f41aad80323b0572613af7f9e5699b85acfe3eeec658a48153094f2ff3f6"),
    "middle":   ("7ad8326cb7f9d5742148a8cecbc9f2c77118d3a22341f8c471e5207226125e4a", "d6070b49e4a5ddf4c32e0126fc9d8d3fa63bbe7a090fc462f1874eb9ddc34b3b"),
    "plan":   ("7ad8326cb7f9d5742148a8cecbc9f2c77118d3a22341f8c471e5207226125e4a", "3804785f44649c442cde3ee4ecf2ba0c0dd58699d09d38842648f054946742cf"),
    "sights":   ("7ad8326cb7f9d5742148a8cecbc9f2c77118d3a22341f8c471e5207226125e4a", "ade713dd95bdae35ff8e5fe05666644176b2260a9a4e0cbee04a1c63e1d56786"),
    "elev":   ("7ad8326cb7f9d5742148a8cecbc9f2c77118d3a22341f8c471e5207226125e4a", "6e6901dd2863fa1378f53bc7f78a82221aaf58850e1f7ccde4241ddbcff157bf"),
    "pedestal":   ("7ad8326cb7f9d5742148a8cecbc9f2c77118d3a22341f8c471e5207226125e4a", "aea80f4bf5c2695ce5cb1016aca01154d70a8ddfe9ac8f4f7eee826ed821a2df"),
}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", default="docs/geometry/rasson-ox-9ft-table-definition.json")
    ap.add_argument("--renders", default="/tmp/ob-3dm-quarantine/rasson-9ft/ortho")
    ap.add_argument("--output-dir", default="/tmp/ox-a1-sbs")
    ap.add_argument("--only", default="")
    ap.add_argument("--print-read-pins", action="store_true",
                    help="print the live (definition, render) sha256 pair per pose and exit — paste into READ_PINS "
                         "only after re-opening the frames")
    args = ap.parse_args()

    # r3/r4 (verification condition C3, fail-fast at r4): this tool COPIES purchased-model study
    # frames beside its sheets, so an output directory inside the repository tree is refused before
    # anything is loaded (quarantine law).
    repo_root = Path(__file__).resolve().parents[3]
    if Path(args.output_dir).resolve().is_relative_to(repo_root):
        print(f"--output-dir {args.output_dir} lies inside the repository tree ({repo_root}); the study frames "
              f"it copies are quarantined — use an absolute path outside the repo, e.g. /tmp/ox-a1-sbs",
              file=sys.stderr)
        return 2

    root = G.repo_root()
    src = Path(args.input)
    if not src.is_absolute():
        src = root / src
    doc, src_sha, _raw = G.load_source(src)
    f = G.feature_map(doc)
    renders = Path(args.renders)
    if not renders.is_dir():
        print(f"renders not found: {renders} — the quarantine study frames are required",
              file=sys.stderr)
        return 2
    out_dir = Path(args.output_dir)

    doc_id, rev = doc["doc"]["number"], doc["doc"]["revision"]
    wanted = {s for s in args.only.split(",") if s}
    all_poses = build_poses(f)
    known = {p["key"] for p in all_poses}
    unknown = sorted(wanted - known)
    if unknown:
        # review review round 3: a typo in --only used to be ignored, print "OK wrote 0 sheets" and exit 0,
        # leaving whatever stale sheets sat in the output directory looking current.
        print(f"unknown pose key(s) in --only: {unknown}; known poses: {sorted(known)}", file=sys.stderr)
        return 2
    poses = [p for p in all_poses if not wanted or p["key"] in wanted]
    if not poses:
        print("--only selected no pose; nothing to draw", file=sys.stderr)
        return 2
    out_dir.mkdir(parents=True, exist_ok=True)  # only once there is something to write into it
    for pose in poses:
        png = renders / pose["png"]
        if not png.is_file():
            print(f"missing render {png}", file=sys.stderr)
            return 2
        pose["render_sha"] = sha256_file(png)
        # F2: the copy beside the sheets is named by CONTENT, never refreshed by size — a re-rendered
        # study frame with the same byte count used to leave the old pixels in place under the old name.
        pose["local_png"] = f"{Path(pose['png']).stem}-{pose['render_sha'][:12]}.png"
    if args.print_read_pins:
        for pose in poses:
            print(f'    "{pose["key"]}": ("{src_sha}", "{pose["render_sha"]}"),')
        return 0
    # F3: every read is pinned to the inputs it was written against; a stale read refuses the pose.
    stale = []
    for pose in poses:
        pinned_def, pinned_render = READ_PINS.get(pose["key"], ("", ""))
        if pinned_def != src_sha or pinned_render != pose["render_sha"]:
            what = []
            if pinned_def != src_sha:
                what.append(f"definition {pinned_def[:12]} -> {src_sha[:12]}")
            if pinned_render != pose["render_sha"]:
                what.append(f"render {pose['png']} {pinned_render[:12]} -> {pose['render_sha'][:12]}")
            stale.append(f"{pose['key']}: {'; '.join(what)}")
    if stale:
        print("REFUSING TO DRAW — hand-written READ(s) were written against different inputs "
              "(re-open the frame, re-write if needed, re-pin with --print-read-pins):\n  " + "\n  ".join(stale),
              file=sys.stderr)
        return 2
    written = []
    for pose in poses:
        png = renders / pose["png"]
        local = out_dir / pose["local_png"]
        if not local.is_file() or sha256_file(local) != pose["render_sha"]:
            local.write_bytes(png.read_bytes())
        parts, sheet_w, sheet_h, cap_y = build_sheet(pose, renders, doc_id, rev, src_sha)
        read = read_text(pose["key"], f, doc)
        svg = finish(parts, sheet_w, cap_y, read)
        path = out_dir / f"sbs-rox-{rev}-{pose['key']}.svg"
        path.write_text(svg, encoding="utf-8")
        written.append(path.name)

    print(f"OK wrote {len(written)} sheets to {out_dir}: {', '.join(written)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
