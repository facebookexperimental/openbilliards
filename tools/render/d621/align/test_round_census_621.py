# Copyright (c) Meta Platforms, Inc. and affiliates.

"""C2: provenance, rather than feature IDs or changed numbers, defines the fence."""
import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from round_census_621 import cage_provenance_census, comparison_base, d3_merge_admissions, numeric_changes, provenance_refusals


class CageProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.feature = dict(
            id="unlisted-future-measurement",
            value_mm=0.8,  # TESSELLATION: retained cage option; fixture only.
            source=dict(tier="TESSELLATION"),
            provenance=dict(tag="TESSELLATION"),
            measurement_provenance=dict(
                mode="TESSELLATION CAGE READ", unapplied_modifiers=["TurboSmooth"],
                measurement_path="reference.cage.statistics.circle_radius_mm",
                record_sha256="fixture-record"))

    def result(self, feature=None):
        return cage_provenance_census(dict(features=[feature or self.feature]))

    def test_cage_leaf_is_derived_without_known_id(self):
        result = self.result()
        self.assertEqual(result["verdict"], "PASS")
        self.assertEqual([row["path"] for row in result["checked"]],
                         [["features", 0, "value_mm"]])  # DERIVED: fixture's first feature.

    def test_source_tier_red_arm_names_unchanged_leaf(self):
        self.feature["source"]["tier"] = "MODEL"
        result = self.result()
        self.assertEqual(result["verdict"], "FAIL")
        self.assertEqual(result["offenders"][0]["id"], self.feature["id"])
        self.assertEqual(result["offenders"][0]["path"],
                         ["features", 0, "source", "tier"])  # DERIVED: exact offending path.

    def test_provenance_tag_cannot_hide_behind_source_tier(self):
        self.feature["provenance"]["tag"] = "MODEL"
        result = self.result()
        self.assertEqual(result["verdict"], "FAIL")
        self.assertEqual(result["offenders"][0]["path"][-2:], ["provenance", "tag"])

    def test_nested_measurement_inherits_cage_surface(self):
        self.feature["read"] = dict(tag="MODEL", mean=0.8)  # TESSELLATION: same cage fixture.
        self.assertEqual(self.result()["verdict"], "FAIL")

    def test_value_provenance_claim_is_fenced(self):
        self.feature["value_provenance"] = dict(radius="MODEL: adjacent-face fit")
        self.assertEqual(self.result()["verdict"], "FAIL")

    def test_non_cage_model_measurement_is_not_relabelled(self):
        measured = copy.deepcopy(self.feature)
        measured["source"]["tier"] = measured["provenance"]["tag"] = "MODEL"
        measured["measurement_provenance"]["mode"] = "EVALUATED SURFACE READ"
        measured["measurement_provenance"]["unapplied_modifiers"] = []
        self.assertEqual(self.result(measured)["verdict"], "PASS")

    def test_cage_of_another_modifier_is_not_turbosmooth(self):
        self.feature["source"]["tier"] = "MODEL"
        self.feature["measurement_provenance"]["unapplied_modifiers"] = ["Shell"]
        self.assertEqual(self.result()["checked"], [])

    def test_ruled_straight_plan_does_not_promote_its_unmeasured_round(self):
        # MODEL / TESSELLATION: C7's mixed source is distinguished by dimension.
        measured = dict(id="another-future-plan-leaf", value=dict(
            straight=dict(tag="MODEL", leg_mm=76.1),
            finish=dict(tag="TESSELLATION", radius_mm=1.78)),
            measurement_provenance=dict(mode="MODEL PLAN CHAMFER (C7 CROSS-CHECK ruling)",
                unapplied_modifiers=["TurboSmooth"], smooth_surface_radius_measured=False))
        self.assertEqual(self.result(measured)["verdict"], "PASS")
        measured["value"]["finish"]["tag"] = "MODEL"
        result = self.result(measured)
        self.assertEqual(result["verdict"], "FAIL")
        self.assertEqual(result["offenders"][0]["path"][-3:], ["value", "finish", "tag"])

    def test_unmeasured_radius_claim_in_nested_provenance_is_fenced(self):
        # TESSELLATION: a new ID and different radius field cannot bypass C7.
        measured = dict(id="not-RC-01", fillet_radius_mm=1.78,
            provenance=dict(tag="MODEL"), measurement_provenance=dict(
                unapplied_modifiers=["TurboSmooth"], smooth_surface_radius_measured=False))
        self.assertEqual(self.result(measured)["verdict"], "FAIL")


