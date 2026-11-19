#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""D621-PLAN-3-RECORD-4 — negative tests that INVOKE the real card entry point (build_card_pack_621.sh <commit>) and must exit ≠ 0
with the named reason. Each arm makes a SCRATCH COMMIT (a detached worktree of the audited commit with exactly one tracked file
modified, committed there, the worktree removed afterwards; the dangling commit object is harmless and unreferenced) and builds
the card from it — because the card is built from git archives only, a modified WORKING copy cannot reach it (arm 0 proves it).

  arm 0  a forged input: any flag / a second argument -> usage exit 2; a working-copy edit of the PLAN law -> no effect (PASS, the
         verdict's law sha is the archive's)                                   [closure (a): no file input, archives only]
  arm 1  HEAD as BASE: a scratch identity-law pin points to the audited commit (same table.js as scratch HEAD)
         -> FAIL "BASE and HEAD serve the same table.js"; the pinned-base driver never reads a moving main [closure (b)]
  arm 2  tampered threshold: plan_law_621.json row c thr := 0.99 -> FAIL on the plan rows (66 measured, the c rows below 0.99)
         — the threshold is read from the archive and applied; a loosened threshold is a tracked-file edit = the diff  [closure (c)]
  arm 3  tampered manifest: one OBJ sha changed -> FAIL "purchased-model OBJ set ≠ the committed manifest"
  arm 4  tampered PLAN measurement helper: planlib_621.mask_of returns an empty mask -> FAIL on the plan rows (IoU 0)
  arm 5  O22 radius: exactly one active Pro-Am entry noseR changes from the MODEL-derived radius to baseline 0.004 in a scratch commit;
         the real archive entry must measure all 144 sections and FAIL cushion_e (not just fail elsewhere).
  arm 6  wasm overlay MISSING: D621_WASM_OVERLAY -> an empty directory -> exit 4 (WASM_OVERLAY_MISSING) BEFORE the dump, no dump.log
  arm 7  wasm pin MISMATCH: D621_WASM_OVERLAY -> a directory holding the archive's own (canonical, un-pinned) pool_wasm_bg.wasm
         -> exit 5 (WASM_PIN_MISMATCH) BEFORE the dump, no dump.log        (arms 6 / 7 need no browser: seconds, not minutes)
  arm 8  NORMALS-ONLY leak (NOTE-FENCE-NORMALS): a scratch commit perturbs ONE normal component on every mesh of a NON-target
         table (predator_apex_9ft) inside buildTable — positions, names, materials, visibility untouched -> the identity row
         identity_predator_apex_9ft must FAIL with the diff 'attributes' present and 'geometry' ABSENT (the positions hash alone
         would have passed this leak, which is the defect the widened capture /3 closes).

  python3 tools/render/d621/law/arms_621.py [--commit <sha>] [--only 0,1,...] [--out DURABLE_DIR]
         [--baseline-red] also restores the complete pre-O22 table.js in a scratch commit and requires c/e/f/i reds under B.
         [--repo CHECKOUT] permits this arm driver to execute from the audited archive; only git operations and the
         byte-verified, unchanged wrapper use CHECKOUT. The deciding instruments still execute from each scratch archive.
Exit 0 iff every arm behaves (arm 0 PASS/usage, negative arms exit nonzero with their own named reason).
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile, time
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
ENTRY = os.path.join(REPO, "tools", "render", "d621", "card", "build_card_pack_621.sh")
RECORD_DIR = None
BUILD_RECORDS = []


def git(*args, cwd=None, binary=False):
    r = subprocess.run(["git", "-C", cwd or REPO] + list(args), capture_output=True, check=True)
    return r.stdout if binary else r.stdout.decode().strip()


def scratch_commit(base_commit, edit):
    """detached worktree of base_commit, apply edit(path_root), commit, return the commit id; the worktree is removed."""
    wt = tempfile.mkdtemp(prefix="d621-arm-")
    subprocess.run(["git", "-C", REPO, "worktree", "add", "--detach", wt, base_commit], check=True, capture_output=True)
    try:
        edit(wt)
        subprocess.run(["git", "-C", wt, "add", "-A"], check=True, capture_output=True)
        subprocess.run(["git", "-C", wt, "-c", "user.name=d621-arm", "-c", "user.email=arm@d621.local", "commit", "-q", "-m", "D621 arm scratch commit (never merged)"], check=True, capture_output=True)
        return git("rev-parse", "HEAD", cwd=wt)
    finally:
        subprocess.run(["git", "-C", REPO, "worktree", "remove", "--force", wt], capture_output=True)


