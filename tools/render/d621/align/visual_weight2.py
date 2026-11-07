# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Metric C: visible-difference attribution (port of Task C visual_weight2.py; unchanged). For each orthographic view, take
the XOR of the two ASSEMBLY silhouettes the eye actually sees (above-bed assembly for TOP; whole table for SIDE/END) and
attribute every disagreeing pixel to the element pair(s) whose own masks differ there. This removes the partition artefact
of the raw per-pair XOR (ours' casting covers plan area the model assigns to boot/trap/apron)."""
import json
import os

import numpy as np

import common
import families
import paths
from visual_weight import ld


def run(cfg, log=print):
    M = cfg.model_sil; O = cfg.sil_ours
    out = {"method": __doc__, "views": {}, "pairs": {}}
    for view in ("top", "side", "end"):
        mg, og = families.VW2_ASSEMBLY[view]
        A_m = ld(M, view, mg) if mg else np.load(f"{M}/{view}_all.npy")
        A_o = ld(O, view, og) if og else np.load(f"{O}/{view}_all.npy")
        X = A_m ^ A_o
        out["views"][view] = dict(assembly="above-bed" if mg else "whole-table", model_px=int(A_m.sum()), ours_px=int(A_o.sum()), xor_px=int(X.sum()),
                                  model_only=int((A_m & ~A_o).sum()), ours_only=int((A_o & ~A_m).sum()), iou=round(float((A_m & A_o).sum() / (A_m | A_o).sum()), 4))
        for key, mg2, og2 in families.VW2_PAIRS:
            if view == "top" and key not in families.VW2_ABOVE:
                out["pairs"].setdefault(key, {})[view] = dict(attributed_px=0, model_only=0, ours_only=0, note="below-bed pair: not a member of the above-bed assembly seen in plan")
                continue
            pm = ld(M, view, mg2); po = ld(O, view, og2)
            if pm is None: pm = np.zeros_like(A_m)
            if po is None: po = np.zeros_like(A_o)
            attrib = X & (pm ^ po)
            out["pairs"].setdefault(key, {})[view] = dict(attributed_px=int(attrib.sum()), model_only=int((attrib & pm & ~po).sum()), ours_only=int((attrib & po & ~pm).sum()))
    for key in out["pairs"]:
        out["pairs"][key]["total_mm2"] = sum(v["attributed_px"] for k, v in out["pairs"][key].items() if k in ("top", "side", "end"))
    rank = sorted(out["pairs"].items(), key=lambda kv: -kv[1]["total_mm2"])
    for i, (k, v) in enumerate(rank): v["rank_C"] = i + 1
    common.dump_json(out, os.path.join(cfg.data, "visual_weight_attributed.json"))
    log("[visual_weight2] views: " + json.dumps(out["views"]))
    for k, v in rank:
        log(f"[visual_weight2] {v['rank_C']:2d} {k:14s} total {v['total_mm2']:8d} top {v['top']['attributed_px']:7d} side {v['side']['attributed_px']:7d} end {v['end']['attributed_px']:7d}")
    return out


if __name__ == "__main__":
    cfg, _ = paths.from_args(description=__doc__)
    run(cfg)
