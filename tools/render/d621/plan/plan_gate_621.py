#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""D621 STANDING PLAN GATE (D621-PLAN-1, LAW rows): pocket-scale plan overlay of OUR Diamond Pro-Am 8 ft export vs the
purchased model — per pocket (all six), per height (bed+20 / nose / cap−1), registered on each pocket's OWN nose-line
intersection, 2 px/mm even-odd masks.

WHY (owner rejection of card 19 from the plan view, 2026-09-03): the corner leather ring's arms ran 22 mm INTO the
cushion body (2257 mm² of ring inside the rubber at the nose height) and the ALIGN-2 law rows could not see it —
they are whole-table silhouettes and a nearest-surface p90 over 45 dm² of geometry; a 0.3 dm² arm buried inside the
cushion scores as aligned. These rows measure the relation itself.

ROWS (per pocket, per height; every row LAW — bars the seal):
  (a) area(ring ∩ cushion) ≤ 100 mm²        the model's own contact strip is 22–52 mm² and the grid uncertainty ±100
  (b) |arm end − cushion back face| ≤ 2 mm  the model reads 0.9–1.2 with ±1 mm edge noise (both arms, worst)
  (c) plan IoU of the ring footprint vs the model's ≥ 0.9 after per-pocket registration
  (d) mouth at the nose height vs the ruled source (kernel letters CP-01 / SP-01) ≤ 3 mm, and the facing line's
      initial straight facing angle vs the kernel facing (CP-02 / SP-02 kernel_deviation_deg) ≤ 1° (nose height
      only). C9 CU-14 measures the separate terminal return; it does not move the nose or ball-facing segment.
INFO rows: the model's own mouth (the disclosed side-mouth residual), the strip of rubber back exposed between the
facing's back corner and the arm's inner edge, ring apex positions, cushion end positions.

RED ARM: --red-arm evaluates the same rows on a known-bad export (the 7108eb60 seal export) and exits 0 only if rows
(a), (b) and (c) FIRE there (the gate proves it can see the defect it was written for).

  python3 tools/render/d621/plan/plan_gate_621.py --ours <export.json> --out /tmp/d621-plan1/gate/<run>
        [--prev <export.json>] [--red-arm] [--model-obj-dir DIR] [--defs docs/geometry/diamond-proam-8ft-table-definition.json]

QUARANTINE: <out> must be outside the repo; the model's vertices are read in memory and never written — only masks,
overlays and numbers leave this process, all under <out>.
"""
import sys
sys.dont_write_bytecode = True
import argparse
import re
import datetime
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "align"))
import planlib_621 as pl                       # noqa: E402
import common                                  # noqa: E402  (align: load_ours -> model frame mm)
import objlib                                  # noqa: E402  (align: quarantine OBJ loader + section)
import paths                                   # noqa: E402

REPO = paths.REPO_ROOT
# D621-PLAN-3-RECORD-3 — THE GATE TRUSTS ONLY THE TREE: the row ids, operators and thresholds are read from the committed
# law file (tools/render/d621/law/plan_law_621.json; its sha256 rides in every result), the row VALUES are measured from the
# export in-process. This module no longer writes card figures on its own: the card-bearing ALIGN gate imports it, re-measures
# the rows itself and draws the figures from that in-memory result (align_gate_621.py --card-run --card-out).
LAW_PATH = os.path.join(REPO, "tools", "render", "d621", "law", "plan_law_621.json")


def load_law(path=LAW_PATH):
    law = json.load(open(path))
    assert law.get("schema") == "d621-plan-law/1", f"plan law schema {law.get('schema')!r}"
    thr = {r["row"]: r for r in law["rows"]}
    return law, dict(a_mm2=thr["a"]["thr"], b_mm=thr["b"]["thr"], c_iou=thr["c"]["thr"], d_mm=thr["d1"]["thr"], d_deg=thr["d2"]["thr"]), _sha(path)


LAW, THRESH, LAW_SHA = None, None, None


def load_defs(path):
    d = json.load(open(path))
    f = {x["id"]: x for x in d["features"]}
    return dict(mouth={"corner": f["CP-01"]["value_mm"], "side": f["SP-01"]["value_mm"]},
                facing_dev={"corner": f["CP-02"]["kernel_deviation_deg"], "side": f["SP-02"]["kernel_deviation_deg"]},
                cw=f["CU-04"]["value_mm"], sha=_sha(path))


def model_obj_set_sha256(model_dir):
    """D621-PLAN-3-RECORD-2 addendum: a digest of the purchased-model OBJ SET the plan gate measured against — sorted file names
    with each file's sha256 (numbers only leave the quarantine; the bytes never do). The ALIGN fold recomputes it over ITS model dir."""
    import hashlib
    h = hashlib.sha256()
    for fn in sorted(f for f in os.listdir(model_dir) if f.lower().endswith(".obj")):
        with open(os.path.join(model_dir, fn), "rb") as fh:
            h.update(fn.encode()); h.update(b":"); h.update(hashlib.sha256(fh.read()).hexdigest().encode()); h.update(b"\n")
    return h.hexdigest()


def _sha(p):
    import hashlib
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def is_cushion_ours(n): return n.startswith("dm-cushion-")
def is_ring_ours(n): return n.startswith("dm-bootcollar-")
def is_cushion_model(n): return n.startswith("pool_rubber")
def is_ring_model(n): return n.startswith("pool_leather")


