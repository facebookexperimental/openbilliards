# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Stripe-visibility spin estimation for striped-ball HSV clips.

Usage: python spin_stripe.py <frames_root> <out_dir>

<out_dir> is the measure_clips.py output directory: the per-clip JSON
written there provides each clip's frame_duplication_factor (some encodes
duplicate every capture frame), and results are written to
<out_dir>/spin_stripe.json where build_fixture.py reads them.

The cue ball in the HSV 6.x bank series is a striped ball; the dark-stripe
fraction inside a disc centred on the (bias-corrected) bright centroid is a
periodic signal whose period is the ball's rotation period. Autocorrelation
of that signal in a pre-contact and a post-contact window gives |omega|.

CAVEATS (why this is an estimate, not a measurement):
- one stripe-visibility cycle per revolution is assumed; a x2 harmonic
  ambiguity exists when both stripe arcs cross the visible hemisphere,
  so the true |omega| may be HALF the reported value;
- spin about the stripe's own axis is invisible;
- the spin AXIS is not recovered (needs stripe great-circle fitting);
- sign/sense must come from the clip title (running/reverse).
"""

import json
import os
import sys

import numpy as np

import hsvlib


def darkfrac_series(imgs, bg, cents, r_disc, off=(5.0, -5.0)):
    h, w = bg.shape
    yy, xx = np.mgrid[0:h, 0:w]
    vals = np.full(len(imgs), np.nan)
    for i, im in enumerate(imgs):
        if np.isnan(cents[i, 0]):
            continue
        cx, cy = cents[i, 0] + off[0], cents[i, 1] + off[1]
        disc = (xx - cx) ** 2 + (yy - cy) ** 2 < r_disc**2
        vals[i] = ((im - bg)[disc] < -40).mean()
    return vals


def period_autocorr(sig, lo=10, hi=70):
    sig = sig[~np.isnan(sig)]
    if len(sig) < lo * 2:
        return None, 0.0
    sig = sig - sig.mean()
    if sig.std() < 1e-3:
        return None, 0.0
    ac = np.correlate(sig, sig, "full")[len(sig) - 1 :]
    ac /= ac[0]
    hi = min(hi, len(ac) - 2)
    if hi <= lo:
        return None, 0.0
    k = lo + int(np.argmax(ac[lo : hi + 1]))
    # require a genuine interior local maximum with decent correlation
    if ac[k] < 0.3 or k in (lo, hi) or ac[k] < ac[k - 1] or ac[k] < ac[k + 1]:
        return None, float(ac[k])
    return int(k), float(ac[k])


def run(frames_root, out_dir):
    clips = json.load(open(os.path.join(os.path.dirname(__file__), "clips.json")))
    out = {}
    for cid in ("HSV6-6", "HSV6-7", "HSV6-9", "HSV6-10"):
        clip = next(c for c in clips["clips"] if c["id"] == cid)
        # Periods below are in VIDEO frames; omega must be computed in
        # CAPTURE frames (the fixture's own caveat), so divide by the
        # frame_duplication_factor measure_clips.py detected for this clip.
        measured = json.load(open(os.path.join(out_dir, cid + ".json")))
        dup = measured["frame_duplication_factor"]
        d = os.path.join(frames_root, clip["mp4"].removesuffix(".mp4"))
        _, imgs = hsvlib.load_frames(d)
        bg = np.median(imgs, axis=0)
        cents, _ = hsvlib.track(imgs, bg)
        _, (nx, ny) = hsvlib.frame_axes(clip["side"], 0.0)
        s = cents[:, 0] * nx + cents[:, 1] * ny
        apex = int(np.nanargmax(s))
        r_ball = hsvlib.ball_radius_px(imgs, bg, cents, max(0, apex - 15)) or 40.0
        sig = darkfrac_series(imgs, bg, cents, 0.45 * r_ball)
        res = {"apex_frame": apex, "windows": {}}
        for lbl, a, b in (
            ("pre", max(0, apex - 68), apex - 4),
            ("post", apex + 4, min(len(imgs), apex + 68)),
        ):
            period, acpk = period_autocorr(sig[a:b])
            res["windows"][lbl] = {
                "period_video_frames": period,
                "autocorr_peak": round(acpk, 2),
                "omega_rad_s_if_1000fps_single_cycle": None
                if period is None
                else round(2 * np.pi / (period / dup) * 1000, 1),
            }
        out[cid] = res
        print(cid, json.dumps(res))
    json.dump(out, open(os.path.join(out_dir, "spin_stripe.json"), "w"), indent=1)


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2])
