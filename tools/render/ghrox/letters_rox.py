#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""letters_rox.py — GH-641 A2 (Rasson OX 9 ft): the AS-MODELED LETTERS gate for rasson_ox_9ft.

The law it enforces: 图 == JSON == 模型 == 闸门.
  * the DRAWING is generated from the JSON by tools/render/ghrox/gen_drawing_rox.py (this tool runs it first and
    refuses to measure if the generator refuses to draw);
  * the JSON is bound by SHA-256 (recorded; `--expect-sha256` makes a mismatch fatal, exit 4);
  * the MODEL column is MESH-EXTRACTED, always: every as-modeled number is measured off the LIVE scene dump
    (tools/render/ghrox/dump_rox_scene.mjs — world-space triangle soup pulled over CDP from the app), loaded through
    the alignment gate's Dump class (mm, x along the length, y across, z above the bed).  A quantity that cannot be
    measured off that mesh is ABSENT and RED.  No spec number is ever copied into the as-modeled column;
  * the kernel-collision / envelope rows (PF-01, CU-*, CP-*, SP-*, RB-03, RB-07) come from the alignment gate's
    dims module unchanged (the same mesh rules the alignment report prints);
  * the render letters (RB, RC, EN, CU-11, CP-06 / CP-12, SP-06 / SP-12) are measured here, one rule per row, and
    compared against the JSON value in the row's own datum (a2.datum: raw / MFR / PHOTO / EN-07-length / EN-07-width);
  * tolerance: the row's photo_tolerance_mm when it carries one, else the render tolerance 0.5 mm (angles 0.5°);
  * identities are re-witnessed on the MESH (EN-01 = PF-01 + 2·RB, RB-03 = RB − CU-04, CP-02 = 135 + 6,
    SP-02 = 90 + 10, CU-03 = CU-02 / 57.15, RB-07 pitch = PF-01.L / 8, RC-09 = 2);
  * red arms (--redarm) transform the dump and re-measure: a dropped pedestal (RC-09), sights at the model's
    RB-09b inset (RB-07), the model's RB-09 slab along-rail size (RC-17), the arch apex +15.1 (RC-12), the plate
    station +20 (RC-10), the foot plate ×1.1 (RC-15) — each must go RED.

Usage: python3 tools/render/ghrox/letters_rox.py --dump /tmp/ox-a2/dump/b9.json --out /tmp/ox-a2/letters
                [--judge] [--redarm] [--expect-sha256 HEX] [--reference PATH]
