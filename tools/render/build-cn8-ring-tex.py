# Copyright (c) Meta Platforms, Inc. and affiliates.

# build-cn8-ring-tex.py — generates web/scene/cn8ringtex.js: the GH-490
# Chinese-8 pocket KNIT-RING albedo, RECTIFIED FROM THE REFERENCE PHOTOS.
#
# ROUND-25 (gate r22 verdict P1-1, /private/tmp/cxr-490-r22/VERDICT.md):
# the ring insert failed THREE procedural attempts (rope mat -> gray
# lattice -> engraved spiral); the r22 gate's standing REFERENCE-DERIVED
# mandate bars a 4th procedural attempt and prescribes exactly this:
# "Rectify patches from the pack's own reference photos (tpt/joy147 ring
# crops), build albedo/height/normal from them, document provenance in
# the INDEX."  This tool is that rectification, end to end, measured at
# every step:
#
#   0b. ROUND-27 SOURCE DE-BLOCK (gate r24 P1-1(a) ROOT — measured): the
#      joy147 source carries an EXACT 16-px axis-aligned compression
#      macroblock grid (patch FFT: grid-bin power 3300-7400 vs band
#      median ~15 — the CDN-JPEG class this module already outlaws in
#      chroma).  Polar-unwrapped, that grid becomes the tile's two
#      near-axis combs (az 32.00 texels / rad ~21 rows — verified:
#      16 px at the ring radius maps to exactly those periods), which
#      the eq gain + unsharp + mip compensation amplified into the
#      rendered rectilinear lattice (present since rev-25; the r24 gate
#      measured the same families in the archived rev-25 raws).  Fix:
#      LOCAL PHASE-FOLD SUBTRACTION on the source luma — the local
#      mod-16 folded mean (DEBLOCK_BOX window, cumsum box filters)
#      isolates exactly the component PHASE-LOCKED to the compression
#      lattice; the knit is phase-free and survives (measured: grid-bin
#      power -60..-80%, off-axis knit peaks retained).  Artifact
#      removal, never authoring: the block grid is codec structure, not
#      liner texture.  Applied to both sources uniformly; the SHIPPED
#      pixels sample the deblocked luma; tint/classifiers keep the
#      original RGB.
#   1. ELLIPTICAL-POLAR UNWRAP of each reference's ring annulus about its
#      fitted hole ellipse (the r22 gate's own hole datums), walking each
#      azimuth ray from inside the hole outward: inner edge = first
#      sustained white sample, outer edge = first 3-consecutive
#      cloth/leather material samples (the gate's own green/tan
#      classifiers).  1440 azimuth columns x 128 radial rows,
#      bilinear-sampled.
#   1b. ROUND-27 SMOOTH BOUNDARIES (gate r24 P1-1(a) root): the v25/v26
#      unwrap normalized each ray's OWN detected r_in..r_out span onto
#      the full row range — the per-ray hard normalization STRAIGHTENED
#      the knit's natural radial wobble into phase-locked rows (and the
#      0.01-quantized edge walk added a boundary staircase), which is
#      the measured birth of the rendered rectilinear lattice (stage
#      FFT: the 32.00-texel azimuthal + ~21-row radial combs exist in
#      the RAW UNWRAP at full power, before flatten/resize/eq; the
#      no-mip level-0 diagnostic carries the same screen families, so
#      no consumption path owns it).  The boundary series r_in(theta) /
#      r_out(theta) are now CIRCULARLY GAUSSIAN-SMOOTHED (sigma
#      BOUNDARY_SMOOTH_COLS ~ one bead of arc) before sampling: the
#      annulus frame follows the liner's smooth shape while the knit
#      rows keep their own photographed wobble — the phase drift the
#      references' quasi-periodic knit actually has.
#   1c. ROUND-27 SUPERSAMPLED UNWRAP: rays and rows are sampled at 2x
#      (2880 x 256) and box-filtered down to 1440 x 128 — the single-
#      tap bilinear walk was a point sampler and its ray-grid/pixel-
#      grid moire contributed the azimuthal comb (anti-aliasing, not
#      authoring: same sources, same datums).
#      ROLE SPLIT (review r25-r2 precision): the
#      SHIPPED PIXELS (albedo, and the height/normal derived from it)
#      come from the JOY147 unwrap alone — it is the resolution base
#      (0.2468 vs tpt's 0.4187 mm/px); the TPT unwrap corroborates the
#      lit-arc statistics, co-anchors the tint mean, and feeds the
#      acceptance instrument.  Both sources are third-party either way
#      (the curation flag below covers the pair).
#   2. LIT-ARC SELECTION [25 deg, 155 deg] (image frame): both references
#      agree to the sector on where the luminaire lights the bead bed
#      (sector p50 216-243 sRGB, hi-frac 0.83-0.98; the shadow arc reads
#      p50 130-145 with hi 0.000).  The shipped map carries the LIT
#      exposure; the table.js vertex law re-authors the shadow crescent
#      at the photo-measured ratio, so the big-scale light stays a
#      RENDER-side decision and the map stays a material.
#   3. FLATTEN: per-column median, 40-column gaussian-smoothed, divided
#      out to the arc's p75 — removes the residual large-scale shading
#      WITHIN the lit arc (the crescent's own falloff), preserving
#      bead-scale structure.  Contaminated boundary rows trimmed (top 7:
#      hole-edge mixture + sampling comb; bottom 4: leather mixture).
#   4. RESAMPLE to the shipping tile (512+SEAM x 128 LANCZOS), then a
#      single mild unsharp (amount 0.45 at the 1.5 mm bead scale) to
#      restore the bead-crown contrast the double resample averaged away
#      — measured against the gate's own structure-tensor coherence
#      sampler below, NEVER a shape function (realism doctrine: no
#      authored geometry enters the map).
#   4b. ROUND-26 RADIAL DETAIL EQUALIZATION (gate r23 P1-1: the v25 tile
#      passed the identity family — hi/p50/coherence are population and
#      orientation statistics — while its BODY rows carried almost no
#      bead-scale events: measured per-row 1 mm-high-pass rms 1.3-3.7
#      over rows 8-88 of both references' lit arcs (the donor exposure
#      blows the mid band) vs 6-15 in the articulated band, so the
#      rendered ring COULD NOT articulate at R1 no matter how the mips
#      were sharpened — the r23 no-mip diagnostic read the same smear at
#      level-0 sampling).  The knit lattice is radially STATIONARY (both
#      references show the same weave from hole rim to leather; only
#      exposure varies), so each tile row's detail field is its own
#      0.8 mm high-pass (DETAIL_SIGMA_MM — the articulation family's
#      own feature scale) renormalized to a TWO-BAND calibrated
#      amplitude (DETAIL_RMS_IN over the inner rows, DETAIL_RMS_OUT
#      over the outer rows, cosine-blended across rows 56-72 — the
#      register's own row-to-half geography; both calibrated against
#      the articulation family the r23 gate measured at the R1
#      register); rows too blown to carry any signal (gain would
#      exceed GAIN_CAP — amplifying them would ship JPEG mottle)
#      borrow the donor band's own photo pixels (modulo row mapping
#      with a half-bead azimuthal roll to decorrelate the duplicate,
#      DONOR_FADE-row cross-fade; 0 rows borrow at these sources —
#      the guard is recorded in the payload), and the outer comma
#      band is tempered DOWN by the same law (its overweight isolated
#      blobs are the gate's "enlarged amorphous islands" class).
#      Zero authored shapes: every detail pixel is the reference's
#      own high-pass; the new numbers are the measured band targets,
#      the gain cap and the signal floor, all in the gen payload.
#   5. SEAM: 48-column raised-cosine cross-blend -> RepeatWrapping tiles
#      byte-continuously; repU is INTEGER (3) on the closed lathe.
#   6. GRAYSCALE + MEASURED TINT: the map ships as luma (chroma would
#      ship the CDN JPEG's compression mottle — the boot-leather ruling's
#      class); the references' own lit-arc chroma is a cool knit white,
#      r/g 0.9094/0.9100 and b/g 1.0417/1.0413 per reference (they
#      agree within 7e-4; the shipped triple is the two-reference
#      mean), applied at consumption as the module's tint.
#   7. HEIGHT/NORMAL: bead crowns are the bright luma (the photo's own
#      shading is the height evidence at this scale) — height = 1.2 mm
#      gaussian of luma, normal = Sobel of height.  The ring material is
#      MeshBasicMaterial by law (the GH-489 unlit-net precedent: below
#      the bed the analytic lamp is occluded and the cubemap paints white
#      cotton green), so the maps are not consumed by a lit shader; they
#      ship as PACK ARTIFACTS (zd/r25/ring-maps/) for the record, and the
#      albedo carries the photo's own baked bead relief.
#
# PROVENANCE (the pocket-furniture provenance law):
#   element | source | basis
#   knit-ring albedo/height/normal | PIXELS: refs/
#     joy147_q8_pocket_macro.png ((c) Joy official, pack MANIFEST.md);
#     CORROBORATION + tint co-anchor: refs/tpt_q8_Pocket.jpg ((c) Joy /
#     Thailand Pool Tables marketing, pack MANIFEST.md) |
#     rectified pixels, gate r22 REFERENCE-DERIVED mandate; sha256 of
#     both sources printed on generation and recorded in the module.
#   CURATION FLAG: unlike the apron map (CC0 scan basis), this module
#     CONTAINS third-party-derived pixels — recorded in
#     docs/opensource-prep/curation-proposal.md section 5
#     (PRIVATE-FOREVER class; web/ is the closed-app surface and never
#     ships in the SDK export).
#
# Scale chain: joy macro is the resolution base (0.2468 mm/px at the
# ring; the unwrap's lit arc spans ~79 mm at mid-radius).  The tile maps
# [hole rim .. leather boundary] radially onto the lathe ring's
# R_HOLE..R_KNIT_OUT (22.5 mm) and 1/3 of the 227 mm circumference per
# repeat: beads land at their photo scale (~3 mm) within 4 %.
#
#   python3 tools/render/build-cn8-ring-tex.py <pack-refs-dir>
#       [--gen-json PATH] [--maps-dir DIR]
import base64
import hashlib
import math
import json
import pathlib
import sys

