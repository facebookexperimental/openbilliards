# Copyright (c) Meta Platforms, Inc. and affiliates.

# build-cn8-photo-tex.py — generates web/scene/cn8phototex.js: the GH-490
# Chinese-8 apron FLAME-PANEL figure field.  ROUND-18 (gate r16 verdict
# c5264019553 P1-1): the round-17 pith-distance GRAMMAR landed (zero
# dedicated rings, fig-vert at the photo family) but the PRESENTATION
# did not — the map normalized to the round-15 symmetric value law
# (mean 181 / spread 84) rendered a uniform mid-crimson full-height
# motif field (render rows flat 36-45, in-apron p95 59.6) where the
# photo is a mostly-dark facade carrying a narrow, shallow, LONG flame
# sweep with specular pooling (in-apron p05/p95 9.4/85.5).
#
# The photo's apron is measurably a TWO-PART build (cdmasters color
# decomposition, this round: beam rows V_med 16-24 at darkred-mask
# fraction 0.07-0.34 — near-black and OUT of the crimson family — vs
# panel rows V_med 40-64 at S_med 96, darkred fraction 0.60-0.64):
#   (1) a near-black BEAM (badge carrier, top ~0.375 of the face) and
#   (2) a crimson FLAME PANEL below it, top-lit with a bright crest
#       plateau (~10 photo rows) decaying into shadow (~29 mm).
# Round-18 mirrors that construction where it lives: the beam is
# GEOMETRY (table.js cn8 blind split, near-black beamMat — exactly the
# photo's out-of-family read), and THIS map is the PANEL ONLY.
#
# The panel keeps the round-17 pith-distance grammar unchanged:
#
#     R(x, y) = sqrt((y - yc(x))^2 + zc(x)^2)
#
# (figure lines = isolines of R — growth cones cut by the board face;
# open nested V/U feathers away from crowns; small CROWN-EYE lenses at
# the zc minima; the CLOSURE CHECK below still fails the build on any
# dedicated oval ring) and replaces the round-15 symmetric
# normalization with the measured TOP-LIT law:
#
#   lum = (PANEL_BOT + (PANEL_TOP - PANEL_BOT) * lit(y) * pool_mod)
#         * (1 - line * carve(lit))            - stri - fine terms
#   lit(y) = exp(-max(0, y - PLATEAU) / TAU)
#
# — the crest plateau + exponential falloff the photo's own row
# profile shows (crest rows 502-512 hold 55-72, then decay to 40 over
# ~10 rows ~ 29 mm), specular pooling riding the lit zone, figure
# lines carving multiplicatively (Weber: legible where lit, fading
# toward the shadowed foot).  The sweep is long and shallow because
# the pith trace wanders slowly (LONG-window scan profile, small
# amplitude); crowns flare where zc dips.  Every profile is sampled
# from the CC0 scan's own luma (no noise function authors any shape):
#   yc  pith trace       = column means rows 128-481, 121-box (LONG
#                          window), x +-8 px + rows 545-898, 31-box,
#                          x +-1.8 px (wiggle) — the r16-gate "shallow
#                          long sweep" prescription (round-17 29/6 px
#                          on the old ruler authored the steep
#                          full-height motifs the r16 gate failed)
#   zc  crown depth      = column means rows 898-1058, 11-box,
#                          2.5 + 41.5 * clip(0.5+0.5s)^3.0 px (the
#                          wide range — ZHI must EXCEED the first
#                          line radius FIGDIV*PITCH=36 px so deep-pith
#                          columns interrupt the innermost figure
#                          lines (measured: ZHI 26 < 36 closed one
#                          dedicated ring); dips = crown flares/
#                          tongues); ring irregularity
#                          gains a juvenile-wood boost near the pith
#                          (+0.50 * exp(-R/48) ring units — chops the
#                          innermost isoline tubes into crown-eye-
#                          scale lenses, measured by the closure
#                          check: without it, 2-4 dedicated rings)
#   ring irregularity    = row-mean sequence, 9-box, +-0.35 ring units
#   pooling (chatoyance) = (a) aspect-corrected raw-scan crop
#                          (rows 600-830 x cols 0-2046 -> 512x144:
#                          round blobs), 41-box; (b) the row-mean
#                          sequence sampled ALONG the ring coordinate
#                          (arc-following pools), 21-box — both feed
#                          pool_mod, clipped ASYMMETRICALLY (0.78-1.45:
#                          the crest stays continuously lit like the
#                          photo's sweep; pools are EXTRA shine, not
#                          holes)
#   fine grain           = the scan's own 15-px high-pass, x0.5
#
#   python3 tools/render/build-cn8-photo-tex.py <pack-refs-dir> [scan.jpg]
#
# FACADE TARGETS (round-18; instrument derivation in gestalt_490.py at
# ARENA_DRAMA_MIN / ARENA_BAND_MAX — the two r16-prescribed
# replacement-bounding legs, constants from the flame-pure photo
# reads): photo in-apron facade profile (cdmasters (111,466)-(583,526),
# dark-inclusive mask, 3-row-smoothed row medians): ground p10 15.7,
# crest p98 65.9, DRAMA 50.1 (box family 47.3-50.9), half-max band
# fraction 0.200 (family 0.188-0.214).  Render targets: beam ~15-19 V
# (geometry, out of the darkred mask like the photo's own beam), panel
# crest ~55-60 V, drama >= 1.5x the 25.0 floor, band fraction
# 0.15-0.22 (ceiling 0.24).
#
# PROVENANCE (the pocket-furniture provenance law):
#   element | source | basis
#   arena apron flame | Poly Haven "dark_wood" scan (CC0 1.0,
#     https://polyhaven.com/a/dark_wood; working copy
#     dark_wood_diff_2k.jpg, sha256 printed on generation — the
#     build-cloth-detail.py terlenka vendoring precedent) | pith-
#     distance isoline field + top-lit panel law of the scan's own
#     luma profiles (above)
#   cdmasters_1.png (pack refs/, China Daily press photo) |
#     MEASUREMENT-ONLY | statistic targets (facade drama/band family,
#     two-part build decomposition, sfr 0.595-0.619 family, rendered
#     fig-vert 0.343 flame-pure, V-law) — no press-photo pixel ships
#     (review r16-r3 P1: the repo third-party-imagery bar,
#     docs/opensource-prep/curation-proposal.md)
#
# Scale chain (ROUND-18: the map now spans the PANEL, not the full
# face): repeat 1.0 over the end panel (1.50 m x 0.1625 m => 512 px =
# 0.341 px/mm horizontal, 144 px = 0.886 px/mm vertical).  The 2 K
# scan (~1.2 m tile) is resampled anisotropically to that sampling
# (409 x 1063) before the field decomposition, so ring pitch
# (13 px base ~ 15 mm vertical) and grain land at PHYSICAL scale.
# Crest plateau 24 px ~ 27 mm + TAU 15 px ~ 17 mm decay: the photo's
# own crest->body profile at its 0.349 px/mm ruler.
#
# Measured acceptance at map level (round-18 targets; every step
# prints its read): facade preview (crest/foot/plateau-fraction),
# sfr(3.6mm/14.4mm physical lags per axis) 0.45-0.62, Sobel aniso
# 0.9-6,
# grammar preview vert-frac >= 0.15 on the 2 mm-square resample
# (rendered floor 0.17 = cdmasters flame-pure 0.343 x 0.5 —
# gestalt_490.py ARENA_VERT_MIN derivation).
#
# The BOOT leather was evaluated for a photo basis and RULED OUT,
# recorded here: the q8pro stamp-free patch (250,290)-(450,340)
# residual is JPEG/macroblock-dominated at 4x magnification —
# compression texture, not leather grain (gate r15 P2 measured the
# periodicity evidence at y-grid phase 1.17x median with the x/lag-8
# axis weak; the ruling rides the compression-dominance read, not a
# strong periodic-lattice claim).  Baking it would ship compression
# artifacts as material.  The boot stays procedural (0.62-0.94 mm
# stipple, table.js), bounded by the round-16 whole-face coherence leg.
import base64
import hashlib
import json
import pathlib
import sys

