# Copyright (c) Meta Platforms, Inc. and affiliates.

"""objsoup — the purchased Rasson OX triangle soup as a MEASUREMENT reference (quarantine law).

The OBJ is read in place from /tmp/ob-3dm-quarantine (never copied); the parsed vertex/triangle arrays are cached
ONLY under /tmp (the lane A1 cache /tmp/ox-r6-meas/*.npy is reused when present, else a fresh cache is written under
/tmp/ox-a2/align/cache/).  This module writes NUMBERS, masks and plots; no vertex, triangle list or texture leaves /tmp.

Frame = the lane A1 frame: X = OBJ x (along the LENGTH), Y = -OBJ z (across the WIDTH), Z = OBJ y (UP); millimetres;
playfield centre (0, 0); floor z = 0; bed cloth top z = 785.828 (measured, area-weighted horizontal faces; the A1 station
files round it to the BED = 785.8 constant).  Corner datum K (+X+Y) = the nose-line intersection (1174.066, 588.123).

Element WINDOWS are documented constants (mm).  The soup has NO per-element nodes (object 18 'Pool_Table' is one
442 376-triangle body; 16 'Diamond_Markings' = the 18 sights; 'Marking' = the cloth print decal; 16 balls), so every
element is a spatial window in a LOCAL frame anchored on a datum both sides can measure (nose line, K, foot centre).
"""
import json, os, sys, time
import numpy as np

OBJ = "/tmp/ob-3dm-quarantine/rasson-9ft/src/obj/RASSON_Pool_Table_OBJ.obj"
A1_CACHE = "/tmp/ox-r6-meas/"
CACHE = "/tmp/ox-a2/align/cache/"

BEDTOP = 785.828          # measured bed cloth top (area 3.13e6 mm2 of horizontal faces at exactly this z)
BED_A1 = 785.8            # A1 station constant (documentation only)
NX, NY = 1174.066, 588.123   # nose lines (PF-01m): |x| short rails, |y| long rails
K = (NX, NY)              # +X+Y corner datum = nose-line intersection
PF_MODEL = (2 * NX, 2 * NY)  # 2348.133 x 1176.246
EN07 = (1.0817, 1.0797, 1.0)  # 8-ft-pro model -> 9-ft datum build factors: along the length (X), across the width (Y), z
CAP_TOP_ABOVE_BED = 46.807   # CU-11 global max above bed (middle-pocket liner shield rim); rail cap crest 43.138
FOOT_CENTROID = (1031.91, 481.37)   # EN-04: +X+Y foot pad area centroid at z=12 (mirror copies at +-x, +-y)
MODEL_CUP_CORNER = (1206.394, 619.886)  # CP-12 inner_wall_circle centre (+X+Y liner axis) — v2 pocket-furniture anchor
MODEL_CUP_SIDE = (0.38, 637.7)          # SP-12 inner_centre (+Y liner axis)
TABLE_OBJ = "Pool_Table"; SIGHTS_OBJ = "Diamond_Markings"; DECAL_OBJ = "Marking"