import numpy as np
from PIL import Image

GEN_JSON_PATH = None
if '--gen-json' in sys.argv:
    _gi = sys.argv.index('--gen-json')
    GEN_JSON_PATH = pathlib.Path(sys.argv[_gi + 1])
    del sys.argv[_gi:_gi + 2]
MAPS_DIR = None
if '--maps-dir' in sys.argv:
    _mi = sys.argv.index('--maps-dir')
    MAPS_DIR = pathlib.Path(sys.argv[_mi + 1])
    del sys.argv[_mi:_mi + 2]

REFS = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/ob-490-refs')
OUT = pathlib.Path(__file__).resolve().parents[2] / 'web/scene/cn8ringtex.js'

NTH, NR = 1440, 128          # unwrap resolution (azimuth x radial)
LIT_A, LIT_B = 25, 155       # lit arc (deg, image frame) — both refs agree
TILE_W, TILE_H = 512, 128    # shipping tile
SEAM = 48                    # wrap cross-blend columns
UNSHARP = 0.45               # bead-contrast restore (measured, step 4)
TRIM_TOP, TRIM_BOT = 7, 4    # contaminated unwrap boundary rows
REP_U = 1                    # r27: the shipped map is the FULL RING
                             # (3 x TILE_W arc copies + the reference's
                             # own 360-deg clump envelope — step 5b);
                             # one repeat around the lathe
# step 4b (r26) equalization constants — all MEASURED, none authored:
DETAIL_SIGMA_MM = 0.8        # the articulation family's own feature
                             # scale (photo med blob 0.79 mm^2 — the
                             # tighter band trims the amorphous bodies
                             # the r23 gate flagged, keeps the gaps)
DETAIL_MIN = 2.0             # signal floor: rows below carry only donor
                             # exposure mottle; rows ABOVE it keep their
                             # OWN photo detail, amplified (the blown
                             # mid band is unclipped — clip fraction
                             # 0.00-0.02 — so its faint bead field is
                             # real signal, not noise; own-row
                             # amplification never palindromes the weave
                             # the way a mirror borrow does)
DETAIL_RMS_IN = 8.0          # detail target, INNER radial band (rows
                             # toward the hole rim): at the R1 register
                             # those rows render as the el-59 lit
                             # crescent, the most-compressed band — the
                             # target is calibrated so the crescent's
                             # articulation lands in the photo family
                             # (r23 gate basis, lit + central density)
DETAIL_RMS_OUT = 1.7         # detail target, OUTER band (rows toward
                             # the leather): those rows render as the
                             # shadow half, seen at HALF the
                             # compression — the same flat target
                             # over-articulated it (r26 calib 12-15
                             # blobs/100mm^2 vs the photos' 2.8-3.2);
                             # both targets are calibration constants
                             # against the same photo anchors, split by
                             # the register's own row->half geometry
DETAIL_RMS_RIM = 2.1         # hole-rim rows' detail target (the
                             # references' defocused rim family — the
                             # r15 blur-black law; rows 0-20 ramp)
GAIN_CAP = 4.5               # max own-row amplification (DETAIL_RMS /
                             # DETAIL_MIN — beyond it a row would ship
                             # amplified mottle and borrows instead)
