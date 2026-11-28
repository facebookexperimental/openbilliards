# Copyright (c) Meta Platforms, Inc. and affiliates.

"""sections — section polylines at the named A1 stations for both meshes (element local frame), symmetric Hausdorff and
discrete Frechet distances in mm, plotted at scale with a mm grid.  Segment soups are chained into polylines (endpoint
matching, 0.05 mm); Hausdorff is taken over ALL chains (points densified at 0.5 mm), Frechet over the LONGEST chain of
each side (the primary profile) — both printed with the chain counts so a partial profile cannot pass unnoticed."""
import numpy as np
from scipy.spatial import cKDTree
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
import objsoup

def cut(T_local, station):
    _, el, ax, c, ha, va, win, _n = station
    if ax == "diag":
        S = objsoup.section_diag(T_local)
    else:
        S3 = objsoup.section(T_local, ax, c); S = S3[:, :, [ha, va]] if len(S3) else np.zeros((0, 2, 2))
    if len(S) == 0: return S
    S = clip_segments(S, win); L = np.linalg.norm(S[:, 1] - S[:, 0], axis=1); return S[L > 1e-6]

def clip_segments(S, win):
    """Liang-Barsky clip of segments (k,2,2) to the window rectangle (h0,h1,v0,v1); drops segments fully outside."""
    h0, h1, v0, v1 = win; P0 = S[:, 0]; D = S[:, 1] - S[:, 0]
    t0 = np.zeros(len(S)); t1 = np.ones(len(S)); ok = np.ones(len(S), bool)
    for p, q in ((-D[:, 0], P0[:, 0] - h0), (D[:, 0], h1 - P0[:, 0]), (-D[:, 1], P0[:, 1] - v0), (D[:, 1], v1 - P0[:, 1])):
        with np.errstate(divide="ignore", invalid="ignore"): r = q / p
        par = p == 0; ok &= ~(par & (q < 0))
        neg = (p < 0) & ~par; pos = (p > 0) & ~par
        t0 = np.where(neg, np.maximum(t0, r), t0); t1 = np.where(pos, np.minimum(t1, r), t1)
    ok &= t0 <= t1
    A = P0 + D * t0[:, None]; B = P0 + D * t1[:, None]
    return np.stack([A, B], 1)[ok]

def chain(S, tol=0.05):
    """Greedy chaining of segments into polylines; returns a list of (k,2) arrays sorted by length (longest first)."""
    if len(S) == 0: return []
    P = S.reshape(-1, 2); key = np.round(P / tol).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.reshape(-1, 2)
    adj = {}
    for i, (a, b) in enumerate(inv):
        adj.setdefault(a, []).append((b, i)); adj.setdefault(b, []).append((a, i))
    used = np.zeros(len(S), bool); chains = []
    node_xy = {}
    for i, (a, b) in enumerate(inv): node_xy[a] = S[i, 0]; node_xy[b] = S[i, 1]
    order = sorted(adj.keys(), key=lambda n: len(adj[n]))          # start from open ends first
    for start in order:
        for nb, si in adj[start]:
            if used[si]: continue
            path = [start]; cur = start; nxt, seg = nb, si
            while True:
                used[seg] = True; path.append(nxt); cur = nxt
                cand = [(n2, s2) for n2, s2 in adj[cur] if not used[s2]]
                if not cand: break
                nxt, seg = cand[0]
            chains.append(np.array([node_xy[n] for n in path]))
    def length(c): return float(np.linalg.norm(np.diff(c, axis=0), axis=1).sum())
    return sorted(chains, key=length, reverse=True)

def densify(S, step=0.5):
    if len(S) == 0: return np.zeros((0, 2))
    out = []
    for a, b in S:
        n = max(2, int(np.ceil(np.linalg.norm(b - a) / step)) + 1); t = np.linspace(0, 1, n)[:, None]; out.append(a + (b - a) * t)
    return np.vstack(out)

def hausdorff(A, B):
    if len(A) == 0 or len(B) == 0: return None
    d1, _ = cKDTree(B).query(A, workers=-1); d2, _ = cKDTree(A).query(B, workers=-1)
    return dict(hausdorff=round(float(max(d1.max(), d2.max())), 2), model_to_ours_median=round(float(np.median(d1)), 2), ours_to_model_median=round(float(np.median(d2)), 2),
                model_to_ours_p90=round(float(np.percentile(d1, 90)), 2), ours_to_model_p90=round(float(np.percentile(d2, 90)), 2))

def resample(poly, step=1.0, max_n=1500):
    if len(poly) < 2: return poly
    seg = np.linalg.norm(np.diff(poly, axis=0), axis=1); s = np.concatenate([[0], np.cumsum(seg)]); L = s[-1]
    n = int(min(max_n, max(2, np.ceil(L / step) + 1))); t = np.linspace(0, L, n)
    return np.stack([np.interp(t, s, poly[:, 0]), np.interp(t, s, poly[:, 1])], 1)

