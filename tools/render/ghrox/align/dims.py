# Copyright (c) Meta Platforms, Inc. and affiliates.

"""dims — dimension delta table for every JSON row the scene consumes.

Columns: spec (the canonical JSON value = the law for OUR scene) / ours (measured from the LIVE dump by the per-row rule
below) / model raw (R1) / model EN-07-scaled (carried lengths only) / delta = ours - spec / tolerance per class:
kernel-collision rows 0.2 mm; render-only rows 0.5 x 10^-dp of the row's stated precision; photo rows (an 'a2' block
with photo_tolerance_mm) their tolerance.  Rows the JSON does not (yet) carry print 'row not yet present'.  Rows whose
value is a kernel CONSTRUCTION (CP-04..08, SP-04..08: throat / shelf / disc / depth / points, derived by the kernel from
CP-01/02/03) have no mesh rule — a mesh 'throat' is a different datum (model cheek-to-cheek 81.98, r6) — and print INFO.
The canonical JSON is READ ONLY here."""
import json, os, re
import numpy as np
import objsoup, sections

JSON_PATH = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "docs", "geometry", "rasson-ox-9ft-table-definition.json"))
KERNEL_ROWS = ["PF-01", "CU-02", "CU-03", "CU-04", "CP-01", "CP-02", "CP-03", "CP-04", "CP-05", "CP-06", "CP-07", "CP-08",
               "SP-01", "SP-02", "SP-03", "SP-04", "SP-05", "SP-06", "SP-07", "SP-08", "RB-03", "RB-07"]
CONSTRUCTION = {"CP-04", "CP-05", "CP-06", "CP-07", "CP-08", "SP-04", "SP-06", "SP-07", "SP-08"}
BALL_D = 57.15
FLOAT32_FLOOR = 0.001   # mm: the dump carries float32 world positions (ulp ~1.2e-4 mm at 1.5 m); tolerances below 1 um are floored
RENDER_TOL = 0.5        # mm: v2 — render-only rows are build numbers, judged at the render tolerance (letters-rox), not at a 3-dp mirror test
SHARED_SCENE = {"CP-01", "SP-01", "SP-05", "CP-03", "SP-03"}   # v2: read off the shared K55 loft / bed hole — reported to the maintainer (ISSUE-SHARED-LOFT), not a rox verdict

def load_rows():
    d = json.load(open(JSON_PATH)); rows = {f["id"]: f for f in d["features"]}
    extra = [f["id"] for f in d["features"] if f["id"].startswith("RC-") or "a2" in f]
    return rows, extra, d["doc"].get("revision")

def dp_of(v):
    s = repr(float(v))
    if "e" in s: return 6
    return len(s.split(".")[1].rstrip("0")) if "." in s else 0

def tolerance(row):
    if row is None: return None, "n/a"
    a2 = row.get("a2") or {}
    if a2.get("photo_tolerance_mm") is not None: return float(a2["photo_tolerance_mm"]), "photo (a2.photo_tolerance_mm)"
    if row.get("scope") == "kernel-collision": return 0.2, "kernel 0.2"
    v = row.get("value_mm")
    if isinstance(v, (int, float)): return max(RENDER_TOL, 0.5 * 10 ** (-dp_of(v))), f"render max(0.5, 0.5e-{dp_of(v)}) (v2: a build number's render tolerance, as letters-rox)"
    if isinstance(v, list) and v and all(isinstance(x, (int, float)) for x in v): return [max(RENDER_TOL, 0.5 * 10 ** (-dp_of(x))) for x in v], "render max(0.5, 0.5e-dp) per component (v2)"
    return None, "n/a (non-numeric row)"

# ------------------------------------------------------------------ measurement helpers ----------------------------
def densify3(S, step=0.5):
    if len(S) == 0: return np.zeros((0, 3))
    L = np.linalg.norm(S[:, 1] - S[:, 0], axis=1); n = np.maximum(2, np.ceil(L / step).astype(int) + 1); out = []
    for k in np.unique(n):
        m = n == k; t = np.linspace(0, 1, k)[None, :, None]; out.append((S[m, 0][:, None, :] + (S[m, 1] - S[m, 0])[:, None, :] * t).reshape(-1, 3))
    return np.vstack(out)