DONOR_FADE = 4               # rows cross-faded at donor-band splices
# r27 constants (gate r24 P1-1 fix agenda) — all measured/calibrated:
TILE_MM = {}                 # R1-FIX3B: per-source rectified scales
BOUNDARY_SMOOTH_COLS = 30    # step 1b: circular smoothing sigma for the
                             # r_in/r_out boundary series, ~one bead of
                             # arc (7.5 deg) — kills the per-ray hard-
                             # normalization row straightening + the
                             # 0.01-walk staircase (the measured birth
                             # of the rendered rectilinear lattice)
                             # while the annulus frame keeps the
                             # liner's smooth shape
SUPERSAMPLE = 2              # step 1c: unwrap supersampling (2880x256
                             # box-filtered to 1440x128) — the single-
                             # tap bilinear walk was a point sampler;
                             # its ray-grid/pixel-grid moire fed the
                             # azimuthal comb (anti-aliasing, never
                             # authoring: same sources, same datums)
DEBLOCK_GRID = 16            # step 0b: the measured compression
                             # macroblock pitch in both sources
DEBLOCK_BOX = 65             # step 0b: local fold window (~4 blocks) —
                             # measured best grid kill (-60..-80%) at
                             # acceptable knit leakage; larger windows
                             # under-fit the grid's spatial envelope
CLUMP_SMOOTH_MM = 4.5        # step 4c: bead-scale envelope smoothing
CLUMP_GAMMA = 1.2            # step 4c: bead-scale envelope exponent
CLUMP_LO_MM = 20.0           # step 4c: SECTOR-scale envelope smoothing
                             # — the r27b single-scale envelope moved
                             # amplitude but not the 45-deg-sector
                             # density CV (its power sat at 5-20 mm
                             # scales; sector statistics average over
                             # them); the low band carries the
                             # references' own clump GEOGRAPHY at the
                             # scale the CV instruments read
CLUMP_LO_GAMMA = 2.0         # step 4c: low-band exponent — the
                             # envelope SHAPE is the reference's own
                             # per-column detail rms at two measured
                             # smoothing scales; the exponents are
                             # calibration constants against the
                             # rendered sector-CV windows (photos
                             # 0.331/0.349 12-sector, 0.43-0.59
                             # 8-sector shadow; the amplitude->density
                             # threshold nonlinearity needs gamma > 1)
                             # — no invented noise

# per-reference hole-ellipse datums (the r22 gate's own audit config —
# /private/tmp/cxr-490-r22/review-out/measure_audit.py) + native scale
SRC = {
    'tpt': {'file': 'tpt_q8_Pocket.jpg',
            'hole': (290.0, 220.0, 51.0, 55.0), 'mm_per_px': 0.4187},
    'joy': {'file': 'joy147_q8_pocket_macro.png',
            'hole': (520.0, 516.0, 73.0, 64.0), 'mm_per_px': 0.2468},
}


def gauss1d(arr, sigma, axis):
    """Separable gaussian via direct convolution (reflect padding) — the
    committed tools stay numpy+PIL only (no scipy dependency)."""
    if sigma <= 0:
        return arr.astype(float)
    r = max(1, int(3 * sigma + 0.5))
    x = np.arange(-r, r + 1)
    k = np.exp(-0.5 * (x / sigma) ** 2)
    k /= k.sum()
    a = np.moveaxis(np.asarray(arr, float), axis, -1)
    pad = np.concatenate([a[..., r:0:-1], a, a[..., -2:-r - 2:-1]], axis=-1)
    out = np.apply_along_axis(lambda v: np.convolve(v, k, 'valid'), -1, pad)
    return np.moveaxis(out, -1, axis)


def gauss2d_axes(arr, s_row, s_col):
    """R1-FIX3B: separable gaussian with its OWN sigma per axis.  The
    tile is not isotropic in mm/px (see TILE_MM), so a physical length
    is a different pixel count along rows than along columns."""
    return gauss1d(gauss1d(arr, s_row, 0), s_col, 1)


def gauss2d(arr, sigma):
    return gauss1d(gauss1d(arr, sigma, 0), sigma, 1)


def _boxblur(a, r):
    """(2r+1)-box mean via cumsum, reflect-padded, separable — the
    committed tools stay numpy-only and deterministic."""
    def b1(x, axis):
        x = np.moveaxis(np.asarray(x, float), axis, 0)
        n = x.shape[0]
        pad = np.concatenate([x[r:0:-1], x, x[-2:-r - 2:-1]], axis=0)
        c = np.cumsum(pad, axis=0)
        out = (c[2 * r:] - np.concatenate(
            [np.zeros((1,) + c.shape[1:]), c[:-2 * r - 1]], axis=0))
        out /= (2 * r + 1)
        return np.moveaxis(out[:n], 0, axis)
    return b1(b1(a, 0), 1)


def deblock_fold(img, block=None, box=None):
    """Step 0b: subtract the local mod-`block` folded mean — exactly the
    component phase-locked to the compression macroblock lattice (the
    knit is phase-free and cancels in the fold).  See the header."""
    block = block or DEBLOCK_GRID
    box = box or DEBLOCK_BOX
    r = box // 2
    h, w = img.shape
    L = _boxblur(img, r)
    yy, xx = np.indices((h, w))
    pu = xx % block
    pv = yy % block
    corr = np.zeros_like(img, dtype=float)
    for u in range(block):
        for v in range(block):
            m = ((pu == u) & (pv == v)).astype(float)
            P = _boxblur(img * m, r) / np.maximum(_boxblur(m, r), 1e-9)
            sel = m > 0
            corr[sel] = (P - L)[sel]
    return img - corr


def circ_smooth(series, sigma):
    """Circular gaussian smoothing of a periodic 1-D series (step 1b)."""
    n = len(series)
    r = max(1, int(3 * sigma + 0.5))
    x = np.arange(-r, r + 1)
    k = np.exp(-0.5 * (x / sigma) ** 2)
    k /= k.sum()
    pad = np.concatenate([series[-r:], series, series[:r]])
    return np.convolve(pad, k, 'valid')


