# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Stroke noise: the Stroke-typed forms equal the hand noise law's own functions."""

import math
import unittest

from hillclimb import _siblings, noise
from hillclimb.adapter import Stroke

LAW = _siblings.load("hand_noise_law")
STREAM = _siblings.load("noise_stream")

STROKES = [Stroke(2.5, 1.2, 0.05, 0.1, -0.2), Stroke(14.99, 6.2, 0.0, -0.3, 0.38),
           Stroke(0.02, -0.4, 1.56, 0.0, 0.0)]


class ReexportTest(unittest.TestCase):
    def test_the_law_and_the_stream(self):
        self.assertEqual(noise.SIGMA_1X, LAW.SIGMA_1X)
        self.assertEqual(noise.LAW_ID, LAW.LAW_ID)
        self.assertIs(noise.standard_normals, STREAM.standard_normals)
        self.assertIs(noise.shot_seed, STREAM.shot_seed)
        self.assertIs(noise.project_stroke, LAW.project_stroke)


class PerturbTest(unittest.TestCase):
    def test_equals_noisy_stroke_then_projection(self):
        for k, stroke in enumerate(STROKES):
            eps = STREAM.standard_normals(1000 + k, 3)
            for r in (0.1, 0.4, 1.0, 25.0):
                for shape in ("off", "tip+speed"):
                    want = LAW.project_stroke(LAW.noisy_stroke(stroke.as_tuple(), eps, r, shape))
                    got = noise.perturb(stroke, eps, r, shape)
                    self.assertIsInstance(got, Stroke)
                    self.assertEqual(got.as_tuple(), want)

    def test_level_zero_only_projects(self):
        eps = STREAM.standard_normals(5, 0)
        stroke = Stroke(20.0, -1.0, -0.1, 0.4, 0.4)
        self.assertEqual(noise.perturb(stroke, eps, 0.0).as_tuple(),
                         LAW.project_stroke(stroke.as_tuple()))
        inside = Stroke(2.0, 1.0, 0.1, -0.0, 0.0)
        self.assertEqual(math.copysign(1.0, noise.perturb(inside, eps, 0.0).a), -1.0)

    def test_accepts_five_numbers(self):
        eps = STREAM.standard_normals(9, 1)
        self.assertEqual(noise.perturb([2.0, 1.0, 0.1, 0.0, 0.0], eps, 0.4),
                         noise.perturb(Stroke(2.0, 1.0, 0.1), eps, 0.4))


class ExecuteTest(unittest.TestCase):
    def test_equals_the_laws_executor(self):
        for r in (0.1, 1.0):
            run = LAW.make_executor(r, "off")
            for k, stroke in enumerate(STROKES):
                place = (0.3 - 0.1 * k, -0.9 + 0.2 * k)
                want = run(77, k, list(stroke.as_tuple()) + list(place))
                got, placed = noise.execute(stroke, 77, k, r, place=place)
                self.assertEqual(got.as_tuple() + placed, want)

    def test_placement_is_copied_or_absent(self):
        stroke, place = STROKES[0], (0.25, -0.75)
        executed, placed = noise.execute(stroke, 3, 2, 0.4, place=place)
        self.assertEqual(placed, place)
        bare, none = noise.execute(stroke, 3, 2, 0.4)
        self.assertIsNone(none)
        self.assertEqual(bare, executed)

    def test_execute_draws_the_streams_normals(self):
        stroke = Stroke(3.0, 0.5, 0.2, 0.1, 0.1)
        eps = STREAM.standard_normals(42, 6)
        executed, _ = noise.execute(stroke, 42, 6, 0.4)
        self.assertEqual(executed, noise.perturb(stroke, eps, 0.4))

    def test_level_zero_evaluates_the_noise_term(self):
        stroke = Stroke(2.0, 1.0, 0.1, -0.0, 0.0)
        executed, _ = noise.execute(stroke, 1, 0, 0.0)
        self.assertGreater(STREAM.standard_normals(1, 0)[3], 0.0)  # so -0.0 + 0.0 * eps is 0.0
        self.assertEqual(math.copysign(1.0, executed.a), 1.0)
        self.assertEqual(executed.as_tuple(),
                         LAW.make_executor(0.0, "off")(1, 0, list(stroke.as_tuple()) + [0, 0])[:5])


if __name__ == "__main__":
    unittest.main()