class ScalarProvenanceTests(unittest.TestCase):
    def test_nested_scalar_leaves_do_not_crash_or_claim_a_tier(self):
        # DERIVED: mixed JSON containers retain only their numeric measurements.
        document = dict(tag="DERIVED", values=["a note", None, True, [2], dict(value=3)])
        rows = numeric_changes(document)
        self.assertEqual([row["value"] for row in rows], [2, 3])
        self.assertTrue(all(row["tagged"] for row in rows))
        self.assertEqual(provenance_refusals(document), [])

    def test_string_provenance_is_a_named_refusal_not_a_tag(self):
        # MODEL: the scalar radius remains unchanged; its provenance is malformed.
        document = dict(value_mm=1.93, provenance="MODEL")
        self.assertFalse(numeric_changes(document)[0]["tagged"])
        refusal = provenance_refusals(dict(features=[document]))
        self.assertEqual(refusal, [dict(path=["features", 0, "provenance"],
                                       reason="provenance must be an object carrying an explicit tag",
                                       value_type="str")])

    def test_unchanged_number_cannot_hide_a_new_scalar_provenance(self):
        # MODEL: the red arm changes only the provenance object's type.
        before = dict(value_mm=1.93, provenance=dict(tag="MODEL"))
        after = dict(before, provenance="MODEL")
        self.assertEqual(numeric_changes(after, before), [])
        self.assertTrue(provenance_refusals(after))

    def test_container_provenance_is_rejected_without_scalar_get(self):
        document = dict(provenance=["MODEL"], value_mm=1.93)  # MODEL: malformed receipt fixture.
        self.assertEqual(provenance_refusals(document)[0]["value_type"], "list")
        self.assertFalse(numeric_changes(document)[0]["tagged"])


class MainFoldScopeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.name", "Census fixture")
        self.git("config", "user.email", "census@example.invalid")
        self.git("config", "core.hooksPath", "/dev/null")
        self.write("shared.txt", "root\n")
        self.commit("root")
        self.git("checkout", "-qb", "lane")
        self.write("shared.txt", "pre-O22 lane\n")
        self.write("inherited-lane.json", json.dumps(dict(value=17)))  # DERIVED: inherited fixture.
        self.origin = self.commit("pre-O22 lane")
        self.write("tools/render/d621/law/cushion_fence_621.json", "{}\n")
        self.write("tools/render/d621/new-measurement.json", json.dumps(dict(value=19)))  # DERIVED: new O22 fixture.
        self.commit("introduce O22 fence and measurement")
        self.git("checkout", "-q", "main")
        self.write("shared.txt", "incoming main\n")
        self.write("imported-main.json", json.dumps(dict(provenance="main metadata")))
        self.main = self.commit("incoming main")
        self.git("checkout", "-q", "lane")
        self.git("merge", "-q", "--no-edit", "-Xours", "main")

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.repo), *args],
                                       stderr=subprocess.PIPE, text=True).strip()

    def write(self, name, value):
        path = self.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value)

    def commit(self, message):
        self.git("add", "-A")
        self.git("commit", "-qm", message)
        return self.git("rev-parse", "HEAD")

    def test_fold_excludes_inherited_work_but_keeps_new_o22_changes(self):
        result = comparison_base(self.repo, "HEAD", self.origin, "main")
        self.assertEqual(result["merge_base"], self.main)
        self.assertEqual(self.git("show", result["comparison_tree"] + ":shared.txt"), "pre-O22 lane")
        changes = self.git("diff", "--name-only", result["comparison_tree"], "HEAD").splitlines()
        self.assertEqual(changes, ["tools/render/d621/law/cushion_fence_621.json",
                                   "tools/render/d621/new-measurement.json"])

    def test_later_main_fold_derives_a_new_base_without_a_literal(self):
        self.git("checkout", "-q", "main")
        self.write("later-main.txt", "new main content\n")
        later = self.commit("later main")
        self.git("checkout", "-q", "lane")
        self.git("merge", "-q", "--no-edit", "-Xours", "main")
        result = comparison_base(self.repo, "HEAD", self.origin, "main")
        self.assertNotEqual(result["merge_base"], self.main)
        self.assertEqual(result["merge_base"], later)
        self.assertNotIn("later-main.txt", self.git("diff", "--name-only", result["comparison_tree"], "HEAD"))

    def test_candidate_cannot_be_its_own_scope_origin(self):
        with self.assertRaisesRegex(ValueError, "fence introduction's parent"):
            comparison_base(self.repo, "HEAD", "HEAD", "main")

    def test_new_change_outside_o22_is_still_in_the_census_diff(self):
        self.write("inherited-lane.json", "{\"value\":23}\n")  # DERIVED: forbidden change after the scope origin.
        self.commit("mutate an inherited non-target")
        result = comparison_base(self.repo, "HEAD", self.origin, "main")
        self.assertIn("inherited-lane.json", self.git("diff", "--name-only", result["comparison_tree"], "HEAD"))


class D3MergeAdmissions(unittest.TestCase):
    """D-3: an outside-fence path is admitted only when its diff vs main hashes to the studied form; a stale pin rejects."""

    def _repo(self):
        d = tempfile.mkdtemp(); run = lambda *a: subprocess.run(["git", "-C", d, *a], check=True, capture_output=True)
        run("init", "-q"); run("config", "user.email", "t@t"); run("config", "user.name", "t")
        Path(d, "f.txt").write_text("main\n"); run("add", "f.txt"); run("commit", "-q", "-m", "main")
        main = subprocess.check_output(["git", "-C", d, "rev-parse", "HEAD"], text=True).strip()
        Path(d, "f.txt").write_text("main\nlane\n"); run("commit", "-q", "-am", "lane")
        lane = subprocess.check_output(["git", "-C", d, "rev-parse", "HEAD"], text=True).strip()
        return d, main, lane

    def test_studied_form_is_admitted_and_a_stale_pin_rejects(self):
        import hashlib
        d, main, lane = self._repo()
        diff = subprocess.check_output(["git", "-C", d, "diff", "--no-color", "--no-ext-diff", "--no-renames", "--full-index", main, lane, "--", "f.txt"])
        pin = {"paths": {"f.txt": {"reason": "studied", "expected_diff_sha256": hashlib.sha256(diff).hexdigest()}}}
        still, admitted, rejected = d3_merge_admissions(d, lane, main, ["f.txt", "g.txt"], pin)
        self.assertEqual(still, ["g.txt"]); self.assertEqual([a["path"] for a in admitted], ["f.txt"]); self.assertEqual(rejected, [])
        stale = {"paths": {"f.txt": {"reason": "studied", "expected_diff_sha256": "0" * 64}}}
        still, admitted, rejected = d3_merge_admissions(d, lane, main, ["f.txt"], stale)
        self.assertEqual(still, ["f.txt"]); self.assertEqual(admitted, []); self.assertEqual(rejected[0]["path"], "f.txt")
        still, admitted, rejected = d3_merge_admissions(d, lane, main, ["f.txt"], None)
        self.assertEqual((still, admitted, rejected), (["f.txt"], [], []))


if __name__ == "__main__":
    unittest.main()
