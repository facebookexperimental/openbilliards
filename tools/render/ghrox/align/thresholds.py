# Copyright (c) Meta Platforms, Inc. and affiliates.

"""thresholds — GATE THRESHOLDS stated and JUSTIFIED from the OX soup's own noise BEFORE the first render (ruling A2-4).

Noise sources measured or quoted (all mm):
  (a) facet chord sagitta on the soup's rounds — measured here as the kink deviation of every interior vertex of the
      model's own section polylines from the chord of its neighbours (nose-tip round: 7 vertices over ~32 deg at R 8.45
      -> analytic sagitta 0.009; cap crown R ~425; pedestal bow R 773/803; cup rim arcs R 39-43);
  (b) the A1/r6 fit rms values quoted from the canonical JSON rows (0.01-0.7 mm class; EN-03's projected bow 1.2);
  (c) +-X / +-Y mirror residuals of the soup measured here (the -Y short-rail bodies are 0.75 mm end-asymmetric:
      doc.model_asymmetry_note) — whole table and inside the pocket windows;
  (d) the body-underside camber (EN-05: 4.9-6.4 mm) -> the underside/bottom flange is NOT a tight reference.
Start point = A2-PLAN 4a.6 (median <= 1.0, p90 <= 3.0 where the model is the reference; silhouette boundary median
<= 1.5; dimension deltas within their row tolerance); adjusted per element by the measured noise below.  Rule of
adjustment: median threshold >= 2 x the element's own noise floor (facet + asymmetry, root-sum-square), never below
the plan's 1.0; p90 = 3 x the median threshold; section Hausdorff (a max) = 5.0 (about 1.7 x p90) unless the element's
facet max says otherwise.  The measured numbers are cached under /tmp/ox-a2/align/cache/noise.json and re-printed in
every report; delete the cache to re-measure."""
import json, os, sys, time
import numpy as np
import objsoup

NOISE_CACHE = objsoup.CACHE + "noise.json"
JSON_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "docs", "geometry", "rasson-ox-9ft-table-definition.json")

# quoted fit rms values (row -> (rms, max, what)); the JSON is re-read at run time and printed alongside
QUOTED = [
  ("RB-04", 0.10, 0.32, "single-circle crown fit at the rails station (R 425.7 long / 417.4 short), 'poor - crown is asymmetric'"),
  ("SP-14", 0.019, 0.258, "side notch circle fits, window |x|<25 (0.019) .. |x|<50 (0.258, max 0.777)"),
  ("CP-13", 0.07, 0.07, "cross-pass agreement first pass vs replicate on every corner datum"),
  ("RB-05", 0.18, 0.59, "apron bottom-plate parabola fit, long (rms 0.18, max 0.59) / short (0.15, 0.32)"),
  ("EN-03", 0.716, 1.216, "end-leg bow circle fit developed along the bow mid-surface rms 0.716; projected y-z circle rms 1.216 ('no circle fits to <1 mm'); ellipse 0.513"),
  ("EN-04", 0.226, 0.226, "foot pad corner-B blend LS circle rms at z=12 (5-facet blend, R not stable)"),
  ("PK-03", 0.21, 0.63, "corner cup compound arcs sd front 0.21 / back 0.63"),
  ("CP-03", 0.009, 0.009, "nose-tip round: 7 vertices over ~32 deg at R 8.45 -> analytic chord sagitta R(1-cos(32/6/2 deg)) = 0.009"),
]
ASYMMETRY_NOTE = 0.75   # doc.model_asymmetry_note: -Y short-rail bodies 0.75 mm end-asymmetric
CAMBER = (4.9, 6.4)     # EN-05 underside camber

