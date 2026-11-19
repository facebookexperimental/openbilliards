#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""midplan-read-490 — the evidence-05 PLAN read for the chinese-8 middle pocket (R1-FIX8; record
corrected by order R1-FIX9 item 6, 2026-09-02).

Reads one panel of the owner's plan-view triptych (looking straight down into the mouth) and
measures the VISIBLE straight run of each bay side wall below the cushion jaw, in the panel's own
pixels, then converts it at a stated — and UNCALIBRATED — candidate scale.  It is the CT-03
instrument: it decides whether the wall face beside that run is clothed (a wrap of the plank end
face) or bare (a tucked fold with end grain above it).  It does NOT see the wall's foot where the
white bag hides it, and it does NOT detect or measure the cover.

    python3 tools/render/midplan-read-490.py <07-triptych-evidence05-plan.png> [--panel 0]
        [--ymax 600] [--anchor-mm 80.7] [--debug out.png]

What it actually runs, in order:
  green  : HSV (OpenCV ranges) H 35..95, S >= 60, V >= 40 — the cloth
  cream  : S < 40, V >= 190 and not green — near-white; REPORTED only, never used to locate
           anything (on evidence 05 it is the white bag between the walls, not the cover)
  wall edges x_L(y), x_R(y): per row, scan from the column centre OUTWARD to the first green
           pixel on each side (within 0.45 W).  A side counts as a WALL only if the green field
           there is >= 20 px long (2 px gaps tolerated) and the two edges are > 0.15 W apart;
           the thin green fold slivers beside the cover's face are not walls
  cover top corners y_c : the DEEPEST walled row — below it only the slivers remain.  It is the
           row on which both wide green fields last flank the opening; nothing on it is a
           detected cover edge
  scale span W : x_R - x_L on row y_c - 3 (the nearest walled row above it).  CAVEAT — on
           evidence 05 this is the span between the two wall FEET flanking the white bag
           (near-white columns 437..631 on row 510); the cover's own outline below the corners
           is ~354 px.  --anchor-mm names what W is TAKEN to be: the default 80.7 = 2 x 45 /
           1.115 (2 x BC-01 / FLARE, the flared-cap top) is a label this span does not support,
           and 92 (the bay, 2 x DT-09) is a candidate, not a calibration.  Every mm figure
           printed is px / (W / anchor), and a perspective lower bound besides (the jaw end of
           the wall is farther from the camera than row y_c - 3)
  straight foot line, per wall : a line fitted to the edge over the band 60..80 % of the way
           from the arc apex (the first walled row) to y_c, extended UP while the edge stays
           within 3 px of the line (three consecutive misses end it — the jaw arc) and DOWN
           toward y_c tolerating up to 12 missing rows (the bag can hide the foot), stopping
           only when the edge moves OUTWARD from the line by > 3 px (nothing can stand outside
           the wall).  Its length in rows is the visible run; 'reaches the cover corners' is
           yes only if it ends within 8 rows of y_c
  cloth on the wall face : the green fraction along the fitted line offset 8 px OUTWARD over
           the run — 1.00 means the face beside the visible foot is clothed on every row