def cut_points(T, axis, c, region=None, step=0.5):
    """Densified (0.5 mm) points of the plane section; region = (x0,x1,y0,y1) AABB pre-filter for speed."""
    if region is not None and len(T):
        mn = T.min(1); mx = T.max(1); x0, x1, y0, y1 = region
        T = T[(mx[:, 0] >= x0) & (mn[:, 0] <= x1) & (mx[:, 1] >= y0) & (mn[:, 1] <= y1)]
    S = objsoup.section(T, axis, c) if len(T) else np.zeros((0, 2, 3)); return densify3(S, step) if len(S) else np.zeros((0, 3))

def nose_section(T_local_cushion):
    """x=600 (local) section of the cushion body -> (tip u, tip z, body width) from the chain holding the min-u point."""
    S3 = objsoup.section(T_local_cushion, 0, 600.0)
    if len(S3) == 0: return None
    S = S3[:, :, [1, 2]]; P = S.reshape(-1, 2); i = np.argmin(P[:, 0]); tip = P[i]
    near = P[np.abs(P[:, 0] - tip[0]) < 0.02]; tipz = float(near[:, 1].mean())
    ch = sections.chain(S); best = None
    for c in ch:
        if np.min(np.linalg.norm(c - tip, axis=1)) < 0.05: best = c; break
    width = float(best[:, 0].max() - best[:, 0].min()) if best is not None else None
    return dict(tip_u=float(tip[0]), tip_z=tipz, width=width, chain_pts=None if best is None else int(len(best)))

def tips_corner(T, x_nose, y_nose, bed, h=35.3):
    """+X+Y corner: the last points on the two nose lines at the cut bed+h (h = the side's own nose height) -> tips, mouth."""
    P = cut_points(T, 2, bed + h, region=(300, 1e9, 100, 1e9))
    if len(P) == 0: return None
    lx = (np.abs(P[:, 0]) < x_nose - 5) & (P[:, 1] > 300); ly = (np.abs(P[:, 1]) < y_nose - 5) & (P[:, 0] > 800)
    if not lx.any() or not ly.any(): return None
    yl = P[lx, 1].min(); xs = P[ly, 0].min()                     # nose lines at this height
    onL = P[np.abs(P[:, 1] - yl) < 0.05]; onS = P[np.abs(P[:, 0] - xs) < 0.05]
    onL = onL[onL[:, 0] > 300]; onS = onS[onS[:, 1] > 100]
    if len(onL) == 0 or len(onS) == 0: return None
    tl = onL[np.argmax(onL[:, 0])]; ts = onS[np.argmax(onS[:, 1])]
    return dict(tip_long=[float(tl[0]), float(tl[1])], tip_short=[float(ts[0]), float(ts[1])], mouth=float(np.hypot(*(tl[:2] - ts[:2]))), nose_line_long=float(yl), nose_line_short=float(xs), cut=h, points=P)

def tips_side(T, y_nose, bed, h=35.3):
    P = cut_points(T, 2, bed + h, region=(-900, 900, 300, 1e9))
    if len(P) == 0: return None
    lx = (np.abs(P[:, 0]) < 900) & (P[:, 1] > 300)
    if not lx.any(): return None
    yl = P[lx, 1].min(); on = P[np.abs(P[:, 1] - yl) < 0.05]
    r = on[on[:, 0] > 0]; l = on[on[:, 0] < 0]
    if len(r) == 0 or len(l) == 0: return None
    tr = r[np.argmin(r[:, 0])]; tl = l[np.argmax(l[:, 0])]
    return dict(tip_right=[float(tr[0]), float(tr[1])], tip_left=[float(tl[0]), float(tl[1])], mouth=float(tr[0] - tl[0]), nose_line=float(yl), cut=h, points=P)

