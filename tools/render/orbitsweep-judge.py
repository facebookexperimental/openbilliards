#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""orbitsweep-judge.py — per-bearing judge for the GH-489/490 orbit sweeps.

Reads a capture dir written by orbitsweep-489.mjs / orbitsweep-490.mjs:
  fNNN.png  beauty frame (finale orbit render)
  mNNN.png  mask frame (flat class colors: boot=red, cloth=green,
            railwood=blue, lampface=yellow, fallwall=magenta, apron=cyan,
            leg=white, other=gray)
  meta.json orbit spec + per-frame pocket-fall screen projections + windows

Judges PER FRAME (the whole point: the finale failures live BETWEEN the
register poses every other gate uses):

(a) boot luminance — the boot must read as LIT LEATHER, not a lamp.
    Window photo-derived (dossier-star-xw101, 2026-08-21 reads): the studio
    corner montage measures boot median luma 0.85 (the full-studio-sweep
    ceiling; V med 0.93, Vp90 0.95, no blown pixels), the GM2025 4K venue
    boots read V 0.40-0.85, and the register-SEALED skirt read (3q raw dE
    3.9, photo-matched) medians 0.87 at skirt-dominant orbit bearings.
    Windows: boot-mask median luma <= boot_l_med_max AND blown fraction
    (V >= 0.98) inside the boot mask <= boot_blown_frac_max.
    Red basis: pre-cure bearings measured boot luma med ~0.9+ with
    blown-frac 0.11-0.57 and a bloom halo (the "reads as a LAMP" verdict).
(b) rail-top IDENTITY windows, per bearing band (489 IDENTITY round —
    the orbit-cure flare-cap 0.78 was rejected at the second finale
    review: it bounded a FULL-FACE silver wash it should never have
    admitted; a real French-polished rail shows a NARROW flare band that
    moves with bearing over a dark median). Dossier bearing-sweep
    derivation (dossier-star-xw101, hand-placed ROIs, boxes recorded in
    the identity lane record; contaminated rows dropped, Crucible red-
    flooded venue kept as corroboration only):
      official video dolly (side-on/end-on, floor level):
        rail v_med 0.161-0.373, bright(V>=0.75) frac 0.00-0.34
      studio product 3/4 + GM2025 4K elevated: v_med 0.278-0.337
      press 4K side elevation: v_med 0.212-0.220
      -> per-band v_med ceilings (max of band family + 0.06 margin):
         side 0.40, end 0.43, oblique 0.40, close(corner orbit) 0.55
         (close allows the near-grazing flare of the 0.55 m orbit);
      -> bright-frac band-limit (flare must stay a BAND, never a wash):
         side 0.35, end 0.45, oblique 0.40, close 0.45.
    Legacy classes stay armed: bright-magenta frac (H in [290,350],
    S>=0.45, V>=0.30) and colored-bright median (V > rail_v_med_max AND
    S > 0.30) — the orbit-cure round's red family.
(c) black-void census inside cloth — 0 tolerated (unchanged; the retired
    obSnkSeamShadow class).
(d) any-object blown-highlight fraction outside the lamp class
    (V >= 0.98 AND S <= 0.12) <= blown_frame_frac_max (unchanged).
(e) LEG identity windows (489 IDENTITY round, "bright orange-tan
    plastic" reject). Dossier leg family (metallic-lacquered turned
    gold): official video sweep legs H 37 S 0.60-0.64 V 0.65-0.73
    (Vp90-Vp10 spread 0.31-0.33); studio product legs H 30-36 S 0.58-0.72
    V 0.81; GM2025 venue legs H 28-30 S 0.63-0.65 V 0.48-0.54 (spread
    0.26); leg-flute closeup H 40 S 0.68 (single-zone crop, spread
    excluded from the floor). Windows (family envelope + margins):
      leg_h_med in [26, 46]; leg_s_med <= 0.76 (family max 0.727 + 0.03
      — the red tree renders 0.79-0.80: the orange-tan mechanism);
      leg_v_med in [0.30, 0.85]; turned-detail spread (Vp90-Vp10) >=
      0.18 far bands (GM 0.26 min - margin; the flat "plastic" read
      fails it) / 0.06 close band (STRUCTURAL flat-sticker guard only:
      the 0.55 m bearings see a partial barrel section and measure
      ~0.08-0.10 on red and cured trees alike — red i24 0.114 >= cured
      0.102, so spread cannot separate them there; the close-band
      identity axis is saturation, which red-fires). Judged only when the leg mask population
      carries the row (legs are legitimately hidden at many corner
      bearings): >= leg_min_px.
(f) APRON identity guard: v_med <= 0.55 and s_med <= 0.85 (reference
    apron family V 0.12-0.33; generous ceiling — the apron identity is
    register-sealed by cammatch, this row only catches the washed/blown
    class). Judged when population >= apron_min_px.
(o) LEG-COUNT census (490 BLOCKER-CURE B4 — "4 legs rendered; the truth
    table has 6"): at fulltable SIDE bearings the leg-mask pixels are
    clustered along screen-x (gap threshold windows.leg_count.gap_px);
    the row fails when fewer than min_clusters clusters read, or when no
    cluster sits within mid_frac of the cloth extent's centre (the
    mid-side leg the dossier arena photo shows). Judged when the leg
    mask population carries the row. Red basis: the 6cd246ff tree
    rendered 2 side-band clusters and no mid cluster.
