#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""liveness_488d.py — GH-488D wave A5 blank-frame gate on the RENDER plane.

The pack is gated on three planes and this is the first of them. It reads
the assembled PNG sequence BEFORE the encoder runs, so a frame with no
scene in it can never reach the shipped bytes at all; census_488d.py then
restates the same statistic on the decoded h264 (`d_*_frame_alive`), so
the delivered bytes carry the claim rather than merely inheriting it.

WHY THIS EXISTS. The first sealed fulltable orbit contained 7 consecutive
blank frames (471-477): at that arc the orbit camera passed BEHIND
`obScorePlaque`, a 0.72 x 0.50 m wall prop mounted on the -z wall, and
the prop's unlit back face filled the frame from 15 mm away. Every one of
the 52 judge bars and all 15 restatement bars passed those frames. The
one bar that would have caught it, the judge's blank-encode floor
`enc_*_scene_floor`, is disarmed on this lane because its predicate is
hardcoded to GREEN cloth and the Diamond ships Tournament Blue. A
disarmed guard is only honest if what it guarded is guarded again
somewhere else; this file is that somewhere else.

THE FLOORS ARE NOT FITTED. The statistic is bimodal by more than a
decade, so the threshold does not need fitting and must not be fitted --
fitting a floor to a delivery is precisely how the vacuous
`d_fulltable_bed_floor` (pinned at `>= 0` off the defective take) came to
exist. Measured over every body frame of the sealed pack (1284 frames,
all three clips), against the 7 blank frames of the withdrawn take:

    clip        dimmest frame by max      dimmest frame by mean
    pocketing   249 @82                   56.61 @204
    fulltable   233 @67                   17.00 @497
    corner      192 @478                  33.46 @110
    ---------------------------------------------------------------
    legitimate  min  192                  min  17.00
    the blanks  max   11                  max   1.37

The floors sit in the empty band between: max >= 64 (5.8x above the
brightest blank, 3.0x below the dimmest legitimate frame) and mean >= 4.0
(2.9x above, 4.25x below). Any threshold in that band gives the same
verdict, which is the property a physical constant should have and a
fitted one never does. They are absolute constants, not functions of the
take, so a re-grade cannot walk them and an obstruction cannot slip
under them.

(An earlier draft of this docstring quoted the legitimate band as max
241-245 / mean 17.0-19.5. That was measured only on the fulltable frames
either side of the defect, and the full-pack sweep put the true minima at
192 and 17.00 -- the corner orbit runs dimmer than the neighbourhood I
had sampled. The floors are unchanged because they were never derived
from that band, which is the whole argument for not fitting them; but a
stated measurement that is narrower than the measurement is still a
wrong statement, so it is corrected rather than quietly widened.)

WHAT THIS GATE DOES NOT CATCH. It catches frames with no scene in them.
It does NOT catch the partial occlusion at frames 479-483 of the
withdrawn take, where the same prop covered between 23% and 0.3% of the
frame from the left edge: those are bright, live frames and no unfitted
floor can reject them. The gate that owns the whole event is the
clearance refusal at the camera (orbitsweep-488d.mjs, ORBIT_CLEAR_MIN);
this one is a backstop for the case where geometry is not the cause.

Card plates are excluded by construction: the caller passes the BODY
ranges only. A title plate is dark by design and its floors are a
different question, already answered by the card-signature bars.

Usage:
  liveness_488d.py --dir SEQDIR --ranges '[[60,659]]' --out live.json
                   [--max-min 64] [--mean-min 4.0]
Exit: 0 alive - 3 at least one frame below a floor (frames listed).
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

MAX_MIN = 64
MEAN_MIN = 4.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', required=True)
    ap.add_argument('--ranges', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--max-min', type=int, default=MAX_MIN)
    ap.add_argument('--mean-min', type=float, default=MEAN_MIN)
    # FIX2 (review round 2 on #731): option presence is not option value — a blank or trailing path flag and a missing input path exit 2 by name
    ap.allow_abbrev = False  # FIX2: no prefix matching — `--ou=` must not reach argparse as --out=''
    # FIX3 (review round 3 on #731 P2 (a)): the prior verdict at --out is removed BEFORE any guard can refuse (refuter pass 3)
    # FIX10 (review round 10 on #731): ONE parse to completion first, then the value guard, then the prior verdict at the PARSED --out, then the input guard
    import os as _os, sys as _sys; _sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "lib")); from argpaths import guard_values_of as _guard_values_of, guard_exists as _guard_exists, invalidate_dest as _invalidate_dest
    a = ap.parse_args()
    _guard_values_of(ap, tag='liveness_488d.py')
    _invalidate_dest(a.out, None, tag='liveness_488d.py')
    _guard_exists({'--dir': 'dir'}, tag='liveness_488d.py')
    ranges = [tuple(r) for r in json.loads(a.ranges)]

    rows = []
    dead = []
    for lo, hi in ranges:
        for i in range(lo, hi + 1):
            p = os.path.join(a.dir, f't{i:04d}.png')
            if not os.path.exists(p):
                sys.exit(f'liveness_488d: missing frame {p}')
            fr = np.asarray(Image.open(p).convert('RGB'))
            fmax, fmean = int(fr.max()), float(fr.mean())
            rows.append([i, fmax, round(fmean, 4)])
            if fmax < a.max_min or fmean < a.mean_min:
                dead.append([i, fmax, round(fmean, 4)])

    mx = min(rows, key=lambda r: r[1])
    mn = min(rows, key=lambda r: r[2])
    out = {
        'dir': a.dir, 'ranges': [list(r) for r in ranges], 'n': len(rows),
        'floors': {'max_min': a.max_min, 'mean_min': a.mean_min},
        'frame_max_min': [mx[1], mx[0]], 'frame_mean_min': [mn[2], mn[0]],
        'dead': dead,
    }
    json.dump(out, open(a.out, 'w'), indent=1)
    print(f'[live] {a.dir}: {len(rows)} body frames, '
          f'min max {mx[1]} @{mx[0]}, min mean {mn[2]} @{mn[0]}, '
          f'floors {a.max_min}/{a.mean_min}')
    if dead:
        print(f'[live] DEAD FRAMES ({len(dead)}): {dead[:16]}', file=sys.stderr)
        sys.exit(3)


if __name__ == '__main__':
    main()
