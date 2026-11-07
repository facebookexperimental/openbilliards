# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Heat-map helpers shared by deviation.py's two pair lists (the source carried identical copies in deviation.py and
deviation_extra.py). Viewer-facing sample per pixel (top: max z; side: max y; end: max x), 0-60 mm single-hue ramp."""
import numpy as np
from PIL import Image, ImageDraw

VIEWS = {"top": (0, 1, 2, -1400, 1400, -800, 800), "side": (0, 2, 1, -1400, 1400, -20, 880), "end": (1, 2, 0, -800, 800, -20, 880)}
PX = 0.5  # px per mm for heatmaps


def visible_mask(V, F, P, tri, view, tol=2.0):
    """Mesh-based occlusion: painter's triangle-ID raster (far -> near) at PX; a sample is visible if its own triangle is the
    visible one at its pixel, or its depth is within tol of the visible triangle's plane depth there."""
    a, b, dep, h0, h1, v0, v1 = view
    W = int((h1 - h0) * PX); H = int((v1 - v0) * PX)
    cen = V[F].mean(1)
    order = np.argsort(cen[:, dep])                 # far first, near last
    img = Image.new("I", (W, H), -1); dr = ImageDraw.Draw(img)
    hh = (V[:, a] - h0) * PX; vv = (v1 - V[:, b]) * PX
    for t in order:
        f = F[t]; dr.polygon([(hh[f[0]], vv[f[0]]), (hh[f[1]], vv[f[1]]), (hh[f[2]], vv[f[2]])], fill=int(t), outline=int(t))
    ids = np.array(img, dtype=np.int64)
    col = np.clip(((P[:, a] - h0) * PX).astype(int), 0, W - 1); row = np.clip(((v1 - P[:, b]) * PX).astype(int), 0, H - 1)
    vis_id = ids[row, col]
    n = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]); c = (n * V[F[:, 0]]).sum(1)
    ok = vis_id >= 0
    out = np.ones(len(P), dtype=bool)
    vi = vis_id[ok]; nd = n[vi, dep]
    with np.errstate(divide="ignore", invalid="ignore"):
        pd = (c[vi] - n[vi, a] * P[ok, a] - n[vi, b] * P[ok, b]) / nd
    edge_on = np.abs(nd) < 1e-9 * np.linalg.norm(n[vi], axis=1).clip(1e-12)
    same = vi == tri[ok]
    vis = same | edge_on | (P[ok, dep] >= pd - tol)
    out[ok] = vis
    return out


def splat(P, val, view, vis, r=1):
    a, b, dep, h0, h1, v0, v1 = view
    W = int((h1 - h0) * PX); H = int((v1 - v0) * PX)
    P = P[vis]; val = val[vis]
    col = ((P[:, a] - h0) * PX).astype(int); row = ((v1 - P[:, b]) * PX).astype(int)
    order = np.argsort(P[:, dep], kind="stable")          # ascending depth -> last write = nearest to the viewer
    img = np.full(H * W, np.nan)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            cc = np.clip(col[order] + dx, 0, W - 1); rr = np.clip(row[order] + dy, 0, H - 1)
            img[rr * W + cc] = val[order]
    return img.reshape(H, W), (h0, h1, v0, v1)


def heatfig(rows, title, path):
    """rows: list of (rowlabel, dict view->(img, ext))"""
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    from matplotlib import colors as mcolors
    cmap = plt.get_cmap("Oranges").copy(); cmap.set_over("#3b0a02"); cmap.set_bad("#ffffff")
    fig, axs = plt.subplots(len(rows), 3, figsize=(22, 5.2 * len(rows)), squeeze=False, gridspec_kw=dict(width_ratios=[2800 / 1600, 2800 / 900, 1600 / 900]))
    norm = mcolors.Normalize(0, 60)
    for r, (lab, imgs) in enumerate(rows):
        for c, v in enumerate(("top", "side", "end")):
            ax = axs[r, c]; img, ext = imgs[v]
            im = ax.imshow(img, cmap=cmap, norm=norm, extent=ext, origin="upper", interpolation="nearest")
            ax.set_facecolor("#ffffff"); ax.set_title(f"{lab} - {v}", fontsize=10); ax.set_aspect("equal")
            ax.tick_params(labelsize=7); ax.grid(True, lw=0.3, alpha=0.4)
    fig.suptitle(title, fontsize=12)
    cb = fig.colorbar(im, ax=axs.ravel().tolist(), shrink=0.6, pad=0.01, extend="max"); cb.set_label("distance to the other surface [mm]  (0-60, >60 dark; only samples visible from the view are drawn)")
    fig.savefig(path, dpi=110, bbox_inches="tight"); plt.close(fig)
