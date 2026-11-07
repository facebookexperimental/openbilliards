# Copyright (c) Meta Platforms, Inc. and affiliates.

"""deviation — per-element point-to-surface deviation both ways inside the element's window (D621 method): area-weighted
surface samples of each side (<= max_n per side per element), nearest-surface distance via a cKDTree over dense samples of
the other side (+ its vertices) refined to the exact point-triangle distance over the k nearest samples' triangles;
median / p90 / max mm; heatmap PNGs (ours' samples coloured by distance, two projections of the window).
Model sample coordinates are never written to disk."""
import numpy as np
from scipy.spatial import cKDTree
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
import objsoup

def tri_areas(T): return 0.5 * np.linalg.norm(np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]), axis=1)

def sample_surface(T, spacing=1.5, min_n=500, max_n=200_000, rng=None):
    rng = rng or np.random.default_rng(642)
    A = tri_areas(T); tot = A.sum()
    if tot <= 0 or len(T) == 0: return np.zeros((0, 3)), np.zeros(0, np.int64)
    n = int(np.clip(tot / spacing ** 2, min_n, max_n)); idx = rng.choice(len(T), size=n, p=A / tot)
    r1 = np.sqrt(rng.random(n)); r2 = rng.random(n); a, b, c = T[idx, 0], T[idx, 1], T[idx, 2]
    return (1 - r1)[:, None] * a + (r1 * (1 - r2))[:, None] * b + (r1 * r2)[:, None] * c, idx

def closest_point_tri(p, a, b, c):
    ab = b - a; ac = c - a; ap = p - a; d1 = (ab * ap).sum(1); d2 = (ac * ap).sum(1)
    out = np.empty_like(p); done = np.zeros(len(p), bool)
    m = (d1 <= 0) & (d2 <= 0); out[m] = a[m]; done |= m
    bp = p - b; d3 = (ab * bp).sum(1); d4 = (ac * bp).sum(1)
    m = (~done) & (d3 >= 0) & (d4 <= d3); out[m] = b[m]; done |= m
    vc = d1 * d4 - d3 * d2; m = (~done) & (vc <= 0) & (d1 >= 0) & (d3 <= 0)
    with np.errstate(divide="ignore", invalid="ignore"): v = np.where((d1 - d3) != 0, d1 / (d1 - d3), 0.0)
    out[m] = a[m] + v[m, None] * ab[m]; done |= m
    cp = p - c; d5 = (ab * cp).sum(1); d6 = (ac * cp).sum(1)
    m = (~done) & (d6 >= 0) & (d5 <= d6); out[m] = c[m]; done |= m
    vb = d5 * d2 - d1 * d6; m = (~done) & (vb <= 0) & (d2 >= 0) & (d6 <= 0)
    with np.errstate(divide="ignore", invalid="ignore"): w = np.where((d2 - d6) != 0, d2 / (d2 - d6), 0.0)
    out[m] = a[m] + w[m, None] * ac[m]; done |= m
    va = d3 * d6 - d5 * d4; m = (~done) & (va <= 0) & ((d4 - d3) >= 0) & ((d5 - d6) >= 0)
    with np.errstate(divide="ignore", invalid="ignore"): w2 = np.where(((d4 - d3) + (d5 - d6)) != 0, (d4 - d3) / ((d4 - d3) + (d5 - d6)), 0.0)
    out[m] = b[m] + w2[m, None] * (c[m] - b[m]); done |= m
    m = ~done; denom = va + vb + vc
    with np.errstate(divide="ignore", invalid="ignore"):
        v = np.where(denom != 0, vb / denom, 0.0); w = np.where(denom != 0, vc / denom, 0.0)
    out[m] = a[m] + ab[m] * v[m, None] + ac[m] * w[m, None]
    return out

class SurfaceDist:
    def __init__(self, T, spacing=1.5, max_n=400_000):
        self.T = T; P, tri = sample_surface(T, spacing=spacing, max_n=max_n)
        Vv = T.reshape(-1, 3); tv = np.repeat(np.arange(len(T)), 3)
        self.P = np.vstack([P, Vv]); self.tri = np.concatenate([tri, tv]); self.tree = cKDTree(self.P)
    def dist(self, Q, k=4, chunk=100_000):
        out = np.empty(len(Q))
        for s in range(0, len(Q), chunk):
            q = Q[s:s + chunk]; d, i = self.tree.query(q, k=k, workers=-1); tri = self.tri[i]; best = np.full(len(q), np.inf)
            for j in range(k):
                t = tri[:, j]; cp = closest_point_tri(q, self.T[t, 0], self.T[t, 1], self.T[t, 2]); best = np.minimum(best, np.linalg.norm(q - cp, axis=1))
            out[s:s + chunk] = best
        return out