import numpy as np
from PIL import Image

# GH-490 round-19 (gate r17 P2-1, the no-stale-figures law reaching
# the generator): the GEN record was stdout-only and got hand-carried
# into round-18's gen json (sfr 0.502/vertfrac 0.331 vs the machine's
# 0.501/0.328; "sha 9979d49a" reproducible as no current digest).
# `--gen-json PATH` writes the SAME payload as the GEN_JSON stdout
# line, plus the written module's own sha256 (out_sha256 — hex
# identifiers pass the record renderer's numeric lexer by design, so
# only tokenization can guard them), for
#   render_490_record.py --json gen=PATH
GEN_JSON_PATH = None
if '--gen-json' in sys.argv:
    _gi = sys.argv.index('--gen-json')
    GEN_JSON_PATH = pathlib.Path(sys.argv[_gi + 1])
    del sys.argv[_gi:_gi + 2]

REFS = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else
                    '/tmp/ob-490-refs')
SCAN = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else
                    '/tmp/ob-490r16/cc0/dark_wood_2k.jpg')
OUT = pathlib.Path(__file__).resolve().parents[2] / 'web/scene/cn8phototex.js'

MAP_W, MAP_H = 512, 144
SRC_W, SRC_H = 409, 1063     # 2048 px @1.71 px/mm -> panel sampling
HWRAP = 24
Y0 = 481                     # window row into the resampled scan
K_FINE = 15                  # ~17 mm high-pass (fine grain kernel)
# panel constants (derivation in the header; solved against the
# round-18 facade/map targets — the r16-gate prescription: shallow
# LONG sweep, reduced motif scale/repetition, dark facade + narrow
# bright crest)
TRACE_Y = 34.0               # pith trace height (map rows; INSIDE the
                             # lit crest — the photo's own swirl/crown
                             # region rides its bright band; feathers
                             # sweep DOWN the panel from it)
