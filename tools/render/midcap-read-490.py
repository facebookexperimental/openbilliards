#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""midcap-read-490 — the REPRODUCING read of the JOY Pro middle-pocket cap.

Every number the R1-FIX6 seal quotes for the cap comes out of this file, run on
the two sanctioned frames (ev07-decisive.jpg / ev08.jpg, 852x480) or on a render
frame with the same definitions.  Nothing here fits anything; it measures.

  photo mode :  midcap-read-490.py photo <frame.jpg> --cap x0,y0,x1,y1 [--bed x0,y0,x1,y1]
  render mode:  midcap-read-490.py render <frame.png> --cap x0,y0,x1,y1 [--bed ...]

Definitions (stated once, used on both sides):
  cap class     not green (H 35..95 and S >= 60), not dark (V < 45), not bright (V > 200,
                the cream apron on renders), not saturated (S <= 110): the warm-neutral
                leather against green cloth / dark wood.
  silhouette    per image row inside --cap, scan OUTWARD from the cap's centre column
                until 3 consecutive non-cap pixels; width = right - left + 1.
  top width     median width over rows top+6 .. top+14 (below the fold bead).
  hem width     median width over the 8 rows above the hem crest; the crest is the
                last row before the width profile drops under 0.90 x its lower-half
                maximum (the scallop cusps begin).
  flare         hem width / top width  (>1 = the cap widens toward the hem).
  stitch row    inside the upper 40 % of the cap: the row band whose bright-pixel
                (luma >= plateau x 1.35) count peaks; dashes = runs of bright columns
                >= 4 px after a 3-px closing; pitch = median centre spacing in px and
                as a fraction of the LOCAL cap width at that row; duty = bright / span.
  plateau       leather face ROI = cap rows between 0.30 and 0.62 of the cap height,
                columns inside the silhouette shrunk by 12 %; plateau = the median of
                that ROI after dropping the brightest 20 % of columns (the lateral
                highlight ev07 carries at its left).
  thread ratio  dash-pixel luma (median of the bright pixels) over the plateau, in
                sRGB luma AND in linear light (sRGB decoded, Rec.709 weights).
  knit          --knit box: horizontal / vertical autocorrelation first peak of the
                high-passed luma (wale / course pitch, px) and p10 / p90 luma contrast.
  green tabs    per row, green run immediately outboard of the silhouette (px).
