# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Purchased-model measurements (NUMBERS + method strings only), regenerated from the quarantine OBJ at run time.

Port of the d621-align Task B chain: measure1 (reconstructed from the method strings of measurements.json -- the original
script was not archived), measure2.py, measure3.py, measure4.py and the recess probe. Output: <out>/model/measurements.json.
The committed record is docs/geometry/diamond-proam-8ft-purchased-model-measurements.json; the driver compares the two.

All numbers are mm in the model frame (3ds Max world, Z-up, bed top z=770, table centre (0,0)). Base cages, modifiers
not applied. Nothing but numbers leaves this module."""
import collections
import json
import os

import numpy as np

import common
import objlib
import paths

ZT = paths.BED_Z


class Rec:
    def __init__(self, log=None):
        self.M = collections.OrderedDict(); self.log = log

    def __call__(self, key, val, method):
        if key in self.M and self.log: self.log(f"[measure_model] WARNING duplicate key {key} (overwritten)")
        self.M[key] = dict(value=val, method=method)
        if self.log: self.log(f"  {key:40s} {json.dumps(val, default=common.json_default)[:110]}   [{method[:60]}]")


def _r(x, k=1): return round(float(x), k)


# ---------------------------------------------------------------------------------------------------------------------
def measure1(nodes, G, rec):
    """Reconstructed from the method strings (bed/centre/envelope/rail band/cushion/corner block/boot rows)."""
    V = lambda n: nodes[n]["V"]
    pt = V("pool_top"); ntop = int((np.abs(pt[:, 2] - pt[:, 2].max()) < 0.05).sum())
    cush_min = min(V(n)[:, 2].min() for n in G["cushions"]); rail_min = min(V(n)[:, 2].min() for n in G["rails"])
    rec("bed_top_z", _r(pt[:, 2].max(), 2), f"max z of pool_top vertices ({ntop} verts at {pt[:, 2].max():.1f}); cushion min z={cush_min:.2f}; rail min z={rail_min:.2f}")
    rails = np.vstack([V(n) for n in G["rails"]]); mn, mx = rails.min(0), rails.max(0)
    rec("centre_xy", [_r((mn[0] + mx[0]) / 2), _r((mn[1] + mx[1]) / 2)], "midpoint of the rails-group AABB")
    rec("envelope_rails", [_r(mx[0] - mn[0]), _r(mx[1] - mn[1])], "rails-group AABB extents x,y")
    ks = V("pool_kant_support"); rec("envelope_kant_support", [_r(np.ptp(ks[:, 0])), _r(np.ptp(ks[:, 1]))], "pool_kant_support AABB")
    AV = np.vstack([V("pool_kant_side01"), V("pool_kant_side02")]); rec("envelope_apron_union", [_r(np.ptp(AV[:, 0])), _r(np.ptp(AV[:, 1]))], "union AABB of pool_kant_side01+02")
    cush = np.vstack([V("pool_rubber05"), V("pool_rubber06")]); sl = cush[(cush[:, 0] >= 575) & (cush[:, 0] <= 675)]
    caps = np.vstack([V("pool_kant04"), V("pool_kant05")]); sc = caps[(caps[:, 0] >= 575) & (caps[:, 0] <= 675)]
    rec("rail_band_long_mid", _r(sc[:, 1].max() - sl[:, 1].min()), f"+y long rail, slab x in [575,675]: cushion nose y={sl[:, 1].min():.1f} (min y of rubber05/06), cap outer edge y={sc[:, 1].max():.1f} (max y of kant04/05)")
    r01 = V("pool_rubber01"); s1 = r01[np.abs(r01[:, 1]) <= 50]
    short = np.vstack([V("pool_kant02"), V("pool_kant07")]); short = short[short[:, 0] > 0]; s2 = short[np.abs(short[:, 1]) <= 50]
    rec("rail_band_short_mid", _r(s2[:, 0].max() - s1[:, 0].min()), f"+x short rail, slab |y|<=50: cushion nose x={s1[:, 0].min():.1f}, cap outer x={s2[:, 0].max():.1f}")
    zl, cnt = np.unique(np.round(rails[:, 2], 1), return_counts=True); top2 = sorted(zip(zl, cnt), key=lambda t: -t[0])[:2]
    rec("rail_cap_top_above_bed", _r(rails[:, 2].max() - ZT, 2), f"max z of rails group = {rails[:, 2].max():.2f}; z levels " + " and ".join(f"{z:.1f} (n={c // len(G['rails'])}/node)" for z, c in top2[::-1]) + " = cap-top plateau + edge")
    rec("corner_block_top_above_bed", _r(V("pool_kant08")[:, 2].max() - ZT, 2), f"kant08 max z {V('pool_kant08')[:, 2].max():.2f}")
    longcaps = np.vstack([V(n) for n in ("pool_kant04", "pool_kant05", "pool_kant09", "pool_kant10")])
    lip = float(np.abs(longcaps[:, 1]).min())
    rec("rail_cap_inner_edge_abs_y", _r(lip), "min |y| of long-rail cap vertices (cap inner lip)")
    rec("rail_cap_width_plan", _r(longcaps[:, 1].max() - lip), "long rail cap: outer edge - inner edge")
    for n in ("pool_rubber01", "pool_rubber04", "pool_rubber02", "pool_rubber03", "pool_rubber05", "pool_rubber06"):
        v = V(n); ex = v.max(0) - v.min(0); ax = 0 if ex[1] > ex[0] else 1; along = 1 - ax
        c = v[:, ax]; nose = float(c[np.argmin(np.abs(c))]); nl = v[np.abs(c - nose) < 0.05]
        base = v[np.abs(v[:, 2] - ZT) < 0.05]
        rec(f"cushion.{n}", dict(nose_coord=_r(nose), nose_z_above_bed=_r(nl[:, 2].mean() - ZT, 2), nose_z_spread=_r(np.ptp(nl[:, 2]), 2), depth_nose_to_back=_r(np.ptp(c), 2),
                                 top_above_bed=_r(v[:, 2].max() - ZT, 2), base_footprint=[_r(base[:, ax].min()), _r(base[:, ax].max())], length=_r(np.ptp(v[:, along]))),
            "innermost vertex line = nose; z spread over the nose line; ptp along the across-rail axis = depth; verts at z=bed = base footprint")
    for n in ("pool_kant01", "pool_kant03", "pool_kant06", "pool_kant08"):
        v = V(n); e = v.max(0) - v.min(0); u, w = objlib.oriented_extents_45(v)
        rec(f"corner_block.{n}", dict(aabb=[_r(e[0]), _r(e[1]), _r(e[2])], along_diag=_r(u), across_diag=_r(w), zmin=_r(v[:, 2].min()), zmax=_r(v[:, 2].max())), "AABB + extents along (1,1)/sqrt2 and (1,-1)/sqrt2")
    for n in ("pool_leather01", "pool_leather02", "pool_leather04", "pool_leather05", "pool_leather03", "pool_leather06"):
        v = V(n); mn, mx = v.min(0), v.max(0); u, w = objlib.oriented_extents_45(v); ring = v[v[:, 2] > mx[2] - 0.2]
        rec(f"boot.{n}", dict(aabb_plan=[_r(mx[0] - mn[0]), _r(mx[1] - mn[1])], centre=[_r((mn[0] + mx[0]) / 2), _r((mn[1] + mx[1]) / 2)], diag_extents=[_r(u), _r(w)], crest_above_bed=_r(mx[2] - ZT, 2),
                              skirt_below_bed=_r(ZT - mn[2], 2), crest_ring_plan=[_r(np.ptp(ring[:, 0])), _r(np.ptp(ring[:, 1]))], n_crest_verts=int(len(ring))),
            "AABB; 45-deg extents; crest = max z, skirt = min z; crest ring = verts within 0.2 of max z")


# ---------------------------------------------------------------------------------------------------------------------
def measure2(nodes, G, rec):
    V = lambda n: nodes[n]["V"]; F = lambda n: nodes[n]["F"]
    def sec_aabb(n, axis, c):
        s = objlib.section(V(n), F(n), axis, c)
        if len(s) == 0: return None
        P = s.reshape(-1, 3); return P.min(0), P.max(0), len(s)
    # ---- apron band ----
    for n in ("pool_kant_side01", "pool_kant_side02"):
        v = V(n); mn, mx = v.min(0), v.max(0)
        r = sec_aabb(n, 2, 700.0)
        rec(f"apron.{n}", dict(x=[round(mn[0], 1), round(mx[0], 1)], y=[round(mn[1], 1), round(mx[1], 1)], z=[round(mn[2], 1), round(mx[2], 1)], height=round(mx[2] - mn[2], 1),
                                plan_cut_z700=[[round(float(a), 1) for a in r[0][:2]], [round(float(a), 1) for a in r[1][:2]], int(r[2])]), "AABB; plan cut at z=700 AABB + segment count")
    for n in ("pool_kant_side01", "pool_kant_side02"):
        s = objlib.section(V(n), F(n), 2, 700.0); P = s.reshape(-1, 3)
        sides = dict(x_pos=int((P[:, 0] > 1300).sum()), x_neg=int((P[:, 0] < -1300).sum()), y_pos=int((P[:, 1] > 735).sum()), y_neg=int((P[:, 1] < -735).sum()))
        rec(f"apron.{n}.face_hits_z700", sides, "count of section points beyond |x|>1300 / |y|>735 (which outer faces this node forms)")
    AV = np.vstack([V("pool_kant_side01"), V("pool_kant_side02")])
    top = AV[AV[:, 2] > 760]; bot = AV[AV[:, 2] < 645]
    rec("apron.outer_face_x_top", round(float(np.abs(top[:, 0]).max()), 1), "max |x| of apron verts with z>760 (end face, top edge)")
    rec("apron.outer_face_y_top", round(float(np.abs(top[:, 1]).max()), 1), "max |y| of apron verts with z>760 (side face, top edge)")
    rec("apron.outer_face_x_bot", round(float(np.abs(bot[:, 0]).max()), 1), "max |x| of apron verts with z<645 (end face, bottom edge)")
    rec("apron.outer_face_y_bot", round(float(np.abs(bot[:, 1]).max()), 1), "max |y| of apron verts with z<645 (side face, bottom edge)")
    for zc in (645.0, 700.0, 760.0, 768.0):
        s_ = np.vstack([objlib.section(V(n), F(n), 2, zc) for n in ("pool_kant_side01", "pool_kant_side02")]).reshape(-1, 3)
        rec(f"apron.plan_cut_z{int(zc)}", dict(abs_x_max=round(float(np.abs(s_[:, 0]).max()), 1), abs_y_max=round(float(np.abs(s_[:, 1]).max()), 1),
                                              abs_x_min_inner=round(float(np.abs(s_[np.abs(s_[:, 1]) < 300][:, 0]).min()), 1) if (np.abs(s_[:, 1]) < 300).any() else None,
                                              abs_y_min_inner=round(float(np.abs(s_[np.abs(s_[:, 0]) < 600][:, 1]).min()), 1) if (np.abs(s_[:, 0]) < 600).any() else None), "plan cut: outer |x|,|y| and inner |x|,|y| of the band")
    M = rec.M
    rec("apron.outer_face_x", M["apron.plan_cut_z700"]["value"]["abs_x_max"], "plan cut z=700 outer |x|")
    rec("apron.outer_face_y", M["apron.plan_cut_z700"]["value"]["abs_y_max"], "plan cut z=700 outer |y|")
    rec("apron.z_range", [round(float(AV[:, 2].min()), 1), round(float(AV[:, 2].max()), 1)], "min/max z of the two apron nodes")
    rec("apron.height", round(float(np.ptp(AV[:, 2])), 1), "ptp z")
    rec("apron.top_vs_bed", round(float(AV[:, 2].max() - ZT), 2), "apron max z - bed top")
    # ---- kant_support ----
    v = V("pool_kant_support")
    zl = np.unique(np.round(v[:, 2], 1)); rec("kant_support.z_levels", [float(z) for z in zl], "unique z (0.1 mm) of pool_kant_support verts")
    for c in (600.0,):
        s = objlib.section(v, F("pool_kant_support"), 0, c); P = s.reshape(-1, 3); P = P[P[:, 1] > 0]
        rec("kant_support.section_x600_ypos", dict(y=[round(float(P[:, 1].min()), 1), round(float(P[:, 1].max()), 1)], z=[round(float(P[:, 2].min()), 1), round(float(P[:, 2].max()), 1)], nseg=int(len(s))), "plane x=600, +y half: AABB of section points")
        hi = P[P[:, 2] > 780]; lo = P[P[:, 2] < 700]
        rec("kant_support.upper_part_x600", dict(y=[round(float(hi[:, 1].min()), 1), round(float(hi[:, 1].max()), 1)], z=[round(float(hi[:, 2].min()), 1), round(float(hi[:, 2].max()), 1)]), "section points with z>780 (the part rising above the bed)")
        rec("kant_support.lower_part_x600", dict(y=[round(float(lo[:, 1].min()), 1), round(float(lo[:, 1].max()), 1)], z=[round(float(lo[:, 2].min()), 1), round(float(lo[:, 2].max()), 1)]), "section points with z<700")
    # ---- cabinet ----
    pf = V("pool_front"); mn, mx = pf.min(0), pf.max(0)
    rec("cabinet.pool_front_aabb", dict(x=[round(mn[0], 1), round(mx[0], 1)], y=[round(mn[1], 1), round(mx[1], 1)], z=[round(mn[2], 1), round(mx[2], 1)]), "AABB")
    for n in ("pool_side01", "pool_side02"):
        v = V(n); mn2, mx2 = v.min(0), v.max(0); rec(f"cabinet.{n}_aabb", dict(x=[round(mn2[0], 1), round(mx2[0], 1)], y=[round(mn2[1], 1), round(mx2[1], 1)], z=[round(mn2[2], 1), round(mx2[2], 1)]), "AABB")
    pb = V("pool_bottom"); rec("cabinet.pool_bottom_aabb", dict(x=[round(pb[:, 0].min(), 1), round(pb[:, 0].max(), 1)], y=[round(pb[:, 1].min(), 1), round(pb[:, 1].max(), 1)], z=[round(pb[:, 2].min(), 1), round(pb[:, 2].max(), 1)]), "AABB (8-vert box)")
    pm = V("pool_midle"); rec("cabinet.pool_midle", dict(verts=np.round(pm, 1).tolist()), "8 verts, flat octagon plane at z=640 (base cage; .max cache says Shell'd to 770..780)")
    ax = M["apron.outer_face_x"]["value"]; ay = M["apron.outer_face_y"]["value"]
    rec("cabinet.recess_end_from_apron", round(ax - mx[0], 1), f"apron end face |x|={ax} minus pool_front end |x|={mx[0]:.1f}")
    ps = V("pool_side02")
    rec("cabinet.recess_side_from_apron", round(ay - ps[:, 1].max(), 1), f"apron side face |y|={ay} minus pool_side02 outer |y|={ps[:, 1].max():.1f}")
    rec("cabinet.recess_side_box_from_apron", round(ay - mx[1], 1), f"apron side face |y|={ay} minus pool_front side |y|={mx[1]:.1f} (the main box, behind the side panels)")
    rec("cabinet.height", round(mx[2] - mn[2], 1), "pool_front z ptp")
    rec("cabinet.bottom_z", round(mn[2], 1), "pool_front min z")
    rec("cabinet.top_z", round(mx[2], 1), "pool_front max z")
    rec("cabinet.bottom_clear_floor_z0", round(mn[2], 1), "pool_front min z - 0")
    legfoot = min(V(f"pool_leg_out0{i}")[:, 2].min() for i in range(1, 5))
    rec("cabinet.bottom_clear_leg_foot", round(mn[2] - legfoot, 1), f"pool_front min z - leg foot z {legfoot:.1f}")
    rec("cabinet.top_to_apron_bottom_gap", round(AV[:, 2].min() - mx[2], 1), "apron min z - cabinet max z (negative = overlap)")
    # ---- legs ----
    legs = {}
    for i in range(1, 5):
        o = V(f"pool_leg_out0{i}"); mn, mx = o.min(0), o.max(0)
        legs[i] = dict(centre=[round((mn[0] + mx[0]) / 2, 1), round((mn[1] + mx[1]) / 2, 1)], plan=[round(mx[0] - mn[0], 1), round(mx[1] - mn[1], 1)], z=[round(mn[2], 1), round(mx[2], 1)])
    rec("legs.per_leg_aabb", legs, "pool_leg_out0i AABB centre/plan/z")
    cx = sorted(set(abs(l["centre"][0]) for l in legs.values())); cy = sorted(set(abs(l["centre"][1]) for l in legs.values()))
    rec("legs.centre_to_centre", [round(2 * cx[0], 1), round(2 * cy[0], 1)], "2*|centre| in x and y")
    allo = np.vstack([V(f"pool_leg_out0{i}") for i in range(1, 5)])
    rec("legs.outside_to_outside", [round(float(np.ptp(allo[:, 0])), 1), round(float(np.ptp(allo[:, 1])), 1)], "legs_out group AABB")
    rec("legs.top_z", dict(out=round(float(allo[:, 2].max()), 2), inn=round(float(max(V(f'pool_leg_in0{i}')[:, 2].max() for i in range(1, 5))), 2)), "max z")
    rec("legs.foot_z", dict(out=round(float(allo[:, 2].min()), 2), inn=round(float(min(V(f'pool_leg_in0{i}')[:, 2].min() for i in range(1, 5))), 2)), "min z")
    secs = {}
    for zc in (55.0, 305.0, 555.0, 50.0, 300.0, 550.0, 620.0, 10.0):
        row = {}
        for n in ("pool_leg_out01", "pool_leg_in01"):
            r = sec_aabb(n, 2, zc)
            if r: row[n] = dict(x=[round(float(r[0][0]), 1), round(float(r[1][0]), 1)], y=[round(float(r[0][1]), 1), round(float(r[1][1]), 1)], size=[round(float(r[1][0] - r[0][0]), 1), round(float(r[1][1] - r[0][1]), 1)], nseg=int(r[2]))
        secs[str(zc)] = row
    rec("legs.cross_sections_leg01", secs, "plane z=c cut of leg_out01 / leg_in01: AABB of the section polyline (size = x,y extents)")
    li = V("pool_leg_in01"); rec("legs.leg_in01_verts", np.round(li, 1).tolist(), "8-vert tapered box")
    zl, cnt = np.unique(np.round(V("pool_leg_out01")[:, 2], 0), return_counts=True)
    rec("legs.leg_out01_z_levels_top12", [(float(a), int(b)) for a, b in sorted(zip(zl, cnt), key=lambda t: -t[1])[:12]], "unique z (1 mm) by count")
    # ---- sights ----
    S = {}
    for n in sorted(nodes):
        if n.startswith("romb") and n != "romb19":
            v = V(n); mn, mx = v.min(0), v.max(0); S[n] = dict(centre=[round((mn[0] + mx[0]) / 2, 1), round((mn[1] + mx[1]) / 2, 1)], size=[round(mx[0] - mn[0], 1), round(mx[1] - mn[1], 1)], z=round(mx[2], 1))
    rec("sights.per_node", S, "AABB centre/size/z (flat base cage, Shell modifier not applied)")
    longs = sorted(set(round(s["centre"][0], 1) for s in S.values() if abs(s["centre"][1]) > 600)); shorts = sorted(set(round(s["centre"][1], 1) for s in S.values() if abs(s["centre"][0]) > 1200))
    rec("sights.long_rail_x_positions", longs, "centres x of sights with |y|>600"); rec("sights.short_rail_y_positions", shorts, "centres y of sights with |x|>1200")
    rec("sights.spacing_long", [round(b - a, 1) for a, b in zip(longs[:-1], longs[1:])], "diffs"); rec("sights.spacing_short", [round(b - a, 1) for a, b in zip(shorts[:-1], shorts[1:])], "diffs")
    ly = sorted(set(abs(round(s["centre"][1], 1)) for s in S.values() if abs(s["centre"][1]) > 600))[0]; sx = sorted(set(abs(round(s["centre"][0], 1)) for s in S.values() if abs(s["centre"][0]) > 1200))[0]
    rec("sights.inset_from_nose_long", round(ly - 576.0, 1), f"|y| centre {ly} - nose 576.0"); rec("sights.inset_from_nose_short", round(sx - 1152.0, 1), f"|x| centre {sx} - nose 1152.0")
    rec("sights.inset_from_cap_outer_long", round(754.7 - ly, 1), "754.7 - |y| centre"); rec("sights.inset_from_cap_outer_short", round(1330.7 - sx, 1), "1330.7 - |x| centre")
    rec("sights.z_vs_cap_top", round(814.6 - 814.68, 2), "sight plane z 814.6 vs cap max 814.68")
    rec("sights.nose_to_nose", [2 * 1152.0, 2 * 576.0], "playing surface nose-to-nose L x W"); rec("sights.L_over_8_W_over_4", [2 * 1152.0 / 8, 2 * 576.0 / 4], "expected diamond pitch")
    rec("sights.gap_side_pocket_long", round(2 * longs[len(longs) // 2], 1) if len(longs) % 2 == 0 else None, "x gap between the two sights flanking the side pocket")
    # ---- traps ----
    T = {}
    for n in sorted(nodes):
        if n.startswith("pool_trap"):
            v = V(n); mn, mx = v.min(0), v.max(0); T[n] = dict(centre=[round((mn[0] + mx[0]) / 2, 1), round((mn[1] + mx[1]) / 2, 1)], plan=[round(mx[0] - mn[0], 1), round(mx[1] - mn[1], 1)], z_rel_bed=[round(mn[2] - ZT, 1), round(mx[2] - ZT, 1)], diag=[round(float(a), 1) for a in objlib.oriented_extents_45(v)])
    rec("traps.per_node", T, "AABB; z relative to bed 770")
    # ---- screws / label ----
    SC = np.vstack([V(n) for n in nodes if n.startswith("screw")]); rec("screws.group_aabb", dict(x=[round(SC[:, 0].min(), 1), round(SC[:, 0].max(), 1)], y=[round(SC[:, 1].min(), 1), round(SC[:, 1].max(), 1)], z=[round(SC[:, 2].min(), 1), round(SC[:, 2].max(), 1)]), "16 heads, 18.9 dia, on cabinet end faces (|x|=1162) and side panels (|y|=582)")
    lb = V("pool_label"); rec("label.aabb", dict(x=[round(lb[:, 0].min(), 1), round(lb[:, 0].max(), 1)], y=[round(lb[:, 1].min(), 1), round(lb[:, 1].max(), 1)], z=round(lb[:, 2].max(), 1)), "flat logo plate on the -x short rail cap")
    # ---- boots rim ----
    for n in ("pool_leather01", "pool_leather03"):
        v = V(n); rim = v[(v[:, 2] > 814.0) & (v[:, 2] < 815.0)]; pk = v[v[:, 2] > 820]
        rec(f"boot_rim.{n}", dict(rim_z=[round(float(rim[:, 2].min()), 1), round(float(rim[:, 2].max()), 1)], n_rim=int(len(rim)), rim_plan=[round(float(np.ptp(rim[:, 0])), 1), round(float(np.ptp(rim[:, 1])), 1)], rim_diag=[round(float(a), 1) for a in objlib.oriented_extents_45(rim)], peak_z=round(float(pk[:, 2].max()), 1), n_peak=int(len(pk)), peak_xy=np.round(pk[:, :2].mean(0), 1).tolist()), "verts in 814<z<815 = rim ring; verts z>820 = crest peak")
    # ---- pool_top pocket cutouts ----
    pt = V("pool_top"); top = pt[np.abs(pt[:, 2] - 770) < 0.05]
    rec("bed.pool_top_top_face_extent", [round(float(np.ptp(top[:, 0])), 1), round(float(np.ptp(top[:, 1])), 1)], "verts at z=770")
    c = top[(top[:, 0] > 1000) & (top[:, 1] > 400)]; rec("bed.corner_cutout_pos_pos_z770_verts", dict(n=int(len(c)), xmin=round(float(c[:, 0].min()), 1), ymin=round(float(c[:, 1].min()), 1)), "verts at z=770 in the +x+y corner region")


# ---------------------------------------------------------------------------------------------------------------------
def measure3(nodes, G, rec):
    V = lambda n: nodes[n]["V"]; F = lambda n: nodes[n]["F"]
    def secpts(n, axis, c):
        s = objlib.section(V(n), F(n), axis, c); return s.reshape(-1, 3) if len(s) else None
    # --- pocket mouths (nose-line endpoints) ---
    r06 = V("pool_rubber06"); nl = r06[np.abs(r06[:, 1] - 576.0) < 0.05]; xe = nl[:, 0].max()
    r01 = V("pool_rubber01"); ns = r01[np.abs(r01[:, 0] - 1152.0) < 0.05]; ye = ns[:, 1].max()
    rec("mouth.corner_nose_ends", dict(long_cushion_nose_end=[round(float(xe), 1), 576.0], short_cushion_nose_end=[1152.0, round(float(ye), 1)]), "endpoints of the nose vertex lines (y=576 line of rubber06; x=1152 line of rubber01)")
    rec("mouth.corner_nose_to_nose", round(float(np.hypot(1152.0 - xe, ye - 576.0)), 1), "distance between the two nose-line endpoints (+x+y corner)")
    rec("mouth.side_nose_to_nose", round(float(2 * np.abs(r06[np.abs(r06[:, 1] - 576.0) < 0.05][:, 0]).min()), 1), "2 * min |x| on the y=576 nose line of rubber06 (rubber05 mirrors)")
    rec("mouth.cushion06_back_end_x", round(float(r06[:, 0].max()), 1), "max x of rubber06 (back/top corner)")
    rec("mouth.cushion06_end_face", dict(nose_end_x=round(float(xe), 1), back_end_x=round(float(r06[:, 0].max()), 1), delta=round(float(r06[:, 0].max() - xe), 1)), "cushion end is bevelled: back end reaches further into the pocket than the nose end")
    # --- boot throat at z=790/810 ---
    for zc in (790.0, 810.0):
        P = secpts("pool_leather01", 2, zc)
        u = (P[:, 0] + P[:, 1]) / np.sqrt(2); w = (P[:, 0] - P[:, 1]) / np.sqrt(2)
        rec(f"boot.corner01_plan_z{int(zc)}", dict(x=[round(float(P[:, 0].min()), 1), round(float(P[:, 0].max()), 1)], y=[round(float(P[:, 1].min()), 1), round(float(P[:, 1].max()), 1)], along_diag=[round(float(u.min()), 1), round(float(u.max()), 1)], across_diag_width=round(float(np.ptp(w)), 1)), "section AABB / diagonal extents (u=(x+y)/sqrt2 toward the corner)")
        P = secpts("pool_leather06", 2, zc)
        rec(f"boot.side06_plan_z{int(zc)}", dict(x=[round(float(P[:, 0].min()), 1), round(float(P[:, 0].max()), 1)], y=[round(float(P[:, 1].min()), 1), round(float(P[:, 1].max()), 1)]), "section AABB")
    P = secpts("pool_leather06", 2, 790.0); inner = P[P[:, 1] < 680]
    rec("boot.side06_inner_lip_z790", dict(x=[round(float(inner[:, 0].min()), 1), round(float(inner[:, 0].max()), 1)], y_min=round(float(inner[:, 1].min()), 1)), "section points with y<680 (the lip facing the table)")
    # --- cap profile at x=600 (+y long rail) ---
    P = secpts("pool_kant05", 0, 600.0)
    prof = []
    for yq in (628, 640, 660, 680, 700, 720, 740, 750, 754):
        sel = P[np.abs(P[:, 1] - yq) < 1.0]
        if len(sel): prof.append((yq, round(float(sel[:, 2].max()), 1), round(float(sel[:, 2].min()), 1)))
    rec("cap.profile_x600_top_bottom_z_by_y", prof, "for y bins +-1 mm: max z (top surface) and min z (underside) of the kant05 section at x=600")
    rec("cap.underside_z", round(float(np.median(P[P[:, 2] < 775][:, 2])), 2), "median z of cap section points below 775 -> the cap underside sits ON the bed plane")
    rec("cap.outer_edge", dict(y_max=round(float(P[:, 1].max()), 1), z_at_ymax=round(float(P[np.argmax(P[:, 1]), 2]), 1), top_z_at_y740=round(float(P[np.abs(P[:, 1] - 740) < 1][:, 2].max()), 1)), "outer edge of the cap section")
    # --- apron slope ---
    for n in ("pool_kant_side02",):
        P = secpts(n, 0, 600.0); P = P[P[:, 1] > 0]
        top = P[P[:, 2] > 765]; bot = P[P[:, 2] < 645]
        rec("apron.section_x600", dict(top_outer_y=round(float(top[:, 1].max()), 1), top_inner_y=round(float(top[:, 1].min()), 1), bot_outer_y=round(float(bot[:, 1].max()), 1), bot_inner_y=round(float(bot[:, 1].min()), 1), z=[round(float(P[:, 2].min()), 1), round(float(P[:, 2].max()), 1)]), "x=600 cut of the +y apron: outer/inner y at top and bottom")
        dy = float(top[:, 1].max() - bot[:, 1].max()); dz = float(P[:, 2].max() - P[:, 2].min())
        rec("apron.face_slope_deg", round(float(np.degrees(np.arctan2(dy, dz))), 1), "atan(outward overhang / height): face leans outward going up")
        rec("apron.thickness", round(float(top[:, 1].max() - top[:, 1].min()), 1), "top outer - top inner at x=600")
    # --- cabinet panel slopes ---
    for n, axis, cs in (("pool_side02", 2, (380.0, 533.0, 690.0)), ("pool_front", 2, (380.0, 533.0, 690.0))):
        row = {}
        for c in cs:
            P = secpts(n, 2, c)
            row[str(c)] = dict(x=[round(float(P[:, 0].min()), 1), round(float(P[:, 0].max()), 1)], y=[round(float(P[:, 1].min()), 1), round(float(P[:, 1].max()), 1)])
        rec(f"cabinet.{n}_plan_by_z", row, "plan cut AABB at z=380/533/690")
    P = secpts("pool_front", 1, 0.0); P = P[P[:, 0] > 1000]
    rec("cabinet.pool_front_end_profile_y0", dict(x_at_z_bins=[(zq, round(float(P[np.abs(P[:, 2] - zq) < 3][:, 0].max()), 1)) for zq in (370, 400, 450, 500, 550, 600, 650, 690) if (np.abs(P[:, 2] - zq) < 3).any()]), "y=0 cut, +x end: max x per z bin")
    P = secpts("pool_front", 2, 533.0); E = P[P[:, 0] > 1100]
    rec("cabinet.end_face_z533_x_by_y", [(float(yq), round(float(E[np.abs(E[:, 1] - yq) < 5][:, 0].max()), 1)) for yq in (-450, -300, -200, -100, 0, 100, 200, 300, 450) if (np.abs(E[:, 1] - yq) < 5).any()], "z=533 cut, +x end: max x per y bin (looks for the ball-return recess)")
    # --- leg taper fit ---
    zs = []; ws = []
    for zc in (10, 55, 100, 200, 305, 400, 500, 555, 620):
        P = secpts("pool_leg_out01", 2, float(zc)); zs.append(zc); ws.append(float(np.ptp(P[:, 0])))
    a, b = np.polyfit(zs, ws, 1)
    rec("legs.taper_fit_out", dict(width_mm_per_mm=round(float(a), 4), width_at_z5=round(float(a * 5 + b), 1), width_at_z625=round(float(a * 625.3 + b), 1), face_angle_deg=round(float(np.degrees(np.arctan(a / 2))), 2), samples=list(zip(zs, [round(w, 1) for w in ws]))), "linear fit of leg_out01 section width vs z")
    P = secpts("pool_leg_out01", 2, 300.0)
    xs = np.sort(np.unique(np.round(P[:, 0], 1)))
    rec("legs.z300_section_x_levels", [float(x) for x in xs[:12]] + ["..."], "unique x of the z=300 leg01 section (shell wall + corner slot positions)")
    # --- traps: shape (cup) ---
    P = secpts("pool_trap01", 2, 700.0); rec("traps.trap01_plan_z700", dict(x=[round(float(P[:, 0].min()), 1), round(float(P[:, 0].max()), 1)], y=[round(float(P[:, 1].min()), 1), round(float(P[:, 1].max()), 1)]), "plan cut of the corner cup at z=700")
    P = secpts("pool_trap01", 2, 640.0); rec("traps.trap01_plan_z640", dict(x=[round(float(P[:, 0].min()), 1), round(float(P[:, 0].max()), 1)], y=[round(float(P[:, 1].min()), 1), round(float(P[:, 1].max()), 1)]) if P is not None else None, "plan cut at z=640")
    # --- kant_support plan ---
    P = secpts("pool_kant_support", 2, 800.0); rec("kant_support.plan_z800", dict(abs_x_max=round(float(np.abs(P[:, 0]).max()), 1), abs_y_max=round(float(np.abs(P[:, 1]).max()), 1)), "plan cut at z=800: outer extent (cap outer at 1330.7/754.7 -> support is inside the cap)")
    P = secpts("pool_kant_support", 2, 700.0); rec("kant_support.plan_z700", dict(abs_x_max=round(float(np.abs(P[:, 0]).max()), 1), abs_y_max=round(float(np.abs(P[:, 1]).max()), 1)), "plan cut at z=700 (apron outer at 1311.3/735.3 -> support strip is inside the apron)")
    # --- floor-to-cap ---
    rec("overall.floor_to_cap_top", dict(from_z0=814.7, from_leg_foot=round(814.68 - 5.03, 1), inches_from_z0=round(814.68 / 25.4, 2), inches_from_foot=round((814.68 - 5.03) / 25.4, 2)), "cap max z minus 0 / minus leg foot z")
    rec("overall.floor_to_bed", dict(from_z0=770.0, from_leg_foot=round(770.0 - 5.03, 1)), "bed top minus floor datum")
    rec("overall.playing_surface_nose_to_nose", dict(mm=[2304.0, 1152.0], inches=[round(2304 / 25.4, 2), round(1152 / 25.4, 2)]), "2*1152 x 2*576")
    rec("overall.envelope_inches", [round(2661.5 / 25.4, 2), round(1509.5 / 25.4, 2)], "rails AABB in inches")


# ---------------------------------------------------------------------------------------------------------------------
def measure4(nodes, G, rec):
    V = lambda n: nodes[n]["V"]; F = lambda n: nodes[n]["F"]
    cross_vals = common.cross_vals
    S = objlib.project(objlib.section(V("pool_kant05"), F("pool_kant05"), 0, 600.0), 0)  # (y,z)
    prof = []
    for yq in (628, 630, 640, 660, 680, 700, 720, 730, 740, 745, 750, 753, 754.5):
        v = cross_vals(S, yq, 0)
        if len(v): prof.append((yq, round(float(v.max()), 1), round(float(v.min()), 1)))
    rec("cap.profile_x600_interp", prof, "kant05 section at x=600: (y, top z, bottom z) by interpolating the segments")
    Sc = objlib.project(objlib.section(V("pool_rubber06"), F("pool_rubber06"), 0, 600.0), 0)
    prof = []
    for yq in (576.5, 578, 580, 585, 590, 595, 600, 605, 610, 615, 620, 625, 627, 630):
        v = cross_vals(Sc, yq, 0)
        if len(v): prof.append((yq, round(float(v.max()), 1), round(float(v.min()), 1)))
    rec("cushion.profile_x600_interp", prof, "rubber06 section at x=600: (y, top z, bottom z)")
    rec("cushion.under_nose_face_angle_deg", round(float(np.degrees(np.arctan2(601.4 - 576.0, 805.9 - 770.0))), 1), "atan(25.4/35.9): undercut face from the nose tip to the base front edge, from vertical")
    S = objlib.project(objlib.section(V("pool_front"), F("pool_front"), 2, 533.0), 2)  # (x,y) at z=533
    row = []
    for yq in (-480, -450, -400, -300, -200, -150, -100, -50, 0, 50, 100, 150, 200, 300, 400, 450, 480):
        v = cross_vals(S, yq, 1); v = v[v > 1000]
        if len(v): row.append((yq, round(float(v.max()), 1)))
    rec("cabinet.end_face_x_by_y_z533", row, "z=533 plan cut of pool_front: max x for each y (interpolated) -> recess if x drops")
    Sy = objlib.project(objlib.section(V("pool_front"), F("pool_front"), 1, 0.0), 1)  # (x,z) at y=0
    row = []
    for zq in (370, 380, 400, 450, 500, 550, 575, 600, 626, 650, 690, 700):
        v = cross_vals(Sy, zq, 1); v = v[v > 1000]
        if len(v): row.append((zq, round(float(v.max()), 1)))
    rec("cabinet.end_face_x_by_z_y0", row, "y=0 elevation cut of pool_front: max x per z at the +x end")
    Sy = objlib.project(objlib.section(V("pool_front"), F("pool_front"), 1, 300.0), 1)
    row = []
    for zq in (370, 400, 450, 500, 550, 575, 600, 626, 650, 690):
        v = cross_vals(Sy, zq, 1); v = v[v > 1000]
        if len(v): row.append((zq, round(float(v.max()), 1)))
    rec("cabinet.end_face_x_by_z_y300", row, "y=300 elevation cut of pool_front: max x per z at the +x end")
    pf = V("pool_front"); e = pf[pf[:, 0] > 1100]
    rec("cabinet.pool_front_end_vertex_yz_clusters", dict(n=int(len(e)), y_levels=sorted(set(np.round(e[:, 1], 0).tolist())), z_levels=sorted(set(np.round(e[:, 2], 0).tolist()))), "vertices of pool_front with x>1100")
    e = pf[pf[:, 0] < -1100]
    rec("cabinet.pool_front_negx_end_vertex_yz_clusters", dict(n=int(len(e)), y_levels=sorted(set(np.round(e[:, 1], 0).tolist())), z_levels=sorted(set(np.round(e[:, 2], 0).tolist()))), "vertices of pool_front with x<-1100")
    rec("cabinet.end_face_slope", dict(dx=round(1161.4 - 1137.8, 1), dz=310.0, deg=round(float(np.degrees(np.arctan((1161.4 - 1137.8) / 310.0))), 2)), "pool_front end x at z=690 minus z=380")
    rec("cabinet.side_panel_slope", dict(dy=round(581.4 - 557.8, 1), dz=310.0, deg=round(float(np.degrees(np.arctan((581.4 - 557.8) / 310.0))), 2)), "pool_side02 outer y at z=690 minus z=380")
    rec("cabinet.recess_end_at_apron_bottom_lip", round(1299.3 - 1161.4, 1), "apron end face at its bottom edge (z~640) 1299.3 minus cabinet end at z=690 1161.4")
    rec("cabinet.recess_side_at_apron_bottom_lip", round(723.3 - 581.4, 1), "apron side face bottom edge 723.3 minus side panel outer at z=690 581.4")
    rec("cabinet.recess_end_at_apron_top_lip", round(1324.3 - 1162.1, 1), "apron top lip 1324.3 minus pool_front max x 1162.1 (= the SBS-3 162)")
    rec("cabinet.recess_side_at_apron_top_lip", round(748.3 - 582.1, 1), "apron top lip 748.3 minus pool_side max y 582.1 (= the SBS-3 166)")


# ---------------------------------------------------------------------------------------------------------------------
def measure_recess(nodes, G, rec):
    """Ball-return openings in the cabinet end wall (reconstructed). NOTE the source record's -x rows were null because of
    a sign slip in the unsaved script; this port evaluates both ends sign-correctly. Key names follow the source record."""
    V = lambda n: nodes[n]["V"]; F = lambda n: nodes[n]["F"]
    def secpts(n, axis, c):
        return objlib.section(V(n), F(n), axis, c).reshape(-1, 3)
    for zc, kname in ((600.0, "posx_z600"), (480.0, "z480")):
        P = secpts("pool_front", 2, zc)
        for sgn, end in ((1, "pos_x"), (-1, "neg_x")):
            E = P[sgn * P[:, 0] > 1000]; outer = float(np.abs(E[:, 0]).max()); inner = E[np.abs(E[:, 0]) < outer - 5]
            val = dict(outer_face_abs_x=round(outer, 1), back_wall_abs_x=round(float(np.abs(inner[:, 0]).min()), 1) if len(inner) else None,
                       opening_y=[round(float(inner[:, 1].min()), 1), round(float(inner[:, 1].max()), 1)] if len(inner) else None,
                       depth=round(outer - float(np.abs(inner[:, 0]).min()), 1) if len(inner) else None)
            rec(f"recess.{end}.{kname}", val, f"plan cut z={zc}: outer face |x|, back wall |x| (points >5 mm inside), y range of the inner points")
    Sy = objlib.project(objlib.section(V("pool_front"), F("pool_front"), 1, 0.0), 1)  # (x,z)
    for sgn, end in ((1, "pos_x"), (-1, "neg_x")):
        runs = []; cur = None
        for z in range(366, 701):
            xs = common.cross_vals(Sy, float(z), 1); xs = xs[sgn * xs > 1000]
            has_outer = len(xs) > 0 and np.abs(xs).max() > 1100
            if not has_outer:
                if cur is None: cur = [float(z), float(z)]
                else: cur[1] = float(z)
            elif cur is not None:
                runs.append(cur); cur = None
        if cur is not None: runs.append(cur)
        rec(f"recess.{end}.z_runs_at_y0", runs, "z bands (1 mm steps) where the y=0 elevation cut has no outer end face (opening), 366..700")
    pf = V("pool_front")
    for sgn, end in ((1, "pos_x"), (-1, "neg_x")):
        e = pf[(sgn * pf[:, 0] > 1000) & (np.abs(pf[:, 1]) < 300)]
        rec(f"recess.{end}.vertex_clusters", dict(y=sorted(set(np.round(e[:, 1], 0).tolist())), z=sorted(set(np.round(e[:, 2], 0).tolist())), abs_x=sorted(set(np.round(np.abs(e[:, 0]), 0).tolist()))), "pool_front verts near the end with |y|<300")
    # ad-hoc opening probes (the source record carries these four without method strings; windows reconstructed)
    for key, sgn, zc, yw in (("posx_small_z600", 1, 600.0, 150.0), ("negx_small_z600", -1, 600.0, 150.0), ("negx_large_z480", -1, 480.0, 180.0), ("posx_z480_control", 1, 480.0, 180.0)):
        P = secpts("pool_front", 2, zc); E = P[(sgn * P[:, 0] > 1000) & (np.abs(P[:, 1]) < yw)]
        rec.M[key] = dict(abs_x_levels=sorted(set(float(x) for x in np.round(np.abs(E[:, 0]), 1))), n=int(len(E)),
                          method=f"plan cut z={zc:g}, end {'+x' if sgn > 0 else '-x'}, |y|<{yw:g}: unique |x| levels (0.1 mm) and point count -- empty = the cut passes through an opening")


def run(cfg, nodes, G, log=print, verbose=False):
    rec = Rec(log if verbose else None)
    for fn in (measure1, measure2, measure3, measure4, measure_recess):
        fn(nodes, G, rec)
    M = rec.M
    header = dict(source="3dsky 'Diamond Pro-Am 8ft' purchased model, quarantine " + os.path.dirname(cfg.model_obj_dir.rstrip("/")) + " (never into the repo)",
                  frame="3ds Max world, mm, Z-up: X along the length, Y across the width, Z up; bed top z = 770.0; table centre (0,0); floor: leg feet z = 5.03, scene zero 0.0",
                  date=__import__("datetime").date.today().isoformat(), tool="tools/render/d621/align/measure_model.py (regenerated at run time; base cages, modifiers not applied)",
                  units="mm", n_keys=len(M), quarantine="numbers + method strings only; no vertex, texture, silhouette or section data")
    out = collections.OrderedDict([("_header", header)]); out.update(M)
    os.makedirs(cfg.model_dir, exist_ok=True)
    common.dump_json(out, os.path.join(cfg.model_dir, "measurements.json"))
    log(f"[measure_model] {len(M)} keys -> {os.path.join(cfg.model_dir, 'measurements.json')}")
    return out


def compare(regen, committed):
    """Keys whose value differs between the regenerated record and the committed one (both may carry a _header)."""
    a = {k: v for k, v in regen.items() if k != "_header"}; b = {k: v for k, v in committed.items() if k != "_header"}
    diffs = []
    for k in sorted(set(a) | set(b)):
        def val(x):
            if isinstance(x, dict) and "value" in x: return x["value"]
            if isinstance(x, dict): return {kk: vv for kk, vv in x.items() if kk != "method"}
            return x
        va = json.dumps(val(a[k]), sort_keys=True, default=common.json_default) if k in a else None
        vb = json.dumps(val(b[k]), sort_keys=True, default=common.json_default) if k in b else None
        if va != vb: diffs.append(dict(key=k, regenerated=va, committed=vb))
    return diffs


if __name__ == "__main__":
    cfg, a = paths.from_args(description=__doc__, extra=lambda p: p.add_argument("--verbose", action="store_true"))
    nodes, G = common.load_model(cfg.model_obj_dir)
    run(cfg, nodes, G, verbose=a.verbose)