def facing_angle(segs_uw, P_uw, frame, sigma, back, span=10.0, max_along=150.0):
    """Initial straight facing after the jaw arc, selected without an expected angle.

    The old 10 mm depth-span exclusion also removed a short valid straight
    facing after C9. Resolve the circular jaw from the section itself, then
    measure its first outgoing segment. A PCA over the initial and terminal
    planes would test neither. Neither the expected angle nor CU-14 selects
    the segment. Positive means the face approaches the pocket going back.
    """
    points = np.asarray(segs_uw).reshape(-1, 2)
    depth = frame.depth(points, sigma)
    along = frame.along(points, sigma)
    keep = (sigma*points[:, 1] > 0) & (np.abs(along) < max_along) & (depth <= back+.05)
    # TESSELLATION: the standing section deduplication precision, 1 micrometre.
    # Keep the pocket-facing envelope at each depth; triangle cuts may split
    # an arc station by a few Float32 ulps.
    by_depth = {}
    for d, a in zip(depth[keep], along[keep]):
        key = round(float(d), 3)
        if key not in by_depth or a < by_depth[key][0]:
            by_depth[key] = (float(a), float(d))
    trace = np.array([by_depth[key] for key in sorted(by_depth)])
    return initial_facing_from_trace(trace)


# TESSELLATION: same micrometre precision as the standing section deduplication.
def initial_facing_from_trace(trace, precision=1e-3):
    """Fit successive jaw-arc prefixes; the first off-circle edge is the face.

    Precision is the section's micrometre deduplication grid, not an angular
    acceptance bar. Four concyclic points are required; an unresolved jaw
    cannot silently choose a convenient later line.
    """
    if len(trace) < 5:
        return None
    last_arc = None
    for count in range(4, len(trace)+1):
        q = trace[:count] - trace[0]
        design = np.c_[2*q, np.ones(count)]
        coef, _, rank, _ = np.linalg.lstsq(design, np.sum(q*q, axis=1), rcond=None)
        if rank < 3 or np.dot(coef[:2], coef[:2])+coef[2] <= 0:
            break
        radius = np.sqrt(np.dot(coef[:2], coef[:2])+coef[2])
        residual = np.abs(np.linalg.norm(q-coef[:2], axis=1)-radius)
        if residual.max() > precision:
            break
        last_arc = count-1
    if last_arc is None or last_arc+1 >= len(trace):
        return None
    v = trace[last_arc+1] - trace[last_arc]
    if v[1] < 0:
        v = -v                             # orient toward increasing depth
    return float(np.degrees(np.arctan2(-v[0], v[1])))   # along DEcreasing with depth = toward the pocket = positive


def facing_error(arms, expected):
    """Both independently measured arms are required; missing one is not PASS."""
    if set(arms) != {"w-", "w+"}:
        return None
    values = [a.get("facing_angle_deg") if isinstance(a, dict) else None for a in arms.values()]
    if any(value is None or not np.isfinite(value) for value in values):
        return None
    return max(abs(value-expected) for value in values)


def measure_pocket(kind, frame, cush_segs, ring_segs, zc, res=pl.RES, join_arcs=False):
    """all numbers for one (pocket, height) of one side (ours or model), in the pocket frame"""
    cs = frame.segs(cush_segs)
    rs = frame.segs(ring_segs)
    mc, _, _ = pl.mask_of(cs, res=res)
    mr, nopen, RL = pl.mask_of(rs, res=res, join_arcs=join_arcs)
    us, ws = pl.grid(res=res)
    R = dict(z=zc, above_bed=round(zc - pl.BED_Z, 2), ring_open_loops=nopen, ring_loops=len(RL),
             ring_area_mm2=round(float(mr.sum() / res ** 2), 1), cushion_area_mm2=round(float(mc.sum() / res ** 2), 1))
    ov = mr & mc
    R["ring_in_cushion_mm2"] = round(float(ov.sum() / res ** 2), 1)
    P = cs.reshape(-1, 2) if len(cs) else np.zeros((0, 2))
    Q = rs.reshape(-1, 2) if len(rs) else np.zeros((0, 2))
    arms = {}
    for sigma in (-1, 1):
        side = "w-" if sigma < 0 else "w+"
        Pc = P[sigma * P[:, 1] > 0]
        Qr = Q[sigma * Q[:, 1] > 0]
        if len(Pc):
            alP = frame.along(Pc, sigma)
            Pc = Pc[(alP > -5.0) & (alP < 150.0)]     # the pocket region of that rail
        if not len(Pc) or not len(Qr):
            arms[side] = None
            continue
        dP = frame.depth(Pc, sigma)
        dQ = frame.depth(Qr, sigma)
        back = float(dP.max())
        # the cushion's nose end on this side: the point of least depth, nearest the pocket
        near = Pc[dP < dP.min() + 0.05]
        nose_end = near[int(np.argmin(frame.along(near, sigma)))]
        # back corner: the deepest cushion point nearest the pocket
        deep = Pc[dP > back - 0.5]
        back_corner = deep[int(np.argmin(frame.along(deep, sigma)))]
        arm_end = float(dQ.min())
        # the arm's inner edge at its end: the least |w| among ring points within 1 mm of the arm end
        tip = Qr[dQ < arm_end + 1.0]
        inner_edge = float(np.abs(tip[:, 1]).min()) if len(tip) else None
        outer_edge = float(np.abs(tip[:, 1]).max()) if len(tip) else None
        fac = facing_angle(cs, P, frame, sigma, back)
        arms[side] = dict(cushion_back_depth=round(back, 2), arm_end_depth=round(arm_end, 2),
                          gap=round(arm_end - back, 2),
                          nose_end_uw=[round(float(nose_end[0]), 2), round(float(nose_end[1]), 2)],
                          back_corner_uw=[round(float(back_corner[0]), 2), round(float(back_corner[1]), 2)],
                          arm_inner_edge_abs_w=None if inner_edge is None else round(inner_edge, 2),
                          arm_outer_edge_abs_w=None if outer_edge is None else round(outer_edge, 2),
                          facing_angle_deg=None if fac is None else round(fac, 2))
    R["arms"] = arms
    ok = [a for a in arms.values() if a]
    R["arm_gap_worst_mm"] = round(max(abs(a["gap"]) for a in ok), 2) if ok else None
    if all(arms.get(s) for s in ("w-", "w+")):
        n0, n1 = np.array(arms["w-"]["nose_end_uw"]), np.array(arms["w+"]["nose_end_uw"])
        b0, b1 = np.array(arms["w-"]["back_corner_uw"]), np.array(arms["w+"]["back_corner_uw"])
        R["mouth_nose_mm"] = round(float(np.linalg.norm(n1 - n0)), 2)
        R["mouth_back_mm"] = round(float(np.linalg.norm(b1 - b0)), 2)
        # the rubber back exposed between the facing's back corner and the arm's inner edge (|lateral| distance)
        exp = []
        for s in ("w-", "w+"):
            a = arms[s]
            if a["arm_inner_edge_abs_w"] is not None:
                exp.append(round(a["arm_inner_edge_abs_w"] - abs(a["back_corner_uw"][1]), 2))
        R["exposed_back_strip_mm"] = exp
    # ring apex along the axis (|w| < 1): inner (throat) and outer
    if len(Q):
        ax = Q[np.abs(Q[:, 1]) < 1.0]
        if len(ax):
            R["ring_axis_u_inner_outer"] = [round(float(ax[:, 0].min()), 2), round(float(ax[:, 0].max()), 2)]
        R["ring_lateral_halfwidth_max"] = round(float(np.abs(Q[:, 1]).max()), 2)
    return R, mr, mc