(p) INTERIOR-MATERIAL ordering (490 BLOCKER-CURE B2 — "pocket interior
    reads chrome/steel funnel"): at corner-orbit bearings inside
    windows.interior.az (the over-table arc where the bore is visible),
    the projected fall circle partitions into the HOLE disc (<= 0.22 R)
    and the KNIT annulus (0.26..0.44 R). The dossier macros put the drop
    DARKEST (hole/cloth 0.04-0.06) under a lit knit ring; the red tree
    measured hole/cloth 1.16-1.73 (the glowing funnel bottom). Rows:
    hole_ratio <= hole_ratio_max; annulus ratio inside ann_ratio.
(g) SEAM-GLOW line detector (489 IDENTITY round, "glowing seam lines
    along the apron top edge" — third appearance of the cinelight-strip
    class). Column scan: wherever a railwood-mask run is followed within
    24 px below by an apron-mask pixel, the between strip is a rail/apron
    JUNCTION column; a column GLOWS when the strip contains a pixel with
    V >= 0.90 AND S <= 0.45 (white-hot leak; the reference junction is
    dark/warm SATURATED gold in every dossier frame — the studio gold
    band's brightest reads stay S >= 0.5, so legit gold never trips the
    cut). Window: glow-column fraction <= seam_glow_frac_max (0.10),
    judged when junction columns >= 20. Red tree measured 0.63-0.88
    (fulltable, ALL bearings) / 0.48 (corner i24).

(h) THROAT interior (489 BLOCKER-CURE round, finale adversarial review
    B8 "pocket-throat glowing floor"): pixels of the net/fallwall classes
    INSIDE the projected mouth circle must read DARKER than the lit bed.
    Dossier basis (masters-corner-pocket-topdown-sportphoto, matched-pose
    broadcast top-down, brighter rig than the studio preset): net weave
    1.13x cloth, throat jaw walls 0.64-0.87x, central drop 0.58x — the
    interior MEDIAN sits at/below the bed; the reference's darkest element
    is the drop. Red tree a6c89460 measured pit/cloth 2.57-3.26 with a
    near-clip bottom disc (p99 247) at the corner-orbit dwell bearings
    (t13-17 -> i44-i60). Windows: throat_cloth_ratio <=
    throat_cloth_ratio_max AND throat blown fraction (V >= 0.95) <=
    throat_blown_frac_max, judged when the in-mouth net+fallwall
    population >= throat_min_px.
(i) APRON-STACK identity per bearing band (B10): the XW101 apron body is
    near-black plum in every dossier frame (press 4K side elevation
    apron V 0.12 / H 338; official 3/4, xpshop end views, GM2025 venue
    all agree; the derivation fixture's apron rows span V 0.12-0.33).
    Red tree renders brick red V ~0.44-0.50 H ~1.5. Windows:
    apron_v_med <= apron_v_med_max_band[band] AND apron hue inside
    apron_h_med_win (wrap-aware plum window). The flat 0.55/0.85 wash
    guard stays armed (washed/blown class).
(j) RAIL GREEN-FLANK guard (B10 alien green band): fraction of railwood
    pixels reading cloth-green (H 70-170, S >= 0.25, V >= 0.08) <=
    rail_green_frac_max. No dossier frame shows green on the rail body
    or its flank; the red tree's below-rail plank flank consumed the
    bed's green GI bounce and read as a cloth-textured green band.
(k) CUSHION-BASE/BED JUNCTION GLOW (B12, 4th member of the glow-strip
    family): cloth pixels in the mint signature (H 100-170, S <=
    junction_mint_s_max, V >= junction_mint_v_min) — the measured strip
    read RGB(91,176,121) = H141 S0.48 V0.69 vs bed (15,94,40) = S0.84
    V0.37: same hue, desaturated, ~3x brighter = transport wash, while
    every legit lit-cloth read keeps S >= 0.7 under this rig. Window:
    cloth_mint_frac <= junction_glow_frac_max.
(l) CLOTH CLOSE-ZOOM PURITY (B13): the dossier retail page (xpshop
    世创6811) advertises 无白点、无杂质 and the Strachan No.10 macro is a
    smooth uniform velvet. Two axes, close band only: bright-dot census
    cloth_dot_frac (cloth px with lum >= cloth_l_med + 0.16) and
    high-frequency contrast cloth_hf_mean (mean |lum delta| between
    adjacent 2-px cloth samples). Red tree: dense salt speckle at the
    corner orbit's closest approach (t14-17).
(m) BOOT SILHOUETTE-STEP (B9 collar-roll facets at 1x): the boot's TOP
    silhouette (mask space, full resolution) is scanned for slope KINKS —
    8-px window tangent-angle changes >= sil_kink_deg on a continuous
    edge run. A smooth rolled collar reads ~3 deg per 8 px at the video
    zoom; a tessellation facet junction concentrates its whole station
    angle at one column. Window: boot_kink_count <= sil_kink_count_max,
    close band, boot population >= 4000.
(n) NET ANATOMY (B14 vestigial net): the geometric gate lives in
    check-pocket-construction C10 (first obPocketNet on a horizontal ray
    at y = -130 mm must sit >= 35 mm off the cup axis — red-proven 18.6
    mm on the rejected tree, 61.6 mm cured). The sweep records
    net_boot_wfrac as a DIAGNOSTIC (p90 sock width under the boot hem /
    hem width) and gates only the net-class mask POPULATION through
    agg_min_frac.net — the pixel-space width read collapses whenever the
    boot fills the frame or shows only its crown sliver (measured on red
    and cured trees alike), so it cannot carry a verdict.
(o) FALL-DISC SCOPING of the enc_dline census (RULING V8-C1, R3-SNK-9):
    pixels inside the projection of each render fall disc (table.js
    pocketFallDiscs(); polygons written by the capture per VIDEO frame
    from the live camera — meta.run_fall_polys[v] / poses[i].fall_polys,
    driver projectFallPolys) plus windows.enc_fallmask.rim_px are
    excluded BEFORE the encoder-bloom classifier (R-S8-4) in both the
    per-frame and the screen pass — the fall interior is the pre-lit
    fall canvas, the glint and the net, not cloth a line can be drawn
    on. The raw census, enc_fallmask_px, enc_bloom_px and the net values
    ride the report; the 8/12/48 laws are unchanged. No polygons ->
    fall_poly_missing (frame + aggregate); a mask past frac_max ->
    fall_mask_oversize; no window -> enc_fallmask_window_missing: each
    fails loud (an old capture reads as a judge item, never GREEN).
    Red arm: --selftest-disc (driver --red-arm).

A frame whose boot/rail/cloth mask populations fall below the driver's
per-orbit minimums (windows.mask_min_px) fails explicitly as
mask_missing_* — a renamed mesh or lost material tag can never zero-pass
the judges it blinds (review orbit-cure r4).

Exit 0 all frames pass; exit 3 otherwise. Writes report.json + up to 6
annotated failing crops per orbit.
"""
import json
import math
import os
import sys
import colorsys
from PIL import Image

def classify(mr, mg, mb):
    """Mask-class dominance rules (the mask pass renders through the
    app's postfx: ACES shifts painted primaries — measured post-transform
    anchors: green (152,229,93), blue (0,0,229), cyan (158,229,227),
    white (228,228,228), gray (178,178,178), red (253,24,22)).
    489 BLOCKER-CURE additions: net = orange [1,0.35,0] (modulated by the
    knit map's cream texels, so mg rides 45-210 while boot's red anchor
    holds mg 24); fallwall = magenta [1,0,1] (driver constant existed
    since the orbit-cure round; the throat row is its first consumer).
    Order matters: net before boot (a modulated orange can satisfy the
    red dominance rule), fallwall before boot (mb high breaks red's
    mb-dominance test anyway — kept explicit)."""
    if mr > 150 and mb > 130 and mg < min(mr, mb) - 60:
        return 'fallwall'
    if mr > 150 and 45 <= mg <= 210 and mb < 90 and mr > mg + 55:
        return 'net'
    if mr > mg + 80 and mr > mb + 80:
        return 'boot'
    if mg > mr + 50 and mg > mb + 50 and mb < 200:
        return 'cloth'
    if mb > mr + 80 and mb > mg + 80:
        return 'rail'
    if mr > 150 and mg > 150 and mb < mg - 80:
        return 'lamp'
    if min(mr, mg, mb) >= 200 and max(mr, mg, mb) - min(mr, mg, mb) <= 20:
        return 'leg'
    if mg >= 200 and mb >= 200 and mr < mg - 40:
        return 'apron'
    return 'other'

def mask_cloth_exact(m):
    """Vectorised classify() == 'cloth' on an HxWx3 int mask array with
    the SAME precedence as classify() (fallwall, net, boot are tested
    before cloth). Used by the encoder-bloom classifier (the marking
    family lives ON the cloth mesh, so its mask class is cloth)."""
    import numpy as np
    mr, mg, mb = m[..., 0], m[..., 1], m[..., 2]
    fallwall = (mr > 150) & (mb > 130) & (mg < np.minimum(mr, mb) - 60)
    net = (mr > 150) & (mg >= 45) & (mg <= 210) & (mb < 90) & (mr > mg + 55)
    boot = (mr > mg + 80) & (mr > mb + 80)
    cloth = (mg > mr + 50) & (mg > mb + 50) & (mb < 200)
    return cloth & ~(fallwall | net | boot)


def _luma709(a):
    """Rec.709 luma of an (..., 3) int array (the judge's own luma law,
    identical coefficients to the per-frame census)."""
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def fall_mask(polys, w, h, rim_px):
    """RULING V8-C1 (R3-SNK-9): rasterise one frame's render fall-disc
    polygons (frame-pixel coordinates, from the capture's
    projectFallPolys) into a boolean HxW mask — polygon fill (PIL,
    edge pixels included), then binary dilation by rim_px Chebyshev
    steps (3x3 structure per iteration; WINDOWS.enc_fallmask.rim_px =
    1: the fall edge's own anti-aliased boundary pixel). Polygons whose
    bounding box misses the viewport paint nothing. Returns
    (mask, fill_px, mask_px)."""
    import numpy as np
    from scipy import ndimage
    from PIL import ImageDraw
    im = Image.new('L', (w, h), 0)
    dr = ImageDraw.Draw(im)
    for poly in polys or []:
        if len(poly) < 3:
            continue
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        if max(xs) < 0 or min(xs) > w or max(ys) < 0 or min(ys) > h:
            continue
        dr.polygon([(float(x), float(y)) for x, y in poly], fill=1)
    m = np.asarray(im, dtype=bool)
    fill_px = int(m.sum())
    if rim_px:
        m = ndimage.binary_dilation(m, structure=np.ones((3, 3), bool),
                                    iterations=int(rim_px))
    return m, fill_px, int(m.sum())


def _pinhole_fall_polys(cam, discs, w, h, fm):
    """RULING V8-C1: the judge's OWN pinhole projection of the render
    fall discs — three.js Object3D.lookAt + PerspectiveCamera math
    re-derived independently (camera basis z = normalize(eye − look),
    x = normalize(up × z), y = z × x; symmetric frustum: ndc.x =
    x_c / (−z_c · tan(fov/2) · aspect), ndc.y = y_c / (−z_c ·
    tan(fov/2)); near-plane clip on z_c ≤ −near BEFORE the divide;
    pixel map sx = (ndc.x + 1)/2·w, sy = (1 − ndc.y)/2·h, rounded to
    fm.px_decimals — projectFallPolys step for step). The red arm
    compares it vertex by vertex with the polygon three.js projected
    in node, proving the judge reads the capture's polygons under the
    same camera model the page used."""
    import numpy as np
    eye = np.array(cam['eye'], float)
    look = np.array(cam['look'], float)
    up = np.array(cam.get('up', [0, 1, 0]), float)
    zc = eye - look
    zc /= np.linalg.norm(zc)
    xc = np.cross(up, zc)
    xc /= np.linalg.norm(xc)
    yc = np.cross(zc, xc)
    t = math.tan(math.radians(cam['fov']) / 2)
    aspect = cam['aspect']
    near = -cam.get('near', 0.01)
    nv = int(fm['n_vertices'])
    py = fm['plane_y']
    q = 10 ** int(fm['px_decimals'])
    polys = []
    for f in discs:
        rim = []
        for k in range(nv):
            a = 2 * math.pi * k / nv
            p = np.array([f['x'] + f['r'] * math.cos(a), py,
                          f['z'] + f['r'] * math.sin(a)]) - eye
            rim.append((float(p @ xc), float(p @ yc), float(p @ zc)))
        clipped = []
        for k in range(len(rim)):
            p, p2 = rim[k], rim[(k + 1) % len(rim)]
            pin, qin = p[2] <= near, p2[2] <= near
            if pin:
                clipped.append(p)
            if pin != qin:
                s = (near - p[2]) / (p2[2] - p[2])
                clipped.append(tuple(p[j] + (p2[j] - p[j]) * s
                                     for j in range(3)))
        if len(clipped) < 3:
            continue
        poly = []
        for (x, y, z) in clipped:
            nx = x / (-z * t * aspect)
            ny = y / (-z * t)
            poly.append([round((nx + 1) / 2 * w * q) / q,
                         round((1 - ny) / 2 * h * q) / q])
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        if max(xs) < 0 or min(xs) > w or max(ys) < 0 or min(ys) > h:
            continue
        polys.append(poly)
    return polys


def enc_bloom_component(members, src, dec, cloth, bw):
    """RULING R-S8-4 (R3-SNK-9) — ENCODER-BLOOM classifier for one
    decoded G>=254 component of the enc_dline census. Returns
    (True, 'bloom') only when EVERY signature condition of the shipped
    codec's chroma error at a lit-glint / cloth rim holds; any other
    component (the marking family, a drawn line, a blown white, an
    unexplained clip) returns (False, reason) and keeps counting.

    The mechanism under the shipped encode (libx264 crf 14 medium,
    yuv420p): 4:2:0 stores ONE Cb/Cr pair per 2x2 luma cell. Where a
    lit glint (warm/neutral, near-blown) and dark green cloth share a
    cell, the cell's chroma is the average of both; on decode the
    glint pixel keeps its OWN luma (full-resolution Y) but takes the
    averaged chroma — R falls and G rises past 254 while luma is
    conserved. Measured on the sealed 9c0437a3 corner f064 rim (the
    ruling's item): source (249..254,239..248,193..223) -> decoded
    (213..229,255,197..224): dR -25..-36, dG +7..+16, |dY| <= 4, every
    shifted pixel exactly one row from the cloth (the straddling cell),
    the rows above un-shifted (255,229..245,177..205). Reproduced by
    the --selftest-bloom ffmpeg round trip.

    Signature (all must hold; bw = WINDOWS.enc_bloom, tags there):
      B1 members are the glint's own edge — every member's SOURCE has
         G < 254 (a source G clip is the capture-plane dline_clip row's,
         never bloom), is not green-dominant (G <= max(R,B) +
         green_dom_min) and lies nearer in RGB to the body's median
         colour than to the partner's (an anti-aliased edge pixel of
         the lit surface, never a cloth pixel);
      B2 pure chroma error — decoded G > source G AND decoded R <
         source R (the Cr pull) with |luma_dec - luma_src| <= luma_tol
         (a drawn colour or a luma gain is not an encoder chroma error);
      B3 chroma partner — every member lies within reach_px of a
         green-dominant SOURCE pixel (G >= R + green_dom_min and
         G >= B + green_dom_min): the cloth it shares the cell with;
      B4 un-shifted lit body — within reach_px of the component there
         are source pixels at max(R,G,B) >= highlight_v_min (the judge's
         blown law: a lit glint saturates the tonemapper; the cured
         marking family stores headroom), not green-dominant, G < 254,
         that decoded WITHOUT the clip (decoded G < 254): the lit
         surface extends beyond the shared cell. A line whose every
         pixel shifts (a thin marking, a lit cord) has no body;
      B5 body off-cloth — fewer than body_cloth_frac_max of those body
         pixels are cloth-class in the mask: the marking family is
         painted ON the cloth mesh (mask cloth); a lit glint is
         furniture (bore/lamp/net/other). The rim IS the mask boundary,
         so its <= 1 px anti-aliased blend can sit on either side —
         the body's class is its majority class;
      B6 thickness — the component holds no (thick_max_px+1)^2 square:
         a bloom band sits within reach of its partner on one side and
         its body on the other, so its normal thickness cannot exceed
         reach; length is unbounded (a long rim gives a long band).
    """
    import numpy as np
    from scipy import ndimage
    reach = int(bw['reach_px'])
    hv = int(bw['highlight_v_min'])
    ytol = float(bw['luma_tol'])
    gd = int(bw['green_dom_min'])
    thick = int(bw['thick_max_px'])
    bcf = float(bw['body_cloth_frac_max'])
    H, W = src.shape[:2]
    xs = [p[0] for p in members]
    ys = [p[1] for p in members]
    pad = reach + 1
    x0, x1 = max(0, min(xs) - pad), min(W, max(xs) + pad + 1)
    y0, y1 = max(0, min(ys) - pad), min(H, max(ys) + pad + 1)
    s = np.asarray(src[y0:y1, x0:x1], dtype=np.int16)
    dd = np.asarray(dec[y0:y1, x0:x1], dtype=np.int16)
    cl = np.asarray(cloth[y0:y1, x0:x1], dtype=bool)
    comp = np.zeros(s.shape[:2], bool)
    comp[[y - y0 for y in ys], [x - x0 for x in xs]] = True
    sc, dc = s[comp], dd[comp]
    not_green = s[..., 1] <= np.maximum(s[..., 0], s[..., 2]) + gd
    # B1 (colour part) + B2
    if not ((sc[:, 1] < 254) & not_green[comp]).all():
        return False, 'source_not_highlight'
    if not ((dc[:, 1] > sc[:, 1]) & (dc[:, 0] < sc[:, 0])).all():
        return False, 'no_chroma_rotation'
    if (np.abs(_luma709(dc) - _luma709(sc)) > ytol).any():
        return False, 'luma_not_conserved'
    # B3
    se = np.ones((2 * reach + 1, 2 * reach + 1), bool)
    near = ndimage.binary_dilation(comp, structure=se)
    partner = ((s[..., 1] >= s[..., 0] + gd) & (s[..., 1] >= s[..., 2] + gd))
    if not ndimage.binary_dilation(partner, structure=se)[comp].all():
        return False, 'no_green_partner'
    # B4 / B5
    body = ((s.max(-1) >= hv) & (s[..., 1] < 254) & not_green
            & (dd[..., 1] < 254) & ~comp & near)
    if not body.any():
        return False, 'no_unshifted_body'
    if (cl & body).sum() >= bcf * body.sum():
        return False, 'body_on_cloth'
    # B1 (membership part): nearer to the body than to the partner
    bmed = np.median(s[body], axis=0)
    pmed = np.median(s[partner & near], axis=0)
    d_body = np.sqrt(((sc - bmed) ** 2).sum(1))
    d_part = np.sqrt(((sc - pmed) ** 2).sum(1))
    if not (d_body < d_part).all():
        return False, 'member_not_glint_side'
    # B6
    se_t = np.ones((thick + 1, thick + 1), bool)
    if ndimage.binary_erosion(comp, structure=se_t).any():
        return False, 'thicker_than_bleed'
    return True, 'bloom'


def bearing_band(orbit, az_deg):
    """fulltable orbit bands. Kernel coords: x ACROSS the width, y along
    the length (finale-orbit GEO law) — so az 0/180 puts the camera on
    the +-x flanks (SIDE-ON view of the long rails) and az +-90 on the
    +-y ends (END-ON down the length; pose-verified on the az-90 probe
    frame, identity lane 2026-08-21). corner orbit = close band."""
    if orbit != 'fulltable':
        return 'close'
    a = abs(az_deg) % 360
    d_side = min(a, abs(a - 180), abs(a - 360))
    d_end = min(abs(a - 90), abs(a - 270))
    if d_end <= 35:
        return 'end'
    if d_side <= 35:
        return 'side'
    return 'oblique'

def main(d):
    # FIX3 (review round 3 on #731 P2 (a)): the prior per-orbit verdict is removed as the FIRST effect, before any
    # input refusal (a refused re-judge must never leave the previous report.json standing)
    import sys as _sys0
    _sys0.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
    from argpaths import invalidate_path as _invalidate_path
    if not str(d).strip(): print('[orbitsweep-judge.py] REFUSED — a blank orbit directory names no destination; nothing was removed', file=sys.stderr); sys.exit(2)  # FIX9: a value the writer would refuse owns nothing
    # FIX10 parse-complete — the positional parse (the orbit dir, blank refused; --encoded / --encoded-selftest dispatched by the caller) is done; the first effect follows
    _invalidate_path(os.path.join(d, 'report.json'), tag='orbitsweep-judge.py')
    if not os.path.isfile(os.path.join(d, 'meta.json')): print(f'[orbitsweep-judge.py] REFUSED — {d!r} has no meta.json (not an orbit directory)', file=sys.stderr); sys.exit(2)  # FIX10: an input guard after the first effect, exit 2 by name
    meta = json.load(open(os.path.join(d, 'meta.json')))
    win = meta['windows']
    n = meta['frames']
    rows = []
    fails = []
    # RULING R-S8-4 (R3-SNK-9): encoder-bloom exclusion context for the
    # enc_dline census — window (driver WINDOWS.enc_bloom, mirrored into
    # meta.windows), numpy/scipy (their absence fails the frame loud,
    # the screen row's own law) and the continuous run's v-index step
    # (e{i}.png decodes run/v{i*vstep}.png — the encode pass law; the
    # classifier must read the encoder's INPUT, never the f-frame).
    bloom_w = win.get('enc_bloom')
    # RULING V8-C1 (R3-SNK-9): geometric fall-disc scoping window
    # (driver WINDOWS.enc_fallmask, mirrored into meta.windows) — no
    # Python default; its absence fails every frame loud.
    fm_w = win.get('enc_fallmask')
    try:
        import numpy as _bnp
        from scipy import ndimage as _bndi  # noqa: F401 (dependency probe)
        bloom_deps = True
    except Exception:
        bloom_deps = False
    _run_dir = os.path.join(d, 'run')
    _run_n = len([f2 for f2 in os.listdir(_run_dir)
                  if f2.startswith('v') and f2.endswith('.png')]) \
        if os.path.isdir(_run_dir) else 0
    vstep = _run_n // n if (n and _run_n and _run_n % n == 0) else None
    for i in range(n):
        fp = os.path.join(d, f'f{i:03d}.png')
        mp = os.path.join(d, f'm{i:03d}.png')
        img = Image.open(fp).convert('RGB')
        msk = Image.open(mp).convert('RGB')
        w, h = img.size
        px = img.load()
        mx = msk.load()
        az = meta['poses'][i]['az_deg']
        band = bearing_band(meta['orbit'], az)
        # classify mask pixels (2x2 subsample)
        boot_l, cloth_l, rail_hsv, leg_hsv, apron_hsv = [], [], [], [], []
        leg_xs = []  # (o) B4 leg-count census
        cloth_xs = []
        lamp = set()
        cloth_set = set()
        cloth_lum = {}
        blown_all = 0
        boot_blown = 0
        # 489 BLOCKER-CURE accumulators (rows h-n)
        falls_i = meta['poses'][i].get('falls', [])
        # projected MOUTH radius: falls rpx encodes r*1.8 (driver law)
        mouths = [(fx, fy, (fr / 1.8) * 1.12) for fx, fy, fr in falls_i]
        throat_l = []
        throat_blown = 0
        rail_green = 0
        mint_s_max = win.get('junction_mint_s_max', 0.62)
        mint_v_min = win.get('junction_mint_v_min', 0.55)
        cloth_hsv = {}
        gclip = 0
        boot_rows = {}
        net_rows = {}
        net_px_n = 0
        for y in range(0, h, 2):
            for x in range(0, w, 2):
                cls = classify(*mx[x, y])
                r, g, b = px[x, y]
                lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
                v = max(r, g, b) / 255
                if cls == 'boot':
                    boot_l.append(lum)
                    if v >= 0.98:
                        boot_blown += 1
                    br = boot_rows.get(y)
                    boot_rows[y] = (x, x) if br is None \
                        else (min(br[0], x), max(br[1], x))
                elif cls == 'cloth':
                    cloth_l.append(lum)
                    cloth_set.add((x, y))
                    cloth_xs.append(x)
                    cloth_lum[(x, y)] = lum
                    s = 0 if max(r, g, b) == 0 \
                        else (max(r, g, b) - min(r, g, b)) / max(r, g, b)
                    hh = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)[0] * 360
                    if 100 <= hh <= 170 and s <= mint_s_max and v >= mint_v_min:
                        cloth_hsv[(x, y)] = v
                elif cls == 'rail':
                    hsv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
                    rail_hsv.append(hsv)
                    if 70 <= hsv[0] * 360 <= 170 and hsv[1] >= 0.25 \
                            and hsv[2] >= 0.08:
                        # erode (round 2): thin far-rail slivers at
                        # grazing bleed cloth beauty under rail mask —
                        # count interior rail pixels only (all four
                        # 2-px neighbours also rail); the true flank
                        # band is interior by construction
                        if all(classify(*mx[min(w - 1, max(0, x + dx3)),
                                            min(h - 1, max(0, y + dy3))])
                               == 'rail'
                               for dx3, dy3 in ((-2, 0), (2, 0),
                                                (0, -2), (0, 2))):
                            rail_green += 1
                elif cls == 'leg':
                    leg_hsv.append(colorsys.rgb_to_hsv(r / 255, g / 255, b / 255))
                    leg_xs.append(x)
                elif cls == 'apron':
                    apron_hsv.append(colorsys.rgb_to_hsv(r / 255, g / 255, b / 255))
                elif cls == 'lamp':
                    lamp.add((x, y))
                if cls in ('net', 'fallwall'):
                    if cls == 'net':
                        net_px_n += 1
                        nr = net_rows.get(y)
                        net_rows[y] = (x, x) if nr is None \
                            else (min(nr[0], x), max(nr[1], x))
                    if any((x - fx) ** 2 + (y - fy) ** 2 <= rr * rr
                           for fx, fy, rr in mouths):
                        throat_l.append(lum)
                        if v >= 0.95:
                            throat_blown += 1
                if r + g + b >= 720 and max(r, g, b) >= 250 \
                        and max(r, g, b) - min(r, g, b) <= 31:
                    blown_all += 1  # V>=0.98, S<=0.12 (warm-white blowout)
                # 489 PASS-2 (D-line clip census, verdict item 5): the
                # ledger row 6 claim "never clips" was falsified by
                # G>=254 on the baulk line/D in 629/690 shipped fulltable
                # frames. Census every G-clipped pixel that lies ON the
                # cloth (any cloth-mask pixel within 6 px — the marking
                # decal is always cloth-flanked; hardware specular
                # glints far from cloth are the blown_frame_frac lane's
                # business, identical on the red basis and cure trees)
                # review pass2-r1 P2: the 2x2 subsample would skip a
                # 1-px line on odd rows/cols — the zero-tolerance census
                # inspects ALL FOUR pixels of the block
                if cls != 'lamp':
                    for bdx, bdy in ((0, 0), (1, 0), (0, 1), (1, 1)):
                        xb, yb = x + bdx, y + bdy
                        if xb >= w or yb >= h:
                            continue
                        if px[xb, yb][1] < 254:
                            continue
                        for dx3, dy3 in ((6, 0), (-6, 0), (0, 6), (0, -6),
                                         (6, 6), (-6, -6), (6, -6), (-6, 6)):
                            xx, yy = xb + dx3, yb + dy3
                            if 0 <= xx < w and 0 <= yy < h \
                                    and classify(*mx[xx, yy]) == 'cloth':
                                gclip += 1
                                break
        # 489 PASS-2 (boot silhouette-bleed, verdict item 6 — the
        # retired lampshade class resurrected by the bloom pass under
        # studio_xw101). Per boot-edge ROW with a LOCAL baseline: the
        # halo decays over 60-100 px, so near(8-40) minus mid(60-110)
        # captures it while venue floor-pool gradients (global, gentle)
        # cancel. Rows qualify only when both bands are pure background
        # ('other' class), the near band carries no bright furniture
        # (max <= 0.55 — strap/trim rows disqualify themselves) and the
        # mid median is dark (<= 0.30); the frame judges at >= 100
        # qualified rows. Basis: be56a831 fires 0.036-0.055 at the i2-5
        # and i49-51 bearings; the bloom-killed tree reads <= 0.015.
        sil_lifts = []
        for by, (bx0, bx1) in boot_rows.items():
            for sgn, bx in ((1, bx1), (-1, bx0)):
                near, mid = [], []
                for off in range(8, 41, 2):
                    x2 = bx + sgn * off
                    if 0 <= x2 < w and classify(*mx[x2, by]) == 'other':
                        r2, g2, b2 = px[x2, by]
                        near.append(
                            (0.2126 * r2 + 0.7152 * g2 + 0.0722 * b2) / 255)
                for off in range(60, 111, 2):
                    x2 = bx + sgn * off
                    if 0 <= x2 < w and classify(*mx[x2, by]) == 'other':
                        r2, g2, b2 = px[x2, by]
                        mid.append(
                            (0.2126 * r2 + 0.7152 * g2 + 0.0722 * b2) / 255)
                if len(near) >= 8 and len(mid) >= 8 and max(near) <= 0.55:
                    mmed = sorted(mid)[len(mid) // 2]
                    if mmed <= 0.30:
                        sil_lifts.append(
                            sorted(near)[len(near) // 2] - mmed)
        row = {'i': i, 'orbit': meta['orbit'], 'az_deg': az, 'band': band}
        med = lambda a: sorted(a)[len(a) // 2] if a else None
        # corner-orbit scope: the halo class lives at the corner-orbit
        # register (every lens frame was corner); at fulltable range the
        # boot spans ~10 rows and the metric reads venue floor-pool
        # gradients (measured 0.0356 on the BLOOM-KILLED tree at az -50
        # — real light, not bleed)
        # pass-3 75-grid scoping (the pass-2 fulltable-null precedent):
        # at the az 55-90 corner arc the boot stands against the LIT
        # floor pool by the near leg — the near-band lift reads the
        # pool boundary (measured 0.169 on content BYTE-EQUAL to the
        # sealed family: identical pre/post every pass-3 render cure,
        # and present in the shipped co f258 family frames), not a halo.
        # The halo class (0.036-0.215 on be56a831) lives at the dark-
        # background arcs, which stay judged + red-armed (i2-5/i49-51).
        az_n = az % 360
        pool_arc = meta['orbit'] == 'corner' and 55 < az_n < 90
        if meta['orbit'] == 'corner' and len(sil_lifts) >= 100 \
                and not pool_arc:
            row['sil_bleed'] = round(med(sil_lifts), 4)
        else:
            row['sil_bleed'] = None
        row['gclip_px'] = gclip
        # ---- 489 PASS-3 SHIPPED-ENCODE census (adversarial pass #3 B1
        # structural mandate): the pass-2 dline row judged the CAPTURE
        # plane and the shipped 4:2:0 encode clipped anyway (630/690
        # frames, G=255 tracing the markings — the capture stored zero
        # headroom and the 2x2 chroma slots blend toward the flanking
        # cloth). The driver round-trips every beauty frame through the
        # exact shipped encoder settings (encode.sh verbatim: libx264
        # crf 14 medium yuv420p) and the DECODED bytes are censused here
        # with the same mask rules:
        #   enc_gclip_px — G>=254 on/next to cloth, non-lamp (the D-line
        #     family at the plane the pass-2 wording was falsified on);
        #   enc_rclip_px — non-lamp R>=254 census (the B2 warm-clip
        #     family: stitch rows, boot-crown cream/plum boundary
        #     texels, leg-gold glints, rail-band crest).
        # The G law splits CLUSTERED vs LONE decoded clips: the B1 defect
        # class is the line BODY tracing at G=255 (600-1100 connected px
        # per shipped frame); isolated single-pixel clips are the
        # PHYSICAL FLOOR of white markings on green cloth under 4:2:0 —
        # a sub-pixel spot/AA edge stores its neighbours' green chroma
        # and no visible-marking albedo can zero the worst-case +38
        # share (measured: taking the singleton floor to zero erases the
        # line into the cloth). Windows: clustered = 0 (any 8-connected
        # pair fires); lone <= enc_dline_lone_max, recorded per frame
        # and worded in the ledger.
        row['enc_gclip_px'] = None
        row['enc_gclip_cluster_px'] = None
        row['enc_gclip_lone_px'] = None
        row['enc_rclip_px'] = None
        ep = os.path.join(d, f'e{i:03d}.png')
        if os.path.exists(ep):
            eimg = Image.open(ep).convert('RGB')
            epx = eimg.load()
            ew, eh = eimg.size  # encoder pads to even dims; mask covers
            er = 0
            gset = set()
            for y in range(0, min(h, eh), 2):
                for x in range(0, min(w, ew), 2):
                    if classify(*mx[x, y]) == 'lamp':
                        continue
                    for bdx, bdy in ((0, 0), (1, 0), (0, 1), (1, 1)):
                        xb, yb = x + bdx, y + bdy
                        if xb >= min(w, ew) or yb >= min(h, eh):
                            continue
                        pr, pg, pb = epx[xb, yb]
                        if pr >= 254:
                            er += 1
                        if pg >= 254:
                            for dx3, dy3 in ((6, 0), (-6, 0), (0, 6),
                                             (0, -6), (6, 6), (-6, -6),
                                             (6, -6), (-6, 6)):
                                xx, yy = xb + dx3, yb + dy3
                                if 0 <= xx < w and 0 <= yy < h \
                                        and classify(*mx[xx, yy]) == 'cloth':
                                    gset.add((xb, yb))
                                    break
            # connected components (8-neighbour BFS): the defect class is
            # the LINE BODY tracing (shipped components run 50-1000+ px);
            # a fully-clipped SPOT decal at fulltable range is a <= 8 px
            # blob (the 4:2:0 physical floor for white-on-green marks)
            def _comps8(pset):
                seen = set()
                out = []  # member lists — the bloom classifier reads them
                mx8 = 0
                for p0 in pset:
                    if p0 in seen:
                        continue
                    stack = [p0]
                    seen.add(p0)
                    members = []
                    while stack:
                        (x, y) = stack.pop()
                        members.append((x, y))
                        for dx3 in (-1, 0, 1):
                            for dy3 in (-1, 0, 1):
                                q = (x + dx3, y + dy3)
                                if q in pset and q not in seen:
                                    seen.add(q)
                                    stack.append(q)
                    out.append(members)
                    mx8 = max(mx8, len(members))
                return out, mx8
            comps, maxcomp = _comps8(gset)
            # RAW census (before ANY exclusion layer) — recorded beside
            # the judged values so the report shows every exclusion
            row['enc_gclip_px_raw'] = len(gset)
            row['enc_gclip_maxcomp_raw'] = maxcomp
            # RULING V8-C1 (R3-SNK-9): GEOMETRIC fall-disc scoping,
            # FIRST layer. Pixels inside the projection of the render
            # fall discs (poses[i].fall_polys — written by the capture
            # from the live camera, driver projectFallPolys) plus the
            # rim are not cloth a line can be drawn on; they leave the
            # census before the components are formed. No polygons /
            # no window / no numpy -> the state fails the frame loud
            # below (an old capture is a judge item, never GREEN); a
            # mask past the viewport ceiling is a projection defect:
            # the frame judges RAW (no exclusion) and fails loud.
            fm_state = 'ok'
            fall_px = 0
            fm_area = None
            polys_i = meta['poses'][i].get('fall_polys')
            if fm_w is None:
                fm_state = 'enc_fallmask_window_missing'
            elif not bloom_deps:
                fm_state = 'fall_poly_deps_missing'
            elif polys_i is None:
                fm_state = 'fall_poly_missing'
            else:
                fmask, _fm_fill, fm_area = fall_mask(
                    polys_i, w, h, fm_w['rim_px'])
                if fm_area > fm_w['frac_max'] * w * h:
                    fm_state = 'fall_mask_oversize'
                else:
                    kept = set()
                    for (xg, yg) in gset:
                        if yg < fmask.shape[0] and xg < fmask.shape[1] \
                                and fmask[yg, xg]:
                            fall_px += 1
                        else:
                            kept.add((xg, yg))
                    gset = kept
                    comps, maxcomp = _comps8(gset)
            row['enc_fallmask_px'] = fall_px
            row['enc_fallmask_state'] = fm_state
            row['enc_fallmask_area_px'] = fm_area
            row['enc_fallmask_area_frac'] = (
                round(fm_area / (w * h), 4) if fm_area is not None else None)
            # RULING R-S8-4 (R3-SNK-9): ENCODER-CLASS exclusion, SECOND
            # layer, on what the geometric scoping left. Each component
            # is classified by enc_bloom_component() BEFORE it counts
            # toward the comp/total laws; the excluded bloom counts are
            # recorded beside the judged values so the report shows the
            # exclusion. Never a per-frame allowlist: the classifier
            # reads the encoder's input (run/v), the decoded plane and
            # the mask class.
            bloom_px = 0
            bloom_n = 0
            net_maxcomp = maxcomp
            bloom_state = 'ok'
            src_p = (os.path.join(d, 'run', f'v{i * vstep:04d}.png')
                     if vstep is not None else None)
            if not bloom_deps:
                bloom_state = 'enc_bloom_deps_missing'
            elif bloom_w is None:
                bloom_state = 'enc_bloom_window_missing'
            elif src_p is None or not os.path.exists(src_p):
                bloom_state = 'enc_bloom_src_missing'
            elif comps:
                src_np = _bnp.asarray(Image.open(src_p).convert('RGB'),
                                      dtype=_bnp.int16)
                dec_np = _bnp.asarray(eimg, dtype=_bnp.int16)
                cloth_np = mask_cloth_exact(
                    _bnp.asarray(msk, dtype=_bnp.int16))
                hh2 = min(src_np.shape[0], dec_np.shape[0],
                          cloth_np.shape[0])
                ww2 = min(src_np.shape[1], dec_np.shape[1],
                          cloth_np.shape[1])
                src_np = src_np[:hh2, :ww2]
                dec_np = dec_np[:hh2, :ww2]
                cloth_np = cloth_np[:hh2, :ww2]
                net_maxcomp = 0
                for members in comps:
                    if any(x >= ww2 or y >= hh2 for x, y in members):
                        net_maxcomp = max(net_maxcomp, len(members))
                        continue
                    isb, _why = enc_bloom_component(
                        members, src_np, dec_np, cloth_np, bloom_w)
                    if isb:
                        bloom_px += len(members)
                        bloom_n += 1
                    else:
                        net_maxcomp = max(net_maxcomp, len(members))
            row['enc_bloom_px'] = bloom_px
            row['enc_bloom_comps'] = bloom_n
            row['enc_bloom_state'] = bloom_state
            row['enc_gclip_px'] = len(gset) - bloom_px
            row['enc_gclip_maxcomp'] = net_maxcomp
            row['enc_rclip_px'] = er
        # (a) boot
        bl, cl = med(boot_l), med(cloth_l)
        row['boot_px'] = len(boot_l)
        row['boot_l_med'] = round(bl, 3) if (bl and len(boot_l) > 400) else 0.0
        row['boot_cloth_ratio'] = round(bl / cl, 3) if (bl and cl and cl > 0.02
            and len(boot_l) > 400) else 0.0
        row['boot_blown_frac'] = round(boot_blown / len(boot_l), 4) if len(boot_l) > 400 else 0.0
        # (b) rail identity
        row['rail_px'] = len(rail_hsv)
        if len(rail_hsv) > 400:
            mag = sum(1 for (hh, ss, vv) in rail_hsv
                      if 290 <= hh * 360 <= 350 and ss >= 0.45 and vv >= 0.30)
            Vs = sorted(v for (_, _, v) in rail_hsv)
            row['rail_magenta_frac'] = round(mag / len(rail_hsv), 4)
            row['rail_v_med'] = round(med([v for (_, _, v) in rail_hsv]), 3)
            row['rail_s_med'] = round(med([s for (_, s, _) in rail_hsv]), 3)
            row['rail_h_med'] = round(med([hh * 360 for (hh, _, _) in rail_hsv]), 1)
            row['rail_bright_frac'] = round(
                sum(1 for v in Vs if v >= 0.75) / len(Vs), 4)
        else:
            row['rail_magenta_frac'] = 0.0
            row['rail_v_med'] = 0.0
            row['rail_s_med'] = 0.0
            row['rail_h_med'] = 0.0
            row['rail_bright_frac'] = 0.0
        # (e) leg identity
        row['leg_px'] = len(leg_hsv)
        leg_min = win.get('leg_min_px', {}).get(meta['orbit'], 1500)
        if len(leg_hsv) >= leg_min:
            Vs = sorted(v for (_, _, v) in leg_hsv)
            nl = len(Vs)
            row['leg_h_med'] = round(med([hh * 360 for (hh, _, _) in leg_hsv]), 1)
            row['leg_s_med'] = round(med([s for (_, s, _) in leg_hsv]), 3)
            row['leg_v_med'] = round(med(Vs), 3)
            row['leg_v_spread'] = round(Vs[int(nl * 0.9)] - Vs[int(nl * 0.1)], 3)
        else:
            row['leg_h_med'] = None
            row['leg_s_med'] = None
            row['leg_v_med'] = None
            row['leg_v_spread'] = None
        # (o) B4 leg-count census (fulltable side band)
        row['leg_clusters'] = None
        row['leg_mid'] = None
        lcw = win.get('leg_count')
        a_n = abs(az_deg_norm := (az % 360))
        d_side = min(a_n, abs(a_n - 180), abs(a_n - 360))
        if lcw and meta['orbit'] == 'fulltable' and band == 'side' \
                and d_side <= lcw.get('d_side_max', 35) \
                and len(leg_xs) >= win.get('leg_min_px', {}).get(
                    meta['orbit'], 800):
            xs = sorted(set(leg_xs))
            gap = lcw.get('gap_px', 40)
            clusters = []
            cur = [xs[0]]
            for xv in xs[1:]:
                if xv - cur[-1] > gap:
                    clusters.append(cur)
                    cur = [xv]
                else:
                    cur.append(xv)
            clusters.append(cur)
            # drop dust clusters (< 6 subsampled columns)
            clusters = [c for c in clusters if len(c) >= 6]
            row['leg_clusters'] = len(clusters)
            mid_ok = False
            if cloth_xs:
                cx0, cx1 = min(cloth_xs), max(cloth_xs)
                mid = (cx0 + cx1) / 2
                tol = lcw.get('mid_frac', 0.15) * max(1, cx1 - cx0)
                for c in clusters:
                    cc = sum(c) / len(c)
                    if abs(cc - mid) <= tol:
                        mid_ok = True
            row['leg_mid'] = mid_ok
        # (p) B2 interior-material ordering (corner orbit, over-table arc)
        row['interior_hole_ratio'] = None
        row['interior_ann_ratio'] = None
        iw = win.get('interior')
        if iw and meta['orbit'] == 'corner':
            az_n = az % 360
            az_lo, az_hi = iw.get('az', [95, 200])
            # BLOCKER-CURE B2: sample about the VISUAL bore (O_f — the
            # driver's `bores` projections; radius probe = R_FALL*1.8),
            # never the kernel capture centre 44.5 mm outboard of it
            # (a kernel-centred disc sampled the lit leather crown).
            bores_i = meta['poses'][i].get('bores', [])
            az_hole = iw.get('az_hole', [133, 152])
            best = None
            for f3 in bores_i:
                fx, fy, fr = f3
                if 0.08 * w < fx < 0.92 * w and 0.08 * h < fy < 0.92 * h \
                        and fr >= iw.get('min_rpx', 100) \
                        and (best is None or fr > best[2]):
                    best = (fx, fy, fr)
            cl_med = med(cloth_l)
            if best and az_lo <= az_n <= az_hi and cl_med and cl_med > 0.05:
                fx, fy, fr = best
                # zones in bore units (proj radius = R_FALL*1.8 = 52.2mm
                # projected at mid-shaft depth −0.03):
                # hole disc <= 0.32 (<= 16.7mm, inside the D58 bore);
                # knit annulus 0.60..0.95 (31..50mm — the ring band)
                hole_l, ann_l = [], []
                for y in range(max(0, int(fy - fr)), min(h, int(fy + fr)), 2):
                    for x in range(max(0, int(fx - fr)),
                                   min(w, int(fx + fr)), 2):
                        dd = math.hypot(x - fx, y - fy) / fr
                        r, g, b = px[x, y]
                        lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
                        if dd <= 0.32:
                            hole_l.append(lum)
                        elif 0.60 <= dd <= 0.95:
                            ann_l.append(lum)
                hm, am = med(hole_l), med(ann_l)
                # the hole/ann-floor rows judge only where the shaft is
                # actually VISIBLE (the corner-diagonal arc az_hole; at
                # oblique bearings the lit knit wall legitimately fills
                # the zones — measured on cured + red trees alike)
                if hm is not None and len(hole_l) > 60 \
                        and az_hole[0] <= az_n <= az_hole[1]:
                    row['interior_hole_ratio'] = round(hm / cl_med, 3)
                if am is not None and len(ann_l) > 60:
                    row['interior_ann_ratio'] = round(am / cl_med, 3)
                    row['interior_ann_floor_armed'] = (
                        az_hole[0] <= az_n <= az_hole[1])
        # (f) apron guard
        row['apron_px'] = len(apron_hsv)
        apron_min = win.get('apron_min_px', 1500)
        if len(apron_hsv) >= apron_min:
            row['apron_v_med'] = round(med([v for (_, _, v) in apron_hsv]), 3)
            row['apron_s_med'] = round(med([s for (_, s, _) in apron_hsv]), 3)
        else:
            row['apron_v_med'] = None
            row['apron_s_med'] = None
        # (g) seam-glow junction scan (full-res columns, step 2 in x)
        juncols = 0
        glowcols = 0
        for x in range(0, w, 2):
            lastrail = None
            y = 0
            while y < h - 1:
                c = classify(*mx[x, y])
                if c == 'rail':
                    lastrail = y
                elif c == 'apron' and lastrail is not None \
                        and 0 < y - lastrail <= 24:
                    juncols += 1
                    for yy in range(lastrail + 1, y):
                        r, g, b = px[x, yy]
                        v = max(r, g, b) / 255
                        s = 0 if max(r, g, b) == 0 \
                            else (max(r, g, b) - min(r, g, b)) / max(r, g, b)
                        if v >= 0.90 and s <= 0.45:
                            glowcols += 1
                            break
                    lastrail = None
                y += 1
        row['seam_juncols'] = juncols
        row['seam_glow_frac'] = round(glowcols / juncols, 3) if juncols else 0.0
        # ---- 489 BLOCKER-CURE rows (h-n) ----
        # (h) throat interior vs bed
        row['throat_px'] = len(throat_l)
        t_min = win.get('throat_min_px', 400)
        if len(throat_l) >= t_min and cl and cl > 0.02:
            row['throat_l_med'] = round(med(throat_l), 3)
            row['throat_cloth_ratio'] = round(med(throat_l) / cl, 3)
            row['throat_blown_frac'] = round(throat_blown / len(throat_l), 4)
        else:
            row['throat_l_med'] = None
            row['throat_cloth_ratio'] = None
            row['throat_blown_frac'] = None
        # (i) apron hue rides the existing apron row (fields below)
        if len(apron_hsv) >= apron_min:
            row['apron_h_med'] = round(
                med([hh * 360 for (hh, _, _) in apron_hsv]), 1)
        else:
            row['apron_h_med'] = None
        # (j) rail green-flank (the alien band read rode the woodMat
        # flank; measured apron-class green was ~0 on red and cured trees
        # alike — the rail row carries the red-armed green-flank family)
        row['rail_green_frac'] = round(rail_green / len(rail_hsv), 4) \
            if len(rail_hsv) > 400 else 0.0
        # (k) cushion-base/bed junction glow — RIDGE census (round 2: a
        # global mint-signature count conflated the legit lamp POOL,
        # which shares the strip's exact HSV; the defect is a LOCAL
        # BRIGHT RIDGE at the crease — brighter than the cloth both
        # above and below it — which a smooth pool can never satisfy)
        mint_ridge = 0
        for (x, y), v2 in cloth_hsv.items():
            up = cloth_lum.get((x, y - 10))
            dn = cloth_lum.get((x, y + 10))
            here = cloth_lum.get((x, y))
            if up is not None and dn is not None and here is not None \
                    and here - up >= 0.10 and here - dn >= 0.10:
                mint_ridge += 1
        row['cloth_mint_frac'] = round(mint_ridge / len(cloth_l), 5) \
            if cloth_l else 0.0
        # (l) close-zoom cloth purity — LOCAL-OUTLIER dot census (round
        # 2: a frame-median threshold read the far lamp pool as "dots"
        # whenever the near cloth was dim; salt is a local outlier, a
        # pool is smooth) + high-frequency contrast
        if band == 'close' and len(cloth_l) > 4000:
            dots = 0
            dotn = 0
            for (cx2, cy2), lv in cloth_lum.items():
                nb = [cloth_lum.get((cx2 - 4, cy2)),
                      cloth_lum.get((cx2 + 4, cy2)),
                      cloth_lum.get((cx2, cy2 - 4)),
                      cloth_lum.get((cx2, cy2 + 4))]
                nb = [n2 for n2 in nb if n2 is not None]
                if len(nb) >= 3:
                    dotn += 1
                    if lv >= sum(nb) / len(nb) + 0.10:
                        dots += 1
            row['cloth_dot_frac'] = round(dots / dotn, 5) if dotn else None
            hf, hfn = 0.0, 0
            for (cx2, cy2), lv in cloth_lum.items():
                nb = cloth_lum.get((cx2 + 2, cy2))
                if nb is not None:
                    hf += abs(lv - nb)
                    hfn += 1
            row['cloth_hf_mean'] = round(hf / hfn, 5) if hfn else None
        else:
            row['cloth_dot_frac'] = None
            row['cloth_hf_mean'] = None
        # (m) boot top-silhouette kink census (full-res mask scan, close
        # band + near-boot frames only — the facet class lives there)
        row['boot_kink_count'] = None
        if band == 'close' and len(boot_l) >= 4000:
            xs_b = [xr for pr in boot_rows.values() for xr in pr]
            if xs_b:
                x0b, x1b = max(0, min(xs_b) - 4), min(w - 1, max(xs_b) + 4)
                y0b = max(0, min(boot_rows.keys()) - 6)
                y1b = min(h - 1, max(boot_rows.keys()) + 6)
                top = {}
                for x2 in range(x0b, x1b + 1):
                    for y2 in range(y0b, y1b + 1):
                        if classify(*mx[x2, y2]) == 'boot':
                            top[x2] = y2
                            break
                kinks = 0
                run = sorted(top.keys())
                # continuous runs only (edge breaks at wires/horns reset)
                seg = []
                segs = []
                for x2 in run:
                    if seg and (x2 - seg[-1] > 1
                                or abs(top[x2] - top[seg[-1]]) > 3):
                        segs.append(seg)
                        seg = []
                    seg.append(x2)
                if seg:
                    segs.append(seg)
                kdeg = win.get('sil_kink_deg', 8.0)
                # ISOLATED-spike law (round 2): a smooth tight roll turns
                # ~15-20 deg per 8 px window at its silhouette edges —
                # raw window-turn thresholds fire on legitimate curvature
                # at video zoom. A tessellation facet is a turn spike
                # BETWEEN two near-straight runs (the polyline signature:
                # flats carry ~0, the junction column carries the whole
                # station angle). The geometric station law itself is
                # red-armed in check-pocket-construction (C9); this row
                # is the live low-poly-regression guard.
                for sg in segs:
                    if len(sg) < 24:
                        continue
                    dds = []
                    for j in range(8, len(sg) - 8, 4):
                        xa, xm2, xb2 = sg[j - 8], sg[j], sg[j + 8]
                        s1 = math.atan2(top[xm2] - top[xa], xm2 - xa)
                        s2 = math.atan2(top[xb2] - top[xm2], xb2 - xm2)
                        dd = abs(math.degrees(s2 - s1))
                        if dd > 180:
                            dd = 360 - dd
                        # 489 WEDGE+PLATFORM cure (instrument
                        # re-derivation, same mechanism family as the
                        # az-55-90 wire allowance): a turn at the
                        # capping-edge OCCLUSION CROSSING is mask
                        # topology, not boot tessellation. The cured
                        # dome->brim shoulder legitimately lowers the
                        # crown line, so the straight capping edge now
                        # overlaps the boot mask at shallow angles
                        # (pre-cure the crossing was steep: the >3 px
                        # column step BROKE the run and never counted).
                        # Review wedge-cure r1 P2 TIGHTENING: "railwood
                        # anywhere 2-6 px above the vertex" also held
                        # for a REAL facet sitting just under the rail
                        # overhang — that facet was hidden. Honest
                        # scoping instead of a smarter heuristic: when
                        # the window is OCCLUDER-CONTAMINATED (railwood
                        # within 8 px above the silhouette on >= 50% of
                        # the 17 window columns — measured crossings
                        # read 53-100%, free-edge content reads 0%,
                        # gap census: OB_KINK_DEBUG=1), the top-edge
                        # read interleaves boot-AA and rail-bottom
                        # pixels and carries no attributable boot
                        # geometry: the sample ABSTAINS. The class is
                        # owned at the MESH plane by check-pocket C13
                        # (azimuthal station law, occlusion-free arc
                        # scans — added with this tightening) next to
                        # the red-armed C9/C11 radial laws; a facet on
                        # the FREE silhouette still counts here.
                        def rail_gap(xq):
                            for dy2 in range(1, 9):
                                yy2 = top[xq] - dy2
                                if yy2 < 0:
                                    return None
                                if classify(*mx[xq, yy2]) == 'rail':
                                    return dy2 - 1
                            return None
                        gaps = [rail_gap(xq) for xq in sg[j - 8:j + 9]]
                        rail_frac = sum(1 for gq in gaps
                                        if gq is not None) / len(gaps)
                        contaminated = rail_frac >= 0.5
                        if os.environ.get('OB_KINK_DEBUG') \
                                and dd >= kdeg * 0.45:
                            print(f'[kink-dbg] x{xm2} dd {dd:.1f} '
                                  f'railfrac {rail_frac:.2f} {gaps} '
                                  f'{"ABSTAIN" if contaminated else "COUNT"}')
                        dds.append(0.0 if contaminated else dd)
                    for j in range(1, len(dds) - 1):
                        if dds[j] >= kdeg and dds[j - 1] <= kdeg * 0.45 \
                                and dds[j + 1] <= kdeg * 0.45:
                            kinks += 1
                row['boot_kink_count'] = kinks
        # (n) net anatomy: sock width under the boot hem vs boot width.
        # Basis row = the boot's WIDEST row (the hem — the max-y row can
        # be a horn sliver or a far middle valance); net rows judged only
        # inside the hem's own x-window so a far pocket's sock never
        # inflates the read.
        row['net_px'] = net_px_n
        row['net_boot_wfrac'] = None
        # close band only: at fulltable range the sock is sub-pixel and
        # the width read is quantization noise
        if band == 'close' and net_px_n >= win.get('net_min_px', 150) \
                and boot_rows:
            yb, (bx0, bx1) = max(boot_rows.items(),
                                 key=lambda kv: kv[1][1] - kv[1][0])
            bw = bx1 - bx0
            # a near boot (>=300 real px wide), hem in frame
            if bw >= 300 and yb < h - 20:
                widths = []
                for y2, nr in net_rows.items():
                    if not (yb < y2 <= yb + 150):
                        continue
                    x0c = max(nr[0], bx0 - 30)
                    x1c = min(nr[1], bx1 + 30)
                    if x1c > x0c:
                        widths.append(x1c - x0c)
                if len(widths) >= 8:
                    widths.sort()
                    p90w = widths[int(len(widths) * 0.9)]
                    row['net_boot_wfrac'] = round(p90w / bw, 3)
        # (c) void census: near-black blobs ringed by cloth, off-mouth
        falls = meta['poses'][i].get('falls', [])
        dark = {}
        for y in range(0, h, 2):
            for x in range(0, w, 2):
                r, g, b = px[x, y]
                if max(r, g, b) <= 23:  # V <= 0.09
                    dark[(x, y)] = -1
        blobs = []
        bid = 0
        for p in list(dark):
            if dark[p] != -1:
                continue
            stack = [p]
            dark[p] = bid
            comp = []
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                for dx2, dy2 in ((2, 0), (-2, 0), (0, 2), (0, -2)):
                    q = (cx + dx2, cy + dy2)
                    if dark.get(q) == -1:
                        dark[q] = bid
                        stack.append(q)
            blobs.append(comp)
            bid += 1
        voids = 0
        void_boxes = []
        for comp in blobs:
            if len(comp) < 120:  # 120 subsampled px = 480 real px
                continue
            cx = sum(p[0] for p in comp) / len(comp)
            cy = sum(p[1] for p in comp) / len(comp)
            if any((cx - fx) ** 2 + (cy - fy) ** 2 <= (fr * 2.6 / 1.8 + 8) ** 2
                   for fx, fy, fr in falls):
                continue
            ring = set()
            compset = set(comp)
            for (x, y) in comp:
                for dx2 in (-6, -4, -2, 0, 2, 4, 6):
                    for dy2 in (-6, -4, -2, 0, 2, 4, 6):
                        q = (x + dx2, y + dy2)
                        if q not in compset and 0 <= q[0] < w and 0 <= q[1] < h:
                            ring.add(q)
            if not ring:
                continue
            hits = sum(1 for q in ring if q in cloth_set)
            if hits / len(ring) >= 0.55:
                voids += 1
                xs = [p[0] for p in comp]
                ys = [p[1] for p in comp]
                void_boxes.append([min(xs), min(ys), max(xs), max(ys)])
        row['void_count'] = voids
        row['void_boxes'] = void_boxes
        # (d) blown fraction outside the lamp class (+6 px dilation)
        lamp_dilated = set()
        for (x, y) in lamp:
            for dx2 in (-6, -4, -2, 0, 2, 4, 6):
                for dy2 in (-6, -4, -2, 0, 2, 4, 6):
                    lamp_dilated.add((x + dx2, y + dy2))
        blown_nl = 0
        if blown_all:
            for y in range(0, h, 2):
                for x in range(0, w, 2):
                    r, g, b = px[x, y]
                    if r + g + b >= 720 and max(r, g, b) >= 250 \
                            and max(r, g, b) - min(r, g, b) <= 31 \
                            and (x, y) not in lamp_dilated:
                        blown_nl += 1
        row['blown_frame_frac'] = round(blown_nl / ((w // 2) * (h // 2)), 5)
        # ---- verdicts ----
        why = []
        # review orbit-cure r4 P2: missing class masks fail explicitly —
        # a renamed mesh or lost tag must never zero-pass the judges
        mins = (win.get('mask_min_px') or {}).get(meta['orbit'], {})
        if len(boot_l) < mins.get('boot', 0):
            why.append('mask_missing_boot')
        if len(rail_hsv) < mins.get('rail', 0):
            why.append('mask_missing_rail')
        if len(cloth_l) < mins.get('cloth', 0):
            why.append('mask_missing_cloth')
        if row['boot_l_med'] > win['boot_l_med_max']:
            why.append('boot_bright')
        if row['boot_blown_frac'] > win['boot_blown_frac_max']:
            why.append('boot_blown')
        if row['rail_magenta_frac'] > win['rail_magenta_frac_max']:
            why.append('rail_magenta')
        if row['rail_v_med'] > win['rail_v_med_max'] and row['rail_s_med'] > 0.30:
            why.append('rail_bright')
        # legacy neutral-flare cap (review identity r1 P2): captures made
        # before the per-band windows carry rail_flare_v_max in their
        # metadata — a judge-only re-run must keep enforcing it
        if 'rail_flare_v_max' in win \
                and row['rail_v_med'] > win['rail_flare_v_max']:
            why.append('rail_flare')
        # (b) per-band identity windows
        rv_max = win.get('rail_v_med_max_band', {}).get(band)
        if rv_max is not None and row['rail_px'] > 400 \
                and row['rail_v_med'] > rv_max:
            why.append('rail_white')
        rb_max = win.get('rail_bright_frac_max_band', {}).get(band)
        if rb_max is not None and row['rail_px'] > 400 \
                and row['rail_bright_frac'] > rb_max:
            why.append('rail_wash')
        # (e) leg identity
        lw = win.get('leg', {})
        if row['leg_s_med'] is not None and lw:
            if row['leg_s_med'] > lw['s_med_max']:
                why.append('leg_sat')
            if not (lw['h_med'][0] <= row['leg_h_med'] <= lw['h_med'][1]):
                why.append('leg_hue')
            if not (lw['v_med'][0] <= row['leg_v_med'] <= lw['v_med'][1]):
                why.append('leg_val')
            spread_min = lw['spread_min_close'] if band == 'close' \
                else lw['spread_min']
            if row['leg_v_spread'] < spread_min:
                why.append('leg_flat')
        # (o) leg count
        if row['leg_clusters'] is not None and lcw:
            if row['leg_clusters'] < lcw.get('min_clusters', 3):
                why.append('leg_count_low')
            if lcw.get('mid_required', True) and not row['leg_mid']:
                why.append('leg_mid_missing')
        # (p) interior material
        if iw:
            if row['interior_hole_ratio'] is not None \
                    and row['interior_hole_ratio'] > iw['hole_ratio_max']:
                why.append('interior_hole_bright')
            if row['interior_ann_ratio'] is not None:
                a_lo, a_hi = iw.get('ann_ratio', [0.3, 2.6])
                if row['interior_ann_ratio'] > a_hi:
                    why.append('interior_annulus')
                if row.get('interior_ann_floor_armed') \
                        and row['interior_ann_ratio'] < a_lo:
                    why.append('interior_annulus')
        # (f) apron guard
        aw = win.get('apron', {})
        if row['apron_v_med'] is not None and aw:
            if row['apron_v_med'] > aw['v_med_max']:
                why.append('apron_wash')
            if row['apron_s_med'] > aw['s_med_max']:
                why.append('apron_sat')
        # (g) seam glow
        if row['seam_juncols'] >= win.get('seam_min_cols', 20) \
                and row['seam_glow_frac'] > win.get('seam_glow_frac_max', 0.10):
            why.append('seam_glow')
        # ---- 489 BLOCKER-CURE verdicts (h-n); win.get so the 490
        # mirror and pre-round captures stay judgeable ----
        tr_max = win.get('throat_cloth_ratio_max')
        if tr_max is not None and row['throat_cloth_ratio'] is not None:
            if row['throat_cloth_ratio'] > tr_max:
                why.append('throat_glow')
            if row['throat_blown_frac'] > win.get('throat_blown_frac_max', 0.02):
                why.append('throat_blown')
        av_band = (win.get('apron_v_med_max_band') or {}).get(band)
        if av_band is not None and row['apron_v_med'] is not None \
                and row['apron_v_med'] > av_band:
            why.append('apron_stack')
        # apron BRICK guard (round 2 re-derivation): the dossier's own
        # apron family renders hue anywhere in 272-36 depending on the
        # rig (press 326-338, GM venue 272, the white-studio product
        # shots 28-36) — hue alone cannot gate. The BRICK class the
        # review measured is bright-AND-red (V 0.44 / H 1.5 vs the
        # archive's V<=0.33 at any hue): fire only when the median is
        # both in the red band AND above the dossier value family.
        ah_win = win.get('apron_h_med_win')
        if ah_win is not None and row.get('apron_h_med') is not None \
                and row['apron_v_med'] is not None \
                and row['apron_v_med'] >= win.get('apron_hue_v_min', 0.30):
            ah = row['apron_h_med']
            if ah < ah_win[0]:
                ah += 360  # wrap-aware red band (e.g. [345, 390])
            if ah_win[0] <= ah <= ah_win[1]:
                why.append('apron_hue')
        rg_max = win.get('rail_green_frac_max')
        if rg_max is not None and row['rail_px'] > 400 \
                and row['rail_green_frac'] > rg_max:
            why.append('rail_green')
        jg_max = win.get('junction_glow_frac_max')
        if jg_max is not None and row['cloth_mint_frac'] > jg_max:
            why.append('junction_glow')
        cd_max = win.get('cloth_dot_frac_max')
        if cd_max is not None and row['cloth_dot_frac'] is not None \
                and row['cloth_dot_frac'] > cd_max:
            why.append('cloth_dots')
        chf_max = win.get('cloth_hf_mean_max')
        if chf_max is not None and row['cloth_hf_mean'] is not None \
                and row['cloth_hf_mean'] > chf_max:
            why.append('cloth_hf')
        sk_max = win.get('sil_kink_count_max')
        if sk_max is not None and row['boot_kink_count'] is not None:
            # pass-3 75-grid: in the az 55-90 arc the wires/track CROSS
            # the boot mask (mask-topology spikes at the crossings, not
            # silhouette geometry — measured 5 on content byte-equal to
            # the sealed family; the low-poly regression class reads
            # 10+). +2 allowance there; the geometric station law is
            # check-pocket C9 with its own red arm.
            sk_eff = sk_max + (2 if (meta['orbit'] == 'corner'
                                     and 55 < (az % 360) < 90) else 0)
            if row['boot_kink_count'] > sk_eff:
                why.append('boot_kinks')
        sb_max = win.get('sil_bleed_max')
        if sb_max is not None and row.get('sil_bleed') is not None \
                and row['sil_bleed'] > sb_max:
            why.append('sil_bleed')
        gc_max = win.get('dline_clip_px_max')
        if gc_max is not None and row['gclip_px'] > gc_max:
            why.append('dline_clip')
        # 489 PASS-3 shipped-encode rows. A capture pass without decoded
        # e-frames must FAIL the frame when the windows are armed — an
        # encode pass that silently didn't run is the pass-2 plane gap
        # all over again (judged only when the driver wrote meta flag).
        egc_max = win.get('enc_dline_clip_px_max')
        if egc_max is not None:
            if row['enc_gclip_px'] is None:
                why.append('enc_dline_missing')
            elif max(0, row['enc_gclip_maxcomp']
                     - win.get('enc_dline_comp_max', 8)) > egc_max:
                # line-body class: any component beyond spot scale
                why.append('enc_dline')
            elif row['enc_gclip_px'] > win.get('enc_dline_total_max', 12):
                why.append('enc_dline_total')
            # RULING R-S8-4: a bloom exclusion that could not run (no
            # numpy/scipy, no enc_bloom window, no run/v source) fails
            # the frame loud — a silently unclassified census is the
            # pass-2 silent-plane lesson again.
            if row.get('enc_bloom_state', 'ok') != 'ok':
                why.append(row['enc_bloom_state'])
            # RULING V8-C1: a fall-disc scoping that could not run (no
            # polygons in the capture, no window, no numpy/scipy) or a
            # mask past the viewport ceiling fails the frame loud — an
            # old capture without polygons reads as a judge item (V8-C1
            # pending), never GREEN.
            if row.get('enc_fallmask_state', 'ok') != 'ok':
                why.append(row['enc_fallmask_state'])
        # (enc_rclip_px is RECORDED per bearing for the ledger-row
        # magnitude wording; the ARMED red rides the churn-quad counts
        # below, where the cadence matches the shipped artifact. A
        # missing encode pass still fails per frame via enc_dline.)
        if win.get('enc_rclip_px_max') is not None \
                and meta['orbit'] == 'corner' \
                and row['enc_rclip_px'] is None:
            why.append('enc_rclip_missing')
        if row['void_count'] > win['void_count_max']:
            why.append('voids')
        if row['blown_frame_frac'] > win['blown_frame_frac_max']:
            why.append('blown')
        row['fail'] = why
        rows.append(row)
        if why:
            fails.append(i)
            if len(fails) <= 6:
                img.save(os.path.join(d, f'FAIL-f{i:03d}-{"+".join(why)}.png'))
        lsm = row['leg_s_med'] if row['leg_s_med'] is not None else '-'
        print(f"[judge] {meta['orbit']} f{i:03d} az{az:>7} {band:<7}: "
              f"bootL {row['boot_l_med']:<5} railV {row['rail_v_med']:<5} "
              f"railBr {row['rail_bright_frac']:<6} legS {lsm:<5} "
              f"seam {row['seam_glow_frac']:<5} voids {voids} "
              f"blown {row['blown_frame_frac']:<7} "
              f"{'FAIL ' + '+'.join(why) if why else 'ok'}")
    # aggregate mask-missing floors (review identity r1 P2): the leg/
    # apron/seam rows soft-skip per frame (elements are legitimately
    # hidden at some bearings), so a WHOLLY missing class (renamed mesh,
    # lost tag) must fail at the ORBIT level — floors ride the windows
    # (absent = not enforced, e.g. the 490 frozen-tree mirror, disclosed).
    agg_fails = []
    agg_min = (win.get('agg_min_frac') or {}).get(meta['orbit'], {})
    if agg_min:
        counts = {
            'leg': sum(1 for r2 in rows if r2['leg_s_med'] is not None),
            'apron': sum(1 for r2 in rows if r2['apron_v_med'] is not None),
            'seam': sum(1 for r2 in rows
                        if r2['seam_juncols'] >= win.get('seam_min_cols', 20)),
            # review blocker-cure r2 P2: the B2 interior rows must be
            # MEASURED on the bore-visible arc — a lost bores projection
            # can never zero-pass the class
            'interior': sum(1 for r2 in rows
                            if r2.get('interior_hole_ratio') is not None),
            # 489 BLOCKER-CURE soft-skip rows: a capture that never sees
            # the throat / sock / a judgeable purity window must fail at
            # the orbit level (the throat row was the B8 gate escape)
            'throat': sum(1 for r2 in rows
                          if r2.get('throat_cloth_ratio') is not None),
            'net': sum(1 for r2 in rows
                       if r2.get('net_px', 0) >= win.get('net_min_px', 150)),
            'purity': sum(1 for r2 in rows
                          if r2.get('cloth_dot_frac') is not None),
            'kink': sum(1 for r2 in rows
                        if r2.get('boot_kink_count') is not None),
            'silb': sum(1 for r2 in rows
                        if r2.get('sil_bleed') is not None),
        }
        for k, frac in agg_min.items():
            # fraction of the CAPTURED frame count (review identity r2 P2:
            # absolute floors rejected valid --frames N short sweeps).
            # floor(), not ceil (review identity r3 P2): a sparse dev sweep
            # can legitimately sample only bearings where an element is
            # hidden (--frames 1 corner = az -90, no leg/apron/junction
            # in frame) — sub-1 expectations skip; the default 72-frame
            # gate carries the coverage law.
            floor = math.floor(frac * len(rows))
            if floor > 0 and counts.get(k, 0) < floor:
                agg_fails.append(f'agg_missing_{k}:{counts.get(k, 0)}<{floor}')
        for msg in agg_fails:
            print(f"[judge] {meta['orbit']} AGGREGATE FAIL {msg}")
    # ---- 489 PASS-3 churn quad (B2): four TRUE-VIDEO-CADENCE frames at
    # the shipped R-clip peak bearing (co i96 family), round-tripped
    # through the shipped encoder. The ARMED law is the decoded R>=254
    # COUNT ceiling (enc_rclip_px_max): cured family 178-246 px vs the
    # shipped 334-435 px — 2x separation, red-arms on the shipped basis.
    # Adjacent-set persistence (+-3 px) is RECORDED for the ledger but
    # NOT gated: measured on both trees it does not order defect vs cure
    # (shipped 0.76-0.81 vs cured 0.57-0.73 — raw clip-set overlap is
    # optical-flow-dominated on an orbiting camera; the visible-sparkle
    # mechanism, the stitch specular flash, is cured at the material).
    churn = None
    ecs = sorted(f2 for f2 in os.listdir(d)
                 if f2.startswith('ec') and f2.endswith('.png'))
    # review pass3-r2 P2: a PARTIAL quad must never judge — a prefix
    # subset below the ceiling would pass a gate whose law is the
    # four-frame family
    if ecs and ecs != ['ec00.png', 'ec01.png', 'ec02.png', 'ec03.png']:
        agg_fails.append(f'enc_rclip_quad_partial:{len(ecs)}/4')
        ecs = []
    if ecs:
        csets, ccounts = [], []
        for f2 in ecs:
            ei = Image.open(os.path.join(d, f2)).convert('RGB')
            epx = ei.load()
            ew, eh = ei.size
            s2 = set()
            for y in range(eh):
                for x in range(ew):
                    if epx[x, y][0] >= 254:
                        s2.add((x, y))
            csets.append(s2)
            ccounts.append(len(s2))
        persists = []
        for k in range(len(csets) - 1):
            nxt = csets[k + 1]
            hit = 0
            for (x, y) in csets[k]:
                ok2 = False
                for dy2 in range(-3, 4):
                    for dx2 in range(-3, 4):
                        if (x + dx2, y + dy2) in nxt:
                            ok2 = True
                            break
                    if ok2:
                        break
                if ok2:
                    hit += 1
            persists.append(round(hit / max(1, len(csets[k])), 3))
        churn = {'counts': ccounts, 'persist': persists,
                 'sum': sum(ccounts)}
        # pass-3 (full-context re-derivation): the armed law is the QUAD
        # SUM — per-frame maxima swing +-8%% run to run under the
        # continuous-encode context (measured 302/307 on back-to-back
        # cured captures) while the sum is stable; cured sums 1056-1087
        # vs the shipped 1507 (+-17%% margin both sides at 1250).
        erc_max = win.get('enc_rclip_px_max')
        if erc_max is not None and sum(ccounts) > erc_max:
            agg_fails.append(
                f'enc_rclip_quad_sum:{sum(ccounts)}>{erc_max}')
        print(f"[judge] {meta['orbit']} churn quad: counts {ccounts} "
              f"persist {persists}")
    elif meta['orbit'] == 'corner' \
            and win.get('enc_rclip_px_max') is not None:
        # armed window + no decoded churn quad = the encode pass silently
        # didn't run — fail loud (the pass-2 plane-gap lesson)
        agg_fails.append('enc_rclip_churn_missing')
    # ---- 489 PASS-3 review r6 P1 SCREEN row: the continuous encode
    # covers EVERY shipped frame; a G-clip regression confined to an
    # in-between bearing (e.g. the shipped basis' worst frame ft video
    # i1, which the 75-grid does not sample) must not escape. Every
    # decoded orbit frame is screened with the component law; the lamp
    # is excluded via the NEAREST bearing's mask (lamp regions move
    # slowly; dilated 8 px). numpy/scipy carry the full-run cost; their
    # absence fails loud (the pass-2 silent-plane lesson).
    screen = None
    enc_all_dir = os.path.join(d, 'encall')
    if win.get('enc_dline_clip_px_max') is not None \
            and os.path.isdir(enc_all_dir):
        try:
            import numpy as _np
            from scipy import ndimage as _ndi
        except Exception:
            agg_fails.append('enc_screen_deps_missing')
            _np = None
        if _np is not None:
            dfs = sorted(f2 for f2 in os.listdir(enc_all_dir)
                         if f2.startswith('d') and f2.endswith('.png'))
            v_step = len(dfs) // n if n else 1
            # review r9 P2: nearest-mask classification tolerates at most
            # the default 75-grid spacing (<= 8 video frames / 4.8 deg);
            # a sparse dev grid cannot classify the full run — fail loud
            if v_step > 8:
                agg_fails.append(f'enc_screen_sparse_grid:vstep{v_step}>8')
                dfs = []
            mask_cache = {}
            st8 = _np.ones((3, 3), bool)
            worst = {'v': None, 'total': 0, 'maxcomp': 0}
            # RULING R-S8-4: raw (pre-exclusion) worst + bloom sums are
            # recorded beside the judged (net) worst
            worst_raw = {'v': None, 'total': 0, 'maxcomp': 0}
            screen_bloom_px = 0
            screen_bloom_comps = 0
            if bloom_w is None:
                agg_fails.append('enc_bloom_window_missing')
            # RULING V8-C1: the geometric fall-disc scoping runs per
            # DECODED frame with that video frame's OWN polygons
            # (meta.run_fall_polys[v] — the near disc moves ~120 px per
            # 75-grid step, so the nearest bearing's polygon would be
            # wrong). A run without them fails loud (fall_poly_missing)
            # and the screen judges raw; no window fails loud likewise.
            run_polys = meta.get('run_fall_polys')
            screen_fall_px = 0
            screen_fall_missing = 0
            screen_fall_oversize = 0
            mw, mh = meta['w'], meta['h']
            if fm_w is None:
                agg_fails.append('enc_fallmask_window_missing')
            elif run_polys is None:
                agg_fails.append('fall_poly_missing')
            screen_fails = 0
            for f2 in dfs:
                v = int(f2[1:5]) - 60  # decode offset: 60-frame card
                # review r8 P2: nearest bearing WRAPS across the orbit
                # boundary (fulltable v599 is 0.6 deg from mask 0)
                bi = round(v / v_step) % n
                if bi not in mask_cache:
                    mi = _np.asarray(Image.open(
                        os.path.join(d, f'm{bi:03d}.png')).convert('RGB'),
                        dtype=_np.int16)
                    lm = ((mi[..., 0] > 150) & (mi[..., 1] > 150)
                          & (mi[..., 2] < mi[..., 1] - 80))
                    cm = ((mi[..., 1] > mi[..., 0] + 50)
                          & (mi[..., 1] > mi[..., 2] + 50)
                          & (mi[..., 2] < 200))
                    mask_cache[bi] = (
                        _ndi.binary_dilation(lm, structure=st8, iterations=8),
                        _ndi.binary_dilation(cm, structure=st8, iterations=4),
                        mask_cloth_exact(mi))  # undilated — bloom B5
                lamp_m, cloth_m, cloth_x = mask_cache[bi]
                ei2 = _np.asarray(Image.open(
                    os.path.join(enc_all_dir, f2)).convert('RGB'),
                    dtype=_np.uint8)
                g2 = (ei2[..., 1] >= 254)
                # scope (review r7 P2-1): a source-blown pixel AWAY from
                # cloth is a lamp/gold specular glint (blown_frame_frac
                # lane; measured: a 9 px leg glint at source G 255), but
                # a source-clipped pixel ON/NEXT TO cloth is the marking
                # family and must count — the capture-plane dline row
                # only runs at sampled bearings, so the screen carries
                # the in-between source clips too.
                # R3-SNK-11 C1 (VERIFY-SNK10 / ORDER-CRAFT-R3-SNK11-
                # ADDENDUM RULING C1): "source not blown" reads the
                # source's MAX channel, not G alone — a lit neutral
                # highlight saturates in R first (the e7ffa1c9 corner v89
                # item: source (255, 250..253, 233..244) -> decoded G 255,
                # 9 px on the cream strap plate at the frame's bottom
                # edge, no cloth within reach) and is the blown_frame
                # lane's glint, not a marking; a source clip of ANY
                # channel next to cloth still counts through the cloth
                # clause. Red arm: bloom_selftest paints a drawn WHITE
                # line ON cloth (must fire) and the same line on wood
                # (scoped out), plus the libx264 round trip of both.
                si2 = _np.asarray(Image.open(
                    os.path.join(d, 'run', f'v{v:04d}.png')).convert('RGB'),
                    dtype=_np.uint8)
                hh0 = min(g2.shape[0], si2.shape[0], lamp_m.shape[0])
                ww0 = min(g2.shape[1], si2.shape[1], lamp_m.shape[1])
                g2 = g2[:hh0, :ww0] \
                    & (si2[:hh0, :ww0].max(axis=2) < 254) | (
                        (ei2[:hh0, :ww0, 1] >= 254)
                        & cloth_m[:hh0, :ww0])
                g2 = g2 & ~lamp_m[:hh0, :ww0]
                tot_raw = int(g2.sum())
                mc_raw = 0
                mc = 0
                bl_px = 0
                bl_n = 0
                fp_px = 0
                if tot_raw:
                    lab, n2 = _ndi.label(g2, structure=st8)
                    sizes = _np.bincount(lab.ravel())[1:]
                    mc_raw = int(sizes.max())
                # RULING V8-C1: geometric scoping FIRST (this video
                # frame's own polygons), the components re-formed on
                # what remains, then the bloom classifier on those
                fall_m = None
                if fm_w is not None and run_polys is not None:
                    pv = run_polys[v] if v < len(run_polys) else None
                    if pv is None:
                        screen_fall_missing += 1
                        if screen_fall_missing <= 6:
                            agg_fails.append(f'fall_poly_missing:v{v}')
                    else:
                        fall_m, _ff, fa = fall_mask(pv, mw, mh,
                                                    fm_w['rim_px'])
                        if fa > fm_w['frac_max'] * mw * mh:
                            screen_fall_oversize += 1
                            if screen_fall_oversize <= 6:
                                agg_fails.append(f'fall_mask_oversize:v{v}')
                            fall_m = None  # projection defect: judge raw
                if fall_m is not None and tot_raw:
                    fm0 = fall_m[:hh0, :ww0]
                    fp_px = int((g2 & fm0).sum())
                    if fp_px:
                        g2 = g2 & ~fm0
                        lab, n2 = _ndi.label(g2, structure=st8)
                if tot_raw - fp_px:
                    if bloom_w is None:
                        # failed loud above; judge raw (post-scoping)
                        mc = int(_np.bincount(lab.ravel())[1:].max())
                    else:
                        # RULING R-S8-4: classify every component with
                        # the nearest bearing's exact cloth mask (the
                        # screen's own mask law) before it counts
                        for k2, sl in enumerate(_ndi.find_objects(lab),
                                                start=1):
                            if sl is None:
                                continue
                            yy2, xx2 = _np.nonzero(lab[sl] == k2)
                            members = list(zip(
                                (xx2 + sl[1].start).tolist(),
                                (yy2 + sl[0].start).tolist()))
                            isb, _why = enc_bloom_component(
                                members, si2[:hh0, :ww0], ei2[:hh0, :ww0],
                                cloth_x[:hh0, :ww0], bloom_w)
                            if isb:
                                bl_px += len(members)
                                bl_n += 1
                            else:
                                mc = max(mc, len(members))
                tot = tot_raw - fp_px - bl_px
                screen_fall_px += fp_px
                screen_bloom_px += bl_px
                screen_bloom_comps += bl_n
                if tot_raw > worst_raw['total']:
                    worst_raw['total'] = tot_raw
                    worst_raw['v'] = v
                if mc_raw > worst_raw['maxcomp']:
                    worst_raw['maxcomp'] = mc_raw
                    worst_raw['v_comp'] = v
                # review r9 P3: total and component maxima track
                # INDEPENDENTLY, each with its own frame
                if tot > worst['total']:
                    worst['total'] = tot
                    worst['v'] = v
                if mc > worst['maxcomp']:
                    worst['maxcomp'] = mc
                    worst['v_comp'] = v
                if mc > win.get('enc_dline_comp_max', 8) \
                        or tot > win.get('enc_dline_screen_total_max', 48):
                    # review r7 P2-2: keep scanning — the report must
                    # cover the FULL run and name the true worst frame;
                    # only the stored failure messages are capped.
                    screen_fails += 1
                    if screen_fails <= 6:
                        agg_fails.append(
                            f'enc_dline_screen:v{v}:total{tot}:comp{mc}')
            if screen_fails > 6:
                agg_fails.append(
                    f'enc_dline_screen:+{screen_fails - 6}_more')
            screen = {'frames': len(dfs), 'worst': worst,
                      'fail_count': screen_fails,
                      'raw_worst': worst_raw,
                      'fallmask_px': screen_fall_px,
                      'fallmask_missing_frames': screen_fall_missing,
                      'fallmask_oversize_frames': screen_fall_oversize,
                      'bloom_px': screen_bloom_px,
                      'bloom_comps': screen_bloom_comps}
            print(f"[judge] {meta['orbit']} enc screen: {len(dfs)} decoded "
                  f"frames, worst {worst} (raw {worst_raw}; fall-disc "
                  f"excluded {screen_fall_px} px, polygons missing on "
                  f"{screen_fall_missing} frames; bloom excluded "
                  f"{screen_bloom_px} px / {screen_bloom_comps} comps)")
    elif win.get('enc_dline_clip_px_max') is not None:
        agg_fails.append('enc_screen_missing')
    # ---- 489 PASS-4 CLOSURE full-track churn law (adversarial pass #4
    # B1): the anchored quad above watches only the SHIPPED peak bearing
    # (video v156-159) and the cured track's churn peak MIGRATED between
    # judged bearings — measured on the shipped r4 Drive bytes:
    # sliding-quad max 1342 @ video v230-233 (track i170-173, az ~47.6°,
    # between the 6-step grid samples) vs 1068 at the anchor; per-frame
    # peak 366 @ v232 vs 339 at the judged bearings. The law SPLITS:
    #   · the anchored row (above) keeps the specular-chain-flare
    #     separation at the pinned bearing (cured 1068 vs shipped 1507,
    #     cap 1250 — unchanged, red-arm unchanged);
    #   · this FULL-TRACK row slides a 4-frame window over EVERY decoded
    #     track frame (whole-frame R>=254 — the ec-instrument's own law,
    #     maskless = conservative, fixture precedent), records the argmax
    #     bearing, and caps the sum at enc_rclip_fulltrack_max. Cap
    #     derivation (pass-4 multi-run swing study): Drive bytes / sweep
    #     replica / re-cut card encode all read 1342 on the pinned
    #     deterministic rig (byte-stable captures); the sealed cross-run
    #     family swing is ±8% single-frame (cure-lane law) -> cap
    #     1342 × 1.08 ≈ 1450; the shipped-defect basis' own full-track
    #     quad (measured on its bytes, fixture churn_fulltrack) reads
    #     1557 and fires at +7.4% over the cap;
    #   · element-census QUALIFIER: the largest R>=254 connected
    #     component on EVERY decoded track frame (review pass-4 r1 P2:
    #     an argmax-window-only scan would let a large component
    #     outside the max-sum window ship green) must stay at the
    #     booked element-family scale (measured whole-track max 59 px =
    #     the cream/plum boundary line @ v232, x766-823 y526-527;
    #     stitch-dot chain <=23 px; cap 96 = +62% headroom) — a NEW
    #     large-element class (flare band, line-body) can never hide
    #     under a green sum. The defect's own components stay in the
    #     same family (whole-track max 70 px boundary line @ v270;
    #     peak-window <=30 px specular specks, ncomp 112-134 vs cured
    #     84-93), so the qualifier guards FORWARD and the defect fires
    #     on the sum rows (anchored + full-track).
    churn_ft = None
    if meta['orbit'] == 'corner' \
            and win.get('enc_rclip_fulltrack_max') is not None:
        dfs2 = sorted(f2 for f2 in os.listdir(enc_all_dir)
                      if f2.startswith('d') and f2.endswith('.png')) \
            if os.path.isdir(enc_all_dir) else []
        if not dfs2:
            agg_fails.append('enc_rclip_fulltrack_missing')
        else:
            try:
                import numpy as _np2
                from scipy import ndimage as _ndi2
            except Exception:
                agg_fails.append('enc_rclip_fulltrack_deps_missing')
                _np2 = None
            if _np2 is not None:
                st8f = _np2.ones((3, 3), bool)
                counts_ft = []
                best = {'sum': -1, 'v0': None}
                # review pass-4 r1 P2: the element-census qualifier scans
                # the largest component on EVERY track frame — an
                # argmax-window-only scan would let a large-element
                # regression outside the max-sum window ship green.
                # (Measured: cured whole-track max 59 px @ v232 — the
                # same booked boundary line; defect bytes 70 px @ v270,
                # same family, still under the 96 cap by design.)
                maxcomp_ft = 0
                comp_v = None
                bbox_ft = None
                for f2 in dfs2:
                    v = int(f2[1:5]) - 60  # decode offset: 60-frame card
                    m2 = _np2.asarray(Image.open(
                        os.path.join(enc_all_dir, f2)).convert('RGB'),
                        dtype=_np2.uint8)[:, :, 0] >= 254
                    counts_ft.append(int(m2.sum()))
                    if v >= 3:
                        s4 = sum(counts_ft[v - 3:v + 1])
                        if s4 > best['sum']:
                            best = {'sum': s4, 'v0': v - 3}
                    if m2.any():
                        lab2, n3 = _ndi2.label(m2, structure=st8f)
                        if n3:
                            sizes2 = _np2.bincount(lab2.ravel())[1:]
                            mc2 = int(sizes2.max())
                            if mc2 > maxcomp_ft:
                                maxcomp_ft = mc2
                                comp_v = v
                                ys2, xs2 = _np2.where(
                                    lab2 == int(sizes2.argmax()) + 1)
                                bbox_ft = [int(xs2.min()), int(ys2.min()),
                                           int(xs2.max()), int(ys2.max())]
                v0 = best['v0']
                pk_v = int(_np2.argmax(counts_ft))
                churn_ft = {
                    'quad_sum': best['sum'], 'track_i0': v0,
                    'video_f0': v0 + 60,
                    'az_deg': round(-90 + 360.0 * v0 / len(dfs2), 1),
                    'counts': counts_ft[v0:v0 + 4],
                    'peak_px': int(counts_ft[pk_v]), 'peak_track_i': pk_v,
                    'peak_video_f': pk_v + 60,
                    'maxcomp': maxcomp_ft,
                    'maxcomp_track_i': comp_v,
                    'maxcomp_video_f': (comp_v + 60
                                        if comp_v is not None else None),
                    'maxcomp_bbox': bbox_ft,
                    'frames_scanned': len(dfs2)}
                erc_ft = win['enc_rclip_fulltrack_max']
                if best['sum'] > erc_ft:
                    agg_fails.append(
                        f"enc_rclip_fulltrack:{best['sum']}>{erc_ft}")
                cc_max = win.get('enc_rclip_fulltrack_comp_max')
                if cc_max is not None and maxcomp_ft > cc_max:
                    agg_fails.append(
                        f'enc_rclip_fulltrack_comp:{maxcomp_ft}>{cc_max}')
                print(f"[judge] {meta['orbit']} churn full-track: quad "
                      f"{churn_ft['counts']} sum {best['sum']} @ video "
                      f"v{v0 + 60}-{v0 + 63} (az {churn_ft['az_deg']}°), "
                      f"peak {churn_ft['peak_px']} @ v{pk_v + 60}, "
                      f"maxcomp {maxcomp_ft} @ v{churn_ft['maxcomp_video_f']}")
    rep = {'tool': 'tools/render/orbitsweep-judge.py', 'mode': meta.get('mode') or 'per-orbit',
           'driver': meta.get('tool'),  # FIX7 (Fable pass 2): the per-orbit verdict names its tool + the driver mode
           'orbit': meta['orbit'], 'windows': win, 'frames': rows,
           'fail_frames': fails, 'aggregate_fails': agg_fails,
           'churn': churn, 'churn_fulltrack': churn_ft, 'screen': screen}
    with open(os.path.join(d, 'report.json'), 'w') as f:
        json.dump(rep, f, indent=1)
    sys.exit(3 if (fails or agg_fails) else 0)

def _refuse(msg):
    """Input refusal (490 review pass-3 r3 P2, ported): exit 2, reserved for
    INVALID EVIDENCE — automation must distinguish it from a written red
    verdict (exit 3)."""
    print(f'ENCODED REFUSAL: {msg}', file=sys.stderr)
    sys.exit(2)


def _probe_stream(path):
    """ffprobe the first video stream's identity (refusal on failure).
    Ported from the 490 judge (pass-3 encoded lane); review pass-4 r2 P2:
    the bars certify the SHIPPED H.264 yuv420p encode and every 4:2:0
    chroma-sharing law rides that contract — a re-encode in another
    codec/pix_fmt (measured: H.264 High 4:4:4 yuv444p passed the r1
    probe) must refuse, never judge."""
    import subprocess
    try:
        out = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
             '-show_entries',
             'stream=codec_name,width,height,pix_fmt,avg_frame_rate,'
             'sample_aspect_ratio',
             '-of', 'default=nw=1', path], capture_output=True, text=True,
            check=True, timeout=60).stdout
        kv = dict(ln.split('=', 1) for ln in out.split() if '=' in ln)
        num, den = kv['avg_frame_rate'].split('/')
        codec, pix = kv.get('codec_name'), kv.get('pix_fmt')
        if codec != 'h264' or pix != 'yuv420p':
            _refuse(f'{path} is {codec}/{pix}, the delivery contract is '
                    f'h264/yuv420p (encode.sh law) — the 4:2:0 bars do '
                    f'not transfer to other formats')
        # square-pixel contract (review pass-4 r4 probe class): a remux
        # with a container/stream aspect override (-aspect) keeps the
        # coded raster while DISPLAYING distorted — the owner-visible
        # geometry would no longer be the judged geometry. The shipped
        # deliverables carry no SAR (square implied); anything else
        # refuses.
        sar = kv.get('sample_aspect_ratio')
        if sar not in (None, '', '1:1', '0:1', 'N/A'):
            _refuse(f'{path} carries sample_aspect_ratio {sar} — the '
                    f'delivery contract is square pixels (display '
                    f'geometry must equal the judged raster)')
        # colorimetry contract (review pass-4 r7 P2): a remux with
        # non-delivery color tags (e.g. PQ/BT.2020) decodes to the same
        # rgb24 samples for the judge while color-managed playback
        # renders materially different brightness/colors. The shipped
        # deliverables carry NO color tags (encode.sh law: all four
        # probe as 'unknown'); anything else refuses.
        cout = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
             '-show_entries', 'stream=color_range,color_space,'
             'color_transfer,color_primaries,field_order',
             '-of', 'default=nw=1',
             path], capture_output=True, text=True, check=True,
            timeout=60).stdout
        ckv = dict(ln.split('=', 1) for ln in cout.split() if '=' in ln)
        for ck in ('color_range', 'color_space', 'color_transfer',
                   'color_primaries'):
            cv = ckv.get(ck)
            if cv not in (None, '', 'unknown', 'N/A'):
                _refuse(f'{path} carries {ck}={cv} — the delivery '
                        f'contract is untagged colorimetry (the judged '
                        f'samples must be the displayed samples)')
        # review pass-4 r13 P2: progressive-scan contract — an interlaced
        # H.264 stream deinterlaces differently across players while the
        # rawvideo judge sees woven fields.
        fo = ckv.get('field_order')
        if fo not in (None, '', 'progressive', 'unknown'):
            _refuse(f'{path} carries field_order={fo} — the delivery '
                    f'contract is progressive scan')
        # single-stream + identity-display contract (review pass-4 r5
        # P2 pair): (a) a second video track could be the player-default
        # while v:0 satisfies the probe — refuse multi-video files and
        # -map 0:v:0 the decode; (b) a display-matrix rotation/flip
        # remux keeps the coded raster while ffmpeg auto-rotates the
        # decode (and players rotate the display) — refuse any
        # non-identity display transform.
        import json as _json
        meta = _json.loads(subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'v',
             '-show_entries', 'stream=index:stream_side_data_list',
             '-of', 'json', path], capture_output=True, text=True,
            check=True, timeout=60).stdout)
        streams = meta.get('streams', [])
        if len(streams) != 1:
            _refuse(f'{path} carries {len(streams)} video streams — the '
                    f'delivery contract is exactly one (the judged '
                    f'stream must be the displayed stream)')
        for sd in streams[0].get('side_data_list', []) or []:
            sdt = str(sd.get('side_data_type', ''))
            rot = sd.get('rotation', 0)
            if 'Display Matrix' in sdt or rot not in (0, '0', None):
                _refuse(f'{path} carries a display transform '
                        f'({sdt}, rotation={rot}) — the delivery '
                        f'contract is identity display (the judged '
                        f'raster must be the displayed raster)')
        return (int(kv['width']), int(kv['height']),
                (int(num) / int(den) if int(den) else 0.0))
    except SystemExit:
        raise
    except Exception as e:
        _refuse(f'ffprobe failed on {path}: {e}')


def _decode_frames(path, w=1600, h=1000, min_last_frame=0,
                   expected_frames=None):
    """Yield (index, HxWx3 uint8 ndarray) for every frame of an mp4 via an
    ffmpeg rawvideo pipe. Ported verbatim from the 490 judge (its review
    pass-3 r1/r5/r9/r11 refusal laws carry over):
      · stream dimensions must equal the judged raster exactly;
      · constant 30 fps validated on the packet pts deltas (VFR refusal);
      · ffmpeg must exit 0; zero-frame and short decodes refuse;
      · the authored exact frame count is the file's identity axis."""
    import subprocess
    import numpy as np
    pw, ph, fps = _probe_stream(path)
    if (pw, ph) != (w, h):
        _refuse(f'{path} is {pw}x{ph}, judge raster is {w}x{h} — '
                f're-author the windows, never rescale')
    # review pass-3 r5 P1: every window is an ABSOLUTE frame index at the
    # deliverables' 30 fps cadence — a re-encode at another rate would
    # shift every event off its window and escape judgment
    if abs(fps - 30.0) > 0.01:
        _refuse(f'{path} cadence {fps:.3f} fps != the deliverable 30 fps '
                f'— frame-number windows do not transfer')
    # review pass-3 r11 P1: a VFR stream can AVERAGE 30 fps while its
    # frame times wander — validate constant frame timing on the packet
    # pts deltas themselves (tolerance one timebase tick at 90 kHz)
    import subprocess as _sp
    try:
        pts_out = _sp.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
             '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', path],
            capture_output=True, text=True, check=True,
            timeout=120).stdout.split()
        pts = sorted(float(x.rstrip(',')) for x in pts_out if x.strip(','))
    except Exception as e:
        _refuse(f'ffprobe pts scan failed on {path}: {e}')
    deltas = [b - a for a, b in zip(pts, pts[1:])]
    bad = [d for d in deltas if abs(d - 1 / 30) > 0.002]
    if bad:
        _refuse(f'{path} is not constant 30 fps: {len(bad)} frame '
                f'intervals off 1/30 s (first {bad[0]:.5f})')
    p = subprocess.Popen(
        ['ffmpeg', '-loglevel', 'error', '-i', path,
         # review pass-4 r5 P2: decode the SAME stream the probe
         # validated (v:0) — never ffmpeg's "best" pick
         '-map', '0:v:0',
         '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
        stdout=subprocess.PIPE)
    i = 0
    while True:
        buf = p.stdout.read(w * h * 3)
        if len(buf) < w * h * 3:
            break
        yield i, np.frombuffer(buf, np.uint8).reshape(h, w, 3)
        i += 1
    p.stdout.close()
    rc = p.wait()
    if rc != 0:
        _refuse(f'ffmpeg exit {rc} decoding {path} (truncated/corrupt '
                f'stream after {i} frames)')
    if i == 0:
        _refuse(f'zero frames decoded from {path}')
    if i - 1 < min_last_frame:
        _refuse(f'{path} ends at frame {i - 1}, the configured windows '
                f'require coverage through frame {min_last_frame}')
    # review pass-3 r9 P1: bind the file to ITS deliverable — the orbits
    # differ only in length under the generic bars (a fulltable clip in
    # the corner slot passed), so the authored exact frame count is the
    # identity axis.
    if expected_frames is not None and i != expected_frames:
        _refuse(f'{path} decoded {i} frames, the deliverable is authored '
                f'at exactly {expected_frames}')


def judge_encoded(cfg_path):
    """GH-490 PASS-3 SHIPPED-ENCODE bars: clip/glow-family censuses on the
    ENCODED mp4 deliverables. Mirrors of the five-lens review's own
    measurement plane (the adversarial passes measured shipped bytes; the
    gates only ever judged fresh PNG captures — this closes the plane).
    Bars (windows from orbitsweep-490.mjs WINDOWS.encoded):
      pocketing: netball sock-ROI green == 0 on every gameplay frame
                 (the pass-2 zero-green claim, verified on encode);
                 mouth-transit green flash bounded to its DISCLOSED
                 transit windows + magnitude (bounce-spill ledger row).
      fulltable: per-frame G>=254 census on body frames (the 489 D-line
                 clip class mirrored to 490) + blown-pixel fraction.
      corner:    blown-pixel fraction on body frames."""
    import numpy as np
    import hashlib

    def _sha256(fp):
        hh = hashlib.sha256()
        with open(fp, 'rb') as fhh:
            for chunk in iter(lambda: fhh.read(1 << 20), b''):
                hh.update(chunk)
        return hh.hexdigest()
    cfg = json.load(open(cfg_path))
    win = cfg['windows']
    # review pass-3 r9 P2: bind the verdict to the BYTES JUDGED — hash
    # every input before decoding and verify unchanged after; an mp4
    # swapped mid-run refuses instead of shipping a mismatched report.
    pre_sha = {k: _sha256(v) for k, v in cfg['files'].items()}
    rows = []
    red = []

    def row(name, value, ok, note=''):
        rows.append({'bar': name, 'value': value, 'ok': bool(ok),
                     'note': note})
        if not ok:
            red.append(name)
        print(f"[encoded] {'PASS' if ok else 'FAIL'} {name} = {value} {note}")

    # ---- pocketing ----
    pw = win['pocketing']
    x0, y0, x1, y1 = pw['sock_roi']
    mx0, my0, mx1, my1 = pw['mouth_roi']
    b0, b1 = pw['base_frames']
    segs = [tuple(s) for s in pw['body_segs']]
    in_seg = lambda i: any(a <= i <= b for a, b in segs)
    # review pass-3 r6 P1: EVERY frame outside the authored card ranges is
    # judged (netball + scene floor) — an appended/interleaved corrupt or
    # off-scene tail can never ride past the configured windows unjudged
    cards = [tuple(c) for c in pw.get('card_segs', [[0, 60]])]
    in_card = lambda i: any(a <= i <= b for a, b in cards)
    fw = [tuple(s) for s in pw['flash_windows']]
    in_flash = lambda i: any(a <= i <= b for a, b in fw)
    base_stack = []
    base = None
    net_max = 0
    flash_peak = 0
    flash_outside = 0
    n_frames = 0
    pk_green_min = 1.0
    moved_frac_max = 0.0
    motion_segs = [tuple(sg) for sg in pw.get('motion_segs', segs)]
    in_motion = lambda i: any(a <= i <= b for a, b in motion_segs)
    prev = None
    dup_count = 0
    motion_n = 0
    # review r11 P1: sustained-progress census — decimated (8x) history at
    # offsets {12,15,16}: an A/B alternation or any short loop reads zero
    # min-offset progress, per-frame noise on a frozen image averages out
    hist = {}
    prog_hits = {si: 0 for si in range(len(motion_segs))}
    prog_n = {si: 0 for si in range(len(motion_segs))}
    seg_of = lambda i: next((si for si, (a, b) in enumerate(motion_segs)
                             if a <= i <= b), None)
    pk_last = max([b for a, b in segs] + [b for a, b in fw] + [b1])
    for i, fr in _decode_frames(cfg['files']['pocketing'],
                                min_last_frame=pk_last,
                                expected_frames=pw.get('expected_frames')):
        n_frames = i + 1
        f16 = fr.astype(np.int16)
        if b0 <= i <= b1:
            base_stack.append(f16[my0:my1, mx0:mx1])
        if i == b1:
            base = np.median(np.stack(base_stack), axis=0)
        if in_card(i) or i < b0:
            prev = None
            continue
        gd = ((fr[:, :, 1] > fr[:, :, 0]) & (fr[:, :, 1] > fr[:, :, 2])
              & (fr[:, :, 1] > 40)).mean()
        pk_green_min = min(pk_green_min, float(gd))
        # adjacent-frame progress census over the MOTION segs (holds/tails
        # excluded — they are authored still frames): review r5 P1 — one
        # moving frame then a frozen repeat must never certify gameplay
        if in_motion(i):
            if prev is not None and in_motion(i - 1):
                # dup = EXACT decoded equality (the Lens-4 video-plane
                # metric: the shipped 490 gameplay has zero exact dups
                # while its parked tail still sways sub-MAD; a frozen
                # repeat encodes as skip-blocks and decodes byte-equal)
                if int(np.abs(f16 - prev).max()) == 0:
                    dup_count += 1
                motion_n += 1
            prev = f16
            dec = f16[::8, ::8, :].astype(np.float32)
            offs = [o for o in (12, 15, 16)
                    if (i - o) in hist and in_motion(i - o)]
            if len(offs) == 3:
                prog = min(float(np.abs(dec - hist[i - o]).mean())
                           for o in offs)
                # review r12 P1 (novelty veto): a progressive frame must
                # not near-match ANY recent frame — a loop of period
                # <= 17 repeats some history frame near-exactly, so its
                # apparent progress never counts
                novel = all(float(np.abs(dec - h).mean()) >= 0.05
                            for h in hist.values())
                si = seg_of(i)
                prog_n[si] += 1
                if prog >= 1.0 and novel:
                    prog_hits[si] += 1
            hist[i] = dec
            hist.pop(i - 17, None)
        else:
            prev = None
            hist.clear()
        g = f16[:, :, 1] - np.maximum(f16[:, :, 0], f16[:, :, 2])
        net_max = max(net_max, int(
            (g[y0:y1, x0:x1] >= pw['green_thresh']).sum()))
        # flash judged on EVERY non-card frame past the baseline (review
        # r8 P2: an appended tail frame could carry a mouth flash while
        # scene/net bars pass — in-window frames book the peak, all
        # others bound the outside census)
        if base is not None and i > b1:
            # i > b1: the baseline frames themselves are never judged
            # (the approaching ball crosses the ROI inside them; the
            # 14-frame median averages it out for every later frame)
            roi = f16[my0:my1, mx0:mx1]
            moved = np.abs(roi - base).sum(axis=2) > pw['moved_thresh']
            moved_frac_max = max(moved_frac_max, float(moved.mean()))
            cnt = int((moved & (g[my0:my1, mx0:mx1]
                                >= pw['flash_thresh'])).sum())
            if in_flash(i):
                flash_peak = max(flash_peak, cnt)
            else:
                flash_outside = max(flash_outside, cnt)
    if n_frames == 0 or base is None:
        _refuse('pocketing decode starved the baseline')
    # review pass-3 r3 P1 (blank-encode guard): every bar is a CEILING —
    # an encoder failure emitting valid-sized black video would zero-pass
    # all six. Positive scene-identity floor: the judged content must
    # contain the table's green cloth (the one invariant of every 490
    # deliverable; shipped reads ~0.5-0.7 green-dominant fraction).
    base_greenish = float(((base[:, :, 1] > base[:, :, 0])
                           & (base[:, :, 1] > base[:, :, 2])
                           & (base[:, :, 1] > 40)).mean())
    row('enc_pocketing_scene_floor', round(base_greenish, 4),
        base_greenish >= 0.25,
        '(baseline mouth-ROI green-dominant fraction; blank-encode guard)')
    row('enc_pocketing_body_floor', round(pk_green_min, 4),
        pk_green_min >= 0.25,
        '(MIN sampled body-frame green-dominant fraction; review r4 P1 —'
        ' body content past the baseline must carry the scene)')
    row('enc_pocketing_motion_anchor', round(moved_frac_max, 4),
        moved_frac_max >= 0.01,
        '(max mouth-ROI moved fraction: real gameplay must MOVE — a'
        ' frozen/repeated clean frame can never certify the pot)')
    dup_frac = (dup_count / motion_n) if motion_n else 1.0
    row('enc_pocketing_dup_frac', round(dup_frac, 4),
        motion_n > 0 and dup_frac <= pw.get('dup_frac_max', 0.02),
        f'(adjacent-dup fraction over the motion segs {motion_segs}; '
        f'{motion_n} pairs — sustained progress, the dedup-scan law on '
        'encode)')
    prog_fracs = [(prog_hits[si] / prog_n[si]) if prog_n[si] else 0.0
                  for si in range(len(motion_segs))]
    prog_min = round(min(prog_fracs), 4) if prog_fracs else 0.0
    row('enc_pocketing_progress', prog_min,
        bool(prog_fracs) and min(prog_fracs)
        >= pw.get('progress_frac_min', 0.15),
        f'(per-seg fraction of frames with min-offset {{12,15,16}} '
        f'decimated MAD >= 1.0 — a short loop or noise-dithered freeze '
        f'reads 0; per-seg counts {prog_n})')
    row('enc_netball_green_max', net_max, net_max <= pw['netball_max'],
        f'(thresh {pw["green_thresh"]}, sock ROI, {n_frames} frames)')
    row('enc_mouth_flash_peak', flash_peak,
        flash_peak <= pw['flash_peak_max'],
        f'(disclosed transit windows {fw})')
    row('enc_mouth_flash_outside', flash_outside,
        flash_outside <= pw['flash_outside_max'],
        '(family may never appear outside the disclosed windows)')

    # ---- orbits ----
    for orb in ('fulltable', 'corner'):
        ow = win[orb]
        f0, f1 = ow['body']
        clip_max = 0
        blown_max = 0.0
        green_frac_min = 1.0
        prev_o = None
        dup_o = 0
        pairs_o = 0
        hist_o = {}
        prog_hit_o = 0
        prog_n_o = 0
        n = 0
        for i, fr in _decode_frames(cfg['files'][orb], min_last_frame=f1,
                                    expected_frames=ow.get(
                                        'expected_frames')):
            n = i + 1
            # review r6 P1: every frame past the title card is judged —
            # the body window bounds only the dup census (the authored
            # tail holds are byte-equal stills by design)
            if i < f0:
                continue
            if 'clip_g_max' in ow:
                clip_max = max(clip_max, int((fr[:, :, 1] >= 254).sum()))
            # blown = the orbit judge's documented predicate (V >= 0.98
            # AND S <= 0.12) — review pass-3 r4 P2: min(RGB) >= 250
            # missed warm/tinted clipping the red basis represents
            mx = fr.max(axis=2).astype('int16')
            mn = fr.min(axis=2).astype('int16')
            blown = ((mx >= 250) & (mn * 100 >= mx * 88)).mean()
            blown_max = max(blown_max, float(blown))
            # identity floor: EVERY body frame must carry the scene
            # (review r4 P1 / r5 P1: sampled floors left gaps between
            # samples — per-frame now; the decode dominates cost)
            gd = ((fr[:, :, 1] > fr[:, :, 0])
                  & (fr[:, :, 1] > fr[:, :, 2])
                  & (fr[:, :, 1] > 40)).mean()
            green_frac_min = min(green_frac_min, float(gd))
            if i <= f1:
                f16o = fr.astype('int16')
                if prev_o is not None:
                    if int(np.abs(f16o - prev_o).max()) == 0:
                        dup_o += 1
                    pairs_o += 1
                prev_o = f16o
                dec = f16o[::8, ::8, :].astype(np.float32)
                offs = [o for o in (12, 15, 16)
                        if (i - o) in hist_o and (i - o) >= f0]
                if len(offs) == 3:
                    prog = min(float(np.abs(dec - hist_o[i - o]).mean())
                               for o in offs)
                    novel = all(float(np.abs(dec - h).mean()) >= 0.05
                                for h in hist_o.values())
                    prog_n_o += 1
                    if prog >= 1.0 and novel:
                        prog_hit_o += 1
                hist_o[i] = dec
                hist_o.pop(i - 17, None)
        if n == 0:
            _refuse(f'{orb} decode starved')
        row(f'enc_{orb}_scene_floor', round(green_frac_min, 4),
            green_frac_min >= ow.get('scene_green_min', 0.10),
            '(MIN per-frame green-dominant fraction over the body;'
            ' blank-encode guard)')
        dup_fo = (dup_o / pairs_o) if pairs_o else 1.0
        row(f'enc_{orb}_dup_frac', round(dup_fo, 4),
            pairs_o > 0 and dup_fo <= ow.get('dup_frac_max', 0.02),
            '(adjacent-dup fraction over body frames — an orbit must'
            ' sweep; frozen-encode guard)')
        prog_fo = (prog_hit_o / prog_n_o) if prog_n_o else 0.0
        row(f'enc_{orb}_progress', round(prog_fo, 4),
            prog_n_o > 0 and prog_fo >= ow.get('progress_frac_min', 0.60),
            '(fraction of body frames with min-offset {12,15,16}'
            ' decimated MAD >= 1.0 — short loops/dithered freezes read 0)')
        if 'clip_g_max' in ow:
            row(f'enc_{orb}_clip_g_max', clip_max,
                clip_max <= ow['clip_g_max'], '(G>=254 census, body frames)')
        row(f'enc_{orb}_blown_frac_max', round(blown_max, 6),
            blown_max <= ow['blown_frac_max'],
            '(V>=0.98 & S<=0.12 fraction — the orbit judge predicate)')

    post_sha = {k: _sha256(v) for k, v in cfg['files'].items()}
    changed = [k for k in pre_sha if pre_sha[k] != post_sha[k]]
    if changed:
        _refuse(f'input bytes changed during judgment: {changed}')
    rep = {'tool': 'tools/render/orbitsweep-judge.py', 'mode': 'encoded', 'produced_by': cfg.get('produced_by', 'encoded'), 'bars': rows, 'red': red, 'windows': win,
           'files': cfg['files'],
           # review r5 P2 + r9 P2: the report binds to the judged BYTES,
           # hashed BEFORE decode and verified unchanged after
           'files_sha256': pre_sha,
           'when': __import__('datetime').datetime.now(
               __import__('datetime').timezone.utc).isoformat()}
    with open(cfg['out'], 'w') as f:
        json.dump(rep, f, indent=1)
    print(f"[encoded] {'RED' if red else 'GREEN'} "
          f"({len(rows)} bars) -> {cfg['out']}")
    sys.exit(3 if red else 0)


def judge_encoded_489(cfg_path):
    """489 PASS-4 CLOSURE SHIPPED-ENCODE bars (adversarial pass #4 B2):
    censuses run DIRECTLY on the three 489 Drive deliverables' bytes —
    the row of record, replacing the sweep's replica-track census as the
    deliverable-plane verdict (the replica stays as the gate-time
    instrument on the tree; on the pinned rig the two encode
    byte-equivalently, verified pass-4). sha256-bound like the 490 mode.

    Bars (windows from orbitsweep-489.mjs WINDOWS.encoded):
      both orbits: green-dominant G>=254 census with the enc_dline
        component/total laws ON THE DELIVERED BYTES (comp <= 8 /
        total <= 12 — the armed sweep constants; measured shipped family:
        fulltable 5/4, corner 7/5); blown fraction; scene/dup/progress
        integrity floors (the 490 laws, values re-measured on 489).
      corner: the SPLIT churn law — anchored quad (video v156-159)
        <= 1250 + full-track sliding quad <= enc_rclip_fulltrack cap with
        the element-census qualifier (argmax maxcomp <= comp cap).
      fulltable: R>=254 per-frame peak RECORDED, ungated (the booked
        rail-band light-band family, measured 174 @ v449 — disclosure
        row, not a law).
      pocketing (the two pass-4 booked rows — this delivery previously
        had NO encode gate):
        · red-ball lit-face R-clip: the rolling red ball's lit face
          clips R>=254 during the mouth approach (physically expected
          family, disclosed windows rt v73-85 / slow v243-269; measured
          in-window peak 10,136 @ v265). Ceiling 13,000 (disclosure
          bound, +28% like the 490 mouth-flash law), per-window event
          FLOOR 2,000 (a frozen/looped clip reads the static rail-band
          <= 54 outside the event), outside-window ceiling 300 (the 490
          outside-bound family constant; measured outside residual 54 =
          event-edge AA at v86/v270, static floor 15).
        · specular-arc G-clip: the white specular arc on the red ball
          under 4:2:0 chroma sharing reads green-dominant G>=254
          (measured 28 px total @ v257 / 18 px component @ v247, all
          inside the motion windows). Total <= 36 / component <= 24
          (disclosure bounds, +29/33%). SCOPE SENTENCE (pass-4 C-B2c):
          the enc_dline component/total laws are scoped to the two
          ORBIT tracks; the pocketing delivery's G-clip family is a
          DIFFERENT element class (ball specular identity, not cloth
          markings) and is owned by these enc_pk_gclip rows with their
          own booked bounds."""
    import hashlib

    import numpy as np
    from scipy import ndimage

    def _sha256(fp):
        hh = hashlib.sha256()
        with open(fp, 'rb') as fhh:
            for chunk in iter(lambda: fhh.read(1 << 20), b''):
                hh.update(chunk)
        return hh.hexdigest()
    cfg = json.load(open(cfg_path))
    win = cfg['windows']
    pre_sha = {k: _sha256(v) for k, v in cfg['files'].items()}
    rows = []
    red = []
    st8 = np.ones((3, 3), bool)

    def row(name, value, ok, note=''):
        rows.append({'bar': name, 'value': value, 'ok': bool(ok),
                     'note': note})
        if not ok:
            red.append(name)
        print(f"[encoded] {'PASS' if ok else 'FAIL'} {name} = {value} {note}")

    # review pass-4 r13 P2: canonical SPATIAL card signatures — an
    # aggregate bright-pixel census admits a same-count replacement
    # plate. Each sealed plate's 16x10 average-luma grid is PINNED
    # (fixtures/encoded-cards-489-signature.json; regenerated by a
    # conscious card re-cut) and every slot's first card frame must
    # match cell-wise (genuine drift <=1.0 max cell; a swapped sibling
    # plate reads 14.7, the r3-shift plates read 17-19.5).
    card_sig = json.load(open(os.path.join(
        os.path.dirname(os.path.abspath(__file__)), 'fixtures',
        'encoded-cards-489-signature.json')))

    def grid_of(f16):
        lum = (f16[:, :, 0] * 0.2126 + f16[:, :, 1] * 0.7152
               + f16[:, :, 2] * 0.0722).astype(np.float32)
        return lum.reshape(10, 100, 16, 100).mean(axis=(1, 3))

    def sig_dev(key, slot, f16):
        pin = np.asarray(card_sig['cards'][key][slot], np.float32)
        return float(np.abs(grid_of(f16) - pin).max())

    def gdom_stats(fr):
        r16 = fr[:, :, 0].astype(np.int16)
        g16 = fr[:, :, 1].astype(np.int16)
        b16 = fr[:, :, 2].astype(np.int16)
        gd = (g16 >= 254) & (g16 > r16) & (g16 > b16)
        tot = int(gd.sum())
        mc = 0
        if tot:
            lab, n2 = ndimage.label(gd, structure=st8)
            if n2:
                mc = int(np.bincount(lab.ravel())[1:].max())
        return tot, mc

    def dclip_stats(fr):
        """review pass-4 r3 P1: a chroma-NEUTRAL clipped marking
        (R=G=B=255) evades the green-dominance predicate — this census
        mirrors the sweep's own cloth-adjacency law on delivered bytes:
        EVERY G>=254 pixel (any chroma) within 6 px of cloth-green
        content counts; lamp faces/glints away from cloth stay the
        blown-frac lane's business. Measured shipped: ft 6/4, co 2/2,
        pk 0/0 — same ≤12/≤8 armed laws."""
        r16 = fr[:, :, 0].astype(np.int16)
        g16 = fr[:, :, 1].astype(np.int16)
        b16 = fr[:, :, 2].astype(np.int16)
        cloth = (g16 > r16 + 30) & (g16 > b16 + 30) & (g16 > 60)
        dil = ndimage.binary_dilation(cloth, structure=st8, iterations=6)
        clip = (g16 >= 254) & dil
        tot = int(clip.sum())
        mc = 0
        if tot:
            lab, n2 = ndimage.label(clip, structure=st8)
            if n2:
                mc = int(np.bincount(lab.ravel())[1:].max())
        return tot, mc

    # ---- orbits ----
    for orb in ('fulltable', 'corner'):
        ow = win[orb]
        f0, f1 = ow['body']
        gtot_max = [0, None]
        gcomp_max = [0, None]
        dtot_max = [0, None]
        dcomp_max = [0, None]
        # review pass-4 r14 P1: ordered pose anchors — the adjacent-step
        # law is direction-blind (a fully REVERSED body kept adjacency,
        # progress and recurrence green). Three pinned asymmetric track
        # frames per orbit must match their sealed 16x10 luma grids
        # (genuine drift 0.05 max cell; the reversed body reads 13.9 at
        # the first anchor).
        anch = card_sig.get('track_anchors', {}).get(orb)
        anch_frames = set(anch['frames']) if anch else set()
        anch_dev = 0.0
        blown_max = 0.0
        green_min = 1.0
        rpeak = [0, None]
        prev_o = None
        dup_o = 0
        pairs_o = 0
        hist_o = {}
        prog_hit_o = 0
        prog_n_o = 0
        counts_ft = []
        best = {'sum': -1, 'v0': None}
        # review pass-4 r1 P2: the element-census qualifier scans EVERY
        # track frame's largest component, never just the argmax window
        maxcomp_ft = 0
        comp_v = None
        bbox_ft = None
        anchor = ow.get('rclip_anchor')
        anchor_counts = []
        # review pass-4 r2 P1: FULL-HISTORY recurrence census — the
        # {12,15,16} min-offset progress law plus its 17-frame novelty
        # history cannot see a loop of period >= 18 (measured: an exact
        # 18-frame fulltable loop read progress 1.0 and shipped GREEN).
        # Every body frame is compared (16x-decimated MAD) against ALL
        # prior body frames beyond the 4 nearest; a real 360° orbit
        # never revisits a bearing (measured shipped: 0/595 ft, 0/445
        # co recurrent; a period-18 loop reads ~0.97). Scoped to the
        # ORBITS: the pocketing motion segs carry LAWFUL recurrence from
        # the disclosed static lead-ins/settle frames (measured shipped
        # 0.52-0.65) — the loop class is owned there by the redface
        # event-floor/outside rows (a looped event bleeds R>=254 outside
        # its disclosed windows; a loop without the event starves the
        # per-window floor).
        recur = 0
        recur_n = 0
        recur_hist = None
        recur_hn = 0
        # review pass-4 r5 P1: the authored 1 s hold (frames f1+1 ..
        # expected-1) must BE the terminal track frame — an unrelated
        # green tail preserved the count and passed every bar. Measured
        # genuine decoded hold MAD vs terminal: ft 0.036 / co 0.025 /
        # pk 0.002 (encoder dither only); bound 1.0 (below one motion
        # step; an unrelated frame reads several units).
        hold_term = None
        hold_mad_max = 0.0
        # review pass-4 r10 P2: the card seg bypassed every check — 60
        # black frames replacing the title card shipped green. Card
        # identity: intra-card stability (all frames == the seg's first;
        # genuine MAD <=0.014) + a bright-text census floor/ceiling
        # (genuine 42-56k px of text/frame-lines on the dark plate; a
        # black card reads 0, a washed frame reads ~1.6M).
        card_first = None
        card_mad = 0.0
        card_txt_min = 10 ** 9
        card_txt_max = 0
        # review pass-4 r6 P2: a whole-frame mean dilutes a LOCALIZED
        # hold defect (a 100x100 patch @100 levels reads only ~0.6 MAD)
        # — the hold is additionally judged per 100x160 tile (measured
        # genuine tile max 0.12; a visible patch reads tens).
        hold_tile_max = 0.0
        # review pass-4 r6 P1: framewise censuses are ORDER-INVARIANT —
        # a chunk-reordered body kept every bar green while the camera
        # visibly jumped. A smooth orbit bounds the adjacent-frame MAD
        # (measured genuine max: ft 3.84 @v66, co 7.45 @v229 — the
        # churn-peak knit shimmer); a reorder seam reads 26+ (measured
        # attack). Ceiling per orbit with ~30-55% margin.
        adj_mad_max = 0.0
        adj_prev = None
        n = 0
        for i, fr in _decode_frames(cfg['files'][orb], min_last_frame=f1,
                                    expected_frames=ow.get(
                                        'expected_frames')):
            n = i + 1
            if i < 60:  # authored title card (identity-judged, r10 P2)
                lum = (fr[:, :, 0] * 0.2126 + fr[:, :, 1] * 0.7152
                       + fr[:, :, 2] * 0.0722)
                txt = int((lum >= 128).sum())
                card_txt_min = min(card_txt_min, txt)
                card_txt_max = max(card_txt_max, txt)
                if card_first is None:
                    card_first = fr.astype(np.int16)
                else:
                    card_mad = max(card_mad, float(
                        np.abs(fr.astype(np.int16) - card_first).mean()))
                continue
            gd = ((fr[:, :, 1] > fr[:, :, 0])
                  & (fr[:, :, 1] > fr[:, :, 2])
                  & (fr[:, :, 1] > 40)).mean()
            green_min = min(green_min, float(gd))
            if i in anch_frames:
                pin = np.asarray(anch['grids'][anch['frames'].index(i)],
                                 np.float32)
                anch_dev = max(anch_dev, float(np.abs(
                    grid_of(fr.astype(np.int16)) - pin).max()))
            gt, gc = gdom_stats(fr)
            if gt > gtot_max[0]:
                gtot_max = [gt, i]
            if gc > gcomp_max[0]:
                gcomp_max = [gc, i]
            dt, dc = dclip_stats(fr)
            if dt > dtot_max[0]:
                dtot_max = [dt, i]
            if dc > dcomp_max[0]:
                dcomp_max = [dc, i]
            mx = fr.max(axis=2).astype('int16')
            mn = fr.min(axis=2).astype('int16')
            blown_max = max(blown_max, float(
                ((mx >= 250) & (mn * 100 >= mx * 88)).mean()))
            if f0 <= i <= f1:
                r254 = fr[:, :, 0] >= 254
                cnt = int(r254.sum())
                if cnt > rpeak[0]:
                    rpeak = [cnt, i]
                if anchor and anchor[0] <= i <= anchor[1]:
                    anchor_counts.append(cnt)
                if ow.get('rclip_fulltrack_max') is not None:
                    v = i - f0
                    counts_ft.append(cnt)
                    if v >= 3:
                        s4 = sum(counts_ft[v - 3:v + 1])
                        if s4 > best['sum']:
                            best = {'sum': s4, 'v0': v - 3}
                    if cnt:
                        lab2, n3 = ndimage.label(r254, structure=st8)
                        if n3:
                            sizes2 = np.bincount(lab2.ravel())[1:]
                            if int(sizes2.max()) > maxcomp_ft:
                                maxcomp_ft = int(sizes2.max())
                                comp_v = v
                                ys2, xs2 = np.where(
                                    lab2 == int(sizes2.argmax()) + 1)
                                bbox_ft = [int(xs2.min()), int(ys2.min()),
                                           int(xs2.max()), int(ys2.max())]
                f16o = fr.astype('int16')
                if prev_o is not None:
                    if int(np.abs(f16o - prev_o).max()) == 0:
                        dup_o += 1
                    pairs_o += 1
                prev_o = f16o
                dec = f16o[::8, ::8, :].astype(np.float32)
                offs = [o for o in (12, 15, 16)
                        if (i - o) in hist_o and (i - o) >= f0]
                if len(offs) == 3:
                    prog = min(float(np.abs(dec - hist_o[i - o]).mean())
                               for o in offs)
                    novel = all(float(np.abs(dec - h).mean()) >= 0.05
                                for h in hist_o.values())
                    prog_n_o += 1
                    if prog >= 1.0 and novel:
                        prog_hit_o += 1
                hist_o[i] = dec
                hist_o.pop(i - 17, None)
                dec16 = f16o[::16, ::16, :].astype(np.float32).ravel()
                if recur_hist is None:
                    recur_hist = np.empty((f1 - f0 + 1, dec16.size),
                                          np.float32)
                if recur_hn > 4:
                    mmin = float(np.abs(recur_hist[:recur_hn - 4]
                                        - dec16).mean(axis=1).min())
                    recur_n += 1
                    if mmin < 1.0:
                        recur += 1
                recur_hist[recur_hn] = dec16
                recur_hn += 1
                if adj_prev is not None:
                    adj_mad_max = max(adj_mad_max, float(
                        np.abs(dec16 - adj_prev).mean()))
                adj_prev = dec16
                if i == f1:
                    hold_term = f16o
            elif i > f1 and hold_term is not None:
                dterm = np.abs(fr.astype('int16') - hold_term)
                hold_mad_max = max(hold_mad_max, float(dterm.mean()))
                tiles = dterm.astype(np.float32).mean(axis=2).reshape(
                    10, 100, 16, 100).mean(axis=(1, 3))
                hold_tile_max = max(hold_tile_max, float(tiles.max()))
        if n == 0:
            _refuse(f'{orb} decode starved')
        row(f'enc_{orb}_scene_floor', round(green_min, 4),
            green_min >= ow.get('scene_green_min', 0.10),
            '(MIN per-frame green-dominant fraction, all non-card frames;'
            ' blank-encode guard)')
        dup_fo = (dup_o / pairs_o) if pairs_o else 1.0
        row(f'enc_{orb}_dup_frac', round(dup_fo, 4),
            pairs_o > 0 and dup_fo <= ow.get('dup_frac_max', 0.02),
            '(adjacent-dup fraction over track frames — an orbit must'
            ' sweep; frozen-encode guard)')
        prog_fo = (prog_hit_o / prog_n_o) if prog_n_o else 0.0
        row(f'enc_{orb}_progress', round(prog_fo, 4),
            prog_n_o > 0 and prog_fo >= ow.get('progress_frac_min', 0.60),
            '(fraction of track frames with min-offset {12,15,16}'
            ' decimated MAD >= 1.0 — short loops/dithered freezes read 0)')
        recur_frac = (recur / recur_n) if recur_n else 1.0
        row(f'enc_{orb}_recur_frac', round(recur_frac, 4),
            recur_n > 0 and recur_frac <= ow.get('recur_frac_max', 0.02),
            '(full-history min-MAD recurrence census — review pass-4 r2'
            ' P1: a loop of ANY period repeats its own history and reads'
            ' ~1.0; a 360° orbit never revisits a bearing, measured'
            ' shipped 0)')
        row(f'enc_{orb}_hold_max_mad', round(hold_mad_max, 4),
            hold_term is not None
            and hold_mad_max <= ow.get('hold_mad_max', 1.0),
            '(review pass-4 r5 P1: every authored 1 s hold frame must BE'
            ' the terminal track frame — measured genuine 0.025-0.036'
            ' encoder dither; an unrelated tail reads several units)')
        row(f'enc_{orb}_hold_tile_max', round(hold_tile_max, 4),
            hold_term is not None
            and hold_tile_max <= ow.get('hold_tile_mad_max', 2.0),
            '(review pass-4 r6 P2: hold judged per 100x160 tile too — a'
            ' localized patch dilutes the whole-frame mean but reads'
            ' tens per tile; measured genuine 0.12)')
        row(f'enc_{orb}_adjacent_mad_max', round(adj_mad_max, 4),
            adj_prev is not None
            and adj_mad_max <= ow.get('adjacent_mad_max', 10.0),
            '(review pass-4 r6 P1: order/continuity law — framewise'
            ' censuses are order-invariant, so a chunk-reordered body'
            ' shipped green; a smooth orbit bounds the adjacent step'
            ' (genuine max ft 3.84 / co 7.45), a reorder seam reads 26+)')
        row(f'enc_{orb}_track_anchors', round(anch_dev, 2),
            bool(anch) and anch_dev <= ow.get('card_sig_max_dev', 4.0),
            '(review pass-4 r14 P1: ordered pose anchors — three pinned'
            ' asymmetric track frames must match their sealed 16x10 luma'
            ' grids; genuine drift 0.05, a REVERSED body reads 13.9 —'
            ' the adjacent-step law alone is direction-blind)')
        sigdev_o = (sig_dev(orb, 0, card_first)
                    if card_first is not None else 1e9)
        row(f'enc_{orb}_card_identity',
            {'mad': round(card_mad, 4),
             'text_px': [card_txt_min, card_txt_max],
             'sig_dev': round(sigdev_o, 2)},
            card_first is not None
            and card_mad <= ow.get('card_mad_max', 1.0)
            and card_txt_min >= ow.get('card_text_min', 8000)
            and card_txt_max <= ow.get('card_text_max', 200000)
            and sigdev_o <= ow.get('card_sig_max_dev', 4.0),
            '(review pass-4 r10+r13 P2: the title card is identity-judged'
            ' — intra-card stability + text census + PINNED 16x10'
            ' spatial luma-grid signature (genuine drift <=1.0 max'
            ' cell; foreign/replaced artwork reads 14-20); a black,'
            ' replaced or re-worded card fires)')
        row(f'enc_{orb}_gdom_total_max', gtot_max,
            gtot_max[0] <= ow['gdom_total_max'],
            '(green-dominant G>=254 per-frame total on the DELIVERED'
            ' bytes — the enc_dline spot-floor law; [value, video frame])')
        row(f'enc_{orb}_gdom_comp_max', gcomp_max,
            gcomp_max[0] <= ow['gdom_comp_max'],
            '(largest 8-connected green-dominant G>=254 component —'
            ' the enc_dline line-body law; line-class = component > 8)')
        row(f'enc_{orb}_dclip_total_max', dtot_max,
            dtot_max[0] <= ow.get('dclip_total_max', 12),
            '(G>=254 ANY-chroma within 6 px of cloth-green — review'
            ' pass-4 r3 P1: a neutral R=G=B=255 marking clip evades'
            ' green-dominance; mirrors the sweep cloth-adjacency law)')
        row(f'enc_{orb}_dclip_comp_max', dcomp_max,
            dcomp_max[0] <= ow.get('dclip_comp_max', 8),
            '(largest 8-connected component of the cloth-adjacent'
            ' any-chroma clip census — line-class zero-tolerance)')
        row(f'enc_{orb}_blown_frac_max', round(blown_max, 6),
            blown_max <= ow['blown_frac_max'],
            '(V>=0.98 & S<=0.12 fraction — the orbit judge predicate)')
        if orb == 'fulltable':
            row('enc_fulltable_rclip_peak', rpeak, True,
                '(RECORDED, ungated — booked rail-band light-band family,'
                ' ledger row 5; [px, video frame])')
        else:
            aq = sum(anchor_counts)
            row('enc_corner_rclip_anchor_quad',
                {'sum': aq, 'counts': anchor_counts,
                 'video_f': anchor},
                len(anchor_counts) == 4
                and aq <= ow['rclip_anchor_quad_max'],
                f"(the pinned shipped-peak bearing v{anchor[0]}-"
                f"{anchor[1]}; cap {ow['rclip_anchor_quad_max']},"
                ' red-arm 1507 — the anchored half of the split law)')
            v0 = best['v0']
            ftq = {'sum': best['sum'],
                   'counts': counts_ft[v0:v0 + 4],
                   'video_f0': v0 + f0, 'track_i0': v0,
                   'az_deg': round(-90 + 360.0 * v0 / len(counts_ft), 1),
                   'peak_px': max(counts_ft),
                   'peak_video_f': int(np.argmax(counts_ft)) + f0,
                   'maxcomp': maxcomp_ft,
                   'maxcomp_video_f': (comp_v + f0
                                       if comp_v is not None else None),
                   'maxcomp_bbox': bbox_ft}
            row('enc_corner_rclip_fulltrack_quad', ftq,
                best['sum'] <= ow['rclip_fulltrack_max'],
                f"(sliding 4-frame quad over ALL {len(counts_ft)} track"
                f" frames, argmax bearing recorded; cap"
                f" {ow['rclip_fulltrack_max']} = measured 1342 × 1.08"
                ' family swing; defect basis 1557 red — the full-track'
                ' half of the split law)')
            row('enc_corner_rclip_fulltrack_comp',
                {'maxcomp': maxcomp_ft, 'video_f': ftq['maxcomp_video_f'],
                 'bbox': bbox_ft},
                maxcomp_ft <= ow['rclip_fulltrack_comp_max'],
                '(element-census qualifier: largest R>=254 component on'
                ' EVERY track frame — review pass-4 r1 P2; booked'
                ' boundary-line family, whole-track measured 59 px,'
                f" cap {ow['rclip_fulltrack_comp_max']} — a new"
                ' large-element class can never hide under a green sum)')

    # ---- pocketing ----
    pw = win['pocketing']
    cards = [tuple(c) for c in pw['card_segs']]
    in_card = lambda i: any(a <= i <= b for a, b in cards)
    motion_segs = [tuple(sg) for sg in pw['motion_segs']]
    in_motion = lambda i: any(a <= i <= b for a, b in motion_segs)
    rwin = [tuple(wv) for wv in pw['redface_windows']]
    in_rwin = lambda i: any(a <= i <= b for a, b in rwin)
    seg_of = lambda i: next((si for si, (a, b) in enumerate(motion_segs)
                             if a <= i <= b), None)
    green_min = 1.0
    prev = None
    dup_count = 0
    motion_n = 0
    hist = {}
    prog_hits = {si: 0 for si in range(len(motion_segs))}
    prog_n = {si: 0 for si in range(len(motion_segs))}
    r_in_peak = {wi: [0, None] for wi in range(len(rwin))}
    r_out_peak = [0, None]
    gtot_max = [0, None]
    gcomp_max = [0, None]
    dtot_max = [0, None]
    dcomp_max = [0, None]
    blown_max = 0.0
    n_frames = 0
    # review pass-4 r3 P1: an in-seg loop (e.g. two identical 18-frame
    # cycles filling the 36-frame slow seg) evades dup/progress AND the
    # plain recurrence census is lawful-noisy here (static lead-ins
    # measure 0.52-0.65 recurrent). The loop signature is a frame that
    # both MOVES (adjacent MAD >= 1.0 — real ball motion content) and
    # RECURS (min-MAD < 1.0 vs the seg's own earlier frames beyond the
    # 4 nearest): static settle frames are recurrent-but-still, real
    # gameplay is moving-but-novel (measured shipped: 0), a looped
    # motion cycle is both (reads its full second cycle).
    mr_seg = None
    mr_hist = None
    mr_hn = 0
    mr_prev = None
    moving_recur = 0
    # review pass-4 r5 P1 + r7 P1 (pocketing): the authored holds AND the
    # disclosed deterministic static tails must BE their terminal motion
    # frames (rt tail v89-142 vs v88, rt hold v143-172 vs v142; slow
    # tail v274-334 vs v273, slow hold v335-364 vs v334) — a hard cut to
    # any other static table frame previously stayed green (the
    # temporal state reset across the excluded spans). Measured genuine
    # 0.002-0.007 encoder dither, same whole-frame + per-tile laws.
    hold_pairs = [tuple(hp) for hp in pw.get('hold_pairs', [])]
    pk_hold_terms = {}
    pk_hold_mad = 0.0
    pk_hold_tile = 0.0
    # review pass-4 r7 P1: neutral-white specular caps + the blown bar —
    # a neutral (R=G=B) clipped highlight evades the green-dominant
    # gclip rows AND the cloth-adjacent dclip rows, and pk blown was
    # never gated. Measured genuine: neutral total 102 @v84 / component
    # 68 @v265 (the specular core going neutral at event peak — booked
    # family); caps +~50% disclosure margin.
    pk_neu_total = [0, None]
    pk_neu_comp = [0, None]
    # review pass-4 r10 P2 (cards) + P1 (motion continuity): both card
    # segs are identity-judged (genuine intra MAD <=0.0135, text 42-43k)
    # and the motion segs gain a per-seg adjacent-step ceiling (genuine
    # max rt 3.05 / slow 2.34; a one-frame hard cut reads ~69).
    pk_card_first = {}
    pk_card_mad = 0.0
    # review r12 P2: per-SLOT text signatures (rt/slow plates carry
    # distinct, pinned text censuses — a swapped pair reads the
    # sibling's signature)
    pk_card_txt = {k: [10 ** 9, 0] for k in range(len(cards))}
    pk_adj_max = 0.0
    # review pass-4 r8 P1: EVENT-ORDER law — dup/progress/recurrence are
    # order-tolerant enough that a chunk-reordered event window shipped
    # green. The genuine event is UNIMODAL in the object-sensitive
    # R>=254 count (the red ball approaches, peaks, is swallowed: one
    # rise + one fall per window; measured genuine reversals = 1, with
    # sub-8%-of-peak jitter ignored — e.g. the 9844->9804 dip @v83).
    # A chunk reorder produces multiple significant rises/falls.
    rwin_seq = {wi: [] for wi in range(len(rwin))}
    pk_last = max(b for a, b in motion_segs + rwin)
    for i, fr in _decode_frames(cfg['files']['pocketing'],
                                min_last_frame=pk_last,
                                expected_frames=pw.get('expected_frames')):
        n_frames = i + 1
        if in_card(i):
            ci = next(k for k, (a, b) in enumerate(cards) if a <= i <= b)
            lum = (fr[:, :, 0] * 0.2126 + fr[:, :, 1] * 0.7152
                   + fr[:, :, 2] * 0.0722)
            txt = int((lum >= 128).sum())
            pk_card_txt[ci][0] = min(pk_card_txt[ci][0], txt)
            pk_card_txt[ci][1] = max(pk_card_txt[ci][1], txt)
            if ci not in pk_card_first:
                pk_card_first[ci] = fr.astype(np.int16)
            else:
                pk_card_mad = max(pk_card_mad, float(np.abs(
                    fr.astype(np.int16) - pk_card_first[ci]).mean()))
            prev = None
            hist.clear()
            continue
        gd = ((fr[:, :, 1] > fr[:, :, 0]) & (fr[:, :, 1] > fr[:, :, 2])
              & (fr[:, :, 1] > 40)).mean()
        green_min = min(green_min, float(gd))
        for hp in hold_pairs:
            if i == hp[0]:
                pk_hold_terms[hp[0]] = fr.astype(np.int16)
            elif hp[1] <= i <= hp[2] and hp[0] in pk_hold_terms:
                dterm = np.abs(fr.astype(np.int16) - pk_hold_terms[hp[0]])
                pk_hold_mad = max(pk_hold_mad, float(dterm.mean()))
                tiles = dterm.astype(np.float32).mean(axis=2).reshape(
                    10, 100, 16, 100).mean(axis=(1, 3))
                pk_hold_tile = max(pk_hold_tile, float(tiles.max()))
        cnt = int((fr[:, :, 0] >= 254).sum())
        wi = next((k for k, (a, b) in enumerate(rwin) if a <= i <= b), None)
        if wi is not None:
            if cnt > r_in_peak[wi][0]:
                r_in_peak[wi] = [cnt, i]
            rwin_seq[wi].append(cnt)
        elif cnt > r_out_peak[0]:
            r_out_peak = [cnt, i]
        gt, gc = gdom_stats(fr)
        if gt > gtot_max[0]:
            gtot_max = [gt, i]
        if gc > gcomp_max[0]:
            gcomp_max = [gc, i]
        dt, dc = dclip_stats(fr)
        if dt > dtot_max[0]:
            dtot_max = [dt, i]
        if dc > dcomp_max[0]:
            dcomp_max = [dc, i]
        mx = fr.max(axis=2).astype('int16')
        mn = fr.min(axis=2).astype('int16')
        blown_max = max(blown_max, float(
            ((mx >= 250) & (mn * 100 >= mx * 88)).mean()))
        neu = (mn >= 250) & (mx >= 254)
        nt = int(neu.sum())
        if nt > pk_neu_total[0]:
            pk_neu_total = [nt, i]
        if nt:
            lab, n2 = ndimage.label(neu, structure=st8)
            if n2:
                nc = int(np.bincount(lab.ravel())[1:].max())
                if nc > pk_neu_comp[0]:
                    pk_neu_comp = [nc, i]
        if in_motion(i):
            f16 = fr.astype(np.int16)
            if prev is not None and in_motion(i - 1):
                if int(np.abs(f16 - prev).max()) == 0:
                    dup_count += 1
                motion_n += 1
            prev = f16
            dec = f16[::8, ::8, :].astype(np.float32)
            offs = [o for o in (12, 15, 16)
                    if (i - o) in hist and in_motion(i - o)]
            if len(offs) == 3:
                prog = min(float(np.abs(dec - hist[i - o]).mean())
                           for o in offs)
                novel = all(float(np.abs(dec - h).mean()) >= 0.05
                            for h in hist.values())
                si = seg_of(i)
                prog_n[si] += 1
                if prog >= 1.0 and novel:
                    prog_hits[si] += 1
            hist[i] = dec
            hist.pop(i - 17, None)
            dec16 = f16[::16, ::16, :].astype(np.float32).ravel()
            mr_si = seg_of(i)
            if mr_si != mr_seg:
                mr_seg = mr_si
                mr_hist = np.empty(
                    (max(b2 - a2 + 1 for a2, b2 in motion_segs),
                     dec16.size), np.float32)
                mr_hn = 0
                mr_prev = None
            adjv = (float(np.abs(dec16 - mr_prev).mean())
                    if mr_prev is not None else None)
            if adjv is not None:
                pk_adj_max = max(pk_adj_max, adjv)
            moving = adjv is not None and adjv >= 1.0
            if mr_hn > 4 and moving:
                mmin = float(np.abs(mr_hist[:mr_hn - 4]
                                    - dec16).mean(axis=1).min())
                # NEAR-repeat threshold 0.5 (not the 1.0 novelty cut):
                # the lawful ball-ENTRY ramp straddles 1.0 (small ball,
                # adj 1.05-1.28 / histmin 0.78-0.89) and must not count;
                # a looped cycle re-encodes to histmin 0.03-0.11. The
                # ONE lawful <0.5 read is the post-swallow STATE-RETURN
                # (v86: empty table again matches pre-entry, histmin
                # 0.09-0.13 on both sealed deliveries) — bound 2.
                if mmin < 0.5:
                    moving_recur += 1
            mr_hist[mr_hn] = dec16
            mr_hn += 1
            mr_prev = dec16
        else:
            prev = None
            hist.clear()
    if n_frames == 0:
        _refuse('pocketing decode starved')
    row('enc_pk_scene_floor', round(green_min, 4),
        green_min >= pw.get('scene_green_min', 0.25),
        '(MIN non-card-frame green-dominant fraction; blank-encode guard)')
    dup_frac = (dup_count / motion_n) if motion_n else 1.0
    row('enc_pk_dup_frac', round(dup_frac, 4),
        motion_n > 0 and dup_frac <= pw.get('dup_frac_max', 0.02),
        f'(adjacent-dup fraction over the motion segs {motion_segs};'
        f' {motion_n} pairs — the disclosed deterministic static tails'
        ' sit OUTSIDE the segs and stay dup-lawful)')
    prog_fracs = [(prog_hits[si] / prog_n[si]) if prog_n[si] else 0.0
                  for si in range(len(motion_segs))]
    prog_min = round(min(prog_fracs), 4) if prog_fracs else 0.0
    row('enc_pk_progress', prog_min,
        bool(prog_fracs) and min(prog_fracs)
        >= pw.get('progress_frac_min', 0.30),
        f'(per-seg min; measured shipped rt 0.667 / slow 0.85 — floor'
        f' with deliberate headroom; per-seg counts {prog_n})')
    row('enc_pk_redface_peak',
        {f'w{k}': r_in_peak[k] for k in range(len(rwin))},
        all(r_in_peak[k][0] <= pw['redface_peak_max']
            for k in range(len(rwin))),
        f'(red-ball lit-face R>=254 clip inside the disclosed approach'
        f' windows {rwin}; disclosure ceiling {pw["redface_peak_max"]},'
        ' measured 10,136 — pass-4 booked row, 489 ledger)')
    row('enc_pk_redface_event_floor',
        min(r_in_peak[k][0] for k in range(len(rwin))),
        all(r_in_peak[k][0] >= pw['redface_peak_min']
            for k in range(len(rwin))),
        f'(each window must CARRY the event, >= {pw["redface_peak_min"]}'
        ' px peak — a frozen/looped clip reads the <=54 px static floor;'
        ' gameplay-presence anchor)')
    row('enc_pk_redface_outside', r_out_peak,
        r_out_peak[0] <= pw['redface_outside_max'],
        f'(family may never appear outside the disclosed windows; bound'
        f' {pw["redface_outside_max"]}, measured outside residual 54 ='
        ' event-edge AA)')
    row('enc_pk_gclip_total_max', gtot_max,
        gtot_max[0] <= pw['gclip_total_max'],
        '(specular-arc G-clip: white highlight on the red ball under'
        ' 4:2:0 chroma sharing — pass-4 booked row; NOT the enc_dline'
        ' law, see the scope sentence in the docstring)')
    row('enc_pk_gclip_comp_max', gcomp_max,
        gcomp_max[0] <= pw['gclip_comp_max'],
        '(largest 8-connected component of the specular-arc family;'
        ' measured 18 px @ v247)')
    row('enc_pk_dclip_total_max', dtot_max,
        dtot_max[0] <= pw.get('dclip_total_max', 12),
        '(G>=254 ANY-chroma within 6 px of cloth-green — review pass-4'
        ' r3 P1 neutral-clip law; measured shipped 0: the specular-arc'
        ' family sits off-cloth and stays owned by enc_pk_gclip)')
    row('enc_pk_dclip_comp_max', dcomp_max,
        dcomp_max[0] <= pw.get('dclip_comp_max', 8),
        '(largest component of the cloth-adjacent any-chroma clip'
        ' census)')
    row('enc_pk_hold_max_mad', round(pk_hold_mad, 4),
        len(pk_hold_terms) == len(hold_pairs)
        and pk_hold_mad <= pw.get('hold_mad_max', 1.0),
        '(review pass-4 r5+r7 P1: the authored holds AND the disclosed'
        ' static tails must BE their terminal motion frames — v89-142'
        ' vs v88, v143-172 vs v142, v274-334 vs v273, v335-364 vs v334;'
        ' measured genuine 0.002-0.007 encoder dither)')
    row('enc_pk_hold_tile_max', round(pk_hold_tile, 4),
        len(pk_hold_terms) == len(hold_pairs)
        and pk_hold_tile <= pw.get('hold_tile_mad_max', 2.0),
        '(review pass-4 r6 P2: holds/static tails judged per 100x160'
        ' tile too — a localized patch dilutes the whole-frame mean)')
    row('enc_pk_blown_frac_max', round(blown_max, 6),
        blown_max <= pw.get('blown_frac_max', 0.005),
        '(V>=0.98 & S<=0.12 fraction — the orbit judge predicate, now'
        ' gated on the pocketing delivery too; review pass-4 r7 P1)')
    row('enc_pk_neutral_total_max', pk_neu_total,
        pk_neu_total[0] <= pw.get('neutral_total_max', 160),
        '(neutral-white clip census min(RGB)>=250 & max>=254 — evades'
        ' both the green-dominant gclip and the cloth-adjacent dclip'
        ' rows; measured genuine 102 @v84 = the specular core going'
        ' neutral at event peak, booked family; review pass-4 r7 P1)')
    row('enc_pk_neutral_comp_max', pk_neu_comp,
        pk_neu_comp[0] <= pw.get('neutral_comp_max', 104),
        '(largest 8-connected neutral-white component; measured genuine'
        ' 68 @v265 — a large blown highlight reads hundreds+)')
    # review pass-4 r8 P1 + r9 P1: EVERY window independently must read
    # the event's physical shape — RISE first, FALL last, exactly one
    # reversal (a zero-reversal monotone or a fall-then-rise valley is
    # a reordered event), and the peak must sit in the BACK half of the
    # window (the ball is fastest/nearest just before the swallow —
    # genuine peak position 83-85%; a time-reversed window is still
    # unimodal but peaks in the front).
    shapes = []
    shape_ok = bool(rwin)
    for wi in range(len(rwin)):
        seq = rwin_seq[wi]
        pk_amp = max(seq) if seq else 0
        tol = 0.08 * pk_amp
        direction = 0
        first_dir = 0
        revs = 0
        last = seq[0] if seq else 0
        for c in seq[1:]:
            d = c - last
            if abs(d) <= tol:
                continue
            sgn = 1 if d > 0 else -1
            if not first_dir:
                first_dir = sgn
            if direction and sgn != direction:
                revs += 1
            direction = sgn
            last = c
        peak_pos = (seq.index(pk_amp) / (len(seq) - 1)) if len(seq) > 1 \
            else 0.0
        ok_w = (revs == pw.get('event_reversals_max', 1)
                and first_dir == 1 and direction == -1
                and peak_pos >= pw.get('event_peak_pos_min', 0.5))
        shapes.append({'w': wi, 'revs': revs, 'first': first_dir,
                       'last': direction, 'peak_pos': round(peak_pos, 3),
                       'ok': ok_w})
        if not ok_w:
            shape_ok = False
    row('enc_pk_event_shape', shapes, shape_ok,
        '(review pass-4 r8+r9 P1: per-window event-shape law — the'
        ' in-window R>=254 count must RISE then FALL with exactly one'
        ' reversal (8%-of-peak jitter ignored; genuine 1/1) and peak in'
        ' the back half (genuine 0.83-0.85; a time-reversed or'
        ' chunk-reordered event fails shape or peak position)')
    slots = pw.get('card_slots')
    slots_ok = True
    if slots:
        for ci in range(len(cards)):
            lo, hi = slots[ci]
            if not (lo <= pk_card_txt[ci][0]
                    and pk_card_txt[ci][1] <= hi):
                slots_ok = False
    pk_sig_devs = {ci: (sig_dev('pocketing', ci, pk_card_first[ci])
                        if ci in pk_card_first else 1e9)
                   for ci in range(len(cards))}
    row('enc_pk_card_identity',
        {'mad': round(pk_card_mad, 4),
         'text_px': {f'slot{k}': v for k, v in pk_card_txt.items()},
         'sig_dev': {f'slot{k}': round(v, 2)
                     for k, v in pk_sig_devs.items()}},
        len(pk_card_first) == len(cards)
        and pk_card_mad <= pw.get('card_mad_max', 1.0)
        and slots_ok
        and all(v <= pw.get('card_sig_max_dev', 4.0)
                for v in pk_sig_devs.values()),
        '(review pass-4 r10+r12+r13 P2: BOTH title cards identity-judged'
        ' — intra-card stability + per-SLOT pinned text signatures +'
        ' PINNED 16x10 spatial luma-grid signatures (genuine drift'
        ' <=1.0 max cell; a swapped sibling plate reads 14.7); a black,'
        ' replaced, swapped or re-worded card fires)')
    row('enc_pk_motion_adjacent_max', round(pk_adj_max, 4),
        pk_adj_max > 0
        and pk_adj_max <= pw.get('motion_adjacent_max', 6.0),
        '(review pass-4 r10+r11 P1: per-seg adjacent-step ceiling over'
        ' the motion segs INCLUDING their static pre-rolls — genuine'
        ' max rt 3.05 / slow 2.34, boundary steps 0.001-0.005; a'
        ' one-frame hard cut reads ~69, a wholesale pre-roll'
        ' replacement breaks at the 237->238 step)')
    card_dist = 0.0
    if len(pk_card_first) == len(cards) and len(cards) == 2:
        card_dist = float(np.abs(pk_card_first[0]
                                 - pk_card_first[1]).mean())
    row('enc_pk_card_distinct', round(card_dist, 4),
        card_dist >= pw.get('card_distinct_min', 0.5),
        '(review pass-4 r11 P2: the realtime and slow-motion cards must'
        ' be DISTINCT plates — genuine inter-card MAD 1.718; one card'
        ' copied over the other reads ~0)')
    row('enc_pk_moving_recur', moving_recur,
        moving_recur <= pw.get('moving_recur_max', 2),
        '(review pass-4 r3 P1: frames that MOVE (adjacent 16x MAD >= 1)'
        ' AND NEAR-REPEAT the seg history (min-MAD < 0.5 beyond the 4'
        ' nearest) — an in-seg looped motion cycle reads 4+, genuine'
        ' gameplay reads exactly 1 (the lawful post-swallow'
        ' state-return v86), static settle frames never count)')

    post_sha = {k: _sha256(v) for k, v in cfg['files'].items()}
    changed = [k for k in pre_sha if pre_sha[k] != post_sha[k]]
    if changed:
        _refuse(f'input bytes changed during judgment: {changed}')
    rep = {'tool': 'tools/render/orbitsweep-judge.py', 'mode': 'encoded', 'produced_by': cfg.get('produced_by', 'encoded'), 'bars': rows, 'red': red, 'windows': win,
           'files': cfg['files'],
           'files_sha256': pre_sha,
           'when': __import__('datetime').datetime.now(
               __import__('datetime').timezone.utc).isoformat()}
    with open(cfg['out'], 'w') as f:
        json.dump(rep, f, indent=1)
    print(f"[encoded] {'RED' if red else 'GREEN'} "
          f"({len(rows)} bars) -> {cfg['out']}")
    sys.exit(3 if red else 0)


def encoded_selftest(workdir):
    """review pass-3 r6 P2 (rebuilt r9 P2): the encoded red-arm must
    exercise the REAL measurement pipeline, not replay scalars past it.
    Synthetic 1600x1000@30 clips run through the same --encoded entry a
    shipped pack takes:
      GREEN case — a valid clean baseline (green field, dark sock ROI,
                   a MOVING marker crossing the mouth ROI) must pass
                   every bar (exit 0, empty red set) — a false-positive
                   regression in any bar breaks the selftest;
      RED case   — netball green, out-of-window mouth flash, G=255 clip
                   patch, blown patch and a frozen motion span seeded ->
                   exit 3 with EXACTLY the seeded bars red (extras would
                   mask a false-positive class);
      REFUSAL A  — a 60 fps re-encode -> cadence refusal (exit 2);
      REFUSAL B  — a truncated clip -> coverage refusal (exit 2).
    Any other outcome exits 4 (selftest broken)."""
    import subprocess
    import shutil
    os.makedirs(workdir, exist_ok=True)
    FF = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y']
    ENC = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18',
           '-pix_fmt', 'yuv420p']
    # base scene: green field; the sock ROI carries a dark knit stand-in
    # (netball must read 0 on the base); the mouth ROI stays GREEN (the
    # real deliverable's own read — the pocketing scene floor judges it);
    # a gray marker crosses the mouth ROI via overlay (overlay's x
    # expression evaluates per frame — drawbox's does not in this build,
    # the r6 selftest's frozen-box defect) providing motion + dup-free
    # frames without any green-flash contribution.
    def build(name, frames, fps, seed_defects, freeze=None):
        out = os.path.join(workdir, name)
        d = seed_defects
        vf = ["[0:v]drawbox=x=620:y=570:w=500:h=430:color=0x101010:t=fill"]
        if d.get('netball'):
            vf.append("drawbox=x=800:y=700:w=60:h=60:color=0x10e010:"
                      "t=fill:enable='between(n,120,140)'")
        if d.get('flash_outside'):
            # a DIFFERENT green in the mouth ROI: |dRGB| vs the base
            # green exceeds moved_thresh while greenness >= 20
            vf.append("drawbox=x=820:y=400:w=80:h=60:color=0x18d018:"
                      "t=fill:enable='between(n,150,160)'")
        if d.get('clip'):
            vf.append("drawbox=x=200:y=200:w=40:h=10:color=0x00ff00:"
                      "t=fill:enable='gte(n,61)'")
        if d.get('blown'):
            vf.append("drawbox=x=300:y=600:w=120:h=100:color=0xffffff:"
                      "t=fill:enable='gte(n,61)'")
        ox = (d.get('loop7')
              and "'100+150*mod(floor(t*30+0.5),7)'"
              or "'mod(t*210,1300)'")
        fc = (','.join(vf) + "[bg];"
              f"[bg][1:v]overlay=x={ox}:y=350[v]")
        cmd = FF + ['-f', 'lavfi',
                    '-i', f'color=c=0x1e7828:s=1600x1000:r={fps}:'
                          f'd={(frames + 2) / fps}',
                    '-f', 'lavfi',
                    '-i', f'color=c=0xc8c8c8:s=90x90:r={fps}:'
                          f'd={(frames + 2) / fps}',
                    '-filter_complex', fc, '-map', '[v]',
                    '-frames:v', str(frames)]
        cmd += ENC + [out]
        subprocess.run(cmd, check=True)
        if freeze:
            # replace a motion-window span with one repeated frame
            # (freezeframes is a two-input filter: source + replace src)
            f0, f1 = freeze
            frz = os.path.join(workdir, 'frz-' + name)
            subprocess.run(FF + [
                '-i', out, '-i', out, '-filter_complex',
                f'[0:v][1:v]freezeframes=first={f0}:last={f1}:'
                f'replace={f0}[v]', '-map', '[v]',
                '-frames:v', str(frames)] + ENC + [frz], check=True)
            os.replace(frz, out)
        return out
    files_green = {
        'pocketing': build('green-pocketing.mp4', 387, 30, {}),
        'fulltable': build('green-fulltable.mp4', 690, 30, {}),
        'corner': build('green-corner.mp4', 540, 30, {}),
    }
    files_red = {
        'pocketing': build('490-joy-q8-pocketing-30fps.mp4', 387, 30,
                           {'netball': 1, 'flash_outside': 1},
                           freeze=(100, 130)),
        'fulltable': build('490-joy-q8-fulltable-orbit.mp4', 690, 30,
                           {'clip': 1, 'blown': 1}),
        'corner': files_green['corner'],
    }
    cfg_tpl = json.load(open(os.path.join(workdir, 'cfg-template.json')))
    def run_case(tag, files, expect_exit, expect_red=None):
        cfg = dict(cfg_tpl)
        cfg['files'] = files
        cfg['out'] = os.path.join(workdir, f'bars-{tag}.json')
        cfg['produced_by'] = 'red-arm'  # FIX7 (Fable pass 2): these bars are the selftest's, not a shipped pack's
        cp = os.path.join(workdir, f'cfg-{tag}.json')
        json.dump(cfg, open(cp, 'w'))
        r = subprocess.run([sys.executable, os.path.abspath(__file__),
                            '--encoded', cp], capture_output=True,
                           text=True)
        if r.returncode != expect_exit:
            print(r.stdout + r.stderr)
            print(f'[enc-selftest] {tag}: exit {r.returncode} != '
                  f'{expect_exit}')
            sys.exit(4)
        if expect_red is not None:
            rep = json.load(open(cfg['out']))
            got = sorted(rep['red'])
            want = sorted(expect_red)
            if got != want:
                # the EXACT red set (review r9 P2): extras mask
                # false-positive regressions, absences mask dead bars
                print(f'[enc-selftest] {tag}: red set mismatch\n'
                      f'  want {want}\n  got  {got}')
                sys.exit(4)
        print(f'[enc-selftest] {tag}: OK (exit {expect_exit}'
              + (f', red set {sorted(expect_red)}'
                 if expect_red else '') + ')')
    run_case('green', files_green, 0, expect_red=[])
    # 7-frame loop (review r12 P1): a period that divides none of the
    # progress offsets — the novelty veto must still zero the census
    files_loop = dict(files_green,
                      pocketing=build('loop7-pocketing.mp4', 387, 30,
                                      {'loop7': 1}))
    run_case('loop7', files_loop, 3, expect_red=['enc_pocketing_progress'])
    run_case('red', files_red, 3, expect_red=[
        'enc_netball_green_max', 'enc_mouth_flash_outside',
        'enc_fulltable_clip_g_max', 'enc_fulltable_blown_frac_max',
        'enc_pocketing_dup_frac'])
    # REFUSAL A: 60 fps cadence
    f60 = os.path.join(workdir, 'pocketing-60fps.mp4')
    subprocess.run(FF + ['-i', files_red['pocketing'],
                         '-vf', 'fps=60', '-frames:v', '774']
                   + ENC + [f60], check=True)
    run_case('cadence', dict(files_red, pocketing=f60), 2)
    # REFUSAL B: truncated pocketing
    ftr = os.path.join(workdir, 'pocketing-short.mp4')
    subprocess.run(FF + ['-i', files_red['pocketing'], '-frames:v', '50']
                   + ENC + [ftr], check=True)
    run_case('coverage', dict(files_red, pocketing=ftr), 2)
    print('[enc-selftest] OK — clean baseline green, every seeded defect '
          'class fires exactly, invalid evidence refuses')
    sys.exit(0)


def bloom_selftest(cfg):
    """RULING R-S8-4 (R3-SNK-9) red arm for the encoder-bloom exclusion.
    cfg = {enc_bloom: WINDOWS.enc_bloom, enc_dline_comp_max,
    enc_dline_total_max} — the driver passes the LIVE windows so the arm
    exercises the constants the gate runs with (no Python defaults).

    Layer 1 — PAINTED decoded planes (deterministic, numpy only): each
    case paints a source plane, a decoded plane and a mask on its own
    canvas, runs the enc_dline census (decoded G>=254 on/next to cloth,
    screen scope) + the classifier, and asserts (a) how many px the
    classifier excludes and (b) whether the component/total law still
    fires. The marking family (a drawn G=255 line, a cured-headroom
    white line pulled toward green, a zero-headroom white line, a
    zero-headroom thick marking on the cloth mesh, and — R3-SNK-11 C1 —
    a genuinely drawn WHITE line on cloth), a lit cord with no body and
    a rim thicker than the bleed must ALL keep counting; the lit-glint
    rim is excluded by the classifier, and a source-blown white on
    furniture away from cloth (the e7ffa1c9 corner v89 class) is scoped
    out by the screen's source-MAX-channel rule (the blown_frame lane's).
    Colours are the MEASURED seal values (9c0437a3 corner f064 / v89,
    fulltable marking family) — nothing authored.

    Layer 2 — a REAL libx264 crf 14 medium yuv420p round trip (the
    encode pass's exact ffmpeg arguments) of a synthetic straddling
    scene: the rim must reproduce the clip (mechanism check) and be
    excluded; the zero-headroom warm lines on cloth must reproduce the
    clip and keep counting. Any other outcome exits 4 (arm broken)."""
    import numpy as np
    from scipy import ndimage
    import subprocess
    import shutil
    import tempfile
    bw = cfg['enc_bloom']
    comp_max = int(cfg['enc_dline_comp_max'])
    total_max = int(cfg['enc_dline_total_max'])
    # MEASURED seal 9c0437a3 corner f064 (source run/v0384 | decoded e064)
    CLOTH = (0, 90, 37)          # y491 cloth row (the rim's chroma partner)
    GLINT = (254, 248, 223)      # y490 source (last lit row of the bore strip)
    RIM_DEC = (222, 255, 220)    # y490 decoded: R -32, G +7, |dY| < 4
    BODY_DEC = (255, 243, 205)   # y487 decoded: the un-shifted body
    # MEASURED seal 9c0437a3 corner screen v89 (bottom-edge wood glint)
    WOOD = (143, 101, 26)
    WHITE_SPEC = (255, 253, 244)
    WHITE_SPEC_DEC = (251, 254, 246)  # dG +1..+3, dR -4: quantisation
    # MEASURED cured marking family (seal fulltable f000/18/37/56): source
    # V max 220; decoded G max 238 (headroom holds) — the hypothetical
    # "pulled to 254" plane below is the zero-headroom regression.
    MARK = (220, 220, 220)
    MARK_PULLED = (200, 254, 214)
    ZERO_HEAD_WHITE = (250, 250, 250)   # V = highlight floor, neutral
    ZERO_HEAD_WHITE_DEC = (222, 255, 226)
    H, W = 160, 200

    def canvas():
        s = np.zeros((H, W, 3), np.int16)
        s[...] = CLOTH
        return s, s.copy(), np.ones((H, W), bool)

    def census(s, dd, cloth):
        near = ndimage.binary_dilation(cloth, structure=np.ones((3, 3), bool),
                                       iterations=6)
        # R3-SNK-11 C1: the screen's scope — source MAX channel (any
        # blown channel = a blown highlight), cloth proximity keeps a clip
        g = (dd[..., 1] >= 254) & ((s.max(axis=2) < 254) | near)
        lab, n2 = ndimage.label(g, structure=np.ones((3, 3), bool))
        raw_px = int(g.sum())
        excl_px = 0
        net_max = 0
        reasons = []
        for k2, sl in enumerate(ndimage.find_objects(lab), start=1):
            yy, xx = np.nonzero(lab[sl] == k2)
            members = list(zip((xx + sl[1].start).tolist(),
                               (yy + sl[0].start).tolist()))
            isb, why = enc_bloom_component(members, s, dd, cloth, bw)
            reasons.append(why)
            if isb:
                excl_px += len(members)
            else:
                net_max = max(net_max, len(members))
        net_px = raw_px - excl_px
        fires = net_max > comp_max or net_px > total_max
        return raw_px, excl_px, net_max, fires, reasons

    cases = []
    # A drawn green line (G=255 in source AND decode): marking family
    s, dd, cl = canvas()
    s[20:22, 40:80] = (60, 255, 80)
    dd[20:22, 40:80] = (60, 255, 80)
    cases.append(('drawn_green_line_2x40', s, dd, cl, 0, True))
    # B cured-headroom white marking pulled toward green (hypothetical
    # decoded clip): source V 220 < highlight floor -> counts
    s, dd, cl = canvas()
    s[40:42, 40:80] = MARK
    dd[40:42, 40:80] = MARK_PULLED
    cases.append(('white_marking_v220_pulled', s, dd, cl, 0, True))
    # C zero-headroom white marking, 2 px: every pixel shifts -> no body
    s, dd, cl = canvas()
    s[60:62, 40:80] = ZERO_HEAD_WHITE
    dd[60:62, 40:80] = ZERO_HEAD_WHITE_DEC
    cases.append(('zero_headroom_white_2x40', s, dd, cl, 0, True))
    # D zero-headroom warm marking, 6 px ON the cloth mesh: rims shift,
    # interior stays — body_on_cloth keeps it counting (2 comps of 40)
    s, dd, cl = canvas()
    s[80:86, 40:80] = GLINT
    dd[80:86, 40:80] = BODY_DEC
    dd[80, 40:80] = RIM_DEC
    dd[85, 40:80] = RIM_DEC
    cases.append(('zero_headroom_warm_6x40_on_cloth', s, dd, cl, 0, True))
    # E lit-glint rim: furniture rows 100-115 (mask other), cloth below;
    # only the straddling row 115 shifts -> bloom, excluded, no fire
    s, dd, cl = canvas()
    s[100:116, 40:80] = GLINT
    dd[100:116, 40:80] = BODY_DEC
    dd[115, 40:80] = RIM_DEC
    cl[100:116, 40:80] = False
    cases.append(('glint_rim_1row', s, dd, cl, 40, False))
    # E2 rim two rows thick (the +1 cell parity case) -> still bloom
    s, dd, cl = canvas()
    s[100:116, 40:80] = GLINT
    dd[100:116, 40:80] = BODY_DEC
    dd[114:116, 40:80] = RIM_DEC
    cl[100:116, 40:80] = False
    cases.append(('glint_rim_2rows', s, dd, cl, 80, False))
    # F rim 5 rows thick: beyond the bleed reach -> counts (size floor)
    s, dd, cl = canvas()
    s[100:116, 40:80] = GLINT
    dd[100:116, 40:80] = BODY_DEC
    dd[111:116, 40:80] = RIM_DEC
    cl[100:116, 40:80] = False
    cases.append(('glint_rim_5rows_too_thick', s, dd, cl, 0, True))
    # G blown-white quantisation (v89 class) on WOOD, away from cloth:
    # R3-SNK-11 C1 — the source is already blown in R (255), so the
    # screen's max-channel scope leaves it to the blown_frame lane: raw 0,
    # no fire (R3-SNK-9 had it counting; the class flip is the ruled rule)
    s, dd, cl = canvas()
    s[100:140, 20:120] = WOOD
    dd[100:140, 20:120] = WOOD
    cl[100:140, 20:120] = False
    s[110:116, 40:60] = WHITE_SPEC
    dd[110:116, 40:60] = WHITE_SPEC_DEC
    cases.append(('blown_white_quantisation_v89_off_cloth', s, dd, cl, 0, False))
    # G2 (R3-SNK-11 C1 red arm) a genuinely DRAWN WHITE line ON cloth: the
    # source is blown in every channel, yet the cloth clause keeps it —
    # it must FIRE (80 px comp > comp_max)
    s, dd, cl = canvas()
    s[20:22, 40:80] = (255, 255, 255)
    dd[20:22, 40:80] = (255, 255, 255)
    cases.append(('drawn_white_line_2x40_on_cloth', s, dd, cl, 0, True))
    # G3 the same drawn white line on WOOD, > 6 px from any cloth: scoped
    # out by the max-channel rule (the blown_frame lane's), no fire
    s, dd, cl = canvas()
    s[100:140, 20:120] = WOOD
    dd[100:140, 20:120] = WOOD
    cl[100:140, 20:120] = False
    s[118:120, 40:80] = (255, 255, 255)
    dd[118:120, 40:80] = (255, 255, 255)
    cases.append(('drawn_white_line_2x40_on_wood_scoped_out', s, dd, cl, 0, False))
    # H lit cord 1 px off-cloth, wholly shifted: no un-shifted body ->
    # counts (the #625 firefly family stays the knit level's to cure)
    s, dd, cl = canvas()
    s[120, 40:80] = GLINT
    dd[120, 40:80] = RIM_DEC
    cl[120, 40:80] = False
    cases.append(('lit_cord_1px_no_body', s, dd, cl, 0, True))
    bad = 0
    for name, s, dd, cl, want_excl, want_fire in cases:
        raw_px, excl_px, net_max, fires, reasons = census(s, dd, cl)
        ok = (excl_px == want_excl and fires == want_fire)
        bad += 0 if ok else 1
        print(f"[bloom-arm:painted] {name}: raw {raw_px} px, excluded "
              f"{excl_px} (want {want_excl}), net maxcomp {net_max}, "
              f"enc_dline fires {fires} (want {want_fire}) "
              f"reasons {sorted(set(reasons))} -> {'OK' if ok else 'FAIL'}")
    # ---- layer 2: real encoder round trip
    if shutil.which('ffmpeg') is None:
        print('[bloom-arm:ffmpeg] ffmpeg missing — arm cannot round-trip')
        sys.exit(4)
    WW, HH = 640, 400
    s = np.zeros((HH, WW, 3), np.uint8)
    s[...] = CLOTH
    cl = np.ones((HH, WW), bool)
    # glint strip rows 199-206: last row EVEN, cloth at 207 — the
    # straddling cell of f064 (y490/y491); furniture mask
    s[199:207, 100:400] = GLINT
    cl[199:207, 100:400] = False
    # cured-headroom white marking (V 220) on cloth, straddling
    s[301:303, 50:450] = MARK
    # zero-headroom warm 2 px line ON cloth, straddling
    s[361:363, 100:300] = GLINT
    # zero-headroom warm 6 px marking ON cloth, straddling both rims
    s[371:377, 100:300] = GLINT
    # v89 class: blown white on wood (furniture) — R3-SNK-11 C1: scoped out
    s[100:180, 500:600] = WOOD
    cl[100:180, 500:600] = False
    s[131:137, 540:560] = WHITE_SPEC
    # R3-SNK-11 C1 arm: a drawn WHITE 2 px line ON cloth (must survive the
    # codec with G >= 254 and COUNT through the cloth clause) and the same
    # line on the wood block (scoped out)
    s[386:388, 100:300] = (255, 255, 255)
    s[161:163, 520:580] = (255, 255, 255)
    tmp = tempfile.mkdtemp(prefix='ob-bloom-arm-')
    try:
        Image.fromarray(s).save(os.path.join(tmp, 'src.png'))
        for k in range(12):
            os.link(os.path.join(tmp, 'src.png'),
                    os.path.join(tmp, f't{k:04d}.png'))
        # encode pass arguments VERBATIM (orbitsweep-489.mjs encodePass)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate',
                        '30', '-i', os.path.join(tmp, 't%04d.png'),
                        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,'
                               'format=yuv420p',
                        '-c:v', 'libx264', '-preset', 'medium', '-crf', '14',
                        '-movflags', '+faststart',
                        os.path.join(tmp, 'enc.mp4')], check=True)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i',
                        os.path.join(tmp, 'enc.mp4'), '-start_number', '0',
                        os.path.join(tmp, 'd%04d.png')], check=True)
        dd = np.asarray(Image.open(os.path.join(tmp, 'd0005.png'))
                        .convert('RGB'), dtype=np.int16)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    s16 = s.astype(np.int16)
    near = ndimage.binary_dilation(cl, structure=np.ones((3, 3), bool),
                                   iterations=6)
    # R3-SNK-11 C1: the screen scope (source MAX channel, cloth proximity)
    g = (dd[..., 1] >= 254) & ((s16.max(axis=2) < 254) | near)
    lab, n2 = ndimage.label(g, structure=np.ones((3, 3), bool))
    regions = {  # (y0, y1, x0, x1, must_clip, want_bloom, want_scoped_out)
        'glint_rim': (196, 210, 95, 405, True, True, False),
        'warm_2px_on_cloth': (358, 366, 95, 305, True, False, False),
        'warm_6px_on_cloth': (368, 380, 95, 305, True, False, False),
        'v89_white_on_wood': (128, 140, 535, 565, False, False, True),
        'white_marking_v220': (298, 306, 45, 455, False, False, False),
        'white_line_on_cloth': (383, 391, 95, 305, True, False, False),
        'white_line_on_wood': (158, 166, 515, 585, False, False, True),
    }
    for name, (y0, y1, x0, x1, must_clip, want_bloom, want_scoped) in regions.items():
        labels = sorted(set(lab[y0:y1, x0:x1].ravel().tolist()) - {0})
        if want_scoped and labels:
            bad += 1
            print(f"[bloom-arm:ffmpeg] {name}: {len(labels)} comps survive the max-channel scope -> FAIL")
            continue
        verdicts = []
        px = 0
        for k2 in labels:
            yy, xx = np.nonzero(lab == k2)
            members = list(zip(xx.tolist(), yy.tolist()))
            px += len(members)
            verdicts.append(enc_bloom_component(members, s16, dd, cl, bw))
        blooms = [v2 for v2 in verdicts if v2[0]]
        ok = True
        if must_clip and not labels:
            ok = False  # mechanism not reproduced by this encoder
        if want_bloom and len(blooms) != len(verdicts):
            ok = False
        if not want_bloom and blooms:
            ok = False
        bad += 0 if ok else 1
        print(f"[bloom-arm:ffmpeg] {name}: {px} decoded G>=254 px in "
              f"{len(labels)} comps, bloom {len(blooms)}/{len(verdicts)} "
              f"reasons {sorted(set(v2[1] for v2 in verdicts))} "
              f"-> {'OK' if ok else 'FAIL'}")
    if bad:
        print(f'[bloom-arm] FAIL — {bad} row(s)')
        sys.exit(4)
    print('[bloom-arm] OK — marking family keeps counting (incl. a drawn '
          'WHITE line on cloth), the lit-glint rim is excluded, the '
          'source-blown white on furniture is scoped out (R3-SNK-11 C1; '
          'painted + libx264 round trip)')
    sys.exit(0)


