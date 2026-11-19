# Copyright (c) Meta Platforms, Inc. and affiliates.

"""LAW-ADJUSTED silhouettes (GH-621, `--law-adjust`): the raw silhouette overlays stay as they are; this stage builds an
ADJUSTED ours silhouette per view in which the MANUFACTURER-decided deltas (LAW-PURCHASED-BASELINE.md / ORDER-D621-ALIGN.md
PRECEDENCE: the drawing beats the model) are removed, so that the residual (form + everything else) becomes visible.

Three pixel-space operations on OUR per-family rasters (the same rasters overlays.py writes to data/silhouettes_ours for
the main views; the zoom rasters are re-rasterised through overlays.raster), applied BEFORE the family union:
  (a) legs      LAW_LEG_FAMILIES (leg + leveler): translated INWARD toward the plan centre by legs_dx (along x) / legs_dy
                (along y). A raster is split at the centre column/row of its view (h = 0 / v = 0); the + half moves toward
                the centre by d px, the - half the other way (a view window that lies entirely on one side moves as a whole).
  (b) cabinet   LAW_CABINET_FAMILIES (apron = band + cabinet panels + bottom board): in the elevation views every pixel of
                the family raster whose pixel BELOW is empty and whose z lies within [ours cabinet bottom z +/- 25 mm] is
                extended downward by cabinet_bottom_dz (per-column fill). The window centre is the family's own minimum z
                (measured on the export, no model input); floor + 381 mm is recorded next to it as a check.
  (c) envelope  LAW_ENVELOPE_FAMILIES (every silhouette family except the legs): shifted OUTWARD per half by envelope_dx
                (x) / envelope_dy (y); the 2 d px stripe that opens at the centre is filled by replicating the two centre
                columns/rows (scale-free outward shift of each half; members that span the centre stretch by 2 d).
Shifts are whole pixels: d_px = round(d_mm * px_per_mm); the applied pixel counts are recorded per view.
Metrics (IoU / XOR / model-only / ours-only) are recomputed for top / side / end and the two leg_cabinet zooms against the
unchanged model silhouettes. Output: <out>/data/law_adjusted.json, data/silhouettes_ours_law/{view}_all_law.npy,
overlays/{view}_overlay_law_adjusted.png, overlays/zoom_{name}_law_adjusted.png. Nothing existing is rewritten."""
import json
import os

import numpy as np
from PIL import Image

import common
import families
import overlays
import paths

DEFAULT_JSON = os.path.join(paths.PKG_DIR, "law_adjust_d621.json")
KEYS = ("legs_dx_mm", "legs_dy_mm", "cabinet_bottom_dz_mm", "envelope_dx_mm", "envelope_dy_mm")
CABINET_WINDOW_MM = 25.0
FLOOR_TO_CABINET_BOTTOM_MM = 381.0   # EN-06: Diamond drawing "15 in"
ZOOM_VIEWS = ("leg_cabinet_side_elev", "leg_cabinet_end_elev")


def load(path=None):
    path = path or DEFAULT_JSON
    j = json.load(open(path))
    missing = [k for k in KEYS if k not in j]
    if missing:
        raise SystemExit(f"--law-adjust {path}: missing keys {missing}")
    law = {k: float(j[k]) for k in KEYS}
    law["note"] = j.get("note", ""); law["file"] = os.path.abspath(path)
    return law


# ---------------------------------------------------------------------------------------------------------------------
# raster operations (bool 2-D arrays; row 0 = top of the window = max of the vertical coordinate)
# ---------------------------------------------------------------------------------------------------------------------
def shift_cols(m, d):
    """Shift content by d columns (positive = toward higher column index), zero-fill."""
    out = np.zeros_like(m)
    if d == 0: out[:] = m
    elif d > 0: out[:, d:] = m[:, :-d]
    else: out[:, :d] = m[:, -d:]
    return out


def shift_rows(m, d):
    """Shift content by d rows (positive = downward), zero-fill."""
    out = np.zeros_like(m)
    if d == 0: out[:] = m
    elif d > 0: out[d:, :] = m[:-d, :]
    else: out[:d, :] = m[-d:, :]
    return out


