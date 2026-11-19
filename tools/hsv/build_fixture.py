# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Assemble the HSV response-surface anchor fixture from per-clip outputs.

Usage: python build_fixture.py <out_dir> <fixture_path>

Merges measure_clips.py per-clip JSON + spin_stripe.py results under a
provenance header. Run measure_clips.py and spin_stripe.py first.
"""

import json
import os
import sys

PROVENANCE = (
    "Rebound kinematics measured from Dr. Dave's classic high-speed-video "
    "archive (index https://drdavepoolinfo.com/high-speed-video/; direct MP4s "
    "under https://drdavepoolinfo.com/high_speed_videos/, A-series under "
    "/new/), camera Kodak Motion Corder Analyzer PS-110. CAVEATS -- read "
    "before fitting: (1) the table is an unspecified ~2004 HOME-TABLE cushion, "
    "NOT a spec K-66 at known conditions; (2) capture rate 1000 fps is "
    "OSD-stamped ('1/1000 ... 1000FPS') on A-series clips and INFERRED for "
    "classic 6.x clips (shared rig, typical-configuration statement, dwell "
    "consistency); angles and velocity RATIOS are independent of the fps "
    "assumption, absolute speeds and dwell-ms are not; (3) 320x240 grayscale "
    "limits centroid precision to ~1-2 px (~0.5-0.8 mm at ball scale); (4) no "
    "in-frame table markings, so perspective foreshortening is uncorrected "
    "within each clip (the same-rig same-incidence series design cancels most "
    "of it clip-to-clip); (5) initial spin magnitude is not independently "
    "known (stripe-visibility periodicity gives relative spin only, see "
    "spin_stripe section). USE FOR FUNCTIONAL SHAPE FITTING ONLY (the "
    "speed x spin-sense response surface of e_n, tangential ratio and rebound "
    "angle -- issues #5/#9); absolute constants must come from a first-party "
    "session on the target cushion spec. Pipeline: tools/hsv (ffmpeg frame "
    "extraction -> median background -> bright-pixel centroid -> cushion-edge "
    "fit -> pre/post linear velocity fits); every track eyeball-verified on "
    "annotated overlays. Measured 2026-07-02."
)

B41_RECORD = {
    "clip_id": "HSVB-41",
    "url": "https://www.youtube.com/watch?v=wjeMWHfmMk4",
    "title": "Bank shot speed effects, with Bob Jewett (narrated B-series video)",
    "conditions": {"approach": "various", "speed": "various", "spin": "various"},
    "fps": {"value": 30, "provenance": "broadcast_edit_playback_rate"},
    "measured": None,
    "qc": [
        "not_measurable_multi_scene_narrated_edit",
        "live_table_scenes_oblique_no_homography",
        "embedded_hsv_inserts_also_stamp_1000fps",
    ],
}

SPIN_CAVEATS = [
    "only HSV6-9 shows a clean periodic stripe signal in both windows",
    "period is in VIDEO frames; divide by the clip frame_duplication_factor for capture frames (the omega_rad_s_if_1000fps field already applies this correction)",
    "absolute omega is NOT trusted: a x2 stripe-arc-per-revolution harmonic ambiguity exists and the single-cycle value would exceed achievable cue-induced spin",
    "the pre/post PERIOD RATIO is the robust observable (HSV6-9: 32 -> 20, spin rate x1.6 through contact, consistent with its tangential-velocity gain of 1.53)",
    "spin sense (running/reverse/follow/draw) is taken from clip titles",
]


def run(out_dir, fixture_path):
    cfg = json.load(open(os.path.join(os.path.dirname(__file__), "clips.json")))
    clips = []
    for c in cfg["clips"]:
        p = os.path.join(out_dir, c["id"] + ".json")
        clips.append(json.load(open(p)))
    clips.append(B41_RECORD)
    spin = json.load(open(os.path.join(out_dir, "spin_stripe.json")))
    fixture = {
        "format": "openbilliards.anchors.v1",
        "anchor": "hsv_response_surface",
        "provenance": PROVENANCE,
        "camera": {
            "model": "Kodak Motion Corder Analyzer PS-110",
            "capture_fps": 1000,
            "fps_note": cfg["fps_note"],
            "playback": "30 fps, 320x240 grayscale MP4",
        },
        "equipment_warning": (
            "~2004 home-table cushion, rubber spec unknown -- NOT K-66; "
            "57.15 mm pool ball used as in-frame scale"
        ),
        "uncertainty_model": (
            "1-sigma; velocity-component errors from linear-fit residual "
            "standard errors (absorb ~1-2 px centroid jitter), propagated "
            "first-order into angles and ratios; +/-2 deg added in quadrature "
            "when no cushion-edge fit (axis-aligned fallback); mm_per_px "
            "scale +/-15 percent; dwell +/-2-3 frames"
        ),
        "spin_stripe": {"caveats": SPIN_CAVEATS, "results": spin},
        "clips": clips,
    }
    with open(fixture_path, "w") as f:
        json.dump(fixture, f, indent=1)
    n_meas = sum(1 for c in clips if c["measured"] is not None)
    print(f"wrote {fixture_path}: {len(clips)} clips, {n_meas} with measurements")


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2])
