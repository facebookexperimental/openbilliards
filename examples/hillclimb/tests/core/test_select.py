# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Simulation-based selection: argmax, score, the best-of-K law on toy evaluators, and rollouts."""

import math
import unittest

from hillclimb import adapter, crn, noise, select
from hillclimb.adapter import State, Stroke
from hillclimb.select import BudgetExceeded, Schedule

SEEDS = [Stroke(2.0, 1.0, 0.1, 0.0, 0.0), Stroke(3.0, 1.2, 0.2, 0.1, 0.0),
         Stroke(1.5, 0.8, 0.0, 0.0, -0.1), Stroke(2.5, 1.1, 0.1, -0.1, 0.1)]
TARGET = Stroke(2.7, 1.15, 0.12, 0.02, 0.01)
SMALL = Schedule(survivors=2, iterations=2, proposals=3, draws=4, budget=400)


def closeness(stroke):
    """A toy objective with one peak at TARGET."""
    return -sum((x - y) ** 2 for x, y in zip(stroke.as_tuple(), TARGET.as_tuple()))


def toy_draw(j):
    return crn.draw(crn.stream("hillclimb/tests/select", 1), 0, j)


class ArgmaxScoreTest(unittest.TestCase):
    def test_argmax_takes_the_first_largest(self):
        self.assertEqual(select.argmax([1.0, 3.0, 2.0, 3.0]), 1)
        self.assertEqual(select.argmax([5]), 0)
        self.assertEqual(select.argmax([-1.0, -1.0]), 0)
        self.assertEqual(select.argmax(iter([0.5, 0.75])), 1)

    def test_argmax_refuses_empty_and_nan(self):
        with self.assertRaises(ValueError):
            select.argmax([])
        with self.assertRaises(ValueError):
            select.argmax([1.0, math.nan, 2.0])
        with self.assertRaises(ValueError):
            select.argmax([math.nan])

    def test_score_is_the_mean_in_draw_order(self):
        self.assertEqual(select.score([1, 0, 1, 1], lambda o: o), 0.75)
        self.assertEqual(select.score([True, False], lambda o: o), 0.5)
        self.assertEqual(select.score([0.1] * 10, lambda o: o), sum([0.1] * 10) / 10)
        with self.assertRaises(ValueError):
            select.score([], lambda o: o)


