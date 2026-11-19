# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Render <out>/ALIGNMENT.md from report_body.md and the run's data files (port of Task C write_report.py; the tables are
generated the same way, the analysis-specific prose of ALIGNMENT-D621.md §5 G1-G7 is replaced by generated tables)."""
import datetime
import json
import os

import families
import paths


def f(x, k=1):
    if x is None: return "—"
    if isinstance(x, bool): return str(x)
    if isinstance(x, (int, float)): return f"{x:.{k}f}"
    return str(x)


def build(cfg, gate=None, ntop=10):
    D = cfg.out
    ld = lambda p: json.load(open(os.path.join(D, p)))
    reg = ld("data/registration.json"); dev = ld("data/deviation.json"); rows = ld("data/dims_rows.json"); ovi = ld("data/overlay_index.json")
    sec = ld("sections/index.json"); vw = ld("data/visual_weight.json"); vwa = ld("data/visual_weight_attributed.json")
    if gate is None and os.path.exists(os.path.join(D, "gate.json")): gate = ld("gate.json")
    # ---------- targets ----------
    if gate:
        tt = ["| target | value | op | threshold | today (analysis a39f14cd) | result |", "|---|---|---|---|---|---|"]
        for t in gate["targets"]:
            res = "not evaluated" if t.get("pass") is None else ("PASS" if t["pass"] else "FAIL")
            tt.append(f"| {t['label']} (`{t['key']}`) | {f(t['value'], 4 if t['key'].startswith('iou') else 2)} | {t['op']} | {t['threshold']} | {t.get('today', '—')} | **{res}** |")
        TARGETS = "\n".join(tt); VERDICT = gate["verdict"] + (f" ({gate['verdict_line']})" if gate.get("verdict_line") else "")
        inp = gate["inputs"]
        INPUTS = f"ours = `{inp['ours']}` ({inp.get('ours_meshes')} meshes, {inp.get('ours_tris')} tris, sha256 {inp.get('ours_sha256', '')[:16]}…; metres, Y-up; `{inp.get('kernel_console', '')}`). Model = `{inp['model_obj_dir']}/node_*.obj` ({inp.get('model_nodes')} nodes; base cages, modifiers not applied), measured/rasterised/sectioned into `model/` at run time."
    else:
        TARGETS = "(no gate.json — run align_gate_621.py for the target evaluation)"; VERDICT = "n/a"; INPUTS = f"ours = `{cfg.ours}`; model = `{cfg.model_obj_dir}`"
    # ---------- law-adjusted silhouettes (0b) ----------
    law = (gate or {}).get("law_adjusted")
    if law:
        c = law["config"]
        lt = [f"Deltas (`{c.get('file', '')}`; {c.get('note', '')}): legs inward {c['legs_dx_mm']:g} (x) / {c['legs_dy_mm']:g} (y) mm, cabinet bottom extended down {c['cabinet_bottom_dz_mm']:g} mm, envelope outward {c['envelope_dx_mm']:g} (x) / {c['envelope_dy_mm']:g} (y) mm per side. "
              f"Ours cabinet bottom z = {law.get('ours_cabinet_bottom_z')} (floor + 381 = {law.get('floor_plus_381')}); fill window ±{law.get('cabinet_window_mm')} mm. "
              f"Families: legs = {law['families']['legs']}, cabinet = {law['families']['cabinet']}, envelope = {law['families']['envelope']}. Method: `law_adjust.py` docstring (pixel-space, whole-pixel shifts; raw rows are the §2 numbers).", "",
              "| view | px/mm | IoU raw | IoU law-adjusted | XOR raw | XOR law-adjusted | model-only raw → law | ours-only raw → law | adjustments applied | overlay |", "|---|---|---|---|---|---|---|---|---|---|"]
        for r in law["rows"]:
            lt.append(f"| {r['view']} | {r['px_per_mm']:g} | {r['iou_raw']:.4f} | **{r['iou_law']:.4f}** | {r['xor_raw']} | {r['xor_law']} | {r['raw']['model_only_px']} → {r['law']['model_only_px']} | {r['raw']['ours_only_px']} → {r['law']['ours_only_px']} | {'; '.join(r['applied']) or '—'} | `{os.path.relpath(r['file'], D)}` |")
        LAWTAB = "\n".join(lt)
    else:
        LAWTAB = "(not run — pass `--law-adjust [JSON]` to the gate; default deltas in `tools/render/d621/align/law_adjust_d621.json`)"
    lf = dev.get(families.LEGS_FORM_KEY)
    if lf and lf.get("centroid_shifts"):
        LAWTAB += "\n\nCentroid-aligned legs (`" + families.LEGS_FORM_KEY + "`, §3): " + "; ".join(f"`{n}` → `{s['model_node']}` shift ({s['shift_xy'][0]:+.1f}, {s['shift_xy'][1]:+.1f}) mm (members {', '.join(s['members'])})" for n, s in lf["centroid_shifts"].items()) + "."
    # ---------- registration ----------
    r = reg["residuals"]
    REGTAB = "\n".join(["| datum | ours (after transform) | model | Δ |", "|---|---|---|---|",
        f"| bed top plane z | {r['bed_top_z']['ours']} (spread {r['bed_top_z']['ours_spread']} over {r['bed_top_z'].get('ours_n', '?')} verts) | {r['bed_top_z']['model']} ({r['bed_top_z'].get('model_n', '?')} verts) | **{r['bed_top_z']['delta']}** |",
        f"| plan centre — rail-top / apron / legs / bed top face | {r['plan_centre_railtop']['ours']} / {r['plan_centre_apron']['ours']} / {r['plan_centre_legs']['ours']} / {r['plan_centre_bed_top_face']['ours']} | {r['plan_centre_railtop']['model']} | {r['plan_centre_railtop']['delta']} / {r['plan_centre_apron']['delta']} / {r['plan_centre_legs']['delta']} / {r['plan_centre_bed_top_face']['delta']} |",
        f"| long axis | {r['long_axis']['ours']} | {r['long_axis']['model']} | — |",
        f"| ours symmetry check | rail-top abs x {r['ours_symmetry']['railtop_abs_x']}, abs y {r['ours_symmetry']['railtop_abs_y']} | — | |",
        f"| rail-top plane z | {r['rail_top_plane_z']['ours']} | {r['rail_top_plane_z']['model']} | **{r['rail_top_plane_z']['delta']:+.2f}** ({r['rail_top_plane_z']['note']}) |",
        f"| envelope rail-top (x × y) | {r['envelope_railtop']['ours'][0]} × {r['envelope_railtop']['ours'][1]} | {r['envelope_railtop']['model'][0]} × {r['envelope_railtop']['model'][1]} | {r['envelope_railtop']['delta'][0]} × {r['envelope_railtop']['delta'][1]} ({r['envelope_railtop']['delta_pct'][0]} % / {r['envelope_railtop']['delta_pct'][1]} %) |",
        f"| envelope apron band | {r['envelope_apron_band']['ours'][0]} × {r['envelope_apron_band']['ours'][1]} | {r['envelope_apron_band']['model'][0]} × {r['envelope_apron_band']['model'][1]} | {r['envelope_apron_band']['delta'][0]} × {r['envelope_apron_band']['delta'][1]} |",
        f"| floor | leveler pad bottoms z = {r['floor_z']['ours_leveler_bottom']} (leg bottoms {r['floor_z']['ours_leg_bottom']}) | leg feet z = {r['floor_z']['model_leg_feet']} (scene zero 0.0) | **{r['floor_z']['delta_floor']:+.2f}** |"])
    # ---------- deviation table ----------
    devtab = ["| pair | model tris / ours tris | area model / ours [dm²] | ours→model  med / p90 / max [mm] | model→ours  med / p90 / max [mm] | ours verts→model med / p90 / max | ≤5 mm  o→m / m→o | >20 mm  o→m / m→o | heatmap |",
              "|---|---|---|---|---|---|---|---|---|"]
    for k, lab in families.DEVIATION_REPORT_ORDER:
        v = dev.get(k)
        if not v or v.get("skipped"): devtab.append(f"| {lab} | — | — | (skipped: no meshes on one side) | | | | | |"); continue
        o = v["ours_samples_to_model"]; m = v["model_samples_to_ours"]; vv = v["ours_vertices_to_model"]
        devtab.append(f"| {lab} | {v['model_tris']} / {v['ours_tris']} | {v['model_area_mm2'] / 1e4:.1f} / {v['ours_area_mm2'] / 1e4:.1f} | {o['median']} / {o['p90']} / {o['max']} | {m['median']} / {m['p90']} / {m['max']} | {vv['median']} / {vv['p90']} / {vv['max']} | {v['frac_ours_samples_within_5mm']:.2f} / {v['frac_model_samples_within_5mm']:.2f} | {v['frac_ours_samples_over_20mm']:.2f} / {v['frac_model_samples_over_20mm']:.2f} | `heatmaps/heat_{k}.png` |")
    DEVTAB = "\n".join(devtab)
    # ---------- overlay / sections ----------
    ov = ["| view | px/mm | window (h, v) [mm] | model px | ours px | overlap px | IoU | model-only px | ours-only px | model extent (h0..h1, v0..v1) | ours extent | file (raw / annotated) |", "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for rr in ovi:
        ov.append(f"| {rr['view']} | {rr['px_per_mm']:g} | {rr['window']['h']} , {rr['window']['v']} | {rr['model_px']} | {rr['ours_px']} | {rr['overlap_px']} | {rr['iou']:.4f} | {rr['model_px'] - rr['overlap_px']} | {rr['ours_px'] - rr['overlap_px']} | {rr.get('model_extent')} | {rr.get('ours_extent')} | `{os.path.relpath(rr['file'], D)}` / `{os.path.relpath(rr['annotated'], D)}` |")
    OVTAB = "\n".join(ov)
    sc = ["| station | plane | window (h, v) [mm] | model segs | ours segs | ours groups cut | overlay png | ours polyline |", "|---|---|---|---|---|---|---|---|"]
    for rr in sec:
        sc.append(f"| {rr['name']} | {rr['plane']} | {rr['window']['h']} , {rr['window']['v']} | {rr['model_segments']} | {rr['ours_segments']} | {', '.join(f'{k} {v}' for k, v in rr['ours_groups'].items()) or '(none)'} | `{os.path.relpath(rr['png'], D)}` | `{os.path.relpath(rr['ours_npy'], D)}` |")
    SECTAB = "\n".join(sc)
    # ---------- ranking ----------
    rk = ["| rank C | pair | Metric C: attributed visible XOR [mm²] (top / side / end) | Metric A: raw pair XOR over counted views [mm²] (rank) | Metric B: union area × sym. mean dev [cm³] (rank) | sym. mean dev [mm] | o→m med/p90/max | m→o med/p90/max |", "|---|---|---|---|---|---|---|---|"]
    A = {rr["key"]: rr for rr in vw["pairs"]}
    for key, v in sorted(vwa["pairs"].items(), key=lambda kv: kv[1]["rank_C"]):
        a = A[key]
        rk.append(f"| {v['rank_C']} | {key} | **{v['total_mm2']}** ({v['top']['attributed_px']} / {v['side']['attributed_px']} / {v['end']['attributed_px']}) | {a['xor_vis_mm2']} (#{a['rank_xor']}, views {','.join(a['counted_views'])}) | {a['AxD_cm3']:.0f} (#{a['rank_AxD']}) | {a['dev_sym_mean_mm']} | {' / '.join(map(str, a['dev_o2m_med_p90_max']))} | {' / '.join(map(str, a['dev_m2o_med_p90_max']))} |")
    RANKTAB = "\n".join(rk)
    W = vwa["views"]
    WHOLE = "\n".join(f"| {v} | {W[v]['assembly']} | {W[v]['model_px']} | {W[v]['ours_px']} | {W[v]['xor_px']} | {W[v]['model_only']} | {W[v]['ours_only']} | {W[v]['iou']:.4f} |" for v in ("top", "side", "end"))
    # ---------- dims ----------
    def row_md(rr):
        m = rr["model"]; o = rr["ours"]
        ms = f(m, 2) if isinstance(m, (int, float)) and not isinstance(m, bool) else ("—" if m is None else str(m)[:90].replace("|", "/"))
        osv = f(o, 2) if isinstance(o, (int, float)) and not isinstance(o, bool) else ("—" if o is None else str(o)[:90].replace("|", "/"))
        return f"| `{rr['key']}` | {ms} | {osv} | {f(rr['delta'], 2)} | {f(rr['delta_pct'], 1)} |"
    hdr = ["| key | model | ours | Δ (ours − model) [mm] | Δ % |", "|---|---|---|---|---|"]
    num = sorted([rr for rr in rows if rr["delta_pct"] is not None], key=lambda rr: -abs(rr["delta_pct"]))
    TOPDIMS = "\n".join(hdr + [row_md(rr) for rr in num[:ntop]])
    ap = list(hdr); skipped = 0
    for rr in rows:
        k = rr["key"]
        if k.startswith("12.leg_pp_cross_sections") and (".x[" in k or ".y[" in k):
            skipped += 1; continue
        ap.append(row_md(rr))
    APPENDIX = "\n".join(ap)
    # ---------- measurements vs committed ----------
    mc = (gate or {}).get("measurements_vs_committed")
    if mc:
        MEASCMP = f"Regenerated `model/measurements.json` ({mc['n_regenerated']} keys) vs the committed record `{mc['committed']}` ({mc['n_committed']} keys): **{mc['n_diff']} differing keys**." + ("" if not mc["diffs"] else "\n\n| key | regenerated | committed |\n|---|---|---|\n" + "\n".join(f"| `{d['key']}` | {str(d['regenerated'])[:120].replace('|', '/')} | {str(d['committed'])[:120].replace('|', '/')} |" for d in mc["diffs"]))
    else:
        MEASCMP = "(no comparison recorded)"
    T = open(os.path.join(paths.PKG_DIR, "report_body.md")).read()
    for k, v in dict(LABEL=cfg.label, DATE=datetime.date.today().isoformat(), RUN_ID=cfg.run_id, INPUTS=INPUTS, TARGETS=TARGETS, VERDICT=VERDICT, LAWTAB=LAWTAB, REGTAB=REGTAB, OVTAB=OVTAB, SECTAB=SECTAB, DEVTAB=DEVTAB,
                    NTOP=str(ntop), TOPDIMS=TOPDIMS, WHOLE=WHOLE, RANKTAB=RANKTAB, MEASCMP=MEASCMP, APPENDIX=APPENDIX, SKIPPED=str(skipped)).items():
        T = T.replace("{{" + k + "}}", v)
    return T


def run(cfg, gate=None, log=print):
    T = build(cfg, gate)
    p = os.path.join(cfg.out, "ALIGNMENT.md")
    open(p, "w").write(T)
    log(f"[write_report] {p}: {len(T)} bytes, {T.count(chr(10))} lines")
    return p


if __name__ == "__main__":
    cfg, _ = paths.from_args(description=__doc__)
    run(cfg)