def stats(d):
    d = np.asarray(d)
    if len(d) == 0: return dict(n=0, median=None, p90=None, max=None, mean=None)
    return dict(n=int(len(d)), median=round(float(np.median(d)), 2), p90=round(float(np.percentile(d, 90)), 2), max=round(float(d.max()), 2), mean=round(float(d.mean()), 2))

def element(Lm, Lo, box, max_n=200_000, spacing=1.5, mask_m=None, mask_o=None):
    """Lm / Lo: triangles (n,3,3) in the element's local frame (pre-selected by window with margin).  Samples are kept only
    inside the box.  Returns (result dict, ours samples, ours distances)."""
    res = dict(model_tris=int(len(Lm)), ours_tris=int(len(Lo)), model_area_mm2=round(float(tri_areas(Lm).sum()), 0) if len(Lm) else 0.0,
               ours_area_mm2=round(float(tri_areas(Lo).sum()), 0) if len(Lo) else 0.0)
    if len(Lm) == 0 or len(Lo) == 0:
        res.update(ours_to_model=stats([]), model_to_ours=stats([]), absent="ours" if len(Lo) == 0 else "model"); return res, np.zeros((0, 3)), np.zeros(0)
    sdM = SurfaceDist(Lm, spacing=spacing, max_n=2 * max_n); sdO = SurfaceDist(Lo, spacing=spacing, max_n=2 * max_n)
    Os, _ = sample_surface(Lo, spacing=spacing, max_n=max_n); Os = Os[objsoup.in_box(Os, box)]
    Ms, _ = sample_surface(Lm, spacing=spacing, max_n=max_n); Ms = Ms[objsoup.in_box(Ms, box)]
    if mask_o is not None and len(Os): Os = Os[mask_o(Os)]
    if mask_m is not None and len(Ms): Ms = Ms[mask_m(Ms)]
    ds = sdM.dist(Os) if len(Os) else np.zeros(0); dm = sdO.dist(Ms) if len(Ms) else np.zeros(0)
    res.update(ours_to_model=stats(ds), model_to_ours=stats(dm),
               frac_ours_within_1mm=round(float((ds <= 1).mean()), 4) if len(ds) else None, frac_model_within_1mm=round(float((dm <= 1).mean()), 4) if len(dm) else None,
               frac_ours_within_3mm=round(float((ds <= 3).mean()), 4) if len(ds) else None, frac_model_within_3mm=round(float((dm <= 3).mean()), 4) if len(dm) else None,
               model_samples_in_tree=int(len(sdM.P)), ours_samples_in_tree=int(len(sdO.P)))
    res["_sdM"] = sdM  # kept for the per-mesh breakdown (popped before serialisation)
    return res, Os, ds

def breakdown(dump, anchor, datums, box, sdM, spacing=3.0, max_n=20_000, thr=3.0):
    """Per-mesh attribution of OUR offenders inside the element window: for every mesh with triangles in the window,
    sample its surface, measure the distance to the model, report n / median / p90 / max and the share above thr (mm).
    Diagnostic only - it names WHICH of our meshes carries a red; verdicts never read it."""
    rows = []
    for m in dump.meshes:
        if m["name"].startswith("dm-spot"): continue
        Lo = objsoup.tris_local(dump.comparison_vertices(m, anchor)[m["F"]], anchor, datums, box, margin=3.0)
        if len(Lo) == 0: continue
        Os, _ = sample_surface(Lo, spacing=spacing, min_n=50, max_n=max_n); Os = Os[objsoup.in_box(Os, box)]
        if len(Os) == 0: continue
        ds = sdM.dist(Os)
        rows.append(dict(mesh=m["name"] or "(unnamed)", n=int(len(Os)), median=round(float(np.median(ds)), 2), p90=round(float(np.percentile(ds, 90)), 2),
                         max=round(float(ds.max()), 2), over_thr=int((ds > thr).sum()), thr=thr))
    rows.sort(key=lambda r: (-r["over_thr"], -r["p90"]))
    return rows