def _measure_registration(args, registration):
    """Measure every PLAN row from the export (values), decide them against the committed law (op / thr) and return
    (out, masks) IN MEMORY — the card-bearing ALIGN gate consumes this directly; run() below writes the stand-alone files."""
    global LAW, THRESH, LAW_SHA
    LAW, THRESH, LAW_SHA = load_law(getattr(args, "law", None) or LAW_PATH)
    os.makedirs(args.out, exist_ok=True)
    defs = load_defs(args.defs)
    t0 = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    d, ours = common.load_ours(args.ours)
    nodes = objlib.load_all(args.model_obj_dir)
    prev = None
    if args.prev:
        _, prev = common.load_ours(args.prev)
    assert {k: float(v) for k, v in pl.CUTS.items()} == {k: float(v) for k, v in LAW["cuts"].items()}, "planlib cuts ≠ the committed law's cuts"
    apex_records = {}
    if registration == "own-apex-exact":
        apex_records = dict(ours=pl.exact_nose_apex(objlib, ours, is_cushion_ours),
                            model=pl.exact_nose_apex(objlib, nodes, is_cushion_model))
        z_nose_ours, z_nose_model = (apex_records[side]["height_mm"] for side in ("ours", "model"))
        onx, ony = pl.nose_lines(objlib, ours, is_cushion_ours, z=z_nose_ours)
        mnx, mny = pl.nose_lines(objlib, nodes, is_cushion_model, z=z_nose_model)
        if prev:
            apex_records["prev"] = pl.exact_nose_apex(objlib, prev, is_cushion_ours)
        frames_p = pl.pocket_frames(*pl.nose_lines(objlib, prev, is_cushion_ours,
                                    z=apex_records["prev"]["height_mm"])) if prev else None
    elif registration == "legacy-model-height":
        onx, ony = pl.nose_lines(objlib, ours, is_cushion_ours)
        mnx, mny = pl.nose_lines(objlib, nodes, is_cushion_model)
        z_nose_ours = pl.nose_z(objlib, ours, is_cushion_ours)
        z_nose_model = pl.CUTS["nose"]
        frames_p = pl.pocket_frames(*pl.nose_lines(objlib, prev, is_cushion_ours)) if prev else None
    else:
        raise ValueError("unknown PLAN registration method")
    print(f"[plan {registration}] ours nose lines |X| {onx:.6f} |Y| {ony:.6f} (apex z {z_nose_ours}); model |X| {mnx:.6f} |Y| {mny:.6f} (apex z {z_nose_model})")
    frames_o = pl.pocket_frames(onx, ony)
    frames_m = pl.pocket_frames(mnx, mny)
    rows = []
    per_pocket = {}
    masks = {}
    for (kind, pname, fo), (_, _, fm) in zip(frames_o, frames_m):
        tgt_o = fo.N + 100.0 * fo.u
        tgt_m = fm.N + 100.0 * fm.u
        ring_o, dro = pl.nearest_mesh(ours, is_ring_ours, tgt_o)
        ring_m, drm = pl.nearest_mesh(nodes, is_ring_model, tgt_m)
        cush_o = pl.meshes_near(ours, is_cushion_ours, fo.N, 200.0)
        cush_m = pl.meshes_near(nodes, is_cushion_model, fm.N, 200.0)
        pp = dict(kind=kind, ours=dict(ring=ring_o, cushions=cush_o), model=dict(ring=ring_m, cushions=cush_m),
                  frame_ours=dict(N=fo.N.tolist(), axis=fo.u.tolist()), frame_model=dict(N=fm.N.tolist(), axis=fm.u.tolist()),
                  cuts={})
        if prev:
            fp = frames_p[[p[1] for p in frames_p].index(pname)][2]
            pp["prev"] = dict(ring=pl.nearest_mesh(prev, is_ring_ours, fp.N + 100.0 * fp.u)[0],
                              cushions=pl.meshes_near(prev, is_cushion_ours, fp.N, 200.0))
        for ck, zc in pl.CUTS.items():
            def secs(meshes, names, z=None):
                out = [pl.section_xy(objlib, meshes[n], zc if z is None else z) for n in names]
                out = [s for s in out if len(s)]
                return pl.dedupe(np.concatenate(out)) if out else np.zeros((0, 2, 2))
            Ro, mro, mco = measure_pocket(kind, fo, secs(ours, cush_o), secs(ours, [ring_o]), zc, join_arcs=True)
            Rm, mrm, mcm = measure_pocket(kind, fm, secs(nodes, cush_m), secs(nodes, [ring_m]), zc, join_arcs=True)
            inter = int((mro & mrm).sum())
            union = int((mro | mrm).sum())
            iou = inter / union if union else 0.0
            cut = dict(ours=Ro, model=Rm, ring_iou=round(iou, 4))
            if prev:
                Rp, mrp, mcp = measure_pocket(kind, fp, secs(prev, pp["prev"]["cushions"]), secs(prev, [pp["prev"]["ring"]]), zc, join_arcs=True)
                cut["prev"] = Rp
                cut["prev_ring_iou"] = round(int((mrp & mrm).sum()) / max(1, int((mrp | mrm).sum())), 4)
                masks[(pname, ck, "prev")] = (mrp, mcp)
            masks[(pname, ck, "ours")] = (mro, mco)
            masks[(pname, ck, "model")] = (mrm, mcm)
            pp["cuts"][ck] = cut
            # LAW rows
            rows.append(dict(pocket=pname, cut=ck, row="a", label="area(ring ∩ cushion) [mm²]",
                             value=Ro["ring_in_cushion_mm2"], model=Rm["ring_in_cushion_mm2"], op="<=", thr=THRESH["a_mm2"]))
            rows.append(dict(pocket=pname, cut=ck, row="b", label="|arm end − cushion back| worst arm [mm]",
                             value=Ro["arm_gap_worst_mm"], model=Rm["arm_gap_worst_mm"], op="<=", thr=THRESH["b_mm"]))
            rows.append(dict(pocket=pname, cut=ck, row="c", label="plan IoU ring vs model ring",
                             value=round(iou, 4), model=1.0, op=">=", thr=THRESH["c_iou"]))
            if ck == "nose":
                # (d) at OUR nose apex height (the o = 0 ring IS the kernel plan polygon there; 0.6 mm lower the
                # sampled jaw arc's welded chords slide the nose-line junction 1.5-3 mm along the rail)
                Rd, _, _ = measure_pocket(kind, fo, secs(ours, cush_o, z_nose_ours), secs(ours, [ring_o], z_nose_ours), z_nose_ours, join_arcs=True)
                cut["ours_at_own_nose"] = Rd
                mouth_letter = defs["mouth"][kind]
                rows.append(dict(pocket=pname, cut=ck, row="d1", label=f"mouth at the nose vs kernel letter {mouth_letter} [mm] (at our apex z {z_nose_ours})",
                                 value=None if Rd.get("mouth_nose_mm") is None else round(abs(Rd["mouth_nose_mm"] - mouth_letter), 2),
                                 model=None if Rm.get("mouth_nose_mm") is None else round(Rm["mouth_nose_mm"], 2),
                                 op="<=", thr=THRESH["d_mm"], note=f"ours {Rd.get('mouth_nose_mm')} (back {Rd.get('mouth_back_mm')}) / model {Rm.get('mouth_nose_mm')} (back {Rm.get('mouth_back_mm')}) — the model value is the disclosed residual, not a bar"))
                dev = defs["facing_dev"][kind]
                exp_ang = 45.0 + dev if kind == "corner" else dev  # both facings run toward the pocket going back (the mouths narrow at the back)
                angs = [a["facing_angle_deg"] for a in Rd["arms"].values() if a and a["facing_angle_deg"] is not None]
                worst = facing_error(Rd["arms"], exp_ang)
                rows.append(dict(pocket=pname, cut=ck, row="d2", label=f"initial straight facing angle vs kernel {exp_ang:g}° (CU-14 terminal return is separate) [°]",
                                 value=None if worst is None else round(worst, 2),
                                 model=[a["facing_angle_deg"] for a in Rm["arms"].values() if a],
                                 op="<=", thr=THRESH["d_deg"], note=f"ours {angs}"))
        per_pocket[pname] = pp
    # evaluate
    for r in rows:
        v = r["value"]
        r["pass"] = None if v is None else (v <= r["thr"] if r["op"] == "<=" else v >= r["thr"])
    law = [r for r in rows if r["pass"] is not None]
    npass = sum(1 for r in law if r["pass"])
    verdict = "PASS" if npass == len(law) and len(law) == len(rows) else "FAIL"
    fired = dict(a=any(r["row"] == "a" and r["pass"] is False for r in rows),
                 b=any(r["row"] == "b" and r["pass"] is False for r in rows),
                 c=any(r["row"] == "c" and r["pass"] is False for r in rows))
    # D621-PLAN-3 (review r4 P2): the result is BOUND to its input — the dump's digest, a schema tag, the expected row
    # count and a digest of the row keys/values — so the ALIGN fold can refuse a stale, foreign, truncated or hand-edited PLAN
    import hashlib
    rows_digest = hashlib.sha256(json.dumps([[r[k] for k in ("pocket", "cut", "row", "value", "op", "thr")] for r in rows], sort_keys=True).encode()).hexdigest()
    n_pockets = len(per_pocket)
    expected_rows = n_pockets * (len(pl.CUTS) * 3 + 2)
    out = dict(tool="plan_gate_621.py", schema="d621-plan-gate/4", when_utc=t0, ours=os.path.abspath(args.ours), ours_sha256=_sha(args.ours),
               law=dict(path=os.path.relpath(getattr(args, "law", None) or LAW_PATH, REPO), sha256=LAW_SHA, expected_rows=LAW["expected_rows"]),
               expected_rows=expected_rows, rows_sha256=rows_digest, prev=args.prev and os.path.abspath(args.prev),
               before_sha256=_sha(args.prev) if args.prev else None,
               served_web_dir=d.get("served_web_dir"), kernel=d.get("kernel_console"),
               model_obj_dir=os.path.abspath(args.model_obj_dir), model_obj_set_sha256=model_obj_set_sha256(args.model_obj_dir),
               defs=dict(path=os.path.abspath(args.defs), sha256=defs["sha"], mouth=defs["mouth"], facing_dev=defs["facing_dev"]),
               nose_lines=dict(ours=[onx, ony], model=[mnx, mny]), nose_apex_z=dict(ours=z_nose_ours, model=z_nose_model), cuts=pl.CUTS, res_px_per_mm=pl.RES, thresholds=THRESH,
               registration_method=registration, exact_apex_measurements=apex_records,
               rows=rows, per_pocket=per_pocket, verdict=verdict, law_passed=npass, law_total=len(rows), fired=fired,
               red_arm=bool(args.red_arm))
    return out, masks


