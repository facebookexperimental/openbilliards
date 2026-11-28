#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""planlaw_rox.py — FIX3 physical-MODEL PLAN LAW gate.

Owner rejection of card 21b (2026-09-03, plan view of the middle pocket: liner and cushion end detached). The gate is the
measure-only audit's method (/tmp/plan-audit/rox/{load,analyze,measure,corner,topdown,draw}.py, adopted here as our own code):
the live-scene dump (tools/render/ghrox/dump_rox_scene.mjs) and the purchased OBJ (read in place through the align cache) are
cut at bed+20 / 28.575 / 34 / 36 / 38.5 / 40 mm, registered on each pocket's OWN nose-line intersection, densified at 0.25 mm,
and read at pocket scale (2 px/mm). Rows, per pocket (middle +Y, corner +X+Y), LAW unless stated:

  (a)  2-D distance liner end -> cushion end face <= 1.0 mm      Current emitted sections; an unswept-circle fit is INFO only.
                                                                The MFR mouth does not exempt a detached swept liner.
  (b)  LAW: OURS low at cells with physical MODEL top >= -0.5 mm, except MODEL rubber, <= 10 mm^2
       LITERAL: every low cell, INFO plus a separate pre-A4 ratchet (middle40 / corner133 mm^2)
  (b'') OURS pan at the same reference-eligible cells <= 1 mm^2
  (c)  cup centre vs the model's <= 1.0 mm                        (both by wall-split circle fits; 2x the model's facet rms)
  (d)  end-face rake |tip x(bed+20) - tip x(bed+36)| <= 2 mm      (model 1.85 = the nose profile's own bulge; its face is vertical); worst FINITE side — a missing tip is NOT MEASURED, never a FAIL and never a fired arm
  (e)  mouth at the nose line vs the ruled source <= 3 mm         (C2 precedent; SP-01 127 / CP-01 114.3)

Red arm (--redarm <dump of fccc1db3>): (b) 468 literal, (c) 15.2, (d) 8.7 (the -x side; the +x tip is not found on the raked face) must FIRE on the rejected build with FINITE values; (a) prints 5-15 there.
  FIX3 C1-C4: both physical source slab n-gons are read inside their real domain, never the cached fan.
  Missing MODEL hits REFUSE. Excluded cells are disclosed by owner class; MODEL rubber belongs to row (a).
  The old analytical wedge is retained only for historical INFO readings. C4 requires a finite b48 LAW/slit
  read for each pocket and rejection by either row PER POCKET. The old four-row matrix stays INFO for this round.
  --redarm <b24> retains all six finite must-fire rows. Live judgment still uses the worst side.

Usage:
  python3 tools/render/ghrox/planlaw_rox.py --dump /tmp/ox-a2/dump/b25.json --out /tmp/ox-a2/planlaw/b25 [--cache /tmp/ox-a2/align/cache]
         [--before /tmp/ox-a2/dump/b48.json] [--judge] [--redarm /tmp/ox-a2/dump/b24.json] [--redarm-a4 /tmp/ox-a2/dump/b48.json]
"""
from __future__ import annotations
import argparse, json, math, os, sys
from evidence_deps_rox import require_evidence_deps
require_evidence_deps()

import numpy as np
from pathlib import Path
import physical_rox

HERE = Path(__file__).resolve().parent; REPO = HERE.parents[2]
BED = 785.828  # PF-05 bed top in the lane frame (mm)
HEIGHTS = [20.0, 28.575, 34.0, 36.0, 38.5, 40.0]
PPM = 2.0; HALF = 160.0; N = int(2 * HALF * PPM); CELL = 1 / PPM ** 2
LAW = {"a": 1.0, "b": 10.0, "b''": 1.0, "c": 1.0, "d": 2.0, "e": 3.0}  # DERIVED: ORDER-ROX-A4 §3; existing limits unchanged
LITERAL_RATCHET = {"middle": 40.0, "corner": 133.0}  # FIX3 C3: immutable pre-A4 b48 seal.
C4_REASON = ("Under the model reference about 10.75 mm² of the middle shelf lies inside the MODEL rubber's footprint "
             "and is excluded from row (b). This historical C4 diagnostic does not exempt a liner gap or a judged LAW/slit failure.")
MODEL_REF = {"gap": "0.03-0.42", "exposed": "5 + 3", "rake": 1.85, "mouth_middle": 117.9, "mouth_corner": 97.8}

def load_rows():
    d = json.load(open(REPO / "docs/geometry/rasson-ox-9ft-table-definition.json"))
    rows = {f["id"]: f for f in d["features"]}
    def mm(i):
        r = rows[i]; v = r.get("value_mm", r.get("value")); return float(v)
    # SP-02 / CP-02 carry the FACING angles (99.978 / 141.2509 deg); the kernel's deviations are facing-90 and facing-135
    k = dict(CW=mm("CU-04"), sideMouth=mm("SP-01"), cornerMouth=mm("CP-01"), rs=mm("SP-03"), rc=mm("CP-03"),
             sa=float(rows["SP-02"]["value_deg"]) - 90.0, ca=float(rows["CP-02"]["value_deg"]) - 135.0 + 45.0, W=1270.0, L=2540.0)
    return k

def cushion_end(k, kind):
    """N, J, B of one cushion end in the pocket frame (along = away from the pocket, behind = beyond the nose line), mm — the kernel mirror."""
    CW = k["CW"]
    if kind == "side":
        sa = math.radians(k["sa"]); ds = k["rs"] / math.tan((math.pi / 2 + sa) / 2); sw = k["sideMouth"] - 2 * ds; sjb = CW * math.tan(sa)
        return dict(N=(sw / 2 + ds, 0.0), J=(sw / 2 - ds * math.sin(sa), ds * math.cos(sa)), B=(sw / 2 - sjb, CW), CW=CW)
    ca = math.radians(k["ca"])  # deviation + 45 (see load_rows)
    dc = k["rc"] / math.tan((math.pi / 2 + ca) / 2); pwc = k["cornerMouth"] / math.sqrt(2) - dc
    return dict(N=(pwc + dc, 0.0), J=(pwc - dc * math.sin(ca), dc * math.cos(ca)), B=(pwc - CW * math.tan(ca), CW), CW=CW)

def seg_dist(P, A, B):
    A = np.array(A); B = np.array(B); P = np.array(P); e = B - A; t = np.clip(np.dot(P - A, e) / max(np.dot(e, e), 1e-12), 0, 1); return float(np.linalg.norm(P - (A + t * e)))

# ---------------------------------------------------------------- geometry
def load_model(cache):
    V = np.load(cache / "V.npy"); F = np.load(cache / "F.npy"); O = np.load(cache / "O.npy"); names = json.load(open(cache / "objnames.json"))
    F = F[O == names.index("Pool_Table")]; return V, F

def load_ours(path):
    d = json.load(open(path)); ms = []
    for m in d["meshes"]:
        if not m.get("inTable", True) or not m.get("visible", True): continue
        P = np.array(m["positions"], float).reshape(-1, 3); I = np.array(m["indices"], np.int64).reshape(-1, 3) if m["indices"] else np.arange(len(P)).reshape(-1, 3)
        ms.append(dict(name=m["name"], P=P, F=I))
    ybed = max(float(m["P"][:, 1].max()) for m in ms if m["name"].startswith("dm-bed-cloth"))
    for m in ms: P = m["P"]; m["V"] = np.stack([1000 * P[:, 0], 1000 * P[:, 2], 1000 * (P[:, 1] - ybed) + BED], 1)
    return ms, d

def slice_tris(V, F, z):
    T = V[F]; zz = T[:, :, 2]; sel = (zz.min(1) < z) & (zz.max(1) > z); T = T[sel]; segs = []; keep = []
    for k, tri in enumerate(T):
        pts = []
        for a, b in ((0, 1), (1, 2), (2, 0)):
            za, zb = tri[a, 2], tri[b, 2]
            if (za - z) * (zb - z) < 0: t = (z - za) / (zb - za); pts.append(tri[a, :2] + t * (tri[b, :2] - tri[a, :2]))
        if len(pts) == 2: segs.append(pts); keep.append(k)
    return (np.array(segs) if segs else np.zeros((0, 2, 2))), np.nonzero(sel)[0][keep] if keep else np.zeros(0, int)

def winF(V, F, x0, y0, h):
    T = V[F]; return F[(T[:, :, 0].max(1) > x0 - h) & (T[:, :, 0].min(1) < x0 + h) & (T[:, :, 1].max(1) > y0 - h) & (T[:, :, 1].min(1) < y0 + h)]

def heightmap(V, F, x0, y0, ids=None):
    Z = np.full((N, N), -1e9); ID = np.full((N, N), -1, int); T = V[F]
    bb = (T[:, :, 0].max(1) > x0 - HALF) & (T[:, :, 0].min(1) < x0 + HALF) & (T[:, :, 1].max(1) > y0 - HALF) & (T[:, :, 1].min(1) < y0 + HALF)
    for k in np.nonzero(bb)[0]:
        tri = T[k]; px = (tri[:, 0] - (x0 - HALF)) * PPM; py = ((y0 + HALF) - tri[:, 1]) * PPM
        i0 = max(int(np.floor(py.min())), 0); i1 = min(int(np.ceil(py.max())), N - 1); j0 = max(int(np.floor(px.min())), 0); j1 = min(int(np.ceil(px.max())), N - 1)
        if i1 < i0 or j1 < j0: continue
        jj, ii = np.meshgrid(np.arange(j0, j1 + 1) + 0.5, np.arange(i0, i1 + 1) + 0.5)
        x1, y1 = px[0], py[0]; x2, y2 = px[1], py[1]; x3, y3 = px[2], py[2]; det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
        if abs(det) < 1e-12: continue
        l1 = ((y2 - y3) * (jj - x3) + (x3 - x2) * (ii - y3)) / det; l2 = ((y3 - y1) * (jj - x3) + (x1 - x3) * (ii - y3)) / det; l3 = 1 - l1 - l2
        m = (l1 >= -1e-9) & (l2 >= -1e-9) & (l3 >= -1e-9)
        if not m.any(): continue
        zz = l1 * tri[0, 2] + l2 * tri[1, 2] + l3 * tri[2, 2]; sub = Z[i0:i1 + 1, j0:j1 + 1]; upd = m & (zz > sub); sub[upd] = zz[upd]
        if ids is not None: ID[i0:i1 + 1, j0:j1 + 1][upd] = ids[k]
    return Z, ID

def dense(s, step=0.25):
    if len(s) == 0: return np.zeros((0, 2))
    out = []
    for a, b in s:
        a = np.array(a); b = np.array(b); n = max(2, int(np.linalg.norm(b - a) / step) + 1); t = np.linspace(0, 1, n)[:, None]; out.append(a + t * (b - a))
    return np.vstack(out)

def circfit(P):
    x, y = P[:, 0], P[:, 1]; A = np.c_[2 * x, 2 * y, np.ones(len(x))]; b = x ** 2 + y ** 2; c = np.linalg.lstsq(A, b, rcond=None)[0]
    R = math.sqrt(max(c[2] + c[0] ** 2 + c[1] ** 2, 0)); return float(c[0]), float(c[1]), R, float(np.sqrt(np.mean((np.hypot(x - c[0], y - c[1]) - R) ** 2)))

def robust_circle(P, seed, tol=1.0, it=4):
    xc, yc, R, rms = circfit(P[seed])
    for _ in range(it):
        rr = np.hypot(P[:, 0] - xc, P[:, 1] - yc); inl = abs(rr - R) < tol; xc, yc, R, rms = circfit(P[inl])
    return xc, yc, R, rms, inl

def wall_split(P, c0, back):
    """Two-wall liner: split the ring points at their median radius about the current centre, fit each wall, re-centre and repeat
    (a mixed fit about a biased centre mis-assigns points near the split); centre = mean of the two wall centres."""
    cx, cy = c0; out = None
    for _ in range(4):
        rr = np.hypot(P[:, 0] - cx, P[:, 1] - cy); sel = back & (abs(rr - np.median(rr[back])) < 2.5); rr2 = rr[sel]; Q = P[sel]
        if len(Q) < 40: return None
        med = np.median(rr2); out = {}
        for nm, m in (("inner", rr2 <= med), ("outer", rr2 > med)):
            if m.sum() < 20: return None
            xc, yc, R, rms = circfit(Q[m])
            for _ in range(3):
                r3 = np.hypot(P[:, 0] - xc, P[:, 1] - yc); mm = back & (abs(r3 - R) < 0.6); xc, yc, R, rms = circfit(P[mm])
            out[nm] = dict(xc=xc, yc=yc, R=R, rms=rms, n=int(mm.sum()))
        cx, cy = (out["inner"]["xc"] + out["outer"]["xc"]) / 2, (out["inner"]["yc"] + out["outer"]["yc"]) / 2
    out["centre"] = (cx, cy); return out

def cls(name):
    if name.startswith("dm-cushion"): return "cushion", (30, 90, 220)
    if "cup-ring" in name or "cup-c" in name or "cup-bucket" in name or "cup-floor" in name: return "liner", (200, 0, 200)
    if "flange" in name: return "flange", (255, 140, 0)
    if "piece-top" in name or "casting-top" in name or "piece-lip" in name or "casting-lip" in name: return "plate", (220, 0, 0)
    if "-cut" in name or "bed-cloth" in name or "slab-rox" in name: return "cloth", (0, 160, 0)
    if "rail-cap" in name: return "cap", (120, 120, 120)
    if "pan" in name: return "pan", (0, 150, 150)
    return "other", (190, 190, 190)

# ---------------------------------------------------------------- one build
class Build:
    def __init__(self, tag, V, F, names, ids_of_tri, origin_middle, origin_corner):
        self.tag = tag; self.V = V; self.F = F; self.names = names; self.ids = ids_of_tri; self.origin = {"middle": origin_middle, "corner": origin_corner}
        self.slices = {}; self.hm = {}
    def cut(self, pk, h):
        key = (pk, h)
        if key in self.slices: return self.slices[key]
        x0, y0 = self.origin[pk]; Fw = winF(self.V, self.F, x0, y0, 175)
        segs, tri_idx = slice_tris(self.V, Fw, BED + h); segs = segs - np.array([x0, y0]) if len(segs) else segs
        sid = self.ids[np.isin(np.arange(len(self.F)), np.zeros(0))] if False else None
        if self.ids is not None and len(segs):
            # map window triangles back to global ids
            T = self.V[self.F]; bb = (T[:, :, 0].max(1) > x0 - 175) & (T[:, :, 0].min(1) < x0 + 175) & (T[:, :, 1].max(1) > y0 - 175) & (T[:, :, 1].min(1) < y0 + 175)
            gidx = np.nonzero(bb)[0]; sid = self.ids[gidx[tri_idx]]
        self.slices[key] = (segs, sid); return self.slices[key]
    def height(self, pk):
        if hasattr(self, 'physical'):
            return self.physical.height(pk)
        if pk in self.hm: return self.hm[pk]
        x0, y0 = self.origin[pk]; Fw = winF(self.V, self.F, x0, y0, 175)
        ids = None
        if self.ids is not None:
            T = self.V[self.F]; bb = (T[:, :, 0].max(1) > x0 - 175) & (T[:, :, 0].min(1) < x0 + 175) & (T[:, :, 1].max(1) > y0 - 175) & (T[:, :, 1].min(1) < y0 + 175); ids = self.ids[np.nonzero(bb)[0]]
        self.hm[pk] = heightmap(self.V, Fw, x0, y0, ids); return self.hm[pk]
    def classes(self, pk, h):
        segs, sid = self.cut(pk, h)
        if self.ids is None: return None
        return np.array([cls(self.names[i])[0] for i in sid]) if len(segs) else np.zeros(0)

def model_build(cache):
    V, F, physical, components, source = physical_rox.load(cache)
    def plane_pts(x0, y0, h): s, _ = slice_tris(V, winF(V, F, x0, y0, 80), BED + h); return s.reshape(-1, 2) if len(s) else np.zeros((0, 2))
    pts = np.vstack([plane_pts(600, 588, h) for h in (30, 36)]); NY = float(pts[(abs(pts[:, 0]) < 900) & (pts[:, 1] > 300), 1].min())
    pts = np.vstack([plane_pts(1174, 300, h) for h in (30, 36)]); NX = float(pts[(abs(pts[:, 1]) < 400) & (pts[:, 0] > 800), 0].min())
    b = Build("model", V, F, None, None, (0.0, NY), (NX, NY)); b.NX, b.NY = NX, NY
    # Cuts/independent row (c) keep their sealed input. Only the physical-top
    # reference raster uses the source-domain triangles, in memory.
    b.physical = Build('physical source domain', V, physical, None, components, (0.0, NY), (NX, NY))
    b.reference_metadata = source
    return b

def ours_build(path, tag, k):
    ms, d = load_ours(path); Vs, Fs, Is, names = [], [], [], []; off = 0
    for m in ms:
        if m["name"].startswith("dm-spot") or m["name"].startswith("dm-ball"): continue
        Vs.append(m["V"]); Fs.append(m["F"] + off); Is.append(np.full(len(m["F"]), len(names))); names.append(m["name"]); off += len(m["V"])
    V = np.vstack(Vs); F = np.vstack(Fs); ids = np.concatenate(Is)
    b = Build(tag, V, F, names, ids, (0.0, k["W"] / 2), (k["L"] / 2, k["W"] / 2)); b.NX, b.NY = k["L"] / 2, k["W"] / 2; b.dump = d; return b

# ---------------------------------------------------------------- measures
def middle_rows(b: Build, is_model):
    res = {}
    for h in HEIGHTS:
        segs, sid = b.cut("middle", h); allp = dense(segs)
        if is_model:
            seed = (allp[:, 1] > 70) & (allp[:, 1] < 105) & (abs(allp[:, 0]) < 45)
            xc, vc, R, rms, inl = robust_circle(allp, seed, 1.0); li = allp[inl & (allp[:, 1] > -2)]; cu = allp[~inl]
        else:
            c = b.classes("middle", h); li = dense(segs[c == "liner"]) if len(segs) else np.zeros((0, 2)); cu = dense(segs[c == "cushion"]) if len(segs) else np.zeros((0, 2))
            if len(li) > 10: xc, vc, R, rms = circfit(li[li[:, 1] > 5])
            else: xc = vc = R = rms = float("nan")
        ws = wall_split(li, (xc, vc), li[:, 1] > vc - 2) if len(li) > 40 else None
        row = dict(cup_fit_mixed=dict(xc=xc, vc=vc, R=R, rms=rms), cup_wall_split=ws, n_liner=int(len(li)))
        far = cu[(abs(cu[:, 0]) > 100) & (abs(cu[:, 0]) < 150) & (cu[:, 1] > -3) & (cu[:, 1] < 60)]; vn = float(far[:, 1].min()) if len(far) else float("nan")
        row["nose_line_v"] = vn
        for sgn, tag in ((1, "px"), (-1, "nx")):
            c = cu[np.sign(cu[:, 0]) == sgn]; c = c[(abs(c[:, 0]) >= 15) & (abs(c[:, 0]) <= 150) & (c[:, 1] > -3) & (c[:, 1] < 120)]
            nose = c[c[:, 1] <= vn + 0.75]; tip = float(abs(nose[:, 0]).min()) if len(nose) else float("nan")
            online = c[abs(c[:, 1] - vn) <= 0.25]; tip_line = float(abs(online[:, 0]).min()) if len(online) else float("nan")
            # the kernel mouth is the distance between the jaw rounds' TANGENT points on the nose lines: the last nose-line point before the round leaves it
            onl = c[(abs(c[:, 1] - vn) <= 0.05) & (abs(c[:, 0]) >= (tip if tip == tip else 0) - 1)]; tang = float(abs(onl[:, 0]).min()) if len(onl) else float("nan")
            face = c[(abs(c[:, 0]) >= tip - 3) & (abs(c[:, 0]) <= tip + 30) & (c[:, 1] > vn + 2) & (c[:, 1] < 44)] if len(c) else c
            if len(face) > 5:
                m = face.mean(0); _, _, vt = np.linalg.svd(face - m); dv = vt[0]; ang = float(np.degrees(np.arctan2(abs(dv[1]), abs(dv[0])))); x44 = float(abs(m[0] + (44 - m[1]) * dv[0] / dv[1])) if abs(dv[1]) > 1e-9 else float("nan")
            else: ang = x44 = float("nan")
            l = li[np.sign(li[:, 0]) == sgn] if len(li) else np.zeros((0, 2))
            if len(l) and len(c):
                j = l[:, 1].argmin(); lend = l[j]; dist = float(np.min(np.hypot(c[:, 0] - lend[0], c[:, 1] - lend[1])))
            else: lend = (float("nan"), float("nan")); dist = float("nan")
            row[tag] = dict(nose_tip_x=tip, nose_line_x=tip_line, nose_tangent_x=tang, end_face_angle_to_nose_deg=ang, end_face_x_at_v44=x44, liner_end=[float(lend[0]), float(lend[1])], gap_liner_end_to_cushion=dist)
        row["mouth_tips_0p75"] = row["px"]["nose_tip_x"] + row["nx"]["nose_tip_x"]; row["mouth_nose_line"] = row["px"]["nose_line_x"] + row["nx"]["nose_line_x"]; row["mouth_tangent"] = row["px"]["nose_tangent_x"] + row["nx"]["nose_tangent_x"]
        res["bed%g" % h] = row
    return res

def corner_rows(b: Build, is_model, seed_centre):
    res = {}; r2 = math.sqrt(2)
    for h in HEIGHTS:
        segs, sid = b.cut("corner", h); allp = dense(segs)
        if is_model:
            c0 = np.array(seed_centre); rr = np.hypot(allp[:, 0] - c0[0], allp[:, 1] - c0[1]); seed = (rr > 40) & (rr < 50) & ((allp[:, 0] + allp[:, 1]) > (c0.sum() + 20))
            xc, yc, R, rms, inl = robust_circle(allp, seed, 1.0); li = allp[inl]; rest = allp[~inl]
            cuL = rest[(rest[:, 0] < -3) & (rest[:, 1] > -5) & (rest[:, 1] < 60) & (rest[:, 0] > -160)]; cuS = rest[(rest[:, 1] < -3) & (rest[:, 0] > -5) & (rest[:, 0] < 60) & (rest[:, 1] > -160)]
        else:
            c = b.classes("corner", h); names = b.names
            li = dense(segs[c == "liner"]) if len(segs) else np.zeros((0, 2))
            cu = dense(segs[c == "cushion"]) if len(segs) else np.zeros((0, 2))
            cuL = cu[(cu[:, 0] < -3) & (cu[:, 1] > -5) & (cu[:, 1] < 60)]; cuS = cu[(cu[:, 1] < -3) & (cu[:, 0] > -5) & (cu[:, 0] < 60)]
            if len(li) > 10: xc, yc, R, rms = circfit(li[(li[:, 0] + li[:, 1]) > 30])
            else: xc = yc = R = rms = float("nan")
        ws = wall_split(li, (xc, yc), (li[:, 0] + li[:, 1]) > (xc + yc - 4)) if len(li) > 40 else None
        row = dict(cup_fit_mixed=dict(dx=xc, dy=yc, u=(xc + yc) / r2, R=R, rms=rms), cup_wall_split=ws)
        if ws: row["cup_u_wall_split"] = (ws["centre"][0] + ws["centre"][1]) / r2
        def tip(cu, ax):
            other = 1 - ax; far = cu[(cu[:, other] < -100) & (cu[:, other] > -150)]; vn = float(far[:, ax].min()) if len(far) else float("nan")
            nose = cu[cu[:, ax] <= vn + 0.75]; t = float(nose[:, other].max()) if len(nose) else float("nan")
            online = cu[abs(cu[:, ax] - vn) <= 0.25]; tl = float(online[:, other].max()) if len(online) else float("nan")
            onl = cu[(abs(cu[:, ax] - vn) <= 0.05) & (cu[:, other] <= (t if t == t else 200) + 1)]; tg = float(onl[:, other].max()) if len(onl) else float("nan")  # tangent point = the last nose-line point before the jaw round leaves it toward K
            return vn, t, tl, tg
        vnL, tL, tlL, tgL = tip(cuL, 1); vnS, tS, tlS, tgS = tip(cuS, 0)
        row.update(long_nose_v=vnL, long_tip_dx=tL, long_tip_dx_nose_line=tlL, long_tangent_dx=tgL, short_nose_v=vnS, short_tip_dy=tS, short_tip_dy_nose_line=tlS, short_tangent_dy=tgS)
        row["mouth_tips_0p75"] = float(math.hypot(tL - vnS, vnL - tS)) if not (math.isnan(tL) or math.isnan(tS)) else float("nan")
        row["mouth_nose_line"] = float(math.hypot(tlL - vnS, vnL - tlS)) if not (math.isnan(tlL) or math.isnan(tlS)) else float("nan")
        row["mouth_tangent"] = float(math.hypot(tgL - vnS, vnL - tgS)) if not (math.isnan(tgL) or math.isnan(tgS)) else float("nan")
        for key, cu in (("long", cuL), ("short", cuS)):
            if len(li) and len(cu):
                dd = np.hypot(li[:, 0][:, None] - cu[:, 0][None], li[:, 1][:, None] - cu[:, 1][None]); i, j = np.unravel_index(dd.argmin(), dd.shape)
                row["gap_liner_to_%s_cushion" % key] = float(dd.min()); row["liner_end_near_%s" % key] = [float(li[i, 0]), float(li[i, 1])]; row["cushion_pt_near_%s" % key] = [float(cu[j, 0]), float(cu[j, 1])]
            else: row["gap_liner_to_%s_cushion" % key] = float("nan")
        res["bed%g" % h] = row
    return res

# The MODEL's cushion ends (its rubber is longer than the MFR mouth allows): our facing direction through the model's back-top corner —
# side SP-10 plane point (50.228, y 633.733 → 45.613 behind the nose 588.12); corner CP-12 C end (1163.89, 635.38) → 10.18 into the
# long rail, 47.26 behind. The analytical rubber wedge is historical INFO only;
# row (b) uses the physical source eligibility below, and row (a) judges the actual
# swept liner junction. Owner decision 4A records the MODEL mouth as a deviation;
# it does not exempt any gap or LAW/slit failure.
MODEL_FACE = {"side": (50.228, 633.733 - 588.12), "corner": (1174.07 - 1163.89, 635.38 - 588.12)}
def model_wedge(k, pk, X, Y):
    """mask of the model-rubber-minus-ours wedge in the window frame (middle: x along, v behind; corner: dx, dy about K)."""
    E = cushion_end(k, "side" if pk == "middle" else "corner"); fx = E["B"][0] - E["J"][0]; fy = E["B"][1] - E["J"][1]; face = MODEL_FACE["side" if pk == "middle" else "corner"]
    def ours(along, behind):
        N_, J_, B_ = E["N"], E["J"], E["B"]; lowseg = behind <= J_[1]
        t1 = (behind - N_[1]) / ((J_[1] - N_[1]) or 1e-9); t2 = (behind - J_[1]) / ((B_[1] - J_[1]) or 1e-9)
        edge = np.where(lowseg, N_[0] + t1 * (J_[0] - N_[0]), J_[0] + t2 * (B_[0] - J_[0]))
        return (behind >= 0) & (behind <= E["CW"]) & (along >= edge)
    def model(along, behind): return (behind >= 0) & (behind <= E["CW"]) & (along >= face[0] + (behind - face[1]) * fx / fy)
    if pk == "middle":
        along, behind = np.abs(X), Y; w = model(along, behind) & ~ours(along, behind)
    else:
        w = (model(-X, Y) & ~ours(-X, Y)) | (model(-Y, X) & ~ours(-Y, X))
    return w

def exposed(b: Build, pk, window, k=None, reference=None):
    Z, ID = b.height(pk); j = np.arange(N) + 0.5; i = np.arange(N) + 0.5; X, Y = np.meshgrid(-HALF + j / PPM, HALF - i / PPM)
    x0, x1, y0, y1 = window; zm = (X >= x0) & (X <= x1) & (Y >= y0) & (Y <= y1); zb = Z - BED
    wedge = model_wedge(k, pk, X, Y) if k is not None else np.zeros_like(zm)
    bands = {"pan(<-100)": (zb < -100), "cup(-100..-24)": (zb >= -100) & (zb < -24), "cut_wall(-24..-0.5)": (zb >= -24) & (zb < -0.5), "bed(-0.5..5)": (zb >= -0.5) & (zb < 5),
             "face(5..36)": (zb >= 5) & (zb < 36), "nose(36..39)": (zb >= 36) & (zb < 39), "top(39..42)": (zb >= 39) & (zb < 42), "cap(42..44)": (zb >= 42) & (zb < 44), "rim(>44)": (zb >= 44)}
    out = {k: float((m & zm).sum() * CELL) for k, m in bands.items()}
    # Historical shelf exemption retained ONLY for (b') NET. LITERAL and LAW count these bed-level cloth patches as low.
    shelf = np.zeros_like(zm)
    if b.ids is not None:
        isShelf = np.array([("-shelf" in n) for n in b.names] + [False]); shelf = isShelf[np.where(ID < 0, len(b.names), ID)]
        CL = np.array([cls(n)[0] for n in b.names] + ["none"])[np.where(ID < 0, len(b.names), ID)]; u, c = np.unique(CL[zm], return_counts=True); out["top_class_mm2"] = {str(a): float(v * CELL) for a, v in zip(u, c)}
    out["shelf_patch_mm2"] = float((shelf & zm).sum() * CELL)
    literal = (bands["pan(<-100)"] | bands["cut_wall(-24..-0.5)"] | bands["bed(-0.5..5)"]) & zm
    out["LITERAL_mm2"] = float(literal.sum() * CELL)
    out["literal_wedge_low_mm2"] = float((literal & wedge).sum() * CELL)
    if reference is None:
        physical_rox.refuse('MODEL_MISSING: a physical source reference is mandatory')
    mz, component = reference.height(pk); mz = mz - BED
    eligible = physical_rox.eligibility(mz, component, zm)
    owner = physical_rox.owner_classes(component, mz)
    out["LAW_mm2"] = float((literal & eligible).sum() * CELL)
    out["SLIT_mm2"] = float((bands["pan(<-100)"] & zm & eligible).sum() * CELL)
    # One-round C4 transparency only; these old-definition values never judge FIX3.
    out['historical_LAW_INFO_mm2'] = float((literal & ~wedge).sum() * CELL)
    out['historical_SLIT_INFO_mm2'] = float((bands['pan(<-100)'] & zm & ~wedge).sum() * CELL)
    def counts(mask):
        return {name: int((mask & (owner == name)).sum()) for name in ('return', 'cup', 'notch', 'rubber', 'bed', 'other')}
    out['model_open_counts'] = counts(zm & (mz < -.5))
    out['model_rubber_cells'] = int((zm & (owner == 'rubber')).sum())
    out['excluded_low_counts'] = counts(literal & ~eligible)
    out['excluded_pan_counts'] = counts(bands['pan(<-100)'] & zm & ~eligible)
    out['reference_eligible_cells'] = int((zm & eligible).sum())
    out['model_no_hit_cells'] = 0
    out['reference_band'] = 'MODEL physical top >= -0.5 mm; MODEL rubber is row (a)'
    low = literal & ~shelf
    out["residual_wedge_low_mm2"] = float((low & wedge).sum() * CELL)  # low pixels inside the model-rubber-minus-ours wedge: the ruled mouth difference, row (a)'s domain
    out["EXPOSED_mm2"] = float((low & ~wedge).sum() * CELL); out["window"] = list(window)
    return out

def contact_possible(k, kind, centre_along_behind, Rout):
    E = cushion_end(k, kind); C = centre_along_behind
    dJB = seg_dist(C, E["J"], E["B"]); dNJ = seg_dist(C, E["N"], E["J"]); d = min(dJB, dNJ)
    return dict(possible=bool(d <= Rout), distance_centre_to_end_face=d, Rout=Rout, back_corner_gap=float(math.hypot(E["B"][0] - C[0], E["B"][1] - C[1]) - Rout), E=E)

def a4_redarm(dump, exp):
    # Maintainer C4 ruling: per-pocket rejection; four finite reads remain mandatory.
    rows = []
    for pk, window in (("middle", "middle_px"), ("corner", "corner_long")):
        for code, key in (("b", "LAW_mm2"), ("b''", "SLIT_mm2")):
            value = exp[window][key]; fired = math.isfinite(value) and value > LAW[code]
            rows.append(dict(pocket=pk, window=window, code=code, value=value, limit=LAW[code], fired=fired,
                             status='FIRED' if fired else 'CONTROL' if math.isfinite(value) else 'NOT MEASURED'))
    rejected = {pk: any(r['fired'] for r in rows if r['pocket'] == pk) for pk in ('middle', 'corner')}
    finite = all(math.isfinite(r['value']) for r in rows)
    historical = []
    for r in rows:
        field = 'historical_LAW_INFO_mm2' if r['code'] == 'b' else 'historical_SLIT_INFO_mm2'
        value = exp[r['window']].get(field)
        historical.append(dict(pocket=r['pocket'], window=r['window'], code=r['code'], value=value,
                               limit=r['limit'], status='INFO', historically_red=value is not None and math.isfinite(value) and value > r['limit']))
    return dict(dump=dump, rows=rows, fired=sum(r["fired"] for r in rows), measured=len(rows), must=2,
                required_pocket_rejections=rejected,
                corner_worst_LAW_mm2=max(exp[w]['LAW_mm2'] for w in ('corner_long', 'corner_short')),
                old_four_row_matrix='INFO for FIX3 only; not a binding 4/4 must-fire requirement',
                historical_definition_INFO=historical,
                rule='All four values finite; each pocket rejected by LAW or slit (accepted C4 ruling).',
                reason=C4_REASON, ok=finite and all(rejected.values()))

# ---------------------------------------------------------------- drawing
def draw_overlay(out, pk, h, model: Build, ours: Build, before: Build | None):
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (N, N), (255, 255, 255)); d = ImageDraw.Draw(im); px = lambda p: ((HALF + p[0]) * PPM, (HALF - p[1]) * PPM)
    for g in range(-160, 161, 10):
        c = (235, 235, 235) if g % 50 else (200, 200, 200); d.line([px((g, -160)), px((g, 160))], fill=c); d.line([px((-160, g)), px((160, g))], fill=c)
    d.line([px((-160, 0)), px((160, 0))], fill=(0, 0, 0)); d.line([px((0, -160)), px((0, 160))], fill=(0, 0, 0))
    if before is not None:
        segs, sid = before.cut(pk, h)
        for s_ in segs: d.line([px(s_[0]), px(s_[1])], fill=(185, 185, 185), width=2)
    segs, _ = model.cut(pk, h)
    for s_ in segs: d.line([px(s_[0]), px(s_[1])], fill=(0, 0, 0), width=2)
    segs, sid = ours.cut(pk, h)
    for s_, i in zip(segs, sid): d.line([px(s_[0]), px(s_[1])], fill=cls(ours.names[i])[1], width=2)
    d.text((4, 4), "%s plan cut bed+%g mm — black = purchased model, grey = before (%s), colours = %s: blue cushion, magenta liner, orange flange, red plate, green cloth/cut, gray cap; 2 px/mm, origin %s" % (pk, h, before.tag if before else "-", ours.tag, "(0, nose line)" if pk == "middle" else "K"), fill=(0, 0, 0))
    im.save(os.path.join(out, "plan_%s_bed%g.png" % (pk, h)))

def draw_topdown(out, pk, model: Build, ours: Build, before: Build | None):
    from PIL import Image, ImageDraw
    def band(Z):
        zb = Z - BED; im = np.zeros(Z.shape + (3,), np.uint8) + 255
        im[zb < -100] = (0, 0, 0); im[(zb >= -100) & (zb < -24)] = (60, 60, 60); im[(zb >= -24) & (zb < -0.5)] = (0, 120, 0); im[(zb >= -0.5) & (zb < 5)] = (60, 200, 60)
        im[(zb >= 5) & (zb < 36)] = (120, 160, 255); im[(zb >= 36) & (zb < 39)] = (30, 90, 220); im[(zb >= 39) & (zb < 42)] = (255, 200, 80); im[(zb >= 42) & (zb < 44)] = (255, 140, 0); im[zb >= 44] = (200, 0, 200); return im
    panels = []; labels = []
    if before is not None: panels.append(band(before.height(pk)[0])); labels.append("BEFORE (%s) height bands" % before.tag)
    panels.append(band(ours.height(pk)[0])); labels.append("AFTER (%s) height bands" % ours.tag)
    panels.append(band(model.height(pk)[0])); labels.append("MODEL height bands")
    gap = np.zeros((N, 6, 3), np.uint8); im = panels[0]
    for p in panels[1:]: im = np.hstack([im, gap, p])
    img = Image.fromarray(im); d = ImageDraw.Draw(img)
    for i, l in enumerate(labels): d.text((i * (N + 6) + 4, 4), l, fill=(255, 255, 255))
    d.text((4, N - 14), "z-bed: <-100 black, -100..-24 dark grey (cup), -24..-0.5 dark green (cut wall), bed light green, 5..36 light blue, 36..39 blue (nose), 39..42 tan, 42..44 orange (cap/flange), >44 magenta (rim)", fill=(255, 255, 255))
    img.save(os.path.join(out, "topdown_%s.png" % pk))

# ---------------------------------------------------------------- judge
def judge(tag, k, mid_o, mid_m, cor_o, cor_m, exp_o, exp_m):
    rows = []
    def row(pk, code, name, value, limit, ref, status=None, note=""):
        finite = value == value and value not in (float("inf"), float("-inf")); ok = (value <= limit) if finite else False
        if status is None: status = ("PASS" if ok else "FAIL") if finite else "NOT MEASURED"  # a nan is a missing measurement, not a failure: it can never PASS and it can never FIRE a red arm
        rows.append(dict(pocket=pk, code=code, row=name, value=value, limit=limit, model=ref, status=status, note=note)); return ok
    # middle
    m36 = mid_o["bed36"]; M36 = mid_m["bed36"]; m20 = mid_o["bed20"]; M20 = mid_m["bed20"]
    ws_o = m36["cup_wall_split"] or mid_o["bed34"]["cup_wall_split"]; ws_m = M36["cup_wall_split"] or mid_m["bed34"]["cup_wall_split"]
    co = ws_o["centre"] if ws_o else (m36["cup_fit_mixed"]["xc"], m36["cup_fit_mixed"]["vc"]); cm = ws_m["centre"] if ws_m else (M36["cup_fit_mixed"]["xc"], M36["cup_fit_mixed"]["vc"])
    Rout_o = ws_o["outer"]["R"] if ws_o else float("nan")
    cp = contact_possible(k, "side", (0.0, co[1]), Rout_o)  # Historical circle estimate, returned as INFO only.
    gaps = [mid_o["bed%g" % h][t]["gap_liner_end_to_cushion"] for h in HEIGHTS for t in ("px", "nx")]; gap = float(np.nanmax(gaps))
    row("middle", "a", "liner end -> cushion end face (2-D, max over heights/sides)", gap, LAW["a"], MODEL_REF["gap"],
        note="Current swept liner/cushion sections are judged. The historical unswept-circle contact estimate is INFO only.")
    def b_rows(pk, sides, win_txt):
        ro = [exp_o[w]["LITERAL_mm2"] for w in sides]; rm = [exp_m[w]["LITERAL_mm2"] for w in sides]
        row(pk, "b LITERAL", "LITERAL — every bed-level + cut-wall + pan cell in %s, worst side (INFO; no exclusions)" % win_txt, max(ro), LITERAL_RATCHET[pk],
            "ours raw %s; model raw %s; of ours: shelf patches (bed-level cloth, mats.cloth, if present) %s, literal low inside the model-rubber wedge (row (a)'s domain) %s, pan %s" % (
            " / ".join("%.1f" % v for v in ro), " / ".join("%.1f" % v for v in rm), " / ".join("%.1f" % exp_o[w]["shelf_patch_mm2"] for w in sides), " / ".join("%.1f" % exp_o[w]["literal_wedge_low_mm2"] for w in sides), " / ".join("%.1f" % exp_o[w]["pan(<-100)"] for w in sides)), status="INFO",
            note="FIX3 C3: LITERAL remains INFO; the separate pre-A4 ratchet is binding.")
        row(pk, 'b ratchet', 'LITERAL may not exceed the sealed pre-A4 worst side', max(ro), LITERAL_RATCHET[pk],
            'b48: middle 40.0 / corner 133.0 mm2', note='No reference/wedge/shelf exemption in this ratchet.')
        row(pk, "b", "LAW — OURS low AND physical MODEL top >= -0.5, except MODEL rubber", max(exp_o[w]["LAW_mm2"] for w in sides), LAW["b"],
            "ours %s" % " / ".join("%.2f" % exp_o[w]["LAW_mm2"] for w in sides),
            note="FIX3 C1-C3: physical source domain only; no-hit REFUSES; model-open and model-rubber exclusions disclosed by owner.")
        row(pk, "b''", "slit — OURS pan at the same physical-reference eligible cells", max(exp_o[w]["SLIT_mm2"] for w in sides), LAW["b''"],
            "ours %s" % " / ".join("%.2f" % exp_o[w]["SLIT_mm2"] for w in sides))
        net = max(0.0, max(exp_o[w]["EXPOSED_mm2"] - exp_m[w]["EXPOSED_mm2"] for w in sides))
        row(pk, "b'", "the same window, NET of three named redefinitions (INFO, not judged): our bed-level shelf patches counted as a top, the low pixels inside the model-rubber-minus-ours wedge removed (row (a)'s domain), the model's own low area in the same window subtracted", net, LAW["b"],
            "ours net %s; model own %s" % (" / ".join("%.1f" % exp_o[w]["EXPOSED_mm2"] for w in sides), " / ".join("%.1f" % exp_m[w]["EXPOSED_mm2"] for w in sides)), status="INFO")
    b_rows("middle", ("middle_px", "middle_nx"), "(x 45..75, v 38..70; +x / -x)")
    row("middle", "c", "cup centre vs the model's (wall-split fits, mm)", float(math.hypot(co[0] - cm[0], co[1] - cm[1])) if ws_o and ws_m else float("nan"), LAW["c"], "ours v %.2f / model v %.2f" % (co[1], cm[1]))
    rakes = [abs(m20[t]["nose_tip_x"] - m36[t]["nose_tip_x"]) for t in ("px", "nx")]; rake = float(np.nanmax(rakes)) if any(v == v for v in rakes) else float("nan"); rake_m = abs(M20["px"]["nose_tip_x"] - M36["px"]["nose_tip_x"])
    row("middle", "d", "end-face rake beyond the model's own nose bulge: abs(rake_ours - rake_model), rake = abs(tip x(bed+20) - tip x(bed+36)), worst FINITE side (a side whose tip is not found is reported, not scored)", float(abs(rake - rake_m)), LAW["d"],
        "ours +x %s / -x %s / model %.2f" % tuple(["%.2f" % v if v == v else "tip not found" for v in rakes] + [rake_m]))
    row("middle", "e", "mouth between the jaw rounds' nose-line tangent points (bed+36) vs the ruled source SP-01 127", float(abs(m36["mouth_tangent"] - k["sideMouth"])), LAW["e"], "model %.2f tangent / %.2f tips — the kernel-vs-model mouth conflict, ruled for the MFR" % (M36["mouth_tangent"], M36["mouth_tips_0p75"]))
    # corner
    c36 = cor_o["bed36"]; C36 = cor_m["bed36"]; c20 = cor_o["bed20"]; C20 = cor_m["bed20"]
    wso = c36["cup_wall_split"] or cor_o["bed34"]["cup_wall_split"]; wsm = C36["cup_wall_split"] or cor_m["bed34"]["cup_wall_split"]
    co2 = wso["centre"] if wso else (c36["cup_fit_mixed"]["dx"], c36["cup_fit_mixed"]["dy"]); cm2 = wsm["centre"] if wsm else (C36["cup_fit_mixed"]["dx"], C36["cup_fit_mixed"]["dy"])
    Rout2 = wso["outer"]["R"] if wso else float("nan")
    cp2 = contact_possible(k, "corner", (-co2[0], co2[1]), Rout2)  # Historical circle estimate, INFO only.
    gaps2 = [cor_o["bed%g" % h]["gap_liner_to_%s_cushion" % s] for h in HEIGHTS for s in ("long", "short")]; gap2 = float(np.nanmax(gaps2))
    row("corner", "a", "liner end -> cushion end face (2-D, max over heights/rails)", gap2, LAW["a"], "0.03-0.26",
        note="Current swept liner/cushion sections are judged. The historical unswept-circle contact estimate is INFO only.")
    b_rows("corner", ("corner_long", "corner_short"), "beside the long / short cushion ends (dx -45..0, dy 38..70 and its mirror)")
    row("corner", "c", "cup centre vs the model's (wall-split fits, mm)", float(math.hypot(co2[0] - cm2[0], co2[1] - cm2[1])) if wso and wsm else float("nan"), LAW["c"], "ours u %.2f / model u %.2f" % ((co2[0] + co2[1]) / math.sqrt(2), (cm2[0] + cm2[1]) / math.sqrt(2)))
    rakes2 = [abs(c20["long_tip_dx"] - c36["long_tip_dx"]), abs(c20["short_tip_dy"] - c36["short_tip_dy"])]; rake2 = float(np.nanmax(rakes2)) if any(v == v for v in rakes2) else float("nan"); rake2_m = abs(C20["long_tip_dx"] - C36["long_tip_dx"])
    row("corner", "d", "end-face rake beyond the model's own nose bulge: abs(rake_ours - rake_model) (the 51 deg facing turns the K-55 nose inset into a long tip run on both tables), worst FINITE rail", float(abs(rake2 - rake2_m)), LAW["d"],
        "ours long %s / short %s / model %.2f" % tuple(["%.2f" % v if v == v else "tip not found" for v in rakes2] + [rake2_m]))
    row("corner", "e", "mouth between the jaw rounds' nose-line tangent points (bed+36) vs the ruled source CP-01 114.3", float(abs(c36["mouth_tangent"] - k["cornerMouth"])), LAW["e"], "model %.2f tangent / %.2f tips" % (C36["mouth_tangent"], C36["mouth_tips_0p75"]))
    law_fail = [r for r in rows if r["status"] == "FAIL"]
    return rows, law_fail, dict(middle=cp, corner=cp2)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dump", required=True); ap.add_argument("--out", required=True); ap.add_argument("--cache", default="/tmp/ox-a2/align/cache")
    ap.add_argument("--before"); ap.add_argument("--redarm"); ap.add_argument("--redarm-a4"); ap.add_argument("--judge", action="store_true"); a = ap.parse_args()
    out = a.out; os.makedirs(out, exist_ok=True); k = load_rows(); cache = Path(a.cache)
    if not (cache / "V.npy").exists(): print("REFUSE: model cache %s has no V.npy (the purchased OBJ must be extracted through the align cache first)" % cache); sys.exit(2)
    model = model_build(cache); print("[planlaw] model nose lines NY %.3f NX %.3f" % (model.NY, model.NX))
    ours = ours_build(a.dump, Path(a.dump).stem, k); print("[planlaw] ours %s: %d meshes, kernel %s, error rows %s" % (ours.tag, len(ours.names), str(ours.dump.get("kernel_console"))[:40], ours.dump.get("app_error_rows")))
    if sum(1 for n in ours.names if n.startswith("dm-cushion")) < 6: print("REFUSE: fewer than 6 dm-cushion meshes in the dump"); sys.exit(2)
    before = ours_build(a.before, Path(a.before).stem, k) if a.before else None
    def measure(b, is_model):
        mid = middle_rows(b, is_model); cor = corner_rows(b, is_model, (32.3, 31.6))
        exp = {"middle_px": exposed(b, "middle", (45, 75, 38, 70), k, model), "middle_nx": exposed(b, "middle", (-75, -45, 38, 70), k, model),
               "corner_long": exposed(b, "corner", (-45, 0, 38, 70), k, model), "corner_short": exposed(b, "corner", (38, 70, -45, 0), k, model)}
        return mid, cor, exp
    mid_m, cor_m, exp_m = measure(model, True); mid_o, cor_o, exp_o = measure(ours, False)
    rows, fails, cps = judge(ours.tag, k, mid_o, mid_m, cor_o, cor_m, exp_o, exp_m)
    for pk in ("middle", "corner"):
        for h in HEIGHTS: draw_overlay(out, pk, h, model, ours, before)
        draw_topdown(out, pk, model, ours, before)
    arm = None
    if a.redarm:
        red = ours_build(a.redarm, Path(a.redarm).stem, k); mid_r, cor_r, exp_r = measure(red, False)
        rrows, rfails, _ = judge(red.tag, k, mid_r, mid_m, cor_r, cor_m, exp_r, exp_m)
        must = [("middle", "b"), ("middle", "c"), ("middle", "d"), ("corner", "b"), ("corner", "c"), ("corner", "d")]
        fired = [(p, c) for (p, c) in must if any(r["pocket"] == p and r["code"] == c and r["status"] == "FAIL" for r in rrows)]
        arm = dict(dump=a.redarm, rows=rrows, must=must, fired=fired, ok=len(fired) == len(must))
    arm_a4 = None
    if a.redarm_a4:
        red = ours_build(a.redarm_a4, Path(a.redarm_a4).stem, k); _, _, exp_r = measure(red, False)
        arm_a4 = a4_redarm(a.redarm_a4, exp_r)
    res = dict(tool="planlaw_rox.py", protocol='FIX3-physical-MODEL', law=LAW, literal_ratchet=LITERAL_RATCHET,
               physical_reference=model.reference_metadata, ours=ours.tag, model=dict(NY=model.NY, NX=model.NX), rows=rows, contact=cps, middle=dict(ours=mid_o, model=mid_m), corner=dict(ours=cor_o, model=cor_m), exposed=dict(ours=exp_o, model=exp_m), redarm=arm, redarm_a4=arm_a4)
    json.dump(res, open(os.path.join(out, "planlaw.json"), "w"), indent=1, default=float)
    L = ["# PLANLAW-ROX — FIX3 physical-MODEL LAW", "", "ours `%s` vs the purchased model (physical source domain, unchanged cache); heights bed+%s; 0.25 mm cuts; 2 px/mm windows." % (ours.tag, " / ".join("%g" % h for h in HEIGHTS)), "",
         "| pocket | row | value | limit | model | status | note |", "|---|---|---|---|---|---|---|"]
    for r in rows: L.append("| %s | (%s) %s | %.2f | %.1f | %s | **%s** | %s |" % (r["pocket"], r["code"], r["row"], r["value"], r["limit"], r["model"], r["status"], r["note"]))
    if arm: L += ["", "Red arm on `%s`: %d/%d must-fire rows FIRED — %s" % (Path(a.redarm).stem, len(arm["fired"]), len(arm["must"]), "OK" if arm["ok"] else "NOT ARMED"), "", "| pocket | row | value | status |", "|---|---|---|---|"] + ["| %s | (%s) | %.2f | %s |" % (r["pocket"], r["code"], r["value"], r["status"]) for r in arm["rows"]]
    if arm_a4:
        L += ["", "FIX3 b48 control `%s`: pocket rejections %s — %s. New-definition four-row matrix INFO: %d/%d FIRED; a CONTROL is not an arm." % (Path(a.redarm_a4).stem, arm_a4['required_pocket_rejections'], "OK" if arm_a4["ok"] else "NOT ARMED", arm_a4["fired"], arm_a4["measured"]), "", C4_REASON, "", "| window | row | value | limit | status |", "|---|---|---|---|---|"]
        L += ["| %s | (%s) | %.2f | %.1f | %s |" % (r["window"], r["code"], r["value"], r["limit"], r["status"]) for r in arm_a4["rows"]]
        L += ["", "Corner LAW: %.2f long / %.2f worst mm²." % (exp_r['corner_long']['LAW_mm2'], arm_a4['corner_worst_LAW_mm2'])]
        L += ['', 'Old definition, four-row matrix **INFO only** (not the FIX3 verdict):', '',
              '| Window | Row | Old value | Old limit | Historical RED |', '|---|---|---|---|---|']
        L += ['| %s | %s | %s | %.1f | %s |' % (r['window'], r['code'], r['value'], r['limit'], r['historically_red']) for r in arm_a4['historical_definition_INFO']]
    L += ["", "Model reads at bed+36 (middle): cup v %.2f R %.2f; nose tip %.2f; mouth (tips) %.2f. Ours: cup v %.2f; nose tip %.2f; mouth (nose line) %.2f, (tips) %.2f." % (
        mid_m["bed36"]["cup_wall_split"]["centre"][1] if mid_m["bed36"]["cup_wall_split"] else float("nan"), mid_m["bed36"]["cup_fit_mixed"]["R"], mid_m["bed36"]["px"]["nose_tip_x"], mid_m["bed36"]["mouth_tips_0p75"],
        mid_o["bed36"]["cup_wall_split"]["centre"][1] if mid_o["bed36"]["cup_wall_split"] else float("nan"), mid_o["bed36"]["px"]["nose_tip_x"], mid_o["bed36"]["mouth_nose_line"], mid_o["bed36"]["mouth_tips_0p75"])]
    L += ['', '## Physical-reference exclusions (counts, each cell 0.25 mm²)', '',
          '| Window | All MODEL-open by owner | Excluded OURS-low by owner | Excluded pan by owner | MODEL rubber cells | No hit |',
          '|---|---|---|---|---|---|']
    for key, e in exp_o.items():
        L.append('| %s | %s | %s | %s | %d | %d |' % (key, e['model_open_counts'], e['excluded_low_counts'], e['excluded_pan_counts'], e['model_rubber_cells'], e['model_no_hit_cells']))
    open(os.path.join(out, "PLANLAW-ROX.md"), "w").write("\n".join(L) + "\n")
    for r in rows: print("  %-8s %-7s (%s) %-70s %8.2f <= %4.1f  model %-28s %s" % (r["status"], r["pocket"], r["code"], r["row"][:70], r["value"], r["limit"], str(r["model"])[:28], ("— " + r["note"][:110]) if r["note"] else ""))
    for key in ("middle_px", "middle_nx", "corner_long", "corner_short"):
        e = exp_o[key]; print("  exposed %-12s LITERAL %.2f; LAW %.2f; slit %.2f; literal wedge %.2f; shelf %.2f; historical NET input %.2f mm2" % (key, e["LITERAL_mm2"], e["LAW_mm2"], e["SLIT_mm2"], e["literal_wedge_low_mm2"], e["shelf_patch_mm2"], e["EXPOSED_mm2"]))
        print('  reference %-12s open %s; excluded low %s; excluded pan %s; MODEL rubber %d; no-hit %d' % (key, e['model_open_counts'], e['excluded_low_counts'], e['excluded_pan_counts'], e['model_rubber_cells'], e['model_no_hit_cells']))
    if arm: print("[planlaw] red arm %s: %d/%d fired" % (Path(a.redarm).stem, len(arm["fired"]), len(arm["must"])), "OK" if arm["ok"] else "NOT ARMED")
    if arm_a4:
        for r in arm_a4["rows"]: print("[planlaw] b48 %-12s (%s) %.2f / limit %.1f: %s" % (r["window"], r["code"], r["value"], r["limit"], r['status']))
        print("[planlaw] FIX3 b48 PER POCKET %s; new-definition four-row matrix INFO %d/%d FIRED; corner LAW worst %.2f" % (arm_a4['required_pocket_rejections'], arm_a4["fired"], arm_a4["measured"], arm_a4['corner_worst_LAW_mm2']))
        print('[planlaw] C4 reason: ' + C4_REASON)
        for r in arm_a4['historical_definition_INFO']:
            print('[planlaw] old-definition INFO %-12s (%s) %s / limit %.1f; historical RED=%s (not a FIX3 arm)' % (r['window'], r['code'], r['value'], r['limit'], r['historically_red']))
    armed = (arm is None or arm["ok"]) and (arm_a4 is None or arm_a4["ok"])
    verdict = "PLANLAW GATE %s" % ("OK" if not fails and armed else "RED"); print(verdict)
    if a.judge and (fails or not armed): sys.exit(1)

if __name__ == "__main__":
    try:
        main()
    except (physical_rox.PhysicalReferenceRefused, physical_rox.pocket_reference.ReferenceRefused) as exc:
        print('REFUSED:', exc)
        sys.exit(2)