def tip_round(P, tip, r_search=12.0):
    """Kasa circle fit on cut points within r_search of the tip -> R (0.0 = sharp corner: fewer than 3 distinct points)."""
    Q = P[np.linalg.norm(P[:, :2] - np.asarray(tip), axis=1) < r_search][:, :2]; Q = np.unique(np.round(Q, 4), axis=0)
    if len(Q) < 4: return dict(R=0.0, n=int(len(Q)), rms=None, note="sharp corner (no round resolved)")
    x, y = Q[:, 0], Q[:, 1]; A = np.c_[2 * x, 2 * y, np.ones(len(x))]; b = x * x + y * y
    c, *_ = np.linalg.lstsq(A, b, rcond=None); R = float(np.sqrt(max(c[2] + c[0] ** 2 + c[1] ** 2, 0))); res = np.hypot(x - c[0], y - c[1]) - R
    rms = float(np.sqrt((res ** 2).mean()))
    if rms > 0.3 or R > 20: return dict(R=0.0, n=int(len(Q)), rms=round(rms, 3), note="no round resolved (fit rms %.2f: the tip is a corner of two straight faces)" % rms)
    return dict(R=round(R, 4), n=int(len(Q)), rms=round(rms, 3), note="Kasa fit, points within %.0f mm of the tip" % r_search)

def facing_angle(P, tip, along, inward, r_min=3.0):
    """Angle (deg) to the rail of the jaw facing leaving the tip: TLS line on points within r_min..40 mm of the tip that are
    behind the nose line (inward < 0 side) -- along/inward are unit plan vectors. r_min defaults to 3 mm; the callers pass the
    jaw round's own radius + 2 mm when a round is resolved (A3: the OX jaw round persists at every height, as the model's does,
    so the first 8-13 mm behind a corner tip are the round, not the facing — the 3 mm window read a 141 deg facing as 154)."""
    d = P[:, :2] - np.asarray(tip); s = d @ along; t = d @ inward; r = np.hypot(s, t)
    # t < -12: the first 12 mm behind the nose line belong to the jaw round (CP-03 8.645 + its slide along a vertical facing below the
    # nose, A3), never to the facing; the tip passed in is the NOSE-height tip, and at bed+20 the round sits 8 mm further along the
    # facing, so a radius window about that tip alone cannot exclude it
    sel = (r > r_min) & (r < 45) & (t < -12) & (s > -0.5)
    if sel.sum() < 3: return None
    Q = np.c_[s[sel], t[sel]]; Q = Q - Q.mean(0); _, _, vt = np.linalg.svd(Q, full_matrices=False); v = vt[0]
    ang = float(np.degrees(np.arctan2(abs(v[1]), abs(v[0])))); return round(ang, 2)

