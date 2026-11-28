#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""D621 STANDING GATE: our Diamond Pro-Am 8 ft export vs the purchased 3dsky model, mesh-to-mesh.

Runs, in order: model measurements / silhouettes / sections (regenerated from the quarantine OBJ), registration, dims,
deviation (+extra pairs), overlays, section overlays, visual weight (A/B) and attribution (C), summary sheet; writes
<out>/ALIGNMENT.md + <out>/gate.json; evaluates the STANDING TARGETS below and prints one PASS/FAIL line per target and
an overall verdict. Exit 0 = all pass, 3 = any fail (2 = the run itself failed).

  python3 tools/render/d621/align/align_gate_621.py --ours /tmp/d621-align/ours/ours-8ft.json --out /tmp/d621-align/gate/<run-id>

QUARANTINE: <out> must be outside the repo; nothing derived from the model is written anywhere else."""
import sys
sys.dont_write_bytecode = True  # never leave .pyc next to the gate sources
import argparse
import datetime
import json
import os
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import paths                                   # noqa: E402
import common                                  # noqa: E402

# ---------------------------------------------------------------------------------------------------------------------
# STANDING TARGETS (owner law: mesh-to-mesh alignment with the purchased model). "today" = the a39f14cd analysis
# (ALIGNMENT-D621.md, 2026-09-02) the gate was ported from; override thresholds with --targets-json.
# src: ("overlay", view, field) | ("deviation", pair, direction, stat) | ("dims_abs_delta", dims key) | ("law_overlay", view, field)
# group "raw" = the 7 standing targets on the raw numbers; group "law" = evaluated on the LAW-ADJUSTED silhouettes
# (--law-adjust; law_adjust.py) and on the centroid-aligned legs decomposition (deviation.py). Law rows whose input was not
# produced (gate run without --law-adjust) are reported as "not evaluated" and excluded from the counts.
# ---------------------------------------------------------------------------------------------------------------------
TARGETS = [
    dict(key="iou_side",       label="whole-table silhouette IoU, side view",                       src=("overlay", "side", "iou"),                                         op=">=", threshold=0.97,  today="0.8735", group="raw", superseded_by=["iou_side_law"]),
    dict(key="iou_end",        label="whole-table silhouette IoU, end view",                        src=("overlay", "end", "iou"),                                          op=">=", threshold=0.97,  today="0.8288", group="raw", superseded_by=["iou_end_law"]),
    dict(key="abovebed_p90",   label="above-bed set ours→model p90 [mm]",                          src=("deviation", "abovebed__all", "ours_samples_to_model", "p90"),    op="<=", threshold=10.0,  today="16.58", group="raw"),
    dict(key="apron_median",   label="apron band + cabinet ↔ apron pair ours→model median [mm]",   src=("deviation", "apronband_cabinet__apron", "ours_samples_to_model", "median"), op="<=", threshold=5.0, today="59.74", group="raw", superseded_by=["apron_band_law", "apron_band_law_p90", "apron_band_law_max", "cabinet_walls_law", "cabinet_walls_law_p90", "cabinet_walls_law_max"]),
    dict(key="legs_median",    label="legs ↔ leg+leveler pair ours→model median [mm]",             src=("deviation", "legs__leg_leveler", "ours_samples_to_model", "median"), op="<=", threshold=5.0, today="24.14", group="raw", superseded_by=["legs_median_form", "legs_form_p90", "legs_form_max"]),
    dict(key="corner_skirt",   label="corner boot skirt below bed |Δ| vs model [mm] (model 14.2)", src=("dims_abs_delta", "8.corner_boot_skirt_below_bed"),                op="<=", threshold=3.0,   today="121.6 (ours 135.8)", group="raw"),
    dict(key="side_skirt",     label="side boot skirt below bed |Δ| vs model [mm] (model 14.2)",   src=("dims_abs_delta", "9.side_boot_skirt_below_bed"),                  op="<=", threshold=3.0,   today="121.6 (ours 135.8)", group="raw"),
    dict(key="iou_side_law",   label="whole-table silhouette IoU, side view, LAW-ADJUSTED ours (legs in, cabinet bottom down, envelope out)", src=("law_overlay", "side", "iou_law"), op=">=", threshold=0.97, today="— (new 2026-09-02)", group="law"),
    dict(key="iou_end_law",    label="whole-table silhouette IoU, end view, LAW-ADJUSTED ours (legs in, cabinet bottom down, envelope out)",  src=("law_overlay", "end", "iou_law"),  op=">=", threshold=0.97, today="— (new 2026-09-02)", group="law"),
    dict(key="legs_median_form", label="legs ↔ leg+leveler, centroid-aligned (form only) ours→model median [mm]", src=("deviation", "legs__leg_leveler_centroid_aligned", "ours_samples_to_model", "median"), op="<=", threshold=5.0, today="— (new 2026-09-02)", group="law"),
    dict(key="apron_band_law",  label="apron band ↔ kant_side band, LAW-ADJUSTED ours (envelope out) ours→model median [mm]", src=("deviation", "apronband__rail_side_law", "ours_samples_to_model", "median"), op="<=", threshold=5.0, today="— (new 2026-09-03)", group="law"),
    dict(key="cabinet_walls_law", label="cabinet walls ↔ cabinet walls (bottom board out: EN-06 15 in vs the model's 360) ours→model median [mm]", src=("deviation", "cabinet_walls__cabinet_walls_law", "ours_samples_to_model", "median"), op="<=", threshold=5.0, today="— (new 2026-09-03)", group="law"),
    # C1 (D621-ALIGN-2, ratified): every law deviation row also prints AND gates its p90 (≤ 10) and max (≤ 25 mm) — a median
    # alone is not a proof of form (the ALIGN seal's cabinet_walls_law passed at 0.04 while p90 23 / max 48 hid an inverted lean)
    dict(key="legs_form_p90",     label="legs form (centroid-aligned) ours→model p90 [mm]",            src=("deviation", "legs__leg_leveler_centroid_aligned", "ours_samples_to_model", "p90"), op="<=", threshold=10.0, today="— (C1)", group="law"),
    dict(key="legs_form_max",     label="legs form (centroid-aligned) ours→model max [mm]",            src=("deviation", "legs__leg_leveler_centroid_aligned", "ours_samples_to_model", "max"), op="<=", threshold=25.0, today="— (C1)", group="law"),
    dict(key="apron_band_law_p90", label="apron band LAW-ADJUSTED ours→model p90 [mm]",                src=("deviation", "apronband__rail_side_law", "ours_samples_to_model", "p90"), op="<=", threshold=10.0, today="— (C1)", group="law"),
    dict(key="apron_band_law_max", label="apron band LAW-ADJUSTED ours→model max [mm]",                src=("deviation", "apronband__rail_side_law", "ours_samples_to_model", "max"), op="<=", threshold=25.0, today="— (C1)", group="law"),
    dict(key="cabinet_walls_law_p90", label="cabinet walls LAW-ADJUSTED ours→model p90 [mm]",          src=("deviation", "cabinet_walls__cabinet_walls_law", "ours_samples_to_model", "p90"), op="<=", threshold=10.0, today="— (C1; ALIGN seal 23.05)", group="law"),
    dict(key="cabinet_walls_law_max", label="cabinet walls LAW-ADJUSTED ours→model max [mm]",          src=("deviation", "cabinet_walls__cabinet_walls_law", "ours_samples_to_model", "max"), op="<=", threshold=25.0, today="— (C1; ALIGN seal 48.27)", group="law"),
]
COMMITTED_MEASUREMENTS = os.path.join(paths.REPO_ROOT, "docs", "geometry", "diamond-proam-8ft-purchased-model-measurements.json")


# D621-PLAN-3-RECORD-4 — THE CARD IS BUILT FROM GIT ARCHIVES ONLY. The card mode is not a CLI flag of this file: it is
# reached in-process from tools/render/d621/card/card_621.py, which itself executes FROM `git archive <commit>` (the wrapper
# build_card_pack_621.sh takes ONE argument, a commit id, and nothing else). In that mode the standing targets cannot be replaced,
# the law-adjust deltas are the archive's committed file, nothing is evaluate-only (every RAW / LAW / PLAN / IDENTITY number is
# recomputed in the run), the PLAN rows are re-measured against the archive's committed law, the HEAD and BASE material-identity
# captures are made by the run (HEAD = the archive's web tree, BASE = `git archive main`), and the card figures are drawn from
# the in-memory result only when the whole gate reads PASS. Provenance = the two commit ids and tree hashes plus the sha256 of
# every file the run read from the archive (laws, manifest, definition JSON, law-adjust) and a GENERATED list of every module
# that executed (python modules by sys.modules, node tools by invocation) with their archive shas — no hand-maintained allowlist.
# A lane editing tracked files shows in the diff of the audited commit; that is the reviewer's, not this gate's, job.
def table_declared(table_js_text, table_id):
    """Is `table_id` a TABLE_SPECS entry in this table.js text? (`id: {` / `'id': {` / `"id": {`, a derived-entry call naming it,
    or an alias assignment to a declared entry: a line-start `TABLE_SPECS.<id> = TABLE_SPECS.<target>;` whose target is declared
    by the first two forms in the same text, one hop only.)"""
    import re as _re

    def literal(tid):
        return bool(_re.search(r"""(?m)^\s*['"]?""" + _re.escape(tid) + r"""['"]?\s*:\s*\{""", table_js_text)
                    or _re.search(r"""['"]""" + _re.escape(tid) + r"""['"]\s*[,)\]]""", table_js_text))
    if literal(table_id):
        return True
    alias = _re.compile(r"(?m)^TABLE_SPECS\." + _re.escape(table_id) + r" = TABLE_SPECS\.([A-Za-z0-9_]+);")
    return any(literal(m.group(1)) for m in alias.finditer(table_js_text))


