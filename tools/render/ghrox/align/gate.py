#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""gate — the Rasson OX A2 mesh-level ALIGNMENT GATE (A2-PLAN 4a, rulings A2-2 / A2-4).

  python3 tools/render/ghrox/align/gate.py --ours <dump.json> --out /tmp/ox-a2/align/<tag> [--judge] [--redarm] [--quick]
        [--redarm-element cushion_long] [--elements a,b,c]

Writes align-rox.json, ALIGN-ROX.md and the PNGs (silhouettes, zooms, sections, heatmaps) into --out.
--judge  : exit 1 when the overall verdict is RED (exit 2 when --redarm is requested and the red arm does not go red).
--redarm : shift OUR mesh of one element by +5 mm (Z) and prove that element's row goes RED (and moved).
--quick  : subsampled fast mode (< 2 min) for iteration; the full mode must be run in the BACKGROUND with a log.
Quarantine: the purchased OBJ is read in place; only numbers, masks and plots are written; no vertex leaves /tmp."""
import argparse, json, os, sys, time, platform
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import objsoup, ours, register, silhouettes, sections, deviation, dims, thresholds, pocket_reference

def log_to(path):
    fh = open(path, "a")
    def log(*a):
        s = " ".join(str(x) for x in a); print(s, flush=True); fh.write(s + "\n"); fh.flush()
    return log

def verdict_element(dev, thr):
    if thr is None: return "INFO", "no threshold row (photo-referenced or information)"
    if dev.get("absent"): return "RED", f"{dev['absent']} ABSENT in the window (0 triangles)"
    o, m = dev["ours_to_model"], dev["model_to_ours"]; why = []
    for lab, st in (("ours->model", o), ("model->ours", m)):
        if st["median"] is None: why.append(f"{lab}: no samples"); continue
        if st["median"] > thr["median"]: why.append(f"{lab} median {st['median']} > {thr['median']}")
        if st["p90"] > thr["p90"]: why.append(f"{lab} p90 {st['p90']} > {thr['p90']}")
    return ("RED" if why else "GREEN"), ("; ".join(why) if why else f"o->m {o['median']}/{o['p90']}/{o['max']}, m->o {m['median']}/{m['p90']}/{m['max']} within {thr['median']}/{thr['p90']}")

def verdict_section(sec, thr):
    if sec["ours_segments"] == 0: return "RED", "ours: 0 segments at the station"
    if sec["model_segments"] == 0: return "INFO", "model: 0 segments (station outside the soup)"
    h = sec["hausdorff_mm"]; s2s = sec.get("s2s_median_mm") is not None
    med = sec.get("s2s_median_mm") if s2s else sec.get("twoway_median_mm"); p90 = sec.get("s2s_p90_mm") if s2s else sec.get("twoway_p90_mm")
    lab = "section→surface" if s2s else "section 2D"
    why = []
    # v2: a section is judged on its two-way distance distribution (median / p90, the element's own thresholds); the Hausdorff
    # MAX is reported — a single unmatched artefact (a model tongue inside the liner, a cheek-end sliver) set every r7 station red
    if med is None: return "RED", "no two-way distances"
    if med > thr["median"]: why.append(f"{lab} median {med} > {thr['median']}")
    if p90 is not None and p90 > thr["p90"]: why.append(f"{lab} p90 {p90} > {thr['p90']}")
    return ("RED" if why else "GREEN"), ("; ".join(why) if why else f"{lab} median {med}, p90 {p90}; 2D two-way {sec.get('twoway_median_mm')}/{sec.get('twoway_p90_mm')}, Hausdorff max {h}, Frechet {sec['frechet_longest_chain_mm']} (reported)")

def verdict_silhouette(st, thr):
    b = st["boundary_mm"]; why = []
    if b["median"] is None: return "RED", "empty mask"
    if b["median"] > thr["boundary"]: why.append(f"boundary median {b['median']} > {thr['boundary']}")
    if st["iou"] is not None and st["iou"] < thr["iou_min"]: why.append(f"IoU {st['iou']} < {thr['iou_min']}")
    return ("RED" if why else "GREEN"), ("; ".join(why) if why else f"IoU {st['iou']}, boundary {b['median']}/{b['p90']}/{b['max']}")

def fmt(v):
    if v is None: return "—"
    if isinstance(v, float): return f"{v:.4g}" if abs(v) < 1e-3 and v != 0 else (f"{v:.4f}".rstrip("0").rstrip(".") if abs(v) < 1000 else f"{v:.2f}")
    if isinstance(v, list): return "[" + ", ".join(fmt(x) for x in v) + "]"
    return str(v)

def run_all(args, dump, out, log, quick, elements=None):
    R = {}
    t = time.time(); R["registration"] = register.registration(dump); log(f"[gate] registration {time.time()-t:.1f}s")
    t = time.time(); R["silhouettes"] = silhouettes.run_global(dump, out, quick=quick); R["zooms"] = silhouettes.run_zooms(dump, out, quick=quick); log(f"[gate] silhouettes {time.time()-t:.1f}s")
    t = time.time(); R["sections"] = sections.run(dump, out, quick=quick); log(f"[gate] sections {time.time()-t:.1f}s")
    t = time.time(); R["deviation"] = deviation.run(dump, out, elements=elements, quick=quick, log=log); log(f"[gate] deviation {time.time()-t:.1f}s")
    t = time.time(); R["dims"] = dims.build(dump); log(f"[gate] dims {time.time()-t:.1f}s")
    return R

def judge(R, THR):
    V = dict(elements={}, sections={}, silhouettes={}, dims={})
    for name, dev in R["deviation"].items():
        thr = THR.get(name); v, why = verdict_element(dev, thr); V["elements"][name] = dict(verdict=v, why=why, datum=dev["datum"], station=name)
    for sid, sec in R["sections"].items():
        thr = THR.get(sec["element"])
        if thr is None and objsoup.WINDOWS.get(sec["element"], {}).get("datum") == "photo": v, why = "INFO", "photo-governed element (RC-10..RC-17 rows judged by letters-rox; sight_form demoted in r9b C2); mesh section for information"
        else: v, why = verdict_section(sec, thr or THR["above_bed_all"])
        V["sections"][sid] = dict(verdict=v, why=why, element=sec["element"])
    for key, st in R["silhouettes"].items():
        if st["variant"] != "mfr":   # v2: the judged rows are the MFR-envelope ones; EN-07-scaled and raw are information
            V["silhouettes"][key] = dict(verdict="INFO", why=f"{st['datum']} (information; judged rows use the MFR envelope EN-01, side / end on the body band)"); continue
        v, why = verdict_silhouette(st, THR["silhouette_global"]); V["silhouettes"][key] = dict(verdict=v, why=why)
    for key, st in R["zooms"].items():
        zel = silhouettes.ZOOMS.get(key, {}).get("element", ""); zbase = zel.replace("_all", "_above")
        if objsoup.WINDOWS.get(zbase, {}).get("datum") == "photo": V["silhouettes"]["zoom_" + key] = dict(verdict="INFO", why="photo-governed element (letters-rox judges RC-10..RC-16); zoom for information"); continue
        v, why = verdict_silhouette(st, THR["silhouette_zoom"]); V["silhouettes"]["zoom_" + key] = dict(verdict=v, why=why)
    for row in R["dims"]["rows"]:
        V["dims"][row["id"]] = dict(verdict="RED" if row.get("status", "").startswith("RED") else ("GREEN" if row.get("status") == "GREEN" else "INFO"), why=row.get("status"))
    reds = [f"element {k}: {v['why']}" for k, v in V["elements"].items() if v["verdict"] == "RED"] + [f"section {k}: {v['why']}" for k, v in V["sections"].items() if v["verdict"] == "RED"] + \
           [f"silhouette {k}: {v['why']}" for k, v in V["silhouettes"].items() if v["verdict"] == "RED"] + [f"dims {k}: {v['why']}" for k, v in V["dims"].items() if v["verdict"] == "RED"]
    # r9b C3: an INFO row is NOT a pass. The headline prints RED out of the JUDGED rows and the INFO count beside it,
    # so "0 red of 16" can never again be read as "16 rows passed" when four of them were never judged.
    def _c(d): return dict(red=sum(v["verdict"] == "RED" for v in d.values()), info=sum(v["verdict"] == "INFO" for v in d.values()),
                           judged=sum(v["verdict"] in ("RED", "GREEN") for v in d.values()), rows=len(d))
    ce, cs, csi, cd = _c(V["elements"]), _c(V["sections"]), _c(V["silhouettes"]), _c(V["dims"])
    V["overall"] = "RED" if reds else "GREEN"; V["red_list"] = reds; V["counts"] = dict(
        elements_red=ce["red"], elements=ce["rows"], elements_judged=ce["judged"], elements_info=ce["info"],
        sections_red=cs["red"], sections=cs["rows"], sections_judged=cs["judged"], sections_info=cs["info"],
        silhouettes_red=csi["red"], silhouettes=csi["rows"], silhouettes_judged=csi["judged"], silhouettes_info=csi["info"],
        dims_red=cd["red"], dims=cd["rows"], dims_judged=cd["judged"], dims_info=cd["info"])
    return V

def redarm(args, out, log, quick, THR, R0, V0):
    el = args.redarm_element; w = objsoup.WINDOWS[el]
    dump2 = ours.Dump(args.ours, reference_path=args.reference)
    box_global = None
    if w["anchor"] == "nose_long": box_global = (w["box"][0], w["box"][1], dump2.datums["y_nose"] + w["box"][2], dump2.datums["y_nose"] + w["box"][3], objsoup.BEDTOP + w["box"][4], objsoup.BEDTOP + w["box"][5])
    prefixes = {"cushion_long": ["dm-cushion"], "cushion_short": ["dm-cushion"], "rail_cap_long": ["dm-railtop", "dm-rail-cap", "dm-railcap"], "rail_cap_short": ["dm-railtop", "dm-rail-cap", "dm-railcap"],
                "apron_long": ["dm-apron"], "sight_form": ["dm-sight"]}.get(el, [])
    shifted = ours.redarm_shift(dump2, prefixes, box_global, dz=5.0)
    rd = os.path.join(out, "redarm"); os.makedirs(rd, exist_ok=True)
    dev = deviation.run(dump2, rd, elements=[el], quick=quick, log=log)[el]
    sts = [s for s in objsoup.STATIONS if s[1] == el]; sec = sections.run(dump2, rd, stations=sts, quick=quick) if sts else {}
    v, why = verdict_element(dev, THR.get(el)); d0 = R0["deviation"][el]
    def four(d): return [d["ours_to_model"]["median"], d["ours_to_model"]["p90"], d["model_to_ours"]["median"], d["model_to_ours"]["p90"]]
    b4, a4 = four(d0), four(dev)
    deltas = [None if (x is None or y is None) else round(y - x, 2) for x, y in zip(b4, a4)]
    moved = d0.get("absent") is not None or any(x is not None and x >= 2.5 for x in deltas)
    was_green = V0["elements"][el]["verdict"] == "GREEN"
    ok = (v == "RED") and (was_green or moved)
    res = dict(element=el, shift_mm=[0.0, 0.0, 5.0], meshes_shifted=shifted, verdict_before=V0["elements"][el]["verdict"], verdict_after=v, why_after=why,
               metrics_before=dict(zip(("o2m_median", "o2m_p90", "m2o_median", "m2o_p90"), b4)), metrics_after=dict(zip(("o2m_median", "o2m_p90", "m2o_median", "m2o_p90"), a4)), metric_deltas=deltas,
               moved_by_at_least_2p5mm=moved, sections_after={k: dict(hausdorff=s["hausdorff_mm"], frechet=s["frechet_longest_chain_mm"]) for k, s in sec.items()},
               PASS=ok, rule="PASS = the shifted element's row is RED after the +5 mm shift AND (the row was GREEN before OR at least one of its four metrics (median/p90, both directions) rose by >= 2.5 mm) — a vertical shift slides the vertical faces, so only the horizontal-face population moves the full 5 mm")
    log(f"[redarm] {el}: before {V0['elements'][el]['verdict']} {b4} -> after {v} {a4} (deltas {deltas}); PASS={ok}")
    res['reference_arms'] = pocket_reference.redarms(args.reference)
    for arm in res['reference_arms']:
        log(f"[redarm] REFUSED {arm['result']}; fired={arm['armed']}")
    res['PASS'] = res['PASS'] and all(arm['armed'] for arm in res['reference_arms'])
    return res

def write_report(args, R, V, THR, NZ, rr, runtime, out):
    reg = R["registration"]; L = []
    L.append(f"# ALIGN-ROX — Rasson OX A2 mesh-level alignment gate\n")
    L.append(f"Run: {time.strftime('%Y-%m-%d %H:%M')} · host {platform.node()} · mode {'QUICK (subsampled)' if args.quick else 'FULL'} · runtime {runtime:.0f} s · tool `tools/render/ghrox/align/` · **OVERALL: {V['overall']}**\n")
    ds = R.get("dump_summary", {})
    L.append(f"Inputs: ours = `{args.ours}` (sha256 {ds.get('sha256')}, {ds.get('meshes')} meshes / {ds.get('tris')} tris, {ds.get('named')} named + {ds.get('anonymous')} anonymous; table `{ds.get('table')}`, {ds.get('kernel')}); model = the purchased Rasson OX OBJ read in place from the quarantine (cache {reg['model_checks']['tris_table']} table tris + {reg['model_checks']['tris_sights']} sight tris, area {reg['model_checks']['area_table_m2']} m²). Canonical JSON `docs/geometry/{os.path.basename(R['dims']['json_path'])}` rev {R['dims']['json_revision']}. Δ is always **ours − reference**. Nothing from the model was copied; masks/plots/numbers only.\n")
    L.append("## 1. Frame, registration, datum decisions\n")
    L.append(f"Transform ours → model frame: `{reg['transform']}`. ICP: **{reg['icp_applied']}**; rotation search: {reg['rotation_search']}. EN-07 factors x {reg['en07']['x']} / y {reg['en07']['y']} / z {reg['en07']['z']} applied to {reg['en07']['applied_to']}; ball-scale k 1.0257: {reg['en07']['ball_scale_k_1p0257']}.\n")
    L.append("| datum | ours (after transform) | model | Δ | note |\n|---|---|---|---|---|")
    for r in reg["datum_table"]: L.append(f"| {r['datum']} | {fmt(r['ours'])} | {fmt(r['model'])} | {fmt(r['delta'])} | {r['note']} |")
    mc = reg["model_checks"]
    L.append(f"\nModel self-checks (re-measured from the soup this run): bed top {mc['bed_top_measured']} (constant {mc['bed_top_constant']}), nose lines {fmt(mc['nose_lines_section_rule'])}, plan centre {mc['plan_centre_from_noses']}, nose rectangle {mc['playfield_nose_to_nose']}, envelope x {fmt(mc['envelope']['x'])} y {fmt(mc['envelope']['y'])} z {fmt(mc['envelope']['z'])}. Ours symmetry: {reg['symmetry']}.\n")
    L.append("Datum decision per element (A2-2; printed in every report):\n\n| element / row | decision | reason |\n|---|---|---|")
    for d in reg["datum_decisions"]: L.append(f"| {d['element']} | **{d['decision']}** | {d['reason']} |")
    ref = reg['pocket_reference']
    L.append(f"\n**Current pocket datum: FIX2 / {ref['id']}**, SHA-256 `{ref['sha256']}`. MODEL CP-12/SP-12 + A1 nose/bed + PF-01 fix corner {ref['ours_corner']} and side {ref['ours_side']} in OURS world mm. No OURS-fitted comparison origin is accepted. Measured bed/nose and physical wall/pan placement stay separate; non-pocket registration is unchanged. No parser, window, mask, sample-spacing, nearest-triangle or threshold change.\n")
    L.append("**Historical declarations follow. Their v2/v3 moving pocket-axis claims (including those in the legacy window notes) are superseded by FIX2 above, not the current datum rule.**\n")
    L.append("\n**Declaration v2 (r9, ORDER-RASSON-A2-R9 R9-2).** The r7 declaration (windows, anchors, datums) predates the A2 letters; four of its choices contradicted the law's precedence (MFR corrects the model) or mixed kernel-governed positions into raw-form reads, and every RED it produced traced to one of them (per-mesh offender breakdowns, r7/r8 reports). v2 restates: (1) rail-cap windows z 0.5..50 (the -22 floor caught the model's slab edge / the shared cloth sheet — RC-19); (2) pocket-furniture windows anchored on the LINER AXES (kernel-governed CP-05/CP-06 vs the model's own), kernel jaws excluded from ours, forms judged raw; (3) pedestal_end / foot_pad photo-governed → mesh rows INFO (RC-10..RC-16 judged by letters-rox); (4) silhouettes judged against the MFR envelope (EN-01) with side / end on the body band; EN-07-scaled rows kept as information. Thresholds are UNCHANGED (thresholds.py, derived from the soup's noise before the first render); the red arm (cushion_long +5 mm) is unchanged. v2b additions after the first r9 run, each decided from the numbers: (i) the cup datums are the pan-disc centroids (the kernel pocket axes exactly; the floor annuli follow the PK-03 compound bucket and biased the centroid ~2 mm); (ii) the band mask is the UNION of both tables' cushion bands in the common liner-axis frame (the kernel side axis sits 64.17 behind the nose, the model's 49.6: a strip that is cap on one table is cushion band on the other, A2-1); (iii) the purchased mesh's bed-top triangulation fans across the pocket notches (one bed-top triangle's edge runs to y 629.5 at x 0.38 inside the side liner; SP-14's outline is the true edge) — model samples at |z| < 1 inside the liner radius are that artefact and are not judged; (iv) sections are judged on the section→SURFACE distance (each station curve measured in 3D to the other table's surface: the element estimator sampled on the curve) because a plan cut through a near-horizontal surface turns a 0.3 mm height difference on a 0.09 slope into a 3 mm slide of the 2D chain and a thin shell's underside shows on one side only; the 2D two-way median / p90, Hausdorff max and Frechet stay reported. Before (r8 final) / after (r9) numbers per element are in report §8.1.8. **r9b additions (ORDER-RASSON-A2-R9B, blocker B4 and condition C1), both disclosures, neither a new exclusion:** (8) the side / end body band moved from z >= -165 to z >= -148 AFTER the 02:37 full r9 run had already gone RED on it — the RED was `side_mfr boundary median 2.0 mm > 1.5 mm` (IoU 0.9782, itself passing), and the 02:40 re-run with the higher cut was GREEN (IoU 0.9982, boundary 0 / 1 / 3.6 mm). Both logs shipped in pack r9 with no note, which is the process defect; the substance stands on EN-05 (the purchased underside carries a 4.9-6.4 mm camber tagged an as-modelled warp, not a designed feature), and the -165 cut sliced through it, leaving model-only strips mid-length and ours-only strips at the ends. The apron bottom edge is still measured, by the apron_bottom element row (ours flat -159 vs the model's cambered -154..-161). The -165 numbers are kept as an INFO row and printed in the silhouette table: IoU 0.9757, boundary median / p90 / max 2.0 / 5 / 8 mm, 8 994 model-only and 5 445 ours-only px. (9) the cup PLACEMENT conflict that declaration 2's liner-axis frames absorb is now measured and printed in the K / nose-line frames as two delta rows immediately below this paragraph. It is NOT judged: it is a kernel-vs-MODEL conflict under LAW-PURCHASED-BASELINE section 7 and belongs to the owner (card 21b). The label 'MFR-corrected' on that axis was wrong in r7-r9 — no manufacturer datum places the cup — and reads 'kernel-derived' from r9b on. **A3 (v3, ORDER-ROX-A3-PLAN, owner rejection of card 21b from the plan view):** (10) the SEEN liners now hang on the model's own cup centres (RC-32: side 49.33 behind the nose, corner u 45.05; the kernel axes keep physics and the bed hole), so our liner-axis datum is the seen liner's inner-wall circle fit, not the pan-disc centroid — the two tables' frames now coincide to the fit noise and the pocket furniture is compared where it stands; the kernel axes are still printed, and the placement rows of (9) keep reporting the kernel-vs-model Δ. Nothing else in the declaration moves; the cushion end faces are vertical (RC-28) and the between-ends top exists (RC-30), both judged by the new plan-view LAW gate planlaw_rox.py, not here.\n")
    pc = reg.get("placement_conflict")
    if pc:
        L.append("\n**Physical cup placement vs fixed MODEL reference (FIX2; observed, not re-fitted away).** " + pc["why_not_judged"] + "\n")
        L.append("| row | frame | ours [mm] | model [mm] | Δ ours−model [mm] | kernel row | status |\n|---|---|---|---|---|---|---|")
        for r in pc["rows"]:
            L.append(f"| {r['row']} | {r['frame']} | {r['ours']} | {r['model']} | **{r['delta']}** | {r['kernel_row']} | {r['status']} |")
        L.append("\nOurs datum rule: " + str(pc["rows"][0].get("ours_rule")) + ". Model datum rule: the purchased liner axes (CP-12 / SP-12 circle centres).\n")
        for i in pc["info"]: L.append(f"- {i}")
        L.append("")
    L.append("\nElement windows (mm, local frames; `objsoup.WINDOWS`):\n\n| element | anchor | datum | box (h0,h1, v0,v1, w0,w1) | note |\n|---|---|---|---|---|")
    for k, w in objsoup.WINDOWS.items(): L.append(f"| {k} | {w['anchor']} | {w['datum']} | {w['box']} | {w['note']} |")
    L.append("\n## 2. Silhouettes (1 px = 1 mm, filled masks from the meshes)\n")
    L.append("| view | datum | px/mm | IoU | boundary median / p90 / max [mm] | model-only px | ours-only px | model extent | ours extent | verdict | png |\n|---|---|---|---|---|---|---|---|---|---|---|")
    for k, s in R["silhouettes"].items():
        b = s["boundary_mm"]; v = V["silhouettes"][k]; L.append(f"| {s['view']} | {s['datum']} | {s['px_per_mm']} | {s['iou']} | {b['median']} / {b['p90']} / {b['max']} | {s['model_only_px']} | {s['ours_only_px']} | {fmt(s['model_extent'])} | {fmt(s['ours_extent'])} | **{v['verdict']}** {v['why'] if v['verdict']=='RED' else ''} | `{os.path.basename(s['png'])}` |")
    for k, s in R["zooms"].items():
        b = s["boundary_mm"]; v = V["silhouettes"]["zoom_" + k]; L.append(f"| zoom {k} ({s['anchor']}) | raw | {s['px_per_mm']} | {s['iou']} | {b['median']} / {b['p90']} / {b['max']} | {s['model_only_px']} | {s['ours_only_px']} | {fmt(s['model_extent'])} | {fmt(s['ours_extent'])} | **{v['verdict']}** {v['why'] if v['verdict']=='RED' else ''} | `{os.path.basename(s['png'])}` |")
    L.append("\n## 3. Sections at the named stations (raw, local frames)\n")
    L.append("r9b C2: the section verdict is the section→SURFACE distance (declaration v2b iv). The 2D two-way median / p90 is kept as a printed INFO column beside it — not dropped — so the sections stay an independent read of the same station: where the two disagree (S5b 2D p90 12.2 vs s2s 1.48; S3b 2.03 vs 1.63) the gap is the plan-cut slide the declaration describes, and the reader can see it.\n")
    L.append("| station | element | plane | window | model segs / chains | ours segs / chains | Hausdorff [mm] (INFO) | section→surface med / p90 (JUDGED) · 2D two-way med / p90 (INFO, r9b C2) | Fréchet (longest chains) [mm] (INFO) | verdict | png |\n|---|---|---|---|---|---|---|---|---|---|---|")
    for k, s in R["sections"].items():
        v = V["sections"][k]; hd = s["hausdorff_detail"] or {}
        L.append(f"| {k} | {s['element']} | {s['plane']} | {s['window']} | {s['model_segments']} / {s['model_chains']} | {s['ours_segments']} / {s['ours_chains']} | {s['hausdorff_mm']} | {s.get('s2s_median_mm')} / {s.get('s2s_p90_mm')} · 2D {s.get('twoway_median_mm')} / {s.get('twoway_p90_mm')} | {s['frechet_longest_chain_mm']} | **{v['verdict']}** {v['why'] if v['verdict']=='RED' else ''} | `{os.path.basename(s['png'])}` |")
    L.append("\n## 4. Per-element point-to-surface deviation (both ways, inside the window)\n")
    L.append("| element | datum | model tris / ours tris | area model / ours [dm²] | ours→model med / p90 / max [mm] | model→ours med / p90 / max [mm] | ≤1 mm o / m | ≤3 mm o / m | threshold med / p90 | verdict | heatmap |\n|---|---|---|---|---|---|---|---|---|---|---|")
    for k, d in R["deviation"].items():
        o, m = d["ours_to_model"], d["model_to_ours"]; v = V["elements"][k]; thr = THR.get(k, {})
        L.append(f"| {k} | {d['datum']} | {d['model_tris']} / {d['ours_tris']} | {d['model_area_mm2']/1e4:.1f} / {d['ours_area_mm2']/1e4:.1f} | {o['median']} / {o['p90']} / {o['max']} | {m['median']} / {m['p90']} / {m['max']} | {d.get('frac_ours_within_1mm')} / {d.get('frac_model_within_1mm')} | {d.get('frac_ours_within_3mm')} / {d.get('frac_model_within_3mm')} | {thr.get('median')} / {thr.get('p90')} | **{v['verdict']}** {v['why'] if v['verdict']=='RED' else ''} | `{os.path.basename(d['png'])}` |")
        offs = [o for o in d.get("offenders", []) if o["over_thr"] > 0][:4]
        if offs and v["verdict"] == "RED":
            L.append("|  ↳ offenders (diagnostic, our meshes by samples > 3 mm) | " + "; ".join(f"`{o['mesh']}` {o['over_thr']}/{o['n']} med {o['median']} p90 {o['p90']} max {o['max']}" for o in offs) + " | | | | | | | | | |")
    L.append("\n## 5. Dimension Δ table (every JSON row the scene consumes)\n")
    L.append(f"Ours selection: {R['dims']['ours_selection']}. Extra rows with an `a2` block / `RC-` ids found in the JSON: {R['dims']['extra_rows_found'] or 'none (rows not yet present)'}.\n")
    L.append("| row | name | scope / tier | datum | spec | ours | model raw | model EN-07 | Δ ours−spec | Δ ours−model raw | tolerance (class) | status | rule (ours) |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for r in R["dims"]["rows"]:
        if not r.get("present"): L.append(f"| {r['id']} | — | — | — | — | — | — | — | — | — | — | {r['status']} | — |"); continue
        L.append(f"| {r['id']} | {r['name'][:60]} | {r['scope']} / {r['tier']} | {r['datum']} | {fmt(r['spec'])} | {fmt(r['ours'])} | {fmt(r['model_raw'])} | {fmt(r['model_scaled'])} | {fmt(r['delta_spec'])} | {fmt(r['delta_model_raw'])} | {fmt(r['tolerance'])} ({r['tol_class']}) | **{r['status']}** | {r['rule_ours']} |")
    L.append("\n## 6. Gate thresholds and their justification (stated from the soup's own noise, ruling A2-4)\n")
    L.append(f"Noise measured this run/cached ({NZ.get('measured_at')}, cache `{thresholds.NOISE_CACHE}`):\n")
    L.append("| station | facet kink deviation n / median / p90 / max [mm] |\n|---|---|")
    for k, v in NZ["facet_kink"].items(): L.append(f"| {k} | {v['n']} / {v['median']} / {v['p90']} / {v['max']} |")
    L.append("\n| mirror | whole soup med / p90 / max | above bed | corner windows | side windows | pedestal z<640 |\n|---|---|---|---|---|---|")
    for k, v in NZ["mirror"].items():
        L.append(f"| {k} | {v['median']} / {v['p90']} / {v['max']} | {v['above_bed']['median']} / {v['above_bed']['p90']} / {v['above_bed']['max']} | {v['corner_windows_above_bed']['median']} / {v['corner_windows_above_bed']['p90']} / {v['corner_windows_above_bed']['max']} | {v['side_windows_above_bed']['median']} / {v['side_windows_above_bed']['p90']} / {v['side_windows_above_bed']['max']} | {v['pedestal_z_lt_640']['median']} / {v['pedestal_z_lt_640']['p90']} / {v['pedestal_z_lt_640']['max']} |")
    L.append("\nQuoted A1/r6 fit residuals (canonical JSON rows, re-read at run time):\n\n| row | present | rms | max | what |\n|---|---|---|---|---|")
    for q in thresholds.quoted_rows(): L.append(f"| {q['row']} | {q['present']} | {q['rms']} | {q['max']} | {q['what']} |")
    L.append(f"\nAlso: doc.model_asymmetry_note {thresholds.ASYMMETRY_NOTE} mm (−Y short-rail bodies end-asymmetric); EN-05 underside camber {thresholds.CAMBER[0]}–{thresholds.CAMBER[1]} mm. Plan 4a.6 start point: median ≤ 1.0 / p90 ≤ 3.0 where the model is the reference; silhouette boundary median ≤ 1.5; dimension deltas within their row tolerance. Adjustment rule: median threshold = max(1.0, 2 × the element's noise floor (facet kink p90 ⊕ fit rms ⊕ half the asymmetry, RSS)); p90 = 3 × median; Hausdorff (a max) = max(5.0, 1.7 × p90); the underside band takes the camber.\n")
    L.append("| element | median ≤ | p90 ≤ | Hausdorff ≤ | boundary median ≤ | justification |\n|---|---|---|---|---|---|")
    for k, t in THR.items():
        if k == "dims": L.append(f"| dims | — | — | — | — | kernel rows {t['kernel_mm']} mm; render-only {t['render_rule']}; photo {t['photo_rule']} |"); continue
        L.append(f"| {k} | {t.get('median','—')} | {t.get('p90','—')} | {t.get('hausdorff','—')} | {t.get('boundary','—')}{(' (IoU ≥ %s)' % t['iou_min']) if 'iou_min' in t else ''} | {t['why']} |")
    L.append("\n## 7. Verdicts\n")
    L.append("| element | datum | verdict | reason |\n|---|---|---|---|")
    for k, v in V["elements"].items(): L.append(f"| {k} | {v['datum']} | **{v['verdict']}** | {v['why']} |")
    c = V["counts"]
    L.append(f"\nCounts (r9b C3: RED out of the JUDGED rows; INFO rows are printed separately and are NOT passes) — elements RED {c['elements_red']}/{c['elements_judged']} judged (+{c['elements_info']} INFO, {c['elements']} rows); "
             f"sections RED {c['sections_red']}/{c['sections_judged']} judged (+{c['sections_info']} INFO, {c['sections']} rows); "
             f"silhouettes RED {c['silhouettes_red']}/{c['silhouettes_judged']} judged (+{c['silhouettes_info']} INFO, {c['silhouettes']} rows); "
             f"Δ rows RED {c['dims_red']}/{c['dims_judged']} judged (+{c['dims_info']} INFO, {c['dims']} rows). "
             f"The cup-placement Δ rows in §1 are OPEN (owner ruling, card 21b) and are not counted anywhere.\n")
    L.append(f"### OVERALL: **{V['overall']}**\n")
    if V["red_list"]:
        L.append("RED list (station + number):\n"); L.extend(f"- {x}" for x in V["red_list"]); L.append("")
    if rr is not None:
        L.append(f"## 8. Red arm (ruling A2-4)\n\nElement `{rr['element']}` (meshes {rr['meshes_shifted']}) shifted by {rr['shift_mm']} mm: verdict {rr['verdict_before']} → **{rr['verdict_after']}** ({rr['why_after']}); metrics (o→m med, o→m p90, m→o med, m→o p90) {rr['metrics_before']} → {rr['metrics_after']} (Δ {rr['metric_deltas']}); sections after: {rr['sections_after']}. Rule: {rr['rule']}. **Red arm {'PASS' if rr['PASS'] else 'FAIL'}.**\n")
        for arm in rr.get('reference_arms', []):
            L.append(f"FIX2 reference arm: `{arm['result']}`; fired **{arm['armed']}**.\n")
    L.append("## 9. Runtime, quarantine, expected mesh names\n")
    L.append(f"Runtime {runtime:.0f} s ({'quick' if args.quick else 'full'} mode) on {platform.node()}; heavy elements run inside this process (background + log recommended for the full mode). Quarantine: the OBJ was read in place; the parsed arrays live only under /tmp (`{reg['model_checks'].get('cache')}`); this directory holds numbers, masks and plots only; section polylines saved are OURS only.\n")
    L.append("Mesh names the gate selects by prefix when present (else by window): `dm-bed-cloth`, `dm-bed-slab`, `dm-cushion-*`, `dm-railtop-*` / `dm-rail-cap-*`, `dm-subrail-*`, `dm-apron-*`, `dm-casting-corner-*`, `dm-casting-side-*`, `dm-cup-*`, `dm-liner-*`, `dm-sight-*`, `dm-pedestal-*`, `dm-pedestal-plate-*`, `dm-foot-plate-*`, `dm-beam-*`. Decal spots (`dm-spot-*`) are excluded.\n")
    open(os.path.join(out, "ALIGN-ROX.md"), "w").write("\n".join(L))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--ours", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--judge", action="store_true"); ap.add_argument("--redarm", action="store_true"); ap.add_argument("--quick", action="store_true")
    ap.add_argument("--redarm-element", default="cushion_long"); ap.add_argument("--elements", default=None)
    ap.add_argument("--reference", default=str(pocket_reference.DEFAULT))
    args = ap.parse_args(); out = args.out; os.makedirs(out, exist_ok=True); log = log_to(os.path.join(out, "gate.log")); t0 = time.time()
    log(f"[gate] start {time.strftime('%Y-%m-%d %H:%M:%S')} ours={args.ours} out={out} quick={args.quick}")
    try:
        dump = ours.Dump(args.ours, reference_path=args.reference)
    except pocket_reference.ReferenceRefused as exc:
        log(f"[gate] REFUSED {exc}"); sys.exit(4)
    NZ = thresholds.noise(log); THR = thresholds.table(NZ)
    log(f"[gate] dump {dump.summary()}")
    R = run_all(args, dump, out, log, args.quick, elements=args.elements.split(",") if args.elements else None); R["dump_summary"] = dump.summary()
    V = judge(R, THR)
    rr = redarm(args, out, log, args.quick, THR, R, V) if args.redarm else None
    runtime = time.time() - t0
    J = dict(tool="tools/render/ghrox/align", version="1.1.0-fix2-fixed-model", run=time.strftime("%Y-%m-%d %H:%M"), mode="quick" if args.quick else "full", runtime_s=round(runtime, 1), ours=args.ours, dump=R["dump_summary"],
             registration=R["registration"], silhouettes=R["silhouettes"], zooms=R["zooms"], sections=R["sections"], deviation=R["deviation"], dims=R["dims"],
             noise=NZ, thresholds=THR, verdicts=V, redarm=rr, windows=objsoup.WINDOWS, stations=[list(map(str, s)) for s in objsoup.STATIONS])
    json.dump(J, open(os.path.join(out, "align-rox.json"), "w"), indent=1, default=lambda o: o.tolist() if hasattr(o, "tolist") else str(o))
    write_report(args, R, V, THR, NZ, rr, runtime, out)
    log(f"[gate] OVERALL {V['overall']}  reds: elements {V['counts']['elements_red']}/{V['counts']['elements']} sections {V['counts']['sections_red']}/{V['counts']['sections']} silhouettes {V['counts']['silhouettes_red']}/{V['counts']['silhouettes']} dims {V['counts']['dims_red']}/{V['counts']['dims']}  redarm {None if rr is None else ('PASS' if rr['PASS'] else 'FAIL')}  {runtime:.0f}s -> {out}/ALIGN-ROX.md")
    if args.judge:
        if rr is not None and not rr["PASS"]: sys.exit(2)
        if V["overall"] == "RED": sys.exit(1)
    sys.exit(0)

if __name__ == "__main__":
    main()
