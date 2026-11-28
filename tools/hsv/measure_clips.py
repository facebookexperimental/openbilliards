# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Batch-measure all configured HSV clips.

Usage: python measure_clips.py <frames_root> <out_dir>

<frames_root> holds one PNG-frame directory per clip, named after the MP4
stem (see README.md for the ffmpeg extraction command). Writes per-clip
measurement JSON plus an annotated track overlay PNG for eyeball QC.
"""

import json
import math
import os
import sys

import numpy as np

import hsvlib

BALL_DIAMETER_MM = 57.15


def run(frames_root, out_dir):
    cfg = json.load(open(os.path.join(os.path.dirname(__file__), "clips.json")))
    os.makedirs(out_dir, exist_ok=True)
    dflt = cfg["defaults"]
    for clip in cfg["clips"]:
        frame_dir = os.path.join(frames_root, clip["mp4"].removesuffix(".mp4"))
        if not os.path.isdir(frame_dir):
            print(f"{clip['id']}: frames missing, skipped")
            continue
        if clip.get("qualitative_only"):
            rec = {
                "clip_id": clip["id"],
                "url": cfg["base_url"] + clip["url"],
                "title": clip["title"],
                "conditions": clip["conditions"],
                "fps": {"value": 1000, "provenance": clip["fps_provenance"]},
                "measured": None,
                "qc": clip.get("qc_extra", []),
            }
            json.dump(
                rec, open(os.path.join(out_dir, clip["id"] + ".json"), "w"), indent=1
            )
            print(f"{clip['id']}: qualitative-only record")
            continue
        _, imgs = hsvlib.load_frames(frame_dir)
        bg = np.median(imgs, axis=0)
        cents, _ = hsvlib.track(
            imgs,
            bg,
            roi=clip.get("roi"),
            thresh=clip.get("thresh", dflt["thresh"]),
            min_area=clip.get("min_area", dflt["min_area"]),
            gate=tuple(clip["gate"]) if "gate" in clip else None,
        )
        # Duplicated-frame detection (some encodes repeat each capture frame
        # twice): consecutive-centroid-identical fraction ~0.5 -> factor 2.
        ok = cents[~np.isnan(cents[:, 0])]
        step = np.hypot(np.diff(ok[:, 0]), np.diff(ok[:, 1]))
        dup = 2 if len(step) > 10 and (step < 0.12).mean() > 0.35 else 1
        tilt = None
        if "edge" in clip:
            tilt = hsvlib.fit_cushion_edge(
                bg, clip["side"], tuple(clip["edge"]["scan"]), tuple(clip["edge"]["sweep"])
            )
        meas = hsvlib.measure(
            cents,
            clip["side"],
            tilt,
            tuple(clip.get("pre", dflt["pre"])),
            tuple(clip.get("post", dflt["post"])),
            apex=clip.get("apex"),
        )
        if meas is None:
            print(f"{clip['id']}: MEASUREMENT FAILED")
            continue
        qc = list(clip.get("qc_extra", []))
        if tilt is None:
            qc.append("no_cushion_edge_fit_axis_aligned")
            # Fold unknown cushion tilt (est. +/-2 deg) into angle sigmas.
            for k in ("theta_in_sigma_deg", "theta_out_sigma_deg"):
                meas[k] = round(math.hypot(meas[k], 2.0), 2)
        apex = meas["apex_frame"]
        near = cents[max(0, apex - 25) : apex + 25]
        if np.isnan(near[:, 0]).sum() > 3:
            qc.append("occlusion_gaps_near_contact")
        if meas["vn_in_pxf"] * dup < 1.5:
            qc.append("low_normal_speed_dwell_unreliable")
        if abs(meas["vt_in_pxf"]) < 1.0:
            qc.append("near_perpendicular_tangential_ratio_ill_conditioned")
        if dup == 2:
            qc.append("duplicated_frames_factor_2")
        if meas["dwell_frames"] / dup <= 2 or meas["dwell_frames"] / dup >= 11:
            qc.append("dwell_estimate_unreliable")
        qc.append("perspective_skew_uncorrected")
        # Convert video-frame kinematics to capture-frame units.
        meas["dwell_frames_capture"] = round(meas.pop("dwell_frames") / dup, 1)
        for k in ("v_in_pxf", "v_out_pxf", "vn_in_pxf", "vt_in_pxf", "vt_out_pxf"):
            meas[k] = round(meas[k] * dup, 3)
        r_px = hsvlib.ball_radius_px(imgs, bg, cents, max(0, apex - 15))
        rec = {
            "clip_id": clip["id"],
            "url": cfg["base_url"] + clip["url"],
            "title": clip["title"],
            "conditions": clip["conditions"],
            "fps": {"value": 1000, "provenance": clip["fps_provenance"]},
            "cushion_tilt_deg": None if tilt is None else round(math.degrees(tilt), 2),
            "frame_duplication_factor": dup,
            "ball_radius_px": r_px,
            "mm_per_px": None
            if r_px is None
            else round(BALL_DIAMETER_MM / (2 * r_px), 3),
            "measured": meas,
            "qc": qc,
        }
        if rec["mm_per_px"] is not None:
            # px/capture-frame * mm/px * 1000 f/s = mm/s -> m/s. Valid only
            # if capture is really 1000 fps; scale itself is +/-15%.
            for k in ("in", "out"):
                rec["measured"]["v_%s_mps_if_1000fps" % k] = round(
                    meas["v_%s_pxf" % k] * rec["mm_per_px"], 2
                )
            rec["measured"]["dwell_ms_if_1000fps"] = meas["dwell_frames_capture"]
        json.dump(rec, open(os.path.join(out_dir, clip["id"] + ".json"), "w"), indent=1)
        hsvlib.annotate(
            bg, cents, clip["side"], tilt, meas,
            os.path.join(out_dir, clip["id"] + "_overlay.png"),
        )
        print(
            "%-8s apex=%3d in=%5.1f out=%5.1f e_n=%.2f vt=%5.2f dwell=%4.1f qc=%s"
            % (
                clip["id"], apex, meas["theta_in_deg"], meas["theta_out_deg"],
                meas["e_n"], meas["tangential_ratio"],
                meas["dwell_frames_capture"], ",".join(qc),
            )
        )


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2])