def identity_provenance_reasons(cap_h, cap_b, prov, id_law):
    """The BASE / HEAD capture provenance checks of the card run (also exercised by tools/render/d621/law/arms_621.py):
    both captures carry the committed capture schema and a clean texture census; the BASE capture's served tree digest is
    `git show main:web/scene/table.js`; the HEAD capture's is HEAD's committed table.js; and BASE is not the HEAD tree."""
    reasons = []
    for c, tag in ((cap_h, "head"), (cap_b, "base")):
        if c.get("schema") != id_law["capture_schema"]: reasons.append(f"{tag} capture schema {c.get('schema')!r}")
        cen = c.get("tex_census") or {}
        if cen.get("tainted", 0) != id_law["texture_census"]["tainted_must_be"]: reasons.append(f"{tag} texture census tainted {cen.get('tainted')}")
    if cap_b.get("web_table_js_sha256") != prov.get("main_table_js_sha256"):
        reasons.append(f"BASE capture tree {str(cap_b.get('web_table_js_sha256'))[:12]} ≠ git main table.js {str(prov.get('main_table_js_sha256'))[:12]}")
    if cap_h.get("web_table_js_sha256") != prov.get("head_archive_table_js_sha256", prov.get("head_commit_table_js_sha256")):
        reasons.append(f"HEAD capture tree {str(cap_h.get('web_table_js_sha256'))[:12]} ≠ the archive's table.js")
    if cap_b.get("web_dir") == cap_h.get("web_dir") or cap_b.get("web_table_js_sha256") == cap_h.get("web_table_js_sha256"):
        reasons.append("BASE capture is the HEAD tree (same web_dir / same table.js digest) — a HEAD-as-BASE comparison is refused")
    return reasons



def lookup(src, data):
    kind = src[0]
    try:
        if kind == "overlay":
            return next(r[src[2]] for r in data["overlay_index"] if r["view"] == src[1])
        if kind == "deviation":
            return data["deviation"][src[1]][src[2]][src[3]]
        if kind == "dims_abs_delta":
            r = next(r for r in data["dims_rows"] if r["key"] == src[1])
            return None if r["delta"] is None else abs(r["delta"])
        if kind == "law_overlay":
            law = data.get("law_adjusted")
            if not law: return None
            return next(r[src[2]] for r in law["rows"] if r["view"] == src[1])
    except (StopIteration, KeyError, TypeError):
        return None
    raise ValueError(f"unknown target source {src}")


