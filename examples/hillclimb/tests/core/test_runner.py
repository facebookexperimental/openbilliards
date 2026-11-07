# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The runner: task order, agent building, and results that do not depend on the worker count."""

import json
import unittest

from hillclimb import crn, runner, toy
from hillclimb.protocol import AgentSpec


def canonical(records):
    return json.dumps(records, sort_keys=True, separators=(",", ":"))


def square(x):
    return x * x


class RunTest(unittest.TestCase):
    def test_results_come_back_in_task_order(self):
        tasks = [5, 3, 9, 1, 7, 2]
        self.assertEqual(runner.run(square, tasks), [25, 9, 81, 1, 49, 4])
        self.assertEqual(runner.run(square, tasks, workers=3), [25, 9, 81, 1, 49, 4])
        self.assertEqual(runner.run(square, [], workers=4), [])
        self.assertEqual(runner.run(square, [4], workers=4), [16])

    def test_a_task_error_is_raised_here(self):
        with self.assertRaises(TypeError):
            runner.run(square, [1, "x"], workers=2)


class BuildTest(unittest.TestCase):
    def test_build_calls_the_named_function_with_the_spec(self):
        agent = runner.build(toy.spec(aim=0.25))
        self.assertIsInstance(agent, toy.ToyAgent)
        self.assertEqual(agent.aim, 0.25)

    def test_a_malformed_builder_is_refused(self):
        for builder in ("hillclimb.toy", "hillclimb.toy:", ":build"):
            with self.subTest(builder=builder):
                with self.assertRaises(ValueError):
                    runner.build(AgentSpec(builder))


class PlayTest(unittest.TestCase):
    TARGET = toy.ToyRun(cap=25, m=8)

    def test_records_in_key_order(self):
        keys = crn.game_keys("hillclimb/tests/runner", 6)
        records = runner.play(self.TARGET, toy.spec(aim=0.5), keys)
        self.assertEqual([r["key"] for r in records], keys)

    def test_one_and_four_workers_give_byte_equal_records(self):
        keys = crn.game_keys("hillclimb/tests/runner", 24)
        spec = toy.spec(aim=0.6)
        alone = runner.play(self.TARGET, spec, keys, workers=1)
        pooled = runner.play(self.TARGET, spec, keys, workers=4)
        self.assertEqual(canonical(alone), canonical(pooled))
        self.assertEqual(self.TARGET.value(alone), self.TARGET.value(pooled))

    def test_a_game_depends_on_its_key_only(self):
        keys = crn.game_keys("hillclimb/tests/runner", 8)
        spec = toy.spec(aim=0.6)
        forward = runner.play(self.TARGET, spec, keys)
        backward = runner.play(self.TARGET, spec, list(reversed(keys)))
        self.assertEqual(canonical(forward), canonical(list(reversed(backward))))


if __name__ == "__main__":
    unittest.main()