# ---------------------------------------------------------------- element windows -------------------------------
# anchor: how points are brought into the element's LOCAL frame (see local_frame()):
#   global      : (x, y, z-bed)                                  [used with datum 'scaled' for carried lengths]
#   nose_long   : (x, u = y - y_nose, z-bed) on the +Y long rail     [profile frames: raw]
#   nose_short  : (u = x - x_nose, y, z-bed) on the +X short rail
#   outer_long  : (x, u = y - y_outer, z-bed) on the +Y long rail, u measured from the rail-cap OUTER edge (u <= 0 inboard)
#                 [the visible cap / lip / apron forms live at the outer edge; the band WIDTH nose->outer edge is an
#                  envelope-derived length (RB-01/RB-02 vs model raw 159.3) and is judged by the global silhouettes]
#   outer_short : (u = x - x_outer, y, z-bed) on the +X short rail
#   K           : (dx = x - Kx, dy = y - Ky, z-bed) at the +X+Y corner
#   side        : (x, dy = y - y_nose, z-bed) at the +Y side pocket
#   foot        : (x - xf, y - yf, z) at the +X+Y foot pad centroid
#   sight       : (x - xs, y - ys, z-bed) at the first +Y long-rail sight outboard of the side pocket (x > 0)
# box: (h0,h1, v0,v1, w0,w1) in local coordinates, order = the local frame's axis order.
# datum: 'raw' | 'scaled' | 'photo' (A2-2 / plan 4a.4, printed in every report by register.DATUM_DECISIONS).
WINDOWS = {
  "cushion_long":     dict(anchor="nose_long",  datum="raw",    box=(300, 900,   -6, 60,   -1, 47), exclude_ours=("dm-bed-cloth",),
                           note="+Y long cushion body, x 300..900 (clear of the side pocket |x|<175 and the corner x>1000); u from the nose (CU-04m 48.07 wide, 41.1 tall)"),
  "cushion_short":    dict(anchor="nose_short", datum="raw",    box=(-6, 60,   150, 450,   -1, 47), exclude_ours=("dm-bed-cloth",),
                           note="+X short cushion body, y 150..450"),
  "rail_cap_long":    dict(anchor="outer_long", datum="raw",    box=(300, 900, -115, 5,  0.5, 50), exclude_ours=("dm-bed-cloth",),
                           note="+Y long rail cap + ledge + outer lip, u -115..+5 from the cap OUTER edge (RB-04: crest 66 inboard of the edge, nosing inset table, ledge z 14..17); z 0.5..+50 (v2: the declared -22 floor caught the model's slab edge and the shared cloth sheet, neither a rail-cap member — RC-19); the cap inner 10 mm and the cushion are in cushion_long"),
  "rail_cap_short":   dict(anchor="outer_short", datum="raw",   box=(-115, 5,  150, 450,  0.5, 50), exclude_ours=("dm-bed-cloth",),
                           note="+X short rail cap, y 150..450, u -115..+5 from the outer edge; z 0.5..50 (v2, as rail_cap_long)"),
  "apron_long":       dict(anchor="outer_long", datum="raw",    box=(300, 900,  -60, 5, -150, -18),
                           note="+Y apron/skirt vertical face band, x 300..900, u -60..+5 from the cap outer edge (model face recessed 26.4 under the edge, RB-10), z -150..-18 (above the R~20 bottom bend)"),
  "apron_bottom":     dict(anchor="outer_long", datum="raw",    box=(300, 900,  -60, 5, -178, -150),
                           note="+Y apron bottom bend + return flange + body underside edge; the model underside has a 4.9-6.4 mm camber (EN-05) so this band is a LOOSE reference"),
  "corner_above":     dict(anchor="cup_corner", datum="raw",   box=(-30, 95, -95, 95,  0.5, 50), exclude_ours=("dm-cushion", "dm-apron"), mask="bands", r_max=72.0,
                           note="v2 (r9): +X+Y corner pocket FURNITURE above the cloth — cup C, flange, casting dome, cap ends — in the liner-axis frame (d outward along the diagonal, n toward the long rail). The axis itself is KERNEL-DERIVED (CP-05 / CP-06; r9b C1 relabel -- 'MFR-corrected' was wrong, the manufacturer never corrected anything here: ours 37.33 vs the model's 45.32 along the diagonal is a -7.65 mm OPEN conflict handed to the owner as card 21b), so the frame absorbs it and the FORMS are judged raw; the kernel jaws (dm-cushion) are excluded from ours — the model's cheek ends inside the box are the only non-furniture left. r7 declaration was K-relative (-175..150) and mixed the kernel mouth / throat / axis into the read; diagonal section through K"),
  "corner_below":     dict(anchor="cup_corner", datum="raw",   box=(-30, 95, -95, 95, -70, -24), exclude_ours=("dm-cushion", "dm-bed-cloth", "dm-apron"), mask="bands", r_max=72.0,
                           note="v2 (r9): +X+Y corner BELOW THE SLAB in the liner-axis frame — cup bucket (PK-03 compound arcs), floor, drain; z -70..-24 (the slab band -24..-0.5 is the shared bed hole's: RC-22 kernel disc + 4 vs the model's non-circular CP-14m notch — reported in corner_cut, not judged)"),
  "corner_cut":       dict(anchor="cup_corner", datum="shared-hole", box=(-30, 95, -95, 95, -24, -0.5), exclude_ours=("dm-cushion", "dm-bed-cloth", "dm-apron"), mask="bands", r_max=72.0,
                           note="INFO (v2): the slab band at the corner — our CP-14m roll-over / face on the RC-22 shared bed hole (R 53.05 about the kernel axis) vs the model's non-circular notch (CP-14m 51..55 polar, flattening to a straight run on the long-rail flank); the hole radius is the shared scene's, reported to the orchestrator (ISSUE-SHARED-LOFT #3)"),
  "side_above":       dict(anchor="cup_side",   datum="raw",   box=(-95, 95, -30, 95,  0.5, 50), exclude_ours=("dm-cushion",), mask="bands", r_max=90.0,
                           note="v2 (r9): +Y side pocket FURNITURE above the cloth in the liner-axis frame (x, dy from the liner axis; the axis is kernel-governed: ours 64.17 vs the model's 49.6 behind the nose) — ring, flange, rail piece; kernel jaws excluded from ours"),
  "side_below":       dict(anchor="cup_side",   datum="raw",   box=(-95, 95, -30, 80, -70, -24), exclude_ours=("dm-cushion", "dm-bed-cloth"), mask="bands", r_max=90.0,
                           note="v3 (A3): +Y side pocket BELOW THE SLAB in the liner-axis frame — stadium bucket, floor, drain; z -70..-24 (the slab band is the shared hole's: side_cut). dy cap 95 -> 80: with the A3 liner on the model centre the two frames coincide and the old cap reached the model's inner cabinet panel (3 mm, v 131..137 behind the nose, z -160..+15, x +-1290) which is cabinet structure, not pocket furniture, and has no counterpart in ours (our blind is the RB-05 skin only); r9b's GREEN here was frame-offset-assisted (the 14.57 mm kernel-vs-model shift put our apron geometry on that panel)"),
  "side_cut":         dict(anchor="cup_side",   datum="shared-hole", box=(-95, 95, -30, 95, -24, -0.5), exclude_ours=("dm-cushion", "dm-bed-cloth"), mask="bands", r_max=90.0,
                           note="INFO (v2): the slab band at the side pocket — our roll-over on the RC-22 shared hole (R 59.48) vs the model's SP-14 notch (R 69..75 about a centre 80 behind the nose); shared-scene item, reported not judged"),
  "pedestal_end":     dict(anchor="foot",       datum="photo",    box=(-340, 95, -500, 95, 0, 640),
                           note="+X end of the pedestal (end-leg bow EN-03 R_in 773 / R_out 803, end arch apex x 1025.5), the +Y half; foot-centred so the bow PROFILE is judged raw; the foot POSITION is a dims row (EN-04 x EN-07)"),
  "foot_pad":         dict(anchor="foot",       datum="photo",    box=(-120, 120, -120, 120, 0, 26),
                           note="+X+Y foot pad (EN-04: 5-facet corner blend, area 29160 mm2 at z=12), plan cut at z=12"),
  "sight_form":       dict(anchor="sight",      datum="photo",  box=(-30, 30, -30, 30, 30, 50),
                           note="one sight slab (RB-09: 18.113 x 31.032 envelope, long diagonal across the rail); FORM only - positions are photo-referenced (C13). r9b C2: datum raw -> PHOTO, so the mesh row is INFO. Ruling RC-17 does not build the model's 6.1 mm slotted slab, so the window contains OUR inlay over the rail CAP, and the GREEN it produced in r7-r9 was the cap agreeing with the cap, not the sight agreeing with the sight (named-only model->ours 2.9 / 5.2 / 5.6 mm). The sight is judged by letters-rox against the photo rows, like the pedestal and the foot pad."),
  "above_bed_all":    dict(anchor="global",     datum="scaled", box=(-1400, 1400, -800, 800, -0.5, 60),
                           note="everything above the bed (what every gameplay camera sees) under the EN-07 datum; information row, gated loosely"),
}
# Section stations (plane in the LOCAL frame of the element; h/v axis indices of the local frame; window (h0,h1,v0,v1))
STATIONS = [
  # id, element, plane axis (local index), plane value, h axis, v axis, window, note
  ("S1_railcap_long_x600",  "rail_cap_long",  0, 600.0, 1, 2, (-105, 10, -150, 55), "rail cap + lip + apron profile at x=600 (RB-04 / RB-05 / RB-10); u from the cap OUTER edge (nose at -159.3 model / -(RB-01) ours)"),
  ("S1b_cushion_long_x600", "cushion_long",   0, 600.0, 1, 2, (-6, 60, -1, 47),     "cushion section at the rail midpoint (CU-04m..CU-12)"),
  ("S2_railcap_short_y300", "rail_cap_short", 1, 300.0, 0, 2, (-105, 10, -150, 55), "short rail cap profile at y=300 (RB-04); u from the cap outer edge"),
  ("S3_corner_plan_bed20",  "corner_above",   2, 20.0,  0, 1, (-30, 95, -95, 95), "v2: corner plan cut at bed+20 in the liner-axis frame (d outward, n toward the long rail): cup C, casting inner edge"),
  ("S3b_corner_plan_bed40", "corner_above",   2, 40.0,  0, 1, (-30, 95, -95, 95), "v2: corner plan cut at bed+40 (flange, casting dome, cap ends) in the liner-axis frame"),
  ("S4_corner_diag_cup",    "corner_above",   1, 0.0,   0, 2, (-30, 95, -70, 55), "v2: corner diagonal section through the liner axis (n = 0): cup wall, flange slope, casting dome, slab cut"),
  ("S5_side_plan_bed20",    "side_above",     2, 20.0,  0, 1, (-95, 95, -30, 95), "v2: side pocket plan cut at bed+20 in the liner-axis frame (ring, notch)"),
  ("S5b_side_plan_bed40",   "side_above",     2, 40.0,  0, 1, (-95, 95, -30, 95), "v2: side pocket plan cut at bed+40 (flange, rail piece)"),
  ("S6_side_x0",            "side_above",     0, 0.0,   1, 2, (-30, 70, -70, 55),  "v3 (A3): side pocket transverse section through the liner axis (x = 0): ring wall, flange, rail piece, notch; dy cap 95 -> 70: beyond dy 70 at x = 0 ours has the RC-22 shared-hole roll-over wall (v 121..124) and the enclosed bed-level cover behind the ring, where the model has the open SP-14 notch (to v 150 at x = 0) and its inner cabinet panel (v 131..137) — the shared-scene item side_cut reports (INFO); both surfaces are enclosed under the rail piece"),
  ("S7_pedestal_bow_y500",  "pedestal_end",   1, 18.63, 0, 2, (-340, 95, 0, 640),   "end-leg bow elevation at model y=500 (= foot centroid y 481.37 + 18.63) (EN-03)"),
  ("S8_pedestal_arch_x1025","pedestal_end",   0, -6.91, 1, 2, (-500, 95, 0, 640),   "end arch section at model x=1025 (= foot centroid x 1031.91 - 6.91) (EN-03 apex 1025.5)"),
  ("S9_foot_plan_z12",      "foot_pad",       2, 12.0,  0, 1, (-120, 120, -120, 120), "foot pad plan cut at z=12 (EN-04)"),
  ("S10_sight_slab",        "sight_form",     1, 0.0,   0, 2, (-30, 30, 30, 50),     "sight slab along-rail section through the sight centre, z 30..50 above bed (RB-09 slab thickness / proud height; cap under it)"),
]

