#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""census_488d.py — GH-488D wave A5 pixel census on the SEALED bytes.

Three jobs the reused judge (orbitsweep-judge.py) cannot do for this lane:

1. PRODUCE THE CARD/ANCHOR SIGNATURE FIXTURE. judge_encoded_489 loads
   `fixtures/encoded-cards-489-signature.json` relative to its own
   __file__ and compares every title plate and three pinned track frames
   per orbit against it. The fixture is 489's Star-XW101 artwork; the
   Diamond plates are different images, so the Diamond fixture has to be
   measured off this lane's own sealed bytes. Measured-then-pinned is the
   489 law (a conscious re-cut regenerates the fixture); it is only sound
   because the red-arm then proves each pinned bar still fires.

2. RESTATE THE CLOTH-FAMILY BARS ON BLUE. The judge's cloth predicate is
   hardcoded GREEN (`g > r+30 & g > b+30 & g > 60`). The Diamond Pro-Am
   ships Tournament Blue (web/scene/table.js:394), which makes
   `enc_*_scene_floor` a floor the delivery can never clear and makes
   `enc_*_dclip_*` census an EMPTY mask — a bar that reports PASS while
   measuring nothing. Both families are disarmed in the cfg and restated
   here on the blue axis, mirroring the judge's own predicate structure:
     bed        = b > r+30 & b > g+30 & b > 60      (cloth mask)
     bed scene  = b > r   & b > g   & b > 40        (blank-encode floor)
     bed clip   = max(RGB) >= 254 within 6 px of bed
   The clip census is ANY-channel, not green-only: on a blue bed the
   thing being guarded against is a clipped element sitting on the cloth,
   whatever colour it clips to. That is strictly stronger than the row it
   replaces, which is the only honest direction to move a disarmed bar.

3. RESTATE THE RECURRENCE BAR ON A TWO-FOLD SYMMETRIC SUBJECT. The
   judge's full-history census assumes a 360 orbit never revisits a
   bearing. A pool table looks the same from opposite bearings, so the
   fulltable orbit revisits every one of them half a turn later and the
   bar saturates (161/595, every hit at offset exactly run/2). See
   recur_offband for the measurement, the red-arm evidence that the
   saturated bar both false-fires and misses, and why the exclusion band
   is derived from the declared pose law rather than fitted.

Nothing here re-implements a judge bar that still works on this lane. The
17 orbit rows and 20 pocketing rows the judge computes are computed by
the judge, on the same bytes, in the same run.

Usage:
  census_488d.py --manifest PACK/manifest-488d.json --out PACK/census.json
                 --fixture PACK/judgedir/fixtures/<name>.json
