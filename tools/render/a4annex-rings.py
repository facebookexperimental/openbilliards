#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""a4annex-rings.py — the annotated render-vs-photo pair for the A4 annex.

Wave A5's disclosure says the wave M/N pocket-interior rebuild "must be
accepted on the A4 solved-pose crops": at 8 bits the delivered wide orbit does
not carry the information, so the acceptance surface is the solved-pose crop,
not the video. Wave A5-R3 item 1 makes that surface a PACK FILE instead of a
scratch file, which means it has to be reproducible and byte-bound like every
other claim in the pack.

HOW THE TWO IMAGES ARE PUT ON A COMMON FOOTING. The only feature both images
resolve unambiguously is the countersunk VENT BORE — a through-hole, so it is
near-black in both regardless of exposure. The detector takes the largest
connected component of `Y <= BORE_Y` inside a seed box, in ABSOLUTE luminance:

  BORE_Y is not a tuned threshold, it is a PLATEAU. Sweeping the level over a
  decade (0.0005 .. 0.008) moves the render bore radius 17.0 -> 17.7 px and the
  photo bore radius 75.4 -> 79.9 px; both answers are flat to a few percent
  across the range, so the result is a property of the images and not of the
  number. The tool re-measures that plateau on every run and writes it to the
  sidecar, so a future image that does NOT have a plateau shows up as one.

An earlier version of this tool thresholded on a PERCENTILE of the seed box
instead. That failed: the photograph resolves the plug's surface speckle and
the render does not, so the same percentile picked a 2.6 px speck of texture in
the photograph and the true bore in the render. Recorded here because the
failure is the reason the rule is absolute rather than relative.

Both frames are then rescaled to a common bore radius and cropped to the same
number of BORE RADII about the bore centre. Both cameras stand at the same
62.2 deg elevation (the A4 solve put the render register on the photograph's
viewpoint), so the bore is foreshortened identically in the two images and the
normalisation carries no pose error.

WHAT THE RINGS ARE, AND WHAT THEY ARE NOT. They are LOCATORS: they mark the
bore and a fixed 6x-bore circle so the eye lands on the same place in both
frames. They are NOT a measurement. The photograph is oblique (~62.2 deg
elevation), and the A4 fence forbids aiming a plug-centred plan-view radial
instrument at it; a circle drawn on it would be measuring an ellipse. So no
radius in this pair is read back as a dimension -- the only numbers claimed are
the bore radii, which are what the normalisation itself is built from.

The photograph is dossier reference material: reference-use-only, pinned by
sha256, read from Drive and never copied into the repo.

Layer: render-only (an evidence renderer; touches no scene code).

  python3 tools/render/a4annex-rings.py --render F --photo F --out DIR