def frechet(P, Q):
    """Discrete Frechet distance (Eiter-Mannila) between two ordered polylines; orientation-free (min over Q reversed)."""
    if len(P) < 2 or len(Q) < 2: return None
    def one(P, Q):
        D = np.linalg.norm(P[:, None, :] - Q[None, :, :], axis=2); n, m = D.shape; ca = np.empty((n, m))
        ca[0, 0] = D[0, 0]
        for j in range(1, m): ca[0, j] = max(ca[0, j - 1], D[0, j])
        for i in range(1, n):
            ca[i, 0] = max(ca[i - 1, 0], D[i, 0])
            row = ca[i - 1]; prev = np.minimum(row[1:], row[:-1])     # min(ca[i-1,j], ca[i-1,j-1]) for j>=1
            for j in range(1, m): ca[i, j] = max(min(prev[j - 1], ca[i, j - 1]), D[i, j])
        return float(ca[-1, -1])
    return round(min(one(P, Q), one(P, Q[::-1])), 2)

def frechet_fast(P, Q):
    """Same DP with the inner loop vectorised per row via a cumulative trick is not exact; use the exact O(nm) loop on
    <= 400-point resamples (0.16 M cells, fine)."""
    return frechet(resample(P, max_n=400), resample(Q, max_n=400))

def compare(Sm, So):
    cm, co = chain(Sm), chain(So)
    lm = [float(np.linalg.norm(np.diff(c, axis=0), axis=1).sum()) for c in cm]; lo = [float(np.linalg.norm(np.diff(c, axis=0), axis=1).sum()) for c in co]
    res = dict(model_segments=int(len(Sm)), ours_segments=int(len(So)), model_chains=len(cm), ours_chains=len(co),
               model_total_length=round(sum(lm), 1), ours_total_length=round(sum(lo), 1),
               model_longest_chain=round(lm[0], 1) if lm else 0.0, ours_longest_chain=round(lo[0], 1) if lo else 0.0)
    Pm, Po = densify(Sm), densify(So); hd = hausdorff(Pm, Po); res["hausdorff_mm"] = None if hd is None else hd["hausdorff"]; res["hausdorff_detail"] = hd
    if len(Pm) and len(Po):   # v2: the two-way distance distribution (median / p90) — the judged statistic; the Hausdorff max is reported
        from scipy.spatial import cKDTree
        dmo = cKDTree(Pm).query(Po)[0]; dom = cKDTree(Po).query(Pm)[0]; both = np.concatenate([dmo, dom])
        res["twoway_median_mm"] = round(float(np.median(both)), 3); res["twoway_p90_mm"] = round(float(np.percentile(both, 90)), 3)
    else: res["twoway_median_mm"] = None; res["twoway_p90_mm"] = None
    res["frechet_longest_chain_mm"] = frechet_fast(cm[0], co[0]) if (cm and co) else None
    return res, cm, co

def plot(Sm, So, station, res, path, bed_line=True):
    sid, el, ax, c, ha, va, win, note = station; h0, h1, v0, v1 = win; W = h1 - h0; H = v1 - v0; sc = 7.0 / max(W, H)
    fig, ax_ = plt.subplots(figsize=(max(7, W * sc * 1.6), max(5, H * sc * 1.6)))
    ax_.set_facecolor("#0e1218"); fig.patch.set_facecolor("#0e1218")
    if len(Sm): ax_.add_collection(LineCollection(Sm, colors="#00beff", linewidths=1.0, label=f"model ({len(Sm)} segs, {res['model_chains']} chains)"))
    if len(So): ax_.add_collection(LineCollection(So, colors="#ff28c8", linewidths=1.0, label=f"ours ({len(So)} segs, {res['ours_chains']} chains)"))
    step = 5 if max(W, H) <= 120 else (10 if max(W, H) <= 400 else 50)
    ax_.set_xticks(np.arange(np.ceil(h0 / step) * step, h1 + 1e-6, step)); ax_.set_yticks(np.arange(np.ceil(v0 / step) * step, v1 + 1e-6, step))
    ax_.grid(True, lw=0.3, alpha=0.45, color="#9aa0aa"); ax_.set_aspect("equal"); ax_.set_xlim(h0, h1); ax_.set_ylim(v0, v1)
    ax_.tick_params(colors="#d0d4da", labelsize=6); [sp.set_color("#6a7078") for sp in ax_.spines.values()]
    if bed_line and va == 2 and el not in ("pedestal_end", "foot_pad") and v0 <= 0 <= v1: ax_.axhline(0, color="#ffd24a", lw=0.7, ls="--")
    ax_.axvline(0, color="#ffd24a", lw=0.5, ls=":"); 
    ax_.set_title(f"{sid}: {note}\nHausdorff {res['hausdorff_mm']} mm   Frechet(longest chains) {res['frechet_longest_chain_mm']} mm   grid {step} mm   cyan = model (raw)   magenta = ours", fontsize=8, color="#e8eaee")
    ax_.legend(fontsize=6, loc="upper right", facecolor="#1a1f28", edgecolor="#6a7078", labelcolor="#e8eaee")
    plt.setp(ax_.get_xticklabels(), rotation=90); fig.tight_layout(); fig.savefig(path, dpi=130, facecolor=fig.get_facecolor()); plt.close(fig)

