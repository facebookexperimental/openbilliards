# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Shared loader for the D621 alignment gate (port of the d621-align Task C common.py; algorithms unchanged).
Ours: ours-*.json from dump-ours-621.mjs (metres, Y-up) -> model frame (mm, Z-up, bed top z=770).
Model: quarantined OBJ cages via objlib (read-only; vertex data stays in memory only)."""
import collections
import json
import re

import numpy as np

import families
import objlib
from paths import BED_Z

# proper rotation (det=+1): X_m = x_o ; Y_m = -z_o ; Z_m = y_o + 770 (mm)
R = np.array([[1.0, 0.0, 0.0], [0.0, 0.0, -1.0], [0.0, 1.0, 0.0]])
T = np.array([0.0, 0.0, BED_Z])


def to_model_frame(P_m):
    """P_m: (n,3) in ours world metres -> (n,3) mm in the model frame."""
    return (P_m * 1000.0) @ R.T + T


def load_ours(path):
    d = json.load(open(path))
    meshes = {}
    for i, m in enumerate(d["meshes"]):
        P = np.asarray(m["positions"], dtype=np.float64).reshape(-1, 3)
        if len(m["indices"]):
            F = np.asarray(m["indices"], dtype=np.int64).reshape(-1, 3)
        else:
            F = np.arange(len(P), dtype=np.int64).reshape(-1, 3)
        name = m["name"] if m["name"] else f"anon#{i}({m['parent']})"
        meshes[name] = dict(V=to_model_frame(P), F=F, parent=m["parent"], raw=m["name"], geom=m.get("geomType"), tris=m.get("tris"))
    return d, meshes


ours_family = families.ours_family


def ours_groups(meshes):
    g = collections.OrderedDict()
    for n, m in meshes.items():
        g.setdefault(ours_family(n, m["parent"]), []).append(n)
    return g


def load_model(qdir):
    nodes = objlib.load_all(qdir)
    G = objlib.groups(nodes)
    # split the rails into caps and 45-degree corner blocks (node order preserved), add the pseudo-groups the pairs use
    G["rail_caps"] = [n for n in G.get("rails", []) if n in families.MODEL_RAIL_CAPS]
    G["rail_corners"] = [n for n in G.get("rails", []) if n in families.MODEL_RAIL_CORNERS]
    G["cabinet"] = [n for n in families.MODEL_CABINET if n in nodes]
    G["bedslab"] = [n for n in families.MODEL_BEDSLAB if n in nodes]
    return nodes, G


def resolve(G, group_names):
    """Concatenate node/mesh name lists for a list of group/family names (missing groups contribute nothing)."""
    out = []
    for g in group_names:
        out += list(G.get(g, []))
    return out


def concat(meshes, names):
    Vs, Fs, off = [], [], 0
    for n in names:
        V, F = meshes[n]["V"], meshes[n]["F"]
        Vs.append(V); Fs.append(F + off); off += len(V)
    if not Vs:
        return np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64)
    return np.vstack(Vs), np.vstack(Fs)


def tri_areas(V, F):
    a = V[F[:, 1]] - V[F[:, 0]]; b = V[F[:, 2]] - V[F[:, 0]]
    return 0.5 * np.linalg.norm(np.cross(a, b), axis=1)


def sample_surface(V, F, spacing=2.0, min_n=1000, max_n=3_000_000, rng=None):
    """Area-weighted uniform surface samples; returns (P (n,3), tri index (n,)). Seed 621 unless an rng is given."""
    rng = rng or np.random.default_rng(621)
    A = tri_areas(V, F)
    tot = A.sum()
    if tot <= 0:
        return np.zeros((0, 3)), np.zeros(0, dtype=np.int64)
    n = int(np.clip(tot / (spacing ** 2), min_n, max_n))
    idx = rng.choice(len(F), size=n, p=A / tot)
    r1 = np.sqrt(rng.random(n)); r2 = rng.random(n)
    a, b, c = V[F[idx, 0]], V[F[idx, 1]], V[F[idx, 2]]
    P = (1 - r1)[:, None] * a + (r1 * (1 - r2))[:, None] * b + (r1 * r2)[:, None] * c
    return P, idx


def closest_point_tri(p, a, b, c):
    """Vectorised Ericson closest point on triangle. p,a,b,c: (n,3). Returns (n,3)."""
    ab = b - a; ac = c - a; ap = p - a
    d1 = (ab * ap).sum(1); d2 = (ac * ap).sum(1)
    out = np.empty_like(p)
    done = np.zeros(len(p), dtype=bool)
    m = (d1 <= 0) & (d2 <= 0); out[m] = a[m]; done |= m
    bp = p - b; d3 = (ab * bp).sum(1); d4 = (ac * bp).sum(1)
    m = (~done) & (d3 >= 0) & (d4 <= d3); out[m] = b[m]; done |= m
    vc = d1 * d4 - d3 * d2
    m = (~done) & (vc <= 0) & (d1 >= 0) & (d3 <= 0)
    with np.errstate(divide='ignore', invalid='ignore'):
        v = np.where((d1 - d3) != 0, d1 / (d1 - d3), 0.0)
    out[m] = a[m] + v[m, None] * ab[m]; done |= m
    cp = p - c; d5 = (ab * cp).sum(1); d6 = (ac * cp).sum(1)
    m = (~done) & (d6 >= 0) & (d5 <= d6); out[m] = c[m]; done |= m
    vb = d5 * d2 - d1 * d6
    m = (~done) & (vb <= 0) & (d2 >= 0) & (d6 <= 0)
    with np.errstate(divide='ignore', invalid='ignore'):
        w = np.where((d2 - d6) != 0, d2 / (d2 - d6), 0.0)
    out[m] = a[m] + w[m, None] * ac[m]; done |= m
    va = d3 * d6 - d5 * d4
    m = (~done) & (va <= 0) & ((d4 - d3) >= 0) & ((d5 - d6) >= 0)
    with np.errstate(divide='ignore', invalid='ignore'):
        w2 = np.where(((d4 - d3) + (d5 - d6)) != 0, (d4 - d3) / ((d4 - d3) + (d5 - d6)), 0.0)
    out[m] = b[m] + w2[m, None] * (c[m] - b[m]); done |= m
    m = ~done
    denom = va + vb + vc
    with np.errstate(divide='ignore', invalid='ignore'):
        v = np.where(denom != 0, vb / denom, 0.0); w = np.where(denom != 0, vc / denom, 0.0)
    out[m] = a[m] + ab[m] * v[m, None] + ac[m] * w[m, None]
    return out


class SurfaceDist:
    """Point -> triangle-mesh distance: kd-tree on dense surface samples, refined to exact point-triangle distance
    over the source triangles of the k nearest samples."""

    def __init__(self, V, F, spacing=2.0, max_n=1_000_000):
        from scipy.spatial import cKDTree
        self.V, self.F = V, F
        self.P, self.tri = sample_surface(V, F, spacing=spacing, max_n=max_n)
        # also add the vertices themselves as samples (their triangle = any incident one)
        first_tri = np.full(len(V), -1, dtype=np.int64)
        for k in range(3):
            first_tri[F[:, k]] = np.arange(len(F))
        ok = first_tri >= 0
        self.P = np.vstack([self.P, V[ok]]); self.tri = np.concatenate([self.tri, first_tri[ok]])
        self.tree = cKDTree(self.P)

    def dist(self, Q, k=4, chunk=200_000):
        out = np.empty(len(Q))
        for s in range(0, len(Q), chunk):
            q = Q[s:s + chunk]
            d, i = self.tree.query(q, k=k, workers=-1)
            tri = self.tri[i]                       # (n,k)
            best = np.full(len(q), np.inf)
            for j in range(k):
                t = tri[:, j]
                cp = closest_point_tri(q, self.V[self.F[t, 0]], self.V[self.F[t, 1]], self.V[self.F[t, 2]])
                best = np.minimum(best, np.linalg.norm(q - cp, axis=1))
            out[s:s + chunk] = best
        return out


def cross_vals(S2, h, hi=0):
    """S2: (N,2,2) segments in (h,v). Return v values where segments cross h=const."""
    a = S2[:, 0, hi]; b = S2[:, 1, hi]; m = ((a - h) * (b - h)) <= 0; m &= (a != b)
    t = (h - a[m]) / (b[m] - a[m]); return S2[m, 0, 1 - hi] + (S2[m, 1, 1 - hi] - S2[m, 0, 1 - hi]) * t


def stats(d):
    d = np.asarray(d)
    if len(d) == 0:
        return dict(n=0, median=None, p90=None, max=None, mean=None)
    return dict(n=int(len(d)), median=round(float(np.median(d)), 2), p90=round(float(np.percentile(d, 90)), 2), max=round(float(d.max()), 2), mean=round(float(d.mean()), 2))


def json_default(o):
    if isinstance(o, (np.floating,)): return float(o)
    if isinstance(o, (np.integer,)): return int(o)
    if isinstance(o, (np.bool_,)): return bool(o)
    if isinstance(o, np.ndarray): return o.tolist()
    raise TypeError(str(type(o)))


def dump_json(obj, path, indent=1):
    with open(path, "w") as fh:
        json.dump(obj, fh, indent=indent, default=json_default)
