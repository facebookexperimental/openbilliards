#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""D621-PLAN-1 — the MODEL ring circle fits behind `mouthCollar.ring` (web/scene/table.js, Diamond Pro-Am).

Reads the purchased model's leather rings (pool_leather01 = a corner, pool_leather06 = a side) from the quarantine
OBJ IN MEMORY, sections them at the model's nose height (bed + 35.88) and at the other plan-gate heights, transforms
each section into the pocket's OWN nose-intersection frame (u outboard along the pocket axis, w lateral; model nose
lines |X| 1152 / |Y| 576 on the 8 ft model, bed z 770), densifies the loops to 0.25 mm and fits:
  outer   — least-squares circle (Gauss-Newton after a Kasa seed) with the centre constrained to the axis, on the
            points within 3 mm of the outer radius and behind the outer centre  -> ring.centre / ring.rOut
  throat  — the same fit on the throat arch (u > 62 corner / u > 60 side: past the straight inner edges)
            -> ring.throatCentre / ring.throatR
  legInner — the 3rd percentile of |w| over the leg region (u < outer centre − 5) -> ring.legInner
plus the half-width profile along the axis (the record of how far each circle is from the model's actual arch).
Every number is printed with its rms / max residual and n. Nothing derived from the model's vertices is written;
--json writes the numbers only.

  python3 tools/render/d621/plan/fit_model_ring_621.py [--model-obj-dir DIR] [--json out.json]
"""
import sys
sys.dont_write_bytecode = True
import argparse
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "align"))
import planlib_621 as pl   # noqa: E402
import objlib              # noqa: E402
import paths               # noqa: E402

CUTS = {"bed+5": 775.0, "mid": 790.0, "nose": 805.88, "bed+40": 810.0, "top": 813.7}
POCKETS = {"corner": ("pool_leather01", pl.PocketFrame("corner", (1152.0, 576.0), (1.0, 1.0)), 62.0),
           "side": ("pool_leather06", pl.PocketFrame("side", (0.0, 576.0), (0.0, 1.0)), 60.0)}


def fit_circle(P):
    x, y = P[:, 0], P[:, 1]
    A = np.c_[2 * x, 2 * y, np.ones(len(x))]
    c = np.linalg.lstsq(A, x * x + y * y, rcond=None)[0]
    cx, cy = c[0], c[1]
    r = float(np.sqrt(c[2] + cx * cx + cy * cy))
    for _ in range(30):
        dx, dy = x - cx, y - cy
        d = np.hypot(dx, dy)
        J = np.c_[-dx / d, -dy / d, -np.ones(len(x))]
        step = np.linalg.lstsq(J, -(d - r), rcond=None)[0]
        cx += step[0]; cy += step[1]; r += step[2]
        if np.abs(step).max() < 1e-9:
            break
    res = np.hypot(x - cx, y - cy) - r
    return dict(cu=float(cx), cw=float(cy), r=float(r), rms=float(np.sqrt((res ** 2).mean())), max=float(np.abs(res).max()), n=int(len(x)))


def fit_circle_on_axis(P):
    x, y = P[:, 0], P[:, 1]
    f = fit_circle(P)
    uc, r = f["cu"], f["r"]
    for _ in range(50):
        d = np.hypot(x - uc, y)
        J = np.c_[-(x - uc) / d, -np.ones(len(x))]
        step = np.linalg.lstsq(J, -(d - r), rcond=None)[0]
        uc += step[0]; r += step[1]
        if np.abs(step).max() < 1e-9:
            break
    res = np.hypot(x - uc, y) - r
    return dict(uc=float(uc), r=float(r), rms=float(np.sqrt((res ** 2).mean())), max=float(np.abs(res).max()), n=int(len(x)))


def densify(L, step=0.25):
    pts = []
    for pts_, _ in L:
        for a, b in zip(pts_[:-1], pts_[1:]):
            n = max(2, int(np.linalg.norm(b - a) / step))
            pts.append(a + (b - a) * np.linspace(0, 1, n, endpoint=False)[:, None])
    return np.vstack(pts)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--model-obj-dir", default=os.environ.get("D621_MODEL_OBJ_DIR") or paths.DEFAULT_MODEL_OBJ_DIR)
    p.add_argument("--json", default=None)
    a = p.parse_args(argv)
    nodes = objlib.load_all(a.model_obj_dir)
    out = {}
    for kind, (name, frame, u_arch) in POCKETS.items():
        out[kind] = {}
        for ck, zc in CUTS.items():
            s = pl.section_xy(objlib, nodes[name], zc)
            L = pl.loops(s, 0.5)
            P = frame.to(densify(L))
            u, w = P[:, 0], P[:, 1]
            Ro = float(np.abs(w).max())
            uo = float(u.max()) - Ro
            d_o = np.hypot(u - uo, w)
            outer = fit_circle_on_axis(P[(np.abs(d_o - Ro) < 3.0) & (u > uo + 2.0)])
            inner_pts = P[(d_o < Ro - 6.0) & (u > u_arch)]
            throat = fit_circle_on_axis(inner_pts)
            leg = P[u < uo - 5.0]
            aw = np.abs(leg[:, 1])
            prof = {}
            for uu in (20, 30, 40, 50, 55, 60, 65, 70, 80, 85, 90, 95):
                band = P[(np.abs(u - uu) < 0.6) & (d_o < Ro - 6.0)]
                if len(band):
                    prof[uu] = round(float(np.abs(band[:, 1]).max()), 1)
            R = dict(z=zc, above_bed=round(zc - pl.BED_Z, 2), loops=len(L), closed=[bool(c) for _, c in L],
                     u_range=[round(float(u.min()), 2), round(float(u.max()), 2)], w_halfwidth_max=round(Ro, 2),
                     outer_fit=outer, throat_fit=throat,
                     leg_inner_edge_abs_w_p3=round(float(np.percentile(aw, 3)), 2) if len(aw) else None,
                     leg_outer_edge_abs_w_p97=round(float(np.percentile(aw, 97)), 2) if len(aw) else None,
                     arm_end_u_min=round(float(u.min()), 2), inner_halfwidth_at_u=prof)
            out[kind][ck] = R
            print(f"{kind:6s} {ck:6s} outer centre {outer['uc']:.2f} r {outer['r']:.2f} (rms {outer['rms']:.2f} max {outer['max']:.2f} n {outer['n']}) | "
                  f"throat centre {throat['uc']:.2f} r {throat['r']:.2f} (rms {throat['rms']:.2f} max {throat['max']:.2f}) | "
                  f"leg inner |w| {R['leg_inner_edge_abs_w_p3']} outer {R['leg_outer_edge_abs_w_p97']} | arm end u {R['arm_end_u_min']} | halfwidth {Ro:.2f}")
    if a.json:
        json.dump(out, open(a.json, "w"), indent=1)
        print("wrote", a.json)
    return 0


if __name__ == "__main__":
    sys.exit(main())
