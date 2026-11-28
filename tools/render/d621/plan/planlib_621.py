# Copyright (c) Meta Platforms, Inc. and affiliates.

"""D621-PLAN-1 — pocket-scale PLAN sections, per-pocket registration and even-odd masks.

Adopted from the measure-only audit that adjudicated the owner's card-19 rejection (plan-audit-dmd/
{a_load,b_sections,c_overlay,d_measure,planlib}.py, 2026-09-03): horizontal (z-plane) sections of OUR export
(dump-ours-621.mjs, model frame mm, bed top z = 770) and of the purchased model (quarantine OBJ, in memory only),
segments linked into loops, even-odd fill on a 2 px/mm grid in the pocket's OWN nose-intersection frame.

QUARANTINE: nothing derived from the model's vertices is written by this module; callers write rasters/numbers
only, and only under an --out directory outside the repo.
"""
import numpy as np
from matplotlib.path import Path

BED_Z = 770.0
RES = 2.0                       # px per mm (0.5 mm cells; area uncertainty ~ perimeter x 0.5 mm)
CUTS = {"mid": 790.0, "nose": 805.88, "top": 813.7}   # bed+20 / the model nose (bed+35.88) / cap top 814.68 - 1
WIN = dict(u0=-70.0, u1=210.0, w0=-140.0, w1=140.0)    # pocket frame window (mm): u outboard, w lateral


def section_xy(objlib, m, zc):
    s = objlib.section(m["V"], m["F"], 2, zc)
    return s[:, :, :2] if len(s) else np.zeros((0, 2, 2))


def dedupe(segs, q=1e-3):
    """drop duplicate segments (our end caps are drawn with both windings)"""
    if len(segs) == 0:
        return segs
    a = np.round(segs / q).astype(np.int64)
    key = np.where((a[:, 0, 0] < a[:, 1, 0]) | ((a[:, 0, 0] == a[:, 1, 0]) & (a[:, 0, 1] <= a[:, 1, 1])),
                   0, 1)
    k0 = np.where(key[:, None] == 0, a[:, 0], a[:, 1])
    k1 = np.where(key[:, None] == 0, a[:, 1], a[:, 0])
    flat = np.c_[k0, k1]
    _, idx = np.unique(flat, axis=0, return_index=True)
    return segs[np.sort(idx)]


def loops(segs, tol=0.5):
    """link 2-D segments into polylines; returns [(pts, closed)]"""
    if len(segs) == 0:
        return []
    segs = [s for s in segs if np.linalg.norm(s[0] - s[1]) > 1e-6]
    if not segs:
        return []
    used = np.zeros(len(segs), bool)
    out = []
    P = np.array([[s[0], s[1]] for s in segs])
    for i in range(len(segs)):
        if used[i]:
            continue
        used[i] = True
        pl = [P[i, 0], P[i, 1]]
        for end in (1, 0):
            while True:
                cur = pl[-1] if end == 1 else pl[0]
                d0 = np.linalg.norm(P[:, 0] - cur, axis=1)
                d1 = np.linalg.norm(P[:, 1] - cur, axis=1)
                d0[used] = 1e9
                d1[used] = 1e9
                j0, j1 = d0.argmin(), d1.argmin()
                if min(d0[j0], d1[j1]) > tol:
                    break
                if d0[j0] <= d1[j1]:
                    nxt = P[j0, 1]
                    used[j0] = True
                else:
                    nxt = P[j1, 0]
                    used[j1] = True
                if end == 1:
                    pl.append(nxt)
                else:
                    pl.insert(0, nxt)
        pl = np.array(pl)
        out.append((pl, bool(np.linalg.norm(pl[0] - pl[-1]) < tol * 4)))
    return out


def grid(win=WIN, res=RES):
    nu = int((win["u1"] - win["u0"]) * res)
    nw = int((win["w1"] - win["w0"]) * res)
    us = win["u0"] + (np.arange(nu) + 0.5) / res
    ws = win["w0"] + (np.arange(nw) + 0.5) / res
    return us, ws


