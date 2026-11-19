# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Registration / datum residuals (port of Task C register.py; unchanged). Datum-based, not ICP: bed-cloth top plane onto
the model's bed top, plan centre onto plan centre, long axis onto long axis. Output: <out>/data/registration.json."""
import os

import numpy as np

import common
import paths


def run(cfg, ours, G, nodes, MG, log=print):
    V = lambda names, src: np.vstack([src[n]["V"] for n in names])
    out = {}
    out["transform"] = dict(
        ours_frame="three.js world, metres, Y-up: x = along length (+foot), y = up (bed cloth top y=0), z = across width; origin = table centre on the bed",
        model_frame="3ds Max world, mm, Z-up: X = along length, Y = across width, Z = up; bed top z=770; table centre (0,0)",
        rule="X_m = 1000*x_o ; Y_m = -1000*z_o ; Z_m = 1000*y_o + 770.0  (proper rotation, det=+1; Y sign chosen to keep right-handedness; the table is mirror-symmetric in width so the sign carries no geometric consequence)",
        R=common.R.tolist(), T_mm=common.T.tolist(), scale=1.0, scaled_from_9ft=False, icp_applied=False)
    if "dm-bed-cloth" not in ours:
        raise SystemExit("register: ours export has no dm-bed-cloth mesh (bed datum)")
    bed = ours["dm-bed-cloth"]["V"]
    rt = V(G["railtop"], ours); mrails = V(MG["rails"], nodes); mcaps = V(MG["rail_caps"], nodes)
    apr = V(G["apron"], ours); mapr = V(MG["rail_side"], nodes)
    legs = V(G["leg"], ours); mlegs = V(MG["legs_out"], nodes)
    lev = V(G["leveler"], ours)
    mbedtop = nodes["pool_top"]["V"]; mbedtop = mbedtop[np.abs(mbedtop[:, 2] - 770.0) < 0.05]
    def mid(A): return ((A.min(0) + A.max(0)) / 2)[:2]
    def ext(A): return (A.max(0) - A.min(0))
    res = {}
    res["bed_top_z"] = dict(ours=round(float(bed[:, 2].mean()), 3), ours_spread=round(float(np.ptp(bed[:, 2])), 4), ours_n=int(len(bed)), model=770.0, model_n=int(len(mbedtop)), delta=round(float(bed[:, 2].mean() - 770.0), 3))
    res["plan_centre_railtop"] = dict(ours=np.round(mid(rt), 3).tolist(), model=np.round(mid(mrails), 3).tolist(), delta=np.round(mid(rt) - mid(mrails), 3).tolist())
    res["plan_centre_apron"] = dict(ours=np.round(mid(apr), 3).tolist(), model=np.round(mid(mapr), 3).tolist(), delta=np.round(mid(apr) - mid(mapr), 3).tolist())
    res["plan_centre_legs"] = dict(ours=np.round(mid(legs), 3).tolist(), model=np.round(mid(mlegs), 3).tolist(), delta=np.round(mid(legs) - mid(mlegs), 3).tolist())
    res["plan_centre_bed_top_face"] = dict(ours=np.round(mid(bed), 3).tolist(), model=np.round(mid(mbedtop), 3).tolist(), delta=np.round(mid(bed) - mid(mbedtop), 3).tolist())
    res["long_axis"] = dict(ours="X" if ext(rt)[0] > ext(rt)[1] else "Y", model="X" if ext(mrails)[0] > ext(mrails)[1] else "Y")
    res["envelope_railtop"] = dict(ours=np.round(ext(rt)[:2], 1).tolist(), model=np.round(ext(mrails)[:2], 1).tolist(), delta=np.round(ext(rt)[:2] - ext(mrails)[:2], 1).tolist(), delta_pct=np.round(100 * (ext(rt)[:2] - ext(mrails)[:2]) / ext(mrails)[:2], 2).tolist())
    res["envelope_apron_band"] = dict(ours=np.round(ext(apr)[:2], 1).tolist(), model=np.round(ext(mapr)[:2], 1).tolist(), delta=np.round(ext(apr)[:2] - ext(mapr)[:2], 1).tolist())
    res["rail_top_plane_z"] = dict(ours=round(float(rt[:, 2].max()), 2), model=round(float(mrails[:, 2].max()), 2), delta=round(float(rt[:, 2].max() - mrails[:, 2].max()), 2), note="real geometric difference (cap height), not a registration residual")
    res["floor_z"] = dict(ours_leveler_bottom=round(float(lev[:, 2].min()), 2), ours_leg_bottom=round(float(legs[:, 2].min()), 2), model_leg_feet=round(float(mlegs[:, 2].min()), 2), model_scene_zero=0.0, delta_floor=round(float(lev[:, 2].min() - mlegs[:, 2].min()), 2),
                          note="ours floor (leveler pads) vs the model's leg feet after bed-plane registration (positive = ours floor sits above the model's feet)")
    res["ours_symmetry"] = dict(railtop_abs_x=[round(float(-rt[:, 0].min()), 3), round(float(rt[:, 0].max()), 3)], railtop_abs_y=[round(float(-rt[:, 1].min()), 3), round(float(rt[:, 1].max()), 3)])
    ot = rt[rt[:, 2] > 820.0]; mt = mcaps[mcaps[:, 2] > 814.0]
    res["rail_cap_top_face_check"] = dict(ours_top_face=dict(n=int(len(ot)), z_mean=round(float(ot[:, 2].mean()), 2) if len(ot) else None, plan_centre=np.round(mid(ot), 2).tolist() if len(ot) else None, plan_extent=np.round(ext(ot)[:2], 1).tolist() if len(ot) else None),
                                          model_top_face=dict(n=int(len(mt)), z_mean=round(float(mt[:, 2].mean()), 2), plan_centre=np.round(mid(mt), 2).tolist(), plan_extent=np.round(ext(mt)[:2], 1).tolist()),
                                          verdict="datum fit only; ICP NOT applied (a rigid ICP would only bias the height datum away from the bed plane when the cap heights differ)")
    out["residuals"] = res
    common.dump_json(out, os.path.join(cfg.data, "registration.json"))
    log(f"[register] bed z delta {res['bed_top_z']['delta']}  plan centre railtop delta {res['plan_centre_railtop']['delta']}  rail top plane delta {res['rail_top_plane_z']['delta']}  floor delta {res['floor_z']['delta_floor']}")
    return out


if __name__ == "__main__":
    cfg, _ = paths.from_args(description=__doc__)
    d, ours = common.load_ours(cfg.ours); G = common.ours_groups(ours)
    nodes, MG = common.load_model(cfg.model_obj_dir)
    run(cfg, ours, G, nodes, MG)