WAND, WIG = 8.0, 1.8         # pith wander / wiggle amplitude (px)
HCROWN = 26.0                # crown locality (px ~ 29 mm): rings past
                             # this distance from the trace flatten to
                             # the broad depth baseline
ZLO, ZHI, ZEXP = 2.5, 44.0, 3.0   # crown depth law (px) — the r17-
                             # proven wide range: deep-pith columns
                             # interrupt the inner figure lines
GROW_PITH = 0.50             # juvenile-wood irregularity boost near
                             # the pith (chops inner tubes into
                             # crown-eye-scale lenses — measured)
PITCH = 13.0                 # base ring pitch (px vertical ~ 15 mm)
GROW = 0.42                  # ring-spacing irregularity (ring units)
FIGDIV = 2.4                 # figure lines every FIGDIV rings (r17 2.5
                             # — fewer repeated lines, r16-gate scale/
                             # repetition item)
KNEE, SHP, PSHARP = 0.70, 1.1, 1.4   # round-18 bold-swath pulse: the
                             # photo's flame is composed of WIDE dark
                             # latewood swaths between wide bright
                             # tongues (~15-40 mm) — thin 3-5 mm lines
                             # vanish under the instrument's 9 mm
                             # smoothing (measured: vertfrac 0.004)
PANEL_TOP = 285.0            # lit crest (map units, pre-shoulder)
PANEL_BOT = 150.0            # shadowed foot (map units) — also the
                             # legs' boundary floor: the C2/R4 leg
                             # boxes see the panel foot behind the
                             # gold silhouette, and the cloth-bounce
                             # ambient G pedestal there is ~55 rendered
                             # REGARDLESS of exposure (measured caps
                             # 5-7), so the foot's rendered R must
                             # stay >= ~85 or the sliver's hue crosses
                             # 25 deg into the FROZEN legs Au window
                             # and apron texture reads as leg streak
                             # (measured: foot 108-130 -> streak_c2
                             # 4.75-5.73 red; 150 held until the
                             # review-r4 wrapT clamp exposed the true
                             # foot at the sliver -> 4.70 red; a flat
                             # 162 fixed the legs but pushed the decay
                             # tail over the band threshold ->
                             # 0.262/0.254 red — the FOOT LIP below
                             # decouples the two)
PLATEAU = 22.0               # crest plateau rows (~25 mm — photo)
TAU = 10.0                   # falloff rows (~11 mm; solves the band-
                             # narrowness leg against the 0.24 ceiling
                             # jointly with the legs' foot-R floor —
                             # captures 1-8: tau 15 read 0.254/0.246,
                             # tau 11.5 with the raised foot read
                             # 0.254/0.246 again; the pair (tau 10,
                             # plateau 22) closes both)
POOL_F, POOL_R = 0.24, 0.30  # pool_mod weights (arc-following / round)
                             # (0.50 @ F*19 phase measured as per-ring
                             # blotch bands — pools are BROAD)
WAVY = 0.55                  # interlocked-grain curl amplitude (ring
                             # units; scan band-pass 10-35 mm — see
                             # the waviness note at F)
LINE_CARVE_LO, LINE_CARVE_HI = 0.26, 0.52  # multiplicative line carve
                             # (Weber: legible figure where lit,
                             # subdued toward the shadowed foot)
STRI_W = 4.0                 # subordinate striation, lit-gated
FINE_AMP = 0.35
CLAMP_LO, CLAMP_HI = 20, 255


def boxmean(fld, k):
    p = k // 2
    pp = np.pad(fld, ((p, p), (p, p)), mode='wrap')
    k1 = np.ones(k) / k
    b = np.apply_along_axis(lambda c: np.convolve(c, k1, mode='valid'),
                            0, pp)
    return np.apply_along_axis(lambda c: np.convolve(c, k1, mode='valid'),
                               1, b)


