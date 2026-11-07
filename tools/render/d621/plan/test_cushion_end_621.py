# Copyright (c) Meta Platforms, Inc. and affiliates.

"""C9 measurement/binding arms; synthetic shapes, no purchased mesh fixtures."""
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
import pytest

import cushion_end_source_621 as source
from plan_gate_621 import facing_error, initial_facing_from_trace


class SourceArms(unittest.TestCase):
    def test_writer_refuses_occupied_and_duplicated_feature_keys(self):
        entry = dict(id="CU-14", name="Corner cushion terminal return")
        for features in ([dict(id="CU-14", name="Another measured dimension")], [entry, entry]):
            with self.assertRaises(ValueError):
                source.put_leaf(dict(features=features), entry)

    def test_two_line_fit_recovers_both_angles_and_a_data_chosen_hinge(self):
        # TESSELLATION: synthetic slopes and samples, not renderer dimensions.
        x = np.arange(0., 60., .25)
        y = 90 - 1.4*x + .6*np.maximum(x-30., 0)
        fit = source.fit_return(np.c_[x, y])
        self.assertAlmostEqual(fit["front_face_deg"], np.degrees(np.arctan(1.4)))
        self.assertAlmostEqual(fit["terminal_face_deg"], np.degrees(np.arctan(.8)))
        self.assertEqual(fit["hinge_depth_mm"], 30.)
        self.assertLess(fit["rms_mm"], 1e-10)

    def test_missing_or_duplicated_corner_end_cannot_supply_a_leaf(self):
        record = json.loads((source.ROOT/source.RECEIPT).read_text())
        for rows in (record["records"][:-1], [record["records"][0]]*8):
            with self.assertRaisesRegex(ValueError, "eight distinct"):
                source.value_from_receipt({**record, "records": rows})

    def test_all_definitions_and_renderer_are_bound_to_the_measured_leaf(self):
        self.assertEqual(source.check_binding()["status"], "BOUND")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = [source.RECEIPT, source.INSTRUMENT, source.TABLE] + [
                f"docs/geometry/diamond-proam-{size}-table-definition.json" for size in source.SIZES]
            for rel in paths:
                target = root/rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((source.ROOT/rel).read_bytes())
            for rel in paths[3:]:
                original = (root/rel).read_bytes()
                data = json.loads(original)
                row = next(f for f in data["features"] if f["id"] == "CU-14")
                row["value"]["terminal_face_deg"] += 1
                (root/rel).write_text(json.dumps(data))
                with self.assertRaisesRegex(ValueError, "CU-14 differs"):
                    source.check_binding(root)
                (root/rel).write_bytes(original)
            table = root/source.TABLE
            table.write_text(table.read_text().replace('"terminal_face_deg":', '"unbound_angle":'))
            with self.assertRaisesRegex(ValueError, "renderer CU-14 differs"):
                source.check_binding(root)

    def test_facing_thickness_is_explicitly_unresolved_and_not_consumed(self):
        record = json.loads((source.ROOT/source.RECEIPT).read_text())
        self.assertEqual(record["facing_thickness"]["status"], "UNRESOLVED")
        self.assertFalse(record["provenance"]["modifier_applied"])
        self.assertEqual(set(source.value_from_receipt(record)), {"terminal_face_deg", "end_lateral_mm"})


