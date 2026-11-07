#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Red-arm harness for gen_drawing_rmagnum.py (ADR-0009: a green gate that cannot show its red is not trusted).

Mutates a COPY of the canonical JSON one field at a time and asserts the generator REFUSES to draw
(non-zero exit AND a NAMED identity in the refusal — a bare traceback does not count) — except for the one mutation marked 'should PASS' (a pure display-precision change
the formatter must follow). Exit 0 only when every mutation behaves as required.

Run:  python3 tools/render/ghrmagnum/redarm_rmagnum.py
"""
from __future__ import annotations

import copy
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "docs/geometry/rasson-magnum2-12ft-table-definition.json"
GEN = Path(__file__).resolve().with_name("gen_drawing_rmagnum.py")


def feature(d: dict, fid: str) -> dict:
    return next(f for f in d["features"] if f["id"] == fid)


MUTATIONS = {
    # review review round 3: a document without `features` must be a NAMED refusal, not a KeyError.
    "features block deleted (must be a named STRUCTURE refusal)": lambda d: d.pop("features"),
    # review review round 5 (P3): schema failures inside feature_map must be NAMED refusals too.
    "duplicate feature id (must be a named STRUCTURE refusal)":
        lambda d: d["features"].append(dict(d["features"][0])),
    # review review round 5: the identities list is matched two-way against the executed families.
    "checks.identities drops the LABEL-EXACT line":
        lambda d: d["checks"].__setitem__("identities", [i for i in d["checks"]["identities"] if not i.startswith("LABEL-EXACT")]),
    "checks.identities gains a bogus family":
        lambda d: d["checks"]["identities"].append("PHANTOM-FAMILY: a family the generator never runs"),
    # review review round 4: a NON-binary inch fraction with a matching label used to pass IMPERIAL-EXACT.
    "CU-06 = 25.4/3 mm labelled '1/3 in' (non-binary fraction)":
        lambda d: (feature(d, "CU-06").__setitem__("value_mm", 25.4 / 3.0),
                   feature(d, "CU-06").__setitem__("published", "1/3 in")),
    "CP-02 76.2 -> 76.3 (kernel radius)": lambda d: feature(d, "CP-02").__setitem__("value_mm", 76.3),
    "runtime_f64_bits width flipped": lambda d: d["kernel_pinning"]["runtime_f64_bits"].__setitem__("width_m", "0x3ffc72b020c49ba7"),
    "PF-01 width 1778 -> 1779": lambda d: feature(d, "PF-01").__setitem__("value_mm", [3569.0, 1779.0]),
    "CU-06 9.525 -> 9.5 (imperial)": lambda d: feature(d, "CU-06").__setitem__("value_mm", 9.5),
    "MP-04 54 -> 58.816 (exactness knob)": lambda d: feature(d, "MP-04").__setitem__("value_deg", 58.816),
    "CU-14 above CU-02 (order)": lambda d: feature(d, "CU-14").__setitem__("value_mm", 37.0),
    "EN-01 length 3838 -> 3840 (envelope)": lambda d: feature(d, "EN-01").__setitem__("value_mm", [3840.0, 2047.0]),
    "CP-05 last digit 128.7297 -> 128.73": lambda d: feature(d, "CP-05").__setitem__("value_deg", 128.73),
    "JSON tolerance loosened + MP-03 53.2": lambda d: (d["kernel_pinning"]["canonical_values_m"].__setitem__("tolerance_m", 1e-3),
                                                      feature(d, "MP-03").__setitem__("value_mm", 53.2)),
    "canonical_values_m corner_r1 edited": lambda d: d["kernel_pinning"]["canonical_values_m"].__setitem__("corner_r1", 0.0763),
    "identities list emptied": lambda d: d["checks"].__setitem__("identities", []),
    "CP-01 scope -> render-only (coverage)": lambda d: feature(d, "CP-01").__setitem__("scope", "render-only"),
    "pinned_commit unknown revision": lambda d: d["kernel_pinning"].__setitem__("pinned_commit", "deadbeef"),
    "CP-08 label 3.313 -> 3.31 (label-exact)": lambda d: feature(d, "CP-08").__setitem__("published", "3.31 in"),
    "displayed_decimals 2 -> 4 (formatter follows; should PASS)": lambda d: d["drafting"].__setitem__("displayed_decimals", 4),
    "status token outside the vocabulary": lambda d: feature(d, "CU-16").__setitem__("status", "DERIVED"),
    "CP-04 junction offset rise 0.72 -> 0.73": lambda d: feature(d, "CP-04")["construction_offsets_in"].__setitem__("rise", 0.73),
    "kernel row CP-02 deleted (structural)": lambda d: d["features"].remove(feature(d, "CP-02")),
    "source.tier removed from CU-04 (structural)": lambda d: feature(d, "CU-04")["source"].pop("tier"),
    "EN-03 bed raised above the rail top (900)": lambda d: feature(d, "EN-03").__setitem__("value_mm", 900.0),
}


# Perturbations of the GENERATOR itself, run from a scratch tree under the system temp dir that mirrors
# the repo layout (crates/, docs/, .git symlinked) — review review round 5: the sheet-wide text-anchor
# guard cannot be exercised by any JSON edit.
CODE_MUTATIONS = {
    "a title-block text anchor is pushed off the sheet":
        ('self.text(34, y0 + 22, f"{d[\'number\']} — {d[\'title\']}", 12, weight="700")',
         'self.text(34, y0 + 2200, f"{d[\'number\']} — {d[\'title\']}", 12, weight="700")'),
}


def run_code_mutation(find: str, repl: str, td: str) -> tuple[bool, bool, str]:
    src = GEN.read_text(encoding="utf-8")
    if src.count(find) != 1:
        return False, False, f"red-arm is stale: {find[:50]!r} appears {src.count(find)} times in the generator"
    tree = Path(td) / "tree"
    (tree / "tools" / "render" / "ghrmagnum").mkdir(parents=True)
    for link in ("crates", "docs", ".git"):
        (tree / link).symlink_to(ROOT / link)
    tmp = tree / "tools" / "render" / "ghrmagnum" / GEN.name
    tmp.write_text(src.replace(find, repl), encoding="utf-8")
    run = subprocess.run([sys.executable, str(tmp), "--output-dir", os.path.join(td, "out-code")],
                         capture_output=True, text=True)
    named = any("identity check FAILED" in ln for ln in run.stderr.splitlines())
    why = [ln for ln in run.stderr.splitlines() if "identity check FAILED" in ln][-1:] or run.stderr.strip().splitlines()[-1:]
    return run.returncode != 0, named, (why[0] if why else "")


def main() -> int:
    base = json.loads(SRC.read_text(encoding="utf-8"))
    results = []
    with tempfile.TemporaryDirectory() as td:
        for name, mutate in MUTATIONS.items():
            doc = copy.deepcopy(base)
            mutate(doc)
            path = os.path.join(td, "mutated.json")
            Path(path).write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
            run = subprocess.run([sys.executable, str(GEN), "--input", path, "--output-dir", os.path.join(td, "out")],
                                 capture_output=True, text=True)
            refused = run.returncode != 0
            expect_pass = "should PASS" in name
            named = any("identity check FAILED" in ln for ln in run.stderr.splitlines())
            # a refusal only counts when it names its identity (no bare tracebacks)
            ok = (not refused) if expect_pass else (refused and named)
            why = [ln for ln in run.stderr.splitlines() if "identity check FAILED" in ln][-1:] or run.stderr.strip().splitlines()[-1:]
            results.append((ok, name, refused, ("" if named or not refused else "UNNAMED: ") + (why[0] if why else "")))
        for name, (find, repl) in CODE_MUTATIONS.items():
            with tempfile.TemporaryDirectory(prefix="rmag-redarm-code-") as tdc:
                refused, named, why = run_code_mutation(find, repl, tdc)
            results.append((refused and named, f"GEN {name}", refused, ("" if named or not refused else "UNNAMED: ") + why))
    for ok, name, refused, why in results:
        print(f"{'OK ' if ok else 'BAD'} {name:62s} -> {'REFUSED' if refused else 'accepted'}  {why[:120]}")
    good = sum(1 for r in results if r[0])
    print(f"\nred-arm: {good}/{len(results)} mutations behaved as required")
    return 0 if good == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
