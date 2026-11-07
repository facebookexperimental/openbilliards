#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""D621 card 19 — THE CARD IS BUILT FROM GIT ARCHIVES ONLY (D621-PLAN-3-RECORD-4).

This file executes FROM `git archive <commit>` (the wrapper build_card_pack_621.sh extracts the archive and runs this copy of the
script; it never runs from a working tree). It takes ONE positional argument, the commit id, and no flags. Everything it reads
comes from two archives the wrapper made — HEAD = `git archive <commit>` (this tree), BASE = `git archive <pinned merge base> -- web tools`
(the merge base recorded in this archive's identity law, CEREMONY-PREP-2 B2; never a moving branch) — plus exactly two external runtime inputs that cannot live in git
and are pinned by sha256 in the verdict: the purchased model's quarantine OBJ set (checked against the archive's committed
manifest) and the lane's locally rebaked wasm overlay for the 8 / 7 ft catalog entries (the canonical wasm is rebuilt only at the
landing ceremony; the served overlay's pool_wasm_bg.wasm sha and the app's kernel string are recorded).

What it does, in order, all in this process or by subprocesses it spawns on the archive's tools:
  1. serve the HEAD web tree (archive web + the wasm overlay) and dump all three Pro-Am scenes sequentially (dump-ours-621.mjs);
  2. run the ALIGN gate in card mode (align_gate_621.run_gate(card=...)): every RAW / LAW row recomputed (no evaluate-only, no
     target override, the archive's committed law-adjust deltas), the PLAN rows re-measured against the archive's committed law,
     the HEAD and BASE identity captures made by the run (meshident-488d.mjs from the archive), compared in-process;
  3. only on PASS or the explicitly bound PASS-WITH-RULED-RED: the card plan figures, the straight-down owner frames
     (topdown_621.mjs) and the whole-table silhouettes; the f row stays RED-BY-LAW;
  4. gate.json embeds both commit ids + tree hashes, the served trees' table.js digests, the sha of every law / manifest /
     definition file read from the archive, a generated list of every module that executed, and the two external pins.
Exit 0 iff the gate accepts the law (figures written); otherwise ≠ 0 and no figure. Named exit codes: 2 usage / provenance refusal,
3 dump failed, 4 WASM_OVERLAY_MISSING, 5 WASM_PIN_MISMATCH (the served kernel is pinned in identity_law_621.json `wasm` and verified
BEFORE the dump — D621-WASM-PIN, 2026-09-08; arms 6 / 7 retain both refusals; O22 arm 5 tests the cushion radius).
"""
import hashlib, json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ARCHIVE = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
sys.path.insert(0, os.path.join(ARCHIVE, "tools", "render", "d621", "align"))
sys.path.insert(0, os.path.join(ARCHIVE, "tools", "render", "d621", "plan"))

# external pin #2: the served kernel. Pinned (sha256 + mode) in the archive's identity law and VERIFIED here before the dump —
# a missing or mismatched wasm is a refusal, never a recorded null. The overlay lives under $HOME (NOTE-TMP-REAPER 2026-09-08:
# /tmp trees are emptied by access age; the previous overlay was reaped there), overridable for the arms.
WASM_OVERLAY = os.environ.get("D621_WASM_OVERLAY", os.path.expanduser("~/ob-artifacts/diamond/wasm-overlay/pool-wasm"))
EXIT_USAGE, EXIT_DUMP, EXIT_WASM_OVERLAY_MISSING, EXIT_WASM_PIN_MISMATCH = 2, 3, 4, 5   # DERIVED: unchanged named exits; O22 arms 6 / 7 assert 4 / 5.


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if len(argv) != 1 or argv[0].startswith("-"):
        print("usage: card_621.py <commit>   (exactly one argument; no flags — the card is built from git archives only)", file=sys.stderr)
        return 2
    commit = argv[0]
    need = ["D621_CARD_HEAD_COMMIT", "D621_CARD_HEAD_TREE", "D621_CARD_BASE_COMMIT", "D621_CARD_BASE_TREE", "D621_CARD_BASE_TREE_DIR", "D621_CARD_OUT"]
    missing = [k for k in need if not os.environ.get(k)]
    if missing:
        print(f"card_621.py must be started by build_card_pack_621.sh (missing {missing})", file=sys.stderr); return 2
    if not os.environ["D621_CARD_HEAD_COMMIT"].startswith(commit) and not commit.startswith(os.environ["D621_CARD_HEAD_COMMIT"][:7]):
        print("the commit argument does not match the archived commit", file=sys.stderr); return 2
    if os.path.exists(os.path.join(ARCHIVE, ".git")):
        print("refusing to run from a working tree — this script runs from a git archive only", file=sys.stderr); return 2
    out = os.environ["D621_CARD_OUT"]; os.makedirs(out, exist_ok=True)
    base_tree = os.environ["D621_CARD_BASE_TREE_DIR"]
    import paths
    assert os.path.abspath(paths.REPO_ROOT) == ARCHIVE, f"paths.REPO_ROOT {paths.REPO_ROOT} is not this archive {ARCHIVE}"
    # ---- 0. the served kernel: pinned in the archive's identity law, verified BEFORE anything is served or dumped (fail-closed)
    id_law = json.load(open(os.path.join(ARCHIVE, "tools", "render", "d621", "law", "identity_law_621.json")))
    if os.environ["D621_CARD_BASE_COMMIT"] != id_law["base"]["commit"]:
        print("the BASE archive is not the law's pinned merge base", file=sys.stderr); return EXIT_USAGE
    wl = id_law.get("wasm") or {}
    mode, pin = wl.get("mode"), wl.get("pool_wasm_bg_sha256")
    if mode not in ("overlay", "archive") or not pin:
        print("WASM_PIN_MISMATCH: the archive's identity law carries no wasm pin (identity_law_621.json `wasm.mode` / `wasm.pool_wasm_bg_sha256`)", file=sys.stderr); return EXIT_WASM_PIN_MISMATCH
    wasm_dir = WASM_OVERLAY if mode == "overlay" else os.path.join(ARCHIVE, "web", "dist", "pool-wasm")
    wasm_file = os.path.join(wasm_dir, "pool_wasm_bg.wasm")
    if not os.path.isfile(wasm_file):
        print(f"WASM_OVERLAY_MISSING: {wasm_file} does not exist (mode {mode}; the law pins {pin[:16]}…, kernel {wl.get('kernel')}) — refusing before the dump; "
              f"nothing served, nothing captured. {wl.get('status', '')}", file=sys.stderr); return EXIT_WASM_OVERLAY_MISSING
    wasm_sha = sha(wasm_file)
    if wasm_sha != pin:
        print(f"WASM_PIN_MISMATCH: {wasm_file} sha256 {wasm_sha[:16]}… ≠ the law's pin {pin[:16]}… (mode {mode}, kernel {wl.get('kernel')}) — refusing before the dump", file=sys.stderr)
        return EXIT_WASM_PIN_MISMATCH
    print(f"[card] wasm pin verified: mode {mode}, {wasm_file} sha256 {wasm_sha[:16]}… == law pin (kernel {wl.get('kernel')})", flush=True)
    # ---- 1. serve HEAD: the archive's web, with the verified overlay in place of dist/pool-wasm in overlay mode (nothing in the archive is modified)
    ovl = os.path.join(out, "head-web-overlay"); os.makedirs(ovl, exist_ok=True)
    web = os.path.join(ARCHIVE, "web")
    for e in os.listdir(web):
        if e == "dist": continue
        dst = os.path.join(ovl, e)
        if not os.path.lexists(dst): os.symlink(os.path.join(web, e), dst)
    os.makedirs(os.path.join(ovl, "dist"), exist_ok=True)
    for e in os.listdir(os.path.join(web, "dist")):
        dst = os.path.join(ovl, "dist", e)
        if e == "pool-wasm" and mode == "overlay":
            if not os.path.lexists(dst): os.symlink(WASM_OVERLAY, dst)
        elif not os.path.lexists(dst): os.symlink(os.path.join(web, "dist", e), dst)
    prov = dict(head_commit=os.environ["D621_CARD_HEAD_COMMIT"], head_tree=os.environ["D621_CARD_HEAD_TREE"],
                base_commit=os.environ["D621_CARD_BASE_COMMIT"], base_tree=os.environ["D621_CARD_BASE_TREE"], base_rule=id_law["base"]["rule"],
                # aliases kept for the gate's checks: the 'main' of the identity law IS the pinned merge base (CEREMONY-PREP-2 B2)
                main_commit=os.environ["D621_CARD_BASE_COMMIT"], main_tree=os.environ["D621_CARD_BASE_TREE"],
                head_archive=ARCHIVE, base_archive=base_tree,
                main_table_js_sha256=sha(os.path.join(base_tree, "web", "scene", "table.js")),
                head_commit_table_js_sha256=sha(os.path.join(ARCHIVE, "web", "scene", "table.js")),
                external_wasm_overlay=dict(mode=mode, dir=wasm_dir, pool_wasm_bg_sha256=wasm_sha, law_pin=pin, law_kernel=wl.get("kernel"), verified_before_dump=True,
                                           note="verified against identity_law_621.json `wasm` before the dump (D621-WASM-PIN); overlay mode = the lane's local rebake for the 8 / 7 ft catalog entries, archive mode = the tree's own web/dist/pool-wasm (the ceremony's rebake)"),
                law_files={rel: sha(os.path.join(ARCHIVE, rel)) for rel in ("tools/render/d621/law/plan_law_621.json", "tools/render/d621/law/identity_law_621.json",
                                                                          "tools/render/d621/law/model_manifest_621.json", "tools/render/d621/align/law_adjust_d621.json",
                                                                          "tools/render/d621/law/cushion_law_621.json", "tools/render/d621/law/cushion_fence_621.json",
                                                                          "tools/render/d621/law/cushion_mesh_fence_621.json",
                                                                          "docs/geometry/diamond-proam-9ft-table-definition.json", "docs/geometry/diamond-proam-8ft-table-definition.json",
                                                                          "docs/geometry/diamond-proam-7ft-table-definition.json")})
    # ---- 2. fresh three-size dumps, one pinned Chrome at a time (O22).
    env = dict(os.environ); env.setdefault("OB_SKIP_TREE_PREFLIGHT", "1")
    env["OB_PROFILE_SWEEP"] = "0"  # DERIVED: never reap another lane's historical Chrome/profile.
    cushion_dumps = {}
    for size in ("8ft", "9ft", "7ft"):
        ours = os.path.join(out, f"ours-{size}.json")
        t0 = time.time(); load_before = os.getloadavg()
        print(f"[card] dump diamond_proam_{size} from {ovl}; load={load_before}", flush=True)
        r = subprocess.run(["node", os.path.join(ARCHIVE, "tools", "render", "d621", "align", "dump-ours-621.mjs"),
                            "--table", f"diamond_proam_{size}", "--web", ovl, "--out", ours],
                           capture_output=True, text=True, env=env, cwd=ARCHIVE)
        log_name = "dump.log" if size == "8ft" else f"dump-{size}.log"
        open(os.path.join(out, log_name), "w").write(f"load before {load_before}; after {os.getloadavg()}\n" + r.stdout + r.stderr)
        if r.returncode != 0 or not os.path.exists(ours):
            print(f"[card] dump failed (exit {r.returncode}) — see {out}/{log_name}"); return EXIT_DUMP
        dumped = json.load(open(ours))
        if dumped.get("kernel_console") != "[app] kernel " + wl["kernel"]:
            print(f"WASM_PIN_MISMATCH: {size} app reports {dumped.get('kernel_console')!r}, expected {wl['kernel']}")
            return EXIT_WASM_PIN_MISMATCH
        cushion_dumps[size] = ours
        print(f"[card] {size} dump ok ({round(time.time() - t0, 1)} s)", flush=True)
    ours = cushion_dumps["8ft"]
    prov["ours_dump_sha256"] = sha(ours)
    prov["cushion_dump_sha256"] = {size: sha(path) for size, path in cushion_dumps.items()}
    # ---- 3. the gate in card mode
    import align_gate_621 as gate_mod
    cfg = paths.Config(None, ours, os.path.join(out, "gate"), prov["head_commit"][:8]); cfg.assert_out_outside_repo(); cfg.ensure_dirs()
    card = dict(head_web=ovl, base_web=os.path.join(base_tree, "web"), provenance=prov,
                cushion_dumps=cushion_dumps, card_out=os.path.join(out, "card", "plan"), prev=None)
    code = gate_mod.run_gate(cfg, law_adjust_on=True, evaluate_only=False, no_heatmaps=False, committed_measurements=gate_mod.COMMITTED_MEASUREMENTS, card=card)
    g = json.load(open(os.path.join(cfg.out, "gate.json")))
    # ---- 4. owner frames + silhouettes, retaining the one explicitly ruled red.
    accepted = g.get("verdict") == "PASS" or (g.get("verdict") == "PASS-WITH-RULED-RED"
                and g.get("ruled_red_rows") == ["cushion_f_p90"])
    if code == 0 and accepted:
        td = os.path.join(out, "card", "topdown"); os.makedirs(td, exist_ok=True)
        tenv = dict(env, WEBDIR=ovl, TAG=prov["head_commit"][:8], OUT=td)
        r = subprocess.run(["node", os.path.join(ARCHIVE, "tools", "render", "d621", "card", "topdown_621.mjs")], capture_output=True, text=True, env=tenv, cwd=ARCHIVE)
        open(os.path.join(out, "topdown.log"), "w").write(r.stdout + r.stderr)
        sil = os.path.join(out, "card", "silhouettes"); os.makedirs(sil, exist_ok=True)
        import shutil
        for f in ("top_overlay_annotated", "side_overlay_annotated", "end_overlay_annotated", "top_overlay_law_adjusted", "side_overlay_law_adjusted", "end_overlay_law_adjusted",
                  "zoom_corner_pocket_plan_abovebed_annotated", "zoom_side_pocket_plan_abovebed_annotated"):
            src = os.path.join(cfg.out, "overlays", f + ".png")
            if os.path.exists(src): shutil.copy(src, sil)
        if os.path.exists(os.path.join(cfg.out, "summary-sheet.png")): shutil.copy(os.path.join(cfg.out, "summary-sheet.png"), os.path.join(sil, "alignment-summary-sheet.png"))
        shutil.copy(os.path.join(cfg.out, "gate.json"), os.path.join(out, "card", "gate.json")); shutil.copy(os.path.join(cfg.out, "ALIGNMENT.md"), os.path.join(out, "card", "ALIGNMENT.md"))
        print(f"[card] {g['verdict']} — figures, top-down frames and silhouettes under {out}/card")
    else:
        print(f"[card] gate {g.get('verdict')} (exit {code}) — no card figure written")
    return code


if __name__ == "__main__":
    sys.exit(main())
