# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Centroid-tracking measurement library for Dr. Dave HSV cushion clips.

Input: per-clip directories of grayscale PNG frames extracted with ffmpeg
(320x240, see README.md).  Method (PoC-validated per the
cushion-tangential measurement plan, section 2.1): median-frame background ->
bright-pixel (frame - bg > thresh) centroid per frame -> apex split along
the cushion normal -> least-squares linear velocity fits pre/post contact ->
angles and velocity ratios w.r.t. the cushion line (intensity-edge fit where
the cushion band is visible, axis-aligned fallback otherwise).

Uncertainties are 1-sigma: velocity-component errors from linear-fit
residual standard errors (which absorb the ~1-2 px centroid jitter),
propagated first-order into angles and ratios; an extra tilt term is added
when the cushion line could not be edge-fitted.
"""

import glob
import math

import numpy as np
from PIL import Image

# Unit normal pointing from the table INTO the cushion, per config "side".
SIDE_NORMALS = {
    "top": (0.0, -1.0),
    "bottom": (0.0, 1.0),
    "left": (-1.0, 0.0),
    "right": (1.0, 0.0),
}


def load_frames(frame_dir):
    files = sorted(glob.glob(frame_dir + "/*.png"))
    imgs = np.stack(
        [np.asarray(Image.open(f).convert("L"), dtype=np.float32) for f in files]
    )
    return files, imgs


def track(imgs, bg, roi=None, thresh=30.0, min_area=150, gate=None):
    """Per-frame bright-blob centroid. roi=(y0,y1,x0,x1) masks OSD text rows.

    gate=(seed_frame, x, y, radius): sequentially gated tracking for scenes
    with a second moving ball -- only pixels within `radius` of the last
    known position count, propagated forward and backward from the seed.

    Returns (N,2) centroid array (NaN where no blob) and per-frame area.
    """

    def centroid(i, center):
        diff = imgs[i] - bg
        if roi is not None:
            y0, y1, x0, x1 = roi
            m = np.zeros_like(diff, dtype=bool)
            m[y0:y1, x0:x1] = diff[y0:y1, x0:x1] > thresh
        else:
            m = diff > thresh
        ys, xs = np.nonzero(m)
        if center is not None:
            keep = np.hypot(xs - center[0], ys - center[1]) < gate[3]
            xs, ys = xs[keep], ys[keep]
        if len(xs) < min_area:
            return None, len(xs)
        return (xs.mean(), ys.mean()), len(xs)

    cents = np.full((len(imgs), 2), np.nan)
    areas = np.zeros(len(imgs), dtype=int)
    if gate is None:
        for i in range(len(imgs)):
            c, areas[i] = centroid(i, None)
            if c is not None:
                cents[i] = c
        return cents, areas
    seed = gate[0]
    for rng in (range(seed, len(imgs)), range(seed - 1, -1, -1)):
        last = (gate[1], gate[2])
        for i in rng:
            c, areas[i] = centroid(i, last)
            if c is None:
                break  # lost the gated ball (left frame / occluded)
            cents[i] = c
            last = c
    return cents, areas


def fit_cushion_edge(bg, side, scan, sweep):
    """Fit the cushion band edge as a line; return tilt (rad) of the cushion
    line away from the image axis it nominally follows, or None on failure.

    scan=(a,b): pixel range along the normal axis containing the edge.
    sweep=(a,b): range along the cushion axis to sample profiles over.
    """
    pts = []
    for u in range(sweep[0], sweep[1], 4):
        profile = bg[scan[0] : scan[1], u] if side in ("top", "bottom") else bg[u, scan[0] : scan[1]]
        g = np.abs(np.diff(profile))
        if g.max() < 4.0:
            continue
        pts.append((u, scan[0] + int(np.argmax(g)) + 0.5))
    if len(pts) < 8:
        return None
    p = np.array(pts)
    slope, _ = np.polyfit(p[:, 0], p[:, 1], 1)
    # Residual check: reject wobbly fits (shadow edges, vignetting).
    resid = p[:, 1] - np.polyval(np.polyfit(p[:, 0], p[:, 1], 1), p[:, 0])
    if np.std(resid) > 2.5:
        return None
    # Sign convention matches frame_axes: tilt rotates the nominal normal so
    # that the tangent aligns with the fitted edge direction.
    return math.atan(slope) if side in ("top", "bottom") else -math.atan(slope)


def linfit(cents, a, b, min_pts=5):
    """Fit velocity over frame index range [a, b); returns
    (vx, vy, sx, sy, n_used, bx, by) with NaN-frame dropping.
    (bx, by) are the fit intercepts at frame 0 (for extrapolation)."""
    seg = cents[a:b]
    t = np.arange(a, b, dtype=float)
    ok = ~np.isnan(seg[:, 0])
    seg, t = seg[ok], t[ok]
    n = len(t)
    if n < min_pts:
        return None
    out = []
    for k in (0, 1):
        coef = np.polyfit(t, seg[:, k], 1)
        pred = np.polyval(coef, t)
        ssr = float(np.sum((seg[:, k] - pred) ** 2))
        sxx = float(np.sum((t - t.mean()) ** 2))
        se = math.sqrt(ssr / (n - 2) / sxx) if n > 2 else float("nan")
        out.append((coef[0], se, coef[1]))
    (vx, sx, bx), (vy, sy, by) = out
    return vx, vy, sx, sy, n, bx, by


def frame_axes(side, tilt):
    """Cushion tangent/normal unit vectors in image coords for a cushion on
    `side`, whose line is tilted `tilt` rad from its nominal image axis."""
    nx, ny = SIDE_NORMALS[side]
    c, s = math.cos(tilt), math.sin(tilt)
    nx, ny = nx * c - ny * s, nx * s + ny * c  # rotate normal by tilt
    tx, ty = -ny, nx
    return (tx, ty), (nx, ny)


def measure(cents, side, tilt, pre, post, apex=None, dwell_tol=1.2):
    """Kinematic quantities from a centroid track.

    pre/post = (gap, length) in frames around the apex. Returns dict or None.
    """
    (tx, ty), (nx, ny) = frame_axes(side, tilt if tilt is not None else 0.0)
    s = cents[:, 0] * nx + cents[:, 1] * ny  # penetration coordinate
    if apex is None:
        apex = int(np.nanargmax(s))
    a_pre = linfit(cents, max(0, apex - pre[0] - pre[1]), apex - pre[0])
    a_post = linfit(cents, apex + post[0], min(len(cents), apex + post[0] + post[1]))
    if a_pre is None or a_post is None:
        return None
    res = {"apex_frame": apex}
    comp = {}
    for lbl, (vx, vy, sx, sy, n, _bx, _by) in (("in", a_pre), ("out", a_post)):
        vt, vn = vx * tx + vy * ty, vx * nx + vy * ny
        st = math.hypot(sx * tx, sy * ty)
        sn = math.hypot(sx * nx, sy * ny)
        sp = math.hypot(vx, vy)
        theta = math.degrees(math.atan2(abs(vt), abs(vn)))  # from cushion normal
        dth = math.degrees(
            math.hypot(vn * st, vt * sn) / max(vt * vt + vn * vn, 1e-12)
        )
        comp[lbl] = (vt, vn, st, sn, sp, n)
        res["theta_%s_deg" % lbl] = round(theta, 2)
        res["theta_%s_sigma_deg" % lbl] = round(dth, 2)
        res["v_%s_pxf" % lbl] = round(sp, 3)
        res["n_frames_%s" % lbl] = n
    (ti, ni_, sti, sni, spi, _), (to, no, sto, sno, spo, _) = comp["in"], comp["out"]

    def ratio(a, b, sa, sb):
        r = a / b
        return r, abs(r) * math.hypot(sa / abs(a), sb / abs(b))

    for key, (a, b, sa, sb) in {
        "speed_ratio": (spo, spi, math.hypot(sto, sno), math.hypot(sti, sni)),
        "e_n": (abs(no), abs(ni_), sno, sni),
        "tangential_ratio": (to, ti, sto, sti),
    }.items():
        r, sr = ratio(a, b, sa, sb)
        res[key] = round(r, 4)
        res[key + "_sigma"] = round(sr, 4)
    # Dwell: frames strictly between the last pre-contact frame still
    # consistent with the incoming free-flight fit line and the first
    # post-contact frame consistent with the outgoing one. |deviation| is
    # used because near the cushion the bright centroid picks up a bias of
    # either sign (ball merging with the lit cushion band). NaN frames
    # (ball occluded against the cushion) count as in-contact.
    t_all = np.arange(len(cents), dtype=float)
    s_pre_line = (a_pre[0] * t_all + a_pre[5]) * nx + (a_pre[1] * t_all + a_pre[6]) * ny
    s_post_line = (a_post[0] * t_all + a_post[5]) * nx + (a_post[1] * t_all + a_post[6]) * ny
    bounds = [apex - 21, apex + 21]
    for idx, (step, line) in enumerate(((-1, s_pre_line), (1, s_post_line))):
        k = apex + step
        while abs(k - apex) <= 20 and 0 <= k < len(s):
            if not np.isnan(s[k]) and abs(line[k] - s[k]) <= dwell_tol:
                bounds[idx] = k
                break
            k += step
    res["dwell_frames"] = max(1, bounds[1] - bounds[0] - 1)
    res["vn_in_pxf"] = round(abs(ni_), 3)
    res["vt_in_pxf"] = round(ti, 3)
    res["vt_out_pxf"] = round(to, 3)
    return res


def ball_radius_px(imgs, bg, cents, frame, thresh=25.0):
    """Rough ball radius: extent of the |diff| blob within 45 px of the
    centroid (bright + shaded ball side; shadow partially included -> treat
    as +/-15%)."""
    if frame >= len(imgs) or np.isnan(cents[frame, 0]):
        return None
    diff = np.abs(imgs[frame] - bg)
    ys, xs = np.nonzero(diff > thresh)
    cx, cy = cents[frame]
    sel = (np.abs(xs - cx) < 45) & (np.abs(ys - cy) < 45)
    if sel.sum() < 100:
        return None
    return round(float(np.sqrt(sel.sum() / math.pi)), 1)


def annotate(bg, cents, side, tilt, meas, out_path):
    """Overlay: track (red->yellow), pre/post fit windows (green/cyan),
    apex (blue cross), cushion line (magenta)."""
    from PIL import ImageDraw

    im = Image.fromarray(bg.astype(np.uint8)).convert("RGB")
    dr = ImageDraw.Draw(im)
    n = len(cents)
    apex = meas["apex_frame"]
    pre_rng = range(max(0, apex - 30), apex)
    post_rng = range(apex, min(n, apex + 30))
    for i, (x, y) in enumerate(cents):
        if np.isnan(x):
            continue
        col = (255, int(255 * i / n), 0)
        if i in pre_rng:
            col = (0, 255, 0)
        elif i in post_rng:
            col = (0, 255, 255)
        dr.ellipse([x - 1, y - 1, x + 1, y + 1], fill=col)
    ax, ay = cents[apex]
    if not np.isnan(ax):
        dr.line([ax - 5, ay, ax + 5, ay], fill=(80, 80, 255), width=2)
        dr.line([ax, ay - 5, ax, ay + 5], fill=(80, 80, 255), width=2)
        (tx, ty), _ = frame_axes(side, tilt if tilt is not None else 0.0)
        dr.line(
            [ax - 160 * tx, ay - 160 * ty, ax + 160 * tx, ay + 160 * ty],
            fill=(255, 0, 255),
        )
    im.save(out_path)