def measure(args):
    """One committed deciding method, with a fresh non-deciding old column."""
    law, _, _ = load_law(getattr(args, "law", None) or LAW_PATH)
    if law["registration_method"]["deciding"] != "own-apex-exact":
        raise ValueError("the committed FIX1 own-apex ruling is missing")
    out, masks = _measure_registration(args, "own-apex-exact")
    secondary, _ = _measure_registration(args, "legacy-model-height")
    keys = lambda row: (row["pocket"], row["cut"], row["row"])
    old = {keys(row): row for row in secondary["rows"]}
    if {keys(row) for row in out["rows"]} != set(old):
        raise ValueError("PLAN deciding/secondary row sets differ")
    for row in out["rows"]:
        before = old[keys(row)]
        assert (row["op"], row["thr"]) == (before["op"], before["thr"])
        row["secondary"] = dict(before, decides=False, method="legacy-model-height")
    out["measurement_ruling"] = law["registration_method"]
    out["secondary"] = dict(decides=False, **secondary)
    return out, masks


def run(args):
    out, masks = measure(args)
    json.dump(out, open(os.path.join(args.out, "plan_gate.json"), "w"), indent=1)
    write_md(out, os.path.join(args.out, "PLAN.md"))
    if not args.no_overlays:
        try:
            overlays(out, masks, args.out, out.get("prev") is not None)
        except Exception as e:  # overlays are evidence, not the verdict
            print(f"[plan] overlays failed: {e!r}")
    # D621-PLAN-3-RECORD-3: no card path here — card figures exist only as the in-process output of the card-bearing ALIGN gate
    # (align_gate_621.py --card-run --card-out), which re-measures these rows itself; this CLI has no file it could be forged with.
    print_rows(out)
    fired, verdict, npass, rows = out["fired"], out["verdict"], out["law_passed"], out["rows"]
    if args.red_arm:
        ok = fired["a"] and fired["b"] and fired["c"]
        print(f"[plan] RED ARM: rows fired a={fired['a']} b={fired['b']} c={fired['c']} -> {'ARMED (the gate sees the defect)' if ok else 'NOT ARMED'}")
        return 0 if ok else 3
    print(f"[plan] VERDICT {verdict}: LAW {npass}/{len(rows)}")
    return 0 if verdict == "PASS" else 3


