# Copyright (c) Meta Platforms, Inc. and affiliates.

"""ours — loader for the LIVE-scene dump written by tools/render/ghrox/dump_rox_scene.mjs.

Dump: {units:'m', up:'Y', frame:'three.js world of the app: x = kernel ky (along the LENGTH), y = height (bed cloth top
= 0), z = kernel kx (across the WIDTH)', meshes:[{name, parent, ancestor, inTable, matName, hex, verts, tris,
positions:[flat xyz world metres], indices:[...]}]}.

Transform to the model (lane A1) frame, millimetres:
    X_m = 1000 * x_o
    Y_m = +1000 * z_o          (Y_SIGN = +1: the lane's +Y IS the app's +z = kernel kx.  This makes the map an
                                IMPROPER rotation (det -1, a mirror across the width); the table is mirror-symmetric in
                                width so it has no geometric consequence, and the +X+Y model corner is compared with the
                                +x+z app corner.  Recorded here and in every report.)
    Z_m = 1000 * (y_o - y_bed_o) + 785.828   (both bed cloth tops coincide; y_bed_o is MEASURED from the dump, 0.0 by
                                the dump's own convention)
Selection: by name prefix ('dm-<part>') where the builders name their meshes, by spatial window otherwise.
"""
import json, hashlib, os
import numpy as np
import objsoup
import pocket_reference

Y_SIGN = +1.0
TRANSFORM_NOTE = ("X_m = 1000*x_o ; Y_m = +1000*z_o ; Z_m = 1000*(y_o - y_bed_o) + 785.828  (Y_SIGN=+1: lane +Y = app +z = kernel kx; "
                  "improper rotation det -1 = width mirror, no geometric consequence on a width-symmetric table)")

