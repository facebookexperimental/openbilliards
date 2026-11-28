# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The material fence reads every ordered transition, including absent data."""
import copy
import unittest

from matidentity_rox import transition_rows


class TransitionIdentityTests(unittest.TestCase):
    def census(self):
        def material(color):
            return {"meshes": 1, "rows": [{"key": "dm-sight-0", "name": "dm-sight-0", "slots": [
                {"color": color, "metalness": 0, "roughness": 0.85, "envMapIntensity": 0.05}]}]}
        return {"b": "rasson_ox_9ft", "tables": ["chinese8_pro_9ft"],
                "oxFreshMaterials": material("8a8274"), "pairs": [{
                    "a": "chinese8_pro_9ft", "S0": {"tableBuilt": "chinese8_pro_9ft"},
                    "Sb": {"tableBuilt": "rasson_ox_9ft"}, "S1": {"tableBuilt": "chinese8_pro_9ft"},
                    "materials": {"fresh": material("c9a227"), "incoming": material("8a8274"),
                                  "outgoing": material("c9a227")}}]}

    def test_both_directions_are_binding(self):
        census = self.census()
        self.assertTrue(all(not diffs for diffs in transition_rows(census, census["tables"]).values()))
        census["pairs"][0]["materials"]["incoming"]["rows"][0]["slots"][0].update(
            color="c9a227", metalness=0.7, roughness=0.35)
        rows = transition_rows(census, census["tables"])
        self.assertEqual([row[1] for row in rows["chinese8_pro_9ft/A-to-OX"]],
                         ["slot 0 color", "slot 0 roughness", "slot 0 metalness"])
        self.assertFalse(rows["chinese8_pro_9ft/OX-to-A"])

    def test_empty_or_partial_census_cannot_pass(self):
        census = self.census()
        census["pairs"] = []
        self.assertTrue(transition_rows(census, census["tables"])["coverage"])
        census = self.census()
        census["oxFreshMaterials"]["rows"] = []
        self.assertTrue(transition_rows(census, census["tables"])["fresh-OX"])

    def test_duplicate_pair_and_wrong_renderer_are_refused(self):
        census = self.census()
        census["pairs"].append(copy.deepcopy(census["pairs"][0]))
        self.assertTrue(transition_rows(census, census["tables"])["coverage"])
        census = self.census()
        census["pairs"][0]["Sb"]["tableBuilt"] = "chinese8_pro_9ft"
        self.assertTrue(transition_rows(census, census["tables"])["chinese8_pro_9ft/A-to-OX"])


if __name__ == "__main__":
    unittest.main()