On the committed evidence-05 read (Drive cn8-midext-rebuild-2026-08/07-triptych-evidence05-plan.png,
panel 0, rows < 600) it prints the visible run as rows 426..477 = 51 px on both walls,
'reaches the cover corners: no (36 rows short)', and green fraction 1.00 — 20.7 mm at
--anchor-mm 80.7 (2.466 px/mm), 23.6 mm at --anchor-mm 92 (2.163 px/mm); see
docs/geometry/cn8-middle-furniture-definition.json CT-03 / O-12.  Any statement about rows
478..513 (behind the bag) is an inference and is not printed here.
"""
import sys
import numpy as np
import cv2
from PIL import Image


def arg(flag, default=None):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default


def main():
    path = sys.argv[1]
    panel = int(arg('--panel', 0)); ymax = int(arg('--ymax', 600))
    im = np.array(Image.open(path).convert('RGB'))
    pw = im.shape[1] // 3
    a = im[:ymax, panel * pw:(panel + 1) * pw]
    H = cv2.cvtColor(a, cv2.COLOR_RGB2HSV); h, s, v = [H[..., i].astype(int) for i in range(3)]
    green = (h >= 35) & (h <= 95) & (s >= 60) & (v >= 40)
    # near-white: REPORTED only, never used to locate anything. On evidence 05 the near-white
    # between the walls is the WHITE BAG, not the cover (R1-FIX9 record correction)
    cream = (s < 40) & (v >= 190) & ~green
    Hh, Ww = green.shape
    cx = Ww // 2
    # wall edges per row: scan from the column centre outward to the first GREEN pixel
    # (the walls are cloth on both sides all the way down to the cover); a row with no
    # green within 0.45 W on either side is below the cover's top corners (the cover's
    # face is flanked by the rail's wood there) and ends the interior
    xl = {}; xr = {}
    def grun(y, x, step):
        # green run length from x outward (2 px gaps tolerated)
        n = 0; gap = 0
        while 0 <= x < Ww and gap <= 2:
            if green[y, x]: n += 1; gap = 0
            else: gap += 1
            x += step
        return n
    for y in range(Hh):
        l = cx
        while l > 0 and not green[y, l] and cx - l < 0.45 * Ww: l -= 1
        r = cx
        while r < Ww - 1 and not green[y, r] and r - cx < 0.45 * Ww: r += 1
        # a WALL is a wide green field (the wall face and the rail top beyond it, >= 20 px);
        # the thin green fold slivers beside the cover's face are not walls
        if green[y, l] and green[y, r] and r - l > 0.15 * Ww and grun(y, l, -1) >= 20 and grun(y, r, +1) >= 20:
            xl[y] = l + 1; xr[y] = r - 1
    ys = sorted(xl)
    if not ys: print('no interior found'); return
    # the cover's top edge = the cover's top corners = the deepest row on which both walls
    # (wide green fields) still flank the opening; below it only the fold slivers remain
    yc = ys[-1]
    cf = cream[yc, xl[yc]:xr[yc] + 1].mean() if xr[yc] > xl[yc] else 0
    y0 = yc - 3
    while y0 not in xl: y0 -= 1
    W = xr[y0] - xl[y0]
    # scale anchor: W is the span between the two wall FEET on row y0. --anchor-mm names what
    # that span is TAKEN to be; the default 2 x BC-01 / FLARE 1.115 = 80.7 mm (the flared-cap
    # top) is a LABEL — on evidence 05 the span flanks the white bag, not the cover's top edge
    # (R1-FIX9 record correction) — and 92 (the bay, 2 x DT-09) is a candidate. Neither is a
    # calibration; the printed scale line is kept verbatim (reports quote it) and a CAVEAT
    # line follows it.
    anchor = float(arg('--anchor-mm', 2 * 45.0 / 1.115))
    scale = W / anchor
    print(f'== plan read: panel {panel}, analysed {Ww}x{Hh} px; walled interior rows {ys[0]}..{ys[-1]}; cover top corners at row {yc} (near-white over {cf:.2f} of the span there)')
    print(f'scale anchor: span between the walls at row {y0} = {W} px = the cover top edge {anchor:.1f} mm -> {scale:.3f} px/mm at that depth (the far end of the wall is farther from the camera, so runs converted at this scale are LOWER BOUNDS)')
    # CAVEAT (R1-FIX9): what the span on row y0 actually flanks, and how wide the near-white below
    # the corners (the cover's face, where the cover is visible) really is — measured, not assumed
    cf0 = cream[y0, xl[y0]:xr[y0] + 1].mean() if xr[y0] > xl[y0] else 0
    cover_w = (0, None)
    for yy in range(yc + 1, Hh):
        row = cream[yy]; x = 0
        while x < Ww:
            if row[x]:
                x0 = x
                while x < Ww and row[x]: x += 1
                if x - x0 > cover_w[0]: cover_w = (x - x0, yy)
            else: x += 1
    print(f'CAVEAT: the {W} px span on row {y0} is the span between the two wall FEET on that row, near-white over {cf0:.2f} of it (on evidence 05 that near-white is the WHITE BAG); it is NOT a measured cover top edge — the widest near-white run below the corners is {cover_w[0]} px (row {cover_w[1]}). "the cover top edge" above is the anchor\'s NAME, not a finding: {anchor:.1f} mm is an UNCALIBRATED candidate (80.7 = 2 x 45 / 1.115 is unsupported by this span; 92 = the bay is a candidate), so every mm below is px / candidate scale. Rows the bag hides are not read.')
    depth = yc - ys[0]
    for side, X, d in (('left', xl, -1), ('right', xr, +1)):
        # the straight wall: a line fitted to the boundary in the band 60..80 % of the way
        # from the arc apex to the cover (above the white bag, below the jaw), extended UP
        # while the boundary stays within 3 px (the jaw curve ends it) and DOWN to the cover
        # corners unless the boundary moves OUTWARD from the line by > 3 px (the bag can
        # occlude the foot from the inside; nothing can stand outside the wall)
        # (the band sits at 60..80 % of the way from the apex: above it the boundary is still the
        # jaw arc's tail — a first band at 35..60 % fitted the arc and read the wall as 18 mm)
        band = [y for y in range(ys[0] + int(0.60 * depth), ys[0] + int(0.80 * depth)) if y in X]
        A = np.polyfit(band, [X[y] for y in band], 1)
        y = band[0]; miss = 0; ytop = band[0]
        while (y - 1) in X:
            y -= 1
            if abs(X[y] - np.polyval(A, y)) <= 3: miss = 0; ytop = y
            else:
                miss += 1
                if miss >= 3: break
        y = band[-1]; ybot = band[-1]; gap = 0
        while y + 1 <= yc and gap <= 12:
            y += 1
            if y not in X: gap += 1; continue     # the bag can hide the foot for a few rows
            gap = 0
            out = d * (X[y] - np.polyval(A, y))   # > 0 = outward (away from the centre)
            if out > 3: break
            ybot = y
        n = ybot - ytop
        face = np.array([green[yy, min(Ww - 1, max(0, int(round(np.polyval(A, yy))) + d * 8))] for yy in range(ytop, ybot + 1)])
        print(f'  {side} wall: straight foot line rows {ytop}..{ybot} = {n} px = {n / scale:.1f} mm at the corner-row scale (a LOWER BOUND: the jaw end is farther from the camera); slope {A[0]:+.3f} px/row; reaches the cover corners: {"yes" if ybot >= yc - 8 else "no (" + str(yc - ybot) + " rows short)"}')
        print(f'    cloth on the wall face 8 px outside the foot line over the run: green fraction {face.mean():.2f}; run / interior plan depth (apex->cover {depth} px) = {n / depth:.2f}; run / corner span = {n / W:.2f}')
    # interior depth from the cover top to the arc apex (inboard)
    print(f'interior: from the cover top edge (row {yc}) up to the arc apex (row {ys[0]}) = {yc - ys[0]} px = {(yc - ys[0]) / scale:.1f} mm in plan')
    dbg = arg('--debug')
    if dbg:
        out = a.copy()
        for y in ys: out[y, xl[y]] = (255, 0, 0); out[y, xr[y]] = (255, 0, 0)
        out[yc, :] = (0, 0, 255); out[y0, :] = (255, 255, 0)
        Image.fromarray(out).save(dbg); print('debug ->', dbg)


if __name__ == '__main__':
    main()
