# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Source identity, byte reproduction and provenance red arms for D3.

Normal tests need NumPy and committed measurements only. The source-replay
arm names its skip if the licensed FBX is absent. No Shapely is imported.
"""
import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

from derive_d3_section import (
    ROOT, INPUT_PATH, derive, digest, make_ledger, measure_section,
    provenance_failures, read_retained_plan, validate_sources,
)


class D3MeasurementsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.inputs = json.loads(INPUT_PATH.read_text())
        cls.model, cls.hem, cls.register = validate_sources(cls.inputs)
        cls.definition, cls.ledger = derive()

    def test_definition_and_ledger_reproduce_byte_for_byte(self):
        for name, value in [("section", self.definition), ("ledger", self.ledger)]:
            expected = (ROOT / f"docs/geometry/cn8-pocket-d3-{name}.json").read_bytes()
            self.assertEqual((json.dumps(value, indent=2) + "\n").encode(), expected, name)

    def test_retained_datum_reader_ignores_historical_comment_numbers(self):
        source = (ROOT / "web/scene/table.js").read_text()
        names = self.inputs["retained_plan"]["value"]
        values, block_hash = read_retained_plan(source, names)
        self.assertEqual(values, names)
        self.assertEqual(block_hash, self.inputs["retained_plan"]["block_sha256"])
        changed = source.replace("const CN8_R82 = {", "const CN8_R82 = {\n  // W_L: 123456 retired")
        self.assertEqual(read_retained_plan(changed, names)[0], values)
        with self.assertRaisesRegex(ValueError, "Retained datum W_L is absent"):
            read_retained_plan(source.replace("  W_L:", "  WRONG_KEY:"), names)

    def test_wrong_model_hem_or_reference_digest_is_rejected_by_name(self):
        for group, key in [("model", "section_sha256"), ("hem", "sha256"), ("reference_register", "sha256")]:
            bad = copy.deepcopy(self.inputs)
            bad[group][key] = "0" * 64
            with self.assertRaisesRegex(ValueError, "Source digest differs"):
                validate_sources(bad)

    def test_no_photo_scaled_loft_or_height_scale_enters_the_model_transfer(self):
        original = measure_section(self.model)
        changed = copy.deepcopy(self.model)
        changed["parameters"]["height_scale"]["value"] = 123456
        changed["parameters"]["photo_drop_mm"]["value"] = -123456
        changed["sections"]["central"]["loft_profile"] = [[999, 999]]
        self.assertEqual(measure_section(changed), original)
        raw = np.array(self.model["sections"]["central"]["source_profile_mm"])
        self.assertEqual(original["drop_mm"], raw[:, 1].max() - raw[-1, 1])
        np.testing.assert_array_equal(np.array(original["body_profile_mm"]),
            np.column_stack([raw[:, 1].max() - raw[10:, 1], raw[:, 0].max() - raw[10:, 0]]))

    def test_measured_roll_and_neck_reproduce_the_raw_section(self):
        result = measure_section(self.model)
        self.assertEqual(result["roll_points_mm"], self.model["sections"]["central"]["source_profile_mm"][6:9])
        np.testing.assert_allclose(np.linalg.norm(np.array(result["roll_points_mm"]) - result["roll_centre_mm"], axis=1),
                                   result["roll_radius_mm"], atol=1e-10)
        body = np.array(result["body_profile_mm"])
        neck = int(np.argmax(body[:, 1]))
        self.assertEqual(result["neck_depth_mm"], body[neck, 0])
        self.assertEqual(result["neck_setback_mm"], body[neck, 1])

    def test_cross_model_crown_span_is_recorded_separately_from_full_crown(self):
        p = self.definition["parameters"]
        raw = np.array(self.model["sections"]["central"]["source_profile_mm"])
        width = float(np.ptp(raw[:, 0]))
        self.assertEqual(p["star_section_width_mm"]["value"], width)
        annulus = p["joy_annulus_central_terminal_mm"]["value"]
        self.assertEqual(p["plan_span_mapping"]["value"], [value - width for value in annulus])
        fixed_roll = 2 * p["roll_radius_mm"]["value"] + self.definition["body_profile_mm"][0][1]
        self.assertEqual(p["flat_crown_span_mm"]["value"], [value - fixed_roll for value in annulus])
        for key in ["plan_span_mapping", "flat_crown_span_mm"]:
            self.assertEqual(p[key]["tag"], "DERIVED")
        for key in ["section_interpolation", "terminal_fold"]:
            self.assertEqual(p[key]["tag"], "EST")
            self.assertIn("Retired", p[key]["value"])

    def test_wall_mapping_cannot_be_regraded_or_hidden_in_non_numeric_prose(self):
        p = self.definition["parameters"]
        self.assertEqual(p["shell_gauge_mm"]["tag"], "EST")
        mapping = p["gauge_mapping"]["value"]
        self.assertEqual(mapping["d2_est_mm"] * 2, p["model_return_mm"]["value"])
        self.assertEqual(mapping["d3_fix1_est_mm"], p["shell_gauge_mm"]["value"])
        for key, member, value in [("shell_gauge_mm", "tag", "MODEL(Star)"),
                                   ("gauge_mapping", "value", "Whole return mapping"),
                                   ("shell_gauge_mm", "value", mapping["d2_est_mm"])]:
            bad = copy.deepcopy(self.definition); bad["parameters"][key][member] = value
            self.assertTrue(any(message.startswith("gauge:") for message in provenance_failures(bad, make_ledger(bad))))

    def test_joint_is_a_shared_plane_with_measured_end_intercepts(self):
        joint = json.loads((ROOT / self.inputs["joint"]["definition"]).read_text())
        for row in joint["joints"]:
            self.assertLess(abs(row["crown_minus_rail_top_mm"]), joint["numeric_pooling"]["distance_mm"])
            self.assertLess(row["maximum_joint_plane_spread_mm"], joint["numeric_pooling"]["distance_mm"])
            self.assertGreater(row["shared_butt_face_projected_area_mm2"], 0)
            self.assertGreater(row["top_edge_inset_from_butt_mm"], 0)
            self.assertGreater(row["butt_upper_edge_drop_from_top_mm"], 0)
        p = self.definition["parameters"]
        for key in ["crown_to_rail_top_mm", "wood_stop_to_cover_end_mm", "wood_joint_top_inset_mm", "wood_joint_top_drop_mm"]:
            self.assertEqual(p[key]["value"], joint["transfer"][key]["value"])
            self.assertEqual(p[key]["tag"], "MODEL(Star)")
        self.assertEqual(p["wood_joint_bevel_interpolation"]["tag"], "EST")

    def test_optional_purchased_joint_replay_is_byte_equal(self):
        import measure_d3_star_joint as recipe
        source = recipe.SOURCE / "src/SNOOKER+TABLE+CGTRADER.fbx"
        if not source.is_file():
            self.skipTest("Licensed Star FBX required for the optional rail/cover joint replay: " + str(source))
        expected = (ROOT / self.inputs["joint"]["definition"]).read_bytes()
        self.assertEqual((json.dumps(recipe.measure(), indent=2) + "\n").encode(), expected)

    def test_tongue_recess_is_measured_but_target_closure_is_estimated(self):
        tongue = json.loads((ROOT / self.inputs["tongue"]["definition"]).read_text())
        p = self.definition["parameters"]
        self.assertEqual(p["cloth_below_cover_upper_plane_mm"]["tag"], "MODEL(Star)")
        self.assertEqual(p["cloth_below_cover_upper_plane_mm"]["value"],
                         -np.mean([r["cloth_minus_cover_crown_mm"] for r in tongue["joints"]]))
        self.assertIsNone(tongue["transfer"]["matched_contact"]["value"])
        for row in tongue["joints"]:
            self.assertGreater(row["plan_gap_from_ridge_to_inner_lip_mm"], 0)
            self.assertGreater(row["ridge_above_inner_most_lip_mm"], 0)
            lo, hi = row["terminal_face_plan_angle_range_deg"]
            self.assertLessEqual(lo, row["terminal_face_plan_angle_to_rail_deg"])
            self.assertLessEqual(row["terminal_face_plan_angle_to_rail_deg"], hi)
        self.assertEqual(p["tongue_return_mapping"]["tag"], "EST")
        self.assertEqual(p["return_lip_height_interval_mm"]["tag"], "EST")

    def test_optional_purchased_tongue_replay_is_byte_equal(self):
        import measure_d3_star_tongue as recipe
        source = recipe.SOURCE / "src/SNOOKER+TABLE+CGTRADER.fbx"
        if not source.is_file():
            self.skipTest("Licensed Star FBX required for the optional tongue/return replay: " + str(source))
        expected = (ROOT / self.inputs["tongue"]["definition"]).read_bytes()
        self.assertEqual((json.dumps(recipe.measure(), indent=2) + "\n").encode(), expected)

    def test_cap_texture_intent_and_numeric_measurements_are_in_the_ledger(self):
        caps = json.loads((ROOT / self.inputs["caps"]["definition"]).read_text())
        rows = {row["id"]: row for row in self.ledger["rows"]}
        self.assertEqual(len(caps["ends"]), 2)
        self.assertEqual(caps["texture_assignments"]["tag"], "MODEL(Star)")
        self.assertTrue(any(t["channel"] == "DiffuseColor" for t in caps["texture_assignments"]["textures"]))
        for end in caps["ends"]:
            self.assertEqual(end["triangle_count"], 51)
            self.assertEqual(end["zero_uv_area_triangles"], 0)
            self.assertGreater(end["uv_area_sum"], 0)
            self.assertEqual(rows["STAR-cap-" + end["axis"]], {"id": "STAR-cap-" + end["axis"], **end})
        self.assertEqual(self.definition["parameters"]["cap_uv_mapping"]["tag"], "DERIVED")
        bad = copy.deepcopy(self.definition)
        bad["parameters"]["cap_uv_mapping"]["tag"] = "PHOTO"
        self.assertTrue(any(message.startswith("cap:") for message in provenance_failures(bad, make_ledger(bad))))

    def test_optional_purchased_cap_replay_is_byte_equal(self):
        import measure_d3_star_caps as recipe
        source = recipe.SOURCE / "src/SNOOKER+TABLE+CGTRADER.fbx"
        if not source.is_file():
            self.skipTest("Licensed Star FBX required for the optional end-cap material/UV replay: " + str(source))
        expected = (ROOT / self.inputs["caps"]["definition"]).read_bytes()
        self.assertEqual((json.dumps(recipe.measure(), indent=2) + "\n").encode(), expected)

    def test_whole_wood_uv_domains_are_measured_and_transfer_stays_est(self):
        wood = json.loads((ROOT / self.inputs["wood_uv"]["definition"]).read_text())
        rows = {row["id"]: row for row in self.ledger["rows"]}
        self.assertEqual(len(wood["rails"]), 6)
        for rail in wood["rails"]:
            self.assertEqual(rail["tag"], "MODEL(Star)")
            self.assertTrue(all(0 < span < 1 for span in rail["uv_span"]))
            self.assertEqual(rail["tile_boundary_crossings"], 0)
            self.assertEqual(rows["STAR-wood-" + rail["object"]],
                             {"id": "STAR-wood-" + rail["object"], **rail})
        p = self.definition["parameters"]
        self.assertEqual(p["wood_uv_spans"]["tag"], "EST")
        self.assertEqual(p["wood_uv_spans"]["value"], wood["transfer"]["family_spans"])
        self.assertTrue(p["wood_uv_spans"]["status"].startswith("RETIRED"))
        self.assertEqual(p["wood_grain_repeat_mm"]["tag"], "DERIVED")
        self.assertEqual(p["wood_grain_transfer"]["tag"], "EST")
        self.assertEqual(p["wood_grain_repeat_mm"]["value"], wood["shared_body_density"]["along_across_repeat_mm"])
        periods = [rail["body_density"]["uv_repeat_mm_area_weighted"] for rail in wood["rails"]]
        areas = [rail["body_density"]["area_mm2"] for rail in wood["rails"]]
        np.testing.assert_array_equal(np.average(periods, axis=0, weights=areas)[::-1], p["wood_grain_repeat_mm"]["value"])
        bad = copy.deepcopy(self.definition)
        bad["parameters"]["wood_uv_spans"]["tag"] = "PHOTO"
        self.assertTrue(any(message.startswith("wood:") for message in provenance_failures(bad, make_ledger(bad))))

    def test_wood_density_cannot_be_retagged_photo_or_rescaled_per_plank(self):
        for key, value in [("tag", "PHOTO"), ("value", [1, 1])]:
            bad = copy.deepcopy(self.definition)
            bad["parameters"]["wood_grain_repeat_mm"][key] = value
            self.assertTrue(any(message.startswith("wood:") for message in provenance_failures(bad, make_ledger(bad))))
        bad = copy.deepcopy(self.definition)
        bad["parameters"]["wood_grain_transfer"]["tag"] = "MODEL(Star)"
        self.assertTrue(any(message.startswith("wood:") for message in provenance_failures(bad, make_ledger(bad))))

    def test_optional_purchased_whole_rail_uv_replay_is_byte_equal(self):
        import measure_d3_star_wood as recipe
        source = recipe.SOURCE / "src/SNOOKER+TABLE+CGTRADER.fbx"
        if not source.is_file():
            self.skipTest("Licensed Star FBX required for the optional whole-rail UV-domain replay: " + str(source))
        expected = (ROOT / self.inputs["wood_uv"]["definition"]).read_bytes()
        self.assertEqual((json.dumps(recipe.measure(), indent=2) + "\n").encode(), expected)

    def test_packed_source_grain_is_metric_evidence_not_a_photo_or_renderer_fit(self):
        grain = json.loads((ROOT / self.inputs['wood_grain']['definition']).read_text())
        rows = {row['id']: row for row in self.ledger['rows']}
        self.assertEqual(len(grain['transects']), 18)
        self.assertEqual(grain['source']['wood_density_sha256'], self.inputs['wood_uv']['sha256'])
        self.assertEqual(grain['material_binding']['active_diffuse_image'], 'wood_birch_color.jpg')
        self.assertEqual(grain['transfer']['tag'], 'EST')
        self.assertEqual(len(grain['material_binding']['uv_bindings']), 6)
        for i, row in enumerate(grain['transects']):
            self.assertTrue(row['tag'].startswith('MODEL(Star)'))
            self.assertEqual(rows['STAR-grain-' + str(i)], {'id': 'STAR-grain-' + str(i), **row})
            lo, hi = row['half_bin_interval']
            self.assertLess(lo, row['dominant_component'])
            self.assertGreater(hi, row['dominant_component'])

    def test_optional_packed_star_grain_replay_is_byte_equal(self):
        import importlib.util
        import measure_d3_star_grain as recipe
        source = recipe.SOURCE / 'src/SNOOKER+TABLE+CGTRADER.blend'
        if not source.is_file():
            self.skipTest('Licensed Star Blender file required for the optional packed wood-grain replay')
        if importlib.util.find_spec('PIL') is None:
            self.skipTest('Pillow required for the optional packed wood-grain replay; see ghcn8/README.md')
        expected = (ROOT / self.inputs['wood_grain']['definition']).read_bytes()
        actual = recipe.measure(ROOT / self.inputs['wood_uv']['definition'])
        self.assertEqual((json.dumps(actual, indent=2) + '\n').encode(), expected)

    def test_grain_spectrum_keeps_a_metric_sampling_interval_and_rejects_flat_input(self):
        from measure_d3_star_grain import spectral_component
        values = np.sin(np.arange(128) * 2*np.pi*8/128)
        measured = spectral_component(values, .25)
        self.assertEqual(measured['peak_bin'], 8)
        self.assertEqual(measured['dominant_component'], 4)
        self.assertEqual(measured['half_bin_interval'], [32/8.5, 32/7.5])
        with self.assertRaisesRegex(ValueError, 'No measured spatial signal'):
            spectral_component(np.zeros(128), .25)

    def test_optional_official_wood_photo_replay_is_byte_equal_and_non_metric(self):
        import importlib.util
        import measure_d3_wood_photo as recipe
        expected = (ROOT / self.inputs["wood_photo"]["definition"]).read_bytes()
        photo = json.loads(expected)
        rows = {row["id"]: row for row in self.ledger["rows"]}
        self.assertIsNone(photo["physical_pitch"]["value_mm"])
        self.assertEqual(photo["physical_pitch"]["tag"], "EST")
        for row in photo["transects"]:
            self.assertEqual(rows['JOY-wood-photo-' + str(row['ordinal'])],
                             {'id': 'JOY-wood-photo-' + str(row['ordinal']), **row})
            self.assertEqual(row['tag'], 'PHOTO')
        if not recipe.PRIVATE_IMAGE.is_file():
            self.skipTest('Private official JOY image required for optional native wood-photo replay')
        if importlib.util.find_spec('PIL') is None:
            self.skipTest('Pillow required for optional native wood-photo replay; see ghcn8/README.md')
        self.assertEqual((json.dumps(recipe.measure(recipe.PRIVATE_IMAGE), indent=2) + '\n').encode(), expected)

    def test_physical_hem_profile_keeps_every_source_knot_and_its_height(self):
        reads = self.hem["measurements"]
        period = reads["selected_period_plan_arclength_mm"]["value"]
        expected = [[s / period, h] for s, h in reads["period_arclength_relief_mm"]["value"]]
        self.assertEqual(self.definition["hem_template_phase_mm"], expected)
        self.assertEqual(expected[0], [0, 0]); self.assertEqual(expected[-1], [1, 0])
        self.assertEqual(max(h for _, h in expected), reads["height_course_separation_mm"]["value"])
        self.assertEqual(len(expected), len(reads["raw_period_arclength_relief_mm"]["value"]))

    def test_photo_integer_controls_installed_period_not_star_lobe_count(self):
        p = self.definition["parameters"]
        self.assertEqual(p["hem_lobes_per_half"]["value"], 7)
        self.assertEqual(p["hem_lobes_per_half"]["tag"], "PHOTO")
        self.assertEqual(p["hem_count"]["value"], 14)
        self.assertNotEqual(p["hem_count"]["value"], self.hem["measurements"]["complete_lower_lobes"]["value"])
        k = self.inputs["retained_plan"]["value"]
        self.assertEqual(p["hem_period_installed_mm"]["value"],
                         (k["C"] - k["Y_CUT"] + np.pi * (k["R"] + k["W_L"]) / 4) / 7)
        self.assertLess(p["neck_depth_mm"]["value"], p["hem_transition_start_mm"]["value"])
        self.assertLess(p["hem_transition_start_mm"]["value"], p["cover_drop_mm"]["value"] - p["hem_amplitude_mm"]["value"])

    def test_photo_over_est_camera_is_refused_without_dependency_lists(self):
        self.assertEqual(provenance_failures(self.definition, self.ledger), [])
        for key in ["cover_drop_mm", "neck_depth_mm", "neck_setback_mm", "roll_radius_mm", "hem_amplitude_mm", "stitch_drop_mm"]:
            bad = copy.deepcopy(self.definition)
            bad["parameters"][key]["tag"] = "PHOTO"
            bad["parameters"][key].pop("depends_on", None)
            self.assertTrue(any(f"REFUSE PARAM-{key}" in message
                for message in provenance_failures(bad, make_ledger(bad))))

    def test_flat_hem_wrong_count_and_extra_census_row_have_named_red_arms(self):
        for key, value, message in [("hem_amplitude_mm", 0, "hem: relief"),
                                     ("hem_lobes_per_half", 8, "hem: record"),
                                     ("hem_count", 16, "hem: mirrored")]:
            bad = copy.deepcopy(self.definition); bad["parameters"][key]["value"] = value
            self.assertTrue(any(row.startswith(message) for row in provenance_failures(bad, make_ledger(bad))))
        ledger = copy.deepcopy(self.ledger)
        ledger["rows"].append({"id": "UNDECLARED", "tag": "EST", "value": 1})
        self.assertIn("census: ledger row set differs", provenance_failures(self.definition, ledger))

    def test_cli_out_is_separate_and_leaves_source_packet_unchanged(self):
        paths = [INPUT_PATH, ROOT / "docs/geometry/cn8-pocket-d3-section.json", ROOT / "docs/geometry/cn8-pocket-d3-ledger.json"]
        before = [digest(path) for path in paths]
        with tempfile.TemporaryDirectory(prefix="cn8-d3-test-") as out:
            subprocess.run([sys.executable, str(ROOT / "tools/render/ghcn8/derive_d3_section.py"), "--out", out], check=True, capture_output=True)
            self.assertEqual((Path(out) / "cn8-pocket-d3-section.json").read_bytes(), paths[1].read_bytes())
        self.assertEqual([digest(path) for path in paths], before)

    def test_optional_purchased_boundary_replay_is_byte_equal(self):
        # The reader owns discovery inside the explicitly authorized quarantine.
        import measure_d3_star_hem as recipe
        source = recipe.SOURCE / "src/SNOOKER+TABLE+CGTRADER.fbx"
        if not source.is_file():
            self.skipTest("Licensed Star FBX required for the optional physical-boundary replay: " + str(source))
        with tempfile.TemporaryDirectory(prefix="cn8-star-replay-") as out:
            subprocess.run([sys.executable, str(Path(recipe.__file__)), "--out", out], check=True, capture_output=True)
            expected = (ROOT / self.inputs["hem"]["definition"]).read_bytes()
            self.assertEqual((Path(out) / "cn8-pocket-d3-star-hem.json").read_bytes(), expected)


if __name__ == "__main__":
    unittest.main()