def evaluate(targets, data):
    """Sets value/pass per target. Law-overlay targets without a law_adjusted block are marked pass=None ("not evaluated")
    and do not count; every other missing value is a FAIL (unchanged behaviour)."""
    ok_all = True
    for t in targets:
        v = lookup(t["src"], data); t["value"] = v
        if v is None and t["src"][0] == "law_overlay" and not data.get("law_adjusted"):
            t["pass"] = None; t["reason"] = "not evaluated (run with --law-adjust)"; continue
        if v is None and t.get("group") == "law" and t["src"][0] == "deviation":
            # a law deviation twin whose pair was not built (no --law-adjust, or the tree has none of the ours meshes — the
            # a39f14cd red arm has no apron band / cabinet): not evaluated, never a silent pass
            t["pass"] = None; t["reason"] = "not evaluated (law pair absent on this run)"; continue
        if v is None: t["pass"] = False; t["reason"] = "value missing"
        else:
            t["pass"] = (v >= t["threshold"]) if t["op"] == ">=" else (v <= t["threshold"])
    # VERDICT (D621-ALIGN seal): a raw row that a law twin supersedes (the MFR-decided deltas — EN-05 feet datum, EN-06 15 in,
    # EN-01 envelope — are law, not error) is reported but does not decide; its twins must all be evaluated AND pass. Raw rows
    # without a twin (above-bed p90, the skirts) decide on their own. A law twin that was not evaluated leaves the raw row deciding.
    by_key = {t["key"]: t for t in targets}
    for t in targets:
        twins = [by_key[k] for k in t.get("superseded_by", []) if k in by_key]
        decided_by_twins = bool(twins) and all(w["pass"] is not None for w in twins)
        t["decides"] = not decided_by_twins if t.get("group") == "raw" else (t["pass"] is not None)
        if t["pass"] is None: continue
        if t["decides"]: ok_all &= t["pass"]
    return ok_all


def group_counts(targets):
    """{group: [passed, evaluated, not_evaluated]} for raw / law / plan / all."""
    out = {}
    for g in ("raw", "law", "plan", "identity", "cushion", "all"):
        ts = [t for t in targets if g == "all" or t.get("group", "raw") == g]
        out[g] = [sum(1 for t in ts if t["pass"] is True), sum(1 for t in ts if t["pass"] is not None), sum(1 for t in ts if t["pass"] is None)]
    return out


def verdict_line(counts):
    c = counts; ne = f" ({c['law'][2]} not evaluated)" if c["law"][2] else ""
    plan = f", PLAN {c['plan'][0]}/{c['plan'][1]}" if c.get("plan") and c["plan"][1] else ""
    ident = f", IDENTITY {c['identity'][0]}/{c['identity'][1]}" if c.get("identity") and c["identity"][1] else ""
    cushion = f", CUSHION {c['cushion'][0]}/{c['cushion'][1]}" if c.get("cushion") and c["cushion"][1] else ""
    return f"RAW {c['raw'][0]}/{c['raw'][1]}, LAW-ADJUSTED {c['law'][0]}/{c['law'][1]}{ne}{plan}{ident}{cushion}, ALL {c['all'][0]}/{c['all'][1]}"


def print_law_table(law):
    print(f"\n== LAW-ADJUSTED SILHOUETTES ({law['config'].get('file', '')}; deltas legs {law['config']['legs_dx_mm']:g}/{law['config']['legs_dy_mm']:g}, cabinet bottom {law['config']['cabinet_bottom_dz_mm']:g}, envelope {law['config']['envelope_dx_mm']:g}/{law['config']['envelope_dy_mm']:g} mm; ours cabinet bottom z {law.get('ours_cabinet_bottom_z')}, floor+381 = {law.get('floor_plus_381')})")
    print(f"  {'view':24s} {'IoU raw':>8s} {'IoU law':>8s} {'XOR raw':>8s} {'XOR law':>8s} {'m-only raw':>10s} {'m-only law':>10s} {'o-only raw':>10s} {'o-only law':>10s}  applied")
    for r in law["rows"]:
        print(f"  {r['view']:24s} {r['iou_raw']:>8.4f} {r['iou_law']:>8.4f} {r['xor_raw']:>8d} {r['xor_law']:>8d} {r['raw']['model_only_px']:>10d} {r['law']['model_only_px']:>10d} {r['raw']['ours_only_px']:>10d} {r['law']['ours_only_px']:>10d}  {'; '.join(r['applied']) or '-'}")


def print_tables(data, ntop=10):
    print("\n== top %d dims rows by |delta %%| (model | ours | delta | delta %%)" % ntop)
    num = sorted([r for r in data["dims_rows"] if r["delta_pct"] is not None], key=lambda r: -abs(r["delta_pct"]))
    for r in num[:ntop]:
        print(f"  {r['key']:48s} {str(r['model']):>10s} {str(r['ours']):>10s} {r['delta']:>9} {r['delta_pct']:>8}")
    print("\n== per-pair deviation (ALIGNMENT §3): pair | o->m med/p90/max | m->o med/p90/max | verts->model med/p90/max | <=5mm o/m | >20mm o/m")
    import families
    for k, lab in families.DEVIATION_REPORT_ORDER:
        v = data["deviation"].get(k)
        if not v or v.get("skipped"): print(f"  {k:46s} skipped"); continue
        o = v["ours_samples_to_model"]; m = v["model_samples_to_ours"]; vv = v["ours_vertices_to_model"]
        print(f"  {k:46s} {o['median']:>7}/{o['p90']:>7}/{o['max']:>7} | {m['median']:>7}/{m['p90']:>7}/{m['max']:>7} | {vv['median']:>7}/{vv['p90']:>7}/{vv['max']:>7} | {v['frac_ours_samples_within_5mm']:.2f}/{v['frac_model_samples_within_5mm']:.2f} | {v['frac_ours_samples_over_20mm']:.2f}/{v['frac_model_samples_over_20mm']:.2f}")
    lf = data["deviation"].get(families.LEGS_FORM_KEY)
    if lf and lf.get("centroid_shifts"):
        print("  centroid-aligned legs: " + "; ".join(f"{n} -> {s['model_node']} shift ({s['shift_xy'][0]:+.1f}, {s['shift_xy'][1]:+.1f}) mm" for n, s in lf["centroid_shifts"].items()))


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    paths.add_args(p)
    p.add_argument("--no-heatmaps", action="store_true", help="skip the heat-map PNGs (numbers unaffected; saves ~1/3 of the run time)")
    p.add_argument("--evaluate-only", action="store_true", help="do not recompute; evaluate the targets from an existing --out")
    p.add_argument("--committed-measurements", default=COMMITTED_MEASUREMENTS)
    p.add_argument("--law-adjust", action="store_true",
                   help="also build LAW-ADJUSTED ours silhouettes (MFR-decided deltas removed; law_adjust.py) with the COMMITTED deltas "
                        "tools/render/d621/align/law_adjust_d621.json and evaluate the *_law targets (D621-PLAN-3-RECORD-4: no other file can be named)")
    a = p.parse_args(argv)
    cfg = paths.Config(a.model_obj_dir, a.ours, a.out, a.label); cfg.assert_out_outside_repo(); cfg.ensure_dirs()
    return run_gate(cfg, law_adjust_on=a.law_adjust, evaluate_only=a.evaluate_only, no_heatmaps=a.no_heatmaps,
                    committed_measurements=a.committed_measurements, card=None)


