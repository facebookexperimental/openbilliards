#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""D621-PLAN-2 — the purchased leather's TOP surface by bearing and leg station (MODEL read, numbers only).

Why: the boot ring's rows above the outer-wall top were one section (the outboard diagonal) swept with a crest fade;
the model's legs and tangent rows keep a 44–45 plateau where the fade dropped ours to 42.5, so the plan gate's cap−1
cut (bed+43.7) read the legs 60 % too narrow (O21). This tool reads the model's top surface straight down (highest
triangle hit on a 0.5 mm grid in the pocket's nose-intersection frame), walks a ray per bearing from the fitted outer
centre (and a lateral line per leg station), takes the model's OWN band edges on that ray (first / last top-surface
sample at or above ZFLOOR) and interpolates the height at the section's t rows. Medians per 15° bin (±7°, both
lateral signs) and per 10 mm leg span; std and n printed. The model stays in memory — only numbers leave.

  python3 tools/render/d621/plan/top_profile_621.py [--json out.json] [--model-obj-dir DIR]
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

BED = 770.0
T_ROWS = [0.0, 0.004, 0.03, 0.151, 0.26, 0.41, 0.6, 0.855, 1.0]   # the section's rows above the wall (+ 0.03 / 0.26 witnesses; 0.03 = 1.4 mm clear of the inner face)
STEP = 0.5
ZFLOOR = 38.0   # a top-surface sample: the plateau/crest stands above 42; the throat wall and skirt drop far below
# the rings' plan (fit_model_ring_621.py, on the record in table.js mouthCollar.ring)
RINGS = {
    "corner": dict(obj="pool_leather01", frame=pl.PocketFrame("corner", (1152.0, 576.0), (1.0, 1.0)), uc=50.58),
    "side": dict(obj="pool_leather06", frame=pl.PocketFrame("side", (0.0, 576.0), (0.0, 1.0)), uc=47.68),
}


def heightmap(V, F, fr, us, ws):
    P = fr.to(V[:, :2]); z = V[:, 2] - BED
    UU, _ = np.meshgrid(us, ws); Z = np.full(UU.shape, np.nan)
    for tri in F:
        a, b, c = P[tri[0]], P[tri[1]], P[tri[2]]
        lo = np.minimum(np.minimum(a, b), c); hi = np.maximum(np.maximum(a, b), c)
        iu = np.where((us >= lo[0] - 1e-9) & (us <= hi[0] + 1e-9))[0]
        iw = np.where((ws >= lo[1] - 1e-9) & (ws <= hi[1] + 1e-9))[0]
        if len(iu) == 0 or len(iw) == 0:
            continue
        gu, gw = np.meshgrid(us[iu], ws[iw])
        d = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])
        if abs(d) < 1e-12:
            continue
        l1 = ((b[0] - gu) * (c[1] - gw) - (c[0] - gu) * (b[1] - gw)) / d
        l2 = ((c[0] - gu) * (a[1] - gw) - (a[0] - gu) * (c[1] - gw)) / d
        l3 = 1 - l1 - l2
        inside = (l1 >= -1e-9) & (l2 >= -1e-9) & (l3 >= -1e-9)
        if not inside.any():
            continue
        zz = l1 * z[tri[0]] + l2 * z[tri[1]] + l3 * z[tri[2]]
        sub = Z[np.ix_(iw, iu)]
        Z[np.ix_(iw, iu)] = np.where(inside & (np.isnan(sub) | (zz > sub)), zz, sub)
    return Z


def profile(zs, ds):
    ok = np.isfinite(zs) & (zs >= ZFLOOR)
    if ok.sum() < 6:
        return None
    i0 = int(np.argmax(ok)); i1 = len(ok) - 1 - int(np.argmax(ok[::-1]))
    if ok[i0:i1 + 1].mean() < 0.9:
        return None   # a broken run (leather / hole mixed): not a band
    dIn, dOut = ds[i0], ds[i1]
    if dOut - dIn < 15:
        return None
    t = (ds[i0:i1 + 1] - dIn) / (dOut - dIn); zz = zs[i0:i1 + 1]
    k = int(np.nanargmax(zz))
    return dict(dIn=dIn, dOut=dOut, z=np.interp(T_ROWS, t, zz), crest=zz[k], crest_t=t[k])


def stats(rows):
    if not rows:
        return None
    Z = np.array([r["z"] for r in rows])
    return dict(n=len(rows), z_med=[round(float(v), 2) for v in np.median(Z, 0)], z_std=[round(float(v), 2) for v in Z.std(0)],
                dIn=round(float(np.median([r["dIn"] for r in rows])), 2), dOut=round(float(np.median([r["dOut"] for r in rows])), 2),
                crest=round(float(np.median([r["crest"] for r in rows])), 2), crest_t=round(float(np.median([r["crest_t"] for r in rows])), 3))


def run(model_dir):
    meshes = objlib.load_all(model_dir)
    out = {"t_rows": T_ROWS, "step_mm": STEP, "zfloor": ZFLOOR, "bed_z": BED}
    for name, cfg in RINGS.items():
        m = meshes[cfg["obj"]]
        us = np.arange(-60, 150 + 0.25, STEP); ws = np.arange(-110, 110 + 0.25, STEP)
        Z = heightmap(m["V"], m["F"], cfg["frame"], us, ws)

        def zat(u, w):
            iu = np.clip(np.rint((u - us[0]) / STEP).astype(int), 0, len(us) - 1)
            iw = np.clip(np.rint((w - ws[0]) / STEP).astype(int), 0, len(ws) - 1)
            return Z[iw, iu]
        uc = cfg["uc"]; ds = np.arange(0, 115, 0.25)
        R = {"mesh": cfg["obj"], "bearings": {}, "legs": {}}
        for b0 in range(0, 91, 15):
            rows = []
            for deg in range(max(0, b0 - 7), min(90, b0 + 7) + 1):
                th = np.radians(deg)
                for sgn in (1, -1):
                    pr = profile(zat(uc + ds * np.cos(th), sgn * ds * np.sin(th)), ds)
                    if pr:
                        rows.append(pr)
            R["bearings"][b0] = stats(rows)
        wsamp = np.arange(40, 110, 0.25)
        for s0 in range(0, 50, 10):
            rows = []
            for s in np.arange(s0, s0 + 10, 1.0):
                for sgn in (1, -1):
                    pr = profile(zat(np.full_like(wsamp, uc - s), sgn * wsamp), wsamp)
                    if pr:
                        rows.append(pr)
            R["legs"][f"{s0}-{s0 + 10}"] = stats(rows)
        out[name] = R
        print(f"===== {name} ({cfg['obj']})   t rows {T_ROWS}   heights above the bed [mm]")
        print("bin        |   n | dIn   dOut  | " + " | ".join(f"{t:5}" for t in T_ROWS) + " | crest (t)  | std per row")
        for grp in ("bearings", "legs"):
            for k, st in R[grp].items():
                if not st:
                    print(f"{grp} {k:>6} | none (no top surface on this station)"); continue
                print(f"{grp[:4]} {k:>6} | {st['n']:3d} | {st['dIn']:5.1f} {st['dOut']:5.1f} | "
                      + " | ".join(f"{z:5.1f}" for z in st["z_med"]) + f" | {st['crest']:5.2f} ({st['crest_t']:.3f}) | "
                      + " ".join(f"{s:.1f}" for s in st["z_std"]))
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
