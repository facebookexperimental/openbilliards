#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Numeric-literal provenance census over the Diamond changes in web/scene/table.js (D621-ALIGN-2 B3 proof).

Every numeric literal ADDED since the base commit (default a39f14cd, the last pre-ALIGN tree) must stand next to a
provenance word — MFR, MODEL, DERIVED, CLEARANCE, LIGHTING-DEVICE — on its own line or within the WINDOW preceding
added/context lines of the same hunk (comments count). Epsilons (1e-6 and smaller, comparison tolerances written as
1e-9) and pure code numbers (indices, counts, angles in π fractions, loop steps, colours 0x…) are not geometry and are
skipped. Prints every offender with its diff line; exit 1 if any.
  python3 tools/render/d621/align/literal_census_621.py [--base a39f14cd] [--window 8] [--file web/scene/table.js]
"""
import argparse
import re
import subprocess
import sys

TAG = re.compile(r"\b(MFR|MODEL|DERIVED|CLEARANCE|LIGHTING-DEVICE|epsilon|EPSILON|TESSELLATION)\b")
# geometry-looking literals: decimals (0.0008, 44.68, 1.5) or integers followed by mm/deg context; hex colours excluded
NUM = re.compile(r"(?<![\w.])(?:\d+\.\d+(?:e-?\d+)?|\d+e-?\d+)(?![\w.])")
SKIP_LINE = re.compile(r"^\s*(//|\*|/\*)")  # a comment line's own numbers are prose


def hunks(base, path):
    out = subprocess.run(["git", "diff", "-U0", base, "--", path], capture_output=True, text=True, check=True).stdout
    return out.splitlines()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="a39f14cd")
    ap.add_argument("--file", default="web/scene/table.js")
    ap.add_argument("--window", type=int, default=10)
    a = ap.parse_args()
    lines = hunks(a.base, a.file)
    # reconstruct per-hunk added lines with their new-file line numbers
    offenders, checked, new_ln = [], 0, 0
    recent = []  # rolling window of preceding added lines (text)
    removed_nums = set()  # numbers on the hunk's REMOVED lines: an edited line keeps its legacy literals
    for ln in lines:
        m = re.match(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@", ln)
        if m:
            new_ln = int(m.group(1)) - 1; recent = []; removed_nums = set(); continue
        if ln.startswith("+++") or ln.startswith("---"):
            continue
        if ln.startswith("-"):
            removed_nums |= set(NUM.findall(ln[1:].split("//")[0])); continue
        if ln.startswith("+"):
            new_ln += 1
            text = ln[1:]
            recent.append(text); recent = recent[-a.window:]
            if SKIP_LINE.match(text):
                continue
            code = re.sub(r"Math\.PI\s*[*/]\s*\d+(?:\.\d+)?", "Math.PI", text.split("//")[0])  # angle fractions are not geometry
            nums = [n for n in NUM.findall(code) if not re.fullmatch(r"\d+e-?\d+", n) or float(n) > 1e-6]
            nums = [n for n in nums if abs(float(n)) > 1e-6 and n not in removed_nums]
            if not nums:
                continue
            checked += 1
            ctx = "\n".join(recent)
            if TAG.search(ctx) or TAG.search(text):
                continue
            offenders.append((new_ln, nums, text.strip()))
    for ln, nums, text in offenders:
        print(f"UNTAGGED  {a.file}:{ln}  {nums}  | {text[:120]}")
    print(f"[literal-census] base {a.base}: {checked} added code lines carry geometry-looking literals; {len(offenders)} without a provenance word in the {a.window}-line window")
    return 1 if offenders else 0


if __name__ == "__main__":
    sys.exit(main())