def kink_deviation(chains):
    """Distance of each interior polyline vertex from the chord of its two neighbours (facet noise of the section)."""
    d = []
    for c in chains:
        if len(c) < 3: continue
        a, b, p = c[:-2], c[2:], c[1:-1]; ab = b - a; L = np.linalg.norm(ab, axis=1); L[L == 0] = 1e-9
        cross = np.abs(ab[:, 0] * (p - a)[:, 1] - ab[:, 1] * (p - a)[:, 0]) / L; d.append(cross)
    if not d: return dict(n=0, median=None, p90=None, max=None)
    d = np.concatenate(d); return dict(n=int(len(d)), median=round(float(np.median(d)), 3), p90=round(float(np.percentile(d, 90)), 3), max=round(float(d.max()), 3))

def measure(log=print):
    """Measure the soup's own noise: facet kinks per station and mirror residuals.  ~1-2 min; cached."""
    import sections, deviation, register
    t0 = time.time(); md = objsoup.model_datums(); Tm = register.model_tris("raw"); out = dict(measured_at=time.strftime("%Y-%m-%d %H:%M"), facet_kink={}, mirror={})
    for st in objsoup.STATIONS:
        sid, el = st[0], st[1]; w = objsoup.WINDOWS[el]; h0, h1, v0, v1 = st[6]; ha, va = st[4], st[5]
        box = [-1e9, 1e9, -1e9, 1e9, -1e9, 1e9]
        if st[2] == "diag": box = [-260, 260, -260, 260, v0 - 2, v1 + 2]
        else:
            box[2 * ha], box[2 * ha + 1] = h0 - 2, h1 + 2; box[2 * va], box[2 * va + 1] = v0 - 2, v1 + 2; box[2 * st[2]], box[2 * st[2] + 1] = st[3] - 3, st[3] + 3
        Lm = objsoup.tris_local(Tm, w["anchor"], md, tuple(box)); Sm = sections.cut(Lm, st); cm = sections.chain(Sm)
        out["facet_kink"][sid] = kink_deviation(cm); log(f"[noise] kink {sid:26s} {out['facet_kink'][sid]}")
    # mirror residuals: samples of the soup mirrored in x / in y -> distance to the soup surface
    T = objsoup.tris(); sd = deviation.SurfaceDist(T, spacing=6.0, max_n=800_000)
    P, _ = deviation.sample_surface(T, spacing=6.0, max_n=200_000)
    for axis, name in ((0, "mirror_x"), (1, "mirror_y")):
        Q = P.copy(); Q[:, axis] *= -1; d = sd.dist(Q)
        r = deviation.stats(d); r["frac_over_0p5"] = round(float((d > 0.5).mean()), 4); r["frac_over_1"] = round(float((d > 1).mean()), 4)
        # inside the pocket windows (corner: |x|>1000 & |y|>425 ; side: |x|<175 & |y|>450), above the bed
        ab = P[:, 2] > objsoup.BEDTOP - 0.5
        cw = ab & (np.abs(P[:, 0]) > 1000) & (np.abs(P[:, 1]) > 425); sw = ab & (np.abs(P[:, 0]) < 175) & (np.abs(P[:, 1]) > 450)
        r["corner_windows_above_bed"] = deviation.stats(d[cw]); r["side_windows_above_bed"] = deviation.stats(d[sw]); r["above_bed"] = deviation.stats(d[ab])
        r["pedestal_z_lt_640"] = deviation.stats(d[P[:, 2] < 640])
        out["mirror"][name] = r; log(f"[noise] {name}: {r}")
    out["seconds"] = round(time.time() - t0, 1)
    os.makedirs(objsoup.CACHE, exist_ok=True); json.dump(out, open(NOISE_CACHE, "w"), indent=1); return out

def noise(log=print):
    if os.path.exists(NOISE_CACHE): return json.load(open(NOISE_CACHE))
    return measure(log)

def quoted_rows():
    """Re-read the quoted rows from the canonical JSON (values only; presence check)."""
    try:
        d = json.load(open(JSON_PATH)); ids = {f["id"] for f in d["features"]}
    except Exception:
        ids = set()
    return [dict(row=r, present=r in ids, rms=a, max=b, what=w) for r, a, b, w in QUOTED]