class BestOfKTest(unittest.TestCase):
    def test_budget_is_refused_before_any_evaluation(self):
        calls = []

        def evaluate(stroke):
            calls.append(stroke)
            return 0.0

        tight = Schedule(survivors=3, iterations=3, proposals=16, draws=10, budget=1919)
        with self.assertRaises(BudgetExceeded):
            select.best_of_k(SEEDS * 12, evaluate, toy_draw, schedule=tight)
        self.assertEqual(calls, [])
        with self.assertRaises(BudgetExceeded):
            select.best_of_k(SEEDS, evaluate, toy_draw, schedule=Schedule(budget=1))
        self.assertEqual(calls, [])

    def test_no_seed_is_refused(self):
        with self.assertRaises(ValueError):
            select.best_of_k([], closeness, toy_draw, schedule=SMALL)

    def test_a_nan_value_is_refused(self):
        with self.assertRaises(ValueError):
            select.best_of_k(SEEDS, lambda s: math.nan, toy_draw, schedule=SMALL)

    def test_counts_and_order(self):
        found = select.best_of_k(SEEDS, closeness, toy_draw, schedule=SMALL)
        self.assertEqual(found.scheduled, SMALL.scheduled(4))
        self.assertEqual(len(found.entries), 4 + 2 * 2 * 3)
        self.assertEqual([e.source for e in found.entries[:4]], ["seed"] * 4)
        self.assertEqual([e.seed_index for e in found.entries[:4]], [0, 1, 2, 3])
        refined = found.entries[4:]
        self.assertEqual([(e.rank, e.iteration, e.proposal) for e in refined],
                         [(r, t, p) for r in range(2) for t in range(2) for p in range(3)])
        self.assertEqual(found.picked, min(found.entries, key=lambda e: -e.value))

    def test_the_proposal_law(self):
        """Survivors by value, the spread shrinking per iteration, draws after the scoring
        draws, the centre moving to the best entry after each iteration."""
        found = select.best_of_k(SEEDS, closeness, toy_draw, schedule=SMALL)
        seeds = sorted(range(4), key=lambda i: (-closeness(SEEDS[i]), i))[:2]
        want = []
        for rank, index in enumerate(seeds):
            centre, best_value = SEEDS[index].as_tuple(), closeness(SEEDS[index])
            for t in range(2):
                spread = [s0 * (SMALL.shrink ** t) for s0 in SMALL.sigma0]
                best = None
                for p in range(3):
                    eps = toy_draw(SMALL.draws + (rank * 2 + t) * 3 + p)
                    raw = [centre[d] + spread[d] * eps[d] for d in range(5)]
                    stroke = Stroke.of(noise.project_stroke(raw))
                    want.append((stroke, index))
                    if closeness(stroke) > best_value:
                        best, best_value = stroke, closeness(stroke)
                if best is not None:
                    centre = best.as_tuple()
        self.assertEqual([(e.stroke, e.seed_index) for e in found.entries[4:]], want)

    def test_every_proposal_passes_through_project(self):
        seen = []

        def project(stroke):
            seen.append(stroke)
            return Stroke(1.0, stroke.phi, 0.0, 0.0, 0.0)

        found = select.best_of_k(SEEDS, closeness, toy_draw, schedule=SMALL, project=project)
        self.assertEqual(len(seen), 2 * 2 * 3)
        for entry in found.entries[4:]:
            self.assertEqual((entry.stroke.v0, entry.stroke.theta), (1.0, 0.0))

    def test_project_may_return_five_numbers(self):
        default = select.best_of_k(SEEDS, closeness, toy_draw, schedule=SMALL)
        numbers = select.best_of_k(SEEDS, closeness, toy_draw, schedule=SMALL,
                                   project=lambda s: noise.project_stroke(s.as_tuple()))
        self.assertEqual(numbers, default)

    def test_ties_prefer_a_seed_then_an_earlier_proposal(self):
        flat = select.best_of_k(SEEDS, lambda s: 1.0, toy_draw, schedule=SMALL)
        self.assertEqual((flat.picked.source, flat.picked.seed_index), ("seed", 0))

        def low_first_seed(stroke):
            return 0.0 if stroke == SEEDS[0] else 1.0

        found = select.best_of_k(SEEDS, low_first_seed, toy_draw, schedule=SMALL)
        self.assertEqual((found.picked.source, found.picked.seed_index), ("seed", 1))

        def proposals_only(stroke):
            return 0.0 if stroke in SEEDS else 1.0

        found = select.best_of_k(SEEDS, proposals_only, toy_draw, schedule=SMALL)
        self.assertEqual((found.picked.source, found.picked.rank, found.picked.iteration,
                          found.picked.proposal), ("refined", 0, 0, 0))

    def test_the_default_schedule(self):
        self.assertEqual(select.Schedule().scheduled(56), 2000)
        with self.assertRaises(BudgetExceeded):
            select.best_of_k(SEEDS * 14 + SEEDS[:1], closeness, toy_draw)


@unittest.skipUnless(adapter.available(), "needs pool_py")
class RolloutsTest(unittest.TestCase):
    def test_rollouts_are_the_perturbed_simulations_in_order(self):
        state = State.rack("fifteen", 11)
        cue_moved = state.with_positions({**state.positions(), 0: (0.2, -0.7)})
        jobs = [(state, Stroke(1.2, 1.5, 0.0, 0.0, 0.0)),
                (cue_moved, Stroke(0.8, 1.7, 0.1, 0.1, 0.0))]
        draws = crn.block(crn.stream("hillclimb/tests/rollouts", 11), 0, 3)
        seed = noise.shot_seed(11, 0)
        found = select.rollouts(jobs, draws, r=2.0, seed=seed, threads=2)
        self.assertEqual([len(row) for row in found], [3, 3])
        for c, (job_state, stroke) in enumerate(jobs):
            for j, eps in enumerate(draws):
                self.assertEqual(found[c][j], adapter.simulate(
                    job_state, noise.perturb(stroke, eps, 2.0), seed=seed))


if __name__ == "__main__":
    unittest.main()