_cache = {}

def _parse_obj_to_cache():
    """Fallback: parse the OBJ once (in place) and cache under /tmp/ox-a2/align/cache/.  ~40 s.
    r9: also records the per-face `usemtl` index (M.npy) and the material names (mtlnames.json) so an element can be
    selected on the MODEL side by material the way the A1 stations did (mat18 iron, mat19 cushion / slab, mat20 rail
    cloth, mat22 acrylic black cup + flange)."""
    os.makedirs(CACHE, exist_ok=True)
    t0 = time.time(); verts, tris, tobj, tmat, names, mtls = [], [], [], [], [], []; cur = -1; curm = -1
    with open(OBJ, "r", errors="ignore") as fh:
        for line in fh:
            if line.startswith("v "):
                s = line.split(); verts.append((float(s[1]), float(s[2]), float(s[3])))
            elif line.startswith("f "):
                idx = [int(tok.split("/")[0]) for tok in line.split()[1:]]
                idx = [i - 1 if i > 0 else len(verts) + i for i in idx]
                for k in range(1, len(idx) - 1):
                    tris.append((idx[0], idx[k], idx[k + 1])); tobj.append(cur); tmat.append(curm)
            elif line.startswith("o ") or line.startswith("g "):
                name = line[2:].strip()
                if name not in names: names.append(name)
                cur = names.index(name)
            elif line.startswith("usemtl"):
                m = line[6:].strip()
                if m not in mtls: mtls.append(m)
                curm = mtls.index(m)
    V0 = np.array(verts, dtype=np.float64)
    V = np.stack([V0[:, 0], -V0[:, 2], V0[:, 1]], axis=1)
    np.save(CACHE + "V.npy", V); np.save(CACHE + "F.npy", np.array(tris, dtype=np.int64)); np.save(CACHE + "O.npy", np.array(tobj, dtype=np.int32))
    np.save(CACHE + "M.npy", np.array(tmat, dtype=np.int32)); json.dump(mtls, open(CACHE + "mtlnames.json", "w"))
    json.dump(names, open(CACHE + "objnames.json", "w"))
    print(f"[objsoup] parsed OBJ in place: {len(V)} verts, {len(tris)} tris, {len(mtls)} materials, {time.time()-t0:.1f}s -> {CACHE}", file=sys.stderr)

