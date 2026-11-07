# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Element deviation (port of Task C deviation.py + deviation_extra.py; unchanged method): model surface (area-weighted
samples + exact triangle refinement) vs ours, both directions, per pair of families.DEVIATION_PAIRS, then whole_table,
then families.EXTRA_PAIRS. Output: <out>/data/deviation.json, dev_<pair>.npz (OUR samples + distances only; model sample
coordinates are NOT stored), <out>/heatmaps/heat_<pair>.png."""
import json
import os
import re
import time

import numpy as np

import common
import families
import heat
import paths


def build_pairs(OG, MG):
    pairs = []
    for key, label, mg, og, note in families.DEVIATION_PAIRS:
        pairs.append((key, label, common.resolve(MG, mg), common.resolve(OG, og), note))
    model_all = common.resolve(MG, families.WHOLE_TABLE_MODEL_GROUPS)
    ours_all = [n for g, ns in OG.items() if g not in families.WHOLE_TABLE_OURS_EXCLUDE for n in ns]
    pairs.append(("whole_table", "whole table (model visible set <-> ours minus decals)", model_all, ours_all, families.WHOLE_TABLE_NOTE))
    for key, label, mg, og, note in families.EXTRA_PAIRS:
        pairs.append((key, label, common.resolve(MG, mg), common.resolve(OG, og), note))
    # split pairs (2026-09-02): ours side = every mesh whose name fullmatches the regex, in family/export order
    for key, label, mg, rx, note in families.SPLIT_PAIRS:
        r = re.compile(rx)
        pairs.append((key, label, common.resolve(MG, mg), [n for g, ns in OG.items() for n in ns if r.fullmatch(n)], note))
    return pairs


def plan_centre(V):
    """Plan AABB centre (x, y) - the same datum as dims 12.legs_per_leg."""
    mn, mx = V[:, :2].min(0), V[:, :2].max(0); return (mn + mx) / 2


def centroid_aligned_legs(ours, OG, nodes, MG):
    """Translated copies of OUR leg + leveler meshes: each leg shell moves in plan so that its AABB centre coincides with the
    nearest MODEL leg shell's (legs_out) AABB centre; each leveler takes the shift of the nearest OUR leg shell. Returns
    (meshes {name: V,F}, names in the raw pair's order, per-leg shift records) or None when either side is empty."""
    legs = list(OG.get("leg", [])); levs = list(OG.get("leveler", [])); mlegs = list(MG.get("legs_out", []))
    if not legs or not mlegs: return None
    mc = {n: plan_centre(nodes[n]["V"]) for n in mlegs}
    shifts = {}
    for n in legs:
        c = plan_centre(ours[n]["V"]); best = min(mlegs, key=lambda m: float(np.hypot(*(mc[m] - c))))
        shifts[n] = dict(model_node=best, ours_centre=[round(float(c[0]), 2), round(float(c[1]), 2)], model_centre=[round(float(mc[best][0]), 2), round(float(mc[best][1]), 2)],
                         shift_xy=[round(float(mc[best][0] - c[0]), 2), round(float(mc[best][1] - c[1]), 2)], shift_norm=round(float(np.hypot(*(mc[best] - c))), 2), members=[n])
    adj = {}
    for n in legs + levs:
        c = plan_centre(ours[n]["V"]); leg = min(legs, key=lambda l: float(np.hypot(*(np.asarray(shifts[l]["ours_centre"]) - c))))
        if n != leg: shifts[leg]["members"].append(n)
        s = shifts[leg]["shift_xy"]; V = ours[n]["V"].copy(); V[:, 0] += s[0]; V[:, 1] += s[1]
        adj[n] = dict(V=V, F=ours[n]["F"])
    return adj, legs + levs, shifts


def run(cfg, ours, OG, nodes, MG, log=print, heatmaps=True, only=None):
    os.makedirs(cfg.heatmaps, exist_ok=True); os.makedirs(cfg.data, exist_ok=True)
    results = {}
    t0 = time.time()
    pairs = build_pairs(OG, MG)
    # centroid-aligned legs (2026-09-02): the raw legs pair recomputed on translated copies of OUR legs (form-only residual)
    legs_form = centroid_aligned_legs(ours, OG, nodes, MG)
    # LAW split pairs (D621-ALIGN seal): apron band with the envelope delta removed, cabinet walls without the bottom board
    law = getattr(cfg, "law_cfg", None)
    law_src = {}
    if law:
        for key, label, mg, mex, rx, tf, note in families.LAW_SPLIT_PAIRS:
            r = re.compile(rx)
            mnames = [n for n in common.resolve(MG, mg) if not (mex and re.search(mex, n))]
            onames = [n for g, ns in OG.items() for n in ns if r.fullmatch(n)]
            src = {}
            for n in onames:
                V = ours[n]["V"].copy()
                if tf == "envelope_out":
                    V[:, 0] += np.sign(V[:, 0]) * float(law.get("envelope_dx_mm", 0.0))
                    V[:, 1] += np.sign(V[:, 1]) * float(law.get("envelope_dy_mm", 0.0))
                src[n] = dict(V=V, F=ours[n]["F"])
            law_src[key] = src
            pairs.append((key, label, mnames, onames, note))
    if legs_form is not None:
        pairs.append((families.LEGS_FORM_KEY, families.LEGS_FORM_LABEL, common.resolve(MG, ["legs_out", "legs_in"]), legs_form[1], "placement removed: each of our legs (+ its leveler) translated in plan onto the nearest model leg's plan AABB centre"))
    for key, label, mnames, onames, note in pairs:
        if only and key not in only: continue
        if not mnames or not onames:
            log(f"[deviation] skip {key} (model {len(mnames)} nodes, ours {len(onames)} meshes)")
            results[key] = dict(label=label, note=note, skipped=True, model_nodes=len(mnames), ours_meshes=len(onames)); continue
        src = legs_form[0] if key == families.LEGS_FORM_KEY else (law_src[key] if key in law_src else ours)
        MV, MF = common.concat(nodes, mnames); OV, OF = common.concat(src, onames)
        spacing = 2.0 if key != "whole_table" else 3.0
        sdM = common.SurfaceDist(MV, MF, spacing=spacing); sdO = common.SurfaceDist(OV, OF, spacing=spacing)
        dv = sdM.dist(OV)                      # our vertices -> model surface
        Os, Ot = common.sample_surface(OV, OF, spacing=spacing, max_n=600_000); ds = sdM.dist(Os)   # our surface samples -> model
        Ms, Mt = common.sample_surface(MV, MF, spacing=spacing, max_n=600_000); dm = sdO.dist(Ms)   # model samples -> our surface
        res = dict(label=label, note=note, model_nodes=len(mnames), ours_meshes=len(onames), model_tris=int(len(MF)), ours_tris=int(len(OF)),
                   model_area_mm2=round(float(common.tri_areas(MV, MF).sum()), 0), ours_area_mm2=round(float(common.tri_areas(OV, OF).sum()), 0),
                   model_samples_in_tree=int(len(sdM.P)), ours_samples_in_tree=int(len(sdO.P)),
                   ours_vertices_to_model=common.stats(dv), ours_samples_to_model=common.stats(ds), model_samples_to_ours=common.stats(dm),
                   frac_ours_samples_within_5mm=round(float((ds <= 5).mean()), 4), frac_model_samples_within_5mm=round(float((dm <= 5).mean()), 4),
                   frac_ours_samples_over_20mm=round(float((ds > 20).mean()), 4), frac_model_samples_over_20mm=round(float((dm > 20).mean()), 4))
        if key == families.LEGS_FORM_KEY: res["centroid_shifts"] = legs_form[2]
        results[key] = res
        if heatmaps:
            rO = max(1, int(round(1.2 * np.sqrt(res["ours_area_mm2"] / len(Os)) * heat.PX))); rM = max(1, int(round(1.2 * np.sqrt(res["model_area_mm2"] / len(Ms)) * heat.PX)))
            rows = [("ours -> model (visible samples)", {v: heat.splat(Os, ds, heat.VIEWS[v], heat.visible_mask(OV, OF, Os, Ot, heat.VIEWS[v]), rO) for v in heat.VIEWS}),
                    ("model -> ours (visible samples)", {v: heat.splat(Ms, dm, heat.VIEWS[v], heat.visible_mask(MV, MF, Ms, Mt, heat.VIEWS[v]), rM) for v in heat.VIEWS})]
            heat.heatfig(rows, f"{label}\nours->model: med {res['ours_samples_to_model']['median']} / p90 {res['ours_samples_to_model']['p90']} / max {res['ours_samples_to_model']['max']} mm   |   model->ours: med {res['model_samples_to_ours']['median']} / p90 {res['model_samples_to_ours']['p90']} / max {res['model_samples_to_ours']['max']} mm", f"{cfg.heatmaps}/heat_{key}.png")
        np.savez_compressed(f"{cfg.data}/dev_{key}.npz", ours_samples=Os.astype(np.float32), d_ours=ds.astype(np.float32), d_model=dm.astype(np.float32))  # model sample coordinates NOT stored
        log(f"[deviation] [{time.time() - t0:6.1f}s] {key:44s} o->m med/p90/max {res['ours_samples_to_model']['median']}/{res['ours_samples_to_model']['p90']}/{res['ours_samples_to_model']['max']}   m->o {res['model_samples_to_ours']['median']}/{res['model_samples_to_ours']['p90']}/{res['model_samples_to_ours']['max']}   (Ms {len(Ms)}, Os {len(Os)})")
    common.dump_json(results, os.path.join(cfg.data, "deviation.json"))
    log(f"[deviation] done {time.time() - t0:.1f}s")
    return results


if __name__ == "__main__":
    cfg, a = paths.from_args(description=__doc__, extra=lambda p: (p.add_argument("--no-heatmaps", action="store_true"), p.add_argument("--only", nargs="*")))
    d, ours = common.load_ours(cfg.ours); OG = common.ours_groups(ours)
    nodes, MG = common.load_model(cfg.model_obj_dir)
    run(cfg, ours, OG, nodes, MG, heatmaps=not a.no_heatmaps, only=a.only)