"""
import argparse, hashlib, json, math, os, subprocess, sys, time
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, "align"))
import ours, dims, objsoup, pocket_reference  # noqa: E402
import liner_letters_rox  # noqa: E402
BED = objsoup.BEDTOP  # the Dump's z frame carries the bed at 785.828 (model frame); bed-relative letters subtract it
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
JSON_PATH = os.path.join(REPO, "docs/geometry/rasson-ox-9ft-table-definition.json")
GEN = os.path.join(HERE, "gen_drawing_rox.py")
BALL_D = 57.15
RENDER_TOL = 0.5
# rows whose JSON conflict entry keeps the model read against a photo number: reported, not counted as rox failures
ADJUDICATED = {("RC-06", "strip height"): "C19: model lip 22.5 kept against the photo strip 26.88 ± 2"}

def sha256(path):
    h = hashlib.sha256(); h.update(open(path, "rb").read()); return h.hexdigest()

def val(rows, rid, *keys):
    r = rows[rid]; v = r.get("value_mm", r.get("value"))
    for k in keys: v = v[k]
    return v

def num(rows, rid, *keys):
    """val() that tolerates a missing / non-numeric leaf (returns None -> the row reads INFO / absent)."""
    try:
        v = val(rows, rid, *keys)
    except (KeyError, TypeError, IndexError):
        return None
    if isinstance(v, dict):
        for k in ("long", "value", "median", "mean"):
            if isinstance(v.get(k), (int, float)): return v[k]
        return None
    return v if isinstance(v, (int, float)) else None

class Meas:
    """Mesh rules on the dump (mm, bed = 0).  Every method returns a number / list or None (ABSENT)."""
    def __init__(self, dump):
        self.d = dump; self.by = {m["name"]: m for m in dump.meshes if m["name"]}
    def sel(self, prefix):
        return [m for m in self.d.meshes if m["name"].startswith(prefix)]
    def V(self, prefix):
        ms = self.sel(prefix); return np.concatenate([m["V"] for m in ms]) if ms else None
    def floor(self):
        v = self.V("dm-foot-plate-rox"); return None if v is None else float(v[:, 2].min())
    def z_floor(self, z_bed): return None if z_bed is None else z_bed - self.floor()
    # envelope / rails
    def en01(self):
        v = np.concatenate([m["V"] for m in self.d.meshes if not m["name"].startswith("dm-spot")])
        return [round(2 * float(np.abs(v[:, 0]).max()), 3), round(2 * float(np.abs(v[:, 1]).max()), 3)]
    def en02(self):
        cap = self.V("dm-rail-cap-rox"); return None if cap is None else round(float(cap[:, 2].max()) - self.floor(), 3)
    def rb01(self):
        lip = self.V("dm-rail-cap-lip-rox-long"); return None if lip is None else round(float(np.abs(lip[:, 1]).max()) - self.d.datums["y_nose"], 3)
    def rb02(self):
        lip = self.V("dm-rail-cap-lip-rox-short"); return None if lip is None else round(float(np.abs(lip[:, 0]).max()) - self.d.datums["x_nose"], 3)
    def rb04_crest(self):
        cap = self.V("dm-rail-cap-rox"); return None if cap is None else round(float(cap[:, 2].max()) - BED, 3)
    def rb04_inner(self):
        """cap top at the inner edge, and the inner edge's u from the nose (long rail, x = 600 section)."""
        ms = self.sel("dm-rail-cap-rox-long")
        if not ms: return None
        T = self.d.tris(ms); import objsoup
        S = objsoup.section(T, 0, 600.0)
        if len(S) == 0: return None
        P = S.reshape(-1, 3); P = P[P[:, 1] > 0]; u = P[:, 1] - self.d.datums["y_nose"]
        i = int(np.argmin(u)); top = P[np.abs(u - u[i]) < 0.05][:, 2].max()
        return [round(float(u[i]), 3), round(float(top) - BED, 3)]
    def lip_z(self, fam):
        """[top of the vertical outer face, bottom] of the lip piece: vertices on the outer face (max |u|)."""
        lip = self.V(f"dm-rail-cap-lip-rox-{fam}")
        if lip is None: return None
        col = 1 if fam == "long" else 0; u = np.abs(lip[:, col]); face = lip[u > u.max() - 0.05]
        return [round(float(face[:, 2].max()) - BED, 3), round(float(lip[:, 2].min()) - BED, 3)]
    def skin(self):
        """apron skin: outer face setback from the long-rail edge, top z, bottom z; lowest z of the blend rings."""
        a = self.by.get("dm-apron-rox"); bl = self.V("dm-apron-rox-blend")
        if a is None: return None
        V = a["V"]; mid = V[(np.abs(V[:, 0]) < 1300) & (np.abs(V[:, 1]) > 700)]  # the straight long-side run's end vertices (the ring has vertices only at its corner polylines)
        if len(mid) == 0: return None
        face = float(np.abs(mid[:, 1]).max()); setback = (self.d.datums["y_nose"] + self.rb01()) - face
        allv = np.concatenate([V] + ([bl] if bl is not None else [])); near = allv[(np.abs(allv[:, 1]) > face - 1.6) & (np.abs(allv[:, 0]) < 1300)]
        bottom = float(near[:, 2].min()) if len(near) else float(V[:, 2].min())
        return dict(setback=round(setback, 3), top=round(float(V[:, 2].max()) - BED, 3), bottom=round(bottom - BED, 3), skin_ring_bottom=round(float(V[:, 2].min()) - BED, 3), lowest=None if bl is None else round(float(bl[:, 2].min()) - BED, 3), lowest_abs=None if bl is None else float(bl[:, 2].min()), top_abs=float(V[:, 2].max()))
    def trim_proud(self):
        t = self.V("dm-apron-rox-trim"); a = self.by.get("dm-apron-rox")
        if t is None or a is None: return None
        # plan extreme of the strip vs the sharp skin corner (the skin's own max |x| at the corner)
        return round(float(np.abs(t[:, 0]).max()) - float(np.abs(a["V"][:, 0]).max()), 3)
    def badge(self, prefix):
        b = self.V(prefix)
        if b is None: return None
        ext = b.max(0) - b.min(0)
        return dict(x=round(float(ext[0]), 2), y=round(float(ext[1]), 2), height=round(float(ext[2]), 2), z_bottom_floor=round(self.z_floor(float(b[:, 2].min())), 2), z_top_floor=round(self.z_floor(float(b[:, 2].max())), 2))
    # pedestal family
    def ped_meshes(self): return self.sel("dm-pedestal-rox")
    def rc09(self):
        xs = sorted({round(float(np.sign(m["V"][:, 0].mean())), 0) for m in self.ped_meshes()}); return len(xs)
    def rc10(self):
        f = self.sel("dm-foot-plate-rox")
        if not f: return None
        return round(float(np.mean([abs(m["V"][:, 0].mean()) for m in f])), 2)
    def rc11(self, zs=(100, 150, 200, 250, 300, 350, 400, 450, 500, 550)):
        ms = self.ped_meshes(); fl = self.floor()
        if not ms: return None
        V = np.concatenate([m["V"] for m in ms]); out = {}
        for z in zs:
            band = V[np.abs((V[:, 2] - fl) - z) < 6.5]
            out[str(z)] = None if len(band) == 0 else round(2 * float(np.abs(band[:, 1]).max()), 1)
        return out
    def rc12(self):
        ms = self.ped_meshes(); fl = self.floor()
        if not ms: return None
        V = np.concatenate([m["V"] for m in ms]); mid = V[np.abs(V[:, 1]) < 3.0]
        return None if len(mid) == 0 else round(float(mid[:, 2].min()) - fl, 2)
    def rc13(self, station, zs=(105, 305, 505)):
        """inner bow face x (leg band |y| 500..600) on the grid row nearest each floor height, minus the RC-10 plate centre."""
        ms = self.ped_meshes(); fl = self.floor()
        if not ms: return None
        V = np.concatenate([m["V"] for m in ms]); V = V[(V[:, 0] > 0) & (np.abs(V[:, 1]) > 500) & (np.abs(V[:, 1]) < 600)]; out = {}
        zf = V[:, 2] - fl
        for z in zs:
            rows = np.unique(np.round(zf[np.abs(zf - z) < 7], 2))
            if len(rows) == 0: out[str(z)] = None; continue
            zr = rows[np.argmin(np.abs(rows - z))]; band = V[np.abs(zf - zr) < 0.05]
            out[str(z)] = dict(z_row=round(float(zr), 2), x_in_minus_station=round(float(band[:, 0].min()) - station, 2))
        return out
    def rc14(self):
        s = self.V("dm-spandrel-rox"); fl = self.floor()
        if s is None: return None
        mid = s[np.abs(s[:, 0]) < 13.0]  # the panel's profile is sampled every 25 mm along x (sagitta over 12.5 mm at R 2358: 0.03 mm)
        if len(mid) == 0: return None
        crown = float(mid[:, 2].min()) - fl
        under = self.by.get("dm-apron-rox-plate"); depth = None if under is None else (float(under["V"][:, 2].min()) - fl) - crown
        return dict(crown=round(crown, 2), depth=None if depth is None else round(depth, 2))
    def rc15(self):
        f = self.sel("dm-foot-plate-rox")
        if not f: return None
        e = np.array([m["V"].max(0) - m["V"].min(0) for m in f]).mean(0); return dict(length=round(float(e[0]), 2), height=round(float(e[2]), 2), across=round(float(e[1]), 2))
    def rc20(self):
        ms = self.sel("dm-spandrel-rox"); fl = self.floor()
        if not ms: return None
        V = np.concatenate([m["V"] for m in ms]); ay = np.abs(V[:, 1])
        return dict(count=len(ms), y_faces=[round(float(ay.min()), 2), round(float(ay.max()), 2)], thickness=round(float(ay.max() - ay.min()), 2), top_abs=round(float(V[:, 2].max()), 2))
    def rc21(self):
        ms = self.ped_meshes(); fl = self.floor(); st = self.rc10()
        if not ms or st is None: return None
        V = np.concatenate([m["V"] for m in ms]); V = V[(V[:, 0] > 0) & (np.abs(V[:, 1]) > 500) & (np.abs(V[:, 1]) < 600)]
        foot = V[np.abs((V[:, 2] - fl) - 47.0) < 3.0]
        return None if len(foot) == 0 else round(float((foot[:, 0].min() + foot[:, 0].max()) / 2) - st, 3)
    # cushions / pockets / sights
    def cu11(self):
        c = self.V("dm-cushion"); return None if c is None else round(float(c[:, 2].max()) - BED, 3)
    def cup(self, kind, tag):
        """Same min radius / rim / span rules, about the fixed MODEL reference; no OURS fit."""
        wall = self.by.get(f"dm-pocket-rox-{kind}-{tag}-cup-c") or self.by.get(f"dm-pocket-rox-{kind}-{tag}-cup-ring")
        if wall is None: return None
        anchor = 'cup_' + kind
        c = np.array(self.d.comparison_datums(anchor)[anchor])
        W = self.d.comparison_vertices(wall, anchor)
        r = np.hypot(W[:, 0] - c[0], W[:, 1] - c[1])
        top = W[W[:, 2] > BED + 0.5]; ang = np.degrees(np.arctan2(top[:, 1] - c[1], top[:, 0] - c[0]))  # the open C above the bed (its rim falls 4 mm toward the ends, so no height band)
        # span: the largest gap in the angle histogram is the opening
        if not len(ang): return None
        a = np.sort(ang); gaps = np.diff(np.concatenate([a, [a[0] + 360]])); span = 360 - float(gaps.max())
        return dict(r_in=round(float(r.min()), 3), rim=round(float(W[:, 2].max()) - BED, 3), span_deg=round(span, 1), axis=[round(float(c[0]), 3), round(float(c[1]), 3)])
    def sight(self):
        s = self.sel("dm-sight-long")
        if not s: return None
        e = np.array([m["V"].max(0) - m["V"].min(0) for m in s]).mean(0); return dict(across=round(float(e[1]), 2), along=round(float(e[0]), 2), count=len(self.sel("dm-sight")))

