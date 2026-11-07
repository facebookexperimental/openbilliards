# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Tests for run_length.py: standard library only, made-up numbers, no simulator."""
import contextlib
import io
import os
import random
import re
import statistics
import sys
import unittest
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run_length as rl  # noqa: E402

GAMES = [(12, 9), (30, 4), (7, 15), (21, 6), (0, 8), (44, 3)]  # (run length, misses), made up


def estimate(m):
    return lambda draw: rl.run_length_estimate(draw, m)


def recount(games, seed, m, replicates):
    """An independent recount of the bootstrap: plain loops, one randrange a pick."""
    rng, vals = random.Random(seed), []
    for _r in range(replicates):
        total, misses = 0, 0
        for _i in range(len(games)):
            n, x = games[rng.randrange(len(games))]
            total, misses = total + n, misses + x
        vals.append(Fraction(m * total, misses) if misses else rl.INF)
    return sorted(vals)


class Estimates(unittest.TestCase):
    def test_exact_ratio_and_inf(self):
        self.assertEqual(rl.run_length_estimate(GAMES), Fraction(128 * 114, 45))
        self.assertEqual(rl.run_length_estimate([(10, 3), (20, 5)], m=64), 240)
        self.assertIs(rl.run_length_estimate([(9, 0), (4, 0)]), rl.INF)

    def test_m_one_with_the_deaths_is_the_capped_estimate(self):
        games = [(7, 1), (12, 0), (5, 1)]  # the second run was stopped by its cap
        self.assertEqual(rl.run_length_estimate(games, m=1), 12)

    def test_bad_input(self):
        for games, m in (([(3, -1)], 8), ([(-2, 1)], 8), (GAMES, 0), (GAMES, 2.5)):
            with self.assertRaises(ValueError):
                rl.run_length_estimate(games, m)

    def test_survival(self):
        self.assertEqual(rl.survival_numerator([0, 1, 2], horizon=3, m=4), 24)
        self.assertEqual(rl.survival_numerator([1, 4], horizon=2, m=4), 0)  # no success: product 0
        self.assertEqual(rl.survival_estimate([24, 64], horizon=3, m=4), Fraction(88, 128))
        self.assertIsNone(rl.survival_estimate([], horizon=3, m=4))
        for misses in ([0, 1], [0, 1, 5], [0, -1, 2]):
            with self.assertRaises(ValueError):
                rl.survival_numerator(misses, horizon=3, m=4)

    def test_extinction_before_the_horizon(self):
        # all m re-simulations of a stroke miss: no continuation, so the list stops at its first m
        self.assertEqual(rl.survival_numerator([4], horizon=3, m=4), 0)
        self.assertEqual(rl.survival_numerator([0, 3, 1, 4], horizon=45, m=4), 0)
        for misses in ([4, 1], [4, 4], [0, 4, 0], [4, 1, 4], [0, 1], []):  # m before the end, or none
            with self.assertRaises(ValueError):
                rl.survival_numerator(misses, horizon=5, m=4)
        for misses, y in (([0, 1, 2], 24), ([4, 1, 2], 0), ([1, 2, 4], 0), ([0, 0, 0], 64)):
            self.assertEqual(rl.survival_numerator(misses, horizon=3, m=4), y)  # full length: as before
        with self.assertRaises(ValueError):
            rl.survival_numerator([0, 1, 2, 4], horizon=3, m=4)  # longer than the horizon

    def test_counts_are_nonnegative_integers(self):
        # checked before any int(): a negative or fractional count refuses, never truncates
        calls = {"run length": lambda x: rl.run_length_estimate([(12, 9), (x, 4)], m=8),
                 "miss total": lambda x: rl.run_length_estimate([(12, 9), (30, x)], m=8),
                 "miss count": lambda x: rl.survival_numerator([0, x, 1], horizon=3, m=4),
                 "numerator": lambda x: rl.survival_estimate([24, x], horizon=3, m=4),
                 "horizon": lambda x: rl.survival_estimate([24], horizon=x, m=4)}
        for name, call in calls.items():
            for bad in (-1, 2.5, -0.5):
                with self.subTest(input=name, count=bad):
                    with self.assertRaises(ValueError):
                        call(bad)
        whole = [(12.0, 9), (30, Fraction(4))]  # integral values pass, as for m
        self.assertEqual(rl.run_length_estimate(whole, m=8), Fraction(8 * 42, 13))
        self.assertEqual(rl.survival_numerator([0.0, 1, 2], horizon=3.0, m=4), 24)
        self.assertEqual(rl.survival_estimate([24, 64.0], horizon=3, m=4), Fraction(88, 128))


