#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""C7 source-binding and false-completeness arms; no browser or model copy."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import corner_source_621 as binding
from fit_corner_outline_621 import outline
import numpy as np


class CornerSourceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="d621-corner-source-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        names = [binding.RECEIPT, binding.INSTRUMENT, binding.MODULE, binding.TABLE]
        names += [f"docs/geometry/diamond-proam-{size}-table-definition.json" for size in binding.SIZES]
        for name in names:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes((binding.ROOT / name).read_bytes())

    def edit(self, name, change):
        path = self.root / name
        data = json.loads(path.read_text())
        change(data)
        path.write_text(json.dumps(data))

    def test_current_leaf_binds_all_sizes_and_keeps_the_round_an_estimate(self):
        self.assertEqual(binding.check_binding(self.root)["status"], "BOUND")
        receipt, leaves, _ = binding.load(self.root)
        self.assertEqual(receipt["junction_round"]["tag"], "TESSELLATION")
        values = [leaf["value"] for leaf in leaves.values()]
        self.assertTrue(all(v == values[0] for v in values))
        # MODEL: independent C7 cross-check ranges, not generated module bytes.
        rings = {row["above_bed_mm"]: row for row in values[0]["cap"]["rings"]}
        self.assertAlmostEqual(rings[30]["chamfer_leg_mm"], 76.1, delta=.1)
        self.assertAlmostEqual(rings[20]["chamfer_leg_mm"], 75.6, delta=.1)

    def test_section_selects_outer_support_not_the_longer_inner_diagonal(self):
        # DERIVED: synthetic inner diagonal is longer than the OUTER facet.
        p = np.array([[0,0], [100,0], [100,60], [60,100], [0,100], [90,20], [20,90]], float)
        row, _ = outline(p)
        self.assertAlmostEqual(row["virtual_chamfer_leg_mm"], 40)
        self.assertAlmostEqual(row["facet_leg_mm"], 40)
        self.assertLess(row["facet"]["rms_mm"], 1e-10)

    def test_each_definition_rejects_the_retired_82_5_block_chamfer(self):
        for size in binding.SIZES:
            name = f"docs/geometry/diamond-proam-{size}-table-definition.json"
            original = (self.root / name).read_bytes()
            def change(data):
                leaf = next(f for f in data["features"] if f["id"] == "RC-01")
                for row in leaf["value"]["cap"]["rings"]:
                    row["chamfer_leg_mm"] = 82.5  # DERIVED: rejected former block dimension.
            self.edit(name, change)
            with self.assertRaisesRegex(ValueError, size + " ring dimensions"):
                binding.check_binding(self.root)
            (self.root / name).write_bytes(original)

    def test_four_copies_of_one_corner_do_not_count_as_four_corners(self):
        receipt = json.loads((self.root / binding.RECEIPT).read_text())
        first = receipt["records"][0]
        for row in receipt["records"]:
            if row["family"] == first["family"] and row["z_mm"] == first["z_mm"]:
                row["corner"] = copy.deepcopy(first["corner"])
        with self.assertRaisesRegex(ValueError, "four distinct corners"):
            binding.value_from_receipt(receipt)

    def test_bare_model_smooth_radius_is_rejected(self):
        self.edit(binding.RECEIPT, lambda data: data["junction_round"].update(tag="MODEL"))
        with self.assertRaisesRegex(ValueError, "radius cannot be MODEL"):
            binding.check_binding(self.root)

    def test_forged_modifier_applied_claim_is_rejected(self):
        name = "docs/geometry/diamond-proam-9ft-table-definition.json"
        def change(data):
            next(f for f in data["features"] if f["id"] == "RC-01")["measurement_provenance"]["modifier_applied"] = True
        self.edit(name, change)
        with self.assertRaisesRegex(ValueError, "disclose the ruled cage"):
            binding.check_binding(self.root)

    def test_changed_served_module_is_rejected(self):
        path = self.root / binding.MODULE
        path.write_bytes(path.read_bytes() + b"\n// changed\n")
        with self.assertRaisesRegex(ValueError, "module is stale"):
            binding.check_binding(self.root)

    def test_stale_import_digest_is_rejected(self):
        path = self.root / binding.TABLE
        digest = binding.check_binding(self.root)["module_sha256"]
        path.write_text(path.read_text().replace(digest, "0" * len(digest)))
        with self.assertRaisesRegex(ValueError, "import digest is stale"):
            binding.check_binding(self.root)

    def test_literal_outline_cannot_bypass_the_leaf(self):
        path = self.root / binding.TABLE
        path.write_text(path.read_text().replace(binding.READ, "cornerOutline: {},"))
        with self.assertRaisesRegex(ValueError, "consume the generated RC-01"):
            binding.check_binding(self.root)


if __name__ == "__main__":
    unittest.main()
