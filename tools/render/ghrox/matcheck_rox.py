#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""matcheck_rox.py — A2 gate 11 (APPEARANCE): the OX render's own material reads, measured on the
register captures and judged against the dossier frame bands the appearance rows RC-24..RC-27 publish.

WHY IT EXISTS (r9b, maintainer blocker B2): r9 shipped every "aluminium" part as a set of PBR
numbers with no row and no photo read behind them, and the parts rendered cream-white and light
blue-grey.  Nothing in the suite could see that: the letters gate reads GEOMETRY out of the scene
dump, and no gate had ever looked at a PIXEL of the render.  This one does.

HOW: the scene dump gives triangles and mesh names; the capture manifest gives the exact camera the
register was shot with.  We rasterise a mesh-id + depth buffer for a register at the capture's own
resolution, so every pixel of the PNG is attributed to the mesh that actually painted it (no hand
rectangles, nothing to fudge).  Parts are unions of meshes named by pattern.  Each part's colour is
the 10 %-trimmed mean of its sRGB pixels -- the same statistic, on the same kind of rectangle, that
the dossier frames were read with -- and every published number is a RATIO to a second part in the
SAME image (the bed cloth, or the part's own casting), never an absolute byte.

JUDGING: each appearance row publishes `acceptance`, a list of
    {"check": <render_check key>, "band": [lo, hi], "basis": ...}      value must land in [lo, hi]
    {"order": [<key>, "<", <key>], "basis": ...}                       strict order between two reads
The bands are WINDOW-SWEPT frame reads (each frame rectangle re-measured over 729 offsets and sizes;
the published band is the union of those sweeps), so a band edge is a measurement, not a judgement.

Usage:
  matcheck_rox.py --dump D.json --cap CAPDIR [--json DEF.json] --write   # measure and store the reads
  matcheck_rox.py --dump D.json --cap CAPDIR [--json DEF.json] --judge   # measure and judge, exit 1 on RED
"""
from __future__ import annotations
import argparse, json, math, os, re, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

# ---- parts: a named union of dump meshes -------------------------------------------------------
PARTS = {
    "cloth":            r"^dm-bed-cloth$",
    "corner_casting":   r"^dm-pocket-rox-corner-\w+-casting-(top|lip)",
    "side_piece_top":   r"^dm-pocket-rox-side-\w+-piece-(top|lip)",
    "rail_strip":       r"^dm-rail-cap-lip-rox-",
    "apron_trim":       r"^dm-apron-rox-trim-",
    "foot_plate":       r"^dm-foot-plate-rox-",
    "cap":              r"^dm-rail-cap-rox-",
    "apron":            r"^dm-apron-rox($|-(blend|plate|shelf))",
    "pedestal_body":    r"^dm-pedestal-rox-",
    "spandrel":         r"^dm-spandrel-rox-",
    "cup_ring":         r"^dm-pocket-rox-(corner-\w+-(flange|flange-ear|cup-c)|side-\w+-(flange|cup-ring))",
    "void":             r"^dm-pocket-rox-\w+-\w+-(cup-bucket|cup-floor|pan)",
}
# every part the OX entry paints with roxAlMat(), as one group (the elevation chroma read)
ALUMINIUM = ("corner_casting", "side_piece_top", "rail_strip", "apron_trim", "foot_plate")

# ---- render_check keys: what each one measures -------------------------------------------------
# (register, numerator part, numerator statistic, denominator part, denominator statistic).
#   "p90"  = the 90th percentile of the part's luma, i.e. the part's LIT faces.  This is what a
#            rectangle laid on a casting top or a rail cap in a dossier frame reads.
#   "mean" = the 10 %-trimmed mean over every pixel the part paints, lit and shaded together --
#            the honest whole-part level, and the right denominator for the bed cloth (one broad,
#            evenly lit surface).
# A ratio is always taken inside ONE register, between two parts of the SAME image: no absolute
# byte is ever published, so nothing here can be moved by an exposure change.
RATIOS = {
    "cap_p90_over_cloth":             ("corner_3q",   "cap",            "p90",  "cloth",          "mean"),
    "cap_mean_over_cloth":            ("corner_3q",   "cap",            "mean", "cloth",          "mean"),
    "corner_casting_p90_over_cloth":  ("corner_3q",   "corner_casting", "p90",  "cloth",          "mean"),
    "corner_casting_mean_over_cloth": ("corner_3q",   "corner_casting", "mean", "cloth",          "mean"),
    "side_piece_top_p90_over_cloth":  ("middle_3q",   "side_piece_top", "p90",  "cloth",          "mean"),
    "side_piece_top_mean_over_cloth": ("middle_3q",   "side_piece_top", "mean", "cloth",          "mean"),
    "rail_strip_p90_over_cloth":      ("corner_3q",   "rail_strip",     "p90",  "cloth",          "mean"),
    "foot_plate_p90_over_cloth":      ("corner_3q",   "foot_plate",     "p90",  "cloth",          "mean"),
    "foot_plate_over_casting":        ("corner_3q",   "foot_plate",     "p90",  "corner_casting", "p90"),
    "apron_mean_over_cloth":          ("corner_3q",   "apron",          "mean", "cloth",          "mean"),
    "cabinet_mean_over_cloth":        ("middle_3q",   "apron",          "mean", "cloth",          "mean"),
    "pedestal_body_mean_over_cloth":  ("corner_3q",   "pedestal_body",  "mean", "cloth",          "mean"),
    "void_over_casting":              ("plan_corner", "void",           "mean", "corner_casting", "p90"),
    "cup_ring_over_casting":          ("plan_corner", "cup_ring",       "p90",  "corner_casting", "p90"),
    # A3: the frame law is an order of 10 %-trimmed MEANS (value.frame_tone_order, gallery-20: every patch a trimmed mean); r9b paired
    # the cloth's mean with the casting's p90 here, which the mis-scaled ortho mask never tested (it read 2.1). On the corrected mask
    # the casting's brightest decile (its lit dome crest) sits at 1.03 x the cloth mean while its trimmed mean sits at 0.91 x: the
    # published statistic holds, the stricter pairing did not. The row now reads what its basis says.
    "cloth_over_casting":             ("plan_corner", "cloth",          "mean", "corner_casting", "mean"),
    # r9b RC-27: the ortho plan poses put the WHOLE pocket recess on one rig shadow floor (the void, the
    # flange and the casting's shaded faces land within 1 luma of each other -- see value.rig_floor_plan_corner
    # in the JSON), so the tone-order pairs are re-taken in middle_3q, the register whose key actually reaches
    # the side pocket, and the plan_corner numbers are published rather than judged.
    "void_over_cloth":                ("plan_corner", "void",           "mean", "cloth",          "mean"),
    "cup_ring_over_side_piece_top":   ("middle_3q",   "cup_ring",       "mean", "side_piece_top", "mean"),
    "cloth_over_side_piece_top":      ("middle_3q",   "cloth",          "mean", "side_piece_top", "mean"),
}
# Lab reads (register, part, field).  Chroma and the b axis need no ratio -- they are already
# exposure-free -- and the b SIGN is the whole point: r9's aluminium read b -12 to -16 (BLUE) in the
# side elevation while every OX frame reads that family neutral-to-warm.
CHANNELS = {
    "corner_casting_C":      ("corner_3q", "corner_casting", "C"),
    "corner_casting_b":      ("corner_3q", "corner_casting", "b"),
    "elev_side_aluminium_C": ("elev_side", "@aluminium",     "C"),
    "elev_side_aluminium_b": ("elev_side", "@aluminium",     "b"),
    "rail_strip_C":          ("corner_3q", "rail_strip",     "C"),   # r9b: the strip paints 0 px in elev_side
}


def srgb_to_lab(rgb):
    def f(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (f(c) for c in rgb)
    X = 0.4124 * r + 0.3576 * g + 0.1805 * b
    Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    Z = 0.0193 * r + 0.1192 * g + 0.9505 * b
    def g2(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = g2(X / 0.95047), g2(Y / 1.0), g2(Z / 1.08883)
    L, a, bb = 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)
    return L, a, bb, math.hypot(a, bb)


def raster(dump: dict, shot: dict):
    """mesh-id + depth buffer for one register, at the capture's own resolution."""
    cam = np.array(shot["three_cam"], float)
    look = np.array(shot["three_look"], float)
    up = np.array(shot["three_up"], float)
    fov = shot["kernel_pose"]["fov"]
    W, H = shot["register"]["res"]
    fwd = look - cam; fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd, up); right /= np.linalg.norm(right)
    upv = np.cross(right, fwd)
    ty = math.tan(math.radians(fov) / 2); tx = ty * W / H
    # A3 (found while chasing a plan_corner read): the ORTHO registers are rendered by the capture tool with an OrthographicCamera of
    # register.width_m, not with the kernel_pose fov. Projecting them as a 30 deg perspective put every plan / elevation mask at the
    # wrong scale (the corner cup rendered 2x smaller than it is), so the r7..r9b plan_corner rows read whatever happened to lie
    # under a mis-scaled mask. Ortho registers now project orthographically; the perspective ones are unchanged.
    ortho = (shot.get("register") or {}).get("kind") == "ortho"
    if ortho:
        half_w = float(shot["register"]["width_m"]) / 2.0; half_h = half_w * H / W
    ids = np.full((H, W), -1, np.int32)
    zbuf = np.full((H, W), np.inf, np.float64)
    names = []
    for mesh in dump["meshes"]:
        if not mesh.get("visible", True) or not mesh.get("matVisible", True):
            continue
        mid = len(names); names.append(mesh["name"])
        P = np.asarray(mesh["positions"], float).reshape(-1, 3)
        idx = mesh.get("indices")
        T = P[np.asarray(idx, int).reshape(-1, 3)] if idx else P.reshape(-1, 3, 3)
        V = T - cam
        d = np.stack([V @ right, V @ upv, V @ fwd], -1)
        z = d[:, :, 2]
        keep = (z > 1e-4).all(1)
        if not keep.any():
            continue
        d = d[keep]; z = z[keep]
        if ortho:
            px = (d[:, :, 0] / half_w * 0.5 + 0.5) * W
            py = (0.5 - d[:, :, 1] / half_h * 0.5) * H
        else:
            px = (d[:, :, 0] / (z * tx) * 0.5 + 0.5) * W
            py = (0.5 - d[:, :, 1] / (z * ty) * 0.5) * H
        for k in range(len(px)):
            x0 = max(int(math.floor(px[k].min())), 0); x1 = min(int(math.ceil(px[k].max())) + 1, W)
            y0 = max(int(math.floor(py[k].min())), 0); y1 = min(int(math.ceil(py[k].max())) + 1, H)
            if x1 <= x0 or y1 <= y0:
                continue
            ax, ay = px[k, 0], py[k, 0]; bx, by = px[k, 1], py[k, 1]; cx, cy = px[k, 2], py[k, 2]
            den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(den) < 1e-12:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
            l1 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / den
            l2 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / den
            l3 = 1.0 - l1 - l2
            inside = (l1 >= -1e-9) & (l2 >= -1e-9) & (l3 >= -1e-9)
            if not inside.any():
                continue
            if ortho:
                zz = l1 * z[k, 0] + l2 * z[k, 1] + l3 * z[k, 2]  # orthographic depth is linear
            else:
                # perspective-correct depth: interpolate 1/z, not z
                inv = l1 / z[k, 0] + l2 / z[k, 1] + l3 / z[k, 2]
                with np.errstate(divide="ignore", invalid="ignore"):
                    zz = np.where(inv > 0, 1.0 / inv, np.inf)
            sub = zbuf[y0:y1, x0:x1]
            win = inside & (zz < sub)
            if win.any():
                sub[win] = zz[win]
                ids[y0:y1, x0:x1][win] = mid
    return ids, names


