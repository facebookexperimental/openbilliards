#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""fullview_rox.py — GH-641 A2 (Rasson OX 9 ft): the FULL-VIEW OVERLAY gate — runtime mesh vs the DRAWING envelope.

Same question as tools/render/fullview-overlay-488d.mjs, restated for the OX: the letters gate compares numbers; nobody
compares the RUNTIME MESH against the drawing's envelope in plan and in both elevations as a picture with a number on it.
This tool rasterises the live-scene dump (tools/render/ghrox/dump_rox_scene.mjs, via the alignment gate's Dump class:
mm, x along the length, y across, z above the bed) at 1 px = 1 mm in three orthographic views and draws the JSON's own
envelope on top:

  plan       EN-01 footprint (2880 × 1618, the hard extreme — "no rail / apron material outboard"), PF-01 nose lines,
             RB-01 / RB-02 lip lines, RB-05 / RC-05 apron skin lines, the six kernel pocket centres
  side (x–z) EN-02 (floor → crest 830), the apron band (RC-01 skin top / bottom / lowest), RC-10 ± tol plate stations,
             RC-12 ± tol arch apex, RC-14 ± tol spandrel crown, RC-15 foot plates
  end (y–z)  RC-11 plate half-widths by z (± tol), RC-12 apex, EN-01 width, EN-02

and judges (a) ENVELOPE EXCESS: the largest distance any table vertex lies outside EN-01 in plan (tol 0.5 mm) and above
EN-02 + the cup rim allowance (CP-12 / SP-12: the liner rims are the assembly's declared global maximum, 46.8 above the
bed), (b) per-curve OFFSETS of the built edges from the drawn lines (nose lines, lip lines, skin lines, crest, apron
bottom, foot plates), each within the render tolerance 0.5 mm or the row's own photo tolerance.