class Dump:
    def __init__(self, path, reference_path=pocket_reference.DEFAULT):
        self.reference = pocket_reference.load(reference_path)
        self.path = path
        raw = open(path, "rb").read(); self.sha256 = hashlib.sha256(raw).hexdigest()
        d = json.loads(raw); self.meta = {k: v for k, v in d.items() if k != "meshes"}
        self.meshes = []
        for i, m in enumerate(d["meshes"]):
            P = np.asarray(m["positions"], float).reshape(-1, 3)
            F = np.asarray(m["indices"], np.int64).reshape(-1, 3) if m.get("indices") else np.arange(len(P)).reshape(-1, 3)
            self.meshes.append(dict(i=i, name=m.get("name") or "", parent=m.get("parent"), hex=m.get("hex"), matName=m.get("matName"),
                                    P_o=P, F=F, tris=int(len(F))))
        self.y_bed_o = self._measure_bed_o()
        for m in self.meshes:
            P = m["P_o"]
            m["V"] = np.stack([1000.0 * P[:, 0], Y_SIGN * 1000.0 * P[:, 2], 1000.0 * (P[:, 1] - self.y_bed_o) + objsoup.BEDTOP], 1)
        self.datums = self._datums()

    # -------------------------------------------------------------- datums measured from the dump ---------------
    def _measure_bed_o(self):
        """Bed cloth top in dump units: the 'dm-bed-cloth' mesh's top plane if present, else the largest horizontal face
        area inside |x|<1.0, |z|<0.5 within y -0.02..0.02."""
        bed = [m for m in self.meshes if m["name"].startswith("dm-bed-cloth")]
        if bed:
            return float(np.median(np.concatenate([m["P_o"][:, 1] for m in bed])))
        best = (0.0, 0.0)
        for m in self.meshes:
            T = m["P_o"][m["F"]]; n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); a = np.linalg.norm(n, axis=1) / 2
            ny = np.abs(n[:, 1]) / np.maximum(2 * a, 1e-12); c = T.mean(1)
            sel = (ny > 0.999) & (np.abs(c[:, 0]) < 1.0) & (np.abs(c[:, 2]) < 0.5) & (np.abs(c[:, 1]) < 0.02)
            if sel.any() and a[sel].sum() > best[0]: best = (a[sel].sum(), float(np.median(c[sel, 1])))
        return best[1]

    def select(self, prefixes=None, box=None, exclude=("dm-spot",)):
        """Meshes whose name starts with one of prefixes; or (box given, global mm frame) meshes with any vertex inside."""
        out = []
        for m in self.meshes:
            if any(m["name"].startswith(e) for e in exclude): continue
            if prefixes is not None and any(m["name"].startswith(p) for p in prefixes): out.append(m); continue
            if box is not None and prefixes is None:
                V = m["V"]; h0, h1, v0, v1, w0, w1 = box
                if ((V[:, 0] >= h0) & (V[:, 0] <= h1) & (V[:, 1] >= v0) & (V[:, 1] <= v1) & (V[:, 2] >= w0) & (V[:, 2] <= w1)).any(): out.append(m)
        return out

    def tris(self, meshes=None, exclude_decals=True):
        """All triangles (m,3,3) in the model frame (decal spots excluded)."""
        if meshes is None: meshes = [m for m in self.meshes if not (exclude_decals and m["name"].startswith("dm-spot"))]
        if not meshes: return np.zeros((0, 3, 3))
        return np.concatenate([m["V"][m["F"]] for m in meshes])

    def comparison_datums(self, anchor):
        """Only pocket comparisons use FIX2; non-pocket registration is unchanged."""
        for kind in ('corner', 'side'):
            if tuple(self.datums['cup_' + kind]) != self.reference.axis(kind):
                pocket_reference.refuse('REFERENCE_OURS_FITTED_REFUSED',
                                        f'cup_{kind} differs from the fixed MODEL reference')
        return self.reference.datums(self.datums) if anchor in pocket_reference.POCKET_ANCHORS else self.datums

    def comparison_vertices(self, mesh, anchor):
        if anchor not in pocket_reference.POCKET_ANCHORS:
            return mesh['V']
        # Undo ONLY the legacy measured-bed re-zero: this is algebraically
        # [1000*x_o, 1000*z_o, 1000*(y_o-reference.ours_bed_y_m)+reference.bed].
        # Hence moving a bed mesh cannot move the pocket comparison origin.
        return mesh['V'] + np.array([0.0, 0.0, 1000 * (self.y_bed_o - self.reference.ours_bed_y_m)])

    def comparison_tris(self, anchor, meshes=None):
        if meshes is None:
            meshes = [m for m in self.meshes if not m['name'].startswith('dm-spot')]
        if not meshes:
            return np.zeros((0, 3, 3))
        return np.concatenate([self.comparison_vertices(m, anchor)[m['F']] for m in meshes])

    def observe_wall_axis(self, name, kind):
        """Physical placement only: named wall's inner bottom row, never a datum.

        These builders emit four vertices per angular station: inner bottom,
        inner top, outer top, outer bottom. A changed/absent layout is disclosed
        as unavailable, not replaced with a floor/pan fit or reference value.
        """
        wall = next((m for m in self.meshes if m['name'] == name), None)
        unavailable = dict(mesh=name, axis_xy_mm=None, status='ABSENT or unrecognized wall topology; no observation fallback')
        if wall is None or len(wall['V']) < 12 or len(wall['V']) % 4:
            return unavailable
        rows = wall['V'].reshape(-1, 4, 3)
        if not (np.allclose(rows[:, 0, :2], rows[:, 1, :2], rtol=0, atol=1e-8)
                and np.allclose(rows[:, 2, :2], rows[:, 3, :2], rtol=0, atol=1e-8)):
            return unavailable
        xy = rows[:, 0, :2]
        centre = xy.mean(0); p = xy - centre
        fit, _, rank, _ = np.linalg.lstsq(np.c_[2 * p, np.ones(len(p))], (p * p).sum(1), rcond=None)
        if rank < 3 or fit[2] + (fit[:2] ** 2).sum() <= 0:
            return unavailable
        axis = fit[:2] + centre; radius = float(np.sqrt(fit[2] + (fit[:2] ** 2).sum()))
        delta = axis - self.reference.axis(kind)
        return dict(mesh=name, axis_xy_mm=axis.tolist(), radius_mm=radius,
                    rms_mm=float(np.sqrt(np.mean((np.linalg.norm(xy - axis, axis=1) - radius) ** 2))),
                    delta_from_fixed_reference_xy_mm=delta.tolist(), delta_norm_mm=float(np.linalg.norm(delta)),
                    status='OBSERVATION ONLY; never used for comparison registration',
                    rule='inner-bottom row of the named C/ring wall; floor-independent circle fit')

    def _datums(self):
        """Nose lines by the model's rule (plane cut at bed+35.3; innermost cushion point), plan centre, foot centroid, sight."""
        T = self.tris(); noses = objsoup.nose_lines(T)
        xn = noses["short_plus"] if noses["short_plus"] is not None else objsoup.NX * objsoup.EN07[0]
        yn = noses["long_plus"] if noses["long_plus"] is not None else objsoup.NY * objsoup.EN07[1]
        # foot: area centroid of the horizontal faces at 0 < z < 26 in the +X+Y quadrant (pads / leveller bottoms)
        n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); a = np.linalg.norm(n, axis=1) / 2; c = T.mean(1)
        sel = (c[:, 2] > -1) & (c[:, 2] < 26) & (c[:, 0] > 0) & (c[:, 1] > 0) & (np.abs(n[:, 2]) / np.maximum(2 * a, 1e-12) > 0.9)
        if sel.any() and a[sel].sum() > 1:
            foot = tuple(float(v) for v in (c[sel, :2] * a[sel, None]).sum(0) / a[sel].sum())
        else:   # no pad faces: fall back to the lowest geometry's plan centre in that quadrant, else the scaled model foot
            low = (c[:, 2] < 60) & (c[:, 0] > 0) & (c[:, 1] > 0)
            foot = tuple(float(v) for v in c[low, :2].mean(0)) if low.any() else (objsoup.FOOT_CENTROID[0] * objsoup.EN07[0], objsoup.FOOT_CENTROID[1] * objsoup.EN07[1])
        # sight: first +Y long-rail sight with x > 20 (dm-sight-* by name, else the scaled model position)
        sights = self.select(prefixes=["dm-sight"])
        ms = objsoup.model_sight_anchor(); sight = (ms[0] * objsoup.EN07[0], ms[1] * objsoup.EN07[1])
        cand = [(m["V"][:, :2].mean(0)) for m in sights if m["V"][:, 1].mean() > 400 and m["V"][:, 0].mean() > 20]
        if cand:
            cand = sorted(cand, key=lambda p: p[0]); sight = (float(cand[0][0]), float(cand[0][1]))
        # FIX2: immutable reference axes; all OURS fits/centroids are separate
        # observations. Neither absent furniture nor remeshed floors can move it.
        cc = [m for m in self.meshes if m["name"] == "dm-pocket-rox-corner-pxpz-pan"]
        cs = [m for m in self.meshes if m["name"] == "dm-pocket-rox-side-pz-pan"]
        pan_corner = tuple(float(v) for v in cc[0]["V"][:, :2].mean(0)) if cc else None; pan_side = tuple(float(v) for v in cs[0]["V"][:, :2].mean(0)) if cs else None
        cup_corner = self.reference.axis('corner'); cup_side = self.reference.axis('side')
        self.kernel_axes = dict(corner=pan_corner, side=pan_side)
        self.cup_observations = dict(corner=self.observe_wall_axis('dm-pocket-rox-corner-pxpz-cup-c', 'corner'),
                                     side=self.observe_wall_axis('dm-pocket-rox-side-pz-cup-ring', 'side'))
        oe = objsoup.outer_edges(T)
        yo = oe["y_outer"] if oe["y_outer"] is not None else objsoup.Y_OUTER * objsoup.EN07[1]; xo = oe["x_outer"] if oe["x_outer"] is not None else objsoup.X_OUTER * objsoup.EN07[0]
        return dict(bed=objsoup.BEDTOP, x_nose=float(xn), y_nose=float(yn), K=(float(xn), float(yn)), foot=foot, sight=sight, y_outer=float(yo), x_outer=float(xo), cup_corner=cup_corner, cup_side=cup_side,
                    cup_rule='FIX2: fixed MODEL CP-12/SP-12 + A1 nose/bed + PF-01; physical wall and kernel axes are observations only',
                    noses=noses, y_bed_o=self.y_bed_o, foot_rule="area centroid of horizontal faces 0<z<26 in +X+Y" if (sel.any() and a[sel].sum() > 1) else "fallback (no pad faces)",
                    sight_rule="dm-sight-* nearest the centre on the +Y long rail" if cand else "fallback: model sight x EN-07")

    def summary(self):
        names = [m["name"] for m in self.meshes]
        return dict(path=self.path, sha256=self.sha256[:16], meshes=len(self.meshes), tris=int(sum(m["tris"] for m in self.meshes)),
                    named=sum(1 for n in names if n), anonymous=sum(1 for n in names if not n),
                    name_prefixes=sorted({n.split("-")[0] + "-" + n.split("-")[1] for n in names if n.count("-") >= 1}),
                    frame=self.meta.get("frame"), units=self.meta.get("units"), kernel=self.meta.get("kernel_console"), table=self.meta.get("table"),
                    pocket_reference=self.reference.metadata(), cup_observations=self.cup_observations, kernel_axes=self.kernel_axes)

def redarm_shift(dump, element_prefixes, box, dz=5.0):
    """Red arm: shift OUR mesh of one element by +dz mm (model Z) — by name if the prefixes match, else by window."""
    ms = dump.select(prefixes=element_prefixes) if element_prefixes else []
    if not ms: ms = dump.select(box=box)
    for m in ms: m["V"] = m["V"] + np.array([0.0, 0.0, dz])
    dump.datums = dump._datums()
    return [m["name"] or f"anon#{m['i']}" for m in ms]

if __name__ == "__main__":
    import sys
    d = Dump(sys.argv[1] if len(sys.argv) > 1 else "/tmp/ox-a2/dump/skeleton.json")
    print(json.dumps(d.summary(), indent=1)); print(json.dumps(d.datums, indent=1, default=str))
    A = d.tris().reshape(-1, 3); print("bbox mm", A.min(0).round(2), A.max(0).round(2))
