# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The demos: the registered toy climb end to end and its worker invariance, the README's climb
example as written, the kernel target on the 9-ball break, and the public smoke on the 14.1 base
agent (kernel tests skip without pool_py)."""

import contextlib
import io
import json
import math
import os
import pathlib
import tempfile
import unittest
from fractions import Fraction

from hillclimb import adapter, climb, crn, protocol, runner
from straightpool import base_agent
from tests.docs import support

NEEDS_KERNEL = unittest.skipUnless(adapter.available(), "needs pool_py")


def canonical(results):
    return json.dumps([result.as_json() for result in results], sort_keys=True,
                      separators=(",", ":"))


@contextlib.contextmanager
def working_directory(path):
    before = os.getcwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(before)


class ToyClimbTest(unittest.TestCase):
    def test_the_registered_climb_adopts_the_lever(self):
        from hillclimb_examples.demos import climb_toy
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory, "climb.json")
            final, steps = climb_toy.run(str(path))
            payload = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(final.params, {"aim": 0.2})
        self.assertEqual([step.decision for step in steps], [protocol.ADOPT])
        step = steps[0]
        self.assertGreater(step.arm_measurement.point, step.base_measurement.point)
        self.assertGreater(step.delta.interval[0], climb_toy.SETTINGS["rule"].min_effect)
        self.assertEqual(step.namespace, climb_toy.SETTINGS["namespace"] + "/step-0")
        self.assertEqual(payload["result"]["final"], final.as_json())
        self.assertEqual(payload["registration"]["n"], climb_toy.SETTINGS["n"])

    def test_the_worker_count_changes_nothing(self):
        from hillclimb_examples.demos import climb_toy
        with tempfile.TemporaryDirectory() as directory:
            _, one = climb_toy.run(str(pathlib.Path(directory, "one.json")), workers=1)
            _, two = climb_toy.run(str(pathlib.Path(directory, "two.json")), workers=2)
        self.assertEqual(canonical(one), canonical(two))

    def test_a_registered_climb_runs_once(self):
        from hillclimb_examples.demos import climb_toy
        with tempfile.TemporaryDirectory() as directory:
            path = str(pathlib.Path(directory, "climb.json"))
            climb_toy.run(path)
            with self.assertRaises(FileExistsError):
                climb_toy.run(path)
            with self.assertRaises(FileExistsError):
                climb.climb(climb_toy.TARGET, climb_toy.BASE, climb_toy.LEVERS,
                            registration=path, **climb_toy.SETTINGS)

    def test_main_prints_the_decision_and_keeps_the_file_when_asked(self):
        from hillclimb_examples.demos import climb_toy
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory, "kept.json")
            with contextlib.redirect_stdout(io.StringIO()) as printed:
                self.assertEqual(climb_toy.main(["--registration", str(path)]), 0)
            self.assertTrue(path.is_file())
        text = printed.getvalue()
        self.assertIn("decision  adopt", text)
        self.assertIn('final     {"builder":"hillclimb.toy:build","params":{"aim":0.2}}', text)


class ReadmeExampleTest(unittest.TestCase):
    def test_the_climb_example_runs_as_written(self):
        code = support.code_blocks(support.read("README.md"), "python")[1]
        self.assertIn('if __name__ == "__main__":', code)  # workers are spawned processes
        with tempfile.TemporaryDirectory() as directory, working_directory(directory):
            with contextlib.redirect_stdout(io.StringIO()) as printed:
                exec(compile(code, "README.md", "exec"), {"__name__": "__main__"})
            payload = json.loads(pathlib.Path("my-climb.json").read_text(encoding="utf-8"))
        self.assertEqual(printed.getvalue().strip(), "{'aim': 0.2} [('aim 0.2', 'adopt')]")
        self.assertIn("`{'aim': 0.2} [('aim 0.2', 'adopt')]`", support.read("README.md"))
        self.assertIsNotNone(payload["result"])


class NineBreakTest(unittest.TestCase):
    """The kernel target on the 9-ball break. The kernel tests assert the target's wiring (the
    agent's stroke, the rules' verdict, determinism and the worker count), except one, which
    asserts a kernel outcome: the decision the README states."""

    def test_the_value_is_the_exact_share_of_kept_breaks(self):
        from hillclimb_examples.demos import nine_break
        target = nine_break.NineBreak()
        self.assertEqual(target.value([{"kept": 1}, {"kept": 0}, {"kept": 1}]), Fraction(2, 3))
        self.assertIsNone(target.value([]))

    def test_the_lever_moves_the_cue_ball_only(self):
        from hillclimb_examples.demos import nine_break
        base, arm = nine_break.BASE, nine_break.LEVER.apply(nine_break.BASE)
        self.assertEqual(arm.builder, base.builder)
        self.assertEqual({name for name in arm.params if arm.params[name] != base.params.get(name)},
                         {"x"})

    def test_the_readme_excerpt_is_the_demo_code(self):
        excerpt = support.code_blocks(support.read("README.md"), "python")[2]
        self.assertIn("class NineBreak", excerpt)
        self.assertIn(excerpt, support.read("hillclimb_examples/demos/nine_break.py"))

    @NEEDS_KERNEL
    def test_the_agent_aims_at_the_apex_ball_with_its_cue_at_the_floor(self):
        from hillclimb_examples.demos import nine_break
        rack = adapter.State.rack("nine", 11)
        agent = runner.build(nine_break.BASE.with_params(x=0.3, speed=8.0))
        place, stroke = agent.act(rack, protocol.Decision(11, 0, 1.0))
        head, apex = rack.positions()[0][1], rack.positions()[1]
        self.assertEqual(place, (0.3, head))
        self.assertEqual((stroke.v0, stroke.a, stroke.b), (8.0, 0.0, 0.0))
        self.assertEqual(stroke.phi, math.atan2(apex[1] - head, apex[0] - 0.3))
        seated = rack.with_positions({**rack.positions(), 0: place})
        floor = adapter.min_elevation_deg(seated, adapter.Stroke(8.0, stroke.phi))
        self.assertEqual(stroke.theta, math.radians(floor))

    @NEEDS_KERNEL
    def test_the_opening_is_the_rules_crates_own(self):
        import pool_py
        from hillclimb_examples.demos import nine_break
        self.assertEqual(nine_break.OPENING, pool_py.rules_initial_state_json("nineball-v1", 1))

    @NEEDS_KERNEL
    def test_a_game_is_a_function_of_its_key_and_the_rules_decide_it(self):
        from hillclimb_examples.demos import nine_break
        target, agent = nine_break.NineBreak(), runner.build(nine_break.BASE)
        keys = crn.game_keys("hillclimb/tests/nine-break", 12)
        records = [target.play(agent, key) for key in keys]
        self.assertEqual(records, [target.play(agent, key) for key in keys])
        for record in records:
            with self.subTest(key=record["key"]):
                self.assertEqual(json.loads(json.dumps(record)), record)
                self.assertIn(record["kept"], (0, 1))
                if record["kept"]:  # nineball-v1: the shooter continues after a legal pot
                    self.assertTrue([ball for ball in record["pocketed"] if ball != 0])
                if 0 in record["pocketed"]:  # a scratch is a foul
                    self.assertEqual(record["kept"], 0)

    @NEEDS_KERNEL
    def test_the_worker_count_changes_nothing(self):
        from hillclimb_examples.demos import nine_break
        self.assertEqual(canonical([nine_break.run(n=6, workers=1)]),
                         canonical([nine_break.run(n=6, workers=2)]))

    @NEEDS_KERNEL
    def test_the_step_adopts_the_side_break(self):
        """A kernel outcome, on the kernel built from this repository: the paired difference is
        several times its standard error, so platform differences in single breaks leave it."""
        from hillclimb_examples.demos import nine_break
        with contextlib.redirect_stdout(io.StringIO()) as printed:
            self.assertEqual(nine_break.main(), 0)
        text = printed.getvalue()
        self.assertIn("decision  adopt", text)
        self.assertIn(f"kernel    {adapter.kernel_version()}", text)


class SmokeTest(unittest.TestCase):
    def test_set_reads_its_value_as_json_or_text(self):
        from hillclimb_examples.demos import smoke
        spec = protocol.AgentSpec("hillclimb.toy:build", {"aim": 0.5})
        self.assertEqual(smoke.lever_of(None).apply(spec), spec)
        self.assertEqual(smoke.lever_of("leave=false").params, {"leave": False})
        self.assertEqual(smoke.lever_of("budget=200").params, {"budget": 200})
        self.assertEqual(smoke.lever_of("painter=v0.1").params, {"painter": "v0.1"})
        self.assertEqual(smoke.lever_of("aim=0").apply(spec).params, {"aim": 0})
        with self.assertRaises(ValueError):
            smoke.lever_of("budget")

    def test_the_smoke_base_takes_only_base_agent_parameters(self):
        from hillclimb_examples.demos import smoke
        self.assertLessEqual(set(smoke.BASE.params), set(base_agent.DEFAULTS))
        self.assertEqual(smoke.BASE.builder, base_agent.BUILDER)

    @unittest.skipUnless(adapter.available(), "needs pool_py")
    def test_the_lever_that_changes_nothing_pairs_the_arms_exactly(self):
        from hillclimb_examples.demos import smoke
        result = smoke.run(smoke.lever_of())
        self.assertEqual(result.base_measurement, result.arm_measurement)
        self.assertEqual(result.decision, protocol.INCONCLUSIVE)
        if result.delta.point is not None:
            self.assertEqual(result.delta.point, 0)
        self.assertEqual(result.kernel, adapter.kernel_version())


if __name__ == "__main__":
    unittest.main()