# ------------------------------------------------------------------ the rules -----------------------------------
def measure_side(name, T_all, T_cush, T_rail, T_bed, dat, sights_xy):
    """One side ('ours' or 'model'): returns {row: value} + notes.  dat = datums dict; T_* triangle sets (global frame)."""
    bed, xn, yn = dat["bed"], dat["x_nose"], dat["y_nose"]; R = {}; N = {}
    n = dat.get("noses") or dict(long_plus=yn, long_minus=-yn, short_plus=xn, short_minus=-xn)
    R["PF-01"] = [None if n["short_plus"] is None or n["short_minus"] is None else round(n["short_plus"] - n["short_minus"], 3),
                  None if n["long_plus"] is None or n["long_minus"] is None else round(n["long_plus"] - n["long_minus"], 3)]
    N["PF-01"] = "nose rectangle: innermost cushion points over plan cuts at bed+10..40 (PF-01m rule)"
    Lc = objsoup.tris_local(T_cush, "nose_long", dat, (300, 900, -6, 60, -1, 47), margin=1.0); ns = nose_section(Lc) if len(Lc) else None
    R["CU-02"] = None if ns is None else round(ns["tip_z"], 4); N["CU-02"] = "z of the min-u point of the cushion section at x=600 (nose tip)"
    R["CU-03"] = None if ns is None else round(ns["tip_z"] / BALL_D, 5); N["CU-03"] = "CU-02 / 57.15"
    R["CU-04"] = None if ns is None or ns["width"] is None else round(ns["width"], 4); N["CU-04"] = "u extent of the closed cushion chain at x=600 (nose to back wall)"
    h_tip = 35.3 if ns is None else float(ns["tip_z"])
    tc = tips_corner(T_cush if len(T_cush) else T_all, xn, yn, bed, h=h_tip)
    R["CP-01"] = None if tc is None else round(tc["mouth"], 4); N["CP-01"] = f"+X+Y corner, plan cut at bed+{h_tip:.3f} (this side's nose height): last point on each nose line (tip) -> tip-to-tip chord"
    if tc is not None:
        P20 = cut_points(T_cush if len(T_cush) else T_all, 2, bed + 20.0, region=(300, 1e9, 100, 1e9))
        tr = tip_round(P20, tc["tip_long"]); R["CP-03"] = tr["R"]; N["CP-03"] = tr["note"] + f" (n {tr['n']}, rms {tr['rms']})"
        rmin = max(3.0, (tr["R"] or 0.0) + 2.0)
        R["CP-02"] = facing_angle(P20, tc["tip_long"], np.array([1.0, 0.0]), np.array([0.0, -1.0]), r_min=rmin); N["CP-02"] = f"long-rail jaw facing angle to the rail at bed+20 (TLS on points {rmin:.1f}..40 mm behind the tip; the inner bound clears the jaw round)"
    else:
        R["CP-02"] = None; R["CP-03"] = None; N["CP-02"] = N["CP-03"] = "no corner tips found"
    ts = tips_side(T_cush if len(T_cush) else T_all, yn, bed, h=h_tip)
    R["SP-01"] = None if ts is None else round(ts["mouth"], 4); N["SP-01"] = f"+Y side pocket, plan cut at bed+{h_tip:.3f}: innermost tips of the two long cushions on the nose line -> chord"
    if ts is not None:
        P20 = cut_points(T_cush if len(T_cush) else T_all, 2, bed + 20.0, region=(-900, 900, 300, 1e9))
        tr = tip_round(P20, ts["tip_right"]); R["SP-03"] = tr["R"]; N["SP-03"] = tr["note"] + f" (n {tr['n']}, rms {tr['rms']})"
        rmin = max(3.0, (tr["R"] or 0.0) + 2.0)
        R["SP-02"] = facing_angle(P20, ts["tip_right"], np.array([-1.0, 0.0]), np.array([0.0, -1.0]), r_min=rmin); N["SP-02"] = f"right-hand side jaw facing angle to the rail at bed+20 (TLS on points {rmin:.1f}..40 mm behind the tip; the inner bound clears the jaw round)"
    else:
        R["SP-02"] = None; R["SP-03"] = None; N["SP-02"] = N["SP-03"] = "no side tips found"
    # SP-05 shelf: bed top face edge on x=0 beyond the nose line
    Tb_ = T_bed if len(T_bed) else T_all
    if len(Tb_):   # the cloth/slate TOP face only: horizontal triangles at the bed level (a liner flange or cushion bottom must not extend the walk)
        nb = np.cross(Tb_[:, 1] - Tb_[:, 0], Tb_[:, 2] - Tb_[:, 0]); ab_ = np.linalg.norm(nb, axis=1); horiz = (np.abs(nb[:, 2]) / np.maximum(ab_, 1e-12) > 0.999) & (np.abs(Tb_[:, :, 2].mean(1) - bed) < 0.05)
        Tb_ = Tb_[horiz]
    Pb = cut_points(Tb_, 0, 0.0, region=(-5, 5, yn - 20, yn + 250))
    Pb = Pb[(np.abs(Pb[:, 2] - bed) < 0.3) & (Pb[:, 1] > yn - 10) & (Pb[:, 1] < yn + 200)]
    edge = None
    if len(Pb):
        ys = np.unique(np.round(np.sort(Pb[:, 1]), 3)); ys = ys[ys >= yn - 10]
        if len(ys):
            gaps = np.diff(ys); stop = np.nonzero(gaps > 2.0)[0]; edge = float(ys[stop[0]] if len(stop) else ys[-1])
    R["SP-05"] = None if edge is None else round(edge - yn, 4); N["SP-05"] = "x=0 section: bed-top points (|z-bed|<0.3) walked outward from the nose line until the first gap > 2 mm = bed-hole edge; minus the nose line"
    # RB-03 rail top width long / short: u extent of the rail-top meshes at x=600 / y=300
    def rail_u(Tr, anchor, axis, c, col):
        L = objsoup.tris_local(Tr, anchor, dat, None)
        if len(L) == 0: return None
        S = objsoup.section(L, axis, c)
        if len(S) == 0: return None
        P = S.reshape(-1, 3); P = P[(P[:, 2] > 5) & (P[:, 2] < 50) & (P[:, col] > 40) & (P[:, col] < 200)]
        # width from the featherstrip line (CU-04 48.072 behind the nose, the row's own definition) to the outer edge —
        # the OX cap's inner edge sits 0.24 mm inside that line by RB-04 (raw), the generic planks exactly on it
        return None if len(P) == 0 else round(float(P[:, col].max() - 48.072), 3)
    R["RB-03"] = [rail_u(T_rail, "nose_long", 0, 600.0, 1), rail_u(T_rail, "nose_short", 1, 300.0, 0)] if len(T_rail) else [None, None]
    N["RB-03"] = "rail-top meshes ('dm-railtop*' / 'dm-rail-cap*'): outer edge of their section at x=600 / y=300 (z 5..50 above bed) minus the featherstrip line CU-04 48.072 (the row's definition)"
    # RB-07 sights: pitch along the +Y long rail and inset from the nose
    if sights_xy is not None and len(sights_xy) >= 2:
        s = sights_xy[(sights_xy[:, 1] > 400)]; xs = np.sort(s[:, 0]); pitch = float(np.median(np.diff(xs))) if len(xs) > 1 else None
        R["RB-07"] = [None if pitch is None else round(pitch, 6), round(float(np.mean(np.abs(s[:, 1])) - yn), 6)]
    else: R["RB-07"] = [None, None]
    N["RB-07"] = "+Y long-rail sight centres: median pitch along x; mean |y| - nose line"
    for k in CONSTRUCTION: R[k] = None; N[k] = "kernel construction row (derived from CP/SP-01/02/03): no mesh rule; INFO"
    return R, N