def prof1d(sig, k):
    k1 = np.ones(k) / k
    p = np.convolve(np.pad(sig, k // 2, mode='wrap'), k1, mode='valid')
    return (p - p.mean()) / max(p.std(), 1e-9)


def sfr(fld, mm1=3.6, mm2=14.4):
    """Physical-lag structure-function ratio at the PANEL's
    anisotropic ruler (0.886 px/mm vertical, 0.341 px/mm horizontal)
    — the round-17 2px/8px proxy assumed the old 0.554 px/mm face
    ruler and mis-measured this map by ~1.6x vertically."""
    o = []
    for mm in (mm1, mm2):
        dv = max(1, int(round(mm * 0.886)))
        dh = max(1, int(round(mm * 0.341)))
        dy = fld[dv:, :] - fld[:-dv, :]
        dx = fld[:, dh:] - fld[:, :-dh]
        o.append(float(np.sqrt((np.concatenate([dy.ravel(), dx.ravel()])
                                ** 2).mean())))
    return o[0] / max(o[1], 1e-9)


def sobel_aniso(field):
    p = np.pad(field, 1, mode='reflect')
    gx = ((p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:])
          - (p[:-2, :-2] + 2 * p[1:-1, :-2] + p[2:, :-2]))
    gy = ((p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:])
          - (p[:-2, :-2] + 2 * p[:-2, 1:-1] + p[:-2, 2:]))
    return float(np.abs(gy).mean() / max(np.abs(gx).mean(), 1e-9))


def vert_frac_preview(field):
    """Grammar preview at map level: 2 mm-square resample (750x81 over
    the 1.50x0.1625 m panel), 10 mm box smooth, gradient-energy
    fraction with |gx|>|gy| above the median gradient (the
    gestalt_490.py fig_vert law on the map's own pixels)."""
    im = Image.fromarray(np.clip(field, 0, 255).astype(np.uint8))
    sq = np.asarray(im.resize((750, 81), Image.LANCZOS), dtype=float)
    k = 5
    p = k // 2
    pp = np.pad(sq, ((p, p), (p, p)), mode='edge')
    k1 = np.ones(k) / k
    sm = np.apply_along_axis(lambda c: np.convolve(c, k1, mode='valid'), 0, pp)
    sm = np.apply_along_axis(lambda c: np.convolve(c, k1, mode='valid'), 1, sm)
    gx = np.zeros_like(sm)
    gy = np.zeros_like(sm)
    gx[:, 1:-1] = (sm[:, 2:] - sm[:, :-2]) / 2
    gy[1:-1, :] = (sm[2:, :] - sm[:-2, :]) / 2
    gmag = np.hypot(gx, gy)
    core = np.zeros(sm.shape, bool)
    core[3:-3, 3:-3] = True
    thr = np.percentile(gmag[core], 50)
    sel = core & (gmag > thr)
    e = gmag[sel] ** 2
    vert = (np.abs(gx) > np.abs(gy))[sel]
    return float((e * vert).sum() / max(e.sum(), 1e-9))


def facade_preview(field):
    """Round-18 panel preview (map level): 3-row-smoothed row-median
    profile; crest = p98, foot = p10, plus the half-max row fraction
    OF THE PANEL (the full-face band fraction adds the geometry beam:
    ~0.63 x this figure once the beam ground replaces the panel
    foot in the FWHM base — the render-side instrument is the law)."""
    prof = np.median(field, axis=1)
    k1 = np.ones(3) / 3
    sm = np.convolve(np.pad(prof, 1, mode='edge'), k1, mode='valid')
    foot = float(np.percentile(sm, 10))
    crest = float(np.percentile(sm, 98))
    band = float((sm >= foot + (crest - foot) / 2).mean())
    return foot, crest, crest - foot, band


scan_sha = hashlib.sha256(SCAN.read_bytes()).hexdigest()
raw = np.asarray(Image.open(SCAN).convert('L'), dtype=float)
src = np.asarray(Image.open(SCAN).convert('L').resize((SRC_W, SRC_H),
                                                      Image.LANCZOS),
                 dtype=float)
print(f'scan {SCAN.name} sha256 {scan_sha[:16]} resampled '
      f'{SRC_W}x{SRC_H}')

# 1. wrap-tile to map width with a cross-fade at the wrap seam
xs = np.arange(MAP_W + HWRAP) % SRC_W
big = src[:, xs]
t = (np.arange(HWRAP) + 0.5) / HWRAP
tile = big[:, :MAP_W].copy()
tile[:, :HWRAP] = (tile[:, :HWRAP] * t[None, :]
                   + big[:, MAP_W:MAP_W + HWRAP] * (1 - t[None, :]))

