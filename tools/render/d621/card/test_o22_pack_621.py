#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Synthetic evidence tests the bound-letters and recorded PLAN contracts."""
import sys
sys.dont_write_bytecode = True
import copy
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import o22_pack_621 as pack
from o22_pack_621 import (SIZES, LETTER_STATIONS, RAIL_STEMS, bind_drawings, bind_evidence, bound_before,
                          load_bound_letters, renderer_digest, require_byte_controls, require_plan_before,
                          require_section_keys, require_unique_keys, selected_frame, sha)


class UniqueEvidenceKeys(unittest.TestCase):
    def test_exact_keys_pass_in_any_order_without_mutation(self):
        keys = [("PF-01", "width"), ("PF-01", "length")]
        original = copy.deepcopy(keys)
        require_unique_keys("letters", keys, reversed(keys))
        self.assertEqual(keys, original)

    def test_one_error_names_duplicates_missing_and_extra_keys(self):
        with self.assertRaises(ValueError) as caught:
            require_unique_keys("letters", ["length", "length", "foreign"], ["length", "width"])
        self.assertEqual(str(caught.exception),
            'letters key census: duplicated=["length"]; missing=["width"]; extra=["foreign"]')

    def test_expected_keys_cannot_be_replaced_by_same_sized_unique_set(self):
        with self.assertRaisesRegex(ValueError, 'missing=.*width.*extra=.*foreign'):
            require_unique_keys("letters", ["length", "foreign"], ["length", "width"])

    def test_identity_key_types_do_not_alias(self):
        # DERIVED: identity zero must not alias JSON false, 0.0 or a string.
        for key in (False, 0.0, "0", None, []):
            with self.subTest(key=key):
                with self.assertRaisesRegex(ValueError, "identities.*missing=\\[0\\].*extra="):
                    require_unique_keys("identities", [key], [0])


