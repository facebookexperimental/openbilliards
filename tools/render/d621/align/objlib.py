# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Loader for the quarantined per-node OBJ files (read-only input) + plane-section helpers. Port of the d621-align Task B
objlib.py (algorithms unchanged). Vertices are returned in mm (OBJ is metres). No vertex data is written anywhere by
this module; callers may only persist NUMBERS derived from it (or rasters/polylines under the OUT dir outside the repo)."""
import glob
import os
import re

import numpy as np

import families


def load_obj(path):
    V = []
    F = []
    with open(path) as fh:
        for line in fh:
            if line.startswith("v "):
                p = line.split()
                V.append((float(p[1]), float(p[2]), float(p[3])))
            elif line.startswith("f "):
                idx = [int(t.split("/")[0]) for t in line.split()[1:]]
                idx = [i - 1 if i > 0 else len(V) + i for i in idx]
                for k in range(1, len(idx) - 1):  # fan triangulation
                    F.append((idx[0], idx[k], idx[k + 1]))
    V = np.asarray(V, dtype=np.float64) * 1000.0  # -> mm
    F = np.asarray(F, dtype=np.int64).reshape(-1, 3)
    return V, F


def node_name(path):
    b = os.path.basename(path)
    m = re.match(r"node_(\d+)_(.+)\.obj$", b)
    return int(m.group(1)), m.group(2)


def load_all(qdir):
    """All node_*.obj in `qdir`, sorted by file name (= node id order). {name: {id, V, F, path}}"""
    paths = sorted(glob.glob(os.path.join(qdir, "node_*.obj")))
    if not paths:
        raise SystemExit(f"no node_*.obj files in {qdir} (quarantine dir missing? pass --model-obj-dir)")
    nodes = {}
    for p in paths:
        nid, name = node_name(p)
        V, F = load_obj(p)
        nodes[name] = dict(id=nid, V=V, F=F, path=p)
    return nodes


def group_of(name):
    return families.model_group(name)


def groups(nodes):
    out = {}
    for n in nodes:
        out.setdefault(group_of(n), []).append(n)
    return out


def aabb(V):
    return V.min(axis=0), V.max(axis=0)


# ---------- plane sections ----------
def section(V, F, axis, c, eps=1e-6):
    """Cut triangles (V mm, F idx) by the plane coord[axis] = c. Returns segments (N,2,3) in mm."""
    d = V[:, axis] - (c + eps)
    tri = F
    s = np.sign(d[tri])  # (n,3)
    keep = ~((s > 0).all(axis=1) | (s < 0).all(axis=1))
    tri = tri[keep]
    if len(tri) == 0:
        return np.zeros((0, 2, 3))
    segs = []
    P = V[tri]           # (n,3,3)
    D = d[tri]           # (n,3)
    for a, b in ((0, 1), (1, 2), (2, 0)):
        da, db = D[:, a], D[:, b]
        cross = (da * db) < 0
        with np.errstate(divide='ignore', invalid='ignore'):
            t = da / (da - db)
            pts = P[:, a, :] + (P[:, b, :] - P[:, a, :]) * t[:, None]
        segs.append((cross, pts))
    out = np.zeros((len(tri), 2, 3))
    cnt = np.zeros(len(tri), dtype=int)
    for cross, pts in segs:
        for i in np.nonzero(cross)[0]:
            if cnt[i] < 2:
                out[i, cnt[i]] = pts[i]
                cnt[i] += 1
    ok = cnt == 2
    return out[ok]


def project(segs3, axis):
    """Drop the plane axis -> (N,2,2). Order of the remaining axes is ascending (x,y | x,z | y,z)."""
    keep = [i for i in range(3) if i != axis]
    return segs3[:, :, keep]


def oriented_extents_45(V):
    """Extents along the (1,1)/sqrt2 and (1,-1)/sqrt2 plan axes (for 45-degree corner pieces)."""
    u = (V[:, 0] + V[:, 1]) / np.sqrt(2)
    w = (V[:, 0] - V[:, 1]) / np.sqrt(2)
    return (u.max() - u.min(), w.max() - w.min())
