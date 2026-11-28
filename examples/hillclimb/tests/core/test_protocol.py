# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The protocol records: the decision rule table, the JSON forms and the common lever."""

import json
import math
import unittest
from fractions import Fraction

from hillclimb import protocol
from hillclimb.protocol import (ADOPT, INCONCLUSIVE, KILL, AgentSpec, DecisionRule, Lever,
                                Measurement, PairedDelta, SetParams, StepResult)


def delta(lower, upper, alpha=Fraction(1, 20)):
    return PairedDelta(point=None, interval=(lower, upper), n=10, alpha=alpha, replicates=100,
                       seed=1)


class DecisionRuleTest(unittest.TestCase):
    def test_the_table(self):
        rule = DecisionRule()
        cases = [
            ((Fraction(1, 3), 2), ADOPT),
            ((-2, Fraction(-1, 7)), KILL),
            ((-1, 1), INCONCLUSIVE),
            ((0, 3), INCONCLUSIVE),       # a lower bound at min_effect does not adopt
            ((-3, 0), INCONCLUSIVE),      # an upper bound at min_effect does not kill
            ((0.25, 0.5), ADOPT),
            ((math.inf, math.inf), INCONCLUSIVE),    # an infinite bound never decides
            ((-math.inf, -math.inf), INCONCLUSIVE),
            ((-math.inf, -1), KILL),
            ((1, math.inf), ADOPT),
            ((None, None), INCONCLUSIVE),
        ]
        for (lower, upper), want in cases:
            with self.subTest(interval=(lower, upper)):
                self.assertEqual(rule.decide(delta(lower, upper)), want)

    def test_min_effect_is_compared_exactly(self):
        rule = DecisionRule(min_effect=Fraction(1, 10))
        self.assertEqual(rule.decide(delta(Fraction(1, 10), 1)), INCONCLUSIVE)
        self.assertEqual(rule.decide(delta(Fraction(11, 100), 1)), ADOPT)
        self.assertEqual(rule.decide(delta(0.1, 1)), ADOPT)  # the float 0.1 is above 1/10
        self.assertEqual(DecisionRule(min_effect="1/10").decide(delta(Fraction(1, 10), 1)),
                         INCONCLUSIVE)
        self.assertEqual(DecisionRule(min_effect=2).decide(delta(-1, Fraction(19, 10))), KILL)

    def test_alpha_must_match(self):
        with self.assertRaises(ValueError):
            DecisionRule().decide(delta(1, 2, alpha=Fraction(1, 10)))
        self.assertEqual(DecisionRule(alpha=Fraction(1, 10)).decide(
            delta(1, 2, alpha=Fraction(1, 10))), ADOPT)


class JsonFormTest(unittest.TestCase):
    def test_number_forms(self):
        self.assertEqual(protocol.as_json_value(Fraction(3, 4)), "3/4")
        self.assertEqual(protocol.as_json_value(Fraction(2)), "2/1")
        self.assertEqual(protocol.as_json_value(math.inf), "inf")
        self.assertEqual(protocol.as_json_value(-math.inf), "-inf")
        self.assertEqual(protocol.as_json_value((1, 2.5, None, True)), [1, 2.5, None, True])
        self.assertEqual(protocol.as_json_value({1: Fraction(1, 2)}), {"1": "1/2"})

    def test_a_step_result_is_json_ready(self):
        spec = AgentSpec("pkg.mod:build", {"aim": 0.5})
        measurement = Measurement(target="t", estimator="e", point=Fraction(7, 2),
                                  interval=(Fraction(3), math.inf), upper=math.inf,
                                  sd=Fraction(1, 8), n=4, alpha=Fraction(1, 20), replicates=100,
                                  seed="s", n_inf=2)
        paired = PairedDelta(point=Fraction(1, 2), interval=(-math.inf, Fraction(5, 2)), n=4,
                             alpha=Fraction(1, 20), replicates=100, seed="s", n_undecided=1)
        result = StepResult(target="t", lever="l", base=spec, arm=spec.with_params(aim=0.0),
                            namespace="ns/step-0", n=4, base_measurement=measurement,
                            arm_measurement=measurement, delta=paired, rule=DecisionRule(),
                            decision=INCONCLUSIVE, kernel=None)
        data = result.as_json()
        self.assertEqual(json.loads(json.dumps(data, allow_nan=False)), data)
        self.assertEqual(data["arm"], {"builder": "pkg.mod:build", "params": {"aim": 0.0}})
        self.assertEqual(data["base_measurement"]["interval"], ["3/1", "inf"])
        self.assertEqual(data["delta"]["interval"], ["-inf", "5/2"])
        self.assertEqual(data["rule"], {"alpha": "1/20", "min_effect": 0,
                                        "name": "paired-interval"})
        self.assertEqual(sorted(data), sorted(f for f in StepResult.__dataclass_fields__))


class SetParamsTest(unittest.TestCase):
    def test_sets_params_on_a_new_spec(self):
        lever = SetParams("leave on", {"leave": True, "m": 20})
        self.assertIsInstance(lever, Lever)
        spec = AgentSpec("pkg.mod:build", {"m": 10})
        arm = lever.apply(spec)
        self.assertEqual(arm.params, {"m": 20, "leave": True})
        self.assertEqual(spec.params, {"m": 10})

    def test_spec_json_is_the_canonical_form(self):
        spec = AgentSpec("a:b", {"y": (1, 2), "x": 3})
        self.assertEqual(spec.as_json(), {"builder": "a:b", "params": {"x": 3, "y": [1, 2]}})


if __name__ == "__main__":
    unittest.main()