# 2. scan-derived profiles (header table; windows scaled to the panel
# ruler — x1.603 of the round-17 rows)
colsA = prof1d(tile[128:481, :].mean(axis=0), 121)
colsB = prof1d(tile[545:898, :].mean(axis=0), 31)
colsC = prof1d(tile[898:1058, :].mean(axis=0), 11)
rowsP = prof1d(tile.mean(axis=1), 21)
rowsG = prof1d(tile.mean(axis=1), 9)
fineF = tile - boxmean(tile, K_FINE)
fine = fineF[Y0:Y0 + MAP_H, :] / max(fineF.std(), 1e-9)
# round pooling: aspect-corrected raw-scan crop (blob aspect ~1 at the
# round-17 ruler; ~1.6x flatter at the panel ruler — smooth pools,
# recorded) with the same wrap cross-fade, then 41-box
poolw = np.asarray(Image.fromarray(raw[600:830, 0:2046].astype(np.uint8))
                   .resize((MAP_W, MAP_H), Image.LANCZOS), dtype=float)
poolw[:, :HWRAP] = (poolw[:, :HWRAP] * t[None, :]
                    + poolw[:, MAP_W - HWRAP:MAP_W][:, ::-1]
                    * (1 - t[None, :]))
pool_round = boxmean(poolw, 41)
pool_round = (pool_round - pool_round.mean()) / max(pool_round.std(), 1e-9)

# 3. pith-distance figure field (grammar UNCHANGED from round-17 — the
# r16 gate: "keep the pith-distance grammar"; only the pith-trace
# PROFILES move to the shallow-long-sweep solve)
yy = np.arange(MAP_H)[:, None] * np.ones((1, MAP_W))
yc = TRACE_Y + colsA[None, :] * WAND + colsB[None, :] * WIG
zc = ZLO + (ZHI - ZLO) * np.clip(0.5 + 0.5 * colsC, 0, 1)[None, :] ** ZEXP
# a crown is a LOCAL bump on the pith axis, not an infinite column:
# rings far from the trace flatten back to the broad depth baseline
# (a constant-per-column zc was measured to stamp full-height pillar
# stacks at every crown — the repeated-motif class; the photo's
# crowns hook the crest locally while the deeper streaks flow through)
_k101 = np.ones(101) / 101
zc_deep = np.convolve(np.pad(zc[0], 50, mode='wrap'), _k101,
                      mode='valid')[None, :]
zc_eff = zc_deep + (zc - zc_deep) * np.exp(
    -((yy - yc) / HCROWN) ** 2)
R = np.sqrt((yy - yc) ** 2 + zc_eff ** 2)
F0 = R / PITCH
grow_eff = GROW + GROW_PITH * np.exp(-R / 48.0)  # juvenile wood: ring
                                                 # irregularity is
                                                 # strongest near the
                                                 # pith
F = F0 + grow_eff * np.interp((F0 * 17.0) % len(rowsG),
                              np.arange(len(rowsG)), rowsG)
# interlocked-grain waviness (round-18, measured necessity): shallow
# smooth isolines carry ~zero off-horizontal tangent energy (vertfrac
# 0.003-0.004 through the instrument's 9 mm smoothing) while the
# photo's shallow flame reads 0.343 — its swath edges CURL locally.
# The curl is sampled from the scan's own 2-D band-passed luma
# (17-50 mm class — the 10-35 mm first cut saturated D(3.6mm) and
# red-fired the sfr preview at 0.74), never an authored noise
# function.
_wavF = tile[Y0:Y0 + MAP_H, :]
_wav = boxmean(_wavF, 15) - boxmean(_wavF, 45)
_wav = _wav / max(_wav.std(), 1e-9)
# curl concentrates at the TRUE crowns only (photo: the hook/loop
# strokes cluster in the crown zones; between them the strokes run
# LONG and smooth).  Gate = gaussian in zc (zc/7)^2: an exp(-zc/10)
# gate was measured to switch the curl ON over most columns (zc<15
# covers most of the scan profile) and shred the long streaks into
# molten blotch — the gestalt defect class.  Amplitude rides the
# scan's own zc profile
_curl_amp = WAVY * (0.10 + 2.4 * np.exp(-(zc / 7.0) ** 2)
                    * np.exp(-((yy - yc) / (2.0 * HCROWN)) ** 2))
# ... the crown curl is LOCAL like the crown itself (an ungated
# column curl was measured to shred vertical texture bands through
# the mid zone below every crown)
F = F + _curl_amp * _wav
fracG = np.mod(F / FIGDIV, 1.0)
shape = np.where(fracG < KNEE, fracG / KNEE, (1 - fracG) / (1 - KNEE))
sh = shape ** SHP
line = 1 - (sh ** PSHARP / (sh ** PSHARP + (1 - sh) ** PSHARP))
# NOTE (measured, round-18): the innermost region (F0 < ~1) reads
# line=1 — the dark pith heart along the trace.  It STAYS: removing it
# (a line-gate inside the first ring) turns every large crown lens
# into a single-line-wrapped hole the closure check rightly classifies
# as a dedicated oval ring (measured: 2 rings), while the dark heart
# subdivides each lens into network enclosures — and a dark heart
# streak inside the bright figure is what the photo's own flame shows
# (its crest rows carry dark internal striations, rows 512-522
# V_med 40-56)