def split_shift_h(m, c0, d, outward):
    """Split at column c0 (columns >= c0 are the + side of the horizontal axis). Inward: + side moves -d, - side +d.
    Outward: + side +d, - side -d, the 2 d gap at the centre is filled with the two centre columns."""
    if d == 0: return m.copy()
    W = m.shape[1]
    if c0 <= 0: return shift_cols(m, d if outward else -d)          # window entirely on the + side
    if c0 >= W: return shift_cols(m, -d if outward else d)          # window entirely on the - side
    pos = np.zeros_like(m); neg = np.zeros_like(m); pos[:, c0:] = m[:, c0:]; neg[:, :c0] = m[:, :c0]
    if not outward:
        return shift_cols(pos, -d) | shift_cols(neg, d)
    out = shift_cols(pos, d) | shift_cols(neg, -d)
    lo, hi = max(0, c0 - d), min(W, c0 + d)
    out[:, lo:c0] = m[:, c0 - 1][:, None]; out[:, c0:hi] = m[:, c0][:, None]
    return out


def split_shift_v(m, r0, d, outward):
    """Same along the vertical axis: rows < r0 are the + side (row index grows downward)."""
    if d == 0: return m.copy()
    H = m.shape[0]
    if r0 <= 0: return shift_rows(m, d if outward else -d)          # window entirely on the - side (all rows below v=0)
    if r0 >= H: return shift_rows(m, -d if outward else d)          # window entirely on the + side
    pos = np.zeros_like(m); neg = np.zeros_like(m); pos[:r0, :] = m[:r0, :]; neg[r0:, :] = m[r0:, :]
    if not outward:
        return shift_rows(pos, d) | shift_rows(neg, -d)
    out = shift_rows(pos, -d) | shift_rows(neg, d)
    lo, hi = max(0, r0 - d), min(H, r0 + d)
    out[lo:r0, :] = m[r0 - 1, :][None, :]; out[r0:hi, :] = m[r0, :][None, :]
    return out


def extend_bottom(m, dz, row_lo, row_hi):
    """Per-column fill: every on-pixel whose pixel below is empty and whose row lies in [row_lo, row_hi] is extended
    downward by dz rows."""
    if dz <= 0: return m.copy(), 0
    below_empty = ~shift_rows(m, -1)              # pixel (r) has an empty pixel at r+1  (last row counts as empty below)
    edge = m & below_empty
    rows = np.arange(m.shape[0])
    edge[(rows < row_lo) | (rows > row_hi), :] = False
    out = m.copy()
    for k in range(1, dz + 1):
        out |= shift_rows(edge, k)
    return out, int(edge.sum())


# ---------------------------------------------------------------------------------------------------------------------
def _metrics(M, O):
    inter = int((M & O).sum()); uni = int((M | O).sum()); um = int(M.sum()); uo = int(O.sum())
    return dict(model_px=um, ours_px=uo, overlap_px=inter, union_px=uni, iou=round(inter / uni, 4) if uni else None, xor_px=uni - inter, model_only_px=um - inter, ours_only_px=uo - inter)


