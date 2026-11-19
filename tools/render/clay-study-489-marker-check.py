# Copyright (c) Meta Platforms, Inc. and affiliates.

"""clay-study-489-marker-check.py — the MIRROR TEST of the shared frame law
(GH-489 craft R3-SNK-6 S6-1). Both study renders (ours: clay-study-489-render.py;
the quarantine study tool for the purchased model) place the same RED-emitting cone
marker at one kernel point that lies off both symmetry axes of the table. If the
two tools share one frame law the marker lands at the same image position in
both frames of the same pose (to the registration offset, ~5 mm in the world);
under the R3-SNK-5 mirror it landed on the other side of the frame.

  python3 tools/render/clay-study-489-marker-check.py <ours.png> <reference.png> [red-threshold=120] [tolerance-px=40]

Prints both centroids, the pixel offset, and PASS/FAIL. Also refuses when the
marker is not found (no red blob: R - max(G, B) > threshold) in either frame.
"""
import sys
import numpy as np
from PIL import Image

if len(sys.argv) < 3:
    print(__doc__); sys.exit(2)
A, B = sys.argv[1], sys.argv[2]
TH = float(sys.argv[3]) if len(sys.argv) > 3 else 120.0
TOL = float(sys.argv[4]) if len(sys.argv) > 4 else 40.0


def centroid(path):
    im = np.asarray(Image.open(path).convert('RGB'), dtype=np.float64)
    red = im[:, :, 0] - np.maximum(im[:, :, 1], im[:, :, 2])
    m = red > TH
    if m.sum() < 30:
        return None, int(m.sum())
    ys, xs = np.nonzero(m)
    return (float(xs.mean()), float(ys.mean())), int(m.sum())


ca, na = centroid(A); cb, nb = centroid(B)
print(f'ours      {A}: marker px {na} centroid {ca}')
print(f'reference {B}: marker px {nb} centroid {cb}')
if ca is None or cb is None:
    print('FAIL: marker not found in one frame'); sys.exit(1)
dx, dy = cb[0] - ca[0], cb[1] - ca[1]
W = Image.open(A).size[0]
mirror_dx = (W - cb[0]) - ca[0]
print(f'offset reference - ours: dx {dx:+.1f} px, dy {dy:+.1f} px  (a MIRRORED frame would read dx {mirror_dx:+.1f})')
ok = abs(dx) <= TOL and abs(dy) <= TOL
print('PASS' if ok else 'FAIL', f'(tolerance {TOL:.0f} px)')
sys.exit(0 if ok else 1)