def measure(dump):
    M = Meas(dump); m = {}
    m["EN-01"] = M.en01(); m["EN-02"] = M.en02(); m["RB-01"] = M.rb01(); m["RB-02"] = M.rb02()
    m["RB-04"] = dict(crest=M.rb04_crest(), inner=M.rb04_inner()); m["RC-01"] = dict(lip=M.lip_z("long"), skin=M.skin()); m["RC-02"] = dict(lip=M.lip_z("short"))
    m["RC-04"] = M.trim_proud(); m["RC-05"] = M.skin(); m["RC-07"] = M.badge("dm-apron-rox-badge"); m["RC-08"] = M.badge("dm-apron-rox-logoplate")
    m["RC-09"] = M.rc09(); m["RC-10"] = M.rc10(); m["RC-11"] = M.rc11(); m["RC-12"] = M.rc12(); m["RC-13"] = M.rc13(m["RC-10"] or 0.0); m["RC-14"] = M.rc14()
    m["RC-15"] = M.rc15(); m["RC-16"] = m["RC-15"] and m["RC-15"]["across"]; m["RC-17"] = M.sight(); m["RC-18"] = M.skin(); m["RC-20"] = M.rc20(); m["RC-21"] = M.rc21()
    m["CU-11"] = M.cu11(); m["CP-06"] = M.cup("corner", "pxpz"); m["SP-06"] = M.cup("side", "pz"); m["CP-12"] = m["CP-06"]; m["SP-12"] = m["SP-06"]
    m["RB-07"] = None  # from dims
    return m, M