def disc_selftest(cfg):
    """RULING V8-C1 (R3-SNK-9) red arm for the GEOMETRIC fall-disc
    scoping (run by the driver's --red-arm with the LIVE enc_fallmask
    window and the live comp/total laws — no Python defaults). The
    driver built the sweep's corner camera at the sealed item's bearing
    (9c0437a3 corner f064 = i64, az 217.2°) with three.js in node and
    projected the model's own pocketFallDiscs() with projectFallPolys —
    the exact source text the capture runs in the page. Chrome-free.
      D1 the judge's pinhole (_pinhole_fall_polys) reproduces three's
         polygon vertex by vertex to the recorded quantum
         (10^-px_decimals px) — same camera model on both sides;
      D2 the rasterised mask (fall_mask) is non-empty, holds the sealed
         item's pixels and stays under frac_max of the viewport;
      D3 a drawn G=255 line on cloth OUTSIDE the disc still fires the
         enc_dline component law (the pass-2 line-body class: the
         R-S8-4 arm's drawn_green_line colour);
      D4 the same line INSIDE the disc is excluded (enc_fallmask_px =
         its pixels, net 0, no fire);
      D5 a line straddling the rim loses exactly its inside half and
         its outside half still fires.
    Any other outcome exits 4 (arm broken)."""
    import numpy as np
    from scipy import ndimage
    W, H = int(cfg['w']), int(cfg['h'])
    fm = cfg['enc_fallmask']
    comp_max = int(cfg['enc_dline_comp_max'])
    total_max = int(cfg['enc_dline_total_max'])
    tol = 10 ** (-int(fm['px_decimals']))  # the recorded quantum
    bad = 0

    def rowp(tag, ok, msg):
        nonlocal bad
        bad += 0 if ok else 1
        print(f"[disc-arm] {tag}: {msg} -> {'OK' if ok else 'FAIL'}")

    # D1 pinhole vs three (both round to the same quantum; two
    # roundings of near-equal floats differ by at most one quantum)
    three = cfg['polys_three']
    mine = _pinhole_fall_polys(cfg['cam'], cfg['discs'], W, H, fm)
    same_n = len(mine) == len(three) \
        and all(len(a) == len(b) for a, b in zip(mine, three))
    dmax = 0.0
    if same_n:
        for a, b in zip(mine, three):
            for (x1, y1), (x2, y2) in zip(a, b):
                dmax = max(dmax, abs(x1 - x2), abs(y1 - y2))
    rowp('pinhole_vs_three', same_n and dmax <= tol + 1e-9,
         f"{len(three)} polygon(s) x {[len(p) for p in three]} vertices "
         f"at {cfg['orbit']} i{cfg['i']} az {cfg['az_deg']}: judge pinhole "
         f"{len(mine)} polygon(s), max |d| {dmax:.4f} px (quantum {tol})")
    if not three:
        print('[disc-arm] FAIL — no disc projects into the frame at the '
              'sealed bearing; the arm cannot exercise the mask')
        sys.exit(4)
    # D2 mask bounded + the sealed item inside
    mask, fill_px, area_px = fall_mask(three, W, H, fm['rim_px'])
    frac = area_px / (W * H)
    items = cfg.get('seal_item_px', [])
    inside = all(0 <= y < H and 0 <= x < W and mask[y, x] for x, y in items)
    rowp('mask_bounded', 0 < frac <= fm['frac_max'],
         f"fill {fill_px} px, +{fm['rim_px']} px rim {area_px} px = "
         f"{frac * 100:.2f} % of the frame (ceiling {fm['frac_max'] * 100:.0f} %)")
    rowp('seal_item_inside', inside,
         f"sealed item pixels {items} inside the mask")
    # census: the screen's own scope with source == decoded (a DRAWN
    # line: G=255 in both planes, on cloth everywhere) — geometric
    # scoping, then the component/total law on what remains
    CLOTH = (0, 90, 37)     # MEASURED seal cloth (the R-S8-4 arm)
    LINE = (60, 255, 80)    # the R-S8-4 arm's drawn_green_line case

    def census(paint):
        dec = np.zeros((H, W, 3), np.uint8)
        dec[...] = CLOTH
        for (y0, y1, x0, x1) in paint:
            dec[y0:y1, x0:x1] = LINE
        g = dec[..., 1] >= 254
        raw = int(g.sum())
        fp = int((g & mask).sum())
        g = g & ~mask
        mc = 0
        if g.any():
            lab, _n = ndimage.label(g, structure=np.ones((3, 3), bool))
            mc = int(np.bincount(lab.ravel())[1:].max())
        tot = raw - fp
        return raw, fp, mc, tot, (mc > comp_max or tot > total_max)

    # D3 outside: the first 2x40 cloth block (top-down scan) clear of
    # the mask by its own dilation width
    clear = ndimage.binary_dilation(mask, structure=np.ones((3, 3), bool),
                                    iterations=int(fm['rim_px']) + 1)
    spot = None
    for oy in range(0, H - 2, 10):
        for ox in range(0, W - 40, 40):
            if not clear[oy:oy + 2, ox:ox + 40].any():
                spot = (oy, ox)
                break
        if spot:
            break
    if spot is None:
        print('[disc-arm] FAIL — no cloth block outside the mask')
        sys.exit(4)
    oy, ox = spot
    raw, fp, mc, tot, fires = census([(oy, oy + 2, ox, ox + 40)])
    rowp('line_outside_disc_fires', fires and fp == 0 and mc == 80,
         f"2x40 drawn line at ({ox},{oy}) outside the disc: raw {raw}, "
         f"fall-masked {fp}, net maxcomp {mc}, fires {fires}")
    # D4 inside: the same line at the largest polygon's centroid
    poly = max(three, key=lambda p: max(x for x, _ in p) - min(x for x, _ in p))
    cx = int(sum(x for x, _ in poly) / len(poly))
    cy = int(sum(y for _, y in poly) / len(poly))
    raw, fp, mc, tot, fires = census([(cy, cy + 2, cx - 20, cx + 20)])
    rowp('line_inside_disc_excluded',
         (not fires) and fp == 80 and tot == 0 and mc == 0,
         f"2x40 drawn line at the disc centroid ({cx},{cy}): raw {raw}, "
         f"fall-masked {fp}, net {tot}, fires {fires}")
    # D5 straddle: 1x60 across the rim on the centroid row (the disc's
    # projection is convex on a row: the inside run is contiguous)
    xl = int(np.nonzero(mask[cy])[0].min())
    raw, fp, mc, tot, fires = census([(cy, cy + 1, xl - 30, xl + 30)])
    rowp('line_straddling_rim', fires and fp == 30 and tot == 30 and mc == 30,
         f"1x60 drawn line across the rim at x {xl - 30}..{xl + 29}, y {cy}: "
         f"fall-masked {fp} (inside half), net {tot} in one component "
         f"{mc}, fires {fires}")
    if bad:
        print(f'[disc-arm] FAIL — {bad} row(s)')
        sys.exit(4)
    print('[disc-arm] OK — judge pinhole = three projection; the fall-disc '
          'mask is bounded and holds the sealed item; a drawn line on '
          'cloth fires outside the disc and is excluded inside it')
    sys.exit(0)


