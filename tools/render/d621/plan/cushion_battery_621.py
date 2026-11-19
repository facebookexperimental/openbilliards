#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The O22 row-l runtime checks, run sequentially from the archive's own tools.

Timing-sensitive suites run with before/after host-load samples disclosed. No
claim of a calm interval is inferred from a loaded machine or from exit zero.
"""
import sys
sys.dont_write_bytecode = True
import json
import os
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[4]


def run(head_web, output):
    from cushion_gate_621 import LAW_PATH, add_boolean, sha
    law = json.loads(LAW_PATH.read_text())
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, OB_PROFILE_SWEEP="0", OB_SKIP_TREE_PREFLIGHT="1")
    rows, records = [], []
    commands = [
        ("cue", ["node", "tools/render/check-cue-clearance.mjs"]),
        ("liveswitch", ["node", "tools/render/liveswitch-628.mjs", "--web", head_web, "--out", str(output / "liveswitch")]),
        ("e2e628", ["node", "tools/render/d621/plan/e2e_cushion_628_3.mjs", "--web", head_web, "--out", str(output / "e2e628.json")]),
    ]
    for key, command in commands:
        started = time.time()
        before = os.getloadavg()
        print(f"[cushion battery] {key}; load={before}; timing under load disclosed", flush=True)
        process = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True)
        after = os.getloadavg()
        log = output / (key + ".log")
        log.write_text(f"load before={before}; after={after}; timing under load disclosed\n" + process.stdout + process.stderr)
        passed = process.returncode == 0
        detail = dict(command=command, exit_code=process.returncode, log=str(log), log_sha256=sha(log),
                      seconds=time.time() - started, load_average=dict(before=before, after=after))
        if key == "cue":
            passed = passed and "check-cue-clearance: all cases OK" in process.stdout
        elif key == "liveswitch":
            result_path = output / "liveswitch/liveswitch-628.json"
            result = json.loads(result_path.read_text()) if result_path.exists() else {}
            checks = result.get("results") or []
            passed = passed and result.get("pass") is True and len(checks) == law["battery"]["liveswitch_assertions"] and all(
                check.get("ok") is True for check in checks)
            detail.update(assertions=len(checks), passed=sum(check.get("ok") is True for check in checks))
        else:
            result_path = output / "e2e628.json"
            result = json.loads(result_path.read_text()) if result_path.exists() else {}
            passed = passed and result.get("pass") is True and {table["table"] for table in result.get("tables", [])} == {
                "diamond_proam_" + size for size in law["sizes"]}
            detail["source_sha256"] = result.get("source_sha256")
            detail["executed_block_sha256"] = result.get("executed_block_sha256")
        add_boolean(rows, "l_" + key, "archive runtime battery " + key, passed,
                    f"exit {process.returncode}; load before={before}; after={after}; {log}")
        records.append(detail)
    return dict(rows=rows, records=records, timing_policy="runs under disclosed host load; no calm-window claim")
