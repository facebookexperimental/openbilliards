# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Redlake/Kodak OSD 'PLAY-######' counter OCR for Dr. Dave A-series clips.

The Motion Corder OSD stamps a per-frame capture counter (units: capture
frames == milliseconds at the stamped 1000FPS) in the top OSD row at fixed
pixel positions (verified on HSVA-26/68/69/70/71):

    row  y = 10..24, six digit cells at x = 228 + 12*k (k = 0..5), width 11

Method: grayscale digit templates are harvested from frames whose counter
value was read by eye off contact sheets (TEMPLATE_SOURCES covers all ten
digits, multiple exemplars each); every cell of every frame is classified by
normalized cross-correlation; cells below CORR_MIN are flagged unreadable
(typically counter-roll transition frames where the OSD blends two values).

Output: <out>/osd_times/<clip>.csv with frame, counter (capture frames,
PLAY count-down toward END: time_ms = -counter), min correlation, readable
flag.  Downstream uses counter DELTAS between readable frames, so isolated
unreadable frames are harmless.

Usage: python3 ocr_osd.py <frames_root> <out_dir>
"""

import glob
import os
import sys

import numpy as np
from PIL import Image

Y0, Y1 = 10, 24
XS = [228 + 12 * k for k in range(6)]
W = 11
CORR_MIN = 0.82

# (clip, 1-based ffmpeg frame number, 6-digit counter string) read by eye
# from contact sheets (out/contact_sheets/*.png).
TEMPLATE_SOURCES = [
    ("HSVA-26_kick_with_English", 1, "000553"),
    ("HSVA-26_kick_with_English", 25, "000505"),
    ("HSVA-26_kick_with_English", 49, "000457"),
    ("HSVA-26_kick_with_English", 73, "000409"),
    ("HSVA-26_kick_with_English", 96, "000363"),
    ("HSVA-68_kick_shot_with_running-English_slow", 1, "002111"),
    ("HSVA-68_kick_shot_with_running-English_slow", 145, "001968"),
    ("HSVA-68_kick_shot_with_running-English_slow", 289, "001824"),
    ("HSVA-68_kick_shot_with_running-English_slow", 433, "001680"),
    ("HSVA-68_kick_shot_with_running-English_slow", 577, "001656"),
    ("HSVA-69_kick_shot_with_running-English_fast", 1, "001697"),
    ("HSVA-69_kick_shot_with_running-English_fast", 53, "001671"),
    ("HSVA-69_kick_shot_with_running-English_fast", 106, "001645"),
    ("HSVA-69_kick_shot_with_running-English_fast", 158, "001619"),
    ("HSVA-69_kick_shot_with_running-English_fast", 210, "001615"),
    ("HSVA-70_kick_shot_with_reverse-English_slow", 1, "000001"),
    ("HSVA-70_kick_shot_with_reverse-English_slow", 132, "002053"),
    ("HSVA-70_kick_shot_with_reverse-English_slow", 263, "001922"),
    ("HSVA-70_kick_shot_with_reverse-English_slow", 394, "001791"),
    ("HSVA-70_kick_shot_with_reverse-English_slow", 525, "001768"),
    ("HSVA-71_kick_shot_with_reverse-English_fast", 1, "000912"),
    ("HSVA-71_kick_shot_with_reverse-English_fast", 51, "000887"),
    ("HSVA-71_kick_shot_with_reverse-English_fast", 102, "000862"),
    ("HSVA-71_kick_shot_with_reverse-English_fast", 153, "000836"),
    ("HSVA-71_kick_shot_with_reverse-English_fast", 203, "000832"),
]

def a_clips(frames_root):
    """All extracted A-series frame dirs (they all carry the same OSD)."""
    return sorted(
        os.path.basename(d) for d in glob.glob(os.path.join(frames_root, "HSVA-*"))
    )


def cells_of(img):
    return [img[Y0:Y1, x : x + W].astype(np.float64) for x in XS]


def norm(c):
    c = c - c.mean()
    n = np.sqrt((c * c).sum())
    return c / n if n > 1e-9 else c


def frame_files(frames_root, clip):
    return sorted(glob.glob(os.path.join(frames_root, clip, "*.png")))


def load(f):
    return np.asarray(Image.open(f).convert("L"), dtype=np.float32)


def build_templates(frames_root):
    tpl = {str(d): [] for d in range(10)}
    for clip, fno, digits in TEMPLATE_SOURCES:
        f = os.path.join(frames_root, clip, "%04d.png" % fno)
        for cell, d in zip(cells_of(load(f)), digits):
            tpl[d].append(norm(cell))
    return tpl


def classify(cell, tpl):
    c = norm(cell)
    best, bc = None, -2.0
    for d, exs in tpl.items():
        for e in exs:
            corr = float((c * e).sum())
            if corr > bc:
                best, bc = d, corr
    return best, bc


def main(frames_root, out_dir):
    tpl = build_templates(frames_root)
    # Self-check: every template cell must classify as its own label.
    bad = 0
    for clip, fno, digits in TEMPLATE_SOURCES:
        f = os.path.join(frames_root, clip, "%04d.png" % fno)
        got = "".join(classify(c, tpl)[0] for c in cells_of(load(f)))
        if got != digits:
            print("SELFCHECK MISMATCH %s f%d: want %s got %s" % (clip, fno, digits, got))
            bad += 1
    print("selfcheck: %d/%d template frames ok" % (len(TEMPLATE_SOURCES) - bad, len(TEMPLATE_SOURCES)))
    os.makedirs(os.path.join(out_dir, "osd_times"), exist_ok=True)
    for clip in a_clips(frames_root):
        rows, good = [], 0
        for fi, f in enumerate(frame_files(frames_root, clip)):
            ds, cmin = [], 2.0
            for cell in cells_of(load(f)):
                d, c = classify(cell, tpl)
                ds.append(d)
                cmin = min(cmin, c)
            ok = 1 if cmin >= CORR_MIN else 0
            good += ok
            rows.append((fi + 1, -int("".join(ds)) if ok else "", round(cmin, 3), ok))
        p = os.path.join(out_dir, "osd_times", clip + ".csv")
        with open(p, "w") as fh:
            fh.write("frame,counter_capture_frames,min_corr,readable\n")
            for r in rows:
                fh.write("%s,%s,%s,%s\n" % r)
        print("%s: %d/%d frames readable -> %s" % (clip, good, len(rows), p))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
