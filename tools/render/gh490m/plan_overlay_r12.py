#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""plan_overlay_r12.py — the PLAN OVERLAY sheet for contract OB-GH490M-GEO-001 r12 PROPOSAL.

Three panels at 2 px/mm in the PCF-MID frame (u along the rail, right; w outboard of the
nose line, down): (a) the purchased Star model's own plan section (quarantine cache reads,
re-centred so its fall centre coincides with the kernel's DT-03), (b) our current top-down
mesh projection (the plan-audit dump of 02b42ac1, re-rastered with the audit's own method),
(c) evidence 05, the JOY plan photo (OBLIQUE, elevation unmeasured — transverse proportions
only, no depth pinned). The PROPOSED outline (from the r12 JSON, never retyped) is drawn on
(a) and (b); on (c) only scale bars in the photo's own pixels. Every number is read from the
JSON. Writes plan-overlay-r12.png and plan-overlay-r12.json (the overlay deltas vs the Star).

Quarantine law: the Star files are read only; nothing is written there; no vertex leaves it —
this sheet carries raster pixels of a section, which is a measurement, not the model.
"""
import argparse, hashlib, json, math, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[3]
JSON_DEFAULT = REPO / 'docs/geometry/cn8-middle-furniture-definition.json'
STAR = Path('/tmp/ob-3dm-quarantine/star-cgtrader/obj/midpocket-r12')
AUDIT = REPO / 'plan-audit-cn8'
S = 2.0; U0, U1, W0, W1 = -150.0, 150.0, -60.0, 160.0
PW, PH = int((U1 - U0) * S), int((W1 - W0) * S)   # 600 x 440
STAR_FALL_CENTRE = 51.59   # INTAKE §3b: the Star fall centre behind its nose line

def font(sz):
    for f in ('/System/Library/Fonts/Helvetica.ttc', '/Library/Fonts/Arial.ttf'):
        try: return ImageFont.truetype(f, sz)
        except Exception: pass
    return ImageFont.load_default()
F11, F13, F16 = font(11), font(13), font(16)

def X(u): return (u - U0) * S
def Y(w): return (w - W0) * S

def load_doc(p):
    raw = p.read_bytes(); d = json.loads(raw); f = {x['id']: x for x in d['features']}
    def v(i):
        x = f[i]; return x.get('value_mm', x.get('value'))
    return d, f, v, hashlib.sha256(raw).hexdigest()

def outline_points(v):
    """the proposed leather outline at bed+20 as a dense closed polyline (u, w) + the bed arc"""
    DT03, DT09, LP04, LP02 = v('DT-03'), v('DT-09'), v('LP-04'), v('LP-02')
    R20, Rb = v('LP-05')['bed+20'], v('LP-05')['bed+0.5']
    front = LP04 - LP02
    uf = math.sqrt(R20 ** 2 - (front - DT03) ** 2)        # where the bed+20 arc enters the front edge
    pts = [(-DT09, LP04), (DT09, LP04), (DT09, front), (uf, front)]
    a0 = math.atan2(front - DT03, uf); a1 = math.atan2(front - DT03, -uf)
    n = 240
    for k in range(n + 1):
        a = a0 + (a1 - a0) * k / n
        pts.append((R20 * math.cos(a), DT03 + R20 * math.sin(a)))
    pts += [(-uf, front), (-DT09, front), (-DT09, LP04)]
    # bed-level arc between the sides
    wb = DT03 + math.sqrt(Rb ** 2 - DT09 ** 2)
    b0 = math.atan2(wb - DT03, DT09); b1 = math.atan2(wb - DT03, -DT09)
    bed = [(Rb * math.cos(b0 + (b1 - b0) * k / n), DT03 + Rb * math.sin(b0 + (b1 - b0) * k / n)) for k in range(n + 1)]
    return pts, bed, dict(front=front, uf=uf, wb=wb)

def draw_proposal(dr, v, col=(230, 30, 30)):
    pts, bed, meta = outline_points(v)
    dr.line([(X(u), Y(w)) for u, w in pts], fill=col, width=2)
    for i in range(0, len(bed) - 1, 8):
        dr.line([(X(bed[i][0]), Y(bed[i][1])), (X(bed[i + 4][0]), Y(bed[i + 4][1]))], fill=col, width=1)
    DT03, FL01, FL02, DT09, DT10 = v('DT-03'), v('FL-01'), v('FL-02'), v('DT-09'), v('DT-10')
    for r, wd in ((FL01, 2), (FL02, 1)):
        dr.ellipse([X(-r), Y(DT03 - r), X(r), Y(DT03 + r)], outline=col, width=wd)
    for s in (-1, 1):
        dr.line([(X(s * DT09), Y(DT10)), (X(s * DT09), Y(v('LP-04')))], fill=col, width=1)
    # kernel jaw arc 1: centre (JW-01, JW-02) behind the nose, from the tangency to the cut plane
    T, R1 = v('JW-01'), v('JW-02')
    for s in (-1, 1):
        arc = []
        for k in range(61):
            uu = T - (T - DT09) * k / 60
            arc.append((s * uu, R1 - math.sqrt(max(R1 ** 2 - (T - uu) ** 2, 0.0))))
        dr.line([(X(u), Y(w)) for u, w in arc], fill=col, width=2)
    for w, lab in ((v('DT-04'), 'arris AS-MODELED %.0f' % v('DT-04')), (v('DT-13'), 'rail outer face MFR %.0f' % v('DT-13'))):
        dr.line([(0, Y(w)), (PW, Y(w))], fill=col, width=1); dr.text((PW - 4, Y(w) - 13), lab, fill=col, font=F11, anchor='ra')
    dr.line([(0, Y(0)), (PW, Y(0))], fill=(255, 235, 0), width=1); dr.line([(X(0), 0), (X(0), PH)], fill=(255, 235, 0), width=1)
    return meta

def panel_star(v):
    img = Image.open(STAR / 'star_mid_plan_cn8frame.png').convert('RGB')
    assert img.size == (PW, PH), img.size
    dr = ImageDraw.Draw(img)
    shift = v('DT-03') - STAR_FALL_CENTRE
    clouds = {}
    for tag, col in (('hm5_bed', (0, 90, 200)), ('h20_leather', (0, 170, 90)), ('h20_rail', (90, 60, 20)), ('h38_leather', (150, 0, 150))):
        P = np.load(STAR / f'star_sect_{tag}.npy'); P = P.copy(); P[:, 1] += shift; clouds[tag] = P
        for u, w, _ in P:
            if U0 <= u <= U1 and W0 <= w <= W1: dr.point((X(u), Y(w)), fill=col)
    meta = draw_proposal(dr, v)
    return img, clouds, shift

def panel_ours():
    """the plan-audit raster method (z-buffer top-down of the +z middle pocket), same frame"""
    d = json.load(open(AUDIT / 'ours-cn8.json'))
    NOSE = 630.0
    zbuf = np.full((PH, PW), -1e9); cbuf = np.zeros((PH, PW, 3), dtype=np.uint8)
    def fam(name):
        if name.startswith('cn8cap-'): return (196, 160, 110)
        if name.startswith('cn8-midthread'): return (235, 235, 235)
        if name in ('cn8-bed',) or name.startswith('cn8-cloth-') or name.startswith('cn8-cushion'): return (30, 140, 60)
        if name.startswith('cn8-mid-lipwall'): return (200, 200, 210)
        if name.startswith('cn8-mid-throat') or name.startswith('cn8-mid-liner'): return (170, 170, 180)
        if name.startswith('cn8-net'): return (245, 245, 245)
        if name.startswith('cn8-ring'): return (200, 160, 60)
        if name.startswith('cn8-plank') or name.startswith('cn8-beam') or name.startswith('cn8-bodyweb'): return (110, 70, 40)
        if name.startswith('cn8-leg'): return (90, 60, 40)
        return (255, 0, 255)
    for m in d['meshes']:
        if m.get('skipped'): continue
        P = np.array(m['positions']).reshape(-1, 3); I = np.array(m['indices'], dtype=int)
        if len(I) == 0: I = np.arange(len(P))
        T = P[I.reshape(-1, 3)]
        xmm = T[:, :, 0] * 1e3; wmm = T[:, :, 2] * 1e3 - NOSE
        keep = (T[:, :, 2].max(axis=1) > 0.45) & (xmm.min(axis=1) < U1) & (xmm.max(axis=1) > U0) & (wmm.min(axis=1) < W1) & (wmm.max(axis=1) > W0)
        T = T[keep]
        if len(T) == 0: continue
        col = np.array(fam(m['name']), dtype=np.uint8)
        for t in T:
            px = (t[:, 0] * 1e3 - U0) * S; py = (t[:, 2] * 1e3 - NOSE - W0) * S; h = t[:, 1]
            x0, x1 = int(max(0, np.floor(px.min()))), int(min(PW - 1, np.ceil(px.max())))
            y0, y1 = int(max(0, np.floor(py.min()))), int(min(PH - 1, np.ceil(py.max())))
            if x1 < x0 or y1 < y0: continue
            xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            d00 = px[1] - px[0]; d01 = py[1] - py[0]; d10 = px[2] - px[0]; d11 = py[2] - py[0]
            det = d00 * d11 - d10 * d01
            if abs(det) < 1e-9: continue
            vx = xs - px[0]; vy = ys - py[0]
            b1 = (vx * d11 - d10 * vy) / det; b2 = (d00 * vy - vx * d01) / det; b0 = 1 - b1 - b2
            inside = (b0 >= -1e-6) & (b1 >= -1e-6) & (b2 >= -1e-6)
            if not inside.any(): continue
            hh = b0 * h[0] + b1 * h[1] + b2 * h[2]
            sub = zbuf[y0:y1 + 1, x0:x1 + 1]; upd = inside & (hh > sub)
            sub[upd] = hh[upd]; cbuf[y0:y1 + 1, x0:x1 + 1][upd] = col
    return Image.fromarray(cbuf, 'RGB')

def panel_photo(v):
    pr = json.load(open(AUDIT / 'plan_photo_read.json'))
    cand = [AUDIT / 'panel0.png', Path('/tmp/plan-audit/cn8/panel0.png')]
    src = next((c for c in cand if c.exists()), None)
    if src is None: raise SystemExit('evidence-05 panel0.png not found in ' + ', '.join(map(str, cand)))
    im = Image.open(src).convert('RGB')
    sc = PW / im.width; im = im.resize((PW, int(im.height * sc)), Image.LANCZOS)
    canvas = Image.new('RGB', (PW, PH), (20, 20, 20)); canvas.paste(im, (0, 0)); dr = ImageDraw.Draw(canvas)
    roll = math.radians(pr['roll_deg']); cx0, cy0 = 560.0, 300.0
    def deroll(x, y):
        dx, dy = x - cx0, y - cy0
        return cx0 + dx * math.cos(roll) + dy * math.sin(roll), cy0 - dx * math.sin(roll) + dy * math.cos(roll)
    crest = [deroll(x, y) for x, y in pr['crest_bright_green_boundary']]
    dr.line([(x * sc, y * sc) for x, y in crest], fill=(255, 255, 255), width=2)
    pxmm = (crest[-1][0] - crest[0][0]) / 100.0    # the audit's anchor: crest chord := 100 mm (kernel middle fall opening, ESTIMATE tier)
    axis = (crest[-1][0] + crest[0][0]) / 2; yrow = max(crest[0][1], crest[-1][1]) + 40
    for k, (mm, lab, col) in enumerate(((2 * v('DT-09'), 'proposed slot 2·DT-09 = %.2f' % (2 * v('DT-09')), (230, 30, 30)), (v('LP-01'), 'leather back LP-01 = %.2f' % v('LP-01'), (255, 140, 0)), (100.0, 'anchor: crest chord := 100 (ESTIMATE)', (255, 255, 255)))):
        y = (yrow + 22 * k) * sc; half = mm * pxmm / 2 * sc
        dr.line([(axis * sc - half, y), (axis * sc + half, y)], fill=col, width=3); dr.text((axis * sc + half + 6, y - 7), lab, fill=col, font=F11)
    return canvas, pxmm

def overlay_deltas(v, clouds, shift):
    """deltas vs the Star, per source: leather-only sections for the outline, rail-only for the slot"""
    pts, bed, meta = outline_points(v)
    DT03, DT09, LP04, FL01 = v('DT-03'), v('DT-09'), v('LP-04'), v('FL-01')
    R20 = v('LP-05')['bed+20']
    def load(tag, g):
        P = np.load(STAR / f'star_sect_{tag}_{g}.npy').copy(); P[:, 1] += shift; return P
    L20 = load('h20', 'leather'); L38 = load('h38', 'leather'); R20p = load('h20', 'rail'); R38p = load('h38', 'rail')
    res = dict(shift_w_applied=shift)
    # back plane: a flat face yields section points only at its edges, so the back is the
    # leather's EXTREME w at bed+20 and at the rail top (|u| < DT-09 + 0.5), minus LP-04
    res['back'] = {}
    for tag, L in (('h20', L20), ('h38', L38)):
        q = L[np.abs(L[:, 0]) <= DT09 + 0.5]
        res['back'][tag] = dict(star_max_w=float(q[:, 1].max()), proposed=LP04, delta=float(q[:, 1].max() - LP04))
    res['back']['note'] = 'Star back face at the height (the Star back LEANS: 138.34 at bed+20, 138.07 at the rail top, 139.06 only at the skirt bottom) + the 0.41 shift, minus LP-04 139.18; the JOY rail (140.0) is 0.12 deeper than the Star (139.88) and the 0.82 set-in is the skirt-bottom value'
    # sides: the leather's extreme |u| vs DT-09, at bed+20 and bed+38
    for tag, L in (('h20', L20), ('h38', L38)):
        res['sides_' + tag] = dict(star_max_abs_u=float(np.abs(L[:, 0]).max()), proposed=DT09, delta=float(np.abs(L[:, 0]).max() - DT09))
    # inner wall: innermost radius per 10° sector about DT-03 vs the proposal
    def innermost(L, R_prop, lo=50, hi=130):
        r = np.hypot(L[:, 0], L[:, 1] - DT03); ang = np.degrees(np.arctan2(L[:, 1] - DT03, L[:, 0])); out = []
        for a0 in range(lo, hi, 10):
            q = (ang >= a0) & (ang < a0 + 10)
            if q.any(): out.append(float(r[q].min()))
        out = np.array(out); return dict(sectors=len(out), star_rmin_mean=float(out.mean()), star_rmin_range=[float(out.min()), float(out.max())], proposed_R=R_prop, delta_mean=float(out.mean() - R_prop), delta_max_abs=float(np.abs(out - R_prop).max()))
    res['inner_wall_h20_vs_LP05'] = innermost(L20, R20)
    res['inner_wall_h20_vs_fall'] = innermost(L20, FL01); res['inner_wall_h20_vs_fall']['note'] = 'the Star wall at bed+20 is flush with its own fall (53.19); against the kernel fall 53.61 the expected offset is −0.42 (scale)'
    res['inner_wall_h38_all'] = innermost(L38, v('LP-05')['bed+38']); res['inner_wall_h38_all']['note'] = 'all eight sectors 50–130°, including the two end (horn) sectors'
    res['inner_wall_h38'] = innermost(L38, v('LP-05')['bed+38'], 60, 120); res['inner_wall_h38']['note'] = 'WALL sectors 60–120° (GATE-1 as worded): the bed+38 arc meets the cut plane at 45.6° from +u, so the 50–60 / 120–130 sectors hold the horn tips, not the wall'
    res['inner_wall_h20_wall'] = innermost(L20, v('LP-05')['bed+20'], 60, 120)
    L0 = load('h0', 'leather'); res['inner_wall_h0'] = innermost(L0, v('LP-05')['bed+0.5']); res['inner_wall_h0']['note'] = 'bed+0.5, all eight sectors 50–130° (the bed arc meets the cut plane at 44.5°, so every sector there is wall)'
    # slot from the rail-only sections
    for tag, R in (('h20', R20p), ('h38', R38p)):
        nr = R[(R[:, 1] > 60) & (R[:, 1] < 130)]
        res['slot_' + tag] = dict(star_half=float(np.abs(nr[:, 0]).min()) if len(nr) else None, proposed=DT09, delta=float(np.abs(nr[:, 0]).min() - DT09) if len(nr) else None)
    # fall: the bed-cut circle from the bed-only section at bed-5
    B = load('hm5', 'bed'); q = B[(np.abs(B[:, 0]) < 45) & (B[:, 1] > 5) & (B[:, 1] < 105)]   # the straight slate edge at w 47.6 excluded
    if len(q) > 10:
        x, y = q[:, 0], q[:, 1]; A = np.c_[2 * x, 2 * y, np.ones(len(x))]; b = x ** 2 + y ** 2
        s_, *_ = np.linalg.lstsq(A, b, rcond=None); r = math.sqrt(s_[2] + s_[0] ** 2 + s_[1] ** 2)
        res['fall_star_bedcut_shifted'] = dict(cu=float(s_[0]), cw=float(s_[1]), r=float(r), n=int(len(q)), kernel=dict(cw=DT03, r=FL01), note='clean bed-cut fit (the straight slate edge excluded); Star CEBP 53.19–53.29 vs kernel 53.61: the 0.42 mm scale difference, expected')
    return res


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--input', type=Path, default=JSON_DEFAULT); ap.add_argument('--output-dir', type=Path, default=REPO / 'output/gh490m-r12')
    # FIX2 (review round 2 on #731): option presence is not option value — a blank or trailing path flag and a missing input path exit 2 by name
    ap.allow_abbrev = False  # FIX2: no prefix matching — `--ou=` must not reach argparse as --out=''
    import os as _os, sys as _sys; _sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "lib")); from argpaths import guard_paths as _guard_paths
    a = ap.parse_args()
    _guard_paths({'--input': 'file', '--output-dir': 'out'}, tag='plan_overlay_r12.py')  # FIX10 (Fable pass 2): after the parse — help exits 0 first; the guard is a post-parse value + existence check
    a.output_dir.mkdir(parents=True, exist_ok=True)  # FIX10 (Fable pass 3): after the guard
    doc, f, v, sha = load_doc(a.input)
    pa, clouds, shift = panel_star(v)
    pb = panel_ours(); ImageDraw.Draw(pb); draw_proposal(ImageDraw.Draw(pb), v)
    pc, pxmm = panel_photo(v)
    deltas = overlay_deltas(v, clouds, shift)
    gap = 12; TOP = 46; CAP = 96
    W = 3 * PW + 4 * gap; H = TOP + PH + CAP + gap
    sheet = Image.new('RGB', (W, H), (247, 244, 236)); dr = ImageDraw.Draw(sheet)
    dr.text((gap, 10), f"{doc['doc']['number']} {doc['doc']['revision']} PROPOSAL — middle-pocket PLAN OVERLAY: Star section | ours 02b42ac1 | evidence 05 · 2 px/mm · PCF-MID (u right, w outboard down) · source sha256 {sha[:16]}…", fill=(20, 20, 20), font=F16)
    caps = [
        f"(a) STAR model (CGTrader 5027041) — its own plan: raster z −60…+41 + sections: bed cut at bed−5 (blue), leather at bed+20 (green) and rail top−1 (purple), rail at bed+20 (brown), shifted +{shift:.2f} mm in w so the Star fall centre ({STAR_FALL_CENTRE}) sits on DT-03 {v('DT-03')}. RED = the r12 proposal (leather at bed+20 solid, bed arc dashed, fall FL-01 + band FL-02, cut planes ±DT-09, kernel jaw arc 1, arris 92 / MFR 140). Overlay vs the Star (leather-only / rail-only sections, shifted): back plane {deltas['back']['h20']['delta']:+.2f} mm (bed+20) / {deltas['back']['h38']['delta']:+.2f} (rail top); sides {deltas['sides_h20']['delta']:+.2f} (bed+20) / {deltas['sides_h38']['delta']:+.2f} (rail top); slot half {deltas['slot_h20']['star_half']:.2f} vs DT-09 {v('DT-09')}; inner wall innermost radius at bed+20 {deltas['inner_wall_h20_vs_LP05']['star_rmin_mean']:.2f} vs LP-05 {v('LP-05')['bed+20']} ({deltas['inner_wall_h20_vs_LP05']['delta_mean']:+.2f}: the Star arc centre is 0.45 nearer the nose, O-18) and vs the kernel fall {v('FL-01')} ({deltas['inner_wall_h20_vs_fall']['delta_mean']:+.2f}, the 0.42 scale); at the rail top the WALL sectors 60–120° read {deltas['inner_wall_h38']['star_rmin_mean']:.2f} vs LP-05 bed+38 {v('LP-05')['bed+38']} ({deltas['inner_wall_h38']['delta_mean']:+.2f}, max |{deltas['inner_wall_h38']['delta_max_abs']:.2f}|); the two end sectors are the horn tips (58.43, {deltas['inner_wall_h38_all']['delta_max_abs']:.2f} off, reported not gated) — GATE-1: sector mean ≤ 1.0 and no wall sector > 1.0.",
        "(b) OURS — 02b42ac1 top-down mesh projection (plan-audit method: z-buffer of the +z middle pocket; tan = cn8cap-boot plate, green = cloth, grey = lip wall / casting, white = knit). RED = the same proposal. What the audit found: a 2 mm plate at w 86–91.5, a 62° cloth cone, a white cylinder to −46, the bay 92 wide — none of it survives; the leather body (28–33 mm thick at the axis) stands where the plate and the void were.",
        f"(c) EVIDENCE 05 — the JOY plan photo (dossier frame 05), OBLIQUE from outside above the pocket; camera elevation UNMEASURED (plan audit §1) -> depth cannot be pinned; transverse reads carry ±5 % (anchor) ±10 % (perspective). White = the audit's crest trace; the audit's anchor crest chord := 100 mm (the kernel middle FALL OPENING — an ESTIMATE-tier pin and a different quantity from the slot) -> {pxmm:.3f} px/mm. Bars: the proposed slot / leather back 83.84 at that scale. Photo ratios cover/crest 0.86–0.95, bay/crest 1.0–1.11 vs leather = slot on the Star: consistent in proportion; the JOY absolute is CONFLICT C5.",
    ]
    for i, (p, cap) in enumerate(zip((pa, pb, pc), caps)):
        x = gap + i * (PW + gap); sheet.paste(p, (x, TOP))
        # wrap caption
        words = cap.split(' '); lines = []; cur = ''
        for w_ in words:
            t = (cur + ' ' + w_).strip()
            if dr.textlength(t, font=F11) > PW - 6: lines.append(cur); cur = w_
            else: cur = t
        lines.append(cur)
        for j, l in enumerate(lines[:7]): dr.text((x + 3, TOP + PH + 4 + j * 13), l, fill=(30, 30, 30), font=F11)
    out = a.output_dir / 'plan-overlay-r12.png'; sheet.save(out)
    json.dump(dict(source=str(a.input.relative_to(REPO)), source_sha256=sha, frame='PCF-MID u right / w outboard down, 2 px/mm, u -150..150, w -60..160', deltas=deltas), open(a.output_dir / 'plan-overlay-r12.json', 'w'), indent=1)
    print('[overlay] wrote', out, sheet.size); print('[overlay] deltas', json.dumps(deltas, indent=0)[:1500])
    return 0

if __name__ == '__main__':
    sys.exit(main())
