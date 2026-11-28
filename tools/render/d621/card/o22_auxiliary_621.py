#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Archive-only supplementary identity or register evidence, never an owner-card entry.

Bind both archived web trees to the already-pinned external overlay. The small
disposable serving trees contain symlinks only, never a copied/rebuilt wasm.
Every command and capture completion records host load in durable output.
"""
import sys
sys.dont_write_bytecode = True
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[4]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def overlay_web(source, destination, overlay):
    destination.mkdir()
    for item in source.iterdir():
        if item.name != "dist":
            (destination / item.name).symlink_to(item, target_is_directory=item.is_dir())
    (destination / "dist").mkdir()
    for item in (source / "dist").iterdir():
        target = overlay if item.name == "pool-wasm" else item
        (destination / "dist" / item.name).symlink_to(target, target_is_directory=target.is_dir())
    return destination


def command(args, output, name):
    before, started = os.getloadavg(), time.time()
    print(f"[aux] {name}; load={before}", flush=True)
    events = []
    env = dict(os.environ, OB_PROFILE_SWEEP="0", OB_SKIP_TREE_PREFLIGHT="1")
    with (output / (name + ".log")).open("w") as log:
        log.write(f"command={args}\nload before={before}; timing under load disclosed\n")
        process = subprocess.Popen([str(arg) for arg in args], cwd=ROOT, env=env,
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in process.stdout:
            load = os.getloadavg()
            log.write(line)
            if "captured" in line or line.startswith(("[bytes]", "[meshident]")):
                events.append(dict(message=line.rstrip(), load_average=load))
                log.write(f"capture-completion load={load}\n")
                print(line.rstrip(), "load=", load, flush=True)
        code = process.wait()
        after = os.getloadavg()
        log.write(f"exit={code}; load after={after}\n")
    record = dict(command=[str(arg) for arg in args], exit_code=code, seconds=time.time() - started,
                  load_average=dict(before=before, after=after), capture_events=events,
                  log_sha256=sha(output / (name + ".log")))
    (output / (name + ".run.json")).write_text(json.dumps(record, indent=2) + "\n")  # TESSELLATION: JSON layout.
    if code:
        raise RuntimeError(f"{name} failed with exit {code}; see durable log")
    return record


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", required=True, choices=("identity", "registers"))
    parser.add_argument("--baseline-web", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    baseline, output = args.baseline_web.resolve(), args.out.resolve()
    if (ROOT / ".git").exists() or (baseline.parent / ".git").exists():
        parser.error("both inputs must be git archive exports")
    if output.exists():
        parser.error("output already exists; preserve prior evidence")
    if ROOT == output or ROOT in output.parents or str(output).startswith(("/tmp/", "/private/tmp/")):
        parser.error("evidence must be durable and outside the repository/archive")
    pin = json.loads((ROOT / "tools/render/d621/law/cushion_fence_621.json").read_text())
    if sha(baseline / "scene/table.js") != pin["entry_snapshot"]["source_table_js_sha256"]:
        parser.error("baseline table.js is not the ordered starting tree")
    wl = json.loads((ROOT / "tools/render/d621/law/identity_law_621.json").read_text())["wasm"]
    overlay = Path(os.environ["D621_WASM_OVERLAY"]).resolve()
    if wl["mode"] != "overlay" or sha(overlay / "pool_wasm_bg.wasm") != wl["pool_wasm_bg_sha256"]:
        parser.error("external overlay does not reproduce the unchanged law pin")
    if os.environ.get("OB_E2E_PORT") != "9400" or os.environ.get("OB_E2E_CDP_PORT") != "9415":
        parser.error("the ordered lane ports must be explicitly pinned")
    output.mkdir(parents=True)
    staging = Path(tempfile.mkdtemp(prefix="d621-aux-"))
    webs = {"before": overlay_web(baseline, staging / "before-web", overlay),
            "after": overlay_web(ROOT / "web", staging / "after-web", overlay)}
    result = dict(tool="o22_auxiliary_621", mode=args.mode, archive=str(ROOT), baseline_web=str(baseline),
                  baseline_commit=pin["source_commit"], overlay=str(overlay), wasm_sha256=wl["pool_wasm_bg_sha256"],
                  table_js_sha256={side: sha(web / "scene/table.js") for side, web in webs.items()},
                  disposable_symlink_trees={side: str(web) for side, web in webs.items()}, commands=[], verdict="INCOMPLETE")
    result_path = output / "EVIDENCE.json"
    result_path.write_text(json.dumps(result, indent=2) + "\n")  # TESSELLATION: JSON layout.
    targets = {"diamond_proam_" + size for size in ("9ft", "8ft", "7ft")}
    cushion_law = json.loads((ROOT / "tools/render/d621/law/cushion_law_621.json").read_text())
    alias_rule = cushion_law["fence"]["owner_alias"]
    alias = alias_rule["id"]
    expected_differences = targets | {alias}
    tables = list(pin["entry_snapshot"]["entries"])
    controls = [table for table in tables if table not in targets]
    if args.mode == "identity":
        for side, web in webs.items():
            result["commands"].append(command(["node", "tools/render/meshident-488d.mjs", "--web", web,
                "--tables", ",".join(tables), "--out", output / (side + "-identity.json")], output, side + "-identity"))
            result["commands"].append(command(["node", "tools/render/d621/plan/mesh_bytes_621.mjs", "--web", web,
                "--tables", ",".join(controls), "--out", output / (side + "-bytes.json")], output, side + "-bytes"))
        result["commands"].append(command(["node", "tools/render/meshident-488d.mjs", "--compare",
            output / "before-identity.json", output / "after-identity.json", "--expect-differ", ",".join(sorted(expected_differences)),
            "--json-out", output / "identity-verdict.json"], output, "identity-compare"))
        captured = {side: json.loads((output / (side + "-bytes.json")).read_text()) for side in webs}
        before = {row["id"]: row for row in captured["before"]["tables"]}
        after = {row["id"]: row for row in captured["after"]["tables"]}
        if set(before) != set(controls) or set(after) != set(controls):
            raise ValueError("full-byte control census is incomplete")
        result["byte_controls"] = [dict(table=table, before_sha256=before[table]["sha256"],
            after_sha256=after[table]["sha256"], meshes=len(after[table]["meshes"]),
            identical=before[table]["meshes"] == after[table]["meshes"]) for table in controls]
        for row in result["byte_controls"]:
            if row["table"] == alias:
                left, right = before[alias]["meshes"], after[alias]["meshes"]
                same_set = len(left) == len(right) and all(a["name"] == b["name"] for a, b in zip(left, right))
                changed = [b["name"] for a, b in zip(left, right) if a != b]
                fenced = bool(changed) and all(any(name.startswith(family + "-") for family in
                                                  cushion_law["fence"]["changed_mesh_families_subset"]) for name in changed)
                row.update(expected_difference=True, changed_meshes=changed,
                           ruling=alias_rule["ruling"], accepted=same_set and fenced and not row["identical"])
        result["owner_alias_ruling"] = alias_rule
        if not all(row["identical"] or row.get("accepted") is True for row in result["byte_controls"]):
            result["verdict"] = "FAIL"
            result_path.write_text(json.dumps(result, indent=2) + "\n")
            raise ValueError("an unruled non-target geometry buffer or matrix changed")
    else:
        result["commands"].append(command(["node", "--input-type=module", "-e",
            "import {ensureRealThree} from './tools/render/lib/ensure-three.mjs'; ensureRealThree();"], output, "vendored-three-node-alias"))
        for size in ("9ft", "8ft", "7ft"):
            for side, web in webs.items():
                name = f"{side}-{size}"
                result["commands"].append(command(["node", "tools/render/capture-488d-registers.mjs", "--web", web,
                    "--table", "diamond_proam_" + size, "--tag", "o22-" + name, "--out", output / name], output, name))
            result["commands"].append(command(["node", "tools/render/regdiff-628.mjs", "--a", output / ("before-" + size),
                "--b", output / ("after-" + size), "--out", output / ("regdiff-" + size), "--expect", "any"], output, "regdiff-" + size))
            manifests = {side: json.loads((output / (side + "-" + size) / "manifest.json").read_text()) for side in webs}
            if manifests["before"]["poses"] != manifests["after"]["poses"]:
                raise ValueError("before/after register camera poses differ")
            differences = json.loads((output / ("regdiff-" + size) / "regdiff.json").read_text())
            # DERIVED: the standing nine registers at their three crop zooms.
            if len(differences["rows"]) != 27 or any(row.get("error") for row in differences["rows"]):
                raise ValueError("the register/crop census is incomplete")
            if not any(not row["bytesEqual"] for row in differences["rows"]):
                raise ValueError("the intentional profile edit changed no register: blind evidence")
        result["commands"].append(command(["node", "tools/render/selftest-regdiff-628.mjs"], output, "regdiff-selftest"))
    result["verdict"] = "PASS"
    result_path.write_text(json.dumps(result, indent=2) + "\n")  # TESSELLATION: JSON layout.
    print(json.dumps(dict(output=str(output), mode=args.mode, verdict=result["verdict"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