class Bootstrap(unittest.TestCase):
    def test_exact_positions(self):
        self.assertEqual(rl.upper_position(Fraction(1, 10), 999), 899)  # ceil(899.1) - 1
        self.assertEqual(rl.interval_positions(Fraction(1, 10), 999), (49, 949))
        self.assertEqual(rl.upper_position("0.05", 200), 189)
        self.assertEqual(rl.interval_positions(replicates=200), (5, 194))

    def test_matches_an_independent_recount(self):
        boot = rl.bootstrap(GAMES, estimate(128), "recount", 300)
        self.assertEqual(boot["sorted"], recount(GAMES, "recount", 128, 300))
        self.assertEqual(boot, rl.bootstrap(GAMES, estimate(128), "recount", 300))
        self.assertNotEqual(boot["sorted"], rl.bootstrap(GAMES, estimate(128), "other", 300)["sorted"])

    def test_inf_sorts_last(self):
        boot = rl.bootstrap([(50, 0)] * 9 + [(50, 128)], estimate(128), 7, 400)
        n = boot["n_inf"]
        self.assertTrue(0 < n < 400)
        self.assertTrue(all(v == rl.INF for v in boot["sorted"][-n:]))
        self.assertTrue(all(v != rl.INF for v in boot["sorted"][:-n]))
        self.assertIs(rl.at(boot, 400), rl.INF)
        self.assertIs(rl.at(boot, -1), rl.INF)

    def test_seed_and_empty_input(self):
        with self.assertRaises(ValueError):
            rl.bootstrap(GAMES, estimate(128), None, 10)
        self.assertEqual(rl.bootstrap([], estimate(128), 3, 10)["sorted"], [])

    def test_sd_is_exact_and_rounded_up(self):
        self.assertEqual(rl.sqrt_ceil(Fraction(9, 4)), Fraction(3, 2))
        r = rl.sqrt_ceil(2)
        self.assertTrue(r * r >= 2 > (r - Fraction(1, 10 ** 12)) ** 2)
        boot = rl.bootstrap(GAMES, estimate(128), "sd", 500)
        finite = [float(v) for v in boot["sorted"] if v != rl.INF]
        sd = float(rl.bootstrap_sd(boot))
        self.assertAlmostEqual(sd, statistics.stdev(finite), delta=1e-9 * max(finite))
        self.assertIsNone(rl.bootstrap_sd({"sorted": [Fraction(3), rl.INF]}))

    def test_summary(self):
        s = rl.summary(GAMES, estimate(128), "summary", replicates=400)
        boot = rl.bootstrap(GAMES, estimate(128), "summary", 400)
        lo, hi = rl.interval_positions(rl.ALPHA, 400)
        self.assertEqual(s["point"], rl.run_length_estimate(GAMES))
        self.assertEqual(s["interval"], (rl.at(boot, lo), rl.at(boot, hi)))
        self.assertEqual(s["upper"], rl.at(boot, rl.upper_position(rl.ALPHA, 400)))
        self.assertEqual((s["sd"], s["n_inf"], s["units"]), (rl.bootstrap_sd(boot), boot["n_inf"], 6))
        ys = [rl.survival_numerator(x, 3, m=4) for x in ([0, 0, 1], [1, 2, 0], [0, 4, 0], [2, 1, 1])]
        p = rl.summary(ys, lambda d: rl.survival_estimate(d, 3, m=4), seed=11, replicates=200)
        self.assertEqual(p["point"], Fraction(sum(ys), 4 * 4 ** 3))
        self.assertTrue(0 <= p["interval"][0] <= p["interval"][1] <= 1)


class Bars(unittest.TestCase):
    def test_exact_bar(self):
        x = rl.run_length_estimate([(25, 6)], m=4)  # 4 * 25 / 6 = 50 / 3 exactly
        self.assertTrue(rl.meets_bar(x, Fraction(50, 3)))
        self.assertFalse(rl.below_bar(x, Fraction(50, 3)))  # equal is not below
        self.assertTrue(rl.below_bar(rl.run_length_estimate([(25, 7)], m=4), "50/3"))
        for v in (rl.INF, None):  # INF and None decide no bar
            self.assertFalse(rl.meets_bar(v, 1) or rl.below_bar(v, 1))

    def test_power_bar(self):
        root_half = (Fraction(1, 2), Fraction(1, 2))  # sqrt(1/2) = 0.70710678...
        self.assertFalse(rl.meets_bar(Fraction(7071, 10 ** 4), root_half))
        self.assertTrue(rl.below_bar(Fraction(7071, 10 ** 4), root_half))
        self.assertTrue(rl.meets_bar(Fraction(7072, 10 ** 4), root_half))
        self.assertTrue(rl.meets_bar(Fraction(2, 3), (Fraction(2, 3), 1)))  # an integer exponent
        self.assertTrue(rl.below_bar(Fraction(1, 3), (Fraction(2, 3), Fraction(5, 2))))  # 0.333 < 0.363
        with self.assertRaises(ValueError):
            rl.meets_bar(Fraction(1, 2), (Fraction(1, 2), -1))
        with self.assertRaises(TypeError):  # a float exponent is refused; give it exactly
            rl.meets_bar(Fraction(1, 2), (Fraction(2, 3), 0.7))
        self.assertTrue(rl.below_bar(Fraction(3, 4), (Fraction(2, 3), "0.7")))  # (2/3) ** 0.7 = 0.7529


class Readme(unittest.TestCase):
    def test_the_example_prints_what_the_readme_shows(self):
        with open(os.path.join(HERE, "README.md"), encoding="utf-8") as fh:
            text = fh.read()
        pattern = r"```python\n(.*?)```\n\nIt prints:\n\n```\n(.*?)```"
        code, shown = re.search(pattern, text, re.S).groups()
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            exec(compile(code, "README.md", "exec"), {})
        self.assertEqual(out.getvalue(), shown)


if __name__ == "__main__":
    unittest.main()