"""
import argparse
import hashlib
import json
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

# Seed boxes for the bore search, in each image's own pixels. They only have to
# CONTAIN the bore; the detector finds it. (y0, y1, x0, x1)
RENDER_SEED = (480, 600, 560, 660)     # 1215x972 frame at the a4-out register
PHOTO_SEED = (2600, 2950, 2350, 2700)  # 4865x3893 official-pocket-cushion-closeup

BORE_Y = 0.002        # absolute linear luminance; sits mid-plateau (see above)
PLATEAU = (0.0005, 0.001, 0.002, 0.004, 0.008)
# The two sides' plateaux do not have the same ENDS: at 0.008 the render floods
# out of the bore into the plug face (r 17.7 -> 38.8), and at 0.0005 the
# photograph's bore has not yet closed into one component (r 6.3). Only the
# common interior is flat on both, so the spread is quoted over that band and
# the full sweep is kept in the sidecar so both breakdowns stay visible.
PLATEAU_BAND = (0.001, 0.002, 0.004)
BORE_PX = 46.0        # bore radius both frames are rescaled to
CROP_BORE_RADII = 10.0  # half-width of the delivered crop, in bore radii
OUT_PX = int(round(2 * CROP_BORE_RADII * BORE_PX))  # 920


def luminance(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float64) / 255.0
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    return 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]


def blob(sub, level):
    """Largest connected component of `sub <= level`, or None."""
    m = sub <= level
    if not m.any():
        return None
    lab, n = ndimage.label(m)
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    return lab == (int(np.argmax(sizes)) + 1)


def find_bore(y, seed, name):
    y0, y1, x0, x1 = seed
    sub = y[y0:y1, x0:x1]
    # the plateau sweep IS the evidence that BORE_Y is not fitted
    sweep = []
    for lv in PLATEAU:
        k = blob(sub, lv)
        sweep.append(None if k is None else
                     dict(level=lv, r_px=float(np.sqrt(k.sum() / np.pi))))
    k = blob(sub, BORE_Y)
    if k is None:
        raise SystemExit('%s: no bore under Y<=%.4f — seed box wrong?' % (name, BORE_Y))
    ys, xs = np.nonzero(k)
    r = float(np.sqrt(k.sum() / np.pi))
    per = (k ^ ndimage.binary_erosion(k)).sum()
    f = dict(bore_x=float(xs.mean() + x0), bore_y=float(ys.mean() + y0),
             bore_r_px=r, circularity=float(4 * np.pi * k.sum() / max(per ** 2, 1)),
             plateau=[s for s in sweep if s])
    rs = [s['r_px'] for s in f['plateau'] if s['level'] in PLATEAU_BAND]
    f['plateau_band'] = list(PLATEAU_BAND)
    f['plateau_spread_in_band'] = (max(rs) - min(rs)) / min(rs) if rs else None
    print('%-7s bore (%.1f, %.1f) r=%.1f px circ=%.2f  sweep %s'
          % (name, f['bore_x'], f['bore_y'], r, f['circularity'],
             ' '.join('%.1f' % s['r_px'] for s in f['plateau'])))
    return f


def annotate(path, f, out_path, label):
    """Rescale to a common bore radius, crop CROP_BORE_RADII about it, mark it."""
    im = Image.open(path).convert('RGB')
    s = BORE_PX / f['bore_r_px']
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))),
                   Image.LANCZOS)
    cx, cy = f['bore_x'] * s, f['bore_y'] * s
    half = OUT_PX / 2
    # pad rather than clamp: a clamped crop would silently decentre the bore
    # and break the very correspondence this pair exists to show.
    pad = int(max(0, half - min(cx, cy), (cx + half) - im.width,
                  (cy + half) - im.height)) + 2
    if pad > 2:
        bg = Image.new('RGB', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0))
        bg.paste(im, (pad, pad))
        im, cx, cy = bg, cx + pad, cy + pad
    im = im.crop((round(cx - half), round(cy - half),
                  round(cx - half) + OUT_PX, round(cy - half) + OUT_PX))
    d = ImageDraw.Draw(im)
    c = OUT_PX / 2
    for mult, col in ((1.0, (255, 64, 64)), (6.0, (64, 255, 128))):
        r = BORE_PX * mult
        d.ellipse([c - r, c - r, c + r, c + r], outline=col, width=2)
    d.line([c - 9, c, c + 9, c], fill=(255, 255, 0), width=1)
    d.line([c, c - 9, c, c + 9], fill=(255, 255, 0), width=1)
    d.text((10, 10), label, fill=(235, 235, 235))
    d.text((10, OUT_PX - 18), 'rings are LOCATORS at 1x / 6x bore radius — not a measurement',
           fill=(170, 170, 170))
    im.save(out_path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--render', required=True)
    ap.add_argument('--photo', required=True)
    ap.add_argument('--out', required=True)
    # FIX2 (review round 2 on #731): option presence is not option value — a blank or trailing path flag and a missing input path exit 2 by name
    ap.allow_abbrev = False  # FIX2: no prefix matching — `--ou=` must not reach argparse as --out=''
    import os as _os, sys as _sys; _sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "lib")); from argpaths import guard_paths as _guard_paths
    a = ap.parse_args()
    _guard_paths({'--render': 'file', '--photo': 'file', '--out': 'out'}, tag='a4annex-rings.py')  # FIX10 (Fable pass 2): after the parse — help exits 0 first; the guard is a post-parse value + existence check
    os.makedirs(a.out, exist_ok=True)
    fr = find_bore(luminance(a.render), RENDER_SEED, 'render')
    fp = find_bore(luminance(a.photo), PHOTO_SEED, 'photo')
    annotate(a.render, fr, os.path.join(a.out, 'a4-ann-render.png'),
             'RENDER  a4-out register (62.2 deg)')
    annotate(a.photo, fp, os.path.join(a.out, 'a4-ann-photo.png'),
             'PHOTO  official-pocket-cushion-closeup (62.2 deg)')
    side = {
        'convention': (
            'bore = largest connected component of absolute linear luminance '
            '<= %.4f inside a seed box; both frames rescaled to bore radius '
            '%.0f px and cropped %.0f bore radii about the bore centre; rings '
            'drawn at 1x and 6x bore radius as LOCATORS.' % (BORE_Y, BORE_PX,
                                                             CROP_BORE_RADII)),
        'not_a_measurement': (
            'No dimension is read back from these rings. The photograph is '
            'oblique (~62.2 deg elevation) and the A4 fence forbids aiming a '
            'plug-centred plan-view radial instrument at it. The only measured '
            'quantities here are the two bore radii, which are what the scale '
            'normalisation is built from.'),
        'threshold_is_a_plateau': (
            'BORE_Y is not tuned: each side\'s "plateau" list is the measured '
            'radius across a decade of level, and "plateau_spread_in_band" is '
            'the spread over the band %s that is flat on BOTH sides. Outside '
            'that band each side breaks in its own direction -- the render '
            'floods into the plug face at 0.008, the photograph\'s bore has '
            'not closed at 0.0005 -- and both breakdowns are left in the sweep '
            'rather than averaged away. A future image with no flat band shows '
            'up as one.' % (PLATEAU_BAND,)),
        'render': fr, 'photo': fp,
        'photo_source_sha256': hashlib.sha256(open(a.photo, 'rb').read()).hexdigest(),
        'photo_licence': ('dossier reference material, reference-use-only; read '
                          'from Drive, never committed to the repository'),
    }
    with open(os.path.join(a.out, 'a4-ann-measurements.json'), 'w') as fh:
        json.dump(side, fh, indent=1)
    print('plateau spread over the common band %s — render %.1f%%, photo %.1f%%'
          % (PLATEAU_BAND, 100 * fr['plateau_spread_in_band'],
             100 * fp['plateau_spread_in_band']))


if __name__ == '__main__':
    main()
