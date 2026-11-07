#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""make_card_488d.py — GH-488D wave A5 TITLE-PLATE producer.

The A5 deliverables open on a static title card (the encode.sh frame map:
orbits = 60 card + track + 30 hold; pocketing = card + rt + hold + card +
slow + hold). ffmpeg on this host is built WITHOUT libfreetype, so the
`drawtext` filter does not exist and a card can never be burnt in by the
encoder — the plate has to arrive as a PNG. This produces it.

The plate is deterministic: fixed raster, fixed background, fixed font file
(hashed into the run manifest), fixed layout arithmetic, no timestamps and
no random jitter. Two runs on the same host produce byte-identical PNGs, so
the plate is part of the "clip is a pure function of the commit" chain
rather than a hand-made asset that has to be trusted.

The judge (orbitsweep-judge.py judge_encoded_489) identity-judges the card
on three axes: intra-card MAD (every card frame equals the slot's first),
a `lum >= 128` text-pixel census inside a pinned window, and a 16x10
average-luma grid signature. Nothing here is tuned to hit those numbers —
they are measured off the SEALED bytes afterwards and pinned, which is the
489 law (a conscious re-cut regenerates the fixture).

TWO LAYOUTS, one producer. Without `--disclosure` the plate is the original
centred title block (kept so the wave-A5 sealed plates remain reproducible
from this file). With `--disclosure` the plate becomes the wave-A5-R2 HONEST
SURFACE: brand / title / subtitle / caption, then a monospace byte-bound
provenance block, then an amber-headed residual-ledger paragraph. That is
the 488p card law (orbitsweep-488p.mjs:333-337) rendered through PIL rather
than through HTML+chrome, because this lane's plates must be byte-identical
across runs and a browser raster is not.

Layout arithmetic in the disclosure form is TOP-DOWN and auto-fitting: both
variable-height blocks shrink their own type until they fit their allotted
band. The fit search walks integer point sizes downward, so it is a pure
function of (text, width, height, font file) — no floats accumulate and no
"good enough" threshold is sampled.

Usage:
  python3 make_card_488d.py --out plate.png --title "FULL-TABLE ORBIT"
      [--sub "..."] [--foot "..."] [--width 1600] [--height 1000]
      [--font <ttf>] [--mono-font <ttf>] [--print-font]
      [--prov 'label=value' ...] [--disclosure "..."]
      [--disclosure-head "..."] [--disclosure-foot "..."]
"""
import argparse
import hashlib
import os
import sys

from PIL import Image, ImageDraw, ImageFont

# Candidate faces in preference order. The RESOLVED path and its sha256 are
# printed on stderr and recorded by the driver, so the plate's provenance
# names the exact glyph source — a different host with a different Arial
# would produce a different plate and the pinned signature would fire.
FONT_CANDIDATES = [
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/Library/Fonts/Arial Unicode.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
]

# Monospace face for the provenance block. Plain .ttf first: a .ttc is a
# collection and the face you get depends on an index argument, which is one
# more thing that could differ between hosts without anyone noticing.
MONO_CANDIDATES = [
    '/System/Library/Fonts/Supplemental/Andale Mono.ttf',
    '/System/Library/Fonts/Supplemental/Courier New.ttf',
    '/System/Library/Fonts/Menlo.ttc',
]

BG = (14, 14, 18)
RULE = (46, 50, 62)
DIM = (138, 143, 156)     # luma ~143 -> counts in the `lum >= 128` census
BRIGHT = (226, 229, 236)
AMBER = (214, 158, 74)    # luma ~164 -> also counts; the disclosure header


def resolve_font(explicit, candidates=None):
    for p in ([explicit] if explicit else []) + (candidates or FONT_CANDIDATES):
        if p and os.path.exists(p):
            return p
    raise SystemExit('make_card_488d: no usable font found')


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def centred(draw, font, text, y, fill, w):
    """Draw `text` horizontally centred at baseline-box top `y`.

    Centring uses the ink bbox, not the advance width, so trailing-space or
    side-bearing differences between faces cannot shift the plate.
    """
    x0, y0, x1, _y1 = draw.textbbox((0, 0), text, font=font)
    draw.text((round((w - (x1 - x0)) / 2) - x0, y - y0), text,
              font=font, fill=fill)


def tracked(draw, font, text, y, fill, w, track):
    """Centred, with `track` px of extra letterspacing between characters.

    Advance widths are summed per character rather than measured on the whole
    string, because that is exactly how the glyphs are then drawn — measuring
    the run and drawing it per-character would disagree wherever the face
    carries a kerning pair.
    """
    adv = [draw.textlength(c, font=font) for c in text]
    total = sum(adv) + track * max(0, len(text) - 1)
    x = (w - total) / 2
    _x0, y0, _x1, _y1 = draw.textbbox((0, 0), text, font=font)
    for c, a in zip(text, adv):
        draw.text((round(x), y - y0), c, font=font, fill=fill)
        x += a + track


def wrap(draw, font, text, max_w):
    """Greedy word wrap against measured advance width. Deterministic."""
    words, lines, cur = text.split(' '), [], ''
    for word in words:
        trial = word if not cur else cur + ' ' + word
        if draw.textlength(trial, font=font) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def fit_wrapped(draw, font_path, text, max_w, max_h, hi, lo):
    """Largest integer point size in [lo, hi] whose wrap fits `max_h`.

    Returns (font, lines, pitch). Falls back to `lo` and lets the caller
    clip rather than silently dropping text — a plate that overflows is a
    visible defect, a plate that quietly truncates a disclosure is a lie.
    """
    for size in range(hi, lo - 1, -1):
        font = ImageFont.truetype(font_path, size)
        lines = wrap(draw, font, text, max_w)
        pitch = round(size * 1.42)
        if len(lines) * pitch <= max_h:
            return font, lines, pitch
    font = ImageFont.truetype(font_path, lo)
    return font, wrap(draw, font, text, max_w), round(lo * 1.42)


def build(width, height, title, sub, foot, brand, font_path):
    """The original centred title block (wave A5 sealed form)."""
    img = Image.new('RGB', (width, height), BG)
    d = ImageDraw.Draw(img)
    f_brand = ImageFont.truetype(font_path, round(height * 0.036))
    f_title = ImageFont.truetype(font_path, round(height * 0.076))
    f_sub = ImageFont.truetype(font_path, round(height * 0.040))
    f_foot = ImageFont.truetype(font_path, round(height * 0.026))

    cy = round(height * 0.5)
    centred(d, f_brand, brand, cy - round(height * 0.175), DIM, width)
    # rules bracket the title block; they are wide, low-contrast and
    # therefore below the text census threshold by construction
    d.rectangle([round(width * 0.28), cy - round(height * 0.108),
                 round(width * 0.72), cy - round(height * 0.108) + 1],
                fill=RULE)
    centred(d, f_title, title, cy - round(height * 0.070), BRIGHT, width)
    d.rectangle([round(width * 0.28), cy + round(height * 0.048),
                 round(width * 0.72), cy + round(height * 0.048) + 1],
                fill=RULE)
    if sub:
        centred(d, f_sub, sub, cy + round(height * 0.080), DIM, width)
    if foot:
        centred(d, f_foot, foot, cy + round(height * 0.160), DIM, width)
    return img


def build_disclosed(width, height, title, sub, foot, brand, font_path,
                    mono_path, prov, disclosure, disc_head, disc_foot):
    """The wave-A5-R2 honest-surface plate.

    Top-down, not centred on a midline: the provenance block and the
    disclosure paragraph both vary in height with their content, and a
    midline layout would push one of them off the plate the first time a
    ledger row was added.
    """
    img = Image.new('RGB', (width, height), BG)
    d = ImageDraw.Draw(img)
    ml, mr = round(width * 0.075), round(width * 0.925)
    inner = mr - ml

    f_brand = ImageFont.truetype(font_path, round(height * 0.024))
    f_title = ImageFont.truetype(font_path, round(height * 0.062))
    f_sub = ImageFont.truetype(font_path, round(height * 0.030))
    f_foot = ImageFont.truetype(font_path, round(height * 0.020))
    f_dhead = ImageFont.truetype(font_path, round(height * 0.021))

    def rule(y):
        d.rectangle([ml, y, mr, y + 1], fill=RULE)

    tracked(d, f_brand, brand, round(height * 0.055), DIM, width,
            round(height * 0.0075))
    rule(round(height * 0.105))
    centred(d, f_title, title, round(height * 0.130), BRIGHT, width)
    if sub:
        centred(d, f_sub, sub, round(height * 0.215), DIM, width)
    if foot:
        centred(d, f_foot, foot, round(height * 0.258), DIM, width)

    # --- byte-bound provenance, monospace two-column -----------------------
    prov_top = round(height * 0.300)
    prov_bot = round(height * 0.600)
    if prov:
        label_w = max(len(k) for k, _ in prov)
        # size the mono face so the WIDEST full row fits the inner width;
        # the label column is padded to a fixed character count so the value
        # column is a straight edge without measuring anything twice
        # monospace: character count IS advance width, so the longest row is
        # the widest row and one measurement settles the whole block
        widest = max((f'{k.ljust(label_w)}   {v}' for k, v in prov), key=len)
        size = round(height * 0.0195)
        while size > 8:
            mf = ImageFont.truetype(mono_path, size)
            pitch = round(size * 1.52)
            if (d.textlength(widest, font=mf) <= inner
                    and len(prov) * pitch <= prov_bot - prov_top):
                break
            size -= 1
        mf = ImageFont.truetype(mono_path, size)
        pitch = round(size * 1.52)
        col = d.textlength(' ' * (label_w + 3), font=mf)
        y = prov_top
        for k, v in prov:
            d.text((ml, y), k, font=mf, fill=DIM)
            d.text((ml + col, y), v, font=mf, fill=BRIGHT)
            y += pitch

    # --- the one ledger, transcribed ---------------------------------------
    rule(round(height * 0.625))
    if disc_head:
        tracked(d, f_dhead, disc_head, round(height * 0.650), AMBER, width,
                round(height * 0.0045))
    disc_top = round(height * 0.695)
    disc_bot = round(height * 0.945) if disc_foot else round(height * 0.965)
    if disclosure:
        df, lines, pitch = fit_wrapped(
            d, font_path, disclosure, inner, disc_bot - disc_top,
            round(height * 0.0225), 9)
        y = disc_top
        for line in lines:
            d.text((ml, y), line, font=df, fill=BRIGHT)
            y += pitch
    if disc_foot:
        mfoot = ImageFont.truetype(mono_path, round(height * 0.0145))
        centred(d, mfoot, disc_foot, round(height * 0.960), DIM, width)
    return img


def census(img, width, height):
    """The judge's own `lum >= 128` predicate, counted on the written plate."""
    px = img.convert('RGB').load()
    n = 0
    for y in range(height):
        for x in range(width):
            r, g, b = px[x, y]
            if 0.2126 * r + 0.7152 * g + 0.0722 * b >= 128:
                n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--title', required=True)
    ap.add_argument('--sub', default='')
    ap.add_argument('--foot', default='')
    ap.add_argument('--brand', default='OPENBILLIARDS')
    ap.add_argument('--width', type=int, default=1600)
    ap.add_argument('--height', type=int, default=1000)
    ap.add_argument('--font', default='')
    ap.add_argument('--mono-font', default='')
    ap.add_argument('--print-font', action='store_true')
    ap.add_argument('--prov', action='append', default=[],
                    help="provenance row, 'label=value'; repeatable")
    ap.add_argument('--disclosure', default='')
    ap.add_argument('--disclosure-head', default='')
    ap.add_argument('--disclosure-foot', default='')
    # FIX2 (review round 2 on #731): option presence is not option value — a blank or trailing path flag and a missing input path exit 2 by name
    ap.allow_abbrev = False  # FIX2: no prefix matching — `--ou=` must not reach argparse as --out=''
    # FIX3 (review round 3 on #731 P2 (a)): the prior verdict artefact(s) are invalidated BEFORE any guard can refuse
    # FIX10 (review round 10 on #731): ONE parse to completion first (help / unknown flags / a missing --title exit before any effect); then the
    # value guard; then the FIX8 mode rule on the PARSED namespace — --print-font prints and returns before any plate is written, so it
    # owns nothing at --out; a plate run removes its own --out first
    import os as _os, sys as _sys; _sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "lib")); from argpaths import guard_values_of as _guard_values_of, guard_exists as _guard_exists, invalidate_dest as _invalidate_dest
    a = ap.parse_args()
    _guard_values_of(ap, tag='make_card_488d.py')
    if not a.print_font: _invalidate_dest(a.out, None, tag='make_card_488d.py')
    font_path = resolve_font(a.font)
    mono_path = resolve_font(a.mono_font, MONO_CANDIDATES)
    if a.print_font:
        print(f'{font_path}\t{sha256_of(font_path)}\t'
              f'{mono_path}\t{sha256_of(mono_path)}')
        return
    if a.disclosure or a.prov:
        prov = [tuple(r.split('=', 1)) for r in a.prov]
        img = build_disclosed(a.width, a.height, a.title, a.sub, a.foot,
                              a.brand, font_path, mono_path, prov,
                              a.disclosure, a.disclosure_head,
                              a.disclosure_foot)
    else:
        img = build(a.width, a.height, a.title, a.sub, a.foot, a.brand,
                    font_path)
    # NEVER save over an existing plate in place: the driver hardlinks the
    # plate into every card slot of every sequence, and PIL's save truncates
    # the inode rather than replacing the directory entry — an in-place
    # rewrite would silently reach through every hardlink that already exists,
    # including the red-arm sequences. Unlink first so a re-cut allocates a
    # new inode and the old one stays intact for whoever still points at it.
    if os.path.lexists(a.out):
        os.unlink(a.out)
    img.save(a.out)
    print(f'{a.out}\t{census(img, a.width, a.height)}\t{font_path}\t'
          f'{sha256_of(font_path)}\t{mono_path}\t{sha256_of(mono_path)}',
          file=sys.stdout)


if __name__ == '__main__':
    main()
