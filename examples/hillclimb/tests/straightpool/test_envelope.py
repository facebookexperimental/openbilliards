# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The actuation envelope: the boxes, the clamp, the predicate, the re-seed, the decision kind."""

import math
import random
import unittest

from hillclimb.adapter import Stroke
from straightpool import envelope
from tests.straightpool import support


def random_strokes(n):
    rng = random.Random("hillclimb/tests/straightpool/envelope")
    out = []
    for _ in range(n):
        v0, phi, theta = -2 + 18 * rng.random(), -10 + 20 * rng.random(), -0.5 + 2.5 * rng.random()
        out.append(Stroke(v0, phi, theta, -1 + 2 * rng.random(), -1 + 2 * rng.random()))
    return out


class BoxTest(unittest.TestCase):
    def test_the_two_versions(self):
        v1, v2 = envelope.of("v1"), envelope.of("v2")
        self.assertEqual((v1.v0_min, v1.v0_max, v1.v0_max_break, v1.theta_max_deg, v1.tip_max),
                         (0.5, 12.0, 12.0, 89.0, 0.5))
        self.assertEqual((v2.v0_min, v2.v0_max, v2.v0_max_break, v2.theta_max_deg, v2.tip_max),
                         (0.5, 12.0, 13.4, 89.0, 0.5))
        self.assertEqual(v2.v0_cap("break"), 13.4)
        self.assertEqual(v2.v0_cap("t14"), 12.0)
        self.assertEqual(v1.v0_cap("break"), 12.0)
        with self.assertRaises(KeyError):
            envelope.of("v3")

    def test_clamp_lands_inside_and_is_idempotent(self):
        for env in (envelope.V1, envelope.V2):
            for kind in envelope.KINDS:
                for stroke in random_strokes(400):
                    clamped = envelope.clamp(env, stroke, kind)
                    self.assertTrue(envelope.inside(env, clamped, kind))
                    self.assertEqual(envelope.clamp(env, clamped, kind), clamped)
                    self.assertEqual(clamped.phi, stroke.phi)

    def test_the_tip_is_clamped_radially(self):
        clamped = envelope.clamp(envelope.V1, Stroke(3.0, 1.0, 0.0, 0.6, 0.8))
        self.assertLessEqual(math.hypot(clamped.a, clamped.b), 0.5)
        self.assertAlmostEqual(math.hypot(clamped.a, clamped.b), 0.5, places=12)
        self.assertAlmostEqual(clamped.a / clamped.b, 0.75, places=12)
        inside = Stroke(3.0, 1.0, 0.0, 0.3, -0.2)
        self.assertEqual(envelope.clamp(envelope.V1, inside), inside)

    def test_the_break_row(self):
        fast = Stroke(14.0, 2.0)
        self.assertEqual(envelope.clamp(envelope.V2, fast, "break").v0, 13.4)
        self.assertEqual(envelope.clamp(envelope.V2, fast, "other").v0, 12.0)
        self.assertEqual(envelope.clamp(envelope.V1, fast, "break").v0, 12.0)
        self.assertTrue(envelope.inside(envelope.V2, Stroke(13.0, 2.0), "break"))
        self.assertFalse(envelope.inside(envelope.V2, Stroke(13.0, 2.0), "t14"))
        self.assertFalse(envelope.inside(envelope.V1, Stroke(13.0, 2.0), "break"))

    def test_inside_bounds_and_the_floor(self):
        self.assertTrue(envelope.inside(envelope.V1, Stroke(0.5, 0.0)))
        self.assertFalse(envelope.inside(envelope.V1, Stroke(0.49, 0.0)))
        self.assertFalse(envelope.inside(envelope.V1, Stroke(2.0, 0.0, math.radians(89.5))))
        self.assertTrue(envelope.inside(envelope.V1, Stroke(2.0, 0.0, math.radians(89.0))))
        level = Stroke(2.0, 0.0, 0.0)
        self.assertTrue(envelope.inside(envelope.V1, level, floor_deg=0.0))
        self.assertFalse(envelope.inside(envelope.V1, level, floor_deg=3.0))
        self.assertFalse(envelope.inside(envelope.V1, level, floor_deg=float("nan")))
        self.assertEqual(len(envelope.clamp(envelope.V1, [2.0, 0.1, 0.0, 0.0, 0.0]).as_tuple()), 5)
        with self.assertRaises(ValueError):
            envelope.inside(envelope.V1, [2.0, 0.1, 0.0])

    def test_reseed_raises_theta_to_the_floor_plus_the_margin(self):
        low = Stroke(2.0, 1.0, math.radians(1.0), 0.1, 0.0)
        raised = envelope.reseed(low, 4.0)
        self.assertEqual(raised.theta, math.radians(4.0 + envelope.RESEED_MARGIN_DEG))
        self.assertEqual((raised.v0, raised.phi, raised.a, raised.b), (2.0, 1.0, 0.1, 0.0))
        self.assertEqual(envelope.reseed(low, 0.5), low)
        self.assertTrue(envelope.inside(envelope.V1, raised, floor_deg=4.0))


class KindTest(unittest.TestCase):
    def test_decision_kinds(self):
        two = support.game_of({0: (0.0, -0.5), 3: (0.2, 0.2), 9: (-0.3, 0.6)})
        self.assertEqual(envelope.decision_kind(two), "t14")
        many = support.game_of({0: (0.0, -0.5), 3: (0.2, 0.2), 9: (-0.3, 0.6), 11: (0.3, 0.9)})
        self.assertEqual(envelope.decision_kind(many), "other")
        fresh = support.game_of({0: (0.0, -0.5), 3: (0.2, 0.2), 9: (-0.3, 0.6)})
        from dataclasses import replace
        self.assertEqual(envelope.decision_kind(replace(fresh, rack_untouched=True)), "break")


if __name__ == "__main__":
    unittest.main()