def _label4(b):
    h, w = b.shape
    lbl = np.zeros((h, w), dtype=np.int32)
    parent = [0]

    def find(x):
        r = x
        while parent[r] != r:
            r = parent[r]
        while parent[x] != r:
            parent[x], x = r, parent[x]
        return r

    nxt = 1
    for yy_ in range(h):
        for xx_ in range(w):
            if not b[yy_, xx_]:
                continue
            up = lbl[yy_ - 1, xx_] if yy_ > 0 else 0
            lf = lbl[yy_, xx_ - 1] if xx_ > 0 else 0
            if not up and not lf:
                parent.append(nxt)
                lbl[yy_, xx_] = nxt
                nxt += 1
            elif up and lf:
                ru, rl = find(up), find(lf)
                lbl[yy_, xx_] = min(ru, rl)
                if ru != rl:
                    parent[max(ru, rl)] = min(ru, rl)
            else:
                lbl[yy_, xx_] = up or lf
    flat = lbl.ravel()
    for i in range(len(flat)):
        if flat[i]:
            flat[i] = find(flat[i])
    return lbl


# CLOSURE CHECK (review r17-r1 P1 — an actual topology check, not an
# asserted invariant; classification law in the header).  Physical
# extents at the PANEL ruler (round-18): 2.93 mm/px x, 1.13 mm/px y.
_b = line > 0.5
_lb = _label4(_b)
_lbc = _label4(~_b)
_bg = (set(_lbc[0, :]) | set(_lbc[-1, :])
       | set(_lbc[:, 0]) | set(_lbc[:, -1]))
_PXW, _PXH = 1500.0 / MAP_W, 162.5 / MAP_H
_eyes = _nets = _rings = 0
for _i in np.unique(_lbc[_lbc > 0]):
    if _i in _bg:
        continue
    _ys, _xs = np.nonzero(_lbc == _i)
    _w = (_xs.max() - _xs.min() + 1) * _PXW
    _h = (_ys.max() - _ys.min() + 1) * _PXH
    if _w <= 40 and _h <= 25:
        _eyes += 1
        continue
    _m = np.zeros(_b.shape, bool)
    _m[_ys, _xs] = True
    for _ in range(2):
        _m[1:, :] |= _m[:-1, :]
        _m[:-1, :] |= _m[1:, :]
        _m[:, 1:] |= _m[:, :-1]
        _m[:, :-1] |= _m[:, 1:]
    _ids = np.unique(_lb[_m & _b])
    _ids = _ids[_ids > 0]
    _dedicated = False
    if len(_ids) == 1:
        _rys, _rxs = np.nonzero(_lb == _ids[0])
        _rw = (_rxs.max() - _rxs.min() + 1) * _PXW
        _rh = (_rys.max() - _rys.min() + 1) * _PXH
        _dedicated = _rw <= 1.6 * _w and _rh <= 1.6 * _h
    if _dedicated:
        _rings += 1
    else:
        _nets += 1
print(f'closure check: {_eyes} crown-eyes (<=40x25 mm), {_nets} network '
      f'enclosures, {_rings} dedicated oval rings')
assert _rings == 0, (
    f'{_rings} dedicated oval ring(s): the ring-grammar defect class '
    'is back — do not ship this map')

# tongue count record (the r16-gate motif-repetition item: crown
# flares along the figure; the photo shows ~12-18 tongues over 1.35 m)
_zrow = zc[0]
_dip = _zrow < (ZLO + 0.45 * (ZHI - ZLO))
_tongues = int(np.diff(_dip.astype(int)).clip(min=0).sum()
               + (1 if _dip[0] else 0))
print(f'crown tongues along the figure: {_tongues} '
      f'(photo family ~12-18 over 1.35 m)')

# 4. ROUND-18 TOP-LIT PANEL law (header derivation; replaces the
# round-15 symmetric mean/spread normalization the r16 gate failed):
# crest plateau + exponential falloff (the photo's own profile),
# specular pooling in the lit zone, figure lines carving
# multiplicatively (Weber).
yrow = np.arange(MAP_H, dtype=float)[:, None]
lit = np.exp(-np.clip(yrow - PLATEAU, 0, None) / TAU) * np.ones((1, MAP_W))
# crown/tongue chatoyance gain (round-18, photo-measured mechanism):
# the photo's flame-pure vert energy is BIMODAL — 45% horizontal
# tangents (long streaks) + 22% near-VERTICAL tangents, and the
# vertical share lives at the bright tongues' SIDE WALLS.  The crest
# brightness is therefore tongue-structured along x: bright flares
# above the crowns (zc dips), darker gaps between — the end-grain
# angle flips chatoyance at each crown flank.  The wall sharpness
# rides the scan's own zc profile.
crown_gain = np.exp(-zc / 10.0) * np.ones((MAP_H, 1))
# ... gated by the lit falloff: an ungated column gain was measured
# to stamp vertical bright/dark banding through the shadowed foot
pool_mod = np.clip(1.0 + POOL_F * np.interp((F * 5.0) % len(rowsP),
                                            np.arange(len(rowsP)), rowsP)
                   + POOL_R * pool_round, 0.78, 1.45)  # asymmetric:
# the crest stays continuously lit (the photo's sweep never dies out);
# pools are EXTRA shine crests, not holes
stri = (1 - np.abs(np.mod(F, 1.0) - 0.5) * 2) ** 2
field = PANEL_BOT + ((PANEL_TOP - PANEL_BOT) * lit * pool_mod
         * (1.0 + (0.42 * crown_gain - 0.28) * lit))
field *= 1.0 - line * (LINE_CARVE_LO + LINE_CARVE_HI * lit)
field -= stri * STRI_W * lit
field += fine * FINE_AMP * (0.5 + 0.9 * lit)
# FOOT LIP (round-18, measured decoupling): the panel's bottom edge
# catches floor-bounce light on the real table (a lit lower edge above
# the floor shadow).  It is ALSO the only zone the frozen C2 leg box's
# sliver sees — the lip holds that sliver's rendered R >= ~90 (the
# legs' Au-window exclusion) while the body foot above it stays below
# the facade band threshold; a flat foot bright enough for the legs
# measurably floods the band (0.262/0.254 at foot 162).
_lip_t = np.clip((yrow - (MAP_H - 9)) / 6.0, 0.0, 1.0) * np.ones((1, MAP_W))
field = field + _lip_t * (162.0 - field).clip(min=0.0) * 0.9
# vertical finish diffusion (round-18, measured): the satin finish
# optically softens figure edges along the grain-normal axis — and
# the un-diffused field's VERTICAL structure function saturates
# (Dv(3.6mm)/Dv(14.4mm) 0.82-0.84, whole-field sfr 0.73 vs the photo
# family 0.595-0.619).  Vertical-only 3-px box: attenuates exactly
# the saturated axis (7-px box ~ 7.9 mm; the first capture read
# rendered sfr 0.61/0.599 at 5 px — 0.64-ceiling-adjacent), preserves
# the tongue
# side walls (fig_vert).
_fp = np.pad(field, ((3, 3), (0, 0)), mode='edge')
field = (_fp[:-6] + _fp[1:-5] + _fp[2:-4] + _fp[3:-3] + _fp[4:-2]
         + _fp[5:-1] + _fp[6:]) / 7.0
print(f'figure sfr {sfr(field):.3f} aniso {sobel_aniso(field):.2f} '
      f'(targets: sfr 0.45-0.62, aniso 0.9-6)')

# 5. exponential saturation shoulder (specular pool crests roll off
# asymptotically toward the clamp ceiling — a hard clip flattened
# ~6% of the crest into a texture-free plateau, measured) + preview
knee_v, cap_v, roll = 228.0, 254.5, 55.0
hi = field > knee_v
field[hi] = knee_v + (cap_v - knee_v) * (
    1 - np.exp(-(field[hi] - knee_v) / roll))
clip = float(((field < CLAMP_LO) | (field > CLAMP_HI)).mean())
field = np.clip(field, CLAMP_LO, CLAMP_HI)
f_, c_, d_, b_ = facade_preview(field)
print(f'panel preview: foot {f_:.1f} crest {c_:.1f} range {d_:.1f} '
      f'halfmax-frac {b_:.3f} (targets: foot ~120, crest ~250)')
print(f'final mean {field.mean():.1f} p05-p95 '
      f'{np.percentile(field, 95) - np.percentile(field, 5):.1f} '
      f'sfr {sfr(field):.3f} aniso {sobel_aniso(field):.2f} '
      f'vertfrac {vert_frac_preview(field):.3f} clip {clip * 100:.2f}%')
GEN_RECORD = {
    'closure': {'eyes': _eyes, 'nets': _nets, 'rings': _rings},
    'tongues': _tongues,
    'panel': {'foot': round(f_, 1), 'crest': round(c_, 1),
              'range': round(d_, 1), 'halfmax_frac': round(b_, 3)},
    'sfr': round(sfr(field), 3), 'aniso': round(sobel_aniso(field), 2),
    'vertfrac': round(vert_frac_preview(field), 3),
    'scan_sha': scan_sha}