def load():
    """(V (n,3) mm lane frame, F (m,3), O (m,) object index, names) from the align cache (r9: must carry M.npy), else the
    A1 cache, else a parse.  Material ids come from materials()."""
    if "VFO" in _cache: return _cache["VFO"]
    for d in (CACHE, A1_CACHE):
        if all(os.path.exists(d + f) for f in ("V.npy", "F.npy", "O.npy", "objnames.json")) and (d != CACHE or os.path.exists(d + "M.npy")):
            V = np.load(d + "V.npy"); F = np.load(d + "F.npy"); O = np.load(d + "O.npy"); names = json.load(open(d + "objnames.json"))
            _cache["VFO"] = (V, F, O, names, d); return _cache["VFO"]
    _parse_obj_to_cache(); return load()

def materials():
    """(M (m,) per-face material index aligned with F, material names) — parses the OBJ if the align cache lacks M.npy."""
    if "M" in _cache: return _cache["M"]
    if not os.path.exists(CACHE + "M.npy"):
        _parse_obj_to_cache(); _cache.pop("VFO", None); load()
    if load()[4] != CACHE: _cache.pop("VFO", None); load()
    M = np.load(CACHE + "M.npy"); mtls = json.load(open(CACHE + "mtlnames.json")); _cache["M"] = (M, mtls); return _cache["M"]

