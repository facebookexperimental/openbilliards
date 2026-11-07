#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Fresh archive-only pre-O22 letters invariance arm; no result-file input.

Run the old and corrected instruments against the same archived pre-O22 web
tree at all three sizes. Compare every existing numeric letter/identity, not
just the two corrected rows. Original reds stay red. This named method arm
does not renumber radius arm 5 or the lane's overlay arms 6/7.
"""
import sys
sys.dont_write_bytecode = True
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "tools/render/d621/card"))
from o22_auxiliary_621 import command, overlay_web, sha


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("repo", "old-archive", "baseline-web", "out"):
        parser.add_argument("--" + name, type=Path, required=True)
    args = parser.parse_args(argv)
    old, baseline, output = args.old_archive.resolve(), args.baseline_web.resolve(), args.out.resolve()
    if (ROOT / ".git").exists() or (old / ".git").exists() or (baseline.parent / ".git").exists():
        parser.error("all instruments and served sources must be git archives")
    if output.exists() or str(output).startswith(("/tmp/", "/private/tmp/")):
        parser.error("use a new durable output directory")
    pin = json.loads((ROOT / "tools/render/d621/law/cushion_fence_621.json").read_text())
    if sha(baseline / "scene/table.js") != pin["entry_snapshot"]["source_table_js_sha256"]:
        parser.error("the served baseline is not the complete pre-O22 renderer")
    # DERIVED: immutable checkpoint before the newly approved sampling change.
    old_commit = "1f3f52724a32da15b113678508dd36b691fdd3a9"
    instrument = "tools/render/asmodeled-drawings-488d.mjs"
    old_bytes = subprocess.run(["git", "-C", str(args.repo), "show", old_commit + ":" + instrument],
                               capture_output=True, check=True).stdout
    if (old / instrument).read_bytes() != old_bytes:
        parser.error("old instrument is not the explicitly recorded pre-method checkpoint")
    if os.environ.get("OB_E2E_PORT") != "9400" or os.environ.get("OB_E2E_CDP_PORT") != "9415":
        parser.error("use the ordered single-Chrome lane band")
    wl = json.loads((ROOT / "tools/render/d621/law/identity_law_621.json").read_text())["wasm"]
    overlay = Path(os.environ["D621_WASM_OVERLAY"]).resolve()
    if wl["mode"] != "overlay" or sha(overlay / "pool_wasm_bg.wasm") != wl["pool_wasm_bg_sha256"]:
        parser.error("the unchanged external WASM pin did not bind")
    output.mkdir(parents=True)
    staging = Path(tempfile.mkdtemp(prefix="letters-arm-"))
    web = overlay_web(baseline, staging / "baseline-web", overlay)
    result = dict(tool="letters_method_arm_621", old_commit=old_commit, old_archive=str(old),
                  new_archive=str(ROOT), baseline_commit=pin["source_commit"], baseline_web=str(baseline),
                  served_web=str(web), baseline_renderer_sha256=sha(web / "scene/table.js"),
                  old_instrument_sha256=sha(old / instrument), new_instrument_sha256=sha(ROOT / instrument),
                  law_sha256=sha(ROOT / "tools/render/d621/law/letters_law_621.json"),
                  wasm_sha256=wl["pool_wasm_bg_sha256"], commands=[], sizes={}, behaves=False)
    for size in ("9ft", "8ft", "7ft"):
        captures = {}
        for label, archive in (("old", old), ("new", ROOT)):
            name = f"{label}-{size}"
            # DERIVED: ungraded captures retain pre-O22 geometry's existing reds;
            # the arm decides invariance, never whether that old geometry passes.
            result["commands"].append(command(["node", archive / instrument, "--table", "diamond_proam_" + size,
                                               "--web", web, "--out", output / name], output, name))
            captures[label] = json.loads((output / name / "letters-compare-488d.json").read_text())
        before, after = captures["old"], captures["new"]
        # DERIVED: preserve the full standing 79-letter / 12-identity census.
        complete = all(len(value["rows"]) == 79 and len(value["identities"]) == 12 for value in captures.values())
        fields = ("letter", "feature", "spec", "as_modeled", "delta", "tol", "pass")
        left = [{key: row[key] for key in fields} for row in before["rows"]]
        right = [{key: row[key] for key in fields} for row in after["rows"]]
        ids = lambda data: [(row["n"], row["status"]) for row in data["identities"]]
        bound = before["spec_sha256"] == after["spec_sha256"]
        secondary = {row["feature"]: row["secondary"] for row in after["rows"] if row.get("secondary")}
        old_rows = {row["feature"]: row for row in before["rows"]}
        secondary_exact = set(secondary) == {"CP-01", "CP-09"} and all(
            all(row[key] == old_rows[feature][key] for key in ("as_modeled", "delta", "tol", "pass"))
            for feature, row in secondary.items())
        result["sizes"][size] = dict(complete=complete, definitions_bound=bound, rows_identical=left == right,
                                     identities_identical=ids(before) == ids(after), secondary_reproduces_old=secondary_exact,
                                     old_rows=left, new_rows=right, old_identities=ids(before), new_identities=ids(after),
                                     old_raw=after["sampling_method"]["ours_secondary"], new_raw=after["sampling_method"]["ours"],
                                     note="Identical at the existing published letter precision; unrounded fit values and changed support counts remain recorded.")
        current = result["sizes"][size]
        current["behaves"] = all(current[key] for key in ("complete", "definitions_bound", "rows_identical",
                                                         "identities_identical", "secondary_reproduces_old"))
        (output / "EVIDENCE.json").write_text(json.dumps(result, indent=2) + "\n")  # TESSELLATION: JSON layout.
        print(f"[letters method arm] {size}: {'BEHAVES' if current['behaves'] else 'OPEN'}; full rows {len(left)}, identities {len(ids(before))}", flush=True)
    result["behaves"] = all(value["behaves"] for value in result["sizes"].values())
    (output / "EVIDENCE.json").write_text(json.dumps(result, indent=2) + "\n")
    return 0 if result["behaves"] else 3  # DERIVED: standing gate exit convention.


if __name__ == "__main__":
    sys.exit(main())
