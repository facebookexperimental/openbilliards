# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The climb step and driver on the toy target: decisions, fresh keys per step, the adopted lever
carried, a result read once (write_result, registration), what a registration pins, the kernel
stamp of a result and estimates undefined on some resamples."""

import dataclasses
import json
import math
import os
import tempfile
import unittest
from fractions import Fraction
from typing import Any, ClassVar, Mapping

from hillclimb import adapter, climb, crn, runner, toy
from hillclimb.protocol import ADOPT, INCONCLUSIVE, KILL, DecisionRule, SetParams, StepResult

TARGET = toy.ToyRun(cap=40, m=8)
RULE = DecisionRule()
BETTER = SetParams("aim 0.1", {"aim": 0.1})
WORSE = SetParams("aim 1.6", {"aim": 1.6})
ARGS = dict(n=40, rule=RULE, seed="hillclimb/tests/boot", replicates=200)


@dataclasses.dataclass(frozen=True)
class KernelToy(toy.ToyRun):
    """The toy run declared as a target that plays on the kernel."""

    uses_kernel: ClassVar[bool] = True


@dataclasses.dataclass(frozen=True)
class FewGames(toy.ToyRun):
    """The toy run with an estimate that is undefined (None) on a resample of fewer than `least`
    distinct games."""

    least: int = 23

    def value(self, records):
        if len({record["key"] for record in records}) < self.least:
            return None
        return super().value(records)


@dataclasses.dataclass(frozen=True)
class MergeParams:
    """A lever with SetParams' fields and another operation: it adds only the params the spec
    lacks."""

    name: str
    params: Mapping[str, Any]

    def apply(self, spec):
        return spec.with_params(**{k: v for k, v in self.params.items() if k not in spec.params})


class PlainLever:
    """A lever that is not a dataclass: its parameters cannot be written down."""

    name = "plain"

    def apply(self, spec):
        return spec


class ClimbStepTest(unittest.TestCase):
    def test_a_step_measures_both_arms_on_the_same_keys(self):
        base = toy.spec(aim=0.9)
        result = climb.climb_step(TARGET, base, BETTER, namespace="hillclimb/tests/step", **ARGS)
        self.assertIsInstance(result, StepResult)
        self.assertEqual(result.decision, ADOPT)
        self.assertEqual((result.target, result.lever, result.namespace, result.n),
                         ("toy-run", "aim 0.1", "hillclimb/tests/step", 40))
        self.assertEqual(result.arm, BETTER.apply(base))
        keys = crn.game_keys("hillclimb/tests/step", 40)
        base_records = runner.play(TARGET, base, keys)
        arm_records = runner.play(TARGET, result.arm, keys)
        self.assertEqual(result.base_measurement.point, TARGET.value(base_records))
        self.assertEqual(result.arm_measurement.point, TARGET.value(arm_records))
        self.assertEqual(result.delta.point,
                         TARGET.value(arm_records) - TARGET.value(base_records))
        self.assertEqual(result.base_measurement.estimator, "conditional-monte-carlo")
        self.assertEqual(result.delta.alpha, Fraction(1, 20))
        self.assertIsNone(result.kernel)  # the toy is kernel-free, installed binding or not

    def test_a_kernel_target_records_the_kernel_build(self):
        target = KernelToy(cap=40, m=8)
        result = climb.climb_step(target, toy.spec(aim=0.9), BETTER,
                                  namespace="hillclimb/tests/step", **ARGS)
        want_kernel = adapter.kernel_version() if adapter.available() else None
        self.assertEqual(result.kernel, want_kernel)
        plain = climb.climb_step(TARGET, toy.spec(aim=0.9), BETTER,
                                 namespace="hillclimb/tests/step", **ARGS)
        self.assertEqual(dataclasses.replace(result, kernel=None), plain)

    def test_a_step_tolerates_an_estimate_undefined_on_some_resamples(self):
        target = FewGames(cap=40, m=8)
        result = climb.climb_step(target, toy.spec(aim=0.9), BETTER,
                                  namespace="hillclimb/tests/undefined", **ARGS)
        base, arm = result.base_measurement, result.arm_measurement
        self.assertIsNotNone(base.point)
        self.assertIsNotNone(arm.point)
        # Both arms and the difference resample the same key indices from the same seed.
        self.assertGreater(base.n_undefined, 0)
        self.assertLess(base.n_undefined, ARGS["replicates"])
        self.assertEqual(arm.n_undefined, base.n_undefined)
        self.assertEqual(result.delta.n_undecided, base.n_undefined)
        self.assertIn(result.decision, (ADOPT, KILL, INCONCLUSIVE))

    def test_a_worse_lever_is_killed(self):
        result = climb.climb_step(TARGET, toy.spec(aim=0.0), WORSE,
                                  namespace="hillclimb/tests/kill", **ARGS)
        self.assertEqual(result.decision, KILL)

    def test_the_worker_count_does_not_change_a_step(self):
        one = climb.climb_step(TARGET, toy.spec(aim=0.9), BETTER,
                               namespace="hillclimb/tests/workers", **ARGS)
        two = climb.climb_step(TARGET, toy.spec(aim=0.9), BETTER,
                               namespace="hillclimb/tests/workers", workers=2, **ARGS)
        self.assertEqual(json.dumps(one.as_json(), sort_keys=True),
                         json.dumps(two.as_json(), sort_keys=True))


class ClimbTest(unittest.TestCase):
    def test_fresh_keys_per_step_and_the_adopted_lever_carried(self):
        base = toy.spec(aim=0.9)
        final, steps = climb.climb(TARGET, base, [BETTER, WORSE], namespace="hillclimb/tests/climb",
                                   **ARGS)
        self.assertEqual([s.namespace for s in steps],
                         ["hillclimb/tests/climb/step-0", "hillclimb/tests/climb/step-1"])
        self.assertEqual([s.decision for s in steps], [ADOPT, KILL])
        self.assertEqual(steps[1].base, steps[0].arm)
        self.assertEqual(final, BETTER.apply(base))
        self.assertNotEqual(set(crn.game_keys(steps[0].namespace, 40)),
                            set(crn.game_keys(steps[1].namespace, 40)))

    def test_a_lever_not_adopted_is_not_carried(self):
        base = toy.spec(aim=0.0)
        final, steps = climb.climb(TARGET, base, [WORSE], namespace="hillclimb/tests/kept", **ARGS)
        self.assertEqual(steps[0].decision, KILL)
        self.assertEqual(final, base)


class ReadOnceTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.dir = self._dir.name

    def tearDown(self):
        self._dir.cleanup()

    def test_write_result_refuses_to_overwrite(self):
        result = climb.climb_step(TARGET, toy.spec(aim=0.9), BETTER,
                                  namespace="hillclimb/tests/write", **ARGS)
        path = os.path.join(self.dir, "step.json")
        climb.write_result(path, result)
        with open(path, encoding="utf-8") as handle:
            self.assertEqual(json.load(handle), result.as_json())
        with self.assertRaises(FileExistsError):
            climb.write_result(path, result)

    def test_a_registered_climb_runs_once_and_records_its_result(self):
        path = os.path.join(self.dir, "registration.json")
        base = toy.spec(aim=0.9)
        entry = climb.register(path, TARGET, base, [BETTER, WORSE],
                               namespace="hillclimb/tests/registered", **ARGS)
        self.assertEqual(entry["n"], 40)
        self.assertEqual([lever["name"] for lever in entry["levers"]], ["aim 0.1", "aim 1.6"])
        with open(path, encoding="utf-8") as handle:
            self.assertIsNone(json.load(handle)["result"])
        with self.assertRaises(FileExistsError):
            climb.register(path, TARGET, base, [BETTER], namespace="x", **ARGS)

        final, steps = climb.climb(TARGET, base, [BETTER, WORSE],
                                   namespace="hillclimb/tests/registered", registration=path,
                                   **ARGS)
        with open(path, encoding="utf-8") as handle:
            payload = json.load(handle)
        self.assertEqual(payload["registration"], entry)
        self.assertEqual(payload["result"]["final"], final.as_json())
        self.assertEqual(payload["result"]["steps"], [s.as_json() for s in steps])
        with self.assertRaises(FileExistsError):
            climb.climb(TARGET, base, [BETTER, WORSE], namespace="hillclimb/tests/registered",
                        registration=path, **ARGS)

    def test_a_climb_unlike_its_registration_is_refused_before_any_game(self):
        path = os.path.join(self.dir, "registration.json")
        base = toy.spec(aim=0.9)
        climb.register(path, TARGET, base, [BETTER], namespace="hillclimb/tests/fixed", **ARGS)
        changed = [dict(ARGS, n=41), dict(ARGS, seed="other"), dict(ARGS, replicates=201),
                   dict(ARGS, rule=DecisionRule(min_effect=1))]
        for args in changed:
            with self.subTest(args=args):
                with self.assertRaises(ValueError):
                    climb.climb(TARGET, base, [BETTER], namespace="hillclimb/tests/fixed",
                                registration=path, **args)
        with self.assertRaises(ValueError):
            climb.climb(TARGET, base, [SetParams("aim 0.1", {"aim": 0.11})],
                        namespace="hillclimb/tests/fixed", registration=path, **ARGS)
        with self.assertRaises(ValueError):
            climb.climb(TARGET, toy.spec(aim=0.8), [BETTER], namespace="hillclimb/tests/fixed",
                        registration=path, **ARGS)
        with self.assertRaises(ValueError):
            climb.climb(TARGET, base, [BETTER], namespace="hillclimb/tests/other",
                        registration=path, **ARGS)
        with open(path, encoding="utf-8") as handle:
            self.assertIsNone(json.load(handle)["result"])


class RegistrationTest(unittest.TestCase):
    """A registration pins the target's settings and every lever's operation and parameters, not
    their names: a climb unlike it in any of them is refused before any game."""

    NAMESPACE = "hillclimb/tests/pinned"

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self._dir.name, "registration.json")

    def tearDown(self):
        self._dir.cleanup()

    def register(self, target, base, levers):
        return climb.register(self.path, target, base, levers, namespace=self.NAMESPACE, **ARGS)

    def assert_refused(self, target, base, levers):
        with self.assertRaises(ValueError):
            climb.climb(target, base, levers, namespace=self.NAMESPACE, registration=self.path,
                        **ARGS)
        with open(self.path, encoding="utf-8") as handle:
            self.assertIsNone(json.load(handle)["result"])

    def test_the_target_is_registered_by_its_class_and_settings(self):
        target = toy.ToyRun(noise=1, cap=60, m=32)
        entry = self.register(target, toy.spec(aim=0.9), [BETTER])
        self.assertEqual(entry["target"], {
            "name": "toy-run", "class": "hillclimb.toy:ToyRun",
            "settings": {"name": "toy-run", "noise": 1, "cap": 60, "m": 32,
                         "estimator": "conditional-monte-carlo"}})
        self.assert_refused(toy.ToyRun(noise=0, cap=1, m=1), toy.spec(aim=0.9), [BETTER])
        for change in ({"noise": 0.5}, {"cap": 59}, {"m": 31}, {"estimator": "other"}):
            with self.subTest(change=change):
                self.assert_refused(dataclasses.replace(target, **change), toy.spec(aim=0.9),
                                    [BETTER])
        self.assert_refused(KernelToy(noise=1, cap=60, m=32), toy.spec(aim=0.9), [BETTER])

    def test_each_lever_is_registered_by_its_operation_and_parameters(self):
        base = toy.spec(aim=0.9)
        restore, empty = SetParams("restore", {"aim": 0.9}), SetParams("restore", {})
        # On the base the two make the same arm; after an adopted step they act differently.
        self.assertEqual(restore.apply(base), empty.apply(base))
        self.assertNotEqual(restore.apply(toy.spec(aim=0.1)), empty.apply(toy.spec(aim=0.1)))
        entry = self.register(TARGET, base, [restore])
        self.assertEqual(entry["levers"], [{
            "name": "restore", "class": "hillclimb.protocol:SetParams",
            "settings": {"name": "restore", "params": {"aim": 0.9}}}])
        self.assert_refused(TARGET, base, [empty])
        self.assert_refused(TARGET, base, [MergeParams("restore", {"aim": 0.9})])

    def test_a_lever_registered_without_params_refuses_one_with_them(self):
        base = toy.spec(aim=0.9)
        self.register(TARGET, base, [SetParams("restore", {})])
        self.assert_refused(TARGET, base, [SetParams("restore", {"aim": 0.9})])

    def test_what_cannot_be_written_down_is_refused_before_the_file(self):
        with self.assertRaises(TypeError):
            self.register(TARGET, toy.spec(aim=0.9), [PlainLever()])
        self.assertFalse(os.path.exists(self.path))
        with self.assertRaises(TypeError):
            self.register(TARGET, toy.spec(aim=0.9), [SetParams("set", {"aim": object()})])
        self.assertFalse(os.path.exists(self.path))
        with self.assertRaises(ValueError):
            self.register(TARGET, toy.spec(aim=0.9), [SetParams("set", {"aim": math.nan})])
        self.assertFalse(os.path.exists(self.path))
        with self.assertRaises(ValueError):
            self.register(toy.ToyRun(noise=math.nan, cap=40, m=8), toy.spec(aim=0.9), [BETTER])
        self.assertFalse(os.path.exists(self.path))


if __name__ == "__main__":
    unittest.main()