def tris(obj=TABLE_OBJ, mats=None):
    """Triangles (m,3,3) of one OBJ object in the lane frame; mats = iterable of material indices to keep (r9)."""
    V, F, O, names, _ = load()
    keep = O == names.index(obj)
    if mats is not None:
        M, _ = materials(); keep = keep & np.isin(M, list(mats))
    return V[F[keep]]

def table_and_sights():
    """Table body + sights (the visible table; balls and the cloth-print decal excluded)."""
    return np.concatenate([tris(TABLE_OBJ), tris(SIGHTS_OBJ)])

def checks():
    """Plan-centre / bed-top / nose-line checks re-measured from the soup (printed in the report)."""
    T = tris(TABLE_OBJ)
    n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); a = np.linalg.norm(n, axis=1) / 2
    nz = n[:, 2] / np.maximum(2 * a, 1e-12); zc = T[:, :, 2].mean(1)
    m = (np.abs(nz) > 0.999) & (zc > 780) & (zc < 790)
    zb = np.round(zc[m], 3); u = np.unique(zb); ar = np.array([a[m][zb == z].sum() for z in u]); bed = float(u[np.argmax(ar)])
    noses = nose_lines(T)
    centre = ((noses["short_plus"] + noses["short_minus"]) / 2, (noses["long_plus"] + noses["long_minus"]) / 2)
    ext = T.reshape(-1, 3)
    return dict(bed_top_measured=bed, bed_top_constant=BEDTOP, nose_lines_section_rule=noses,
                plan_centre_from_noses=[round(centre[0], 4), round(centre[1], 4)],
                playfield_nose_to_nose=[round(noses["short_plus"] - noses["short_minus"], 3), round(noses["long_plus"] - noses["long_minus"], 3)],
                envelope=dict(x=[float(ext[:, 0].min()), float(ext[:, 0].max())], y=[float(ext[:, 1].min()), float(ext[:, 1].max())], z=[float(ext[:, 2].min()), float(ext[:, 2].max())]),
                tris_table=int(len(T)), tris_sights=int(len(tris(SIGHTS_OBJ))), area_table_m2=round(float(a.sum()) / 1e6, 3), cache=load()[4])