def build(commit, extra=(), env=None):
    t0 = time.time()
    load_before = os.getloadavg()
    destination, log = None, None
    if RECORD_DIR:
        destination = os.path.join(RECORD_DIR, f"build-{len(BUILD_RECORDS):02d}")
        os.makedirs(destination)
        log = open(os.path.join(destination, "entry.log"), "w")
        log.write(f"load before={load_before}; commit={commit}; extra={list(extra)}\n")
        log.flush()
    print(f"[build] archive {commit}; durable={destination}; load={load_before}", flush=True)
    process = subprocess.Popen([ENTRY, commit] + list(extra), stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True,
                               env={**os.environ, "PYTHONUNBUFFERED": "1", **(env or {})})
    chunks = []
    try:
        for line in process.stdout:
            chunks.append(line)
            if log:
                log.write(line)
                log.flush()
        return_code = process.wait()
    finally:
        if log:
            log.write(f"load after={os.getloadavg()}\n")
            log.close()
    out = "".join(chunks)
    m = re.search(r"D621_CARD_OUT|-> (/tmp/d621-card/[^ ]+)/head-tree", out)
    outdir = None
    m2 = re.search(r"-> (/tmp/d621-card/[^/ ]+)/head-tree", out)
    if m2: outdir = m2.group(1)
    gate = None
    if outdir and os.path.exists(os.path.join(outdir, "gate", "gate.json")):
        gate = json.load(open(os.path.join(outdir, "gate", "gate.json")))
    if RECORD_DIR:
        copied = []
        # DERIVED: durable generated evidence only; no served tree, asset, OBJ or wasm.
        for relative in ("gate/gate.json", "gate/cushion_gate.json", "gate/ALIGNMENT.md",
                         "ours-9ft.json", "ours-8ft.json", "ours-7ft.json",
                         "ours-9ft.console.txt", "ours-8ft.console.txt", "ours-7ft.console.txt",
                         "dump.log", "dump-9ft.log", "dump-7ft.log"):
            source = os.path.join(outdir, relative) if outdir else None
            if source and os.path.isfile(source):
                target = os.path.join(destination, relative)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                shutil.copy2(source, target)
                copied.append(dict(path=relative, sha256=__import__("hashlib").sha256(open(target, "rb").read()).hexdigest()))
        BUILD_RECORDS.append(dict(commit=commit, extra=list(extra), exit_code=return_code, archive_run=outdir,
                                  durable=destination, seconds=time.time() - t0,
                                  load_average=dict(before=load_before, after=os.getloadavg()), files=copied))
        with open(os.path.join(RECORD_DIR, "builds.json"), "w") as stream:
            json.dump(BUILD_RECORDS, stream, indent=2)
    return return_code, out, outdir, gate, round(time.time() - t0, 1)


def reasons_of(gate):
    if not gate: return []
    return [f"{t['key']}: {t.get('reason', 'FAIL')}" for t in gate.get("targets", []) if t.get("pass") is False]


