# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Visual-weight ranking of the element gaps (port of Task C visual_weight.py; unchanged).
Metric A (primary)  XOR_vis  = sum over the COUNTED orthographic views of |silhouette(model pair) XOR silhouette(ours pair)| in mm^2 (1 px = 1 mm).
                    Counted views: top+side+end for above-bed elements; side+end only for below-bed elements (their plan is hidden under the bed/rails).
Metric B (check)    AxD      = (sum over counted views of |model U ours| mm^2) x (symmetric mean surface deviation mm, from deviation.json) / 1000  [cm^3]
Also reported: XOR restricted to pixels where the WHOLE-table silhouettes disagree (what changes the outer outline), IoU per view.
Inputs: <out>/model/silhouettes/{view}_{group}.npy and <out>/data/silhouettes_ours/{view}_{family}.npy (overlays.py)."""
import json
import os

import numpy as np

import common
import families
import paths

VIEWS = families.VW_VIEWS


def ld(root, view, names):
    acc = None
    for n in names:
        p = f"{root}/{view}_{n}.npy"
        if not os.path.exists(p): continue
        a = np.load(p)
        acc = a.copy() if acc is None else (acc | a)
    return acc


def run(cfg, log=print):
    M = cfg.model_sil; O = cfg.sil_ours
    dev = json.load(open(os.path.join(cfg.data, "deviation.json")))
    allM = {v: np.load(f"{M}/{v}_all.npy") for v in VIEWS}; allO = {v: np.load(f"{O}/{v}_all.npy") for v in VIEWS}
    out = dict(method=__doc__, whole={}, pairs=[])
    for v in VIEWS:
        m, o = allM[v], allO[v]
        out["whole"][v] = dict(model_px=int(m.sum()), ours_px=int(o.sum()), xor=int((m ^ o).sum()), model_only=int((m & ~o).sum()), ours_only=int((o & ~m).sum()), iou=round(float((m & o).sum() / (m | o).sum()), 4))
    for key, label, mg, og, counted, dkey in families.VISUAL_WEIGHT_PAIRS:
        row = dict(key=key, label=label, counted_views=counted, per_view={}, xor_vis_mm2=0, union_mm2=0, xor_outline_mm2=0)
        for v in VIEWS:
            mg2 = ["apron_cabinet" if g == "apron_cabinet_nobed" else g for g in mg]
            m = ld(M, v, mg2); o = ld(O, v, og)
            if m is None: m = np.zeros_like(allM[v])
            if o is None: o = np.zeros_like(allO[v])
            x = m ^ o; u = m | o; outline = x & (allM[v] ^ allO[v])
            pv = dict(model_px=int(m.sum()), ours_px=int(o.sum()), xor=int(x.sum()), union=int(u.sum()), model_only=int((m & ~o).sum()), ours_only=int((o & ~m).sum()),
                      xor_in_outline=int(outline.sum()), iou=round(float((m & o).sum() / max(1, u.sum())), 4), counted=v in counted)
            row["per_view"][v] = pv
            if v in counted:
                row["xor_vis_mm2"] += pv["xor"]; row["union_mm2"] += pv["union"]; row["xor_outline_mm2"] += pv["xor_in_outline"]
        d = dev.get(dkey)
        if d and not d.get("skipped"):
            dsym = 0.5 * (d["ours_samples_to_model"]["mean"] + d["model_samples_to_ours"]["mean"])
            row["dev_o2m_med_p90_max"] = [d["ours_samples_to_model"]["median"], d["ours_samples_to_model"]["p90"], d["ours_samples_to_model"]["max"]]
            row["dev_m2o_med_p90_max"] = [d["model_samples_to_ours"]["median"], d["model_samples_to_ours"]["p90"], d["model_samples_to_ours"]["max"]]
        else:
            dsym = 0.0; row["dev_o2m_med_p90_max"] = [None, None, None]; row["dev_m2o_med_p90_max"] = [None, None, None]
        row["dev_key"] = dkey; row["dev_sym_mean_mm"] = round(dsym, 2)
        row["AxD_cm3"] = round(row["union_mm2"] * dsym / 1000.0, 0)
        out["pairs"].append(row)
    out["pairs"].sort(key=lambda r: -r["xor_vis_mm2"])
    for i, r in enumerate(out["pairs"]): r["rank_xor"] = i + 1
    byA = sorted(out["pairs"], key=lambda r: -r["AxD_cm3"])
    for i, r in enumerate(byA): r["rank_AxD"] = i + 1
    common.dump_json(out, os.path.join(cfg.data, "visual_weight.json"))
    log("[visual_weight] whole: " + json.dumps(out["whole"]))
    for r in out["pairs"]:
        log(f"[visual_weight] {r['rank_xor']:2d} {r['key']:13s} XOR_vis {r['xor_vis_mm2']:8d} outline {r['xor_outline_mm2']:8d} union {r['union_mm2']:9d} dsym {r['dev_sym_mean_mm']:7.2f} AxD {r['AxD_cm3']:8.0f} (#{r['rank_AxD']}) views {','.join(r['counted_views'])}")
    return out


if __name__ == "__main__":
    cfg, _ = paths.from_args(description=__doc__)
    run(cfg)