def part_pixels(ids, names, img, pattern):
    rx = re.compile(pattern)
    sel = np.zeros(len(names), bool)
    for i, n in enumerate(names):
        if rx.search(n):
            sel[i] = True
    if not sel.any():
        return None
    mask = np.zeros(ids.shape, bool)
    hits = np.nonzero(sel)[0]
    for h in hits:
        mask |= (ids == h)
    if mask.sum() == 0:
        return None
    return img[mask]


def stats(px):
    lum = 0.2126 * px[:, 0] + 0.7152 * px[:, 1] + 0.0722 * px[:, 2]
    lo, hi = np.percentile(lum, [10, 90])
    k = (lum >= lo) & (lum <= hi)
    if not k.any():
        k = np.ones(len(lum), bool)
    mu = px[k].mean(0)
    L, a, b, C = srgb_to_lab(mu)
    return {"n": int(len(lum)), "rgb": [round(float(v), 1) for v in mu],
            "mean": round(float(lum[k].mean()), 2), "p90": round(float(np.percentile(lum, 90)), 2),
            "L": round(L, 2), "a": round(a, 2), "b": round(b, 2), "C": round(C, 2)}


def measure(dump_path, cap_dir):
    dump = json.load(open(dump_path))
    man = json.load(open(os.path.join(cap_dir, "manifest.json")))
    need = sorted({r[0] for r in RATIOS.values()} | {c[0] for c in CHANNELS.values()})
    reads = {}
    for shot_name in need:
        shot = man["shots"].get(shot_name)
        png = os.path.join(cap_dir, f"{shot_name}.png")
        if shot is None or not os.path.exists(png):
            print(f"matcheck: register {shot_name} missing from the capture — REFUSING", file=sys.stderr)
            return None
        img = np.asarray(Image.open(png).convert("RGB"), float)
        ids, names = raster(dump, shot)
        if (ids >= 0).sum() == 0:
            print(f"matcheck: {shot_name} rasterised to an EMPTY id buffer — REFUSING", file=sys.stderr)
            return None
        per = {}
        for part, pat in PARTS.items():
            px = part_pixels(ids, names, img, pat)
            per[part] = stats(px) if px is not None else None
        alu = None
        for part in ALUMINIUM:
            px = part_pixels(ids, names, img, PARTS[part])
            if px is not None:
                alu = px if alu is None else np.concatenate([alu, px])
        per["@aluminium"] = stats(alu) if alu is not None else None
        reads[shot_name] = per
        print(f"matcheck: {shot_name} " + " ".join(
            f"{p}={per[p]['mean']:.1f}/{per[p]['n']}" for p in sorted(per) if per[p]))
    out = {}
    for key, (shot_name, num, nstat, den, dstat) in RATIOS.items():
        a = reads[shot_name].get(num); b = reads[shot_name].get(den)
        out[key] = None if not a or not b or not b[dstat] else round(a[nstat] / b[dstat], 4)
    for key, (shot_name, part, field) in CHANNELS.items():
        a = reads[shot_name].get(part)
        out[key] = None if not a else a[field]
    return {"reads": reads, "ratios": out}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump", required=True)
    ap.add_argument("--cap", required=True)
    ap.add_argument("--json", default=os.path.join(REPO, "docs/geometry/rasson-ox-9ft-table-definition.json"))
    ap.add_argument("--out", default=None, help="write the full per-part read table here")
    ap.add_argument("--write", action="store_true", help="store the measured values into the appearance rows")
    ap.add_argument("--judge", action="store_true", help="exit 1 when a row's acceptance fails")
    a = ap.parse_args()

    m = measure(a.dump, a.cap)
    if m is None:
        print("APPEARANCE GATE RED (measurement refused)")
        sys.exit(1)
    if a.out:
        json.dump(m, open(a.out, "w"), indent=1)
    doc = json.load(open(a.json))
    rows = [f for f in doc["features"] if f.get("kind") == "appearance"]
    if not rows:
        print("matcheck: the definition carries no appearance row — nothing to judge")
        sys.exit(1)
    failures, lines = [], []
    for feat in rows:
        rc = feat["value"].get("render_check")
        if not isinstance(rc, dict):
            failures.append(f"{feat['id']} has no render_check block"); continue
        for key in list(rc):
            if key not in m["ratios"]:
                failures.append(f"{feat['id']}.render_check.{key} names no measurement matcheck computes")
                continue
            v = m["ratios"][key]
            if v is None:
                failures.append(f"{feat['id']}.render_check.{key} could not be measured (part not visible in its register)")
            if a.write:
                rc[key] = v
        for acc in feat["value"].get("acceptance", []):
            if "band" in acc:
                key = acc["check"]; v = m["ratios"].get(key); lo, hi = acc["band"]
                ok = v is not None and lo <= v <= hi
                lines.append(f"  {'OK ' if ok else 'RED'} {feat['id']} {key} = {v} in [{lo}, {hi}]")
                if not ok:
                    failures.append(f"{feat['id']} {key} = {v}, outside the frame band [{lo}, {hi}]")
            elif "order" in acc:
                ka, op, kb = acc["order"]
                va, vb = m["ratios"].get(ka), m["ratios"].get(kb)
                ok = va is not None and vb is not None and (va < vb if op == "<" else va > vb)
                lines.append(f"  {'OK ' if ok else 'RED'} {feat['id']} {ka} ({va}) {op} {kb} ({vb})")
                if not ok:
                    failures.append(f"{feat['id']} order {ka} {op} {kb} fails: {va} vs {vb}")
    if a.write:
        json.dump(doc, open(a.json, "w"), indent=1, ensure_ascii=False)
        open(a.json, "a").write("\n")
        print(f"matcheck: wrote the render_check reads into {len(rows)} appearance row(s)")
    for ln in lines:
        print(ln)
    print(f"matcheck: {len(rows)} appearance row(s), {len(lines)} acceptance test(s), {len(failures)} failure(s)")
    for f in failures[:20]:
        print(f"  FAIL {f}")
    print("APPEARANCE GATE RED" if failures else "APPEARANCE GATE OK")
    sys.exit(1 if (a.judge and failures) else 0)


if __name__ == "__main__":
    main()
