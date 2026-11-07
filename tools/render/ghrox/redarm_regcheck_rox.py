#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Red-arm harness for regcheck_rox.py (ADR-0009: a green gate that cannot show its red is not
trusted).

regcheck_rox.py recovers station values from the purchased-model study renders and compares them
with the canonical JSON.  It reports every row and every structural check green, which is only
worth something if a wrong record would have made it say otherwise.  This mutates a COPY of the
record one leaf at a time and asserts regcheck turns the ROWS THAT LEAF FEEDS red — not merely
that it exits non-zero, because a checker can fail for the wrong reason and still look alive.

This found a real hole on its first run: RB-09b.abs_y_centre_mm could be moved 25 mm and regcheck
stayed green, because that leaf only positioned the scan band and was never itself compared.  The
sight-row rows in regcheck exist because of this harness.

Later rounds added arms for the rest of that class and for the ways regcheck could look at a
mismatch and say nothing:

  * EN-06.bed_top_z was the second band-positioning-only leaf, and CU-11.global_max_above_bed_mm
    is the published stand-off the new bed row leans on, so both are mutated here.
  * EN-06.table_envelope.z[0] is the leaf the floor row is now bound to (it used to be compared
    against a code literal under the name of a prose leaf).
  * RB-03m.long_mm is mutated by the 47 mm gap between the two detected rail lines as well as by
    8 mm.  That is the exact value the old nearest-neighbour binding could absorb: the published
    nose re-snapped onto the cap line and regcheck printed full marks.  It has to stay red.
  * RB-09b.long_rails.x_mm is mutated far enough to walk a sight out of the plan_sights crop.
    That used to delete its row in silence; it must now fail the row-count check AND leave the
    real mark in the pixels unaccounted for.

Structural checks print the same "<-- OUT" marker as measurement rows, so `run` below sees them
without knowing the difference.

Needs the quarantined study renders, so it is a bench check, not a CI gate:
  python3 tools/render/ghrox/redarm_regcheck_rox.py
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
SRC = ROOT / "docs/geometry/rasson-ox-9ft-table-definition.json"
CHK = Path(__file__).resolve().with_name("regcheck_rox.py")


def leaf(doc: dict, fid: str) -> dict:
    """The value block of one feature.  EN-06 and RB-03m carry `value_mm`, RB-09b carries
    `value`; the schema is not uniform and pretending otherwise is how the first attempt at this
    harness died on a KeyError."""
    f = next(x for x in doc["features"] if x["id"] == fid)
    return f["value_mm"] if "value_mm" in f else f["value"]