def print_rows(out):
    print(f"\n== D621 PLAN GATE rows ({out['ours']}; model {out['model_obj_dir']})")
    print(f"  {'pocket':10s} {'cut':5s} {'row':3s} {'old -> new':>20s} {'thr':>7s}  {'model':>9s}  pass  label")
    for r in out["rows"]:
        v = "n/a" if r["value"] is None else f"{r['value']:.3f}" if isinstance(r["value"], float) else str(r["value"])
        m = r["model"] if not isinstance(r["model"], float) else f"{r['model']:.2f}"
        before = r.get("secondary", {}).get("value", "n/a")
        print(f"  {r['pocket']:10s} {r['cut']:5s} {r['row']:3s} {str(before) + ' -> ' + v:>20s} {r['op']}{r['thr']:<6g} {str(m):>9s}  {'PASS' if r['pass'] else ('n/a' if r['pass'] is None else 'FAIL'):4s}  {r['label']}")


def write_md(out, path):
    L = [f"# D621 plan gate — {out['verdict']} (LAW {out['law_passed']}/{out['law_total']}){' — RED ARM run' if out['red_arm'] else ''}",
         f"ours `{out['ours']}` (served {out['served_web_dir']}, {out['kernel']}); model `{out['model_obj_dir']}`; {out['when_utc']}",
         f"nose lines ours |X| {out['nose_lines']['ours'][0]:.2f} / |Y| {out['nose_lines']['ours'][1]:.2f}, model {out['nose_lines']['model'][0]:.2f} / {out['nose_lines']['model'][1]:.2f}; "
         f"cuts {out['cuts']}; {out['res_px_per_mm']:g} px/mm even-odd; letters {out['defs']['mouth']} mm, facing dev {out['defs']['facing_dev']}° (defs sha {out['defs']['sha256'][:12]})",
         "", "Old registration stays secondary; exact own-apex registration decides. All thresholds and counts are unchanged.",
         "", "| pocket | cut | row | old -> new | bar | model | pass | label |", "|---|---|---|---|---|---|---|---|"]
    for r in out["rows"]:
        v = "n/a" if r["value"] is None else r["value"]
        L.append(f"| {r['pocket']} | {r['cut']} | {r['row']} | {r.get('secondary', {}).get('value', 'n/a')} -> {v} | {r['op']} {r['thr']:g} | {r['model']} | "
                 f"{'PASS' if r['pass'] else ('n/a' if r['pass'] is None else 'FAIL')} | {r['label']}{(' — ' + r['note']) if r.get('note') else ''} |")
    L += ["", "## INFO per pocket (nose cut): cushion ends, arm ends, exposed back strip, ring apex (pocket frame, mm)",
          "| pocket | side | cushion back / arm end / gap (ours) | (model) | nose end u,w / back corner u,w (ours) | (model) | exposed strip ours / model | ring axis inner..outer ours / model | mouth nose / back ours | model |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for pn, pp in out["per_pocket"].items():
        c = pp["cuts"]["nose"]
        o, m = c["ours"], c["model"]
        for s in ("w-", "w+"):
            ao, am = o["arms"].get(s), m["arms"].get(s)
            if not ao or not am:
                continue
            L.append(f"| {pn} | {s} | {ao['cushion_back_depth']} / {ao['arm_end_depth']} / {ao['gap']} | {am['cushion_back_depth']} / {am['arm_end_depth']} / {am['gap']} | "
                     f"{ao['nose_end_uw']} / {ao['back_corner_uw']} | {am['nose_end_uw']} / {am['back_corner_uw']} | {o.get('exposed_back_strip_mm')} / {m.get('exposed_back_strip_mm')} | "
                     f"{o.get('ring_axis_u_inner_outer')} / {m.get('ring_axis_u_inner_outer')} | {o.get('mouth_nose_mm')} / {o.get('mouth_back_mm')} | {m.get('mouth_nose_mm')} / {m.get('mouth_back_mm')} |")
    if any("prev" in pp["cuts"]["nose"] for pp in out["per_pocket"].values()):
        L += ["", "## BEFORE (--prev export) vs AFTER, nose cut", "| pocket | (a) prev → now [mm²] | (b) prev → now [mm] | (c) IoU prev → now |", "|---|---|---|---|"]
        for pn, pp in out["per_pocket"].items():
            for ck in ("mid", "nose", "top"):
                c = pp["cuts"][ck]
                if "prev" not in c:
                    continue
                L.append(f"| {pn} {ck} | {c['prev']['ring_in_cushion_mm2']} → {c['ours']['ring_in_cushion_mm2']} | {c['prev']['arm_gap_worst_mm']} → {c['ours']['arm_gap_worst_mm']} | {c['prev_ring_iou']} → {c['ring_iou']} |")
    open(path, "w").write("\n".join(L) + "\n")


def overlays(out, masks, outdir, with_prev):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    us, ws = pl.grid()
    ext = [us[0] - 0.25, us[-1] + 0.25, ws[0] - 0.25, ws[-1] + 0.25]
    for pn, pp in out["per_pocket"].items():
        nrow = 2 if with_prev else 1
        fig, axs = plt.subplots(nrow, 3, figsize=(3 * 7.2, nrow * 7.4), dpi=150, squeeze=False)
        for ci, ck in enumerate(("mid", "nose", "top")):
            for ri, tag in enumerate((["prev", "ours"] if with_prev else ["ours"])):
                ax = axs[ri][ci]
                mr, mc = masks[(pn, ck, tag)]
                mrm, mcm = masks[(pn, ck, "model")]
                # model: blue fills (light), ours: red outlines via contour of the masks
                ax.imshow(np.ma.masked_where(~mcm, mcm), extent=ext, origin="lower", cmap="Blues", alpha=0.25, interpolation="nearest", vmin=0, vmax=1.6)
                ax.imshow(np.ma.masked_where(~mrm, mrm), extent=ext, origin="lower", cmap="Blues", alpha=0.55, interpolation="nearest", vmin=0, vmax=1.3)
                ax.contour(us, ws, mc.astype(float), levels=[0.5], colors=["#d62728"], linewidths=1.2)
                ax.contour(us, ws, mr.astype(float), levels=[0.5], colors=["#7f0000"], linewidths=1.4)
                ov = mr & mc
                if ov.any():
                    ax.imshow(np.ma.masked_where(~ov, ov), extent=ext, origin="lower", cmap="autumn", alpha=0.95, interpolation="nearest")
                c = pp["cuts"][ck]
                R = c[tag]
                iou = c["prev_ring_iou"] if tag == "prev" else c["ring_iou"]
                ax.axvline(0, color="k", ls=":", lw=0.6)
                ax.axhline(0, color="k", ls=":", lw=0.6)
                ax.set_xlim(ext[0], ext[1]); ax.set_ylim(ext[2], ext[3]); ax.set_aspect("equal"); ax.grid(True, lw=0.3, alpha=0.5)
                ax.tick_params(labelsize=7)
                strip = ""
                if ck == "nose" and R.get("exposed_back_strip_mm") is not None:
                    def _worst(v):
                        return max(v) if isinstance(v, (list, tuple)) else v
                    strip = (f"\nINFO rubber-back strip beside the arm: ours {_worst(R['exposed_back_strip_mm'])} / model "
                             f"{_worst(c['model'].get('exposed_back_strip_mm'))} mm (side mouth RULED kernel/WPA)")
                ax.set_title(f"{pn} — {ck} cut z={pl.CUTS[ck]} (bed+{pl.CUTS[ck]-pl.BED_Z:.2f}) — {'BEFORE (prev export)' if tag == 'prev' else 'ours'}\n"
                             f"(a) ring∩cushion {R['ring_in_cushion_mm2']} mm²  (b) arm gap worst {R['arm_gap_worst_mm']} mm  (c) IoU vs model {iou}{strip}", fontsize=8)
                ax.set_xlabel("u along the pocket axis, outboard from the nose intersection [mm]", fontsize=7)
                ax.set_ylabel("w lateral [mm]", fontsize=7)
        fig.text(0.01, 0.005, "MODEL: light blue = rubber footprint, blue = leather ring (pool_leather/pool_rubber, quarantine OBJ, in memory). "
                 "OURS: red = dm-cushion outline, dark red = dm-bootcollar outline; orange fill = ours ring ∩ cushion. Registered on each pocket's own nose-line intersection; 2 px/mm even-odd.", fontsize=7)
        fig.tight_layout(rect=(0, 0.02, 1, 1), h_pad=3.0)   # D621-PLAN-2-RECORD: room for the three-line nose titles above the row below
        fig.savefig(os.path.join(outdir, f"plan_{pn}_3cuts.png"))
        plt.close(fig)
    print(f"[plan] overlays written under {outdir}")


def prev_label_from(prev_path):
    """D621-PLAN-3-RECORD-2: the BEFORE label follows the --prev export — the commit tag of its served tree (overlay-<sha> /
    export-<sha> directory name, when present) and the dump file's own digest; never a round name typed by hand."""
    if not prev_path:
        return "previous export"
    tag = None
    try:
        d = json.load(open(prev_path))
        web = d.get("served_web_dir") or ""
        m = re.search(r"(?:overlay|export)-([0-9a-f]{7,40})", web)
        if m:
            tag = m.group(1)[:8]
    except Exception:
        d = {}
    digest = _sha(prev_path)[:8]
    return f"previous export {tag} (dump {digest})" if tag else f"previous export (dump {digest})"


def card_figures(out, masks, outdir, with_prev, prev_label=None):
    prev_label = prev_label or "previous export"
    """D621-PLAN-2-RECORD — the card-19 plan frames: per pocket (i) a three-row figure BEFORE | AFTER | MODEL alone
    across the three cuts, (ii) the cap−1 cut on its own (AFTER vs the model), the cut the O21 cure shows in."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    os.makedirs(outdir, exist_ok=True)
    us, ws = pl.grid()
    ext = [us[0] - 0.25, us[-1] + 0.25, ws[0] - 0.25, ws[-1] + 0.25]

    def draw(ax, pn, ck, tag):
        mrm, mcm = masks[(pn, ck, "model")]
        ax.imshow(np.ma.masked_where(~mcm, mcm), extent=ext, origin="lower", cmap="Blues", alpha=0.25, interpolation="nearest", vmin=0, vmax=1.6)
        ax.imshow(np.ma.masked_where(~mrm, mrm), extent=ext, origin="lower", cmap="Blues", alpha=0.55, interpolation="nearest", vmin=0, vmax=1.3)
        if tag == "model":
            ax.contour(us, ws, mrm.astype(float), levels=[0.5], colors=["#0b3d91"], linewidths=1.2)
            ax.contour(us, ws, mcm.astype(float), levels=[0.5], colors=["#4a7fc1"], linewidths=1.0)
        else:
            mr, mc = masks[(pn, ck, tag)]
            ax.contour(us, ws, mc.astype(float), levels=[0.5], colors=["#d62728"], linewidths=1.2)
            ax.contour(us, ws, mr.astype(float), levels=[0.5], colors=["#7f0000"], linewidths=1.4)
            ov = mr & mc
            if ov.any():
                ax.imshow(np.ma.masked_where(~ov, ov), extent=ext, origin="lower", cmap="autumn", alpha=0.95, interpolation="nearest")
        ax.axvline(0, color="k", ls=":", lw=0.6); ax.axhline(0, color="k", ls=":", lw=0.6)
        ax.set_xlim(ext[0], ext[1]); ax.set_ylim(ext[2], ext[3]); ax.set_aspect("equal"); ax.grid(True, lw=0.3, alpha=0.5)
        ax.tick_params(labelsize=7)

    def title_for(pp, ck, tag):
        c = pp["cuts"][ck]
        if tag == "model":
            return f"PURCHASED MODEL — {ck} cut z={pl.CUTS[ck]} (bed+{pl.CUTS[ck]-pl.BED_Z:.2f}): leather (blue) + rubber (light blue) sections"
        R = c[tag]; iou = c["prev_ring_iou"] if tag == "prev" else c["ring_iou"]
        who = f"BEFORE — {prev_label}" if tag == "prev" else "AFTER — this commit"
        return (f"{who} — {ck} cut z={pl.CUTS[ck]} (bed+{pl.CUTS[ck]-pl.BED_Z:.2f})\n"
                f"(a) ring∩cushion {R['ring_in_cushion_mm2']} mm²  (b) arm gap worst {R['arm_gap_worst_mm']} mm  (c) IoU vs model {iou}")

    for pn, pp in out["per_pocket"].items():
        rows = (["prev", "ours", "model"] if with_prev else ["ours", "model"])
        fig, axs = plt.subplots(len(rows), 3, figsize=(3 * 7.2, len(rows) * 7.8), dpi=150, squeeze=False)
        for ci, ck in enumerate(("mid", "nose", "top")):
            for ri, tag in enumerate(rows):
                ax = axs[ri][ci]
                draw(ax, pn, ck, tag)
                ax.set_title(title_for(pp, ck, tag), fontsize=8)
                ax.set_xlabel("u along the pocket axis, outboard from the nose intersection [mm]", fontsize=7)
                ax.set_ylabel("w lateral [mm]", fontsize=7)
        row_words = (f"BEFORE ({prev_label}) | " if with_prev else "") + "AFTER | the purchased model alone"
        fig.suptitle(f"{pn} — plan cuts bed+20 / nose / cap−1: {row_words} — registered on each pocket's own nose-line intersection, 2 px/mm", fontsize=10)
        fig.text(0.01, 0.005, "MODEL: light blue = rubber, blue = leather (quarantine OBJ, in memory). OURS: red = dm-cushion outline, dark red = dm-bootcollar outline; orange = ours ring ∩ cushion.\n"
                 "The cap−1 column (right) is where the leg-top cure shows; the plan silhouette from above does not.", fontsize=7)
        fig.tight_layout(rect=(0, 0.02, 1, 0.98), h_pad=3.0)
        fig.savefig(os.path.join(outdir, f"card_{pn}_3cuts_{'before_after_model' if with_prev else 'after_model'}.png"))
        plt.close(fig)
        # the cap−1 cut alone
        c = pp["cuts"]["top"]
        fig, ax = plt.subplots(1, 1, figsize=(9.5, 9.5), dpi=150)
        draw(ax, pn, "top", "ours")
        before = f"; {prev_label} IoU {c['prev_ring_iou']}" if with_prev else ""
        ax.set_title(f"{pn} — cap−1 cut z={pl.CUTS['top']} (bed+{pl.CUTS['top']-pl.BED_Z:.2f}), AFTER vs the purchased model\n"
                     f"(a) ring∩cushion {c['ours']['ring_in_cushion_mm2']} mm²  (b) arm gap worst {c['ours']['arm_gap_worst_mm']} mm  (c) IoU vs model {c['ring_iou']}{before}", fontsize=9)
        ax.set_xlabel("u along the pocket axis, outboard from the nose intersection [mm]", fontsize=8)
        ax.set_ylabel("w lateral [mm]", fontsize=8)
        fig.text(0.01, 0.012, "blue = the model's leather ring section 1 mm under the cap top, light blue = its rubber; dark red = our boot ring section, red = our cushion outline.\n"
                 "Ours now fills the model's leg tops and flanks (the O21 cure); the throat-side inner offset at 30–65° is the throat-circle residual (O24).", fontsize=7)
        fig.tight_layout(rect=(0, 0.04, 1, 1))   # D621-PLAN-2-RECORD verification: the footer is two lines, never clipped
        fig.savefig(os.path.join(outdir, f"card_{pn}_cap-1.png"))
        plt.close(fig)
    print(f"[plan] card figures written under {outdir}")


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--ours", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--prev", default=None, help="an earlier export drawn as the BEFORE row of every overlay")
    p.add_argument("--model-obj-dir", default=os.environ.get("D621_MODEL_OBJ_DIR") or paths.DEFAULT_MODEL_OBJ_DIR)
    p.add_argument("--defs", default=os.path.join(REPO, "docs", "geometry", "diamond-proam-8ft-table-definition.json"))
    p.add_argument("--red-arm", action="store_true")
    p.add_argument("--no-overlays", action="store_true")
    p.add_argument("--law", default=None, help=f"the committed PLAN law file (default {os.path.relpath(LAW_PATH, REPO)}); the card-bearing gate refuses any law file that is not the tree's")
    a = p.parse_args(argv)
    if os.path.abspath(a.out).startswith(REPO + os.sep):
        print("[plan] refusing: --out must be outside the repository (quarantine law)")
        return 2
    return run(a)


if __name__ == "__main__":
    sys.exit(main())
