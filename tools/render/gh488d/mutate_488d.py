#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""mutate_488d.py — GH-488D wave A5 red-arm PIXEL corruptions.

The red-arm proves every pinned window still FIRES. Most attacks are
file-level (reorder, freeze, reverse, truncate) and the driver does those
in JS by permuting the frame sequence. Four attacks need pixels changed,
and they live here so the corruption is deterministic and inspectable
rather than hidden inside a one-off shell pipeline:

  black    IN OUT       replace the frame with #000000 (dead title card)
  patch    IN OUT       paint a clipped WHITE square ON the cloth. THE
                        restatement proof: orbitsweep-judge.py's
                        cloth-adjacent clip census masks on GREEN cloth,
                        so on this blue table it cannot see this at all,
                        while the restated blue-axis census must.
  desat    IN OUT       drive the cloth off blue-dominance without
                        touching anything else — the blank-encode /
                        renderer-collapse signature the disarmed
                        enc_*_scene_floor was supposed to own.
  redpatch IN OUT       paint a saturated R>=254 block far from the
                        cloth (>= CLEAR_PX from any bed pixel, so it
                        cannot leak into the restated clip census) —
                        the redface-outside attack.

Every op locates its target from the frame itself, so nothing is pinned
to a hand-measured pixel coordinate that a re-render would invalidate.
Exit 3 means the frame cannot host the requested corruption (e.g. no
cloth-free region); the driver reports that as a skipped case rather
than silently producing a weaker attack.
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

PATCH = 40        # square side, px
CLEAR_PX = 48     # redpatch keeps at least this far from any bed pixel


def bed_mask(a):
    r = a[:, :, 0].astype(np.int16)
    g = a[:, :, 1].astype(np.int16)
    b = a[:, :, 2].astype(np.int16)
    return (b > r + 30) & (b > g + 30) & (b > 60)


def main():
    if len(sys.argv) != 4:
        raise SystemExit('usage: mutate_488d.py'
                         ' {black|blank|patch|desat|redpatch} IN OUT')
    op, src, dst = sys.argv[1:]
    a = np.array(Image.open(src).convert('RGB'))
    h, w = a.shape[:2]

    if op == 'black':
        a[:] = 0

    elif op == 'patch':
        bed = bed_mask(a)
        if not bed.any():
            raise SystemExit(3)
        ys, xs = np.where(bed)
        # median of the cloth mask, then snapped onto an actual cloth pixel:
        # the median of a U-shaped mask can land off it
        cy, cx = int(np.median(ys)), int(np.median(xs))
        if not bed[cy, cx]:
            d = (ys - cy) ** 2 + (xs - cx) ** 2
            k = int(np.argmin(d))
            cy, cx = int(ys[k]), int(xs[k])
        y0 = max(0, min(h - PATCH, cy - PATCH // 2))
        x0 = max(0, min(w - PATCH, cx - PATCH // 2))
        a[y0:y0 + PATCH, x0:x0 + PATCH] = 255

    elif op == 'desat':
        bed = bed_mask(a)
        if not bed.any():
            raise SystemExit(3)
        r = a[:, :, 0].astype(np.int16)
        g = a[:, :, 1].astype(np.int16)
        # b := max(r, g) - 1 on cloth only: the restated floor predicate
        # (b > r & b > g) goes false on exactly the cloth, and no other
        # census in either instrument reads a different channel there
        nb = np.maximum(r, g) - 1
        b = a[:, :, 2].astype(np.int16)
        a[:, :, 2] = np.where(bed, np.clip(nb, 0, 255), b).astype(np.uint8)

    elif op == 'redpatch':
        bed = bed_mask(a)
        far = ~ndimage.binary_dilation(
            bed, structure=np.ones((3, 3), bool), iterations=CLEAR_PX)
        # the patch must fit entirely inside the cloth-free region
        ok = ndimage.binary_erosion(
            far, structure=np.ones((PATCH, PATCH), bool))
        ys, xs = np.where(ok)
        if not len(ys):
            raise SystemExit(3)
        k = int(np.lexsort((xs, ys))[0])          # topmost, then leftmost
        cy, cx = int(ys[k]), int(xs[k])
        y0 = max(0, min(h - PATCH, cy - PATCH // 2))
        x0 = max(0, min(w - PATCH, cx - PATCH // 2))
        a[y0:y0 + PATCH, x0:x0 + PATCH] = (255, 20, 20)

    elif op == 'blank':
        # Reproduce the ACTUAL defect rather than invent one. When the orbit
        # camera passed behind obScorePlaque the frame was not zeroed -- it
        # held the prop's unlit back face: a real, smoothly shaded, non-
        # constant image measuring max 5-11 and mean 1.16-1.37 against 241-245
        # and 17.0-19.5 for its neighbours. `black` (a[:] = 0) is a weaker
        # attack because a constant frame also trips the duplicate and hold
        # families; this one trips ONLY the liveness floors, which is what a
        # bar aimed at blank frames has to be able to catch on its own.
        # Scale factor 1/15.6 puts a 245/17.2 frame at 15/1.10 -- inside the
        # measured defect band, still below both floors, still a gradient.
        a[:] = (a.astype(np.float32) / 15.6).astype(np.uint8)

    else:
        raise SystemExit(f'mutate_488d: unknown op {op}')

    Image.fromarray(a).save(dst)


if __name__ == '__main__':
    main()
