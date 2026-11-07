# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Model-side silhouettes, regenerated from the quarantine OBJ at run time (port of Task B silhouettes.py; unchanged
rasteriser and pixel mapping). Output: <out>/model/silhouettes/{view}_{group}.npy, {view}_all.npy/.png, {view}_groups.png,
frame.json. 1 px = 1 mm: top col = x+1400, row = 800-y; side col = x+1400, row = 880-z; end col = y+800, row = 880-z."""
import os

import numpy as np
from PIL import Image

import families
import objlib
import paths

VIEWS = {
    "top":  dict(axes=(0, 1), x0=-1400.0, x1=1400.0, y0=-800.0, y1=800.0),   # XY, +y up
    "side": dict(axes=(0, 2), x0=-1400.0, x1=1400.0, y0=-20.0, y1=880.0),    # XZ, +z up
    "end":  dict(axes=(1, 2), x0=-800.0, x1=800.0, y0=-20.0, y1=880.0),      # YZ, +z up
}
PALETTE = {"rails": (200, 120, 40), "rail_side": (120, 80, 40), "kant_support": (160, 160, 60), "apron_cabinet": (90, 60, 30), "legs_out": (60, 60, 60),
           "legs_in": (100, 100, 100), "cushions": (40, 160, 80), "boots": (30, 30, 30), "traps": (140, 40, 140), "sights": (250, 250, 250)}


def raster(nodes, view, names):
    from PIL import ImageDraw
    a, b = view["axes"]; W = int(view["x1"] - view["x0"]); H = int(view["y1"] - view["y0"])
    img = Image.new("1", (W, H), 0); d = ImageDraw.Draw(img)
    for n in names:
        Vv = nodes[n]["V"]; Fv = nodes[n]["F"]
        P = np.stack([Vv[:, a] - view["x0"], view["y1"] - Vv[:, b]], axis=1)
        for tri in Fv:
            pts = [tuple(P[i]) for i in tri]
            d.polygon(pts, fill=1, outline=1)
    return np.array(img, dtype=bool)


def run(cfg, nodes, G, log=print):
    OUT = cfg.model_sil; os.makedirs(OUT, exist_ok=True)
    frame = dict(px_per_mm=1.0, note="col = coord_h - x0 ; row = y1 - coord_v (row 0 = top of window = max of vertical coord). Bed top z=770.0, table centre (0,0). Groups exclude cue/label/screws/NGon04(rack)/romb19(rack logo).", views={})
    summary = {}
    for vname, view in VIEWS.items():
        W = int(view["x1"] - view["x0"]); H = int(view["y1"] - view["y0"])
        frame["views"][vname] = dict(axes=["xyz"[view["axes"][0]], "xyz"[view["axes"][1]]], x0=view["x0"], x1=view["x1"], y0=view["y0"], y1=view["y1"], width_px=W, height_px=H)
        combined = np.zeros((H, W), dtype=bool); rgb = np.zeros((H, W, 3), dtype=np.uint8)
        order = families.MODEL_SIL_ORDER_TOP if vname == "top" else families.MODEL_SIL_ORDER_ELEV
        px = {}
        for g in order:
            if g not in G: continue
            m = raster(nodes, view, G[g]); np.save(f"{OUT}/{vname}_{g}.npy", m); combined |= m
            rgb[m] = PALETTE[g]
            px[g] = int(m.sum())
        np.save(f"{OUT}/{vname}_all.npy", combined)
        Image.fromarray((combined * 255).astype(np.uint8)).save(f"{OUT}/{vname}_all.png")
        Image.fromarray(rgb).save(f"{OUT}/{vname}_groups.png")
        ys, xs = np.nonzero(combined)
        bbox = dict(cols=[int(xs.min()), int(xs.max())], rows=[int(ys.min()), int(ys.max())],
                    mm_h=[float(xs.min() + view["x0"]), float(xs.max() + 1 + view["x0"])], mm_v=[float(view["y1"] - (ys.max() + 1)), float(view["y1"] - ys.min())])
        summary[vname] = dict(px_on=px, all_px=int(combined.sum()), bbox=bbox)
        log(f"[silhouettes_model] {vname} px on {px} combined bbox {bbox}")
    frame["summary"] = summary
    import json
    json.dump(frame, open(f"{OUT}/frame.json", "w"), indent=1)
    return frame


if __name__ == "__main__":
    cfg, _ = paths.from_args(description=__doc__)
    import common
    nodes, G = common.load_model(cfg.model_obj_dir)
    run(cfg, nodes, G)
