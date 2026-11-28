#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""compose_size_sheet_621.py — one sheet per SIZE VARIANT: its eight sealed
registers in a grid beside the official Diamond dimension drawing for that size,
one sentence per register (D621-LOOK-3: the review audit noted no 7 ft sheet
existed; the same script serves the 8 ft).

  python3 tools/render/d621/compose_size_sheet_621.py --size 7ft --registers DIR \
      --drawing PATH --captions JSON --out DIR [--title T] [--gain-for r8_cabinet=4]
"""
import argparse, hashlib, json, math, os
from PIL import Image, ImageDraw, ImageFont

ORDER = ['r1_corner_macro', 'r2_corner_low', 'r3_side_macro', 'r4_cushion_nose',
         'r5_railtop', 'r6_fulltable', 'r7_overhead', 'r8_cabinet', 'r9_leg_close']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', required=True)
    ap.add_argument('--registers', required=True, help='capture dir with d621-<size>-<reg>-1x.png')
    ap.add_argument('--drawing', required=True, help='official dimension drawing image')
    ap.add_argument('--captions', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--title', default='D621-LOOK-3')
    ap.add_argument('--gain-for', action='append', default=[], help='register=gain (brightness, stated on the tile)')
    a = ap.parse_args()
    gains = dict((k, float(v)) for k, v in (g.split('=') for g in a.gain_for))
    caps = json.load(open(a.captions))
    os.makedirs(a.out, exist_ok=True)
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20)
    small = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 14)
    tiles = []
    for r in ORDER:
        p = os.path.join(a.registers, f'd621-{a.size}-{r}-1x.png')
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert('RGB')
        g = gains.get(r, 1.0)
        if abs(g - 1.0) > 1e-6:
            im = im.point(lambda v, g=g: min(255, int(round(v * g))))
        im = im.resize((640, 400))
        tiles.append((r, im, g, p))
    cols = 3
    rows = math.ceil(len(tiles) / cols)
    TW, TH, PAD, CAP = 640, 400, 14, 84
    draw_w = 900
    W = cols * (TW + PAD) + PAD + draw_w + PAD
    H = 60 + rows * (TH + CAP + PAD) + PAD
    sheet = Image.new('RGB', (W, H), (14, 14, 16))
    d = ImageDraw.Draw(sheet)
    d.text((PAD, 14), f'{a.title} · diamond_proam_{a.size} · sealed registers | official {a.size} dimension drawing', font=font, fill=(235, 235, 235))
    man = {'size': a.size, 'tiles': []}
    for i, (r, im, g, p) in enumerate(tiles):
        x = PAD + (i % cols) * (TW + PAD); y = 60 + (i // cols) * (TH + CAP + PAD)
        sheet.paste(im, (x, y))
        label = r + (f'  · shown at ×{g:g} gain (+{math.log2(g):.1f} EV)' if abs(g - 1.0) > 1e-6 else '')
        d.text((x, y + TH + 4), label, font=small, fill=(180, 180, 185))
        cap = caps.get(r, '')
        words, line, lines = cap.split(), '', []
        for w in words:
            if len(line) + len(w) + 1 > 92:
                lines.append(line); line = w
            else:
                line = (line + ' ' + w).strip()
        if line:
            lines.append(line)
        for j, l in enumerate(lines[:3]):
            d.text((x, y + TH + 22 + 16 * j), l, font=small, fill=(225, 225, 225))
        man['tiles'].append({'register': r, 'source': p, 'sha256': hashlib.sha256(open(p, 'rb').read()).hexdigest(), 'gain': g, 'caption': cap})
    dr = Image.open(a.drawing).convert('RGB')
    s = draw_w / dr.width
    dr = dr.resize((draw_w, int(dr.height * s)))
    sheet.paste(dr, (W - draw_w - PAD, 60))
    d.text((W - draw_w - PAD, 60 + dr.height + 6), f'official Diamond {a.size} Pro-Am dimension drawing [{os.path.basename(a.drawing)}]', font=small, fill=(180, 180, 185))
    fn = os.path.join(a.out, f'size-sheet-{a.size}.png')
    sheet.save(fn)
    man['sheet'] = fn; man['sha256'] = hashlib.sha256(open(fn, 'rb').read()).hexdigest()
    json.dump(man, open(os.path.join(a.out, f'size-sheet-{a.size}.json'), 'w'), indent=1)
    print(fn, sheet.size, len(tiles), 'tiles')


if __name__ == '__main__':
    main()
