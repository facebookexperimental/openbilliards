# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The convex hull behind rule 7.8's in-the-way test (straightpool.game.interferes): its corners
only, each once, counter-clockwise from the least point in (x, y) order.

The reference is the hull by its definition, checked on points with small integer coordinates,
where every orientation is computed exactly: a directed edge (a, b) of the boundary has every
point strictly on its left or on the segment from a to b, and the corners are met by walking those
edges from the least point.
"""

import random
import unittest

from straightpool import game as rules
from tests.straightpool import support


def orientation(a, b, p):
    """Twice the signed area of the triangle (a, b, p): positive for a counter-clockwise turn."""
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])


def on_segment(a, b, p):
    """True when p, collinear with a and b, is between them (ends included)."""
    return (min(a[0], b[0]) <= p[0] <= max(a[0], b[0])
            and min(a[1], b[1]) <= p[1] <= max(a[1], b[1]))


def hull_by_definition(points):
    """The corners of the convex hull of exact points, by the definition above."""
    pts = sorted(set(points))
    if len(pts) < 3:
        return pts
    following = {}
    for a in pts:
        for b in pts:
            if a != b and all(orientation(a, b, p) > 0
                              or (orientation(a, b, p) == 0 and on_segment(a, b, p))
                              for p in pts):
                following[a] = b
    corners = [pts[0]]
    while following[corners[-1]] != corners[0]:
        corners.append(following[corners[-1]])
    return corners


def lattice_sets(seed_text, count, side, most):
    """`count` random point lists on a side x side lattice (as floats), 0 to `most` points each:
    small lattices give many repeated and collinear points."""
    rng = random.Random(seed_text)
    return [[(float(rng.randrange(side)), float(rng.randrange(side)))
             for _ in range(rng.randrange(most + 1))] for _ in range(count)]


class HullTest(unittest.TestCase):
    def test_corners_only_counter_clockwise_from_the_least_point(self):
        square = [(2.0, 2.0), (0.0, 0.0), (2.0, 0.0), (0.0, 2.0)]
        edges = [(1.0, 0.0), (2.0, 1.0), (1.0, 2.0), (0.0, 1.0)]
        inside = [(1.0, 1.0), (0.5, 1.5), (1.5, 0.25)]
        self.assertEqual(rules._hull(square + edges + inside),
                         [(0.0, 0.0), (2.0, 0.0), (2.0, 2.0), (0.0, 2.0)])

    def test_repeats_collinear_sets_and_small_sets(self):
        self.assertEqual(rules._hull([]), [])
        self.assertEqual(rules._hull([(1.0, 1.0)]), [(1.0, 1.0)])
        self.assertEqual(rules._hull([(1.0, 1.0), (1.0, 1.0), (1.0, 1.0)]), [(1.0, 1.0)])
        self.assertEqual(rules._hull([(2.0, 0.0), (0.0, 0.0), (2.0, 0.0)]),
                         [(0.0, 0.0), (2.0, 0.0)])
        line = [(3.0, 3.0), (0.0, 0.0), (1.0, 1.0), (2.0, 2.0), (1.0, 1.0)]
        self.assertEqual(rules._hull(line), [(0.0, 0.0), (3.0, 3.0)])
        triangle = [(0.0, 0.0), (4.0, 0.0), (0.0, 3.0), (0.0, 0.0), (2.0, 0.0), (0.0, 1.5)]
        self.assertEqual(rules._hull(triangle), [(0.0, 0.0), (4.0, 0.0), (0.0, 3.0)])

    def test_the_hull_equals_its_definition_on_lattice_points(self):
        cases = (lattice_sets("hillclimb/tests/straightpool/hull/small", 400, 4, 12)
                 + lattice_sets("hillclimb/tests/straightpool/hull/wide", 400, 9, 25))
        for i, points in enumerate(cases):
            with self.subTest(case=i):
                self.assertEqual(rules._hull(points), hull_by_definition(points))

    def test_the_input_order_does_not_matter(self):
        rng = random.Random("hillclimb/tests/straightpool/hull/order")
        for points in lattice_sets("hillclimb/tests/straightpool/hull/order", 100, 7, 20):
            shuffled = list(points)
            rng.shuffle(shuffled)
            self.assertEqual(rules._hull(shuffled), rules._hull(points))

    def test_every_slot_of_a_rack_is_within_the_hull_of_the_slots(self):
        for i in range(len(support.DATA["slots"])):
            slots = support.slots(i)
            hull = rules._hull(slots)
            with self.subTest(rack=i):
                self.assertGreaterEqual(len(hull), 3)
                self.assertEqual(hull[0], min(slots))
                self.assertTrue(set(hull) <= set(slots))
                for j, corner in enumerate(hull):
                    following = hull[(j + 1) % len(hull)]
                    after = hull[(j + 2) % len(hull)]
                    self.assertGreater(orientation(corner, following, after), 0.0)
                for slot in slots:
                    self.assertLess(rules._distance_to_hull(slot, hull), 1e-12)


if __name__ == "__main__":
    unittest.main()