def sight_centres():
    """Plan centres of the 18 sight islands (connected components of the Diamond_Markings triangles)."""
    if "sights" in _cache: return _cache["sights"]
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    V, F, O, names, _ = load(); Fs = F[O == names.index(SIGHTS_OBJ)]
    idx = np.unique(Fs); remap = {v: i for i, v in enumerate(idx)}; Fl = np.vectorize(remap.get)(Fs)
    n = len(idx); rows = np.concatenate([Fl[:, 0], Fl[:, 1], Fl[:, 2]]); cols = np.concatenate([Fl[:, 1], Fl[:, 2], Fl[:, 0]])
    g = coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n)); k, lab = connected_components(g, directed=False)
    P = V[idx]; C = np.array([P[lab == i].mean(0) for i in range(k)]); C[:, 2] = np.array([P[lab == i, 2].max() for i in range(k)])
    _cache["sights"] = C; return C

def model_sight_anchor():
    """The first +Y long-rail sight outboard of the side pocket with x > 0 (smallest positive x, y > 400)."""
    C = sight_centres(); m = (C[:, 1] > 400) & (C[:, 0] > 20)
    c = C[m][np.argmin(C[m][:, 0])]; return (float(c[0]), float(c[1]))

NOSE_CUTS = (10.0, 20.0, 30.0, 33.0, 35.0, 35.3, 36.0, 36.3, 37.0, 38.0, 40.0)

def nose_lines(T, bed=BEDTOP):
    """PF-01m rule, section-based (extruded meshes have no vertices mid-rail): the innermost cushion point over plan
    cuts at bed + NOSE_CUTS, min |y| in the long-rail plan band (|x| < 900, |y| > 300) and min |x| in the short-rail band
    (|y| < 400, |x| > 800).  Returns the four nose lines (None where nothing is found)."""
    P = np.concatenate([section(T, 2, bed + h).reshape(-1, 3) for h in NOSE_CUTS]) if len(T) else np.zeros((0, 3))
    def pick(sel, col, sign):
        v = P[sel, col]
        if len(v) == 0: return None
        return float(v.min()) if sign > 0 else float(v.max())
    lx = (np.abs(P[:, 0]) < 900) & (np.abs(P[:, 1]) > 300); ly = (np.abs(P[:, 1]) < 400) & (np.abs(P[:, 0]) > 800)
    return dict(long_plus=pick(lx & (P[:, 1] > 0), 1, +1), long_minus=pick(lx & (P[:, 1] < 0), 1, -1),
                short_plus=pick(ly & (P[:, 0] > 0), 0, +1), short_minus=pick(ly & (P[:, 0] < 0), 0, -1))

def outer_edges(T, bed=BEDTOP):
    """Rail-cap outer edge lines: max |y| (long, |x|<900) / max |x| (short, |y|<400) of the plan cut at bed+30 (RB-04:
    the cap outer face is vertical at z 30..35, nosing inset 0.0 at z=30)."""
    P = section(T, 2, bed + 30.0).reshape(-1, 3) if len(T) else np.zeros((0, 3))
    if len(P) == 0: return dict(y_outer=None, x_outer=None)
    lx = np.abs(P[:, 0]) < 900; ly = np.abs(P[:, 1]) < 400
    return dict(y_outer=float(P[lx & (P[:, 1] > 0), 1].max()) if (lx & (P[:, 1] > 0)).any() else None,
                x_outer=float(P[ly & (P[:, 0] > 0), 0].max()) if (ly & (P[:, 0] > 0)).any() else None)

Y_OUTER, X_OUTER = 747.451, 1332.794   # EN-06 / RB-03m: rail cap outer edge lines of the model

def model_datums():
    return dict(bed=BEDTOP, x_nose=NX, y_nose=NY, K=K, foot=FOOT_CENTROID, sight=model_sight_anchor(), y_outer=Y_OUTER, x_outer=X_OUTER, cup_corner=MODEL_CUP_CORNER, cup_side=MODEL_CUP_SIDE)

