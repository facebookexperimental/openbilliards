# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The toy target: its record, its estimator and its agent."""

import unittest

from hillclimb import _siblings, crn, toy
from hillclimb.protocol import Agent, Target

STREAM = _siblings.load("noise_stream")


class ToyTest(unittest.TestCase):
    def test_protocols(self):
        self.assertIsInstance(toy.ToyRun(), Target)
        self.assertIsInstance(toy.build(toy.spec(aim=0.3)), Agent)
        self.assertEqual(toy.spec(aim=0.3).builder, toy.BUILDER)
        self.assertEqual(toy.build(toy.spec()).aim, 0.0)

    def test_a_game_record(self):
        target = toy.ToyRun(cap=30, m=6)
        agent = toy.build(toy.spec(aim=0.4))
        key = crn.game_keys("hillclimb/tests/toy", 1)[0]
        record = target.play(agent, key)
        run, misses = record["run"], record["misses"]
        self.assertEqual(record["key"], key)
        self.assertEqual(len(misses), min(run + 1, 30))
        self.assertTrue(all(0 <= x <= 6 for x in misses))
        for i in range(run):  # every scored stroke landed inside the window
            self.assertLessEqual(abs(0.4 + STREAM.standard_normals(key, i)[0]), toy.WINDOW)
        if run < 30:
            self.assertGreater(abs(0.4 + STREAM.standard_normals(key, run)[0]), toy.WINDOW)
        self.assertEqual(target.play(agent, key), record)

    def test_value_is_the_conditional_monte_carlo_estimate(self):
        target = toy.ToyRun(m=4)
        records = [{"key": 1, "run": 3, "misses": [0, 1, 0, 2]},
                   {"key": 2, "run": 0, "misses": [3]}]
        self.assertEqual(target.value(records), 4 * 3 / 6)


if __name__ == "__main__":
    unittest.main()
