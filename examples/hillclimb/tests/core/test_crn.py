# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Common random numbers: the key and draw laws, and the paired compare on synthetic records."""

import hashlib
import math
import random
import unittest
from fractions import Fraction

from hillclimb import _siblings, crn, measure

STREAM = _siblings.load("noise_stream")
RL = _siblings.load("run_length")


def mean(records):
    return Fraction(sum(records), len(records))


class KeyLawTest(unittest.TestCase):
    def test_base_is_the_first_eight_bytes_of_sha256_big_endian(self):
        digest = hashlib.sha256(b"hillclimb/tests/keys").digest()
        self.assertEqual(crn.base("hillclimb/tests/keys"), int.from_bytes(digest[:8], "big"))

    def test_game_keys_are_shot_seeds_of_the_base(self):
        root = crn.base("hillclimb/tests/keys")
        self.assertEqual(crn.game_keys("hillclimb/tests/keys", 4),
                         [STREAM.shot_seed(root, j) for j in range(4)])
        self.assertEqual(crn.game_keys("hillclimb/tests/keys", 3, start=5),
                         [STREAM.shot_seed(root, j) for j in range(5, 8)])

    def test_stream_is_the_shot_seed_of_the_key(self):
        root = crn.base("hillclimb/tests/rollouts")
        self.assertEqual(crn.stream("hillclimb/tests/rollouts", 123), STREAM.shot_seed(root, 123))

    def test_the_laws_are_deterministic(self):
        self.assertEqual(crn.game_keys("a", 5), crn.game_keys("a", 5))
        seed = crn.stream("b", 7)
        self.assertEqual(crn.block(seed, 2, 4), crn.block(seed, 2, 4))

    def test_namespaces_are_separated(self):
        a, b = crn.game_keys("hillclimb/tests/a", 50), crn.game_keys("hillclimb/tests/b", 50)
        self.assertNotEqual(crn.base("hillclimb/tests/a"), crn.base("hillclimb/tests/b"))
        self.assertEqual(set(a) & set(b), set())
        self.assertEqual(len(set(a)), 50)
        key = a[0]
        self.assertNotEqual(crn.stream("hillclimb/tests/a", key), crn.stream("hillclimb/tests/b", key))


class DrawLawTest(unittest.TestCase):
    def test_draw_is_the_noise_stream_composition(self):
        seed = crn.stream("hillclimb/tests/draws", 99)
        for i, j in ((0, 0), (0, 5), (3, 1), (17, 40)):
            self.assertEqual(crn.draw(seed, i, j),
                             STREAM.standard_normals(STREAM.shot_seed(seed, i), j))

    def test_block_equals_draw_by_index(self):
        seed = crn.stream("hillclimb/tests/draws", 5)
        block = crn.block(seed, 4, 12)
        self.assertEqual(len(block), 12)
        self.assertEqual(block, [crn.draw(seed, 4, j) for j in range(12)])
        self.assertEqual(crn.block(seed, 4, 12)[7], crn.draw(seed, 4, 7))
        self.assertEqual(len(block[0]), 5)

    def test_decisions_draw_differently(self):
        seed = crn.stream("hillclimb/tests/draws", 5)
        self.assertNotEqual(crn.draw(seed, 0, 0), crn.draw(seed, 1, 0))