"""
import sys, json
import numpy as np, cv2
from PIL import Image

def arg(flag, default=None):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default
def box(s): return tuple(int(v) for v in s.split(','))
def s2l(u):
    u = u / 255.0
    return np.where(u <= 0.04045, u / 12.92, ((u + 0.055) / 1.055) ** 2.4)
LUM = np.array([0.2126, 0.7152, 0.0722])

PRESETS = {
    # render reads at the ev07/ev08-matched API cameras (1704x960 frames, shoot.mjs HIDE_UI)
    'ev07r': {'cap': '500,320,975,600', 'bed': 'auto-top', 'knit': '620,620,800,880', 'bag': '590,560,830,900'},
    'ev08r': {'cap': '335,350,765,668', 'bed': 'auto-top', 'knit': '400,700,560,900', 'bag': '350,650,600,960'},  # the two sanctioned frames (852x480): the boxes every seal figure was read with
    'ev07': dict(cap='270,200,575,365', bed='auto-top', knit='360,360,480,445', bag='330,345,530,470'),
    'ev08': dict(cap='10,160,300,310', bed='auto-top', knit='85,305,205,390', bag='40,300,260,400'),
}

def main():
    mode, path = sys.argv[1], sys.argv[2]
    pre = PRESETS.get(arg('--preset'), {})
    cap = box(arg('--cap', pre.get('cap'))); bed = arg('--bed', pre.get('bed')); knit = arg('--knit', pre.get('knit')); bag = arg('--bag', pre.get('bag'))
    a = np.array(Image.open(path).convert('RGB')); H = cv2.cvtColor(a, cv2.COLOR_RGB2HSV)
    rectify = '--rectify' in sys.argv
    Ys = a.astype(float) @ LUM                     # sRGB luma
    Yl = s2l(a.astype(float)) @ LUM                # linear-light luma
    x0, y0, x1, y1 = cap
    h, s, v = H[..., 0].astype(int), H[..., 1].astype(int), H[..., 2].astype(int)
    green = (h >= 35) & (h <= 95) & (s >= 60)
    capc = (~green) & (v >= 45) & (v <= 200) & (s <= 110)   # v <= 200: keeps the cream apron band out on renders
    cx = (x0 + x1) // 2
    rows = []
    for y in range(y0, y1):
        if not capc[y, cx]:
            rows.append((y, None, None)); continue
        l = cx; miss = 0
        while l > 0 and miss < 3:
            l -= 1; miss = miss + 1 if not capc[y, l] else 0
        l += miss
        r = cx; miss = 0
        while r < a.shape[1] - 1 and miss < 3:
            r += 1; miss = miss + 1 if not capc[y, r] else 0
        r -= miss
        rows.append((y, l, r))
    valid = [(y, l, r) for y, l, r in rows if l is not None and r - l > 20]
    if not valid:
        print('no cap silhouette found in the box'); return
    # top = the first row at >= 60 % of the widest row (the fold bead's own bright
    # crest can fall out of the cap class on a few rows and must not define the top)
    wall = max(r - l + 1 for y, l, r in valid)
    valid = [t for t in valid if t[0] >= next(y for y, l, r in valid if r - l + 1 >= 0.6 * wall)]
    top = valid[0][0]; bot = valid[-1][0]
    W = {y: r - l + 1 for y, l, r in valid}; L = {y: l for y, l, r in valid}; R = {y: r for y, l, r in valid}
    ys = sorted(W)
    topw = float(np.median([W[y] for y in ys if top + 6 <= y <= top + 14]))
    # crest search is capped at top + 0.7 x top width: the cap is never taller than
    # that, so a sock or an apron inside the box can no longer supply the 'lower-half
    # maximum' (render reads were box-dependent before this rule).  R1-FIX8 note: the
    # box-invariance this buys is CONDITIONAL on a sock narrower than the cap (as built
    # since R1-FIX7) or on a box that stops at the hem; a sock as wide as the cap under
    # a box that reaches it would still be read as the crest.
    # --crest-cap overrides the 0.7 for a camera whose cap is taller than that in
    # the image (the ev08-matched render: height/top 0.74); recorded per read
    ycap = top + int(float(arg('--crest-cap', 0.7)) * topw)
    lower = [y for y in ys if top + (ycap - top) * 0.45 < y <= ycap]
    wmax = max(W[y] for y in lower)
    crest = None
    for y in lower:
        if W[y] < 0.90 * wmax and y > top + (ycap - top) * 0.55:
            crest = y - 1; break
    if crest is None: crest = min(bot, ycap)
    hemw = float(np.median([W[y] for y in ys if crest - 9 <= y <= crest - 1]))
    print(f'== {mode} {path.split("/")[-1]}  cap box {cap}' + ('  [--rectify]' if rectify else ''))
    if rectify:
        # R1-FIX7 (verification B.2 / render reads): at the ev07-matched camera
        # the cap's top edge is TILTED in the image (the face recedes to one
        # side), so a single image row crosses the stitch row only over part of
        # its length and the dash census undercounts (3 of 7 built dashes on the
        # first R1-FIX7 render read).  Each column inside the top-width span is
        # rolled vertically so its own top edge (first 3 consecutive cap-class
        # rows) lands on the median top row: the stitch row, the plateau ROI and
        # the row band are then read parallel to the cap's edge.  Opt-in; the
        # photo presets are read without it and both readings are published.
        xl = int(np.median([L[y] for y in ys if top + 6 <= y <= top + 14])); xr = int(np.median([R[y] for y in ys if top + 6 <= y <= top + 14]))
        topcol = {}
        for x in range(xl, xr + 1):
            for yy in range(y0, y1 - 3):
                if capc[yy, x] and capc[yy + 1, x] and capc[yy + 2, x]: topcol[x] = yy; break
        tmed = int(np.median(list(topcol.values())))
        # the cover's END RETURNS and roll ends have their own top edge: columns
        # whose top departs from the straight-line fit by > 4 px are the ends,
        # and are blanked for the row census (they fragmented the first dash)
        xs_t = np.array(sorted(topcol)); ys_t = np.array([topcol[x] for x in xs_t])
        fit = np.polyval(np.polyfit(xs_t, ys_t, 1), xs_t); ends = [int(x) for x, yy, ff in zip(xs_t, ys_t, fit) if abs(yy - ff) > 4]
        if len(ends) > 0.3 * len(xs_t):
            # the frames' top edge is an ARC (the roll bows in perspective): a straight
            # fit blanks most of the span, so rectification is refused and the plain
            # read stands — --rectify is a render-camera read (tilted, straight top)
            print(f'  rectify REFUSED: {len(ends)} of {len(xs_t)} columns depart from a straight top edge by > 4 px (curved top); plain read follows')
            rectify = False
    if rectify:
        for x, ty in topcol.items():
            d = tmed - ty
            if d:
                Ys[:, x] = np.roll(Ys[:, x], d); Yl[:, x] = np.roll(Yl[:, x], d); a[:, x] = np.roll(a[:, x], d, axis=0)
        # the cover's END RETURNS (BC-06) present a lit leather sliver at each end of the
        # row; with the R1-FIX8 warm-grey leather (R/G 1.05) they pass the neutral cut, so
        # in rectify mode the outer 2 % of the span at each end is blanked as well
        ends = sorted(set(ends) | set(range(xl, xl + int(0.02 * (xr - xl)) + 1)) | set(range(xr - int(0.02 * (xr - xl)), xr + 1)))
        for x in ends: Ys[:, x] = 0; Yl[:, x] = 0
        if ends: print(f'  rectified: {len(ends)} end/return columns blanked (top-edge residual > 4 px, plus 2 % of the span at each end): {min(ends)}..{max(ends)}')
        # second stage — the stitch row itself is not parallel to the top edge in
        # a perspective view (the offset below the top is 12 mm, i.e. more pixels
        # at the near end), so the bright neutral pixels in the upper half are
        # fitted with a straight line and every column is rolled once more so
        # that line is horizontal.  The census below then reads one row.
        hh = crest - top
        cand = np.zeros(a.shape[:2], bool)
        cand[top + int(0.05 * hh):top + int(0.50 * hh), xl:xr + 1] = True
        neu = (a[..., 0].astype(float) <= 1.10 * np.maximum(1, a[..., 1].astype(float)))
        cand &= (Ys >= 1.35 * np.median(Ys[top + int(0.30 * hh):top + int(0.62 * hh), xl:xr + 1])) & ~green & neu
        yy_, xx_ = np.nonzero(cand)
        if len(xx_) > 50:
            k1, k0 = np.polyfit(xx_, yy_, 1)
            ymid = k1 * (xl + xr) / 2 + k0
            for x in range(xl, xr + 1):
                d = int(round(ymid - (k1 * x + k0)))
                if d:
                    Ys[:, x] = np.roll(Ys[:, x], d); Yl[:, x] = np.roll(Yl[:, x], d); a[:, x] = np.roll(a[:, x], d, axis=0)
            print(f'  rectified: stitch-line fit over {len(xx_)} bright neutral px: slope {k1:.4f} px/px (residual tilt {k1 * (xr - xl):.1f} px over the span), rolled level at row {ymid:.0f}')
        print(f'  rectified: top edge per column ran rows {min(topcol.values())}..{max(topcol.values())} over columns {xl}..{xr} (tilt {max(topcol.values()) - min(topcol.values())} px); columns rolled to row {tmed}')
    print(f'silhouette: top row {top}, hem crest row {crest}, bottom row {bot}; height top->crest {crest - top} px')
    print(f'  width profile (y:width left..right) every 8 rows:', ', '.join(f'{y}:{W[y]}({L[y]}..{R[y]})' for y in ys[::8]))
    print(f'  TOP width {topw:.0f} px  HEM width {hemw:.0f} px  FLARE hem/top = {hemw / topw:.3f}   height/top = {(crest - top) / topw:.3f}')
    # green tabs outboard of the silhouette, per row band
    def grun(y, x, step):
        n = 0
        while 0 <= x < a.shape[1] and green[y, x]: n += 1; x += step
        return n
    for lab, ya, yb in (('top quarter', top, top + (crest - top) // 4), ('mid', top + (crest - top) // 4, top + 3 * (crest - top) // 4), ('lower quarter', top + 3 * (crest - top) // 4, crest)):
        gl = [grun(y, L[y] - 1, -1) for y in ys if ya <= y < yb]; gr = [grun(y, R[y] + 1, 1) for y in ys if ya <= y < yb]
        if gl: print(f'  green run outboard, {lab:13s}: left med {np.median(gl):.0f} px  right med {np.median(gr):.0f} px  (as frac of top width {np.median(gl) / topw:.3f} / {np.median(gr) / topw:.3f})')
    # plateau (leather face)
    fy0 = top + int(0.30 * (crest - top)); fy1 = top + int(0.62 * (crest - top))
    cols = []
    for y in range(fy0, fy1):
        if y in W:
            sh = int(0.12 * W[y]); cols.append((y, L[y] + sh, R[y] - sh))
    face = np.zeros(a.shape[:2], bool)
    for y, l, r in cols: face[y, l:r + 1] = True
    colmean = np.array([Ys[fy0:fy1, x][face[fy0:fy1, x]].mean() for x in range(min(c[1] for c in cols), max(c[2] for c in cols) + 1) if face[fy0:fy1, x].any()])
    thr = np.percentile(colmean, 80)
    xs_all = [x for x in range(min(c[1] for c in cols), max(c[2] for c in cols) + 1) if face[fy0:fy1, x].any()]
    plateau_cols = [x for x, m in zip(xs_all, colmean) if m <= thr]
    pm = np.zeros_like(face); 
    for x in plateau_cols: pm[fy0:fy1, x] = face[fy0:fy1, x]
    face_rgb = a[face].mean(0); plat_rgb = a[pm].mean(0)
    plat_s = float(np.median(Ys[pm])); plat_l = float(np.median(Yl[pm]))
    print(f'face ROI rows {fy0}..{fy1}: mean sRGB {face_rgb.round(0).tolist()} luma {Ys[face].mean():.1f}; PLATEAU (brightest 20 % of columns dropped): sRGB {plat_rgb.round(0).tolist()} luma med {plat_s:.1f} linear {plat_l:.4f}; column luma range {colmean.min():.0f}..{colmean.max():.0f}')
    if bed in ('auto', 'auto-top'):
        # bed = every lit green-cloth pixel in the frame (H 35..95, S >= 80, V >= 80);
        # auto-top restricts it to the upper 40 % of the frame = the bed beyond the rail
        gm = (h >= 35) & (h <= 95) & (s >= 80) & (v >= 80)
        if bed == 'auto-top': gm[int(0.4 * a.shape[0]):] = False
        bs = float(np.median(Ys[gm])); bl = float(np.median(Yl[gm])); brgb = a[gm].mean(0)
        print(f'bed = {bed} green mask ({int(gm.sum())} px):', end=' ')
        print(f'sRGB {brgb.round(0).tolist()} luma med {bs:.1f} linear {bl:.4f};  plateau/bed  sRGB {plat_s / bs:.3f}  linear {plat_l / bl:.3f};  face(all)/bed sRGB {Ys[face].mean() / bs:.3f};  per-channel plateau/bed {(plat_rgb / brgb).round(2).tolist()}')
    elif bed:
        bx0, by0, bx1, by1 = box(bed); bs = float(np.median(Ys[by0:by1, bx0:bx1])); bl = float(np.median(Yl[by0:by1, bx0:bx1])); brgb = a[by0:by1, bx0:bx1].reshape(-1, 3).mean(0)
        print(f'bed ROI {bed}: sRGB {brgb.round(0).tolist()} luma med {bs:.1f} linear {bl:.4f};  plateau/bed  sRGB {plat_s / bs:.3f}  linear {plat_l / bl:.3f};  face(all)/bed sRGB {Ys[face].mean() / bs:.3f};  per-channel plateau/bed {(plat_rgb / brgb).round(2).tolist()}')
    # stitch row
    # the thread row: skip the fold bead (top 10 % of the cap height) and pick the row
    # with the MOST bright runs (dashes), not the most bright pixels (that is the bead)
    up0, up1 = top + int(0.10 * (crest - top)), top + int(0.40 * (crest - top))
    # R1-FIX7: the dash class excludes GREEN pixels — on renders the lit cloth
    # flanks beside the cover pass the luma cut and were entering the dash
    # chroma/ratio (dash mean read green, R/G 0.94, on a white thread); the
    # frames' tabs are dark (V 25-36) and never passed it, so photo reads hold.
    # ...and requires a NEUTRAL pixel (R/G <= 1.10): the thread is white cotton in
    # both frames (R/G 0.99 / 0.98); on renders the cover's lit end returns
    # (leather, R/G ~1.2) crossed the band at the row's ends and fragmented the
    # first dash.  Both frames' leather is 1.04 / 1.06 and never bright there.
    neutral = (a[..., 0].astype(float) <= 1.10 * np.maximum(1, a[..., 1].astype(float)))
    bright = (Ys >= plat_s * 1.35) & ~green & neutral
    Ysd = np.where(green | ~neutral, 0.0, Ys)   # the same exclusions for the row-band profile
    def nruns(y):
        cb = bright[y, L[y]:R[y] + 1].astype(np.uint8)
        cb = cv2.morphologyEx(cb.reshape(1, -1), cv2.MORPH_CLOSE, np.ones((1, 3), np.uint8)).ravel()
        n = 0; x = 0
        while x < len(cb):
            if cb[x]:
                xs = x
                while x < len(cb) and cb[x]: x += 1
                if x - xs >= 4: n += 1
            else: x += 1
        return n
    cnt = [(y, nruns(y)) for y in range(up0, up1) if y in W]
    yrow = max(cnt, key=lambda t: t[1])[0]
    band = slice(yrow - 2, yrow + 3)
    span_l, span_r = L[yrow], R[yrow]
    # dash census by luma MINIMA: the video's compression fills 2-3 mm gaps, so a
    # threshold merges dashes; the gaps survive as dips.  Row-band max luma per
    # column, smoothed sigma 1.5 px; a gap = a local minimum inside the bright
    # span (luma >= plateau x 1.2) with prominence >= 6 % of the plateau against
    # both neighbouring maxima; dashes = gaps + 1, centres between gaps.
    prof = Ysd[band, span_l:span_r + 1].max(0)
    prof = cv2.GaussianBlur(prof.reshape(1, -1).astype(np.float32), (0, 0), 1.5).ravel()
    on = prof >= plat_s * 1.2
    dash_med = float(np.median(prof[on])) if on.any() else plat_s
    xs_on = np.where(on)[0]
    sp0, sp1 = (int(xs_on.min()), int(xs_on.max())) if len(xs_on) else (0, len(prof) - 1)
    gaps = []
    for x in range(sp0 + 3, sp1 - 2):
        if prof[x] < prof[x - 1] and prof[x] <= prof[x + 1]:
            lmax = prof[max(sp0, x - 12):x].max(); rmax = prof[x + 1:min(sp1, x + 13) + 1].max()
            # R1-FIX7: a gap must also drop by >= 20 % of the row's own thread
            # excursion (dash median - plateau): on renders the crisp sub-pixel
            # ridge fluctuates by 6-12 levels along a dash and the 6 %-of-plateau
            # floor alone read 16 "dashes" on a 7-dash build; both frames still
            # read 7/7 under the added condition (their shallowest gap clears it).
            if min(lmax, rmax) - prof[x] >= max(0.06 * plat_s, 0.20 * (dash_med - plat_s)) and (not gaps or x - gaps[-1] > 6):
                gaps.append(x)
    edges = [sp0] + gaps + [sp1]
    runs = [(edges[i] + span_l, edges[i + 1] + span_l) for i in range(len(edges) - 1)]
    cents = [(s_ + e_) / 2 for s_, e_ in runs]; lens = [e_ - s_ for s_, e_ in runs]
    pitch = float(np.median(np.diff(cents))) if len(cents) > 1 else float('nan')
    rw = W[yrow]
    gapw = float(np.median([int((prof[max(0, g - 6):g + 7] < plat_s * 1.2).sum()) for g in gaps])) if gaps else float('nan')
    dash_px = Ys[band, span_l:span_r + 1][bright[band, span_l:span_r + 1]]
    dash_pl = Yl[band, span_l:span_r + 1][bright[band, span_l:span_r + 1]]
    print(f'stitch row: y {yrow} = {yrow - top} px below top = {(yrow - top) / topw:.3f} of top width; local cap width {rw} px')
    print(f'  dashes n={len(runs)} (gaps at {[g + span_l for g in gaps]}) centres {[round(c) for c in cents]} lengths {lens}; pitch {pitch:.1f} px = {pitch / rw:.4f} of local width = {pitch / topw:.4f} of top width; bright span {sp1 - sp0 + 1} px = {(sp1 - sp0 + 1) / rw:.3f} of local width; median gap {gapw:.1f} px -> duty {1 - gapw / pitch if pitch == pitch else float("nan"):.2f}')
    print(f'  thread/plateau: sRGB median {np.median(dash_px) / plat_s:.2f}x (p90 {np.percentile(dash_px, 90) / plat_s:.2f}x)   LINEAR median {np.median(dash_pl) / plat_l:.2f}x (p90 {np.percentile(dash_pl, 90) / plat_l:.2f}x)')
    drgb = a[band, span_l:span_r + 1][bright[band, span_l:span_r + 1]].astype(float)
    if len(drgb):
        dm = drgb.mean(0); print(f'  thread chroma: dash sRGB mean {dm.round(0).tolist()} R/G {dm[0] / dm[1]:.3f} B/G {dm[2] / dm[1]:.3f}  (plateau R/G {plat_rgb[0] / plat_rgb[1]:.3f} B/G {plat_rgb[2] / plat_rgb[1]:.3f})')
    if bag:
        # render knit is greyer and darker than the frames' white cotton (its
        # class defaults: S <= 25 keeps the cream apron out, V >= 45 admits the
        # dark crossings, tolerance 10 px spans a 7.3 mm course cell)
        rdef = mode == 'render'
        bag_read(a, h, s, v, Ys, box(bag), hemw, crest, topw,
                 sat=int(arg('--bag-sat', 25 if rdef else 60)), val=int(arg('--bag-val', 45 if rdef else 80)), missmax=int(arg('--bag-miss', 10 if rdef else 4)))
    if knit:
        kx0, ky0, kx1, ky1 = box(knit); g = Ys[ky0:ky1, kx0:kx1]; gh = g - cv2.GaussianBlur(g, (0, 0), 6)
        def acpk(gg, axis):
            out = []
            for lag in range(1, 60):
                aa = gg[:, :-lag] if axis == 1 else gg[:-lag, :]; bb = gg[:, lag:] if axis == 1 else gg[lag:, :]
                out.append(np.mean(aa * bb) / np.mean(gg * gg))
            pk = [l + 1 for l in range(1, 58) if out[l] > out[l - 1] and out[l] >= out[l + 1]]
            return pk[:3]
        # course rhythm depth: autocorrelation VALUE at the first vertical peak
        gv = [np.mean(gh[:-l, :] * gh[l:, :]) / np.mean(gh * gh) for l in range(1, 40)]
        pkv = [l + 1 for l in range(1, 38) if gv[l] > gv[l - 1] and gv[l] >= gv[l + 1]]
        if pkv: print(f'knit course rhythm: first vertical autocorr peak at {pkv[0]} px, value {gv[pkv[0] - 1]:.3f}')
        print(f'knit {knit}: sRGB mean {a[ky0:ky1, kx0:kx1].reshape(-1, 3).mean(0).round(0).tolist()} luma p10/p50/p90 {np.percentile(g, 10):.0f}/{np.percentile(g, 50):.0f}/{np.percentile(g, 90):.0f} (p90/p10 {np.percentile(g, 90) / np.percentile(g, 10):.2f}); autocorr peaks px: wale {acpk(gh, 1)} course {acpk(gh, 0)}')

def bag_read(a, h, s, v, Ys, bagbox, hemw, crest, topw, sat=60, val=80, missmax=4):
    x0, y0, x1, y1 = bagbox
    knitc = (s <= sat) & (v >= val) & ~((h >= 35) & (h <= 95) & (s >= 60))   # light, low-chroma knit
    print(f'bag class: S <= {sat}, V >= {val}, non-green; run tolerance {missmax} px')
    cx = (x0 + x1) // 2
    rows = []
    for y in range(y0, y1):
        if not knitc[y, cx]: rows.append((y, None)); continue
        l = cx; miss = 0
        while l > 0 and miss < missmax: l -= 1; miss = miss + 1 if not knitc[y, l] else 0
        l += miss; r = cx; miss = 0
        while r < a.shape[1] - 1 and miss < missmax: r += 1; miss = miss + 1 if not knitc[y, r] else 0
        r -= miss; rows.append((y, r - l + 1))
    wv = [(y, w) for y, w in rows if w]
    if not wv: print('bag: no knit silhouette in the box'); return
    ya = wv[0][0]
    def med(y0_, y1_):
        vals = [w for y, w in wv if y0_ <= y < y1_]; return float(np.median(vals)) if vals else float('nan')
    d = 0.25 * topw
    w_top = med(ya, ya + 6); w_q = med(ya + int(0.5 * d), ya + int(0.5 * d) + 6); w_h = med(ya + int(d), ya + int(d) + 6)
    print(f'bag: knit silhouette first row {ya} ({ya - crest} px below the hem crest); width at +0..6 px {w_top:.0f}, at +{0.5 * d:.0f} px {w_q:.0f}, at +{d:.0f} px {w_h:.0f}  -> bag/hem width {w_top / hemw:.3f} / {w_q / hemw:.3f} / {w_h / hemw:.3f}; bag/top width {w_top / topw:.3f}')
    prof = ', '.join(f'{y}:{w}' for y, w in wv[::6][:14]); print(f'  bag width profile: {prof}')
    # R1-FIX10 (order item b, "measured ev07/ev08 fold spacing"): the knit's
    # vertical rib / fold pitch right under the hem — horizontal autocorrelation
    # of the per-column luma over the band from +3 to +45 px below the first
    # knit row, inside the silhouette (3 px margin), detrended by a 15 px
    # running mean; the first local maximum of the autocorrelation is the
    # pitch in px, printed also in mm at the frame's own hem scale (hem width
    # px = 2 x BC-01 = 90 mm, the same scale every other bag figure uses).
    rows_b = [(y, w) for y, w in wv if ya + 3 <= y < ya + 45]
    if len(rows_b) >= 20:
        lft = min(cx - w // 2 for _, w in rows_b) + 3; rgt = max(cx + w // 2 for _, w in rows_b) - 3
        band = Ys[ya + 3:ya + 45, lft:rgt].astype(float); band = band - band.mean(0, keepdims=True)
        pr = band.mean(0); pr = pr - np.convolve(pr, np.ones(15) / 15, 'same')
        ac = np.correlate(pr, pr, 'full')[len(pr) - 1:]; ac = ac / ac[0] if ac[0] else ac
        pk = [i for i in range(2, min(len(ac) - 1, 60)) if ac[i] > ac[i - 1] and ac[i] >= ac[i + 1]]
        if pk:
            pmm = pk[0] / (hemw / 90.0) if hemw else float('nan')
            print(f'  bag rib pitch: horizontal autocorr peaks at {pk[:3]} px (values {[round(float(ac[i]), 3) for i in pk[:3]]}); first peak {pk[0]} px = {pmm:.1f} mm at the hem scale ({hemw} px = 90 mm); band rows {ya + 3}..{ya + 45}, cols {lft}..{rgt}')
        else:
            print('  bag rib pitch: no autocorrelation peak')

if __name__ == '__main__':
    main()