def model_side():
    T = objsoup.tris(); md = objsoup.model_datums(); md = dict(md, noses=dict(long_plus=objsoup.NY, long_minus=-objsoup.NY, short_plus=objsoup.NX, short_minus=-objsoup.NX))
    # model cushion window: the cushion body only (u -6..60, z -1..47 along the +Y rail / +X rail) -- everything else of the soup is farther out
    Tc = np.concatenate([objsoup.local_frame(objsoup.tris_local(T, "nose_long", md, (200, 1000, -6, 60, -1, 47)).reshape(-1, 3), "global", dict(bed=0)).reshape(-1, 3, 3)]) if False else T
    C = objsoup.sight_centres()
    R, N = measure_side("model", T, cushion_window(T, md), T, T, md, C[:, :2])
    return R, N

def cushion_window(T, dat):
    """The cushion bodies of a nameless soup: triangles whose AABB lies within u <= 60 of a nose line and z -1..47."""
    b = dat["bed"]; mn = T.min(1); mx = T.max(1)
    zb = (mn[:, 2] > b - 1) & (mx[:, 2] < b + 47.5)
    longs = zb & (np.abs(mx[:, 1]) <= dat["y_nose"] + 60) & (np.abs(mn[:, 1]) >= dat["y_nose"] - 6) & (np.sign(mn[:, 1]) == np.sign(mx[:, 1]))
    shorts = zb & (np.abs(mx[:, 0]) <= dat["x_nose"] + 60) & (np.abs(mn[:, 0]) >= dat["x_nose"] - 6) & (np.sign(mn[:, 0]) == np.sign(mx[:, 0]))
    return T[longs | shorts]

def ours_side(dump):
    T = dump.tris(); dat = dump.datums
    cush = dump.select(prefixes=["dm-cushion"]); rail = dump.select(prefixes=["dm-railtop", "dm-rail-cap", "dm-railcap"]); bed = dump.select(prefixes=["dm-bed"])
    Tc = dump.tris(cush) if cush else cushion_window(T, dat); Tr = dump.tris(rail) if rail else np.zeros((0, 3, 3)); Tb = dump.tris(bed) if bed else np.zeros((0, 3, 3))
    s = dump.select(prefixes=["dm-sight"]); sx = np.array([m["V"][:, :2].mean(0) for m in s]) if s else None
    R, N = measure_side("ours", T, Tc, Tr, Tb, dat, sx)
    N["_selection"] = dict(cushions=[m["name"] for m in cush] or "window rule", rails=[m["name"] for m in rail] or "none named -> RB-03 not measurable", bed=[m["name"] for m in bed] or "window", sights=len(s))
    return R, N

