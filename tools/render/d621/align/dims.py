# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Dimension delta table (port of Task C dims.py; unchanged): every Task B measurement, taken with the SAME method on the
model (cross-check) and on ours. Output: <out>/data/dims.json (per side, with method strings), dims_rows.json (flat rows
with delta / delta %)."""
import json
import math
import os

import numpy as np

import common
import objlib
import paths

ZT = paths.BED_Z


def aabb_centre(V): mn, mx = V.min(0), V.max(0); return (mn + mx) / 2, mx - mn
def sec(src, names, axis, c):
    S = [objlib.section(src[n]["V"], src[n]["F"], axis, c) for n in names]
    S = [s for s in S if len(s)]
    return np.concatenate(S) if S else np.zeros((0, 2, 3))
def pts(src, names, axis, c):
    s = sec(src, names, axis, c); return s.reshape(-1, 3) if len(s) else np.zeros((0, 3))
def cat(src, names): return np.vstack([src[n]["V"] for n in names]) if names else np.zeros((0, 3))
def r(x, k=1): return None if x is None else round(float(x), k)


def element_maps(OG, MG):
    M_E = dict(caps=MG["rail_caps"], corners=MG["rail_corners"], band=MG["rail_side"], cabinet=list(MG["cabinet"]),
               legs=MG["legs_out"], leg_pp=["pool_leg_out01"], leg_pp_core=["pool_leg_in01"], cushions=MG["cushions"], boots=MG["boots"], sights=MG["sights"],
               traps=MG["traps"], screws=MG["screws"], bed=["pool_top"], subrail=[], casting=MG["rail_corners"], liner=[], foot=MG["legs_out"], door=[])
    g = lambda k: list(OG.get(k, []))
    # D621-PLAN-3-RECORD-2 addendum (review r5 P2): ours builds a distinct cabinet (dm-cabinet-end-* / -side-* / bottom board) under the
    # apron band (dm-apronband*) — the map used to put every 'apron' family mesh into the band and hard-code cabinet=[], so the
    # dimension rows printed "NO cabinet" for a table that has one. Split by name (families.py's own split rules): band = the apron
    # band only; cabinet = dm-cabinet-* except the screws (legbolt) and the unlit trough plates inside it.
    import re as _re
    apron_all = g("apron")
    band_names = [n for n in apron_all if _re.match(r"dm-apronband", n)]
    cabinet_names = [n for n in apron_all if _re.match(r"dm-cabinet-(?!screw-|trough-)", n)]
    O_E = dict(caps=g("railtop"), corners=g("casting"), band=band_names or apron_all, cabinet=cabinet_names, legs=g("leg"), leg_pp=[n for n in g("leg") if n.endswith("-fl")], leg_pp_core=[n for n in g("leveler") if n.endswith("-fl")],
               cushions=g("cushion"), boots=g("boot"), sights=g("sight"), traps=g("ballreturn"), screws=g("legbolt"), bed=g("bed"), subrail=g("subrail"), casting=g("casting"),
               liner=g("liner"), foot=g("leveler"), door=g("brdoor"))
    return M_E, O_E


def pick_cushions(src, names):
    """+Y long cushion(s), the +x half of them, and the +x short cushion."""
    posY = [n for n in names if src[n]["V"][:, 1].min() > 300 and src[n]["V"][:, 1].max() > 500 and np.ptp(src[n]["V"][:, 0]) > 800]
    posY_px = [n for n in posY if src[n]["V"][:, 0].max() > 900]
    posX = [n for n in names if src[n]["V"][:, 0].min() > 900]
    return posY, posY_px, posX


def pick_boot(src, names, corner=True):
    out = []
    for n in names:
        c, e = aabb_centre(src[n]["V"])
        if corner and c[0] > 900 and c[1] > 300: out.append(n)
        if (not corner) and abs(c[0]) < 200 and c[1] > 300: out.append(n)
    return out


def measure(src, E, tag):
    R = {}
    def rec(k, v, m): R[k] = dict(value=v, method=m)
    caps = cat(src, E["caps"]); band = cat(src, E["band"]); cush_all = cat(src, E["cushions"])
    posY, posY_px, posX = pick_cushions(src, E["cushions"])
    cY = cat(src, posY); cYpx = cat(src, posY_px); cX = cat(src, posX)
    # 1 envelope
    rec("1.envelope_rails_x", r(np.ptp(caps[:, 0])), "rail caps (+corner blocks/castings) AABB extent x")
    rec("1.envelope_rails_y", r(np.ptp(caps[:, 1])), "rail caps AABB extent y")
    rec("1.envelope_apron_x", r(np.ptp(band[:, 0])), "apron band / skirt AABB extent x")
    rec("1.envelope_apron_y", r(np.ptp(band[:, 1])), "apron band / skirt AABB extent y")
    # 2 rail band nose->outer (sections at x=600 / y=0)
    Pc = pts(src, posY, 0, 600.0); Pk = pts(src, E["caps"], 0, 600.0)
    noseY = Pc[Pc[:, 1] > 0][:, 1].min(); capY = Pk[Pk[:, 1] > 0][:, 1].max()
    rec("2.rail_band_long_mid", r(capY - noseY), f"+y long rail, section x=600: cushion nose y={noseY:.1f} (min y) to cap outer y={capY:.1f} (max y)")
    Pc2 = pts(src, posX, 1, 0.0); Pk2 = pts(src, E["caps"], 1, 0.0)
    noseX = Pc2[:, 0].min(); capX = Pk2[Pk2[:, 0] > 0][:, 0].max()
    rec("2b.rail_band_short_mid", r(capX - noseX), f"+x short rail, section y=0: nose x={noseX:.1f} to cap outer x={capX:.1f}")
    lip = np.abs(caps[(caps[:, 0] > -1000) & (caps[:, 0] < 1000)][:, 1]).min()
    rec("2c.cap_inner_lip_abs_y", r(lip), "min |y| of long-rail cap vertices (cap inner lip)")
    rec("2c.cap_width_plan", r(capY - lip), "cap outer - inner lip")
    rec("2c.nose_to_cap_lip", r(lip - noseY), "cap inner lip - cushion nose")
    rec("2c.cushion_back_abs_y", r(cY[:, 1].max()), "max y of the +y cushion (back)")
    rec("2c.cushion_back_overlaps_cap_lip", r(cY[:, 1].max() - lip), "cushion back - cap lip (positive = cushion tucks under/behind the cap lip)")
    # 3 cap top / profile
    rec("3.cap_top_above_bed", r(caps[:, 2].max() - ZT, 2), "max z of rail caps - 770")
    capsec = objlib.project(sec(src, [n for n in E["caps"] if src[n]["V"][:, 1].max() > 700 and src[n]["V"][:, 0].min() < 600 < src[n]["V"][:, 0].max()], 0, 600.0), 0)
    prof = []
    for yq in (lip + 0.6, 630, 640, 660, 680, 700, 720, 730, 740, 745, 750, 753, 754.5, capY - 0.2):
        v = common.cross_vals(capsec, yq, 0)
        if len(v): prof.append((r(yq), r(v.max()), r(v.min())))
    rec("3.cap_profile_x600", prof, "cap section at x=600 (+y long rail): (y, top z, bottom z)")
    below = capsec.reshape(-1, 2); below = below[below[:, 1] < 775]
    rec("3b.cap_underside_z", r(np.median(below[:, 1]), 2) if len(below) else None, "median z of cap-section points below 775")
    rec("3b.cap_min_z", r(caps[:, 2].min(), 2), "min z of the rail caps")
    # 4-6 cushion
    rec("4.cushion_depth_nose_to_back", r(np.ptp(cY[:, 1]), 2), "ptp across the rail of the +y cushion vertices")
    base = cY[np.abs(cY[:, 2] - ZT) < 0.05]
    rec("4.cushion_base_footprint_y", [r(base[:, 1].min()), r(base[:, 1].max())] if len(base) else None, "vertices at z=770 (base on the bed)")
    nose_line = cY[np.abs(cY[:, 1] - noseY) < 0.05]
    nz = nose_line[:, 2].mean()
    rec("6.nose_height_above_bed", r(nz - ZT, 2), "z of the innermost vertex line - 770")
    rec("6.nose_line_z_spread", r(np.ptp(nose_line[:, 2]), 2), "ptp z over the nose line")
    rec("6.nose_pct_of_ball", r(100 * (nz - ZT) / 57.15, 1), "% of 57.15 mm ball")
    if len(base): rec("4.under_nose_face_angle_deg", r(math.degrees(math.atan2(base[:, 1].min() - noseY, nz - ZT))), "atan((base front edge - nose)/(nose height)) from vertical")
    rec("5.cushion_top_above_bed", r(cY[:, 2].max() - ZT, 2), "max z of the +y cushion - 770")
    csec = objlib.project(sec(src, [n for n in posY if src[n]["V"][:, 0].min() < 600 < src[n]["V"][:, 0].max()], 0, 600.0), 0)
    prof = []
    for yq in (noseY + 0.5, noseY + 2, noseY + 4, noseY + 9, noseY + 14, noseY + 19, noseY + 24, noseY + 29, noseY + 34, noseY + 39, noseY + 44, noseY + 49, noseY + 51, cY[:, 1].max() - 0.3):
        v = common.cross_vals(csec, yq, 0)
        if len(v): prof.append((r(yq), r(v.max()), r(v.min())))
    rec("4.cushion_profile_x600", prof, "cushion section at x=600: (y, top z, bottom z) at nose+0.5..+51 and the back")
    # 6b mouths
    nl = cYpx[np.abs(cYpx[:, 1] - noseY) < 0.05]; xe = nl[:, 0].max()
    ns = cX[np.abs(cX[:, 0] - noseX) < 0.05]; ye = ns[:, 1].max()
    rec("6b.corner_mouth_nose_ends", dict(long=[r(xe), r(noseY)], short=[r(noseX), r(ye)]), "endpoints of the nose vertex lines (+x+y corner)")
    rec("6b.corner_mouth_nose_to_nose", r(math.hypot(noseX - xe, ye - noseY)), "distance between the two nose-line endpoints")
    rec("6b.side_mouth_nose_to_nose", r(2 * np.abs(nl[:, 0]).min()), "2 * min |x| on the +y nose line (+x half)")
    rec("6b.cushion_back_end_x", r(cYpx[:, 0].max()), "max x of the +y +x cushion (back end)")
    rec("6b.cushion_end_bevel_delta", r(cYpx[:, 0].max() - xe), "back end x - nose end x")
    # 7 corner block / casting
    cb = []
    for n in E["corners"]:
        v = src[n]["V"]; c, e = aabb_centre(v); u, w = objlib.oriented_extents_45(v)
        cb.append(dict(node=n, aabb=[r(e[0]), r(e[1]), r(e[2])], diag=[r(u), r(w)], zmin=r(v[:, 2].min()), zmax=r(v[:, 2].max()), top_above_bed=r(v[:, 2].max() - ZT), centre=[r(c[0]), r(c[1])]))
    rec("7.corner_piece", cb, "per corner piece: AABB, extents along (1,1)/sqrt2 and (1,-1)/sqrt2, z range")
    # 8 corner boot (+x+y)
    bc = pick_boot(src, E["boots"], True); B = cat(src, bc)
    c, e = aabb_centre(B); u, w = objlib.oriented_extents_45(B)
    rec("8.corner_boot_plan_aabb", [r(e[0]), r(e[1])], "plan AABB of the +x+y boot part(s)")
    rec("8.corner_boot_centre", [r(c[0]), r(c[1])], "AABB centre")
    rec("8.corner_boot_diag_extents", [r(u), r(w)], "extents along/across the diagonal")
    rec("8.corner_boot_crest_above_bed", r(B[:, 2].max() - ZT), "max z - 770")
    rec("8.corner_boot_skirt_below_bed", r(ZT - B[:, 2].min()), "770 - min z")
    rim = B[(B[:, 2] > 814.0) & (B[:, 2] < 815.0)]
    rec("8.corner_boot_rim_ring_814_815", dict(n=int(len(rim)), plan=[r(np.ptp(rim[:, 0])), r(np.ptp(rim[:, 1]))] if len(rim) else None), "verts with 814<z<815 (the model's rim ring band)")
    for zc in (790.0, 810.0):
        P = pts(src, bc, 2, zc)
        if len(P):
            uu = (P[:, 0] + P[:, 1]) / np.sqrt(2); ww = (P[:, 0] - P[:, 1]) / np.sqrt(2)
            rec(f"8.corner_boot_plan_z{int(zc)}", dict(x=[r(P[:, 0].min()), r(P[:, 0].max())], y=[r(P[:, 1].min()), r(P[:, 1].max())], along_diag=[r(uu.min()), r(uu.max())], across_diag_width=r(np.ptp(ww))), f"section at z={zc:g}: AABB / diagonal extents")
    # 9 side boot (+y)
    sb = pick_boot(src, E["boots"], False); S = cat(src, sb)
    c, e = aabb_centre(S)
    rec("9.side_boot_plan_aabb", [r(e[0]), r(e[1])], "plan AABB of the +y side boot part(s)")
    rec("9.side_boot_centre", [r(c[0]), r(c[1])], "AABB centre")
    rec("9.side_boot_crest_above_bed", r(S[:, 2].max() - ZT), "max z - 770"); rec("9.side_boot_skirt_below_bed", r(ZT - S[:, 2].min()), "770 - min z")
    for zc in (790.0, 810.0):
        P = pts(src, sb, 2, zc)
        if len(P):
            inner = P[P[:, 1] < 680]
            rec(f"9.side_boot_plan_z{int(zc)}", dict(x=[r(P[:, 0].min()), r(P[:, 0].max())], y=[r(P[:, 1].min()), r(P[:, 1].max())], inner_lip_y_min=r(inner[:, 1].min()) if len(inner) else None), f"section at z={zc:g}: AABB; inner lip = min y of points with y<680")
    if E["liner"]:
        L = cat(src, E["liner"]); L = L[L[:, 1] > 0]; c, e = aabb_centre(L)
        rec("9.side_liner_plan_aabb", [r(e[0]), r(e[1])], "ours-only: liner-side plan AABB (+y)"); rec("9.side_liner_z", [r(L[:, 2].min()), r(L[:, 2].max())], "liner z range")
    # 10 apron band
    rec("10.apron_z_range", [r(band[:, 2].min()), r(band[:, 2].max())], "min/max z of the apron band / skirt"); rec("10.apron_height", r(np.ptp(band[:, 2])), "ptp z")
    P = pts(src, E["band"], 0, 600.0); P = P[P[:, 1] > 0]
    zt, zb = P[:, 2].max(), P[:, 2].min()
    top = P[P[:, 2] > zt - 5]; bot = P[P[:, 2] < zb + 8]
    rec("10.apron_section_x600", dict(top_outer_y=r(top[:, 1].max()), top_inner_y=r(top[:, 1].min()), bot_outer_y=r(bot[:, 1].max()), bot_inner_y=r(bot[:, 1].min()), z=[r(zb), r(zt)]), "x=600 cut of the +y apron: outer/inner y at the top and bottom edges")
    rec("10.apron_face_slope_deg", r(math.degrees(math.atan2(top[:, 1].max() - bot[:, 1].max(), zt - zb))), "atan(outward overhang / height); + = leans out going up")
    rec("10.apron_thickness", r(top[:, 1].max() - top[:, 1].min()), "top outer - top inner at x=600")
    for zc in (645.0, 700.0, 760.0):
        Q = pts(src, E["band"], 2, zc)
        if len(Q): rec(f"10.apron_plan_z{int(zc)}", dict(abs_x_max=r(np.abs(Q[:, 0]).max()), abs_y_max=r(np.abs(Q[:, 1]).max())), f"plan cut z={zc:g}: outer |x|, |y|")
    # 11 cabinet
    if E["cabinet"] and "pool_front" in src:
        C = cat(src, E["cabinet"]); pf = src["pool_front"]["V"]
        rec("11.cabinet_end_abs_x", r(pf[:, 0].max()), "pool_front max |x|"); rec("11.cabinet_side_abs_y", r(cat(src, ["pool_side02"])[:, 1].max()), "side panel max |y|")
        rec("11.cabinet_z", [r(pf[:, 2].min()), r(pf[:, 2].max())], "pool_front z range"); rec("11c.cabinet_height", r(np.ptp(pf[:, 2])), "ptp z")
        rec("11.recess_end_at_apron_top_lip", r(band[:, 0].max() - pf[:, 0].max()), "apron top-lip |x| - cabinet end |x|")
        rec("11.recess_end_at_apron_bottom_lip", r(np.abs(band[band[:, 2] < 645][:, 0]).max() - pf[:, 0].max()), "apron bottom-lip |x| - cabinet end |x|")
        rec("11d.body_bottom_z", r(pf[:, 2].min()), "lowest point of the cabinet/skirt body above scene zero")
    elif E["cabinet"]:
        # ours (D621-PLAN-3-RECORD-2 addendum): the distinct cabinet meshes — end walls (max |x|), side walls (max |y|), the body's z
        # range and height, and the recess of the end wall behind the apron band's top and bottom lips
        C = cat(src, E["cabinet"])
        ends = [n for n in E["cabinet"] if "-end-" in n] or E["cabinet"]; sides = [n for n in E["cabinet"] if "-side-" in n] or E["cabinet"]
        CE = cat(src, ends); CS = cat(src, sides)
        rec("11.cabinet_end_abs_x", r(np.abs(CE[:, 0]).max()), f"ours dm-cabinet end walls max |x| ({len(ends)} meshes)")
        rec("11.cabinet_side_abs_y", r(np.abs(CS[:, 1]).max()), f"ours dm-cabinet side walls max |y| ({len(sides)} meshes)")
        rec("11.cabinet_z", [r(C[:, 2].min()), r(C[:, 2].max())], f"ours dm-cabinet-* z range ({len(E['cabinet'])} meshes)"); rec("11c.cabinet_height", r(np.ptp(C[:, 2])), "ptp z of the cabinet meshes")
        band_top_lip = np.abs(band[band[:, 2] >= np.percentile(band[:, 2], 90)][:, 0]).max()
        band_bot_lip = np.abs(band[band[:, 2] <= np.percentile(band[:, 2], 10)][:, 0]).max()
        rec("11.recess_end_at_apron_top_lip", r(band_top_lip - np.abs(CE[:, 0]).max()), "apron band top-lip |x| (top 10 % of its z) - cabinet end wall |x|")
        rec("11.recess_end_at_apron_bottom_lip", r(band_bot_lip - np.abs(CE[:, 0]).max()), "apron band bottom-lip |x| (bottom 10 % of its z) - cabinet end wall |x|")
        rec("11d.body_bottom_z", r(C[:, 2].min()), "lowest point of the cabinet body above scene zero")
    else:
        rec("11.cabinet_end_abs_x", r(band[:, 0].max()), "NO cabinet: the skirt itself is the end face (flush)"); rec("11.cabinet_side_abs_y", r(band[:, 1].max()), "NO cabinet: skirt side face")
        rec("11.cabinet_z", [r(band[:, 2].min()), r(band[:, 2].max())], "skirt z range (no separate cabinet)"); rec("11c.cabinet_height", r(np.ptp(band[:, 2])), "skirt height")
        rec("11.recess_end_at_apron_top_lip", 0.0, "flush skirt: no recess"); rec("11.recess_end_at_apron_bottom_lip", 0.0, "flush skirt: no recess")
        rec("11d.body_bottom_z", r(band[:, 2].min()), "lowest point of the skirt above scene zero")
    foot = cat(src, E["foot"])[:, 2].min()
    rec("11d.body_bottom_clear_foot", r(R["11d.body_bottom_z"]["value"] - foot), f"body bottom - floor contact z ({foot:.1f})")
    if E["door"]:
        D = cat(src, E["door"]); c, e = aabb_centre(D)
        rec("11e.end_opening", dict(end="-x", size_y_z=[r(e[1]), r(e[2])], z=[r(D[:, 2].min()), r(D[:, 2].max())], abs_x=[r(np.abs(D[:, 0]).min()), r(np.abs(D[:, 0]).max())], kind="proud door box"), "ours: dm-ballreturn-door AABB")
    elif "pool_front" in src:
        rec("11e.end_opening", dict(end="both -x and +x", small=[304, 48], neg_x_large=[560, 98], z_small=[576, 624], z_large=[431, 529], kind="through-holes in the 16 mm end wall"), "model: Task B vertex clusters / y=0 z-runs")
    else:
        # D621-PLAN-3-RECORD-2 addendum: ours with no door box used to fall into the MODEL branch and print the model's constants as
        # its own — a row that measures nothing must say so
        rec("11e.end_opening", None, "ours: no dm-ballreturn-door mesh on this entry; the end openings are not measured by this row (the unlit trough plates dm-cabinet-trough-* stand behind them)")
    # 12 legs
    legs = cat(src, E["legs"]); per = []
    for n in E["legs"]:
        c, e = aabb_centre(src[n]["V"]); per.append(dict(node=n, centre=[r(c[0]), r(c[1])], plan=[r(e[0]), r(e[1])], z=[r(src[n]["V"][:, 2].min()), r(src[n]["V"][:, 2].max())]))
    rec("12.legs_per_leg", per, "AABB centre/plan/z per leg")
    cx = np.mean([abs(p["centre"][0]) for p in per]); cy = np.mean([abs(p["centre"][1]) for p in per])
    rec("12b.legs_centre_to_centre", [r(2 * cx), r(2 * cy)], "2*|centre|"); rec("12b.legs_outside_to_outside", [r(np.ptp(legs[:, 0])), r(np.ptp(legs[:, 1]))], "legs AABB")
    rec("12b.leg_outer_face_inset_from_rail_end", r(caps[:, 0].max() - legs[:, 0].max()), "cap outer |x| - leg outer |x|")
    rec("12c.legs_top_z", r(legs[:, 2].max(), 2), "max z"); rec("12c.legs_foot_z", r(foot, 2), "min z of the floor contact part")
    secs = {}
    for zc in (55.0, 305.0, 555.0, 100.0, 200.0, 400.0, 500.0):
        row = {}
        for n in E["leg_pp"] + E["leg_pp_core"]:
            P = pts(src, [n], 2, zc)
            if len(P): row[n] = dict(size=[r(np.ptp(P[:, 0])), r(np.ptp(P[:, 1]))], x=[r(P[:, 0].min()), r(P[:, 0].max())], y=[r(P[:, 1].min()), r(P[:, 1].max())])
        secs[str(zc)] = row
    rec("12.leg_pp_cross_sections", secs, "plane z=c cut of the +x+y leg: AABB size of the section")
    zs, ws = [], []
    for zc in np.arange(10, 625, 15.0):
        P = pts(src, E["leg_pp"], 2, float(zc))
        if len(P): zs.append(zc); ws.append(float(np.ptp(P[:, 0])))
    if len(zs) >= 2:
        a, b = np.polyfit(zs, ws, 1)
        rec("12.leg_taper_fit", dict(width_mm_per_mm=r(a, 4), width_at_foot=r(a * min(zs) + b), width_at_top=r(a * max(zs) + b), face_angle_deg=r(math.degrees(math.atan(a / 2)), 2), z_span=[r(min(zs)), r(max(zs))]), "linear fit of section width vs z over the leg's own z span")
    # 13 sights
    S = {}
    for n in E["sights"]:
        c, e = aabb_centre(src[n]["V"]); S[n] = dict(centre=[r(c[0]), r(c[1])], size=[r(e[0]), r(e[1])], z=r(src[n]["V"][:, 2].max()))
    longs = sorted(set(s["centre"][0] for s in S.values() if abs(s["centre"][1]) > 600)); shorts = sorted(set(s["centre"][1] for s in S.values() if abs(s["centre"][0]) > 1200))
    ly = min(abs(s["centre"][1]) for s in S.values() if abs(s["centre"][1]) > 600); sx = min(abs(s["centre"][0]) for s in S.values() if abs(s["centre"][0]) > 1200)
    anyl = next(s for s in S.values() if abs(s["centre"][1]) > 600); anys = next(s for s in S.values() if abs(s["centre"][0]) > 1200)
    rec("13.sight_size_long_rail_along_x_across_y", anyl["size"], "AABB of a long-rail sight: [along the rail (x), across (y)]")
    rec("13.sight_size_short_rail_across_x_along_y", anys["size"], "AABB of a short-rail sight: [across (x), along (y)]")
    rec("13.sight_plane_z_vs_cap_top", r(anyl["z"] - caps[:, 2].max(), 2), "sight z - cap max z")
    rec("13.sights_long_rail_x", longs, "centres x, |y|>600"); rec("13.sights_short_rail_y", shorts, "centres y, |x|>1200")
    rec("13c.sight_pitch_long", r(np.median(np.diff(longs)[np.diff(longs) < 400])), "median spacing on the long rails"); rec("13c.sight_pitch_short", r(np.median(np.diff(shorts))), "spacing on the short rails")
    rec("13c.sight_gap_across_side_pocket", r(2 * min(abs(x) for x in longs)), "x gap between the sights flanking the side pocket")
    rec("13b.sight_inset_from_nose_long", r(ly - noseY), f"|y| centre {ly:.1f} - nose {noseY:.1f}"); rec("13b.sight_inset_from_nose_short", r(sx - noseX), f"|x| centre {sx:.1f} - nose {noseX:.1f}")
    rec("13b.sight_inset_from_cap_outer_long", r(capY - ly), "cap outer - |y| centre"); rec("13b.sight_inset_from_cap_outer_short", r(capX - sx), "cap outer - |x| centre")
    L = 2 * noseX; Wd = 2 * noseY
    rec("17.playing_surface_nose_to_nose", [r(L), r(Wd)], "2*nose x, 2*nose y"); rec("17.playing_surface_inches", [r(L / 25.4, 2), r(Wd / 25.4, 2)], "in inches")
    rec("13c.L_over_8_W_over_4", [r(L / 8, 2), r(Wd / 4, 2)], "expected diamond pitch from the playing surface")
    # 14 traps / ball return
    T = []
    for n in E["traps"]:
        v = src[n]["V"]; c, e = aabb_centre(v); T.append(dict(node=n, centre=[r(c[0]), r(c[1])], plan=[r(e[0]), r(e[1])], z_rel_bed=[r(v[:, 2].min() - ZT), r(v[:, 2].max() - ZT)]))
    rec("14.pocket_cups", T, "AABB per below-bed pocket part; z relative to the bed")
    # 15 screws / bolts
    if E["screws"]:
        SC = cat(src, E["screws"]); heads = [np.ptp(src[n]["V"][:, :2], axis=0).max() for n in E["screws"]]
        rec("15.fasteners", dict(n=len(E["screws"]), aabb_x=[r(SC[:, 0].min()), r(SC[:, 0].max())], aabb_y=[r(SC[:, 1].min()), r(SC[:, 1].max())], z=[r(SC[:, 2].min()), r(SC[:, 2].max())], head_dia_max=r(max(heads))), "group AABB, count, largest head diameter")
    # bed
    bed = cat(src, E["bed"]); top = bed[np.abs(bed[:, 2] - ZT) < 0.05]
    rec("bed.top_face_extent", [r(np.ptp(top[:, 0])), r(np.ptp(top[:, 1]))], "verts at z=770")
    cc = top[(top[:, 0] > 1000) & (top[:, 1] > 400)]
    rec("bed.corner_cutout_pp", dict(n=int(len(cc)), xmin=r(cc[:, 0].min()) if len(cc) else None, ymin=r(cc[:, 1].min()) if len(cc) else None), "verts at z=770 in the +x+y corner region")
    rec("bed.slab_z", [r(bed[:, 2].min()), r(bed[:, 2].max())], "bed part z range")
    # overall
    rec("overall.floor_to_cap_top", dict(mm=r(caps[:, 2].max() - foot), inches=r((caps[:, 2].max() - foot) / 25.4, 2)), "cap max z - floor contact z")
    rec("overall.floor_to_bed", dict(mm=r(ZT - foot), inches=r((ZT - foot) / 25.4, 2)), "770 - floor contact z")
    rec("overall.envelope_inches", [r(np.ptp(caps[:, 0]) / 25.4, 2), r(np.ptp(caps[:, 1]) / 25.4, 2)], "rails AABB in inches")
    if E["subrail"]:
        sr = cat(src, E["subrail"]); srY = sr[sr[:, 1] > 300]
        rec("x.subrail", dict(y=[r(srY[:, 1].min()), r(srY[:, 1].max())], z=[r(sr[:, 2].min()), r(sr[:, 2].max())], top_above_bed=r(sr[:, 2].max() - ZT)), "ours-only: sub-rail block")
    if E["casting"] and tag == "ours":
        cs = cat(src, E["casting"]); rec("x.casting_z", [r(cs[:, 2].min() - ZT), r(cs[:, 2].max() - ZT)], "ours-only: casting z relative to the bed")
    return R


def flat(prefix, v):
    if isinstance(v, dict):
        for k, x in v.items(): yield from flat(f"{prefix}.{k}", x)
    elif isinstance(v, (list, tuple)):
        if all(isinstance(x, (int, float, type(None))) for x in v) and len(v) <= 3:
            for i, x in enumerate(v): yield (f"{prefix}[{i}]", x)
        else:
            yield (prefix, json.dumps(v))
    else:
        yield (prefix, v)


def rows_from(RM, RO):
    rows = []
    keys = list(dict.fromkeys(list(RM.keys()) + list(RO.keys())))
    for k in keys:
        fm = dict(flat(k, RM[k]["value"])) if k in RM else {}
        fo = dict(flat(k, RO[k]["value"])) if k in RO else {}
        for kk in dict.fromkeys(list(fm.keys()) + list(fo.keys())):
            a = fm.get(kk); b = fo.get(kk)
            if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
                dlt = b - a; pct = (100 * dlt / abs(a)) if abs(a) > 1e-9 else None
                rows.append(dict(key=kk, model=a, ours=b, delta=round(dlt, 2), delta_pct=None if pct is None else round(pct, 1), method_model=RM.get(k, {}).get("method"), method_ours=RO.get(k, {}).get("method")))
            else:
                rows.append(dict(key=kk, model=a, ours=b, delta=None, delta_pct=None, method_model=RM.get(k, {}).get("method"), method_ours=RO.get(k, {}).get("method")))
    return rows


def run(cfg, ours, OG, nodes, MG, log=print):
    M_E, O_E = element_maps(OG, MG)
    RM = measure(nodes, M_E, "model"); RO = measure(ours, O_E, "ours")
    common.dump_json(dict(model=RM, ours=RO), os.path.join(cfg.data, "dims.json"))
    rows = rows_from(RM, RO)
    common.dump_json(rows, os.path.join(cfg.data, "dims_rows.json"))
    with open(os.path.join(cfg.data, "dims.txt"), "w") as fh:
        for rw in rows:
            fh.write(f"{rw['key']:52s} | {str(rw['model'])[:60]:60s} | {str(rw['ours'])[:60]:60s} | {rw['delta']} | {rw['delta_pct']}\n")
    log(f"[dims] {len(rows)} flat rows -> {os.path.join(cfg.data, 'dims_rows.json')}")
    return rows


if __name__ == "__main__":
    cfg, _ = paths.from_args(description=__doc__)
    d, ours = common.load_ours(cfg.ours); OG = common.ours_groups(ours)
    nodes, MG = common.load_model(cfg.model_obj_dir)
    for rw in run(cfg, ours, OG, nodes, MG):
        print(f"{rw['key']:52s} | {str(rw['model'])[:60]:60s} | {str(rw['ours'])[:60]:60s} | {rw['delta']} | {rw['delta_pct']}")
