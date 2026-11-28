#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""D621-PLAN-2 — the purchased model's cushion rubber REAR-FACE lean (the CU-10 model witness; numbers only).

Why: the boot arms end on the cushion glue plane (CU-10, an EST 23.5° sub-rail bevel from a community read). The
law fills gaps from the model, so the model's own rubber back is read with its fit statistics and kept on the record
(JSON CU-10.model_read) for the cushion-profile round (O22) that replaces CU-10 / CU-11 from the K-55 published
section. Method: horizontal sections of pool_rubber01..06 every 0.5 mm from bed+0.5 to bed+44; at each rail station
the BACK is the section's furthest point from that rail's nose line (|Y| − 576 on the long rails, |X| − 1152 on the
end rails) and the NOSE its nearest; a least-squares line depth(z) over bed+2..42 per station gives the angle from
vertical, rms and max residual, the depth at the bed and at CU-09 (44.45); one shared plane per rail is fitted too.
The leather fronts (leather06 side arms, leather01 corner arms) are read the same way for comparison. Interior
stations only (the pocket-end 50 mm of each rubber flares 15–17° and is reported separately). The model stays in
memory; only numbers leave.

  python3 tools/render/d621/plan/rubber_back_lean_621.py [--json out.json] [--model-obj-dir DIR]