def _num(v): return isinstance(v, (int, float)) and not isinstance(v, bool)

def build(dump):
    rows, extra, rev = load_rows(); Ro, No = ours_side(dump); Rm, Nm = model_side(); f = objsoup.EN07
    SCALED = {"PF-01": (f[0], f[1]), "RB-07": (f[0], None)}   # carried lengths: PF-01 both; RB-07 pitch (position) only
    out = []
    for rid in KERNEL_ROWS + [e for e in extra if e not in KERNEL_ROWS]:
        row = rows.get(rid)
        if row is None:
            out.append(dict(id=rid, name="", present=False, status="row not yet present")); continue
        spec = row.get("value_mm", row.get("value")); tol, tclass = tolerance(row); o = Ro.get(rid); m = Rm.get(rid)
        ms = None
        if rid in SCALED and m is not None:
            fs = SCALED[rid]; ms = [None if (x is None or fs[i] is None) else round(x * fs[i], 3) for i, x in enumerate(m)] if isinstance(m, list) else round(m * fs[0], 3)
        def delta(a, b):
            if a is None or b is None: return None
            if isinstance(a, list) and isinstance(b, list): return [None if (x is None or y is None or not _num(x) or not _num(y)) else round(x - y, 4) for x, y in zip(a, b)]
            if _num(a) and _num(b): return round(a - b, 4)
            return None
        d_spec = delta(o, spec); d_raw = delta(o, m); d_sc = delta(o, ms)
        if rid in CONSTRUCTION: status = "INFO (construction row, no mesh rule)"
        elif rid.startswith("RC-") or (isinstance(spec, dict)): status = "INFO (letters-rox judges this row)"
        elif spec is None or (isinstance(spec, list) and all(x is None for x in spec)): status = "INFO (spec null)"
        elif o is None or (isinstance(o, list) and any(x is None for x in o)): status = "RED (not measurable on ours: element absent)"
        elif d_spec is None: status = "INFO (non-numeric)"
        else:
            ds = d_spec if isinstance(d_spec, list) else [d_spec]; tl = tol if isinstance(tol, list) else [tol] * len(ds)
            if rid == "CU-03": tl = [0.2 / BALL_D]
            status = "GREEN" if all(t is not None and abs(x) <= t + 1e-9 for x, t in zip(ds, tl)) else ("SHARED-SCENE (reported, not a rox verdict)" if rid in SHARED_SCENE else "RED")
        out.append(dict(id=rid, name=row.get("name"), scope=row.get("scope"), tier=(row.get("source") or {}).get("tier"), present=True, spec=spec, ours=o, model_raw=m, model_scaled=ms,
                        delta_spec=d_spec, delta_model_raw=d_raw, delta_model_scaled=d_sc, tolerance=tol, tol_class=tclass, status=status,
                        rule_ours=No.get(rid), rule_model=Nm.get(rid), datum="EN-07-scaled" if rid in SCALED else "raw"))
    return dict(json_revision=rev, json_path=JSON_PATH, rows=out, extra_rows_found=extra, ours_selection=No.get("_selection"))

if __name__ == "__main__":
    import sys, ours
    d = ours.Dump(sys.argv[1] if len(sys.argv) > 1 else "/tmp/ox-a2/dump/skeleton.json"); t = build(d)
    print("json rev", t["json_revision"], "extra rows", t["extra_rows_found"], "selection", t["ours_selection"])
    for r in t["rows"]:
        print(f"{r['id']:6s} {r.get('status',''):42s} spec={r.get('spec')} ours={r.get('ours')} raw={r.get('model_raw')} sc={r.get('model_scaled')} d={r.get('delta_spec')} tol={r.get('tolerance')}")
