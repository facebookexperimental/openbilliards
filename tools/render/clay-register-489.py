# Copyright (c) Meta Platforms, Inc. and affiliates.

"""clay-register-489.py — prove the CLAY stimuli share one register (GH-489 craft
R3-SNK-5B S1): per pose, compare our clay frame with the purchased-model study
render of the same pose — linear-luma percentiles, white fraction (the study
rig clips lamp-lit tops), background pixel, and the histogram intersection of
the 64-bin linear-luma histograms. Both sets are read as files only; nothing is
written but the table.

  python3 tools/render/clay-register-489.py <ours-dir> <ref-dir> [--out table.md]
"""
import sys, os, json
import numpy as np
from PIL import Image

ours = sys.argv[1]; ref = sys.argv[2]
out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None
POSES = ['corner_close_diag', 'corner_close_rail', 'corner_tt_diag', 'corner_tt_side', 'corner_edgeon',
         'mid_close_diag', 'mid_tt_inside', 'mid_edgeon', 'overview']

def luma(path):
    a = np.array(Image.open(path).convert('RGB')).astype(float) / 255
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    return 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2], a

rows = []
for p in POSES:
    fo, fr = os.path.join(ours, p + '.png'), os.path.join(ref, p + '.png')
    if not (os.path.exists(fo) and os.path.exists(fr)):
        rows.append((p, 'missing', '', '', '', '', '', '')); continue
    Yo, Ao = luma(fo); Yr, Ar = luma(fr)
    if Yo.shape != Yr.shape: rows.append((p, f'shape {Yo.shape} vs {Yr.shape}', '', '', '', '', '', '')); continue
    po = np.percentile(Yo, [10, 50, 90]); pr = np.percentile(Yr, [10, 50, 90])
    wo, wr = (Yo > 0.98).mean(), (Yr > 0.98).mean()
    ho, _ = np.histogram(np.clip(Yo, 0, 1), bins=64, range=(0, 1)); hr, _ = np.histogram(np.clip(Yr, 0, 1), bins=64, range=(0, 1))
    inter = np.minimum(ho / ho.sum(), hr / hr.sum()).sum()
    # non-white (shaded) part only: the construction reads there
    mo, mr = Yo[Yo <= 0.98], Yr[Yr <= 0.98]
    so = np.percentile(mo, [10, 50, 90]) if mo.size else [0, 0, 0]; sr = np.percentile(mr, [10, 50, 90]) if mr.size else [0, 0, 0]
    bo, br = Ao[4, 4], Ar[4, 4]
    rows.append((p, f'{po[0]:.3f}/{po[1]:.3f}/{po[2]:.3f}', f'{pr[0]:.3f}/{pr[1]:.3f}/{pr[2]:.3f}', f'{wo:.3f} / {wr:.3f}',
                 f'{so[0]:.3f}/{so[1]:.3f}/{so[2]:.3f}', f'{sr[0]:.3f}/{sr[1]:.3f}/{sr[2]:.3f}',
                 f'{inter:.3f}', f'{(bo*255).round().astype(int).tolist()} / {(br*255).round().astype(int).tolist()}'))
lines = ['| pose | ours luma p10/50/90 | ref p10/50/90 | white frac ours / ref | ours shaded p10/50/90 | ref shaded p10/50/90 | hist ∩ (64 bins) | bg px (4,4) ours / ref |',
         '| --- | --- | --- | --- | --- | --- | --- | --- |']
for r in rows: lines.append('| ' + ' | '.join(str(x) for x in r) + ' |')
txt = '\n'.join(lines)
print(txt)
if out: open(out, 'w').write(txt + '\n')
