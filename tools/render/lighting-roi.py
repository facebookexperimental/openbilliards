#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-roi.py — px-ROI photometric reader for the venue-lighting lane (photos AND renders).

One instrument for both sides of every ratio row: a reference photo (sRGB JPEG/PNG, linearised by the
sRGB EOTF — the camera tone curve is UNKNOWN and is recorded as a read uncertainty), the app's
displayed frame (PNG, ACES + sRGB), or the app's scene-linear HDR readback (<pose>.hdr.f32 +
.json from lighting-capture.mjs, read verbatim in linear units, no inversion).

  lighting-roi.py IMAGE --rois ROIS [--ratios a/b,c/d] [--json OUT] [--annotate OUT.png]
  lighting-roi.py IMAGE --grid 100 --out grid.png        # labelled px grid to pick ROIs by eye
  lighting-roi.py IMAGE --probe x,y[,r]                  # one quick read at a pixel (radius r)

ROIS = a JSON file or inline JSON: [{"name": "bed", "x": 100, "y": 200, "w": 60, "h": 40}, ...]
       (x, y, w, h in the image's own px; for .hdr.f32 files give DISPLAYED-frame px — the tool
       divides by the sidecar's ds). Optional "shape": "ellipse" (inscribed) for ball discs.
Every ROI reports n, median sRGB (photos/PNGs), median/mean/p10/p90 of linear luminance Y
(Rec.709 weights), and per-channel medians. Ratios carry a READ UNCERTAINTY: the ROI is split
into 2x2 sub-blocks and the ratio is recomputed over all 16 sub-block pairings; ± is half the
p10–p90 spread of those — spatial non-uniformity inside the chosen boxes, not sensor noise.
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

Y_W = np.array([0.2126, 0.7152, 0.0722], dtype=np.float64)


def srgb_to_linear(u8):
    c = u8.astype(np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def load(path):
    """-> (linear_rgb float64 HxWx3, srgb_u8 or None, meta)"""
    if path.endswith('.hdr.f32'):
        meta = json.load(open(path + '.json'))
        w, h = meta['w'], meta['h']
        arr = np.fromfile(path, dtype='<f4').reshape(h, w, 3).astype(np.float64)
        meta['kind'] = 'hdr'; meta.setdefault('ds', 1)
        return arr, None, meta
    im = Image.open(path).convert('RGB')
    u8 = np.asarray(im)
    return srgb_to_linear(u8), u8, {'kind': 'srgb', 'w': u8.shape[1], 'h': u8.shape[0], 'ds': 1}


def roi_mask(shape, r, ds):
    x0 = int(round(r['x'] / ds)); y0 = int(round(r['y'] / ds))
    w = max(1, int(round(r['w'] / ds))); h = max(1, int(round(r['h'] / ds)))
    H, W = shape[:2]
    x0 = max(0, min(W - 1, x0)); y0 = max(0, min(H - 1, y0))
    x1 = max(x0 + 1, min(W, x0 + w)); y1 = max(y0 + 1, min(H, y0 + h))
    m = np.zeros((H, W), dtype=bool)
    if r.get('shape') == 'ellipse':
        yy, xx = np.mgrid[y0:y1, x0:x1]
        cx, cy = (x0 + x1 - 1) / 2, (y0 + y1 - 1) / 2
        rx, ry = max(0.5, (x1 - x0) / 2), max(0.5, (y1 - y0) / 2)
        m[y0:y1, x0:x1] = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1.0
    else:
        m[y0:y1, x0:x1] = True
    return m, (x0, y0, x1, y1)


def stats(lin, u8, m):
    px = lin[m]
    Y = px @ Y_W
    out = {'n': int(m.sum()), 'Y_med': float(np.median(Y)), 'Y_mean': float(Y.mean()),
           'Y_p10': float(np.percentile(Y, 10)), 'Y_p90': float(np.percentile(Y, 90)),
           'rgb_lin_med': [float(np.median(px[:, i])) for i in range(3)]}
    if u8 is not None:
        s = u8[m]
        out['srgb_med'] = [int(np.median(s[:, i])) for i in range(3)]
        out['sat_any_frac'] = float((s.max(axis=1) >= 250).mean())
        out['sat_all_frac'] = float((s.min(axis=1) >= 250).mean())
    return out


def subblocks(box):
    x0, y0, x1, y1 = box
    xm, ym = (x0 + x1) // 2, (y0 + y1) // 2
    return [(x0, y0, max(xm, x0 + 1), max(ym, y0 + 1)), (xm, y0, x1, max(ym, y0 + 1)),
            (x0, ym, max(xm, x0 + 1), y1), (xm, ym, x1, y1)]


def block_Y(lin, m, box):
    x0, y0, x1, y1 = box
    sub = np.zeros_like(m); sub[y0:y1, x0:x1] = True
    sel = m & sub
    if sel.sum() == 0:
        return None
    return float(np.median(lin[sel] @ Y_W))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image')
    ap.add_argument('--rois')
    ap.add_argument('--ratios', default='')
    ap.add_argument('--json')
    ap.add_argument('--annotate')
    ap.add_argument('--grid', type=int)
    ap.add_argument('--out')
    ap.add_argument('--probe')
    ap.add_argument('--label', default='')
    ap.add_argument('--view-width', type=int, default=0)
    a = ap.parse_args()
    lin, u8, meta = load(a.image)
    ds = meta.get('ds', 1)
    H, W = lin.shape[:2]

    if a.grid:
        base = Image.fromarray(u8) if u8 is not None else Image.fromarray(
            (np.clip(lin / max(1e-6, np.percentile(lin, 99)), 0, 1) ** (1 / 2.2) * 255).astype(np.uint8))
        # --view-width: shrink for viewing, but label ORIGINAL px (× ds for hdr files)
        sc = 1.0
        if a.view_width and base.width > a.view_width:
            sc = a.view_width / base.width
            base = base.resize((a.view_width, int(round(base.height * sc))), Image.LANCZOS)
        d = ImageDraw.Draw(base)
        step = a.grid  # in ORIGINAL px
        x = 0
        while x * sc < base.width:
            X = int(round(x * sc)); d.line([(X, 0), (X, base.height)], fill=(255, 0, 255), width=1)
            d.text((X + 2, 2), str(int(x * ds)), fill=(255, 255, 0)); x += step
        y = 0
        while y * sc < base.height:
            Y = int(round(y * sc)); d.line([(0, Y), (base.width, Y)], fill=(255, 0, 255), width=1)
            d.text((2, Y + 2), str(int(y * ds)), fill=(255, 255, 0)); y += step
        base.save(a.out or 'grid.png')
        print('grid ->', a.out or 'grid.png', 'view', base.size, 'orig', (W * ds, H * ds), 'scale', round(sc, 4))
        return

    if a.probe:
        parts = [float(v) for v in a.probe.split(',')]
        x, y = parts[0], parts[1]; r = parts[2] if len(parts) > 2 else 3
        m, box = roi_mask(lin.shape, {'x': x - r, 'y': y - r, 'w': 2 * r + 1, 'h': 2 * r + 1, 'shape': 'ellipse'}, ds)
        print(json.dumps(stats(lin, u8, m)))
        return

    rois = json.load(open(a.rois)) if a.rois and os.path.exists(a.rois) else json.loads(a.rois)
    res = {'image': a.image, 'kind': meta['kind'], 'ds': ds, 'label': a.label, 'rois': {}, 'ratios': {}}
    masks = {}
    for r in rois:
        m, box = roi_mask(lin.shape, r, ds)
        masks[r['name']] = (m, box)
        st = stats(lin, u8, m)
        st['box_px'] = [int(v * ds) for v in box]
        st['blocks_Y'] = [block_Y(lin, m, b) for b in subblocks(box)]
        res['rois'][r['name']] = st
    for pair in [p for p in a.ratios.split(',') if p]:
        num, den = pair.split('/')
        A, B = res['rois'][num], res['rois'][den]
        ratio = A['Y_med'] / max(1e-9, B['Y_med'])
        vals = [x / y for x in A['blocks_Y'] if x is not None for y in B['blocks_Y'] if y not in (None, 0)]
        spread = (np.percentile(vals, 90) - np.percentile(vals, 10)) / 2 if vals else float('nan')
        res['ratios'][pair] = {'ratio': ratio, 'pm': float(spread), 'blocks_min': float(min(vals)) if vals else None,
                               'blocks_max': float(max(vals)) if vals else None}
    if a.annotate:
        if u8 is not None:
            base = Image.fromarray(u8).convert('RGB')
        else:
            tm = np.clip(lin / max(1e-6, np.percentile(lin, 99.5)), 0, 1) ** (1 / 2.2)
            base = Image.fromarray((tm * 255).astype(np.uint8))
        d = ImageDraw.Draw(base)
        for name, (m, box) in masks.items():
            x0, y0, x1, y1 = box
            r = next(rr for rr in rois if rr['name'] == name)
            if r.get('shape') == 'ellipse':
                d.ellipse([x0, y0, x1 - 1, y1 - 1], outline=(255, 0, 255), width=2)
            else:
                d.rectangle([x0, y0, x1 - 1, y1 - 1], outline=(255, 0, 255), width=2)
            st = res['rois'][name]
            txt = f"{name} Y={st['Y_med']:.4f}" + (f" s={st['srgb_med']}" if 'srgb_med' in st else '')
            d.rectangle([x0, max(0, y0 - 14), x0 + 7 * len(txt), y0], fill=(0, 0, 0))
            d.text((x0 + 2, max(0, y0 - 13)), txt, fill=(255, 255, 0))
        yy = 4
        for k, v in res['ratios'].items():
            txt = f"{k} = {v['ratio']:.3f} ± {v['pm']:.3f}"
            d.rectangle([4, yy, 4 + 7 * len(txt) + 4, yy + 14], fill=(0, 0, 0))
            d.text((6, yy + 1), txt, fill=(0, 255, 255)); yy += 16
        if a.label:
            d.rectangle([4, yy, 4 + 7 * len(a.label) + 4, yy + 14], fill=(0, 0, 0))
            d.text((6, yy + 1), a.label, fill=(255, 255, 255))
        base.save(a.annotate)
    if a.json:
        json.dump(res, open(a.json, 'w'), indent=1)
    for n, st in res['rois'].items():
        line = f"{n:22s} n={st['n']:7d} Y_med={st['Y_med']:.5f} p10/p90={st['Y_p10']:.5f}/{st['Y_p90']:.5f}"
        if 'srgb_med' in st:
            line += f" sRGB={st['srgb_med']} satAny={st['sat_any_frac']:.3f}"
        print(line)
    for k, v in res['ratios'].items():
        print(f"RATIO {k} = {v['ratio']:.4f} ± {v['pm']:.4f}  (blocks {v['blocks_min']:.4f}..{v['blocks_max']:.4f})")


if __name__ == '__main__':
    main()
