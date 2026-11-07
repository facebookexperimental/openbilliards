#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Copy a completed archive verdict/dumps to durable storage, never its served trees.

No purchased OBJ, texture, source asset, or wasm is copied. Generated engineering
measurements/plots and our app's captures are the evidence selected here.
"""
import sys
sys.dont_write_bytecode = True
import argparse
import hashlib
import json
from pathlib import Path
import shutil


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    source, destination = args.run.resolve(), args.out.resolve()
    if destination.exists():
        parser.error("durable evidence destination already exists; never overwrite an earlier record")
    verdict_path = source / "gate/gate.json"
    verdict = json.loads(verdict_path.read_text())
    if verdict.get("verdict") not in ("PASS", "FAIL", "PASS-WITH-RULED-RED"):
        parser.error("the archive run has no completed verdict")
    if (verdict.get("verdict") == "PASS-WITH-RULED-RED"
            and verdict.get("ruled_red_rows") != ["cushion_f_p90"]):
        parser.error("the ruled-red verdict lacks the explicitly named FIX1 f row")
    destination.mkdir(parents=True)
    for name in ("gate", "card"):
        if (source / name).is_dir():
            shutil.copytree(source / name, destination / name)
    for name in ("ours-9ft.json", "ours-8ft.json", "ours-7ft.json", "ours-9ft.console.txt", "ours-8ft.console.txt", "ours-7ft.console.txt",
                 "dump.log", "dump-9ft.log", "dump-7ft.log", "topdown.log"):
        if (source / name).is_file():
            shutil.copy2(source / name, destination / name)
    manifest = dict(tool="preserve_evidence_621", archive_run=str(source),
                    head_commit=verdict["provenance"]["head_commit"], verdict=verdict["verdict"],
                    note="Durable generated evidence only; head-tree/base-tree/overlay and source assets deliberately excluded.")
    (destination / "EVIDENCE.json").write_text(json.dumps(manifest, indent=2) + "\n")  # TESSELLATION: JSON layout.
    paths = sorted(path for path in destination.rglob("*") if path.is_file())
    sums = [hashlib.sha256(path.read_bytes()).hexdigest() + "  " + str(path.relative_to(destination)) for path in paths]
    (destination / "SHA256SUMS").write_text("\n".join(sums) + "\n")
    print(json.dumps(dict(manifest, files=len(sums), destination=str(destination)), indent=2))  # TESSELLATION: JSON layout.
    return 0


if __name__ == "__main__":
    sys.exit(main())