def run_gate(cfg, *, law_adjust_on, evaluate_only, no_heatmaps, committed_measurements, card):
    """The gate. `card` (a dict, only ever built by tools/render/d621/card/card_621.py running from a git archive) = dict(head_web,
    base_web, provenance, card_out, prev) — then nothing is evaluate-only, the standing targets and the committed law-adjust deltas
    are used, the PLAN rows are re-measured, both identity captures are made here, and the figures are drawn only on PASS."""
    import law_adjust
    if card is not None:
        if evaluate_only: raise SystemExit("card mode never evaluates a stored run")
        law_adjust_on = True
    law_cfg = law_adjust.load(None) if law_adjust_on else None   # the committed deltas file, never another
    cfg.law_cfg = law_cfg  # deviation.py builds the LAW split pairs from it (families.LAW_SPLIT_PAIRS)
    class _A: pass
    a = _A(); a.evaluate_only = evaluate_only; a.no_heatmaps = no_heatmaps; a.committed_measurements = committed_measurements; a.label = cfg.label
    a.ours = cfg.ours; a.card_run = card is not None; a.card_out = (card or {}).get("card_out"); a.prev = (card or {}).get("prev")
    targets = [dict(t) for t in TARGETS]
    t_start = time.time(); timings = {}
    print(f"[gate] D621 alignment gate  run {cfg.run_id}  label {cfg.label}\n[gate] ours  {cfg.ours}\n[gate] model {cfg.model_obj_dir}\n[gate] out   {cfg.out}", flush=True)
    gate = dict(gate="D621-ALIGN", run_id=cfg.run_id, label=cfg.label, date=datetime.datetime.now().isoformat(timespec="seconds"), config=cfg.to_dict(), inputs=dict(ours=cfg.ours, model_obj_dir=cfg.model_obj_dir))
    prev = os.path.join(cfg.out, "gate.json")
    if a.evaluate_only and os.path.exists(prev):
        # keep the recorded run (inputs, timings, measurement diff, label); only the target evaluation is redone
        gate = json.load(open(prev)); gate["evaluated_at"] = datetime.datetime.now().isoformat(timespec="seconds")
        cfg.label = a.label or gate.get("label", cfg.label); timings = gate.get("timings", {})
        if law_cfg is not None:   # quick re-eval: only the law stage is recomputed (needs the meshes for the zoom rasters)
            if not a.ours and gate.get("inputs", {}).get("ours"): cfg.ours = gate["inputs"]["ours"]
            nodes, MG = common.load_model(cfg.model_obj_dir); d, ours = common.load_ours(cfg.ours); OG = common.ours_groups(ours)
            t = time.time(); print("[gate] -- law_adjust (evaluate-only recompute)", flush=True)
            gate["law_adjusted"] = law_adjust.run(cfg, ours, OG, nodes, MG, law_cfg); timings["law_adjust"] = round(time.time() - t, 1)
    if not a.evaluate_only:
        import measure_model, silhouettes_model, sections_model, register, dims, deviation, overlays, sections_overlay, visual_weight, visual_weight2, summary_sheet
        def stage(name, fn):
            t = time.time(); print(f"[gate] -- {name}", flush=True); r = fn(); timings[name] = round(time.time() - t, 1); print(f"[gate]    {name} {timings[name]} s", flush=True); return r
        t = time.time()
        nodes, MG = common.load_model(cfg.model_obj_dir)
        d, ours = common.load_ours(cfg.ours); OG = common.ours_groups(ours)
        timings["load"] = round(time.time() - t, 1)
        gate["inputs"].update(ours_sha256=cfg.ours_sha256(), ours_meshes=len(ours), ours_tris=int(sum(len(m["F"]) for m in ours.values())), kernel_console=d.get("kernel_console"), ours_table=d.get("table"),
                              model_nodes=len(nodes), model_groups={k: len(v) for k, v in MG.items()}, ours_families={k: len(v) for k, v in OG.items()})
        unknown = OG.get("unknown", [])
        if unknown: print(f"[gate] WARNING {len(unknown)} ours meshes in family 'unknown' (add rules to families.py): {unknown[:12]}")
        print(f"[gate] ours families: {gate['inputs']['ours_families']}")
        M = stage("measure_model", lambda: measure_model.run(cfg, nodes, MG))
        if os.path.exists(a.committed_measurements):
            committed = json.load(open(a.committed_measurements)); diffs = measure_model.compare(M, committed)
            gate["measurements_vs_committed"] = dict(committed=a.committed_measurements, n_regenerated=len(M) - 1, n_committed=len([k for k in committed if k != "_header"]), n_diff=len(diffs), diffs=diffs[:40])
            print(f"[gate] model measurements vs committed record: {len(diffs)} differing keys" + (f": {[d['key'] for d in diffs][:12]}" if diffs else ""))
        stage("silhouettes_model", lambda: silhouettes_model.run(cfg, nodes, MG, log=lambda *x: None))
        stage("sections_model", lambda: sections_model.run(cfg, nodes, MG, log=lambda *x: None))
        stage("register", lambda: register.run(cfg, ours, OG, nodes, MG))
        stage("dims", lambda: dims.run(cfg, ours, OG, nodes, MG))
        stage("deviation", lambda: deviation.run(cfg, ours, OG, nodes, MG, heatmaps=not a.no_heatmaps))
        stage("overlays", lambda: overlays.run(cfg, ours, OG, nodes, MG))
        if law_cfg is not None: gate["law_adjusted"] = stage("law_adjust", lambda: law_adjust.run(cfg, ours, OG, nodes, MG, law_cfg))
        stage("sections_overlay", lambda: sections_overlay.run(cfg, ours, OG, log=lambda *x: None))
        stage("visual_weight", lambda: visual_weight.run(cfg))
        stage("visual_weight2", lambda: visual_weight2.run(cfg, log=lambda *x: None))
        stage("summary_sheet", lambda: summary_sheet.run(cfg, title_note=f"{cfg.label}, {d.get('kernel_console', '')}"))
    ld = lambda rel: json.load(open(os.path.join(cfg.out, rel)))
    data = dict(overlay_index=ld("data/overlay_index.json"), deviation=ld("data/deviation.json"), dims_rows=ld("data/dims_rows.json"))
    if os.path.exists(os.path.join(cfg.out, "data", "law_adjusted.json")):
        data["law_adjusted"] = ld("data/law_adjusted.json"); gate["law_adjusted"] = data["law_adjusted"]
    ok = evaluate(targets, data)
    gate["card_run"] = bool(a.card_run)
    if a.card_run:
        import subprocess, hashlib as _h3, shutil
        REPO_ROOT = paths.REPO_ROOT          # = the git archive this process runs from (card_621.py asserts it)
        sha_bytes = lambda b: _h3.sha256(b).hexdigest()
        sha_file = lambda pth: sha_bytes(open(pth, "rb").read())
        def add_target(key, label, group, passed, reason=None, note=None, src=None):
            t = dict(key=key, label=label, src=src or (group, key, "all", "all"), op=">=", threshold=1, today="— (D621-PLAN-3-RECORD-4)", group=group,
                     value=1 if passed else 0, model=None, note=note, decides=True)
            t["pass"] = bool(passed)
            if not passed and reason: t["reason"] = reason
            targets.append(t); return t
        prov = dict(card["provenance"])   # head/main commit ids + tree hashes + the archive roots, from the driver (git archive)
        prov["law_adjust_sha256"] = sha_file(law_adjust.DEFAULT_JSON)
        head_web = card["head_web"]; base_web = card["base_web"]
        prov["head_served_web_dir"] = head_web; prov["base_served_web_dir"] = base_web
        prov["head_served_table_js_sha256"] = sha_file(os.path.join(head_web, "scene", "table.js"))
        prov["base_served_table_js_sha256"] = sha_file(os.path.join(base_web, "scene", "table.js"))
        prov["head_archive_table_js_sha256"] = sha_file(os.path.join(REPO_ROOT, "web", "scene", "table.js"))
        tree_reasons = []
        if prov["head_served_table_js_sha256"] != prov["head_archive_table_js_sha256"]:
            tree_reasons.append("the served HEAD web tree is not the archive's web tree")
        if prov["base_served_table_js_sha256"] != prov.get("main_table_js_sha256"):
            tree_reasons.append("the served BASE web tree is not the pinned merge base's web tree")
        if prov["base_served_table_js_sha256"] == prov["head_served_table_js_sha256"]:
            tree_reasons.append("BASE and HEAD serve the same table.js — a HEAD-as-BASE build is refused")
        gate["provenance"] = prov
        add_target("tree_provenance", "[tree] built from git archives: HEAD served tree == archive <commit>, BASE served tree == the pinned merge base, BASE ≠ HEAD",
                   "identity", not tree_reasons, "; ".join(tree_reasons))
        for r in tree_reasons: print(f"[gate] TREE: {r}")
        # ---- PLAN: re-measured here against the committed law (never a plan_gate.json)
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "plan"))
        import plan_gate_621 as _pg
        law_path = os.path.join(REPO_ROOT, "tools", "render", "d621", "law", "plan_law_621.json")
        plan_law = json.load(open(law_path))
        defs_path = os.path.join(REPO_ROOT, plan_law["definition_json"])
        pargs = argparse.Namespace(ours=cfg.ours, out=os.path.join(cfg.out, "plan"), prev=a.prev, model_obj_dir=cfg.model_obj_dir, defs=defs_path,
                                   red_arm=False, no_overlays=True, law=law_path)
        t = time.time(); print("[gate] -- plan rows re-measured in-process (committed law)", flush=True)
        pout, pmasks = _pg.measure(pargs); timings["plan_measure"] = round(time.time() - t, 1)
        _pg.print_rows(pout)
        plan_reasons = []
        manifest = json.load(open(os.path.join(REPO_ROOT, "tools", "render", "d621", "law", "model_manifest_621.json")))
        if pout["model_obj_set_sha256"] != manifest["set_sha256"]:
            plan_reasons.append(f"purchased-model OBJ set {pout['model_obj_set_sha256'][:12]} ≠ the committed manifest {manifest['set_sha256'][:12]}")
        expected_keys = {(pk, ck, rw["row"]) for pk in plan_law["pockets"] for rw in plan_law["rows"] for ck in rw["cuts"]}
        got_keys = [(r["pocket"], r["cut"], r["row"]) for r in pout["rows"]]
        if set(got_keys) != expected_keys or len(got_keys) != len(expected_keys) or len(expected_keys) != plan_law["expected_rows"]:
            plan_reasons.append(f"row set {len(got_keys)} ≠ the law's {plan_law['expected_rows']}")
        law_ops = {rw["row"]: (rw["op"], rw["thr"]) for rw in plan_law["rows"]}
        n_pass = 0
        for r in pout["rows"]:
            op, thr = law_ops[r["row"]]
            v = r["value"]
            p_dec = False if v is None else (v <= thr if op == "<=" else v >= thr)
            n_pass += 1 if p_dec else 0
            t = dict(key=f"plan_{r['pocket']}_{r['cut']}_{r['row']}", label=f"[plan {r['pocket']} {r['cut']} ({r['row']})] {r['label']}",
                     src=("plan", r["pocket"], r["cut"], r["row"]), op=op, threshold=thr, today="— (D621-PLAN-1; re-measured D621-PLAN-3-RECORD-3)", group="plan",
                     value=v, model=r.get("model"), note=r.get("note"), decides=True, secondary=r.get("secondary"))
            t["pass"] = bool(p_dec)
            if v is None: t["reason"] = "not measured"
            targets.append(t)
        gate["plan_gate"] = dict(mode="in-process", law_path=os.path.relpath(law_path, REPO_ROOT), law_sha256=pout["law"]["sha256"], defs_path=os.path.relpath(defs_path, REPO_ROOT),
                                 defs_sha256=pout["defs"]["sha256"], model_obj_dir=cfg.model_obj_dir, model_obj_set_sha256=pout["model_obj_set_sha256"],
                                 manifest_set_sha256=manifest["set_sha256"], ours_sha256=pout["ours_sha256"], rows_measured=len(pout["rows"]), rows_passed=n_pass,
                                 nose_lines=pout.get("nose_lines"), registration_method=pout["registration_method"],
                                 measurement_ruling=pout["measurement_ruling"], secondary=pout["secondary"],
                                 binding=dict(bound=not plan_reasons, reasons=plan_reasons))
        add_target("plan_binding", "[plan] rows re-measured in-process from the export against the committed law; purchased-model set == the committed manifest; row set == the law's",
                   "plan", not plan_reasons, "; ".join(plan_reasons))
        for r in plan_reasons: print(f"[gate] PLAN: {r}")
        ok = ok and all(t["pass"] for t in targets if t.get("group") == "plan")
        # ---- IDENTITY: captures made here, compared here (BASE from git main)
        id_law = json.load(open(os.path.join(REPO_ROOT, "tools", "render", "d621", "law", "identity_law_621.json")))
        id_dir = os.path.join(cfg.out, "identity"); os.makedirs(id_dir, exist_ok=True)
        main_tjs_text = open(os.path.join(base_web, "scene", "table.js")).read()
        catalog = list(id_law["catalog_tables"]); expect = set(id_law["expect_differ"]); allow = dict(id_law.get("allow_sharing") or {})
        not_declared_text = [tid for tid in catalog if not table_declared(main_tjs_text, tid)]
        # CEREMONY-PREP-2: ids the law lists ahead of their landing (pending_on_head) — while the audited HEAD does not declare them
        # they are PENDING free rows and are captured on neither tree; once HEAD declares them they are compared normally
        pending_rule = dict(id_law.get("pending_on_head") or {})
        head_tjs_text = open(os.path.join(head_web, "scene", "table.js")).read()
        pending = [tid for tid in catalog if tid in pending_rule and not table_declared(head_tjs_text, tid)]
        capture_ids = [tid for tid in catalog if tid not in pending]
        tool = os.path.join(REPO_ROOT, "tools", "render", "meshident-488d.mjs")
        env = dict(os.environ); env.setdefault("OB_SKIP_TREE_PREFLIGHT", "1")
        id_reasons = []
        def capture(tag, web, tables, allow_missing):
            outp = os.path.join(id_dir, f"capture-{tag}.json")
            t0 = time.time(); print(f"[gate] -- identity capture {tag} ({web})", flush=True)
            r = subprocess.run(["node", tool, "--out", outp, "--web", web, "--tables", ",".join(tables)], capture_output=True, text=True, env=env, cwd=REPO_ROOT)
            open(os.path.join(id_dir, f"capture-{tag}.log"), "w").write(r.stdout + r.stderr)
            timings[f"identity_capture_{tag}"] = round(time.time() - t0, 1)
            cap = json.load(open(outp)) if os.path.exists(outp) else None
            if r.returncode == 4 and cap and allow_missing:
                # exit 4 = some ids were not built. On the BASE that is acceptable ONLY for an expect-differ id that main's table.js
                # does not declare (not_declared_text) and whose error is the scripted-pin fallback; anything else fails the run
                bad = [t for t in cap.get("tables", []) if t.get("error") and not (t["id"] in expect and t["id"] in not_declared_text and "app built" in str(t.get("error")))]
                if bad: id_reasons.append(f"identity capture {tag}: {[(t['id'], t['error']) for t in bad]}")
            elif r.returncode != 0:
                id_reasons.append(f"identity capture {tag} exit {r.returncode}")
            return cap
        cap_h = capture("head", head_web, capture_ids, allow_missing=False)
        cap_b = capture("base", base_web, capture_ids, allow_missing=True)
        absent_on_main = [t["id"] for t in (cap_b or {}).get("tables", []) if t.get("error") and "app built" in str(t.get("error")) and t["id"] in not_declared_text]
        verdicts = []
        if cap_h and cap_b:
            id_reasons += identity_provenance_reasons(cap_h, cap_b, prov, id_law)
            A = {t["id"]: t for t in cap_b.get("tables", [])}; B = {t["id"]: t for t in cap_h.get("tables", [])}
            for tid in catalog:
                want = "DIFFER" if tid in expect else "IDENTICAL"
                if tid in pending:
                    verdicts.append(dict(id=tid, want=want, got="PENDING", ok=True, diffs=[f"pending: {pending_rule[tid]}"])); continue
                ta, tb = A.get(tid), B.get(tid)
                if tid in absent_on_main and tid in expect and tid in not_declared_text and tb and not tb.get("error"):
                    verdicts.append(dict(id=tid, want=want, got="NEW", ok=True, diffs=["absent on main (not declared in main's table.js AND main's tree builds the scripted pin for it): a FREE row, not a positive control"])); continue
                if not ta or not tb or ta.get("error") or tb.get("error"):
                    verdicts.append(dict(id=tid, want=want, got="ABSENT/ERROR", ok=False, diffs=[f"base {'ok' if ta and not ta.get('error') else (ta or {}).get('error', 'absent')} / head {'ok' if tb and not tb.get('error') else (tb or {}).get('error', 'absent')}"])); continue
                diffs = []
                if ta["n"] != tb["n"]: diffs.append(f"mesh count {ta['n']} -> {tb['n']}")
                for k, nm in (("geom_sha", "geometry"), ("attr_sha", "attributes"), ("name_sha", "names"), ("mat_sha", "materials"), ("vis_sha", "visibility")):  # attr_sha: NOTE-FENCE-NORMALS
                    if ta.get(k) != tb.get(k): diffs.append(nm)
                if ta.get("share_sha") != tb.get("share_sha"): diffs.append(f"instance sharing ({ta.get('n_material_instances')} -> {tb.get('n_material_instances')} material instances)")
                sharing_only = bool(diffs) and all(d.startswith("instance sharing") for d in diffs)
                got = "IDENTICAL" if not diffs else ("SHARING-DELTA" if sharing_only else "DIFFER")
                okv = got == want or (want == "IDENTICAL" and sharing_only and tid in allow)
                verdicts.append(dict(id=tid, want=want, got=got, ok=okv, diffs=diffs, sharing_delta_allowed=(sharing_only and tid in allow) or None,
                                     n_material_instances=[ta.get("n_material_instances"), tb.get("n_material_instances")]))
        else:
            id_reasons.append("identity captures missing")
        for v in verdicts:
            label = f"[identity {v['id']}] per-mesh geometry + material + instance-sharing identity vs git main: want {v['want']}"
            if v["got"] == "NEW": label += " — NEW on head: a FREE row, not a positive control"
            if v["got"] == "PENDING": label += " — PENDING (not yet declared on the audited HEAD; lands at the ceremony): a FREE row, stated"
            if v.get("sharing_delta_allowed"): label += f" — content identical, SHARING DELTA allowed ({v['n_material_instances'][0]} → {v['n_material_instances'][1]} instances): {allow.get(v['id'], '')}"
            add_target(f"identity_{v['id']}", label, "identity", v["ok"], f"got {v['got']} ({', '.join(v['diffs'])})", ", ".join(v["diffs"]) or None, src=("identity", v["id"], v["want"], v["got"]))
        add_target("identity_binding", "[identity] captures made by this gate (HEAD = the archive's served tree, BASE = git archive <pinned merge base>), BASE table.js == the pin's, BASE ≠ HEAD, census tainted 0, every verdict ok",
                   "identity", not id_reasons and bool(verdicts) and all(v["ok"] for v in verdicts), "; ".join(id_reasons) or "a verdict is not ok")
        for r in id_reasons: print(f"[gate] IDENTITY: {r}")
        gate["material_identity"] = dict(mode="in-process", law_sha256=sha_file(os.path.join(REPO_ROOT, "tools", "render", "d621", "law", "identity_law_621.json")),
                                         head_capture=os.path.join(id_dir, "capture-head.json"), base_capture=os.path.join(id_dir, "capture-base.json"),
                                         head_capture_sha256=sha_file(os.path.join(id_dir, "capture-head.json")) if os.path.exists(os.path.join(id_dir, "capture-head.json")) else None,
                                         base_capture_sha256=sha_file(os.path.join(id_dir, "capture-base.json")) if os.path.exists(os.path.join(id_dir, "capture-base.json")) else None,
                                         base_tree_from="git archive <pinned merge base> -- web tools (by the card driver; CEREMONY-PREP-2 B2)", base_commit=prov.get("base_commit"), absent_on_base=absent_on_main, not_declared_in_base_text=not_declared_text, pending=pending,
                                         verdicts=verdicts, tex_census=dict(head=(cap_h or {}).get("tex_census"), base=(cap_b or {}).get("tex_census")),
                                         binding=dict(bound=not id_reasons and bool(verdicts) and all(v["ok"] for v in verdicts), reasons=id_reasons))
        ok = ok and all(t["pass"] for t in targets if t.get("group") == "identity")
        # O22: fresh section rows from all three dumps in this same archive run.
        # No precomputed cushion result, alternate law, or offline preview can enter.
        import cushion_gate_621 as _cushion
        t = time.time(); print("[gate] -- CUSHION three-size sections re-measured in-process", flush=True)
        cushion = _cushion.measure(card["cushion_dumps"], cfg.model_obj_dir,
                                   nodes=nodes, plan_result=pout, archive=True)
        timings["cushion_measure"] = round(time.time() - t, 1)
        _cushion.add_boolean(cushion["rows"], "l_identity", "standing identity fold bound and every existing verdict retained",
                             gate["material_identity"]["binding"]["bound"] and all(v["ok"] for v in verdicts))
        for size, path in card["cushion_dumps"].items():
            _cushion.add_boolean(cushion["rows"], "archive_binding_" + size, size + " fresh dump SHA equals this driver's provenance",
                                 sha_file(path) == prov["cushion_dump_sha256"].get(size))
        # DERIVED: runtime suites are fresh, sequential, and required for a seal.
        # A prior red avoids expensive browser work, but leaves these proofs RED,
        # never silently skipped or recorded as successful.
        runtime = None
        if ok and _cushion.all_deciding_pass(cushion["rows"]):
            import cushion_battery_621 as _cushion_battery
            runtime = _cushion_battery.run(head_web, os.path.join(cfg.out, "cushion-runtime"))
            cushion["rows"].extend(runtime["rows"])
        else:
            for key in ("cue", "liveswitch", "e2e628"):
                _cushion.add_boolean(cushion["rows"], "l_" + key, "archive runtime battery " + key, False,
                                     "not run because a preceding geometry/identity row is red; not a PASS")
        cushion["runtime_battery"] = runtime
        targets.extend(cushion["rows"])
        cushion["verdict"] = _cushion.aggregate_verdict(cushion["rows"])
        common.dump_json(cushion, os.path.join(cfg.out, "cushion_gate.json"))
        gate["cushion_gate"] = dict(mode="in-process", law_sha256=cushion["law_sha256"],
                                    sections=sum(len(v) for table in cushion["tables"].values() for v in table.values()),
                                    rows_measured=len(cushion["rows"]), rows_passed=sum(r["pass"] for r in cushion["rows"]),
                                    verdict=cushion["verdict"], diagnostics=cushion["diagnostics"], runtime_battery=runtime,
                                    result_sha256=sha_file(os.path.join(cfg.out, "cushion_gate.json")))
        ok = ok and _cushion.all_deciding_pass(cushion["rows"])
        gate["_card"] = dict(pout=pout, pmasks=pmasks)   # in-memory only; stripped before the dump
    counts = group_counts(targets)
    card_mem = gate.pop("_card", None)
    if a.card_run:
        # GENERATED provenance of what executed (replaces the hand-maintained allowlist): every python module loaded from the archive
        # and every node tool invoked, with their archive sha256
        import hashlib as _h4
        mods = {}
        for name, m in list(sys.modules.items()):
            f = getattr(m, "__file__", None)
            if f and os.path.abspath(f).startswith(paths.REPO_ROOT + os.sep):
                mods[os.path.relpath(os.path.abspath(f), paths.REPO_ROOT)] = _h4.sha256(open(f, "rb").read()).hexdigest()
        for rel in ("tools/render/meshident-488d.mjs", "tools/render/d621/align/dump-ours-621.mjs", "tools/render/d621/card/topdown_621.mjs", "web/tools/cdp.mjs",
                    "tools/render/d621/plan/entry_snapshot_621.mjs", "tools/render/d621/plan/table_module_621.mjs"):
            pth = os.path.join(paths.REPO_ROOT, rel)
            if os.path.exists(pth): mods[rel] = _h4.sha256(open(pth, "rb").read()).hexdigest()
        if gate.get("cushion_gate", {}).get("runtime_battery"):
            for record in gate["cushion_gate"]["runtime_battery"]["records"]:
                rel = record["command"][1]
                mods[rel] = sha_file(os.path.join(REPO_ROOT, rel))
            rel = "web/tools/e2e-lighting.mjs"  # DERIVED: its exact GH-628(3) block executes in the focused runner.
            mods[rel] = sha_file(os.path.join(REPO_ROOT, rel))
        for rel in ("tools/render/d621/law/plan_law_621.json", "tools/render/d621/law/identity_law_621.json", "tools/render/d621/law/model_manifest_621.json",
                    "tools/render/d621/law/cushion_law_621.json", "tools/render/d621/law/cushion_fence_621.json", "tools/render/d621/law/cushion_mesh_fence_621.json",
                    "tools/render/d621/align/law_adjust_d621.json", "docs/geometry/diamond-proam-9ft-table-definition.json",
                    "docs/geometry/diamond-proam-8ft-table-definition.json", "docs/geometry/diamond-proam-7ft-table-definition.json"):
            pth = os.path.join(paths.REPO_ROOT, rel)
            if os.path.exists(pth): mods[rel] = _h4.sha256(open(pth, "rb").read()).hexdigest()
        gate["executed_from_archive"] = dict(note="generated from sys.modules + the invoked node tools + the law/definition files read; all paths relative to the git archive of the audited commit", files=dict(sorted(mods.items())))
    if a.card_out:
        if a.card_run and ok and card_mem:
            sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "plan"))
            import plan_gate_621 as _pg2
            _pg2.card_figures(card_mem["pout"], card_mem["pmasks"], a.card_out, a.prev is not None, _pg2.prev_label_from(a.prev))
            gate["card_out"] = dict(dir=os.path.abspath(a.card_out), written=True)
            print(f"[gate] card figures written from the in-process PLAN result -> {a.card_out}")
        else:
            gate["card_out"] = dict(dir=os.path.abspath(a.card_out), written=False, reason="not a card build" if not a.card_run else "gate FAIL")
            print(f"[gate] CARD REFUSED: {'not a card build' if not a.card_run else 'the gate reads FAIL'} — no figure written")
    ruled_reds = [t for t in targets if t.get("status") == "RED-BY-LAW" and t.get("ruling", {}).get("accepted")]
    verdict = "PASS-WITH-RULED-RED" if ok and ruled_reds else "PASS" if ok else "FAIL"
    gate.update(targets=[dict(t, src=list(t["src"])) for t in targets], verdict=verdict, exit_code=0 if ok else 3, timings=timings,
                ruled_red_rows=[t["key"] for t in ruled_reds],
                verdict_groups=counts, verdict_line=verdict_line(counts))
    if ruled_reds:
        gate["verdict_line"] += "; RED-BY-LAW: " + ", ".join(t["key"] for t in ruled_reds)
    if not a.evaluate_only: gate["total_seconds"] = round(time.time() - t_start, 1)
    common.dump_json(gate, os.path.join(cfg.out, "gate.json"))
    import write_report
    write_report.run(cfg, gate)
    print_tables(data)
    if data.get("law_adjusted"): print_law_table(data["law_adjusted"])
    print("\n== STANDING TARGETS  (raw = the 7 standing targets; law = law-adjusted silhouettes / centroid-aligned legs / envelope-out band and walls;"
          " a raw row with an evaluated law twin is reported, the twin decides)")
    for t in targets:
        val = "missing" if t["value"] is None else (f"{t['value']:.4f}" if t["key"].startswith("iou") else f"{t['value']:.2f}")
        res = "SKIP" if t["pass"] is None else ("PASS" if t["pass"] else "FAIL")
        sup = "" if t.get("decides", True) or t["pass"] is None else (
            f"  · RED, accepted by explicit ruling: {t['ruling']['source']}" if t.get("ruling") else
            f"  · law-decided: reported, superseded by {'+'.join(t['superseded_by'])}")
        print(f"  {res}  {t.get('group', 'raw'):3s} {t['key']:16s} {val:>10s} {t['op']} {t['threshold']:<7g}  {t['label']}   [today {t.get('today', '-')}]" + (f"  ({t['reason']})" if t.get("reason") else "") + sup)
    print(f"\n== VERDICT {gate['verdict']}  ({sum(1 for t in targets if t['pass'])}/{sum(1 for t in targets if t['pass'] is not None)} targets: {gate['verdict_line']})  total {gate.get('total_seconds', 0)} s  -> {os.path.join(cfg.out, 'gate.json')}  {os.path.join(cfg.out, 'ALIGNMENT.md')}")
    return gate["exit_code"]


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc(); sys.exit(2)
