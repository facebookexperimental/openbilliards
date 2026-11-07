#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""C4B source substitution and stale served-leaf arms; no purchased geometry."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import nose_source_621 as binding
from cushion_gate_621 import radius_against_source


class NoseSourceBinding(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="d621-nose-source-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        names = [binding.SOURCE_PATH, binding.MODULE_PATH, binding.TABLE_PATH, binding.LAW_PATH]
        names += [f"docs/geometry/diamond-proam-{size}-table-definition.json" for size in binding.SIZES]
        for name in names:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((binding.ROOT / name).read_bytes())

    def edit_json(self, name, change):
        path = self.root / name
        data = json.loads(path.read_text())
        change(data)
        path.write_text(json.dumps(data, ensure_ascii=False))

    def test_current_leaf_uses_the_unscaled_confirmed_source(self):
        source = binding.load_source(self.root)
        result = binding.check_binding(self.root)
        self.assertEqual(result["status"], "BOUND")
        self.assertEqual(result["value_mm"], source["leaf"]["value"]["tip_fillet_R_mm"])
        self.assertNotEqual(result["value_mm"], source["leaf"]["ball_scaled"]["tip_fillet_R_mm"])

    def test_each_size_rejects_a_scaled_radius_even_with_a_model_tag(self):
        wrong = binding.load_source(self.root)["leaf"]["ball_scaled"]["tip_fillet_R_mm"]
        for size in binding.SIZES:
            with self.subTest(size=size):
                name = f"docs/geometry/diamond-proam-{size}-table-definition.json"
                def change(data):
                    next(f for f in data["features"] if f["id"] == "CU-11")["value_mm"] = wrong
                self.edit_json(name, change)
                with self.assertRaisesRegex(ValueError, size + " CU-11"):
                    binding.check_binding(self.root)
                (self.root / name).write_bytes((binding.ROOT / name).read_bytes())

    def test_source_scalar_cannot_be_replaced_behind_the_citation(self):
        def change(data):
            data["leaf"]["value"]["tip_fillet_R_mm"] = data["leaf"]["ball_scaled"]["tip_fillet_R_mm"]
        self.edit_json(binding.SOURCE_PATH, change)
        with self.assertRaisesRegex(ValueError, "leaf digest mismatch"):
            binding.check_binding(self.root)

    def test_receipt_is_bound_independently_of_the_leaf(self):
        self.edit_json(binding.SOURCE_PATH, lambda data: data["record"]["verification"].update(verdict="UNCONFIRMED"))
        with self.assertRaisesRegex(ValueError, "receipt digest mismatch"):
            binding.check_binding(self.root)

    def test_law_target_cannot_drift_from_the_definition(self):
        def change(data):
            data["targets"]["nose_radius_mm"]["value"] += 1  # TESSELLATION: deliberate wrong-target arm.
        self.edit_json(binding.LAW_PATH, change)
        with self.assertRaisesRegex(ValueError, "cushion law radius"):
            binding.check_binding(self.root)

    def test_a_changed_leaf_module_fails_even_when_table_js_is_unchanged(self):
        table = (self.root / binding.TABLE_PATH).read_bytes()
        path = self.root / binding.MODULE_PATH
        path.write_bytes(path.read_bytes() + b"\n// stale or modified leaf\n")
        with self.assertRaisesRegex(ValueError, "served leaf is stale"):
            binding.check_binding(self.root)
        self.assertEqual((self.root / binding.TABLE_PATH).read_bytes(), table)

    def test_import_digest_binds_the_leaf_to_the_f_renderer_digest(self):
        path = self.root / binding.TABLE_PATH
        current = binding.check_binding(self.root)["module"]["sha256"]
        path.write_text(path.read_text().replace("?sha256=" + current, "?sha256=" + "0" * len(current)))
        with self.assertRaisesRegex(ValueError, "import digest is stale"):
            binding.check_binding(self.root)

    def test_a_literal_radius_cannot_bypass_the_leaf(self):
        path = self.root / binding.TABLE_PATH
        path.write_text(path.read_text().replace(binding.RADIUS_READ, "noseR: 0.004,"))  # DERIVED: rejected radius arm.
        with self.assertRaisesRegex(ValueError, "read the generated CU-11 leaf"):
            binding.check_binding(self.root)

    def test_unresolved_fits_are_not_filled_by_the_target(self):
        radius = binding.load_source(self.root)["leaf"]["value"]["tip_fillet_R_mm"]
        measured = dict(circle_fit_status="RESOLVED", circle_radius_mm=radius)
        self.assertEqual(radius_against_source(measured, radius)["error_mm"], 0)
        for change in (dict(circle_fit_status="UNRESOLVED"), dict(circle_radius_mm=None),
                       dict(circle_radius_mm=float("nan"))):
            row = copy.deepcopy(measured)
            row.update(change)
            self.assertEqual(radius_against_source(row, radius)["status"], "UNRESOLVED")
            self.assertIsNone(radius_against_source(row, radius)["error_mm"])
        self.assertIsNone(radius_against_source(measured, None)["error_mm"])

    def test_cage_and_four_mm_radii_do_not_pass_as_the_rasson_source(self):
        radius = binding.load_source(self.root)["leaf"]["value"]["tip_fillet_R_mm"]
        law = json.loads((self.root / binding.LAW_PATH).read_text())
        threshold = next(row["threshold"] for row in law["rows"] if row["key"] == "e")
        old = law["targets"]["nose_radius_mm"]["history"][0]["target"]["value"]
        for wrong in (old, 4.0):  # DERIVED: previous cage value and the existing rejected-radius arm.
            row = radius_against_source(dict(circle_fit_status="RESOLVED", circle_radius_mm=wrong), radius)
            self.assertGreater(row["error_mm"], threshold)


if __name__ == "__main__":
    unittest.main()