Usage: python3 tools/render/ghrox/fullview_rox.py --dump /tmp/ox-a2/dump/b11.json --out /tmp/ox-a2/fullview [--judge]
"""
import argparse, json, os, sys, time
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, "align")); sys.path.insert(0, HERE)
import ours, objsoup  # noqa: E402
from letters_rox import Meas, val, JSON_PATH, sha256, BED  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402
RENDER_TOL = 0.5

def raster(V, F, ax, win, scale=1.0):
    """binary mask of triangles projected on axes ax=(i,j) inside win=(u0,u1,v0,v1) at scale px/mm."""
    u0, u1, v0, v1 = win; W = int((u1 - u0) * scale) + 1; H = int((v1 - v0) * scale) + 1
    im = Image.new("L", (W, H), 0); dr = ImageDraw.Draw(im)
    P = V[:, list(ax)]; P = np.c_[(P[:, 0] - u0) * scale, (v1 - P[:, 1]) * scale]
    for tri in F:
        pts = [tuple(P[k]) for k in tri]; dr.polygon(pts, fill=255, outline=255)
    return np.array(im) > 0

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dump", default="/tmp/ox-a2/dump/b11.json"); ap.add_argument("--out", default="/tmp/ox-a2/fullview"); ap.add_argument("--judge", action="store_true"); a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True); t0 = time.time()
    J = json.load(open(JSON_PATH)); R = {x["id"]: x for x in J["features"]}; sha = sha256(JSON_PATH)
    dump = ours.Dump(a.dump); M = Meas(dump)
    meshes = [m for m in dump.meshes if m["name"] and not m["name"].startswith("dm-spot")]
    V = np.concatenate([m["V"] for m in meshes]); F = np.concatenate([m["F"] + off for m, off in zip(meshes, np.cumsum([0] + [len(m["V"]) for m in meshes[:-1]]))])
    fl = M.floor(); Vz = V.copy(); Vz[:, 2] -= fl  # floor datum for the elevations
    EN01 = val(R, "EN-01"); EN02 = val(R, "EN-02"); PF01 = val(R, "PF-01"); RB01 = val(R, "RB-01"); RB02 = val(R, "RB-02"); SET = val(R, "RC-05", "skin_setback_from_lip_outer_face")
    rows = []
    def row(name, spec, ours_v, tol, note, datum="raw"):
        d = None if (spec is None or ours_v is None) else round(ours_v - spec, 3); v = "INFO" if d is None else ("GREEN" if abs(d) <= tol + 1e-9 else "RED")
        rows.append(dict(curve=name, spec=spec, ours=ours_v, delta=d, tol=tol, verdict=v, note=note, datum=datum))
    # (a) envelope excess
    ex_x = float(np.abs(V[:, 0]).max()) - EN01[0] / 2; ex_y = float(np.abs(V[:, 1]).max()) - EN01[1] / 2
    row("EN-01 plan excess (length)", 0.0, round(ex_x, 3), RENDER_TOL, "max |x| of any table vertex − 1440 (the lips ARE the envelope; nothing may stand outboard)", "MFR")
    row("EN-01 plan excess (width)", 0.0, round(ex_y, 3), RENDER_TOL, "max |y| of any table vertex − 809", "MFR")
    rim_allow = max(val(R, "CP-12", "rim_height_above_bed_z_bed_mm", "crest_on_the_diagonal_phi_0"), val(R, "SP-12", "rim_top_z_bed_rel", "apex_x0"))
    top = float(V[:, 2].max()) - BED
    row("assembly top above the bed (cup rims, CP-12 / SP-12)", rim_allow, round(top, 3), RENDER_TOL, "max z of any table vertex − bed; the liner rims are the declared global maximum (CU-11 global_max 46.807)")
    row("EN-02 floor → crest", EN02, M.en02(), RENDER_TOL, "rail-cap crest z − foot-plate bottom z", "MFR")
    # (b) drawn curves
    cush = M.V("dm-cushion")
    row("PF-01 nose line (long rails)", PF01[1] / 2, round(float(dump.datums["y_nose"]), 3), RENDER_TOL, "cushion nose line |y| (Dump datum, the model's own nose rule)", "kernel")
    row("PF-01 nose line (end rails)", PF01[0] / 2, round(float(dump.datums["x_nose"]), 3), RENDER_TOL, "cushion nose line |x|", "kernel")
    lipL = M.V("dm-rail-cap-lip-rox-long"); lipS = M.V("dm-rail-cap-lip-rox-short")
    row("RB-01 lip line (long rails)", PF01[1] / 2 + RB01, None if lipL is None else round(float(np.abs(lipL[:, 1]).max()), 3), RENDER_TOL, "long-rail lip outer face |y|", "DERIVED")
    row("RB-02 lip line (end rails)", PF01[0] / 2 + RB02, None if lipS is None else round(float(np.abs(lipS[:, 0]).max()), 3), RENDER_TOL, "end-rail lip outer face |x|", "DERIVED")
    sk = M.skin()
    row("RC-05 apron skin line (long side)", PF01[1] / 2 + RB01 - SET, None if sk is None else round(PF01[1] / 2 + RB01 - sk["setback"], 3), RENDER_TOL, "apron skin outer face |y| (straight run)")
    row("RB-04 crest above the bed", val(R, "RB-04", "crest", "z_mm", "long"), M.rb04_crest(), RENDER_TOL, "max z of the cap dome")
    row("RC-18 apron bottom (floor datum)", val(R, "RC-18", "apron_bottom_z_floor_datum"), None if sk is None else round(sk["lowest_abs"] - fl, 2), val(R, "RC-18", "bottom_tolerance"), "apron blend min z − floor", "MFR")
    row("RC-10 foot-plate station |x|", val(R, "RC-10", "abs_x"), M.rc10(), val(R, "RC-10", "tolerance"), "foot-plate mesh centres", "MFR")
    row("RC-12 arch apex (floor datum)", val(R, "RC-12", "apex_z_floor_datum"), M.rc12(), val(R, "RC-12", "apex_tolerance"), "pedestal min z at |y| < 3", "MFR")
    r14 = M.rc14(); row("RC-14 spandrel crown (floor datum)", val(R, "RC-14", "crown_z_floor_datum"), None if r14 is None else r14["crown"], val(R, "RC-14", "crown_tolerance"), "spandrel min z at |x| < 13", R["RC-14"]["a2"]["datum"])
    # pictures
    font = ImageFont.load_default()
    def draw_view(name, ax, win, lines, boxes, labels, scale=0.5):
        mask = raster(V if name != "plan" else V, F, ax, win, scale) if name == "plan" else raster(Vz, F, ax, win, scale)
        H, W = mask.shape; im = Image.new("RGB", (W, H), (12, 14, 18)); px = np.array(im); px[mask] = (200, 60, 200); im = Image.fromarray(px); dr = ImageDraw.Draw(im)
        u0, u1, v0, v1 = win; X = lambda u: (u - u0) * scale; Y = lambda v: (v1 - v) * scale
        for (p, q, col) in lines: dr.line([(X(p[0]), Y(p[1])), (X(q[0]), Y(q[1]))], fill=col, width=1)
        for (b, col) in boxes:
            x0, x1 = sorted([X(b[0]), X(b[1])]); y0, y1 = sorted([Y(b[2]), Y(b[3])]); dr.rectangle([x0, y0, x1, y1], outline=col, width=1)
        for (p, t, col) in labels: dr.text((X(p[0]) + 3, Y(p[1]) + 2), t, fill=col, font=font)
        dr.text((6, 6), f"fullview-rox {name}: magenta = runtime mesh (dump), cyan = drawing envelope (JSON rows); {scale} px/mm", fill=(255, 255, 255), font=font)
        path = os.path.join(a.out, f"fullview_{name}.png"); im.save(path); return path
    C = (0, 220, 255); Cy = (255, 220, 0); G = (90, 255, 90)
    Lh, Wh = EN01[0] / 2, EN01[1] / 2; pl, pw = PF01[0] / 2, PF01[1] / 2
    plan_lines = []; plan_boxes = [((-Lh, Lh, -Wh, Wh), C), ((-pl, pl, -pw, pw), Cy), ((-(pl + RB02), pl + RB02, -(pw + RB01), pw + RB01), G), ((-(Lh - SET), Lh - SET, -(Wh - SET), Wh - SET), (255, 120, 0))]
    plan_labels = [((-Lh, Wh), "EN-01 2880 x 1618", C), ((-pl, pw), "PF-01 nose lines", Cy), ((-(Lh - SET), -(Wh - SET) - 30), "RB-05/RC-05 skin (setback 23.394)", (255, 120, 0))]
    p_plan = draw_view("plan", (0, 1), (-1500, 1500, -860, 860), plan_lines, plan_boxes, plan_labels)
    st, tl = val(R, "RC-10", "abs_x"), val(R, "RC-10", "tolerance"); apx, atl = val(R, "RC-12", "apex_z_floor_datum"), val(R, "RC-12", "apex_tolerance"); cr, ctl = val(R, "RC-14", "crown_z_floor_datum"), val(R, "RC-14", "crown_tolerance")
    fh = val(R, "RC-15", "height"); flen = val(R, "RC-15", "length_x")
    side_lines = [((-1500, EN02), (1500, EN02), C), ((-1500, BED - fl), (1500, BED - fl), Cy), ((-100, cr), (100, cr), G), ((-100, cr - ctl), (100, cr - ctl), (0, 140, 0)), ((-100, cr + ctl), (100, cr + ctl), (0, 140, 0)), ((-1500, sk["lowest_abs"] - fl if sk else 0), (1500, sk["lowest_abs"] - fl if sk else 0), (255, 120, 0))]
    side_boxes = [((-Lh, Lh, 0, EN02), C)] + [((s * (st - flen / 2), s * (st + flen / 2), 0, fh), G) for s in (-1, 1)] + [((s * (st - tl), s * (st + tl), 0, 20), (0, 140, 0)) for s in (-1, 1)]
    side_labels = [((-1480, EN02), "EN-02 830 (floor -> crest)", C), ((-1480, BED - fl), "bed (786.862 above the floor)", Cy), ((-90, cr + 12), f"RC-14 crown {cr} ± {ctl}", G), ((st - 100, fh + 14), f"RC-10 {st} ± {tl}, RC-15 {flen} x {fh}", G), ((-1480, (sk['lowest_abs'] - fl) if sk else 0), "RC-18 / RC-01 apron bottom", (255, 120, 0))]
    p_side = draw_view("side", (0, 2), (-1500, 1500, -10, 850), side_lines, side_boxes, side_labels)
    w11 = val(R, "RC-11", "by_z_corrected"); t11 = val(R, "RC-11", "tolerance")
    end_lines = [((-Wh, EN02), (Wh, EN02), C), ((-Wh, BED - fl), (Wh, BED - fl), Cy), ((-30, apx), (30, apx), G), ((-30, apx - atl), (30, apx - atl), (0, 140, 0)), ((-30, apx + atl), (30, apx + atl), (0, 140, 0))]
    for z, w in w11.items():
        zf = float(z); end_lines += [((-w / 2, zf), (-w / 2 - 20, zf), G), ((w / 2, zf), (w / 2 + 20, zf), G), ((-(w + t11) / 2, zf - 3), (-(w + t11) / 2, zf + 3), (0, 140, 0)), ((-(w - t11) / 2, zf - 3), (-(w - t11) / 2, zf + 3), (0, 140, 0))]
    end_boxes = [((-Wh, Wh, 0, EN02), C)]
    end_labels = [((-Wh, EN02), "EN-01 width 1618 / EN-02 830", C), ((-25, apx + 12), f"RC-12 apex {apx} ± {atl}", G), ((-Wh + 10, 600), "RC-11 plate widths by z (ticks ± 18.6)", G)]
    p_end = draw_view("end", (1, 2), (-860, 860, -10, 850), end_lines, end_boxes, end_labels)
    reds = [r for r in rows if r["verdict"] == "RED"]; verdict = "GREEN" if not reds else "RED"
    rec = dict(tool="fullview_rox", json_sha256=sha, dump=a.dump, rows=rows, verdict=verdict, pngs=[p_plan, p_side, p_end], seconds=round(time.time() - t0, 1))
    json.dump(rec, open(os.path.join(a.out, "fullview-rox.json"), "w"), indent=1)
    L = ["# FULLVIEW-ROX — runtime mesh vs the drawing envelope, rasson_ox_9ft", "", f"JSON sha256 `{sha}`; dump `{a.dump}`", "", f"**VERDICT {verdict}** — {len(reds)} red of {len(rows)} curves", "",
         "| curve | datum | spec | as-modeled | Δ | tol | verdict | rule |", "|---|---|---|---|---|---|---|---|"]
    for r in rows: L.append(f"| {r['curve']} | {r['datum']} | {r['spec']} | {r['ours']} | {r['delta']} | {r['tol']} | **{r['verdict']}** | {r['note']} |")
    L += ["", "## Pictures", ""] + [f"- `{os.path.basename(p)}`" for p in (p_plan, p_side, p_end)]
    open(os.path.join(a.out, "FULLVIEW-ROX.md"), "w").write("\n".join(L) + "\n")
    print(f"[fullview-rox] {verdict} reds {len(reds)}/{len(rows)} {rec['seconds']}s -> {a.out}/FULLVIEW-ROX.md")
    for r in reds: print(f"   RED {r['curve']}: spec {r['spec']} ours {r['ours']} Δ {r['delta']} tol {r['tol']}")
    if a.judge and verdict != "GREEN": sys.exit(3)

if __name__ == "__main__": main()