def unwrap(name):
    cfg = SRC[name]
    path = REFS / cfg['file']
    data = path.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(float)
    h, w, _ = rgb.shape
    cx, cy, rx, ry = cfg['hole']
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    cloth = (g > r + 12) & (g > b + 10)
    leather = (r > g + 12) & (g > b + 5)
    v = rgb.max(axis=2)
    white = ~cloth & ~leather
    # pass 1 — per-ray boundary detection (the r25 walk, unchanged
    # classifiers/datums; detection only)
    r_in_s = np.zeros(NTH)
    r_out_s = np.zeros(NTH)
    valid = np.zeros(NTH, bool)
    ecc = ry / rx
    for ti in range(NTH):
        th = ti / NTH * 2 * np.pi
        dx, dy = np.cos(th), np.sin(th) * ecc
        r_in = r_out = None
        for rr_ in np.arange(0.75, 3.2, 0.01):
            x = cx + dx * rr_ * rx
            y = cy + dy * rr_ * rx
            if not (0 <= int(y) < h and 0 <= int(x) < w):
                break
            xi, yi = int(round(x)), int(round(y))
            if r_in is None:
                if v[yi, xi] > 120 and white[yi, xi]:
                    r_in = rr_
            elif cloth[yi, xi] or leather[yi, xi]:
                ok = True
                for dr in (0.02, 0.04):
                    x2 = cx + dx * (rr_ + dr) * rx
                    y2 = cy + dy * (rr_ + dr) * rx
                    if not (0 <= int(round(y2)) < h and 0 <= int(round(x2)) < w):
                        ok = False
                        break
                    xj, yj = int(round(x2)), int(round(y2))
                    if not (cloth[yj, xj] or leather[yj, xj]):
                        ok = False
                        break
                if ok:
                    r_out = rr_
                    break
        if r_in is None or r_out is None or r_out - r_in <= 0.25:
            continue
        valid[ti] = True
        r_in_s[ti] = r_in
        r_out_s[ti] = r_out
    if not valid.all():
        return np.zeros((NR, NTH, 3)), np.zeros((NR, NTH)), valid, sha
    # step 0b — deblocked luma carries the SHIPPED pixels; rgb keeps
    # tint/corroboration
    lum_db = deblock_fold(rgb @ np.array([0.2126, 0.7152, 0.0722]))
    # step 1b — smooth the boundary series circularly: the annulus frame
    # follows the liner's smooth shape; the knit rows keep their own
    # photographed radial wobble (the per-ray hard normalization was the
    # measured birth of the rendered lattice — see the header)
    r_in_s = circ_smooth(r_in_s, BOUNDARY_SMOOTH_COLS)
    r_out_s = circ_smooth(r_out_s, BOUNDARY_SMOOTH_COLS)
    # ---- R1-FIX3B: the tile's own scales, FORESHORTENING-RECTIFIED ----
    # The hole datum is a circle seen at a tilt, so its MAJOR semi-axis
    # carries the un-projected mm/px and the minor axis is that same
    # length times cos(tilt).  Rectifying on RMAJ is what makes the two
    # independent references agree on the ring circumference to 0.1%
    # (191.93 vs 192.16 mm) — measuring in raw image px instead under-
    # reads joy by 6.0% and tpt by 3.6% and splits them by 3.5%.
    # DISCLOSED: this assumes the hole's major axis is the un-projected
    # one.  The pack MANIFEST instead calls HORIZONTAL spans the
    # obliquity-immune ones, and for tpt the major axis is VERTICAL
    # (rx 51 < ry 55) — the two rules cannot both hold.  The 0.1%
    # cross-source agreement is the evidence for this one; the residual
    # is carried as scale ambiguity, not resolved here.
    _RMAJ = max(rx, ry)
    _rmid = 0.5 * (r_in_s + r_out_s)
    _Rr = _rmid * _RMAJ * cfg['mm_per_px']          # mid-curve radius, mm
    _dR = np.gradient(_Rr, edge_order=2)
    _dR[0] = (_Rr[1] - _Rr[-1]) / 2                 # the ring is periodic
    _dR[-1] = (_Rr[0] - _Rr[-2]) / 2
    _dth = 2 * np.pi / NTH
    _circ = float(np.hypot(_Rr, _dR / _dth).sum() * _dth)
    _span = float(np.mean(r_out_s - r_in_s) * _RMAJ * cfg['mm_per_px'])
    _lit = int(LIT_B / 360 * NTH) - int(LIT_A / 360 * NTH)
    TILE_MM[name] = {
        'circ_mm': _circ,                  # one revolution, mid-curve
        'span_mm': _span,                  # r_in -> r_out, rectified
        'col_mm': _circ / NTH,             # unwrap column pitch
        'row_mm': _span / NR,              # unwrap row pitch
        # the tile keeps TILE_W of the (TILE_W + SEAM) resized columns,
        # which came from the lit arc's _lit unwrap columns
        'mm_u': (_lit * TILE_W / (TILE_W + SEAM)) / NTH * _circ / TILE_W,
        'mm_v': _span * (NR - TRIM_TOP - TRIM_BOT) / NR / TILE_H,
    }
    # step 1c — supersampled sampling pass (vectorized bilinear), then
    # SS x SS box down to NR x NTH
    ss = SUPERSAMPLE
    nth2, nr2 = NTH * ss, NR * ss
    ti2 = np.arange(nth2)
    th2 = ti2 / nth2 * 2 * np.pi
    # boundaries interpolated circularly onto the supersampled rays
    tpos = ti2 / ss
    i0 = np.floor(tpos).astype(int) % NTH
    i1 = (i0 + 1) % NTH
    ft = tpos - np.floor(tpos)
    rin2 = r_in_s[i0] * (1 - ft) + r_in_s[i1] * ft
    rout2 = r_out_s[i0] * (1 - ft) + r_out_s[i1] * ft
    dx2 = np.cos(th2)
    dy2 = np.sin(th2) * ecc
    ri2 = (np.arange(nr2) + 0.5) / nr2
    rr2 = rin2[None, :] + (rout2 - rin2)[None, :] * ri2[:, None]
    xs = cx + dx2[None, :] * rr2 * rx
    ys = cy + dy2[None, :] * rr2 * rx
    x0 = np.clip(np.floor(xs).astype(int), 0, w - 2)
    y0 = np.clip(np.floor(ys).astype(int), 0, h - 2)
    fx = np.clip(xs - x0, 0.0, 1.0)[..., None]
    fy = np.clip(ys - y0, 0.0, 1.0)[..., None]
    strip2 = (rgb[y0, x0] * (1 - fx) * (1 - fy)
              + rgb[y0, x0 + 1] * fx * (1 - fy)
              + rgb[y0 + 1, x0] * (1 - fx) * fy
              + rgb[y0 + 1, x0 + 1] * fx * fy)
    strip = strip2.reshape(NR, ss, NTH, ss, 3).mean(axis=(1, 3))
    fxl = fx[..., 0]
    fyl = fy[..., 0]
    lum2 = (lum_db[y0, x0] * (1 - fxl) * (1 - fyl)
            + lum_db[y0, x0 + 1] * fxl * (1 - fyl)
            + lum_db[y0 + 1, x0] * (1 - fxl) * fyl
            + lum_db[y0 + 1, x0 + 1] * fxl * fyl)
    strip_lum = lum2.reshape(NR, ss, NTH, ss).mean(axis=(1, 3))
    return strip, strip_lum, valid, sha


def lit_cols():
    return int(LIT_A / 360 * NTH), int(LIT_B / 360 * NTH)


