# Copyright (c) Meta Platforms, Inc. and affiliates.

# build-cloth-detail.py — prepares the vendored cloth detail-normal texture
# web/assets/cloth/terlenka_nor_gl_512.png from the Poly Haven 'terlenka'
# fine diagonal-twill scan (CC0 1.0, https://polyhaven.com/a/terlenka).
#
#   python3 tools/render/build-cloth-detail.py [source_png_or_jpg]
#
# Source: terlenka_nor_gl_2k (2048x2053, GL-convention normal map;
# https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/terlenka/
# terlenka_nor_gl_2k.png — a scratch copy under the system temp dir is the default input).
#
# Pipeline (feature 010 cloth detail normal):
#   1. resample 2048x2053 -> 2048x2048 (the scan's full tile is 265.7 mm);
#   2. crop a QUARTER tile (512px = 66.4 mm) instead of downsampling the
#      full tile to 512 — the twill thread period is ~5 px at 2 K (~0.65 mm
#      physical); a full-tile 512 px downsample pushes it under Nyquist and
#      averages the weave to a flat lilac, which defeats the texture;
#   3. cross-fade a 40 px wrap band on both axes so the crop tiles
#      seamlessly (the raw crop is not; the blend softens a 5 mm strip of
#      weave per period — invisible at the <0.5 m LOD fade distance);
#   4. save as 8-bit RGB PNG (~400 KB).
# Consumers tile it at 66.4 mm world repeat (scene/table.js DETAIL_TILE_M),
# which preserves the scan's true physical thread scale.
import os, sys, tempfile
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'terlenka', 'terlenka_nor_gl_2k.png')
OUT = __file__.rsplit('/tools/', 1)[0] + '/web/assets/cloth/terlenka_nor_gl_512.png'
S, B = 512, 40  # output size, wrap blend band

img = Image.open(SRC)
img = img.convert('RGB')  # 16-bit source channels -> 8-bit
img = img.resize((2048, 2048), Image.LANCZOS)

# extended crop (S+B on both axes) away from the scan border
ox, oy = 512, 512
ext = img.crop((ox, oy, ox + S + B, oy + S + B)).load()

out = Image.new('RGB', (S, S))
px = out.load()
for y in range(S):
    for x in range(S):
        r, g, b = ext[x, y]
        if x < B:
            t = (x + 0.5) / B
            r2, g2, b2 = ext[S + x, y]
            r, g, b = (r * t + r2 * (1 - t), g * t + g2 * (1 - t), b * t + b2 * (1 - t))
        if y < B:
            t = (y + 0.5) / B
            r2, g2, b2 = ext[x, S + y]
            if x < B:  # corner: wrap the x-blend of the opposite band too
                tx = (x + 0.5) / B
                r3, g3, b3 = ext[S + x, S + y]
                r2 = r2 * tx + r3 * (1 - tx)
                g2 = g2 * tx + g3 * (1 - tx)
                b2 = b2 * tx + b3 * (1 - tx)
            r, g, b = (r * t + r2 * (1 - t), g * t + g2 * (1 - t), b * t + b2 * (1 - t))
        px[x, y] = (round(r), round(g), round(b))

out.save(OUT, optimize=True)
print('wrote', OUT)