# each entry: mutation -> EVERY row it should redden, named.  A leaf can feed more than one row
# (the rail outer edge is the datum the cap face and the nose are measured back from), and a
# mutation that reddens a row it does not feed is as much a defect as one that reddens nothing.
MUTATIONS = [
    ("EN-06 length +9 mm", "EN-06",
     lambda v: v.__setitem__("length", v["length"] + 9), ("body length",)),
    ("EN-06 width -7 mm", "EN-06",
     lambda v: v.__setitem__("width", v["width"] - 7), ("body width",)),
    ("EN-06 height -6 mm", "EN-06",
     lambda v: v.__setitem__("height", v["height"] - 6), ("rail cap top z",)),
    ("EN-06 envelope +X -5 mm", "EN-06",
     lambda v: v["table_envelope"]["x"].__setitem__(1, v["table_envelope"]["x"][1] - 5),
     ("body envelope +X",)),
    ("EN-06 envelope +Y +4 mm", "EN-06",
     lambda v: v["table_envelope"]["y"].__setitem__(1, v["table_envelope"]["y"][1] + 4),
     ("body envelope +Y",)),
    ("RB-09b sight x +4 mm", "RB-09b",
     lambda v: v["long_rails"].__setitem__(
         "x_mm", [x + (4 if x > 0 else -4) for x in v["long_rails"]["x_mm"]]), ("sight at",)),
    ("RB-09b pitch +5 mm", "RB-09b",
     lambda v: v["long_rails"].__setitem__(
         "pitch_mean_mm", v["long_rails"]["pitch_mean_mm"] + 5), ("pitch",)),
    ("RB-09b sight row +25 mm", "RB-09b",
     lambda v: v["long_rails"].__setitem__(
         "abs_y_centre_mm", v["long_rails"]["abs_y_centre_mm"] + 25), ("sight row centre",)),
    ("RB-09b sight row -4 mm", "RB-09b",
     lambda v: v["long_rails"].__setitem__(
         "abs_y_centre_mm", v["long_rails"]["abs_y_centre_mm"] - 4), ("sight row centre",)),
    ("RB-03m rail width -8 mm", "RB-03m",
     lambda v: v.__setitem__("long_mm", v["long_mm"] - 8), ("rail band",)),
    ("RB-03m cap inner face +6 mm", "RB-03m",
     lambda v: v["cap_width_inner_face_to_outer_edge_mm"].__setitem__(
         "long", v["cap_width_inner_face_to_outer_edge_mm"]["long"] + 6), ("rail cap inner face",)),
    ("RB-03m rail outer edge +4 mm", "RB-03m",
     lambda v: v["outer_edge_u"].__setitem__("long", v["outer_edge_u"]["long"] + 4),
     ("rail outer edge", "rail cap inner face", "rail band inner")),
    # the re-snap arm: -47 mm is the spacing between the two full-width lines plan_sights detects,
    # i.e. the one error a nearest-neighbour binding cannot see because the published nose simply
    # lands on the cap line instead.  Order binding has to keep it red.
    ("RB-03m rail width -47 mm (line gap)", "RB-03m",
     lambda v: v.__setitem__("long_mm", v["long_mm"] - 47), ("rail band",)),
    ("EN-06 bed top z +7 mm", "EN-06",
     lambda v: v.__setitem__("bed_top_z", v["bed_top_z"] + 7), ("bed top z",)),
    ("CU-11 global max above bed +7", "CU-11",
     lambda v: v.__setitem__("global_max_above_bed_mm", v["global_max_above_bed_mm"] + 7),
     ("bed top z",)),
    ("EN-06 envelope z floor +5 mm", "EN-06",
     lambda v: v["table_envelope"]["z"].__setitem__(0, v["table_envelope"]["z"][0] + 5),
     ("floor contact z",)),
    # walk the outermost long-rail sight out of the crop.  The rows for the two that remain stay
    # green, which is the point: the only thing that can catch this is the row count against the
    # record, plus the real mark still sitting in the pixels with nothing published at that x.
    ("RB-09b outer sight out of frame", "RB-09b",
     lambda v: v["long_rails"]["x_mm"].__setitem__(-1, 1400.0),
     ("sights inside the crop", "a row for every sight", "accounted for")),
]


def run(path: str) -> tuple[int, list[str]]:
    r = subprocess.run([sys.executable, str(CHK), "--input", path],
                       capture_output=True, text=True)
    return r.returncode, [ln for ln in r.stdout.splitlines() if "<-- OUT" in ln]


def main() -> int:
    base = json.loads(SRC.read_text(encoding="utf-8"))
    code, out = run(str(SRC))
    if code != 0:
        print("BAD  baseline is already red — nothing this harness says afterwards means anything")
        for ln in out:
            print("    ", ln.strip())
        return 1
    print("OK  baseline: every row within tolerance\n")

    results = []
    with tempfile.TemporaryDirectory() as td:
        for name, fid, mutate, expect in MUTATIONS:
            doc = copy.deepcopy(base)
            mutate(leaf(doc, fid))
            path = os.path.join(td, "mutated.json")
            Path(path).write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
            code, out = run(path)
            hit = [ln for ln in out if any(e in ln for e in expect)]
            # killed only if the RIGHT rows went red, and all of them: a checker that fails
            # everything on any edit is as useless as one that fails nothing, and one that
            # reddens two of the three rows a leaf feeds still has a hole in the third.
            covered = all(any(e in ln for ln in out) for e in expect)
            ok = code != 0 and len(hit) == len(out) and covered
            results.append((bool(ok), name, expect, len(out), len(hit)))

    for ok, name, expect, n_out, n_hit in results:
        print(f"{'OK ' if ok else 'BAD'} {name:30s} -> {n_out} row(s) red, {n_hit} of them "
              f"expected ({', '.join(expect)})")
    good = sum(1 for r in results if r[0])
    print(f"\nred-arm: {good}/{len(results)} mutations reddened exactly the rows they feed")
    return 0 if good == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