def mask_of(segs, win=WIN, res=RES, join_arcs=False):
    """even-odd fill of the section loops (in the pocket frame) on the grid; returns (mask[w, u], n_open, loops)"""
    us, ws = grid(win, res)
    U, W = np.meshgrid(us, ws)
    pts = np.c_[U.ravel(), W.ravel()]
    L = loops(segs)
    nopen = sum(1 for _, c in L if not c)
    if join_arcs and len(L) == 2 and nopen == 2:
        # two open arcs (a collar without arm end caps): join outer+inner into ONE ring polygon
        a, b = L[0][0], L[1][0]
        if (np.linalg.norm(a[-1] - b[0]) + np.linalg.norm(b[-1] - a[0])
                > np.linalg.norm(a[-1] - b[-1]) + np.linalg.norm(b[0] - a[0])):
            b = b[::-1]
        L = [(np.vstack([a, b]), True)]
        nopen = 0
    m = np.zeros(len(pts), bool)
    for pl, _ in L:
        if len(pl) < 3:
            continue
        m ^= Path(np.vstack([pl, pl[:1]])).contains_points(pts)
    return m.reshape(len(ws), len(us)), nopen, L


class PocketFrame:
    """u along the pocket axis OUTBOARD from the nose-line intersection N, w lateral (v = axis rotated +90 deg)."""

    def __init__(self, kind, N, axis):
        self.kind = kind
        self.N = np.asarray(N, float)
        a = np.asarray(axis, float)
        self.u = a / np.linalg.norm(a)
        self.v = np.array([-self.u[1], self.u[0]])

    def to(self, P):
        d = np.asarray(P, float) - self.N
        return np.c_[d @ self.u, d @ self.v]

    def segs(self, segs):
        if len(segs) == 0:
            return segs
        flat = self.to(segs.reshape(-1, 2))
        return flat.reshape(-1, 2, 2)

    def depth(self, uw, sigma):
        """depth behind the nose line of the rail on lateral side sigma (+1 / -1). Corner: the rail on the +w side
        has its nose line along u = w (toward the table) and its body at u + w > 0, so depth = (u + w)/sqrt2; the
        -w rail mirrors: depth = (u - w)/sqrt2; i.e. (u + sigma w)/sqrt2 = (u + |w|)/sqrt2 for points on that side.
        Side pocket: depth = u."""
        u, w = uw[:, 0], uw[:, 1]
        if self.kind == "corner":
            return (u + sigma * w) / np.sqrt(2.0)
        return u

    def along(self, uw, sigma):
        """distance along the rail on side sigma, growing AWAY from the pocket: corner (|w| - u)/sqrt2, side |w|"""
        u, w = uw[:, 0], uw[:, 1]
        if self.kind == "corner":
            return (sigma * w - u) / np.sqrt(2.0)
        return sigma * w


def _plane_hits(segs, axis, c):
    """coordinates (the other axis) where 2-D segments cross the line axis = c"""
    out = []
    o = 1 - axis
    for a, b in segs:
        if (a[axis] - c) * (b[axis] - c) <= 0 and abs(b[axis] - a[axis]) > 1e-9:
            t = (c - a[axis]) / (b[axis] - a[axis])
            out.append(a[o] + t * (b[o] - a[o]))
    return out


def nose_lines(objlib, meshes, names_pred, z=CUTS["nose"]):
    """the nose-line offsets |Y| (long rails) and |X| (end rails) of a cushion family: the innermost crossing of
    the rubber's section at the nose height with the planes x = ±600 (long rails, away from the side mouth) and
    y = ±300 (end rails). Our lofts carry vertices only at the plan polygon's corners, so a vertex read would miss
    the straight runs — the section crossing is exact on both sides. FIX1 supplies the actual apex height;
    the default model-height slice remains only for the recorded legacy-registration secondary column."""
    ny = np.inf
    nx = np.inf
    for n, m in meshes.items():
        if not names_pred(n):
            continue
        s = section_xy(objlib, m, z)
        if not len(s):
            continue
        for xc in (-600.0, 600.0):
            ys = _plane_hits(s, 0, xc)
            if ys:
                ny = min(ny, float(np.abs(ys).min()))
        for yc in (-300.0, 300.0):
            xs = _plane_hits(s, 1, yc)
            if xs:
                nx = min(nx, float(np.abs(xs).min()))
    return nx, ny