def rows_table(rows, m, M, dimsrows, floor_shift, liner):
    """One row per consumed letter: spec (in the row's datum), as-modeled, delta, tol, verdict, rule."""
    out = []
    def add(rid, spec, ours_v, tol, rule, datum="raw", part="", source_tag=None):
        source_tag = source_tag or rows[rid].get("source", {}).get("tier")
        if ours_v is None or spec is None or not isinstance(spec, (int, float)) or not isinstance(ours_v, (int, float)):
            out.append(dict(id=rid, part=part, spec=spec, ours=ours_v, delta=None, tol=tol, verdict="RED (absent)" if ours_v is None else "INFO (non-numeric)", rule=rule, datum=datum, source_tag=source_tag)); return
        d = round(ours_v - spec, 3); v = "GREEN" if abs(d) <= tol + 1e-9 else "RED"
        adj = ADJUDICATED.get((rid, part))
        if v == "RED" and adj: v = f"RED-ADJUDICATED ({adj})"
        out.append(dict(id=rid, part=part, spec=spec, ours=ours_v, delta=d, tol=tol, verdict=v, rule=rule, datum=datum, source_tag=source_tag, adjudicated=bool(adj and v.startswith("RED-ADJ"))))
    R = rows
    # envelope
    add("EN-01", val(R, "EN-01")[0], m["EN-01"][0], RENDER_TOL, "2 × max |x| over every table mesh (the rail lips)", "MFR", "length")
    add("EN-01", val(R, "EN-01")[1], m["EN-01"][1], RENDER_TOL, "2 × max |y| over every table mesh", "MFR", "width")
    add("EN-02", val(R, "EN-02"), m["EN-02"], RENDER_TOL, "rail-cap crest z − foot-plate bottom z", "MFR")
    add("RB-01", val(R, "RB-01"), m["RB-01"], RENDER_TOL, "long-rail lip outer face |y| − nose line", "DERIVED")
    add("RB-02", val(R, "RB-02"), m["RB-02"], RENDER_TOL, "end-rail lip outer face |x| − nose line", "DERIVED")
    # cap form
    add("RB-04", num(R, "RB-04", "crest", "z_mm", "long"), m["RB-04"]["crest"], RENDER_TOL, "max z of the cap dome meshes", "raw", "crest z")
    if m["RB-04"]["inner"]:
        add("RB-04", val(R, "RB-04", "inner_edge", "du_mm", "long"), m["RB-04"]["inner"][0], RENDER_TOL, "x = 600 section of the +Y cap: min u from the nose", "raw", "inner_edge du long")
        add("RB-04", val(R, "RB-04", "inner_edge", "cap_top_at_inner_edge_z", "long"), m["RB-04"]["inner"][1], RENDER_TOL, "cap top at that inner edge", "raw", "cap_top_at_inner_edge_z long")
    lipL = m["RC-01"]["lip"]; sk = m["RC-05"]
    add("RC-01", val(R, "RC-01", "z_lip_top_vertical"), lipL and lipL[0], RENDER_TOL, "long-rail lip piece max z", "raw", "z_lip_top_vertical")
    add("RC-01", val(R, "RC-01", "z_lip_bottom"), lipL and lipL[1], RENDER_TOL, "long-rail lip piece min z", "raw", "z_lip_bottom")
    add("RC-01", val(R, "RC-01", "z_skin_top"), sk and sk["top"], RENDER_TOL, "apron skin ring max z", "raw", "z_skin_top")
    add("RC-01", val(R, "RC-01", "z_skin_bottom"), sk and sk["bottom"], 1.6, "lowest z with apron material within 1.6 mm of the skin face (RB-05 blend onset: 0.5 mm at −149.1, 1.6 mm at −152.0; RC-01's landmark −153.5 is the same roundover read on the outer profile) — tolerance = that 1.6 mm onset ambiguity", "raw", "z_skin_bottom")
    add("RC-01", val(R, "RC-01", "z_lowest_material"), sk and sk["lowest"], RENDER_TOL, "apron blend rings min z", "raw", "z_lowest_material")
    lipS = m["RC-02"]["lip"]
    add("RC-02", val(R, "RC-02", "z_lip_top_vertical"), lipS and lipS[0], RENDER_TOL, "end-rail lip piece max z", "raw", "z_lip_top_vertical")
    add("RC-02", val(R, "RC-02", "z_lip_bottom"), lipS and lipS[1], RENDER_TOL, "end-rail lip piece min z", "raw", "z_lip_bottom")
    add("RC-04", round(val(R, "RC-04", "plan_extreme_x") - 1309.40, 3), m["RC-04"], RENDER_TOL, "trim strip max |x| − skin max |x| (proud of the sharp skin corner; spec = RC-04 plan_extreme_x − RB-05 sharp corner 1309.40)", "raw", "proud")
    add("RC-05", val(R, "RC-05", "skin_setback_from_lip_outer_face"), sk and sk["setback"], RENDER_TOL, "long-rail edge |y| − apron skin outer face |y| (straight run)", "raw", "setback")
    add("RC-06", val(R, "RC-06", "height"), lipL and round(lipL[0] - lipL[1], 3), val(R, "RC-06", "height_tolerance"), "long-rail lip piece z extent (the model's lip 36.0 → 13.5 is what is built; the photo strip reads taller)", "MFR", "strip height")
    add("RC-06", val(R, "RC-06", "top_z_bed_rel_at_9ft"), lipL and lipL[0], val(R, "RC-06", "top_z_tolerance"), "long-rail lip piece max z", "MFR", "strip top")
    b = m["RC-07"]; v7 = val(R, "RC-07")
    if isinstance(v7, dict):
        add("RC-07", v7.get("height"), b and b["height"], v7.get("tolerance", RENDER_TOL) or RENDER_TOL, "head badge mesh z extent", "MFR", "height")
        add("RC-07", v7.get("width"), b and b["y"], v7.get("width_tolerance", RENDER_TOL) or RENDER_TOL, "head badge mesh y extent", "MFR", "width")
    b8 = m["RC-08"]; v8 = val(R, "RC-08")
    if isinstance(v8, dict):
        add("RC-08", v8.get("width"), b8 and b8["x"], v8.get("tolerance"), "long-apron logotype plate x extent", "MFR", "width")
        add("RC-08", v8.get("height"), b8 and b8["height"], v8.get("tolerance"), "logotype plate z extent", "MFR", "height")
    # pedestal / feet / spandrel
    add("RC-09", val(R, "RC-09"), m["RC-09"], 0, "distinct pedestal x-stations (sign clusters of dm-pedestal-rox)", "MFR", "count")
    add("RC-10", val(R, "RC-10", "abs_x"), m["RC-10"], val(R, "RC-10", "tolerance"), "mean |x| of the foot-plate mesh centres", "MFR")
    v11 = val(R, "RC-11", "by_z_corrected"); tol11 = val(R, "RC-11", "tolerance")
    for z, w in (v11 or {}).items():
        add("RC-11", w, (m["RC-11"] or {}).get(str(int(float(z)))), tol11, f"2 × max |y| of the pedestal meshes within ±6.5 mm of floor z {z}", "MFR", f"width z {z}")
    add("RC-12", val(R, "RC-12", "apex_z_floor_datum"), m["RC-12"], val(R, "RC-12", "apex_tolerance"), "min z of the pedestal meshes at |y| < 3 (the arch apex), floor datum", "MFR")
    fit = val(R, "RC-13", "inner_fit"); off21 = val(R, "RC-21", "bow_foot_mid_minus_pad_centroid"); pad = val(R, "RC-21", "pad_area_centroid_x")
    for z, rec13 in (m["RC-13"] or {}).items():
        if not rec13: add("RC-13", None, None, RENDER_TOL, f"no grid row near floor z {z}", "raw", f"x_in @ z {z}"); continue
        zr = rec13["z_row"]; spec = round(fit["cx"] + math.sqrt(max(0.0, fit["R"] ** 2 - (zr - fit["cz"]) ** 2)) - pad, 3)
        add("RC-13", spec, rec13["x_in_minus_station"], RENDER_TOL, f"inner bow face x on the grid row at floor z {zr} (|y| 500..600) − plate station; spec = RC-13 inner_fit circle at that z − EN-04 pad centroid (RC-21)", "raw", f"x_in − pad centre @ z {zr}")
    r14 = m["RC-14"]
    add("RC-14", val(R, "RC-14", "crown_z_floor_datum"), r14 and r14["crown"], val(R, "RC-14", "crown_tolerance"), "min z of the spandrel meshes at |x| < 5, floor datum", R["RC-14"]["a2"]["datum"], "crown")
    add("RC-14", val(R, "RC-14", "spandrel_depth_at_centre"), r14 and r14["depth"], val(R, "RC-14", "spandrel_tolerance"), "body plate underside − crown", R["RC-14"]["a2"]["datum"], "depth")
    r15 = m["RC-15"]
    add("RC-15", val(R, "RC-15", "length_x"), r15 and r15["length"], val(R, "RC-15", "length_tolerance"), "foot-plate mesh x extent", "MFR", "length")
    add("RC-15", val(R, "RC-15", "height"), r15 and r15["height"], val(R, "RC-15", "height_tolerance"), "foot-plate mesh z extent", "MFR", "height")
    add("RC-16", val(R, "RC-16", "across"), m["RC-16"], RENDER_TOL, "foot-plate mesh y extent", "raw")
    s17 = m["RC-17"]
    add("RC-17", val(R, "RC-17", "across_rail"), s17 and s17["across"], val(R, "RC-17", "across_tolerance"), "long-rail sight mesh y extent (mean)", "MFR", "across")
    add("RC-17", val(R, "RC-17", "along_rail"), s17 and s17["along"], RENDER_TOL, "long-rail sight mesh x extent (mean)", "MFR", "along")
    add("RC-17", 18, s17 and s17["count"], 0, "dm-sight-* count", "MFR", "count")
    add("RC-18", val(R, "RC-18", "apron_bottom_z_floor_datum"), sk and round(sk["lowest_abs"] - M.floor(), 2), val(R, "RC-18", "bottom_tolerance"), "apron blend min z, floor datum", "MFR", "apron bottom")
    add("RC-18", val(R, "RC-18", "visible_height"), sk and round(sk["top"] - sk["bottom"], 2), val(R, "RC-18", "visible_tolerance"), "skin top − skin bottom (blend start)", "MFR", "visible")
    r20 = m["RC-20"]; v20 = val(R, "RC-20")
    add("RC-20", v20["count"], r20 and r20["count"], 0, "spandrel mesh count", "raw", "count")
    add("RC-20", v20["y_faces_abs"][0], r20 and r20["y_faces"][0], RENDER_TOL, "spandrel min |y|", "raw", "y face inner")
    add("RC-20", v20["y_faces_abs"][1], r20 and r20["y_faces"][1], RENDER_TOL, "spandrel max |y|", "raw", "y face outer")
    add("RC-20", round(v20["top_z_frame"]["median"] + floor_shift, 2), r20 and round(r20["top_abs"] - M.floor(), 2), RENDER_TOL, "spandrel max z, floor datum (model top 618.1 + the bed-datum shift 1.034)", "raw", "top")
    fin, fout = val(R, "RC-13", "inner_fit"), val(R, "RC-13", "outer_fit"); z47 = 47.0
    mid47 = ((fin["cx"] + math.sqrt(fin["R"] ** 2 - (z47 - fin["cz"]) ** 2)) + (fout["cx"] + math.sqrt(fout["R"] ** 2 - (z47 - fout["cz"]) ** 2))) / 2 - pad
    add("RC-21", round(mid47, 3), m["RC-21"], RENDER_TOL, "bow foot mid x on the foot row (floor z 47, |y| 500..600) − foot-plate centre; spec = RC-13 inner + outer circles at z 47 (the 9-ft bow lands on the RC-15 plate top, not the model's z 30 pad) − EN-04 pad centroid = RC-21's relation carried", "raw")
    # cushions / pockets / sights
    add("CU-11", val(R, "CU-11", "cushion_body_top_mm", "long"), m["CU-11"], RENDER_TOL, "max z of the cushion meshes", "raw")
    c = m["CP-06"]; s = m["SP-06"]
    add("CP-12", val(R, "CP-12", "inner_wall_circle", "R_mm"), c and c["r_in"], RENDER_TOL, "minimum wall radius about fixed MODEL CP-12/A1/PF-01 axis (FIX2; no OURS fit)", "raw", "inner R")
    add("SP-12", val(R, "SP-12", "inner_R"), s and s["r_in"], RENDER_TOL, "minimum wall radius about fixed MODEL SP-12/A1/PF-01 axis (FIX2; no OURS fit)", "raw", "inner R")
    add("CP-12", val(R, "CP-12", "rim_height_above_bed_z_bed_mm", "crest_on_the_diagonal_phi_0"), c and c["rim"], RENDER_TOL, "corner cup C max z", "raw", "rim crest")
    add("SP-12", val(R, "SP-12", "rim_top_z_bed_rel", "apex_x0"), s and s["rim"], RENDER_TOL, "side cup ring max z", "raw", "rim apex")
    # FIX11: the MODEL section arc parameter is not the transported plan extent.
    # Neither the observed endpoints nor the observed radius set expectations.
    for record in liner['records']:
        law, observed = record['expected'], record['observed']
        model, tag, rid = law['model_section'], record['pocket'], law['letter']
        refusal = ('; ' + record['refusal']) if 'refusal' in record else ''
        add(rid, model['wall_thickness_mm'], observed and observed['section_width_mm'], RENDER_TOL,
            "worst radial wall thickness over all rear section stations; transported terminal miters excluded" + refusal,
            "raw", tag + " MODEL section wall thickness", "MODEL")
        add(rid, model['inner_radius_mm'], observed and observed['section_radius_mm'], RENDER_TOL,
            "worst rear inner radius about the fixed MODEL CP-12/SP-12 axis; no fitted comparison origin" + refusal,
            "raw", tag + " MODEL section inner R", "MODEL")
        swept = observed and observed['swept']
        add("RC-29", law['expected_extent_deg'], swept and swept['extent_deg'], liner_letters_rox.ANGLE_TOL_DEG,
            "max(phi)-min(phi) about fixed MODEL axis; expectation from declared kernel corners/facing and MODEL section; " + law['branch'] + refusal,
            "DERIVED", rid + " " + tag + " swept wall arc deg", "DERIVED")
        add("RC-29", 0., swept and swept['endpoint_max_error_mm'], RENDER_TOL,
            "maximum distance of both emitted inner/outer end sections to independently derived targets" + refusal,
            "DERIVED", rid + " " + tag + " endpoint error mm", "DERIVED")
    # dims rows (kernel-collision letters + RB-03 / RB-07) — the alignment gate's rules, unchanged
    SHARED = {"CP-01", "SP-01", "SP-05", "CP-05", "CP-08", "SP-08"}  # the shared K55 loft / generic bed-hole geometry every pool entry renders — outside the rox fence, reported as findings
    for r in dimsrows:
        if r["id"] in ("PF-01", "CU-02", "CU-03", "CU-04", "CP-01", "CP-02", "CP-05", "CP-08", "SP-01", "SP-02", "SP-05", "SP-08", "RB-03", "RB-07"):
            tol = r.get("tolerance"); st = r.get("status")
            if r["id"] == "RB-03" and isinstance(r.get("delta_spec"), list):   # a render row: the render tolerance, not the dims mirror test
                tol = [RENDER_TOL, RENDER_TOL]; st = "GREEN" if all(abs(x) <= RENDER_TOL for x in r["delta_spec"] if x is not None) else "RED"
            part = "(shared-scene, dims rule)" if r["id"] in SHARED else "(dims rule)"
            out.append(dict(id=r["id"], part=part, spec=r.get("spec"), ours=r.get("ours"), delta=r.get("delta_spec"), tol=tol, verdict=st, rule=r.get("rule_ours"), datum=r.get("datum"), source_tag=rows[r['id']].get('source', {}).get('tier'), shared=r["id"] in SHARED))
    return out