def coherence(gray, mm_per_px):
    """The r22 gate's own structure-tensor sampler (review measure_audit.py
    texture_coherence), numpy-native: median local coherence at the
    1.5 mm high-pass / 0.6 mm neighborhood physical scales."""
    highpass = gray - gauss2d(gray, 1.5 / mm_per_px)
    gy, gx = np.gradient(highpass)
    sigma = 0.6 / mm_per_px
    jxx = gauss2d(gx * gx, sigma)
    jyy = gauss2d(gy * gy, sigma)
    jxy = gauss2d(gx * gy, sigma)
    coh = np.sqrt((jxx - jyy) ** 2 + 4 * jxy ** 2) / (jxx + jyy + 1e-8)
    mag = np.hypot(gx, gy)
    lo, hi = np.percentile(mag, [20, 95])
    sel = (mag >= lo) & (mag <= hi)
    return (float(np.median(coh[sel])),
            float(np.sqrt(np.mean(highpass[sel] ** 2))))


def main():
    strips = {}
    lum_strips = {}
    shas = {}
    tints = {}
    c0, c1 = lit_cols()
    for name in SRC:
        strip, strip_lum, valid, sha = unwrap(name)
        shas[name] = sha
        strips[name] = strip
        lum_strips[name] = strip_lum
        lit = strip[10:-8, c0:c1]
        m = lit.reshape(-1, 3).mean(axis=0)
        tints[name] = (m[0] / m[1], m[2] / m[1])
        print(f'UNWRAP {name}: valid {int(valid.sum())}/{NTH} cols, '
              f'sha256 {sha}, lit tint r/g {m[0] / m[1]:.4f} '
              f'b/g {m[2] / m[1]:.4f}')
        if not valid.all():
            raise SystemExit(f'{name}: unwrap holes — datum drift, refuse')
    tint = [round(float(np.mean([tints[n][0] for n in SRC])), 4), 1.0,
            round(float(np.mean([tints[n][1] for n in SRC])), 4)]

    # joy = resolution base; shipped pixels = the DEBLOCKED luma (step 0b)
    lum = lum_strips['joy']
    slab = lum[:, c0:c1]
    colp = np.median(slab, axis=0)
    colp_s = gauss1d(colp, 40, 0)
    slab = slab * (np.percentile(colp_s, 75) / np.maximum(colp_s, 1))[None, :]
    slab = slab[TRIM_TOP:-TRIM_BOT]
    im = Image.fromarray(np.uint8(np.clip(slab, 0, 255)))
    im = im.resize((TILE_W + SEAM, TILE_H), Image.LANCZOS)
    t = np.asarray(im).astype(float)
    # ---- R1-FIX3B SCALE CORRECTION ------------------------------------
    # Retired literal: mmppx = 79.0 / TILE_W = 0.15430 mm/px, ONE
    # isotropic number for both axes.  Measured against the generator's
    # own rectified unwrap (TILE_MM, joy = the resolution base) the tile
    # actually carries 0.12376 mm/px azimuthally and 0.13978 radially —
    # so the retired literal was 17.3% too LARGE against their geometric
    # mean, and every mm-denominated filter below (the r26 detail split,
    # the r23 unsharp radius, the half-bead donor roll, the r15 defocus)
    # was realized ~15% too SMALL in pixels.  Both scales are now derived
    # from the unwrap the generator already computes; no new literal.
    SC = TILE_MM['joy']
    MM_U, MM_V = SC['mm_u'], SC['mm_v']
    mmppx = math.sqrt(MM_U * MM_V)
    MMPPX_R31 = 79.0 / TILE_W   # the retired scale, kept for the r22
    #                             coherence instrument so its 0.57 bar
    #                             stays like-for-like across this change
    # ---- step 4b: radial detail equalization (r26) --------------------
    detail = t - gauss2d_axes(t, DETAIL_SIGMA_MM / MM_V,
                              DETAIL_SIGMA_MM / MM_U)
    body = t - detail
    row_rms = detail.std(axis=1)
    row_rms_s = gauss1d(row_rms, 2.0, 0)
    # donor band = the longest contiguous run of rows whose own detail
    # already sits in the articulated family (>= DETAIL_MIN), excluding
    # the two boundary rows on each side; measured, not chosen.
    ok_rows = row_rms_s >= DETAIL_MIN
    best = (0, -1)  # (length, start)
    run = 0
    for i, o in enumerate(ok_rows):
        run = run + 1 if o else 0
        if run > best[0]:
            best = (run, i - run + 1)
    if best[0] < 12:
        raise SystemExit('equalization: no articulated donor band '
                         f'(longest run {best[0]} rows) — refuse')
    # inclusive band, two boundary rows excluded on EACH side (review
    # r26-r2 P3: the first cut's arithmetic only dropped one at the
    # tail)
    d0, d1 = best[1] + 2, best[1] + best[0] - 3
    print(f'EQ: donor band rows [{d0}, {d1}] '
          f'(rms {row_rms_s[d0]:.1f}-{row_rms_s[d1]:.1f}); '
          f'row rms pre-eq p10/p50/p90 '
          f'{np.percentile(row_rms_s, 10):.1f}/'
          f'{np.percentile(row_rms_s, 50):.1f}/'
          f'{np.percentile(row_rms_s, 90):.1f}')
    # per-row gain: own detail renormalized to the row's band target
    # (inner/outer cosine blend over rows 56-72 — the register's own
    # row->half geography), gain capped; rows under the signal floor
    # (gain would exceed the cap) borrow the donor band's own pixels
    # with a half-bead azimuthal roll (decorrelates the duplicate;
    # radial continuity inside the borrowed block is the donor's own),
    # cross-faded over DONOR_FADE rows.  With the measured tile-space
    # row floor (p10 ~3.0) the borrow path is a guard, not the norm.
    rowt = np.empty(TILE_H)
    for r in range(TILE_H):
        u = np.clip((r - 44) / 16.0, 0.0, 1.0)
        blend = u * u * (3 - 2 * u)
        rowt[r] = DETAIL_RMS_IN * (1 - blend) + DETAIL_RMS_OUT * blend
        # r26 HOLE-RIM taper (measured: 57% of the rendered shadow-half
        # dark features sat at/inside the hole-rim datum — the tile's
        # first rows — while the references' own rim rows read
        # DEFOCUSED into the aperture (the r15 blur-black light-trap
        # law; the r25 comb trim already treats rows 0-6 as boundary
        # anatomy).  The rim band's detail follows the references'
        # defocused amplitude (RIM target), ramping to the bead-bed
        # target over rows 0-14.)
        ur = np.clip(r / 20.0, 0.0, 1.0)
        br = ur * ur * (3 - 2 * ur)
        rowt[r] = DETAIL_RMS_RIM * (1 - br) + rowt[r] * br
    span = d1 - d0 + 1
    roll_px = int(round(1.5 / MM_U))  # half a ~3 mm bead (azimuthal)
    det26 = np.empty_like(detail)
    borrowed = []
    for r in range(TILE_H):
        gain = rowt[r] / max(row_rms_s[r], 1e-6)
        if gain <= GAIN_CAP:
            det26[r] = detail[r] * gain
        else:
            borrowed.append(r)
            dr = d0 + min(span - 1, abs(r - d0) % span)
            src = np.roll(detail[dr], roll_px)
            det26[r] = src * (rowt[r] / row_rms_s[dr])
    if borrowed:
        w_own = np.ones(TILE_H)
        w_own[borrowed] = 0.0
        w_s = gauss1d(w_own, DONOR_FADE / 2.0, 0)
        own = detail * np.minimum(
            rowt / np.maximum(row_rms_s, 1e-6), GAIN_CAP)[:, None]
        det26 = own * w_s[:, None] + det26 * (1 - w_s[:, None])
        print(f'EQ: {len(borrowed)} rows borrowed from the donor band '
              f'(roll {roll_px} px)')
    t = np.clip(body + det26, 0, 255)
    t = np.clip(t + UNSHARP * (t - gauss2d_axes(t, 1.5 / MM_V,
                                                1.5 / MM_U)), 0, 255)
    # wrap cross-blend
    tile = t[:, :TILE_W].copy()
    ramp = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, SEAM))
    tile[:, :SEAM] = (t[:, TILE_W:] * (1 - ramp)[None, :]
                      + tile[:, :SEAM] * ramp[None, :])
    # comb fix: residual per-column sampling ripple on the inner-rim rows
    tile[:6] = gauss1d(tile[:6], 2.0, 1)
    # ---- step 5b (r27): FULL-RING assembly + the reference ring's OWN
    # 360-deg azimuthal clump envelope (gate r24 P1-1(b)) ---------------
    # Three identical arc copies capped the ring's azimuthal geography
    # at the lit arc's own (rendered sector-density CV 0.14-0.28 vs the
    # photos' 0.33-0.59; the r24 gate adjudicated the base-pixel repeat
    # itself sub-visual — only the ENVELOPE was the gap).  The shipped
    # map is now the FULL RING (3 x TILE_W, repU 1): the same arc
    # pixels, with the detail field modulated by the JOY RING'S OWN
    # 360-deg envelope — per-column detail rms of the exposure-
    # normalized (circular column-median flatten) deblocked unwrap,
    # smoothed at the two measured scales, gamma-calibrated (constants
    # above), circularly resampled 1440 -> 3*TILE_W.  Every envelope
    # value is the reference ring's own geography; the gammas are the
    # amplitude->density calibration (gen json).
    ring = np.concatenate([tile, tile, tile], axis=1)
    ringw = TILE_W * 3
    # retired literal 226.0 mm: the rectified ring measures 191.93 mm,
    # so it was 17.8% too large.  Derived now, same source, same place.
    mm_col = SC['col_mm']  # unwrap azimuthal scale at mid-radius
    mm_row = SC['row_mm']  # unwrap radial scale
    colmed = np.median(lum, axis=0)
    colmed_s = circ_smooth(colmed, 40)
    norm = lum / np.maximum(colmed_s, 1)[None, :] * 100.0
    band = norm[20:110]
    det360 = band - gauss2d_axes(band, DETAIL_SIGMA_MM / mm_row,
                                 DETAIL_SIGMA_MM / mm_col)
    e360 = det360.std(axis=0)
    env_hi = circ_smooth(e360, CLUMP_SMOOTH_MM / mm_col)
    env_lo = circ_smooth(e360, CLUMP_LO_MM / mm_col)
    env_hi = env_hi / env_hi.mean()
    env_lo = env_lo / env_lo.mean()
    g360 = (env_hi ** CLUMP_GAMMA) * (env_lo ** CLUMP_LO_GAMMA)
    g360 = g360 / g360.mean()
    # PHASE (measured empirically — never bar-fitted, and never the
    # containment derivation an earlier draft claimed: the reference's
    # sharp-detail arc is only ~30 deg wide INSIDE its lit arc — the
    # blown mid-band is a detail DIP, so 'centre the lit arc' lands
    # the dip on the crescent; that 1225 draft measured lit 2.28 /
    # central 0.0 and was discarded).  A live ramp-texture probe
    # (diag-ramp, r27) mapped tile columns to the rendered halves,
    # then an 11-point rendered scan (P = 0..1440, builds captured and
    # read by the artic instrument clone; table in the r27 scratch +
    # round record) chose the measured optimum: at 1080 the lit and
    # central densities sit on their photo anchors while the shadow
    # half stays in family; the scan's neighbours read worse on at
    # least one leg (840: sh 11.3; 960: central 9.6; 1120: lit 4.6
    # floor-thin).
    ENV_PHASE_COLS = 1080
    # FLOOR (calibrated in the same scan): low enough that joy's own
    # defocused-arc geography transfers (the artic_sh family fix),
    # high enough that no sector starves articulation — the artic
    # floors are the guard; 0.55/0.40 trials read artic_sh 6.0/5.5
    # (the higher floors were blocking the defocus transfer).
    G_FLOOR = 0.30
    pos = np.arange(ringw) * (NTH / ringw) + ENV_PHASE_COLS
    ei0 = np.floor(pos).astype(int) % NTH
    ei1 = (ei0 + 1) % NTH
    ef = pos - np.floor(pos)
    g = g360[ei0] * (1 - ef) + g360[ei1] * ef
    g = np.maximum(g, G_FLOOR)
    g = g / g.mean()
    rdet = ring - gauss2d_axes(ring, DETAIL_SIGMA_MM / MM_V,
                               DETAIL_SIGMA_MM / MM_U)
    ring = np.clip((ring - rdet) + rdet * g[None, :], 0, 255)
    # ---- step 5c (r27): DEFOCUS TRANSFER (gate r24 P1-1(d)) -----------
    # The rms dials cannot move the shadow-half pepper: the arc's DEEP
    # bead gaps sit far below the -10 V detector floor at any gain
    # (measured: the 24 shadow-half events are position-identical
    # across byte-different tiles).  The references' shadow arc reads
    # fewer events because it is DEFOCUSED — the gaps blur wide and
    # shallow.  The transfer: per-column blend toward a DEFOCUS_SIGMA
    # blur, weighted by the reference ring's OWN measured sharpness
    # geography (the bead-scale envelope env_hi, phase-aligned as g):
    # columns the reference photographs sharp stay sharp; columns it
    # photographs defocused defocus.  Weight geography: reference-
    # derived; sigma: calibration constant vs the artic_sh photo
    # anchors (2.81/3.27, lane clone basis).
    DEFOCUS_SIGMA_MM = 1.2
    DEFOCUS_HI, DEFOCUS_LO = 1.0, 0.5   # env_hi thresholds (mean units)
    ehc = env_hi[ei0] * (1 - ef) + env_hi[ei1] * ef
    w_soft = np.clip((DEFOCUS_HI - ehc) / (DEFOCUS_HI - DEFOCUS_LO),
                     0.0, 1.0)
    ring_soft = gauss2d_axes(ring, DEFOCUS_SIGMA_MM / MM_V,
                             DEFOCUS_SIGMA_MM / MM_U)
    ring = ring * (1 - w_soft)[None, :] + ring_soft * w_soft[None, :]
    print(f'RING: defocus transfer sigma {DEFOCUS_SIGMA_MM} mm, '
          f'w_soft mean {float(w_soft.mean()):.2f} '
          f'(cols fully soft {float((w_soft >= 0.999).mean()):.2f})')
    print(f'RING: {ringw}x{TILE_H} full-ring envelope hi-cv '
          f'{float(env_hi.std()):.3f} lo-cv {float(env_lo.std()):.3f} '
          f'gain cv {float(g.std()):.3f}')
    tile8 = np.uint8(np.round(ring))

    coh, rms = coherence(tile8.astype(float), MMPPX_R31)
    coh_new, _ = coherence(tile8.astype(float), mmppx)
    hi = float((tile8 >= 180).mean())
    p50 = float(np.median(tile8))
    print(f'TILE: {ringw}x{TILE_H} @{1 / mmppx:.2f} px/mm  hi {hi:.4f} '
          f'p50 {p50:.1f}  coherence_p50 {coh:.4f} (deblocked photo '
          f'family 0.4925/0.5642, bar <= 0.57)  highpass_rms {rms:.2f}')
    if not (0.85 <= hi <= 0.99):
        raise SystemExit('tile hi_frac out of the lit-photo family, refuse')
    # r27 SAME-TREATMENT RE-ANCHOR (never a relax): the r22 bar 0.56 =
    # the raw-photo family max 0.5525 + 0.0075 margin, measured by the
    # r22 gate's texture_coherence sampler (hand ring polygons, cloth/
    # leather exclusion).  The r27 tile ships DEBLOCKED pixels (step
    # 0b), so the anchors must ride the same treatment: this lane's
    # verified clone of that sampler reproduces the raw anchors EXACTLY
    # (tpt 0.4832 / joy 0.5525 == the r22 record) and reads the
    # deblocked photos at 0.4925 / 0.5642 — the bar keeps the same
    # +0.0075 margin convention above the re-measured family max
    # (0.5642 + 0.0075 -> 0.57, quantized down).  The denoised knit is
    # GENUINELY more coherent — the compression mottle was diluting the
    # orientation statistic on both sides of the comparison.
    if coh > 0.57:
        raise SystemExit('tile coherence above the gate bar, refuse')

    # height/normal pack artifacts (step 7)
    if MAPS_DIR:
        MAPS_DIR.mkdir(parents=True, exist_ok=True)
        hgt = gauss2d_axes(tile8.astype(float), 1.2 / MM_V, 1.2 / MM_U)
        hgt = (hgt - hgt.min()) / max(1e-6, hgt.max() - hgt.min())
        Image.fromarray(np.uint8(hgt * 255)).save(MAPS_DIR / 'ring-height.png')
        gy, gx = np.gradient(hgt * 8.0)
        nz = 1.0 / np.sqrt(gx ** 2 + gy ** 2 + 1.0)
        nrm = np.stack([(-gx * nz + 1) / 2, (-gy * nz + 1) / 2,
                        (nz + 1) / 2], axis=-1)
        Image.fromarray(np.uint8(nrm * 255)).save(MAPS_DIR / 'ring-normal.png')
        Image.fromarray(tile8).save(MAPS_DIR / 'ring-albedo.png')
        print(f'MAPS: albedo/height/normal -> {MAPS_DIR}')

    b64 = base64.b64encode(tile8.tobytes()).decode('ascii')
    chunks = [b64[i:i + 96] for i in range(0, len(b64), 96)]
    body = "\n  + '".join(f"{c}'" for c in chunks)
    js = f"""// cn8ringtex.js — GENERATED by tools/render/build-cn8-ring-tex.py.
// Do not hand-edit; regenerate against the GH-490 pack refs dir:
//   python3 tools/render/build-cn8-ring-tex.py <pack-refs-dir>
//
// GH-490 round-28 (craft R1-FIX3B) pocket KNIT-RING albedo — RECTIFIED
// FROM THE PACK'S
// OWN REFERENCE PHOTOS per the r22 gate's REFERENCE-DERIVED mandate
// (three procedural ring attempts failed the character law; a 4th is
// barred).  Elliptical-polar unwrap of the tpt/joy147 ring annuli about
// the gate's hole datums — r27 SMOOTH-BOUNDARY + 2x-SUPERSAMPLED
// (gate r24 P1-1(a): the v25/v26 per-ray hard normalization
// straightened the knit's natural radial wobble into a phase-locked
// lattice, measured born in the raw unwrap; the boundary series are
// now circularly smoothed and the sampling anti-aliased — generator
// steps 1b/1c) — lit-arc [25,155] deg selection, large-scale
// flatten, r26 RADIAL DETAIL EQUALIZATION (the v25 body rows carried
// the donor exposure's blown mid band — bead events existed only in
// one articulated band and the outer comma band, the r23 gate's P1-1;
// every detail pixel remains the reference's own 0.8 mm high-pass,
// renormalized to the measured two-band + hole-rim-tapered amplitude
// profile (0 rows borrowed at these sources) — generator step 4b, plus
// the r27 AZIMUTHAL CLUMP ENVELOPE (gate r24 P1-1(b): the equalized
// liner rendered too even — the reference's own per-column detail
// envelope, gamma-calibrated, restores the photographed clumping —
// step 4c), mild measured bead-contrast restore, 48-col seam blend.
// SHIPPED PIXELS come from the joy147 unwrap (the resolution base);
// the tpt unwrap corroborates the lit-arc statistics, co-anchors the
// tint mean and feeds the acceptance instrument.
// Ships GRAYSCALE luma + the references' own measured cool-white tint
// (chroma would carry CDN JPEG mottle); the big-scale lit/shadow
// crescent is the table.js vertex law's photo-measured job.
// Full construction + measured acceptance: the generator header.
//
// r28 SCALE CORRECTION (craft R1-FIX3B).  The r22-r27 chain applied every
// mm-denominated filter through ONE isotropic literal, mmppx = 79.0/512
// = 0.15430 mm/px, and the r27 envelope through mm_col = 226.0/1440.
// Measured against this generator's OWN unwrap, foreshortening-rectified
// on the hole datum's major semi-axis, the tile carries 0.12376 mm/px
// azimuthally and 0.13978 radially, and the ring's mid-curve
// circumference is 191.93 mm (tpt corroborates at 192.16 — the two
// independent references agree to 0.1%, which is the check that
// validates the rectification; measuring in raw image px instead
// under-reads joy by 6.0% and tpt by 3.6% and splits them by 3.5%).
// So both retired literals were ~17.5% too LARGE and every physical
// length was realized ~15% too SMALL in pixels.  Both scales are now
// DERIVED from the unwrap (TILE_MM), per axis; no new literal.
// Measured deltas, r27 -> r28, on the generator's own instruments:
//   coherence_p50 0.5582 -> 0.5472 (bar <= 0.57; photo family
//     0.4925/0.5642 — the corrected tile moves TOWARD the family; the
//     instrument itself is deliberately still fed the retired scale
//     MMPPX_R31 so the bar stays like-for-like across this change)
//   hi 0.9820 -> 0.9836   p50 237.0 -> 236.0   highpass_rms 10.75 -> 9.67
//   EQ donor band [2,125] unchanged, 0 rows borrowed (guard untripped);
//     row rms p10/p50/p90 2.3/5.2/18.6 -> 2.6/6.1/21.4
//   envelope hi-cv 0.369 -> 0.349, lo-cv 0.193 -> 0.166,
//     gain cv 0.909 -> 0.794;  defocus w_soft 0.28 -> 0.27
//   donor roll 10 -> 11 px (half a bead, now on the azimuthal scale)
// Register HELD against the published lattice (background-relative
// spectra on the shipped bytes): azimuthal 45.02 -> 45.00 cycles/rev
// vs N_U 45 (0.0% off, both); radial 5.55 -> 5.53 courses vs N_V 5.50
// (0.8% -> 0.5% off).  Character HELD: lattice/cloud rms ratio
// 1.32 -> 1.19, inside the references' own family (joy 1.35, tpt 1.07).
// DISCLOSED: lattice rms falls 6.69% -> 6.04% because the corrected
// (wider) high-pass moves some structure into the body term; cloud is
// flat at 5.06 -> 5.08%.
// DISCLOSED: the rectification assumes the hole datum's MAJOR semi-axis
// is the un-projected one.  The pack MANIFEST instead calls HORIZONTAL
// spans obliquity-immune, and for tpt the major axis is VERTICAL — the
// two rules cannot both hold.  The 0.1% cross-source agreement is this
// one's evidence; the residual rides as scale ambiguity, unresolved.
//   basis: PIXELS refs/joy147_q8_pocket_macro.png ((c) Joy official);
//     corroboration/tint refs/tpt_q8_Pocket.jpg ((c) Joy / Thailand
//     Pool Tables marketing)
//     — pack refs/MANIFEST.md provenance rows; internal reference use;
//     CURATION: third-party-derived pixels, PRIVATE-FOREVER class
//     (docs/opensource-prep/curation-proposal.md section 5); web/ is
//     the closed-app surface and never ships in the SDK export.
//   sha256(tpt): {shas['tpt']}
//   sha256(joy): {shas['joy']}
export const CN8_RING_KNIT_V28 = {{
  v: 28,
  w: {ringw},
  h: {TILE_H},
  // measured lit-arc chroma (r/g, 1, b/g): the two references read
  // 0.9094/0.9100 and 1.0417/1.0413 (agreement within 7e-4); this
  // triple is their mean — the cool knit white, applied at consumption
  tint: [{tint[0]}, {tint[1]}, {tint[2]}],
  repU: {REP_U},
  b64: '{body},
}};

/** Decode the raw grayscale payload into RGBA ImageData bytes with the
 * measured reference tint applied (Uint8ClampedArray, w*h*4). */
export function decodeRingGray(map) {{
  const raw = atob(map.b64);
  const out = new Uint8ClampedArray(map.w * map.h * 4);
  const [tr, tg, tb] = map.tint;
  for (let i = 0; i < map.w * map.h; i++) {{
    const l = raw.charCodeAt(i);
    out[i * 4] = Math.min(255, Math.round(l * tr));
    out[i * 4 + 1] = Math.min(255, Math.round(l * tg));
    out[i * 4 + 2] = Math.min(255, Math.round(l * tb));
    out[i * 4 + 3] = 255;
  }}
  return out;
}}
"""
    OUT.write_text(js)
    out_sha = hashlib.sha256(OUT.read_bytes()).hexdigest()
    print(f'WROTE {OUT} ({OUT.stat().st_size} bytes) sha256 {out_sha}')
    payload = {
        'tile': {'w': ringw, 'h': TILE_H, 'px_per_mm': round(1 / mmppx, 2),
                 'hi_frac': round(hi, 4), 'p50': round(p50, 1),
                 'coherence_p50': round(coh, 4),
                 'highpass_rms': round(rms, 2)},
        'tint': tint, 'rep_u': REP_U,
        'lit_arc_deg': [LIT_A, LIT_B], 'seam_cols': SEAM,
        'unsharp': UNSHARP, 'trim_rows': [TRIM_TOP, TRIM_BOT],
        'eq': {'rms_in': DETAIL_RMS_IN, 'rms_out': DETAIL_RMS_OUT,
               'rms_rim': DETAIL_RMS_RIM, 'rim_ramp_rows': 20,
               'gain_cap': GAIN_CAP, 'detail_min': DETAIL_MIN,
               'sigma_mm': DETAIL_SIGMA_MM, 'band_blend_rows': [44, 60],
               'donor_band': [int(d0), int(d1)],
               'donor_fade_rows': DONOR_FADE,
               'donor_roll_px': int(round(1.5 / mmppx)),
               'borrowed_rows': len(borrowed)},
        'r27': {'boundary_smooth_cols': BOUNDARY_SMOOTH_COLS,
                'supersample': SUPERSAMPLE,
                'deblock_grid': DEBLOCK_GRID,
                'deblock_box': DEBLOCK_BOX,
                'clump_smooth_mm': CLUMP_SMOOTH_MM,
                'clump_gamma': CLUMP_GAMMA,
                'clump_lo_mm': CLUMP_LO_MM,
                'clump_lo_gamma': CLUMP_LO_GAMMA,
                'env_phase_cols': ENV_PHASE_COLS,
                'g_floor': G_FLOOR,
                'defocus_sigma_mm': DEFOCUS_SIGMA_MM,
                'defocus_thresholds': [DEFOCUS_HI, DEFOCUS_LO],
                'ring_w': ringw,
                'env_hi_cv': round(float(env_hi.std()), 3),
                'env_lo_cv': round(float(env_lo.std()), 3),
                'env_gain_cv': round(float(g.std()), 3)},
        'src_sha256': shas, 'out_sha256': out_sha,
    }
    print('GEN_JSON ' + json.dumps(payload))
    if GEN_JSON_PATH:
        GEN_JSON_PATH.write_text(json.dumps(payload, indent=2) + '\n')


if __name__ == '__main__':
    main()
