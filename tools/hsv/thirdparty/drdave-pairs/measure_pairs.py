# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Independent reduction of Dr. Dave matched-english cushion pairs
(issue #18 Phase 1a).  Wayback-mirrored clips; tracking reuses tools/hsv
hsvlib (median background + bright-blob intensity centroid) but fits
velocities against an EXACT per-frame time base:

  * A-series: the Redlake 'PLAY-######' capture-frame counter OCR'd from
    the OSD (ocr_osd.py) -- absolute ms at the stamped 1000FPS, robust to
    the in-clip replay cuts (fits restricted to the live segment).
  * classic 6.x: frame index / duplication factor (capture-frame units;
    1000 fps INFERRED from the shared rig -- ratios are fps-independent).

Writes per-clip: raw track CSV (out/tracks/), measurement JSON
(out/measurements/), annotated overlay PNG (out/overlays/).

Usage: python3 measure_pairs.py frames out
"""

import csv
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
import hsvlib  # noqa: E402

BALL_DIAMETER_MM = 57.15

DEFAULTS = {"thresh": 30, "min_area": 150, "pre": (4, 18), "post": (5, 18)}

# side/edge/roi conventions follow tools/hsv/clips.json (same scenes).
CONFIG = {
    "HSV6-6": dict(stem="HSV6-6_bank_fast_left", side="right",
                   edge=dict(scan=(225, 315), sweep=(35, 210)),
                   conditions=dict(approach="angled", speed="fast", spin="reverse")),
    "HSV6-7": dict(stem="HSV6-7_bank_fast_right", side="right",
                   edge=dict(scan=(225, 315), sweep=(35, 210)),
                   conditions=dict(approach="angled", speed="fast", spin="running")),
    "HSV6-8": dict(stem="HSV6-8_bank_slow_left", side="right",
                   edge=dict(scan=(225, 315), sweep=(35, 210)),
                   conditions=dict(approach="angled", speed="slow", spin="reverse")),
    "HSV6-9": dict(stem="HSV6-9_bank_slow_right", side="right",
                   edge=dict(scan=(225, 315), sweep=(35, 210)),
                   conditions=dict(approach="angled", speed="slow", spin="running")),
    "HSV6-10": dict(stem="HSV6-10_cue_bank_straight_right", side="top",
                    edge=dict(scan=(4, 45), sweep=(30, 290)),
                    conditions=dict(approach="near-perpendicular", speed="medium",
                                    spin="sidespin")),
    "HSV6-11": dict(stem="HSV6-11_cue_bank_angled_left", side="top",
                    edge=dict(scan=(4, 45), sweep=(30, 290)),
                    conditions=dict(approach="angled", speed="medium", spin="reverse")),
    "HSV6-12": dict(stem="HSV6-12_cue_bank_angled_right", side="top",
                    edge=dict(scan=(4, 45), sweep=(30, 290)), pre=(3, 6),
                    qc=["short_pre_contact_capture"],
                    conditions=dict(approach="angled", speed="medium", spin="running")),
    "HSVA-26": dict(stem="HSVA-26_kick_with_English", side="bottom",
                    roi=(40, 192, 0, 320), osd=True,
                    conditions=dict(approach="near-perpendicular", speed="medium",
                                    spin="sidespin")),
    "HSVA-27": dict(stem="HSVA-27_small_angle_kick_with_reverse_English",
                    side="bottom", roi=(40, 192, 0, 320), osd=True,
                    conditions=dict(approach="small-angle", speed="medium",
                                    spin="reverse")),
    "HSVA-28": dict(stem="HSVA-28_small_angle_kick_with_running_English",
                    side="bottom", roi=(40, 192, 0, 320), osd=True,
                    conditions=dict(approach="small-angle", speed="medium",
                                    spin="running")),
    # A.68-71: camera looks ALONG the rail; image x = tangential (along-rail)
    # channel, image y = foreshortened depth proxy.  Only the tangential
    # ratio is honestly measurable; live segment only (replay cut dropped).
    "HSVA-68": dict(stem="HSVA-68_kick_shot_with_running-English_slow", side="top",
                    roi=(35, 188, 0, 320), osd=True, seg=(1, 460), thresh=25,
                    min_area=90, pre=(10, 90), post=(10, 90), along_rail=True,
                    apex_search=(100, 420),
                    conditions=dict(approach="large-angle", speed="slow",
                                    spin="running")),
    "HSVA-69": dict(stem="HSVA-69_kick_shot_with_running-English_fast", side="top",
                    roi=(35, 188, 0, 320), osd=True, seg=(1, 167), thresh=25,
                    min_area=90, pre=(8, 35), post=(8, 60), along_rail=True,
                    apex_search=(20, 150),
                    conditions=dict(approach="large-angle", speed="fast",
                                    spin="running")),
    "HSVA-70": dict(stem="HSVA-70_kick_shot_with_reverse-English_slow", side="top",
                    roi=(35, 188, 0, 320), osd=True, seg=(2, 418), thresh=25,
                    min_area=90, pre=(10, 90), post=(10, 90), along_rail=True,
                    apex_search=(10, 300),
                    conditions=dict(approach="large-angle", speed="slow",
                                    spin="reverse")),
    "HSVA-71": dict(stem="HSVA-71_kick_shot_with_reverse-English_fast", side="top",
                    roi=(35, 188, 0, 320), osd=True, seg=(1, 161), thresh=25,
                    min_area=90, pre=(8, 35), post=(8, 60), along_rail=True,
                    apex_search=(30, 150),
                    conditions=dict(approach="large-angle", speed="fast",
                                    spin="reverse")),
}


def linfit_t(cents, t, a, b, min_pts=5):
    """hsvlib.linfit against an explicit time axis t (capture frames)."""
    seg, tt = cents[a:b], t[a:b]
    ok = ~(np.isnan(seg[:, 0]) | np.isnan(tt))
    seg, tt = seg[ok], tt[ok]
    n = len(tt)
    if n < min_pts or tt.max() - tt.min() < 1e-9:
        return None
    out = []
    for k in (0, 1):
        coef = np.polyfit(tt, seg[:, k], 1)
        pred = np.polyval(coef, tt)
        ssr = float(np.sum((seg[:, k] - pred) ** 2))
        sxx = float(np.sum((tt - tt.mean()) ** 2))
        se = math.sqrt(ssr / (n - 2) / sxx) if n > 2 else float("nan")
        out.append((coef[0], se, coef[1]))
    (vx, sx, bx), (vy, sy, by) = out
    return vx, vy, sx, sy, n, bx, by


def measure_t(cents, t, side, tilt, pre, post, apex=None, apex_search=None,
              dwell_tol=1.2):
    """hsvlib.measure with velocities fit against t; window bounds stay in
    video-frame indices.  Velocities in px per capture frame."""
    (tx, ty), (nx, ny) = hsvlib.frame_axes(side, tilt if tilt is not None else 0.0)
    s = cents[:, 0] * nx + cents[:, 1] * ny
    if apex is None:
        if apex_search is not None:
            a, b = apex_search
            apex = a + int(np.nanargmax(s[a:b]))
        else:
            apex = int(np.nanargmax(s))
    if apex - pre[0] <= 0:
        return None
    a_pre = linfit_t(cents, t, max(0, apex - pre[0] - pre[1]), apex - pre[0])
    a_post = linfit_t(cents, t, apex + post[0], min(len(cents), apex + post[0] + post[1]))
    if a_pre is None or a_post is None:
        return None
    res = {"apex_frame": apex}
    comp = {}
    for lbl, (vx, vy, sx, sy, n, _bx, _by) in (("in", a_pre), ("out", a_post)):
        vt, vn = vx * tx + vy * ty, vx * nx + vy * ny
        st = math.hypot(sx * tx, sy * ty)
        sn = math.hypot(sx * nx, sy * ny)
        sp = math.hypot(vx, vy)
        theta = math.degrees(math.atan2(abs(vt), abs(vn)))
        dth = math.degrees(math.hypot(vn * st, vt * sn) / max(vt * vt + vn * vn, 1e-12))
        comp[lbl] = (vt, vn, st, sn, sp, n)
        res["theta_%s_deg" % lbl] = round(theta, 2)
        res["theta_%s_sigma_deg" % lbl] = round(dth, 2)
        res["v_%s_pxcf" % lbl] = round(sp, 4)
        res["n_frames_%s" % lbl] = n
    (ti, ni_, sti, sni, spi, _), (to, no, sto, sno, spo, _) = comp["in"], comp["out"]

    def ratio(a, b, sa, sb):
        r = a / b
        return r, abs(r) * math.hypot(sa / max(abs(a), 1e-12), sb / max(abs(b), 1e-12))

    for key, (a, b, sa, sb) in {
        "speed_ratio": (spo, spi, math.hypot(sto, sno), math.hypot(sti, sni)),
        "e_n": (abs(no), abs(ni_), sno, sni),
        "tangential_ratio": (to, ti, sto, sti),
    }.items():
        r, sr = ratio(a, b, sa, sb)
        res[key] = round(r, 4)
        res[key + "_sigma"] = round(sr, 4)
    # Dwell (video frames, same |deviation| logic as hsvlib.measure).
    s_pre_line = (a_pre[0] * t + a_pre[5]) * nx + (a_pre[1] * t + a_pre[6]) * ny
    s_post_line = (a_post[0] * t + a_post[5]) * nx + (a_post[1] * t + a_post[6]) * ny
    bounds = [apex - 21, apex + 21]
    for idx, (step, line) in enumerate(((-1, s_pre_line), (1, s_post_line))):
        k = apex + step
        while abs(k - apex) <= 20 and 0 <= k < len(s):
            if not np.isnan(s[k]) and abs(line[k] - s[k]) <= dwell_tol:
                bounds[idx] = k
                break
            k += step
    res["dwell_video_frames"] = max(1, bounds[1] - bounds[0] - 1)
    res["vn_in_pxcf"] = round(abs(ni_), 4)
    res["vt_in_pxcf"] = round(ti, 4)
    res["vt_out_pxcf"] = round(to, 4)
    res["vt_in_sigma_pxcf"] = round(sti, 4)
    res["vt_out_sigma_pxcf"] = round(sto, 4)
    res["vn_in_sigma_pxcf"] = round(sni, 4)
    res["vn_out_sigma_pxcf"] = round(sno, 4)
    res["vn_out_pxcf"] = round(abs(no), 4)
    return res


def time_axis(clip_id, cfg, n, out_dir):
    """Per-video-frame capture-frame time.  Frames outside the live segment
    or with unreadable OSD get NaN (dropped from fits)."""
    if cfg.get("osd"):
        p = os.path.join(out_dir, "osd_times", cfg["stem"] + ".csv")
        t = np.full(n, np.nan)
        for r in csv.DictReader(open(p)):
            if r["readable"] == "1":
                # counter is stored negated (counts down to END): it is
                # directly the capture-frame time in ms (monotone increasing).
                t[int(r["frame"]) - 1] = int(r["counter_capture_frames"])
        if "seg" in cfg:
            a, b = cfg["seg"]
            t[: a - 1] = np.nan
            t[b:] = np.nan
        return t, None
    return None, "defer"  # 6.x: needs dup detection after tracking


def run(frames_root, out_dir):
    for d in ("tracks", "measurements", "overlays"):
        os.makedirs(os.path.join(out_dir, d), exist_ok=True)
    summary = []
    for clip_id, cfg in CONFIG.items():
        frame_dir = os.path.join(frames_root, cfg["stem"])
        if not os.path.isdir(frame_dir):
            print(clip_id, "frames missing, skipped")
            continue
        _, imgs = hsvlib.load_frames(frame_dir)
        bg = np.median(imgs, axis=0)
        cents, areas = hsvlib.track(
            imgs, bg, roi=cfg.get("roi"),
            thresh=cfg.get("thresh", DEFAULTS["thresh"]),
            min_area=cfg.get("min_area", DEFAULTS["min_area"]),
        )
        n = len(imgs)
        t, defer = time_axis(clip_id, cfg, n, out_dir)
        dup = 1
        if defer:  # classic 6.x: duplicated-frame detection (measure_clips.py)
            ok = cents[~np.isnan(cents[:, 0])]
            step = np.hypot(np.diff(ok[:, 0]), np.diff(ok[:, 1]))
            dup = 2 if len(step) > 10 and (step < 0.12).mean() > 0.35 else 1
            t = np.arange(n, dtype=float) / dup
        if "seg" in cfg:  # NaN-out centroids outside the live segment
            a, b = cfg["seg"]
            cents[: a - 1] = np.nan
            cents[b:] = np.nan
        if cfg.get("along_rail"):
            # Drop edge-clipped AND partially-lit blobs: the scene fades to
            # black at the frame edges, so an emerging/exiting ball has only
            # its lit fraction counted -- the centroid sticks to the lit
            # boundary and fakes a slow-down (seen as area << full-ball
            # ~1700-2000 px).  Keep only full-visibility frames.
            clipped = (
                (cents[:, 0] < 32) | (cents[:, 0] > 288) | (areas < 1500)
            )
            cents[clipped] = np.nan
        tilt = None
        if "edge" in cfg:
            tilt = hsvlib.fit_cushion_edge(
                bg, cfg["side"], tuple(cfg["edge"]["scan"]), tuple(cfg["edge"]["sweep"])
            )
        meas = measure_t(
            cents, t, cfg["side"], tilt,
            tuple(cfg.get("pre", DEFAULTS["pre"])),
            tuple(cfg.get("post", DEFAULTS["post"])),
            apex=cfg.get("apex"), apex_search=cfg.get("apex_search"),
        )
        if meas is None:
            print(clip_id, "MEASUREMENT FAILED")
            continue
        qc = list(cfg.get("qc", []))
        if tilt is None:
            qc.append("no_cushion_edge_fit_axis_aligned")
            for k in ("theta_in_sigma_deg", "theta_out_sigma_deg"):
                meas[k] = round(math.hypot(meas[k], 2.0), 2)
        apex = meas["apex_frame"]
        near = cents[max(0, apex - 25): apex + 25]
        if np.isnan(near[:, 0]).sum() > 3:
            qc.append("occlusion_gaps_near_contact")
        if abs(meas["vt_in_pxcf"]) < 1.0:
            qc.append("near_perpendicular_tangential_ratio_ill_conditioned")
        if meas["vn_in_pxcf"] < 1.5:
            qc.append("low_normal_speed_dwell_unreliable")
        if dup == 2:
            qc.append("duplicated_frames_factor_2")
        if cfg.get("along_rail"):
            qc += [
                "camera_along_rail_normal_channel_is_depth_proxy_only",
                "angles_and_e_n_not_physical_use_tangential_ratio_only",
                "stripe_rotation_centroid_bias",
            ]
        qc.append("perspective_skew_uncorrected")
        r_px = hsvlib.ball_radius_px(imgs, bg, cents, max(0, apex - 15))
        mm_per_px = None if r_px is None else round(BALL_DIAMETER_MM / (2 * r_px), 3)
        rec = {
            "clip_id": clip_id,
            "stem": cfg["stem"],
            "conditions": cfg["conditions"],
            "side": cfg["side"],
            "time_base": (
                "osd_counter_1000fps_stamped" if cfg.get("osd")
                else "frame_index_dup%d_1000fps_inferred" % dup
            ),
            "cushion_tilt_deg": None if tilt is None else round(math.degrees(tilt), 2),
            "ball_radius_px": r_px,
            "mm_per_px": mm_per_px,
            "measured": meas,
            "qc": qc,
        }
        if mm_per_px is not None:
            for k in ("in", "out"):
                rec["measured"]["v_%s_mps" % k] = round(
                    meas["v_%s_pxcf" % k] * mm_per_px, 2
                )  # px/ms * mm/px = m/s at 1000 fps capture
        json.dump(rec, open(os.path.join(out_dir, "measurements", clip_id + ".json"), "w"),
                  indent=1)
        with open(os.path.join(out_dir, "tracks", clip_id + ".csv"), "w") as fh:
            fh.write("video_frame,t_capture_frames,x_px,y_px,blob_area_px\n")
            for i in range(n):
                fh.write("%d,%s,%s,%s,%d\n" % (
                    i + 1,
                    "" if np.isnan(t[i]) else ("%g" % t[i]),
                    "" if np.isnan(cents[i, 0]) else ("%.3f" % cents[i, 0]),
                    "" if np.isnan(cents[i, 1]) else ("%.3f" % cents[i, 1]),
                    areas[i],
                ))
        hsvlib.annotate(bg, cents, cfg["side"], tilt, meas,
                        os.path.join(out_dir, "overlays", clip_id + "_overlay.png"))
        print("%-8s apex=%3d th_in=%6.2f th_out=%6.2f v_ratio=%.3f e_n=%.3f tr=%+.3f qc=%s"
              % (clip_id, apex, meas["theta_in_deg"], meas["theta_out_deg"],
                 meas["speed_ratio"], meas["e_n"], meas["tangential_ratio"],
                 ";".join(qc)))
        summary.append(rec)
    json.dump(summary, open(os.path.join(out_dir, "measurements", "all.json"), "w"),
              indent=1)


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2])