def main(argv=None):
    global REPO, ENTRY, RECORD_DIR
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--commit", default=None, help="the audited commit (default HEAD)")
    ap.add_argument("--only", default=None, help="comma list of arm numbers")
    ap.add_argument("--out", default=None, help="new durable directory for each actual entry log, gate and dump")
    ap.add_argument("--repo", default=None, help="checkout supplying git objects while this driver executes from its archive")
    ap.add_argument("--baseline-red", action="store_true", help="also require the pre-O22 renderer to fire c/e/f/i under Option B")
    a = ap.parse_args(argv)
    archived_wrapper = open(ENTRY, "rb").read()
    if a.repo:
        REPO = os.path.realpath(a.repo)
        ENTRY = os.path.join(REPO, "tools", "render", "d621", "card", "build_card_pack_621.sh")
        if open(ENTRY, "rb").read() != archived_wrapper:
            ap.error("checkout wrapper differs from the archived wrapper; refusing")
    base = git("rev-parse", a.commit or "HEAD")
    if open(__file__, "rb").read() != git("show", base + ":tools/render/d621/law/arms_621.py", binary=True):
        ap.error("arm driver must equal the audited commit's own source")
    if a.out:
        RECORD_DIR = os.path.realpath(a.out)
        if RECORD_DIR.startswith(("/tmp/", "/private/tmp/", REPO + os.sep)) or os.path.exists(RECORD_DIR):
            ap.error("--out must be a new durable directory outside the repository")
        os.makedirs(RECORD_DIR)
    only = set(int(x) for x in a.only.split(",")) if a.only else None
    if only is not None and (not only or not only.issubset(set(range(9)))):
        ap.error("--only must select existing arms 0 through 8")  # DERIVED: nine documented arms.
    results = []
    def rec(n, name, ok, detail): results.append((n, name, ok, detail)); print(f"[arm {n}] {'BEHAVES' if ok else 'OPEN <<<'}  {name}: {detail}", flush=True)
    baseline_result = None
    if a.baseline_red:
        before_commit = "fdfd64c01ddf8a998c723b8be994de263b1363c8"
        before_table = git("show", before_commit + ":web/scene/table.js", binary=True)
        before_sha = __import__("hashlib").sha256(before_table).hexdigest()
        def restore_renderer(wt):
            with open(os.path.join(wt, "web/scene/table.js"), "wb") as stream:
                stream.write(before_table)
        c = scratch_commit(base, restore_renderer)
        rc, out, outdir, gate, dt = build(c)
        # DERIVED: the unchanged ORDER section counts; the current B instrument
        # must see the full pre-O22 renderer, not a hand-authored numeric fixture.
        wanted = {"cushion_c": 144, "cushion_e": 144, "cushion_f_p90": 816,
                  "cushion_f_max": 816, "cushion_i_front": 144}
        measured = {row["key"]: row for row in (gate or {}).get("targets", []) if row["key"] in wanted}
        source_ok = ((gate or {}).get("provenance") or {}).get("head_commit_table_js_sha256") == before_sha
        ok = rc != 0 and source_ok and set(measured) == set(wanted) and all(
            row.get("pass") is False and row.get("n") == wanted[key] for key, row in measured.items())
        baseline_result = dict(behaves=ok, source_commit=before_commit, source_table_js_sha256=before_sha,
                               scratch_commit=c, instrument_commit=base, archive_run=outdir,
                               exit_code=rc, seconds=dt, rows=measured,
                               note="Complete pre-O22 renderer bytes with the audited Option B tools/law; not a claimed full old-tool run.")
        print(f"[baseline pre-O22] {'BEHAVES' if ok else 'OPEN <<<'} c/e/f/i under B; scratch={c}; exit={rc}; {dt}s", flush=True)
    if only is None or 0 in only:
        rc1, o1, _, _, _ = build(base, extra=["--summary", "/tmp/forged.json"])
        rc2, o2, _, _, _ = build(base, extra=["/tmp/forged-gate.json"])
        # a working-copy edit of the law must have NO effect on an archive build
        law_path = os.path.join(REPO, "tools", "render", "d621", "law", "plan_law_621.json")
        keep = open(law_path).read()
        try:
            law = json.loads(keep)
            for row in law["rows"]:
                if row["row"] == "a": row["thr"] = 1000000.0
            open(law_path, "w").write(json.dumps(law, indent=2) + "\n")
            rc3, o3, outdir3, gate3, dt3 = build(base)
        finally:
            open(law_path, "w").write(keep)
        committed_sha = __import__("hashlib").sha256(git("show", f"{base}:tools/render/d621/law/plan_law_621.json", binary=True)).hexdigest()
        used_sha = ((gate3 or {}).get("provenance") or {}).get("law_files", {}).get("tools/render/d621/law/plan_law_621.json")
        ok0 = rc1 == 2 and rc2 == 2 and rc3 == 0 and used_sha == committed_sha
        rec(0, "forged input / working-copy edit", ok0, f"flag -> exit {rc1}; second arg -> exit {rc2}; edited working law -> build exit {rc3} using the ARCHIVE law {str(used_sha)[:12]} (committed {committed_sha[:12]}), {dt3}s")
    if only is None or 1 in only:
        # DERIVED: B2 pins BASE in the archived identity law. Moving a clone's
        # main cannot exercise this guard anymore; tamper only that pin instead.
        def edit(wt):
            p = os.path.join(wt, "tools", "render", "d621", "law", "identity_law_621.json")
            law = json.load(open(p))
            law["base"]["commit"] = base
            law["base"]["tree"] = git("rev-parse", base + "^{tree}")
            open(p, "w").write(json.dumps(law, indent=2) + "\n")
        c = scratch_commit(base, edit)
        rc, out, outdir, gate, dt = build(c)
        rs = reasons_of(gate)
        ok = rc != 0 and any("same table.js" in x or "HEAD-as-BASE" in x for x in rs)
        rec(1, "HEAD as BASE (scratch law pins the same table bytes)", ok, f"exit {rc}; {'; '.join(rs)[:300] or out[-300:]} ({dt}s)")
    if only is None or 2 in only:
        def edit(wt):
            p = os.path.join(wt, "tools", "render", "d621", "law", "plan_law_621.json"); law = json.load(open(p))
            for row in law["rows"]:
                if row["row"] == "c": row["thr"] = 0.99
            open(p, "w").write(json.dumps(law, indent=2) + "\n")
        c = scratch_commit(base, edit)
        rc, o, outdir, gate, dt = build(c)
        rs = reasons_of(gate); nplan = sum(1 for r in rs if r.startswith("plan_") and "_c" in r)
        ok = rc != 0 and nplan > 0
        rec(2, "tampered threshold (row c thr 0.99 in the archive)", ok, f"exit {rc}; {nplan} plan c rows FAIL against the archive's law ({dt}s)" + ("" if gate else f"; build tail: {o[-200:]}"))
    if only is None or 3 in only:
        def edit(wt):
            p = os.path.join(wt, "tools", "render", "d621", "law", "model_manifest_621.json"); m = json.load(open(p))
            m["files"][0]["sha256"] = "0" * 64; m["set_sha256"] = "1" * 64
            open(p, "w").write(json.dumps(m, indent=1) + "\n")
        c = scratch_commit(base, edit)
        rc, o, outdir, gate, dt = build(c)
        rs = reasons_of(gate)
        ok = rc != 0 and any("manifest" in r for r in rs)
        rec(3, "tampered purchased-model manifest", ok, f"exit {rc}; {'; '.join(r for r in rs if 'manifest' in r)[:200]} ({dt}s)" + ("" if gate else f"; build tail: {o[-200:]}"))
    if only is None or 4 in only:
        def edit(wt):
            p = os.path.join(wt, "tools", "render", "d621", "plan", "planlib_621.py"); src = open(p).read()
            # the tampered helper returns a correctly-shaped EMPTY mask (every ring/cushion section measures as nothing): the rows
            # then read 0 area, no arm, IoU 0 — a wrong measurement, not a crash — and the gate must FAIL on the plan rows
            src += ("\n\n_arm_orig_mask_of = mask_of\n\ndef mask_of(segs, win=WIN, res=RES, join_arcs=False):\n"
                    "    r = _arm_orig_mask_of(segs, win, res, join_arcs)   # ARM: measurement helper tampered — the mask is emptied, the rest untouched\n"
                    "    if isinstance(r, tuple):\n        return (np.zeros_like(r[0]),) + tuple(r[1:])\n    return np.zeros_like(r)\n")
            open(p, "w").write(src)
        c = scratch_commit(base, edit)
        rc, o, outdir, gate, dt = build(c)
        rs = reasons_of(gate); nplan = sum(1 for r in rs if r.startswith("plan_"))
        ok = rc != 0 and nplan > 0
        rec(4, "tampered PLAN measurement helper (mask_of empty)", ok, f"exit {rc}; {nplan} plan rows FAIL ({dt}s)" + ("" if gate else f"; build tail: {o[-200:]}"))
    if only is None or 5 in only:
        def edit(wt):
            p = os.path.join(wt, "web", "scene", "table.js")
            source = open(p).read()
            before = 'noseR: diamondProAmNoseSource.DIAMOND_PROAM_NOSE_LEAF.value_mm / 1000,'
            after = "noseR: 0.004, // DERIVED ARM 5: restore the rejected four-mm radius."
            if source.count(before) != 1:
                raise RuntimeError("arm 5 requires exactly one ordered entry radius; no broad replacement")
            open(p, "w").write(source.replace(before, after))
        c = scratch_commit(base, edit)
        rc, out, outdir, gate, dt = build(c)
        row = next((row for row in (gate or {}).get("targets", []) if row["key"] == "cushion_e"), None)
        ok = rc != 0 and row is not None and row.get("pass") is False and row.get("n") == 144
        rec(5, "O22 four-mm nose radius through the real archive entry", ok,
            f"scratch {c}; exit {rc}; cushion_e {row}; out {outdir}; {dt}s" + ("" if gate else f"; build tail: {out[-300:]}"))
    if only is None or 6 in only:
        empty = tempfile.mkdtemp(prefix="d621-arm6-nowasm-")
        try:
            rc, o, outdir, gate, dt = build(base, env={"D621_WASM_OVERLAY": empty})
            no_dump = not (outdir and os.path.exists(os.path.join(outdir, "dump.log")))
            ok = rc == 4 and "WASM_OVERLAY_MISSING" in o and no_dump and gate is None
            rec(6, "wasm overlay missing (empty D621_WASM_OVERLAY)", ok, f"exit {rc}; named {'yes' if 'WASM_OVERLAY_MISSING' in o else 'NO'}; dump.log absent {no_dump}; gate absent {gate is None} ({dt}s)")
        finally: shutil.rmtree(empty, ignore_errors=True)
    if only is None or 7 in only:
        wrong = tempfile.mkdtemp(prefix="d621-arm7-wrongwasm-")
        try:
            open(os.path.join(wrong, "pool_wasm_bg.wasm"), "wb").write(git("show", f"{base}:web/dist/pool-wasm/pool_wasm_bg.wasm", binary=True))
            rc, o, outdir, gate, dt = build(base, env={"D621_WASM_OVERLAY": wrong})
            no_dump = not (outdir and os.path.exists(os.path.join(outdir, "dump.log")))
            ok = rc == 5 and "WASM_PIN_MISMATCH" in o and no_dump and gate is None
            rec(7, "wasm pin mismatch (the archive's own canonical wasm posing as the overlay)", ok, f"exit {rc}; named {'yes' if 'WASM_PIN_MISMATCH' in o else 'NO'}; dump.log absent {no_dump}; gate absent {gate is None} ({dt}s)")
        finally: shutil.rmtree(wrong, ignore_errors=True)
    if only is None or 8 in only:
        def edit(wt):
            p = os.path.join(wt, "web", "scene", "table.js")
            source = open(p).read()
            before = ("    populate(G);\n"
                      "    // boot build: the boot bake (main.js, after buildTable) records THIS\n")
            after = ("    populate(G);\n"
                     "    if (built.id === 'predator_apex_9ft') group.traverse((o) => { // DERIVED ARM 8: NORMALS-ONLY leak on a NON-target table (positions / materials / names / visibility untouched)\n"
                     "      const n = o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.normal;\n"
                     "      if (n && n.count > 0) { n.setX(0, n.getX(0) + 0.05); n.needsUpdate = true; }\n"
                     "    });\n"
                     "    // boot build: the boot bake (main.js, after buildTable) records THIS\n")
            if source.count(before) != 1:
                raise RuntimeError("arm 8 requires exactly one boot-build block in buildTable; no broad replacement")
            open(p, "w").write(source.replace(before, after))
        c = scratch_commit(base, edit)
        rc, out, outdir, gate, dt = build(c)
        row = next((row for row in (gate or {}).get("targets", []) if row["key"] == "identity_predator_apex_9ft"), None)
        reason = str((row or {}).get("reason", ""))
        ok = rc != 0 and row is not None and row.get("pass") is False and "attributes" in reason and "geometry" not in reason and "materials" not in reason
        rec(8, "normals-only leak on a non-target table (widened identity capture /3)", ok,
            f"scratch {c}; exit {rc}; identity_predator_apex_9ft {reason or row}; {dt}s" + ("" if gate else f"; build tail: {out[-300:]}"))
    all_ok = all(ok for _, _, ok, _ in results) and (baseline_result is None or baseline_result["behaves"])
    if RECORD_DIR:
        with open(os.path.join(RECORD_DIR, "arms.json"), "w") as stream:
            json.dump(dict(commit=base, results=[dict(arm=n, name=name, behaves=ok, detail=detail)
                          for n, name, ok, detail in results], all_behave=all_ok, baseline_red=baseline_result,
                           builds=BUILD_RECORDS), stream, indent=2)
    print(f"[arms] {'every arm behaves (negative arms exit non-zero with the named reason)' if all_ok else 'AN ARM IS OPEN'}")
    return 0 if all_ok else 3


if __name__ == "__main__":
    sys.exit(main())
