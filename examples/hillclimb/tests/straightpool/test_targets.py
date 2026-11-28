# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Our target specifications, their registration, the base agent's parameters and the run-length
target's estimator, without the kernel."""

import math
import os
import tempfile
import unittest
from fractions import Fraction
from unittest import mock

from hillclimb import climb, measure
from hillclimb.protocol import DecisionRule, SetParams
from straightpool import envelope, targets


class SpecTest(unittest.TestCase):
    def test_the_unit(self):
        unit = targets.UNIT
        self.assertEqual((unit.noise, unit.cap, unit.m), (0.1, 1000, 128))
        self.assertEqual(unit, targets.level(0.1))
        self.assertEqual(targets.level(0.25, cap=50, m=4).noise, 0.25)

    def test_the_estimator_is_named_for_the_measurement_records(self):
        # climb.climb_step names a measurement by the target's `estimator` attribute.
        self.assertEqual(targets.UNIT.estimator, "conditional-monte-carlo")
        self.assertEqual(targets.level(0.4, cap=1, m=2).estimator, "conditional-monte-carlo")

    def test_only_the_public_levels_are_named(self):
        self.assertEqual(targets.LEVELS, (0.1, 0.25, 0.40))

    def test_the_hard_target_bars(self):
        hard = targets.HARD_TARGET
        self.assertEqual((hard.noise, hard.mean, hard.horizon), (0.1, 200, 45))
        self.assertEqual(hard.mean_bar, Fraction(2000, 9))
        self.assertEqual(hard.survival_bar, (Fraction(4, 5), Fraction(9, 10)))
        self.assertTrue(measure.meets_bar(Fraction(2000, 9), hard.mean_bar))
        self.assertFalse(measure.meets_bar(Fraction(1999, 9), hard.mean_bar))
        bar = 0.8 ** 0.9
        self.assertTrue(hard.met(Fraction(2000, 9), Fraction(bar + 1e-12)))
        self.assertFalse(hard.met(Fraction(2000, 9), Fraction(bar - 1e-12)))
        self.assertFalse(hard.met(Fraction(2000, 9) - Fraction(1, 10 ** 9), 1))
        self.assertFalse(hard.met(math.inf, 1))
        self.assertFalse(hard.met(None, 1))

    def test_the_envelopes_are_the_envelope_modules(self):
        self.assertEqual(targets.ENVELOPES, {"v1": envelope.V1, "v2": envelope.V2})


class BaselineLabelTest(unittest.TestCase):
    def test_the_recorded_baseline_is_labelled(self):
        from straightpool import base_agent
        label = base_agent.LABEL
        self.assertEqual((label["point"], label["n"], label["noise"]), (7.08, 100, 0.1))
        self.assertEqual(label["key"], "internal research log, row 89")
        self.assertTrue(label["envelope"].startswith("not in-envelope"))
        self.assertEqual(sorted(label), sorted(("key", "date", "point", "interval", "n",
                                                "estimator", "envelope", "noise", "kernel")))


class RegistrationTest(unittest.TestCase):
    def test_a_registration_pins_the_cap_and_m_that_the_name_leaves_out(self):
        from straightpool import base_agent
        levers = [SetParams("flat surface", {"leave": False})]
        settings = dict(namespace="hillclimb/tests/straightpool/registered", n=10,
                        rule=DecisionRule(), seed="hillclimb/tests/straightpool/registered/boot")
        self.assertEqual(targets.level(0.1, cap=1000).name, targets.level(0.1, cap=29).name)
        no_game = mock.patch("hillclimb.runner.play", side_effect=AssertionError("a game ran"))
        with tempfile.TemporaryDirectory() as directory, no_game:
            path = os.path.join(directory, "registration.json")
            climb.register(path, targets.level(0.1, cap=1000), base_agent.spec(), levers,
                           **settings)
            for target in (targets.level(0.1, cap=29), targets.level(0.1, m=64)):
                with self.subTest(target=target):
                    with self.assertRaises(ValueError):  # refused before any game
                        climb.climb(target, base_agent.spec(), levers, registration=path,
                                    **settings)


class AgentIdentityTest(unittest.TestCase):
    def test_no_speed_only_setting_is_part_of_the_agent(self):
        # Speed comes from the worker count of a run, which no spec or record holds.
        from straightpool import base_agent
        self.assertNotIn("threads", base_agent.DEFAULTS)
        with self.assertRaises(ValueError):
            base_agent.build(base_agent.spec(threads=4))


class EstimatorTest(unittest.TestCase):
    def test_value_is_the_conditional_monte_carlo_estimate(self):
        target = targets.level(0.1, cap=50, m=4)
        records = [{"run": 3, "misses": [0, 1, 0, 4]}, {"run": 0, "misses": [2]},
                   {"run": 5, "misses": [0, 0, 0, 0, 0, 3]}]
        self.assertEqual(target.value(records), Fraction(4 * 8, 10))
        self.assertEqual(target.value(records),
                         measure.run_length([(3, 5), (0, 2), (5, 3)], 4))
        self.assertEqual(target.value([{"run": 2, "misses": [0, 0]}]), measure.INF)

    def test_reached_is_the_indicator_form(self):
        records = [{"run": 50}, {"run": 44}, {"run": 45}, {"run": 0}]
        self.assertEqual(targets.reached(records, 45), Fraction(1, 2))
        self.assertIsNone(targets.reached([], 45))


if __name__ == "__main__":
    unittest.main()