if __name__ == '__main__':
    # FIX10 (review round 10 on #731; Fable pass 2): ONE parse of the whole argv to completion BEFORE any effect — argparse: help exits 0,
    # a missing / extra / unknown argument exits 2 — then the form dispatches (main's first effect removes the orbit's prior report).
    import argparse as _argparse
    _ap = _argparse.ArgumentParser(prog='orbitsweep-judge.py', description='judge one orbit directory, or an encoded-bars config with --encoded / --encoded-selftest')
    _ap.allow_abbrev = False
    _ap.add_argument('target', nargs='?', default=None, help='<orbit-dir>, or <config.json> with --encoded / --encoded-selftest (omitted only with --selftest-bloom / --selftest-disc)')
    _g = _ap.add_mutually_exclusive_group()
    _g.add_argument('--encoded', action='store_true', help='judge the shipped-encode bars of the config (489 / 490 drivers)')
    _g.add_argument('--encoded-selftest', action='store_true', help='the encoded judge\'s own selftest on the config')
    # snooker lane (R3-SNK rows): the bloom / disc selftests take an inline JSON config and no target — parsed by the same ONE parse (FIX10), dispatched before any effect
    _g.add_argument('--selftest-bloom', metavar='JSON', default=None, help='bloom judge selftest on an inline JSON config')
    _g.add_argument('--selftest-disc', metavar='JSON', default=None, help='disc judge selftest on an inline JSON config')
    _a = _ap.parse_args()
    if _a.selftest_bloom is not None: bloom_selftest(json.loads(_a.selftest_bloom)); sys.exit(0)
    if _a.selftest_disc is not None: disc_selftest(json.loads(_a.selftest_disc)); sys.exit(0)
    if _a.target is None: _ap.error('the following arguments are required: target')
    if not str(_a.target).strip(): print('[orbitsweep-judge.py] REFUSED — a blank target names no orbit directory / config; nothing was removed', file=sys.stderr); sys.exit(2)
    if _a.encoded:   # FIX10 (Fable pass 3 / 4): the config is an existing JSON FILE — refused by name, exit 2
        if not os.path.isfile(_a.target): print(f'[orbitsweep-judge.py] REFUSED — config {_a.target!r}: file not found', file=sys.stderr); sys.exit(2)
        try: json.load(open(_a.target))
        except Exception as _e: print(f'[orbitsweep-judge.py] REFUSED — config {_a.target!r} is not JSON: {_e}', file=sys.stderr); sys.exit(2)
    if _a.encoded_selftest:   # the selftest takes a WORKDIR (orbitsweep-490 passes <out>/encoded-selftest); its cfg-template.json, when present, must be JSON
        if os.path.isfile(_a.target): print(f'[orbitsweep-judge.py] REFUSED — --encoded-selftest takes a work directory, got a file {_a.target!r}', file=sys.stderr); sys.exit(2)
        _tpl = os.path.join(_a.target, 'cfg-template.json')
        if os.path.isfile(_tpl):
            try: json.load(open(_tpl))
            except Exception as _e: print(f'[orbitsweep-judge.py] REFUSED — {_tpl!r} is not JSON: {_e}', file=sys.stderr); sys.exit(2)
    if _a.encoded:
        # UNION dispatch (489/490 drivers share the --encoded flag, each
        # passing its own config): the config's own MANDATORY window keys
        # name its judge — the 490 pocketing bars require sock_roi /
        # flash_windows; the 489 pass-4 bars carry card_segs /
        # redface_windows instead. A mismatched config fails loud on its
        # first mandatory key, never silently zero-passes.
        _pk = (json.load(open(_a.target)).get('windows') or {}) \
            .get('pocketing') or {}
        if 'sock_roi' in _pk:
            judge_encoded(_a.target)
        else:
            judge_encoded_489(_a.target)
    if _a.encoded_selftest:
        encoded_selftest(_a.target)
    main(_a.target)
