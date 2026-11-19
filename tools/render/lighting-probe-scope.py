#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-probe-scope.py — the derived venue fill's SCOPE proof (ORDER-LIGHT-6 Q1b).

Reads a lighting-capture run that carries the un-poked boot plus two pokes on the same table/look/poses:
  fill0     window.__lighting.setVenueFill(0)  — the fill's uniform driven to 0 (coefficients untouched)
  roomhide  the room dressing (floor, walls, props, far table) hidden; lights + fixture kept
and computes, per pose, the room MASK (pixels that go dark when the dressing is hidden: they show the room) and the
mean display luminance Y8 over that mask with the fill ON vs OFF; plus three class sub-masks projected through the
recorded camera (the same kernel-frame patches lighting-render-reads.py uses; the table id resolves through its
resolve_table, so a renamed id reads its literal's frame width / bed height): walls (wall_side), floor
(floor_beside), bench (seat + back + pad). |ΔY8| ≤ 1 on every mask = the fill does not light the room.

Rows are MERGED into the reads dir's reads.json (`scope` block) so lighting-gate.py reads them as
`scope:<pose>:<mask>:absdelta`; a strip PNG per look/pose (fill ON | fill OFF | room mask | |Δ|×8) goes to --out.
  python3 tools/render/lighting-probe-scope.py --capture output/lighting/after-s6-scope --reads output/lighting/reads-render/after-s6-scope --out output/lighting/scope-s6
"""
import argparse, importlib.util, json, os, sys
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('rr', os.path.join(HERE, 'lighting-render-reads.py'))
rr = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(rr)


def y8(png):
    a = np.asarray(png.convert('RGB')).astype(np.float64)
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def label(im, txt):
    d = ImageDraw.Draw(im); d.rectangle([0, 0, 8 + 7 * len(txt), 16], fill=(0, 0, 0)); d.text((4, 2), txt, fill=(255, 255, 255)); return im


def sheet(tiles, w=640):
    ims = [label(t.resize((w, int(t.height * w / t.width))), txt) for t, txt in tiles]
    out = Image.new('RGB', (w * len(ims), ims[0].height), (20, 20, 20))
    for i, im in enumerate(ims):
        out.paste(im, (i * w, 0))
    return out


def frame_dims(table, table_js):
    """(literal id, frameWidth, bedAboveFloor) the scope patches read for `table`: resolved exactly as lighting-render-reads
    main() does (ALIAS, the id map of the tree's equipmentalias.js, one alias-block hop). A miss, or a literal without either
    key, raises SystemExit: a renamed id must never read the default 0.145 / 0.79 floor patch."""
    specs = rr.parse_table_specs(table_js)
    aliases = rr.parse_table_aliases(table_js)
    idmap = rr.load_idmap()
    leaf_path = os.path.join(os.path.dirname(table_js), 'equipmentalias.js')
    idmap.load(leaf_path)
    spec_id = rr.resolve_table(table, specs, aliases, lambda t: idmap.current_table_id(t, leaf_path), table_js)
    FW, BED = specs[spec_id].get('frameWidth'), specs[spec_id].get('bedAboveFloor')
    if FW is None or BED is None:
        raise SystemExit(f'lighting-probe-scope: table {table} -> TABLE_SPECS.{spec_id} carries no frameWidth/bedAboveFloor in {table_js}; refusing default numbers')
    return spec_id, FW, BED


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--capture', required=True); ap.add_argument('--reads', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--table', default='predator_apex_9ft'); ap.add_argument('--looks', default='default,sp')
    ap.add_argument('--poses', default='full34,cushion_shadow')
    ap.add_argument('--table-js', default=os.path.join(HERE, '../../web/scene/table.js'))
    a = ap.parse_args()
    man = json.load(open(os.path.join(a.capture, 'manifest.json')))
    spec_id, FW, BED = frame_dims(a.table, a.table_js)
    if spec_id != a.table:
        print(f'[scope] {a.table} reads TABLE_SPECS.{spec_id}')
    os.makedirs(a.out, exist_ok=True)
    summary = {}
    for look in a.looks.split(','):
        runs = {r.get('poke'): r for r in man['runs'] if r['table'] == a.table and r['look'] == look and not r.get('failed')}
        if None not in runs or 'fill0' not in runs or 'roomhide' not in runs:
            print(f'[scope] {look}: missing runs (have {sorted(str(k) for k in runs)})'); summary[look] = {'error': 'missing runs'}; continue
        base, off, hide = runs[None], runs['fill0'], runs['roomhide']
        k = base['derived']['kernel']
        HW, CW = k['width'] / 2, k['cushionWidth']
        ex = rr.k2w(1, 0, 0) - rr.k2w(0, 0, 0); ey = rr.k2w(0, 1, 0) - rr.k2w(0, 0, 0)
        res = {}
        for pose in a.poses.split(','):
            pb = next((p for p in base['poses'] if p['name'] == pose), None)
            paths = [os.path.join(a.capture, look, a.table, sub, pose + '.png') for sub in ('', 'fill0', 'roomhide')]
            if pb is None or not all(os.path.exists(p) for p in paths):
                res[pose] = {'error': 'missing pose files'}; continue
            im_on, im_off, im_hide = (Image.open(p).convert('RGB') for p in paths)
            Yon, Yoff, Yhide = y8(im_on), y8(im_off), y8(im_hide)
            A = np.asarray(im_on).astype(int); Hd = np.asarray(im_hide).astype(int)
            # room mask: hiding the dressing at least HALVES the pixel's luminance (the dressing was its front-most
            # surface; table pixels only shift by the env re-bake and balls keep their bar highlights) — the
            # near-black floor under the table stays in the mask (its Y8 of 3–10 drops to ~0)
            mask_room = (Yhide < 0.5 * Yon - 1.0)
            cam = rr.Cam(pb['camera'], im_on.width, im_on.height)
            shape = Yon.shape
            def patch_mask(pts, dil=2):
                px, ok = cam.project(pts)
                return rr.mask_from_pts(px, ok, shape, dil) if ok.any() else np.zeros(shape, bool)
            masks = {'room_all': mask_room}
            if pose in ('full34', 'overview', 'apron_leg'):
                masks['walls'] = patch_mask(rr.patch_pts(np.array([4.49, 0.5, 1.2]), np.array([0, 0, 0.4]), np.array([0, 0.3, 0]), 16, 12)) & mask_room
                masks['floor'] = patch_mask(rr.patch_pts(rr.k2w(HW + CW + FW + 0.9, -0.2, -BED + 0.003), 0.15 * ex, 0.4 * ey)) & mask_room
                bench = np.zeros(shape, bool)
                for c0, du, dv, nu, nv in (([1.35, -0.294, -2.575], [0.7, 0, 0], [0, 0, 0.02], 24, 6), ([1.35, 0.03, -2.924], [0.7, 0, 0], [0, 0.12, 0], 24, 8), ([1.35, -0.244, -2.775], [0.7, 0, 0], [0, 0, 0.14], 24, 8)):
                    bench |= patch_mask(rr.patch_pts(np.array(c0), np.array(du, float), np.array(dv, float), nu, nv))
                masks['bench'] = bench & mask_room
            rows = {}
            for nm, m in masks.items():
                n = int(m.sum())
                if n < 16:
                    rows[nm] = {'px': n, 'on': None, 'off': None, 'delta': None, 'absdelta': None, 'note': 'mask too small'}; continue
                on_, off_ = float(Yon[m].mean()), float(Yoff[m].mean())
                rows[nm] = {'px': n, 'frac': round(n / m.size, 4), 'on': round(on_, 3), 'off': round(off_, 3), 'delta': round(on_ - off_, 3), 'absdelta': round(abs(on_ - off_), 3),
                            'p99abs': round(float(np.percentile(np.abs(Yon[m] - Yoff[m]), 99)), 2)}
            res[pose] = rows
            # strip: fill ON | fill OFF | room mask over the frame | |Δ| × 8
            mk = np.asarray(im_on).astype(float) * 0.35
            mk[mask_room] = mk[mask_room] * 0.4 + np.array([40, 160, 255]) * 0.6
            for nm, col in (('walls', (255, 80, 200)), ('floor', (255, 230, 0)), ('bench', (255, 140, 0))):
                if nm in masks:
                    mk[masks[nm]] = np.array(col)
            d8 = np.clip(np.abs(Yon - Yoff) * 8, 0, 255).astype(np.uint8)
            strip = sheet([(im_on, f'{look}/{pose} fill ON'), (im_off, 'fill OFF (setVenueFill 0)'),
                           (Image.fromarray(mk.astype(np.uint8)), f"room mask {rows['room_all'].get('frac', 0):.0%} (walls/floor/bench patches)"),
                           (Image.fromarray(np.stack([d8] * 3, -1)), f"|ΔY8|×8  room_all {rows['room_all'].get('absdelta')}")])
            strip.save(os.path.join(a.out, f'{look}-{pose}.png'))
        summary[look] = res
        rp = os.path.join(a.reads, look, a.table, 'reads.json')
        if os.path.exists(rp):
            d = json.load(open(rp)); d['scope'] = res; d['scope_meta'] = {'capture': a.capture, 'masks': 'room_all = pixels that go dark when the dressing is hidden; walls/floor/bench = kernel-frame patches ∩ room_all', 'unit': 'display Y8 (0..255) mean over the mask, fill ON − fill OFF'}
            json.dump(d, open(rp, 'w'), indent=1)
        else:
            print(f'[scope] {look}: no reads.json at {rp} (rows not merged)')
        for pose, rows in res.items():
            for nm, r in (rows.items() if isinstance(rows, dict) and 'error' not in rows else []):
                print(f"[scope] {look}/{pose:15s} {nm:9s} px {r['px']:7d} on {r['on']} off {r['off']} Δ {r['delta']}")
    json.dump(summary, open(os.path.join(a.out, 'scope.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
