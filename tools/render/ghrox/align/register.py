# Copyright (c) Meta Platforms, Inc. and affiliates.

"""register — datum-based registration (NO ICP) and the per-element DATUM DECISION table (A2-2 / plan 4a.1, 4a.4, 4a.9).

Registration = three datums, all measured on both meshes by the same rule:
  * bed cloth top plane  -> z = 785.828 on both (ours re-zeroed by its measured y_bed_o);
  * plan centre           -> the centre of the cushion-nose rectangle (PF-01m rule) on both; the long axis = X on both;
  * no rotation search, no ICP: an ICP would bias the height datum away from the bed plane and hide real dimension
    differences (the D621 precedent).
EN-07 anisotropic scaling of the MODEL (x 1.0817, y 1.0797, z 1.0) is applied ONLY where a LENGTH is carried from the
8-ft-pro model to the 9-ft datum (envelope, playfield-proportional positions); never to angles, radii, profiles,
sections, lips or furniture plans (R1: MODEL values are raw mm).  The A1 ball-scale k = 1.0257 is REJECTED under R1
and never applied.
"""
import json
import numpy as np
import objsoup, ours

# element / row -> decision.  'EN-07-scaled' | 'raw' | 'photo-referenced, not mesh-gated'
DATUM_DECISIONS = [
  ("envelope (top/side/end silhouettes, EN-01/EN-02, RB-01/RB-02)", "MFR-envelope (v2)", "v2 (r9): judged against the model scaled to the MFR envelope EN-01 (1440/1332.794 x 809/747.4514) — MFR corrects the model (LAW precedence); the EN-07 playfield factors put the lip lines 2 mm short of EN-01 and were the r7 declaration, kept as information rows. Side / end views are judged on the BODY band (v2b, z >= -148 above the bed): the underframe is photo-governed (RC-10..RC-16). r9b B4 discloses the band move: the r9 run first cut at z >= -165, which sliced THROUGH the model's cambered underside (EN-05 carries a 4.9-6.4 mm camber), leaving bottom-edge strips that are model-only mid-length and ours-only at the ends and a side_mfr boundary median of 2.0 mm against a 1.5 mm threshold; the cut moved up to -148, above the RB-10 apron bottom bend (zone -178..-150) which the apron_bottom element judges separately. The -165 numbers are kept as an INFO row (IoU 0.9757, boundary median/p90/max 2.0/5/8 mm, 8 994 model-only and 5 445 ours-only px) so the move can be audited, not hidden"),
  ("pocket furniture (corner/side above, below, cut)", "raw in the fixed MODEL reference (FIX2)", "ORDER-ROX-A4-FIX2 B: CP-12/SP-12 axes + A1 nose/bed + PF-01, bound to purchased source/cache hashes. No OURS floor/wall/pan fit, no fallback. Physical wall and kernel-pan placement are separate observations. Historical v2/v3 moving axes are superseded; windows, masks and estimator are unchanged."),
  ("rail cap windows", "raw, z 0.5..50 (v2)", "v2 (r9): the r7 window floor of -22 caught the model's slab edge and the shared cloth sheet (RC-19), neither a rail-cap member"),
  ("pedestal_end / foot_pad", "photo-governed (v2: INFO)", "v2 (r9): RC-10..RC-16 (MFR photo rows) govern the plates and feet and are judged by letters-rox; the mesh-to-mesh rows stay as information (the model's 8-ft plate is the disclosed different form)"),
  ("above_bed_all (whole visible set)",                    "EN-07-scaled", "information row: mixes carried lengths and local forms; gated loosely"),
  ("playfield PF-01 (nose rectangle)",                      "EN-07-scaled", "MFR 2540 x 1270 = model 2348.133 x 1176.246 x EN-07 by construction (EN-07 is DERIVED from these)"),
  ("pocket-centre / sight / foot POSITIONS along the rails", "EN-07-scaled", "playfield-proportional positions (A2-2); sights themselves are photo-referenced (C13)"),
  ("cushion_long / cushion_short (section, CU-02..CU-12)",  "raw",          "profile in the nose-relative frame (u from the nose, z above bed); heights and widths are local sizes"),
  ("rail_cap_long / rail_cap_short (RB-03/RB-04 form, lip)", "raw",         "cap section, crest, nosing, lip = profile (A2-2: sections/profiles/lips raw), anchored on the cap OUTER edge; the band width nose->edge (RB-01/RB-02, envelope-derived) is judged by the global silhouettes and the datum table"),
  ("apron_long / apron_bottom (RB-05 / RB-10 profile)",     "raw",          "skirt profile, recess under the edge (26.4) and bottom bend = profile, outer-edge-anchored"),
  ("corner_above / corner_below (CP-* jaws, casting, cup)", "raw, fixed MODEL CP-12", "FIX2: PF-01/2 + MODEL CP-12 axis - A1 nose station; existing 45-degree basis, no fit or scaling"),
  ("side_above / side_below (SP-* jaws, casting, liner, notch)", "raw, fixed MODEL SP-12", "FIX2: retain MODEL x; PF-01.W/2 + MODEL SP-12.y - A1 nose.y; no fit or scaling"),
  ("pedestal_end bow / end arch (EN-03 profile)",           "raw",          "foot-centred profile; the foot POSITION is a dims row under EN-07 (EN-04 centroid x factors)"),
  ("foot_pad (EN-04 outline)",                              "raw",          "furniture plan of the pad"),
  ("sight_form (RB-09 slab, outline)", "photo-governed (v2b/r9b: INFO)", "r9b C2: demoted from a judged raw row. RC-17 rules the model's 6.1 mm slotted slab out of our build, so the window holds our inlay over the rail CAP and the r7-r9 GREEN came from the cap under it (named-only model->ours 2.9 / 5.2 / 5.6 mm). Judged by letters-rox against the photo rows; the mesh numbers stay as information, like pedestal_end / foot_pad"),
  ("two pedestal plates (C9 / O10)",                        "photo-referenced, not mesh-gated", "the model's ring pedestal is the disclosed WRONG form; plates come from the endorsed photo groups"),
  ("sight positions (C13)",                                 "photo-referenced, not mesh-gated", "RB-07 WPA pitch/inset; model positions printed for information only"),
  ("retail mouth (O4)",                                     "photo-referenced, not mesh-gated", "O4 = A: the kernel mouth is the MFR/WPA row, the model's 97.6-98.2 VSC mouth is disclosed, not gated"),
]

