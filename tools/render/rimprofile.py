# Copyright (c) Meta Platforms, Inc. and affiliates.

# rimprofile.py — radial luminance profile of rendered pool balls (glass-rim
# forensics, feat/fix-glass-rim). Samples Rec.709 luma along rays from ball
# center to just past the silhouette, averages over angles EXCLUDING the lamp
# highlight sector (auto: angles whose mid-band mean is >1.5x the median),
# and reports a RIM INDEX = outer band [0.86,0.98] / mid band [0.55,0.80].
# A glassy fresnel rim shows as index >> 1 rising at r/R -> 1.
#
#   uv run --with numpy --with pillow --with matplotlib \
#     tools/render/rimprofile.py --img frame.png --ball cue:820,665,85 \
#     [--ball two:869,458,52 ...] [--out plot.png] [--refine]
import argparse
import numpy as np
from PIL import Image


def luma(img):
    a = np.asarray(img.convert('RGB'), dtype=np.float64)
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def refine_circle(L, cx, cy, r):
    """Snap (cx, cy, r) to the silhouette: maximize mean |radial gradient|
    across the circle over a small search grid."""
    best, arg = -1, (cx, cy, r)
    ang = np.linspace(0, 2 * np.pi, 180, endpoint=False)
    ca, sa = np.cos(ang), np.sin(ang)
    for dx in range(-10, 11, 2):
        for dy in range(-10, 11, 2):
            for dr in range(-8, 9):
                rr = r + dr
                xi = cx + dx + ca * (rr + 2); yi = cy + dy + sa * (rr + 2)
                xo = cx + dx + ca * (rr - 2); yo = cy + dy + sa * (rr - 2)
                ok = (xi > 0) & (xi < L.shape[1] - 1) & (yi > 0) & (yi < L.shape[0] - 1)
                if ok.sum() < 90:
                    continue
                g = np.abs(L[yi.astype(int)[ok], xi.astype(int)[ok]]
                           - L[yo.astype(int)[ok], xo.astype(int)[ok]]).mean()
                if g > best:
                    best, arg = g, (cx + dx, cy + dy, rr)
    return arg


def profile(L, cx, cy, r, nang=360, nrad=64):
    """(radii r/R, mean luma per radius over non-highlight angles, dark-sector
    mean profile, keep mask). Dark sector = darkest 40% of angles by mid-band
    mean — the glass rim reads there (shadow-side edge POPS instead of
    blending into the cloth)."""
    ang = np.linspace(0, 2 * np.pi, nang, endpoint=False)
    rad = np.linspace(0.02, 1.02, nrad)
    xs = cx + np.outer(np.cos(ang), rad * r)
    ys = cy + np.outer(np.sin(ang), rad * r)
    xs = np.clip(xs, 0, L.shape[1] - 1); ys = np.clip(ys, 0, L.shape[0] - 1)
    samp = L[ys.astype(int), xs.astype(int)]          # [ang, rad]
    band = (rad > 0.10) & (rad < 0.75)
    permean = samp[:, band].mean(axis=1)
    keep = permean < 1.5 * np.median(permean)         # drop highlight sector
    dark = permean <= np.quantile(permean, 0.40)
    return rad, samp[keep].mean(axis=0), samp[dark].mean(axis=0), keep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--img', required=True)
    ap.add_argument('--ball', action='append', required=True,
                    help='label:cx,cy,r (approx; refined to the silhouette)')
    ap.add_argument('--out', default=None, help='plot png')
    ap.add_argument('--no-refine', action='store_true')
    ap.add_argument('--title', default=None)
    # FIX2 (review round 2 on #731): option presence is not option value — a blank or trailing path flag and a missing input path exit 2 by name
    ap.allow_abbrev = False  # FIX2: no prefix matching — `--ou=` must not reach argparse as --out=''
    import os as _os, sys as _sys; _sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "lib")); from argpaths import guard_paths as _guard_paths
    args = ap.parse_args()
    _guard_paths({'--img': 'file', '--out': 'out'}, tag='rimprofile.py')  # FIX10 (Fable pass 2): after the parse — help exits 0 first; the guard is a post-parse value + existence check

    L = luma(Image.open(args.img))
    curves = []
    for spec in args.ball:
        label, rest = spec.split(':')
        cx, cy, r = (float(v) for v in rest.split(','))
        if not args.no_refine:
            cx, cy, r = refine_circle(L, cx, cy, r)
        rad, prof, dprof, keep = profile(L, cx, cy, r)
        mid = prof[(rad >= 0.55) & (rad <= 0.80)].mean()
        outer = prof[(rad >= 0.86) & (rad <= 0.98)].mean()
        dmid = dprof[(rad >= 0.55) & (rad <= 0.80)].mean()
        douter = dprof[(rad >= 0.86) & (rad <= 0.98)].mean()
        print(f'{args.img} {label}: c=({cx:.0f},{cy:.0f}) R={r:.0f}px '
              f'RIM_ALL={outer / max(mid, 1e-6):.3f} ({mid:.1f}->{outer:.1f}) '
              f'RIM_DARK={douter / max(dmid, 1e-6):.3f} ({dmid:.1f}->{douter:.1f}) '
              f'(kept {int(keep.sum())}/{len(keep)} angles)')
        curves.append((label, rad, prof, dprof))

    if args.out:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(7, 4.2), dpi=110)
        for label, rad, prof, dprof in curves:
            p = ax.plot(rad, prof, label=label)
            ax.plot(rad, dprof, '--', color=p[0].get_color(),
                    label=f'{label} (dark sector)')
        ax.axvspan(0.86, 0.98, alpha=0.12, color='red', label='outer band')
        ax.set_xlabel('r / R'); ax.set_ylabel('mean luma (8-bit)')
        ax.set_title(args.title or args.img)
        ax.legend(); ax.grid(alpha=0.3)
        fig.tight_layout(); fig.savefig(args.out)
        print('wrote', args.out)


if __name__ == '__main__':
    main()