def identities(rows, m, dimsrows):
    D = {r["id"]: r for r in dimsrows}; out = []
    def w(name, lhs, rhs, tol):
        ok = lhs is not None and rhs is not None and abs(lhs - rhs) <= tol; out.append(dict(identity=name, lhs=lhs, rhs=rhs, tol=tol, holds=bool(ok)))
    pf = D.get("PF-01", {}).get("ours"); rb01, rb02 = m["RB-01"], m["RB-02"]
    if pf and rb01 is not None and rb02 is not None:
        w("EN-01.L = PF-01.L + 2·RB-02 (on the mesh)", m["EN-01"][0], pf[0] + 2 * rb02, 0.5); w("EN-01.W = PF-01.W + 2·RB-01 (on the mesh)", m["EN-01"][1], pf[1] + 2 * rb01, 0.5)
    rb03 = D.get("RB-03", {}).get("ours"); cu04 = D.get("CU-04", {}).get("ours")
    if rb03 and cu04 is not None: w("RB-03.long = RB-01 − CU-04", rb03[0], rb01 - cu04, 0.5); w("RB-03.short = RB-02 − CU-04", rb03[1], rb02 - cu04, 0.5)
    cp02 = D.get("CP-02", {}).get("ours"); sp02 = D.get("SP-02", {}).get("ours")
    w("CP-02 = 135 + 6 (corner facing 141°; dims reads the angle to the rail = 180 − 141)", None if cp02 is None else round(180 - cp02, 3), 141.0, 0.5)
    w("SP-02 = 90 + 10 (side facing 100°; dims reads the angle to the rail = 180 − 100)", None if sp02 is None else round(180 - sp02, 3), 100.0, 0.5)
    out[-1]["shared"] = True  # the side jaw facing is cut by the shared cushion loft (every pool entry) — a finding for the maintainer, outside the rox fence
    cu02 = D.get("CU-02", {}).get("ours"); cu03 = D.get("CU-03", {}).get("ours")
    w("CU-03 = CU-02 / 57.15", cu03, None if cu02 is None else cu02 / BALL_D, 0.2 / BALL_D)
    rb07 = D.get("RB-07", {}).get("ours")
    if rb07 and pf: w("RB-07 pitch = PF-01.L / 8", rb07[0], pf[0] / 8, 0.5); w("RB-07 inset = 93.6625 (WPA), not RB-09b 92.45", rb07[1], 93.6625, 0.5)
    w("RC-09 = 2 pedestal plates", m["RC-09"], 2, 0)
    return out