def local_frame(P, anchor, datums):
    """Points (n,3) in the global lane frame -> the element's local frame (n,3)."""
    b = datums["bed"]; P = np.asarray(P, float)
    if anchor == "global":     return np.stack([P[:, 0], P[:, 1], P[:, 2] - b], 1)
    if anchor == "nose_long":  return np.stack([P[:, 0], P[:, 1] - datums["y_nose"], P[:, 2] - b], 1)
    if anchor == "nose_short": return np.stack([P[:, 0] - datums["x_nose"], P[:, 1], P[:, 2] - b], 1)
    if anchor == "outer_long":  return np.stack([P[:, 0], P[:, 1] - datums["y_outer"], P[:, 2] - b], 1)
    if anchor == "outer_short": return np.stack([P[:, 0] - datums["x_outer"], P[:, 1], P[:, 2] - b], 1)
    if anchor == "K":          return np.stack([P[:, 0] - datums["K"][0], P[:, 1] - datums["K"][1], P[:, 2] - b], 1)
    if anchor == "side":       return np.stack([P[:, 0], P[:, 1] - datums["y_nose"], P[:, 2] - b], 1)
    if anchor == "foot":       return np.stack([P[:, 0] - datums["foot"][0], P[:, 1] - datums["foot"][1], P[:, 2]], 1)
    if anchor == "sight":      return np.stack([P[:, 0] - datums["sight"][0], P[:, 1] - datums["sight"][1], P[:, 2] - b], 1)
    if anchor == "cup_corner": # v2: (d along the outward diagonal from the liner axis, n toward the long rail, z-bed)
        dx = P[:, 0] - datums["cup_corner"][0]; dy = P[:, 1] - datums["cup_corner"][1]; r2 = np.sqrt(2.0)
        return np.stack([(dx + dy) / r2, (-dx + dy) / r2, P[:, 2] - b], 1)
    if anchor == "cup_side":   return np.stack([P[:, 0] - datums["cup_side"][0], P[:, 1] - datums["cup_side"][1], P[:, 2] - b], 1)
    raise KeyError(anchor)

def scale_en07(T):
    """EN-07 anisotropic scaling of MODEL geometry about the plan centre (x * 1.0817, y * 1.0797, z * 1.0), used ONLY for
    carried lengths (envelope, playfield-proportional positions).  Heights are not scaled."""
    S = np.array(EN07); return T * S

def tris_local(T, anchor, datums, box=None, margin=0.0):
    """Triangles (m,3,3) -> local frame; if box is given keep triangles whose AABB overlaps the box (+margin).  AABB
    overlap (not vertex-in-box) because extruded rails/cushions have no vertices mid-rail."""
    L = local_frame(T.reshape(-1, 3), anchor, datums).reshape(-1, 3, 3)
    if box is None: return L
    h0, h1, v0, v1, w0, w1 = box; mn = L.min(1); mx = L.max(1)
    ins = ((mx[:, 0] >= h0 - margin) & (mn[:, 0] <= h1 + margin) & (mx[:, 1] >= v0 - margin) & (mn[:, 1] <= v1 + margin) &
           (mx[:, 2] >= w0 - margin) & (mn[:, 2] <= w1 + margin))
    return L[ins]

CUSHION_BACK = 48.072   # CU-04: the cushion bands run from the nose lines to this line (both tables, raw)
BAND_TOL = 1.0          # mm: the model's cushion back wall scatters 47.9..48.4 about the line; the mask closes 1 mm past it so the wall itself is not judged

def band_mask(P_local, anchor, datums, r_max=None):
    """v2: True where a local-frame point lies OUTSIDE the cushion bands of ITS OWN table (each side in its own datum:
    the kernel jaws on ours, the model's cheeks / casting tails on the model).  The bands are kernel-governed (mouth /
    throat / facing), so the pocket-furniture windows do not judge material inside them.  Corner frame: a, b = the
    distances beyond the short / long nose lines; side frame: b beyond the long nose line, x along the rail."""
    P = np.asarray(P_local, float)
    keep = np.ones(len(P), bool)
    if r_max is not None: keep &= np.hypot(P[:, 0], P[:, 1]) <= r_max   # the band-governed parts (cap ends at the CP-15 joints, apron skin corner, lip corner) sit further out in the liner frame on the 9-ft
    if anchor == "cup_corner":
        cx, cy = datums["cup_corner"]; Kx, Ky = datums["K"]; r2 = np.sqrt(2.0)
        x = cx + (P[:, 0] - P[:, 1]) / r2; y = cy + (P[:, 0] + P[:, 1]) / r2; a = x - Kx; b = y - Ky
        return keep & ~(((a < BAND_TOL) & (b > -BAND_TOL) & (b < CUSHION_BACK + BAND_TOL)) | ((b < BAND_TOL) & (a > -BAND_TOL) & (a < CUSHION_BACK + BAND_TOL)))
    if anchor == "cup_side":
        cx, cy = datums["cup_side"]; x = cx + P[:, 0]; b = cy + P[:, 1] - datums["y_nose"]
        return keep & ~((b > -BAND_TOL) & (b < CUSHION_BACK + BAND_TOL) & (np.abs(x) > 45.0))
    return keep