print('GEN_JSON ' + json.dumps(GEN_RECORD))

data = field.round().astype(np.uint8)
b64 = base64.b64encode(data.tobytes()).decode('ascii')
chunks = [b64[i:i + 96] for i in range(0, len(b64), 96)]
body = "'\n  + '".join(chunks)
# LEGACY full-face composite (review r18-r3 P2 — the REVERSE mixed-cache
# direction): an old cached table.js reads CN8_APRON_FIG and maps it
# over the FULL apron face — a panel-only payload there stretches the
# panel over the whole blind.  The legacy export therefore carries the
# whole two-part look AS PIXELS (beam rows at the near-black tone the
# old crimson hexes render dark, panel squeezed into its 0.375-1.0
# face span), so BOTH cache directions degrade to a valid apron
# (the ownership ledger cache-poison contract).
_beam_rows = int(round(MAP_H * 0.375))
_legacy_panel = np.asarray(Image.fromarray(data).resize(
    (MAP_W, MAP_H - _beam_rows), Image.LANCZOS), dtype=np.uint8)
_legacy = np.vstack([
    np.full((_beam_rows, MAP_W), 55, dtype=np.uint8), _legacy_panel])
legacy_b64 = base64.b64encode(_legacy.tobytes()).decode('ascii')
legacy_chunks = [legacy_b64[i:i + 96]
                 for i in range(0, len(legacy_b64), 96)]
legacy_body = "'\n  + '".join(legacy_chunks)
OUT.write_text(f'''// cn8phototex.js — GENERATED by tools/render/build-cn8-photo-tex.py.
// Do not hand-edit; regenerate against the GH-490 pack refs dir:
//   python3 tools/render/build-cn8-photo-tex.py <pack-refs-dir> [scan.jpg]
//
// GH-490 round-18 apron FLAME-PANEL figure (gate r16 P1-1): the photo
// apron is measurably a TWO-PART build — a near-black beam over a
// crimson flame panel (generator header: the color decomposition).
// The beam is GEOMETRY (table.js cn8 blind split, beamMat); THIS map
// is the PANEL ONLY: the round-17 pith-distance grammar (figure lines
// = level sets of R = sqrt((y - yc(x))^2 + zc(x)^2); the closure
// check forbids dedicated oval rings) under the measured TOP-LIT law
// (crest plateau + exp falloff — the photo's own row profile), with
// specular pooling and Weber line carve.  Every profile is sampled
// from a CC0 wood scan's own luma.  The cdmasters reference photo
// sets the STATISTIC TARGETS only (facade drama/band-narrowness
// families, sfr/fig-vert) — no press-photo pixel ships (review r16-r3
// P1; the repo third-party-imagery bar).  Full provenance +
// construction: the generator header.
//   basis: Poly Haven "dark_wood" (CC0 1.0, polyhaven.com/a/dark_wood)
//   sha256(scan working copy): {scan_sha}
// LEGACY export (review r18-r3 P2): the pre-round-18 consumer contract
// — a FULL-FACE map.  Carries the whole two-part look as pixels (beam
// band + squeezed panel) so an old cached table.js renders a valid
// apron from this module (the reverse mixed-cache direction of the
// the ownership ledger cache-poison contract).
export const CN8_APRON_FIG = {{
  w: {MAP_W},
  h: {MAP_H},
  b64: '{legacy_body}',
}};

// ROUND-18 PANEL payload (review r18-r2 P2 — versioned contract): the
// two-part build's flame panel; the round-18 consumer requires
// exactly v 18 and treats anything else as the degrade path (a cached
// round-17 full-face map stretched over the panel geometry silently
// recreates the facade defect).
export const CN8_APRON_FIG_V18 = {{
  v: 18,
  w: {MAP_W},
  h: {MAP_H},
  b64: '{body}',
}};

// synchronous decode (capture-determinism law: no async texture loads
// on the boot path — TextureLoader lands after __test.ready)
export function decodeGray(spec) {{
  const bin = atob(spec.b64);
  const out = new Uint8ClampedArray(spec.w * spec.h * 4);
  for (let i = 0; i < spec.w * spec.h; i++) {{
    const v = bin.charCodeAt(i);
    out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }}
  return out;
}}
''')
print(f'wrote {OUT} ({OUT.stat().st_size} bytes)')
if GEN_JSON_PATH is not None:
    # out_sha256 = the shipped module's digest, so byte-identity claims
    # in round records are tokens too (gate r17 P2-1's second half)
    GEN_RECORD['out_sha256'] = hashlib.sha256(
        OUT.read_bytes()).hexdigest()
    GEN_JSON_PATH.write_text(json.dumps(GEN_RECORD, indent=1) + '\n')
    print(f'GEN_JSON written {GEN_JSON_PATH}')
