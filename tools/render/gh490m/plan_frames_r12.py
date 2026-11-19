#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""plan_frames_r12.py — GATE-6 evidence: pocket-scale PLAN frames (2 px/mm), one per pocket per
height (bed+20 / nose / cap−1), registered on the pocket's own nose intersection, from a
world-space mesh dump of the live app (the census dumper's JSON: meshes → positions/indices).

Middle pockets: our section (every mesh sliced at the height, coloured by family) over the
contract outline (the body's plan at that height from cn8-middle-furniture-definition.json —
back LP-04, sides DT-09, the barrel LP-05(h) solved under the roll as the model does) and,
where a Star section exists at that height (bed+20 → h20, cap−1 ≈ bed+38 → h38), the Star's
own leather / rail section (quarantine measurement files, shifted onto the kernel fall).
Corner pockets: our section over the re-run corner letters (cn8-corner-furniture-definition-
contract.json: the mouth circle R about O_f, the outer arc R + W_L, the window lines A_r,
the cut lines y_cut, the back line W_c).  Writes PNGs + a JSON of the numeric relations.

usage: plan_frames_r12.py --dump /tmp/.../after-cn8.json --output-dir DIR [--star DIR]
"""
import argparse, json, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[3]
S = 2.0                      # px / mm
NOSE = 630.0
FAM = [('cn8-mid-leather', (200, 40, 40)), ('cn8-mid-stitch', (240, 240, 240)), ('cn8-mid-lace', (240, 240, 240)),
       ('cn8-mid-fallcloth', (30, 150, 60)), ('cn8-mid-slatecut', (90, 90, 100)), ('cn8-cloth-midwrap', (30, 150, 60)),
       ('cn8-cushion', (20, 110, 40)), ('cn8-plank', (120, 80, 40)), ('cn8-beam', (150, 120, 90)), ('cn8-blind', (120, 40, 50)),
       ('cn8-railend-plate', (60, 40, 40)), ('cn8-net', (170, 170, 170)), ('cn8-ring-iron', (200, 160, 60)), ('cn8-bed', (60, 170, 80)),
       ('cn8r82-ring', (200, 40, 40)), ('cn8r82-block', (40, 40, 40)), ('cn8r82', (150, 110, 80)), ('cn8cap', (200, 40, 40)), ('cn8-cloth-mid', (30, 150, 60)), ('cn8-mid', (170, 120, 120))]

def font(sz):
    for f in ('/System/Library/Fonts/Helvetica.ttc', '/Library/Fonts/Arial.ttf'):
        try: return ImageFont.truetype(f, sz)
        except Exception: pass
    return ImageFont.load_default()
F10, F12, F14 = font(10), font(12), font(14)

def colour(name):
    for pre, c in FAM:
        if name.startswith(pre): return c
    return (255, 0, 255)

def load_letters():
    d = json.load(open(REPO / 'docs/geometry/cn8-middle-furniture-definition.json'))
    f = {x['id']: x for x in d['features']}
    v = lambda i: f[i].get('value_mm', f[i].get('value'))
    c = json.load(open(REPO / 'docs/geometry/cn8-corner-furniture-definition-contract.json'))
    cl = {r['id'].split(' ')[0]: r['now'] for r in c['letters_moved'] if isinstance(r['now'], (int, float))}
    return v, cl

def barrel_r(v, h):
    """cn8mid.js cn8MidBarrelR: the quadratic through the three sections with the roll's offset removed at bed+38"""
    LP05 = v('LP-05'); LP06 = v('LP-06'); R = v('LP-07')[0]
    def roll_off(hh):
        v0 = LP06 - R
        if hh <= v0: return 0.0
        sn = min(1.0, 1 - (LP06 - hh) / R); return R * (1 - math.sqrt(max(0.0, 1 - sn * sn)))
    pts = [(0.5, LP05['bed+0.5']), (20.0, LP05['bed+20']), (38.0, LP05['bed+38'] - roll_off(38.0))]
    (v0, r0), (v1, r1), (v2, r2) = pts
    l0 = ((h - v1) * (h - v2)) / ((v0 - v1) * (v0 - v2)); l1 = ((h - v0) * (h - v2)) / ((v1 - v0) * (v1 - v2)); l2 = ((h - v0) * (h - v1)) / ((v2 - v0) * (v2 - v1))
    return r0 * l0 + r1 * l1 + r2 * l2

def mid_outline(v, h):
    DT03, DT09, LP04, LP02 = v('DT-03'), v('DT-09'), v('LP-04'), v('LP-02')
    rho = barrel_r(v, h); front = LP04 - LP02; dF = front - DT03
    uStar = math.sqrt(max(0.0, rho * rho - dF * dF)); flats = uStar < DT09
    uA = uStar if flats else DT09; wSide = DT03 + math.sqrt(max(0.0, rho * rho - DT09 * DT09)); fw = front if flats else wSide
    uCut = DT09 - 0.5
    expected_tip = front if uStar < uCut else DT03 + math.sqrt(max(0.0, rho * rho - uCut * uCut))
    thA = math.asin(min(1.0, uA / rho))
    pts = [(DT09, LP04), (-DT09, LP04), (-DT09, fw), (-uA, fw)]
    for k in range(121):
        th = -thA + 2 * thA * k / 120; pts.append((rho * math.sin(th), DT03 + rho * math.cos(th)))
    pts += [(uA, fw), (DT09, fw), (DT09, LP04)]
    return pts, dict(rho=rho, wSide=wSide, front=front, flats=flats, expected_tip_w=expected_tip)

def slice_mesh(m, h_m):
    """segments (x, y, z world, metres) of the mesh at height h"""
    P = np.array(m['positions']).reshape(-1, 3); I = np.array(m['indices'], dtype=int)
    if len(I) == 0: I = np.arange(len(P))
    T = P[I.reshape(-1, 3)]
    segs = []
    d = T[:, :, 1] - h_m
    cross = ~((d > 0).all(axis=1) | (d < 0).all(axis=1))
    for t, dd in zip(T[cross], d[cross]):
        pts = []
        for e in range(3):
            a, b = t[e], t[(e + 1) % 3]; da, db = dd[e], dd[(e + 1) % 3]
            if da * db < 0:
                s = da / (da - db); pts.append(a + s * (b - a))
        if len(pts) == 2: segs.append((pts[0], pts[1]))
    return segs

def frame(width_mm, height_mm, u0, w0):
    W, H = int(width_mm * S), int(height_mm * S)
    im = Image.new('RGB', (W, H), (250, 248, 244)); dr = ImageDraw.Draw(im)
    X = lambda u: (u - u0) * S; Y = lambda w: (w - w0) * S
    for g in range(int(u0 // 10) * 10, int(u0 + width_mm) + 1, 10):
        dr.line([(X(g), 0), (X(g), H)], fill=(232, 230, 226), width=1)
    for g in range(int(w0 // 10) * 10, int(w0 + height_mm) + 1, 10):
        dr.line([(0, Y(g)), (W, Y(g))], fill=(232, 230, 226), width=1)
    return im, dr, X, Y

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--dump', type=Path, required=True); ap.add_argument('--output-dir', type=Path, required=True)
    ap.add_argument('--star', type=Path, default=Path('/tmp/ob-3dm-quarantine/star-cgtrader/obj/midpocket-r12')); ap.add_argument('--tag', default='')
    # FIX2 (review round 2 on #731): option presence is not option value — a blank or trailing path flag and a missing input path exit 2 by name
    ap.allow_abbrev = False  # FIX2: no prefix matching — `--ou=` must not reach argparse as --out=''
    import os as _os, sys as _sys; _sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "lib")); from argpaths import guard_paths as _guard_paths
    a = ap.parse_args()
    _guard_paths({'--dump': 'file', '--output-dir': 'out', '--star': 'dir', '--tag': 'value'}, tag='plan_frames_r12.py')  # FIX10 (Fable pass 2): after the parse — help exits 0 first; the guard is a post-parse value + existence check
    a.output_dir.mkdir(parents=True, exist_ok=True)  # FIX10 (Fable pass 3): after the guard
    v, cl = load_letters(); d = json.load(open(a.dump))
    meshes = [m for m in d['meshes'] if not m.get('skipped')]
    HN = 0.635 * 57.15; heights = [('bed+20', 20.0), ('nose', HN), ('cap-1', v('LP-06') - 1.0)]
    report = dict(dump=str(a.dump), letters='cn8-middle-furniture-definition.json + cn8-corner-furniture-definition-contract.json', frames=[])
    # ---- middles ----
    for sw, tag in ((1, 'mid_p'), (-1, 'mid_n')):
        for hname, h in heights:
            im, dr, X, Y = frame(300, 220, -150, -60)
            out, meta = mid_outline(v, h)
            segs_all = []
            for m in meshes:
                for p, q in slice_mesh(m, h / 1000):
                    if np.sign(p[2]) != sw or abs(p[2]) < 0.40 or abs(p[0]) > 0.16: continue
                    u1, w1 = p[0] * 1e3, sw * p[2] * 1e3 - NOSE; u2, w2 = q[0] * 1e3, sw * q[2] * 1e3 - NOSE
                    dr.line([(X(u1), Y(w1)), (X(u2), Y(w2))], fill=colour(m['name']), width=2)
                    segs_all.append((m['name'], u1, w1, u2, w2))
            # the contract outline (dashed red) and the Star section where one exists
            dr.line([(X(u), Y(w)) for u, w in out], fill=(230, 30, 30), width=1)
            star_tag = {'bed+20': 'h20', 'cap-1': 'h38'}.get(hname)
            if star_tag:
                for g, col in (('leather', (30, 60, 200)), ('rail', (90, 110, 200))):
                    f = a.star / f'star_sect_{star_tag}_{g}.npy'
                    if f.exists():
                        P = np.load(f)[:, :2].copy(); P[:, 1] += 0.41
                        for u, w in P[::2]: dr.point((X(u), Y(w)), fill=col)
            # datums
            dr.line([(X(-150), Y(0)), (X(150), Y(0))], fill=(10, 40, 110), width=1); dr.line([(X(0), Y(-60)), (X(0), Y(160))], fill=(10, 40, 110), width=1)
            for w_, lab in ((v('DT-04'), 'DT-04 = DT-13 140'), (v('DT-12'), 'DT-12 50'), (v('LP-04'), 'LP-04 139.18')):
                dr.line([(X(-150), Y(w_)), (X(150), Y(w_))], fill=(120, 120, 120), width=1); dr.text((X(-148), Y(w_) - 12), lab, fill=(80, 80, 80), font=F10)
            for u_ in (-v('DT-09'), v('DT-09')):
                dr.line([(X(u_), Y(-60)), (X(u_), Y(160))], fill=(120, 120, 120), width=1)
            # numeric relation: the leather's front edge at the cut plane, the cushion end at the cut plane
            tip = [ (w1 + (w2 - w1) * ((v('DT-09') - 0.5 - abs(u1)) / (abs(u2) - abs(u1)))) for n, u1, w1, u2, w2 in segs_all if n.startswith('cn8-mid-leather-') and 'skirt' not in n and (abs(u1) - (v('DT-09') - 0.5)) * (abs(u2) - (v('DT-09') - 0.5)) < 0 ]
            cush = [ w for n, u1, w1, u2, w2 in segs_all if n.startswith('cn8-cushion') for u, w in ((u1, w1), (u2, w2)) if abs(abs(u) - v('DT-09')) < 0.05 ]
            tipw = min(tip) if tip else None; cushw = min(cush) if cush else None
            rel = dict(pocket=tag, height=hname, h_mm=round(h, 2), leather_front_at_cut_mm=None if tipw is None else round(tipw, 2), contract_expected_mm=round(meta['expected_tip_w'], 2),
                       tip_dev_mm=None if tipw is None else round(abs(tipw - meta['expected_tip_w']), 3), cushion_end_at_cut_mm=None if cushw is None else round(cushw, 2), jw05=v('JW-05'))
            report['frames'].append(rel)
            dr.rectangle([0, 0, 600, 44], fill=(255, 255, 255)); dr.text((6, 4), f"GATE-6 plan frame · middle {'+z' if sw > 0 else '-z'} · {hname} (v {h:.2f}) · 2 px/mm · u right / w outboard down · registered on the nose ∩ pocket axis", fill=(20, 20, 20), font=F12)
            dr.text((6, 22), f"ours (coloured) | contract outline (red) | Star section (blue, where measured) · leather front @ cut {rel['leather_front_at_cut_mm']} vs {rel['contract_expected_mm']} (Δ {rel['tip_dev_mm']}) · cushion end @ cut {rel['cushion_end_at_cut_mm']} (JW-05 {v('JW-05')})", fill=(20, 20, 20), font=F10)
            im.save(a.output_dir / f"plan-frame-{tag}-{hname}{a.tag}.png")
    # ---- corners ----
    Rm, WL, AR, YC, C, WC = 52.5, cl['W_L'], cl['A_r'], -40.0, 3.5, 45.0
    for sx in (-1, 1):
        for sz in (-1, 1):
            tag = f"corner_{'p' if sx > 0 else 'n'}{'p' if sz > 0 else 'n'}"
            for hname, h in heights:
                im, dr, X, Y = frame(220, 220, -60, -60)   # drawing frame: px, py outboard of the nose corner
                Lh, Wh = 1270.0, 630.0
                rel_r = []; reach = [-1e9, -1e9]; arm = [1e9, 1e9]
                for m in meshes:
                    for p, q in slice_mesh(m, h / 1000):
                        if np.sign(p[0]) != sx or np.sign(p[2]) != sz or abs(p[0]) < 1.15 or abs(p[2]) < 0.55: continue
                        px1, py1 = sx * p[0] * 1e3 - Lh, sz * p[2] * 1e3 - Wh; px2, py2 = sx * q[0] * 1e3 - Lh, sz * q[2] * 1e3 - Wh
                        dr.line([(X(px1), Y(py1)), (X(px2), Y(py2))], fill=colour(m['name']), width=2)
                        if m['name'].startswith('cn8r82-ring'):
                            for px_, py_ in ((px1, py1), (px2, py2)):
                                r = math.hypot(px_ - C, py_ - C); psi = abs(45 - math.degrees(math.atan2(py_ - C, px_ - C)))
                                if psi <= 10: rel_r.append(r)
                                reach[0] = max(reach[0], px_); reach[1] = max(reach[1], py_); arm[0] = min(arm[0], px_); arm[1] = min(arm[1], py_)
                # the contract: mouth circle, outer arc, window lines, cut lines, back lines
                for r, col in ((Rm, (230, 30, 30)), (Rm + WL, (230, 30, 30))):
                    dr.ellipse([X(C - r), Y(C - r), X(C + r), Y(C + r)], outline=col, width=1)
                dr.line([(X(AR), Y(-60)), (X(AR), Y(160))], fill=(120, 120, 120), width=1); dr.line([(X(-60), Y(AR)), (X(160), Y(AR))], fill=(120, 120, 120), width=1)
                dr.line([(X(YC), Y(-60)), (X(YC), Y(160))], fill=(60, 60, 60), width=1); dr.line([(X(-60), Y(YC)), (X(160), Y(YC))], fill=(60, 60, 60), width=1)
                dr.line([(X(WC), Y(-60)), (X(WC), Y(160))], fill=(20, 110, 40), width=1); dr.line([(X(-60), Y(WC)), (X(160), Y(WC))], fill=(20, 110, 40), width=1)
                dr.line([(X(0), Y(-60)), (X(0), Y(160))], fill=(10, 40, 110), width=1); dr.line([(X(-60), Y(0)), (X(160), Y(0))], fill=(10, 40, 110), width=1)
                rr = max(rel_r) if rel_r else None
                foot = None
                for m in meshes:
                    if not m['name'].startswith('cn8r82-ring'): continue
                    P = np.array(m['positions']).reshape(-1, 3)
                    if not len(P) or np.sign(P[0, 0]) != sx or np.sign(P[0, 2]) != sz: continue
                    px_ = sx * P[:, 0] * 1e3 - Lh; py_ = sz * P[:, 2] * 1e3 - Wh
                    r = np.hypot(px_ - C, py_ - C); psi = np.abs(45 - np.degrees(np.arctan2(py_ - C, px_ - C)))
                    q = r[psi <= 10]
                    if len(q): foot = float(q.max()) if foot is None else max(foot, float(q.max()))
                rel = dict(pocket=tag, height=hname, h_mm=round(h, 2), ring_outer_r_diag_mm=None if rr is None else round(rr, 2), ring_footprint_r_diag_mm=None if foot is None else round(foot, 2), contract_R_out=Rm + WL, section_inset_mm=None if (rr is None or foot is None) else round(foot - rr, 2), law='footprint (GATE-6 corner judges the footprint = R_out; the per-height section lies inside it by the outer roll-over — corner contract consequences.gate6_corner_law)',
                           window_reach_mm=[None if reach[0] < -1e8 else round(float(reach[0]), 2), None if reach[1] < -1e8 else round(float(reach[1]), 2)], contract_A_r=AR,
                           arm_end_mm=[None if arm[0] > 1e8 else round(float(arm[0]), 2), None if arm[1] > 1e8 else round(float(arm[1]), 2)], contract_y_cut=YC)
                report['frames'].append(rel)
                dr.rectangle([0, 0, 440, 44], fill=(255, 255, 255)); dr.text((6, 4), f"GATE-6 plan frame · {tag} · {hname} (v {h:.2f}) · 2 px/mm · drawing frame (outboard of the nose corner)", fill=(20, 20, 20), font=F12)
                dr.text((6, 22), f"ours (coloured) | contract: R {Rm} & R+W_L {Rm + WL:.1f} about O_f, A_r {AR}, y_cut {YC}, W_c {WC} · ring r_diag {rel['ring_outer_r_diag_mm']} · reach {rel['window_reach_mm']} · arm ends {rel['arm_end_mm']}", fill=(20, 20, 20), font=F10)
                im.save(a.output_dir / f"plan-frame-{tag}-{hname}{a.tag}.png")
    json.dump(report, open(a.output_dir / f'plan-frames-r12{a.tag}.json', 'w'), indent=1)
    print(f"[plan-frames] {len(report['frames'])} frames -> {a.output_dir}")
    for r in report['frames']:
        if r['pocket'].startswith('mid'): print(f"  {r['pocket']} {r['height']:7} front@cut {r['leather_front_at_cut_mm']} vs {r['contract_expected_mm']} Δ {r['tip_dev_mm']} | cushion@cut {r['cushion_end_at_cut_mm']} (JW-05 {r['jw05']})")
        else: print(f"  {r['pocket']} {r['height']:7} ring section r_diag {r['ring_outer_r_diag_mm']} (footprint {r['ring_footprint_r_diag_mm']} = the judged R_out {r['contract_R_out']}; section inset {r['section_inset_mm']}, informational) | reach {r['window_reach_mm']} vs {r['contract_A_r']} | arm ends {r['arm_end_mm']} vs {r['contract_y_cut']}")

if __name__ == '__main__':
    main()