LINER_R = {"cup_corner": 45.339, "cup_side": 50.02}   # CP-12 outer_wall_circle R / SP-12 outer_R: inside the liner at bed level there is no surface on either table

def model_artefact_mask(P_local, anchor):
    """v2: the purchased mesh's bed-top triangulation fans ACROSS the pocket notches (one bed-top triangle's edge runs to
    y 629.5 at x 0.38 inside the side liner; SP-14's outline is the true edge) — model points at |z| < 1 inside the liner
    radius are that artefact and are not judged."""
    P = np.asarray(P_local, float)
    if anchor in LINER_R: return ~((np.abs(P[:, 2]) < 1.0) & (np.hypot(P[:, 0], P[:, 1]) < LINER_R[anchor]))
    return np.ones(len(P), bool)

def window_mask(w, anchor, datums, side="ours", other=None):
    """v2: a window's sample mask. `other` = the OTHER table's datums: the cushion bands are kernel-governed on ours (the side
    liner axis sits 64.17 behind the nose; the model's 49.6) so a point that is cap on one table can be cushion band on the
    other — the band mask is the UNION of both tables' bands in the common liner-axis frame (A2-1: pocket axes = kernel)."""
    """The window's sample mask as a callable (local points -> keep), or None."""
    mk = w.get("mask")
    if not mk: return None
    r_max = w.get("r_max")
    def f(P):
        k = band_mask(P, anchor, datums, r_max=r_max)
        if other is not None: k &= band_mask(P, anchor, other, r_max=None)
        if side == "model": k &= model_artefact_mask(P, anchor)
        return k
    return f

def in_box(P, box):
    h0, h1, v0, v1, w0, w1 = box
    return (P[:, 0] >= h0) & (P[:, 0] <= h1) & (P[:, 1] >= v0) & (P[:, 1] <= v1) & (P[:, 2] >= w0) & (P[:, 2] <= w1)

def section(T, axis, c, eps=1e-6):
    """Cut triangles (m,3,3) by the plane coord[axis] = c -> segments (k,2,3).  Vectorised (D621 objlib.section)."""
    if axis == "diag":   # plane through the local origin with normal (1,-1,0)/sqrt2: s-axis (1,1)/sqrt2 -> handled by caller
        raise ValueError("use section_diag")
    d = T[:, :, axis] - (c + eps); s = np.sign(d)
    keep = ~((s > 0).all(1) | (s < 0).all(1)); T = T[keep]; d = d[keep]
    if len(T) == 0: return np.zeros((0, 2, 3))
    out = np.zeros((len(T), 2, 3)); cnt = np.zeros(len(T), dtype=int)
    for a, b in ((0, 1), (1, 2), (2, 0)):
        da, db = d[:, a], d[:, b]; cross = (da * db) < 0
        with np.errstate(divide="ignore", invalid="ignore"):
            t = np.where(cross, da / np.where(da == db, 1.0, da - db), 0.0)
        pts = T[:, a] + (T[:, b] - T[:, a]) * t[:, None]
        m0 = cross & (cnt == 0); m1 = cross & (cnt == 1)
        out[m0, 0] = pts[m0]; out[m1, 1] = pts[m1]; cnt += cross
    return out[cnt == 2]

def section_diag(T_local):
    """Diagonal section of K-local triangles: plane through K containing the vertical and the direction (1,1)/sqrt2.
    Returns segments (k,2,2) in (s, z) with s = (dx+dy)/sqrt2 (+ toward the pocket)."""
    R = np.array([[1, 1, 0], [-1, 1, 0], [0, 0, np.sqrt(2)]]) / np.sqrt(2)   # rows: s, t, z
    Q = T_local.reshape(-1, 3) @ R.T; Q = Q.reshape(-1, 3, 3)
    S = section(Q, 1, 0.0)
    return S[:, :, [0, 2]] if len(S) else np.zeros((0, 2, 2))

if __name__ == "__main__":
    t0 = time.time(); V, F, O, names, src = load(); print("cache", src, V.shape, F.shape, f"{time.time()-t0:.2f}s")
    print(json.dumps(checks(), indent=1)); print("sight anchor", model_sight_anchor(), "n sights", len(sight_centres())); print("outer edges measured", outer_edges(tris()), "constants", Y_OUTER, X_OUTER)