MFR_ENVELOPE = (1440.0 / 1332.794, 809.0 / 747.4514, 1.0)   # v2: EN-01 2880 x 1618 over the model's lip-to-lip 2665.59 x 1494.90 (RB-01m / RB-02m lines)

def model_tris(variant="raw", with_sights=True):
    T = objsoup.table_and_sights() if with_sights else objsoup.tris()
    if variant == "mfr": return T * np.array(MFR_ENVELOPE)   # v2: the MFR envelope datum (EN-01), heights raw
    return objsoup.scale_en07(T) if variant == "scaled" else T

# ---------------------------------------------------------------------------
# r9b C1 (ORDER-RASSON-A2-R9B, condition C1): the cup PLACEMENT is a kernel-vs-MODEL conflict
# (LAW-PURCHASED-BASELINE section 7 -> owner ruling, card 21b), not a declaration the gate may settle.
# Declaration 2 anchors the pocket windows on each table's own liner axis, which makes the FORMS
# comparable and at the same time makes the PLACEMENT difference invisible to every element row.
# So it is measured here, in the two frames the law names (K along the corner diagonal; the nose line
# at the side), and printed in every report and in align-rox.json as delta rows + INFO rows.
# The gate does NOT judge these rows: OPEN until the owner rules.
def placement_conflict(dump: ours.Dump):
    md = objsoup.model_datums(); od = dump.datums; r2 = float(np.sqrt(2.0))
    try:
        import dims as _dims
        _rows, _extra, _rev = _dims.load_rows()
        cp07 = _rows.get("CP-07", {}).get("value_mm"); sp07 = _rows.get("SP-07", {}).get("value_mm")
    except Exception:
        cp07 = sp07 = None
    oc, mc = dump.cup_observations['corner']['axis_xy_mm'], md["cup_corner"]
    osd, msd = dump.cup_observations['side']['axis_xy_mm'], md["cup_side"]
    u_o = None if oc is None else ((oc[0] - od["x_nose"]) + (oc[1] - od["y_nose"])) / r2
    u_m = ((mc[0] - md["x_nose"]) + (mc[1] - md["y_nose"])) / r2
    v_o = None if osd is None else osd[1] - od["y_nose"]
    v_m = msd[1] - md["y_nose"]
    rows = [
      dict(row="corner cup centre along the +X+Y diagonal from K", frame="K (nose-line intersection), u outward along the diagonal",
           ours=None if u_o is None else round(u_o, 2), model=round(u_m, 2), delta=None if u_o is None else round(u_o - u_m, 2), kernel_row=("CP-07 %.3f" % cp07) if cp07 else "CP-07",
           ours_rule=dump.cup_observations['corner'].get('rule'), model_rule="CP-12 inner_wall_circle centre (1206.394, 619.886), the purchased liner axis",
           status="INFO: physical wall vs measured nose; not a registration fit"),
      dict(row="side cup centre behind the +Y nose line", frame="nose line NY, v behind the nose (into the rail)",
           ours=None if v_o is None else round(v_o, 2), model=round(v_m, 2), delta=None if v_o is None else round(v_o - v_m, 2), kernel_row=("SP-07 %.3f" % sp07) if sp07 else "SP-07",
           ours_rule=dump.cup_observations['side'].get('rule'), model_rule="SP-12 inner_centre (0.38, 637.7), the purchased liner axis",
           status="INFO: physical wall vs measured nose; not a registration fit"),
    ]
    for kind, letter in (('corner', 'CP-12'), ('side', 'SP-12')):
        obs = dump.cup_observations[kind]
        rows.append(dict(row=f'{kind} physical inner-wall centre (x,y)', frame='fixed PF-01/A1 transport, OURS world mm',
                         ours=obs['axis_xy_mm'], model=list(dump.reference.axis(kind)),
                         delta=obs.get('delta_from_fixed_reference_xy_mm'), delta_norm_mm=obs.get('delta_norm_mm'),
                         kernel_row=letter, ours_rule=obs.get('rule'), model_rule=dump.datums['cup_rule'], status=obs['status']))
    info = [
      'FIX2: fitted physical wall centres are observations only. Comparison axes come exclusively from the hashed MODEL reference.',
      f"Legacy pan vertex means (not reference inputs or fitted axes): {dump.kernel_axes}.",
      f"Physical wall observations, including nonzero x/y placement residuals and intrinsic radii: {dump.cup_observations}.",
      'Historical r9b kernel-vs-MODEL offsets (-7.65 corner / +15.1 side) preceded RC-32; they are not current wall measurements.',
    ]
    return dict(rows=rows, info=info, judged=False,
                why_not_judged="FIX2 freezes the comparison reference, not OURS physical placement. The wall fits below remain INFO observations with no new placement tolerance; they do not zero the RC-32 vs CP-12/SP-12 residuals. Kernel axes keep physics and RC-22. Existing letter and mesh verdicts remain separate.")

