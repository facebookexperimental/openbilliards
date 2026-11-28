#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Deterministic FIX1 measurement tests; generated shapes, no MODEL fixture copy."""
import sys
sys.dont_write_bytecode = True
import copy
import hashlib
import json
import math
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cushion_gate_621 as gate
import nose_facets_621 as nose


class CushionMeasurements(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.law = json.loads(gate.LAW_PATH.read_text())
        cls.precision = cls.law["diagnostics"]["vertex_height_epsilon_mm"]

    def section(self, radius, split=False, faceted=False):
        # TESSELLATION: synthetic circle with exact apex and two tangent faces.
        angles = np.r_[np.linspace(math.pi * .6, math.pi, 41),
                       np.linspace(math.pi, math.pi * 1.3, 31)[1:]]
        points = np.c_[radius + radius * np.cos(angles), radius * np.sin(angles)]
        if faceted:
            points = points[[0, 40, -1]]
        upper_angle, lower_angle = angles[0], angles[-1]
        # TESSELLATION: long synthetic faces define the shoulders by topology.
        upper = points[0] + 20 * np.array([math.sin(upper_angle), -math.cos(upper_angle)])
        lower = points[-1] + 20 * np.array([-math.sin(lower_angle), math.cos(lower_angle)])
        points = np.vstack([upper, points, lower, [80, lower[1]], [80, upper[1]], upper])
        if split:
            expanded = []
            for first, second in zip(points[:-1], points[1:]):
                expanded.extend([first, first + (second - first) / 3])
            points = np.vstack([expanded, points[-1]])
        return np.array(list(zip(points[:-1], points[1:])))

    def test_b_fit_resolves_entry_and_four_mm_arm_without_target_window(self):
        # MODEL-derived nominal / DERIVED rejected historical radius.
        for radius in (self.law["targets"]["nose_radius_mm"]["value"], 4.0):
            result = nose.measure_nose(self.section(radius), self.precision)
            self.assertEqual(result["circle_fit_status"], "RESOLVED")
            self.assertAlmostEqual(result["circle_radius_mm"], radius, places=6)

    def test_model_circle_is_tangent_to_both_faces_through_facet_vertices(self):
        # TESSELLATION: synthetic knife edge with known circumscribing tangent circle.
        for radius in (.5, .8, 4.0):
            result = nose.measure_nose(self.section(radius, faceted=True), self.precision, model=True)
            self.assertEqual(result["circle_fit_status"], "RESOLVED")
            self.assertAlmostEqual(result["circle_radius_mm"], radius, places=6)
            self.assertLessEqual(result["face_tangency_error_mm"], self.precision)
            self.assertLessEqual(result["circle_fit_rms_mm"], self.precision)
            self.assertEqual(result["circle_support_points"], 3)

    def test_triangle_splits_do_not_change_model_facet_vertices(self):
        for radius in (.5, .8, 4.0):  # TESSELLATION: generated radii, not gate constants.
            for model in (True, False):
                first = nose.measure_nose(self.section(radius, faceted=model), self.precision, model=model)
                second = nose.measure_nose(self.section(radius, split=True, faceted=model), self.precision, model=model)
                self.assertEqual(first["circle_fit_status"], "RESOLVED")
                self.assertEqual(second["circle_fit_status"], "RESOLVED")
                if model:
                    self.assertAlmostEqual(first["circle_radius_mm"], second["circle_radius_mm"], places=6)
                else:
                    # CLEARANCE: B intentionally fits raw triangle crossings;
                    # points on a chord lie slightly inside its analytic circle.
                    # TESSELLATION: bound by this synthetic polygon's maximum
                    # chord sagitta, derived from its angular step (not a gate bar).
                    sagitta = radius * (1 - math.cos(math.pi * .4 / 40 / 2))
                    self.assertLessEqual(abs(first["circle_radius_mm"] - second["circle_radius_mm"]), sagitta)

    def test_translation_and_segment_winding_do_not_select_another_target(self):
        # DERIVED: MODEL/OURS frame changes cannot alter the measured radius.
        segments = self.section(.8, faceted=True)
        for shift in ([0, 0], [1152, 770], [-576, 770]):
            for section in (segments, segments[:, ::-1], segments[::-1]):
                result = nose.measure_nose(section + shift, self.precision, model=True)
                self.assertAlmostEqual(result["circle_radius_mm"], .8, places=6)

    def test_two_three_four_collinear_apex_vertices_are_unresolved(self):
        for count in (2, 3, 4):  # DERIVED: explicitly ruled collinear cases.
            points = np.c_[np.arange(count), np.arange(count) * 2]
            result = nose.apex_circle(points, self.precision)
            self.assertEqual(result["circle_fit_status"], "UNRESOLVED")
            self.assertIsNone(result["circle_radius_mm"])

    def test_disconnected_or_missing_section_is_unresolved(self):
        for segments in (np.zeros((0, 2, 2)), self.section(.8)[:-1]):
            result = nose.measure_nose(segments, self.precision, model=True)
            self.assertEqual(result["circle_fit_status"], "UNRESOLVED")

    def test_pair_requires_both_sides_resolved_and_uses_model_not_nominal(self):
        ready = dict(circle_fit_status="RESOLVED", circle_radius_mm=.8)  # TESSELLATION: paired fixture.
        other = dict(circle_fit_status="RESOLVED", circle_radius_mm=.6)
        missing = dict(circle_fit_status="UNRESOLVED", circle_radius_mm=None)
        self.assertAlmostEqual(gate.paired_radius(ready, other)["error_mm"], .2)
        for ours, model in ((ready, missing), (missing, ready), (missing, missing)):
            result = gate.paired_radius(ours, model)
            self.assertEqual(result["status"], "UNRESOLVED")
            self.assertIsNone(result["error_mm"])
        self.assertIsNone(gate.summary([0, math.nan])["max"])

    def test_no_target_derived_window_is_in_the_law(self):
        self.assertNotIn("circle_fit_apex_window_mm", self.law["diagnostics"])
        self.assertIn("shoulder", self.law["diagnostics"]["support_source"])
        self.assertIn("collinear", self.law["measurement_method"]["identifiability"])

    def test_scope_and_secondary_column(self):
        self.assertEqual(self.law["measurement_method"]["deciding_rows"], ["e", "f_p90", "f_max", "j"])
        self.assertIn("non-deciding", self.law["measurement_method"]["secondary"])
        self.assertIn("tangent faces", self.law["measurement_method"]["reason"])

    def test_order_thresholds_and_counts_are_unchanged(self):
        # DERIVED: verbatim ORDER section 4, not a regenerable approval snapshot.
        expected = {"a": (.01, 144), "b": (.05, 144), "c": (.25, 144), "c_rms": (.10, 144),
                    "d": (.3, 144), "e": (.3, 144), "f_p90": (.5, 816), "f_max": (1., 816),
                    "g": (.8, 144), "g_crease": (144, 144), "h_p90": (.3, 3600), "h_max": (.6, 3600),
                    "i_crest": (.02, 144), "i_cap": (.02, 144), "i_step": (.03, 144), "i_front": (.1, 144),
                    "j": (.02, 4032), "k_plan": (66, 66), "k_arms": (.3, 10)}
        self.assertEqual({row["key"]: (row["threshold"], row["n"]) for row in self.law["rows"]}, expected)

    def test_changed_families_and_alias_have_explicit_rulings(self):
        fence = self.law["fence"]
        self.assertCountEqual(fence["changed_mesh_families_subset"],
            ["dm-cushion", "dm-subrail", "dm-bootcollar", "dm-railtop",
             "dm-cornerblock", "dm-shelfshadow", "dm-apronband"])
        self.assertIn("PLAN-1", fence["ruled_identity_delta"]["ruling"])
        self.assertEqual(fence["corner_outline_ruling"]["added_family"], "dm-apronband")
        self.assertIn("C7", fence["corner_outline_ruling"]["ruling"])
        rule = next(v for v in fence.values() if isinstance(v, dict) and "follows" in v)
        self.assertEqual(gate.idmap.current_table_id(rule["id"]), "pool_pro_9ft_measured")
        self.assertEqual(gate.idmap.current_table_id(rule["follows"]), "pool_pro_9ft")
        # GULLY-FIX6: the pin was re-derived, the family subset was not widened, and the ruling names the pin it covers
        gully = fence["gully_ruling"]
        self.assertFalse(gully["families_widened"])
        self.assertIn("NOT widened", gully["ruling"])
        pin_path = gate.ROOT / "tools/render/d621/law/cushion_mesh_fence_621.json"
        self.assertEqual(gully["pin_sha256"], hashlib.sha256(pin_path.read_bytes()).hexdigest())
        pin = json.loads(pin_path.read_text())
        for size, expected in (("9ft", 148), ("8ft", 127), ("7ft", 127)):  # D-3b: + the four aperture reveal liners; D-3e: + the two trough-sill liners (head, foot)
            keys = [mesh["key"] for mesh in pin["dumps"][size]["meshes"]]
            self.assertEqual(len(keys), expected)
            self.assertEqual(len(set(keys)), expected)  # unique names: the fence's same_set needs them
        self.assertCountEqual(gully["carried_digests"], pin["derivation"]["carried"])

    def test_c7_apron_family_passes_but_an_unrelated_mesh_change_fails(self):
        # DERIVED: synthetic before/after bytes exercise the real family fence.
        with tempfile.TemporaryDirectory() as directory, patch.object(gate, "ROOT", Path(directory)):
            path = gate.ROOT / "tools/render/d621/law/cushion_mesh_fence_621.json"
            path.parent.mkdir(parents=True)
            meshes = [dict(name=name, positions=[0,0,0], indices=[0])
                      for name in ("dm-apronband", "dm-cabinet-end-0")]
            digest = hashlib.sha256(np.array([0,0,0], dtype="<f8").tobytes()
                                    + np.array([0], dtype="<u4").tobytes()).hexdigest()
            path.write_text(json.dumps(dict(dumps={"8ft":dict(meshes=[
                dict(key=mesh["name"], geometry_sha256=digest) for mesh in meshes])})))
            meshes[0]["positions"][0] = 1
            rows = []
            gate.mesh_fence({"8ft":dict(meshes=meshes)}, self.law, rows)
            self.assertTrue(rows[0]["pass"])
            meshes[1]["positions"][0] = 1
            rows = []
            gate.mesh_fence({"8ft":dict(meshes=meshes)}, self.law, rows)
            self.assertFalse(rows[0]["pass"])
            self.assertIn("dm-cabinet-end-0", rows[0]["reason"])

    def test_frozen_mfr_crest_and_plateau(self):
        targets = self.law["targets"]
        for depth in (targets["crest_depth_mm"]["value"], targets["cushion_width_mm"]["value"]):
            self.assertEqual(gate.target_trace(depth, self.law), targets["crest_z_mm"]["value"])

    def test_only_active_radius_is_mutated_and_no_shadow_freeze_survives(self):
        source = (gate.ROOT / "web/scene/table.js").read_text()
        needle = 'noseR: diamondProAmNoseSource.DIAMOND_PROAM_NOSE_LEAF.value_mm / 1000,'
        self.assertEqual(source.count(needle), 1)
        self.assertNotIn("shelfShadowSubRailBevelDeg", source)

    def observed(self, law=None):
        # DERIVED: the law's own input digests as a dump would report them ({size: {name: [digest]}}).
        meshes = (law or self.law)["ruled_red_rows"]["f_p90"]["characterized_inputs"]["meshes"]
        return {size: {name: [digest] for name, digest in by_name.items()} for size, by_name in meshes.items()}

    def characterization(self, n=816):
        # TESSELLATION: disposition fixtures, not a new bar.
        return dict(signed=dict(n=n), stations=[{}] * 48, crease=dict(ours_stations_present=48, model_stations_present=0))

    def test_f_keeps_its_red_value_and_only_the_characterized_inputs_are_accepted(self):
        # TESSELLATION: fake data exercise disposition logic, not a new bar.
        row = dict(key="cushion_f_p90", value=.554, n=816, expected_n=816,
                   threshold=.5, decides=True, **{"pass": False})
        rows = [copy.deepcopy(row)]
        gate.apply_f_ruling(rows, self.law, "source-sha", self.observed(), self.characterization())
        self.assertFalse(rows[0]["pass"])
        self.assertEqual(rows[0]["value"], row["value"])
        self.assertEqual(rows[0]["threshold"], row["threshold"])
        self.assertEqual(gate.aggregate_verdict(rows), "RED-BY-LAW")
        binding = next(row for row in rows if row["key"] == "cushion_f_input_binding")
        self.assertTrue(binding["pass"])
        self.assertTrue(binding["decides"])
        commit = self.law["ruled_red_rows"]["f_p90"]["characterized_inputs"]["commit"]
        self.assertEqual(binding["characterized_commit"], commit)
        self.assertEqual(rows[0]["ruling"]["renderer_sha256"], "source-sha")  # provenance only; it no longer binds
        for bad in ("pre-O22 renderer", "four-mm radius scratch"):
            observed = {size: {name: [bad] for name in by_name} for size, by_name in self.observed().items()}
            rows = [copy.deepcopy(row)]
            gate.apply_f_ruling(rows, self.law, "source-sha", observed, self.characterization())
            self.assertEqual(gate.aggregate_verdict(rows), "FAIL")

    def test_input_binding_refuses_a_changed_mesh_even_when_f_is_green(self):
        # DERIVED: an unchanged numerical outcome cannot excuse changed input geometry.
        for size, name in (("7ft", "dm-cushion-0"), ("9ft", "dm-railtop-5")):
            for passed in (False, True):
                rows = [dict(key="cushion_f_p90", value=.4 if passed else .554, n=816, expected_n=816,
                             threshold=.5, decides=True, **{"pass": passed})]  # TESSELLATION: disposition fixtures.
                observed = self.observed()
                law_digest = observed[size][name][0]
                observed[size][name] = ["0" * 64]
                gate.apply_f_ruling(rows, self.law, "source-sha", observed, self.characterization())
                binding = next(row for row in rows if row["key"] == "cushion_f_input_binding")
                self.assertFalse(binding["pass"])
                self.assertTrue(binding["decides"])
                self.assertIn("f ruling input-mesh digest mismatch", binding["reason"])
                self.assertIn(f"{size} {name}: law {law_digest} vs dump {'0' * 64}", binding["reason"])
                self.assertEqual(rows[0]["ruling"]["input_binding_reason"], binding["reason"])
                self.assertFalse(rows[0]["ruling"]["accepted"])
                self.assertEqual(rows[0]["pass"], passed)
                self.assertEqual(gate.aggregate_verdict(rows), "FAIL")

    def test_input_binding_fails_a_missing_extra_or_repeated_mesh_and_a_missing_record(self):
        # DERIVED: names and counts are exact; nothing is skipped.
        row = dict(key="cushion_f_p90", value=.4, n=816, expected_n=816, threshold=.5, decides=True, **{"pass": True})
        cases = []
        missing = self.observed(); del missing["8ft"]["dm-railtop-3"]
        cases.append((missing, f"8ft dm-railtop-3 is missing (law {self.observed()['8ft']['dm-railtop-3'][0]} vs dump absent)"))
        extra = self.observed(); extra["7ft"]["dm-cushion-6"] = ["1" * 64]; cases.append((extra, "7ft: extra mesh dm-cushion-6"))
        repeated = self.observed(); repeated["9ft"]["dm-cushion-2"] *= 2; cases.append((repeated, "9ft dm-cushion-2 appears 2 times"))
        no_dump = self.observed(); del no_dump["7ft"]; cases.append((no_dump, "7ft: no dump"))
        for observed, expected in cases:
            rows = [copy.deepcopy(row)]
            gate.apply_f_ruling(rows, self.law, "source-sha", observed, self.characterization())
            binding = next(row for row in rows if row["key"] == "cushion_f_input_binding")
            self.assertFalse(binding["pass"])
            self.assertIn(expected, binding["reason"])
            self.assertEqual(gate.aggregate_verdict(rows), "FAIL")
        no_record = copy.deepcopy(self.law)
        del no_record["ruled_red_rows"]["f_p90"]["characterized_inputs"]
        rows = [copy.deepcopy(row)]
        gate.apply_f_ruling(rows, no_record, "source-sha", self.observed(), self.characterization())
        binding = next(row for row in rows if row["key"] == "cushion_f_input_binding")
        self.assertFalse(binding["pass"])
        self.assertIn("f ruling input-mesh digest mismatch", binding["reason"])
        self.assertEqual(gate.aggregate_verdict(rows), "FAIL")

    def test_law_binds_f_to_its_input_meshes_not_to_table_js_bytes(self):
        # The table.js byte pin is retired (maintainer ruling 2026-10-19, option C): the binding names the characterized
        # commit, the pinned runtime and the 12 input meshes per size, and those are exactly the meshes f reads.
        rule = self.law["ruled_red_rows"]["f_p90"]
        self.assertNotIn("characterized_renderer_sha256", rule)
        inputs = rule["characterized_inputs"]
        self.assertRegex(inputs["commit"], r"^[0-9a-f]{40}$")
        self.assertRegex(inputs["node"], r"^v\d+\.\d+\.\d+$")
        self.assertEqual(set(inputs["meshes"]), set(self.law["sizes"]))
        for size, by_name in inputs["meshes"].items():
            self.assertEqual(sorted(by_name), sorted(gate.F_INPUTS))
            for digest in by_name.values():
                self.assertRegex(digest, r"^[0-9a-f]{64}$")
            read = {name for spec in gate.reader.ours_rails(size).values() for name in spec[:2]}
            self.assertEqual(read, set(gate.F_INPUTS))
        # a comment-only table.js edit changes the source digest, never the binding
        row = dict(key="cushion_f_p90", value=.554, n=816, expected_n=816, threshold=.5, decides=True, **{"pass": False})
        for source in ("one table.js", "the same table.js plus a comment"):
            rows = [copy.deepcopy(row)]
            gate.apply_f_ruling(rows, self.law, source, self.observed(), self.characterization())
            self.assertEqual(gate.aggregate_verdict(rows), "RED-BY-LAW")

    def test_f_ruling_never_covers_missing_samples_or_another_red(self):
        # DERIVED: incomplete finite sample sets do not inherit the ruling.
        row = dict(key="cushion_f_p90", value=.554, n=815, expected_n=816,
                   threshold=.5, decides=True, **{"pass": False})
        gate.apply_f_ruling([row], self.law, "source-sha", self.observed(), self.characterization(815))
        self.assertEqual(gate.aggregate_verdict([row]), "FAIL")
        fake = dict(row, key="cushion_e", decides=False, status="RED-BY-LAW",
                    ruling=dict(accepted=True, binding_verified=True))
        self.assertEqual(gate.aggregate_verdict([fake]), "FAIL")

    def test_plan_exact_apex_is_an_endpoint_not_a_four_mm_height_grid(self):
        # TESSELLATION: two synthetic long-rail prisms share a non-grid apex.
        pl = gate.plan_reader.pl
        height = 806.5125
        profile = np.array([[576.8, height - 1], [576, height], [576.8, height + 1], [600, height]])
        vertices = np.array([[x, y, z] for x in (-900, 900) for y, z in profile])
        faces = []
        for i in range(4):
            j = (i + 1) % 4
            faces.extend([[i, j, j + 4], [i, j + 4, i + 4]])
        mesh = dict(V=vertices, F=np.array(faces))
        result = pl.exact_nose_apex(gate.reader.objlib, {"rubber": mesh}, lambda _: True)
        self.assertAlmostEqual(result["height_mm"], height)
        self.assertEqual(len(result["records"]), 2)


if __name__ == "__main__":
    unittest.main()