def rss(*v): return float(np.sqrt(sum(x * x for x in v)))

def table(nz):
    """Per-element thresholds with justification.  Returns {element: dict(median, p90, hausdorff, boundary, why)}."""
    k = nz["facet_kink"]; mx = nz["mirror"].get("mirror_x", {}); my = nz["mirror"].get("mirror_y", {})
    def kk(sid, key="p90", default=0.05):
        v = k.get(sid, {}).get(key); return default if v is None else v
    corner_asym = max(ASYMMETRY_NOTE, (my.get("corner_windows_above_bed") or {}).get("median") or 0)
    base = dict(median=1.0, p90=3.0, hausdorff=5.0, boundary=1.5)
    def el(median, p90=None, hausdorff=None, boundary=None, why=""):
        median = max(1.0, round(median, 2)); p90 = p90 if p90 is not None else round(3 * median, 1); hausdorff = hausdorff if hausdorff is not None else round(max(5.0, 1.7 * p90), 1)
        return dict(median=median, p90=p90, hausdorff=hausdorff, boundary=boundary if boundary is not None else base["boundary"], why=why)
    T = {}
    n_cap = rss(kk("S1_railcap_long_x600"), 0.10); T["rail_cap_long"] = el(2 * n_cap, why=f"cap section facet kink p90 {kk('S1_railcap_long_x600')} (max {kk('S1_railcap_long_x600','max')}), crown fit rms 0.10 (RB-04); long-rail tips identical at all four corners -> noise floor {n_cap:.2f}; median = max(1.0, 2x floor)")
    T["rail_cap_short"] = el(2 * rss(kk("S2_railcap_short_y300"), 0.10), why=f"as rail_cap_long with the short-rail cut (kink p90 {kk('S2_railcap_short_y300')}); the 0.75 asymmetry lives at the -Y corners, not on the +X rail at y=300")
    T["cushion_long"] = el(2 * rss(kk("S1b_cushion_long_x600"), 0.009), why=f"cushion body facet kink p90 {kk('S1b_cushion_long_x600')}; nose-tip sagitta 0.009; the ours nose is kernel-driven (CU-02/CU-04 exact), so 1.0 / 3.0 is the plan value")
    T["cushion_short"] = el(2 * rss(kk("S1b_cushion_long_x600"), 0.009), why="as cushion_long (same body; the short cushions' nose-tip round is 9.24 at -Y vs 8.45 at +Y = the disclosed asymmetry, we gate +X)")
    T["apron_long"] = el(2 * rss(0.18, kk("S1_railcap_long_x600")), why=f"apron face: RB-05 parabola fits rms 0.15-0.18 (max 0.59), face vertical to 0.1; kink p90 {kk('S1_railcap_long_x600')} (same cut)")
    T["apron_bottom"] = el(2.0, p90=CAMBER[1], hausdorff=8.0, why=f"EN-05 underside camber {CAMBER[0]}-{CAMBER[1]} mm (an as-modelled warp): the bottom flange/underside is NOT a tight reference; p90 = the camber's upper bound {CAMBER[1]}")
    T["corner_above"] = el(2 * rss(kk("S3_corner_plan_bed20"), corner_asym / 2, 0.07), why=f"corner plan kink p90 {kk('S3_corner_plan_bed20')}; model +-Y asymmetry {ASYMMETRY_NOTE} (doc note) / measured mirror-y median in the corner windows {(my.get('corner_windows_above_bed') or {}).get('median')}; CP-13 cross-pass 0.07; ours is built from the eight-tip MEAN (CP-03) so half the asymmetry is the floor; measured mirror p90 in the corner windows {(my.get('corner_windows_above_bed') or {}).get('p90')} -> the p90 gate 3.0 is >= 2.5x the soup's own left/right scatter")
    T["corner_below"] = el(2 * rss(kk("S4_corner_diag_K"), 0.63, corner_asym / 2), why=f"cup compound arcs sd 0.21-0.63 (PK-03), diagonal-section kink p90 {kk('S4_corner_diag_K')}, half the corner asymmetry")
    T["side_above"] = el(2 * rss(kk("S5_side_plan_bed20"), 0.258), why=f"side plan kink p90 {kk('S5_side_plan_bed20')}; SP-14 notch fits rms 0.019-0.258 (max 0.777); mirror-y median / p90 in the side windows {(my.get('side_windows_above_bed') or {}).get('median')} / {(my.get('side_windows_above_bed') or {}).get('p90')}")
    T["side_below"] = el(2 * rss(kk("S6_side_x0"), 0.258, 0.63), why=f"x=0 section kink p90 {kk('S6_side_x0')}; SP-14 fits; middle cup arcs (PK-03 class 0.63)")
    T["pedestal_end_mesh_info"] = el(2 * rss(kk("S7_pedestal_bow_y500"), 0.716), p90=None, why=f"EN-03: no circle fits the bow to <1 mm (developed rms 0.716, projected 1.216, ellipse 0.513) — 'the polyline is the truth'; bow kink p90 {kk('S7_pedestal_bow_y500')}, arch kink p90 {kk('S8_pedestal_arch_x1025')}; mirror-x median below z 640 {(mx.get('pedestal_z_lt_640') or {}).get('median')}")
    T["foot_pad_mesh_info"] = el(2 * rss(kk("S9_foot_plan_z12"), 0.226), why=f"EN-04 corner-B blend rms 0.226 at z=12 (5 facets, R not stable 16-23); kink p90 {kk('S9_foot_plan_z12')}")
    T["sight_form_mesh_info"] = el(1.0, p90=2.0, hausdorff=3.0, boundary=1.0, why=f"r9b C2: RENAMED from sight_form so the mesh row falls through to INFO (RC-17 photo-governed, like pedestal_end / foot_pad); the numbers below are kept for the information row. Flat slab, 18 identical instances (edge signatures within 0.051, RB-09); kink p90 {kk('S10_sight_slab')}; tighter than the plan because there is no curvature noise")
    T["above_bed_all"] = el(2.0, p90=6.0, hausdorff=10.0, boundary=2.0, why="information row under the EN-07 datum: mixes carried lengths (scaled) with local forms (raw) — a scaled cap crest moves 0 in z but a scaled cup moves 8 % in plan; gated loosely so a real form defect still shows")
    T["silhouette_global"] = dict(boundary=1.5, iou_min=0.97, why=f"plan 4a.6 boundary median 1.5; EN-07 factors are 4-dp (rounding <= 0.15 mm over 1333 mm); pixel quantisation 0.5 mm at 1 px/mm; whole-table mirror residual median x {mx.get('median')} / y {my.get('median')}; IoU floor 0.97 = the D621 top-view value 0.9855 minus the pedestal/plate form difference the OX will legitimately carry (C9/O10)")
    T["silhouette_zoom"] = dict(boundary=1.5, iou_min=0.95, why="raw local-frame zooms at 4 px/mm (pockets) / 2 px/mm (pedestal): boundary median 1.5 as the plan; IoU floor 0.95")
    T["dims"] = dict(kernel_mm=0.2, render_rule="0.5 x 10^-dp of the row's stated precision", photo_rule="a2.photo_tolerance_mm of the row", why="plan 4a.5 / task: kernel rows 0.2 mm; render-only rows their stated precision; photo rows their measured tolerance")
    return T

if __name__ == "__main__":
    if "--measure" in sys.argv and os.path.exists(NOISE_CACHE): os.remove(NOISE_CACHE)
    nz = noise(); T = table(nz)
    for k, v in T.items(): print(k, {a: b for a, b in v.items() if a != "why"})