class PlanBindings(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dump = Path(self.temp.name) / "ours.json"
        self.dump.write_bytes(b"original capture")
        self.plan = dict(ours=str(self.dump), ours_sha256=sha(self.dump))

    def bind(self, expected):
        bind_evidence("PLAN " + self.plan["ours"], self.plan, {"ours_sha256": expected})

    def test_original_recorded_input_passes(self):
        self.bind(sha(self.dump))

    def test_overwritten_path_cannot_rebind_stale_plan(self):
        self.dump.write_bytes(b"newer capture")
        expected = sha(self.dump)
        self.assertNotEqual(self.plan["ours_sha256"], expected)
        with self.assertRaises(ValueError) as caught:
            self.bind(expected)
        for value in ("PLAN", str(self.dump), self.plan["ours_sha256"], expected):
            self.assertIn(value, str(caught.exception))

    def test_recorded_capture_does_not_require_live_dump_path(self):
        self.dump.unlink()
        self.bind(self.plan["ours_sha256"])

    def test_changed_live_path_cannot_override_matching_record(self):
        self.dump.write_bytes(b"unrelated later capture")
        self.bind(self.plan["ours_sha256"])

    def test_missing_recorded_digest_refuses_without_live_path_fallback(self):
        expected = self.plan.pop("ours_sha256")
        with self.assertRaisesRegex(ValueError, "PLAN.*ours_sha256.*supplied None"):
            self.bind(expected)


class PlanLawBindings(unittest.TestCase):
    def setUp(self):
        self.law = dict(registration_method=dict(deciding="own-apex-exact"))
        self.law_sha = hashlib.sha256(b"archive law").hexdigest()
        self.model_sha = hashlib.sha256(b"deciding model set").hexdigest()
        self.defs_sha = hashlib.sha256(b"deciding definition").hexdigest()
        self.plan = dict(ours_sha256=hashlib.sha256(b"same capture").hexdigest(),
                         registration_method="own-apex-exact", law=dict(sha256=self.law_sha), verdict="PASS",
                         model_obj_set_sha256=self.model_sha, defs=dict(sha256=self.defs_sha))

    def bind(self):
        bind_evidence("PLAN", self.plan, {
            "registration_method": self.law["registration_method"]["deciding"],
            "law.sha256": self.law_sha, "model_obj_set_sha256": self.model_sha,
            "defs.sha256": self.defs_sha, "verdict": "PASS",
        })

    def assert_refused(self, field, supplied, expected):
        with self.assertRaises(ValueError) as caught:
            self.bind()
        for value in ("PLAN", field, repr(supplied), repr(expected)):
            self.assertIn(value, str(caught.exception))

    def test_matching_plan_passes_without_rewriting_evidence(self):
        before = copy.deepcopy(self.plan)
        self.bind()
        self.assertEqual(self.plan, before)

    def test_other_registration_on_same_capture_refuses(self):
        self.plan["registration_method"] = "legacy-model-height"
        self.assert_refused("registration_method", "legacy-model-height", "own-apex-exact")

    def test_other_law_with_same_registration_and_capture_refuses(self):
        other = hashlib.sha256(b"alternate law").hexdigest()
        self.plan["law"]["sha256"] = other
        self.assert_refused("law.sha256", other, self.law_sha)

    def test_fail_verdict_with_matching_method_and_law_refuses(self):
        self.plan["verdict"] = "FAIL"
        self.assert_refused("verdict", "FAIL", "PASS")

    def test_other_model_with_matching_capture_and_law_refuses(self):
        other = hashlib.sha256(b"alternate model set").hexdigest()
        self.plan["model_obj_set_sha256"] = other
        self.assert_refused("model_obj_set_sha256", other, self.model_sha)

    def test_other_defs_with_matching_capture_and_law_refuses(self):
        other = hashlib.sha256(b"alternate definition").hexdigest()
        self.plan["defs"]["sha256"] = other
        self.assert_refused("defs.sha256", other, self.defs_sha)

    def test_pre_fix1_missing_registration_refuses(self):
        del self.plan["registration_method"]
        self.assert_refused("registration_method", None, "own-apex-exact")

    def test_missing_law_digest_refuses(self):
        self.plan["law"] = {}
        self.assert_refused("law.sha256", None, self.law_sha)

    def test_missing_law_refuses(self):
        del self.plan["law"]
        self.assert_refused("law.sha256", None, self.law_sha)

    def test_missing_verdict_refuses(self):
        del self.plan["verdict"]
        self.assert_refused("verdict", None, "PASS")


class LettersRendererBindings(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.web = Path(self.temp.name)
        (self.web / "scene").mkdir()
        for name in ("table.js", "shading.js", "clothvisuals.js", "diamondproam_nose.js", "diamondproam_corner.js"):
            (self.web / "scene" / name).write_text(f"// synthetic {name}\n")
        self.archive = renderer_digest(self.web)
        self.letters = dict(served_renderer=copy.deepcopy(self.archive))

    def bind(self):
        bind_evidence("letters-8ft/letters-compare-488d.json", self.letters, {
            "served_renderer.sha256": self.archive["sha256"], "served_renderer.files": self.archive["files"],
        })

    def test_matching_renderer_passes_without_rewriting_evidence(self):
        before = copy.deepcopy(self.letters)
        self.bind()
        self.assertEqual(self.letters, before)

    def test_changed_served_file_refuses_even_with_same_measurements(self):
        for name in self.archive["files"]:
            with self.subTest(name=name):
                file = self.web / name
                original = file.read_bytes()
                file.write_bytes(original + b" ")
                self.letters["served_renderer"] = renderer_digest(self.web)
                with self.assertRaises(ValueError) as caught:
                    self.bind()
                for value in ("letters-8ft", "served_renderer.sha256", self.archive["sha256"],
                              self.letters["served_renderer"]["sha256"]):
                    self.assertIn(value, str(caught.exception))
                file.write_bytes(original)

    def test_missing_renderer_refuses_without_hashing_mesh_source_path(self):
        self.letters = dict(mesh_source=str(self.web))
        with self.assertRaisesRegex(ValueError, "served_renderer.sha256.*None"):
            self.bind()

    def test_forged_combined_digest_cannot_hide_changed_file_digest(self):
        self.letters["served_renderer"]["files"]["scene/table.js"] = hashlib.sha256(b"other tree").hexdigest()
        with self.assertRaisesRegex(ValueError, "served_renderer.files.*scene/table.js"):
            self.bind()

    def test_missing_shading_digest_refuses(self):
        del self.letters["served_renderer"]["files"]["scene/shading.js"]
        with self.assertRaisesRegex(ValueError, "served_renderer.files"):
            self.bind()


class SectionBindings(unittest.TestCase):
    def setUp(self):
        self.expected = {key: hashlib.sha256(key.encode()).hexdigest()
                         for key in ("before_sha256", "after_sha256", "law_sha256", "model_obj_set_sha256")}
        self.section = dict(self.expected)

    def test_sealed_section_record_passes_unchanged(self):
        original = copy.deepcopy(self.section)
        bind_evidence("sections", self.section, self.expected)
        self.assertEqual(self.section, original)

    def test_each_capture_law_and_model_field_is_independently_required(self):
        other = hashlib.sha256(b"other reference").hexdigest()
        for field, expected in self.expected.items():
            with self.subTest(field=field):
                bad = dict(self.section, **{field: other})
                with self.assertRaises(ValueError) as caught:
                    bind_evidence("sections", bad, self.expected)
                for value in ("sections", field, other, expected):
                    self.assertIn(value, str(caught.exception))

    def test_missing_reference_is_not_replaced_from_an_input_path(self):
        for field in self.expected:
            with self.subTest(field=field):
                bad = dict(self.section, after="/unrelated/live/capture.json")
                del bad[field]
                with self.assertRaisesRegex(ValueError, field + ".*supplied None"):
                    bind_evidence("sections", bad, self.expected)


class SharedBindingFailures(unittest.TestCase):
    def test_missing_gate_expectation_cannot_authorize_missing_evidence(self):
        with self.assertRaisesRegex(ValueError, "PLAN defs.sha256.*None.*None"):
            bind_evidence("PLAN", {}, {"defs.sha256": None})

    def test_malformed_nested_reference_refuses_by_field(self):
        expected = hashlib.sha256(b"definition").hexdigest()
        for value in (None, [], "another definition"):
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, "PLAN defs.sha256.*supplied None.*" + expected):
                    bind_evidence("PLAN", {"defs": value}, {"defs.sha256": expected})


class BeforeCaptureBindings(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.addCleanup(patch.stopall)
        patch.object(pack, "ROOT", self.root).start()
        fence_path = "tools/render/d621/law/cushion_fence_621.json"
        fence_file = self.root / fence_path
        fence_file.parent.mkdir(parents=True)
        fence_file.write_text(json.dumps(dict(source_commit="baseline-source", entry_snapshot=dict(
            source_table_js_sha256=hashlib.sha256(b"baseline renderer").hexdigest()))))
        self.before = self.root / "baseline/ours-8ft.json"
        self.before.parent.mkdir()
        self.before.write_bytes(b"before capture")
        self.gate = dict(provenance=dict(head_commit="deciding-head", law_files={fence_path: sha(fence_file)}),
                         plan_gate=dict(ours_sha256=hashlib.sha256(b"after capture").hexdigest()))
        self.baseline_gate = self.before.parent / "gate/gate.json"
        self.baseline_gate.parent.mkdir()
        self.baseline_gate.write_text(json.dumps(dict(provenance=dict(head_commit="baseline-build",
            head_commit_table_js_sha256=hashlib.sha256(b"baseline renderer").hexdigest(),
            ours_dump_sha256=sha(self.before)), inputs=dict(ours_sha256=sha(self.before)))))
        self.build = dict(commit="baseline-build", durable=str(self.before.parent), files=[
            dict(path="ours-8ft.json", sha256=sha(self.before)),
            dict(path="gate/gate.json", sha256=sha(self.baseline_gate))])
        self.arms = dict(commit="deciding-head", baseline_red=dict(behaves=True,
            instrument_commit="deciding-head", scratch_commit="baseline-build", source_commit="baseline-source",
            source_table_js_sha256=hashlib.sha256(b"baseline renderer").hexdigest()), builds=[self.build])

    def bind(self):
        return bound_before(self.arms, self.gate)

    def test_before_comes_from_the_baseline_gate_and_recorded_capture(self):
        result = self.bind()
        self.assertEqual(result["before_sha256"], sha(self.before))
        self.assertEqual(result["after_sha256"], self.gate["plan_gate"]["ours_sha256"])
        self.assertEqual(result["before_gate_sha256"], sha(self.baseline_gate))

    def test_no_baseline_authority_refuses(self):
        with self.assertRaisesRegex(ValueError, "BEFORE.*--arms"):
            bound_before(None, self.gate)

    def test_foreign_arm_commit_or_baseline_source_refuses(self):
        for field in ("instrument_commit", "source_commit", "source_table_js_sha256"):
            with self.subTest(field=field):
                original = self.arms["baseline_red"][field]
                self.arms["baseline_red"][field] = "foreign"
                with self.assertRaisesRegex(ValueError, "BEFORE arm.*" + field):
                    self.bind()
                self.arms["baseline_red"][field] = original

    def test_missing_or_ambiguous_baseline_build_refuses(self):
        for builds in ([], [self.build, self.build]):
            with self.subTest(builds=builds):
                self.arms["builds"] = builds
                with self.assertRaisesRegex(ValueError, "BEFORE baseline build.*baseline-build"):
                    self.bind()

    def test_changed_capture_is_not_rebound_from_its_current_path(self):
        self.before.write_bytes(b"replacement capture")
        with self.assertRaisesRegex(ValueError, "BEFORE archive.*ours-8ft.json.*sha256"):
            self.bind()

    def test_missing_or_duplicate_recorded_capture_digest_refuses(self):
        capture, gate = self.build["files"]
        for records in ([gate], [capture, capture, gate]):
            with self.subTest(records=records):
                self.build["files"] = records
                with self.assertRaisesRegex(ValueError, "BEFORE archive digest ours-8ft.json.*key census"):
                    self.bind()

    def test_replaced_gate_digest_does_not_override_the_baseline_source(self):
        record = json.loads(self.baseline_gate.read_text())
        record["provenance"]["head_commit_table_js_sha256"] = "foreign"
        self.baseline_gate.write_text(json.dumps(record))
        self.build["files"][-1]["sha256"] = sha(self.baseline_gate)
        with self.assertRaisesRegex(ValueError, "deciding BEFORE gate.*head_commit_table_js_sha256"):
            self.bind()

    def test_equal_deciding_before_and_after_digests_refuse(self):
        self.gate["plan_gate"]["ours_sha256"] = sha(self.before)
        with self.assertRaisesRegex(ValueError, "before_sha256 equals AFTER after_sha256"):
            self.bind()


class PlanBeforeRows(unittest.TestCase):
    def setUp(self):
        self.law = json.loads((pack.ROOT / "tools/render/d621/law/plan_law_621.json").read_text())
        # DERIVED: synthetic measured row; the pocket/cut census comes from law.
        row = dict(prev=dict(ring_area_mm2=1.0), prev_ring_iou=1.0)
        self.plan = dict(prev="/absent/recorded-before.json", per_pocket={
            pocket: dict(cuts={cut: copy.deepcopy(row) for cut in self.law["cuts"]})
            for pocket in self.law["pockets"]})

    def check(self):
        require_plan_before("PLAN fixture", self.plan, self.law)

    def test_complete_record_does_not_depend_on_a_live_prev_path(self):
        original = copy.deepcopy(self.plan)
        self.check()
        self.assertEqual(self.plan, original)

    def test_missing_prev_argument_refuses_even_with_before_rows(self):
        for value in (None, "", []):
            with self.subTest(value=value):
                self.plan["prev"] = value
                with self.assertRaisesRegex(ValueError, "PLAN fixture.*BEFORE.*--prev"):
                    self.check()
        del self.plan["prev"]
        with self.assertRaisesRegex(ValueError, "--prev"):
            self.check()

    def test_every_pocket_cut_requires_a_before_measurement_and_iou(self):
        for pocket, record in self.plan["per_pocket"].items():
            for cut, row in record["cuts"].items():
                for field in ("prev", "prev_ring_iou"):
                    with self.subTest(pocket=pocket, cut=cut, field=field):
                        original = row.pop(field)
                        with self.assertRaisesRegex(ValueError, "BEFORE row.*" + pocket + "/" + cut):
                            self.check()
                        row[field] = original

    def test_empty_before_row_is_not_a_measurement(self):
        pocket = self.law["pockets"][0]
        cut = next(iter(self.law["cuts"]))
        self.plan["per_pocket"][pocket]["cuts"][cut]["prev"] = {}
        with self.assertRaisesRegex(ValueError, "BEFORE row.*" + pocket + "/" + cut):
            self.check()

    def test_replaced_pocket_or_cut_refuses_by_name(self):
        original = copy.deepcopy(self.plan)
        pocket = self.law["pockets"][0]
        self.plan["per_pocket"]["foreign"] = self.plan["per_pocket"].pop(pocket)
        with self.assertRaisesRegex(ValueError, "pockets.*missing=.*" + pocket + ".*extra=.*foreign"):
            self.check()
        self.plan = original
        cut = next(iter(self.law["cuts"]))
        cuts = self.plan["per_pocket"][pocket]["cuts"]
        cuts["foreign"] = cuts.pop(cut)
        with self.assertRaisesRegex(ValueError, pocket + " cuts.*missing=.*" + cut + ".*extra=.*foreign"):
            self.check()

    def test_extra_pocket_or_cut_cannot_expand_comparison_evidence(self):
        pocket = self.law["pockets"][0]
        cuts = self.plan["per_pocket"][pocket]["cuts"]
        for records in (self.plan["per_pocket"], cuts):
            with self.subTest(records=list(records)):
                records["foreign"] = copy.deepcopy(next(iter(records.values())))
                with self.assertRaisesRegex(ValueError, "extra=.*foreign"):
                    self.check()
                del records["foreign"]


class LettersReferenceBindings(unittest.TestCase):
    def setUp(self):
        definitions = {size: (pack.ROOT / f"docs/geometry/diamond-proam-{size}-table-definition.json").read_bytes()
                       for size in SIZES}
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.addCleanup(patch.stopall)
        patch.object(pack, "ROOT", self.root).start()
        for name in ("law/letters_law_621.json", "plan/letters_sampling_621.mjs", "plan/letters_model_621.mjs"):
            file = self.root / "tools/render/d621" / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text("synthetic instrument " + name)
        self.model_sha = hashlib.sha256(b"gate model set").hexdigest()
        self.definitions = {}
        self.renderer = dict(sha256=hashlib.sha256(b"served renderer").hexdigest(),
                             files={"scene/table.js": hashlib.sha256(b"table").hexdigest()})
        law = sha(self.root / "tools/render/d621/law/letters_law_621.json")
        instruments = {name: sha(self.root / "tools/render/d621/plan" / name)
                       for name in ("letters_sampling_621.mjs", "letters_model_621.mjs")}
        self.letters_root = self.root / "letters"
        for size in SIZES:
            definition = self.root / f"docs/geometry/diamond-proam-{size}-table-definition.json"
            definition.parent.mkdir(parents=True, exist_ok=True)
            definition.write_bytes(definitions[size])
            self.definitions[size] = sha(definition)
            rows = [dict(letter=label, feature=feature, measures=station, **{"pass": True})
                    for label, feature, station in LETTER_STATIONS]
            for row in rows:
                if row["feature"] in ("CP-01", "CP-09"):
                    row["secondary"] = {"pass": True}
            record = dict(table="diamond_proam_" + size, spec_sha256=self.definitions[size],
                served_renderer=copy.deepcopy(self.renderer), rows=rows, evidence_starved=[],
                identities=[dict(n=n, status="HOLDS")
                            for n, identity in enumerate(json.loads(definitions[size])["checks"]["identities"])],
                sampling_method=dict(law_sha256=law, instruments=instruments,
                    purchased_model=dict(law_sha256=law, model_obj_set_sha256=self.model_sha)))
            file = self.letters_root / ("letters-" + size) / "letters-compare-488d.json"
            file.parent.mkdir(parents=True)
            twin = file.parent / "twin"
            twin.mkdir()
            digests = {}
            for sheet in pack.DRAWING_SHEETS:
                svg = twin / f"canonical-current-{sheet}.svg"
                svg.write_text(f"<svg>{size} {sheet} current</svg>")
                digests[svg.name] = sha(svg)
            record["twin"] = dict(svg_sha256=digests)
            file.write_text(json.dumps(record))

    def load(self):
        return load_bound_letters(self.letters_root, self.renderer, self.model_sha, self.definitions)

    def test_all_sizes_use_the_gate_model_and_per_size_definitions(self):
        original = {file: file.read_bytes() for file in self.letters_root.rglob("*.json")}
        self.assertEqual(set(self.load()), set(SIZES))
        self.assertTrue(all(file.read_bytes() == data for file, data in original.items()))

    def test_each_replaced_twin_refuses_with_file_and_both_digests(self):
        for size in SIZES:
            for sheet in pack.DRAWING_SHEETS:
                with self.subTest(size=size, sheet=sheet):
                    svg = self.letters_root / ("letters-" + size) / "twin" / f"canonical-current-{sheet}.svg"
                    original = svg.read_bytes()
                    recorded = sha(svg)
                    svg.write_bytes(b"<svg>older generation</svg>")
                    try:
                        with self.assertRaises(ValueError) as caught:
                            self.load()
                        for value in (str(svg), recorded, sha(svg)):
                            self.assertIn(value, str(caught.exception))
                    finally:
                        svg.write_bytes(original)

    def test_missing_or_malformed_twin_digest_map_has_no_fallback(self):
        file = self.letters_root / "letters-8ft/letters-compare-488d.json"
        original = json.loads(file.read_text())
        for value in (None, {}, [], "", False):
            with self.subTest(value=value):
                record = copy.deepcopy(original)
                record["twin"]["svg_sha256"] = value
                file.write_text(json.dumps(record))
                with self.assertRaisesRegex(ValueError, "letters-8ft.*requires twin.svg_sha256"):
                    self.load()
        record = copy.deepcopy(original)
        del record["twin"]
        file.write_text(json.dumps(record))
        with self.assertRaisesRegex(ValueError, "letters-8ft.*requires twin.svg_sha256"):
            self.load()

    def test_digest_map_requires_every_svg_key(self):
        file = self.letters_root / "letters-8ft/letters-compare-488d.json"
        original = json.loads(file.read_text())
        for name in original["twin"]["svg_sha256"]:
            with self.subTest(name=name):
                record = copy.deepcopy(original)
                del record["twin"]["svg_sha256"][name]
                file.write_text(json.dumps(record))
                with self.assertRaises(ValueError) as caught:
                    self.load()
                self.assertIn("twin SVG files", str(caught.exception))
                self.assertIn(name, str(caught.exception))

    def test_missing_or_unrecorded_twin_file_refuses(self):
        twin = self.letters_root / "letters-8ft/twin"
        svg = twin / "canonical-current-s2-side.svg"
        original = svg.read_bytes()
        svg.unlink()
        with self.assertRaisesRegex(ValueError, "twin SVG files.*missing=.*s2-side"):
            self.load()
        svg.write_bytes(original)
        (twin / "unrecorded.svg").write_bytes(original)
        with self.assertRaisesRegex(ValueError, "twin SVG files.*extra=.*unrecorded.svg"):
            self.load()

    def test_other_generated_sheets_are_also_bound(self):
        file = self.letters_root / "letters-8ft/letters-compare-488d.json"
        record = json.loads(file.read_text())
        svg = file.parent / "twin/canonical-current-s1-corner.svg"
        svg.write_bytes(b"<svg>another current sheet</svg>")
        record["twin"]["svg_sha256"][svg.name] = sha(svg)
        file.write_text(json.dumps(record))
        self.load()
        svg.write_bytes(b"<svg>stale extra sheet</svg>")
        with self.assertRaisesRegex(ValueError, "s1-corner.svg.*sha256 mismatch"):
            self.load()

    def test_wrong_or_missing_recorded_digest_cannot_be_recomputed_from_svg(self):
        file = self.letters_root / "letters-8ft/letters-compare-488d.json"
        original = json.loads(file.read_text())
        name = next(iter(original["twin"]["svg_sha256"]))
        for value in (hashlib.sha256(b"another generation").hexdigest(), None, ""):
            with self.subTest(value=value):
                record = copy.deepcopy(original)
                record["twin"]["svg_sha256"][name] = value
                file.write_text(json.dumps(record))
                with self.assertRaises(ValueError) as caught:
                    self.load()
                for expected in (name, original["twin"]["svg_sha256"][name], repr(value)):
                    self.assertIn(expected, str(caught.exception))

    def test_seventy_seven_copies_refuse_with_duplicate_and_missing_stations(self):
        for size in SIZES:
            file = self.letters_root / ("letters-" + size) / "letters-compare-488d.json"
            original = file.read_text()
            record = json.loads(original)
            duplicated, missing = record["rows"][:2]
            # DERIVED: adversarial same-count replacement from the owner finding.
            record["rows"] = [copy.deepcopy(duplicated) for _ in range(77)] + [
                row for row in record["rows"] if row["feature"] in ("CP-01", "CP-09")]
            file.write_text(json.dumps(record))
            with self.assertRaises(ValueError) as caught:
                self.load()
            for value in ("letters-" + size, "duplicated=", duplicated["feature"], duplicated["measures"],
                          "missing=", missing["measures"]):
                self.assertIn(value, str(caught.exception))
            file.write_text(original)

    def test_identities_are_checked_independently_of_complete_letters(self):
        for size in SIZES:
            file = self.letters_root / ("letters-" + size) / "letters-compare-488d.json"
            original = file.read_text()
            record = json.loads(original)
            record["identities"] = [record["identities"][0]] * len(record["identities"])
            file.write_text(json.dumps(record))
            # DERIVED: the duplicate first identity cannot witness identity one.
            with self.assertRaisesRegex(ValueError, "letters-" + size + ".*identities.*duplicated=\\[0\\].*missing=\\[1,"):
                self.load()
            file.write_text(original)

    def test_unique_labels_cannot_hide_a_duplicate_station(self):
        file = self.letters_root / "letters-8ft/letters-compare-488d.json"
        record = json.loads(file.read_text())
        # DERIVED: the two PF-01 axes must have distinct station measurements.
        record["rows"][1]["measures"] = record["rows"][0]["measures"]
        file.write_text(json.dumps(record))
        with self.assertRaisesRegex(ValueError, "stations.*duplicated=.*length.*missing=.*width"):
            self.load()

    def test_foreign_feature_station_or_label_refuses_with_same_count(self):
        file = self.letters_root / "letters-8ft/letters-compare-488d.json"
        original = file.read_text()
        for field in ("feature", "measures", "letter"):
            with self.subTest(field=field):
                record = json.loads(original)
                record["rows"][0][field] = "foreign"
                file.write_text(json.dumps(record))
                with self.assertRaisesRegex(ValueError, "key census:.*missing=.*extra=.*foreign"):
                    self.load()
                file.write_text(original)

    def test_swapped_labels_do_not_relabel_stations_within_one_feature(self):
        file = self.letters_root / "letters-8ft/letters-compare-488d.json"
        record = json.loads(file.read_text())
        first, second = record["rows"][:2]  # DERIVED: the PF-01 length and width stations.
        first["letter"], second["letter"] = second["letter"], first["letter"]
        file.write_text(json.dumps(record))
        with self.assertRaisesRegex(ValueError, "labels.*missing=.*PF-01.*extra=.*PF-01"):
            self.load()

    def test_missing_extra_or_foreign_identity_refuses(self):
        file = self.letters_root / "letters-8ft/letters-compare-488d.json"
        original = file.read_text()
        for mutation in ("missing", "extra", "foreign"):
            with self.subTest(mutation=mutation):
                record = json.loads(original)
                if mutation == "missing":
                    record["identities"].pop()
                elif mutation == "extra":
                    record["identities"].append(dict(n="foreign", status="HOLDS"))
                else:
                    record["identities"][0]["n"] = "foreign"
                file.write_text(json.dumps(record))
                with self.assertRaisesRegex(ValueError, "identities.*key census"):
                    self.load()
                file.write_text(original)

    def test_reordered_rows_and_identities_remain_valid(self):
        for size in SIZES:
            file = self.letters_root / ("letters-" + size) / "letters-compare-488d.json"
            record = json.loads(file.read_text())
            record["rows"].reverse()
            record["identities"].reverse()
            file.write_text(json.dumps(record))
        self.assertEqual(set(self.load()), set(SIZES))

    def test_each_size_refuses_foreign_model_law_or_definition_with_named_digests(self):
        other = hashlib.sha256(b"foreign reference").hexdigest()
        for size in SIZES:
            file = self.letters_root / ("letters-" + size) / "letters-compare-488d.json"
            original = file.read_text()
            for field in ("spec_sha256", "sampling_method.law_sha256",
                          "sampling_method.purchased_model.model_obj_set_sha256"):
                with self.subTest(size=size, field=field):
                    record = json.loads(original)
                    parent = record
                    keys = field.split(".")
                    for key in keys[:-1]:
                        parent = parent[key]
                    expected = parent[keys[-1]]
                    parent[keys[-1]] = other
                    file.write_text(json.dumps(record))
                    with self.assertRaises(ValueError) as caught:
                        self.load()
                    for value in ("letters-" + size, field, other, expected):
                        self.assertIn(value, str(caught.exception))
                    file.write_text(original)

    def test_missing_instrument_map_refuses_instead_of_skipping_the_binding(self):
        file = self.letters_root / "letters-8ft/letters-compare-488d.json"
        record = json.loads(file.read_text())
        record["sampling_method"]["instruments"] = {}
        file.write_text(json.dumps(record))
        with self.assertRaisesRegex(ValueError, "letters-8ft.*sampling_method.instruments"):
            self.load()


    def test_missing_census_refuses_each_size(self):
        for size in SIZES:
            file = self.letters_root / ("letters-" + size) / "letters-compare-488d.json"
            original = file.read_text()
            record = json.loads(original)
            del record["evidence_starved"]
            file.write_text(json.dumps(record))
            with self.assertRaisesRegex(ValueError, "letters-" + size + ".*evidence_starved.*supplied None"):
                self.load()
            file.write_text(original)

    def test_falsy_non_list_census_is_not_an_empty_list(self):
        file = self.letters_root / "letters-8ft/letters-compare-488d.json"
        record = json.loads(file.read_text())
        for value in (None, {}, "", False):
            with self.subTest(value=value):
                record["evidence_starved"] = value
                file.write_text(json.dumps(record))
                with self.assertRaisesRegex(ValueError, "letters-8ft.*evidence_starved"):
                    self.load()

    def test_green_letters_and_identities_do_not_override_named_census_failures(self):
        file = self.letters_root / "letters-8ft/letters-compare-488d.json"
        record = json.loads(file.read_text())
        entries = ["trap cups: five instead of six", "missing census witness"]
        record["evidence_starved"] = entries
        file.write_text(json.dumps(record))
        with self.assertRaises(ValueError) as caught:
            self.load()
        for value in ("letters-8ft", "evidence_starved", *entries):
            self.assertIn(value, str(caught.exception))


class DrawingBindings(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.drawings = self.root / "drawings"
        self.drawings.mkdir()
        self.letters = {}
        self.records = []
        for size in SIZES:
            directory = self.root / ("letters-" + size)
            twin = directory / "twin"
            twin.mkdir(parents=True)
            self.letters[size] = directory / "letters-compare-488d.json"
            digests = {}
            for sheet in ("s2-side", "s4-rail-apron-elevation"):
                # TESSELLATION: synthetic document tokens, not MODEL geometry.
                content = f"<svg>{size} {sheet} current</svg>".encode()
                original = self.drawings / f"{size}-{sheet}.svg"
                original.write_bytes(content)
                svg = twin / f"canonical-current-{sheet}.svg"
                svg.write_bytes(content)
                digests[svg.name] = sha(svg)
                self.records.append(dict(size=size, sheet=sheet, svg_sha256=sha(original)))
            self.letters[size].write_text(json.dumps(dict(twin=dict(svg_sha256=digests))))

    def bind(self):
        return bind_drawings(dict(records=self.records), self.drawings, self.letters)

    def test_all_supplied_originals_match_the_bound_letters_twins(self):
        bindings = self.bind()
        self.assertEqual(len(bindings), len(self.records))
        for row in bindings:
            self.assertEqual(row["svg_sha256"], row["letters_twin_sha256"])
            self.assertEqual(row["svg_sha256"], row["letters_recorded_svg_sha256"])

    def test_identical_stale_copies_do_not_rebind_the_recorded_generation(self):
        for row in self.records:
            name = f"{row['size']}-{row['sheet']}.svg"
            supplied = self.drawings / name
            canonical = self.letters[row["size"]].parent / "twin" / f"canonical-current-{row['sheet']}.svg"
            original = supplied.read_bytes()
            recorded = sha(canonical)
            supplied.write_bytes(b"<svg>identical stale copies</svg>")
            canonical.write_bytes(supplied.read_bytes())
            row["svg_sha256"] = sha(supplied)
            try:
                with self.assertRaises(ValueError) as caught:
                    self.bind()
                for value in (str(canonical), recorded, sha(supplied)):
                    self.assertIn(value, str(caught.exception))
            finally:
                supplied.write_bytes(original)
                canonical.write_bytes(original)
                row["svg_sha256"] = sha(supplied)

    def test_self_consistent_stale_manifest_cannot_rebind_the_svg(self):
        row = self.records[-1]
        name = f"{row['size']}-{row['sheet']}.svg"
        supplied = self.drawings / name
        supplied.write_bytes(b"<svg>stale definition</svg>")
        row["svg_sha256"] = sha(supplied)  # DERIVED: the old manifest check alone passes.
        canonical = self.letters[row["size"]].parent / "twin" / f"canonical-current-{row['sheet']}.svg"
        with self.assertRaises(ValueError) as caught:
            self.bind()
        for value in (name, sha(supplied), sha(canonical)):
            self.assertIn(value, str(caught.exception))

    def test_missing_canonical_twin_refuses(self):
        row = self.records[0]
        twin = self.letters[row["size"]].parent / "twin"
        (twin / f"canonical-current-{row['sheet']}.svg").unlink()
        with self.assertRaisesRegex(ValueError, "9ft-s2-side.svg canonical.*missing=.*s2-side"):
            self.bind()

    def test_ambiguous_canonical_twin_refuses(self):
        row = self.records[0]
        twin = self.letters[row["size"]].parent / "twin"
        (twin / f"canonical-stale-{row['sheet']}.svg").write_bytes(b"<svg>old</svg>")
        with self.assertRaisesRegex(ValueError, "9ft-s2-side.svg canonical.*duplicated=.*s2-side"):
            self.bind()

    def test_drawing_without_a_bound_letters_size_refuses(self):
        self.records[0]["size"] = "unbound"
        with self.assertRaisesRegex(ValueError, "drawings sheets.*extra=.*unbound.*s2-side"):
            self.bind()

    def test_six_copies_cannot_replace_six_required_sheets(self):
        # DERIVED: preserve the six-row count while omitting five required keys.
        self.records = [self.records[0]] * len(self.records)
        with self.assertRaises(ValueError) as caught:
            self.bind()
        for value in ("drawings sheets", 'duplicated=[["9ft", "s2-side"]]', "missing=",
                      '["9ft", "s4-rail-apron-elevation"]', '["8ft", "s2-side"]', '["7ft", "s2-side"]'):
            self.assertIn(value, str(caught.exception))

    def test_missing_extra_and_foreign_sheet_refuse(self):
        original = copy.deepcopy(self.records)
        for mutation in ("missing", "extra", "foreign"):
            with self.subTest(mutation=mutation):
                self.records = copy.deepcopy(original)
                if mutation == "missing":
                    self.records.pop()
                elif mutation == "extra":
                    self.records.append(dict(size="8ft", sheet="foreign"))
                else:
                    self.records[0]["sheet"] = "foreign"
                with self.assertRaisesRegex(ValueError, "drawings sheets.*key census"):
                    self.bind()

    def test_reordered_sheets_pass_without_mutation(self):
        self.records.reverse()
        original = copy.deepcopy(self.records)
        self.bind()
        self.assertEqual(self.records, original)


class ByteControlKeys(unittest.TestCase):
    def setUp(self):
        self.fence = json.loads((pack.ROOT / "tools/render/d621/law/cushion_fence_621.json").read_text())
        targets = {"diamond_proam_" + size for size in SIZES}
        self.identity = dict(byte_controls=[dict(table=table, identical=True)
            for table in self.fence["entry_snapshot"]["entries"] if table not in targets])
        alias = next(row for row in self.identity["byte_controls"]
                     if pack.idmap.current_table_id(row["table"]) == "pool_pro_9ft_measured")
        alias.update(identical=False, accepted=True)

    def test_complete_controls_in_any_order_pass_unchanged(self):
        self.identity["byte_controls"].reverse()
        original = copy.deepcopy(self.identity)
        require_byte_controls(self.identity, self.fence)
        self.assertEqual(self.identity, original)

    def test_duplicate_control_cannot_replace_another_table(self):
        rows = self.identity["byte_controls"]
        missing, duplicated = rows[-1]["table"], rows[0]["table"]
        rows[-1] = copy.deepcopy(rows[0])
        with self.assertRaises(ValueError) as caught:
            require_byte_controls(self.identity, self.fence)
        for value in ("byte controls", 'duplicated=["' + duplicated + '"]', 'missing=["' + missing + '"]'):
            self.assertIn(value, str(caught.exception))

    def test_extra_control_cannot_expand_the_required_set(self):
        self.identity["byte_controls"].append(dict(table="foreign", identical=True))
        with self.assertRaisesRegex(ValueError, "byte controls.*extra=.*foreign"):
            require_byte_controls(self.identity, self.fence)

    def test_foreign_control_cannot_replace_a_required_table(self):
        row = self.identity["byte_controls"][0]
        missing = row["table"]
        row["table"] = "foreign"
        with self.assertRaisesRegex(ValueError, "byte controls.*missing=.*" + missing + ".*extra=.*foreign"):
            require_byte_controls(self.identity, self.fence)

    def test_owner_alias_still_needs_its_ruling(self):
        alias = next(row for row in self.identity["byte_controls"]
                     if pack.idmap.current_table_id(row["table"]) == "pool_pro_9ft_measured")
        alias["accepted"] = False
        with self.assertRaisesRegex(ValueError, "ruled owner-alias"):
            require_byte_controls(self.identity, self.fence)


class SectionKeys(unittest.TestCase):
    def setUp(self):
        self.section = dict(sections=[f"sections/{rail}-before-after-model.png" for rail in RAIL_STEMS],
                            nose_figures=[f"sections/{rail}-nose-facets.png" for rail in RAIL_STEMS])

    def test_complete_sections_in_any_order_pass_unchanged(self):
        for rows in self.section.values():
            rows.reverse()
        original = copy.deepcopy(self.section)
        require_section_keys(self.section)
        self.assertEqual(self.section, original)

    def test_duplicate_missing_extra_and_foreign_plate_refuse(self):
        for field in self.section:
            original = self.section[field].copy()
            for mutation in ("duplicate", "missing", "extra", "foreign"):
                with self.subTest(field=field, mutation=mutation):
                    rows = original.copy()
                    if mutation == "duplicate":
                        rows[-1] = rows[0]
                    elif mutation == "missing":
                        rows.pop()
                    elif mutation == "extra":
                        rows.append("foreign.png")
                    else:
                        rows[-1] = "foreign.png"
                    self.section[field] = rows
                    with self.assertRaisesRegex(ValueError, "sections " + field + ".*key census"):
                        require_section_keys(self.section)
                    self.section[field] = original


class RegisterFrameKeys(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.frame = self.root / "frame.png"
        self.frame.write_bytes(b"synthetic captured frame")
        # DERIVED: standing one-times register selection, plus a distinct crop.
        self.frames = [dict(register="r1_corner_macro", zoom=zoom, file=self.frame.name, sha256=sha(self.frame))
                       for zoom in (1, 2)]

    def select(self):
        (self.root / "manifest.json").write_text(json.dumps(dict(frames=self.frames)))
        return selected_frame(self.root, "r1_corner_macro")

    def test_one_requested_frame_passes(self):
        self.assertEqual(self.select(), self.frame)

    def test_missing_or_duplicate_requested_frame_refuses_by_name(self):
        original = self.frames.copy()
        for frames, problem in ((original[1:], "missing"), ([*original, original[0]], "duplicated")):
            with self.subTest(problem=problem):
                self.frames = frames
                with self.assertRaisesRegex(ValueError, "register .*" + problem + ".*r1_corner_macro"):
                    self.select()


class ReferencePhotoRoot(unittest.TestCase):
    """The committed plan names the dossier photos as <drive>/...: under a Drive root that holds them, every register
    resolves and the pack's real triptych() composes it (stub images stand in for the private photos and frames)."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.rows = json.loads((pack.ROOT / "tools/render/d621/card/poses-plan3.json").read_text())
        self.drive = self.root / "drive"
        self.stubs = []
        for row in self.rows:
            # photo_override wins over photo: only the photo the pack reads gets a stub
            path = (row.get("photo_override") or dict(path=row["photo"]))["path"]
            self.assertTrue(path.startswith("<drive>/"), path)
            stub = self.drive / path[len("<drive>/"):]
            stub.parent.mkdir(parents=True, exist_ok=True)
            Image.new("RGB", (40, 30), "gray").save(stub)
            self.stubs.append(stub)
        self.frame = self.root / "frame.png"
        Image.new("RGB", (40, 30), "white").save(self.frame)

    def test_every_register_resolves_under_the_drive_root_and_composes_its_triptych(self):
        photos = pack.reference_photos(self.rows, self.drive)
        self.assertEqual(sorted(photo for photo, _ in photos.values()), sorted(self.stubs))
        for register, (photo, note) in photos.items():
            output = self.root / (register + ".png")
            pack.triptych(self.frame, self.frame, photo, output, "O22 / test / " + register, "PHOTO / DOSSIER", note)
            self.assertTrue(output.is_file())

    def test_the_note_follows_the_photo_override(self):
        photos = pack.reference_photos(self.rows, self.drive)
        for row in self.rows:
            self.assertEqual(photos[row["id"]][1], (row.get("photo_override") or dict(note=row["photo_note"]))["note"])

    def test_the_drive_root_defaults_to_OB_DRIVE_DIR(self):
        with patch.dict(os.environ, {"OB_DRIVE_DIR": str(self.drive)}):
            self.assertEqual(sorted(photo for photo, _ in pack.reference_photos(self.rows).values()), sorted(self.stubs))

    def test_a_relative_drive_root_resolves_against_the_callers_cwd(self):
        self.addCleanup(os.chdir, os.getcwd())
        os.chdir(self.root)
        with patch.dict(os.environ, {"OB_DRIVE_DIR": "drive"}):
            resolved = [pack.reference_photos(self.rows, "drive"), pack.reference_photos(self.rows)]
        os.chdir(self.drive)  # from another cwd the resolved paths still name the stubs
        for photos in resolved:
            self.assertTrue(all(photo.is_absolute() and photo.is_file() for photo, _ in photos.values()))
            self.assertEqual(sorted(photo.resolve() for photo, _ in photos.values()), sorted(stub.resolve() for stub in self.stubs))

    def test_no_drive_root_refuses_by_register(self):
        with patch.dict(os.environ):
            os.environ.pop("OB_DRIVE_DIR", None)
            with self.assertRaisesRegex(ValueError, "register .*needs --drive-root DIR or OB_DRIVE_DIR"):
                pack.reference_photos(self.rows)

    def test_a_photo_missing_under_the_root_refuses_by_register(self):
        self.stubs[0].unlink()
        with self.assertRaisesRegex(ValueError, "register " + self.rows[0]["id"] + ": reference photo not found"):
            pack.reference_photos(self.rows, self.drive)

    def test_an_unknown_placeholder_refuses(self):
        row = {key: value for key, value in self.rows[0].items() if key != "photo_override"}
        with self.assertRaisesRegex(ValueError, "unknown placeholder"):
            pack.reference_photos([dict(row, photo="<archive>/photo.jpg")], self.drive)

    def test_a_drive_root_inside_quarantine_refuses(self):
        quarantined = self.root / "ob-3dm-quarantine"
        self.drive.rename(quarantined)
        with self.assertRaisesRegex(ValueError, "cannot leave quarantine"):
            pack.reference_photos(self.rows, quarantined)


if __name__ == "__main__":
    unittest.main()
