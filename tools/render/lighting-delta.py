#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-delta.py — before/after pixel-delta maps + stats over two lighting-capture.mjs trees.

  lighting-delta.py --before DIR --after DIR --out DIR [--tables a,b] [--looks default,sp] [--poses p1,p2]
                    [--photo-map map.json]
  lighting-delta.py --selftest

Before and after table directories are paired through the table aliases the app applies (web/scene/equipmentalias.js:
TABLE_RENAMES and the 'table' rows of ALIAS_DIGESTS, read from that file), so a capture taken before a table rename
compares with one taken after it (the pairing lives in lighting_ids.py, shared with lighting-pack.py); the sheet and
the stats row carry the after-side directory name, the stats row also the before-side one. Nothing is skipped
silently: a table (or look) present on one side only is listed (UNMATCHED ...) and the run exits 3 after writing the
matched sheets; a pose present on one side only is listed and counted (summary line and delta-stats.md) but does not
fail the run, since the pose register may change between the BEFORE and AFTER capture-tool versions.

Per (look, table, pose): a sheet  [ before | after | |Δ| heat ]  at <out>/<look>/<table>/<pose>-delta.png
and a row in <out>/delta-stats.json + delta-stats.md: mean |ΔY8|, p99 |ΔY8|, % px with |ΔY8| > 4, % > 16,
signed mean ΔY8 (after − before), before/after saturation fractions (any channel ≥ 250).
The heat map is |ΔY8| on a fixed 0..64 scale (black → yellow → white), so sheets compare across tables.
If --photo-map gives {"<table>/<pose>": "photo path"} the sheet becomes a TRIPTYCH  [before|after|photo]
with the delta as a fourth tile (the owner's sign-off format per the brief).
"""
import argparse, json, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw

Y8 = np.array([0.2126, 0.7152, 0.0722])
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lighting_ids import ALIAS_JS, canonical_table, fnv1a64_hex, load_table_aliases, side_tables  # noqa: E402


def luma8(im):
    a = np.asarray(im.convert('RGB')).astype(np.float64)
    return a @ Y8


def heat(d):
    t = np.clip(d / 64.0, 0, 1)
    r = np.clip(t * 2, 0, 1); g = np.clip(t * 2 - 0.5, 0, 1); b = np.clip(t * 3 - 2, 0, 1)
    return Image.fromarray((np.stack([r, g, b], -1) * 255).astype(np.uint8))


def label(im, txt):
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 8 + 7 * len(txt), 16], fill=(0, 0, 0)); d.text((4, 2), txt, fill=(255, 255, 0))
    return im


def sheet(tiles, w=640):
    ims = []
    for t, cap in tiles:
        s = t.copy(); s.thumbnail((w, 10000)); ims.append(label(s.convert('RGB'), cap))
    h = max(i.height for i in ims)
    out = Image.new('RGB', (sum(i.width for i in ims) + 4 * (len(ims) - 1), h), (20, 20, 20))
    x = 0
    for i in ims:
        out.paste(i, (x, 0)); x += i.width + 4
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--before', required=True); ap.add_argument('--after', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--tables'); ap.add_argument('--looks', default='default,sp'); ap.add_argument('--poses')
    ap.add_argument('--photo-map')
    ap.add_argument('--alias-js', default=ALIAS_JS, help=argparse.SUPPRESS)
    ap.add_argument('--selftest', action='store_true', help='run the pairing plants through this script by subprocess; exit 0 iff all hold, 3 otherwise')
    if '--selftest' in sys.argv[1:]:
        sys.exit(selftest())
    a = ap.parse_args()
    aliases = load_table_aliases(a.alias_js)
    photo = json.load(open(a.photo_map)) if a.photo_map else {}
    rows, unmatched, unposed = [], [], []
    for look in a.looks.split(','):
        bt, at = side_tables(a.before, look, aliases), side_tables(a.after, look, aliases)
        if not os.path.isdir(os.path.join(a.before, look)) and not os.path.isdir(os.path.join(a.after, look)):
            continue
        want = [canonical_table(t, aliases) for t in a.tables.split(',')] if a.tables else sorted(set(bt) | set(at))
        for c in want:
            if c not in bt or c not in at:
                unmatched.append(f'{look}/{bt.get(c, at.get(c, c))}: no {"before" if c not in bt else "after"} table directory')
                continue
            t = at[c]
            bd, ad = os.path.join(a.before, look, bt[c]), os.path.join(a.after, look, at[c])
            bposes = sorted(f[:-4] for f in os.listdir(bd) if f.endswith('.png'))
            aposes = sorted(f[:-4] for f in os.listdir(ad) if f.endswith('.png'))
            poses = a.poses.split(',') if a.poses else sorted(set(bposes) | set(aposes))
            od = os.path.join(a.out, look, t); os.makedirs(od, exist_ok=True)
            for p in poses:
                bp, apth = os.path.join(bd, p + '.png'), os.path.join(ad, p + '.png')
                if not (os.path.exists(bp) and os.path.exists(apth)):
                    unposed.append(f'{look}/{t}/{p}: no {"before" if not os.path.exists(bp) else "after"}')
                    continue
                B, A = Image.open(bp), Image.open(apth)
                yb, ya = luma8(B), luma8(A)
                d = ya - yb; ad_ = np.abs(d)
                sb = (np.asarray(B.convert('RGB')).max(axis=2) >= 250).mean(); sa = (np.asarray(A.convert('RGB')).max(axis=2) >= 250).mean()
                row = {'look': look, 'table': t, 'table_before': bt[c], 'pose': p, 'mean_abs': float(ad_.mean()), 'p99_abs': float(np.percentile(ad_, 99)),
                       'frac_gt4': float((ad_ > 4).mean()), 'frac_gt16': float((ad_ > 16).mean()), 'mean_signed': float(d.mean()),
                       'sat_before': float(sb), 'sat_after': float(sa)}
                rows.append(row)
                tiles = [(B, f'BEFORE {bt[c]} {p} [{look}]'), (A, f'AFTER  satAny {sa*100:.1f}% (was {sb*100:.1f}%)')]
                key = f'{t}/{p}'
                if key in photo and os.path.exists(photo[key]):
                    tiles.append((Image.open(photo[key]), 'PHOTO ' + os.path.basename(photo[key])[:40]))
                tiles.append((heat(ad_), f'|dY8| mean {row["mean_abs"]:.1f} p99 {row["p99_abs"]:.0f} >4:{row["frac_gt4"]*100:.0f}%'))
                sheet(tiles).save(os.path.join(od, p + '-delta.png'))
    os.makedirs(a.out, exist_ok=True)
    json.dump(rows, open(os.path.join(a.out, 'delta-stats.json'), 'w'), indent=1)
    md = ['| look | table | pose | mean abs dY8 | p99 | %>4 | %>16 | signed mean | satAny before -> after |', '|---|---|---|---|---|---|---|---|---|']
    for r in rows:
        md.append(f"| {r['look']} | {r['table']} | {r['pose']} | {r['mean_abs']:.2f} | {r['p99_abs']:.0f} | {r['frac_gt4']*100:.1f} | {r['frac_gt16']*100:.1f} | {r['mean_signed']:+.2f} | {r['sat_before']*100:.2f}% -> {r['sat_after']*100:.2f}% |")
    summary = f'lighting-delta: {len(rows)} pairs compared; {len(unmatched)} unmatched tables (fatal); {len(unposed)} unmatched poses (listed, not fatal)'
    md += [''] + ['UNMATCHED ' + u for u in unmatched + unposed] + [summary]
    open(os.path.join(a.out, 'delta-stats.md'), 'w').write('\n'.join(md) + '\n')
    print('\n'.join(md))
    if unmatched:
        sys.exit(3)


def selftest():
    # each plant runs the real main path by subprocess against a synthetic alias file and synthetic captures
    ok = True
    vec = fnv1a64_hex('') == 'cbf29ce484222325' and fnv1a64_hex('a') == 'af63dc4c8601ec8c'
    print(f'fnv1a64 vectors -> {"PASS" if vec else "FAIL"}'); ok = ok and vec
    ren, dig = load_table_aliases(ALIAS_JS)
    real = 'pool_pro_9ft_measured' in dig.values() and len(ren) > 0
    print(f'equipmentalias.js parse: {len(ren)} renames, {len(dig)} table digest rows (pool_pro_9ft_measured among them) -> {"PASS" if real else "FAIL"}'); ok = ok and real
    with tempfile.TemporaryDirectory() as td:
        js = os.path.join(td, 'alias.js')
        open(js, 'w').write("export const TABLE_RENAMES = Object.freeze({\n  selftest_old_tbl: 'selftest_new_tbl',\n});\n"
                            "export const ALIAS_DIGESTS = Object.freeze([\n  Object.freeze({ axis: 'table', digest: '" + fnv1a64_hex('selftest_retired_tbl')
                            + "', neutral_id: 'selftest_neutral_tbl' }),\n]);\n")
        img = Image.new('RGB', (8, 8), (90, 120, 60))
        cases = [('same id', 'selftest_same_tbl', 'selftest_same_tbl', 'p', 'p', 0, 'selftest_same_tbl'),
                 ('digest rename', 'selftest_retired_tbl', 'selftest_neutral_tbl', 'p', 'p', 0, 'selftest_neutral_tbl'),
                 ('TABLE_RENAMES rename', 'selftest_old_tbl', 'selftest_new_tbl', 'p', 'p', 0, 'selftest_new_tbl'),
                 ('unmatched table', 'selftest_lonely_tbl', 'selftest_other_tbl', 'p', 'p', 3, None),
                 ('unmatched pose', 'selftest_same_tbl', 'selftest_same_tbl', 'p', 'q', 0, None)]
        for i, (name, tb, ta, pb, pa, want_rc, want_table) in enumerate(cases):
            root = os.path.join(td, f'c{i}')
            for side, tbl, pose in (('before', tb, pb), ('after', ta, pa)):
                os.makedirs(os.path.join(root, side, 'default', tbl)); img.save(os.path.join(root, side, 'default', tbl, pose + '.png'))
            r = subprocess.run([sys.executable, os.path.abspath(__file__), '--before', os.path.join(root, 'before'), '--after', os.path.join(root, 'after'),
                                '--out', os.path.join(root, 'out'), '--looks', 'default', '--alias-js', js], capture_output=True, text=True)
            got = json.load(open(os.path.join(root, 'out', 'delta-stats.json'))) if os.path.exists(os.path.join(root, 'out', 'delta-stats.json')) else None
            listed = r.stdout.count('UNMATCHED ')
            if want_table:
                good = r.returncode == 0 and got is not None and [x['table'] for x in got] == [want_table] and listed == 0
            else:
                # nothing pairs: the listing is asserted (2 lines, one per side) and the run is fatal only for a table
                good = r.returncode == want_rc and got == [] and listed == 2
            print(f'{name}: {tb}/{pb} vs {ta}/{pa} -> exit {r.returncode}, rows {None if got is None else len(got)}, unmatched listed {listed} -> {"PASS" if good else "FAIL"}')
            ok = ok and good
    return 0 if ok else 3


if __name__ == '__main__':
    main()