def registration(dump: ours.Dump):
    """Everything the report's frame/registration section prints."""
    dump.comparison_datums('cup_corner')  # Refuse any attempt to replace the fixed axes.
    md = objsoup.model_datums(); od = dump.datums; chk = objsoup.checks()
    To = dump.tris(); eo = To.reshape(-1, 3)
    env_o = dict(x=[float(eo[:, 0].min()), float(eo[:, 0].max())], y=[float(eo[:, 1].min()), float(eo[:, 1].max())], z=[float(eo[:, 2].min()), float(eo[:, 2].max())])
    env_m = chk["envelope"]; f = objsoup.EN07
    env_ms = dict(x=[env_m["x"][0] * f[0], env_m["x"][1] * f[0]], y=[env_m["y"][0] * f[1], env_m["y"][1] * f[1]], z=env_m["z"])
    n = od["noses"]
    pf_o = [None if n["short_plus"] is None or n["short_minus"] is None else n["short_plus"] - n["short_minus"],
            None if n["long_plus"] is None or n["long_minus"] is None else n["long_plus"] - n["long_minus"]]
    centre_o = [None if pf_o[0] is None else (n["short_plus"] + n["short_minus"]) / 2, None if pf_o[1] is None else (n["long_plus"] + n["long_minus"]) / 2]
    # bed plane on ours after the transform: horizontal-face area near 785.828
    n_ = np.cross(To[:, 1] - To[:, 0], To[:, 2] - To[:, 0]); a = np.linalg.norm(n_, axis=1) / 2; nz = np.abs(n_[:, 2]) / np.maximum(2 * a, 1e-12); c = To.mean(1)
    sel = (nz > 0.999) & (np.abs(c[:, 0]) < 1000) & (np.abs(c[:, 1]) < 500) & (np.abs(c[:, 2] - objsoup.BEDTOP) < 2)
    bed_o = float((c[sel, 2] * a[sel]).sum() / a[sel].sum()) if sel.any() else None
    rows = [
      dict(datum="bed cloth top z", ours=bed_o, model=objsoup.BEDTOP, delta=None if bed_o is None else round(bed_o - objsoup.BEDTOP, 4), note="ours re-zeroed by y_bed_o = %.4f m (measured); 0 by construction" % od["y_bed_o"]),
      dict(datum="plan centre (x, y) from the nose rectangle", ours=centre_o, model=chk["plan_centre_from_noses"], delta=None if None in centre_o else [round(centre_o[0] - chk["plan_centre_from_noses"][0], 4), round(centre_o[1] - chk["plan_centre_from_noses"][1], 4)], note="no translation applied (both dumps are centred by construction); a non-zero value here is a defect of the dump, not of the gate"),
      dict(datum="long axis", ours="X", model="X", delta="-", note="no rotation search"),
      dict(datum="nose rectangle (L x W)", ours=pf_o, model=chk["playfield_nose_to_nose"], delta=None if None in pf_o else [round(pf_o[0] - objsoup.PF_MODEL[0] * f[0], 3), round(pf_o[1] - objsoup.PF_MODEL[1] * f[1], 3)], note="delta vs the EN-07-scaled model (2540.0 x 1270.0 expected)"),
      dict(datum="envelope x (length)", ours=env_o["x"], model=env_m["x"], delta=[round(env_o["x"][0] - env_ms["x"][0], 2), round(env_o["x"][1] - env_ms["x"][1], 2)], note="delta vs EN-07-scaled model (%.1f .. %.1f)" % tuple(env_ms["x"])),
      dict(datum="envelope y (width)", ours=env_o["y"], model=env_m["y"], delta=[round(env_o["y"][0] - env_ms["y"][0], 2), round(env_o["y"][1] - env_ms["y"][1], 2)], note="delta vs EN-07-scaled model (%.1f .. %.1f)" % tuple(env_ms["y"])),
      dict(datum="envelope z (floor .. top)", ours=env_o["z"], model=env_m["z"], delta=[round(env_o["z"][0] - env_m["z"][0], 2), round(env_o["z"][1] - env_m["z"][1], 2)], note="heights never scaled; ours floor = lowest vertex"),
      dict(datum="rail-cap outer edge lines (y_outer long, x_outer short)", ours=[od["y_outer"], od["x_outer"]], model=[md["y_outer"], md["x_outer"]], delta=[round(od["y_outer"] - md["y_outer"] * f[1], 2), round(od["x_outer"] - md["x_outer"] * f[0], 2)], note="delta vs EN-07-scaled edges (%.1f / %.1f); rail band nose->edge: ours %.1f / %.1f, model raw %.1f / %.1f (RB-01/RB-02 vs RB-03m); cap/apron profiles are compared OUTER-edge-anchored (raw)" % (md["y_outer"] * f[1], md["x_outer"] * f[0], od["y_outer"] - od["y_nose"], od["x_outer"] - od["x_nose"], md["y_outer"] - md["y_nose"], md["x_outer"] - md["x_nose"])),
      dict(datum="corner datum K (+X+Y)", ours=list(od["K"]), model=list(md["K"]), delta=[round(od["K"][0] - md["K"][0] * f[0], 3), round(od["K"][1] - md["K"][1] * f[1], 3)], note="delta vs EN-07-scaled K (1270.0, 635.0 expected); raw elements are compared K-relative"),
      dict(datum="foot pad centroid (+X+Y)", ours=list(od["foot"]), model=list(md["foot"]), delta=[round(od["foot"][0] - md["foot"][0] * f[0], 2), round(od["foot"][1] - md["foot"][1] * f[1], 2)], note="ours rule: %s; pedestal profile compared foot-centred (raw)" % od["foot_rule"]),
      dict(datum="sight anchor (+Y long rail, first from centre)", ours=list(od["sight"]), model=list(md["sight"]), delta=[round(od["sight"][0] - md["sight"][0] * f[0], 2), round(od["sight"][1] - md["sight"][1] * f[1], 2)], note="ours rule: %s; positions are photo-referenced (C13), printed only" % od["sight_rule"]),
    ]
    sym = dict(ours_noses=n, ours_symmetry_x=None if None in (n["short_plus"], n["short_minus"]) else round(n["short_plus"] + n["short_minus"], 4),
               ours_symmetry_y=None if None in (n["long_plus"], n["long_minus"]) else round(n["long_plus"] + n["long_minus"], 4))
    return dict(transform=ours.TRANSFORM_NOTE, y_sign=ours.Y_SIGN, y_bed_o=od["y_bed_o"], icp_applied=False, rotation_search=False,
                en07=dict(x=f[0], y=f[1], z=f[2], applied_to="MODEL geometry, carried lengths only (see datum decisions)", ball_scale_k_1p0257="REJECTED (R1)"),
                model_checks=chk, ours_datums={k: v for k, v in od.items() if k != "noses"}, model_datums=md, symmetry=sym, datum_table=rows,
                placement_conflict=placement_conflict(dump),
                pocket_reference=dump.reference.metadata(), cup_observations=dump.cup_observations, kernel_axes=dump.kernel_axes,
                datum_decisions=[dict(element=e, decision=d, reason=r) for e, d, r in DATUM_DECISIONS])

if __name__ == "__main__":
    import sys
    d = ours.Dump(sys.argv[1] if len(sys.argv) > 1 else "/tmp/ox-a2/dump/skeleton.json")
    r = registration(d)
    for row in r["datum_table"]: print(row["datum"], "| ours", row["ours"], "| model", row["model"], "| d", row["delta"])
    print(json.dumps(r["symmetry"]))