class PairedCompareTest(unittest.TestCase):
    BASE = [Fraction(v) for v in (3, 9, 1, 14, 6, 2, 11, 5, 8, 4)]

    def test_pairs_are_kept(self):
        arm = [v + 1 for v in self.BASE]
        delta = crn.paired_compare(self.BASE, arm, mean, seed="hillclimb/tests/pairs",
                                   replicates=300)
        self.assertEqual(delta.point, 1)
        self.assertEqual(delta.interval, (1, 1))
        self.assertEqual((delta.n, delta.replicates, delta.n_undecided), (10, 300, 0))
        self.assertEqual(delta.alpha, Fraction(1, 20))

    def test_replicates_draw_keys_as_the_run_length_estimator_does(self):
        arm = [Fraction(v) for v in (7, 2, 9, 4, 12, 1, 6, 3, 10, 8)]
        zero = [Fraction(0)] * len(arm)
        delta = crn.paired_compare(zero, arm, mean, seed=31, replicates=400)
        alone = RL.summary(arm, mean, 31, measure.ALPHA, 400)
        self.assertEqual(delta.interval, alone["interval"])
        self.assertEqual(delta.point, alone["point"])

    def test_exact_arithmetic(self):
        arm = [v + Fraction(1, 3) for v in self.BASE]
        delta = crn.paired_compare(self.BASE, arm, mean, seed=2, replicates=50)
        self.assertIsInstance(delta.point, Fraction)
        self.assertEqual(delta.point, Fraction(1, 3))

    def test_deterministic_by_seed(self):
        arm = [Fraction(v) for v in (2, 9, 3, 15, 1, 7, 10, 4, 8, 6)]
        one = crn.paired_compare(self.BASE, arm, mean, seed=5, replicates=200)
        two = crn.paired_compare(self.BASE, arm, mean, seed=5, replicates=200)
        self.assertEqual(one, two)

    def test_alpha_moves_the_bounds_inward(self):
        arm = [Fraction(v) for v in (2, 9, 3, 15, 1, 7, 10, 4, 8, 6)]
        wide = crn.paired_compare(self.BASE, arm, mean, seed=5, alpha=Fraction(1, 10),
                                  replicates=200)
        narrow = crn.paired_compare(self.BASE, arm, mean, seed=5, alpha=Fraction(1, 2),
                                    replicates=200)
        self.assertLessEqual(wide.interval[0], narrow.interval[0])
        self.assertGreaterEqual(wide.interval[1], narrow.interval[1])

    def test_refusals(self):
        with self.assertRaises(ValueError):
            crn.paired_compare(self.BASE, self.BASE[:-1], mean, seed=1)
        with self.assertRaises(ValueError):
            crn.paired_compare(self.BASE, self.BASE, mean, seed=None)

    def test_no_records_decide_nothing(self):
        delta = crn.paired_compare([], [], mean, seed=1, replicates=10)
        self.assertIsNone(delta.point)
        self.assertEqual((delta.interval, delta.n), ((-math.inf, math.inf), 0))


def run_value(games):
    """E[L] of (run length, misses) games at m = 4."""
    return RL.run_length_estimate(games, 4)


class PairedInfinityTest(unittest.TestCase):
    def test_one_sided_infinity_sorts_to_its_end(self):
        base = [(5, 0), (7, 0), (2, 0)]  # no miss at all: every replicate is INF
        arm = [(5, 1), (7, 2), (2, 1)]
        delta = crn.paired_compare(base, arm, run_value, seed=3, replicates=40)
        self.assertEqual(delta.point, -math.inf)
        self.assertEqual(delta.interval, (-math.inf, -math.inf))
        self.assertEqual(delta.n_undecided, 0)
        flipped = crn.paired_compare(arm, base, run_value, seed=3, replicates=40)
        self.assertEqual(flipped.interval, (math.inf, math.inf))

    def test_both_infinite_is_undecided(self):
        games = [(4, 0), (9, 0)]
        delta = crn.paired_compare(games, games, run_value, seed=3, replicates=25)
        self.assertIsNone(delta.point)
        self.assertEqual(delta.n_undecided, 25)
        self.assertEqual(delta.interval, (-math.inf, math.inf))

    def test_undecided_replicates_count_against_both_bounds(self):
        base = [(6, 0), (3, 1), (8, 0), (5, 0)]
        arm = [(7, 0), (4, 0), (8, 1), (6, 0)]
        replicates, seed = 80, "hillclimb/tests/undecided"
        delta = crn.paired_compare(base, arm, run_value, seed=seed, replicates=replicates)
        # The law, step by step: n picks of randrange(n) per replicate, both arms at those picks.
        rng, decided, undecided = random.Random(seed), [], 0
        for _ in range(replicates):
            picks = [rng.randrange(len(base)) for _ in range(len(base))]
            a = run_value([arm[i] for i in picks])
            b = run_value([base[i] for i in picks])
            if a == math.inf and b == math.inf:
                undecided += 1
            elif a == math.inf:
                decided.append(math.inf)
            elif b == math.inf:
                decided.append(-math.inf)
            else:
                decided.append(a - b)
        decided.sort()
        low, high = RL.interval_positions(measure.ALPHA, replicates)
        self.assertGreater(undecided, 0)
        self.assertEqual(delta.n_undecided, undecided)
        self.assertEqual(delta.interval, (([-math.inf] * undecided + decided)[low],
                                          (decided + [math.inf] * undecided)[high]))
        self.assertEqual(delta.point, run_value(arm) - run_value(base))


if __name__ == "__main__":
    unittest.main()