"""
import sys
sys.dont_write_bytecode = True
import argparse
import json
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "align"))
import objlib   # noqa: E402
import paths    # noqa: E402

BED = 770.0
Z_STEP = 0.5
FIT_LO, FIT_HI = 2.0, 42.0          # the top corner fillets above 42.5; the base row below 2 is the cloth tuck
OURS_DEG, OURS_ANCHOR, OURS_TOP = 23.5, 50.8, 44.45   # CU-10 / CU-04 / CU-09 as issued
# rubber name -> (station axis index, depth axis index, nose line |coord|, interior stations)
RAILS = {"pool_rubber01": (1, 0, 1152.0, [-450, -300, -150, 150, 300, 450]),
         "pool_rubber04": (1, 0, 1152.0, [-450, -300, -150, 150, 300, 450]),
         "pool_rubber02": (0, 1, 576.0, [300, 600, 900]),
         "pool_rubber06": (0, 1, 576.0, [300, 600, 900]),
         "pool_rubber03": (0, 1, 576.0, [-300, -600, -900]),
         "pool_rubber05": (0, 1, 576.0, [-300, -600, -900])}
END_FLARE = {"pool_rubber06": (0, 1, 576.0, [1050, 1080, 1100, 1120])}
LEATHER = {"leather06 side arm front": ("pool_leather06", 0, 1, 576.0, [-80, 80]),
           "leather01 corner long arm": ("pool_leather01", 0, 1, 576.0, [1080, 1100, 1120]),
           "leather01 corner end arm": ("pool_leather01", 1, 0, 1152.0, [500, 520, 540])}


def crossings(segs, k, s):
    if len(segs) == 0:
        return np.zeros((0, 3))
    a = segs[:, 0, k] - s; b = segs[:, 1, k] - s
    m = (a * b <= 0) & (a != b)
    t = (a[m] / (a[m] - b[m]))[:, None]
    return segs[m, 0, :] + (segs[m, 1, :] - segs[m, 0, :]) * t


def line_fit(zz, dd):
    m = (zz >= FIT_LO) & (zz <= FIT_HI)
    A = np.vstack([np.ones(m.sum()), zz[m]]).T
    (a, b), *_ = np.linalg.lstsq(A, dd[m], rcond=None)
    r = dd[m] - (a + b * zz[m])
    return dict(angle_deg=round(math.degrees(math.atan(b)), 3), rms_mm=round(float(np.sqrt(np.mean(r ** 2))), 3),
                max_resid_mm=round(float(np.abs(r).max()), 3), depth_at_bed=round(float(a), 2),
                depth_at_44_45=round(float(a + b * OURS_TOP), 2), n=int(m.sum()))


def profile(meshes, node, k, j, nose, s, zs, which):
    """back (max depth) or nose / front (min positive depth) vs z at one station"""
    V, F = meshes[node]["V"], meshes[node]["F"]
    zz, dd = [], []
    for z in zs:
        P = crossings(objlib.section(V, F, 2, BED + z), k, s)
        if len(P) == 0:
            continue
        d = np.abs(P[:, j]) - nose
        if which == "front":
            d = d[d > 0]
            if len(d) == 0:
                continue
        zz.append(z); dd.append(d.max() if which == "back" else d.min())
    return np.array(zz), np.array(dd)


def run(model_dir):
    meshes = objlib.load_all(model_dir)
    zs = np.arange(Z_STEP, 44.0 + 1e-9, Z_STEP)
    out = {"bed_z": BED, "fit_window_above_bed": [FIT_LO, FIT_HI], "stations": [], "per_rail_plane": {}, "leather": [], "end_flare": []}
    print("rubber back: station              | angle°  | rms   | max   | d@bed  | d@44.45 | nose min depth (z)")
    pooled_z, pooled_d = {}, {}
    for node, (k, j, nose, sts) in RAILS.items():
        for s in sts:
            zz, bk = profile(meshes, node, k, j, nose, s, zs, "back")
            zn, ns = profile(meshes, node, k, j, nose, s, zs, "nose")
            fit = line_fit(zz, bk)
            fit.update(rail=node, station_axis="y" if k == 1 else "x", station=s,
                       nose_min_depth=round(float(ns.min()), 2), nose_z=float(zn[ns.argmin()]))
            out["stations"].append(fit)
            pooled_z.setdefault(node, []).append(zz); pooled_d.setdefault(node, []).append(bk)
            print(f"{node} {fit['station_axis']}={s:<6} | {fit['angle_deg']:6.2f}  | {fit['rms_mm']:.3f} | {fit['max_resid_mm']:.3f} | {fit['depth_at_bed']:6.2f} | {fit['depth_at_44_45']:7.2f} | {fit['nose_min_depth']:.2f} ({fit['nose_z']})")
    for node in RAILS:
        Z = np.concatenate(pooled_z[node]); D = np.concatenate(pooled_d[node])
        out["per_rail_plane"][node] = line_fit(Z, D)
    ang = np.array([s["angle_deg"] for s in out["stations"]])
    out["pooled"] = dict(angle_mean=round(float(ang.mean()), 3), angle_std=round(float(ang.std(ddof=1)), 4), n=int(len(ang)),
                         depth_at_bed_mean=round(float(np.mean([s["depth_at_bed"] for s in out["stations"]])), 2),
                         depth_at_44_45_mean=round(float(np.mean([s["depth_at_44_45"] for s in out["stations"]])), 2),
                         rms_max=round(float(max(s["rms_mm"] for s in out["stations"])), 3))
    p = out["pooled"]
    print(f"POOLED: {p['angle_mean']:.2f}° ± {p['angle_std']:.4f} (n {p['n']}), depth {p['depth_at_bed_mean']:.2f} at the bed → {p['depth_at_44_45_mean']:.2f} at 44.45, rms max {p['rms_max']:.3f}")
    print("per-rail single plane:", {k: (v["angle_deg"], v["rms_mm"], v["max_resid_mm"]) for k, v in out["per_rail_plane"].items()})
    tan_o = math.tan(math.radians(OURS_DEG)); tan_m = math.tan(math.radians(p["angle_mean"]))
    out["ours_cu10"] = {str(z): round(OURS_ANCHOR - (OURS_TOP - z) * tan_o, 2) for z in (0, 20, 35.88, 42.3, 44.45)}
    out["model_line"] = {str(z): round(p["depth_at_bed_mean"] + tan_m * z, 2) for z in (0, 20, 35.88, 42.3, 44.45)}
    print("depth behind the nose line, ours CU-10 vs the model's back plane:", out["ours_cu10"], out["model_line"])
    for node, (k, j, nose, sts) in END_FLARE.items():
        for s in sts:
            zz, bk = profile(meshes, node, k, j, nose, s, zs, "back")
            fit = line_fit(zz, bk); fit.update(rail=node, station=s); out["end_flare"].append(fit)
    print("pocket-end flare (rubber06 x 1050..1120):", [(f["station"], f["angle_deg"]) for f in out["end_flare"]])
    for name, (node, k, j, nose, sts) in LEATHER.items():
        for s in sts:
            zz, fr = profile(meshes, node, k, j, nose, s, zs, "front")
            if len(zz) < 8:
                continue
            fit = line_fit(zz, fr); fit.update(name=name, station=s, chord_deg=round(math.degrees(math.atan((fr[-1] - fr[0]) / (zz[-1] - zz[0]))), 2))
            out["leather"].append(fit)
            print(f"leather front {name} s={s}: {fit['angle_deg']:.2f}° (rms {fit['rms_mm']:.3f}; end-to-end chord {fit['chord_deg']}°), {fit['depth_at_bed']} at the bed")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", default=None)
    ap.add_argument("--model-obj-dir", default=os.environ.get("D621_MODEL_OBJ_DIR") or paths.DEFAULT_MODEL_OBJ_DIR)
    a = ap.parse_args(argv)
    out = run(a.model_obj_dir)
    if a.json:
        with open(a.json, "w") as f:
            json.dump(out, f, indent=1)
        print("wrote", a.json)
    return 0


if __name__ == "__main__":
    sys.exit(main())
