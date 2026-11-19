# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The kernel adapter (each test needs pool_py and a few milliseconds of kernel time).

Public kernels are newer than the build the published numbers were measured on, so nothing here
asserts a simulated value: only determinism, slot order, refusals and round trips. Which strokes
the kernel refuses follows from its parameters: tip_limit derives the largest tip offset from the
kernel's cue and ball parameters, as the kernel's own shot validation does, and one test checks
that the kernel accepts a stroke just inside that limit and refuses one just past it.
"""

import json
import math
import unittest

from hillclimb import adapter
from hillclimb.adapter import Event, Outcome, State, Stroke

NEEDS_KERNEL = unittest.skipUnless(adapter.available(), "needs pool_py")
GENTLE = Stroke(1.2, math.pi / 2, 0.0, 0.0, 0.1)

#: The cue parameters the kernel's miscue rule reads, at the kernel's defaults (CueParams in
#: crates/pool-core/src/params.rs): the tip radius in metres and the contact cap in ball radii.
#: The kernel writes a cue into the options JSON only where it differs from these defaults.
DEFAULT_CUE = {"tip_radius": 0.0106, "miscue_contact_cap_r": 0.5}


def tip_limit(state):
    """The largest tip offset sqrt(a**2 + b**2), in ball radii, that the kernel accepts from
    `state` under adapter.default_options(): cap * (1 + tip_radius / R), the miscue rule of the
    kernel's shot validation, with the cue's contact cap and tip radius read from the options and
    R the radius of the state's balls. About 0.685 at the kernel's defaults."""
    cue = {**DEFAULT_CUE, **json.loads(adapter.default_options().to_json()).get("cue", {})}
    return cue["miscue_contact_cap_r"] * (1 + cue["tip_radius"] / state.table().ball_radius)


@NEEDS_KERNEL
class StateTest(unittest.TestCase):
    def test_rack_is_deterministic_by_seed(self):
        self.assertEqual(State.rack("fifteen", 21), State.rack("fifteen", 21))
        self.assertNotEqual(State.rack("fifteen", 21).json, State.rack("fifteen", 22).json)
        self.assertEqual(State.rack("nine", 21), State.rack("nine", 21))
        self.assertEqual(State.rack("fifteen", 21), State.rack("fifteen", 21 + (1 << 64)))
        with self.assertRaises(ValueError):
            State.rack("eight", 21)

    def test_rack_contents_and_compact_text(self):
        fifteen, nine = State.rack("fifteen", 3), State.rack("nine", 3)
        self.assertEqual(sorted(fifteen.positions()), list(range(16)))
        self.assertEqual(sorted(nine.positions()), list(range(10)))
        self.assertEqual(list(fifteen.positions()), sorted(fifteen.positions()))
        self.assertEqual(fifteen.json, json.dumps(json.loads(fifteen.json), separators=(",", ":")))

    def test_table_has_six_pockets_and_the_balls_radius(self):
        state = State.rack("fifteen", 3)
        table = state.table()
        self.assertEqual(len(table.pockets), 6)
        self.assertGreater(table.length, table.width)
        radii = {b["params"]["r"] for b in json.loads(state.json)["balls"]}
        self.assertEqual({table.ball_radius}, radii)
        for x, y in table.pockets:
            self.assertLessEqual(abs(x), table.width / 2 + 0.1)
            self.assertLessEqual(abs(y), table.length / 2 + 0.1)

    def test_with_positions_round_trip(self):
        state = State.rack("fifteen", 5)  # the kernel's ball order, not ascending
        again = state.with_positions(state.positions())
        self.assertEqual(again.positions(), state.positions())
        self.assertEqual([b["id"] for b in json.loads(again.json)["balls"]], list(range(16)))
        self.assertEqual(sorted(json.loads(again.json)["balls"], key=lambda b: b["id"]),
                         sorted(json.loads(state.json)["balls"], key=lambda b: b["id"]))
        self.assertEqual(again.with_positions(again.positions()), again)
        moved = state.with_positions({0: (0.1, -0.8), 3: (0.2, 0.3)})
        self.assertEqual(moved.positions(), {0: (0.1, -0.8), 3: (0.2, 0.3)})
        self.assertEqual(json.loads(moved.json)["table"], json.loads(state.json)["table"])
        self.assertEqual(moved.with_positions(moved.positions()), moved)

    def test_with_positions_takes_missing_balls_from_templates(self):
        rack = State.rack("fifteen", 5)
        without_cue = rack.with_positions({b: xy for b, xy in rack.positions().items() if b})
        with self.assertRaises(KeyError):
            without_cue.with_positions({0: (0.0, -0.6), 1: rack.positions()[1]})
        back = without_cue.with_positions({0: (0.0, -0.6), 1: rack.positions()[1]}, templates=rack)
        self.assertEqual(sorted(back.positions()), [0, 1])
        cue = [b for b in json.loads(back.json)["balls"] if b["id"] == 0][0]
        rack_cue = [b for b in json.loads(rack.json)["balls"] if b["id"] == 0][0]
        self.assertEqual(cue["params"], rack_cue["params"])
        self.assertEqual(cue["state"]["motion"], "Stationary")


@NEEDS_KERNEL
class SimulateTest(unittest.TestCase):
    def test_simulate_is_deterministic(self):
        state = State.rack("fifteen", 8)
        one = adapter.simulate(state, GENTLE, seed=17)
        two = adapter.simulate(state, GENTLE, seed=17)
        self.assertEqual(one, two)
        self.assertIsNone(one.truncated)
        self.assertEqual(one.events[0].kind, "strike")
        self.assertEqual([e.t for e in one.events], sorted(e.t for e in one.events))
        self.assertEqual([r[0] for r in one.rest], sorted(r[0] for r in one.rest))
        self.assertEqual(one.first_contact, next(
            ((e.balls[1] if e.balls[0] == 0 else e.balls[0]) for e in one.events
             if e.kind == "ball_ball" and 0 in e.balls), None))
        self.assertEqual(one.pocketed, tuple((e.balls[0], e.pocket) for e in one.events
                                             if e.kind == "ball_pocket"))
        self.assertIsNone(one.record_json)

    def test_simulate_many_equals_sequential_simulate_in_order(self):
        state = State.rack("fifteen", 8)
        moved = state.with_positions({**state.positions(), 0: (-0.3, -0.9)})
        jobs = [(state, GENTLE, 1), (moved, Stroke(0.9, 1.3, 0.05, 0.1, 0.0), 2),
                (state, Stroke(0.0, 0.0), 3),  # refused: v0 must be positive
                (moved, Stroke(1.0, 1.8, 0.0, -0.1, 0.0), 4)]
        many = adapter.simulate_many(jobs, threads=2)
        self.assertEqual(many, [adapter.simulate(s, k, seed=d) for s, k, d in jobs])
        self.assertIsNotNone(many[2].truncated)
        self.assertEqual([o.truncated is None for o in many], [True, True, False, True])
        clean = [jobs[0], jobs[1], jobs[3]]
        self.assertEqual(adapter.simulate_many(clean, threads=1),
                         adapter.simulate_many(clean, threads=3))
        self.assertEqual(adapter.simulate_many([]), [])

    def test_an_invalid_stroke_gives_a_truncated_outcome(self):
        state = State.rack("fifteen", 8)
        beyond = 1.1 * tip_limit(state)  # a tip offset past the kernel's miscue limit
        for stroke in (Stroke(0.0, 0.0), Stroke(20.0, 0.0), Stroke(1.0, 0.0, 0.0, beyond, 0.0),
                       Stroke(1.0, 0.0, math.pi / 2), Stroke(math.nan, 0.0)):
            with self.subTest(stroke=stroke):
                found = adapter.simulate(state, stroke, seed=1)
                self.assertIsInstance(found.truncated, str)
                self.assertEqual((found.events, found.rest, found.pocketed, found.off_table,
                                  found.first_contact), ((), (), (), (), None))

    def test_the_tip_limit_is_the_kernels(self):
        state = State.rack("fifteen", 8)
        limit = tip_limit(state)
        for a, b in ((1.0, 0.0), (0.0, -1.0), (0.6, 0.8)):
            with self.subTest(direction=(a, b)):
                inside = Stroke(1.0, 0.0, 0.0, 0.97 * limit * a, 0.97 * limit * b)
                beyond = Stroke(1.0, 0.0, 0.0, 1.03 * limit * a, 1.03 * limit * b)
                self.assertIsNone(adapter.simulate(state, inside, seed=1).truncated)
                self.assertIsInstance(adapter.simulate(state, beyond, seed=1).truncated, str)

    def test_options_are_written_out(self):
        options = json.loads(adapter.default_options().to_json())
        self.assertEqual(options["rail_seat"], adapter.RAIL_SEAT)
        state = State.rack("fifteen", 8)
        self.assertEqual(adapter.simulate(state, GENTLE, seed=5),
                         adapter.simulate(state, GENTLE, seed=5,
                                          options=adapter.default_options()))

    def test_rules_judge_needs_the_record(self):
        state = State.rack("nine", 4)
        bare = adapter.simulate(state, GENTLE, seed=9)
        rules_state = json.dumps({"shooter": 1, "onTable": list(range(1, 10)), "result": None},
                                 separators=(",", ":"))
        with self.assertRaises(ValueError):
            adapter.rules_judge("nineball-v1", rules_state, bare)
        kept = adapter.simulate(state, GENTLE, seed=9, keep_record=True)
        self.assertEqual(kept, bare)
        self.assertIsInstance(kept.record_json, str)
        judgment = adapter.rules_judge("nineball-v1", rules_state, kept)
        self.assertIn("legal", judgment)
        refused = adapter.simulate(state, Stroke(0.0, 0.0), seed=9, keep_record=True)
        with self.assertRaises(ValueError):
            adapter.rules_judge("nineball-v1", rules_state, refused)

    def test_clearance_and_version(self):
        floor = adapter.min_elevation_deg(State.rack("fifteen", 8), GENTLE)
        self.assertTrue(0.0 <= floor <= 90.0)
        self.assertIsInstance(adapter.kernel_version(), str)
        self.assertTrue(adapter.kernel_version())


class OutcomeShapeTest(unittest.TestCase):
    def test_a_refusal_is_an_empty_outcome(self):
        refused = Outcome(events=(), rest=(), pocketed=(), off_table=(), first_contact=None,
                          truncated="refused")
        self.assertEqual(refused.positions(), {})
        self.assertEqual(Event("ball_pocket", 1.0, (3,), 2).pocket, 2)


if __name__ == "__main__":
    unittest.main()