def heatmap(Os, ds, Ms_proj, box, name, path, vmax=None):
    """Ours' samples coloured by distance to the model in two projections (h-v plan/elevation and h-w); the model's
    outline is suggested by a light scatter of its (projected, un-saved) samples."""
    h0, h1, v0, v1, w0, w1 = box
    fig, axs = plt.subplots(1, 2, figsize=(14, 6)); vmax = vmax or max(3.0, float(np.percentile(ds, 95)) if len(ds) else 3.0)
    for ax, (i, j), lab in zip(axs, ((0, 1), (0, 2)), (("h", "v"), ("h", "w"))):
        if len(Ms_proj): ax.scatter(Ms_proj[:, i], Ms_proj[:, j], s=0.3, c="#b8c0cc", alpha=0.35, linewidths=0)
        if len(Os):
            sc = ax.scatter(Os[:, i], Os[:, j], s=1.2, c=ds, cmap="inferno_r", vmin=0, vmax=vmax, linewidths=0)
        ax.set_xlim((h0, h1) if i == 0 else (v0, v1)); ax.set_ylim((v0, v1) if j == 1 else (w0, w1)); ax.set_aspect("equal"); ax.grid(True, lw=0.3, alpha=0.4)
        ax.set_title(f"{name}: local axes {lab[0]}-{lab[1]}", fontsize=9)
    if len(Os): fig.colorbar(sc, ax=axs.ravel().tolist(), shrink=0.8, label="ours -> model surface distance [mm]")
    fig.suptitle(f"{name}  ours->model med {np.median(ds):.2f} / p90 {np.percentile(ds, 90):.2f} / max {ds.max():.2f} mm" if len(ds) else f"{name}: ours ABSENT in the window", fontsize=10)
    fig.savefig(path, dpi=110, bbox_inches="tight"); plt.close(fig)

def run(dump, out, elements=None, quick=False, log=print):
    import register, time
    md = objsoup.model_datums(); Tm_raw = register.model_tris("raw"); Tm_sc = register.model_tris("scaled"); res = {}
    max_n = 40_000 if quick else 200_000; spacing = 3.0 if quick else 1.5
    for name in (elements or list(objsoup.WINDOWS)):
        w = objsoup.WINDOWS[name]; box = w["box"]; anchor = w["anchor"]; t0 = time.time()
        od = dump.comparison_datums(anchor)  # FIX2 datum plumbing only; estimator and masks unchanged.
        Tm = Tm_sc if w["datum"] == "scaled" else Tm_raw
        excl = tuple(w.get("exclude_ours", ())); To_el = dump.comparison_tris(anchor, [m for m in dump.meshes if not m["name"].startswith("dm-spot") and not m["name"].startswith(excl)]) if excl else dump.comparison_tris(anchor)
        Lm = objsoup.tris_local(Tm, anchor, md, box, margin=3.0); Lo = objsoup.tris_local(To_el, anchor, od, box, margin=3.0)
        mm = objsoup.window_mask(w, anchor, md, side="model", other=od); mo = objsoup.window_mask(w, anchor, od, other=md)
        r, Os, ds = element(Lm, Lo, box, max_n=max_n, spacing=spacing, mask_m=mm, mask_o=mo)
        r.update(element=name, anchor=anchor, datum=w["datum"], box=list(box), note=w["note"], seconds=round(time.time() - t0, 1))
        sdM = r.pop("_sdM", None)
        r["offenders"] = breakdown(dump, anchor, od, box, sdM, spacing=(4.0 if quick else 2.0)) if sdM is not None else []
        png = f"{out}/heat_{name}.png"
        Ms_proj, _ = sample_surface(Lm, spacing=4.0, max_n=20_000) if len(Lm) else (np.zeros((0, 3)), None)
        Ms_proj = Ms_proj[objsoup.in_box(Ms_proj, box)] if len(Ms_proj) else Ms_proj
        heatmap(Os, ds, Ms_proj, box, name, png); r["png"] = png; res[name] = r
        log(f"[dev] {name:16s} o->m {r['ours_to_model']['median']}/{r['ours_to_model']['p90']}/{r['ours_to_model']['max']}  m->o {r['model_to_ours']['median']}/{r['model_to_ours']['p90']}/{r['model_to_ours']['max']}  tris {len(Lm)}/{len(Lo)}  {r['seconds']}s")
    return res

if __name__ == "__main__":
    import sys, os, ours
    d = ours.Dump(sys.argv[1] if len(sys.argv) > 1 else "/tmp/ox-a2/dump/skeleton.json"); out = "/tmp/ox-a2/align/_dev"; os.makedirs(out, exist_ok=True)
    els = sys.argv[2].split(",") if len(sys.argv) > 2 else None
    run(d, out, elements=els, quick=True)