class FacingArms(unittest.TestCase):
    def trace(self, angle=51., return_count=30):
        # TESSELLATION: a circular jaw, short straight face, then a different
        # terminal plane. The short face is below the retired 10 mm selector.
        theta = np.radians(np.linspace(0, 39, 7))
        arc = np.c_[100-21*np.sin(theta), 21*(1-np.cos(theta))]
        end = arc[-1]+[-4*np.tan(np.radians(angle)), 4]
        depths = np.linspace(0, 35, return_count+1)[1:]
        tail = end + np.c_[-.8*depths, depths]
        return np.vstack([arc, end, tail])

    def test_short_initial_face_survives_arbitrary_terminal_triangle_density(self):
        for count in (2, 10, 200):
            self.assertAlmostEqual(initial_facing_from_trace(self.trace(return_count=count)), 51., places=6)

    def test_wrong_initial_angle_fires_even_with_a_correct_terminal_return(self):
        for angle in (45., 57.):
            measured = initial_facing_from_trace(self.trace(angle))
            self.assertAlmostEqual(measured, angle, places=6)
            self.assertGreater(abs(measured-51.), 1.)

    def test_translation_does_not_select_another_plane(self):
        for offset in ([0, 0], [1152, 576], [-2000, -3000]):
            self.assertAlmostEqual(initial_facing_from_trace(self.trace()+offset), 51., places=6)

    def test_unresolved_or_missing_jaw_does_not_fall_back_to_a_later_angle(self):
        self.assertIsNone(initial_facing_from_trace(np.array([[0, 0], [1, 1]])))
        self.assertIsNone(initial_facing_from_trace(np.c_[np.arange(8), np.arange(8)]))

    def test_one_valid_facing_arm_cannot_hide_a_missing_or_nonfinite_mate(self):
        # DERIVED: the standing two-arm kernel angle check must fail closed.
        good = {"facing_angle_deg": 51.}
        self.assertEqual(facing_error({"w-": good, "w+": good}, 51.), 0)
        for bad in (None, {}, {"facing_angle_deg": None}, {"facing_angle_deg": float("nan")}):
            for side in ("w-", "w+"):
                arms = {"w-": good, "w+": good, side: bad}
                self.assertIsNone(facing_error(arms, 51.))
        self.assertIsNone(facing_error({"w-": good}, 51.))


class OpeningArms(unittest.TestCase):
    def setUp(self):
        # DERIVED: minimum dependency version for the vectorized section API.
        pytest.importorskip("shapely", minversion="2.0",
            reason="C9 cushion-end section arms require optional Shapely >= 2; see plan/README.md")
        import cushion_end_overlay_621 as overlay
        self.overlay = overlay

    def test_finite_u_opening_keeps_arm_tips_and_excludes_inboard_cloth(self):
        from planlib_621 import PocketFrame
        from test_corner_overlay_621 import walls
        # DERIVED: extruded U, with front at u=0, inner back at u=10.
        loop = [(0,-8), (15,-8), (15,8), (0,8), (0,5), (10,5), (10,-5), (0,-5)]
        for corners in (loop, loop[::-1]):
            opening, _ = self.overlay.inner_opening(walls([corners]), .5,
                PocketFrame("side", (0,0), (1,0)))
            values = self.overlay.signed_distance(opening, [[5,0], [-1,0], [5,6], [10,0]])
            np.testing.assert_allclose(values, [5,-1,-1,0])

    def test_all_vertex_heights_are_measured_and_an_inward_vertex_fires(self):
        from planlib_621 import PocketFrame
        from test_corner_overlay_621 import walls
        cover = walls([[(0,-8), (15,-8), (15,8), (0,8), (0,5), (10,5), (10,-5), (0,-5)]])
        rubber = dict(name="synthetic cushion", V=np.array([[-2,0,.2], [-1,0,.8]]))
        frame = PocketFrame("side", (0,0), (1,0))
        good = self.overlay.measure_vertices([rubber], cover, frame)
        self.assertEqual(good["vertex_count"], 2)
        self.assertEqual(good["height_count"], 2)
        self.assertEqual(good["maximum"]["metric_mm"], -1.)
        rubber["V"][0,0] = 5
        bad = self.overlay.measure_vertices([rubber], cover, frame)
        self.assertEqual(bad["maximum"]["metric_mm"], 5.)
        self.assertEqual(bad["maximum"]["z_mm"], .2)

    def test_missing_cover_section_is_not_a_zero_protrusion_result(self):
        from planlib_621 import PocketFrame
        from test_corner_overlay_621 import walls
        mesh = walls([[(0,0),(1,0),(1,1),(0,1)]])
        with self.assertRaisesRegex(ValueError, "unresolved cover"):
            self.overlay.inner_opening(mesh, 2., PocketFrame("side", (0,0), (1,0)))


if __name__ == "__main__":
    unittest.main()