def run(dump, out, stations=None, quick=False):
    import register, os
    md = objsoup.model_datums(); Tm = register.model_tris("raw"); res = {}
    for st in (stations or objsoup.STATIONS):
        sid, el = st[0], st[1]; w = objsoup.WINDOWS[el]; anchor = w["anchor"]
        od = dump.comparison_datums(anchor)  # FIX2: same fixed reference as element/letter reads.
        # generous local box so the cut sees the whole station window
        h0, h1, v0, v1 = st[6]; ha, va = st[4], st[5]
        box = [-1e9, 1e9, -1e9, 1e9, -1e9, 1e9]
        if st[2] == "diag":
            box = [-260, 260, -260, 260, v0 - 2, v1 + 2]
        else:
            box[2 * ha], box[2 * ha + 1] = h0 - 2, h1 + 2; box[2 * va], box[2 * va + 1] = v0 - 2, v1 + 2
            box[2 * st[2]], box[2 * st[2] + 1] = st[3] - 3, st[3] + 3
        excl = tuple(w.get("exclude_ours", ())); To_el = dump.comparison_tris(anchor, [m for m in dump.meshes if not m["name"].startswith("dm-spot") and not m["name"].startswith(excl)]) if excl else dump.comparison_tris(anchor)
        Lm = objsoup.tris_local(Tm, anchor, md, tuple(box)); Lo = objsoup.tris_local(To_el, anchor, od, tuple(box))
        Sm, So = cut(Lm, st), cut(Lo, st)
        if w.get("mask") == "bands" and st[2] != "diag":   # v2: drop segments inside the cushion bands (each side in its own datum)
            def keep(S, datums, is_model):
                if len(S) == 0: return S
                mid = S.mean(1); P3 = np.zeros((len(mid), 3)); P3[:, ha] = mid[:, 0]; P3[:, va] = mid[:, 1]; P3[:, st[2]] = st[3]
                k = objsoup.band_mask(P3, anchor, datums, r_max=w.get("r_max")) & objsoup.band_mask(P3, anchor, od if is_model else md)   # union of both tables' bands
                if is_model: k &= objsoup.model_artefact_mask(P3, anchor)
                return S[k]
            Sm, So = keep(Sm, md, True), keep(So, od, False)
        r, cm, co = compare(Sm, So); r.update(station=sid, element=el, anchor=anchor, plane=f"local axis {st[2]} = {st[3]}", window=list(st[6]), note=st[7], datum="raw")
        # v2b (r9): section-to-SURFACE distances — each side's station points measured in 3D to the OTHER table's surface around the
        # station (the element gate's own estimator, sampled on the station curve).  A plan cut through a near-horizontal surface
        # turns a 0.3 mm height difference on a 0.09 slope into a 3 mm slide of the 2D chain, and a thin shell's underside shows on
        # one side only; the 2D chain distances (two-way median / p90, Hausdorff, Frechet) stay reported, the 3D ones are judged.
        r["s2s_median_mm"] = r["s2s_p90_mm"] = r["s2s_max_mm"] = None
        if st[2] != "diag" and len(Sm) and len(So):
            import deviation
            box3 = list(box); box3[2 * st[2]], box3[2 * st[2] + 1] = st[3] - 12, st[3] + 12
            Lm3 = objsoup.tris_local(Tm, anchor, md, tuple(box3)); Lo3 = objsoup.tris_local(To_el, anchor, od, tuple(box3))
            def to3(S):
                P = densify(S); P3 = np.zeros((len(P), 3)); P3[:, ha] = P[:, 0]; P3[:, va] = P[:, 1]; P3[:, st[2]] = st[3]; return P3
            if len(Lm3) and len(Lo3):
                d_o = deviation.SurfaceDist(Lm3, spacing=1.0).dist(to3(So)); d_m = deviation.SurfaceDist(Lo3, spacing=1.0).dist(to3(Sm)); both = np.concatenate([d_o, d_m])
                r["s2s_median_mm"] = round(float(np.median(both)), 3); r["s2s_p90_mm"] = round(float(np.percentile(both, 90)), 3); r["s2s_max_mm"] = round(float(both.max()), 2)
                r["s2s_ours_to_model"] = deviation.stats(d_o); r["s2s_model_to_ours"] = deviation.stats(d_m)
        png = f"{out}/section_{sid}.png"; plot(Sm, So, st, r, png); r["png"] = png
        np.save(f"{out}/section_{sid}_ours.npy", So)      # ours polylines only; the model's are never written
        res[sid] = r
    return res

if __name__ == "__main__":
    import sys, time, json, os, ours
    d = ours.Dump(sys.argv[1] if len(sys.argv) > 1 else "/tmp/ox-a2/dump/skeleton.json"); out = "/tmp/ox-a2/align/_dev"; os.makedirs(out, exist_ok=True)
    t = time.time(); r = run(d, out); print("sections", round(time.time() - t, 1), "s")
    for k, v in r.items(): print(f"{k:26s} segs m/o {v['model_segments']}/{v['ours_segments']} chains {v['model_chains']}/{v['ours_chains']} H {v['hausdorff_mm']} F {v['frechet_longest_chain_mm']}")