def adjust_view(fam_rasters, view, scale, law, cabinet_bottom_z):
    """fam_rasters: {family: bool raster} for one view. Returns (adjusted union, list of applied-operation strings, details)."""
    a, b = view["axes"]
    H, W = next(iter(fam_rasters.values())).shape
    px = lambda mm: int(round(mm * scale))
    c0 = int(round((0.0 - view["x0"]) * scale)); r0 = int(round((view["y1"] - 0.0) * scale))
    dh_leg = law["legs_dx_mm"] if a == 0 else law["legs_dy_mm"]
    dv_leg = law["legs_dy_mm"] if b == 1 else 0.0
    dh_env = law["envelope_dx_mm"] if a == 0 else law["envelope_dy_mm"]
    dv_env = law["envelope_dy_mm"] if b == 1 else 0.0
    dz = law["cabinet_bottom_dz_mm"] if b == 2 else 0.0
    hname = "xyz"[a]; vname = "xyz"[b]
    applied = []; details = {}
    out = np.zeros((H, W), bool); edge_px = 0
    for fam, m in fam_rasters.items():
        m2 = m
        if fam in families.LAW_LEG_FAMILIES:
            if px(dh_leg): m2 = split_shift_h(m2, c0, px(dh_leg), outward=False)
            if px(dv_leg): m2 = split_shift_v(m2, r0, px(dv_leg), outward=False)
        elif fam in families.LAW_ENVELOPE_FAMILIES:
            if px(dh_env): m2 = split_shift_h(m2, c0, px(dh_env), outward=True)
            if px(dv_env): m2 = split_shift_v(m2, r0, px(dv_env), outward=True)
            if fam in families.LAW_CABINET_FAMILIES and px(dz) and cabinet_bottom_z is not None:
                row_lo = int(np.floor((view["y1"] - (cabinet_bottom_z + CABINET_WINDOW_MM)) * scale))
                row_hi = int(np.ceil((view["y1"] - (cabinet_bottom_z - CABINET_WINDOW_MM)) * scale))
                m2, e = extend_bottom(m2, px(dz), row_lo, row_hi); edge_px += e
                details["cabinet_bottom_rows"] = [row_lo, row_hi]
        out |= m2
    legs_present = any(f in fam_rasters for f in families.LAW_LEG_FAMILIES)
    if legs_present and px(dh_leg): applied.append(f"legs inward {hname} {dh_leg:g} mm = {px(dh_leg)} px")
    if legs_present and px(dv_leg): applied.append(f"legs inward {vname} {dv_leg:g} mm = {px(dv_leg)} px")
    if any(f in fam_rasters for f in families.LAW_CABINET_FAMILIES) and px(dz) and cabinet_bottom_z is not None:
        applied.append(f"cabinet bottom extended down {dz:g} mm = {px(dz)} px over {edge_px} edge px (window z {cabinet_bottom_z - CABINET_WINDOW_MM:.1f}..{cabinet_bottom_z + CABINET_WINDOW_MM:.1f})")
        details["cabinet_bottom_edge_px"] = edge_px
    if px(dh_env): applied.append(f"envelope outward {hname} {dh_env:g} mm/side = {px(dh_env)} px")
    if px(dv_env): applied.append(f"envelope outward {vname} {dv_env:g} mm/side = {px(dv_env)} px")
    details.update(centre_col=c0, centre_row=r0)
    return out, applied, details