def nose_z(objlib, meshes, names_pred, z_lo=804.0, z_hi=808.5, step=0.05):
    """the height of OUR nose apex: the z at which the long rails' section is innermost at x = +-600 (our K-55
    apex sits at kernel zNose, 0.6 mm above the model's 805.88; the plan polygon is the o = 0 ring there)"""
    best = (np.inf, None)
    for zc in np.arange(z_lo, z_hi + 1e-9, step):
        ny = np.inf
        for n, m in meshes.items():
            if not names_pred(n):
                continue
            s = section_xy(objlib, m, zc)
            if not len(s):
                continue
            for xc in (-600.0, 600.0):
                ys = _plane_hits(s, 0, xc)
                if ys:
                    ny = min(ny, float(np.abs(ys).min()))
        if ny < best[0]:
            best = (ny, float(zc))
    return best[1]


def exact_nose_apex(objlib, meshes, names_pred):
    """FIX1: same exact straight-section minimum for MODEL and OURS.

    DERIVED: retain the standing +/-600 and +/-300 section planes. The
    endpoint minimum of a piecewise-linear section is its actual apex;
    no four-mm radius or coarse height-grid assumption is involved.
    """
    records = []
    for name, mesh in meshes.items():
        if not names_pred(name):
            continue
        extents = np.ptp(mesh["V"], axis=0)
        along = 0 if extents[0] > extents[1] else 1
        across = 1 - along
        # DERIVED: retain the standing straight-run section planes on both sides.
        probe = 600.0 if along == 0 else 300.0
        for station in (-probe, probe):
            section = objlib.section(mesh["V"], mesh["F"], along, station)
            if not len(section):
                continue
            points = section.reshape(-1, 3)
            depth = np.abs(points[:, across])
            minimum = float(depth.min())
            heights = points[depth == minimum, 2]
            records.append(dict(mesh=name, station_mm=station, apex_z_mm=float(np.median(heights)),
                                nose_offset_mm=minimum))
    if not records:
        raise ValueError("UNRESOLVED nose apex: no exact straight-rail section")
    heights = np.array([record["apex_z_mm"] for record in records])
    return dict(height_mm=float(np.median(heights)), min_mm=float(heights.min()), max_mm=float(heights.max()),
                rms_mm=float(heights.std()), records=records)


def pocket_frames(nx, ny):
    """six pockets: four corners (sx, sy) and two sides (sy); N and the outboard axis"""
    out = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            out.append(("corner", f"corner_{'E' if sx > 0 else 'W'}{'N' if sy > 0 else 'S'}",
                        PocketFrame("corner", (sx * nx, sy * ny), (sx, sy))))
    for sy in (-1, 1):
        out.append(("side", f"side_{'N' if sy > 0 else 'S'}", PocketFrame("side", (0.0, sy * ny), (0.0, sy))))
    return out


def nearest_mesh(meshes, pred, target):
    best, bd = None, np.inf
    for n, m in meshes.items():
        if not pred(n):
            continue
        V = m["V"]
        c = (V.min(0) + V.max(0)) / 2.0
        d = float(np.hypot(c[0] - target[0], c[1] - target[1]))
        if d < bd:
            best, bd = n, d
    return best, bd


def meshes_near(meshes, pred, target, r):
    out = []
    for n, m in meshes.items():
        if not pred(n):
            continue
        V = m["V"]
        dx = np.maximum(np.maximum(V[:, 0].min() - target[0], target[0] - V[:, 0].max()), 0.0)
        dy = np.maximum(np.maximum(V[:, 1].min() - target[1], target[1] - V[:, 1].max()), 0.0)
        if np.hypot(dx, dy) <= r:
            out.append(n)
    return out
