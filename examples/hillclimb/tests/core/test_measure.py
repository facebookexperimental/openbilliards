# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The estimators equal the run-length estimator on fixed, made-up inputs, and a summary keeps its
law when an estimate is undefined on some resamples."""

import random
import unittest
from fractions import Fraction

from hillclimb import _siblings, adapter, crn, measure, noise
from hillclimb.adapter import State, Stroke

RL = _siblings.load("run_length")

# Made-up (run length, misses) games at m = 8, and per-stroke miss lists at m = 8.
GAMES = [(12, 9), (30, 4), (7, 15), (21, 6), (0, 8), (44, 2)]
MISS_LISTS = [[0, 1, 0, 2], [2, 0, 1, 0], [0, 0, 0, 0], [1, 3, 0, 1], [8]]


def estimate(games):
    return RL.run_length_estimate(games, 8)


class EstimatorTest(unittest.TestCase):
    def test_constants_are_the_estimators(self):
        self.assertEqual((measure.DRAWS, measure.REPLICATES, measure.ALPHA, measure.INF),
                         (RL.DRAWS, RL.REPLICATES, RL.ALPHA, RL.INF))
        self.assertIs(measure.meets_bar, RL.meets_bar)
        self.assertIs(measure.below_bar, RL.below_bar)

    def test_run_length(self):
        self.assertEqual(measure.run_length(GAMES, 8), RL.run_length_estimate(GAMES, 8))
        self.assertEqual(measure.run_length(GAMES, 8), Fraction(8 * 114, 44))
        self.assertEqual(measure.run_length([(3, 1), (5, 0)], 1), Fraction(8, 1))
        self.assertEqual(measure.run_length([(3, 0), (5, 0)], 4), measure.INF)

    def test_survival(self):
        want = RL.survival_estimate([RL.survival_numerator(x, 4, 8) for x in MISS_LISTS], 4, 8)
        self.assertEqual(measure.survival(MISS_LISTS, 4, 8), want)
        self.assertIsNone(measure.survival([], 4, 8))
        with self.assertRaises(ValueError):
            measure.survival([[0, 1]], 4, 8)  # short without an extinction

    def test_summary(self):
        found = measure.summary(GAMES, estimate, target="made-up", estimator="cmc",
                                seed="hillclimb/tests/summary", replicates=500)
        want = RL.summary(GAMES, estimate, "hillclimb/tests/summary", RL.ALPHA, 500)
        self.assertEqual(found.point, want["point"])
        self.assertEqual(found.interval, want["interval"])
        self.assertEqual(found.upper, want["upper"])
        self.assertEqual(found.sd, want["sd"])
        self.assertEqual(found.n_inf, want["n_inf"])
        self.assertEqual((found.target, found.estimator, found.n, found.replicates, found.seed),
                         ("made-up", "cmc", 6, 500, "hillclimb/tests/summary"))
        self.assertEqual(found.alpha, Fraction(1, 20))

    def test_summary_alpha_as_text(self):
        found = measure.summary(GAMES, estimate, target="t", estimator="e", seed=3, alpha="0.1",
                                replicates=200)
        want = RL.summary(GAMES, estimate, 3, Fraction(1, 10), 200)
        self.assertEqual(found.interval, want["interval"])
        self.assertEqual(found.alpha, Fraction(1, 10))

    def test_summary_without_records(self):
        found = measure.summary([], estimate, target="t", estimator="e", seed=3, replicates=50)
        want = RL.summary([], estimate, 3, RL.ALPHA, 50)
        self.assertEqual((found.point, found.interval, found.upper, found.sd, found.n_inf),
                         (want["point"], want["interval"], want["upper"], want["sd"],
                          want["n_inf"]))
        self.assertEqual(found.n_undefined, 0)


def replicate_values(units, value, seed, replicates):
    """The replicate values in draw order, drawn as the run-length estimator draws them: n picks
    random.Random(seed).randrange(n) a replicate, in order."""
    rng, n = random.Random(seed), len(units)
    return [value([units[rng.randrange(n)] for _ in range(n)]) for _ in range(replicates)]


class UndefinedReplicateTest(unittest.TestCase):
    """An estimate may be None (no estimate) on some resamples: such a replicate is counted in
    n_undefined and counts against both bounds, as in the paired compare."""

    SEED = "hillclimb/tests/undefined"

    def check(self, value, replicates):
        found = measure.summary(GAMES, value, target="t", estimator="e", seed=self.SEED,
                                replicates=replicates)
        values = replicate_values(GAMES, value, self.SEED, replicates)
        defined = sorted(v for v in values if v is not None)
        undefined = len(values) - len(defined)
        low, high = RL.interval_positions(RL.ALPHA, replicates)
        upper = RL.upper_position(RL.ALPHA, replicates)
        self.assertEqual(found.n_undefined, undefined)
        self.assertEqual(found.interval, (([None] * undefined + defined)[low],
                                          (defined + [None] * undefined)[high]))
        self.assertEqual(found.upper, (defined + [None] * undefined)[upper])
        self.assertEqual(found.sd, RL.bootstrap_sd({"sorted": defined}))
        self.assertEqual(found.n_inf, defined.count(RL.INF))
        self.assertEqual(found.point, value(GAMES))
        return found

    def test_a_rarely_undefined_estimate_keeps_its_bounds(self):
        def rarely(games):  # undefined (1 resample in 64) without any of the first three games
            return estimate(games) if set(games) & set(GAMES[:3]) else None

        found = self.check(rarely, 2000)
        self.assertGreater(found.n_undefined, 0)
        self.assertNotIn(None, (found.interval[0], found.interval[1], found.upper))

    def test_an_often_undefined_estimate_has_no_bounds(self):
        def often(games):  # undefined (1 resample in 3) without the fifth game
            return estimate(games) if GAMES[4] in games else None

        found = self.check(often, 400)
        self.assertEqual((found.interval, found.upper), ((None, None), None))
        self.assertFalse(measure.meets_bar(found.interval[0], 0))
        self.assertFalse(measure.below_bar(found.upper, 10 ** 6))


@unittest.skipUnless(adapter.available(), "needs pool_py")
class StrokeMissesTest(unittest.TestCase):
    def test_counts_the_missed_draws_of_the_played_stroke(self):
        state = State.rack("fifteen", 7)
        stroke = Stroke(1.5, 1.4, 0.05, 0.0, 0.1)
        stream_seed = crn.stream("hillclimb/tests/cmc", 7)
        seed = noise.shot_seed(7, 0)

        def no_contact(outcome):
            return outcome.first_contact is None

        count = measure.stroke_misses(state, stroke, no_contact, r=4.0, stream_seed=stream_seed,
                                      decision_index=0, seed=seed, m=6)
        jobs = [(state, noise.perturb(stroke, eps, 4.0), seed)
                for eps in crn.block(stream_seed, 0, 6)]
        want = sum(1 for o in adapter.simulate_many(jobs) if no_contact(o))
        self.assertEqual(count, want)
        self.assertEqual(measure.stroke_misses(state, stroke, lambda o: True, r=4.0,
                                               stream_seed=stream_seed, decision_index=0,
                                               seed=seed, m=6), 6)


if __name__ == "__main__":
    unittest.main()
