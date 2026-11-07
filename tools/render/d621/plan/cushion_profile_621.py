#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""D621-O22-PREP (measure-only) — the cushion PROFILE at 8 stations per rail: the purchased model's rubber (pool_rubber01..06) and
our K-55 loft (dm-cushion-0..5 from an 'ours' dump), the same reader on both, per station and pooled with rms.

Per station the section (depth behind the rail's nose line, z above the bed) yields:
  nose_z           the nose height (z of the least-depth point)                         [kernel physics datum: CU-03 — never moved by O22]
  nose_band        the near-vertical nose face: z extent where depth <= nose depth + 1.0
  top_slope_deg    the cloth TOP line, chord from the nose band's top to the crest: angle above horizontal (+ rms/max of the upper envelope about the chord)
  back_lean_deg    the rear face, least squares over z in [2, top-2]: angle from vertical (leans outward going up)   [CU-10]
  undercut_deg     the face under the nose, chord from the nose band's bottom to the bed contact's inner edge: angle from vertical (+ rms/max)
  base_inner/outer the bed contact (z = 0) inner and outer depths and its width
  cap_step         the rail-cap plateau z (railtop / kant section at the same station, depth 60..140) minus the rubber's top z  [RB-02 − CU-09]
  crest_d/flat_len the depth where the top first reaches its crest, and how far the crest runs level from there (our K-55 loft: sub-rail top plane CU-09 from the rubber top face's back edge to the cap front; the model: none)
  nose_round_r_est the nose radius implied by the section's z-extent 1 mm behind the apex (a circle of radius r shows 2*sqrt(2r-1))
  relief_run       the lower face's horizontal run over its last 1.6 mm above the bed (the CU-08 cloth relief)
  cap_front_d      the depth of the rail cap's front face
Numbers only leave this process; the purchased model is read in memory.

  python3 tools/render/d621/plan/cushion_profile_621.py --ours <ours-8ft.json> [--out DIR] [--model-obj-dir DIR]
"""
import sys
sys.dont_write_bytecode = True
import argparse, json, math, os
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, "..", "align"))
import common, objlib, paths   # noqa: E402

BED = 770.0
N_STATIONS = 8
TOP_LADDER_D = list(range(2, 51, 2))      # depths behind the nose line for the top-line ladder
UNDER_LADDER_Z = list(range(2, 35, 2))    # heights above the bed for the under-face ladder (below both noses)
BACK_LADDER_Z = list(range(2, 43, 2))     # heights above the bed for the back-face ladder
END_MARGIN = 90.0     # mm kept clear of the pocket ends / flares at both ends of each straight run
# rails: name -> (mesh(es) of the cushion, cap mesh, along axis index, across axis index, nose |coord|, sign of across)
MODEL_RAILS = {
    "long +y a": ("pool_rubber06", "pool_kant05", 0, 1, 576.0, +1), "long +y b": ("pool_rubber05", "pool_kant04", 0, 1, 576.0, +1),
    "long -y a": ("pool_rubber02", "pool_kant09", 0, 1, 576.0, -1), "long -y b": ("pool_rubber03", "pool_kant10", 0, 1, 576.0, -1),
    "short +x": ("pool_rubber01", "pool_kant07", 1, 0, 1152.0, +1), "short -x": ("pool_rubber04", "pool_kant02", 1, 0, 1152.0, -1)}
NOSE_LINES = {"9ft": (635.0, 1270.0), "8ft": (571.5, 1143.0), "7ft": (508.0, 1016.0)}   # kernel playfield half-widths / half-lengths [mm]


def ours_rails(size):
    hw, hl = NOSE_LINES[size]
    return {
        "long +y a": ("dm-cushion-1", "dm-railtop-1", 0, 1, hw, +1), "long +y b": ("dm-cushion-0", "dm-railtop-0", 0, 1, hw, +1),
        "long -y a": ("dm-cushion-3", "dm-railtop-3", 0, 1, hw, -1), "long -y b": ("dm-cushion-2", "dm-railtop-2", 0, 1, hw, -1),
        "short +x": ("dm-cushion-5", "dm-railtop-5", 1, 0, hl, +1), "short -x": ("dm-cushion-4", "dm-railtop-4", 1, 0, hl, -1)}


OURS_RAILS = ours_rails("8ft")


def crossings(segs, k, s):
    if len(segs) == 0: return np.zeros((0, 3))
    a = segs[:, 0, k] - s; b = segs[:, 1, k] - s
    m = (a * b <= 0) & (a != b)
    t = (a[m] / (a[m] - b[m]))[:, None]
    return segs[m, 0, :] + (segs[m, 1, :] - segs[m, 0, :]) * t


def section_dz(mesh, k_along, k_across, s, nose, sign):
    """the rail's 2D section at along = s: (depth behind the nose line, z above the bed), plus the raw segments in that plane"""
    segs = objlib.section(mesh["V"], mesh["F"], k_along, s)      # segments lying in the plane along = s
    if len(segs) == 0: return None
    pts = []
    for a, b in segs:                                            # densify: the faces are single long segments on both meshes
        n = max(2, int(np.linalg.norm(b - a) / 0.25) + 1)
        t = np.linspace(0, 1, n)[:, None]; pts.append(a + (b - a) * t)
    P = np.vstack(pts)
    d = sign * P[:, k_across] - nose; z = P[:, 2] - BED
    return np.c_[d, z], segs


def fit_line_angle(d, z, from_vertical=True):
    """least squares d = a + b z (from_vertical: angle of the face from the vertical) or z = a + b d (from horizontal)"""
    if from_vertical:
        A = np.c_[np.ones_like(z), z]; (a, b), *_ = np.linalg.lstsq(A, d, rcond=None); r = d - (a + b * z)
        return math.degrees(math.atan(b)), float(np.sqrt(np.mean(r ** 2))), float(np.abs(r).max())
    A = np.c_[np.ones_like(d), d]; (a, b), *_ = np.linalg.lstsq(A, z, rcond=None); r = z - (a + b * d)
    return math.degrees(math.atan(b)), float(np.sqrt(np.mean(r ** 2))), float(np.abs(r).max())


def measure_station(dz, cap_dz):
    d, z = dz[:, 0], dz[:, 1]
    keep = (z >= -0.01) & (z <= 60) & (d > -12) & (d < 80)
    d, z = d[keep], z[keep]
    if len(d) < 40: return None
    i_nose = int(np.argmin(d)); nose_d, nose_z = float(d[i_nose]), float(z[i_nose])
    band = z[d <= nose_d + 1.0]; band_lo, band_hi = float(band.min()), float(band.max())
    # a circular nose of radius r shows a chord 2*sqrt(2r-1) at 1 mm behind the apex -> r estimate
    bh = band_hi - band_lo; nose_r = round(((bh / 2) ** 2 + 1.0) / 2.0, 2)
    z_max = float(z.max()); top_pts = d[z >= z_max - 0.05]
    crest_d, flat_end_d = float(top_pts.min()), float(top_pts.max())
    # TOP: chord from the nose band's top to the crest; straightness = rms of the upper envelope about it
    ud, uz = [], []
    for b0 in np.arange(nose_d + 1.0, crest_d, 0.5):
        m = (d >= b0) & (d < b0 + 0.5)
        if m.any(): ud.append(b0 + 0.25); uz.append(z[m].max())
    ud, uz = np.array(ud), np.array(uz)
    top_chord = math.degrees(math.atan2(z_max - band_hi, crest_d - (nose_d + 1.0)))
    if len(ud) >= 4:
        zz = band_hi + (uz * 0 + (z_max - band_hi)) * (ud - (nose_d + 1.0)) / max(crest_d - (nose_d + 1.0), 1e-6)
        top_rms = float(np.sqrt(np.mean((uz - zz) ** 2))); top_max = float(np.abs(uz - zz).max())
    else: top_rms = top_max = None
    # BASE: the bed contact
    base_m = z <= 0.05 + 1e-9
    if not base_m.any(): base_m = z <= 0.3
    base_in, base_out = float(d[base_m].min()), float(d[base_m].max())
    # UNDERCUT: chord from the nose band's bottom to the bed contact's inner edge; angle from the vertical; rms of the lower envelope about it
    lo = (z <= band_lo + 0.3) & (d >= nose_d + 1.0) & (d <= base_in + 0.3) & (z > 0.05)
    ld, lz = d[lo], z[lo]
    under = math.degrees(math.atan2(base_in - (nose_d + 1.0), band_lo - 0.0))
    if len(ld) >= 4:
        dd = (nose_d + 1.0) + (base_in - (nose_d + 1.0)) * (band_lo - lz) / max(band_lo, 1e-6)
        under_rms = float(np.sqrt(np.mean((ld - dd) ** 2))); under_max = float(np.abs(ld - dd).max())
    else: under_rms = under_max = None
    # the cloth relief at the bed: horizontal run of the lower face over its last 1.6 mm (CU-08 height)
    m16 = (z >= 1.5) & (z <= 1.7) & (d <= base_in + 0.5)
    relief_run = round(base_in - float(d[m16].min()), 2) if m16.any() else None
    # BACK: least squares over the rear envelope (max depth per 0.5 mm of z) for z in [2, top-2]
    bd, bz = [], []
    for z0 in np.arange(2.0, z_max - 2.0, 0.5):
        m = (z >= z0) & (z < z0 + 0.5)
        if m.any(): bd.append(d[m].max()); bz.append(z0 + 0.25)
    bd, bz = np.array(bd), np.array(bz)
    if len(bd) >= 6:
        back_deg, back_rms, back_max = fit_line_angle(bd, bz, from_vertical=True); back_bed = float(np.polyfit(bz, bd, 1)[1])
    else: back_deg = back_rms = back_max = back_bed = None
    cap_z = cap_front = None
    if cap_dz is not None:
        cd, cz = cap_dz[:, 0], cap_dz[:, 1]
        m = (cd >= 60) & (cd <= 140)
        if m.any(): cap_z = float(cz[m].max())
        mf = cz >= z_max - 6.0
        if mf.any(): cap_front = float(cd[mf].min())
    top_ladder = {}
    for dq in TOP_LADDER_D:
        m = (d >= dq - 0.25) & (d <= dq + 0.25)
        top_ladder[str(dq)] = round(float(z[m].max()), 2) if m.any() else None
    under_ladder = {}
    for zq in UNDER_LADDER_Z:
        m = (z >= zq - 0.25) & (z <= zq + 0.25) & (d <= base_in + 1.0)
        under_ladder[str(zq)] = round(float(d[m].min()), 2) if m.any() else None
    back_ladder = {}
    for zq in BACK_LADDER_Z:
        m = (z >= zq - 0.25) & (z <= zq + 0.25)
        back_ladder[str(zq)] = round(float(d[m].max()), 2) if m.any() else None
    r2 = lambda v: None if v is None else round(v, 2)
    return dict(top_ladder=top_ladder, under_ladder=under_ladder, back_ladder=back_ladder, nose_z=r2(nose_z), nose_d=r2(nose_d), nose_band_h=r2(bh), nose_round_r_est=nose_r,
                crest_z=r2(z_max), crest_d=r2(crest_d), flat_len=r2(flat_end_d - crest_d),
                top_slope_deg=r2(top_chord), top_rms=r2(top_rms), top_max=r2(top_max),
                back_lean_deg=r2(back_deg), back_rms=None if back_rms is None else round(back_rms, 3), back_max=r2(back_max), back_d_at_bed=r2(back_bed),
                undercut_deg=r2(under), undercut_rms=r2(under_rms), undercut_max=r2(under_max), relief_run=relief_run,
                base_inner_d=r2(base_in), base_outer_d=r2(base_out), base_width=r2(base_out - base_in),
                cap_z=r2(cap_z), cap_step=None if cap_z is None else r2(cap_z - z_max), cap_front_d=r2(cap_front))


def measure_rail(meshes, spec, tag):
    cushion, cap, k_along, k_across, nose, sign = spec
    m = meshes[cushion]; V = m["V"]
    lo, hi = float(V[:, k_along].min()) + END_MARGIN, float(V[:, k_along].max()) - END_MARGIN
    stations = np.linspace(lo, hi, N_STATIONS)
    rows = []
    for s in stations:
        sec = section_dz(m, k_along, k_across, s, nose, sign)
        capsec = section_dz(meshes[cap], k_along, k_across, s, nose, sign) if cap in meshes else None
        r = measure_station(sec[0], capsec[0] if capsec else None) if sec else None
        if r: r["station"] = round(float(s), 1); rows.append(r)
    return rows


def pool(rows, keys):
    out = {}
    for k in keys:
        v = [r[k] for r in rows if r.get(k) is not None]
        if v: out[k] = dict(mean=round(float(np.mean(v)), 2), rms=round(float(np.std(v)), 3), min=round(float(np.min(v)), 2), max=round(float(np.max(v)), 2), n=len(v))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ours", required=True); ap.add_argument("--out", default=None)
    ap.add_argument("--size", default="8ft", choices=sorted(NOSE_LINES), help="our dump's table size (the purchased model is the 8 ft; other sizes measure ours only)")
    ap.add_argument("--figs", action="store_true", help="write per-rail section overlays (model blue, ours red) under --out")
    ap.add_argument("--model-obj-dir", default=os.environ.get("D621_MODEL_OBJ_DIR") or paths.DEFAULT_MODEL_OBJ_DIR)
    a = ap.parse_args(argv)
    global OURS_RAILS
    OURS_RAILS = ours_rails(a.size)
    nodes = objlib.load_all(a.model_obj_dir); d, ours = common.load_ours(a.ours)
    KEYS = ["nose_z", "nose_band_h", "nose_round_r_est", "crest_z", "crest_d", "flat_len", "top_slope_deg", "top_rms", "top_max", "back_lean_deg", "back_rms", "back_max", "back_d_at_bed", "undercut_deg", "undercut_rms", "undercut_max", "relief_run", "base_inner_d", "base_outer_d", "base_width", "cap_z", "cap_step", "cap_front_d"]
    res = dict(tool="cushion_profile_621.py", size=a.size, model_is_8ft=True, stations_per_rail=N_STATIONS, end_margin_mm=END_MARGIN, ours=os.path.abspath(a.ours), model_obj_dir=a.model_obj_dir, model={}, ours_rails={})
    for name, spec in MODEL_RAILS.items(): res["model"][name] = dict(rows=measure_rail(nodes, spec, "model"))
    for name, spec in OURS_RAILS.items(): res["ours_rails"][name] = dict(rows=measure_rail(ours, spec, "ours"))
    for side in ("model", "ours_rails"):
        allrows = [r for rail in res[side].values() for r in rail["rows"]]
        for rail in res[side].values(): rail["pooled"] = pool(rail["rows"], KEYS)
        res[side + "_pooled"] = pool(allrows, KEYS)
    # section-overlay deviations ours vs model at the same rail/station (ladders): top |dz|, under |dd|, back |dd|
    dev = dict(top=[], under=[], back=[])
    for name in MODEL_RAILS:
        for rm, ro in zip(res["model"][name]["rows"], res["ours_rails"][name]["rows"]):
            for key, lad in (("top", "top_ladder"), ("under", "under_ladder"), ("back", "back_ladder")):
                for q, vm in rm[lad].items():
                    vo = ro[lad].get(q)
                    if vm is not None and vo is not None: dev[key].append(abs(vo - vm))
    res["overlay_dev_ours_vs_model"] = {k: dict(p50=round(float(np.percentile(v, 50)), 2), p90=round(float(np.percentile(v, 90)), 2), max=round(float(np.max(v)), 2), n=len(v)) for k, v in dev.items() if v}
    # the pooled ladders (mean over the 48 stations) for the table
    res["ladders"] = {}
    for side in ("model", "ours_rails"):
        L = {}
        for lad in ("top_ladder", "under_ladder", "back_ladder"):
            acc = {}
            for rail in res[side].values():
                for r in rail["rows"]:
                    for q, v in r[lad].items():
                        if v is not None: acc.setdefault(q, []).append(v)
            L[lad] = {q: dict(mean=round(float(np.mean(v)), 2), rms=round(float(np.std(v)), 3), n=len(v)) for q, v in acc.items()}
        res["ladders"][side] = L
    print("overlay ours vs model:", res["overlay_dev_ours_vs_model"])
    print("TOP ladder z(d): d | model | ours | ours-model"); 
    for q in map(str, TOP_LADDER_D):
        am = res["ladders"]["model"]["top_ladder"].get(q); bo = res["ladders"]["ours_rails"]["top_ladder"].get(q)
        if am and bo: print(f"  {q:>3s} | {am['mean']:6.2f} ±{am['rms']:.2f} | {bo['mean']:6.2f} ±{bo['rms']:.2f} | {bo['mean']-am['mean']:+.2f}")
    print("UNDER / BACK ladder d(z): z | under model | under ours | Δ | back model | back ours | Δ")
    for q in map(str, BACK_LADDER_Z):
        am = res["ladders"]["model"]["under_ladder"].get(q); bo = res["ladders"]["ours_rails"]["under_ladder"].get(q)
        cm = res["ladders"]["model"]["back_ladder"].get(q); eo = res["ladders"]["ours_rails"]["back_ladder"].get(q)
        u = f"{am['mean']:6.2f} | {bo['mean']:6.2f} | {bo['mean']-am['mean']:+.2f}" if am and bo else "   —   |   —   |   —  "
        if cm and eo: print(f"  {q:>3s} | {u} | {cm['mean']:6.2f} | {eo['mean']:6.2f} | {eo['mean']-cm['mean']:+.2f}")
    print(f"{'measure':16s} | {'MODEL mean ± rms [min..max] n':34s} | {'OURS mean ± rms [min..max] n':34s} | delta ours−model")
    for k in KEYS:
        mm = res["model_pooled"].get(k); oo = res["ours_rails_pooled"].get(k)
        f = lambda p: f"{p['mean']:7.2f} ± {p['rms']:.2f} [{p['min']:.2f}..{p['max']:.2f}] {p['n']}" if p else "—"
        dl = f"{oo['mean'] - mm['mean']:+.2f}" if mm and oo else "—"
        print(f"{k:16s} | {f(mm):34s} | {f(oo):34s} | {dl}")
    if a.out and a.figs:
        import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
        os.makedirs(a.out, exist_ok=True)
        fig, axs = plt.subplots(2, 3, figsize=(18, 9)); axs = axs.ravel()
        for ax, name in zip(axs, MODEL_RAILS):
            for meshes, spec, col, lab in ((nodes, MODEL_RAILS[name], "#1f5fbf", "purchased model rubber"), (ours, OURS_RAILS[name], "#c1272d", "ours (K-55 loft, D621 tree)")):
                cushion, cap, ka, kx, nose_l, sign = spec; V = meshes[cushion]["V"]
                sts = np.linspace(float(V[:, ka].min()) + END_MARGIN, float(V[:, ka].max()) - END_MARGIN, N_STATIONS)
                for j, st in enumerate(sts):
                    sec = section_dz(meshes[cushion], ka, kx, st, nose_l, sign)
                    if not sec: continue
                    for sg in sec[1]: ax.plot(sign * sg[:, kx] - nose_l, sg[:, 2] - BED, color=col, lw=1.6 if j == 3 else 0.5, alpha=1.0 if j == 3 else 0.35)
                    if cap in meshes:
                        for sg in objlib.section(meshes[cap]["V"], meshes[cap]["F"], ka, st): ax.plot(sign * sg[:, kx] - nose_l, sg[:, 2] - BED, color=col, lw=0.5, alpha=0.25)
            ax.axhline(36.5125, color="k", lw=0.6, ls="--"); ax.text(-12, 37.2, "CU-03 nose 36.51 (kernel)", fontsize=7)
            ax.axvline(0, color="k", lw=0.6, ls=":"); ax.axvline(50.8, color="k", lw=0.6, ls=":"); ax.text(51.5, 2, "CU-04 50.8", fontsize=7, rotation=90)
            ax.set_xlim(-14, 70); ax.set_ylim(-3, 50); ax.set_aspect("equal"); ax.grid(alpha=0.3)
            ax.set_title(f"{name}: 8 stations (station 4 bold)", fontsize=10); ax.set_xlabel("depth behind the nose line [mm]"); ax.set_ylabel("above the bed [mm]")
            from matplotlib.lines import Line2D
            ax.legend([Line2D([0], [0], color="#1f5fbf", lw=1.6), Line2D([0], [0], color="#c1272d", lw=1.6)], ["purchased model rubber (pool_rubber*)", "ours (K-55 loft, D621 tree)"], fontsize=7, loc="lower right")
        fig.suptitle("D621-O22-PREP — cushion profile sections, the purchased model's rubber vs our K-55 loft, 8 ft, 8 stations per rail (measure-only; no web bytes)", fontsize=11)
        fig.tight_layout(rect=(0, 0, 1, 0.96)); fig.savefig(os.path.join(a.out, "cushion_sections_6rails.png"), dpi=130); plt.close(fig)
        print("wrote", os.path.join(a.out, "cushion_sections_6rails.png"))
    if a.out:
        os.makedirs(a.out, exist_ok=True)
        json.dump(res, open(os.path.join(a.out, "cushion_profile.json"), "w"), indent=1)
        print("wrote", os.path.join(a.out, "cushion_profile.json"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