def run(cfg, ours, OG, nodes, MG, law, log=print):
    OUT = cfg.overlays; DAT = os.path.join(cfg.data, "silhouettes_ours_law"); os.makedirs(OUT, exist_ok=True); os.makedirs(DAT, exist_ok=True)
    def model_meshes(groups): return [(nodes[n]["V"], nodes[n]["F"]) for g in groups for n in MG.get(g, [])]
    def ours_meshes(groups): return [(ours[n]["V"], ours[n]["F"]) for g in groups for n in OG.get(g, [])]
    cab = common.resolve(OG, list(families.LAW_CABINET_FAMILIES))
    cabinet_bottom_z = round(float(min(ours[n]["V"][:, 2].min() for n in cab)), 2) if cab else None
    lev = common.resolve(OG, ["leveler"]) or common.resolve(OG, ["leg"])
    floor_z = round(float(min(ours[n]["V"][:, 2].min() for n in lev)), 2) if lev else None
    rows = []
    for vname, view in overlays.VIEWS.items():
        Mm = {}
        for g in families.MODEL_SIL_INCLUDE:
            p = f"{cfg.model_sil}/{vname}_{g}.npy"
            if os.path.exists(p): Mm[g] = np.load(p)
        M = np.zeros_like(next(iter(Mm.values())))
        for g in Mm: M |= Mm[g]
        fam = {}
        for g in families.OURS_SIL_INCLUDE:
            p = f"{cfg.sil_ours}/{vname}_{g}.npy"
            if os.path.exists(p): fam[g] = np.load(p)
            elif OG.get(g): fam[g] = overlays.raster(ours_meshes([g]), view, 1.0)
        O = np.zeros_like(M)
        for g in fam: O |= fam[g]
        O2, applied, det = adjust_view(fam, view, 1.0, law, cabinet_bottom_z)
        rows.append(_row(vname, 1.0, view, M, O, O2, applied, det, OUT, DAT, f"{vname.upper()} view  -  model vs LAW-ADJUSTED ours (legs inward, cabinet bottom extended, envelope outward)",
                         {"top": ("X (length)", "Y (width)"), "side": ("X (length)", "Z (height)"), "end": ("Y (width)", "Z (height)")}[vname], 100, log))
    for name, view, sc, mg, og, lab in overlays.ZOOMS:
        if name not in ZOOM_VIEWS: continue
        M = overlays.raster(model_meshes(mg), view, sc)
        fam = {g: overlays.raster(ours_meshes([g]), view, sc) for g in og if OG.get(g)}
        O = np.zeros_like(M)
        for g in fam: O |= fam[g]
        O2, applied, det = adjust_view(fam, view, sc, law, cabinet_bottom_z)
        rows.append(_row(name, sc, view, M, O, O2, applied, det, OUT, DAT, f"ZOOM {name}  ({sc:g} px/mm)  -  LAW-ADJUSTED ours", lab, 50 if sc >= 4 else 100, log))
    block = dict(config=law, method=__doc__, ours_cabinet_bottom_z=cabinet_bottom_z, ours_floor_z=floor_z,
                 floor_plus_381=None if floor_z is None else round(floor_z + FLOOR_TO_CABINET_BOTTOM_MM, 2),
                 cabinet_window_mm=CABINET_WINDOW_MM, families=dict(legs=list(families.LAW_LEG_FAMILIES), cabinet=list(families.LAW_CABINET_FAMILIES), envelope=list(families.LAW_ENVELOPE_FAMILIES)), rows=rows)
    common.dump_json(block, os.path.join(cfg.data, "law_adjusted.json"))
    return block


def _row(vname, sc, view, M, O, O2, applied, det, OUT, DAT, title, lab, grid, log):
    raw = _metrics(M, O); adj = _metrics(M, O2)
    np.save(f"{DAT}/{vname}_all_law.npy", O2)
    rgb = overlays.compose(M, O2, view, sc, grid_mm=grid)
    png = f"{OUT}/{vname}_overlay_law_adjusted.png" if sc == 1.0 else f"{OUT}/zoom_{vname}_law_adjusted.png"
    overlays.annotate(rgb, M, O2, view, sc, title, lab, grid_mm=grid).save(png)
    row = dict(view=vname, px_per_mm=sc, window=dict(h=[view["x0"], view["x1"]], v=[view["y0"], view["y1"]]), raw=raw, law=adj, applied=applied, details=det, file=png,
               iou_raw=raw["iou"], iou_law=adj["iou"], xor_raw=raw["xor_px"], xor_law=adj["xor_px"])
    log(f"[law_adjust] {vname:24s} IoU raw {raw['iou']} -> law {adj['iou']}   XOR {raw['xor_px']} -> {adj['xor_px']}   model-only {raw['model_only_px']} -> {adj['model_only_px']}   ours-only {raw['ours_only_px']} -> {adj['ours_only_px']}   [{'; '.join(applied) or 'nothing applied'}]")
    return row


if __name__ == "__main__":
    cfg, a = paths.from_args(description=__doc__, extra=lambda p: p.add_argument("--law-adjust", nargs="?", const=DEFAULT_JSON, default=DEFAULT_JSON, help=f"deltas JSON (default {DEFAULT_JSON})"))
    d, ours = common.load_ours(cfg.ours); OG = common.ours_groups(ours)
    nodes, MG = common.load_model(cfg.model_obj_dir)
    run(cfg, ours, OG, nodes, MG, load(a.law_adjust))
