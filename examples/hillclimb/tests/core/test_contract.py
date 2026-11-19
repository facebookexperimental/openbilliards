# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The small data helpers of the shared contract: strokes, state digests, outcomes, agent specs
and the best-of-K schedule arithmetic."""

import hashlib
import unittest

from hillclimb.adapter import Event, Outcome, State, Stroke
from hillclimb.protocol import AgentSpec
from hillclimb.select import Schedule


class StrokeTest(unittest.TestCase):
    def test_round_trip(self):
        stroke = Stroke.of([2.5, 1.0, 0.1, 0.05, -0.2])
        self.assertEqual(stroke.as_tuple(), (2.5, 1.0, 0.1, 0.05, -0.2))
        self.assertEqual(Stroke.of(stroke.as_tuple()), stroke)

    def test_defaults_strike_the_centre_level(self):
        self.assertEqual(Stroke(1.0, 0.5).as_tuple(), (1.0, 0.5, 0.0, 0.0, 0.0))

    def test_wrong_length_is_refused(self):
        with self.assertRaises(ValueError):
            Stroke.of([1.0, 2.0, 3.0])


class StateTest(unittest.TestCase):
    def test_digest_is_the_first_16_hex_digits_of_sha256(self):
        text = '{"balls":[],"table":{}}'
        self.assertEqual(State(text).digest(), hashlib.sha256(text.encode()).hexdigest()[:16])
        self.assertEqual(State(text), State(text))


class OutcomeTest(unittest.TestCase):
    def test_positions_and_equality_without_the_record(self):
        events = (Event("ball_ball", 0.25, (0, 3)), Event("ball_pocket", 1.5, (3,), 2))
        kept = Outcome(events=events, rest=((0, 0.1, 0.2), (5, -0.4, 0.5)), pocketed=((3, 2),),
                       off_table=(), first_contact=3, record_json="{}")
        bare = Outcome(events=events, rest=((0, 0.1, 0.2), (5, -0.4, 0.5)), pocketed=((3, 2),),
                       off_table=(), first_contact=3)
        self.assertEqual(kept.positions(), {0: (0.1, 0.2), 5: (-0.4, 0.5)})
        self.assertEqual(kept, bare)
        self.assertIsNone(bare.truncated)


class AgentSpecTest(unittest.TestCase):
    def test_with_params_returns_a_new_spec(self):
        spec = AgentSpec("pkg.mod:build", {"m": 10})
        changed = spec.with_params(m=20, leave=True)
        self.assertEqual(changed.params, {"m": 20, "leave": True})
        self.assertEqual(spec.params, {"m": 10})
        self.assertEqual(changed.builder, "pkg.mod:build")

    def test_canonical_is_sorted_and_compact(self):
        self.assertEqual(AgentSpec("pkg.mod:build", {"m": 10}).canonical(),
                         '{"builder":"pkg.mod:build","params":{"m":10}}')
        self.assertEqual(AgentSpec("a:b", {"y": 1, "x": 2}).canonical(),
                         AgentSpec("a:b", {"x": 2, "y": 1}).canonical())


class ScheduleTest(unittest.TestCase):
    def test_scheduled_counts_seeds_then_refined_proposals(self):
        schedule = Schedule()
        self.assertEqual(schedule.scheduled(0), 0)
        self.assertEqual(schedule.scheduled(2), (2 + 2 * 3 * 16) * 10)
        self.assertEqual(schedule.scheduled(5), (5 + 3 * 3 * 16) * 10)
        self.assertLessEqual(schedule.scheduled(20), schedule.budget)

    def test_proposal_draws_follow_the_scoring_draws_without_gaps(self):
        schedule = Schedule()
        indices = [schedule.proposal_index(r, t, p) for r in range(3) for t in range(3)
                   for p in range(16)]
        self.assertEqual(indices, list(range(10, 10 + 3 * 3 * 16)))

    def test_outside_the_schedule_is_refused(self):
        with self.assertRaises(ValueError):
            Schedule().proposal_index(3, 0, 0)
        with self.assertRaises(ValueError):
            Schedule().proposal_index(0, 0, 16)


if __name__ == "__main__":
    unittest.main()
