#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""pack-station-strips.py — the station turntable STRIPS from bake-station-thumbs.mjs sweep frames (GH-1001, card 32 v3
owner pick S1). Each item's 30 frames (the bake window, 896x448 RGBA, isolated product render) become ONE WebP film at
<w>x<h> per frame — (30 w) x h, alpha kept, lossy quality 90, method 6: the register GH-525 recorded for the shipped
strips ("alpha WebP turntable strips (q90, 224x112x30)", 01161d6e). Resampling is Lanczos on PREMULTIPLIED alpha (no
dark fringe on the antialiased edge). Until now the repo carried no packer for these strips (the GH-525 fleet stitched
them outside the tree); validation: the same frames packed at 224x112 come to 0.997x the shipped bytes (21 strips).

  node web/tools/render/bake-station-thumbs.mjs --category <cat> --id <id> --isolated --frames 30 [--game <id>] --out <dir>
  python3 tools/render/pack-station-strips.py <dir> <out dir> 336 168      -> <out>/<cat>/<id>.webp + sizes.json
"""
import json
import os
import sys
from PIL import Image

SRC, OUT, W, H = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
sizes = {}
for cat in sorted(os.listdir(SRC)):
    for item in sorted(os.listdir(os.path.join(SRC, cat))):
        d = os.path.join(SRC, cat, item)
        frames = sorted(f for f in os.listdir(d) if f.startswith('f') and f.endswith('.png'))
        if len(frames) != 30:
            print('SKIP', cat, item, len(frames), 'frames')
            continue
        strip = Image.new('RGBA', (W * 30, H), (0, 0, 0, 0))
        for k, f in enumerate(frames):
            im = Image.open(os.path.join(d, f)).convert('RGBA')
            pm = im.convert('RGBa').resize((W, H), Image.LANCZOS).convert('RGBA')  # premultiplied resample
            strip.paste(pm, (k * W, 0))
        os.makedirs(os.path.join(OUT, cat), exist_ok=True)
        p = os.path.join(OUT, cat, f'{item}.webp')
        strip.save(p, 'WEBP', quality=90, method=6)
        sizes[f'{cat}/{item}'] = os.path.getsize(p)
        print(cat, item, sizes[f'{cat}/{item}'])
json.dump(sizes, open(os.path.join(OUT, 'sizes.json'), 'w'), indent=1)
print('total', sum(sizes.values()), 'bytes in', len(sizes), 'strips')