def redarms(dump, rows):
    """Transform the dump (in memory) and re-measure the targeted row; each arm must go RED."""
    import copy
    arms = []
    def run(name, mutate, rid, check):
        d2 = copy.deepcopy(dump); mutate(d2); m2, M2 = measure(d2); v = check(m2, M2); arms.append(dict(arm=name, row=rid, result=v, armed=bool(v and v.startswith("RED"))))
    def drop_ped(d):
        d.meshes = [m for m in d.meshes if not (m["name"].startswith("dm-pedestal-rox-px") or m["name"].startswith("dm-foot-plate-rox-px"))]
    run("drop the +x pedestal (single plate)", drop_ped, "RC-09", lambda m, M: "RED" if m["RC-09"] != 2 else "GREEN")
    def sights_rb09b(d):
        for m in d.meshes:
            if m["name"].startswith("dm-sight-long"): m["V"][:, 1] -= np.sign(m["V"][:, 1].mean()) * (93.6625 - 92.45)
            if m["name"].startswith("dm-sight-short"): m["V"][:, 0] -= np.sign(m["V"][:, 0].mean()) * (93.6625 - 92.45)
    def chk_rb07(m, M):
        t = dims.build(M.d); r = [x for x in t["rows"] if x["id"] == "RB-07"][0]; return r["status"] + f" (inset {r['ours'][1]})"
    run("sights at the model's RB-09b nose inset 92.45", sights_rb09b, "RB-07", chk_rb07)
    def sight_rb09(d):
        for m in d.meshes:
            if m["name"].startswith("dm-sight-long"): c = m["V"][:, 0].mean(); m["V"][:, 0] = c + (m["V"][:, 0] - c) * (18.113 / 13.7)
    run("sight slab along-rail size = RB-09 18.113", sight_rb09, "RC-17", lambda m, M: "RED" if abs(m["RC-17"]["along"] - 13.7) > RENDER_TOL else "GREEN")
    def apex(d):
        for m in d.meshes:
            if m["name"].startswith("dm-pedestal-rox"): m["V"][:, 2] += 15.1 * (np.abs(m["V"][:, 1]) < 200)  # lift the arch zone
    run("arch apex +15.1", apex, "RC-12", lambda m, M: "RED" if abs(m["RC-12"] - 326.0) > 15.0 else f"GREEN ({m['RC-12']})")
    def station(d):
        for m in d.meshes:
            if m["name"].startswith("dm-foot-plate-rox"): m["V"][:, 0] += np.sign(m["V"][:, 0].mean()) * 20.0
    run("foot plates +20 mm outboard", station, "RC-10", lambda m, M: "RED" if abs(m["RC-10"] - 1147.2) > 19.0 else f"GREEN ({m['RC-10']})")
    def foot(d):
        for m in d.meshes:
            if m["name"].startswith("dm-foot-plate-rox"): z0 = m["V"][:, 2].min(); m["V"][:, 2] = z0 + (m["V"][:, 2] - z0) * 1.1
    run("foot plate height ×1.1", foot, "RC-15", lambda m, M: "RED" if abs(m["RC-15"]["height"] - 47.0) > 2.0 else f"GREEN ({m['RC-15']['height']})")
    return arms

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dump", default="/tmp/ox-a2/dump/b9.json"); ap.add_argument("--out", default="/tmp/ox-a2/letters")
    ap.add_argument("--judge", action="store_true"); ap.add_argument("--redarm", action="store_true"); ap.add_argument("--expect-sha256")
    ap.add_argument("--reference", default=str(pocket_reference.DEFAULT)); a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True); t0 = time.time()
    try:
        pocket_reference.load(a.reference)  # Admission only; generator must precede mesh measurement.
    except pocket_reference.ReferenceRefused as exc:
        print(f"[letters-rox] REFUSED {exc}"); sys.exit(4)
    sha = sha256(JSON_PATH)
    if a.expect_sha256 and a.expect_sha256.lower() != sha: print(f"[letters-rox] JSON sha {sha} != expected {a.expect_sha256}"); sys.exit(4)
    gen = subprocess.run([sys.executable, GEN, "--output-dir", os.path.join(a.out, "gen")], capture_output=True, text=True)
    gen_ok = gen.returncode == 0 and "REFUSING" not in gen.stdout + gen.stderr
    if not gen_ok: print("[letters-rox] generator refused:", (gen.stdout + gen.stderr)[-300:]); sys.exit(4)
    J = json.load(open(JSON_PATH)); rows = {x["id"]: x for x in J["features"]}
    dump = ours.Dump(a.dump, reference_path=a.reference)
    m, M = measure(dump); dt = dims.build(dump); floor_shift = round(786.862 - 785.828, 3)
    try:
        liner = liner_letters_rox.measure(dump, J)
    except liner_letters_rox.LinerLetterRefused as exc:
        print(f"[letters-rox] REFUSED: {exc}"); sys.exit(4)
    table = rows_table(rows, m, M, dt["rows"], floor_shift, liner); ids = identities(rows, m, dt["rows"]); arms = redarms(dump, rows) if a.redarm else []
    if a.redarm: arms += pocket_reference.redarms(a.reference)
    reds = [r for r in table if str(r["verdict"]).startswith("RED") and not r.get("shared") and not r.get("adjudicated")]; shared_reds = [r for r in table if str(r["verdict"]).startswith("RED") and r.get("shared")]
    adjudicated = [r for r in table if r.get("adjudicated")]
    idfail = [i for i in ids if not i["holds"] and not i.get("shared")]; shared_idfail = [i for i in ids if not i["holds"] and i.get("shared")]; armfail = [x for x in arms if not x["armed"]]
    verdict = "GREEN" if not reds and not idfail and not armfail else "RED"
    rec = dict(tool="letters_rox", json=JSON_PATH, json_sha256=sha, json_revision=J["doc"]["revision_history"][-1].get("rev", J["doc"].get("revision")), dump=a.dump, generator="gen_drawing_rox.py (verbatim, ran first)",
               rows=table, identities=ids, redarms=arms, reds=len(reds), shared_scene_reds=[r["id"] for r in shared_reds], shared_scene_identity_fails=[i["identity"] for i in shared_idfail], verdict=verdict, seconds=round(time.time() - t0, 1), measured=m,
               pocket_reference=dump.reference.metadata(), cup_observations=dump.cup_observations, kernel_axes=dump.kernel_axes,
               liner_letters=liner, liner_letters_sha256=sha256(liner_letters_rox.__file__))
    json.dump(rec, open(os.path.join(a.out, "letters-rox.json"), "w"), indent=1, default=str)
    L = [f"# LETTERS-ROX — as-modeled letters, rasson_ox_9ft", "", f"JSON `{os.path.relpath(JSON_PATH, REPO)}` sha256 `{sha}`; dump `{a.dump}`; generator `gen_drawing_rox.py` ran first (OK).", "",
         f"**VERDICT {verdict}** — {len(reds)} red rox letter(s) of {len(table)}, {len(idfail)} rox identity failure(s) of {len(ids)}, red arms {sum(1 for x in arms if x['armed'])}/{len(arms)} armed; SHARED-SCENE findings (outside the rox fence, reported not judged): {len(shared_reds)} red letter(s) {[r['id'] for r in shared_reds]}, {len(shared_idfail)} identity {[i['identity'].split(' (')[0] for i in shared_idfail]}; ADJUDICATED conflicts carried: {[(r['id'], r['part']) for r in adjudicated]}", "",
         f"FIX2 fixed reference `{dump.reference.id}`, SHA-256 `{dump.reference.sha256}`. Corner axis {dump.reference.axis('corner')}; side axis {dump.reference.axis('side')}. CP-12/SP-12 observations below are not registration inputs.", "",
         "## Letters (spec vs as-modeled from the live mesh)", "", "| row | part | source tag | datum | spec | as-modeled | Δ | tol | verdict | rule |", "|---|---|---|---|---|---|---|---|---|---|"]
    for r in table: L.append(f"| {r['id']} | {r['part']} | {r['source_tag']} | {r['datum']} | {r['spec']} | {r['ours']} | {r['delta']} | {r['tol']} | **{r['verdict']}** | {r['rule']} |")
    L += ["", "## MODEL section versus DERIVED swept extent", "",
          f"CP-12's {val(rows, 'CP-12', 'angular_span_of_the_open_C', 'total_wall_arc_deg')}° remains the MODEL-mouth section parameter. Its radius, wall thickness and rim are MODEL measurements. "
          "The emitted polar extent and end sections are separately DERIVED from the declared kernel and section. "
          "The source parameter is never substituted for an observed mesh value. Angle band stays 3°; section/endpoint band stays 0.5 mm.",
          "", "```text", liner['formula'], "```", "",
          "| Letters | Quantity | Tag | Disposition |", "|---|---|---|---|"]
    for row in liner['dispositions']:
        L.append(f"| {row['letters']} | {row['quantity']} | {row['source_tag']} | {row['disposition']} |")
    L += ["", "## Physical placement observations (never comparison origins)", "",
          "| Cup | Physical inner-wall axis mm | Δ to fixed MODEL axis mm | Norm mm | Fitted physical radius mm | Status |",
          "|---|---|---|---|---|---|"]
    for kind, obs in dump.cup_observations.items():
        L.append(f"| {kind} | {obs['axis_xy_mm']} | {obs.get('delta_from_fixed_reference_xy_mm')} | {obs.get('delta_norm_mm')} | {obs.get('radius_mm')} | {obs['status']} |")
    L += ["", f"Legacy pan vertex means (observations, not comparison axes): {dump.kernel_axes}."]
    L += ["", "## Identities re-witnessed on the mesh", "", "| identity | lhs | rhs | tol | holds |", "|---|---|---|---|---|"]
    for i in ids: L.append(f"| {i['identity']} | {i['lhs']} | {i['rhs']} | {i['tol']} | {'YES' if i['holds'] else '**NO**'} |")
    if arms:
        L += ["", "## Red arms (dump transformed, row re-measured)", "", "| arm | row | result | armed |", "|---|---|---|---|"]
        for x in arms: L.append(f"| {x['arm']} | {x['row']} | {x['result']} | {'YES' if x['armed'] else '**NO**'} |")
    open(os.path.join(a.out, "LETTERS-ROX.md"), "w").write("\n".join(L) + "\n")
    print(f"[letters-rox] {verdict} reds {len(reds)}/{len(table)} identities {len(ids) - len(idfail)}/{len(ids)} arms {sum(1 for x in arms if x['armed'])}/{len(arms)} {rec['seconds']}s -> {a.out}/LETTERS-ROX.md")
    for r in table:
        if r['id'] in ('CP-12', 'SP-12', 'RC-29'):
            print(f"   {r['source_tag']} {r['verdict']} {r['id']} {r['part']}: spec {r['spec']} ours {r['ours']} Δ {r['delta']} tol {r['tol']}")
    for x in arms:
        if x['arm'].startswith('REFERENCE_'): print(f"   REFERENCE ARM {x['result']}; fired={x['armed']}")
    for r in reds: print(f"   RED {r['id']} {r['part']}: spec {r['spec']} ours {r['ours']} Δ {r['delta']} tol {r['tol']}")
    for r in shared_reds: print(f"   shared-scene RED {r['id']}: spec {r['spec']} ours {r['ours']} Δ {r['delta']} tol {r['tol']}")
    for i in shared_idfail: print(f"   shared-scene IDENTITY {i['identity']}: {i['lhs']} vs {i['rhs']}")
    for i in idfail: print(f"   IDENTITY FAIL {i['identity']}: {i['lhs']} vs {i['rhs']}")
    for x in armfail: print(f"   ARM NOT ARMED {x['arm']}: {x['result']}")
    if a.judge and verdict != "GREEN": sys.exit(3)

if __name__ == "__main__": main()