"""
import argparse
import json
import subprocess
import sys

import numpy as np
from scipy import ndimage

W, H = 1600, 1000
ST8 = np.ones((3, 3), bool)
# half-width of the excluded half-turn band, in poses. Reuses the judge's own
# proximity constant (it skips the 4 nearest prior frames); see recur_offband.
RECUR_BAND = 4


def frames(path, w=W, h=H):
    """Decode the SHIPPED bytes. Same pipe the judge uses (rawvideo rgb24,
    -map 0:v:0) so the samples censused here are the samples judged."""
    p = subprocess.Popen(
        ['ffmpeg', '-loglevel', 'error', '-i', path, '-map', '0:v:0',
         '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
        stdout=subprocess.PIPE)
    n = w * h * 3
    i = 0
    while True:
        buf = p.stdout.read(n)
        if len(buf) < n:
            break
        yield i, np.frombuffer(buf, np.uint8).reshape(h, w, 3)
        i += 1
    p.stdout.close()
    p.wait()
    if p.returncode not in (0, None):
        sys.exit(f'census_488d: decoder exit {p.returncode} on {path}')


def grid_of(f16):
    """16x10 average-luma signature. Byte-identical arithmetic to
    orbitsweep-judge.py:1950-1953 — a different rounding path here would
    make every pinned value wrong by construction."""
    lum = (f16[:, :, 0] * 0.2126 + f16[:, :, 1] * 0.7152
           + f16[:, :, 2] * 0.0722).astype(np.float32)
    return lum.reshape(10, 100, 16, 100).mean(axis=(1, 3))


def text_census(fr):
    lum = (fr[:, :, 0] * 0.2126 + fr[:, :, 1] * 0.7152
           + fr[:, :, 2] * 0.0722)
    return int((lum >= 128).sum())


def frame_alive(fr):
    """Colour-agnostic per-frame liveness: (max channel value, mean).

    Every other census in this file asks a question about the CLOTH, so
    every one of them is blind to a frame that has no scene in it at all.
    That blindness is not hypothetical — the first sealed fulltable orbit
    shipped 7 consecutive frames (471-477) in which the camera had passed
    behind a wall prop and the frame held nothing but the prop's unlit
    back face, and all 52 judge bars plus all 15 restatement bars passed
    it. The judge's own blank-encode guard (`enc_*_scene_floor`) would
    have caught it, but it is one of the bars the GREEN cloth predicate
    disarms on this lane, so the guard was gone exactly where it was
    needed. This restores it on an axis no grading decision can move.
    """
    return int(fr.max()), float(fr.mean())


def recur_offband(hist, run, band):
    """Full-history recurrence census with the LAWFUL half-turn EXCLUDED.

    THE JUDGE'S PREMISE IS FALSE ON THIS SUBJECT. `enc_{orb}_recur_frac`
    (judge:2163-2173) compares every body frame against all prior body
    frames beyond the 4 nearest and calls a 16x-decimated MAD < 1.0 a
    revisited bearing, on the stated ground that "a 360 orbit never
    revisits a bearing (measured shipped 0/595)". A pool table is
    TWO-FOLD ROTATIONALLY SYMMETRIC, so a full-table orbit revisits every
    bearing exactly once, half a turn later, and the picture really is
    the same picture. Measured on the sealed fulltable orbit: 161 of 595
    body frames recurrent, and the best match is at offset EXACTLY 300 --
    run/2 -- for all 161 of them, with a sharply peaked, symmetric MAD dip
    (297:1.828  298:1.502  299:1.176  300:0.806  301:1.209  302:1.612).
    The corner orbit, whose subject is one pocket and has no such
    symmetry, reads 0/445 on the identical census with a min-MAD floor of
    3.119. Same instrument, same rig, same run: the difference is the
    subject, which is what makes this a property and not a defect.

    Pinning the judge bar off that measurement produced a window
    (recur_frac_max 0.2806 = 0.2706 + 0.01) sitting one dup-margin above
    a statistic whose own direction-noise is larger than the margin. The
    red-arm caught both halves of the consequence: a benign whole-body
    REVERSAL moved it to 0.2807 and leaked (+0.0001 over), while a real
    102-frame period-34 loop moved it only to 0.2739 and was MISSED. A
    bar that fires on a non-defect and sleeps through the defect it
    exists for is worse than no bar; it is disarmed and restated here.

    The exclusion is DERIVED, not fitted. The half-turn offset is run/2
    straight out of the declared pose law (`az_deg = -90 + 360*v/run`) --
    no pixel measurement enters it. The half-width reuses the judge's own
    proximity constant (its 4 nearest), and the verdict is insensitive to
    that choice: sweeping the half-width over 2,4,6,8,12,16,24,32 gives
    frac 0.0000 and floor 1.315 at every value. The one other lawful
    recurrence -- the orbit closing on itself at offset 599 -- needs no
    exclusion because it measures 1.315, clear of the 1.0 threshold on
    its own.

    Returns (judge_frac, offband_frac, n, floor_mad, floor_off, inband).
    """
    half = run // 2
    rec = off = n = inband = 0
    floor = (1e9, None)
    # one contiguous buffer, sliced as a VIEW per frame — the judge does the
    # same (judge:2163-2165); re-stacking the list each frame would copy ~22 MB
    # per body frame on this clip for no gain
    hist = np.stack(hist)
    for k in range(5, len(hist)):
        prior = hist[:k - 4]
        offs = k - np.arange(k - 4)
        mad = np.abs(prior - hist[k]).mean(axis=1)
        n += 1
        if float(mad.min()) < 1.0:
            rec += 1
        keep = ~((offs >= half - band) & (offs <= half + band))
        if not keep.any():
            continue
        j = int(mad[keep].argmin())
        m = float(mad[keep][j])
        if m < floor[0]:
            floor = (round(m, 4), int(offs[keep][j]))
        if m < 1.0:
            off += 1
        else:
            inband += 1 if float(mad.min()) < 1.0 else 0
    return (round(rec / n, 4) if n else 1.0,
            round(off / n, 4) if n else 1.0, n, floor[0], floor[1], inband)


def bed_stats(fr):
    r = fr[:, :, 0].astype(np.int16)
    g = fr[:, :, 1].astype(np.int16)
    b = fr[:, :, 2].astype(np.int16)
    bed = (b > r + 30) & (b > g + 30) & (b > 60)
    scene = float(((b > r) & (b > g) & (b > 40)).mean())
    dil = ndimage.binary_dilation(bed, structure=ST8, iterations=6)
    clip = (fr.max(axis=2).astype(np.int16) >= 254) & dil
    tot = int(clip.sum())
    mc = 0
    if tot:
        lab, n = ndimage.label(clip, structure=ST8)
        if n:
            mc = int(np.bincount(lab.ravel())[1:].max())
    return scene, tot, mc


def scan(path, cards, anchors, body, run=None, band=RECUR_BAND):
    """One decode pass per clip: card grids + text, track-anchor grids,
    the blue-bed restatement family, and the raw R>=254 sequence used to
    AUTHOR the pocketing event windows (the judge reports only per-window
    peaks, so the sequence has to be measured to place the windows)."""
    out = {'card_grids': {}, 'card_text': {}, 'anchor_grids': {},
           'bed_scene_min': [1.0, None], 'bed_clip_total': [0, None],
           'bed_clip_comp': [0, None], 'rclip': [], 'rdom': [],
           'frame_max_min': [10 ** 9, None], 'frame_mean_min': [1e9, None]}
    anchor_set = set(anchors)
    dec_hist = []
    for i, fr in frames(path):
        ci = next((k for k, (a, b) in enumerate(cards) if a <= i <= b), None)
        if ci is not None:
            t = text_census(fr)
            lo, hi = out['card_text'].get(str(ci), [10 ** 9, 0])
            out['card_text'][str(ci)] = [min(lo, t), max(hi, t)]
            if str(ci) not in out['card_grids']:
                out['card_grids'][str(ci)] = \
                    grid_of(fr.astype(np.int16)).tolist()
            continue
        # [video_index, count] pairs, NOT a bare sequence: the pocketing clip
        # interleaves cards with body, so a positionally-indexed list would
        # silently misplace every event window it is used to author.
        # rclip is the judge's own R>=254 predicate (used to AUTHOR the
        # redface windows it then measures). rdom is the same physical
        # quantity WITHOUT the clipping requirement — the red object ball's
        # lit area. 489's red ball clipped; whether this delivery's does is
        # an empirical question, and if it does not, the whole enc_pk_redface
        # family is structurally dead here and must be DISCLOSED as a
        # ceiling and restated on rdom, never armed vacuously.
        out['rclip'].append([i, int((fr[:, :, 0] >= 254).sum())])
        r_ = fr[:, :, 0].astype(np.int16)
        g_ = fr[:, :, 1].astype(np.int16)
        b_ = fr[:, :, 2].astype(np.int16)
        out['rdom'].append(
            [i, int(((r_ > g_ + 40) & (r_ > b_ + 40) & (r_ > 90)).sum())])
        if i in anchor_set:
            out['anchor_grids'][str(i)] = \
                grid_of(fr.astype(np.int16)).tolist()
        fmax, fmean = frame_alive(fr)
        if fmax < out['frame_max_min'][0]:
            out['frame_max_min'] = [fmax, i]
        if fmean < out['frame_mean_min'][0]:
            out['frame_mean_min'] = [round(fmean, 4), i]
        if run and body and body[0] <= i <= body[1]:
            # same decimation the judge's recurrence census uses, so the
            # judge_frac this file reports is comparable frame for frame
            dec_hist.append(fr[::16, ::16, :].astype(np.float32).ravel())
        sc, bt, bc = bed_stats(fr)
        if sc < out['bed_scene_min'][0]:
            out['bed_scene_min'] = [round(sc, 5), i]
        if bt > out['bed_clip_total'][0]:
            out['bed_clip_total'] = [bt, i]
        if bc > out['bed_clip_comp'][0]:
            out['bed_clip_comp'] = [bc, i]
    if body:
        # keep the orbit sequence inside the declared body: hold frames are
        # a duplicate of the last track frame and would otherwise weight the
        # peak search toward a single repeated bearing
        a, b = body
        out['rclip'] = [p for p in out['rclip'] if a <= p[0] <= b]
        out['rdom'] = [p for p in out['rdom'] if a <= p[0] <= b]
    if dec_hist:
        jf, of, n, fl, fo, ib = recur_offband(dec_hist, run, band)
        out['recur'] = {'run': run, 'half_turn': run // 2, 'band': band,
                        'n': n, 'judge_frac': jf, 'offband_frac': of,
                        'offband_floor': [fl, fo], 'inband_only': ib}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--manifest', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--fixture', required=True)
    # FIX2 (review round 2 on #731): option presence is not option value — a blank or trailing path flag and a missing input path exit 2 by name
    ap.allow_abbrev = False  # FIX2: no prefix matching — `--ou=` must not reach argparse as --out=''
    # FIX3 (review round 3 on #731 P2 (a)): the prior verdict artefact(s) are invalidated BEFORE any guard can refuse
    # FIX10 (review round 10 on #731): ONE parse to completion first, then the value guard, then the prior census at the PARSED --out is
    # the first effect (--fixture is the judge's pinned signature, not a verdict: left alone), then the input-existence guard
    import os as _os, sys as _sys; _sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "lib")); from argpaths import guard_values_of as _guard_values_of, guard_exists as _guard_exists, invalidate_dest as _invalidate_dest
    a = ap.parse_args()
    _guard_values_of(ap, tag='census_488d.py')
    _invalidate_dest(a.out, None, tag='census_488d.py')
    _guard_exists({'--manifest': 'file'}, tag='census_488d.py')
    man = json.load(open(a.manifest))
    res = {}
    fixture = {'cards': {}, 'track_anchors': {},
               'note': ('GH-488D wave A5 Diamond Pro-Am signature. Basename '
                        'is the 489 one because orbitsweep-judge.py resolves '
                        'it relative to its own __file__; the driver stages a '
                        'symlink to the UNMODIFIED judge beside this file so '
                        'the judge source runs byte-for-byte verbatim. See '
                        'SPIKE-REPORT.md and ledger row O36.')}
    for clip, spec in man['clips'].items():
        cards = [tuple(c) for c in spec['card_segs']]
        anchors = spec.get('track_anchors', [])
        res[clip] = scan(spec['mp4'], cards, anchors, spec.get('body'),
                         (spec.get('geometry') or {}).get('run'))
        keys = sorted(res[clip]['card_grids'], key=int)
        fixture['cards'][clip] = [res[clip]['card_grids'][k] for k in keys]
        if anchors:
            fixture['track_anchors'][clip] = {
                'frames': list(anchors),
                'grids': [res[clip]['anchor_grids'][str(i)] for i in anchors],
            }
        print(f'[census] {clip}: cards {keys} '
              f"text {res[clip]['card_text']} "
              f"bed_scene_min {res[clip]['bed_scene_min']} "
              f"bed_clip {res[clip]['bed_clip_total']}/"
              f"{res[clip]['bed_clip_comp']} "
              f"frame_min max {res[clip]['frame_max_min']} "
              f"mean {res[clip]['frame_mean_min']}"
              + (f" recur judge {res[clip]['recur']['judge_frac']}"
                 f" offband {res[clip]['recur']['offband_frac']}"
                 f" floor {res[clip]['recur']['offband_floor']}"
                 if 'recur' in res[clip] else ''))
    json.dump(res, open(a.out, 'w'), indent=1)
    json.dump(fixture, open(a.fixture, 'w'), indent=1)
    print(f'[census] -> {a.out} + {a.fixture}')


if __name__ == '__main__':
    main()
